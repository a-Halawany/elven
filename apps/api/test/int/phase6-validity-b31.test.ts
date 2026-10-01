/**
 * CP-6 B31 part `validity` (migration 0099 §V) — SIMULATION VALIDITY (F-P5-09: FEX-13, L8-I05, PR-35-005, AI-28-005, V03-T-156/-353, OBJ-29)
 * and the B31 pieces of F-P4-07 (V00-T-055, AI-49-002, V03-T-332) and F-P4-09 (ES-37-008, PR-33-005, AI-49-004), through the real database
 * and controllers (POST …/simulations/validity/…, the twin, decision, prediction, anatomy and quality routes), on the world of
 * `bootDecisionWorld` and this file's own humans with sessions (the ports compare the acting principal). Every figure is SYNTHETIC.
 *
 *   U · THE DECISION USE: a completed unpromoted run is DIAGNOSTIC, a promoted one DECISION-GRADE, a PARTIAL one diagnostic (planted by a
 *       stated superuser insert standing for §O's port, not in this worktree), an invalidated one REFUSED; the comparison's verdict; the reads'
 *       refusals.
 *   G · THE GATE: the domain's decision-use policy (a named human; stale refused); a proposal whose recommended option cites an unpromoted run
 *       refused (diagnostic_only), admitted once the run is promoted; a commitment refused while the cited run is challenged, admitted once
 *       the challenge is dismissed.
 *   P · THE INVALIDATION REACHES THE PACKAGE: an UPHELD challenge on a cited run invalidates it; the package read marks the option
 *       INPUT INVALIDATED; the commitment of that version is refused (refused); the option citing it is refused at the next derivation (the
 *       existing derive_option refusal); a re-run of the corrected case is cited instead.
 *   Q · F-P4-09: a scenario failing its QUALITY evaluation is not simulated (run rejected (scenario_quality)) nor promoted to simulation
 *       (promotion to simulation rejected (scenario_quality)); a warning raised on it is marked input_unverified (via scenario_quality);
 *       recovery by suspending the indistinct branch and evaluating again; a suspended branch is not promoted (branch_suspended).
 *   A · F-P4-07: the ASU → SCN graph dependency written on a register link, kept while any link stands, retired on the last unlink, written
 *       again on a relink.
 *   C · F-P4-07: a CRITICAL claim condition met (the claim disputed) and a CRITICAL indicator condition met (the indicator breached) SUSPEND
 *       the branch and task its owner; a non-critical one does not; reinstatement by the owner.
 *   B · F-P4-07 / AI-49-002: a branch BOUND to its baseline twin state, initial conditions and the factors its assumptions move; a run from
 *       another state refused (run rejected (branch_binding)); the refusals of the binding; a rebind and a retirement.
 *   S · AI-49-004: the run's sensitivity read against the branch's critical assumptions (material / not material / unmeasured).
 *   R · AI-28-005: a twin version UNVERIFIED (a stated superuser insert of twin.mark_unverified's own two writes — its real path is the graph's
 *       impact propagation, exercised by phase5-corrections) identifies the runs, packages, commitments and evaluation results resting on it
 *       and tasks the package owners (simulation.validity); a person identifies it again; the refusals.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. The scheduler is NOT enabled; nothing here is a real external integration.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { AnatomyController } from '../../src/prediction/scenarios/anatomy/anatomy.controller.js';
import type { ScenarioQualityController } from '../../src/prediction/scenarios/quality/quality.controller.js';
import type { ValidityController } from '../../src/twin/simulations/validity/validity.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b31-validity-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let prediction: PredictionController; let twins: TwinController; let anatomy: AnatomyController; let quality: ScenarioQualityController; let validity: ValidityController;
let strategyOwner: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let challenger: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let twinOwner2: AuthenticatedPrincipal;
/** What the cases leave one another. */
let S = ''; let BASE = ''; let DISRUPT = ''; let DOWN = ''; let Q = ''; let QBASE = ''; let QCLOSE = ''; let QSHUT = ''; let QDOWN = ''; let vTwin = 0; let vTwin2 = 0;
let ASU_COVER = ''; let ASU_RATES = ''; let ASU_CANAL = ''; let CLAIM = ''; let QI1 = ''; let QI2 = '';
let PARTIAL = ''; let GATED = { pkg: '', v: 0, digest: '' }; let REACHED = { pkg: '', v: 0, digest: '' }; let RERUN = ''; let BASE_RUN = '';
let claimDispute: () => Promise<void> = async () => undefined; let claimResolve: () => Promise<void> = async () => undefined;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;

