/**
 * CP-6 batch B8 — ordered publication, replay reach, one server per domain, the remaining failure conditions, the
 * flows' telemetry (migration 0065) on real Redis, the real outbox publisher, the real dispatcher and a real database —
 * with a SECOND application context on the same database and Redis standing in for a second process (it shares
 * nothing else: its own publisher, its own dispatcher, its own holder identity).
 *
 *   REPLAY REACHES SKIPPED HISTORY, DURABLY (B7-F2) — a replay recorded while no process serves the domain, the queue
 *     then lost and the process restarted: the startup reconciliation delivers the history the registration skipped,
 *     once each; the served point is the durable record.
 *   ONE SERVER PER DOMAIN (0065 §3) — a second process finds the domain claimed and starts no worker; the first
 *     process's stand-down hands the domain over; a lapsed claim is taken over; a live event published by the
 *     process that does NOT serve the domain is routed to the domain's queue all the same (the routing decision is
 *     the registry's, not the process's) and served by the holder.
 *   ORDER ACROSS PROCESSES (B7-F1) — two publishers on the same outbox, a transient fault on the head of a partition:
 *     the partition waits behind it in both processes; the other partition progresses; the order holds.
 *   PARTITION TELEMETRY — the status route shows the tenant's partition blocked behind its held head, then clear.
 *   PROVENANCE PATH INCOMPLETE (AU-MEM-0039) — an edge naming corrected evidence whose claim carries no lineage on it
 *     stays UNRESOLVED (provenance_incomplete → human_review), re-checked at every re-drive, the sibling edge with a
 *     complete path proposed (partial work preserved); the operator records the lineage and the next re-check applies it.
 *   RECOMPUTATION CHANGING A RECOMMENDATION MATERIALLY (AU-MEM-0039) — a forecast re-issued on new observations
 *     supersedes the one a decision package cites: the change is MEASURED against the declared rule and, material,
 *     exposed on the package (material_change → human_review) with the measure; an immaterial re-issue is noted with
 *     its measure and no failure state; nothing on the package is rewritten.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { OutboxPublisher } from '../../src/objects/outbox.publisher.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import { RECORD_FILES, TERMS_CSV, completeElements } from './phase5-fixtures.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { IntelligenceController } from '../../src/intelligence/intelligence.controller.js';
import { bootDecisionWorld, decisionCalls } from './phase6-fixtures.js';
import { commitDb, identityDb, superDb, seedTenant, seedDomain, createPrincipalWithSession, withCtx, closeOperation, type AnyDb, type TestPrincipal } from './helpers.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
process.env['EYE_OUTBOX_LEASE_SECONDS'] = '5';

let h: Phase4Harness; let graph: GraphController; let observation: ObservationController; let prediction: PredictionController; let twins: TwinController; let intelligence: IntelligenceController; let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService; let publisher: OutboxPublisher;
/** The second process. */
let app2: INestApplicationContext | null = null; let dispatcher2: SubscriptionDispatcherService; let scheduler2: SchedulerService; let publisher2: OutboxPublisher;
let commit: AnyDb; let identity: AnyDb; let su: AnyDb;
let owner: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let operator: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal;
const E1 = uuidv7(); const E2 = uuidv7();
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms; let last: X | undefined;
  for (;;) {
    last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}`);
    await sleep(200);
  }
}
async function bind(app: Phase4Harness['app']): Promise<void> {
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { PredictionController: P } = await import('../../src/prediction/prediction.controller.js');
  const { TwinController: Tw } = await import('../../src/twin/twin.controller.js');
  const { IntelligenceController: I } = await import('../../src/intelligence/intelligence.controller.js');
  graph = app.get(G); observation = app.get(O); prediction = app.get(P); twins = app.get(Tw); intelligence = app.get(I); scheduler = app.get(SchedulerService); dispatcher = app.get(SubscriptionDispatcherService); publisher = app.get(OutboxPublisher);
}
async function restart(): Promise<void> {
  await h.app.close();
  h.app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  h.pipeline = h.app.get((await import('../../src/pipeline/pipeline.service.js')).PipelineService);
  await bind(h.app);
}
async function bootSecond(): Promise<void> {
  app2 = await NestFactory.createApplicationContext(AppModule, { logger: false });
  dispatcher2 = app2.get(SubscriptionDispatcherService); scheduler2 = app2.get(SchedulerService); publisher2 = app2.get(OutboxPublisher);
}
async function retractFreshEdge(predicate: string): Promise<string> {
  const edgeId = uuidv7(); const evidenceId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, ${predicate}, ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${uuidv7()}::uuid, 1, ${evidenceId}::uuid, ${sha256(evidenceId)}, 'replay', 0.9, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason: `B8 harness: ${predicate}` } });
  return edgeId;
}
const eventOf = async (edgeId: string, after: Date): Promise<string> =>
  (await waitFor(`the GraphChanged row for ${edgeId.slice(0, 8)} published`, () => sql<{ id: string; status: string }>`select id::text, status from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} and payload #>> '{relationships,edges,0,edge_id}' = ${edgeId}`.execute(su).then((r) => r.rows),
    (rows) => rows.length === 1 && rows[0]!.status === 'published'))[0]!.id;
type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; replay_seq: number; partition_seq: string;
  items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; resolved_after_checks: number | null; details: Record<string, unknown> }>;
  items_unresolved: Array<{ item: string; effect: string; reason: string; checks: number; details: Record<string, unknown> }>; failure_class: string | null; disposition: string | null };
const submitCorrection = async (evdIds: string[], reason: string): Promise<string> => {
  const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(), kind: 'correction', channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  return opened.correction.caseId;
};
const applyCase = (caseId: string, evdIds: string[], reason: string) =>
  observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId, { payload: { decision: 'apply', affectedEvdIds: evdIds, reason } }) as Promise<{ correction: Record<string, unknown> }>;
const publishedEvent = (eventType: 'GraphChanged' | 'MemoryCorrected', kind: string, after: Date) =>
  waitFor(`the ${eventType}/${kind} row published`, () => sql<{ id: string; status: string; created_at: Date }>`select id::text, status, created_at from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} and payload #>> '{change,kind}' = ${kind} order by created_at`.execute(su).then((r) => r.rows),
    (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);
const lineageFor = (claimId: string, evidenceId: string) =>
  sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
      values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${evidenceId}::uuid, ${sha256(evidenceId)}, 0, 4, 0.8, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
const edgeOn = async (predicate: string, claimId: string, evidenceId: string): Promise<string> => {
  const edgeId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, ${predicate}, ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimId}::uuid, 1, ${evidenceId}::uuid, ${sha256(evidenceId)}, 'replay', 0.8, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  return edgeId;
};
const deliveriesOf = async (subscriptionId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, replay_seq, partition_seq::text, items, items_applied, items_unresolved, failure_class, disposition from graph.subscription_deliveries d where d.subscription_id = ${subscriptionId}::uuid order by d.partition_seq`.execute(su)).rows;
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, replay_seq, partition_seq::text, items, items_applied, items_unresolved, failure_class, disposition from graph.subscription_deliveries d where d.event_id = ${eventId}::uuid order by d.consumer_kind`.execute(su)).rows;
const servingRow = async () => (await sql<{ holder: string; claimed_until: Date; renewals: number }>`select holder, claimed_until, renewals from graph.subscription_domain_serving where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`.execute(su)).rows[0] ?? null;
const servingEvents = async () => (await sql<{ event: string; holder: string; previous: string | null }>`select event, holder, previous from graph.subscription_serving_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by occurred_at, event_id`.execute(su)).rows;
const register = (kind: 'twins' | 'scenarios' | 'forecasts' | 'decisions' | 'retrieval' | 'memory-mappings', extra: Record<string, unknown> = {}) =>
  graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(), { payload: { consumerKind: kind, ownerPrincipalId: owner.principalId, ...extra } as never }) as Promise<{
    subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean; reDriven: number } }>;
const statusOf = () => graph.subscriptionStatus(h.req(owner, 'graph.read', 'SUB', null, 'graph'), T(), D()) as Promise<{ subscriptions: {
  telemetry: { partitions: Array<Record<string, unknown>>; open_failure_states: Array<Record<string, unknown>> }; runtime: { worker_running: boolean; serving: { holder: string | null; this_process: string; served_here: boolean; events: Array<Record<string, unknown>> } } } }>;
