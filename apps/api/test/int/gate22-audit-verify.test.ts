/**
 * GATE-2.2 C10 — COMPLETE audit.verify SEMANTICS.
 *
 * `event` is a GENERATED column (`event_jcs::jsonb`), so recomputing the row hash
 * from the PARSED value cannot see a byte-level rewrite that still parses to the
 * same JSON. And rows above the recorded head were excluded from verification
 * entirely, so an injected row was invisible. These tests drive the REAL
 * AuditService against a real chain and prove both are now detected, that the
 * integrity mutation carries inseparable evidence, and that verification checks
 * sequence, hash, head and incident state.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { jcsCanonicalize } from '@eye/contracts';
import {
  appDb, commitDb, identityDb, verifierDb, superDb, seedTenant,
  createPrincipalWithSession, withCtx, type AnyDb, type TestPrincipal,
} from './helpers.js';
import { appendAuditEvent } from '../../src/audit/internal/audit-append.port.js';
import { AuditService } from '../../src/audit/audit.service.js';

let app: AnyDb;
let commit: AnyDb;
let identity: AnyDb;
let verifier: AnyDb;
let su: AnyDb;
let audit: AuditService;

/** A fresh tenant partition with `n` real, governed audit rows. */
async function freshPartition(label: string, n: number): Promise<{ tenantId: string; partitionId: string }> {
  const tenantId = await seedTenant(su, label);
  const p: TestPrincipal = await createPrincipalWithSession(identity, su, {
    scope: 'TENANT', tenantId, roleCode: 'tenant_admin', label,
  });
  for (let i = 0; i < n; i += 1) {
    await withCtx(commit, p, 'TENANT', tenantId, null, async (tx, cap) => {
      await appendAuditEvent(tx as never, {
        eventType: 'test.event', action: cap.action, outcome: 'success',
        resultCode: 'OK', correlationId: cap.correlationId, metadata: { i },
      });
    }, { action: `c10.seed.${i}` });
  }
  return { tenantId, partitionId: `tenant:${tenantId}` };
}

beforeAll(async () => {
  app = appDb(); commit = commitDb(); identity = identityDb(); verifier = verifierDb(); su = superDb();
  audit = new AuditService(app as never, verifier as never, identity as never);
});
afterAll(async () => {
  await Promise.all([app, commit, identity, verifier, su].map((d) => d.destroy()));
});

describe('C10 — a clean chain verifies with full detail', () => {
  it('reports verified with matching heads, zero orphans and no byte defect', async () => {
    const { partitionId } = await freshPartition('c10-ok', 3);
    const r = await audit.verifyPartition(partitionId);
    expect(r.ok).toBe(true);
    expect(r.resultClass).toBe('verified');
    expect(r.checked).toBe(3);
    expect(r.headMatches).toBe(true);
    expect(r.expectedHeadHash).toBe(r.calculatedHeadHash);
    expect(r.expectedHeadSeq).toBe(r.calculatedHeadSeq);
    expect(r.noncanonicalAtSeq).toBeNull();
    expect(r.orphanRowSeqs).toEqual([]);
    expect(r.incidentId).toBeNull();
  });
});

