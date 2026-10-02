/**
 * CP-6 B22 (migration 0083) — THE ATTENTION POLICY AND THE CONSUMERS: a domain's attention policy as a VERSIONED object a named human
 * sets (L10-I05, AttentionPolicyChanged@v1), the engine that judges a signal on TRANSPARENT dimensions against the class's thresholds,
 * the QUEUE (routed / deprioritized / unrouted-and-escalated; acknowledge = receipt, suppress = reasoned and expiring, close, escalate
 * the overdue), the four new consumers (observations → the transformation plan; source-health → the impact markers and the coverage
 * loss; proposals → the review queue; attention → the fitness, coherence and warning signals routed, a policy change re-evaluating the
 * live items and NOTED on the committed packages), the QUARANTINE of an event that is not the contract (invalid_event → human_review),
 * and L9-I05's third cause kind (policy_changed) — on a real database with real Redis, the real outbox publisher and the real
 * subscription dispatcher (EYE_SCHEDULER_ENABLED at module top, the B6 rule), ALL ELEVEN consumers registered in the harness's own
 * domain, the world of `bootDecisionWorld` and B22's own humans with sessions of their own (the ports compare the acting principal).
 *
 *   A1 · POLICY: the executive publishes v1 (five classes, real roles); the PDP (a domain analyst 403); the port's validation (422
 *   naming the key: an unknown class, an unknown key, a non-role, ack_within_minutes out of range); an identical republish 409; v2 with
 *   its changed sections and classes; the AttentionPolicyChanged@v1 rows and their deliveries; the history; immutability (55000).
 *   A2 · SUBSCRIPTIONS: the eleven kinds and their own event types; a foreign type refused by the service (400) and by the port (22023);
 *   the register 44/6/0 with the four rows bound in 0083 and L9-I05's clause rewritten.
 *   A3 · FORECAST UNFIT (data_shift through a real retraction) → forecast.unfit routed to the issuer; the roles, the class's
 *   no-suppression rule (409), the receipt, the closure.
 *   A4 · SCENARIO INCOHERENT (a duplicate-branch scenario) → scenario.incoherent owned by the scenario owner; suppression beyond the
 *   class's maximum (422) and within it (visible, suppressed).
 *   A5 · WARNING (an indicator evaluation) → warning.raised with hours_to_window; a branch whose window lies beyond the threshold
 *   DEPRIORITIZED (visible in the list).
 *   A6 · SOURCE HEALTH (the lifecycle transition through the route: suspended, then active) → impact markers on the source's issued
 *   forecasts, the open warnings on them and a package citing one; source.coverage_loss routed to the collection manager; cleared.
 *   A7 · OBSERVATIONS (real uploads) → plan selections: no_plan with its reason, then selected once an extraction method is active.
 *   A8 · PROPOSALS (PLANTED claims and a PLANTED ClaimsExtracted row — see the case) → the held claim routed (UNROUTED and escalated at
 *   once while nobody holds the review roles; open once a knowledge owner exists), no_review_required recorded, nothing promoted.
 *   A9 · QUARANTINE (a PLANTED row whose payload is not the contract) → unresolved invalid_event / human_review, event.quarantined.
 *   A10 · ESCALATION (due_at moved into the past by the superuser — stated): escalated to the class's roles, bounded (exhausted once), a
 *   lapsed suppression reopened, the unrouted item's escalation restated.
 *   A11 · POLICY CHANGE + REOPEN (L9-I05): v3 → the live items re-evaluated (from/to versions and outcomes), the committed package
 *   noted (from_version = the version in force at the commitment), idempotent on a replay; the owner reopens on the policy cause
 *   (DecisionReopened carries it); a non-owner refused.
 *
 * EACH CASE LOGS ONE `B22 EVIDENCE` LINE with the six things V04-T-024/026 demand.
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
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { IntelligenceController } from '../../src/intelligence/intelligence.controller.js';
import type { DecisionController } from '../../src/decision/decision.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { CONSUMER_EVENT_TYPES, CONSUMER_KINDS, type ConsumerKind } from '../../src/graph/subscriptions/graph-change.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness, syntheticEgress } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b22-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
type OutboxRow = { id: string; status: string; event_type: string; schema_version: string | null; payload: Row; correlation_id: string; created_at: Date; partition_key: string; partition_seq: number };
type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; attempts: number; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; details?: Row }>;
  items_unresolved: Array<{ item: string; effect: string; effect_ref: string | null; reason: string }>; last_error: string | null; failure_class: string | null; disposition: string | null; replay_seq: number };
type Item = { item_id: string; signal_class: string; subject_kind: string; subject_id: string; cause_event_id: string; cause_event_type: string; title: string; outcome: string; state: string; owner_principal_id: string | null;
  route_roles: string[]; policy_version: number | null; evaluation: Row; details: Row; due_at: Date | null; escalations: number; suppressed_until: Date | null; acknowledged_by: string | null; closed_by: string | null; created_at: Date };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The six consumer kinds a GraphChanged reaches (relationships selects MemoryCorrected/claim.corrected alone; the four B22 kinds select their own types). */
const GRAPH_KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings'];
const NEW_KINDS: ConsumerKind[] = ['observations', 'source-health', 'proposals', 'attention'];
/** The register rows that stay partial: six after 0083 (B22); none after 0084 (B23). */
// B23 (0084): the six bound — L1-I02, L3-I02, L4-I02, L7-I02, L10-I02, L10-I03; none stays partial (50/0/0).
const STILL_PARTIAL: string[] = [];
const BOUND_IN_0084 = ['L1-I02', 'L3-I02', 'L4-I02', 'L7-I02', 'L10-I02', 'L10-I03'];
const SIGNAL_CLASSES = ['forecast.unfit', 'proposal.review', 'scenario.incoherent', 'source.coverage_loss', 'warning.raised'];

