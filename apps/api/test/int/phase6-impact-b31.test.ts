/**
 * CP-6 B31 §I (0099) — IMPACT ANALYSIS (F-P5-07: V00-T-062, V01-T-016, V02-T-081/-082/-167, L8-C07, L8-C08, V03-T-348, AI-50-004/-005,
 * IR-17-003) and F-P4-08's comparator sensitivity (CAP-DS-02), through the real database and controllers, on the decision world
 * (phase6-fixtures' bootDecisionWorld: the corridor twin "NORDWERK — Ningbo → Regensburg chain", its control with the shock, the reroute
 * and the air bridge on it, the control without the shock; the corridor scenario with its baseline and downside; a draft package):
 *
 *   s THE SENSITIVITY ANALYSIS (L8-C08, V00-T-062 "request sensitivity analysis"): one at a time over the twelve supply-flow parameters the
 *     run's snapshot names, ranked by swing (the tornado), each factor's numbers re-derived here from the stored contract; ROBUSTNESS across
 *     three seeds (ranks per seed, stable / unstable named); the TIMING of a dated intervention (the air bridge's decision day ±7) — sequencing
 *     sensitivity; refusals: the PDP, the intake (step, seeds, metric, a deterministic run without its jitter), the port (an acting principal
 *     that is not the session's — 403; a forged ranking — 422; an invalidated run — 409); the recovery.
 *   o SECOND-ORDER, DISTRIBUTIONAL AND TIMING EFFECTS (L8-C07, V02-T-082/-167, V03-T-348): refused while the corridor feeds no twin link;
 *     the Regensburg process twin and the enterprise twin linked (0092 §A, their owners' acts); the seeded corridor run's lost production
 *     days per percentile against its counterfactual and the delivery-date shift at Regensburg and at the enterprise (its headroom 0.25 —
 *     the recovery and the day back on plan), the deterministic control's effect re-derived as control − the unshocked control; the port's
 *     REACH (a derivation omitting a linked twin refused); a run without the shock has no shift.
 *   p A SIMULATED FREQUENCY AS A PROBABILITY (AI-50-005): refused without a map, on a deterministic run, with a superseded map; through the
 *     ACTIVE map the event is counted over the run's own samples and the band read from the map — re-derived here.
 *   v THE VALUE OF INFORMATION (V01-T-016, V02-T-167): refused while a branch has no governed probability (narrative never), with
 *     likelihoods that do not sum to 1, with an option outside the package; with the governed probabilities set (an elicitation), "one more
 *     week of transit data" is worth WAITING for — EVPI, EVSI, the net against the delay cost, re-derived here — and the package owner is
 *     routed an item (simulation.value_of_information); a costlier wait says ACT and closes it; the payoffs taken from a PORTFOLIO REVIEW.
 *   c THE COMPARATOR'S SENSITIVITY EVIDENCE (F-P4-08, CAP-DS-02): a run bound to the scenario's baseline analysed — the set's comparison
 *     carries the analysis on that branch (the three widest factors, the robustness verdict), the downside none.
 *   g THE LEDGERS: append-only; the analysed runs' exact run-event lists unchanged (no run.* event added); no outbox row from an analysis.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout (NORDWERK's data is the demonstration's). Stated superuser moves:
 * none — every row is written through a route (the forged port calls go through the real pipeline with a hand-built handler, as the
 * port's own refusals must be proven). No real external integration is exercised.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ImpactController } from '../../src/twin/simulations/impact/impact.controller.js';
import type { CompositionController } from '../../src/twin/composition/composition.controller.js';
import type { ScenarioQualityController } from '../../src/prediction/scenarios/quality/quality.controller.js';
import type { ScenarioSetsController } from '../../src/prediction/scenarios/sets/sets.controller.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { ImpactCapability } from '../../src/twin/simulations/impact/impact.capabilities.js';
import { contractOf } from '../../src/twin/simulations/simulation.service.js';
import { simulateSupplyFlow, type SupplyFlowOutputs } from '../../src/twin/models/supply-flow.js';
import { lostDays, voiOf } from '../../src/twin/simulations/impact/impact-core.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import { cite, completeElements } from './phase5-fixtures.js';
import type { AnyDb } from './helpers.js';

// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b31-impact-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let ctl: ImpactController; let comp: CompositionController; let q: ScenarioQualityController; let setsCtl: ScenarioSetsController; let pipeline: PipelineService;
/** T. Nakamura's part (the corridor's owner, with a session of their own), the run operator (a session), a strategy owner (J. Weber's part),
 *  a forecast owner (the map's), the Regensburg plant's and the enterprise's twin owners, an analyst, an outsider. */
let corridorOwner: AuthenticatedPrincipal; let operatorS: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal; let forecaster: AuthenticatedPrincipal;
let processOwner: AuthenticatedPrincipal; let enterpriseOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
/** What the cases leave one another. */
let SEEDED = ''; let P_TWIN = ''; let E_TWIN = ''; let L_PC = ''; let L_EP = ''; let MAP = ''; let PKG = ''; let BASE = ''; let DOWN = ''; let SET = ''; let REVIEW = ''; let BOUND_RUN = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});
const rows = async (q0: ReturnType<typeof sql>) => (await q0.execute(su)).rows as Row[];
const JITTER = { 0: 0.5, 3: 0.3, 7: 0.2 };

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20 idiom). */
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
const S = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'simulation');
const sensitivity = (as: AuthenticatedPrincipal, runId: string, payload: Row) => ctl.sensitivity(S(as, 'simulation.impact.sensitivity', 'SIM', runId), T(), D(), runId, { payload }) as Promise<{ analysis: Row }>;
const secondOrder = (as: AuthenticatedPrincipal, runId: string) => ctl.secondOrder(S(as, 'simulation.impact.second_order', 'SIM', runId), T(), D(), runId) as Promise<{ secondOrder: Row }>;
const probability = (as: AuthenticatedPrincipal, runId: string, payload: Row) => ctl.probability(S(as, 'simulation.impact.probability', 'SIM', runId), T(), D(), runId, { payload }) as Promise<{ statement: Row }>;
const readImpact = (as: AuthenticatedPrincipal, runId: string) => ctl.read(S(as, 'simulation.impact.read', 'SIM', runId), T(), D(), runId) as Promise<{ impact: Row }>;
const listAnalyses = (as: AuthenticatedPrincipal) => ctl.list(S(as, 'simulation.impact.read', 'SIM'), T(), D(), { payload: {} }) as Promise<{ analyses: Row[] }>;
const assess = (as: AuthenticatedPrincipal, payload: Row) => ctl.assess(S(as, 'simulation.impact.voi', payload['packageId'] ? 'DPK' : 'SCN', (payload['packageId'] ?? payload['scenarioId']) as string), T(), D(), { payload }) as Promise<{ assessment: Row }>;
const assessments = (as: AuthenticatedPrincipal, payload: Row = {}) => ctl.voiList(S(as, 'simulation.impact.read', 'DPK', (payload['packageId'] as string | undefined) ?? null), T(), D(), { payload }) as Promise<{ assessments: Row[] }>;
const tw = (as: AuthenticatedPrincipal, action: string, id: string | null) => h.req(as, action, 'TWN', id, 'twin');
const P = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'prediction');
/** A port call with a hand-built handler through the REAL pipeline (the PDP, the capability, the audit) — the port's own refusal proven. */
const forged = (as: AuthenticatedPrincipal, action: string, runId: string, call: (cap: ReturnType<typeof ImpactCapability.write>) => Promise<Row>) =>
  pipeline.write(h.env(as, action, 'SIM', runId, 'simulation'), as, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'SIM', objectId: runId }, ImpactCapability.write,
    async (cap) => ({ result: await call(cap), targetType: 'SIM', targetId: runId, targetVersion: null, outboxEvent: null }));