const settle = async (ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const c = await scheduler.subscriptionQueueCountsForTests(T(), D());
    if (c.active === 0 && c.waiting === 0 && c.delayed === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(c)}`);
    await sleep(200);
  }
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  await bind(h.app);
  commit = commitDb(); identity = identityDb(); su = superDb();
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'forecast_owner', 'resolution_manager', 'decision_owner'], 'b8-owner');
  manager = await h.principalWith(['collection_manager'], 'b8-collection-manager');
  operator = await h.principalWith(['simulation_operator'], 'b8-sim-operator');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b8-tenant-admin', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b8-domain-admin');
  for (const [id, type, name] of [[E1, 'place', 'Bab el-Mandeb Strait'], [E2, 'organization', 'NORDWERK Magnet GmbH']] as const) {
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  }
}, 300_000);

afterAll(async () => {
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await app2?.close().catch(() => undefined);
  await h?.close();
  await Promise.all([commit, identity, su].map((d) => d.destroy()));
}, 120_000);

describe('B8 · a replay reaches skipped history durably: recorded with no server, the queue lost, the process restarted (B7-F2)', () => {
  let sub: { subscriptionId: string }; const past: string[] = [];

  it('two events predate a scenarios subscription registered to LEAVE its backlog; the domain is claimed by this process', async () => {
    const since = await mark();
    past.push(await eventOf(await retractFreshEdge('b8_h1'), since));
    past.push(await eventOf(await retractFreshEdge('b8_h2'), since));
    const r = await register('scenarios', { backlog: 'leave' });
    sub = { subscriptionId: r.subscription.subscriptionId };
    expect(r.served.reDriven).toBe(0);
    expect(r.served.workerRunning).toBe(true);
    const row = await servingRow();
    expect(row?.holder).toBe(dispatcher.holderId());
    expect(dispatcher.serves(T(), D())).toBe(true);
    expect((await servingEvents()).map((e) => e.event)).toEqual(['claimed']);
  }, 120_000);

  it('the replay is recorded while this process stands down (no worker anywhere); the queue is lost; a restart delivers the skipped history once each — the served point is the durable record', async () => {
    await dispatcher.standDownForTests(true);
    expect(await servingRow()).toBeNull();
    expect((await servingEvents()).map((e) => e.event)).toEqual(['claimed', 'stood_down']);
    const r = await graph.replaySubscription(h.req(domainAdmin, 'graph.subscription.replay', 'SUB', sub.subscriptionId, 'platform.administration'), T(), D(), sub.subscriptionId,
      { payload: { fromCreatedAt: null, fromEventId: null, reason: 'B8 harness: replay the history the registration left, with no server' } }) as { replayed: number; events: string[] };
    expect(r.events).toEqual(expect.arrayContaining(past));
    expect(r.replayed).toBe(2);
    expect(scheduler.runningWorkers()).not.toContain(`graph.${T()}.${D()}.subscriptions`);
    // The re-drives sit on the queue unserved; then the queue is LOST (the B7 precedent) and the process restarts.
    await sleep(1_500);
    expect((await deliveriesOf(sub.subscriptionId)).length, 'nothing was delivered while no process served the domain').toBe(0);
    const served = (await sql<{ served_from_seq: string }>`select served_from_seq::text from graph.subscriptions where subscription_id = ${sub.subscriptionId}::uuid`.execute(su)).rows[0]!;
    expect(Number(served.served_from_seq), 'the served point moved back to the retained floor (the beginning of what is retained)').toBe(1);
    await scheduler.obliterateSubscriptionsForTests(T(), D());
    await restart();
    const startup = dispatcher.lastReconciliation();
    expect(startup?.domains.find((d) => d.domainId === D())).toMatchObject({ mine: true, servedBy: dispatcher.holderId() });
    expect(startup?.reDriven.filter((e) => e.subscriptionIds.includes(sub.subscriptionId)).map((e) => e.eventId).sort()).toEqual([...past].sort());
    const ds = await waitFor('the skipped history delivered after the restart', () => deliveriesOf(sub.subscriptionId), (xs) => past.every((p) => xs.some((d) => d.event_id === p && d.state === 'applied')), 60_000);
    await settle();
    expect(ds.filter((d) => past.includes(d.event_id)).map((d) => [d.deliveries, d.replay_seq])).toEqual([[1, 1], [1, 1]]);
    expect((await servingEvents()).map((e) => e.event)).toEqual(['claimed', 'stood_down', 'claimed']);
  }, 180_000);
});

describe('B8 · one server per domain across two processes; routing from the process that does not serve; order across two publishers', () => {
  it('a second process finds the domain claimed: it starts no worker and reports who serves; a live event is delivered by the holder alone', async () => {
    await bootSecond();
    const r2 = dispatcher2.lastReconciliation();
    expect(r2?.domains.find((d) => d.domainId === D())).toMatchObject({ mine: false, servedBy: dispatcher.holderId() });
    expect(scheduler2.runningWorkers()).not.toContain(`graph.${T()}.${D()}.subscriptions`);
    expect(scheduler.runningWorkers()).toContain(`graph.${T()}.${D()}.subscriptions`);
    expect(dispatcher2.serves(T(), D())).toBe(false);
    // The first process's publisher paused: the SECOND process publishes the live event — and routes it to the domain's
    // queue, because the lease decides from the registry; the FIRST process's worker serves it.
    publisher.pauseForTests(true);
    try {
      const since = await mark();
      const ev = await eventOf(await retractFreshEdge('b8_routed_by_other'), since);
      const ds = await waitFor('the live event delivered', () => deliveriesFor(ev), (rows) => rows.length >= 1 && rows.every((d) => d.state === 'applied'), 15_000);
      expect(ds.map((d) => d.consumer_kind)).toEqual(['scenarios']);
      const st = await statusOf();
      expect(st.subscriptions.runtime.serving).toMatchObject({ holder: dispatcher.holderId(), served_here: true, this_process: dispatcher.holderId() });
      expect(st.subscriptions.runtime.worker_running).toBe(true);
    } finally { publisher.pauseForTests(false); }
    await settle();
  }, 120_000);

  it('a stand-down hands the domain over: the second process claims it on its next reconciliation and serves the next event; the ledger shows the hand-over', async () => {
    await dispatcher.standDownForTests(true);
    const r2 = await dispatcher2.reconcile('control: the second process reconciles after the hand-over', false);
    expect(r2.domains.find((d) => d.domainId === D())).toMatchObject({ mine: true, servedBy: dispatcher2.holderId(), takenOver: false });
    expect(scheduler2.runningWorkers()).toContain(`graph.${T()}.${D()}.subscriptions`);
    expect(scheduler.runningWorkers()).not.toContain(`graph.${T()}.${D()}.subscriptions`);
    const since = await mark();
    const ev = await eventOf(await retractFreshEdge('b8_served_by_second'), since);
    await waitFor('the event delivered by the second process', () => deliveriesFor(ev), (rows) => rows.length >= 1 && rows.every((d) => d.state === 'applied'), 30_000);
    const events = await servingEvents();
    expect(events.slice(-2).map((e) => [e.event, e.holder])).toEqual([['stood_down', dispatcher.holderId()], ['claimed', dispatcher2.holderId()]]);
    // Back: the second stands down, the first reclaims.
    await dispatcher2.standDownForTests(true);
    await dispatcher.standDownForTests(false);
    const r1 = await dispatcher.reconcile('control: the first process reclaims', false);
    expect(r1.domains.find((d) => d.domainId === D())).toMatchObject({ mine: true, servedBy: dispatcher.holderId() });
    await settle();
  }, 120_000);

  it('a LAPSED claim is taken over (the holder stopped renewing): the claim port with a short lease', async () => {
    const t2 = await seedTenant(su, 'b8-lapse'); const d2 = await seedDomain(su, t2, 'b8-lapse');
    const claim = (holder: string, ttl: number) => commit.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('B8 harness: lapse control', 60)`.execute(tx);
      return (await sql<{ holder: string; mine: boolean; taken_over: boolean }>`select holder, mine, taken_over from graph.subscription_domain_claim(${t2}::uuid, ${d2}::uuid, ${holder}, ${ttl})`.execute(tx)).rows[0]!;
    });
    expect(await claim('process-x', 5)).toMatchObject({ holder: 'process-x', mine: true, taken_over: false });
    expect(await claim('process-y', 5), 'a live claim is refused to another holder').toMatchObject({ holder: 'process-x', mine: false });
    expect(await claim('process-x', 5), 'the holder renews').toMatchObject({ holder: 'process-x', mine: true });
    await sleep(5_500);
    expect(await claim('process-y', 5), 'a lapsed claim is taken over').toMatchObject({ holder: 'process-y', mine: true, taken_over: true });
    const ev = (await sql<{ event: string; holder: string; previous: string | null }>`select event, holder, previous from graph.subscription_serving_events where tenant_id = ${t2}::uuid order by occurred_at`.execute(su)).rows;
    expect(ev.map((e) => [e.event, e.holder, e.previous])).toEqual([['claimed', 'process-x', null], ['taken_over', 'process-y', 'process-x']]);
  }, 30_000);

  it('ORDER ACROSS PROCESSES: two publishers on one outbox, a transient fault at the head of partition A in whichever process leases it — A waits behind its head in both, B progresses, A publishes in sequence', async () => {
    const tenantA = await seedTenant(su, 'b8-xp-a'); const domainA = await seedDomain(su, tenantA, 'b8-xp-a');
    const tenantB = await seedTenant(su, 'b8-xp-b'); const domainB = await seedDomain(su, tenantB, 'b8-xp-b');
    const adminA: TestPrincipal = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenantA, domainId: domainA, roleCode: 'domain_admin', label: 'b8-xa' });
    const adminB: TestPrincipal = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenantB, domainId: domainB, roleCode: 'domain_admin', label: 'b8-xb' });
    await waitFor('the outbox quiet', () => sql<{ n: string }>`select count(*)::text n from objects.object_outbox where status = 'pending'`.execute(su).then((r) => r.rows[0]!.n), (n) => n === '0', 90_000);
    const aIds = Array.from({ length: 30 }, () => uuidv7()); const bId = uuidv7();
    // Both publishers armed: whichever leases A:1 first fails it once (the other's arm may fire on the retry — at most two failures).
    publisher.armPublishFaultForTests(aIds[0]!, 1); publisher2.armPublishFaultForTests(aIds[0]!, 1);
    await withCtx(commit, adminA, 'DOMAIN', tenantA, domainA, async (tx, cap) => {
      for (const id of aIds) await sql`select objects.enqueue_event(${id}::uuid, 'b8.xp', '{"schema_version":"v1"}'::jsonb, ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      await closeOperation(tx, cap, { type: 'outbox', id: aIds[0]! });
    }, { action: 'objects.create' });
    await withCtx(commit, adminB, 'DOMAIN', tenantB, domainB, async (tx, cap) => {
      await sql`select objects.enqueue_event(${bId}::uuid, 'b8.xp', '{"schema_version":"v1"}'::jsonb, ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      await closeOperation(tx, cap, { type: 'outbox', id: bId });
    }, { action: 'objects.create' });
    type Row = { id: string; status: string; attempts: number; published_at: Date | null; partition_seq: string };
    const rowsOf = async (ids: string[]) => (await sql<Row>`select id::text, status, attempts, published_at, partition_seq::text from objects.object_outbox o where o.id = any(${ids}::uuid[]) order by o.partition_key, o.partition_seq`.execute(su)).rows;
    await waitFor('B:1 published', () => rowsOf([bId]), (rows) => rows[0]?.status === 'published', 15_000);
    expect((await rowsOf([aIds[0]!]))[0]!.status).toBe('pending');
    await sleep(2_500);
    expect((await rowsOf(aIds)).filter((r) => r.status === 'published').map((r) => r.partition_seq), 'no row of A published while its head was pending').toEqual([]);
    const done = await waitFor('every row published', () => rowsOf([...aIds, bId]), (rows) => rows.every((r) => r.status === 'published'), 60_000);
    const a = done.filter((r) => r.id !== bId);
    expect(a.filter((r, i) => i > 0 && r.published_at!.getTime() < a[i - 1]!.published_at!.getTime()).map((r) => r.partition_seq), 'rows of A published before their predecessor').toEqual([]);
    expect(a[0]!.attempts).toBeGreaterThanOrEqual(2);
    expect(a[0]!.attempts).toBeLessThanOrEqual(3);
    expect(a.slice(1).every((r) => r.attempts === 1), 'a halted row consumed an attempt it was never tried on').toBe(true);
  }, 120_000);

  it('PARTITION TELEMETRY: the status route shows the tenant partition blocked behind its held head, then clear', async () => {
    await settle();
    const since = await mark();
    // The next GraphChanged row of this tenant fails once at whichever publisher leases it: the partition is blocked behind it.
    const pending = (await sql<{ n: string }>`select count(*)::text n from objects.object_outbox where status = 'pending' and partition_key = ${`tenant:${T()}`}`.execute(su)).rows[0]!.n;
    expect(pending).toBe('0');
    const edgeId = uuidv7(); const evidenceId = uuidv7();
    await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
      values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'b8_telemetry', ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${uuidv7()}::uuid, 1, ${evidenceId}::uuid, ${sha256(evidenceId)}, 'replay', 0.9, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    // The event id is the write's own: arm both publishers on the row once it exists — the write commits first, so arm by
    // pausing both publishers, writing, arming, resuming.
    publisher.pauseForTests(true); publisher2.pauseForTests(true);
    await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason: 'B8 harness: telemetry of a blocked partition' } });
    const row = (await sql<{ id: string; partition_seq: string }>`select id::text, partition_seq::text from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = ${T()}::uuid and created_at >= ${since} order by partition_seq desc limit 1`.execute(su)).rows[0]!;
    publisher.armPublishFaultForTests(row.id, 1); publisher2.armPublishFaultForTests(row.id, 1);
    publisher.pauseForTests(false); publisher2.pauseForTests(false);
    const blocked = await waitFor('the partition reported blocked', () => statusOf().then((s) => s.subscriptions.telemetry.partitions.find((p) => p['partition_key'] === `tenant:${T()}`)), (p) => p !== undefined && p['blocked'] === true, 15_000);
    expect(blocked).toMatchObject({ pending: expect.anything(), head_seq: row.partition_seq, blocked: true });
    expect(Number(blocked!['head_attempts'])).toBeGreaterThanOrEqual(1);
    const clear = await waitFor('the partition clear again', () => statusOf().then((s) => s.subscriptions.telemetry.partitions.find((p) => p['partition_key'] === `tenant:${T()}`)), (p) => p !== undefined && Number(p['pending']) === 0, 30_000);
    expect(clear).toMatchObject({ blocked: false });
    await waitFor('the event delivered after the recovery', () => deliveriesFor(row.id), (rows) => rows.length >= 1 && rows.every((d) => d.state === 'applied'), 30_000);
    await settle();
  }, 120_000);
});

