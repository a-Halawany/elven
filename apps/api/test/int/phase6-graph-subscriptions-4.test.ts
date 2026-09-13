/**
 * CP-6 batch B9 (migration 0066) — the capabilities of PHASE6_REPORT §21.6 on a real database, Redis and BullMQ:
 *
 *   MEMORY ITEMS (0066 §3, AU-MEM-0065 / AU-MEM-0031) — recorded by the knowledge owner with source, audience, validity
 *   and retention as a canonical MEM version; retrieved under a declared purpose with the access audited in the read's
 *   own transaction; superseded by the record authority with the prior version replayable as of an instant; reached by
 *   a correction walk through what it cites and marked for the owner's attention.
 *
 *   GOVERNED RETENTION (0066 §4, ES-29-004; L3-I04, L3-I05) — a retention action as a durable workflow: opened (with
 *   RetentionActionDue), its scope resolved with each item's disposition (a legal hold takes precedence; an active
 *   version is never in scope), approved by the retention authority on the scope's digest (never the opener), executed
 *   by the steward (never an approver) through the ports — superseded evidence bytes tombstoned and removed, the log's
 *   retained floor moved — verified with the residual inventory (DeletionVerified), refused while a subscription's
 *   served point lies below the floor; schedules evaluated raise the actions and nothing deletes.
 *
 *   CONTRADICTIONS (0066 §5, L2-I03 ContradictionDetected; AU-INT-0025) — two methods reading the same evidence assert
 *   incompatible values for one subject and predicate: the second admission links them (neither collapsed), queues the
 *   new claim for review with the reason `contradiction`, names the other in its header, publishes ContradictionDetected;
 *   a challenge opens a review case on an admitted claim; the adjudication is recorded, never a deletion.
 *
 *   TRANSFORMATION EVALUATED (0066 §6, L2-I05; ES-32-008) — the producing version evaluated over a window: the measures
 *   from the ledgers (calls and their latency, runs, the review yield, the contradictions its claims entered, the
 *   claims' confidence), the fitness verdict recorded and published; an unfit version admits no more claims and is not
 *   activated until evaluated fit again.
 *
 *   ONTOLOGY CHANGE PROPOSED (0066 §7, L4-I05; V00-T-046) — the domain's vocabulary versioned: the first version proposed
 *   with its analysis and approved by the steward (never the proposer), then honoured by assert_edge; a breaking
 *   proposal (a predicate in use removed) analysed against the asserted edges and refused until they are migrated.
 *
 *   SCENARIO REVIEWED (0066 §8, L7-I05; V03-T-336/340, V04-T-032) — a person's review of a scenario: continued with the
 *   next review due per the cadence, a dissent recorded with its position and rationale (the scenario unchanged), a
 *   branch promoted to simulation, the scenario retired (open branches close, the flipped one keeps its history, the
 *   links named in the event, simulation refuses a retired branch); human-gated; ScenarioReviewed published each time.
 *
 *   RE-DERIVATION (0066 §2, AU-DP-0041 / V7:TT-04) — a corrected REL claim's pending edge is re-derived automatically
 *   by the relationships consumer through the builder's rules and port: the successor asserted under the corrected
 *   version by the subscription's own principal, the pending edge superseded, its reassessment closed as `superseded`
 *   with the event, GraphChanged/edge.asserted published from the item's transaction; a claim the builder cannot
 *   re-derive (an end that resolves to no entity) leaves the item UNRESOLVED with the builder's reason and the
 *   reassessment pending for the person.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { IntelligenceController } from '../../src/intelligence/intelligence.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { GraphCapability } from '../../src/graph/graph.capabilities.js';
import { Phase4Harness } from './phase4-helpers.js';
import { RECORD_FILES, TERMS_CSV, completeElements } from './phase5-fixtures.js';
import { jcsCanonicalize } from '@eye/contracts';
import { requestDigestOf } from '../../src/intelligence/gateway/model-gateway.service.js';
import { commitDb, superDb, type AnyDb } from './helpers.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
process.env['EYE_OUTBOX_LEASE_SECONDS'] = '5';

let h: Phase4Harness; let graph: GraphController; let intelligence: IntelligenceController; let observation: ObservationController; let retention: RetentionController; let prediction: PredictionController; let twins: TwinController; let vault: VaultService; let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let commit: AnyDb; let su: AnyDb;
let owner: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
let knowledgeOwner: AuthenticatedPrincipal; let recordAuthority: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal;
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
  items_applied: Array<{ item: string; effect: string; effect_ref: string | null; details: Record<string, unknown> }>;
  items_unresolved: Array<{ item: string; effect: string; reason: string; checks: number; details: Record<string, unknown> }>; failure_class: string | null; disposition: string | null };
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, subscription_id::text, consumer_kind, state, deliveries, items, items_applied, items_unresolved, failure_class, disposition from graph.subscription_deliveries d where d.event_id = ${eventId}::uuid order by d.consumer_kind`.execute(su)).rows;
const settle = async (ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const c = await scheduler.subscriptionQueueCountsForTests(T(), D());
    if (c.active === 0 && c.waiting === 0 && c.delayed === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(c)}`);
    await sleep(200);
  }
};
const register = (kind: string, extra: Record<string, unknown> = {}) =>
  graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(), { payload: { consumerKind: kind, ownerPrincipalId: owner.principalId, ...extra } as never }) as Promise<{ subscription: { subscriptionId: string; principalId: string } }>;
const publishedEvent = (eventType: 'GraphChanged' | 'MemoryCorrected', kind: string, after: Date) =>
  waitFor(`the ${eventType}/${kind} row published`, () => sql<{ id: string; status: string; payload: Record<string, unknown>; correlation_id: string }>`select id::text, status, payload, correlation_id::text from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} and payload #>> '{change,kind}' = ${kind} order by created_at`.execute(su).then((r) => r.rows),
    (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);
const edgeRow = async (edgeId: string) => (await sql<{ state: string; claim_version: number; superseded_by: string | null; asserted_by: string; reassessment_state: string; reassessment_trigger: string | null; reassessment_outcome: string | null; reassessment_cause_id: string | null }>`select state, claim_version::int, superseded_by::text, asserted_by::text, reassessment_state, reassessment_trigger, reassessment_outcome, reassessment_cause_id::text from graph.edges_current where edge_id = ${edgeId}::uuid`.execute(su)).rows[0]!;
const edgeEvents = async (edgeId: string) => (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from graph.edge_events where edge_id = ${edgeId}::uuid order by occurred_at, event_id`.execute(su)).rows;

/** A REL claim as the extraction would have admitted it (its full lineage, so a corrected version passes the schema), queued for review. */
async function seedQueuedClaim(a: { subject: string; objectValue: string; evidence: { id: string; version: number } }): Promise<{ claimId: string; caseId: string; runId: string; methodId: string }> {
  const claimId = uuidv7(); const caseId = uuidv7(); const runId = uuidv7(); const methodId = uuidv7();
  const lineage = { method_key: 'fixture-rel', method_id: methodId, model_id: 'fixture-model', model_weights_digest: sha256('w'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: sha256('d'), mode: 'replay', call_id: null, run_id: runId,
    evidence_object_id: a.evidence.id, evidence_digest: sha256(a.evidence.id), byte_start: 0, byte_end: 4, extraction_identity: sha256(claimId), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  const payload = { claim_kind: 'relationship', subject: a.subject, predicate: 'ships_through', object_value: a.objectValue, confidence: 0.55, lineage, review: { state: 'queued', reason: 'confidence below the floor', decider: null } };
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, truth_state, synthetic_state, classification, purpose_scope, schema_ref, audit_correlation_id, content_digest, method_ref, recorded_at, observation_time, time_precision, source_clock_quality, source_object_ids, evidence_refs, payload)
    values (${claimId}::uuid, 'REL', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', 'extracted', false, 'internal', 'intelligence', 'REL@v1', ${uuidv7()}::uuid, ${sha256(claimId)}, 'fixture-extraction@1.0.0', clock_timestamp(), clock_timestamp(), 'exact', 'trusted',
            ${JSON.stringify([a.evidence.id])}::jsonb, ${JSON.stringify([`EVD:${a.evidence.id}@${a.evidence.version}`])}::jsonb, ${JSON.stringify(payload)}::jsonb)`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${a.evidence.id}::uuid, ${sha256(a.evidence.id)}, 0, 4, 0.55, ${lineage.retrieval_decision_id}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into intelligence.runs_current (run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id, mode, state, finished_at, evidence_read, claims_admitted, correlation_id)
    values (${runId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${methodId}::uuid, 1, ${owner.principalId}::uuid, 'replay', 'completed', clock_timestamp(), 1, 1, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, correlation_id)
    values (${caseId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${claimId}::uuid, 1, ${runId}::uuid, ${methodId}::uuid, 'below_review_threshold', 0.55, 'queued', ${uuidv7()}::uuid)`.execute(su);
  return { claimId, caseId, runId, methodId };
}
const acceptedResolution = (claimId: string, mention: string, entityId: string, evidenceId: string) =>
  sql`insert into graph.resolutions_current (resolution_id, scope, tenant_id, domain_id, claim_object_id, claim_version, mention_text, entity_id, method, rule_id, rule_version, score, match_evidence, candidate_set, state, proposer_principal_id, decided_by, decided_at, decision_reason, accepted_at, evidence_object_id, evidence_digest, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${claimId}::uuid, 1, ${mention}, ${entityId}::uuid, 'human', 'human-decision', '1', 1, '{}'::jsonb, '[]'::jsonb, 'accepted', ${owner.principalId}::uuid, ${owner.principalId}::uuid, clock_timestamp(), 'fixture: a person accepted the mention', clock_timestamp(), ${evidenceId}::uuid, ${sha256(evidenceId)}, ${uuidv7()}::uuid)`.execute(su);
const edgeFor = async (claimId: string, evidenceId: string): Promise<string> => {
  const edgeId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${E2}::uuid, 'ships_through', ${E1}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimId}::uuid, 1, ${evidenceId}::uuid, ${sha256(evidenceId)}, 'replay', 0.55, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  return edgeId;
};
const correctClaim = (caseId: string, correctedValue: Record<string, unknown>, reason: string) =>
  intelligence.decideReview(h.req(reviewer, 'intelligence.review.decide', 'REV', caseId, 'intelligence'), T(), D(), caseId, { payload: { decision: 'correct', reason, correctedValue } }) as Promise<{ review: { state: string; newVersion: number | null } }>;

const submitCorrection = async (evdIds: string[], reason: string): Promise<string> => {
  const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(), kind: 'correction', channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  return opened.correction.caseId;
};
const applyCase = (caseId: string, evdIds: string[], reason: string) =>
  observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId, { payload: { decision: 'apply', affectedEvdIds: evdIds, reason } }) as Promise<{ correction: Record<string, unknown> }>;
const outboxEvent = (eventType: string, after: Date, where: (p: Record<string, unknown>) => boolean = () => true) =>
  waitFor(`the ${eventType} row published`, () => sql<{ id: string; status: string; payload: Record<string, unknown> }>`select id::text, status, payload from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by created_at`.execute(su).then((r) => r.rows.filter((x) => where(x.payload))),
    (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);

/** The operator's assertion of one edge through the builder's port, as a governed write (the builder's run does the same per claim). */
const assertEdgeGoverned = async (p: AuthenticatedPrincipal, a: { predicate: string; claimId: string; evidenceId: string }): Promise<string> => {
  const edgeId = uuidv7();
  await h.pipeline.write(h.env(p, 'graph.edge.assert', 'EDG', edgeId, 'graph'), p, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId }, GraphCapability.edges,
    async (cap) => {
      await cap.assertEdge({ edgeId, tenantId: T(), domainId: D(), subject: E2, predicate: a.predicate, object: E1, validFrom: '2024-01-01T00:00:00.000Z', validTo: null, claimObjectId: a.claimId, claimVersion: 1, evidenceObjectId: a.evidenceId, evidenceDigest: sha256(a.evidenceId), methodId: null, runId: null, mode: 'replay', confidence: 0.7, actor: p.principalId, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: { edgeId }, targetType: 'EDG', targetId: edgeId, targetVersion: '1', outboxEvent: null };
    });
  return edgeId;
};
let evd: { id: string; version: number };
let relSub: { subscriptionId: string; principalId: string };
let mapSub: { subscriptionId: string; principalId: string };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { IntelligenceController: I } = await import('../../src/intelligence/intelligence.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  const { PredictionController: P } = await import('../../src/prediction/prediction.controller.js');
  const { TwinController: Tw } = await import('../../src/twin/twin.controller.js');
  graph = h.app.get(G); intelligence = h.app.get(I); observation = h.app.get(O); retention = h.app.get(R); prediction = h.app.get(P); twins = h.app.get(Tw); vault = h.app.get(VaultService); scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  commit = commitDb(); su = superDb();
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'forecast_owner', 'resolution_manager', 'decision_owner'], 'b9-owner');
  reviewer = await h.principalWith(['extraction_manager'], 'b9-extraction-manager');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b9-tenant-admin', 'TENANT');
  knowledgeOwner = await h.humanWithSession(['knowledge_owner'], 'b9-knowledge-owner');
  recordAuthority = await h.humanWithSession(['record_authority'], 'b9-record-authority');
  analyst = await h.humanWithSession(['domain_analyst'], 'b9-analyst');
  steward = await h.humanWithSession(['retention_steward'], 'b9-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b9-retention-authority', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b9-domain-admin');
  manager = await h.principalWith(['collection_manager'], 'b9-collection-manager');
  for (const [id, type, name] of [[E1, 'place', 'Bab el-Mandeb Strait'], [E2, 'organization', 'NORDWERK Magnet GmbH']] as const) {
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  }
  const up = await h.upload([{ filename: 'terms-b9.csv', text: TERMS_CSV.replace('assumption', 'assumption (b9)'), documentTime: '2024-01-14T00:00:00Z' }]);
  evd = up[0] as { id: string; version: number };
}, 300_000);

afterAll(async () => {
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
  await Promise.all([commit, su].map((d) => d.destroy()));
}, 120_000);

