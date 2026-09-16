/**
 * CP-6 batch B11 (migration 0070) — the archive tier, the customer export package and the safe referential scope of a
 * deletion, on a real database, Redis and BullMQ (the `phase6-*` name puts the file in `test:int:all`, as the CI rule requires):
 *
 *   A · ARCHIVE (0070 §2; L3-C08, DZ-18, DAT-ST-06) — an archive action takes the preservation scope (every manifest the
 *   selector names, a hold recorded and honoured by keeping), executes as a MOVE: the bytes copied into the archive tier under
 *   the same locator and verified on the copy, the move recorded by the archive port (the tier ledger, custody.archived), the
 *   hot copy removed after the commit; verified against the archive contract, no DeletionVerified; archived evidence still
 *   retrieved (availability archived); a deletion of archived bytes removes them from the archive tier; a copy failure rolls
 *   the execution back whole (infrastructure → retry) with the partial copy removed.
 *
 *   B · CUSTOMER EXPORT (0070 §3; V03-T-047, DPD-19, LR-23) — the export's selector (a chosen object set, its classification
 *   ceiling, the export namespace as destination), its redaction and data-rights gates as exclusions with their reason, the
 *   package built under the export root — manifest.json and one <manifest_id>.bin per object — signed by a digest chain bound
 *   to the approval, recorded once, verified by the product and by the customer's offline verifier (tampering detected), read
 *   through its route, revoked once by the retention authority with the bytes removed; the rights re-checked at execution; a
 *   scheduled export carries its ceiling.
 *
 *   C · SAFE SCOPE (0070 §4; V03-T-100, AU-MEM-0061) — a deletion of a manifest whose evidence version is load-bearing PAUSES
 *   with the item blocking and the dependents named: a live review case on a claim whose lineage names the bytes, an asserted
 *   edge, a briefing citing the version, a live decision package citing it, and (object-level, when no later bytes exist) a
 *   live decision object; each released by its route and resolved again; the non-blocking references stay residuals; the
 *   preservation kinds ignore the rule.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObjectsController } from '../../src/objects/objects.controller.js';
import type { IntelligenceController } from '../../src/intelligence/intelligence.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { GraphCapability } from '../../src/graph/graph.capabilities.js';
import * as fault from '../../src/observation/fault-injection.js';
import { Phase4Harness } from './phase4-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { jcsCanonicalize } from '@eye/contracts';
import { commitDb, superDb, type AnyDb } from './helpers.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
process.env['EYE_OUTBOX_LEASE_SECONDS'] = '5';

const execFile = promisify(execFileCb);
const VERIFIER = resolvePath(__dirname, '../../../../scripts/retention/verify-export.mjs');

let h: Phase4Harness; let graph: GraphController; let intelligence: IntelligenceController; let observation: ObservationController; let retention: RetentionController; let objects: ObjectsController; let vault: VaultService; let scheduler: SchedulerService;
let commit: AnyDb; let su: AnyDb;
let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let knowledgeOwner: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
const E1 = uuidv7(); const E2 = uuidv7();
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const scope = () => ({ tenantId: T(), domainId: D() });
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000): Promise<X> {
  const until = Date.now() + ms; let last: X | undefined;
  for (;;) {
    last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1500)}`);
    await sleep(200);
  }
}
const settle = async (ms = 60_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const c = await scheduler.subscriptionQueueCountsForTests(T(), D());
    if (c.active === 0 && c.waiting === 0 && c.delayed === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(c)}`);
    await sleep(200);
  }
};
const outboxEvent = (eventType: string, after: Date, where: (p: Record<string, unknown>) => boolean = () => true) =>
  waitFor(`the ${eventType} row published`, () => sql<{ id: string; status: string; payload: Record<string, unknown> }>`select id::text, status, payload from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${after} order by created_at`.execute(su).then((r) => r.rows.filter((x) => where(x.payload))),
    (rows) => rows.length >= 1 && rows.every((r) => r.status === 'published')).then((rows) => rows.at(-1)!);
const deletionVerifiedCount = async (since: Date, actionId: string) => (await sql<{ n: number }>`select count(*)::int n from objects.object_outbox where event_type = 'DeletionVerified' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${since} and payload ->> 'action_id' = ${actionId}`.execute(su)).rows[0]!.n;

/* ───────────── the retention routes (the -4 helpers) ───────────── */
type Action = { action_id: string; state: string; kind: string; scope_digest: string | null; scope_summary: Record<string, unknown>; failure_class: string | null; disposition: string | null; failure_reason: string | null; residual_summary: unknown[]; selector: Record<string, unknown> };
const actionRow = async (id: string): Promise<Action> => (await sql<Action>`select action_id::text, state, kind, scope_digest, scope_summary, failure_class, disposition, failure_reason, residual_summary, selector from retention.actions_current where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const items = async (id: string) => (await sql<{ item_kind: string; ref: string; disposition: string; hold_id: string | null; reason: string; details: Record<string, unknown> }>`select item_kind, ref, disposition, hold_id::text, reason, details from retention.scope_items where action_id = ${id}::uuid order by dependency_order`.execute(su)).rows;
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string; locator: string }>`select (payload ->> 'manifest_id') as manifest_id, (select locator from observation.blob_manifests m where m.manifest_id = (o.payload ->> 'manifest_id')::uuid) as locator from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
const manifestRow = async (manifestId: string) => (await sql<{ manifest_id: string; locator: string; content_digest: string; byte_length: number; classification: string; source_id: string; retention_profile: string }>`select manifest_id::text, locator, content_digest, byte_length::int, classification, source_id::text, retention_profile from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
const tierOf = async (manifestId: string) => (await sql<{ t: string }>`select observation.manifest_tier(${manifestId}::uuid) t`.execute(su)).rows[0]!.t;
const custody = async (manifestId: string, event: string) => (await sql<{ event: string; details: Record<string, unknown> }>`select event, details from observation.custody_events where manifest_id = ${manifestId}::uuid and event = ${event} order by occurred_at desc`.execute(su)).rows;
const tombstones = async (manifestId: string) => (await sql<{ n: number }>`select count(*)::int n from observation.blob_tombstones where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!.n;
const executions = async (id: string) => (await sql<{ port: string; outcome: string; evidence: Record<string, unknown> }>`select port, outcome, evidence from retention.executions where action_id = ${id}::uuid order by executed_at`.execute(su)).rows;
const verifications = async (id: string) => (await sql<{ check_name: string; passed: boolean; expected: Record<string, unknown>; observed: Record<string, unknown> }>`select check_name, passed, expected, observed from retention.verifications where action_id = ${id}::uuid order by verified_at, check_name`.execute(su)).rows;
const residuals = async (id: string) => (await sql<{ kind: string; count: number; status: string }>`select kind, count, status from retention.residual_inventory where action_id = ${id}::uuid order by kind`.execute(su)).rows;
const events = async (id: string) => (await sql<{ event: string }>`select event from retention.action_events where action_id = ${id}::uuid order by occurred_at`.execute(su)).rows.map((e) => e.event);
const approvalsLive = async (id: string) => (await sql<{ n: number }>`select count(*)::int n from retention.approvals where action_id = ${id}::uuid and revoked_at is null`.execute(su)).rows[0]!.n;
const open = (p: AuthenticatedPrincipal, payload: Record<string, unknown>) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string; state: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Record<string, unknown> }>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string, rationale = 'the scope as resolved; the held items stay') => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale } }) as Promise<{ approval: { approvalId: string } }>;
type Execution = { executed: number; held: number; refused: number; floor: Record<string, unknown> | null; package: Record<string, unknown> | null; bytes: { removed: string[]; failed: string[] } };
const execute = (p: AuthenticatedPrincipal, id: string) => retention.execute(h.req(p, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: Execution }>;
const verify = (p: AuthenticatedPrincipal, id: string) => retention.verify(h.req(p, 'retention.action.verify', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ verification: Record<string, unknown> }>;
const withdraw = (p: AuthenticatedPrincipal, id: string, reason: string) => retention.withdraw(h.req(p, 'retention.action.withdraw', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } });
const getExport = (p: AuthenticatedPrincipal, id: string) => retention.getExport(h.req(p, 'retention.read', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ package: Record<string, unknown>; manifest: Record<string, unknown> | null; files: string[] }>;
const revokeExport = (p: AuthenticatedPrincipal, id: string, reason: string) => retention.revokeExport(h.req(p, 'retention.export.revoke', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } }) as Promise<{ revocation: Record<string, unknown>; bytes: { removed: boolean; error?: string } }>;
/** OPEN → RESOLVE → APPROVE in one go; returns the action id and its digest. */
const opened = async (payload: Record<string, unknown>): Promise<{ id: string; digest: string; scope: Record<string, unknown> }> => {
  const o = await open(steward, payload);
  const r = await resolve(steward, o.action.actionId);
  return { id: o.action.actionId, digest: String(r.scope['scope_digest']), scope: r.scope };
};
const approved = async (payload: Record<string, unknown>): Promise<{ id: string; digest: string; scope: Record<string, unknown>; approvalId: string }> => {
  const a = await opened(payload);
  const ap = await approve(authority, a.id, a.digest);
  return { ...a, approvalId: ap.approval.approvalId };
};

/* ───────────── observation and graph (the -4 helpers) ───────────── */
const submitCorrection = async (evdIds: string[], reason: string): Promise<string> => {
  const o = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(), kind: 'correction', channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  return o.correction.caseId;
};
const applyCase = (caseId: string, evdIds: string[], reason: string) =>
  observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId, { payload: { decision: 'apply', affectedEvdIds: evdIds, reason } }) as Promise<{ correction: Record<string, unknown> }>;
const placeHold = async (evdId: string, reason: string): Promise<string> => {
  const r = await observation.placeLegalHold(h.req(domainAdmin, 'observation.legal_hold.place', 'LGH', evdId, 'observation'), T(), D(), evdId, { payload: { reason } }) as { hold: { holdId: string } };
  return r.hold.holdId;
};
const setRights = (sourceId: string, rightsState: 'confirmed' | 'pending' | 'withdrawn') =>
  observation.setRights(h.req(manager, 'observation.source.rights', 'SRC', sourceId, 'observation'), T(), D(), sourceId, { payload: { contractVersion: 1, rightsState, evidence: `publisher notice (fixture): ${rightsState}` } });
const download = (p: AuthenticatedPrincipal, evdId: string) => observation.downloadEvidence(h.req(p, 'observation.evidence.retrieve', 'EVD', evdId, 'observation'), T(), D(), evdId) as Promise<{ download: { contentDigest: string; byteLength: number; base64: string; integrity: string; tier: string; availability: string } }>;
const getEvidence = (p: AuthenticatedPrincipal, evdId: string) => observation.getEvidence(h.req(p, 'observation.read.evidence', 'EVD', evdId, 'observation'), T(), D(), evdId, { payload: {} }) as Promise<{ manifest: Record<string, unknown> | null; availability: { tier: string; state: string } }>;
const upload = async (names: string[], ceiling: 'internal' | 'confidential' | 'restricted' = 'internal', label = '') =>
  h.upload(names.map((n) => ({ filename: `${n}.csv`, text: TERMS_CSV.replace('assumption', `assumption (${n})`), documentTime: '2024-01-14T00:00:00Z' })), ceiling, label) as Promise<Array<{ id: string; version: number; digest: string }>>;