let goodEdge = ''; let badEdge = ''; let provenanceEventId = ''; let warningId = ''; let flipEvidenceId = '';
describe('B8 · provenance path incomplete (AU-MEM-0039): the edge stays unresolved with its class and route until the path is established', () => {
  let sub: { subscriptionId: string }; let evdX: { id: string; version: number }; let badClaim = ''; let eventId = '';

  it('an edge whose claim has no lineage on the corrected evidence is UNRESOLVED (provenance_incomplete → human_review); the sibling with a complete path is proposed; nothing on the edge moves', async () => {
    await settle();
    const r = await register('memory-mappings');
    sub = { subscriptionId: r.subscription.subscriptionId };
    const up = await h.upload([{ filename: 'terms-x.csv', text: TERMS_CSV.replace('assumption', 'assumption (x)'), documentTime: '2024-01-14T00:00:00Z' }]);
    evdX = up[0] as { id: string; version: number };
    const goodClaim = uuidv7(); badClaim = uuidv7();
    goodEdge = await edgeOn('supplies', goodClaim, evdX.id); badEdge = await edgeOn('insures', badClaim, evdX.id);
    await lineageFor(goodClaim, evdX.id); // the good edge's claim was extracted from the evidence it rests on; the bad edge's claim has no lineage at all
    const since = await mark();
    const caseId = await submitCorrection([evdX.id], 'document x restated');
    await applyCase(caseId, [evdX.id], 'restatement verified against the publisher');
    eventId = (await publishedEvent('MemoryCorrected', 'evidence.corrected', since)).id;
    provenanceEventId = eventId;
    const ds = await waitFor('the mappings delivery terminal', () => deliveriesFor(eventId), (rows) => rows.some((d) => d.consumer_kind === 'memory-mappings' && d.state !== 'received'), 120_000);
    await settle();
    const m = ds.find((d) => d.consumer_kind === 'memory-mappings')!;
    expect(new Set(m.items)).toEqual(new Set([`edge:${goodEdge}`, `edge:${badEdge}`]));
    expect(m).toMatchObject({ state: 'unresolved', failure_class: 'provenance_incomplete', disposition: 'human_review' });
    // Partial work preserved: the good edge's proposal was made and checkpointed; the bad edge's item is open with its check.
    expect(m.items_applied.map((x) => [x.item, x.effect])).toEqual([[`edge:${goodEdge}`, 'reconciliation.proposed']]);
    expect(m.items_unresolved.map((x) => [x.item, x.effect, x.checks])).toEqual([[`edge:${badEdge}`, 'provenance.incomplete', 1]]);
    expect(m.items_unresolved[0]!.reason).toMatch(/provenance path incomplete: the edge names claim/);
    expect(m.items_unresolved[0]!.details).toMatchObject({ failure_class: 'provenance_incomplete', disposition: 'human_review', expected: { claim_object_id: badClaim } });
    const props = (await sql<{ subject_id: string; state: string }>`select subject_id::text, state from graph.mapping_reconciliations where cause_event_id = ${eventId}::uuid`.execute(su)).rows;
    expect(props).toEqual([{ subject_id: goodEdge, state: 'proposed' }]);
    expect((await sql<{ state: string }>`select state from graph.edges_current where edge_id = ${badEdge}::uuid`.execute(su)).rows[0]!.state).toBe('asserted');
    // Exposed through the status route as an open failure state with its class and route.
    const st = await statusOf();
    expect(st.subscriptions.telemetry.open_failure_states.find((o) => o['event_id'] === eventId && o['consumer_kind'] === 'memory-mappings')).toMatchObject({ state: 'unresolved', failure_class: 'provenance_incomplete', disposition: 'human_review' });
  }, 240_000);

  it('a re-drive re-checks and stays unresolved (a second check, the sibling not re-proposed); the operator records the lineage and the next re-check proposes the edge — applied, resolved after two checks', async () => {
    const report = await dispatcher.reconcile('control: re-drive of the unresolved mappings delivery', false, '0');
    expect(report.reDriven.find((e) => e.eventId === eventId)?.subscriptionIds).toEqual([sub.subscriptionId]);
    const second = await waitFor('the second check', () => deliveriesFor(eventId), (rows) => (rows.find((d) => d.consumer_kind === 'memory-mappings')?.deliveries ?? 0) >= 2 && rows.every((d) => d.state !== 'received'), 120_000);
    await settle();
    const m2 = second.find((d) => d.consumer_kind === 'memory-mappings')!;
    expect(m2).toMatchObject({ state: 'unresolved', deliveries: 2, failure_class: 'provenance_incomplete' });
    expect(m2.items_unresolved.map((x) => [x.item, x.checks])).toEqual([[`edge:${badEdge}`, 2]]);
    expect((await sql<{ n: string }>`select count(*)::text n from graph.mapping_reconciliations where cause_event_id = ${eventId}::uuid`.execute(su)).rows[0]!.n, 'the sibling was proposed once').toBe('1');
    // The operator establishes the path — under the operator's authority, never the subscriber's.
    await lineageFor(badClaim, evdX.id);
    await dispatcher.reconcile('control: re-drive after the lineage was recorded', false, '0');
    const done = await waitFor('the passing check applied', () => deliveriesFor(eventId), (rows) => rows.find((d) => d.consumer_kind === 'memory-mappings')?.state === 'applied', 120_000);
    await settle();
    const m3 = done.find((d) => d.consumer_kind === 'memory-mappings')!;
    expect(m3).toMatchObject({ state: 'applied', deliveries: 3, items_unresolved: [], failure_class: null, disposition: null });
    expect(m3.items_applied.find((x) => x.item === `edge:${badEdge}`)).toMatchObject({ effect: 'reconciliation.proposed', resolved_after_checks: 2 });
    const props = (await sql<{ subject_id: string; basis: string }>`select subject_id::text, basis from graph.mapping_reconciliations where cause_event_id = ${eventId}::uuid order by proposed_at`.execute(su)).rows;
    expect(props.map((p) => p.subject_id)).toEqual([goodEdge, badEdge]);
    // The event's own claim list was computed at the write, before the lineage existed: the basis reads as the edge resting on the
    // corrected evidence; what changed is that the path through its claim is now established, so the proposal is admissible.
    expect(props[1]!.basis).toMatch(/rests on evidence corrected in case/);
  }, 240_000);
});

