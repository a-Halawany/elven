/**
 * CP-6 B23 part `revision` (migration 0084 §1–§4) — L4-I02 CommitGraphRevision: an ATOMIC, VALIDATED change set of nodes, identifiers
 * and edges with their ontology reference and provenance, applied as ONE graph revision of the domain — idempotent acceptance, one
 * authoritative effect, a conflicting expected revision rejected, a retry accepted only under the same idempotency key — on a real
 * database with real Redis, the real outbox publisher and the real subscription dispatcher (EYE_SCHEDULER_ENABLED at module top, the
 * B6 rule), the six GraphChanged consumer kinds registered in the harness's own domain.
 *
 * THE DEMONSTRATION: K. Müller (knowledge_owner, a human with a session of her own — the port compares the acting principal) commits
 * the supplier → port → route change set (two new entities, an identifier, two edges onto the existing route) as ONE revision against
 * the head she read; a conflicting expected revision is refused; a retry under the same key answers the first result; a validation
 * failure at edge 3 leaves nothing applied.
 *
 *   R1 · COMMIT: the head read; the change set applied (rows, event details the B20 derivations read, the lineage's provenance columns on
 *   the edges, the ledger and its five items), the head advanced by ONE step for the whole transaction, ONE GraphChanged/revision.committed.
 *   R2 · RETRY: the same key and change set → the first result (`repeated: true`), the head unchanged, no second outbox row, nothing written.
 *   R3 · THE KEY: the same key with another change set → 409; nothing applied.
 *   R4 · CONFLICT: a stale expected revision → 409 (conflict) naming both; nothing applied.
 *   R5 · ATOMIC: an invalid edge at position 3 (a self-edge; then an undeclared predicate) → 422 naming edge 3; the nodes and edges 1–2
 *   before it NOT applied (row counts, head, ledger, outbox unchanged).
 *   R6 · VALIDATION: a queued-review claim (409 claim_state), an entity type the ontology does not declare and a subject type the
 *   predicate does not admit (422 ontology), an evidence id and a digest that differ from the lineage (422 provenance), a claim of the
 *   wrong type (422), an entity that is not the domain's (404 dependency), a superseded ontology version named (409 conflict), an
 *   identifier held by another entity (409 identifier) — each leaving nothing applied.
 *   R7 · POLICY: a domain analyst and an ontology steward are refused by the PDP (403); the knowledge owner holds it.
 *   R8 · THE CONSUMERS: GraphChanged/revision.committed delivered to the six graph consumers, applied; the retrieval check verified the
 *   domain's projections (mismatched 0) and no partition is withdrawn.
 *   R9 · THE HEAD IS EVERY GRAPH WRITE'S: an ordinary builder edge write (graph.assert_edge through graph.edge.assert) and a retraction each
 *   advance it by one; the R1 change set expected before them is now a conflict; the R1 retry still answers the first result (the head
 *   moved since); a later-version REL claim's edge supersedes the earlier version's edge inside a revision.
 *   R10 · CONCURRENCY: two change sets against the same head at once — one revision, one conflict; the same key and body twice at once —
 *   one effect, one repeat.
 *   R11 · THE REGISTER: L4-I02 bound in 0084.
 *
 * EACH CASE LOGS ONE `B23 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import { GraphCapability } from '../../src/graph/graph.capabilities.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { CONSUMER_EVENT_TYPES, CONSUMER_KINDS, type ConsumerKind } from '../../src/graph/subscriptions/graph-change.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// C5 / Nit 8: this file's own vault roots (h.upload writes the evidence bytes).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b23-revision-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
type OutboxRow = { id: string; status: string; payload: Row; created_at: Date; partition_seq: number };
type Delivery = { event_id: string; consumer_kind: string; state: string; items: string[]; items_applied: Array<{ item: string; effect: string; effect_ref: string | null; details?: Row }>;
  items_unresolved: Array<{ item: string; effect: string; reason: string }>; last_error: string | null };
type Claim = { id: string; version: number; methodId: string; runId: string; evidence: Evd };
type Answer = Row & { revision_id: string; revision: number; expected: number; repeated: boolean; counts: Record<string, number>; node_ids: Row[]; edge_ids: Row[]; identifier_ids: Row[]; superseded_edges: Row[]; head?: number };
/** The six consumer kinds a GraphChanged reaches (relationships selects MemoryCorrected/claim.corrected alone; the B22 kinds their own types). */
const GRAPH_KINDS = CONSUMER_KINDS.filter((k) => k !== 'relationships' && CONSUMER_EVENT_TYPES[k].includes('GraphChanged'));