/* ───────────── refusals (the B21/B27 idiom) ───────────── */
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
const evidence = (caseName: string, e: Row): void => console.log(`B31 VALIDITY EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the rows ───────────── */
const branchRow = async (id: string) => (await sql<{ state: string; suspension_cause: Row | null; suspended_from: string | null; simulation_candidate_at: Date | null }>`select state, suspension_cause, suspended_from, simulation_candidate_at
  from prediction.branches_current where branch_id = ${id}::uuid`.execute(su)).rows[0]!;
const itemsOf = async (cls: string, subject: string) => (await sql<{ item_id: string; state: string; owner_principal_id: string; subject_kind: string; cause_event_type: string; details: Row }>`
  select item_id::text, state, owner_principal_id::text, subject_kind, cause_event_type, details from executive.attention_items where signal_class = ${cls} and subject_id = ${subject}::uuid order by created_at`.execute(su)).rows;
const deps = async (scenario: string, asu: string) => (await sql<{ state: string; removed_by: string | null }>`select state, removed_by::text from graph.dependencies
  where dependent_type = 'SCN' and dependent_object_id = ${scenario}::uuid and depends_on_kind = 'strategy' and depends_on_id = ${asu}::uuid order by created_at`.execute(su)).rows;
const runEventsOf = async (runId: string) => (await sql<{ event: string }>`select event from simulation.run_events where run_id = ${runId}::uuid order by occurred_at, event_id`.execute(su)).rows.map((r) => r.event);

/* ───────────── the routes ───────────── */
const vreq = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, type === 'DPK' ? 'decision' : 'simulation');
const use = async (runId: string, as: AuthenticatedPrincipal = analyst) => (await validity.runUse(vreq(as, 'simulation.validity.read', 'SIM', runId), T(), D(), runId)) as unknown as { use: Row & { use: string; reasons: Array<{ class: string }>; label: string }; assumptionSensitivity: Row | null };
const compare = (runIds: string[], as: AuthenticatedPrincipal = analyst) => validity.compare(vreq(as, 'simulation.validity.read', 'SIM', null), T(), D(), { payload: { runIds } }) as unknown as Promise<{ runs: Row[]; verdict: Row }>;
const pkgRead = async (pkg: string, as: AuthenticatedPrincipal = analyst) => ((await validity.packageValidity(vreq(as, 'simulation.validity.read', 'DPK', pkg), T(), D(), pkg)) as unknown as { package: Row & { versions: Array<Row & { options: Array<Row & { runs: Row[] }> }> } }).package;
const setPolicy = (as: AuthenticatedPrincipal, payload: Row) => validity.setPolicy(vreq(as, 'simulation.validity.policy', 'SIM', null), T(), D(), { payload }) as unknown as Promise<{ policy: Row }>;
const readPolicy = () => validity.readPolicy(vreq(analyst, 'simulation.validity.read', 'SIM', null), T(), D()) as unknown as Promise<{ current: Row | null; history: Row[] }>;
const reachList = (payload: Row) => validity.listReach(vreq(analyst, 'simulation.validity.read', 'TWN', null), T(), D(), { payload }) as unknown as Promise<{ reaches: Array<Row & { items: Row[]; packages: Row[]; commitments: Row[]; runs: Row[]; evaluation_results: Row & { outcomes: Row[]; twin_validations: Row[] } }>; now: Row | null }>;
const identify = (as: AuthenticatedPrincipal, payload: Row) => validity.identifyReach(vreq(as, 'simulation.validity.reach', 'TWN', String(payload['twinId'] ?? '') || null), T(), D(), { payload }) as unknown as Promise<{ reach: Row & { items: Row[] } }>;
const bindingRead = async (branch: string) => ((await validity.binding(vreq(analyst, 'simulation.validity.read', 'BRN', branch), T(), D(), branch)) as unknown as { binding: Row & { active: Row | null; history: Row[]; runs: Row[] } }).binding;
const bind = (as: AuthenticatedPrincipal, branch: string, payload: Row) => validity.bind(vreq(as, 'simulation.validity.bind', 'BRN', branch), T(), D(), branch, { payload }) as unknown as Promise<{ binding: Row & { version: number } }>;
const retireBinding = (as: AuthenticatedPrincipal, branch: string, reason: string) => validity.retire(vreq(as, 'simulation.validity.bind', 'BRN', branch), T(), D(), branch, { payload: { reason } }) as unknown as Promise<{ binding: Row }>;

const promote = (as: AuthenticatedPrincipal, runId: string) => twins.promote(h.req(as, 'simulation.result.promote', 'SIM', runId, 'simulation'), T(), D(), runId,
  { payload: { promotedFor: 'the corridor routing decision (B31 harness, synthetic)', limitations: ['calendar days'], note: 'the result is fit for the routing decision (B31 harness)' } }) as unknown as Promise<{ promotion: Row }>;
const openChallenge = (as: AuthenticatedPrincipal, runId: string, statement: string) => twins.openChallenge(h.req(as, 'simulation.challenge.open', 'SIM', runId, 'simulation'), T(), D(), runId,
  { payload: { kind: 'interpretation', statement, disputed: ['route.reroute_delay_days'] } }) as unknown as Promise<{ challenge: Row }>;
const decideChallenge = (as: AuthenticatedPrincipal, runId: string, challengeId: string, decision: 'upheld' | 'dismissed', note: string) =>
  twins.decideChallenge(h.req(as, 'simulation.challenge.decide', 'SIM', runId, 'simulation'), T(), D(), runId, challengeId, { payload: { decision, note } }) as unknown as Promise<{ challenge: Row; invalidation: Row | null }>;
const twinRun = (payload: Row, as: AuthenticatedPrincipal = w.operator) => twins.run(h.req(as, 'simulation.run', 'SIM', null, 'simulation'), T(), D(), { payload }) as unknown as Promise<{ run: Row & { runId: string; state: string } }>;
const runOn = (scenario: string, branch: string, version = vTwin, shock = false) => twinRun({ twinId: w.twinId, twinVersion: version, runKind: 'control', controlRunId: null, shock, component: 'SYN-PART-MAG',
  interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, scenarioId: scenario, scenarioBranchId: branch });
const reviewScenario = (as: AuthenticatedPrincipal, scenarioId: string, payload: Row) => prediction.reviewScenario(h.req(as, 'prediction.scenario.review', 'SCN', scenarioId, 'prediction'), T(), D(), scenarioId, { payload }) as unknown as Promise<{ review: Row }>;
const branchScenario = (as: AuthenticatedPrincipal, id: string, payload: Row) => prediction.branchScenario(h.req(as, 'prediction.scenario.branch', 'SCN', id, 'prediction'), T(), D(), id, { payload }) as unknown as Promise<{ branching: Row & { branch_id: string } }>;
const evaluateQuality = (as: AuthenticatedPrincipal, id: string) => quality.evaluate(h.req(as, 'prediction.scenario.quality.evaluate', 'SCN', id, 'prediction'), T(), D(), id, { payload: { trigger: 'operator' } }) as unknown as Promise<{ evaluation: Row & { outcome: string; findings: Array<{ rule: string; outcome: string }> } }>;
const sreq = (as: AuthenticatedPrincipal, action: string, id: string | null) => h.req(as, action, 'SCN', id, 'prediction');
const link = (as: AuthenticatedPrincipal, scenario: string, payload: Row) => anatomy.link(sreq(as, 'prediction.scenario.anatomy.assumption', scenario), T(), D(), scenario, { payload }) as unknown as Promise<{ link: Row & { link_id: string; version: number } }>;
const unlink = (as: AuthenticatedPrincipal, scenario: string, id: string, reason: string) => anatomy.unlink(sreq(as, 'prediction.scenario.anatomy.assumption', scenario), T(), D(), scenario, id, { payload: { reason } }) as unknown as Promise<{ link: Row }>;
const suspend = (as: AuthenticatedPrincipal, branch: string, reason: string) => anatomy.suspend(sreq(as, 'prediction.scenario.anatomy.suspend', branch), T(), D(), branch, { payload: { reason } }) as unknown as Promise<{ suspension: Row }>;
const reinstate = (as: AuthenticatedPrincipal, branch: string, note: string) => anatomy.reinstate(sreq(as, 'prediction.scenario.anatomy.reinstate', branch), T(), D(), branch, { payload: { note } }) as unknown as Promise<{ reinstatement: Row }>;
const evaluateIndicator = (indicatorId: string) => prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', indicatorId, 'prediction'), T(), D(), indicatorId, { payload: { knownAt: new Date().toISOString() } }) as unknown as Promise<{ evaluation: Row; warnings: Array<{ warningId: string; branchId: string }> }>;
const defineIndicator = async (description: string, threshold: number, consecutiveDays = 5): Promise<string> =>
  ((await prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null, 'prediction'), T(), D(), { payload: { seriesKey: w.seriesKey, comparator: '<', consecutiveDays, owner: w.twinOwner.principalId, description, threshold } })) as unknown as { indicator: { indicatorId: string } }).indicator.indicatorId;
const declareAssumption = async (title: string, statement: string): Promise<string> =>
  ((await w.graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title, statement,
    restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the assumption is about the corridor (B31 harness)' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
const openVersion = () => twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 } }) as unknown as Promise<{ version: { version: number } }>;
const admit = (version: number) => twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, String(version), { payload: {} }) as unknown as Promise<{ admitted: { completeness: string } }>;
const validateTwin = (as: AuthenticatedPrincipal, version: number) => twins.validate(h.req(as, 'twin.version.validate', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, String(version),
  { payload: { verdict: 'fit', reason: 'the corridor model reconciles within tolerance (B31 harness)', limitations: ['calendar days'] } }) as unknown as Promise<{ validation: Row }>;

/** A claim as the extraction would have admitted it (the B21/B27 seedClaim idiom), version 1 active; version 2 DISPUTED when asked. SYNTHETIC. */
async function seedClaim(ev: { id: string; version: number }): Promise<{ id: string; dispute: () => Promise<void>; resolve: () => Promise<void> }> {
  const claimId = uuidv7();
  const payload: Row = { claim_kind: 'claim', subject: 'Bab el-Mandeb Strait', predicate: 'war_risk_cover', object_value: 'underwriters keep writing cover (synthetic)', confidence: 0.8,
    review: { state: 'approved', reason: 'fixture', decider: null } };
  const insert = async (version: number, lifecycle: string): Promise<void> => {
    const now = new Date().toISOString();
    const header: CanonicalHeader = {
      object_id: claimId, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: lifecycle, owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
      source_object_ids: [ev.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${ev.id}@${ev.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
    };
    const contentDigest = canonicalHeaderDigest(header, payload);
    await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
      values (${claimId}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, ${lifecycle}, 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, 'CLM@v1', null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  };
  await insert(1, 'active');
  // the harness itself stands for the review that disputes it (a stated superuser move; 0006's lifecycle — the condition reads the new version)
  // B31-F1: the review that RESOLVES the dispute (version 3 active again) — the same stated superuser move, the reverse of the dispute
  return { id: claimId, dispute: () => insert(2, 'disputed'), resolve: () => insert(3, 'active') };
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { AnatomyController: Ac } = await import('../../src/prediction/scenarios/anatomy/anatomy.controller.js');
  const { ScenarioQualityController: Qc } = await import('../../src/prediction/scenarios/quality/quality.controller.js');
  const { ValidityController: Vc } = await import('../../src/twin/simulations/validity/validity.controller.js');
  prediction = h.app.get(Pc); twins = h.app.get(Tc); anatomy = h.app.get(Ac); quality = h.app.get(Qc); validity = h.app.get(Vc);
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b31v-strategy-owner');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b31v-forecast-owner');
  reviewer = await h.humanWithSession(['strategy_owner'], 'b31v-reviewer');
  challenger = await h.humanWithSession(['strategy_owner'], 'b31v-challenger');
  analyst = await h.humanWithSession(['domain_analyst'], 'b31v-analyst');
  dadmin = await h.humanWithSession(['domain_admin'], 'b31v-domain-admin');
  twinOwner2 = await h.humanWithSession(['twin_owner'], 'b31v-twin-owner');
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  // this file's own signposts on the fixture series (SYNTHETIC): QI1 the collapse (below 40), QI2 the closure (below 25)
  QI1 = await defineIndicator('B31: transits below 40 for five days (synthetic)', 40);
  QI2 = await defineIndicator('B31: transits below 25 for five days (synthetic)', 25);
  // S: the corridor tree the gates, bindings and suspensions act on (SYNTHETIC)
  const s = (await prediction.declareScenario(h.req(strategyOwner, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(), { payload: {
    title: 'Bab el-Mandeb closure (B31 validity harness, synthetic)', statement: 'the corridor stays open, or insurers withdraw and carriers reroute (B31 harness)', forecastId: w.forecastId,
    owner: strategyOwner.principalId, reviewCadence: 'weekly', branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: strategyOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
      { name: 'Insurer withdrawal', kind: 'disruption', statement: 'war-risk cover is withdrawn and sailings stop', divergence: 'insurers withdraw war-risk cover, so carriers stop sailing whatever the transits say',
        indicatorId: QI1, owner: forecastOwner.principalId, consequence: 'reroute every open booking via the Cape', consequenceClass: 'C3', responseWindowHours: 24 },
      { name: 'Corridor collapse', kind: 'downside', statement: 'below 40 for five days', indicatorId: QI1, owner: strategyOwner.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48 },
    ] } })) as unknown as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  S = s.scenario.scenarioId;
  BASE = s.scenario.branches.find((b) => b.kind === 'baseline')!.branchId;
  DISRUPT = s.scenario.branches.find((b) => b.kind === 'disruption')!.branchId;
  DOWN = s.scenario.branches.find((b) => b.kind === 'downside')!.branchId;
  // Q: a tree whose two added branches differ only in WORDING — its quality evaluation fails indistinct_branches (the quality-b27 idiom)
  const q = (await prediction.declareScenario(h.req(strategyOwner, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(), { payload: {
    title: 'B31 wording-only corridor tree (synthetic)', statement: 'the Bab el-Mandeb corridor over the next quarter (B31 harness)', forecastId: w.forecastId,
    owner: strategyOwner.principalId, reviewCadence: 'weekly', branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'transits hold at the forecast level (synthetic)', owner: strategyOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
      { name: 'Corridor collapse', kind: 'downside', statement: 'transits fall below 40 for five days', indicatorId: QI1, owner: strategyOwner.principalId, consequence: 'rebook the open shipments now', responseWindowHours: 48 },
    ] } })) as unknown as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  Q = q.scenario.scenarioId;
  QBASE = q.scenario.branches.find((b) => b.kind === 'baseline')!.branchId;
  QDOWN = q.scenario.branches.find((b) => b.kind === 'downside')!.branchId;
  const common = { indicatorId: QI2, divergence: 'the strait closes to merchant traffic (synthetic)', assumptions: [{ statement: 'naval activity halts transits' }], owner: strategyOwner.principalId,
    consequence: 'reroute every open booking via the Cape', responseWindowHours: 24 };
  QCLOSE = (await branchScenario(strategyOwner, Q, { expected_version: 1, idempotency_key: 'b31v-closure-1', branch: { name: 'Strait closure', kind: 'disruption', statement: 'Strait closure: transits halt for seven days', ...common } })).branching.branch_id;
  QSHUT = (await branchScenario(strategyOwner, Q, { expected_version: 2, idempotency_key: 'b31v-closure-2', branch: { name: 'Strait shutdown', kind: 'user_defined', kindLabel: 'strait shutdown', statement: 'Strait closure — transits halted for seven days.', ...common } })).branching.branch_id;
  ASU_COVER = await declareAssumption('Insurers keep war-risk cover', 'hull and cargo insurers keep writing war-risk cover for the corridor (synthetic)');
  ASU_RATES = await declareAssumption('Freight rates hold', 'container freight rates on the corridor stay within their recent regime (synthetic)');
  ASU_CANAL = await declareAssumption('The canal stays open', 'the canal at the corridor\'s northern end stays open to transits (synthetic)');
  const cl = await seedClaim(w.evd); CLAIM = cl.id; claimDispute = cl.dispute; claimResolve = cl.resolve;
  // the twin version the scenario runs bind: admitted AFTER the declarations (its known_at binds the trees as declared)
  vTwin = (await openVersion()).version.version;
  expect((await admit(vTwin)).admitted.completeness).toBe('complete');
}, 300_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B31 validity · U · the decision use of a run (FEX-13, L8-I05, PR-35-005, OBJ-29)', () => {
  it('U1 · POSITIVE: a completed unpromoted run is DIAGNOSTIC (unpromoted), a promoted one DECISION-GRADE, a partial one DIAGNOSTIC (partial, with its declaration); the comparison is diagnostic while any run is', async () => {
    const before = await use(w.controlId);
    expect(before.use).toMatchObject({ use: 'diagnostic', state: 'completed', validity: 'valid' });
    expect(before.use.reasons.map((r) => r.class)).toEqual(['unpromoted']);
    expect(before.use.label).toMatch(/^DIAGNOSTIC ONLY — not decision-active: unpromoted$/);
    await promote(reviewer, w.controlId);
    const after = await use(w.controlId);
    expect(after.use).toMatchObject({ use: 'decision', promoted_for: 'the corridor routing decision (B31 harness, synthetic)', reasons: [] });
    // the PARTIAL run: §O's port writes it (not in this worktree); a stated superuser insert stands for it — the control's contract, stopped at 2,500 of 5,000 paths
    PARTIAL = uuidv7();
    await sql`insert into simulation.runs_current select (jsonb_populate_record(null::simulation.runs_current, to_jsonb(r) || jsonb_build_object('run_id', ${PARTIAL}::uuid, 'state', 'partial',
        'partial', jsonb_build_object('reason', 'budget', 'missing_outputs', jsonb_build_array('p95 line stop days'), 'completed_paths', 2500, 'declared_paths', 5000),
        'promotion_id', null, 'promoted_for', null, 'fitness_state', 'none', 'challenge_id', null, 'control_run_id', null))).*
      from simulation.runs_current r where r.run_id = ${w.controlId}::uuid`.execute(su);
    const p = await use(PARTIAL);
    expect(p.use).toMatchObject({ use: 'diagnostic', state: 'partial', partial: { reason: 'budget', completed_paths: 2500, declared_paths: 5000 } });
    expect(p.use.reasons.map((r) => r.class)).toEqual(['partial', 'unpromoted']);
    const cmp = await compare([w.controlId, w.rerouteId]);
    expect(cmp.verdict).toMatchObject({ decision_grade: false, counts: { decision: 1, diagnostic: 1, refused: 0 }, diagnostic: [w.rerouteId] });
    expect(String(cmp.verdict['label'])).toMatch(/^DIAGNOSTIC ONLY: 1 of 2/);
    // this part writes no run event: the control's log is the B21 vocabulary's
    expect((await runEventsOf(w.controlId)).filter((e) => !['run.opened', 'run.completed', 'run.promoted'].includes(e))).toEqual([]);
    evidence('U1', { control: after.use['use'], partial: p.use['use'], verdict: cmp.verdict['label'] });
  });

  it('U2 · REFUSAL: the PDP (a principal without a reading role), an unknown run 404, a malformed comparison 422; an invalidated run reads REFUSED', async () => {
    await refused(use(w.controlId, w.agent), /./, 403);
    await refused(use(uuidv7()), /^run use rejected \(unknown_run\)/, 404);
    await refused(compare([]), /^run use rejected \(run_ids\)/, 422);
    await refused(compare([w.controlId, w.controlId]), /^run use rejected \(run_ids\): a run is named once/, 422);
    // a partial run is refused at derivation (decision.derive_option refuses every run that is not completed — not re-declared)
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Cite the partial run (B31 harness)', statement: 'a draft that cites the partial experiment', owner: w.owner.principalId });
    const v = (await c.open(d.package.packageId)).version.version;
    const m = await refusal(c.option(d.package.packageId, v, { key: 'partial', title: 'On the partial run', kind: 'intervention', consequences: [{ kind: 'run', id: PARTIAL }] }));
    expect(m.status, m.message).not.toBeNull();
    evidence('U2', { partial_option_refusal: m.message.slice(0, 160), status: m.status });
  });

  it('U3 · RECOVERY: the unpromoted intervention becomes decision-grade once a reviewer other than its operator promotes it; the comparison then rests on decision-grade results', async () => {
    expect((await use(w.airId)).use['use']).toBe('diagnostic');
    await promote(reviewer, w.airId);
    const cmp = await compare([w.controlId, w.airId]);
    expect(cmp.verdict).toMatchObject({ decision_grade: true, counts: { decision: 2, diagnostic: 0, refused: 0 } });
  });
});

describe('B31 validity · G · the decision-use gate (OBJ-29, FEX-13)', () => {
  it('G1 · REFUSAL: the policy by a decision owner (PDP), a short rationale, a first policy naming a version; then set by the decision authority (v1) and a stale second', async () => {
    await refused(setPolicy(w.owner, { require: true, rationale: 'only promoted results support a commitment' }), /./, 403);
    await refused(setPolicy(w.authority, { require: true, rationale: 'too short' }), /^run use rejected \(rationale\)/, 422);
    await refused(setPolicy(w.authority, { require: true, rationale: 'only promoted results support a commitment', expectedVersion: 3 }), /^run use rejected \(stale\)/, 409);
    const p = (await setPolicy(w.authority, { require: true, rationale: 'only promoted results support a commitment (B31 harness)' })).policy;
    expect(p).toMatchObject({ version: 1, require_decision_use: true, set_by: w.authority.principalId });
    await refused(setPolicy(w.authority, { require: true, rationale: 'a second policy without reading the first' }), /^run use rejected \(stale\): the domain's policy stands at version 1/, 409);
    expect((await readPolicy()).current).toMatchObject({ version: 1, require_decision_use: true });
  });

  it('G2 · POSITIVE → RECOVERY: a proposal recommending an option on an UNPROMOTED run is refused (diagnostic_only); once a reviewer promotes it the proposal stands', async () => {
    const { pkg, v } = await c.fullDraft();
    await refused(c.propose(pkg, v), /^run use rejected \(diagnostic_only\): package .* version 1 recommends option "reroute", which cites run .* — DIAGNOSTIC ONLY — not decision-active: unpromoted; the domain's decision-use policy \(v1\) requires a decision-grade result at the proposal/, 409);
    expect((await sql<{ n: number }>`select count(*)::int n from decision.package_events where package_id = ${pkg}::uuid and event = 'version.proposed'`.execute(su)).rows[0]!.n).toBe(0);
    await promote(reviewer, w.rerouteId);
    const r = await c.propose(pkg, v);
    GATED = { pkg, v, digest: r.proposal.versionDigest };
    evidence('G2', { package: pkg, proposed: true });
  });

  it('G3 · REFUSAL → RECOVERY at the commitment: a live challenge makes the cited run diagnostic — the commitment is refused; dismissed by someone else, the commitment stands', async () => {
    await c.approve(GATED.pkg, GATED.v, { decision: 'approve', versionDigest: GATED.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' });
    const ch = (await openChallenge(challenger, w.rerouteId, 'the reroute saving assumes the Cape leg is bookable (B31 harness)')).challenge;
    expect((await use(w.rerouteId)).use.reasons.map((r) => r.class)).toEqual(['challenged']);
    await refused(c.commit(GATED.pkg, GATED.v, GATED.digest), /^run use rejected \(diagnostic_only\): .* cites run .* challenged; .* at the commitment/, 409);
    await decideChallenge(reviewer, w.rerouteId, String(ch['challenge_id']), 'dismissed', 'the Cape leg is bookable at the quoted rate (B31 harness)');
    const cm = await c.commit(GATED.pkg, GATED.v, GATED.digest);
    expect(cm.commitment.commitmentId).toMatch(/^[0-9a-f-]{36}$/);
    evidence('G3', { commitment: cm.commitment.commitmentId });
  });
});

describe('B31 validity · P · the invalidation reaches the package (V03-T-156/-353, L8-I05)', () => {
  it('P1 · POSITIVE: an UPHELD challenge invalidates the cited run; the package read marks the option INPUT INVALIDATED and refused at the next derivation; the run reads REFUSED', async () => {
    const { pkg, v } = await c.fullDraft();
    const r = await c.propose(pkg, v);
    REACHED = { pkg, v, digest: r.proposal.versionDigest };
    const before = await pkgRead(pkg);
    expect(before['input_invalidated']).toBe(false);
    const ch = (await openChallenge(challenger, w.rerouteId, 'the reroute ignores the Cape congestion surcharge (B31 harness)')).challenge;
    const d = await decideChallenge(reviewer, w.rerouteId, String(ch['challenge_id']), 'upheld', 'the surcharge was omitted; the result does not stand (B31 harness)');
    expect(d.invalidation).not.toBeNull();
    const after = await pkgRead(pkg);
    expect(after['input_invalidated']).toBe(true);
    const opt = after.versions[0]!.options.find((o) => o['key'] === 'reroute')!;
    expect(opt).toMatchObject({ recommended: true, marked: 'input_invalidated', refused_on_next_derivation: true });
    expect(opt.runs[0]).toMatchObject({ run_id: w.rerouteId, validity: 'invalidated', use: 'refused' });
    expect(after.versions[0]!.options.find((o) => o['key'] === 'status-quo')!['marked']).toBeNull();
    expect((await use(w.rerouteId)).use.reasons.map((x) => x.class)).toEqual(['invalidated']);
    evidence('P1', { package: pkg, marked: opt['marked'] });
  });

  it('P2 · REFUSAL: the commitment of the version citing the invalidated run is refused (refused); a new draft citing it is refused at derivation; an unknown package 404', async () => {
    await c.approve(REACHED.pkg, REACHED.v, { decision: 'approve', versionDigest: REACHED.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' });
    const m = await refused(c.commit(REACHED.pkg, REACHED.v, REACHED.digest), /^run use rejected \(refused\): package .* recommends option "reroute", which cites run .* — REFUSED for decision use: invalidated; .* at the commitment/, 409);
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Cite the invalidated run (B31 harness)', statement: 'a draft that cites the invalidated reroute', owner: w.owner.principalId });
    const v = (await c.open(d.package.packageId)).version.version;
    await refused(c.option(d.package.packageId, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }] }), /^reroute: run .*@2 is withdrawn; a consequence cannot rest on it|was invalidated at .*; a consequence cannot rest on an invalidated result/, 422);
    await refused(pkgRead(uuidv7()), /^run use rejected \(unknown_package\)/, 404);
    evidence('P2', { commit_refusal: m.slice(0, 120) });
  });

  it('P2b · REFUSAL WITHOUT A POLICY (the B31 integration\'s correction; V03-T-156, FEX-13): the domain\'s policy set to require nothing — the version proposed BEFORE its run was invalidated still cannot be committed (refused, with or without a policy); the policy restored for P3', async () => {
    const off = (await setPolicy(w.authority, { require: false, rationale: 'no decision-use requirement for this domain (B31 harness)', expectedVersion: 1 })).policy;
    expect(off).toMatchObject({ version: 2, require_decision_use: false });
    await refused(c.commit(REACHED.pkg, REACHED.v, REACHED.digest), /^run use rejected \(refused\): package .* recommends option "reroute", which cites run .* an invalidated input is refused at the commitment with or without a decision-use policy/, 409);
    expect((await sql<{ n: number }>`select count(*)::int n from decision.package_events where package_id = ${REACHED.pkg}::uuid and event = 'package.committed'`.execute(su)).rows[0]!.n).toBe(0);
    const on = (await setPolicy(w.authority, { require: true, rationale: 'only promoted results support a commitment (B31 harness, restored)', expectedVersion: 2 })).policy;
    expect(on).toMatchObject({ version: 3, require_decision_use: true });
    evidence('P2b', { policy_off: off['version'], commit_refused_without_policy: true });
  });

  it('P3 · RECOVERY: a re-run of the corrected case, promoted by a reviewer, is cited instead and the new package proposes under the policy', async () => {
    RERUN = (await twinRun({ twinId: w.twinId, twinVersion: w.v1, runKind: 'intervention', controlRunId: w.controlId, shock: true, component: 'SYN-PART-MAG',
      interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }], horizonDays: 90, stochastic: { mode: 'deterministic' } })).run.runId;
    await promote(reviewer, RERUN);
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute on the corrected run (B31 harness)', statement: 'the reroute cited on the re-run', owner: w.owner.principalId });
    const pkg = d.package.packageId; const v = (await c.open(pkg)).version.version;
    await c.option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    await c.option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: RERUN }] });
    await c.terms(pkg, v, c.validTerms());
    await c.choice(pkg, v, c.validChoice({ action_owner: w.owner.principalId }));
    await c.propose(pkg, v);
    const read = await pkgRead(pkg);
    expect(read['input_invalidated']).toBe(false);
    expect(read.versions[0]!.options.every((o) => o['marked'] === null)).toBe(true);
  });
});

describe('B31 validity · Q · the quality failure and the suspension consulted (F-P4-09: ES-37-008, PR-33-005)', () => {
  it('Q1 · POSITIVE: a scenario failing its quality evaluation is not simulated (run rejected (scenario_quality)) and its branch is not promoted to simulation', async () => {
    const e = (await evaluateQuality(strategyOwner, Q)).evaluation;
    expect(e.outcome).toBe('failed');
    expect(e.findings.filter((f) => f.outcome === 'fail').map((f) => f.rule)).toEqual(['indistinct_branches']);
    await refused(runOn(Q, QBASE), /^run rejected \(scenario_quality\): scenario .* failed its quality evaluation .* \(indistinct_branches\)/, 409);
    await refused(reviewScenario(strategyOwner, Q, { outcome: 'promote_to_simulation', branch_id: QBASE, note: 'promote the baseline (B31 harness)' }),
      /^promotion to simulation rejected \(scenario_quality\)/, 409);
    expect((await branchRow(QBASE)).simulation_candidate_at).toBeNull();
    // S, never evaluated, is simulated as before
    BASE_RUN = (await runOn(S, BASE)).run.runId;
    expect((await use(BASE_RUN)).use.reasons.map((r) => r.class)).toEqual(['unpromoted']);
  });

  it('Q2 · POSITIVE (the warning gate): the indicator breach flips Q\'s downside and S\'s; the warning on the failing scenario is raised and MARKED input_unverified (via scenario_quality), S\'s is not', async () => {
    const ev = await evaluateIndicator(QI1);
    const onQ = ev.warnings.find((x) => x.branchId === QDOWN);
    const onS = ev.warnings.find((x) => x.branchId === DOWN);
    expect(onQ).toBeDefined(); expect(onS).toBeDefined();
    const row = async (id: string) => (await sql<{ attention_state: string; attention_reason: string | null }>`select attention_state, attention_reason from prediction.warnings_current where warning_id = ${id}::uuid`.execute(su)).rows[0]!;
    expect(await row(onQ!.warningId)).toMatchObject({ attention_state: 'input_unverified', attention_reason: expect.stringMatching(/failed its quality evaluation .* \(indistinct_branches\)/) });
    expect((await row(onS!.warningId)).attention_state).toBe('none');
    const evs = (await sql<{ details: Row }>`select details from prediction.warning_events where warning_id = ${onQ!.warningId}::uuid and event = 'warning.attention'`.execute(su)).rows;
    expect(evs.map((x) => x.details['via'])).toEqual(['scenario_quality']);
    // the S disruption branch watched the same indicator and flipped too (its suspension is C2's)
    expect((await branchRow(DISRUPT)).state).toBe('flipped');
  });

  it('Q3 · RECOVERY → REFUSAL: the indistinct branch and the stale-signpost branch suspended, the evaluation passes; the run and the promotion stand — and the suspended branch is not promoted (branch_suspended)', async () => {
    await suspend(strategyOwner, QSHUT, 'the shutdown branch restates the closure; suspended pending a rewrite (B31 harness)');
    // the breach of Q2 left the collapse signpost's last observation in 2023 (the fixture series): STALE — suspended too, pending a fresh series
    await suspend(strategyOwner, QDOWN, 'the collapse signpost is stale; suspended until the series is observed again (B31 harness)');
    const e2 = (await evaluateQuality(strategyOwner, Q)).evaluation;
    expect(e2.outcome, JSON.stringify(e2.findings)).toBe('passed');
    const r = await runOn(Q, QBASE);
    expect(r.run.state).toBe('completed');
    await reviewScenario(strategyOwner, Q, { outcome: 'promote_to_simulation', branch_id: QBASE, note: 'promote the baseline now the tree passes (B31 harness)' });
    expect((await branchRow(QBASE)).simulation_candidate_at).not.toBeNull();
    await refused(reviewScenario(strategyOwner, Q, { outcome: 'promote_to_simulation', branch_id: QSHUT, note: 'promote the suspended branch (B31 harness)' }),
      /^promotion to simulation rejected \(branch_suspended\): branch "Strait shutdown" is suspended/, 409);
  });
});

describe('B31 validity · A · the assumption → scenario dependency (F-P4-07)', () => {
  let L1 = ''; let L2 = '';
  it('A1 · POSITIVE: a register link writes ONE active SCN → ASU dependency; a second link of the same ASU (another branch) adds none', async () => {
    L1 = (await link(strategyOwner, S, { assumptionId: ASU_RATES, branchId: BASE, critical: false, condition: { kind: 'state', text: 'the rates assumption is invalidated' }, rationale: 'the baseline assumes rates hold' })).link.link_id;
    expect(await deps(S, ASU_RATES)).toEqual([{ state: 'active', removed_by: null }]);
    L2 = (await link(strategyOwner, S, { assumptionId: ASU_RATES, branchId: DOWN, critical: false, condition: { kind: 'state', text: 'the rates assumption is invalidated' }, rationale: 'the collapse also assumes rates hold' })).link.link_id;
    expect(await deps(S, ASU_RATES)).toEqual([{ state: 'active', removed_by: null }]);
  });
  it('A2 · REFUSAL: a link refused by its port writes no dependency; one unlink while another link stands keeps it', async () => {
    const ghost = uuidv7();
    await refused(link(strategyOwner, S, { assumptionId: ghost, critical: false, condition: { kind: 'state', text: 'the ghost assumption is invalidated' }, rationale: 'an assumption that is not here' }), /^scenario assumption rejected \(unknown_assumption\)/, 404);
    expect(await deps(S, ghost)).toEqual([]);
    await unlink(strategyOwner, S, L2, 'the collapse branch no longer rests on the rates assumption');
    expect(await deps(S, ASU_RATES)).toEqual([{ state: 'active', removed_by: null }]);
  });
  it('A3 · RECOVERY: the last unlink retires it (removed by the unlinker); a relink writes it again', async () => {
    await unlink(strategyOwner, S, L1, 'the baseline no longer rests on the rates assumption either');
    expect(await deps(S, ASU_RATES)).toEqual([{ state: 'removed', removed_by: strategyOwner.principalId }]);
    await link(strategyOwner, S, { assumptionId: ASU_RATES, branchId: BASE, critical: false, condition: { kind: 'state', text: 'the rates assumption is invalidated' }, rationale: 'the baseline rests on rates again', expectedVersion: 2 });
    expect((await deps(S, ASU_RATES)).map((d) => d.state)).toEqual(['removed', 'active']);
  });
});

describe('B31 validity · C · the claim and indicator conditions suspend (F-P4-07)', () => {
  it('C1 · POSITIVE: a CRITICAL claim condition met (the claim disputed) suspends the branch in the same write and tasks its owner; a run on it is refused', async () => {
    await link(strategyOwner, S, { assumptionId: ASU_COVER, branchId: DISRUPT, critical: true, condition: { kind: 'claim', claimId: CLAIM, text: 'the war-risk cover claim is disputed' }, rationale: 'the disruption branch rests on the cover claim' });
    expect((await branchRow(DISRUPT)).state).toBe('flipped');
    await claimDispute();
    const b = await branchRow(DISRUPT);
    expect(b).toMatchObject({ state: 'suspended', suspended_from: 'flipped', suspension_cause: { kind: 'assumption', id: ASU_COVER, via: 'claim' } });
    const items = await itemsOf('scenario.suspension', DISRUPT);
    expect(items.at(-1)).toMatchObject({ owner_principal_id: forecastOwner.principalId, state: 'open', subject_kind: 'branch' });
    await refused(runOn(S, DISRUPT, vTwin, false), /^run rejected \(branch_suspended\)/, 409);
  });
  it('C2 · REFUSAL: a NON-critical claim condition met suspends nothing', async () => {
    const other = await seedClaim(w.evd);
    await link(strategyOwner, S, { assumptionId: ASU_CANAL, branchId: BASE, critical: false, condition: { kind: 'claim', claimId: other.id, text: 'the canal claim is disputed' }, rationale: 'the baseline notes the canal claim' });
    await other.dispute();
    expect((await branchRow(BASE)).state).toBe('open');
  });
  it('C3 · REFUSAL → RECOVERY (B31-F1): while the claim stays DISPUTED the owner\'s reinstatement is refused — a note does not clear the condition, however reasoned; the claim RESOLVED (its next version active), the reinstatement stands — back to flipped', async () => {
    await refused(reinstate(forecastOwner, DISRUPT, 'the cover claim is disputed but a second underwriter confirms cover (B31 harness)'),
      /^branch suspension rejected \(invalidated\): the critical assumption ".*" \(its claim condition is met — claim .* is disputed or withdrawn\) still holds against the branch/, 409);
    expect((await branchRow(DISRUPT)).state).toBe('suspended');
    expect((await itemsOf('scenario.suspension', DISRUPT)).at(-1)).toMatchObject({ state: 'open' });
    await claimResolve();
    await reinstate(forecastOwner, DISRUPT, 'the cover claim was reviewed and stands again; the branch holds (B31 harness)');
    expect((await branchRow(DISRUPT)).state).toBe('flipped');
    expect((await itemsOf('scenario.suspension', DISRUPT)).at(-1)).toMatchObject({ state: 'closed' });
  });
});

describe('B31 validity · B · the branch bound to its twin state (F-P4-07, AI-49-002, V03-T-332)', () => {
  let KEY = ''; let VAL: unknown = null;
  beforeAll(async () => {
    const el = (await sql<{ key: string; value: unknown }>`select key, to_jsonb(value) as value from twin.state_elements where twin_id = ${w.twinId}::uuid and version = ${vTwin} and key like 'consumption%' order by key limit 1`.execute(su)).rows[0]
      ?? (await sql<{ key: string; value: unknown }>`select key, to_jsonb(value) as value from twin.state_elements where twin_id = ${w.twinId}::uuid and version = ${vTwin} order by key limit 1`.execute(su)).rows[0]!;
    KEY = el.key; VAL = el.value;
  });
  it('B1 · POSITIVE: the scenario owner binds the baseline to the admitted state with an initial condition and the critical assumption → factor map; a run from that state stands', async () => {
    await link(strategyOwner, S, { assumptionId: ASU_CANAL, branchId: BASE, critical: true, condition: { kind: 'state', text: 'the canal assumption is invalidated' }, rationale: 'the baseline rests on the canal staying open', expectedVersion: 1 });
    const factors = (await sql<{ key: string }>`select f ->> 'key' as key from simulation.runs_current r, jsonb_array_elements(coalesce(r.sensitivity -> 'factors', '[]'::jsonb)) f where r.run_id = ${BASE_RUN}::uuid order by (f ->> 'cost_spread')::numeric desc`.execute(su)).rows.map((r) => r.key);
    const b = (await bind(strategyOwner, BASE, { twinId: w.twinId, twinVersion: vTwin, initialConditions: [{ key: KEY, value: VAL }], rationale: 'the baseline starts from the admitted corridor state (B31 harness)',
      assumptionFactors: factors.length > 0 ? [{ assumptionId: ASU_CANAL, factorKey: factors[0] }] : [] })).binding;
    expect(b).toMatchObject({ version: 1, state: 'active', twin_id: w.twinId, twin_version: vTwin, initial_conditions: [{ key: KEY, value: VAL }] });
    const run = await runOn(S, BASE);
    expect(run.run.state).toBe('completed');
    const read = await bindingRead(BASE);
    expect(read.runs.find((r) => r['run_id'] === run.run.runId)).toMatchObject({ from_bound_state: true });
    BASE_RUN = run.run.runId;
    evidence('B1', { binding: b['binding_id'], key: KEY, factors: factors.slice(0, 3) });
  });
  it('S1 · POSITIVE / REFUSAL / RECOVERY: the run on the bound baseline reads the critical canal assumption against its factor (material when it ranks in the top three); an unmapped critical assumption is named unmeasured; a rebound map measures it', async () => {
    const s = (await use(BASE_RUN)).assumptionSensitivity!;
    expect(s['source']).toBe('run');
    const canal = (s['assumptions'] as Row[]).find((a) => a['assumption_id'] === ASU_CANAL)!;
    if ((s['factors'] as Row[]).length > 0) {
      expect(canal).toMatchObject({ measured: true, material: true });
      expect(Number(canal['rank'])).toBeLessThanOrEqual(3);
      expect(s['material']).toEqual([ASU_CANAL]);
    } else {
      expect(canal).toMatchObject({ measured: false });
    }
    // the cover assumption is critical on the disruption branch — not the baseline's: not read here; the unmeasured case is a critical link without a factor
    await link(strategyOwner, S, { assumptionId: ASU_COVER, branchId: BASE, critical: true, condition: { kind: 'state', text: 'the cover assumption is invalidated' }, rationale: 'the baseline also rests on cover' });
    const s2 = (await use(BASE_RUN)).assumptionSensitivity!;
    expect(s2['unmeasured']).toContain(ASU_COVER);
    expect(String((s2['assumptions'] as Row[]).find((a) => a['assumption_id'] === ASU_COVER)!['note'])).toMatch(/^no factor is mapped/);
    evidence('S1', { material: s['material'], unmeasured: s2['unmeasured'] });
  });
  it('B2 · REFUSAL: a run from another twin version (run rejected (branch_binding)); a non-owner, an unknown element, a stated value that differs, a duplicate bind, a short retirement', async () => {
    vTwin2 = (await openVersion()).version.version;
    expect((await admit(vTwin2)).admitted.completeness).toBe('complete');
    await refused(runOn(S, BASE, vTwin2), /^run rejected \(branch_binding\): branch .* is bound \(binding v1\) to version/, 409);
    await refused(bind(forecastOwner, BASE, { twinId: w.twinId, twinVersion: vTwin2, initialConditions: [{ key: KEY }], rationale: 'not the owner of the baseline' }), /^branch binding rejected \(ownership\)/, 403);
    await refused(bind(strategyOwner, BASE, { twinId: w.twinId, twinVersion: vTwin2, initialConditions: [{ key: 'no.such.element' }], rationale: 'an element that is not there', expectedVersion: 1 }), /^branch binding rejected \(unknown_element\)/, 404);
    await refused(bind(strategyOwner, BASE, { twinId: w.twinId, twinVersion: vTwin2, initialConditions: [{ key: KEY, value: 'not the value' }], rationale: 'a value that differs', expectedVersion: 1 }), /^branch binding rejected \(initial_conditions\)/, 422);
    await refused(bind(strategyOwner, BASE, { twinId: w.twinId, twinVersion: vTwin2, initialConditions: [{ key: KEY }], rationale: 'a second bind without reading the first' }), /^branch binding rejected \(duplicate\)/, 409);
    await refused(retireBinding(strategyOwner, BASE, 'too short'), /^branch binding rejected \(reason\)/, 422);
  });
  it('B3 · RECOVERY: a rebind (naming v1) to the new version — the run stands; then the retirement — runs are no longer held to a state', async () => {
    const b2 = (await bind(strategyOwner, BASE, { twinId: w.twinId, twinVersion: vTwin2, initialConditions: [{ key: KEY }], rationale: 'the baseline moves to the newer admitted state (B31 harness)', expectedVersion: 1 })).binding;
    expect(b2).toMatchObject({ version: 2, superseded_version: 1 });
    expect((await runOn(S, BASE, vTwin2)).run.state).toBe('completed');
    await retireBinding(strategyOwner, BASE, 'the baseline is no longer held to one admitted state (B31 harness)');
    expect((await bindingRead(BASE)).active).toBeNull();
    expect((await runOn(S, BASE, vTwin)).run.state).toBe('completed');
    expect((await bindingRead(BASE)).history.map((x) => [x['version'], x['state']])).toEqual([[2, 'retired'], [1, 'superseded']]);
  });
});

describe('B31-F2 · the constraint contract recorded in a branch binding is honoured at run admission (V03-T-332, AI-49-002)', () => {
  /* The binding records a constraint SET and its VERSION; the gate evaluates every live set at its current version. A run on the bound
     branch is admitted only while the set is live AT the bound version — a newer version is never silently substituted, a retired set never
     silently omitted: the owner rebinds. A violated bound constraint refuses the run before it exists; an unverifiable check refuses it too.
     Each through the real routes: the constraint routes, the binding routes, the run route and the experiment's start (its run opens through
     the same path). SYNTHETIC. */
  type Ctl = { declare: Function; version: Function; retire: Function };
  let constraints: Ctl; let orchestration: { declare: Function; approve: Function; start: Function }; let gate: { check: Function };
  let steward: AuthenticatedPrincipal; let SET = ''; let QKEY = ''; let QUNIT = ''; let QVAL = 0; let KEYC = '';
  const creq = (as: AuthenticatedPrincipal, action: string, id: string | null) => h.req(as, action, 'CST', id, 'twin');
  const rule = (bound: number) => [{ key: 'b31f-on-hand', kind: 'business_rule', title: 'B31-F2 bound input (synthetic)', quantity: QKEY, op: '<=', value: bound, unit: QUNIT, applies_to: ['run_input'] }];
  const setVersion = async (constraintsList: Row[], expectedVersion: number, note: string) =>
    (await constraints.version(creq(steward, 'simulation.constraint.version', SET), T(), D(), SET, { payload: { expectedVersion, constraints: constraintsList, note } }) as { set: Row }).set;
  const bindWithSet = async (expectedVersion: number | null, note: string) => (await bind(strategyOwner, BASE, { twinId: w.twinId, twinVersion: vTwin, initialConditions: [{ key: KEYC }],
    constraintSetId: SET, rationale: note, ...(expectedVersion === null ? {} : { expectedVersion }) })).binding;
  const xreq = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'SXP', id, 'simulation');
  /** The experiment path: declared by a twin owner, approved by another person, started — its run opens through the same admission. */
  const experiment = async (title: string): Promise<{ error: string | null; state: string; reason: unknown }> => {
    const d = (await orchestration.declare(xreq(twinOwner2, 'simulation.experiment.declare'), T(), D(), { payload: {
      title, question: 'Does the bound baseline hold under lead-time jitter? (B31-F2 harness)',
      run: { twinId: w.twinId, twinVersion: vTwin, runKind: 'control', controlRunId: null, shock: false, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, scenarioId: S, scenarioBranchId: BASE },
      paths: 100, chunkSize: 50, seed: 7, jitter: { '0': 0.5, '3': 0.5 }, measures: ['total_cost'], budget: { max_paths: 100, max_wall_seconds: 300, max_chunks: 4 } } }) as { experiment: Row }).experiment;
    const id = String(d['experiment_id']);
    await orchestration.approve(xreq(strategyOwner, 'simulation.experiment.approve', id), T(), D(), id, { payload: { budgetDigest: d['budget_digest'], note: 'proportionate (B31-F2 harness)' } });
    const error = await orchestration.start(xreq(twinOwner2, 'simulation.experiment.start', id), T(), D(), id).then(() => null,
      (e: unknown) => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : String(e)));
    const row = (await sql<{ state: string; outcome: Row | null }>`select state, outcome from simulation.experiments where experiment_id = ${id}::uuid`.execute(su)).rows[0]!;
    return { error, state: row.state, reason: row.outcome?.['reason'] ?? null };
  };
  beforeAll(async () => {
    const { ConstraintsController: Cc } = await import('../../src/twin/constraints/constraints.controller.js');
    const { OrchestrationController: Oc } = await import('../../src/twin/simulations/orchestration/orchestration.controller.js');
    const { ConstraintService: Cs } = await import('../../src/twin/constraints/constraint.service.js');
    constraints = h.app.get(Cc) as unknown as Ctl; orchestration = h.app.get(Oc) as unknown as typeof orchestration; gate = h.app.get(Cs) as unknown as { check: Function };
    steward = await h.humanWithSession(['constraint_steward'], 'b31f-steward');
    // the bound input: a DATED numeric element of the admitted state among supply-flow@1's required inputs (the run's opening subject)
    const el = (await sql<{ key: string; unit: string | null; value: string }>`select e.key, e.unit, e.value::text as value from twin.state_elements e, twin.behaviour_models m
       where m.method_ref = 'supply-flow@1' and e.twin_id = ${w.twinId}::uuid and e.version = ${vTwin} and e.valid_from is not null and e.value::text ~ '^-?[0-9.]+$'
         and split_part(e.key, ':', 1) = any(m.required_inputs) order by e.key limit 1`.execute(su)).rows[0];
    expect(el, 'a dated numeric required input in the admitted state').toBeDefined();
    QKEY = el!.key; QUNIT = el!.unit ?? 'units'; QVAL = Number(el!.value);
    KEYC = (await sql<{ key: string }>`select key from twin.state_elements where twin_id = ${w.twinId}::uuid and version = ${vTwin} order by key limit 1`.execute(su)).rows[0]!.key;
    SET = String(((await constraints.declare(creq(steward, 'simulation.constraint.declare', null), T(), D(), { payload: { setKey: 'b31f-corridor-input', title: 'B31-F2 corridor input bound (synthetic)',
      constraints: rule(QVAL + 1_000_000), note: 'a bound the admitted state satisfies (B31-F2 harness)' } })) as { set: Row }).set['set_id']);
  });

  it('F2a · POSITIVE → REFUSAL → RECOVERY (a version change): bound to v1, a run stands; the set moves to v2 — the run and the experiment are REFUSED (rebind to adopt), nothing substituted; the owner rebinds to v2 — the run stands', async () => {
    const b = await bindWithSet(null, 'the baseline starts from the admitted state under the corridor input bound v1 (B31-F2 harness)');
    expect(b).toMatchObject({ state: 'active', constraint_set_id: SET, constraint_set_version: 1 });
    expect((await runOn(S, BASE)).run.state).toBe('completed');
    await setVersion(rule(QVAL + 2_000_000), 1, 'the bound widened for the refit (B31-F2 harness)');
    await refused(runOn(S, BASE), /^run rejected \(branch_binding\): branch .* is bound \(binding v\d+\) to constraint set "b31f-corridor-input" v1, which now stands at v2; .* rebind the branch to adopt v2/, 409);
    const x = await experiment('B31-F2 — bound set moved (SYNTHETIC)');
    expect(x).toMatchObject({ state: 'failed', reason: 'run_refused' });
    expect(x.error).toMatch(/run rejected \(branch_binding\): .* constraint set "b31f-corridor-input" v1, which now stands at v2/);
    const b2 = await bindWithSet(Number(b['version']), 'the baseline adopts the corridor input bound v2 (B31-F2 harness)');
    expect(b2).toMatchObject({ constraint_set_version: 2, superseded_version: b['version'] });
    expect((await runOn(S, BASE)).run.state).toBe('completed');
    evidence('F2a', { set: SET, bound: [1, 2], refused_run: true, refused_experiment: x.state });
  }, 300_000);

  it('F2b · REFUSAL (a violated bound constraint): v3 bounds the input below the admitted value; rebound to v3, the run and the experiment are refused by the gate before the run exists (422 constraint)', async () => {
    const v3 = await setVersion(rule(QVAL - 1), 2, 'the bound tightened below the admitted value (B31-F2 harness)');
    expect(Number(v3['version'])).toBe(3);
    const cur = (await bindingRead(BASE)).active!;
    await bindWithSet(Number(cur['version']), 'the baseline adopts the tightened bound v3 (B31-F2 harness)');
    const before = (await sql<{ n: number }>`select count(*)::int n from simulation.runs_current where scenario_branch_id = ${BASE}::uuid`.execute(su)).rows[0]!.n;
    await refused(runOn(S, BASE), /^run rejected \(constraint\): the run's inputs violate constraint set .* v3: b31f-on-hand \(business_rule\)/, 422);
    const x = await experiment('B31-F2 — bound constraint violated (SYNTHETIC)');
    expect(x).toMatchObject({ state: 'failed', reason: 'run_refused' });
    expect(x.error).toMatch(/run rejected \(constraint\)/);
    expect((await sql<{ n: number }>`select count(*)::int n from simulation.runs_current where scenario_branch_id = ${BASE}::uuid`.execute(su)).rows[0]!.n).toBe(before);
  }, 300_000);

  it('F2c · REFUSAL → RECOVERY (an unverifiable check): the gate failing on a run bound to a set is INDETERMINATE — refused, never admitted unchecked; the gate back, the satisfied v4 bound — the run stands', async () => {
    await setVersion(rule(QVAL + 1_000_000), 3, 'the bound relaxed again (B31-F2 harness)');
    const cur = (await bindingRead(BASE)).active!;
    await bindWithSet(Number(cur['version']), 'the baseline adopts the relaxed bound v4 (B31-F2 harness)');
    const original = gate.check;
    gate.check = async () => { throw new Error('the constraint store is unreachable (B31-F2 harness)'); };
    try {
      await refused(runOn(S, BASE), /^run rejected \(branch_binding\): branch .* is bound \(binding v\d+\) to constraint set .* v4, and the opening check could not verify it \(the constraint gate failed: the constraint store is unreachable/, 409);
    } finally { gate.check = original; }
    expect((await runOn(S, BASE)).run.state).toBe('completed');
  }, 300_000);

  it('F2d · REFUSAL → RECOVERY (a retirement): the bound set retired — the run and the experiment are refused, the set never silently omitted; the owner rebinds without the set — the run stands', async () => {
    await constraints.retire(creq(steward, 'simulation.constraint.retire', SET), T(), D(), SET, { payload: { reason: 'the corridor input bound is withdrawn (B31-F2 harness)' } });
    await refused(runOn(S, BASE), /^run rejected \(branch_binding\): branch .* is bound \(binding v\d+\) to constraint set "b31f-corridor-input" v4, which is retired/, 409);
    const x = await experiment('B31-F2 — bound set retired (SYNTHETIC)');
    expect(x).toMatchObject({ state: 'failed', reason: 'run_refused' });
    expect(x.error).toMatch(/which is retired/);
    const cur = (await bindingRead(BASE)).active!;
    const b = (await bind(strategyOwner, BASE, { twinId: w.twinId, twinVersion: vTwin, initialConditions: [{ key: KEYC }], rationale: 'the baseline no longer carries a constraint set (B31-F2 harness)',
      expectedVersion: Number(cur['version']) })).binding;
    expect(b).toMatchObject({ constraint_set_id: null, constraint_set_version: null });
    expect((await runOn(S, BASE)).run.state).toBe('completed');
    await retireBinding(strategyOwner, BASE, 'the baseline is no longer held to one admitted state (B31-F2 harness)');
  }, 300_000);
});

describe('B31 validity · C (indicator) · a critical indicator condition met suspends (F-P4-07)', () => {
  it('C4 · POSITIVE → REFUSAL → RECOVERY (B31-F1): a second indicator on the fixture series named by a critical link of the baseline; its breach suspends the baseline and tasks the owner; the reinstatement refused while it stays breached; the link revised non-critical by its owner, the reinstatement stands', async () => {
    const ind = (await prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
      { payload: { seriesKey: w.seriesKey, description: 'corridor thinning: transits below 1000 for three days — every fixture day is below it, so the breach STANDS (B31 harness)', comparator: '<', threshold: 1000, consecutiveDays: 3, owner: w.twinOwner.principalId } })) as unknown as { indicator: { indicatorId: string } };
    const I2 = ind.indicator.indicatorId;
    await link(strategyOwner, S, { assumptionId: ASU_RATES, branchId: BASE, critical: true, condition: { kind: 'indicator', indicatorId: I2, text: 'transits stay below 1000 for three days' }, rationale: 'the baseline assumes traffic holds', expectedVersion: 3 });
    await evaluateIndicator(I2);
    const b = await branchRow(BASE);
    expect(b).toMatchObject({ state: 'suspended', suspended_from: 'open', suspension_cause: { kind: 'assumption', id: ASU_RATES, via: 'indicator' } });
    expect((await itemsOf('scenario.suspension', BASE)).at(-1)).toMatchObject({ owner_principal_id: strategyOwner.principalId, state: 'open' });
    await refused(runOn(S, BASE), /^run rejected \(branch_suspended\)/, 409);
    // B31-F1: while the indicator stays BREACHED the reinstatement is refused, whatever the note says
    expect((await sql<{ breached: boolean }>`select breached from prediction.indicators_current where indicator_id = ${I2}::uuid`.execute(su)).rows[0]!.breached).toBe(true);
    await refused(reinstate(strategyOwner, BASE, 'traffic thinned but the baseline routing still holds (B31 harness)'),
      /^branch suspension rejected \(invalidated\): the critical assumption ".*" \(its indicator condition is met — indicator .* is breached\) still holds against the branch/, 409);
    expect((await branchRow(BASE)).state).toBe('suspended');
    // the GOVERNED CHANGE to the link: its owner revises it non-critical, with the reason — then the reinstatement stands
    const revised = (await link(strategyOwner, S, { assumptionId: ASU_RATES, branchId: BASE, critical: false, condition: { kind: 'indicator', indicatorId: I2, text: 'transits stay below 1000 for three days' },
      rationale: 'the baseline no longer rests on traffic holding: the reroute capacity covers the thinning (B31 harness)', expectedVersion: 4 })).link;
    expect(revised).toMatchObject({ critical: false, version: 5, change: 'revised' });
    await reinstate(strategyOwner, BASE, 'traffic thinned, and the baseline no longer rests on it (B31 harness)');
    expect((await branchRow(BASE)).state).toBe('open');
  });
});

describe('B31 validity · R · the reach of a twin correction (AI-28-005)', () => {
  it('R1 · POSITIVE: version 1 UNVERIFIED — the runs, the packages citing them, the commitment and the evaluation results are identified and recorded; the package owner is tasked (simulation.validity)', async () => {
    await validateTwin(dadmin, w.v1);
    // twin.mark_unverified's own two writes (a stated superuser move; its real path is the graph's impact propagation, phase5-corrections)
    await sql`insert into twin.twin_events (event_id, scope, tenant_id, domain_id, twin_id, event, actor_principal_id, details, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${w.twinId}::uuid, 'version.unverified', ${w.twinOwner.principalId}::uuid,
              ${JSON.stringify({ version: w.v1, reason: 'a cited shipment record was restated (B31 harness)', invalidation_id: null })}::jsonb, ${uuidv7()}::uuid)`.execute(su);
    await sql`update twin.twin_versions set verification_state = 'unverified' where twin_id = ${w.twinId}::uuid and version = ${w.v1}`.execute(su);
    const r = await reachList({ twinId: w.twinId, version: w.v1 });
    expect(r.reaches).toHaveLength(1);
    const x = r.reaches[0]!;
    expect(x).toMatchObject({ trigger: 'twin_unverified', twin_version: w.v1 });
    expect(x.runs.map((y) => y['run_id'])).toEqual(expect.arrayContaining([w.controlId, w.rerouteId, w.airId, RERUN]));
    expect(x.packages.map((y) => y['package_id'])).toEqual(expect.arrayContaining([GATED.pkg, REACHED.pkg]));
    expect(x.commitments.map((y) => y['package_id'])).toContain(GATED.pkg);
    expect(x.evaluation_results.twin_validations).toHaveLength(1);
    const items = await itemsOf('simulation.validity', GATED.pkg);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ owner_principal_id: w.owner.principalId, state: 'open', subject_kind: 'package', cause_event_type: 'validity.reach' });
    // a package with no commitment and no evaluation result is listed, not tasked
    expect(await itemsOf('simulation.validity', REACHED.pkg)).toEqual([]);
    expect(r.now).toMatchObject({ packages: expect.any(Array) });
    evidence('R1', { runs: x.runs.length, packages: x.packages.length, commitments: x.commitments.length, items: x.items.length });
  });
  it('R2 · REFUSAL: identification by an analyst (PDP), of an unknown version (404), without a version (422)', async () => {
    await refused(identify(analyst, { twinId: w.twinId, version: w.v1 }), /./, 403);
    await refused(identify(twinOwner2, { twinId: w.twinId, version: 999 }), /^run use rejected \(unknown_twin_version\)/, 404);
    await refused(identify(twinOwner2, { twinId: w.twinId }), /^run use rejected \(version\)/, 422);
  });
  it('R3 · RECOVERY: a person identifies the reach again — a new record, the owner tasked under the new identification', async () => {
    const r = (await identify(twinOwner2, { twinId: w.twinId, version: w.v1 })).reach;
    expect(r).toMatchObject({ trigger: 'operator', identified_by: twinOwner2.principalId });
    expect((await reachList({ twinId: w.twinId, version: w.v1 })).reaches).toHaveLength(2);
    expect(await itemsOf('simulation.validity', GATED.pkg)).toHaveLength(2);
  });
});
