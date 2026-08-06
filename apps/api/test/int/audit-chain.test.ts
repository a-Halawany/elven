/**
 * Audit chain integration tests (ADR-P0-09; Gate-2 §1/§4).
 *
 * Every append goes through the REAL bound port (appendAuditEvent →
 * audit.commit_event) on the COMMIT authority under a real tenant-scoped
 * context, so scope/tenant/actor and the canonical bytes are all derived inside
 * the database. Verification and sealing use the REAL AuditService against the
 * VERIFIER authority; chain-head REBUILD uses the break-glass RECOVERY role,
 * which no application pool loads.
 *
 * Covers: exact privilege boundary, DB-level append-only, tamper response
 * (atomic freeze + incident, no re-seal), gap-free concurrency, allocator
 * reconstruction, and concurrent append vs verify/seal.
 */
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { auditRowHash, GENESIS_HASH, type AuditEventBody } from '@eye/contracts';
import { uuidv7 } from 'uuidv7';
import {
  appDb, superDb, commitDb, identityDb, verifierDb, recoveryDb,
  seedTenant, createPrincipalWithSession, type AnyDb, type TestPrincipal,
} from './helpers.js';
import { appendAuditEvent } from '../../src/audit/internal/audit-append.port.js';
import { AuditService } from '../../src/audit/audit.service.js';

let app: AnyDb;
let su: AnyDb; // migrate/superuser — used ONLY to simulate out-of-band tampering
let commit: AnyDb;
let identity: AnyDb;
let verifier: AnyDb;
let recovery: AnyDb;
let audit: AuditService;

interface Partitioned {
  tenantId: string;
  partitionId: string;
  principal: TestPrincipal;
}

/** A fresh tenant + bound tenant-admin session ⇒ a fresh audit partition. */
async function freshPartition(label: string): Promise<Partitioned> {
  const tenantId = await seedTenant(su, label);
  const principal = await createPrincipalWithSession(identity, su, {
    scope: 'TENANT', tenantId, roleCode: 'tenant_admin', label,
  });
  return { tenantId, partitionId: `tenant:${tenantId}`, principal };
}

/** Append through the REAL bound port under a REAL tenant authority context. */
async function appendReal(p: Partitioned, action: string): Promise<number> {
  return commit.transaction().execute(async (tx) => {
    await sql`select ctx.issue(${p.principal.sessionId}::uuid, ${p.principal.contextKey},
      'TENANT', ${p.tenantId}::uuid, null::uuid, 'audit-chain-test', 60)`.execute(tx);
    const ref = await appendAuditEvent(tx as never, {
      eventType: 'test.event',
      action,
      outcome: 'success',
      resultCode: 'OK',
      correlationId: uuidv7(),
      metadata: {},
    });
    return ref.auditSeq;
  });
}

beforeAll(() => {
  app = appDb();
  su = superDb();
  commit = commitDb();
  identity = identityDb();
  verifier = verifierDb();
  recovery = recoveryDb();
  audit = new AuditService(app as never, verifier as never, identity as never);
});

afterAll(async () => {
  await Promise.all([app, su, commit, identity, verifier, recovery].map((d) => d.destroy()));
});

describe('exact privilege boundary', () => {
  it('the application role cannot UPDATE or DELETE audit evidence', async () => {
    await expect(
      sql`update audit.audit_events set row_hash = repeat('f', 64) where audit_seq = 1`.execute(app),
    ).rejects.toThrow(/permission denied|append-only/);
    await expect(sql`delete from audit.audit_events where audit_seq = 1`.execute(app)).rejects.toThrow(
      /permission denied|append-only/,
    );
  });

  it('the application role cannot touch audit_chain_heads at all', async () => {
    await expect(
      sql`update audit.audit_chain_heads set next_seq = 999 where partition_id = 'platform'`.execute(app),
    ).rejects.toThrow(/permission denied/);
  });

  it('even the superuser cannot UPDATE/DELETE evidence rows (trigger raises)', async () => {
    const p = await freshPartition('chain-su');
    await appendReal(p, 'superuser.tamper.target');
    await expect(
      sql`update audit.audit_events set previous_hash = repeat('e', 64)
            where audit_seq = 1 and partition_id = ${p.partitionId}`.execute(su),
    ).rejects.toThrow(/append-only/);
    await expect(
      sql`delete from audit.audit_events where audit_seq = 1 and partition_id = ${p.partitionId}`.execute(su),
    ).rejects.toThrow(/append-only/);
  });
});

describe('gap-free concurrent appends (ADR-P0-09)', () => {
  it('16 parallel writers on one partition produce a strict 1..16 sequence and a verifiable chain', async () => {
    const p = await freshPartition('chain-conc');
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) => appendReal(p, `concurrent.${i}`)),
    );
    expect([...results].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));

    const report = await audit.verifyPartition(p.partitionId);
    expect(report.ok).toBe(true);
    expect(report.checked).toBe(16);
    expect(report.headMatches).toBe(true);
  });

  it('a rolled-back transaction leaves no gap', async () => {
    const p = await freshPartition('chain-roll');
    expect(await appendReal(p, 'pre')).toBe(1);
    await expect(
      commit.transaction().execute(async (tx) => {
        await sql`select ctx.issue_system('rollback test')`.execute(tx);
        await sql`select * from audit.advance_chain_head(${p.partitionId})`.execute(tx);
        throw new Error('simulated failure after allocation');
      }),
    ).rejects.toThrow('simulated failure');
    expect(await appendReal(p, 'post')).toBe(2); // no gap from the aborted allocation
  });
});

