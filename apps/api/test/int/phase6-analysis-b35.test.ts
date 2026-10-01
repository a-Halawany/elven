/**
 * CP-6 B35 §A (0101, part `analysis`) — DECISION OPTION ANALYSIS (F-P6-01: L9-C02, L9-C04, L9-C05, V03-T-160, V03-T-358..-360, V00-T-064,
 * C-024, C-026, V01-T-017), F-P5-07's adversarial-response sensitivity (V01-T-016) and F-P4-08's reversibility and option value across
 * futures, through the real database and controllers, on the decision world (phase6-fixtures' bootDecisionWorld: the corridor twin, its
 * control run with the shock, the reroute on it, the objective "Keep the Regensburg line running through Q1" (the delivery-reliability
 * objective here), the DEC, the corridor scenario with its baseline and downside, its forecast).
 *
 * The package: "Second source for bearings (SYNTHETIC)" — the owner's (L. Brandt's part), three options: keep the single source (the control
 * run), dual-source via Morocco (the air-bridge run stands in for its simulated consequence), raise the safety stock (unsimulated).
 *
 *   a1 CRITERIA WITH EXPOSED WEIGHTS, versioned, a named value-judgment owner; the server's weighted scores and ranking re-derived here;
 *      WEIGHT SENSITIVITY (the weight at which the lead flips) re-derived here and then ENACTED — the next set at that weight changes the
 *      leader; refusals: the Decision Agent (PDP), a non-owner (port 403), a forged actor (port 403), a zero weight, an unknown objective,
 *      a value owner who is not a person, a stale read (409).
 *   a2 CONSTRAINTS AND STAKEHOLDER OBLIGATIONS evaluated per option — the customs obligation (Hauptzollamt, ≤ 5 days) violated by Morocco and
 *      named on the analysis; a constraint; a judgment obligation judged by its owner only; recovery: pre-clearance re-assessed → satisfied.
 *   a3 TRADE-OFFS (dominance, what the leader gives up) re-derived; the VALUE OF INFORMATION of the package on the analysis; the VALIDATED
 *      second-order effects of the cited runs (none before a derivation, the derivation's after); computed assessments from a run, a review
 *      and a value-of-information assessment, refused from a run the option does not cite.
 *   a4 OPTION GENERATION (defer, stage, pilot, hedge, acquire information, exit) by the Decision Agent — each candidate with its rule;
 *      decision.options untouched; the owner ADOPTS one through the existing option route; an option the agent drafts adopts nothing.
 *   a5 AUTOMATIC ASSEMBLY — the scenario and the set, the forecast, the risk, the prior decision, the cited runs, the value of information,
 *      each with why.
 *   a6 REVERSIBILITY AND OPTION VALUE across futures — the bound set's portfolio review's robustness and regret per option and the value of
 *      waiting, on the analysis.
 *   a7 ADVERSARIAL-RESPONSE SENSITIVITY — Morocco under the Moroccan port authority's inspection regime: the rank change re-derived; a
 *      low-agency actor and a non-actor refused.
 *   g  THE LEDGERS: append-only; no decision.package_events row and no outbox row from any analysis act.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout (NORDWERK's data is the demonstration's). Stated superuser moves:
 * none — every row is written through a route; the forged actor goes through the real pipeline with a hand-built handler. No real
 * external integration is exercised.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { AnalysisController } from '../../src/decision/analysis/analysis.controller.js';
import type { ImpactController } from '../../src/twin/simulations/impact/impact.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import type { ScenarioQualityController } from '../../src/prediction/scenarios/quality/quality.controller.js';
import type { ScenarioSetsController } from '../../src/prediction/scenarios/sets/sets.controller.js';
import type { AnatomyController } from '../../src/prediction/scenarios/anatomy/anatomy.controller.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { AnalysisCapability } from '../../src/decision/analysis/analysis.capabilities.js';
import { applyResponse, dominance, scoreOptions, weightSensitivity, type MirrorCriterion } from '../../src/decision/analysis/analysis-core.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import { cite } from './phase5-fixtures.js';
import type { AnyDb } from './helpers.js';

// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b35-analysis-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let ctl: AnalysisController; let impact: ImpactController; let comp: CompositionController; let q: ScenarioQualityController; let setsCtl: ScenarioSetsController; let anatomy: AnatomyController;
let pipeline: PipelineService;
let corridorOwner: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal; let operatorS: AuthenticatedPrincipal;
let processOwner: AuthenticatedPrincipal;
/** What the cases leave one another. */
let PKG = ''; let V = 1; let COST_OBJ = ''; let RSK = ''; let BASE = ''; let DOWN = ''; let SET = ''; let REVIEW = ''; let VOI = ''; let PORT = ''; let EXPORT = ''; let BROKERS = ''; let FUEL = '';
let COMMITTED = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const rows = async (q0: ReturnType<typeof sql>) => (await q0.execute(su)).rows as Row[];
const count = async (q0: ReturnType<typeof sql>) => Number((await rows(q0))[0]!['n']);

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
const A = (as: AuthenticatedPrincipal, action: string, id: string | null) => h.req(as, action, 'DPK', id, 'decision');
const read = async (as: AuthenticatedPrincipal = w.owner, pkg = PKG) => (await ctl.read(A(as, 'decision.analysis.read', pkg), T(), D(), pkg, { payload: {} }) as { analysis: Row & AnalysisView; actors: Row[] });
const setCriteria = (as: AuthenticatedPrincipal, payload: Row, pkg = PKG, v = V) => ctl.criteria(A(as, 'decision.analysis.criteria', pkg), T(), D(), pkg, String(v), { payload }) as Promise<{ criteria: Row }>;
const assess = (as: AuthenticatedPrincipal, payload: Row, pkg = PKG, v = V) => ctl.assess(A(as, 'decision.analysis.assess', pkg), T(), D(), pkg, String(v), { payload }) as Promise<{ assessment: Row }>;
const declareObligation = (as: AuthenticatedPrincipal, payload: Row, pkg = PKG) => ctl.obligation(A(as, 'decision.analysis.obligation', pkg), T(), D(), pkg, { payload }) as Promise<{ obligation: Row }>;
const evaluate = (as: AuthenticatedPrincipal, judgments: Row[] = [], pkg = PKG, v = V) => ctl.evaluate(A(as, 'decision.analysis.evaluate', pkg), T(), D(), pkg, String(v), { payload: { judgments } }) as Promise<{ evaluation: Row & { results: Row[]; violated: Row[] } }>;
const generate = (as: AuthenticatedPrincipal, pkg = PKG, v = V) => ctl.generate(A(as, 'decision.analysis.generate', pkg), T(), D(), pkg, String(v)) as Promise<{ generation: Row & { candidates: Row[]; skipped: Row[] } }>;
const assemble = (as: AuthenticatedPrincipal, pkg = PKG, v = V) => ctl.assemble(A(as, 'decision.analysis.assemble', pkg), T(), D(), pkg, String(v)) as Promise<{ assembly: Row & { items: Array<Row & { why: string[] }> } }>;
const adversarial = (as: AuthenticatedPrincipal, payload: Row, pkg = PKG, v = V) => ctl.adversarial(A(as, 'decision.analysis.adversarial', pkg), T(), D(), pkg, String(v), { payload }) as Promise<{ adversarial: Row }>;
const P = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'prediction');
const tw = (as: AuthenticatedPrincipal, action: string, id: string | null) => h.req(as, action, 'TWN', id, 'twin');
/** A port call with a hand-built handler through the REAL pipeline (the PDP, the capability, the audit) — the port's own refusal proven. */
const forged = (as: AuthenticatedPrincipal, action: string, pkg: string, call: (cap: ReturnType<typeof AnalysisCapability.write>) => Promise<Row>) =>
  pipeline.write(h.env(as, action, 'DPK', pkg, 'decision'), as, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'DPK', objectId: pkg }, AnalysisCapability.write,
    async (cap) => ({ result: await call(cap), targetType: 'DPK', targetId: pkg, targetVersion: null, outboxEvent: null }));