let h: Phase4Harness; let su: AnyDb;
let graph: GraphController; let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let kMueller: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
let builder: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let B: Evd; let B2: Evd;
let ONT = '';
const ROUTE = uuidv7(); const ROUTE_NAME = 'Hamburg–Singapore loop (AE7)';
/** The claims the change sets rest on (planted as the extraction admits them — see plantClaim). */
let entSupplier: Claim; let entPort: Claim; let relShips: Claim; let relServed: Claim; let entQueued: Claim; let relQueued: Claim; let relOther: Claim;
/** What R1 leaves the later cases. */
let R1: Answer; let R1_BODY: Row = {}; let R1_KEY = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}`);
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
/** A refused call: the HttpException's own answer (the PDP, the intake), or the mapper's for a port's raw refusal (asObservationRefusal — as the filter maps it). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B23 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the rows ───────────── */
const headNow = async (): Promise<number> => Number((await sql<{ head: string }>`select head::text from graph.revision_heads where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`.execute(su)).rows[0]?.head ?? 0);
/** Everything a change set could write, counted: a refusal must leave every number where it was. */
const footprint = async () => (await sql<Row>`select
    (select count(*)::int from graph.entities_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) entities,
    (select count(*)::int from graph.entity_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) entity_events,
    (select count(*)::int from graph.entity_identifiers where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) identifiers,
    (select count(*)::int from graph.edges_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) edges,
    (select count(*)::int from graph.edge_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) edge_events,
    (select count(*)::int from graph.revisions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) revisions,
    (select count(*)::int from graph.revision_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) revision_items,
    (select count(*)::int from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and event_type = 'GraphChanged' and payload -> 'change' ->> 'kind' = 'revision.committed') revision_events,
    (select coalesce((select head from graph.revision_heads where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid), 0)::int) head`.execute(su)).rows[0]!;
const outboxRows = async (after: Date, where: (p: Row) => boolean = () => true): Promise<OutboxRow[]> =>
  (await sql<OutboxRow>`select id::text, status, payload, created_at, partition_seq::int from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by partition_seq`.execute(su)).rows.filter((r) => where(r.payload));
const deliveriesFor = async (eventId: string): Promise<Delivery[]> =>
  (await sql<Delivery>`select event_id::text, consumer_kind, state, items, items_applied, items_unresolved, last_error from graph.subscription_deliveries where event_id = ${eventId}::uuid order by consumer_kind`.execute(su)).rows;
const graphApplied = async (eventId: string): Promise<Record<string, Delivery>> => {
  const ds = await waitFor(`the six deliveries of ${eventId} applied`, () => deliveriesFor(eventId), (rows) => rows.length === GRAPH_KINDS.length && rows.every((d) => d.state === 'applied'), 120_000);
  expect(sorted(ds.map((d) => d.consumer_kind))).toEqual(sorted(GRAPH_KINDS));
  return Object.fromEntries(ds.map((d) => [d.consumer_kind, d])) as Record<string, Delivery>;
};

/* ───────────── the routes (in process) ───────────── */
const commit = (as: AuthenticatedPrincipal, payload: Row) =>
  graph.commitRevision(h.req(as, 'graph.revision.commit', 'GRV', null, 'graph'), T(), D(), { payload }) as unknown as Promise<{ revision: Answer; receipt: Row }>;
const head = (as: AuthenticatedPrincipal = kMueller) =>
  graph.revisionHead(h.req(as, 'graph.read', 'GRV', null, 'graph'), T(), D()) as unknown as Promise<{ head: { revision: number; updatedAt: string | null; ontology: Row[]; recent: Row[] }; receipt: Row }>;
const register = (kind: ConsumerKind) => graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
  { payload: { consumerKind: kind, ownerPrincipalId: kMueller.principalId, backlog: 'leave' } as never }) as Promise<{ subscription: { subscriptionId: string; principalId: string }; served: { workerRunning: boolean } }>;

/* ───────────── the world planted WITH its events (the B20/B21 idiom) ───────────── */
async function seedEntity(id: string, type: string, name: string, actor: string): Promise<void> {
  const correlationId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${actor}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${actor}::uuid, ${JSON.stringify({ entity_type: type, canonical_name: name, normalized_name: name.toLowerCase(), split_from: null })}::jsonb, ${correlationId}::uuid)`.execute(su);
}
/**
 * An ENT or REL claim version as the extraction admits it — the canonical object (header digest computed), its lineage row (the claim
 * type, the run, the method, the evidence under its BYTES digest — what the EVD's payload names), and, when `queued`, the review case the
 * admission opens. PLANTED (the B21/B22 idiom): no cheap real extraction run in this world (the gateway's replay needs a recorded call).
 */
