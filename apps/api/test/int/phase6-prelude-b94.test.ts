/**
 * CP-6 B94 §0 (migration 0114 §0) — THE PRELUDE of product delivery: the five roles at their scopes, the attention / task / timer / signature
 * vocabularies, premium_support v2 (built, no gating prefix — v1 superseded), the APPROVER TEST (a named human holding the role, never the
 * proposer, never an implementation lead, never an agent), OWNER RESOLUTION read live (undeclared → unfilled → resolved → ambiguous → the
 * named owner), the ledgers (append-only) and RLS on every shared table. Every row here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const failure = async (q: ReturnType<typeof sql>): Promise<string> => q.execute(h.su).then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));

/** a TENANT-homed principal (a TENANT binding needs one; it may also hold DOMAIN bindings of the tenant) */
async function principal(kind: 'human' | 'agent', label: string): Promise<string> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, 'TENANT', ${T()}::uuid, null, ${`b94-${label}-${id.slice(-8)} (SYNTHETIC)`}, ${`b94-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  return id;
}
async function bind(principalId: string, role: string, scope: 'TENANT' | 'DOMAIN'): Promise<string> {
  const id = uuidv7();
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${id}::uuid, ${principalId}::uuid, ${role}, ${scope}, ${T()}::uuid, ${scope === 'DOMAIN' ? D() : null}::uuid)`.execute(h.su);
  return id;
}
const approver = (actor: string, roles: string[], proposer: string | null) =>
  failure(sql`select onboarding.assert_approver('migration mapping', ${actor}::uuid, ${T()}::uuid, ${D()}::uuid, ${roles}::text[], ${proposer}::uuid, 'approving a mapping')`);
const resolve = async (key: string) => (await one(sql`select service.owner_resolution(${T()}::uuid, ${D()}::uuid, ${key}) as r`))['r'] as Row;

beforeAll(async () => { h = await Phase4Harness.boot(); }, 300_000);
afterAll(async () => { await h?.close(); });

describe('§0.2–§0.4 · roles, vocabularies, the entitlement', () => {
  it('the five roles at their scopes', async () => {
    const r = (await sql<{ code: string; scope: string }>`select code, scope from identity.roles where code in ('customer_sponsor','onboarding_authority','implementation_lead','support_engineer','enablement_assessor') order by code`.execute(h.su)).rows;
    expect(r).toEqual([{ code: 'customer_sponsor', scope: 'TENANT' }, { code: 'enablement_assessor', scope: 'DOMAIN' }, { code: 'implementation_lead', scope: 'TENANT' },
      { code: 'onboarding_authority', scope: 'TENANT' }, { code: 'support_engineer', scope: 'DOMAIN' }]);
  });
  it('attention classes and subject kinds, task and timer kinds, signature subject kinds include B94\'s (and keep every earlier one)', async () => {
    const v = await one(sql`select executive.attention_signal_classes() as c, executive.human_task_kinds() as k, executive.task_subject_kinds() as s, executive.workflow_timer_kinds() as t,
      (select pg_get_constraintdef(oid) from pg_constraint where conname = 'signatures_subject_kind_check') as sig,
      (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attention_items_subject_kind_check') as subj`);
    expect(v['c']).toEqual(expect.arrayContaining(['analytics.metric', 'domain.package', 'onboarding.migration', 'onboarding.drift', 'implementation.readiness', 'service.case', 'support.access', 'responsibility.gap']));
    expect(v['k']).toEqual(expect.arrayContaining(['gate.approve', 'collab.review', 'onboarding.approve', 'support.access_review', 'service.closure_confirm', 'implementation.golive_review']));
    expect(v['s']).toEqual(expect.arrayContaining(['decision_package', 'service_case', 'support_grant', 'readiness_gate']));
    expect(v['t']).toEqual(expect.arrayContaining(['grant.expiry', 'support_access.expiry', 'sla.response', 'sla.resolution', 'baseline.drift_check']));
    for (const k of ['metric_certification', 'config_baseline', 'responsibility_matrix', 'mapping', 'cutover', 'readiness', 'acceptance', 'admission_record']) expect(String(v['sig'])).toContain(`'${k}'`);
    for (const k of ['operating_review', 'onboarding_programme', 'service_case', 'support_grant', 'responsibility_matrix']) expect(String(v['subj'])).toContain(`'${k}'`);
  });
  it('premium_support v2: built, NO gating prefix (a routing entitlement — case opening and support access never licence-gated); v1 superseded', async () => {
    const rows = (await sql<Row>`select version, built, action_prefixes, status from commercial.capabilities where capability_key = 'premium_support' order by version`.execute(h.su)).rows;
    expect(rows.at(-1)).toMatchObject({ built: true, action_prefixes: [], status: 'active' });
    expect(rows.slice(0, -1).every((r) => r['status'] === 'superseded')).toBe(true);
  });
});

