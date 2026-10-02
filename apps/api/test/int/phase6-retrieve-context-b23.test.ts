/**
 * CP-6 B23 part `context` (migration 0084) — L3-I02 RetrieveContext BOUND: ONE purpose-bound query (POST …/graph/memory/context,
 * memory.context.retrieve) about a SUBJECT returns the policy-filtered memory with its explanation links, states its revision and
 * its staleness, changes no state, and answers partial or stale only with the declared product state — on a real database with real
 * Redis, the real outbox publisher and the real subscription dispatcher (EYE_SCHEDULER_ENABLED at module top, the B6 rule), the
 * RETRIEVAL subscription registered in the harness's own domain (it is what makes the watermark current), the corridor (an entity)
 * and the supplier's edge through it planted WITH their events (the B20 honest fixture), and memory items recorded through the route.
 *
 *   X1 · COMPLETE: the analyst (A. Hoffmann's role, domain_analyst) asks for the corridor's context under the purpose 'sourcing
 *   decision' → ONE answer: complete, OK, revision = verified_seq, lag 0; exactly the item the purpose, the clearance and the audience
 *   roles admit, with its explanation links (the corridor entity with its name and state, the edge with its predicate, the evidence
 *   version with its digest); nothing of the withheld items anywhere in the answer; one access row + one memory.retrieved event for
 *   the served version; the audit row OK with the versions served. The domain administrator and the executive see more (clearance /
 *   role), each read its own access rows.
 *   X2 · THE PURPOSE FILTER: the treasury item is served under 'treasury' only and never mentioned under 'sourcing decision'.
 *   X3 · REFUSALS: 403 without the action's role (a retention steward) and 403 for an empty purpose (the PDP); 422 for a blank purpose,
 *   a malformed subject (the port's 22023 texts through the mapper), an instant that is not one and a limit out of range (the route's).
 *   X4 · AS OF: the item superseded → the current context serves version 2 with its `supersedes` link to version 1; the context AS OF
 *   before the supersession serves version 1 (served_is_current false, current_version 2), its access row read_as_of the instant.
 *   X5 · STALE (lagging): the retrieval subscription paused, one change → stale, EYE-DEG-001, the lagging label, lag 1 — the items still
 *   served; resumed → the re-drive applies it → complete.
 *   X6 · PARTIAL (a withdrawn edges partition): the operator withdraws edges_current → partial: the edge link LEFT OUT and NAMED
 *   (omitted edges_current, rows 1, the withdrawal's reason and the rebuild route), the other links served; the audit EYE-DEG-001 with
 *   the omission; the rebuild restores it → complete.
 *   X7 · THE CONTENT TIER DOWN while memory_items_current is WITHDRAWN: 200 partial, the item set left out whole with the reason (never
 *   the 503 a single retrieval answers — shown beside it), no access row, the fault point consumed; the retry is served from the LOG
 *   (stale, index_state stale); a POISONED memory row linked to the corridor → never served, and (B23-F1, 0085 — the corrected
 *   contract; before, a counted "unverified" omission) neither counted nor mentioned: stale, with the constant log note; the poison
 *   removed, the rebuild → complete.
 *   X8 · NO STATE CHANGE: the revision, a hash of the domain's memory.items_current, the canonical MEM count, graph.projection_partitions,
 *   the dependencies and the outbox count equal before and after; only POL / AUD / item_access / memory.retrieved rows grow; the query
 *   function is STABLE and SECURITY INVOKER (pg_proc).
 *   X9 · THE REGISTER: L3-I02 bound in 0084 (no global count pinned — the integrator asserts 50/0/0).
 *
 * B23-F1 (migration 0085, the bounded review of 2026-09-25): the DIAGNOSTICS obey the same disclosure policy as the items — the
 * purpose, the reader's clearance and the audience roles are applied INSIDE the query (memory.retrieve_context re-declared with the
 * reader's clearance, roles and administrator flag), so every aggregate is computed over the AUTHORIZED set. An item linked to the
 * subject whose content version is ABSENT (the X7 technique: a memory.items_current row and its dependency planted by the superuser,
 * no canonical version) is the probe:
 *   X10 · (a) THE PURPOSE: an absent item for "treasury" only → under "sourcing decision" no omission, no count, no mention, the product
 *   state unchanged; under "treasury" it is named (content_tier, rows 1 — the positive control).
 *   X11 · (b) THE AUDIENCE: an absent item for the executive role → the analyst: nothing; the executive and the administrator: named.
 *   X12 · (c) THE CLEARANCE — the review's reproduction (zero authorized items + one absent confidential item under a purpose only it
 *   declares): the analyst (internal) complete with no omission (before 0085: partial, rows 1, "1 memory item(s) linked to this subject
 *   are not served…"); the domain administrator and the executive (confidential): named.
 *   X13 · (d) TRUNCATION over the authorized set: the route's limit and the port's scan bound (lowered for the case by a proxy on the
 *   capability's argument — the route and the query are the real ones): more purpose-admitted items than the bound but no more
 *   authorized ones → truncated false for the analyst; true for the administrator, who is authorized for more.
 *   X14 · (e) THE LOG: memory_items_current withdrawn, two poisoned rows linked to the subject (one that looks authorized, one that does
 *   not) → for every reader: stale, nothing counted, nothing mentioned, the constant CONTEXT_LOG_NOTE; the query answers no
 *   unverified_rows key at all (pg_proc).
 *
 * EACH CASE LOGS ONE `B23 CONTEXT EVIDENCE` LINE with the six things V04-T-024/026 demand (the fault trace, the affected-product
 * watermark, the consumer behaviour, the operator action, the recovery, the reconciliation).
 *
 * What this harness does NOT claim: relevance or ranking (newest first is the order); a multi-hop reach from the subject (only the
 * items whose served version names it); a connection-class failure of the content tier (the B20 statement).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ProjectionsController } from '../../src/graph/projections/projections.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { CONTEXT_CONSISTENCY_NOTE, CONTEXT_LOG_NOTE, CONTEXT_POLICY_NOTE, contentAbsentReason } from '../../src/graph/memory/context.js';
import type { MemoryService } from '../../src/graph/memory/memory.service.js';
import * as fault from '../../src/observation/fault-injection.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
// This file's own vault roots (h.upload writes the evidence the edge and the item rest on).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b23-context-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
type Link = { kind: string; id: string; via: string; rationale?: string; version?: number; digest?: string; state?: string; label?: string; names_subject?: boolean; object_type?: string };
type Item = Row & { item_id: string; version: number; explanation_links: Link[]; withheld_links: { edges_current: number; entities_current: number }; access_id: string };
type Context = { purpose: string; subject: Row; as_of: string | null; revision: number | null; verified_seq: number | null; lag_events: number; condition: string;
  product_state: 'complete' | 'stale' | 'partial'; code: string | null; label: string | null; source: string; items: Item[];
  omitted: Array<{ projection: string; reason: string; rows: number | null }>; policy: string; consistency: string; log_note: string | null; bound: Row; projection: Row };

let h: Phase4Harness; let su: AnyDb;
let graph: GraphController; let projections: ProjectionsController; let scheduler: SchedulerService;
let owner: AuthenticatedPrincipal; let recordAuthority: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal;
let retrievalSub = '';
const CORRIDOR = uuidv7(); const SUPPLIER = uuidv7(); const EDGE = uuidv7(); const CLAIM = uuidv7();
const CORRIDOR_NAME = 'Bab el-Mandeb Strait'; const SUPPLIER_NAME = 'NORDWERK Magnet GmbH';
const PURPOSE = 'sourcing decision';
let B: Evd;
let M1 = ''; let M2 = ''; let M3 = ''; let M4 = ''; let M5 = '';
let fillers = 0;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B23 CONTEXT EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 90_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 800)}`);
    await sleep(300);
  }
}
const settle = async (ms = 90_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const q = await scheduler.subscriptionQueueCountsForTests(T(), D());
    if (q.active === 0 && q.waiting === 0 && q.delayed === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(q)}`);
    await sleep(300);
  }
};
/** The domain's revision and the highest sequence the retrieval subscription applied (superuser reads — no governed read is spent on waiting). */
const watermark = async () => (await sql<{ rev: number | null; applied: number | null; unpublished: number }>`select
    (select max(partition_seq)::int from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and event_type in ('GraphChanged', 'MemoryCorrected')) as rev,
    (select max(partition_seq)::int from graph.subscription_deliveries where subscription_id = ${retrievalSub}::uuid and state = 'applied') as applied,
    (select count(*)::int from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and event_type in ('GraphChanged', 'MemoryCorrected') and status <> 'published') as unpublished`.execute(su)).rows[0]!;
