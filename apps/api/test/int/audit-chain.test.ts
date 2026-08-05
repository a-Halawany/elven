/**
 * Audit chain integration tests (ADR-P0-09, remediation R2) — run against the
 * Compose Postgres, through the REAL append port (appendAuditEvent →
 * audit.append_event) and the REAL AuditService.verifyPartition() /
 * sealPartition() implementations. Covers: exact privilege boundary, DB-level
 * append-only, tamper response (atomic freeze+incident, no re-seal), gap-free
 * concurrency, allocator rebuild, and (mandated 10) concurrent append vs
 * verify/seal.
 */
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { auditRowHash, GENESIS_HASH, type AuditEventBody } from '@eye/contracts';
import { uuidv7 } from 'uuidv7';
import { appDb, superDb, systemDb, type AnyDb } from './helpers.js';
import { appendAuditEvent } from '../../src/audit/internal/audit-append.port.js';
import { AuditService } from '../../src/audit/audit.service.js';

let app: AnyDb;
let su: AnyDb; // migrate/superuser — used ONLY to simulate out-of-band tampering
let system: AnyDb;
let audit: AuditService;

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
  } as unknown as AuditEventBody;
}

/** Append through the REAL port on the system pool (PLATFORM system context). */
async function appendReal(tenantKey: string, action: string): Promise<number> {
  return system.transaction().execute(async (tx) => {
    await sql`select public.eye_set_system_context('audit-chain test append')`.execute(tx);
    const ref = await appendAuditEvent(tx as never, { ...mkEvent(tenantKey, action), metadata: {} } as AuditEventBody);
    return ref.auditSeq;
  });
}

beforeAll(() => {
  app = appDb();
  su = superDb();
  system = systemDb();
  audit = new AuditService(app as never, system as never);
});

afterAll(async () => {
  await app.destroy();
  await su.destroy();
  await system.destroy();
});

describe('exact privilege boundary', () => {
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
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    await appendReal(tenant, 'superuser.tamper.target');
    await expect(
      sql`update audit.audit_events set previous_hash = repeat('e', 64) where audit_seq = 1 and partition_id = ${partitionId}`.execute(su),
    ).rejects.toThrow(/append-only/);
    await expect(
      sql`delete from audit.audit_events where audit_seq = 1 and partition_id = ${partitionId}`.execute(su),
    ).rejects.toThrow(/append-only/);
  });
});

describe('gap-free concurrent appends (ADR-P0-09)', () => {
  it('16 parallel writers on one partition produce a strict 1..16 sequence and a verifiable chain', async () => {
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) => appendReal(tenant, `concurrent.${i}`)),
    );
    const seqs = [...results].sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));

    // The REAL verifier agrees.
    const report = await audit.verifyPartition(partitionId);
    expect(report.ok).toBe(true);
    expect(report.checked).toBe(16);
    expect(report.headMatches).toBe(true);
  });

  it('a rolled-back transaction leaves no gap', async () => {
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    await appendReal(tenant, 'pre');
    await expect(
      system.transaction().execute(async (tx) => {
        await sql`select public.eye_set_system_context('rollback test')`.execute(tx);
        await sql`select * from audit.advance_chain_head(${partitionId})`.execute(tx);
        throw new Error('simulated failure after allocation');
      }),
    ).rejects.toThrow('simulated failure');
    const seq = await appendReal(tenant, 'post');
    expect(seq).toBe(2); // no gap from the aborted allocation
  });
});