describe('§0.5 · the approver test (re-checked in every approving port)', () => {
  let authority = ''; let proposer = ''; let lead = ''; let agent = ''; let plain = '';
  beforeAll(async () => {
    authority = await principal('human', 'authority'); await bind(authority, 'onboarding_authority', 'TENANT');
    proposer = await principal('human', 'proposer'); await bind(proposer, 'onboarding_authority', 'TENANT');
    lead = await principal('human', 'lead'); await bind(lead, 'onboarding_authority', 'TENANT'); await bind(lead, 'implementation_lead', 'TENANT');
    agent = await principal('agent', 'agent'); await bind(agent, 'onboarding_authority', 'TENANT');
    plain = await principal('human', 'plain');
  });
  it('positive: a named human holding the role, not the proposer', async () => {
    expect(await approver(authority, ['onboarding_authority'], proposer)).toBe('no error');
  });
  it('refusals: an agent (actor) · without the role (authority) · the proposer (separation_of_duties) · an implementation lead even holding the role (separation_of_duties)', async () => {
    expect(await approver(agent, ['onboarding_authority'], proposer)).toMatch(/^migration mapping rejected \(actor\)/);
    expect(await approver(plain, ['onboarding_authority'], proposer)).toMatch(/^migration mapping rejected \(authority\): approving a mapping is the act of a onboarding_authority/);
    expect(await approver(proposer, ['onboarding_authority'], proposer)).toMatch(/^migration mapping rejected \(separation_of_duties\): approving a mapping is never approved by its proposer/);
    expect(await approver(lead, ['onboarding_authority'], proposer)).toMatch(/^migration mapping rejected \(separation_of_duties\): an implementation lead never approves/);
  });
  it('recovery: the role revoked → refused; a fresh binding → admitted', async () => {
    const b = await bind(plain, 'onboarding_authority', 'TENANT');
    expect(await approver(plain, ['onboarding_authority'], proposer)).toBe('no error');
    await sql`update identity.role_bindings set revoked_at = clock_timestamp() where id = ${b}::uuid`.execute(h.su);
    expect(await approver(plain, ['onboarding_authority'], proposer)).toMatch(/\(authority\)/);
  });
});

describe('§0.7 · owner resolution, read live (IA-04-005: never infer an owner)', () => {
  const KEY = `risk.ownership.${RUN}`;
  const matrix = uuidv7();
  it('undeclared: no approved matrix', async () => {
    expect(await resolve(KEY)).toMatchObject({ state: 'undeclared', reason: expect.stringMatching(/no approved responsibility matrix/) });
  });
  it('unfilled → resolved → ambiguous → the named owner', async () => {
    const lead = await principal('human', 'mx-lead'); const auth = await principal('human', 'mx-auth');
    await sql`insert into service.responsibility_matrices (matrix_id, version, tenant_id, domain_id, state, digest, proposed_by, decided_by, decided_at, signature_id, correlation_id)
              values (${matrix}::uuid, 1, ${T()}::uuid, ${D()}::uuid, 'approved', ${'b'.repeat(64)}, ${lead}::uuid, ${auth}::uuid, clock_timestamp(), ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into service.responsibility_rows (matrix_id, version, responsibility_key, tenant_id, domain_id, title, owner_role, operator_role, customer_authority, access_path, evidence_producer, escalation_path)
              values (${matrix}::uuid, 1, ${KEY}, ${T()}::uuid, ${D()}::uuid, 'Risk ownership of the domain (SYNTHETIC)', 'risk_owner', 'domain_admin', 'onboarding_authority',
                      'the domain workspace', 'the exposure ledger', 'the domain admin, then the customer sponsor')`.execute(h.su);
    const holders = (await one(sql`select count(distinct principal_id)::int as n from identity.role_bindings where role_code = 'risk_owner' and revoked_at is null and tenant_id = ${T()}::uuid
                                   and (scope = 'TENANT' or domain_id = ${D()}::uuid)`))['n'] as number;
    if (holders === 0) {
      expect(await resolve(KEY)).toMatchObject({ state: 'unfilled', owner_role: 'risk_owner', reason: expect.stringMatching(/nobody holds risk_owner/) });
      const first = await principal('human', 'risk-1'); await bind(first, 'risk_owner', 'DOMAIN');
      expect(await resolve(KEY)).toMatchObject({ state: 'resolved', principals: [first] });
    }
    const second = await principal('human', 'risk-2'); await bind(second, 'risk_owner', 'DOMAIN');
    expect(await resolve(KEY)).toMatchObject({ state: 'ambiguous', reason: expect.stringMatching(/the matrix names none/) });
    expect(await resolve('undeclared.key')).toMatchObject({ state: 'undeclared', reason: expect.stringMatching(/declares no responsibility undeclared.key/) });
  });
});

