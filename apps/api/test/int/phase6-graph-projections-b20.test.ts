/**
 * CP-6 B20 (migration 0080) — INDEX-TIER DEGRADATION: the six derived projections a domain's reads serve from (graph.entities_current,
 * graph.resolutions_current, graph.edges_current, graph.strategy_current, graph.invalidations_current, memory.items_current — there is no
 * lexical or vector index in this product; the index tier IS the projection set) become PARTITIONS with a state (serving | withdrawn), a
 * DERIVED watermark (the domain's latest GraphChanged/MemoryCorrected sequence — the revision; the sequence the retrieval subscriber has
 * VERIFIED through — the live contiguous applied prefix of its deliveries, C2; the dispatcher's stored cursor answered beside it; the lag;
 * the unresolved deliveries) and a representation version (the derivation rule's, a SQL constant); the retrieval check is SYMMETRIC (a row
 * whose state differs from its log — mismatched; a row the log has and the projection lacks — missing; a row the projection has and the
 * log does not know — unexpected, POISONED; a partition verified under an outdated representation) and WITHDRAWS every partition it fails
 * in its own transaction; the operator withdraws on suspicion (graph.projection.withdraw) and REBUILDS (graph.projection.rebuild — the only
 * way back to serving: drifted rows re-stated from the log, missing rows written from what the log or the canonical record carries,
 * poisoned rows removed, the unrebuildable NAMED and the held poison REFUSED, a re-check that must pass, one GraphChanged/projection.rebuilt
 * the retrieval consumer re-verifies); every one of the twelve exploration and memory reads carries the projection block and, while a
 * partition is withdrawn, serves the LAST VALID STATE from the event log (drift named, missing rows metadata-only, poisoned rows never),
 * constrains the traversals to depth 2 with bound.projection and labels the answer; the memory CONTENT tier (the canonical versions) that
 * does not answer yields a metadata-only retrieval with no access row and its own ledger row; a deletion whose safe scope reads a withdrawn
 * partition PAUSES at execution; a briefing composed over a withdrawn memory projection says degraded and an agent with on_degraded stops —
 * on a real database with real Redis, the real outbox publisher and the real subscription dispatcher (EYE_SCHEDULER_ENABLED at module top,
 * the B6 rule), ALL SEVEN consumers registered in the harness's own domain D (the B18 idiom) and a SECOND domain DX for the held-poison
 * refusals so D's entities_current is never left withdrawn.
 *
 *   P1 · THE WATERMARK ON EVERY READ (AU-MEM-0068; V03-T-108; FEX-08; PR-19-001/002; DP-33-005): after one change applied, each of the twelve
 *   routes answers condition current, revision = verified_seq = the event's partition sequence, the check that verified, the route's
 *   partitions serving under representation 1; the retrieval subscription PAUSED → the next change reaches the five others only and every
 *   read says lagging with the verification-lag label (lag is verification lag, never data lag); RESUMED → the re-drive applies it, current
 *   again; REVOKED → unverified with the no-subscription label; registered anew → unverified with the registered-but-nothing-verified label
 *   (C1: a subscription that has applied no check has no watermark) until its first check applies → current.
 *
 *   P2 · DRIFT → THE AUTOMATIC WITHDRAWAL → THE LABELLED LAST-VALID READS AND THE CONSTRAINED WALK → THE REBUILD → THE PASSING CHECK AND THE
 *   RE-DRIVEN DELIVERY APPLIED (AU-MEM-0068/-0070/-0083 "stale"; IA-34-005; V03-T-098/-112): E1 retired by superuser SQL; the next change's
 *   check reads mismatched 1 and withdraws entities_current (the partition row names the check and the subscriber; the ledger row says
 *   retrieval_check); the delivery unresolved with the withdrawal named; /entities/:E1/get serves the LOG's state with drift and the
 *   withdrawn + held-lagging label, /entities/list and /search (the entity hit from the log) likewise, /neighbourhood constrained to depth
 *   2 with bound.projection and the label first, /path bound.projection, /edges/list LAGGING (its partition serving; the domain's withdrawal
 *   named in the held form — the block names only the route's partitions), /overview from the log; the analyst's rebuild 403; the domain
 *   administrator's rebuild → rebuilt, updated 1, the row active, serving; ONE GraphChanged/projection.rebuilt with no identities, no
 *   relationships, no walk and the typed block, its SIX deliveries (retrieval verified; the five others applied with nothing — C4; the
 *   relationships subscriber selects MemoryCorrected/claim.corrected alone and receives none); BETWEEN the rebuilt event and the re-drive a
 *   read of a serving partition says lagging with the "since rebuilt" held form (C2); the re-drive applies the drift event's delivery after
 *   two checks [1, 0]; the dispatcher's cursor stands at the drift event, the prefix at the rebuilt event, every read current.
 *
 *   P3 · THE POISONED PARTITION (AU-MEM-0083 "poisoned"; DP-38-005): (a) in D a row with no event → unexpected 1 where the JOIN-only check of
 *   0065 read 0 (pinned on the row itself), withdrawn, the row absent from every read (list, search, get 404), removed by the rebuild
 *   (dangling []); (c) in DX a poisoned entity held ONLY by a poisoned edge → the rebuild refused naming the shape (held only by rows the
 *   log does not know) and the partition to rebuild first; edges_current withdrawn and rebuilt → the poisoned edge removed; (b) in DX a
 *   poisoned entity held by a DERIVED edge (its event and lineage) → refused naming the holder (held_by_derived 1), nothing written, the
 *   partition withdrawn, the DX reads labelled — the two poison shapes told apart; DX left withdrawn (stated: a person decides).
 *
 *   P4 · THE MISSING ROW (AU-MEM-0070; V03-T-101/-112): E3 deleted → missing 1 → withdrawn → listed metadata-only from the log and re-inserted
 *   by the rebuild with the seeded columns; the EDGE X1 deleted → served from the log with the provenance columns null, present in the
 *   constrained walk, re-inserted from edge.asserted + the claim's lineage row; the UNREBUILDABLE edge X2 (no lineage row) → the rebuild
 *   refused naming the row and the claim version, then the operator supplies the lineage and the rebuild inserts it; the MEMORY item M1
 *   deleted → listed projected false and stale, re-inserted from the canonical version 1.
 *
 *   P5 · THE UNAPPROVED REPRESENTATION VERSION (AU-MEM-0083): the partition's representation_version set to '0' → representation_ok false →
 *   withdrawn with "representation outdated (current 1)" → the reads say so → the rebuild restores under '1' (nothing to write). The flip
 *   stands in for a derivation-rule change, which arrives with a migration that bumps the constant.
 *
 *   P6 · THE MEMORY WORKSPACE (AU-MEM-0067; FEX-09; DP-37-005): (a) M1's version drifted → withdrawn → the retrieval served with index_state
 *   stale, the LOG's current version, drift active@7 / active@1, the access row on version 1; the briefing degraded with projection.memory
 *   withdrawn; the briefing agent with on_degraded STOPS; the rebuild → updated 1 → the agent finishes, not degraded; (a2) the POLICY columns
 *   widened → mismatched 1 (C6) → the retrieval stale without a state/version drift, the analyst still refused under a purpose the served
 *   version's audience does not admit, the rebuild re-projects the purposes; (b) THE CONTENT TIER: the fault point b20.memory_content_unavailable
 *   armed — a refused reader consumes it and learns nothing (the audience-list gate, C5/C7), then the reader's retrieval answers 200
 *   METADATA-ONLY (content unavailable, EYE-DEG-001, no version, NO access row, ONE memory.retrieval_degraded ledger row, the audit row's
 *   result code) and the next retrieval serves the content with an access row — the recovery; (b2) the narrower gate: an item whose audience
 *   list lacks the admitted purpose is served with the tier up and refused with it down; (c) the operator's withdrawal of memory_items_current
 *   → stale without drift; (d) withdrawn AND the tier down → the one refusal B20 adds to a read (503 EYE-DEG-001); the rebuild restores.
 *
 *   P7 · THE DELETION PAUSED while edges_current is withdrawn (DP-37-005; ES-33-009): an approved deletion refused at execution
 *   (projection_withdrawn) — the action paused unresolved_dependency → human review, attempts 0, the approvals revoked, action.paused with
 *   attempted false; the rebuild, a re-resolution and a new approval execute it; the manifest tombstoned.
 *
 *   P9 · THE OPERATOR'S ACTS: the withdrawal idempotent (a second reason recorded, no state change), the strategy reads from the log-join,
 *   the rebuild restoring, a rebuild of a serving partition refused 409, the analyst's withdrawal 403, an unknown projection 404, a short
 *   reason 422, a foreign domain 403 EYE-TEN-001 (C13: the domain exists; the principal has no standing there), the register (36/14/0 at B20; 40/10/0 since 0081 — the one pin B21 moved in this file) with
 *   L3-I02's B20 clause.
 *
 *   P8 · THE SEARCH'S COMPLETENESS (V03-T-098), LAST: 1,001 entities with their events → complete.entities false, the bound named, 50 hits,
 *   the projection current after the next check (nothing unexpected).
 *
 * EACH CASE LOGS THE SIX THINGS V04-T-024/026 DEMAND (the fault trace, the affected-product watermark, the consumer behaviour, the
 * operator action, the recovery, the reconciliation) as one B20 EVIDENCE line, so the run's log is the record (C16).
 *
 * Read against the design's own statements, what this harness does NOT claim: the lock between a check and a rebuild is proven by the
 * advisory keys, not by two concurrent processes (C3); a held poisoned entity is left to a person (no forced removal); the evidence bytes'
 * unavailability stays the vault's 409 (D10); a connection-class failure of the content tier is not exercised (D9); the DX domain registers
 * no subscription, so its reads say withdrawn / unverified and its rebuilds' events are delivered to nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ProjectionsController } from '../../src/graph/projections/projections.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { TenancyController } from '../../src/tenancy/tenancy.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { CONSUMER_EVENT_TYPES, CONSUMER_KINDS, type ConsumerKind } from '../../src/graph/subscriptions/graph-change.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ROUTE_PARTITIONS, type ProjectionBlock, type ProjectionName } from '../../src/graph/projections/projection-state.js';
import * as fault from '../../src/observation/fault-injection.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

type Row = Record<string, unknown>;
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
type OutboxRow = { id: string; status: string; payload: Row; correlation_id: string; created_at: Date; partition_key: string; partition_seq: number };
type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; attempts: number; items: string[];
  items_applied: Array<{ item: string; effect: string; effect_ref: string | null; resolved_after_checks: number | null; details: Row }>;
  items_unresolved: Array<{ item: string; effect: string; effect_ref: string | null; reason: string; checks: number }>;
  failure_class: string | null; disposition: string | null; unresolved_since: Date | null; last_error: string | null; partition_seq: string | null };
type RouteName = keyof typeof ROUTE_PARTITIONS;
/** The twelve reads, in the design's order (§5 P1). */
const ROUTES = Object.keys(ROUTE_PARTITIONS) as RouteName[];
/** The six consumer kinds a GraphChanged reaches; the seventh (`relationships`) selects MemoryCorrected/claim.corrected alone (B9) and is registered too, so its absence from every GraphChanged delivery is a fact of the registry (C4). 0083 (B22): so are the four kinds B22 adds (observations, source-health, proposals, attention), which select their own flat events and never GraphChanged. */
const GRAPH_KINDS = CONSUMER_KINDS.filter((k) => k !== 'relationships' && CONSUMER_EVENT_TYPES[k].includes('GraphChanged'));
/** The six partitions in the port's fixed order. */
const SIX: ProjectionName[] = ['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The labels, as literals (design §2.2, C1, C2; copied, never retyped). */
const LABEL_NO_SUBSCRIPTION = 'no live retrieval subscription verifies this domain\'s projections; the projection watermark is unknown';
const LABEL_NOTHING_VERIFIED = 'a retrieval subscription is registered and has verified nothing yet (no check applied); the projection watermark is unknown until its first check applies';
const LAG_TAIL = ' — the ports write a projection and its log in one transaction, so this is verification lag, not data lag';
const CONTENT_UNAVAILABLE_LABEL = 'the content tier did not answer; this is the item\'s metadata (its state, versions and audience) — the statement is not served; retry or contact the operator';

let h: Phase4Harness; let su: AnyDb;
let graph: GraphController; let projections: ProjectionsController; let retention: RetentionController; let observation: ObservationController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let owner: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let reader: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let dxAdmin: AuthenticatedPrincipal;
let DX = '';
const subs: Partial<Record<ConsumerKind, { subscriptionId: string; principalId: string }>> = {};
const E1 = uuidv7(); const E2 = uuidv7(); const E3 = uuidv7(); const X1 = uuidv7(); const C1 = uuidv7();
const E1_NAME = 'Bab el-Mandeb Strait'; const E2_NAME = 'NORDWERK Magnet GmbH'; const E3_NAME = 'E3 Holding AG';
let B: Evd;
let M1 = '';
let changes = 0;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
const obj = (v: unknown): Row => (v ?? {}) as Row;
const instantOf = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
/** A marker on the DATABASE clock (outbox created_at is the write transaction's now(); both come back at millisecond precision, so the match is >=). */
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
/** A refusal as the caller sees it: the HttpException's status and the dashed catalogue code, or a port's raw SQLSTATE and text. */
const failure = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  try { await p; return { status: null, code: null, message: '' }; } catch (e) {
    if (e instanceof HttpException) { const r = e.getResponse() as { code?: string; message?: string }; return { status: e.getStatus(), code: r.code ?? null, message: String(r.message ?? '') }; }
    return { status: null, code: (e as { code?: string }).code ?? null, message: (e as Error).message };
  }
};
/** A refused call: the message and the status the product answers — the HttpException's own (a service, the PDP), or the mapper's for a port's raw refusal (asObservationRefusal, as observation.filter.ts maps it on the HTTP path; the B18 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};

/* ───────────── the outbox, the deliveries, the checks, the ledgers ───────────── */
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, items_unresolved, failure_class, disposition, unresolved_since, last_error, partition_seq::text
     from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(su)).rows;