describe('allocator is reconstructable from the ledger', () => {
  it('rebuild_chain_heads restores a corrupted head from immutable rows', async () => {
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    await appendReal(tenant, 'a');
    await appendReal(tenant, 'b');
    const before = await su
      .selectFrom('audit.audit_chain_heads')
      .selectAll()
      .where('partition_id', '=', partitionId)
      .executeTakeFirstOrThrow();
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

describe('tamper response — REAL AuditService.verifyPartition()', () => {
  it('detects tampering, freezes + records the incident ATOMICALLY, refuses appends and sealing', async () => {
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    for (let i = 1; i <= 3; i += 1) await appendReal(tenant, `t.${i}`);

    // Out-of-band tampering (superuser disables the guard trigger).
    await sql`alter table audit.audit_events disable trigger audit_events_append_only`.execute(su);
    await sql`update audit.audit_events set event_jcs = replace(event_jcs, '"t.2"', '"TAMPERED"') where partition_id = ${partitionId} and audit_seq = 2`.execute(su);
    await sql`alter table audit.audit_events enable trigger audit_events_append_only`.execute(su);

    const report = await audit.verifyPartition(partitionId);
    expect(report.ok).toBe(false);
    expect(report.brokenAtSeq).toBe(2);
    expect(report.incidentId).not.toBeNull();

    // Freeze and incident landed together (the definer port is atomic).
    const head = await su
      .selectFrom('audit.audit_chain_heads').selectAll()
      .where('partition_id', '=', partitionId).executeTakeFirstOrThrow();
    expect(head.frozen).toBe(true);
    const incidents = await su
      .selectFrom('audit.integrity_incidents').selectAll()
      .where('partition_id', '=', partitionId).execute();
    expect(incidents).toHaveLength(1);

    // New appends fail closed; the REAL sealer refuses the tampered range.
    await expect(appendReal(tenant, 'after-tamper')).rejects.toThrow(/frozen/);
    const seal = await audit.sealPartition(partitionId, 'test-sealer');
    expect(seal.sealed).toBe(false);
    expect(seal.reason).toMatch(/verification failed|integrity incident|frozen/);
  });
});

describe('mandated 10 — concurrent append vs REAL verify/seal', () => {
  it('an append storm never yields a false tamper verdict, and every seal covers exactly a verified head', async () => {
    const tenant = uuidv7();
    const partitionId = `tenant:${tenant}`;
    await appendReal(tenant, 'seed');

    const APPENDERS = 6;
    const PER_APPENDER = 10;
    let appended = 1;
    const appenders = Array.from({ length: APPENDERS }, (_, a) =>
      (async () => {
        for (let i = 0; i < PER_APPENDER; i += 1) {
          await appendReal(tenant, `storm.${a}.${i}`);
          appended += 1;
        }
      })(),
    );

    const verifyReports: Array<{ ok: boolean; checked: number }> = [];
    const sealResults: Array<{ sealed: boolean; reason: string }> = [];
    const checker = (async () => {
      // Interleave verifications and seals with the storm.
      for (let round = 0; round < 8; round += 1) {
        verifyReports.push(await audit.verifyPartition(partitionId));
        sealResults.push(await audit.sealPartition(partitionId, `sealer-${round}`));
      }
    })();

    await Promise.all([...appenders, checker]);

    // No verification under concurrency ever produced a false tamper verdict.
    for (const r of verifyReports) expect(r.ok).toBe(true);
    // Seals either advanced or honestly reported nothing new — never failed.
    for (const s of sealResults) {
      expect(s.sealed || s.reason === 'nothing new to seal').toBe(true);
    }

    // Final state: full chain verifies; seals are contiguous, non-overlapping,
    // and the last seal ends at a head that existed when it was verified.
    const final = await audit.verifyPartition(partitionId);
    expect(final.ok).toBe(true);
    expect(final.checked).toBe(1 + APPENDERS * PER_APPENDER);

    const seals = await su
      .selectFrom('audit.audit_seals').selectAll()
      .where('partition_id', '=', partitionId)
      .orderBy('range_start_seq').execute();
    expect(seals.length).toBeGreaterThan(0);
    let expectedStart = 1;
    for (const s of seals) {
      expect(Number(s.range_start_seq)).toBe(expectedStart);
      expect(Number(s.range_end_seq)).toBeGreaterThanOrEqual(Number(s.range_start_seq));
      expectedStart = Number(s.range_end_seq) + 1;
      // The sealed head hash is exactly the row hash of the sealed end row —
      // i.e. the head that was verified under the lock.
      const endRow = await su
        .selectFrom('audit.audit_events')
        .select(['row_hash'])
        .where('partition_id', '=', partitionId)
        .where('audit_seq', '=', Number(s.range_end_seq))
        .executeTakeFirstOrThrow();
      expect(s.head_hash).toBe(endRow.row_hash);
    }
    expect(expectedStart - 1).toBeLessThanOrEqual(1 + APPENDERS * PER_APPENDER);

    // Full verification of the final chain end-to-end (recompute from genesis).
    const rows = (await su
      .selectFrom('audit.audit_events')
      .select(['audit_seq', 'event', 'previous_hash', 'row_hash'])
      .where('partition_id', '=', partitionId)
      .orderBy('audit_seq')
      .execute()) as Array<{ audit_seq: string; event: AuditEventBody; previous_hash: string; row_hash: string }>;
    let prev = GENESIS_HASH;
    for (const r of rows) {
      expect(r.previous_hash).toBe(prev);
      prev = auditRowHash({ partitionId, auditSeq: Number(r.audit_seq), previousHash: prev, event: r.event });
      expect(prev).toBe(r.row_hash);
    }
  });
});