describe('§0.6–§0.7 · the ledgers and RLS', () => {
  it('a ledger event is append-only; every shared table forces RLS', async () => {
    const id = (await one(sql`select onboarding.ledger('service', ${T()}::uuid, ${D()}::uuid, 'service_case', ${uuidv7()}::uuid, 1, 'case.opened', ${uuidv7()}::uuid, '{}'::jsonb, ${uuidv7()}::uuid) as id`))['id'];
    expect(await failure(sql`update service.events set details = '{"x":1}'::jsonb where event_id = ${String(id)}::uuid`)).toMatch(/append-only|append only/i);
    const forced = (await sql<{ t: string; f: boolean }>`select n.nspname || '.' || c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('onboarding', 'implementation', 'service') and c.relkind = 'r' order by 1`.execute(h.su)).rows;
    expect(forced.map((r) => r.t)).toEqual(expect.arrayContaining(['implementation.events', 'onboarding.events', 'onboarding.programmes', 'service.events', 'service.responsibility_matrices', 'service.responsibility_rows']));
    expect(forced.every((r) => r.f)).toBe(true);
  });
});

describe('§0.7 · the support grant core: live_grant on the database clock, the access log', () => {
  it('a grant lives only while approved and unexpired, for its case, actions and objects; every act is logged', async () => {
    const engineer = await principal('human', 'engineer'); const admin = await principal('human', 'dadmin');
    const caseId = uuidv7(); const source = uuidv7(); const other = uuidv7(); const grant = uuidv7();
    await sql`insert into service.cases (case_id, tenant_id, domain_id, case_ref, title, severity, affected_capability, description, routing, opened_by, correlation_id)
              values (${caseId}::uuid, ${T()}::uuid, ${D()}::uuid, ${`CASE-${String(Date.now()).slice(-6)}`}, 'A stalled feed (SYNTHETIC)', 'S2', 'observation', 'the corridor feed has not delivered since the morning',
                      '{"tier":"standard"}'::jsonb, ${admin}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into service.support_grants (grant_id, tenant_id, domain_id, case_id, engineer_principal_id, purpose, object_scope, action_scope, duration_minutes, state, decided_by, decided_at, starts_at, expires_at, correlation_id)
              values (${grant}::uuid, ${T()}::uuid, ${D()}::uuid, ${caseId}::uuid, ${engineer}::uuid, 'diagnose the stalled feed for the case', ${JSON.stringify({ sources: [source] })}::jsonb,
                      array['diagnose.source','case.note'], 240, 'approved', ${admin}::uuid, clock_timestamp(), clock_timestamp() - interval '1 minute', clock_timestamp() + interval '4 hours', ${uuidv7()}::uuid)`.execute(h.su);
    const live = async (action: string, obj: string | null, c: string | null = caseId) =>
      (await one(sql`select service.live_grant(${T()}::uuid, ${D()}::uuid, ${engineer}::uuid, ${c}::uuid, ${action}, ${obj}::uuid) as g`))['g'];
    expect(await live('diagnose.source', source)).toBe(grant);
    expect(await live('diagnose.source', other)).toBeNull();           // outside the object scope
    expect(await live('diagnose.runs', source)).toBeNull();            // outside the action scope
    expect(await live('case.note', null, uuidv7())).toBeNull();        // another case
    await sql`update service.support_grants set expires_at = clock_timestamp() - interval '1 second', starts_at = clock_timestamp() - interval '2 minutes' where grant_id = ${grant}::uuid`.execute(h.su);
    expect(await live('diagnose.source', source)).toBeNull();          // expired on the database clock, before any sweep
    expect(await failure(sql`update service.support_grants set decided_by = ${engineer}::uuid where grant_id = ${grant}::uuid`)).toMatch(/ssg_sod/);
    const log = (await one(sql`select service.log_access(${T()}::uuid, ${D()}::uuid, ${grant}::uuid, ${engineer}::uuid, 'diagnose.source', 'source', ${source}, 'refused', '{"why":"expired"}'::jsonb, ${uuidv7()}::uuid) as id`))['id'];
    expect(await failure(sql`delete from service.access_log where log_id = ${String(log)}::uuid`)).toMatch(/append-only|append only/i);
  });
});