const checksFor = async (eventId: string) =>
  (await sql<{ check_id: string; mismatched: number; projections: Row[] }>`select check_id::text, mismatched::int, projections from graph.retrieval_checks where outbox_event_id = ${eventId}::uuid order by checked_at`.execute(su)).rows;
const outboxRows = async (eventType: string, where: (p: Row) => boolean = () => true, after: Date | null = null, domainId = D()): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, payload, correlation_id::text, created_at, partition_key, partition_seq::int from objects.object_outbox
     where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${domainId}::uuid and (${after}::timestamptz is null or created_at >= ${after}::timestamptz) order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload));
const allTerminal = (rows: Delivery[], n: number) => rows.length === n && rows.every((d) => d.state !== 'received');
const allApplied = (rows: Delivery[], n: number) => rows.length === n && rows.every((d) => d.state === 'applied');
const publishedEvent = (kind: string, after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow> =>
  waitFor(`the GraphChanged/${kind} row published`, () => outboxRows('GraphChanged', (p) => obj(p['change'])['kind'] === kind && where(p), after), (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);
/** The domain's latest retrieval check (the check row the withdrawal names). */
const latestCheck = async (domainId = D()) =>
  (await sql<{ check_id: string; outbox_event_id: string; subscription_id: string; mismatched: number; projections: Row[] }>`select check_id::text, outbox_event_id::text, subscription_id::text, mismatched::int, projections from graph.retrieval_checks where tenant_id = ${T()}::uuid and domain_id = ${domainId}::uuid order by checked_at desc limit 1`.execute(su)).rows[0]!;
const checkRowOf = (chk: { projections: Row[] }, projection: ProjectionName): Row => chk.projections.find((p) => p['projection'] === projection) as Row;
type PartitionRow = { projection: string; state: string; withdrawn_at: Date | null; withdrawn_by: string | null; withdrawn_reason: string | null; withdrawn_by_check: string | null; representation_version: string; last_rebuild_id: string | null; rebuilt_at: Date | null };
const partition = async (projection: ProjectionName, domainId = D()): Promise<PartitionRow | undefined> =>
  (await sql<PartitionRow>`select projection, state, withdrawn_at, withdrawn_by::text, withdrawn_reason, withdrawn_by_check::text, representation_version, last_rebuild_id::text, rebuilt_at from graph.projection_partitions where tenant_id = ${T()}::uuid and domain_id = ${domainId}::uuid and projection = ${projection}`.execute(su)).rows[0];
type ProjectionEvent = { event_id: string; event: string; actor_principal_id: string; details: Row };
const pevents = async (projection: ProjectionName, domainId = D()): Promise<ProjectionEvent[]> =>
  (await sql<ProjectionEvent>`select event_id::text, event, actor_principal_id::text, details from graph.projection_events where tenant_id = ${T()}::uuid and domain_id = ${domainId}::uuid and projection = ${projection} order by occurred_at, event_id`.execute(su)).rows;
const cursorOf = async (subscriptionId: string) =>
  (await sql<{ checkpoint_seq: string | null; checkpoint_event_id: string | null; status: string }>`select checkpoint_seq::text, checkpoint_event_id::text, status from graph.subscriptions where subscription_id = ${subscriptionId}::uuid`.execute(su)).rows[0]!;
const entityRow = async (id: string) => (await sql<{ lifecycle_state: string; entity_type: string; canonical_name: string; normalized_name: string; created_by: string; correlation_id: string }>`select lifecycle_state, entity_type, canonical_name, normalized_name, created_by::text, correlation_id::text from graph.entities_current where entity_id = ${id}::uuid`.execute(su)).rows[0];
const edgeRow = async (id: string) => (await sql<{ state: string; evidence_object_id: string; evidence_digest: string; method_id: string | null; run_id: string | null; confidence: string; claim_object_id: string; claim_version: number }>`select state, evidence_object_id::text, evidence_digest, method_id::text, run_id::text, confidence::text, claim_object_id::text, claim_version::int from graph.edges_current where edge_id = ${id}::uuid`.execute(su)).rows[0];
type ItemRow = { object_version: number; state: string; title: string; statement: string; classification: string; audience_purposes: string[]; derivation: Row | null; recorded_by: string; attention_state: string };
const itemRow = async (itemId: string): Promise<ItemRow | undefined> => (await sql<ItemRow>`select object_version::int, state, title, statement, classification, audience_purposes, derivation, recorded_by::text, attention_state from memory.items_current where item_id = ${itemId}::uuid`.execute(su)).rows[0];
const itemEvents = async (itemId: string) => (await sql<{ event: string; object_version: number; details: Row }>`select event, object_version::int, details from memory.item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const accessRows = async (itemId: string) => (await sql<{ object_version: number; purpose_id: string; reader_principal_id: string }>`select object_version::int, purpose_id, reader_principal_id::text from memory.item_access where item_id = ${itemId}::uuid order by accessed_at`.execute(su)).rows;
const auditRowOf = async (auditSeq: number, action: string) => (await sql<{ result_code: string; outcome: string; metadata: Row }>`select result_code, outcome, event -> 'metadata' as metadata from audit.audit_events where audit_seq = ${auditSeq} and tenant_id = ${T()}::uuid and action = ${action} and event_type = 'api.request'`.execute(su)).rows[0];
/** The SIX things V04-T-024/026 demand, logged per case (C16): the run's log IS the record. */
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B20 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the routes (D by h.req; DX by reqIn — C18; the B17 idiom) ───────────── */
const reqIn = (as: AuthenticatedPrincipal, domainId: string, action: string, objectType: string, objectId: string | null, purpose: string) =>
  ({ eyeEnvelope: { ...(h.req(as, action, objectType, objectId, purpose) as { eyeEnvelope: Row }).eyeEnvelope, domain_id: domainId }, eyePrincipal: as }) as never;
const reqFor = (as: AuthenticatedPrincipal, domainId: string, action: string, objectType: string, objectId: string | null, purpose: string) =>
  domainId === D() ? h.req(as, action, objectType, objectId, purpose) : reqIn(as, domainId, action, objectType, objectId, purpose);
const register = (kind: ConsumerKind) => graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
  { payload: { consumerKind: kind, ownerPrincipalId: owner.principalId, backlog: 'leave', ...(kind === 'relationships' ? { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } : {}) } as never }) as Promise<{ subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean } }>;
const control = (to: 'pause' | 'resume' | 'revoke', subscriptionId: string, reason: string) => {
  const req = h.req(domainAdmin, 'graph.subscription.control', 'SUB', subscriptionId, 'platform.administration');
  if (to === 'pause') return graph.pauseSubscription(req, T(), D(), subscriptionId, { payload: { reason } });
  if (to === 'resume') return graph.resumeSubscription(req, T(), D(), subscriptionId, { payload: { reason } });
  return graph.revokeSubscription(req, T(), D(), subscriptionId, { payload: { reason } });
};
const statusOf = (who = analyst) => graph.subscriptionStatus(h.req(who, 'graph.read', 'SUB', null, 'graph'), T(), D()) as unknown as Promise<{ subscriptions: { subscriptions: Row[]; projections: Row[]; projection_events: Row[]; telemetry: { open_failure_states: Row[] } } }>;
/** The six rows of graph.projection_state() as the status route answers them (§3.1). */
const stateRows = async (who = analyst): Promise<Row[]> => (await statusOf(who)).subscriptions.projections;
const withdraw = (who: AuthenticatedPrincipal, projection: string, reason: string, domainId = D()) =>
  projections.withdraw(reqFor(who, domainId, 'graph.projection.withdraw', 'PRJ', null, 'graph'), T(), domainId, projection, { payload: { reason } }) as unknown as Promise<{ projection: Row; receipt: Row }>;
const rebuild = (who: AuthenticatedPrincipal, projection: string, reason: string, domainId = D()) =>
  projections.rebuild(reqFor(who, domainId, 'graph.projection.rebuild', 'PRJ', null, 'graph'), T(), domainId, projection, { payload: { reason } }) as unknown as Promise<{ rebuild: Row; receipt: Row }>;
const interfaces = () => graph.interfaces(h.req(analyst, 'graph.read', 'SUB', null, 'graph'), T(), D()) as Promise<{ interfaces: Row[] }>;
/** The twelve reads by route name; the answer and its projection block (the search's rides inside `search`, the retrieval's inside `memory`, the overview's inside `overview`). */
async function read(who: AuthenticatedPrincipal, route: RouteName, payload: Row = {}, domainId = D()): Promise<{ answer: Row; projection: ProjectionBlock }> {
  const g = (objectType: string, objectId: string | null = null, action = 'graph.read', purpose = 'graph') => reqFor(who, domainId, action, objectType, objectId, purpose);
  let answer: Row;
  switch (route) {
    case 'search': answer = await graph.searchAll(g('SRC'), T(), domainId, { payload: { query: String(payload['query'] ?? 'Bab'), limit: Number(payload['limit'] ?? 50) } }) as unknown as Row; break;
    case 'entitiesList': answer = await graph.listEntities(g('ENT'), T(), domainId, { payload: { limit: Number(payload['limit'] ?? 200) } }) as unknown as Row; break;
    case 'entityGet': answer = await graph.getEntity(g('ENT', String(payload['entityId'] ?? E1)), T(), domainId, String(payload['entityId'] ?? E1), { payload: {} }) as unknown as Row; break;
    case 'edgesList': answer = await graph.listEdges(g('EDG'), T(), domainId, { payload: {} }) as unknown as Row; break;
    case 'neighbourhood': answer = await graph.neighbourhood(g('EDG', String(payload['entityId'] ?? E2)), T(), domainId, { payload: { entityId: String(payload['entityId'] ?? E2), depth: Number(payload['depth'] ?? 2) } }) as unknown as Row; break;
    case 'path': answer = await graph.path(g('EDG'), T(), domainId, { payload: { from: String(payload['from'] ?? E2), to: String(payload['to'] ?? E1) } }) as unknown as Row; break;
    case 'strategyList': answer = await graph.listStrategy(g('OBJ'), T(), domainId, { payload: {} }) as unknown as Row; break;
    case 'strategyGet': answer = await graph.getStrategy(g('OBJ', String(payload['objectId'] ?? w.objectiveId)), T(), domainId, String(payload['objectId'] ?? w.objectiveId)) as unknown as Row; break;
    case 'overview': answer = await graph.overview(g('ENT'), T(), domainId) as unknown as Row; break;
    case 'memoryList': answer = await graph.listMemoryItems(g('MEM'), T(), domainId, { payload: {} }) as unknown as Row; break;
    case 'memoryGet': answer = await graph.getMemoryItem(g('MEM', String(payload['itemId'] ?? M1)), T(), domainId, String(payload['itemId'] ?? M1)) as unknown as Row; break;
    case 'memoryRetrieve': answer = await graph.retrieveMemoryItem(g('MEM', String(payload['itemId'] ?? M1), 'memory.item.retrieve', String(payload['purpose'] ?? 'memory')), T(), domainId, String(payload['itemId'] ?? M1), { payload: {} }) as unknown as Row; break;
    default: throw new Error(`no such route ${String(route)}`);
  }
  const projection = (route === 'search' ? obj(answer['search'])['projection'] : route === 'memoryRetrieve' ? obj(answer['memory'])['projection'] : route === 'overview' ? obj(answer['overview'])['projection'] : answer['projection']) as ProjectionBlock;
  expect(projection, `${route}: the answer carries no projection block`).toBeDefined();
  return { answer, projection };
}
/** The reader of a route: the memory retrieval is the knowledge owner's (a memory.item.retrieve holder under the purpose memory); the rest the analyst's. */
const readerOf = (route: RouteName): AuthenticatedPrincipal => (route === 'memoryRetrieve' ? reader : analyst);
/** The traversal bound of a neighbourhood or path answer (`bound.projection`); a neighbourhood's may ride beside `depthClamped` inside `neighbourhood` (design §2.4 — either placement is the same flag). */
const projectionBound = (answer: Row): boolean | undefined => (obj(answer['bound'])['projection'] ?? obj(obj(answer['neighbourhood'])['bound'])['projection']) as boolean | undefined;
const retrieveAs = (p: AuthenticatedPrincipal, itemId: string, purpose: string) =>
  graph.retrieveMemoryItem(h.req(p, 'memory.item.retrieve', 'MEM', itemId, purpose), T(), D(), itemId, { payload: {} }) as unknown as Promise<{ memory: Row; receipt: { policyDecisionId: string; auditSeq: number } }>;
/** A person's own record (source kind human); the audience purposes are the case's. */
const memoryItem = (over: Row = {}): Row => ({
  recordClass: 'strategic', title: 'B20 memory item',
  statement: 'The corridor transit level the routing decision relied on was read from the PortWatch series; the hold stands until the strait reopens (B20 harness).',
  source: { kind: 'human', ref: 'decision room, 2024-01-17' },
  audience: { classification: 'internal', roles: [], purposes: ['memory', 'briefing'] },
  validity: { from: '2024-01-17T00:00:00Z', to: null },
  retention: { profile: 'strategic-record-7y', retainUntil: '2031-01-17T00:00:00Z', basis: 'the decision record retention schedule' },
  cites: [], related: { decisionId: null, objectiveId: null }, ...over,
});
const recordAs = (p: AuthenticatedPrincipal, payload: Row, purpose = 'memory') =>
  graph.recordMemoryItem(h.req(p, 'memory.item.record', 'MEM', null, purpose), T(), D(), { payload }) as Promise<{ memory: { itemId: string; version: number; cites: number } }>;

/* ───────────── the retention routes (the B11 helpers) ───────────── */
type Action = { action_id: string; state: string; failure_class: string | null; disposition: string | null; failure_reason: string | null; attempts: number };
const actionRow = async (id: string): Promise<Action> => (await sql<Action>`select action_id::text, state, failure_class, disposition, failure_reason, attempts::int from retention.actions_current where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const actionEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from retention.action_events where action_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;
const approvalsLive = async (id: string) => (await sql<{ n: number }>`select count(*)::int n from retention.approvals where action_id = ${id}::uuid and revoked_at is null`.execute(su)).rows[0]!.n;
const approvalsRevoked = async (id: string) => (await sql<{ n: number }>`select count(*)::int n from retention.approvals where action_id = ${id}::uuid and revoked_at is not null`.execute(su)).rows[0]!.n;
const tombstones = async (manifestId: string) => (await sql<{ n: number }>`select count(*)::int n from observation.blob_tombstones where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!.n;
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string; locator: string }>`select (payload ->> 'manifest_id') as manifest_id, (select locator from observation.blob_manifests m where m.manifest_id = (o.payload ->> 'manifest_id')::uuid) as locator from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
const open = (p: AuthenticatedPrincipal, payload: Row) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string; state: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Row }>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string, rationale = 'the scope as resolved') => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale } }) as Promise<{ approval: { approvalId: string } }>;
const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: { executed: number; held: number; refused: number } }>;
const submitCorrection = async (evdIds: string[], reason: string, kind: 'correction' | 'withdrawal' = 'correction'): Promise<string> => {
  const o = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(), kind, channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  return o.correction.caseId;
};
const applyCase = (caseId: string, evdIds: string[], reason: string) =>
  observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId, { payload: { decision: 'apply', affectedEvdIds: evdIds, reason } }) as Promise<{ correction: Row }>;

