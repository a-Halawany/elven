/**
 * CP-6 B35 part `reopen` (migration 0101 §P) — REOPEN, REPLAY, OUTCOMES (F-P6-06: V02-T-014, R-24, V10-T-055, ES-39-008, V00-T-040), the
 * B35 pieces of F-P4-08 (relevance outside an active set, a review cadence on a set, the risk and planning-cycle proposal sources' positive
 * path) and F-P4-09 (the cadence miss routed as a task), and §B36.12 row 11 (the reopen after an UPHELD post-commitment challenge) — through
 * the real database and controllers (POST …/decisions/review/…, the decision, scenario, set, exposure, cadence and memory routes), on the
 * world of `bootDecisionWorld` and this file's own humans with sessions (the ports compare the acting principal). Every figure is SYNTHETIC.
 *
 *   p1 · THE REOPEN RE-DECLARED: a change of conditions ("the corridor reopens") recorded with its evidence → the owner reopens on it
 *        (conditions_changed); the decision ledger's reopen events and the DecisionReopened payload as B18 left them; the scenario the
 *        committed version rests on (a run on its branch) — its owner TASKED (decision.reversion) with a reversion request; re-versioned
 *        through BranchScenario and the request resolved. A challenge upheld after the commitment (reopen_required) → reopen
 *        (challenge_upheld). An upheld APPEAL through §E's real decision.appeal_cases (the stand-in of the part's own run replaced at integration) — formerly a stated superuser stand-in table of the
 *        columns the seam reads (case_id, package_id, state, outcome, effect, adjudicated_at, …) proves the to_regclass path; without it the
 *        reopen answers unknown_appeal. The integrator asserts the real seam in the combined harness.
 *   p2 · THE OUTCOME ASSESSMENT in four separate fields by a named human (observed from the recorded 0045 outcome; inferred with method and
 *        confidence; counterfactual on the control run; changed conditions → decision.review_due on the assessment).
 *   p3 · THE REVIEW TERMS (baseline, replay horizon, evidence standard) on a version by its owner.
 *   p4 · THE REPLAY'S INITIATOR AND REASON beside decision.replays (within the horizon); the DECISION METRICS with the missing and DISPUTED
 *        evidence surfaced (a claim disputed and resolved — stated superuser inserts standing for the review, the B31 idiom).
 *   p5 · A LESSON as a governed memory object (memory.item.record naming the decision) linked to the assessment.
 *   p6 · F-P4-08/-09: the scenarios live packages cite OUTSIDE an active set scored (B27's rule v1, basis marked); a set's REVIEW CADENCE — the
 *        miss routed to the set owner by the TICK (decision.review_due) and met by a portfolio review; the RISK and PLANNING-CYCLE proposal
 *        sources' positive path end to end (an accepted exposure above its appetite; a reset cadence).
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. The scheduler is NOT enabled (the ticks are the harness's own); nothing here is a real
 * external integration.
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
import type { DecisionReviewController } from '../../src/decision/review/review.controller.js';
import type { ScenarioSetsController } from '../../src/prediction/scenarios/sets/sets.controller.js';
import type { ExposuresController } from '../../src/prediction/exposures/exposures.controller.js';
import type { HomeController } from '../../src/executive/home/home.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b35-reopen-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
const ELEMENT_KEY = 'outcome.line_stop_days:SYN-LINE-A1';
/** The separately identified synthetic observation (phase6-monitoring's file, copied: importing a test file would run it). */
const OUTCOMES_CSV = ['synthetic,record_id,line_id,line_stop_days,window_from,window_to,note',
  'true,SYN-OUT-2024Q1-A1,SYN-LINE-A1,3,2024-01-11,2024-04-10,three days of line stop while the rerouted shipment cleared the Cape'].join('\n') + '\n';

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let rv: DecisionReviewController; let setsCtl: ScenarioSetsController; let ex: ExposuresController; let hc: HomeController; let timer: AttentionTimerService; let scheduler: SchedulerService;
let strategist: AuthenticatedPrincipal; let forecaster: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let riskOwner: AuthenticatedPrincipal; let execHuman: AuthenticatedPrincipal;
/** What the cases leave one another. */
let S = ''; let S_BASE = ''; let vTwin = 0; let R_S = ''; let P1 = ''; let CHANGE = ''; let REQ1 = ''; let CHALLENGE = ''; let APPEAL = '';
let P2 = { pkg: '', v: 0, digest: '' }; let OUT = ''; let A1 = ''; let SET = ''; let agentId = ''; let MEM = ''; let CLAIM = ''; let P3 = '';
let claimDispute: () => Promise<void> = async () => undefined; let claimResolve: () => Promise<void> = async () => undefined;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

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
const evidence = (caseName: string, e: Row): void => console.log(`B35 REOPEN EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the rows ───────────── */
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(su)).rows as Row[];
const pkgRow = async (id: string) => (await rows(sql`select state, current_version, committed_version, reopens, reopen_cause from decision.packages_current where package_id = ${id}::uuid`))[0]!;
const pkgEvents = async (id: string) => (await rows(sql`select event, details from decision.package_events where package_id = ${id}::uuid order by occurred_at, event_id`));
const items = async (cls: string, subject?: string) => rows(sql`select item_id::text, subject_kind, subject_id::text, owner_principal_id::text as owner, state, title, details from executive.attention_items
  where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${cls} and (${subject ?? null}::uuid is null or subject_id = ${subject ?? null}::uuid) order by created_at`);
const outbox = async (eventType: string) => rows(sql`select payload from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by created_at, partition_seq`);
const scenarioVersion = async (id: string) => Number((await rows(sql`select current_version from prediction.scenarios_current where scenario_id = ${id}::uuid`))[0]!['current_version']);

/* ───────────── this part's routes ───────────── */
const R = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null, purpose = action.startsWith('prediction.') ? 'prediction' : 'decision') => h.req(as, action, type, id, purpose);
const reviewOf = (pkg: string, as: AuthenticatedPrincipal = analyst) => rv.review(R(as, 'decision.review.read', 'DPK', pkg), T(), D(), pkg) as unknown as Promise<{ review: Row; metrics: Row }>;
const metricsOf = async (pkg: string, as: AuthenticatedPrincipal = analyst) => ((await rv.metrics(R(as, 'decision.review.metrics', 'DPK', pkg), T(), D(), pkg)) as unknown as { metrics: Row }).metrics;
const recordChange = (as: AuthenticatedPrincipal, pkg: string, payload: Row) => rv.recordChange(R(as, 'decision.review.change', 'DPK', pkg), T(), D(), pkg, { payload }) as unknown as Promise<{ change: Row }>;
const reopen = (as: AuthenticatedPrincipal, pkg: string, cause: Row) => rv.reopen(R(as, 'decision.package.reopen', 'DPK', pkg), T(), D(), pkg, { payload: { cause } }) as unknown as Promise<{ reopened: Row }>;
const resolveReversion = (as: AuthenticatedPrincipal, id: string, resolution: string, note: string) =>
  rv.resolveReversion(R(as, 'decision.review.reversion', 'SCN', id), T(), D(), id, { payload: { resolution, note } }) as unknown as Promise<{ reversion: Row }>;
const assess = (as: AuthenticatedPrincipal, pkg: string, v: number, payload: Row) => rv.assess(R(as, 'decision.review.outcome', 'DPK', pkg), T(), D(), pkg, String(v), { payload }) as unknown as Promise<{ assessment: Row }>;
const setTerms = (as: AuthenticatedPrincipal, pkg: string, v: number, payload: Row) => rv.terms(R(as, 'decision.review.terms', 'DPK', pkg), T(), D(), pkg, String(v), { payload }) as unknown as Promise<{ terms: Row }>;
const replayWithReason = (as: AuthenticatedPrincipal, pkg: string, v: number, payload: Row) => rv.replay(R(as, 'decision.replay', 'RPL', null), T(), D(), pkg, String(v), { payload }) as unknown as Promise<{ replay: Row; request: Row }>;
const linkLesson = (as: AuthenticatedPrincipal, assessment: string, payload: Row) => rv.lesson(R(as, 'decision.review.lesson', 'MEM', String(payload['memoryItemId'] ?? '')), T(), D(), assessment, { payload }) as unknown as Promise<{ lesson: Row }>;
const setCadence = (as: AuthenticatedPrincipal, set: string, payload: Row) => rv.setCadence(R(as, 'prediction.scenario.set.cadence', 'SCS', set), T(), D(), set, { payload }) as unknown as Promise<{ cadence: Row }>;
const setStatus = async (set: string) => ((await rv.setStatus(R(analyst, 'decision.review.read', 'SCS', set), T(), D(), set)) as unknown as { set: Row }).set;
const sweep = (as: AuthenticatedPrincipal) => rv.sweep(R(as, 'prediction.scenario.set.cadence', 'SCS'), T(), D()) as unknown as Promise<{ sweep: Row }>;
const scoreCited = (as: AuthenticatedPrincipal) => rv.score(R(as, 'prediction.scenario.relevance.score', 'SCN'), T(), D()) as unknown as Promise<{ relevance: Row & { scenarios: Row[] } }>;
const index = () => rv.index(R(analyst, 'decision.review.read', 'DPK'), T(), D()) as unknown as Promise<{ packages: Row[]; reversions: Row[]; sets: Row[]; cited: Row[] }>;

/* ───────────── the neighbouring routes ───────────── */
const P = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'prediction');
const declareSet = (as: AuthenticatedPrincipal, payload: Row) => setsCtl.declare(P(as, 'prediction.scenario.set.declare', 'SCS'), T(), D(), { payload }) as unknown as Promise<{ set: Row }>;
const addMember = (as: AuthenticatedPrincipal, id: string, scenarioId: string) => setsCtl.addMember(P(as, 'prediction.scenario.set.member', 'SCS', id), T(), D(), id, { payload: { scenarioId, branchId: null } });
const activate = (as: AuthenticatedPrincipal, id: string) => setsCtl.activate(P(as, 'prediction.scenario.set.activate', 'SCS', id), T(), D(), id);
const readSet = (as: AuthenticatedPrincipal, id: string) => setsCtl.read(P(as, 'prediction.scenario.set.read', 'SCS', id), T(), D(), id) as unknown as Promise<{ set: Row }>;
const compareSet = (as: AuthenticatedPrincipal, id: string) => setsCtl.compare(P(as, 'prediction.scenario.set.read', 'SCS', id), T(), D(), id) as unknown as Promise<{ comparison: Row }>;
const portfolioReview = (as: AuthenticatedPrincipal, id: string, payload: Row) => setsCtl.review(P(as, 'prediction.scenario.set.review', 'SCS', id), T(), D(), id, { payload }) as unknown as Promise<{ review: Row }>;
const propose = (as: AuthenticatedPrincipal, payload: Row) => setsCtl.propose(P(as, 'prediction.scenario.proposal.propose', 'SCP'), T(), D(), { payload }) as unknown as Promise<{ proposal: Row }>;
const resolveProposal = (as: AuthenticatedPrincipal, id: string, resolution: string, note: string) =>
  setsCtl.resolve(P(as, 'prediction.scenario.proposal.resolve', 'SCP', id), T(), D(), id, { payload: { resolution, note } }) as unknown as Promise<{ proposal: Row }>;
const branchScenario = (as: AuthenticatedPrincipal, id: string, payload: Row) => w.prediction.branchScenario(P(as, 'prediction.scenario.branch', 'SCN', id), T(), D(), id, { payload }) as unknown as Promise<{ branching: Row & { branch_id: string } }>;
const challenge = (as: AuthenticatedPrincipal, pkg: string, v: number, reason: string) => w.decisions.challenge(h.req(as, 'decision.challenge', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload: { reason } }) as unknown as Promise<{ challenge: Row }>;
const resolveChallenge = (as: AuthenticatedPrincipal, pkg: string, v: number, challengeId: string, resolution: string, note: string) =>
  w.decisions.resolveChallenge(h.req(as, 'decision.challenge.resolve', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload: { challengeId, resolution, note } }) as unknown as Promise<{ resolution: Row }>;
const oldReopen = (as: AuthenticatedPrincipal, pkg: string, cause: Row) => w.decisions.reopen(h.req(as, 'decision.package.reopen', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload: { cause } as never });
const recordMemory = (as: AuthenticatedPrincipal, payload: Row) => w.graph.recordMemoryItem(h.req(as, 'memory.item.record', 'MEM', null, 'memory'), T(), D(), { payload }) as unknown as Promise<{ memory: { itemId: string } }>;
const XR = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'RSK', id, 'prediction');

/** A memory record of a person (source kind human) naming the decision. SYNTHETIC. */
const lessonRecord = (over: Row = {}): Row => ({
  recordClass: 'strategic', title: 'Dual-sourcing pays only while the corridor is closed (SYNTHETIC)',
  statement: 'The second source saved line days during the closure; once the corridor reopened its premium outweighed the saving (B35 harness).',
  source: { kind: 'human', ref: 'outcome review, B35 harness' }, audience: { classification: 'internal', roles: [], purposes: ['memory', 'graph', 'briefing', 'decision'] },
  validity: { from: '2024-04-10T00:00:00Z', to: null }, retention: { profile: 'strategic-record-7y', retainUntil: '2031-04-10T00:00:00Z', basis: 'the decision record retention schedule' },
  cites: [], related: { decisionId: w.decisionId, objectiveId: null }, ...over,
});

/** A claim as the extraction would have admitted it (the B21/B27/B31 seedClaim idiom); version 2 DISPUTED, version 3 active again. SYNTHETIC. */
async function seedClaim(ev: { id: string; version: number }): Promise<{ id: string; dispute: () => Promise<void>; resolve: () => Promise<void> }> {
  const claimId = uuidv7();
  const payload: Row = { claim_kind: 'claim', subject: 'Bab el-Mandeb Strait', predicate: 'corridor_state', object_value: 'the corridor reopens to merchant traffic (synthetic)', confidence: 0.7,
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
  // the harness stands for the review that disputes it and the one that resolves it (stated superuser moves; the B31 idiom)
  return { id: claimId, dispute: () => insert(2, 'disputed'), resolve: () => insert(3, 'active') };
}

/** A committed version through the product's own routes: propose, approve (the named approver), commit (the authority). */
async function commitVersion(pkg: string, v: number): Promise<void> {
  const pr = await c.propose(pkg, v);
  await c.approve(pkg, v, { decision: 'approve', versionDigest: pr.proposal.versionDigest, rationale: 'The second source keeps the line running while the corridor is closed (SYNTHETIC).' }, w.approver);
  await c.commit(pkg, v, pr.proposal.versionDigest, w.authority);
}
/** A reopened draft back through the cycle: the choice set again (a reopen carries no choice), then proposed, approved, committed. */
async function recommit(pkg: string): Promise<number> {
  const v = Number((await pkgRow(pkg))['current_version']);
  await c.choice(pkg, v, c.validChoice({ action_owner: w.owner.principalId }));
  await commitVersion(pkg, v);
  return v;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { DecisionReviewController: Rc } = await import('../../src/decision/review/review.controller.js');
  const { ScenarioSetsController: Sc } = await import('../../src/prediction/scenarios/sets/sets.controller.js');
  const { ExposuresController: Xc } = await import('../../src/prediction/exposures/exposures.controller.js');
  const { HomeController: Hc } = await import('../../src/executive/home/home.controller.js');
  rv = h.app.get(Rc); setsCtl = h.app.get(Sc); ex = h.app.get(Xc); hc = h.app.get(Hc);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  strategist = await h.humanWithSession(['strategy_owner'], 'b35r-strategist');
  forecaster = await h.humanWithSession(['forecast_owner'], 'b35r-forecaster');
  analyst = await h.humanWithSession(['domain_analyst'], 'b35r-analyst');
  auditor = await h.humanWithSession(['auditor'], 'b35r-auditor', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b35r-domain-admin');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b35r-tenant-admin', 'TENANT');
  riskOwner = await h.humanWithSession(['risk_owner', 'strategy_owner'], 'b35r-risk-owner');
  execHuman = await h.humanWithSession(['executive'], 'b35r-executive');
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  // S: the corridor scenario the dual-sourcing decision rests on (SYNTHETIC), owned by the strategist
  const s = (await w.prediction.declareScenario(P(strategist, 'prediction.scenario.declare', 'SCN'), T(), D(), { payload: {
    title: 'Bab el-Mandeb corridor — B35 reopen harness (synthetic)', statement: 'the corridor stays closed, or reopens to merchant traffic (B35 harness)', forecastId: w.forecastId,
    owner: strategist.principalId, reviewCadence: 'weekly', branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: strategist.principalId, consequence: 'keep the second source warm', responseWindowHours: 72 },
      { name: 'Corridor collapse', kind: 'downside', statement: 'below 40 for five days', indicatorId: w.indicatorId, owner: strategist.principalId, consequence: 'draw on the second source now', responseWindowHours: 48 },
    ] } })) as unknown as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  S = s.scenario.scenarioId; S_BASE = s.scenario.branches.find((b) => b.kind === 'baseline')!.branchId;
  // the twin version the scenario run binds: admitted AFTER the declaration (the B31 idiom)
  const o = (await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 } })) as unknown as { version: { version: number } };
  vTwin = o.version.version;
  await w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, String(vTwin), { payload: {} });
  R_S = ((await w.twins.run(h.req(w.operator, 'simulation.run', 'SIM', null, 'simulation'), T(), D(), { payload: { twinId: w.twinId, twinVersion: vTwin, runKind: 'control', controlRunId: null, shock: false,
    component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, scenarioId: S, scenarioBranchId: S_BASE } })) as unknown as { run: { runId: string; state: string } }).run.runId;
  // P1: "second source for bearings" — the status quo rests on the run on the corridor scenario's branch; the dual-source option unsimulated
  const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Second source for bearings — dual-source via Morocco (B35 harness, synthetic)', statement: 'whether to qualify a second bearing source while the corridor is closed', owner: w.owner.principalId });
  P1 = d.package.packageId;
  const v = (await c.open(P1)).version.version;
  await c.option(P1, v, { key: 'status-quo', title: 'Single source via the corridor', kind: 'status_quo', consequences: [{ kind: 'run', id: R_S }] });
  await c.option(P1, v, { key: 'reroute', title: 'Dual-source via Morocco', kind: 'intervention', consequences: [{ kind: 'evidence', id: w.evd.id, version: w.evd.version }],
    unsimulatedReason: 'the Moroccan supplier is not in the twin yet (B35 harness, synthetic)' });
  await c.terms(P1, v, c.validTerms());
  await c.choice(P1, v, c.validChoice({ action_owner: w.owner.principalId }));
  await commitVersion(P1, v);
  // the attention agent: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await w.exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: w.executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } } as never) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await new Promise((res) => setTimeout(res, 1500));
  await scheduler.unscheduleAttentionTick(T(), D());
}, 600_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B35 reopen · p1 · the reopen re-declared: conditions_changed, challenge_upheld, appeal_upheld; the scenario re-versioned (V02-T-014)', () => {
  it('p1 · POSITIVE: "the corridor reopens" recorded with its evidence; the owner reopens on it — the B18 events and payload unchanged; the scenario\'s owner TASKED to re-version', async () => {
    expect(await pkgRow(P1)).toMatchObject({ state: 'committed', committed_version: 1, reopens: 0 });
    const ch = (await recordChange(analyst, P1, { title: 'The corridor reopens (SYNTHETIC)', statement: 'merchant transits through Bab el-Mandeb resumed above the seasonal level (B35 harness, synthetic)',
      evidence: [{ kind: 'indicator', id: w.indicatorId, note: 'the corridor indicator back above 40' }, { kind: 'forecast', id: w.forecastId }] })).change;
    CHANGE = String(ch['change_id']);
    expect(ch).toMatchObject({ committed_version: 1, recorded_by: analyst.principalId, title: 'The corridor reopens (SYNTHETIC)' });
    const before = (await pkgEvents(P1)).length;
    const r = (await reopen(w.owner, P1, { kind: 'conditions_changed', ref: CHANGE })).reopened;
    expect(r).toMatchObject({ committed_version: 1, new_version: 2, reopens: 1, cause: { kind: 'conditions_changed', ref: CHANGE, title: 'The corridor reopens (SYNTHETIC)' }, options_carried: ['reroute', 'status-quo'] });
    expect(arr(r['exposed_inputs']).map((e) => e['kind'])).toEqual(['indicator', 'forecast']);
    // the decision ledger: EXACTLY the two B18 reopen events — nothing of this part's
    const evs = (await pkgEvents(P1)).slice(before);
    expect(evs.map((e) => e['event'])).toEqual(['version.opened', 'package.reopened']);
    expect(Object.keys(obj(evs[1]!['details'])).sort()).toEqual(['cause', 'commitment_id', 'committed_at', 'committed_version', 'exposed_inputs', 'known_at', 'new_version', 'observed_through', 'options_carried', 'options_dropped', 'reopens']);
    // DecisionReopened from this transaction, its payload keys B18's
    const ob = (await outbox('DecisionReopened')).map((x) => obj(x['payload']));
    expect(ob).toHaveLength(1);
    expect(Object.keys(ob[0]!).sort()).toEqual(['cause', 'commitment_id', 'committed_at', 'committed_version', 'decision_object_id', 'exposed_inputs', 'known_at', 'new_version', 'observed_through', 'options_carried',
      'options_dropped', 'package_id', 'recorded_cause', 'reopens', 'schema', 'schema_version', 'temporal', 'truncated']);
    expect(ob[0]).toMatchObject({ schema: 'DecisionReopened', schema_version: 'v1', package_id: P1, decision_object_id: w.decisionId, new_version: 2, recorded_cause: { kind: 'conditions_changed', ref: CHANGE } });
    // V02-T-014: the scenario the committed version rests on (the status quo's run on its branch) — its owner tasked, a request recorded
    const rq = arr(r['scenario_reversions']);
    expect(rq).toHaveLength(1);
    expect(rq[0]).toMatchObject({ scenario_id: S, scenario_version: 1, owner: strategist.principalId });
    expect(arr(rq[0]!['via'])[0]).toMatchObject({ kind: 'run', id: R_S, option_key: 'status-quo', branch_id: S_BASE });
    REQ1 = String(rq[0]!['request_id']);
    const it1 = await items('decision.reversion', S);
    expect(it1).toHaveLength(1);
    expect(it1[0]).toMatchObject({ subject_kind: 'scenario', owner: strategist.principalId, state: 'open' });
    expect(String(it1[0]!['title'])).toMatch(/^Re-version the scenario: .* was reopened \(conditions changed\)/);
    const view = (await reviewOf(P1)).review;
    expect(arr(view['reversion_requests'])[0]).toMatchObject({ state: 'open', scenario_version_at_request: 1, scenario_version_now: 1 });
    expect(arr(view['events']).map((e) => e['event'])).toEqual(['condition_change.recorded', 'reversion.requested']);
    evidence('p1+', { reopened: r['new_version'], cause: obj(r['cause'])['kind'], reversion: REQ1, item: it1[0]!['item_id'] });
  }, 120_000);

  it('p1 · REFUSAL: a change on a package no longer committed (409), unknown evidence (404), a change by a role without the action (403 PDP); the reopen\'s unknown cause (404) and malformed cause (422); the B18 route keeps its three kinds; the reversion resolved before the re-versioning (409) and by a non-owner (403)', async () => {
    await refused(recordChange(analyst, P1, { title: 'Another change', statement: 'recorded against a reopened decision (B35 harness)', evidence: [{ kind: 'indicator', id: w.indicatorId }] }), /^review rejected \(state\): package .* is reopened/, 409);
    const P2c = await c.committed();
    await refused(recordChange(analyst, P2c.pkg, { title: 'A change', statement: 'evidence that is not recorded (B35 harness)', evidence: [{ kind: 'warning', id: uuidv7() }] }), /^review rejected \(unknown_evidence\)/, 404);
    await refused(recordChange(forecaster, P2c.pkg, { title: 'A change', statement: 'the forecast owner has no review action (B35 harness)', evidence: [{ kind: 'indicator', id: w.indicatorId }] }), /./, 403);
    await refused(reopen(w.owner, P2c.pkg, { kind: 'conditions_changed', ref: uuidv7() }), /^reopen rejected \(unknown_change\)/, 404);
    await refused(reopen(w.owner, P2c.pkg, { kind: 'corridor_reopened', ref: uuidv7() }), /^reopen rejected \(cause\)/, 422);
    await refused(oldReopen(w.owner, P2c.pkg, { kind: 'challenge_upheld', ref: uuidv7() }), /a cause names a recorded input_invalidated note, a condition_breach or a policy_changed note by id/, 422);
    await refused(resolveReversion(strategist, REQ1, 'reversioned', 'nothing was re-versioned yet (B35 harness)'), /^review rejected \(state\): scenario .* is still at version 1/, 409);
    await refused(resolveReversion(forecaster, REQ1, 'declined', 'the forecast owner does not own the scenario (B35 harness)'), /^review rejected \(ownership\)/, 403);
    await refused(resolveReversion(analyst, REQ1, 'declined', 'no reversion action (B35 harness)'), /./, 403);
  }, 120_000);

  it('p1 · RECOVERY: the owner branches the scenario (BranchScenario, v2) and marks the request re-versioned — the item closed; the reopened draft is committed again; the spent change no longer reopens it (409)', async () => {
    await branchScenario(strategist, S, { expected_version: 1, idempotency_key: 'b35r-reopened-1', branch: { name: 'Corridor reopened', kind: 'upside', statement: 'transits resume above the seasonal level (synthetic)',
      indicatorId: w.indicatorId, owner: strategist.principalId, consequence: 'release the second source', responseWindowHours: 72, divergence: 'insurers restore war-risk cover (synthetic)' } });
    expect(await scenarioVersion(S)).toBe(2);
    const res = (await resolveReversion(strategist, REQ1, 'reversioned', 'the corridor-reopened branch added (B35 harness, synthetic)')).reversion;
    expect(res).toMatchObject({ state: 'reversioned', resolved_version: 2, resolved_by: strategist.principalId });
    expect((await items('decision.reversion', S))[0]).toMatchObject({ state: 'closed' });
    await refused(resolveReversion(strategist, REQ1, 'declined', 'resolved twice (B35 harness, synthetic)'), /^review rejected \(state\): reversion request .* was reversioned/, 409);
    expect(await recommit(P1)).toBe(2);
    expect(await pkgRow(P1)).toMatchObject({ state: 'committed', committed_version: 2 });
    await refused(reopen(w.owner, P1, { kind: 'conditions_changed', ref: CHANGE }), /^reopen rejected \(cause_state\): change .* was recorded against version 1/, 409);
    evidence('p1~', { reversioned: res['resolved_version'], recommitted: 2 });
  }, 180_000);

  it('p1 · §B36.12 row 11: a challenge UPHELD after the commitment (reopen_required) reopens the decision (challenge_upheld); open → refused (409); a reversion requested at the scenario\'s new version', async () => {
    CHALLENGE = String((await challenge(auditor, P1, 2, 'The commitment rests on a corridor reading the reopening has overtaken (B35 harness).')).challenge['challenge_id']);
    await refused(reopen(w.owner, P1, { kind: 'challenge_upheld', ref: CHALLENGE }), /^reopen rejected \(cause_state\): challenge .* is open, effect none/, 409);
    await refused(reopen(w.owner, P1, { kind: 'challenge_upheld', ref: uuidv7() }), /^reopen rejected \(unknown_challenge\)/, 404);
    const rs = (await resolveChallenge(w.owner, P1, 2, CHALLENGE, 'upheld', 'The corridor reading is stale; the decision is reviewed (B35 harness).')).resolution;
    expect(obj(rs['effect'])).toMatchObject({ kind: 'reopen_required', committed_version: 2 });
    const r = (await reopen(w.owner, P1, { kind: 'challenge_upheld', ref: CHALLENGE })).reopened;
    expect(r).toMatchObject({ committed_version: 2, new_version: 3, reopens: 2, cause: { kind: 'challenge_upheld', ref: CHALLENGE, standing: 'auditor', resolution: 'upheld' } });
    expect(arr(r['exposed_inputs'])).toEqual([{ kind: 'challenge', id: CHALLENGE, version: 2 }]);
    expect(arr(r['scenario_reversions'])[0]).toMatchObject({ scenario_id: S, scenario_version: 2 });
    expect((await items('decision.reversion', S)).filter((i) => i['state'] === 'open')).toHaveLength(1);
    // recovery: committed again; the spent challenge was resolved before the new commitment — refused
    expect(await recommit(P1)).toBe(3);
    await refused(reopen(w.owner, P1, { kind: 'challenge_upheld', ref: CHALLENGE }), /^reopen rejected \(cause_state\): challenge .* \(version 2\) was resolved at .*, not after the standing commitment \(version 3/, 409);
    evidence('p1·row11', { challenge: CHALLENGE, reopened: 3 });
  }, 180_000);

  it('p1 · appeal_upheld (§E\'s decision.appeal_cases — the seam asserted on the combined 0101): an unknown case 404; a DISMISSED appeal of the decided package refuses the reopen (409); an UPHELD one (reopen_required) reopens it', async () => {
    const { AppealController: Ac } = await import('../../src/decision/explanation/explanation.controller.js');
    const ac = h.app.get(Ac) as unknown as { open: Function; assign: Function; adjudicate: Function; close: Function };
    const areq = (as: AuthenticatedPrincipal, action: string, id: string | null) => h.req(as, action, 'APL', id, 'decision');
    const appellant = await h.humanWithSession(['strategy_owner'], 'b35p-appellant');
    const appeal = async (outcome: 'dismissed' | 'upheld', grounds: string, rationale: string): Promise<string> => {
      const k = ((await ac.open(areq(appellant, 'decision.appeal.open', null), T(), D(), { payload: { subjectKind: 'package', subjectId: P1,
        scope: { statement: 'the committed corridor decision (B35 reopen harness)' }, grounds } })) as { case: Row }).case;
      const id = String(k['case_id']);
      await ac.assign(areq(w.authority, 'decision.appeal.adjudicate', id), T(), D(), id, { payload: { adjudicator: w.authority2.principalId } });
      await ac.adjudicate(areq(w.authority2, 'decision.appeal.adjudicate', id), T(), D(), id, { payload: { outcome, rationale,
        ...(outcome === 'upheld' ? { correction: 'The owner reopens the package on the cause appeal_upheld (B35 reopen harness).' } : {}) } });
      return id;
    };
    APPEAL = uuidv7();
    await refused(reopen(w.owner, P1, { kind: 'appeal_upheld', ref: APPEAL }), /^reopen rejected \(unknown_appeal\): no such appeal .* on package/, 404);
    const DISMISSED = await appeal('dismissed', 'J. Weber contests the corridor forecast source behind this decision (SYNTHETIC).', 'The source stands; the decision rests on it as recorded (SYNTHETIC).');
    await refused(reopen(w.owner, P1, { kind: 'appeal_upheld', ref: DISMISSED }), /^reopen rejected \(cause_state\): appeal .* is adjudicated \(outcome dismissed, effect none\)/, 409);
    await ac.close(areq(w.authority2, 'decision.appeal.close', DISMISSED), T(), D(), DISMISSED, { payload: { note: 'dismissed; the appellant is told (B35 reopen harness)' } });
    const UPHELD = await appeal('upheld', 'The corridor reopened after the commitment; the decision rests on a closure that no longer holds (SYNTHETIC).', 'The decided routing rests on a closure that no longer holds; it is reopened by its owner (SYNTHETIC).');
    const r = (await reopen(w.owner, P1, { kind: 'appeal_upheld', ref: UPHELD })).reopened;
    expect(r).toMatchObject({ committed_version: 3, new_version: 4, reopens: 3, cause: { kind: 'appeal_upheld', ref: UPHELD, outcome: 'upheld', subject_kind: 'package' } });
    expect(await recommit(P1)).toBe(4);
    evidence('p1·appeal', { seam: '§E appeal_cases', dismissed: DISMISSED, upheld: UPHELD, reopened: 4 });
  }, 180_000);
});

describe('B35 reopen · p2 · the outcome assessment in four separate fields', () => {
  it('p2 · setup: a committed decision with its recorded outcome (the monitoring chain: the chosen run simulated, the outcome observed, reconciled, the OUT recorded)', async () => {
    P2 = await c.committed();
    const run = (await rows(sql`select outputs o from simulation.runs_current where run_id = ${w.rerouteId}::uuid`))[0]!['o'] as Row;
    const lineStop = Number(obj(run['totals'])['line_stop_days']);
    const tv = (payload: Row) => w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, { payload }) as unknown as Promise<{ version: { version: number } }>;
    const ground = (v: number, elements: Row[]) => w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, String(v), { payload: { elements } });
    const admit = (v: number) => w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, String(v), { payload: {} });
    const vSim = (await tv({ branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 })).version.version;
    await ground(vSim, [{ key: ELEMENT_KEY, kind: 'simulated', value: lineStop, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'run', id: w.rerouteId, version: 1 }] }]);
    await admit(vSim);
    const up = await h.upload([{ filename: 'outcomes-2024Q1-b35.csv', text: OUTCOMES_CSV, documentTime: '2024-04-10T00:00:00Z' }]);
    const outEvd = up[0] as { id: string; version: number };
    const vObs = (await tv({ branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-04-10', carryFrom: vSim, except: [ELEMENT_KEY] })).version.version;
    await ground(vObs, [{ key: ELEMENT_KEY, kind: 'observed', value: 3, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'evidence', id: outEvd.id, version: outEvd.version }], record: { locator: 'SYN-OUT-2024Q1-A1', field: 'line_stop_days' } }]);
    await admit(vObs);
    await w.twins.reconcile(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId, 'twin'), T(), D(), w.twinId, { payload: { key: ELEMENT_KEY, fromVersion: vSim, againstVersion: vObs, note: 'the chosen run against the actual line-stop days (B35)' } });
    const reconciliationId = String((await rows(sql`select reconciliation_id::text id from twin.reconciliations where twin_id = ${w.twinId}::uuid and key = ${ELEMENT_KEY} and from_version = ${vSim} and against_version = ${vObs} order by recorded_at desc limit 1`))[0]!['id']);
    OUT = (await c.outcome(P2.pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vObs, elementKey: ELEMENT_KEY, reconciliationId, note: 'Three days of line stop (SYNTHETIC).' })).outcome.outcomeId;
    expect(OUT).toMatch(/^[0-9a-f-]{36}$/);
  }, 240_000);

  const base = (): Row => ({
    observed: { outcomeIds: [OUT], statement: 'Three days of line stop over the quarter against a target of none (SYNTHETIC).' },
    inferred: { statement: 'The reroute is inferred to have saved about eleven line days while the corridor was closed (SYNTHETIC).', method: 'simulation_comparison', confidence: 0.6, magnitude: 11, unit: 'days' },
    counterfactual: { claim: 'Without the reroute the line would have stopped for about fourteen days (SYNTHETIC).', basis: { kind: 'run', runId: w.controlId } },
    changedConditions: [{ condition: 'The corridor reopened in March (SYNTHETIC)', effect: 'freight rates fell back' }],
  });

  it('p2 · POSITIVE: a named human assesses — observed (the OUT snapshotted), inferred (method, confidence), counterfactual (the control run), changed conditions — four fields; the changed conditions route decision.review_due to the owner', async () => {
    const a = (await assess(w.owner, P2.pkg, P2.v, base())).assessment;
    A1 = String(a['assessment_id']);
    expect(a).toMatchObject({ version: P2.v, assessment_version: 1, supersedes: null, assessed_by: w.owner.principalId });
    expect(obj(a['observed'])['outcomes']).toEqual([expect.objectContaining({ outcome_id: OUT, criterion_key: 'line_stop_days', met: false })]);
    expect(obj(a['inferred'])).toMatchObject({ method: 'simulation_comparison', confidence: 0.6, magnitude: 11 });
    expect(obj(a['counterfactual'])).toMatchObject({ basis: { kind: 'run', run_id: w.controlId, state: 'completed' } });
    expect(arr(a['changed_conditions'])).toHaveLength(1);
    expect(String(a['digest'])).toMatch(/^[0-9a-f]{64}$/);
    const it = await items('decision.review_due', A1);
    expect(it).toHaveLength(1);
    expect(it[0]).toMatchObject({ subject_kind: 'outcome_assessment', owner: w.owner.principalId, state: 'open' });
    evidence('p2+', { assessment: A1, item: it[0]!['item_id'] });
  });

  it('p2 · REFUSAL: merged fields (422 separation), an unknown outcome (404), a version never committed (409), a reader without the action (403 PDP)', async () => {
    await refused(assess(w.owner, P2.pkg, P2.v, { ...base(), inferred: { ...obj(base()['inferred']), statement: String(obj(base()['observed'])['statement']) } }), /^review rejected \(separation\)/, 422);
    await refused(assess(w.owner, P2.pkg, P2.v, { ...base(), observed: { outcomeIds: [uuidv7()], statement: 'an outcome that is not recorded (B35 harness)' }, supersedes: A1 }), /^review rejected \(unknown_outcome\)/, 404);
    await refused(assess(w.owner, P2.pkg, 9, base()), /^review rejected \(state\): version 9 of package .* was never committed/, 409);
    await refused(assess(w.approver, P2.pkg, P2.v, base()), /./, 403);
    await refused(assess(w.owner, P2.pkg, P2.v, { ...base(), inferred: { statement: 'no method stated for this inference (B35)', confidence: 2 } }), /^review rejected \(inferred\)/, 422);
  });

  it('p2 · RECOVERY: a revision that names no assessment read is stale (409); naming the one read records version 2', async () => {
    await refused(assess(w.owner, P2.pkg, P2.v, base()), /^review rejected \(stale\)/, 409);
    const a2 = (await assess(w.owner, P2.pkg, P2.v, { ...base(), supersedes: A1, changedConditions: [] })).assessment;
    expect(a2).toMatchObject({ assessment_version: 2, supersedes: A1 });
    expect(await items('decision.review_due', String(a2['assessment_id']))).toHaveLength(0);
    A1 = String(a2['assessment_id']);
  });
});

describe('B35 reopen · p3 · the review terms (R-24, V10-T-055)', () => {
  it('p3 · POSITIVE / REFUSAL / RECOVERY: the owner sets baseline, horizon and standard; another decision owner 403, an unknown criterion 422, a stale revision 409; the revision at the version read', async () => {
    const t = (await setTerms(w.owner, P2.pkg, P2.v, { baseline: { kind: 'run', ref: w.controlId, statement: 'the do-nothing control run of the corridor collapse (SYNTHETIC)' }, replayHorizonDays: 365,
      evidenceStandard: 'decision_grade', evidenceNote: 'every cited run promoted for the routing decision' })).terms;
    expect(t).toMatchObject({ terms_version: 1, replay_horizon_days: 365, evidence_standard: 'decision_grade', baseline: { kind: 'run', ref: w.controlId } });
    await refused(setTerms(w.authorApprover, P2.pkg, P2.v, { baseline: { kind: 'stated', statement: 'another owner states a baseline' }, replayHorizonDays: 30, evidenceStandard: 'reviewed', evidenceNote: 'not the package owner', expectedVersion: 1 }), /^review rejected \(ownership\)/, 403);
    await refused(setTerms(w.owner, P2.pkg, P2.v, { baseline: { kind: 'outcome_criterion', ref: 'no_such_key', statement: 'a criterion the choice does not name' }, replayHorizonDays: 30, evidenceStandard: 'reviewed', evidenceNote: 'the criterion is unknown', expectedVersion: 1 }), /^review rejected \(baseline\): no_such_key is not an outcome criterion/, 422);
    await refused(setTerms(w.owner, P2.pkg, P2.v, { baseline: { kind: 'stated', statement: 'a stale revision of the terms' }, replayHorizonDays: 30, evidenceStandard: 'reviewed', evidenceNote: 'names no version read' }), /^review rejected \(stale\)/, 409);
    const t2 = (await setTerms(w.owner, P2.pkg, P2.v, { baseline: { kind: 'outcome_criterion', ref: 'line_stop_days', statement: 'no line stop over the quarter (SYNTHETIC)' }, replayHorizonDays: 180,
      evidenceStandard: 'reviewed', evidenceNote: 'every cited input standing and reviewed', expectedVersion: 1 })).terms;
    expect(t2).toMatchObject({ terms_version: 2, replay_horizon_days: 180, baseline: { kind: 'outcome_criterion', ref: 'line_stop_days' } });
  });
});

describe('B35 reopen · p4 · the replay\'s initiator and reason; the decision metrics with the missing and disputed evidence surfaced (ES-39-008)', () => {
  it('p4 · POSITIVE: a replay WITH its reason (the executive) — decision.replays as before, the request beside it within the horizon; the metrics of the committed package', async () => {
    const r = await replayWithReason(w.executive, P2.pkg, P2.v, { reason: 'The board asks what the reroute decision rested on when it was taken (B35 harness).' });
    expect(r.request).toMatchObject({ initiator_principal_id: w.executive.principalId, within_horizon: true, version: P2.v });
    const replayId = String(r.replay['replayId']);
    expect(r.request['replay_id']).toBe(replayId);
    expect((await rows(sql`select reader_principal_id::text r from decision.replays where replay_id = ${replayId}::uuid`))[0]!['r']).toBe(w.executive.principalId);
    // a replay through the B18 route carries no reason: the read says so
    await c.replay(P2.pkg, P2.v);
    const rp = arr((await reviewOf(P2.pkg)).review['replays']);
    expect(rp.map((x) => x['reason'] === null)).toEqual([false, true]);
    const m = await metricsOf(P2.pkg);
    expect(m).toMatchObject({ committed_version: P2.v });
    expect(['committed', 'monitoring']).toContain(m['state']);
    expect(obj(m['completeness'])).toMatchObject({ disputed: [], appeals_open: 0 });
    expect(arr(obj(m['completeness'])['criteria']).find((x) => x['key'] === 'review_terms')).toMatchObject({ met: true });
    expect(obj(m['outcome_linkage'])).toMatchObject({ criteria: 1, outcomes_recorded: 1, share: 1, assessments: 2, linked: true });
    expect(Number(obj(m['time_to_decision'])['hours'])).toBeGreaterThanOrEqual(0);
    expect(obj(m['evidence_coverage'])).toMatchObject({ options: 2, standard: 'reviewed', meets_standard: true });
    const m1 = await metricsOf(P1);
    expect(obj(m1['time_to_decision'])).toMatchObject({ reopens: 3 });
    expect(obj(m1['reversibility'])).toMatchObject({ reopens: 3, last_cause: 'appeal_upheld' });
    evidence('p4+', { replay: replayId, completeness: obj(m['completeness'])['score'], linkage: m['outcome_linkage'] });
  }, 120_000);

  it('p4 · REFUSAL: a replay without a reason (422), of a version never committed (409), by a reader without the action (403); the metrics of an unknown package (404) and for an agent (403)', async () => {
    await refused(replayWithReason(w.executive, P2.pkg, P2.v, { reason: 'why' }), /^review rejected \(reason\)/, 422);
    const draft = await c.fullDraft();
    await refused(replayWithReason(w.executive, draft.pkg, draft.v, { reason: 'a draft has no decision to replay (B35 harness)' }), /not committed/, 409);
    await refused(replayWithReason(w.agent, P2.pkg, P2.v, { reason: 'the decision agent may not replay (B35 harness)' }), /./, 403);
    await refused(metricsOf(uuidv7()), /^review rejected \(unknown_package\)/, 404);
    await refused(metricsOf(P2.pkg, w.agent), /./, 403);
    // DISPUTED evidence surfaced: a draft citing a claim the review disputes (stated superuser moves)
    const cl = await seedClaim(w.evd); CLAIM = cl.id; claimDispute = cl.dispute; claimResolve = cl.resolve;
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Hold the bearings on the claim (B35 harness)', statement: 'a draft resting on a claim about the corridor', owner: w.owner.principalId });
    P3 = d.package.packageId;
    const v = (await c.open(P3)).version.version;
    await c.option(P3, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    await c.option(P3, v, { key: 'hold', title: 'Hold on the corridor claim', kind: 'intervention', consequences: [{ kind: 'claim', id: CLAIM, version: 1 }], unsimulatedReason: 'a claim, not a simulated consequence (B35 harness)' });
    const before = await metricsOf(P3);
    expect(obj(before['completeness'])['disputed']).toEqual([]);
    expect(arr(obj(before['completeness'])['missing']).map((x) => x['what'])).toEqual(expect.arrayContaining(['choice', 'objectives', 'review_terms']));
    await claimDispute();
    const after = obj((await metricsOf(P3))['completeness']);
    expect(arr(after['disputed'])).toEqual([expect.objectContaining({ option_key: 'hold', kind: 'claim', id: CLAIM, standing: 'disputed' })]);
  }, 180_000);

  it('p4 · RECOVERY: the review resolves the claim — the disputed list empties; a replay with a reason after the refusal is recorded', async () => {
    await claimResolve();
    expect(obj((await metricsOf(P3))['completeness'])['disputed']).toEqual([]);
    const r = await replayWithReason(w.executive, P2.pkg, P2.v, { reason: 'Replayed again for the outcome review (B35 harness).' });
    expect(r.request['within_horizon']).toBe(true);
    expect(arr((await reviewOf(P2.pkg)).review['replays'])).toHaveLength(3);
  });
});

describe('B35 reopen · p5 · hypotheses and lessons as governed memory objects (V00-T-040)', () => {
  it('p5 · POSITIVE / REFUSAL / RECOVERY: a memory record naming the decision linked as a lesson; a record naming no decision (422), a principal neither recorder nor owner (403), an unknown record (404), a second link of the same (409); a hypothesis linked beside it', async () => {
    MEM = (await recordMemory(strategist, lessonRecord())).memory.itemId;
    const l = (await linkLesson(strategist, A1, { kind: 'lesson', memoryItemId: MEM })).lesson;
    expect(l).toMatchObject({ kind: 'lesson', memory_item_id: MEM, memory_version: 1, package_id: P2.pkg, linked_by: strategist.principalId });
    const stray = (await recordMemory(strategist, lessonRecord({ title: 'A record about nothing decided (SYNTHETIC)', related: { decisionId: null, objectiveId: null } }))).memory.itemId;
    await refused(linkLesson(strategist, A1, { kind: 'lesson', memoryItemId: stray }), /^review rejected \(memory_item\): .* does not name the package's decision/, 422);
    await refused(linkLesson(w.authority, A1, { kind: 'lesson', memoryItemId: MEM }), /^review rejected \(ownership\)/, 403);
    await refused(linkLesson(strategist, A1, { kind: 'lesson', memoryItemId: uuidv7() }), /^review rejected \(unknown_memory_item\)/, 404);
    await refused(linkLesson(strategist, A1, { kind: 'lesson', memoryItemId: MEM }), /^review rejected \(duplicate\)/, 409);
    await refused(linkLesson(analyst, A1, { kind: 'lesson', memoryItemId: MEM }), /./, 403);
    const hyp = (await recordMemory(strategist, lessonRecord({ title: 'Hypothesis: the premium is worth it only above a 30-day closure (SYNTHETIC)', statement: 'A second source pays for itself only when the corridor closes for longer than thirty days (B35 harness, synthetic).' }))).memory.itemId;
    expect((await linkLesson(w.owner, A1, { kind: 'hypothesis', memoryItemId: hyp })).lesson).toMatchObject({ kind: 'hypothesis' });
    expect(arr((await reviewOf(P2.pkg)).review['lessons']).map((x) => x['kind'])).toEqual(['lesson', 'hypothesis']);
    expect(obj((await metricsOf(P2.pkg))['outcome_linkage'])['lessons']).toBe(2);
  }, 120_000);
});

describe('B35 reopen · p6 · F-P4-08 / F-P4-09: relevance outside an active set, the set review cadence, the risk and planning-cycle proposals', () => {
  it('p6a · POSITIVE: the scenario P1 cites outside every active set is scored by B27\'s rule (basis outside_active_set); unchanged → no new row; a reader without the act 403', async () => {
    const s1 = (await scoreCited(strategist)).relevance;
    const mine = arr(s1['scenarios']).find((x) => x['scenario_id'] === S);
    expect(mine).toMatchObject({ changed: true, cited_by: [P1] });
    const row = (await rows(sql`select basis, trigger from prediction.scenario_relevance where scenario_id = ${S}::uuid order by scored_at desc limit 1`))[0]!;
    expect(obj(row['basis'])).toMatchObject({ outside_active_set: true, cited_by: [P1], rule: expect.stringMatching(/^relevance v1/) });
    expect(row['trigger']).toBe('operator');
    const s2 = (await scoreCited(strategist)).relevance;
    expect(arr(s2['scenarios']).find((x) => x['scenario_id'] === S)).toMatchObject({ changed: false });
    await refused(scoreCited(analyst), /./, 403);
    expect((await index()).cited.map((x) => x['scenario_id'])).toContain(S);
  });

  it('p6b · the set: S joins an ACTIVE set — no longer scored here (B27\'s step scores it); the cadence by the owner; a forecaster 403 (port), an analyst 403 (PDP), a future anchor 422, a stale version 409', async () => {
    SET = String((await declareSet(strategist, { title: 'Bearings supply — corridor set (B35 harness)', purpose: 'the scenarios the bearing dual-sourcing decision is weighed against (SYNTHETIC)',
      policy: { require: ['baseline'], min_branches: 2, min_adverse: 1 } })).set['set_id']);
    await addMember(strategist, SET, S);
    await activate(strategist, SET);
    expect(arr((await scoreCited(strategist)).relevance['scenarios']).map((x) => x['scenario_id'])).not.toContain(S);
    await refused(setCadence(forecaster, SET, { everyDays: 7, rationale: 'the forecaster does not own the set' }), /^review rejected \(ownership\)/, 403);
    await refused(setCadence(analyst, SET, { everyDays: 7, rationale: 'no cadence action' }), /./, 403);
    await refused(setCadence(strategist, SET, { everyDays: 7, anchorAt: new Date(Date.now() + 86_400_000 * 3).toISOString(), rationale: 'an anchor in the future' }), /^review rejected \(anchor\)/, 422);
    const now = String((await rows(sql`select (clock_timestamp() - interval '10 days')::text t`))[0]!['t']);
    const cd = (await setCadence(strategist, SET, { everyDays: 7, anchorAt: new Date(now).toISOString(), rationale: 'the corridor moves weekly; the set is reviewed with it (SYNTHETIC)' })).cadence;
    expect(cd).toMatchObject({ cadence_version: 1, every_days: 7 });
    await refused(setCadence(strategist, SET, { everyDays: 14, rationale: 'a revision naming no version read' }), /^review rejected \(stale\)/, 409);
    expect(obj((await setStatus(SET))['due'])).toMatchObject({ overdue: true, every_days: 7 });
  }, 120_000);

  it('p6b · POSITIVE (the TICK): the steps registered (72, 73); the tick routes the miss ONCE to the set owner (decision.review_due); a second check adds nothing', async () => {
    const reg = h.app.get(AttentionTickRegistry);
    expect(reg.steps().map((s) => [s.name, s.order])).toEqual(expect.arrayContaining([['cited-scenario-relevance', 72], ['review-cadence', 73]]));
    const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2036, 4, 2)) });
    expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
    const outputs = obj(t.run?.outputs); const steps = obj(outputs['steps'] ?? outputs);
    expect(obj(steps['review-cadence'])).toMatchObject({ missed: 1 });
    const it = await items('decision.review_due', SET);
    expect(it).toHaveLength(1);
    expect(it[0]).toMatchObject({ subject_kind: 'scenario_set', owner: strategist.principalId, state: 'open' });
    expect((await sweep(strategist)).sweep).toMatchObject({ missed: 0, met: 0 });
    expect(arr((await setStatus(SET))['misses'])).toHaveLength(1);
  }, 120_000);

  it('p6b · RECOVERY: a portfolio review of the set MEETS the miss (the item closed); the next review falls due in seven days', async () => {
    const members = arr((await readSet(strategist, SET)).set['members']).filter((m) => m['removed_at'] === null);
    const live = arr((await compareSet(analyst, SET)).comparison['branches']).filter((b) => b['live']);
    const opts = [{ key: 'reroute', title: 'Dual-source via Morocco' }, { key: 'status-quo', title: 'Single source via the corridor' }];
    const payoffs = Object.fromEntries(opts.map((o) => [o.key, Object.fromEntries(live.map((b) => [String(b['branch_id']), o.key === 'reroute' ? -40 : (b['kind'] === 'downside' ? -310 : 0)]))]));
    await portfolioReview(strategist, SET, { members: members.map((m) => ({ member_id: m['member_id'], relevance: 'high', consequence: 'C3' })), options: opts, payoffs, unit: 'EUR k', note: 'the weekly review of the corridor set (SYNTHETIC)' });
    expect((await sweep(strategist)).sweep).toMatchObject({ missed: 0, met: 1 });
    expect((await items('decision.review_due', SET))[0]).toMatchObject({ state: 'closed' });
    const st = await setStatus(SET);
    expect(obj(st['due'])).toMatchObject({ overdue: false });
    expect(arr(st['misses'])[0]!['met_at']).not.toBeNull();
  }, 120_000);

  it('p6c · the RISK source end to end: refused before the exposure is accepted (422); an accepted exposure above its appetite proposes a scenario, routed to the strategy owners; resolved by another strategy owner', async () => {
    const categories = [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }];
    await ex.publishTaxonomy(XR(execHuman, 'prediction.exposure.taxonomy.publish'), T(), D(), { payload: { expectedVersion: 0, categories, reason: 'the first taxonomy of the domain (B35 harness)' } });
    await ex.activateTaxonomy(h.req(dadmin, 'prediction.exposure.taxonomy.activate', 'RSK', null, 'prediction'), T(), D(), { payload: { version: 1, reason: 'the first taxonomy reviewed (B35 harness)' } });
    await ex.approveAppetite(XR(execHuman, 'prediction.exposure.appetite.approve'), T(), D(), { payload: { category: 'supply_chain', expectedVersion: 0, threshold: 250_000, unit: 'EUR', statement: 'no single supply-chain exposure above EUR 250k residual', reason: 'the Q1 appetite (SYNTHETIC)' } });
    const rsk = ((await w.graph.declare(h.req(riskOwner, 'graph.strategy.declare', 'RSK', null, 'graph'), T(), D(), { payload: { objectType: 'RSK', title: 'Bearing supply interruption — corridor (B35)',
      statement: 'A corridor closure interrupts the bearing supply to the Regensburg line (SYNTHETIC)', restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the corridor drives this exposure' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
    await ex.register(XR(analyst, 'prediction.exposure.register', rsk), T(), D(), { payload: { strategyObjectId: rsk, polarity: 'risk', category: 'supply_chain', owner: riskOwner.principalId } });
    await refused(propose(forecaster, { kind: 'risk', source: { exposure_id: rsk }, title: 'Bearing supply interruption', rationale: 'the exposure is not accepted yet (B35 harness)' }), /^scenario proposal rejected \(source\): exposure .* is identified/, 422);
    const as = (await ex.assess(XR(analyst, 'prediction.exposure.assess', rsk), T(), D(), rsk, { payload: { expectedVersion: 0, assessment: {
      mechanism: 'A corridor closure delays the bearing shipments; the line stops when the buffer runs out (SYNTHETIC)', probability: { low: 0.3, high: 0.6 }, impact: { low: 400_000, high: 900_000, unit: 'EUR' },
      horizon: '2024-Q1', response_window_hours: 72, velocity: 'weeks', reversibility: 'partly_reversible', controllability: 'low', confidence: 0.6,
      options: [{ key: 'dual-source', label: 'Qualify a second bearing source', kind: 'mitigate', cost: 120_000 }, { key: 'hold', label: 'Accept and watch', kind: 'accept' }],
      evidence: [{ object_id: w.evd.id, version: w.evd.version }], basis: 'SYNTHETIC fixture amounts (B35 harness)' } } })) as { assessment: Row };
    const pv = (await ex.preview(XR(riskOwner, 'prediction.exposure.read', rsk), T(), D(), rsk, '1')) as { preview: Row };
    expect(obj(pv.preview['residual'])['breach']).toBe(true);
    await ex.accept(XR(riskOwner, 'prediction.exposure.accept', rsk), T(), D(), rsk, '1', { payload: { digest: String(as.assessment['digest']), rationale: 'The assessment matches the corridor evidence (B35 harness).' } });
    const q = (await propose(forecaster, { kind: 'risk', source: { exposure_id: rsk }, title: 'Bearing supply interruption', rationale: 'an accepted exposure above its appetite (B35 harness, synthetic)' })).proposal;
    expect(q).toMatchObject({ kind: 'risk', state: 'open', proposed_kind: 'human', source_facts: expect.objectContaining({ exposure_id: rsk, state: 'accepted' }) });
    expect((await items('scenario.proposal', String(q['proposal_id'])))[0]).toMatchObject({ state: 'open' });
    await refused(resolveProposal(forecaster, String(q['proposal_id']), 'accepted', 'the proposer never resolves (B35 harness)'), /./, 403);
    expect((await resolveProposal(strategist, String(q['proposal_id']), 'accepted', 'the corridor scenario is extended with a bearing branch (B35 harness)')).proposal).toMatchObject({ state: 'accepted' });
  }, 180_000);

  it('p6c · the PLANNING-CYCLE source end to end: refused before the cadence is reset (422); a reset proposes a scenario; a second proposal from the same reset 409', async () => {
    const cad = (await hc.openCadence(h.req(execHuman, 'executive.cadence.open', 'CAD', null, 'executive'), T(), D(), { payload: { period: 'weekly' } }) as unknown as { cadence: Row }).cadence;
    const cadenceId = String(cad['cadence_id']);
    await refused(propose(forecaster, { kind: 'planning_cycle', source: { cadence_id: cadenceId }, title: 'Next planning cycle scenarios', rationale: 'the cadence is not reset yet (B35 harness)' }), /^scenario proposal rejected \(source\): cadence .* has not been reset/, 422);
    await hc.resetCadence(h.req(execHuman, 'executive.cadence.reset', 'CAD', null, 'executive'), T(), D(), { payload: { period: 'weekly' } });
    const q = (await propose(forecaster, { kind: 'planning_cycle', source: { cadence_id: cadenceId }, title: 'Next planning cycle scenarios', rationale: 'the weekly cycle was reset (B35 harness, synthetic)' })).proposal;
    expect(q).toMatchObject({ kind: 'planning_cycle', state: 'open', source_facts: expect.objectContaining({ cadence_id: cadenceId, reset: 'cadence.reset' }) });
    await refused(propose(forecaster, { kind: 'planning_cycle', source: { cadence_id: cadenceId }, title: 'Next planning cycle scenarios', rationale: 'the same reset again (B35 harness)' }), /^scenario proposal rejected \(duplicate\)/, 409);
  }, 120_000);
});