/* ───────────── the rows ───────────── */
const runRow = async (id: string) => (await rows(sql`select * from simulation.runs_current where run_id = ${id}::uuid`))[0]!;
const runEvents = async (id: string) => (await rows(sql`select event from simulation.run_events where run_id = ${id}::uuid order by occurred_at, event_id`)).map((r) => String(r['event']));
const items = async (cls: string, subject: string) => rows(sql`select item_id::text, subject_kind, owner_principal_id::text as owner, state, title, details from executive.attention_items
  where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${cls} and subject_id = ${subject}::uuid order by created_at`);
const outboxCount = async () => Number((await rows(sql`select count(*)::int n from objects.object_outbox`))[0]!['n']);

/* ───────────── the composition (0092 §A) ───────────── */
async function declareTwin(owner: AuthenticatedPrincipal, kind: string, title: string): Promise<string> {
  const d = await w.twins.declare(tw(owner, 'twin.declare', null), T(), D(), { payload: { kind, title, statement: `${title} (B31 impact harness; SYNTHETIC)`, boundary: [w.entityId], owner: owner.principalId,
    behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['synthetic'] } } }) as { twin: { twinId: string } };
  return d.twin.twinId;
}
async function admitVersion(owner: AuthenticatedPrincipal, twinId: string, elements: unknown[], observedThrough: string | null = null): Promise<number> {
  const o = await w.twins.openVersion(tw(owner, 'twin.version', twinId), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), ...(observedThrough === null ? {} : { observedThrough }) } }) as { version: { version: number } };
  await w.twins.ground(tw(owner, 'twin.ground', twinId), T(), D(), twinId, String(o.version.version), { payload: { elements } });
  await w.twins.admit(tw(owner, 'twin.version.admit', twinId), T(), D(), twinId, String(o.version.version), { payload: { allowIncomplete: true } });
  return o.version.version;
}
const assumed = (key: string, value: number, unit: string) => ({ key, kind: 'assumed', value, unit, citations: [cite(w.records.terms)] });
const publish = (owner: AuthenticatedPrincipal, twinId: string, exposed: Row) =>
  comp.publishContract(tw(owner, 'twin.contract.publish', twinId), T(), D(), twinId, { payload: { exposed, approvedUses: { methodFamilies: ['flow', 'discrete-event'], decisionClasses: ['capacity-planning'] } } }) as Promise<{ contract: Row }>;