async function plantClaim(type: 'ENT' | 'REL', evidence: Evd, o: { subject: string; object?: string; queued?: boolean; id?: string; version?: number }): Promise<Claim> {
  const id = o.id ?? uuidv7(); const version = o.version ?? 1; const now = new Date().toISOString(); const runId = uuidv7(); const methodId = uuidv7();
  const lineage = { method_id: methodId, run_id: runId, mode: 'replay', evidence_object_id: evidence.id, evidence_digest: evidence.bytesDigest, byte_start: 0, byte_end: 4 };
  const payload: Row = { claim_kind: type === 'ENT' ? 'entity' : 'relationship', subject: o.subject, predicate: type === 'REL' ? 'related_to' : 'is', object_value: o.object ?? null, confidence: 0.91, lineage,
    review: o.queued === true ? { state: 'queued', reason: 'confidence below the floor', decider: null } : { state: 'approved', reason: 'fixture', decider: null } };
  const header: CanonicalHeader = {
    object_id: id, object_type: type, tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${evidence.id}@${evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${type}@v1`, ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const contentDigest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${id}::uuid, ${type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, ${`${type}@v1`}, null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${id}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidence.bytesDigest}, 0, 4, 0.91, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  if (o.queued === true) {
    await sql`insert into intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, ${version}, ${runId}::uuid, ${methodId}::uuid, 'below_review_threshold', 0.41, 'queued', ${uuidv7()}::uuid)`.execute(su);
  }
  return { id, version, methodId, runId, evidence };
}
const prov = (c: Claim, extra: Row = {}): Row => ({ claim_object_id: c.id, claim_version: c.version, ...extra });

/** THE DEMONSTRATION'S CHANGE SET: the supplier and the port as new entities, the supplier's LEI, supplier → port → the existing route. */
const supplierPortRoute = (over: { edges?: Row[]; nodes?: Row[]; identifiers?: Row[]; ontology?: string | null } = {}): Row => ({
  ontology: { version_id: over.ontology === undefined ? ONT : over.ontology },
  nodes: over.nodes ?? [
    { ref: 'supplier', entity_type: 'organization', canonical_name: 'NORDWERK Antriebstechnik GmbH', provenance: prov(entSupplier) },
    { ref: 'port', entity_type: 'place', canonical_name: 'Port of Hamburg', provenance: prov(entPort) },
  ],
  identifiers: over.identifiers ?? [{ entity: { ref: 'supplier' }, system_key: 'lei', value: `5299000NW${uuidv7().slice(-10)}`, provenance: prov(entSupplier) }],
  edges: over.edges ?? [
    { subject: { ref: 'supplier' }, predicate: 'ships_through', object: { ref: 'port' }, valid_from: '2024-01-01T00:00:00Z', provenance: prov(relShips) },
    { subject: { ref: 'port' }, predicate: 'served_by', object: { entity_id: ROUTE }, valid_from: '2024-01-01T00:00:00Z', valid_to: '2027-01-01T00:00:00Z', provenance: prov(relServed, { evidence_object_id: B2.id, evidence_digest: B2.bytesDigest }) },
  ],
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  graph = h.app.get(Gc);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  // THE PEOPLE — each acting human with a session of its own (the ports compare the acting principal).
  kMueller = await h.humanWithSession(['knowledge_owner'], 'b23-k-mueller');
  analyst = await h.humanWithSession(['domain_analyst'], 'b23-analyst');
  steward = await h.humanWithSession(['ontology_steward'], 'b23-steward');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b23-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b23-domain-admin');
  builder = await h.principalWith(['resolution_manager'], 'b23-builder');
  // THE EVIDENCE the claims rest on (real uploads: EVD objects whose payload names the bytes digest the lineage records).
  [B, B2] = (await h.upload([{ filename: 'b23-rev-b.csv', text: 'a,b\n1,2\n', documentTime: '2024-01-14T00:00:00Z' }, { filename: 'b23-rev-b2.csv', text: 'a,b\n3,4\n', documentTime: '2024-01-15T00:00:00Z' }]))
    .map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest })) as [Evd, Evd];
  // THE ONTOLOGY: proposed by the analyst, approved by the steward (never the proposer) through the routes — the domain's active version.
  const proposed = await graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload: {
    namespace: 'domain', entityTypes: ['organization', 'place', 'route'], rationale: 'B23: the supply-chain vocabulary a revision is validated against',
    predicates: [{ predicate: 'ships_through', subject_types: ['organization'], object_types: ['place'] }, { predicate: 'served_by', subject_types: ['place'], object_types: ['route'] },
                 { predicate: 'supplies', subject_types: ['organization'], object_types: ['organization'] }] } }) as unknown as { ontology: { version_id: string } };
  ONT = proposed.ontology.version_id;
  await graph.decideOntology(h.req(steward, 'graph.ontology.decide', 'ONT', ONT, 'graph'), T(), D(), ONT, { payload: { decision: 'approve', reason: 'B23: additive vocabulary, reviewed' } });
  // THE WORLD: the existing route (planted with its event), the identifier system, the claims.
  await seedEntity(ROUTE, 'route', ROUTE_NAME, builder.principalId);
  await graph.registerSystem(h.req(builder, 'graph.entity.create', 'IDS', null, 'graph'), T(), D(), { payload: { systemKey: 'lei', authority: 'GLEIF', description: 'Legal Entity Identifier', isAuthoritative: true } } as never);
  entSupplier = await plantClaim('ENT', B, { subject: 'NORDWERK Antriebstechnik GmbH' });
  entPort = await plantClaim('ENT', B, { subject: 'Port of Hamburg' });
  relShips = await plantClaim('REL', B, { subject: 'NORDWERK Antriebstechnik GmbH', object: 'Port of Hamburg' });
  relServed = await plantClaim('REL', B2, { subject: 'Port of Hamburg', object: ROUTE_NAME });
  entQueued = await plantClaim('ENT', B, { subject: 'Queued Supplier AG', queued: true });
  relQueued = await plantClaim('REL', B, { subject: 'Port of Hamburg', object: ROUTE_NAME, queued: true });
  relOther = await plantClaim('REL', B2, { subject: 'NORDWERK Antriebstechnik GmbH', object: 'Queued Supplier AG' });
  // THE SUBSCRIPTIONS: the six GraphChanged kinds, the backlog left (the world above is delivered to nothing).
  for (const kind of GRAPH_KINDS) {
    const r = await register(kind);
    expect(r.served.workerRunning, `${kind}: the domain's queue is served from registration`).toBe(true);
  }
  await settle();
}, 300_000);

