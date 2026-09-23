/**
 * CP-6 B9 — Codex's two B8 serving-lifecycle findings, reproduced at the database/queue boundary (real PostgreSQL, real
 * Redis and BullMQ, a second application context on the same database standing in for a second process), then corrected
 * by migration 0066 §1 and the dispatcher's ownership fence.
 *
 *   B8-F1  an expired handler waits for its own completion: `handle` finds its serving claim lapsed, awaits
 *          `stopSubscriptionWorker`, which awaits the worker's graceful close, which waits for the active job — this handler.
 *          The job stays ACTIVE for ever; the worker never closes; the process is not recoverable without a restart.
 *   B8-F2  ownership is checked only at the job's entry: a delivery admitted just before the claim lapses resolves its
 *          items, applies them and finishes AFTER another process took the domain over — two holders' effects overlap.
 *
 * Before (the hook head): the three defect cases FAIL as the findings say; the two normal-operation controls pass.
 * After (0066): every governed effect of a delivery — the items' resolution, each item's write, the receipt, the finish —
 * runs inside a transaction that first takes the serving row FOR KEY SHARE under the holder and GENERATION it was admitted
 * with; a take-over rewrites that row FOR UPDATE, so it waits for in-flight effects and every later effect of the old
 * holder is refused ('serving lost'); the stale handler settles at once (the worker's close is detached, never awaited by
 * the job it would wait for), the job returns to the queue, and the new holder resumes it from the checkpoint. The ledger
 * names the holder and generation of every effect.
 *
 * The serving claim is 10 s here (`EYE_SUBSCRIPTION_SERVING_SECONDS`), the reconciliation tick paused on the first process
 * during the crossing so it stops renewing while believing its claim live — the stalled process of the finding.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import { Phase4Harness } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { commitDb, superDb, type AnyDb } from './helpers.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
process.env['EYE_OUTBOX_LEASE_SECONDS'] = '5';
process.env['EYE_SUBSCRIPTION_SERVING_SECONDS'] = '10';

let h: Phase4Harness; let graph: GraphController; let observation: ObservationController; let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let app2: INestApplicationContext | null = null; let dispatcher2: SubscriptionDispatcherService;
let commit: AnyDb; let su: AnyDb;
let owner: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
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
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1500)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}`);
    await sleep(200);
  }
}
type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; items: string[];
  items_applied: Array<{ item: string; effect: string; details: Record<string, unknown> }>; failure_class: string | null; disposition: string | null };
type LedgerEvent = { event: string; occurred_at: Date; details: Record<string, unknown> };
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, items, items_applied, failure_class, disposition from graph.subscription_deliveries d where d.event_id = ${eventId}::uuid order by d.consumer_kind`.execute(su)).rows;
const ledgerOf = async (eventId: string, subscriptionId: string): Promise<LedgerEvent[]> =>
  (await sql<LedgerEvent>`select event, occurred_at, details from graph.subscription_delivery_events where outbox_event_id = ${eventId}::uuid and subscription_id = ${subscriptionId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const servingRow = async () => (await sql<{ holder: string; claimed_until: Date; renewals: number; generation: string | null }>`select holder, claimed_until, renewals, ${sql.raw(SERVING_HAS_GENERATION ? 'generation::text' : 'null::text')} as generation from graph.subscription_domain_serving where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`.execute(su)).rows[0] ?? null;
const servingEvents = async () => (await sql<{ event: string; holder: string; previous: string | null; occurred_at: Date }>`select event, holder, previous, occurred_at from graph.subscription_serving_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by occurred_at, event_id`.execute(su)).rows;
let SERVING_HAS_GENERATION = false;
const queueCounts = () => scheduler.subscriptionQueueCountsForTests(T(), D());
const settle = async (ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const c = await queueCounts();
    if (c.active === 0 && c.waiting === 0 && c.delayed === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(c)}`);
    await sleep(200);
  }
};
const register = (kind: 'retrieval' | 'memory-mappings') =>
  graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(), { payload: { consumerKind: kind, ownerPrincipalId: owner.principalId } as never }) as Promise<{ subscription: { subscriptionId: string } }>;
async function retractFreshEdge(predicate: string): Promise<string> {
  const edgeId = uuidv7(); const evidenceId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, ${predicate}, ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${uuidv7()}::uuid, 1, ${evidenceId}::uuid, ${sha256(evidenceId)}, 'replay', 0.9, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason: `B9 harness: ${predicate}` } });
  return edgeId;
}
const eventOf = async (edgeId: string, after: Date): Promise<string> =>
  (await waitFor(`the GraphChanged row for ${edgeId.slice(0, 8)} published`, () => sql<{ id: string; status: string }>`select id::text, status from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} and payload #>> '{relationships,edges,0,edge_id}' = ${edgeId}`.execute(su).then((r) => r.rows),
    (rows) => rows.length === 1 && rows[0]!.status === 'published'))[0]!.id;
const submitCorrection = async (evdIds: string[], reason: string): Promise<string> => {
  const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(), kind: 'correction', channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  return opened.correction.caseId;
};
const applyCase = (caseId: string, evdIds: string[], reason: string) =>
  observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId, { payload: { decision: 'apply', affectedEvdIds: evdIds, reason } }) as Promise<{ correction: Record<string, unknown> }>;
const publishedEvent = (eventType: 'GraphChanged' | 'MemoryCorrected', kind: string, after: Date) =>
  waitFor(`the ${eventType}/${kind} row published`, () => sql<{ id: string; status: string }>`select id::text, status from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} and payload #>> '{change,kind}' = ${kind} order by created_at`.execute(su).then((r) => r.rows),
    (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);
const lineageFor = (claimId: string, evidenceId: string) =>
  sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
      values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${evidenceId}::uuid, ${sha256(evidenceId)}, 0, 4, 0.8, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
/** An asserted edge planted WITH its edge.asserted event (B20, 0080: the symmetric retrieval check calls an event-less projection row poisoned and withdraws the partition). */
const edgeOn = async (predicate: string, claimId: string, evidenceId: string): Promise<string> => {
  const edgeId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, ${predicate}, ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimId}::uuid, 1, ${evidenceId}::uuid, ${sha256(evidenceId)}, 'replay', 0.8, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${edgeId}::uuid, 'edge.asserted', ${owner.principalId}::uuid, jsonb_build_object('predicate', ${predicate}::text, 'subject', ${E2}::uuid, 'object', ${E1}::uuid, 'valid_from', '2024-01-01T00:00:00Z'::timestamptz, 'valid_to', null, 'mode', 'replay', 'claim_object_id', ${claimId}::uuid, 'claim_version', 1, 'review_state', 'approved'), ${uuidv7()}::uuid)`.execute(su);
  return edgeId;
};
/** The first process claims the domain afresh (its renewals then paused): the crossing starts from a claim of full length. */
async function freshClaimThenStall(): Promise<{ holder: string; claimedUntil: Date }> {
  dispatcher.pauseRenewalsForTests(false);
  await dispatcher.reconcile('B9: a fresh claim before the crossing', false);
  dispatcher.pauseRenewalsForTests(true);
  const row = (await servingRow())!;
  expect(row.holder).toBe(dispatcher.holderId());
  return { holder: row.holder, claimedUntil: row.claimed_until };
}
/** The second process takes the lapsed domain over (it waited for the claim to lapse in the database). */
async function takeOverBySecond(claimedUntil: Date): Promise<Date> {
  const lapse = claimedUntil.getTime() - Date.now() + 500;
  if (lapse > 0) await sleep(lapse);
  await dispatcher2.standDownForTests(false);
  const r = await dispatcher2.reconcile('B9: the second process takes the lapsed domain over', false);
  const mine = r.domains.find((d) => d.tenantId === T() && d.domainId === D());
  expect(mine).toMatchObject({ mine: true, takenOver: true });
  const ev = (await servingEvents()).filter((e) => e.event === 'taken_over' && e.holder === dispatcher2.holderId()).at(-1)!;
  expect(ev).toBeDefined();
  return ev.occurred_at;
}
/** Back to the first process: the second stands down, the first resumes renewing and reclaims (each case starts and ends here). */
async function handBack(): Promise<void> {
  dispatcher.armFaultForTests(null);
  await dispatcher2.standDownForTests(true);
  dispatcher.pauseRenewalsForTests(false);
  await dispatcher.reconcile('B9: the first process reclaims', false);
  expect((await servingRow())?.holder).toBe(dispatcher.holderId());
}
const servedBy = (e: LedgerEvent): string | null => (e.details['served_by'] as string | undefined) ?? null;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  graph = h.app.get(G); observation = h.app.get(O); scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  commit = commitDb(); su = superDb();
  SERVING_HAS_GENERATION = (await sql<{ n: number }>`select count(*)::int n from information_schema.columns where table_schema = 'graph' and table_name = 'subscription_domain_serving' and column_name = 'generation'`.execute(su)).rows[0]!.n === 1;
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'forecast_owner', 'resolution_manager', 'decision_owner'], 'b9-owner');
  manager = await h.principalWith(['collection_manager'], 'b9-collection-manager');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b9-tenant-admin', 'TENANT');
  // B20 (0080): the planted entities carry their entity.created events (the honest fixture — an event-less row is poisoned under the symmetric check).
  for (const [id, type, name] of [[E1, 'place', 'Bab el-Mandeb Strait'], [E2, 'organization', 'NORDWERK Magnet GmbH']] as const) {
    const correlation = uuidv7();
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${correlation}::uuid)`.execute(su);
    await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${owner.principalId}::uuid, ${JSON.stringify({ entity_type: type, canonical_name: name, normalized_name: name.toLowerCase(), split_from: null })}::jsonb, ${correlation}::uuid)`.execute(su);
  }
  await register('retrieval');
  await register('memory-mappings');
  app2 = await NestFactory.createApplicationContext(AppModule, { logger: false });
  dispatcher2 = app2.get(SubscriptionDispatcherService);
  await dispatcher2.standDownForTests(true);
}, 300_000);

afterAll(async () => {
  try { dispatcher.pauseRenewalsForTests(false); await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await app2?.close().catch(() => undefined);
  await h?.close();
  await Promise.all([commit, su].map((d) => d.destroy()));
}, 120_000);

describe('B9 · controls: the serving lifecycle in normal operation', () => {
  it('CONTROL: under a live claim a delivery is applied by the holder; the ledger names the holder of every effect (0066) and the claim is renewed while it runs', async () => {
    await settle();
    const before = (await servingRow())!;
    expect(before.holder).toBe(dispatcher.holderId());
    const since = await mark();
    const edgeId = await retractFreshEdge('b9_control_live_claim');
    const ev = await eventOf(edgeId, since);
    const rows = await waitFor('the control delivery applied', () => deliveriesFor(ev), (r) => r.length === 2 && r.every((d) => d.state === 'applied'), 60_000);
    await settle();
    const renewed = await dispatcher.reconcile('B9 control: a renewal during operation', false);
    expect(renewed.domains.find((d) => d.tenantId === T())).toMatchObject({ mine: true, takenOver: false });
    expect((await servingRow())!.renewals).toBeGreaterThan(before.renewals);
    if (SERVING_HAS_GENERATION) {
      for (const d of rows) {
        const led = await ledgerOf(ev, d.subscription_id);
        expect(led.map((e) => e.event)).toContain('applied');
        for (const e of led) expect(servedBy(e)).toBe(dispatcher.holderId());
      }
    }
  }, 120_000);

  it('CONTROL: a hand-over between deliveries (stand-down, take-over, hand back) leaves nothing stranded and every delivery applied by the holder of its moment', async () => {
    await dispatcher.standDownForTests(true);
    await dispatcher2.standDownForTests(false);
    const r2 = await dispatcher2.reconcile('B9 control: the second process claims after a stand-down', false);
    expect(r2.domains.find((d) => d.tenantId === T())).toMatchObject({ mine: true });
    const since = await mark();
    const ev = await eventOf(await retractFreshEdge('b9_control_hand_over'), since);
    const rows = await waitFor('the delivery applied by the second process', () => deliveriesFor(ev), (r) => r.length === 2 && r.every((d) => d.state === 'applied'), 60_000);
    if (SERVING_HAS_GENERATION) for (const d of rows) for (const e of await ledgerOf(ev, d.subscription_id)) expect(servedBy(e)).toBe(dispatcher2.holderId());
    await dispatcher2.standDownForTests(true);
    await dispatcher.standDownForTests(false);
    await dispatcher.reconcile('B9 control: the first process reclaims', false);
    expect((await servingRow())?.holder).toBe(dispatcher.holderId());
    await settle();
  }, 120_000);
});

describe('B9 · B8-F2: ownership across in-flight governed writes and a take-over', () => {
  it('A DELIVERY CROSSES THE EXPIRY: item 1 applied by the first process; the claim lapses and the second takes over while item 2 waits; item 2 and the finish are the SECOND process\'s — the first is refused, its job returned, nothing of its written after the take-over', async () => {
    await settle();
    // Two edges whose claims were extracted from the same evidence: the mappings consumer resolves two items for its correction.
    const up = await h.upload([{ filename: 'terms-b9.csv', text: TERMS_CSV.replace('assumption', 'assumption (b9)'), documentTime: '2024-01-14T00:00:00Z' }]);
    const evd = up[0] as { id: string };
    const c1 = uuidv7(); const c2 = uuidv7();
    const e1 = await edgeOn('supplies', c1, evd.id); const e2 = await edgeOn('insures', c2, evd.id);
    await lineageFor(c1, evd.id); await lineageFor(c2, evd.id);
    await handBack();
    const claim = await freshClaimThenStall();
    try {
    dispatcher.armFaultForTests('slow_before_item', 'memory-mappings', { ms: 12_000, item: 2 });
    const since = await mark();
    const caseId = await submitCorrection([evd.id], 'b9: the crossing');
    await applyCase(caseId, [evd.id], 'restatement verified');
    const ev = (await publishedEvent('MemoryCorrected', 'evidence.corrected', since)).id;
    // The first item is the first process's, under its live claim.
    const m1 = await waitFor('item 1 applied by the first process', () => deliveriesFor(ev), (r) => (r.find((d) => d.consumer_kind === 'memory-mappings')?.items_applied.length ?? 0) >= 1, 30_000).then((r) => r.find((d) => d.consumer_kind === 'memory-mappings')!);
    expect(m1.state).toBe('received');
    const takenOverAt = await takeOverBySecond(claim.claimedUntil);
    const done = await waitFor('the mappings delivery terminal after the take-over', () => deliveriesFor(ev), (r) => r.every((d) => d.state !== 'received'), 60_000).then((r) => r.find((d) => d.consumer_kind === 'memory-mappings')!);
    await settle();
    expect(done.state).toBe('applied');
    expect(new Set(done.items)).toEqual(new Set([`edge:${e1}`, `edge:${e2}`]));
    expect(done.items_applied).toHaveLength(2);
    const led = await ledgerOf(ev, done.subscription_id);
    const afterTakeOver = led.filter((e) => e.occurred_at.getTime() > takenOverAt.getTime());
    // The finding: after the take-over the old handler applied item 2 and finished 'applied'. Corrected: everything written
    // after the take-over is the new holder's — the old holder's item 2 and finish were refused and its job returned.
    expect(afterTakeOver.map((e) => e.event)).toEqual(expect.arrayContaining(['item.applied', 'applied']));
    for (const e of afterTakeOver) expect(servedBy(e), `${e.event} at ${e.occurred_at.toISOString()} after the take-over at ${takenOverAt.toISOString()} must be the second process's`).toBe(dispatcher2.holderId());
    const beforeTakeOver = led.filter((e) => e.occurred_at.getTime() <= takenOverAt.getTime());
    for (const e of beforeTakeOver) expect(servedBy(e)).toBe(dispatcher.holderId());
    expect(done.deliveries).toBeGreaterThanOrEqual(2); // the returned job was re-driven to the new holder
    if (SERVING_HAS_GENERATION) {
      const gens = new Set(led.map((e) => e.details['serving_generation']));
      expect(gens.size).toBe(2); // two generations of the claim touched this delivery, in order
    }
    const proposals = (await sql<{ subject_id: string; state: string }>`select subject_id::text, state from graph.mapping_reconciliations where cause_event_id = ${ev}::uuid order by subject_id`.execute(su)).rows;
    expect(proposals.map((p) => p.state)).toEqual(['proposed', 'proposed']); // each edge proposed exactly once (idempotent items)
    } finally { await handBack(); }
  }, 240_000);

  it('COMPLETION ACCOUNTING: every item applied by the first process, the take-over lands before its finish — the stale finish is refused; the new holder re-drives, skips the applied item and finishes; the applied event is the new holder\'s', async () => {
    await settle();
    await handBack();
    const claim = await freshClaimThenStall();
    try {
    dispatcher.armFaultForTests('slow_before_finish', 'retrieval', { ms: 12_000 });
    const since = await mark();
    const ev = await eventOf(await retractFreshEdge('b9_crossing_before_finish'), since);
    const r1 = await waitFor('the retrieval item applied by the first process', () => deliveriesFor(ev), (r) => (r.find((d) => d.consumer_kind === 'retrieval')?.items_applied.length ?? 0) >= 1, 30_000).then((r) => r.find((d) => d.consumer_kind === 'retrieval')!);
    expect(r1.state).toBe('received');
    const takenOverAt = await takeOverBySecond(claim.claimedUntil);
    const done = await waitFor('the retrieval delivery terminal after the take-over', () => deliveriesFor(ev), (r) => r.every((d) => d.state !== 'received'), 60_000).then((r) => r.find((d) => d.consumer_kind === 'retrieval')!);
    await settle();
    expect(done.state).toBe('applied');
    expect(done.items_applied).toHaveLength(1);
    const led = await ledgerOf(ev, done.subscription_id);
    const applied = led.filter((e) => e.event === 'applied');
    expect(applied).toHaveLength(1);
    expect(applied[0]!.occurred_at.getTime()).toBeGreaterThan(takenOverAt.getTime());
    expect(servedBy(applied[0]!), 'the applied event must be the second process\'s').toBe(dispatcher2.holderId());
    expect(done.deliveries).toBeGreaterThanOrEqual(2);
    } finally { await handBack(); }
  }, 240_000);
});