const link = (owner: AuthenticatedPrincipal, up: string, down: string, mapping: Array<{ from: string; to: string }>) =>
  comp.declareLink(tw(owner, 'twin.link.declare', down), T(), D(), { payload: { upstreamTwinId: up, downstreamTwinId: down, mapping, use: 'capacity-planning' } }) as Promise<{ link: Row }>;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ImpactController: Ic } = await import('../../src/twin/simulations/impact/impact.controller.js');
  const { CompositionController: Cc } = await import('../../src/twin/composition/composition.controller.js');
  const { ScenarioQualityController: Qc } = await import('../../src/prediction/scenarios/quality/quality.controller.js');
  const { ScenarioSetsController: Sc } = await import('../../src/prediction/scenarios/sets/sets.controller.js');
  ctl = h.app.get(Ic); comp = h.app.get(Cc); q = h.app.get(Qc); setsCtl = h.app.get(Sc); pipeline = h.app.get(PipelineService);
  w = await bootDecisionWorld(h); c = decisionCalls(h, w);
  corridorOwner = await h.openSession(w.twinOwner);
  operatorS = await h.humanWithSession(['simulation_operator'], 'b31i-operator');
  strategist = await h.humanWithSession(['strategy_owner'], 'b31i-strategist');
  forecaster = await h.humanWithSession(['forecast_owner'], 'b31i-forecaster');
  processOwner = await h.humanWithSession(['twin_owner'], 'b31i-process-owner');
  enterpriseOwner = await h.humanWithSession(['twin_owner'], 'b31i-enterprise-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b31i-analyst');
  outsider = await h.humanWithSession(['collection_manager'], 'b31i-outsider');
  // THE SEEDED CORRIDOR RUN (SYNTHETIC): the control with the shock, 200 samples of lead-time jitter — the distribution the effects are read over
  const r = await w.twins.run(h.req(w.operator, 'simulation.run', 'SIM', null), T(), D(), { payload: { twinId: w.twinId, twinVersion: w.v1, runKind: 'control', controlRunId: null, shock: true,
    component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'seeded', seed: 7, samples: 200, jitter: JITTER } } }) as { run: { runId: string; state: string } };
  expect(r.run.state).toBe('completed');
  SEEDED = r.run.runId;
  const scn = (await rows(sql`select branch_id::text, kind from prediction.branches_current where scenario_id = ${w.scenarioId}::uuid`));
  BASE = String(scn.find((b) => b['kind'] === 'baseline')!['branch_id']); DOWN = String(scn.find((b) => b['kind'] === 'downside')!['branch_id']);
  PKG = (await c.fullDraft({ as: w.owner })).pkg;
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B31 §I · s THE SENSITIVITY ANALYSIS (L8-C08, V00-T-062)', () => {
  it('s · REFUSAL: the PDP (an outsider), the intake (the step, two seeds, an unknown metric of supply-flow@1), an unknown run, a deterministic run asked for robustness without its jitter — nothing recorded', async () => {
    await refused(sensitivity(outsider, w.controlId, {}), /./, 403);
    await refused(sensitivity(operatorS, w.controlId, { relative: 0 }), /^impact analysis rejected \(relative\): the step is a fraction in \(0, 1\]/, 422);
    await refused(sensitivity(operatorS, w.controlId, { seeds: [1, 2] }), /^impact analysis rejected \(robustness\): robustness is judged across 3 to 10 distinct integer seeds/, 422);
    await refused(sensitivity(operatorS, w.controlId, { metric: 'throughput' }), /^impact analysis rejected \(metric\): supply-flow@1 reads total_cost, line_stop_days, days_below_safety_stock/, 422);
    await refused(sensitivity(operatorS, uuidv7(), {}), /^impact analysis rejected \(unknown_run\):/, 404);
    await refused(sensitivity(operatorS, w.controlId, { seeds: [11, 12, 13] }), /^impact analysis rejected \(robustness\): a deterministic run declares the lead-time jitter/, 422);
    expect((await rows(sql`select count(*)::int n from simulation.sensitivity_analyses`))[0]!['n']).toBe(0);
  });

  it('s · POSITIVE: the operator requests the analysis of the corridor control — twelve parameters by their twin element keys, ranked by swing; each factor re-derived here from the stored contract; robust or not across three seeds, ranks per seed', async () => {
    const a = (await sensitivity(operatorS, w.controlId, { metric: 'total_cost', relative: 0.2, seeds: [11, 12, 13], samples: 50, jitter: JITTER })).analysis;
    expect(a).toMatchObject({ run_id: w.controlId, method: 'one_at_a_time', metric: 'total_cost', model_ref: 'supply-flow@1', seeds: [11, 12, 13], requested_by: operatorS.principalId, synthetic_state: true });
    const factors = a['factors'] as Array<Row & { key: string; field: string; rank: number; swing: number; low: { value: number; metric: number }; high: { value: number; metric: number } }>;
    expect(factors).toHaveLength(12);
    expect(factors.map((f) => f.rank)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    for (let i = 1; i < factors.length; i += 1) expect(factors[i]!.swing).toBeLessThanOrEqual(factors[i - 1]!.swing);
    expect(factors.map((f) => f.key)).toEqual(expect.arrayContaining(['shock.corridor_delay_days', 'consumption.weekly:SYN-PART-MAG', 'terms.line_stop_cost_per_day:SYN-LINE-A1', 'inventory.on_hand:SYN-PART-MAG']));
    expect(factors.find((f) => f.key === 'consumption.weekly:SYN-PART-MAG')!['element_kind']).toBe('observed');
    expect(factors.find((f) => f.key === 'shock.corridor_delay_days')!['element_kind']).toBe('assumed');
    // each factor's numbers ARE the pinned model's on the stored contract (re-executed here, deterministic)
    const ct = contractOf(await runRow(w.controlId));
    const det = { ...ct.options, stochastic: { mode: 'deterministic' as const } };
    const base = Number(simulateSupplyFlow(ct.params, det, ct.interventions).totals.cost.total);
    expect(Number(a['base_value'])).toBeCloseTo(base, 6);
    for (const f of factors) {
      const lo = Number(simulateSupplyFlow({ ...ct.params, [f.field]: f.low.value }, det, ct.interventions).totals.cost.total);
      const hi = Number(simulateSupplyFlow({ ...ct.params, [f.field]: f.high.value }, det, ct.interventions).totals.cost.total);
      expect(f.low.metric, f.key).toBeCloseTo(lo, 6);
      expect(f.high.metric, f.key).toBeCloseTo(hi, 6);
      expect(f.swing, f.key).toBeCloseTo(Math.max(Math.abs(lo - base), Math.abs(hi - base)), 6);
    }
    // the line-stop cost scales the dominant cost of a shocked corridor: it cannot be narrow
    expect(factors.findIndex((f) => f.key === 'terms.line_stop_cost_per_day:SYN-LINE-A1')).toBeLessThan(6);
    // ROBUSTNESS: an order per seed, the verdict the port derived from them
    const rob = obj(a['robustness']);
    const ranks = obj(rob['ranks']);
    expect(Object.keys(ranks).sort()).toEqual(['11', '12', '13']);
    for (const s of ['11', '12', '13']) expect((ranks[s] as string[]).slice().sort()).toEqual(factors.map((f) => f.key).sort());
    const moved = factors.filter((f) => new Set(['11', '12', '13'].map((s) => (ranks[s] as string[]).indexOf(f.key))).size > 1).map((f) => f.key);
    expect(a['robustness_verdict']).toBe(moved.length === 0 ? 'stable' : 'unstable');
    expect((rob['unstable'] as Row[]).map((u) => u['key']).sort()).toEqual(moved.sort());
    expect((rob['stable'] as string[]).length + moved.length).toBe(12);
    console.log(`B31 §I EVIDENCE s: widest ${factors.slice(0, 3).map((f) => `${f.key} (${f.swing})`).join(', ')}; robustness ${String(a['robustness_verdict'])}${moved.length ? ` — moved: ${moved.join(', ')}` : ''}`);
  });

  it('s · POSITIVE: the TIMING of the air bridge (its decision day ±7) is a factor of the air-bridge run — sequencing sensitivity; an analyst (a domain expert) requests it; the run\'s impact read lists it', async () => {
    const a = (await sensitivity(analyst, w.airId, { metric: 'line_stop_days', relative: 0.1, timingShiftDays: 7 })).analysis;
    const factors = a['factors'] as Array<Row & { key: string; kind: string; low: { value: string }; high: { value: string } }>;
    const timing = factors.find((f) => f.kind === 'timing')!;
    expect(timing).toMatchObject({ key: 'timing:air_bridge:2024-01-17', base_value: '2024-01-17', low: { value: '2024-01-10' }, high: { value: '2024-01-24' } });
    expect(a).toMatchObject({ robustness_verdict: 'not_assessed', seeds: null, timing_shift_days: 7 });
    const im = (await readImpact(analyst, w.airId)).impact;
    expect((im['analyses'] as Row[]).map((x) => x['analysis_id'])).toEqual([a['analysis_id']]);
    expect((await listAnalyses(analyst)).analyses.map((x) => x['run_id'])).toEqual(expect.arrayContaining([w.airId, w.controlId]));
  });

  it('s · REFUSAL (the port): an acting principal that is not the session\'s (403 actor); a forged ranking (422 factors); robustness asserted stable over ranks that move (422); an INVALIDATED run (409 state)', async () => {
    // the fixture operator passes the PDP (simulation_operator) but acts on the manager's session: the port compares the acting principal
    await refused(sensitivity(w.operator, w.controlId, {}), /^impact analysis rejected \(actor\):/, 403);
    const row = await runRow(w.rerouteId);
    const f = (rank: number, swing: number) => ({ key: `k${rank}`, field: 'x', kind: 'parameter', low: { value: 1, metric: 100 - swing }, high: { value: 2, metric: 100 + swing }, swing, rank });
    await refused(forged(operatorS, 'simulation.impact.sensitivity', w.rerouteId, (cap) => cap.analyseSensitivity({ analysisId: uuidv7(), tenantId: T(), domainId: D(), runId: w.rerouteId,
      outputsDigest: String(row['outputs_digest']), metric: 'total_cost', relative: 0.2, base: 100, factors: [f(1, 5), f(2, 9)], seeds: null, robustness: { verdict: 'not_assessed' },
      timingShiftDays: null, digest: 'a'.repeat(64), actor: operatorS.principalId, correlationId: uuidv7() })), /^impact analysis rejected \(factors\): factor 2 \(k2\) is ranked 2 — the ranks are the order of the swings/, 422);
    await refused(forged(operatorS, 'simulation.impact.sensitivity', w.rerouteId, (cap) => cap.analyseSensitivity({ analysisId: uuidv7(), tenantId: T(), domainId: D(), runId: w.rerouteId,
      outputsDigest: String(row['outputs_digest']), metric: 'total_cost', relative: 0.2, base: 100, factors: [f(1, 9), f(2, 5)], seeds: [1, 2, 3],
      robustness: { verdict: 'stable', ranks: { 1: ['k1', 'k2'], 2: ['k2', 'k1'], 3: ['k1', 'k2'] } }, timingShiftDays: null, digest: 'a'.repeat(64), actor: operatorS.principalId, correlationId: uuidv7() })),
      /^impact analysis rejected \(robustness\): the ranks across the seeds make the verdict unstable, the record says stable/, 422);
    await refused(forged(operatorS, 'simulation.impact.sensitivity', w.rerouteId, (cap) => cap.analyseSensitivity({ analysisId: uuidv7(), tenantId: T(), domainId: D(), runId: w.rerouteId,
      outputsDigest: 'b'.repeat(64), metric: 'total_cost', relative: 0.2, base: 100, factors: [f(1, 9)], seeds: null, robustness: { verdict: 'not_assessed' },
      timingShiftDays: null, digest: 'a'.repeat(64), actor: operatorS.principalId, correlationId: uuidv7() })), /^impact analysis rejected \(stale\):/, 409);
    // the unshocked control INVALIDATED by its twin owner: no analysis of it is recorded
    await w.twins.invalidateRun(S(corridorOwner, 'simulation.run.invalidate', 'SIM', w.control2Id), T(), D(), w.control2Id, { payload: { reason: 'B31 harness: the unshocked control is withdrawn (SYNTHETIC)' } });
    await refused(sensitivity(operatorS, w.control2Id, {}), /^impact analysis rejected \(state\): run .* was invalidated at .*; an invalidated result is not analysed/, 409);
    expect((await rows(sql`select count(*)::int n from simulation.sensitivity_analyses where run_id in (${w.rerouteId}::uuid, ${w.control2Id}::uuid)`))[0]!['n']).toBe(0);
  });

  it('s · RECOVERY: the deterministic run asked for robustness WITH its jitter is analysed; the reroute run analysed after the forged refusals', async () => {
    const a = (await sensitivity(operatorS, w.controlId, { metric: 'line_stop_days', seeds: [21, 22, 23], samples: 30, jitter: JITTER })).analysis;
    expect(['stable', 'unstable']).toContain(a['robustness_verdict']);
    const b = (await sensitivity(operatorS, w.rerouteId, {})).analysis;
    expect(b).toMatchObject({ run_id: w.rerouteId, metric: 'total_cost', robustness_verdict: 'not_assessed' });
    expect((await readImpact(operatorS, w.controlId)).impact['analyses']).toHaveLength(2);
  });
});

