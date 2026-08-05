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
  appDb, systemDb, superDb, seedTenant, seedDomain,
  createPrincipalWithSession, withCtx, type AnyDb, type TestPrincipal,
} from './helpers.js';

let app: AnyDb;
let system: AnyDb;
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
  system = systemDb();
  su = superDb();
  tenant = await seedTenant(su, 'iso-t');
  tenantOther = await seedTenant(su, 'iso-o');
  domainA = await seedDomain(su, tenant, 'dom-a');
  domainB = await seedDomain(su, tenant, 'dom-b');
  domainOther = await seedDomain(su, tenantOther, 'dom-o');

  platformAdmin = await createPrincipalWithSession(system, { scope: 'PLATFORM', roleCode: 'platform_admin', label: 'iso-p' });
  tenantAdmin = await createPrincipalWithSession(system, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'iso-t' });
  aAdmin = await createPrincipalWithSession(system, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'iso-a' });
  bAdmin = await createPrincipalWithSession(system, { scope: 'DOMAIN', tenantId: tenant, domainId: domainB, roleCode: 'domain_admin', label: 'iso-b' });

  // Seed one row per scoped table in EACH domain (A, B, other-tenant) through
  // domain contexts (writes) so write-isolation is exercised on the way in.
  for (const [who, t, d] of [
    [aAdmin, tenant, domainA],
    [bAdmin, tenant, domainB],
  ] as const) {
    await withCtx(app, who, 'DOMAIN', t, d, async (tx) => {
      await sql`insert into tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
        values (${uuidv7()}, 'DOMAIN', ${t}, ${d}, 'domain.test', ${'principal:' + who.principalId}, '{}')`.execute(tx);
      await sql`insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, status)
        values (${uuidv7()}, 'DOMAIN', ${t}, ${d}, 'test.event', '{}', ${uuidv7()}, ${uuidv7()}, 'pending')`.execute(tx);
      await sql`select policy.append_decision(${JSON.stringify({
        id: uuidv7(), scope: 'DOMAIN', tenant_id: t, domain_id: d, decision: 'allow',
        obligations: [], principal_id: `principal:${who.principalId}`, delegation_id: null,
        action: 'test.action', object_type: 'CLM', object_id: null, purpose_id: 'test',
        consequence_class: 'C1', environment: {}, input_digest: 'x'.repeat(64),
        bundle_version: 'bundle-v1', exception_ref: null, expires_at: null,
        revocation_state: 'none', reason: 'isolation fixture', correlation_id: uuidv7(),
      })}::jsonb)`.execute(tx);
    });
  }
});

afterAll(async () => {
  await app.destroy();
  await system.destroy();
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

  it('domain A cannot WRITE rows labeled domain B (RLS WITH CHECK)', async () => {
    await expect(
      withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`insert into tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
          values (${uuidv7()}, 'DOMAIN', ${tenant}, ${domainB}, 'domain.forged', 'principal:a', '{}')`.execute(tx)),
    ).rejects.toThrow(/row-level security|policy/i);
    await expect(
      withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
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
    // Written via the real append port under domain A's signed context.
    await withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) => {
      const head = (
        await sql<{ seq: string; prev_hash: string }>`select * from audit.advance_chain_head(${'tenant:' + tenant})`.execute(tx)
      ).rows[0]!;
      const { auditRowHash } = await import('@eye/contracts');
      const event = {
        event_type: 'test.domain_a', outcome: 'success', scope: 'DOMAIN',
        tenant_id: tenant, domain_id: domainA, actor: `principal:${aAdmin.principalId}`,
        delegation_id: null, action: 'test.a', target_type: null, target_id: null,
        target_version: null, purpose_id: 'test', policy_decision_id: null,
        policy_version: null, result_code: 'OK', occurred_at: new Date().toISOString(),
        clock_quality: 'trusted', correlation_id: uuidv7(), causation_id: null,
        trace_id: null, request_digest: null, metadata: {},
      };
      const rowHash = auditRowHash({
        partitionId: `tenant:${tenant}`, auditSeq: Number(head.seq),
        previousHash: head.prev_hash, event: event as never,
      });
      await sql`select audit.append_event(${'tenant:' + tenant}, ${Number(head.seq)}, ${JSON.stringify(event)}::jsonb, ${head.prev_hash}, ${rowHash})`.execute(tx);
    });
    const fromB = await withCtx(app, bAdmin, 'DOMAIN', tenant, domainB, async (tx) =>
      sql`select * from audit.audit_events where event_type = 'test.domain_a'`.execute(tx));
    expect(fromB.rows).toHaveLength(0);
    const fromA = await withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql`select * from audit.audit_events where event_type = 'test.domain_a'`.execute(tx));
    expect(fromA.rows.length).toBeGreaterThan(0);
  });

  it('canonical objects: domain A rows are unreadable and unwritable from domain B', async () => {
    await withCtx(app, aAdmin, 'DOMAIN', tenant, domainA, async (tx) => {
      await sql`insert into objects.canonical_objects (
        object_id, object_type, tenant_id, domain_id, scope, object_version,
        lifecycle_state, owning_component, accountable_owner, truth_state,
        classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest, evidence_refs
      ) values (
        ${uuidv7()}, 'CLM', ${tenant}, ${domainA}, 'DOMAIN', 1,
        'admitted', 'CP-OBJ-01', 'principal:test', 'asserted',
        'internal', 'test', 'CLM@v1', ${uuidv7()}, '{}', ${'c'.repeat(64)}, '["e:1"]'
      )`.execute(tx);
    });
    const fromB = await withCtx(app, bAdmin, 'DOMAIN', tenant, domainB, async (tx) =>
      sql`select * from objects.canonical_objects where domain_id = ${domainA}`.execute(tx));
    expect(fromB.rows).toHaveLength(0);
    await expect(
      withCtx(app, bAdmin, 'DOMAIN', tenant, domainB, async (tx) =>
        sql`insert into objects.canonical_objects (
          object_id, object_type, tenant_id, domain_id, scope, object_version,
          lifecycle_state, owning_component, accountable_owner, truth_state,
          classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest, evidence_refs
        ) values (
          ${uuidv7()}, 'CLM', ${tenant}, ${domainA}, 'DOMAIN', 1,
          'admitted', 'CP-OBJ-01', 'principal:forged', 'asserted',
          'internal', 'test', 'CLM@v1', ${uuidv7()}, '{}', ${'d'.repeat(64)}, '["e:1"]'
        )`.execute(tx)),
    ).rejects.toThrow(/row-level security|policy/i);
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
    const victim = await createPrincipalWithSession(system, {
      scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'iso-rev',
    });
    await system.transaction().execute(async (tx) => {
      await sql`select public.eye_set_system_context('test session revocation')`.execute(tx);
      await sql`select identity.sessions_revoke_all(${victim.principalId}::uuid)`.execute(tx);
    });
    await expect(
      withCtx(app, victim, 'TENANT', tenant, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/context denied: no active session/);
  });
});