interface AnalysisView {
  criteria: Array<{ key: string; weight: number | string; direction: 'max' | 'min'; objective_id: string; title: string; scale: string; unit: string; value_owner: string }>;
  criteria_version: number; options: Array<{ key: string; values: Record<string, number | string>; normalised: Record<string, number | string>; score: number | string | null; rank: number | null; missing: string[]; bases: Record<string, string> }>;
  ranking: string[]; sensitivity: { leader: string; criteria: Array<{ key: string; weight: number | string; flip_up: { weight: number | string; to: string; change_pct: number | string } | null; flip_down: { weight: number | string; to: string } | null }>; most_sensitive: string | null };
  tradeoffs: { dominance: Array<{ dominant: string; dominated: string }>; non_dominated: string[]; given_up: Array<{ option: string; criteria: Row[] }>; leader: string };
  obligations: Array<{ key: string; evaluations: Record<string, { result: string; basis: Row }> }>; violations: Array<{ obligation: string; option: string; stakeholder: string | null }>;
  value_of_information: Row[]; second_order: Array<Row & { validated: boolean; effects: Row[] }>; futures: { review: Row | null; options: Array<Row & { key: string }>; option_value: Row | null };
  adversarial: Row[]; candidates: Array<Row & { key: string; posture: string; adopted_as: string | null }>; assembly: Row | null; criteria_history: Row[];
}
/** The mirror's inputs read off the server's analysis. */
const mirrorOf = (a: AnalysisView, overrides: Record<string, Record<string, number>> = {}) => {
  const criteria: MirrorCriterion[] = a.criteria.map((x) => ({ key: x.key, weight: Number(x.weight), direction: x.direction }));
  const values: Record<string, Record<string, number | undefined>> = {};
  for (const o of a.options) {
    values[o.key] = {};
    for (const k of criteria.map((x) => x.key)) { const v = o.values[k.toString()]; values[o.key]![k] = v === undefined || v === null ? undefined : Number(v); }
    Object.assign(values[o.key]!, overrides[o.key] ?? {});
  }
  return { criteria, values, m: scoreOptions(criteria, values) };
};
const CRITERIA = (over: Record<string, number> = {}) => [
  { key: 'line_stop', title: 'Line stop days over the horizon', objectiveId: w.objectiveId, direction: 'min', weight: over['line_stop'] ?? 5, scale: 'ratio', unit: 'days' },
  { key: 'cost', title: 'Landed cost premium', objectiveId: COST_OBJ, direction: 'min', weight: over['cost'] ?? 3, scale: 'ratio', unit: 'EUR k' },
  { key: 'customs_days', title: 'Customs clearance lead time', objectiveId: w.objectiveId, direction: 'min', weight: over['customs_days'] ?? 2, scale: 'ratio', unit: 'days' },
];
const runTotal = async (runId: string): Promise<number> => Number((await rows(sql`select outputs -> 'totals' ->> 'line_stop_days' as v from simulation.runs_current where run_id = ${runId}::uuid`))[0]!['v']);
const packageEvents = async () => count(sql`select count(*)::int n from decision.package_events where package_id = ${PKG}::uuid`);
const outboxCount = async () => count(sql`select count(*)::int n from objects.object_outbox`);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { AnalysisController: Ac } = await import('../../src/decision/analysis/analysis.controller.js');
  const { ImpactController: Ic } = await import('../../src/twin/simulations/impact/impact.controller.js');
  const { CompositionController: Cc } = await import('../../src/twin/composition/composition.controller.js');
  const { ScenarioQualityController: Qc } = await import('../../src/prediction/scenarios/quality/quality.controller.js');
  const { ScenarioSetsController: Sc } = await import('../../src/prediction/scenarios/sets/sets.controller.js');
  const { AnatomyController: Nc } = await import('../../src/prediction/scenarios/anatomy/anatomy.controller.js');
  ctl = h.app.get(Ac); impact = h.app.get(Ic); comp = h.app.get(Cc); q = h.app.get(Qc); setsCtl = h.app.get(Sc); anatomy = h.app.get(Nc); pipeline = h.app.get(PipelineService);
  w = await bootDecisionWorld(h); c = decisionCalls(h, w);
  corridorOwner = await h.openSession(w.twinOwner);
  strategist = await h.humanWithSession(['strategy_owner'], 'b35a-strategist');
  analyst = await h.humanWithSession(['domain_analyst'], 'b35a-analyst');
  outsider = await h.humanWithSession(['collection_manager'], 'b35a-outsider');
  operatorS = await h.humanWithSession(['simulation_operator'], 'b35a-operator');
  processOwner = await h.humanWithSession(['twin_owner'], 'b35a-process-owner');
  // a second objective the cost criterion measures (SYNTHETIC), and a risk resting on the delivery objective
  const cost = await w.graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', 'OBJ', null, 'graph'), T(), D(), { payload: { objectType: 'OBJ', title: 'Hold the landed cost of bearings', statement: 'the bearing landed cost premium stays inside the sourcing budget (SYNTHETIC)',
    restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the landed cost is driven by this corridor' }] } }) as { strategy: { objectId: string } };
  COST_OBJ = cost.strategy.objectId;
  const rsk = await w.graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', 'RSK', null, 'graph'), T(), D(), { payload: { objectType: 'RSK', title: 'Single-source bearing supply', statement: 'one bearing source behind the corridor stops the line when it closes (SYNTHETIC)',
    restsOn: [{ kind: 'strategy', id: w.objectiveId, rationale: 'the exposure threatens this objective' }] } }) as { strategy: { objectId: string } };
  RSK = rsk.strategy.objectId;
  const scn = await rows(sql`select branch_id::text, kind from prediction.branches_current where scenario_id = ${w.scenarioId}::uuid`);
  BASE = String(scn.find((b) => b['kind'] === 'baseline')!['branch_id']); DOWN = String(scn.find((b) => b['kind'] === 'downside')!['branch_id']);
  // a PRIOR decision on the same decision object, committed (the fixture's full path)
  COMMITTED = (await c.committed()).pkg;
  // THE PACKAGE (SYNTHETIC): three options on the corridor's runs
  PKG = (await c.declare({ decisionObjectId: w.decisionId, title: 'Second source for bearings (SYNTHETIC)', statement: 'whether to qualify a second bearing source against the corridor scenarios', owner: w.owner.principalId })).package.packageId;
  V = (await c.open(PKG)).version.version;
  await c.option(PKG, V, { key: 'status-quo', title: 'Keep the single source', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
  await c.option(PKG, V, { key: 'morocco', title: 'Dual-source via Morocco', kind: 'intervention', consequences: [{ kind: 'run', id: w.airId }], reversibility: 'the framework contract is cancellable at 90 days' });
  await c.option(PKG, V, { key: 'buffer', title: 'Raise the bearing safety stock', kind: 'intervention', consequences: [{ kind: 'evidence', id: w.evd.id, version: w.evd.version }], unsimulatedReason: 'no run models a stock increase on this twin' });
  await c.terms(PKG, V, c.validTerms());
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B35 §A · a1 CRITERIA WITH EXPOSED WEIGHTS, THE SCORES, THE WEIGHT SENSITIVITY (L9-C05, V03-T-160, V00-T-064)', () => {
  it('a1 · REFUSAL: the Decision Agent and an outsider (PDP); a non-owner (port 403); a forged actor (port 403); a zero weight; an unknown objective; a value owner who is not a person — nothing recorded', async () => {
    const payload = { criteria: CRITERIA(), valueOwner: w.owner.principalId, rationale: 'line stops dominate: the Q1 objective is a running line (SYNTHETIC)', expectedVersion: null };
    await refused(setCriteria(w.agent, payload), /./, 403);
    await refused(setCriteria(outsider, payload), /./, 403);
    await refused(setCriteria(strategist, payload), /^analysis rejected \(ownership\): the criteria of package ".*" are set by its owner or by the owner of the value judgment/, 403);
    await refused(forged(w.owner, 'decision.analysis.criteria', PKG, (cap) => cap.setCriteria({ tenantId: T(), domainId: D(), packageId: PKG, version: V, criteria: CRITERIA(), valueOwner: w.owner.principalId, rationale: payload.rationale,
      expectedVersion: null, actor: w.executive.principalId, correlationId: uuidv7() })), /^analysis rejected \(actor\)/, 403);
    await refused(setCriteria(w.owner, { ...payload, criteria: CRITERIA({ cost: 0 }) }), /^analysis rejected \(weight\): criterion cost carries an exposed weight in \(0, 1000\]/, 422);
    await refused(setCriteria(w.owner, { ...payload, criteria: [{ ...CRITERIA()[0]!, objectiveId: w.decisionId }] }), /^analysis rejected \(unknown_objective\):/, 404);
    await refused(setCriteria(w.owner, { ...payload, valueOwner: w.machinePrincipalId }), /^analysis rejected \(value_owner\)/, 422);
    expect(await count(sql`select count(*)::int n from decision.analysis_criteria`)).toBe(0);
  });

  it('a1 · POSITIVE: the owner sets three criteria (v1) and the values — computed from the cited runs where they exist, entered with a basis otherwise; the SERVER\'s scores, ranking and sensitivity re-derived here', async () => {
    const r = (await setCriteria(w.owner, { criteria: CRITERIA(), valueOwner: w.owner.principalId, rationale: 'line stops dominate: the Q1 objective is a running line (SYNTHETIC)', expectedVersion: null })).criteria;
    expect(r).toMatchObject({ criteria_version: 1, previous_version: null, value_owner: w.owner.principalId, set_by: w.owner.principalId, ranking_before: [], ranking_after: [] });
    expect((r['criteria'] as Row[]).map((x) => [x['key'], x['in_package']])).toEqual([['cost', false], ['customs_days', true], ['line_stop', true]]);
    // line stops: COMPUTED from the runs the options cite; the stock increase has no run — entered with its basis
    const sq = (await assess(w.owner, { option: 'status-quo', criterion: 'line_stop', cited: { kind: 'run', id: w.controlId, measure: 'line_stop_days' } })).assessment;
    expect(sq).toMatchObject({ basis_kind: 'computed', option_key: 'status-quo', criterion_key: 'line_stop' });
    expect(Number(sq['value'])).toBe(await runTotal(w.controlId));
    const mo = (await assess(w.owner, { option: 'morocco', criterion: 'line_stop', cited: { kind: 'run', id: w.airId, measure: 'line_stop_days' } })).assessment;
    expect(Number(mo['value'])).toBe(await runTotal(w.airId));
    await assess(analyst, { option: 'buffer', criterion: 'line_stop', value: 2, basis: 'six weeks of safety stock bridge a two-day gap in a closure (SYNTHETIC)' });
    for (const [o, cost, customs] of [['status-quo', 0, 3], ['morocco', 480, 7], ['buffer', 260, 3]] as const) {
      await assess(analyst, { option: o, criterion: 'cost', value: cost, basis: 'the sourcing desk\'s landed-cost quote for Q1 (SYNTHETIC)' });
      await assess(analyst, { option: o, criterion: 'customs_days', value: customs, basis: 'the customs broker\'s clearance estimate per lane (SYNTHETIC)' });
    }
    const a = (await read()).analysis;
    expect(a.criteria_version).toBe(1);
    expect(a.options.every((o) => o.rank !== null && o.missing.length === 0)).toBe(true);
    expect(a.options.find((o) => o.key === 'status-quo')!.bases).toMatchObject({ line_stop: 'computed', cost: 'entered' });
    const { criteria, m } = mirrorOf(a);
    expect(a.ranking).toEqual(m.ranking);
    for (const o of a.options) expect(Number(o.score)).toBeCloseTo(m.scores[o.key]!, 5);
    const sens = weightSensitivity(criteria, m);
    expect(a.sensitivity.leader).toBe(sens.leader);
    for (const sc of sens.criteria) {
      const srv = a.sensitivity.criteria.find((x) => x.key === sc.key)!;
      if (sc.flipUp === null) expect(srv.flip_up).toBeNull(); else { expect(srv.flip_up!.to).toBe(sc.flipUp.to); expect(Number(srv.flip_up!.weight)).toBeCloseTo(sc.flipUp.weight, 4); }
      if (sc.flipDown === null) expect(srv.flip_down).toBeNull(); else { expect(srv.flip_down!.to).toBe(sc.flipDown.to); expect(Number(srv.flip_down!.weight)).toBeCloseTo(sc.flipDown.weight, 4); }
    }
    expect(a.sensitivity.most_sensitive).toBe(sens.mostSensitive);
    console.log(`B35 §A EVIDENCE a1: ranking ${a.ranking.join(' > ')} (scores ${a.options.map((o) => `${o.key} ${String(o.score)}`).join(', ')}); most sensitive to ${String(a.sensitivity.most_sensitive)}`);
  });

  it('a1 · RECOVERY: a stale read refused (409); read again, the owner moves the most sensitive weight past its flip — the next set (v2) changes the leader as the sensitivity said; the history keeps v1; the named value owner may set v3', async () => {
    const before = (await read()).analysis;
    const flip = before.sensitivity.criteria.map((x) => ({ key: x.key, f: x.flip_up ?? x.flip_down, up: x.flip_up !== null })).filter((x) => x.f !== null)
      .sort((x, y) => Math.abs(Number((x.f as { change_pct?: number | string }).change_pct ?? 0)) - Math.abs(Number((y.f as { change_pct?: number | string }).change_pct ?? 0)))[0];
    expect(flip, 'some weight changes the lead').toBeDefined();
    const target = Number(flip!.f!.weight) * (flip!.up ? 1.02 : 0.98);
    const over = { [flip!.key]: Math.round(target * 1e6) / 1e6 };
    await refused(setCriteria(w.owner, { criteria: CRITERIA(over), valueOwner: w.owner.principalId, rationale: 'a stale second weighting on an old read', expectedVersion: null }), /^analysis rejected \(stale\): the criteria were read at version none and stand at version 1/, 409);
    const r = (await setCriteria(w.owner, { criteria: CRITERIA(over), valueOwner: w.executive.principalId, rationale: `the board weighs ${flip!.key} differently after the corridor review (SYNTHETIC)`, expectedVersion: 1 })).criteria;
    expect(r).toMatchObject({ criteria_version: 2, previous_version: 1, ranking_changed: true, value_owner: w.executive.principalId });
    expect((r['ranking_after'] as string[])[0]).toBe(flip!.f!.to);
    const after = (await read()).analysis;
    expect(after.ranking[0]).toBe(flip!.f!.to);
    expect(after.criteria_history.map((x) => x['criteria_version'])).toEqual([2, 1]);
    // the value owner named on v2 (the executive) may set v3; the package owner still may; the strategist still may not
    const v3 = (await setCriteria(w.executive, { criteria: CRITERIA(), valueOwner: w.owner.principalId, rationale: 'the original weighting restored for the committee (SYNTHETIC)', expectedVersion: 2 })).criteria;
    expect(v3).toMatchObject({ criteria_version: 3, set_by: w.executive.principalId });
    expect(v3['ranking_after']).toEqual(before.ranking);
    console.log(`B35 §A EVIDENCE a1 (sensitivity enacted): ${flip!.key} ${String(before.criteria.find((x) => x.key === flip!.key)!.weight)} → ${over[flip!.key]} makes ${flip!.f!.to} the leader (${before.ranking.join(' > ')} → ${after.ranking.join(' > ')})`);
  });
});

