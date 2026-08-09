/**
 * GATE-2.2 C5 — GOVERN THE VERIFIER, SEAL AND INTEGRITY-INCIDENT PORTS.
 *
 * The verifier authority may verify and seal, but only under the right capability
 * BOUND TO THE EXACT PARTITION. No runtime credential may arbitrarily freeze a
 * partition, fabricate a seal, or record an integrity verdict for a partition its
 * capability does not name — and a verify-only capability cannot seal.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import {
  appDb, commitDb, identityDb, verifierDb, superDb, seedTenant,
  createPrincipalWithSession, withCtx, withVerifyCtx,
  type AnyDb, type TestPrincipal,
} from './helpers.js';
import { appendAuditEvent } from '../../src/audit/internal/audit-append.port.js';

let app: AnyDb;
let commit: AnyDb;
let identity: AnyDb;
let verifier: AnyDb;
let su: AnyDb;

let tenantA = '';
let tenantB = '';
let partitionA = '';
let partitionB = '';
let adminA: TestPrincipal;
let adminB: TestPrincipal;

/** Append one real audit event so the partition exists with a head. */
async function seedPartition(p: TestPrincipal, tenantId: string): Promise<void> {
  await withCtx(commit, p, 'TENANT', tenantId, null, async (tx, cap) => {
    await appendAuditEvent(tx as never, {
      eventType: 'test.event', action: cap.action, outcome: 'success',
      resultCode: 'OK', correlationId: cap.correlationId, metadata: {},
    });
  }, { action: 'c5.seed' });
}

beforeAll(async () => {
  app = appDb(); commit = commitDb(); identity = identityDb(); verifier = verifierDb(); su = superDb();
  tenantA = await seedTenant(su, 'c5-a');
  tenantB = await seedTenant(su, 'c5-b');
  partitionA = `tenant:${tenantA}`;
  partitionB = `tenant:${tenantB}`;
  adminA = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenantA, roleCode: 'tenant_admin', label: 'c5-a' });
  adminB = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenantB, roleCode: 'tenant_admin', label: 'c5-b' });
  await seedPartition(adminA, tenantA);
  await seedPartition(adminB, tenantB);
});

afterAll(async () => {
  await Promise.all([app, commit, identity, verifier, su].map((d) => d.destroy()));
});

describe('C5 — the seal/integrity ports are unreachable without a capability', () => {
  it('no other role holds them at all', async () => {
    for (const [name, db] of [['app', app], ['commit', commit], ['identity', identity]] as const) {
      await expect(
        sql`select audit.open_integrity_incident(${uuidv7()}::uuid, ${partitionA}, 1, 1, '{}'::jsonb)`.execute(db),
        `${name} open_integrity_incident`,
      ).rejects.toThrow(/permission denied/);
      await expect(
        sql`select * from audit.lock_head_for_seal(${partitionA})`.execute(db),
        `${name} lock_head_for_seal`,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('the verifier cannot freeze a partition with NO capability', async () => {
    await expect(
      verifier.transaction().execute(async (tx) =>
        sql`select audit.open_integrity_incident(${uuidv7()}::uuid, ${partitionA}, 1, 1, '{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/verify mode required/);
  });

  it('the verifier cannot seal with NO capability', async () => {
    await expect(
      verifier.transaction().execute(async (tx) =>
        sql`select * from audit.lock_head_for_seal(${partitionA})`.execute(tx)),
    ).rejects.toThrow(/seal capability is required/);
  });
});

describe('C5 — capabilities are bound to the EXACT partition', () => {
  it('a capability for partition A cannot freeze partition B', async () => {
    await expect(
      withVerifyCtx(verifier, partitionA, false, async (tx) =>
        sql`select audit.open_integrity_incident(${uuidv7()}::uuid, ${partitionB}, 1, 1, '{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/bound to partition .*, not/);
    // Partition B is untouched.
    const head = await sql<{ frozen: boolean }>`
      select frozen from audit.audit_chain_heads where partition_id = ${partitionB}`.execute(su);
    expect(head.rows[0]!.frozen).toBe(false);
  });

  it('a capability for partition A cannot seal partition B', async () => {
    await expect(
      withVerifyCtx(verifier, partitionA, true, async (tx) =>
        sql`select * from audit.lock_head_for_seal(${partitionB})`.execute(tx)),
    ).rejects.toThrow(/bound to partition .*, not/);
  });

  it('a capability for partition A cannot record an integrity verdict for partition B', async () => {
    await expect(
      withVerifyCtx(verifier, partitionA, false, async (tx) =>
        sql`select audit.commit_integrity_event(${partitionB}, 'success', 'OK', ${uuidv7()}::uuid, '{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/bound to partition .*, not/);
  });
});

describe('C5 — verify and seal are distinct capabilities', () => {
  it('a VERIFY-only capability cannot seal its own partition', async () => {
    await expect(
      withVerifyCtx(verifier, partitionA, false, async (tx) =>
        sql`select * from audit.lock_head_for_seal(${partitionA})`.execute(tx)),
    ).rejects.toThrow(/seal capability is required/);
    await expect(
      withVerifyCtx(verifier, partitionA, false, async (tx) =>
        sql`select audit.append_seal(${uuidv7()}::uuid, ${partitionA}, 1, 1, ${'a'.repeat(64)}, 'forged')`.execute(tx)),
    ).rejects.toThrow(/seal capability is required/);
  });

  it('a SEAL capability cannot fabricate a seal over a head that does not match', async () => {
    await expect(
      withVerifyCtx(verifier, partitionA, true, async (tx) => {
        await sql`select * from audit.lock_head_for_seal(${partitionA})`.execute(tx);
        // A caller-declared head that is not the computed head is refused.
        return sql`select audit.append_seal(${uuidv7()}::uuid, ${partitionA}, 1, 9999, ${'f'.repeat(64)}, 'forged')`.execute(tx);
      }),
    ).rejects.toThrow(/head moved since verification/);
  });

  it('the correctly-bound verify capability records its verdict', async () => {
    const seq = await withVerifyCtx(verifier, partitionA, false, async (tx) =>
      (await sql<{ s: string }>`select audit.commit_integrity_event(
        ${partitionA}, 'success', 'OK', ${uuidv7()}::uuid, '{}'::jsonb) as s`.execute(tx)).rows[0]!.s);
    expect(Number(seq)).toBeGreaterThan(0);
  });
});