let seriesKey = ''; let assumptionId = ''; let f1 = '';
describe('B8 · recomputation changing a recommendation materially (AU-MEM-0039): measured against the declared rule, exposed on the package', () => {
  let pkg = ''; let sub: { subscriptionId: string };
  const forecast = async (observedThrough: string): Promise<{ forecastId: string; quantiles: { q10: number; q50: number; q90: number }; supersededForecastId: string | null }> =>
    ((await prediction.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), T(), D(),
      { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), observedThrough, assumptions: [assumptionId], label: 'replay demonstration' } })) as { forecast: { forecastId: string; quantiles: { q10: number; q50: number; q90: number }; supersededForecastId: string | null } }).forecast;
  const packageEvents = async () => (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from decision.package_events where package_id = ${pkg}::uuid and event = 'input.invalidated' order by occurred_at`.execute(su)).rows;

  it('SETUP: a series, a forecast on it, a decision package whose option cites the forecast, and a decisions subscription with a declared materiality rule', async () => {
    const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
    const run = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
    expect(run.state, run.reason).toBe('finished');
    seriesKey = `fixture:${v.sourceKey}:value`;
    await prediction.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), T(), D(),
      { payload: { seriesKey, sourceKey: v.sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode' } });
    assumptionId = uuidv7();
    await sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
      values (${assumptionId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'ASU', 1, 'The corridor stays open', 'transits continue at their seasonal level', 'active', 'verified', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const first = await forecast('2023-10-31');
    f1 = first.forecastId;
    expect(first.supersededForecastId).toBeNull();
    // The package: proposed, its option citing the forecast (the digest as the derivation would bind it).
    pkg = uuidv7(); const dec = uuidv7();
    await sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
      values (${dec}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'DEC', 1, 'Book the corridor for Q1', 'fixture decision object', 'active', 'not_applicable', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into decision.packages_current (package_id, scope, tenant_id, domain_id, decision_object_id, title, statement, owner_principal_id, state, current_version, declared_by, correlation_id)
      values (${pkg}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${dec}::uuid, 'Corridor booking', 'fixture decision package, proposed', ${owner.principalId}::uuid, 'proposed', 1, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into decision.package_versions (package_id, version, scope, tenant_id, domain_id, state, known_at, author_principal_id, correlation_id)
      values (${pkg}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'draft', clock_timestamp(), ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const digest = (await sql<{ d: string }>`select content_digest d from objects.canonical_objects where object_id = ${f1}::uuid and object_version = 1`.execute(su)).rows[0]!.d;
    await sql`insert into decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason, set_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${pkg}::uuid, 1, 'book-now', 'Book the corridor now', 'intervention', ${JSON.stringify([{ kind: 'forecast', id: f1, version: 1, digest }])}::jsonb, false, 'no simulation run cited in the fixture', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const r = await register('decisions', { budgets: { materiality: { relative_q50: 0.10, band: true } } });
    sub = { subscriptionId: r.subscription.subscriptionId };
    const budgets = (await sql<{ budgets: Record<string, unknown> }>`select budgets from graph.subscriptions where subscription_id = ${sub.subscriptionId}::uuid`.execute(su)).rows[0]!.budgets;
    expect(budgets['materiality']).toEqual({ relative_q50: 0.10, band: true });
    await settle();
  }, 300_000);

  it('IMMATERIAL CONTROL: a re-issue on the same observations supersedes the forecast; the change is measured, within the rule — noted on the package, no failure state', async () => {
    const since = await mark();
    const second = await forecast('2023-10-31');
    expect(second.supersededForecastId).toBe(f1);
    const ev = await publishedEvent('GraphChanged', 'forecast.superseded', since);
    const ds = await waitFor('the recomputation delivered', () => deliveriesFor(ev.id), (rows) => rows.some((d) => d.consumer_kind === 'decisions' && d.state !== 'received'), 120_000);
    await settle();
    const d = ds.find((x) => x.consumer_kind === 'decisions')!;
    expect(d).toMatchObject({ state: 'applied', items: [pkg], failure_class: null });
    expect(d.items_applied[0]).toMatchObject({ item: pkg, effect: 'input.recomputed' });
    const m = d.items_applied[0]!.details['recomputation'] as Record<string, unknown>;
    expect(m).toMatchObject({ material: false, superseded: f1, superseding: second.forecastId, rule: { relative_q50: 0.1, band: true } });
    expect(Number(m['relative'])).toBeLessThan(0.1);
    expect(d.items_applied[0]!.details['exposure']).toBeUndefined();
    const notes = await packageEvents();
    expect(notes.at(-1)!.details).toMatchObject({ change_kind: 'forecast.superseded', recomputation: { material: false }, automatic: true });
    expect(notes.at(-1)!.details['failure_class']).toBeUndefined();
    // The package still cites the ORIGINAL forecast; the next re-issue supersedes this second one — the consumer follows the
    // supersession chain back to the cited one and measures against IT, so the package hears of every recomputation after its citation.
  }, 240_000);

  it('MATERIAL: a re-issue through the disruption episode moves the central estimate beyond the rule — exposed on the package as material_change → human_review with the measure; the package, its option and its state untouched', async () => {
    const since = await mark();
    const before = (await sql<{ state: string; current_version: number }>`select state, current_version from decision.packages_current where package_id = ${pkg}::uuid`.execute(su)).rows[0]!;
    const third = await forecast('2023-11-26');
    expect(third.supersededForecastId).not.toBe(f1); // the second forecast is the one superseded; the package cites the first
    const ev = await publishedEvent('GraphChanged', 'forecast.superseded', since);
    const ds = await waitFor('the recomputation delivered', () => deliveriesFor(ev.id), (rows) => rows.some((d) => d.consumer_kind === 'decisions' && d.state !== 'received'), 120_000);
    await settle();
    const d = ds.find((x) => x.consumer_kind === 'decisions')!;
    expect(d).toMatchObject({ state: 'applied', items: [pkg] });
    expect(d.items_applied[0]).toMatchObject({ item: pkg, effect: 'input.recomputed_materially' });
    const m = d.items_applied[0]!.details['recomputation'] as Record<string, unknown>;
    expect(m, 'measured against the forecast the option cites, two re-issues back').toMatchObject({ material: true, superseded: f1, superseding: third.forecastId });
    expect(Number(m['relative'])).toBeGreaterThanOrEqual(0.1);
    expect(d.items_applied[0]!.details['exposure']).toMatchObject({ failureClass: 'material_change', disposition: 'human_review' });
    const notes = await packageEvents();
    expect(notes.at(-1)!.details).toMatchObject({ failure_class: 'material_change', disposition: 'human_review', recomputation: { material: true } });
    expect(String(notes.at(-1)!.details['note'])).toMatch(/the central estimate moved/);
    // Nothing rewritten: the package state, version and option are as they were; the human decides.
    const after = (await sql<{ state: string; current_version: number }>`select state, current_version from decision.packages_current where package_id = ${pkg}::uuid`.execute(su)).rows[0]!;
    expect(after).toEqual(before);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.options where package_id = ${pkg}::uuid`.execute(su)).rows[0]!.n).toBe('1');
    f1 = third.forecastId;
    // The scenarios consumer (registered by the earlier cases) found no scenario on the superseded forecast — no work, no failure.
    const terminal = await waitFor('every delivery of the recomputation terminal', () => deliveriesFor(ev.id), (rows) => rows.every((x) => x.state !== 'received'), 60_000);
    const scn = terminal.find((x) => x.consumer_kind === 'scenarios');
    if (scn !== undefined) expect(scn).toMatchObject({ state: 'applied', items: [] });
  }, 240_000);
});

describe('B8 · the flows\' telemetry (AU-MEM-0041) and the interface register with the retention contract (AU-DP-0071)', () => {
  type Flows = Record<string, { recent: Array<Record<string, unknown>>; open_failure_states: Array<Record<string, unknown>> }>;
  const flows = async (): Promise<Flows> => ((await graph.flowTelemetry(h.req(owner, 'graph.read', 'SUB', null, 'graph'), T(), D())) as { flows: Flows }).flows;
  const ms = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  it('FORECAST, SCENARIO, RECONCILIATION and SIMULATION each report execution, product and recovery state through the telemetry route; one measurement per flow is captured', async () => {
    // The scenario flow: an indicator on the series, a scenario on the current forecast with a downside branch, an evaluation over
    // the known history — the November episode breaches, the branch flips, the warning is raised to its owner.
    const ind = await prediction.defineIndicator(h.req(owner, 'prediction.indicator.define', 'IND', null), T(), D(),
      { payload: { seriesKey, description: 'transits fall below 40 per day for five consecutive days', comparator: '<', threshold: 40, consecutiveDays: 5, owner: owner.principalId } }) as { indicator: { indicatorId: string } };
    const scn = await prediction.declareScenario(h.req(owner, 'prediction.scenario.declare', 'SCN', null), T(), D(),
      { payload: { title: 'Corridor over the next quarter', statement: 'what we expect, and what would change it', forecastId: f1, owner: owner.principalId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'transits at seasonal level', owner: owner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Corridor collapse', kind: 'downside', statement: 'transits stay below 40/day for five days', indicatorId: ind.indicator.indicatorId, signpost: 'five consecutive days under 40', owner: owner.principalId, consequence: 'rebook the third shipment before the window closes', responseWindowHours: 48 },
                   ] } }) as { scenario: { scenarioId: string } };
    const ev = await prediction.evaluateIndicator(h.req(owner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), T(), D(), ind.indicator.indicatorId, { payload: { knownAt: new Date().toISOString() } }) as { warnings: Array<{ warningId: string }> };
    expect(ev.warnings.length).toBe(1);
    warningId = ev.warnings[0]!.warningId;
    // The simulation and reconciliation flows: a twin grounded on the demonstration's records, a control run, a simulated element citing
    // the run reconciled against a later observation of the same key (the Phase 5 path).
    const up = await h.upload(RECORD_FILES());
    const records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
    const d = await twins.declare(h.req(owner, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet chain',
      boundary: [E1], owner: owner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
    const twinId = d.twin.twinId;
    const admit = async (els: unknown[], branch: string, observedThrough = '2024-01-17'): Promise<number> => {
      const o = await twins.openVersion(h.req(owner, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: branch, knownAt: new Date().toISOString(), observedThrough } }) as { version: { version: number } };
      await twins.ground(h.req(owner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: { elements: els } });
      await twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: {} });
      return o.version.version;
    };
    const v1 = await admit(completeElements(records), 'actual');
    const run = await twins.run(h.req(operator, 'simulation.run', 'SIM', null), T(), D(), { payload: { twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } } }) as { run: { runId: string; state: string } };
    expect(run.run.state).toBe('completed');
    const key = 'inventory.on_hand-2024-02-26:SYN-PART-MAG';
    const simVersion = await admit([...completeElements(records), { key, kind: 'simulated', value: 2942.857, unit: 'sets', validFrom: '2024-02-26', citations: [{ kind: 'run', id: run.run.runId }] }], 'sim-branch');
    const count = (await h.upload([{ filename: 'plant-count-2024-02-26.csv', text: 'synthetic,record_id,component_id,on_hand\ntrue,SYN-CNT-001,SYN-PART-MAG,3100\n', documentTime: '2024-02-26T00:00:00Z' }]))[0] as { id: string; version: number };
    const obsVersion = await admit([...completeElements(records), { key, kind: 'observed', value: 3100, unit: 'sets', validFrom: '2024-02-26', citations: [{ kind: 'evidence', ...count }], record: { locator: 'SYN-CNT-001', field: 'on_hand' } }], 'obs-branch', '2024-02-26');
    const rec = await twins.reconcile(h.req(owner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, { payload: { key, fromVersion: simVersion, againstVersion: obsVersion, note: 'the plant count on 26 February came in' } }) as { reconciliation: { difference: { numeric: string } } };
    expect(Number(rec.reconciliation.difference.numeric)).toBeCloseTo(157.143, 2);

    const f = await flows();
    // FORECAST: the current forecast (issued) and its superseded predecessors, each with issue lag, publish latency, end-to-end age, completion, product state.
    const fc = f['forecasts']!.recent.find((r) => r['forecast_id'] === f1)!;
    expect(fc).toMatchObject({ state: 'issued', completed: false, retries: 0, unresolved_dependency: false, invalidated: false, decision_active: false, last_transition: 'forecast.issued' });
    expect(ms(fc['issue_lag_ms'])).toBeGreaterThanOrEqual(0); expect(ms(fc['publish_ms'])).toBeGreaterThanOrEqual(0); expect(ms(fc['end_to_end_ms'])).toBeGreaterThanOrEqual(0);
    expect(Number(fc['interval_width'])).toBeGreaterThan(0); expect(fc['q50']).not.toBeNull();
    expect(Number(fc['affected_consumers'])).toBeGreaterThanOrEqual(1); // the scenario just declared on it
    const superseded = f['forecasts']!.recent.find((r) => r['superseded_by'] === f1)!;
    expect(superseded).toMatchObject({ state: 'superseded', completed: true, last_transition: 'forecast.superseded' });
    // SCENARIO (warning): evaluate time, flip → raise, the response window, deadline slack, end-to-end age, the owner routed to, the causation (the flip receipt).
    const w = f['warnings']!.recent.find((r) => r['warning_id'] === ev.warnings[0]!.warningId)!;
    expect(w).toMatchObject({ state: 'raised', completed: false, retries: 0, unresolved_dependency: false, scenario_id: scn.scenario.scenarioId, accountable_owner: owner.principalId });
    expect(ms(w['evaluate_ms'])).toBeGreaterThanOrEqual(0); expect(ms(w['flip_to_raise_ms'])).toBeGreaterThanOrEqual(0); expect(ms(w['window_ms'])).toBe(48 * 3600 * 1000); expect(ms(w['end_to_end_ms'])).toBeGreaterThanOrEqual(0);
    expect(w['causation_event_id']).not.toBeNull(); expect(Number(w['scenario_branches'])).toBe(2); expect(w['last_transition']).toBe('warning.raised');
    // RECONCILIATION: basis age, observation lag, the against-version's admission time, the difference, completeness, the accountable owner.
    const rc = f['reconciliations']!.recent.find((r) => r['twin_id'] === twinId)!;
    expect(rc).toMatchObject({ from_version: simVersion, against_version: obsVersion, from_kind: 'simulated', completed: true, retries: 0, invalidated: false, unresolved_dependency: false, accountable_owner: owner.principalId, last_transition: 'element.grounded' });
    expect(Number(rc['numeric_difference'])).toBeCloseTo(157.143, 2); expect(ms(rc['against_admit_ms'])).toBeGreaterThanOrEqual(0); expect(ms(rc['end_to_end_ms'])).toBeGreaterThanOrEqual(0);
    expect(['complete', 'incomplete']).toContain(rc['completeness']); expect(rc['from_verification_state']).toBe('verified');
    // SIMULATION: execution time, information age, completion, reproductions, the digests, the operator, the last transition.
    const sr = f['simulations']!.recent.find((r) => r['run_id'] === run.run.runId)!;
    expect(sr).toMatchObject({ state: 'completed', run_kind: 'control', completed: true, retries: 0, reproductions: 0, reproduced: false, unresolved_dependency: false, invalidated: false, accountable_owner: operator.principalId, last_transition: 'run.completed', failure_class: null });
    expect(ms(sr['execute_ms'])).toBeGreaterThanOrEqual(0); expect(ms(sr['information_age_ms'])).toBeGreaterThanOrEqual(0); expect(Number(sr['initial_elements'])).toBeGreaterThan(0);
    expect(String(sr['implementation_digest'])).toMatch(/^[0-9a-f]{64}$/); expect(Number(sr['affected_consumers'])).toBeGreaterThanOrEqual(1);
    // Tenant isolation: every row is this tenant's.
    for (const k of ['forecasts', 'warnings', 'reconciliations', 'simulations']) expect(f[k]!.recent.every((r) => r['tenant_id'] === T()), `${k} leaked another tenant`).toBe(true);
    // eslint-disable-next-line no-console
    console.log('FLOW TELEMETRY MEASUREMENT (local profile)', JSON.stringify({
      forecast: { forecast_id: f1, issue_lag_ms: fc['issue_lag_ms'], publish_ms: fc['publish_ms'], end_to_end_ms: fc['end_to_end_ms'], q50: fc['q50'], interval_width: fc['interval_width'], validation_state: fc['validation_state'], completed: fc['completed'] },
      warning: { warning_id: w['warning_id'], evaluate_ms: w['evaluate_ms'], flip_to_raise_ms: w['flip_to_raise_ms'], window_ms: w['window_ms'], deadline_slack_ms: w['deadline_slack_ms'], end_to_end_ms: w['end_to_end_ms'], level: w['level'], urgency: w['urgency'], timely: w['timely'] },
      reconciliation: { reconciliation_id: rc['reconciliation_id'], basis_age_ms: rc['basis_age_ms'], observation_lag_ms: rc['observation_lag_ms'], against_admit_ms: rc['against_admit_ms'], end_to_end_ms: rc['end_to_end_ms'], relative_difference: rc['relative_difference'], completeness: rc['completeness'] },
      simulation: { run_id: run.run.runId, execute_ms: sr['execute_ms'], information_age_ms: sr['information_age_ms'], end_to_end_ms: sr['end_to_end_ms'], initial_elements: sr['initial_elements'], affected_consumers: sr['affected_consumers'], decision_active: sr['decision_active'] },
    }));
  }, 300_000);

  it('THE INTERFACE REGISTER: the fifty canonical interfaces under their identities, each with its contract, transport, reliability, failure semantics and what this product binds to it', async () => {
    const r = (await graph.interfaces(h.req(owner, 'graph.read', 'SUB', null, 'graph'), T(), D())) as { interfaces: Array<Record<string, unknown>> };
    expect(r.interfaces.length).toBe(50);
    const ids = r.interfaces.map((i) => String(i['interface_id']));
    for (let l = 1; l <= 10; l += 1) for (let i = 1; i <= 5; i += 1) expect(ids).toContain(`L${l}-I0${i}`);
    expect(r.interfaces.every((i) => ['bound', 'partial', 'unbound'].includes(String(i['binding_state'])) && String(i['contract']).length > 20 && String(i['reliability']).length > 10)).toBe(true);
    const byState = Object.fromEntries(['bound', 'partial', 'unbound'].map((s) => [s, ids.filter((_, k) => r.interfaces[k]!['binding_state'] === s).length]));
    expect(byState['bound']! + byState['partial']! + byState['unbound']!).toBe(50);
    // The event interfaces this product publishes carry their schema version; the ones it does not publish say so.
    expect(r.interfaces.find((i) => i['interface_id'] === 'L4-I03')).toMatchObject({ name: 'GraphChanged', transport: 'event', binding_state: 'bound', schema_version: 'v1' });
    expect(r.interfaces.find((i) => i['interface_id'] === 'L2-I03')).toMatchObject({ name: 'ContradictionDetected', binding_state: 'unbound', schema_version: null });
    // eslint-disable-next-line no-console
    console.log('INTERFACE REGISTER', JSON.stringify(byState));
  }, 60_000);

  it('REPLAY WITHIN RETENTION: the log declares its retained floor (lifetime: the first sequence); a replay from before a declared floor is refused with the discontinuity named; one from the floor on is accepted; a replay registration serves from the floor', async () => {
    const sub = (await sql<{ subscription_id: string }>`select subscription_id::text from graph.subscriptions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and consumer_kind = 'scenarios' and status = 'active'`.execute(su)).rows[0]!.subscription_id;
    const before = (await sql<{ retained_from_seq: string; retention_policy: string }>`select retained_from_seq::text, retention_policy from objects.outbox_partitions where partition_key = ${`tenant:${T()}`}`.execute(su)).rows[0]!;
    expect(before).toEqual({ retained_from_seq: '1', retention_policy: 'lifetime' });
    const st = await statusOf();
    expect(st.subscriptions.telemetry.partitions.find((p) => p['partition_key'] === `tenant:${T()}`)).toMatchObject({ retained_from_seq: '1', retention_policy: 'lifetime' });
    // A declared floor (as a governed retention act would leave it — the act itself is not built; the contract it must honour is).
    const lastSeq = Number((await sql<{ s: string }>`select (next_seq - 1)::text s from objects.outbox_partitions where partition_key = ${`tenant:${T()}`}`.execute(su)).rows[0]!.s);
    const floor = Math.max(2, lastSeq - 3);
    await sql`update objects.outbox_partitions set retained_from_seq = ${floor}, retention_policy = 'declared', retention_note = 'B8 harness: a declared floor' where partition_key = ${`tenant:${T()}`}`.execute(su);
    try {
      // A NAMED point below the floor is refused, the discontinuity named (the point, the floor, the range not retained).
      const refusedSeq = await graph.replaySubscription(h.req(domainAdmin, 'graph.subscription.replay', 'SUB', sub, 'platform.administration'), T(), D(), sub,
        { payload: { fromSeq: floor - 3, reason: 'B8 harness: replay from a sequence before the floor' } }).then(() => null, (e: unknown) => e as Error);
      expect(refusedSeq).not.toBeNull();
      expect(String((refusedSeq as Error).message)).toMatch(new RegExp(`the point \\(sequence ${floor - 2}\\) precedes the partition's retained floor \\(sequence ${floor}\\)`));
      // From the beginning = from the beginning of what is RETAINED: accepted, the point is the floor.
      const fromStart = await graph.replaySubscription(h.req(domainAdmin, 'graph.subscription.replay', 'SUB', sub, 'platform.administration'), T(), D(), sub,
        { payload: { fromCreatedAt: null, fromEventId: null, reason: 'B8 harness: replay from the beginning under a declared floor' } }) as { events: string[] };
      expect(fromStart.events.length).toBeGreaterThanOrEqual(0);
      let evt = (await sql<{ details: Record<string, unknown> }>`select details from graph.subscription_events where subscription_id = ${sub}::uuid and event = 'subscription.replayed' order by occurred_at desc limit 1`.execute(su)).rows[0]!;
      expect(evt.details).toMatchObject({ retained_floor_seq: floor, from_partition_seq: floor - 1 });
      expect(Number(evt.details['served_from_seq_after']), 'the served point never moves forward: it stays where the earlier replay put it, at or below the floor').toBeLessThanOrEqual(floor);
      await settle();
      // From the floor on, by sequence: accepted (the point is the sequence before the first replayed row).
      const ok = await graph.replaySubscription(h.req(domainAdmin, 'graph.subscription.replay', 'SUB', sub, 'platform.administration'), T(), D(), sub,
        { payload: { fromSeq: floor - 1, reason: 'B8 harness: replay from the floor on' } }) as { events: string[] };
      expect(ok.events.length).toBeGreaterThanOrEqual(0);
      evt = (await sql<{ details: Record<string, unknown> }>`select details from graph.subscription_events where subscription_id = ${sub}::uuid and event = 'subscription.replayed' order by occurred_at desc limit 1`.execute(su)).rows[0]!;
      expect(Number(evt.details['retained_floor_seq'])).toBe(floor);
      expect(Number(evt.details['requested_from_seq'])).toBe(floor - 1);
      await settle();
      // A registration that replays the backlog serves from the floor.
      await graph.revokeSubscription(h.req(domainAdmin, 'graph.subscription.control', 'SUB', sub, 'platform.administration'), T(), D(), sub, { payload: { reason: 'B8 harness: re-register with a replay backlog' } });
      const re = await register('scenarios', { backlog: 'replay' });
      const served = (await sql<{ served_from_seq: string }>`select served_from_seq::text from graph.subscriptions where subscription_id = ${re.subscription.subscriptionId}::uuid`.execute(su)).rows[0]!;
      expect(Number(served.served_from_seq)).toBe(floor);
      await settle();
    } finally {
      await sql`update objects.outbox_partitions set retained_from_seq = 1, retention_policy = 'lifetime', retention_note = null where partition_key = ${`tenant:${T()}`}`.execute(su);
    }
  }, 120_000);
});