/** Every change of the domain published and verified by the retrieval subscriber, the queue settled: the watermark is current. */
const verified = async (): Promise<{ rev: number | null; applied: number | null }> => {
  const w = await waitFor('the retrieval subscriber verified through the latest revision', watermark, (x) => x.unpublished === 0 && x.rev !== null && x.applied === x.rev, 120_000);
  await settle();
  return w;
};

/* ───────────── the refusal as the caller sees it (the B20 idiom) ───────────── */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};

/* ───────────── the routes ───────────── */
const context = async (who: AuthenticatedPrincipal, payload: Row = {}, purpose = PURPOSE): Promise<{ context: Context; receipt: { policyDecisionId: string; auditSeq: number } }> =>
  graph.memoryContext(h.req(who, 'memory.context.retrieve', 'MEM', null, purpose), T(), D(), { payload: { subject: { kind: 'entity', id: CORRIDOR }, ...payload } as never }) as never;
const withdraw = (projection: string, reason: string) =>
  projections.withdraw(h.req(domainAdmin, 'graph.projection.withdraw', 'PRJ', null, 'graph'), T(), D(), projection, { payload: { reason } }) as unknown as Promise<{ projection: Row }>;
const rebuild = (projection: string, reason: string) =>
  projections.rebuild(h.req(domainAdmin, 'graph.projection.rebuild', 'PRJ', null, 'graph'), T(), D(), projection, { payload: { reason } }) as unknown as Promise<{ rebuild: Row }>;
const control = (to: 'pause' | 'resume', reason: string) => {
  const req = h.req(domainAdmin, 'graph.subscription.control', 'SUB', retrievalSub, 'platform.administration');
  return to === 'pause' ? graph.pauseSubscription(req, T(), D(), retrievalSub, { payload: { reason } }) : graph.resumeSubscription(req, T(), D(), retrievalSub, { payload: { reason } });
};
const item = (over: Row = {}): Row => ({
  recordClass: 'strategic', title: 'B23 context item',
  statement: 'The corridor hold stood while the strait was closed; the second-source contract carried the magnet supply (B23 context harness).',
  source: { kind: 'human', ref: 'sourcing review, 2024-01-17' },
  audience: { classification: 'internal', roles: [], purposes: [PURPOSE, 'memory'] },
  validity: { from: '2024-01-17T00:00:00Z', to: null },
  retention: { profile: 'strategic-record-7y', retainUntil: '2031-01-17T00:00:00Z', basis: 'the decision record retention schedule' },
  cites: [], related: { decisionId: null, objectiveId: null }, ...over,
});
const corridorCite = { kind: 'entity', id: CORRIDOR, version: null, rationale: 'the corridor the lesson is about' };
const record = async (payload: Row): Promise<string> =>
  ((await graph.recordMemoryItem(h.req(owner, 'memory.item.record', 'MEM', null, 'memory'), T(), D(), { payload }) as { memory: { itemId: string } }).memory.itemId);
/** ONE change on demand: a filler record about the supplier (never the corridor) — a GraphChanged/memory_item.recorded the retrieval subscriber checks. */
const filler = async (why: string): Promise<string> => {
  fillers += 1;
  return record(item({ title: `B23 filler ${fillers}: ${why}`, cites: [{ kind: 'entity', id: SUPPLIER, version: null, rationale: 'the supplier, not the corridor' }] }));
};

/* ───────────── the ledgers ───────────── */
const accessRows = async (itemId: string) => (await sql<{ object_version: number; purpose_id: string; reader_principal_id: string; read_as_of: Date | null; policy_decision_id: string | null; correlation_id: string }>`
  select object_version::int, purpose_id, reader_principal_id::text, read_as_of, policy_decision_id::text, correlation_id::text from memory.item_access where item_id = ${itemId}::uuid order by accessed_at`.execute(su)).rows;
const accessCount = async () => (await sql<{ n: number }>`select count(*)::int n from memory.item_access where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`.execute(su)).rows[0]!.n;
const retrievedEvents = async () => (await sql<{ n: number }>`select count(*)::int n from memory.item_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and event = 'memory.retrieved'`.execute(su)).rows[0]!.n;
const auditRowOf = async (auditSeq: number) => (await sql<{ result_code: string; outcome: string; metadata: Row }>`select result_code, outcome, event -> 'metadata' as metadata from audit.audit_events
  where audit_seq = ${auditSeq} and tenant_id = ${T()}::uuid and action = 'memory.context.retrieve' and event_type = 'api.request'`.execute(su)).rows[0];
/** What the query must never change (X8): each a digest or a count of the domain's rows. */
const stateSnapshot = async () => (await sql<Row>`select
    (select max(partition_seq)::int from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and event_type in ('GraphChanged', 'MemoryCorrected')) as revision,
    (select count(*)::int from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) as outbox,
    (select md5(coalesce(string_agg(i::text, '|' order by i.item_id), '')) from memory.items_current i where i.tenant_id = ${T()}::uuid and i.domain_id = ${D()}::uuid) as items_hash,
    (select count(*)::int from objects.canonical_objects where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and object_type = 'MEM') as mem_versions,
    (select md5(coalesce(string_agg(p::text, '|' order by p.projection), '')) from graph.projection_partitions p where p.tenant_id = ${T()}::uuid and p.domain_id = ${D()}::uuid) as partitions_hash,
    (select md5(coalesce(string_agg(d::text, '|' order by d.dependency_id), '')) from graph.dependencies d where d.tenant_id = ${T()}::uuid and d.domain_id = ${D()}::uuid) as dependencies_hash,
    (select count(*)::int from graph.projection_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) as projection_events`.execute(su)).rows[0]!;
const governanceCounts = async () => (await sql<{ pol: number; aud: number }>`select
    (select count(*)::int from policy.policy_decisions where tenant_id = ${T()}::uuid and action = 'memory.context.retrieve') as pol,
    (select count(*)::int from audit.audit_events where tenant_id = ${T()}::uuid and action = 'memory.context.retrieve' and event_type = 'api.request') as aud`.execute(su)).rows[0]!;