let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let graph: GraphController; let prediction: PredictionController; let exec: ExecutiveController; let observation: ObservationController; let intelligence: IntelligenceController; let decisions: DecisionController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let strategyOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
const subs: Partial<Record<ConsumerKind, { subscriptionId: string; principalId: string }>> = {};
let B: Evd; const E1 = uuidv7(); const E2 = uuidv7();
/** What the cases leave one another (each named where it is made). */
let sourceKey = ''; let V1 = ''; let V2 = '';
let forecastItem = ''; let FS = '';
let scenarioItem = ''; let SDUP = '';
let warningItem = ''; let deprioritizedItem = ''; let longBranch = '';
let coverageItem = '';
let unroutedItem = ''; let routedProposalItem = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
/** A marker on the DATABASE clock (the B20 harness :156). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}; recent: ${JSON.stringify(dispatcher.recentDeliveries().slice(0, 4))}`);
    await sleep(300);
  }
}
const settle = async (ms = 90_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const q = await scheduler.subscriptionQueueCountsForTests(T(), D());
    const pending = Number((await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and status = 'pending'`.execute(su)).rows[0]!.n);
    if (q.active === 0 && q.waiting === 0 && q.delayed === 0 && pending === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(q)}; pending outbox rows ${pending}`);
    await sleep(300);
  }
};
/** A refusal as the caller sees it: the HttpException's status and the dashed catalogue code. */
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
/** A superuser statement's SQLSTATE (null when it succeeded). */
const sqlstate = async (p: Promise<unknown>): Promise<string | null> => { try { await p; return null; } catch (e) { return String((e as { code?: string }).code ?? 'unknown'); } };
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B22 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the outbox and the deliveries ───────────── */
const outboxRows = async (eventType: string, after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, event_type, schema_version, payload, correlation_id::text, created_at, partition_key, partition_seq::int from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload));
const outboxEvent = (eventType: string, after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow> =>
  waitFor(`the ${eventType} row published`, () => outboxRows(eventType, after, where), (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);
const publishedIn = (kind: string, after: Date, targetId?: string): Promise<OutboxRow[]> =>
  waitFor(`the GraphChanged/${kind} row${targetId === undefined ? '' : ` of ${targetId}`} published`, () => outboxRows('GraphChanged', after, (p) => obj(p['change'])['kind'] === kind && (targetId === undefined || obj(p['cause'])['target_id'] === targetId)), (rows) => rows.length > 0 && rows.every((r) => r.status === 'published'));
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, items_unresolved, last_error, failure_class, disposition, replay_seq from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(su)).rows;
/** The six GraphChanged deliveries of an event applied, the queue settled. */
const graphApplied = async (eventId: string): Promise<Record<string, Delivery>> => {
  const ds = await waitFor(`the six deliveries of ${eventId} applied`, () => deliveriesFor(eventId), (rows) => rows.length === 6 && rows.every((d) => d.state === 'applied'), 120_000);
  expect(sorted(ds.map((d) => d.consumer_kind))).toEqual(sorted(GRAPH_KINDS));
  return Object.fromEntries(ds.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
};
/** The ONE delivery of a flat event (its kind alone selects it) finished — applied or unresolved. */
const flatDelivered = async (eventId: string, kind: ConsumerKind, state: 'applied' | 'unresolved' = 'applied'): Promise<Delivery> => {
  const ds = await waitFor(`the ${kind} delivery of ${eventId} ${state}`, () => deliveriesFor(eventId), (rows) => rows.some((d) => d.consumer_kind === kind && d.state === state), 120_000);
  expect(ds.map((d) => d.consumer_kind), 'a flat event reaches the kind that selects it and no other').toEqual([kind]);
  return ds[0]!;
};
/**
 * A row PLANTED in the tenant's outbox partition the way 0064 places every row (the fixture takes the next sequence as enqueue would;
 * the phase6-propagation-consumer idiom :563) — PENDING, so the real publisher leases it and the lease's registry answer routes it.
 */
async function plantOutbox(eventType: string, payload: Row): Promise<string> {
  const id = uuidv7(); const key = `tenant:${T()}`;
  await sql`with pk as (insert into objects.outbox_partitions (partition_key) values (${key}) on conflict (partition_key) do nothing),
                 seq as (update objects.outbox_partitions set next_seq = next_seq + 1 where partition_key = ${key} returning next_seq - 1 as n)
    insert into objects.object_outbox (id, scope, tenant_id, domain_id, event_type, payload, correlation_id, causation_id, partition_key, partition_seq, schema_version)
    select ${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${key}, seq.n, 'v1' from seq`.execute(su);
  return id;
}

/* ───────────── the rows ───────────── */
const itemRow = async (itemId: string): Promise<Item> => (await sql<Item>`select item_id::text, signal_class, subject_kind, subject_id::text, cause_event_id::text, cause_event_type, title, outcome, state, owner_principal_id::text, route_roles, policy_version, evaluation, details, due_at, escalations, suppressed_until, acknowledged_by::text, closed_by::text, created_at from executive.attention_items where item_id = ${itemId}::uuid`.execute(su)).rows[0]!;
const itemsOf = async (signalClass: string, subjectId: string): Promise<Item[]> => (await sql<Item>`select item_id::text, signal_class, subject_kind, subject_id::text, cause_event_id::text, cause_event_type, title, outcome, state, owner_principal_id::text, route_roles, policy_version, evaluation, details, due_at, escalations, suppressed_until, acknowledged_by::text, closed_by::text, created_at from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${signalClass} and subject_id = ${subjectId}::uuid order by created_at`.execute(su)).rows;
const itemEvents = async (itemId: string) => (await sql<{ event: string; actor: string; details: Row }>`select event, actor_principal_id::text actor, details from executive.attention_item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const itemsCausedBy = async (eventId: string) => (await sql<{ n: number }>`select count(*)::int n from executive.attention_items where cause_event_id = ${eventId}::uuid`.execute(su)).rows[0]!.n;
const policyRows = async () => (await sql<{ policy_id: string; version: number; state: string; supersedes: number | null; superseded_at: Date | null; changed_sections: string[]; changed_classes: string[]; rules_digest: string; set_by: string; effective_at: Date }>`select policy_id::text, version, state, supersedes, superseded_at, changed_sections, changed_classes, rules_digest, set_by::text, effective_at from executive.attention_policies where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by version`.execute(su)).rows;
const markers = async (sourceId: string) => (await sql<{ subject_kind: string; subject_id: string; health_state: string; state: string; cleared_state: string | null; set_by_event: string; cleared_by_event: string | null }>`select subject_kind, subject_id::text, health_state, state, cleared_state, set_by_event::text, cleared_by_event::text from observation.source_impact_markers where source_id = ${sourceId}::uuid order by set_at, subject_kind, subject_id`.execute(su)).rows;
const selections = async (evdId: string) => (await sql<{ outcome: string; methods: Row[]; reason: string; source_id: string | null; acquisition_mode: string | null; outbox_event_id: string; evd_version: number | null }>`select outcome, methods, reason, source_id::text, acquisition_mode, outbox_event_id::text, evd_version::int from intelligence.plan_selections where evd_object_id = ${evdId}::uuid order by selected_at`.execute(su)).rows;
const packageEvents = async (pkg: string, event: string) => (await sql<{ event_id: string; details: Row; occurred_at: Date }>`select event_id::text, details, occurred_at from decision.package_events where package_id = ${pkg}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
const registerCounts = async () => (await sql<{ bound: number; partial: number; unbound: number }>`select count(*) filter (where binding_state = 'bound')::int bound, count(*) filter (where binding_state = 'partial')::int partial, count(*) filter (where binding_state = 'unbound')::int unbound from objects.interface_register`.execute(su)).rows[0]!;

/* ───────────── the routes (in process) ───────────── */
const register = (kind: ConsumerKind, extra: Row = {}) => graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
  { payload: { consumerKind: kind, ownerPrincipalId: w.owner.principalId, backlog: 'leave', ...(kind === 'relationships' ? { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } : {}), ...extra } as never }) as Promise<{ subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean } }>;
const interfaces = () => graph.interfaces(h.req(analyst, 'graph.read', 'SUB', null, 'graph'), T(), D()) as Promise<{ interfaces: Row[] }>;
const replay = (subscriptionId: string, fromSeq: number, reason: string) => graph.replaySubscription(h.req(dadmin, 'graph.subscription.replay', 'SUB', subscriptionId, 'platform.administration'), T(), D(), subscriptionId,
  { payload: { fromSeq, reason } }) as unknown as Promise<{ replayed: number; events: string[] }>;
const declareStrategy = (objectType: string, payload: Row) => graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', objectType, null, 'graph'), T(), D(), { payload: { objectType, ...payload } }) as unknown as Promise<{ strategy: { objectId: string } }>;
const retractEdge = (edgeId: string, reason: string) => graph.retractEdge(h.req(strategyOwner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason } });
// the attention routes
const publish = (as: AuthenticatedPrincipal, rules: unknown, reason: string) => exec.publishAttentionPolicy(h.req(as, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { rules, reason } as never }) as unknown as Promise<{ policy: Row; receipt: Row }>;
const policyGet = (as = executive) => exec.attentionPolicy(h.req(as, 'executive.attention.read', 'ATP', null, 'executive'), T(), D()) as unknown as Promise<{ policy: { active: Row | null; history: Row[] } }>;
const listItems = (payload: Row = {}, as = executive) => exec.listAttentionItems(h.req(as, 'executive.attention.read', 'ATI', null, 'executive'), T(), D(), { payload: payload as never }) as unknown as Promise<{ items: Row[]; counts: Record<string, number> }>;
const getItem = (itemId: string, as = executive) => exec.getAttentionItem(h.req(as, 'executive.attention.read', 'ATI', itemId, 'executive'), T(), D(), itemId) as unknown as Promise<{ item: Row & { events: Row[] } }>;
const acknowledge = (as: AuthenticatedPrincipal, itemId: string, note?: string) => exec.acknowledgeAttentionItem(h.req(as, 'executive.attention.item.acknowledge', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: note === undefined ? {} : { note } }) as unknown as Promise<{ item: Row }>;
const suppress = (as: AuthenticatedPrincipal, itemId: string, until: Date, reason: string) => exec.suppressAttentionItem(h.req(as, 'executive.attention.item.suppress', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: { until: until.toISOString(), reason } }) as unknown as Promise<{ item: Row }>;
const close = (as: AuthenticatedPrincipal, itemId: string, note: string) => exec.closeAttentionItem(h.req(as, 'executive.attention.item.close', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: { note } }) as unknown as Promise<{ item: Row }>;
const escalateDue = (as = executive) => exec.escalateAttentionDue(h.req(as, 'executive.attention.escalate', 'ATI', null, 'executive'), T(), D()) as unknown as Promise<{ escalation: { escalated: string[]; lapsed: string[]; exhausted: string[]; at: string } }>;
// prediction
const registerSeries = (seriesKey: string) => prediction.registerSeries(h.req(w.twinOwner, 'prediction.series.register', 'SER', null, 'prediction'), T(), D(),
  { payload: { seriesKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode (B22)' } });
const issueOn = (seriesKey: string, origin: string, over: Row = {}) => prediction.issueForecast(h.req(forecastOwner, 'prediction.forecast.issue', 'FCT', null, 'prediction'), T(), D(),
  { payload: { seriesKey, horizon: '30d', observedThrough: origin, knownAt: new Date().toISOString(), assumptions: [w.assumptionId], label: 'live', refreshCadence: 'daily', ...over } }) as unknown as Promise<{ forecast: { forecastId: string; method: string } }>;
type Declared = { scenario: Row & { scenarioId: string; branches: Array<{ branchId: string; name: string; kind: string }>; coherence: Row } };
const declareScenario = (as: AuthenticatedPrincipal, payload: Row) => prediction.declareScenario(h.req(as, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(), { payload }) as unknown as Promise<Declared>;
const evaluateIndicator = (indicatorId: string) => prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', indicatorId, 'prediction'), T(), D(), indicatorId, { payload: { knownAt: new Date().toISOString() } }) as unknown as Promise<{ evaluation: Row; warnings: Array<{ warningId: string; branchId: string; closesAt: string }> }>;
const baseline = (): Row => ({ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: strategyOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 });
const downside = (name: string, statement: string, over: Row = {}): Row => ({ name, kind: 'downside', statement, indicatorId: w.indicatorId, owner: strategyOwner.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48, ...over });
const scenarioPayload = (title: string, branches: Row[]): Row => ({ title, statement: 'the corridor stays open, or collapses (B22 harness)', forecastId: w.forecastId, owner: strategyOwner.principalId, reviewCadence: 'weekly', branches });

/* ───────────── the rows planted WITH their events (the B20/B21 idiom) ───────────── */
async function seedEntity(id: string, type: string, name: string, actor: string): Promise<void> {
  const correlationId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${actor}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${actor}::uuid, ${JSON.stringify({ entity_type: type, canonical_name: name, normalized_name: name.toLowerCase(), split_from: null })}::jsonb, ${correlationId}::uuid)`.execute(su);
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
 * A CLM claim as the extraction would have admitted it (the B21 seedClaim idiom: the canonical header and its digest), and — when
 * `queued` — the review case the admission would have opened (queued, below_review_threshold, the claim's confidence). PLANTED: no
 * cheap real extraction run in this world (the gateway's replay needs a recorded model call); the proposals consumer reads the
 * review ledger, which is exactly what a real run leaves.
 */
async function plantClaim(evidence: { id: string; version: number }, queued: boolean, confidence = 0.42): Promise<{ claimId: string; caseId: string | null; runId: string; methodId: string }> {
  const claimId = uuidv7(); const now = new Date().toISOString(); const runId = uuidv7(); const methodId = uuidv7();
  const lineage = { method_key: 'fixture', method_id: methodId, model_id: 'fixture-model', model_weights_digest: sha256('w'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: sha256('d'), mode: 'replay', call_id: null, run_id: runId,
    evidence_object_id: evidence.id, evidence_digest: sha256(evidence.id), byte_start: 0, byte_end: 4, extraction_identity: sha256(`${claimId}@1`), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  const payload: Row = { claim_kind: 'claim', subject: 'Bab el-Mandeb Strait', predicate: 'transit_change', object_value: 'fell against the prior day (B22)', confidence, lineage, review: queued ? { state: 'queued', reason: 'confidence below the floor', decider: null } : { state: 'approved', reason: 'fixture', decider: null } };
  const header: CanonicalHeader = {
    object_id: claimId, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${evidence.id}@${evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const contentDigest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${claimId}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, 'CLM@v1', null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  let caseId: string | null = null;
  if (queued) {
    caseId = uuidv7();
    await sql`insert into intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, correlation_id)
      values (${caseId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${claimId}::uuid, 1, ${runId}::uuid, ${methodId}::uuid, 'below_review_threshold', ${confidence}, 'queued', ${uuidv7()}::uuid)`.execute(su);
  }
  return { claimId, caseId, runId, methodId };
}

/* ───────────── the policy ───────────── */
/** Version 1: the five classes with the accountable roles the design names (realistic, human roles of this product). */
const RULES_V1 = (): Row => ({
  classes: {
    'forecast.unfit': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['forecast_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 2, suppression: { allowed: false }, notify: 'in_app' },
    'scenario.incoherent': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 480, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.6, max_hours_to_window: 168 }, route_roles: ['strategy_owner', 'executive'], ack_within_minutes: 60, escalate_to_roles: ['executive', 'domain_admin'], max_escalations: 1, suppression: { allowed: true, max_hours: 12 }, notify: 'in_app' },
    'source.coverage_loss': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['collection_manager'], ack_within_minutes: 120, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: true, max_hours: 48 }, notify: 'in_app' },
    'proposal.review': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['extraction_manager', 'knowledge_owner'], ack_within_minutes: 1440, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
  },
  overload: { max_open_per_role: 50 },
});
/** Version 2: the warning window tightened (materiality) and the coherence deadline shortened (escalation). */
const RULES_V2 = (): Row => {
  const r = RULES_V1(); const cl = r['classes'] as Record<string, Row>;
  cl['warning.raised'] = { ...cl['warning.raised'], materiality: { min_consequence: 'C2', min_confidence: 0.6, max_hours_to_window: 120 } };
  cl['scenario.incoherent'] = { ...cl['scenario.incoherent'], ack_within_minutes: 360 };
  return r;
};
/** Version 3: the warning window widened (materiality) and the review queue made suppressible (suppression). */
const RULES_V3 = (): Row => {
  const r = RULES_V2(); const cl = r['classes'] as Record<string, Row>;
  cl['warning.raised'] = { ...cl['warning.raised'], materiality: { min_consequence: 'C2', min_confidence: 0.6, max_hours_to_window: 600 } };
  cl['proposal.review'] = { ...cl['proposal.review'], suppression: { allowed: true, max_hours: 24 } };
  return r;
};
const withClass = (name: string, value: unknown): Row => { const r = RULES_V1(); (r['classes'] as Row)[name] = value; return r; };
const withKey = (cls: string, key: string, value: unknown): Row => { const r = RULES_V1(); const cl = r['classes'] as Record<string, Row>; cl[cls] = { ...cl[cls], [key]: value }; return r; };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { IntelligenceController: Ic } = await import('../../src/intelligence/intelligence.controller.js');
  const { DecisionController: Dc } = await import('../../src/decision/decision.controller.js');
  graph = h.app.get(Gc); prediction = h.app.get(Pc); exec = h.app.get(Ec); observation = h.app.get(Oc); intelligence = h.app.get(Ic); decisions = h.app.get(Dc);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  // A6 activates the fixture's REST source through the route (its schedule is materialized): the collection a tick would run reads the
  // synthetic publisher (no network), and the harness unschedules it at once.
  h.app.get(CollectionOrchestrator).useEgressForTests(syntheticEgress().egress);
  // THE HUMANS of this file, each with a session of its own (the ports compare the acting principal).
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b22-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b22-domain-admin');
  executive = await h.humanWithSession(['executive'], 'b22-executive');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b22-forecast-owner');
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b22-strategy-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b22-analyst');
  // THE WORLD (booted BEFORE the subscriptions: its own events are left behind by the 'leave' backlog); the evidence the planted edge rests on; E1, E2 with their events.
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid limit 1`.execute(su)).rows[0]!.source_key;
  [B] = (await h.upload([{ filename: 'b22-b.csv', text: 'a,b\n1,2\n', documentTime: '2024-01-14T00:00:00Z' }])).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest })) as [Evd];
  await seedEntity(E1, 'organization', 'B22 Holding AG', strategyOwner.principalId);
  await seedEntity(E2, 'place', 'B22 Strait Terminal', strategyOwner.principalId);
  await settle();
  // THE SUBSCRIPTIONS: all ELEVEN kinds, registered by the tenant administrator with the backlog left; the four B22 kinds select their own types by default.
  for (const kind of CONSUMER_KINDS) {
    const r = await register(kind);
    subs[kind] = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
    expect(r.served.workerRunning, `${kind}: the domain's queue is served from registration`).toBe(true);
  }
  await settle();
}, 300_000);

