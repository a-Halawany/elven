/**
 * REPRODUCTION of Codex's two B7 event-delivery findings at the database/queue boundary (CP-6 B8), on the real
 * outbox publisher, the real dispatcher, a real database and real Redis:
 *
 *   B7-F1 — ORDERING ACROSS FAILED BATCHES. 51 rows in partition A and one in partition B; a single transient
 *     queue fault on A:1. Before 0065 the first tick leased A:1–49 and B:1, A:1 failed and halted its later rows
 *     for THAT tick only; the next tick leased the unleased A:50 and A:51 and published them while A:1 was still
 *     pending under its live lease — the successful publication order was B:1, A:50, A:51, then A:1… once the lease
 *     lapsed; and every halted row had consumed an attempt it was never given. The correction (0065 + the publisher):
 *     a partition's rows are leasable only up to its first row still held by a live lease — across ticks, across
 *     lease recovery and across publisher processes (the lease serialises on an advisory lock) — the halted tail is
 *     released at the end of the tick with its attempt refunded, and an independent partition keeps progressing.
 *   B7-F2 — REPLAY OF INITIALLY SKIPPED HISTORY. A subscription registered to LEAVE its backlog (served_from_seq =
 *     the partition's next sequence at registration) later receives an explicit replay from the beginning. Before
 *     0065 the replay returned the whole history and moved the cursor back, but the served point stayed where it was
 *     and the reconciliation, bounded by it, re-drove only what the subscription had already received — the skipped
 *     history stayed excluded. The correction: a replay durably moves the served point to the replayed point (the
 *     subscription now serves from there — after a restart too), so the reconciliation's re-drive, scoped to that
 *     subscription alone, delivers the rows it never received.
 *
 * The file runs unchanged before and after the correction: `evidence/cp6/repro-event-delivery-before.txt` (the
 * hook head, database at 0064) shows the assertions describing the correct behaviour failing; `…-after.txt` shows
 * them passing at the B8 head on a fresh database at 0065.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { EYE_CONFIG } from '../../src/config/config.module.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { OutboxPublisher } from '../../src/objects/outbox.publisher.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import { Phase4Harness } from './phase4-helpers.js';
import { commitDb, identityDb, superDb, seedTenant, seedDomain, createPrincipalWithSession, withCtx, closeOperation, type AnyDb, type TestPrincipal } from './helpers.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// A short lease so lease recovery is exercised within the test, not after 60 s (the product's default; 0015).
process.env['EYE_OUTBOX_LEASE_SECONDS'] = '5';

let h: Phase4Harness; let graph: GraphController; let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService; let publisher: OutboxPublisher;
let commit: AnyDb; let identity: AnyDb; let su: AnyDb;
let owner: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal;
const E1 = uuidv7(); const E2 = uuidv7();
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

type OutboxRow = { id: string; status: string; attempts: number; lease_id: string | null; leased_until: Date | null; published_at: Date | null; partition_key: string; partition_seq: string };
const rowsOf = async (ids: string[]): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, attempts, lease_id::text, leased_until, published_at, partition_key, partition_seq::text from objects.object_outbox o where o.id = any(${ids}::uuid[]) order by o.partition_key, o.partition_seq`.execute(su)).rows;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms; let last: X | undefined;
  for (;;) {
    last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  graph = h.app.get(G); scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService); publisher = h.app.get(OutboxPublisher);
  commit = commitDb(); identity = identityDb(); su = superDb();
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'forecast_owner', 'resolution_manager', 'decision_owner'], 'repro-owner');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'repro-tenant-admin', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'repro-domain-admin');
  for (const [id, type, name] of [[E1, 'place', 'Bab el-Mandeb Strait'], [E2, 'organization', 'NORDWERK Magnet GmbH']] as const) {
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  }
}, 300_000);

afterAll(async () => {
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
  await Promise.all([commit, identity, su].map((d) => d.destroy()));
}, 120_000);

describe('B7-F1 · a failed publish cannot be overtaken by later rows of its partition — across ticks, lease recovery and processes', () => {
  let tenantA = ''; let domainA = ''; let tenantB = ''; let aIds: string[] = []; let bId = '';

  it('REPRODUCTION → CORRECTION: 51 rows in A, one in B, a transient fault on A:1 — B:1 proceeds; A:50 and A:51 wait behind A:1; the lease lapses and A publishes in sequence, each row tried once', async () => {
    tenantA = await seedTenant(su, 'b8-order-a'); domainA = await seedDomain(su, tenantA, 'b8-order-a');
    tenantB = await seedTenant(su, 'b8-order-b'); const domainB = await seedDomain(su, tenantB, 'b8-order-b');
    const adminA: TestPrincipal = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenantA, domainId: domainA, roleCode: 'domain_admin', label: 'b8-a' });
    const adminB: TestPrincipal = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenantB, domainId: domainB, roleCode: 'domain_admin', label: 'b8-b' });
    // The outbox quiet first, so the batch has the shape Codex reproduced: the first tick's 50 are A:1–49 and B:1.
    await waitFor('the outbox quiet', () => sql<{ n: string }>`select count(*)::text n from objects.object_outbox where status = 'pending'`.execute(su).then((r) => r.rows[0]!.n), (n) => n === '0', 30_000);
    aIds = Array.from({ length: 51 }, () => uuidv7());
    bId = uuidv7();
    // The fault is armed BEFORE the rows exist: the first publish of A:1 fails at the queue as a transient fault would.
    publisher.armPublishFaultForTests(aIds[0]!, 1);
    await withCtx(commit, adminA, 'DOMAIN', tenantA, domainA, async (tx, cap) => {
      for (const id of aIds) {
        await sql`select objects.enqueue_event(${id}::uuid, 'b8.order', '{"schema_version":"v1"}'::jsonb, ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      }
      await closeOperation(tx, cap, { type: 'outbox', id: aIds[0]! });
    }, { action: 'objects.create' });
    await withCtx(commit, adminB, 'DOMAIN', tenantB, domainB, async (tx, cap) => {
      await sql`select objects.enqueue_event(${bId}::uuid, 'b8.order', '{"schema_version":"v1"}'::jsonb, ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      await closeOperation(tx, cap, { type: 'outbox', id: bId });
    }, { action: 'objects.create' });
    const all = [...aIds, bId];
    const before = await rowsOf(all);
    const aSeqs = before.filter((r) => r.partition_key === `tenant:${tenantA}`).map((r) => Number(r.partition_seq));
    expect(aSeqs, 'A holds 51 contiguous sequences').toEqual(aSeqs.map((_, i) => aSeqs[0]! + i));
    const label = (r: OutboxRow) => `A:${Number(r.partition_seq) - aSeqs[0]! + 1}`;

    // The first tick: B:1 published (an independent partition progresses); A:1 failed and stays pending under its live lease.
    const b1 = await waitFor('B:1 published', () => rowsOf([bId]), (rows) => rows[0]?.status === 'published', 15_000);
    expect(b1[0]!.status).toBe('published');
    const a1 = (await rowsOf([aIds[0]!]))[0]!;
    expect(a1.status, 'A:1 must still be pending after the transient fault').toBe('pending');
    expect(a1.lease_id, 'A:1 keeps its lease until it lapses (the retry backoff)').not.toBeNull();

    // THE FINDING: while A:1 is pending, NO later row of A may be published — for as long as the lease is live, so across the next ticks.
    await sleep(2_500);
    const overtook = (await rowsOf(aIds)).filter((r) => r.status === 'published');
    expect.soft(overtook.map(label), 'later rows of A were published while A:1 was still pending').toEqual([]);
    expect.soft((await rowsOf([aIds[0]!]))[0]!.status, 'A:1 still pending after the observation window').toBe('pending');

    // Lease recovery: the lease lapses (5 s here), A:1 is retried and A publishes in sequence.
    const done = await waitFor('every row published', () => rowsOf(all), (rows) => rows.every((r) => r.status === 'published'), 60_000);
    const aRows = done.filter((r) => r.partition_key === `tenant:${tenantA}`);
    const outOfOrder = aRows.filter((r, i) => i > 0 && r.published_at!.getTime() < aRows[i - 1]!.published_at!.getTime()).map(label);
    expect.soft(outOfOrder, 'rows of A published before their predecessor').toEqual([]);
    const beforeA1 = aRows.slice(1).filter((r) => r.published_at!.getTime() < aRows[0]!.published_at!.getTime()).map(label);
    expect.soft(beforeA1, 'rows of A published before A:1').toEqual([]);
    // Durable, recoverable failure handling: A:1's failed attempt counted; every other row of A was tried exactly once —
    // a halted row never consumes the attempt it was not given (before 0065, A:2–49 were leased twice).
    expect.soft(aRows[0]!.attempts, 'A:1: one failed attempt and one successful').toBe(2);
    expect.soft(aRows.slice(1).filter((r) => r.attempts !== 1).map((r) => `${label(r)}×${r.attempts}`), 'halted rows that consumed an attempt they were never tried on').toEqual([]);
    // And on the queue itself (the durable transport): A's jobs sit in sequence order on domain-events.
    const cfg = h.app.get(EYE_CONFIG);
    const q = new Queue('domain-events', { connection: { host: cfg['eye.redis.host'], port: cfg['eye.redis.port'], password: cfg['eye.redis.password'] } });
    try {
      const waiting = await q.getWaiting(0, -1);
      const pos = new Map(waiting.map((j, i) => [String(j.id), i]));
      const positions = aRows.map((r) => pos.get(r.id) ?? -1);
      expect(positions.every((p) => p >= 0), 'every A row is on the queue').toBe(true);
      const ordered = positions.every((p, i) => i === 0 || p > positions[i - 1]!);
      const reversed = positions.every((p, i) => i === 0 || p < positions[i - 1]!);
      expect(ordered || reversed, `A's jobs are not in sequence order on the queue: ${JSON.stringify(positions)}`).toBe(true);
    } finally { await q.close(); }
  }, 180_000);

  it('CONTROL: without a fault, 52 rows across two ticks publish in sequence and are each tried once', async () => {
    const adminA: TestPrincipal = await createPrincipalWithSession(identity, su, { scope: 'DOMAIN', tenantId: tenantA, domainId: domainA, roleCode: 'domain_admin', label: 'b8-a2' });
    await waitFor('the outbox quiet', () => sql<{ n: string }>`select count(*)::text n from objects.object_outbox where status = 'pending'`.execute(su).then((r) => r.rows[0]!.n), (n) => n === '0', 30_000);
    const ids = Array.from({ length: 52 }, () => uuidv7());
    await withCtx(commit, adminA, 'DOMAIN', tenantA, domainA, async (tx, cap) => {
      for (const id of ids) await sql`select objects.enqueue_event(${id}::uuid, 'b8.order', '{"schema_version":"v1"}'::jsonb, ${cap.correlationId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
      await closeOperation(tx, cap, { type: 'outbox', id: ids[0]! });
    }, { action: 'objects.create' });
    const done = await waitFor('every row published', () => rowsOf(ids), (rows) => rows.every((r) => r.status === 'published'), 30_000);
    for (let i = 1; i < done.length; i += 1) expect(done[i]!.published_at!.getTime()).toBeGreaterThanOrEqual(done[i - 1]!.published_at!.getTime());
    expect(done.every((r) => r.attempts === 1)).toBe(true);
  }, 60_000);
});

describe('B7-F2 · an explicit replay reaches the history a leave-registration skipped', () => {
  let sub: { subscriptionId: string; principalId: string };
  const past: string[] = [];

  async function retractFreshEdge(predicate: string): Promise<string> {
    const edgeId = uuidv7(); const evidenceId = uuidv7();
    await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
      values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, ${predicate}, ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${uuidv7()}::uuid, 1, ${evidenceId}::uuid, ${sha256(evidenceId)}, 'replay', 0.9, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason: `B8 reproduction: ${predicate}` } });
    return edgeId;
  }
  const eventOf = async (edgeId: string, after: Date): Promise<string> =>
    (await waitFor(`the GraphChanged row for ${edgeId.slice(0, 8)} published`, () => sql<{ id: string; status: string }>`select id::text, status from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} and payload #>> '{relationships,edges,0,edge_id}' = ${edgeId}`.execute(su).then((r) => r.rows),
      (rows) => rows.length === 1 && rows[0]!.status === 'published'))[0]!.id;
  type Delivery = { event_id: string; state: string; deliveries: number; replay_seq: number; partition_seq: string };
  const deliveries = async (): Promise<Delivery[]> =>
    (await sql<Delivery>`select event_id::text, state, deliveries, replay_seq, partition_seq::text from graph.subscription_deliveries d where d.subscription_id = ${sub.subscriptionId}::uuid order by d.partition_seq`.execute(su)).rows;
  const servedFrom = async () => (await sql<{ served_from_seq: string; checkpoint_seq: string | null; replay_seq: number }>`select served_from_seq::text, checkpoint_seq::text, replay_seq from graph.subscriptions where subscription_id = ${sub.subscriptionId}::uuid`.execute(su)).rows[0]!;
  const settle = async (ms = 60_000): Promise<void> => {
    const until = Date.now() + ms;
    for (;;) {
      const c = await scheduler.subscriptionQueueCountsForTests(T(), D());
      if (c.active === 0 && c.waiting === 0 && c.delayed === 0) return;
      if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(c)}`);
      await sleep(200);
    }
  };

  it('SETUP: two events predate a twins subscription registered to LEAVE its backlog; the third is delivered', async () => {
    const since = await mark();
    past.push(await eventOf(await retractFreshEdge('b8_history_1'), since));
    past.push(await eventOf(await retractFreshEdge('b8_history_2'), since));
    const r = await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
      { payload: { consumerKind: 'twins', ownerPrincipalId: owner.principalId, backlog: 'leave' } as never }) as { subscription: { subscriptionId: string; principalId: string }; served: { reDriven: number } };
    sub = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
    expect(r.served.reDriven).toBe(0);
    const s0 = await servedFrom();
    expect(Number(s0.served_from_seq)).toBeGreaterThan(0);
    const since3 = await mark();
    const third = await eventOf(await retractFreshEdge('b8_after_registration'), since3);
    await waitFor('the third event applied', deliveries, (ds) => ds.some((d) => d.event_id === third && d.state === 'applied'), 60_000);
    await settle();
    expect((await deliveries()).map((d) => d.event_id)).toEqual([third]);
  }, 180_000);

  it('REPRODUCTION → CORRECTION: a replay from the beginning returns the three events AND durably makes the two skipped ones eligible — they are delivered to this subscription, once each; the served point moved back', async () => {
    const r = await graph.replaySubscription(h.req(domainAdmin, 'graph.subscription.replay', 'SUB', sub.subscriptionId, 'platform.administration'), T(), D(), sub.subscriptionId,
      { payload: { fromCreatedAt: null, fromEventId: null, reason: 'B8 reproduction: replay the history the registration left' } }) as { replayed: number; events: string[] };
    expect(r.events).toEqual(expect.arrayContaining(past));
    // THE FINDING: before 0065 the reconciliation re-drove only the event the subscription had already received.
    expect.soft(r.replayed, 'the replay re-drove the two skipped events and the received one').toBe(3);
    const s1 = await servedFrom();
    expect(s1.checkpoint_seq).toBeNull();
    expect.soft(Number(s1.served_from_seq), 'the served point must move back to the replayed point').toBe(0);
    const ds = await waitFor('the skipped history delivered and applied', deliveries, (xs) => past.every((p) => xs.some((d) => d.event_id === p && d.state === 'applied')), 30_000);
    await settle();
    expect(ds.filter((d) => past.includes(d.event_id)).map((d) => d.deliveries)).toEqual([1, 1]);
    expect(ds.filter((d) => past.includes(d.event_id)).map((d) => d.replay_seq)).toEqual([1, 1]);
    // The events say so: the replay recorded the served point it moved, from and to.
    const ev = (await sql<{ details: Record<string, unknown> }>`select details from graph.subscription_events where subscription_id = ${sub.subscriptionId}::uuid and event = 'subscription.replayed' order by occurred_at desc limit 1`.execute(su)).rows[0]!;
    expect(Number(ev.details['served_from_seq_after'])).toBe(0);
    expect(Number(ev.details['served_from_seq_before'])).toBe(Number(await sql<{ s: string }>`select (details ->> 'served_from_seq') s from graph.subscription_events where subscription_id = ${sub.subscriptionId}::uuid and event = 'subscription.registered'`.execute(su).then((x) => x.rows[0]?.s ?? '0')));
    // Ordinary operation preserved: the reconciliation's own tick leaves the applied history alone (delivered once).
    const tick = await dispatcher.reconcile('control: the tick after the replay', false, '10 minutes');
    expect(tick.reDriven.filter((e) => e.subscriptionIds.includes(sub.subscriptionId))).toEqual([]);
  }, 120_000);
});
