/**
 * CP-6 batch B7 — the subscription machinery's second batch (migration 0064) on real Redis, the real outbox
 * publisher and the real database:
 *
 *   UNRESOLVED WORK STAYS UNRESOLVED (Codex finding 3, AU-MEM-0118) — a projection mismatch leaves the retrieval
 *     item open: the check is recorded, the delivery ends `unresolved` (unresolved_dependency → human_review), a
 *     re-drive re-checks it (still unresolved, a second check), a restart with an empty Redis re-checks it (a
 *     third), the tick leaves it alone inside the re-check interval, and only the operator's repair followed by a
 *     passing check applies it; the twin item on the same event was applied once throughout.
 *   claim.corrected THROUGH THE REVIEW ROUTE (AU-MEM-0114's remaining clause) — a claim corrected by review
 *     publishes MemoryCorrected beside ClaimReviewed; the memory-mappings consumer proposes the EDGE the claim
 *     asserted, the RESOLUTION of its mention and the IDENTIFIER sourced from it; an edge resting on corrected
 *     evidence is proposed on the correction route.
 *   BACKLOG ONCE (AU-MEM-0119) — a subscription registered with backlog 'replay' receives each past event exactly
 *     once; one registered with 'leave' receives none of them and the next new event.
 *   A DECLARED PARTITION AND SEQUENCE (AU-DP-0071) — every outbox row carries the tenant's partition and a
 *     sequence that is the commit order even under concurrent writers; the domain's deliveries are received in
 *     sequence order; a replay from a sequence re-drives exactly the rows after it; the cursor carries the sequence.
 *   FAILURE STATES WITH THEIR CLASS AND ROUTE (AU-MEM-0039) — consumer unavailable (retry at re-registration),
 *     authority disputed by a pause mid-delivery (human review; resume re-drives), budget (human review), an input
 *     invalidated on an EXECUTED decision (exposed, compensation the owner's), a withdrawal against a LEGAL HOLD
 *     (the case fails before any object is touched, challenge).
 *   TELEMETRY (AU-MEM-0041) — queue wait, apply time, end-to-end age, retries, unresolved dependencies and the
 *     failure class per delivery, read through the status route; one measurement captured.
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
import { SchedulerService, redisName, subscriptionQueueNameFor } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { CONSUMER_KINDS, type ConsumerKind } from '../../src/graph/subscriptions/graph-change.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { IntelligenceController } from '../../src/intelligence/intelligence.controller.js';
import { RECORD_FILES, TERMS_CSV, observedInventory, observedShipments, assumedTerms } from './phase5-fixtures.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness;
let twins: TwinController; let graph: GraphController; let observation: ObservationController; let intelligence: IntelligenceController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let owner: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal;
let ownerId = ''; let twinId = '';
let evdB: { id: string; version: number };
let records: { inv: { id: string; version: number }; ship: { id: string; version: number }; terms: { id: string; version: number } };
const E1 = uuidv7(); const E2 = uuidv7(); const D1 = uuidv7(); const P1 = uuidv7();
const subs: Partial<Record<ConsumerKind, { subscriptionId: string; principalId: string }>> = {};
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const elements = (shock: { id: string; version: number }) =>
  [...observedInventory(records.inv), ...observedShipments(records.ship, '2024-01-11', ['SYN-SHIP-4471', 'SYN-SHIP-4472']), ...assumedTerms(records.terms, shock)];

async function bind(app: Phase4Harness['app']): Promise<void> {
  const { TwinController: Tw } = await import('../../src/twin/twin.controller.js');
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { IntelligenceController: I } = await import('../../src/intelligence/intelligence.controller.js');
  twins = app.get(Tw); graph = app.get(G); observation = app.get(O); intelligence = app.get(I);
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
async function submitCorrection(evdIds: string[], kind: 'correction' | 'withdrawal', reason: string): Promise<string> {
  const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(), kind, channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  return opened.correction.caseId;
}
const applyCase = (caseId: string, evdIds: string[], reason: string) =>
  observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId, { payload: { decision: 'apply', affectedEvdIds: evdIds, reason } }) as Promise<{ correction: Record<string, unknown> }>;
const register = (kind: ConsumerKind, extra: Record<string, unknown> = {}) =>
  graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(), { payload: { consumerKind: kind, ownerPrincipalId: ownerId, ...extra } as never }) as Promise<{
    subscription: { subscriptionId: string; principalId: string; served_from?: string }; served: { workerRunning: boolean; reDriven: number } }>;
const statusOf = () => graph.subscriptionStatus(h.req(owner, 'graph.read', 'SUB', null, 'graph'), T(), D()) as Promise<{ subscriptions: {
  subscriptions: Array<Record<string, unknown>>; telemetry: { deliveries: Array<Record<string, unknown>>; open_failure_states: Array<Record<string, unknown>> } } }>;
async function retractFreshEdge(predicate: string, reason: string, evidenceId = evdB.id, claimId = uuidv7()): Promise<string> {
  const edgeId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, ${predicate}, ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimId}::uuid, 1, ${evidenceId}::uuid, ${sha256(evidenceId)}, 'replay', 0.9, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason } });
  return edgeId;
}

type Delivery = { event_id: string; subscription_id: string; consumer_kind: string; state: string; deliveries: number; attempts: number; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; resolved_after_checks: number | null; details: Record<string, unknown> }>;
  items_unresolved: Array<{ item: string; effect: string; effect_ref: string | null; reason: string; checks: number }>; failure_class: string | null; disposition: string | null; unresolved_since: Date | null; last_error: string | null; partition_seq: string | null };
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, items_unresolved, failure_class, disposition, unresolved_since, last_error, partition_seq::text
     from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(h.su)).rows;
const deliveryEvents = async (eventId: string, kind: string): Promise<string[]> =>
  (await sql<{ event: string }>`select e.event from graph.subscription_delivery_events e join graph.subscriptions s on s.subscription_id = e.subscription_id
     where e.outbox_event_id = ${eventId}::uuid and s.consumer_kind = ${kind} order by e.occurred_at, e.event_id`.execute(h.su)).rows.map((r) => r.event);
const checksFor = async (eventId: string) =>
  (await sql<{ check_id: string; mismatched: number }>`select check_id::text, mismatched from graph.retrieval_checks where outbox_event_id = ${eventId}::uuid order by checked_at`.execute(h.su)).rows;
const outboxRows = async (eventType: string, where: (p: Record<string, unknown>) => boolean = () => true) =>
  (await sql<{ id: string; status: string; payload: Record<string, unknown>; correlation_id: string; created_at: Date; partition_key: string; partition_seq: string; schema_version: string }>`
     select id::text, status, payload, correlation_id::text, created_at, partition_key, partition_seq::text, schema_version from objects.object_outbox
     where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by created_at`.execute(h.su)).rows.filter((r) => where(r.payload));
const twinEvents = async (version: number) =>
  (await sql<{ details: Record<string, unknown> }>`select details from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified' and (details ->> 'version')::int = ${version} order by occurred_at`.execute(h.su)).rows;
const verificationOf = async (version: number) =>
  (await sql<{ verification_state: string }>`select verification_state from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${version}`.execute(h.su)).rows[0]?.verification_state;
const allTerminal = (rows: Delivery[], n: number) => rows.length === n && rows.every((d) => d.state !== 'received');
const allApplied = (rows: Delivery[], n: number) => rows.length === n && rows.every((d) => d.state === 'applied');
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms; let last: X | undefined;
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
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(h.su)).rows[0]!.t;
const publishedEvent = (eventType: 'GraphChanged' | 'MemoryCorrected', kind: string, after: Date) =>
  waitFor(`the ${eventType}/${kind} row published`, () => outboxRows(eventType, (p) => (p['change'] as { kind: string }).kind === kind),
    (rows) => rows.some((r) => r.status === 'published' && r.created_at >= after)).then((rows) => rows.filter((r) => r.created_at >= after).at(-1)!);
const registeredKinds = () => Object.keys(subs).length;

/** A REL claim as the extraction would have admitted it (its full lineage, so a corrected version passes the schema), queued for review. */
async function seedQueuedClaim(a: { subject: string; objectValue: string; evidence: { id: string; version: number } }): Promise<{ claimId: string; caseId: string; runId: string; methodId: string }> {
  const claimId = uuidv7(); const caseId = uuidv7(); const runId = uuidv7(); const methodId = uuidv7();
  const lineage = { method_key: 'fixture-rel', method_id: methodId, model_id: 'fixture-model', model_weights_digest: sha256('w'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: sha256('d'), mode: 'replay', call_id: null, run_id: runId,
    evidence_object_id: a.evidence.id, evidence_digest: sha256(a.evidence.id), byte_start: 0, byte_end: 4, extraction_identity: sha256(claimId), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  const payload = { claim_kind: 'relationship', subject: a.subject, predicate: 'ships_through', object_value: a.objectValue, confidence: 0.55, lineage, review: { state: 'queued', reason: 'confidence below the floor', decider: null } };
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, truth_state, synthetic_state, classification, purpose_scope, schema_ref, audit_correlation_id, content_digest, method_ref, recorded_at, observation_time, time_precision, source_clock_quality, source_object_ids, evidence_refs, payload)
    values (${claimId}::uuid, 'REL', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', 'extracted', false, 'internal', 'intelligence', 'REL@v1', ${uuidv7()}::uuid, ${sha256(claimId)}, 'fixture-extraction@1.0.0', clock_timestamp(), clock_timestamp(), 'exact', 'trusted',
            ${JSON.stringify([a.evidence.id])}::jsonb, ${JSON.stringify([`EVD:${a.evidence.id}@${a.evidence.version}`])}::jsonb, ${JSON.stringify(payload)}::jsonb)`.execute(h.su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${a.evidence.id}::uuid, ${sha256(a.evidence.id)}, 0, 4, 0.55, ${lineage.retrieval_decision_id}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  // The run the extraction would have recorded (decide_review joins the case to its run for the agent's principal).
  await sql`insert into intelligence.runs_current (run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id, mode, state, finished_at, evidence_read, claims_admitted, correlation_id)
    values (${runId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${methodId}::uuid, 1, ${ownerId}::uuid, 'replay', 'completed', clock_timestamp(), 1, 1, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, correlation_id)
    values (${caseId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${claimId}::uuid, 1, ${runId}::uuid, ${methodId}::uuid, 'below_review_threshold', 0.55, 'queued', ${uuidv7()}::uuid)`.execute(h.su);
  return { claimId, caseId, runId, methodId };
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  await bind(h.app);
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'forecast_owner', 'simulation_operator', 'resolution_manager', 'decision_owner'], 'twin-owner');
  manager = await h.principalWith(['collection_manager'], 'collection-manager');
  reviewer = await h.principalWith(['extraction_manager'], 'extraction-manager');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'tenant-admin', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'domain-admin');
  ownerId = owner.principalId;
  await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  const up = await h.upload([...RECORD_FILES(), { filename: 'routes-and-terms-2024Q1-restated.csv', text: TERMS_CSV.replace('assumption', 'assumption (restated)'), documentTime: '2024-01-11T00:00:00Z' }]);
  records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
  evdB = up[3] as typeof evdB;
  for (const [id, type, name] of [[E1, 'place', 'Bab el-Mandeb Strait'], [E2, 'organization', 'NORDWERK Magnet GmbH']] as const) {
    // With their events, so the projection has a log to be rebuilt from (the retrieval check compares the two).
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${ownerId}::uuid, '{}'::jsonb, ${uuidv7()}::uuid)`.execute(h.su);
  }
  await sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
    values (${D1}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'DEC', 1, 'Keep the Ningbo → Regensburg routing', 'fixture decision object', 'active', 'not_applicable', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${D1}::uuid, 'DEC', 'entity', ${E1}::uuid, 'fixture dependency: the decision rests on the strait', 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  // An EXECUTED decision: committed, with its committed version and decision instant (the table's own invariant).
  await sql`insert into decision.packages_current (package_id, scope, tenant_id, domain_id, decision_object_id, title, statement, owner_principal_id, state, current_version, committed_version, decided_at, declared_by, correlation_id)
    values (${P1}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${D1}::uuid, 'Routing decision', 'fixture decision package, committed', ${ownerId}::uuid, 'committed', 1, 1, clock_timestamp(), ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into graph.identifier_systems (scope, tenant_id, domain_id, system_key, authority, description, is_authoritative, registered_by, correlation_id)
    values ('DOMAIN', ${T()}::uuid, ${D()}::uuid, 'lei', 'GLEIF', 'Legal Entity Identifier', true, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(owner, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet chain',
    boundary: [E1], owner: ownerId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
  for (const kind of ['retrieval', 'twins', 'memory-mappings'] as const) {
    const r = await register(kind);
    subs[kind] = { subscriptionId: r.subscription.subscriptionId, principalId: r.subscription.principalId };
  }
}, 300_000);

afterAll(async () => {
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B7 · unresolved work stays unresolved (Codex finding 3)', () => {
  let badEvent = ''; let v1 = 0;

  it('a projection mismatch leaves the retrieval item OPEN: the check recorded, the delivery unresolved with its class and route, the twin item on the same event applied once (AU-MEM-0118)', async () => {
    const v0 = await admitTwin(elements(evdB), 'actual');
    // Control: a healthy change is applied with its check.
    let since = await mark();
    await retractFreshEdge('ships_through', 'control: a healthy retraction');
    const okEvent = (await publishedEvent('GraphChanged', 'edge.retracted', since)).id;
    const ok = await waitFor('the healthy deliveries terminal', () => deliveriesFor(okEvent), (rows) => allTerminal(rows, registeredKinds()));
    await settle();
    expect(ok.find((d) => d.consumer_kind === 'retrieval')).toMatchObject({ state: 'applied', items_applied: [expect.objectContaining({ effect: 'projections.verified' })], items_unresolved: [], failure_class: null });
    expect(await verificationOf(v0)).toBe('unverified');
    // A fresh verified version so the drifted event carries a twin item beside the retrieval item.
    v1 = await admitTwin(elements(evdB), 'branch-drift');
    // The projection drifts from its log — an operator-side corruption the subscriber must report and never repair.
    await sql`update graph.entities_current set lifecycle_state = 'retired' where entity_id = ${E1}::uuid`.execute(h.su);
    since = await mark();
    await retractFreshEdge('supplies', 'the drifted projection is checked');
    badEvent = (await publishedEvent('GraphChanged', 'edge.retracted', since)).id;
    const bad = await waitFor('the mismatched deliveries terminal', () => deliveriesFor(badEvent), (rows) => allTerminal(rows, registeredKinds()));
    await settle();
    const r = bad.find((d) => d.consumer_kind === 'retrieval')!;
    expect(r).toMatchObject({ state: 'unresolved', deliveries: 1, attempts: 1, items: ['projections'], items_applied: [], failure_class: 'unresolved_dependency', disposition: 'human_review' });
    expect(r.items_unresolved).toEqual([expect.objectContaining({ item: 'projections', effect: 'projections.mismatched', checks: 1 })]);
    expect(r.unresolved_since).not.toBeNull();
    expect(r.last_error).toMatch(/1 projection row\(s\) differ/);
    const checks = await checksFor(badEvent);
    expect(checks.length).toBe(1); expect(checks[0]!.mismatched).toBe(1);
    expect(bad.find((d) => d.consumer_kind === 'twins')).toMatchObject({ state: 'applied', items: [`${twinId}@${v1}`], attempts: 1 });
    expect(await verificationOf(v1)).toBe('unverified');
    expect(await deliveryEvents(badEvent, 'twins')).toEqual(['received', 'applying', 'item.applied', 'applied']);
    expect(await deliveryEvents(badEvent, 'retrieval')).toEqual(['received', 'applying', 'item.unresolved', 'unresolved']);
    // The failure state is visible with its class and route through the status route's telemetry.
    const st = await statusOf();
    expect(st.subscriptions.telemetry.open_failure_states.find((o) => o['event_id'] === badEvent && o['consumer_kind'] === 'retrieval')).toMatchObject({ state: 'unresolved', failure_class: 'unresolved_dependency', disposition: 'human_review', items_unresolved: 1 });
  }, 180_000);

  it('a RE-DRIVE re-checks and stays unresolved (a second check); a RESTART with an empty Redis re-checks again (a third); the tick inside the re-check interval leaves it alone; no twin event is duplicated', async () => {
    const twinEventsBefore = (await sql<{ n: string }>`select count(*)::text n from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified'`.execute(h.su)).rows[0]!.n;
    // The tick's own reconciliation: the unresolved delivery is inside its re-check interval — left alone.
    const tick = await dispatcher.reconcile('control: the tick', false, '10 minutes');
    expect(tick.reDriven.map((e) => e.eventId)).not.toContain(badEvent);
    // A re-drive as at a registration or a resume (re-check at once): still drifted → a second check, still unresolved.
    const report = await dispatcher.reconcile('control: re-drive of the unresolved delivery', false, '0');
    expect(report.reDriven.find((e) => e.eventId === badEvent)?.previous).toContain('unresolved');
    const second = await waitFor('the second check', () => deliveriesFor(badEvent), (rows) => (rows.find((d) => d.consumer_kind === 'retrieval')?.deliveries ?? 0) >= 2 && allTerminal(rows, registeredKinds()));
    await settle();
    const r2 = second.find((d) => d.consumer_kind === 'retrieval')!;
    // attempts counts every apply begun: a re-check of an unresolved item is one (the item was never applied).
    expect(r2).toMatchObject({ state: 'unresolved', deliveries: 2, attempts: 2, items_applied: [], failure_class: 'unresolved_dependency' });
    expect(r2.items_unresolved[0]).toMatchObject({ item: 'projections', checks: 2 });
    expect((await checksFor(badEvent)).map((c) => c.mismatched)).toEqual([1, 1]);
    // A restart with the queue lost: the startup reconciliation re-drives it (previous: unresolved) — a third check, still unresolved.
    await scheduler.obliterateSubscriptionsForTests(T(), D());
    await restart();
    const startup = dispatcher.lastReconciliation();
    expect(startup?.reDriven.find((e) => e.eventId === badEvent)?.previous).toContain('unresolved');
    const third = await waitFor('the third check after the restart', () => deliveriesFor(badEvent), (rows) => (rows.find((d) => d.consumer_kind === 'retrieval')?.deliveries ?? 0) >= 3 && allTerminal(rows, registeredKinds()), 120_000);
    await settle();
    expect(third.find((d) => d.consumer_kind === 'retrieval')).toMatchObject({ state: 'unresolved', deliveries: 3, attempts: 3, items_applied: [] });
    expect(third.filter((d) => d.consumer_kind !== 'retrieval').every((d) => d.deliveries === 1), 'a sibling delivery was re-received by the scoped re-drive').toBe(true);
    expect((await checksFor(badEvent)).map((c) => c.mismatched)).toEqual([1, 1, 1]);
    expect((await sql<{ s: string }>`select lifecycle_state s from graph.entities_current where entity_id = ${E1}::uuid`.execute(h.su)).rows[0]!.s, 'a subscriber repaired the projection').toBe('retired');
    // Ordinary idempotency intact — and the re-drives were SCOPED to the unresolved subscription: the twins delivery of the same
    // event was applied once and never re-received.
    expect(third.find((d) => d.consumer_kind === 'twins')).toMatchObject({ state: 'applied', deliveries: 1, attempts: 1 });
    expect((await sql<{ n: string }>`select count(*)::text n from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified'`.execute(h.su)).rows[0]!.n).toBe(twinEventsBefore);
  }, 300_000);

  it('POSITIVE CONTROL: the operator repairs the projection; the next re-drive\'s check passes and the item is applied, resolved after three checks; the checkpoint advances', async () => {
    // The operator's repair, under the operator's authority — never the subscriber's.
    await sql`update graph.entities_current set lifecycle_state = 'active' where entity_id = ${E1}::uuid`.execute(h.su);
    const report = await dispatcher.reconcile('control: re-drive after the repair', false, '0');
    expect(report.reDriven.map((e) => e.eventId)).toContain(badEvent);
    const done = await waitFor('the passing check applied', () => deliveriesFor(badEvent), (rows) => allApplied(rows, registeredKinds()), 120_000);
    await settle();
    const r = done.find((d) => d.consumer_kind === 'retrieval')!;
    expect(r).toMatchObject({ state: 'applied', deliveries: 4, attempts: 4, items_unresolved: [], failure_class: null, disposition: null, unresolved_since: null, last_error: null });
    expect(r.items_applied).toEqual([expect.objectContaining({ item: 'projections', effect: 'projections.verified', resolved_after_checks: 3 })]);
    expect((await checksFor(badEvent)).map((c) => c.mismatched)).toEqual([1, 1, 1, 0]);
    expect(await deliveryEvents(badEvent, 'retrieval')).toEqual(['received', 'applying', 'item.unresolved', 'unresolved', 'received', 'applying', 'item.unresolved', 'unresolved', 'received', 'applying', 'item.unresolved', 'unresolved', 'received', 'applying', 'item.applied', 'applied']);
    const cp = (await sql<{ checkpoint_event_id: string | null; checkpoint_seq: string | null }>`select checkpoint_event_id::text, checkpoint_seq::text from graph.subscriptions where subscription_id = ${subs.retrieval!.subscriptionId}::uuid`.execute(h.su)).rows[0]!;
    expect(cp.checkpoint_event_id).toBe(badEvent);
    expect(cp.checkpoint_seq).toBe(r.partition_seq);
    expect((await statusOf()).subscriptions.telemetry.open_failure_states.filter((o) => o['event_id'] === badEvent)).toEqual([]);
  }, 180_000);
});

