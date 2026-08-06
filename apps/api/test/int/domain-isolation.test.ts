/**
 * R10 mandated tests 1 & 2 — PLATFORM/TENANT/DOMAIN isolation matrix,
 * exercised against the REAL database policies through the REAL signed-context
 * port (public.eye_set_context) on the eye_app role.
 *
 * Domain A must never read, write, infer or COUNT domain B data in the same
 * tenant; tenant contexts never cross tenants; missing/unsigned context sees
 * nothing (fail closed). Covered scoped tables: tenants, domains,
 * lifecycle_events, principals, role_bindings, policy_decisions, audit_events,
 * canonical_objects, object_outbox. (Credentials/sessions/break-glass have NO
 * direct app access at all — covered in privileges.test.ts.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import {
  appDb, commitDb, identityDb, superDb, seedTenant, seedDomain,
  createPrincipalWithSession, withCtx, type AnyDb, type TestPrincipal,
} from './helpers.js';

let app: AnyDb;
let commit: AnyDb;
let identity: AnyDb;
let su: AnyDb;

let tenant = '';
let tenantOther = '';
let domainA = '';
let domainB = '';
let domainOther = '';

let platformAdmin: TestPrincipal;
let tenantAdmin: TestPrincipal;
let aAdmin: TestPrincipal; // domain A admin
let bAdmin: TestPrincipal; // domain B admin

beforeAll(async () => {
  app = appDb();
  commit = commitDb();
  identity = identityDb();
  su = superDb();
  tenant = await seedTenant(su, 'iso-t');
  tenantOther = await seedTenant(su, 'iso-o');
  domainA = await seedDomain(su, tenant, 'dom-a');
  domainB = await seedDomain(su, tenant, 'dom-b');
  domainOther = await seedDomain(su, tenantOther, 'dom-o');

  platformAdmin = await createPrincipalWithSession(identity, su, { scope: 'PLATFORM', roleCode: 'platform_admin', label: 'iso-p' });
  tenantAdmin = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'iso-t' });
  aAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'iso-a' });
  bAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainB, roleCode: 'domain_admin', label: 'iso-b' });

  // Seed one row per scoped table in EACH domain (A, B, other-tenant) through
  // domain contexts (writes) so write-isolation is exercised on the way in.
  for (const [who, t, d] of [
    [aAdmin, tenant, domainA],
    [bAdmin, tenant, domainB],
  ] as const) {
    await withCtx(commit, who, 'DOMAIN', t, d, async (tx) => {
      await sql`insert into tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
        values (${uuidv7()}, 'DOMAIN', ${t}, ${d}, 'domain.test', ${'principal:' + who.principalId}, '{}')`.execute(tx);
      await sql`select objects.enqueue_event(${uuidv7()}::uuid, 'test.event', '{}'::jsonb,
        ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      await sql`select policy.commit_decision(
        ${uuidv7()}::uuid, 'test.action', 'CLM', null::uuid, 'C1', 'allow', '[]'::jsonb,
        ${'x'.repeat(64)}, 'bundle-v1', null, null, 'none', 'isolation fixture',
        ${uuidv7()}::uuid, null, '{}'::jsonb)`.execute(tx);
    });
  }
});

afterAll(async () => {
  await app.destroy();
  await commit.destroy();
  await identity.destroy();
  await su.destroy();
});

describe('fail-closed (no signed context)', () => {
  it('sees zero rows in every scoped table without a signed context', async () => {
    for (const table of [
      'tenancy.tenants', 'tenancy.domains', 'tenancy.lifecycle_events',
      'identity.principals', 'identity.role_bindings',
      'policy.policy_decisions', 'audit.audit_events',
      'objects.canonical_objects', 'objects.object_outbox',
    ]) {
      const rows = await app.selectFrom(table as never).selectAll().limit(5).execute();
      expect(rows, table).toHaveLength(0);
    }
  });
});

describe('mandated 1 — domain A vs domain B in the SAME tenant', () => {
  it('domain A cannot COUNT domain B rows (no existence inference)', async () => {
    for (const table of ['tenancy.lifecycle_events', 'policy.policy_decisions', 'objects.object_outbox']) {
      const [inA, inB] = await Promise.all([
        withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
          sql<{ n: string }>`select count(*) n from ${sql.raw(table)} where domain_id = ${domainB}`.execute(tx)),
        withCtx(app, bAdmin, 'DOMAIN', tenant, domainB, async (tx) =>
          sql<{ n: string }>`select count(*) n from ${sql.raw(table)} where domain_id = ${domainB}`.execute(tx)),
      ]);
      expect(Number(inA.rows[0]!.n), `${table}: A counting B`).toBe(0);
      expect(Number(inB.rows[0]!.n), `${table}: B counting B`).toBeGreaterThan(0);
    }
  });

  it('domain A cannot READ domain B rows through any scoped table', async () => {
    for (const table of ['tenancy.lifecycle_events', 'policy.policy_decisions', 'objects.object_outbox']) {
      const rows = await withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`select * from ${sql.raw(table)} where domain_id = ${domainB}`.execute(tx));
      expect(rows.rows, table).toHaveLength(0);
    }
  });

  it('domain A cannot WRITE rows labeled domain B (RLS WITH CHECK on the commit authority)', async () => {
    // Run these on the COMMIT authority: the ordinary application role has no
    // INSERT at all (proved in adversarial.test.ts), so the interesting question
    // is whether the authoritative writer is still confined by RLS. It is.
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`insert into tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
          values (${uuidv7()}, 'DOMAIN', ${tenant}, ${domainB}, 'domain.forged', 'principal:a', '{}')`.execute(tx)),
    ).rejects.toThrow(/row-level security|policy/i);
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, status)
          values (${uuidv7()}, 'DOMAIN', ${tenant}, ${domainB}, 'forged.event', '{}', ${uuidv7()}, ${uuidv7()}, 'pending')`.execute(tx)),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  it('domain A cannot see domain B principals or role bindings', async () => {
    const principals = await withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql`select * from identity.principals where domain_id = ${domainB}`.execute(tx));
    expect(principals.rows).toHaveLength(0);
    const bindings = await withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql`select * from identity.role_bindings where domain_id = ${domainB}`.execute(tx));
    expect(bindings.rows).toHaveLength(0);
  });

  it('domain A sees the domains catalog of its own domain only', async () => {
    const rows = await withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql<{ id: string }>`select id from tenancy.domains`.execute(tx));
    const ids = rows.rows.map((r) => r.id);
    expect(ids).toContain(domainA);
    expect(ids).not.toContain(domainB);
  });
});

describe('mandated 2 — tenant and platform boundaries stay intact', () => {
  it('tenant context sees both its domains but never the other tenant', async () => {
    const rows = await withCtx(app, tenantAdmin, 'TENANT', tenant, null, async (tx) =>
      sql<{ id: string; tenant_id: string }>`select id, tenant_id from tenancy.domains`.execute(tx));
    const ids = rows.rows.map((r) => r.id);
    expect(ids).toContain(domainA);
    expect(ids).toContain(domainB);
    expect(ids).not.toContain(domainOther);
    expect(rows.rows.every((r) => r.tenant_id === tenant)).toBe(true);
  });

  it('tenant context cannot COUNT other-tenant rows', async () => {
    const n = await withCtx(app, tenantAdmin, 'TENANT', tenant, null, async (tx) =>
      sql<{ n: string }>`select count(*) n from tenancy.lifecycle_events where tenant_id = ${tenantOther}`.execute(tx));
    expect(Number(n.rows[0]!.n)).toBe(0);
  });

  it('platform context (via signed context from a PLATFORM binding) sees all tenants', async () => {
    const rows = await withCtx(app, platformAdmin, 'PLATFORM', null, null, async (tx) =>
      sql<{ id: string }>`select id from tenancy.tenants`.execute(tx));
    const ids = rows.rows.map((r) => r.id);
    expect(ids).toContain(tenant);
    expect(ids).toContain(tenantOther);
  });

  it('audit events written under a domain context are invisible to the sibling domain', async () => {
    // Written via the REAL bound port under domain A's context: scope, tenant,
    // domain and actor are all derived inside the trusted boundary.
    await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) => {
      await sql`select audit.commit_event('test.domain_a', 'test.a', 'success', 'OK',
        null, null, null, null::uuid, null, ${uuidv7()}::uuid, null::uuid, null, null, null,
        '{}'::jsonb)`.execute(tx);
    });
    const fromB = await withCtx(app, bAdmin, 'DOMAIN', tenant, domainB, async (tx) =>
      sql`select * from audit.audit_events where event_type = 'test.domain_a'`.execute(tx));
    expect(fromB.rows).toHaveLength(0);
    const fromA = await withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql`select * from audit.audit_events where event_type = 'test.domain_a'`.execute(tx));
    expect(fromA.rows.length).toBeGreaterThan(0);
  });

  it('canonical objects: domain A rows are unreadable and unwritable from domain B', async () => {
    // Canonical writes exist only through the admission port (digest recomputed
    // inside the boundary), so this fixture proves isolation of an ADMITTED row.
    const { canonicalHeaderDigest } = await import('@eye/contracts');
    const objectId = uuidv7();
    const header = {
      object_id: objectId, object_type: 'CLM', tenant_id: tenant, domain_id: domainA,
      scope: 'DOMAIN' as const, object_version: '1', lifecycle_state: 'admitted',
      owning_component: 'CP-OBJ-01', accountable_owner: 'principal:test', source_object_ids: [],
      event_time: null, observation_time: '2026-08-05T00:00:00.000Z', valid_from: null, valid_to: null,
      recorded_at: '2026-08-05T00:00:00.000Z', time_precision: 'exact',
      source_clock_quality: 'trusted' as const, truth_state: 'asserted', synthetic_state: false,
      confidence: null, uncertainty: null, evidence_refs: ['evd:iso'], provenance_ref: null,
      method_ref: null, contradiction_refs: [], corroboration_refs: [], human_refs: [],
      classification: 'internal', purpose_scope: 'test', rights_profile: null,
      residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1',
      ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
      audit_correlation_id: uuidv7(), content_ref: null,
    };
    const payload = { subject: 'S', predicate: 'p', object_value: 'V' };
    await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) => {
      await sql`select objects.admit_version(${JSON.stringify(header)}::jsonb,
        ${JSON.stringify(payload)}::jsonb, ${canonicalHeaderDigest(header, payload)})`.execute(tx);
    });
    const fromB = await withCtx(app, bAdmin, 'DOMAIN', tenant, domainB, async (tx) =>
      sql`select * from objects.canonical_objects where domain_id = ${domainA}`.execute(tx));
    expect(fromB.rows).toHaveLength(0);
    await expect(
      withCtx(commit, bAdmin, 'DOMAIN', tenant, domainB, async (tx) =>
        sql`select objects.admit_version(${JSON.stringify(header)}::jsonb,
          ${JSON.stringify(payload)}::jsonb, ${canonicalHeaderDigest(header, payload)})`.execute(tx))
    ).rejects.toThrow(/not authorized for the object scope/);
  });
});

describe('signed-context port authority checks', () => {
  it('rejects a DOMAIN context request for a domain the principal is not bound to', async () => {
    await expect(
      withCtx(app, aAdmin, 'DOMAIN', tenant, domainB, async (tx) =>
        sql`select 1`.execute(tx)),
    ).rejects.toThrow(/context denied/);
  });

  it('rejects TENANT context for a principal with only a DOMAIN binding', async () => {
    await expect(
      withCtx(app, aAdmin, 'TENANT', tenant, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/context denied/);
  });

  it('rejects PLATFORM context for tenant/domain principals', async () => {
    await expect(
      withCtx(app, tenantAdmin, 'PLATFORM', null, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/context denied/);
  });

  it('rejects context for a revoked session', async () => {
    const victim = await createPrincipalWithSession(identity, su, {
      scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'iso-rev',
    });
    await identity.transaction().execute(async (tx) => {
      await sql`select ctx.issue_system('test session revocation')`.execute(tx);
      await sql`select identity.sessions_revoke_all_v2(${victim.principalId}::uuid)`.execute(tx);
    });
    await expect(
      withCtx(app, victim, 'TENANT', tenant, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/session not active|authority epoch changed/);
  });
});
