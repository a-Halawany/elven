/**
 * CP-6 batch B6 — GraphChanged / MemoryCorrected SUBSCRIPTIONS and their CONSUMERS through real Redis, the real
 * outbox publisher and the real database (migration 0063), on the corrected recovery machinery of 0062.
 *
 * AU-MEM-0030, in full: "Graph and memory changes publish a GraphChanged/MemoryCorrected event with affected
 * identities, relationships, temporal scopes and subscriptions; durable subscriptions and consumers for twins,
 * forecasts, scenarios, decisions, retrieval and memory mappings." What this suite demonstrates on the shipping path:
 *
 *   THE EVENT — a retracted edge, a declared strategy object, an applied evidence correction each publish, in the
 *     SAME transaction as the change, an immutable outbox row carrying the identities touched (named, with
 *     lifecycle), the relationships (edges with world and record intervals, resolutions, dependencies), the reach
 *     (the dependency walk — the invalidation's own walker, never a second one), the temporal scope, the
 *     subscriptions live at publication and the cause.
 *   THE SIX CONSUMERS — twins, forecasts, scenarios, decisions, retrieval, memory mappings — each a registered,
 *     revocable subscription of its own kind holding exactly its own action, each updating its own world in its own
 *     terms with no operator act: a citing/boundary-bound twin version unverified, a forecast and a scenario marked
 *     for attention, an invalidated input recorded on a decision package, the retrieval projections re-verified and
 *     the check recorded, a mapping reconciliation PROPOSED for a person to decide.
 *   DURABILITY — a redelivery applies nothing twice; a restart with an empty Redis re-drives nothing finished; an
 *     interruption after receipt and one after the first committed item are re-driven at the next start and resume
 *     from the per-item checkpoint with no duplicate effect; a replay re-checks every event for one subscription
 *     and duplicates nothing; a paused subscription's events wait and a resume re-drives them.
 *   UNRELATED DELIVERY PRESERVED — CorrectionApplied still reaches the propagation path and the global log; no
 *     GraphChanged reaches the propagation queue; no CorrectionApplied reaches the subscription queue.
 *   THE GOVERNED PATH — every port refuses without its action; a subscriber of one kind cannot drive another's
 *     port; a foreign principal cannot set a delivery's items; the new tables are under forced RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { SchedulerService, propagationQueueNameFor, redisName, subscriptionQueueNameFor } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { SubscriptionSessionService, SubscriptionGrantRefused } from '../../src/graph/subscriptions/subscription-session.service.js';
import { CONSUMER_KINDS, CONSUMER_ROLE, CONSUMER_VERSION, consumerCodeDigest, type ConsumerKind } from '../../src/graph/subscriptions/graph-change.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import { RECORD_FILES, TERMS_CSV, observedInventory, observedShipments, assumedTerms } from './phase5-fixtures.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness;
let twins: TwinController; let graph: GraphController; let observation: ObservationController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let owner: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal;
let ownerId = ''; let twinId = ''; let v1 = 0;
let evdB: { id: string; version: number };
let records: { inv: { id: string; version: number }; ship: { id: string; version: number }; terms: { id: string; version: number } };
const E1 = uuidv7(); const E2 = uuidv7(); const X1 = uuidv7(); const C1 = uuidv7();
const A1 = uuidv7(); const D1 = uuidv7(); const F1 = uuidv7(); const S1 = uuidv7(); const P1 = uuidv7(); const I1 = uuidv7();
const subs: Partial<Record<ConsumerKind, { subscriptionId: string; principalId: string }>> = {};
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const elements = (shock: { id: string; version: number }) =>
  [...observedInventory(records.inv), ...observedShipments(records.ship, '2024-01-11', ['SYN-SHIP-4471', 'SYN-SHIP-4472']), ...assumedTerms(records.terms, shock)];

async function bind(app: Phase4Harness['app']): Promise<void> {
  const { TwinController: Tw } = await import('../../src/twin/twin.controller.js');
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  twins = app.get(Tw); graph = app.get(G); observation = app.get(O);
  scheduler = app.get(SchedulerService); dispatcher = app.get(SubscriptionDispatcherService);
}
async function restart(): Promise<void> {
  await h.app.close();
  h.app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  h.pipeline = h.app.get((await import('../../src/pipeline/pipeline.service.js')).PipelineService);
  await bind(h.app);
}

async function admitTwin(els: unknown[], branch: string): Promise<number> {
  const o = await twins.openVersion(h.req(owner, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: branch, knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(owner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: { elements: els } });
  await twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: {} });
  return o.version.version;
}
async function applyCorrection(evdIds: string[], reason: string): Promise<string> {
  const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(), kind: 'correction', channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  await observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', opened.correction.caseId, 'observation'), T(), D(), opened.correction.caseId,
    { payload: { decision: 'apply', affectedEvdIds: evdIds, reason: `${reason}: verified against the publisher` } });
  return opened.correction.caseId;
}
/** A fresh edge between the fixture entities, asserted directly and retracted through the route: one graph change on demand. */
async function retractFreshEdge(predicate: string, reason: string): Promise<string> {
  const edgeId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, ${predicate}, ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${uuidv7()}::uuid, 1, ${evdB.id}::uuid, ${sha256(evdB.id)}, 'replay', 0.9, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason } });
  return edgeId;
}
const register = (as: AuthenticatedPrincipal, payload: Record<string, unknown>) =>
  graph.registerSubscription(h.req(as, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(), { payload: payload as never }) as Promise<{
    subscription: { subscriptionId: string; consumerKind: string; principalId: string; role: string; consumer: { version: string; codeDigest: string }; budgets: Record<string, unknown> };
    served: { workerRunning: boolean; reDriven: number } }>;
const statusOf = () => graph.subscriptionStatus(h.req(owner, 'graph.read', 'SUB', null, 'graph'), T(), D()) as Promise<{ subscriptions: {
  consumers: Array<{ kind: string; registeredInThisProcess: boolean }>; subscriptions: Array<Record<string, unknown>>; deliveries: Array<Record<string, unknown>>;
  runtime: { worker_running: boolean; scheduler_enabled: boolean; last_reconciliation: { domains: Array<{ tenantId: string; domainId: string; subscriptions: number }> } | null } } }>;

type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; attempts: number; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null }>; replay_seq: number; last_error: string | null };
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, replay_seq, last_error
     from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(h.su)).rows;
const deliveryEvents = async (eventId: string, kind: string): Promise<string[]> =>
  (await sql<{ event: string }>`select e.event from graph.subscription_delivery_events e join graph.subscriptions s on s.subscription_id = e.subscription_id
     where e.outbox_event_id = ${eventId}::uuid and s.consumer_kind = ${kind} order by e.occurred_at, e.event_id`.execute(h.su)).rows.map((r) => r.event);
const outboxRows = async (eventType: string, where: (p: Record<string, unknown>) => boolean = () => true) =>
  (await sql<{ id: string; status: string; payload: Record<string, unknown>; correlation_id: string; created_at: Date }>`select id::text, status, payload, correlation_id::text, created_at from objects.object_outbox
     where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by created_at`.execute(h.su)).rows.filter((r) => where(r.payload));
