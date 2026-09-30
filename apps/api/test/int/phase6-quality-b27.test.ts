/**
 * CP-6 B27 §Q (0097, part `quality`) — SCENARIO QUALITY AND COHERENCE v2 (F-P4-09; L7-C06, L7-I04, V03-T-142/-143/-334/-341, ES-37-007/-008/-009,
 * V04-T-031/-032, AI-49-003/-004, PR-33-005, FEX-12), through the real database and controllers (POST …/prediction/scenarios/quality/…, the
 * declare and BranchScenario routes, the indicator retirement route, the attention tick), on the world of `bootDecisionWorld` and B27's own
 * humans with sessions of their own (the ports compare the acting principal).
 *
 *   a SEMANTIC COHERENCE beyond v1 — collapse to one forecast (every live branch on one indicator threshold), prohibited contradiction
 *     (X and not-X among a branch's assumptions; a declared antonym pair; a branch against a scenario-level element), the temporal ordering of
 *     timed elements (an element ending before it begins; a dependency beginning after the element it causes) — each FAILS in the quality
 *     ledger while the v1 coherence check (0081) passes, its findings v1's alone; a clean tree passes. Refusals: the policy, an unknown and a
 *     retired scenario, a trigger the person may not name. Recovery: the elements retired, the evaluation passes.
 *   b DISTINCTIVENESS, COVERAGE, BIAS — two branches added through BranchScenario that differ only in WORDING fail `indistinct_branches` naming
 *     both (the demonstration's case); coverage names the missing kind; bias notes the all-adverse set; a re-worded branch on a different
 *     assumption and indicator is NOT flagged (the negative control) and the successor tree passes with full coverage and no bias.
 *   c THE QUALITY INDICATORS — assumption coverage, branch diversity, signpost discrimination, review timeliness, INDICATOR FRESHNESS: a fresh,
 *     a STALE (a stated superuser move on last_observation_at) and a MISSING (the indicator retired through the governed route) indicator
 *     named on the scenario with the rule's reason; recovery: the stale one observed again (stated), the retired one replaced by a successor
 *     scenario.
 *   d GOVERNED BRANCH PROBABILITIES — the FREQUENCY-TO-PROBABILITY MAP (bands, owner, versions; the next version supersedes), a probability
 *     set by each method (frequency_map computes the band; expert_elicitation carries its record; model names a completed run), the live
 *     lows' sum ≤ 1, a suspended branch's probability shown and not summed (a stated superuser move suspends it — Part A owns the port);
 *     refusals: a narrative basis, a missing record, an unknown run, a caller's band on the map method, the sum, a superseded map, a
 *     non-owner (the port's 403), the policy; recovery: withdrawn with a reason, set again.
 *   e DEGRADED BEHAVIOUR (FEX-12) — a failed evaluation reads NOT decision-active (the coherence state untouched); `scenario.quality` routed
 *     to the owner ONCE per new failure; the tick step `scenario-quality` (68) re-evaluates only a scenario already evaluated whose version or
 *     indicator freshness changed (never one nobody evaluated); recovery: the indicator observed again → the tick passes it.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout (NORDWERK's data is the demonstration's). Stated superuser
 * moves: an indicator's last_observation_at (stale / fresh again), a scenario's next_review_due_at (overdue), one branch suspended (the §0
 * columns — Part A owns the suspension port), and — when §A's table is absent in this worktree — a stand-in prediction.scenario_elements with
 * the MAP's columns (the §Q reader reads it by to_regclass) whose rows are seeded and retired directly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { SignalsController } from '../../src/prediction/signals/signals.controller.js';
import type { ScenarioQualityController } from '../../src/prediction/scenarios/quality/quality.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b27q-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Finding = { rule: string; outcome: 'fail' | 'note'; branch_ids: string[]; detail: string; [k: string]: unknown };

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld;
let prediction: PredictionController; let signals: SignalsController; let q: ScenarioQualityController; let exec: ExecutiveController;
let scheduler: SchedulerService; let timer: AttentionTimerService;
/** The scenario owner (strategy_owner), a second strategy owner who owns nothing here, the forecast owner, an analyst, the attention hosts. */
let owner: AuthenticatedPrincipal; let otherOwner: AuthenticatedPrincipal; let forecaster: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal;
let agentId = '';
/** Indicators (all SYNTHETIC, on the world's series). */
let I1 = ''; let I2 = ''; let I3 = ''; let I4 = ''; let IF = ''; let IS = ''; let IR = '';
/** Scenarios: a clean tree, a collapsed one, a contradicting one, one with timed elements, the wording-only pair, its successor, the freshness tree. */
let SA = ''; let SL = ''; let SC = ''; let SE = ''; let SD = ''; let SD2 = ''; let SF = '';
let STANDIN = false;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});
const rows = async (x: ReturnType<typeof sql>) => (await x.execute(su)).rows as Row[];

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
const P = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'prediction');
const declareScenario = (as: AuthenticatedPrincipal, payload: Row) => prediction.declareScenario(P(as, 'prediction.scenario.declare', 'SCN'), T(), D(), { payload }) as unknown as Promise<{ scenario: Row & { scenarioId: string; branches: Array<{ branchId: string; name: string; kind: string }>; coherence: Row } }>;
const branchScenario = (as: AuthenticatedPrincipal, id: string, payload: Row) => prediction.branchScenario(P(as, 'prediction.scenario.branch', 'SCN', id), T(), D(), id, { payload }) as unknown as Promise<{ branching: Row & { branch_id: string; version: number; coherence: Row | null } }>;
const reviewScenario = (as: AuthenticatedPrincipal, id: string, payload: Row) => prediction.reviewScenario(P(as, 'prediction.scenario.review', 'SCN', id), T(), D(), id, { payload } as never) as unknown as Promise<{ review: Row }>;
const defineIndicator = async (description: string, threshold: number): Promise<string> =>
  ((await prediction.defineIndicator(P(w.twinOwner, 'prediction.indicator.define', 'IND'), T(), D(), { payload: { seriesKey: w.seriesKey, comparator: '<', consecutiveDays: 5, owner: w.twinOwner.principalId, description, threshold } })) as unknown as { indicator: { indicatorId: string } }).indicator.indicatorId;