/** A REL claim as the extraction would have admitted it, its lineage naming the given bytes (the digest of the argument), its review case in the given state. */
async function seedClaimOnBytes(a: { evidence: { id: string; version: number }; digest: string; reviewState: 'queued' | 'approved' | 'rejected' }): Promise<{ claimId: string; caseId: string; runId: string; methodId: string }> {
  const claimId = uuidv7(); const caseId = uuidv7(); const runId = uuidv7(); const methodId = uuidv7();
  const lineage = { method_key: 'fixture-rel', method_id: methodId, model_id: 'fixture-model', model_weights_digest: sha256('w'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: sha256('d'), mode: 'replay', call_id: null, run_id: runId,
    evidence_object_id: a.evidence.id, evidence_digest: a.digest, byte_start: 0, byte_end: 4, extraction_identity: sha256(claimId), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  const payload = { claim_kind: 'relationship', subject: 'NORDWERK Magnet GmbH', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait', confidence: 0.55, lineage, review: { state: 'queued', reason: 'confidence below the floor', decider: null } };
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, truth_state, synthetic_state, classification, purpose_scope, schema_ref, audit_correlation_id, content_digest, method_ref, recorded_at, observation_time, time_precision, source_clock_quality, source_object_ids, evidence_refs, payload)
    values (${claimId}::uuid, 'REL', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', 'extracted', false, 'internal', 'intelligence', 'REL@v1', ${uuidv7()}::uuid, ${sha256(claimId)}, 'fixture-extraction@1.0.0', clock_timestamp(), clock_timestamp(), 'exact', 'trusted',
            ${JSON.stringify([a.evidence.id])}::jsonb, ${JSON.stringify([`EVD:${a.evidence.id}@${a.evidence.version}`])}::jsonb, ${JSON.stringify(payload)}::jsonb)`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'REL', ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${a.evidence.id}::uuid, ${a.digest}, 0, 4, 0.55, ${lineage.retrieval_decision_id}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into intelligence.runs_current (run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id, mode, state, finished_at, evidence_read, claims_admitted, correlation_id)
    values (${runId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${methodId}::uuid, 1, ${owner.principalId}::uuid, 'replay', 'completed', clock_timestamp(), 1, 1, ${uuidv7()}::uuid)`.execute(su);
  if (a.reviewState === 'queued') {
    await sql`insert into intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, correlation_id)
      values (${caseId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${claimId}::uuid, 1, ${runId}::uuid, ${methodId}::uuid, 'below_review_threshold', 0.55, 'queued', ${uuidv7()}::uuid)`.execute(su);
  } else {
    await sql`insert into intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, decided_at, decider_principal_id, decision_reason, correlation_id)
      values (${caseId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${claimId}::uuid, 1, ${runId}::uuid, ${methodId}::uuid, 'below_review_threshold', 0.55, ${a.reviewState}, clock_timestamp(), ${reviewer.principalId}::uuid, 'fixture: decided at seeding', ${uuidv7()}::uuid)`.execute(su);
  }
  return { claimId, caseId, runId, methodId };
}
/** The operator's assertion of one edge through the builder's port, as a governed write, its provenance naming the given bytes. */
const assertEdgeGoverned = async (p: AuthenticatedPrincipal, a: { predicate: string; claimId: string; evidenceId: string; evidenceDigest: string }): Promise<string> => {
  const edgeId = uuidv7();
  await h.pipeline.write(h.env(p, 'graph.edge.assert', 'EDG', edgeId, 'graph'), p, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'graph.edge.assert', objectType: 'EDG', objectId: edgeId }, GraphCapability.edges,
    async (cap) => {
      await cap.assertEdge({ edgeId, tenantId: T(), domainId: D(), subject: E2, predicate: a.predicate, object: E1, validFrom: '2024-01-01T00:00:00.000Z', validTo: null, claimObjectId: a.claimId, claimVersion: 1, evidenceObjectId: a.evidenceId, evidenceDigest: a.evidenceDigest, methodId: null, runId: null, mode: 'replay', confidence: 0.7, actor: p.principalId, eventId: uuidv7(), correlationId: uuidv7() });
      return { result: { edgeId }, targetType: 'EDG', targetId: edgeId, targetVersion: '1', outboxEvent: null };
    });
  return edgeId;
};
/** A briefing row as a composition would have left it (the -4 seeding precedent); the trigger writes its dependency rows. */
const insertBriefing = async (sources: string[], prior: string | null): Promise<string> => {
  const briefingId = uuidv7();
  await sql`insert into executive.briefings (briefing_id, scope, tenant_id, domain_id, room_id, package_id, composed_by, composed_via, agent_id, known_at, prior_briefing_id, watermark, sources, items, windows, content_digest, header_digest, correlation_id)
    values (${briefingId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, null, null, ${owner.principalId}::uuid, 'human', null, clock_timestamp(), ${prior}::uuid, '{}'::jsonb, ${JSON.stringify(sources)}::jsonb, '[]'::jsonb, '[]'::jsonb, ${sha256(briefingId)}, ${sha256(`h${briefingId}`)}, ${uuidv7()}::uuid)`.execute(su);
  return briefingId;
};
/** The generic objects.correct of an EVD (the domain analyst's route): the next version under the given classification with the stored payload kept — the re-versioning the redaction gate must read. */
const reclassify = async (evdId: string, expectedVersion: number, classification: string): Promise<number> => {
  const row = (await sql<{ truth_state: string; purpose_scope: string; payload: Record<string, unknown> }>`select truth_state, purpose_scope, payload from objects.canonical_objects where object_id = ${evdId}::uuid and object_version = ${expectedVersion}`.execute(su)).rows[0]!;
  const r = await objects.correct(h.req(analyst, 'objects.correct', 'EVD', evdId, 'observation'), T(), D(), evdId, { payload: { expectedVersion, correction: { objectType: 'EVD', truthState: row.truth_state, classification, purposeScope: row.purpose_scope, humanRefs: [`principal:${analyst.principalId}`], payload: row.payload } } }) as { object: { object_version: number | string } };
  return Number(r.object.object_version);
};
/** A DEC strategy object (status active), as Phase 3's port would have declared it. */
const insertDecision = async (title: string): Promise<string> => {
  const decId = uuidv7();
  await sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
    values (${decId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'DEC', 1, ${title}, 'fixture: a decision resting on evidence', 'active', 'not_applicable', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  return decId;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { IntelligenceController: I } = await import('../../src/intelligence/intelligence.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  const { ObjectsController: OB } = await import('../../src/objects/objects.controller.js');
  graph = h.app.get(G); intelligence = h.app.get(I); observation = h.app.get(O); retention = h.app.get(R); objects = h.app.get(OB); vault = h.app.get(VaultService); scheduler = h.app.get(SchedulerService);
  commit = commitDb(); su = superDb();
  steward = await h.humanWithSession(['retention_steward'], 'b11-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b11-retention-authority', 'TENANT');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b11-domain-admin');
  manager = await h.principalWith(['collection_manager'], 'b11-collection-manager');
  analyst = await h.humanWithSession(['domain_analyst'], 'b11-analyst');
  knowledgeOwner = await h.humanWithSession(['knowledge_owner'], 'b11-knowledge-owner');
  reviewer = await h.principalWith(['extraction_manager'], 'b11-extraction-manager');
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'forecast_owner', 'resolution_manager', 'decision_owner'], 'b11-owner');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b11-tenant-admin', 'TENANT');
  for (const [id, type, name] of [[E1, 'place', 'Bab el-Mandeb Strait'], [E2, 'organization', 'NORDWERK Magnet GmbH']] as const) {
    await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
      values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  }
}, 300_000);

afterAll(async () => {
  fault.disarm();
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
  await Promise.all([commit, su].map((d) => d.destroy()));
}, 120_000);

describe('A · ARCHIVE executor (0070 §2; L3-C08, DZ-18, DAT-ST-06)', () => {
  let evdA: { id: string; version: number }; let evdB: { id: string; version: number }; let evdHot: { id: string; version: number };
  let mA: Awaited<ReturnType<typeof manifestRow>>; let mB: Awaited<ReturnType<typeof manifestRow>>; let holdId = '';
  let archiveId = ''; let digest = '';

  it('SETUP: two uploads — the first corrected (its manifest kept under the corrected version), a legal hold through the second; a third stays hot as the control', async () => {
    const up = await upload(['arc-a', 'arc-b', 'arc-hot']);
    evdA = up[0]!; evdB = up[1]!; evdHot = up[2]!;
    await applyCase(await submitCorrection([evdA.id], 'archive fixture: the first restated'), [evdA.id], 'restatement verified');
    mA = await manifestRow((await manifestOf(evdA.id, 1)).manifest_id); mB = await manifestRow((await manifestOf(evdB.id, 1)).manifest_id);
    holdId = await placeHold(evdB.id, 'litigation hold on the second upload (fixture)');
    expect(await tierOf(mA.manifest_id)).toBe('hot');
    await settle();
  }, 120_000);

  it('A1 · OPEN → RESOLVE, the preservation scope: both manifests execute, the hold recorded on its item and honoured by preserving; no residual inventory; a deletion refuses a chosen object set', async () => {
    const since = await mark();
    const o = await open(steward, { kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id, mB.manifest_id] } });
    archiveId = o.action.actionId;
    const due = await outboxEvent('RetentionActionDue', since, (p) => p['action_id'] === archiveId);
    expect(due.payload).toMatchObject({ kind: 'archive', target_kind: 'evidence' });
    const r = await resolve(steward, archiveId);
    expect(r.scope).toMatchObject({ state: 'scope_resolved', items: 2, execute: 2, held: 0, blocking: 0, excluded: 0, residuals: [] });
    digest = String(r.scope['scope_digest']);
    const its = await items(archiveId);
    expect(its.map((i) => i.disposition)).toEqual(['execute', 'execute']);
    const itemB = its.find((i) => i.ref === mB.manifest_id)!;
    expect(itemB.hold_id).toBe(holdId);
    expect(itemB.reason).toMatch(/under a legal hold, which the archive honours by preserving it/);
    expect(its.find((i) => i.ref === mA.manifest_id)!.details).toMatchObject({ tier: 'hot', evd_state: 'corrected', legal_hold: false });
    expect(await residuals(archiveId)).toEqual([]);
    // Control (D7): a deletion does not take a chosen object set.
    await expect(open(steward, { kind: 'deletion', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id] } })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/manifestIds is an archive's or a customer export's selector/) });
    await settle();
  }, 120_000);

  it('A2 · APPROVE → EXECUTE: the bytes copied into the archive tier under the same locator, the move recorded (the tier ledger, custody.archived), the hot copies removed after the commit; no tombstone', async () => {
    await approve(authority, archiveId, digest);
    const ex = await execute(steward, archiveId);
    expect(ex.execution).toMatchObject({ executed: 2, held: 0, refused: 0, package: null });
    expect([...ex.execution.bytes.removed].sort()).toEqual([mA.locator, mB.locator].sort());
    expect(ex.execution.bytes.failed).toEqual([]);
    for (const m of [mA, mB]) {
      expect(await vault.exists('evidence', scope(), m.locator)).toBe(false);
      expect(await vault.exists('archive', scope(), m.locator)).toBe(true);
      await expect(vault.read('archive', scope(), m.locator, m.content_digest)).resolves.toMatchObject({ contentDigest: m.content_digest });
      expect(await tierOf(m.manifest_id)).toBe('archive');
      const c = await custody(m.manifest_id, 'custody.archived');
      expect(c).toHaveLength(1); expect(c[0]!.details).toMatchObject({ action_id: archiveId, from_tier: 'hot', to_tier: 'archive' });
      expect(await tombstones(m.manifest_id)).toBe(0);
    }
    const tiers = (await sql<{ manifest_id: string; from_tier: string; tier: string; action_id: string; content_digest: string }>`select manifest_id::text, from_tier, tier, action_id::text, content_digest from observation.blob_tier_records where action_id = ${archiveId}::uuid order by moved_at`.execute(su)).rows;
    expect(tiers).toHaveLength(2);
    expect(tiers).toEqual(expect.arrayContaining([expect.objectContaining({ manifest_id: mA.manifest_id, from_tier: 'hot', tier: 'archive', action_id: archiveId, content_digest: mA.content_digest }), expect.objectContaining({ manifest_id: mB.manifest_id, from_tier: 'hot', tier: 'archive', action_id: archiveId, content_digest: mB.content_digest })]));
    const execs = await executions(archiveId);
    expect(execs.map((e) => [e.port, e.outcome])).toEqual([['observation.archive_blob', 'done'], ['observation.archive_blob', 'done']]);
    expect(execs.every((e) => e.evidence['already_archived'] === false && e.evidence['digest_verified'] === true)).toBe(true);
    expect(execs.map((e) => e.evidence['hold_id'])).toEqual(expect.arrayContaining([holdId, null]));
    expect((await actionRow(archiveId)).state).toBe('executed');
    await settle();
  }, 180_000);

  it('A3 · VERIFY against the archive contract; no DeletionVerified is published for an archive (D10)', async () => {
    const since = await mark();
    const v = await verify(steward, archiveId);
    expect(v.verification).toMatchObject({ verified: true, state: 'verified' });
    const checks = await verifications(archiveId);
    expect(checks).toHaveLength(2);
    expect(checks.every((c) => c.passed && /archived — bytes in the archive tier/.test(c.check_name))).toBe(true);
    expect(checks[0]!.expected).toEqual({ tombstone: false, tier: 'archive', bytes_present: false, archive_present: true, archive_digest_ok: true, archived: true });
    await sleep(500);
    expect(await deletionVerifiedCount(since, archiveId)).toBe(0);
    await settle();
  }, 120_000);

  it('A4 · RETRIEVAL of archived evidence: served from the archive tier with availability archived, the digest the manifest\'s, the custody row saying which tier; the detail carries the tier and the instant; a hot manifest reads hot', async () => {
    const dl = await download(analyst, evdA.id);
    expect(dl.download).toMatchObject({ contentDigest: mA.content_digest, tier: 'archive', availability: 'archived', integrity: 'verified' });
    expect(sha256(Buffer.from(dl.download.base64, 'base64'))).toBe(mA.content_digest);
    const retrieved = await custody(mA.manifest_id, 'custody.retrieved');
    expect(retrieved[0]!.details).toMatchObject({ tier: 'archive' });
    const detail = await getEvidence(analyst, evdA.id);
    expect(detail.manifest).toMatchObject({ tier: 'archive' });
    expect(detail.manifest!['archived_at']).not.toBeNull();
    expect(detail.availability).toEqual({ tier: 'archive', state: 'archived' });
    const hot = await getEvidence(analyst, evdHot.id);
    expect(hot.manifest).toMatchObject({ tier: 'hot', archived_at: null });
    expect(hot.availability).toEqual({ tier: 'hot', state: 'hot' });
    expect((await download(analyst, evdHot.id)).download).toMatchObject({ tier: 'hot', availability: 'verified' });
    await settle();
  }, 120_000);

  it('A5 · IDEMPOTENT: a second archive of the same manifest is excluded (nothing to archive); a DELETION of archived bytes removes them from the archive tier and verifies against it, with DeletionVerified', async () => {
    const again = await opened({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id] } });
    expect(again.scope).toMatchObject({ state: 'paused', excluded: 1, execute: 0 });
    expect((await items(again.id))[0]!.reason).toMatch(/already in the archive tier/);
    expect((await actionRow(again.id)).failure_reason).toMatch(/nothing to archive/);
    await withdraw(steward, again.id, 'the manifest is already cold');
    const del = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mA.manifest_id } });
    expect(del.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    expect((await items(del.id))[0]!.details).toMatchObject({ tier: 'archive' });
    await approve(authority, del.id, del.digest);
    const since = await mark();
    const saved = (await vault.read('archive', scope(), mA.locator, mA.content_digest)).bytes;
    const ex = await execute(steward, del.id);
    expect(ex.execution.bytes.removed).toEqual([mA.locator]);
    expect(await vault.exists('archive', scope(), mA.locator)).toBe(false);
    expect(await vault.exists('evidence', scope(), mA.locator)).toBe(false);
    expect(await tombstones(mA.manifest_id)).toBe(1);
    // The DISCRIMINATING control: the archive bytes re-planted under the locator in the ARCHIVE root (the hot root stays empty) — a tier-blind
    // observer of the evidence root would verify; the observer reports bytes present in either root, so the deletion does NOT verify and no
    // DeletionVerified is published while a copy remains anywhere.
    await vault.overwriteForIntegrityTest('archive', scope(), mA.locator, saved);
    const v0 = await verify(steward, del.id);
    expect(v0.verification).toMatchObject({ verified: false, state: 'executed' });
    const failed = (await verifications(del.id)).find((c) => /tombstoned and its bytes gone/.test(c.check_name))!;
    expect(failed.passed).toBe(false); expect(failed.observed).toMatchObject({ tombstone: true, bytes_present: true });
    await sleep(500);
    expect(await deletionVerifiedCount(since, del.id)).toBe(0);
    await vault.tombstone('archive', scope(), mA.locator);
    const v = await verify(steward, del.id);
    expect(v.verification).toMatchObject({ verified: true, state: 'verified' });
    const done = await outboxEvent('DeletionVerified', since, (p) => p['action_id'] === del.id);
    expect(done.payload).toMatchObject({ action_id: del.id, kind: 'deletion', executed: 1 });
    await settle();
  }, 180_000);

  it('A6 · a hold placed AFTER the approval does not stop an archive (an archive preserves): executed, the hold recorded on the execution, the tier archive, no tombstone, verified', async () => {
    const [evdC] = await upload(['arc-c']);
    const mC = await manifestRow((await manifestOf(evdC!.id, 1)).manifest_id);
    const a = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mC.manifest_id] } });
    const newHoldId = await placeHold(evdC!.id, 'litigation hold placed after the approval (fixture)');
    const ex = await execute(steward, a.id);
    expect(ex.execution).toMatchObject({ executed: 1, refused: 0 });
    expect((await executions(a.id))[0]!.evidence).toMatchObject({ hold_id: newHoldId });
    expect(await tierOf(mC.manifest_id)).toBe('archive');
    expect(await tombstones(mC.manifest_id)).toBe(0);
    expect((await verify(steward, a.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    await settle();
  }, 180_000);

  it('A7 · a copy failure rolls the execution back whole: (i) a fault AFTER the rename — the copy this call created is removed by the copy itself; (ii) a two-manifest archive whose first copy faults — the second copy, made, is removed by the rollback cleanup; each time the action paused (infrastructure → retry), the approvals revoked, no tier record, no execution row, the hot bytes present; resolved and approved again it executes and verifies', async () => {
    const [evdD, evdX, evdY] = await upload(['arc-d', 'arc-x', 'arc-y']);
    const mD = await manifestRow((await manifestOf(evdD!.id, 1)).manifest_id);
    const mX = await manifestRow((await manifestOf(evdX!.id, 1)).manifest_id); const mY = await manifestRow((await manifestOf(evdY!.id, 1)).manifest_id);
    const rolledBack = async (id: string, manifests: Array<typeof mD>) => {
      expect(await actionRow(id)).toMatchObject({ state: 'paused', failure_class: 'infrastructure', disposition: 'retry' });
      expect(await approvalsLive(id)).toBe(0);
      expect(await executions(id)).toEqual([]);
      for (const m of manifests) {
        expect((await sql<{ n: number }>`select count(*)::int n from observation.blob_tier_records where manifest_id = ${m.manifest_id}::uuid`.execute(su)).rows[0]!.n).toBe(0);
        expect(await vault.exists('archive', scope(), m.locator)).toBe(false);
        expect(await vault.exists('evidence', scope(), m.locator)).toBe(true);
      }
      expect(readdirSync(join(vault.rootFor('archive'), T(), D())).filter((n) => n.includes('.tmp-'))).toEqual([]);
    };
    // (i) the fault fires AFTER the rename: the file exists under its locator at that instant; copyBlob removes what it created before it throws.
    const a = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mD.manifest_id] } });
    fault.arm(['b11.archive_after_copy_before_record'], 'test');
    try { await expect(execute(steward, a.id)).rejects.toMatchObject({ status: 409 }); } finally { fault.disarm(); }
    await rolledBack(a.id, [mD]);
    // (ii) TWO manifests, the fault before the FIRST write (it fires once): the first copy refused, the second STAGED whole under this action's
    // name (0071) — a copy this execution created — and removed by the RetentionExecutionRolledBack cleanup (the staged file of that locator removed,
    // and of no other; nothing under the locator itself was ever published).
    const b = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mX.manifest_id, mY.manifest_id] } });
    const spy = vi.spyOn(vault, 'removeStaged');
    fault.arm(['b11.archive_copy_partial'], 'test');
    try { await expect(execute(steward, b.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/1 item\(s\) refused at execution/) }); } finally { fault.disarm(); }
    const stagedRemovals = spy.mock.calls.map((c) => c[1]);
    spy.mockRestore();
    expect(stagedRemovals).toEqual([mY.locator]);
    expect(await vault.stagedCopies(scope(), mY.locator)).toHaveLength(0);
    await rolledBack(b.id, [mX, mY]);
    for (const x of [a, b]) {
      const r = await resolve(steward, x.id);
      expect(r.scope).toMatchObject({ state: 'scope_resolved' });
      await approve(authority, x.id, String(r.scope['scope_digest']));
      expect((await execute(steward, x.id)).execution).toMatchObject({ refused: 0 });
      expect((await verify(steward, x.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    }
    for (const m of [mD, mX, mY]) expect(await tierOf(m.manifest_id)).toBe('archive');
    await settle();
  }, 300_000);

  it('A8 · an ARCHIVE schedule does not re-open a manifest already in the archive tier: evaluated, it opens an action for the hot manifest of the profile only', async () => {
    const mHot = await manifestRow((await manifestOf(evdHot.id, 1)).manifest_id);
    const s = await retention.declareSchedule(h.req(domainAdmin, 'retention.schedule.declare', 'RTS', null, 'retention'), T(), D(),
      { payload: { retentionProfile: mHot.retention_profile, targetKind: 'evidence', actionKind: 'archive', dueAfter: '0 seconds', selector: { sourceId: mHot.source_id } } }) as { schedule: { scheduleId: string } };
    const e = await retention.evaluateSchedules(h.req(steward, 'retention.schedule.evaluate', 'RTS', null, 'retention'), T(), D()) as { evaluation: { opened: Array<Record<string, unknown>> } };
    const targets = e.evaluation.opened.map((o) => String((o['selector'] as Record<string, unknown>)['manifest_id']));
    expect(targets).toContain(mHot.manifest_id);
    const archived = (await sql<{ manifest_id: string }>`select manifest_id::text from observation.blob_manifests m where m.tenant_id = ${T()}::uuid and m.domain_id = ${D()}::uuid and observation.manifest_tier(m.manifest_id) = 'archive'`.execute(su)).rows.map((r) => r.manifest_id);
    expect(archived.length).toBeGreaterThanOrEqual(3);
    expect(targets.filter((t) => archived.includes(t))).toEqual([]);
    expect(targets).not.toContain(mA.manifest_id); // tombstoned in A5
    for (const o of e.evaluation.opened) await withdraw(steward, String(o['action_id']), 'the archive schedule fixture is withdrawn');
    // No route retires a schedule: retired here so the later evaluations of this file are the export schedule's alone.
    await sql`update retention.schedules set state = 'retired' where schedule_id = ${s.schedule.scheduleId}::uuid`.execute(su);
    await settle();
  }, 180_000);

  it('A9 · the rollback cleanup removes ONLY the copies this execution created: an identical archive copy another action committed survives a rolled-back execution that found it in place; the committed archive stays served and its pending hot copy is retried against the verified archive copy', async () => {
    const [evdP, evdQ] = await upload(['arc-p', 'arc-q']);
    const mP = await manifestRow((await manifestOf(evdP!.id, 1)).manifest_id); const mQ = await manifestRow((await manifestOf(evdQ!.id, 1)).manifest_id);
    // A2 over both, resolved while both are hot (its digest carries no tier); A1 over the first, executed with the hot removal REFUSED after the commit.
    const a2 = await opened({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id, mQ.manifest_id] } });
    expect(a2.scope).toMatchObject({ state: 'scope_resolved', execute: 2 });
    const a1 = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mP.manifest_id] } });
    fault.arm(['f27.during_quarantine_tombstone'], 'test');
    let ex1: Awaited<ReturnType<typeof execute>>;
    try { ex1 = await execute(steward, a1.id); } finally { fault.disarm(); }
    expect(ex1.execution).toMatchObject({ executed: 1, refused: 0 });
    expect(ex1.execution.bytes).toEqual({ removed: [], failed: [mP.locator] });
    expect(await tierOf(mP.manifest_id)).toBe('archive');
    expect(await vault.exists('archive', scope(), mP.locator)).toBe(true); expect(await vault.exists('evidence', scope(), mP.locator)).toBe(true);
    expect((await residuals(a1.id)).find((r) => r.kind === 'bytes_present')).toMatchObject({ status: 'pending' });
    // A2 approved on its unchanged digest and executed with the second copy faulting: the first copy is found in place (not created here) and the
    // cleanup leaves it — the committed record of A1 keeps its bytes; the action pauses as before.
    await approve(authority, a2.id, a2.digest);
    const spy = vi.spyOn(vault, 'tombstone'); const spyStaged = vi.spyOn(vault, 'removeAllStaged'); const spyOwn = vi.spyOn(vault, 'removeStaged');
    fault.arm(['b11.archive_copy_partial'], 'test');
    try { await expect(execute(steward, a2.id)).rejects.toMatchObject({ status: 409 }); } finally { fault.disarm(); }
    // Nothing of A1's committed copy is touched by A2's rollback: no archive-root tombstone, no staged copy of the locator retired, and A2's own
    // cleanup removes only what A2 staged (nothing for P — found archived under the lock — and nothing for Q, whose copy faulted before the write).
    expect(spy.mock.calls.filter((c) => c[0] === 'archive').map((c) => c[2])).toEqual([]);
    expect(spyStaged.mock.calls).toEqual([]);
    expect(spyOwn.mock.calls.map((c) => c[1])).toEqual([]);
    spy.mockRestore(); spyStaged.mockRestore(); spyOwn.mockRestore();
    expect(await actionRow(a2.id)).toMatchObject({ state: 'paused', failure_class: 'infrastructure' });
    expect(await tierOf(mP.manifest_id)).toBe('archive');
    expect(await vault.exists('archive', scope(), mP.locator)).toBe(true);
    expect((await download(analyst, evdP!.id)).download).toMatchObject({ contentDigest: mP.content_digest, tier: 'archive', availability: 'archived', integrity: 'verified' });
    expect(await vault.exists('archive', scope(), mQ.locator)).toBe(false); expect(await vault.exists('evidence', scope(), mQ.locator)).toBe(true);
    // The designed operator step on A1 (executed, a pending bytes residual): the hot copy is removed only because the archive copy is present and verifies.
    const retry = await retention.execute(h.req(steward, 'retention.action.execute', 'RTA', a1.id, 'retention'), T(), D(), a1.id) as { execution: { retried: boolean; pending: number; bytes: { removed: string[]; failed: string[] } } };
    expect(retry.execution).toMatchObject({ retried: true, pending: 1, bytes: { removed: [mP.locator], failed: [] } });
    expect(await vault.exists('evidence', scope(), mP.locator)).toBe(false); expect(await vault.exists('archive', scope(), mP.locator)).toBe(true);
    expect((await verify(steward, a1.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    expect((await residuals(a1.id)).find((r) => r.kind === 'bytes_present')).toMatchObject({ status: 'retained_by_policy' });
    // A2 resolved again: the first manifest is already cold (excluded), the second executes.
    const again = await resolve(steward, a2.id);
    expect(again.scope).toMatchObject({ state: 'scope_resolved', execute: 1, excluded: 1 });
    await approve(authority, a2.id, String(again.scope['scope_digest']));
    expect((await execute(steward, a2.id)).execution).toMatchObject({ executed: 1, refused: 0 });
    expect((await verify(steward, a2.id)).verification).toMatchObject({ verified: true });
    await settle();
  }, 300_000);

  it('A10 · a DELETION of an archived manifest whose hot copy an archive could not remove retires the bytes from BOTH roots and verifies against both', async () => {
    const [evdR] = await upload(['arc-r']);
    await applyCase(await submitCorrection([evdR!.id], 'archive fixture: restated before its archive'), [evdR!.id], 'restatement verified');
    const mR = await manifestRow((await manifestOf(evdR!.id, 1)).manifest_id);
    const arc = await approved({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [mR.manifest_id] } });
    fault.arm(['f27.during_quarantine_tombstone'], 'test');
    try { expect((await execute(steward, arc.id)).execution.bytes).toEqual({ removed: [], failed: [mR.locator] }); } finally { fault.disarm(); }
    expect(await vault.exists('evidence', scope(), mR.locator)).toBe(true); expect(await vault.exists('archive', scope(), mR.locator)).toBe(true);
    const del = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mR.manifest_id } });
    expect(del.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    expect((await items(del.id))[0]!.details).toMatchObject({ tier: 'archive' });
    await approve(authority, del.id, del.digest);
    const since = await mark();
    const ex = await execute(steward, del.id);
    expect(ex.execution.bytes).toEqual({ removed: [mR.locator], failed: [] });
    expect(await vault.exists('evidence', scope(), mR.locator)).toBe(false); expect(await vault.exists('archive', scope(), mR.locator)).toBe(false);
    expect(await tombstones(mR.manifest_id)).toBe(1);
    expect((await verify(steward, del.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    expect((await verifications(del.id))[0]!.observed).toMatchObject({ tombstone: true, bytes_present: false });
    await outboxEvent('DeletionVerified', since, (p) => p['action_id'] === del.id);
    await settle();
  }, 300_000);
});

