/**
 * GATE-2.2 C6 — EVERY CAPABILITY BINDING IS ENFORCEABLE AT THE PORT.
 *
 * The capability names the exact object it authorizes, the exact correlation and
 * (when declared) the exact causation. These tests prove each of those bindings is
 * CHECKED, not decorative: a capability minted for object A cannot create object
 * B, a canonical header cannot point at a foreign correlation, the lifecycle actor
 * is derived from the authenticated principal rather than accepted from the
 * caller, and an audit event cannot close an operation under a different causation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import {
  commitDb, identityDb, superDb, seedTenant, seedDomain, createPrincipalWithSession,
  withCtx, closeOperation, commitDecision, type AnyDb, type TestPrincipal,
} from './helpers.js';

let commit: AnyDb;
let identity: AnyDb;
let su: AnyDb;
let tenant = '';
let domainA = '';
let platformAdmin: TestPrincipal;
let aAdmin: TestPrincipal;

const PAYLOAD = { subject: 'a', predicate: 'b', object_value: 'c' };

function header(objectId: string, correlationId: string): CanonicalHeader {
  return {
    object_id: objectId, object_type: 'CLM', tenant_id: tenant, domain_id: domainA,
    scope: 'DOMAIN', object_version: '1', lifecycle_state: 'admitted',
    owning_component: 'CP-OBJ-01', accountable_owner: 'principal:test', source_object_ids: [],
    event_time: null, observation_time: '2026-08-05T00:00:00.000Z', valid_from: null, valid_to: null,
    recorded_at: '2026-08-05T00:00:00.000Z', time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'asserted', synthetic_state: false, confidence: null, uncertainty: null,
    evidence_refs: ['evd:c6'], provenance_ref: null, method_ref: null, contradiction_refs: [],
    corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'test',
    rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1',
    ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
    audit_correlation_id: correlationId, content_ref: null,
  };
}

beforeAll(async () => {
  commit = commitDb(); identity = identityDb(); su = superDb();
  tenant = await seedTenant(su, 'c6-t');
  domainA = await seedDomain(su, tenant, 'c6-a');
  platformAdmin = await createPrincipalWithSession(identity, su, { scope: 'PLATFORM', roleCode: 'platform_admin', label: 'c6-p' });
  aAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'c6-a' });
});

afterAll(async () => {
  await Promise.all([commit, identity, su].map((d) => d.destroy()));
});

describe('C6 — exact TARGET binding at every business port', () => {
  it('a tenant capability bound to A cannot create tenant B', async () => {
    const boundTarget = uuidv7();
    const otherId = uuidv7();
    await expect(
      withCtx(commit, platformAdmin, 'PLATFORM', null, null, async (tx) =>
        sql`select tenancy.create_tenant(${otherId}::uuid, ${'c6-other-' + otherId.slice(-12)}, 'eu')`.execute(tx),
        { action: 'tenancy.tenant.create', target: boundTarget }),
    ).rejects.toThrow(/target binding denied: capability is bound to target/);
    const rows = await sql<{ n: string }>`select count(*) n from tenancy.tenants where id = ${otherId}`.execute(su);
    expect(Number(rows.rows[0]!.n)).toBe(0);
  });

  it('a domain capability bound to A cannot create domain B', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`select tenancy.create_domain(${uuidv7()}::uuid, ${tenant}::uuid, ${'c6-other-' + uuidv7().slice(-12)})`.execute(tx),
        { action: 'tenancy.domain.create', target: uuidv7() }),
    ).rejects.toThrow(/target binding denied/);
  });

  it('a canonical capability bound to object A cannot admit object B', async () => {
    const boundTarget = uuidv7();
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
        const h = header(uuidv7(), cap.correlationId); // a DIFFERENT object id
        return sql`select objects.admit_version(${JSON.stringify(h)}::jsonb,
          ${JSON.stringify(PAYLOAD)}::jsonb, ${canonicalHeaderDigest(h, PAYLOAD)})`.execute(tx);
      }, { action: 'objects.create', target: boundTarget }),
    ).rejects.toThrow(/target binding denied/);
  });

  it('a principal capability bound to A cannot create principal B', async () => {
    await expect(
      withCtx(identity, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`select identity.create_principal(${uuidv7()}::uuid, 'human', 'DOMAIN', ${tenant}::uuid,
              ${domainA}::uuid, 'c6', null, null, null)`.execute(tx),
        { action: 'identity.principal.create', target: uuidv7() }),
    ).rejects.toThrow(/target binding denied/);
  });
});

describe('C6 — the canonical header cannot point at a foreign correlation', () => {
  it('a header whose audit_correlation_id is not the operation correlation is refused', async () => {
    const objectId = uuidv7();
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) => {
        const h = header(objectId, uuidv7()); // foreign correlation
        return sql`select objects.admit_version(${JSON.stringify(h)}::jsonb,
          ${JSON.stringify(PAYLOAD)}::jsonb, ${canonicalHeaderDigest(h, PAYLOAD)})`.execute(tx);
      }, { action: 'objects.create', target: objectId }),
    ).rejects.toThrow(/header audit_correlation_id does not match the governed operation/);
  });
});

describe('C6 — the lifecycle actor is DERIVED, never caller-supplied', () => {
  it('the tenant lifecycle row records the authenticated principal', async () => {
    const tenantId = uuidv7();
    await withCtx(commit, platformAdmin, 'PLATFORM', null, null, async (tx, cap) => {
      await sql`select tenancy.create_tenant(${tenantId}::uuid, ${'c6-derived-' + tenantId.slice(-12)}, 'eu')`.execute(tx);
      await closeOperation(tx, cap, { type: 'TEN', id: tenantId });
    }, { action: 'tenancy.tenant.create', target: tenantId });

    const ev = await sql<{ actor: string }>`
      select actor from tenancy.lifecycle_events where tenant_id = ${tenantId} and event = 'tenant.created'`.execute(su);
    expect(ev.rows[0]!.actor).toBe(`principal:${platformAdmin.principalId}`);
  });

  it('the port takes no actor argument at all (the old 4-arg form is gone)', async () => {
    const gone = await sql<{ n: string }>`
      select count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'tenancy' and p.proname = 'create_tenant'
         and pg_get_function_identity_arguments(p.oid) = 'uuid, text, text, text'`.execute(su);
    expect(Number(gone.rows[0]!.n)).toBe(0);
  });
});

describe('C6 — CAUSATION is bound to the operation and checked at closure', () => {
  it('an audit event closing under a DIFFERENT causation cannot commit the effect', async () => {
    const declaredCausation = uuidv7();
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
        await sql`select ctx.bind_operation_causation(${declaredCausation}::uuid)`.execute(tx);
        await sql`select objects.enqueue_event(${uuidv7()}::uuid, 'c6.effect', '{}'::jsonb,
          ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
        await commitDecision(tx, cap);
        // The closing audit event declares a DIFFERENT causation than the bound one.
        await sql`select audit.commit_event('api.request', ${cap.action}, 'success', 'OK',
          null, null, null, ${cap.policyDecisionId}::uuid, ${cap.bundleVersion},
          ${cap.correlationId}::uuid, ${uuidv7()}::uuid, null, null, null, '{}'::jsonb)`.execute(tx);
      }, { action: 'objects.create', target: uuidv7() }),
    ).rejects.toThrow(/operation closure: business effect present without exactly one matching success audit event/);
  });

  it('the same operation closes cleanly when the causation matches', async () => {
    const causation = uuidv7();
    const eventId = uuidv7();
    await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
      await sql`select ctx.bind_operation_causation(${causation}::uuid)`.execute(tx);
      await sql`select objects.enqueue_event(${eventId}::uuid, 'c6.matched', '{}'::jsonb,
        ${cap.correlationId}::uuid, ${causation}::uuid)`.execute(tx);
      await commitDecision(tx, cap);
      await sql`select audit.commit_event('api.request', ${cap.action}, 'success', 'OK',
        null, null, null, ${cap.policyDecisionId}::uuid, ${cap.bundleVersion},
        ${cap.correlationId}::uuid, ${causation}::uuid, null, null, null, '{}'::jsonb)`.execute(tx);
    }, { action: 'objects.create', target: eventId });

    const row = await sql<{ status: string }>`select status from objects.object_outbox where id = ${eventId}`.execute(su);
    expect(row.rows[0]!.status).toBe('pending');
  });
});
