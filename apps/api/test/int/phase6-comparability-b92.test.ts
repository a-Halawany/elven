/**
 * CP-6 B92 §CO (migration 0113 §CO) — COMPARABILITY, UNCERTAINTY IN USE, THE STANDING EVALUATION, COST RECONCILIATION AND THE ACCEPTANCE
 * FIXTURES (PR-70-005, PR-70-006, AT-70; the B90 residuals DP-44-001 and DP-44-006), through the real database, the prelude's compute port
 * (which now calls §CO's two hooks) and this part's controllers.
 *
 *   CO1 · THE STANDING EVALUATION, check by check (positive · refusal-as-indeterminate · recovery): stale, incomplete, biased (a declared
 *         cohort check; an unevaluable declared check; the synthetic share), non-comparable (a version change inside the window; mixed
 *         clocks), gamed (exclusions grew while the value jumped; a threshold moved the value across it — and its recovery by a re-approved
 *         version), privacy (a retired purpose; a role cohort with no k; a pseudonymous cohort under the wrong purpose), outcome-detached (a
 *         withdrawn or absent objective); the hook called directly with records in the draft (the widened draft the integrator may pass); a
 *         determinate BREACH raised as a REVIEW (never an automatic decision, raised once); the meter; replay reproduces the evaluation.
 *   CO2 · THE COHORT COMPARISON: two cohorts of a rate (Newcombe, cross-checked against the pure function), two periods of a duration (medians
 *         and their intervals: a direction when they do not overlap, no claim when unbounded), versions differing only in non-semantic fields
 *         comparable, a semantic change indeterminate, a side below the floor indeterminate; refusals (preview, replay, two metrics, the same
 *         result, unknown / cross-domain, an outsider, a person cohort) and the agent allowed (AI may compute).
 *   CO3 · DP-44-001 THE GOVERNED SEMANTIC OBJECTS: a cohort, a relationship and an analytical model declared, CERTIFIED by the owner at the
 *         digest; refusals (SoD, the declarer's role, the PEP's human gate and the port's, stale digest, expiry, person, unknown references,
 *         duplicate / unchanged); a comparison naming a certified cohort (digest recorded) through the route; a re-declaration withdraws the
 *         certification and EXPOSES the comparisons that used it; the steward's withdrawal; an expired certification refused.
 *   CO4 · THE COST RECONCILIATION (PR-70-006): every computation metered; B91 meters none → UNPRICED, said; a planted B91 meter (SYNTHETIC,
 *         stated) MATCHED and priced, DISCREPANT, an ORPHAN; `empty` for a period with nothing — never a silent pass; refusals.
 *   CO5 · DP-44-006 THE EXPOSURE-EUR FIXTURE: accepted EUR assessments (through B32's real ports) → products.measure_exposure_eur_at_risk and
 *         B90's serve; a USD and an unaccepted assessment excluded; a later version counted only once accepted; the as-of before acceptance.
 *   CO6 · THE FAULT EXERCISE (AT-70 "continuity response"): a metric whose source goes quiet mid-life → its next result INDETERMINATE (the use
 *         stopped: an indeterminate result is never served as current), the item ROUTED; the source fresh again → DETERMINATE, the item CLOSED.
 *
 * Everything written here is SYNTHETIC (titles say so). Stated superuser moves: the definitions are PLANTED (the prelude harness idiom — §MD's
 * ports are another part's); the fixture items table and its two computations (registered through analytics.register_computation); a
 * withdrawn strategy object planted with its events; a retired purpose planted; the B91 usage records, a rate card and a cost entry planted
 * as B91 WOULD record them (B91 meters no analytics dimension); one certification's expiry moved into the past under a disabled forward trigger.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { ComparabilityController } from '../../src/analytics/comparability/comparability.controller.js';
import { newcombe, wilson } from '../../src/analytics/comparability/stats.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';

// this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b92co-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: AnalyticsComputeController; let co: ComparabilityController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const ITEMS = `b92co_items_${RUN}`;
let analyst: AuthenticatedPrincipal; let analyst2: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let owner2: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal;
let outsider: AuthenticatedPrincipal; let foreign: AuthenticatedPrincipal; let agent: AuthenticatedPrincipal; let agentAsHuman: AuthenticatedPrincipal; let stewardAgent: AuthenticatedPrincipal;
let otherDomain = '';
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const obj = (v: unknown): Row => (v ?? {}) as Row;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
/** The DATABASE's instant moved by an interval, as ISO 8601 (what a caller sends). */
const dbAt = async (move: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() + ${move}::interval t`.execute(h.su)).rows[0]!.t.toISOString();
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

/* ───────────── the routes (in process) ───────────── */
const rq = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null, domainId?: string) => {
  const r = h.req(as, action, type, id, 'intelligence') as { eyeEnvelope: Row };
  if (domainId !== undefined) r.eyeEnvelope['domain_id'] = domainId;
  return r as never;
};
const compute = (as: AuthenticatedPrincipal, payload: Row) => c.compute(rq(as, 'analytics.metric.compute', 'AMR'), T(), D(), { payload }) as Promise<{ result: Row }>;
const replay = (as: AuthenticatedPrincipal, id: string) => c.replay(rq(as, 'analytics.metric.replay', 'AMR', id), T(), D(), id) as Promise<{ replay: Row }>;
const compare = (as: AuthenticatedPrincipal, payload: Row, domainId = D()) => co.runComparison(rq(as, 'analytics.comparison.run', 'ACM', null, domainId), T(), domainId, { payload }) as Promise<{ comparison: Row; computed: Row }>;
const comparisonRead = (as: AuthenticatedPrincipal, id: string, domainId = D()) => co.comparison(rq(as, 'analytics.read', 'ACM', id, domainId), T(), domainId, id) as Promise<{ comparison: Row }>;
const reconcile = (as: AuthenticatedPrincipal, payload: Row, domainId = D()) => co.reconcile(rq(as, 'analytics.reconciliation.run', 'ARC', null, domainId), T(), domainId, { payload }) as Promise<{ reconciliation: Row }>;
const costs = (as: AuthenticatedPrincipal, payload: Row, domainId = D()) => co.costs(rq(as, 'analytics.read', 'ARC', null, domainId), T(), domainId, { payload }) as Promise<{ costs: Row[] }>;
const declare = (as: AuthenticatedPrincipal, payload: Row) => co.declare(rq(as, 'products.semantic.declare', 'SOB'), T(), D(), { payload }) as Promise<{ object: Row }>;
const certify = (as: AuthenticatedPrincipal, id: string, payload: Row) => co.certify(rq(as, 'products.semantic.certify', 'SOB', id), T(), D(), id, { payload }) as Promise<{ object: Row }>;
const withdraw = (as: AuthenticatedPrincipal, id: string, reason: string) => co.withdraw(rq(as, 'products.semantic.withdraw', 'SOB', id), T(), D(), id, { payload: { reason } }) as Promise<{ object: Row }>;
const objRead = (as: AuthenticatedPrincipal, id: string) => co.object(rq(as, 'products.semantic.read', 'SOB', id), T(), D(), id) as Promise<{ object: Row }>;

/** A machine principal (the B33 idiom): an agent in the database whose session claims a kind and an assurance. */
async function machine(roles: string[], label: string, claimKind: 'human' | 'agent', assurance: 'password' | 'agent_grant'): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`b92co-${label}-${id.slice(-8)}`}, ${`b92co-${label.slice(0, 5)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: claimKind, assurance, homeScope: 'DOMAIN', homeDomainId: D(), bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN', tenantId: T(), domainId: D() })) } as AuthenticatedPrincipal);
}

/* ───────────── THE FIXTURE (SYNTHETIC): items in buckets, two computations of the §0.7 contract ───────────── */
type Item = { at: string; ok?: boolean; seconds?: number; severity?: string; role?: string; excluded?: boolean; synthetic?: boolean };
async function items(bucket: string, list: Item[], domainId = D()): Promise<void> {
  for (const it of list) {
    await sql`insert into ${sql.raw(`public.${ITEMS}`)} (id, tenant_id, domain_id, bucket, recorded_at, ok, seconds, severity, role, excluded, synthetic, actor)
      values (${uuidv7()}::uuid, ${T()}::uuid, ${domainId}::uuid, ${bucket}, ${it.at}::timestamptz, ${it.ok ?? true}, ${it.seconds ?? 60}, ${it.severity ?? 'high'}, ${it.role ?? 'analyst'},
              ${it.excluded ?? false}, ${it.synthetic ?? false}, ${uuidv7()}::uuid)`.execute(h.su);
  }
}
const day = (month: number, d: number, year = 2026) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T10:00:00Z`;
/** n items spread over a quarter's three months (days 2..27). */
const spread = (q: 2 | 3, n: number, f: (i: number) => Partial<Item>): Item[] =>
  Array.from({ length: n }, (_, i) => ({ at: day((q - 1) * 3 + 1 + (i % 3), 2 + Math.floor((i * 25) / Math.max(n, 1))), ...f(i) }));

const FIXTURE_FILTER = `i.tenant_id = p_tenant and i.domain_id = p_domain and i.bucket = p_params ->> 'bucket' and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of
  and (p_cohort ->> 'severity' is null or i.severity = p_cohort ->> 'severity') and (p_cohort ->> 'role' is null or i.role = p_cohort ->> 'role')`;
const QUALITY = `jsonb_build_object('clock', coalesce(p_params ->> 'report_clock', p_params ->> 'clock'),
  'newest_record_at', (select max(i.recorded_at) from ${'public.' + ITEMS} i where ${FIXTURE_FILTER} and not i.excluded),
  'excluded_count', (select count(*) from ${'public.' + ITEMS} i where ${FIXTURE_FILTER} and i.excluded),
  'synthetic_share', (select round(count(*) filter (where i.synthetic)::numeric / nullif(count(*), 0), 6) from ${'public.' + ITEMS} i where ${FIXTURE_FILTER} and not i.excluded),
  'distinct_actors', case when p_params ? 'no_actors' or not (p_cohort ? 'role') then null else (select count(distinct i.actor) from ${'public.' + ITEMS} i where ${FIXTURE_FILTER} and not i.excluded) end)
  || case when p_params ? 'no_composition' then '{}'::jsonb else jsonb_build_object('composition', jsonb_build_object('severity',
       (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) from (select i.severity s, count(*) n from ${'public.' + ITEMS} i where ${FIXTURE_FILTER} and not i.excluded group by 1) z))) end`;
const RATE_FN = `analytics.mc_co_rate_${RUN}`; const DUR_FN = `analytics.mc_co_duration_${RUN}`;

/** A definition PLANTED by the superuser (the prelude harness idiom): every contract field the evaluation reads is settable. */
async function plant(key: string, o: Partial<Record<string, unknown>> = {}, domainId = D()): Promise<string> {
  const id = uuidv7();
  const def = {
    kind: 'rate', unit: 'share', direction: 'higher', floor_n: 3, k_min: 5, dimensions: ['severity', 'role'], computation_key: `co_rate_${RUN}`, threshold: {}, state: 'approved', version: 1,
    window_spec: { kind: 'calendar_quarter', clock: 'record' }, quality: {}, params: { bucket: key }, purpose_key: 'product-quality', privacy_class: 'aggregate',
    serves: { objective_ids: [w.objectiveId] }, effective_from: '2026-01-01T00:00:00Z', title: `fixture ${key} (SYNTHETIC)`, ...o,
  } as Record<string, unknown>;
  const decided = def['state'] !== 'proposed';
  await sql`insert into analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator,
      window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, quality, computation_key, params, supported,
      state, digest, proposed_by, proposed_by_kind, decided_by, decided_at, effective_from, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, ${key}, ${def['version'] as number}, ${def['title'] as string}, 'the share of fixture items that are ok (SYNTHETIC)', ${def['kind'] as string},
      ${def['unit'] as string}, ${def['direction'] as string}, '{"subject":"fixture item (SYNTHETIC)"}'::jsonb, 'items that are ok', 'every item in the window',
      ${JSON.stringify(def['window_spec'])}::jsonb, ${def['dimensions'] as string[]}::text[], ${def['privacy_class'] as string}, ${def['k_min'] as number}, ${def['floor_n'] as number},
      ${JSON.stringify(def['threshold'])}::jsonb, ${def['purpose_key'] as string}, ${JSON.stringify(def['serves'])}::jsonb, 'quarterly', ${owner.principalId}::uuid,
      'a review by the product analytics owner, never an automatic decision', 'retired when the fixture is gone', ${JSON.stringify(def['quality'])}::jsonb, ${def['computation_key'] as string},
      ${JSON.stringify(def['params'])}::jsonb, true, ${def['state'] as string}, ${'b'.repeat(64)}, ${analyst.principalId}::uuid, 'human',
      ${decided ? owner.principalId : null}::uuid, ${decided ? '2026-01-01T00:00:00Z' : null}::timestamptz, ${decided ? def['effective_from'] as string : null}::timestamptz, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}