describe('B9 · a pending inferred relationship is RE-DERIVED automatically through the builder\'s governed run (AU-DP-0041, TT-04)', () => {
  it('SETUP: the relationships consumer registers like the six — its own agent principal and role, subscribed to claim corrections only; the memory-mappings consumer beside it', async () => {
    const r = await register('relationships', { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } });
    relSub = r.subscription;
    const m = await register('memory-mappings');
    mapSub = m.subscription;
    const roles = (await sql<{ role_code: string }>`select role_code from identity.role_bindings where principal_id = ${relSub.principalId}::uuid`.execute(su)).rows.map((x) => x.role_code);
    expect(roles).toEqual(['relationship_subscriber']);
    expect((await sql<{ n: number }>`select count(*)::int n from graph.subscription_consumer_actions where consumer_kind = 'relationships' and action = 'graph.relationship.subscription.apply'`.execute(su)).rows[0]!.n).toBe(1);
    await settle();
  }, 120_000);

  it('RE-DERIVED: a REL claim corrected in review — both ends resolve to one accepted entity each — its pending edge is superseded by the successor asserted under v2 by the subscription\'s principal; the reassessment closes as superseded with its event; GraphChanged/edge.asserted is published from the item\'s transaction; the mappings proposal on the old edge stands for the person', async () => {
    const { claimId, caseId, methodId } = await seedQueuedClaim({ subject: 'NORDWERK Magnet GmbH', objectValue: 'Bab el-Mandeb Strait', evidence: evd });
    await acceptedResolution(claimId, 'NORDWERK Magnet GmbH', E2, evd.id);
    await acceptedResolution(uuidv7(), 'Bab el-Mandeb Strait', E1, evd.id); // one resolution per claim: the place is resolved by its own (entity) claim
    const edgeId = await edgeFor(claimId, evd.id);
    const since = await mark();
    const decided = await correctClaim(caseId, { confidence: 0.91 }, 'the relationship is right; the confidence was misread from the table');
    expect(decided.review).toMatchObject({ state: 'corrected', newVersion: 2 });
    const corrected = await publishedEvent('MemoryCorrected', 'claim.corrected', since);
    const ds = await waitFor('the relationships and mappings deliveries terminal', () => deliveriesFor(corrected.id), (rows) => rows.length === 2 && rows.every((d) => d.state !== 'received'), 120_000);
    await settle();
    const rel = ds.find((d) => d.consumer_kind === 'relationships')!;
    expect(rel.state).toBe('applied');
    expect(rel.items).toEqual([`edge:${edgeId}`]);
    expect(rel.items_applied).toHaveLength(1);
    const applied = rel.items_applied[0]!;
    expect(applied.effect).toBe('edge.re_derived');
    expect(applied.details).toMatchObject({ superseded: [edgeId], claim_object_id: claimId, from_version: 1, claim_version: 2, predicate: 'ships_through', subject_entity_id: E2, object_entity_id: E1, cause: corrected.id });
    const successorId = applied.effect_ref!;
    // The successor: asserted under the corrected version by the subscription's own principal, its lineage's method and run.
    const successor = await edgeRow(successorId);
    expect(successor).toMatchObject({ state: 'asserted', claim_version: 2, asserted_by: relSub.principalId, reassessment_state: 'none' });
    expect((await sql<{ method_id: string | null; claim_object_id: string }>`select method_id::text, claim_object_id::text from graph.edges_current where edge_id = ${successorId}::uuid`.execute(su)).rows[0]).toMatchObject({ method_id: methodId, claim_object_id: claimId });
    // The pending edge: superseded by the successor, its reassessment closed as superseded with the trigger and the cause.
    const old = await edgeRow(edgeId);
    expect(old).toMatchObject({ state: 'superseded', superseded_by: successorId, reassessment_state: 'reassessed', reassessment_trigger: 'claim', reassessment_outcome: 'superseded', reassessment_cause_id: corrected.id });
    const events = (await edgeEvents(edgeId)).map((e) => e.event);
    expect(events).toContain('edge.reassessment_opened');
    expect(events.slice(-2)).toEqual(['edge.superseded', 'edge.reassessed']);
    expect((await edgeEvents(edgeId)).find((e) => e.event === 'edge.reassessed')!.details).toMatchObject({ outcome: 'superseded', trigger: 'claim', superseded_by: successorId });
    // Published from the item's transaction: GraphChanged/edge.asserted naming the successor, caused by the consumer's action.
    const asserted = await publishedEvent('GraphChanged', 'edge.asserted', since);
    const p = asserted.payload as { relationships: { edges: Array<Record<string, unknown>> }; cause: Record<string, unknown>; identities: Array<Record<string, unknown>> };
    // The event carries the successor AND the edge it superseded (the walk from the claim reaches both), each with its state.
    expect(p.relationships.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ edge_id: successorId, state: 'asserted', claim_object_id: claimId, subject_entity_id: E2, object_entity_id: E1 }),
      expect.objectContaining({ edge_id: edgeId, state: 'superseded', claim_object_id: claimId })]));
    expect(p.relationships.edges).toHaveLength(2);
    expect(p.cause).toMatchObject({ action: 'graph.relationship.subscription.apply', actor: relSub.principalId, target_type: 'EDG', target_id: successorId });
    // The mappings consumer's proposal on the old edge stands for the person (a proposal is never rewritten by a subscriber).
    const map = ds.find((d) => d.consumer_kind === 'memory-mappings')!;
    expect(map.state).toBe('applied');
    const proposals = (await sql<{ subject_kind: string; subject_id: string; state: string }>`select subject_kind, subject_id::text, state from graph.mapping_reconciliations where cause_event_id = ${corrected.id}::uuid and subject_kind = 'edge'`.execute(su)).rows;
    expect(proposals).toEqual([{ subject_kind: 'edge', subject_id: edgeId, state: 'proposed' }]);
  }, 240_000);

  it('NOT RE-DERIVABLE: the object corrected to a mention no accepted entity carries — the builder\'s refusal leaves the item UNRESOLVED (unresolved_dependency → human_review) with that reason, re-checked on a re-drive; the pending edge stays asserted and pending; the person keeps it', async () => {
    const { claimId, caseId } = await seedQueuedClaim({ subject: 'NORDWERK Magnet GmbH', objectValue: 'Bab el-Mandeb Strait', evidence: evd });
    await acceptedResolution(claimId, 'NORDWERK Magnet GmbH', E2, evd.id);
    const edgeId = await edgeFor(claimId, evd.id);
    const since = await mark();
    await correctClaim(caseId, { object_value: 'Bab el-Mandeb Strait (southern approach)' }, 'the object was misread; the corrected mention has no resolution yet');
    const corrected = await publishedEvent('MemoryCorrected', 'claim.corrected', since);
    const ds = await waitFor('the deliveries terminal', () => deliveriesFor(corrected.id), (rows) => rows.length === 2 && rows.every((d) => d.state !== 'received'), 120_000);
    await settle();
    const rel = ds.find((d) => d.consumer_kind === 'relationships')!;
    expect(rel).toMatchObject({ state: 'unresolved', failure_class: 'unresolved_dependency', disposition: 'human_review' });
    expect(rel.items_unresolved.map((u) => [u.item, u.effect, u.checks])).toEqual([[`edge:${edgeId}`, 'derivation.blocked', 1]]);
    expect(rel.items_unresolved[0]!.reason).toMatch(/the builder cannot re-derive claim .*: the object "Bab el-Mandeb Strait \(southern approach\)" does not resolve to an entity yet/);
    expect(await edgeRow(edgeId)).toMatchObject({ state: 'asserted', reassessment_state: 'pending', reassessment_trigger: 'claim', reassessment_cause_id: corrected.id });
    // A re-drive re-checks (a second check, no second effect, nothing asserted).
    await dispatcher.reconcile('B9: re-drive of the unresolved relationships delivery', false, '0');
    const second = await waitFor('the second check', () => deliveriesFor(corrected.id), (rows) => (rows.find((d) => d.consumer_kind === 'relationships')?.deliveries ?? 0) >= 2 && rows.every((d) => d.state !== 'received'), 120_000).then((r) => r.find((d) => d.consumer_kind === 'relationships')!);
    await settle();
    expect(second.state).toBe('unresolved');
    expect(second.items_unresolved[0]!.checks).toBe(2);
    expect((await sql<{ n: number }>`select count(*)::int n from graph.edges_current where claim_object_id = ${claimId}::uuid`.execute(su)).rows[0]!.n).toBe(1);
    // The person keeps the relationship as it stands: the reassessment closes decided:kept; the next re-check finds the edge no longer pending.
    await graph.keepEdge(h.req(owner, 'graph.resolution.decide', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason: 'the southern approach is the same strait for this corridor; the relationship stands' } });
    expect(await edgeRow(edgeId)).toMatchObject({ state: 'asserted', reassessment_state: 'reassessed', reassessment_outcome: 'decided:kept' });
  }, 300_000);
});

