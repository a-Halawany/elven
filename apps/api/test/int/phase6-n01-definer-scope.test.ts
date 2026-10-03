/**
 * N-01 (migration 0102) — LATER-SCHEMA SECURITY DEFINER READS BOUND TO THE CALLER'S SCOPE; THE CONSTRAINT-GATE CAPABILITY NARROWED.
 *
 * A bounded later-schema proof on a disposable PostgreSQL 18 database. It does not rewrite the frozen foundation authority matrix
 * (gate22-authority-matrix.test.ts covers the governed foundation schemas and is run unchanged beside this file). This is the known
 * database defense-in-depth finding: a runtime role reading across tenants through a definer function — not an anonymous HTTP exploit.
 *
 * Two kinds of proof, kept apart:
 *   BEHAVIOUR — each function is called on the same seeded rows of tenant A / domain A1 along five paths: UNBOUND (a runtime role with no
 *     context), WRONG TENANT (bound to tenant B), WRONG DOMAIN (bound to A2), AUTHORIZED (bound to A/A1) and PUBLIC (eye_identity: a runtime
 *     role with USAGE on graph and executive and no explicit grant — what PUBLIC EXECUTE reached). RLS CONTROLS read the same rows directly under the same bindings; MINTER CONTROLS exercise the constraint-gate capability.
 *   CATALOG — EXECUTE per role and the creator's default function privileges, read from pg_proc / pg_default_acl.
 *
 * BEFORE / AFTER: run with EYE_N01_BASELINE=1 on a database migrated through 0101 (without 0102) and every behavioural and catalog case asserts
 * the defect as reproduced; run without it on a database through 0102 and every case asserts the correction. The authorized paths and the
 * RLS controls assert the same in both runs. Seed rows are written by the migration role with session_replication_role = replica (the seeds
 * are fixtures for reads, not the write ports' proof — those ports' own harnesses prove them).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import {
  appDb, commitDb, identityDb, superDb, seedTenant, seedDomain, createPrincipalWithSession, withCtx, sha256,
  type AnyDb, type TestPrincipal,
} from './helpers.js';

const BASELINE = process.env['EYE_N01_BASELINE'] === '1';
type Row = Record<string, unknown>;

let su: AnyDb; let app: AnyDb; let commit: AnyDb; let ident: AnyDb;
let A: string; let A1: string; let A2: string; let B: string; let B1: string; let A3: string;
let pA1: TestPrincipal; let pA2: TestPrincipal; let pB1: TestPrincipal;
/** the seeded objects of A/A1 */
const S = { source: uuidv7(), objective: uuidv7(), item: uuidv7(), indicator: uuidv7(), brf: uuidv7(), evd: uuidv7(), hold: uuidv7(),
            pub: uuidv7(), set: uuidv7() };
const ROLE = 'n01_reader';

/** The outcome of one call: the value, or the refusal's text. */
async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; v: T } | { ok: false; msg: string }> {
  try { return { ok: true, v: await fn() }; } catch (e) { return { ok: false, msg: e instanceof Error ? e.message : String(e) }; }
}
const one = async (db: AnyDb | never, q: ReturnType<typeof sql>): Promise<unknown> => ((await q.execute(db as AnyDb)).rows[0] as Row | undefined)?.['r'] ?? null;
const all = async (db: AnyDb | never, q: ReturnType<typeof sql>): Promise<Row[]> => (await q.execute(db as AnyDb)).rows as Row[];