const reasons = (r: Row) => (Array.isArray(r['reasons']) ? (r['reasons'] as unknown[]).map(String).join('\n') : JSON.stringify(r['reasons']));
const check = (r: Row, name: string): Row => (arr(obj(r['evaluation'])['checks']).find((x) => x['check'] === name) ?? {}) as Row;
const itemsOf = async (resultId: string) => rows(sql`select item_id::text, signal_class, subject_kind, state, owner_principal_id::text owner, details from executive.attention_items where subject_id = ${resultId}::uuid order by created_at`);
const Q2 = '2026-Q2'; const Q3 = '2026-Q3';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  c = h.app.get(AnalyticsComputeController); co = h.app.get(ComparabilityController);
  w = await bootDecisionWorld(h);
  analyst = await h.humanWithSession(['product_analyst'], 'b92co-analyst');
  analyst2 = await h.humanWithSession(['product_analyst'], 'b92co-analyst-2');
  owner = await h.humanWithSession(['product_analytics_owner'], 'b92co-owner');
  owner2 = await h.humanWithSession(['product_analytics_owner', 'product_analyst'], 'b92co-owner-2');
  steward = await h.humanWithSession(['data_steward'], 'b92co-steward');
  outsider = await h.humanWithSession(['simulation_operator'], 'b92co-outsider');
  agent = await machine(['attention_agent'], 'attention', 'agent', 'agent_grant');
  agentAsHuman = await machine(['product_analyst'], 'agent-as-human', 'human', 'password');
  stewardAgent = await machine(['data_steward'], 'steward-agent', 'agent', 'agent_grant');
  otherDomain = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${otherDomain}::uuid, ${T()}::uuid, ${'b92co-other-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  foreign = await h.humanWithSession(['product_analyst', 'product_analytics_owner'], 'b92co-foreign', 'DOMAIN', { domainId: otherDomain });
  await sql.raw(`create table public.${ITEMS} (id uuid primary key, tenant_id uuid, domain_id uuid, bucket text, recorded_at timestamptz, ok boolean, seconds numeric, severity text, role text,
                                                excluded boolean, synthetic boolean, actor uuid)`).execute(h.su);
  await sql.raw(`create or replace function ${RATE_FN}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
    returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
    begin
      perform observation.assert_read_scope(p_tenant, p_domain, 'the B92 §CO fixture items');
      return jsonb_build_object('kind', 'rate',
        'distinct_actors', case when p_params ? 'no_actors' or not (p_cohort ? 'role') then null else (select count(distinct i.actor) from public.${ITEMS} i where ${FIXTURE_FILTER} and not i.excluded) end,
        'records', coalesce((select jsonb_agg(jsonb_build_object('kind', 'fixture_item', 'id', i.id, 'role', case when i.excluded then 'excluded' when i.ok then 'numerator' else 'denominator' end,
                                                                 'reason', case when i.excluded then 'a fixture exclusion (SYNTHETIC)' end,
                                                                 'detail', jsonb_build_object('severity', i.severity, 'role', i.role, 'at', i.recorded_at, 'synthetic', i.synthetic)) order by i.recorded_at, i.id)
                             from public.${ITEMS} i where ${FIXTURE_FILTER}), '[]'::jsonb),
        'reasons', '[]'::jsonb, 'quality', ${QUALITY});
    end $f$`).execute(h.su);
  await sql.raw(`create or replace function ${DUR_FN}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
    returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
    begin
      perform observation.assert_read_scope(p_tenant, p_domain, 'the B92 §CO fixture items');
      return jsonb_build_object('kind', 'duration',
        'records', coalesce((select jsonb_agg(jsonb_build_object('kind', 'fixture_item', 'id', i.id, 'role', case when i.excluded then 'excluded' else 'included' end,
                                                                 'reason', case when i.excluded then 'a fixture exclusion (SYNTHETIC)' end,
                                                                 'detail', jsonb_build_object('value', i.seconds, 'severity', i.severity, 'at', i.recorded_at)) order by i.recorded_at, i.id)
                             from public.${ITEMS} i where ${FIXTURE_FILTER}), '[]'::jsonb),
        'reasons', '[]'::jsonb, 'quality', ${QUALITY});
    end $f$`).execute(h.su);
  await sql`select analytics.register_computation(${`co_rate_${RUN}`}, ${RATE_FN}, 'rate', array['severity', 'role'], array[${`public.${ITEMS}`}], 'the fixture has no scope; a scope is ignored (stated)', 'the B92 §CO harness fixture rate (SYNTHETIC)', 'phase6-comparability-b92')`.execute(h.su);
  await sql`select analytics.register_computation(${`co_duration_${RUN}`}, ${DUR_FN}, 'duration', array['severity'], array[${`public.${ITEMS}`}], 'the fixture has no scope; a scope is ignored (stated)', 'the B92 §CO harness fixture duration (SYNTHETIC)', 'phase6-comparability-b92')`.execute(h.su);
}, 900_000);

afterAll(async () => {
  await sql.raw(`drop table if exists public.${ITEMS} cascade`).execute(h.su).catch(() => undefined);
  await h?.close();
}, 120_000);

