/**
 * CP-6 B35 part `recommendation` (migration 0101 §R) — THE RECOMMENDATION (F-P6-02: CAP-DS-09/-10, OBJ-33, FEX-15, WS-15, HX-08, PR-38-001..006),
 * F-P4-09's B35 piece (the scenario QUALITY failure consulted by the recommendation), F-P5-06's B35 piece (the stability and constraint
 * INDICATORS read by simulation.run_decision_use and by the recommendation — ES-38-008) and the decision COVERAGE (ES-37-008), through the
 * real database and controllers (POST …/decisions/recommendations/…, the decision, twin, prediction and quality routes), on the world of
 * `bootDecisionWorld` and this file's own humans with sessions and a REGISTERED Decision Agent (its own session, kind agent). Every figure
 * is SYNTHETIC; nothing here is a real external integration.
 *
 *   r1 · THE OBJECT: what, for whom, by when, the assumptions, what could make it wrong (required), the missing evidence, the four SEPARATED
 *        components (value judgments, policy constraints, analytical assumptions, model outputs — each sourced); recorded by the Decision
 *        Agent (author kind agent) and by the owner (human); the refusals; a re-record supersedes.
 *   r2 · THE REVIEW: AI and human SIDE BY SIDE; accept for consideration by a named human who is not the author, the comparison read at
 *        review; the agent never reviews (the PEP), the author never reviews its own (the port); request changes → a re-record → accepted.
 *   r3 · FEX-15: a version carrying recommendations that is incomplete is NOT proposed (incomplete package rejected (unattested)); without
 *        recommendations nothing new (proposes as before); the owner attests the named gaps, a second human acknowledges; the version's
 *        recommendations set aside; it proposes HUMAN-LED (the DPK header says so); a recommendation on it refused; completing instead works.
 *   r4 · F-P4-09: a recommendation on an option resting on a scenario FAILING its quality evaluation is FLAGGED; accepting it without the
 *        reviewer's stated override is refused (quality_flagged); with it, accepted and the override recorded.
 *   r5 · F-P5-06: run_decision_use (re-declared) reads an UNSTABLE last checkpoint and a VIOLATED / INDETERMINATE completion constraint check
 *        — DIAGNOSTIC with the reason; the recommendation reads them as indicator flags; a stable next checkpoint clears the flag. (The
 *        experiment and the constraint verdicts are planted by STATED superuser inserts standing for §O's and §D's ports, the B31 idiom.)
 *   r6 · ES-37-008: the decision coverage — the share of the live branches the recommended option was assessed on; not applicable without
 *        a scenario; a fuller option covers more.
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
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { ScenarioQualityController } from '../../src/prediction/scenarios/quality/quality.controller.js';
import type { ValidityController } from '../../src/twin/simulations/validity/validity.controller.js';
import type { RecommendationController } from '../../src/decision/recommendation/recommendation.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b35-recommendation-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let prediction: PredictionController; let twins: TwinController; let quality: ScenarioQualityController; let validity: ValidityController; let rc: RecommendationController;
let strategyOwner: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let admin: AuthenticatedPrincipal;
/** The REGISTERED Decision Agent's own session (identity kind agent, role decision_agent). */
let agent: AuthenticatedPrincipal;
/** What the cases leave one another. */
let S2 = ''; let S2BASE = ''; let S2DOWN = ''; let S2DISRUPT = ''; let Q = ''; let QBASE = ''; let vTwin = 0; let QI1 = ''; let QI2 = '';
let S2BASE_RUN = ''; let S2DOWN_RUN = ''; let Q_RUN = ''; let IND_RUN = ''; let CON_RUN = ''; let CON2_RUN = ''; let EXP = '';
let A = { pkg: '', v: 0 }; let AGENT_REC = ''; let OWNER_REC = ''; let OWNER_REC2 = '';
let F = { pkg: '', v: 0 };
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;

