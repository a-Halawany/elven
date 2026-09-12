/**
 * Codex finding 3 (2026-09-12), reproduced at the DATABASE/QUEUE boundary — real Redis, the real outbox publisher,
 * the real dispatcher and the real retrieval consumer on a fresh domain: a projection mismatch makes the retrieval
 * delivery `failed`; the re-drive (the reconciliation's own, as at a restart or a tick) makes it `applied` with NO
 * second check, because the mismatched check was checkpointed as an applied item. Run once at the 0063 head for the
 * "before"; the same file is the "after" once the correction is in place (kept as the regression control).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { GraphController } from '../../src/graph/graph.controller.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';

let h: Phase4Harness; let graph: GraphController; let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let owner: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
const E1 = uuidv7(); const E2 = uuidv7();
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
import { createHash } from 'node:crypto';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

type Delivery = { event_id: string; consumer_kind: string; state: string; deliveries: number; attempts: number; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null }>; last_error: string | null };
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, last_error from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(h.su)).rows;
const checksFor = async (eventId: string) =>
  (await sql<{ check_id: string; mismatched: number; checked_at: Date }>`select check_id::text, mismatched, checked_at from graph.retrieval_checks where outbox_event_id = ${eventId}::uuid order by checked_at`.execute(h.su)).rows;
const events = async (eventId: string) =>
  (await sql<{ event: string }>`select e.event from graph.subscription_delivery_events e join graph.subscriptions s on s.subscription_id = e.subscription_id where e.outbox_event_id = ${eventId}::uuid and s.consumer_kind = 'retrieval' order by e.occurred_at, e.event_id`.execute(h.su)).rows.map((r) => r.event);
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms; let last: X | undefined;
  for (;;) { last = await probe(); if (ok(last)) return last; if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 600)}`); await new Promise((r) => setTimeout(r, 300)); }
}
const settle = async (): Promise<void> => { await waitFor('queue settled', () => scheduler.subscriptionQueueCountsForTests(T(), D()), (c) => c.active === 0 && c.waiting === 0 && c.delayed === 0); };
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(h.su)).rows[0]!.t;
async function retractFreshEdge(reason: string): Promise<string> {
  const edgeId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'ships_through', ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${sha256(edgeId)}, 'replay', 0.9, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason } });
  return edgeId;
}
const publishedAfter = (since: Date) => waitFor('the GraphChanged row published', () => sql<{ id: string; status: string; created_at: Date }>`select id::text, status, created_at from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = ${T()}::uuid and created_at >= ${since} order by created_at`.execute(h.su).then((r) => r.rows),
  (rows) => rows.some((r) => r.status === 'published')).then((rows) => rows.at(-1)!.id);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  graph = h.app.get(G); scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  owner = await h.principalWith(['strategy_owner', 'resolution_manager'], 'owner');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'tenant-admin', 'TENANT');
  for (const [id, name] of [[E1, 'Bab el-Mandeb Strait'], [E2, 'NORDWERK Magnet GmbH']] as const) {
    // Created with its event, so the projection has a log to be rebuilt from.
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'organization', ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${owner.principalId}::uuid, '{}'::jsonb, ${uuidv7()}::uuid)`.execute(h.su);
  }
  await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(), { payload: { consumerKind: 'retrieval', ownerPrincipalId: owner.principalId } as never });
}, 300_000);
afterAll(async () => { try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* */ } await h?.close(); }, 120_000);

describe('Codex finding 3 — a projection mismatch across a re-drive', () => {
  it('reproduction at the database/queue boundary', async () => {
    // 1. A healthy change: the check passes.
    let since = await mark();
    await retractFreshEdge('control: a healthy retraction');
    const okEvent = await publishedAfter(since);
    const okRows = await waitFor('the healthy delivery applied', () => deliveriesFor(okEvent), (rows) => rows.length === 1 && rows[0]!.state === 'applied');
    await settle();
    console.log(`healthy: state=${okRows[0]!.state} items_applied=${JSON.stringify(okRows[0]!.items_applied.map((x) => x.effect))} checks=${(await checksFor(okEvent)).map((c) => c.mismatched).join(',')}`);
    // 2. The projection drifts from its log (an operator-side corruption the subscriber must report, never repair).
    await sql`update graph.entities_current set lifecycle_state = 'retired' where entity_id = ${E1}::uuid`.execute(h.su);
    since = await mark();
    await retractFreshEdge('the drifted projection is checked');
    const badEvent = await publishedAfter(since);
    const bad = await waitFor('the mismatched delivery terminal', () => deliveriesFor(badEvent), (rows) => rows.length === 1 && rows[0]!.state !== 'received');
    await settle();
    const checksBefore = await checksFor(badEvent);
    console.log(`mismatch: state=${bad[0]!.state} items_applied=${JSON.stringify(bad[0]!.items_applied.map((x) => x.effect))} last_error=${String(bad[0]!.last_error).slice(0, 80)} checks=${checksBefore.map((c) => c.mismatched).join(',')} events=${(await events(badEvent)).join(',')}`);
    // 3. The re-drive, as the reconciliation makes it at a restart or a tick — the projection STILL drifted.
    const report = await dispatcher.reconcile('repro: re-drive of the failed delivery', false);
    console.log(`re-drive: reDriven=${report.reDriven.map((e) => `${e.eventId.slice(0, 8)}:${e.previous.join('/')}`).join(' ')}`);
    const after = await waitFor('the re-driven delivery terminal', () => deliveriesFor(badEvent), (rows) => rows[0]!.deliveries >= 2 && rows[0]!.state !== 'received');
    await settle();
    const checksAfter = await checksFor(badEvent);
    console.log(`after re-drive: state=${after[0]!.state} deliveries=${after[0]!.deliveries} items_applied=${JSON.stringify(after[0]!.items_applied.map((x) => x.effect))} last_error=${String(after[0]!.last_error).slice(0, 80)} checks=${checksAfter.map((c) => c.mismatched).join(',')} events=${(await events(badEvent)).join(',')}`);
    const stillMismatched = (await sql<{ m: string }>`select coalesce(sum(mismatched), 0)::text m from graph.retrieval_checks where outbox_event_id = ${badEvent}::uuid`.execute(h.su)).rows[0]!.m;
    console.log(`RESULT: projection still drifted=${(await sql<{ s: string }>`select lifecycle_state s from graph.entities_current where entity_id = ${E1}::uuid`.execute(h.su)).rows[0]!.s !== 'active'} · delivery ${after[0]!.state} · checks recorded ${checksAfter.length} (mismatched sum ${stillMismatched}) · second check made=${checksAfter.length > checksBefore.length}`);
    expect(after[0]!.state === 'applied' && checksAfter.length === checksBefore.length, 'FINDING REPRODUCED: the re-drive cleared the failure without a second check').toBe(false);
  }, 240_000);
});