/** The seven reproduced reads and the two explicit later-schema cases; each returns what it disclosed about A/A1 (null/empty = nothing). */
interface Fn { name: string; call: (db: AnyDb) => Promise<unknown>; leaked: (v: unknown) => boolean; objectId?: boolean }
const FNS: Fn[] = [
  { name: 'observation.replay_health', call: (db) => all(db, sql`select * from observation.replay_health(${A}::uuid, ${A1}::uuid, ${S.source}::uuid)`),
    leaked: (v) => Array.isArray(v) && v.length === 1 && (v[0] as Row)['reason'] === 'n01 seeded degradation' },
  { name: 'graph.strategy_plan_links', call: (db) => one(db, sql`select graph.strategy_plan_links(${A}::uuid, ${A1}::uuid, ${S.objective}::uuid) as r`),
    leaked: (v) => JSON.stringify(v ?? null).includes('N-01 seeded initiative') },
  { name: 'executive.publication_controls', objectId: true, call: (db) => one(db, sql`select executive.publication_controls(${S.pub}::uuid) as r`),
    leaked: (v) => JSON.stringify(v ?? null).includes(S.hold) },
  { name: 'executive.publication_source', call: (db) => one(db, sql`select executive.publication_source(${A}::uuid, ${A1}::uuid, 'briefing', ${S.brf}::uuid, 1) as r`),
    leaked: (v) => JSON.stringify(v ?? null).includes(S.hold) },
  { name: 'executive.publication_recipients', call: (db) => one(db, sql`select executive.publication_recipients(${A}::uuid, ${A1}::uuid, ${JSON.stringify({ roles: [ROLE] })}::jsonb) as r`),
    leaked: (v) => JSON.stringify(v ?? null).includes(pA1.principalId) },
  { name: 'executive.role_holder_ids', call: (db) => all(db, sql`select r from executive.role_holder_ids(${A}::uuid, ${A1}::uuid, ARRAY[${ROLE}]::text[]) r`),
    leaked: (v) => Array.isArray(v) && v.some((r) => (r as Row)['r'] === pA1.principalId) },
  { name: 'decision.commitment_item_signal', call: (db) => one(db, sql`select decision.commitment_item_signal(${A}::uuid, ${A1}::uuid, ${S.item}::uuid) as r`),
    leaked: (v) => JSON.stringify(v ?? null).includes('N-01 seeded obligation') },
  { name: 'executive.health_input_owner', call: (db) => all(db, sql`select * from executive.health_input_owner(${A}::uuid, ${A1}::uuid, 'indicator', ${S.indicator}::uuid)`),
    leaked: (v) => Array.isArray(v) && v.length === 1 && String((v[0] as Row)['owner_basis']).includes(S.indicator) },
  { name: 'executive.publication_archive_record', objectId: true, call: (db) => one(db, sql`select executive.publication_archive_record(${S.pub}::uuid) as r`),
    leaked: (v) => JSON.stringify(v ?? null).includes(S.hold) },
];
/** The functions that carried PUBLIC EXECUTE before 0102 (the two reads; the ten trigger functions are catalog cases only). */
const PUBLIC_READS = ['graph.strategy_plan_links', 'executive.publication_archive_record'];
const TRIGGERS = ['decision.seed_commitment_tracker', 'executive.briefing_dependencies', 'executive.hold_commitment_on_breach', 'graph.edge_reassessment_closed_event',
                  'graph.edge_reassessment_closes', 'prediction.warning_level_immutable', 'twin.agent_write_boundary', 'twin.propose_couplings',
                  'twin.twin_kind_in_scope', 'twin.upstream_owner_boundary'];

const bound = <T>(p: TestPrincipal, t: string, d: string, fn: (db: AnyDb) => Promise<T>) =>
  withCtx(commit, p, 'DOMAIN', t, d, async (tx) => fn(tx as unknown as AnyDb), { action: 'n01.read', target: 'n01:read' });
const unbound = <T>(fn: (db: AnyDb) => Promise<T>) => app.transaction().execute(async (tx) => fn(tx as unknown as AnyDb));