const retireIndicator = (as: AuthenticatedPrincipal, id: string, reason: string) => signals.retireIndicator(P(as, 'prediction.indicator.retire', 'IND', id), T(), D(), id, { payload: { reason } });
type Evaluation = Row & { evaluation_id: string; outcome: 'passed' | 'failed'; findings: Finding[]; measures: Row; new_failure: boolean; attention_item_id: string | null; scenario_version: number; trigger: string };
const evaluate = (as: AuthenticatedPrincipal, id: string, payload: Row = {}) => q.evaluate(P(as, 'prediction.scenario.quality.evaluate', 'SCN', id), T(), D(), id, { payload }) as Promise<{ evaluation: Evaluation }>;
type QualityView = Row & { latest: Evaluation | null; live: Evaluation; decision_active: { value: boolean; reasons: string[] }; quality_state: string; scenario: Row; branches: Array<Row & { branch_id: string; probability: Row | null; live: boolean }>;
  probability_sum: { live_low: number; live_high: number; not_summed: number }; maps: Row[]; evaluations: Row[] };
const read = (as: AuthenticatedPrincipal, id: string) => q.read(P(as, 'prediction.scenario.quality.read', 'SCN', id), T(), D(), id) as unknown as Promise<QualityView>;
const declareMap = (as: AuthenticatedPrincipal, payload: Row) => q.declareMap(P(as, 'prediction.scenario.probability.map', 'FPM'), T(), D(), { payload }) as Promise<{ map: Row & { map_id: string; version: number } }>;
const listMaps = (as: AuthenticatedPrincipal) => q.listMaps(P(as, 'prediction.scenario.quality.read', 'FPM'), T(), D()) as Promise<{ maps: Row[] }>;
const setProbability = (as: AuthenticatedPrincipal, branchId: string, payload: Row) => q.setProbability(P(as, 'prediction.scenario.probability.set', 'BRN', branchId), T(), D(), branchId, { payload }) as Promise<{ probability: Row }>;
const withdrawProbability = (as: AuthenticatedPrincipal, branchId: string, reason: string) => q.withdrawProbability(P(as, 'prediction.scenario.probability.withdraw', 'BRN', branchId), T(), D(), branchId, { payload: { reason } }) as Promise<{ withdrawal: Row }>;

/* ───────────── the trees ───────────── */
const baseline = (): Row => ({ name: 'Baseline', kind: 'baseline', statement: 'transits hold at the forecast level (SYNTHETIC)', owner: owner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 });
const br = (name: string, kind: string, statement: string, indicatorId: string, over: Row = {}): Row => ({ name, kind, statement, indicatorId, owner: owner.principalId, consequence: 'rebook the open shipments now', responseWindowHours: 48,
  ...(['baseline', 'upside', 'downside'].includes(kind) ? {} : { divergence: `the ${name.toLowerCase()} path departs from the baseline (SYNTHETIC)` }), ...over });
const tree = async (title: string, branches: Row[]): Promise<{ id: string; branches: Record<string, string>; coherence: Row }> => {
  const s = (await declareScenario(owner, { title: `${title} (B27 quality harness, SYNTHETIC)`, statement: 'the Bab el-Mandeb corridor over the next quarter (SYNTHETIC)', forecastId: w.forecastId,
    owner: owner.principalId, reviewCadence: 'weekly', branches: [baseline(), ...branches] })).scenario;
  return { id: s.scenarioId, branches: Object.fromEntries(s.branches.map((b) => [b.name, b.branchId])), coherence: obj(s.coherence) };
};
const branchIds = async (id: string) => Object.fromEntries((await rows(sql`select name, branch_id::text as id from prediction.branches_current where scenario_id = ${id}::uuid`)).map((r) => [String(r['name']), String(r['id'])]));
const fails = (e: { findings: Finding[] }) => e.findings.filter((f) => f.outcome === 'fail').map((f) => f.rule);
const notes = (e: { findings: Finding[] }) => e.findings.filter((f) => f.outcome === 'note').map((f) => f.rule);
const finding = (e: { findings: Finding[] }, rule: string) => e.findings.find((f) => f.rule === rule);
const coherenceChecks = async (id: string) => rows(sql`select outcome, rule_version, findings from prediction.scenario_coherence_checks where scenario_id = ${id}::uuid order by checked_at`);
const V1_RULES = ['duplicate_branch', 'assumption_invalid', 'forecast_relationship', 'temporal_order', 'dependency_retired', 'coverage', 'basis_unchecked'];
const qualityItems = async (id: string) => rows(sql`select item_id::text as item_id, signal_class, subject_kind, owner_principal_id::text as owner, state, title, details from executive.attention_items where signal_class = 'scenario.quality' and subject_id = ${id}::uuid order by created_at`);
const evaluationsOf = async (id: string) => rows(sql`select trigger, outcome, new_failure, scenario_version, evaluated_by::text as by from prediction.scenario_quality_evaluations where scenario_id = ${id}::uuid order by evaluated_at`);
const scenarioEvents = async (id: string, event: string) => rows(sql`select branch_id::text as branch_id, details from prediction.scenario_events where scenario_id = ${id}::uuid and event = ${event} order by occurred_at`);
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2037, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const outputs = obj(t.run?.outputs);
  return obj(obj(outputs['steps'] ?? outputs)['scenario-quality']);
};