/* ───────────── the world's rows, planted WITH their events (the B20 honest fixture) ───────────── */
async function seedEntity(id: string, type: string, name: string): Promise<void> {
  const correlationId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'entity.created', ${owner.principalId}::uuid, ${JSON.stringify({ entity_type: type, canonical_name: name, normalized_name: name.toLowerCase(), split_from: null })}::jsonb, ${correlationId}::uuid)`.execute(su);
}
async function seedEdge(edgeId: string, subject: string, predicate: string, object: string, claimId: string, evidence: Evd): Promise<void> {
  const methodId = uuidv7(); const runId = uuidv7(); const correlationId = uuidv7();
  await sql`insert into graph.edges_current (edge_id, scope, tenant_id, domain_id, subject_entity_id, predicate, object_entity_id, valid_from, valid_to, state, claim_object_id, claim_version, evidence_object_id, evidence_digest, method_id, run_id, mode, confidence, asserted_by, correlation_id)
    values (${edgeId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${subject}::uuid, ${predicate}, ${object}::uuid, '2024-01-01T00:00:00Z', null, 'asserted', ${claimId}::uuid, 1, ${evidence.id}::uuid, ${evidence.bytesDigest}, ${methodId}::uuid, ${runId}::uuid, 'replay', 0.9, ${owner.principalId}::uuid, ${correlationId}::uuid)`.execute(su);
  await sql`insert into graph.edge_events (event_id, scope, tenant_id, domain_id, edge_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${edgeId}::uuid, 'edge.asserted', ${owner.principalId}::uuid, jsonb_build_object('predicate', ${predicate}::text, 'subject', ${subject}::uuid, 'object', ${object}::uuid, 'valid_from', '2024-01-01T00:00:00Z'::timestamptz, 'valid_to', null, 'mode', 'replay', 'claim_object_id', ${claimId}::uuid, 'claim_version', 1, 'review_state', 'approved'), ${correlationId}::uuid)`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidence.bytesDigest}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
}

const ids = (c: Context): string[] => c.items.map((x) => x.item_id).sort();
const itemOf = (c: Context, id: string): Item => { const x = c.items.find((i) => i.item_id === id); expect(x, `item ${id} served`).toBeDefined(); return x!; };
const linkOf = (it: Item, kind: string, id?: string): Link | undefined => it.explanation_links.find((l) => l.kind === kind && (id === undefined || l.id === id));

/* ───────────── B23-F1 (0085): the probe — an item linked to the corridor whose content version is ABSENT ───────────── */
/** The X7 technique: a memory.items_current row naming version 1 with NO canonical version, and its dependency on the corridor — planted by the superuser (stated), removed by it. */
const plantAbsent = async (m: { title: string; classification: string; roles: string[]; purposes: string[] }): Promise<string> => {
  const id = uuidv7();
  await sql`insert into memory.items_current (item_id, scope, tenant_id, domain_id, object_version, record_class, title, statement, source_kind, owner_principal_id, classification, audience_roles, audience_purposes, valid_from, retention_profile, recorded_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 1, 'strategic', ${m.title}, 'A row whose content version the content tier does not hold (B23-F1 harness probe).', 'human', ${owner.principalId}::uuid, ${m.classification}, ${m.roles}::text[], ${m.purposes}::text[], '2024-01-01T00:00:00Z', 'strategic-record-7y', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${id}::uuid, 'MEM', 'entity', ${CORRIDOR}::uuid, 'the probe cites the corridor', 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  return id;
};
const removePlanted = async (id: string): Promise<void> => {
  await sql`delete from graph.dependencies where dependent_object_id = ${id}::uuid`.execute(su);
  await sql`delete from memory.items_current where item_id = ${id}::uuid`.execute(su);
};
/** What a policy-withheld probe must not change: the answer's state, its omissions, its items and its bound. */
const disclosed = (c: Context) => ({ product_state: c.product_state, code: c.code, label: c.label, omitted: c.omitted, items: ids(c), truncated: c.bound['truncated'] });
/** The capability with its scan bound lowered (X13): every other member is the real capability's, bound to it. */
const lowered = <C extends object>(cap: C, bound: number): C => new Proxy(cap, {
  get(t, p) {
    const v = Reflect.get(t, p, t) as unknown;
    if (p === 'retrieveContext') return (a: Row) => (v as (x: Row) => Promise<Row>).call(t, { ...a, scanBound: bound });
    return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(t) : v;
  },
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { ProjectionsController: Pc } = await import('../../src/graph/projections/projections.controller.js');
  graph = h.app.get(Gc); projections = h.app.get(Pc); scheduler = h.app.get(SchedulerService);
  // THE PEOPLE — each with a session of its own (the ports compare the acting principal). The analyst stands for A. Hoffmann (domain_analyst).
  owner = await h.humanWithSession(['knowledge_owner'], 'b23-ctx-owner');
  recordAuthority = await h.humanWithSession(['record_authority'], 'b23-ctx-record-authority');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b23-ctx-tenant-admin', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b23-ctx-domain-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'b23-ctx-analyst');
  executive = await h.humanWithSession(['executive'], 'b23-ctx-executive');
  steward = await h.humanWithSession(['retention_steward'], 'b23-ctx-steward');
  // THE WORLD: the evidence, the corridor and the supplier, the supplier's edge through the corridor (with its event and lineage).
  [B] = (await h.upload([{ filename: 'b23-context.csv', text: 'corridor,transit\nBab el-Mandeb,12\n', documentTime: '2024-01-14T00:00:00Z' }])).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest })) as [Evd];
  await seedEntity(CORRIDOR, 'place', CORRIDOR_NAME); await seedEntity(SUPPLIER, 'organization', SUPPLIER_NAME);
  await seedEdge(EDGE, SUPPLIER, 'ships_through', CORRIDOR, CLAIM, B);
  // THE RETRIEVAL SUBSCRIPTION (the watermark's verifier), registered by the tenant administrator with the backlog left.
  const r = await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
    { payload: { consumerKind: 'retrieval', ownerPrincipalId: owner.principalId, backlog: 'leave' } as never }) as { subscription: { subscriptionId: string }; served: { workerRunning: boolean } };
  retrievalSub = r.subscription.subscriptionId;
  expect(r.served.workerRunning).toBe(true);
  // THE ITEMS about the corridor (each a GraphChanged the subscriber verifies):
  //   M1 — the lesson for sourcing: cites the corridor, the supplier's edge and the evidence version; internal; sourcing decision + memory.
  //   M2 — for treasury only (the purpose filter).  M3 — confidential (the analyst's clearance is internal).  M4 — for executives (the audience roles).
  //   M5 — about the supplier only (not a candidate for the corridor).
  M1 = await record(item({ title: 'Corridor hold: the second source carried the supply', cites: [corridorCite,
    { kind: 'edge', id: EDGE, version: null, rationale: 'the supplier ships through the corridor' },
    { kind: 'evidence', id: B.id, version: B.version, rationale: 'the transit series the hold was read from' }] }));
  M2 = await record(item({ title: 'Corridor exposure for treasury', audience: { classification: 'internal', roles: [], purposes: ['treasury'] }, cites: [corridorCite] }));
  M3 = await record(item({ title: 'Corridor confidential negotiation note', audience: { classification: 'confidential', roles: [], purposes: [PURPOSE] }, cites: [corridorCite] }));
  M4 = await record(item({ title: 'Corridor note for the executive', audience: { classification: 'internal', roles: ['executive'], purposes: [PURPOSE] }, cites: [corridorCite] }));
  M5 = await filler('the supplier alone');
  await verified();
}, 300_000);

