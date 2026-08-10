/**
 * GATE-2.2 C1 — DATABASE-ENFORCED POL/AUD/EFFECT OPERATION CLOSURE.
 *
 * These tests attack the REAL deferred constraint trigger on ctx.operation_effect
 * through the REAL commit authority under a REAL bound capability. Every attempt
 * writes a genuine business effect (canonical object / outbox row / tenant) and
 * then tries to commit it WITHOUT the closure the database now requires: no
 * policy decision, no audit event, an unrelated decision id, or a decision that
 * describes a different request. The transaction must fail AT COMMIT, and the
 * effect must not exist afterwards.
 *
 * Nothing here is satisfied by source inspection or reimplemented logic: the
 * verdicts come from the database refusing to commit.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import {
  appDb, commitDb, identityDb, superDb, seedTenant, seedDomain,
  createPrincipalWithSession, withCtx, closeOperation, commitDecision,
  type AnyDb, type TestPrincipal,
} from './helpers.js';

let app: AnyDb;
let commit: AnyDb;
let identity: AnyDb;
let su: AnyDb;

let tenant = '';
let domainA = '';
let platformAdmin: TestPrincipal;
let aAdmin: TestPrincipal;

function fullHeader(objectId: string, tenantId: string, domainId: string): CanonicalHeader {
  return {
    object_id: objectId, object_type: 'CLM', tenant_id: tenantId, domain_id: domainId,
    scope: 'DOMAIN', object_version: '1', lifecycle_state: 'admitted',
    owning_component: 'CP-OBJ-01', accountable_owner: 'principal:test', source_object_ids: [],
    event_time: null, observation_time: '2026-08-05T00:00:00.000Z', valid_from: null, valid_to: null,
    recorded_at: '2026-08-05T00:00:00.000Z', time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'asserted', synthetic_state: false, confidence: null, uncertainty: null,
    evidence_refs: ['evd:c1'], provenance_ref: null, method_ref: null, contradiction_refs: [],
    corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'test',
    rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1',
    ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
    audit_correlation_id: uuidv7(), content_ref: null,
  };
}
const PAYLOAD = { subject: 'a', predicate: 'b', object_value: 'c' };

/** Enqueue an outbox effect under the current capability. */
const enqueue = (tx: never, cap: { correlationId: string }) =>
  sql`select objects.enqueue_event(${uuidv7()}::uuid, 'c1.effect', '{}'::jsonb,
    ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);


/**
 * Admit a canonical effect under the current capability. Gate-2.2 C6: the header's
 * object id must be the capability's bound target and its audit correlation must be
 * the operation's correlation, so both are threaded from the capability.
 */
const admit = (tx: never, cap: { correlationId: string; target: string }) => {
  const h = { ...fullHeader(cap.target, tenant, domainA), audit_correlation_id: cap.correlationId };
  return sql`select objects.admit_version(${JSON.stringify(h)}::jsonb,
    ${JSON.stringify(PAYLOAD)}::jsonb, ${canonicalHeaderDigest(h, PAYLOAD)})`.execute(tx);
};

beforeAll(async () => {
  app = appDb(); commit = commitDb(); identity = identityDb(); su = superDb();
  tenant = await seedTenant(su, 'c1-t');
  domainA = await seedDomain(su, tenant, 'c1-a');
  platformAdmin = await createPrincipalWithSession(identity, su, { scope: 'PLATFORM', roleCode: 'platform_admin', label: 'c1-p' });
  aAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'c1-a' });
});

afterAll(async () => {
  await Promise.all([app, commit, identity, su].map((d) => d.destroy()));
});

describe('C1 — an effect with NO closure cannot commit', () => {
  it('an outbox effect with neither POL nor AUD fails at commit', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
        await enqueue(tx as never, cap);
      }, { action: 'objects.create' }),
    ).rejects.toThrow(/operation closure: business effect present without a matching persisted allow decision/);
  });

  it('a canonical effect with neither POL nor AUD fails at commit', async () => {
    const objectId = uuidv7();
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
        await admit(tx as never, cap);
      }, { action: 'objects.create', target: objectId }),
    ).rejects.toThrow(/operation closure/);
  });

  it('a platform tenant effect with no closure fails at commit', async () => {
    const tenantId = uuidv7();
    await expect(
      withCtx(commit, platformAdmin, 'PLATFORM', null, null, async (tx) => {
        await sql`select tenancy.create_tenant(${tenantId}::uuid, 'c1-forged', 'eu')`.execute(tx);
      }, { action: 'tenancy.tenant.create', target: tenantId }),
    ).rejects.toThrow(/operation closure/);
  });

  it('NONE of those effects exist afterwards (rolled back with the failed commit)', async () => {
    const outbox = await sql<{ n: string }>`select count(*) n from objects.object_outbox where event_type = 'c1.effect'`.execute(su);
    expect(Number(outbox.rows[0]!.n)).toBe(0);
    const tenants = await sql<{ n: string }>`select count(*) n from tenancy.tenants where name = 'c1-forged'`.execute(su);
    expect(Number(tenants.rows[0]!.n)).toBe(0);
  });
});

describe('C1 — an effect with PARTIAL closure cannot commit', () => {
  it('effect + allow POL but no AUD fails at commit', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
        await enqueue(tx as never, cap);
        await commitDecision(tx, cap); // allow decision, but NO audit event
      }, { action: 'objects.create' }),
    ).rejects.toThrow(/operation closure: business effect present without exactly one matching success audit event/);
  });

  it('effect + AUD but the POL is an UNRELATED (random) decision id fails at commit', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
        await enqueue(tx as never, cap);
        // A real allow decision + success audit, but under a DIFFERENT decision
        // id than the one the operation was opened with. This is refused in depth:
        // policy.commit_decision itself binds the decision id to the context
        // (C6), so the stray id is rejected at the POL port — and even if it were
        // written, the operation's bound decision id would have no matching POL
        // and the closure trigger would reject at commit.
        const strayId = uuidv7();
        await sql`select policy.commit_decision(
          ${strayId}::uuid, ${cap.action}, 'test.object', ${uuidv7()}::uuid, ${cap.consequence},
          'allow', '[]'::jsonb, ${'a'.repeat(64)}, ${cap.bundleVersion}, null, null, 'none',
          'stray', ${cap.correlationId}::uuid, null, '{}'::jsonb)`.execute(tx);
        await sql`select audit.commit_event('api.request', ${cap.action}, 'success', 'OK',
          null, null, null, ${strayId}::uuid, ${cap.bundleVersion},
          ${cap.correlationId}::uuid, null::uuid, null, null, null, '{}'::jsonb)`.execute(tx);
      }, { action: 'objects.create' }),
    ).rejects.toThrow(/operation closure: business effect present without a matching persisted allow decision|policy rejected: decision id does not/);
  });
});

describe('C1 — a fully closed operation DOES commit and is recorded', () => {
  it('effect + matching allow POL + matching success AUD commits, and the operation is finalized', async () => {
    const eventId = uuidv7();
    let opCorrelation = '';
    await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
      opCorrelation = cap.correlationId;
      await sql`select objects.enqueue_event(${eventId}::uuid, 'c1.closed', '{}'::jsonb,
        ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      await closeOperation(tx, cap, { type: 'outbox', id: eventId });
    }, { action: 'objects.create' });

    // The effect committed…
    const row = await sql<{ status: string }>`select status from objects.object_outbox where id = ${eventId}`.execute(su);
    expect(row.rows[0]!.status).toBe('pending');
    // …and its operation was recorded and finalized by the closure check.
    const op = await sql<{ finalized: boolean; decision_id: string }>`
      select finalized, decision_id from ctx.operation where correlation_id = ${opCorrelation}`.execute(su);
    expect(op.rows.length).toBe(1);
    expect(op.rows[0]!.finalized).toBe(true);
    // The effect is linked to exactly that operation.
    const eff = await sql<{ effect_kind: string }>`
      select e.effect_kind from ctx.operation_effect e
      join ctx.operation o on o.operation_id = e.operation_id
      where o.correlation_id = ${opCorrelation}`.execute(su);
    expect(eff.rows.map((r) => r.effect_kind)).toContain('outbox');
  });
});

describe('C1 — the deny path opens no operation and writes no effect', () => {
  it('an evidence-mode decision cannot open an operation, so it can carry no effect', async () => {
    // Evidence mode is where deny/indeterminate evidence is written. It cannot
    // reach an effect port at all (authority mode required), so a deny never
    // produces an effect that would need closing.
    const before = await sql<{ n: string }>`select count(*) n from ctx.operation_effect`.execute(su);
    await expect(
      sql`select objects.enqueue_event(${uuidv7()}::uuid, 'x', '{}'::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(app),
    ).rejects.toThrow(/permission denied/);
    const after = await sql<{ n: string }>`select count(*) n from ctx.operation_effect`.execute(su);
    expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
  });
});
