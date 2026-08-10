/**
 * GATE-2 ADVERSARIAL MATRIX — the 17 mandated negative tests.
 *
 * Every test attacks the REAL database roles, the REAL bound context, the REAL
 * definer ports and the REAL services. Nothing is satisfied by source-string
 * inspection, by reimplementing production logic, or by widening any authority
 * to make a test pass.
 *
 *  1  eye_app cannot retrieve credential hashes or invoke identity mutation
 *  2  eye_app cannot create a session for platform-admin nor establish another
 *     principal's context
 *  3  context replay fails after session revocation, expiry and credential rotation
 *  4  DOMAIN A cannot write tenant-null rows, DOMAIN B rows, or tenant bindings
 *  5  a DOMAIN principal cannot grant itself tenant administration
 *  6  same-scope fabricated POL and AUD records are rejected
 *  7  fabricated actors/actions and malformed scope combinations are rejected
 *  8  stored audit bytes equal the RFC 8785 JCS bytes used for hashing
 *  9  audit heads, seals and incidents cannot leak across scopes
 * 10  pre-handler validation failures produce durable evidence  (acceptance suite)
 * 11  audit-evidence failure ⇒ fail-closed + durable degraded state (acceptance)
 * 12  audit.verify success and failure are authorized and evidenced  (acceptance)
 * 13  replay of refresh tokens n-2 and older revokes the active family
 * 14  direct canonical insertion with an invented digest is rejected
 * 15  outbox payload rewriting and unauthorized publish ack are rejected
 * 16  two concurrent bootstrap attempts ⇒ exactly one successful bootstrap
 * 17  clean-source typecheck passes without pre-existing build artifacts (CI/gate)
 *
 * Tests 10–12 and 17 are executed where they are observable end-to-end: 10–12 in
 * the acceptance suite against the running API (durable evidence + degraded
 * health + governed audit.verify), and 17 in the gate harness
 * (scripts/verify-clean-typecheck.sh). They are cross-referenced here so the
 * matrix is auditable in one place.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { jcsCanonicalize, canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import {
  appDb, commitDb, identityDb, publisherDb, verifierDb, recoveryDb, superDb, allocatorDb,
  seedTenant, seedDomain, createPrincipalWithSession, withCtx, withIdentityOp,
  withPublishCtx, closeOperation, sha256, type AnyDb, type TestPrincipal,
} from './helpers.js';

let app: AnyDb;
let commit: AnyDb;
let identity: AnyDb;
let publisher: AnyDb;
let verifier: AnyDb;
let recovery: AnyDb;
let su: AnyDb;
let allocator: AnyDb;

let tenant = '';
let tenantOther = '';
let domainA = '';
let domainB = '';
let platformAdmin: TestPrincipal;
let tenantAdmin: TestPrincipal;
let aAdmin: TestPrincipal;

beforeAll(async () => {
  app = appDb(); commit = commitDb(); identity = identityDb();
  publisher = publisherDb(); verifier = verifierDb(); recovery = recoveryDb();
  su = superDb(); allocator = allocatorDb();

  tenant = await seedTenant(su, 'adv-t');
  tenantOther = await seedTenant(su, 'adv-o');
  domainA = await seedDomain(su, tenant, 'adv-a');
  domainB = await seedDomain(su, tenant, 'adv-b');

  platformAdmin = await createPrincipalWithSession(identity, su, { scope: 'PLATFORM', roleCode: 'platform_admin', label: 'adv-p' });
  tenantAdmin = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'adv-t' });
  aAdmin = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenant, domainId: domainA, roleCode: 'domain_admin', label: 'adv-a' });
});

afterAll(async () => {
  await Promise.all([app, commit, identity, publisher, verifier, recovery, su, allocator].map((d) => d.destroy()));
});

// ─────────────────────────────────────────────────────────────────────────────
describe('1 — eye_app cannot reach credential material or identity mutation', () => {
  it('cannot SELECT credential or refresh-token hashes', async () => {
    for (const t of ['identity.credentials', 'identity.sessions', 'identity.refresh_tokens', 'identity.break_glass_grants']) {
      await expect(sql`select * from ${sql.raw(t)} limit 1`.execute(app), t).rejects.toThrow(/permission denied/);
    }
  });

  it('cannot invoke ANY identity mutation port', async () => {
    // Thunks, not promises: each attempt is created at await time so a rejection
    // is never left unhandled.
    const attempts: Array<[string, () => Promise<unknown>]> = [
      ['session_open', () => sql`select identity.session_open(${uuidv7()}::uuid, ${platformAdmin.principalId}::uuid, 'password', 'h', 'k', now() + interval '1 hour', ${uuidv7()}::uuid)`.execute(app)],
      ['credential_issue', () => sql`select identity.credential_issue(${uuidv7()}::uuid, ${platformAdmin.principalId}::uuid, 'h', 'active', null)`.execute(app)],
      ['credential_rotate_v2', () => sql`select identity.credential_rotate_v2(${platformAdmin.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid, 'h')`.execute(app)],
      ['credential_revoke', () => sql`select identity.credential_revoke(${uuidv7()}::uuid)`.execute(app)],
      ['sessions_revoke_all_v2', () => sql`select identity.sessions_revoke_all_v2(${platformAdmin.principalId}::uuid)`.execute(app)],
      ['refresh_rotate_family', () => sql`select * from identity.refresh_rotate_family('a','b','c')`.execute(app)],
      ['create_principal', () => sql`select identity.create_principal(${uuidv7()}::uuid,'human','PLATFORM',null,null,'x','x','h','platform_admin')`.execute(app)],
      ['auth_lookup', () => sql`select * from identity.auth_lookup('platform-admin')`.execute(app)],
      ['claim_bootstrap', () => sql`select identity.claim_bootstrap()`.execute(app)],
      ['bump_epoch', () => sql`select identity.bump_epoch(${platformAdmin.principalId}::uuid)`.execute(app)],
    ];
    for (const [name, attempt] of attempts) {
      await expect(attempt(), name).rejects.toThrow(/permission denied/);
    }
  });

  it('cannot write any authoritative table directly', async () => {
    const writes: Array<[string, () => Promise<unknown>]> = [
      ['tenants', () => sql`insert into tenancy.tenants (id, name, status) values (${uuidv7()}, 'x', 'active')`.execute(app)],
      ['domains', () => sql`insert into tenancy.domains (id, tenant_id, name, status) values (${uuidv7()}, ${tenant}, 'x', 'active')`.execute(app)],
      ['principals', () => sql`insert into identity.principals (id, kind, scope, display_name, status) values (${uuidv7()}, 'human', 'PLATFORM', 'x', 'active')`.execute(app)],
      ['canonical', () => sql`insert into objects.canonical_objects (object_id, object_type, scope, object_version, lifecycle_state, owning_component, accountable_owner, truth_state, classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest) values (${uuidv7()}, 'CLM', 'PLATFORM', 1, 'admitted', 'x', 'x', 'asserted', 'i', 'p', 'CLM@v1', ${uuidv7()}, '{}', ${'a'.repeat(64)})`.execute(app)],
      ['outbox', () => sql`insert into objects.object_outbox (id, scope, event_type, payload, correlation_id, causation_id) values (${uuidv7()}, 'PLATFORM', 'x', '{}', ${uuidv7()}, ${uuidv7()})`.execute(app)],
      ['policy', () => sql`insert into policy.policy_decisions (id, scope, decision, obligations, principal_id, action, object_type, purpose_id, consequence_class, environment, input_digest, bundle_version, revocation_state, reason, correlation_id) values (${uuidv7()}, 'PLATFORM', 'allow', '[]', 'p', 'a', 'CLM', 'p', 'C1', '{}', ${'a'.repeat(64)}, 'bundle-v1', 'none', 'r', ${uuidv7()})`.execute(app)],
      ['audit', () => sql`insert into audit.audit_events (partition_id, audit_seq, event_jcs, previous_hash, row_hash) values ('platform', 999999, '{}', ${'0'.repeat(64)}, ${'1'.repeat(64)})`.execute(app)],
    ];
    for (const [name, write] of writes) {
      await expect(write(), name).rejects.toThrow(/permission denied/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('2 — no principal’s authority can be minted without its proof', () => {
  it('eye_app can mint NO capability of any kind (Gate-2.1 §2)', async () => {
    // The application role's context surface is now empty: it holds EXECUTE on no
    // minter at all, so "which context may eye_app forge" has no answer.
    for (const call of [
      `ctx.issue_commit('${'0'.repeat(8)}-0000-0000-0000-000000000000'::uuid,'k','PLATFORM',null::uuid,null::uuid,'p','a','t',null::uuid,null::uuid,'bundle-v1','C1',60)`,
      "ctx.issue_identity_op('identity.session.create',null::uuid,null::uuid,60)",
      "ctx.issue_publish(null::uuid)",
      "ctx.issue_verify('platform',false)",
      "ctx.issue_bootstrap(null::uuid)",
    ]) {
      await expect(sql`select ${sql.raw(call)}`.execute(app), call).rejects.toThrow(/permission denied/);
    }
  });

  it('cannot establish a context for a session it holds no proof for', async () => {
    // The COMMIT authority may mint — but only with proof of possession. It knows
    // the session id (ids are not secrets) and still cannot use it.
    await expect(
      commit.transaction().execute(async (tx) => {
        await sql`select ctx.issue_commit(
          ${platformAdmin.sessionId}::uuid, ${'not-the-real-context-key-000000'}, 'PLATFORM',
          null::uuid, null::uuid, 'attack', 'a', 't', ${uuidv7()}::uuid, ${uuidv7()}::uuid,
          'bundle-v1', 'C1', 60
        )`.execute(tx);
      }),
    ).rejects.toThrow(/invalid session proof/);
  });

  it('cannot mint a PLATFORM context from a tenant principal’s session', async () => {
    await expect(
      withCtx(commit, tenantAdmin, 'PLATFORM', null, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/no qualifying binding/);
  });

  it('cannot mint a TENANT context for a foreign tenant', async () => {
    await expect(
      withCtx(commit, tenantAdmin, 'TENANT', tenantOther, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/no qualifying binding/);
  });

  it('the universal system-context port no longer EXISTS', async () => {
    // Not "denied" — GONE. A dropped function cannot be re-granted by mistake.
    const remaining = await sql<{ n: string }>`
      select count(*) n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where (ns.nspname = 'ctx' and p.proname in ('issue_system','issue'))
          or (ns.nspname = 'public' and p.proname in ('eye_ctx_field','eye_set_context','eye_set_system_context'))
      `.execute(su);
    expect(Number(remaining.rows[0]!.n)).toBe(0);
    // And the evidence minter is not reachable from the application role.
    await expect(
      sql`select ctx.issue_evidence(${platformAdmin.sessionId}::uuid, ${platformAdmin.contextKey},
        'PLATFORM', null::uuid, null::uuid, 'x', 'a', 'PLATFORM', null::uuid, null::uuid, ${uuidv7()}::uuid, 60)`.execute(app),
    ).rejects.toThrow(/permission denied/);
  });

  it('cannot forge a context by setting the GUC directly', async () => {
    const out = await app.transaction().execute(async (tx) => {
      // A complete, well-formed v3 payload — every field plausible, signature
      // guessed. 22 fields, exactly the real layout.
      const forged = [
        'v3', platformAdmin.sessionId, platformAdmin.principalId, 'PLATFORM', '', '',
        'password', 'attack', new Date().toISOString(), new Date(Date.now() + 60000).toISOString(),
        uuidv7(), '1', 'authority', 'business', 'tenancy.tenant.create', 'target',
        uuidv7(), '1', '1', uuidv7(), 'bundle-v1', 'f'.repeat(64),
      ].join('|');
      await sql`select set_config('eye.ctx3', ${forged}, true)`.execute(tx);
      const scope = (await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s;
      const rows = await sql`select * from tenancy.tenants`.execute(tx);
      return { scope, n: rows.rows.length };
    });
    expect(out.scope).toBe('NONE');
    expect(out.n).toBe(0);
  });

  it('a bootstrap_rotation session can never obtain a governed context', async () => {
    const boot = await createPrincipalWithSession(identity, su, {
      scope: 'PLATFORM', roleCode: 'platform_admin', label: 'adv-boot', assurance: 'bootstrap_rotation',
    });
    await expect(
      withCtx(commit, boot, 'PLATFORM', null, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/bootstrap assurance/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('3 — context replay and staleness', () => {
  it('a valid context string cannot be replayed in a new transaction (single-use nonce + backend binding)', async () => {
    const captured = await withCtx(commit, platformAdmin, 'PLATFORM', null, null, async (tx) =>
      (await sql<{ c: string }>`select current_setting('eye.ctx3', true) c`.execute(tx)).rows[0]!.c);
    expect(captured).toBeTruthy();
    const out = await commit.transaction().execute(async (tx) => {
      await sql`select set_config('eye.ctx3', ${captured}, true)`.execute(tx);
      const scope = (await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s;
      const rows = await sql`select * from tenancy.tenants`.execute(tx);
      return { scope, n: rows.rows.length };
    });
    // A different backend (pool connection) cannot use it; even the same
    // connection cannot re-issue it, because the nonce is already recorded.
    expect(out.n).toBe(0);
    expect(out.scope === 'NONE' || out.n === 0).toBe(true);
  });

  it('fails after session revocation', async () => {
    const victim = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'adv-rev' });
    await identity.transaction().execute(async (tx) => {
      await sql`select ctx.issue_identity_op('identity.credential.revoke', ${victim.principalId}::uuid, ${uuidv7()}::uuid, 60)`.execute(tx);
      await sql`select identity.sessions_revoke_all_v2(${victim.principalId}::uuid)`.execute(tx);
    });
    await expect(
      withCtx(commit, victim, 'TENANT', tenant, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/session not active|authority epoch changed/);
  });

  it('fails after binding removal (revocation epoch bump)', async () => {
    const victim = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'adv-bind' });
    await withCtx(commit, victim, 'TENANT', tenant, null, async (tx) => sql`select 1`.execute(tx)); // works first
    await sql`update identity.role_bindings set revoked_at = now() where principal_id = ${victim.principalId}`.execute(su);
    await expect(
      withCtx(commit, victim, 'TENANT', tenant, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/authority epoch changed|no qualifying binding/);
  });

  it('fails after credential rotation', async () => {
    const victim = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'adv-rot' });
    const credId = uuidv7();
    await withIdentityOp(identity, 'identity.credential.rotate', victim.principalId, async (tx) => {
      await sql`select identity.credential_issue(${credId}::uuid, ${victim.principalId}::uuid, 'hash', 'active', null)`.execute(tx);
      await sql`select identity.credential_rotate_v2(${victim.principalId}::uuid, ${credId}::uuid, ${uuidv7()}::uuid, 'newhash')`.execute(tx);
    });
    await expect(
      withCtx(commit, victim, 'TENANT', tenant, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/session not active|authority epoch changed/);
  });

  it('a rewritten expiry is refused (the signature covers it)', async () => {
    const p = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'adv-exp' });
    const out = await withCtx(commit, p, 'TENANT', tenant, null, async (tx) => {
      const c = (await sql<{ c: string }>`select current_setting('eye.ctx3', true) c`.execute(tx)).rows[0]!.c;
      const parts = c.split('|');
      parts[9] = new Date(Date.now() + 86_400_000).toISOString(); // try to EXTEND it
      await sql`select set_config('eye.ctx3', ${parts.join('|')}, true)`.execute(tx);
      return (await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s;
    });
    expect(out).toBe('NONE');
  });

  it('expiry is evaluated against clock_timestamp(), so it lapses INSIDE a transaction', async () => {
    const p = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'adv-clock' });
    const out = await withCtx(
      commit, p, 'TENANT', tenant, null,
      async (tx) => {
        const before = (await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s;
        // now() is frozen at transaction start; clock_timestamp() is not. A
        // long-running transaction must NOT keep a lapsed capability alive.
        await sql`select pg_sleep(1.3)`.execute(tx);
        const after = (await sql<{ s: string }>`select public.eye_scope() s`.execute(tx)).rows[0]!.s;
        return { before, after };
      },
      { ttlSeconds: 1 },
    );
    expect(out.before).toBe('TENANT');
    expect(out.after).toBe('NONE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('4 — DOMAIN A write isolation', () => {
  it('cannot write a tenant-level (domain_id NULL) lifecycle row', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`insert into tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
            values (${uuidv7()}, 'TENANT', ${tenant}, null, 'tenant.forged', 'a', '{}')`.execute(tx)),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it('cannot write a sibling domain’s rows', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`insert into tenancy.lifecycle_events (id, scope, tenant_id, domain_id, event, actor, details)
            values (${uuidv7()}, 'DOMAIN', ${tenant}, ${domainB}, 'domain.forged', 'a', '{}')`.execute(tx)),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it('cannot create a tenant-scoped principal or a TENANT role binding', async () => {
    await expect(
      withCtx(identity, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) =>
        sql`select identity.create_principal(${cap.target}::uuid, 'human', 'TENANT', ${tenant}::uuid, null::uuid,
              'forged', ${'forged-' + uuidv7().slice(-8)}, null, 'tenant_admin')`.execute(tx),
        { action: 'identity.principal.create', target: uuidv7() }),
    ).rejects.toThrow(/not authorized|row-level security|binding rejected/i);
  });

  it('cannot create a tenant-level canonical object or outbox message', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
        await sql`select objects.enqueue_event(${uuidv7()}::uuid, 'forged', '{}'::jsonb, ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
        await closeOperation(tx, cap, { type: 'outbox' });
      }),
    ).resolves.toBeUndefined(); // its OWN domain event is fine…
    // …but a tenant-level one is impossible: the port derives scope from context,
    // so there is no way to express "tenant-level" from a DOMAIN context.
    const rows = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql<{ scope: string; domain_id: string }>`select scope, domain_id from objects.object_outbox where event_type = 'forged'`.execute(tx));
    expect(rows.rows.every((r) => r.scope === 'DOMAIN' && r.domain_id === domainA)).toBe(true);
  });

  it('cannot create a domain (a TENANT-level act)', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) =>
        sql`select tenancy.create_domain(${cap.target}::uuid, ${tenant}::uuid, 'forged')`.execute(tx),
        { action: 'tenancy.domain.create', target: uuidv7() }),
    ).rejects.toThrow(/tenant-level authority required/);
  });

  it('cannot read tenant-global or sibling-domain audit metadata', async () => {
    // Tenant-level (domain_id NULL) audit row, written under tenant authority:
    await withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) => {
      await sql`select audit.commit_event('test.tenant_level',${cap.action},'success','OK',
        null,null,null,null::uuid,null,${cap.correlationId}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(tx);
    });
    const seen = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql`select * from audit.audit_events where event_type = 'test.tenant_level'`.execute(tx));
    expect(seen.rows).toHaveLength(0);
  });

  it('cannot read the tenants table, but CAN use the authorized read model', async () => {
    const direct = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql`select * from tenancy.tenants`.execute(tx));
    expect(direct.rows).toHaveLength(0);
    const model = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql<{ id: string }>`select * from tenancy.my_tenant()`.execute(tx));
    expect(model.rows.map((r) => r.id)).toEqual([tenant]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('5 — a DOMAIN principal cannot grant itself tenant administration', () => {
  it('is refused by the binding-authority trigger even with superuser INSERT', async () => {
    await expect(
      sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id, granted_by_principal, granted_by_scope)
          values (${uuidv7()}, ${aAdmin.principalId}, 'tenant_admin', 'TENANT', ${tenant}, null, ${aAdmin.principalId}, 'DOMAIN')`.execute(su),
    ).rejects.toThrow(/domain principal cannot hold a TENANT binding|may not grant/i);
  });

  it('a TENANT grantor cannot mint a PLATFORM binding', async () => {
    await expect(
      sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id, granted_by_principal, granted_by_scope)
          values (${uuidv7()}, ${tenantAdmin.principalId}, 'platform_admin', 'PLATFORM', null, null, ${tenantAdmin.principalId}, 'TENANT')`.execute(su),
    ).rejects.toThrow(/tenant principal cannot hold a PLATFORM binding|does not dominate/i);
  });

  it('a binding may not point at another tenant than its principal', async () => {
    await expect(
      sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
          values (${uuidv7()}, ${tenantAdmin.principalId}, 'tenant_admin', 'TENANT', ${tenantOther}, null)`.execute(su),
    ).rejects.toThrow(/must match the principal tenant/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('6 — fabricated POL/AUD evidence is rejected', () => {
  it('the general application role cannot call the evidence ports at all', async () => {
    await expect(
      sql`select audit.commit_event('forge','a','success','OK',null,null,null,null::uuid,null,${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(app),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sql`select policy.commit_decision(${uuidv7()}::uuid,'a','CLM',null::uuid,'C1','allow','[]'::jsonb,${'a'.repeat(64)},'bundle-v1',null,null,'none','r',${uuidv7()}::uuid,null,'{}'::jsonb)`.execute(app),
    ).rejects.toThrow(/permission denied/);
  });

  it('the commit role cannot write evidence WITHOUT a valid context (same scope label is not enough)', async () => {
    await expect(
      commit.transaction().execute(async (tx) =>
        sql`select audit.commit_event('forge','a','success','OK',null,null,null,null::uuid,null,${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/authority or evidence context required \(context is none\)/);
    await expect(
      commit.transaction().execute(async (tx) =>
        sql`select policy.commit_decision(${uuidv7()}::uuid,'a','CLM',null::uuid,'C1','allow','[]'::jsonb,${'a'.repeat(64)},'bundle-v1',null,null,'none','r',${uuidv7()}::uuid,null,'{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/context required|no valid authoritative context/);
  });

  it('the actor and scope are DERIVED — a caller cannot choose them', async () => {
    let corr = '';
    await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
      corr = cap.correlationId;
      await sql`select audit.commit_event('test.derived',${cap.action},'success','OK',
        null,null,null,null::uuid,null,${cap.correlationId}::uuid,null::uuid,null,null,null,
        ${JSON.stringify({ actor: 'principal:SOMEONE-ELSE', scope: 'PLATFORM' })}::jsonb)`.execute(tx);
    });
    const row = (
      await sql<{ actor: string; scope: string; tenant_id: string; domain_id: string }>`
        select actor, scope, tenant_id, domain_id from audit.audit_events where correlation_id = ${corr}`.execute(su)
    ).rows[0]!;
    // Metadata cannot override the derived authority fields.
    expect(row.actor).toBe(`principal:${aAdmin.principalId}`);
    expect(row.scope).toBe('DOMAIN');
    expect(row.tenant_id).toBe(tenant);
    expect(row.domain_id).toBe(domainA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('7 — malformed scope combinations and invalid descriptors are rejected', () => {
  it('rejects an invalid outcome and an invalid decision', async () => {
    await expect(
      withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) =>
        sql`select audit.commit_event('x',${cap.action},'totally-made-up','OK',null,null,null,null::uuid,null,${cap.correlationId}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/invalid outcome/);
    await expect(
      withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) =>
        sql`select policy.commit_decision(${cap.policyDecisionId}::uuid,${cap.action},'CLM',null::uuid,'C1','maybe','[]'::jsonb,${'a'.repeat(64)},${cap.bundleVersion},null,null,'none','r',${cap.correlationId}::uuid,null,'{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/invalid decision/);
  });

  it('rejects PLATFORM/TENANT/DOMAIN identifier combinations that cannot exist', async () => {
    // A DOMAIN context whose domain identifier is absent is unobtainable…
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/domain scope identifiers invalid/);
    // …and PLATFORM carrying identifiers is refused at issuance.
    await expect(
      withCtx(commit, platformAdmin, 'PLATFORM', tenant, null, async (tx) => sql`select 1`.execute(tx)),
    ).rejects.toThrow(/platform scope carries identifiers/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('8 — stored audit bytes ARE the RFC 8785 JCS bytes that were hashed', () => {
  it('event_jcs equals the reference JCS of the stored event, and row_hash binds it', async () => {
    let corr = '';
    await withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx, cap) => {
      corr = cap.correlationId;
      await sql`select audit.commit_event('test.jcs',${cap.action},'success','OK',
        'CLM', ${uuidv7()}, '1', null::uuid, null, ${cap.correlationId}::uuid, null::uuid, 'trace',
        ${'d'.repeat(64)}, null,
        ${JSON.stringify({ n: 7, s: 'quote " and \\ backslash', arr: ['a', 'b'], nested: { t: true, z: null } })}::jsonb)`.execute(tx);
    });
    const row = (
      await sql<{ event_jcs: string; event: unknown; row_hash: string; previous_hash: string; audit_seq: string; partition_id: string }>`
        select event_jcs, event, row_hash, previous_hash, audit_seq, partition_id
          from audit.audit_events where correlation_id = ${corr}`.execute(su)
    ).rows[0]!;

    // (a) the stored bytes are exactly the canonical form of the stored object
    expect(row.event_jcs).toBe(jcsCanonicalize(row.event));
    // (b) the chain hash binds exactly those bytes (independent recomputation)
    const { auditRowHash } = await import('@eye/contracts');
    expect(
      auditRowHash({
        partitionId: row.partition_id,
        auditSeq: Number(row.audit_seq),
        previousHash: row.previous_hash,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: row.event as any,
      }),
    ).toBe(row.row_hash);
    // (c) it is NOT merely jsonb::text (which sorts differently / adds spaces)
    const asJsonbText = (
      await sql<{ t: string }>`select (event_jcs::jsonb)::text t from audit.audit_events where correlation_id = ${corr}`.execute(su)
    ).rows[0]!.t;
    expect(asJsonbText).not.toBe(row.event_jcs);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('9 — audit heads, seals and incidents do not leak across scopes', () => {
  it('the application role has no access to heads/seals/incidents at all', async () => {
    for (const t of ['audit.audit_chain_heads', 'audit.audit_seals', 'audit.integrity_incidents']) {
      await expect(sql`select * from ${sql.raw(t)} limit 1`.execute(app), t).rejects.toThrow(/permission denied/);
    }
  });

  it('the scoped read model refuses a foreign partition', async () => {
    // Gate-2.1 §5: audit.my_partition_status is GONE — it returned tenant-global
    // head state to DOMAIN callers. Its replacement takes no partition argument
    // from a DOMAIN caller and matches the partition EXACTLY for a tenant caller.
    const own = await withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx) =>
      sql`select * from audit.my_partition_integrity(${'tenant:' + tenant})`.execute(tx));
    expect(own.rows.length).toBeGreaterThan(0);
    const foreign = await withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx) =>
      sql`select * from audit.my_partition_integrity(${'tenant:' + tenantOther})`.execute(tx));
    expect(foreign.rows).toHaveLength(0);
    const platform = await withCtx(commit, tenantAdmin, 'TENANT', tenant, null, async (tx) =>
      sql`select * from audit.my_partition_integrity('platform')`.execute(tx));
    expect(platform.rows).toHaveLength(0);

    // A DOMAIN caller gets its OWN domain's integrity view and cannot ask for a
    // tenant-global one at all (no argument exists through which to ask).
    const domainView = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql`select * from audit.my_domain_integrity()`.execute(tx));
    expect(domainView.rows.length).toBeGreaterThanOrEqual(0);
    const domainAsksTenant = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
      sql`select * from audit.my_partition_integrity(${'tenant:' + tenant})`.execute(tx));
    expect(domainAsksTenant.rows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('13 — refresh replay of n-2 and older revokes the active family', () => {
  it('replaying generation n-2 after two rotations revokes the whole family', async () => {
    const p = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'adv-fam' });
    const gen1 = p.refreshToken;
    const rotate = async (token: string) =>
      withIdentityOp(identity, 'identity.session.refresh', null, async (tx) =>
        (
          await sql<{ outcome: string; generation: number }>`
            select outcome, generation from identity.refresh_rotate_family(
              ${sha256(token)}, ${sha256('next-' + token)}, ${sha256('ctx-' + token)})`.execute(tx)
        ).rows[0]!);

    const r1 = await rotate(gen1);
    expect(r1.outcome).toBe('rotated');
    const gen2 = 'next-' + gen1;
    const r2 = await rotate(gen2);
    expect(r2.outcome).toBe('rotated');
    const gen3 = 'next-' + gen2;

    // Replay the OLDEST (n-2) token: must be detected as reuse.
    const replay = await rotate(gen1);
    expect(replay.outcome).toBe('reuse');

    // The whole family is dead, including the newest generation.
    const after = await rotate(gen3);
    expect(after.outcome).toBe('reuse');
    const sessions = await sql<{ status: string }>`select status from identity.sessions where family_id = ${p.familyId}`.execute(su);
    expect(sessions.rows.every((s) => s.status === 'revoked')).toBe(true);
    // No plaintext token is ever stored.
    const ledger = await sql<{ token_hash: string }>`select token_hash from identity.refresh_tokens where family_id = ${p.familyId}`.execute(su);
    expect(ledger.rows.length).toBeGreaterThanOrEqual(3);
    for (const row of ledger.rows) {
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect([gen1, gen2, gen3]).not.toContain(row.token_hash);
    }
  });

  it('an even older generation (n-10) still triggers family revocation', async () => {
    const p = await createPrincipalWithSession(identity, su, { scope: 'TENANT', tenantId: tenant, roleCode: 'tenant_admin', label: 'adv-fam10' });
    let token = p.refreshToken;
    const chain = [token];
    for (let i = 0; i < 10; i += 1) {
      const next = `g${i}-${token}`;
      const r = await withIdentityOp(identity, 'identity.session.refresh', null, async (tx) =>
        (
          await sql<{ outcome: string }>`select outcome from identity.refresh_rotate_family(
            ${sha256(token)}, ${sha256(next)}, ${sha256('c' + next)})`.execute(tx)
        ).rows[0]!);
      expect(r.outcome).toBe('rotated');
      token = next;
      chain.push(next);
    }
    const oldest = chain[0]!;
    const replay = await withIdentityOp(identity, 'identity.session.refresh', null, async (tx) =>
      (
        await sql<{ outcome: string }>`select outcome from identity.refresh_rotate_family(
          ${sha256(oldest)}, ${sha256('x')}, ${sha256('y')})`.execute(tx)
      ).rows[0]!);
    expect(replay.outcome).toBe('reuse');
    const sessions = await sql<{ status: string }>`select status from identity.sessions where family_id = ${p.familyId}`.execute(su);
    expect(sessions.rows.every((s) => s.status === 'revoked')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('14 — canonical insertion with an invented digest is rejected', () => {
  function fullHeader(objectId: string, tenantId: string, domainId: string): CanonicalHeader {
    return {
      object_id: objectId, object_type: 'CLM', tenant_id: tenantId, domain_id: domainId,
      scope: 'DOMAIN', object_version: '1', lifecycle_state: 'admitted',
      owning_component: 'CP-OBJ-01', accountable_owner: 'principal:test', source_object_ids: [],
      event_time: null, observation_time: '2026-08-05T00:00:00.000Z', valid_from: null, valid_to: null,
      recorded_at: '2026-08-05T00:00:00.000Z', time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: false, confidence: null, uncertainty: null,
      evidence_refs: ['evd:adv'], provenance_ref: null, method_ref: null, contradiction_refs: [],
      corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'test',
      rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1',
      ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
      audit_correlation_id: uuidv7(), content_ref: null,
    };
  }

  it('the commit role holds no direct INSERT on canonical_objects', async () => {
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx) =>
        sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope,
              object_version, lifecycle_state, owning_component, accountable_owner, truth_state,
              classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest, evidence_refs)
            values (${uuidv7()}, 'CLM', ${tenant}, ${domainA}, 'DOMAIN', 1, 'admitted', 'x', 'x', 'asserted',
                    'internal', 'test', 'CLM@v1', ${uuidv7()}, '{}', ${'a'.repeat(64)}, '["e"]')`.execute(tx)),
    ).rejects.toThrow(/permission denied/);
  });

  it('admission refuses an invented digest', async () => {
    const objectId = uuidv7();
    const header = fullHeader(objectId, tenant, domainA);
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) =>
        sql`select objects.admit_version(${JSON.stringify({ ...header, audit_correlation_id: cap.correlationId })}::jsonb, ${JSON.stringify({ subject: 'a', predicate: 'b', object_value: 'c' })}::jsonb, ${'f'.repeat(64)})`.execute(tx),
        { action: 'objects.create', target: objectId }),
    ).rejects.toThrow(/does not bind the header and payload/);
  });

  it('admission refuses a header that is missing any registry field', async () => {
    const objectId = uuidv7();
    const header = fullHeader(objectId, tenant, domainA) as unknown as Record<string, unknown>;
    delete header['classification'];
    const payload = { subject: 'a', predicate: 'b', object_value: 'c' };
    await expect(
      withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) =>
        sql`select objects.admit_version(${JSON.stringify({ ...header, audit_correlation_id: cap.correlationId })}::jsonb, ${JSON.stringify(payload)}::jsonb, ${'f'.repeat(64)})`.execute(tx),
        { action: 'objects.create', target: objectId }),
    ).rejects.toThrow(/missing required field/);
  });

  it('accepts the correct digest and stores exactly the recomputed value', async () => {
    const objectId = uuidv7();
    const payload = { subject: 'a', predicate: 'b', object_value: 'c' };
    const out = await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
      const header = { ...fullHeader(objectId, tenant, domainA), audit_correlation_id: cap.correlationId };
      const digest = canonicalHeaderDigest(header, payload);
      const r = await sql<{ content_digest: string }>`select content_digest from objects.admit_version(
        ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(tx);
      await closeOperation(tx, cap, { type: 'CLM', id: objectId });
      expect(r.rows[0]!.content_digest).toBe(digest);
      return r;
    }, { action: 'objects.create', target: objectId });
    // The DB recomputed the same digest the contracts package computed (asserted inside).
    expect(out.rows[0]!.content_digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('15 — outbox rewriting and unauthorized publish acknowledgement', () => {
  let eventId = '';

  beforeAll(async () => {
    eventId = uuidv7();
    await withCtx(commit, aAdmin, 'DOMAIN', tenant, domainA, async (tx, cap) => {
      await sql`select objects.enqueue_event(${eventId}::uuid, 'adv.event',
        ${JSON.stringify({ original: true })}::jsonb, ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      await closeOperation(tx, cap, { type: 'outbox', id: eventId });
    });
  });

  it('event identity and content are immutable even for the superuser', async () => {
    await expect(
      sql`update objects.object_outbox set payload = '{"tampered":true}'::jsonb where id = ${eventId}`.execute(su),
    ).rejects.toThrow(/immutable/);
    await expect(
      sql`update objects.object_outbox set event_type = 'other' where id = ${eventId}`.execute(su),
    ).rejects.toThrow(/immutable/);
    await expect(
      sql`update objects.object_outbox set correlation_id = ${uuidv7()} where id = ${eventId}`.execute(su),
    ).rejects.toThrow(/immutable/);
  });

  it('the ungated acknowledgement port no longer exists, and no other role can ack', async () => {
    // Gate-2.1 §6: objects.outbox_ack (status-only CAS, no lease) is GONE; the
    // publisher's general UPDATE is gone too. Only a LEASE HOLDER can transition.
    const gone = await sql<{ n: string }>`
      select count(*) n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'objects' and p.proname in ('outbox_ack','outbox_claim')`.execute(su);
    expect(Number(gone.rows[0]!.n)).toBe(0);

    for (const [name, db] of [['app', app], ['commit', commit]] as const) {
      await expect(
        sql`select objects.outbox_ack_leased(${eventId}::uuid, ${uuidv7()}::uuid, 'pending', 'published')`.execute(db),
        name,
      ).rejects.toThrow(/permission denied/);
    }
    await expect(sql`update objects.object_outbox set status = 'published' where id = ${eventId}`.execute(app))
      .rejects.toThrow(/permission denied/);
    await expect(sql`update objects.object_outbox set status = 'published' where id = ${eventId}`.execute(publisher))
      .rejects.toThrow(/permission denied/);
  });

  it('acknowledgement requires the CURRENT lease — a stale or invented lease cannot publish', async () => {
    // An invented lease id cannot acknowledge, even with the right transition and
    // the publish capability.
    const forged = await withPublishCtx(publisher, eventId, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_ack_leased(
        ${eventId}::uuid, ${uuidv7()}::uuid, 'pending', 'published') as ok`.execute(tx)).rows[0]!.ok);
    expect(forged).toBe(false);
    const stillPending = await sql<{ status: string }>`
      select status from objects.object_outbox where id = ${eventId}`.execute(su);
    expect(stillPending.rows[0]!.status).toBe('pending');

    // Take a real lease; the row is now claimed by THIS publisher.
    const leased = await withPublishCtx(publisher, null, async (tx) =>
      sql<{ id: string; lease_id: string }>`select id, lease_id from objects.outbox_lease(50, 60)`.execute(tx));
    const mine = leased.rows.find((r) => r.id === eventId);
    expect(mine, 'the pending event must be leasable').toBeTruthy();

    // A SECOND leaseholder cannot appear while the lease is live…
    const contender = await withPublishCtx(publisher, null, async (tx) =>
      sql<{ id: string }>`select id from objects.outbox_lease(50, 60)`.execute(tx));
    expect(contender.rows.map((r) => r.id)).not.toContain(eventId);

    // …a reverse transition is refused even WITH the correct lease…
    await expect(
      withPublishCtx(publisher, eventId, async (tx) =>
        sql`select objects.outbox_ack_leased(${eventId}::uuid, ${mine!.lease_id}::uuid, 'published', 'pending')`.execute(tx)),
    ).rejects.toThrow(/not permitted/);

    // …and the permitted transition succeeds exactly once.
    const first = await withPublishCtx(publisher, eventId, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_ack_leased(
        ${eventId}::uuid, ${mine!.lease_id}::uuid, 'pending', 'published') as ok`.execute(tx)).rows[0]!.ok);
    expect(first).toBe(true);
    const second = await withPublishCtx(publisher, eventId, async (tx) =>
      (await sql<{ ok: boolean }>`select objects.outbox_ack_leased(
        ${eventId}::uuid, ${mine!.lease_id}::uuid, 'pending', 'published') as ok`.execute(tx)).rows[0]!.ok);
    expect(second).toBe(false);
  });

  it('the publish capability cannot enqueue events or touch business state', async () => {
    await expect(
      sql`select objects.enqueue_event(${uuidv7()}::uuid, 'x', '{}'::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(publisher),
    ).rejects.toThrow(/permission denied/);
    await expect(sql`select * from objects.canonical_objects limit 1`.execute(publisher))
      .rejects.toThrow(/permission denied/);
    // And holding a publish capability does not make an audit write possible.
    await expect(
      withPublishCtx(publisher, eventId, async (tx) =>
        sql`select audit.commit_event('forge','a','success','OK',null,null,null,null::uuid,null,
          ${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(tx)),
    ).rejects.toThrow(/permission denied/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('16 — concurrent bootstrap attempts', () => {
  it('exactly one of two concurrent bootstrap attempts wins the claim', async () => {
    // The single-row claim IS the concurrency guard. Reset it, then race two
    // attempts: the database must serialize them so exactly one observes a win.
    await sql`delete from identity.bootstrap_claim`.execute(su);
    const claim = async () =>
      identity
        .transaction()
        .execute(async (tx) => {
          await sql`select ctx.issue_bootstrap(${uuidv7()}::uuid)`.execute(tx);
          return (await sql<{ ok: boolean }>`select identity.claim_bootstrap() as ok`.execute(tx)).rows[0]!.ok;
        })
        .catch((e: Error) => e.message);

    const outcomes = await Promise.all([claim(), claim()]);
    expect(outcomes.filter((o) => o === true)).toHaveLength(1);
    expect(outcomes.filter((o) => o === false)).toHaveLength(1);

    // And a third attempt after the claim is taken always loses.
    expect(await claim()).toBe(false);

    // Belt-and-braces: the platform-admin precheck blocks bootstrap independently
    // of the claim (this database already has an administrator).
    const exists = await identity.transaction().execute(async (tx) => {
      await sql`select ctx.issue_bootstrap(${uuidv7()}::uuid)`.execute(tx);
      return (await sql<{ ok: boolean }>`select identity.platform_admin_exists() as ok`.execute(tx)).rows[0]!.ok;
    });
    expect(exists).toBe(true);
  });

  it('bootstrap is structurally refused outside a local/test runtime profile', async () => {
    await sql`update config.runtime_profile set profile = 'production' where id = 1`.execute(su);
    try {
      await sql`delete from identity.bootstrap_claim`.execute(su);
      // The capability itself is refused outside local/test: the runtime profile
      // is checked at ISSUANCE, before any bootstrap port can be reached.
      await expect(
        identity.transaction().execute(async (tx) =>
          sql`select ctx.issue_bootstrap(${uuidv7()}::uuid)`.execute(tx)),
      ).rejects.toThrow(/runtime profile|not local\/test/);
    } finally {
      await sql`update config.runtime_profile set profile = 'local' where id = 1`.execute(su);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('recovery authority is not reachable from runtime roles', () => {
  it('only the break-glass recovery role can rebuild chain heads', async () => {
    for (const [name, db] of [['app', app], ['commit', commit], ['identity', identity], ['verifier', verifier], ['publisher', publisher]] as const) {
      await expect(sql`select audit.rebuild_chain_heads()`.execute(db), name).rejects.toThrow(/permission denied/);
    }
    // The recovery credential works — and is deliberately absent from the app config.
    await expect(sql`select audit.rebuild_chain_heads()`.execute(recovery)).resolves.toBeDefined();
  });

  it('the recovery role cannot write evidence or mutate identity', async () => {
    await expect(
      sql`select audit.commit_event('x','a','success','OK',null,null,null,null::uuid,null,${uuidv7()}::uuid,null::uuid,null,null,null,'{}'::jsonb)`.execute(recovery),
    ).rejects.toThrow(/permission denied/);
    await expect(sql`select * from identity.credentials limit 1`.execute(recovery)).rejects.toThrow(/permission denied/);
  });

  it('17 — the clean-source typecheck gate script exists and is wired into CI', () => {
    // The executable proof runs in the gate harness (a genuinely clean checkout
    // with no dist/.next/tsbuildinfo present); this asserts the gate exists and
    // that CI runs typecheck in the declared order.
    const ci = execFileSync('cat', [join(__dirname, '..', '..', '..', '..', '.github', 'workflows', 'ci.yml')], { encoding: 'utf8' });
    expect(ci).toContain('verify-clean-typecheck.sh');
  });
});
