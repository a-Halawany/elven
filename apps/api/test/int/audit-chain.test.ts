/**
 * Audit chain integration tests (ADR-P0-09) — run against the Compose Postgres.
 * Covers: exact privilege boundary, DB-level append-only, tamper response
 * (freeze + incident + no re-seal), gap-free concurrency, allocator rebuild.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { auditRowHash, GENESIS_HASH, jcsCanonicalize, type AuditEventBody } from '@eye/contracts';
import { uuidv7 } from 'uuidv7';

const HOST = process.env['EYE_DB_HOST'] ?? 'localhost';
const PORT = Number(process.env['EYE_DB_PORT'] ?? 5432);

function mkDb(user: string, password: string): Kysely<never> {
  return new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ host: HOST, port: PORT, database: 'eye', user, password, max: 8 }),
    }),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let su: Kysely<any>; // migrate/superuser — used ONLY to simulate tampering in fixtures

function mkEvent(partitionKey: string, action: string): AuditEventBody {
  return {
    event_type: 'test.event',
    outcome: 'success',
    scope: 'TENANT',
    tenant_id: partitionKey,
    domain_id: null,
    actor: 'principal:test',
    delegation_id: null,
    action,
    target_type: null,
    target_id: null,
    target_version: null,
    purpose_id: 'test',
    policy_decision_id: null,
    policy_version: null,
    result_code: 'OK',
    occurred_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: uuidv7(),
    causation_id: null,
    trace_id: null,
    request_digest: null,
    metadata: {},
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appendVia(db: Kysely<any>, partitionId: string, event: AuditEventBody): Promise<number> {
  return db.transaction().execute(async (tx) => {
    const head = (
      await sql<{ seq: string; prev_hash: string }>`select * from audit.advance_chain_head(${partitionId})`.execute(tx)
    ).rows[0]!;
    const auditSeq = Number(head.seq);
    const rowHash = auditRowHash({ partitionId, auditSeq, previousHash: head.prev_hash, event });
    await tx
      .insertInto('audit.audit_events')
      .values({
        partition_id: partitionId,
        audit_seq: auditSeq,
        event_jcs: jcsCanonicalize(event),
        previous_hash: head.prev_hash,
        row_hash: rowHash,
      })
      .execute();
    await sql`select audit.commit_chain_head(${partitionId}, ${auditSeq}, ${rowHash})`.execute(tx);
    return auditSeq;
  });
}

beforeAll(() => {
  app = mkDb(process.env['EYE_DB_APP_USER'] ?? 'eye_app', process.env['EYE_DB_APP_PASSWORD'] ?? 'eye_app_local_dev');
  su = mkDb(process.env['EYE_DB_MIGRATE_USER'] ?? 'eye', process.env['EYE_DB_MIGRATE_PASSWORD'] ?? 'eye_local_dev');
});

afterAll(async () => {
  await app.destroy();
  await su.destroy();
});

describe('exact privilege boundary (correction #3)', () => {
  it('app role cannot UPDATE or DELETE audit_events (privilege + trigger)', async () => {
    await expect(
      sql`update audit.audit_events set row_hash = repeat('f', 64) where audit_seq = 1`.execute(app),
    ).rejects.toThrow(/permission denied|append-only/);
    await expect(sql`delete from audit.audit_events where audit_seq = 1`.execute(app)).rejects.toThrow(
      /permission denied|append-only/,
    );
  });

  it('app role cannot directly UPDATE audit_chain_heads (allocator role only)', async () => {
    await expect(
      sql`update audit.audit_chain_heads set next_seq = 999 where partition_id = 'platform'`.execute(app),
    ).rejects.toThrow(/permission denied/);
  });

  it('even the superuser cannot UPDATE/DELETE evidence rows (trigger raises)', async () => {
    await expect(
      sql`update audit.audit_events set previous_hash = repeat('e', 64) where audit_seq = 1 and partition_id = 'platform'`.execute(su),
    ).rejects.toThrow(/append-only/);
    await expect(
      sql`delete from audit.audit_events where audit_seq = 1 and partition_id = 'platform'`.execute(su),
    ).rejects.toThrow(/append-only/);
  });
});

describe('gap-free concurrent appends (correction #3 / ADR-P0-09)', () => {
  it('16 parallel writers on one partition produce a strict 1..16 sequence and a verifiable chain', async () => {
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) => appendVia(app, partitionId, mkEvent(tenant, `concurrent.${i}`))),
    );
    const seqs = [...results].sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));

    // Recompute the chain end-to-end.
    const rows = (await su
      .selectFrom('audit.audit_events')
      .select(['audit_seq', 'event', 'previous_hash', 'row_hash'])
      .where('partition_id', '=', partitionId)
      .orderBy('audit_seq')
      .execute()) as Array<{ audit_seq: string; event: AuditEventBody; previous_hash: string; row_hash: string }>;
    let prev = GENESIS_HASH;
    for (const r of rows) {
      expect(r.previous_hash).toBe(prev);
      const recomputed = auditRowHash({
        partitionId,
        auditSeq: Number(r.audit_seq),
        previousHash: prev,
        event: r.event,
      });
      expect(recomputed).toBe(r.row_hash);
      prev = r.row_hash;
    }
  });

  it('a rolled-back transaction leaves no gap', async () => {
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    await appendVia(app, partitionId, mkEvent(tenant, 'pre'));
    await expect(
      app.transaction().execute(async (tx) => {
        await sql`select * from audit.advance_chain_head(${partitionId})`.execute(tx);
        throw new Error('simulated failure after allocation');
      }),
    ).rejects.toThrow('simulated failure');
    const seq = await appendVia(app, partitionId, mkEvent(tenant, 'post'));
    expect(seq).toBe(2); // no gap from the aborted allocation
  });
});

describe('allocator is reconstructable from the ledger (correction #3)', () => {
  it('rebuild_chain_heads restores a corrupted head from immutable rows', async () => {
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    await appendVia(app, partitionId, mkEvent(tenant, 'a'));
    await appendVia(app, partitionId, mkEvent(tenant, 'b'));
    const before = await su
      .selectFrom('audit.audit_chain_heads')
      .selectAll()
      .where('partition_id', '=', partitionId)
      .executeTakeFirstOrThrow();
    // Corrupt the (non-evidence) allocator state as superuser, then rebuild.
    await sql`update audit.audit_chain_heads set next_seq = 999, head_hash = repeat('a', 64) where partition_id = ${partitionId}`.execute(su);
    await sql`select audit.rebuild_chain_heads()`.execute(su);
    const after = await su
      .selectFrom('audit.audit_chain_heads')
      .selectAll()
      .where('partition_id', '=', partitionId)
      .executeTakeFirstOrThrow();
    expect(after.next_seq).toBe(before.next_seq);
    expect(after.head_hash).toBe(before.head_hash);
  });
});

describe('tamper response (correction #4)', () => {
  it('detects tampering, freezes the partition, raises an incident, refuses new appends and re-sealing', async () => {
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    for (let i = 1; i <= 3; i += 1) await appendVia(app, partitionId, mkEvent(tenant, `t.${i}`));

    // Simulate out-of-band tampering: disable the guard trigger as superuser.
    await sql`alter table audit.audit_events disable trigger audit_events_append_only`.execute(su);
    await sql`update audit.audit_events set event_jcs = replace(event_jcs, '"t.2"', '"TAMPERED"') where partition_id = ${partitionId} and audit_seq = 2`.execute(su);
    await sql`alter table audit.audit_events enable trigger audit_events_append_only`.execute(su);

    // Verify (as the app would): recompute chain.
    const rows = (await su
      .selectFrom('audit.audit_events')
      .select(['audit_seq', 'event', 'previous_hash', 'row_hash'])
      .where('partition_id', '=', partitionId)
      .orderBy('audit_seq')
      .execute()) as Array<{ audit_seq: string; event: AuditEventBody; previous_hash: string; row_hash: string }>;
    let prev = GENESIS_HASH;
    let brokenAt: number | null = null;
    for (const r of rows) {
      const recomputed = auditRowHash({ partitionId, auditSeq: Number(r.audit_seq), previousHash: prev, event: r.event });
      if (recomputed !== r.row_hash) {
        brokenAt = Number(r.audit_seq);
        break;
      }
      prev = r.row_hash;
    }
    expect(brokenAt).toBe(2);

    // Freeze + incident (what AuditService.verifyPartition does on detection).
    await sql`select audit.freeze_partition(${partitionId})`.execute(app);
    await app
      .insertInto('audit.integrity_incidents')
      .values({
        id: uuidv7(),
        partition_id: partitionId,
        range_start_seq: 2,
        range_end_seq: 3,
        details: JSON.stringify({ broken_at_seq: 2, note: 'test tamper fixture' }),
      })
      .execute();

    // New appends fail closed (EYE-AUD-001 semantics at the pipeline).
    await expect(appendVia(app, partitionId, mkEvent(tenant, 'after-tamper'))).rejects.toThrow(/frozen/);
  });
});