describe('allocator is reconstructable from the ledger (break-glass recovery only)', () => {
  it('rebuild_chain_heads restores a corrupted head from immutable rows', async () => {
    const p = await freshPartition('chain-rebuild');
    await appendReal(p, 'a');
    await appendReal(p, 'b');
    const before = await su
      .selectFrom('audit.audit_chain_heads').selectAll()
      .where('partition_id', '=', p.partitionId).executeTakeFirstOrThrow();
    await sql`update audit.audit_chain_heads set next_seq = 999, head_hash = repeat('a', 64)
                where partition_id = ${p.partitionId}`.execute(su);
    // ONLY the recovery role can do this — proved negatively in adversarial.test.ts.
    await sql`select audit.rebuild_chain_heads()`.execute(recovery);
    const after = await su
      .selectFrom('audit.audit_chain_heads').selectAll()
      .where('partition_id', '=', p.partitionId).executeTakeFirstOrThrow();
    expect(after.next_seq).toBe(before.next_seq);
    expect(after.head_hash).toBe(before.head_hash);
  });
});

describe('tamper response — REAL AuditService.verifyPartition()', () => {
  it('detects tampering, freezes + records the incident ATOMICALLY, refuses appends and sealing', async () => {
    const p = await freshPartition('chain-tamper');
    for (let i = 1; i <= 3; i += 1) await appendReal(p, `t.${i}`);

    // Out-of-band tampering (superuser disables the guard trigger).
    await sql`alter table audit.audit_events disable trigger audit_events_append_only`.execute(su);
    await sql`update audit.audit_events set event_jcs = replace(event_jcs, '"t.2"', '"TAMPERED"')
                where partition_id = ${p.partitionId} and audit_seq = 2`.execute(su);
    await sql`alter table audit.audit_events enable trigger audit_events_append_only`.execute(su);

    const report = await audit.verifyPartition(p.partitionId);
    expect(report.ok).toBe(false);
    expect(report.brokenAtSeq).toBe(2);
    expect(report.incidentId).not.toBeNull();

    const head = await su
      .selectFrom('audit.audit_chain_heads').selectAll()
      .where('partition_id', '=', p.partitionId).executeTakeFirstOrThrow();
    expect(head.frozen).toBe(true);
    const incidents = await su
      .selectFrom('audit.integrity_incidents').selectAll()
      .where('partition_id', '=', p.partitionId).execute();
    expect(incidents).toHaveLength(1);

    await expect(appendReal(p, 'after-tamper')).rejects.toThrow(/frozen/);
    const seal = await audit.sealPartition(p.partitionId, 'test-sealer');
    expect(seal.sealed).toBe(false);
    expect(seal.reason).toMatch(/verification failed|integrity incident|frozen/);
  });
});

describe('concurrent append vs REAL verify/seal', () => {
  it('an append storm never yields a false tamper verdict, and every seal covers exactly a verified head', async () => {
    const p = await freshPartition('chain-storm');
    await appendReal(p, 'seed');

    const APPENDERS = 6;
    const PER_APPENDER = 10;
    const appenders = Array.from({ length: APPENDERS }, (_, a) =>
      (async () => {
        for (let i = 0; i < PER_APPENDER; i += 1) await appendReal(p, `storm.${a}.${i}`);
      })(),
    );

    const verifyReports: Array<{ ok: boolean; checked: number }> = [];
    const sealResults: Array<{ sealed: boolean; reason: string }> = [];
    const checker = (async () => {
      for (let round = 0; round < 8; round += 1) {
        verifyReports.push(await audit.verifyPartition(p.partitionId));
        sealResults.push(await audit.sealPartition(p.partitionId, `sealer-${round}`));
      }
    })();

    await Promise.all([...appenders, checker]);

    for (const r of verifyReports) expect(r.ok).toBe(true);
    for (const s of sealResults) expect(s.sealed || s.reason === 'nothing new to seal').toBe(true);

    const final = await audit.verifyPartition(p.partitionId);
    expect(final.ok).toBe(true);
    expect(final.checked).toBe(1 + APPENDERS * PER_APPENDER);

    const seals = await su
      .selectFrom('audit.audit_seals').selectAll()
      .where('partition_id', '=', p.partitionId)
      .orderBy('range_start_seq').execute();
    expect(seals.length).toBeGreaterThan(0);
    let expectedStart = 1;
    for (const s of seals) {
      expect(Number(s.range_start_seq)).toBe(expectedStart);
      expect(Number(s.range_end_seq)).toBeGreaterThanOrEqual(Number(s.range_start_seq));
      expectedStart = Number(s.range_end_seq) + 1;
      // The sealed head hash is exactly the row hash of the sealed end row.
      const endRow = await su
        .selectFrom('audit.audit_events').select(['row_hash'])
        .where('partition_id', '=', p.partitionId)
        .where('audit_seq', '=', Number(s.range_end_seq))
        .executeTakeFirstOrThrow();
      expect(s.head_hash).toBe(endRow.row_hash);
    }

    // Full independent recomputation of the final chain from genesis.
    const rows = (await su
      .selectFrom('audit.audit_events')
      .select(['audit_seq', 'event', 'previous_hash', 'row_hash'])
      .where('partition_id', '=', p.partitionId)
      .orderBy('audit_seq')
      .execute()) as Array<{ audit_seq: string; event: AuditEventBody; previous_hash: string; row_hash: string }>;
    let prev = GENESIS_HASH;
    for (const r of rows) {
      expect(r.previous_hash).toBe(prev);
      prev = auditRowHash({
        partitionId: p.partitionId,
        auditSeq: Number(r.audit_seq),
        previousHash: prev,
        event: r.event,
      });
      expect(prev).toBe(r.row_hash);
    }
  });
});