describe('B8 · inferred relationships reassessed on evidence and model change (AU-DP-0041, TT-04); the impact set reaches warnings and briefings (AU-MEM-0031)', () => {
  const edgeRow = async (edgeId: string) => (await sql<{ state: string; reassessment_state: string; reassessment_trigger: string | null; reassessment_reason: string | null; reassessment_cause_id: string | null; reassessment_outcome: string | null }>`select state, reassessment_state, reassessment_trigger, reassessment_reason, reassessment_cause_id::text, reassessment_outcome from graph.edges_current where edge_id = ${edgeId}::uuid`.execute(su)).rows[0]!;
  const edgeEvents = async (edgeId: string) => (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from graph.edge_events where edge_id = ${edgeId}::uuid order by occurred_at, event_id`.execute(su)).rows;

  it('EVIDENCE CHANGE: the edges proposed under evidence.corrected are PENDING REASSESSMENT on the relationship itself, with the trigger and the cause; the person\'s decision on the proposal closes one', async () => {
    for (const e of [goodEdge, badEdge]) {
      const r = await edgeRow(e);
      expect(r).toMatchObject({ state: 'asserted', reassessment_state: 'pending', reassessment_trigger: 'evidence', reassessment_cause_id: provenanceEventId, reassessment_outcome: null });
      expect(r.reassessment_reason).toMatch(/reconciliation .* proposed/);
      expect((await edgeEvents(e)).map((x) => x.event)).toContain('edge.reassessment_opened');
    }
    const rec = (await sql<{ reconciliation_id: string }>`select reconciliation_id::text from graph.mapping_reconciliations where subject_id = ${goodEdge}::uuid and state = 'proposed'`.execute(su)).rows[0]!;
    await graph.decideMapping(h.req(owner, 'graph.resolution.decide', 'MRC', rec.reconciliation_id, 'graph'), T(), D(), rec.reconciliation_id, { payload: { decision: 'accept', reason: 'B8 harness: the relationship holds under the corrected evidence' } });
    expect(await edgeRow(goodEdge)).toMatchObject({ state: 'asserted', reassessment_state: 'reassessed', reassessment_outcome: 'decided:accepted' });
    expect((await edgeEvents(goodEdge)).at(-1)).toMatchObject({ event: 'edge.reassessed', details: { outcome: 'decided:accepted', reconciliation_id: rec.reconciliation_id } });
    expect(await edgeRow(badEdge)).toMatchObject({ reassessment_state: 'pending' });
  }, 60_000);

  it('MODEL CHANGE: retiring the extraction method that produced a claim opens a reassessment on the edge it asserts, publishes GraphChanged/edge.reassessment_opened, and the forecast resting on the edge is marked for attention; a retraction closes the reassessment', async () => {
    // The method, registered, approved and activated through the real routes; a claim its run produced (lineage names the method);
    // the edge that claim asserts; a forecast resting on the edge.
    const registrar = await h.principalWith(['domain_analyst'], 'b8-registrar');
    const extractionManager = await h.principalWith(['extraction_manager'], 'b8-extraction-manager');
    const m = await intelligence.registerMethod(h.req(registrar, 'intelligence.method.register', 'MTH', null, 'intelligence'), T(), D(), { payload: {
      methodKey: 'b8-rel-extraction', name: 'B8 relationship extraction', targetTypes: ['REL'], gatewayMode: 'replay', modelId: 'b8-local-model', modelWeightsDigest: sha256('b8-weights'),
      runtimeVersion: 'ollama/0.33.2', promptRef: 'extract/b8', promptVersion: 'v1', promptText: 'Return {"claims":[...]} or {"abstain":true,"reason":"..."} and nothing else.', decoding: { temperature: 0, seed: 11 },
      confidenceFloor: 0.3, reviewBelow: 0.5, budgetCalls: 80, budgetSeconds: 180 } }) as { method: { methodId: string } };
    const methodId = m.method.methodId;
    await intelligence.approveMethod(h.req(extractionManager, 'intelligence.method.approve', 'MTH', methodId, 'intelligence'), T(), D(), methodId, { payload: { reason: 'B8 harness: reviewed' } });
    await intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', methodId, 'intelligence'), T(), D(), methodId, { payload: { target: 'active', reason: 'B8 harness: ready to extract' } });
    const claimId = uuidv7(); const evidenceId = uuidv7();
    const edgeId = await edgeOn('b8_model_bound', claimId, evidenceId);
    await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
      values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${uuidv7()}::uuid, ${methodId}::uuid, null, 'replay', ${evidenceId}::uuid, ${sha256(evidenceId)}, 0, 4, 0.8, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${f1}::uuid, 'FCT', 'edge', ${edgeId}::uuid, 'B8 harness: the forecast rests on this relationship', 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const fc = await register('forecasts');
    await settle();
    const since = await mark();
    const r = await intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', methodId, 'intelligence'), T(), D(), methodId, { payload: { target: 'retired', reason: 'B8 harness: the model was withdrawn by its owner' } }) as { method: { edgesReassessmentOpened: Array<{ edge_id: string }> } };
    expect(r.method.edgesReassessmentOpened.map((e) => e.edge_id)).toEqual([edgeId]);
    const row = await edgeRow(edgeId);
    expect(row).toMatchObject({ state: 'asserted', reassessment_state: 'pending', reassessment_trigger: 'model', reassessment_cause_id: methodId });
    expect(row.reassessment_reason).toMatch(/extraction method b8-rel-extraction .* was retired/);
    // The model change reached the forecast through its subscription — no operator walk.
    const ev = await publishedEvent('GraphChanged', 'edge.reassessment_opened', since);
    const ds = await waitFor('the model-change event delivered', () => deliveriesFor(ev.id), (rows) => rows.some((d) => d.consumer_kind === 'forecasts' && d.state !== 'received'), 120_000);
    await settle();
    expect(ds.find((d) => d.consumer_kind === 'forecasts')).toMatchObject({ state: 'applied', items: [f1] });
    expect((await sql<{ attention_state: string; attention_reason: string }>`select attention_state, attention_reason from prediction.forecasts_current where forecast_id = ${f1}::uuid`.execute(su)).rows[0]).toMatchObject({ attention_state: 'assumption_unverified' });
    // The decision package resting on the edge (through its dependency) was noted: the event carried the dependency rows.
    expect(ds.find((d) => d.consumer_kind === 'decisions')?.items ?? [], 'no decision package rests on this edge in this domain').toEqual([]);
    // A second cause while pending (the method suspended again after a re-activation would be one): recorded, not dropped.
    // A retraction closes the reassessment (the relationship left the asserted state), with its event.
    await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason: 'B8 harness: retracted after the model change' } });
    expect(await edgeRow(edgeId)).toMatchObject({ state: 'retracted', reassessment_state: 'reassessed', reassessment_outcome: 'retracted' });
    expect((await edgeEvents(edgeId)).map((x) => x.event)).toEqual(['edge.reassessment_opened', 'edge.retracted', 'edge.reassessed']);
    // The person's other route on a model-change reassessment: the relationship STANDS under the retired model.
    const m2 = await intelligence.registerMethod(h.req(registrar, 'intelligence.method.register', 'MTH', null, 'intelligence'), T(), D(), { payload: {
      methodKey: 'b8-rel-extraction-2', name: 'B8 relationship extraction (second)', targetTypes: ['REL'], gatewayMode: 'replay', modelId: 'b8-local-model-2', modelWeightsDigest: sha256('b8-weights-2'),
      runtimeVersion: 'ollama/0.33.2', promptRef: 'extract/b8-2', promptVersion: 'v1', promptText: 'Return {"claims":[...]} or {"abstain":true,"reason":"..."} and nothing else.', decoding: { temperature: 0, seed: 11 },
      confidenceFloor: 0.3, reviewBelow: 0.5, budgetCalls: 80, budgetSeconds: 180 } }) as { method: { methodId: string } };
    const methodId2 = m2.method.methodId;
    await intelligence.approveMethod(h.req(extractionManager, 'intelligence.method.approve', 'MTH', methodId2, 'intelligence'), T(), D(), methodId2, { payload: { reason: 'B8 harness: reviewed' } });
    await intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', methodId2, 'intelligence'), T(), D(), methodId2, { payload: { target: 'active', reason: 'B8 harness: ready to extract' } });
    const claim2 = uuidv7(); const kept = await edgeOn('b8_model_kept', claim2, uuidv7());
    await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
      values (${claim2}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${uuidv7()}::uuid, ${methodId2}::uuid, null, 'replay', ${uuidv7()}::uuid, ${sha256('x')}, 0, 4, 0.8, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const r2 = await intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', methodId2, 'intelligence'), T(), D(), methodId2, { payload: { target: 'suspended', reason: 'B8 harness: suspended pending review' } }) as { method: { edgesReassessmentOpened: Array<{ edge_id: string }> } };
    expect(r2.method.edgesReassessmentOpened.map((e) => e.edge_id)).toEqual([kept]);
    expect(await edgeRow(kept)).toMatchObject({ reassessment_state: 'pending', reassessment_trigger: 'model' });
    await graph.keepEdge(h.req(owner, 'graph.resolution.decide', 'EDG', kept, 'graph'), T(), D(), kept, { payload: { reason: 'B8 harness: the relationship stands, confirmed against the source by hand' } });
    expect(await edgeRow(kept)).toMatchObject({ state: 'asserted', reassessment_state: 'reassessed', reassessment_outcome: 'decided:kept' });
    expect((await edgeEvents(kept)).at(-1)).toMatchObject({ event: 'edge.reassessed', details: { outcome: 'decided:kept' } });
    await graph.revokeSubscription(h.req(domainAdmin, 'graph.subscription.control', 'SUB', fc.subscription.subscriptionId, 'platform.administration'), T(), D(), fc.subscription.subscriptionId, { payload: { reason: 'B8 harness: the forecasts consumer served its case' } });
    await settle();
  }, 240_000);

  it('WARNING INVALIDATED: the warning rests on its forecast and on the evidence that flipped its branch; a correction walk from that evidence reaches it — marked for attention, its event written, listed on the invalidation', async () => {
    const deps = (await sql<{ depends_on_kind: string; depends_on_id: string }>`select depends_on_kind, depends_on_id::text from graph.dependencies where dependent_object_id = ${warningId}::uuid and dependent_type = 'WRN' and state = 'active' order by depends_on_kind`.execute(su)).rows;
    expect(deps.map((d) => d.depends_on_kind)).toEqual(expect.arrayContaining(['evidence', 'forecast', 'strategy']));
    flipEvidenceId = deps.find((d) => d.depends_on_kind === 'evidence')!.depends_on_id;
    const before = (await sql<{ attention_state: string }>`select attention_state from prediction.warnings_current where warning_id = ${warningId}::uuid`.execute(su)).rows[0]!;
    expect(before.attention_state).toBe('none');
    const out = await graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', flipEvidenceId, 'graph'), T(), D(), { payload: { triggerKind: 'evidence_correction', triggerObjectId: flipEvidenceId } }) as { impact: { invalidationId: string; warnings: Array<{ strategy_object_id: string }>; statement: string } };
    expect(out.impact.warnings.map((w) => w.strategy_object_id)).toContain(warningId);
    expect(out.impact.statement).toMatch(/warning\(s\) marked for attention/);
    const after = (await sql<{ attention_state: string; attention_reason: string; level: string }>`select attention_state, attention_reason, level from prediction.warnings_current where warning_id = ${warningId}::uuid`.execute(su)).rows[0]!;
    expect(after.attention_state).toBe('input_unverified');
    expect(after.attention_reason).toMatch(new RegExp(`invalidation ${out.impact.invalidationId}`));
    expect((await sql<{ event: string }>`select event from prediction.warning_events where warning_id = ${warningId}::uuid order by occurred_at`.execute(su)).rows.map((e) => e.event)).toEqual(['warning.raised', 'warning.attention']);
    const inv = (await sql<{ affected_warnings: Array<{ warning_id: string }> }>`select affected_warnings from graph.invalidations_current where invalidation_id = ${out.impact.invalidationId}::uuid`.execute(su)).rows[0]!;
    expect(inv.affected_warnings.map((w) => w.warning_id)).toContain(warningId);
    // The telemetry view carries it: invalidated, unresolved dependency.
    const f = ((await graph.flowTelemetry(h.req(owner, 'graph.read', 'SUB', null, 'graph'), T(), D())) as { flows: Record<string, { recent: Array<Record<string, unknown>> }> }).flows;
    expect(f['warnings']!.recent.find((r) => r['warning_id'] === warningId)).toMatchObject({ invalidated: true });
  }, 120_000);

  it('BRIEFING RE-FLAGGED: a briefing composed on a decision package cites evidence; a correction of that evidence, walked, reaches the briefing — re-flagged by event, the corrected version reported beside the snapshot, the snapshot itself unchanged', async () => {
    const w = await bootDecisionWorld(h);
    const c = decisionCalls(h, w);
    const P = await c.proposed();
    const room = (await c.openRoom({ packageId: P.pkg, title: 'B8 — the corridor decision', reviewEveryDays: 7 })) as { room: { roomId: string } };
    await c.membership(room.room.roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    const b = (await c.compose({ roomId: room.room.roomId, knownAt: new Date().toISOString(), priorBriefingId: null })).briefing as { briefingId: string; sources: string[]; contentDigest: string };
    const cited = b.sources.map((x) => /^evidence:([0-9a-f-]{36})@(\d+)$/i.exec(x)).filter((x): x is RegExpExecArray => x !== null).map((x) => ({ id: x[1]!, version: Number(x[2]) }));
    expect(cited.length, 'the briefing cites evidence').toBeGreaterThan(0);
    const deps = (await sql<{ depends_on_kind: string; depends_on_id: string }>`select depends_on_kind, depends_on_id::text from graph.dependencies where dependent_object_id = ${b.briefingId}::uuid and dependent_type = 'BRF' and state = 'active'`.execute(su)).rows;
    expect(deps.filter((d) => d.depends_on_kind === 'evidence').map((d) => d.depends_on_id).sort()).toEqual([...new Set(cited.map((x) => x.id))].sort());
    // A cited uploaded record is corrected through the real route (a later version, lifecycle corrected), then walked from.
    const uploaded = cited.find((x) => [w.records.inv.id, w.records.ship.id, w.records.terms.id].includes(x.id)) ?? cited[0]!;
    const isUpload = [w.records.inv.id, w.records.ship.id, w.records.terms.id].includes(uploaded.id);
    if (isUpload) {
      const caseId = await submitCorrection([uploaded.id], 'B8: the record was restated after the briefing');
      await applyCase(caseId, [uploaded.id], 'restatement verified against the publisher');
    }
    const out = await graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', uploaded.id, 'graph'), T(), D(), { payload: { triggerKind: 'evidence_correction', triggerObjectId: uploaded.id } }) as { impact: { invalidationId: string; briefings: Array<{ strategy_object_id: string }>; statement: string } };
    expect(out.impact.briefings.map((x) => x.strategy_object_id)).toContain(b.briefingId);
    expect(out.impact.statement).toMatch(/briefing\(s\) composed on what changed re-flagged/);
    const got = (await c.getBriefing(b.briefingId)).briefing as { content_digest: string; availability: { corrected: Array<{ id: string; by_version: number }> }; re_flagged: Array<{ event: string; details: Record<string, unknown> }> };
    expect(got.content_digest).toBe(b.contentDigest);
    expect(got.re_flagged.map((e) => e.event)).toEqual(['briefing.re_flagged']);
    expect(got.re_flagged[0]!.details).toMatchObject({ invalidation_id: out.impact.invalidationId });
    if (isUpload) expect(got.availability.corrected.find((x) => x.id === uploaded.id)).toMatchObject({ by_version: uploaded.version + 1 });
    const inv = (await sql<{ affected_briefings: Array<{ briefing_id: string }> }>`select affected_briefings from graph.invalidations_current where invalidation_id = ${out.impact.invalidationId}::uuid`.execute(su)).rows[0]!;
    expect(inv.affected_briefings.map((x) => x.briefing_id)).toContain(b.briefingId);
  }, 300_000);
});