/* ═════════════════════════════════════════ CO1 ═════════════════════════════════════════ */
describe('CO1 · the standing evaluation (PR-70-005): each failing check an explained INDETERMINATE and a routed review', () => {
  it('positive: a clean population passes every check (listed, not hidden): stale, incomplete, biased, synthetic share, non-comparable, gamed, privacy, outcome-detached', async () => {
    const key = `CO-clean${RUN}`; await plant(key, { quality: { max_staleness_days: 30, bias: { dimension: 'severity', min_share: 0.2, values: ['high', 'low'] } } });
    await items(key, spread(3, 10, (i) => ({ ok: i < 7, severity: i % 2 === 0 ? 'high' : 'low' })));
    const r = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(r, reasons(r)).toMatchObject({ state: 'determinate', n: 10 });
    expect(Number(r['value'])).toBeCloseTo(0.7, 6);
    const names = arr(obj(r['evaluation'])['checks']).map((x) => `${String(x['check'])}:${String(x['status'])}`);
    expect(names).toEqual(['stale:pass', 'incomplete:pass', 'biased:pass', 'synthetic_share:pass', 'replay_share:not_evaluable', 'non_comparable:pass', 'gamed:pass', 'privacy:pass', 'outcome_detached:pass']);
    expect(obj(r['evaluation'])['by']).toMatch(/B92 co standing evaluation/);
    expect(arr(obj(r['after'])['routed'])).toEqual([]);
  });

  it('STALE: the population\'s newest record 26 days before the window\'s end, beyond the 10 the definition allows → indeterminate, routed (analytics.metric, the owner named); the replay reproduces it', async () => {
    const key = `CO-stale${RUN}`; await plant(key, { quality: { max_staleness_days: 10 }, window_spec: { kind: 'calendar_month', clock: 'record' } });
    await items(key, [1, 2, 3, 4, 5].map((d) => ({ at: day(8, d) })));
    const r = (await compute(analyst, { metricKey: key, period: '2026-08' })).result;
    expect(r).toMatchObject({ state: 'indeterminate', value: null, n: 5 });
    expect(reasons(r)).toMatch(/stale: the population's newest record .* is 26\.6 days before .*beyond the 10 days the definition allows/);
    expect(check(r, 'stale')['status']).toBe('fail');
    const it1 = await itemsOf(String(r['result_id']));
    expect(it1).toHaveLength(1);
    expect(it1[0]).toMatchObject({ signal_class: 'analytics.metric', subject_kind: 'metric_result', owner: owner.principalId });
    expect(obj(it1[0]!['details'])).toMatchObject({ origin: 'standing_evaluation', metric_key: key, period: '2026-08' });
    const rp = (await replay(owner, String(r['result_id']))).replay;
    expect(rp).toMatchObject({ replay_verdict: 'reproduced', state: 'indeterminate' });
    expect(arr(obj(rp['after'])['routed'])).toEqual([]);   // a replay only meters
  });

  it('INCOMPLETE: 6 of 10 records excluded (60 %) above the 50 % default → indeterminate; under a declared 80 % allowance the same population passes', async () => {
    const key = `CO-incomplete${RUN}`; await plant(key);
    await items(key, spread(3, 10, (i) => ({ excluded: i < 6 })));
    const r = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(r).toMatchObject({ state: 'indeterminate', value: null, n: 4 });
    expect(reasons(r)).toMatch(/incomplete: 6 of 10 records are excluded \(60\.0%\), above the 50\.0% the definition allows/);
    const ok = `CO-incompleteok${RUN}`; await plant(ok, { quality: { max_exclusion_share: 0.8 }, params: { bucket: key } });
    const r2 = (await compute(analyst, { metricKey: ok, period: Q3 })).result;
    expect(r2, reasons(r2)).toMatchObject({ state: 'determinate', n: 4 });
    expect(check(r2, 'incomplete')).toMatchObject({ status: 'pass', detail: { excluded: 6, n: 4, max: 0.8 } });
  });

  it('BIASED: a declared cohort check fails (low severity 10 % < 20 %); a declared check the computation cannot evaluate fails too; a 80 % synthetic population fails the synthetic share', async () => {
    const key = `CO-bias${RUN}`; const bias = { bias: { dimension: 'severity', min_share: 0.2, values: ['high', 'low'] } };
    await plant(key, { quality: bias });
    await items(key, spread(3, 10, (i) => ({ severity: i === 0 ? 'low' : 'high' })));
    const r = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(r).toMatchObject({ state: 'indeterminate', value: null });
    expect(reasons(r)).toMatch(/biased: on severity the cohort\(s\) low 10\.0% are under-represented \(share below 20\.0% of the 10 records/);
    expect(check(r, 'biased')).toMatchObject({ status: 'fail', detail: { composition: { high: 9, low: 1 } } });
    const blind = `CO-biasblind${RUN}`; await plant(blind, { quality: bias, params: { bucket: key, no_composition: true } });
    const r2 = (await compute(analyst, { metricKey: blind, period: Q3 })).result;
    expect(reasons(r2)).toMatch(/biased: the definition declares a bias check on severity, which cannot be evaluated — the computation reports no composition by severity/);
    const syn = `CO-synthetic${RUN}`; await plant(syn);
    await items(syn, spread(3, 10, (i) => ({ synthetic: i < 8 })));
    const r3 = (await compute(analyst, { metricKey: syn, period: Q3 })).result;
    expect(r3).toMatchObject({ state: 'indeterminate' });
    expect(reasons(r3)).toMatch(/biased: 80\.0% of the population is synthetic .*above the 50\.0% the definition admits/);
    const synOk = `CO-syntheticok${RUN}`; await plant(synOk, { quality: { max_synthetic_share: 0.9 }, params: { bucket: syn } });
    const r4 = (await compute(analyst, { metricKey: synOk, period: Q3 })).result;
    expect(r4, reasons(r4)).toMatchObject({ state: 'determinate' });
    expect(check(r4, 'synthetic_share')).toMatchObject({ status: 'pass', detail: { share: 0.8, max: 0.9 } });
  });

  it('NON-COMPARABLE: version 2 took effect on 15 August, inside 2026-Q3 → the quarter mixes two definitions; a computation reporting another clock than the definition\'s mixes clocks', async () => {
    const key = `CO-changed${RUN}`;
    await plant(key, { state: 'superseded', version: 1 });
    await plant(key, { version: 2, effective_from: '2026-08-15T00:00:00Z' });
    await items(key, spread(3, 10, () => ({})));
    const r = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(r).toMatchObject({ state: 'indeterminate', definition_version: 2 });
    expect(reasons(r)).toMatch(/non-comparable: the definition changed inside the window — version 2 took effect at 2026-08-15/);
    const r2 = (await compute(analyst, { metricKey: key, period: '2026-09' })).result;   // the month after the change: one definition
    expect(r2, reasons(r2)).toMatchObject({ state: 'determinate' });
    const clock = `CO-clock${RUN}`; await plant(clock, { params: { bucket: key, report_clock: 'world' } });
    const r3 = (await compute(analyst, { metricKey: clock, period: Q3 })).result;
    expect(reasons(r3)).toMatch(/non-comparable: the population mixes clocks \(the definition reads the record clock; the computation reports world\)/);
  });

  it('GAMED (a): the exclusions grew from 0 % to 60 % while the rate jumped 0.5 → 1.0 against the previous quarter → indeterminate, routed', async () => {
    const key = `CO-gamed${RUN}`; await plant(key, { quality: { max_exclusion_share: 0.8 } });
    await items(key, spread(2, 10, (i) => ({ ok: i < 5 })));
    await items(key, spread(3, 10, (i) => ({ ok: i < 4, excluded: i >= 4 })));
    const q2 = (await compute(analyst, { metricKey: key, period: Q2 })).result;
    expect(q2, reasons(q2)).toMatchObject({ state: 'determinate' });
    expect(Number(q2['value'])).toBeCloseTo(0.5, 6);
    const q3 = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(q3).toMatchObject({ state: 'indeterminate', value: null });
    expect(reasons(q3)).toMatch(/gamed: the excluded share grew from 0\.0% \(2026-Q2\) to 60\.0% while the value improved by 0\.50* .*an improvement bought by exclusion is not shown/);
    expect(check(q3, 'gamed')).toMatchObject({ status: 'fail', detail: { test: 'exclusion_jump', previous_result: q2['result_id'] } });
    expect((await itemsOf(String(q3['result_id']))).map((x) => x['signal_class'])).toEqual(['analytics.metric']);
  });

  it('GAMED (b) and its RECOVERY: version 2 lowered the target 0.9 → 0.5 and that alone moves 0.7 from breach to pass → indeterminate; version 3 re-approved WITHOUT a threshold change → determinate', async () => {
    const key = `CO-threshold${RUN}`;
    await plant(key, { state: 'superseded', version: 1, threshold: { target: 0.9 } });
    const v2 = await plant(key, { version: 2, threshold: { target: 0.5 }, effective_from: '2026-02-01T00:00:00Z' });
    await items(key, spread(3, 10, (i) => ({ ok: i < 7 })));
    const r = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(r).toMatchObject({ state: 'indeterminate' });
    expect(reasons(r)).toMatch(/gamed: the threshold changed with version 2 \(\{"target": 0\.9\} → \{"target": 0\.5\}\) and that change alone moves this value \(0\.70*\) from breach to pass/);
    await sql`update analytics.metric_definitions set state = 'superseded', superseded_at = clock_timestamp() where definition_id = ${v2}::uuid`.execute(h.su);
    await plant(key, { version: 3, threshold: { target: 0.5 }, effective_from: '2026-03-01T00:00:00Z' });
    const r2 = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(r2, reasons(r2)).toMatchObject({ state: 'determinate', definition_version: 3, threshold_eval: { breach: false } });
    expect(check(r2, 'gamed')['status']).toBe('pass');
  });

  it('PRIVACY: a retired purpose; a role cohort reporting no distinct principals (k cannot be established); a pseudonymous cohort under a governance purpose → indeterminate, routed to analytics.privacy', async () => {
    const pk = `co-retired-${RUN.toLowerCase()}`;
    await sql`insert into analytics.purposes (purpose_id, scope, tenant_id, domain_id, purpose_key, version, title, purpose_kind, description, retention_days, state, digest, proposed_by, decided_by, decided_at,
        retired_by, retired_at, retire_reason, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${pk}, 1, 'a retired purpose (SYNTHETIC)', 'governance', 'a purpose retired yesterday (SYNTHETIC fixture)', 30, 'retired', ${'c'.repeat(64)},
              ${analyst.principalId}::uuid, ${owner.principalId}::uuid, '2026-01-01T00:00:00Z', ${owner.principalId}::uuid, clock_timestamp() - interval '1 day', 'retired for the fixture', ${uuidv7()}::uuid)`.execute(h.su);
    const key = `CO-purpose${RUN}`; await plant(key, { purpose_key: pk });
    await items(key, spread(3, 10, () => ({ role: 'executive' })));
    const r = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(r).toMatchObject({ state: 'indeterminate' });
    expect(reasons(r)).toMatch(/privacy: the purpose co-retired-.* is approved by no version at .*a measure beyond an approved purpose is not used — routed to privacy review/);
    expect((await itemsOf(String(r['result_id']))).map((x) => x['signal_class'])).toEqual(['analytics.privacy']);
    const role = `CO-role${RUN}`; await plant(role, { params: { bucket: key, no_actors: true } });
    const r2 = (await compute(analyst, { metricKey: role, period: Q3, cohort: { role: 'executive' } })).result;
    expect(reasons(r2)).toMatch(/privacy: a role cohort reports no distinct-principal count: k cannot be established/);
    const roleOk = `CO-roleok${RUN}`; await plant(roleOk, { params: { bucket: key } });
    const r3 = (await compute(analyst, { metricKey: roleOk, period: Q3, cohort: { role: 'executive' } })).result;
    expect(r3, reasons(r3)).toMatchObject({ state: 'determinate', n: 10 });
    const pseudo = `CO-pseudo${RUN}`; await plant(pseudo, { privacy_class: 'pseudonymous_cohort', purpose_key: pk, params: { bucket: key } });
    const r4 = (await compute(analyst, { metricKey: pseudo, period: Q3 })).result;
    expect(reasons(r4)).toMatch(/privacy: .*a pseudonymous cohort metric needs k_min >= 5 under a product_improvement purpose/);
  });

  it('OUTCOME-DETACHED: the objective the measure serves was withdrawn (an absent one too) → indeterminate; the live objective passes', async () => {
    const gone = uuidv7(); const cid = uuidv7();
    await sql`insert into graph.strategy_events (event_id, scope, tenant_id, domain_id, strategy_object_id, event, occurred_at, actor_principal_id, details, correlation_id) values
      (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${gone}::uuid, 'strategy.declared', '2026-01-01T00:00:00Z', ${owner.principalId}::uuid, '{"status":"active"}'::jsonb, ${cid}::uuid),
      (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${gone}::uuid, 'strategy.withdrawn', clock_timestamp() - interval '2 days', ${owner.principalId}::uuid, '{}'::jsonb, ${cid}::uuid)`.execute(h.su);
    const key = `CO-detached${RUN}`; const absent = uuidv7();
    await plant(key, { serves: { objective_ids: [w.objectiveId, gone, absent] } });
    await items(key, spread(3, 6, () => ({})));
    const r = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(r).toMatchObject({ state: 'indeterminate' });
    expect(reasons(r)).toMatch(new RegExp(`outcome-detached: the objective\\(s\\) this measure serves are no longer live \\(${gone} withdrawn, ${absent} absent\\)`));
    expect(arr(obj(check(r, 'outcome_detached')['detail'])['objectives'])).toHaveLength(2);
    // replay at an as-of before the withdrawal: the objective was live then (the check is as-of)
    const early = await dbAt('-3 days');
    const live = `CO-detachedearly${RUN}`; await plant(live, { serves: { objective_ids: [gone] }, params: { bucket: key } });
    const r2 = (await compute(analyst, { metricKey: live, period: Q3, asOf: early })).result;
    expect(r2, reasons(r2)).toMatchObject({ state: 'determinate' });
  });

  it('the hook called directly with RECORDS in the draft (the widened draft): exclusions, composition, synthetic share and newest instant read from the records themselves', async () => {
    const key = `CO-direct${RUN}`; const id = await plant(key, { quality: { bias: { dimension: 'severity', min_share: 0.3 }, max_staleness_days: 5 } });
    const recs = [
      ...Array.from({ length: 6 }, (_, i) => ({ kind: 'x', id: `a${i}`, role: 'numerator', detail: { severity: 'high', at: '2026-09-29T00:00:00Z' } })),
      { kind: 'x', id: 'b0', role: 'denominator', detail: { severity: 'low', at: '2026-09-28T00:00:00Z', synthetic: true } },
      ...Array.from({ length: 2 }, (_, i) => ({ kind: 'x', id: `e${i}`, role: 'excluded', reason: 'a fixture exclusion', detail: {} })),
    ];
    const asOf = await dbAt('0 seconds');   // the as-of: the objective it serves was declared (by the world) before it
    const ev = obj((await one(sql`select analytics.evaluate_result(${JSON.stringify({ metric_key: key, definition_id: id, definition_version: 1, period: Q3, window_from: '2026-07-01T00:00:00Z',
      window_to: '2026-10-01T00:00:00Z', as_of: asOf, scope: null, cohort: {}, n: 7, value: 0.857143, quality: {}, records_count: 9, records: recs })}::jsonb) e`))['e']);
    const ck = (n: string) => (arr(ev['checks']).find((x) => x['check'] === n) ?? {}) as Row;
    expect(ck('incomplete')).toMatchObject({ status: 'pass', detail: { excluded: 2, n: 7 } });
    expect(ck('biased')).toMatchObject({ status: 'fail', detail: { composition: { high: 6, low: 1 } } });
    expect(ck('synthetic_share')).toMatchObject({ status: 'pass', detail: { share: 0.142857 } });
    expect(ck('stale')).toMatchObject({ status: 'pass' });
    expect(arr(ev['failed'])).toEqual(['biased']);
  });

  it('a determinate BREACH is a REVIEW routed to the named owner (the definition\'s action quoted), never an automatic decision — raised once while open; the meter records every result', async () => {
    const key = `CO-breach${RUN}`; const defId = await plant(key, { threshold: { target: 0.9 } });
    await items(key, spread(3, 8, (i) => ({ ok: i < 6 })));
    const r = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(r).toMatchObject({ state: 'determinate', threshold_eval: { breach: true } });
    const its = await itemsOf(String(r['result_id']));
    expect(its).toHaveLength(1);
    expect(its[0]).toMatchObject({ signal_class: 'analytics.metric', owner: owner.principalId });
    expect(obj(its[0]!['details'])).toMatchObject({ origin: 'threshold_breach', action: 'a review by the product analytics owner, never an automatic decision' });
    expect((await one(sql`select state from analytics.metric_definitions where definition_id = ${defId}::uuid`))['state']).toBe('approved');   // nothing decided
    const again = (await compute(analyst, { metricKey: key, period: Q3 })).result;
    expect(arr(obj(again['after'])['routed'])[0]).toMatchObject({ existing: true, item_id: its[0]!['item_id'] });
    const m = await one(sql`select rows_read, compute_ms, replay, preview, measured_by from analytics.computation_costs where result_id = ${r['result_id'] as string}::uuid`);
    expect(m).toMatchObject({ rows_read: 8, replay: false, preview: false });
    expect(Number(m['compute_ms'])).toBeGreaterThanOrEqual(0);
    await expect(sql`update analytics.computation_costs set rows_read = 0 where result_id = ${r['result_id'] as string}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
  });
});

/* ═════════════════════════════════════════ CO2 ═════════════════════════════════════════ */
describe('CO2 · the cohort comparison: a difference WITH its uncertainty, or an explained indeterminate', () => {
  let key = ''; let hi = ''; let lo = ''; let rare = '';
  beforeAll(async () => {
    key = `CO-cmp${RUN}`; await plant(key, { floor_n: 5 });
    await items(key, spread(3, 30, (i) => ({ severity: 'high', ok: i < 27 })));
    await items(key, spread(3, 30, (i) => ({ severity: 'low', ok: i < 15 })));
    await items(key, spread(3, 2, () => ({ severity: 'rare' })));
    hi = String((await compute(analyst, { metricKey: key, period: Q3, cohort: { severity: 'high' } })).result['result_id']);
    lo = String((await compute(analyst, { metricKey: key, period: Q3, cohort: { severity: 'low' } })).result['result_id']);
    rare = String((await compute(analyst, { metricKey: key, period: Q3, cohort: { severity: 'rare' } })).result['result_id']);
  }, 300_000);

  it('positive (rate): high 27/30 vs low 15/30 — Newcombe\'s interval excludes 0, the claim is "a is higher"; the numbers equal the pure function\'s; the composition stated; the ledger append-only', async () => {
    const cmp = (await compare(analyst, { a: { resultId: hi }, b: { resultId: lo } })).comparison;
    const nc = newcombe(27, 30, 15, 30)!;
    expect(cmp).toMatchObject({ state: 'determinate', kind: 'rate', method: 'newcombe_hybrid_score', metric_key: key });
    expect(Number(cmp['estimate'])).toBeCloseTo(nc.estimate, 6);
    expect(Number(obj(cmp['interval'])['lo'])).toBeCloseTo(nc.lo, 5);
    expect(Number(obj(cmp['interval'])['hi'])).toBeCloseTo(nc.hi, 5);
    expect(nc.lo).toBeGreaterThan(0);
    expect(String(cmp['claim'])).toMatch(/^a is higher than b by 0\.40* \(95% interval /);
    expect(Number(obj(obj(cmp['interval'])['a'])['lo'])).toBeCloseTo(wilson(27, 30)!.lo, 5);
    expect(Number(obj(obj(cmp['interval'])['a'])['hi'])).toBeCloseTo(wilson(27, 30)!.hi, 5);
    expect(obj(cmp['composition'])).toMatchObject({ differs: ['cohort'], n: { a: 30, b: 30 }, by_severity: { a: { high: 30 }, b: { low: 30 } } });
    expect(String(obj(cmp['comparability'])['rule'])).toMatch(/semantic projections are equal/);
    expect(String(cmp['digest'])).toMatch(/^[0-9a-f]{64}$/);
    const rd = (await comparisonRead(owner, String(cmp['comparison_id']))).comparison;
    expect(rd['claim']).toBe(cmp['claim']);
    await expect(sql`delete from analytics.comparisons where comparison_id = ${cmp['comparison_id'] as string}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
    // the attention agent may compute a comparison (AI computes; it never approves)
    const ag = (await compare(agent, { a: { resultId: lo }, b: { resultId: hi } })).comparison;
    expect(ag).toMatchObject({ state: 'determinate', run_by_kind: 'agent' });
    expect(String(ag['claim'])).toMatch(/^a is lower than b/);
  });

  it('indeterminate: a side below the floor (2 records) — no difference shown, the reasons said, estimate NULL (never 0)', async () => {
    const cmp = (await compare(analyst, { a: { resultId: hi }, b: { resultId: rare } })).comparison;
    expect(cmp).toMatchObject({ state: 'indeterminate', estimate: null, interval: null });
    expect(String(cmp['claim'])).toMatch(/^indeterminate: no difference is shown — side b .* is indeterminate/);
  });

  it('positive (duration): two periods — medians 330 s and 2385 s with non-overlapping intervals → "a\'s median is lower"; a 5-record cohort (n < 6) → no claim, the interval unbounded', async () => {
    const dk = `CO-cmpd${RUN}`; await plant(dk, { kind: 'duration', unit: 'seconds', direction: 'lower', dimensions: ['severity'], computation_key: `co_duration_${RUN}` });
    await items(dk, spread(2, 10, (i) => ({ seconds: 60 * (i + 1) })));
    await items(dk, spread(3, 10, (i) => ({ seconds: 2000 + 70 * (i + 1) })));
    await items(dk, spread(3, 5, (i) => ({ seconds: 2000 + 10 * i, severity: 'low' })));
    const a = String((await compute(analyst, { metricKey: dk, period: Q2 })).result['result_id']);
    const b = (await compute(analyst, { metricKey: dk, period: Q3, cohort: { severity: 'high' } })).result;
    expect(b, reasons(b)).toMatchObject({ state: 'determinate' });
    const cmp = (await compare(analyst, { a: { resultId: a }, b: { resultId: String(b['result_id']) } })).comparison;
    expect(cmp).toMatchObject({ state: 'determinate', kind: 'duration', method: 'medians_with_order_statistic_intervals' });
    expect(Number(cmp['estimate'])).toBe(330 - 2385);
    expect(String(cmp['claim'])).toMatch(/^a's median \(330(\.000)?\) is lower than b's \(2385(\.000)?\): the intervals do not overlap/);
    expect(obj(cmp['composition'])['differs']).toEqual(['period', 'cohort']);
    const low = String((await compute(analyst, { metricKey: dk, period: Q3, cohort: { severity: 'low' } })).result['result_id']);
    const cmp2 = (await compare(analyst, { a: { resultId: String(b['result_id']) }, b: { resultId: low } })).comparison;
    expect(cmp2).toMatchObject({ state: 'determinate' });
    expect(String(cmp2['claim'])).toMatch(/^no claim: the interval of a median is unbounded below n = 6/);
  });

  it('comparability: versions differing only in a NON-semantic field (the title) are comparable; a SEMANTIC change (the params) is indeterminate, the differing fields named', async () => {
    const vk = `CO-cmpv${RUN}`;
    const v1 = await plant(vk, { params: { bucket: key } });
    const r1 = String((await compute(analyst, { metricKey: vk, period: Q3, cohort: { severity: 'high' } })).result['result_id']);
    await sql`update analytics.metric_definitions set state = 'superseded', superseded_at = clock_timestamp() where definition_id = ${v1}::uuid`.execute(h.su);
    const v2 = await plant(vk, { version: 2, params: { bucket: key }, title: `fixture ${vk} renamed (SYNTHETIC)`, effective_from: '2026-01-02T00:00:00Z' });
    const r2 = String((await compute(analyst, { metricKey: vk, period: Q3, cohort: { severity: 'low' } })).result['result_id']);
    const ok = (await compare(analyst, { a: { resultId: r1 }, b: { resultId: r2 } })).comparison;
    expect(ok).toMatchObject({ state: 'determinate', comparability: { same_semantics: true, definition_versions: [1, 2] } });
    await sql`update analytics.metric_definitions set state = 'superseded', superseded_at = clock_timestamp() where definition_id = ${v2}::uuid`.execute(h.su);
    await plant(vk, { version: 3, params: { bucket: key, variant: 'semantic' }, effective_from: '2026-01-03T00:00:00Z' });
    const r3 = String((await compute(analyst, { metricKey: vk, period: Q3, cohort: { severity: 'low' } })).result['result_id']);
    const bad = (await compare(analyst, { a: { resultId: r1 }, b: { resultId: r3 } })).comparison;
    expect(bad).toMatchObject({ state: 'indeterminate', estimate: null });
    expect(String(bad['claim'])).toMatch(/non-comparable: definition versions 1 and 3 differ in what decides the value \(params\)/);
  });

  it('refusal: a preview (409), a replay (409), two metrics (422), the same result twice (422), an unknown result (404), another domain\'s caller (404), an outsider (PDP 403), a person cohort at the route (403)', async () => {
    await plant(key, { state: 'proposed', version: 2, floor_n: 5 });   // a proposed version 2 of the same metric: its preview is marked
    const prev = String((await compute(analyst, { metricKey: key, period: Q3, preview: true })).result['result_id']);
    await refused(compare(analyst, { a: { resultId: hi }, b: { resultId: prev } }), /^cohort comparison rejected \(state\): a PREVIEW result/, 409);
    const rp = String((await replay(analyst, hi)).replay['result_id']);
    await refused(compare(analyst, { a: { resultId: rp }, b: { resultId: lo } }), /^cohort comparison rejected \(state\): a replay is compared through its original/, 409);
    const other = `CO-cmpo${RUN}`; await plant(other, { params: { bucket: key } });
    const ro = String((await compute(analyst, { metricKey: other, period: Q3 })).result['result_id']);
    await refused(compare(analyst, { a: { resultId: hi }, b: { resultId: ro } }), /^cohort comparison rejected \(metric\)/, 422);
    await refused(compare(analyst, { a: { resultId: hi }, b: { resultId: hi } }), /^cohort comparison rejected \(request\): a comparison names two different results/, 422);
    await refused(compare(analyst, { a: { resultId: hi }, b: { resultId: uuidv7() } }), /^cohort comparison rejected \(unknown_result\)/, 404);
    await refused(compare(foreign, { a: { resultId: hi }, b: { resultId: lo } }, otherDomain), /^cohort comparison rejected \(unknown_result\)/, 404);
    await refused(comparisonRead(foreign, uuidv7(), otherDomain), /^cohort comparison rejected \(unknown_comparison\)/, 404);
    await refused(compare(outsider, { a: { resultId: hi }, b: { resultId: lo } }), /./, 403);
    await refused(compare(analyst, { metricKey: key, a: { period: Q3, cohort: { acknowledged_by: analyst.principalId } }, b: { resultId: lo } }), /^cohort comparison rejected \(person\)/, 403);
  });
});


describe('CO2-X · cross-tenant (AT-70): another tenant\'s analyst sees and compares nothing of this tenant', () => {
  it('its own context answers 404 for this tenant\'s results and comparisons and an empty list; naming this tenant\'s context is refused (PDP 403)', async () => {
    const key = `CO-xt${RUN}`; await plant(key);
    await items(key, spread(3, 6, () => ({})));
    const a = String((await compute(analyst, { metricKey: key, period: Q3 })).result['result_id']);
    const b = String((await compute(analyst, { metricKey: key, period: Q2 })).result['result_id']);
    const cmp = String((await compare(analyst, { a: { resultId: a }, b: { resultId: b } })).comparison['comparison_id']);
    const U = uuidv7(); const DU = uuidv7(); const id = uuidv7();
    await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b92co-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
    await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${'b92co-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
              values (${id}::uuid, 'human', 'DOMAIN', ${U}::uuid, ${DU}::uuid, ${`b92co-other-analyst-${RUN} (SYNTHETIC)`}, ${`b92co-oa-${id.slice(-8)}`}, 'active')`.execute(h.su);
    for (const role of ['product_analyst', 'product_analytics_owner']) {
      await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${U}::uuid, ${DU}::uuid)`.execute(h.su);
    }
    const other = await h.openSession({ ...h.manager, principalId: id, kind: 'human', homeScope: 'DOMAIN', homeTenantId: U, homeDomainId: DU,
      bindings: ['product_analyst', 'product_analytics_owner'].map((roleCode) => ({ roleCode, scope: 'DOMAIN', tenantId: U, domainId: DU })) } as AuthenticatedPrincipal);
    const req = (action: string, type: string, oid: string | null = null) => ({ eyeEnvelope: { ...(h.env(other, action, type, oid, 'intelligence') as unknown as Row), tenant_id: U, domain_id: DU }, eyePrincipal: other }) as never;
    await refused(co.runComparison(req('analytics.comparison.run', 'ACM'), U, DU, { payload: { a: { resultId: a }, b: { resultId: b } } }), /^cohort comparison rejected \(unknown_result\)/, 404);
    await refused(co.comparison(req('analytics.read', 'ACM', cmp), U, DU, cmp), /^cohort comparison rejected \(unknown_comparison\)/, 404);
    expect(((await co.comparisons(req('analytics.read', 'ACM'), U, DU, { payload: {} })) as { comparisons: Row[] }).comparisons).toEqual([]);
    expect(((await co.reconciliations(req('analytics.read', 'ARC'), U, DU, { payload: {} })) as { reconciliations: Row[] }).reconciliations).toEqual([]);
    await refused(compare(other, { a: { resultId: a }, b: { resultId: b } }), /./, 403);
  });
});

/* ═════════════════════════════════════════ CO3 ═════════════════════════════════════════ */
describe('CO3 · DP-44-001: cohorts, relationships and analytical models as GOVERNED semantic objects of B90\'s layer', () => {
  let key = ''; let cohortId = ''; let cohortDigest = ''; let comparisonId = '';
  beforeAll(async () => {
    key = `CO-sem${RUN}`; await plant(key, { floor_n: 5 });
    await items(key, spread(3, 20, (i) => ({ severity: 'high', ok: i < 18 })));
    await items(key, spread(3, 20, (i) => ({ severity: 'low', ok: i < 10 })));
  }, 300_000);

  it('a COHORT declared by an analyst (the owner named) and CERTIFIED by the owner at the digest read — the B90 metric-owner idiom (≤ 366 days, a reason)', async () => {
    const d = (await declare(analyst, { key: `high-severity-${RUN.toLowerCase()}`, kind: 'cohort', title: 'High-severity items (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { severity: 'high' }, metric_keys: [key], rationale: 'the high-severity population the review compares (SYNTHETIC)' } })).object;
    cohortId = String(d['object_id']); cohortDigest = String(d['digest']);
    expect(d).toMatchObject({ kind: 'cohort', state: 'declared', current_version: 1, standing: 'declared', owner_principal_id: owner.principalId });
    const expiresAt = await dbAt('180 days');
    const cert = (await certify(owner, cohortId, { version: 1, digest: cohortDigest, expiresAt, reason: 'the cohort matches the review\'s population (SYNTHETIC)' })).object;
    expect(cert).toMatchObject({ state: 'certified', certified_version: 1, standing: 'certified' });
    expect(arr(cert['certifications'])[0]).toMatchObject({ state: 'active', certified_by: owner.principalId, digest: cohortDigest });
    expect((await rows(sql`select event from analytics.definition_events where subject_id = ${cohortId}::uuid order by occurred_at`)).map((x) => x['event'])).toEqual(['semantic_object.declared', 'semantic_object.certified']);
  });

  it('refusal: the owner certifying a version they declared (SoD 403), an analyst certifying (PDP 403), the agent at the PEP (human gate 403) and an agent claiming human at the PORT (403), a stale digest (409), an expiry beyond 366 days (422), a person criterion (403), an unknown metric (404), a dimension the metric lacks (422), a duplicate key (409), an unchanged re-declaration (409)', async () => {
    const own = (await declare(owner2, { key: `own-${RUN.toLowerCase()}`, kind: 'cohort', title: 'Self-declared cohort (SYNTHETIC)', owner: owner2.principalId,
      definition: { criteria: { severity: 'low' }, metric_keys: [key], rationale: 'declared by its own owner (SYNTHETIC)' } })).object;
    const far = await dbAt('400 days'); const soon = await dbAt('30 days');
    await refused(certify(owner2, String(own['object_id']), { version: 1, digest: String(own['digest']), expiresAt: soon, reason: 'certifying my own declaration' }),
      /^semantic object rejected \(separation_of_duties\)/, 403);
    await refused(certify(analyst, String(own['object_id']), { version: 1, digest: String(own['digest']), expiresAt: soon, reason: 'an analyst certifying' }), /./, 403);
    await refused(declare(stewardAgent, { key: `agent-${RUN.toLowerCase()}`, kind: 'cohort', title: 'An agent\'s cohort (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { severity: 'low' }, metric_keys: [key], rationale: 'an agent declaring semantics' } }), /human gate: products\.semantic\.declare requires a named human principal/, 403);
    await refused(declare(agentAsHuman, { key: `agent2-${RUN.toLowerCase()}`, kind: 'cohort', title: 'An agent\'s cohort (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { severity: 'low' }, metric_keys: [key], rationale: 'an agent declaring semantics' } }), /^semantic object rejected \(actor\): a semantic object is declared by a named human/, 403);
    const low = (await declare(steward, { key: `low-severity-${RUN.toLowerCase()}`, kind: 'cohort', title: 'Low-severity items (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { severity: 'low' }, metric_keys: [key], rationale: 'the low-severity population (SYNTHETIC)' } })).object;
    await refused(certify(owner, String(low['object_id']), { version: 1, digest: 'f'.repeat(64), expiresAt: soon, reason: 'a digest never read' }), /^semantic object rejected \(stale\)/, 409);
    await refused(certify(owner, String(low['object_id']), { version: 1, digest: String(low['digest']), expiresAt: far, reason: 'a certification for too long' }), /^semantic object rejected \(expiry\): a certification expires within 366 days/, 422);
    await refused(declare(analyst, { key: `person-${RUN.toLowerCase()}`, kind: 'cohort', title: 'Per-person cohort (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { acknowledged_by: analyst.principalId }, metric_keys: [key], rationale: 'grouping by a person' } }), /^semantic object rejected \(person\)/, 403);
    await refused(declare(analyst, { key: `unknown-${RUN.toLowerCase()}`, kind: 'cohort', title: 'Unknown metric cohort (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { severity: 'low' }, metric_keys: ['MET-999'], rationale: 'a metric that does not exist' } }), /^semantic object rejected \(unknown_metric\)/, 404);
    await refused(declare(analyst, { key: `region-${RUN.toLowerCase()}`, kind: 'cohort', title: 'Region cohort (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { region: 'emea' }, metric_keys: [key], rationale: 'a dimension the metric lacks' } }), /^semantic object rejected \(dimension\)/, 422);
    await refused(declare(analyst, { key: `low-severity-${RUN.toLowerCase()}`, kind: 'cohort', title: 'Low-severity items again (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { severity: 'low' }, metric_keys: [key], rationale: 'the same key again' } }), /^semantic object rejected \(duplicate\): the key/, 409);
    await refused(declare(steward, { objectId: low['object_id'], key: `low-severity-${RUN.toLowerCase()}`, kind: 'cohort', title: 'Low-severity items (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { severity: 'low' }, metric_keys: [key], rationale: 'the low-severity population (SYNTHETIC)' } }), /^semantic object rejected \(duplicate\): the definition of .* is unchanged/, 409);
    await refused(declare(analyst, { key: `owner-${RUN.toLowerCase()}`, kind: 'cohort', title: 'Owned by an analyst (SYNTHETIC)', owner: analyst2.principalId,
      definition: { criteria: { severity: 'low' }, metric_keys: [key], rationale: 'an owner without the role' } }), /^semantic object rejected \(owner\)/, 422);
  });

  it('a RELATIONSHIP and an ANALYTICAL MODEL declared over existing objects (unknown endpoints refused 404) and certified', async () => {
    await refused(declare(analyst, { key: `rel-bad-${RUN.toLowerCase()}`, kind: 'relationship', title: 'Relationship to nothing (SYNTHETIC)', owner: owner.principalId,
      definition: { from: { kind: 'metric', key }, to: { kind: 'semantic_model', key: 'no-such-model' }, relation: 'explains', rationale: 'an endpoint that does not exist' } }), /^semantic object rejected \(unknown_reference\)/, 404);
    const rel = (await declare(analyst, { key: `rel-${RUN.toLowerCase()}`, kind: 'relationship', title: 'Severity cohort explains the rate (SYNTHETIC)', owner: owner.principalId,
      definition: { from: { kind: 'semantic_object', key: `high-severity-${RUN.toLowerCase()}` }, to: { kind: 'metric', key }, relation: 'explains', rationale: 'the high-severity cohort drives the rate (SYNTHETIC)' } })).object;
    const model = (await declare(steward, { key: `model-${RUN.toLowerCase()}`, kind: 'analytical_model', title: 'Severity decomposition (SYNTHETIC)', owner: owner.principalId,
      definition: { method: 'decomposition', inputs: [{ kind: 'metric', key }, { kind: 'semantic_object', key: `high-severity-${RUN.toLowerCase()}` }], output: 'the rate decomposed by severity',
                    assumptions: ['severity is recorded at the item\'s creation'], validity: 'valid while the severity scale is unchanged (SYNTHETIC)' } })).object;
    const exp = await dbAt('90 days');
    for (const o of [rel, model]) {
      const cert = (await certify(owner, String(o['object_id']), { version: 1, digest: String(o['digest']), expiresAt: exp, reason: 'reviewed and adopted (SYNTHETIC)' })).object;
      expect(cert).toMatchObject({ state: 'certified', kind: o['kind'] });
    }
    const listed = ((await co.objects(rq(owner, 'products.semantic.read', 'SOB'), T(), D(), { payload: { kind: 'relationship' } })) as { objects: Row[] }).objects;
    expect(listed.map((x) => x['object_key'])).toEqual([`rel-${RUN.toLowerCase()}`]);
    expect(obj(listed[0]!['definition'])).toMatchObject({ relation: 'explains', to: { kind: 'metric', key } });
  });

  it('a comparison asked for by PERIOD naming the certified cohort through the route (the service computes both sides first): the cohort object\'s version, digest and certification recorded on the comparison', async () => {
    const out = await compare(analyst, { metricKey: key, a: { period: Q3, cohortObjectId: cohortId }, b: { period: Q3, cohort: { severity: 'low' } } });
    const cmp = out.comparison; comparisonId = String(cmp['comparison_id']);
    expect(obj(out.computed)['a']).toMatchObject({ cohort: { severity: 'high' }, state: 'determinate' });
    expect(cmp).toMatchObject({ state: 'determinate', cohort_object_a: { object_id: cohortId, digest: cohortDigest, version: 1, kind: 'cohort' } });
    expect(String(cmp['claim'])).toMatch(/^a is higher than b/);
    const low = (await one(sql`select object_id::text id from products.semantic_objects where object_key = ${`low-severity-${RUN.toLowerCase()}`}`))['id'] as string;
    await refused(compare(analyst, { metricKey: key, a: { period: Q3, cohortObjectId: low }, b: { period: Q3, cohort: { severity: 'high' } } }), /^cohort comparison rejected \(state\): cohort .* is declared — only a CERTIFIED cohort object/, 409);
    await refused(compare(analyst, { a: { resultId: String(obj(obj(out.computed)['b'])['result_id']) }, b: { resultId: String(obj(obj(out.computed)['a'])['result_id']) }, cohortObjectA: cohortId }),
      /^cohort comparison rejected \(cohort\): side a was computed on the cohort .* which is not cohort/, 422);
  });

  it('RECOVERY / continuity: re-declaring the certified cohort WITHDRAWS its certification (definition_changed) and EXPOSES the comparisons that used it; the comparison now refuses it; re-certified it serves again; the steward withdraws (an analyst cannot); an expired certification is refused', async () => {
    const re = (await declare(analyst, { objectId: cohortId, key: `high-severity-${RUN.toLowerCase()}`, kind: 'cohort', title: 'High-severity items (SYNTHETIC)', owner: owner.principalId,
      definition: { criteria: { severity: 'high' }, metric_keys: [key], rationale: 'the high-severity population — rationale revised (SYNTHETIC)' } })).object;
    expect(re).toMatchObject({ state: 'withdrawn', current_version: 2, last_valid_version: 1 });
    expect(arr(obj(re['withdrawal'])['uses_exposed']).map((x) => x['comparison_id'])).toContain(comparisonId);
    expect(String(obj(re['withdrawal'])['reason'])).toMatch(/^definition_changed: the certified version 1 was re-declared as version 2/);
    await refused(compare(analyst, { metricKey: key, a: { period: Q3, cohortObjectId: cohortId }, b: { period: Q3, cohort: { severity: 'low' } } }), /^cohort comparison rejected \(state\)/, 409);
    const exp = await dbAt('60 days');
    await certify(owner, cohortId, { version: 2, digest: String(re['digest']), expiresAt: exp, reason: 'the revised rationale reviewed (SYNTHETIC)' });
    const ok = (await compare(analyst, { metricKey: key, a: { period: Q3, cohortObjectId: cohortId }, b: { period: Q3, cohort: { severity: 'low' } } })).comparison;
    expect(ok).toMatchObject({ state: 'determinate', cohort_object_a: { version: 2 } });
    await refused(withdraw(analyst, cohortId, 'an analyst withdrawing'), /./, 403);
    const wd = (await withdraw(steward, cohortId, 'the severity scale is under review (SYNTHETIC)')).object;
    expect(wd).toMatchObject({ state: 'withdrawn', standing: 'withdrawn' });
    expect(arr(obj(wd['withdrawal'])['uses_exposed']).length).toBeGreaterThanOrEqual(2);
    await refused(withdraw(steward, cohortId, 'withdrawing twice over'), /^semantic object rejected \(state\)/, 409);
    // the expiry (a stated superuser move: the certification's instants moved into the past under the disabled forward trigger)
    await certify(owner, cohortId, { version: 2, digest: String(re['digest']), expiresAt: exp, reason: 'certified again after the review (SYNTHETIC)' });
    await sql.raw(`alter table products.semantic_object_certifications disable trigger psoc_forward`).execute(h.su);
    await sql`update products.semantic_object_certifications set certified_at = clock_timestamp() - interval '10 days', expires_at = clock_timestamp() - interval '1 day' where object_id = ${cohortId}::uuid and state = 'active'`.execute(h.su);
    await sql.raw(`alter table products.semantic_object_certifications enable trigger psoc_forward`).execute(h.su);
    expect((await objRead(analyst, cohortId)).object['standing']).toMatch(/past its expiry — not usable/);
    await refused(compare(analyst, { metricKey: key, a: { period: Q3, cohortObjectId: cohortId }, b: { period: Q3, cohort: { severity: 'low' } } }), /^cohort comparison rejected \(state\): the certification of cohort .* expired/, 409);
  });
});

/* ═════════════════════════════════════════ CO4 ═════════════════════════════════════════ */
describe('CO4 · the cost reconciliation (PR-70-006, D15): matched, unpriced and discrepant units named — never a silent pass', () => {
  it('UNPRICED (today\'s honest state): every computation of the period metered here, none metered by B91 — each named, the outcome unpriced with its reason', async () => {
    const today = (await one(sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD') d`))['d'] as string;
    const n = Number((await one(sql`select count(*)::int n from analytics.computation_costs where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`))['n']);
    expect(n).toBeGreaterThan(10);
    const r = (await reconcile(analyst, { period: `R1@${today}` })).reconciliation;
    expect(r).toMatchObject({ outcome: 'unpriced', counts: { matched: 0, discrepant: 0 } });
    expect(Number(obj(r['counts'])['units'])).toBe(Number(obj(r['totals'])['computations']));
    expect(arr(r['units'])[0]).toMatchObject({ class: 'unpriced', note: 'no B91 usage record meters this computation (B91 meters no analytics dimension today)' });
    expect(JSON.stringify(r['reasons'])).toMatch(/unit\(s\) unpriced: the analytics cost is measured here but not priced by B91/);
    const cl = (await costs(owner, { period: `R1@${today}`, limit: 1000 })).costs;
    expect(cl.length).toBe(Number(obj(r['totals'])['computations']));
  });

  it('MATCHED, DISCREPANT, ORPHAN (a planted B91 meter, SYNTHETIC — as B91 would record it): in a ledger domain of its own, matched and priced; a disagreeing meter discrepant; an orphan meter discrepant; a period with nothing `empty`', async () => {
    const dom = uuidv7();
    await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${dom}::uuid, ${T()}::uuid, ${'b92co-ledger-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
    const la = await h.humanWithSession(['product_analyst'], 'b92co-ledger-analyst', 'DOMAIN', { domainId: dom });
    const key = `CO-ledger${RUN}`; await plant(key, { serves: { objective_ids: [] } }, dom);
    await items(key, spread(3, 6, () => ({})), dom);
    const computeIn = (payload: Row) => c.compute(rq(la, 'analytics.metric.compute', 'AMR', null, dom), T(), dom, { payload }) as Promise<{ result: Row }>;
    const r1 = String((await computeIn({ metricKey: key, period: Q3 })).result['result_id']);
    const r2 = String((await computeIn({ metricKey: key, period: Q3 })).result['result_id']);
    const today = (await one(sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD') d`))['d'] as string;
    const ms = async (id: string) => Number((await one(sql`select compute_ms from analytics.computation_costs where result_id = ${id}::uuid`))['compute_ms']);
    const rate = uuidv7(); const rateVersion = 9000 + Math.floor(Math.random() * 900);
    await sql`insert into commercial.rate_cards (rate_card_id, rate_key, version, dimension, unit, price_per_unit, currency, effective_from, synthetic, reason, set_by, correlation_id)
      values (${rate}::uuid, 'product_consumption:wall_ms', ${rateVersion}, 'product_consumption', 'wall_ms', 0.001, 'EUR', clock_timestamp() - (${rateVersion} || ' seconds')::interval, true, 'a SYNTHETIC analytics rate (B92 §CO harness)', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const usage = async (sourceRef: string, quantity: number): Promise<string> => {
      const u = uuidv7();
      await sql`insert into commercial.usage_records (usage_id, scope, tenant_id, domain_id, capability_key, dimension, unit, quantity, source_kind, source_ref, details, occurred_at, correlation_id)
        values (${u}::uuid, 'DOMAIN', ${T()}::uuid, ${dom}::uuid, 'product_analytics', 'product_consumption', 'wall_ms', ${quantity}, 'analytics_computation', ${sourceRef}, '{"synthetic": true}'::jsonb, clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su);
      return u;
    };
    const price = async (u: string, quantity: number) => sql`insert into commercial.cost_entries (entry_id, usage_id, line, scope, tenant_id, domain_id, capability_key, dimension, unit, asset_ref, profile, quantity, share, allocation,
        rate_card_id, rate_key, rate_version, price_per_unit, currency, amount, occurred_at, priced_by, correlation_id)
      values (${uuidv7()}::uuid, ${u}::uuid, 0, 'DOMAIN', ${T()}::uuid, ${dom}::uuid, 'product_analytics', 'product_consumption', 'wall_ms', 'analytics', 'local-dev', ${quantity}, 1, 'direct',
              ${rate}::uuid, 'product_consumption:wall_ms', ${rateVersion}, 0.001, 'EUR', ${quantity * 0.001}, clock_timestamp(), ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const u1 = await usage(r1, await ms(r1)); await price(u1, await ms(r1));
    const u2 = await usage(r2, await ms(r2)); await price(u2, await ms(r2));
    const reconcileIn = (as: AuthenticatedPrincipal, payload: Row) => reconcile(as, payload, dom);
    const m = (await reconcileIn(la, { period: `R1@${today}` })).reconciliation;
    expect(m, JSON.stringify(m['units'])).toMatchObject({ outcome: 'matched', counts: { matched: 2, unpriced: 0, discrepant: 0, units: 2 } });
    expect(Number(obj(obj(m['totals'])['priced'])['EUR'])).toBeGreaterThanOrEqual(0);
    const r3 = String((await computeIn({ metricKey: key, period: Q3 })).result['result_id']);
    await usage(r3, (await ms(r3)) * 10 + 500);
    await usage(uuidv7(), 42);
    const d = (await reconcileIn(la, { period: `R1@${today}` })).reconciliation;
    expect(d).toMatchObject({ outcome: 'discrepant', counts: { matched: 2, discrepant: 2 } });
    expect(arr(d['units']).map((x) => x['note']).join(' | ')).toMatch(/B91 metered .* wall_ms; this ledger measured .*\| a B91 analytics usage record that no computation of this ledger explains/);
    const e = (await reconcileIn(la, { period: '2025-Q1' })).reconciliation;
    expect(e).toMatchObject({ outcome: 'empty', counts: { units: 0 } });
    expect(JSON.stringify(e['reasons'])).toMatch(/nothing to reconcile: no computation was metered in 2025-Q1 .*not a pass/);
    await expect(sql`update analytics.reconciliations set outcome = 'matched' where reconciliation_id = ${e['reconciliation_id'] as string}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
  });

  it('refusal: a bad period (422), a tolerance outside [0, 1] (422 at the route; the port re-checks it), an outsider (PDP 403)', async () => {
    await refused(reconcile(analyst, { period: '2026-Q9' }), /^cost reconciliation rejected \(period\)/, 422);
    await refused(reconcile(analyst, { period: Q3, tolerance: 2 }), /^cost reconciliation rejected \(tolerance\)/, 422);
    await refused(reconcile(outsider, { period: Q3 }), /./, 403);
  });
});

/* ═════════════════════════════════════════ CO5 ═════════════════════════════════════════ */
describe('CO5 · DP-44-006: the exposure-EUR measure proven over ACCEPTED EUR assessments (B32\'s real ports) and served by B90', () => {
  it('accepted EUR exposures → products.measure_exposure_eur_at_risk and B90\'s serve; USD and unaccepted excluded; a later version counted only once accepted; nothing before the acceptance', async () => {
    const { ExposuresController: Xc } = await import('../../src/prediction/exposures/exposures.controller.js');
    const { ProductsController: PC } = await import('../../src/products/products.controller.js');
    const { MetricsController: MC } = await import('../../src/products/metrics/metrics.controller.js');
    const ex = h.app.get(Xc); const products = h.app.get(PC); const metrics = h.app.get(MC);
    const riskOwner = await h.humanWithSession(['risk_owner', 'strategy_owner'], 'b92co-risk-owner');
    const dAnalyst = await h.humanWithSession(['domain_analyst'], 'b92co-domain-analyst');
    const dAdmin = await h.humanWithSession(['domain_admin'], 'b92co-domain-admin');
    const mOwner = await h.humanWithSession(['strategy_owner', 'data_steward'], 'b92co-metric-owner');
    const X = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'RSK', id, 'prediction');
    await ex.publishTaxonomy(X(w.executive, 'prediction.exposure.taxonomy.publish'), T(), D(), { payload: { expectedVersion: 0, reason: 'the B92 §CO fixture taxonomy (SYNTHETIC)',
      categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }] } });
    await ex.activateTaxonomy(X(dAdmin, 'prediction.exposure.taxonomy.activate'), T(), D(), { payload: { version: 1, reason: 'the fixture taxonomy reviewed (SYNTHETIC)' } });
    const rsk = async (title: string): Promise<string> => ((await w.graph.declare(h.req(riskOwner, 'graph.strategy.declare', 'RSK', null, 'graph'), T(), D(), { payload: { objectType: 'RSK', title,
      statement: `${title} — a B92 §CO fixture exposure (SYNTHETIC)`, restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the corridor drives the exposure (SYNTHETIC)' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
    const assessment = (low: number, high: number, unit: string): Row => ({ mechanism: 'A corridor closure delays the shipments (SYNTHETIC fixture amounts)', probability: { low: 0.3, high: 0.6 },
      impact: { low, high, unit }, horizon: '2026-Q4', response_window_hours: 72, velocity: 'weeks', reversibility: 'partly_reversible', controllability: 'low', confidence: 0.6,
      options: [{ key: 'hold', label: 'Accept and watch', kind: 'accept' }, { key: 'dual', label: 'Dual source', kind: 'mitigate' }], evidence: [{ object_id: w.evd.id, version: w.evd.version }],
      basis: 'SYNTHETIC fixture amounts (B92 §CO DP-44-006)' });
    const assessAccept = async (id: string, version: number, a: Row, accept: boolean): Promise<void> => {
      await ex.assess(X(dAnalyst, 'prediction.exposure.assess', id), T(), D(), id, { payload: { expectedVersion: version - 1, assessment: a } });
      if (!accept) return;
      const pv = (await ex.preview(X(riskOwner, 'prediction.exposure.read', id), T(), D(), id, String(version))) as { preview: Row };
      await ex.accept(X(riskOwner, 'prediction.exposure.accept', id), T(), D(), id, String(version), { payload: { digest: pv.preview['digest'], rationale: 'the assessment matches the corridor evidence (SYNTHETIC)' } });
    };
    const before = (await one(sql`select clock_timestamp()::text t`))['t'] as string;
    const eur = await rsk('Corridor closure EUR (SYNTHETIC)'); const usd = await rsk('Corridor closure USD (SYNTHETIC)'); const open = await rsk('Corridor closure unaccepted (SYNTHETIC)');
    for (const id of [eur, usd, open]) await ex.register(X(dAnalyst, 'prediction.exposure.register', id), T(), D(), { payload: { strategyObjectId: id, polarity: 'risk', category: 'supply_chain', owner: riskOwner.principalId } });
    await assessAccept(eur, 1, assessment(400_000, 900_000, 'EUR'), true);
    await assessAccept(usd, 1, assessment(100_000, 300_000, 'USD'), true);
    await assessAccept(open, 1, assessment(50_000, 70_000, 'EUR'), false);
    const measure = async (grain: string, asOf: string | null = null) => rows(sql`select grain_key, value, source_rows, source_newest_at from products.measure_exposure_eur_at_risk(${T()}::uuid, ${D()}::uuid, ${grain}, '{}'::jsonb, coalesce(${asOf}::timestamptz, clock_timestamp()), 'sum')`);
    const m1 = await measure('exposure');
    expect(m1.map((x) => [x['grain_key'], Number(x['value'])])).toEqual([[eur, 900_000]]);
    expect(m1[0]).toMatchObject({ source_rows: 1 });
    expect(await measure('domain', before)).toEqual([]);   // nothing was accepted at that instant
    // B90's serve: a metric product over the measure (analyst view: marked uncertified — certification is B90's own fixture)
    const reg = (await products.register(h.req(mOwner, 'products.product.register', 'DPR', null, 'executive'), T(), D(), { payload: { key: `eur-at-risk-${RUN.toLowerCase()}`, title: 'Exposure EUR at risk (SYNTHETIC)', kind: 'metric',
      purpose: 'the DP-44-006 fixture of the exposure-EUR measure (B92 §CO)', ownerPrincipalId: mOwner.principalId } })) as { product: Row };
    const pid = String(reg.product['product_id']);
    await metrics.define(h.req(mOwner, 'products.metric.declare', 'MET', pid, 'executive'), T(), D(), pid, { payload: { title: 'Exposure EUR at risk (SYNTHETIC)', measure: 'exposure_eur_at_risk', unit: 'EUR',
      aggregation: 'sum', grain: 'category', dimensions: ['category_key'], filters: {}, effectiveFrom: '2026-01-01T00:00:00Z' } });
    const serve = async () => ((await metrics.serve(h.req(mOwner, 'products.metric.serve', 'MET', null, 'executive'), T(), D(), `eur-at-risk-${RUN.toLowerCase()}`, { payload: { view: 'analyst' } })) as { serving: Row }).serving;
    const s1 = await serve();
    expect(arr(s1['values']).map((x) => [x['grain_key'], Number(x['value'])])).toEqual([['supply_chain', 900_000]]);
    expect(s1).toMatchObject({ certified: false, measure: 'exposure_eur_at_risk', source_rows: 1 });
    expect(String(s1['note'])).toMatch(/UNCERTIFIED/);
    // a second version: counted only once ACCEPTED (the accepted version is the measure's, never the latest proposal)
    await assessAccept(eur, 2, assessment(500_000, 1_200_000, 'EUR'), false);
    expect((await measure('exposure')).map((x) => Number(x['value']))).toEqual([900_000]);
    const pv2 = (await ex.preview(X(riskOwner, 'prediction.exposure.read', eur), T(), D(), eur, '2')) as { preview: Row };
    await ex.accept(X(riskOwner, 'prediction.exposure.accept', eur), T(), D(), eur, '2', { payload: { digest: pv2.preview['digest'], rationale: 'the revised amounts accepted (SYNTHETIC)' } });
    expect((await measure('exposure')).map((x) => Number(x['value']))).toEqual([1_200_000]);
    const s2 = await serve();
    expect(arr(s2['values']).map((x) => Number(x['value']))).toEqual([1_200_000]);
    expect(s2['source_revision']).not.toBe(s1['source_revision']);
  }, 300_000);
});

/* ═════════════════════════════════════════ CO6 ═════════════════════════════════════════ */
describe('CO6 · the fault exercise (AT-70 "continuity response"): the source goes quiet mid-life, then recovers', () => {
  it('July determinate → August\'s source stops on the 3rd: INDETERMINATE (stale), the item ROUTED, the result never served as current → September fresh again: DETERMINATE, the item CLOSED (item.closed, the reason)', async () => {
    const key = `CO-fault${RUN}`;
    await plant(key, { window_spec: { kind: 'calendar_month', clock: 'record' }, quality: { max_staleness_days: 7 }, threshold: { target: 0.5 } });
    await items(key, [3, 8, 13, 18, 23, 28].map((d) => ({ at: day(7, d) })));
    await items(key, [1, 2, 3].map((d) => ({ at: day(8, d) })).concat([1, 2, 3].map((d) => ({ at: day(8, d), ok: false }))));
    await items(key, [3, 8, 13, 18, 23, 28].map((d) => ({ at: day(9, d) })));
    const jul = (await compute(analyst, { metricKey: key, period: '2026-07' })).result;
    expect(jul, reasons(jul)).toMatchObject({ state: 'determinate', n: 6 });
    const aug = (await compute(agent, { metricKey: key, period: '2026-08' })).result;   // the attention agent computes (AI may compute)
    expect(aug).toMatchObject({ state: 'indeterminate', value: null, n: 6 });
    expect(reasons(aug)).toMatch(/stale: .*beyond the 7 days the definition allows .*not presented as current/);
    const routed = await itemsOf(String(aug['result_id']));
    expect(routed).toHaveLength(1);
    expect(routed[0]).toMatchObject({ signal_class: 'analytics.metric', owner: owner.principalId });
    expect(routed[0]!['state']).not.toBe('closed');
    // the use stopped: no current determinate result of August exists to cite (the prelude's results list shows it indeterminate with its reasons)
    const listed = (await c.results(rq(owner, 'analytics.read', 'AMR'), T(), D(), { payload: { metricKey: key, period: '2026-08' } }) as { results: Row[] }).results;
    expect(listed.map((x) => x['state'])).toEqual(['indeterminate']);
    expect(listed[0]!['value']).toBeNull();
    const sep = (await compute(analyst, { metricKey: key, period: '2026-09' })).result;
    expect(sep, reasons(sep)).toMatchObject({ state: 'determinate' });
    expect(arr(obj(sep['after'])['closed'])).toEqual([routed[0]!['item_id']]);
    const closed = await one(sql`select state, closed_by::text by from executive.attention_items where item_id = ${routed[0]!['item_id'] as string}::uuid`);
    expect(closed).toMatchObject({ state: 'closed', by: analyst.principalId });
    const ev = await one(sql`select details from executive.attention_item_events where item_id = ${routed[0]!['item_id'] as string}::uuid and event = 'item.closed'`);
    expect(String(obj(ev['details'])['reason'])).toMatch(/^recovered: result .* \(2026-09\) of .* is determinate and passes the standing evaluation/);
    // the replay of August reproduces the indeterminate result at its own as-of
    expect((await replay(owner, String(aug['result_id']))).replay).toMatchObject({ replay_verdict: 'reproduced', state: 'indeterminate' });
  });
});