describe('B9 · the Memory item (AU-MEM-0065): recorded, retrieved under a purpose with the access audited, superseded with the prior version replayable; reached by the impact set (AU-MEM-0031)', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    recordClass: 'strategic', title: 'Why the third shipment was held on the booked routing',
    statement: 'The corridor transit level the routing decision relied on was read from the PortWatch series; the hold stands until the strait reopens.',
    source: { kind: 'human', ref: 'decision room, 2024-01-17' },
    audience: { classification: 'internal', roles: [], purposes: ['memory', 'graph'] },
    validity: { from: '2024-01-17T00:00:00Z', to: null },
    retention: { profile: 'strategic-record-7y', retainUntil: '2031-01-17T00:00:00Z', basis: 'the decision record retention schedule' },
    cites: [{ kind: 'evidence', id: evd.id, version: evd.version, rationale: 'the transit level the rationale relies on was read from this evidence' }],
    related: { decisionId: null, objectiveId: null }, ...over,
  });
  const recordAs = (p: AuthenticatedPrincipal, payload: Record<string, unknown>, purpose = 'memory') =>
    graph.recordMemoryItem(h.req(p, 'memory.item.record', 'MEM', null, purpose), T(), D(), { payload }) as Promise<{ memory: { itemId: string; version: number; cites: number } }>;
  const retrieveAs = (p: AuthenticatedPrincipal, itemId: string, purpose: string, asOf: string | null = null) =>
    graph.retrieveMemoryItem(h.req(p, 'memory.item.retrieve', 'MEM', itemId, purpose), T(), D(), itemId, { payload: asOf === null ? {} : { asOf } }) as Promise<{ memory: { versionServed: number; versions: number; accessId: string; version: Record<string, unknown>; item: Record<string, unknown> } }>;
  const accessRows = async (itemId: string) => (await sql<{ object_version: number; purpose_id: string; reader_principal_id: string; policy_decision_id: string | null; read_as_of: Date | null }>`select object_version, purpose_id, reader_principal_id::text, policy_decision_id::text, read_as_of from memory.item_access where item_id = ${itemId}::uuid order by accessed_at`.execute(su)).rows;
  const itemRow = async (itemId: string) => (await sql<{ object_version: number; state: string; attention_state: string; attention_reason: string | null; superseded_versions: number; retention_profile: string }>`select object_version, state, attention_state, attention_reason, superseded_versions, retention_profile from memory.items_current where item_id = ${itemId}::uuid`.execute(su)).rows[0]!;
  const itemEvents = async (itemId: string) => (await sql<{ event: string; object_version: number; details: Record<string, unknown> }>`select event, object_version, details from memory.item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;
  let itemId = '';

  it('RECORD (OBJ-14): refused without a retention profile, refused for a domain analyst (no authority), refused without a purpose; the knowledge owner records it — a canonical MEM@v1 row, the projection, the recorded event, the cites as dependencies, GraphChanged/memory_item.recorded published', async () => {
    await settle();
    await expect(recordAs(knowledgeOwner, item({ retention: { profile: '', retainUntil: null, basis: null } }))).rejects.toMatchObject({ status: 422 });
    await expect(recordAs(analyst, item())).rejects.toMatchObject({ status: 403 });
    await expect(recordAs(knowledgeOwner, item(), '')).rejects.toMatchObject({ status: 403 });
    const since = await mark();
    const r = await recordAs(knowledgeOwner, item());
    itemId = r.memory.itemId;
    expect(r.memory).toMatchObject({ version: 1, cites: 1 });
    const canon = (await sql<{ object_version: string; lifecycle_state: string; purpose_scope: string; retention_profile: string; classification: string; schema_ref: string; supersedes: string | null; payload: Record<string, unknown> }>`select object_version::text, lifecycle_state, purpose_scope, retention_profile, classification, schema_ref, supersedes, payload from objects.canonical_objects where object_id = ${itemId}::uuid and object_type = 'MEM' order by object_version`.execute(su)).rows;
    expect(canon).toHaveLength(1);
    expect(canon[0]).toMatchObject({ object_version: '1', lifecycle_state: 'active', purpose_scope: 'memory', retention_profile: 'strategic-record-7y', classification: 'internal', schema_ref: 'MEM@v1', supersedes: null });
    expect(canon[0]!.payload).toMatchObject({ record_class: 'strategic', retention: { profile: 'strategic-record-7y' }, cites: [expect.objectContaining({ kind: 'evidence', id: evd.id })] });
    expect(await itemRow(itemId)).toMatchObject({ object_version: 1, state: 'active', attention_state: 'none', superseded_versions: 0, retention_profile: 'strategic-record-7y' });
    expect((await itemEvents(itemId)).map((e) => e.event)).toEqual(['memory.recorded']);
    const deps = (await sql<{ depends_on_kind: string; depends_on_id: string; state: string }>`select depends_on_kind, depends_on_id::text, state from graph.dependencies where dependent_object_id = ${itemId}::uuid and dependent_type = 'MEM'`.execute(su)).rows;
    expect(deps).toEqual([{ depends_on_kind: 'evidence', depends_on_id: evd.id, state: 'active' }]);
    const ev = await publishedEvent('GraphChanged', 'memory_item.recorded', since);
    expect((ev.payload as { objects: { memoryItems: string[] }; cause: Record<string, unknown> }).objects.memoryItems).toEqual([itemId]);
    expect((ev.payload as { cause: Record<string, unknown> }).cause).toMatchObject({ action: 'memory.item.record', actor: knowledgeOwner.principalId, target_type: 'MEM', target_id: itemId });
    await settle();
  }, 120_000);

  it('RETRIEVE (OBJ-15): under a declared purpose the item is admitted for — served, no mutation, the access a ledger row naming the version, the purpose and the policy decision; under another purpose refused with no row; for a reader below the classification refused', async () => {
    const r = await retrieveAs(analyst, itemId, 'graph');
    expect(r.memory).toMatchObject({ versionServed: 1, versions: 1 });
    expect(r.memory.version).toMatchObject({ object_version: '1' });
    await expect(retrieveAs(analyst, itemId, 'prediction')).rejects.toMatchObject({ status: 403 });
    const rows = await accessRows(itemId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ object_version: 1, purpose_id: 'graph', reader_principal_id: analyst.principalId, read_as_of: null });
    expect(rows[0]!.policy_decision_id).not.toBeNull();
    expect((await itemEvents(itemId)).map((e) => e.event)).toEqual(['memory.recorded', 'memory.retrieved']);
    // A confidential record is above the analyst's clearance in this domain (internal): refused before any row is written.
    const c = await recordAs(knowledgeOwner, item({ title: 'A confidential lesson', audience: { classification: 'confidential', roles: [], purposes: ['graph'] } }));
    await expect(retrieveAs(analyst, c.memory.itemId, 'graph')).rejects.toMatchObject({ status: 403 });
    expect(await accessRows(c.memory.itemId)).toEqual([]);
    await settle();
  }, 120_000);

  it('SUPERSEDE (OBJ-16): the knowledge owner cannot; the record authority records version 2 with its reason — the prior canonical row untouched and named by the successor; a read AS OF before the supersession serves version 1 (replayable) and is audited as such', async () => {
    const v2 = item({ statement: 'The corridor transit level the routing decision relied on was read from the PortWatch series; the hold was lifted when the strait reopened on 2024-02-02.', supersession: { reason: 'the strait reopened; the lesson is completed by its outcome', effectiveAt: '2024-02-02T00:00:00Z' } });
    await expect(graph.supersedeMemoryItem(h.req(knowledgeOwner, 'memory.item.supersede', 'MEM', itemId, 'memory'), T(), D(), itemId, { payload: v2 })).rejects.toMatchObject({ status: 403 });
    const before = await mark();
    await sleep(50);
    const r = await graph.supersedeMemoryItem(h.req(recordAuthority, 'memory.item.supersede', 'MEM', itemId, 'memory'), T(), D(), itemId, { payload: v2 }) as { memory: { version: number; priorVersion: number } };
    expect(r.memory).toMatchObject({ version: 2, priorVersion: 1 });
    const canon = (await sql<{ object_version: string; supersedes: string | null; payload: Record<string, unknown> }>`select object_version::text, supersedes, payload from objects.canonical_objects where object_id = ${itemId}::uuid and object_type = 'MEM' order by object_version`.execute(su)).rows;
    expect(canon.map((c) => [c.object_version, c.supersedes])).toEqual([['1', null], ['2', `MEM:${itemId}@1`]]);
    expect(String((canon[0]!.payload['statement']))).toMatch(/the hold stands until the strait reopens/);
    expect(await itemRow(itemId)).toMatchObject({ object_version: 2, superseded_versions: 1 });
    expect((await itemEvents(itemId)).at(-1)).toMatchObject({ event: 'memory.superseded', object_version: 2, details: expect.objectContaining({ prior_version: 1, reason: 'the strait reopened; the lesson is completed by its outcome' }) });
    const now = await retrieveAs(analyst, itemId, 'graph');
    expect(now.memory).toMatchObject({ versionServed: 2, versions: 2 });
    const replay = await retrieveAs(analyst, itemId, 'graph', before.toISOString());
    expect(replay.memory).toMatchObject({ versionServed: 1, versions: 2 });
    expect(String(replay.memory.version['payload'] !== undefined ? (replay.memory.version['payload'] as Record<string, unknown>)['statement'] : '')).toMatch(/the hold stands until the strait reopens/);
    const rows = await accessRows(itemId);
    expect(rows.slice(-2).map((a) => [a.object_version, a.read_as_of === null ? null : 'as-of'])).toEqual([[2, null], [1, 'as-of']]);
    await settle();
  }, 120_000);

  it('IMPACT (AU-MEM-0031): a correction of the evidence the item cites, walked, reaches the memory item — marked basis_corrected with the event, listed on the invalidation, named in the statement; the record itself unchanged', async () => {
    const before = await itemRow(itemId);
    expect(before.attention_state).toBe('none');
    const caseId = await submitCorrection([evd.id], 'the terms document was restated');
    await applyCase(caseId, [evd.id], 'restatement verified against the publisher');
    const out = await graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', evd.id, 'graph'), T(), D(), { payload: { triggerKind: 'evidence_correction', triggerObjectId: evd.id } }) as { impact: { invalidationId: string; memoryItems: Array<{ strategy_object_id: string; object_type: string }>; statement: string } };
    expect(out.impact.memoryItems.map((m) => m.strategy_object_id)).toContain(itemId);
    expect(out.impact.statement).toMatch(/memory item\(s\) resting on what changed marked for attention/);
    const after = await itemRow(itemId);
    expect(after).toMatchObject({ object_version: 2, attention_state: 'basis_corrected' });
    expect(after.attention_reason).toMatch(new RegExp(`invalidation ${out.impact.invalidationId}`));
    expect((await itemEvents(itemId)).at(-1)).toMatchObject({ event: 'memory.attention', details: expect.objectContaining({ invalidation_id: out.impact.invalidationId }) });
    const inv = (await sql<{ affected_memory_items: Array<{ item_id: string }> }>`select affected_memory_items from graph.invalidations_current where invalidation_id = ${out.impact.invalidationId}::uuid`.execute(su)).rows[0]!;
    expect(inv.affected_memory_items.map((m) => m.item_id)).toContain(itemId);
    // The record is not rewritten by the walk: the canonical versions stand.
    expect((await sql<{ n: number }>`select count(*)::int n from objects.canonical_objects where object_id = ${itemId}::uuid`.execute(su)).rows[0]!.n).toBe(2);
    await settle();
  }, 180_000);
});

describe('B10 · WITHDRAW (OBJ-16\'s counterpart): the record authority\'s own act — the item leaves circulation, every version stays replayable as of an instant', () => {
  it('the knowledge owner cannot withdraw; the record authority does under memory.item.withdraw; a current retrieval is refused naming the withdrawal; an as-of retrieval still serves the version', async () => {
    const r = await graph.recordMemoryItem(h.req(knowledgeOwner, 'memory.item.record', 'MEM', null, 'memory'), T(), D(), { payload: { recordClass: 'strategic', title: 'A rule later withdrawn', statement: 'The corridor premium is capped at a quarter of the shipment value (withdrawn later).', source: { kind: 'human', ref: 'decision room' }, audience: { classification: 'internal', roles: [], purposes: ['memory'] }, validity: { from: '2024-01-17T00:00:00Z', to: null }, retention: { profile: 'strategic-record-7y', retainUntil: null, basis: 'strategic records are kept seven years' }, cites: [], related: { decisionId: null, objectiveId: null } } }) as { memory: { itemId: string } };
    const id = r.memory.itemId;
    await sleep(30); const before = (await mark()).toISOString(); await sleep(30);
    await expect(graph.withdrawMemoryItem(h.req(knowledgeOwner, 'memory.item.withdraw', 'MEM', id, 'memory'), T(), D(), id, { payload: { reason: 'the knowledge owner withdrawing' } })).rejects.toMatchObject({ status: 403 });
    const w = await graph.withdrawMemoryItem(h.req(recordAuthority, 'memory.item.withdraw', 'MEM', id, 'memory'), T(), D(), id, { payload: { reason: 'the cap was never adopted by the decision room' } }) as { memory: { state: string } };
    expect(w.memory.state).toBe('withdrawn');
    expect((await sql<{ state: string }>`select state from memory.items_current where item_id = ${id}::uuid`.execute(su)).rows[0]!.state).toBe('withdrawn');
    await expect(graph.retrieveMemoryItem(h.req(knowledgeOwner, 'memory.item.retrieve', 'MEM', id, 'memory'), T(), D(), id, { payload: {} })).rejects.toMatchObject({ status: 409 });
    const replay = await graph.retrieveMemoryItem(h.req(knowledgeOwner, 'memory.item.retrieve', 'MEM', id, 'memory'), T(), D(), id, { payload: { asOf: before } }) as { memory: { versionServed: number; availability: Record<string, unknown> } };
    expect(replay.memory.versionServed).toBe(1);
    expect(replay.memory.availability).toMatchObject({ state: 'withdrawn', current_version: 1 });
    await settle();
  }, 120_000);
});

describe('B9-F1 closure · a historical retrieval serves the AUTHORISED version\'s content and nothing of a version the reader is not authorised for; the access evidence names what was served', () => {
  let itemId = ''; let tBeforeV2 = ''; let tBeforeV3 = ''; let auditor: AuthenticatedPrincipal;
  const V1 = 'The corridor rule as first recorded: the third shipment is rebooked within 48 hours of the warning (internal).';
  const V2 = 'RESTRICTED SUPERSESSION: the rebooking premium ceiling and the broker named in it are for restricted readers only.';
  const V3 = 'KNOWLEDGE-OWNER-ONLY SUPERSESSION: the revised ceiling is for the knowledge owners of this domain only.';
  const base = (over: Record<string, unknown>) => ({ recordClass: 'institutional', title: 'Rebooking rule (F1 closure)', statement: V1, source: { kind: 'human', ref: 'decision room, January 2024' },
    audience: { classification: 'internal', roles: [], purposes: ['memory', 'graph'] }, validity: { from: '2024-01-17T00:00:00Z', to: null },
    retention: { profile: 'institutional-record-10y', retainUntil: '2034-01-17T00:00:00Z', basis: 'institutional rules are kept ten years' }, cites: [], related: { decisionId: null, objectiveId: null }, ...over });
  const retrieveRaw = (p: AuthenticatedPrincipal, asOf: string | null, purpose = 'memory') =>
    graph.retrieveMemoryItem(h.req(p, 'memory.item.retrieve', 'MEM', itemId, purpose), T(), D(), itemId, { payload: asOf === null ? {} : { asOf } }) as Promise<Record<string, unknown>>;
  const accessRows = async () => (await sql<{ object_version: number; purpose_id: string; reader_principal_id: string }>`select object_version::int, purpose_id, reader_principal_id::text from memory.item_access where item_id = ${itemId}::uuid order by accessed_at`.execute(su)).rows;

  it('SETUP: v1 internal for everyone in the audience; v2 restricted by CLASSIFICATION; v3 restricted by AUDIENCE ROLE (knowledge owners only) — each recorded through the governed route', async () => {
    auditor = await h.humanWithSession(['auditor'], 'f1-auditor', 'TENANT');
    const r = await graph.recordMemoryItem(h.req(knowledgeOwner, 'memory.item.record', 'MEM', null, 'memory'), T(), D(), { payload: base({}) }) as { memory: { itemId: string } };
    itemId = r.memory.itemId;
    await sleep(30); tBeforeV2 = await mark().then((d) => d.toISOString()); await sleep(30);
    await graph.supersedeMemoryItem(h.req(recordAuthority, 'memory.item.supersede', 'MEM', itemId, 'memory'), T(), D(), itemId, { payload: base({ statement: V2, source: { kind: 'human', ref: 'SYNTHETIC_V2_SOURCE (restricted)' }, audience: { classification: 'restricted', roles: [], purposes: ['memory', 'graph'] }, supersession: { reason: 'the premium ceiling and the broker are restricted', effectiveAt: '2024-02-01T00:00:00Z' } }) });
    await sleep(30); tBeforeV3 = await mark().then((d) => d.toISOString()); await sleep(30);
    await graph.supersedeMemoryItem(h.req(recordAuthority, 'memory.item.supersede', 'MEM', itemId, 'memory'), T(), D(), itemId, { payload: base({ statement: V3, source: { kind: 'human', ref: 'SYNTHETIC_V3_SOURCE (knowledge owners)' }, audience: { classification: 'internal', roles: ['knowledge_owner'], purposes: ['memory', 'graph'] }, supersession: { reason: 'the revised ceiling is the knowledge owners\'', effectiveAt: '2024-03-01T00:00:00Z' } }) });
    expect((await sql<{ n: number }>`select count(*)::int n from objects.canonical_objects where object_id = ${itemId}::uuid and object_type = 'MEM'`.execute(su)).rows[0]!.n).toBe(3);
  }, 120_000);

  it('CONTROLS: the analyst\'s current read is refused (the audience role of v3); the auditor\'s current read is refused too (not in the audience role) though cleared; the knowledge owner reads v3; before v3 the analyst\'s read of v2 is refused by classification while the auditor reads it', async () => {
    await expect(retrieveRaw(analyst, null)).rejects.toMatchObject({ status: 403 });
    await expect(retrieveRaw(auditor, null)).rejects.toMatchObject({ status: 403 });
    const ko = await retrieveRaw(knowledgeOwner, null);
    expect((ko['memory'] as Record<string, unknown>)['versionServed']).toBe(3);
    expect(JSON.stringify(ko)).toContain(V3);
    await expect(retrieveRaw(analyst, tBeforeV3)).rejects.toMatchObject({ status: 403 }); // v2: restricted
    const au = await retrieveRaw(auditor, tBeforeV3);
    expect((au['memory'] as Record<string, unknown>)['versionServed']).toBe(2);
    expect(JSON.stringify(au)).toContain(V2);
    expect(JSON.stringify(au)).not.toContain(V3); // the auditor is not in v3's audience: nothing of v3 in a v2 read
  }, 120_000);

  it('THE CLOSURE CASE: the analyst\'s historical read of v1 serves v1 — the COMPLETE serialized response carries v1\'s statement and source and nothing of v2 (classification) or v3 (audience): no statement, no source reference, no audience of theirs; the availability metadata says only which version is current and how many exist; the access ledger names version 1 under the analyst\'s purpose', async () => {
    const before = await accessRows();
    const r = await retrieveRaw(analyst, tBeforeV2, 'graph');
    const text = JSON.stringify(r);
    const memory = r['memory'] as Record<string, unknown>;
    expect(memory['versionServed']).toBe(1);
    expect(text).toContain(V1);
    expect(text).not.toContain(V2); expect(text).not.toContain(V3);
    expect(text).not.toContain('SYNTHETIC_V2_SOURCE'); expect(text).not.toContain('SYNTHETIC_V3_SOURCE');
    expect(text).not.toContain('"restricted"'); expect(text).not.toContain('knowledge_owner'); // v2's classification and v3's audience are theirs, not v1's
    expect(text).not.toMatch(/the premium ceiling|the revised ceiling/); // the supersession reasons of v2 and v3
    expect(memory['availability']).toEqual({ item_id: itemId, state: 'active', current_version: 3, versions: 3, superseded_versions: 2, last_superseded_at: expect.any(String), attention_state: 'none', served_is_current: false });
    expect(memory['item']).toEqual(memory['availability']);
    const version = memory['version'] as Record<string, unknown>;
    expect(version).toMatchObject({ object_version: '1', classification: 'internal', supersedes: null });
    expect((version['payload'] as Record<string, unknown>)['statement']).toBe(V1);
    expect(Object.keys(version).sort()).toEqual(['accountable_owner', 'classification', 'content_digest', 'item_id', 'lifecycle_state', 'object_version', 'payload', 'purpose_scope', 'recorded_at', 'retention_profile', 'schema_ref', 'supersedes', 'truth_state', 'valid_from', 'valid_to']);
    // the access evidence: one row, version 1, the analyst, the purpose stated; the refused reads left none
    const after = await accessRows();
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)).toEqual({ object_version: 1, purpose_id: 'graph', reader_principal_id: analyst.principalId });
    expect(after.filter((a) => a.reader_principal_id === analyst.principalId).every((a) => a.object_version === 1)).toBe(true);
    // the same read as the auditor at the same instant: v1 too, and v1 only
    const au = await retrieveRaw(auditor, tBeforeV2);
    expect(JSON.stringify(au)).toContain(V1); expect(JSON.stringify(au)).not.toContain(V2); expect(JSON.stringify(au)).not.toContain(V3);
    // a listing under graph.read carries no statement of any version
    const listed = JSON.stringify(await graph.listMemoryItems(h.req(analyst, 'graph.read', 'MEM', null, 'graph'), T(), D(), { payload: {} }));
    expect(listed).not.toContain(V1); expect(listed).not.toContain(V2); expect(listed).not.toContain(V3);
    const got = JSON.stringify(await graph.getMemoryItem(h.req(analyst, 'graph.read', 'MEM', itemId, 'graph'), T(), D(), itemId));
    expect(got).not.toContain(V1); expect(got).not.toContain(V2); expect(got).not.toContain(V3);
    await settle();
  }, 120_000);
});

describe('B9 · governed retention (ES-29-004): scope, holds, approval, execution evidence, residual inventory, verification; the log\'s floor moved by a governed act', () => {
  type Action = { action_id: string; state: string; kind: string; scope_digest: string | null; scope_summary: Record<string, unknown>; failure_class: string | null; disposition: string | null; failure_reason: string | null; residual_summary: unknown[] };
  const actionRow = async (id: string): Promise<Action> => (await sql<Action>`select action_id::text, state, kind, scope_digest, scope_summary, failure_class, disposition, failure_reason, residual_summary from retention.actions_current where action_id = ${id}::uuid`.execute(su)).rows[0]!;
  const items = async (id: string) => (await sql<{ item_kind: string; ref: string; disposition: string; hold_id: string | null; details: Record<string, unknown> }>`select item_kind, ref, disposition, hold_id::text, details from retention.scope_items where action_id = ${id}::uuid order by dependency_order`.execute(su)).rows;
  const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string; locator: string }>`select (payload ->> 'manifest_id') as manifest_id, (select locator from observation.blob_manifests m where m.manifest_id = (o.payload ->> 'manifest_id')::uuid) as locator from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
  const open = (p: AuthenticatedPrincipal, payload: Record<string, unknown>) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string; state: string } }>;
  const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Record<string, unknown> }>;
  const approve = (p: AuthenticatedPrincipal, id: string, digest: string, rationale = 'the scope is what the schedule allows; the held item stays') => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale } }) as Promise<{ approval: { approvalId: string } }>;
  const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: { executed: number; held: number; refused: number; floor: Record<string, unknown> | null; bytes: { removed: string[]; failed: string[] } } }>;
  const verify = (p: AuthenticatedPrincipal, id: string) => retention.verify(h.req(p, 'retention.action.verify', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ verification: Record<string, unknown> }>;
  let superseded: { evdA: { id: string; version: number }; mA1: { manifest_id: string; locator: string }; evdB: { id: string; version: number }; mB1: { manifest_id: string; locator: string }; holdId: string };
  let deletionId = '';

  it('SETUP: two evidence uploads corrected (their first versions superseded, the corrected versions active); a legal hold placed through the second object', async () => {
    const up = await h.upload([{ filename: 'ret-a.csv', text: TERMS_CSV.replace('assumption', 'assumption (ret a)'), documentTime: '2024-01-14T00:00:00Z' }, { filename: 'ret-b.csv', text: TERMS_CSV.replace('assumption', 'assumption (ret b)'), documentTime: '2024-01-14T00:00:00Z' }]);
    const evdA = up[0] as { id: string; version: number }; const evdB = up[1] as { id: string; version: number };
    const c1 = await submitCorrection([evdA.id, evdB.id], 'retention fixture: both restated');
    await applyCase(c1, [evdA.id, evdB.id], 'restatements verified');
    const mA1 = await manifestOf(evdA.id, 1); const mB1 = await manifestOf(evdB.id, 1);
    expect(await vault.exists('evidence', { tenantId: T(), domainId: D() }, mA1.locator)).toBe(true);
    const hold = await observation.placeLegalHold(h.req(domainAdmin, 'observation.legal_hold.place', 'LGH', evdB.id, 'observation'), T(), D(), evdB.id, { payload: { reason: 'litigation hold on the second upload (fixture)' } }) as { hold: { holdId: string } };
    superseded = { evdA, mA1, evdB, mB1, holdId: hold.hold.holdId };
    await settle();
  }, 120_000);

  it('OPEN → RESOLVE: the deletion of a source\'s superseded evidence opens with RetentionActionDue; the scope names the superseded manifests with their dispositions — one executes, the held one is held with its hold id — and inventories what policy retains', async () => {
    const since = await mark();
    const sourceId = await h.uploadSource();
    await expect(open(analyst, { kind: 'deletion', targetKind: 'evidence', selector: { sourceId } })).rejects.toMatchObject({ status: 403 });
    const o = await open(steward, { kind: 'deletion', targetKind: 'evidence', selector: { sourceId }, retentionProfile: 'fixture-uploads' });
    deletionId = o.action.actionId;
    expect(o.action.state).toBe('opened');
    const due = await outboxEvent('RetentionActionDue', since, (p) => p['action_id'] === deletionId);
    expect(due.payload).toMatchObject({ schema_version: 'v1', kind: 'deletion', target_kind: 'evidence', opened_by: steward.principalId, cause: { action: 'retention.action.open', target_type: 'RTA', target_id: deletionId } });
    const r = await resolve(steward, deletionId);
    // The fixture source's corrected evidence: the two uploads of this describe and the memory item's terms document (corrected in the impact case).
    expect(r.scope).toMatchObject({ state: 'scope_resolved', execute: 2, held: 1 });
    const its = await items(deletionId);
    expect(its.filter((i) => i.item_kind === 'manifest').map((i) => [i.ref, i.disposition])).toEqual(expect.arrayContaining([[superseded.mA1.manifest_id, 'execute'], [superseded.mB1.manifest_id, 'held']]));
    expect(its.find((i) => i.ref === superseded.mB1.manifest_id)!.hold_id).toBe(superseded.holdId);
    expect(its.every((i) => i.disposition !== 'excluded')).toBe(true);
    // A manifest whose evidence is still current is excluded, never retired: a fresh upload named explicitly.
    const fresh = (await h.upload([{ filename: 'ret-current.csv', text: TERMS_CSV.replace('assumption', 'assumption (current)'), documentTime: '2024-01-14T00:00:00Z' }]))[0] as { id: string };
    const mFresh = await manifestOf(fresh.id, 1);
    const ex = await open(steward, { kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mFresh.manifest_id } });
    expect((await resolve(steward, ex.action.actionId)).scope).toMatchObject({ state: 'paused', execute: 0 });
    expect((await items(ex.action.actionId)).map((i) => i.disposition)).toEqual(['excluded']);
    expect((await actionRow(deletionId)).scope_digest).toMatch(/^[0-9a-f]{64}$/);
    const residuals = (await sql<{ kind: string; count: number; status: string }>`select kind, count, status from retention.residual_inventory where action_id = ${deletionId}::uuid order by kind`.execute(su)).rows;
    expect(residuals.map((x) => x.kind)).toEqual(expect.arrayContaining(['canonical_version', 'dependency'])); // the memory item rests on the terms document
    expect(residuals.every((x) => x.status === 'retained_by_policy')).toBe(true);
    await settle();
  }, 120_000);

  it('APPROVE: the steward cannot (no authority); the retention authority on a wrong digest is refused; on the resolved digest the action is approved; the approver never executes', async () => {
    const digest = (await actionRow(deletionId)).scope_digest!;
    await expect(approve(steward, deletionId, digest)).rejects.toMatchObject({ status: 403 });
    await expect(approve(authority, deletionId, 'a'.repeat(64))).rejects.toThrow(/is not the resolved scope/);
    await approve(authority, deletionId, digest);
    expect((await actionRow(deletionId)).state).toBe('approved');
    await expect(execute(authority, deletionId)).rejects.toMatchObject({ status: 403 }); // the authority holds no execute authority in the domain
  }, 120_000);

  it('EXECUTE → VERIFY: the superseded bytes are tombstoned and gone; the held manifest is untouched and its bytes present; every item has its execution record; the verification passes each check and closes the action verified with DeletionVerified published', async () => {
    const since = await mark();
    const ex = await execute(steward, deletionId);
    expect(ex.execution).toMatchObject({ executed: 2, held: 1, refused: 0 });
    expect(ex.execution.bytes.removed).toEqual(expect.arrayContaining([superseded.mA1.locator]));
    expect(ex.execution.bytes.failed).toEqual([]);
    expect(await vault.exists('evidence', { tenantId: T(), domainId: D() }, superseded.mA1.locator)).toBe(false);
    expect(await vault.exists('evidence', { tenantId: T(), domainId: D() }, superseded.mB1.locator)).toBe(true);
    expect((await sql<{ n: number }>`select count(*)::int n from observation.blob_tombstones where manifest_id = ${superseded.mA1.manifest_id}::uuid`.execute(su)).rows[0]!.n).toBe(1);
    expect((await sql<{ n: number }>`select count(*)::int n from observation.blob_tombstones where manifest_id = ${superseded.mB1.manifest_id}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    const execs = (await sql<{ port: string; outcome: string; evidence: Record<string, unknown> }>`select port, outcome, evidence from retention.executions where action_id = ${deletionId}::uuid order by executed_at`.execute(su)).rows;
    expect(execs.map((e) => [e.port, e.outcome])).toEqual(expect.arrayContaining([['observation.tombstone_blob', 'done'], ['none', 'skipped']]));
    expect((await actionRow(deletionId)).state).toBe('executed');
    const v = await verify(steward, deletionId);
    expect(v.verification).toMatchObject({ verified: true, state: 'verified' });
    expect((await sql<{ passed: boolean }>`select passed from retention.verifications where action_id = ${deletionId}::uuid`.execute(su)).rows.every((x) => x.passed)).toBe(true);
    const done = await outboxEvent('DeletionVerified', since, (p) => p['action_id'] === deletionId);
    expect(done.payload).toMatchObject({ schema_version: 'v1', action_id: deletionId, kind: 'deletion', executed: 2, held: 1, state: 'verified', cause: { action: 'retention.action.verify', actor: steward.principalId } });
    expect(Array.isArray(done.payload['residual'])).toBe(true);
    // The tombstone port itself refuses a held manifest whatever the caller: the hold takes precedence over deletion.
    await expect(sql`select observation.tombstone_blob(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${superseded.mB1.manifest_id}::uuid, 'direct attempt', ${uuidv7()}::uuid)`.execute(su)).rejects.toThrow(/legal hold|write rejected|no authority|authority/i); // the superuser holds no port authority; under the executor's it is the hold that refuses (the harness case above: held, refused: 0)
    await settle();
  }, 180_000);

  it('THE LOG\'S FLOOR: a move above a subscription\'s served point is PAUSED with the blocking cursors named; a move up to the served point resolves, is approved and executed — the floor declared by the act, verified, and a replay from below it refused (0065 §6)', async () => {
    const partitionKey = `tenant:${T()}`;
    const cursors = (await sql<{ served_from_seq: string; checkpoint_seq: string | null }>`select served_from_seq::text, checkpoint_seq::text from graph.subscriptions where tenant_id = ${T()}::uuid and status <> 'revoked'`.execute(su)).rows;
    const minServed = Math.min(...cursors.map((c) => Number(c.served_from_seq)));
    const next = Number((await sql<{ next_seq: string }>`select next_seq::text from objects.outbox_partitions where partition_key = ${partitionKey}`.execute(su)).rows[0]!.next_seq);
    expect(minServed).toBeGreaterThan(1);
    // Above the served points: paused, the cursors named as blocking.
    const blocked = await open(steward, { kind: 'log_floor', targetKind: 'log_partition', selector: { partitionKey, toSeq: next } });
    const rb = await resolve(steward, blocked.action.actionId);
    expect(rb.scope).toMatchObject({ state: 'paused' });
    expect((await actionRow(blocked.action.actionId))).toMatchObject({ state: 'paused', failure_class: 'unresolved_dependency', disposition: 'human_review' });
    expect((await items(blocked.action.actionId)).filter((i) => i.item_kind === 'subscription_cursor' && i.disposition === 'blocking').length).toBeGreaterThanOrEqual(cursors.length);
    await expect(approve(authority, blocked.action.actionId, (await actionRow(blocked.action.actionId)).scope_digest!)).rejects.toThrow(/only a resolved scope is approved/);
    await retention.withdraw(h.req(steward, 'retention.action.open', 'RTA', blocked.action.actionId, 'retention'), T(), D(), blocked.action.actionId, { payload: { reason: 'the subscriptions must catch up first' } });
    // Up to the lowest served point: nothing owed lies below; the move is safe.
    const ok = await open(steward, { kind: 'log_floor', targetKind: 'log_partition', selector: { partitionKey, toSeq: minServed } });
    const id = ok.action.actionId;
    const r = await resolve(steward, id);
    expect(r.scope).toMatchObject({ state: 'scope_resolved', blocking: 0, execute: 1 });
    const range = (await items(id)).find((i) => i.item_kind === 'outbox_range')!;
    expect(range.details).toMatchObject({ from_seq: 1, to_seq: minServed, unpublished: 0, dead_letter: 0 });
    await approve(authority, id, (await actionRow(id)).scope_digest!, 'the history below the served points is retired by policy');
    const since = await mark();
    const ex = await execute(steward, id);
    expect(ex.execution.floor).toMatchObject({ partition_key: partitionKey, floor_before: 1, floor_after: minServed });
    const part = (await sql<{ retained_from_seq: string; retention_policy: string; retention_note: string }>`select retained_from_seq::text, retention_policy, retention_note from objects.outbox_partitions where partition_key = ${partitionKey}`.execute(su)).rows[0]!;
    expect(part).toMatchObject({ retained_from_seq: String(minServed), retention_policy: 'declared' });
    expect(part.retention_note).toContain(id);
    const v = await verify(steward, id);
    expect(v.verification).toMatchObject({ verified: true, state: 'verified' });
    await outboxEvent('DeletionVerified', since, (p) => p['action_id'] === id);
    // 0065 §6 honoured by the moved floor: a replay from below it is refused with the discontinuity named.
    const sub = (await sql<{ subscription_id: string }>`select subscription_id::text from graph.subscriptions where tenant_id = ${T()}::uuid and status <> 'revoked' limit 1`.execute(su)).rows[0]!;
    await expect(graph.replaySubscription(h.req(tenantAdmin, 'graph.subscription.replay', 'SUB', sub.subscription_id, 'platform.administration'), T(), D(), sub.subscription_id, { payload: { fromSeq: 0, reason: 'B9: a replay from below the declared floor' } })).rejects.toThrow(/floor|retained/i); // the point (sequence 1) precedes the floor
    // The floor moved by no other route: the port refuses a move that no executing action names.
    await expect(sql`select objects.outbox_declare_floor(${partitionKey}, ${minServed + 1}, ${uuidv7()}::uuid)`.execute(su)).rejects.toThrow(/write rejected|authority|no executing log_floor action/i);
    await settle();
  }, 180_000);

  it('SCHEDULES (AU-MEM-0059): a declared schedule, evaluated, raises an action with RetentionActionDue for every evidence manifest past its due-after and deletes nothing; a second evaluation raises none again', async () => {
    const profile = (await sql<{ retention_profile: string }>`select retention_profile from observation.blob_manifests where manifest_id = ${superseded.mB1.manifest_id}::uuid`.execute(su)).rows[0]!.retention_profile;
    await expect(retention.declareSchedule(h.req(steward, 'retention.schedule.declare', 'RTS', null, 'retention'), T(), D(), { payload: { retentionProfile: profile, targetKind: 'evidence', actionKind: 'review', dueAfter: '0 seconds' } })).rejects.toMatchObject({ status: 403 });
    const s = await retention.declareSchedule(h.req(domainAdmin, 'retention.schedule.declare', 'RTS', null, 'retention'), T(), D(), { payload: { retentionProfile: profile, targetKind: 'evidence', actionKind: 'review', dueAfter: '0 seconds' } }) as { schedule: { scheduleId: string } };
    const before = (await sql<{ n: number }>`select count(*)::int n from objects.canonical_objects where tenant_id = ${T()}::uuid and object_type = 'EVD'`.execute(su)).rows[0]!.n;
    const since = await mark();
    const due = (await sql<{ n: number }>`select count(*)::int n from observation.blob_manifests m where m.tenant_id = ${T()}::uuid and m.vault = 'evidence' and m.retention_profile = ${profile} and not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id)`.execute(su)).rows[0]!.n;
    const e1 = await retention.evaluateSchedules(h.req(steward, 'retention.schedule.evaluate', 'RTS', null, 'retention'), T(), D()) as { evaluation: { opened: Array<Record<string, unknown>> } };
    expect(e1.evaluation.opened.length).toBe(due); // the held manifest and the current upload: past their due-after, not tombstoned
    expect(due).toBeGreaterThanOrEqual(2);
    expect(e1.evaluation.opened.every((o) => o['schedule_id'] === s.schedule.scheduleId && o['kind'] === 'review')).toBe(true);
    const dues = await waitFor('the RetentionActionDue rows of the evaluation', () => sql<{ n: number }>`select count(*)::int n from objects.object_outbox where event_type = 'RetentionActionDue' and tenant_id = ${T()}::uuid and created_at >= ${since} and status = 'published' and payload ->> 'schedule_id' = ${s.schedule.scheduleId}`.execute(su).then((r) => r.rows[0]!.n), (n) => n >= e1.evaluation.opened.length, 60_000);
    expect(dues).toBe(e1.evaluation.opened.length);
    expect((await sql<{ n: number }>`select count(*)::int n from objects.canonical_objects where tenant_id = ${T()}::uuid and object_type = 'EVD'`.execute(su)).rows[0]!.n).toBe(before);
    const e2 = await retention.evaluateSchedules(h.req(steward, 'retention.schedule.evaluate', 'RTS', null, 'retention'), T(), D()) as { evaluation: { opened: unknown[] } };
    expect(e2.evaluation.opened).toEqual([]);
    await settle();
  }, 120_000);
});

describe('B9 · retention corrected by the review (0067 §1): a hold placed after the approval rolls the execution back whole and pauses the action; a review action records and removes nothing; an archive action has no executor', () => {
  const open = (p: AuthenticatedPrincipal, payload: Record<string, unknown>) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string; state: string } }>;
  const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Record<string, unknown> }>;
  const approve = (p: AuthenticatedPrincipal, id: string, digest: string) => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale: 'the scope as resolved; nothing else' } }) as Promise<{ approval: Record<string, unknown> }>;
  const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: Record<string, unknown> }>;
  const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string; locator: string }>`select (payload ->> 'manifest_id') as manifest_id, (select locator from observation.blob_manifests m where m.manifest_id = (o.payload ->> 'manifest_id')::uuid) as locator from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;

  it('a hold placed between the approval and the execution: the execution is refused whole — no tombstone, the bytes present, the action PAUSED for re-resolution with the approvals revoked; resolved again the item is held; a review action executes as a record only; an archive action is refused at execution', async () => {
    const up = await h.upload([{ filename: 'ret-c.csv', text: TERMS_CSV.replace('assumption', 'assumption (ret c)'), documentTime: '2024-01-14T00:00:00Z' }, { filename: 'ret-d.csv', text: TERMS_CSV.replace('assumption', 'assumption (ret d)'), documentTime: '2024-01-14T00:00:00Z' }]);
    const evdC = up[0] as { id: string; version: number }; const evdD = up[1] as { id: string; version: number };
    await applyCase(await submitCorrection([evdC.id, evdD.id], 'retention fixture: both restated (review corrections)'), [evdC.id, evdD.id], 'restatements verified');
    const mC = await manifestOf(evdC.id, 1); const mD = await manifestOf(evdD.id, 1);
    // one action over BOTH manifests, resolved and approved while neither is held
    const both = await open(steward, { kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mC.manifest_id } });
    // (the manifest selector names one; a second action for D is opened the same way so each has its own digest)
    const rC = await resolve(steward, both.action.actionId);
    expect(rC.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    await approve(authority, both.action.actionId, String(rC.scope['scope_digest']));
    // the hold lands AFTER the approval
    await observation.placeLegalHold(h.req(domainAdmin, 'observation.legal_hold.place', 'LGH', evdC.id, 'observation'), T(), D(), evdC.id, { payload: { reason: 'litigation hold placed after the approval (fixture)' } });
    await expect(execute(steward, both.action.actionId)).rejects.toMatchObject({ status: 409 });
    const after = (await sql<{ state: string; failure_class: string | null; disposition: string | null; approvals_live: number; tombstones: number; executions: number }>`select a.state, a.failure_class, a.disposition,
        (select count(*)::int from retention.approvals ap where ap.action_id = a.action_id and ap.revoked_at is null) approvals_live,
        (select count(*)::int from observation.blob_tombstones t where t.manifest_id = ${mC.manifest_id}::uuid) tombstones,
        (select count(*)::int from retention.executions e where e.action_id = a.action_id) executions
      from retention.actions_current a where a.action_id = ${both.action.actionId}::uuid`.execute(su)).rows[0]!;
    expect(after).toEqual({ state: 'paused', failure_class: 'legal_hold', disposition: 'human_review', approvals_live: 0, tombstones: 0, executions: 0 }); // nothing of the execution stands
    expect(await vault.exists('evidence', { tenantId: T(), domainId: D() }, mC.locator)).toBe(true);
    const again = await resolve(steward, both.action.actionId);
    expect(again.scope).toMatchObject({ state: 'held', held: 1, execute: 0 });
    // a REVIEW action over D: executes as a record of the review — the manifest untouched, the bytes present
    const review = await open(steward, { kind: 'review', targetKind: 'evidence', selector: { manifestId: mD.manifest_id } });
    const rD = await resolve(steward, review.action.actionId);
    await approve(authority, review.action.actionId, String(rD.scope['scope_digest']));
    const ex = await execute(steward, review.action.actionId);
    expect(ex.execution).toMatchObject({ executed: 1, refused: 0 });
    expect((await sql<{ n: number }>`select count(*)::int n from observation.blob_tombstones where manifest_id = ${mD.manifest_id}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    expect(await vault.exists('evidence', { tenantId: T(), domainId: D() }, mD.locator)).toBe(true);
    expect((await sql<{ port: string; outcome: string }>`select port, outcome from retention.executions where action_id = ${review.action.actionId}::uuid`.execute(su)).rows).toEqual([{ port: 'none', outcome: 'done' }]);
    // B9-F3 (0068 §2): the review VERIFIES against its preservation contract — the manifest untouched, the bytes present, the review recorded — and no DeletionVerified is published for it.
    const sinceVerify = await mark();
    const vr = await retention.verify(h.req(steward, 'retention.action.verify', 'RTA', review.action.actionId, 'retention'), T(), D(), review.action.actionId) as { verification: Record<string, unknown> };
    expect(vr.verification).toMatchObject({ state: 'verified', verified: true });
    expect((vr.verification['checks'] as Array<Record<string, unknown>>).map((c) => c['passed'])).toEqual([true]);
    const checks = (await sql<{ check_name: string; passed: boolean; expected: Record<string, unknown> }>`select check_name, passed, expected from retention.verifications where action_id = ${review.action.actionId}::uuid`.execute(su)).rows;
    expect(checks).toHaveLength(1); expect(checks[0]!.check_name).toMatch(/reviewed — untouched, its bytes present/); expect(checks[0]!.expected).toEqual({ tombstone: false, bytes_present: true, reviewed: true });
    expect((await sql<{ state: string }>`select state from retention.actions_current where action_id = ${review.action.actionId}::uuid`.execute(su)).rows[0]!.state).toBe('verified');
    await sleep(500);
    expect((await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where event_type = 'DeletionVerified' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${sinceVerify} and payload ->> 'action_id' = ${review.action.actionId}`.execute(su)).rows[0]!.n).toBe(0);
    expect(await vault.exists('evidence', { tenantId: T(), domainId: D() }, mD.locator)).toBe(true);
    // an ARCHIVE action has no executor in this release: refused at execution, never run as a deletion
    const arch = await open(steward, { kind: 'archive', targetKind: 'evidence', selector: { manifestId: mD.manifest_id } });
    const rA = await resolve(steward, arch.action.actionId);
    await approve(authority, arch.action.actionId, String(rA.scope['scope_digest']));
    await expect(execute(steward, arch.action.actionId)).rejects.toThrow(/has no executor in this release/);
    expect((await sql<{ n: number }>`select count(*)::int n from observation.blob_tombstones where manifest_id = ${mD.manifest_id}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    await settle();
  }, 180_000);

  /*
   * B9-F3, the SCOPE (0068 §6; found on the B10 demonstration rehearsal): a review of CURRENT evidence had resolved to an
   * excluded item ("a deletion retires corrected, superseded or withdrawn evidence only") and paused — deletion criteria
   * applied to a review. A review is scoped by its preservation contract: the current evidence is what a periodic review
   * looks at; a legal hold is honoured by keeping the item, which is what the review does; nothing is retired, so no residuals.
   */
  it('B10 · a REVIEW of CURRENT evidence resolves to the item reviewed in place (execute, no residuals), executes as a record and verifies; a review of HELD evidence likewise, the hold recorded on the item; a DELETION of the same current evidence stays excluded', async () => {
    const up = await h.upload([{ filename: 'ret-e.csv', text: TERMS_CSV.replace('assumption', 'assumption (ret e)'), documentTime: '2024-01-15T00:00:00Z' }]);
    const evdE = up[0] as { id: string; version: number };
    const mE = await manifestOf(evdE.id, 1);
    const scopeItems = async (id: string) => (await sql<{ disposition: string; hold_id: string | null; reason: string; details: Record<string, unknown> }>`select disposition, hold_id::text, reason, details from retention.scope_items where action_id = ${id}::uuid order by dependency_order`.execute(su)).rows;
    const residuals = async (id: string) => (await sql<{ n: number }>`select count(*)::int n from retention.residual_inventory where action_id = ${id}::uuid`.execute(su)).rows[0]!.n;
    // CURRENT evidence (its latest version admitted): reviewed in place
    const review = await open(steward, { kind: 'review', targetKind: 'evidence', selector: { manifestId: mE.manifest_id } });
    const r1 = await resolve(steward, review.action.actionId);
    expect(r1.scope).toMatchObject({ state: 'scope_resolved', items: 1, execute: 1, held: 0, blocking: 0, residuals: [] });
    const i1 = await scopeItems(review.action.actionId);
    expect(i1).toHaveLength(1); expect(i1[0]).toMatchObject({ disposition: 'execute', hold_id: null }); expect(i1[0]!.reason).toMatch(/reviewed in place: the record and its bytes are kept \(its evidence is admitted\)/); expect(i1[0]!.details).toMatchObject({ evd_state: 'admitted', legal_hold: false });
    expect(await residuals(review.action.actionId)).toBe(0);
    await approve(authority, review.action.actionId, String(r1.scope['scope_digest']));
    expect((await execute(steward, review.action.actionId)).execution).toMatchObject({ executed: 1, held: 0, refused: 0 });
    const v1 = await retention.verify(h.req(steward, 'retention.action.verify', 'RTA', review.action.actionId, 'retention'), T(), D(), review.action.actionId) as { verification: Record<string, unknown> };
    expect(v1.verification).toMatchObject({ state: 'verified', verified: true });
    expect(await vault.exists('evidence', { tenantId: T(), domainId: D() }, mE.locator)).toBe(true);
    expect((await sql<{ n: number }>`select count(*)::int n from observation.blob_tombstones where manifest_id = ${mE.manifest_id}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    // the same evidence under a LEGAL HOLD: the review keeps it — which is what a hold asks — and records the hold on the item
    const hold = await observation.placeLegalHold(h.req(domainAdmin, 'observation.legal_hold.place', 'LGH', evdE.id, 'observation'), T(), D(), evdE.id, { payload: { reason: 'litigation hold on the reviewed upload (fixture)' } }) as { hold: { holdId: string } };
    const held = await open(steward, { kind: 'review', targetKind: 'evidence', selector: { manifestId: mE.manifest_id } });
    const r2 = await resolve(steward, held.action.actionId);
    expect(r2.scope).toMatchObject({ state: 'scope_resolved', items: 1, execute: 1, held: 0 });
    const i2 = await scopeItems(held.action.actionId);
    expect(i2[0]).toMatchObject({ disposition: 'execute', hold_id: hold.hold.holdId }); expect(i2[0]!.reason).toMatch(/under a legal hold, which the review honours by keeping it/); expect(i2[0]!.details).toMatchObject({ legal_hold: true });
    await approve(authority, held.action.actionId, String(r2.scope['scope_digest']));
    expect((await execute(steward, held.action.actionId)).execution).toMatchObject({ executed: 1, held: 0, refused: 0 });
    const v2 = await retention.verify(h.req(steward, 'retention.action.verify', 'RTA', held.action.actionId, 'retention'), T(), D(), held.action.actionId) as { verification: Record<string, unknown> };
    expect(v2.verification).toMatchObject({ state: 'verified', verified: true });
    // the CONTROL: a deletion of the same current evidence is still excluded — the deletion criteria are the deletion's
    const del = await open(steward, { kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mE.manifest_id } });
    const r3 = await resolve(steward, del.action.actionId);
    expect(r3.scope).toMatchObject({ state: 'paused', items: 1, execute: 0 });
    expect((await scopeItems(del.action.actionId))[0]).toMatchObject({ disposition: 'excluded' });
    expect((await scopeItems(del.action.actionId))[0]!.reason).toMatch(/a deletion retires corrected, superseded or withdrawn evidence only/);
    await settle();
  }, 180_000);
});

describe('B9 · ContradictionDetected (L2-I03): incompatible assertions linked, never collapsed; the challenge; the adjudication', () => {
  const METHOD = { promptText: 'Return {"claims":[...]} or {"abstain":true,"reason":"..."} and nothing else.', decoding: { temperature: 0, seed: 11 }, runtimeVersion: 'ollama/0.33.2' };
  let extractionManager: AuthenticatedPrincipal; let extractionAgent: AuthenticatedPrincipal; let sourceId = ''; let evdC: { id: string; version: number }; let excerpt = ''; let locator = ''; let digest = '';
  let firstClaimId = ''; let secondClaimId = ''; let contradictionId = ''; let methodA: { methodId: string; key: string; modelId: string; targetTypes: string[] }; let methodB: typeof methodA;
  const registerMethod = async (key: string, modelId: string, targetTypes: string[]) => {
    const registrar = await h.principalWith(['domain_analyst'], `b9-registrar-${key}`);
    const m = await intelligence.registerMethod(h.req(registrar, 'intelligence.method.register', 'MTH', null, 'intelligence'), T(), D(), { payload: {
      methodKey: key, name: `B9 ${key}`, sourceId, targetTypes, gatewayMode: 'replay', modelId, modelWeightsDigest: sha256(`${key}-weights`),
      runtimeVersion: METHOD.runtimeVersion, promptRef: `extract/${key}`, promptVersion: 'v1', promptText: METHOD.promptText, decoding: METHOD.decoding,
      confidenceFloor: 0.3, reviewBelow: 0.5, budgetCalls: 20, budgetSeconds: 120 } }) as { method: { methodId: string } };
    await intelligence.approveMethod(h.req(extractionManager, 'intelligence.method.approve', 'MTH', m.method.methodId, 'intelligence'), T(), D(), m.method.methodId, { payload: { reason: 'B9 harness: reviewed' } });
    await intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', m.method.methodId, 'intelligence'), T(), D(), m.method.methodId, { payload: { target: 'active', reason: 'B9 harness: ready to extract' } });
    return { methodId: m.method.methodId, key, modelId, targetTypes };
  };
  const recordAndRun = async (m: { methodId: string; key: string; modelId: string; targetTypes: string[] }, claims: Array<Record<string, unknown>>) => {
    const req = { promptRef: `extract/${m.key}`, promptVersion: 'v1', promptText: METHOD.promptText, promptDigest: sha256(METHOD.promptText), modelId: m.modelId, weightsDigest: sha256(`${m.key}-weights`), runtimeVersion: METHOD.runtimeVersion,
      decodingDigest: sha256(jcsCanonicalize(METHOD.decoding)), decodingOptions: METHOD.decoding,
      input: { instruction: `extract/${m.key}`, target_types: m.targetTypes, source_key: m.key, item_key: locator, evidence_digest: digest, evidence: excerpt } };
    const response = { claims };
    await intelligence.recordResponses(h.req(extractionManager, 'intelligence.gateway.call', 'GWC', null, 'intelligence'), T(), D(), { payload: { recordings: [{ requestDigest: requestDigestOf(req), response, modelId: m.modelId, runtimeVersion: METHOD.runtimeVersion }] } });
    // The run is the AGENT's (the person who decides a review must not be the agent that produced the output).
    const out = await intelligence.extract(h.req(extractionAgent, 'intelligence.claim.admit', 'CLM', null, 'intelligence'), T(), D(), { payload: { methodId: m.methodId, limit: 5, newAttempt: false } }) as { extraction: { state: string; claims: Array<{ objectId: string; review: string }>; claimsAdmitted: number } };
    return { run: out.extraction };
  };

  it('SETUP: one evidence unit on a source of its own; two approved methods bound to it', async () => {
    extractionManager = await h.humanWithSession(['extraction_manager'], 'b9-extraction-manager');
    extractionAgent = await h.principalWith(['extraction_agent'], 'b9-extraction-agent');
    sourceId = await h.uploadSource('confidential');
    const up = await h.upload([{ filename: 'strait-status.csv', text: 'strait,status,date\nBab el-Mandeb Strait,open,2024-01-14\n', documentTime: '2024-01-14T00:00:00Z' }], 'confidential');
    evdC = up[0] as { id: string; version: number };
    const row = (await sql<{ payload: Record<string, unknown> }>`select payload from objects.canonical_objects where object_id = ${evdC.id}::uuid order by object_version desc limit 1`.execute(su)).rows[0]!;
    locator = String(row.payload['locator']); digest = String(row.payload['content_digest']);
    const bytes = await vault.read('evidence', { tenantId: T(), domainId: D() }, locator, digest);
    excerpt = bytes.bytes.toString('utf8').slice(0, 8_000);
    await settle();
  }, 120_000);

  it('DETECTED AT ADMISSION: the first method asserts the strait open (admitted, not queued); the second asserts it closed — admitted AND linked: queued for review with the reason contradiction, its header naming the first, one contradiction row, ContradictionDetected published from the admitting write; the first claim untouched', async () => {
    const m1 = await registerMethod('b9-strait-a', 'b9-model-a', ['CLM']); methodA = m1;
    const r1 = await recordAndRun(m1, [{ claim_kind: 'claim', subject: 'Bab el-Mandeb Strait', predicate: 'transit_status', object_value: 'open', confidence: 0.95, byte_start: 0, byte_end: 20 }]);
    expect(r1.run.state).toBe('completed');
    expect(r1.run.claims).toHaveLength(1);
    firstClaimId = r1.run.claims[0]!.objectId;
    expect(r1.run.claims[0]!.review).toBe('not_required');
    const since = await mark();
    const m2 = await registerMethod('b9-strait-b', 'b9-model-b', ['CLM']); methodB = m2;
    const r2 = await recordAndRun(m2, [{ claim_kind: 'claim', subject: 'Bab el-Mandeb Strait', predicate: 'transit_status', object_value: 'closed', confidence: 0.95, byte_start: 0, byte_end: 20 }]);
    expect(r2.run.state).toBe('completed');
    expect(r2.run.claims).toHaveLength(1);
    secondClaimId = r2.run.claims[0]!.objectId;
    expect(r2.run.claims[0]!.review).toBe('queued');
    const second = (await sql<{ contradiction_refs: string[]; payload: Record<string, unknown>; truth_state: string }>`select contradiction_refs, payload, truth_state from objects.canonical_objects where object_id = ${secondClaimId}::uuid`.execute(su)).rows[0]!;
    expect(second.contradiction_refs).toEqual([`CLM:${firstClaimId}@1`]);
    expect((second.payload['review'] as Record<string, unknown>)).toMatchObject({ state: 'queued' });
    expect(String((second.payload['review'] as Record<string, unknown>)['reason'])).toMatch(/contradicts 1 admitted assertion/);
    const first = (await sql<{ contradiction_refs: string[]; lifecycle_state: string; truth_state: string }>`select contradiction_refs, lifecycle_state, truth_state from objects.canonical_objects where object_id = ${firstClaimId}::uuid`.execute(su)).rows[0]!;
    expect(first).toMatchObject({ contradiction_refs: [], lifecycle_state: 'active' }); // the first assertion is not rewritten: it is linked from the second
    const rows = (await sql<{ contradiction_id: string; kind: string; a_object_id: string; b_object_id: string; a_value: string; b_value: string; state: string; review_case_id: string | null }>`select contradiction_id::text, kind, a_object_id::text, b_object_id::text, a_value, b_value, state, review_case_id::text from intelligence.contradictions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and (a_object_id = ${firstClaimId}::uuid or b_object_id = ${firstClaimId}::uuid or a_object_id = ${secondClaimId}::uuid or b_object_id = ${secondClaimId}::uuid)`.execute(su)).rows;
    expect(rows).toHaveLength(1); // the strait's one link (the re-derivation cases above recorded their own: a corrected REL claim's value contradicting the other seeded claim's)
    expect(rows[0]).toMatchObject({ kind: 'claim.value', a_object_id: firstClaimId, b_object_id: secondClaimId, a_value: 'open', b_value: 'closed', state: 'open' });
    contradictionId = rows[0]!.contradiction_id;
    const rc = (await sql<{ queued_reason: string; state: string }>`select queued_reason, state from intelligence.review_current where case_id = ${rows[0]!.review_case_id}::uuid`.execute(su)).rows[0]!;
    expect(rc).toEqual({ queued_reason: 'contradiction', state: 'queued' });
    const ev = await outboxEvent('ContradictionDetected', since, (p) => p['contradiction_id'] === contradictionId);
    expect(ev.payload).toMatchObject({ schema_version: 'v1', kind: 'claim.value', state: 'open', review_case_id: rows[0]!.review_case_id, cause: { action: 'intelligence.claim.admit', target_type: 'CTR', target_id: contradictionId } });
    const assertions = ev.payload['assertions'] as Array<Record<string, unknown>>;
    expect(assertions.map((x) => [x['object_id'], x['object_value']])).toEqual([[firstClaimId, 'open'], [secondClaimId, 'closed']]);
    expect(assertions.every((x) => x['evidence_object_id'] === evdC.id)).toBe(true);
    await settle();
  }, 300_000);

  it('CHALLENGE and ADJUDICATION: a person opens a review case on the admitted first claim (reason challenged) and corrects it to closed — the two assertions agree, no second link is made; the manager adjudicates the open contradiction as superseded; the link is immutable afterwards', async () => {
    const ch = await intelligence.requestReview(h.req(analyst, 'intelligence.review.request', 'REV', null, 'intelligence'), T(), D(), { payload: { claimObjectId: firstClaimId, claimVersion: 1, reason: 'the carrier notice of the 14th says the strait was closed that day' } }) as { review: { caseId: string; state: string; reason: string } };
    expect(ch.review).toMatchObject({ state: 'queued', reason: 'challenged' });
    await expect(intelligence.requestReview(h.req(analyst, 'intelligence.review.request', 'REV', null, 'intelligence'), T(), D(), { payload: { claimObjectId: firstClaimId, claimVersion: 1, reason: 'a second challenge of the same version' } })).rejects.toThrow(/already queued/);
    const since = await mark();
    const decided = await intelligence.decideReview(h.req(extractionManager, 'intelligence.review.decide', 'REV', ch.review.caseId, 'intelligence'), T(), D(), ch.review.caseId, { payload: { decision: 'correct', reason: 'the notice is the better source; the strait was closed', correctedValue: { object_value: 'closed' } } }) as { review: { state: string; newVersion: number | null; contradictions: number } };
    expect(decided.review).toMatchObject({ state: 'corrected', newVersion: 2, contradictions: 0 });
    await publishedEvent('MemoryCorrected', 'claim.corrected', since);
    expect((await sql<{ n: number }>`select count(*)::int n from intelligence.contradictions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and (a_object_id = ${firstClaimId}::uuid or b_object_id = ${firstClaimId}::uuid or a_object_id = ${secondClaimId}::uuid or b_object_id = ${secondClaimId}::uuid)`.execute(su)).rows[0]!.n).toBe(1);
    await expect(intelligence.adjudicateContradiction(h.req(analyst, 'intelligence.review.decide', 'CTR', contradictionId, 'intelligence'), T(), D(), contradictionId, { payload: { adjudication: 'superseded', reason: 'the first assertion was corrected to agree' } })).rejects.toMatchObject({ status: 403 });
    const adj = await intelligence.adjudicateContradiction(h.req(extractionManager, 'intelligence.review.decide', 'CTR', contradictionId, 'intelligence'), T(), D(), contradictionId, { payload: { adjudication: 'superseded', reason: 'the first assertion was corrected to agree with the second' } }) as { contradiction: { state: string; adjudication: string } };
    expect(adj.contradiction).toEqual({ contradictionId, state: 'adjudicated', adjudication: 'superseded' });
    await expect(sql`update intelligence.contradictions set adjudication = 'both_stand' where contradiction_id = ${contradictionId}::uuid`.execute(su)).rejects.toThrow(/not changed/);
    await expect(sql`delete from intelligence.contradictions where contradiction_id = ${contradictionId}::uuid`.execute(su)).rejects.toThrow(/never deleted/);
    const listed = await intelligence.listContradictions(h.req(analyst, 'intelligence.read', 'CTR', null, 'intelligence'), T(), D(), { payload: { state: 'adjudicated' } }) as { contradictions: Array<Record<string, unknown>> };
    expect(listed.contradictions.map((c) => c['contradiction_id'])).toEqual([contradictionId]);
    await settle();
  }, 240_000);
  it('TRANSFORMATION EVALUATED (L2-I05): the manager evaluates the second method over its window — the measures come from the ledgers (one call, its latency, one run, one claim, the review yield with the contradiction case, one contradiction entered), the verdict UNFIT is recorded and published; an unfit version admits nothing more; a later FIT evaluation restores it; the projection rebuild still agrees', async () => {
    const since = await mark();
    await expect(intelligence.evaluateMethod(h.req(analyst, 'intelligence.method.evaluate', 'MTH', methodB.methodId, 'intelligence'), T(), D(), methodB.methodId, { payload: { fitness: 'unfit', reason: 'one recorded response; no held-out set; its only claim contradicted the standing assertion' } })).rejects.toMatchObject({ status: 403 });
    const ev = await intelligence.evaluateMethod(h.req(extractionManager, 'intelligence.method.evaluate', 'MTH', methodB.methodId, 'intelligence'), T(), D(), methodB.methodId, { payload: { fitness: 'unfit', reason: 'one recorded response; no held-out set; its only claim contradicted the standing assertion' } }) as { evaluation: { evaluationId: string; fitness: string; measures: Record<string, Record<string, unknown>> } };
    expect(ev.evaluation.fitness).toBe('unfit');
    const m = ev.evaluation.measures;
    expect(m['cost']).toMatchObject({ calls: 1, runs: 1, claims_admitted: 1, budget_calls: 20 });
    expect(m['quality']).toMatchObject({ claims: 1, contradictions_entered: 1 });
    expect((m['quality'] as Record<string, Record<string, unknown>>)['review_yield']).toMatchObject({ cases: 1 });
    expect(Number((m['latency'] as Record<string, unknown>)['max_ms'])).toBeGreaterThanOrEqual(0);
    expect((m['fitness'] as Record<string, unknown>)['state']).toBe('unfit');
    const row = (await sql<{ fitness_state: string; fitness_evaluation_id: string; lifecycle_state: string }>`select fitness_state, fitness_evaluation_id::text, lifecycle_state from intelligence.methods_current where method_id = ${methodB.methodId}::uuid`.execute(su)).rows[0]!;
    expect(row).toMatchObject({ fitness_state: 'unfit', fitness_evaluation_id: ev.evaluation.evaluationId, lifecycle_state: 'active' });
    const stored = (await sql<{ measures: Record<string, unknown>; fitness_state: string }>`select measures, fitness_state from intelligence.method_evaluations where evaluation_id = ${ev.evaluation.evaluationId}::uuid`.execute(su)).rows[0]!;
    expect(stored.fitness_state).toBe('unfit');
    expect(stored.measures['cost']).toEqual(m['cost']);
    const published = await outboxEvent('TransformationEvaluated', since, (p) => p['evaluation_id'] === ev.evaluation.evaluationId);
    expect(published.payload).toMatchObject({ schema_version: 'v1', method: { method_id: methodB.methodId, method_key: 'b9-strait-b' }, fitness: { state: 'unfit' }, cause: { action: 'intelligence.method.evaluate', target_type: 'MTH', target_id: methodB.methodId } });
    // Downstream use constrained: the unfit version admits no more claims — the run fails at the method lock, before any admission.
    const claimsBefore = (await sql<{ n: number }>`select count(*)::int n from intelligence.claim_lineage where method_id = ${methodB.methodId}::uuid`.execute(su)).rows[0]!.n;
    const refused = await intelligence.extract(h.req(extractionAgent, 'intelligence.claim.admit', 'CLM', null, 'intelligence'), T(), D(), { payload: { methodId: methodB.methodId, limit: 5, newAttempt: true } }) as { extraction: { state: string; claimsAdmitted: number; failure: string | null } };
    expect(refused.extraction).toMatchObject({ state: 'failed', claimsAdmitted: 0 });
    expect(refused.extraction.failure).toMatch(/unfit per its evaluation/);
    expect((await sql<{ n: number }>`select count(*)::int n from intelligence.claim_lineage where method_id = ${methodB.methodId}::uuid`.execute(su)).rows[0]!.n).toBe(claimsBefore);
    // Suspended, an unfit version is not activated; evaluated fit again, it is.
    await intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', methodB.methodId, 'intelligence'), T(), D(), methodB.methodId, { payload: { target: 'suspended', reason: 'B9: suspended pending re-evaluation' } });
    await expect(intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', methodB.methodId, 'intelligence'), T(), D(), methodB.methodId, { payload: { target: 'active', reason: 'B9: an attempt to reactivate an unfit version' } })).rejects.toThrow(/unfit/);
    const fit = await intelligence.evaluateMethod(h.req(extractionManager, 'intelligence.method.evaluate', 'MTH', methodB.methodId, 'intelligence'), T(), D(), methodB.methodId, { payload: { fitness: 'fit', reason: 'the contradiction was adjudicated in its favour; the recorded set is acceptable for replay' } }) as { evaluation: { evaluationId: string } };
    await intelligence.transitionMethod(h.req(extractionManager, 'intelligence.method.activate', 'MTH', methodB.methodId, 'intelligence'), T(), D(), methodB.methodId, { payload: { target: 'active', reason: 'B9: reactivated after the fit evaluation' } });
    expect((await sql<{ fitness_state: string; lifecycle_state: string; fitness_evaluation_id: string }>`select fitness_state, lifecycle_state, fitness_evaluation_id::text from intelligence.methods_current where method_id = ${methodB.methodId}::uuid`.execute(su)).rows[0]).toEqual({ fitness_state: 'fit', lifecycle_state: 'active', fitness_evaluation_id: fit.evaluation.evaluationId });
    const events = (await sql<{ event: string }>`select event from intelligence.method_events where method_id = ${methodB.methodId}::uuid order by occurred_at`.execute(su)).rows.map((e) => e.event);
    expect(events.slice(-4)).toEqual(['method.evaluated', 'method.suspended', 'method.evaluated', 'method.activated']);
    // The evaluation is not a lifecycle transition: the projection rebuild reports no mismatch.
    const rebuilt = (await intelligence.verifyProjections(h.req(extractionManager, 'intelligence.read', 'MTH', null, 'intelligence'), T(), D()) as { projections: Array<{ projection: string; mismatched: string | number }> }).projections;
    expect(Number(rebuilt.find((r) => r.projection === 'methods_current')?.mismatched)).toBe(0);
    await settle();
  }, 240_000);
});

describe('B9 · OntologyChangeProposed (L4-I05): a versioned vocabulary, the compatibility analysis, the steward\'s decision, the vocabulary honoured', () => {
  let stewardOnt: AuthenticatedPrincipal; let v1 = ''; let v2 = '';
  const propose = (p: AuthenticatedPrincipal, payload: Record<string, unknown>) => graph.proposeOntology(h.req(p, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload }) as Promise<{ ontology: Record<string, unknown> }>;
  const decide = (p: AuthenticatedPrincipal, id: string, decision: string, reason: string, reviews: Record<string, unknown> = {}) => graph.decideOntology(h.req(p, 'graph.ontology.decide', 'ONT', id, 'graph'), T(), D(), id, { payload: { decision, reason, reviews } }) as Promise<{ ontology: Record<string, unknown> }>;
  const PRED = (predicate: string, subject: string[], object: string[]) => ({ predicate, subject_types: subject, object_types: object });

  it('PROPOSED and APPROVED: the first version (the predicates the domain asserts today) is additive — its analysis strands nothing, its reviews open, OntologyChangeProposed published; the proposer cannot decide; the steward activates it', async () => {
    stewardOnt = await h.humanWithSession(['ontology_steward'], 'b9-ontology-steward');
    const since = await mark();
    const r = await propose(owner, { namespace: 'domain', entityTypes: ['organization', 'place', 'product', 'vessel'], predicates: [PRED('ships_through', ['organization', 'vessel'], ['place']), PRED('supplies', ['organization'], ['organization']), PRED('insures', ['organization'], ['organization']), PRED('transits', ['vessel'], ['place'])],
      rationale: 'the corridor vocabulary the graph already asserts, made explicit as version 1', alternatives: ['leave the vocabulary implicit (rejected: an unknown predicate would be admitted silently)'] });
    v1 = String(r.ontology['version_id']);
    expect(r.ontology).toMatchObject({ from_version: null, to_version: 1, compatibility: 'additive', reviews: { compatibility: 'passed', migration: 'not_required', domain: 'open', governance: 'open' } });
    expect((r.ontology['analysis'] as Record<string, Record<string, unknown>>)['edges']).toMatchObject({ count: 0 });
    const ev = await outboxEvent('OntologyChangeProposed', since, (p) => p['proposal_id'] === v1);
    expect(ev.payload).toMatchObject({ schema_version: 'v1', namespace: 'domain', to_version: 1, review: { required: ['compatibility', 'migration', 'domain', 'governance'], steward_role: 'ontology_steward' }, cause: { action: 'graph.ontology.propose', target_type: 'ONT', target_id: v1 } });
    await expect(decide(owner, v1, 'approve', 'the proposer approving their own proposal')).rejects.toMatchObject({ status: 403 });
    await expect(decide(analyst, v1, 'approve', 'an analyst holds no steward authority')).rejects.toMatchObject({ status: 403 });
    const d = await decide(stewardOnt, v1, 'approve', 'the vocabulary matches the corridor graph; domain and governance reviews passed', { domain: 'passed', governance: 'passed' });
    expect(d.ontology).toMatchObject({ state: 'active', supersedes: null, version: 1 });
    const events = (await sql<{ event: string }>`select event from graph.ontology_events where version_id = ${v1}::uuid order by occurred_at, event_id`.execute(su)).rows.map((e) => e.event);
    expect(events).toEqual(['ontology.proposed', 'ontology.approved', 'ontology.activated']);
    await settle();
  }, 120_000);

  it('HONOURED: with an active version, an edge on an undeclared predicate is refused by the builder\'s port; a declared one is asserted', async () => {
    // Through the builder's port under the operator's authority: the undeclared predicate refused with the reason; the declared one admitted.
    await expect(assertEdgeGoverned(owner, { predicate: 'rerouted_via', claimId: uuidv7(), evidenceId: evd.id })).rejects.toThrow(/not in the domain's active ontology version/);
    const edgeId = await assertEdgeGoverned(owner, { predicate: 'supplies', claimId: uuidv7(), evidenceId: evd.id });
    expect((await sql<{ state: string; predicate: string }>`select state, predicate from graph.edges_current where edge_id = ${edgeId}::uuid`.execute(su)).rows[0]).toEqual({ state: 'asserted', predicate: 'supplies' });
    await settle();
  }, 120_000);

  it('BREAKING: a proposal removing a predicate in use is analysed (the asserted edges named, the strategy resting on them counted), its reviews open; approval is refused while those edges stand; an additive follow-up adding rerouted_via is approved and the new predicate admitted', async () => {
    const inUse = (await sql<{ n: number }>`select count(*)::int n from graph.edges_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and state = 'asserted' and predicate = 'supplies'`.execute(su)).rows[0]!.n;
    expect(inUse).toBeGreaterThanOrEqual(1);
    const r = await propose(analyst, { namespace: 'domain', entityTypes: ['organization', 'place', 'product', 'vessel'], predicates: [PRED('ships_through', ['organization', 'vessel'], ['place']), PRED('insures', ['organization'], ['organization']), PRED('transits', ['vessel'], ['place'])],
      rationale: 'retire the supplies predicate: the supplier relationships move to the procurement register', alternatives: ['keep supplies and mark it deprecated'] });
    v2 = String(r.ontology['version_id']);
    expect(r.ontology).toMatchObject({ from_version: 1, to_version: 2, compatibility: 'breaking', reviews: { compatibility: 'open', migration: 'open' } });
    const analysis = r.ontology['analysis'] as Record<string, Record<string, unknown>>;
    expect(analysis['edges']).toMatchObject({ count: inUse });
    expect((analysis['edges']['sample'] as Array<Record<string, unknown>>).every((e) => e['predicate'] === 'supplies')).toBe(true);
    await expect(decide(stewardOnt, v2, 'approve', 'approving the retirement before the migration', { compatibility: 'passed', migration: 'passed' })).rejects.toThrow(/breaking change with \d+ asserted edge/);
    expect((await sql<{ state: string }>`select state from graph.ontology_versions where version_id = ${v2}::uuid`.execute(su)).rows[0]!.state).toBe('proposed');
    expect((await sql<{ state: string }>`select state from graph.ontology_versions where version_id = ${v1}::uuid`.execute(su)).rows[0]!.state).toBe('active'); // the prior version stands
    await decide(stewardOnt, v2, 'reject', 'the supplier edges are live; retire them first, then propose again');
    const add = await propose(analyst, { namespace: 'domain', entityTypes: ['organization', 'place', 'product', 'vessel', 'shipment'], predicates: [PRED('ships_through', ['organization', 'vessel'], ['place']), PRED('supplies', ['organization'], ['organization']), PRED('insures', ['organization'], ['organization']), PRED('transits', ['vessel'], ['place']), PRED('rerouted_via', ['vessel', 'shipment'], ['place'])],
      rationale: 'the carrier reroute notice asserts a routing the corridor graph cannot hold', alternatives: [] });
    const v3 = String(add.ontology['version_id']);
    expect(add.ontology).toMatchObject({ from_version: 1, to_version: 3, compatibility: 'additive' }); // a rejected proposal keeps its number
    expect((add.ontology['change'] as Record<string, Record<string, unknown>>)['added']).toMatchObject({ entity_types: ['shipment'], predicates: [expect.objectContaining({ predicate: 'rerouted_via' })] });
    await decide(stewardOnt, v3, 'approve', 'additive; the reroute routing is needed by the corridor scenes', { domain: 'passed', governance: 'passed' });
    expect((await sql<{ state: string; version: number }>`select state, version from graph.ontology_versions where version_id = ${v1}::uuid`.execute(su)).rows[0]).toEqual({ state: 'superseded', version: 1 });
    const reroute = await assertEdgeGoverned(owner, { predicate: 'rerouted_via', claimId: uuidv7(), evidenceId: evd.id });
    expect((await sql<{ predicate: string }>`select predicate from graph.edges_current where edge_id = ${reroute}::uuid`.execute(su)).rows[0]!.predicate).toBe('rerouted_via');
    const listed = await graph.listOntology(h.req(analyst, 'graph.read', 'ONT', null, 'graph'), T(), D()) as { versions: Array<{ version: number; state: string }> };
    expect(listed.versions.map((v) => [v.version, v.state])).toEqual([[1, 'superseded'], [2, 'rejected'], [3, 'active']]);
    await settle();
  }, 180_000);
});

describe('B9-F2 closure · the builder\'s port REFUSES a re-derivation (a predicate outside the active ontology): the refusal is contained under a savepoint, so the item\'s UNRESOLVED state is durable — pending reassessment, no successor, no duplicate cause on a re-drive — and the person\'s repair (the vocabulary extended) lets the next re-drive re-derive it', () => {
  it('REFUSED, RECORDED, REPAIRED', async () => {
    // The ontology describe above left version 3 active: ships_through, supplies, insures, transits, rerouted_via — not depends_on.
    const active = (await sql<{ version: number; predicates: Array<{ predicate: string }> }>`select version, predicates from graph.ontology_versions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and state = 'active'`.execute(su)).rows[0]!;
    expect(active.predicates.map((p) => p.predicate)).not.toContain('depends_on');
    const { claimId, caseId } = await seedQueuedClaim({ subject: 'NORDWERK Magnet GmbH', objectValue: 'Bab el-Mandeb Strait', evidence: evd });
    await acceptedResolution(claimId, 'NORDWERK Magnet GmbH', E2, evd.id);
    const edgeId = await edgeFor(claimId, evd.id); // asserted under ships_through (declared)
    const since = await mark();
    // The correction moves the PREDICATE to one the active vocabulary does not declare: the builder derives depends_on; the port refuses it.
    await correctClaim(caseId, { predicate: 'depends_on' }, 'the record says NORDWERK depends on the strait, not that it ships through it');
    const corrected = await publishedEvent('MemoryCorrected', 'claim.corrected', since);
    const ds = await waitFor('the deliveries terminal', () => deliveriesFor(corrected.id), (rows) => rows.length === 2 && rows.every((d) => d.state !== 'received'), 120_000);
    await settle();
    const rel = ds.find((d) => d.consumer_kind === 'relationships')!;
    // DURABLE: the unresolved checkpoint was written in the same transaction the port refused in (B9-F2) — a human disposition, not a fault to retry.
    expect(rel).toMatchObject({ state: 'unresolved', failure_class: 'unresolved_dependency', disposition: 'human_review', deliveries: 1 });
    expect(rel.items_unresolved.map((u) => [u.item, u.effect, u.checks])).toEqual([[`edge:${edgeId}`, 'derivation.blocked', 1]]);
    expect(rel.items_unresolved[0]!.reason).toMatch(/refused the re-derived relationship: edge rejected: predicate depends_on is not in the domain's active ontology version/);
    expect(rel.last_error ?? null).toBeNull();
    const before = await edgeRow(edgeId);
    expect(before).toMatchObject({ state: 'asserted', reassessment_state: 'pending', reassessment_trigger: 'claim', reassessment_cause_id: corrected.id, superseded_by: null });
    expect((await sql<{ n: number }>`select count(*)::int n from graph.edges_current where claim_object_id = ${claimId}::uuid and claim_version = 2`.execute(su)).rows[0]!.n).toBe(0); // no successor
    const causesBefore = (await sql<{ n: number }>`select jsonb_array_length(reassessment_causes)::int n from graph.edges_current where edge_id = ${edgeId}::uuid`.execute(su)).rows[0]!.n;
    const openedBefore = (await edgeEvents(edgeId)).filter((e) => e.event === 'edge.reassessment_opened').length;
    // A RE-DRIVE: the same refusal, the same disposition, no second cause and no second opened-event (0067 §5).
    await dispatcher.reconcile('B9-F2: re-drive of the refused re-derivation', false, '0');
    const second = await waitFor('the second check', () => deliveriesFor(corrected.id), (rows) => (rows.find((d) => d.consumer_kind === 'relationships')?.deliveries ?? 0) >= 2 && rows.every((d) => d.state !== 'received'), 120_000).then((r) => r.find((d) => d.consumer_kind === 'relationships')!);
    await settle();
    expect(second).toMatchObject({ state: 'unresolved', deliveries: 2 });
    expect(second.items_unresolved[0]!.checks).toBe(2);
    expect((await sql<{ n: number }>`select jsonb_array_length(reassessment_causes)::int n from graph.edges_current where edge_id = ${edgeId}::uuid`.execute(su)).rows[0]!.n).toBe(causesBefore);
    expect((await edgeEvents(edgeId)).filter((e) => e.event === 'edge.reassessment_opened').length).toBe(openedBefore);
    // THE REPAIR is the person's: the vocabulary extended (additive) and approved by the steward — then the next re-drive re-derives.
    const steward2 = await h.humanWithSession(['ontology_steward'], 'f2-ontology-steward');
    const preds = [...active.predicates, { predicate: 'depends_on', subject_types: ['organization'], object_types: ['place', 'product'] }];
    const types = (await sql<{ entity_types: string[] }>`select entity_types from graph.ontology_versions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and state = 'active'`.execute(su)).rows[0]!.entity_types;
    const proposed = await graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload: { namespace: 'domain', entityTypes: types, predicates: preds, rationale: 'the corrected relationship names a dependency the vocabulary lacks', alternatives: [] } }) as { ontology: Record<string, unknown> };
    expect(proposed.ontology).toMatchObject({ compatibility: 'additive' });
    await graph.decideOntology(h.req(steward2, 'graph.ontology.decide', 'ONT', String(proposed.ontology['version_id']), 'graph'), T(), D(), String(proposed.ontology['version_id']), { payload: { decision: 'approve', reason: 'additive; the dependency predicate is needed', reviews: { domain: 'passed', governance: 'passed' } } });
    await dispatcher.reconcile('B9-F2: re-drive after the repair', false, '0');
    const done = await waitFor('the re-derivation applied after the repair', () => deliveriesFor(corrected.id), (rows) => rows.find((d) => d.consumer_kind === 'relationships')?.state === 'applied', 120_000).then((r) => r.find((d) => d.consumer_kind === 'relationships')!);
    await settle();
    expect(done).toMatchObject({ state: 'applied', deliveries: 3, items_unresolved: [], failure_class: null, disposition: null });
    const applied = done.items_applied[0]!;
    expect(applied.effect).toBe('edge.re_derived');
    expect(applied.details).toMatchObject({ superseded: [edgeId], claim_version: 2, predicate: 'depends_on' });
    expect(await edgeRow(edgeId)).toMatchObject({ state: 'superseded', reassessment_state: 'reassessed', reassessment_outcome: 'superseded', superseded_by: applied.effect_ref });
    expect(await edgeRow(applied.effect_ref!)).toMatchObject({ state: 'asserted', claim_version: 2, asserted_by: relSub.principalId });
    expect((await sql<{ predicate: string }>`select predicate from graph.edges_current where edge_id = ${applied.effect_ref}::uuid`.execute(su)).rows[0]!.predicate).toBe('depends_on');
    await settle();
  }, 240_000);
});

describe('G2 closure (B10) · the review CASE decides what the builder graphs: a claim APPROVED in review is asserted by the builder\'s run and by the port though its payload still says queued; a claim REJECTED in review never is', () => {
  it('APPROVED → graphed; REJECTED → refused; both by the run and by the port', async () => {
    const { GraphOrchestrator } = await import('../../src/graph/graph.orchestrator.js');
    const orchestrator = h.app.get(GraphOrchestrator);
    const builder = await h.principalWith(['resolution_agent'], 'g2-builder');
    const approvedClaim = await seedQueuedClaim({ subject: 'NORDWERK Magnet GmbH', objectValue: 'Bab el-Mandeb Strait', evidence: evd });
    await acceptedResolution(approvedClaim.claimId, 'NORDWERK Magnet GmbH', E2, evd.id);
    const rejectedClaim = await seedQueuedClaim({ subject: 'NORDWERK Magnet GmbH', objectValue: 'Bab el-Mandeb Strait', evidence: evd });
    await acceptedResolution(rejectedClaim.claimId, 'NORDWERK Magnet GmbH', E2, evd.id);
    // The person decides: one approved, one rejected — the claims' own payloads keep review.state = queued (the extraction wrote it; nothing rewrites it).
    await intelligence.decideReview(h.req(reviewer, 'intelligence.review.decide', 'REV', approvedClaim.caseId, 'intelligence'), T(), D(), approvedClaim.caseId, { payload: { decision: 'approve', reason: 'the relationship holds as extracted' } });
    await intelligence.decideReview(h.req(reviewer, 'intelligence.review.decide', 'REV', rejectedClaim.caseId, 'intelligence'), T(), D(), rejectedClaim.caseId, { payload: { decision: 'reject', reason: 'the record does not support this relationship' } });
    const payloads = (await sql<{ object_id: string; state: string }>`select object_id::text, payload -> 'review' ->> 'state' state from objects.canonical_objects where object_id in (${approvedClaim.claimId}::uuid, ${rejectedClaim.claimId}::uuid)`.execute(su)).rows;
    expect(payloads.every((p) => p.state === 'queued')).toBe(true);
    // The builder's run: the approved claim's edge asserted; the rejected one skipped with the reason.
    const run = await orchestrator.runEdgeBuild({ envelope: h.env(builder, 'graph.edge.assert', 'EDG', null, 'graph'), principal: builder, tenantId: T(), domainId: D(), limit: 200 });
    const skippedFor = (claimId: string) => run.skipped.find((k) => k.claimObjectId === claimId);
    expect((await sql<{ n: number }>`select count(*)::int n from graph.edges_current where claim_object_id = ${approvedClaim.claimId}::uuid and state = 'asserted'`.execute(su)).rows[0]!.n).toBe(1);
    expect((await sql<{ n: number }>`select count(*)::int n from graph.edges_current where claim_object_id = ${rejectedClaim.claimId}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    expect(skippedFor(rejectedClaim.claimId)?.reason).toMatch(/rejected in review/);
    expect(skippedFor(approvedClaim.claimId)).toBeUndefined();
    // The port itself, under the operator's authority: the rejected claim's edge refused; the approved claim's edge admitted (a second assertion of the same version is the run's idempotency rule — asserted directly with a new id it is admitted by the port's review check, which is what is proved here).
    await expect(assertEdgeGoverned(owner, { predicate: 'ships_through', claimId: rejectedClaim.claimId, evidenceId: evd.id })).rejects.toThrow(/the claim behind it is rejected for review/);
    await settle();
  }, 180_000);
});

describe('B9 · ScenarioReviewed (L7-I05): continuation, dissent, promotion to simulation, retirement — a person\'s act, published with the scenario\'s links', () => {
  let strategist: AuthenticatedPrincipal; let scenarioId = ''; let baseline = ''; let downside = ''; let operator: AuthenticatedPrincipal;
  const review = (p: AuthenticatedPrincipal, id: string, payload: Record<string, unknown>) => prediction.reviewScenario(h.req(p, 'prediction.scenario.review', 'SCN', id), T(), D(), id, { payload }) as Promise<{ review: Record<string, unknown> }>;
  const scenarioRow = async (id: string) => (await sql<{ state: string; reviews: number; next_review_due_at: Date | null; last_reviewed_at: Date | null; retired_at: Date | null }>`select state, reviews, next_review_due_at, last_reviewed_at, retired_at from prediction.scenarios_current where scenario_id = ${id}::uuid`.execute(su)).rows[0]!;
  const branchRow = async (id: string) => (await sql<{ state: string; simulation_candidate_at: Date | null }>`select state, simulation_candidate_at from prediction.branches_current where branch_id = ${id}::uuid`.execute(su)).rows[0]!;
  const scenarioEvents = async (id: string) => (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from prediction.scenario_events where scenario_id = ${id}::uuid order by occurred_at, event_id`.execute(su)).rows;

  it('CONTINUE and DISSENT: the review falls due per the weekly cadence; a dissent records its position and rationale and changes nothing on the scenario; ScenarioReviewed carries the links; a workload principal and a dissent without a position are refused', async () => {
    strategist = await h.humanWithSession(['strategy_owner'], 'b9-strategist');
    operator = await h.principalWith(['simulation_operator'], 'b9-sim-operator');
    // A series on the fixture source and an indicator on it: the downside branch names the indicator that flips it (0029's rule).
    const sourceKey = (await sql<{ k: string }>`select source_key k from observation.source_contracts_current where source_id = ${h.fx.sourceId}::uuid order by contract_version desc limit 1`.execute(su)).rows[0]!.k;
    const seriesKey = `fixture:${sourceKey}:transits-b9`;
    await prediction.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), T(), D(),
      { payload: { seriesKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits (B9 scenario review)' } });
    const ind = await prediction.defineIndicator(h.req(owner, 'prediction.indicator.define', 'IND', null), T(), D(),
      { payload: { seriesKey, description: 'transits fall below 40 per day for five consecutive days', comparator: '<', threshold: 40, consecutiveDays: 5, owner: owner.principalId } }) as { indicator: { indicatorId: string } };
    const scn = await prediction.declareScenario(h.req(owner, 'prediction.scenario.declare', 'SCN', null), T(), D(),
      { payload: { title: 'Bab el-Mandeb over the next quarter (B9)', statement: 'what we expect of the corridor, and what would change it', forecastId: null, owner: owner.principalId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'transits at seasonal level', owner: owner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Corridor collapse', kind: 'downside', statement: 'transits stay below 40/day for five days', indicatorId: ind.indicator.indicatorId, signpost: 'five consecutive days under 40', owner: owner.principalId, consequence: 'rebook the third shipment before the window closes', responseWindowHours: 48 },
                   ] } }) as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
    scenarioId = scn.scenario.scenarioId; baseline = scn.scenario.branches.find((b) => b.kind === 'baseline')!.branchId; downside = scn.scenario.branches.find((b) => b.kind === 'downside')!.branchId;
    // Human-gated: the same roles held by a workload principal (an agent grant, not a person's session) are refused by the PEP before any port runs.
    const asWorkload: AuthenticatedPrincipal = { ...strategist, kind: 'workload', assurance: 'agent_grant' };
    await expect(review(asWorkload, scenarioId, { outcome: 'continue', note: 'a workload continuing a scenario' })).rejects.toMatchObject({ status: 403 });
    await expect(review(strategist, scenarioId, { outcome: 'dissent', note: 'a dissent without its position', dissent: { rationale: 'the baseline understates the reroute cost' } })).rejects.toThrow(/position and rationale/);
    const since = await mark();
    const c = await review(strategist, scenarioId, { outcome: 'continue', note: 'the corridor has not moved; the branches stand for another week' });
    expect(c.review).toMatchObject({ outcome: 'continue', review_ordinal: 1, state_after: 'active', cadence: 'weekly', branches_closed: 0 });
    const row = await scenarioRow(scenarioId);
    expect(row.state).toBe('active'); expect(row.reviews).toBe(1);
    const dueInDays = (row.next_review_due_at!.getTime() - row.last_reviewed_at!.getTime()) / 86_400_000;
    expect(dueInDays).toBeGreaterThan(6.99); expect(dueInDays).toBeLessThan(7.01);
    const ev = await outboxEvent('ScenarioReviewed', since, (p) => p['scenario_id'] === scenarioId && p['outcome'] === 'continue');
    expect(ev.payload).toMatchObject({ schema_version: 'v1', review_ordinal: 1, state_after: 'active', links: { forecast_id: null, decision_objects: [], dependents: [], simulation_runs: [] }, cause: { action: 'prediction.scenario.review', target_type: 'SCN', target_id: scenarioId } });
    const d = await review(strategist, scenarioId, { outcome: 'dissent', note: 'recorded dissent on the baseline branch', branch_id: baseline, dissent: { position: 'the baseline is optimistic', rationale: 'the carrier reroute notice of 14 January raises the baseline cost by a third' } });
    expect(d.review).toMatchObject({ outcome: 'dissent', review_ordinal: 2, state_after: 'active', branch: { branch_id: baseline, kind: 'baseline', state_after: 'open' } });
    expect((await scenarioRow(scenarioId)).state).toBe('active'); expect((await branchRow(baseline)).state).toBe('open');
    const events = await scenarioEvents(scenarioId);
    expect(events.map((e) => e.event)).toEqual(['scenario.declared', 'branch.added', 'branch.added', 'scenario.reviewed', 'scenario.reviewed']);
    expect(events[4]!.details).toMatchObject({ outcome: 'dissent', review_ordinal: 2, dissent: { position: 'the baseline is optimistic' } });
    await settle();
  }, 120_000);

  it('PROMOTE TO SIMULATION: the downside branch becomes the simulation candidate; promotion names a branch; a closed branch is refused', async () => {
    const r = await review(strategist, scenarioId, { outcome: 'promote_to_simulation', branch_id: downside, note: 'simulate the collapse branch against the magnet chain twin' });
    expect(r.review).toMatchObject({ outcome: 'promote_to_simulation', review_ordinal: 3, branch: { branch_id: downside, kind: 'downside', state_after: 'open' } });
    expect((await branchRow(downside)).simulation_candidate_at).not.toBeNull();
    expect((await branchRow(baseline)).simulation_candidate_at).toBeNull();
    await expect(review(strategist, scenarioId, { outcome: 'promote_to_simulation', note: 'promotion without a branch' })).rejects.toThrow(/names the branch/);
    await expect(review(strategist, scenarioId, { outcome: 'promote_to_simulation', branch_id: uuidv7(), note: 'promotion of a branch of another scenario' })).rejects.toThrow(/not a branch of scenario/);
    await settle();
  }, 120_000);

  it('RETIRE: the open branches close, the scenario leaves the portfolio with its history intact, a further review is refused, and a simulation run bound to the retired branch is refused by the service and by the port', async () => {
    const since = await mark();
    const r = await review(strategist, scenarioId, { outcome: 'retire', note: 'the corridor scenario is superseded by the Suez-return scenario declared this week' });
    expect(r.review).toMatchObject({ outcome: 'retire', review_ordinal: 4, state_after: 'retired', branches_closed: 2, next_review_due_at: null });
    const row = await scenarioRow(scenarioId);
    expect(row.state).toBe('retired'); expect(row.retired_at).not.toBeNull(); expect(row.next_review_due_at).toBeNull();
    expect((await branchRow(baseline)).state).toBe('closed'); expect((await branchRow(downside)).state).toBe('closed');
    const events = (await scenarioEvents(scenarioId)).map((e) => e.event);
    expect(events.slice(-4)).toEqual(['branch.closed', 'branch.closed', 'scenario.retired', 'scenario.reviewed']);
    const ev = await outboxEvent('ScenarioReviewed', since, (p) => p['scenario_id'] === scenarioId && p['outcome'] === 'retire');
    expect(ev.payload).toMatchObject({ state_after: 'retired', branches_closed: 2 });
    await expect(review(strategist, scenarioId, { outcome: 'continue', note: 'continuing a retired scenario' })).rejects.toThrow(/retired; a retired scenario is not reviewed again/);
    // A twin on the demonstration's records; a run bound to the retired branch is refused before the port (the service), and the port refuses it too.
    const up = await h.upload(RECORD_FILES());
    const records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
    const d = await twins.declare(h.req(owner, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'NORDWERK — magnet chain (B9 scenario review)', statement: 'the magnet chain',
      boundary: [E1], owner: owner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
    const twinId = d.twin.twinId;
    const o = await twins.openVersion(h.req(owner, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
    await twins.ground(h.req(owner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: { elements: completeElements(records) } });
    await twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(o.version.version), { payload: {} });
    const bound = { twinId, twinVersion: o.version.version, runKind: 'control', controlRunId: null, scenarioId, scenarioBranchId: downside, shock: false, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } };
    await expect(twins.run(h.req(operator, 'simulation.run', 'SIM', null), T(), D(), { payload: bound })).rejects.toThrow(/retired by review/);
    // The port itself, under the operator's authority in a governed transaction (the service's check bypassed; the pinned implementation offered): refused with the same reason.
    const pinned = (await sql<{ d: string }>`select implementation_digest d from twin.behaviour_models where method_ref = 'supply-flow@1'`.execute(su)).rows[0]!.d;
    const portRefusal = await h.pipeline.write(h.env(operator, 'simulation.run', 'SIM', null), operator, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'simulation.run', objectType: 'SIM', objectId: uuidv7() }, (tx) => tx,
      async (tx) => {
        await sql`select simulation.open_run(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${twinId}::uuid, ${o.version.version}, 'control', null, null, ${scenarioId}::uuid, ${downside}::uuid, 1, 'closed', false, 'none', 'SYN-PART-MAG', 'supply-flow@1', ${pinned}, 'x', '{}'::jsonb, 'deterministic', null, null, null, '{}'::jsonb, '[{"type": "none"}]'::jsonb, '{}'::jsonb, '[]'::jsonb, 'x', 'unvalidated', '{}'::jsonb, ${operator.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
        return { result: 'admitted', targetType: 'SIM', targetId: uuidv7(), targetVersion: '1', outboxEvent: null };
      }).catch((e: Error) => e.message);
    expect(String(portRefusal)).toMatch(/retired by review; a retired branch is not simulated/);
    // The run on no scenario still proceeds: the twin is usable; only the retired branch is refused.
    const free = await twins.run(h.req(operator, 'simulation.run', 'SIM', null), T(), D(), { payload: { ...bound, scenarioId: null, scenarioBranchId: null, shock: true } }) as { run: { state: string } };
    expect(free.run.state).toBe('completed');
    await settle();
  }, 180_000);
});

describe('B9 · a warning raised before the level derivation existed (0061) stays a governed record (0066 §11): marked for attention by the walk, acknowledged; a new raise without a level refused', () => {
  it('LEGACY ROW: an update (the attention marking the correction walk writes) succeeds; an INSERT without a level is refused at the raise', async () => {
    // A pre-0061 warning as the record holds it: no level, no derivation (0061 said such a row keeps NULL). Written by the superuser as history, as 0061 left it.
    const warningId = uuidv7();
    // History is seeded as history: the raise-time trigger is for raises, so the superuser writes the pre-0061 row with triggers off (replica role) in one transaction.
    await su.transaction().execute(async (tx) => {
      await sql`set local session_replication_role = replica`.execute(tx);
      await sql`insert into prediction.warnings_current (warning_id, scope, tenant_id, domain_id, branch_id, indicator_id, forecast_id, title, evidence, consequence, confidence, response_window_opens_at, response_window_closes_at, routed_to, raised_by, state, correlation_id, raised_as_of, timing_mode, controls)
        values (${warningId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, null, null, null, 'legacy corridor warning (raised before 0061)', ${JSON.stringify([{ kind: 'evidence', evidence_object_id: evd.id, evidence_version: evd.version, value: 31, observation_at: '2024-01-17' }])}::jsonb, 'rebook the third shipment', 0.7, now() - interval '30 days', now() - interval '28 days', ${owner.principalId}::uuid, ${owner.principalId}::uuid, 'raised', ${uuidv7()}::uuid, now() - interval '30 days', 'live', '{}'::jsonb)`.execute(tx);
    });
    // The walk's own statement (graph.record_impact, 0065 §8) on that row: before 0066 §11 it failed with wrn_level_derived.
    const marked = await sql<{ n: number }>`with u as (update prediction.warnings_current set attention_state = 'input_unverified', attention_reason = 'invalidation test: the forecast it rests on changed' where warning_id = ${warningId}::uuid and attention_state = 'none' returning 1) select count(*)::int n from u`.execute(su);
    expect(marked.rows[0]!.n).toBe(1);
    expect((await sql<{ attention_state: string; level: string | null }>`select attention_state, level from prediction.warnings_current where warning_id = ${warningId}::uuid`.execute(su)).rows[0]).toEqual({ attention_state: 'input_unverified', level: null });
    // A raise without its derived level is still refused — the 0061 rule, now at the insert.
    await expect(sql`insert into prediction.warnings_current (warning_id, scope, tenant_id, domain_id, branch_id, indicator_id, forecast_id, title, evidence, consequence, confidence, response_window_opens_at, response_window_closes_at, routed_to, raised_by, state, correlation_id, raised_as_of, timing_mode, controls)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, null, null, null, 'a raise without a level', ${JSON.stringify([{ kind: 'evidence', evidence_object_id: evd.id, evidence_version: evd.version }])}::jsonb, 'nothing to do here', 0.5, now(), now() + interval '2 days', ${owner.principalId}::uuid, ${owner.principalId}::uuid, 'raised', ${uuidv7()}::uuid, now(), 'live', '{}'::jsonb)`.execute(su)).rejects.toThrow(/carries its derived level/);
    await sql`delete from prediction.warnings_current where warning_id = ${warningId}::uuid`.execute(su);
  }, 60_000);
});