describe('B7 · claim.corrected through the review route; the edge, resolution and identifier mappings (AU-MEM-0114)', () => {
  it('a claim corrected by review publishes MemoryCorrected beside ClaimReviewed; the mappings consumer proposes the EDGE it asserted, the RESOLUTION of its mention and the IDENTIFIER sourced from it', async () => {
    const { claimId, caseId } = await seedQueuedClaim({ subject: 'NORDWERK Magnet GmbH', objectValue: 'Bab el-Mandeb Strait', evidence: evdB });
    const edgeId = uuidv7(); const resId = uuidv7(); const identId = uuidv7();
    await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
      values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'ships_through', ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimId}::uuid, 1, ${evdB.id}::uuid, ${sha256(evdB.id)}, 'replay', 0.55, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into graph.resolutions_current (resolution_id, scope, tenant_id, domain_id, claim_object_id, claim_version, mention_text, entity_id, method, rule_id, rule_version, score, match_evidence, candidate_set, state, proposer_principal_id, decided_by, decided_at, decision_reason, accepted_at, evidence_object_id, evidence_digest, correlation_id)
      values (${resId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${claimId}::uuid, 1, 'NORDWERK Magnet GmbH', ${E2}::uuid, 'human', 'human-decision', '1', 1, '{}'::jsonb, '[]'::jsonb, 'accepted', ${ownerId}::uuid, ${ownerId}::uuid, clock_timestamp(), 'fixture: a person accepted the mention', clock_timestamp(), ${evdB.id}::uuid, ${sha256(evdB.id)}, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into graph.entity_identifiers (identifier_id, scope, tenant_id, domain_id, entity_id, system_key, identifier_value, source_claim_object_id, source_evidence_object_id, recorded_by, correlation_id)
      values (${identId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'lei', '5299000NORDWERK00007', ${claimId}::uuid, ${evdB.id}::uuid, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const since = await mark();
    const decided = await intelligence.decideReview(h.req(reviewer, 'intelligence.review.decide', 'REV', caseId, 'intelligence'), T(), D(), caseId,
      { payload: { decision: 'correct', reason: 'the relationship is right; the object was misread', correctedValue: { object_value: 'Bab el-Mandeb Strait (southern approach)' } } }) as { review: { state: string; newVersion: number | null } };
    expect(decided.review).toMatchObject({ state: 'corrected', newVersion: 2 });
    const row = await publishedEvent('MemoryCorrected', 'claim.corrected', since);
    const p = row.payload as { change: Record<string, unknown>; objects: Array<Record<string, unknown>>; claims: string[]; cause: Record<string, unknown> };
    expect(p.change).toMatchObject({ kind: 'claim.corrected', review_case_id: caseId });
    expect(p.objects).toEqual([expect.objectContaining({ object_id: claimId, object_type: 'REL', from_version: 1, to_version: 2, lifecycle_state: 'superseded' })]);
    expect(p.claims).toEqual([claimId]);
    expect(p.cause).toMatchObject({ action: 'intelligence.review.decide', actor: reviewer.principalId, target_type: 'REV', target_id: caseId });
    expect(row.schema_version).toBe('v1');
    // The same transaction: ClaimReviewed and MemoryCorrected share the correlation; both carry the schema version.
    const reviewed = (await outboxRows('ClaimReviewed', (x) => x['case_id'] === caseId))[0]!;
    expect(reviewed.correlation_id).toBe(row.correlation_id);
    expect(reviewed.payload['schema_version']).toBe('v1');
    const ds = await waitFor('the deliveries terminal', () => deliveriesFor(row.id), (rows) => allTerminal(rows, registeredKinds()), 120_000);
    await settle();
    const m = ds.find((d) => d.consumer_kind === 'memory-mappings')!;
    expect(m.state).toBe('applied');
    expect(new Set(m.items)).toEqual(new Set([`edge:${edgeId}`, `resolution:${resId}`, `identifier:${identId}`]));
    const props = (await sql<{ subject_kind: string; subject_id: string; from_entity_id: string; to_entity_id: string | null; basis: string; state: string }>`
      select subject_kind, subject_id::text, from_entity_id::text, to_entity_id::text, basis, state from graph.mapping_reconciliations where cause_event_id = ${row.id}::uuid order by subject_kind`.execute(h.su)).rows;
    expect(props.map((x) => [x.subject_kind, x.subject_id, x.state])).toEqual([['edge', edgeId, 'proposed'], ['identifier', identId, 'proposed'], ['resolution', resId, 'proposed']]);
    expect(props[0]).toMatchObject({ from_entity_id: E2, to_entity_id: E1 });
    expect(props[0]!.basis).toMatch(/asserted by v1 of a claim corrected to v2 \(claim\.corrected\)/);
    expect(props[2]!.basis).toMatch(/rests on v1 of a claim corrected to v2/);
    // Nothing was moved by a subscriber: the edge is still asserted, the resolution still accepted, the identifier still on E2.
    expect((await sql<{ state: string }>`select state from graph.edges_current where edge_id = ${edgeId}::uuid`.execute(h.su)).rows[0]!.state).toBe('asserted');
    expect((await sql<{ state: string }>`select state from graph.resolutions_current where resolution_id = ${resId}::uuid`.execute(h.su)).rows[0]!.state).toBe('accepted');
  }, 180_000);

  it('an edge resting on corrected EVIDENCE is proposed on the correction route (evidence.corrected)', async () => {
    const up = await h.upload([{ filename: 'terms-e.csv', text: TERMS_CSV.replace('assumption', 'assumption (e)'), documentTime: '2024-01-13T00:00:00Z' }]);
    const evdE = up[0] as { id: string; version: number };
    const edgeId = uuidv7(); const claimE = uuidv7();
    await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
      values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'insures', ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimE}::uuid, 1, ${evdE.id}::uuid, ${sha256(evdE.id)}, 'replay', 0.8, ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    // The provenance path is ESTABLISHED (0065): the claim the edge names has its lineage on the evidence the edge rests on.
    await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
      values (${claimE}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${evdE.id}::uuid, ${sha256(evdE.id)}, 0, 4, 0.8, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const since = await mark();
    const caseId = await submitCorrection([evdE.id], 'correction', 'document e restated');
    await applyCase(caseId, [evdE.id], 'restatement verified against the publisher');
    const row = await publishedEvent('MemoryCorrected', 'evidence.corrected', since);
    const ds = await waitFor('the deliveries terminal', () => deliveriesFor(row.id), (rows) => allTerminal(rows, registeredKinds()), 120_000);
    await settle();
    expect(ds.find((d) => d.consumer_kind === 'memory-mappings')?.items).toEqual([`edge:${edgeId}`]);
    const prop = (await sql<{ basis: string; from_entity_id: string; to_entity_id: string }>`select basis, from_entity_id::text, to_entity_id::text from graph.mapping_reconciliations where cause_event_id = ${row.id}::uuid`.execute(h.su)).rows[0]!;
    expect(prop).toMatchObject({ from_entity_id: E2, to_entity_id: E1 });
    expect(prop.basis).toMatch(new RegExp(`derived from evidence corrected in case ${caseId}`));
  }, 180_000);
});

describe('B7 · backlog once, the declared partition and sequence, replay from a sequence (AU-MEM-0119, AU-DP-0071)', () => {
  it('BACKLOG ONCE: a subscription registered with backlog replay receives each past event exactly once; one registered to leave it receives none and the next new event', async () => {
    const past = (await outboxRows('GraphChanged')).concat(await outboxRows('MemoryCorrected')).filter((r) => r.status === 'published');
    expect(past.length).toBeGreaterThanOrEqual(3);
    const dec = await register('decisions', { backlog: 'replay' });
    subs.decisions = { subscriptionId: dec.subscription.subscriptionId, principalId: dec.subscription.principalId };
    expect(dec.served.reDriven).toBe(past.length);
    const applied = await waitFor('the backlog applied to the decisions subscription', () => sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, attempts, items, items_applied, items_unresolved, failure_class, disposition, unresolved_since, last_error, partition_seq::text
        from graph.subscription_deliveries where subscription_id = ${dec.subscription.subscriptionId}::uuid`.execute(h.su).then((x) => x.rows), (rows) => rows.length === past.length && rows.every((d) => d.state === 'applied'), 120_000);
    await settle();
    expect(applied.every((d) => d.deliveries === 1), `a past event was delivered more than once: ${JSON.stringify(applied.map((d) => [d.event_id.slice(0, 8), d.deliveries]))}`).toBe(true);
    // A subscription that LEAVES its backlog: served from its registration — nothing past, the next event yes.
    const fc = await register('forecasts', { backlog: 'leave' });
    subs.forecasts = { subscriptionId: fc.subscription.subscriptionId, principalId: fc.subscription.principalId };
    expect(fc.served.reDriven).toBe(0);
    await settle();
    expect(Number((await sql<{ n: string }>`select count(*)::text n from graph.subscription_deliveries where subscription_id = ${fc.subscription.subscriptionId}::uuid`.execute(h.su)).rows[0]!.n)).toBe(0);
    const since = await mark();
    await retractFreshEdge('charters', 'the next event after a leave registration');
    const next = (await publishedEvent('GraphChanged', 'edge.retracted', since)).id;
    const ds = await waitFor('the next event delivered to every subscription', () => deliveriesFor(next), (rows) => allTerminal(rows, registeredKinds()), 120_000);
    await settle();
    expect(ds.find((d) => d.consumer_kind === 'forecasts')).toMatchObject({ state: 'applied', deliveries: 1 });
    expect(Number((await sql<{ n: string }>`select count(*)::text n from graph.subscription_deliveries where subscription_id = ${fc.subscription.subscriptionId}::uuid`.execute(h.su)).rows[0]!.n)).toBe(1);
  }, 240_000);

  it('PARTITION AND SEQUENCE: every row carries the tenant partition and a sequence that is the commit order under concurrent writers; deliveries are received in sequence order; the cursor carries the sequence', async () => {
    const since = await mark();
    // Six retractions committed concurrently by the same principal in one domain.
    const edges = await Promise.all(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((p) => retractFreshEdge(`concurrent_${p}`, `concurrent retraction ${p}`)));
    const rows = await waitFor('the six rows published', () => outboxRows('GraphChanged', (p) => (p['change'] as { kind: string }).kind === 'edge.retracted').then((r) => r.filter((x) => x.created_at >= since)), (r) => r.length >= 6 && r.every((x) => x.status === 'published'));
    expect(rows.every((r) => r.partition_key === `tenant:${T()}` && r.schema_version === 'v1')).toBe(true);
    const seqs = rows.map((r) => Number(r.partition_seq)).sort((a, b) => a - b);
    expect(new Set(seqs).size, 'sequences are unique in the partition').toBe(6);
    // Commit order IS sequence order: the audit chain's sequence (the AUD row of each write, appended under the partition's lock) orders the same way.
    const aud = (await sql<{ target_id: string; seq: string }>`select event ->> 'target_id' as target_id, audit_seq::text as seq from audit.audit_events where action = 'graph.edge.retract' and outcome = 'success' and event_type = 'api.request' and event ->> 'target_id' = any(${edges}::text[]) order by audit_seq`.execute(h.su)).rows;
    expect(aud.length).toBe(6);
    const byEdge = new Map(rows.map((r) => [String((r.payload['relationships'] as { edges: Array<{ edge_id: string }> }).edges[0]!.edge_id), Number(r.partition_seq)]));
    const inAuditOrder = aud.map((a) => byEdge.get(a.target_id)!);
    expect(inAuditOrder, 'the outbox sequence disagrees with the audit chain order').toEqual([...inAuditOrder].sort((a, b) => a - b));
    // The domain's deliveries were received in sequence order (one worker, one job at a time).
    const ids = rows.map((r) => r.id);
    await waitFor('the six events delivered', () => sql<{ n: string }>`select count(*)::text n from graph.subscription_deliveries where event_id = any(${ids}::uuid[]) and state = 'applied' and consumer_kind = 'retrieval'`.execute(h.su).then((x) => Number(x.rows[0]!.n)), (n) => n === 6, 120_000);
    await settle();
    const received = (await sql<{ event_id: string; partition_seq: string; first_received_at: Date }>`select event_id::text, partition_seq::text, first_received_at from graph.subscription_deliveries where event_id = any(${ids}::uuid[]) and consumer_kind = 'retrieval' order by first_received_at`.execute(h.su)).rows;
    expect(received.map((r) => Number(r.partition_seq))).toEqual(seqs);
    const cp = (await sql<{ checkpoint_seq: string }>`select checkpoint_seq::text from graph.subscriptions where subscription_id = ${subs.retrieval!.subscriptionId}::uuid`.execute(h.su)).rows[0]!;
    expect(Number(cp.checkpoint_seq)).toBe(seqs[5]);
    // The immutability trigger refuses a change of partition or sequence outside the ports.
    const tamper = await failure(sql`update objects.object_outbox set partition_seq = partition_seq + 1000 where id = ${ids[0]}::uuid`.execute(h.su));
    expect(tamper.code).toBe('42501');
  }, 240_000);

  it('REPLAY FROM A SEQUENCE: the twins subscription replayed from the fourth of the six re-applies exactly the two after it; the replay names its sequence', async () => {
    const tw = subs.twins!;
    const rows = (await outboxRows('GraphChanged', (p) => String((p['cause'] as { target_id: string }).target_id).length > 0)).filter((r) => r.status === 'published');
    const byKind = rows.filter((r) => (r.payload['change'] as { kind: string }).kind === 'edge.retracted' && /concurrent_/.test(String((r.payload['relationships'] as { edges: Array<{ predicate: string }> }).edges[0]!.predicate)));
    const seqs = byKind.map((r) => Number(r.partition_seq)).sort((a, b) => a - b);
    const fromSeq = seqs[3]!;
    const expected = rows.filter((r) => Number(r.partition_seq) > fromSeq).map((r) => r.id).sort();
    expect((await failure(graph.replaySubscription(h.req(domainAdmin, 'graph.subscription.replay', 'SUB', tw.subscriptionId, 'platform.administration'), T(), D(), tw.subscriptionId, { payload: { fromSeq, fromCreatedAt: new Date().toISOString(), fromEventId: uuidv7(), reason: 'two replay points at once' } }))).status).toBe(400);
    const r = await graph.replaySubscription(h.req(domainAdmin, 'graph.subscription.replay', 'SUB', tw.subscriptionId, 'platform.administration'), T(), D(), tw.subscriptionId,
      { payload: { fromSeq, reason: 'control: replay the twins subscription from a sequence in the partition' } }) as { replayed: number; events: string[] };
    expect([...r.events].sort()).toEqual(expected);
    const reopened = await waitFor('the replayed deliveries applied', () => sql<{ event_id: string; state: string; replay_seq: number }>`select event_id::text, state, replay_seq from graph.subscription_deliveries where subscription_id = ${tw.subscriptionId}::uuid and event_id = any(${expected}::uuid[])`.execute(h.su).then((x) => x.rows),
      (xs) => xs.length === expected.length && xs.every((d) => d.state === 'applied' && d.replay_seq === 1), 120_000);
    await settle();
    expect(reopened.length).toBe(expected.length);
    const ev = (await sql<{ details: Record<string, unknown> }>`select details from graph.subscription_events where subscription_id = ${tw.subscriptionId}::uuid and event = 'subscription.replayed' order by occurred_at desc limit 1`.execute(h.su)).rows[0]!;
    expect(Number(ev.details['from_partition_seq'])).toBe(fromSeq);
    expect(ev.details['reopened']).toBe(expected.length);
    // Rows at or before the point were not replayed.
    const untouched = (await sql<{ n: string }>`select count(*)::text n from graph.subscription_deliveries where subscription_id = ${tw.subscriptionId}::uuid and replay_seq = 1 and partition_seq <= ${fromSeq}`.execute(h.su)).rows[0]!.n;
    expect(untouched).toBe('0');
  }, 180_000);
});

describe('B7 · failure states with their class and route (AU-MEM-0039)', () => {
  it('CONSUMER UNAVAILABLE: with the scenarios consumer gone from the process a scenarios delivery is refused (consumer_unavailable → retry); its re-registration re-drives it', async () => {
    const gone = dispatcher.unregisterConsumerForTests('scenarios');
    expect(gone).not.toBeNull();
    const sc = await register('scenarios');
    subs.scenarios = { subscriptionId: sc.subscription.subscriptionId, principalId: sc.subscription.principalId };
    const since = await mark();
    await retractFreshEdge('audits', 'an event while the scenarios consumer is unavailable');
    const ev = (await publishedEvent('GraphChanged', 'edge.retracted', since)).id;
    const ds = await waitFor('the deliveries terminal', () => deliveriesFor(ev), (rows) => allTerminal(rows, registeredKinds()), 120_000);
    await settle();
    expect(ds.find((d) => d.consumer_kind === 'scenarios')).toMatchObject({ state: 'refused', failure_class: 'consumer_unavailable', disposition: 'retry' });
    expect(ds.find((d) => d.consumer_kind === 'scenarios')!.last_error).toMatch(/no scenarios consumer is registered/);
    dispatcher.registerConsumer(gone!);
    const report = await dispatcher.reconcile('control: the consumer is back', true);
    expect(report.reDriven.find((e) => e.eventId === ev)?.previous).toContain('refused');
    const after = await waitFor('the scenarios delivery applied', () => deliveriesFor(ev), (rows) => allApplied(rows, registeredKinds()), 120_000);
    await settle();
    expect(after.find((d) => d.consumer_kind === 'scenarios')).toMatchObject({ state: 'applied', deliveries: 2, failure_class: null });
  }, 180_000);

  it('AUTHORITY DISPUTED: a subscription paused while its delivery is in flight is refused at the next item (authority_disputed → human_review); a resume re-drives it', async () => {
    const tw = subs.twins!;
    const vA = await admitTwin(elements(evdB), 'branch-paused-a'); const vB = await admitTwin(elements(evdB), 'branch-paused-b');
    dispatcher.armFaultForTests('slow_before_item', 'twins');
    const since = await mark();
    await retractFreshEdge('finances', 'an event delivered slowly to the twins consumer');
    const ev = (await publishedEvent('GraphChanged', 'edge.retracted', since)).id;
    await waitFor('the twins delivery received with its items', () => deliveriesFor(ev), (rows) => rows.some((d) => d.consumer_kind === 'twins' && d.items.length > 0), 60_000);
    await graph.pauseSubscription(h.req(domainAdmin, 'graph.subscription.control', 'SUB', tw.subscriptionId, 'platform.administration'), T(), D(), tw.subscriptionId, { payload: { reason: 'control: paused while a delivery is in flight' } });
    const ds = await waitFor('the twins delivery refused', () => deliveriesFor(ev), (rows) => rows.find((d) => d.consumer_kind === 'twins')?.state === 'refused', 60_000);
    await settle();
    // The pause lands at the next item (the session is re-verified on every applied item): the first applied, the second not.
    expect(ds.find((d) => d.consumer_kind === 'twins')).toMatchObject({ state: 'refused', failure_class: 'authority_disputed', disposition: 'human_review', items_applied: [expect.objectContaining({ item: `${twinId}@${vA}` })] });
    expect(ds.find((d) => d.consumer_kind === 'twins')!.last_error).toMatch(/paused or revoked during the delivery/);
    expect(await verificationOf(vA)).toBe('unverified'); expect(await verificationOf(vB)).toBe('verified');
    await graph.resumeSubscription(h.req(domainAdmin, 'graph.subscription.control', 'SUB', tw.subscriptionId, 'platform.administration'), T(), D(), tw.subscriptionId, { payload: { reason: 'control: resumed after the dispute' } });
    const after = await waitFor('the twins delivery applied after the resume', () => deliveriesFor(ev), (rows) => rows.find((d) => d.consumer_kind === 'twins')?.state === 'applied', 120_000);
    await settle();
    expect(after.find((d) => d.consumer_kind === 'twins')).toMatchObject({ state: 'applied', deliveries: 2, failure_class: null });
    expect(after.find((d) => d.consumer_kind === 'twins')!.items_applied.map((x) => x.item)).toEqual([`${twinId}@${vA}`, `${twinId}@${vB}`]);
    expect(await verificationOf(vB)).toBe('unverified');
    expect((await twinEvents(vA)).length, 'the first item was applied twice across the dispute').toBe(1);
  }, 240_000);

  it('BUDGET: a twins subscription re-registered with max_items_per_event 1 refuses an event with two items (budget → human_review) and applies one with a single item', async () => {
    const tw = subs.twins!;
    await graph.revokeSubscription(h.req(domainAdmin, 'graph.subscription.control', 'SUB', tw.subscriptionId, 'platform.administration'), T(), D(), tw.subscriptionId, { payload: { reason: 'control: re-register with a budget of one' } });
    const again = await register('twins', { budgets: { max_items_per_event: 1 } });
    subs.twins = { subscriptionId: again.subscription.subscriptionId, principalId: again.subscription.principalId };
    await settle();
    await admitTwin(elements(evdB), 'branch-b1'); await admitTwin(elements(evdB), 'branch-b2');
    const since = await mark();
    await retractFreshEdge('warehouses', 'two verified versions bounded by the strait');
    const ev = (await publishedEvent('GraphChanged', 'edge.retracted', since)).id;
    const ds = await waitFor('the deliveries terminal', () => deliveriesFor(ev), (rows) => allTerminal(rows, registeredKinds()), 120_000);
    await settle();
    expect(ds.find((d) => d.consumer_kind === 'twins')).toMatchObject({ state: 'refused', failure_class: 'budget', disposition: 'human_review' });
    expect(ds.find((d) => d.consumer_kind === 'twins')!.last_error).toMatch(/2 item\(s\) exceed max_items_per_event 1/);
  }, 180_000);

  it('EXECUTED ACTION: an input invalidated on a COMMITTED decision is recorded with the exposure (executed_action → compensation); the package is not touched', async () => {
    const since = await mark();
    await retractFreshEdge('routes_via', 'the routing decision rests on the strait');
    const ev = (await publishedEvent('GraphChanged', 'edge.retracted', since)).id;
    const ds = await waitFor('the deliveries terminal', () => deliveriesFor(ev), (rows) => allTerminal(rows, registeredKinds()), 120_000);
    await settle();
    const dec = ds.find((d) => d.consumer_kind === 'decisions')!;
    expect(dec.state).toBe('applied');
    expect(dec.items).toEqual([P1]);
    expect(dec.items_applied[0]).toMatchObject({ item: P1, effect: 'input.invalidated', details: expect.objectContaining({ executed: true, package_state: 'committed', exposure: expect.objectContaining({ failureClass: 'executed_action', disposition: 'compensation' }) }) });
    const note = (await sql<{ details: Record<string, unknown> }>`select details from decision.package_events where package_id = ${P1}::uuid and event = 'input.invalidated' and details ->> 'outbox_event_id' = ${ev}`.execute(h.su)).rows[0]!;
    expect(note.details).toMatchObject({ executed: true, package_state: 'committed', failure_class: 'executed_action', disposition: 'compensation' });
    expect((await sql<{ state: string; committed_version: number }>`select state, committed_version from decision.packages_current where package_id = ${P1}::uuid`.execute(h.su)).rows[0]).toEqual({ state: 'committed', committed_version: 1 });
  }, 180_000);

  it('LEGAL HOLD: a withdrawal of evidence under legal hold FAILS the case before any object is touched (legal_hold → challenge); a withdrawal of unheld evidence applies', async () => {
    const up = await h.upload([{ filename: 'terms-h.csv', text: TERMS_CSV.replace('assumption', 'assumption (held)'), documentTime: '2024-01-14T00:00:00Z' }, { filename: 'terms-u.csv', text: TERMS_CSV.replace('assumption', 'assumption (unheld)'), documentTime: '2024-01-14T00:00:00Z' }]);
    const held = up[0] as { id: string; version: number }; const unheld = up[1] as { id: string; version: number };
    // The hold is a governed act of an administrator (0064): a collection manager cannot place one.
    expect((await failure(observation.placeLegalHold(h.req(manager, 'observation.legal_hold.place', 'LGH', null, 'observation'), T(), D(), held.id, { payload: { reason: 'litigation hold on the January terms' } }))).status).toBe(403);
    const hold = await observation.placeLegalHold(h.req(domainAdmin, 'observation.legal_hold.place', 'LGH', null, 'observation'), T(), D(), held.id, { payload: { reason: 'litigation hold on the January terms' } }) as { hold: { holdId: string; manifestId: string } };
    expect(hold.hold.manifestId).toBe((await sql<{ m: string }>`select payload ->> 'manifest_id' as m from objects.canonical_objects where object_id = ${held.id}::uuid order by object_version desc limit 1`.execute(h.su)).rows[0]!.m);
    const since = await mark();
    const caseId = await submitCorrection([held.id, unheld.id], 'withdrawal', 'the publisher withdrew both documents');
    const out = await applyCase(caseId, [held.id, unheld.id], 'withdrawal verified against the publisher');
    expect(out.correction).toMatchObject({ caseId, state: 'failed', failure: expect.objectContaining({ failure_class: 'legal_hold', disposition: 'challenge', held: [held.id] }) });
    const c = (await sql<{ state: string; failure_reason: string }>`select state, failure_reason from observation.correction_current where case_id = ${caseId}::uuid`.execute(h.su)).rows[0]!;
    expect(c.state).toBe('failed');
    expect(c.failure_reason).toMatch(/legal hold: 1 of 2 object\(s\)/);
    // Partial work preserved: NONE — neither object was superseded, not even the unheld one; no MemoryCorrected was published.
    for (const e of [held, unheld]) expect(Number((await sql<{ n: string }>`select max(object_version)::text n from objects.canonical_objects where object_id = ${e.id}::uuid`.execute(h.su)).rows[0]!.n)).toBe(e.version);
    expect((await outboxRows('MemoryCorrected', (p) => (p['change'] as { correction_case_id: string | null }).correction_case_id === caseId)).length).toBe(0);
    const failedEvent = (await outboxRows('CorrectionFailed', (p) => p['case_id'] === caseId))[0]!;
    expect(failedEvent.payload).toMatchObject({ schema_version: 'v1', failure_class: 'legal_hold', disposition: 'challenge', held: [held.id] });
    expect(failedEvent.created_at >= since).toBe(true);
    // The unheld document alone withdraws.
    const case2 = await submitCorrection([unheld.id], 'withdrawal', 'the publisher withdrew the unheld document');
    const out2 = await applyCase(case2, [unheld.id], 'withdrawal verified against the publisher');
    expect(out2.correction).toMatchObject({ state: 'applied' });
    expect(Number((await sql<{ n: string }>`select max(object_version)::text n from objects.canonical_objects where object_id = ${unheld.id}::uuid`.execute(h.su)).rows[0]!.n)).toBe(unheld.version + 1);
    // The hold lifted by its owner (never by a correction, never by a manager), the held document withdraws.
    expect((await failure(observation.liftLegalHold(h.req(manager, 'observation.legal_hold.lift', 'LGH', hold.hold.holdId, 'observation'), T(), D(), hold.hold.holdId, { payload: { reason: 'a manager may not lift it' } }))).status).toBe(403);
    await observation.liftLegalHold(h.req(domainAdmin, 'observation.legal_hold.lift', 'LGH', hold.hold.holdId, 'observation'), T(), D(), hold.hold.holdId, { payload: { reason: 'the litigation concluded' } });
    expect((await failure(sql`delete from observation.legal_holds where hold_id = ${hold.hold.holdId}::uuid`.execute(h.su))).code, 'the hold ledger is append-only').toBe('42501');
    const case3 = await submitCorrection([held.id], 'withdrawal', 'the publisher withdrew the formerly held document');
    expect((await applyCase(case3, [held.id], 'withdrawal verified against the publisher')).correction).toMatchObject({ state: 'applied' });
    expect(Number((await sql<{ n: string }>`select max(object_version)::text n from objects.canonical_objects where object_id = ${held.id}::uuid`.execute(h.su)).rows[0]!.n)).toBe(held.version + 1);
  }, 180_000);
});

describe('B7 · telemetry (AU-MEM-0041)', () => {
  it('every delivery reports its execution state — queue wait, apply time, end-to-end age, retries, unresolved dependencies, failure class — through the status route; one measurement is captured', async () => {
    const st = await statusOf();
    const rows = st.subscriptions.telemetry.deliveries;
    expect(rows.length).toBeGreaterThan(10);
    const applied = rows.find((r) => r['state'] === 'applied' && Number(r['items_applied']) > 0)!;
    expect(applied).toBeDefined();
    for (const k of ['queue_wait_ms', 'apply_ms', 'end_to_end_ms', 'retries', 'items', 'items_applied', 'items_unresolved', 'partition_seq']) expect(Number(applied[k]), k).toBeGreaterThanOrEqual(0);
    expect(Number(applied['end_to_end_ms'])).toBeGreaterThanOrEqual(Number(applied['queue_wait_ms']));
    expect(applied['completed']).toBe(true);
    expect(Number(applied['retries'])).toBe(Number(applied['deliveries']) - 1);
    const refused = rows.find((r) => r['state'] === 'refused')!;
    expect(refused['failure_class']).toBeTruthy(); expect(refused['disposition']).toBeTruthy();
    // The telemetry is THIS tenant's only (the views run as the invoker under forced RLS): every row carries this tenant, and the
    // open failure states are exactly this suite's — the two budget refusals of the one-item twins subscription (its two verified
    // versions meet every later event; the unresolved retrieval delivery was resolved).
    expect(rows.every((r) => r['tenant_id'] === T() && r['domain_id'] === D())).toBe(true);
    expect(st.subscriptions.telemetry.open_failure_states.map((o) => [o['consumer_kind'], o['state'], o['failure_class']])).toEqual([['twins', 'refused', 'budget'], ['twins', 'refused', 'budget']]);
    // Under the superuser the view is unfiltered (it is the invoker's rights that filter it); the governed read above saw only this tenant's rows.
    const mine = Number((await sql<{ n: string }>`select count(*)::text n from graph.subscription_delivery_telemetry where tenant_id = ${T()}::uuid`.execute(h.su)).rows[0]!.n);
    expect(mine).toBeGreaterThanOrEqual(rows.length);
    const propagation = (await sql<Record<string, unknown>>`select * from graph.propagation_attempt_telemetry where tenant_id = ${T()}::uuid`.execute(h.su)).rows;
    expect(Array.isArray(propagation)).toBe(true);
    console.log(`TELEMETRY MEASUREMENT (author harness, local profile): ${JSON.stringify({ consumer_kind: applied['consumer_kind'], event_type: applied['event_type'], change_kind: applied['change_kind'], partition_seq: applied['partition_seq'], queue_wait_ms: applied['queue_wait_ms'], apply_ms: applied['apply_ms'], end_to_end_ms: applied['end_to_end_ms'], deliveries: applied['deliveries'], retries: applied['retries'], items: applied['items'], items_applied: applied['items_applied'] })}`);
    console.log(`TELEMETRY OPEN FAILURE STATES: ${JSON.stringify(st.subscriptions.telemetry.open_failure_states.map((o) => [o['consumer_kind'], o['state'], o['failure_class'], o['disposition']]))}`);
  }, 60_000);
});
