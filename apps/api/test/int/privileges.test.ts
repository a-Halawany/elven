/**
 * R10 mandated tests 3, 4 & 5 — privilege boundary of the general application
 * role, exercised against the REAL database roles and definer ports.
 *
 *  3. eye_app cannot self-elevate through custom GUCs (raw eye.scope /
 *     eye.tenant_id / eye.domain_id are inert; a forged eye.ctx fails its
 *     signature and yields scope NONE → zero visibility).
 *  4. Credentials, sessions and break-glass grants have NO direct app access.
 *  5. eye_app cannot forge POL/AUD evidence (no direct inserts; the definer
 *     append ports reject context/scope mismatches) and cannot invoke governed
 *     recovery (freeze / rebuild / incident / seal / system-context ports).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { auditRowHash } from '@eye/contracts';
import {
  appDb, systemDb, superDb, allocatorDb, seedTenant, seedDomain,
  createPrincipalWithSession, withCtx, type AnyDb, type TestPrincipal,
} from './helpers.js';

let app: AnyDb;
let system: AnyDb;
let su: AnyDb;
let allocator: AnyDb;
let tenant = '';
let domainA = '';
let tenantOther = '';
let domAdmin: TestPrincipal;

beforeAll(async () => {
  app = appDb();
  system = systemDb();
  su = superDb();
  allocator = allocatorDb();
  tenant = await seedTenant(su, 'priv-t');
  tenantOther = await seedTenant(su, 'priv-o');
  domainA = await seedDomain(su, tenant, 'priv-a');
  domAdmin = await createPrincipalWithSession(system, {
    scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'priv',
  });
});

afterAll(async () => {
  await app.destroy();
  await system.destroy();
  await su.destroy();
  await allocator.destroy();
});

describe('mandated 3 — no self-elevation through custom GUCs', () => {
  it('raw eye.scope/eye.tenant_id/eye.domain_id GUCs grant nothing', async () => {
    const rows = await app.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
      await sql`select set_config('eye.tenant_id', ${tenant}, true)`.execute(tx);
      await sql`select set_config('eye.domain_id', ${domainA}, true)`.execute(tx);
      return tx.selectFrom('tenancy.tenants').selectAll().execute();
    });
    expect(rows).toHaveLength(0);
  });

  it('a forged eye.ctx (bad signature) resolves to scope NONE and zero rows', async () => {
    const out = await app.transaction().execute(async (tx) => {
      await sql`select set_config('eye.ctx', ${'PLATFORM|||' + 'f'.repeat(64)}, true)`.execute(tx);
      const scope = (await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s;
      const tenants = await tx.selectFrom('tenancy.tenants').selectAll().execute();
      return { scope, tenants };
    });
    expect(out.scope).toBe('NONE');
    expect(out.tenants).toHaveLength(0);
  });

  it('a stolen valid context cannot be replayed with widened identifiers', async () => {
    // Get a REAL signed DOMAIN context, then try to swap the tenant portion.
    await expect(
      app.transaction().execute(async (tx) => {
        await sql`select public.eye_set_context(${domAdmin.sessionId}::uuid, 'DOMAIN', ${tenant}::uuid, ${domainA}::uuid)`.execute(tx);
        const ctx = (await sql<{ c: string }>`select current_setting('eye.ctx', true) c`.execute(tx)).rows[0]!.c;
        const [, , domain, sig] = ctx.split('|');
        await sql`select set_config('eye.ctx', ${'TENANT|' + tenantOther + '|' + (domain ?? '') + '|' + sig}, true)`.execute(tx);
        const scope = (await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s;
        expect(scope).toBe('NONE'); // signature no longer verifies
        return sql`select count(*) n from tenancy.lifecycle_events where tenant_id = ${tenantOther}`.execute(tx);
      }).then((r) => Number((r.rows[0] as { n: string }).n)),
    ).resolves.toBe(0);
  });
});

describe('mandated 4 — no direct access to secret-bearing tables', () => {
  const SECRET_TABLES = ['identity.credentials', 'identity.sessions', 'identity.break_glass_grants'];

  it('eye_app cannot SELECT credentials/sessions/break-glass — even with a valid context', async () => {
    for (const table of SECRET_TABLES) {
      await expect(
        withCtx(app, domAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
          sql`select * from ${sql.raw(table)} limit 1`.execute(tx)),
        table,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('eye_app cannot INSERT/UPDATE/DELETE those tables', async () => {
    await expect(
      sql`insert into identity.sessions (id, principal_id, assurance, status, refresh_token_hash, expires_at)
        values (${uuidv7()}, ${domAdmin.principalId}, 'password', 'active', 'h', now() + interval '1 hour')`.execute(app),
    ).rejects.toThrow(/permission denied/);
    await expect(sql`update identity.credentials set status = 'active'`.execute(app)).rejects.toThrow(/permission denied/);
    await expect(sql`delete from identity.break_glass_grants`.execute(app)).rejects.toThrow(/permission denied/);
  });

  it('the allocator role cannot read credential or session hashes either', async () => {
    await expect(sql`select * from identity.credentials limit 1`.execute(allocator)).rejects.toThrow(/permission denied/);
    await expect(sql`select * from identity.sessions limit 1`.execute(allocator)).rejects.toThrow(/permission denied/);
  });

  it('the allocator role cannot INSERT audit evidence (heads ownership only)', async () => {
    await expect(
      sql`insert into audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
        values ('platform', 999999, '{}', ${'0'.repeat(64)}, ${'1'.repeat(64)})`.execute(allocator),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('mandated 5 — no evidence forgery, no governed recovery from eye_app', () => {
  it('direct INSERT into POL/AUD evidence tables is denied', async () => {
    await expect(
      sql`insert into policy.policy_decisions (id, scope, tenant_id, domain_id, decision, obligations, principal_id, action, object_type, purpose_id, consequence_class, environment, input_digest, bundle_version, revocation_state, reason, correlation_id)
        values (${uuidv7()}, 'PLATFORM', null, null, 'allow', '[]', 'principal:forged', 'x', 'CLM', 'p', 'C1', '{}', ${'a'.repeat(64)}, 'v', 'none', 'forged', ${uuidv7()})`.execute(app),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sql`insert into audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
        values ('platform', 999999, '{}', ${'0'.repeat(64)}, ${'1'.repeat(64)})`.execute(app),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sql`insert into audit.audit_seals (id, partition_id, range_start_seq, range_end_seq, head_hash, sealer)
        values (${uuidv7()}, 'platform', 1, 1, ${'2'.repeat(64)}, 'forged')`.execute(app),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sql`insert into audit.integrity_incidents (id, partition_id, range_start_seq, range_end_seq, details)
        values (${uuidv7()}, 'platform', 1, 1, '{}')`.execute(app),
    ).rejects.toThrow(/permission denied/);
  });

  it('audit.append_event rejects evidence outside the signed context scope', async () => {
    const mkEvent = (tenantId: string) => ({
      event_type: 'forge.attempt', outcome: 'success', scope: 'TENANT',
      tenant_id: tenantId, domain_id: null, actor: 'principal:forged',
      delegation_id: null, action: 'forge', target_type: null, target_id: null,
      target_version: null, purpose_id: 'p', policy_decision_id: null,
      policy_version: null, result_code: 'OK', occurred_at: new Date().toISOString(),
      clock_quality: 'trusted', correlation_id: uuidv7(), causation_id: null,
      trace_id: null, request_digest: null, metadata: {},
    });
    // (a) no context at all:
    await expect(
      app.transaction().execute(async (tx) => {
        const ev = mkEvent(tenantOther);
        const hash = auditRowHash({ partitionId: `tenant:${tenantOther}`, auditSeq: 1, previousHash: '0'.repeat(64), event: ev as never });
        await sql`select audit.append_event(${'tenant:' + tenantOther}, 1, ${JSON.stringify(ev)}::jsonb, ${'0'.repeat(64)}, ${hash})`.execute(tx);
      }),
    ).rejects.toThrow(/context not authorized/);
    // (b) DOMAIN-A context forging OTHER-tenant evidence:
    await expect(
      withCtx(app, domAdmin, 'DOMAIN', tenant, domainA, async (tx) => {
        const ev = mkEvent(tenantOther);
        const hash = auditRowHash({ partitionId: `tenant:${tenantOther}`, auditSeq: 1, previousHash: '0'.repeat(64), event: ev as never });
        await sql`select audit.append_event(${'tenant:' + tenantOther}, 1, ${JSON.stringify(ev)}::jsonb, ${'0'.repeat(64)}, ${hash})`.execute(tx);
      }),
    ).rejects.toThrow(/context not authorized/);
    // (c) partition/event mismatch (event says tenant, partition says platform):
    await expect(
      withCtx(app, domAdmin, 'DOMAIN', tenant, domainA, async (tx) => {
        const ev = mkEvent(tenant);
        const hash = auditRowHash({ partitionId: 'platform', auditSeq: 1, previousHash: '0'.repeat(64), event: ev as never });
        await sql`select audit.append_event('platform', 1, ${JSON.stringify(ev)}::jsonb, ${'0'.repeat(64)}, ${hash})`.execute(tx);
      }),
    ).rejects.toThrow(/partition\/event scope mismatch/);
  });

  it('policy.append_decision rejects decisions outside the signed context scope', async () => {
    const decision = (scope: string, tenantId: string | null, domainId: string | null) => ({
      id: uuidv7(), scope, tenant_id: tenantId, domain_id: domainId, decision: 'allow',
      obligations: [], principal_id: 'principal:forged', delegation_id: null,
      action: 'forge', object_type: 'CLM', object_id: null, purpose_id: 'p',
      consequence_class: 'C1', environment: {}, input_digest: 'x'.repeat(64),
      bundle_version: 'v', exception_ref: null, expires_at: null,
      revocation_state: 'none', reason: 'forged', correlation_id: uuidv7(),
    });
    await expect(
      withCtx(app, domAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`select policy.append_decision(${JSON.stringify(decision('PLATFORM', null, null))}::jsonb)`.execute(tx)),
    ).rejects.toThrow(/scope mismatch/);
    await expect(
      withCtx(app, domAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`select policy.append_decision(${JSON.stringify(decision('TENANT', tenantOther, null))}::jsonb)`.execute(tx)),
    ).rejects.toThrow(/scope mismatch/);
  });

  it('governed recovery and sealing ports are unreachable for eye_app', async () => {
    await expect(sql`select audit.freeze_partition('platform')`.execute(app)).rejects.toThrow(/permission denied/);
    await expect(sql`select audit.rebuild_chain_heads()`.execute(app)).rejects.toThrow(/permission denied/);
    await expect(
      sql`select audit.open_integrity_incident(${uuidv7()}, 'platform', 1, 1, '{}'::jsonb)`.execute(app),
    ).rejects.toThrow(/permission denied/);
    await expect(sql`select * from audit.lock_head_for_seal('platform')`.execute(app)).rejects.toThrow(/permission denied/);
    await expect(
      sql`select audit.append_seal(${uuidv7()}, 'platform', 1, 1, ${'a'.repeat(64)}, 'forged')`.execute(app),
    ).rejects.toThrow(/permission denied/);
    await expect(sql`select audit.commit_chain_head('platform', 1, ${'a'.repeat(64)})`.execute(app)).rejects.toThrow(/permission denied/);
    await expect(sql`select public.eye_set_system_context('forged')`.execute(app)).rejects.toThrow(/permission denied/);
  });
});