/* ───────────── the world's rows: planted WITH their events (the honest fixture — an event-less row is POISONED under the symmetric check) ───────────── */
/** An entity row and its entity.created event under ONE correlation id; the event's actor is the row's created_by (C19: the rebuild re-inserts both from the event). */
async function seedEntity(id: string, type: string, name: string, domainId = D(), actor = owner.principalId): Promise<{ correlationId: string }> {
  const correlationId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${actor}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, ${id}::uuid, 'entity.created', ${actor}::uuid, ${JSON.stringify({ entity_type: type, canonical_name: name, normalized_name: name.toLowerCase(), split_from: null })}::jsonb, ${correlationId}::uuid)`.execute(su);
  return { correlationId };
}
/** A POISONED entity row: the projection has it, the log does not (the superuser's own corruption). */
async function plantPoisonedEntity(id: string, name: string, domainId = D()): Promise<void> {
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, 'organization', ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
}
/**
 * An asserted edge: the row, the edge.asserted event with the FULL details the port writes (0068:68-77) and — unless `lineage: false` — the
 * claim's lineage row for (claimId, 1) on the evidence, whose provenance columns the rebuild takes (the log carries none of them).
 * The row's provenance columns equal the lineage's, so a re-inserted row equals the seeded one.
 */
async function seedEdge(edgeId: string, subject: string, predicate: string, object: string, claimId: string, evidence: Evd, opts: { domainId?: string; lineage?: boolean; event?: boolean } = {}): Promise<{ methodId: string; runId: string }> {
  const domainId = opts.domainId ?? D(); const methodId = uuidv7(); const runId = uuidv7(); const correlationId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, method_id, run_id, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, ${subject}::uuid, ${predicate}, ${object}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimId}::uuid, 1, ${evidence.id}::uuid, ${evidence.bytesDigest}, ${methodId}::uuid, ${runId}::uuid, 'replay', 0.9, ${owner.principalId}::uuid, ${correlationId}::uuid)`.execute(su);
  if (opts.event !== false) {
    await sql`insert into graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, ${edgeId}::uuid, 'edge.asserted', ${owner.principalId}::uuid, jsonb_build_object('predicate', ${predicate}::text, 'subject', ${subject}::uuid, 'object', ${object}::uuid, 'valid_from', '2024-01-01T00:00:00Z'::timestamptz, 'valid_to', null, 'mode', 'replay', 'claim_object_id', ${claimId}::uuid, 'claim_version', 1, 'review_state', 'approved'), ${correlationId}::uuid)`.execute(su);
  }
  if (opts.lineage !== false) await seedLineage(claimId, evidence, methodId, runId, domainId);
  return { methodId, runId };
}
async function seedLineage(claimId: string, evidence: Evd, methodId: string, runId: string, domainId = D()): Promise<void> {
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${domainId}::uuid, 'REL', ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidence.bytesDigest}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
}
/** ONE graph change on demand: a fresh edge between E2 and E1 seeded WITH its edge.asserted event (never a poisoned row) and retracted through the route; the published GraphChanged row. */
async function triggerChange(reason: string): Promise<{ edgeId: string; event: OutboxRow }> {
  changes += 1;
  const edgeId = uuidv7(); const since = await mark();
  await seedEdge(edgeId, E2, `b20_change_${changes}`, E1, uuidv7(), B, { lineage: false });
  await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason: `B20 ${reason}: a fresh edge retracted (harness)` } });
  const event = await publishedEvent('edge.retracted', since, (p) => String(obj((obj(p['relationships'])['edges'] as Row[] | undefined)?.[0])['edge_id']) === edgeId);
  return { edgeId, event };
}
/** The change delivered to the six (or the five while the retrieval subscription is paused), the queue settled. */
async function delivered(eventId: string, n = GRAPH_KINDS.length): Promise<Delivery[]> {
  const rows = await waitFor(`the ${n} deliveries of ${eventId} terminal`, () => deliveriesFor(eventId), (ds) => allTerminal(ds, n), 120_000);
  await settle();
  return rows;
}
/** A DRIFT event: the retrieval delivery unresolved with the withdrawal named; the domain's latest check is this event's. */
async function driftDelivered(reason: string, projection: ProjectionName): Promise<{ event: OutboxRow; retrieval: Delivery; check: Awaited<ReturnType<typeof latestCheck>> }> {
  const { event } = await triggerChange(reason);
  const rows = await delivered(event.id);
  const retrieval = rows.find((d) => d.consumer_kind === 'retrieval')!;
  expect(retrieval).toMatchObject({ state: 'unresolved', deliveries: 1, attempts: 1, items: ['projections'], items_applied: [], failure_class: 'unresolved_dependency', disposition: 'human_review' });
  expect(retrieval.items_unresolved).toEqual([expect.objectContaining({ item: 'projections', effect: 'projections.mismatched', checks: 1 })]);
  expect(retrieval.last_error).toMatch(new RegExp(`1 projection row\\(s\\) differ from their event logs \\(or a partition's representation is outdated\\) .* partition\\(s\\) ${projection} withdrawn — rebuild them under graph\\.projection\\.rebuild; operator repair required`));
  const check = await latestCheck();
  expect(check.outbox_event_id).toBe(event.id);
  expect(check.mismatched).toBe(1);
  for (const p of SIX) expect(checkRowOf(check, p)['failed'], `${p} failed`).toBe(p === projection);
  const part = (await partition(projection))!;
  expect(part).toMatchObject({ state: 'withdrawn', withdrawn_by_check: check.check_id, withdrawn_by: subs.retrieval!.principalId });
  return { event, retrieval, check };
}
/** The rebuild's ONE GraphChanged/projection.rebuilt row (no identities, no relationships, no walk; the typed block; the cause) and its six deliveries (C4). */
async function rebuiltEventOf(rebuildId: string, after: Date, outcome: 'rebuilt' | 'restored', projection: ProjectionName): Promise<{ event: OutboxRow; by: Record<string, Delivery> }> {
  const rows = await waitFor('the GraphChanged/projection.rebuilt row published', () => outboxRows('GraphChanged', (p) => obj(p['change'])['kind'] === 'projection.rebuilt' && obj(p['projection'])['rebuild_id'] === rebuildId, after), (xs) => xs.length === 1 && xs[0]!.status === 'published');
  const event = rows[0]!;
  const p = event.payload;
  expect(p['identities']).toEqual([]);
  expect(obj(p['relationships'])['edges']).toEqual([]);
  expect(obj(p['objects'])['walked']).toBe(false);
  expect(obj(p['projection'])).toMatchObject({ projection, outcome, rebuild_id: rebuildId });
  expect(obj(p['cause'])).toMatchObject({ action: 'graph.projection.rebuild', actor: domainAdmin.principalId, target_type: 'PRJ', target_id: rebuildId });
  const ds = await delivered(event.id);
  expect(sorted(ds.map((d) => d.consumer_kind))).toEqual(sorted([...GRAPH_KINDS]));
  expect(ds.find((d) => d.consumer_kind === 'relationships'), 'the relationships subscriber is selected on MemoryCorrected/claim.corrected and receives no GraphChanged').toBeUndefined();
  const by = Object.fromEntries(ds.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
  for (const kind of ['twins', 'forecasts', 'scenarios', 'decisions', 'memory-mappings']) expect(by[kind], `${kind}: a rebuild changes no fact of the world (D8)`).toMatchObject({ state: 'applied', items: [], items_applied: [] });
  expect(by['retrieval']).toMatchObject({ state: 'applied', items: ['projections'] });
  expect(by['retrieval']!.items_applied[0]).toMatchObject({ effect: 'projections.verified' });
  expect((await checksFor(event.id)).map((x) => x.mismatched)).toEqual([0]);
  return { event, by };
}
/**
 * C2's end pins after the re-drive of a drift event's delivery: the dispatcher's stored cursor stands at the DRIFT event (it advanced
 * there when the re-drive applied it and is never re-advanced over the rebuilt event applied while the drift stood open), the verified
 * prefix at the REBUILT event, the revision equal, nothing lagging or unresolved, every read current with no label, no drift, no `from`.
 */
async function redriveAndPinCurrent(caseName: string, bad: OutboxRow, rebuilt: OutboxRow, failedChecks = 1): Promise<Delivery> {
  const report = await dispatcher.reconcile(`B20 ${caseName}: re-drive after the rebuild`, false, '0');
  expect(report.reDriven.map((e) => e.eventId)).toContain(bad.id);
  const done = await waitFor('the drift event\'s retrieval delivery applied on the re-drive', () => deliveriesFor(bad.id), (rows) => rows.find((d) => d.consumer_kind === 'retrieval')?.state === 'applied', 120_000);
  await settle();
  const r = done.find((d) => d.consumer_kind === 'retrieval')!;
  expect(r).toMatchObject({ state: 'applied', items_unresolved: [], failure_class: null, disposition: null, unresolved_since: null, last_error: null });
  expect(r.items_applied).toEqual([expect.objectContaining({ item: 'projections', effect: 'projections.verified', resolved_after_checks: failedChecks })]);
  const checks = (await checksFor(bad.id)).map((x) => x.mismatched);
  expect(checks.length).toBe(failedChecks + 1); expect(checks.at(-1)).toBe(0); expect(checks.slice(0, -1).every((m) => m >= 1)).toBe(true);
  expect(Number((await cursorOf(subs.retrieval!.subscriptionId)).checkpoint_seq)).toBe(bad.partition_seq);
  for (const route of ROUTES) {
    const { answer, projection: b } = await read(readerOf(route), route);
    expect(b, route).toMatchObject({ condition: 'current', degraded: false, code: null, label: null, lag_events: 0, unresolved_deliveries: 0, withdrawn: [], domain_withdrawn: [] });
    expect(b.checkpoint_seq, `${route}: the dispatcher's cursor stands at the drift event (C2)`).toBe(bad.partition_seq);
    expect(b.verified_seq, `${route}: the verified prefix reaches the rebuilt event`).toBe(rebuilt.partition_seq);
    expect(b.revision).toBe(b.verified_seq);
    expect(b.partitions.every((p) => p.condition === 'current' && p.state === 'serving' && p.representation_ok)).toBe(true);
    if (route === 'entitiesList') for (const e of answer['entities'] as Row[]) { expect(e['drift']).toBeUndefined(); expect(e['from']).toBeUndefined(); }
    if (route === 'entityGet') { expect(obj(answer['entity'])['drift']).toBeUndefined(); expect(obj(answer['entity'])['from']).toBeUndefined(); }
    if (route === 'edgesList') for (const e of answer['edges'] as Row[]) { expect(e['drift']).toBeUndefined(); expect(e['from']).toBeUndefined(); }
    if (route === 'neighbourhood' || route === 'path') expect(projectionBound(answer) ?? false).toBe(false);
  }
  return r;
}
/** The operator's rebuild of a withdrawn partition of D: the answer, the partition serving, the event and its six deliveries. */
async function rebuildD(projection: ProjectionName, reason: string, outcome: 'rebuilt' | 'restored'): Promise<{ report: Row; event: OutboxRow; by: Record<string, Delivery> }> {
  const since = await mark();
  const r = (await rebuild(domainAdmin, projection, reason)).rebuild;
  expect(r).toMatchObject({ outcome, projection, state: 'serving', representation_version: '1' });
  expect(String(r['rebuild_id'])).toMatch(UUID);
  const part = (await partition(projection))!;
  expect(part).toMatchObject({ state: 'serving', withdrawn_at: null, withdrawn_by: null, withdrawn_reason: null, withdrawn_by_check: null, representation_version: '1', last_rebuild_id: String(r['rebuild_id']) });
  const { event, by } = await rebuiltEventOf(String(r['rebuild_id']), since, outcome, projection);
  return { report: r, event, by };
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { ProjectionsController: Pc } = await import('../../src/graph/projections/projections.controller.js');
  const { RetentionController: Rc } = await import('../../src/retention/retention.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { TenancyController: Tc } = await import('../../src/tenancy/tenancy.controller.js');
  graph = h.app.get(Gc); projections = h.app.get(Pc); retention = h.app.get(Rc); observation = h.app.get(Oc);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  // THE PEOPLE: the writers, the administrators, the readers — each administrator, reader and steward with a session of its own (the ports compare the acting principal).
  owner = await h.principalWith(['strategy_owner', 'resolution_manager', 'knowledge_owner'], 'b20-owner');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b20-tenant-admin', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b20-domain-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'b20-analyst');
  reader = await h.humanWithSession(['knowledge_owner'], 'b20-knowledge-owner');
  steward = await h.humanWithSession(['retention_steward'], 'b20-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b20-retention-authority', 'TENANT');
  manager = await h.principalWith(['collection_manager'], 'b20-collection-manager');
  // THE DECISION WORLD (P6's briefing agent needs a committed package's room): booted BEFORE the subscriptions so its many port writes are
  // delivered to nothing — nothing in P1 rests on them, and the retrieval subscription's first check is the harness's own change.
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  // THE WORLD: three entities and an edge planted WITH their events (C19), the evidence B the edge rests on, a memory item recorded through
  // the route. (The upload H whose version-1 manifest P7 deletes is uploaded and withdrawn INSIDE P7 — the B19 M5 idiom — because a briefing
  // composed in P6 cites every corrected evidence version of the domain and a cited version is load-bearing: uploaded earlier, H would block
  // its own deletion at resolution.)
  [B] = (await h.upload([{ filename: 'b20-b.csv', text: 'a,b\n1,2\n', documentTime: '2024-01-14T00:00:00Z' }])).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest })) as [Evd];
  await seedEntity(E1, 'place', E1_NAME); await seedEntity(E2, 'organization', E2_NAME); await seedEntity(E3, 'organization', E3_NAME);
  await seedEdge(X1, E2, 'ships_through', E1, C1, B);
  M1 = (await recordAs(reader, memoryItem())).memory.itemId;
  // THE SUBSCRIPTIONS: all seven kinds in D (eleven since 0083, B22 — the four new kinds on their own event types by default), registered by the tenant administrator with the backlog left (the B18 idiom).
  for (const kind of CONSUMER_KINDS) {
    const r = await register(kind);
    subs[kind] = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
    expect(r.served.workerRunning, `${kind}: the domain's queue is served from registration`).toBe(true);
  }
  await settle();
  // THE SECOND DOMAIN DX (the B17 idiom): the tenant administrator's act; its own administrator; no subscription there.
  const tenancy = h.app.get(Tc) as TenancyController;
  const envT = { ...(h.req(tenantAdmin, 'tenancy.domain.create', 'CID', null, 'platform.administration') as { eyeEnvelope: Row }).eyeEnvelope, scope: 'TENANT', domain_id: null };
  DX = ((await tenancy.createDomain({ eyeEnvelope: envT, eyePrincipal: tenantAdmin } as never, T(), { payload: { name: `B20 poison domain (SYNTHETIC) ${uuidv7().slice(-6)}` } })) as { domain: { id: string } }).domain.id;
  dxAdmin = await h.humanWithSession(['domain_admin'], 'b20-dx-admin', 'DOMAIN', { domainId: DX });
}, 300_000);