beforeAll(async () => {
  su = superDb(); app = appDb(); commit = commitDb(); ident = identityDb();
  A = await seedTenant(su, 'n01-a'); A1 = await seedDomain(su, A, 'n01-a1'); A2 = await seedDomain(su, A, 'n01-a2');
  A3 = await seedDomain(su, A, 'n01-a3');
  await sql`update tenancy.domains set status = 'suspended' where id = ${A3}::uuid`.execute(su);
  B = await seedTenant(su, 'n01-b'); B1 = await seedDomain(su, B, 'n01-b1');
  pA1 = await createPrincipalWithSession(ident, su, { scope: 'DOMAIN', tenantId: A, domainId: A1, roleCode: 'domain_admin', label: 'n01-a1' });
  pA2 = await createPrincipalWithSession(ident, su, { scope: 'DOMAIN', tenantId: A, domainId: A2, roleCode: 'domain_admin', label: 'n01-a2' });
  pB1 = await createPrincipalWithSession(ident, su, { scope: 'DOMAIN', tenantId: B, domainId: B1, roleCode: 'domain_admin', label: 'n01-b1' });
  const c = uuidv7(); const d64 = sha256('n01');
  await su.transaction().execute(async (tx) => {
    await sql`set local session_replication_role = replica`.execute(tx);
    // the role the recipients / role-holder reads resolve (a binding of A1's principal; not a role the product grants)
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${pA1.principalId}::uuid, ${ROLE}, 'DOMAIN', ${A}::uuid, ${A1}::uuid)`.execute(tx);
    await sql`insert into observation.source_health_events (event_id, scope, tenant_id, domain_id, source_id, new_state, evaluated_at, calc_version, coverage_universe_version, reason, correlation_id)
              values (${uuidv7()}::uuid, 'DOMAIN', ${A}::uuid, ${A1}::uuid, ${S.source}::uuid, 'degraded', now(), 'n01@1', 1, 'n01 seeded degradation', ${c}::uuid)`.execute(tx);
    await sql`insert into executive.initiatives (initiative_id, scope, tenant_id, domain_id, plan_id, objective_id, title, sponsor_principal_id, owner_principal_id, proposed_by, proposed_by_kind, digest, correlation_id)
              values (${uuidv7()}::uuid, 'DOMAIN', ${A}::uuid, ${A1}::uuid, ${uuidv7()}::uuid, ${S.objective}::uuid, 'N-01 seeded initiative', ${pA1.principalId}::uuid, ${pA1.principalId}::uuid, ${pA1.principalId}::uuid, 'human', ${d64}, ${c}::uuid)`.execute(tx);
    await sql`insert into decision.commitment_items (item_id, scope, tenant_id, domain_id, commitment_id, package_id, kind, title, owner_principal_id, reviewer_basis, due_at, created_by, correlation_id)
              values (${S.item}::uuid, 'DOMAIN', ${A}::uuid, ${A1}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid, 'obligation', 'N-01 seeded obligation', ${pA1.principalId}::uuid, 'declared', now() + interval '7 days', ${pA1.principalId}::uuid, ${c}::uuid)`.execute(tx);
    await sql`insert into prediction.indicators_current (indicator_id, scope, tenant_id, domain_id, series_key, description, comparator, threshold, consecutive_days, owner_principal_id, state, correlation_id)
              values (${S.indicator}::uuid, 'DOMAIN', ${A}::uuid, ${A1}::uuid, 'n01:series', 'N-01 seeded indicator', '>', 1, 1, ${pA1.principalId}::uuid, 'active', ${c}::uuid)`.execute(tx);
    await sql`insert into objects.canonical_objects (object_id, object_type, scope, tenant_id, domain_id, object_version, lifecycle_state, owning_component, accountable_owner, truth_state,
                classification, purpose_scope, schema_ref, audit_correlation_id, content_digest, evidence_refs)
              values (${S.brf}::uuid, 'BRF', 'DOMAIN', ${A}::uuid, ${A1}::uuid, 1, 'active', 'executive', 'n01', 'assessed', 'confidential', 'n01', 'BRF@v2', ${c}::uuid, ${d64},
                      ${JSON.stringify([`EVD:${S.evd}@1`])}::jsonb)`.execute(tx);
    await sql`insert into observation.legal_holds (hold_id, scope, tenant_id, domain_id, manifest_id, evd_object_id, reason, placed_by, correlation_id)
              values (${S.hold}::uuid, 'DOMAIN', ${A}::uuid, ${A1}::uuid, ${uuidv7()}::uuid, ${S.evd}::uuid, 'N-01 seeded legal hold', ${pA1.principalId}::uuid, ${c}::uuid)`.execute(tx);
    await sql`insert into executive.publications (publication_id, scope, tenant_id, domain_id, title, audience, classification, channels, format, accessibility, template, drafted_by, current_version, state, correlation_id)
              values (${S.pub}::uuid, 'DOMAIN', ${A}::uuid, ${A1}::uuid, 'N-01 seeded publication', '{}'::jsonb, 'confidential', ARRAY['in_app'], 'html', '{}'::jsonb, 'board-brief@1', ${pA1.principalId}::uuid, 1, 'drafted', ${c}::uuid)`.execute(tx);
    await sql`insert into executive.publication_versions (publication_id, version, scope, tenant_id, domain_id, source_kind, source_id, source_version, source_digest, format, bytes_digest, byte_length, vault_ref, render_method, state, drafted_by, correlation_id)
              values (${S.pub}::uuid, 1, 'DOMAIN', ${A}::uuid, ${A1}::uuid, 'briefing', ${S.brf}::uuid, 1, ${d64}, 'html', ${d64}, 10, ${`${uuidv7()}/${uuidv7()}.bin`}, 'n01', 'drafted', ${pA1.principalId}::uuid, ${c}::uuid)`.execute(tx);
    await sql`insert into simulation.constraint_sets (set_id, scope, tenant_id, domain_id, set_key, title, steward_principal_id, state, current_version, declared_by, correlation_id)
              values (${S.set}::uuid, 'DOMAIN', ${A}::uuid, ${A1}::uuid, 'n01-capacity', 'N-01 seeded capacity', ${pA1.principalId}::uuid, 'live', 1, ${pA1.principalId}::uuid, ${c}::uuid)`.execute(tx);
    await sql`insert into simulation.constraint_set_versions (set_id, version, scope, tenant_id, domain_id, constraints, digest, note, declared_by, correlation_id)
              values (${S.set}::uuid, 1, 'DOMAIN', ${A}::uuid, ${A1}::uuid,
                      ${JSON.stringify([{ key: 'cap', kind: 'business_rule', quantity: 'warehouse:n01.pallets', op: '<=', value: 10, unit: 'pallets', applies_to: ['plan'] }])}::jsonb,
                      ${d64}, 'n01 seed', ${pA1.principalId}::uuid, ${c}::uuid)`.execute(tx);
  });
}, 60_000);

afterAll(async () => { await Promise.all([su, app, commit, ident].map((d) => d?.destroy())); });

describe(`N-01 behaviour — the guarded reads (${BASELINE ? 'BASELINE: the defect reproduced' : 'CORRECTED'})`, () => {
  for (const f of FNS) {
    describe(f.name, () => {
      it('AUTHORIZED (bound to A/A1): discloses A/A1 — unchanged by the correction', async () => {
        const r = await attempt(() => bound(pA1, A, A1, f.call));
        expect(r.ok, r.ok ? '' : r.msg).toBe(true);
        expect(r.ok && f.leaked(r.v)).toBe(true);
      });
      for (const [path, run] of [
        ['UNBOUND (eye_app, no context)', () => unbound(f.call)],
        ['WRONG TENANT (bound to B/B1)', () => bound(pB1, B, B1, f.call)],
        ['WRONG DOMAIN (bound to A/A2)', () => bound(pA2, A, A2, f.call)],
      ] as Array<[string, () => Promise<unknown>]>) {
        it(`${path}: ${BASELINE ? 'DISCLOSES A/A1 (the defect)' : 'discloses nothing'}`, async () => {
          const r = await attempt(run);
          if (BASELINE) { expect(r.ok, r.ok ? '' : r.msg).toBe(true); expect(r.ok && f.leaked(r.v)).toBe(true); return; }
          if (f.name === 'executive.publication_archive_record') {
            // the INVOKER read answers NULL for a publication outside the caller's scope (and never reaches the definer controls for it)
            expect(r.ok, r.ok ? '' : r.msg).toBe(true); expect(r.ok && r.v).toBeNull(); return;
          }
          expect(r.ok).toBe(false);
          expect(!r.ok && r.msg).toMatch(/^read rejected \(scope\): /);
        });
      }
      it(`PUBLIC (eye_identity: USAGE on graph and executive, no explicit grant): ${BASELINE && PUBLIC_READS.includes(f.name) ? 'EXECUTES (the defect)' : 'permission denied'}`, async () => {
        const r = await attempt(() => ident.transaction().execute(async (tx) => f.call(tx as unknown as AnyDb)));
        if (BASELINE && PUBLIC_READS.includes(f.name)) {
          expect(!r.ok && /permission denied for (function|schema)/.test(r.msg)).toBe(false);
          if (f.name === 'graph.strategy_plan_links') { expect(r.ok && f.leaked(r.v)).toBe(true); }
          return;
        }
        expect(r.ok).toBe(false);
        expect(!r.ok && r.msg).toMatch(/permission denied for (function|schema)/);
      });
    });
  }
});

describe('N-01 RLS controls — the same rows read directly (identical before and after)', () => {
  const direct = (db: AnyDb) => Promise.all([
    all(db, sql`select 1 from executive.publications where publication_id = ${S.pub}::uuid`),
    all(db, sql`select 1 from observation.legal_holds where hold_id = ${S.hold}::uuid`),
    all(db, sql`select 1 from decision.commitment_items where item_id = ${S.item}::uuid`),
    all(db, sql`select 1 from simulation.constraint_sets where set_id = ${S.set}::uuid`),
  ]).then((rs) => rs.map((r) => r.length));
  it('bound to A/A1: every row visible', async () => { expect(await bound(pA1, A, A1, direct)).toEqual([1, 1, 1, 1]); });
  it('the migration/operator session (its login role bypasses RLS and reads the tables directly) is not narrowed by the read check', async () => {
    const f = FNS[0]!;
    const r = await attempt(() => su.transaction().execute(async (tx) => f.call(tx as unknown as AnyDb)));
    expect(r.ok && f.leaked(r.v)).toBe(true);
    expect(await su.transaction().execute(async (tx) => direct(tx as unknown as AnyDb))).toEqual([1, 1, 1, 1]);
  });
  it('bound to B/B1, bound to A/A2, unbound: nothing visible', async () => {
    expect(await bound(pB1, B, B1, direct)).toEqual([0, 0, 0, 0]);
    expect(await bound(pA2, A, A2, direct)).toEqual([0, 0, 0, 0]);
    expect(await unbound(direct)).toEqual([0, 0, 0, 0]);
  });
});

describe(`N-01 minter controls — simulation.issue_constraint_gate_capability (${BASELINE ? 'BASELINE' : 'CORRECTED'})`, () => {
  const gate = <T>(t: string, d: string, fn: (db: AnyDb) => Promise<T>) => commit.transaction().execute(async (tx) => {
    await sql`select simulation.issue_constraint_gate_capability(${t}::uuid, ${d}::uuid, 'n01 proof', 30)`.execute(tx);
    return fn(tx as unknown as AnyDb);
  });
  const planCheck = (db: AnyDb, t: string, d: string, pins: unknown[] = []) => one(db, sql`select simulation.record_plan_check(${uuidv7()}::uuid, ${t}::uuid, ${d}::uuid, 'plan', 'n01',
    '{}'::jsonb, ${JSON.stringify(pins)}::jsonb, 'satisfied', '[]'::jsonb, null, 100, 1, null, ${uuidv7()}::uuid) as r`);

  it('the intended operations work: the gate reads the constraint set and its version, and records a check pinned to them, for its tenant and domain', async () => {
    const out = await gate(A, A1, async (db) => {
      const sets = await all(db, sql`select set_key from simulation.constraint_sets where set_id = ${S.set}::uuid`);
      const versions = await all(db, sql`select digest from simulation.constraint_set_versions where set_id = ${S.set}::uuid`);
      const recorded = await planCheck(db, A, A1, [{ set_id: S.set, set_key: 'n01-capacity', version: 1, digest: sha256('n01') }]) as Row;
      return { sets: sets.length, versions: versions.length, via: recorded['checked_via'] };
    });
    expect(out).toEqual({ sets: 1, versions: 1, via: 'gate' });
  });
  it(`unrelated reads under the gate: publications and legal holds ${BASELINE ? 'READABLE (the defect)' : 'not readable'}`, async () => {
    const out = await gate(A, A1, async (db) => [
      (await all(db, sql`select 1 from executive.publications where publication_id = ${S.pub}::uuid`)).length,
      (await all(db, sql`select 1 from observation.legal_holds where hold_id = ${S.hold}::uuid`)).length,
      (await all(db, sql`select 1 from decision.commitment_items where item_id = ${S.item}::uuid`)).length,
    ]);
    expect(out).toEqual(BASELINE ? [1, 1, 1] : [0, 0, 0]);
  });
  it('the gate for A/A1 records nothing for B/B1', async () => {
    const r = await attempt(() => gate(A, A1, (db) => planCheck(db, B, B1)));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.msg).toMatch(BASELINE ? /observation write rejected/ : /^plan check rejected \(scope\)/);
  });
  it(`the gate for B/B1 reads none of A/A1's constraint sets`, async () => {
    expect(await gate(B, B1, async (db) => (await all(db, sql`select 1 from simulation.constraint_sets where set_id = ${S.set}::uuid`)).length)).toBe(0);
  });
  it(`a domain of another tenant, and a suspended domain: ${BASELINE ? 'MINTED (the defect)' : 'refused'}`, async () => {
    for (const [t, d] of [[A, B1], [A, A3]] as Array<[string, string]>) {
      const r = await attempt(() => gate(t, d, async () => 'minted'));
      if (BASELINE) { expect(r.ok, r.ok ? '' : r.msg).toBe(true); continue; }
      expect(r.ok).toBe(false);
      expect(!r.ok && r.msg).toMatch(/constraint gate capability requires an active domain of the tenant/);
    }
  });
  it('the gate capability serves no other capability: a plan check outside schedule mode still needs the route authority', async () => {
    const r = await attempt(() => unbound((db) => planCheck(db, A, A1)));
    expect(r.ok).toBe(false);
  });
});

