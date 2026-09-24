/**
 * CP-6 B18 (migration 0078) — THE LIFECYCLE ANNOUNCED and the WITHDRAWAL → INVALIDATION → REOPEN chain: the ten interface register
 * rows the product performed as ledgers but never published (TwinStateChanged, SimulationStarted, SimulationCompleted,
 * DecisionPackageReady, DecisionCommitted, ReviewRequested, ForecastIssued@v2, ForecastWithdrawn, SimulationInvalidated,
 * DecisionReopened) bound — each event written in the transaction that makes the transition — and the three acts the product
 * lacked: an issued forecast WITHDRAWN as unfit (the dependants named, the consumers marked), a completed run's result
 * INVALIDATED (by the operator, or by a reproduction whose verdict is unreproducible because a cited input was withdrawn) and a
 * committed decision REOPENED on a recorded cause (the commitment immutable, a new draft carried with the stale inputs dropped and
 * named, a second commitment, the replay of the first at its own instant) — on a real database with real Redis, the real outbox
 * publisher and the real subscription dispatcher (EYE_SCHEDULER_ENABLED set at module top, the B6 rule), the seven consumers
 * registered in the harness's own domain, the world of `bootDecisionWorld` (the corridor twin, its runs, the forecast and the
 * scenario on it, the DEC) and B18's own humans with sessions of their own (the ports compare the acting principal).
 *
 *   S1 · the seven announced events, each in its transition's own transaction (family A): (1) TwinStateChanged/version.admitted
 *   from the admit of version 2 (a predicted element citing the forecast added to the carried set — the changed variables, the
 *   freshness, the superseded version's four runs as the dependency impacts) beside GraphChanged/twin.state_changed (objects.twins,
 *   objects.simulations = those runs, no walk) and its six deliveries: the twins consumer leaves a twin's own admission alone (both
 *   versions verified), the decisions consumer NOTES the draft citing the superseded version's runs WITHOUT exposure (C13), retrieval
 *   verified, the rest empty; (2)(3) SimulationStarted and SimulationCompleted from the two writes of a run on version 2 — the
 *   resolved artefacts, the environment beyond its digest, the stochastic contract, the execution identity, the outputs, the impacts
 *   against the control, the reproducibility digests, the SIM object and the RESOURCE EVIDENCE (on the row too); (4)(5)
 *   DecisionPackageReady from the proposal of a package citing the version-2 runs and the forecast (the options with their
 *   uncertainty and cited runs, the choice, the dissent, the provenance, the policy, the conditions, the baseline) and
 *   DecisionCommitted from its commitment (the approvals, the CMT and what it rests on, the conditions, the handoff statement, the
 *   replay snapshot); (6) ReviewRequested from a CHALLENGE of a native claim with lineage (routed_to the reviewer roles, the case
 *   queued); (7) ForecastIssued@v2 from a second issue at another horizon (the v1 keys kept; the expiry from the cadence, the
 *   distribution, the validation, the lineage; the outbox row's schema_version column v2).
 *
 *   S2 · the chain end to end. (a) THE WITHDRAWAL by the forecast owner: the row (withdrawn, the reason and unfit class, the
 *   dependants — the scenario, the twin version, the two version-2 runs, the committed package — the warnings none), the withdrawn
 *   FCT version 2 (the corrections-path header, the payload verbatim), the ledger; ForecastWithdrawn then GraphChanged/forecast.withdrawn
 *   (the typed block) in the same partition; the six deliveries: the scenario marked input_unverified, the package NOTED with
 *   material_change/compensation (the executed decision) and the lifecycle block, the twin version UNVERIFIED and its own
 *   TwinStateChanged/version.unverified from the item's transaction (bound by caused_by and the ledger's correlation — C16),
 *   retrieval verified, forecasts and memory-mappings empty. (b) THE AUTOMATIC INVALIDATION: first the NEGATIVE (C2) — the pinned
 *   implementation flipped, the control's reproduction unreproducible for THAT reason and the invalidation WITHHELD (the run valid,
 *   no event); then the reroute run's reproduction: unreproducible because the cited forecast is withdrawn (a lifecycle cause) → the
 *   run invalidated in the same write (validity, the withdrawn SIM version, run.invalidated, the dependants: the package, the
 *   commitment, the decision), SimulationInvalidated (trigger reproduction, the reproduction named) beside
 *   GraphChanged/simulation.invalidated, the package noted again; a second reproduction records the verdict and invalidates nothing.
 *   (c) THE OPERATOR'S INVALIDATION of the second control (cited by nothing): the event with trigger operator, the empty reach.
 *   (d) THE REOPEN on the recorded note: state reopened with the cause on the row, the commitment, the approval and the committed
 *   version untouched, a new draft with BOTH options dropped and named (the reroute run invalidated; the status-quo run resting on
 *   the withdrawn forecast — C12), the two ledger rows, DecisionReopened; the second cycle — a fresh status-quo on the version-1
 *   control, an unsimulated option, the choice, the proposal (DecisionPackageReady with reopened_from), the approval, the SECOND
 *   commitment (DecisionCommitted naming the first; two commitment rows, the first byte for byte as before — C1); the replay of
 *   version 1 closes its decided layer at the FIRST commitment's instant, of version 2 at the second (D13).
 *
 *   S3 · the refusals, by family and status: the withdrawal (twice, a superseded forecast, unknown, a short reason, the wrong
 *   principal), the invalidation (an opened and a failed run, already invalidated, unknown, the wrong principal), the citation gate
 *   at set_option (the exact version reaches the port's texts; the version-less citation is refused by the service — C5; a run
 *   resting on a withdrawn forecast — C12) and at the proposal (the committed version's rows seeded outside the port), the scenario on a withdrawn
 *   forecast (N-d), the reopen (a draft package, no cause, another package's note, a note recorded before the commitment, the wrong
 *   principals, a second reopen while the draft is open — and, reopened, the package still HEARS of its inputs: C8), the withdrawal
 *   of a package whose commitment stands (C9), the second commit over a standing commitment.
 *
 *   S4 · the register through the route: 50 rows, 40 bound / 10 partial / 0 unbound (B21, 0081: the four foresight rows bound), the ten
 *   rows bound in 0078 and the four bound in 0081 with their event and schema version, the ten that stay partial listed exactly.
 *
 * Read against the design's own statements, what this harness does NOT claim: the failed-run state of SimulationCompleted is
 * unit-tested (every run here completes); the port-marked warnings are the port's own loop (the fixture raises none); a closed
 * package is not reopened (none is closable here); the extraction's two ReviewRequested sites are the unit test's and the
 * demonstration's (the challenge is the site here).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { IntelligenceController } from '../../src/intelligence/intelligence.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { CONSUMER_KINDS, type ConsumerKind } from '../../src/graph/subscriptions/graph-change.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../../src/twin/models/supply-flow.digest.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';
import { superDb, type AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

type Row = Record<string, unknown>;
/** The B18 routes as the design states them (§2.2, §2.3, §2.5, §3.1); the harness calls them in process, as the B14–B17 harnesses call theirs. */
interface B18Prediction { withdrawForecast(req: never, tenantId: string, domainId: string, forecastId: string, body: { payload?: { reason?: string; unfitClass?: string } }): Promise<{ withdrawal: { forecastId: string; withdrawn: Row; withdrawnVersion: number }; receipt: Row }> }
/** An artefact a reproduction found unavailable, structured (C2): the cause decides whether the verdict invalidates; the answer's `unavailable` keeps the texts (the pinned wording), `invalidation.named` the lifecycle entries. */
type Unavailable = { key: string; kind: string; id: string; version: number; cause: 'access' | 'lifecycle' | 'bytes'; state?: 'withdrawn' | 'retired'; by_version?: number; text: string };
type Reproduction = { runId: string; verdict: string; reason: string; unavailable: string[]; invalidation: { invalidated_at: string; withdrawn_version: number; cause: string; named: Unavailable[] } | null; invalidation_withheld?: string | null };
interface B18Twins {
  invalidateRun(req: never, tenantId: string, domainId: string, runId: string, body: { payload?: { reason?: string } }): Promise<{ invalidation: { runId: string; invalidated: Row; withdrawnVersion: number }; receipt: Row }>;
  reproduce(req: never, tenantId: string, domainId: string, runId: string, body: { payload?: Row }): Promise<{ reproduction: Reproduction; receipt: Row }>;
}
interface B18Decisions { reopen(req: never, tenantId: string, domainId: string, packageId: string, body: { payload?: { cause?: { kind?: string; ref?: string }; knownAt?: string; observedThrough?: string | null } }): Promise<{ reopened: Row; receipt: Row }> }

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let graph: GraphController; let intelligence: IntelligenceController; let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService; let su: AnyDb;
let b18p: B18Prediction; let b18t: B18Twins; let b18d: B18Decisions;
let tenantAdmin: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let runOwner: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
const subs: Partial<Record<ConsumerKind, { subscriptionId: string; principalId: string }>> = {};
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/; const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const instantOf = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
const obj = (v: unknown): Row => (v ?? {}) as Row;
/** The six consumer kinds a GraphChanged reaches; the seventh (`relationships`) selects MemoryCorrected/claim.corrected alone (B9) and is registered too, so its absence from every GraphChanged delivery is a fact of the registry, not of this file. */
const GRAPH_KINDS = CONSUMER_KINDS.filter((k) => k !== 'relationships');
/** The ten register rows 0078 binds, each to its event and schema version; the fourteen that stay partial (design §0). */
const BOUND_IN_0078: ReadonlyArray<[string, string, string]> = [
  ['L2-I04', 'ReviewRequested', 'v1'], ['L5-I04', 'TwinStateChanged', 'v1'], ['L6-I02', 'ForecastIssued', 'v2'], ['L6-I05', 'ForecastWithdrawn', 'v1'],
  ['L8-I02', 'SimulationStarted', 'v1'], ['L8-I03', 'SimulationCompleted', 'v1'], ['L8-I05', 'SimulationInvalidated', 'v1'],
  ['L9-I02', 'DecisionPackageReady', 'v1'], ['L9-I04', 'DecisionCommitted', 'v1'], ['L9-I05', 'DecisionReopened', 'v1'],
];
// B21 (0081; Nit 3): L5-I05, L6-I03, L7-I04 and L8-I04 bound — the ten that stay partial.
const STILL_PARTIAL = ['L1-I02', 'L1-I03', 'L1-I04', 'L2-I02', 'L3-I02', 'L4-I02', 'L7-I02', 'L10-I02', 'L10-I03', 'L10-I05'];
/** The four foresight rows 0081 binds (B21.3), each to its event and schema version. */
const BOUND_IN_0081: ReadonlyArray<[string, string, string]> = [['L5-I05', 'ValidateTwin', 'v1'], ['L6-I03', 'ForecastFitnessChanged', 'v1'], ['L7-I04', 'ScenarioCoherenceFailed', 'v1'], ['L8-I04', 'ChallengeSimulation', 'v1']];

/* ───────────── the world of this file (set in beforeAll and S1) ───────────── */
/** The twin's version 2 (the carried set plus the predicted element citing the forecast), admitted after the subscriptions; its mark. */
let v2 = 0; let t0: Date;
/** The draft declared BEFORE version 2's admit, citing the version-1 runs: the package the twin's own admission is noted on (C13). */
let P0 = '';
/** The runs on version 2 (S1), the package citing them (S1), its commitment (S1), the challenge case (S1), the second forecast (S1). */
let ctlV2 = ''; let rerouteV2 = ''; let P = ''; let versionDigest1 = ''; let approvalId1 = ''; let cm: { commitmentId: string; decidedAt: string }; let f2 = '';
/** The note the withdrawal's delivery records on P (S2 a): the reopen's cause (S2 d). */
let NOTE_ID = '';
/** The second commitment (S2 d). */
let cm2: { commitmentId: string; decidedAt: string };
/** The version-1 runs of the fixture, the superseded version's dependency impacts. */
const v1Runs = (): string[] => [w.controlId, w.rerouteId, w.airId, w.control2Id];

