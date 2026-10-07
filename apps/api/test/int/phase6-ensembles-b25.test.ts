/**
 * CP-6 B25 part `ensembles` (migration 0108 §EN; F-P4-02) — ENSEMBLES, DISAGREEMENT, MODEL-PATH AVAILABILITY AND THE JUDGEMENT OVERLAY,
 * on a real database through the real controllers and ports (Phase4Harness: the fixture domain, the governed backfill of a SYNTHETIC daily
 * corridor series, named humans with sessions of their own — the ports compare the acting principal).
 *
 * THE SERIES IS SYNTHETIC (phase4-helpers' syntheticValue: a weekly season, a slow trend) with a SYNTHETIC diversion wave written over it:
 * from 2023-08-01 the corridor's transits fall by 0.35/day. Cut at 2023-11-15, seasonal naive (the last week repeats: the wave has run its
 * course) and Holt-Winters (the level and trend continue: carriers keep diverting) disagree — the F-P4-02 scene's "two methods disagree
 * on the corridor forecast". No figure here is NORDWERK's or real; the scene on eye_demo is the integrator's act.
 *
 *   EN1 · THE MANAGER (L6-C04): the lifecycle admitted → running → completed with its observable ledger, attempts and budget; RETRIES (a
 *         member failing once succeeds on its second attempt); a member exhausting its attempts EXCLUDED and the run FAILED and ESCALATED
 *         (too few members); ADMISSION refusals (budget, owner, a member the plan does not hold, unknown series, the analyst at the PDP,
 *         a DUPLICATE live run); RECOVERY by RESUME from a stopped admission, and from a stopped completion.
 *   EN2 · THE ENSEMBLE FORECAST (V03-T-129): members and ensemble issued together as FCT@v2 (members coexist — the prelude's lineage
 *         supersession), every member's distribution inspectable (rows, payload, read routes), the combination rule declared and
 *         versioned (prediction.ensemble_rules() = ENSEMBLE_RULES), the combination recomputed from the stored members; the issue check
 *         refuses a forecast naming no run and a lineage change; a later ensemble supersedes the earlier one with its members.
 *   EN3 · DISAGREEMENT (V00-T-053, V03-T-326, PER-07): the port's divergence measure equals the arithmetic's; the analysis names the
 *         assumptions that split the members (the tied ASUs, who holds each) and the methods' structural ones; material disagreement is
 *         stated on the package and escalated to the owner; quantile_average@1 more precise than the members agree is REFUSED (the run
 *         failed); a completion claiming another level is refused by the port; linear_pool@1 recovers.
 *   EN4 · MODEL-PATH AVAILABILITY (V03-T-132): a plan with an unavailable, an event-kind and an unimplemented path — each EXCLUDED and
 *         DISCLOSED (excluded_models, forecast.member_excluded, the statement); a member over the member budget excluded as `budget`; a
 *         completion hiding a lost path refused; the stub router stands in for §MR's registry (SAID: synthetic plan).
 *   EN5 · THE JUDGEMENT OVERLAY (V03-T-327): N. Eriksen's labelled JUDGEMENT on the ensemble, versioned separately (the model's output
 *         untouched and restated beside it), revised (v2; v1 superseded), withdrawn, added afresh; an agent refused at the PEP and at the
 *         port, the analyst refused, a member refused, a duplicate, a stale revision, an unordered band, unknown evidence refused.
 *   EN6 · THE BOUNDARY: FORCE RLS on the five tables, the error families mapped, PUBLIC executes no §EN definer function.
 *   EN7 · B25 completion (G2, F-P4-03) THE REPLAY OF AN ENSEMBLE — the choice: its COMBINATION is recomputed from the members' STORED
 *         distributions under the declared rule (ensemble-combination@1); each member is replayed on its own. POSITIVE: the scene's ensemble and
 *         a member REPRODUCED; REFUSAL: a member row edited after issue (a stated superuser move) → the ensemble DIVERGES (member, output);
 *         RECOVERY: restored → REPRODUCED.
 *
 * Every count is scoped to this harness's tenant (the hosted run shares one database across files).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PredictionCapability } from '../../src/prediction/prediction.capabilities.js';
import { EnsemblesController } from '../../src/prediction/ensembles/ensembles.controller.js';
import { EnsemblesService } from '../../src/prediction/ensembles/ensembles.service.js';
import { EnsembleCapability } from '../../src/prediction/ensembles/ensembles.capabilities.js';
import { ENSEMBLE_RULES, combine, divergence, type Quantiles } from '../../src/prediction/ensembles/ensemble-math.js';
import { seasonalNaive } from '../../src/prediction/models/models.js';
import type { MethodPlan, MethodRouter } from '../../src/prediction/portfolio/seams.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b25-ensembles-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
/** The SYNTHETIC diversion wave: from 2023-08-01 the corridor's transits fall 0.35/day. */
const WAVE_FROM = '2023-08-01';
const wave = (date: string, v: number): number => (date < WAVE_FROM ? v : Number((v - 0.35 * ((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${WAVE_FROM}T00:00:00Z`)) / 86_400_000)).toFixed(3)));
const CUT = '2023-11-15';

let h: Phase4Harness; let su: AnyDb; let ens: EnsemblesController; let svc: EnsemblesService;
let prediction: import('../../src/prediction/prediction.controller.js').PredictionController;
let graph: import('../../src/graph/graph.controller.js').GraphController;
let eriksen: AuthenticatedPrincipal; let weber: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let agent: AuthenticatedPrincipal; let agentOwner: AuthenticatedPrincipal; let machine: AuthenticatedPrincipal; let otherOwner: AuthenticatedPrincipal;
let seriesKey = ''; let entityId = ''; let evdId = '';
let asuShared = ''; let asuPersist = ''; let asuRevert = '';
/** What the cases leave one another. */
let S: Row = {}; let overlayId = ''; let overlay2Id = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const q = (v: unknown): Quantiles => { const r = rec(v); return { q10: Number(r['q10']), q50: Number(r['q50']), q90: Number(r['q90']) }; };

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number): Promise<string> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r.message;
};

const issue = (p: AuthenticatedPrincipal, payload: Row) =>
  ens.issue(h.req(p, 'prediction.ensemble.issue', 'ENS', null), T(), D(), { payload }) as Promise<{ ensemble: Row }>;
const read = (p: AuthenticatedPrincipal, runId: string) =>
  ens.read(h.req(p, 'prediction.ensemble.read', 'ENS', runId), T(), D(), runId) as Promise<{ ensemble: Row }>;
const resume = (p: AuthenticatedPrincipal, runId: string) =>
  ens.resume(h.req(p, 'prediction.ensemble.issue', 'ENS', runId), T(), D(), runId) as Promise<{ ensemble: Row }>;
const overlayAdd = (p: AuthenticatedPrincipal, forecastId: string, payload: Row) =>
  ens.addOverlay(h.req(p, 'prediction.overlay.add', 'FCT', forecastId), T(), D(), forecastId, { payload }) as Promise<{ overlay: Row }>;
const overlayRevise = (p: AuthenticatedPrincipal, forecastId: string, id: string, payload: Row) =>
  ens.reviseOverlay(h.req(p, 'prediction.overlay.add', 'FCT', forecastId), T(), D(), forecastId, id, { payload }) as Promise<{ overlay: Row }>;
const overlayWithdraw = (p: AuthenticatedPrincipal, forecastId: string, id: string, reason: string) =>
  ens.withdrawOverlay(h.req(p, 'prediction.overlay.withdraw', 'FCT', forecastId), T(), D(), forecastId, id, { payload: { reason } }) as Promise<{ overlay: Row }>;
const overlayList = (p: AuthenticatedPrincipal, forecastId: string) =>
  ens.listOverlays(h.req(p, 'prediction.read', 'FCT', forecastId), T(), D(), forecastId) as Promise<Row>;

const scenePayload = (over: Row = {}): Row => ({
  seriesKey, horizon: '30d', observedThrough: CUT, assumptions: [asuShared],
  members: [{ methodRef: 'seasonal_naive@1', assumptions: [asuPersist] }, { methodRef: 'holt_winters@1', assumptions: [asuRevert] }], ...over,
});
const runRow = async (runId: string): Promise<Row> => (await sql<Row>`select * from prediction.ensemble_runs where run_id = ${runId}::uuid`.execute(su)).rows[0] ?? {};
const runEvents = async (runId: string): Promise<string[]> =>
  (await sql<{ event: string }>`select event from prediction.ensemble_events where run_id = ${runId}::uuid order by occurred_at, event_id`.execute(su)).rows.map((r) => r.event);
const liveRun = async (horizon: string): Promise<Row | undefined> =>
  (await sql<Row>`select * from prediction.ensemble_runs where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and horizon_code = ${horizon} and state in ('admitted', 'running')`.execute(su)).rows[0];
const latestRun = async (horizon: string): Promise<Row> =>
  (await sql<Row>`select * from prediction.ensemble_runs where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and horizon_code = ${horizon} order by admitted_at desc limit 1`.execute(su)).rows[0] ?? {};
const classAvailable = async (): Promise<boolean> =>
  (await sql<{ ok: boolean }>`select 'forecast.disagreement' = any(executive.attention_signal_classes()) as ok`.execute(su)).rows[0]?.ok === true;

/** A stub METHOD_ROUTER standing in for §MR's registry (a SYNTHETIC plan): the legacy pair plus the paths the case names. */
const stubRouter = (extra: MethodPlan['methods'], run?: (a: { methodRef: string; points: Array<{ date: string; value: number }>; steps: number; season: number }) => ReturnType<typeof seasonalNaive>): MethodRouter => {
  const r: MethodRouter & { run?: unknown } = {
    async plan(_tx, a) {
      const m = (ref: string) => ({ methodRef: ref, family: 'statistical', forecastKind: 'quantity' as const, available: true, confidenceLanguage: 'distribution' });
      return { targetKey: a.targetKey, horizonCode: a.horizonCode, policy: { policyId: null, version: null, horizonRule: null }, methods: [m('seasonal_naive@1'), m('holt_winters@1'), ...extra] };
    },
  };
  if (run !== undefined) r.run = run;
  return r;
};
const withRouter = async <X>(router: MethodRouter, fn: () => Promise<X>): Promise<X> => {
  const holder = svc as unknown as { router: MethodRouter };
  const prior = holder.router; holder.router = router;
  try { return await fn(); } finally { holder.router = prior; }
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su as AnyDb;
  ens = h.app.get(EnsemblesController); svc = h.app.get(EnsemblesService);
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  prediction = h.app.get(Pc); graph = h.app.get(Gc);
  eriksen = await h.humanWithSession(['forecast_owner'], 'n-eriksen');
  otherOwner = await h.humanWithSession(['forecast_owner'], 'owner-2');
  weber = await h.principalWith(['strategy_owner'], 'j-weber');
  analyst = await h.principalWith(['domain_analyst'], 'a-hoffmann');
  dadmin = await h.humanWithSession(['domain_admin'], 'domain-admin');
  // integrated (0108 §0.4b): forecast.disagreement is routed under the domain's published attention policy — the administrator publishes it
  { const { ExecutiveController: Ex } = await import('../../src/executive/executive.controller.js');
    await h.app.get(Ex).publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: {
      reason: 'ensemble disagreements routed to the forecast owner (B25 ensembles harness)',
      rules: { classes: { 'forecast.disagreement': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['forecast_owner'], ack_within_minutes: 4320 } } } } } as never); }
  // THE FORECAST AGENT: an agent principal (AI may run an ensemble; it never authors a judgement)
  const fa = await h.humanWithSession(['forecast_agent'], 'fc-agent');
  agent = { ...fa, kind: 'agent', assurance: 'agent_grant' };
  // an agent that even holds forecast_owner: the PDP's role passes, the PEP's human gate refuses it
  const fo = await h.humanWithSession(['forecast_owner'], 'agent-fo');
  agentOwner = { ...fo, kind: 'agent', assurance: 'agent_grant' };
  // A MACHINE principal of kind 'agent' in the database holding forecast_owner, whose session claims a human: the PEP's gate passes, the PORT refuses
  const mid = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${mid}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`fixture-machine-${mid.slice(-8)}`}, ${`fx-mach-${mid.slice(-8)}`}, 'active')`.execute(su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${mid}::uuid, 'forecast_owner', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(su);
  machine = await h.openSession({ ...eriksen, principalId: mid, kind: 'human', assurance: 'password', bindings: [{ roleCode: 'forecast_owner', scope: 'DOMAIN', tenantId: T(), domainId: D() }] });

  // the SYNTHETIC corridor history, through the governed backfill
  const sv = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress(() => wave).egress }));
  expect(r.state, r.reason).toBe('finished');
  evdId = (await sql<{ id: string }>`select object_id::text id from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at limit 1`.execute(su)).rows[0]!.id;
  entityId = uuidv7(); const ec = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${weber.principalId}::uuid, ${ec}::uuid)`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${entityId}::uuid, 'entity.created', ${weber.principalId}::uuid, ${JSON.stringify({ entity_type: 'place', canonical_name: 'Bab el-Mandeb Strait', normalized_name: 'bab el-mandeb strait', split_from: null })}::jsonb, ${ec}::uuid)`.execute(su);
  const asu = async (title: string, statement: string): Promise<string> => ((await graph.declare(h.req(weber, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(),
    { payload: { objectType: 'ASU', title, statement, restsOn: [{ kind: 'entity', id: entityId, rationale: 'the assumption is about this strait' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
  asuShared = await asu('The corridor series is read as published (SYNTHETIC)', 'the transit counts are taken as the publisher reported them');
  asuPersist = await asu('The diversion wave has run its course', 'carriers have finished re-routing; the last week repeats');
  asuRevert = await asu('Carriers keep diverting at the recent pace', 'the decline of the last quarter continues through the horizon');
  seriesKey = `fixture:${sv.sourceKey}:value`;
  await prediction.registerSeries(h.req(eriksen, 'prediction.series.register', 'SER', null), T(), D(),
    { payload: { seriesKey, sourceKey: sv.sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7,
                 subjectEntityId: entityId, attribution: 'Source: fixture statistics.', description: 'SYNTHETIC daily corridor transits with a diversion wave' } });
}, 600_000);

afterAll(async () => { await h?.close(); });

describe('EN1–EN3 · the scene: two methods disagree on the corridor forecast', () => {
  it('POSITIVE · N. Eriksen issues the ensemble: both distributions, the ensemble, the assumption that splits them (admitted → running → completed)', async () => {
    const out = (await issue(eriksen, scenePayload())).ensemble;
    S = out;
    const run = rec(out['run']);
    expect(run['state']).toBe('completed');
    expect(run['combination_rule']).toBe('linear_pool@1');
    expect(run['owner_principal_id']).toBe(eriksen.principalId);
    expect(rec(run['budget'])).toEqual({ members: 6, attempts: 2, compute_ms: 30000 });
    // the observable lifecycle, in order
    expect(await runEvents(String(run['run_id']))).toEqual(expect.arrayContaining(['ensemble.admitted', 'ensemble.started', 'ensemble.member_issued', 'ensemble.completed']));
    const ev = await runEvents(String(run['run_id']));
    expect(ev[0]).toBe('ensemble.admitted'); expect(ev[1]).toBe('ensemble.started');
    expect(ev.filter((e) => e === 'ensemble.member_issued')).toHaveLength(2);
    expect(ev.indexOf('ensemble.completed')).toBeGreaterThan(ev.lastIndexOf('ensemble.member_issued'));
    // both members issued, each its own distribution; attempts recorded
    const members = arr(out['members']);
    expect(members.map((m) => [m['method_ref'], m['state'], m['attempts']])).toEqual([['seasonal_naive@1', 'issued', 1], ['holt_winters@1', 'issued', 1]]);
    expect(arr(out['attempts']).map((a) => [a['method_ref'], a['attempt'], a['outcome']])).toEqual([['seasonal_naive@1', 1, 'succeeded'], ['holt_winters@1', 1, 'succeeded']]);
    const sn = q(members[0]?.['quantiles']); const hw = q(members[1]?.['quantiles']);
    console.log('B25 EN SCENE', JSON.stringify({ sn, hw, ensemble: rec(out['ensemble'])['quantiles'], disagreement: rec(run['disagreement'])['level'], max: rec(run['disagreement'])['max_gap_ratio'] }));
    expect(members[0]?.['method']).toBe('seasonal-naive'); expect(members[1]?.['method']).toBe('holt-winters-additive');
    // each member tied to its assumption set (the shared one and its own)
    expect(arr(members[0]?.['tied_assumptions'])).toEqual([asuPersist]); expect(arr(members[1]?.['tied_assumptions'])).toEqual([asuRevert]);
    expect([...arr(members[0]?.['assumptions'])].sort()).toEqual([asuShared, asuPersist].sort());
    // the ensemble forecast: its own row, lineage to itself, members naming it, all three issued side by side
    const e = rec(out['ensemble']);
    expect(e['ensemble_role']).toBe('ensemble'); expect(e['ensemble_id']).toBe(e['forecast_id']); expect(e['state']).toBe('issued');
    expect(e['method']).toBe('ensemble-linear-pool'); expect(e['method_ref']).toBe('ensemble:linear_pool@1'); expect(e['forecast_kind']).toBe('quantity');
    const rows = (await sql<Row>`select forecast_id::text, ensemble_role, ensemble_id::text, state, method_ref from prediction.forecasts_current where ensemble_id = ${String(e['forecast_id'])}::uuid order by ensemble_role, method_ref`.execute(su)).rows;
    expect(rows.map((r) => [r['ensemble_role'], r['state'], r['method_ref']])).toEqual([['ensemble', 'issued', 'ensemble:linear_pool@1'], ['member', 'issued', 'holt_winters@1'], ['member', 'issued', 'seasonal_naive@1']]);
    // the combination, recomputed from the members AS STORED, under the declared rule and the recorded weights
    const weights = members.map((m) => Number(m['weight']));
    expect(weights).toEqual([0.5, 0.5]);
    const c = combine('linear_pool@1', [sn, hw], weights);
    const eq = q(e['quantiles']);
    expect(Math.abs(eq.q10 - c.q10)).toBeLessThan(1e-3); expect(Math.abs(eq.q50 - c.q50)).toBeLessThan(1e-3); expect(Math.abs(eq.q90 - c.q90)).toBeLessThan(1e-3);
    // THE DISAGREEMENT: the port's measure = the arithmetic's; the members disagree (the scene)
    const d = rec(run['disagreement']);
    const div = divergence([{ ordinal: 1, ...sn }, { ordinal: 2, ...hw }]);
    expect(d['level']).toBe(div.level); expect(Number(d['max_gap_ratio'])).toBe(div.max_gap_ratio); expect(d['measured_by']).toBe('port');
    expect(div.level).not.toBe('agree');
    expect(Math.abs(sn.q50 - hw.q50)).toBeGreaterThan(3);
    // THE ASSUMPTION THAT SPLITS THEM, named with who holds it; the methods' structural assumptions beside
    const analysis = rec(d['analysis']);
    expect(arr(analysis['splitting_assumptions']).map((s) => [s['assumption_id'], s['title'], arr(s['held_by'])])).toEqual([
      [asuPersist, 'The diversion wave has run its course', ['seasonal_naive@1']],
      [asuRevert, 'Carriers keep diverting at the recent pace', ['holt_winters@1']],
    ]);
    expect(arr(analysis['structural']).map((s) => s['method_ref'])).toEqual(['seasonal_naive@1', 'holt_winters@1']);
    // the package STATES it (never hidden — PER-07)
    expect(String(e['statement'])).toMatch(/ENSEMBLE of 2 member\(s\) \(seasonal_naive@1, holt_winters@1\) under linear_pool@1, equal weights/);
    expect(String(e['statement'])).toMatch(/The members DISAGREE/);
    expect(String(e['statement'])).toMatch(/"The diversion wave has run its course" \(held by seasonal_naive@1\) vs "Carriers keep diverting at the recent pace" \(held by holt_winters@1\)/);
    expect(String(e['statement'])).toMatch(/No planned method path was lost\./);
    expect(String(e['statement'])).toMatch(/no accuracy is claimed for the combination/);
    expect(['unvalidated', 'validation_impossible']).toContain(e['validation_state']);
    // the FCT@v2 payload carries the inspectable members, the combination, the disagreement and the excluded models
    const obj = (await sql<{ schema_ref: string; payload: Row }>`select schema_ref, payload from objects.canonical_objects where object_type = 'FCT' and object_id = ${String(e['forecast_id'])}::uuid`.execute(su)).rows[0]!;
    expect(obj.schema_ref).toBe('FCT@v2');
    const ensSec = rec(obj.payload['ensemble']);
    expect(rec(ensSec['combination'])['rule']).toBe('linear_pool@1');
    expect(rec(ensSec['combination'])['statement']).toBe(ENSEMBLE_RULES['linear_pool@1'].statement);
    expect(arr(ensSec['members']).map((m) => [m['method_ref'], q(m['distribution'])])).toEqual([['seasonal_naive@1', sn], ['holt_winters@1', hw]]);
    expect(obj.payload['excluded_models']).toEqual([]);
    expect(rec(obj.payload['disagreement'])['level']).toBe(div.level);
    // the forecast's own events: issued, ensembled (members, weights, level)
    const fev = (await sql<{ event: string; details: Row }>`select event, details from prediction.forecast_events where forecast_id = ${String(e['forecast_id'])}::uuid order by occurred_at`.execute(su)).rows;
    // integrated: §CX's freezer grounds the ensemble (its information set frozen and pinned) before the issue
    expect(fev.map((x) => x.event)).toEqual(['forecast.information_set_frozen', 'forecast.issued', 'forecast.ensembled']);
    expect(rec(fev.find((x) => x.event === 'forecast.ensembled')?.details)['disagreement']).toBe(div.level);
    // material disagreement is ESCALATED to the forecast owner (the attention item when the vocabulary carries forecast.disagreement; the ledger always)
    if (div.level === 'material') {
      expect(ev).toContain('ensemble.escalated');
      const esc = rec(run['escalation']);
      expect(esc['to']).toBe(eriksen.principalId);
      const cls = await classAvailable();
      expect(esc['channel']).toBe(cls ? 'attention_item' : 'event');
      expect(run['attention_item_id'] === null).toBe(!cls);
      if (cls) {   // integrated: the escalation item is ROUTED UNDER THE PUBLISHED POLICY (the harness's policy names forecast.disagreement → forecast_owner)
        const item = (await sql<Row>`select state, outcome, owner_principal_id::text as owner, route_roles, policy_version from executive.attention_items where item_id = ${String(run['attention_item_id'])}::uuid`.execute(su)).rows[0] ?? {};
        expect(item).toMatchObject({ state: 'open', outcome: 'material', owner: eriksen.principalId, route_roles: ['forecast_owner'] });
        expect(item['policy_version']).not.toBeNull();
      }
    }
  });

  it('POSITIVE · the reads: the members, the disagreement, the list — the analyst reads (audited), never writes', async () => {
    const runId = String(rec(S['run'])['run_id']);
    const m = await ens.members(h.req(analyst, 'prediction.ensemble.read', 'ENS', runId), T(), D(), runId) as Row;
    expect(arr(m['members']).map((x) => rec(x['ensemble'])['role'])).toEqual(['member', 'member']);
    expect(arr(m['members']).map((x) => rec(x['ensemble'])['ensemble_forecast_id'])).toEqual([rec(S['run'])['ensemble_forecast_id'], rec(S['run'])['ensemble_forecast_id']]);
    const d = await ens.disagreement(h.req(analyst, 'prediction.ensemble.read', 'ENS', runId), T(), D(), runId) as Row;
    expect(rec(d['measured'])['level']).toBe(rec(rec(S['run'])['disagreement'])['level']);
    expect(rec(d['rules'])['material_gap']).toBe(0.5);
    const l = await ens.list(h.req(analyst, 'prediction.ensemble.read', 'ENS', null), T(), D(), { payload: {} }) as Row;
    expect(arr(l['runs']).some((r) => r['run_id'] === runId && r['included'] === 2 && r['excluded'] === 0)).toBe(true);
    await refused(issue(analyst, scenePayload({ horizon: '90d' })), /.*/, 403);
  });

  it('REFUSAL · PER-07: quantile_average@1 is more precise than the members agree — refused; the run FAILED and escalated', async () => {
    const msg = await refused(issue(eriksen, scenePayload({ combination: 'quantile_average@1' })), /^ensemble rejected \(precision\): quantile_average@1 gives a 10–90 band .* that excludes the median of/, 422);
    const runId = /run ([0-9a-f-]{36}) FAILED/.exec(msg)?.[1] as string;
    const r = await runRow(runId);
    expect(r['state']).toBe('failed'); expect(String(r['state_reason'])).toMatch(/^precision: /);
    expect(await runEvents(runId)).toEqual(expect.arrayContaining(['ensemble.admitted', 'ensemble.member_excluded', 'ensemble.escalated', 'ensemble.failed']));
    // nothing was issued under it; both members disclosed as computed but not combined
    expect((await sql`select 1 from prediction.forecasts_current where ensemble_id = ${String(r['ensemble_forecast_id'])}::uuid`.execute(su)).rows).toHaveLength(0);
    const ms = (await sql<Row>`select method_ref, state, exclusion_class from prediction.ensemble_members where run_id = ${runId}::uuid order by ordinal`.execute(su)).rows;
    expect(ms.map((x) => [x['method_ref'], x['state'], x['exclusion_class']])).toEqual([['seasonal_naive@1', 'excluded', 'not_combined'], ['holt_winters@1', 'excluded', 'not_combined']]);
    // the scene's ensemble still stands
    expect((await sql<{ state: string }>`select state from prediction.forecasts_current where forecast_id = ${String(rec(S['run'])['ensemble_forecast_id'])}::uuid`.execute(su)).rows[0]?.state).toBe('issued');
  });

  it('REFUSAL · the issue check: a forecast naming no run, and a lineage change, are refused', async () => {
    const fid = uuidv7(); const ghost = uuidv7();
    await refused(h.pipeline.write(h.env(eriksen, 'prediction.forecast.issue', 'FCT', fid, 'prediction'), eriksen,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.forecast.issue', objectType: 'FCT', objectId: fid }, PredictionCapability.forecast,
      async (cap) => {
        await cap.issueForecast({ forecastId: fid, tenantId: T(), domainId: D(), seriesKey, subjectEntityId: entityId, horizonCode: '30d', horizonDays: 30, originAt: CUT, knownAt: new Date().toISOString(),
          targetAt: '2023-12-15', method: 'seasonal-naive', methodVersion: '1', baselineMethod: 'seasonal-naive', quantiles: { q10: 1, q50: 2, q90: 3 }, path: [], drivers: [{ series_key: seriesKey, role: 'x', evidence_object_id: evdId }],
          assumptions: [asuShared], evidenceRefs: [{ evidence_object_id: evdId, evidence_version: 1, evidence_digest: 'x' }], refreshCadence: 'daily', validationState: 'unvalidated', validationNote: 'n',
          label: 'replay demonstration', skill: null, statement: 'a member of no ensemble', backtestId: null, controls: {}, actor: eriksen.principalId, eventId: uuidv7(), correlationId: uuidv7(),
          extras: { ensemble_id: ghost, ensemble_role: 'member', method_ref: 'seasonal_naive@1' } });
        return { result: null, targetType: 'FCT', targetId: fid, targetVersion: '1', outboxEvent: null };
      }), /^ensemble rejected \(unknown_run\): forecast .* names ensemble .* — no ensemble run of this domain issues it/, 404);
    const member = arr(S['members'])[0]?.['forecast_id'] as string;
    await refused(sql`update prediction.forecasts_current set ensemble_role = null, ensemble_id = null where forecast_id = ${member}::uuid`.execute(su),
      /^ensemble rejected \(state\): forecast .* its ensemble lineage is fixed at issue/, 409);
  });
});

describe('EN5 · the judgement overlay: labelled, versioned separately, human-only, withdrawable', () => {
  const ensembleId = (): string => String(rec(S['run'])['ensemble_forecast_id']);
  const adj = (): Row => { const e = q(rec(S['ensemble'])['quantiles']); return { kind: 'quantiles', q10: Number((e.q10 - 2).toFixed(2)), q50: Number((e.q50 - 1).toFixed(2)), q90: Number(e.q90.toFixed(2)) }; };
  const evidence = (): Row[] => [{ kind: 'strategy', id: asuRevert }, { kind: 'evidence', id: evdId }];

  it('POSITIVE · N. Eriksen adds a labelled JUDGEMENT on the ensemble; the model output is untouched and readable beside it', async () => {
    const before = (await sql<{ quantiles: Row; statement: string }>`select quantiles, statement from prediction.forecasts_current where forecast_id = ${ensembleId()}::uuid`.execute(su)).rows[0]!;
    const o = (await overlayAdd(eriksen, ensembleId(), { adjustment: adj(), rationale: 'Port-call notices for the next fortnight show further diversions announced (SYNTHETIC)', evidence: evidence() })).overlay;
    overlayId = String(o['overlay_id']);
    expect(o).toMatchObject({ version: 1, label: 'JUDGEMENT', state: 'active', author_principal_id: eriksen.principalId, forecast_kind: 'quantity' });
    expect(rec(o['model_distribution'])).toMatchObject({ label: 'MODEL OUTPUT', ensemble_role: 'ensemble', quantiles: before.quantiles });
    const after = (await sql<{ quantiles: Row; statement: string }>`select quantiles, statement from prediction.forecasts_current where forecast_id = ${ensembleId()}::uuid`.execute(su)).rows[0]!;
    expect(after).toEqual(before);   // versioned SEPARATELY: the model's own distribution is never changed by a judgement
    const list = await overlayList(analyst, ensembleId());
    expect(rec(list['model'])).toMatchObject({ label: 'MODEL OUTPUT', quantiles: before.quantiles });
    expect(rec(list['standing'])).toMatchObject({ label: 'JUDGEMENT', version: 1, overlay_id: overlayId });
    const pkg = (await read(analyst, String(rec(S['run'])['run_id']))).ensemble;
    expect(rec(pkg['standing_overlay'])['label']).toBe('JUDGEMENT');
    expect(rec(pkg['ensemble'])['label_kind']).toBe('MODEL OUTPUT');
    const fev = (await sql<{ event: string; details: Row }>`select event, details from prediction.forecast_events where forecast_id = ${ensembleId()}::uuid and event like 'forecast.overlay%' order by occurred_at`.execute(su)).rows;
    expect(fev.map((x) => [x.event, x.details['version'], x.details['label']])).toEqual([['forecast.overlay_added', 1, 'JUDGEMENT']]);
  });

  it('REFUSAL · an agent (at the PEP and at the port), the analyst, a member, a duplicate, an unordered band, unknown evidence', async () => {
    const p = { adjustment: adj(), rationale: 'an agent drafting a judgement on its own', evidence: evidence() };
    const pep = await refusal(overlayAdd(agentOwner, ensembleId(), p));
    expect(pep.status).toBe(403); expect(pep.code).toBe('EYE-WFL-002');
    expect(pep.message).toMatch(/human gate: prediction.overlay.add requires a named human principal/);
    const pdp = await refusal(overlayAdd(agent, ensembleId(), p));
    expect(pdp.status).toBe(403); expect(pdp.code).toBe('EYE-AUT-001');
    await refused(overlayAdd(machine, ensembleId(), p), /^judgement overlay rejected \(actor\): a judgement overlay is a named human's act; an agent or a system principal never authors or withdraws one/, 403);
    await refused(overlayAdd(analyst, ensembleId(), p), /.*/, 403);
    await refused(overlayAdd(eriksen, String(arr(S['members'])[0]?.['forecast_id']), p), /^judgement overlay rejected \(target\): forecast .* is an ensemble member/, 422);
    await refused(overlayAdd(otherOwner, ensembleId(), p), /^judgement overlay rejected \(duplicate\): overlay .* stands on forecast .*; it is revised, not doubled/, 409);
    // the shape checks: through a revision of the standing overlay (each refused before any version is written)
    await refused(overlayRevise(eriksen, ensembleId(), overlayId, { ...p, expectedVersion: 1, adjustment: { kind: 'quantiles', q10: 5, q50: 3, q90: 9 } }), /^judgement overlay rejected \(adjustment\): the quantiles are numbers with q10 ≤ q50 ≤ q90/, 422);
    await refused(overlayRevise(eriksen, ensembleId(), overlayId, { ...p, expectedVersion: 1, adjustment: { kind: 'probability', p: 0.4 } }), /^judgement overlay rejected \(adjustment\): a quantity forecast is adjusted by its quantiles/, 422);
    await refused(overlayRevise(eriksen, ensembleId(), overlayId, { ...p, expectedVersion: 1, evidence: [{ kind: 'evidence', id: uuidv7() }] }), /^judgement overlay rejected \(unknown_evidence\): evidence .* is not in this domain/, 404);
    await refused(overlayWithdraw(analyst, ensembleId(), overlayId, 'the analyst tries to withdraw'), /.*/, 403);
  });

  it('RECOVERY · revised (v2; v1 superseded, never edited), a stale revision refused, withdrawn by the owner, added afresh', async () => {
    const v2 = (await overlayRevise(eriksen, ensembleId(), overlayId, { expectedVersion: 1, adjustment: adj(), rationale: 'The carrier announcements were confirmed by two more lines (SYNTHETIC)', evidence: evidence() })).overlay;
    expect(v2).toMatchObject({ version: 2, revises_version: 1, state: 'active', label: 'JUDGEMENT' });
    const v1 = (await sql<Row>`select state, superseded_at from prediction.judgement_overlays where overlay_id = ${overlayId}::uuid and version = 1`.execute(su)).rows[0]!;
    expect(v1['state']).toBe('superseded'); expect(v1['superseded_at']).not.toBeNull();
    await refused(overlayRevise(otherOwner, ensembleId(), overlayId, { expectedVersion: 1, adjustment: adj(), rationale: 'a revision of a version no longer standing', evidence: evidence() }),
      /^judgement overlay rejected \(stale\): overlay .* stands at version 2, not 1/, 409);
    await refused(sql`update prediction.judgement_overlays set rationale = 'edited in place, which is never allowed' where overlay_id = ${overlayId}::uuid and version = 2`.execute(su),
      /^judgement overlay rejected \(state\): overlay .* a judgement is revised as a new version, never edited/, 409);
    const w = (await overlayWithdraw(dadmin, ensembleId(), overlayId, 'withdrawn: the announcements were retracted (SYNTHETIC)')).overlay;
    expect(w).toMatchObject({ version: 2, state: 'withdrawn', withdrawn_by: dadmin.principalId });
    await refused(overlayWithdraw(eriksen, ensembleId(), overlayId, 'withdrawing a withdrawn judgement'), /^judgement overlay rejected \(state\): overlay .* is withdrawn/, 409);
    await refused(overlayRevise(eriksen, ensembleId(), overlayId, { expectedVersion: 2, adjustment: adj(), rationale: 'reviving a withdrawn judgement by revision', evidence: evidence() }),
      /^judgement overlay rejected \(state\): overlay .* is withdrawn \(version 2\); a withdrawn judgement is added afresh/, 409);
    const fresh = (await overlayAdd(eriksen, ensembleId(), { adjustment: adj(), rationale: 'A fresh judgement after the retraction (SYNTHETIC evidence)', evidence: evidence() })).overlay;
    overlay2Id = String(fresh['overlay_id']);
    expect(overlay2Id).not.toBe(overlayId); expect(fresh).toMatchObject({ version: 1, state: 'active' });
    const fev = (await sql<{ event: string }>`select event from prediction.forecast_events where forecast_id = ${ensembleId()}::uuid and event like 'forecast.overlay%' order by occurred_at`.execute(su)).rows.map((x) => x.event);
    expect(fev).toEqual(['forecast.overlay_added', 'forecast.overlay_added', 'forecast.overlay_withdrawn', 'forecast.overlay_added']);
    const list = await overlayList(eriksen, ensembleId());
    expect(arr(list['overlays']).map((o) => [o['overlay_id'] === overlayId ? 'first' : 'fresh', o['version'], o['state']])).toEqual(
      [['fresh', 1, 'active'], ['first', 2, 'withdrawn'], ['first', 1, 'superseded']]);
  });
});

describe('EN1 · the manager: admission, retries, budgets, failure, escalation, resume', () => {
  it('REFUSAL · admission: the budget, the owner, a member the plan does not hold, an unknown series, an unknown assumption', async () => {
    await refused(issue(eriksen, scenePayload({ horizon: '90d', budget: { members: 20 } })), /^ensemble rejected \(budget\): members 2–12/, 422);
    await refused(issue(eriksen, scenePayload({ horizon: '90d', owner: analyst.principalId })), /^ensemble rejected \(owner\): the run's owner .* is a named, active human holding forecast_owner/, 422);
    await refused(issue(eriksen, scenePayload({ horizon: '90d', members: [{ methodRef: 'causal_its@1', assumptions: [] }] })), /^ensemble rejected \(plan\): causal_its@1 is not in the router's plan/, 422);
    await refused(issue(eriksen, scenePayload({ horizon: '90d', seriesKey: 'fixture:no-such:series' })), /^(ensemble|forecast) rejected \(unknown_series\)/, 404);   // integrated: §MR's router refuses the unknown series first (its governed 404)
    await refused(issue(eriksen, scenePayload({ horizon: '90d', assumptions: [uuidv7()] })), /^(ensemble|information set) rejected \(unknown_assumption\)/, 404);
    expect(await liveRun('90d')).toBeUndefined();
  });

  it('POSITIVE · RETRIES: a member failing once succeeds on its second attempt (both attempts recorded)', async () => {
    const original = svc.computeMember.bind(svc);
    let failed = false;
    const spy = vi.spyOn(svc, 'computeMember').mockImplementation(async (ref, points, steps, season) => {
      if (ref === 'holt_winters@1' && !failed) { failed = true; throw new Error('transient: the model worker was unavailable (harness)'); }
      return original(ref, points, steps, season);
    });
    let out: Row;
    try { out = (await issue(eriksen, scenePayload({ horizon: '90d' }))).ensemble; } finally { spy.mockRestore(); }
    expect(rec(out['run'])['state']).toBe('completed');
    expect(arr(out['attempts']).map((a) => [a['method_ref'], a['attempt'], a['outcome']])).toEqual([
      ['seasonal_naive@1', 1, 'succeeded'], ['holt_winters@1', 1, 'failed'], ['holt_winters@1', 2, 'succeeded']]);
    expect(arr(out['attempts'])[1]?.['error']).toMatch(/transient/);
    expect(arr(out['members']).map((m) => m['attempts'])).toEqual([1, 2]);
  });

  it('REFUSAL → FAILURE · a member exhausting its attempts is EXCLUDED; too few members: the run FAILS and is escalated', async () => {
    const spy = vi.spyOn(svc, 'computeMember').mockImplementation(async (ref) => { throw new Error(`${ref}: the model worker is down (harness)`); });
    let out: Row;
    try { out = (await issue(eriksen, scenePayload({ horizon: '90d', budget: { attempts: 2 } }))).ensemble; } finally { spy.mockRestore(); }
    const run = rec(out['run']);
    expect(run['state']).toBe('failed');
    expect(String(run['state_reason'])).toMatch(/0 of 2 planned member\(s\) available; an ensemble combines at least 2/);
    expect(arr(out['members']).map((m) => [m['state'], m['exclusion_class'], m['attempts']])).toEqual([['excluded', 'failed', 2], ['excluded', 'failed', 2]]);
    expect(arr(out['attempts'])).toHaveLength(4);
    const esc = rec(run['escalation']);
    expect(esc['to']).toBe(eriksen.principalId); expect(String(esc['reason'])).toMatch(/^failed: /);
    expect(await runEvents(String(run['run_id']))).toEqual(['ensemble.admitted', 'ensemble.member_excluded', 'ensemble.member_excluded', 'ensemble.escalated', 'ensemble.failed']);
    // a failed run is final: resume refused; nothing issued
    await refused(resume(eriksen, String(run['run_id'])), /^ensemble rejected \(state\): run .* is failed; a finished run is not resumed/, 409);
    expect(rec(out['ensemble'] ?? null)).toEqual({});
  });

  it('FAILURE · no history to fit: every member NOT RUN, disclosed', async () => {
    const out = (await issue(eriksen, scenePayload({ horizon: '180d', observedThrough: '2021-01-03' }))).ensemble;
    expect(rec(out['run'])['state']).toBe('failed');
    expect(String(rec(out['run'])['state_reason'])).toMatch(/observation\(s\) known at .*; a member needs at least 8/);
    expect(arr(out['members']).map((m) => [m['exclusion_class'], m['attempts']])).toEqual([['not_run', 0], ['not_run', 0]]);
  });

  it('RECOVERY · a stopped admission: the DUPLICATE refused while it is live, then RESUMED to completion; resume of a completed run refused', async () => {
    const spy = vi.spyOn(svc as unknown as { issueAll: () => Promise<Row> }, 'issueAll').mockRejectedValueOnce(new Error('the process stopped (harness)'));
    try { await expect(issue(eriksen, scenePayload({ horizon: '180d' }))).rejects.toThrow(/the process stopped/); } finally { spy.mockRestore(); }
    const live = await liveRun('180d');
    expect(live?.['state']).toBe('admitted');
    const runId = String(live?.['run_id']);
    await refused(issue(otherOwner, scenePayload({ horizon: '180d' })), /^ensemble rejected \(duplicate\): run .* is admitted for this question/, 409);
    await refused(resume(analyst, runId), /.*/, 403);
    await refused(resume(otherOwner, runId), /^ensemble rejected \(ownership\): run .* is resumed by its owner, its admitter or the domain's administrator/, 403);
    const out = (await resume(eriksen, runId)).ensemble;
    expect(rec(out['run'])['state']).toBe('completed');
    expect(await runEvents(runId)).toEqual(expect.arrayContaining(['ensemble.admitted', 'ensemble.resumed', 'ensemble.started', 'ensemble.completed']));
    expect(arr(out['members']).every((m) => m['state'] === 'issued')).toBe(true);
    await refused(resume(eriksen, runId), /^ensemble rejected \(state\): run .* is completed/, 409);
  });
});

describe('EN4 · model-path availability: excluded and DISCLOSED (a SYNTHETIC plan stands in for §MR\'s registry)', () => {
  it('POSITIVE · an unavailable path, an event-kind path and an unimplemented path are excluded, each with its reason, on the package', async () => {
    const extra: MethodPlan['methods'] = [
      { methodRef: 'bayes_normal@1', family: 'bayesian', forecastKind: 'quantity', available: false, unavailableReason: 'quarantined: its last three runs failed (SYNTHETIC)', confidenceLanguage: 'distribution' },
      { methodRef: 'event_beta_binomial@1', family: 'event', forecastKind: 'event', available: true, confidenceLanguage: 'probability' },
      { methodRef: 'causal_its@1', family: 'causal', forecastKind: 'quantity', available: true, confidenceLanguage: 'distribution' },
    ];
    const out = (await withRouter(stubRouter(extra), () => issue(eriksen, scenePayload({ horizon: '90d' })))).ensemble;
    const run = rec(out['run']);
    expect(run['state']).toBe('completed');
    expect(arr(out['members']).map((m) => [m['method_ref'], m['state'], m['exclusion_class']])).toEqual([
      ['seasonal_naive@1', 'issued', null], ['holt_winters@1', 'issued', null],
      ['bayes_normal@1', 'excluded', 'unavailable'], ['event_beta_binomial@1', 'excluded', 'kind'], ['causal_its@1', 'excluded', 'unimplemented']]);
    const ex = arr(out['excluded_models']);
    expect(ex.map((x) => [x['method_ref'], x['class']])).toEqual([['bayes_normal@1', 'unavailable'], ['event_beta_binomial@1', 'kind'], ['causal_its@1', 'unimplemented']]);
    expect(String(ex[0]?.['reason'])).toMatch(/quarantined: its last three runs failed/);
    const e = rec(out['ensemble']);
    expect(String(e['statement'])).toMatch(/3 planned method path\(s\) EXCLUDED and not in this ensemble: bayes_normal@1 \(unavailable: .*\); event_beta_binomial@1 \(kind: .*\); causal_its@1 \(unimplemented: .*\)/);
    const fev = (await sql<{ details: Row }>`select details from prediction.forecast_events where forecast_id = ${String(e['forecast_id'])}::uuid and event = 'forecast.member_excluded' order by occurred_at`.execute(su)).rows;
    expect(fev.map((x) => x.details['method_ref'])).toEqual(['bayes_normal@1', 'event_beta_binomial@1', 'causal_its@1']);
    expect(rec(rec(out['run'])['outcome'])['included']).toBe(2);
  });

  it('POSITIVE · the member BUDGET: a third runnable member beyond the budget is excluded as budget (the router runs a registry method)', async () => {
    const extra: MethodPlan['methods'] = [{ methodRef: 'causal_its@1', family: 'causal', forecastKind: 'quantity', available: true, confidenceLanguage: 'distribution' }];
    const runner = (a: { points: Array<{ date: string; value: number }>; steps: number; season: number }) => seasonalNaive(a.points, a.steps, a.season);
    const out = (await withRouter(stubRouter(extra, runner as never), () => issue(eriksen, scenePayload({ horizon: '180d', budget: { members: 2 } })))).ensemble;
    expect(arr(out['members']).map((m) => [m['method_ref'], m['state'], m['exclusion_class']])).toEqual([
      ['seasonal_naive@1', 'issued', null], ['holt_winters@1', 'issued', null], ['causal_its@1', 'excluded', 'budget']]);
    expect(String(arr(out['excluded_models'])[0]?.['reason'])).toMatch(/member budget \(2\) is reached/);
    // integrated: a member is issued only as an APPROVED method of the domain's registry (§MR's pmr_fct_routed) — a stub plan that invents
    // `causal_its@1` is refused at issue with the budget open, nothing issued; the real router plans registry methods only (EN7 runs one)
    await expect(withRouter(stubRouter(extra, runner as never), () => issue(eriksen, scenePayload({ horizon: '180d', budget: { members: 3 } }))))
      .rejects.toThrow(/forecast rejected \(method\): causal_its@1 is not a method of this domain's registry/);
    const stopped = await liveRun('180d');
    if (stopped !== undefined) await resume(eriksen, String(stopped['run_id'])).catch(() => undefined);
  });

  it('REFUSAL + RECOVERY · a stopped completion: a completion hiding a lost path, or claiming another disagreement level, is refused by the port; resume completes from the ensemble\'s payload', async () => {
    const extra: MethodPlan['methods'] = [{ methodRef: 'bayes_normal@1', family: 'bayesian', forecastKind: 'quantity', available: false, unavailableReason: 'retired (SYNTHETIC)', confidenceLanguage: 'distribution' }];
    const spy = vi.spyOn(svc as unknown as { completeRun: () => Promise<void> }, 'completeRun').mockRejectedValueOnce(new Error('the process stopped after the issuance (harness)'));
    try { await expect(withRouter(stubRouter(extra), () => issue(eriksen, scenePayload({ horizon: '1y' })))).rejects.toThrow(/stopped after the issuance/); } finally { spy.mockRestore(); }
    const live = await liveRun('1y');
    expect(live?.['state']).toBe('running');
    const runId = String(live?.['run_id']);
    expect((await sql<{ state: string }>`select state from prediction.forecasts_current where forecast_id = ${String(live?.['ensemble_forecast_id'])}::uuid`.execute(su)).rows[0]?.state).toBe('issued');
    const complete = (outcome: Row) => h.pipeline.write(h.env(eriksen, 'prediction.ensemble.issue', 'ENS', runId, 'prediction'), eriksen,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.ensemble.issue', objectType: 'ENS', objectId: runId }, EnsembleCapability.manage,
      async (cap) => ({ result: await cap.complete({ runId, tenantId: T(), domainId: D(), outcome, actor: eriksen.principalId, eventId: uuidv7(), correlationId: uuidv7() }), targetType: 'ENS', targetId: runId, targetVersion: null, outboxEvent: null }));
    const payload = (await sql<{ payload: Row }>`select payload from objects.canonical_objects where object_type = 'FCT' and object_id = ${String(live?.['ensemble_forecast_id'])}::uuid`.execute(su)).rows[0]!.payload;
    const truth = rec(rec(payload['ensemble'])['outcome']);
    await refused(complete({ ...truth, excluded: [] }), /^ensemble rejected \(outcome\): 1 planned member\(s\) of run .* are neither issued nor excluded — every lost path is disclosed/, 422);
    const lie = rec(truth['analysis'])['level'] === 'agree' ? 'material' : 'agree';
    await refused(complete({ ...truth, analysis: { ...rec(truth['analysis']), level: lie } }), /^ensemble rejected \(disagreement\): the analysis claims .*; the members as issued disagree at .* under disagreement@1/, 422);
    expect((await runRow(runId))['state']).toBe('running');
    const out = (await resume(eriksen, runId)).ensemble;
    expect(rec(out['run'])['state']).toBe('completed');
    expect(arr(out['members']).map((m) => [m['method_ref'], m['state'], m['exclusion_class']])).toEqual([['seasonal_naive@1', 'issued', null], ['holt_winters@1', 'issued', null], ['bayes_normal@1', 'excluded', 'unavailable']]);
    expect(await runEvents(runId)).toEqual(expect.arrayContaining(['ensemble.resumed', 'ensemble.member_excluded', 'ensemble.completed']));
  });
});

describe('EN2 · RECOVERY: a later ensemble supersedes the earlier one with its members (the prelude\'s lineage rule); AI may run an ensemble', () => {
  it('POSITIVE · SKILL weights from the applicable backtest: each member weighs the inverse of its own pinball on the record (SYNTHETIC history; retrospective)', async () => {
    const bt = (await prediction.runBacktest(h.req(eriksen, 'prediction.backtest.record', 'BKT', null), T(), D(),
      { payload: { seriesKey, horizon: '90d', observedThrough: CUT, mode: 'retrospective', origins: 40, stride: 14 } }) as { backtest: Row }).backtest;
    expect(Number(bt['origins'])).toBeGreaterThanOrEqual(20);
    const out = (await issue(eriksen, scenePayload({ horizon: '90d', weighting: 'skill' }))).ensemble;
    const run = rec(out['run']);
    expect(run['state']).toBe('completed');
    expect(rec(run['outcome'])['weighting_used']).toBe('skill');
    const snP = Number(bt['baseline_pinball_mean']); const hwP = Number(bt['pinball_mean']);
    const expected = [1 / snP / (1 / snP + 1 / hwP), 1 / hwP / (1 / snP + 1 / hwP)];
    const w = arr(out['members']).map((m) => Number(m['weight']));
    expect(Math.abs((w[0] as number) - (expected[0] as number))).toBeLessThan(2e-6); expect(Math.abs((w[1] as number) - (expected[1] as number))).toBeLessThan(2e-6);
    expect(String(rec(out['ensemble'])['statement'])).toMatch(/under linear_pool@1, skill weights/);
    // each member's validation is what the record earns ITS method (never the ensemble's): validated_retrospective only with its own T1 met
    for (const m of arr(out['members'])) expect(['validated_retrospective', 'unvalidated']).toContain(m['validation_state']);
    expect(['unvalidated']).toContain(rec(out['ensemble'])['validation_state']);
  });

  it('the forecast agent issues the next ensemble at 30d (skill weighting falls back to equal, said); the scene\'s ensemble and members are superseded; then linear_pool recovers PER-07', async () => {
    const out = (await issue(agent, scenePayload({ weighting: 'skill', owner: eriksen.principalId }))).ensemble;
    const run = rec(out['run']);
    expect(run['state']).toBe('completed'); expect(run['admitted_by']).toBe(agent.principalId); expect(run['owner_principal_id']).toBe(eriksen.principalId);
    expect(rec(rec(run['outcome']))['weighting_used']).toBe('equal');
    expect(String(rec(out['ensemble'])['statement'])).toMatch(/under linear_pool@1, equal weights/);
    const old = String(rec(S['run'])['ensemble_forecast_id']);
    const states = (await sql<{ role: string; state: string; superseded_by: string | null }>`select ensemble_role as role, state, superseded_by::text from prediction.forecasts_current where ensemble_id = ${old}::uuid order by ensemble_role`.execute(su)).rows;
    expect(states.map((s) => [s.role, s.state, s.superseded_by])).toEqual([
      ['ensemble', 'superseded', String(rec(out['ensemble'])['forecast_id'])], ['member', 'superseded', String(rec(out['ensemble'])['forecast_id'])], ['member', 'superseded', String(rec(out['ensemble'])['forecast_id'])]]);
    // the new members and ensemble stand side by side
    const now = (await sql<{ n: number }>`select count(*)::int n from prediction.forecasts_current where ensemble_id = ${String(rec(out['ensemble'])['forecast_id'])}::uuid and state = 'issued'`.execute(su)).rows[0]?.n;
    expect(now).toBe(3);
    // PER-07's RECOVERY: the question refused under quantile_average@1 (its run failed) is answered under linear_pool@1
    const failed = (await sql<Row>`select state_reason from prediction.ensemble_runs where tenant_id = ${T()}::uuid and horizon_code = '30d' and combination_rule = 'quantile_average@1'`.execute(su)).rows;
    expect(failed.map((f) => String(f['state_reason']).slice(0, 10))).toEqual(['precision:']);
    expect(run['combination_rule']).toBe('linear_pool@1');
  });
});

/* B25 act-found (the rehearsal on eye_demo_b25): the corridor's real PortWatch history is ~8,900 evidence versions, each a governed retrieval —
   its assembly takes minutes. The compute budget (≤ 120 s) was charged from BEFORE the history was read, so every member of a run on a
   long real history was excluded as `budget` and the run failed. The budget is the MEMBERS' compute: the clock starts after the read. */
describe('EN1 · the compute budget charges the members\' compute, not the history read (act-found)', () => {
  it('RECOVERY · a slow history read (longer than the whole compute budget) leaves both members run and the run COMPLETED; compute_ms is the members\' compute', async () => {
    const series = (svc as unknown as { series: { assemble: (...a: unknown[]) => Promise<unknown> } }).series;
    const original = series.assemble.bind(series);
    const spy = vi.spyOn(series, 'assemble').mockImplementation(async (...a: unknown[]) => { await new Promise((r) => setTimeout(r, 700)); return original(...a); });
    let out: Row;
    try { out = (await issue(eriksen, scenePayload({ horizon: '1y', budget: { computeMs: 300 } }))).ensemble; } finally { spy.mockRestore(); }
    const run = rec(out['run']);
    expect(run['state'], String(run['state_reason'])).toBe('completed');
    expect(arr(out['members']).map((m) => [m['method_ref'], m['state']])).toEqual([['seasonal_naive@1', 'issued'], ['holt_winters@1', 'issued']]);
    expect(Number(rec(run['outcome'])['compute_ms'] ?? 0)).toBeLessThan(700);
  });
});

describe('EN6 · the boundary', () => {
  it('the declared rules: prediction.ensemble_rules() is ENSEMBLE_RULES, key for key', async () => {
    const r = (await sql<{ r: Row }>`select prediction.ensemble_rules() as r`.execute(su)).rows[0]!.r;
    expect(r).toEqual(JSON.parse(JSON.stringify(ENSEMBLE_RULES)));
  });
  it('FORCE row-level security on the five tables; no §EN definer function is executable by PUBLIC', async () => {
    const rows = (await sql<{ relname: string; f: boolean }>`select c.relname, c.relforcerowsecurity f from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'prediction' and c.relname in ('ensemble_runs', 'ensemble_members', 'ensemble_attempts', 'ensemble_events', 'judgement_overlays')`.execute(su)).rows;
    expect(rows.filter((x) => x.f)).toHaveLength(5);
    const pub = (await sql<{ n: number }>`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'prediction' and p.prosecdef
      and has_function_privilege('public', p.oid, 'EXECUTE') and (p.proname like 'pen\\_%' or p.proname like '%ensemble%' or p.proname like '%judgement_overlay%')`.execute(su)).rows[0]?.n;
    expect(pub).toBe(0);
  });
  it('the error families map by class (403 / 404 / 409 / 422)', () => {
    const st = (m: string) => asObservationRefusal(Object.assign(new Error(m), { code: '22023' }), 'c')?.getStatus() ?? null;
    expect(st('ensemble rejected (actor): x')).toBe(403); expect(st('judgement overlay rejected (authority): x')).toBe(403); expect(st('ensemble rejected (ownership): x')).toBe(403);
    expect(st('ensemble rejected (unknown_run): x')).toBe(404); expect(st('judgement overlay rejected (unknown_evidence): x')).toBe(404);
    expect(st('ensemble rejected (duplicate): x')).toBe(409); expect(st('judgement overlay rejected (stale): x')).toBe(409); expect(st('ensemble rejected (state): x')).toBe(409);
    expect(st('ensemble rejected (precision): x')).toBe(422); expect(st('judgement overlay rejected (adjustment): x')).toBe(422);
  });
  it('the runs of this tenant are all finished (no run left live by the harness)', async () => {
    const n = (await sql<{ n: number }>`select count(*)::int n from prediction.ensemble_runs where tenant_id = ${T()}::uuid and state in ('admitted', 'running')`.execute(su)).rows[0]?.n;
    expect(n).toBe(0);
  });
});

/* B25 completion (G2): THE REPLAY OF AN ENSEMBLE ROW — the combination recomputed from the members' STORED distributions under the declared
   rule (ensemble-combination@1, registered by this part in the shared replayer register and reached by §CX's replay route); each member is
   replayed on its own (here the seasonal-naive member by the legacy compute). SYNTHETIC history. */
describe('EN7 · B25 completion G2: the replay of an ensemble (the combination from its members\' stored distributions)', () => {
  it('POSITIVE / REFUSAL / RECOVERY · the scene\'s ensemble and its member REPRODUCED; a member edited after issue DIVERGES the ensemble; restored, REPRODUCED', async () => {
    const { ContextController: Cc } = await import('../../src/prediction/context/context.controller.js');
    const C = h.app.get(Cc);
    const replay = (id: string) => C.replay(h.req(eriksen, 'prediction.forecast.replay', 'FCT', id), T(), D(), id) as unknown as Promise<{ replay: Row & { outcome: string; diverged: Row[] } }>;
    const e = rec(S['ensemble']); const ensembleId = String(e['forecast_id']);
    const member = arr(S['members'])[0]!; const memberId = String(member['forecast_id']);
    const r0 = (await replay(ensembleId)).replay;
    expect(r0, JSON.stringify(r0.diverged)).toMatchObject({ outcome: 'REPRODUCED', diverged: [] });
    expect(rec(r0['replayer'])).toMatchObject({ replayer: 'ensemble-combination@1', rule: 'linear_pool@1', weighting_used: 'equal', weights: 'recomputed (1/n)' });
    expect(arr(rec(r0['replayer'])['members']).map((m) => m['method_ref'])).toEqual(['seasonal_naive@1', 'holt_winters@1']);
    const rm = (await replay(memberId)).replay;
    expect(rm, JSON.stringify(rm.diverged)).toMatchObject({ outcome: 'REPRODUCED', diverged: [] });
    expect(rm['replayer']).toBeUndefined();   // a builtin member: the legacy compute of the register
    // REFUSAL — a member's stored distribution edited after issue (STATED SUPERUSER MOVE): the combination no longer reproduces
    const before = (await sql<{ q: Row }>`select quantiles q from prediction.forecasts_current where forecast_id = ${memberId}::uuid`.execute(su)).rows[0]!.q;
    await sql`update prediction.forecasts_current set quantiles = ${JSON.stringify({ ...before, q10: Number(before['q10']) + 5, q50: Number(before['q50']) + 5, q90: Number(before['q90']) + 5 })}::jsonb where forecast_id = ${memberId}::uuid`.execute(su);
    let d: Row & { outcome: string; diverged: Row[] };
    try { d = (await replay(ensembleId)).replay; } finally { await sql`update prediction.forecasts_current set quantiles = ${JSON.stringify(before)}::jsonb where forecast_id = ${memberId}::uuid`.execute(su); }
    expect(d.outcome).toBe('DIVERGED');
    expect(d.diverged.map((x) => x['what'])).toEqual(expect.arrayContaining(['member', 'output']));
    // RECOVERY — restored: reproduced
    expect((await replay(ensembleId)).replay.outcome).toBe('REPRODUCED');
    console.log(`B25 EN7 EVIDENCE · G2 · ensemble ${ensembleId} REPRODUCED by ensemble-combination@1 (linear_pool@1, equal weights recomputed) · member ${memberId} REPRODUCED by the legacy compute · an edited member → DIVERGED (${d.diverged.map((x) => x['what']).join(', ')}) · restored → REPRODUCED`);
  });
});
