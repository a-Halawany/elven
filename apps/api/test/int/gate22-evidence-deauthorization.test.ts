/**
 * GATE-2.2 C2 — EVIDENCE MODE CARRIES NO BUSINESS CAPABILITY.
 *
 * An evidence context is minted to record WHY a request was denied. Before this
 * closure it also carried the read reach of its scope: it could SELECT the very
 * business rows the request was denied. These tests prove that an evidence
 * context now sees ZERO business rows through RLS, cannot elevate its scope, and
 * cannot obtain tenant-wide or sibling-domain reach from a DOMAIN subject —
 * while an authority context (the control) still reads normally.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import {
  commitDb, identityDb, superDb, seedTenant, seedDomain, createPrincipalWithSession,
  withCtx, withEvidenceCtx, closeOperation, type AnyDb, type TestPrincipal,
} from './helpers.js';

let commit: AnyDb;
let identity: AnyDb;
let su: AnyDb;
let tenant = '';
let tenantOther = '';
let domainA = '';
let domainB = '';
let aAdmin: TestPrincipal;
let tenantAdmin: TestPrincipal;

const BUSINESS_TABLES = [
  'tenancy.tenants', 'tenancy.domains', 'tenancy.lifecycle_events',
  'identity.principals', 'identity.role_bindings',
  'policy.policy_decisions', 'audit.audit_events',
  'objects.canonical_objects', 'objects.object_outbox',
];

beforeAll(async () => {
  commit = commitDb(); identity = identityDb(); su = superDb();
  tenant = await seedTenant(su, 'c2-t');
  tenantOther = await seedTenant(su, 'c2-o');
  domainA = await seedDomain(su, tenant, 'c2-a');
  domainB = await seedDomain(su, tenant, 'c2-b');
  aAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'c2-a' });
  tenantAdmin = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'c2-t' });

  // Seed one real, fully-closed canonical object in domain A so there is genuine
  // business data that an evidence context might try to read.
  const header: CanonicalHeader = {
    object_id: uuidv7(), object_type: 'CLM', tenant_id: tenant, domain_id: domainA,
    scope: 'DOMAIN', object_version: '1', lifecycle_state: 'admitted',
    owning_component: 'CP-OBJ-01', accountable_owner: 'principal:test', source_object_ids: [],
    event_time: null, observation_time: '2026-08-05T00:00:00.000Z', valid_from: null, valid_to: null,
    recorded_at: '2026-08-05T00:00:00.000Z', time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'asserted', synthetic_state: false, confidence: null, uncertainty: null,
    evidence_refs: ['evd:c2'], provenance_ref: null, method_ref: null, contradiction_refs: [],
    corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'test',
    rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1',
    ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
    audit_correlation_id: uuidv7(), content_ref: null,
  };
  const payload = { subject: 'a', predicate: 'b', object_value: 'c' };
  await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
    const h = { ...header, audit_correlation_id: cap.correlationId };
    await sql`select objects.admit_version(${JSON.stringify(h)}::jsonb,
      ${JSON.stringify(payload)}::jsonb, ${canonicalHeaderDigest(h, payload)})`.execute(tx);
    await closeOperation(tx, cap, { type: 'CLM', id: h.object_id });
  }, { action: 'objects.create', target: header.object_id });
});

afterAll(async () => {
  await Promise.all([commit, identity, su].map((d) => d.destroy()));
});

describe('C2 — an authority context reads (control), an evidence context does not', () => {
  it('the authority context CAN see its own canonical object (proves reads still work)', async () => {
    const rows = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql`select object_id from objects.canonical_objects where domain_id = ${domainA}`.execute(tx));
    expect(rows.rows.length).toBeGreaterThan(0);
  });

  it('an EVIDENCE context sees ZERO rows in every business table', async () => {
    await withEvidenceCtx(
      commit, aAdmin,
      { scope: 'DOMAIN', tenantId: tenant, domainId: domainA },
      { scope: 'DOMAIN', tenantId: tenant, domainId: domainA },
      async (tx) => {
        for (const table of BUSINESS_TABLES) {
          const rows = await sql`select * from ${sql.raw(table)} limit 5`.execute(tx);
          expect(rows.rows, `${table} under evidence mode`).toHaveLength(0);
        }
      },
    );
  });

  it('an EVIDENCE context cannot COUNT rows either (no existence inference)', async () => {
    await withEvidenceCtx(
      commit, aAdmin,
      { scope: 'DOMAIN', tenantId: tenant, domainId: domainA },
      { scope: 'DOMAIN', tenantId: tenant, domainId: domainA },
      async (tx) => {
        const n = await sql<{ n: string }>`select count(*) n from objects.canonical_objects`.execute(tx);
        expect(Number(n.rows[0]!.n)).toBe(0);
      },
    );
  });
});

describe('C2 — an evidence context cannot elevate or widen its scope', () => {
  it('a DOMAIN subject cannot mint PLATFORM evidence', async () => {
    await expect(
      withEvidenceCtx(
        commit, aAdmin,
        { scope: 'PLATFORM', tenantId: null, domainId: null },
        { scope: 'PLATFORM', tenantId: null, domainId: null },
        async (tx) => sql`select 1`.execute(tx),
      ),
    ).rejects.toThrow(/scope|denied|not authorized|no qualifying/i);
  });

  it('a DOMAIN subject cannot mint tenant-wide (domain-null) evidence', async () => {
    await expect(
      withEvidenceCtx(
        commit, aAdmin,
        { scope: 'TENANT', tenantId: tenant, domainId: null },
        { scope: 'TENANT', tenantId: tenant, domainId: null },
        async (tx) => sql`select 1`.execute(tx),
      ),
    ).rejects.toThrow(/scope|denied|not authorized|no qualifying/i);
  });

  it('a DOMAIN subject cannot mint sibling-domain evidence', async () => {
    await expect(
      withEvidenceCtx(
        commit, aAdmin,
        { scope: 'DOMAIN', tenantId: tenant, domainId: domainB },
        { scope: 'DOMAIN', tenantId: tenant, domainId: domainB },
        async (tx) => sql`select 1`.execute(tx),
      ),
    ).rejects.toThrow(/scope|denied|not authorized|no qualifying/i);
  });

  it('a tenant subject cannot read the OTHER tenant even in an authority context', async () => {
    // Control on the isolation direction that evidence mode also cannot cross.
    const rows = await withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx) =>
      sql`select id from tenancy.tenants where id = ${tenantOther}`.execute(tx));
    expect(rows.rows).toHaveLength(0);
  });
});
