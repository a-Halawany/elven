/**
 * CP-6 B21.3 (migration 0081) — FITNESS, COHERENCE AND CHALLENGE: one fitness vocabulary (none | fit | unfit | indeterminate) on the three
 * foresight objects, set only by a recorded act whose measures the PORT computes; a versioned rule behind every automatic verdict; every
 * state change announced from its write under the register's own name (the 0066/0078 event shape); an unfit or incoherent object refused
 * where it would become decision-active; a dispute that is a person's typed case decided by someone else (SoD), resolved by a governed
 * re-run, an invalidation or a dismissal — on a real database with real Redis, the real outbox publisher and the real subscription
 * dispatcher (EYE_SCHEDULER_ENABLED at module top, the B6 rule), ALL SEVEN consumers (eleven since 0083, B22) registered in the harness's own domain (the B18 idiom),
 * the world of `bootDecisionWorld` (the corridor twin, its four runs, the forecast and the scenario on it) and B21's own humans with
 * sessions of their own (the ports compare the acting principal). The vault roots are this file's own temporary directory (C5 / Nit 8).
 *
 *   T1 · ValidateTwin (L5-I05; AU-TWN-0014/-0015/-0018): the SoD (the twin's owner refused on a second twin of their own), the PDP and the
 *   intake refusals, the validation of the fixture's version 1 (the envelope the port computes over the model's ranges — corridor_delay_days
 *   from shock.corridor_delay_days, consumption.weekly from the observed element, horizon_days a run parameter — the empty calibration
 *   history, the four fixture runs named, ValidateTwin@v1, NO GraphChanged), a version outside the envelope (75 corridor days: fit refused,
 *   indeterminate admitted), the calibration's `since` semantics, ENFORCEMENT (unfit → no run: run rejected (unfit_twin)), the ENVELOPE at
 *   open_run (run rejected (envelope) 422; the acknowledgement of a simulation operator refused 403 (envelope_ack); a twin owner's admitted
 *   with the run's contract recorded outside and acknowledged; SimulationStarted carrying twin_fitness and the envelope), the run rows'
 *   honest defaults.
 *   T2 · ForecastFitnessChanged (L6-I03; AU-PRD-0012/-0014): eleven forecasts of a second family issued and scored in turn — the first
 *   outcome indeterminate (1 of 10), the tenth judged against the ledger the harness reads back (C17), the eleventh UNFIT by calibration
 *   failure (the disruption window's targets uncovered) with GraphChanged/forecast.fitness_changed and its six deliveries (the scenario
 *   marked and RE-CHECKED — ScenarioCoherenceFailed from the consumer; the package NOTED material_change; the citing twin version
 *   unverified), a live forecast assessed by its owner (idempotent; the analyst refused; the get and the calibration summary), declare
 *   refused on an unfit forecast, the withdrawal and the assessment of a withdrawn one, the outcome write's SKIP of a withdrawn and of a
 *   superseded forecast (C19), the fixture family's honest indeterminate, DATA SHIFT through a real GraphChanged (the forecast consumer
 *   assesses beside its mark), the expiry arithmetic.
 *   T3 · ScenarioCoherenceFailed (L7-I04; AU-PRD-0026/-0029/-0030): a duplicate-branch scenario ADMITTED failed with the findings and the
 *   routed_to, the run gate (run rejected (incoherent_scenario)), the promotion prohibited, the continue re-check, the correction path
 *   (retire + a successor that passes), temporal_order, assumption_invalid (an unknown basis; a planted claim withdrawn at version 2), the
 *   free-text note, the WARNING GATE (a warning raised on a failed scenario's branch marked input_unverified, never suppressed),
 *   dependency_retired (the subject entity retired WITH its event), the operator route's refusals.
 *   T4 · ChallengeSimulation (L8-I04; AU-TWN-0031; OBJ-29): open (one live per opener; the analyst refused), the SoD at decide (the
 *   opener; the operator), the RE-RUN (requested, opened as a governed run naming correctsRunId and challengeId, bound once; the nested
 *   path's binding — C6; compared on the common control), DISMISSED (nothing invalidated), WITHDRAWN (the opener's act), UPHELD (the run
 *   invalidated in the same write with trigger challenge: three outbox rows, the six deliveries, the withdrawn SIM version, the package
 *   noted), upheld on an already-invalidated run (withheld), the PROMOTION (fit for a stated use; once; the operator refused; a disputed
 *   result refused), the get/list answers.
 *   T5 · the register 40/10/0 with the four rows bound in 0081 (44/6/0 since 0083, B22: L1-I03, L1-I04, L2-I02 and L10-I05 bound, L9-I05's
 *   package-cause clause delivered); the seven consumer digests against 13ed40c (C4: forecasts, scenarios and decisions changed; the four
 *   others unchanged) and unchanged by B22 (the three at a2303ff's), the four B22 kinds' identities their own; the two rule constants at version 1.
 *
 * EACH CASE LOGS THE SIX THINGS V04-T-024/026 DEMAND as one `B21.3 EVIDENCE` line (C7). Stated (design-p3-harness.md §6): no forecast
 * scheduler or re-issue; the rules are versioned constants over the ledgers this product holds; the series-length breach is not detected;
 * the twin's calibration history is the reconciliation ledger; coherence is structural; no branch suspension; the challenge re-run is a
 * governed run; no frequency-to-probability mapping; no decision gate on unpromoted runs; the positive envelope_breach class is the
 * demonstration's (an expired daily cadence) — the harness pins the arithmetic.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { CONSUMER_EVENT_TYPES, CONSUMER_KINDS, consumerCodeDigest, type ConsumerKind } from '../../src/graph/subscriptions/graph-change.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import { cite, completeElements } from './phase5-fixtures.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b21-3-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
type OutboxRow = { id: string; status: string; event_type: string; schema_version: string | null; payload: Row; correlation_id: string; created_at: Date; partition_key: string; partition_seq: number };
type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; attempts: number; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; details?: Row }>; items_unresolved: Row[]; last_error: string | null };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/**
 * The six consumer kinds a GraphChanged reaches (the seventh selects MemoryCorrected/claim.corrected alone). 0083 (B22): the four kinds B22
 * adds (observations, source-health, proposals, attention) select their own flat events — never GraphChanged — so they are registered too
 * and absent from every GraphChanged delivery.
 */
const GRAPH_KINDS = CONSUMER_KINDS.filter((k) => k !== 'relationships' && CONSUMER_EVENT_TYPES[k].includes('GraphChanged'));
/** 0083 (B22): the four consumer kinds B22 adds, each with an identity of its own from the start. */
const B22_KINDS = ['observations', 'source-health', 'proposals', 'attention'] as const satisfies readonly ConsumerKind[];
type PriorKind = Exclude<ConsumerKind, (typeof B22_KINDS)[number]>;
/**
 * THE SEVEN CONSUMER DIGESTS OF 13ed40c (C4), computed ONCE on the untouched tree before any B21 edit landed
 * (`node --import tsx -e "import('./src/graph/subscriptions/graph-change.ts')…"` in apps/api at 13ed40c; recorded in evidence/cp6/b21-3-harness.txt).
 * T5 pins the four unchanged kinds equal and the three changed kinds (forecasts, scenarios, decisions — their METHOD_REF literals re-worded in 0081) different.
 */
const DIGESTS_13ED40C: Readonly<Record<PriorKind, string>> = Object.freeze({
  twins: '13996dd05ee7715210160f2d57d396ae45ce80b97878a92fcd5d5ebfb4fd8f7f',
  forecasts: 'cbcde85317c85a836103d2d59c7c496f520b59515d0c43c67c74d4a6eecadeb5',
  scenarios: 'd2be51c5792f35b90a27c11235eeeca3a14c97404d17cbe89f4cce7d8336ee90',
  decisions: '49416a3289babb4640dd5eec2dddf29dfc8e1ca9ee65aa5dd815910cdde340e2',
  retrieval: 'cff991a74015de762e30ea084ffe64116bc0baaea197ca780b9f5b96d59482c3',
  'memory-mappings': '2e0ad122d8d03b9cc5cfcc90a71dbb0d1017f7d6eda5c43cba70b077207f67a2',
  relationships: 'fe16ee21985684b1fe4d96f7f228d58e0347939ed7c20f96de45312f53700716',
});
/**
 * 0083 (B22): the three digests B21 moved, as a2303ff left them (graph-change.ts untouched between a2303ff and main 5165a97; computed from
 * `git show a2303ff:apps/api/src/graph/subscriptions/graph-change.ts`) — B22 re-words none of the seven, so no old kind is re-registered for it.
 */
const DIGESTS_A2303FF: Readonly<Record<'forecasts' | 'scenarios' | 'decisions', string>> = Object.freeze({
  forecasts: 'e3932eb0354d8b4943f9c352bc8eccb70ffa595f4797445e6633a9f5f491c2a2',
  scenarios: '06a9711bc0c00f94d0d433c7a3423f0a26b01fc845bdfa86fc32379bf85a3f74',
  decisions: '6e283700b3b7d74c0699e6c565a4da6c0558b015d749e6f8a6d56426b07b6e5f',
});
/**
 * The register rows that stay partial (compared sorted): ten after 0081 (C2's set); 0083 (B22) binds L1-I03, L1-I04, L2-I02 and L10-I05,
 * so six stay partial.
 */
const STILL_PARTIAL = ['L1-I02', 'L3-I02', 'L4-I02', 'L7-I02', 'L10-I02', 'L10-I03'];
const REVIEW_ROLES = ['platform_admin', 'domain_admin', 'strategy_owner', 'forecast_owner'];

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let graph: GraphController; let prediction: PredictionController; let twins: TwinController; let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let peerOwner: AuthenticatedPrincipal; let runOwner: AuthenticatedPrincipal; let operator2: AuthenticatedPrincipal;
let forecastOwner: AuthenticatedPrincipal; let strategyOwner: AuthenticatedPrincipal; let decider: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let graphOwner: AuthenticatedPrincipal;
const subs: Partial<Record<ConsumerKind, { subscriptionId: string; principalId: string }>> = {};
/** The evidence the planted edge rests on (T2.7) and the planted entity E1. */
let B: Evd; const E1 = uuidv7();
// E2 (reconcile): the OBJECT of T2.7's planted edge is a second planted entity, never the fixture's w.entityId — an edge E1→w.entityId
// puts the fixture forecast (subject w.entityId) in the retraction's reach, the forecast consumer marks and assesses it unfit (data_shift),
// and T3's declare on w.forecastId is then refused by 0081 D8. The data-shift path is unchanged: ASU2 rests on X1, FS cites ASU2.
const E2 = uuidv7();
/** What the cases leave one another (each named where it is made). */
let v2 = 0; let R3 = ''; let FL = ''; let S2 = ''; let sourceKey = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
const instantOf = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A marker on the DATABASE clock (the B20 harness :156). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 800)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}; recent: ${JSON.stringify(dispatcher.recentDeliveries().slice(0, 4))}`);
    await sleep(300);
  }
}
const settle = async (ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const q = await scheduler.subscriptionQueueCountsForTests(T(), D());
    if (q.active === 0 && q.waiting === 0 && q.delayed === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(q)}`);
    await sleep(300);
  }
};
/** A refusal as the caller sees it: the HttpException's status and the dashed catalogue code (the B20 harness :176-181). */
const failure = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  try { await p; return { status: null, code: null, message: '' }; } catch (e) {
    if (e instanceof HttpException) { const r = e.getResponse() as { code?: string; message?: string }; return { status: e.getStatus(), code: r.code ?? null, message: String(r.message ?? '') }; }
    return { status: null, code: (e as { code?: string }).code ?? null, message: (e as Error).message };
  }
};
/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (asObservationRefusal — the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string): Promise<{ status: number | null; code: string | null; message: string }> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};