describe('B31 §I · o SECOND-ORDER, DISTRIBUTIONAL AND TIMING EFFECTS (L8-C07, V02-T-082/-167, V03-T-348)', () => {
  it('o · REFUSAL: the corridor feeds no twin link yet — no second-order reach (422 links); the PDP (an outsider); an invalidated run (409)', async () => {
    await refused(secondOrder(operatorS, SEEDED), /^impact analysis rejected \(links\): twin .* feeds no live twin link; a run has no second-order reach until a downstream twin declares a link/, 422);
    await refused(secondOrder(outsider, SEEDED), /./, 403);
    await refused(secondOrder(operatorS, w.control2Id), /^impact analysis rejected \(state\):/, 409);
    expect((await rows(sql`select count(*)::int n from simulation.second_order_effects`))[0]!['n']).toBe(0);
  });

  it('o · RECOVERY + POSITIVE: the Regensburg plant and the enterprise link in (their owners\' acts); the seeded corridor run\'s lost days per percentile and the delivery-date shift at Regensburg and at the enterprise, with the recovery the enterprise\'s headroom allows', async () => {
    // THE COMPOSITION (0092 §A; SYNTHETIC): the corridor's contract (its owner), the process twin with its line, the enterprise with its demand
    await publish(corridorOwner, w.twinId, { 'supply.capacity_per_day': { unit: 'units/day', cadence: 'on-admission' } });
    P_TWIN = await declareTwin(processOwner, 'process', 'Regensburg plant — assembly line (process twin)');
    E_TWIN = await declareTwin(enterpriseOwner, 'enterprise', 'Enterprise twin — NORDWERK');
    await admitVersion(processOwner, P_TWIN, [assumed('line.capacity_per_day:l1', 1000, 'units/day')]);
    await admitVersion(enterpriseOwner, E_TWIN, [assumed('demand.per_day', 800, 'units/day'), assumed('process.line_capacity_per_day:regensburg', 1000, 'units/day')]);
    await publish(processOwner, P_TWIN, { 'line.capacity_per_day:l1': { unit: 'units/day', cadence: 'on-admission' } });
    L_PC = String((await link(processOwner, w.twinId, P_TWIN, [{ from: 'supply.capacity_per_day', to: 'supply.capacity_per_day' }])).link['link_id']);
    L_EP = String((await link(enterpriseOwner, P_TWIN, E_TWIN, [{ from: 'line.capacity_per_day:l1', to: 'process.line_capacity_per_day:regensburg' }])).link['link_id']);
    const so = (await secondOrder(operatorS, SEEDED)).secondOrder;
    expect(so).toMatchObject({ run_id: SEEDED, twin_id: w.twinId, links_traversed: 2, synthetic: true });
    const effects = so['effects'] as Array<Row & { depth: number; values: { p10: number; p50: number; p90: number; deterministic: boolean }; timing: Row; basis: Row }>;
    expect(effects.map((e) => [e.depth, e['entity_twin_id'], e['via_link_id'], e['metric']])).toEqual([
      [0, w.twinId, null, 'line_stop_days_added'], [1, P_TWIN, L_PC, 'delivery_date_shift_days'], [2, E_TWIN, L_EP, 'delivery_date_shift_days']]);
    // the distribution re-derived here: the stored samples paired with the counterfactual's (the same contract without the shock)
    const row = await runRow(SEEDED);
    const ct = contractOf(row);
    const cf = simulateSupplyFlow(ct.params, { ...ct.options, shock: false }, ct.interventions);
    const lost = lostDays(row['outputs'] as SupplyFlowOutputs, cf);
    expect(lost.deterministic).toBe(false);
    expect(effects[0]!.values).toEqual(lost);
    expect(lost.p50).toBeGreaterThan(0);
    expect(lost.p10).toBeLessThanOrEqual(lost.p50); expect(lost.p50).toBeLessThanOrEqual(lost.p90);
    const shift = { p10: Math.max(0, lost.p10), p50: Math.max(0, lost.p50), p90: Math.max(0, lost.p90), deterministic: false };
    expect(effects[1]!.values).toEqual(shift); expect(effects[2]!.values).toEqual(shift);
    // the TIMING: the first affected day; the process twin declares no demand (the shift carried); the enterprise's headroom 1000/800 − 1 = 0.25
    const first = (row['outputs'] as SupplyFlowOutputs).totals.first_line_stop_date;
    expect(first).not.toBeNull();
    expect(effects[1]!.timing).toMatchObject({ first_affected: first, headroom: null, recovery_days: null, back_to_plan: null });
    expect(String(effects[1]!.timing['reason'])).toMatch(/declares no demand per day: the shift is carried/);
    const recovery = Math.ceil(shift.p50 / 0.25);
    const d = new Date(`${first}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Math.ceil(shift.p50) + recovery);
    expect(effects[2]!.timing).toMatchObject({ first_affected: first, headroom: 0.25, recovery_days: recovery, back_to_plan: d.toISOString().slice(0, 10), reason: null });
    expect(effects[2]!.basis).toMatchObject({ rule: 'second-order@1', capacity: 1000, demand: 800, via: { link_id: L_EP, upstream_twin_id: P_TWIN } });
    expect(effects[0]!.basis['counterfactual']).toMatch(/re-executed without the shock/);
    const im = (await readImpact(analyst, SEEDED)).impact;
    expect((im['second_order'] as Row[]).map((e) => e['entity_label'])).toEqual(['NORDWERK — Ningbo → Regensburg chain', 'Regensburg plant — assembly line (process twin)', 'Enterprise twin — NORDWERK']);
    console.log(`B31 §I EVIDENCE o: lost days p10/p50/p90 ${lost.p10}/${lost.p50}/${lost.p90} from ${first}; Regensburg delivery dates shift ${shift.p50} days at p50; the enterprise back on plan ${String(effects[2]!.timing['back_to_plan'])} (recovery ${recovery} days at 25% headroom)`);
  });

  it('o · POSITIVE: the deterministic control — its effect IS the control\'s line-stop days minus the unshocked control\'s (the same contract without the shock), one value thrice', async () => {
    const effects = (await secondOrder(operatorS, w.controlId)).secondOrder['effects'] as Array<Row & { values: Row }>;
    const a = (await runRow(w.controlId))['outputs'] as SupplyFlowOutputs; const b = (await runRow(w.control2Id))['outputs'] as SupplyFlowOutputs;
    const L = a.totals.line_stop_days - b.totals.line_stop_days;
    expect(effects[0]!.values).toEqual({ p10: L, p50: L, p90: L, deterministic: true });
    expect(effects[1]!.values).toEqual({ p10: Math.max(0, L), p50: Math.max(0, L), p90: Math.max(0, L), deterministic: true });
  });

  it('o · REFUSAL (the port\'s REACH): a derivation that leaves the enterprise out, or names a link that does not reach from the run\'s twin, is refused; a run without the shock moves no delivery date', async () => {
    const row = await runRow(w.rerouteId);
    const eff = (depth: number, twin: string, via: string | null) => ({ depth, entity_twin_id: twin, via_link_id: via, values: { p10: 1, p50: 1, p90: 1, deterministic: true }, timing: {}, basis: {} });
    await refused(forged(operatorS, 'simulation.impact.second_order', w.rerouteId, (cap) => cap.deriveSecondOrder({ derivationId: uuidv7(), tenantId: T(), domainId: D(), runId: w.rerouteId,
      outputsDigest: String(row['outputs_digest']), effects: [eff(0, w.twinId, null), eff(1, P_TWIN, L_PC)], actor: operatorS.principalId, correlationId: uuidv7() })),
      /^impact analysis rejected \(reach\): live link .* reaches from twin .* and is not traversed; a derivation covers every linked twin/, 422);
    await refused(forged(operatorS, 'simulation.impact.second_order', w.rerouteId, (cap) => cap.deriveSecondOrder({ derivationId: uuidv7(), tenantId: T(), domainId: D(), runId: w.rerouteId,
      outputsDigest: String(row['outputs_digest']), effects: [eff(0, w.twinId, null), eff(1, E_TWIN, L_EP), eff(2, P_TWIN, L_PC)], actor: operatorS.principalId, correlationId: uuidv7() })),
      /^impact analysis rejected \(reach\): link .* starts at twin .*, which no effect one level up names/, 422);
    // a run whose own shock is off: nothing is lost, no delivery date moves (the reroute is on the shocked control; the unshocked control is invalidated — a fresh one)
    const r = await w.twins.run(h.req(w.operator, 'simulation.run', 'SIM', null), T(), D(), { payload: { twinId: w.twinId, twinVersion: w.v1, runKind: 'control', controlRunId: null, shock: false,
      component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } } }) as { run: { runId: string } };
    const effects = (await secondOrder(operatorS, r.run.runId)).secondOrder['effects'] as Array<Row & { values: Row; timing: Row }>;
    expect(effects[0]!.values).toMatchObject({ p50: 0 });
    expect(effects[1]!.timing).toMatchObject({ first_affected: null, reason: 'no delivery date moves at the median' });
  });
});

describe('B31 §I · p A SIMULATED FREQUENCY AS A PROBABILITY (AI-50-005)', () => {
  const BANDS = [
    { frequency_label: 'rare', min_per_year: 0, max_per_year: 0.2, probability_low: 0, probability_high: 0.05 },
    { frequency_label: 'occasional', min_per_year: 0.2, max_per_year: 1, probability_low: 0.05, probability_high: 0.25 },
    { frequency_label: 'frequent', min_per_year: 1, max_per_year: 5, probability_low: 0.25, probability_high: 0.6 },
    { frequency_label: 'very frequent', min_per_year: 5, max_per_year: null, probability_low: 0.6, probability_high: 0.9 },
  ];
  const EVENT = { metric: 'line_stop_days', op: '>', threshold: 0, label: 'the Regensburg line stops at least one day' };

  it('p · REFUSAL: without a map (frequency_map), on a deterministic run (samples), the PDP (an analyst), an unknown map — nothing stated', async () => {
    await refused(probability(strategist, SEEDED, { event: EVENT }), /^impact analysis rejected \(frequency_map\): a simulated frequency becomes a probability only through an APPROVED frequency map/, 422);
    await refused(probability(analyst, SEEDED, { event: EVENT }), /./, 403);
    await refused(probability(strategist, SEEDED, { mapId: uuidv7(), event: EVENT }), /^impact analysis rejected \(unknown_map\):/, 404);
    const m = (await q.declareMap(P(forecaster, 'prediction.scenario.probability.map', 'FPM'), T(), D(), { payload: { name: 'Corridor line-stop frequency (SYNTHETIC)', horizon: 'the next 12 months', bands: BANDS } }) as { map: Row }).map;
    MAP = String(m['map_id']);
    await refused(probability(strategist, w.controlId, { mapId: MAP, event: EVENT }), /^impact analysis rejected \(samples\): run .* is supply-flow@1 \(deterministic\)/, 422);
    await refused(probability(strategist, SEEDED, { mapId: MAP, event: { ...EVENT, op: '<' } }), /^impact analysis rejected \(event\):/, 422);
    expect((await rows(sql`select count(*)::int n from simulation.probability_statements`))[0]!['n']).toBe(0);
  });

  it('p · RECOVERY + POSITIVE: through the ACTIVE map the event is counted over the run\'s own 200 samples, the yearly frequency by the stated conversion, the band read from the map — re-derived here', async () => {
    const s = (await probability(strategist, SEEDED, { mapId: MAP, event: EVENT })).statement;
    const totals = ((await runRow(SEEDED))['outputs'] as SupplyFlowOutputs).stochastic as Extract<SupplyFlowOutputs['stochastic'], { mode: 'seeded' }>;
    const occ = totals.sample_totals.filter((t) => t.line_stop_days > 0).length;
    const f = Math.round((occ / 200) * 1e6) / 1e6; const perYear = Math.round(f * 365 / 90 * 1e6) / 1e6;
    const band = BANDS.find((b) => b.min_per_year <= perYear && (b.max_per_year === null || perYear < b.max_per_year))!;
    expect(s).toMatchObject({ run_id: SEEDED, map_id: MAP, map_version: 1, samples: 200, occurrences: occ, horizon_days: 90, stated_by: strategist.principalId, synthetic: true });
    expect(Number(s['frequency'])).toBeCloseTo(f, 6); expect(Number(s['per_year'])).toBeCloseTo(perYear, 6);
    expect([Number(s['probability_low']), Number(s['probability_high'])]).toEqual([band.probability_low, band.probability_high]);
    expect(String(s['conversion'])).toMatch(/each window an independent trial/);
    expect(String(s['caveat'])).toMatch(/not a calibrated real-world probability/);
    console.log(`B31 §I EVIDENCE p: ${occ}/200 samples stop the line → ${perYear}/year → ${band.frequency_label} [${band.probability_low}, ${band.probability_high}] through map v1`);
  });

  it('p · REFUSAL then RECOVERY: the map superseded by its next version — the old version refused (409 state), the new one states', async () => {
    const m2 = (await q.declareMap(P(forecaster, 'prediction.scenario.probability.map', 'FPM'), T(), D(), { payload: { name: 'Corridor line-stop frequency (SYNTHETIC)', horizon: 'the next 12 months',
      bands: BANDS.map((b) => (b.frequency_label === 'frequent' ? { ...b, probability_high: 0.55 } : b)) } }) as { map: Row }).map;
    await refused(probability(strategist, SEEDED, { mapId: MAP, event: EVENT }), /^impact analysis rejected \(state\): map ".*" version 1 is superseded/, 409);
    const s = (await probability(forecaster, SEEDED, { mapId: String(m2['map_id']), event: EVENT })).statement;
    expect(s).toMatchObject({ map_version: 2 });
    expect((await readImpact(analyst, SEEDED)).impact['probabilities']).toHaveLength(2);
  });
});

describe('B31 §I · v THE VALUE OF INFORMATION (V01-T-016, V02-T-167)', () => {
  // the payoffs (k€, SYNTHETIC): doing nothing costs the line stop under the downside; the reroute costs its premium everywhere
  const OPTIONS = [{ key: 'status-quo', title: 'Do nothing' }, { key: 'reroute', title: 'Reroute via the Cape' }];
  const payoffs = () => ({ 'status-quo': { [BASE]: 0, [DOWN]: -2000 }, reroute: { [BASE]: -480, [DOWN]: -600 } });
  const info = (delayCost: number, over: Row = {}) => ({ label: 'one more week of transit data', delay_days: 7, delay_cost: delayCost,
    signals: [{ key: 'recover', label: 'transits recover', likelihoods: { [BASE]: 0.9, [DOWN]: 0.2 } }, { key: 'stay-low', label: 'transits stay low', likelihoods: { [BASE]: 0.1, [DOWN]: 0.8 } }],
    likelihood_basis: 'a week of daily transit counts separates a recovering corridor from a closed one 9 times in 10 (SYNTHETIC)', ...over });
  const entered = (delayCost: number, over: Row = {}) => ({ scenarioId: w.scenarioId, packageId: PKG, options: OPTIONS, payoffs: payoffs(), unit: 'k€',
    payoffBasis: 'the control and the reroute runs on the corridor, costed per future (SYNTHETIC)', information: info(delayCost), ...over });

  it('v · REFUSAL: a branch with no governed probability (narrative never), the PDP (an analyst), likelihoods that do not sum to 1, an option outside the package — nothing recorded', async () => {
    await refused(assess(w.owner, entered(40)), /^value of information rejected \(no_probability\): branch ".*" has no governed probability — set one by a frequency map, an elicitation or a model run/, 422);
    await refused(assess(analyst, entered(40)), /./, 403);
    expect((await rows(sql`select count(*)::int n from simulation.voi_assessments`))[0]!['n']).toBe(0);
  });

  it('v · RECOVERY + POSITIVE (wait): the scenario owner sets both bands by elicitation; "one more week of transit data" is worth WAITING for — EVPI, EVSI and the net re-derived here; the package owner is routed the item', async () => {
    const elicit = (low: number, high: number) => ({ method: 'expert_elicitation', low, high, basis: { elicitation: { experts: ['N. Eriksen (SYNTHETIC)', 'J. Weber (SYNTHETIC)'],
      question: 'will the corridor stay open over the next 30 days?', elicited_at: '2026-09-30T10:00:00Z', record: 'two experts, independent estimates, reconciled in a recorded session (SYNTHETIC)' } } });
    await q.setProbability(P(corridorOwner, 'prediction.scenario.probability.set', 'BRN', BASE), T(), D(), BASE, { payload: elicit(0.55, 0.65) });
    await q.setProbability(P(corridorOwner, 'prediction.scenario.probability.set', 'BRN', DOWN), T(), D(), DOWN, { payload: elicit(0.3, 0.4) });
    // the remaining refusals, now that the probabilities stand
    const bad = info(40); (bad.signals as Array<{ likelihoods: Row }>)[0]!.likelihoods[DOWN] = 0.3;
    await refused(assess(w.owner, entered(40, { information: bad })), /^value of information rejected \(likelihood\): under branch .* the signals' likelihoods sum to 1\.1/, 422);
    await refused(assess(w.owner, entered(40, { options: [...OPTIONS, { key: 'air-bridge', title: 'Air bridge' }], payoffs: { ...payoffs(), 'air-bridge': { [BASE]: -90, [DOWN]: -90 } } })),
      /^value of information rejected \(unknown_option\): air-bridge is not an option of package/, 404);
    const a = (await assess(w.owner, entered(40))).assessment;
    const wts = { [BASE]: 0.6 / 0.95, [DOWN]: 0.35 / 0.95 };
    const mirror = voiOf(wts, payoffs(), info(40).signals as Array<{ key: string; likelihoods: Record<string, number> }>, 40);
    expect(a).toMatchObject({ package_id: PKG, scenario_id: w.scenarioId, source: 'entered', recommendation: 'wait', prior_best: ['reroute'], recorded_by: w.owner.principalId, payoff_unit: 'k€' });
    expect(Number(a['evpi'])).toBeCloseTo(mirror.evpi, 3);
    expect(Number(a['evsi'])).toBeCloseTo(mirror.evsi, 3);
    expect(Number(a['net_value'])).toBeCloseTo(mirror.net, 3);
    expect(mirror.recommendation).toBe('wait');
    expect(Number(a['evsi'])).toBeLessThanOrEqual(Number(a['evpi']));
    expect((a['branches'] as Row[]).map((b) => [b['branch_id'], b['method'], Number(b['weight'])])).toEqual(
      [[BASE, 'expert_elicitation', Math.round(wts[BASE]! * 1e6) / 1e6], [DOWN, 'expert_elicitation', Math.round(wts[DOWN]! * 1e6) / 1e6]].sort((x, y) => (String(x[0]) < String(y[0]) ? -1 : 1)));
    const post = a['posteriors'] as Array<Row>;
    expect(post.map((p) => [p['key'], p['best']])).toEqual([['recover', ['status-quo']], ['stay-low', ['reroute']]]);
    const it0 = await items('simulation.value_of_information', PKG);
    expect(it0).toHaveLength(1);
    expect(it0[0]).toMatchObject({ subject_kind: 'package', owner: w.owner.principalId, state: 'open' });
    expect(obj(it0[0]!['details'])).toMatchObject({ assessment_id: a['assessment_id'], recommendation: 'wait', delay_days: 7 });
    console.log(`B31 §I EVIDENCE v: EVPI ${String(a['evpi'])} k€, EVSI ${String(a['evsi'])} k€, delay cost 40 k€ → net ${String(a['net_value'])} k€: WAIT for one more week of transit data (acting now: reroute)`);
  });

  it('v · POSITIVE (act): a costlier wait says ACT now — the open item closes; the assessments list both, newest first', async () => {
    const a = (await assess(strategist, entered(400))).assessment;
    expect(a).toMatchObject({ recommendation: 'act', item_id: null });
    expect(Number(a['net_value'])).toBeLessThan(0);
    const it1 = await items('simulation.value_of_information', PKG);
    expect(it1.map((x) => x['state'])).toEqual(['closed']);
    const list = (await assessments(analyst, { packageId: PKG })).assessments;
    expect(list.map((x) => x['recommendation'])).toEqual(['act', 'wait']);
  });

  it('v · POSITIVE (the portfolio review\'s payoffs): a set over the corridor scenario, reviewed by the decision owner; the assessment takes the review\'s matrix and unit; entering a matrix beside a review is refused', async () => {
    const s = (await setsCtl.declare(P(strategist, 'prediction.scenario.set.declare', 'SCS'), T(), D(), { payload: { title: 'Corridor set — B31 impact harness', purpose: 'the futures the reroute decision is weighed against (SYNTHETIC)',
      policy: { require: ['baseline'], min_branches: 2, min_adverse: 1 } } }) as { set: Row }).set;
    SET = String(s['set_id']);
    await setsCtl.addMember(P(strategist, 'prediction.scenario.set.member', 'SCS', SET), T(), D(), SET, { payload: { scenarioId: w.scenarioId, branchId: null } });
    await setsCtl.activate(P(strategist, 'prediction.scenario.set.activate', 'SCS', SET), T(), D(), SET);
    const members = ((await rows(sql`select member_id::text from prediction.scenario_set_members where set_id = ${SET}::uuid and removed_at is null`))).map((m) => ({ member_id: m['member_id'], relevance: 'high', consequence: 'C3' }));
    const rv = (await setsCtl.review(P(w.owner, 'prediction.scenario.set.review', 'SCS', SET), T(), D(), SET, { payload: { members, options: OPTIONS, payoffs: payoffs(), unit: 'EUR k', note: 'the reroute weighed against the corridor futures (SYNTHETIC)' } }) as { review: Row }).review;
    REVIEW = String(rv['review_id']);
    await refused(assess(w.owner, { scenarioId: w.scenarioId, packageId: PKG, reviewId: REVIEW, options: OPTIONS, payoffs: payoffs(), information: info(40) }), /^value of information rejected \(payoffs\): the payoffs come from the review or are entered, not both/, 422);
    const a = (await assess(w.owner, { scenarioId: w.scenarioId, packageId: PKG, reviewId: REVIEW, information: info(40) })).assessment;
    expect(a).toMatchObject({ source: 'portfolio_review', review_id: REVIEW, payoff_unit: 'EUR k', recommendation: 'wait' });
    expect(a['payoffs']).toEqual(payoffs());
    expect(String(a['payoff_basis'])).toMatch(new RegExp(`^portfolio review ${REVIEW} of set ${SET}`));
  });
});

describe('B31 §I · c THE COMPARATOR\'S SENSITIVITY EVIDENCE (F-P4-08, CAP-DS-02)', () => {
  it('c · POSITIVE (before) + REFUSAL: the set\'s comparison carries a `sensitivity` for each branch — none yet; a refused analysis of a run on the baseline leaves it none', async () => {
    const cmp = (await setsCtl.compare(P(analyst, 'prediction.scenario.set.read', 'SCS', SET), T(), D(), SET) as { comparison: Row }).comparison;
    expect(cmp['sensitivity_available']).toBe(true);
    expect((cmp['branches'] as Row[]).map((b) => b['sensitivity'])).toEqual([null, null]);
    // a run BOUND to the baseline: a second corridor version admitted after the scenario was recorded (the binding's cut-off), then a control on the baseline (no shock)
    const v2 = await admitVersion(corridorOwner, w.twinId, completeElements(w.records), '2024-01-17');
    const r = await w.twins.run(h.req(w.operator, 'simulation.run', 'SIM', null), T(), D(), { payload: { twinId: w.twinId, twinVersion: v2, runKind: 'control', controlRunId: null, shock: false,
      scenarioId: w.scenarioId, scenarioBranchId: BASE, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } } }) as { run: { runId: string } };
    BOUND_RUN = r.run.runId;
    await refused(sensitivity(operatorS, BOUND_RUN, { seeds: [1, 2, 3] }), /^impact analysis rejected \(robustness\): a deterministic run declares the lead-time jitter/, 422);
    const again = (await setsCtl.compare(P(analyst, 'prediction.scenario.set.read', 'SCS', SET), T(), D(), SET) as { comparison: Row }).comparison;
    expect((again['branches'] as Row[]).find((b) => b['branch_id'] === BASE)!['sensitivity']).toBeNull();
  });

  it('c · RECOVERY + POSITIVE: the bound run analysed — the comparison shows its analysis on the baseline (the three widest factors, the robustness verdict, the run valid), the downside none', async () => {
    const a = (await sensitivity(operatorS, BOUND_RUN, { seeds: [1, 2, 3], samples: 20, jitter: JITTER })).analysis;
    const cmp = (await setsCtl.compare(P(analyst, 'prediction.scenario.set.read', 'SCS', SET), T(), D(), SET) as { comparison: Row }).comparison;
    const base = obj((cmp['branches'] as Row[]).find((b) => b['branch_id'] === BASE)!['sensitivity']);
    expect(base).toMatchObject({ analysis_id: a['analysis_id'], run_id: BOUND_RUN, run_validity: 'valid', run_state: 'completed', metric: 'total_cost', robustness_verdict: a['robustness_verdict'], factor_count: 12 });
    expect((base['top'] as Row[]).map((f) => f['key'])).toEqual((a['factors'] as Row[]).slice(0, 3).map((f) => f['key']));
    expect((cmp['branches'] as Row[]).find((b) => b['branch_id'] === DOWN)!['sensitivity']).toBeNull();
  });
});

describe('B31 §I · g THE LEDGERS', () => {
  it('g · the four records are append-only; the analysed runs\' exact run-event lists unchanged (no run.* event added); an analysis writes no outbox row', async () => {
    for (const t of ['sensitivity_analyses', 'second_order_effects', 'voi_assessments', 'probability_statements']) {
      const e = await sql.raw(`update simulation.${t} set correlation_id = correlation_id`).execute(su).then(() => 'ok', (x: unknown) => String(x));
      expect(e, t).toMatch(/append-only|prohibited/i);
      const d = await sql.raw(`delete from simulation.${t}`).execute(su).then(() => 'ok', (x: unknown) => String(x));
      expect(d, t).toMatch(/append-only|prohibited/i);
    }
    expect(await runEvents(w.controlId)).toEqual(['run.opened', 'run.completed']);
    expect(await runEvents(SEEDED)).toEqual(['run.opened', 'run.completed']);
    expect(await runEvents(w.airId)).toEqual(['run.opened', 'run.completed']);
    const before = await outboxCount();
    await sensitivity(operatorS, w.airId, {});
    await secondOrder(operatorS, SEEDED);
    expect(await outboxCount()).toBe(before);
  });
});