describe(`N-01 catalog — effective EXECUTE and default privileges (${BASELINE ? 'BASELINE' : 'CORRECTED'}; separate from the behaviour above)`, () => {
  const priv = async (role: string, fn: string): Promise<boolean> => {
    const r = await all(su, sql`select bool_or(has_function_privilege(${role}, p.oid, 'EXECUTE')) as r from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname || '.' || p.proname = ${fn}`);
    return r[0]?.['r'] === true;
  };
  it('the explicit runtime grants are preserved on every guarded read', async () => {
    for (const f of FNS) for (const role of ['eye_app', 'eye_commit']) expect(await priv(role, f.name), `${role} on ${f.name}`).toBe(true);
    expect(await priv('eye_commit', 'simulation.issue_constraint_gate_capability')).toBe(true);
    expect(await priv('eye_app', 'simulation.issue_constraint_gate_capability')).toBe(false);
  });
  it(`PUBLIC EXECUTE on the two reads and the ten trigger functions: ${BASELINE ? 'PRESENT (the defect)' : 'revoked'}`, async () => {
    for (const fn of [...PUBLIC_READS, ...TRIGGERS]) expect(await priv('public', fn), fn).toBe(BASELINE);
  });
  it(`no later-schema SECURITY DEFINER function is executable by PUBLIC (${BASELINE ? '11 before' : '0 after'})`, async () => {
    const r = await all(su, sql`select count(*)::int as r from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef and has_function_privilege('public', p.oid, 'EXECUTE')
        and n.nspname in ('decision', 'executive', 'graph', 'prediction', 'twin', 'simulation', 'observation')`);
    // observation's foundation-era definer functions are counted too: none is PUBLIC-executable before or after
    expect(r[0]?.['r']).toBe(BASELINE ? 11 : 0);
  });
  it(`the migration role's global default function privileges: ${BASELINE ? 'PUBLIC EXECUTE by default (no row)' : 'no EXECUTE to PUBLIC'}`, async () => {
    const r = await all(su, sql`select defaclacl::text as acl from pg_default_acl where defaclrole = current_user::regrole and defaclobjtype = 'f' and defaclnamespace = 0`);
    if (BASELINE) { expect(r).toEqual([]); return; }
    expect(r).toHaveLength(1);
    expect(String(r[0]?.['acl'])).not.toMatch(/(^|[{,])=X/);
  });
});