/* ───────────── the outbox and the deliveries (the B18 idioms, :139-214) ───────────── */
const outboxRows = async (eventType: string, after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, event_type, schema_version, payload, correlation_id::text, created_at, partition_key, partition_seq::int from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload));
/** The latest published row of an event type since the mark that satisfies the predicate (the B9 idiom). */
const outboxEvent = (eventType: string, after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow> =>
  waitFor(`the ${eventType} row published`, () => outboxRows(eventType, after, where), (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);
/** How many rows of an event type since the mark satisfy the predicate, whatever their status. */
const outboxCount = async (eventType: string, after: Date, where: (p: Row) => boolean = () => true): Promise<number> => (await outboxRows(eventType, after, where)).length;
/** The published GraphChanged rows of a kind since the mark (of one cause target when named). */
const publishedIn = (kind: string, after: Date, targetId?: string): Promise<OutboxRow[]> =>
  waitFor(`the GraphChanged/${kind} row${targetId === undefined ? '' : ` of ${targetId}`} published`, () => outboxRows('GraphChanged', after, (p) => obj(p['change'])['kind'] === kind && (targetId === undefined || obj(p['cause'])['target_id'] === targetId)), (rows) => rows.length > 0 && rows.every((r) => r.status === 'published'));
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, items_unresolved, last_error from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(su)).rows;
/** The six deliveries of an event applied, the queue settled, the rows by kind. */
const sixApplied = async (eventId: string): Promise<Record<string, Delivery>> => {
  const ds = await waitFor(`the six deliveries of ${eventId} applied`, () => deliveriesFor(eventId), (rows) => rows.length === 6 && rows.every((d) => d.state === 'applied'), 120_000);
  await settle();
  for (const d of ds) expect(d, d.consumer_kind).toMatchObject({ deliveries: 1, attempts: d.items.length > 0 ? 1 : 0, last_error: null });
  expect(sorted(ds.map((d) => d.consumer_kind))).toEqual(sorted([...GRAPH_KINDS]));
  return Object.fromEntries(ds.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
};
const retrievalChecks = async (eventId: string) => (await sql<{ mismatched: number }>`select mismatched::int from graph.retrieval_checks where outbox_event_id = ${eventId}::uuid`.execute(su)).rows;
/** The SIX things V04-T-024/026 demand, logged per case (C7's prefix). */
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B21.3 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the rows ───────────── */
const twinVersion = async (twinId: string, version: number) => (await sql<{ state: string; fitness_state: string; fitness_validation_id: string | null }>`select state, fitness_state, fitness_validation_id::text from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${version}`.execute(su)).rows[0]!;
const validations = async (twinId: string) => (await sql<{ validation_id: string; version: number; verdict: string; prior_state: string; envelope_state: string; calibration: Row; validated_by: string }>`select validation_id::text, version::int, verdict, prior_state, envelope_state, calibration, validated_by::text from twin.validations where twin_id = ${twinId}::uuid order by validated_at`.execute(su)).rows;
const twinEvents = async (twinId: string, event: string) => (await sql<{ details: Row }>`select details from twin.twin_events where twin_id = ${twinId}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
type RunRow = { state: string; validity: string; invalidation: Row | null; fitness_state: string; promoted_for: string | null; promotion_id: string | null; twin_fitness: string; envelope_state: string; envelope_check: Row | null; envelope_ack: Row | null; challenge_id: string | null; operator_principal_id: string; corrects_run_id: string | null; sensitivity: Row | null };
const runRow = async (id: string): Promise<RunRow> => (await sql<RunRow>`select state, validity, invalidation, fitness_state, promoted_for, promotion_id::text, twin_fitness, envelope_state, envelope_check, envelope_ack, challenge_id::text, operator_principal_id::text, corrects_run_id::text, sensitivity from simulation.runs_current where run_id = ${id}::uuid`.execute(su)).rows[0]!;
const runEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from simulation.run_events where run_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
type ForecastRow = { state: string; attention_state: string; superseded_by: string | null; fitness_state: string; fitness_class: string | null; fitness_assessment_id: string | null; issued_at: Date; refresh_cadence: string | null; series_key: string };
const forecastRow = async (id: string): Promise<ForecastRow> => (await sql<ForecastRow>`select state, attention_state, superseded_by::text, fitness_state, fitness_class, fitness_assessment_id::text, issued_at, refresh_cadence, series_key from prediction.forecasts_current where forecast_id = ${id}::uuid`.execute(su)).rows[0]!;
type Assessment = { assessment_id: string; trigger: string; verdict: string; fitness_class: string | null; classes: string[]; prior_state: string; prior_class: string | null; changed: boolean; measures: Row; rule_version: string };
const assessmentsOf = async (forecastId: string): Promise<Assessment[]> => (await sql<Assessment>`select assessment_id::text, trigger, verdict, fitness_class, classes, prior_state, prior_class, changed, measures, rule_version from prediction.forecast_fitness_assessments where forecast_id = ${forecastId}::uuid order by assessed_at`.execute(su)).rows;
/** The family's last ten outcomes as the ledger holds them (C17): the coverage the harness recomputes and the port must agree with. */
const ledgerCoverage = async (seriesKey: string, method: string): Promise<{ n: number; cov: number }> => {
  const rows = (await sql<{ covered: boolean }>`select covered from prediction.outcome_ledger where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and series_key = ${seriesKey} and horizon_code = '30d' and method = ${method} order by recorded_at desc limit 10`.execute(su)).rows;
  return { n: rows.length, cov: rows.length === 0 ? 0 : rows.filter((r) => r.covered).length / rows.length };
};
type ScenarioRow = { state: string; attention_state: string; attention_reason: string | null; coherence_state: string; coherence_check_id: string | null };
const scenarioRow = async (id: string): Promise<ScenarioRow> => (await sql<ScenarioRow>`select state, attention_state, attention_reason, coherence_state, coherence_check_id::text from prediction.scenarios_current where scenario_id = ${id}::uuid`.execute(su)).rows[0]!;
type Check = { check_id: string; trigger: string; outcome: string; prior_state: string; changed: boolean; findings: Row[]; rule_version: string };
const checksOf = async (scenarioId: string): Promise<Check[]> => (await sql<Check>`select check_id::text, trigger, outcome, prior_state, changed, findings, rule_version from prediction.scenario_coherence_checks where scenario_id = ${scenarioId}::uuid order by checked_at`.execute(su)).rows;
const scenarioEvents = async (id: string, event: string) => (await sql<{ details: Row }>`select details from prediction.scenario_events where scenario_id = ${id}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
type ChallengeRow = { challenge_id: string; run_id: string; kind: string; state: string; opened_by: string; rerun_run_id: string | null; decided_by: string | null; decision_note: string | null; withdrawal_reason: string | null };
const challengeRow = async (id: string): Promise<ChallengeRow> => (await sql<ChallengeRow>`select challenge_id::text, run_id::text, kind, state, opened_by::text, rerun_run_id::text, decided_by::text, decision_note, withdrawal_reason from simulation.challenges where challenge_id = ${id}::uuid`.execute(su)).rows[0]!;
const challengeEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from simulation.challenge_events where challenge_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const promotionRow = async (runId: string) => (await sql<{ promotion_id: string; promoted_for: string; validation: Row; limitations: string[]; promoted_by: string }>`select promotion_id::text, promoted_for, validation, limitations, promoted_by::text from simulation.promotions where run_id = ${runId}::uuid`.execute(su)).rows[0];
const objectRows = async (objectId: string) => (await sql<{ object_version: number; lifecycle_state: string; method_ref: string | null }>`select object_version::int, lifecycle_state, method_ref from objects.canonical_objects where object_id = ${objectId}::uuid order by object_version`.execute(su)).rows;
const packageNotes = async (pkg: string, after: Date) => (await sql<{ details: Row }>`select details from decision.package_events where package_id = ${pkg}::uuid and event = 'input.invalidated' and occurred_at >= ${after} order by occurred_at`.execute(su)).rows;
const twinVerification = async (twinId: string, version: number) => (await sql<{ verification_state: string }>`select verification_state from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${version}`.execute(su)).rows[0]?.verification_state;
const warningOn = async (branchId: string) => (await sql<{ warning_id: string; state: string; attention_state: string; attention_reason: string | null }>`select warning_id::text, state, attention_state, attention_reason from prediction.warnings_current where branch_id = ${branchId}::uuid order by raised_at desc limit 1`.execute(su)).rows[0];
const warningEvents = async (warningId: string, event: string) => (await sql<{ details: Row }>`select details from prediction.warning_events where warning_id = ${warningId}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
const registerCounts = async () => (await sql<{ bound: number; partial: number; unbound: number }>`select count(*) filter (where binding_state = 'bound')::int bound, count(*) filter (where binding_state = 'partial')::int partial, count(*) filter (where binding_state = 'unbound')::int unbound from objects.interface_register`.execute(su)).rows[0]!;
const ruleVersion = async (fn: 'prediction.forecast_fitness_rule' | 'prediction.scenario_coherence_rule'): Promise<string> => (await sql<{ v: string }>`select ${sql.raw(fn)}() ->> 'version' as v`.execute(su)).rows[0]!.v;

/* ───────────── the routes (in process; the B21 routes as implementer 3 declared them) ───────────── */
const register = (kind: ConsumerKind) => graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
  { payload: { consumerKind: kind, ownerPrincipalId: w.owner.principalId, backlog: 'leave', ...(kind === 'relationships' ? { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } : {}) } as never }) as Promise<{ subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean } }>;
const interfaces = () => graph.interfaces(h.req(analyst, 'graph.read', 'SUB', null, 'graph'), T(), D()) as Promise<{ interfaces: Row[] }>;
const statusOf = () => graph.subscriptionStatus(h.req(analyst, 'graph.read', 'SUB', null, 'graph'), T(), D()) as unknown as Promise<{ subscriptions: { subscriptions: Row[]; consumers: Row[] } }>;
const declareStrategy = (objectType: string, payload: Row) => graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', objectType, null, 'graph'), T(), D(), { payload: { objectType, ...payload } }) as unknown as Promise<{ strategy: { objectId: string } }>;
const retractEdge = (edgeId: string, reason: string) => graph.retractEdge(h.req(graphOwner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason } });
// twins
const declareTwin = (as: AuthenticatedPrincipal, title: string) => twins.declare(h.req(as, 'twin.declare', 'TWN', null, 'twin'), T(), D(), { payload: { kind: 'supply-chain', title, statement: 'the magnet chain (a second twin, harness)', boundary: [w.entityId], owner: as.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as unknown as Promise<{ twin: { twinId: string } }>;
const openVersion = (as: AuthenticatedPrincipal, twinId: string, payload: Row = {}) => twins.openVersion(h.req(as, 'twin.version', 'TWN', twinId, 'twin'), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', ...payload } }) as unknown as Promise<{ version: { version: number } }>;
const ground = (as: AuthenticatedPrincipal, twinId: string, version: number, elements: unknown[]) => twins.ground(h.req(as, 'twin.ground', 'TWN', twinId, 'twin'), T(), D(), twinId, String(version), { payload: { elements } });
const admit = (as: AuthenticatedPrincipal, twinId: string, version: number) => twins.admit(h.req(as, 'twin.version.admit', 'TWN', twinId, 'twin'), T(), D(), twinId, String(version), { payload: {} }) as unknown as Promise<{ admitted: { completeness: string } }>;
const validate = (as: AuthenticatedPrincipal, twinId: string, version: number, payload: Row) => twins.validate(h.req(as, 'twin.version.validate', 'TWN', twinId, 'twin'), T(), D(), twinId, String(version), { payload }) as unknown as Promise<{ validation: Row; receipt: Row }>;
const getTwin = (twinId: string) => twins.get(h.req(runOwner, 'twin.read', 'TWN', twinId, 'twin'), T(), D(), twinId) as unknown as Promise<{ twin: Row & { versions: Row[] } }>;
const run = (as: AuthenticatedPrincipal, payload: Row = {}) => twins.run(h.req(as, 'simulation.run', 'SIM', null, 'simulation'), T(), D(),
  { payload: { twinId: w.twinId, twinVersion: w.v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...payload } }) as unknown as Promise<{ run: Row & { runId: string; state: string } }>;
const getRun = (runId: string, as = runOwner) => twins.getRun(h.req(as, 'simulation.read', 'SIM', runId, 'simulation'), T(), D(), runId) as unknown as Promise<{ run: Row }>;
const listRuns = (as = runOwner) => twins.listRuns(h.req(as, 'simulation.read', 'SIM', null, 'simulation'), T(), D(), { payload: { twinId: w.twinId } }) as unknown as Promise<{ runs: Row[] }>;
const compareRuns = (runIds: string[], as = runOwner) => twins.compareRuns(h.req(as, 'simulation.read', 'SIM', null, 'simulation'), T(), D(), { payload: { runIds } }) as unknown as Promise<{ comparison: Row }>;
const openChallenge = (as: AuthenticatedPrincipal, runId: string, payload: Row) => twins.openChallenge(h.req(as, 'simulation.challenge.open', 'SIM', runId, 'simulation'), T(), D(), runId, { payload }) as unknown as Promise<{ challenge: Row }>;
const listChallenges = (runId: string | null, as = runOwner) => twins.listChallenges(h.req(as, 'simulation.read', 'SIM', runId, 'simulation'), T(), D(), { payload: runId === null ? {} : { runId } }) as unknown as Promise<{ challenges: Row[] }>;
const rerunChallenge = (as: AuthenticatedPrincipal, runId: string, challengeId: string, note: string) => twins.requestRerun(h.req(as, 'simulation.challenge.rerun', 'SIM', runId, 'simulation'), T(), D(), runId, challengeId, { payload: { note } }) as unknown as Promise<{ challenge: Row }>;
const withdrawChallenge = (as: AuthenticatedPrincipal, runId: string, challengeId: string, reason: string) => twins.withdrawChallenge(h.req(as, 'simulation.challenge.withdraw', 'SIM', runId, 'simulation'), T(), D(), runId, challengeId, { payload: { reason } }) as unknown as Promise<{ challenge: Row }>;
const decideChallenge = (as: AuthenticatedPrincipal, runId: string, challengeId: string, payload: Row) => twins.decideChallenge(h.req(as, 'simulation.challenge.decide', 'SIM', runId, 'simulation'), T(), D(), runId, challengeId, { payload }) as unknown as Promise<{ challenge: Row; invalidation: Row | null; invalidation_withheld: string | null; receipt: Row }>;
const promote = (as: AuthenticatedPrincipal, runId: string, payload: Row) => twins.promote(h.req(as, 'simulation.result.promote', 'SIM', runId, 'simulation'), T(), D(), runId, { payload }) as unknown as Promise<{ promotion: Row }>;
// prediction
const registerSeries = (seriesKey: string) => prediction.registerSeries(h.req(w.twinOwner, 'prediction.series.register', 'SER', null, 'prediction'), T(), D(),
  { payload: { seriesKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode (B21)' } });
const issueOn = (seriesKey: string, origin: string, over: Row = {}) => prediction.issueForecast(h.req(forecastOwner, 'prediction.forecast.issue', 'FCT', null, 'prediction'), T(), D(),
  { payload: { seriesKey, horizon: '30d', observedThrough: origin, knownAt: new Date().toISOString(), assumptions: [w.assumptionId], label: 'live', refreshCadence: 'daily', ...over } }) as unknown as Promise<{ forecast: { forecastId: string; method: string; validationState: string } }>;
const score = (forecastId: string) => prediction.recordOutcome(h.req(forecastOwner, 'prediction.outcome.record', 'OUT', null, 'prediction'), T(), D(), { payload: { forecastId, knownAt: new Date().toISOString() } }) as unknown as Promise<{ outcome: Row }>;
const assess = (as: AuthenticatedPrincipal, forecastId: string) => prediction.assessForecast(h.req(as, 'prediction.forecast.assess', 'FCT', forecastId, 'prediction'), T(), D(), forecastId, { payload: {} }) as unknown as Promise<{ assessment: Row }>;
const getForecast = (forecastId: string) => prediction.getForecast(h.req(forecastOwner, 'prediction.read', 'FCT', forecastId, 'prediction'), T(), D(), forecastId) as unknown as Promise<{ forecast: Row }>;
const calibration = () => prediction.calibration(h.req(forecastOwner, 'prediction.read', 'FCT', null, 'prediction'), T(), D()) as unknown as Promise<{ calibration: Row }>;
const withdrawForecast = (as: AuthenticatedPrincipal, forecastId: string, payload: Row) => prediction.withdrawForecast(h.req(as, 'prediction.forecast.withdraw', 'FCT', forecastId, 'prediction'), T(), D(), forecastId, { payload }) as unknown as Promise<{ withdrawal: Row }>;
type Declared = { scenario: Row & { scenarioId: string; branches: Array<{ branchId: string; name: string; kind: string }>; coherence: Row } };
const declareScenario = (as: AuthenticatedPrincipal, payload: Row) => prediction.declareScenario(h.req(as, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(), { payload }) as unknown as Promise<Declared>;
const reviewScenario = (as: AuthenticatedPrincipal, scenarioId: string, payload: Row) => prediction.reviewScenario(h.req(as, 'prediction.scenario.review', 'SCN', scenarioId, 'prediction'), T(), D(), scenarioId, { payload }) as unknown as Promise<{ review: Row }>;
const checkCoherence = (as: AuthenticatedPrincipal, scenarioId: string) => prediction.checkCoherence(h.req(as, 'prediction.scenario.check', 'SCN', scenarioId, 'prediction'), T(), D(), scenarioId, { payload: {} }) as unknown as Promise<{ coherence: Row }>;
const getScenario = (scenarioId: string) => prediction.getScenario(h.req(forecastOwner, 'prediction.read', 'SCN', scenarioId, 'prediction'), T(), D(), scenarioId) as unknown as Promise<{ scenario: Row }>;
const defineIndicator = (payload: Row) => prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null, 'prediction'), T(), D(), { payload: { seriesKey: w.seriesKey, description: 'B21: transits below 40 for five days', comparator: '<', threshold: 40, consecutiveDays: 5, owner: w.twinOwner.principalId, ...payload } }) as unknown as Promise<{ indicator: { indicatorId: string } }>;
const evaluateIndicator = (indicatorId: string) => prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', indicatorId, 'prediction'), T(), D(), indicatorId, { payload: { knownAt: new Date().toISOString() } }) as unknown as Promise<{ evaluation: Row; warnings: Array<{ branchId: string }> }>;
/** The fixture's two-branch scenario payload (phase6-fixtures.ts :114-118) on a forecast, by the strategy owner. */
const scenarioPayload = (forecastId: string, title: string, branches: Row[] = []): Row => ({
  title, statement: 'the corridor stays open, or collapses (B21 harness)', forecastId, owner: strategyOwner.principalId, reviewCadence: 'weekly',
  branches: branches.length > 0 ? branches : [
    { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: strategyOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
    { name: 'Corridor collapse', kind: 'downside', statement: 'below 40 for five days', indicatorId: w.indicatorId, owner: strategyOwner.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48 },
  ],
});
const baseline = (): Row => ({ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: strategyOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 });
const downside = (name: string, statement: string, over: Row = {}): Row => ({ name, kind: 'downside', statement, indicatorId: w.indicatorId, owner: strategyOwner.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48, ...over });

/* ───────────── the rows planted WITH their events (the B20 idiom) ───────────── */
async function seedEntity(id: string, type: string, name: string, actor: string): Promise<void> {
  const correlationId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${actor}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${actor}::uuid, ${JSON.stringify({ entity_type: type, canonical_name: name, normalized_name: name.toLowerCase(), split_from: null })}::jsonb, ${correlationId}::uuid)`.execute(su);
}
/** An entity RETIRED by the superuser WITH its entity.retired event (the honest fixture: the row and its log agree — T3.6). */
async function retireEntity(id: string, actor: string): Promise<void> {
  await sql`update graph.entities_current set lifecycle_state = 'retired', updated_at = clock_timestamp() where entity_id = ${id}::uuid`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.retired', ${actor}::uuid, ${JSON.stringify({ reason: 'B21 T3: retired by the harness (dependency_retired)' })}::jsonb, ${uuidv7()}::uuid)`.execute(su);
}
/** An asserted edge with its edge.asserted event and the claim's lineage row (the B20 harness :326-344). */
async function seedEdge(edgeId: string, subject: string, predicate: string, object: string, claimId: string, evidence: Evd, actor: string): Promise<void> {
  const methodId = uuidv7(); const runId = uuidv7(); const correlationId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, method_id, run_id, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${subject}::uuid, ${predicate}, ${object}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimId}::uuid, 1, ${evidence.id}::uuid, ${evidence.bytesDigest}, ${methodId}::uuid, ${runId}::uuid, 'replay', 0.9, ${actor}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${edgeId}::uuid, 'edge.asserted', ${actor}::uuid, jsonb_build_object('predicate', ${predicate}::text, 'subject', ${subject}::uuid, 'object', ${object}::uuid, 'valid_from', '2024-01-01T00:00:00Z'::timestamptz, 'valid_to', null, 'mode', 'replay', 'claim_object_id', ${claimId}::uuid, 'claim_version', 1, 'review_state', 'approved'), ${correlationId}::uuid)`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidence.bytesDigest}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
}
/**
 * A claim as the extraction would have admitted it (the B18 seedClaim idiom :256-283), at version 1 active and — when asked — version 2 WITHDRAWN
 * (T3's assumption_invalid probe). Typed CLM: prediction.check_scenario_coherence looks a basis up under object_type = 'CLM' alone (0081 §6), while
 * the product's claim types are ENT / EVT / CLM / REL / ASM (0023:292) — a REL claim basis reads "not a claim of this domain" (reported, not pinned).
 */
async function seedClaim(evidence: { id: string; version: number }, withdrawnAt2: boolean): Promise<string> {
  const claimId = uuidv7(); const now = new Date().toISOString();
  const bytesDigest = createHash('sha256').update(evidence.id).digest('hex');
  const lineage = { method_key: 'fixture', method_id: uuidv7(), model_id: 'fixture-model', model_weights_digest: createHash('sha256').update('w').digest('hex'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: createHash('sha256').update('d').digest('hex'), mode: 'replay', call_id: null, run_id: uuidv7(),
    evidence_object_id: evidence.id, evidence_digest: bytesDigest, byte_start: 0, byte_end: 4, extraction_identity: createHash('sha256').update(`${claimId}@1`).digest('hex'), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  const payload: Row = { claim_kind: 'claim', subject: 'Bab el-Mandeb Strait', predicate: 'transit_change', object_value: 'fell against the prior day', confidence: 0.8, lineage, review: { state: 'approved', reason: 'fixture', decider: null } };
  const insert = async (version: number, lifecycle: string, withdrawalReason: string | null): Promise<void> => {
    const header: CanonicalHeader = {
      object_id: claimId, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: lifecycle, owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
      source_object_ids: [evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${evidence.id}@${evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: withdrawalReason, audit_correlation_id: uuidv7(), content_ref: null,
    };
    const contentDigest = canonicalHeaderDigest(header, payload);
    await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
      values (${claimId}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, ${lifecycle}, 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, 'CLM@v1', null, null, null, ${withdrawalReason}, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  };
  await insert(1, 'active', null);
  if (withdrawnAt2) await insert(2, 'withdrawn', 'B21 T3: withdrawn by the harness (assumption_invalid)');
  return claimId;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  graph = h.app.get(Gc); prediction = h.app.get(Pc); twins = h.app.get(Tc); scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  // THE HUMANS of this file, each with a session of its own (the ports compare the acting principal; the fixture's twinOwner/operator reuse the manager's session).
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b21-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b21-domain-admin');
  peerOwner = await h.humanWithSession(['twin_owner'], 'b21-peer-owner');
  runOwner = await h.humanWithSession(['twin_owner', 'simulation_operator'], 'b21-run-owner');
  operator2 = await h.humanWithSession(['simulation_operator'], 'b21-operator-2');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b21-forecast-owner');
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b21-strategy-owner');
  decider = await h.humanWithSession(['strategy_owner'], 'b21-decider');
  analyst = await h.humanWithSession(['domain_analyst'], 'b21-analyst');
  graphOwner = await h.principalWith(['strategy_owner', 'resolution_manager', 'knowledge_owner'], 'b21-graph-owner');
  // THE WORLD: the corridor twin, its four runs, the forecast and the scenario (booted BEFORE the subscriptions — nothing in T1 rests on their deliveries); the evidence the planted edge rests on; E1 with its event.
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid limit 1`.execute(su)).rows[0]!.source_key;
  [B] = (await h.upload([{ filename: 'b21-b.csv', text: 'a,b\n1,2\n', documentTime: '2024-01-14T00:00:00Z' }])).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest })) as [Evd];
  await seedEntity(E1, 'organization', 'B21 Holding AG', graphOwner.principalId);
  await seedEntity(E2, 'place', 'B21 Strait Terminal', graphOwner.principalId);
  // THE SUBSCRIPTIONS: all seven kinds (eleven since 0083, B22 — the four new kinds on their own event types by default), registered by the tenant administrator with the backlog left (the B18 idiom).
  for (const kind of CONSUMER_KINDS) {
    const r = await register(kind);
    subs[kind] = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
    expect(r.served.workerRunning, `${kind}: the domain's queue is served from registration`).toBe(true);
  }
  await settle();
}, 300_000);

