/**
 * GATE-2.1 ADVERSARIAL MATRIX — the 22 mandated regression tests.
 *
 * Each test attacks the REAL roles, the REAL capability minters, the REAL definer
 * ports and the REAL services. Nothing here is satisfied by source inspection, by
 * reimplementing production logic, by widening a grant, by weakening a scope
 * check, or by converting an invariant failure into an exception.
 *
 *   1  every runtime role is denied every other role's operation
 *   2  commit/identity cannot insert AUD/POL directly nor touch chain heads
 *   3  the verifier cannot append audit events
 *   4  the publisher cannot directly update outbox status
 *   5  commit cannot create a pre-published outbox row
 *   6  evidence mode cannot create tenants, domains, principals or objects
 *   7  evidence mode cannot record a fabricated allow or success
 *   8  a capability for action A cannot perform action B
 *   9  a one-second capability expires after real elapsed time in one transaction
 *  10  mint in A, revoke session in B ⇒ A's write fails
 *  11  the same for binding revocation and credential rotation
 *  12  DOMAIN cannot read tenant-global partition state
 *  13  application lookups cannot reach another tenant's identity metadata
 *  19  correctly digested but semantically invalid headers are rejected
 *  20  migration without EYE_DB_MIGRATE_PASSWORD fails before connecting
 *
 * Tests 14–17 are observable only end-to-end and run in the acceptance suite
 * (governed 403 with POL/AUD, sanitized controller evidence, degraded readiness
 * across restart, audit.verify outcomes). Test 18 is the RFC 8785 cross-language
 * corpus (rfc8785-crosslang.test.ts). Tests 21–22 are CI supply-chain gates with
 * controlled negative fixtures (test/gate/supply-chain.test.ts). Each is
 * cross-referenced here so the matrix is auditable in one place.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import {
  appDb, commitDb, identityDb, publisherDb, verifierDb, recoveryDb, superDb, allocatorDb,
  seedTenant, seedDomain, createPrincipalWithSession, withCtx, withEvidenceCtx,
  withPublishCtx, withVerifyCtx, commitDecision, closeOperation, type AnyDb, type TestPrincipal,
} from './helpers.js';

let app: AnyDb, commit: AnyDb, identity: AnyDb, publisher: AnyDb;
let verifier: AnyDb, recovery: AnyDb, su: AnyDb, allocator: AnyDb;

let tenant = '', tenantOther = '', domainA = '', domainB = '', domainOther = '';
let platformAdmin: TestPrincipal, tenantAdmin: TestPrincipal, aAdmin: TestPrincipal;
let otherAdmin: TestPrincipal;

beforeAll(async () => {
  app = appDb(); commit = commitDb(); identity = identityDb(); publisher = publisherDb();
  verifier = verifierDb(); recovery = recoveryDb(); su = superDb(); allocator = allocatorDb();

  tenant = await seedTenant(su, 'g21-t');
  tenantOther = await seedTenant(su, 'g21-o');
  domainA = await seedDomain(su, tenant, 'g21-a');
  domainB = await seedDomain(su, tenant, 'g21-b');
  domainOther = await seedDomain(su, tenantOther, 'g21-o');

  platformAdmin = await createPrincipalWithSession(identity, su, { scope: 'PLATFORM', roleCode: 'platform_admin', label: 'g21-p' });
  tenantAdmin = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'g21-t' });
  aAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'g21-a' });
  otherAdmin = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenantOther, roleCode: 'tenant_admin', label: 'g21-o' });
});

afterAll(async () => {
  await Promise.all([app, commit, identity, publisher, verifier, recovery, su, allocator].map((d) => d.destroy()));
});

/** A complete, registry-valid canonical header. */
function fullHeader(over: Partial<CanonicalHeader> = {}): CanonicalHeader {
  return {
    object_id: uuidv7(), object_type: 'CLM', tenant_id: tenant, domain_id: domainA,
    scope: 'DOMAIN', object_version: '1', lifecycle_state: 'admitted',
    owning_component: 'CP-OBJ-01', accountable_owner: 'principal:test', source_object_ids: [],
    event_time: null, observation_time: '2026-08-05T00:00:00.000Z', valid_from: null, valid_to: null,
    recorded_at: '2026-08-05T00:00:00.000Z', time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'asserted', synthetic_state: false, confidence: null, uncertainty: null,
    evidence_refs: ['evd:g21'], provenance_ref: null, method_ref: null, contradiction_refs: [],
    corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'test',
    rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1',
    ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
    audit_correlation_id: uuidv7(), content_ref: null,
    ...over,
  } as CanonicalHeader;
}

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-1 — every runtime role is denied every other role’s operation', () => {
  /**
   * The matrix is derived from the ACTUAL grant catalog, not from a hand-written
   * list: for every governed port, the database is asked which roles hold EXECUTE,
   * and every other role must be refused. A widened grant makes this fail.
   */
  const PORTS: Array<{ port: string; owner: string[] }> = [
    { port: 'audit.commit_event(text,text,text,text,text,text,text,uuid,text,uuid,uuid,text,text,text,jsonb)', owner: ['eye_commit', 'eye_identity'] },
    { port: 'audit.commit_identity_event(uuid,uuid,text,text,text,text,uuid,jsonb)', owner: ['eye_identity'] },
    { port: 'audit.commit_integrity_event(text,text,text,uuid,jsonb)', owner: ['eye_verifier'] }, // (partition, outcome, result_code, correlation, detail)
    { port: 'audit.commit_intake_event(text,text,text,uuid,uuid,jsonb)', owner: ['eye_identity'] },
    { port: 'audit.advance_chain_head(text)', owner: [] },
    { port: 'audit.commit_chain_head(text,bigint,text)', owner: [] },
    { port: 'audit.rebuild_chain_heads()', owner: ['eye_recovery'] },
    { port: 'objects.outbox_lease(integer,integer)', owner: ['eye_publisher'] },
    { port: 'objects.outbox_ack_leased(uuid,uuid,text,text)', owner: ['eye_publisher'] },
    { port: 'objects.enqueue_event(uuid,text,jsonb,uuid,uuid)', owner: ['eye_commit'] },
    { port: 'objects.admit_version(jsonb,jsonb,text)', owner: ['eye_commit'] },
    { port: 'identity.create_principal(uuid,text,text,uuid,uuid,text,text,text,text)', owner: ['eye_identity'] },
    { port: 'identity.session_open(uuid,uuid,text,text,text,timestamptz,uuid)', owner: ['eye_identity'] },
    { port: 'identity.refresh_rotate_family(text,text,text)', owner: ['eye_identity'] },
    { port: 'identity.auth_lookup(text)', owner: ['eye_identity'] },
    { port: 'tenancy.create_tenant(uuid,text,text)', owner: ['eye_commit'] },       // C6: actor removed
    { port: 'ctx.issue_commit(uuid,text,text,uuid,uuid,text,text,text,uuid,uuid,text,text,integer)', owner: ['eye_commit', 'eye_identity'] },
    { port: 'ctx.issue_publish(uuid)', owner: ['eye_publisher'] },
    { port: 'ctx.issue_verify(text,boolean)', owner: ['eye_verifier'] },
    { port: 'ctx.issue_identity_op(text,uuid,uuid,integer)', owner: ['eye_identity'] },
    { port: 'ctx.issue_bootstrap(uuid)', owner: ['eye_identity'] },
  ];
  const ROLES = ['eye_app', 'eye_commit', 'eye_identity', 'eye_publisher', 'eye_verifier', 'eye_recovery'];

  it('the live grant catalog matches the intended one-role-per-port matrix exactly', async () => {
    const violations: string[] = [];
    for (const { port, owner } of PORTS) {
      const rows = await sql<{ role: string; granted: boolean }>`
        select r as role, has_function_privilege(r, ${port}, 'EXECUTE') as granted
          from unnest(${sql.raw(`ARRAY[${ROLES.map((r) => `'${r}'`).join(',')}]`)}) r`.execute(su);
      const actual = rows.rows.filter((x) => x.granted).map((x) => x.role).sort();
      const expected = [...owner].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        violations.push(`${port}: expected [${expected.join(',')}], found [${actual.join(',')}]`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('a non-owning role calling another role’s port is refused by the database', async () => {
    const pools: Record<string, AnyDb> = {
      eye_app: app, eye_commit: commit, eye_identity: identity,
      eye_publisher: publisher, eye_verifier: verifier, eye_recovery: recovery,
    };
    // One representative call per port, executed by a role that must not hold it.
    const attempts: Array<[string, string, () => Promise<unknown>]> = [
      ['eye_app', 'commit_event', () => sql`select audit.commit_event('x','a','success','OK',null,null,null,null::uuid,null,${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(app)],
      ['eye_verifier', 'commit_event', () => sql`select audit.commit_event('x','a','success','OK',null,null,null,null::uuid,null,${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(verifier)],
      ['eye_publisher', 'commit_event', () => sql`select audit.commit_event('x','a','success','OK',null,null,null,null::uuid,null,${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(publisher)],
      ['eye_commit', 'commit_identity_event', () => sql`select audit.commit_identity_event(null::uuid,null::uuid,'x','a','failure','X',${uuidv7()}::uuid,'{}'::jsonb)`.execute(commit)],
      ['eye_commit', 'commit_integrity_event', () => sql`select audit.commit_integrity_event('platform','success','OK',${uuidv7()}::uuid,'{}'::jsonb)`.execute(commit)],
      ['eye_commit', 'commit_intake_event', () => sql`select audit.commit_intake_event('security.intake','request.rejected','X',${uuidv7()}::uuid,null::uuid,'{}'::jsonb)`.execute(commit)],
      ['eye_commit', 'outbox_lease', () => sql`select * from objects.outbox_lease(1, 60)`.execute(commit)],
      ['eye_app', 'outbox_lease', () => sql`select * from objects.outbox_lease(1, 60)`.execute(app)],
      ['eye_publisher', 'enqueue_event', () => sql`select objects.enqueue_event(${uuidv7()}::uuid,'x','{}'::jsonb,${uuidv7()}::uuid,${uuidv7()}::uuid)`.execute(publisher)],
      ['eye_verifier', 'admit_version', () => sql`select objects.admit_version('{}'::jsonb,'{}'::jsonb,'x')`.execute(verifier)],
      ['eye_commit', 'create_principal', () => sql`select identity.create_principal(${uuidv7()}::uuid,'human','PLATFORM',null,null,'x',null,null,null)`.execute(commit)],
      ['eye_app', 'auth_lookup', () => sql`select * from identity.auth_lookup('platform-admin')`.execute(app)],
      ['eye_identity', 'create_tenant', () => sql`select tenancy.create_tenant(${uuidv7()}::uuid,'x','eu')`.execute(identity)],
      ['eye_verifier', 'issue_commit', () => sql`select ctx.issue_commit(${uuidv7()}::uuid,'k','PLATFORM',null::uuid,null::uuid,'p','a','t',${uuidv7()}::uuid,${uuidv7()}::uuid,'bundle-v1','C1',60)`.execute(verifier)],
      ['eye_commit', 'issue_publish', () => sql`select ctx.issue_publish(null::uuid)`.execute(commit)],
      ['eye_commit', 'issue_verify', () => sql`select ctx.issue_verify('platform', false)`.execute(commit)],
      ['eye_commit', 'issue_identity_op', () => sql`select ctx.issue_identity_op('identity.session.create',null::uuid,${uuidv7()}::uuid,60)`.execute(commit)],
      ['eye_commit', 'issue_bootstrap', () => sql`select ctx.issue_bootstrap(${uuidv7()}::uuid)`.execute(commit)],
      ['eye_commit', 'rebuild_chain_heads', () => sql`select audit.rebuild_chain_heads()`.execute(commit)],
      ['eye_identity', 'rebuild_chain_heads', () => sql`select audit.rebuild_chain_heads()`.execute(identity)],
      ['eye_recovery', 'commit_event', () => sql`select audit.commit_event('x','a','success','OK',null,null,null,null::uuid,null,${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(recovery)],
    ];
    for (const [role, port, attempt] of attempts) {
      await expect(attempt(), `${role} → ${port}`).rejects.toThrow(/permission denied/);
    }
    void pools;
  });

  it('no runtime role can read the context secret or the issuance ledger', async () => {
    for (const [name, db] of [['app', app], ['commit', commit], ['identity', identity],
      ['publisher', publisher], ['verifier', verifier], ['recovery', recovery]] as const) {
      await expect(sql`select * from ctx.context_secret limit 1`.execute(db), name).rejects.toThrow(/permission denied/);
      await expect(sql`select * from ctx.issued limit 1`.execute(db), name).rejects.toThrow(/permission denied/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-2 — commit/identity cannot insert AUD/POL directly nor manipulate chain heads', () => {
  it('direct INSERT/UPDATE/DELETE on evidence tables is refused for both authorities', async () => {
    for (const [name, db] of [['commit', commit], ['identity', identity]] as const) {
      await expect(
        sql`insert into audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash)
            values ('platform', 999999, '{}', ${'0'.repeat(64)}, ${'1'.repeat(64)})`.execute(db),
        `${name} AUD insert`,
      ).rejects.toThrow(/permission denied/);
      await expect(
        sql`insert into policy.policy_decisions (id, scope, decision, obligations, principal_id, action,
              object_type, purpose_id, consequence_class, environment, input_digest, bundle_version,
              revocation_state, reason, correlation_id)
            values (${uuidv7()}, 'PLATFORM', 'allow', '[]', 'p', 'a', 'CLM', 'p', 'C1', '{}',
                    ${'a'.repeat(64)}, 'bundle-v1', 'none', 'r', ${uuidv7()})`.execute(db),
        `${name} POL insert`,
      ).rejects.toThrow(/permission denied/);
      await expect(
        sql`update audit.audit_events set row_hash = ${'f'.repeat(64)} where audit_seq = 1`.execute(db),
        `${name} AUD update`,
      ).rejects.toThrow(/permission denied|append-only/);
    }
  });

  it('the chain-head allocator pair is unreachable from every request authority', async () => {
    for (const [name, db] of [['commit', commit], ['identity', identity], ['app', app],
      ['verifier', verifier], ['publisher', publisher]] as const) {
      await expect(sql`select * from audit.advance_chain_head('platform')`.execute(db), name)
        .rejects.toThrow(/permission denied/);
      await expect(sql`select audit.commit_chain_head('platform', 1, ${'a'.repeat(64)})`.execute(db), name)
        .rejects.toThrow(/permission denied/);
      await expect(
        sql`update audit.audit_chain_heads set next_seq = 1 where partition_id = 'platform'`.execute(db), name,
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('an AUD row can therefore only come into existence through a governed port', async () => {
    const before = await sql<{ n: string }>`select count(*) n from audit.audit_events`.execute(su);
    await withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) => {
      await sql`select audit.commit_event('g21.port', ${cap.action}, 'success', 'OK', null, null, null,
        null::uuid, null, ${cap.correlationId}::uuid, null::uuid, null, null, null, '{}'::jsonb)`.execute(tx);
    });
    const after = await sql<{ n: string }>`select count(*) n from audit.audit_events`.execute(su);
    expect(Number(after.rows[0]!.n)).toBe(Number(before.rows[0]!.n) + 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-3 — the verifier cannot append audit events', () => {
  it('commit_event is not granted to the verifier, in any mode', async () => {
    await expect(
      sql`select audit.commit_event('x','a','success','OK',null,null,null,null::uuid,null,
        ${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(verifier),
    ).rejects.toThrow(/permission denied/);
    // Not even while holding its own legitimate verify capability.
    await expect(
      withVerifyCtx(verifier, `tenant:${tenant}`, false, async (tx) =>
        sql`select audit.commit_event('x','a','failure','OK',null,null,null,null::uuid,null,
          ${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/permission denied/);
  });

  it('the verifier may record an INTEGRITY event only, and only that', async () => {
    const seq = await withVerifyCtx(verifier, `tenant:${tenant}`, false, async (tx) =>
      (await sql<{ s: string }>`select audit.commit_integrity_event(
        ${`tenant:${tenant}`}, 'success', 'OK', ${uuidv7()}::uuid,
        ${JSON.stringify({ partition: `tenant:${tenant}` })}::jsonb) as s`.execute(tx)).rows[0]!.s);
    expect(Number(seq)).toBeGreaterThan(0);
    await expect(
      withVerifyCtx(verifier, `tenant:${tenant}`, false, async (tx) =>
        sql`select tenancy.create_tenant(${uuidv7()}::uuid, 'x', 'eu')`.execute(tx)),
    ).rejects.toThrow(/permission denied/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-4/5 — outbox transitions are CAS-only and never pre-published', () => {
  let eventId = '';

  beforeAll(async () => {
    eventId = uuidv7();
    await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
      await sql`select objects.enqueue_event(${eventId}::uuid, 'g21.event', '{"v":1}'::jsonb,
        ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      await closeOperation(tx, cap, { type: 'outbox', id: eventId });
    });
  });

  it('G21-4: the publisher holds no direct UPDATE on the outbox', async () => {
    await expect(
      sql`update objects.object_outbox set status = 'published' where id = ${eventId}`.execute(publisher),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sql`update objects.object_outbox set published_at = now() where id = ${eventId}`.execute(publisher),
    ).rejects.toThrow(/permission denied/);
    // Nor while holding a publish capability — the capability grants the PORT,
    // not table access.
    await expect(
      withPublishCtx(publisher, eventId, async (tx) =>
        sql`update objects.object_outbox set status = 'published' where id = ${eventId}`.execute(tx)),
    ).rejects.toThrow(/permission denied/);
  });

  it('G21-4: acknowledgement without the current lease does nothing', async () => {
    const ok = await withPublishCtx(publisher, eventId, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_ack_leased(
        ${eventId}::uuid, ${uuidv7()}::uuid, 'pending', 'published') as ok`.execute(tx)).rows[0]!.ok);
    expect(ok).toBe(false);
    const row = await sql<{ status: string; published_at: string | null }>`
      select status, published_at from objects.object_outbox where id = ${eventId}`.execute(su);
    expect(row.rows[0]!.status).toBe('pending');
    expect(row.rows[0]!.published_at).toBeNull();
  });

  it('G21-5: the commit authority cannot create a pre-published row', async () => {
    // Direct insertion is gone entirely…
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload,
              correlation_id, causation_id, status, published_at)
            values (${uuidv7()}, 'DOMAIN', ${tenant}, ${domainA}, 'forged', '{}', ${uuidv7()},
                    ${uuidv7()}, 'published', now())`.execute(tx)),
    ).rejects.toThrow(/permission denied|row-level security/);
    // …and the port forces status/published_at regardless of intent.
    const id = uuidv7();
    await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
      await sql`select objects.enqueue_event(${id}::uuid, 'g21.forced', '{}'::jsonb,
        ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      await closeOperation(tx, cap, { type: 'outbox', id });
    });
    const row = await sql<{ status: string; published_at: string | null; lease_id: string | null }>`
      select status, published_at, lease_id from objects.object_outbox where id = ${id}`.execute(su);
    expect(row.rows[0]).toMatchObject({ status: 'pending', published_at: null, lease_id: null });
  });

  it('G21-4: only the lease holder completes the transition, exactly once', async () => {
    const leased = await withPublishCtx(publisher, null, async (tx) =>
      sql<{ id: string; lease_id: string }>`select id, lease_id from objects.outbox_lease(100, 60)`.execute(tx));
    const mine = leased.rows.find((r) => r.id === eventId);
    expect(mine).toBeTruthy();
    const first = await withPublishCtx(publisher, eventId, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_ack_leased(
        ${eventId}::uuid, ${mine!.lease_id}::uuid, 'pending', 'published') as ok`.execute(tx)).rows[0]!.ok);
    expect(first).toBe(true);
    const again = await withPublishCtx(publisher, eventId, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_ack_leased(
        ${eventId}::uuid, ${mine!.lease_id}::uuid, 'pending', 'published') as ok`.execute(tx)).rows[0]!.ok);
    expect(again).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-6 — evidence mode cannot create business or canonical state', () => {
  const route = { scope: 'DOMAIN', tenantId: '', domainId: '' };

  it('tenants, domains, principals and canonical objects are all refused', async () => {
    const attempts: Array<[string, (tx: never) => Promise<unknown>]> = [
      ['create_tenant', (tx) => sql`select tenancy.create_tenant(${uuidv7()}::uuid, 'x', 'eu')`.execute(tx)],
      ['create_domain', (tx) => sql`select tenancy.create_domain(${uuidv7()}::uuid, ${tenant}::uuid, 'x')`.execute(tx)],
      ['create_principal', (tx) => sql`select identity.create_principal(${uuidv7()}::uuid,'human','DOMAIN',
          ${tenant}::uuid, ${domainA}::uuid, 'x', null, null, null)`.execute(tx)],
      ['admit_version', (tx) => {
        const h = fullHeader();
        return sql`select objects.admit_version(${JSON.stringify(h)}::jsonb,
          ${JSON.stringify({ subject: 'a', predicate: 'b', object_value: 'c' })}::jsonb,
          ${canonicalHeaderDigest(h, { subject: 'a', predicate: 'b', object_value: 'c' })})`.execute(tx);
      }],
      ['enqueue_event', (tx) => sql`select objects.enqueue_event(${uuidv7()}::uuid,'x','{}'::jsonb,
          ${uuidv7()}::uuid,${uuidv7()}::uuid)`.execute(tx)],
    ];
    for (const [name, attempt] of attempts) {
      await expect(
        withEvidenceCtx(
          commit, aAdmin,
          { scope: 'DOMAIN', tenantId: tenant, domainId: domainA },
          { scope: 'DOMAIN', tenantId: tenant, domainId: domainA },
          async (tx) => attempt(tx as never),
          { action: 'objects.create' },
        ),
        name,
      ).rejects.toThrow(/authority mode required|permission denied|not a canonical write/);
    }
    void route;
  });

  it('the row-writability predicate itself refuses evidence mode', async () => {
    const writable = await withEvidenceCtx(
      commit, aAdmin,
      { scope: 'DOMAIN', tenantId: tenant, domainId: domainA },
      { scope: 'DOMAIN', tenantId: tenant, domainId: domainA },
      async (tx) => (await sql<{ w: boolean }>`select public.eye_row_writable(
        'DOMAIN', ${tenant}::uuid, ${domainA}::uuid) as w`.execute(tx)).rows[0]!.w,
    );
    expect(writable).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-7 — evidence mode cannot record a fabricated allow or success', () => {
  it('a success outcome is refused outright in evidence mode', async () => {
    await expect(
      withEvidenceCtx(
        commit, tenantAdmin,
        { scope: 'TENANT', tenantId: tenant, domainId: null },
        { scope: 'TENANT', tenantId: tenant, domainId: null },
        async (tx, cap) => sql`select audit.commit_event('api.request', ${cap.action}, 'success', 'OK',
          null, null, null, null::uuid, null, ${cap.correlationId}::uuid, null::uuid, null, null, null,
          '{}'::jsonb)`.execute(tx),
      ),
    ).rejects.toThrow(/evidence mode cannot record outcome success/);
  });

  it('a decision written in evidence mode is marked, and can never authorize a success later', async () => {
    // Record a real denial under the evidence capability…
    let polId = '';
    let corr = '';
    await withEvidenceCtx(
      commit, tenantAdmin,
      { scope: 'TENANT', tenantId: tenant, domainId: null },
      { scope: 'TENANT', tenantId: tenant, domainId: null },
      async (tx, cap) => {
        polId = await commitDecision(tx, cap, 'allow');
        corr = cap.correlationId;
      },
      { action: 'g21.evidence.probe' },
    );
    const marked = await sql<{ evidence_only: boolean; decision: string }>`
      select evidence_only, decision from policy.policy_decisions where id = ${polId}`.execute(su);
    expect(marked.rows[0]!.evidence_only).toBe(true);
    expect(marked.rows[0]!.decision).toBe('allow'); // the TRUE decision is preserved

    // …and now try to use it, from a genuine AUTHORITY capability, to justify a
    // success. The linkage rule refuses it — in this transaction or any later one.
    await expect(
      withCtx(
        commit, tenantAdmin, 'TENANT', tenant, null,
        async (tx, cap) =>
          sql`select audit.commit_event('api.request', ${cap.action}, 'success', 'OK', null, null, null,
            ${polId}::uuid, ${cap.bundleVersion}, ${cap.correlationId}::uuid, null::uuid, null, null, null,
            '{}'::jsonb)`.execute(tx),
        { action: 'g21.evidence.probe', correlationId: corr, policyDecisionId: polId },
      ),
    ).rejects.toThrow(/evidence-only policy decision/);
  });

  it('a successful request event must reference a policy decision at all', async () => {
    await expect(
      withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) =>
        sql`select audit.commit_event('api.request', ${cap.action}, 'success', 'OK', null, null, null,
          null::uuid, null, ${cap.correlationId}::uuid, null::uuid, null, null, null, '{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/must reference its policy decision/);
  });

  it('an AUD row cannot reference a POL that describes a different request', async () => {
    // A real POL for tenantAdmin's action…
    let foreignPol = '';
    await withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) => {
      foreignPol = await commitDecision(tx, cap, 'allow');
    }, { action: 'g21.linkage.a' });
    // …cannot back an AUD for a different action/correlation.
    await expect(
      withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) =>
        sql`select audit.commit_event('api.request', ${cap.action}, 'success', 'OK', null, null, null,
          ${foreignPol}::uuid, ${cap.bundleVersion}, ${cap.correlationId}::uuid, null::uuid, null, null, null,
          '{}'::jsonb)`.execute(tx), { action: 'g21.linkage.b' }),
    ).rejects.toThrow(/does not match its policy decision/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-8 — a capability for action A cannot perform action B', () => {
  it('each business port refuses a capability bound to a different action', async () => {
    const cases: Array<[string, string, (tx: never) => Promise<unknown>, RegExp]> = [
      ['tenancy.tenant.create', 'create_domain',
        (tx) => sql`select tenancy.create_domain(${uuidv7()}::uuid, ${tenant}::uuid, 'x')`.execute(tx),
        /bound to action tenancy.tenant.create, not tenancy.domain.create/],
      ['tenancy.domain.create', 'create_tenant',
        (tx) => sql`select tenancy.create_tenant(${uuidv7()}::uuid, 'x', 'eu')`.execute(tx),
        /bound to action tenancy.domain.create, not tenancy.tenant.create/],
      ['objects.read', 'admit_version', (tx) => {
        const h = fullHeader();
        const pl = { subject: 'a', predicate: 'b', object_value: 'c' };
        return sql`select objects.admit_version(${JSON.stringify(h)}::jsonb, ${JSON.stringify(pl)}::jsonb,
          ${canonicalHeaderDigest(h, pl)})`.execute(tx);
      }, /not a canonical write/],
    ];
    for (const [boundAction, target, attempt, matcher] of cases) {
      await expect(
        withCtx(commit, platformAdmin, 'PLATFORM', null, null, async (tx) => attempt(tx as never),
          { action: boundAction }),
        `${boundAction} → ${target}`,
      ).rejects.toThrow(matcher);
    }
  });

  it('an audit event cannot be recorded for an action the capability does not carry', async () => {
    await expect(
      withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) =>
        sql`select audit.commit_event('api.request', 'some.other.action', 'denied', 'EYE-AUT-001',
          null, null, null, null::uuid, null, ${cap.correlationId}::uuid, null::uuid, null, null, null,
          '{}'::jsonb)`.execute(tx), { action: 'g21.bound.action' }),
    ).rejects.toThrow(/context is bound to action g21.bound.action, not some.other.action/);
  });

  it('an audit event cannot be recorded under a correlation the capability does not carry', async () => {
    await expect(
      withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) =>
        sql`select audit.commit_event('api.request', ${cap.action}, 'denied', 'EYE-AUT-001',
          null, null, null, null::uuid, null, ${uuidv7()}::uuid, null::uuid, null, null, null,
          '{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/correlation does not match the bound request/);
  });

  it('the identity authority cannot mint a capability for a non-identity action, and vice versa', async () => {
    await expect(
      withCtx(identity, platformAdmin, 'PLATFORM', null, null, async (tx) => sql`select 1`.execute(tx),
        { action: 'tenancy.tenant.create' }),
    ).rejects.toThrow(/identity authority cannot mint a capability for action/);
    await expect(
      withCtx(commit, platformAdmin, 'PLATFORM', null, null, async (tx) => sql`select 1`.execute(tx),
        { action: 'identity.principal.create' }),
    ).rejects.toThrow(/commit authority cannot mint an identity capability/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-9 — a one-second capability expires after real elapsed time', () => {
  it('expiry is wall-clock (clock_timestamp), so it lapses INSIDE one transaction', async () => {
    const p = await createPrincipalWithSession(identity, su, {
      scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'g21-exp',
    });
    const out = await withCtx(
      commit, p, 'TENANT', tenant, null,
      async (tx) => {
        const before = (await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s;
        const frozenNow = (await sql<{ t: string }>`select now()::text t`.execute(tx)).rows[0]!.t;
        await sql`select pg_sleep(1.3)`.execute(tx);
        const stillFrozen = (await sql<{ t: string }>`select now()::text t`.execute(tx)).rows[0]!.t;
        const after = (await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s;
        return { before, after, frozenNow, stillFrozen };
      },
      { ttlSeconds: 1 },
    );
    expect(out.before).toBe('TENANT');
    expect(out.after).toBe('NONE');
    // Proof the transaction clock did NOT move: an implementation using now()
    // would have considered this capability live forever.
    expect(out.stillFrozen).toBe(out.frozenNow);
  });

  it('a lapsed capability cannot write, even though the transaction is still open', async () => {
    const p = await createPrincipalWithSession(identity, su, {
      scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'g21-exp2',
    });
    await expect(
      withCtx(
        commit, p, 'TENANT', tenant, null,
        async (tx, cap) => {
          await sql`select pg_sleep(1.3)`.execute(tx);
          return sql`select audit.commit_event('g21.lapsed', ${cap.action}, 'success', 'OK', null, null,
            null, null::uuid, null, ${cap.correlationId}::uuid, null::uuid, null, null, null,
            '{}'::jsonb)`.execute(tx);
        },
        { ttlSeconds: 1 },
      ),
    ).rejects.toThrow(/authority or evidence context required|context is none/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-10/11 — a capability minted in A dies when B revokes the authority', () => {
  /**
   * Two REAL concurrent connections. Transaction A mints, then B revokes, then A
   * attempts its write. The write must fail, because every port revalidates live
   * authority instead of trusting issuance.
   */
  async function mintThenRevokeThenWrite(
    label: string,
    revoke: (p: TestPrincipal) => Promise<void>,
  ): Promise<void> {
    const p = await createPrincipalWithSession(identity, su, {
      scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label,
    });
    await expect(
      commit.transaction().execute(async (tx) => {
        // A: mint a live capability
        const cap = { action: `g21.${label}`, correlationId: uuidv7(), polId: uuidv7() };
        await sql`select ctx.issue_commit(${p.sessionId}::uuid, ${p.contextKey}, 'TENANT',
          ${tenant}::uuid, null::uuid, 'g21', ${cap.action}, 'target', ${cap.correlationId}::uuid,
          ${cap.polId}::uuid, 'bundle-v1', 'C1', 60)`.execute(tx);
        expect((await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s).toBe('TENANT');

        // B: revoke on a DIFFERENT connection, committed independently
        await revoke(p);

        // A: attempt the authoritative write with the capability it already holds
        return sql`select audit.commit_event('g21.stale', ${cap.action}, 'success', 'OK', null, null, null,
          null::uuid, null, ${cap.correlationId}::uuid, null::uuid, null, null, null, '{}'::jsonb)`.execute(tx);
      }),
      label,
    ).rejects.toThrow(/authority revoked|session is not active|revocation epoch changed|principal is not active/);
  }

  it('G21-10: session revocation kills an already-minted capability', async () => {
    await mintThenRevokeThenWrite('sessrevoke', async (p) => {
      await identity.transaction().execute(async (tx) => {
      await sql`select ctx.issue_identity_op('identity.credential.revoke', ${p.principalId}::uuid, ${uuidv7()}::uuid, 60)`.execute(tx);
      await sql`select identity.sessions_revoke_all_v2(${p.principalId}::uuid)`.execute(tx);
    });
    });
  });

  it('G21-11a: binding revocation kills an already-minted capability', async () => {
    await mintThenRevokeThenWrite('bindrevoke', async (p) => {
      await sql`update identity.role_bindings set revoked_at = now()
                 where principal_id = ${p.principalId}`.execute(su);
    });
  });

  it('G21-11b: credential rotation kills an already-minted capability', async () => {
    await mintThenRevokeThenWrite('credrotate', async (p) => {
      const credId = uuidv7();
      await identity.transaction().execute(async (tx2) => {
        await sql`select ctx.issue_identity_op('identity.credential.rotate', ${p.principalId}::uuid,
          ${uuidv7()}::uuid, 60)`.execute(tx2);
        await sql`select identity.credential_issue(${credId}::uuid, ${p.principalId}::uuid,
          'hash', 'active', null)`.execute(tx2);
        await sql`select identity.credential_rotate_v2(${p.principalId}::uuid, ${credId}::uuid,
          ${uuidv7()}::uuid, 'newhash')`.execute(tx2);
      });
    });
  });

  it('G21-11c: principal deactivation kills an already-minted capability', async () => {
    await mintThenRevokeThenWrite('deactivate', async (p) => {
      await sql`update identity.principals set status = 'suspended' where id = ${p.principalId}`.execute(su);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-12 — DOMAIN cannot read tenant-global partition state', () => {
  it('the leaking projection is gone and its replacement refuses a DOMAIN caller', async () => {
    const gone = await sql<{ n: string }>`
      select count(*) n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'audit' and p.proname = 'my_partition_status'`.execute(su);
    expect(Number(gone.rows[0]!.n)).toBe(0);

    // A DOMAIN capability asking for the tenant partition gets nothing.
    for (const partition of [`tenant:${tenant}`, 'platform', `tenant:${tenantOther}`]) {
      const rows = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`select * from audit.my_partition_integrity(${partition})`.execute(tx));
      expect(rows.rows, partition).toHaveLength(0);
    }
    // Its own domain projection is available and scoped to itself.
    const own = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql<{ scope: string; tenant_id: string; domain_id: string }>`
        select scope, tenant_id, domain_id from audit.my_domain_integrity()`.execute(tx));
    expect(own.rows[0]).toMatchObject({ scope: 'DOMAIN', tenant_id: tenant, domain_id: domainA });
  });

  it('heads, seals and incidents remain unreadable to the request authorities directly', async () => {
    for (const t of ['audit.audit_chain_heads', 'audit.audit_seals', 'audit.integrity_incidents']) {
      await expect(sql`select * from ${sql.raw(t)} limit 1`.execute(app), `app ${t}`)
        .rejects.toThrow(/permission denied/);
      await expect(sql`select * from ${sql.raw(t)} limit 1`.execute(commit), `commit ${t}`)
        .rejects.toThrow(/permission denied/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-13 — application lookups cannot reach another tenant’s identity metadata', () => {
  it('the unbounded lookups are withdrawn from the application role', async () => {
    for (const call of [
      `identity.auth_principal('${platformAdmin.principalId}'::uuid)`,
      `identity.auth_bindings('${platformAdmin.principalId}'::uuid)`,
      `identity.session_get_active('${platformAdmin.sessionId}'::uuid)`,
    ]) {
      await expect(sql`select * from ${sql.raw(call)}`.execute(app), call).rejects.toThrow(/permission denied/);
    }
  });

  it('the caller-bound lookup requires proof of possession of THAT session', async () => {
    // With the correct key: exactly one row, the caller's own subject.
    const own = await sql<{ principal_id: string }>`
      select principal_id from identity.session_subject(${otherAdmin.sessionId}::uuid, ${otherAdmin.contextKey})`
      .execute(app);
    expect(own.rows.map((r) => r.principal_id)).toEqual([otherAdmin.principalId]);

    // Knowing the session id is not enough — ids are not secrets.
    const guessed = await sql`
      select * from identity.session_subject(${otherAdmin.sessionId}::uuid, ${'wrong-context-key-000000000000'})`
      .execute(app);
    expect(guessed.rows).toHaveLength(0);

    // And one session's key cannot unlock another session.
    const crossed = await sql`
      select * from identity.session_subject(${otherAdmin.sessionId}::uuid, ${tenantAdmin.contextKey})`
      .execute(app);
    expect(crossed.rows).toHaveLength(0);
    const crossedBindings = await sql`
      select * from identity.session_bindings(${otherAdmin.sessionId}::uuid, ${tenantAdmin.contextKey})`
      .execute(app);
    expect(crossedBindings.rows).toHaveLength(0);
  });

  it('principals, bindings and sessions cannot be enumerated across tenants', async () => {
    // Credential-bearing tables: no access at all.
    for (const t of ['identity.credentials', 'identity.sessions', 'identity.refresh_tokens']) {
      await expect(sql`select * from ${sql.raw(t)} limit 1`.execute(app), t).rejects.toThrow(/permission denied/);
    }
    // Scoped tables: a tenant capability sees its own tenant only.
    const seen = await withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx) =>
      sql<{ tenant_id: string | null }>`select tenant_id from identity.principals`.execute(tx));
    expect(seen.rows.every((r) => r.tenant_id === tenant || r.tenant_id === null)).toBe(true);
    expect(seen.rows.some((r) => r.tenant_id === tenantOther)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-19 — correctly digested but semantically invalid headers are rejected', () => {
  const payload = { subject: 'a', predicate: 'b', object_value: 'c' };

  /** Every case carries a CORRECT digest, so only semantics can reject it. */
  const cases: Array<[string, Partial<CanonicalHeader>, RegExp]> = [
    ['valid_to before valid_from',
      { valid_from: '2026-08-05T00:00:00.000Z', valid_to: '2026-08-04T00:00:00.000Z' },
      /valid_to must be after valid_from/],
    ['valid_to without valid_from', { valid_to: '2026-08-06T00:00:00.000Z' }, /valid_to requires valid_from/],
    ['non-canonical lifecycle_state', { lifecycle_state: 'invented' }, /lifecycle_state invented is not permitted/],
    ['non-canonical truth_state', { truth_state: 'guessed' }, /truth_state guessed is not canonical/],
    ['non-canonical time_precision', { time_precision: 'fortnight' }, /time_precision fortnight is not permitted/],
    ['non-canonical clock quality', { source_clock_quality: 'excellent' as never }, /source_clock_quality excellent/],
    ['object_type not three uppercase letters', { object_type: 'Claim' }, /three uppercase letters/],
    ['schema_ref shape', { schema_ref: 'CLM-v1' }, /must be <TYPE>@v<N>/],
    ['schema_ref/object_type mismatch', { schema_ref: 'DOC@v1' }, /schema_ref does not match object_type/],
    ['object_version not a positive integer', { object_version: '0' }, /object_version must be a positive integer/],
    ['scalar smuggled into confidence', { confidence: 0.9 as never }, /must be objects or null/],
    ['reference field not an array', { evidence_refs: 'evd:x' as never }, /reference fields must be arrays/],
    ['synthetic truth without the flag', { truth_state: 'synthetic', synthetic_state: false }, /requires synthetic_state/],
    ['recorded_at in the future', { recorded_at: '2099-01-01T00:00:00.000Z' }, /recorded_at is in the future/],
    ['scope/identifier mismatch', { scope: 'PLATFORM' }, /scope\/identifier combination is invalid/],
    ['blank classification', { classification: '' }, /classification, purpose_scope, owning_component/],
  ];

  it.each(cases)('rejects: %s', async (_label, over, matcher) => {
    const objectId = uuidv7();
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
        // Gate-2.2 C6: object id = bound target, header correlation = operation's,
        // so ONLY the semantic defect under test can reject the admission.
        const header = { ...fullHeader(over), object_id: objectId, audit_correlation_id: cap.correlationId };
        const digest = canonicalHeaderDigest(header, payload); // genuinely correct
        return sql`select objects.admit_version(${JSON.stringify(header)}::jsonb,
          ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(tx);
      }, { action: 'objects.create', target: objectId }),
    ).rejects.toThrow(matcher);
  });

  it('the same header WITH valid semantics is admitted, proving the digest was right', async () => {
    const objectId = uuidv7();
    const out = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
      const header = { ...fullHeader(), object_id: objectId, audit_correlation_id: cap.correlationId };
      const digest = canonicalHeaderDigest(header, payload);
      const r = await sql<{ content_digest: string }>`select content_digest from objects.admit_version(
        ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(tx);
      await closeOperation(tx, cap, { type: header.object_type, id: objectId });
      expect(r.rows[0]!.content_digest).toBe(digest);
      return r;
    }, { action: 'objects.create', target: objectId });
    expect(out.rows[0]!.content_digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('G21-20 — migration without EYE_DB_MIGRATE_PASSWORD fails before connecting', () => {
  it('exits non-zero with no connection attempt and no default credential', () => {
    const script = join(__dirname, '..', '..', 'scripts', 'migrate.mjs');
    const env = { ...process.env };
    delete env['EYE_DB_MIGRATE_PASSWORD'];
    // An unroutable host proves the failure precedes any connection: if the
    // runner reached the network, this would hang/time out instead of exiting.
    env['EYE_DB_HOST'] = '203.0.113.1';
    let status = 0;
    let stderr = '';
    try {
      execFileSync('node', [script], { env, encoding: 'utf8', timeout: 10_000, stdio: 'pipe' });
    } catch (e) {
      const err = e as { status?: number; stderr?: string };
      status = err.status ?? -1;
      stderr = err.stderr ?? '';
    }
    expect(status).toBe(1);
    expect(stderr).toMatch(/EYE_DB_MIGRATE_PASSWORD is required and has no default/);
    expect(stderr).not.toMatch(/eye_local_dev/);
  });

  it('no EXECUTABLE committed source carries a credential default', () => {
    // Scoped to PRODUCTION sources and infrastructure on purpose. Two kinds of file
    // legitimately contain the string and are not violations: controlled documents
    // that record the literal was REMOVED, and the tests (here and in the gate suite)
    // that assert its absence. A match in application source, a script, a migration,
    // a workflow, a compose file or .env.example fails.
    const grep = (): string => {
      try {
        return execFileSync(
          'git',
          ['grep', '-n', 'eye_local_dev', '--',
            'apps/*/src', 'apps/*/scripts', 'apps/*/migrations', 'packages', 'scripts', 'infra',
            '*.yml', '*.yaml', 'docker-compose*', '.env.example'],
          { cwd: join(__dirname, '..', '..', '..', '..'), encoding: 'utf8' },
        );
      } catch {
        return ''; // git grep exits 1 when there are no matches
      }
    };
    expect(grep()).toBe('');
  });
});