describe('C10 — NON-CANONICAL BYTES are detected even when the parsed value is identical', () => {
  it('a byte-level rewrite that preserves the parsed JSON is caught', async () => {
    const { partitionId } = await freshPartition('c10-bytes', 2);

    // Rewrite the STORED BYTES of seq 2 into a semantically identical but
    // NON-canonical form (keys reordered / whitespace added). The generated `event`
    // column parses to the same object, so the recomputed row hash still matches —
    // only a byte comparison can see this.
    const row = await sql<{ event_jcs: string }>`
      select event_jcs from audit.audit_events where partition_id = ${partitionId} and audit_seq = 2`.execute(su);
    const parsed = JSON.parse(row.rows[0]!.event_jcs) as Record<string, unknown>;
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(parsed).reverse()), null, 1);
    expect(reordered).not.toBe(jcsCanonicalize(parsed)); // genuinely non-canonical
    expect(JSON.parse(reordered)).toEqual(parsed);       // but semantically identical

    await sql`alter table audit.audit_events disable trigger audit_events_append_only`.execute(su);
    await sql`update audit.audit_events set event_jcs = ${reordered}
               where partition_id = ${partitionId} and audit_seq = 2`.execute(su);
    await sql`alter table audit.audit_events enable trigger audit_events_append_only`.execute(su);

    const r = await audit.verifyPartition(partitionId);
    expect(r.ok).toBe(false);
    expect(r.resultClass).toBe('noncanonical_bytes');
    expect(r.noncanonicalAtSeq).toBe(2);
    expect(r.incidentId).not.toBeNull();

    // The integrity MUTATION carries its own inseparable governed evidence.
    const ev = await sql<{ n: string }>`
      select count(*) n from audit.audit_events
       where correlation_id = ${r.incidentId} and event->'metadata'->>'event' = 'integrity.incident_opened'`.execute(su);
    expect(Number(ev.rows[0]!.n)).toBe(1);
    // …and the partition is frozen.
    const head = await sql<{ frozen: boolean }>`
      select frozen from audit.audit_chain_heads where partition_id = ${partitionId}`.execute(su);
    expect(head.rows[0]!.frozen).toBe(true);
  });
});

describe('C10 — ORPHAN ROWS above the head are detected', () => {
  it('a row injected above the recorded head is evidence, not invisible', async () => {
    const { partitionId } = await freshPartition('c10-orphan', 2);
    const clean = await audit.verifyPartition(partitionId);
    expect(clean.ok).toBe(true);

    // Inject a row ABOVE the head (out-of-band; the head is NOT advanced).
    const orphanSeq = (clean.verifiedHeadSeq ?? 0) + 5;
    await sql`insert into audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
              values (${partitionId}, ${orphanSeq}, ${jcsCanonicalize({ event_type: 'injected', outcome: 'success' })},
                      ${'0'.repeat(64)}, ${'1'.repeat(64)})`.execute(su);

    const r = await audit.verifyPartition(partitionId);
    expect(r.ok).toBe(false);
    expect(r.resultClass).toBe('orphan_rows');
    expect(r.orphanRowSeqs).toContain(orphanSeq);
    expect(r.incidentId).not.toBeNull();
    const ev = await sql<{ meta: string }>`
      select event->'metadata'->>'orphan_row_seqs' meta from audit.audit_events
       where correlation_id = ${r.incidentId} and event->'metadata'->>'event' = 'integrity.incident_opened'`.execute(su);
    expect(ev.rows[0]!.meta).toContain(String(orphanSeq));
  });
});

describe('C10 — an unknown partition is a failure, never a successful verification of nothing', () => {
  it('reports partition_unknown with no incident and no verified head', async () => {
    const r = await audit.verifyPartition(`tenant:${uuidv7()}`);
    expect(r.ok).toBe(false);
    expect(r.resultClass).toBe('partition_unknown');
    expect(r.checked).toBe(0);
    expect(r.verifiedHeadSeq).toBeNull();
    expect(r.orphanRowSeqs).toEqual([]);
  });
});

describe('C10 — a tampered chain is never sealed as trusted', () => {
  it('sealing refuses while the integrity incident stands', async () => {
    const { partitionId } = await freshPartition('c10-seal', 2);
    await sql`alter table audit.audit_events disable trigger audit_events_append_only`.execute(su);
    await sql`update audit.audit_events set event_jcs = replace(event_jcs, '"success"', '"failure"')
               where partition_id = ${partitionId} and audit_seq = 1`.execute(su);
    await sql`alter table audit.audit_events enable trigger audit_events_append_only`.execute(su);

    const r = await audit.verifyPartition(partitionId);
    expect(r.ok).toBe(false);
    const seal = await audit.sealPartition(partitionId, 'c10-sealer');
    expect(seal.sealed).toBe(false);
    expect(seal.reason).toMatch(/verification failed|integrity incident|frozen/);
  });
});