afterAll(async () => {
  try { await scheduler.unschedule(T(), D(), h.fx.sourceId); } catch { /* nothing scheduled */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B22 · the attention policy and the consumers (0083; L10-I05, L1-I03, L1-I04, L2-I02, L9-I05)', () => {
  it('A1 · POLICY: the executive publishes v1 (five classes, real roles); the PDP refuses a domain analyst (403); the port validates the rules whole (422 naming the key: an unknown class, an unknown key, a non-role, ack_within_minutes out of range); an identical republish 409; v2 with its changed sections and classes; AttentionPolicyChanged@v1 from each write and its delivery; the history; a version is immutable (55000)', async () => {
    /* A1.1 THE PDP and the intake. */
    expect(await failure(publish(analyst, RULES_V1(), 'the analyst may not set the policy (harness)'))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    expect((await failure(publish(executive, RULES_V1(), 'short'))).status, 'the reason is at least 8 characters').toBe(422);
    expect((await failure(publish(executive, [1, 2], 'rules as a list (harness)'))).status).toBe(422);
    /* A1.2 THE PORT's validation — every refusal names what it refused. */
    await refused(publish(executive, withClass('forecast.bogus', RULES_V1()['classes'] && (RULES_V1()['classes'] as Row)['forecast.unfit']), 'an unknown signal class (harness)'), /forecast\.bogus is not a signal class/, 422, 'EYE-REQ-001');
    await refused(publish(executive, { ...RULES_V1(), channels: ['email'] }, 'an unknown top-level key (harness)'), /unknown key channels/, 422, 'EYE-REQ-001');
    await refused(publish(executive, withKey('forecast.unfit', 'colour', 'red'), 'an unknown class key (harness)'), /class forecast\.unfit carries the unknown key colour/, 422, 'EYE-REQ-001');
    await refused(publish(executive, withKey('forecast.unfit', 'route_roles', ['wizard']), 'a role that does not exist (harness)'), /class forecast\.unfit route_roles names a role that is not a human role/, 422, 'EYE-REQ-001');
    await refused(publish(executive, withKey('warning.raised', 'escalate_to_roles', ['attention_subscriber']), 'a machine role as an escalation role (harness)'), /class warning\.raised escalate_to_roles names a role that is not a human role/, 422, 'EYE-REQ-001');
    await refused(publish(executive, withKey('scenario.incoherent', 'ack_within_minutes', 0), 'a zero acknowledgement window (harness)'), /class scenario\.incoherent ack_within_minutes is a whole number in \[1, 10080\]/, 422, 'EYE-REQ-001');
    await refused(publish(executive, withKey('scenario.incoherent', 'ack_within_minutes', 20_000), 'an acknowledgement window beyond a week (harness)'), /ack_within_minutes is a whole number in \[1, 10080\]/, 422, 'EYE-REQ-001');
    await refused(publish(executive, withKey('warning.raised', 'suppression', { allowed: true, max_hours: 5000 }), 'a suppression beyond thirty days (harness)'), /class warning\.raised suppression\.max_hours is in \[1, 720\]/, 422, 'EYE-REQ-001');
    await refused(publish(executive, withKey('source.coverage_loss', 'notify', 'email'), 'an external channel (harness)'), /class source\.coverage_loss notify is in_app/, 422, 'EYE-REQ-001');
    expect(await policyRows(), 'no refused version was written').toEqual([]);
    /* A1.3 VERSION 1. */
    const t0 = await mark();
    const p1 = (await publish(executive, RULES_V1(), 'the first attention policy of the corridor domain (harness)')).policy;
    V1 = String(p1['policy_id']);
    expect(p1).toMatchObject({ version: 1, supersedes: null, superseded_policy_id: null, set_by: executive.principalId, reason: 'the first attention policy of the corridor domain (harness)' });
    expect(sorted(p1['changed_sections'] as string[])).toEqual(['classes', 'overload']);
    expect(p1['changed_classes']).toEqual(SIGNAL_CLASSES);
    expect(String(p1['rules_digest'])).toMatch(/^[0-9a-f]{64}$/);
    const e1 = await outboxEvent('AttentionPolicyChanged', t0, (p) => p['policy_id'] === V1);
    expect(e1.schema_version).toBe('v1');
    expect(e1.payload).toMatchObject({ schema: 'AttentionPolicyChanged', schema_version: 'v1', policy_id: V1, version: 1, supersedes: null, superseded_policy_id: null, rules_digest: p1['rules_digest'], changed_classes: SIGNAL_CLASSES,
      set_by: executive.principalId, reason: 'the first attention policy of the corridor domain (harness)', cause: { action: 'executive.attention.policy.publish', actor: executive.principalId, target_type: 'ATP', target_id: V1 } });
    expect(obj(e1.payload['temporal'])['known_at']).toBe(e1.payload['effective_at']);
    const d1 = await flatDelivered(e1.id, 'attention');
    expect(d1.items, 'no live item and no committed package yet').toEqual([]);
    /* A1.4 AN IDENTICAL REPUBLISH — a version records a change (409), even with the keys in another order. */
    const reordered = Object.fromEntries(Object.entries(RULES_V1()).reverse());
    await refused(publish(executive, reordered, 'the same rules again (harness)'), /^attention policy rejected: the rules are unchanged from version 1/, 409, 'EYE-STA-002');
    /* A1.5 VERSION 2: what changed, computed by the port against the version it supersedes. */
    const t1 = await mark();
    const p2 = (await publish(executive, RULES_V2(), 'the warning window tightened to five days; coherence answered within six hours (harness)')).policy;
    V2 = String(p2['policy_id']);
    expect(p2).toMatchObject({ version: 2, supersedes: 1, superseded_policy_id: V1 });
    expect(sorted(p2['changed_sections'] as string[])).toEqual(['escalation', 'materiality']);
    expect(p2['changed_classes']).toEqual(['scenario.incoherent', 'warning.raised']);
    const e2 = await outboxEvent('AttentionPolicyChanged', t1, (p) => p['policy_id'] === V2);
    expect(e2.payload).toMatchObject({ version: 2, supersedes: 1, superseded_policy_id: V1, changed_classes: ['scenario.incoherent', 'warning.raised'] });
    expect(sorted(e2.payload['changed_sections'] as string[])).toEqual(['escalation', 'materiality']);
    expect((await flatDelivered(e2.id, 'attention')).items).toEqual([]);
    /* A1.6 THE HISTORY (newest first), the rows. */
    const got = (await policyGet(analyst)).policy;
    expect(got.active).toMatchObject({ policy_id: V2, version: 2, state: 'active', supersedes: 1 });
    expect(got.history.map((r) => [r['version'], r['state']])).toEqual([[2, 'active'], [1, 'superseded']]);
    expect(got.history[1]!['superseded_at']).not.toBeNull();
    const rows = await policyRows();
    expect(rows.map((r) => [r.version, r.state, r.supersedes])).toEqual([[1, 'superseded', null], [2, 'active', 1]]);
    expect(rows[0]!.superseded_at!.getTime()).toBe(rows[1]!.effective_at.getTime());
    /* A1.7 IMMUTABLE: a version is never rewritten, the superseded one nor the active one; nothing is deleted (the supersession is the port's only UPDATE). */
    expect(await sqlstate(sql`update executive.attention_policies set rules = ${JSON.stringify(RULES_V3())}::jsonb where policy_id = ${V1}::uuid`.execute(su))).toBe('55000');
    expect(await sqlstate(sql`update executive.attention_policies set reason = 'rewritten by the superuser (harness)' where policy_id = ${V2}::uuid`.execute(su))).toBe('55000');
    expect(await sqlstate(sql`delete from executive.attention_policies where policy_id = ${V1}::uuid`.execute(su))).toBe('55000');
    expect((await policyRows()).map((r) => r.state)).toEqual(['superseded', 'active']);
    await settle();
    sixEvidence('A1', { fault_trace: { refused: ['PDP 403 domain_analyst', '422 forecast.bogus', '422 channels', '422 colour', '422 wizard', '422 attention_subscriber', '422 ack 0', '422 ack 20000', '422 max_hours 5000', '422 notify email', '409 unchanged'] },
      watermark: { v1: V1, v2: V2, v2_sections: p2['changed_sections'], v2_classes: p2['changed_classes'] }, consumer_behaviour: { v1_delivery: d1.state, v1_items: d1.items, v2_items: [] },
      operator_action: 'the executive publishes v1 and v2', recovery: 'none needed: refused versions write nothing', reconciliation: { versions: rows.map((r) => `${r.version}:${r.state}`), immutable: '55000 on UPDATE and DELETE' } });
  }, 180_000);

  it('A2 · SUBSCRIPTIONS: the eleven kinds, the four B22 kinds on their own event types by default; a foreign type refused by the service (400) and by the port (22023); the register 44/6/0 with L10-I05, L1-I03, L1-I04, L2-I02 bound in 0083 and L9-I05\'s clause rewritten', async () => {
    expect(CONSUMER_KINDS).toHaveLength(11);
    const rows = (await sql<{ consumer_kind: string; event_types: string[]; status: string; principal_id: string }>`select consumer_kind, event_types, status, principal_id::text from graph.subscriptions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and status = 'active' order by consumer_kind`.execute(su)).rows;
    expect(sorted(rows.map((r) => r.consumer_kind))).toEqual(sorted([...CONSUMER_KINDS]));
    for (const k of NEW_KINDS) expect(rows.find((r) => r.consumer_kind === k)!.event_types, k).toEqual([...CONSUMER_EVENT_TYPES[k]]);
    expect(rows.find((r) => r.consumer_kind === 'attention')!.event_types).toEqual(['ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'AttentionPolicyChanged', 'MaterialChangeRaised', 'ReviewConvened']); // + the two B23 (0084) adds
    // each B22 subscriber holds exactly its own role
    for (const k of NEW_KINDS) {
      const roles = (await sql<{ role_code: string }>`select role_code from identity.role_bindings where principal_id = ${subs[k]!.principalId}::uuid and revoked_at is null`.execute(su)).rows.map((r) => r.role_code);
      expect(roles, k).toEqual([{ observations: 'observation_subscriber', 'source-health': 'source_health_subscriber', proposals: 'proposal_subscriber', attention: 'attention_subscriber' }[k as 'observations']]);
    }
    /* THE SERVICE: a kind selects only its own types (400). */
    const svc = await failure(register('attention', { eventTypes: ['GraphChanged'] }));
    expect(svc.status).toBe(400);
    expect(svc.message).toMatch(/eventTypes is a non-empty list of ForecastFitnessChanged \| ScenarioCoherenceFailed \| EarlyWarningRaised \| AttentionPolicyChanged \| MaterialChangeRaised \| ReviewConvened/);
    expect((await failure(register('twins', { eventTypes: ['AttentionPolicyChanged'] }))).status).toBe(400);
    /* THE PORT: the same rule in the database, below the service (the kind's own vocabulary, 22023) — a direct call under a commit context. */
    const commitDb = h.app.get<Db>(COMMIT_DB);
    const portCode = await sqlstate(inCommitContext(commitDb, { sessionId: tenantAdmin.sessionId, contextKey: tenantAdmin.contextKey }, { tenantId: T(), domainId: D() }, 'graph.subscription.register', uuidv7(), async (tx) => {
      await sql`select graph.register_subscription(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, 'attention', array['GraphChanged']::text[], '{}'::jsonb, ${w.machinePrincipalId}::uuid, '1.0.0', ${sha256('x')}, ${w.owner.principalId}::uuid, '{}'::jsonb, ${tenantAdmin.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx);
    }));
    expect(portCode, 'the port refuses a type the kind does not select').toBe('22023');
    let portMsg = '';
    await inCommitContext(commitDb, { sessionId: tenantAdmin.sessionId, contextKey: tenantAdmin.contextKey }, { tenantId: T(), domainId: D() }, 'graph.subscription.register', uuidv7(), async (tx) => {
      try { await sql`select graph.register_subscription(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, 'observations', array['SourceHealthChanged']::text[], '{}'::jsonb, ${w.machinePrincipalId}::uuid, '1.0.0', ${sha256('x')}, ${w.owner.principalId}::uuid, '{}'::jsonb, ${tenantAdmin.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx); }
      catch (e) { portMsg = (e as Error).message; throw e; }
    }).catch(() => undefined);
    expect(portMsg).toMatch(/consumer kind observations selects only ObservationRecorded/);
    /* THE REGISTER: 44/6/0 at 0083; 50/0/0 since 0084 (B23). */
    const r = await interfaces();
    expect(r.interfaces).toHaveLength(50);
    const byState = (s: string) => r.interfaces.filter((i) => i['binding_state'] === s).map((i) => String(i['interface_id']));
    expect(byState('bound')).toHaveLength(50);
    expect(byState('partial').sort()).toEqual([...STILL_PARTIAL].sort());
    expect(byState('unbound')).toEqual([]);
    for (const id of ['L10-I05', 'L1-I03', 'L1-I04', 'L2-I02']) {
      const row = r.interfaces.find((i) => i['interface_id'] === id)!;
      expect(row, id).toMatchObject({ binding_state: 'bound', bound_in: '0083', schema_version: 'v1' });
      expect(row['bound_at'], id).not.toBeNull();
    }
    expect(String(r.interfaces.find((i) => i['interface_id'] === 'L10-I05')!['bound_to'])).toMatch(/^AttentionPolicyChanged@v1 from POST …\/executive\/attention\/policy\/publish/);
    expect(String(r.interfaces.find((i) => i['interface_id'] === 'L1-I03')!['bound_to'])).toMatch(/B22 \(0083\): CONSUMED — the observations subscriber/);
    expect(String(r.interfaces.find((i) => i['interface_id'] === 'L1-I04')!['bound_to'])).toMatch(/B22 \(0083\): CONSUMED — the source-health subscriber/);
    expect(String(r.interfaces.find((i) => i['interface_id'] === 'L2-I02')!['bound_to'])).toMatch(/B22 \(0083\): CONSUMED — the proposals subscriber/);
    const l9 = String(r.interfaces.find((i) => i['interface_id'] === 'L9-I05')!['bound_to']);
    expect(l9).toContain('a POLICY CHANGE is a recorded cause');
    expect(l9).not.toContain('a policy change has no recorded cause on a package (L10-I05, B22)');
    expect(await registerCounts()).toEqual({ bound: 50, partial: 0, unbound: 0 });
    // the vocabulary the ports read
    const vocab = (await sql<{ event_type: string }>`select event_type from graph.subscribable_event_types order by event_type`.execute(su)).rows.map((x) => x.event_type);
    expect(vocab).toHaveLength(12); // 10 at 0083; + MaterialChangeRaised, ReviewConvened (0084)
    sixEvidence('A2', { fault_trace: { service: svc.status, port: portCode }, watermark: { register: '44/6/0', kinds: CONSUMER_KINDS.length }, consumer_behaviour: Object.fromEntries(NEW_KINDS.map((k) => [k, CONSUMER_EVENT_TYPES[k]])),
      operator_action: 'the tenant administrator registers the eleven kinds (backlog leave)', recovery: 'none', reconciliation: { vocabulary: vocab } });
  }, 120_000);

  it('A3 · FORECAST UNFIT: a real ForecastFitnessChanged (data_shift — the planted relationship retracted through the route, the forecasts consumer assesses) → the attention consumer routes forecast.unfit to the issuer (material, open, the roles, the deadline, the reasons, the version); a principal of none of the routed roles refused (403); the class forbids suppression (409); the owner acknowledges (receipt, not agreement) and closes with a note', async () => {
    const S3 = `${w.seriesKey}-b22`;
    await registerSeries(S3);
    const X1 = uuidv7();
    await seedEdge(X1, E1, 'ships_through', E2, uuidv7(), B, strategyOwner.principalId);
    const tA = await mark();
    const ASU2 = (await declareStrategy('ASU', { title: 'The B22 holding keeps shipping through the strait', statement: 'the planted relationship holds (harness)', restsOn: [{ kind: 'edge', id: X1, rationale: 'the assumption is about this relationship' }] })).strategy.objectId;
    const gA = await publishedIn('strategy.declared', tA, ASU2);
    await graphApplied(gA[0]!.id);
    FS = (await issueOn(S3, '2023-11-24', { assumptions: [ASU2] })).forecast.forecastId;
    await settle();
    const t0 = await mark();
    await retractEdge(X1, 'B22 A3: the planted relationship retracted (harness)');
    const gc = await publishedIn('edge.retracted', t0);
    const ds = await graphApplied(gc[0]!.id);
    expect(ds['forecasts']!.items).toEqual([FS]);
    expect(ds['forecasts']!.items_applied[0]).toMatchObject({ effect: 'forecast.attention', details: { fitness: { state: 'unfit', class: 'data_shift', changed: true } } });
    const ffc = await outboxEvent('ForecastFitnessChanged', t0, (p) => p['forecast_id'] === FS);
    expect(ffc.payload).toMatchObject({ schema: 'ForecastFitnessChanged', to: { state: 'unfit', class: 'data_shift' }, trigger: 'subscription' });
    const d = await flatDelivered(ffc.id, 'attention');
    expect(d.items).toEqual([`forecast:${FS}`]);
    expect(d.items_applied[0]).toMatchObject({ item: `forecast:${FS}`, effect: 'attention.routed', details: { signal: 'forecast.unfit', outcome: 'material', state: 'open', policy_version: 2, repeated: false } });
    /* THE ITEM: judged under version 2, routed to the issuer and the class's role, with the deadline and the reasons. */
    const [it1] = await itemsOf('forecast.unfit', FS);
    forecastItem = it1!.item_id;
    expect(d.items_applied[0]!.effect_ref).toBe(forecastItem);
    expect(it1).toMatchObject({ subject_kind: 'forecast', cause_event_id: ffc.id, cause_event_type: 'ForecastFitnessChanged', outcome: 'material', state: 'open', owner_principal_id: forecastOwner.principalId, route_roles: ['forecast_owner'], policy_version: 2, escalations: 0 });
    expect(it1!.title).toMatch(/assessed UNFIT \(data_shift\)/);
    expect(obj(it1!.evaluation)).toMatchObject({ outcome: 'material', policy_version: 2, dimensions: { consequence: 'C1', confidence: 1, fitness_class: 'data_shift' }, thresholds: { min_consequence: 'C1', min_confidence: 0.5 } });
    expect(it1!.evaluation['reasons']).toEqual(['consequence C1 at or above C1', 'confidence 1 at or above 0.5']);
    expect((it1!.due_at!.getTime() - it1!.created_at.getTime()) / 60_000).toBeCloseTo(240, 0);
    expect((await itemEvents(forecastItem)).map((e) => [e.event, e.details['policy_version'], e.details['owner']])).toEqual([['item.routed', 2, forecastOwner.principalId]]);
    // the route's answer: the item read, the queue lists it
    const got = (await getItem(forecastItem, forecastOwner)).item;
    expect(got).toMatchObject({ item_id: forecastItem, state: 'open', overdue: false, policy_version: 2, owner_principal_id: forecastOwner.principalId });
    expect(got.events.map((e) => e['event'])).toEqual(['item.routed']);
    expect((await listItems({ signalClass: 'forecast.unfit' })).items.map((x) => x['item_id'])).toContain(forecastItem);
    /* THE ACTS. */
    await refused(acknowledge(analyst, forecastItem, 'not mine (harness)'), /^attention item rejected: item .* is routed to forecast_owner/, 403, 'EYE-AUT-001');
    await refused(suppress(forecastOwner, forecastItem, new Date(Date.now() + 3_600_000), 'muted for an hour while the data settles (harness)'), /^attention item rejected: policy version 2 does not allow suppressing forecast\.unfit/, 409, 'EYE-STA-002');
    const ack = (await acknowledge(forecastOwner, forecastItem, 'seen: the relationship behind the assumption is gone (harness)')).item;
    expect(ack).toMatchObject({ item_id: forecastItem, state: 'acknowledged', from_state: 'open', acknowledged_by: forecastOwner.principalId, within_deadline: true });
    const ackEv = (await itemEvents(forecastItem)).at(-1)!;
    expect(ackEv).toMatchObject({ event: 'item.acknowledged', actor: forecastOwner.principalId, details: { receipt_not_agreement: true, within_deadline: true, from_state: 'open' } });
    await refused(acknowledge(forecastOwner, forecastItem), /^attention item rejected: item .* is acknowledged; only an open, escalated or unrouted item is acknowledged/, 409, 'EYE-STA-002');
    await refused(close(forecastOwner, forecastItem, 'ok'), /^attention item rejected: a closure carries a note of at least 4 characters/, 422, 'EYE-REQ-001');
    const closed = (await close(forecastOwner, forecastItem, 'the forecast will be withdrawn and re-issued on a sound assumption (harness)')).item;
    expect(closed).toMatchObject({ state: 'closed', from_state: 'acknowledged', closed_by: forecastOwner.principalId });
    expect(await itemRow(forecastItem)).toMatchObject({ state: 'closed', closed_by: forecastOwner.principalId, acknowledged_by: forecastOwner.principalId });
    await refused(close(forecastOwner, forecastItem, 'closing twice (harness)'), /^attention item rejected: item .* is already closed/, 409, 'EYE-STA-002');
    expect((await itemEvents(forecastItem)).map((e) => e.event)).toEqual(['item.routed', 'item.acknowledged', 'item.closed']);
    await settle();
    sixEvidence('A3', { fault_trace: { edge: X1, assumption: ASU2, forecast: FS, fitness_event: ffc.id }, watermark: { item: forecastItem, policy_version: 2, outcome: 'material', reasons: it1!.evaluation['reasons'] },
      consumer_behaviour: 'the attention consumer routed forecast.unfit to the issuer and forecast_owner', operator_action: 'the analyst refused (403); suppression refused by the class (409); acknowledged (receipt); closed with a note',
      recovery: 'the item closed by its owner', reconciliation: { events: ['item.routed', 'item.acknowledged', 'item.closed'] } });
  }, 300_000);

  it('A4 · SCENARIO INCOHERENT: a duplicate-branch scenario ADMITTED failed → ScenarioCoherenceFailed → scenario.incoherent owned by the scenario owner (the v2 deadline); a suppression beyond the class\'s maximum refused (422), within it admitted (visible: the state, the event, the list)', async () => {
    const t0 = await mark();
    const dup = (await declareScenario(strategyOwner, scenarioPayload('B22 duplicate-branch scenario (harness)', [baseline(), downside('Corridor collapse A', 'below 40 for five days'), downside('Corridor collapse B', 'the corridor collapses (the same signal again)')]))).scenario;
    SDUP = dup.scenarioId;
    expect(obj(dup.coherence)).toMatchObject({ outcome: 'failed' });
    const scf = await outboxEvent('ScenarioCoherenceFailed', t0, (p) => p['scenario_id'] === SDUP);
    expect(scf.payload).toMatchObject({ schema: 'ScenarioCoherenceFailed', owner: strategyOwner.principalId, trigger: 'declare' });
    const d = await flatDelivered(scf.id, 'attention');
    expect(d.items).toEqual([`scenario:${SDUP}`]);
    const [it1] = await itemsOf('scenario.incoherent', SDUP);
    scenarioItem = it1!.item_id;
    expect(it1).toMatchObject({ subject_kind: 'scenario', outcome: 'material', state: 'open', owner_principal_id: strategyOwner.principalId, route_roles: ['strategy_owner'], policy_version: 2 });
    expect(obj(it1!.evaluation)['dimensions']).toMatchObject({ consequence: 'C2', confidence: 1, findings: (scf.payload['findings'] as unknown[]).length });
    expect(it1!.title).toMatch(/^Scenario "B22 duplicate-branch scenario \(harness\)" failed its coherence check/);
    expect((it1!.due_at!.getTime() - it1!.created_at.getTime()) / 60_000, 'version 2 answers coherence within six hours').toBeCloseTo(360, 0);
    /* SUPPRESSION: reasoned, expiring within the class's maximum under the item's own version (24 h). */
    await refused(suppress(strategyOwner, scenarioItem, new Date(Date.now() + 48 * 3_600_000), 'muted for two days (harness)'), /^attention item rejected: a suppression expires after now and within 24 hours \(policy version 2\)/, 422, 'EYE-REQ-001');
    await refused(suppress(strategyOwner, scenarioItem, new Date(Date.now() + 3_600_000), 'short'), /^attention item rejected: a suppression carries a reason of at least 8 characters/, 422, 'EYE-REQ-001');
    await refused(suppress(strategyOwner, scenarioItem, new Date(Date.now() - 60_000), 'a suppression already lapsed (harness)'), /a suppression expires after now/, 422, 'EYE-REQ-001');
    const until = new Date(Date.now() + 6 * 3_600_000);
    const sup = (await suppress(strategyOwner, scenarioItem, until, 'the successor scenario is being drafted this morning (harness)')).item;
    expect(sup).toMatchObject({ state: 'suppressed', from_state: 'open', by: strategyOwner.principalId });
    const row = await itemRow(scenarioItem);
    expect(row.state).toBe('suppressed');
    expect(Math.abs(row.suppressed_until!.getTime() - until.getTime())).toBeLessThan(1000);
    expect((await itemEvents(scenarioItem)).at(-1)).toMatchObject({ event: 'item.suppressed', details: { reason: 'the successor scenario is being drafted this morning (harness)', scope: 'item', policy_version: 2, max_hours: 24 } });
    const listed = await listItems({ state: 'suppressed' });
    expect(listed.items.map((x) => x['item_id']), 'a suppression is visible, never silent').toContain(scenarioItem);
    expect(listed.counts['suppressed']).toBeGreaterThanOrEqual(1);
    await settle();
    sixEvidence('A4', { fault_trace: { scenario: SDUP, event: scf.id }, watermark: { item: scenarioItem, owner: strategyOwner.principalId, due_minutes: 360 }, consumer_behaviour: 'scenario.incoherent routed to the owner and strategy_owner',
      operator_action: 'suppress refused beyond 24 h (422), without a reason (422), in the past (422); admitted for 6 h', recovery: 'the suppression lapses (A10)', reconciliation: { state: row.state, suppressed_until: row.suppressed_until } });
  }, 180_000);

  it('A5 · WARNING: an indicator evaluation raises the warnings → warning.raised routed with hours_to_window in the dimensions; a branch whose response window lies beyond the class\'s threshold is DEPRIORITIZED — recorded, visible in items/list, never dropped', async () => {
    // A second scenario on the same indicator whose downside answers within 400 hours — beyond version 2's 120.
    const long = (await declareScenario(strategyOwner, scenarioPayload('B22 slow-response scenario (harness)', [baseline(), downside('Slow collapse', 'below 40 for five days, answered slowly', { responseWindowHours: 400 })]))).scenario;
    expect(obj(long.coherence)['outcome']).toBe('passed');
    longBranch = long.branches.find((b) => b.kind === 'downside')!.branchId;
    await settle();
    const t0 = await mark();
    const ev = await evaluateIndicator(w.indicatorId);
    const byBranch = new Map(ev.warnings.map((x) => [x.branchId, x.warningId]));
    expect([...byBranch.keys()]).toEqual(expect.arrayContaining([w.branchId, longBranch]));
    const fixtureWarning = byBranch.get(w.branchId)!; const longWarning = byBranch.get(longBranch)!;
    const ewFix = await outboxEvent('EarlyWarningRaised', t0, (p) => p['warning_id'] === fixtureWarning);
    const ewLong = await outboxEvent('EarlyWarningRaised', t0, (p) => p['warning_id'] === longWarning);
    const dFix = await flatDelivered(ewFix.id, 'attention');
    const dLong = await flatDelivered(ewLong.id, 'attention');
    expect(dFix.items).toEqual([`warning:${fixtureWarning}`]);
    /* MATERIAL: the fixture branch (48 h), owned by its branch owner, routed to the class's roles. */
    const [wi] = await itemsOf('warning.raised', fixtureWarning);
    warningItem = wi!.item_id;
    expect(wi).toMatchObject({ subject_kind: 'warning', outcome: 'material', state: 'open', owner_principal_id: w.twinOwner.principalId, route_roles: ['strategy_owner', 'executive'], policy_version: 2 });
    const dims = obj(wi!.evaluation['dimensions']);
    expect(dims).toMatchObject({ consequence: 'C2', confidence: 0.8 });
    expect(Number(dims['hours_to_window'])).toBeGreaterThan(47); expect(Number(dims['hours_to_window'])).toBeLessThanOrEqual(48.1);
    expect((wi!.evaluation['reasons'] as string[]).at(-1)).toMatch(/^4[78](\.\d)? hours to the response window, within 120$/);
    expect((wi!.due_at!.getTime() - wi!.created_at.getTime()) / 60_000).toBeCloseTo(60, 0);
    /* DEPRIORITIZED: the slow branch (400 h) — below the threshold, recorded with its reasons, no route and no deadline. */
    const [li] = await itemsOf('warning.raised', longWarning);
    deprioritizedItem = li!.item_id;
    expect(dLong.items_applied[0]).toMatchObject({ effect: 'attention.routed', details: { outcome: 'below_threshold', state: 'deprioritized' } });
    expect(li).toMatchObject({ outcome: 'below_threshold', state: 'deprioritized', owner_principal_id: strategyOwner.principalId, route_roles: [], due_at: null, policy_version: 2 });
    expect(Number(obj(li!.evaluation['dimensions'])['hours_to_window'])).toBeGreaterThan(399);
    expect((li!.evaluation['reasons'] as string[]).at(-1)).toMatch(/hours to the response window, beyond 120$/);
    expect((await itemEvents(deprioritizedItem)).map((e) => e.event)).toEqual(['item.deprioritized']);
    const listed = await listItems({ state: 'deprioritized' }, strategyOwner);
    expect(listed.items.map((x) => x['item_id']), 'a deprioritized item is listed, never hidden').toContain(deprioritizedItem);
    expect(listed.counts['deprioritized']).toBeGreaterThanOrEqual(1);
    const all = await listItems({ signalClass: 'warning.raised' });
    expect(all.items.map((x) => x['item_id'])).toEqual(expect.arrayContaining([warningItem, deprioritizedItem]));
    // the duplicate-branch scenario's two downside branches flipped too (their warnings marked input_unverified by 0081, raised, routed)
    const dupWarnings = ev.warnings.filter((x) => x.branchId !== w.branchId && x.branchId !== longBranch).map((x) => x.warningId);
    await settle();
    for (const wid of dupWarnings) expect((await itemsOf('warning.raised', wid))[0], wid).toMatchObject({ outcome: 'material', owner_principal_id: strategyOwner.principalId });
    sixEvidence('A5', { fault_trace: { warnings: ev.warnings.length, fixture: fixtureWarning, slow: longWarning }, watermark: { material: { item: warningItem, hours: dims['hours_to_window'] }, deprioritized: { item: deprioritizedItem, hours: obj(li!.evaluation['dimensions'])['hours_to_window'] } },
      consumer_behaviour: 'every raised warning routed or deprioritized under version 2', operator_action: 'none', recovery: 'the deprioritized item stays listed; a policy change re-evaluates it (A11)', reconciliation: { counts: listed.counts } });
  }, 300_000);

  it('A6 · SOURCE HEALTH: the fixture source SUSPENDED through the lifecycle route → SourceHealthChanged → impact markers on the source\'s issued forecasts, the open warnings on them and a package citing one; source.coverage_loss routed to the collection manager; ACTIVE again → the markers cleared (the item stays for its owner)', async () => {
    // A draft package whose option cites the fixture forecast (a derived product resting on the source).
    const P = (await c.declare({ decisionObjectId: w.decisionId, title: 'B22 package citing the corridor forecast (harness)', statement: 'whether to act on the transit forecast', owner: w.owner.principalId })).package.packageId;
    const pv = (await c.open(P)).version.version;
    await c.option(P, pv, { key: 'on-forecast', title: 'Act on the transit forecast', kind: 'intervention', consequences: [{ kind: 'run', id: w.controlId }, { kind: 'forecast', id: w.forecastId, version: 1 }] });
    const issued = (await sql<{ forecast_id: string }>`select fc.forecast_id::text from prediction.forecasts_current fc join prediction.series_registry sr on sr.series_key = fc.series_key and sr.tenant_id = fc.tenant_id and sr.domain_id = fc.domain_id
       where fc.tenant_id = ${T()}::uuid and fc.domain_id = ${D()}::uuid and fc.state = 'issued' and sr.source_key = ${sourceKey} order by fc.forecast_id`.execute(su)).rows.map((r) => r.forecast_id);
    expect(issued).toEqual(expect.arrayContaining([w.forecastId, FS]));
    const openWarnings = (await sql<{ warning_id: string }>`select warning_id::text from prediction.warnings_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and state in ('raised', 'acknowledged') and forecast_id = any(${issued}::uuid[]) order by warning_id`.execute(su)).rows.map((r) => r.warning_id);
    expect(openWarnings.length).toBeGreaterThanOrEqual(2);
    await settle();
    const t0 = await mark();
    await observation.transitionSource(h.req(h.manager, 'observation.source.transition', 'SRC', h.fx.sourceId, 'observation'), T(), D(), h.fx.sourceId,
      { payload: { contractVersion: h.version, target: 'suspended', reason: 'B22 A6: the publisher stopped answering (harness)' } });
    const shc = await outboxEvent('SourceHealthChanged', t0, (p) => p['source_id'] === h.fx.sourceId && p['state'] === 'suspended');
    const d = await flatDelivered(shc.id, 'source-health');
    expect(d.items).toEqual([`source:${h.fx.sourceId}`]);
    expect(d.items_applied[0]).toMatchObject({ effect: 'markers.set', details: { state: 'suspended', attention: { outcome: 'material', state: 'open', policy_version: 2 } } });
    const m = await markers(h.fx.sourceId);
    const active = m.filter((x) => x.state === 'active');
    expect(sorted(active.filter((x) => x.subject_kind === 'forecast').map((x) => x.subject_id))).toEqual(sorted(issued));
    expect(sorted(active.filter((x) => x.subject_kind === 'warning').map((x) => x.subject_id))).toEqual(sorted(openWarnings));
    expect(active.filter((x) => x.subject_kind === 'package').map((x) => x.subject_id)).toEqual([P]);
    for (const x of active) expect(x).toMatchObject({ health_state: 'suspended', set_by_event: shc.id });
    /* THE COVERAGE LOSS: routed to collection_manager (the fixture's manager holds it), consequence C2 (products rest on the source). */
    const [ci] = await itemsOf('source.coverage_loss', h.fx.sourceId);
    coverageItem = ci!.item_id;
    expect(d.items_applied[0]!.effect_ref).toBe(coverageItem);
    expect(ci).toMatchObject({ subject_kind: 'source', outcome: 'material', state: 'open', owner_principal_id: null, route_roles: ['collection_manager'], policy_version: 2 });
    expect(obj(ci!.evaluation['dimensions'])).toMatchObject({ consequence: 'C2', confidence: 1, health_state: 'suspended', affected_products: active.length });
    expect(ci!.title).toMatch(/is suspended — B22 A6: the publisher stopped answering/);
    expect(obj(ci!.details)).toMatchObject({ source_id: h.fx.sourceId, state: 'suspended' });
    /* ACTIVE AGAIN: the markers cleared by the event that said so. */
    await settle();
    const t1 = await mark();
    await observation.transitionSource(h.req(h.manager, 'observation.source.transition', 'SRC', h.fx.sourceId, 'observation'), T(), D(), h.fx.sourceId,
      { payload: { contractVersion: h.version, target: 'active', reason: 'B22 A6: the publisher answers again (harness)' } });
    // the activation materialized the collection schedule (a synthetic publisher answers a tick): the harness unschedules it at once
    await scheduler.unschedule(T(), D(), h.fx.sourceId);
    const back = await outboxEvent('SourceHealthChanged', t1, (p) => p['source_id'] === h.fx.sourceId && p['state'] === 'active');
    const d2 = await flatDelivered(back.id, 'source-health');
    expect(d2.items_applied[0]).toMatchObject({ effect: 'markers.cleared', effect_ref: null, details: { state: 'healthy' } });
    const m2 = await markers(h.fx.sourceId);
    expect(m2.filter((x) => x.state === 'active')).toEqual([]);
    for (const x of m2) expect(x).toMatchObject({ state: 'cleared', cleared_state: 'healthy', cleared_by_event: back.id });
    expect((await itemsOf('source.coverage_loss', h.fx.sourceId)).map((x) => x.state), 'a recovery clears the markers; the item is its owner\'s to close').toEqual(['open']);
    await settle();
    sixEvidence('A6', { fault_trace: { suspended_event: shc.id, active_event: back.id }, watermark: { markers_set: active.map((x) => `${x.subject_kind}:${x.subject_id}`), cleared: m2.length },
      consumer_behaviour: 'source-health set markers on the derived products and routed source.coverage_loss; cleared them on active', operator_action: 'the collection manager suspends and reactivates the source through the route',
      recovery: 'markers cleared by the reactivation event', reconciliation: { item: coverageItem, forecasts: issued.length, warnings: openWarnings.length, packages: 1 } });
  }, 300_000);

  it('A7 · OBSERVATIONS: a real upload → ObservationRecorded → the transformation plan: no_plan with its reason while no active method reads the source; SELECTED (the method named) once an extraction method is registered, approved and activated through the routes', async () => {
    await settle();
    const t0 = await mark();
    const [u1] = await h.upload([{ filename: 'b22-obs-1.csv', text: 'date,value\n2024-01-15,41\n', documentTime: '2024-01-15T00:00:00Z' }]);
    const or1 = await outboxEvent('ObservationRecorded', t0, (p) => p['evd_object_id'] === u1!.id);
    expect(or1.payload).toMatchObject({ schema_version: 'v1', evd_object_id: u1!.id, evd_version: u1!.version, source_id: w.uploadSourceId, acquisition_mode: 'replay' });
    const d1 = await flatDelivered(or1.id, 'observations');
    expect(d1.items).toEqual([`evidence:${u1!.id}`]);
    expect(d1.items_applied[0]).toMatchObject({ effect: 'plan.none', details: { outcome: 'no_plan', evd_object_id: u1!.id, source_id: w.uploadSourceId } });
    const s1 = await selections(u1!.id);
    expect(s1).toEqual([expect.objectContaining({ outcome: 'no_plan', methods: [], reason: 'no extraction method of this domain reads this source', source_id: w.uploadSourceId, acquisition_mode: 'replay', outbox_event_id: or1.id, evd_version: u1!.version })]);
    /* AN ACTIVE METHOD (any source) through the real routes: registered by an analyst, approved and activated by an extraction manager. */
    const registrar = await h.principalWith(['domain_analyst'], 'b22-registrar');
    const extractionManager = await h.principalWith(['extraction_manager'], 'b22-extraction-manager');
    const m = await intelligence.registerMethod(h.req(registrar, 'intelligence.method.register', 'MTH', null, 'intelligence'), T(), D(), { payload: {
      methodKey: 'b22-claim-extraction', name: 'B22 claim extraction', targetTypes: ['CLM'], gatewayMode: 'replay', modelId: 'b22-local-model', modelWeightsDigest: sha256('b22-weights'),
      runtimeVersion: 'ollama/0.33.2', promptRef: 'extract/b22', promptVersion: 'v1', promptText: 'Return {"claims":[...]} or {"abstain":true,"reason":"..."} and nothing else.', decoding: { temperature: 0, seed: 11 },
      confidenceFloor: 0.3, reviewBelow: 0.5, budgetCalls: 80, budgetSeconds: 180 } as never }) as unknown as { method: { methodId: string } };
    const methodId = m.method.methodId;
    const t1 = await mark();
    const [u0] = await h.upload([{ filename: 'b22-obs-0.csv', text: 'date,value\n2024-01-15,40\n', documentTime: '2024-01-15T00:00:00Z' }]);
    const or0 = await outboxEvent('ObservationRecorded', t1, (p) => p['evd_object_id'] === u0!.id);
    await flatDelivered(or0.id, 'observations');
    expect((await selections(u0!.id))[0]).toMatchObject({ outcome: 'no_plan', reason: 'the methods that read this source are not active (draft, approved, suspended or retired)' });
    await intelligence.approveMethod(h.req(extractionManager, 'intelligence.method.approve', 'MTH', methodId, 'intelligence'), T(), D(), methodId, { payload: { reason: 'B22 harness: reviewed' } } as never);
    await intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', methodId, 'intelligence'), T(), D(), methodId, { payload: { target: 'active', reason: 'B22 harness: ready to extract' } } as never);
    await settle();
    const t2 = await mark();
    const [u2] = await h.upload([{ filename: 'b22-obs-2.csv', text: 'date,value\n2024-01-16,39\n', documentTime: '2024-01-16T00:00:00Z' }]);
    const or2 = await outboxEvent('ObservationRecorded', t2, (p) => p['evd_object_id'] === u2!.id);
    const d2 = await flatDelivered(or2.id, 'observations');
    expect(d2.items_applied[0]).toMatchObject({ effect: 'plan.selected', details: { outcome: 'selected' } });
    const s2 = await selections(u2!.id);
    expect(s2).toHaveLength(1);
    expect(s2[0]).toMatchObject({ outcome: 'selected', reason: '1 active extraction method(s) read this source; the run is an extraction agent\'s governed act' });
    expect(s2[0]!.methods).toEqual([expect.objectContaining({ method_id: methodId, method_key: 'b22-claim-extraction', target_types: ['CLM'], reads: 'any source' })]);
    // nothing ran: the selection is a plan, the extraction run stays an agent's act (stated)
    expect((await sql<{ n: number }>`select count(*)::int n from intelligence.runs_current where method_id = ${methodId}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    // A8 needs the review roles held by NOBODY at first (the unrouted path): the extraction manager's binding is revoked by the superuser (stated).
    await sql`update identity.role_bindings set revoked_at = clock_timestamp() where principal_id = ${extractionManager.principalId}::uuid and revoked_at is null`.execute(su);
    await settle();
    sixEvidence('A7', { fault_trace: { uploads: [u1!.id, u0!.id, u2!.id], events: [or1.id, or0.id, or2.id] }, watermark: { first: 'no_plan (no method)', draft: 'no_plan (not active)', active: 'selected' }, consumer_behaviour: 'observations selected the plan once per event and evidence',
      operator_action: 'the method registered, approved and activated through the routes', recovery: 'none', reconciliation: { method: methodId, runs: 0, note: 'the extraction manager binding revoked afterwards by the superuser for A8 (stated)' } });
  }, 240_000);

  it('A8 · PROPOSALS: a PLANTED ClaimsExtracted row naming two PLANTED claims (one held for review, one admitted without) → the held claim routed as proposal.review (UNROUTED while nobody holds extraction_manager/knowledge_owner: escalated at once to domain_admin), the other recorded no_review_required, nothing promoted; a second event after a knowledge owner exists → routed OPEN and acknowledged; an IntelligenceObjectAdmitted of a non-candidate type skipped', async () => {
    // PLANTED (stated): no cheap real extraction run exists in this world; the claims, their review ledger rows and the ClaimsExtracted row are what a run leaves.
    const held = await plantClaim(w.evd, true, 0.42);
    const plain = await plantClaim(w.evd, false, 0.93);
    await settle();
    const e1 = await plantOutbox('ClaimsExtracted', { schema_version: 'v1', run_id: held.runId, method_id: held.methodId, mode: 'replay', claims: [held.claimId, plain.claimId] });
    const d1 = await flatDelivered(e1, 'proposals');
    expect(d1.items).toEqual(sorted([`claim:${held.claimId}`, `claim:${plain.claimId}`]));
    const byItem = Object.fromEntries(d1.items_applied.map((x) => [x.item, x]));
    expect(byItem[`claim:${plain.claimId}`]).toMatchObject({ effect: 'no_review_required', effect_ref: null, details: { claim_object_id: plain.claimId } });
    expect(byItem[`claim:${held.claimId}`]).toMatchObject({ effect: 'review.routed', details: { outcome: 'material', state: 'escalated', policy_version: 2 } });
    const [pi] = await itemsOf('proposal.review', held.claimId);
    unroutedItem = pi!.item_id;
    expect(pi).toMatchObject({ subject_kind: 'claim', outcome: 'material', state: 'escalated', escalations: 1, owner_principal_id: null, route_roles: ['domain_admin', 'extraction_manager', 'knowledge_owner'], cause_event_type: 'ClaimsExtracted' });
    expect(obj(pi!.evaluation['dimensions'])).toMatchObject({ consequence: 'C1', confidence: 1, claim_confidence: 0.42, queued_reason: 'below_review_threshold' });
    expect(obj(pi!.details)).toMatchObject({ claim_object_id: held.claimId, review_case_id: held.caseId, promoted: false });
    expect((await itemEvents(unroutedItem)).map((e) => [e.event, e.details['unrouted']])).toEqual([['item.escalated', true]]);
    expect(await itemsOf('proposal.review', plain.claimId)).toEqual([]);
    // nothing promoted: the review case still queued, the claim unchanged
    expect((await sql<{ state: string }>`select state from intelligence.review_current where case_id = ${held.caseId}::uuid`.execute(su)).rows[0]!.state).toBe('queued');
    expect((await sql<{ n: number }>`select count(*)::int n from objects.canonical_objects where object_id = ${held.claimId}::uuid`.execute(su)).rows[0]!.n).toBe(1);
    /* A KNOWLEDGE OWNER in the domain: the next held claim is routed OPEN to the review roles; the owner acknowledges. */
    const knowledgeOwner = await h.humanWithSession(['knowledge_owner'], 'b22-knowledge-owner');
    const held2 = await plantClaim(w.evd, true, 0.47);
    const e2 = await plantOutbox('ClaimsExtracted', { schema_version: 'v1', run_id: held2.runId, method_id: held2.methodId, mode: 'replay', claims: [held2.claimId] });
    await flatDelivered(e2, 'proposals');
    const [pi2] = await itemsOf('proposal.review', held2.claimId);
    routedProposalItem = pi2!.item_id;
    expect(pi2).toMatchObject({ outcome: 'material', state: 'open', escalations: 0, route_roles: ['extraction_manager', 'knowledge_owner'] });
    expect((await acknowledge(knowledgeOwner, routedProposalItem, 'queued for my review this week (harness)')).item).toMatchObject({ state: 'acknowledged' });
    /* A NON-CANDIDATE TYPE: IntelligenceObjectAdmitted of an EVD — skipped (no item), the delivery applied. */
    const e3 = await plantOutbox('IntelligenceObjectAdmitted', { schema_version: 'v1', object_id: w.evd.id, object_type: 'EVD', object_version: w.evd.version });
    const d3 = await flatDelivered(e3, 'proposals');
    expect(d3.items).toEqual([]);
    expect(await itemsCausedBy(e3)).toBe(0);
    await settle();
    sixEvidence('A8', { fault_trace: { planted: { claims: [held.claimId, plain.claimId, held2.claimId], events: [e1, e2, e3] } }, watermark: { unrouted: unroutedItem, routed: routedProposalItem },
      consumer_behaviour: 'proposals routed the held claims, recorded no_review_required for the admitted one, skipped the EVD; nothing promoted', operator_action: 'the knowledge owner acknowledges',
      recovery: 'the unrouted item escalated at once to domain_admin (ES-47)', reconciliation: { review_state: 'queued', effects: d1.items_applied.map((x) => x.effect) } });
  }, 180_000);

  it('A9 · QUARANTINE: PLANTED outbox rows of subscribed types whose payloads are not the contract → each delivery UNRESOLVED with failure_class invalid_event and disposition human_review, the item event:<id> with effect event.quarantined; nothing routed, no marker, no plan', async () => {
    await settle();
    const bad1 = await plantOutbox('SourceHealthChanged', { schema_version: 'v1', source_id: 'not-a-source', state: 'suspended' });
    const bad2 = await plantOutbox('ObservationRecorded', { schema_version: 'v1', evd_object_id: 42 });
    const bad3 = await plantOutbox('ForecastFitnessChanged', { schema: 'SomethingElse', forecast_id: uuidv7() });
    const bad4 = await plantOutbox('SourceHealthChanged', { schema_version: 'v1', source_id: h.fx.sourceId });
    const out: Row = {};
    for (const [id, kind] of [[bad1, 'source-health'], [bad2, 'observations'], [bad3, 'attention'], [bad4, 'source-health']] as Array<[string, ConsumerKind]>) {
      const d = await flatDelivered(id, kind, 'unresolved');
      expect(d, `${kind} ${id}`).toMatchObject({ state: 'unresolved', failure_class: 'invalid_event', disposition: 'human_review', items: [`event:${id}`], items_applied: [] });
      expect(d.items_unresolved).toHaveLength(1);
      expect(d.items_unresolved[0]).toMatchObject({ item: `event:${id}`, effect: 'event.quarantined' });
      expect(d.items_unresolved[0]!.reason).toMatch(/invalid event: .* is not the contract \(.*\); quarantined for a person/);
      expect(await itemsCausedBy(id), 'nothing routed').toBe(0);
      out[kind + ':' + id.slice(-6)] = d.items_unresolved[0]!.reason;
    }
    expect((await sql<{ n: number }>`select count(*)::int n from observation.source_impact_markers where set_by_event = any(${[bad1, bad4]}::uuid[]) or cleared_by_event = any(${[bad1, bad4]}::uuid[])`.execute(su)).rows[0]!.n).toBe(0);
    expect((await sql<{ n: number }>`select count(*)::int n from intelligence.plan_selections where outbox_event_id = ${bad2}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    // the rows themselves are the committed publication — published, never dropped
    expect((await sql<{ status: string }>`select status from objects.object_outbox where id = any(${[bad1, bad2, bad3, bad4]}::uuid[])`.execute(su)).rows.map((r) => r.status)).toEqual(['published', 'published', 'published', 'published']);
    await settle();
    sixEvidence('A9', { fault_trace: { planted: [bad1, bad2, bad3, bad4] }, watermark: 'unresolved (invalid_event → human_review)', consumer_behaviour: out, operator_action: 'none: a person reviews the quarantined events',
      recovery: 'the outbox rows stay published; a corrected event would be a new row', reconciliation: { routed: 0, markers: 0, plans: 0 } });
  }, 180_000);

  it('A10 · ESCALATION: an overdue item (its due_at moved into the past by the SUPERUSER — stated) escalated by the executive\'s route to the class\'s escalation roles (escalations 1, a new deadline); at max_escalations the exhaustion recorded ONCE; a lapsed suppression reopened; the unrouted item\'s escalation at once restated', async () => {
    await settle();
    // a short suppression of the coverage item (suppression allowed, 48 h max) — it lapses in three seconds
    const sup = (await suppress(h.manager, coverageItem, new Date(Date.now() + 3_000), 'the publisher promised a fix within the minute (harness)')).item;
    expect(sup).toMatchObject({ state: 'suppressed' });
    // the SUPERUSER moves the warning item's deadline into the past (stated: no clock is advanced in a harness)
    await sql`update executive.attention_items set due_at = clock_timestamp() - interval '5 minutes' where item_id = ${warningItem}::uuid`.execute(su);
    expect((await getItem(warningItem)).item['overdue']).toBe(true);
    await sleep(3_500);
    const r1 = (await escalateDue()).escalation;
    expect(r1.escalated).toEqual([warningItem]);
    expect(r1.lapsed).toEqual([coverageItem]);
    expect(r1.exhausted).toEqual([]);
    const esc = await itemRow(warningItem);
    expect(esc).toMatchObject({ state: 'escalated', escalations: 1, route_roles: ['domain_admin', 'executive', 'strategy_owner'] });
    expect(esc.due_at!.getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
    expect((await itemEvents(warningItem)).at(-1)).toMatchObject({ event: 'item.escalated', actor: executive.principalId, details: { escalation: 1, policy_version: 2, route_roles: ['domain_admin', 'executive', 'strategy_owner'] } });
    const lapsed = await itemRow(coverageItem);
    expect(lapsed).toMatchObject({ state: 'open', suppressed_until: null });
    expect((await itemEvents(coverageItem)).map((e) => e.event)).toEqual(['item.routed', 'item.suppressed', 'item.suppression_lapsed']);
    /* THE BOUND: max_escalations 1 — overdue again, the chain is exhausted: recorded once per deadline, nobody paged again. */
    await sql`update executive.attention_items set due_at = clock_timestamp() - interval '5 minutes' where item_id = ${warningItem}::uuid`.execute(su);
    const r2 = (await escalateDue()).escalation;
    expect(r2.escalated).toEqual([]);
    expect(r2.exhausted).toEqual([warningItem]);
    const r3 = (await escalateDue()).escalation;
    expect(r3.exhausted, 'the exhaustion is recorded once per deadline').toEqual([]);
    expect(await itemRow(warningItem)).toMatchObject({ state: 'escalated', escalations: 1 });
    expect((await itemEvents(warningItem)).filter((e) => e.event === 'item.escalated').map((e) => e.details['exhausted'] === true)).toEqual([false, true]);
    // the domain administrator (an escalation role) acknowledges the overdue item; the executive's route is refused to an analyst
    expect(await failure(escalateDue(analyst))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    const ack = (await acknowledge(dadmin, warningItem, 'escalated to me; taking it (harness)')).item;
    expect(ack).toMatchObject({ state: 'acknowledged', from_state: 'escalated', within_deadline: false });
    /* THE UNROUTED item (A8): nobody held its roles, so it was escalated AT ONCE to the class's escalation role (ES-47). */
    expect(await itemRow(unroutedItem)).toMatchObject({ state: 'escalated', escalations: 1 });
    expect((await itemEvents(unroutedItem))[0]).toMatchObject({ event: 'item.escalated', details: { unrouted: true, route_roles: ['domain_admin', 'extraction_manager', 'knowledge_owner'] } });
    await settle();
    sixEvidence('A10', { fault_trace: { overdue: warningItem, moved_by: 'superuser (due_at − 5 min)', suppression: coverageItem }, watermark: { r1, r2: { escalated: r2.escalated, exhausted: r2.exhausted }, r3: { exhausted: r3.exhausted } },
      consumer_behaviour: 'the attention subscriber runs the same escalation at every delivery (settled before the route)', operator_action: 'the executive escalates on demand; the domain administrator acknowledges',
      recovery: 'the lapsed suppression reopened with a fresh deadline', reconciliation: { unrouted: unroutedItem, max_escalations: 1 } });
  }, 180_000);

  it('A11 · POLICY CHANGE + REOPEN (L9-I05): with a committed package in the domain, v3 → AttentionPolicyChanged delivered to the attention subscription → every live item re-evaluated (from/to versions and outcomes; the deprioritized warning now material), the committed package NOTED policy.changed (from = the version in force at the commitment, to = 3), idempotent on a replay; the owner reopens on the policy cause → reopened, DecisionReopened carrying it; a non-owner refused', async () => {
    const P = await c.committed();
    await settle();
    const live = (await sql<{ item_id: string; state: string; outcome: string; policy_version: number }>`select item_id::text, state, outcome, policy_version from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and state <> 'closed' order by item_id`.execute(su)).rows;
    expect(live.length).toBeGreaterThanOrEqual(6);
    for (const x of live) expect(x.policy_version, x.item_id).toBe(2);
    const t0 = await mark();
    const p3 = (await publish(dadmin, RULES_V3(), 'the warning window widened to 25 days; the review queue may be suppressed for a day (harness)')).policy;
    const V3 = String(p3['policy_id']);
    expect(p3).toMatchObject({ version: 3, supersedes: 2, superseded_policy_id: V2, changed_classes: ['proposal.review', 'warning.raised'], set_by: dadmin.principalId });
    expect(sorted(p3['changed_sections'] as string[])).toEqual(['materiality', 'suppression']);
    const e3 = await outboxEvent('AttentionPolicyChanged', t0, (p) => p['policy_id'] === V3);
    const d = await flatDelivered(e3.id, 'attention');
    expect(d.items).toEqual([...live.map((x) => `item:${x.item_id}`).sort(), `package:${P.pkg}`]);
    /* THE RE-EVALUATION: every live item under version 3 — the events carry the versions and the outcomes. */
    for (const x of live) {
      const ev = (await itemEvents(x.item_id)).filter((e) => e.event === 'item.reevaluated');
      expect(ev, x.item_id).toHaveLength(1);
      expect(ev[0]!.details).toMatchObject({ from_version: 2, to_version: 3, from_outcome: x.outcome, from_state: x.state, cause_event_id: e3.id });
      expect((await itemRow(x.item_id)).policy_version).toBe(3);
    }
    const dep = (await itemEvents(deprioritizedItem)).find((e) => e.event === 'item.reevaluated')!;
    expect(dep.details).toMatchObject({ from_outcome: 'below_threshold', to_outcome: 'material', from_state: 'deprioritized', to_state: 'open' });
    expect((dep.details['reasons'] as string[]).at(-1)).toMatch(/hours to the response window, within 600$/);
    expect(await itemRow(deprioritizedItem)).toMatchObject({ outcome: 'material', state: 'open', route_roles: ['strategy_owner', 'executive'], owner_principal_id: strategyOwner.principalId });
    // an acknowledged item keeps its state (the new outcome recorded); a suppressed one keeps its suppression
    expect(await itemRow(warningItem)).toMatchObject({ state: 'acknowledged', policy_version: 3 });
    expect(await itemRow(scenarioItem)).toMatchObject({ state: 'suppressed', policy_version: 3 });
    // the item escalated at once in A8 (nobody held the review roles) KEEPS its escalation history under v3: a policy change never
    // re-pages an exhausted chain from zero — its count, its running deadline and the roles it reached stand, joined with v3's roles
    const unr = await itemRow(unroutedItem);
    expect(unr).toMatchObject({ state: 'escalated', escalations: 1, policy_version: 3 });
    expect(unr['route_roles']).toEqual(expect.arrayContaining(['extraction_manager', 'knowledge_owner', 'domain_admin']));
    expect((await itemEvents(unroutedItem)).map((e) => e.event)).toEqual(['item.escalated', 'item.reevaluated']);
    // a closed item is history: not re-evaluated
    expect((await itemEvents(forecastItem)).some((e) => e.event === 'item.reevaluated')).toBe(false);
    expect((await itemRow(forecastItem)).policy_version).toBe(2);
    /* THE POLICY CAUSE on the committed package (L9-I05). */
    const notes = await packageEvents(P.pkg, 'policy.changed');
    expect(notes).toHaveLength(1);
    const commitAt = (await sql<{ committed_at: Date }>`select committed_at from decision.commitments where package_id = ${P.pkg}::uuid`.execute(su)).rows[0]!.committed_at;
    expect(notes[0]!.details).toMatchObject({ policy_id: V3, from_version: 2, to_version: 3, committed_version: P.v, outbox_event_id: e3.id, subscription_id: subs['attention']!.subscriptionId, automatic: true, changed_classes: ['proposal.review', 'warning.raised'] });
    expect(sorted(notes[0]!.details['changed_sections'] as string[])).toEqual(['materiality', 'suppression']);
    expect(notes[0]!.occurred_at.getTime()).toBeGreaterThan(commitAt.getTime());
    expect(d.items_applied.find((x) => x.item === `package:${P.pkg}`)).toMatchObject({ effect: 'policy.noted', effect_ref: notes[0]!.event_id });
    expect((await sql<{ state: string }>`select state from decision.packages_current where package_id = ${P.pkg}::uuid`.execute(su)).rows[0]!.state, 'nothing is reopened by the subscriber').toBe('committed');
    /* IDEMPOTENT ON RE-DRIVE: the attention subscription replayed from the policy event — the note once, the items unchanged. */
    await settle();
    // the replay point is EXCLUSIVE (0064: the rows after the point's row are re-driven) — the point is the row before the policy event
    const rp = await replay(subs['attention']!.subscriptionId, e3.partition_seq - 1, 'B22 A11: re-drive the policy change (harness)');
    expect(rp.events).toContain(e3.id);
    const redriven = await waitFor('the policy event re-applied', () => deliveriesFor(e3.id), (rows) => rows.some((x) => x.consumer_kind === 'attention' && x.state === 'applied' && x.replay_seq >= 1), 120_000);
    await settle();
    const rd = redriven.find((x) => x.consumer_kind === 'attention')!;
    expect(rd.items_applied.find((x) => x.item === `package:${P.pkg}`)).toMatchObject({ effect: 'policy.not_noted', details: { noted: false, note: 'already noted for this cause' } });
    expect(rd.items_applied.filter((x) => x.item.startsWith('item:')).every((x) => x.effect === 'item.unchanged')).toBe(true);
    expect(await packageEvents(P.pkg, 'policy.changed')).toHaveLength(1);
    for (const x of live) expect((await itemEvents(x.item_id)).filter((e) => e.event === 'item.reevaluated'), x.item_id).toHaveLength(1);
    /* THE REOPEN on the policy cause: the owner alone. */
    const reopen = (as: AuthenticatedPrincipal) => decisions.reopen(h.req(as, 'decision.package.reopen', 'DPK', P.pkg, 'decision'), T(), D(), P.pkg, { payload: { cause: { kind: 'policy_changed', ref: notes[0]!.event_id } } }) as unknown as Promise<{ reopened: Row }>;
    await refused(reopen(w.authorApprover), /^reopen rejected: the package owner reopens it/, 403, 'EYE-AUT-001');
    await refused(decisions.reopen(h.req(w.owner, 'decision.package.reopen', 'DPK', P.pkg, 'decision'), T(), D(), P.pkg, { payload: { cause: { kind: 'policy_changed', ref: uuidv7() } } }), /^reopen rejected: no such policy note/, 404);
    const t1 = await mark();
    const ro = (await reopen(w.owner)).reopened;
    expect(ro).toMatchObject({ committed_version: P.v, cause: { kind: 'policy_changed', ref: notes[0]!.event_id, policy_id: V3, from_version: 2, to_version: 3 } });
    expect(ro['exposed_inputs']).toEqual([{ kind: 'attention_policy', id: V3, from_version: 2, to_version: 3 }]);
    expect((await sql<{ state: string; reopen_cause: Row }>`select state, reopen_cause from decision.packages_current where package_id = ${P.pkg}::uuid`.execute(su)).rows[0]).toMatchObject({ state: 'reopened', reopen_cause: { kind: 'policy_changed' } });
    const dr = await outboxEvent('DecisionReopened', t1, (p) => p['package_id'] === P.pkg);
    expect(dr.payload).toMatchObject({ schema: 'DecisionReopened', schema_version: 'v1', committed_version: P.v, recorded_cause: { kind: 'policy_changed', ref: notes[0]!.event_id, policy_id: V3, from_version: 2, to_version: 3, outbox_event_id: e3.id }, cause: { action: 'decision.package.reopen', actor: w.owner.principalId } });
    expect(sorted(obj(dr.payload['recorded_cause'])['changed_classes'] as string[])).toEqual(['proposal.review', 'warning.raised']);
    await settle();
    sixEvidence('A11', { fault_trace: { v3: V3, event: e3.id, package: P.pkg }, watermark: { reevaluated: live.length, deprioritized_now: 'material/open', note: notes[0]!.event_id },
      consumer_behaviour: { effects: d.items_applied.map((x) => x.effect), replayed: rd.items_applied.map((x) => x.effect) }, operator_action: 'the domain administrator publishes v3; the owner reopens on the policy cause; a non-owner refused',
      recovery: 'the reopened package opens a new draft version (carried options)', reconciliation: { from_version: 2, to_version: 3, notes: 1, decision_reopened: dr.id } });
  }, 300_000);
});