afterAll(async () => {
  fault.disarm();
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B23 · L3-I02 RetrieveContext — one purpose-bound query, policy-filtered, explained, its revision and staleness declared (0084)', () => {
  it('X1 · COMPLETE: the analyst\'s corridor context under "sourcing decision" — exactly the admitted item with its explanation links, revision = verified_seq, one access row, the audit OK; the administrator and the executive see what their clearance and roles admit', async () => {
    const w = await verified();
    const before = await accessRows(M1);
    const { context: c, receipt } = await context(analyst);
    expect(c).toMatchObject({ purpose: PURPOSE, subject: { kind: 'entity', id: CORRIDOR }, as_of: null, product_state: 'complete', code: null, label: null, condition: 'current',
      revision: w.rev, verified_seq: w.rev, lag_events: 0, source: 'projection', omitted: [], policy: CONTEXT_POLICY_NOTE, consistency: CONTEXT_CONSISTENCY_NOTE });
    expect(c.projection).toMatchObject({ condition: 'current', degraded: false, withdrawn: [] });
    expect((c.projection['partitions'] as Row[]).map((p) => p['projection'])).toEqual(['memory_items_current', 'edges_current', 'entities_current']);
    // exactly M1 — M2 (purpose), M3 (clearance), M4 (roles), M5 (not about the corridor) nowhere in the answer, not counted
    expect(ids(c)).toEqual([M1]);
    const text = JSON.stringify(c);
    for (const hidden of [M2, M3, M4, M5]) expect(text.includes(hidden), `${hidden} is neither counted nor mentioned`).toBe(false);
    const m1 = itemOf(c, M1);
    expect(m1).toMatchObject({ version: 1, title: 'Corridor hold: the second source carried the supply', classification: 'internal', truth_state: 'asserted', state: 'active', current_version: 1, served_is_current: true,
      index_state: 'projected', projected: true, basis_state: null, purpose_scope: 'memory', withheld_links: { edges_current: 0, entities_current: 0 } });
    expect(String(m1['statement'])).toMatch(/second-source contract carried the magnet supply/);
    // THE EXPLANATION LINKS: the corridor (name, state, names the subject), the edge (predicate, state, its claim version and evidence digest), the evidence version (its digest)
    expect(linkOf(m1, 'entity', CORRIDOR)).toMatchObject({ via: 'dependency', label: CORRIDOR_NAME, state: 'active', names_subject: true, rationale: 'the corridor the lesson is about' });
    expect(linkOf(m1, 'edge', EDGE)).toMatchObject({ via: 'dependency', label: 'ships_through', state: 'asserted', version: 1, digest: B.bytesDigest, names_subject: false });
    expect(linkOf(m1, 'evidence', B.id)).toMatchObject({ via: 'dependency', version: B.version, object_type: 'EVD', names_subject: false });
    expect(String(linkOf(m1, 'evidence', B.id)!.digest)).toMatch(/^[0-9a-f]{64}$/);
    expect(m1.explanation_links.map((l) => l.kind)).toEqual(['entity', 'edge', 'evidence']);
    // ONE access row for the served version, under the purpose, authorised by this request's policy decision
    const after = await accessRows(M1);
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)).toMatchObject({ object_version: 1, purpose_id: PURPOSE, reader_principal_id: analyst.principalId, read_as_of: null, policy_decision_id: receipt.policyDecisionId });
    expect(m1.access_id).toMatch(/^[0-9a-f-]{36}$/);
    for (const hidden of [M2, M3, M4]) expect((await accessRows(hidden)).filter((a) => a.reader_principal_id === analyst.principalId), `${hidden}: nothing recorded for the analyst`).toEqual([]);
    const aud = await auditRowOf(receipt.auditSeq);
    expect(aud).toMatchObject({ result_code: 'OK', outcome: 'success' });
    expect(aud!.metadata).toMatchObject({ purpose: PURPOSE, product_state: 'complete', revision: w.rev, condition: 'current', omitted: [], versions_served: [{ item_id: M1, version: 1, access_id: m1.access_id }] });
    // the domain administrator (confidential clearance; administrators are admitted to every audience role) and the executive (confidential; the executive role)
    const adminView = (await context(domainAdmin)).context;
    expect(ids(adminView)).toEqual([M1, M3, M4].sort());
    const execView = (await context(executive)).context;
    expect(ids(execView)).toEqual([M1, M3, M4].sort());
    expect((await accessRows(M3)).map((a) => a.reader_principal_id).sort()).toEqual([domainAdmin.principalId, executive.principalId].sort());
    sixEvidence('X1', {
      fault_trace: null, watermark: { revision: c.revision, verified_seq: c.verified_seq, condition: c.condition, product_state: c.product_state },
      consumer_behaviour: { served: ids(c), links: m1.explanation_links.map((l) => `${l.via}:${l.kind}`), admin: ids(adminView).length, executive: ids(execView).length },
      operator_action: null, recovery: null, reconciliation: { access_rows_m1: after.length, audit: aud!.result_code },
    });
  }, 180_000);

  it('X2 · THE PURPOSE FILTER: the treasury item is served under "treasury" and never mentioned under "sourcing decision"', async () => {
    const treasury = (await context(analyst, {}, 'treasury')).context;
    expect(ids(treasury)).toEqual([M2]);
    expect(itemOf(treasury, M2)).toMatchObject({ version: 1, title: 'Corridor exposure for treasury' });
    const sourcing = (await context(analyst)).context;
    expect(JSON.stringify(sourcing).includes(M2)).toBe(false);
    expect(sourcing.omitted).toEqual([]);
    expect((await accessRows(M2)).map((a) => a.purpose_id)).toEqual(['treasury']);
    sixEvidence('X2', { fault_trace: null, watermark: { product_state: sourcing.product_state }, consumer_behaviour: { treasury: ids(treasury), sourcing: ids(sourcing) },
      operator_action: null, recovery: null, reconciliation: 'the treasury item accessed once, under treasury' });
  }, 120_000);

  it('X3 · REFUSALS: 403 without the action\'s role and for an empty purpose (the PDP); 422 for a blank purpose and a malformed subject (the port) and for an instant or a limit out of range (the route); nothing recorded', async () => {
    const n0 = await accessCount();
    const noRole = await refusal(context(steward));
    expect(noRole).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    const empty = await refusal(context(analyst, {}, ''));
    expect(empty).toMatchObject({ status: 403 });
    const blank = await refusal(context(analyst, {}, '   '));
    expect(blank).toMatchObject({ status: 422, code: 'EYE-REQ-001' });
    expect(blank.message).toMatch(/^memory context rejected: a purpose is declared/);
    const badSubject = await refusal(context(analyst, { subject: { kind: 'planet', id: CORRIDOR } }));
    expect(badSubject).toMatchObject({ status: 422, code: 'EYE-REQ-001' });
    expect(badSubject.message).toMatch(/^memory context rejected: the subject names \{kind, id\}/);
    const noSubject = await refusal(graph.memoryContext(h.req(analyst, 'memory.context.retrieve', 'MEM', null, PURPOSE), T(), D(), { payload: {} as never }));
    expect(noSubject).toMatchObject({ status: 422 });
    expect(noSubject.message).toMatch(/^memory context rejected: the subject names/);
    expect(await refusal(context(analyst, { asOf: 'the day before yesterday' }))).toMatchObject({ status: 422, message: 'payload.asOf must be an instant (ISO 8601)' });
    expect(await refusal(context(analyst, { limit: 0 }))).toMatchObject({ status: 422, message: 'payload.limit is 1..200' });
    expect(await accessCount(), 'no refused request recorded an access').toBe(n0);
    sixEvidence('X3', { fault_trace: { no_role: noRole.status, empty_purpose: empty.status, blank_purpose: blank.message.slice(0, 60), subject: badSubject.message.slice(0, 60) },
      watermark: null, consumer_behaviour: 'refused before anything is served', operator_action: null, recovery: null, reconciliation: { access_rows_unchanged: n0 } });
  }, 120_000);

  it('X4 · AS OF: M1 superseded — the current context serves version 2 with its supersedes link; the context AS OF before the supersession serves version 1, its access row as of that instant', async () => {
    const t1 = await mark();
    await sleep(60);
    const v2 = item({ title: 'Corridor hold: the second source carried the supply (completed)', statement: 'The corridor hold stood while the strait was closed; the second source carried the supply until the strait reopened on 2024-02-02 (B23 context harness).',
      cites: [corridorCite, { kind: 'edge', id: EDGE, version: null, rationale: 'the supplier ships through the corridor' }],
      supersession: { reason: 'the strait reopened; the lesson is completed by its outcome', effectiveAt: '2024-02-02T00:00:00Z' } });
    const r = await graph.supersedeMemoryItem(h.req(recordAuthority, 'memory.item.supersede', 'MEM', M1, 'memory'), T(), D(), M1, { payload: v2 }) as { memory: { version: number } };
    expect(r.memory.version).toBe(2);
    await verified();
    const now = (await context(analyst)).context;
    expect(now.product_state).toBe('complete');
    const cur = itemOf(now, M1);
    expect(cur).toMatchObject({ version: 2, current_version: 2, served_is_current: true });
    expect(linkOf(cur, 'memory', M1)).toMatchObject({ via: 'supersedes', version: 1, rationale: 'the strait reopened; the lesson is completed by its outcome' });
    expect(String(linkOf(cur, 'memory', M1)!.digest)).toMatch(/^[0-9a-f]{64}$/);
    expect(linkOf(cur, 'evidence'), 'version 2 no longer cites the evidence').toBeUndefined();
    const then = (await context(analyst, { asOf: t1.toISOString() })).context;
    expect(then.as_of).toBe(t1.toISOString());
    const old = itemOf(then, M1);
    expect(old).toMatchObject({ version: 1, current_version: 2, served_is_current: false, title: 'Corridor hold: the second source carried the supply' });
    expect(linkOf(old, 'memory')).toBeUndefined();
    expect(linkOf(old, 'evidence', B.id)).toMatchObject({ version: B.version });
    const rows = await accessRows(M1);
    expect(rows.at(-1)).toMatchObject({ object_version: 1, purpose_id: PURPOSE, reader_principal_id: analyst.principalId });
    expect(new Date(rows.at(-1)!.read_as_of as Date).toISOString()).toBe(t1.toISOString());
    expect(rows.at(-2)).toMatchObject({ object_version: 2, read_as_of: null });
    // an instant before anything was recorded: nothing served, nothing mentioned
    const before = (await context(analyst, { asOf: '2020-01-01T00:00:00Z' })).context;
    expect(before.items).toEqual([]);
    expect(before.omitted).toEqual([]);
    sixEvidence('X4', { fault_trace: null, watermark: { revision: now.revision, as_of: t1.toISOString() }, consumer_behaviour: { now: cur.version, then: old.version, links_now: cur.explanation_links.map((l) => l.via) },
      operator_action: 'memory.item.supersede (the record authority)', recovery: null, reconciliation: { access: rows.slice(-2).map((a) => [a.object_version, a.read_as_of === null ? null : 'as_of']) } });
  }, 180_000);

  it('X5 · STALE: the retrieval subscription paused and one change → stale, EYE-DEG-001, the lagging label, lag 1, the items still served; resumed → complete', async () => {
    const w0 = await verified();
    await control('pause', 'B23 X5: the retrieval subscription paused (harness)');
    await filler('X5 while paused');
    await waitFor('the change published', watermark, (x) => x.unpublished === 0 && x.rev !== null && x.rev > (w0.rev ?? 0));
    await settle();
    const { context: c, receipt } = await context(analyst);
    expect(c).toMatchObject({ product_state: 'stale', code: 'EYE-DEG-001', condition: 'lagging', lag_events: 1, verified_seq: w0.rev, omitted: [] });
    expect(c.revision).toBe((w0.rev ?? 0) + 1);
    expect(c.label).toMatch(new RegExp(`^stale: verified through revision ${w0.rev} \\(at .*\\); 1 change\\(s\\) since are not yet verified by the retrieval subscriber — the ports write a projection and its log in one transaction, so this is verification lag, not data lag$`));
    expect(ids(c)).toEqual([M1]);
    const aud = await auditRowOf(receipt.auditSeq);
    expect(aud).toMatchObject({ result_code: 'EYE-DEG-001', outcome: 'success' });
    expect(aud!.metadata).toMatchObject({ product_state: 'stale', condition: 'lagging', result_code: 'EYE-DEG-001' });
    await control('resume', 'B23 X5: the retrieval subscription resumed (harness)');
    const w1 = await verified();
    const again = (await context(analyst)).context;
    expect(again).toMatchObject({ product_state: 'complete', code: null, label: null, condition: 'current', revision: w1.rev, verified_seq: w1.rev, lag_events: 0 });
    sixEvidence('X5', { fault_trace: { paused: retrievalSub }, watermark: { stale: { revision: c.revision, verified_seq: c.verified_seq, lag: c.lag_events }, complete: { revision: again.revision } },
      consumer_behaviour: 'the items served under the stale declaration', operator_action: 'graph.subscription.control pause / resume', recovery: 'the re-drive applied the paused change', reconciliation: { verified_seq: again.verified_seq } });
  }, 240_000);

  it('X6 · PARTIAL: edges_current withdrawn by the operator → the edge link left out and NAMED (rows 1, the reason, the rebuild route), the other links served, the audit EYE-DEG-001; the rebuild → complete', async () => {
    await verified();
    const reason = 'B23 X6: the edges partition suspected (harness)';
    await withdraw('edges_current', reason);
    const { context: c, receipt } = await context(analyst);
    expect(c).toMatchObject({ product_state: 'partial', code: 'EYE-DEG-001', condition: 'withdrawn', source: 'projection' });
    expect(c.omitted).toHaveLength(1);
    expect(c.omitted[0]).toMatchObject({ projection: 'edges_current', rows: 1 });
    expect(c.omitted[0]!.reason).toMatch(new RegExp(`^1 explanation link\\(s\\) to graph edges are left out: the edges_current projection of this domain is withdrawn since .* \\(${esc(reason)}\\) and cannot vouch for them until it is rebuilt \\(POST …/graph/projections/edges_current/rebuild \\(graph\\.projection\\.rebuild\\)\\)$`));
    expect(c.label).toMatch(/^partial: 1 explanation link\(s\) to graph edges are left out: /);
    const m1 = itemOf(c, M1);
    expect(linkOf(m1, 'edge'), 'the edge link is not served from a withdrawn partition').toBeUndefined();
    expect(linkOf(m1, 'entity', CORRIDOR)).toMatchObject({ label: CORRIDOR_NAME, state: 'active' });
    expect(m1.withheld_links).toEqual({ edges_current: 1, entities_current: 0 });
    const aud = await auditRowOf(receipt.auditSeq);
    expect(aud).toMatchObject({ result_code: 'EYE-DEG-001', outcome: 'success' });
    expect(aud!.metadata).toMatchObject({ product_state: 'partial', omitted: [{ projection: 'edges_current', rows: 1 }] });
    const r = (await rebuild('edges_current', 'B23 X6: rebuilt after the suspicion (harness)')).rebuild;
    expect(r).toMatchObject({ projection: 'edges_current', state: 'serving' });
    await verified();
    const back = (await context(analyst)).context;
    expect(back).toMatchObject({ product_state: 'complete', omitted: [], condition: 'current' });
    expect(linkOf(itemOf(back, M1), 'edge', EDGE)).toMatchObject({ label: 'ships_through', state: 'asserted' });
    sixEvidence('X6', { fault_trace: { withdrawn: 'edges_current', reason }, watermark: { condition: c.condition, product_state: c.product_state },
      consumer_behaviour: { omitted: c.omitted.map((o) => [o.projection, o.rows]), links: m1.explanation_links.map((l) => l.kind) }, operator_action: 'graph.projection.withdraw / graph.projection.rebuild',
      recovery: `rebuild ${String(r['outcome'])}`, reconciliation: { product_state: back.product_state } });
  }, 240_000);

  it('X7 · THE CONTENT TIER DOWN while memory_items_current is WITHDRAWN → 200 partial, the items left out whole and named (the single retrieval 503s beside it), no access row; the retry served from the log (stale); a poisoned row never served and — B23-F1 (0085), the corrected contract — neither counted nor mentioned (stale, the log note); the rebuild → complete', async () => {
    await verified();
    const reason = 'B23 X7: the memory partition suspected (harness)';
    await withdraw('memory_items_current', reason);
    const n0 = await accessCount();
    fault.arm(['b20.memory_content_unavailable'], 'test');
    const { context: down, receipt } = await context(analyst);
    expect(fault.isArmed('b20.memory_content_unavailable'), 'the context query consumed the point').toBe(false);
    expect(down).toMatchObject({ product_state: 'partial', code: 'EYE-DEG-001', condition: 'withdrawn', source: 'log', items: [], log_note: CONTEXT_LOG_NOTE });
    expect(down.omitted).toEqual([{ projection: 'content_tier', rows: null,
      reason: 'the memory items are not served: the content tier did not answer (injected fault at b20.memory_content_unavailable) while the memory_items_current projection of this domain is withdrawn; an item is served with its version or not at all — retry when the content tier answers' }]);
    expect(await accessCount(), 'nothing served, nothing recorded as served').toBe(n0);
    expect(await auditRowOf(receipt.auditSeq)).toMatchObject({ result_code: 'EYE-DEG-001', outcome: 'success' });
    // beside it, the single retrieval under the same fault answers B20's one refusal (503) — the context query never does
    fault.arm(['b20.memory_content_unavailable'], 'test');
    const single = await refusal(graph.retrieveMemoryItem(h.req(analyst, 'memory.item.retrieve', 'MEM', M1, PURPOSE), T(), D(), M1, { payload: {} }));
    expect(single).toMatchObject({ status: 503, code: 'EYE-DEG-001' });
    // THE RETRY (the tier answers; still withdrawn): served from the LOG, labelled — stale, nothing left out
    const log = (await context(analyst)).context;
    expect(log).toMatchObject({ product_state: 'stale', code: 'EYE-DEG-001', condition: 'withdrawn', source: 'log', omitted: [], log_note: CONTEXT_LOG_NOTE });
    expect(log.label).toMatch(/^stale: the memory_items_current projection of this domain is withdrawn since .* \(B23 X7: the memory partition suspected \(harness\)\); this answer is derived from the event log/);
    expect(itemOf(log, M1)).toMatchObject({ version: 2, index_state: 'stale', projected: true, drift: null });
    // A POISONED ROW linked to the corridor (the projection has it, the log does not): never served — and, B23-F1 (0085), its policy
    // metadata is untrusted by definition, so it is neither counted nor mentioned (before 0085: partial, a counted "unverified" omission)
    const P = uuidv7();
    await sql`insert into memory.items_current (item_id, scope, tenant_id, domain_id, object_version, record_class, title, statement, source_kind, owner_principal_id, classification, audience_roles, audience_purposes, valid_from, retention_profile, recorded_by, correlation_id)
      values (${P}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 1, 'strategic', 'Poisoned corridor row', 'A row no event recorded (B23 harness poison).', 'human', ${owner.principalId}::uuid, 'internal', '{}', ARRAY[${PURPOSE}]::text[], '2024-01-01T00:00:00Z', 'strategic-record-7y', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${P}::uuid, 'MEM', 'entity', ${CORRIDOR}::uuid, 'the poisoned row cites the corridor', 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const poisoned = (await context(analyst)).context;
    expect(poisoned).toMatchObject({ product_state: 'stale', code: 'EYE-DEG-001', source: 'log', omitted: [], log_note: CONTEXT_LOG_NOTE });
    expect(poisoned.label).toBe(log.label);
    expect(JSON.stringify(poisoned)).not.toMatch(/memory row\(s\)|unverified_rows/);
    expect(JSON.stringify(poisoned).includes(P)).toBe(false);
    expect(ids(poisoned)).toEqual([M1]);
    // the poison removed by the superuser (stated: it was planted by the superuser), the rebuild → complete
    await sql`delete from graph.dependencies where dependent_object_id = ${P}::uuid`.execute(su);
    await sql`delete from memory.items_current where item_id = ${P}::uuid`.execute(su);
    const r = (await rebuild('memory_items_current', 'B23 X7: rebuilt after the suspicion (harness)')).rebuild;
    expect(r).toMatchObject({ projection: 'memory_items_current', state: 'serving' });
    await verified();
    const back = (await context(analyst)).context;
    expect(back).toMatchObject({ product_state: 'complete', source: 'projection', omitted: [] });
    expect(itemOf(back, M1)).toMatchObject({ version: 2, index_state: 'projected' });
    sixEvidence('X7', { fault_trace: { point: 'b20.memory_content_unavailable', single_retrieval: single.status, poisoned: P }, watermark: { down: down.product_state, log: log.product_state, poisoned: poisoned.product_state },
      consumer_behaviour: { down: down.omitted.map((o) => o.projection), poisoned: poisoned.omitted.map((o) => [o.projection, o.rows]) }, operator_action: 'graph.projection.withdraw / graph.projection.rebuild; the poison removed by the superuser',
      recovery: `the retry from the log; rebuild ${String(r['outcome'])}`, reconciliation: { product_state: back.product_state, access_rows_while_down: 0 } });
  }, 240_000);

  it('X8 · NO STATE CHANGE: the revision, the items, the MEM versions, the partitions, the dependencies and the outbox unchanged by the query; only POL / AUD / access / memory.retrieved rows grow; the function is STABLE and SECURITY INVOKER', async () => {
    await verified();
    const before = await stateSnapshot(); const g0 = await governanceCounts(); const a0 = await accessCount(); const e0 = await retrievedEvents();
    const { context: c } = await context(analyst);
    const { context: c2 } = await context(analyst, { asOf: new Date().toISOString() });
    const after = await stateSnapshot(); const g1 = await governanceCounts(); const a1 = await accessCount(); const e1 = await retrievedEvents();
    expect(after).toEqual(before);
    const served = c.items.length + c2.items.length;
    expect(served).toBe(2);
    expect(a1 - a0).toBe(served);
    expect(e1 - e0).toBe(served);
    expect(g1.pol - g0.pol).toBe(2);
    expect(g1.aud - g0.aud).toBe(2);
    const fn = (await sql<{ provolatile: string; prosecdef: boolean }>`select provolatile, prosecdef from pg_proc where proname = 'retrieve_context' and pronamespace = 'memory'::regnamespace`.execute(su)).rows;
    expect(fn).toEqual([{ provolatile: 's', prosecdef: false }]);
    sixEvidence('X8', { fault_trace: null, watermark: { revision: before['revision'] }, consumer_behaviour: { served }, operator_action: null, recovery: null,
      reconciliation: { state_equal: true, pol: g1.pol - g0.pol, aud: g1.aud - g0.aud, access: a1 - a0, retrieved_events: e1 - e0 } });
  }, 180_000);

  it('X9 · THE REGISTER: L3-I02 RetrieveContext bound in 0084', async () => {
    const row = (await sql<{ binding_state: string; bound_in: string; schema_version: string; bound_to: string }>`select binding_state, bound_in, schema_version, bound_to from objects.interface_register where interface_id = 'L3-I02'`.execute(su)).rows[0]!;
    expect(row).toMatchObject({ binding_state: 'bound', bound_in: '0084', schema_version: 'v1' });
    expect(row.bound_to).toMatch(/^B23 \(0084\): POST …\/graph\/memory\/context \(memory\.context\.retrieve/);
    expect(row.bound_to).not.toMatch(/stays owed|no single purpose-bound context query/);
    sixEvidence('X9', { fault_trace: null, watermark: null, consumer_behaviour: null, operator_action: null, recovery: null, reconciliation: { L3_I02: row.binding_state, bound_in: row.bound_in } });
  }, 60_000);

  /* B23-F1 (0085) */
  it('X10 · B23-F1 (a) THE PURPOSE: an absent item linked to the corridor for "treasury" only → under "sourcing decision" no omission, no count, no mention, the product state unchanged; under "treasury" it is named (the positive control)', async () => {
    await verified();
    const base = (await context(analyst)).context;
    const A = await plantAbsent({ title: 'B23-F1 absent treasury probe', classification: 'internal', roles: [], purposes: ['treasury'] });
    try {
      const n0 = await accessCount();
      const { context: c, receipt } = await context(analyst);
      expect(disclosed(c)).toEqual(disclosed(base));
      expect(c).toMatchObject({ product_state: 'complete', code: null, omitted: [], source: 'projection', log_note: null });
      expect(ids(c)).toEqual([M1]);
      expect(JSON.stringify(c).includes(A)).toBe(false);
      expect(JSON.stringify(c)).not.toMatch(/not served/);
      const aud = await auditRowOf(receipt.auditSeq);
      expect(aud).toMatchObject({ result_code: 'OK', outcome: 'success' });
      expect(aud!.metadata).toMatchObject({ product_state: 'complete', omitted: [] });
      expect(JSON.stringify(aud).includes(A)).toBe(false);
      // THE POSITIVE CONTROL: under "treasury" the reader may see the item — the content-absent omission is counted and named
      const t = (await context(analyst, {}, 'treasury')).context;
      expect(t).toMatchObject({ product_state: 'partial', code: 'EYE-DEG-001', source: 'projection' });
      expect(t.omitted).toEqual([{ projection: 'content_tier', rows: 1, reason: contentAbsentReason(1) }]);
      expect(ids(t)).toEqual([M2]);
      expect(JSON.stringify(t).includes(A), 'counted, never named by id').toBe(false);
      expect(await accessCount() - n0, 'the served items only (M1 under sourcing, M2 under treasury)').toBe(2);
      expect(await accessRows(A)).toEqual([]);
      sixEvidence('X10', { fault_trace: { probe: A, absent: 'content version 1', purposes: ['treasury'] }, watermark: { sourcing: c.product_state, treasury: t.product_state },
        consumer_behaviour: { sourcing_omitted: c.omitted.length, treasury_omitted: t.omitted.map((o) => [o.projection, o.rows]) }, operator_action: 'the probe planted by the superuser',
        recovery: null, reconciliation: { unchanged_for_the_withheld_purpose: true } });
    } finally { await removePlanted(A); }
  }, 180_000);

  it('X11 · B23-F1 (b) THE AUDIENCE: an absent item for the executive role → the analyst (who lacks it): no omission, no count, no mention, the product state unchanged; the executive and the domain administrator: named', async () => {
    await verified();
    const base = (await context(analyst)).context;
    const A = await plantAbsent({ title: 'B23-F1 absent executive probe', classification: 'internal', roles: ['executive'], purposes: [PURPOSE] });
    try {
      const { context: c, receipt } = await context(analyst);
      expect(disclosed(c)).toEqual(disclosed(base));
      expect(c).toMatchObject({ product_state: 'complete', omitted: [] });
      expect(JSON.stringify(c).includes(A)).toBe(false);
      expect(JSON.stringify(await auditRowOf(receipt.auditSeq)).includes(A)).toBe(false);
      const ex = (await context(executive)).context;
      expect(ex).toMatchObject({ product_state: 'partial', code: 'EYE-DEG-001' });
      expect(ex.omitted).toEqual([{ projection: 'content_tier', rows: 1, reason: contentAbsentReason(1) }]);
      expect(ids(ex)).toEqual([M1, M3, M4].sort());
      const ad = (await context(domainAdmin)).context;
      expect(ad.omitted).toEqual([{ projection: 'content_tier', rows: 1, reason: contentAbsentReason(1) }]);
      expect(await accessRows(A)).toEqual([]);
      sixEvidence('X11', { fault_trace: { probe: A, roles: ['executive'] }, watermark: { analyst: c.product_state, executive: ex.product_state, admin: ad.product_state },
        consumer_behaviour: { analyst_omitted: c.omitted.length, executive: ex.omitted.map((o) => o.rows), admin: ad.omitted.map((o) => o.rows) }, operator_action: 'the probe planted by the superuser',
        recovery: null, reconciliation: { unchanged_for_the_reader_without_the_role: true } });
    } finally { await removePlanted(A); }
  }, 180_000);

  it('X12 · B23-F1 (c) THE CLEARANCE — the review\'s reproduction: zero authorized items + one absent CONFIDENTIAL item under a purpose only it declares → the analyst (internal): complete, no omission, no count, no mention; the domain administrator and the executive (confidential): named', async () => {
    await verified();
    const REPRO = 'b23-f1 reproduction';
    const base = (await context(analyst, {}, REPRO)).context;
    expect(base).toMatchObject({ product_state: 'complete', items: [], omitted: [] });
    const A = await plantAbsent({ title: 'B23-F1 absent confidential probe', classification: 'confidential', roles: [], purposes: [REPRO] });
    try {
      const { context: c, receipt } = await context(analyst, {}, REPRO);
      // the review's reproduction, as the route answers it (before 0085: partial, omitted [{content_tier, rows 1, "1 memory item(s) linked to this subject are not served: …"}])
      console.log(`B23-F1 REPRODUCTION (the analyst, internal; purpose "${REPRO}"; one confidential content-absent item): ${JSON.stringify({ product_state: c.product_state, code: c.code, label: c.label, omitted: c.omitted, items: ids(c), truncated: c.bound['truncated'] })}`);
      expect(disclosed(c)).toEqual(disclosed(base));
      expect(c).toMatchObject({ product_state: 'complete', code: null, label: null, items: [], omitted: [] });
      expect(JSON.stringify(c).includes(A)).toBe(false);
      expect(JSON.stringify(c)).not.toMatch(/not served/);
      expect(await auditRowOf(receipt.auditSeq)).toMatchObject({ result_code: 'OK' });
      for (const who of [domainAdmin, executive]) {
        const v = (await context(who, {}, REPRO)).context;
        expect(v).toMatchObject({ product_state: 'partial', code: 'EYE-DEG-001', items: [] });
        expect(v.omitted).toEqual([{ projection: 'content_tier', rows: 1, reason: contentAbsentReason(1) }]);
      }
      expect(await accessRows(A)).toEqual([]);
      sixEvidence('X12', { fault_trace: { probe: A, classification: 'confidential', purpose: REPRO }, watermark: { analyst: c.product_state },
        consumer_behaviour: { analyst: { items: c.items.length, omitted: c.omitted.length }, confidential_readers: 'content_tier rows 1' }, operator_action: 'the probe planted by the superuser',
        recovery: null, reconciliation: { review_reproduction: 'complete with no omission (was partial, rows 1)' } });
    } finally { await removePlanted(A); }
  }, 180_000);

  it('X13 · B23-F1 (d) TRUNCATION over the AUTHORIZED set: the route\'s limit and the port\'s scan bound — more purpose-admitted items than the bound, no more authorized ones → truncated false for the analyst; true for the domain administrator', async () => {
    await verified();
    // under "sourcing decision" three items are purpose-admitted (M1, M3 confidential, M4 for the executive); the analyst is authorized for M1 alone
    const a1 = (await context(analyst, { limit: 1 })).context;
    expect(ids(a1)).toEqual([M1]);
    expect(a1.bound).toMatchObject({ limit: 1, truncated: false });
    const d1 = (await context(domainAdmin, { limit: 1 })).context;
    expect(d1.items).toHaveLength(1);
    expect(d1.bound).toMatchObject({ limit: 1, truncated: true });
    const d3 = (await context(domainAdmin, { limit: 3 })).context;
    expect(ids(d3)).toEqual([M1, M3, M4].sort());
    expect(d3.bound).toMatchObject({ limit: 3, truncated: false });
    // THE PORT'S SCAN BOUND lowered to 1 for this case (a proxy on the capability's argument; the route and the query are the real ones)
    const svc = (graph as unknown as { memory: MemoryService }).memory;
    const real = svc.context.bind(svc);
    const spy = vi.spyOn(svc, 'context').mockImplementation((cap, ...rest) => real(lowered(cap, 1), ...rest));
    try {
      const a = (await context(analyst)).context;
      expect(ids(a)).toEqual([M1]);
      expect(a.bound).toMatchObject({ truncated: false });
      expect(a).toMatchObject({ product_state: 'complete', omitted: [] });
      const d = (await context(domainAdmin)).context;
      expect(d.items).toHaveLength(1);
      expect(d.bound).toMatchObject({ truncated: true });
      expect(spy).toHaveBeenCalledTimes(2);
      sixEvidence('X13', { fault_trace: { scan_bound: 1, route_limit: [1, 3] }, watermark: { analyst: a.product_state },
        consumer_behaviour: { analyst: { limit1: a1.bound['truncated'], scan1: a.bound['truncated'] }, admin: { limit1: d1.bound['truncated'], limit3: d3.bound['truncated'], scan1: d.bound['truncated'] } },
        operator_action: null, recovery: null, reconciliation: 'truncation declared over the authorized set only' });
    } finally { spy.mockRestore(); }
  }, 180_000);

  it('X14 · B23-F1 (e) THE LOG: memory_items_current withdrawn, two poisoned rows linked to the corridor → for every reader stale from the log, nothing counted, nothing mentioned, the constant log note; the query answers no unverified_rows key; the rebuild → complete', async () => {
    await verified();
    const reason = 'B23-F1 X14: the memory partition suspected (harness)';
    await withdraw('memory_items_current', reason);
    const P1 = await plantAbsent({ title: 'B23-F1 poisoned row that looks authorized', classification: 'internal', roles: [], purposes: [PURPOSE] });
    const P2 = await plantAbsent({ title: 'B23-F1 poisoned restricted row', classification: 'restricted', roles: ['executive'], purposes: [PURPOSE] });
    const seen: Row = {};
    try {
      for (const [name, who] of [['analyst', analyst], ['executive', executive], ['domain_admin', domainAdmin], ['tenant_admin', tenantAdmin]] as const) {
        const c = (await context(who)).context;
        expect(c, name).toMatchObject({ product_state: 'stale', code: 'EYE-DEG-001', condition: 'withdrawn', source: 'log', omitted: [], log_note: CONTEXT_LOG_NOTE });
        const text = JSON.stringify(c);
        expect(text.includes(P1) || text.includes(P2), `${name}: the poisoned rows are never mentioned`).toBe(false);
        expect(text, name).not.toMatch(/unverified_rows|memory row\(s\)|not served/);
        expect(c.items.every((i) => i['index_state'] === 'stale'), name).toBe(true);
        seen[name] = { items: c.items.length, omitted: c.omitted.length };
      }
      const src = (await sql<{ unverified: boolean; nargs: number }>`select prosrc like '%unverified_rows%' as unverified, pronargs::int as nargs from pg_proc where proname = 'retrieve_context' and pronamespace = 'memory'::regnamespace`.execute(su)).rows;
      expect(src).toEqual([{ unverified: false, nargs: 10 }]);
    } finally { await removePlanted(P1); await removePlanted(P2); }
    const r = (await rebuild('memory_items_current', 'B23-F1 X14: rebuilt after the suspicion (harness)')).rebuild;
    expect(r).toMatchObject({ projection: 'memory_items_current', state: 'serving' });
    await verified();
    const back = (await context(analyst)).context;
    expect(back).toMatchObject({ product_state: 'complete', source: 'projection', omitted: [], log_note: null });
    sixEvidence('X14', { fault_trace: { withdrawn: 'memory_items_current', reason, poisoned: [P1, P2] }, watermark: { condition: 'withdrawn', product_state: 'stale' },
      consumer_behaviour: seen, operator_action: 'graph.projection.withdraw / graph.projection.rebuild; the poison planted and removed by the superuser',
      recovery: `rebuild ${String(r['outcome'])}`, reconciliation: { product_state: back.product_state } });
  }, 240_000);
  /* end B23-F1 */
});