/* ───────────── the rows ───────────── */
const twinVerification = async (twinId: string, version: number) => (await sql<{ verification_state: string }>`select verification_state from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${version}`.execute(su)).rows[0]?.verification_state;
const twinUnverifiedEvents = async (twinId: string, version: number) => (await sql<{ details: Row; correlation_id: string }>`select details, correlation_id::text from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified' and (details ->> 'version')::int = ${version} order by occurred_at`.execute(su)).rows;
const twinAdmitCorrelation = async (twinId: string, version: number) => (await sql<{ correlation_id: string }>`select correlation_id::text from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.admitted' and (details ->> 'version')::int = ${version}`.execute(su)).rows[0]?.correlation_id;
type ForecastRow = { state: string; attention_state: string; series_key: string; horizon_code: string; withdrawn_at: Date | null; withdrawn_by: string | null; withdrawal: Row | null };
const forecastRow = async (id: string): Promise<ForecastRow> => (await sql<ForecastRow>`select state, attention_state, series_key, horizon_code, withdrawn_at, withdrawn_by::text, withdrawal from prediction.forecasts_current where forecast_id = ${id}::uuid`.execute(su)).rows[0]!;
const forecastEvents = async (id: string) => (await sql<{ event: string; details: Row; correlation_id: string }>`select event, details, correlation_id::text from prediction.forecast_events where forecast_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const scenarioRow = async (id: string) => (await sql<{ attention_state: string; state: string }>`select attention_state, state from prediction.scenarios_current where scenario_id = ${id}::uuid`.execute(su)).rows[0];
type PackageEvent = { event_id: string; event: string; details: Row; occurred_at: Date; correlation_id: string };
const packageEvents = async (id: string): Promise<PackageEvent[]> => (await sql<PackageEvent>`select event_id::text, event, details, occurred_at, correlation_id::text from decision.package_events where package_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
type PackageRow = { state: string; committed_version: number | null; decided_at: Date | null; current_version: number | null; reopened_at: Date | null; reopened_by: string | null; reopened_from_version: number | null; reopen_cause: Row | null; reopens: number };
const packageRow = async (id: string): Promise<PackageRow> => (await sql<PackageRow>`select state, committed_version::int, decided_at, current_version::int, reopened_at, reopened_by::text, reopened_from_version::int, reopen_cause, reopens::int from decision.packages_current where package_id = ${id}::uuid`.execute(su)).rows[0]!;
const versionsOf = async (pkg: string) => (await sql<{ version: number; state: string; supersedes: number | null }>`select version::int, state, supersedes::int from decision.package_versions where package_id = ${pkg}::uuid order by version`.execute(su)).rows;
type CommitmentRow = { commitment_id: string; version: number; committed_by: string; version_digest: string; committed_at: Date; committed_at_iso: string; op_class: string; bound_action: string };
const commitments = async (pkg: string): Promise<CommitmentRow[]> => (await sql<CommitmentRow>`select commitment_id::text, version::int, committed_by::text, version_digest, committed_at, decision.iso(committed_at) committed_at_iso, op_class, bound_action from decision.commitments where package_id = ${pkg}::uuid order by committed_at`.execute(su)).rows;
const approvals = async (pkg: string) => (await sql<{ approval_id: string; version: number; decision: string; revoked_at: Date | null }>`select approval_id::text, version::int, decision, revoked_at from decision.approvals where package_id = ${pkg}::uuid order by recorded_at`.execute(su)).rows;
type RunRow = { state: string; validity: string; invalidated_at: Date | null; invalidated_by: string | null; invalidation: Row | null; resource: Row | null; initial_state_digest: string; inputs_digest: string; outputs_digest: string | null; header_digest: string | null; implementation_digest: string; environment_digest: string; twin_version: number; run_kind: string; control_run_id: string | null };
const runRow = async (id: string): Promise<RunRow> => (await sql<RunRow>`select state, validity, invalidated_at, invalidated_by::text, invalidation, resource, initial_state_digest, inputs_digest, outputs_digest, header_digest, implementation_digest, environment_digest, twin_version::int, run_kind, control_run_id::text from simulation.runs_current where run_id = ${id}::uuid`.execute(su)).rows[0]!;
const runEvents = async (id: string) => (await sql<{ event: string; details: Row; correlation_id: string }>`select event, details, correlation_id::text from simulation.run_events where run_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const reproductionsOf = async (id: string) => (await sql<{ reproduction_id: string; verdict: string }>`select reproduction_id::text, verdict from simulation.reproductions where run_id = ${id}::uuid order by reproduced_at`.execute(su)).rows;
type ObjectRow = { object_id: string; object_version: number; object_type: string; lifecycle_state: string; truth_state: string; correction_of: string | null; supersedes: string | null; withdrawal_reason: string | null; method_ref: string | null; accountable_owner: string; purpose_scope: string | null; payload: Row };
const objectRows = async (objectId: string): Promise<ObjectRow[]> => (await sql<ObjectRow>`select object_id::text, object_version::int, object_type, lifecycle_state, truth_state, correction_of, supersedes, withdrawal_reason, method_ref, accountable_owner, purpose_scope, payload from objects.canonical_objects where object_id = ${objectId}::uuid order by object_version`.execute(su)).rows;
const reviewCase = async (caseId: string) => (await sql<{ state: string; queued_reason: string; run_id: string; method_id: string; confidence: string | null }>`select state, queued_reason, run_id::text, method_id::text, confidence::text from intelligence.review_current where case_id = ${caseId}::uuid`.execute(su)).rows[0];
const reviewEvents = async (caseId: string) => (await sql<{ event: string; correlation_id: string }>`select event, correlation_id::text from intelligence.review_events where case_id = ${caseId}::uuid order by occurred_at`.execute(su)).rows;
const retrievalChecks = async (eventId: string) => (await sql<{ mismatched: number; touched: Row }>`select mismatched::int, touched from graph.retrieval_checks where outbox_event_id = ${eventId}::uuid`.execute(su)).rows;
const applyActionsSince = async (since: Date) => (await sql<{ actor: string; action: string }>`select distinct actor, action from audit.audit_events where action like '%.subscription.apply' and tenant_id = ${T()}::uuid and occurred_at::timestamptz >= ${since}`.execute(su)).rows;
const registerCounts = async () => (await sql<{ bound: number; partial: number; unbound: number }>`select count(*) filter (where binding_state = 'bound')::int bound, count(*) filter (where binding_state = 'partial')::int partial, count(*) filter (where binding_state = 'unbound')::int unbound from objects.interface_register`.execute(su)).rows[0]!;

/* ───────────── the outbox and the deliveries (the B6/B17 idioms) ───────────── */
type OutboxRow = { id: string; status: string; event_type: string; schema_version: string | null; payload: Row; correlation_id: string; created_at: Date; partition_key: string; partition_seq: number };
const outboxRowsIn = async (domainId: string, eventType: string, after: Date): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, event_type, schema_version, payload, correlation_id::text, created_at, partition_key, partition_seq::int from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${domainId}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows;
type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; attempts: number; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; details?: Row }>; last_error: string | null };
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, last_error from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(su)).rows;
const deliveryEvents = async (eventId: string, kind: string): Promise<string[]> =>
  (await sql<{ event: string }>`select e.event from graph.subscription_delivery_events e join graph.subscriptions s on s.subscription_id = e.subscription_id where e.outbox_event_id = ${eventId}::uuid and s.consumer_kind = ${kind} order by e.occurred_at, e.event_id`.execute(su)).rows.map((r) => r.event);
/** A marker on the DATABASE clock (outbox created_at is the write transaction's now(); both come back at millisecond precision, so the match is >=). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 800)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}; recent: ${JSON.stringify(dispatcher.recentDeliveries().slice(0, 4))}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
const settleIn = async (domainId: string, ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const q = await scheduler.subscriptionQueueCountsForTests(T(), domainId);
    if (q.active === 0 && q.waiting === 0 && q.delayed === 0) return;
    if (Date.now() > until) throw new Error(`the subscription queue of ${domainId} did not settle: ${JSON.stringify(q)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};
/** The GraphChanged rows of a kind in the domain since the mark — of one cause target when named — every one published by the real outbox tick; the case asserts how many. */
const publishedIn = (domainId: string, kind: string, after: Date, targetId?: string): Promise<OutboxRow[]> =>
  waitFor(`the GraphChanged/${kind} row${targetId === undefined ? '' : ` of ${targetId}`} published`,
    () => outboxRowsIn(domainId, 'GraphChanged', after).then((rows) => rows.filter((r) => obj(r.payload['change'])['kind'] === kind && (targetId === undefined || obj(r.payload['cause'])['target_id'] === targetId))),
    (rows) => rows.length > 0 && rows.every((r) => r.status === 'published'));
/** The latest published row of an event type since the mark that satisfies the predicate (the B9 idiom). */
const outboxEvent = (eventType: string, after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow> =>
  waitFor(`the ${eventType} row published`, () => outboxRowsIn(D(), eventType, after).then((rows) => rows.filter((x) => where(x.payload))),
    (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);
/** How many rows of an event type since the mark satisfy the predicate, whatever their status. */
const outboxCount = async (eventType: string, after: Date, where: (p: Row) => boolean): Promise<number> => (await outboxRowsIn(D(), eventType, after)).filter((x) => where(x.payload)).length;
/** The six deliveries of an event applied, the queue settled, the rows by kind. */
const sixApplied = async (eventId: string): Promise<Record<string, Delivery>> => {
  const ds = await waitFor(`the six deliveries of ${eventId} applied`, () => deliveriesFor(eventId), (rows) => rows.length === 6 && rows.every((d) => d.state === 'applied'), 120_000);
  await settleIn(D());
  for (const d of ds) expect(d, d.consumer_kind).toMatchObject({ deliveries: 1, attempts: d.items.length > 0 ? 1 : 0, last_error: null });
  expect(sorted(ds.map((d) => d.consumer_kind))).toEqual(sorted([...GRAPH_KINDS]));
  return Object.fromEntries(ds.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
};
/** The pinned shape of an applied delivery set for an event that reaches nothing but the retrieval check. */
const emptyReach = async (ds: Record<string, Delivery>, eventId: string, changeKind: string, except: string[] = []): Promise<void> => {
  for (const kind of ['twins', 'forecasts', 'scenarios', 'decisions', 'memory-mappings']) if (!except.includes(kind)) expect(ds[kind], kind).toMatchObject({ items: [], items_applied: [] });
  expect(ds['retrieval']).toMatchObject({ items: ['projections'] });
  expect(ds['retrieval']!.items_applied[0]!.effect).toBe('projections.verified');
  const rc = await retrievalChecks(eventId);
  expect(rc).toHaveLength(1);
  expect(rc[0]).toMatchObject({ mismatched: 0, touched: { change_kind: changeKind } });
};

/* ───────────── the routes (in process; the B18 routes through the design's shapes) ───────────── */
const register = (kind: ConsumerKind) => graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
  { payload: { consumerKind: kind, ownerPrincipalId: w.owner.principalId, backlog: 'leave', ...(kind === 'relationships' ? { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } : {}) } as never }) as Promise<{ subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean } }>;
const interfaces = () => graph.interfaces(h.req(w.twinOwner, 'graph.read', 'SUB', null, 'graph'), T(), D()) as Promise<{ interfaces: Row[] }>;
const withdrawForecast = (as: AuthenticatedPrincipal, id: string, payload: { reason?: string; unfitClass?: string } = { reason: 'the corridor series shifted after issue; the fit no longer holds (harness)', unfitClass: 'data_shift' }) =>
  b18p.withdrawForecast(h.req(as, 'prediction.forecast.withdraw', 'FCT', id, 'prediction'), T(), D(), id, { payload });
const invalidateRun = (as: AuthenticatedPrincipal, id: string, reason = 'the control was run on a version whose corridor element is now known to be misgrounded (harness)') =>
  b18t.invalidateRun(h.req(as, 'simulation.run.invalidate', 'SIM', id, 'simulation'), T(), D(), id, { payload: { reason } });
const reproduce = (as: AuthenticatedPrincipal, id: string) => b18t.reproduce(h.req(as, 'simulation.reproduce', 'SIM', id), T(), D(), id, { payload: {} });
const reopen = (as: AuthenticatedPrincipal, pkg: string, payload: { cause?: { kind?: string; ref?: string }; knownAt?: string; observedThrough?: string | null }) =>
  b18d.reopen(h.req(as, 'decision.package.reopen', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload });
/** A run opened and completed by B18's run owner (a session of its own): the fixture's shape on version 2. */
const runAs = (as: AuthenticatedPrincipal, over: Row = {}) => w.twins.run(h.req(as, 'simulation.run', 'SIM', null), T(), D(),
  { payload: { twinId: w.twinId, twinVersion: v2, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...over } }) as Promise<{ run: { runId: string; state: string } }>;
const issueForecast = (as: AuthenticatedPrincipal, horizon: string, refreshCadence: string) => w.prediction.issueForecast(h.req(as, 'prediction.forecast.issue', 'FCT', null), T(), D(),
  { payload: { seriesKey: w.seriesKey, horizon, knownAt: new Date().toISOString(), observedThrough: '2021-02-15', assumptions: [w.assumptionId], label: 'short history', refreshCadence } }) as Promise<{ forecast: { forecastId: string; method: string; validationState: string } }>;
/** A refused call: the message and the status the product answers — the HttpException's own (a service, the PDP), or the mapper's for a port's raw refusal (asObservationRefusal, as observation.filter.ts maps it on the HTTP path). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message ?? e.message) };
  const mapped = asObservationRefusal(e, 'harness');
  return { status: mapped === null ? null : mapped.getStatus(), message: e instanceof Error ? e.message : String(e) };
};
const refused = async (p: Promise<unknown>, re: RegExp, expectedStatus?: number): Promise<{ status: number | null; message: string }> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  if (expectedStatus !== undefined) expect(r.status, r.message).toBe(expectedStatus);
  return r;
};

/* ───────────── a native claim with lineage, seeded as the extraction admits it (the B16/B17 idiom) ───────────── */
const REL_PAYLOAD = { claim_kind: 'relationship', subject: 'NORDWERK Magnet GmbH', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait' };
/** A claim version as the extraction would have admitted it: the complete header, the payload the claim schema admits, its lineage row (the run and method it names are the challenge's), a run row. Written by the superuser; the evidence is the fixture's EVD, its bytes digest a 64-hex value (N-j: nothing here reads the bytes). */
async function seedClaim(a: { type: 'REL' | 'ENT'; evidence: { id: string; version: number }; payload: Row }): Promise<{ claimId: string; runId: string; methodId: string }> {
  const claimId = uuidv7(); const version = 1; const runId = uuidv7(); const methodId = uuidv7(); const now = new Date().toISOString();
  const bytesDigest = sha256(a.evidence.id);
  const lineage = { method_key: 'fixture', method_id: methodId, model_id: 'fixture-model', model_weights_digest: sha256('w'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: sha256('d'), mode: 'replay', call_id: null, run_id: runId,
    evidence_object_id: a.evidence.id, evidence_digest: bytesDigest, byte_start: 0, byte_end: 4, extraction_identity: sha256(`${claimId}@${version}`), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  const payload: Row = { ...a.payload, confidence: 0.8, lineage, review: { state: 'approved', reason: 'fixture', decider: null } };
  const header: CanonicalHeader = {
    object_id: claimId, object_type: a.type, tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [a.evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${a.evidence.id}@${a.evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${a.type}@v1`, ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const contentDigest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${claimId}::uuid, ${a.type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, ${header.schema_ref}, null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${a.type}, ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${a.evidence.id}::uuid, ${bytesDigest}, 0, 4, 0.8, ${lineage.retrieval_decision_id}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into intelligence.runs_current (run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id, mode, state, finished_at, evidence_read, claims_admitted, correlation_id)
    values (${runId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${methodId}::uuid, 1, ${w.twinOwner.principalId}::uuid, 'replay', 'completed', clock_timestamp(), 1, 1, ${uuidv7()}::uuid)`.execute(su);
  return { claimId, runId, methodId };
}
/** A run row that never completed, planted from the fixture's control (the phase6-decisions idiom): the invalidation of an opened or failed run is refused before any port. */
async function plantRun(state: 'opened' | 'failed'): Promise<string> {
  const id = uuidv7();
  await sql`insert into simulation.runs_current (run_id, scope, tenant_id, domain_id, twin_id, twin_version, branch_id, run_kind, control_run_id, shock, component, known_at, observed_through, initial_state, initial_state_digest, model_ref, implementation_digest, environment_digest, environment, stochastic_mode, interventions, constraints, assumptions, inputs_digest, validation_status, state, failure, operator_principal_id, correlation_id, shock_basis)
    select ${id}::uuid, scope, tenant_id, domain_id, twin_id, twin_version, branch_id, 'control', null, shock, component, known_at, observed_through, '[]'::jsonb, initial_state_digest, model_ref, implementation_digest, environment_digest, environment, 'deterministic', '[{"type":"none"}]'::jsonb, constraints, assumptions, inputs_digest, validation_status, ${state}::text, ${state === 'failed' ? 'harness: planted as failed' : null}::text, operator_principal_id, ${uuidv7()}::uuid, shock_basis
      from simulation.runs_current where run_id = ${w.controlId}::uuid`.execute(su);
  return id;
}
/** The one input.invalidated note a delivery recorded on a package since the mark, by the lifecycle reference it names. */
const noteOn = async (pkg: string, after: Date, ref: string): Promise<PackageEvent> => {
  const notes = (await packageEvents(pkg)).filter((e) => e.event === 'input.invalidated' && e.occurred_at >= after && obj(e.details['lifecycle'])['ref'] === ref);
  expect(notes, `one input.invalidated note on ${pkg} naming ${ref}`).toHaveLength(1);
  return notes[0]!;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { IntelligenceController: Ic } = await import('../../src/intelligence/intelligence.controller.js');
  graph = h.app.get(Gc); intelligence = h.app.get(Ic); scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  b18p = w.prediction as unknown as B18Prediction; b18t = w.twins as unknown as B18Twins; b18d = w.decisions as unknown as B18Decisions;
  su = superDb();
  // THE HUMANS of this file, each with a session of its own: the three ports compare the acting principal (§10; the fixture's twinOwner/operator are the manager's session and never call them).
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b18-tenant-admin', 'TENANT');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b18-forecast-owner');
  runOwner = await h.humanWithSession(['twin_owner', 'simulation_operator'], 'b18-run-owner');
  reviewer = await h.humanWithSession(['domain_analyst'], 'b18-analyst');
  outsider = await h.humanWithSession(['strategy_owner'], 'b18-outsider');
  // THE SUBSCRIPTIONS: the seven kinds, registered by the tenant administrator (the B6 idiom), the domain's worker serving from registration.
  for (const kind of CONSUMER_KINDS) {
    const r = await register(kind);
    subs[kind] = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
    expect(r.served.workerRunning, `${kind}: the domain's queue is served from registration`).toBe(true);
  }
  // THE DRAFT declared before the twin's second version (C13): its options cite the version-1 runs the admission names as the superseded version's.
  P0 = (await c.fullDraft()).pkg;
  // THE TWIN'S VERSION 2: the carried set plus a predicted element citing the forecast (the phase5-corrections F2 idiom), admitted after the mark — S1's TwinStateChanged.
  const o = await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 } }) as { version: { version: number } };
  v2 = o.version.version;
  await w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(v2), { payload: { elements: [{ key: 'context.transits_forecast', kind: 'predicted', value: { horizon: '30d' }, citations: [{ kind: 'forecast', id: w.forecastId }] }] } });
  t0 = await mark();
  const admitted = await w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(v2), { payload: {} }) as { admitted: { completeness: string } };
  expect(admitted.admitted.completeness).toBe('complete');
}, 300_000);

afterAll(async () => {
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
  await su?.destroy();
}, 120_000);

describe('S1 · the seven announced events, each in its transition\'s own transaction (0078 §4; D2–D4, D14, D15, D20; L2-I04, L5-I04, L6-I02, L8-I02, L8-I03, L9-I02, L9-I04)', () => {
  it('S1 (1) · TwinStateChanged/version.admitted from the admit of version 2 — the changed variable, the freshness, the superseded version\'s runs — beside GraphChanged/twin.state_changed and its six deliveries: the twins consumer marks nothing, the decisions consumer notes the draft citing the superseded runs without exposure (C13), retrieval verified', async () => {
    const tsc = await outboxEvent('TwinStateChanged', t0, (p) => p['twin_id'] === w.twinId && p['change'] === 'version.admitted');
    expect(tsc.partition_key).toBe(`tenant:${T()}`);
    expect(tsc.schema_version).toBe('v1');
    expect(tsc.correlation_id).toBe(await twinAdmitCorrelation(w.twinId, v2));
    expect(tsc.payload).toMatchObject({
      schema: 'TwinStateChanged', schema_version: 'v1', twin_id: w.twinId, version: v2, branch_id: 'actual', supersedes: w.v1, forked_from_version: null, change: 'version.admitted', verification_state: 'verified',
      state_set_digest: expect.stringMatching(HEX64), header_digest: expect.stringMatching(HEX64),
      freshness: { known_at: expect.any(String), observed_through: '2024-01-17', completeness: 'complete', missing_keys: [] },
      dependency_impacts: { runs: expect.arrayContaining([expect.objectContaining({ run_id: w.controlId, state: 'completed', validity: 'valid' })]), truncated: false },
      reason: null, caused_by: null, truncated: false, temporal: { known_at: expect.any(String) },
      cause: { action: 'twin.version.admit', actor: w.twinOwner.principalId, target_type: 'TWN', target_id: w.twinId },
    });
    // The changed variables: the carry copied version 1's elements unchanged; the predicted element is the one addition, its forecast citation counted.
    const changed = tsc.payload['changed_variables'] as Row[];
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ key: 'context.transits_forecast', kind: 'predicted', change: 'added', from: null, to: expect.objectContaining({ value: { horizon: '30d' } }), citations: 1 });
    expect(tsc.payload['confidence']).toEqual([]);
    const impacts = obj(tsc.payload['dependency_impacts'])['runs'] as Row[];
    expect(impacts).toHaveLength(4);
    expect(sorted(impacts.map((r) => r['run_id']))).toEqual(sorted(v1Runs()));
    // THE GRAPHCHANGED: exactly one, after the TwinStateChanged in the partition (outboxEvent first, pipeline.service.ts), the same write's correlation.
    const rows = await publishedIn(D(), 'twin.state_changed', t0, w.twinId);
    expect(rows).toHaveLength(1);
    const gc = rows[0]!;
    expect(gc.payload).toMatchObject({
      schema: 'GraphChanged', schema_version: 'v1', change: { kind: 'twin.state_changed', graph_event_id: null, invalidation_id: null, correction_case_id: null },
      identities: [], relationships: { edges: [], resolutions: [], dependencies: [] },
      objects: { twins: [w.twinId], walked: false, truncated: false, forecasts: [], scenarios: [], decisions: [], claims: [], evidence: [], assumptions: [] },
      twin: { twin_id: w.twinId, version: v2, supersedes: w.v1, branch_id: 'actual', change: 'version.admitted', changed_variables: 1, runs_of_superseded: 4 },
      temporal: { known_at: expect.any(String) },
      cause: { action: 'twin.version.admit', actor: w.twinOwner.principalId, target_type: 'TWN', target_id: w.twinId },
    });
    expect(sorted(obj(gc.payload['objects'])['simulations'] as string[])).toEqual(sorted(v1Runs()));
    expect(sorted((gc.payload['subscriptions'] as Row[]).map((s) => s['consumer_kind']))).toEqual(sorted([...GRAPH_KINDS]));
    expect(tsc.partition_seq).toBeLessThan(gc.partition_seq);
    expect(gc.correlation_id).toBe(tsc.correlation_id);
    // THE DELIVERIES: a twin's own admission marks nothing (D3) — both versions stay verified; the draft citing the superseded version's runs is NOTED without exposure (C13); retrieval verified; the rest empty.
    const ds = await sixApplied(gc.id);
    expect(ds['twins']).toMatchObject({ items: [], items_applied: [], attempts: 0 });
    expect(await twinVerification(w.twinId, v2)).toBe('verified');
    expect(await twinVerification(w.twinId, w.v1)).toBe('verified');
    await emptyReach(ds, gc.id, 'twin.state_changed', ['decisions']);
    expect(ds['decisions']).toMatchObject({ items: [P0] });
    expect(ds['decisions']!.items_applied[0]).toMatchObject({ item: P0, effect: 'input.invalidated' });
    const notes = (await packageEvents(P0)).filter((e) => e.event === 'input.invalidated');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.details).toMatchObject({ change_kind: 'twin.state_changed', package_state: 'draft', executed: false, lifecycle: { kind: 'twin.state_changed', twin_id: w.twinId, version: v2, supersedes: w.v1 } });
    expect(notes[0]!.details).not.toHaveProperty('failure_class');
    expect(notes[0]!.details).not.toHaveProperty('disposition');
    expect(String(notes[0]!.details['note'])).toMatch(/has a newer admitted version/);
    expect(notes[0]!.details['via']).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`cites run ${w.controlId}`)), expect.stringMatching(new RegExp(`cites run ${w.rerouteId}`))]));
    expect(await deliveryEvents(gc.id, 'retrieval')).toEqual(['received', 'applying', 'item.applied', 'applied']);
    await settleIn(D());
  }, 300_000);

  it('S1 (2)(3) · SimulationStarted from the opening write and SimulationCompleted from the completing write of a run on version 2: the resolved artefacts, the environment beyond its digest, the stochastic contract, the execution identity; the outputs, the impacts, the reproducibility digests, the SIM object and the resource evidence — on the row too', async () => {
    const t1 = await mark();
    ctlV2 = (await runAs(runOwner)).run.runId;
    rerouteV2 = (await runAs(runOwner, { runKind: 'intervention', controlRunId: ctlV2, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] })).run.runId;
    const row = await runRow(ctlV2);
    expect(row).toMatchObject({ state: 'completed', validity: 'valid', twin_version: v2, run_kind: 'control', control_run_id: null });
    const started = await outboxEvent('SimulationStarted', t1, (p) => p['run_id'] === ctlV2);
    expect(started.partition_key).toBe(`tenant:${T()}`);
    expect(started.schema_version).toBe('v1');
    expect(started.payload).toMatchObject({
      schema: 'SimulationStarted', schema_version: 'v1', run_id: ctlV2, twin: { twin_id: w.twinId, version: v2, branch_id: 'actual' }, run_kind: 'control', control_run_id: null, corrects_run_id: null, scenario: null,
      shock: true, shock_basis: 'hypothetical', component: 'SYN-PART-MAG', state: 'opened',
      model: { ref: 'supply-flow@1', implementation_digest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST },
      environment: { digest: row.environment_digest, node: process.version, platform: process.platform, arch: process.arch },
      stochastic: expect.objectContaining({ mode: 'deterministic' }),
      initial_state_digest: row.initial_state_digest, inputs_digest: row.inputs_digest,
      cutoffs: { known_at: expect.any(String), observed_through: '2024-01-17' },
      execution_identity: expect.objectContaining({ operator: runOwner.principalId, verification_state: 'verified' }),
      temporal: { known_at: expect.any(String) }, cause: { action: 'simulation.run', actor: runOwner.principalId, target_type: 'SIM', target_id: ctlV2 },
    });
    const completed = await outboxEvent('SimulationCompleted', t1, (p) => p['run_id'] === ctlV2);
    expect(completed.schema_version).toBe('v1');
    expect(completed.payload).toMatchObject({
      schema: 'SimulationCompleted', schema_version: 'v1', run_id: ctlV2, state: 'completed', twin: { twin_id: w.twinId, version: v2, branch_id: 'actual' }, run_kind: 'control', control_run_id: null,
      outputs_digest: row.outputs_digest, totals: expect.objectContaining({ line_stop_days: expect.any(Number) }),
      impacts: { compared_to: null, deltas: null },
      uncertainty: expect.objectContaining({ stochastic: expect.objectContaining({ mode: 'deterministic' }) }),
      sensitivity: expect.objectContaining({ outside_envelope: expect.any(Boolean), factors: expect.any(Number) }),
      validation: expect.objectContaining({ validation_status: expect.any(String), outside_envelope: expect.any(Boolean) }),
      reproducibility: { implementation_digest: row.implementation_digest, environment_digest: row.environment_digest, inputs_digest: row.inputs_digest, initial_state_digest: row.initial_state_digest },
      resource_evidence: { elapsed_ms: expect.any(Number), samples_run: 1, process: { node: process.version, platform: process.platform, arch: process.arch }, memory_rss_bytes: expect.any(Number) },
      sim_object: { object_id: ctlV2, version: 1, header_digest: row.header_digest }, failure: null, missing_outputs: null,
      temporal: { known_at: expect.any(String) }, cause: { action: 'simulation.run.complete', actor: runOwner.principalId, target_type: 'SIM', target_id: ctlV2 },
    });
    // The resource evidence is on the row and in the ledger's run.completed — the same block (D15); the two writes in order.
    expect(row.resource).toEqual(completed.payload['resource_evidence']);
    expect(started.partition_seq).toBeLessThan(completed.partition_seq);
    const events = await runEvents(ctlV2);
    expect(events.map((e) => e.event)).toEqual(['run.opened', 'run.completed']);
    expect(events[1]!.details['resource']).toEqual(completed.payload['resource_evidence']);
    expect(started.correlation_id).toBe(events[0]!.correlation_id);
    // The intervention run: its impacts are the deltas against its control.
    const interventionDone = await outboxEvent('SimulationCompleted', t1, (p) => p['run_id'] === rerouteV2);
    expect(interventionDone.payload).toMatchObject({ state: 'completed', run_kind: 'intervention', control_run_id: ctlV2, impacts: { compared_to: ctlV2, deltas: expect.objectContaining({ line_stop_days: expect.any(Number) }) } });
    expect(await outboxCount('SimulationStarted', t1, (p) => p['run_id'] === rerouteV2)).toBe(1);
  }, 300_000);

  it('S1 (4)(5) · DecisionPackageReady from the proposal of a package citing the version-2 runs and the forecast — the options with uncertainty and cited runs, the choice, the dissent, the provenance, the policy, the conditions, the baseline — and DecisionCommitted from its commitment: the approvals, the CMT and what it rests on, the handoff statement, the replay snapshot', async () => {
    const t2 = await mark();
    P = (await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape (B18)', statement: 'whether to reroute the second magnet shipment now, on the version-2 runs', owner: w.owner.principalId })).package.packageId;
    const v = (await c.open(P)).version.version;
    expect(v).toBe(1);
    await c.option(P, 1, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: ctlV2 }] });
    await c.option(P, 1, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: rerouteV2 }, { kind: 'forecast', id: w.forecastId, version: 1 }, { kind: 'evidence', id: w.evd.id, version: w.evd.version }] });
    await c.terms(P, 1, c.validTerms());
    await c.choice(P, 1, c.validChoice());
    const r = await c.propose(P, 1);
    versionDigest1 = r.proposal.versionDigest;
    expect(r.proposal.baselineRunId).toBe(ctlV2);
    const ready = await outboxEvent('DecisionPackageReady', t2, (p) => p['package_id'] === P);
    expect(ready.partition_key).toBe(`tenant:${T()}`);
    expect(ready.schema_version).toBe('v1');
    expect(ready.correlation_id).toBe((await packageEvents(P)).find((e) => e.event === 'version.proposed')!.correlation_id);
    expect(ready.payload).toMatchObject({
      schema: 'DecisionPackageReady', schema_version: 'v1', package_id: P, version: 1, version_digest: versionDigest1, header_digest: expect.stringMatching(HEX64), supersedes: null,
      decision_object_id: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape (B18)', known_at: expect.any(String), observed_through: '2024-01-17',
      objectives: { count: 1, ids: [w.objectiveId] },
      options: expect.arrayContaining([
        expect.objectContaining({ key: 'status-quo', kind: 'status_quo', simulated: true, cited_runs: [ctlV2], cited: 1, uncertainty: expect.objectContaining({ citations: expect.any(Number) }) }),
        expect.objectContaining({ key: 'reroute', kind: 'intervention', simulated: true, cited_runs: [rerouteV2], cited: 3 }),
      ]),
      choice: { option_key: 'reroute', action_owner: w.owner.principalId, decision_deadline: '2024-01-19', outcome_criteria: 1, accepted_trade_offs: 2 },
      dissent: { count: 0, ids: [] },
      provenance: expect.arrayContaining([{ kind: 'run', id: ctlV2, version: 1 }, { kind: 'run', id: rerouteV2, version: 1 }, { kind: 'forecast', id: w.forecastId, version: 1 }, { kind: 'evidence', id: w.evd.id, version: w.evd.version }]),
      approver_policy: { quorum: 1, roles: 0, principals: 1, expires_after_days: 14 },
      monitoring_conditions: expect.objectContaining({ count: 2 }),
      baseline_run_id: ctlV2, synthetic_state: r.proposal.syntheticState, reopened_from: null, truncated: false,
      temporal: { known_at: expect.any(String) }, cause: { action: 'decision.package.propose', actor: w.owner.principalId, target_type: 'DPK', target_id: P },
    });
    expect(ready.payload['options']).toHaveLength(2);
    expect(ready.payload['provenance']).toHaveLength(4);
    // THE COMMITMENT (C3): the approval by the named approver, the commit by the authority.
    const a = await c.approve(P, 1, { decision: 'approve', versionDigest: versionDigest1, rationale: 'The reroute keeps the line running; the premium is acceptable.' });
    approvalId1 = a.approval.approvalId;
    const committed1 = await c.commit(P, 1, versionDigest1, w.authority);
    cm = { commitmentId: committed1.commitment.commitmentId, decidedAt: committed1.commitment.decidedAt };
    const committed = await outboxEvent('DecisionCommitted', t2, (p) => p['package_id'] === P);
    expect(committed.schema_version).toBe('v1');
    expect(committed.correlation_id).toBe((await packageEvents(P)).find((e) => e.event === 'package.committed')!.correlation_id);
    expect(committed.payload).toMatchObject({
      schema: 'DecisionCommitted', schema_version: 'v1', package_id: P, version: 1, version_digest: versionDigest1, commitment_id: cm.commitmentId, committed_by: w.authority.principalId,
      approvals: [{ approval_id: approvalId1, approver: w.approver.principalId }], op_class: 'C3', bound_action: 'decision.commit', policy_decision_id: expect.any(String),
      choice: { option_key: 'reroute', action_owner: w.owner.principalId, decision_deadline: '2024-01-19', outcome_criteria: 1 },
      commitments: [{ strategy_object_id: cm.commitmentId, object_type: 'CMT', rests_on: { decision: w.decisionId, objectives: [w.objectiveId], runs: [rerouteV2], baseline_run_id: ctlV2 } }],
      monitoring_conditions: expect.arrayContaining([expect.objectContaining({ kind: 'indicator', ref: w.indicatorId }), expect.objectContaining({ kind: 'review' })]),
      execution_handoff: { bound_action: 'decision.commit', op_class: 'C3', interface: null, statement: expect.stringMatching(/no execution interface exists/) },
      replay_snapshot: { version_digest: versionDigest1, cmt_header_digest: expect.stringMatching(HEX64), recorded_on_demand: 'decision.replay' },
      reopened_from: null, cause: { action: 'decision.commit', actor: w.authority.principalId, target_type: 'CMT', target_id: cm.commitmentId },
    });
    expect(instantOf(committed.payload['decided_at'])).toBe(instantOf(cm.decidedAt));
    expect(instantOf(obj(committed.payload['replay_snapshot'])['as_of'])).toBe(instantOf(cm.decidedAt));
    expect(instantOf(obj(committed.payload['temporal'])['known_at'])).toBe(instantOf(cm.decidedAt));
    expect(await packageRow(P)).toMatchObject({ state: 'committed', committed_version: 1, reopens: 0, reopened_at: null });
    expect((await commitments(P)).map((x) => [x.version, x.commitment_id])).toEqual([[1, cm.commitmentId]]);
  }, 120_000);

  it('S1 (6) · ReviewRequested from a challenge of a native claim with lineage: the case queued as challenged, routed to the reviewer roles, the run and method of the lineage named', async () => {
    const t3 = await mark();
    const seeded = await seedClaim({ type: 'REL', evidence: w.evd, payload: REL_PAYLOAD });
    const reason = 'the value contradicts the restated terms (harness)';
    const rv = await intelligence.requestReview(h.req(reviewer, 'intelligence.review.request', 'REV', null, 'intelligence'), T(), D(), { payload: { claimObjectId: seeded.claimId, claimVersion: 1, reason } }) as { review: { caseId: string; state: string; reason: string } };
    expect(rv.review).toMatchObject({ state: 'queued', reason: 'challenged' });
    const caseId = rv.review.caseId;
    const ev = await outboxEvent('ReviewRequested', t3, (p) => p['case_id'] === caseId);
    expect(ev.partition_key).toBe(`tenant:${T()}`);
    expect(ev.schema_version).toBe('v1');
    expect(ev.correlation_id).toBe((await reviewEvents(caseId)).find((e) => e.event === 'case.queued')!.correlation_id);
    expect(ev.payload).toMatchObject({
      schema: 'ReviewRequested', schema_version: 'v1', case_id: caseId, claim: { object_id: seeded.claimId, version: 1, type: 'REL' }, run_id: seeded.runId, method_id: seeded.methodId,
      queued_reason: 'challenged', challenge: reason, contradictions: [],
      routed_to: { roles: ['domain_admin', 'extraction_manager'], excluded_principal: null, rule: expect.stringMatching(/may not decide/) },
      decided_by: expect.stringMatching(/decide/), temporal: { known_at: expect.any(String) },
      cause: { action: 'intelligence.review.request', actor: reviewer.principalId, target_type: 'REV', target_id: caseId },
    });
    expect(Number(ev.payload['confidence'])).toBe(0.8);
    expect(await reviewCase(caseId)).toMatchObject({ state: 'queued', queued_reason: 'challenged', run_id: seeded.runId, method_id: seeded.methodId });
  }, 120_000);

  it('S1 (7) · ForecastIssued@v2 from a second issue at another horizon (no supersession): the v1 keys kept, the expiry from the cadence, the distribution, the validation, the lineage; the outbox row\'s schema_version column v2', async () => {
    const t4 = await mark();
    const issued = await issueForecast(forecastOwner, '90d', 'weekly');
    f2 = issued.forecast.forecastId;
    const ev = await outboxEvent('ForecastIssued', t4, (p) => p['forecast_id'] === f2);
    expect(ev.schema_version).toBe('v2');
    expect(ev.partition_key).toBe(`tenant:${T()}`);
    expect(ev.correlation_id).toBe((await forecastEvents(f2)).find((e) => e.event === 'forecast.issued')!.correlation_id);
    const issuedAt = String(ev.payload['issued_at']);
    expect(ev.payload).toMatchObject({
      schema: 'ForecastIssued', schema_version: 'v2', forecast_id: f2, series_key: w.seriesKey, horizon: '90d', method: issued.forecast.method, validation_state: issued.forecast.validationState, label: 'replay demonstration', superseded_forecast_id: null,
      subject_entity_id: null, method_version: expect.any(String), origin_at: expect.any(String), known_at: expect.any(String), target_at: expect.any(String), issued_at: expect.any(String), refresh_cadence: 'weekly',
      expiry: { expires_at: new Date(Date.parse(issuedAt) + 7 * 86_400_000).toISOString(), basis: 'weekly' },
      distribution: expect.objectContaining({ q10: expect.any(Number), q50: expect.any(Number), q90: expect.any(Number) }),
      validation: expect.objectContaining({ state: issued.forecast.validationState, backtest_id: null }),
      calibration: expect.anything(), drivers: expect.objectContaining({ count: expect.any(Number) }),
      lineage: expect.objectContaining({ assumptions: [w.assumptionId], evidence_refs: expect.any(Number) }),
      controls: expect.objectContaining({ synthetic_state: expect.any(Boolean) }),
      temporal: { known_at: expect.any(String) }, cause: { action: 'prediction.forecast.issue', actor: forecastOwner.principalId, target_type: 'FCT', target_id: f2 },
    });
    expect((await forecastRow(w.forecastId)).state).toBe('issued');
    expect(await outboxCount('GraphChanged', t4, (p) => obj(p['change'])['kind'] === 'forecast.superseded')).toBe(0);
  }, 120_000);
});