/* ───────────── refusals (the B21/B27/B31 idiom) ───────────── */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number): Promise<string> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r.message;
};
const evidence = (caseName: string, e: Row): void => console.log(`B35 RECOMMENDATION EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the routes ───────────── */
const rreq = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'decision');
const record = (as: AuthenticatedPrincipal, pkg: string, v: number, payload: Row) =>
  rc.record(rreq(as, 'decision.recommendation.record', 'DPK', pkg), T(), D(), pkg, String(v), { payload }) as unknown as Promise<{ recommendation: Row & { recommendation_id: string; flags: Row[]; coverage: Row } }>;
const review = (as: AuthenticatedPrincipal, id: string, payload: Row) =>
  rc.review(rreq(as, 'decision.recommendation.review', 'REC', id), T(), D(), id, { payload }) as unknown as Promise<{ review: Row & { comparison: Row[]; state: string } }>;
const withdrawRec = (as: AuthenticatedPrincipal, id: string, reason: string) =>
  rc.withdraw(rreq(as, 'decision.recommendation.withdraw', 'REC', id), T(), D(), id, { payload: { reason } }) as unknown as Promise<{ withdrawal: Row }>;
const view = async (pkg: string, as: AuthenticatedPrincipal = analyst) =>
  ((await rc.view(rreq(as, 'decision.recommendation.read', 'DPK', pkg), T(), D(), pkg)) as unknown as { package: Row & { recommendations: Array<Row & { recommendation_id: string; flags: Row[]; coverage: Row; reviews: Row[] }>;
    side_by_side: { version: number; agent: string[]; human: string[] }; completeness: Row & { gaps: Row[] }; attestations: Row[]; events: Row[] } }).package;
const completeness = async (pkg: string, v: number, as: AuthenticatedPrincipal = analyst) =>
  ((await rc.completeness(rreq(as, 'decision.recommendation.read', 'DPK', pkg), T(), D(), pkg, String(v))) as unknown as { completeness: Row & { gaps: Array<{ category: string; key: string; detail: string }>; mode: string; complete: boolean } }).completeness;
const attest = (as: AuthenticatedPrincipal, pkg: string, v: number, payload: Row) =>
  rc.attest(rreq(as, 'decision.incomplete.attest', 'DPK', pkg), T(), D(), pkg, String(v), { payload }) as unknown as Promise<{ attestation: Row & { attestation_id: string } }>;
const acknowledge = (as: AuthenticatedPrincipal, id: string, reason: string) =>
  rc.acknowledge(rreq(as, 'decision.incomplete.attest', 'DPK', null), T(), D(), id, { payload: { reason } }) as unknown as Promise<{ attestation: Row & { set_aside: Row[]; state: string } }>;
const use = async (runId: string) => ((await validity.runUse(h.req(analyst, 'simulation.validity.read', 'SIM', runId, 'simulation'), T(), D(), runId)) as unknown as { use: Row & { use: string; reasons: Array<{ class: string; detail: string }>; label: string } }).use;

const twinRun = (payload: Row, as: AuthenticatedPrincipal = w.operator) => twins.run(h.req(as, 'simulation.run', 'SIM', null, 'simulation'), T(), D(), { payload }) as unknown as Promise<{ run: Row & { runId: string; state: string } }>;
const runOn = (scenario: string, branch: string) => twinRun({ twinId: w.twinId, twinVersion: vTwin, runKind: 'control', controlRunId: null, shock: false, component: 'SYN-PART-MAG',
  interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, scenarioId: scenario, scenarioBranchId: branch });
const plainRun = () => twinRun({ twinId: w.twinId, twinVersion: w.v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } });
const branchScenario = (as: AuthenticatedPrincipal, id: string, payload: Row) => prediction.branchScenario(h.req(as, 'prediction.scenario.branch', 'SCN', id, 'prediction'), T(), D(), id, { payload }) as unknown as Promise<{ branching: Row & { branch_id: string } }>;
const evaluateQuality = (as: AuthenticatedPrincipal, id: string) => quality.evaluate(h.req(as, 'prediction.scenario.quality.evaluate', 'SCN', id, 'prediction'), T(), D(), id, { payload: { trigger: 'operator' } }) as unknown as Promise<{ evaluation: Row & { outcome: string } }>;
const defineIndicator = async (description: string, threshold: number): Promise<string> =>
  ((await prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null, 'prediction'), T(), D(), { payload: { seriesKey: w.seriesKey, comparator: '<', consecutiveDays: 5, owner: w.twinOwner.principalId, description, threshold } })) as unknown as { indicator: { indicatorId: string } }).indicator.indicatorId;

/* ───────────── the packages (SYNTHETIC) ───────────── */
type OptionSpec = { key: string; title: string; kind: 'intervention' | 'status_quo'; runs?: string[]; unsimulatedReason?: string };
/** A package on the fixture DEC: a version opened NOW (after every run it cites), the options, the terms, the choice. */
async function pkgWith(title: string, options: OptionSpec[], choiceKey: string): Promise<{ pkg: string; v: number }> {
  const d = await c.declare({ decisionObjectId: w.decisionId, title, statement: `${title} — whether and how (B35 recommendation harness, synthetic)`, owner: w.owner.principalId });
  const pkg = d.package.packageId;
  const v = (await c.open(pkg, {})).version.version;
  for (const o of options) {
    const consequences = (o.runs ?? []).map((id) => ({ kind: 'run', id }));
    await c.option(pkg, v, { key: o.key, title: o.title, kind: o.kind, consequences, ...(o.unsimulatedReason === undefined ? {} : { unsimulatedReason: o.unsimulatedReason }) });
  }
  await c.terms(pkg, v, c.validTerms());
  await c.choice(pkg, v, c.validChoice({ option_key: choiceKey, action_owner: w.owner.principalId }));
  return { pkg, v };
}
const recPayload = (over: Row = {}): Row => ({
  optionKey: 'reroute', what: 'Dual-source the bearings via Morocco beside the incumbent supplier (SYNTHETIC)', forWhom: 'the Regensburg line\'s decision owner (synthetic)', byWhen: '2026-11-16',
  assumptions: [{ statement: 'the Morocco supplier qualifies its first lot within six weeks (synthetic)' }],
  whatCouldMakeItWrong: [{ statement: 'customs pre-clearance at Tanger Med takes longer than ten days (synthetic)', signpost: 'the broker\'s first clearance time' }],
  missingEvidence: [],
  components: {
    valueJudgments: [{ statement: 'delivery reliability outweighs a 4% unit-cost premium (synthetic)', source: { kind: 'principal', ref: w.owner.principalId } }],
    policyConstraints: [{ statement: 'every second source carries the customs pre-clearance obligation (synthetic)', source: { kind: 'obligation', ref: 'customs pre-clearance (synthetic)' } }],
    analyticalAssumptions: [{ statement: 'the corridor stays open', source: { kind: 'assumption', ref: w.assumptionId } }],
    modelOutputs: [{ statement: 'the reroute run keeps the line running (synthetic)', source: { kind: 'run', ref: w.rerouteId } }],
  },
  ...over,
});
const recRow = async (id: string) => (await sql<{ state: string; author_kind: string; superseded_by: string | null; flags: Row[] }>`select state, author_kind, superseded_by::text, flags from decision.recommendations where recommendation_id = ${id}::uuid`.execute(su)).rows[0]!;
const recEvents = async (pkg: string) => (await sql<{ event: string }>`select event from decision.recommendation_events where package_id = ${pkg}::uuid order by occurred_at, event_id`.execute(su)).rows.map((r) => r.event);
const pkgEvents = async (pkg: string) => (await sql<{ event: string }>`select event from decision.package_events where package_id = ${pkg}::uuid order by occurred_at, event_id`.execute(su)).rows.map((r) => r.event);
const itemsOf = async (subject: string) => (await sql<{ state: string; owner_principal_id: string | null; route_roles: string[]; subject_kind: string }>`
  select state, owner_principal_id::text, route_roles, subject_kind from executive.attention_items where signal_class = 'decision.recommendation' and subject_id = ${subject}::uuid order by created_at`.execute(su)).rows;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { ScenarioQualityController: Qc } = await import('../../src/prediction/scenarios/quality/quality.controller.js');
  const { ValidityController: Vc } = await import('../../src/twin/simulations/validity/validity.controller.js');
  const { RecommendationController: Rc } = await import('../../src/decision/recommendation/recommendation.controller.js');
  const { DecisionAgentSessionService: As } = await import('../../src/executive/agents/agent-session.service.js');
  prediction = h.app.get(Pc); twins = h.app.get(Tc); quality = h.app.get(Qc); validity = h.app.get(Vc); rc = h.app.get(Rc);
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b35r-strategy-owner');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b35r-forecast-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b35r-analyst');
  admin = await h.humanWithSession(['tenant_admin'], 'b35r-tenant-admin', 'TENANT');
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  // THE DECISION AGENT: registered by the tenant administrator (identity kind agent, role decision_agent) and acting on its own run session
  const ag = await c.registerAgent({ kind: 'decision', version: '1.0.0', codeDigest: 'b'.repeat(64), ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId,
    budgets: { max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000 } }, admin);
  agent = (await h.app.get(As).openRunSession({ agentId: ag.agent.agentId, tenantId: T(), domainId: D(), correlationId: uuidv7() })).principal;
  expect(agent.kind).toBe('agent');
  // the signposts and the scenarios (SYNTHETIC): S2 three distinct branches (coverage), Q a tree its quality evaluation will fail (wording-only branches)
  QI1 = await defineIndicator('B35: transits below 40 for five days (synthetic)', 40);
  QI2 = await defineIndicator('B35: transits below 25 for five days (synthetic)', 25);
  const s = (await prediction.declareScenario(h.req(strategyOwner, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(), { payload: {
    title: 'Bab el-Mandeb closure (B35 recommendation harness, synthetic)', statement: 'the corridor stays open, or insurers withdraw and carriers reroute (B35 harness)', forecastId: w.forecastId,
    owner: strategyOwner.principalId, reviewCadence: 'weekly', branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: strategyOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
      { name: 'Insurer withdrawal', kind: 'disruption', statement: 'war-risk cover is withdrawn and sailings stop', divergence: 'insurers withdraw war-risk cover, so carriers stop sailing whatever the transits say',
        indicatorId: QI1, owner: forecastOwner.principalId, consequence: 'reroute every open booking via the Cape', consequenceClass: 'C3', responseWindowHours: 24 },
      { name: 'Corridor collapse', kind: 'downside', statement: 'below 40 for five days', indicatorId: QI1, owner: strategyOwner.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48 },
    ] } })) as unknown as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  S2 = s.scenario.scenarioId;
  S2BASE = s.scenario.branches.find((b) => b.kind === 'baseline')!.branchId;
  S2DOWN = s.scenario.branches.find((b) => b.kind === 'downside')!.branchId;
  S2DISRUPT = s.scenario.branches.find((b) => b.kind === 'disruption')!.branchId;
  const q = (await prediction.declareScenario(h.req(strategyOwner, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(), { payload: {
    title: 'B35 wording-only corridor tree (synthetic)', statement: 'the Bab el-Mandeb corridor over the next quarter (B35 harness)', forecastId: w.forecastId,
    owner: strategyOwner.principalId, reviewCadence: 'weekly', branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'transits hold at the forecast level (synthetic)', owner: strategyOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
      { name: 'Corridor collapse', kind: 'downside', statement: 'transits fall below 40 for five days', indicatorId: QI1, owner: strategyOwner.principalId, consequence: 'rebook the open shipments now', responseWindowHours: 48 },
    ] } })) as unknown as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  Q = q.scenario.scenarioId;
  QBASE = q.scenario.branches.find((b) => b.kind === 'baseline')!.branchId;
  // the twin version the scenario runs bind: opened and admitted AFTER the declarations
  const o = await twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 } }) as unknown as { version: { version: number } };
  vTwin = o.version.version;
  await twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, String(vTwin), { payload: {} });
  S2BASE_RUN = (await runOn(S2, S2BASE)).run.runId;
  S2DOWN_RUN = (await runOn(S2, S2DOWN)).run.runId;
  Q_RUN = (await runOn(Q, QBASE)).run.runId;
  IND_RUN = (await plainRun()).run.runId;
  CON_RUN = (await plainRun()).run.runId;
  CON2_RUN = (await plainRun()).run.runId;
  // Q's two added branches differ only in WORDING — its quality evaluation FAILS (indistinct_branches), AFTER its run completed
  const common = { indicatorId: QI2, divergence: 'the strait closes to merchant traffic (synthetic)', assumptions: [{ statement: 'naval activity halts transits' }], owner: strategyOwner.principalId,
    consequence: 'reroute every open booking via the Cape', responseWindowHours: 24 };
  await branchScenario(strategyOwner, Q, { expected_version: 1, idempotency_key: 'b35r-closure-1', branch: { name: 'Strait closure', kind: 'disruption', statement: 'Strait closure: transits halt for seven days', ...common } });
  await branchScenario(strategyOwner, Q, { expected_version: 2, idempotency_key: 'b35r-closure-2', branch: { name: 'Strait shutdown', kind: 'user_defined', kindLabel: 'strait shutdown', statement: 'Strait closure — transits halted for seven days.', ...common } });
  expect((await evaluateQuality(strategyOwner, Q)).evaluation.outcome).toBe('failed');
  // STATED superuser inserts standing for §O's experiment port (the checkpoint) and §D's constraint gate (the completion verdicts) — the B31 idiom
  EXP = uuidv7();
  await sql`insert into simulation.experiments (experiment_id, scope, tenant_id, domain_id, title, question, twin_id, twin_version, method_ref, run_intake, measures, paths, chunk_size, seed, jitter, budget,
      stop_conditions, state, declared_by, started_by, started_at, run_id, correlation_id)
    values (${EXP}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'B35 stability probe (synthetic)', 'does the line-stop estimate settle? (B35 harness)', ${w.twinId}::uuid, ${w.v1}, 'supply-flow@1', '{}'::jsonb,
      array['total_cost'], 100, 50, 1, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'running', ${w.operator.principalId}::uuid, ${w.operator.principalId}::uuid, clock_timestamp(), ${IND_RUN}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into simulation.experiment_checkpoints (checkpoint_id, scope, tenant_id, domain_id, experiment_id, seq, chunk_index, paths_done, chunks_done, aggregate, digest, indicators, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${EXP}::uuid, 1, 0, 50, 1, '{}'::jsonb, ${'c'.repeat(64)},
      ${JSON.stringify({ numerical_stability: { total_cost: { measure: 'total_cost', n: 50, state: 'unstable', relative_half_width: 0.12, change_since_previous: null, rule: 'sio-stability@1' } }, rule: 'sio-indicators@1' })}::jsonb, ${uuidv7()}::uuid)`.execute(su);
  // every supply-flow@1 run already carries a SATISFIED completion verdict (one per stage, append-only): the stated plant RE-WRITES it for two
  // runs, the append-only trigger suspended for this one superuser transaction (session_replication_role) — it stands for §D's gate
  // returning VIOLATED and INDETERMINATE at completion; nothing in the product writes a verdict twice.
  await su.transaction().execute(async (tx) => {
    await sql`set local session_replication_role = replica`.execute(tx);
    await sql`update simulation.run_constraint_checks set outcome = 'violated', set_id = 'b35-capacity (synthetic)', set_version = 1,
        violations = ${JSON.stringify([{ rule: 'b35-air-cap', detail: 'air freight above 60 t/week (synthetic)' }])}::jsonb where run_id = ${CON_RUN}::uuid and stage = 'completion'`.execute(tx);
    await sql`update simulation.run_constraint_checks set outcome = 'indeterminate', set_id = 'b35-capacity (synthetic)', set_version = 1,
        indeterminate_reason = 'the constraint store was unreachable at completion (synthetic)' where run_id = ${CON2_RUN}::uuid and stage = 'completion'`.execute(tx);
  });
  // A: the scene's package — three options, every intervention simulated (complete, the explanation part absent: not assessed)
  A = await pkgWith('Second source for bearings (B35 harness)', [
    { key: 'status-quo', title: 'Stay single-sourced', kind: 'status_quo', runs: [w.controlId] },
    { key: 'reroute', title: 'Dual-source via Morocco', kind: 'intervention', runs: [w.rerouteId] },
    { key: 'air', title: 'Air-bridge the gap', kind: 'intervention', runs: [w.airId] },
  ], 'reroute');
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B35 recommendation · r1 · the recommendation as a distinct explained object (F-P6-02: PR-38-001..006, CAP-DS-09)', () => {
  it('r1a · POSITIVE: the Decision Agent records (author kind agent) and the owner records (human) — what, for whom, by when, what could make it wrong, the four components SEPARATED and sourced; the owner is notified of the agent\'s', async () => {
    const a = (await record(agent, A.pkg, A.v, recPayload())).recommendation;
    AGENT_REC = a.recommendation_id;
    expect(a).toMatchObject({ author_kind: 'agent', state: 'proposed', option_key: 'reroute', option_title: 'Dual-source via Morocco', flags: [] });
    expect(String(a['digest'])).toMatch(/^[0-9a-f]{64}$/);
    const own = (await record(w.owner, A.pkg, A.v, recPayload({ optionKey: 'air', what: 'Air-bridge the bearings for six weeks while the second source qualifies (SYNTHETIC)',
      whatCouldMakeItWrong: [{ statement: 'air freight above 60 t/week breaches the constraint (synthetic)' }],
      components: { valueJudgments: [{ statement: 'no line stop is acceptable this quarter (synthetic)', source: { kind: 'objective', ref: w.objectiveId } }], policyConstraints: [],
                    analyticalAssumptions: [{ statement: 'the premium is temporary (synthetic)', source: { kind: 'stated', ref: 'the owner\'s judgement' } }],
                    modelOutputs: [{ statement: 'the air-bridge run (synthetic)', source: { kind: 'run', ref: w.airId } }] } }))).recommendation;
    OWNER_REC = own.recommendation_id;
    expect(own).toMatchObject({ author_kind: 'human', option_key: 'air' });
    const row = (await sql<Row>`select by_when::text, what_could_make_it_wrong, value_judgments, policy_constraints, analytical_assumptions, model_outputs, author_principal_id::text
      from decision.recommendations where recommendation_id = ${AGENT_REC}::uuid`.execute(su)).rows[0]!;
    expect(row['by_when']).toBe('2026-11-16');
    expect(row['author_principal_id']).toBe(agent.principalId);
    expect((row['what_could_make_it_wrong'] as Row[])[0]).toMatchObject({ statement: expect.stringMatching(/Tanger Med/), signpost: 'the broker\'s first clearance time' });
    expect((row['value_judgments'] as Row[])[0]).toMatchObject({ source: { kind: 'principal', ref: w.owner.principalId } });
    expect((row['policy_constraints'] as Row[])[0]).toMatchObject({ source: { kind: 'obligation' } });
    expect((row['analytical_assumptions'] as Row[])[0]).toMatchObject({ source: { kind: 'assumption', ref: w.assumptionId } });
    expect((row['model_outputs'] as Row[])[0]).toMatchObject({ source: { kind: 'run', ref: w.rerouteId }, decision_use: { use: 'diagnostic' } });
    // the notices: the agent's routed to the owner; the owner's own routed to the reviewing roles
    expect(await itemsOf(AGENT_REC)).toMatchObject([{ state: 'open', owner_principal_id: w.owner.principalId, subject_kind: 'recommendation' }]);
    expect((await itemsOf(OWNER_REC))[0]).toMatchObject({ owner_principal_id: null, route_roles: ['decision_approver', 'decision_authority', 'executive', 'domain_analyst'] });
    // its OWN ledger; the package's ledger untouched by §R
    expect(await recEvents(A.pkg)).toEqual(['recommendation.recorded', 'recommendation.recorded']);
    expect(await pkgEvents(A.pkg)).toEqual(['package.declared', 'version.opened', 'option.set', 'option.set', 'option.set', 'terms.set', 'choice.set']);
    evidence('r1a', { agent: AGENT_REC, owner: OWNER_REC, author_kinds: ['agent', 'human'] });
  });

  it('r1b · REFUSAL: nothing that could make it wrong (422); no component (422); an unknown option (404); a model output naming no run (404); a wrong source kind (422); an agent\'s withdrawal (403); a committed package (409) — nothing written', async () => {
    const before = (await sql<{ n: number }>`select count(*)::int n from decision.recommendations`.execute(su)).rows[0]!.n;
    await refused(record(w.owner, A.pkg, A.v, recPayload({ whatCouldMakeItWrong: [] })), /^recommendation rejected \(what_could_make_it_wrong\)/, 422);
    await refused(record(w.owner, A.pkg, A.v, recPayload({ components: { valueJudgments: [], policyConstraints: [], analyticalAssumptions: [], modelOutputs: [] } })), /^recommendation rejected \(components\)/, 422);
    await refused(record(w.owner, A.pkg, A.v, recPayload({ optionKey: 'teleport' })), /^recommendation rejected \(unknown_option\): version 1 of package .* has no option teleport/, 404);
    await refused(record(w.owner, A.pkg, A.v, recPayload({ components: { valueJudgments: [], policyConstraints: [], analyticalAssumptions: [], modelOutputs: [{ statement: 'a run nobody ran', source: { kind: 'run', ref: uuidv7() } }] } })),
      /^recommendation rejected \(unknown_source\): model_outputs\[0\] names run .*, which is not a run of this domain/, 404);
    await refused(record(w.owner, A.pkg, A.v, recPayload({ components: { valueJudgments: [{ statement: 'a judgement sourced as a run', source: { kind: 'run', ref: w.rerouteId } }], policyConstraints: [], analyticalAssumptions: [], modelOutputs: [] } })),
      /^recommendation rejected \(value_judgments\[0\]\.source\): each item names its source \{kind: principal\|objective\|stated, ref\}/, 422);
    await refused(withdrawRec(agent, AGENT_REC, 'the agent withdraws its own draft'), /./, 403);
    const done = await c.committed();
    await refused(record(w.owner, done.pkg, done.v, recPayload()), /^recommendation rejected \(state\): version 1 is committed/, 409);
    expect((await sql<{ n: number }>`select count(*)::int n from decision.recommendations`.execute(su)).rows[0]!.n, 'a refused record writes nothing').toBe(before);
    evidence('r1b', { refused: ['what_could_make_it_wrong 422', 'components 422', 'unknown_option 404', 'unknown_source 404', 'source kind 422', 'agent withdraw 403', 'state 409'] });
  });

  it('r1c · RECOVERY: the owner records again on the same version — the earlier one SUPERSEDED (its notice closed), the new one live; withdrawing it by its author works, and a withdrawn one is not withdrawn again (409)', async () => {
    const again = (await record(w.owner, A.pkg, A.v, recPayload({ optionKey: 'air', what: 'Air-bridge the bearings for four weeks while the second source qualifies (SYNTHETIC)',
      whatCouldMakeItWrong: [{ statement: 'air freight above 60 t/week breaches the constraint (synthetic)' }] }))).recommendation;
    expect(again['supersedes']).toBe(OWNER_REC);
    expect(await recRow(OWNER_REC)).toMatchObject({ state: 'superseded', superseded_by: again.recommendation_id });
    expect((await itemsOf(OWNER_REC))[0]!.state).toBe('closed');
    await withdrawRec(w.owner, again.recommendation_id, 'the owner withdraws to re-scope the bridge (synthetic)');
    expect((await recRow(again.recommendation_id)).state).toBe('withdrawn');
    await refused(withdrawRec(w.owner, again.recommendation_id, 'withdrawn twice (synthetic)'), /^recommendation rejected \(state\): recommendation .* is already withdrawn/, 409);
    OWNER_REC = (await record(w.owner, A.pkg, A.v, recPayload({ optionKey: 'air', what: 'Air-bridge the bearings for six weeks while the second source qualifies (SYNTHETIC)',
      whatCouldMakeItWrong: [{ statement: 'air freight above 60 t/week breaches the constraint (synthetic)' }] }))).recommendation.recommendation_id;
    expect(await recEvents(A.pkg)).toEqual(['recommendation.recorded', 'recommendation.recorded', 'recommendation.superseded', 'recommendation.recorded', 'recommendation.withdrawn', 'recommendation.recorded']);
  });
});

describe('B35 recommendation · r2 · the review comparing AI and human recommendations; accept for consideration (CAP-DS-10, OBJ-33, HX-08)', () => {
  it('r2a · POSITIVE: side by side (the agent\'s and the owner\'s, each with what could make it wrong); a named approver ACCEPTS the agent\'s FOR CONSIDERATION with the comparison read at review; the notice closed', async () => {
    const v0 = await view(A.pkg);
    expect(v0.side_by_side).toEqual({ version: A.v, agent: [AGENT_REC], human: [OWNER_REC] });
    const ag = v0.recommendations.find((r) => r.recommendation_id === AGENT_REC)!;
    const hu = v0.recommendations.find((r) => r.recommendation_id === OWNER_REC)!;
    expect((ag['what_could_make_it_wrong'] as Row[]).length).toBeGreaterThan(0);
    expect((hu['what_could_make_it_wrong'] as Row[]).length).toBeGreaterThan(0);
    expect(Object.keys(ag['components'] as Row).sort()).toEqual(['analytical_assumptions', 'model_outputs', 'policy_constraints', 'value_judgments']);
    const r = (await review(w.approver, AGENT_REC, { verdict: 'accept_for_consideration', rationale: 'The Morocco source is worth weighing beside the owner\'s air-bridge (synthetic).', expectedDigest: ag['digest'] })).review;
    expect(r.state).toBe('accepted_for_consideration');
    expect(r.comparison.map((x) => x['recommendation_id'])).toContain(OWNER_REC);
    expect(r.comparison.find((x) => x['recommendation_id'] === OWNER_REC)).toMatchObject({ author_kind: 'human', what_could_make_it_wrong: expect.any(Array) });
    expect((await recRow(AGENT_REC)).state).toBe('accepted_for_consideration');
    expect((await itemsOf(AGENT_REC))[0]!.state).toBe('closed');
    const v1 = await view(A.pkg);
    expect(v1.recommendations.find((x) => x.recommendation_id === AGENT_REC)!.reviews).toMatchObject([{ verdict: 'accept_for_consideration', reviewer_principal_id: w.approver.principalId }]);
    // accepted FOR CONSIDERATION is not a decision: the package's own ledger and state unmoved
    expect((await c.get(A.pkg)).package['state']).toBe('draft');
    evidence('r2a', { accepted: AGENT_REC, compared: r.comparison.length });
  });

  it('r2b · REFUSAL: the Decision Agent never reviews (403 at the policy); the author never reviews its own (separation_of_duties 403); a stale read (409); an accepted one is not reviewed again (409); a verdict outside the three (422)', async () => {
    await refused(review(agent, OWNER_REC, { verdict: 'decline', rationale: 'the agent tries to review (synthetic)' }), /./, 403);
    await refused(review(w.owner, OWNER_REC, { verdict: 'accept_for_consideration', rationale: 'the owner tries to accept its own (synthetic)' }), /^recommendation rejected \(separation_of_duties\)/, 403);
    await refused(review(w.approver, OWNER_REC, { verdict: 'decline', rationale: 'a stale read (synthetic)', expectedDigest: 'd'.repeat(64) }), /^recommendation rejected \(stale\)/, 409);
    await refused(review(w.approver2, AGENT_REC, { verdict: 'decline', rationale: 'reviewed twice (synthetic)' }), /^recommendation rejected \(state\): recommendation .* is accepted_for_consideration/, 409);
    await refused(review(w.approver, OWNER_REC, { verdict: 'approve', rationale: 'approve is not a review verdict' }), /^recommendation rejected \(verdict\)/, 422);
    expect((await recRow(OWNER_REC)).state).toBe('proposed');
  });

  it('r2c · RECOVERY: the approver REQUESTS CHANGES on the owner\'s (it stays proposed); the owner records a revised one (superseding); a second approver accepts it for consideration — both now stand side by side, accepted', async () => {
    const rq = (await review(w.approver, OWNER_REC, { verdict: 'request_changes', rationale: 'Name what happens if the second source fails its first lot (synthetic).' })).review;
    expect(rq.state).toBe('proposed');
    OWNER_REC2 = (await record(w.owner, A.pkg, A.v, recPayload({ optionKey: 'air', what: 'Air-bridge for six weeks; stop the bridge if the Morocco lot fails qualification (SYNTHETIC)',
      whatCouldMakeItWrong: [{ statement: 'air freight above 60 t/week breaches the constraint (synthetic)' }, { statement: 'the Morocco lot fails its first-article inspection (synthetic)' }] }))).recommendation.recommendation_id;
    expect((await recRow(OWNER_REC)).state).toBe('superseded');
    await review(w.approver2, OWNER_REC2, { verdict: 'accept_for_consideration', rationale: 'Both courses now say what could make them wrong (synthetic).' });
    const v = await view(A.pkg);
    expect(v.side_by_side).toEqual({ version: A.v, agent: [AGENT_REC], human: [OWNER_REC2] });
    expect(v.recommendations.filter((r) => r['state'] === 'accepted_for_consideration').map((r) => r['author_kind']).sort()).toEqual(['agent', 'human']);
    evidence('r2c', { side_by_side: v.side_by_side });
  });
});

describe('B35 recommendation · r3 · the human-led incomplete-package mode (FEX-15, PR-38-005)', () => {
  let C3 = { pkg: '', v: 0 }; let REC3 = ''; let ATT = '';
  it('r3a · REFUSAL (the gate): a version CARRYING a recommendation that is incomplete (one intervention; the recommendation names missing evidence) is NOT proposed (409 unattested), naming the gaps — and a version without recommendations proposes exactly as before', async () => {
    C3 = await pkgWith('Customs pre-clearance at Tanger Med (B35 harness)', [
      { key: 'status-quo', title: 'Clear on arrival', kind: 'status_quo', runs: [w.controlId] },
      { key: 'reroute', title: 'Pre-clear via the broker', kind: 'intervention', runs: [w.rerouteId] },
    ], 'reroute');
    REC3 = (await record(analyst, C3.pkg, C3.v, recPayload({ missingEvidence: [{ what: 'the customs broker\'s pre-clearance quote (synthetic)' }] }))).recommendation.recommendation_id;
    const cm = await completeness(C3.pkg, C3.v);
    expect(cm).toMatchObject({ complete: false, mode: 'incomplete', live_recommendations: 1 });
    expect(cm.gaps.map((g) => g.category).sort()).toEqual(['alternatives', 'evidence']);
    await refused(c.propose(C3.pkg, C3.v), /^incomplete package rejected \(unattested\): version 1 carries 1 live recommendation\(s\) and is incomplete — (?=.*alternatives: 1 intervention\(s\) beside the status quo)(?=.*evidence: .*pre-clearance quote)/, 409);
    expect((await sql<{ state: string }>`select state from decision.package_versions where package_id = ${C3.pkg}::uuid`.execute(su)).rows[0]!.state).toBe('draft');
    // nothing new without a recommendation: the fixture's one-intervention draft proposes as before, its header 'complete'
    const plain = await c.fullDraft();
    const pr = await c.propose(plain.pkg, plain.v);
    expect(pr.proposal.versionDigest).toMatch(/^[0-9a-f]{64}$/);
    expect((pr.proposal as Row)['humanLed']).toBeUndefined();
    evidence('r3a', { gaps: cm.gaps.map((g) => g.key) });
  });

  it('r3b · REFUSAL (the attestation): not the owner (403); a gap left unnamed (422 coverage); a key that is no gap (422); the attester acknowledging its own (separation_of_duties 403); the agent (403); still refused while unacknowledged', async () => {
    const gaps = (await completeness(C3.pkg, C3.v)).gaps;
    const all = gaps.map((g) => ({ key: g.key, category: g.category }));
    const reason = 'The quarter\'s customs window closes before a second alternative can be costed (synthetic).';
    await refused(attest(w.approver, C3.pkg, C3.v, { missing: all, reason }), /^incomplete package rejected \(authority\)/, 403);
    await refused(attest(w.owner, C3.pkg, C3.v, { missing: all.slice(0, 1), reason }), /^incomplete package rejected \(coverage\): the attestation names every gap — unnamed/, 422);
    await refused(attest(w.owner, C3.pkg, C3.v, { missing: [...all, { key: 'option:teleport' }], reason }), /^incomplete package rejected \(missing\): .*option:teleport.* is not a gap/, 422);
    ATT = (await attest(w.owner, C3.pkg, C3.v, { missing: all, reason })).attestation.attestation_id;
    await refused(acknowledge(w.owner, ATT, 'the owner acknowledges its own (synthetic)'), /^incomplete package rejected \(separation_of_duties\)/, 403);
    await refused(acknowledge(agent, ATT, 'the agent acknowledges (synthetic)'), /./, 403);
    expect((await completeness(C3.pkg, C3.v)).mode).toBe('attested');
    await refused(c.propose(C3.pkg, C3.v), /^incomplete package rejected \(unattested\): .*attestation .* awaits a second human's acknowledgement/, 409);
  });

  it('r3c · POSITIVE: a second human ACKNOWLEDGES — the recommendation is SET ASIDE (human-led analysis without recommendation), the version PROPOSES human-led (the DPK header says so); a new recommendation on it refused (409)', async () => {
    const ack = (await acknowledge(w.authority, ATT, 'Acknowledged: the owner leads this one without a recommendation (synthetic).')).attestation;
    expect(ack).toMatchObject({ state: 'acknowledged', mode: 'human_led' });
    expect(ack.set_aside).toMatchObject([{ recommendation_id: REC3, from_state: 'proposed' }]);
    expect((await recRow(REC3)).state).toBe('superseded');
    expect((await completeness(C3.pkg, C3.v)).mode).toBe('human_led');
    await refused(record(w.owner, C3.pkg, C3.v, recPayload()), /^recommendation rejected \(state\): version 1 is in the human-led incomplete-package mode/, 409);
    const pr = (await c.propose(C3.pkg, C3.v)).proposal as Row;
    expect(pr['humanLed']).toMatchObject({ attestation_id: ATT, acknowledged_by: w.authority.principalId });
    const header = (await sql<{ quality_state: Row }>`select quality_state from objects.canonical_objects where object_id = ${C3.pkg}::uuid and object_type = 'DPK' order by recorded_at desc limit 1`.execute(su)).rows[0]!;
    expect(header.quality_state).toMatchObject({ completeness: 'human_led_incomplete' });
    expect(await recEvents(C3.pkg)).toEqual(['recommendation.recorded', 'incomplete.attested', 'recommendation.set_aside', 'incomplete.acknowledged']);
    evidence('r3c', { attestation: ATT, set_aside: ack.set_aside });
  });

  it('r3d · RECOVERY (the other way out, and the stale acknowledgement): an attestation goes STALE when a new gap appears (409); completing the package instead — a second intervention, the author\'s revised recommendation without missing evidence — proposes as COMPLETE', async () => {
    F = await pkgWith('Buffer stock for bearings (B35 harness)', [
      { key: 'status-quo', title: 'No buffer', kind: 'status_quo', runs: [w.controlId] },
      { key: 'reroute', title: 'Buffer six weeks', kind: 'intervention', runs: [w.rerouteId] },
    ], 'reroute');
    await record(analyst, F.pkg, F.v, recPayload({ missingEvidence: [{ what: 'the warehouse quote (synthetic)' }] }));
    const gaps = (await completeness(F.pkg, F.v)).gaps;
    const att = (await attest(w.owner, F.pkg, F.v, { missing: gaps.map((g) => ({ key: g.key })), reason: 'The buffer decision cannot wait for the warehouse quote (synthetic).' })).attestation.attestation_id;
    // the agent's recommendation names another missing item: a new gap the attestation does not name
    await record(agent, F.pkg, F.v, recPayload({ missingEvidence: [{ what: 'the insurer\'s stock cover terms (synthetic)' }] }));
    await refused(acknowledge(w.authority, att, 'acknowledged (synthetic)'), /^incomplete package rejected \(stale\): version 1 moved since attestation .* the gaps .* are not named/, 409);
    // completing it: the second intervention, both authors' revised recommendations without missing evidence
    await c.option(F.pkg, F.v, { key: 'air', title: 'Air-bridge instead', kind: 'intervention', consequences: [{ kind: 'run', id: w.airId }] });
    await record(analyst, F.pkg, F.v, recPayload());
    await record(agent, F.pkg, F.v, recPayload({ optionKey: 'air' }));
    const cm = await completeness(F.pkg, F.v);
    expect(cm, JSON.stringify(cm.gaps)).toMatchObject({ complete: true, mode: 'complete', live_recommendations: 2 });
    const pr = (await c.propose(F.pkg, F.v)).proposal as Row;
    expect(pr['humanLed']).toBeUndefined();
    const header = (await sql<{ quality_state: Row }>`select quality_state from objects.canonical_objects where object_id = ${F.pkg}::uuid and object_type = 'DPK' order by recorded_at desc limit 1`.execute(su)).rows[0]!;
    expect(header.quality_state).toMatchObject({ completeness: 'complete' });
  });
});

describe('B35 recommendation · r4 · the scenario QUALITY failure consulted (F-P4-09)', () => {
  let B = { pkg: '', v: 0 }; let QREC = '';
  it('r4a · POSITIVE: a recommendation on an option resting on a run of a scenario FAILING its quality evaluation is recorded FLAGGED, the notice says the override is needed', async () => {
    B = await pkgWith('Hedge the corridor (B35 harness)', [
      { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', runs: [w.controlId] },
      { key: 'hedge', title: 'Hedge on the wording-only tree', kind: 'intervention', runs: [Q_RUN] },
      { key: 'stage', title: 'Stage the reroute', kind: 'intervention', runs: [S2BASE_RUN, S2DOWN_RUN] },
    ], 'stage');
    const r = (await record(analyst, B.pkg, B.v, recPayload({ optionKey: 'hedge', what: 'Hedge the corridor exposure on the wording-only tree (SYNTHETIC)' }))).recommendation;
    QREC = r.recommendation_id;
    expect(r.flags).toMatchObject([{ class: 'scenario_quality', scenario_id: Q, run_id: Q_RUN, detail: expect.stringMatching(/FAILS its quality evaluation/) }]);
    expect(((await sql<{ evaluation: Row }>`select evaluation from executive.attention_items where subject_id = ${QREC}::uuid`.execute(su)).rows[0]!.evaluation['reasons'] as string[]).join(' ')).toMatch(/1 flag\(s\) stand: acceptance needs the reviewer's stated override/);
    evidence('r4a', { flags: r.flags });
  });
  it('r4b · REFUSAL: accepting it for consideration WITHOUT the stated override is refused (409 quality_flagged) naming the failing scenario; declining needs none', async () => {
    await refused(review(w.approver, QREC, { verdict: 'accept_for_consideration', rationale: 'Looks fine (synthetic).' }), /^recommendation rejected \(quality_flagged\): recommendation .* stands flagged — option hedge rests on run .*FAILS its quality evaluation/, 409);
    expect((await recRow(QREC)).state).toBe('proposed');
  });
  it('r4c · RECOVERY: with the reviewer\'s stated override it is accepted for consideration — the override and the flags at review recorded', async () => {
    const r = (await review(w.approver, QREC, { verdict: 'accept_for_consideration', rationale: 'Worth weighing despite the tree (synthetic).',
      override: 'The hedge does not depend on the indistinct branches; only the baseline run is cited (synthetic).' })).review;
    expect(r.state).toBe('accepted_for_consideration');
    const row = (await sql<{ override: string; flags_at_review: Row[] }>`select override, flags_at_review from decision.recommendation_reviews where recommendation_id = ${QREC}::uuid`.execute(su)).rows[0]!;
    expect(row.override).toMatch(/does not depend on the indistinct branches/);
    expect(row.flags_at_review).toMatchObject([{ class: 'scenario_quality' }]);
  });

  describe('r6 · the decision COVERAGE (ES-37-008)', () => {
    it('r6a · POSITIVE: an option assessed on one of the three live branches of the scenario its runs rest on covers 1 of 3 (33%), naming the unassessed branches', async () => {
      const r = (await record(w.owner, B.pkg, B.v, recPayload({ optionKey: 'stage', what: 'Stage the reroute on the corridor tree (SYNTHETIC)' }))).recommendation;
      expect(r.coverage).toMatchObject({ basis: 'cited_scenarios', option_key: 'stage' });
      // the version's runs rest on S2 (three live branches) and on Q (its live branches): 'stage' is assessed on S2's baseline and downside
      const cov = r.coverage as { share: number; live_branches: Row[]; assessed: Row[]; unassessed: Row[]; label: string };
      expect(cov.assessed.map((b) => b['branch_id']).sort()).toEqual([S2BASE, S2DOWN].sort());
      expect(cov.unassessed.map((b) => b['branch_id'])).toContain(S2DISRUPT);
      expect(cov.share).toBeCloseTo(cov.assessed.length / cov.live_branches.length, 4);
      expect(cov.label).toMatch(/^DECISION COVERAGE 2 of \d+ live branch\(es\)/);
      const v = await view(B.pkg);
      expect(v.recommendations.find((x) => x.recommendation_id === r.recommendation_id)!.coverage).toMatchObject({ share: cov.share });
      evidence('r6a', { share: cov.share, live: cov.live_branches.length });
    });
    it('r6b · REFUSAL: the view of a package that is not visible (404); an option whose runs rest on no scenario has no coverage to claim (not applicable)', async () => {
      await refused(rc.view(rreq(analyst, 'decision.recommendation.read', 'DPK', null), T(), D(), uuidv7()), /^recommendation rejected \(unknown_package\)/, 404);
      const a = (await view(A.pkg)).recommendations.find((x) => x.recommendation_id === AGENT_REC)!;
      expect(a.coverage).toMatchObject({ basis: 'none', share: null, label: expect.stringMatching(/not applicable/) });
    });
    it('r6c · RECOVERY: the less-covered option (hedge: Q\'s baseline only) covers less than the staged one — the coverage is per recommended option, read now', async () => {
      const v = await view(B.pkg);
      const hedge = v.recommendations.find((x) => x.recommendation_id === QREC)!.coverage as { share: number; assessed: Row[] };
      const stage = v.recommendations.find((x) => x['option_key'] === 'stage')!.coverage as { share: number };
      expect(hedge.assessed.map((b) => b['branch_id'])).toEqual([QBASE]);
      expect(stage.share).toBeGreaterThan(hedge.share);
    });
  });
});

describe('B35 recommendation · r5 · the stability and constraint INDICATORS read (F-P5-06, ES-38-008)', () => {
  let E = { pkg: '', v: 0 }; let IREC = '';
  it('r5a · POSITIVE: run_decision_use reads the last checkpoint UNSTABLE, the completion check VIOLATED, another INDETERMINATE — each DIAGNOSTIC with its reason', async () => {
    const u1 = await use(IND_RUN);
    expect(u1.use).toBe('diagnostic');
    expect(u1.reasons.find((r) => r.class === 'unstable')?.detail).toMatch(/last checkpoint \(seq 1\) reads numerical stability UNSTABLE: total_cost/);
    expect(u1.label).toMatch(/unstable/);
    const u2 = await use(CON_RUN);
    expect(u2.reasons.find((r) => r.class === 'constraint_violated')?.detail).toMatch(/completion constraint check against b35-capacity \(synthetic\)@1 is VIOLATED/);
    const u3 = await use(CON2_RUN);
    expect(u3.reasons.find((r) => r.class === 'constraint_indeterminate')?.detail).toMatch(/INDETERMINATE: the constraint store was unreachable/);
    // a run with neither stands as before (the fixture's control: unpromoted only)
    expect((await use(w.control2Id)).reasons.map((r) => r.class)).toEqual(['unpromoted']);
    evidence('r5a', { unstable: u1.label, violated: u2.label, indeterminate: u3.label });
  });
  it('r5b · REFUSAL: a recommendation on an option resting on those runs carries the INDICATOR flags; accepting it without the override is refused (409 quality_flagged)', async () => {
    E = await pkgWith('Air-bridge sizing (B35 harness)', [
      { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', runs: [w.controlId] },
      { key: 'bridge', title: 'Bridge on the unstable estimate', kind: 'intervention', runs: [IND_RUN, CON_RUN, CON2_RUN] },
      { key: 'air', title: 'Air-bridge', kind: 'intervention', runs: [w.airId] },
    ], 'bridge');
    const r = (await record(analyst, E.pkg, E.v, recPayload({ optionKey: 'bridge', what: 'Size the bridge on the stochastic estimate (SYNTHETIC)' }))).recommendation;
    IREC = r.recommendation_id;
    expect(r.flags.map((f) => f['indicator']).sort()).toEqual(['constraint_indeterminate', 'constraint_violated', 'unstable']);
    await refused(review(w.approver, IREC, { verdict: 'accept_for_consideration', rationale: 'Looks fine (synthetic).' }), /^recommendation rejected \(quality_flagged\): .*INDETERMINATE.*|^recommendation rejected \(quality_flagged\)/, 409);
  });
  it('r5c · RECOVERY: the experiment\'s next checkpoint reads STABLE (a stated insert for §O\'s port) — the unstable reason and its flag clear, the constraint flags stand (read now)', async () => {
    await sql`insert into simulation.experiment_checkpoints (checkpoint_id, scope, tenant_id, domain_id, experiment_id, seq, chunk_index, paths_done, chunks_done, aggregate, digest, indicators, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${EXP}::uuid, 2, 1, 100, 2, '{}'::jsonb, ${'e'.repeat(64)},
        ${JSON.stringify({ numerical_stability: { total_cost: { measure: 'total_cost', n: 100, state: 'stable', relative_half_width: 0.03, change_since_previous: 0.01, rule: 'sio-stability@1' } }, rule: 'sio-indicators@1' })}::jsonb, ${uuidv7()}::uuid)`.execute(su);
    expect((await use(IND_RUN)).reasons.map((r) => r.class)).not.toContain('unstable');
    const v = await view(E.pkg);
    const now = v.recommendations.find((x) => x.recommendation_id === IREC)!;
    expect(now.flags.map((f) => f['indicator']).sort()).toEqual(['constraint_indeterminate', 'constraint_violated']);
    expect((now['flags_at_recording'] as Row[]).length).toBe(3);
    // with the override it is accepted
    const r = (await review(w.approver, IREC, { verdict: 'accept_for_consideration', rationale: 'Weigh it; the constraint verdicts are named (synthetic).',
      override: 'The violated cap is the air leg only; the bridge is resized below it (synthetic).' })).review;
    expect(r.state).toBe('accepted_for_consideration');
  });
});