afterAll(async () => {
  fault.disarm();
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B20 · the index tier: the watermark, the symmetric check that withdraws, the labelled reads, the rebuild (0080; AU-MEM-0067/-0068/-0070/-0083)', () => {
  it('P1 · THE WATERMARK ON EVERY READ: current after one applied change on all twelve routes; lagging with the verification-lag label while the retrieval subscription is paused; current again after the resume; unverified after the revocation and after a fresh registration (C1) until its first check applies', async () => {
    // THE CHANGE and its check: the retrieval delivery applied, the cursor at the event.
    const { event: ev } = await triggerChange('P1');
    const ds = await delivered(ev.id);
    expect(ds.find((d) => d.consumer_kind === 'retrieval')).toMatchObject({ state: 'applied', items_applied: [expect.objectContaining({ effect: 'projections.verified' })] });
    const check = await latestCheck();
    expect(check.outbox_event_id).toBe(ev.id); expect(check.mismatched).toBe(0);
    expect(Number((await cursorOf(subs.retrieval!.subscriptionId)).checkpoint_seq)).toBe(ev.partition_seq);
    // THE TWELVE READS: the block on each, current, the route's own partitions.
    for (const route of ROUTES) {
      const { projection: b } = await read(readerOf(route), route);
      expect(b, route).toMatchObject({ condition: 'current', degraded: false, code: null, label: null, lag_events: 0, unresolved_deliveries: 0, withdrawn: [], domain_withdrawn: [],
        revision: ev.partition_seq, verified_seq: ev.partition_seq, checkpoint_seq: ev.partition_seq, verified_check_id: check.check_id, subscription: { subscription_id: subs.retrieval!.subscriptionId, status: 'active' } });
      expect(b.verified_at).not.toBeNull();
      expect(b.partitions.map((p) => p.projection)).toEqual([...ROUTE_PARTITIONS[route]]);
      for (const p of b.partitions) expect(p, `${route}/${p.projection}`).toMatchObject({ state: 'serving', condition: 'current', withdrawn_since: null, reason: null, representation_version: '1', representation_current: '1', representation_ok: true });
    }
    // PAUSED: the next change reaches the five active subscriptions only; every read says LAGGING — verification lag, said as such.
    await control('pause', subs.retrieval!.subscriptionId, 'B20 P1: the retrieval subscription paused (harness)');
    const { event: ev2 } = await triggerChange('P1 paused');
    const five = await delivered(ev2.id, GRAPH_KINDS.length - 1);
    expect(five.find((d) => d.consumer_kind === 'retrieval')).toBeUndefined();
    const lagLabel = new RegExp(`^verified through revision ${ev.partition_seq} \\(at .*\\); 1 change\\(s\\) since are not yet verified by the retrieval subscriber${LAG_TAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    for (const route of ROUTES) {
      const { projection: b } = await read(readerOf(route), route);
      expect(b, route).toMatchObject({ condition: 'lagging', degraded: false, code: null, lag_events: 1, unresolved_deliveries: 0, revision: ev2.partition_seq, verified_seq: ev.partition_seq, checkpoint_seq: ev.partition_seq, subscription: { subscription_id: subs.retrieval!.subscriptionId, status: 'paused' } });
      expect(b.label).toMatch(lagLabel);
      expect(b.partitions.every((p) => p.condition === 'lagging' && p.state === 'serving')).toBe(true);
    }
    // RESUMED: the re-drive delivers the missed change; its check applies; current with the new verified sequence.
    await control('resume', subs.retrieval!.subscriptionId, 'B20 P1: the retrieval subscription resumed (harness)');
    const after = await waitFor('the paused change delivered to the retrieval subscriber after the resume', () => deliveriesFor(ev2.id), (rows) => rows.find((d) => d.consumer_kind === 'retrieval')?.state === 'applied', 120_000);
    await settle();
    expect(after.find((d) => d.consumer_kind === 'retrieval')!.items_applied[0]).toMatchObject({ effect: 'projections.verified' });
    for (const route of ROUTES) {
      const { projection: b } = await read(readerOf(route), route);
      expect(b, route).toMatchObject({ condition: 'current', label: null, lag_events: 0, revision: ev2.partition_seq, verified_seq: ev2.partition_seq, checkpoint_seq: ev2.partition_seq, subscription: { status: 'active' } });
    }
    // REVOKED: no live retrieval subscription — unverified, the watermark unknown.
    const revokedId = subs.retrieval!.subscriptionId;
    await control('revoke', revokedId, 'B20 P1: the retrieval subscription revoked (harness)');
    for (const route of ROUTES) {
      const { projection: b } = await read(readerOf(route), route);
      expect(b, route).toMatchObject({ condition: 'unverified', degraded: false, code: null, label: LABEL_NO_SUBSCRIPTION, verified_seq: null, verified_at: null, verified_check_id: null, checkpoint_seq: null, lag_events: 0, subscription: { subscription_id: null, status: null } });
      expect(b.partitions.every((p) => p.condition === 'unverified')).toBe(true);
    }
    // REGISTERED ANEW (the backlog left): a subscription that has applied no check has no watermark (C1) — unverified with the second form of the label — until its first check applies.
    const again = await register('retrieval');
    subs.retrieval = { subscriptionId: again.subscription.subscriptionId, principalId: again.subscription.principalId };
    await settle();
    for (const route of ROUTES) {
      const { projection: b } = await read(readerOf(route), route);
      expect(b, route).toMatchObject({ condition: 'unverified', label: LABEL_NOTHING_VERIFIED, verified_seq: null, verified_at: null, verified_check_id: null, subscription: { subscription_id: again.subscription.subscriptionId, status: 'active' } });
    }
    const { event: ev3 } = await triggerChange('P1 re-registered');
    const ds3 = await delivered(ev3.id);
    expect(ds3.find((d) => d.consumer_kind === 'retrieval')).toMatchObject({ state: 'applied', subscription_id: again.subscription.subscriptionId });
    const check3 = await latestCheck();
    for (const route of ROUTES) {
      const { projection: b } = await read(readerOf(route), route);
      expect(b, route).toMatchObject({ condition: 'current', label: null, lag_events: 0, revision: ev3.partition_seq, verified_seq: ev3.partition_seq, checkpoint_seq: ev3.partition_seq, verified_check_id: check3.check_id, subscription: { subscription_id: again.subscription.subscriptionId, status: 'active' } });
    }
    sixEvidence('P1', {
      fault_trace: { paused: revokedId, revoked: revokedId, registered_anew: again.subscription.subscriptionId },
      watermark: { current: { revision: ev.partition_seq, verified_seq: ev.partition_seq }, lagging: { revision: ev2.partition_seq, verified_seq: ev.partition_seq, lag_events: 1 }, unverified: { verified_seq: null }, current_again: { revision: ev3.partition_seq, verified_seq: ev3.partition_seq } },
      consumer_behaviour: 'the twelve reads answered current / lagging (labelled as verification lag) / unverified (two forms) / current',
      operator_action: 'pause, resume, revoke, register anew (graph.subscription.control / register)',
      recovery: `the re-drive after the resume applied ${ev2.id}; the fresh subscription's first check applied ${ev3.id}`,
      reconciliation: `verified_seq == revision == ${ev3.partition_seq}`,
    });
  }, 300_000);

  it('P2 · DRIFT → the automatic withdrawal → the labelled last-valid reads and the constrained walk → the rebuild → the passing check and the re-driven delivery applied (the six deliveries; the between-window lagging form — C2)', async () => {
    // THE FAULT: the projection drifts from its log — an operator-side corruption the subscriber must report and never repair.
    await sql`update graph.entities_current set lifecycle_state = 'retired' where entity_id = ${E1}::uuid`.execute(su);
    const seqBefore = (await read(analyst, 'edgesList')).projection.verified_seq;
    const { event: bad, check } = await driftDelivered('P2 drift', 'entities_current');
    expect(checkRowOf(check, 'entities_current')).toMatchObject({ mismatched: 1, missing: 0, unexpected: 0, representation_ok: true, failed: true });
    const part = (await partition('entities_current'))!;
    expect(part.withdrawn_reason).toMatch(/^retrieval check .* after outbox event .*: mismatched 1, missing 0, unexpected 0, representation ok \(current 1\)$/);
    // one row: no re-drive and no other change came before the rebuild (the tick's re-check is ten minutes away — C11).
    const withdrawnEvents = await pevents('entities_current');
    expect(withdrawnEvents.map((e) => [e.event, e.details['by'], e.details['changed'], e.details['check_id']])).toEqual([['projection.withdrawn', 'retrieval_check', true, check.check_id]]);
    expect(withdrawnEvents[0]!.actor_principal_id).toBe(subs.retrieval!.principalId);
    // THE READS while withdrawn: the LOG's state with the drift named, the withdrawn label first and the held-lagging sentence after it.
    const withdrawnLabel = /^the entities_current projection of this domain is withdrawn since .* \(retrieval check .*\); this answer is derived from the event log — the last valid state — and is labelled; it resumes from the projection when it is rebuilt \(POST …\/graph\/projections\/entities_current\/rebuild \(graph\.projection\.rebuild\)\) — verified through revision \d+ \(at .*\); the retrieval subscriber's checkpoint is held there by 1 unresolved delivery\(ies\) \(a failed check: partition\(s\) entities_current withdrawn until rebuilt\); 1 change\(s\) since are checked as they arrive but not checkpointed/;
    const get = await read(analyst, 'entityGet', { entityId: E1 });
    expect(obj(get.answer['entity'])).toMatchObject({ entity_id: E1, lifecycle_state: 'active', from: 'log', drift: { projected: 'retired', log: 'active' } });
    expect(get.projection).toMatchObject({ condition: 'withdrawn', degraded: true, code: 'EYE-DEG-001', withdrawn: ['entities_current'], domain_withdrawn: ['entities_current'], unresolved_deliveries: 1, lag_events: 1, verified_seq: seqBefore, checkpoint_seq: seqBefore, revision: bad.partition_seq });
    expect(get.projection.label).toMatch(withdrawnLabel);
    expect(get.projection.partitions.find((p) => p.projection === 'entities_current')).toMatchObject({ state: 'withdrawn', condition: 'withdrawn', withdrawn_by_check: check.check_id, reason: part.withdrawn_reason });
    const list = await read(analyst, 'entitiesList');
    const e1 = (list.answer['entities'] as Row[]).find((e) => e['entity_id'] === E1)!;
    expect(e1).toMatchObject({ lifecycle_state: 'active', from: 'log', drift: { projected: 'retired', log: 'active' } });
    expect(list.projection.condition).toBe('withdrawn');
    const search = await read(analyst, 'search', { query: 'Bab' });
    const hit = (obj(search.answer['search'])['entities'] as Row[]).find((x) => x['id'] === E1)!;
    expect(hit).toBeDefined();
    expect(obj(hit['extra'])).toMatchObject({ from: 'log', lifecycle_state: 'active' });
    expect(obj(search.answer['search'])['complete']).toEqual({ entities: true, objects: true });
    expect(search.projection.condition).toBe('withdrawn');
    // THE TRAVERSALS: constrained to depth 2 with the bound named and the label first — the walk, not a refusal (IA-34-005).
    const nb = await read(analyst, 'neighbourhood', { entityId: E2, depth: 4 });
    expect(nb.answer['searchedDepth']).toBe(2);
    expect(obj(nb.answer['neighbourhood'])['depthClamped']).toBe(true);
    expect(projectionBound(nb.answer)).toBe(true);
    expect(String(nb.answer['note'])).toMatch(/^the entities_current projection of this domain is withdrawn since/);
    expect((obj(nb.answer['neighbourhood'])['edges'] as Row[]).map((e) => e['edge_id'])).toEqual([X1]);
    expect(nb.projection.condition).toBe('withdrawn');
    const path = await read(analyst, 'path', { from: E2, to: E1 });
    expect(path.answer['bound']).toEqual({ scan: false, depth: false, projection: true });
    expect((path.answer['path'] as Row[]).length).toBe(1);
    // A route whose partition is SERVING while another is withdrawn: the block names only the route's partitions — lagging, the held form naming the domain's withdrawal.
    const edges = await read(analyst, 'edgesList');
    expect(edges.projection).toMatchObject({ condition: 'lagging', degraded: false, code: null, withdrawn: [], domain_withdrawn: ['entities_current'], unresolved_deliveries: 1, lag_events: 1 });
    expect(edges.projection.partitions.map((p) => [p.projection, p.state, p.condition])).toEqual([['edges_current', 'serving', 'lagging']]);
    expect(edges.projection.label).toBe(`verified through revision ${seqBefore} (at ${edges.projection.verified_at}); the retrieval subscriber's checkpoint is held there by 1 unresolved delivery(ies) (a failed check: partition(s) entities_current withdrawn until rebuilt); 1 change(s) since are checked as they arrive but not checkpointed${LAG_TAIL}`);
    const ov = await read(analyst, 'overview');
    const ovEntities = obj(obj(ov.answer['overview'])['entities']);
    expect(ovEntities['from']).toBe('log');
    expect(Number(ovEntities['active'])).toBeGreaterThanOrEqual(3);
    expect(ov.projection.withdrawn).toEqual(['entities_current']);
    // THE OPERATOR ACTION: the analyst's rebuild refused by the PDP; the domain administrator's rebuild re-states the row from the log.
    expect(await failure(rebuild(analyst, 'entities_current', 'the analyst may not rebuild (harness)'))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    const { report, event: rebuilt, by } = await rebuildD('entities_current', 'the drift on E1 is the harness\'s own fault; rebuilding from the log', 'rebuilt');
    expect(report).toMatchObject({ updated: 1, inserted: 0, removed: 0, restored: [{ id: E1, change: 'updated', to: 'active' }], restored_truncated: false, dangling: [], withdrawn_by_check: check.check_id });
    expect(obj(report['check'])).toMatchObject({ mismatched: 0, missing: 0, unexpected: 0, representation_ok: true });
    expect((await entityRow(E1))!.lifecycle_state).toBe('active');
    expect((await pevents('entities_current')).map((e) => e.event)).toEqual(['projection.withdrawn', 'projection.rebuilt']);
    expect(obj(rebuilt.payload['projection'])).toMatchObject({ outcome: 'rebuilt', updated: 1, inserted: 0, removed: 0, restored: [{ id: E1, change: 'updated', to: 'active' }] });
    expect(Object.keys(by).length).toBe(6);
    // BETWEEN the rebuilt event applied and the re-drive (C2): the prefix is bounded by the open drift delivery — lagging, held by a check whose partition has since been rebuilt.
    const between = await read(analyst, 'edgesList');
    expect(between.projection).toMatchObject({ condition: 'lagging', verified_seq: seqBefore, checkpoint_seq: seqBefore, lag_events: 2, unresolved_deliveries: 1, withdrawn: [], domain_withdrawn: [] });
    expect(between.projection.label).toBe(`verified through revision ${seqBefore} (at ${between.projection.verified_at}); the retrieval subscriber's checkpoint is held there by 1 unresolved delivery(ies) (a failed check whose partition(s) have since been rebuilt; the delivery clears at its re-drive); 2 change(s) since are checked as they arrive but not checkpointed${LAG_TAIL}`);
    // THE RECONCILIATION: the re-drive re-checks the drift event — passing now — and applies it; the cursor at the drift event, the prefix at the rebuilt event.
    await redriveAndPinCurrent('P2', bad, rebuilt);
    sixEvidence('P2', {
      fault_trace: { superuser_update: `graph.entities_current ${E1} lifecycle_state active → retired`, check_id: check.check_id, drift_event: bad.id },
      watermark: { while_withdrawn: { revision: bad.partition_seq, verified_seq: seqBefore, checkpoint_seq: seqBefore, lag_events: 1, unresolved_deliveries: 1 } },
      consumer_behaviour: 'the reads served the log\'s state with drift and the label; the traversals constrained to depth 2 with bound.projection; edges/list lagging with the held form',
      operator_action: { rebuild_id: report['rebuild_id'], by: domainAdmin.principalId },
      recovery: { updated: 1, restored: report['restored'] },
      reconciliation: { checks: [1, 0], checkpoint_seq: bad.partition_seq, verified_seq: rebuilt.partition_seq },
    });
  }, 300_000);

  it('P3 · THE POISONED PARTITION: (a) a row with no event → unexpected 1 where the JOIN-only check read 0 → withdrawn → absent from every read → removed by the rebuild; (c) in DX a poisoned entity held only by a poisoned edge → refused naming the shape, the edges rebuild removes the holder; (b) a poisoned entity held by a DERIVED edge → refused naming the holder (C8); DX left withdrawn', async () => {
    // (a) THE POISONED ROW in D.
    const P = uuidv7();
    await plantPoisonedEntity(P, 'Poisoned Row');
    const seqBefore = (await read(analyst, 'edgesList')).projection.verified_seq;
    const { event: bad, check } = await driftDelivered('P3 poison', 'entities_current');
    const row = checkRowOf(check, 'entities_current');
    expect(row).toMatchObject({ mismatched: 0, missing: 0, unexpected: 1, representation_ok: true, failed: true });
    // under 0065's JOIN-only check this row was invisible: mismatched would have read 0 — the old sum is the row's own `mismatched` column.
    expect(Number(row['mismatched'])).toBe(0);
    expect(check.mismatched).toBe(1);
    const list = await read(analyst, 'entitiesList');
    expect((list.answer['entities'] as Row[]).some((e) => e['entity_id'] === P)).toBe(false);
    expect(list.projection.condition).toBe('withdrawn');
    const search = await read(analyst, 'search', { query: 'Poisoned' });
    expect(obj(search.answer['search'])['entities']).toEqual([]);
    expect(obj(obj(search.answer['search'])['complete'])['entities']).toBe(true);
    expect(await failure(read(analyst, 'entityGet', { entityId: P }))).toMatchObject({ status: 404, code: 'EYE-STA-001', message: 'no authorized entity matches' });
    const { report, event: rebuilt } = await rebuildD('entities_current', 'a poisoned row planted by the harness; removed from the log\'s state', 'rebuilt');
    expect(report).toMatchObject({ updated: 0, inserted: 0, removed: 1, restored: [{ id: P, change: 'removed', from: 'active' }], dangling: [] });
    expect(await entityRow(P)).toBeUndefined();
    await redriveAndPinCurrent('P3(a)', bad, rebuilt);
    sixEvidence('P3(a)', {
      fault_trace: { superuser_insert: `graph.entities_current ${P} (no event)`, check_id: check.check_id, unexpected: 1, old_join_only_sum: 0 },
      watermark: { while_withdrawn: { revision: bad.partition_seq, verified_seq: seqBefore, checkpoint_seq: seqBefore } },
      consumer_behaviour: 'P absent from /entities/list, /search (complete.entities true) and /entities/:P/get (404); the six deliveries of the rebuilt event',
      operator_action: { rebuild_id: report['rebuild_id'] },
      recovery: { removed: 1, dangling: [] },
      reconciliation: { checks: [1, 0], verified_seq: rebuilt.partition_seq, reads: 'current' },
    });
    // (c) THE POISONED-ONLY SHAPE in DX (first: while no derived holder stands in DX, the refusal names this shape — the port's rule reads the whole domain).
    const P3 = uuidv7(); const XP = uuidv7();
    await plantPoisonedEntity(P3, 'Poisoned Held Only By Poison', DX);
    const EXd = uuidv7(); await seedEntity(EXd, 'place', 'DX Place', DX);
    await seedEdge(XP, EXd, 'supplies', P3, uuidv7(), B, { domainId: DX, lineage: false, event: false });
    const w1 = (await withdraw(dxAdmin, 'entities_current', 'a suspected poisoned row (harness)', DX)).projection;
    expect(w1).toMatchObject({ projection: 'entities_current', state: 'withdrawn', changed: true, reason: 'a suspected poisoned row (harness)', second_reason: null, withdrawn_by_check: null });
    const rc1 = (await rebuild(dxAdmin, 'entities_current', 'attempt to remove it', DX)).rebuild;
    expect(rc1).toMatchObject({ outcome: 'refused', state: 'withdrawn', attempted: { updated: 0, inserted: 0, removed: 0 } });
    expect(String(rc1['refusal'])).toMatch(/^projection rebuild refused: 1 poisoned entity row\(s\) of this domain are held only by rows the log does not know either/);
    expect(rc1['referenced']).toEqual([expect.objectContaining({ id: P3, canonical_name: 'Poisoned Held Only By Poison', held_by_derived: 0, held_by_poisoned: 1, referenced_by: [{ kind: 'edge', id: XP, state: 'asserted', derived: false }] })]);
    expect((await partition('entities_current', DX))!.state).toBe('withdrawn');
    const wX = (await withdraw(dxAdmin, 'edges_current', 'the poisoned holder is removed by its own partition\'s rebuild (harness)', DX)).projection;
    expect(wX['changed']).toBe(true);
    const rX = (await rebuild(dxAdmin, 'edges_current', 'remove the poisoned edge (harness)', DX)).rebuild;
    expect(rX).toMatchObject({ outcome: 'rebuilt', state: 'serving', updated: 0, inserted: 0, removed: 1, restored: [{ id: XP, change: 'removed', from: 'asserted' }], dangling: [] });
    expect(await edgeRow(XP)).toBeUndefined();
    // (b) THE DERIVED-HOLDER SHAPE in DX: an edge WITH its event and lineage on a poisoned object — refused before anything is written; a person decides.
    const EX1 = uuidv7(); const P2 = uuidv7(); const XX = uuidv7();
    await seedEntity(EX1, 'organization', 'DX Organization', DX);
    await plantPoisonedEntity(P2, 'Poisoned Held By Derived', DX);
    await seedEdge(XX, EX1, 'supplies', P2, uuidv7(), B, { domainId: DX });
    const w2 = (await withdraw(dxAdmin, 'entities_current', 'a suspected poisoned row (harness)', DX)).projection;
    // the partition was withdrawn by (c): idempotent — a second reason recorded, no state change (the design's `changed true` of (b) holds where (b) comes first; here (c) came first, said).
    expect(w2).toMatchObject({ state: 'withdrawn', changed: false, reason: 'a suspected poisoned row (harness)', second_reason: 'a suspected poisoned row (harness)' });
    const rc2 = (await rebuild(dxAdmin, 'entities_current', 'attempt to remove it', DX)).rebuild;
    expect(rc2).toMatchObject({ outcome: 'refused', state: 'withdrawn', attempted: { updated: 0, inserted: 0, removed: 0 } });
    expect(String(rc2['refusal'])).toMatch(/^projection rebuild refused: 1 poisoned entity row\(s\) of this domain are held by rows the log derives/);
    expect(String(rc2['refusal'])).not.toMatch(/some holders/);
    expect(rc2['referenced']).toEqual([expect.objectContaining({ id: P2, canonical_name: 'Poisoned Held By Derived', held_by_derived: 1, held_by_poisoned: 0, referenced_by: [{ kind: 'edge', id: XX, state: 'asserted', derived: true }] })]);
    expect(await entityRow(P2)).toBeDefined(); expect(await entityRow(P3), 'the refusal wrote nothing: the unheld poisoned row stays too').toBeDefined();
    expect((await pevents('entities_current', DX)).map((e) => [e.event, e.details['by'] ?? null, e.details['changed'] ?? null])).toEqual([
      ['projection.withdrawn', 'operator', true], ['projection.rebuild_refused', null, null], ['projection.withdrawn', 'operator', false], ['projection.rebuild_refused', null, null]]);
    expect((await pevents('edges_current', DX)).map((e) => e.event)).toEqual(['projection.withdrawn', 'projection.rebuilt']);
    // THE DX READS stay labelled: no subscription there (the domain would read unverified), the withdrawal wins; the poisoned rows are never served.
    const dx = await read(dxAdmin, 'entitiesList', {}, DX);
    expect(dx.projection).toMatchObject({ condition: 'withdrawn', degraded: true, code: 'EYE-DEG-001', withdrawn: ['entities_current'], subscription: { subscription_id: null } });
    expect(dx.projection.label).toMatch(/^the entities_current projection of this domain is withdrawn since .* \(a suspected poisoned row \(harness\)\); this answer is derived from the event log — the last valid state — and is labelled; it resumes from the projection when it is rebuilt \(POST …\/graph\/projections\/entities_current\/rebuild \(graph\.projection\.rebuild\)\) — no live retrieval subscription verifies this domain's projections; the projection watermark is unknown$/);
    const dxIds = (dx.answer['entities'] as Row[]).map((e) => String(e['entity_id']));
    expect(dxIds).toEqual(expect.arrayContaining([EXd, EX1])); expect(dxIds).not.toContain(P2); expect(dxIds).not.toContain(P3);
    expect((await partition('entities_current', DX))!.state, 'DX is left withdrawn: a held poisoned row is a person\'s decision (no forced removal in B20)').toBe('withdrawn');
    sixEvidence('P3(b)(c)', {
      fault_trace: { dx: DX, poisoned_only: { entity: P3, edge: XP }, poisoned_held_by_derived: { entity: P2, edge: XX }, withdrawals: [w1['event_id'], wX['event_id'], w2['event_id']] },
      watermark: { dx: { condition: 'withdrawn', subscription: null } },
      consumer_behaviour: 'the DX listing labelled; P2 and P3 never served; the edges rebuild removed the poisoned holder XP',
      operator_action: { refused_rebuilds: [rc1['rebuild_id'], rc2['rebuild_id']], edges_rebuild: rX['rebuild_id'] },
      recovery: { edges: { removed: 1 }, entities: 'still refused by the derived holder XX (held_by_derived 1) — a person decides' },
      reconciliation: 'projection.rebuild_refused rows on the DX ledger; DX left withdrawn on entities_current (stated)',
    });
  }, 300_000);

  it('P4 · THE MISSING ROW: an entity re-inserted from its log; an edge served from the log without its provenance and re-inserted from edge.asserted + the claim\'s lineage; the unrebuildable edge named and the operator\'s lineage row; the memory item re-inserted from the canonical version', async () => {
    // THE ENTITY E3 (no edge on it).
    const seeded = (await entityRow(E3))!;
    await sql`delete from graph.entities_current where entity_id = ${E3}::uuid`.execute(su);
    const a = await driftDelivered('P4 entity', 'entities_current');
    expect(checkRowOf(a.check, 'entities_current')).toMatchObject({ mismatched: 0, missing: 1, unexpected: 0, failed: true });
    const list = await read(analyst, 'entitiesList');
    expect((list.answer['entities'] as Row[]).find((e) => e['entity_id'] === E3)).toMatchObject({ entity_id: E3, lifecycle_state: 'active', projected: false, from: 'log', canonical_name: E3_NAME, entity_type: 'organization' });
    const get = await read(analyst, 'entityGet', { entityId: E3 });
    expect(obj(get.answer['entity'])).toMatchObject({ entity_id: E3, projected: false, from: 'log', lifecycle_state: 'active' });
    const ra = await rebuildD('entities_current', 'the row the log has is re-inserted from its entity.created event (harness)', 'rebuilt');
    expect(ra.report).toMatchObject({ updated: 0, inserted: 1, removed: 0, restored: [{ id: E3, change: 'inserted', to: 'active' }] });
    expect(await entityRow(E3)).toEqual(seeded);
    await redriveAndPinCurrent('P4 entity', a.event, ra.event);
    sixEvidence('P4 entity', { fault_trace: { superuser_delete: `graph.entities_current ${E3}`, check_id: a.check.check_id, missing: 1 }, watermark: { drift_event: a.event.partition_seq }, consumer_behaviour: 'E3 listed metadata-only from the log (projected false)', operator_action: { rebuild_id: ra.report['rebuild_id'] }, recovery: { inserted: 1, columns_equal_to_seed: true }, reconciliation: { checks: [1, 0], reads: 'current' } });
    // THE EDGE X1: served from the log with the provenance the log lacks null; re-inserted from edge.asserted + the lineage row.
    const seededEdge = (await edgeRow(X1))!;
    await sql`delete from graph.edges_current where edge_id = ${X1}::uuid`.execute(su);
    const b = await driftDelivered('P4 edge', 'edges_current');
    expect(checkRowOf(b.check, 'edges_current')).toMatchObject({ mismatched: 0, missing: 1, unexpected: 0, failed: true });
    const edges = await read(analyst, 'edgesList');
    expect((edges.answer['edges'] as Row[]).find((e) => e['edge_id'] === X1)).toMatchObject({ edge_id: X1, state: 'asserted', projected: false, from: 'log', evidence_object_id: null, subject_entity_id: E2, object_entity_id: E1, predicate: 'ships_through' });
    expect(edges.answer['from']).toBe('log');
    const nb = await read(analyst, 'neighbourhood', { entityId: E2, depth: 2 });
    expect((obj(nb.answer['neighbourhood'])['edges'] as Row[]).map((e) => e['edge_id'])).toContain(X1);
    expect(projectionBound(nb.answer)).toBe(true);
    const rb = await rebuildD('edges_current', 'the edge the log has is re-inserted from its assertion and the claim\'s lineage (harness)', 'rebuilt');
    expect(rb.report).toMatchObject({ updated: 0, inserted: 1, removed: 0, restored: [{ id: X1, change: 'inserted', to: 'asserted' }] });
    const back = (await edgeRow(X1))!;
    expect(back).toMatchObject({ state: 'asserted', evidence_object_id: seededEdge.evidence_object_id, evidence_digest: seededEdge.evidence_digest, method_id: seededEdge.method_id, run_id: seededEdge.run_id, claim_object_id: C1, claim_version: 1 });
    expect(Number(back.confidence)).toBe(Number(seededEdge.confidence));
    await redriveAndPinCurrent('P4 edge', b.event, rb.event);
    sixEvidence('P4 edge', { fault_trace: { superuser_delete: `graph.edges_current ${X1}`, check_id: b.check.check_id, missing: 1 }, watermark: { drift_event: b.event.partition_seq }, consumer_behaviour: 'X1 served from the log with the provenance columns null and present in the constrained walk', operator_action: { rebuild_id: rb.report['rebuild_id'] }, recovery: { inserted: 1, provenance_from_lineage: true }, reconciliation: { checks: [1, 0], reads: 'current' } });
    // THE UNREBUILDABLE EDGE X2: no lineage row — the rebuild names it and refuses; the operator supplies the provenance; the next rebuild inserts it.
    const X2 = uuidv7(); const C2 = uuidv7();
    const { methodId, runId } = await seedEdge(X2, E2, 'insures', E1, C2, B, { lineage: false });
    await sql`delete from graph.edges_current where edge_id = ${X2}::uuid`.execute(su);
    const u = await driftDelivered('P4 unrebuildable', 'edges_current');
    expect(checkRowOf(u.check, 'edges_current')).toMatchObject({ missing: 1, failed: true });
    const refusedRebuild = (await rebuild(domainAdmin, 'edges_current', 'attempt to re-insert the edge without its lineage (harness)')).rebuild;
    expect(refusedRebuild).toMatchObject({ outcome: 'refused', state: 'withdrawn' });
    expect(String(refusedRebuild['refusal'])).toMatch(/^projection rebuild refused: 1 row\(s\) the log has cannot be written from what the log or the canonical record carries \(named\); nothing was written/);
    expect(refusedRebuild['unrebuildable']).toEqual([expect.objectContaining({ id: X2, reason: expect.stringMatching(new RegExp(`^no claim lineage row for claim ${C2}@1: the provenance columns \\(evidence, its digest, the method, the run, the confidence\\) cannot be derived`)) })]);
    expect((await pevents('edges_current')).at(-1)!.event).toBe('projection.rebuild_refused');
    expect((await partition('edges_current'))!.state).toBe('withdrawn');
    await seedLineage(C2, B, methodId, runId);
    const ru = await rebuildD('edges_current', 'the lineage row supplied by the operator; the edge re-inserted (harness)', 'rebuilt');
    expect(ru.report).toMatchObject({ updated: 0, inserted: 1, removed: 0, restored: [{ id: X2, change: 'inserted', to: 'asserted' }] });
    expect((await edgeRow(X2))!).toMatchObject({ state: 'asserted', evidence_object_id: B.id, evidence_digest: B.bytesDigest, method_id: methodId, run_id: runId });
    await redriveAndPinCurrent('P4 unrebuildable', u.event, ru.event);
    sixEvidence('P4 unrebuildable', { fault_trace: { superuser_delete: `graph.edges_current ${X2} (claim ${C2} without a lineage row)`, check_id: u.check.check_id }, watermark: { drift_event: u.event.partition_seq }, consumer_behaviour: 'the edge served from the log; the rebuild REFUSED naming the row and the claim version (projection.rebuild_refused)', operator_action: { refused_rebuild: refusedRebuild['rebuild_id'], lineage_supplied: `${C2}@1`, rebuild_id: ru.report['rebuild_id'] }, recovery: { inserted: 1 }, reconciliation: { checks: [1, 0], reads: 'current' } });
    // THE MEMORY ITEM M1: listed projected false and stale; re-inserted from the canonical version 1.
    const seededItem = (await itemRow(M1))!;
    const canon = (await sql<{ classification: string; payload: Row }>`select classification, payload from objects.canonical_objects where object_id = ${M1}::uuid and object_version = 1`.execute(su)).rows[0]!;
    await sql`delete from memory.items_current where item_id = ${M1}::uuid`.execute(su);
    const m = await driftDelivered('P4 memory', 'memory_items_current');
    expect(checkRowOf(m.check, 'memory_items_current')).toMatchObject({ mismatched: 0, missing: 1, unexpected: 0, failed: true });
    const ml = await read(analyst, 'memoryList');
    expect((ml.answer['memory'] as Row[]).find((x) => x['item_id'] === M1)).toMatchObject({ item_id: M1, projected: false, index_state: 'stale', state: 'active', object_version: 1 });
    expect(ml.projection.condition).toBe('withdrawn');
    const rm = await rebuildD('memory_items_current', 'the item the log has is re-inserted from its canonical version (harness)', 'rebuilt');
    expect(rm.report).toMatchObject({ updated: 0, inserted: 1, removed: 0, restored: [{ id: M1, change: 'inserted', to: 'active@1' }] });
    const backItem = (await itemRow(M1))!;
    expect(backItem).toMatchObject({ object_version: 1, state: 'active', title: seededItem.title, statement: seededItem.statement, classification: seededItem.classification, audience_purposes: seededItem.audience_purposes, derivation: null, recorded_by: reader.principalId });
    expect(backItem.title).toBe(canon.payload['title']); expect(backItem.statement).toBe(canon.payload['statement']); expect(backItem.classification).toBe(canon.classification);
    await redriveAndPinCurrent('P4 memory', m.event, rm.event);
    sixEvidence('P4 memory', { fault_trace: { superuser_delete: `memory.items_current ${M1}`, check_id: m.check.check_id, missing: 1 }, watermark: { drift_event: m.event.partition_seq }, consumer_behaviour: 'M1 listed projected false with index_state stale', operator_action: { rebuild_id: rm.report['rebuild_id'] }, recovery: { inserted: 1, from: 'the canonical MEM version 1' }, reconciliation: { checks: [1, 0], reads: 'current' } });
  }, 300_000);

  it('P5 · THE UNAPPROVED REPRESENTATION VERSION: the partition\'s representation flipped to 0 → representation_ok false → withdrawn saying so → the reads say so → the rebuild restores under 1 (the flip stands in for a derivation-rule change, which arrives with a migration that bumps the constant)', async () => {
    await sql`update graph.projection_partitions set representation_version = '0' where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and projection = 'edges_current'`.execute(su);
    const { event: bad, check } = await driftDelivered('P5 representation', 'edges_current');
    expect(checkRowOf(check, 'edges_current')).toMatchObject({ mismatched: 0, missing: 0, unexpected: 0, representation_ok: false, failed: true });
    expect(check.mismatched).toBe(1);
    expect((await partition('edges_current'))!.withdrawn_reason).toMatch(/representation outdated \(current 1\)/);
    const edges = await read(analyst, 'edgesList');
    expect(edges.projection.partitions[0]).toMatchObject({ projection: 'edges_current', state: 'withdrawn', condition: 'withdrawn', representation_version: '0', representation_current: '1', representation_ok: false });
    expect(edges.projection.label).toMatch(/representation outdated \(current 1\)/);
    const { report, event: rebuilt } = await rebuildD('edges_current', 'the representation review is complete; the rule is the current one (harness)', 'restored');
    expect(report).toMatchObject({ updated: 0, inserted: 0, removed: 0, restored: [], representation_version: '1' });
    expect((await pevents('edges_current')).map((e) => e.event).slice(-2)).toEqual(['projection.withdrawn', 'projection.restored']);
    expect(obj(rebuilt.payload['projection'])).toMatchObject({ outcome: 'restored', representation_version: '1' });
    await redriveAndPinCurrent('P5', bad, rebuilt);
    sixEvidence('P5', { fault_trace: { superuser_update: 'graph.projection_partitions edges_current representation_version → 0', check_id: check.check_id, representation_ok: false }, watermark: { representation_version: '0', representation_current: '1' }, consumer_behaviour: 'the reads labelled withdrawn with the representation named; the unresolved text says "(or a partition\'s representation is outdated)"', operator_action: { rebuild_id: report['rebuild_id'] }, recovery: { outcome: 'restored', representation_version: '1' }, reconciliation: { checks: [1, 0], reads: 'current' } });
  }, 300_000);

  it('P6 · THE MEMORY WORKSPACE: (a) the version drift → stale, the log\'s version, the briefing degraded, the agent stopped, the rebuild; (a2) the policy columns (C6); (b) the content tier down → 403 for a refused reader, 200 metadata-only for the reader, no access row, the ledger row, the recovery (C5); (b2) the narrower gate (C7); (c) the operator\'s withdrawal → stale; (d) withdrawn and down → 503 (C7); the rebuild', async () => {
    // THE ROOM AND THE AGENT (before any drift: their writes are ordinary changes the retrieval subscriber verifies).
    const P = await c.committed();
    const roomId = (await c.openRoom({ packageId: P.pkg, title: 'B20 corridor room (harness)', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    const agent = (await c.registerAgent({ kind: 'briefing', version: '1.0.0', codeDigest: 'a'.repeat(64), ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId,
      budgets: { max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000 }, stopConditions: [{ kind: 'on_degraded' }] }, tenantAdmin)).agent;
    await settle();
    // THE CONTROL: with every partition serving the agent's briefing finishes and is not degraded — so the stop below is the projection's, not a source's.
    const control0 = (await c.runAgent(agent.agentId, { task: 'briefing', roomId })).run;
    expect(control0.outcome, String(control0.stopReason)).toBe('finished');
    expect((await sql<{ degraded: boolean }>`select degraded from executive.briefings where briefing_id = ${String(control0.outputs['briefing_id'])}::uuid`.execute(su)).rows[0]!.degraded).toBe(false);
    // (a) THE VERSION DRIFT.
    await sql`update memory.items_current set object_version = 7 where item_id = ${M1}::uuid`.execute(su);
    const a = await driftDelivered('P6 drift', 'memory_items_current');
    expect(checkRowOf(a.check, 'memory_items_current')).toMatchObject({ mismatched: 1, missing: 0, unexpected: 0, failed: true });
    const accessesBefore = (await accessRows(M1)).length;
    const r1 = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(r1['versionServed']).toBe(1);
    expect(obj(r1['availability'])).toMatchObject({ index_state: 'stale', current_version: 1, drift: { projected: 'active@7', log: 'active@1' }, state: 'active', served_is_current: true });
    expect(obj(obj(r1['version'])['payload'])['statement']).toBe(memoryItem()['statement']);
    expect(obj(r1['projection'])).toMatchObject({ condition: 'withdrawn', withdrawn: ['memory_items_current'] });
    expect(String(r1['accessId'])).toMatch(UUID);
    expect((await accessRows(M1)).length).toBe(accessesBefore + 1);
    expect((await accessRows(M1)).at(-1)).toMatchObject({ object_version: 1, purpose_id: 'memory', reader_principal_id: reader.principalId });
    // THE BRIEFING says degraded with the memory partition withdrawn (the STATE only rides the content — D12).
    const composed = (await c.compose({ roomId: null, knownAt: new Date().toISOString(), priorBriefingId: null }) as unknown as { briefing: Row }).briefing;
    expect(composed['degraded']).toBe(true);
    expect(obj(composed['projection'])).toMatchObject({ condition: 'withdrawn', partitions: [expect.objectContaining({ projection: 'memory_items_current', condition: 'withdrawn' })] });
    const m1 = (composed['items'] as Row[]).find((i) => i['kind'] === 'memory' && i['id'] === M1);
    expect(m1).toBeDefined(); expect(obj(m1!['details'])['basis_state']).toBeNull();
    // the STATE rides the content's WATERMARK (not the payload's top level: BRF@v1 declares additionalProperties false — the reconcile note in briefing.service.ts)
    expect((await sql<{ p: Row }>`select payload -> 'watermark' -> 'projection' as p from objects.canonical_objects where object_id = ${String(composed['briefingId'])}::uuid`.execute(su)).rows[0]!.p).toEqual({ memory: 'withdrawn' });
    // THE AGENT with on_degraded STOPS before anything is admitted.
    const stopped = (await c.runAgent(agent.agentId, { task: 'briefing', roomId })).run;
    expect(stopped.outcome).toBe('stopped');
    expect(String(stopped.stopReason)).toMatch(/^stop condition on_degraded: the memory projection of this domain is withdrawn \(the memory items are served from their log, labelled\)/);
    // THE REBUILD re-projects the drifted item from the canonical version its log names.
    const ra = await rebuildD('memory_items_current', 'the drifted version is the harness\'s own fault; re-projected from the canonical version (harness)', 'rebuilt');
    expect(ra.report).toMatchObject({ updated: 1, inserted: 0, removed: 0, restored: [{ id: M1, change: 'updated', to: 'active@1' }] });
    expect((await itemRow(M1))!.object_version).toBe(1);
    const finished = (await c.runAgent(agent.agentId, { task: 'briefing', roomId })).run;
    expect(finished.outcome).toBe('finished');
    expect((await sql<{ degraded: boolean }>`select degraded from executive.briefings where briefing_id = ${String(finished.outputs['briefing_id'])}::uuid`.execute(su)).rows[0]!.degraded).toBe(false);
    await redriveAndPinCurrent('P6(a)', a.event, ra.event);
    sixEvidence('P6(a)', { fault_trace: { superuser_update: `memory.items_current ${M1} object_version → 7`, check_id: a.check.check_id }, watermark: { drift_event: a.event.partition_seq, condition: 'withdrawn' }, consumer_behaviour: { retrieval: 'index_state stale, current_version 1 (the log\'s), drift active@7/active@1, the access row on version 1', briefing: 'degraded true, projection.memory withdrawn', agent: stopped.stopReason }, operator_action: { rebuild_id: ra.report['rebuild_id'] }, recovery: { updated: 1, agent_after: finished.outcome }, reconciliation: { checks: [1, 0], reads: 'current' } });
    // (a2) THE POLICY COLUMNS (C6): the projection's audience widened — the check compares them to the canonical version; the served version's audience decides while the tier answers.
    await sql`update memory.items_current set audience_purposes = array['memory', 'briefing', 'decision'] where item_id = ${M1}::uuid`.execute(su);
    const a2 = await driftDelivered('P6 policy', 'memory_items_current');
    expect(checkRowOf(a2.check, 'memory_items_current')).toMatchObject({ mismatched: 1, missing: 0, unexpected: 0, failed: true });
    const r2 = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(obj(r2['availability'])['index_state']).toBe('stale');
    expect(obj(r2['availability'])['drift'], 'drift names state and version only — the policy drift is the check\'s').toBeNull();
    expect(await failure(retrieveAs(analyst, M1, 'decision'))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    const ra2 = await rebuildD('memory_items_current', 'the widened audience is the harness\'s own fault; re-projected from the canonical version (harness)', 'rebuilt');
    expect(ra2.report).toMatchObject({ updated: 1, inserted: 0, removed: 0 });
    expect((await itemRow(M1))!.audience_purposes).toEqual(['memory', 'briefing']);
    await redriveAndPinCurrent('P6(a2)', a2.event, ra2.event);
    sixEvidence('P6(a2)', { fault_trace: { superuser_update: `memory.items_current ${M1} audience_purposes widened by decision`, check_id: a2.check.check_id }, watermark: { drift_event: a2.event.partition_seq }, consumer_behaviour: 'the retrieval stale without a state/version drift; the analyst under decision still refused (the served version\'s audience decides)', operator_action: { rebuild_id: ra2.report['rebuild_id'] }, recovery: { updated: 1, audience_purposes: ['memory', 'briefing'] }, reconciliation: { checks: [1, 0], reads: 'current' } });
    // (b) THE CONTENT TIER DID NOT ANSWER (C5): a refused reader consumes the point and learns nothing.
    const eventsBefore = (await itemEvents(M1)).filter((e) => e.event === 'memory.retrieval_degraded').length;
    const accessesBeforeB = (await accessRows(M1)).length;
    fault.arm(['b20.memory_content_unavailable'], 'test');
    const refused = await failure(retrieveAs(analyst, M1, 'decision'));
    expect(refused).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    expect(refused.message).toMatch(/a memory item is read under a purpose its audience declares \(memory, briefing\); the admitted purpose cannot be checked while the content tier does not answer; this read states decision/);
    expect(fault.isArmed('b20.memory_content_unavailable'), 'the refused read consumed the point').toBe(false);
    expect((await itemEvents(M1)).filter((e) => e.event === 'memory.retrieval_degraded').length).toBe(eventsBefore);
    expect((await accessRows(M1)).length).toBe(accessesBeforeB);
    // the reader's retrieval: 200 METADATA-ONLY — no version, no access row, ONE ledger row, the audit row's result code.
    fault.arm(['b20.memory_content_unavailable'], 'test');
    const degradedAnswer = await retrieveAs(reader, M1, 'memory');
    const d = degradedAnswer.memory;
    expect(d).toMatchObject({ content: 'unavailable', version: null, versionServed: null, versions: null, accessId: null,
      degraded: { kind: 'content_unavailable', code: 'EYE-DEG-001', label: CONTENT_UNAVAILABLE_LABEL, detail: 'injected fault at b20.memory_content_unavailable' } });
    expect(obj(d['item'])).toMatchObject({ state: 'active', current_version: 1 });
    expect(obj(d['projection'])['condition']).toBe('current');
    expect(fault.isArmed('b20.memory_content_unavailable')).toBe(false);
    expect((await accessRows(M1)).length, 'no access row: nothing was served').toBe(accessesBeforeB);
    const ledger = (await itemEvents(M1)).filter((e) => e.event === 'memory.retrieval_degraded');
    expect(ledger.length).toBe(eventsBefore + 1);
    expect(ledger.at(-1)).toMatchObject({ object_version: 1, details: expect.objectContaining({ purpose: 'memory', cause: 'content_unavailable', access_recorded: false, code: 'EYE-DEG-001' }) });
    const audit = (await auditRowOf(degradedAnswer.receipt.auditSeq, 'memory.item.retrieve'))!;
    expect(audit).toMatchObject({ outcome: 'success', result_code: 'EYE-DEG-001' });
    expect(audit.metadata).toMatchObject({ content: 'unavailable', version_served: null, access_id: null });
    // THE RECOVERY: the point fired once — the next retrieval serves the content with an access row.
    const served = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(served['versionServed']).toBe(1); expect(served['content']).toBeUndefined(); expect(String(served['accessId'])).toMatch(UUID);
    expect((await accessRows(M1)).length).toBe(accessesBeforeB + 1);
    sixEvidence('P6(b)', { fault_trace: { point: 'b20.memory_content_unavailable', armed_twice: true, is_armed_after: false }, watermark: { condition: 'current', note: 'the content tier, not the projection' }, consumer_behaviour: { refused_reader: '403 (the audience-list gate), no ledger row, no access row', reader: '200 metadata-only, content unavailable, EYE-DEG-001, no version, no access row' }, operator_action: 'none (the reader retries)', recovery: 'the next retrieval served version 1 with an access row', reconciliation: { ledger_row: 'memory.retrieval_degraded', audit_result_code: 'EYE-DEG-001', access_rows_unchanged_by_the_degraded_read: true } });
    // (b2) THE NARROWER GATE (C7): an item whose audience list lacks the admitted purpose — served with the tier up, refused with it down.
    const M2 = (await recordAs(reader, memoryItem({ title: 'B20 memory item M2', audience: { classification: 'internal', roles: [], purposes: ['briefing'] } }))).memory.itemId;
    await settle();
    expect((await retrieveAs(reader, M2, 'memory')).memory['versionServed']).toBe(1);
    const m2Accesses = (await accessRows(M2)).length;
    fault.arm(['b20.memory_content_unavailable'], 'test');
    const narrower = await failure(retrieveAs(reader, M2, 'memory'));
    expect(narrower).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    expect(narrower.message).toMatch(/a memory item is read under a purpose its audience declares \(briefing\); the admitted purpose cannot be checked while the content tier does not answer; this read states memory/);
    expect(fault.isArmed('b20.memory_content_unavailable')).toBe(false);
    expect((await itemEvents(M2)).filter((e) => e.event === 'memory.retrieval_degraded')).toEqual([]);
    expect((await accessRows(M2)).length).toBe(m2Accesses);
    sixEvidence('P6(b2)', { fault_trace: { point: 'b20.memory_content_unavailable', item: M2 }, watermark: { condition: 'current' }, consumer_behaviour: 'served with the tier up (the admitted purpose); refused 403 with it down (the audience list alone — narrower, never wider)', operator_action: 'none', recovery: 'the point consumed by the refusal; the next retrieval is served', reconciliation: 'no ledger row, no access row' });
    // (c) THE OPERATOR'S WITHDRAWAL (no drift): the same labelled retrieval, stale without drift; (d) the tier down while withdrawn → the one refusal B20 adds to a read.
    const wc = (await withdraw(domainAdmin, 'memory_items_current', 'no drift: a planned review')).projection;
    expect(wc).toMatchObject({ changed: true, reason: 'no drift: a planned review' });
    const r3 = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(obj(r3['availability'])).toMatchObject({ index_state: 'stale', current_version: 1, drift: null });
    expect(r3['versionServed']).toBe(1);
    expect(obj(r3['projection'])).toMatchObject({ condition: 'withdrawn', withdrawn: ['memory_items_current'] });
    const before503 = (await itemEvents(M1)).filter((e) => e.event === 'memory.retrieval_degraded').length; const accessesBefore503 = (await accessRows(M1)).length;
    fault.arm(['b20.memory_content_unavailable'], 'test');
    const unavailable = await failure(retrieveAs(reader, M1, 'memory'));
    expect(unavailable).toMatchObject({ status: 503, code: 'EYE-DEG-001' });
    expect(unavailable.message).toMatch(/^the memory_items_current projection of this domain is withdrawn \(since .*: no drift: a planned review\) and the content tier did not answer; nothing verified remains to gate a metadata answer on/);
    expect(fault.isArmed('b20.memory_content_unavailable')).toBe(false);
    fault.disarm();
    expect((await itemEvents(M1)).filter((e) => e.event === 'memory.retrieval_degraded').length).toBe(before503);
    expect((await accessRows(M1)).length).toBe(accessesBefore503);
    const r4 = (await retrieveAs(reader, M1, 'memory')).memory;
    expect(obj(r4['availability'])['index_state']).toBe('stale'); expect(r4['versionServed']).toBe(1);
    const rc = await rebuildD('memory_items_current', 'the planned review is complete (harness)', 'restored');
    expect(rc.report).toMatchObject({ updated: 0, inserted: 0, removed: 0 });
    expect((await pevents('memory_items_current')).map((e) => e.event).slice(-2)).toEqual(['projection.withdrawn', 'projection.restored']);
    expect(obj((await retrieveAs(reader, M1, 'memory')).memory['availability'])['index_state']).toBe('projected');
    sixEvidence('P6(c)(d)', { fault_trace: { withdrawal: wc['event_id'], point: 'b20.memory_content_unavailable' }, watermark: { condition: 'withdrawn', drift: null }, consumer_behaviour: { c: 'served stale without drift', d: '503 EYE-DEG-001 — nothing verified remains to gate a metadata answer on' }, operator_action: { withdraw: wc['event_id'], rebuild_id: rc.report['rebuild_id'] }, recovery: { outcome: 'restored', index_state_after: 'projected' }, reconciliation: 'the ledger [withdrawn operator, restored]; no retrieval_degraded row, no access row for the 503' });
  }, 300_000);

  it('P7 · THE DELETION PAUSED while edges_current is withdrawn (projection_withdrawn → unresolved_dependency, human review, no attempt counted, the approvals revoked); the rebuild, a re-resolution and a new approval execute it', async () => {
    // THE UPLOAD H withdrawn by a correction case: its version-1 manifest is the deletable one (the B19 M5 idiom); nothing cites it (the briefings of P6 predate it).
    const [H] = (await h.upload([{ filename: 'b20-h.csv', text: 'a,b\n3,4\n', documentTime: '2024-01-14T00:00:00Z' }])).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest })) as [Evd];
    const sinceH = await mark();
    await applyCase(await submitCorrection([H.id], 'withdrawn by its publisher (B20 harness)', 'withdrawal'), [H.id], 'withdrawal verified against the publisher');
    const corrected = await waitFor('the MemoryCorrected/evidence.corrected row of H published', () => outboxRows('MemoryCorrected', (p) => obj(p['change'])['kind'] === 'evidence.corrected', sinceH), (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published'));
    await delivered(corrected.at(-1)!.id, GRAPH_KINDS.length);   // the memory-mappings, retrieval and the rest applied (a MemoryCorrected reaches the six broad subscriptions too; nothing rests on H)
    const mH = await manifestOf(H.id, 1);
    const o = await open(steward, { kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mH.manifest_id } });
    const id = o.action.actionId;
    const rs = await resolve(steward, id);
    expect(rs.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    await approve(authority, id, String(rs.scope['scope_digest']));
    const wd = (await withdraw(domainAdmin, 'edges_current', 'representation review before the ontology proposal (harness)')).projection;
    expect(wd['changed']).toBe(true);
    const paused = await failure(execute(steward, id));
    expect(paused).toMatchObject({ status: 409, code: 'EYE-STA-002' });
    expect(paused.message).toMatch(/^the execution was rolled back and the action paused: retention execution rejected \(projection_withdrawn\): the safe referential scope reads a projection that is withdrawn — edges_current \(since .*: representation review before the ontology proposal \(harness\)\); the scope cannot be proven until it is rebuilt \(graph\.projection\.rebuild\); the action pauses for human review/);
    expect(await actionRow(id)).toMatchObject({ state: 'paused', failure_class: 'unresolved_dependency', disposition: 'human_review', attempts: 0 });
    expect(await approvalsLive(id)).toBe(0); expect(await approvalsRevoked(id)).toBe(1);
    const pausedEvent = (await actionEvents(id)).find((e) => e.event === 'action.paused')!;
    expect(pausedEvent.details).toMatchObject({ failure_class: 'unresolved_dependency', approvals_revoked: true, attempted: false, attempts: 0 });
    expect(await tombstones(mH.manifest_id)).toBe(0);
    // THE ROUTE BACK: the rebuild, a re-resolution under a new digest, a new approval, the execution.
    const { report } = await rebuildD('edges_current', 'the representation review is complete (harness)', 'restored');
    const again = await resolve(steward, id);
    expect(again.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    await approve(authority, id, String(again.scope['scope_digest']));
    const ex = await execute(steward, id);
    expect(ex.execution).toMatchObject({ executed: 1, refused: 0, held: 0 });
    expect((await actionRow(id)).state).toBe('executed');
    expect(await tombstones(mH.manifest_id)).toBe(1);
    const events = (await actionEvents(id)).map((e) => e.event);
    expect(events).toContain('action.paused'); expect(events.at(-1)).toBe('execution.finished');
    sixEvidence('P7', { fault_trace: { withdrawal: wd['event_id'], execution_refusal: paused.message.slice(0, 160) }, watermark: { edges_current: 'withdrawn' }, consumer_behaviour: { action: 'paused', failure_class: 'unresolved_dependency', disposition: 'human_review', approvals_revoked: true, attempts: 0 }, operator_action: { rebuild_id: report['rebuild_id'], re_resolution: 'scope_resolved', new_approval: true }, recovery: { executed: 1, tombstoned: true }, reconciliation: { events } });
  }, 300_000);

  it('P9 · THE OPERATOR\'S ACTS: the withdrawal idempotent and audited, the strategy reads from the log-join, the restore, a rebuild of a serving partition refused 409, the analyst 403, an unknown projection 404, a short reason 422, a foreign domain 403 EYE-TEN-001 (C13); the register (40/10/0 since B21; 36/14/0 at B20) with L3-I02\'s clause', async () => {
    const first = (await withdraw(domainAdmin, 'strategy_current', 'first reason (harness)')).projection;
    expect(first).toMatchObject({ projection: 'strategy_current', state: 'withdrawn', changed: true, reason: 'first reason (harness)', second_reason: null });
    const second = (await withdraw(domainAdmin, 'strategy_current', 'second reason (harness)')).projection;
    expect(second).toMatchObject({ state: 'withdrawn', changed: false, reason: 'first reason (harness)', second_reason: 'second reason (harness)' });
    expect(instantOf(second['withdrawn_since'])).toBe(instantOf(first['withdrawn_since']));
    expect((await pevents('strategy_current')).map((e) => [e.event, e.details['by'], e.details['changed'], e.details['reason'], e.details['earlier_reason'] ?? null]))
      .toEqual([['projection.withdrawn', 'operator', true, 'first reason (harness)', null], ['projection.withdrawn', 'operator', false, 'second reason (harness)', 'first reason (harness)']]);
    const strategy = await read(analyst, 'strategyList');
    expect(strategy.projection).toMatchObject({ condition: 'withdrawn', withdrawn: ['strategy_current'] });
    const rows = strategy.answer['strategy'] as Row[];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((s) => s['from'] === 'projection' && s['projected'] === true)).toBe(true);
    expect(rows.map((s) => s['strategy_object_id'])).toEqual(expect.arrayContaining([w.objectiveId, w.decisionId, w.assumptionId]));
    const one = await read(analyst, 'strategyGet', { objectId: w.assumptionId });
    expect(obj(one.answer['object'])).toMatchObject({ strategy_object_id: w.assumptionId, from: 'projection' });
    const { report } = await rebuildD('strategy_current', 'the review is complete (harness)', 'restored');
    expect(report).toMatchObject({ updated: 0, inserted: 0, removed: 0 });
    const serving = await refusal(rebuild(domainAdmin, 'strategy_current', 'a rebuild of a serving partition (harness)'));
    expect(serving).toMatchObject({ status: 409, code: 'EYE-STA-002' });
    expect(serving.message).toMatch(/^projection rebuild rejected: the strategy_current partition of this domain is serving; withdraw it first \(graph\.projection\.withdraw\) or let the retrieval check withdraw it/);
    expect(await failure(withdraw(analyst, 'edges_current', 'not mine to do (harness)'))).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    const unknown = await failure(withdraw(domainAdmin, 'vector_index', 'no such thing (harness)'));
    expect(unknown).toMatchObject({ status: 404, code: 'EYE-STA-001', message: 'vector_index is not a projection of this domain (one of entities_current, resolutions_current, edges_current, strategy_current, invalidations_current, memory_items_current)' });
    expect(await failure(withdraw(domainAdmin, 'edges_current', 'short'))).toMatchObject({ status: 422, code: 'EYE-REQ-001' });
    // C13: the domain exists and the principal has no standing there — the pipeline's scope resolution answers 403 EYE-TEN-001 (the brief's 404 does not arise).
    const foreign = await failure(withdraw(domainAdmin, 'edges_current', 'another domain (harness)', DX));
    expect(foreign).toMatchObject({ status: 403, code: 'EYE-TEN-001' });
    expect(foreign.message).toMatch(/principal has no binding for this domain/);
    expect((await partition('edges_current'))!.state).toBe('serving');
    const reg = (await interfaces()).interfaces;
    const count = (s: string) => reg.filter((r) => r['binding_state'] === s).length;
    // B21 (0081 §10): L5-I05, L6-I03, L7-I04 and L8-I04 bound → 40/10/0 (this file runs on the same tree; the B20 state was 36/14/0)
    // B22 (0083 §9): L1-I03, L1-I04, L2-I02 and L10-I05 bound → 44/6/0 (L3-I02 among the six that stay partial)
    // B23 (0084): the six bound → 50/0/0; L3-I02 is bound as RetrieveContext, its B20 clause kept after "earlier:"
    expect([reg.length, count('bound'), count('partial'), count('unbound')]).toEqual([50, 50, 0, 0]);
    const l3 = reg.find((r) => r['interface_id'] === 'L3-I02')!;
    expect(l3['binding_state']).toBe('bound'); expect(l3['bound_in']).toBe('0084'); expect(String(l3['bound_to'])).toContain('B20 (0080)');
    const state = (await read(analyst, 'edgesList')).projection;
    sixEvidence('P9', { fault_trace: { withdrawals: [first['event_id'], second['event_id']], refusals: { serving: 409, analyst: 403, unknown: 404, short: 422, foreign: 'EYE-TEN-001' } }, watermark: { checkpoint_seq: state.checkpoint_seq, verified_seq: state.verified_seq, note: 'unchanged by the operator\'s acts (no outbox event but the rebuild\'s)' }, consumer_behaviour: '/strategy/list from the log-join (from projection on the content columns)', operator_action: { rebuild_id: report['rebuild_id'] }, recovery: { outcome: 'restored' }, reconciliation: { ledger: ['withdrawn true', 'withdrawn false', 'restored'], register: '40/10/0 (36/14/0 at B20; B21 bound four rows)' } });
  }, 300_000);

  it('P8 · THE SEARCH\'S COMPLETENESS (V03-T-098), LAST: 1,001 entities with their events → complete.entities false, the bound named, 50 hits, the projection current after the next check (nothing unexpected)', async () => {
    await sql`with ids as (select gen_random_uuid() as id, n from generate_series(1, 1001) n),
      ins as (insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
              select id, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'organization', 'Bulk ' || n, 'bulk ' || n, 'active', ${owner.principalId}::uuid, gen_random_uuid() from ids
              returning entity_id, canonical_name, normalized_name, correlation_id)
      insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
      select gen_random_uuid(), 'DOMAIN', ${T()}::uuid, ${D()}::uuid, entity_id, 'entity.created', ${owner.principalId}::uuid,
             jsonb_build_object('entity_type', 'organization', 'canonical_name', canonical_name, 'normalized_name', normalized_name, 'split_from', null), correlation_id from ins`.execute(su);
    const { event } = await triggerChange('P8');
    const ds = await delivered(event.id);
    expect(ds.find((d) => d.consumer_kind === 'retrieval')).toMatchObject({ state: 'applied', items_applied: [expect.objectContaining({ effect: 'projections.verified' })] });
    expect(checkRowOf(await latestCheck(), 'entities_current')).toMatchObject({ mismatched: 0, missing: 0, unexpected: 0, failed: false });
    const { answer, projection } = await read(analyst, 'search', { query: 'Bulk', limit: 50 });
    const s = obj(answer['search']);
    expect(s['complete']).toEqual({ entities: false, objects: true });
    expect(s['bounds']).toEqual({ entities: 1000, objects: 2000 });
    expect(s['note']).toBe('the entity scan is bounded at 1,000 rows and the object scan at the 2,000 newest; a match beyond a bound is not returned');
    expect((s['entities'] as Row[]).length).toBe(50);
    expect(projection).toMatchObject({ condition: 'current', revision: event.partition_seq, verified_seq: event.partition_seq });
    sixEvidence('P8', { fault_trace: 'the bound itself: 1,001 entities with their events', watermark: { revision: event.partition_seq, verified_seq: event.partition_seq, condition: 'current' }, consumer_behaviour: { complete: s['complete'], bounds: s['bounds'], hits: 50 }, operator_action: 'none', recovery: 'none (the bound is declared, not lifted)', reconciliation: 'the flag' });
  }, 300_000);
});