const twinEvents = async (version: number) =>
  (await sql<{ details: Record<string, unknown> }>`select details from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified' and (details ->> 'version')::int = ${version} order by occurred_at`.execute(h.su)).rows;
const verificationOf = async (version: number) =>
  (await sql<{ verification_state: string }>`select verification_state from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${version}`.execute(h.su)).rows[0]?.verification_state;
const allApplied = (rows: Delivery[], n: number) => rows.length === n && rows.every((d) => d.state === 'applied');

async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  let last: X | undefined;
  for (;;) {
    last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 800)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}; recent: ${JSON.stringify(dispatcher.recentDeliveries().slice(0, 4))}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
const settle = async (ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const c = await scheduler.subscriptionQueueCountsForTests(T(), D());
    if (c.active === 0 && c.waiting === 0 && c.delayed === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(c)}`);
    await new Promise((r) => setTimeout(r, 300));
  }
};
const failure = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  try { await p; return { status: null, code: null, message: '' }; } catch (e) {
    if (e instanceof HttpException) return { status: e.getStatus(), code: null, message: String((e.getResponse() as { message?: string }).message ?? '') };
    return { status: null, code: (e as { code?: string }).code ?? null, message: (e as Error).message };
  }
};
/** A marker on the DATABASE clock (outbox created_at is the write transaction's now(); both come back at millisecond precision, so the match is >=). */
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(h.su)).rows[0]!.t;
/** The latest GraphChanged/MemoryCorrected row of a kind, published by the real outbox tick. */
const publishedEvent = (eventType: 'GraphChanged' | 'MemoryCorrected', kind: string, after: Date) =>
  waitFor(`the ${eventType}/${kind} row published`, () => outboxRows(eventType, (p) => (p['change'] as { kind: string }).kind === kind),
    (rows) => rows.some((r) => r.status === 'published' && r.created_at >= after)).then((rows) => rows.filter((r) => r.created_at >= after).at(-1)!);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  await bind(h.app);
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'forecast_owner', 'simulation_operator', 'resolution_manager'], 'twin-owner');
  manager = await h.principalWith(['collection_manager'], 'collection-manager');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'tenant-admin', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'domain-admin');
  ownerId = owner.principalId;
  await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  const up = await h.upload([...RECORD_FILES(), { filename: 'routes-and-terms-2024Q1-restated.csv', text: TERMS_CSV.replace('assumption', 'assumption (restated)'), documentTime: '2024-01-11T00:00:00Z' }]);
  records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
  evdB = up[3] as typeof evdB;
  // THE WORLD: two entities, an edge between them asserted by claim C1 on evidence B, an assumption resting on the edge,
  // a decision resting on the assumption, a forecast for E1 resting on the assumption, a scenario on the forecast, a
  // decision package on the decision, an identifier on E2 sourced from C1/B, and a twin whose boundary is E1.
  for (const [id, type, name] of [[E1, 'place', 'Bab el-Mandeb Strait'], [E2, 'organization', 'NORDWERK Magnet GmbH']] as const) {
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  }
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${X1}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'ships_through', ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${C1}::uuid, 1, ${evdB.id}::uuid, ${sha256(evdB.id)}, 'replay', 0.9, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  for (const [id, type, title] of [[A1, 'ASU', 'Red Sea transit stays open'], [D1, 'DEC', 'Keep the Ningbo → Regensburg routing']] as const) {
    await sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, 1, ${title}, 'fixture strategy object', 'active', ${type === 'ASU' ? 'verified' : 'not_applicable'}, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  }
  await sql`insert into prediction.forecasts_current (forecast_id, scope, tenant_id, domain_id, series_key, subject_entity_id, horizon_code, horizon_days, origin_at, known_at, target_at, method, method_version, baseline_method, quantiles, drivers, assumptions, evidence_refs, refresh_cadence, validation_state, validation_note, label, statement, state, issued_by, correlation_id)
    values (${F1}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'transit.days', ${E1}::uuid, '90d', 90, '2024-01-17', now(), '2024-04-16', 'seasonal-naive', '1.0.0', 'naive', '{"q10": 30, "q50": 34, "q90": 41}'::jsonb, '["transit days"]'::jsonb, ${sql`ARRAY[${A1}::uuid]`}, ${JSON.stringify([`EVD:${evdB.id}@${evdB.version}`])}::jsonb, 'weekly', 'unvalidated', 'fixture forecast: not validated', 'replay demonstration', 'fixture forecast statement', 'issued', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into prediction.scenarios_current (scenario_id, scope, tenant_id, domain_id, title, statement, forecast_id, subject_entity_id, owner_principal_id, review_cadence, state, correlation_id)
    values (${S1}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'Transit disruption', 'fixture scenario tree on the transit forecast', ${F1}::uuid, ${E1}::uuid, ${ownerId}::uuid, 'weekly', 'active', ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into decision.packages_current (package_id, scope, tenant_id, domain_id, decision_object_id, title, statement, owner_principal_id, state, declared_by, correlation_id)
    values (${P1}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${D1}::uuid, 'Routing decision', 'fixture decision package', ${ownerId}::uuid, 'draft', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  for (const [dep, type, kind, on] of [[A1, 'ASU', 'edge', X1], [D1, 'DEC', 'strategy', A1], [F1, 'FCT', 'strategy', A1], [S1, 'SCN', 'forecast', F1]] as const) {
    await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${dep}::uuid, ${type}, ${kind}, ${on}::uuid, 'fixture dependency: rests on it directly', 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  }
  await sql`insert into graph.identifier_systems (scope, tenant_id, domain_id, system_key, authority, description, is_authoritative, registered_by, correlation_id)
    values ('DOMAIN', ${T()}::uuid, ${D()}::uuid, 'lei', 'GLEIF', 'Legal Entity Identifier', true, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
    values (${I1}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'lei', '5299000NORDWERK00001', ${C1}::uuid, ${evdB.id}::uuid, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(owner, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet chain',
    boundary: [E1], owner: ownerId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
  v1 = await admitTwin(elements(evdB), 'actual');
}, 300_000);

afterAll(async () => {
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B6 · six subscriptions, each a registered, revocable grant holding exactly its own action', () => {
  it('registration is the tenant administrator\'s: a principal of the kind\'s role on the identity authority, the subscription on the commit authority, the domain served; one live subscription per kind (AU-MEM-0112)', async () => {
    expect((await failure(register(owner, { consumerKind: 'twins', ownerPrincipalId: ownerId }))).status).toBe(403);
    expect((await failure(register(domainAdmin, { consumerKind: 'twins', ownerPrincipalId: ownerId }))).status).toBe(403);
    expect((await failure(register(tenantAdmin, { consumerKind: 'weather', ownerPrincipalId: ownerId }))).status).toBe(400);
    expect((await failure(register(tenantAdmin, { consumerKind: 'twins' }))).status).toBe(400);
    for (const kind of CONSUMER_KINDS) {
      const r = await register(tenantAdmin, { consumerKind: kind, ownerPrincipalId: ownerId });
      subs[kind] = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
      expect(r.subscription.role).toBe(CONSUMER_ROLE[kind]);
      expect(r.subscription.consumer).toEqual({ version: CONSUMER_VERSION, codeDigest: consumerCodeDigest(kind) });
      expect(r.served.workerRunning, `${kind}: the domain queue is served from registration`).toBe(true);
      const p = (await sql<{ kind: string; status: string; roles: string[] }>`select p.kind, p.status, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
        where p.id = ${r.subscription.principalId}::uuid group by p.id`.execute(h.su)).rows[0];
      expect(p).toEqual({ kind: 'agent', status: 'active', roles: [CONSUMER_ROLE[kind]] });
      expect((await failure(register(tenantAdmin, { consumerKind: kind, ownerPrincipalId: ownerId }))).code, `${kind}: a second live subscription`).toBe('23505');
    }
    const s = await statusOf();
    expect(s.subscriptions.consumers.every((c) => c.registeredInThisProcess), 'every consumer is registered into the dispatcher by its own module').toBe(true);
    expect(s.subscriptions.subscriptions.map((x) => x['status'])).toEqual(Array(6).fill('active'));
    expect(s.subscriptions.runtime).toMatchObject({ worker_running: true, scheduler_enabled: true });
    expect(scheduler.runningWorkers()).toContain(redisName(subscriptionQueueNameFor(T(), D())));
  }, 120_000);

  it('the subscriber session is the registry\'s: a foreign subscription, a wrong domain or a drifted consumer digest opens no session', async () => {
    const sessions = h.app.get(SubscriptionSessionService);
    const tw = subs.twins!;
    const ok = await sessions.openRunSession({ subscriptionId: tw.subscriptionId, kind: 'twins', tenantId: T(), domainId: D(), correlationId: uuidv7() });
    expect(ok.principalId).toBe(tw.principalId);
    expect(ok.kind).toBe('agent');
    await expect(sessions.openRunSession({ subscriptionId: uuidv7(), kind: 'twins', tenantId: T(), domainId: D(), correlationId: uuidv7() })).rejects.toBeInstanceOf(SubscriptionGrantRefused);
    await expect(sessions.openRunSession({ subscriptionId: tw.subscriptionId, kind: 'twins', tenantId: T(), domainId: uuidv7(), correlationId: uuidv7() })).rejects.toBeInstanceOf(SubscriptionGrantRefused);
    // The twins subscription cannot open a session as another kind (its digest is the twins consumer's).
    await expect(sessions.openRunSession({ subscriptionId: tw.subscriptionId, kind: 'forecasts', tenantId: T(), domainId: D(), correlationId: uuidv7() })).rejects.toBeInstanceOf(SubscriptionGrantRefused);
  });
});

describe('B6 · automatic updates through the six consumers, durable delivery, replay and restart, unrelated delivery preserved', () => {
  let gcEvent = ''; let mcEvent = ''; let evdC: { id: string; version: number }; let v2 = 0; let vDeclared = 0;

  it('EDGE RETRACTED: one operator act publishes GraphChanged with identities, relationships, reach, temporal scope and subscriptions; all six consumers update their worlds with no operator act (AU-MEM-0113)', async () => {
    const since = await mark();
    expect(await verificationOf(v1)).toBe('verified');
    await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', X1, 'graph'), T(), D(), X1, { payload: { reason: 'the routing assertion no longer holds: the carrier suspended the transit' } });
    const row = await publishedEvent('GraphChanged', 'edge.retracted', since);
    gcEvent = row.id;
    const p = row.payload as { schema: string; schema_version: string; change: Record<string, unknown>; identities: Array<Record<string, unknown>>; relationships: { edges: Array<Record<string, unknown>>; dependencies: Array<Record<string, unknown>> };
      objects: Record<string, unknown>; temporal: Record<string, unknown>; subscriptions: Array<{ subscription_id: string; consumer_kind: string }>; cause: Record<string, unknown> };
    expect(p.schema).toBe('GraphChanged'); expect(p.schema_version).toBe('v1');
    expect(p.identities.map((i) => [i['entity_id'], i['role'], i['canonical_name'], i['lifecycle_state']])).toEqual(expect.arrayContaining([[E2, 'subject', 'NORDWERK Magnet GmbH', 'active'], [E1, 'object', 'Bab el-Mandeb Strait', 'active']]));
    expect(p.relationships.edges[0]).toMatchObject({ edge_id: X1, state: 'retracted', predicate: 'ships_through', subject_entity_id: E2, object_entity_id: E1, valid_from: '2024-01-01T00:00:00.000Z', valid_to: null, claim_object_id: C1 });
    expect(p.relationships.edges[0]?.['retracted_at']).not.toBeNull();
    expect(p.relationships.dependencies.map((d) => [d['dependent_object_id'], d['depends_on_kind']])).toEqual(expect.arrayContaining([[A1, 'edge']]));
    expect(p.objects).toMatchObject({ walked: true, truncated: false, assumptions: [A1], decisions: [D1], forecasts: [F1], scenarios: [S1] });
    expect(p.temporal).toMatchObject({ valid_from: '2024-01-01T00:00:00.000Z', valid_to: null });
    expect(typeof p.temporal['known_at']).toBe('string');
    expect(new Set(p.subscriptions.map((s) => s.consumer_kind))).toEqual(new Set(CONSUMER_KINDS));
    expect(p.cause).toMatchObject({ action: 'graph.edge.retract', actor: ownerId, target_type: 'EDG', target_id: X1 });
    // Six deliveries, each applied by its own subscriber principal.
    const ds = await waitFor('the six deliveries applied', () => deliveriesFor(gcEvent), (rows) => allApplied(rows, 6), 120_000);
    await settle();
    for (const d of ds) expect(d, d.consumer_kind).toMatchObject({ deliveries: 1, attempts: d.items.length > 0 ? 1 : 0, last_error: null });
    const by = Object.fromEntries(ds.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
    // twins: the version whose boundary names E1 is unverified by event, once, naming the outbox event and the subscription.
    expect(by['twins']?.items).toEqual([`${twinId}@${v1}`]);
    expect(by['twins']?.items_applied.map((x) => x.effect)).toEqual(['version.unverified']);
    expect(await verificationOf(v1)).toBe('unverified');
    const te = await twinEvents(v1);
    expect(te.length).toBe(1);
    expect(te[0]?.details).toMatchObject({ outbox_event_id: gcEvent, subscription_id: subs.twins!.subscriptionId, automatic: true });
    // forecasts: the forecast for E1 resting on the assumption is marked for attention, never re-issued.
    expect(by['forecasts']?.items).toEqual([F1]);
    const f = (await sql<{ attention_state: string; state: string; attention_reason: string }>`select attention_state, state, attention_reason from prediction.forecasts_current where forecast_id = ${F1}::uuid`.execute(h.su)).rows[0];
    expect(f).toMatchObject({ attention_state: 'assumption_unverified', state: 'issued' });
    expect(f?.attention_reason).toMatch(/GraphChanged\/edge\.retracted/);
    expect((await sql<{ details: Record<string, unknown> }>`select details from prediction.forecast_events where forecast_id = ${F1}::uuid and event = 'forecast.attention'`.execute(h.su)).rows.map((r) => r.details['outbox_event_id'])).toEqual([gcEvent]);
    // scenarios: the scenario on that forecast is marked for attention; its branches untouched.
    expect(by['scenarios']?.items).toEqual([S1]);
    expect((await sql<{ attention_state: string; state: string }>`select attention_state, state from prediction.scenarios_current where scenario_id = ${S1}::uuid`.execute(h.su)).rows[0]).toEqual({ attention_state: 'input_unverified', state: 'active' });
    expect((await sql<{ event: string }>`select event from prediction.scenario_events where scenario_id = ${S1}::uuid`.execute(h.su)).rows.map((r) => r.event)).toEqual(['scenario.attention']);
    // decisions: the invalidated input is recorded on the package; the package's state is unchanged (C-004).
    expect(by['decisions']?.items).toEqual([P1]);
    const pe = (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from decision.package_events where package_id = ${P1}::uuid`.execute(h.su)).rows;
    expect(pe.map((e) => e.event)).toEqual(['input.invalidated']);
    expect((pe[0]?.details['via'] as string[]).join(' ')).toContain(D1);
    expect((await sql<{ state: string }>`select state from decision.packages_current where package_id = ${P1}::uuid`.execute(h.su)).rows[0]?.state).toBe('draft');
    // retrieval: the projections were re-verified from their event logs and the check recorded with what the change touched.
    expect(by['retrieval']?.items).toEqual(['projections']);
    const rc = (await sql<{ mismatched: number; touched: Record<string, unknown>; projections: unknown[] }>`select mismatched, touched, projections from graph.retrieval_checks where outbox_event_id = ${gcEvent}::uuid`.execute(h.su)).rows;
    expect(rc.length).toBe(1);
    expect(rc[0]).toMatchObject({ mismatched: 0, touched: { change_kind: 'edge.retracted', edges: [X1] } });
    expect(rc[0]?.projections.length).toBeGreaterThan(0);
    // memory mappings: a retraction moves no mapping basis — a complete delivery with nothing to propose.
    expect(by['memory-mappings']).toMatchObject({ items: [], items_applied: [] });
    expect(await deliveryEvents(gcEvent, 'twins')).toEqual(['received', 'applying', 'item.applied', 'applied']);
    // The ledger of one event through the governed route: six deliveries and every event of theirs.
    const ledger = await graph.subscriptionDelivery(h.req(owner, 'graph.read', 'SUB', gcEvent, 'graph'), T(), D(), gcEvent) as { deliveries: Array<{ consumer_kind: string }>; events: Array<{ event: string; subscription_id: string }> };
    expect(ledger.deliveries.length).toBe(6);
    expect(ledger.events.filter((e) => e.subscription_id === subs.twins!.subscriptionId).map((e) => e.event)).toEqual(['received', 'applying', 'item.applied', 'applied']);
    // Every effect was made by the subscriber principal of its kind, under its own action, through the pipeline.
    const aud = (await sql<{ actor: string; action: string }>`select distinct actor, action from audit.audit_events where action like '%.subscription.apply' and tenant_id = ${T()}::uuid and occurred_at::timestamptz >= ${since}`.execute(h.su)).rows;
    expect(new Set(aud.map((a) => a.action))).toEqual(new Set(['twin.subscription.apply', 'prediction.forecast.subscription.apply', 'prediction.scenario.subscription.apply', 'decision.subscription.apply', 'graph.retrieval.subscription.apply', 'graph.mapping.subscription.apply']));
    expect(aud.every((a) => Object.values(subs).some((s) => `principal:${s!.principalId}` === a.actor))).toBe(true);
    for (const kind of CONSUMER_KINDS) expect(aud.some((a) => a.actor === `principal:${subs[kind]!.principalId}`), `${kind}: its own principal acted`).toBe(true);
  }, 180_000);

  it('EVIDENCE CORRECTED: the apply publishes MemoryCorrected in the same transaction as CorrectionApplied; the citing twin version goes unverified; a mapping reconciliation is PROPOSED and a person decides it; CorrectionApplied still reaches its own path (AU-MEM-0114)', async () => {
    const up = await h.upload([{ filename: 'terms-c.csv', text: TERMS_CSV.replace('assumption', 'assumption (c)'), documentTime: '2024-01-12T00:00:00Z' }]);
    evdC = up[0] as { id: string; version: number };
    v2 = await admitTwin(elements(evdC), 'branch-c');
    expect(await verificationOf(v2)).toBe('verified');
    const I2 = uuidv7(); const C2 = uuidv7();
    await sql`insert into graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
      values (${I2}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'lei', '5299000NORDWERK00002', ${C2}::uuid, ${evdC.id}::uuid, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const since = await mark();
    const caseId = await applyCorrection([evdC.id], 'document c restated');
    const row = await publishedEvent('MemoryCorrected', 'evidence.corrected', since);
    mcEvent = row.id;
    const p = row.payload as { change: Record<string, unknown>; objects: Array<Record<string, unknown>>; claims: string[]; subscriptions: unknown[]; cause: Record<string, unknown>; temporal: Record<string, unknown> };
    expect(p.change).toMatchObject({ kind: 'evidence.corrected', correction_case_id: caseId });
    expect(p.objects.map((o) => [o['object_id'], o['object_type'], o['from_version'], o['to_version'], o['lifecycle_state']])).toEqual([[evdC.id, 'EVD', evdC.version, evdC.version + 1, 'superseded']]);
    expect(p.subscriptions.length).toBe(6);
    expect(p.cause).toMatchObject({ action: 'observation.correction.apply', actor: manager.principalId, target_type: 'COR', target_id: caseId });
    // The same transaction: CorrectionApplied and MemoryCorrected share the correlation and were published together.
    const applied = (await outboxRows('CorrectionApplied', (x) => x['case_id'] === caseId))[0];
    expect(applied?.status).toBe('published');
    expect(applied?.correlation_id).toBe(row.correlation_id);
    const ds = await waitFor('the six deliveries applied', () => deliveriesFor(mcEvent), (rows) => allApplied(rows, 6), 120_000);
    await settle();
    const by = Object.fromEntries(ds.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
    expect(by['twins']?.items).toEqual([`${twinId}@${v2}`]);
    expect(await verificationOf(v2)).toBe('unverified');
    expect((await twinEvents(v2))[0]?.details).toMatchObject({ outbox_event_id: mcEvent, automatic: true });
    // The mapping consumer proposed; nothing was rewritten.
    expect(by['memory-mappings']?.items).toEqual([`identifier:${I2}`]);
    const props = (await sql<{ reconciliation_id: string; subject_kind: string; subject_id: string; from_entity_id: string; to_entity_id: string | null; state: string; basis: string; cause_event_id: string }>`
      select reconciliation_id::text, subject_kind, subject_id::text, from_entity_id::text, to_entity_id::text, state, basis, cause_event_id::text from graph.mapping_reconciliations where cause_event_id = ${mcEvent}::uuid`.execute(h.su)).rows;
    expect(props.length).toBe(1);
    expect(props[0]).toMatchObject({ subject_kind: 'identifier', subject_id: I2, from_entity_id: E2, to_entity_id: null, state: 'proposed' });
    expect(props[0]?.basis).toMatch(/sourced from evidence corrected in case/);
    expect((await sql<{ entity_id: string }>`select entity_id::text from graph.entity_identifiers where identifier_id = ${I2}::uuid`.execute(h.su)).rows[0]?.entity_id, 'the identifier was not moved by a subscriber').toBe(E2);
    const listed = await graph.listMappings(h.req(owner, 'graph.read', 'MRC', null, 'graph'), T(), D(), { payload: {} }) as { mappings: Array<{ reconciliation_id: string }> };
    expect(listed.mappings.map((m) => m.reconciliation_id)).toContain(props[0]!.reconciliation_id);
    // A person decides — under the resolution manager's authority; a forecast owner alone cannot.
    const analyst = await h.principalWith(['forecast_owner'], 'forecast-only');
    expect((await failure(graph.decideMapping(h.req(analyst, 'graph.resolution.decide', 'MRC', props[0]!.reconciliation_id, 'graph'), T(), D(), props[0]!.reconciliation_id, { payload: { decision: 'reject', reason: 'not my call' } }))).status).toBe(403);
    const decided = await graph.decideMapping(h.req(owner, 'graph.resolution.decide', 'MRC', props[0]!.reconciliation_id, 'graph'), T(), D(), props[0]!.reconciliation_id,
      { payload: { decision: 'reject', reason: 'the corrected document restates the identifier unchanged' } }) as { mapping: { state: string } };
    expect(decided.mapping.state).toBe('rejected');
    expect((await sql<{ state: string; decided_by: string }>`select state, decided_by::text from graph.mapping_reconciliations where reconciliation_id = ${props[0]!.reconciliation_id}::uuid`.execute(h.su)).rows[0]).toEqual({ state: 'rejected', decided_by: ownerId });
    // UNRELATED DELIVERY PRESERVED: CorrectionApplied is not on the subscription queue; MemoryCorrected is not on the propagation queue.
    expect(await scheduler.subscriptionJobStateForTests(T(), D(), applied!.id)).toBeNull();
    expect(await scheduler.propagationJobStateForTests(T(), D(), mcEvent)).toBeNull();
    expect(await scheduler.propagationJobStateForTests(T(), D(), applied!.id), 'CorrectionApplied still reaches the propagation path (no agent registered here: it waits there)').not.toBeNull();
  }, 240_000);

  it('STRATEGY DECLARED: a declared object publishes GraphChanged with itself as the reach and its dependencies; an entity it merely rests on is not a changed identity, so no twin or forecast is touched (AU-MEM-0113)', async () => {
    vDeclared = await admitTwin(elements(evdB), 'branch-declared');
    const since = await mark();
    const declared = await graph.declare(h.req(owner, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: {
      objectType: 'ASU', title: 'The strait stays navigable', statement: 'declared after the retraction; rests on the strait entity',
      restsOn: [{ kind: 'entity', id: E1, rationale: 'the assumption is about this strait' }] } }) as { strategy: { objectId: string } };
    const row = await publishedEvent('GraphChanged', 'strategy.declared', since);
    const p = row.payload as { identities: Array<{ entity_id: string; role: string }>; relationships: { dependencies: Array<Record<string, unknown>> }; objects: { assumptions: string[]; walked: boolean } };
    expect(p.identities).toEqual([expect.objectContaining({ entity_id: E1, role: 'rests_on' })]);
    expect(p.relationships.dependencies).toEqual([expect.objectContaining({ dependent_object_id: declared.strategy.objectId, dependent_type: 'ASU', depends_on_kind: 'entity', depends_on_id: E1 })]);
    expect(p.objects).toMatchObject({ assumptions: [declared.strategy.objectId], walked: true });
    const ds = await waitFor('the six deliveries applied', () => deliveriesFor(row.id), (rows) => allApplied(rows, 6), 120_000);
    await settle();
    const by = Object.fromEntries(ds.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
    expect(by['twins']?.items, 'a declaration resting on the boundary entity changes nothing the twin rests on').toEqual([]);
    expect(await verificationOf(vDeclared)).toBe('verified');
    expect(by['retrieval']?.items).toEqual(['projections']);
    expect(by['memory-mappings']?.items).toEqual([]);
  }, 180_000);

  it('REDELIVERY: the same event delivered again applies nothing twice (AU-MEM-0115)', async () => {
    const re = await scheduler.enqueueSubscriptionDelivery(T(), D(), { event_id: gcEvent, event_type: 'GraphChanged', payload: {}, correlation_id: uuidv7(), causation_id: uuidv7(), tenant_id: T(), domain_id: D(), replay: null });
    expect(re).toEqual({ jobId: gcEvent, added: true, inFlight: null });
    const ds = await waitFor('the redelivery received by all six', () => deliveriesFor(gcEvent), (rows) => rows.every((d) => d.deliveries >= 2), 60_000);
    await settle();
    for (const d of ds) expect(d, d.consumer_kind).toMatchObject({ state: 'applied', deliveries: 2, attempts: d.items.length > 0 ? 1 : 0 });
    expect((await twinEvents(v1)).length).toBe(1);
    expect((await sql<{ n: string }>`select count(*)::text n from prediction.forecast_events where forecast_id = ${F1}::uuid and event = 'forecast.attention'`.execute(h.su)).rows[0]?.n).toBe('1');
    expect((await sql<{ n: string }>`select count(*)::text n from decision.package_events where package_id = ${P1}::uuid`.execute(h.su)).rows[0]?.n).toBe('1');
    expect((await sql<{ n: string }>`select count(*)::text n from graph.retrieval_checks where outbox_event_id = ${gcEvent}::uuid`.execute(h.su)).rows[0]?.n).toBe('1');
    expect(await deliveryEvents(gcEvent, 'twins')).toEqual(['received', 'applying', 'item.applied', 'applied', 'received']);
  }, 90_000);

  it('RESTART with an empty Redis: the domain is served again and nothing finished is re-driven (AU-MEM-0115)', async () => {
    await scheduler.obliterateSubscriptionsForTests(T(), D());
    await restart();
    const report = dispatcher.lastReconciliation();
    expect(report, `startup reconciliation did not run: ${JSON.stringify(dispatcher.lastFailureSeen())}`).not.toBeNull();
    expect(report?.domains.find((d) => d.tenantId === T() && d.domainId === D())?.subscriptions).toBe(6);
    expect(report?.reDriven.filter((e) => e.tenantId === T() && e.domainId === D())).toEqual([]);
    expect(scheduler.runningWorkers()).toContain(redisName(subscriptionQueueNameFor(T(), D())));
    expect(dispatcher.registeredKinds().length).toBe(6);
    expect((await deliveriesFor(gcEvent)).every((d) => d.state === 'applied' && d.deliveries === 2)).toBe(true);
  }, 180_000);

  /** A REAL INTERRUPTION: the process stops dead at the fault point, Redis is lost with it, the process restarts. */
  const interruptedThenRestarted = async (label: string, eventId: string, strandedWhen: (rows: Delivery[]) => boolean, snapshot: () => Promise<unknown> = async () => null) => {
    const stranded = await waitFor(`${label}: the deliveries received and the process stopped`, () => deliveriesFor(eventId), strandedWhen, 60_000);
    await new Promise((r) => setTimeout(r, 1500)); // nothing more happens
    const before = await deliveriesFor(eventId);
    expect(JSON.stringify(before)).toBe(JSON.stringify(stranded));
    const world = await snapshot(); // what the world looked like while the process was "dead"
    expect(await scheduler.abandonSubscriptionWorkerForTests(T(), D())).toBe(true);
    await scheduler.obliterateSubscriptionsForTests(T(), D());
    expect(await scheduler.subscriptionJobStateForTests(T(), D(), eventId), 'the queue still holds the job after the loss').toBeNull();
    await restart();
    const report = dispatcher.lastReconciliation();
    const reDriven = report?.reDriven.find((e) => e.eventId === eventId);
    expect(reDriven, `the stranded event was not re-driven: ${JSON.stringify(report?.reDriven)}`).toBeDefined();
    const after = await waitFor(`${label}: every delivery applied after the restart`, () => deliveriesFor(eventId), (rows) => allApplied(rows, 6), 120_000);
    await settle();
    return { before, world, reDriven: reDriven!, after };
  };

  it('INTERRUPTED AFTER RECEIPT, queue lost, process restarted: the stranded deliveries are re-driven; every effect once (AU-MEM-0115)', async () => {
    const v3 = await admitTwin(elements(evdB), 'branch-j');
    dispatcher.armFaultForTests('interrupt_after_receipt');
    const since = await mark();
    const edgeId = await retractFreshEdge('supplies', 'the supply relationship no longer holds; the process dies after receipt');
    const row = await publishedEvent('GraphChanged', 'edge.retracted', since);
    expect((row.payload as { relationships: { edges: Array<{ edge_id: string }> } }).relationships.edges[0]?.edge_id).toBe(edgeId);
    const r = await interruptedThenRestarted('after receipt', row.id, (rows) => rows.length === 6 && rows.every((d) => d.state === 'received' && d.attempts === 0));
    expect(r.reDriven.previous).toEqual(Array(6).fill('received'));
    for (const d of r.after) expect(d, d.consumer_kind).toMatchObject({ state: 'applied', deliveries: 2, attempts: d.items.length > 0 ? 1 : 0 });
    const by = Object.fromEntries(r.after.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
    expect(new Set(by['twins']?.items), 'the boundary-bound verified versions (E1 is an end of the retracted edge)').toEqual(new Set([`${twinId}@${vDeclared}`, `${twinId}@${v3}`]));
    expect((await twinEvents(v3)).length).toBe(1);
    expect((await twinEvents(vDeclared)).length).toBe(1);
    expect(await deliveryEvents(row.id, 'twins')).toEqual(['received', 'received', 'applying', 'item.applied', 'item.applied', 'applied']);
    expect((await sql<{ n: string }>`select count(*)::text n from graph.retrieval_checks where outbox_event_id = ${row.id}::uuid`.execute(h.su)).rows[0]?.n).toBe('1');
  }, 300_000);

  it('INTERRUPTED AFTER THE FIRST COMMITTED ITEM, queue lost, process restarted: the delivery resumes at the second item; no duplicate effect; the other subscriptions\' finished deliveries untouched (AU-MEM-0115)', async () => {
    const up = await h.upload([{ filename: 'terms-d.csv', text: TERMS_CSV.replace('assumption', 'assumption (d)'), documentTime: '2024-01-13T00:00:00Z' }]);
    const evdD = up[0] as { id: string; version: number };
    const v4 = await admitTwin(elements(evdD), 'branch-d1');
    const v5 = await admitTwin(elements(evdD), 'branch-d2');
    dispatcher.armFaultForTests('interrupt_after_first_item', 'twins');
    const since = await mark();
    await applyCorrection([evdD.id], 'document d restated; the process dies after the first twin item');
    const row = await publishedEvent('MemoryCorrected', 'evidence.corrected', since);
    const r = await interruptedThenRestarted('after the first item', row.id, (rows) => rows.length === 6 && rows.find((d) => d.consumer_kind === 'twins')?.items_applied.length === 1
      && rows.filter((d) => d.consumer_kind !== 'twins').every((d) => d.state === 'applied'),
      async () => ({ v4: await verificationOf(v4), v5: await verificationOf(v5) }));
    const twBefore = r.before.find((d) => d.consumer_kind === 'twins')!;
    expect(twBefore).toMatchObject({ state: 'received', deliveries: 1, attempts: 1 });
    expect(twBefore.items).toEqual([`${twinId}@${v4}`, `${twinId}@${v5}`]);
    expect(twBefore.items_applied.map((x) => x.item)).toEqual([`${twinId}@${v4}`]);
    expect(r.world, 'while the process was dead: the first item committed, the second not applied').toEqual({ v4: 'unverified', v5: 'verified' });
    expect(r.reDriven.previous).toEqual(['received']);
    const twAfter = r.after.find((d) => d.consumer_kind === 'twins')!;
    // One attempt: the resumed delivery continues the same apply from its checkpoint (attempts count first items, not deliveries).
    expect(twAfter).toMatchObject({ state: 'applied', deliveries: 2, attempts: 1 });
    expect(twAfter.items_applied.map((x) => [x.item, x.effect])).toEqual([[`${twinId}@${v4}`, 'version.unverified'], [`${twinId}@${v5}`, 'version.unverified']]);
    expect((await twinEvents(v4)).length, 'the first item was applied twice').toBe(1);
    expect((await twinEvents(v5)).length).toBe(1);
    expect(await deliveryEvents(row.id, 'twins')).toEqual(['received', 'applying', 'item.applied', 'received', 'item.applied', 'applied']);
    // The five deliveries applied before the interruption were NOT re-received: the re-drive is scoped to the stranded subscription (0064).
    for (const d of r.after.filter((d) => d.consumer_kind !== 'twins')) expect(d, d.consumer_kind).toMatchObject({ state: 'applied', deliveries: 1, attempts: d.items.length > 0 ? 1 : 0 });
    expect((await sql<{ n: string }>`select count(*)::text n from graph.retrieval_checks where outbox_event_id = ${row.id}::uuid`.execute(h.su)).rows[0]?.n).toBe('1');
  }, 300_000);

  it('NO CONFLICT WITH A LIVE WORKER: a reconciliation run while a delivery is in flight leaves its job alone', async () => {
    const v6 = await admitTwin(elements(evdB), 'branch-m');
    dispatcher.armFaultForTests('slow_before_item', 'twins');
    const since = await mark();
    await retractFreshEdge('insures', 'the insurance relationship no longer holds; the twin consumer is slow');
    const row = await publishedEvent('GraphChanged', 'edge.retracted', since);
    await waitFor('the deliveries received', () => deliveriesFor(row.id), (rows) => rows.length === 6, 60_000);
    const report = await dispatcher.reconcile('control: reconciliation against a live worker', false);
    expect(report.reDriven.map((e) => e.eventId)).not.toContain(row.id);
    expect(report.inFlight.find((e) => e.eventId === row.id)?.jobState).toBe('active');
    const done = await waitFor('the live delivery completed', () => deliveriesFor(row.id), (rows) => allApplied(rows, 6), 120_000);
    await settle();
    expect(done.find((d) => d.consumer_kind === 'twins')).toMatchObject({ deliveries: 1, attempts: 1, items: [`${twinId}@${v6}`] });
    expect((await twinEvents(v6)).length).toBe(1);
  }, 180_000);

  it('REPLAY: the twins subscription replayed from the beginning re-checks every event and duplicates nothing; the other subscriptions are untouched (AU-MEM-0116)', async () => {
    const tw = subs.twins!;
    const othersBefore = (await sql<{ n: string }>`select count(*)::text n from graph.subscription_delivery_events e join graph.subscriptions s on s.subscription_id = e.subscription_id where s.consumer_kind <> 'twins' and s.tenant_id = ${T()}::uuid`.execute(h.su)).rows[0]?.n;
    const twinEventsBefore = (await sql<{ n: string }>`select count(*)::text n from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified'`.execute(h.su)).rows[0]?.n;
    expect((await failure(graph.replaySubscription(h.req(owner, 'graph.subscription.replay', 'SUB', tw.subscriptionId, 'platform.administration'), T(), D(), tw.subscriptionId, { payload: { reason: 'an owner cannot replay' } }))).status).toBe(403);
    const r = await graph.replaySubscription(h.req(domainAdmin, 'graph.subscription.replay', 'SUB', tw.subscriptionId, 'platform.administration'), T(), D(), tw.subscriptionId,
      { payload: { reason: 'control: re-check every graph and memory change against the twins' } }) as { replayed: number; events: string[] };
    expect(r.events.length).toBeGreaterThanOrEqual(5);
    expect(r.replayed).toBe(r.events.length);
    const reopened = await waitFor('every replayed delivery applied again', () => sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, replay_seq, last_error
        from graph.subscription_deliveries where subscription_id = ${tw.subscriptionId}::uuid order by outbox_created_at`.execute(h.su).then((x) => x.rows),
      (rows) => rows.length === r.events.length && rows.every((d) => d.state === 'applied' && d.replay_seq === 1), 120_000);
    await settle();
    for (const d of reopened) {
      expect(d.items_applied.every((x) => x.effect === 'version.already_unverified' || x.effect === 'version.unverified')).toBe(true);
      expect(d.items_applied.filter((x) => x.effect === 'version.unverified').length, `replay re-marked a version for ${d.event_id}`).toBe(0);
    }
    expect((await sql<{ n: string }>`select count(*)::text n from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified'`.execute(h.su)).rows[0]?.n).toBe(twinEventsBefore);
    expect(await deliveryEvents(gcEvent, 'twins')).toEqual(['received', 'applying', 'item.applied', 'applied', 'received', 'replayed', 'received', 'applying', 'item.applied', 'applied']);
    expect((await sql<{ n: string }>`select count(*)::text n from graph.subscription_delivery_events e join graph.subscriptions s on s.subscription_id = e.subscription_id where s.consumer_kind <> 'twins' and s.tenant_id = ${T()}::uuid`.execute(h.su)).rows[0]?.n).toBe(othersBefore);
    expect((await sql<{ replay_seq: number; checkpoint_event_id: string | null }>`select replay_seq, checkpoint_event_id::text from graph.subscriptions where subscription_id = ${tw.subscriptionId}::uuid`.execute(h.su)).rows[0]?.replay_seq).toBe(1);
  }, 240_000);

  it('PAUSE and RESUME: a paused subscription receives nothing; a resume re-drives what was published meanwhile; a revoked one is gone for good (AU-MEM-0116)', async () => {
    const fc = subs.forecasts!;
    // Reset the forecast's attention so a fresh event has an item for the forecast consumer.
    await sql`update prediction.forecasts_current set attention_state = 'none', attention_reason = null where forecast_id = ${F1}::uuid`.execute(h.su);
    await graph.pauseSubscription(h.req(domainAdmin, 'graph.subscription.control', 'SUB', fc.subscriptionId, 'platform.administration'), T(), D(), fc.subscriptionId, { payload: { reason: 'control: pause the forecast consumer' } });
    const since = await mark();
    await retractFreshEdge('charters', 'the charter relationship no longer holds; the forecast consumer is paused');
    const row = await publishedEvent('GraphChanged', 'edge.retracted', since);
    const ds = await waitFor('the five active deliveries applied', () => deliveriesFor(row.id), (rows) => rows.length === 5 && rows.every((d) => d.state === 'applied'), 120_000);
    await settle();
    expect(ds.map((d) => d.consumer_kind)).not.toContain('forecasts');
    expect((await sql<{ attention_state: string }>`select attention_state from prediction.forecasts_current where forecast_id = ${F1}::uuid`.execute(h.su)).rows[0]?.attention_state, 'paused: not marked').toBe('none');
    await graph.resumeSubscription(h.req(domainAdmin, 'graph.subscription.control', 'SUB', fc.subscriptionId, 'platform.administration'), T(), D(), fc.subscriptionId, { payload: { reason: 'control: resume the forecast consumer' } });
    const after = await waitFor('the forecast delivery re-driven after the resume', () => deliveriesFor(row.id), (rows) => rows.length === 6 && rows.every((d) => d.state === 'applied'), 120_000);
    await settle();
    expect(after.find((d) => d.consumer_kind === 'forecasts')).toMatchObject({ deliveries: 1, items: [F1] });
    expect((await sql<{ attention_state: string }>`select attention_state from prediction.forecasts_current where forecast_id = ${F1}::uuid`.execute(h.su)).rows[0]?.attention_state).toBe('assumption_unverified');
    // Revocation: the subscription is gone; the domain is still served for the others; a new one of the kind may be registered.
    await graph.revokeSubscription(h.req(domainAdmin, 'graph.subscription.control', 'SUB', fc.subscriptionId, 'platform.administration'), T(), D(), fc.subscriptionId, { payload: { reason: 'control: revoke the forecast consumer' } });
    expect((await sql<{ status: string }>`select status from graph.subscriptions where subscription_id = ${fc.subscriptionId}::uuid`.execute(h.su)).rows[0]?.status).toBe('revoked');
    await expect(h.app.get(SubscriptionSessionService).openRunSession({ subscriptionId: fc.subscriptionId, kind: 'forecasts', tenantId: T(), domainId: D(), correlationId: uuidv7() })).rejects.toBeInstanceOf(SubscriptionGrantRefused);
    const again = await register(tenantAdmin, { consumerKind: 'forecasts', ownerPrincipalId: ownerId, backlog: 'replay' });
    subs.forecasts = { subscriptionId: again.subscription.subscriptionId, principalId: again.subscription.principalId };
    expect(again.served.reDriven, 'the backlog was replayed to the new subscription').toBeGreaterThanOrEqual(5);
    await waitFor('the backlog applied to the new forecast subscription', () => sql<{ n: string }>`select count(*)::text n from graph.subscription_deliveries where subscription_id = ${again.subscription.subscriptionId}::uuid and state = 'applied'`.execute(h.su).then((x) => Number(x.rows[0]?.n)), (n) => n >= 5, 120_000);
    await settle();
  }, 300_000);

  it('THE GOVERNED PATH: every 0063 port refuses without its action; a kind cannot drive another kind\'s port; a foreign principal cannot set a delivery\'s items; the new tables are under forced RLS (AU-MEM-0117)', async () => {
    const tw = subs.twins!;
    const commitDb = h.app.get<import('../../src/shared/db.js').Db>((await import('../../src/shared/shared.module.js')).COMMIT_DB);
    const bare = async (q: ReturnType<typeof sql>) => failure(commitDb.transaction().execute(async (tx) => { await q.execute(tx); }));
    expect((await bare(sql`select twin.apply_subscription_mark(${twinId}::uuid, ${T()}::uuid, ${D()}::uuid, ${v1}::int, 'x', ${uuidv7()}::uuid, ${tw.subscriptionId}::uuid, ${ownerId}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select prediction.mark_forecast_attention(${F1}::uuid, ${T()}::uuid, ${D()}::uuid, 'x', ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${ownerId}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select prediction.mark_scenario_attention(${S1}::uuid, ${T()}::uuid, ${D()}::uuid, 'x', ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${ownerId}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select decision.note_input_invalidated(${P1}::uuid, ${T()}::uuid, ${D()}::uuid, '{}'::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${ownerId}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select graph.record_retrieval_check(${uuidv7()}::uuid, ${gcEvent}::uuid, ${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, '{}'::jsonb, ${ownerId}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select graph.propose_mapping_reconciliation(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, 'identifier', ${I1}::uuid, ${E2}::uuid, null, 'x', ${gcEvent}::uuid, ${uuidv7()}::uuid, ${ownerId}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select graph.decide_mapping_reconciliation(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, 'accepted', 'not authorised', ${ownerId}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select graph.register_subscription(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, 'twins', array['GraphChanged'], '{}'::jsonb, ${ownerId}::uuid, '1.0.0', ${'a'.repeat(64)}, ${ownerId}::uuid, '{}'::jsonb, ${ownerId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select graph.set_subscription_status(${tw.subscriptionId}::uuid, ${T()}::uuid, ${D()}::uuid, 'revoked', 'not authorised', ${ownerId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select graph.subscription_replay(${tw.subscriptionId}::uuid, ${T()}::uuid, ${D()}::uuid, null, null, 'not authorised', ${ownerId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select graph.subscription_delivery_receive(${gcEvent}::uuid, ${T()}::uuid, ${D()}::uuid, 'GraphChanged', 'edge.retracted', now(), null::uuid[], ${uuidv7()}::uuid)`)).code).toBe('42501');
    expect((await bare(sql`select graph.subscription_delivery_finish(${gcEvent}::uuid, ${tw.subscriptionId}::uuid, ${T()}::uuid, ${D()}::uuid, 'applied', null)`)).code).toBe('42501');
    expect((await bare(sql`select graph.subscription_delivery_items(${gcEvent}::uuid, ${tw.subscriptionId}::uuid, ${T()}::uuid, ${D()}::uuid, '["x"]'::jsonb, 'twin.subscription.apply')`)).code).toBe('42501');
    expect((await bare(sql`select graph.subscription_delivery_items(${gcEvent}::uuid, ${tw.subscriptionId}::uuid, ${T()}::uuid, ${D()}::uuid, '["x"]'::jsonb, 'graph.read')`)).code).toBe('22023');
    expect((await bare(sql`select graph.subscription_item_begin(${gcEvent}::uuid, ${tw.subscriptionId}::uuid, ${T()}::uuid, ${D()}::uuid, 'x', 'twin.subscription.apply')`)).code).toBe('42501');
    expect((await bare(sql`select graph.subscriptions_matching(${T()}::uuid, ${D()}::uuid, 'GraphChanged', 'edge.retracted')`)).code, 'matching is total: outside a DOMAIN context it answers nothing, not an error').toBeNull();
    // A subscriber of one kind cannot drive another kind's port even inside a governed write of its own action.
    const sessions = h.app.get(SubscriptionSessionService);
    const twinPrincipal = await sessions.openRunSession({ subscriptionId: tw.subscriptionId, kind: 'twins', tenantId: T(), domainId: D(), correlationId: uuidv7() });
    const { PredictionCapability } = await import('../../src/prediction/prediction.capabilities.js');
    const cross = await failure(h.pipeline.write(h.env(twinPrincipal, 'twin.subscription.apply', 'FCT', F1, 'twin'), twinPrincipal,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'twin.subscription.apply', objectType: 'FCT', objectId: F1 }, PredictionCapability.subscriber,
      async (cap) => {
        await cap.markForecastAttention({ forecastId: F1, tenantId: T(), domainId: D(), reason: 'cross-kind', outboxEventId: gcEvent, subscriptionId: tw.subscriptionId, actor: twinPrincipal.principalId, correlationId: uuidv7() });
        return { result: null, targetType: 'FCT', targetId: F1, targetVersion: null, outboxEvent: null };
      }));
    expect(cross.code).toBe('42501');
    // The twin subscriber cannot act under the forecast action at all: the PDP refuses before any port is reached.
    const pdp = await failure(h.pipeline.write(h.env(twinPrincipal, 'prediction.forecast.subscription.apply', 'FCT', F1, 'prediction'), twinPrincipal,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.forecast.subscription.apply', objectType: 'FCT', objectId: F1 }, PredictionCapability.subscriber,
      async () => ({ result: null, targetType: 'FCT', targetId: F1, targetVersion: null, outboxEvent: null })));
    expect(pdp.status).toBe(403);
    // Forced RLS on every 0063 table.
    const rls = (await sql<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>`select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'graph' and c.relname in ('subscriptions', 'subscription_events', 'subscription_deliveries', 'subscription_delivery_events', 'retrieval_checks', 'mapping_reconciliations') order by 1`.execute(h.su)).rows;
    expect(rls.length).toBe(6);
    expect(rls.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
    // A misrouted job (another domain's event on this queue) fails closed and the worker lives on.
    const jobId = await scheduler.addSubscriptionJobForTests(T(), D(), { event_id: uuidv7(), event_type: 'GraphChanged', payload: {}, correlation_id: uuidv7(), causation_id: uuidv7(), tenant_id: uuidv7(), domain_id: uuidv7(), replay: null });
    // The state flips before the reason lands on the job hash (the B1 observation): wait for both.
    const st = await waitFor('the misrouted job failed', () => scheduler.subscriptionJobStateForTests(T(), D(), jobId ?? ''), (s) => s?.state === 'failed' && typeof s.failedReason === 'string' && s.failedReason.length > 0, 30_000);
    expect(st?.failedReason ?? '').toMatch(/scope does not match/);
    expect((await statusOf()).subscriptions.runtime.worker_running).toBe(true);
    // The propagation queue never saw a subscription event.
    expect(scheduler.runningWorkers().filter((w) => w === redisName(propagationQueueNameFor(T(), D()))).length).toBe(0);
  }, 120_000);
});