describe('S2 · the chain end to end (0078 §1–§3; D5–D13, D16, D17; L6-I05, L8-I05, L9-I05)', () => {
  it('S2 (a) · THE WITHDRAWAL by the forecast owner: the row and its dependants, the withdrawn FCT version, the ledger; ForecastWithdrawn then GraphChanged/forecast.withdrawn; the six deliveries — the scenario marked, the package noted material_change/compensation, the twin version unverified and its own TwinStateChanged, retrieval verified, the rest empty', async () => {
    const t5 = await mark();
    const reason = 'the corridor series shifted after issue; the fit no longer holds (harness)';
    const wd = await withdrawForecast(forecastOwner, w.forecastId, { reason, unfitClass: 'data_shift' });
    expect(wd.withdrawal).toMatchObject({ forecastId: w.forecastId, withdrawnVersion: 2, withdrawn: expect.objectContaining({ forecast_id: w.forecastId, horizon: '30d', series_key: w.seriesKey }) });
    // The row: withdrawn with the reason and the unfit class; the dependants the port enumerated — the scenario, the twin version citing it, the two version-2 runs whose snapshot cites it, the committed package whose option cites it; no warning (the fixture raises none).
    const row = await forecastRow(w.forecastId);
    expect(row.state).toBe('withdrawn');
    expect(row.withdrawn_at).not.toBeNull();
    expect(row.withdrawn_by).toBe(forecastOwner.principalId);
    expect(row.withdrawal).not.toBeNull();
    const dependants = obj(row.withdrawal!['dependants']);
    expect(row.withdrawal).toMatchObject({ reason, unfit_class: 'data_shift' });
    expect(dependants).toMatchObject({
      scenarios: [{ scenario_id: w.scenarioId, state: 'active', attention_state: 'none' }], warnings: [],
      twins: [{ twin_id: w.twinId, version: v2, verification_state: 'verified' }],
      simulations: [expect.objectContaining({ run_id: ctlV2, validity: 'valid' }), expect.objectContaining({ run_id: rerouteV2, validity: 'valid' })],
      packages: [{ package_id: P, version: 1, state: 'committed', committed: true, option_keys: ['reroute'] }], truncated: false,
    });
    expect(wd.withdrawal.withdrawn['dependants']).toEqual(dependants);
    // The withdrawn FCT version (D8): the corrections-path header on the prior row, the payload verbatim.
    const objects = await objectRows(w.forecastId);
    expect(objects.map((o) => [o.object_version, o.lifecycle_state])).toEqual([[1, 'active'], [2, 'withdrawn']]);
    expect(objects[1]).toMatchObject({ object_type: 'FCT', truth_state: 'withdrawn', correction_of: `${w.forecastId}@1`, supersedes: `${w.forecastId}@1`, method_ref: 'prediction.forecast.withdraw@1.0.0', accountable_owner: `principal:${forecastOwner.principalId}`, withdrawal_reason: expect.stringMatching(/data_shift/) });
    expect(objects[1]!.payload).toEqual(objects[0]!.payload);
    expect((await forecastEvents(w.forecastId)).map((e) => e.event).slice(-2)).toEqual(['forecast.issued', 'forecast.withdrawn']);
    // THE EVENTS: ForecastWithdrawn from the write, then GraphChanged/forecast.withdrawn (the typed block) in the same partition and correlation.
    const fw = await outboxEvent('ForecastWithdrawn', t5, (p) => p['forecast_id'] === w.forecastId);
    expect(fw.schema_version).toBe('v1');
    expect(fw.correlation_id).toBe((await forecastEvents(w.forecastId)).find((e) => e.event === 'forecast.withdrawn')!.correlation_id);
    expect(fw.payload).toMatchObject({
      schema: 'ForecastWithdrawn', schema_version: 'v1', forecast_id: w.forecastId, series_key: w.seriesKey, horizon: '30d', subject_entity_id: null, reason, unfit_class: 'data_shift', withdrawn_at: expect.any(String), withdrawn_version: 2,
      prior: expect.objectContaining({ label: 'replay demonstration', validation_state: expect.any(String), quantiles: expect.anything() }), dependants,
      temporal: { known_at: expect.any(String) }, cause: { action: 'prediction.forecast.withdraw', actor: forecastOwner.principalId, target_type: 'FCT', target_id: w.forecastId },
    });
    const gws = await publishedIn(D(), 'forecast.withdrawn', t5, w.forecastId);
    expect(gws).toHaveLength(1);
    const gw = gws[0]!;
    expect(gw.payload).toMatchObject({
      change: { kind: 'forecast.withdrawn' }, identities: [], objects: { forecasts: [w.forecastId], walked: true },
      forecast: { forecast_id: w.forecastId, series_key: w.seriesKey, horizon: '30d', reason, unfit_class: 'data_shift', withdrawn_at: expect.any(String), dependants },
      cause: { action: 'prediction.forecast.withdraw', actor: forecastOwner.principalId, target_type: 'FCT', target_id: w.forecastId },
    });
    expect(sorted((gw.payload['subscriptions'] as Row[]).map((s) => s['consumer_kind']))).toEqual(sorted([...GRAPH_KINDS]));
    expect(fw.partition_seq).toBeLessThan(gw.partition_seq);
    expect(gw.correlation_id).toBe(fw.correlation_id);
    // THE DELIVERIES.
    const ds = await sixApplied(gw.id);
    expect(ds['scenarios']).toMatchObject({ items: [w.scenarioId] });
    expect(ds['scenarios']!.items_applied[0]).toMatchObject({ item: w.scenarioId, effect: 'scenario.attention' });
    expect((await scenarioRow(w.scenarioId))!.attention_state).toBe('input_unverified');
    expect(ds['decisions']).toMatchObject({ items: [P] });
    expect(ds['decisions']!.items_applied[0]).toMatchObject({ item: P, effect: 'input.invalidated' });
    const note = await noteOn(P, t5, w.forecastId);
    expect(note.details).toMatchObject({ change_kind: 'forecast.withdrawn', package_state: 'committed', executed: true, failure_class: 'material_change', disposition: 'compensation', lifecycle: { kind: 'forecast.withdrawn', ref: w.forecastId, unfit_class: 'data_shift', reason }, via: [`option reroute cites forecast ${w.forecastId}`] });
    expect(String(note.details['note'])).toMatch(/WITHDRAWN as unfit \(data_shift\).*categorical loss/);
    NOTE_ID = note.event_id;
    expect(ds['twins']).toMatchObject({ items: [`${w.twinId}@${v2}`] });
    expect(ds['twins']!.items_applied[0]).toMatchObject({ item: `${w.twinId}@${v2}`, effect: 'version.unverified' });
    expect(await twinVerification(w.twinId, v2)).toBe('unverified');
    expect(await twinVerification(w.twinId, w.v1)).toBe('verified');
    expect(ds['forecasts']).toMatchObject({ items: [] });
    expect(ds['memory-mappings']).toMatchObject({ items: [] });
    expect(ds['retrieval']!.items_applied[0]!.effect).toBe('projections.verified');
    expect((await retrievalChecks(gw.id))[0]).toMatchObject({ mismatched: 0, touched: { change_kind: 'forecast.withdrawn' } });
    // THE MARK ANNOUNCED (D4): TwinStateChanged/version.unverified from the twins consumer's item — bound to the delivery by caused_by and by the correlation of the ledger row the same transaction wrote (C16).
    const tu = await outboxEvent('TwinStateChanged', t5, (p) => p['change'] === 'version.unverified' && p['twin_id'] === w.twinId);
    expect(tu.payload).toMatchObject({
      schema: 'TwinStateChanged', schema_version: 'v1', twin_id: w.twinId, version: v2, branch_id: 'actual', supersedes: w.v1, change: 'version.unverified', verification_state: 'unverified', changed_variables: [], dependency_impacts: null,
      freshness: { observed_through: '2024-01-17', completeness: 'complete', missing_keys: [] }, reason: expect.stringMatching(/forecast\.withdrawn/),
      caused_by: { outbox_event_id: gw.id, change_kind: 'forecast.withdrawn' }, cause: { action: 'twin.subscription.apply', actor: subs['twins']!.principalId, target_type: 'TWN', target_id: w.twinId },
    });
    expect(tu.created_at.getTime()).toBeGreaterThanOrEqual(t5.getTime());
    const marks = await twinUnverifiedEvents(w.twinId, v2);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.details).toMatchObject({ outbox_event_id: gw.id, automatic: true });
    expect(tu.correlation_id).toBe(marks[0]!.correlation_id);
    expect(await outboxCount('TwinStateChanged', t5, (p) => p['change'] === 'version.unverified' && p['twin_id'] === w.twinId)).toBe(1);
    const aud = await applyActionsSince(t5);
    expect(new Set(aud.map((x) => x.action))).toEqual(new Set(['twin.subscription.apply', 'prediction.forecast.subscription.apply', 'prediction.scenario.subscription.apply', 'decision.subscription.apply', 'graph.retrieval.subscription.apply', 'graph.mapping.subscription.apply']));
    await settleIn(D());
  }, 300_000);

  it('S2 (b) · THE AUTOMATIC INVALIDATION: the negative first (C2 — the pinned implementation flipped: unreproducible, the invalidation WITHHELD, the run valid, no event); then the reroute run\'s reproduction unreproducible on the withdrawn forecast → invalidated in the same write (validity, the withdrawn SIM version, the dependants), SimulationInvalidated and GraphChanged/simulation.invalidated, the package noted again; a second reproduction records the verdict only', async () => {
    const t6 = await mark();
    // THE NEGATIVE (C2): an unreproducible verdict whose cause is not the run's unfitness never invalidates — a deploy is not a withdrawal.
    await sql`update twin.behaviour_models set implementation_digest = ${'d'.repeat(64)} where method_ref = 'supply-flow@1'`.execute(su);
    try {
      const neg = await reproduce(runOwner, ctlV2);
      expect(neg.reproduction.verdict).toBe('unreproducible');
      expect(neg.reproduction.reason).toMatch(/no longer the one the run recorded/);
      expect(neg.reproduction.invalidation).toBeNull();
      expect(neg.reproduction.invalidation_withheld).toBe('implementation');
    } finally {
      await sql`update twin.behaviour_models set implementation_digest = ${SUPPLY_FLOW_IMPLEMENTATION_DIGEST} where method_ref = 'supply-flow@1'`.execute(su);
    }
    expect((await runRow(ctlV2)).validity).toBe('valid');
    expect((await runEvents(ctlV2)).map((e) => e.event)).toEqual(['run.opened', 'run.completed', 'run.reproduced']);
    expect(await outboxCount('SimulationInvalidated', t6, (p) => p['run_id'] === ctlV2)).toBe(0);
    // THE POSITIVE: the reroute run's snapshot cites the forecast; its latest version is withdrawn — a lifecycle cause, so the verdict invalidates the run in the reproduce write (D6).
    const rp = await reproduce(runOwner, rerouteV2);
    expect(rp.reproduction.verdict).toBe('unreproducible');
    expect(rp.reproduction.reason).toMatch(/withdrawn|no longer available|not available/i);
    expect(rp.reproduction.unavailable).toEqual(expect.arrayContaining([expect.stringMatching(/forecast .* withdrawn at version 2/)]));
    expect(rp.reproduction.invalidation).toMatchObject({ invalidated_at: expect.any(String), withdrawn_version: 2, cause: 'lifecycle',
      named: [{ key: 'context.transits_forecast', kind: 'forecast', id: w.forecastId, version: 1, cause: 'lifecycle', state: 'withdrawn', by_version: 2, text: expect.stringMatching(/forecast .* withdrawn at version 2/) }] });
    expect(rp.reproduction.invalidation_withheld ?? null).toBeNull();
    const reproductions = await reproductionsOf(rerouteV2);
    expect(reproductions).toHaveLength(1);
    const reproductionId = reproductions[0]!.reproduction_id;
    const run = await runRow(rerouteV2);
    expect(run).toMatchObject({ state: 'completed', validity: 'invalidated', invalidated_by: runOwner.principalId });
    expect(run.invalidated_at).not.toBeNull();
    expect(run.invalidation).toMatchObject({ trigger: 'reproduction', trigger_ref: reproductionId, reason: expect.stringMatching(/^unreproducible: /),
      dependants: { packages: [{ package_id: P, version: 1, state: 'committed', committed: true, option_keys: ['reroute'] }], commitments: [cm.commitmentId], decisions: [w.decisionId], twins: [], simulations: [] } });
    expect((await runEvents(rerouteV2)).map((e) => e.event).slice(-2)).toEqual(['run.reproduced', 'run.invalidated']);
    const objects = await objectRows(rerouteV2);
    expect(objects.map((o) => [o.object_version, o.lifecycle_state])).toEqual([[1, 'active'], [2, 'withdrawn']]);
    expect(objects[1]).toMatchObject({ object_type: 'SIM', truth_state: 'withdrawn', correction_of: `${rerouteV2}@1`, method_ref: 'simulation.run.invalidate@1.0.0', withdrawal_reason: expect.stringMatching(/^reproduction: unreproducible/) });
    expect(objects[1]!.payload).toEqual(objects[0]!.payload);
    // THE EVENTS: SimulationInvalidated under the reproduce action, then GraphChanged/simulation.invalidated (the typed block).
    const si = await outboxEvent('SimulationInvalidated', t6, (p) => p['run_id'] === rerouteV2);
    expect(si.schema_version).toBe('v1');
    expect(si.correlation_id).toBe((await runEvents(rerouteV2)).find((e) => e.event === 'run.invalidated')!.correlation_id);
    expect(si.payload).toMatchObject({
      schema: 'SimulationInvalidated', schema_version: 'v1', run_id: rerouteV2, trigger: 'reproduction', trigger_ref: reproductionId, invalidated_at: expect.any(String), withdrawn_version: 2, reason: expect.stringMatching(/^unreproducible: /),
      run: expect.objectContaining({ twin_id: w.twinId, twin_version: v2, run_kind: 'intervention', control_run_id: ctlV2, outputs_digest: run.outputs_digest, operator_principal_id: runOwner.principalId }),
      dependants: { packages: [expect.objectContaining({ package_id: P })], commitments: [cm.commitmentId], decisions: [w.decisionId], twins: [], simulations: [] },
      temporal: { known_at: expect.any(String) }, cause: { action: 'simulation.reproduce', actor: runOwner.principalId, target_type: 'SIM', target_id: rerouteV2 },
    });
    const gis = await publishedIn(D(), 'simulation.invalidated', t6, rerouteV2);
    expect(gis).toHaveLength(1);
    const gi = gis[0]!;
    expect(gi.payload).toMatchObject({ change: { kind: 'simulation.invalidated' }, identities: [], objects: { simulations: [rerouteV2], walked: true }, simulation: { run_id: rerouteV2, trigger: 'reproduction', trigger_ref: reproductionId, dependants: run.invalidation!['dependants'] }, cause: { action: 'simulation.reproduce', actor: runOwner.principalId, target_type: 'SIM', target_id: rerouteV2 } });
    expect(si.partition_seq).toBeLessThan(gi.partition_seq);
    const ds = await sixApplied(gi.id);
    await emptyReach(ds, gi.id, 'simulation.invalidated', ['decisions']);
    expect(ds['decisions']).toMatchObject({ items: [P] });
    const note = await noteOn(P, t6, rerouteV2);
    expect(note.details).toMatchObject({ change_kind: 'simulation.invalidated', executed: true, failure_class: 'material_change', disposition: 'compensation', lifecycle: { kind: 'simulation.invalidated', ref: rerouteV2, trigger: 'reproduction' }, via: [`option reroute cites run ${rerouteV2}`] });
    expect(String(note.details['note'])).toMatch(/INVALIDATED \(reproduction\)/);
    // A SECOND unreproducible verdict on the invalidated run records the reproduction and invalidates nothing more.
    const again = await reproduce(runOwner, rerouteV2);
    expect(again.reproduction.verdict).toBe('unreproducible');
    expect(again.reproduction.invalidation).toBeNull();
    expect((await reproductionsOf(rerouteV2)).map((r) => r.verdict)).toEqual(['unreproducible', 'unreproducible']);
    expect(await outboxCount('SimulationInvalidated', t6, (p) => p['run_id'] === rerouteV2)).toBe(1);
    expect((await runEvents(rerouteV2)).filter((e) => e.event === 'run.invalidated')).toHaveLength(1);
    expect((await runRow(rerouteV2)).invalidated_at).toEqual(run.invalidated_at);
    await settleIn(D());
  }, 300_000);

  it('S2 (c) · THE OPERATOR\'S INVALIDATION of the second control (cited by nothing): validity invalidated with trigger operator, the withdrawn SIM version, SimulationInvalidated under the invalidate action, the empty reach', async () => {
    const t7 = await mark();
    const reason = 'the control was run on a version whose corridor element is now known to be misgrounded (harness)';
    const iv = await invalidateRun(runOwner, w.control2Id, reason);
    expect(iv.invalidation).toMatchObject({ runId: w.control2Id, withdrawnVersion: 2, invalidated: expect.objectContaining({ run_id: w.control2Id, trigger: 'operator', trigger_ref: null }) });
    const run = await runRow(w.control2Id);
    expect(run).toMatchObject({ state: 'completed', validity: 'invalidated', invalidated_by: runOwner.principalId, invalidation: { reason, trigger: 'operator', trigger_ref: null, dependants: { packages: [], commitments: [], decisions: [], twins: [], simulations: [] } } });
    expect((await runEvents(w.control2Id)).map((e) => e.event)).toEqual(['run.opened', 'run.completed', 'run.invalidated']);
    const objects = await objectRows(w.control2Id);
    expect(objects.map((o) => [o.object_version, o.lifecycle_state])).toEqual([[1, 'active'], [2, 'withdrawn']]);
    expect(objects[1]).toMatchObject({ method_ref: 'simulation.run.invalidate@1.0.0', withdrawal_reason: `operator: ${reason}` });
    const si = await outboxEvent('SimulationInvalidated', t7, (p) => p['run_id'] === w.control2Id);
    expect(si.payload).toMatchObject({ schema: 'SimulationInvalidated', schema_version: 'v1', run_id: w.control2Id, trigger: 'operator', trigger_ref: null, withdrawn_version: 2, reason, cause: { action: 'simulation.run.invalidate', actor: runOwner.principalId, target_type: 'SIM', target_id: w.control2Id } });
    const gis = await publishedIn(D(), 'simulation.invalidated', t7, w.control2Id);
    expect(gis).toHaveLength(1);
    expect(gis[0]!.payload).toMatchObject({ objects: { simulations: [w.control2Id], walked: true }, simulation: { run_id: w.control2Id, trigger: 'operator', trigger_ref: null, reason }, cause: { action: 'simulation.run.invalidate', actor: runOwner.principalId } });
    const ds = await sixApplied(gis[0]!.id);
    await emptyReach(ds, gis[0]!.id, 'simulation.invalidated');
    await settleIn(D());
  }, 300_000);

  it('S2 (d) · THE REOPEN on the recorded note: state reopened, the commitment, the approval and the committed version untouched, both options dropped and named (C12), the two ledger rows (C17), DecisionReopened; the second cycle to a SECOND commitment (C1); the replay of version 1 at the first commitment\'s instant, of version 2 at the second (D13)', async () => {
    const t8 = await mark();
    const before = (await commitments(P))[0]!;
    const ro = await reopen(w.owner, P, { cause: { kind: 'input_invalidated', ref: NOTE_ID } });
    expect(ro.reopened).toMatchObject({
      package_id: P, committed_version: 1, commitment_id: cm.commitmentId, new_version: 2, options_carried: [], reopens: 1, reopened_at: expect.any(String), known_at: expect.any(String),
      cause: expect.objectContaining({ kind: 'input_invalidated', ref: NOTE_ID, change_kind: 'forecast.withdrawn', failure_class: 'material_change', disposition: 'compensation' }),
      exposed_inputs: expect.arrayContaining([expect.stringMatching(/cites forecast/)]),
    });
    expect(instantOf(ro.reopened['committed_at'])).toBe(instantOf(before.committed_at));
    // Both committed options are DROPPED and NAMED with the port's reason: the reroute run invalidated (or resting on the withdrawn forecast — the SIM branch names the first it finds), the status-quo run resting on the withdrawn forecast (C12).
    const dropped = ro.reopened['options_dropped'] as Array<{ key: string; reason: string }>;
    expect(dropped.map((d) => d.key).sort()).toEqual(['reroute', 'status-quo']);
    expect(dropped.find((d) => d.key === 'reroute')!.reason).toMatch(/run .* was invalidated at .* \(reproduction|run .* rests on a forecast withdrawn as unfit/);
    expect(dropped.find((d) => d.key === 'status-quo')!.reason).toMatch(/run .* rests on a forecast withdrawn as unfit; a consequence cannot rest on it until the run is re-issued on a live forecast/);
    expect(await packageRow(P)).toMatchObject({ state: 'reopened', committed_version: 1, current_version: 2, reopened_from_version: 1, reopened_by: w.owner.principalId, reopens: 1, reopen_cause: expect.objectContaining({ kind: 'input_invalidated', ref: NOTE_ID }) });
    expect(await versionsOf(P)).toEqual([{ version: 1, state: 'committed', supersedes: null }, { version: 2, state: 'draft', supersedes: 1 }]);
    expect((await commitments(P)).map((x) => [x.version, x.commitment_id])).toEqual([[1, cm.commitmentId]]);
    expect(await approvals(P)).toEqual([{ approval_id: approvalId1, version: 1, decision: 'approve', revoked_at: null }]);
    const events = await packageEvents(P);
    const lastTwo = events.slice(-2);
    expect(lastTwo.map((e) => e.event)).toEqual(expect.arrayContaining(['version.opened', 'package.reopened']));
    expect(lastTwo.find((e) => e.event === 'version.opened')!.details).toMatchObject({ version: 2, supersedes: 1, carried_from: 1, reopened: true });
    expect(lastTwo.find((e) => e.event === 'package.reopened')!.details).toMatchObject({ committed_version: 1, commitment_id: cm.commitmentId, new_version: 2, options_carried: [], reopens: 1 });
    const dr = await outboxEvent('DecisionReopened', t8, (p) => p['package_id'] === P);
    expect(dr.schema_version).toBe('v1');
    expect(dr.correlation_id).toBe(lastTwo.find((e) => e.event === 'package.reopened')!.correlation_id);
    expect(dr.payload).toMatchObject({
      schema: 'DecisionReopened', schema_version: 'v1', package_id: P, decision_object_id: w.decisionId, committed_version: 1, commitment_id: cm.commitmentId, new_version: 2,
      recorded_cause: expect.objectContaining({ kind: 'input_invalidated', ref: NOTE_ID, change_kind: 'forecast.withdrawn', failure_class: 'material_change' }),
      options_carried: [], options_dropped: expect.arrayContaining([expect.objectContaining({ key: 'reroute' }), expect.objectContaining({ key: 'status-quo' })]), reopens: 1,
      temporal: { known_at: expect.any(String) }, cause: { action: 'decision.package.reopen', actor: w.owner.principalId, target_type: 'DPK', target_id: P },
    });
    expect(dr.payload['options_dropped']).toHaveLength(2);
    // THE SECOND CYCLE: a fresh status-quo on the version-1 control (it cites no forecast), an unsimulated option, the choice, the proposal, the approval, the SECOND commitment.
    await c.option(P, 2, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    await c.option(P, 2, { key: 'wait', title: 'Wait for a re-simulation', kind: 'intervention', consequences: [{ kind: 'assumption', id: w.assumptionId }], unsimulatedReason: 'the reroute run was invalidated; a re-simulation on a re-issued forecast is pending' });
    await c.choice(P, 2, c.validChoice({ option_key: 'status-quo', rationale: 'With the reroute simulation invalidated, the status quo stands until the corridor is re-forecast.' }));
    const r2 = await c.propose(P, 2);
    const ready2 = await outboxEvent('DecisionPackageReady', t8, (p) => p['package_id'] === P && p['version'] === 2);
    expect(ready2.payload).toMatchObject({ package_id: P, version: 2, version_digest: r2.proposal.versionDigest, supersedes: 1, reopened_from: { version: 1, commitment_id: cm.commitmentId }, baseline_run_id: w.controlId, choice: expect.objectContaining({ option_key: 'status-quo' }),
      options: expect.arrayContaining([expect.objectContaining({ key: 'status-quo', simulated: true, cited_runs: [w.controlId] }), expect.objectContaining({ key: 'wait', simulated: false, cited_runs: [] })]) });
    expect(ready2.payload['options']).toHaveLength(2);
    expect(await packageRow(P)).toMatchObject({ state: 'proposed', committed_version: 1, current_version: 2 });
    const a2 = await c.approve(P, 2, { decision: 'approve', versionDigest: r2.proposal.versionDigest, rationale: 'The status quo stands until the corridor is re-forecast; the premium is not spent on an invalidated result.' });
    expect(a2.approval.state).toBe('approved');
    const committed2 = await c.commit(P, 2, r2.proposal.versionDigest, w.authority);
    cm2 = { commitmentId: committed2.commitment.commitmentId, decidedAt: committed2.commitment.decidedAt };
    expect(cm2.commitmentId).not.toBe(cm.commitmentId);
    const dc2 = await outboxEvent('DecisionCommitted', t8, (p) => p['package_id'] === P && p['version'] === 2);
    expect(dc2.payload).toMatchObject({ package_id: P, version: 2, commitment_id: cm2.commitmentId, committed_by: w.authority.principalId, approvals: [{ approval_id: a2.approval.approvalId, approver: w.approver.principalId }],
      commitments: [{ strategy_object_id: cm2.commitmentId, object_type: 'CMT', rests_on: { decision: w.decisionId, runs: [w.controlId], baseline_run_id: w.controlId } }],
      reopened_from: expect.objectContaining({ version: 1, reopens: 1 }), cause: { action: 'decision.commit', actor: w.authority.principalId, target_type: 'CMT', target_id: cm2.commitmentId } });
    const pkg = await packageRow(P);
    expect(pkg).toMatchObject({ state: 'committed', committed_version: 2, current_version: 2, reopened_from_version: 1, reopens: 1 });
    expect(instantOf(pkg.decided_at)).toBe(instantOf(cm2.decidedAt));
    // ONE commitment per COMMITTED VERSION (C1): two rows, the first byte for byte as before; the get route's standing commitment is the second, the list both.
    const rows = await commitments(P);
    expect(rows.map((x) => [x.version, x.commitment_id])).toEqual([[1, cm.commitmentId], [2, cm2.commitmentId]]);
    expect(rows[0]).toEqual(before);
    expect(rows[1]).toMatchObject({ committed_by: w.authority.principalId, version_digest: r2.proposal.versionDigest, op_class: 'C3', bound_action: 'decision.commit' });
    const got = (await c.get(P)).package as Row & { commitment: Row | null; commitments?: Row[] };
    expect(got.commitment?.['commitment_id']).toBe(cm2.commitmentId);
    expect(got.commitments).toHaveLength(2);
    expect((got.commitments ?? []).map((x) => x['commitment_id'])).toEqual([cm.commitmentId, cm2.commitmentId]);
    expect(await versionsOf(P)).toEqual([{ version: 1, state: 'committed', supersedes: null }, { version: 2, state: 'committed', supersedes: 1 }]);
    expect((await approvals(P)).map((x) => [x.version, x.decision, x.revoked_at])).toEqual([[1, 'approve', null], [2, 'approve', null]]);
    // THE REPLAY (D13, C3): each committed version's decided layer closes at ITS commitment's instant — the earlier decision is history, never rewritten.
    const rp1 = await c.replay(P, 1, {});
    expect(rp1.replay.cutoffs['decided_at']).toBe(rows[0]!.committed_at_iso);
    expect(instantOf(rp1.replay.cutoffs['decided_at'])).toBe(instantOf(cm.decidedAt));
    const rp2 = await c.replay(P, 2, {});
    expect(rp2.replay.cutoffs['decided_at']).toBe(rows[1]!.committed_at_iso);
    expect(instantOf(rp2.replay.cutoffs['decided_at'])).toBe(instantOf(cm2.decidedAt));
    expect(rp1.replay.cutoffs['decided_at']).not.toBe(rp2.replay.cutoffs['decided_at']);
    await settleIn(D());
  }, 300_000);
});

describe('S3 · the refusals, by family and status (0078 §1–§3, §3.3; D5, D10, D11, D12; C5, C8, C9, C12, N-d)', () => {
  it('S3 (a) · the withdrawal: twice, a superseded forecast (the successor is the live one), unknown, a short reason, the wrong principal', async () => {
    await refused(withdrawForecast(forecastOwner, w.forecastId), /^forecast withdrawal rejected: forecast .* is withdrawn/, 409);
    expect((await objectRows(w.forecastId)).map((o) => o.object_version)).toEqual([1, 2]); // the extra withdrawn version rolled back with the refusal
    const t9 = await mark();
    const f3 = (await issueForecast(forecastOwner, '90d', 'weekly')).forecast.forecastId;
    expect((await forecastRow(f2)).state).toBe('superseded');
    await refused(withdrawForecast(forecastOwner, f2), /^forecast withdrawal rejected: forecast .* is superseded by .*; the successor is the live one/, 409);
    await refused(withdrawForecast(forecastOwner, uuidv7()), /no authorized forecast matches|no such forecast/, 404);
    expect(await status(withdrawForecast(forecastOwner, f3, { reason: 'bad', unfitClass: 'data_shift' }))).toBe(422);
    expect(await status(withdrawForecast(forecastOwner, f3, { reason: 'the class is not one the port names (harness)', unfitClass: 'gut_feeling' }))).toBe(422);
    expect(await status(withdrawForecast(outsider, f3))).toBe(403);
    expect((await forecastRow(f3)).state).toBe('issued');
    // N-d: a scenario is not declared on a withdrawn forecast — a tree the service admits (the fixture's baseline branch), refused by the port's guard.
    await refused(w.prediction.declareScenario(h.req(w.twinOwner, 'prediction.scenario.declare', 'SCN', null), T(), D(), { payload: { title: 'On a withdrawn forecast (harness)', statement: 'the corridor stays open, or collapses (harness)', forecastId: w.forecastId, owner: w.twinOwner.principalId, reviewCadence: 'weekly',
      branches: [{ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: w.twinOwner.principalId, consequence: 'keep the booked routing (harness)', responseWindowHours: 72 }] } }), /^scenario rejected: forecast .* was withdrawn as unfit/, 409);
    // The supersession of f2 by f3 published GraphChanged/forecast.superseded to the consumers (0065): nothing rests on f2; the queue settles before the next case.
    const sup = await publishedIn(D(), 'forecast.superseded', t9, f3);
    expect(sup).toHaveLength(1);
    await sixApplied(sup[0]!.id);
    await settleIn(D());
  }, 300_000);

  it('S3 (b) · the invalidation: an opened and a failed run (no result to withdraw), already invalidated, unknown, the wrong principal', async () => {
    const opened = await plantRun('opened');
    await refused(invalidateRun(runOwner, opened), /^run invalidation rejected: run .* is opened, not completed/, 409);
    const failed = await plantRun('failed');
    await refused(invalidateRun(runOwner, failed), /^run invalidation rejected: run .* is failed, not completed/, 409);
    await refused(invalidateRun(runOwner, rerouteV2), /is already invalidated/, 409);
    await refused(invalidateRun(runOwner, uuidv7()), /no authorized run matches|no such run/, 404);
    expect(await status(invalidateRun(runOwner, w.controlId, 'short'))).toBe(422);
    expect(await status(invalidateRun(outsider, w.controlId))).toBe(403);
    expect((await runRow(w.controlId)).validity).toBe('valid');
    for (const id of [opened, failed]) expect((await runRow(id)).validity).toBe('valid');
  }, 120_000);

  it('S3 (c) · the citation gate: an invalidated run and a withdrawn forecast refused at set_option by the port (the exact version) and by the service (the version-less citation — C5); a valid run resting on a withdrawn forecast refused (C12); the committed version\'s rows seeded outside the port refused at the proposal', async () => {
    const Q = (await c.declare({ decisionObjectId: w.decisionId, title: 'A fresh package on stale inputs (B18 harness)', statement: 'every option cites something the chain made unfit', owner: w.owner.principalId })).package.packageId;
    const v = (await c.open(Q)).version.version;
    await c.option(Q, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    // The port's texts (derive_option), reached with the EXACT version: the cited SIM@1 / FCT@1 rows are active — the row's validity and the forecast's state refuse.
    expect(await message(c.option(Q, v, { key: 'bad-operator', title: 'Cites the operator-invalidated control', kind: 'intervention', consequences: [{ kind: 'run', id: w.control2Id, version: 1 }] }))).toMatch(/^option rejected: run .* was invalidated at .* \(operator: .*\); a consequence cannot rest on an invalidated result/);
    expect(await message(c.option(Q, v, { key: 'bad-reproduction', title: 'Cites the reproduction-invalidated reroute', kind: 'intervention', consequences: [{ kind: 'run', id: rerouteV2, version: 1 }] }))).toMatch(/^option rejected: run .* (was invalidated at .* \(reproduction: |rests on a forecast withdrawn as unfit)/);
    expect(await message(c.option(Q, v, { key: 'bad-forecast', title: 'Cites the withdrawn forecast', kind: 'intervention', consequences: [{ kind: 'run', id: w.controlId }, { kind: 'forecast', id: w.forecastId, version: 1 }] }))).toMatch(/^option rejected: forecast .* was withdrawn as unfit \(data_shift: .*\); a consequence cannot rest on it/);
    // C12: a VALID run whose snapshot cites the withdrawn forecast is not decision-citable either.
    expect((await runRow(ctlV2)).validity).toBe('valid');
    expect(await message(c.option(Q, v, { key: 'bad-rests', title: 'Cites the version-2 control', kind: 'status_quo', consequences: [{ kind: 'run', id: ctlV2 }] }))).toMatch(/^option rejected: run .* rests on a forecast withdrawn as unfit; a consequence cannot rest on it until the run is re-issued on a live forecast/);
    // The service's gate (C5): a version-less citation resolves to the LATEST canonical version — the withdrawn one — and is refused before the port.
    await refused(c.option(Q, v, { key: 'bad-latest-run', title: 'Cites the invalidated run without a version', kind: 'intervention', consequences: [{ kind: 'run', id: rerouteV2 }] }), /run .*@2 is withdrawn; a consequence cannot rest on it/, 422);
    await refused(c.option(Q, v, { key: 'bad-latest-forecast', title: 'Cites the withdrawn forecast without a version', kind: 'intervention', consequences: [{ kind: 'run', id: w.controlId }, { kind: 'forecast', id: w.forecastId }] }), /forecast .*@2 is withdrawn; a consequence cannot rest on it/, 422);
    // The proposal revalidates every row, whatever wrote it (the phase6-residual-corrections idiom): a second draft holding the COMMITTED
    // version's two rows — P's status-quo on ctlV2 and reroute on rerouteV2, copied onto it outside the port — rests on ONE baseline (ctlV2),
    // so the service's own baseline check passes and the port's gate is reached: propose_version re-derives in key order and names the
    // first — reroute, the invalidated run (the status-quo behind it rests on the withdrawn forecast, C12). Q's own status-quo rests on the
    // version-1 control, so a row on the version-2 baseline seeded beside it would be refused by the service's check before any port.
    const Q2 = (await c.declare({ decisionObjectId: w.decisionId, title: 'The committed rows re-drafted (B18 harness)', statement: 'a draft that holds the rows the chain made unfit', owner: w.owner.principalId })).package.packageId;
    const vq2 = (await c.open(Q2)).version.version;
    const committedRows = (await sql<Row>`select * from decision.options where package_id = ${P}::uuid and version = 1 order by key`.execute(su)).rows;
    expect(committedRows.map((o) => o['key'])).toEqual(['reroute', 'status-quo']);
    for (const good of committedRows) {
      await sql`insert into decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason, uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
        values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${Q2}::uuid, ${vq2}, ${String(good['key'])}, ${`${String(good['title'])} (seeded)`}, ${String(good['kind'])}, ${JSON.stringify(good['consequences'])}::jsonb, true, null,
                ${JSON.stringify(good['uncertainty'])}::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null, ${good['synthetic_state'] === true}, ${JSON.stringify(good['controls'])}::jsonb, ${w.owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    }
    await c.terms(Q2, vq2, c.validTerms());
    await c.choice(Q2, vq2, c.validChoice({ option_key: 'status-quo', rationale: 'The status quo is what the committed version compared against.' }));
    expect(await message(c.propose(Q2, vq2))).toMatch(/^proposal rejected: option reroute: run .* was invalidated at .* \(reproduction: unreproducible: .*\); a consequence cannot rest on an invalidated result/);
    expect((await packageRow(Q2)).state).toBe('draft');
    expect((await objectRows(Q2)).length, 'the DPK admitted before the port rolled back with the refusal').toBe(0);
    // The reopen of a DRAFT is refused (Q stands as the draft the next case needs).
    await refused(reopen(w.owner, Q, { cause: { kind: 'input_invalidated', ref: NOTE_ID } }), /^reopen rejected: package .* is draft, not committed/, 409);
  }, 120_000);

  it('S3 (d) · the reopen: no cause, another package\'s note, a note recorded before the commitment, the wrong principals, a second reopen while the draft is open; reopened, the package still hears of its inputs (C8); the withdrawal of a package whose commitment stands — reopened, and proposed after a reopen (C9); the second commit over a standing commitment', async () => {
    // Two committed packages on the fixture's version-1 runs, BEFORE the reroute run they cite is invalidated (a version-less citation of an invalidated run is refused by the service): R hears of its inputs while reopened (C8); R2 is proposed after its reopen (C9's second branch).
    const R = await c.committed();
    const R2 = await c.committed();
    expect(await status(reopen(w.owner, R.pkg, {}))).toBe(422);
    expect(await status(reopen(w.owner, R.pkg, { cause: { kind: 'policy_changed', ref: NOTE_ID } }))).toBe(422);
    await refused(reopen(w.owner, R.pkg, { cause: { kind: 'input_invalidated', ref: NOTE_ID } }), /^reopen rejected: no such note .* on package/, 404);
    // A note recorded BEFORE the commitment is not a cause: planted a minute before R's commitment (no delivery can record one before the commit by construction).
    const early = uuidv7();
    await sql`insert into decision.package_events (event_id, scope, tenant_id, domain_id, package_id, event, actor_principal_id, details, occurred_at, correlation_id)
      values (${early}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${R.pkg}::uuid, 'input.invalidated', ${w.owner.principalId}::uuid, '{"note": "harness: a note planted before the commitment", "change_kind": "harness"}'::jsonb,
              (select committed_at - interval '1 minute' from decision.commitments where package_id = ${R.pkg}::uuid and version = 1), ${uuidv7()}::uuid)`.execute(su);
    await refused(reopen(w.owner, R.pkg, { cause: { kind: 'input_invalidated', ref: early } }), /^reopen rejected: no recorded cause — note .* was recorded at .*, before the commitment/, 409);
    // The wrong principals: an approver (the PDP names decision_owner alone), another decision owner (the port: the package owner reopens it).
    expect(await status(reopen(w.approver, R.pkg, { cause: { kind: 'input_invalidated', ref: early } }))).toBe(403);
    await refused(reopen(w.authorApprover, R.pkg, { cause: { kind: 'input_invalidated', ref: early } }), /^reopen rejected: the package owner reopens it/, 403);
    expect((await packageRow(R.pkg)).state).toBe('committed');
    // A REAL cause: the operator invalidates the reroute run both chosen options cite (the fixture's, on version 1) — the consumer notes R and R2 (and the draft P0, which cites it too).
    const t10 = await mark();
    await invalidateRun(runOwner, w.rerouteId, 'the reroute was simulated on the misgrounded corridor element (harness)');
    const gis = await publishedIn(D(), 'simulation.invalidated', t10, w.rerouteId);
    expect(gis).toHaveLength(1);
    const reach = obj(obj(gis[0]!.payload['simulation'])['dependants']);
    expect(reach).toMatchObject({ decisions: [w.decisionId], twins: [], simulations: [] });
    expect(sorted(reach['commitments'] as string[])).toEqual(sorted([R.commitmentId, R2.commitmentId]));
    expect(reach['packages']).toEqual(expect.arrayContaining([expect.objectContaining({ package_id: R.pkg, committed: true, option_keys: ['reroute'] }), expect.objectContaining({ package_id: R2.pkg, committed: true }), expect.objectContaining({ package_id: P0, committed: false })]));
    const ds = await sixApplied(gis[0]!.id);
    expect(ds['decisions']!.items).toEqual([P0, R.pkg, R2.pkg].sort());
    const NOTE_R = (await noteOn(R.pkg, t10, w.rerouteId)).event_id;
    const NOTE_R2 = (await noteOn(R2.pkg, t10, w.rerouteId)).event_id;
    const ro = await reopen(w.owner, R.pkg, { cause: { kind: 'input_invalidated', ref: NOTE_R } });
    expect(ro.reopened).toMatchObject({ package_id: R.pkg, committed_version: 1, commitment_id: R.commitmentId, new_version: 2, options_carried: ['status-quo'], options_dropped: [{ key: 'reroute', reason: expect.stringMatching(/run .* was invalidated at .* \(operator: /) }], reopens: 1 });
    expect(await packageRow(R.pkg)).toMatchObject({ state: 'reopened', committed_version: 1, current_version: 2, reopens: 1 });
    await refused(reopen(w.owner, R.pkg, { cause: { kind: 'input_invalidated', ref: NOTE_R } }), /^reopen rejected: package .* is reopened with version .* open; propose and commit it before reopening again/, 409);
    // C9, the reopened branch: a package whose commitment stands is re-committed, not withdrawn.
    await refused(c.withdraw(R.pkg, 'abandoned by the owner (harness)'), /^withdrawal rejected: package .* was committed at version 1 and the commitment stands; a reopened decision is re-committed, not withdrawn/, 409);
    expect((await packageRow(R.pkg)).state).toBe('reopened');
    // C8: a REOPENED package is open — its draft hears of an input it cites — and its standing commitment is executed until re-committed. (R stays reopened: its draft now cites an invalidated run and is not proposed here — stated.)
    await c.option(R.pkg, 2, { key: 'air', title: 'Air bridge', kind: 'intervention', consequences: [{ kind: 'run', id: w.airId }] });
    const t11 = await mark();
    await invalidateRun(runOwner, w.airId, 'the air bridge was simulated on the misgrounded corridor element (harness)');
    const gis2 = await publishedIn(D(), 'simulation.invalidated', t11, w.airId);
    expect(gis2).toHaveLength(1);
    expect(obj(obj(gis2[0]!.payload['simulation'])['dependants'])).toMatchObject({ packages: [expect.objectContaining({ package_id: R.pkg, version: 2, state: 'reopened', committed: true, option_keys: ['air'] })], commitments: [], decisions: [] });
    const ds2 = await sixApplied(gis2[0]!.id);
    expect(ds2['decisions']!.items).toEqual([R.pkg]);
    const noteR2 = await noteOn(R.pkg, t11, w.airId);
    expect(noteR2.details).toMatchObject({ package_state: 'reopened', executed: true, failure_class: 'material_change', disposition: 'compensation', via: [`option air cites run ${w.airId}`] });
    // C9, the second branch: R2 reopened on its own note and PROPOSED again (the carried status-quo rests on the valid version-1 control) — its commitment still stands, so it is not withdrawn either.
    const ro2 = await reopen(w.owner, R2.pkg, { cause: { kind: 'input_invalidated', ref: NOTE_R2 } });
    expect(ro2.reopened).toMatchObject({ package_id: R2.pkg, committed_version: 1, commitment_id: R2.commitmentId, new_version: 2, options_carried: ['status-quo'], options_dropped: [expect.objectContaining({ key: 'reroute' })] });
    await c.option(R2.pkg, 2, { key: 'wait', title: 'Wait for a re-simulation', kind: 'intervention', consequences: [{ kind: 'assumption', id: w.assumptionId }], unsimulatedReason: 'the reroute run was invalidated; a re-simulation is pending (harness)' });
    await c.choice(R2.pkg, 2, c.validChoice({ option_key: 'status-quo', rationale: 'With the reroute invalidated, the status quo stands (harness).' }));
    await c.propose(R2.pkg, 2);
    expect(await packageRow(R2.pkg)).toMatchObject({ state: 'proposed', committed_version: 1, current_version: 2, reopens: 1 });
    await refused(c.withdraw(R2.pkg, 'abandoned by the owner (harness)'), /^withdrawal rejected: package .* was committed at version 1 and the commitment stands/, 409);
    expect(await packageRow(R2.pkg)).toMatchObject({ state: 'proposed', committed_version: 1 });
    // The second commit guard: P's version 1 is committed and superseded by the second commitment — never re-committed over.
    await refused(c.commit(P, 1, versionDigest1, w.authority), /^commitment rejected: package is already committed at version 2 and the commitment stands/, 409);
    expect((await commitments(P)).map((x) => x.version)).toEqual([1, 2]);
    await settleIn(D());
  }, 300_000);
});

describe('S4 · the register through the route (0078 §4; AU-DP-0071, V04-T-005)', () => {
  it('S4 · 50 rows: 40 bound, 10 partial, 0 unbound (B21, 0081) — the ten rows bound in 0078 and the four bound in 0081 with their event and schema version, the ten that stay partial listed exactly; the same counts by SQL', async () => {
    const r = await interfaces();
    expect(r.interfaces).toHaveLength(50);
    const byState = (s: string) => r.interfaces.filter((i) => i['binding_state'] === s).map((i) => String(i['interface_id']));
    expect(byState('bound')).toHaveLength(40);
    expect(byState('partial').sort()).toEqual([...STILL_PARTIAL].sort());
    expect(byState('unbound')).toEqual([]);
    for (const [id, event, schemaVersion] of BOUND_IN_0078) {
      const row = r.interfaces.find((i) => i['interface_id'] === id);
      expect(row, id).toMatchObject({ binding_state: 'bound', bound_in: '0078', schema_version: schemaVersion });
      expect(row!['bound_at'], `${id} bound_at`).not.toBeNull();
      expect(String(row!['bound_to']), `${id} bound_to`).toMatch(new RegExp(`${event}@${schemaVersion}`));
    }
    expect(String(r.interfaces.find((i) => i['interface_id'] === 'L8-I05')!['bound_to'])).toMatch(/unreproducible verdict/);
    for (const [id, event, schemaVersion] of BOUND_IN_0081) {
      const row = r.interfaces.find((i) => i['interface_id'] === id);
      expect(row, id).toMatchObject({ binding_state: 'bound', bound_in: '0081', schema_version: schemaVersion });
      expect(row!['bound_at'], `${id} bound_at`).not.toBeNull();
      expect(String(row!['bound_to']), `${id} bound_to`).toMatch(new RegExp(`${event}@${schemaVersion}`));
    }
    expect(String(r.interfaces.find((i) => i['interface_id'] === 'L9-I05')!['bound_to'])).toMatch(/policy change has no recorded cause/);
    expect(await registerCounts()).toEqual({ bound: 40, partial: 10, unbound: 0 });
    expect(subs['twins']!.subscriptionId).toMatch(UUID);
  }, 60_000);
});