describe('B35 §A · a2 CONSTRAINTS AND STAKEHOLDER OBLIGATIONS EVALUATED PER OPTION (L9-C02, C-026, V01-T-017)', () => {
  it('a2 · POSITIVE: the customs obligation (Hauptzollamt, ≤ 5 days), the line-stop constraint and a works-council judgment declared; the evaluation names Morocco\'s customs violation on the analysis', async () => {
    const ob = (await declareObligation(w.owner, { key: 'customs', kind: 'obligation', stakeholder: 'Hauptzollamt Regensburg (SYNTHETIC)', statement: 'bearings clear customs within five days of arrival (the AEO commitment)',
      test: { kind: 'threshold', criterion: 'customs_days', op: '<=', value: 5 }, owner: w.owner.principalId })).obligation;
    expect(ob).toMatchObject({ key: 'customs', kind: 'obligation', test: { kind: 'threshold', criterion: 'customs_days', op: '<=', value: 5 }, owner_principal_id: w.owner.principalId });
    await declareObligation(w.owner, { key: 'line-stop-cap', kind: 'constraint', stakeholder: null, statement: 'no option may leave the line stopped beyond the ninety-day horizon', test: { kind: 'threshold', criterion: 'line_stop', op: '<=', value: 90 }, owner: w.owner.principalId });
    await declareObligation(w.executive, { key: 'works-council', kind: 'obligation', stakeholder: 'Works council Regensburg (SYNTHETIC)', statement: 'a sourcing change that moves shifts is consulted with the works council', test: { kind: 'judgment' }, owner: w.executive.principalId });
    const e = (await evaluate(w.owner)).evaluation;
    expect(e['recorded']).toBe(6);
    expect(e.violated).toEqual([expect.objectContaining({ obligation: 'customs', option: 'morocco', stakeholder: 'Hauptzollamt Regensburg (SYNTHETIC)' })]);
    const judged = (await evaluate(w.executive, [{ obligation: 'works-council', option: 'morocco', result: 'satisfied', basis: 'the works council was consulted on 2026-09-28 and agreed (SYNTHETIC)' }])).evaluation;
    expect(judged.results.filter((x) => x['obligation'] === 'works-council')).toEqual([expect.objectContaining({ option: 'morocco', result: 'satisfied' })]);
    const a = (await read()).analysis;
    expect(a.violations).toEqual([expect.objectContaining({ obligation: 'customs', option: 'morocco' })]);
    const wc = a.obligations.find((x) => x.key === 'works-council')!;
    expect(wc.evaluations['morocco']!.result).toBe('satisfied');
    expect(wc.evaluations['buffer']!.result).toBe('unknown');
    expect(a.obligations.find((x) => x.key === 'customs')!.evaluations['morocco']!.basis).toMatchObject({ method: 'rule', value: 7, threshold: 5, op: '<=' });
  });

  it('a2 · REFUSAL: a duplicate key (409), an obligation without its stakeholder (422), a judgment by another than the owner (403), a rule obligation judged (422), an unknown option (404), the agent (PDP), a package with nothing declared (422)', async () => {
    await refused(declareObligation(w.owner, { key: 'customs', kind: 'obligation', stakeholder: 'again', statement: 'the same key twice', test: { kind: 'judgment' }, owner: w.owner.principalId }), /^analysis rejected \(duplicate\)/, 409);
    await refused(declareObligation(w.owner, { key: 'nobody', kind: 'obligation', stakeholder: null, statement: 'owed to nobody at all', test: { kind: 'judgment' }, owner: w.owner.principalId }), /^analysis rejected \(stakeholder\)/, 422);
    await refused(declareObligation(w.owner, { key: 'expr', kind: 'constraint', stakeholder: null, statement: 'an expression is not a test', test: { kind: 'threshold', criterion: 'cost', op: 'between', value: 1 }, owner: w.owner.principalId }), /^analysis rejected \(test\)/, 422);
    await refused(evaluate(w.owner, [{ obligation: 'works-council', option: 'buffer', result: 'violated', basis: 'the owner of the package is not the obligation owner' }]), /^analysis rejected \(ownership\): obligation works-council is judged by its owner/, 403);
    await refused(evaluate(w.owner, [{ obligation: 'customs', option: 'buffer', result: 'violated', basis: 'a rule obligation is never judged by a person' }]), /^analysis rejected \(judgment\): obligation customs is evaluated by its rule/, 422);
    await refused(evaluate(w.executive, [{ obligation: 'works-council', option: 'air-bridge', result: 'satisfied', basis: 'an option that does not exist here' }]), /^analysis rejected \(unknown_option\)/, 404);
    await refused(declareObligation(w.agent, { key: 'agent', kind: 'constraint', stakeholder: null, statement: 'an agent never declares', test: { kind: 'judgment' }, owner: w.owner.principalId }), /./, 403);
    await refused(evaluate(w.owner, [], COMMITTED, 1), /^analysis rejected \(state\)/, 409);
  });

  it('a2 · RECOVERY: customs pre-clearance agreed for Morocco — the lane re-assessed (4 days); the next evaluation reads the newest value: satisfied, no violation named', async () => {
    await assess(analyst, { option: 'morocco', criterion: 'customs_days', value: 4, basis: 'AEO pre-clearance agreed with the Hauptzollamt for the Tanger Med lane (SYNTHETIC)' });
    const e = (await evaluate(w.owner)).evaluation;
    expect(e.violated).toEqual([]);
    const a = (await read()).analysis;
    expect(a.violations).toEqual([]);
    expect(a.obligations.find((x) => x.key === 'customs')!.evaluations['morocco']).toMatchObject({ result: 'satisfied', basis: expect.objectContaining({ value: 4 }) });
  });
});