afterAll(async () => {
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B23 · CommitGraphRevision — one atomic, validated, idempotent change set per graph revision (0084; L4-I02)', () => {
  it('R1 · COMMIT: K. Müller reads the head and commits supplier → port → route as ONE revision — the rows, the details, the provenance from the lineage, the ledger, one step, one event', async () => {
    const before = await footprint();
    const read = (await head()).head;
    expect(read.revision).toBe(before['head']);
    expect(read.ontology.map((o) => o['version_id'])).toEqual([ONT]);
    const since = await mark();
    R1_KEY = `k-mueller/supplier-port-route/${uuidv7()}`;
    R1_BODY = supplierPortRoute();
    const out = await commit(kMueller, { idempotency_key: R1_KEY, expected_revision: read.revision, change_set: R1_BODY });
    R1 = out.revision;
    expect(R1).toMatchObject({ expected: read.revision, revision: read.revision + 1, idempotency_key: R1_KEY, ontology_version_id: ONT, repeated: false,
      counts: { nodes: 2, identifiers: 1, identifiers_already: 0, edges: 2, superseded: 0 } });
    expect(R1.request_digest).toMatch(/^[0-9a-f]{64}$/);
    const after = await footprint();
    expect(after).toMatchObject({ entities: Number(before['entities']) + 2, identifiers: Number(before['identifiers']) + 1, edges: Number(before['edges']) + 2,
      revisions: Number(before['revisions']) + 1, revision_items: Number(before['revision_items']) + 5, head: Number(before['head']) + 1 });
    // THE NODES: rows and the entity.created details the B20 derivation reads.
    const [supplier, port] = R1.node_ids as Array<{ entity_id: string; ref: string }>;
    expect(supplier!.ref).toBe('supplier');
    const ent = (await sql<Row>`select entity_type, canonical_name, normalized_name, lifecycle_state, created_by::text from graph.entities_current where entity_id = ${supplier!.entity_id}::uuid`.execute(su)).rows[0]!;
    expect(ent).toEqual({ entity_type: 'organization', canonical_name: 'NORDWERK Antriebstechnik GmbH', normalized_name: 'nordwerk antriebstechnik', lifecycle_state: 'active', created_by: kMueller.principalId });
    const created = (await sql<{ details: Row }>`select details from graph.entity_events where entity_id = ${supplier!.entity_id}::uuid and event = 'entity.created'`.execute(su)).rows[0]!.details;
    expect(created).toMatchObject({ entity_type: 'organization', canonical_name: 'NORDWERK Antriebstechnik GmbH', normalized_name: 'nordwerk antriebstechnik', split_from: null, revision_id: R1.revision_id, claim_object_id: entSupplier.id });
    // THE IDENTIFIER: sourced from the ENT claim and its lineage's evidence.
    const ident = (await sql<Row>`select system_key, source_claim_object_id::text, source_evidence_object_id::text from graph.entity_identifiers where entity_id = ${supplier!.entity_id}::uuid`.execute(su)).rows;
    expect(ident).toEqual([{ system_key: 'lei', source_claim_object_id: entSupplier.id, source_evidence_object_id: B.id }]);
    // THE EDGES: the provenance columns FROM THE LINEAGE (evidence, digest, method, run, mode, confidence), the details the derivation reads.
    const [ships, served] = R1.edge_ids as Array<{ edge_id: string }>;
    const e1 = (await sql<Row>`select subject_entity_id::text, predicate, object_entity_id::text, state, evidence_object_id::text, evidence_digest, method_id::text, run_id::text, mode, confidence::text, claim_object_id::text, claim_version::int from graph.edges_current where edge_id = ${ships!.edge_id}::uuid`.execute(su)).rows[0]!;
    expect(e1).toEqual({ subject_entity_id: supplier!.entity_id, predicate: 'ships_through', object_entity_id: port!.entity_id, state: 'asserted', evidence_object_id: B.id, evidence_digest: B.bytesDigest,
      method_id: relShips.methodId, run_id: relShips.runId, mode: 'replay', confidence: '0.91', claim_object_id: relShips.id, claim_version: 1 });
    const e2 = (await sql<Row>`select object_entity_id::text, valid_to, evidence_object_id::text from graph.edges_current where edge_id = ${served!.edge_id}::uuid`.execute(su)).rows[0]!;
    expect(e2).toMatchObject({ object_entity_id: ROUTE, evidence_object_id: B2.id });
    const asserted = (await sql<{ details: Row }>`select details from graph.edge_events where edge_id = ${ships!.edge_id}::uuid and event = 'edge.asserted'`.execute(su)).rows[0]!.details;
    expect(asserted).toMatchObject({ predicate: 'ships_through', subject: supplier!.entity_id, object: port!.entity_id, mode: 'replay', claim_object_id: relShips.id, claim_version: 1, review_state: 'approved', revision_id: R1.revision_id });
    // THE LEDGER: the row and its five items (2 nodes, 1 identifier, 2 edges) with their provenance.
    const led = (await sql<Row>`select revision::int, expected_revision::int, idempotency_key, request_digest, ontology_version_id::text, committed_by::text from graph.revisions where revision_id = ${R1.revision_id}::uuid`.execute(su)).rows[0]!;
    expect(led).toEqual({ revision: R1.revision, expected_revision: R1.expected, idempotency_key: R1_KEY, request_digest: R1.request_digest, ontology_version_id: ONT, committed_by: kMueller.principalId });
    const items = (await sql<{ ordinal: number; kind: string; local_ref: string | null; provenance: Row }>`select ordinal, kind, local_ref, provenance from graph.revision_items where revision_id = ${R1.revision_id}::uuid order by ordinal`.execute(su)).rows;
    expect(items.map((i) => [i.ordinal, i.kind, i.local_ref])).toEqual([[1, 'node', 'supplier'], [2, 'node', 'port'], [3, 'identifier', 'supplier'], [4, 'edge', null], [5, 'edge', null]]);
    expect(items[3]!.provenance).toMatchObject({ claim_object_id: relShips.id, claim_version: 1, claim_type: 'REL', evidence_object_id: B.id, evidence_digest: B.bytesDigest, review_state: 'approved' });
    // THE ONE EVENT: GraphChanged/revision.committed, built from the answer.
    const rows = await waitFor('the revision.committed row published', () => outboxRows(since, (p) => obj(p['change'])['kind'] === 'revision.committed'), (xs) => xs.length === 1 && xs[0]!.status === 'published');
    const p = rows[0]!.payload;
    expect(p['cause']).toEqual({ action: 'graph.revision.commit', actor: kMueller.principalId, target_type: 'GRV', target_id: R1.revision_id });
    expect(p['revision']).toMatchObject({ revision_id: R1.revision_id, revision: R1.revision, expected: R1.expected, idempotency_key: R1_KEY, ontology_version_id: ONT });
    expect(sorted((p['identities'] as Row[]).map((i) => `${String(i['role'])}:${String(i['entity_id'])}`))).toEqual(sorted([`created:${supplier!.entity_id}`, `created:${port!.entity_id}`, `object:${ROUTE}`]));
    expect(sorted((obj(p['relationships'])['edges'] as Row[]).map((e) => e['edge_id']))).toEqual(sorted([ships!.edge_id, served!.edge_id]));
    expect(obj(p['objects'])).toMatchObject({ walked: false, truncated: false });
    expect(sorted(obj(p['objects'])['claims'] as string[])).toEqual(sorted([entSupplier.id, entPort.id, relShips.id, relServed.id]));
    sixEvidence('R1', { fault_trace: { revision_id: R1.revision_id, key: R1_KEY, digest: R1.request_digest }, watermark: { head_before: before['head'], head_after: after['head'], event_rows: { entity: Number(after['entity_events']) - Number(before['entity_events']), edge: Number(after['edge_events']) - Number(before['edge_events']) } },
      consumer_behaviour: { outbox: rows[0]!.id, kind: 'revision.committed', identities: (p['identities'] as Row[]).length }, operator_action: 'K. Müller (knowledge_owner) reads the head and commits the change set naming it and the active ontology version',
      recovery: 'none needed: one transaction, one step', reconciliation: { counts: R1.counts, items: items.length, one_step: Number(after['head']) - Number(before['head']) } });
  }, 240_000);

  it('R2 · RETRY: the same key and change set answer the FIRST result (repeated) — no second effect, no second event, the head unchanged', async () => {
    const before = await footprint(); const since = await mark();
    const again = (await commit(kMueller, { idempotency_key: R1_KEY, expected_revision: R1.expected, change_set: R1_BODY })).revision;
    expect(again.repeated).toBe(true);
    expect(again.head).toBe(before['head']);
    const { repeated: _r1, head: _h1, ...first } = R1; const { repeated: _r2, head: _h2, ...second } = again;
    expect(second).toEqual(first);
    await settle();
    expect(await footprint()).toEqual(before);
    expect(await outboxRows(since, (p) => obj(p['change'])['kind'] === 'revision.committed')).toEqual([]);
    sixEvidence('R2', { fault_trace: { key: R1_KEY, repeated: true }, watermark: { head: before['head'] }, consumer_behaviour: 'no event published for a repeat', operator_action: 'the client retries after a lost answer',
      recovery: 'the first result answered verbatim', reconciliation: { footprint_unchanged: true, revision_id: again.revision_id } });
  }, 120_000);

  it('R3 · THE KEY: the same key with ANOTHER change set is refused (409) — the retry boundary is the key AND its change set; nothing applied', async () => {
    const before = await footprint();
    const other = supplierPortRoute({ edges: [] });
    const r = await refused(commit(kMueller, { idempotency_key: R1_KEY, expected_revision: Number(before['head']), change_set: other }),
      new RegExp(`^graph revision rejected: idempotency key ${R1_KEY.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} was already used for a different change set \\(revision ${R1.revision}, digest ${R1.request_digest}\\)$`), 409, 'EYE-STA-002');
    expect(await footprint()).toEqual(before);
    sixEvidence('R3', { fault_trace: r.message, watermark: { head: before['head'] }, consumer_behaviour: 'nothing published', operator_action: 'a client reuses a key for a different change set',
      recovery: 'a new key for a new change set', reconciliation: { footprint_unchanged: true } });
  }, 60_000);

  it('R4 · CONFLICT: a change set made against a stale head is refused (409 conflict) naming both revisions; nothing applied', async () => {
    const before = await footprint();
    const stale = Number(before['head']) - 1;
    const r = await refused(commit(kMueller, { idempotency_key: `r4/${uuidv7()}`, expected_revision: stale, change_set: supplierPortRoute({ edges: [], identifiers: [] }) }),
      new RegExp(`^graph revision rejected \\(conflict\\): the domain stands at revision ${Number(before['head'])}, the change set expects ${stale}$`), 409, 'EYE-STA-002');
    expect(await footprint()).toEqual(before);
    sixEvidence('R4', { fault_trace: r.message, watermark: { head: before['head'], expected: stale }, consumer_behaviour: 'nothing published', operator_action: 'the client re-reads the head (POST …/graph/revisions/head)',
      recovery: 'the change set rebuilt against the new head', reconciliation: { footprint_unchanged: true } });
  }, 60_000);

  it('R5 · ATOMIC: an invalid edge at position 3 refuses the WHOLE change set (422 naming edge 3) — the nodes, the identifier and edges 1–2 before it are not applied', async () => {
    const before = await footprint();
    const base = supplierPortRoute({ nodes: [
      { ref: 'supplier2', entity_type: 'organization', canonical_name: 'NORDWERK Magnet GmbH', provenance: prov(entSupplier) },
      { ref: 'port2', entity_type: 'place', canonical_name: 'Port of Bremerhaven', provenance: prov(entPort) },
    ], identifiers: [{ entity: { ref: 'supplier2' }, system_key: 'lei', value: `5299000NM${uuidv7().slice(-10)}`, provenance: prov(entSupplier) }] });
    const two = [
      { subject: { ref: 'supplier2' }, predicate: 'ships_through', object: { ref: 'port2' }, valid_from: '2024-02-01T00:00:00Z', provenance: prov(relShips) },
      { subject: { ref: 'port2' }, predicate: 'served_by', object: { entity_id: ROUTE }, valid_from: '2024-02-01T00:00:00Z', provenance: prov(relServed) },
    ];
    const selfEdge = { ...base, edges: [...two, { subject: { ref: 'supplier2' }, predicate: 'supplies', object: { ref: 'supplier2' }, valid_from: '2024-02-01T00:00:00Z', provenance: prov(relOther) }] };
    const r1 = await refused(commit(kMueller, { idempotency_key: `r5a/${uuidv7()}`, expected_revision: Number(before['head']), change_set: selfEdge }),
      /^graph revision rejected: edge 3 relates entity [0-9a-f-]{36} to itself; a self-edge is not a relationship$/, 422, 'EYE-REQ-001');
    expect(await footprint()).toEqual(before);
    const undeclared = { ...base, edges: [...two, { subject: { ref: 'supplier2' }, predicate: 'owns', object: { ref: 'port2' }, valid_from: '2024-02-01T00:00:00Z', provenance: prov(relOther) }] };
    const r2 = await refused(commit(kMueller, { idempotency_key: `r5b/${uuidv7()}`, expected_revision: Number(before['head']), change_set: undeclared }),
      new RegExp(`^graph revision rejected \\(ontology\\): edge 3 has predicate owns, which ontology version ${ONT} \\(v1\\) does not declare$`), 422);
    const badInterval = { ...base, edges: [...two, { subject: { ref: 'supplier2' }, predicate: 'supplies', object: { entity_id: R1.node_ids[0]!['entity_id'] }, valid_from: '2024-02-01T00:00:00Z', valid_to: '2023-01-01T00:00:00Z', provenance: prov(relOther) }] };
    await refused(commit(kMueller, { idempotency_key: `r5c/${uuidv7()}`, expected_revision: Number(before['head']), change_set: badInterval }), /^graph revision rejected: edge 3 carries a valid_to after its valid_from/, 422);
    expect(await footprint()).toEqual(before);
    // …and the SAME change set without the bad edge is accepted (the refusal was the edge's, not the set's).
    const ok = (await commit(kMueller, { idempotency_key: `r5d/${uuidv7()}`, expected_revision: Number(before['head']), change_set: { ...base, edges: two } })).revision;
    expect(ok).toMatchObject({ revision: Number(before['head']) + 1, counts: { nodes: 2, identifiers: 1, edges: 2 } });
    await settle();
    sixEvidence('R5', { fault_trace: [r1.message, r2.message], watermark: { head_before: before['head'], head_after: ok.revision }, consumer_behaviour: 'nothing published for the refused sets; one revision.committed for the corrected one',
      operator_action: 'the client corrects edge 3 (or drops it) and commits again', recovery: 'accepted as one revision', reconciliation: { refused_footprint_unchanged: true, accepted: ok.counts } });
  }, 120_000);

  it('R6 · VALIDATION: a queued claim, an undeclared type, a subject type not admitted, a lineage mismatch, a wrong claim type, a foreign entity, a superseded ontology version, a held identifier — each refused, nothing applied', async () => {
    const before = await footprint(); const hd = Number(before['head']);
    const one = (cs: Row) => commit(kMueller, { idempotency_key: `r6/${uuidv7()}`, expected_revision: hd, change_set: cs });
    const node = (over: Row = {}): Row => ({ ref: 'n', entity_type: 'organization', canonical_name: 'Rev Six GmbH', provenance: prov(entSupplier), ...over });
    const edge = (over: Row = {}): Row => ({ subject: { ref: 'n' }, predicate: 'ships_through', object: { entity_id: R1.node_ids[1]!['entity_id'] }, valid_from: '2024-03-01T00:00:00Z', provenance: prov(relShips), ...over });
    const cs = (nodes: Row[], edges: Row[] = [], identifiers: Row[] = []): Row => ({ ontology: { version_id: ONT }, nodes, identifiers, edges });
    const msgs: string[] = [];
    msgs.push((await refused(one(cs([node({ provenance: prov(entQueued) })])), new RegExp(`^graph revision rejected \\(claim_state\\): node 1 \\(n\\) rests on claim ${entQueued.id}@1, which is queued for review; a claim a person has not decided is not promoted into the graph$`), 409, 'EYE-STA-002')).message);
    msgs.push((await refused(one(cs([node()], [edge({ provenance: prov(relQueued) })])), /^graph revision rejected \(claim_state\): edge 1 rests on claim .*, which is queued for review/, 409)).message);
    msgs.push((await refused(one(cs([node({ entity_type: 'vessel' })])), new RegExp(`^graph revision rejected \\(ontology\\): node 1 \\(n\\) has entity type vessel, which ontology version ${ONT} \\(v1\\) does not declare \\(it declares organization, place, route\\)$`), 422, 'EYE-REQ-001')).message);
    msgs.push((await refused(one(cs([node({ entity_type: 'place', canonical_name: 'A Place' })], [edge()])), /^graph revision rejected \(ontology\): edge 1 — predicate ships_through does not admit a place subject \(it admits \["organization"\]\)$/, 422)).message);
    msgs.push((await refused(one(cs([node()], [edge({ provenance: prov(relShips, { evidence_object_id: B2.id }) })])), new RegExp(`^graph revision rejected \\(provenance\\): edge 1 names evidence ${B2.id}, but claim ${relShips.id}@1 rests on evidence ${B.id} \\(its lineage\\); the evidence is the lineage's$`), 422)).message);
    msgs.push((await refused(one(cs([node()], [edge({ provenance: prov(relShips, { evidence_digest: 'f'.repeat(64) }) })])), /^graph revision rejected \(provenance\): edge 1 names evidence digest f{64}, but the lineage of claim .* records [0-9a-f]{64}; the digest is the lineage's$/, 422)).message);
    msgs.push((await refused(one(cs([node({ provenance: prov(relShips) })])), new RegExp(`^graph revision rejected \\(provenance\\): node 1 \\(n\\) rests on claim ${relShips.id}@1, an REL claim; it rests on an ENT claim$`), 422)).message);
    const foreign = uuidv7();
    msgs.push((await refused(one(cs([node()], [edge({ object: { entity_id: foreign } })])), new RegExp(`^graph revision rejected \\(dependency\\): edge 1 object names entity ${foreign}, which is not an entity of this domain$`), 404, 'EYE-STA-001')).message);
    msgs.push((await refused(one(cs([node({ provenance: prov({ ...entSupplier, version: 7 }) })])), /^graph revision rejected \(dependency\): node 1 \(n\) rests on claim .*@7, which is not admitted in this domain$/, 404)).message);
    msgs.push((await refused(one({ ...cs([node()]), ontology: { version_id: null } }), /^graph revision rejected \(ontology\): the domain has an active ontology version; the change set names it/, 422)).message);
    const held = String(R1.identifier_ids[0]!['value']);
    msgs.push((await refused(one(cs([node()], [], [{ entity: { ref: 'n' }, system_key: 'lei', value: held, provenance: prov(entSupplier) }])), new RegExp(`^graph revision rejected \\(identifier\\): identifier 1 — lei ${held} already identifies a different entity`), 409)).message);
    msgs.push((await refused(one(cs([node(), node()])), /^graph revision rejected: node 2 \(n\) repeats ref n; a ref names one node$/, 422)).message);
    msgs.push((await refused(one({ ...cs([node()]), strategy: [] }), /^graph revision rejected: the change set carries ontology, nodes, identifiers and edges only \(strategy objects are declared by graph\.strategy\.declare\)$/, 422)).message);
    expect(await footprint()).toEqual(before);
    // A SUPERSEDED ontology version: an additive v2 approved — the change set naming v1 is a conflict (re-read the ontology), nothing applied.
    const v2 = (await graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload: {
      namespace: 'domain', entityTypes: ['organization', 'place', 'route', 'vessel'], rationale: 'B23 R6: vessels join the vocabulary',
      predicates: [{ predicate: 'ships_through', subject_types: ['organization'], object_types: ['place'] }, { predicate: 'served_by', subject_types: ['place'], object_types: ['route'] },
                   { predicate: 'supplies', subject_types: ['organization'], object_types: ['organization'] }] } }) as unknown as { ontology: { version_id: string } }).ontology.version_id;
    await graph.decideOntology(h.req(steward, 'graph.ontology.decide', 'ONT', v2, 'graph'), T(), D(), v2, { payload: { decision: 'approve', reason: 'B23 R6: additive, reviewed' } });
    const moved = await footprint();
    expect(moved['head']).toBe(hd + 2); // the proposal and the decision: two graph transactions (ontology_events), two steps
    const r = await refused(commit(kMueller, { idempotency_key: `r6/${uuidv7()}`, expected_revision: Number(moved['head']), change_set: cs([node()]) }),
      new RegExp(`^graph revision rejected \\(conflict\\): ontology version ${ONT} is superseded, not the domain's active version; read the head and the ontology again$`), 409);
    expect(await footprint()).toEqual(moved);
    ONT = v2; // later cases name the active version
    sixEvidence('R6', { fault_trace: [...msgs, r.message], watermark: { head: moved['head'] }, consumer_behaviour: 'nothing published for any refusal', operator_action: 'the client corrects the named item (or waits for the review decision)',
      recovery: 'the corrected change set is accepted as one revision (R5, R9)', reconciliation: { refusals: msgs.length + 1, footprint_unchanged: true } });
  }, 180_000);

  it('R7 · POLICY: the domain analyst and the ontology steward are refused by the PDP (403); the knowledge owner and the resolution manager hold the act', async () => {
    const before = await footprint();
    for (const who of [analyst, steward]) {
      await refused(commit(who, { idempotency_key: `r7/${uuidv7()}`, expected_revision: Number(before['head']), change_set: supplierPortRoute() }), /./, 403, 'EYE-AUT-001');
    }
    expect(await footprint()).toEqual(before);
    // The head is a read every graph reader holds (the analyst reads it).
    expect((await head(analyst)).head.revision).toBe(before['head']);
    sixEvidence('R7', { fault_trace: 'graph.revision.commit denied for domain_analyst and ontology_steward', watermark: { head: before['head'] }, consumer_behaviour: 'nothing published',
      operator_action: 'a knowledge owner or resolution manager commits', recovery: 'n/a', reconciliation: { footprint_unchanged: true } });
  }, 60_000);

  it('R8 · THE CONSUMERS: revision.committed delivered to the six graph consumers and applied; the retrieval check verified the projections (mismatched 0), no partition withdrawn', async () => {
    const ev = (await sql<{ id: string }>`select id::text from objects.object_outbox where event_type = 'GraphChanged' and payload -> 'revision' ->> 'revision_id' = ${R1.revision_id}`.execute(su)).rows[0]!;
    const by = await graphApplied(ev.id);
    expect(by['retrieval']!.items_applied.map((x) => x.effect)).toEqual(['projections.verified']);
    const check = (await sql<{ mismatched: number; projections: Row[] }>`select mismatched::int, projections from graph.retrieval_checks where outbox_event_id = ${ev.id}::uuid`.execute(su)).rows[0]!;
    expect(check.mismatched).toBe(0);
    await settle();
    const parts = (await sql<{ projection: string; state: string }>`select projection, state from graph.projection_partitions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by projection`.execute(su)).rows;
    expect(parts.every((x) => x.state === 'serving'), JSON.stringify(parts)).toBe(true);
    // every revision.committed of this file so far was verified the same way
    const all = (await sql<{ mismatched: number }>`select c.mismatched::int from graph.retrieval_checks c join objects.object_outbox o on o.id = c.outbox_event_id where o.payload -> 'change' ->> 'kind' = 'revision.committed' and o.tenant_id = ${T()}::uuid and o.domain_id = ${D()}::uuid`.execute(su)).rows;
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.every((c) => c.mismatched === 0)).toBe(true);
    sixEvidence('R8', { fault_trace: { event: ev.id }, watermark: { checks: all.length, mismatched: 0 }, consumer_behaviour: Object.fromEntries(Object.entries(by).map(([k, d]) => [k, d.items_applied.map((x) => x.effect)])),
      operator_action: 'none', recovery: 'n/a', reconciliation: { partitions: parts.map((x) => `${x.projection}:${x.state}`) } });
  }, 180_000);

  it('R9 · THE HEAD IS EVERY GRAPH WRITE\'S: a builder edge write and a retraction each advance it by one; the R1 change set is then a conflict, its retry still the first result; a later claim version supersedes inside a revision', async () => {
    const h0 = await headNow();
    // THE BUILDER'S PORT (graph.assert_edge under graph.edge.assert) — an ordinary edge write, one transaction.
    const edgeId = uuidv7();
    // supplier → supplies → the organization R5 created (organization → organization, as the ontology admits)
    const magnet = (await sql<{ id: string }>`select entity_id::text id from graph.entities_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and canonical_name = 'NORDWERK Magnet GmbH'`.execute(su)).rows[0]!.id;
    await h.pipeline.write(h.env(builder, 'graph.edge.assert', 'EDG', edgeId, 'graph'), builder,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId }, GraphCapability.edges,
      async (cap) => {
        await cap.assertEdge({ edgeId, tenantId: T(), domainId: D(), subject: String(R1.node_ids[0]!['entity_id']), predicate: 'supplies', object: magnet,
          validFrom: '2024-04-01T00:00:00Z', validTo: null, claimObjectId: relOther.id, claimVersion: 1, evidenceObjectId: B2.id, evidenceDigest: B2.bytesDigest, methodId: relOther.methodId, runId: relOther.runId,
          mode: 'replay', confidence: 0.91, actor: builder.principalId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'EDG', targetId: edgeId, targetVersion: '1', outboxEvent: null };
      });
    expect(await headNow()).toBe(h0 + 1);
    // A RETRACTION through its route: one more step.
    await graph.retractEdge(h.req(dadmin, 'graph.edge.retract', 'EDG', edgeId, 'graph'), T(), D(), edgeId, { payload: { reason: 'B23 R9: the builder edge retracted (harness)' } });
    expect(await headNow()).toBe(h0 + 2);
    // The R1 change set under a NEW key against its old head: a conflict now.
    await refused(commit(kMueller, { idempotency_key: `r9/${uuidv7()}`, expected_revision: R1.expected, change_set: R1_BODY }), /^graph revision rejected \(conflict\): the domain stands at revision/, 409);
    // …and the R1 RETRY under its own key still answers the first result (the key is looked up before the revision check).
    const retry = (await commit(kMueller, { idempotency_key: R1_KEY, expected_revision: R1.expected, change_set: R1_BODY })).revision;
    expect(retry).toMatchObject({ repeated: true, revision_id: R1.revision_id, revision: R1.revision, head: h0 + 2 });
    // SUPERSESSION inside a revision: version 2 of the served_by claim — its edge supersedes EVERY still-asserted edge of version 1 (assert_edge's
    // rule): R1's port → route and R5's port2 → route both rest on version 1.
    const v2 = await plantClaim('REL', B2, { id: relServed.id, version: 2, subject: 'Port of Hamburg', object: ROUTE_NAME });
    const old = String(R1.edge_ids[1]!['edge_id']);
    const onV1 = (await sql<{ id: string }>`select edge_id::text id from graph.edges_current where claim_object_id = ${relServed.id}::uuid and claim_version = 1 and state = 'asserted' order by edge_id`.execute(su)).rows.map((x) => x.id);
    expect(onV1).toContain(old); expect(onV1).toHaveLength(2);
    const since = await mark();
    const sup = (await commit(kMueller, { idempotency_key: `r9/sup/${uuidv7()}`, expected_revision: h0 + 2, change_set: { ontology: { version_id: ONT }, edges: [
      { subject: { entity_id: R1.node_ids[1]!['entity_id'] }, predicate: 'served_by', object: { entity_id: ROUTE }, valid_from: '2024-01-01T00:00:00Z', provenance: prov(v2) }] } })).revision;
    expect(sup).toMatchObject({ revision: h0 + 3, counts: { nodes: 0, edges: 1, superseded: 2 } });
    expect(sup.superseded_edges).toEqual(onV1.map((id) => ({ edge_id: id, superseded_by: sup.edge_ids[0]!['edge_id'], claim_object_id: relServed.id })));
    expect((await sql<{ state: string; superseded_by: string }>`select state, superseded_by::text from graph.edges_current where edge_id = ${old}::uuid`.execute(su)).rows[0]).toEqual({ state: 'superseded', superseded_by: sup.edge_ids[0]!['edge_id'] });
    const ev = await waitFor('the superseding revision published', () => outboxRows(since, (p) => obj(p['change'])['kind'] === 'revision.committed'), (xs) => xs.length === 1 && xs[0]!.status === 'published');
    expect((obj(ev[0]!.payload['relationships'])['edges'] as Row[]).map((e) => `${String(e['state'])}:${String(e['edge_id'])}`)).toEqual([`asserted:${String(sup.edge_ids[0]!['edge_id'])}`, ...onV1.map((id) => `superseded:${id}`)]);
    const by = await graphApplied(ev[0]!.id);
    expect(by['retrieval']!.items_applied.map((x) => x.effect)).toEqual(['projections.verified']);
    sixEvidence('R9', { fault_trace: { builder_edge: edgeId, superseded: old }, watermark: { h0, after_builder: h0 + 1, after_retraction: h0 + 2, after_revision: sup.revision },
      consumer_behaviour: Object.fromEntries(Object.entries(by).map(([k, d]) => [k, d.state])), operator_action: 'ordinary graph writes interleave with revisions',
      recovery: 'the stale change set is refused; its retry under its own key still answers', reconciliation: { superseded_edges: sup.superseded_edges.length } });
  }, 240_000);

  it('R10 · CONCURRENCY: two change sets against one head at once — one revision, one conflict; one key and body twice at once — one effect, one repeat', async () => {
    const h0 = await headNow();
    const mk = (name: string): Row => ({ ontology: { version_id: ONT }, nodes: [{ ref: 'c', entity_type: 'organization', canonical_name: name, provenance: prov(entSupplier) }] });
    const settled = await Promise.allSettled([
      commit(kMueller, { idempotency_key: `r10a/${uuidv7()}`, expected_revision: h0, change_set: mk('Concurrent One AG') }),
      commit(kMueller, { idempotency_key: `r10b/${uuidv7()}`, expected_revision: h0, change_set: mk('Concurrent Two AG') }),
    ]);
    const won = settled.filter((s) => s.status === 'fulfilled'); const lost = settled.filter((s) => s.status === 'rejected');
    expect(won).toHaveLength(1); expect(lost).toHaveLength(1);
    const lostWhy = await refusal(Promise.reject((lost[0] as PromiseRejectedResult).reason));
    expect(lostWhy).toMatchObject({ status: 409 });
    expect(lostWhy.message).toMatch(new RegExp(`^graph revision rejected \\(conflict\\): the domain stands at revision ${h0 + 1}, the change set expects ${h0}$`));
    expect(await headNow()).toBe(h0 + 1);
    // the same key and change set twice at once: the second waits on the head, then finds the first's ledger row.
    const key = `r10c/${uuidv7()}`; const body = mk('Concurrent Three AG');
    const twice = await Promise.all([commit(kMueller, { idempotency_key: key, expected_revision: h0 + 1, change_set: body }), commit(kMueller, { idempotency_key: key, expected_revision: h0 + 1, change_set: body })]);
    expect(sorted(twice.map((t) => String(t.revision.repeated)))).toEqual(['false', 'true']);
    expect(new Set(twice.map((t) => t.revision.revision_id)).size).toBe(1);
    expect(await headNow()).toBe(h0 + 2);
    expect(Number((await sql<{ n: number }>`select count(*)::int n from graph.entities_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and canonical_name = 'Concurrent Three AG'`.execute(su)).rows[0]!.n)).toBe(1);
    await settle();
    sixEvidence('R10', { fault_trace: lostWhy.message, watermark: { h0, after: h0 + 2 }, consumer_behaviour: 'one event per accepted revision', operator_action: 'two clients race',
      recovery: 'the loser re-reads the head; the duplicate retry is answered as a repeat', reconciliation: { winners: 1, repeats: 1 } });
  }, 120_000);

  it('R11 · THE REGISTER: L4-I02 CommitGraphRevision bound in 0084', async () => {
    const row = (await sql<{ binding_state: string; bound_in: string; schema_version: string; bound_to: string }>`select binding_state, bound_in, schema_version, bound_to from objects.interface_register where interface_id = 'L4-I02'`.execute(su)).rows[0]!;
    expect(row).toMatchObject({ binding_state: 'bound', bound_in: '0084', schema_version: 'v1' });
    expect(row.bound_to).toMatch(/^CommitGraphRevision from POST …\/graph\/revisions \(graph\.revision\.commit/);
    sixEvidence('R11', { fault_trace: 'n/a', watermark: { bound_in: row.bound_in }, consumer_behaviour: 'n/a', operator_action: 'none', recovery: 'n/a', reconciliation: { binding_state: row.binding_state } });
  });
});