/* ───────────── §A's elements (read by to_regclass; a stand-in when §A is absent in this worktree) ───────────── */
const seedElement = async (e: { scenarioId: string; branchId: string | null; kind: string; name: string; description: string; attributes: Row }): Promise<string> => {
  const id = uuidv7();
  // §I (the integrator): §A's real table is present — its NOT NULL columns updated_by and correlation_id supplied (the stand-in has neither)
  if (STANDIN) {
    await sql`insert into prediction.scenario_elements (element_id, scope, tenant_id, domain_id, scenario_id, branch_id, kind, name, description, attributes, version, state, declared_by, declared_at)
              values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${e.scenarioId}::uuid, ${e.branchId}::uuid, ${e.kind}, ${e.name}, ${e.description}, ${JSON.stringify(e.attributes)}::jsonb, 1, 'active', ${owner.principalId}::uuid, clock_timestamp())`.execute(su);
  } else {
    await sql`insert into prediction.scenario_elements (element_id, scope, tenant_id, domain_id, scenario_id, branch_id, kind, name, description, attributes, version, state, declared_by, declared_at, updated_by, correlation_id)
              values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${e.scenarioId}::uuid, ${e.branchId}::uuid, ${e.kind}, ${e.name}, ${e.description}, ${JSON.stringify(e.attributes)}::jsonb, 1, 'active', ${owner.principalId}::uuid, clock_timestamp(), ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  }
  return id;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { SignalsController: Sc } = await import('../../src/prediction/signals/signals.controller.js');
  const { ScenarioQualityController: Qc } = await import('../../src/prediction/scenarios/quality/quality.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  prediction = h.app.get(Pc); signals = h.app.get(Sc); q = h.app.get(Qc); exec = h.app.get(Ec);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  owner = await h.humanWithSession(['strategy_owner'], 'b27q-owner');
  otherOwner = await h.humanWithSession(['strategy_owner'], 'b27q-other-owner');
  forecaster = await h.humanWithSession(['forecast_owner'], 'b27q-forecaster');
  analyst = await h.humanWithSession(['domain_analyst'], 'b27q-analyst');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b27q-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b27q-dadmin');
  reviewer = await h.humanWithSession(['executive'], 'b27q-reviewer');
  w = await bootDecisionWorld(h);
  I1 = await defineIndicator('B27Q: transits below 40 for five days (SYNTHETIC)', 40);
  I2 = await defineIndicator('B27Q: transits below 25 for five days (SYNTHETIC)', 25);
  I3 = await defineIndicator('B27Q: transits below 15 for five days (SYNTHETIC)', 15);
  I4 = await defineIndicator('B27Q: transits below 10 for five days (SYNTHETIC)', 10);
  IF = await defineIndicator('B27Q: freshness probe — observed (SYNTHETIC)', 41);
  IS = await defineIndicator('B27Q: freshness probe — gone quiet (SYNTHETIC)', 42);
  IR = await defineIndicator('B27Q: freight-rate signpost, to be retired (SYNTHETIC)', 43);
  // §A's elements: the real table when §A is present, a stand-in with the MAP's columns otherwise (stated; read by to_regclass)
  STANDIN = (await rows(sql`select to_regclass('prediction.scenario_elements') is null as absent`))[0]!['absent'] === true;
  if (STANDIN) {
    await sql`create table prediction.scenario_elements (element_id uuid primary key, scope text not null, tenant_id uuid not null, domain_id uuid not null, scenario_id uuid not null, branch_id uuid,
      kind text not null, name text not null, description text, attributes jsonb not null default '{}'::jsonb, version int not null default 1, state text not null default 'active',
      declared_by uuid not null, declared_at timestamptz not null default clock_timestamp(), retired_at timestamptz)`.execute(su);
    await sql`grant select on prediction.scenario_elements to public`.execute(su);
  }
  // THE ATTENTION AGENT: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: reviewer.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } } as never) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await new Promise((res) => setTimeout(res, 1500));
  await scheduler.unscheduleAttentionTick(T(), D());
}, 400_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  if (STANDIN) { try { await sql`drop table if exists prediction.scenario_elements`.execute(su); } catch { /* left for the dropped database */ } }
  await h?.close();
}, 120_000);

describe('B27 §Q · a SEMANTIC COHERENCE beyond v1 (collapse, prohibited contradiction, temporal ordering)', () => {
  it('a · POSITIVE: a clean tree passes; a collapsed tree, a contradicting tree and a tree with mis-timed elements FAIL in the quality ledger while the v1 coherence check passes with v1\'s findings only', async () => {
    // the clean tree: distinct indicators and assumptions, baseline + adverse + stress + benign
    const a = await tree('B27Q clean corridor tree', [
      br('Corridor collapse', 'downside', 'transits fall below 40 for five days', I1, { assumptions: [{ statement: 'insurers withdraw war-risk cover' }] }),
      br('Corridor reopens', 'upside', 'escorted convoys restore transits above 25', I2, { assumptions: [{ statement: 'naval escorts resume transits' }] }),
      br('Twin chokepoints', 'stress', 'Suez and Bab el-Mandeb both close for a fortnight', I3, { assumptions: [{ statement: 'the Suez route is disrupted as well' }] }),
    ]);
    SA = a.id;
    const ea = (await evaluate(owner, SA)).evaluation;
    expect(ea, JSON.stringify(ea.findings)).toMatchObject({ outcome: 'passed', trigger: 'operator', new_failure: false, attention_item_id: null, rule_version: '1' });
    expect(fails(ea)).toEqual([]);
    expect(obj(ea.measures)).toMatchObject({ live_branches: 4, assumption_coverage: { with_assumption: 3, live: 4, ratio: 0.75 }, branch_diversity: { kinds: 4, live: 4, ratio: 1 }, bias: null,
      coverage: { present: ['baseline', 'downside', 'stress', 'upside'], missing: [] } });
    // COLLAPSE: every live branch beside the baseline on one indicator threshold (different kinds, different assumptions — not indistinct)
    const l = await tree('B27Q collapsed corridor tree', [
      br('Corridor collapse', 'downside', 'transits fall below 40 for five days', I1, { assumptions: [{ statement: 'insurers withdraw war-risk cover' }] }),
      br('Naval incident', 'disruption', 'an incident at the strait halts merchant traffic', I1, { assumptions: [{ statement: 'a naval incident closes the strait' }] }),
    ]);
    SL = l.id;
    expect(l.coherence['outcome']).toBe('passed');
    const el = (await evaluate(owner, SL, { trigger: 'declare' })).evaluation;
    expect(el.outcome).toBe('failed');
    expect(fails(el)).toEqual(['collapse_to_one_forecast']);
    expect([...finding(el, 'collapse_to_one_forecast')!.branch_ids].sort()).toEqual([l.branches['Corridor collapse'], l.branches['Naval incident']].sort());
    expect(finding(el, 'collapse_to_one_forecast')!.detail).toMatch(/all 2 live branches beside the baseline rest on one indicator threshold .* collapses to one forecast/);
    expect(notes(el)).toContain('signpost_shared');
    // PROHIBITED CONTRADICTION: X and not-X in one branch; an antonym pair in another
    const c = await tree('B27Q contradicting corridor tree', [
      br('Insurer exit', 'downside', 'war-risk cover is withdrawn and sailings stop', I2, { assumptions: [{ statement: 'insurers withdraw war-risk cover' }, { statement: "insurers don't withdraw war-risk cover" }] }),
      br('Open corridor', 'upside', 'the corridor stays open to convoys', I3, { assumptions: [{ statement: 'the corridor stays open' }, { statement: 'the corridor stays closed' }] }),
    ]);
    SC = c.id;
    const ec = (await evaluate(owner, SC)).evaluation;
    expect(fails(ec)).toEqual(['prohibited_contradiction', 'prohibited_contradiction']);
    expect(ec.findings.filter((f) => f.rule === 'prohibited_contradiction').map((f) => f.branch_ids[0]).sort()).toEqual([c.branches['Insurer exit'], c.branches['Open corridor']].sort());
    expect(finding(ec, 'prohibited_contradiction')!.detail).toMatch(/assumes both "/);
    // TEMPORAL ORDERING of timed elements + a branch contradicting a scenario-level element (§A's rows)
    const e = await tree('B27Q timed elements tree', [br('Escort gap', 'downside', 'escorts stop and transits fall below 40', I1, { assumptions: [{ statement: 'naval escorts do not resume transits' }] })]);
    SE = e.id;
    await seedElement({ scenarioId: SE, branchId: null, kind: 'mechanism', name: 'escort resumption', description: 'naval escorts resume transits', attributes: {} });
    await seedElement({ scenarioId: SE, branchId: e.branches['Escort gap']!, kind: 'driver', name: 'insurer exit', description: 'insurers leave the corridor', attributes: { timing: { from: '2026-11-10', until: '2026-11-01' } } });
    const blockade = await seedElement({ scenarioId: SE, branchId: null, kind: 'actor', name: 'blockade', description: 'a regional blockade', attributes: { timing: { from: '2026-10-20' } } });
    await seedElement({ scenarioId: SE, branchId: null, kind: 'impact', name: 'rate spike', description: 'freight rates spike', attributes: { timing: { from: '2026-10-01' }, dependencies: [blockade] } });
    const ee = (await evaluate(owner, SE)).evaluation;
    expect([...new Set(fails(ee))].sort()).toEqual(['element_temporal_order', 'prohibited_contradiction']);
    expect(ee.findings.filter((f) => f.rule === 'element_temporal_order').map((f) => f.detail)).toEqual([
      expect.stringMatching(/driver "insurer exit" is timed from .* until .*: it ends before it begins/),
      expect.stringMatching(/impact "rate spike" \(from .*\) depends on actor "blockade", which begins later .*: the effect precedes its cause/),
    ]);
    expect(finding(ee, 'prohibited_contradiction')!.detail).toMatch(/branch "Escort gap" assumes "naval escorts do not resume transits", contradicting the scenario-level mechanism "escort resumption"/);
    expect(obj(ee.measures)).toMatchObject({ elements_read: true, elements: 4 });
    // THE v1 COHERENCE CHECK UNTOUCHED: every one of these trees passed v1, whose findings carry v1's rules only (rule version 1)
    for (const id of [SA, SL, SC, SE]) {
      const checks = await coherenceChecks(id);
      expect(checks.map((x) => [x['outcome'], x['rule_version']])).toEqual([['passed', '1']]);
      for (const f of checks[0]!['findings'] as Row[]) expect(V1_RULES).toContain(f['rule']);
    }
    expect((await rows(sql`select prediction.scenario_coherence_rule() ->> 'version' as v`))[0]!['v']).toBe('1');
    // the ledger and the log: one row per evaluation, scenario.quality_evaluated beside it (the coherence log untouched)
    expect((await evaluationsOf(SL)).map((x) => [x['trigger'], x['outcome']])).toEqual([['declare', 'failed']]);
    expect((await scenarioEvents(SL, 'scenario.quality_evaluated')).map((x) => obj(x['details'])['outcome'])).toEqual(['failed']);
    console.log(`B27Q EVIDENCE a: ${JSON.stringify({ clean: ea.outcome, collapse: fails(el), contradiction: fails(ec), elements: fails(ee), standin: STANDIN })}`);
  });

  it('a · REFUSAL: the policy (an analyst), an unknown scenario, a retired scenario, the tick\'s trigger named by a person, a malformed id — nothing recorded', async () => {
    const before = (await evaluationsOf(SA)).length;
    expect((await refusal(evaluate(analyst, SA))).status).toBe(403);
    await refused(evaluate(owner, uuidv7()), /^scenario quality rejected \(unknown_scenario\)/, 404);
    await refused(evaluate(owner, SA, { trigger: 'tick' }), /^scenario quality rejected \(trigger\)/, 422);
    await refused(evaluate(owner, 'not-a-uuid'), /^scenario quality rejected \(scenario\): a uuid is required/, 422);
    const retired = await tree('B27Q retired tree', [br('Corridor collapse', 'downside', 'transits fall below 40 for five days', I1)]);
    await reviewScenario(owner, retired.id, { outcome: 'retire', note: 'retired to prove the quality refusal (SYNTHETIC)' });
    await refused(evaluate(owner, retired.id), /^scenario quality rejected \(state\): scenario .* is retired; only an active scenario is evaluated/, 409);
    expect((await evaluationsOf(SA)).length).toBe(before);
    expect(await evaluationsOf(retired.id)).toEqual([]);
  });

  it('a · RECOVERY: the mis-timed and contradicted elements retired (stated, on §A\'s rows) — the next evaluation of the same tree passes', async () => {
    if (STANDIN) await sql`update prediction.scenario_elements set state = 'retired' where scenario_id = ${SE}::uuid`.execute(su);
    else await sql`update prediction.scenario_elements set state = 'retired', retired_at = clock_timestamp(), retired_by = ${owner.principalId}::uuid, retirement_reason = 'retired for the quality harness (stated superuser move)' where scenario_id = ${SE}::uuid`.execute(su);
    const ee = (await evaluate(owner, SE)).evaluation;
    expect(ee, JSON.stringify(ee.findings)).toMatchObject({ outcome: 'passed', prior_outcome: 'failed', new_failure: false });
    expect(obj(ee.measures)).toMatchObject({ elements: 0 });
  });
});

describe('B27 §Q · b DISTINCTIVENESS, COVERAGE and BIAS (AI-49-004)', () => {
  it('b · POSITIVE: two branches added through BranchScenario that differ only in wording fail indistinct_branches naming both; coverage names the missing stress kind; bias notes the all-adverse set', async () => {
    const d = await tree('B27Q wording-only corridor tree', [br('Corridor collapse', 'downside', 'transits fall below 40 for five days', I1)]);
    SD = d.id;
    const common = { indicatorId: I2, divergence: 'the strait closes to merchant traffic (SYNTHETIC)', assumptions: [{ statement: 'naval activity halts transits' }], owner: owner.principalId,
      consequence: 'reroute every open booking via the Cape', responseWindowHours: 24 };
    const b1 = (await branchScenario(owner, SD, { expected_version: 1, idempotency_key: 'b27q-closure-1', branch: { name: 'Strait closure', kind: 'disruption', statement: 'Strait closure: transits halt for seven days', ...common } })).branching;
    const b2 = (await branchScenario(owner, SD, { expected_version: 2, idempotency_key: 'b27q-closure-2', branch: { name: 'Strait shutdown', kind: 'user_defined', kindLabel: 'strait shutdown', statement: 'Strait closure — transits halted for seven days.', ...common } })).branching;
    expect(obj(b2.coherence)['outcome']).toBe('passed');
    const e = (await evaluate(owner, SD, { trigger: 'branch' })).evaluation;
    expect(e).toMatchObject({ outcome: 'failed', trigger: 'branch', scenario_version: 3, new_failure: true });
    expect(fails(e)).toEqual(['indistinct_branches']);
    const f = finding(e, 'indistinct_branches')!;
    expect([...f.branch_ids].sort()).toEqual([b1.branch_id, b2.branch_id].sort());
    expect(f.detail).toMatch(/branches "Strait (closure|shutdown)" and "Strait (closure|shutdown)" share their assumptions, elements, indicator and divergence, and their statements overlap .* \(threshold 0\.75\): they differ only in wording/);
    expect(Number(f['overlap'])).toBeGreaterThanOrEqual(0.75);
    expect(finding(e, 'coverage')).toMatchObject({ outcome: 'note', missing: ['stress'] });
    expect(finding(e, 'bias')).toMatchObject({ outcome: 'note', bias: 'all_adverse' });
    expect(obj(obj(e.measures)['coverage'])).toMatchObject({ present: ['baseline', 'disruption', 'downside', 'user-defined'], missing: ['stress'] });
    // the v1 coherence check on version 3 still passed (duplicate_branch pairs a KIND, and these kinds differ)
    expect((await coherenceChecks(SD)).map((x) => x['outcome'])).toEqual(['passed', 'passed', 'passed']);
    console.log(`B27Q EVIDENCE b: ${JSON.stringify({ indistinct: f.branch_ids, overlap: f['overlap'], coverage: finding(e, 'coverage')!['missing'], bias: finding(e, 'bias')!['bias'] })}`);
  });

  it('b · REFUSAL: the rule refuses to call a re-worded branch on a different assumption and indicator indistinct (the negative control), and the route refuses a malformed trigger', async () => {
    const x = await tree('B27Q negative control', [
      br('Strait closure', 'disruption', 'Strait closure: transits halt for seven days', I2, { divergence: 'the strait closes to merchant traffic (SYNTHETIC)', assumptions: [{ statement: 'naval activity halts transits' }] }),
      br('Insurer shutdown', 'user-defined', 'The strait closes — transits halted for seven days.', I3, { kindLabel: 'insurer shutdown', divergence: 'the strait closes to merchant traffic (SYNTHETIC)', assumptions: [{ statement: 'insurers withdraw war-risk cover' }] }),
    ]);
    const e = (await evaluate(owner, x.id)).evaluation;
    expect(fails(e)).not.toContain('indistinct_branches');
    await refused(evaluate(owner, x.id, { trigger: 'whenever' }), /^scenario quality rejected \(trigger\)/, 422);
  });

  it('b · RECOVERY: the successor tree — the re-worded branch on its own assumption and indicator, a stress and an upside branch — passes with full coverage and no bias', async () => {
    const d2 = await tree('B27Q successor corridor tree', [
      br('Strait closure', 'disruption', 'Strait closure: transits halt for seven days', I2, { divergence: 'the strait closes to merchant traffic (SYNTHETIC)', assumptions: [{ statement: 'naval activity halts transits' }] }),
      br('Insurer shutdown', 'user-defined', 'Insurers stop covering hulls in the strait for seven days', I3, { kindLabel: 'insurer shutdown', divergence: 'cover is withdrawn although the strait stays physically open', assumptions: [{ statement: 'insurers withdraw war-risk cover' }] }),
      br('Corridor reopens', 'upside', 'escorted convoys restore transits above 25', I1, { assumptions: [{ statement: 'naval escorts resume transits' }] }),
      br('Twin chokepoints', 'stress', 'Suez and Bab el-Mandeb both close for a fortnight', I4, { assumptions: [{ statement: 'the Suez route is disrupted as well' }] }),
    ]);
    SD2 = d2.id;
    const e = (await evaluate(owner, SD2)).evaluation;
    expect(e, JSON.stringify(e.findings)).toMatchObject({ outcome: 'passed' });
    expect(e.findings.map((f) => f.rule)).toEqual([]);
    expect(obj(e.measures)).toMatchObject({ bias: null, coverage: { missing: [] }, signpost_discrimination: { distinct_indicators: 4, branches_with_indicator: 4, ratio: 1 } });
  });
});

describe('B27 §Q · c THE QUALITY INDICATORS (freshness: missing and stale NAMED on the scenario)', () => {
  it('c · POSITIVE: a fresh, a STALE and a MISSING indicator named with the rule\'s reason; the coverage, diversity, discrimination and review-timeliness measures', async () => {
    const f = await tree('B27Q freshness tree', [
      br('Corridor collapse', 'downside', 'transits fall below 41 for five days', IF, { assumptions: [{ statement: 'insurers withdraw war-risk cover' }] }),
      br('Quiet signpost', 'disruption', 'a quiet signpost path (SYNTHETIC)', IS),
      br('Freight-rate spike', 'upside', 'freight rates fall back to the pre-crisis band', IR),
    ]);
    SF = f.id;
    // the stated superuser moves: IF observed today, IS last observed 400 days ago; the review overdue
    await sql`update prediction.indicators_current set last_observation_at = (clock_timestamp())::date where indicator_id = ${IF}::uuid`.execute(su);
    await sql`update prediction.indicators_current set last_observation_at = (clock_timestamp())::date - 400 where indicator_id = ${IS}::uuid`.execute(su);
    await sql`update prediction.scenarios_current set next_review_due_at = clock_timestamp() - interval '3 days' where scenario_id = ${SF}::uuid`.execute(su);
    // the freight-rate indicator RETIRED through the governed route → the branch's signpost is missing
    await retireIndicator(owner, IR, 'the freight-rate feed was withdrawn by its publisher (SYNTHETIC)');
    const e = (await evaluate(owner, SF)).evaluation;
    expect(e.outcome).toBe('failed');
    expect(fails(e).sort()).toEqual(['indicator_missing', 'indicator_stale']);
    expect(finding(e, 'indicator_stale')).toMatchObject({ branch_ids: [f.branches['Quiet signpost']], indicator_id: IS });
    expect(finding(e, 'indicator_stale')!.detail).toMatch(/was last observed .*, 400 days ago \(cadence \d+ days \+ 7 days grace\)/);
    expect(finding(e, 'indicator_missing')).toMatchObject({ branch_ids: [f.branches['Freight-rate spike']], indicator_id: IR });
    expect(finding(e, 'indicator_missing')!.detail).toMatch(/indicator .* of "Freight-rate spike" is retired/);
    const m = obj(e.measures);
    expect(m['indicators']).toEqual({ missing: 1, stale: 1 });
    const fresh = m['indicator_freshness'] as Row[];
    expect(Object.fromEntries(fresh.map((x) => [x['name'], x['state']]))).toEqual({ 'Baseline': 'not_required', 'Corridor collapse': 'fresh', 'Quiet signpost': 'stale', 'Freight-rate spike': 'missing' });
    expect(m).toMatchObject({ assumption_coverage: { with_assumption: 1, live: 4, ratio: 0.25 }, branch_diversity: { kinds: 4, live: 4 }, signpost_discrimination: { distinct_indicators: 3, branches_with_indicator: 3, ratio: 1 },
      review_timeliness: { overdue: true } });
    expect(notes(e)).toContain('review_overdue');
    // the read names them as of now
    const v = await read(analyst, SF);
    expect(obj(v.live.measures)['indicators']).toEqual({ missing: 1, stale: 1 });
    console.log(`B27Q EVIDENCE c: ${JSON.stringify(fresh.map((x) => [x['name'], x['state'], x['reason']]))}`);
  });

  it('c · REFUSAL: an indicator awaiting its first observation within its cadence is NOT stale; a person outside the reading roles is refused the read', async () => {
    const v = await read(owner, SA);
    expect((obj(v.live.measures)['indicator_freshness'] as Row[]).filter((x) => x['kind'] !== 'baseline').map((x) => x['state'])).toEqual(['awaiting', 'awaiting', 'awaiting']);
    const outsider = await h.humanWithSession(['collection_manager'], 'b27q-outsider');
    expect((await refusal(read(outsider, SA))).status).toBe(403);
    await refused(read(owner, uuidv7()), /^scenario quality rejected \(unknown_scenario\)/, 404);
  });

  it('c · RECOVERY: the quiet signpost observed again (stated) — the stale finding clears; the missing one stands until the branch has a live indicator', async () => {
    await sql`update prediction.indicators_current set last_observation_at = (clock_timestamp())::date - 1 where indicator_id = ${IS}::uuid`.execute(su);
    const v = await read(owner, SF);
    expect(v.live.findings.filter((x) => x.outcome === 'fail').map((x) => x.rule)).toEqual(['indicator_missing']);
    expect(obj(v.live.measures)['indicators']).toEqual({ missing: 1, stale: 0 });
    // the latest RECORDED evaluation is unchanged until someone (or the tick) evaluates again
    expect(v.latest!.outcome).toBe('failed');
    await sql`update prediction.indicators_current set last_observation_at = (clock_timestamp())::date - 400 where indicator_id = ${IS}::uuid`.execute(su);
  });
});

describe('B27 §Q · d GOVERNED BRANCH PROBABILITIES and the FREQUENCY-TO-PROBABILITY MAP', () => {
  const BANDS = [
    { frequency_label: 'rare', min_per_year: 0, max_per_year: 0.2, probability_low: 0, probability_high: 0.05 },
    { frequency_label: 'occasional', min_per_year: 0.2, max_per_year: 1, probability_low: 0.05, probability_high: 0.25 },
    { frequency_label: 'frequent', min_per_year: 1, max_per_year: 5, probability_low: 0.25, probability_high: 0.6 },
    { frequency_label: 'very frequent', min_per_year: 5, max_per_year: null, probability_low: 0.6, probability_high: 0.9 },
  ];
  let MAP1 = ''; let MAP2 = '';
  const elicitation = (over: Row = {}) => ({ elicitation: { experts: ['N. Eriksen (SYNTHETIC)', 'J. Weber (SYNTHETIC)'], question: 'will escorted convoys restore transits within the quarter?', elicited_at: '2026-09-29T10:00:00Z',
    record: 'two experts, independent estimates, reconciled in a recorded session (SYNTHETIC)', ...over } });

  it('d · POSITIVE: the map declared and versioned; a probability by each method — the map computes the band from the observed frequency; the elicitation carries its record; the model names a completed run; the live lows sum ≤ 1', async () => {
    const m1 = (await declareMap(owner, { name: 'Corridor incident frequency (SYNTHETIC)', horizon: 'the next 12 months', bands: BANDS })).map;
    MAP1 = m1.map_id;
    expect(m1).toMatchObject({ version: 1, state: 'active', owner_principal_id: owner.principalId, supersedes: null });
    const m2 = (await declareMap(owner, { name: 'Corridor incident frequency (SYNTHETIC)', horizon: 'the next 12 months', bands: BANDS.map((b) => (b.frequency_label === 'occasional' ? { ...b, probability_high: 0.3 } : b.frequency_label === 'frequent' ? { ...b, probability_low: 0.3 } : b)) })).map;
    MAP2 = m2.map_id;
    expect(m2).toMatchObject({ version: 2, state: 'active', supersedes: MAP1 });
    expect((await listMaps(analyst)).maps.map((x) => [x['version'], x['state']])).toEqual([[2, 'active'], [1, 'superseded']]);
    const br = await branchIds(SD2);
    // frequency_map: 0.5 incidents a year → the "occasional" band of v2
    const pf = (await setProbability(owner, br['Strait closure']!, { method: 'frequency_map', mapId: MAP2, basis: { frequency_per_year: 0.5, observation: 'the corridor incident log 2015–2024 (SYNTHETIC)' } })).probability;
    expect(pf).toMatchObject({ method: 'frequency_map', probability_low: 0.05, probability_high: 0.3, map_id: MAP2, summed: true });
    expect(obj(obj(pf['basis'])['band'])).toMatchObject({ frequency_label: 'occasional' });
    expect(obj(obj(pf['basis'])['map'])).toMatchObject({ version: 2 });
    // expert elicitation with its record
    const pe = (await setProbability(owner, br['Corridor reopens']!, { method: 'expert_elicitation', low: 0.2, high: 0.35, basis: elicitation() })).probability;
    expect(pe).toMatchObject({ method: 'expert_elicitation', probability_low: 0.2, probability_high: 0.35 });
    // the model: a completed simulation run of this domain
    const pm = (await setProbability(owner, br['Twin chokepoints']!, { method: 'model', low: 0.05, high: 0.1, basis: { run_id: w.controlId } })).probability;
    expect(pm).toMatchObject({ method: 'model', probability_low: 0.05, live_low_sum: 0.3 });
    const v = await read(forecaster, SD2);
    expect(v.probability_sum).toMatchObject({ live_low: 0.3, live_high: 0.75, not_summed: 0 });
    expect(v.branches.filter((b) => b.probability !== null).map((b) => obj(b.probability)['method']).sort()).toEqual(['expert_elicitation', 'frequency_map', 'model']);
    expect((await scenarioEvents(SD2, 'branch.probability_set')).length).toBe(3);
    console.log(`B27Q EVIDENCE d: ${JSON.stringify({ maps: [MAP1, MAP2], frequency: [pf['probability_low'], pf['probability_high']], sum: v.probability_sum })}`);
  });

  it('d · REFUSAL: a narrative basis, a missing elicitation record, an unknown run, a caller\'s band on the map method, a superseded map, the sum beyond 1, a non-owner (the port), an analyst (the policy), a malformed map', async () => {
    const br = await branchIds(SD2);
    const before = (await rows(sql`select count(*)::int as n from prediction.branch_probabilities where scenario_id = ${SD2}::uuid`))[0]!['n'];
    await refused(setProbability(owner, br['Insurer shutdown']!, { method: 'expert_elicitation', low: 0.1, high: 0.2, basis: { narrative: 'the branch statement reads as likely' } }), /^branch probability rejected \(narrative\): a probability is never derived from narrative text/, 422);
    await refused(setProbability(owner, br['Insurer shutdown']!, { method: 'expert_elicitation', low: 0.1, high: 0.2, basis: { elicitation: { experts: ['N. Eriksen'], question: 'is it likely at all?' } } }), /^branch probability rejected \(basis\): the expert_elicitation method carries the elicitation record/, 422);
    await refused(setProbability(owner, br['Insurer shutdown']!, { method: 'model', low: 0.1, high: 0.2, basis: { run_id: uuidv7() } }), /^branch probability rejected \(unknown_run\)/, 404);
    await refused(setProbability(owner, br['Insurer shutdown']!, { method: 'frequency_map', mapId: MAP2, low: 0.1, high: 0.2, basis: { frequency_per_year: 2, observation: 'the corridor incident log (SYNTHETIC)' } }), /^branch probability rejected \(band\): the frequency_map method computes the band/, 422);
    await refused(setProbability(owner, br['Insurer shutdown']!, { method: 'frequency_map', mapId: MAP1, basis: { frequency_per_year: 2, observation: 'the corridor incident log (SYNTHETIC)' } }), /^branch probability rejected \(state\): map .* version 1 is superseded/, 409);
    await refused(setProbability(owner, br['Insurer shutdown']!, { method: 'expert_elicitation', low: 0.75, high: 0.8, basis: elicitation() }), /^branch probability rejected \(sum\): the live branches' lows would sum to 1\.05/, 422);
    await refused(setProbability(otherOwner, br['Insurer shutdown']!, { method: 'expert_elicitation', low: 0.1, high: 0.2, basis: elicitation() }), /^branch probability rejected \(authority\)/, 403);
    expect((await refusal(setProbability(analyst, br['Insurer shutdown']!, { method: 'expert_elicitation', low: 0.1, high: 0.2, basis: elicitation() }))).status).toBe(403);
    await refused(declareMap(owner, { name: 'Broken map (SYNTHETIC)', horizon: 'a year', bands: [BANDS[0], BANDS[2]] }), /^frequency map rejected \(bands\): band 2 starts at 1 per year; the bands are contiguous/, 422);
    await refused(declareMap(owner, { name: 'Broken map (SYNTHETIC)', horizon: 'a year', bands: [BANDS[0], { ...BANDS[1], probability_low: 0, probability_high: 0.01 }] }), /^frequency map rejected \(bands\): band 2 maps a higher frequency to a lower probability/, 422);
    expect((await refusal(declareMap(analyst, { name: 'Analyst map (SYNTHETIC)', horizon: 'a year', bands: BANDS }))).status).toBe(403);
    expect((await rows(sql`select count(*)::int as n from prediction.branch_probabilities where scenario_id = ${SD2}::uuid`))[0]!['n']).toBe(before);
  });

  it('d · RECOVERY: a suspended branch\'s probability is recorded and shown but not summed; a withdrawal with a reason ends a standing probability and the band can be set again', async () => {
    const br = await branchIds(SD2);
    // Part A owns the suspension port; the §0 columns set directly (a stated superuser move)
    await sql`update prediction.branches_current set state = 'suspended', suspended_at = clock_timestamp(), suspended_by = ${owner.principalId}::uuid, suspension_reason = 'critical assumption invalidated (SYNTHETIC)',
              suspension_cause = '{"kind": "operator"}'::jsonb, suspended_from = 'open' where branch_id = ${br['Insurer shutdown']!}::uuid`.execute(su);
    const ps = (await setProbability(owner, br['Insurer shutdown']!, { method: 'expert_elicitation', low: 0.8, high: 0.9, basis: elicitation() })).probability;
    expect(ps).toMatchObject({ branch_state: 'suspended', summed: false, live_low_sum: 0.3 });
    let v = await read(owner, SD2);
    expect(v.probability_sum).toMatchObject({ live_low: 0.3, not_summed: 1 });
    expect(v.branches.find((b) => b.branch_id === br['Insurer shutdown'])).toMatchObject({ live: false, probability: expect.objectContaining({ probability_low: 0.8 }) });
    // the withdrawal: a reason, the standing probability ends; none to withdraw → 409; a short reason → 422
    await refused(withdrawProbability(owner, br['Strait closure']!, 'short'), /^branch probability rejected \(reason\)/, 422);
    const wd = (await withdrawProbability(owner, br['Strait closure']!, 'the incident log was re-based; a new band follows (SYNTHETIC)')).withdrawal;
    expect(wd).toMatchObject({ branch: 'Strait closure' });
    await refused(withdrawProbability(owner, br['Strait closure']!, 'nothing stands any more (SYNTHETIC)'), /^branch probability rejected \(state\): branch "Strait closure" has no standing probability/, 409);
    v = await read(owner, SD2);
    expect(v.probability_sum.live_low).toBeCloseTo(0.25, 10);
    expect(v.branches.find((b) => b.branch_id === br['Strait closure'])!.probability).toBeNull();
    const again = (await setProbability(owner, br['Strait closure']!, { method: 'frequency_map', mapId: MAP2, basis: { frequency_per_year: 2, observation: 'the re-based corridor incident log (SYNTHETIC)' } })).probability;
    expect(again).toMatchObject({ probability_low: 0.3, probability_high: 0.6 });
    expect((await scenarioEvents(SD2, 'branch.probability_withdrawn')).length).toBe(1);
    // the ledger is append-only
    await expect(sql`update prediction.branch_probabilities set probability_low = 0 where scenario_id = ${SD2}::uuid`.execute(su)).rejects.toThrow();
    await expect(sql`delete from prediction.frequency_probability_maps where map_id = ${MAP1}::uuid`.execute(su)).rejects.toThrow(/frequency map rejected \(state\)/);
    // restore the branch (stated) so the tick below judges an ordinary tree
    await sql`update prediction.branches_current set state = 'open', reinstated_at = clock_timestamp(), reinstated_by = ${owner.principalId}::uuid, reinstatement_note = 'restored (SYNTHETIC)' where branch_id = ${br['Insurer shutdown']!}::uuid`.execute(su);
  });
});

describe('B27 §Q · e DEGRADED BEHAVIOUR (FEX-12): not decision-active, the owner notified once, the tick step scenario-quality', () => {
  it('e · POSITIVE: a failed evaluation reads NOT decision-active (the coherence state untouched); scenario.quality routed to the owner ONCE per new failure', async () => {
    const v = await read(analyst, SD);
    expect(v.quality_state).toBe('failed');
    expect(v.decision_active.value).toBe(false);
    expect(v.decision_active.reasons).toEqual([expect.stringMatching(/^the quality evaluation of .* failed: indistinct_branches$/)]);
    expect(obj(v.scenario)['coherence_state']).toBe('passed');
    const items = await qualityItems(SD);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ subject_kind: 'scenario', owner: owner.principalId, state: 'open', title: expect.stringMatching(/^Scenario quality failed: B27Q wording-only corridor tree .* \(indistinct_branches\)$/) });
    // the same failure evaluated again: recorded, NOT a new failure, no second item
    const again = (await evaluate(forecaster, SD)).evaluation;
    expect(again).toMatchObject({ outcome: 'failed', new_failure: false, attention_item_id: null });
    expect(await qualityItems(SD)).toHaveLength(1);
    // the clean tree is decision-active
    expect((await read(analyst, SA)).decision_active).toEqual({ value: true, reasons: [] });
  });

  it('e · THE TICK: the step is scenario-quality at order 68; it re-evaluates only a scenario already evaluated whose version or indicator freshness changed — never one nobody evaluated', async () => {
    const registry = h.app.get(AttentionTickRegistry);
    expect(registry.steps().map((s) => [s.name, s.order])).toContainEqual(['scenario-quality', 68]);
    // SF's stale indicator is observed again (stated) — its freshness changed; SD2 gains a branch — its version changed
    await sql`update prediction.indicators_current set last_observation_at = (clock_timestamp())::date where indicator_id = ${IS}::uuid`.execute(su);
    await branchScenario(owner, SD2, { expected_version: 1, idempotency_key: 'b27q-sd2-2', branch: { name: 'Escort surge', kind: 'upside', statement: 'escorts double and transits recover within weeks', indicatorId: I2,
      owner: owner.principalId, consequence: 'hold the Cape bookings for one more week', responseWindowHours: 48, assumptions: [{ statement: 'a second escort task force arrives' }] } });
    const itemsSF = (await qualityItems(SF)).length;
    const r = await tick(1);
    const byId = Object.fromEntries((r['scenarios'] as Row[]).map((x) => [String(x['scenario_id']), x]));
    expect(byId[SF]).toMatchObject({ reason: 'freshness', outcome: 'failed', new_failure: true });
    expect(byId[SD2]).toMatchObject({ reason: 'version', outcome: 'passed', new_failure: false });   // the new upside shares I2 with the closure: a note, not a failure
    expect(byId[SD]).toBeUndefined();   // unchanged since its last evaluation
    expect(byId[w.scenarioId]).toBeUndefined();   // never evaluated: the tick leaves it alone
    expect(await evaluationsOf(w.scenarioId)).toEqual([]);
    expect((await qualityItems(SF)).length).toBe(itemsSF + 1);   // a NEW failure (the stale finding cleared, the missing one alone)
    const sfTick = (await evaluationsOf(SF)).at(-1)!;
    expect(sfTick).toMatchObject({ trigger: 'tick', outcome: 'failed', new_failure: true });
    // a second tick with nothing changed evaluates nothing
    const r2 = await tick(2);
    expect(r2['evaluated']).toBe(0);
  });

  it('e · RECOVERY: SD2\'s failing branch pair resolved in its successor; the missing freight-rate signpost replaced — the tree passes and is decision-active again', async () => {
    const f2 = await tree('B27Q freshness successor', [
      br('Corridor collapse', 'downside', 'transits fall below 41 for five days', IF, { assumptions: [{ statement: 'insurers withdraw war-risk cover' }] }),
      br('Quiet signpost', 'disruption', 'a quiet signpost path (SYNTHETIC)', IS, { assumptions: [{ statement: 'transits slow before they stop' }] }),
      br('Freight-rate spike', 'upside', 'freight rates fall back to the pre-crisis band', I4, { assumptions: [{ statement: 'carriers return to the corridor' }] }),
      br('Twin chokepoints', 'stress', 'Suez and Bab el-Mandeb both close for a fortnight', I3, { assumptions: [{ statement: 'the Suez route is disrupted as well' }] }),
    ]);
    const e = (await evaluate(owner, f2.id)).evaluation;
    expect(e, JSON.stringify(e.findings)).toMatchObject({ outcome: 'passed' });
    expect((await read(owner, f2.id)).decision_active.value).toBe(true);
  });
});