describe('B35 §A · a3 / a6 TRADE-OFFS, THE VALUE OF INFORMATION, THE VALIDATED SECOND-ORDER EFFECTS, ROBUSTNESS AND OPTION VALUE ACROSS FUTURES (V03-T-360, F-P4-08)', () => {
  it('a3 · POSITIVE (trade-offs): dominance and what the leader gives up, re-derived here; no future is reviewed and no information is valued yet; no cited run has a derivation', async () => {
    const a = (await read()).analysis;
    const { criteria, m } = mirrorOf(a);
    expect(a.tradeoffs.dominance).toEqual(dominance(criteria, m));
    expect(a.tradeoffs.leader).toBe(a.ranking[0]);
    for (const g of a.tradeoffs.given_up) for (const x of g.criteria) expect(Number(m.normalised[g.option]![String(x['criterion'])])).toBeGreaterThan(Number(m.normalised[a.ranking[0]!]![String(x['criterion'])]));
    expect(a.value_of_information).toEqual([]);
    expect(a.futures.review).toBeNull();
    expect(a.second_order.map((s) => [s['option'], s.validated, s['reason']])).toEqual([['morocco', false, 'no second-order derivation of this run'], ['status-quo', false, 'no second-order derivation of this run']]);
  });

  it('a3 · REFUSAL: a value computed from a run the option does not cite (422), an unknown measure (422), a value-of-information assessment of no such package (404), a computed value entered beside its citation (422)', async () => {
    await refused(assess(w.owner, { option: 'morocco', criterion: 'line_stop', cited: { kind: 'run', id: w.controlId, measure: 'line_stop_days' } }), /^analysis rejected \(cited\): run .* is not one option morocco cites/, 422);
    await refused(assess(w.owner, { option: 'morocco', criterion: 'line_stop', cited: { kind: 'run', id: w.airId, measure: 'throughput' } }), /^analysis rejected \(measure\)/, 422);
    await refused(assess(w.owner, { option: 'morocco', criterion: 'cost', cited: { kind: 'voi', id: uuidv7(), measure: 'expected_payoff' } }), /^analysis rejected \(unknown_assessment\)/, 404);
    await refused(assess(w.owner, { option: 'morocco', criterion: 'line_stop', value: 1, cited: { kind: 'run', id: w.airId, measure: 'line_stop_days' } }), /^analysis rejected \(basis\): a computed value is read from the cited object/, 422);
  });

  it('a3 · RECOVERY + POSITIVE: the governed probabilities set, "one more week of transit data" assessed for the package (WAIT) — on the analysis as the option value; the composition linked, the reroute\'s second-order effects derived — VALIDATED on the analysis; a value computed from the assessment', async () => {
    const elicit = (low: number, high: number) => ({ method: 'expert_elicitation', low, high, basis: { elicitation: { experts: ['N. Eriksen (SYNTHETIC)', 'J. Weber (SYNTHETIC)'],
      question: 'will the corridor stay open over the next 30 days?', elicited_at: '2026-09-30T10:00:00Z', record: 'two experts, independent estimates, reconciled in a recorded session (SYNTHETIC)' } } });
    await q.setProbability(P(corridorOwner, 'prediction.scenario.probability.set', 'BRN', BASE), T(), D(), BASE, { payload: elicit(0.55, 0.65) });
    await q.setProbability(P(corridorOwner, 'prediction.scenario.probability.set', 'BRN', DOWN), T(), D(), DOWN, { payload: elicit(0.3, 0.4) });
    const info = { label: 'one more week of transit data', delay_days: 7, delay_cost: 40, likelihood_basis: 'a week of daily transit counts separates a recovering corridor from a closed one 9 times in 10 (SYNTHETIC)',
      signals: [{ key: 'recover', label: 'transits recover', likelihoods: { [BASE]: 0.9, [DOWN]: 0.2 } }, { key: 'stay-low', label: 'transits stay low', likelihoods: { [BASE]: 0.1, [DOWN]: 0.8 } }] };
    const voi = (await impact.assess(h.req(w.owner, 'simulation.impact.voi', 'DPK', PKG, 'simulation'), T(), D(), { payload: { scenarioId: w.scenarioId, packageId: PKG, options: [{ key: 'status-quo', title: 'Keep the single source' }, { key: 'morocco', title: 'Dual-source via Morocco' }],
      payoffs: { 'status-quo': { [BASE]: 0, [DOWN]: -2000 }, morocco: { [BASE]: -480, [DOWN]: -600 } }, unit: 'k€', payoffBasis: 'the control and the reroute runs on the corridor, costed per future (SYNTHETIC)', information: info } }) as { assessment: Row }).assessment;
    expect(voi['recommendation']).toBe('wait');
    VOI = String(voi['assessment_id']);
    // a value computed FROM the assessment: the governed weights × the option's payoffs
    const ev = (await assess(w.owner, { option: 'morocco', criterion: 'cost', cited: { kind: 'voi', id: VOI, measure: 'expected_payoff' } })).assessment;
    const weights = Object.fromEntries((voi['branches'] as Row[]).map((b) => [String(b['branch_id']), Number(b['weight'])]));
    expect(Number(ev['value'])).toBeCloseTo(weights[BASE]! * -480 + weights[DOWN]! * -600, 4);
    expect(ev['basis_kind']).toBe('computed');
    await assess(analyst, { option: 'morocco', criterion: 'cost', value: 480, basis: 'the sourcing desk\'s landed-cost quote for Q1 restored as the cost basis (SYNTHETIC)' });
    // the composition (0092 §A; SYNTHETIC): the corridor's contract, the Regensburg process twin, the link — then the reroute's derivation
    await comp.publishContract(tw(corridorOwner, 'twin.contract.publish', w.twinId), T(), D(), w.twinId, { payload: { exposed: { 'supply.capacity_per_day': { unit: 'units/day', cadence: 'on-admission' } },
      approvedUses: { methodFamilies: ['flow', 'discrete-event'], decisionClasses: ['capacity-planning'] } } });
    const pt = await w.twins.declare(tw(processOwner, 'twin.declare', null), T(), D(), { payload: { kind: 'process', title: 'Regensburg plant — assembly line (B35 analysis harness; SYNTHETIC)', statement: 'the line the bearings feed (SYNTHETIC)',
      boundary: [w.entityId], owner: processOwner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
    const o = await w.twins.openVersion(tw(processOwner, 'twin.version', pt.twin.twinId), T(), D(), pt.twin.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString() } }) as { version: { version: number } };
    await w.twins.ground(tw(processOwner, 'twin.ground', pt.twin.twinId), T(), D(), pt.twin.twinId, String(o.version.version), { payload: { elements: [{ key: 'line.capacity_per_day:l1', kind: 'assumed', value: 1000, unit: 'units/day', citations: [cite(w.records.terms)] }] } });
    await w.twins.admit(tw(processOwner, 'twin.version.admit', pt.twin.twinId), T(), D(), pt.twin.twinId, String(o.version.version), { payload: { allowIncomplete: true } });
    await comp.declareLink(tw(processOwner, 'twin.link.declare', pt.twin.twinId), T(), D(), { payload: { upstreamTwinId: w.twinId, downstreamTwinId: pt.twin.twinId, mapping: [{ from: 'supply.capacity_per_day', to: 'supply.capacity_per_day' }], use: 'capacity-planning' } });
    const so = (await impact.secondOrder(h.req(operatorS, 'simulation.impact.second_order', 'SIM', w.airId, 'simulation'), T(), D(), w.airId) as { secondOrder: Row }).secondOrder;
    const a = (await read()).analysis;
    const mo = a.second_order.find((s) => s['option'] === 'morocco')!;
    expect(mo).toMatchObject({ validated: true, derivation_id: so['derivation_id'], reason: null, validity: 'valid' });
    expect(mo.effects.length).toBe((so['effects'] as unknown[]).length);
    expect(a.value_of_information).toEqual([expect.objectContaining({ assessment_id: VOI, recommendation: 'wait' })]);
    expect(a.futures.option_value).toMatchObject({ assessment_id: VOI, recommendation: 'wait', net_value_of_waiting: voi['net_value'] });
    console.log(`B35 §A EVIDENCE a3: the air bridge's effects validated (${mo.effects.length} entities); waiting for the transit data is worth ${String(voi['net_value'])} k€ net`);
  });

  it('a6 · REFUSAL + RECOVERY + POSITIVE: a review measure the review does not yield (422); the set bound and reviewed — robustness and regret per option on the analysis, a value computed from the review', async () => {
    const s = (await setsCtl.declare(P(strategist, 'prediction.scenario.set.declare', 'SCS'), T(), D(), { payload: { title: 'Bearing sourcing futures — B35 analysis harness', purpose: 'the futures the second-source decision is weighed against (SYNTHETIC)',
      policy: { require: ['baseline'], min_branches: 2, min_adverse: 1 } } }) as { set: Row }).set;
    SET = String(s['set_id']);
    await setsCtl.addMember(P(strategist, 'prediction.scenario.set.member', 'SCS', SET), T(), D(), SET, { payload: { scenarioId: w.scenarioId, branchId: null } });
    await setsCtl.activate(P(strategist, 'prediction.scenario.set.activate', 'SCS', SET), T(), D(), SET);
    await setsCtl.bind(P(w.owner, 'prediction.scenario.set.bind', 'SCS', SET), T(), D(), SET, { payload: { packageId: PKG } });
    const members = (await rows(sql`select member_id::text from prediction.scenario_set_members where set_id = ${SET}::uuid and removed_at is null`)).map((x) => ({ member_id: x['member_id'], relevance: 'high', consequence: 'C3' }));
    const payoffs = { 'status-quo': { [BASE]: 0, [DOWN]: -2000 }, morocco: { [BASE]: -480, [DOWN]: -600 }, buffer: { [BASE]: -260, [DOWN]: -900 } };
    const rv = (await setsCtl.review(P(w.owner, 'prediction.scenario.set.review', 'SCS', SET), T(), D(), SET, { payload: { members, options: [{ key: 'status-quo', title: 'Keep the single source' }, { key: 'morocco', title: 'Dual-source via Morocco' },
      { key: 'buffer', title: 'Raise the bearing safety stock' }], payoffs, unit: 'k€', note: 'the second source weighed against the corridor futures (SYNTHETIC)' } }) as { review: Row }).review;
    REVIEW = String(rv['review_id']);
    await refused(assess(w.owner, { option: 'buffer', criterion: 'cost', cited: { kind: 'portfolio_review', id: REVIEW, measure: 'average' } }), /^analysis rejected \(measure\): a portfolio review yields robustness, regret or payoff:<branch_id>/, 422);
    const rob = (await assess(w.owner, { option: 'buffer', criterion: 'cost', cited: { kind: 'portfolio_review', id: REVIEW, measure: 'robustness' } })).assessment;
    expect(Number(rob['value'])).toBe(-900);
    await assess(analyst, { option: 'buffer', criterion: 'cost', value: 260, basis: 'the sourcing desk\'s landed-cost quote for Q1 restored as the cost basis (SYNTHETIC)' });
    const a = (await read()).analysis;
    expect(a.futures.review).toMatchObject({ review_id: REVIEW, set_id: SET, most_robust: ['morocco'], least_regret: ['buffer'], payoff_unit: 'k€' });
    const byKey = Object.fromEntries(a.futures.options.map((x) => [x.key, x]));
    expect([Number(byKey['status-quo']!['robustness']), Number(byKey['morocco']!['robustness']), Number(byKey['buffer']!['robustness'])]).toEqual([-2000, -600, -900]);
    expect([Number(byKey['status-quo']!['regret']), Number(byKey['morocco']!['regret']), Number(byKey['buffer']!['regret'])]).toEqual([1400, 480, 300]);
    expect(byKey['morocco']).toMatchObject({ most_robust: true, reversibility: 'the framework contract is cancellable at 90 days' });
  });
});

describe('B35 §A · a4 OPTION GENERATION (V00-T-064, V03-T-358) · a5 AUTOMATIC ASSEMBLY (V03-T-359, L9-C04)', () => {
  it('a4 · REFUSAL: an outsider (PDP); a committed version (409); an unknown package (404) — nothing generated', async () => {
    await refused(generate(outsider), /./, 403);
    await refused(generate(w.owner, COMMITTED, 1), /^analysis rejected \(state\)/, 409);
    await refused(generate(w.owner, uuidv7(), 1), /^analysis rejected \(unknown_package\)/, 404);
    expect(await count(sql`select count(*)::int n from decision.option_candidates`)).toBe(0);
  });

  it('a4 · POSITIVE: the Decision Agent generates — defer and acquire information (the assessment says WAIT), pilot the unsimulated stock increase, hedge (when the leader is not the most robust), exit the prior commitment — each with its rule; decision.options untouched', async () => {
    const optionsBefore = await count(sql`select count(*)::int n from decision.options where package_id = ${PKG}::uuid`);
    const eventsBefore = await packageEvents();
    const g = (await generate(w.agent)).generation;
    const leader = String(g['leader']);
    const byKey = Object.fromEntries(g.candidates.map((x) => [String(x['key']), x]));
    expect(byKey['defer']).toMatchObject({ posture: 'defer', rule: 'defer@1', generated_by: w.agent.principalId });
    expect(byKey['acquire-information']).toMatchObject({ posture: 'acquire_information', rule: 'acquire_information@1', basis: expect.objectContaining({ voi_assessment: VOI }) });
    expect(byKey['pilot-buffer']).toMatchObject({ posture: 'pilot', rule: 'pilot@1' });
    expect(byKey['exit']).toMatchObject({ posture: 'exit', rule: 'exit@1', basis: expect.objectContaining({ prior_package: COMMITTED }) });
    if (leader === 'morocco') expect(byKey['hedge']).toBeUndefined();
    else expect(byKey['hedge']).toMatchObject({ posture: 'hedge', rule: 'hedge@1', basis: expect.objectContaining({ review_id: REVIEW, most_robust: ['morocco'] }) });
    expect(g.candidates.every((x) => x['adopted_as'] === null)).toBe(true);
    expect(await count(sql`select count(*)::int n from decision.options where package_id = ${PKG}::uuid`)).toBe(optionsBefore);
    expect(await packageEvents()).toBe(eventsBefore);
    console.log(`B35 §A EVIDENCE a4: ${g.candidates.map((x) => `${String(x['posture'])}:${String(x['key'])}`).join(', ')} (leader ${leader})`);
  });

  it('a4 · RECOVERY: the owner ADOPTS "defer" through the existing option route — the candidate marked once; an option the agent drafts with a candidate\'s key adopts nothing; a regeneration skips the option that now exists', async () => {
    await c.option(PKG, V, { key: 'defer', title: 'Defer the decision to the decision deadline', kind: 'intervention', consequences: [], unsimulatedReason: 'deferral is not simulated: it keeps the current routing' });
    await c.option(PKG, V, { key: 'pilot-buffer', title: 'Pilot the stock increase on one line', kind: 'intervention', consequences: [], unsimulatedReason: 'the agent drafts the pilot without a run' }, w.agent);
    const cands = await rows(sql`select key, adopted_as, adopted_by::text, adopted_version from decision.option_candidates where package_id = ${PKG}::uuid order by key`);
    expect(cands.find((x) => x['key'] === 'defer')).toMatchObject({ adopted_as: 'defer', adopted_by: w.owner.principalId, adopted_version: V });
    expect(cands.find((x) => x['key'] === 'pilot-buffer')).toMatchObject({ adopted_as: null });
    const again = (await refusal(sql`update decision.option_candidates set title = 'changed' where package_id = ${PKG}::uuid`.execute(su))).message;
    expect(again).toMatch(/generated and immutable; only its adoption is recorded, once/);
    const g = (await generate(w.owner)).generation;
    expect(g.skipped.map((x) => x['key']).sort()).toEqual(['defer', 'pilot-buffer']);
    const a = (await read()).analysis;
    expect(a.candidates.map((x) => x.key)).not.toContain('defer');
  });

  it('a5 · REFUSAL + RECOVERY + POSITIVE: an outsider (PDP) and an unknown version (404) refused; the agent assembles — the corridor scenario (a member of the bound set), the set, its forecast, the risk resting on the objective, the prior decision, the cited runs, the assessment — each with why', async () => {
    await refused(assemble(outsider), /./, 403);
    await refused(assemble(w.agent, PKG, 9), /^analysis rejected \(unknown_version\)/, 404);
    const as = (await assemble(w.agent)).assembly;
    const find = (kind: string, id: string) => as.items.find((x) => x['kind'] === kind && x['id'] === id);
    expect(find('scenario', w.scenarioId)!.why).toContain('a member of the set "Bearing sourcing futures — B35 analysis harness" bound to the package');
    expect(find('scenario_set', SET)!.why[0]).toMatch(/^bound to the package/);
    expect(find('forecast', w.forecastId)!.why).toContain('the forecast scenario "Bab el-Mandeb over the next 30 days" is built on');
    expect(find('risk', RSK)!.why).toContain('it rests on the objective "Keep the Regensburg line running through Q1"');
    expect(find('prior_decision', COMMITTED)!.why[0]).toMatch(/^decided on the same decision object "Routing of SYN-SHIP-4472" \(committed\)/);
    expect(find('run', w.airId)!.why).toContain('option morocco cites it');
    expect(find('value_of_information', VOI)).toBeDefined();
    expect(as['counts']).toMatchObject({ scenario: 1, scenario_set: 1, risk: 1, prior_decision: 1, run: 2, value_of_information: 1 });
    expect((await read()).analysis.assembly).toMatchObject({ assembly_id: as['assembly_id'] });
  });
});

describe('B35 §A · a7 ADVERSARIAL-RESPONSE SENSITIVITY (V01-T-016, F-P5-07)', () => {
  it('a7 · REFUSAL: a low-agency actor, a driver (not an actor), an unknown element, an option not assessed on every criterion, the agent (PDP) — nothing recorded', async () => {
    const S = w.scenarioId;
    const el = (payload: Row) => anatomy.declareElement(h.req(strategist, 'prediction.scenario.anatomy.element', 'SCN', S, 'prediction'), T(), D(), S, { payload }) as unknown as Promise<{ element: Row & { element_id: string } }>;
    PORT = (await el({ kind: 'actor', name: 'Moroccan port authority', description: 'the authority at Tanger Med that sets the inspection regime (SYNTHETIC)', attributes: { agency: 'high', interest: 'inspection revenue' } })).element.element_id;
    EXPORT = (await el({ kind: 'actor', name: 'Export control authority (origin)', description: 'the authority that licenses bearing exports from the single source\'s country (SYNTHETIC)', attributes: { agency: 'high' } })).element.element_id;
    BROKERS = (await el({ kind: 'actor', name: 'Spot freight brokers', description: 'the brokers who quote spot capacity on the lane (SYNTHETIC)', attributes: { agency: 'low' } })).element.element_id;
    FUEL = (await el({ kind: 'driver', name: 'Bunker fuel price', description: 'the price of marine fuel on the corridor (SYNTHETIC)', attributes: { exogenous: true } })).element.element_id;
    const body = (actor: string, option = 'morocco') => ({ option, actorElementId: actor, response: 'imposes a ten-day inspection on every new bearing supplier', effects: [{ criterion: 'customs_days', op: 'add', value: 10 }, { criterion: 'cost', op: 'multiply', value: 1.2 }],
      basis: 'the authority applied the same regime to new auto suppliers in 2025 (SYNTHETIC)' });
    await refused(adversarial(w.owner, body(BROKERS)), /^analysis rejected \(agency\): actor "Spot freight brokers" has low agency — it cannot change the course/, 422);
    await refused(adversarial(w.owner, body(FUEL)), /^analysis rejected \(agency\): "Bunker fuel price" is a driver of the scenario, not an actor/, 422);
    await refused(adversarial(w.owner, body(uuidv7())), /^analysis rejected \(unknown_actor\)/, 404);
    await refused(adversarial(w.owner, body(PORT, 'defer')), /^analysis rejected \(incomplete\): option defer is not assessed on every criterion/, 422);
    await refused(adversarial(w.agent, body(PORT)), /./, 403);
    expect(await count(sql`select count(*)::int n from decision.adversarial_assessments`)).toBe(0);
  });

  it('a7 · RECOVERY + POSITIVE: the leader (the stock increase on the single source) under the export authority\'s licensing — it loses the lead; Morocco under the port authority\'s inspection regime — already last on both, it keeps its rank; each score and rank re-derived here; the analysis names the rank changes; the actors offered are the package\'s scenarios\'', async () => {
    const before = (await read()).analysis;
    const ranked = before.options.filter((o) => o.rank !== null).map((o) => o.key);
    const leader = before.ranking[0]!;
    const check = async (option: string, actor: string, response: string, effects: Array<{ criterion: string; op: string; value: number }>) => {
      const r = (await adversarial(w.owner, { option, actorElementId: actor, response, effects, basis: 'the authority applied the same regime to comparable suppliers in 2025 (SYNTHETIC)' })).adversarial;
      const o = before.options.find((x) => x.key === option)!;
      const under = applyResponse(Object.fromEntries(Object.entries(o.values).map(([k, v]) => [k, Number(v)])), effects);
      const mirror = mirrorOf({ ...before, options: before.options.filter((x) => ranked.includes(x.key)) }, { [option]: under });
      expect(r).toMatchObject({ option_key: option, actor_agency: 'high', scenario_id: w.scenarioId, base_rank: o.rank });
      expect(r['response_values']).toEqual(under);
      expect(Number(r['response_score'])).toBeCloseTo(mirror.m.scores[option]!, 5);
      expect(Number(r['response_rank'])).toBe(mirror.m.ranking.indexOf(option) + 1);
      expect(Number(r['rank_change'])).toBe(Number(r['base_rank']) - Number(r['response_rank']));
      expect(r['leader_under_response']).toBe(mirror.m.ranking[0]);
      return r;
    };
    // under a licence freeze the stock only delays the stop: the line stops as long as the single source's control run says, plus two weeks to re-source (a declared 'set')
    const sqStop = Number(before.options.find((x) => x.key === 'status-quo')!.values['line_stop']);
    const lead = await check(leader, EXPORT, 'freezes export licences for bearings from the single source', [{ criterion: 'line_stop', op: 'set', value: sqStop + 14 }]);
    expect(Number(lead['rank_change'])).toBeLessThan(0);
    expect(lead['leader_under_response']).not.toBe(leader);
    const mo = await check('morocco', PORT, 'imposes a ten-day inspection on every new bearing supplier', [{ criterion: 'customs_days', op: 'add', value: 10 }, { criterion: 'cost', op: 'multiply', value: 1.2 }]);
    const view = await read();
    expect(view.analysis.adversarial.map((x) => [x['actor'], x['option'], x['rank_change']])).toEqual([
      ['Moroccan port authority', 'morocco', mo['rank_change']], ['Export control authority (origin)', leader, lead['rank_change']]]);
    expect(view.actors.map((x) => x['name']).sort()).toEqual(['Export control authority (origin)', 'Moroccan port authority', 'Spot freight brokers']);
    console.log(`B35 §A EVIDENCE a7: ${leader} ${String(lead['base_rank'])} → ${String(lead['response_rank'])} under the export authority's licensing (score ${String(lead['base_score'])} → ${String(lead['response_score'])}; the lead passes to ${String(lead['leader_under_response'])}); morocco ${String(mo['base_rank'])} → ${String(mo['response_rank'])} under the port authority's inspections`);
  });
});

describe('B35 §A · g THE LEDGERS', () => {
  it('g · the analysis records are append-only; no analysis act wrote a package event or an outbox row; the read refuses an unknown package (404)', async () => {
    for (const t of ['analysis_criteria', 'option_assessments', 'obligations', 'obligation_evaluations', 'package_assemblies', 'adversarial_assessments']) {
      expect((await refusal(sql.raw(`update decision.${t} set scope = scope`).execute(su))).message).toMatch(/append/i);
    }
    const events = (await rows(sql`select event from decision.package_events where package_id = ${PKG}::uuid order by occurred_at, event_id`)).map((x) => String(x['event']));
    expect(events).toEqual(['package.declared', 'version.opened', 'option.set', 'option.set', 'option.set', 'terms.set', 'option.set', 'option.set']);
    const outbox = await outboxCount();
    await generate(w.agent); await assemble(w.agent); await evaluate(w.owner);
    expect(await outboxCount()).toBe(outbox);
    await refused(read(w.owner, uuidv7()), /^analysis rejected \(unknown_package\)/, 404);
  });
});
