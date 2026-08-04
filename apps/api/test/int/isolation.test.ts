/**
 * Tenant isolation integration tests (TS-007, ES-51) — RLS as the independent
 * second enforcement. Missing context sees nothing (fail closed); tenant
 * context sees only its tenant; no cross-tenant reads through any table.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { uuidv7 } from 'uuidv7';

const HOST = process.env['EYE_DB_HOST'] ?? 'localhost';
const PORT = Number(process.env['EYE_DB_PORT'] ?? 5432);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: Kysely<any>;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  app = new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        host: HOST, port: PORT, database: 'eye',
        user: process.env['EYE_DB_APP_USER'] ?? 'eye_app',
        password: process.env['EYE_DB_APP_PASSWORD'] ?? 'eye_app_local_dev',
        max: 4,
      }),
    }),
  });
  tenantA = uuidv7();
  tenantB = uuidv7();
  // Seed two tenants under PLATFORM context.
  await app.transaction().execute(async (tx) => {
    await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
    await tx.insertInto('tenancy.tenants').values([
      { id: tenantA, name: `iso-a-${tenantA.slice(-12)}`, status: 'active' },
      { id: tenantB, name: `iso-b-${tenantB.slice(-12)}`, status: 'active' },
    ]).execute();
    await tx.insertInto('tenancy.domains').values([
      { id: uuidv7(), tenant_id: tenantA, name: 'a-domain', status: 'active' },
      { id: uuidv7(), tenant_id: tenantB, name: 'b-domain', status: 'active' },
    ]).execute();
  });
});

afterAll(async () => {
  await app.destroy();
});

describe('RLS fail-closed isolation', () => {
  it('no scope context → zero rows (fail closed), even though rows exist', async () => {
    const rows = await app.selectFrom('tenancy.tenants').selectAll().execute();
    expect(rows).toHaveLength(0);
  });

  it('tenant A context sees only tenant A', async () => {
    const rows = await app.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'TENANT', true)`.execute(tx);
      await sql`select set_config('eye.tenant_id', ${tenantA}, true)`.execute(tx);
      return tx.selectFrom('tenancy.domains').selectAll().execute();
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows as Array<{ tenant_id: string }>) expect(r.tenant_id).toBe(tenantA);
  });

  it('tenant A context cannot read tenant B rows through any tenancy/audit/policy table', async () => {
    const counts = await app.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'TENANT', true)`.execute(tx);
      await sql`select set_config('eye.tenant_id', ${tenantA}, true)`.execute(tx);
      const domains = await tx.selectFrom('tenancy.domains').selectAll().where('tenant_id', '=', tenantB).execute();
      const tenants = await tx.selectFrom('tenancy.tenants').selectAll().where('id', '=', tenantB).execute();
      const audit = await tx.selectFrom('audit.audit_events').selectAll().where('tenant_id', '=', tenantB).execute();
      const pol = await tx.selectFrom('policy.policy_decisions').selectAll().where('tenant_id', '=', tenantB).execute();
      return { domains: domains.length, tenants: tenants.length, audit: audit.length, pol: pol.length };
    });
    expect(counts).toEqual({ domains: 0, tenants: 0, audit: 0, pol: 0 });
  });

  it('cross-tenant INSERT is rejected by RLS write policy', async () => {
    await expect(
      app.transaction().execute(async (tx) => {
        await sql`select set_config('eye.scope', 'TENANT', true)`.execute(tx);
        await sql`select set_config('eye.tenant_id', ${tenantA}, true)`.execute(tx);
        await tx
          .insertInto('tenancy.domains')
          .values({ id: uuidv7(), tenant_id: tenantB, name: 'smuggled', status: 'active' })
          .execute();
      }),
    ).rejects.toThrow(/row-level security|violates/);
  });

  it('append-only lifecycle events reject UPDATE even for permitted tenant', async () => {
    await expect(
      app.transaction().execute(async (tx) => {
        await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
        await sql`update tenancy.lifecycle_events set event = 'rewritten' where tenant_id = ${tenantA}`.execute(tx);
      }),
    ).rejects.toThrow(/append-only|permission denied/);
  });
});

describe('canonical objects append-only at DB level (acceptance criterion 8)', () => {
  it('UPDATE and DELETE on canonical_objects are rejected for the app role', async () => {
    await expect(
      app.transaction().execute(async (tx) => {
        await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
        await sql`update objects.canonical_objects set classification = 'tampered'`.execute(tx);
      }),
    ).rejects.toThrow(/permission denied|append-only/);
    await expect(
      app.transaction().execute(async (tx) => {
        await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
        await sql`delete from objects.canonical_objects`.execute(tx);
      }),
    ).rejects.toThrow(/permission denied|append-only/);
  });

  it('minimum-provenance CHECK constraint holds at the database level too', async () => {
    await expect(
      app.transaction().execute(async (tx) => {
        await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
        await tx
          .insertInto('objects.canonical_objects')
          .values({
            object_id: uuidv7(), object_type: 'CLM', tenant_id: null, domain_id: null,
            scope: 'PLATFORM', object_version: 1, lifecycle_state: 'proposed',
            owning_component: 'test', accountable_owner: 'test',
            truth_state: 'asserted', synthetic_state: false,
            classification: 'internal', purpose_scope: 'test', schema_ref: 'CLM@v1',
            audit_correlation_id: uuidv7(), payload: '{}', content_digest: 'a'.repeat(64),
            source_object_ids: '[]', evidence_refs: '[]', human_refs: '[]',
            contradiction_refs: '[]', corroboration_refs: '[]',
          })
          .execute();
      }),
    ).rejects.toThrow(/minimum_provenance|violates/);
  });
});