describe('B · CUSTOMER EXPORT executor (0070 §3; V03-T-047, DPD-19, LR-23)', () => {
  let evdA: { id: string; version: number }; let evdB: { id: string; version: number }; let evdC: { id: string; version: number }; let evdD: { id: string; version: number };
  let mA: Awaited<ReturnType<typeof manifestRow>>; let mB: Awaited<ReturnType<typeof manifestRow>>; let mC: Awaited<ReturnType<typeof manifestRow>>; let mD: Awaited<ReturnType<typeof manifestRow>>;
  let holdId = ''; let withdrawnSourceId = ''; let internalSourceId = '';
  let exportId = ''; let digest = ''; let approvalId = ''; let packageDigest = ''; let dir = '';
  const exportDir = (id: string) => join(vault.rootFor('export'), T(), D(), id);
  const canonicalDigestOf = async (manifestId: string) => (await sql<{ d: string; v: number }>`select content_digest d, object_version::int v from objects.canonical_objects where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and object_type = 'EVD' and (payload ->> 'manifest_id') = ${manifestId} order by object_version desc limit 1`.execute(su)).rows[0]!;
  const runVerifier = async (packageDir: string, ...extra: string[]): Promise<{ code: number; stdout: string }> => {
    try {
      const r = await execFile(process.execPath, [VERIFIER, packageDir, ...extra], { encoding: 'utf8' });
      return { code: 0, stdout: r.stdout };
    } catch (e) {
      const err = e as { code?: number; stdout?: string };
      return { code: typeof err.code === 'number' ? err.code : 1, stdout: err.stdout ?? '' };
    }
  };

  // The gates keep their precedence (redaction, then data rights — 0070 §4): an object ABOVE the ceiling is a redaction exclusion whatever
  // its rights, so the data-rights gate is exercised on an object WITHIN the ceiling — a second internal-ceiling source whose rights are withdrawn.
  it('SETUP: two internal uploads (the second held), one confidential, one internal from a second source whose rights are withdrawn', async () => {
    const up = await upload(['exp-a', 'exp-b']);
    evdA = up[0]!; evdB = up[1]!;
    mA = await manifestRow((await manifestOf(evdA.id, 1)).manifest_id); mB = await manifestRow((await manifestOf(evdB.id, 1)).manifest_id);
    holdId = await placeHold(evdB.id, 'litigation hold on the second export candidate (fixture)');
    internalSourceId = mA.source_id;
    evdC = (await upload(['exp-c'], 'confidential'))[0]!; mC = await manifestRow((await manifestOf(evdC.id, 1)).manifest_id);
    evdD = (await upload(['exp-d'], 'internal', 'withdrawn-rights'))[0]!; mD = await manifestRow((await manifestOf(evdD.id, 1)).manifest_id);
    withdrawnSourceId = await h.uploadSource('internal', 'withdrawn-rights');
    expect(mD.source_id).toBe(withdrawnSourceId); expect(withdrawnSourceId).not.toBe(internalSourceId);
    await setRights(withdrawnSourceId, 'withdrawn');
    expect(mC.classification).toBe('confidential'); expect(mD.classification).toBe('internal');
    await settle();
  }, 180_000);

  it('B1 · OPEN, the selector gates: the ceiling is required, the destination is the export namespace only; opened with RetentionActionDue and the selector stored', async () => {
    await expect(open(steward, { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id] } })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/classificationCeiling/) });
    await expect(open(steward, { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id], classificationCeiling: 'internal', destination: 'customer-bucket' } })).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/destination/) });
    const since = await mark();
    const o = await open(steward, { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id, mB.manifest_id, mC.manifest_id, mD.manifest_id], classificationCeiling: 'internal' } });
    exportId = o.action.actionId;
    const due = await outboxEvent('RetentionActionDue', since, (p) => p['action_id'] === exportId);
    expect(due.payload).toMatchObject({ kind: 'customer_export' });
    expect((await actionRow(exportId)).selector).toEqual({ manifest_ids: [mA.manifest_id, mB.manifest_id, mC.manifest_id, mD.manifest_id], classification_ceiling: 'internal', destination: 'export' });
    await settle();
  }, 120_000);

  it('B2 · RESOLVE: the redaction and data-rights gates are exclusions with their reason; the held manifest executes with its hold recorded; nothing exportable pauses; a higher ceiling admits the confidential object', async () => {
    const r = await resolve(steward, exportId);
    expect(r.scope).toMatchObject({ state: 'scope_resolved', items: 4, execute: 2, excluded: 2, held: 0, blocking: 0, residuals: [] });
    digest = String(r.scope['scope_digest']);
    const its = await items(exportId);
    expect(its.find((i) => i.ref === mA.manifest_id)).toMatchObject({ disposition: 'execute' });
    const b = its.find((i) => i.ref === mB.manifest_id)!;
    expect(b).toMatchObject({ disposition: 'execute', hold_id: holdId }); expect(b.reason).toMatch(/which an export leaves in place/);
    const c = its.find((i) => i.ref === mC.manifest_id)!;
    expect(c.disposition).toBe('excluded'); expect(c.reason).toMatch(/redaction gate: classification confidential is above the export ceiling internal/); expect(c.details).toMatchObject({ gate: 'redaction' });
    const d = its.find((i) => i.ref === mD.manifest_id)!;
    expect(d.disposition).toBe('excluded'); expect(d.reason).toMatch(/data-rights gate: .* are withdrawn/); expect(d.details).toMatchObject({ gate: 'data_rights', rights_state: 'withdrawn' });
    // Controls: nothing exportable pauses with the reason; under a higher ceiling the confidential object executes.
    const nothing = await opened({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mC.manifest_id], classificationCeiling: 'internal' } });
    expect(nothing.scope).toMatchObject({ state: 'paused' });
    expect((await actionRow(nothing.id)).failure_reason).toMatch(/nothing exportable in scope/);
    await withdraw(steward, nothing.id, 'the control action of the redaction gate');
    const higher = await opened({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mC.manifest_id], classificationCeiling: 'confidential' } });
    expect(higher.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    await withdraw(steward, higher.id, 'the control action of the higher ceiling');
    // The RESOLUTION gate: an id of the chosen object set that names no manifest of this domain is an EXCLUDED item with that reason, never dropped;
    // a real manifest written in upper case resolves (the comparison is on the uuid, not its spelling).
    const unknown = uuidv7();
    const gated = await opened({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id, mB.manifest_id.toUpperCase(), unknown.toUpperCase()], classificationCeiling: 'internal' } });
    expect(gated.scope).toMatchObject({ state: 'scope_resolved', items: 3, execute: 2, excluded: 1 });
    const gatedItems = await items(gated.id);
    expect(gatedItems.find((i) => i.ref === mB.manifest_id)).toMatchObject({ disposition: 'execute' });
    const x = gatedItems.find((i) => i.ref === unknown)!;
    expect(x).toMatchObject({ disposition: 'excluded' }); expect(x.reason).toMatch(/resolution gate: the id names no non-tombstoned evidence manifest of this domain/); expect(x.details).toMatchObject({ gate: 'resolution' });
    await withdraw(steward, gated.id, 'the control action of the resolution gate');
    const none = await opened({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [unknown] } });
    expect(none.scope).toMatchObject({ state: 'paused', items: 1, excluded: 1, execute: 0 });
    expect((await actionRow(none.id)).failure_reason).toMatch(/nothing to archive/);
    await withdraw(steward, none.id, 'the control action of the resolution gate (archive)');
    await settle();
  }, 120_000);

  it('B3 · the APPROVAL gate: execution before an approval is refused; the steward cannot approve; the authority approves on the digest', async () => {
    await expect(execute(steward, exportId)).rejects.toThrow(/only an approved action executes/);
    await expect(approve(steward, exportId, digest)).rejects.toMatchObject({ status: 403 });
    const ap = await approve(authority, exportId, digest);
    approvalId = ap.approval.approvalId;
    expect((await actionRow(exportId)).state).toBe('approved');
  }, 120_000);

  it('B4 · EXECUTE → the package: manifest.json and one file per object under the export namespace, the digest chain bound to the approval, the record, the custody rows, the source untouched, no DeletionVerified', async () => {
    const since = await mark();
    const ex = await execute(steward, exportId);
    expect(ex.execution).toMatchObject({ executed: 2, refused: 0, held: 0 });
    expect(ex.execution.package).toMatchObject({ locator_prefix: `${T()}/${D()}/${exportId}/`, package_digest: expect.stringMatching(/^[0-9a-f]{64}$/), manifest_digest: expect.stringMatching(/^[0-9a-f]{64}$/), objects: 2, excluded: 2 });
    packageDigest = String(ex.execution.package!['package_digest']);
    dir = exportDir(exportId);
    expect(readdirSync(dir).sort()).toEqual(['manifest.json', 'links.json', `${mA.manifest_id}.bin`, `${mB.manifest_id}.bin`].sort()); // B15: links.json, the relationship closure, beside the manifest and the object files
    expect(sha256(readFileSync(join(dir, `${mA.manifest_id}.bin`)))).toBe(mA.content_digest);
    const fileBytes = readFileSync(join(dir, 'manifest.json'));
    const manifest = JSON.parse(fileBytes.toString('utf8')) as Record<string, unknown> & { package: Record<string, unknown>; authorization: Record<string, unknown>; gates: Record<string, unknown>; objects: Array<Record<string, unknown>>; excluded: Array<Record<string, unknown>>; signature: Record<string, unknown> };
    expect(manifest.format).toBe('eye-customer-export/1');
    expect(manifest.package).toMatchObject({ action_id: exportId, tenant_id: T(), domain_id: D(), destination: 'export' });
    expect(manifest.authorization).toMatchObject({ approval_id: approvalId, scope_digest: digest, approver: `principal:${authority.principalId}` });
    expect(manifest.gates).toMatchObject({ redaction: { classification_ceiling: 'internal' }, destination: 'export' });
    expect(manifest.objects).toHaveLength(2);
    for (const o of manifest.objects) {
      expect(Object.keys(o['header'] as Record<string, unknown>)).toHaveLength(43);
      const canon = await canonicalDigestOf(String(o['manifest_id']));
      expect(o['content_digest']).toBe(canon.d); expect(o['object_version']).toBe(canon.v);
      expect((o['payload'] as Record<string, unknown>)['content_digest']).toBe((o['bytes'] as Record<string, unknown>)['content_digest']);
      expect((o['bytes'] as Record<string, unknown>)['file']).toBe(`${String(o['manifest_id'])}.bin`);
    }
    expect(manifest.excluded).toHaveLength(2);
    expect(manifest.excluded.map((x) => x['gate']).sort()).toEqual(['data_rights', 'redaction']);
    expect(manifest.signature).toMatchObject({ scheme: 'eye-digest-chain/1', package_digest: packageDigest, bound_to: { action_id: exportId, scope_digest: digest, approval_id: approvalId } });
    const row = (await sql<Record<string, unknown>>`select object_count, excluded_count, byte_total::int, classification_ceiling, revoked_at, manifest_digest, package_digest from retention.export_packages where action_id = ${exportId}::uuid`.execute(su)).rows[0]!;
    expect(row).toMatchObject({ object_count: 2, excluded_count: 2, byte_total: mA.byte_length + mB.byte_length, classification_ceiling: 'internal', revoked_at: null, manifest_digest: sha256(fileBytes), package_digest: manifest.signature['package_digest'] });
    const execs = await executions(exportId);
    expect(execs.map((e) => [e.port, e.outcome])).toEqual([['vault.export', 'done'], ['vault.export', 'done'], ['retention.export_links', 'done'], ['retention.record_export_package', 'done']]); // B15: the closure's row before the record's
    expect(await events(exportId)).toContain('export.built');
    for (const m of [mA, mB]) {
      const c = await custody(m.manifest_id, 'custody.exported');
      expect(c).toHaveLength(1); expect(c[0]!.details).toMatchObject({ package_digest: packageDigest, action_id: exportId });
      expect(await vault.exists('evidence', scope(), m.locator)).toBe(true);
      expect(await tombstones(m.manifest_id)).toBe(0);
    }
    await sleep(500);
    expect(await deletionVerifiedCount(since, exportId)).toBe(0);
    await settle();
  }, 180_000);

  it('B5 · VERIFY by the product and by the customer\'s verifier: the three checks pass; the offline verifier proves integrity, re-import, completeness and the chain; the two JCS implementations agree; tampering is detected', async () => {
    const v = await verify(steward, exportId);
    expect(v.verification).toMatchObject({ verified: true, state: 'verified' });
    const checks = await verifications(exportId);
    expect(checks).toHaveLength(3);
    expect(checks.every((c) => c.passed)).toBe(true);
    expect(checks.filter((c) => /exported — listed in the package/.test(c.check_name))).toHaveLength(2);
    const pkg = checks.find((c) => /the export package: manifest\.json present/.test(c.check_name))!;
    expect(pkg.expected).toMatchObject({ files_present: 4, links_present: true, links_digest_ok: true }); // B15: manifest.json + links.json + one file per object
    const ok = await runVerifier(dir, '--expect-package-digest', packageDigest);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toMatch(/PACKAGE OK: 2 objects/);
    expect(ok.stdout).toMatch(/re-import 2\/2/);
    // The two JCS implementations agree on the package: the product's own canonicalisation recomputes the digest the verifier accepted.
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { format: string; package: unknown; authorization: unknown; gates: unknown; objects: unknown[]; excluded: unknown[]; signature: { package_digest: string; objects_digest: string } };
    const objectsDigest = sha256(jcsCanonicalize(m.objects));
    expect(objectsDigest).toBe(m.signature.objects_digest);
    const sig = m.signature as unknown as { bound_to: Record<string, unknown>; statement: string };
    expect(sha256(jcsCanonicalize({ format: m.format, package: m.package, authorization: m.authorization, gates: m.gates, objects_digest: objectsDigest, excluded: m.excluded, bound_to: sig.bound_to, statement: sig.statement }))).toBe(m.signature.package_digest);
    expect(ok.stdout).toMatch(/PASS\s+redaction: every exported record's classification is within the ceiling "internal"/);
    expect(ok.stdout).toMatch(/PASS\s+chain: signature\.bound_to restates the covered authorization/);
    // Tamper controls on COPIES of the package — each asserts the FAILING line of the check that detects it (the check names are printed on every run).
    const copyOf = () => { const t = mkdtempSync(join(tmpdir(), 'eye-export-')); cpSync(dir, t, { recursive: true }); return t; };
    const editManifest = (at: string, edit: (mm: Record<string, unknown>) => void) => { const mm = JSON.parse(readFileSync(join(at, 'manifest.json'), 'utf8')) as Record<string, unknown>; edit(mm); writeFileSync(join(at, 'manifest.json'), `${JSON.stringify(mm, null, 2)}\n`); };
    const flipped = copyOf();
    const binPath = join(flipped, `${mA.manifest_id}.bin`); const bin = readFileSync(binPath); bin[0] = bin[0]! ^ 0x01; writeFileSync(binPath, bin);
    const r1 = await runVerifier(flipped); expect(r1.code).toBe(1); expect(r1.stdout).toMatch(/FAIL\s+integrity .*digest mismatch/);
    const stray = copyOf(); writeFileSync(join(stray, 'stray.txt'), 'not part of the package');
    const r2 = await runVerifier(stray); expect(r2.code).toBe(1); expect(r2.stdout).toMatch(/FAIL\s+completeness.*unlisted file\(s\) in the package: stray\.txt/);
    // A dot-file is an unlisted file like any other: the customer's verifier and the product's verification count the directory the same way.
    const dotted = copyOf(); writeFileSync(join(dotted, '.extra'), 'smuggled');
    const r2b = await runVerifier(dotted); expect(r2b.code).toBe(1); expect(r2b.stdout).toMatch(/FAIL\s+completeness.*unlisted file\(s\) in the package: \.extra/);
    const edited = copyOf();
    editManifest(edited, (mm) => { ((mm['objects'] as Array<{ header: Record<string, unknown> }>)[0]!).header['recorded_at'] = '2020-01-01T00:00:00.000Z'; });
    const r3 = await runVerifier(edited); expect(r3.code).toBe(1); expect(r3.stdout).toMatch(/FAIL\s+re-import .*recompute to [0-9a-f]{64}, the record says [0-9a-f]{64}/);
    // The binding is INSIDE the digest chain: a forged bound_to (or statement) fails the package-digest check and the restatement check, --expect-package-digest included.
    const forged = copyOf();
    editManifest(forged, (mm) => { const sg = mm['signature'] as Record<string, unknown>; sg['bound_to'] = { ...(sg['bound_to'] as Record<string, unknown>), approval_id: '00000000-0000-4000-8000-000000000000', scope_digest: 'f'.repeat(64) }; sg['statement'] = 'forged'; });
    const r3b = await runVerifier(forged, '--expect-package-digest', packageDigest); expect(r3b.code).toBe(1);
    expect(r3b.stdout).toMatch(/FAIL\s+chain: sha256\(JCS\(\{format, package, authorization, gates, objects_digest, excluded, bound_to, statement\}\)\) = signature\.package_digest/);
    expect(r3b.stdout).toMatch(/FAIL\s+chain: signature\.bound_to restates the covered authorization.*does not restate/);
    expect(r3b.stdout).toMatch(/FAIL\s+authenticity/);
    const r4 = await runVerifier(dir, '--expect-package-digest', 'f'.repeat(64)); expect(r4.code).toBe(1); expect(r4.stdout).toMatch(/FAIL\s+authenticity.*expected package digest/);
    // The product's own verification counts a dot-file the same way: written into the package directory, the package check fails until it is removed.
    const dotPath = join(dir, '.DS_Store'); writeFileSync(dotPath, 'finder');
    const b = await approved({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id], classificationCeiling: 'internal' } });
    expect((await execute(steward, b.id)).execution).toMatchObject({ executed: 1 });
    writeFileSync(join(exportDir(b.id), '.DS_Store'), 'finder');
    expect((await verify(steward, b.id)).verification).toMatchObject({ verified: false });
    expect((await verifications(b.id)).find((c) => /the export package/.test(c.check_name))!.observed).toMatchObject({ files_present: 4, objects_listed: 1, links_present: true }); // B15: manifest.json + links.json + one object file + the dot-file (the check expects 3)
    rmSync(join(exportDir(b.id), '.DS_Store')); rmSync(dotPath);
    expect((await verify(steward, b.id)).verification).toMatchObject({ verified: true });
    await settle();
  }, 180_000);

  it('B6 · READ and REVOKE: the read route serves the record, the manifest and the files; the steward cannot revoke; the authority revokes once — the bytes gone, the read refused, a second revocation refused; the source still served; a package revoked before verification fails the package check', async () => {
    const rd = await getExport(steward, exportId);
    expect(rd.package).toMatchObject({ revoked_at: null });
    expect(rd.manifest).toMatchObject({ format: 'eye-customer-export/1' });
    expect(rd.files).toHaveLength(4); // B15: manifest.json, links.json and the two object files
    await expect(revokeExport(steward, exportId, 'the customer asked for the package to be withdrawn')).rejects.toMatchObject({ status: 403 });
    const rv = await revokeExport(authority, exportId, 'the customer asked for the package to be withdrawn');
    expect(rv.revocation).toMatchObject({ package_digest: packageDigest });
    expect(rv.bytes).toEqual({ removed: true });
    const row = (await sql<{ revoked_at: Date | null; revoked_by: string | null }>`select revoked_at, revoked_by::text from retention.export_packages where action_id = ${exportId}::uuid`.execute(su)).rows[0]!;
    expect(row.revoked_at).not.toBeNull(); expect(row.revoked_by).toBe(authority.principalId);
    expect(await events(exportId)).toContain('export.revoked');
    expect(existsSync(dir)).toBe(false);
    await expect(getExport(steward, exportId)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/was revoked at/) });
    await expect(revokeExport(authority, exportId, 'revoked a second time (fixture)')).rejects.toThrow(/was revoked at/);
    expect((await download(analyst, evdA.id)).download).toMatchObject({ contentDigest: mA.content_digest, integrity: 'verified' });
    expect((await actionRow(exportId)).state).toBe('verified');
    // A package revoked BEFORE the verification: the package check fails, the action stays executed for the retry.
    const a = await approved({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mA.manifest_id], classificationCeiling: 'internal' } });
    expect((await execute(steward, a.id)).execution).toMatchObject({ executed: 1 });
    await revokeExport(authority, a.id, 'revoked before its verification (fixture)');
    const v = await verify(steward, a.id);
    expect(v.verification).toMatchObject({ verified: false });
    const pkg = (await verifications(a.id)).find((c) => /the export package/.test(c.check_name))!;
    expect(pkg.passed).toBe(false); expect(pkg.observed).toMatchObject({ revoked: true });
    expect(await actionRow(a.id)).toMatchObject({ state: 'executed', failure_class: 'infrastructure', disposition: 'retry' });
    await settle();
  }, 180_000);

  it('B7 · rights withdrawn between the approval and the execution: refused at execution (rights_changed), the action paused authority_disputed with the approvals revoked, no package; resolved again the object is excluded by the data-rights gate', async () => {
    await setRights(withdrawnSourceId, 'confirmed');
    const a = await opened({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mD.manifest_id], classificationCeiling: 'restricted' } });
    expect(a.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    await approve(authority, a.id, a.digest);
    await setRights(withdrawnSourceId, 'withdrawn');
    await expect(execute(steward, a.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/rights_changed/) });
    expect(await actionRow(a.id)).toMatchObject({ state: 'paused', failure_class: 'authority_disputed', disposition: 'human_review' });
    expect(await approvalsLive(a.id)).toBe(0);
    expect((await sql<{ n: number }>`select count(*)::int n from retention.export_packages where action_id = ${a.id}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    expect(existsSync(exportDir(a.id))).toBe(false);
    const again = await resolve(steward, a.id);
    expect(again.scope).toMatchObject({ state: 'paused', execute: 0, excluded: 1 });
    expect((await actionRow(a.id)).failure_reason).toMatch(/nothing exportable/);
    await settle();
  }, 180_000);

  it('B8 · a scheduled export carries its ceiling and destination into the actions it opens (0070 §7); one resolves; a customer_export schedule without a ceiling is refused at declaration (its actions could never resolve); the open-action spellings are mapped', async () => {
    const profile = mA.retention_profile;
    const declare = (selector: Record<string, unknown>) => retention.declareSchedule(h.req(domainAdmin, 'retention.schedule.declare', 'RTS', null, 'retention'), T(), D(),
      { payload: { retentionProfile: profile, targetKind: 'evidence', actionKind: 'customer_export', dueAfter: '0 seconds', selector } }) as Promise<{ schedule: { scheduleId: string } }>;
    // (the port's refusals reach HTTP as 422 through observation-errors — phase5-refusals.test.ts; the harness sees the port's own error)
    await expect(declare({})).rejects.toThrow(/retention schedule rejected: a customer_export schedule names its classification_ceiling/);
    await expect(declare({ source_id: internalSourceId, classification_ceiling: 'internal', destination: 'customer-bucket' })).rejects.toThrow(/retention schedule rejected: the export destination is the export namespace/);
    await expect(declare({ source_id: internalSourceId, classification_ceiling: 'internal', manifest_ids: [mA.manifest_id] })).rejects.toThrow(/retention schedule rejected: .*a chosen object set \(manifest_ids\)/);
    const s = await declare({ sourceId: internalSourceId, classificationCeiling: 'internal' });
    expect((await sql<{ selector: Record<string, unknown> }>`select selector from retention.schedules where schedule_id = ${s.schedule.scheduleId}::uuid`.execute(su)).rows[0]!.selector).toEqual({ source_id: internalSourceId, classification_ceiling: 'internal', destination: 'export' });
    const e = await retention.evaluateSchedules(h.req(steward, 'retention.schedule.evaluate', 'RTS', null, 'retention'), T(), D()) as { evaluation: { opened: Array<Record<string, unknown>> } };
    expect(e.evaluation.opened.length).toBeGreaterThanOrEqual(1);
    expect(e.evaluation.opened.every((o) => o['schedule_id'] === s.schedule.scheduleId && o['kind'] === 'customer_export')).toBe(true);
    for (const o of e.evaluation.opened) expect(o['selector']).toMatchObject({ classification_ceiling: 'internal', destination: 'export', source_id: internalSourceId });
    const one = e.evaluation.opened.find((o) => (o['selector'] as Record<string, unknown>)['manifest_id'] === mA.manifest_id)!;
    expect(one).toBeDefined();
    const r = await resolve(steward, String(one['action_id']));
    expect(r.scope).toMatchObject({ state: 'scope_resolved', execute: 1 });
    for (const o of e.evaluation.opened) await withdraw(steward, String(o['action_id']), 'the scheduled export fixture is withdrawn');
    await sql`update retention.schedules set state = 'retired' where schedule_id = ${s.schedule.scheduleId}::uuid`.execute(su);
    await settle();
  }, 180_000);

  it('B9 · a manifest tombstoned between the approval and the execution never enters a package: the execution is refused (scope_changed), the action paused unresolved_dependency with the approvals revoked, no package row, no directory; resolved again the id is excluded by the resolution gate', async () => {
    const [evdE] = await upload(['exp-e']);
    await applyCase(await submitCorrection([evdE!.id], 'export fixture: restated so a deletion admits it'), [evdE!.id], 'restatement verified');
    const mE = await manifestRow((await manifestOf(evdE!.id, 1)).manifest_id);
    const exp = await approved({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mE.manifest_id], classificationCeiling: 'internal' } });
    const del = await approved({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mE.manifest_id } });
    expect((await execute(steward, del.id)).execution).toMatchObject({ executed: 1, refused: 0 });
    expect(await tombstones(mE.manifest_id)).toBe(1);
    await expect(execute(steward, exp.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/scope_changed.*tombstoned since the approval/) });
    expect(await actionRow(exp.id)).toMatchObject({ state: 'paused', failure_class: 'unresolved_dependency', disposition: 'human_review' });
    expect(await approvalsLive(exp.id)).toBe(0);
    expect((await sql<{ n: number }>`select count(*)::int n from retention.export_packages where action_id = ${exp.id}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    expect(existsSync(exportDir(exp.id))).toBe(false);
    expect(await custody(mE.manifest_id, 'custody.exported')).toEqual([]);
    const again = await resolve(steward, exp.id);
    expect(again.scope).toMatchObject({ state: 'paused', items: 1, execute: 0, excluded: 1 });
    expect((await items(exp.id))[0]!).toMatchObject({ disposition: 'excluded', details: { gate: 'resolution' } });
    await settle();
  }, 180_000);

  it('B10 · the export contract is the package\'s own: an export executed and not yet verified whose source is then governed-deleted still verifies (the source\'s present state recorded, not required); a leftover package directory of an interrupted build does not wedge the retry', async () => {
    const [evdF] = await upload(['exp-f']);
    await applyCase(await submitCorrection([evdF!.id], 'export fixture: restated so a deletion admits it'), [evdF!.id], 'restatement verified');
    const mF = await manifestRow((await manifestOf(evdF!.id, 1)).manifest_id);
    const exp = await approved({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mF.manifest_id], classificationCeiling: 'internal' } });
    // The leftover of an interrupted earlier build: the package directory holds a file already; the build clears it and stands.
    mkdirSync(exportDir(exp.id), { recursive: true }); writeFileSync(join(exportDir(exp.id), `${mF.manifest_id}.bin`), 'stale bytes of an interrupted build');
    expect((await execute(steward, exp.id)).execution).toMatchObject({ executed: 1, refused: 0 });
    expect(sha256(readFileSync(join(exportDir(exp.id), `${mF.manifest_id}.bin`)))).toBe(mF.content_digest);
    expect((await actionRow(exp.id)).state).toBe('executed');
    const del = await approved({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mF.manifest_id } });
    expect((await execute(steward, del.id)).execution).toMatchObject({ executed: 1 });
    expect((await verify(steward, del.id)).verification).toMatchObject({ verified: true });
    const v = await verify(steward, exp.id);
    expect(v.verification).toMatchObject({ verified: true, state: 'verified' });
    const item = (await verifications(exp.id)).find((c) => /exported — listed in the package/.test(c.check_name))!;
    expect(item.passed).toBe(true);
    expect(item.observed).toMatchObject({ export_present: true, export_digest_ok: true, exported: true, source_now: { tombstone: true, bytes_present: false } });
    await settle();
  }, 180_000);

  it('B11 · the redaction gate reads the exported RECORD\'s classification: an evidence version re-versioned to restricted is excluded under an internal ceiling (the gate says which classification gated), packaged under a restricted one with its header within the ceiling; re-versioned between the resolution and the execution the build refuses it', async () => {
    const [evdG, evdH] = await upload(['exp-g', 'exp-h']);
    const mG = await manifestRow((await manifestOf(evdG!.id, 1)).manifest_id); const mH = await manifestRow((await manifestOf(evdH!.id, 1)).manifest_id);
    expect(mG.classification).toBe('internal');
    expect(await reclassify(evdG!.id, 1, 'restricted')).toBe(2);
    const under = await opened({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mG.manifest_id], classificationCeiling: 'internal' } });
    expect(under.scope).toMatchObject({ state: 'paused', excluded: 1, execute: 0 });
    const g = (await items(under.id))[0]!;
    expect(g.disposition).toBe('excluded'); expect(g.reason).toMatch(/redaction gate: classification restricted \(the exported record's version 2; the manifest's is internal\) is above the export ceiling internal/);
    expect(g.details).toMatchObject({ gate: 'redaction', gated_on: 'record', classification: 'internal', record_classification: 'restricted', evd_version: 2 });
    await withdraw(steward, under.id, 'the redaction control is withdrawn');
    const within = await approved({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mG.manifest_id], classificationCeiling: 'restricted' } });
    expect((await execute(steward, within.id)).execution).toMatchObject({ executed: 1, refused: 0 });
    const manifest = JSON.parse(readFileSync(join(exportDir(within.id), 'manifest.json'), 'utf8')) as { objects: Array<{ object_version: number; header: Record<string, unknown> }>; gates: { redaction: { classification_ceiling: string } } };
    expect(manifest.gates.redaction.classification_ceiling).toBe('restricted');
    expect(manifest.objects[0]).toMatchObject({ object_version: 2, header: { classification: 'restricted' } });
    const okRun = await runVerifier(exportDir(within.id)); expect(okRun.code).toBe(0); expect(okRun.stdout).toMatch(/PASS\s+redaction: .*within the ceiling "restricted"/);
    // Re-versioned AFTER the resolution: the build refuses the record (a package never states a ceiling one of its headers exceeds), the action pauses for re-resolution, which excludes it.
    const late = await approved({ kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mH.manifest_id], classificationCeiling: 'internal' } });
    expect(await reclassify(evdH!.id, 1, 'confidential')).toBe(2);
    await expect(execute(steward, late.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/classification confidential is above the export ceiling internal \(redaction gate\)/) });
    expect(await actionRow(late.id)).toMatchObject({ state: 'paused', failure_class: 'unresolved_dependency', disposition: 'human_review' });
    expect(existsSync(exportDir(late.id))).toBe(false);
    expect((await sql<{ n: number }>`select count(*)::int n from retention.export_packages where action_id = ${late.id}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    expect((await resolve(steward, late.id)).scope).toMatchObject({ state: 'paused', excluded: 1 });
    await settle();
  }, 300_000);
});

describe('C · SAFE SCOPE of a deletion (0070 §4; V03-T-100, AU-MEM-0061)', () => {
  const evd: Record<string, { id: string; version: number }> = {};
  const m: Record<string, Awaited<ReturnType<typeof manifestRow>>> = {};
  let caseA = ''; let claimB = ''; let edgeB = ''; let briefC = ''; let pkgD = ''; let decE = ''; let decD = '';
  let delA: { id: string; digest: string } = { id: '', digest: '' };

  it('SETUP: seven uploads corrected in one case (each manifest under versions 1 and 2); a queued case, an approved claim with its asserted edge, a briefing, a live decision package, a live decision object, a memory item and a claim whose digest names no version', async () => {
    const names = ['saf-a', 'saf-b', 'saf-c', 'saf-d', 'saf-e', 'saf-f', 'saf-g'];
    const up = await upload(names);
    names.forEach((n, i) => { evd[n] = up[i]!; });
    await applyCase(await submitCorrection(names.map((n) => evd[n]!.id), 'safe-scope fixture: all restated'), names.map((n) => evd[n]!.id), 'restatements verified');
    for (const n of names) m[n] = await manifestRow((await manifestOf(evd[n]!.id, 1)).manifest_id);
    caseA = (await seedClaimOnBytes({ evidence: { id: evd['saf-a']!.id, version: 1 }, digest: m['saf-a']!.content_digest, reviewState: 'queued' })).caseId;
    claimB = (await seedClaimOnBytes({ evidence: { id: evd['saf-b']!.id, version: 1 }, digest: m['saf-b']!.content_digest, reviewState: 'approved' })).claimId;
    edgeB = await assertEdgeGoverned(owner, { predicate: 'ships_through', claimId: claimB, evidenceId: evd['saf-b']!.id, evidenceDigest: m['saf-b']!.content_digest });
    briefC = await insertBriefing([`evidence:${evd['saf-c']!.id}@1`], null);
    expect((await sql<{ n: number }>`select count(*)::int n from graph.dependencies where dependent_object_id = ${briefC}::uuid and dependent_type = 'BRF' and depends_on_kind = 'evidence' and depends_on_id = ${evd['saf-c']!.id}::uuid and state = 'active'`.execute(su)).rows[0]!.n).toBe(1);
    // The decision package citing saf-d@1 in an option's consequences (the rows as the governed routes leave them: the DEC, the package, the version proposed, the option).
    decD = await insertDecision('Reroute the corridor (fixture package)');
    pkgD = uuidv7();
    await sql`insert into decision.packages_current (package_id, scope, tenant_id, domain_id, decision_object_id, title, statement, owner_principal_id, state, current_version, declared_by, correlation_id)
      values (${pkgD}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${decD}::uuid, 'Reroute the corridor', 'fixture: a package citing evidence', ${owner.principalId}::uuid, 'proposed', 1, ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into decision.package_versions (package_id, version, scope, tenant_id, domain_id, state, known_at, author_principal_id, correlation_id)
      values (${pkgD}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'draft', clock_timestamp(), ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    const canonD = (await sql<{ d: string }>`select content_digest d from objects.canonical_objects where object_id = ${evd['saf-d']!.id}::uuid and object_version = 1`.execute(su)).rows[0]!.d;
    // The citation's id as a client may send it — upper-cased; every gate upstream admits it and stores it as sent — the safe scope compares the uuid, not its spelling.
    await sql`insert into decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason, set_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${pkgD}::uuid, 1, 'reroute', 'Reroute', 'intervention', ${JSON.stringify([{ kind: 'evidence', id: evd['saf-d']!.id.toUpperCase(), version: 1, digest: canonD }])}::jsonb, false, 'fixture: the option cites evidence, not a run', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`update decision.package_versions set state = 'proposed', version_digest = ${sha256(`v${pkgD}`)}, header_digest = ${sha256(`h${pkgD}`)}, proposed_at = clock_timestamp(), proposed_by = ${owner.principalId}::uuid, choice = '{"option_key":"reroute","rationale":"fixture"}'::jsonb where package_id = ${pkgD}::uuid and version = 1`.execute(su);
    // The DEC→evidence dependency row decision.propose_version writes for the citation (0049 §1) — the row the governed route leaves.
    await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${decD}::uuid, 'DEC', 'evidence', ${evd['saf-d']!.id}::uuid, ${`decision package ${pkgD} version 1 option reroute cites it`}, 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    // A decision object with a DEC→evidence dependency row on saf-e and NO live package citing it (the row a withdrawn package proposal left behind).
    decE = await insertDecision('Hold the inventory (fixture object-level dependency)');
    await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${decE}::uuid, 'DEC', 'evidence', ${evd['saf-e']!.id}::uuid, 'fixture: the decision rests on this evidence object', 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    // The memory item citing saf-f (the governed route; a MEM dependency is residual inventory, never load-bearing — D9).
    const mem = await graph.recordMemoryItem(h.req(knowledgeOwner, 'memory.item.record', 'MEM', null, 'memory'), T(), D(), { payload: {
      recordClass: 'strategic', title: 'A rule read from the terms document', statement: 'The corridor premium is capped at a quarter of the shipment value (fixture).',
      source: { kind: 'human', ref: 'decision room, 2024-01-17' }, audience: { classification: 'internal', roles: [], purposes: ['memory', 'graph'] },
      validity: { from: '2024-01-17T00:00:00Z', to: null }, retention: { profile: 'strategic-record-7y', retainUntil: '2031-01-17T00:00:00Z', basis: 'the decision record retention schedule' },
      cites: [{ kind: 'evidence', id: evd['saf-f']!.id, version: 1, rationale: 'the cap was read from this evidence' }], related: { decisionId: null, objectiveId: null } } }) as { memory: { itemId: string } };
    expect(mem.memory.itemId).toMatch(/^[0-9a-f-]{36}$/);
    // A queued case whose lineage digest names no version of saf-g (the -4 fixture pattern): provably not these bytes.
    await seedClaimOnBytes({ evidence: { id: evd['saf-g']!.id, version: 1 }, digest: sha256(evd['saf-g']!.id), reviewState: 'queued' });
    await settle();
  }, 300_000);

  it('C1 · PAUSED with the dependents named: a live review case on a claim whose lineage names the bytes blocks the deletion; the residual inventory is the same a non-blocking deletion records; an approval is refused', async () => {
    const a = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: m['saf-a']!.manifest_id } });
    expect(a.scope).toMatchObject({ state: 'paused', blocking: 1, execute: 0 });
    const row = await actionRow(a.id);
    expect(row).toMatchObject({ failure_class: 'unresolved_dependency', disposition: 'human_review' });
    expect(row.failure_reason).toMatch(new RegExp(`cannot be retired safely: 1 blocking item\\(s\\) — manifest ${m['saf-a']!.manifest_id} ← review_case:${caseA}`));
    const it1 = (await items(a.id))[0]!;
    expect(it1.disposition).toBe('blocking');
    expect(it1.details['versions']).toEqual([1, 2]);
    const deps = it1.details['dependents'] as Array<Record<string, unknown>>;
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ kind: 'review_case', ref: caseA, version_aware: true });
    expect(String(deps[0]!['claim'])).toMatch(/@1$/);
    expect(String(deps[0]!['route'])).toMatch(/decide the review case/);
    const rs = await residuals(a.id);
    expect(rs).toEqual(expect.arrayContaining([{ kind: 'claim_lineage', count: 1, status: 'retained_by_policy' }, { kind: 'canonical_version', count: 2, status: 'retained_by_policy' }]));
    await expect(approve(authority, a.id, a.digest)).rejects.toThrow(/only a resolved scope is approved/);
    delA = a;
    await settle();
  }, 120_000);

  it('C2 · the route: the case decided → resolved again the scope executes under a new digest; approved, executed (tombstone, bytes gone), verified with DeletionVerified', async () => {
    const a = delA;
    await intelligence.decideReview(h.req(reviewer, 'intelligence.review.decide', 'REV', caseA, 'intelligence'), T(), D(), caseA, { payload: { decision: 'approve', reason: 'the relationship holds as extracted (fixture)' } });
    const r = await resolve(steward, a.id);
    expect(r.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    expect(String(r.scope['scope_digest'])).not.toBe(a.digest);
    await approve(authority, a.id, String(r.scope['scope_digest']));
    const since = await mark();
    const ex = await execute(steward, a.id);
    expect(ex.execution).toMatchObject({ executed: 1, refused: 0 });
    expect(await tombstones(m['saf-a']!.manifest_id)).toBe(1);
    expect(await vault.exists('evidence', scope(), m['saf-a']!.locator)).toBe(false);
    expect((await verify(steward, a.id)).verification).toMatchObject({ verified: true, state: 'verified' });
    const done = await outboxEvent('DeletionVerified', since, (p) => p['action_id'] === a.id);
    expect(done.payload).toMatchObject({ action_id: a.id, executed: 1 });
    await settle();
  }, 180_000);

  it('C3 · an ASSERTED edge whose provenance names the bytes blocks (the approved case is not listed); retracted, it releases', async () => {
    const a = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: m['saf-b']!.manifest_id } });
    expect(a.scope).toMatchObject({ state: 'paused', blocking: 1 });
    const deps = (await items(a.id))[0]!.details['dependents'] as Array<Record<string, unknown>>;
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ kind: 'edge', ref: edgeB, claim: `${claimB}@1`, version_aware: true });
    await graph.retractEdge(h.req(owner, 'graph.edge.retract', 'EDG', edgeB, 'graph'), T(), D(), edgeB, { payload: { reason: 'fixture: the relationship no longer holds' } });
    expect((await resolve(steward, a.id)).scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    await withdraw(steward, a.id, 'the safe-scope fixture is withdrawn after release');
    await settle();
  }, 120_000);

  it('C4 · a BRIEFING citing the version blocks — named once, not twice through its object-level row; the next briefing of the line releases; the dependency residual stays', async () => {
    const a = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: m['saf-c']!.manifest_id } });
    expect(a.scope).toMatchObject({ state: 'paused', blocking: 1 });
    const deps = (await items(a.id))[0]!.details['dependents'] as Array<Record<string, unknown>>;
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ kind: 'briefing', ref: briefC, cited_as: `evidence:${evd['saf-c']!.id}@1`, version_aware: true });
    // @2 would still name the manifest (the correction keeps it): the next briefing of the line cites nothing of saf-c.
    await insertBriefing([`run:${uuidv7()}@1`], briefC);
    expect((await resolve(steward, a.id)).scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    const rs = await residuals(a.id);
    expect(rs.find((r) => r.kind === 'dependency')).toMatchObject({ count: 1, status: 'retained_by_policy' }); // the briefing's evidence dependency row, retained
    await withdraw(steward, a.id, 'the safe-scope fixture is withdrawn after release');
    await settle();
  }, 120_000);

  it('C5 · a LIVE decision package citing the version in an option (its id upper-cased) blocks — named ONCE, the DEC→evidence row its proposal wrote not listed a second time; withdrawing the package releases, the row staying a residual', async () => {
    const a = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: m['saf-d']!.manifest_id } });
    expect(a.scope).toMatchObject({ state: 'paused', blocking: 1 });
    const deps = (await items(a.id))[0]!.details['dependents'] as Array<Record<string, unknown>>;
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ kind: 'decision_package', ref: `${pkgD}@1`, option: 'reroute', version_aware: true, package_state: 'proposed' });
    expect((await sql<{ n: number }>`select count(*)::int n from graph.dependencies where dependent_object_id = ${decD}::uuid and depends_on_id = ${evd['saf-d']!.id}::uuid and state = 'active'`.execute(su)).rows[0]!.n).toBe(1);
    await sql`update decision.packages_current set state = 'withdrawn' where package_id = ${pkgD}::uuid`.execute(su);
    expect((await resolve(steward, a.id)).scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    expect((await residuals(a.id)).find((r) => r.kind === 'dependency')).toMatchObject({ count: 1, status: 'retained_by_policy' }); // the DEC row stays, retained
    await withdraw(steward, a.id, 'the safe-scope fixture is withdrawn after release');
    await settle();
  }, 120_000);

  it('C8 · the preservation kinds ignore the rule: a review and an archive of the object-level-referenced manifest resolve to execute (run before the decision object is closed)', async () => {
    const review = await opened({ kind: 'review', targetKind: 'evidence', selector: { manifestId: m['saf-e']!.manifest_id } });
    expect(review.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    await withdraw(steward, review.id, 'the preservation control is withdrawn');
    const archive = await opened({ kind: 'archive', targetKind: 'evidence', selector: { manifestIds: [m['saf-e']!.manifest_id] } });
    expect(archive.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    await withdraw(steward, archive.id, 'the preservation control is withdrawn');
    await settle();
  }, 120_000);

  it('C6 · OBJECT-LEVEL: a DEC→evidence dependency row is package-derived and is not load-bearing on its own (no route closes a decision object; the package citation governs, version-aware) — a live DEC with the row and no live package citing the version does not block; the row stays a residual; a latest-of-line briefing\'s object-level row keeps the general successor test', async () => {
    const a = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: m['saf-e']!.manifest_id } });
    expect(a.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    expect((await sql<{ status: string }>`select status from graph.strategy_current where strategy_object_id = ${decE}::uuid`.execute(su)).rows[0]!.status).toBe('active');
    expect((await residuals(a.id)).find((r) => r.kind === 'dependency')).toMatchObject({ count: 1, status: 'retained_by_policy' });
    await withdraw(steward, a.id, 'the safe-scope fixture is withdrawn after release');
    // The object-level rule that remains: a BRF row of the latest briefing of a line whose source does not name one of the manifest's versions
    // (its version-aware source names another version) blocks only while no later version carries different servable bytes.
    const briefE = await insertBriefing([`evidence:${evd['saf-e']!.id}@9`], null);
    await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      select ${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${briefE}::uuid, 'BRF', 'evidence', ${evd['saf-e']!.id}::uuid, 'fixture: the briefing rests on the evidence object', 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid
      where not exists (select 1 from graph.dependencies d where d.dependent_object_id = ${briefE}::uuid and d.depends_on_id = ${evd['saf-e']!.id}::uuid)`.execute(su);
    const b = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: m['saf-e']!.manifest_id } });
    expect(b.scope).toMatchObject({ state: 'paused', blocking: 1 });
    const deps = (await items(b.id))[0]!.details['dependents'] as Array<Record<string, unknown>>;
    expect(deps).toHaveLength(1);
    expect(deps[0]).toMatchObject({ kind: 'briefing', ref: briefE, version_aware: false });
    expect(String(deps[0]!['route'])).toMatch(/no later version carries servable bytes.*compose the next briefing of the line/);
    await insertBriefing([`run:${uuidv7()}@1`], briefE);
    expect((await resolve(steward, b.id)).scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    await withdraw(steward, b.id, 'the safe-scope fixture is withdrawn after release');
    await settle();
  }, 120_000);

  it('C7 · the non-blocking references stay residuals: a memory item citing the object (and the version in its payload) and a queued case whose lineage digest names no version of the object', async () => {
    const f = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: m['saf-f']!.manifest_id } });
    expect(f.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    expect((await residuals(f.id)).find((r) => r.kind === 'dependency')).toMatchObject({ count: 1, status: 'retained_by_policy' });
    await withdraw(steward, f.id, 'the residual control is withdrawn');
    const g = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: m['saf-g']!.manifest_id } });
    expect(g.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    await withdraw(steward, g.id, 'the digest-rule control is withdrawn');
    await settle();
  }, 120_000);

  it('C9 · the safe scope is re-proven AT EXECUTION: a reference created inside the approval window (a challenge queued on a claim whose lineage names the bytes) refuses the execution (references_changed) — the action paused unresolved_dependency, the approvals revoked, no tombstone, the bytes present; resolved again the item is blocking with the case named', async () => {
    const a = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: m['saf-g']!.manifest_id } });
    expect(a.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    await approve(authority, a.id, a.digest);
    const late = await seedClaimOnBytes({ evidence: { id: evd['saf-g']!.id, version: 1 }, digest: m['saf-g']!.content_digest, reviewState: 'queued' });
    await expect(execute(steward, a.id)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(new RegExp(`references_changed.*manifest ${m['saf-g']!.manifest_id} ← review_case:${late.caseId}`)) });
    expect(await actionRow(a.id)).toMatchObject({ state: 'paused', failure_class: 'unresolved_dependency', disposition: 'human_review' });
    expect(await approvalsLive(a.id)).toBe(0);
    expect(await tombstones(m['saf-g']!.manifest_id)).toBe(0);
    expect(await executions(a.id)).toEqual([]);
    expect(await vault.exists('evidence', scope(), m['saf-g']!.locator)).toBe(true);
    const again = await resolve(steward, a.id);
    expect(again.scope).toMatchObject({ state: 'paused', blocking: 1, execute: 0 });
    const deps = (await items(a.id))[0]!.details['dependents'] as Array<Record<string, unknown>>;
    expect(deps).toEqual([expect.objectContaining({ kind: 'review_case', ref: late.caseId })]);
    await settle();
  }, 180_000);

  it('C10 · currency is the evidence OBJECT\'s: a revision admits the next version under a NEW manifest and leaves the earlier version admitted — once the object is corrected, the revised-away manifest is retirable (its object-level references released by the successor test), while the object is current it is not', async () => {
    const [evdR, evdS] = await upload(['saf-r', 'saf-s']);
    const mR1 = await manifestRow((await manifestOf(evdR!.id, 1)).manifest_id); const mS = await manifestRow((await manifestOf(evdS!.id, 1)).manifest_id);
    // The revision as the acquisition lifecycle admits it (item.revised): version 2 of the SAME object, lifecycle admitted, under other bytes (here: the second upload's manifest).
    await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, truth_state, synthetic_state, classification, purpose_scope, schema_ref, audit_correlation_id, content_digest, method_ref, recorded_at, observation_time, time_precision, source_clock_quality, source_object_ids, evidence_refs, human_refs, payload, event_time, valid_from, valid_to, supersedes)
      select object_id, object_type, tenant_id, domain_id, scope, 2, 'admitted', owning_component, accountable_owner, truth_state, synthetic_state, classification, purpose_scope, schema_ref, ${uuidv7()}::uuid, ${sha256(`revision ${evdR!.id}`)}, method_ref, clock_timestamp(), observation_time, time_precision, source_clock_quality, source_object_ids, ${JSON.stringify([`blob:${mS.manifest_id}`])}::jsonb, human_refs,
             payload || ${JSON.stringify({ manifest_id: mS.manifest_id, locator: mS.locator, content_digest: mS.content_digest, byte_length: mS.byte_length })}::jsonb, event_time, valid_from, valid_to, ${`${evdR!.id}@1`}
        from objects.canonical_objects where object_id = ${evdR!.id}::uuid and object_version = 1`.execute(su);
    // While the object is current (its latest version admitted): the revised-away manifest is excluded — the reason names the object's latest version and the route (correct or withdraw first).
    const cur = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mR1.manifest_id } });
    expect(cur.scope).toMatchObject({ state: 'paused', excluded: 1, execute: 0 });
    const ex = (await items(cur.id))[0]!;
    expect(ex.reason).toMatch(/the evidence object resting on these bytes is current \(its latest version 2 is admitted\); a deletion retires corrected, superseded or withdrawn evidence only — correct or withdraw it first/);
    expect(ex.details).toMatchObject({ evd_version: 1, evd_state: 'admitted', object_version: 2, object_state: 'admitted' });
    await withdraw(steward, cur.id, 'the currency control is withdrawn');
    // The route taken: the object corrected (version 3 under the revision's manifest) — the revised-away manifest enters the deletion with V(M) = {1}, and the
    // successor test releases object-level references (a later admitted version carries different servable bytes); version-aware references to @1 would still block.
    expect(await reclassify(evdR!.id, 2, 'internal')).toBe(3);
    await sql`insert into graph.dependencies (dependency_id, scope, tenant_id, domain_id, dependent_object_id, dependent_type, depends_on_kind, depends_on_id, rationale, state, created_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${await insertBriefing([`evidence:${evdR!.id}@2`], null)}::uuid, 'BRF', 'evidence', ${evdR!.id}::uuid, 'fixture: the briefing rests on the evidence object', 'active', ${owner.principalId}::uuid, ${uuidv7()}::uuid)
      on conflict do nothing`.execute(su);
    const gone = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mR1.manifest_id } });
    expect(gone.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0, excluded: 0 });
    const it1 = (await items(gone.id))[0]!;
    expect(it1.details).toMatchObject({ versions: [1], evd_version: 1, object_version: 3, object_state: 'corrected' });
    await withdraw(steward, gone.id, 'the revision control is withdrawn');
    await settle();
  }, 180_000);
});

describe('D · a WITHDRAWAL is its own named act (0070 §9): retention.action.withdraw — the steward withdraws an opened action; the opener\'s action on the withdraw route is an envelope/route mismatch, refused before any port; an executed action is not withdrawable', () => {
  it('withdraw under its own action; the mismatch refused; a closed action refused by the port', async () => {
    const { manifestId } = await (async () => { const rows = (await sql<{ m: string }>`select (payload ->> 'manifest_id') m from objects.canonical_objects where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and object_type = 'EVD' order by recorded_at limit 1`.execute(su)).rows; return { manifestId: rows[0]!.m }; })();
    const a = await open(steward, { kind: 'review', targetKind: 'evidence', selector: { manifestId } });
    await expect(retention.withdraw(h.req(steward, 'retention.action.open', 'RTA', a.action.actionId, 'retention'), T(), D(), a.action.actionId, { payload: { reason: 'under the wrong action' } })).rejects.toMatchObject({ status: expect.any(Number) });
    expect((await sql<{ state: string }>`select state from retention.actions_current where action_id = ${a.action.actionId}::uuid`.execute(su)).rows[0]!.state).toBe('opened');
    await withdraw(steward, a.action.actionId, 'opened in error; withdrawn by the steward');
    expect((await sql<{ state: string; failure_reason: string }>`select state, failure_reason from retention.actions_current where action_id = ${a.action.actionId}::uuid`.execute(su)).rows[0]).toEqual({ state: 'withdrawn', failure_reason: 'opened in error; withdrawn by the steward' });
    expect((await sql<{ event: string }>`select event from retention.action_events where action_id = ${a.action.actionId}::uuid order by occurred_at desc limit 1`.execute(su)).rows[0]!.event).toBe('action.withdrawn');
    await expect(withdraw(steward, a.action.actionId, 'withdrawing twice')).rejects.toThrow(/not withdrawable in its state/);
    await settle();
  }, 60_000);
});