describe('B9 · B8-F1: an expired handler must settle without waiting for its own worker to drain', () => {
  it('THE FENCE AT ENTRY on a lapsed belief: the job is refused promptly and returned, the worker closes, the process keeps working; the next reconciliation re-serves the domain and the job is delivered', async () => {
    await settle();
    await handBack();
    expect(dispatcher.expireServingForTests(T(), D())).toBe(true);
    const since = await mark();
    const ev = await eventOf(await retractFreshEdge('b9_expired_handler'), since);
    // The finding: the handler awaits the worker's close, which waits for the handler — the job stays ACTIVE for ever.
    const counts = await waitFor('the refused job out of the active state', queueCounts, (c) => c.active === 0, 20_000);
    expect(counts.active).toBe(0);
    expect(scheduler.runningWorkers().some((w) => w.includes(D()))).toBe(false);
    expect((await deliveriesFor(ev)).length).toBe(0); // nothing was received under a lapsed belief
    // The process is alive and recoverable: its next reconciliation (still the holder of record) re-serves the domain.
    const r = await dispatcher.reconcile('B9: the process re-serves after the lapse', false);
    expect(r.domains.find((d) => d.tenantId === T())).toMatchObject({ mine: true });
    const rows = await waitFor('the returned job delivered', () => deliveriesFor(ev), (x) => x.length === 2 && x.every((d) => d.state === 'applied'), 60_000);
    if (SERVING_HAS_GENERATION) for (const d of rows) for (const e of await ledgerOf(ev, d.subscription_id)) expect(servedBy(e)).toBe(dispatcher.holderId());
    await settle();
  }, 120_000);
});