afterAll(async () => {
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B21.3 · fitness, coherence and challenge (0081; L5-I05, L6-I03, L7-I04, L8-I04; AU-TWN-0014/-0015/-0018/-0031, AU-PRD-0012/-0014/-0026/-0029/-0030)', () => {
  it('T1 · ValidateTwin: the SoD, the PDP and the intake refusals, the envelope the port computes, the empty calibration history, ValidateTwin@v1 without a GraphChanged, fit refused outside the envelope, the calibration\'s since, ENFORCEMENT (an unfit version opens no run), the ENVELOPE at open_run (422 / 403 / acknowledged by a twin owner), the honest defaults', async () => {
    /* T1.1 THE SoD: a second twin owned by peerOwner — its owner may not validate it (the PDP admits a twin owner; the port refuses the owner). */
    const T2 = (await declareTwin(peerOwner, 'B21 peer twin (harness)')).twin.twinId;
    const t2v1 = (await openVersion(peerOwner, T2)).version.version;
    await ground(peerOwner, T2, t2v1, completeElements(w.records));
    expect((await admit(peerOwner, T2, t2v1)).admitted.completeness).toBe('complete');
    await refused(validate(peerOwner, T2, t2v1, { verdict: 'fit', reason: 'validating my own twin (harness)' }), /^twin validation rejected: the twin's owner does not validate their own twin/, 403, 'EYE-AUT-001');
    expect(await validations(T2)).toEqual([]);
    expect((await twinVersion(T2, t2v1)).fitness_state).toBe('none');
    /* T1.2 THE VERSION OUTSIDE THE ENVELOPE (75 corridor days — supply-flow.ts bounds horizon_days only, C21) and a DRAFT. */
    v2 = (await openVersion(w.twinOwner, w.twinId, { carryFrom: w.v1, except: ['shock.corridor_delay_days'] })).version.version;
    await ground(w.twinOwner, w.twinId, v2, [{ key: 'shock.corridor_delay_days', kind: 'assumed', value: 75, unit: 'days', citations: [cite(w.records.terms)] }]);
    expect((await admit(w.twinOwner, w.twinId, v2)).admitted.completeness).toBe('complete');
    const draft = (await openVersion(w.twinOwner, w.twinId, { branchId: 'b21-draft' })).version.version;   // its own branch: an open draft on 'actual' would block the versions T2 admits there
    expect(await failure(validate(analyst, w.twinId, w.v1, { verdict: 'fit', reason: 'the analyst may not validate (harness)' }))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    await refused(validate(dadmin, w.twinId, draft, { verdict: 'fit', reason: 'a draft is not judged (harness)' }), /is a draft, not admitted/, 409);
    expect((await failure(validate(dadmin, w.twinId, w.v1, { verdict: 'good', reason: 'not a verdict (harness)' }))).status).toBe(422);
    expect((await failure(validate(dadmin, w.twinId, w.v1, { verdict: 'fit', reason: 'short' }))).status).toBe(422);
    /* T1.3 THE VALIDATION of version 1: the envelope computed by the port, the empty history, the runs named, ValidateTwin@v1, no GraphChanged. */
    const t0 = await mark();
    const v1fit = (await validate(dadmin, w.twinId, w.v1, { verdict: 'fit', reason: 'the corridor model reconciles within tolerance (harness)', limitations: ['calendar days'] })).validation;
    expect(v1fit).toMatchObject({ twin_id: w.twinId, version: w.v1, verdict: 'fit', prior_state: 'none', limitations: ['calendar days'] });
    expect(obj(v1fit['envelope'])).toMatchObject({ state: 'inside', model: 'supply-flow@1', keys: {
      horizon_days: { verdict: 'unchecked', source: null, value: null },
      corridor_delay_days: { value: 14, source: 'shock.corridor_delay_days', verdict: 'inside', range: [0, 60] },
      'consumption.weekly': { source: 'consumption.weekly:SYN-PART-MAG', verdict: 'inside' } } });
    expect(obj(v1fit['calibration'])).toMatchObject({ count: 0, since: null, note: 'no reconciliation recorded since the previous validation: the calibration history is empty' });
    expect(sorted((v1fit['runs'] as Row[]).map((r) => r['run_id']))).toEqual(sorted([w.controlId, w.rerouteId, w.airId, w.control2Id]));
    const row1 = await twinVersion(w.twinId, w.v1);
    expect(row1).toMatchObject({ fitness_state: 'fit', fitness_validation_id: String(v1fit['validation_id']) });
    expect(await twinEvents(w.twinId, 'version.validated')).toHaveLength(1);
    const vt = await outboxEvent('ValidateTwin', t0, (p) => p['twin_id'] === w.twinId);
    expect(vt.schema_version).toBe('v1');
    expect(vt.payload).toMatchObject({ schema: 'ValidateTwin', schema_version: 'v1', twin_id: w.twinId, version: w.v1, validation_id: v1fit['validation_id'], verdict: 'fit', prior_state: 'none', envelope: { state: 'inside' }, cause: { action: 'twin.version.validate', actor: dadmin.principalId, target_type: 'TWN', target_id: w.twinId } });
    expect((obj(vt.payload['dependency_impacts'])['runs'] as Row[]).length).toBe(4);
    await sleep(1500);
    expect(await outboxCount('GraphChanged', t0), 'a validation changes no fact: no GraphChanged (D2)').toBe(0);
    const got = await getTwin(w.twinId);
    expect(obj(got.twin.versions.find((v) => Number(v['version']) === w.v1)!['fitness'])).toMatchObject({ state: 'fit', validation_id: v1fit['validation_id'], verdict: 'fit', envelope_state: 'inside' });
    /* T1.4 OUTSIDE THE ENVELOPE: fit refused naming the key; indeterminate admitted; the calibration's `since` is the previous validation's instant. */
    await refused(validate(dadmin, w.twinId, v2, { verdict: 'fit', reason: 'the stress case is fit? (harness)' }), /^twin validation rejected: a version outside its operating envelope is not fit \(corridor_delay_days = 75 outside \[0, 60\]\)/, 422);
    const v2ind = (await validate(dadmin, w.twinId, v2, { verdict: 'indeterminate', reason: 'the stress case lies outside the envelope; judged indeterminate (harness)' })).validation;
    expect(obj(v2ind['envelope'])).toMatchObject({ state: 'outside', keys: { corridor_delay_days: { verdict: 'outside', value: 75 } } });
    expect((await twinVersion(w.twinId, v2)).fitness_state).toBe('indeterminate');
    const prior = (await validations(w.twinId)).at(-1)!;
    const v1again = (await validate(dadmin, w.twinId, w.v1, { verdict: 'fit', reason: 'the corridor model still reconciles (harness)' })).validation;
    expect(obj(v1again['calibration'])).toMatchObject({ count: 0 });
    expect(instantOf(obj(v1again['calibration'])['since'])).toBe(instantOf((await sql<{ t: Date }>`select validated_at t from twin.validations where validation_id = ${prior.validation_id}::uuid`.execute(su)).rows[0]!.t));
    expect(v1again['prior_state']).toBe('fit');
    /* T1.5 ENFORCEMENT: an unfit version opens no run (the port's text through the mapper: 409 EYE-STA-002); re-validated fit, the run opens — R3, the inside run. */
    await validate(dadmin, w.twinId, w.v1, { verdict: 'unfit', reason: 'harness: disable the version' });
    await refused(run(runOwner), /^run rejected \(unfit_twin\): twin version 1 of twin .* is unfit \(validation /, 409, 'EYE-STA-002');
    await validate(dadmin, w.twinId, w.v1, { verdict: 'fit', reason: 'harness: the version re-enabled' });
    const r3 = (await run(runOwner)).run;
    expect(r3.state).toBe('completed'); R3 = r3.runId;
    expect(r3).toMatchObject({ twinFitness: 'fit', envelopeAck: null });
    expect(obj(r3['envelope'])['state']).toBe('inside');
    expect(await runRow(R3)).toMatchObject({ envelope_state: 'inside', envelope_ack: null, twin_fitness: 'fit', fitness_state: 'none' });
    /* T1.6 THE ENVELOPE AT OPEN: 422 without an acknowledgement; 403 for a simulation operator's acknowledgement; a twin owner's admitted and recorded. */
    await refused(run(runOwner, { twinVersion: v2 }), /^run rejected \(envelope\): outside the operating envelope of supply-flow@1 \(corridor_delay_days = 75 outside \[0, 60\]\); a run outside the envelope needs/, 422, 'EYE-REQ-001');
    await refused(run(operator2, { twinVersion: v2, envelope: { acknowledge: true, reason: 'the 75-day delay is the stress case (harness)' } }), /^run rejected \(envelope_ack\): the acknowledgement of an envelope breach is a twin owner's or the domain administrator's/, 403, 'EYE-AUT-001');
    expect((await failure(run(runOwner, { twinVersion: v2, envelope: { acknowledge: 'yes', reason: 'malformed (harness)' } }))).status, 'the intake: a malformed acknowledgement').toBe(422);
    const t6 = await mark();
    const outside = (await run(runOwner, { twinVersion: v2, envelope: { acknowledge: true, reason: 'the 75-day delay is the stress case (harness)' } })).run;
    expect(outside.state).toBe('completed');
    expect(outside).toMatchObject({ twinFitness: 'indeterminate' });
    expect(obj(outside['envelope'])).toMatchObject({ state: 'outside', keys: { corridor_delay_days: { verdict: 'outside', value: 75 } } });
    expect(obj(outside['envelopeAck'])).toMatchObject({ acknowledged_by: runOwner.principalId, reason: 'the 75-day delay is the stress case (harness)' });
    const outsideRow = await runRow(outside.runId);
    expect(outsideRow).toMatchObject({ envelope_state: 'outside', twin_fitness: 'indeterminate', fitness_state: 'none' });
    expect(obj(outsideRow.envelope_ack)).toMatchObject({ acknowledged_by: runOwner.principalId, reason: 'the 75-day delay is the stress case (harness)' });
    expect(obj(outsideRow.sensitivity)['outside_envelope'], 'the perturbation flag: a different fact, pinned beside envelope_state').toBe(true);
    expect((await runEvents(outside.runId)).find((e) => e.event === 'run.opened')!.details).toMatchObject({ envelope_state: 'outside', twin_fitness: 'indeterminate', envelope_ack: { acknowledged_by: runOwner.principalId } });
    const started = await outboxEvent('SimulationStarted', t6, (p) => p['run_id'] === outside.runId);
    expect(started.payload).toMatchObject({ twin_fitness: 'indeterminate', envelope: { state: 'outside' }, envelope_ack: { acknowledged_by: runOwner.principalId } });
    /* T1.7 THE GET: the B21 columns; the fixture's pre-B21 runs read the honest defaults. */
    expect((await getRun(R3)).run).toMatchObject({ fitness_state: 'none', envelope_state: 'inside', twin_fitness: 'fit', challenge_id: null });
    // the fixture's runs were opened AFTER 0081 on this fresh database (their contract computed at open): twin_fitness 'none' (no validation stood at open); the 'unrecorded' default is the demonstration's pre-0081 rows' (the act prints it; T5 pins the column default)
    expect((await getRun(w.controlId)).run).toMatchObject({ envelope_state: 'inside', twin_fitness: 'none', fitness_state: 'none' });
    await settle();
    sixEvidence('T1', { fault_trace: { second_twin: T2, outside_version: v2, draft, validations: (await validations(w.twinId)).map((v) => [v.version, v.verdict, v.envelope_state]) }, watermark: { v1: 'fit', v2: 'indeterminate (outside)', draft: 'none' }, consumer_behaviour: 'no consumer: a validation changes no fact (no GraphChanged); ValidateTwin@v1 published', operator_action: 'dadmin validates (SoD: the owner refused; the analyst by the PDP)', recovery: 'unfit → no run; re-validated fit → the run opens; the outside run admitted under a twin owner\'s acknowledgement', reconciliation: { validations: (await validations(w.twinId)).length, R3, outside: outside.runId } });
  }, 300_000);

  it('T1.8 · the governed retrievals PRECEDE the opening write (the rehearsal wedge of 2026-09-24): with expired capability nonces crossing ctx.build\'s sweep line every millisecond, a run whose inputs cite evidence completes, no capability context waits on an idle transaction, and the request\'s trail reads simulation.read → the retrievals → simulation.run → simulation.run.complete, each its own transaction', async () => {
    /*
     * THE STREAM. Every capability context (ctx.build, under issue_commit / issue_identity_op / issue_publish / issue_schedule_capability)
     * first DELETES the nonces expired for more than an hour. Nonces crossing that line one per millisecond for the next 40 s make every
     * context issued meanwhile delete some of them, and a context issued on ANOTHER connection while such a transaction is still open
     * waits on it. A governed retrieval nested INSIDE the opening write was exactly that: the run's handler awaited the retrieval, the
     * retrieval's context awaited the run's transaction — a deadlock PostgreSQL cannot see, and every login of the process queued behind
     * it (the rehearsal copy inherits the demonstration's publisher nonces, one per second, so it crossed the line by itself). The
     * retrievals now precede the write, each its own transaction, in sequence (EvidenceAvailability).
     */
    // The stream is PLANTED for this request alone (8 s of crossings; the request takes well under a second) and removed in the
    // finally — a write that still nests a governed read or retrieval (twin.ground, the forecasting writes: see the report) would
    // wedge on it exactly as the rehearsal did, and the cases that follow must not inherit that.
    const planted = (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
    await sql`insert into ctx.issued (nonce, session_id, issued_at, expires_at, op_class, bound_action)
              select gen_random_uuid(), '00000000-0000-0000-0000-000000000000'::uuid, ${planted}::timestamptz, ${planted}::timestamptz - interval '1 hour' + (i * interval '1 millisecond'), 'outbox', 'objects.outbox.publish'
                from generate_series(1, 8000) i`.execute(su);
    // THE WATCHDOG: the wedge's signature — a capability minter (ctx.issue_commit) waiting on a transaction id whose holder is IDLE in
    // transaction. On sight the holder is terminated (the pool and the suite survive) and the case fails naming both sessions.
    let wedge: Row | null = null; let stop = false;
    const watchdog = (async () => {
      while (!stop) {
        const rows = (await sql<Row>`select w.pid as waiter_pid, left(w.query, 60) as waiter, r.pid as holder_pid, r.state as holder_state, left(r.query, 100) as holder_query
                                        from pg_stat_activity w join pg_stat_activity r on r.pid = any(pg_blocking_pids(w.pid))
                                       where w.datname = current_database() and w.wait_event_type = 'Lock' and w.wait_event = 'transactionid'
                                         and w.query like '%ctx.issue_commit%' and r.state = 'idle in transaction'`.execute(su)).rows;
        if (rows.length > 0) { wedge = rows[0]!; await sql`select pg_terminate_backend(${Number(rows[0]!['holder_pid'])}::int)`.execute(su); return; }
        await sleep(150);
      }
    })();
    const t0 = await mark();
    let answer: { run: Row & { runId: string; state: string } } | null = null; let failure: unknown = null;
    try { answer = await run(runOwner); } catch (e) { failure = e; }
    finally {
      stop = true; await watchdog;
      await sql`delete from ctx.issued where session_id = '00000000-0000-0000-0000-000000000000'::uuid and op_class = 'outbox' and issued_at = ${planted}::timestamptz`.execute(su);
    }
    expect(wedge, `a capability context waited on an idle transaction while the run was open: ${JSON.stringify(wedge)}`).toBeNull();
    expect(failure, `the run did not complete: ${String((failure as { message?: string } | null)?.message ?? failure)}`).toBeNull();
    expect(answer!.run.state).toBe('completed');
    // THE TRAIL of the one request: the read that listed the citations, one retrieval per distinct evidence citation, the opening write, the
    // completion — in that order, each row committed by its own transaction (xmin) — nothing of the request ran inside another write.
    const trail = (await sql<{ action: string; xid: string }>`
      select action, xmin::text as xid from audit.audit_events
       where domain_id = ${D()}::uuid and created_at >= ${t0}
         and correlation_id = (select correlation_id from audit.audit_events where domain_id = ${D()}::uuid and action = 'simulation.run.complete' and created_at >= ${t0} order by audit_seq desc limit 1)
       order by audit_seq`.execute(su)).rows;
    const actions = trail.map((r) => r.action);
    expect(actions[0], `the trail: ${actions.join(' → ')}`).toBe('simulation.read');
    expect(actions.slice(-2), `the trail: ${actions.join(' → ')}`).toEqual(['simulation.run', 'simulation.run.complete']);
    const retrievals = actions.slice(1, -2);
    expect(retrievals.length, `the retrievals: ${actions.join(' → ')}`).toBeGreaterThan(0);
    expect(new Set(retrievals)).toEqual(new Set(['observation.evidence.retrieve']));
    expect(new Set(trail.map((r) => r.xid)).size, 'each row of the trail committed by its own transaction').toBe(trail.length);
    await settle();
    sixEvidence('T1.8', { fault_trace: { planted_nonces: 8000, wedge }, watermark: { trail: actions }, consumer_behaviour: 'SimulationStarted and SimulationCompleted delivered as ever (settled)',
                          operator_action: 'none — the run completed', recovery: 'the retrievals precede the opening write, each its own transaction; a wedged holder would be terminated by the watchdog (none seen)', reconciliation: { transactions: trail.length, retrievals: retrievals.length } });
  }, 180_000);

  it('T2 · ForecastFitnessChanged: eleven forecasts of a second family issued and scored in turn — indeterminate at one outcome, the tenth judged against the ledger (C17), the eleventh UNFIT (calibration_failure) with GraphChanged/forecast.fitness_changed and its six deliveries (the scenario marked and re-checked, the package noted, the citing twin version unverified); the owner\'s assessment (idempotent; the analyst refused; the get and the calibration); declare refused on an unfit forecast; the withdrawal; the outcome write\'s skips (C19); the fixture family indeterminate; DATA SHIFT through a real GraphChanged; the expiry arithmetic', async () => {
    S2 = `${w.seriesKey}-fitness`;
    await registerSeries(S2);
    const origins = ['2023-08-01', '2023-08-15', '2023-08-29', '2023-09-12', '2023-09-26', '2023-10-05', '2023-10-10', '2023-10-15', '2023-10-21', '2023-10-23', '2023-10-25'];
    const F: string[] = [];
    /* T2.1 F1's outcome: one of ten → indeterminate; ForecastFitnessChanged; no GraphChanged (indeterminate marks nothing — D7). */
    const first = (await issueOn(S2, origins[0]!)).forecast;
    const method = first.method;
    F.push(first.forecastId);
    let t = await mark();
    const o1 = (await score(first.forecastId)).outcome;
    expect(obj(o1['fitness'])).toMatchObject({ verdict: 'indeterminate', forecast_id: first.forecastId, changed: true, prior_state: 'none' });
    expect(o1['family_assessed']).toBe(0);
    const a1 = (await assessmentsOf(first.forecastId))[0]!;
    expect(a1).toMatchObject({ trigger: 'outcome', verdict: 'indeterminate', fitness_class: null, changed: true, prior_state: 'none', rule_version: '1' });
    expect(obj(a1.measures['window'])).toMatchObject({ outcomes: 1, required: 10 });
    expect(String(a1.measures['note'])).toMatch(/1 of 10 outcomes/);
    expect((await forecastRow(first.forecastId)).fitness_state).toBe('indeterminate');
    const ffc1 = await outboxEvent('ForecastFitnessChanged', t, (p) => p['forecast_id'] === first.forecastId);
    expect(ffc1.schema_version).toBe('v1');
    expect(ffc1.payload).toMatchObject({ schema: 'ForecastFitnessChanged', schema_version: 'v1', forecast_id: first.forecastId, from: { state: 'none' }, to: { state: 'indeterminate' }, trigger: 'outcome', rule_version: '1', cause: { action: 'prediction.outcome.record', target_type: 'FCT' } });
    await sleep(1500);
    expect(await outboxCount('GraphChanged', t, (p) => obj(p['change'])['kind'] === 'forecast.fitness_changed')).toBe(0);
    /* F2..F9 issued and scored in turn (each resolved before the next issue). */
    for (const origin of origins.slice(1, 9)) { const f = (await issueOn(S2, origin)).forecast.forecastId; F.push(f); await score(f); }
    /* T2.2 F10: n = 10 — the verdict pinned against the ledger the harness reads back (C17); no backtest → the second note arm (C21). */
    const f10 = (await issueOn(S2, origins[9]!)).forecast.forecastId; F.push(f10);
    t = await mark();
    const o10 = (await score(f10)).outcome;
    const cov10 = await ledgerCoverage(S2, method);
    expect(cov10.n).toBe(10);
    const a10 = obj(o10['fitness']);
    expect(obj(obj(a10['measures'])['window'])).toMatchObject({ outcomes: 10, required: 10 });
    expect(obj(obj(a10['measures'])['coverage'])['checked']).toBe(true);
    expect(Number(obj(obj(a10['measures'])['coverage'])['observed'])).toBeCloseTo(cov10.cov, 6);
    expect(a10['verdict']).toBe(cov10.cov < 0.75 ? 'unfit' : 'fit');
    expect(a10['class']).toBe(cov10.cov < 0.75 ? 'calibration_failure' : null);
    expect(a10).toMatchObject({ changed: true, prior_state: 'none' });
    expect(obj(obj(a10['measures'])['pinball'])).toMatchObject({ checked: false, backtest: null });
    expect(String(obj(a10['measures'])['note'])).toMatch(/^no applicable backtest: the drift rule is not applied$/);
    if (a10['verdict'] === 'unfit') { const g10 = await publishedIn('forecast.fitness_changed', t, f10); expect(g10).toHaveLength(1); const d10 = await sixApplied(g10[0]!.id); for (const k of ['twins', 'forecasts', 'scenarios', 'decisions', 'memory-mappings']) expect(d10[k]!.items, k).toEqual([]); }
    else { await sleep(1500); expect(await outboxCount('GraphChanged', t, (p) => obj(p['change'])['kind'] === 'forecast.fitness_changed')).toBe(0); }
    console.log(`B21.3 T2.2: F10 judged ${String(a10['verdict'])} at coverage ${cov10.cov} (the ledger's own last ten; the branch taken is the rule's)`);
    /* T2.3 F11 (targets inside the disruption window: coverage ≤ 0.7 — deterministic): the world resting on it first — a twin version citing it, a draft package citing it, a scenario on it. */
    const f11 = (await issueOn(S2, origins[10]!)).forecast.forecastId; F.push(f11);
    const v2b = (await openVersion(w.twinOwner, w.twinId, { carryFrom: w.v1 })).version.version;
    await ground(w.twinOwner, w.twinId, v2b, [{ key: 'context.transits_forecast', kind: 'predicted', value: { horizon: '30d' }, citations: [{ kind: 'forecast', id: f11 }] }]);
    expect((await admit(w.twinOwner, w.twinId, v2b)).admitted.completeness).toBe('complete');
    const P1 = await c.fullDraft();
    await c.option(P1.pkg, P1.v, { key: 'on-f11', title: 'Cites the eleventh forecast', kind: 'intervention', consequences: [{ kind: 'run', id: w.controlId }, { kind: 'forecast', id: f11, version: 1 }] });
    const SF2 = (await declareScenario(strategyOwner, scenarioPayload(f11, 'B21 scenario on the eleventh forecast (harness)'))).scenario;
    expect(obj(SF2.coherence)['outcome']).toBe('passed');
    await settle();
    t = await mark();
    const o11 = (await score(f11)).outcome;
    const cov11 = await ledgerCoverage(S2, method);
    const a11 = obj(o11['fitness']);
    expect(a11).toMatchObject({ verdict: 'unfit', class: 'calibration_failure', classes: ['calibration_failure'], changed: true, prior_state: 'none' });
    expect(Number(obj(obj(a11['measures'])['coverage'])['observed'])).toBeLessThanOrEqual(0.7 + 1e-9);
    expect(Number(obj(obj(a11['measures'])['coverage'])['observed'])).toBeCloseTo(cov11.cov, 6);
    expect(await forecastRow(f11)).toMatchObject({ fitness_state: 'unfit', fitness_class: 'calibration_failure', state: 'resolved' });
    const ffc11 = await outboxEvent('ForecastFitnessChanged', t, (p) => p['forecast_id'] === f11);
    expect(ffc11.payload).toMatchObject({ from: { state: 'none', class: null }, to: { state: 'unfit', class: 'calibration_failure' }, trigger: 'outcome' });
    const g11 = await publishedIn('forecast.fitness_changed', t, f11);
    expect(g11).toHaveLength(1);
    expect(g11[0]!.payload).toMatchObject({ objects: { forecasts: [f11] }, forecast_fitness: { forecast_id: f11, state: 'unfit', class: 'calibration_failure', prior_state: 'none', trigger: 'outcome', measures: { outcomes: 10, required: 10 } }, cause: { action: 'prediction.outcome.record', target_id: f11 } });
    const ds = await sixApplied(g11[0]!.id);
    expect(ds['forecasts']!.items, 'the forecast consumer answers nothing for its own kind (D7)').toEqual([]);
    expect(ds['scenarios']!.items).toEqual([SF2.scenarioId]);
    expect(ds['scenarios']!.items_applied[0]).toMatchObject({ effect: 'scenario.attention', details: { coherence: { state: 'failed', changed: true } } });
    const sf2 = await scenarioRow(SF2.scenarioId);
    expect(sf2).toMatchObject({ attention_state: 'input_unverified', coherence_state: 'failed' });
    expect(String(sf2.attention_reason)).toMatch(/forecast .* assessed unfit \(calibration_failure\)/);
    const sf2checks = await checksOf(SF2.scenarioId);
    expect(sf2checks.at(-1)).toMatchObject({ trigger: 'subscription', outcome: 'failed', changed: true, prior_state: 'passed' });
    expect(sf2checks.at(-1)!.findings.find((f) => f['rule'] === 'forecast_relationship')).toMatchObject({ severity: 'fail', detail: expect.stringMatching(/assessed unfit \(calibration_failure\)/) });
    const scf = await outboxEvent('ScenarioCoherenceFailed', t, (p) => p['scenario_id'] === SF2.scenarioId);
    expect(scf.schema_version).toBe('v1');
    expect(scf.payload).toMatchObject({ schema: 'ScenarioCoherenceFailed', schema_version: 'v1', scenario_id: SF2.scenarioId, outcome: 'failed', trigger: 'subscription', routed_to: REVIEW_ROLES, rule_version: '1', cause: { action: 'prediction.scenario.subscription.apply', target_type: 'SCN', target_id: SF2.scenarioId } });
    expect(ds['decisions']!.items).toEqual([P1.pkg]);
    expect(ds['decisions']!.items_applied[0]!.effect).toBe('input.invalidated');
    const note = (await packageNotes(P1.pkg, t))[0]!;
    expect(note.details).toMatchObject({ failure_class: 'material_change', disposition: 'human_review', lifecycle: { kind: 'forecast.fitness_changed', ref: f11, class: 'calibration_failure' } });
    expect(JSON.stringify(note.details)).toMatch(/was ASSESSED UNFIT \(calibration_failure\)/);
    expect(ds['twins']!.items.some((i) => String(i).startsWith(w.twinId)), 'the version citing the forecast is marked').toBe(true);
    expect(ds['twins']!.items_applied[0]!.effect).toBe('version.unverified');
    expect(await twinVerification(w.twinId, v2b)).toBe('unverified');
    expect(ds['retrieval']!.items).toEqual(['projections']); expect(ds['retrieval']!.items_applied[0]!.effect).toBe('projections.verified');
    expect((await retrievalChecks(g11[0]!.id)).map((x) => x.mismatched)).toEqual([0]);
    expect(ds['memory-mappings']!.items).toEqual([]);
    /* T2.4 THE LIVE FORECAST assessed by its owner: unfit (the window is the family's), idempotent, the analyst refused, the get and the calibration. */
    FL = (await issueOn(S2, '2023-11-24')).forecast.forecastId;
    expect((await forecastRow(FL)).state).toBe('issued');
    const t2 = await mark();
    const aFL = (await assess(forecastOwner, FL)).assessment;
    expect(aFL).toMatchObject({ verdict: 'unfit', class: 'calibration_failure', changed: true, prior_state: 'none' });
    expect((await assessmentsOf(FL))[0]).toMatchObject({ trigger: 'operator' });
    const ffcFL = await outboxEvent('ForecastFitnessChanged', t2, (p) => p['forecast_id'] === FL);
    expect(ffcFL.payload).toMatchObject({ trigger: 'operator', to: { state: 'unfit', class: 'calibration_failure' }, cause: { action: 'prediction.forecast.assess', actor: forecastOwner.principalId } });
    const gFL = await publishedIn('forecast.fitness_changed', t2, FL);
    expect(gFL).toHaveLength(1);
    const dsFL = await sixApplied(gFL[0]!.id);
    for (const k of ['twins', 'forecasts', 'scenarios', 'decisions', 'memory-mappings']) expect(dsFL[k]!.items, `${k}: nothing rests on the live forecast`).toEqual([]);
    const again = (await assess(forecastOwner, FL)).assessment;
    expect(again).toMatchObject({ verdict: 'unfit', changed: false });
    await sleep(1500);
    expect(await outboxCount('ForecastFitnessChanged', t2, (p) => p['forecast_id'] === FL)).toBe(1);
    expect(await outboxCount('GraphChanged', t2, (p) => obj(p['change'])['kind'] === 'forecast.fitness_changed' && obj(p['cause'])['target_id'] === FL)).toBe(1);
    expect(await failure(assess(analyst, FL))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    const gotFL = (await getForecast(FL)).forecast;
    expect(obj(gotFL['fitness'])).toMatchObject({ state: 'unfit', class: 'calibration_failure', rule_version: '1' });
    expect(obj(obj(obj(gotFL['fitness'])['measures'])['window'])['outcomes']).toBe(10);
    const cal = (await calibration()).calibration;
    expect(String(cal['statement'])).toMatch(/Fitness \(below\)/);
    const fam = (cal['fitness'] as Row[]).find((x) => x['series_key'] === S2)!;
    expect(fam).toMatchObject({ forecast_id: FL, state: 'unfit', outcomes: 10, rule_version: '1' });
    /* T2.5 THE GATES AND THE SKIPS (C19): declare refused on an unfit forecast; the withdrawal; a withdrawn forecast neither assessed nor judged by the outcome write; a superseded one skipped and its successor assessed. */
    await refused(declareScenario(strategyOwner, scenarioPayload(FL, 'B21 scenario on an unfit forecast (harness)')), /^scenario rejected: forecast .* was assessed unfit \(calibration_failure\)/, 409, 'EYE-STA-002');
    await withdrawForecast(forecastOwner, FL, { reason: 'the family failed its calibration; withdrawn as unfit (harness)', unfitClass: 'calibration_failure' });
    await refused(assess(forecastOwner, FL), /^forecast assessment rejected: forecast .* is withdrawn \(calibration_failure\)/, 409, 'EYE-STA-002');
    const before = (await assessmentsOf(FL)).length;
    const oW = (await score(FL)).outcome;
    expect(oW).toMatchObject({ fitness: null, fitness_skipped: 'withdrawn', family_assessed: 0 });
    expect((await forecastRow(FL)).state).toBe('withdrawn');
    expect((await assessmentsOf(FL)).length).toBe(before);
    const f13 = (await issueOn(S2, '2023-11-25')).forecast.forecastId;
    const f14 = (await issueOn(S2, '2023-11-26')).forecast.forecastId;
    expect(await forecastRow(f13)).toMatchObject({ state: 'superseded', superseded_by: f14 });
    const t5 = await mark();
    const oS = (await score(f13)).outcome;
    expect(oS).toMatchObject({ fitness: null, fitness_skipped: 'superseded', family_assessed: 1 });
    expect((await assessmentsOf(f13))).toEqual([]);
    expect((await assessmentsOf(f14))[0]).toMatchObject({ trigger: 'outcome', prior_state: 'none', changed: true, verdict: 'unfit', fitness_class: 'calibration_failure' });
    const ffc14 = await outboxEvent('ForecastFitnessChanged', t5, (p) => p['forecast_id'] === f14);
    expect(ffc14.payload).toMatchObject({ trigger: 'outcome', cause: { action: 'prediction.outcome.record' } });
    const g14 = await publishedIn('forecast.fitness_changed', t5, f14);
    expect(g14).toHaveLength(1);
    const ds14 = await sixApplied(g14[0]!.id);
    for (const k of ['twins', 'forecasts', 'scenarios', 'decisions', 'memory-mappings']) expect(ds14[k]!.items, k).toEqual([]);
    await refused(assess(forecastOwner, f13), /^forecast assessment rejected: forecast .* is superseded by .*; assess the successor/, 409, 'EYE-STA-002');
    /* T2.6 THE FIXTURE'S FAMILY (zero outcomes; the demonstration's situation): honest indeterminate, the event, no GraphChanged. */
    const t6 = await mark();
    const aFx = (await assess(forecastOwner, w.forecastId)).assessment;
    expect(aFx).toMatchObject({ verdict: 'indeterminate', changed: true });
    expect(obj(obj(aFx['measures'])['window'])['outcomes']).toBe(0);
    expect(String(obj(aFx['measures'])['note'])).toMatch(/0 of 10 outcomes/);
    await outboxEvent('ForecastFitnessChanged', t6, (p) => p['forecast_id'] === w.forecastId);
    await sleep(1500);
    expect(await outboxCount('GraphChanged', t6, (p) => obj(p['change'])['kind'] === 'forecast.fitness_changed')).toBe(0);
    /* T2.7 DATA SHIFT through a real GraphChanged: a forecast on an assumption resting on a planted edge; the edge retracted through the route; the forecast consumer marks AND assesses. */
    const S3 = `${w.seriesKey}-shift`;
    await registerSeries(S3);
    const X1 = uuidv7();
    await seedEdge(X1, E1, 'ships_through', E2, uuidv7(), B, graphOwner.principalId);   // E1→E2, both planted: the reach never touches the fixture forecast (see E2)
    const tA = await mark();
    const ASU2 = (await declareStrategy('ASU', { title: 'The B21 holding keeps shipping through the strait', statement: 'the planted relationship holds (harness)', restsOn: [{ kind: 'edge', id: X1, rationale: 'the assumption is about this relationship' }] })).strategy.objectId;
    // (reconcile) ASU2's OWN declaration publishes GraphChanged/strategy.declared; its six deliveries are applied BEFORE FS exists, so the ONE
    // event that marks FS is the retraction below — applied after FS's issuance, the declaration's forecasts delivery would mark FS first
    // (assumptions.some(a => t.strategy.has(a))) and the retraction would find it already attending (seen on one run: a race, not a rule).
    const gA = await publishedIn('strategy.declared', tA, ASU2);
    expect(gA).toHaveLength(1);
    await sixApplied(gA[0]!.id);
    const FS = (await issueOn(S3, '2023-11-24', { assumptions: [ASU2] })).forecast.forecastId;
    await settle();
    expect(await forecastRow(FS), 'FS is unmarked before the retraction (the precondition of the data-shift pin)').toMatchObject({ attention_state: 'none', fitness_state: 'none' });
    const t7 = await mark();
    await retractEdge(X1, 'B21 T2.7: the planted relationship retracted (harness)');
    const gc = await publishedIn('edge.retracted', t7);
    expect(gc).toHaveLength(1);
    const ds7 = await sixApplied(gc[0]!.id);
    expect(ds7['forecasts']!.items).toEqual([FS]);
    expect(ds7['forecasts']!.items_applied[0]).toMatchObject({ effect: 'forecast.attention', details: { fitness: { state: 'unfit', class: 'data_shift', changed: true } } });
    expect(await forecastRow(FS)).toMatchObject({ attention_state: 'assumption_unverified', fitness_state: 'unfit', fitness_class: 'data_shift' });
    const aFS = (await assessmentsOf(FS)).at(-1)!;
    expect(aFS).toMatchObject({ trigger: 'subscription', verdict: 'unfit', fitness_class: 'data_shift', classes: ['data_shift'] });
    expect(String(aFS.measures['note'])).toMatch(/0 of 10 outcomes/);
    const ffcFS = await outboxEvent('ForecastFitnessChanged', t7, (p) => p['forecast_id'] === FS);
    expect(ffcFS.payload).toMatchObject({ trigger: 'subscription', to: { state: 'unfit', class: 'data_shift' }, cause: { action: 'prediction.forecast.subscription.apply' } });
    const gFS = await publishedIn('forecast.fitness_changed', t7, FS);
    expect(gFS).toHaveLength(1);
    expect(gFS[0]!.payload).toMatchObject({ forecast_fitness: { class: 'data_shift', trigger: 'subscription' }, cause: { action: 'prediction.forecast.subscription.apply' } });
    const dsFS = await sixApplied(gFS[0]!.id);
    expect(dsFS['forecasts']!.items).toEqual([]); expect(dsFS['scenarios']!.items).toEqual([]);
    /* T2.8 THE EXPIRY ARITHMETIC (the positive envelope_breach class is the demonstration's): expires_at = issued_at + 1 day for a daily cadence; not breached here. */
    const expiry = obj((await assessmentsOf(FL))[0]!.measures['expiry']);
    expect(expiry).toMatchObject({ cadence: 'daily', checked: true });
    expect(new Date(String(expiry['expires_at'])).getTime() - new Date((await forecastRow(FL)).issued_at).getTime()).toBe(86_400_000);
    expect((await assessmentsOf(FL))[0]!.classes).not.toContain('envelope_breach');
    sixEvidence('T2', { fault_trace: { family: S2, forecasts: F, live: FL, superseded: f13, successor: f14, shift: { edge: X1, assumption: ASU2, forecast: FS } }, watermark: { f1: 'indeterminate (1 of 10)', f10: `${String(a10['verdict'])} at ${cov10.cov}`, f11: `unfit calibration_failure at ${cov11.cov}`, fixture: 'indeterminate (0 of 10)', shift: 'unfit data_shift' }, consumer_behaviour: 'the scenario marked and re-checked (ScenarioCoherenceFailed from the consumer), the package noted material_change, the citing twin version unverified; nothing rests on the live forecast', operator_action: 'the owner assesses (idempotent), withdraws; the analyst refused', recovery: 'declare refused on the unfit forecast; the withdrawn and the superseded forecasts skipped by the outcome write (C19)', reconciliation: { rule_version: '1', graph_changed_for: [f11, FL, f14, FS], expiry_days: 1 } });
  }, 600_000);

  it('T3 · ScenarioCoherenceFailed: a duplicate-branch scenario ADMITTED failed (the findings, routed_to, the event), the run gate and the promotion prohibited, the continue re-check, the correction path (retire + a passing successor), temporal_order, assumption_invalid (an unknown basis; a claim withdrawn at version 2), the free-text note, the WARNING GATE, dependency_retired, the operator route', async () => {
    /* T3.1 THE DUPLICATE BRANCH: admitted failed, never refused. */
    const t0 = await mark();
    const dup = (await declareScenario(strategyOwner, scenarioPayload(w.forecastId, 'B21 duplicate-branch scenario (harness)', [baseline(), downside('Corridor collapse A', 'below 40 for five days'), downside('Corridor collapse B', 'the corridor collapses (a second statement of the same signal)')]))).scenario;
    const SDUP = dup.scenarioId; const branchA = dup.branches.find((b) => b.name === 'Corridor collapse A')!.branchId;
    expect(obj(dup.coherence)).toMatchObject({ outcome: 'failed', changed: true, prior_state: 'unchecked', rule_version: '1' });
    const findings = obj(dup.coherence)['findings'] as Row[];
    expect(findings.map((f) => [f['rule'], f['severity']])).toEqual([['duplicate_branch', 'fail'], ['coverage', 'note']]);
    expect(String(findings[0]!['detail'])).toMatch(/are both downside and share the same indicator; they do not cover distinct uncertainty/);
    expect(await scenarioRow(SDUP)).toMatchObject({ state: 'active', coherence_state: 'failed' });
    expect(await checksOf(SDUP)).toEqual([expect.objectContaining({ trigger: 'declare', outcome: 'failed', changed: true, prior_state: 'unchecked' })]);
    expect(await scenarioEvents(SDUP, 'scenario.coherence_checked')).toHaveLength(1);
    const scf = await outboxEvent('ScenarioCoherenceFailed', t0, (p) => p['scenario_id'] === SDUP);
    expect(scf.schema_version).toBe('v1');
    expect(scf.payload).toMatchObject({ schema: 'ScenarioCoherenceFailed', schema_version: 'v1', scenario_id: SDUP, outcome: 'failed', prior_state: 'unchecked', trigger: 'declare', routed_to: REVIEW_ROLES, cause: { action: 'prediction.scenario.declare', actor: strategyOwner.principalId, target_type: 'SCN', target_id: SDUP } });
    expect((scf.payload['findings'] as Row[])[0]!['rule']).toBe('duplicate_branch');
    expect(obj((await getScenario(SDUP)).scenario['coherence'])).toMatchObject({ state: 'failed', check_id: obj(dup.coherence)['check_id'] });
    /* T3.2 THE GATES: no run on an incoherent scenario's branch (on a version admitted AFTER the declaration — the world-time cut-off of open_run precedes the coherence gate); no promotion to simulation; a dissent checks nothing; a continuation re-checks (changed false, no second event). */
    const v3 = (await openVersion(w.twinOwner, w.twinId, { carryFrom: w.v1 })).version.version;
    expect((await admit(w.twinOwner, w.twinId, v3)).admitted.completeness).toBe('complete');
    await refused(run(runOwner, { twinVersion: v3, shock: false, scenarioId: SDUP, scenarioBranchId: branchA }), /^run rejected \(incoherent_scenario\): scenario .* failed its coherence check .* \(duplicate_branch\)/, 409, 'EYE-STA-002');
    await refused(reviewScenario(strategyOwner, SDUP, { outcome: 'promote_to_simulation', branch_id: branchA, note: 'promote the collapse branch (harness)' }), /^a failed coherence check prohibits promotion to simulation/, 409);
    expect(await checksOf(SDUP)).toHaveLength(1);
    await reviewScenario(strategyOwner, SDUP, { outcome: 'dissent', note: 'the second branch is a restatement (harness)', dissent: { position: 'the branches duplicate one another', rationale: 'one signal, one branch (harness)' } });
    expect(await checksOf(SDUP)).toHaveLength(1);
    const cont = (await reviewScenario(strategyOwner, SDUP, { outcome: 'continue', note: 'continued pending the correction (harness)' })).review;
    expect(obj(cont['coherence'])).toMatchObject({ outcome: 'failed', changed: false });
    expect((await checksOf(SDUP)).map((x) => x.trigger)).toEqual(['declare', 'review']);
    await sleep(1500);
    expect(await outboxCount('ScenarioCoherenceFailed', t0, (p) => p['scenario_id'] === SDUP)).toBe(1);
    /* T3.3 THE CORRECTION PATH (no branch-close act exists — D10): retire, then a successor without the duplicate passes. */
    await reviewScenario(strategyOwner, SDUP, { outcome: 'retire', note: 'retired: the duplicate branch; a successor follows (harness)' });
    expect((await scenarioRow(SDUP)).state).toBe('retired');
    await refused(checkCoherence(strategyOwner, SDUP), /^coherence check rejected: scenario .* is retired/, 409);
    const ok = (await declareScenario(strategyOwner, scenarioPayload(w.forecastId, 'B21 successor scenario (harness)'))).scenario;
    const SOK = ok.scenarioId;
    expect(obj(ok.coherence)).toMatchObject({ outcome: 'passed', changed: true, prior_state: 'unchecked' });
    expect((obj(ok.coherence)['findings'] as Row[]).map((f) => [f['rule'], f['severity']])).toEqual([['coverage', 'note']]);
    expect((await scenarioRow(SOK)).coherence_state).toBe('passed');
    await sleep(1500);
    expect(await outboxCount('ScenarioCoherenceFailed', t0, (p) => p['scenario_id'] === SOK), 'a pass rides the check row only').toBe(0);
    /* T3.4 temporal_order; assumption_invalid (an unknown basis; a planted claim withdrawn at version 2); the free-text note. */
    const IND2 = (await defineIndicator({ observesFrom: '2023-12-01', description: 'B21: transits below 40 for five days, observed from December (harness)' })).indicator.indicatorId;
    const time = (await declareScenario(strategyOwner, scenarioPayload(w.forecastId, 'B21 late decision (harness)', [baseline(), downside('Late decision', 'the decision is due before the indicator observes anything', { indicatorId: IND2, decisionDeadline: '2023-11-15T00:00:00Z' })]))).scenario;
    expect(obj(time.coherence)['outcome']).toBe('failed');
    expect((obj(time.coherence)['findings'] as Row[]).find((f) => f['rule'] === 'temporal_order')).toMatchObject({ severity: 'fail', detail: expect.stringMatching(/is due 2023-11-15/) });
    const unknownBasis = (await declareScenario(strategyOwner, scenarioPayload(w.forecastId, 'B21 unknown basis (harness)', [baseline(), downside('Reopening', 'the corridor reopens', { assumptions: [{ statement: 'the corridor reopens', basis: `CLM:${uuidv7()}@1` }] })]))).scenario;
    expect(obj(unknownBasis.coherence)['outcome']).toBe('failed');
    expect((obj(unknownBasis.coherence)['findings'] as Row[]).find((f) => f['rule'] === 'assumption_invalid')).toMatchObject({ severity: 'fail', detail: expect.stringMatching(/is not a claim of this domain/) });
    const CLMw = await seedClaim(w.evd, true);
    const withdrawnBasis = (await declareScenario(strategyOwner, scenarioPayload(w.forecastId, 'B21 withdrawn basis (harness)', [baseline(), downside('Reopening', 'the corridor reopens', { assumptions: [{ statement: 'the corridor reopens', basis: `CLM:${CLMw}@1` }] })]))).scenario;
    expect(obj(withdrawnBasis.coherence)['outcome']).toBe('failed');
    expect((obj(withdrawnBasis.coherence)['findings'] as Row[]).find((f) => f['rule'] === 'assumption_invalid')).toMatchObject({ severity: 'fail', detail: expect.stringMatching(/is withdrawn at version 2/) });
    const free = (await declareScenario(strategyOwner, scenarioPayload(w.forecastId, 'B21 free-text basis (harness)', [baseline(), downside('Reopening', 'the corridor reopens', { assumptions: [{ statement: 'the corridor reopens', basis: 'the ministry said so' }] })]))).scenario;
    expect(obj(free.coherence)['outcome']).toBe('passed');
    expect((obj(free.coherence)['findings'] as Row[]).find((f) => f['rule'] === 'basis_unchecked')).toMatchObject({ severity: 'note', detail: expect.stringMatching(/names no claim version as its basis; it is not judged/) });
    /* T3.5 THE WARNING GATE: a warning raised on a failed scenario's branch is RAISED and marked input_unverified (never suppressed); a passing scenario's is not marked. */
    const dup2 = (await declareScenario(strategyOwner, scenarioPayload(w.forecastId, 'B21 duplicate branches for the flip (harness)', [baseline(), downside('Collapse A2', 'below 40 for five days'), downside('Collapse B2', 'the same signal again')]))).scenario;
    expect(obj(dup2.coherence)['outcome']).toBe('failed');
    const branchA2 = dup2.branches.find((b) => b.name === 'Collapse A2')!.branchId;
    const branchOk = ok.branches.find((b) => b.kind === 'downside')!.branchId;
    const ev = await evaluateIndicator(w.indicatorId);
    expect(ev.warnings.map((x) => x.branchId)).toEqual(expect.arrayContaining([branchA2, branchOk]));
    const wA2 = (await warningOn(branchA2))!;
    expect(wA2).toMatchObject({ state: 'raised', attention_state: 'input_unverified' });
    expect(String(wA2.attention_reason)).toMatch(/^scenario .* failed its coherence check .* \(rule v1\); the warning stands on an incoherent scenario and is not decision-active until the review resolves it$/);
    expect((await warningEvents(wA2.warning_id, 'warning.attention')).map((e) => e.details)).toEqual([expect.objectContaining({ via: 'coherence', scenario_id: dup2.scenarioId, reason: 'the scenario failed its coherence check' })]);
    const wOk = (await warningOn(branchOk))!;
    expect(wOk.state).toBe('raised'); expect(wOk.attention_state).not.toBe('input_unverified');
    /* T3.6 dependency_retired: the subject entity retired WITH its event (the honest fixture); the operator's re-check finds it. */
    const dep = (await declareScenario(strategyOwner, { ...scenarioPayload(w.forecastId, 'B21 scenario on a retired subject (harness)'), subjectEntityId: E1 })).scenario;
    expect(obj(dep.coherence)['outcome']).toBe('passed');
    await retireEntity(E1, graphOwner.principalId);
    const t6 = await mark();
    const re = (await checkCoherence(strategyOwner, dep.scenarioId)).coherence;
    expect(re).toMatchObject({ outcome: 'failed', changed: true, prior_state: 'passed' });
    expect((re['findings'] as Row[]).find((f) => f['rule'] === 'dependency_retired')).toMatchObject({ severity: 'fail', detail: expect.stringMatching(/subject entity .* is retired/) });
    const scf6 = await outboxEvent('ScenarioCoherenceFailed', t6, (p) => p['scenario_id'] === dep.scenarioId);
    expect(scf6.payload).toMatchObject({ trigger: 'operator', cause: { action: 'prediction.scenario.check', actor: strategyOwner.principalId } });
    /* T3.7 THE OPERATOR ROUTE: a passing re-check unchanged; the analyst refused; an unknown scenario 404. */
    expect((await checkCoherence(strategyOwner, SOK)).coherence).toMatchObject({ outcome: 'passed', changed: false });
    expect(await failure(checkCoherence(analyst, SOK))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    await refused(checkCoherence(strategyOwner, uuidv7()), /^coherence check rejected: no such scenario/, 404, 'EYE-STA-001');
    await settle();
    sixEvidence('T3', { fault_trace: { duplicate: SDUP, successor: SOK, temporal: time.scenarioId, unknown_basis: unknownBasis.scenarioId, withdrawn_basis: { scenario: withdrawnBasis.scenarioId, claim: CLMw }, free: free.scenarioId, flip: dup2.scenarioId, retired_subject: { scenario: dep.scenarioId, entity: E1 } }, watermark: { duplicate: 'failed (admitted)', successor: 'passed', warning_on_failed: 'raised, input_unverified' }, consumer_behaviour: 'the run refused (incoherent_scenario), the promotion prohibited, the dissent checks nothing, the continuation re-checks; the warning raised and marked, never suppressed', operator_action: 'retire + a successor; the operator\'s check', recovery: 'the successor passes; the retired subject found by the re-check', reconciliation: { checks_dup: (await checksOf(SDUP)).map((x) => [x.trigger, x.outcome]), events: 'ScenarioCoherenceFailed on failed AND changed only' } });
  }, 300_000);

  it('T4 · ChallengeSimulation: open (one live per opener; the analyst refused), the SoD at decide (the opener; the operator), the RE-RUN (requested, the nested path\'s binding — C6, opened as a governed run naming correctsRunId and challengeId, bound once, compared), DISMISSED, WITHDRAWN, UPHELD (the run invalidated in the same write: three outbox rows, the six deliveries, the withdrawn SIM version, the package noted, the citation gate), upheld on an already-invalidated run (withheld), the PROMOTION (fit for a use; once; the operator and a disputed result refused), the get/list answers', async () => {
    const C0 = w.controlId; const R1 = w.rerouteId;
    const P2 = (await c.fullDraft()).pkg;
    await settle();
    /* T4.1 OPEN. */
    const t1 = await mark();
    const ch1 = (await openChallenge(strategyOwner, R1, { kind: 'interpretation', statement: 'the reroute saving assumes the Cape leg is bookable (harness)', disputed: ['route.reroute_delay_days'] })).challenge;
    const CH1 = String(ch1['challenge_id']);
    expect(ch1).toMatchObject({ run_id: R1, state: 'open', kind: 'interpretation', disputed: ['route.reroute_delay_days'], opened_by: strategyOwner.principalId, run: { operator_principal_id: w.operator.principalId } });
    expect(await challengeRow(CH1)).toMatchObject({ state: 'open', opened_by: strategyOwner.principalId, rerun_run_id: null });
    expect((await challengeEvents(CH1)).map((e) => e.event)).toEqual(['challenge.opened']);
    const cs1 = await outboxEvent('ChallengeSimulation', t1, (p) => p['challenge_id'] === CH1);
    expect(cs1.schema_version).toBe('v1');
    expect(cs1.payload).toMatchObject({ schema: 'ChallengeSimulation', schema_version: 'v1', challenge_id: CH1, run_id: R1, state: 'opened', kind: 'interpretation', run: { validity: 'valid', operator_principal_id: w.operator.principalId }, invalidation: null, cause: { action: 'simulation.challenge.open', actor: strategyOwner.principalId, target_type: 'SIM', target_id: R1 } });
    await refused(openChallenge(strategyOwner, R1, { kind: 'model', statement: 'a second live challenge by the same opener (harness)' }), /^simulation challenge rejected: challenge .* of run .* by this opener is live/, 409, 'EYE-STA-002');
    expect(await failure(openChallenge(analyst, R1, { kind: 'model', statement: 'the analyst may not dispute (harness)' }))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    /* T4.2 THE SoD at decide: the opener; the run's operator (R3 was opened by runOwner in T1). */
    await refused(decideChallenge(strategyOwner, R1, CH1, { decision: 'dismissed', note: 'deciding my own challenge (harness)' }), /^simulation challenge rejected: the decider is the challenge's opener/, 403, 'EYE-AUT-001');
    const CH3 = String((await openChallenge(strategyOwner, R3, { kind: 'constraints', statement: 'the horizon of the inside run is too short (harness)' })).challenge['challenge_id']);
    await refused(decideChallenge(runOwner, R3, CH3, { decision: 'dismissed', note: 'deciding a challenge of my own run (harness)' }), /^simulation challenge rejected: the decider operated the challenged run/, 403, 'EYE-AUT-001');
    /* T4.3 THE RE-RUN: requested; the nested path's binding (C6); the intake's refusals; the governed re-run bound once; compared on the common control. */
    const t3 = await mark();
    const rr = (await rerunChallenge(decider, R1, CH1, 'please re-run with the bookable leg (harness)')).challenge;
    expect(rr).toMatchObject({ state: 'rerun_requested', run_id: R1 });
    expect(String(rr['how'])).toMatch(/correctsRunId = the challenged run and challengeId = this challenge/);
    expect((await challengeEvents(CH1)).map((e) => e.event)).toEqual(['challenge.opened', 'challenge.rerun_requested']);
    expect((await outboxEvent('ChallengeSimulation', t3, (p) => p['challenge_id'] === CH1)).payload).toMatchObject({ state: 'rerun_requested', cause: { action: 'simulation.challenge.rerun', actor: decider.principalId } });
    await refused(rerunChallenge(decider, R3, CH1, 'through another run\'s path (harness)'), /^simulation challenge rejected: no such challenge .* of run /, 404, 'EYE-STA-001');
    const rerunPayload: Row = { runKind: 'intervention', controlRunId: C0, correctsRunId: R1, challengeId: CH1, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] };
    expect((await failure(run(runOwner, { ...rerunPayload, correctsRunId: undefined }))).status, 'the intake: a challenge without correctsRunId').toBe(422);
    await refused(run(runOwner, { ...rerunPayload, correctsRunId: C0 }), /^run rejected \(challenge\): challenge .* disputes run .*; a re-run names it as the run it corrects \(correctsRunId\)/, 422, 'EYE-REQ-001');
    const rerun = (await run(runOwner, rerunPayload)).run;
    expect(rerun.state).toBe('completed'); expect(rerun['challengeId']).toBe(CH1);
    const RR = rerun.runId;
    expect(await challengeRow(CH1)).toMatchObject({ state: 'rerun_requested', rerun_run_id: RR });
    expect((await challengeEvents(CH1)).map((e) => e.event)).toEqual(['challenge.opened', 'challenge.rerun_requested', 'challenge.rerun_opened']);
    expect(await runRow(RR)).toMatchObject({ challenge_id: CH1, corrects_run_id: R1, validity: 'valid' });
    await refused(run(runOwner, rerunPayload), /^run rejected \(challenge\): challenge .* is not awaiting a re-run \(run .* is its re-run\)/, 409, 'EYE-STA-002');
    const cmp = (await compareRuns([C0, R1, RR])).comparison;
    expect((cmp['runs'] as Row[]).length).toBe(3);
    /* T4.4 DISMISSED: nothing invalidated; the package unnoted. */
    const t4 = await mark();
    const dis = await decideChallenge(decider, R1, CH1, { decision: 'dismissed', note: 'the Cape leg was bookable on the record (harness)' });
    expect(dis).toMatchObject({ challenge: { state: 'dismissed', decided_by: decider.principalId }, invalidation: null, invalidation_withheld: null });
    expect((await outboxEvent('ChallengeSimulation', t4, (p) => p['challenge_id'] === CH1)).payload).toMatchObject({ state: 'dismissed', rerun_run_id: RR, cause: { action: 'simulation.challenge.decide' } });
    expect(await runRow(R1)).toMatchObject({ validity: 'valid', fitness_state: 'none' });
    await sleep(1500);
    expect(await packageNotes(P2, t4)).toEqual([]);
    /* T4.5 WITHDRAWN: the opener's act; a withdrawn challenge is not decided. */
    const CH2 = String((await openChallenge(strategyOwner, R1, { kind: 'assumptions', statement: 'the reroute assumed a bookable leg (harness)' })).challenge['challenge_id']);
    await refused(withdrawChallenge(decider, R1, CH2, 'not mine to withdraw (harness)'), /^simulation challenge rejected: a challenge is withdrawn by its opener/, 403, 'EYE-AUT-001');
    expect((await withdrawChallenge(strategyOwner, R1, CH2, 'withdrawn: the case was thin (harness)')).challenge).toMatchObject({ state: 'withdrawn' });
    await refused(decideChallenge(decider, R1, CH2, { decision: 'dismissed', note: 'deciding a withdrawn challenge (harness)' }), /^simulation challenge rejected: challenge .* is withdrawn; only a live challenge is decided/, 409, 'EYE-STA-002');
    /* T4.6 UPHELD: the run invalidated in the deciding write with trigger challenge — three outbox rows, the six deliveries, the withdrawn SIM version, the package noted, the citation gate. */
    const CH4 = String((await openChallenge(strategyOwner, R1, { kind: 'model', statement: 'the model mishandles the reroute delay (harness)' })).challenge['challenge_id']);
    const t6 = await mark();
    const up = await decideChallenge(decider, R1, CH4, { decision: 'upheld', note: 'the model does mishandle the reroute delay (harness)' });
    expect(up).toMatchObject({ challenge: { state: 'upheld' }, invalidation: { runId: R1, withdrawnVersion: 2 }, invalidation_withheld: null });
    const r1 = await runRow(R1);
    expect(r1).toMatchObject({ validity: 'invalidated', fitness_state: 'unfit' });
    expect(obj(r1.invalidation)).toMatchObject({ trigger: 'challenge', trigger_ref: CH4 });
    expect((await runEvents(R1)).find((e) => e.event === 'run.invalidated')!.details).toMatchObject({ trigger: 'challenge' });
    const cs4 = await outboxEvent('ChallengeSimulation', t6, (p) => p['challenge_id'] === CH4);
    expect(cs4.payload).toMatchObject({ state: 'upheld', invalidation: { withdrawn_version: 2 }, invalidation_withheld: null, cause: { action: 'simulation.challenge.decide', actor: decider.principalId } });
    const si = await outboxEvent('SimulationInvalidated', t6, (p) => p['run_id'] === R1);
    expect(si.payload).toMatchObject({ trigger: 'challenge', cause: { action: 'simulation.challenge.decide' } });
    expect(JSON.stringify(si.payload)).toContain(CH4);
    const gi = await publishedIn('simulation.invalidated', t6, R1);
    expect(gi).toHaveLength(1);
    expect(obj(gi[0]!.payload['simulation'])).toMatchObject({ trigger: 'challenge' });
    expect(new Set([cs4.correlation_id, si.correlation_id, gi[0]!.correlation_id]).size, 'the three rows of one write').toBe(1);
    const dsi = await sixApplied(gi[0]!.id);
    expect(dsi['decisions']!.items, 'every draft citing the run is noted (T2\'s P1 cites it too)').toContain(P2);
    const noteP2 = (await packageNotes(P2, t6))[0]!;
    expect(noteP2.details).toMatchObject({ failure_class: 'material_change' });
    expect(JSON.stringify(noteP2.details)).toMatch(/was INVALIDATED \(challenge\)/);
    for (const k of ['twins', 'forecasts', 'scenarios', 'memory-mappings']) expect(dsi[k]!.items, k).toEqual([]);
    expect(dsi['retrieval']!.items_applied[0]!.effect).toBe('projections.verified');
    expect((await objectRows(R1)).map((o) => [o.object_version, o.lifecycle_state, o.method_ref])).toEqual([[1, 'active', expect.any(String)], [2, 'withdrawn', 'simulation.run.invalidate@1.0.0']]);
    await refused(openChallenge(strategyOwner, R1, { kind: 'model', statement: 'disputing an invalidated run (harness)' }), /^simulation challenge rejected: run .* is invalidated .* nothing to dispute/, 409, 'EYE-STA-002');
    const Q = (await c.declare({ decisionObjectId: w.decisionId, title: 'B21 package on the invalidated reroute (harness)', statement: 'the citation gate after an upheld challenge', owner: w.owner.principalId })).package.packageId;
    const qv = (await c.open(Q)).version.version;
    const gate = await failure(c.option(Q, qv, { key: 'bad-reroute', title: 'Cites the invalidated reroute', kind: 'intervention', consequences: [{ kind: 'run', id: R1, version: 1 }] }));
    expect(gate.message).toMatch(/^option rejected: run .* was invalidated at .* \(challenge: .*\); a consequence cannot rest on an invalidated result/);
    /* T4.7 UPHELD on an already-invalidated run: withheld (the decider opens on R3, the operator invalidates it first, the domain administrator upholds). */
    const CH5 = String((await openChallenge(decider, R3, { kind: 'model', statement: 'the inside run\'s model is disputed (harness)' })).challenge['challenge_id']);
    await twins.invalidateRun(h.req(runOwner, 'simulation.run.invalidate', 'SIM', R3, 'simulation'), T(), D(), R3, { payload: { reason: 'the inside run was run on a misgrounded element (harness)' } });
    const t7 = await mark();
    const held = await decideChallenge(dadmin, R3, CH5, { decision: 'upheld', note: 'upheld; the run is already invalidated (harness)' });
    expect(held).toMatchObject({ challenge: { state: 'upheld' }, invalidation: null, invalidation_withheld: 'already_invalidated' });
    await sleep(1500);
    expect(await outboxCount('SimulationInvalidated', t7, (p) => p['run_id'] === R3)).toBe(0);
    /* T4.8 THE PROMOTION (OBJ-29): fit for a stated use, the validation restated from the row; once; the operator refused; a disputed result refused; the analyst refused; no outbox row. */
    const t8 = await mark();
    const pr = (await promote(decider, C0, { promotedFor: 'the NORDWERK corridor routing decision (harness)', limitations: ['calendar days'], note: 'the control run is fit for the routing decision (harness)' })).promotion;
    expect(pr).toMatchObject({ run_id: C0, fitness_state: 'fit', promoted_for: 'the NORDWERK corridor routing decision (harness)', limitations: ['calendar days'], promoted_by: decider.principalId, validation: { twin_fitness: 'none', envelope_state: 'inside' } });   // the fixture control opened before any validation (twin_fitness none) and after 0081 (its contract inside)
    expect(await runRow(C0)).toMatchObject({ fitness_state: 'fit', promoted_for: 'the NORDWERK corridor routing decision (harness)', promotion_id: String(pr['promotion_id']) });
    expect(await promotionRow(C0)).toMatchObject({ promoted_for: 'the NORDWERK corridor routing decision (harness)', promoted_by: decider.principalId });
    expect((await runEvents(C0)).at(-1)!.event).toBe('run.promoted');
    await sleep(1500);
    expect((await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${t8}`.execute(su)).rows[0]!.n, 'no outbox event for a promotion (D12)').toBe(0);
    await refused(promote(decider, C0, { promotedFor: 'a second promotion (harness)', note: 'promoted twice (harness)' }), /^run promotion rejected: run .* was promoted already/, 409, 'EYE-STA-002');
    await refused(promote(runOwner, RR, { promotedFor: 'my own re-run (harness)', note: 'the operator promotes (harness)' }), /^run promotion rejected: the reviewer operated run/, 403, 'EYE-AUT-001');
    const CH6 = String((await openChallenge(decider, RR, { kind: 'interpretation', statement: 'the re-run\'s saving is overstated (harness)' })).challenge['challenge_id']);
    await refused(promote(dadmin, RR, { promotedFor: 'a disputed re-run (harness)', note: 'promoting a disputed result (harness)' }), /^run promotion rejected: challenge .* of run .* is open — a disputed result is not promoted/, 409, 'EYE-STA-002');
    expect(await failure(promote(analyst, C0, { promotedFor: 'the analyst promotes (harness)', note: 'refused by the PDP (harness)' }))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    /* T4.9 THE GET AND THE LIST. */
    const g0 = (await getRun(C0)).run;
    expect(obj(g0['promotion'])).toMatchObject({ promoted_for: 'the NORDWERK corridor routing decision (harness)' });
    const g1 = (await getRun(R1)).run;
    expect(sorted((g1['challenges'] as Row[]).map((x) => x['state']))).toEqual(sorted(['dismissed', 'withdrawn', 'upheld']));
    const rows = (await listRuns()).runs;
    expect(rows.find((r) => r['run_id'] === RR)!['live_challenges']).toBe(1);
    expect(rows.find((r) => r['run_id'] === R1)!['live_challenges']).toBe(0);
    const all = (await listChallenges(null)).challenges;
    expect(all[0]!['challenge_id']).toBe(CH6);
    expect((await listChallenges(R1)).challenges.map((x) => x['challenge_id']).sort()).toEqual([CH1, CH2, CH4].sort());
    await settle();
    sixEvidence('T4', { fault_trace: { challenges: { CH1, CH2, CH3, CH4, CH5, CH6 }, rerun: RR, invalidated: R1, promoted: C0 }, watermark: { R1: 'invalidated (challenge), unfit', C0: 'fit (promoted)', RR: 'valid, disputed' }, consumer_behaviour: 'the package noted material_change on the upheld invalidation; the citation gate refuses the invalidated run; nothing else reached', operator_action: 'open / rerun / withdraw / decide (SoD) / promote (SoD)', recovery: 'the re-run compared on the common control; the dismissal leaves the run valid', reconciliation: { three_rows_one_write: true, withdrawn_sim_version: 2, promotion_outbox_rows: 0 } });
  }, 300_000);

  it('T5 · the register 40/10/0 with the four rows bound in 0081 — 44/6/0 since 0083 (B22), the four still bound in 0081 and L9-I05\'s clause delivered by B22; the seven consumer digests against 13ed40c (C4) and unchanged by B22, the four B22 identities their own; the two rule constants at version 1; the pre-0081 scenario reads unchecked', async () => {
    const r = await interfaces();
    expect(r.interfaces).toHaveLength(50);
    const byState = (s: string) => r.interfaces.filter((i) => i['binding_state'] === s).map((i) => String(i['interface_id']));
    expect(byState('bound')).toHaveLength(44); // 40 at 0081; + L1-I03, L1-I04, L2-I02, L10-I05 in 0083 (B22)
    expect(byState('partial').sort()).toEqual([...STILL_PARTIAL].sort());
    expect(byState('unbound')).toEqual([]);
    for (const [id, event] of [['L5-I05', 'ValidateTwin'], ['L6-I03', 'ForecastFitnessChanged'], ['L7-I04', 'ScenarioCoherenceFailed'], ['L8-I04', 'ChallengeSimulation']]) {
      const row = r.interfaces.find((i) => i['interface_id'] === id)!;
      expect(row, id).toMatchObject({ binding_state: 'bound', bound_in: '0081', schema_version: 'v1' });
      expect(row['bound_at']).not.toBeNull();
      expect(String(row['bound_to'])).toMatch(new RegExp(`${event}@v1`));
    }
    // 0083 (B22): the clause 0081 re-homed to B22 ('a policy change has no recorded cause on a package (L10-I05, B22)') is replaced by its delivery.
    const l9 = String(r.interfaces.find((i) => i['interface_id'] === 'L9-I05')!['bound_to']);
    expect(l9).toMatch(/B22 \(0083\): a POLICY CHANGE is a recorded cause/);
    expect(l9).not.toMatch(/a policy change has no recorded cause/);
    expect(await registerCounts()).toEqual({ bound: 44, partial: 6, unbound: 0 });
    // THE DIGESTS (C4): the three re-worded consumers changed, the four others byte for byte 13ed40c's; every live subscription carries this process's identity.
    // 0083 (B22): the seven unchanged by B22 (the three B21 moved are a2303ff's); the four B22 kinds carry identities of their own, none an earlier one.
    const earlier = new Set<string>([...Object.values(DIGESTS_13ED40C), ...Object.values(DIGESTS_A2303FF)]);
    for (const k of CONSUMER_KINDS) {
      if ((B22_KINDS as readonly string[]).includes(k)) expect(earlier.has(consumerCodeDigest(k)), `${k}: a new consumer (B22), a new identity`).toBe(false);
      else if (k === 'forecasts' || k === 'scenarios' || k === 'decisions') {
        expect(consumerCodeDigest(k), `${k}: a changed method is a new consumer`).not.toBe(DIGESTS_13ED40C[k]);
        expect(consumerCodeDigest(k), `${k}: unchanged by B22 (a2303ff's)`).toBe(DIGESTS_A2303FF[k]);
      } else expect(consumerCodeDigest(k), `${k}: unchanged since 13ed40c`).toBe(DIGESTS_13ED40C[k as PriorKind]);
    }
    expect(new Set(CONSUMER_KINDS.map((k) => consumerCodeDigest(k))).size).toBe(11);
    const st = (await statusOf()).subscriptions;
    for (const k of CONSUMER_KINDS) {
      expect(st.consumers.find((x) => x['kind'] === k), k).toMatchObject({ registeredInThisProcess: true, codeDigest: consumerCodeDigest(k), version: '1.0.0' });
      const live = st.subscriptions.find((s) => s['consumer_kind'] === k && s['status'] === 'active')!;
      expect(live, k).toMatchObject({ code_digest: consumerCodeDigest(k), consumer_version: '1.0.0' });
    }
    expect(await ruleVersion('prediction.forecast_fitness_rule')).toBe('1');
    expect(await ruleVersion('prediction.scenario_coherence_rule')).toBe('1');
    // the honest defaults of pre-0081 rows (the demonstration's): pinned on the columns — every scenario and run of a fresh database is checked at its own write (the fixture scenario was re-checked by the scenarios consumer when T2.7's retraction reached its forecast)
    const columnDefault = async (table: string, column: string): Promise<string> => (await sql<{ d: string }>`select column_default d from information_schema.columns where table_schema = ${table.split('.')[0]!} and table_name = ${table.split('.')[1]!} and column_name = ${column}`.execute(su)).rows[0]!.d;
    expect(await columnDefault('prediction.scenarios_current', 'coherence_state')).toMatch(/^'unchecked'/);
    expect(await columnDefault('simulation.runs_current', 'envelope_state')).toMatch(/^'unrecorded'/);
    expect(await columnDefault('simulation.runs_current', 'twin_fitness')).toMatch(/^'none'/);
    expect(await columnDefault('prediction.forecasts_current', 'fitness_state')).toMatch(/^'none'/);
    expect(await columnDefault('twin.twin_versions', 'fitness_state')).toMatch(/^'none'/);
    expect(['passed', 'failed']).toContain((await scenarioRow(w.scenarioId)).coherence_state);
    sixEvidence('T5', { fault_trace: 'none: the register and the identities read', watermark: { register: '44/6/0 (40/10/0 at 0081; B22 0083)', rules: { fitness: '1', coherence: '1' } }, consumer_behaviour: { changed: ['forecasts', 'scenarios', 'decisions'], unchanged: ['twins', 'retrieval', 'memory-mappings', 'relationships'], b22_new: [...B22_KINDS] }, operator_action: 'the act re-registers the three changed kinds on the demonstration', recovery: 'none', reconciliation: { digests_13ed40c: DIGESTS_13ED40C, digests_a2303ff: DIGESTS_A2303FF } });
  }, 120_000);
});
