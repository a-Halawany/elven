/**
 * CP-6 B19 (migration 0079) — SOURCE-DERIVED MEMORY RECORDS: a MEM version DERIVED from a claim version (ENT/EVT/CLM/REL/ASM; the
 * exact version or the latest) or a warning by the knowledge owner's human-gated act (memory.item.derive) — the statement computed
 * by the method memory-derive@1.0.0 and its digest re-verified by the port, the provenance (the basis version and digest, the
 * evidence versions with their digests and byte spans, the source contract, the series keys), the controls inherited (ES-29-002 is a
 * floor, not a veto: the most restrictive classification applied and SAID as declared / inherited / applied; synthetic state, rights,
 * residency, retention), the truth state the basis's (extracted / asserted / inferred — never observed), the review gate (a queued,
 * rejected, case-corrected, withdrawn or imported basis refused; withdrawn EVIDENCE under a live claim refused too — C2), the
 * deriver's CLEARANCE over the applied classification (the act is not an oracle over confidential content — C1), the basis FOLLOWED
 * (basis_corrected by the walk; basis_withdrawn by the corrections path, a claim_withdrawal walk of a withdrawn claim and the
 * revocation's port; served with availability.basis_state, never refused for the basis's sake), a re-derivation under
 * memory.item.supersede, and the DELETION PAUSE (retention.load_bearing_references branch (f): a derived record blocks the deletion of
 * the evidence version it copies from; a person's own record stays a residual) — on a real database through the governed controllers
 * and pipeline (RLS, the ports, the ledgers). No consumer is registered (D11: the outbox rows are asserted by presence and payload,
 * never by status); the impact walks are the manual route (graph.impact.propagate, the B9 idiom).
 *
 *   M1 · DERIVED (document) from a REL claim on CONFIDENTIAL evidence: the knowledge owner (internal clearance) is refused 403 by the
 *   clearance line before any write (no row, no canonical object, no event); the domain administrator derives — the statement byte
 *   for byte, its digest, the basis (version, digest, truth and review state, event time), the lift SAID (declared internal,
 *   inherited confidential, applied confidential — from the evidence: the claim says internal), synthetic true from synthetic evidence
 *   under a false-saying claim, the retention declared, the source contract (media_type the declared type — C7), the evidence version
 *   with its span, the projection and the derivation block, the MEM@v2 canonical row validating against the registry (a human payload
 *   too — backward), the recorded event, the two dependency rows, GraphChanged/memory_item.recorded caused by the derive act, the
 *   retrieval serving the block with basis_state current (the knowledge owner and the analyst refused: the lift is real), the
 *   controls (/record with a non-human kind, the analyst, sourceKind human, a typed statement, no event time, the retention inherited
 *   from the evidence, an unknown basis or version, a confidential claim on confidential evidence — refused for the owner, admitted
 *   for the administrator) and the PORT'S OWN UNITS (a statement the digest does not bind, a human record with a derivation, telemetry
 *   without series keys, a derivation under memory.item.record, a basis without its fields, a missing truth state).
 *
 *   M2 · THE REVIEW GATE and the LIFECYCLE GATE: queued (the payload's reason), rejected, corrected in review to a later version (the
 *   corrected version derivable as asserted / corrected), a withdrawn object at any version (409 EYE-STA-003), an imported claim (409),
 *   an unknown warning (404), a bad basis kind (422).
 *
 *   M3 · TELEMETRY on the REST fixture (a contract version with a declared backfill, one governed run): the series rule (422 before a
 *   series is registered on the source; admitted with series_keys after; the document kind admitted regardless — the kind is the
 *   person's, the rule is telemetry's), truth_state extracted NEVER observed; a WARNING basis (an indicator on the series, a scenario
 *   with a downside branch flipped on the November episode): inferred, review_state raised, the breaching evidence version, the
 *   indicator and its rule, telemetry only.
 *
 *   M4 · THE RECORD FOLLOWS THE BASIS: (a) the evidence corrected and walked → basis_corrected with the trigger kind in the event, the
 *   retrieval basis_state corrected; (b) RE-DERIVED on the corrected claim version (the domain administrator — a supersede holder with
 *   confidential clearance; the knowledge owner refused by the PDP, the record authority refused by the clearance line on a
 *   confidential record; the kind-class crossings refused both ways; v1 replayable; the evidence row kept); (c) WITHDRAWN by the
 *   corrections path (basis_withdrawn in the applying transaction, the human record untouched, the record SERVED with basis_state
 *   withdrawn; a derivation from the claim on the withdrawn bytes refused 409 and a re-derivation of the marked record refused 409 with
 *   the mark intact — C2; a later walk does not downgrade), by a claim_withdrawal walk (the NEGATIVE first: a live, merely corrected
 *   claim walked as claim_withdrawal marks basis_corrected — C5; the withdrawn version recorded, the walk marks basis_withdrawn) and by
 *   the revocation's port under retention.import.revoke (the unit: two records marked once, a second call marks none, another action
 *   refused, a bad basis kind refused); (d) the record authority withdraws the record.
 *
 *   M5 · THE DELETION PAUSE: the manifest of the corrected evidence A — paused, blocking, the three derived records resting on it named
 *   with their bases, versions and attention states and the route; released by their withdrawal; the manifest of the withdrawn
 *   evidence B — a second paused case naming the queued review case and the standing derived record (an honest extra assertion, not
 *   the control — C3); the HUMAN CONTROL on its own evidence H (a person's record citing withdrawn evidence is a residual, never a
 *   block); the VERSION RULE probed on the function itself (matched by version, by the lineage digest, by neither).
 *
 *   M6 · THE BRIEFING carries the derived record with the basis's truth state, synthetic true and basis_state current, the human item
 *   unchanged (synthetic false, no derivation), the composer's access on the item's ledger; the evidence withdrawn by a correction case
 *   → a second composition carries basis_state withdrawn on both derived records with the statements still carried (C6).
 *
 * Read against the design's own statements, what this harness does NOT claim: the communication kind is exercised by the /record
 * refusal only (the source kinds beyond the telemetry rule are the owner's declaration — no contract-level source class); the
 * observed series-window basis (the module boundary) is owed; the imported basis is refused, so the revocation path's call is
 * exercised as the port's unit under retention.import.revoke, never through the revoke route; a warning-based record is NOT marked
 * when the warning's forecast is withdrawn as unfit — the warning stands (input_unverified), its record reads basis_state current,
 * and memory.mark_basis_withdrawn('warning', …) has no caller in B19 (N-f); the listing exposes a derived record's basis ids and
 * digests (never content) to every lister, and a claim_withdrawal walk marks a HUMAN record's attention too — the port leaves it
 * (N-g); the timestamptz columns read back as Date objects are compared as ISO instants.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { TERMS_CSV } from './phase5-fixtures.js';
import { commitDb, type AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
type ClaimType = 'ENT' | 'EVT' | 'CLM' | 'REL' | 'ASM';
type Seeded = { claimId: string; version: number; runId: string; methodId: string; contentDigest: string };
/** The derive answer as the design states it (§2.3 DeriveAnswer); a re-derivation adds priorVersion. */
type DeriveAnswer = {
  itemId: string; version: number; cites: number; contentDigest: string; statement: string; statementDigest: string; sourceKind: string;
  basis: { kind: string; object_type: string; id: string; version: number; content_digest: string; truth_state: string; review_state: string; event_time: string | null };
  source: Row; evidence: Array<{ object_id: string; version: number; digest: string; byte_start: number | null; byte_end: number | null }>; seriesKeys: string[];
  classification: { declared: string; inherited: string; applied: string }; inherited: Row; priorVersion?: number;
};
/** The B19 route of the graph controller as the design states it (§2.5); the harness calls it in process, as the B14–B18 harnesses call theirs. */
interface B19Graph { deriveMemoryItem(req: never, tenantId: string, domainId: string, body: { payload?: Row }): Promise<{ memory: DeriveAnswer; receipt: Row }> }
type Retrieval = { memory: { versionServed: number; versions: number; accessId: string; version: Row; item: Row; availability: Row } };
type Composed = { briefing: { briefingId: string; contentDigest: string; items: Row[]; controls: Row; memoryAccesses: Row[] } };
type ScopeAnswer = { scope: Row };

let h: Phase4Harness; let graph: GraphController; let b19: B19Graph; let observation: ObservationController; let retention: RetentionController; let prediction: PredictionController; let exec: ExecutiveController;
let commit: AnyDb; let su: AnyDb;
let knowledgeOwner: AuthenticatedPrincipal; let recordAuthority: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let authority: AuthenticatedPrincipal;
let executive: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const scope = () => ({ tenantId: T(), domainId: D() });
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
/** A timestamptz comes back as a Date under kysely: compared as an ISO instant, never as an object (check-2 S-3). */
const instantOf = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string | Date).toISOString());
const sorted = (xs: unknown[]): string[] => xs.map(String).sort();
/** A refusal as the caller sees it: the HttpException's status and the dashed catalogue code, or a port's SQLSTATE and text. */
const failure = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  try { await p; return { status: null, code: null, message: '' }; } catch (e) {
    if (e instanceof HttpException) { const r = e.getResponse() as { code?: string; message?: string }; return { status: e.getStatus(), code: r.code ?? null, message: String(r.message ?? '') }; }
    return { status: null, code: (e as { code?: string }).code ?? null, message: (e as Error).message };
  }
};

/* ───────────── the rows ───────────── */
type ItemRow = { object_version: number; state: string; attention_state: string; attention_reason: string | null; superseded_versions: number; retention_profile: string; source_kind: string; source_ref: string | null; classification: string; statement: string; derivation: Row | null; owner_principal_id: string };
const itemRow = async (itemId: string): Promise<ItemRow> => (await sql<ItemRow>`select object_version::int, state, attention_state, attention_reason, superseded_versions::int, retention_profile, source_kind, source_ref, classification, statement, derivation, owner_principal_id::text from memory.items_current where item_id = ${itemId}::uuid`.execute(su)).rows[0]!;
const derivationOf = async (itemId: string): Promise<Row> => (await itemRow(itemId)).derivation as Row;
const itemEvents = async (itemId: string) => (await sql<{ event: string; object_version: number; details: Row }>`select event, object_version::int, details from memory.item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const accessRows = async (itemId: string) => (await sql<{ object_version: number; purpose_id: string; reader_principal_id: string; read_as_of: Date | null }>`select object_version::int, purpose_id, reader_principal_id::text, read_as_of from memory.item_access where item_id = ${itemId}::uuid order by accessed_at`.execute(su)).rows;
type Canon = { object_version: string; lifecycle_state: string; truth_state: string; synthetic_state: boolean; classification: string; schema_ref: string; supersedes: string | null; provenance_ref: string | null; method_ref: string | null; event_time: Date | null; evidence_refs: unknown; source_object_ids: unknown; human_refs: unknown; accountable_owner: string; retention_profile: string | null; rights_profile: string | null; residency_profile: string | null; content_digest: string; payload: Row };
const canon = async (objectId: string): Promise<Canon[]> => (await sql<Canon>`select object_version::text, lifecycle_state, truth_state, synthetic_state, classification, schema_ref, supersedes, provenance_ref, method_ref, event_time, evidence_refs, source_object_ids, human_refs, accountable_owner, retention_profile, rights_profile, residency_profile, content_digest, payload from objects.canonical_objects where object_id = ${objectId}::uuid order by object_version`.execute(su)).rows;
const memCount = async (): Promise<[number, number, number]> => {
  const c = (await sql<{ n: number }>`select count(*)::int n from objects.canonical_objects where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and object_type = 'MEM'`.execute(su)).rows[0]!.n;
  const i = (await sql<{ n: number }>`select count(*)::int n from memory.items_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`.execute(su)).rows[0]!.n;
  const e = (await sql<{ n: number }>`select count(*)::int n from memory.item_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`.execute(su)).rows[0]!.n;
  return [c, i, e];
};
/** The ACTIVE dependency rows of a memory item, by kind and id. */
const deps = async (itemId: string) => (await sql<{ depends_on_kind: string; depends_on_id: string }>`select depends_on_kind, depends_on_id::text from graph.dependencies where dependent_object_id = ${itemId}::uuid and dependent_type = 'MEM' and state = 'active' order by depends_on_kind, depends_on_id`.execute(su)).rows;
/** The GraphChanged row of a kind caused on a target — by presence and payload (D11: no consumer, no status). */
const outboxRow = async (kind: string, targetId: string) => (await sql<{ id: string; status: string; payload: Row }>`select id::text, status, payload from objects.object_outbox where event_type = 'GraphChanged' and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and payload #>> '{change,kind}' = ${kind} and payload #>> '{cause,target_id}' = ${targetId} order by created_at desc limit 1`.execute(su)).rows[0];
let memV2Schema: object | null = null;
/** The MEM@v2 json schema as the registry holds it (D8: objects.admit_version does not validate against the registry — this is the proof the row is honest). */
const ajvValid = async (payload: unknown): Promise<{ valid: boolean; errors: string }> => {
  memV2Schema ??= (await sql<{ json_schema: object }>`select json_schema from objects.schema_registry where object_type = 'MEM' and schema_version = 'v2'`.execute(su)).rows[0]!.json_schema;
  const ajv = new Ajv2020({ strict: false });
  const valid = ajv.validate(memV2Schema, payload) as boolean;
  return { valid, errors: JSON.stringify(ajv.errors) };
};
const manifestOf = async (evdId: string, version: number) => (await sql<{ manifest_id: string }>`select (payload ->> 'manifest_id') as manifest_id from objects.canonical_objects o where o.object_id = ${evdId}::uuid and o.object_version = ${version}`.execute(su)).rows[0]!;
type ManifestRow = { manifest_id: string; locator: string; content_digest: string; byte_length: number; classification: string; source_id: string; retention_profile: string };
const manifestRow = async (manifestId: string): Promise<ManifestRow> => (await sql<ManifestRow>`select manifest_id::text, locator, content_digest, byte_length::int, classification, source_id::text, retention_profile from observation.blob_manifests where manifest_id = ${manifestId}::uuid`.execute(su)).rows[0]!;
type WarningRow = { warning_id: string; state: string; indicator_id: string; title: string; consequence: string; evidence: Row[] };
const warningRow = async (warningId: string): Promise<WarningRow> => (await sql<WarningRow>`select warning_id::text, state, indicator_id::text, title, consequence, evidence from prediction.warnings_current where warning_id = ${warningId}::uuid`.execute(su)).rows[0]!;

/* ───────────── the retention routes (the B11 helpers) ───────────── */
type Action = { action_id: string; state: string; kind: string; scope_digest: string | null; failure_class: string | null; disposition: string | null; failure_reason: string | null };
const actionRow = async (id: string): Promise<Action> => (await sql<Action>`select action_id::text, state, kind, scope_digest, failure_class, disposition, failure_reason from retention.actions_current where action_id = ${id}::uuid`.execute(su)).rows[0]!;
const items = async (id: string) => (await sql<{ item_kind: string; ref: string; disposition: string; reason: string; details: Row }>`select item_kind, ref, disposition, reason, details from retention.scope_items where action_id = ${id}::uuid order by dependency_order`.execute(su)).rows;
const residuals = async (id: string) => (await sql<{ kind: string; count: number; status: string }>`select kind, count::int, status from retention.residual_inventory where action_id = ${id}::uuid order by kind`.execute(su)).rows;
const open = (p: AuthenticatedPrincipal, payload: Row) => retention.openAction(h.req(p, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string; state: string } }>;
const resolve = (p: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(p, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<ScopeAnswer>;
const approve = (p: AuthenticatedPrincipal, id: string, digest: string, rationale = 'the scope as resolved') => retention.approve(h.req(p, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale } }) as Promise<{ approval: { approvalId: string } }>;
const withdraw = (p: AuthenticatedPrincipal, id: string, reason: string) => retention.withdraw(h.req(p, 'retention.action.withdraw', 'RTA', id, 'retention'), T(), D(), id, { payload: { reason } });
/** OPEN → RESOLVE in one go; the action id, the scope digest and the scope as resolved. */
const opened = async (payload: Row): Promise<{ id: string; digest: string; scope: Row }> => {
  const o = await open(steward, payload);
  const r = await resolve(steward, o.action.actionId);
  return { id: o.action.actionId, digest: String(r.scope['scope_digest']), scope: r.scope };
};

/* ───────────── observation and graph (the -4 helpers; the case's source is the evidence's own — a confidential upload's case names the confidential source) ───────────── */
const submitCorrection = async (evdIds: string[], reason: string, kind: 'correction' | 'withdrawal' = 'correction', ceiling: 'internal' | 'confidential' = 'internal'): Promise<string> => {
  const o = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId: await h.uploadSource(ceiling), kind, channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  return o.correction.caseId;
};
const applyCase = (caseId: string, evdIds: string[], reason: string) =>
  observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId, { payload: { decision: 'apply', affectedEvdIds: evdIds, reason } }) as Promise<{ correction: Row }>;
type Walk = { impact: { invalidationId: string; memoryItems: Array<{ strategy_object_id: string }>; statement: string } };
const propagate = (triggerKind: 'evidence_correction' | 'claim_withdrawal', triggerObjectId: string) =>
  graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', triggerObjectId, 'graph'), T(), D(), { payload: { triggerKind, triggerObjectId } }) as Promise<Walk>;

/* ───────────── the memory routes ───────────── */
/** A person's own record (source kind human); cites nothing unless told (C9: never another fixture's evidence). */
const item = (over: Row = {}): Row => ({
  recordClass: 'strategic', title: 'Why the third shipment was held on the booked routing',
  statement: 'The corridor transit level the routing decision relied on was read from the PortWatch series; the hold stands until the strait reopens.',
  source: { kind: 'human', ref: 'decision room, 2024-01-17' },
  audience: { classification: 'internal', roles: [], purposes: ['memory', 'graph', 'briefing'] },
  validity: { from: '2024-01-17T00:00:00Z', to: null },
  retention: { profile: 'strategic-record-7y', retainUntil: '2031-01-17T00:00:00Z', basis: 'the decision record retention schedule' },
  cites: [], related: { decisionId: null, objectiveId: null }, ...over,
});
/** The derive payload: the basis and the declared fields — no statement, no source, no cites (the server's). */
const basisOf = (kind: 'claim' | 'warning', id: string, version: number | null = null, over: Row = {}): Row => ({
  basis: { kind, id, ...(version === null ? {} : { version }) }, sourceKind: 'document', recordClass: 'institutional', title: 'Derived record (harness)',
  audience: { classification: 'internal', roles: [], purposes: ['memory', 'graph', 'briefing'] },
  validity: { from: '2024-01-14T00:00:00Z', to: null }, retention: { profile: 'derived-record-5y', retainUntil: null, basis: null },
  cites: [], related: { decisionId: null, objectiveId: null }, ...over,
});
const recordAs = (p: AuthenticatedPrincipal, payload: Row, purpose = 'memory') =>
  graph.recordMemoryItem(h.req(p, 'memory.item.record', 'MEM', null, purpose), T(), D(), { payload }) as Promise<{ memory: { itemId: string; version: number; cites: number } }>;
const deriveAs = (p: AuthenticatedPrincipal, payload: Row, purpose = 'memory') =>
  b19.deriveMemoryItem(h.req(p, 'memory.item.derive', 'MEM', null, purpose), T(), D(), { payload });
const supersedeAs = (p: AuthenticatedPrincipal, id: string, payload: Row) =>
  graph.supersedeMemoryItem(h.req(p, 'memory.item.supersede', 'MEM', id, 'memory'), T(), D(), id, { payload }) as unknown as Promise<{ memory: DeriveAnswer & { priorVersion: number } }>;
const withdrawAs = (p: AuthenticatedPrincipal, id: string, reason: string) =>
  graph.withdrawMemoryItem(h.req(p, 'memory.item.withdraw', 'MEM', id, 'memory'), T(), D(), id, { payload: { reason } }) as Promise<{ memory: { state: string } }>;
const retrieveAs = (p: AuthenticatedPrincipal, itemId: string, purpose: string, asOf: string | null = null) =>
  graph.retrieveMemoryItem(h.req(p, 'memory.item.retrieve', 'MEM', itemId, purpose), T(), D(), itemId, { payload: asOf === null ? {} : { asOf } }) as Promise<Retrieval>;
const compose = (p: AuthenticatedPrincipal, knownAt: string) =>
  exec.compose(h.req(p, 'briefing.compose', 'BRF', null, 'briefing'), T(), D(), { payload: { roomId: null, knownAt, priorBriefingId: null } }) as unknown as Promise<Composed>;
const memoryOf = (b: { items: Row[] }) => b.items.filter((i) => i['kind'] === 'memory');

/* ───────────── the origin's derived knowledge, seeded as the extraction admits it (the B17 idiom, widened: the lifecycle, the truth state, the event time, the controls and a payload override merged LAST) ───────────── */
async function seedClaim(a: { claimId?: string; version?: number; type: ClaimType; evidence: Evd; classification: 'internal' | 'confidential'; payload: Row;
  lifecycle?: 'active' | 'corrected' | 'withdrawn'; truthState?: string; eventTime?: string | null; syntheticState?: boolean; retentionProfile?: string | null; provenanceRef?: string | null; payloadOver?: Row }): Promise<Seeded> {
  const claimId = a.claimId ?? uuidv7(); const version = a.version ?? 1; const runId = uuidv7(); const methodId = uuidv7(); const now = new Date().toISOString();
  const lifecycle = a.lifecycle ?? 'active'; const truthState = (a.truthState ?? 'extracted') as CanonicalHeader['truth_state'];
  const eventTime = a.eventTime === undefined || a.eventTime === null ? null : new Date(a.eventTime).toISOString();
  const synthetic = a.syntheticState ?? false; const retention = a.retentionProfile ?? null; const provenance = a.provenanceRef ?? null;
  const withdrawal = lifecycle === 'withdrawn' ? 'withdrawn by the harness' : null;
  const lineage = { method_key: 'fixture', method_id: methodId, model_id: 'fixture-model', model_weights_digest: sha256('w'), runtime_version: '1.0.0', prompt_version: '1', decoding_digest: sha256('d'), mode: 'replay', call_id: null, run_id: runId,
    evidence_object_id: a.evidence.id, evidence_digest: a.evidence.bytesDigest, byte_start: 0, byte_end: 4, extraction_identity: sha256(`${claimId}@${version}`), retrieval_decision_id: uuidv7(), retrieval_audit_seq: 1 };
  // payloadOver is merged LAST, so a case may set `review` (queued, corrected) or `imported_from` (the 0077 shape).
  const payload: Row = { ...a.payload, confidence: 0.8, lineage, review: { state: 'approved', reason: 'fixture', decider: null }, ...(a.payloadOver ?? {}) };
  const prior = version > 1 ? `${claimId}@${version - 1}` : null;
  const header: CanonicalHeader = {
    object_id: claimId, object_type: a.type, tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: lifecycle, owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [a.evidence.id], event_time: eventTime, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: truthState, synthetic_state: synthetic, confidence: null, uncertainty: null, evidence_refs: [`EVD:${a.evidence.id}@${a.evidence.version}`], provenance_ref: provenance, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: a.classification, purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: retention, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${a.type}@v1`, ontology_ref: null, correction_of: prior, supersedes: prior, withdrawal_reason: withdrawal, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const contentDigest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${claimId}::uuid, ${a.type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, ${lifecycle}, 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, ${eventTime}::timestamptz, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', ${truthState}, ${synthetic}, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, ${provenance}, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${a.classification}, 'intelligence', null, null, ${retention}, null, null, null, null, ${header.schema_ref}, null, ${prior}, ${prior}, ${withdrawal}, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claimId}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${a.type}, ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${a.evidence.id}::uuid, ${a.evidence.bytesDigest}, 0, 4, 0.8, ${lineage.retrieval_decision_id}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  await sql`insert into intelligence.runs_current (run_id, scope, tenant_id, domain_id, method_id, method_version, agent_principal_id, mode, state, finished_at, evidence_read, claims_admitted, correlation_id)
    values (${runId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${methodId}::uuid, 1, ${owner.principalId}::uuid, 'replay', 'completed', clock_timestamp(), 1, 1, ${uuidv7()}::uuid)`.execute(su);
  return { claimId, version, runId, methodId, contentDigest };
}
/** A review case on a claim version as the review port leaves it (the CHECK's vocabulary: below_review_threshold; a decided case names its decider and reason). */
const seedCase = async (c: Seeded, version: number, state: 'queued' | 'rejected' | 'corrected', supersededTo: number | null): Promise<string> => {
  const caseId = uuidv7(); const decided = state !== 'queued';
  await sql`insert into intelligence.review_current (case_id, scope, tenant_id, domain_id, claim_object_id, claim_version, run_id, method_id, queued_reason, confidence, state, opened_at, decided_at, decider_principal_id, decision_reason, superseded_to_version, correlation_id)
    values (${caseId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${c.claimId}::uuid, ${version}, ${c.runId}::uuid, ${c.methodId}::uuid, 'below_review_threshold', 0.5, ${state}, clock_timestamp(), ${decided ? sql`clock_timestamp()` : sql`null`}, ${decided ? reviewer.principalId : null}::uuid, ${decided ? 'decided by the harness' : null}, ${supersededTo}, ${uuidv7()}::uuid)`.execute(su);
  return caseId;
};
const upload = async (files: Array<{ name: string; text: string }>, ceiling: 'internal' | 'confidential' = 'internal'): Promise<Evd[]> =>
  (await h.upload(files.map((f) => ({ filename: `${f.name}.csv`, text: f.text, documentTime: '2024-01-14T00:00:00Z' })), ceiling)).map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest }));
const csv = (name: string): string => TERMS_CSV.replace('assumption', `assumption (${name})`);

/* ───────────── the warning fixture (the phase4-warning-levels idiom): an indicator breaching on the November episode, a scenario on a FORECAST with one flipping branch (a scenario without a forecast folds its flips restricted in a briefing — the composer of M6 would be refused) ───────────── */
let seriesKey = '';
async function flippingBranch(label: string, consequenceClass: string, forecastId: string): Promise<{ indicatorId: string; scenarioId: string; branchId: string }> {
  const ind = await prediction.defineIndicator(h.req(owner, 'prediction.indicator.define', 'IND', null, 'prediction'), T(), D(),
    { payload: { seriesKey, description: `transits below 40 for five days (${label})`, comparator: '<', threshold: 40, consecutiveDays: 5, owner: owner.principalId } }) as { indicator: { indicatorId: string } };
  const scn = await prediction.declareScenario(h.req(owner, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(),
    { payload: { title: `Corridor — ${label}`, statement: 'what we expect, and what would change it', forecastId, owner: owner.principalId, reviewCadence: 'weekly',
      branches: [
        { name: 'Baseline', kind: 'baseline', statement: 'transits at seasonal level', owner: owner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
        { name: 'Collapse', kind: 'downside', statement: 'transits stay below 40/day for five days', indicatorId: ind.indicator.indicatorId, signpost: 'five days under 40',
          owner: owner.principalId, consequence: 'rebook the third shipment before the window closes', responseWindowHours: 48, consequenceClass },
      ] } }) as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  return { indicatorId: ind.indicator.indicatorId, scenarioId: scn.scenario.scenarioId, branchId: (scn.scenario.branches.find((b) => b.kind === 'downside') as { branchId: string }).branchId };
}
type Raised = { evaluation: { flips: unknown[] }; warnings: Array<{ warningId: string; branchId: string; level: string }> };
const evaluate = (indicatorId: string, knownAt: string) => {
  const r = h.req(owner, 'prediction.indicator.evaluate', 'IND', indicatorId, 'prediction') as unknown as { eyeEnvelope: { consequence_class: string } };
  r.eyeEnvelope.consequence_class = 'C2';
  return prediction.evaluateIndicator(r as never, T(), D(), indicatorId, { payload: { knownAt } }) as Promise<Raised>;
};

/* ───────────── the fixtures the cases share ───────────── */
let A: Evd; let B: Evd; let X: Evd; let mA: ManifestRow;
let CA: Seeded; let CB: Seeded; let CX: Seeded; let CQ2: Seeded; let caseQ = '';
/** The records the cases leave for one another (each named where it is made). */
let M1 = ''; let M1b = ''; let M1h = ''; let M4 = ''; let M4h = ''; let M4b = ''; let M4c = ''; let M5v = ''; let C: Evd;
let derivation1: Row = {};
const S1 = 'NORDWERK Magnet GmbH ships_through Bab el-Mandeb Strait (valid_from 2024-01-01T00:00:00Z) — as of 2024-01-14T00:00:00.000Z';
const S2 = 'NORDWERK Magnet GmbH ships_through Bab el-Mandeb Strait (restated) (valid_from 2024-01-01T00:00:00Z) — as of 2024-01-14T00:00:00.000Z';
const REL_PAYLOAD: Row = { claim_kind: 'relationship', subject: 'NORDWERK Magnet GmbH', predicate: 'ships_through', object_value: 'Bab el-Mandeb Strait', qualifiers: { valid_from: '2024-01-01T00:00:00Z' } };

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  const { RetentionController: R } = await import('../../src/retention/retention.controller.js');
  const { PredictionController: P } = await import('../../src/prediction/prediction.controller.js');
  const { ExecutiveController: E } = await import('../../src/executive/executive.controller.js');
  graph = h.app.get(G); b19 = graph as unknown as B19Graph; observation = h.app.get(O); retention = h.app.get(R); prediction = h.app.get(P); exec = h.app.get(E);
  commit = commitDb(); su = h.su;
  knowledgeOwner = await h.humanWithSession(['knowledge_owner'], 'b19-knowledge-owner');
  recordAuthority = await h.humanWithSession(['record_authority'], 'b19-record-authority');
  analyst = await h.humanWithSession(['domain_analyst'], 'b19-analyst');
  steward = await h.humanWithSession(['retention_steward'], 'b19-retention-steward');
  authority = await h.humanWithSession(['retention_authority'], 'b19-retention-authority', 'TENANT');
  executive = await h.humanWithSession(['executive'], 'b19-executive');
  // The confidential reader: a memory.item.derive holder whose clearance in the domain is confidential (a knowledge owner's is internal — clearance.ts).
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b19-domain-admin');
  owner = await h.principalWith(['forecast_owner', 'strategy_owner', 'twin_owner', 'resolution_manager'], 'b19-owner');
  manager = await h.principalWith(['collection_manager'], 'b19-collection-manager');
  reviewer = await h.principalWith(['extraction_manager'], 'b19-extraction-manager');
  // THE CONFIDENTIAL UPLOAD SOURCE (the fixture contract's ceiling confidential, data_origin synthetic, retention '24 months', licence internal, residency EU):
  // A and B are M1's and M4's; X carries M2's claims and CX, which no deletion touches (C3).
  [A, B, X] = (await upload([{ name: 'b19-a', text: csv('b19-a') }, { name: 'b19-b', text: csv('b19-b') }, { name: 'b19-x', text: csv('b19-x') }], 'confidential')) as [Evd, Evd, Evd];
  mA = await manifestRow((await manifestOf(A.id, 1)).manifest_id);
  expect(A.bytesDigest).toBe(mA.content_digest);
  // CA says INTERNAL on the CONFIDENTIAL upload A: the lift comes from the evidence (C1); synthetic false on the row — the evidence says true (D6's fold is the control).
  CA = await seedClaim({ type: 'REL', evidence: A, classification: 'internal', eventTime: '2024-01-14T00:00:00Z', payload: REL_PAYLOAD });
  // CB: no event time (the validity control); the retention inherited from the evidence (M1b); M4's basis on B.
  CB = await seedClaim({ type: 'ENT', evidence: B, classification: 'internal', payload: { claim_kind: 'entity', subject: 'NORDWERK Magnet GmbH', predicate: 'is_a', object_value: 'manufacturer' } });
  // CX says CONFIDENTIAL itself (check-2's control): on X, so its derived record rests on nothing a deletion of A or B names.
  CX = await seedClaim({ type: 'REL', evidence: X, classification: 'confidential', eventTime: '2024-01-14T00:00:00Z', payload: { ...REL_PAYLOAD, object_value: 'Suez Canal' } });
}, 300_000);

afterAll(async () => {
  await h?.close();
  await commit?.destroy();
}, 120_000);

describe('B19 · source-derived memory records (0079; AU-MEM-0065, V02-T-118, DP-37-001/002/005, ES-29-002, V03-T-100)', () => {
  it('M1 · DERIVED (document) from a REL claim on confidential evidence: the knowledge owner refused by the clearance line (nothing written), the domain administrator derives — the statement and its digest, the provenance, the lift SAID, synthetic and retention inherited, MEM@v2 validating against the registry, the events, the dependency rows, GraphChanged caused by the derive act, the retrieval serving the block; the controls; the port\'s own units', async () => {
    // THE LIFT IS REAL, the first half (C1): the record would be confidential (A's ceiling); the knowledge owner's clearance here is internal — refused BEFORE any write.
    const before = await memCount();
    const refused = await failure(deriveAs(knowledgeOwner, basisOf('claim', CA.claimId)));
    expect(refused.status).toBe(403);
    expect(refused.code).toBe('EYE-AUT-001');
    expect(refused.message).toMatch(/the derived memory record .* is classified confidential; the reader's clearance in this domain is internal/);
    expect(await memCount()).toEqual(before); // no canonical object, no row, no event
    // 1. THE DERIVATION by the domain administrator (confidential clearance).
    const r = await deriveAs(domainAdmin, basisOf('claim', CA.claimId));
    M1 = r.memory.itemId;
    const caRow = (await canon(CA.claimId))[0]!;
    expect(r.memory).toMatchObject({
      version: 1, cites: 2, sourceKind: 'document', statement: S1, statementDigest: sha256(S1),
      basis: { kind: 'claim', object_type: 'REL', id: CA.claimId, version: 1, content_digest: caRow.content_digest, truth_state: 'extracted', review_state: 'approved', event_time: '2024-01-14T00:00:00.000Z' },
      classification: { declared: 'internal', inherited: 'confidential', applied: 'confidential' },
      inherited: { synthetic_state: true, retention_profile: 'derived-record-5y', retention_from: 'declared', valid_from: '2024-01-14T00:00:00.000Z', valid_from_source: 'declared' },
      source: { source_key: expect.stringMatching(/^fixture-uploads-confidential-/), contract_version: 1, connector_kind: 'upload', media_type: 'text/csv', authority_class: 'authoritative', data_origin: 'synthetic' },
      evidence: [{ object_id: A.id, version: 1, digest: A.bytesDigest, byte_start: 0, byte_end: 4 }], seriesKeys: [],
    });
    expect(r.memory.contentDigest).toMatch(/^[0-9a-f]{64}$/);
    // 2. THE PROJECTION and the derivation block.
    const row = await itemRow(M1);
    expect(row).toMatchObject({ object_version: 1, state: 'active', attention_state: 'none', source_kind: 'document', classification: 'confidential', retention_profile: 'derived-record-5y', statement: S1, owner_principal_id: domainAdmin.principalId });
    expect(row.source_ref).toMatch(new RegExp(`^fixture-uploads-confidential-[^ ]+@1 · REL:${CA.claimId}@1$`));
    derivation1 = await derivationOf(M1);
    expect(derivation1).toMatchObject({
      basis: { kind: 'claim', object_type: 'REL', id: CA.claimId, version: 1, content_digest: caRow.content_digest },
      evidence: [{ object_id: A.id, version: 1, digest: A.bytesDigest, byte_start: 0, byte_end: 4 }],
      source: { source_id: expect.stringMatching(/^[0-9a-f-]{36}$/), source_key: expect.stringMatching(/^fixture-uploads-confidential-/), contract_version: 1, connector_kind: 'upload', media_type: 'text/csv', authority_class: 'authoritative', data_origin: 'synthetic' },
      method_ref: 'memory-derive@1.0.0', statement_digest: sha256(S1), truth_state_of_basis: 'extracted', review_state_of_basis: 'approved',
    });
    expect(derivation1['series_keys']).toBeUndefined();
    expect(instantOf(derivation1['derived_at'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // 3. THE CANONICAL ROW: MEM@v2, the basis's truth state, synthetic from the evidence, the lifted classification, the versioned refs, the owner; validating against the registry — a human payload too (backward).
    const c = await canon(M1);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ object_version: '1', lifecycle_state: 'active', schema_ref: 'MEM@v2', truth_state: 'extracted', synthetic_state: true, classification: 'confidential', supersedes: null,
      provenance_ref: `REL:${CA.claimId}@1`, method_ref: 'memory-derive@1.0.0', evidence_refs: [`REL:${CA.claimId}@1`, `EVD:${A.id}@1`], source_object_ids: [CA.claimId, A.id],
      human_refs: [`principal:${domainAdmin.principalId}`], accountable_owner: `principal:${domainAdmin.principalId}`, retention_profile: 'derived-record-5y', rights_profile: 'internal', residency_profile: 'EU' });
    expect(instantOf(c[0]!.event_time)).toBe('2024-01-14T00:00:00.000Z');
    expect(c[0]!.payload['derivation']).toEqual(derivation1);
    const v2 = await ajvValid(c[0]!.payload);
    expect(v2.valid, v2.errors).toBe(true);
    M1h = (await recordAs(knowledgeOwner, item())).memory.itemId;
    const hv = await ajvValid((await canon(M1h))[0]!.payload);
    expect(hv.valid, hv.errors).toBe(true);
    expect((await canon(M1h))[0]).toMatchObject({ schema_ref: 'MEM@v1', truth_state: 'asserted', synthetic_state: false });
    // 4. THE EVENT names the act and the derivation's summary.
    expect(await itemEvents(M1)).toEqual([expect.objectContaining({ event: 'memory.recorded', object_version: 1, details: expect.objectContaining({ source_kind: 'document', action: 'memory.item.derive', derivation: expect.objectContaining({ evidence: 1, method_ref: 'memory-derive@1.0.0' }) }) })]);
    // 5. THE DEPENDENCY ROWS: the basis and its evidence, exactly.
    expect(await deps(M1)).toEqual([{ depends_on_kind: 'claim', depends_on_id: CA.claimId }, { depends_on_kind: 'evidence', depends_on_id: A.id }]);
    // 6. GraphChanged/memory_item.recorded from the derive act: the item its own reach, the basis and the evidence what it rests on.
    const ev = await outboxRow('memory_item.recorded', M1);
    expect(ev).toBeDefined();
    const p = ev!.payload as { cause: Row; objects: { memoryItems: string[]; claims: string[]; evidence: string[] }; relationships: { dependencies: Row[] } };
    expect(p.cause).toMatchObject({ action: 'memory.item.derive', actor: domainAdmin.principalId, target_type: 'MEM', target_id: M1 });
    expect(p.objects.memoryItems).toEqual([M1]);
    expect(p.objects.claims).toContain(CA.claimId);
    expect(p.objects.evidence).toContain(A.id);
    expect(p.relationships.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ dependent_object_id: M1, dependent_type: 'MEM', depends_on_kind: 'claim', depends_on_id: CA.claimId }),
      expect.objectContaining({ dependent_object_id: M1, dependent_type: 'MEM', depends_on_kind: 'evidence', depends_on_id: A.id })]));
    // 7. THE LIFT IS REAL, the second half: the knowledge owner cannot read the record (internal clearance; the basis's ceiling lifted it — ES-29-002 is a floor); the administrator reads the block; the analyst is refused too.
    const ko = await failure(retrieveAs(knowledgeOwner, M1, 'memory'));
    expect(ko.status).toBe(403);
    expect(ko.message).toMatch(/the memory item is classified confidential; the reader's clearance in this domain is internal/);
    const rt = await retrieveAs(domainAdmin, M1, 'memory');
    expect(rt.memory).toMatchObject({ versionServed: 1, versions: 1 });
    expect((rt.memory.version['payload'] as Row)['derivation']).toEqual(derivation1);
    expect((rt.memory.version['payload'] as Row)['statement']).toBe(S1);
    expect(rt.memory.availability).toMatchObject({ basis_state: 'current', source_kind: 'document', attention_state: 'none' });
    expect(rt.memory.version).toMatchObject({ synthetic_state: true, truth_state: 'extracted', method_ref: 'memory-derive@1.0.0', provenance_ref: `REL:${CA.claimId}@1`, event_time: '2024-01-14T00:00:00.000Z' });
    await expect(retrieveAs(analyst, M1, 'graph')).rejects.toMatchObject({ status: 403 });
    expect((await accessRows(M1)).map((a) => [a.reader_principal_id, a.purpose_id])).toEqual([[domainAdmin.principalId, 'memory']]);
    // 8. THE CONTROLS.
    expect(await failure(recordAs(knowledgeOwner, item({ source: { kind: 'communication', ref: 'x' } })))).toMatchObject({ status: 422, message: expect.stringMatching(/derived from its source \(memory\.item\.derive\)/) });
    await expect(deriveAs(analyst, basisOf('claim', CA.claimId))).rejects.toMatchObject({ status: 403 });
    expect(await failure(deriveAs(knowledgeOwner, basisOf('claim', CA.claimId, null, { sourceKind: 'human' })))).toMatchObject({ status: 422, message: expect.stringMatching(/sourceKind is one of document, communication, telemetry/) });
    expect(await failure(deriveAs(knowledgeOwner, { ...basisOf('claim', CA.claimId), statement: 'typed' }))).toMatchObject({ status: 422, message: expect.stringMatching(/computed from the basis/) });
    // CB carries no event time: validity.from is declared or nothing (the administrator — B is confidential, and the clearance line comes first).
    expect(await failure(deriveAs(domainAdmin, basisOf('claim', CB.claimId, null, { validity: { from: null, to: null } })))).toMatchObject({ status: 422, message: expect.stringMatching(/validity\.from is declared: the basis carries no event time/) });
    // The retention inherited from the EVIDENCE (the seeded claim carries none; the contract's is '24 months'); the lift from B's ceiling — M1b.
    const rb = await deriveAs(domainAdmin, basisOf('claim', CB.claimId, null, { retention: { profile: null, retainUntil: null, basis: null } }));
    M1b = rb.memory.itemId;
    expect(rb.memory).toMatchObject({ inherited: { retention_profile: '24 months', retention_from: 'evidence' }, classification: { declared: 'internal', inherited: 'confidential', applied: 'confidential' }, basis: { object_type: 'ENT', id: CB.claimId, version: 1 } });
    expect((await itemRow(M1b)).retention_profile).toBe('24 months');
    expect(await failure(deriveAs(knowledgeOwner, basisOf('claim', uuidv7())))).toMatchObject({ status: 404, message: expect.stringMatching(/no authorized basis matches/) });
    await expect(deriveAs(knowledgeOwner, basisOf('claim', CA.claimId, 7))).rejects.toMatchObject({ status: 404 });
    // check-2's control (C1): a claim that SAYS confidential — the knowledge owner refused, the administrator admitted.
    expect(await failure(deriveAs(knowledgeOwner, basisOf('claim', CX.claimId)))).toMatchObject({ status: 403, message: expect.stringMatching(/is classified confidential; the reader's clearance in this domain is internal/) });
    const rx = await deriveAs(domainAdmin, basisOf('claim', CX.claimId));
    expect(rx.memory.classification).toEqual({ declared: 'internal', inherited: 'confidential', applied: 'confidential' });
    // 9. THE PORT'S OWN UNITS (memory.record_item under a context bound at the database — the PDP is not consulted by inCommitContext; every call is refused and rolled back).
    const record = (over: Row = {}): Row => ({ record_class: 'institutional', title: 'Derived record (harness)', statement: row.statement, source_kind: 'document', source_ref: row.source_ref, owner_principal_id: domainAdmin.principalId,
      classification: 'confidential', audience_roles: [], audience_purposes: ['memory'], valid_from: '2024-01-14T00:00:00.000Z', valid_to: null, retention_profile: 'derived-record-5y', retain_until: null, retention_basis: null, related_decision_id: null, related_objective_id: null, ...over });
    const port = (p: AuthenticatedPrincipal, action: string, rec: Row, derivation: Row | null) =>
      inCommitContext(commit, { sessionId: p.sessionId, contextKey: p.contextKey }, scope(), action, uuidv7(), (tx) =>
        sql`select memory.record_item(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, 1, ${JSON.stringify(rec)}::jsonb, '[]'::jsonb, ${p.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${derivation === null ? null : JSON.stringify(derivation)}::jsonb)`.execute(tx));
    // the digest re-verification: a statement the digest does not bind
    expect(await failure(port(knowledgeOwner, 'memory.item.derive', record({ statement: 'a statement the digest does not bind' }), derivation1))).toMatchObject({ code: '22023', message: expect.stringMatching(/the statement digest does not bind the derived statement/) });
    // the TRUE statement from here on (C9): the digest check runs first, and each unit proves its own rule
    expect(await failure(port(knowledgeOwner, 'memory.item.derive', record({ source_kind: 'human' }), derivation1))).toMatchObject({ code: '22023', message: expect.stringMatching(/carries no derivation/) });
    const { series_keys: _sk, ...noSeries } = derivation1; void _sk;
    expect(await failure(port(knowledgeOwner, 'memory.item.derive', record({ source_kind: 'telemetry' }), noSeries))).toMatchObject({ code: '22023', message: expect.stringMatching(/telemetry names a source with a registered series; the derivation carries none/) });
    expect(await failure(port(knowledgeOwner, 'memory.item.record', record(), derivation1))).toMatchObject({ code: '42501', message: expect.stringMatching(/recorded under memory\.item\.derive/) });
    // the shape is the boundary (C4): an absent field fails the check it belongs to
    expect(await failure(port(knowledgeOwner, 'memory.item.derive', record(), { ...derivation1, basis: {} }))).toMatchObject({ code: '22023', message: expect.stringMatching(/names its basis/) });
    const { truth_state_of_basis: _ts, ...noTruth } = derivation1; void _ts;
    expect(await failure(port(knowledgeOwner, 'memory.item.derive', record(), noTruth))).toMatchObject({ code: '22023', message: expect.stringMatching(/truth state is a canonical one/) });
    expect((await memCount())[1]).toBe(before[1] + 4); // M1, M1h, M1b and CX's record — the units left nothing
  }, 120_000);

  it('M2 · THE REVIEW GATE and the LIFECYCLE GATE: queued (the payload\'s reason), rejected, case-corrected to a later version (the corrected version derivable as asserted / corrected), a withdrawn object at any version, an imported claim, an unknown warning, a bad basis kind', async () => {
    const claim = (over: Row = {}): Row => ({ claim_kind: 'claim', subject: 'x', predicate: 'stock_days', object_value: '9', ...over });
    // QUEUED — the case's decision governs (G2); the refusal carries the payload's sentence. CQ lives on B: its live case is what M5's second paused case names.
    const CQ = await seedClaim({ type: 'CLM', evidence: B, classification: 'internal', payload: claim(), payloadOver: { review: { state: 'queued', reason: 'confidence below the method review threshold', decider: null } } });
    caseQ = await seedCase(CQ, 1, 'queued', null);
    const q = await failure(deriveAs(domainAdmin, basisOf('claim', CQ.claimId)));
    expect(q).toMatchObject({ status: 409, code: 'EYE-STA-002' });
    expect(q.message).toMatch(new RegExp(`CLM ${CQ.claimId}@1 is queued for review \\(confidence below the method review threshold\\); a claim a person has not decided does not ground a memory record`));
    // REJECTED
    const CR = await seedClaim({ type: 'CLM', evidence: X, classification: 'internal', payload: claim({ subject: 'r' }) });
    await seedCase(CR, 1, 'rejected', null);
    expect(await failure(deriveAs(domainAdmin, basisOf('claim', CR.claimId)))).toMatchObject({ status: 409, code: 'EYE-STA-002', message: expect.stringMatching(/was rejected in review; it grounds no memory record/) });
    // CORRECTED IN REVIEW — version 1's case names its successor; version 2 (the correction itself: lifecycle corrected, truth asserted, its own payload says corrected) is derivable.
    const CC = await seedClaim({ type: 'CLM', evidence: X, classification: 'internal', payload: claim({ subject: 'c' }) });
    await seedClaim({ claimId: CC.claimId, version: 2, type: 'CLM', evidence: X, classification: 'internal', lifecycle: 'corrected', truthState: 'asserted', payload: claim({ subject: 'c', object_value: '11' }), payloadOver: { review: { state: 'corrected', reason: 'restated in review (harness)', decider: reviewer.principalId } } });
    await seedCase(CC, 1, 'corrected', 2);
    expect(await failure(deriveAs(domainAdmin, basisOf('claim', CC.claimId, 1)))).toMatchObject({ status: 409, code: 'EYE-STA-002', message: expect.stringMatching(/was corrected in review to version 2; derive from the corrected version/) });
    const m2c = await deriveAs(domainAdmin, basisOf('claim', CC.claimId));
    expect(m2c.memory).toMatchObject({ basis: { version: 2, truth_state: 'asserted', review_state: 'corrected' }, statement: 'c stock_days 11' });
    expect((await canon(m2c.memory.itemId))[0]).toMatchObject({ truth_state: 'asserted', provenance_ref: `CLM:${CC.claimId}@2` });
    expect((await derivationOf(m2c.memory.itemId))['review_state_of_basis']).toBe('corrected');
    // WITHDRAWN — the latest version withdrawn: refused at the latest AND at the earlier, still-active version (the run-availability rule: the latest version's lifecycle decides).
    const CW = await seedClaim({ type: 'CLM', evidence: X, classification: 'internal', payload: claim({ subject: 'w' }) });
    await seedClaim({ claimId: CW.claimId, version: 2, type: 'CLM', evidence: X, classification: 'internal', lifecycle: 'withdrawn', truthState: 'withdrawn', payload: claim({ subject: 'w' }) });
    expect(await failure(deriveAs(domainAdmin, basisOf('claim', CW.claimId)))).toMatchObject({ status: 409, code: 'EYE-STA-003', message: expect.stringMatching(/was withdrawn.*a withdrawn basis grounds no memory record/) });
    expect(await failure(deriveAs(domainAdmin, basisOf('claim', CW.claimId, 1)))).toMatchObject({ status: 409, code: 'EYE-STA-003', message: expect.stringMatching(new RegExp(`claim ${CW.claimId} was withdrawn at version 2; no version of a withdrawn object grounds a memory record`)) });
    // IMPORTED — derived at its origin and re-imported, never here (D5; the 0077 shape on the latest version).
    const CI = await seedClaim({ type: 'CLM', evidence: X, classification: 'internal', payload: claim({ subject: 'i' }),
      payloadOver: { imported_from: { format: 'eye-import-provenance@1', import_id: uuidv7(), partner_key: 'harness-partner', imported_at: new Date().toISOString(), package: {}, object: {}, header: {}, payload: {} } } });
    const imp = await failure(deriveAs(domainAdmin, basisOf('claim', CI.claimId)));
    expect(imp).toMatchObject({ status: 409, code: 'EYE-STA-002' });
    expect(imp.message).toMatch(new RegExp(`claim ${CI.claimId} is imported \\(import [0-9a-f-]{36}\\); an imported claim is derived at its origin and re-imported; it is not derived here`));
    // An unknown warning; a basis kind outside claim | warning.
    await expect(deriveAs(knowledgeOwner, basisOf('warning', uuidv7()))).rejects.toMatchObject({ status: 404 });
    expect(await failure(deriveAs(knowledgeOwner, basisOf('claim', CA.claimId, null, { basis: { kind: 'x', id: CA.claimId } })))).toMatchObject({ status: 422, message: expect.stringMatching(/basis\.kind is one of claim, warning/) });
  }, 120_000);

  it('M3 · TELEMETRY on the REST fixture: the series rule (422 before the series is registered on the source, admitted with series_keys after; the document kind admitted regardless), truth_state extracted never observed; a WARNING basis — inferred, review_state raised, the breaching evidence version, the indicator and its rule, telemetry only', async () => {
    // The REST source at a new contract version with its declared backfill, one governed run: the evidence the claims and the warning rest on.
    const { version: v2, sourceKey } = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
    const run = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
    expect(run.state, run.reason).toBe('finished');
    const rest = (await sql<{ id: string; version: number; digest: string; bytes_digest: string }>`select object_id::text id, object_version::int version, content_digest digest, (payload ->> 'content_digest') bytes_digest from objects.canonical_objects where object_type = 'EVD' and provenance_ref = ${`SRC:${h.fx.sourceId}@${v2}`} order by recorded_at limit 1`.execute(su)).rows[0]!;
    const R: Evd = { id: rest.id, version: rest.version, digest: rest.digest, bytesDigest: rest.bytes_digest };
    // (i) BEFORE the series is registered: telemetry is refused with the exact sentence; the same claim as a document is admitted (the kind is the person's; the rule is telemetry's).
    const CT = await seedClaim({ type: 'EVT', evidence: R, classification: 'internal', eventTime: '2023-11-12T00:00:00Z', payload: { claim_kind: 'event', subject: 'the fixture corridor', predicate: 'daily_transit_count', object_value: '31 on 2023-11-12' } });
    const noSeries = await failure(deriveAs(knowledgeOwner, basisOf('claim', CT.claimId, null, { sourceKind: 'telemetry' })));
    expect(noSeries.status).toBe(422);
    expect(noSeries.message).toBe(`telemetry names a source with a registered series; ${sourceKey} has none`);
    const m3d = await deriveAs(knowledgeOwner, basisOf('claim', CT.claimId));
    expect(m3d.memory).toMatchObject({ sourceKind: 'document', seriesKeys: [], source: { connector_kind: 'rest', data_origin: 'real', media_type: 'application/json' }, classification: { applied: 'internal' } });
    // (ii) THE SERIES REGISTERED on the source: telemetry admitted with the series keys; the truth state is the basis's — extracted, NEVER observed (D2).
    seriesKey = `fixture:${sourceKey}:value`;
    await prediction.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null, 'prediction'), T(), D(),
      { payload: { seriesKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits' } });
    const m3t = await deriveAs(knowledgeOwner, basisOf('claim', CT.claimId, null, { sourceKind: 'telemetry' }));
    expect(m3t.memory).toMatchObject({ sourceKind: 'telemetry', seriesKeys: [seriesKey], basis: { object_type: 'EVT', truth_state: 'extracted', review_state: 'approved' }, statement: 'the fixture corridor daily_transit_count 31 on 2023-11-12 — as of 2023-11-12T00:00:00.000Z',
      evidence: [{ object_id: R.id, version: 1, digest: R.bytesDigest }], source: { connector_kind: 'rest', contract_version: v2 } });
    expect((await canon(m3t.memory.itemId))[0]).toMatchObject({ truth_state: 'extracted', schema_ref: 'MEM@v2' });
    const d3 = await derivationOf(m3t.memory.itemId);
    expect(d3['series_keys']).toEqual([seriesKey]);
    expect((d3['source'] as Row)['connector_kind']).toBe('rest');
    expect((await itemRow(m3t.memory.itemId)).source_kind).toBe('telemetry');
    // (iii) THE WARNING: an indicator on the series breaching on the November episode, a scenario with a downside branch flipped → a raised warning.
    const knownAt = new Date().toISOString();
    // the scenario rests on a forecast of the series (the bootDecisionWorld idiom): an assumption resting on the corridor claim, a short-history forecast
    const asu = await graph.declare(h.req(owner, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title: 'The corridor stays open (harness)', statement: 'transits through the fixture corridor continue at their seasonal level',
      restsOn: [{ kind: 'claim', id: CT.claimId, rationale: 'the assumption is about the corridor this claim reads' }] } }) as { strategy: { objectId: string } };
    const f = await prediction.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null, 'prediction'), T(), D(),
      { payload: { seriesKey, horizon: '30d', knownAt, observedThrough: '2021-02-15', assumptions: [asu.strategy.objectId], label: 'short history' } }) as { forecast: { forecastId: string } };
    const b = await flippingBranch('b19', 'C3', f.forecast.forecastId);
    const raised = await evaluate(b.indicatorId, knownAt);
    expect(raised.warnings).toHaveLength(1);
    const W = raised.warnings[0]!.warningId;
    const w = await warningRow(W);
    expect(w.state).toBe('raised');
    // a warning rests on a series: document is refused; telemetry admitted with the warning's own facts
    expect(await failure(deriveAs(knowledgeOwner, basisOf('warning', W, null, { sourceKind: 'document' })))).toMatchObject({ status: 422, message: expect.stringMatching(/a warning rests on a series; its record is source kind telemetry/) });
    const m3w = await deriveAs(knowledgeOwner, basisOf('warning', W, null, { sourceKind: 'telemetry', title: 'The corridor collapse warning (harness)' }));
    expect(m3w.memory).toMatchObject({ sourceKind: 'telemetry', basis: { kind: 'warning', object_type: 'WRN', id: W, version: 1, truth_state: 'inferred', review_state: 'raised' }, seriesKeys: [seriesKey],
      statement: expect.stringMatching(/^Corridor — b19 — branch "Collapse" flipped — rebook the third shipment before the window closes \(observed \d{4}-\d{2}-\d{2}: \d+(\.\d+)?; rule fixture:.*value < 40 for 5 consecutive observation\(s\)\)$/),
      classification: { applied: 'internal' } });
    const breaching = w.evidence.find((e) => e['kind'] === 'evidence')!;
    const dw = await derivationOf(m3w.memory.itemId);
    expect((dw['evidence'] as Row[])[0]).toMatchObject({ object_id: breaching['evidence_object_id'], version: Number(breaching['evidence_version']) });
    expect(dw['indicator']).toMatchObject({ indicator_id: b.indicatorId, series_key: seriesKey, rule: expect.any(String) });
    expect(dw['series_keys']).toEqual([seriesKey]);
    expect(await deps(m3w.memory.itemId)).toEqual([{ depends_on_kind: 'evidence', depends_on_id: String(breaching['evidence_object_id']) }, { depends_on_kind: 'warning', depends_on_id: W }]);
    const wc = (await canon(W))[0]!; const mc = (await canon(m3w.memory.itemId))[0]!;
    expect(mc).toMatchObject({ truth_state: 'inferred', provenance_ref: `WRN:${W}@1`, schema_ref: 'MEM@v2' });
    expect(instantOf(mc.event_time)).toBe(instantOf(wc.event_time));
    expect(instantOf(mc.event_time)).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  }, 300_000);

  it('M4 · THE RECORD FOLLOWS THE BASIS: (a) the evidence corrected and walked → basis_corrected; (b) RE-DERIVED on the corrected claim version (the knowledge owner and the record authority refused, the kind-class crossings refused both ways, v1 replayable, the evidence row kept); (c) WITHDRAWN — the corrections path, the evidence gate at derive and re-derive, a claim_withdrawal walk (the negative first), the revocation\'s port; (d) the record authority withdraws', async () => {
    // (a) CORRECTED — the evidence restated by a correction case of the confidential source, walked as evidence_correction.
    const caseA = await submitCorrection([A.id], 'restated (harness)', 'correction', 'confidential');
    await applyCase(caseA, [A.id], 'verified');
    expect((await canon(A.id)).at(-1)).toMatchObject({ object_version: '2', lifecycle_state: 'corrected' });
    const walkA = await propagate('evidence_correction', A.id);
    expect(walkA.impact.memoryItems.map((m) => m.strategy_object_id)).toContain(M1);
    expect(walkA.impact.statement).toMatch(/memory item\(s\) resting on what changed marked for attention/);
    const afterA = await itemRow(M1);
    expect(afterA.attention_state).toBe('basis_corrected');
    expect(afterA.attention_reason).toMatch(new RegExp(`invalidation ${walkA.impact.invalidationId}`));
    expect((await itemEvents(M1)).at(-1)).toMatchObject({ event: 'memory.attention', details: expect.objectContaining({ invalidation_id: walkA.impact.invalidationId, trigger_kind: 'evidence_correction', attention_state: 'basis_corrected' }) });
    expect((await retrieveAs(domainAdmin, M1, 'memory')).memory.availability).toMatchObject({ basis_state: 'corrected', attention_state: 'basis_corrected' });
    // (b) RE-DERIVED — the claim corrected in review to version 2 (asserted; its case names the successor); the record's next version is a re-derivation.
    await seedClaim({ claimId: CA.claimId, version: 2, type: 'REL', evidence: A, classification: 'internal', eventTime: '2024-01-14T00:00:00Z', lifecycle: 'corrected', truthState: 'asserted',
      payload: { ...REL_PAYLOAD, object_value: 'Bab el-Mandeb Strait (restated)' }, payloadOver: { review: { state: 'corrected', reason: 'restated in review (harness)', decider: reviewer.principalId } } });
    await seedCase(CA, 1, 'corrected', 2);
    const sup = (over: Row = {}): Row => ({ ...basisOf('claim', CA.claimId), supersession: { reason: 'the basis was corrected (harness)', effectiveAt: null }, ...over });
    // the knowledge owner holds no supersede (the PDP); the record authority holds it but its clearance here is internal — the re-derivation of a confidential record is refused by the clearance line (C1)
    await expect(supersedeAs(knowledgeOwner, M1, sup())).rejects.toMatchObject({ status: 403 });
    expect(await failure(supersedeAs(recordAuthority, M1, sup()))).toMatchObject({ status: 403, message: expect.stringMatching(/the derived memory record .* is classified confidential; the reader's clearance in this domain is internal/) });
    // the kind class never crosses: a derived record is not re-stated by a person (the route's plain 422, before anything is read)
    expect(await failure(supersedeAs(recordAuthority, M1, item({ supersession: { reason: 'a person restating a derived record (harness)', effectiveAt: null } })))).toMatchObject({ status: 422, message: expect.stringMatching(/a derived record is superseded by a re-derivation \(payload\.basis\)/) });
    expect(await failure(supersedeAs(recordAuthority, M1h, sup()))).toMatchObject({ status: 422, message: expect.stringMatching(/a person's record is superseded by a person's statement/) });
    expect((await itemRow(M1)).object_version).toBe(1);
    await sleep(30); const before = (await mark()).toISOString(); await sleep(30);
    const s = await supersedeAs(domainAdmin, M1, sup());
    expect(s.memory).toMatchObject({ version: 2, priorVersion: 1, statement: S2, statementDigest: sha256(S2), basis: { version: 2, truth_state: 'asserted', review_state: 'corrected' }, evidence: [{ object_id: A.id, version: 2, digest: A.bytesDigest }] });
    expect(await itemRow(M1)).toMatchObject({ object_version: 2, attention_state: 'none', attention_reason: null, superseded_versions: 1, statement: S2 });
    const c1 = await canon(M1);
    expect(c1.map((x) => [x.object_version, x.supersedes, x.truth_state, x.schema_ref])).toEqual([['1', null, 'extracted', 'MEM@v2'], ['2', `MEM:${M1}@1`, 'asserted', 'MEM@v2']]);
    expect(c1[1]!.payload['statement']).toBe(S2);
    expect((await itemEvents(M1)).at(-1)).toMatchObject({ event: 'memory.superseded', object_version: 2, details: expect.objectContaining({ prior_version: 1, reason: 'the basis was corrected (harness)', source_kind: 'document', derivation: expect.objectContaining({ method_ref: 'memory-derive@1.0.0' }) }) });
    // v1 stays replayable AS OF an instant before the supersession — with v1's statement and v1's derivation
    const replay = await retrieveAs(domainAdmin, M1, 'memory', before);
    expect(replay.memory).toMatchObject({ versionServed: 1, versions: 2 });
    expect((replay.memory.version['payload'] as Row)['statement']).toBe(S1);
    expect((replay.memory.version['payload'] as Row)['derivation']).toEqual(derivation1);
    const now2 = await retrieveAs(domainAdmin, M1, 'memory');
    expect(now2.memory).toMatchObject({ versionServed: 2, versions: 2 });
    expect(((now2.memory.version['payload'] as Row)['derivation'] as Row)['basis']).toMatchObject({ version: 2 });
    // the evidence row is KEPT (the re-derivation names the same object): the two rows, the same ids
    expect(await deps(M1)).toEqual([{ depends_on_kind: 'claim', depends_on_id: CA.claimId }, { depends_on_kind: 'evidence', depends_on_id: A.id }]);
    // (c) WITHDRAWN, path 1 — the corrections path: a record on B and a HUMAN record citing B, then B withdrawn by its publisher.
    M4 = (await deriveAs(domainAdmin, basisOf('claim', CB.claimId, null, { validity: { from: '2024-01-14T00:00:00Z', to: null } }))).memory.itemId;
    M4h = (await recordAs(knowledgeOwner, item({ cites: [{ kind: 'evidence', id: B.id, version: 1, rationale: 'a human record citing B (harness)' }] }))).memory.itemId;
    const caseW = await submitCorrection([B.id], 'the record was withdrawn by its publisher (harness)', 'withdrawal', 'confidential');
    await applyCase(caseW, [B.id], 'withdrawn');
    expect((await canon(B.id)).at(-1)).toMatchObject({ object_version: '2', lifecycle_state: 'withdrawn', truth_state: 'withdrawn' });
    const m4 = await itemRow(M4);
    expect(m4.attention_state).toBe('basis_withdrawn');
    expect(m4.attention_reason).toMatch(new RegExp(`^basis withdrawn \\(evidence ${B.id}, under observation\\.correction\\.apply\\)`));
    expect((await itemEvents(M4)).at(-1)).toMatchObject({ event: 'memory.basis_withdrawn', object_version: 1, details: expect.objectContaining({ basis_kind: 'evidence', basis_id: B.id, via: 'observation.correction.apply' }) });
    expect((await itemRow(M1b)).attention_state).toBe('basis_withdrawn'); // the other derived record on B, marked by the same call
    expect((await itemRow(M4h)).attention_state).toBe('none'); // the port touches derived records only: a person's record cites, it does not copy
    // SERVED with the declaration, never refused for the basis's sake (D5)
    const served = await retrieveAs(domainAdmin, M4, 'memory');
    expect(served.memory.availability).toMatchObject({ basis_state: 'withdrawn', attention_state: 'basis_withdrawn', state: 'active' });
    expect((served.memory.version['payload'] as Row)['statement']).toBe('NORDWERK Magnet GmbH is_a manufacturer');
    // THE EVIDENCE GATE (C2): the claim stands, its bytes are withdrawn — no new derivation, and no re-derivation launders the mark
    const gate = await failure(deriveAs(domainAdmin, basisOf('claim', CB.claimId)));
    expect(gate).toMatchObject({ status: 409, code: 'EYE-STA-003' });
    expect(gate.message).toMatch(new RegExp(`evidence ${B.id}@2 was withdrawn .*grounds no memory record`));
    expect(await failure(supersedeAs(domainAdmin, M4, { ...basisOf('claim', CB.claimId), supersession: { reason: 'an attempt to re-derive on withdrawn bytes (harness)', effectiveAt: null } }))).toMatchObject({ status: 409, code: 'EYE-STA-003', message: expect.stringMatching(/rests on withdrawn evidence and grounds no memory record/) });
    expect(await itemRow(M4)).toMatchObject({ object_version: 1, attention_state: 'basis_withdrawn' });
    // a later walk of the same object does not downgrade the withdrawn mark; the human record follows the walk as today
    const walkB = await propagate('evidence_correction', B.id);
    expect(walkB.impact.memoryItems.map((m) => m.strategy_object_id)).toEqual(expect.arrayContaining([M4, M4h]));
    expect((await itemRow(M4)).attention_state).toBe('basis_withdrawn');
    expect((await itemEvents(M4)).at(-1)).toMatchObject({ event: 'memory.attention', details: expect.objectContaining({ invalidation_id: walkB.impact.invalidationId, trigger_kind: 'evidence_correction', attention_state: 'basis_withdrawn' }) });
    expect((await itemRow(M4h)).attention_state).toBe('basis_corrected');
    // Path 2 — a claim_withdrawal walk (C5): the NEGATIVE first — a live, merely corrected claim walked as claim_withdrawal marks basis_corrected; the withdrawn version recorded, the walk marks basis_withdrawn.
    CQ2 = await seedClaim({ type: 'CLM', evidence: A, classification: 'internal', eventTime: '2024-01-14T00:00:00Z', payload: { claim_kind: 'claim', subject: 'NORDWERK Magnet GmbH', predicate: 'stock_days', object_value: '9' } });
    M4b = (await deriveAs(domainAdmin, basisOf('claim', CQ2.claimId))).memory.itemId;
    expect((await derivationOf(M4b))['evidence']).toEqual([expect.objectContaining({ object_id: A.id, version: 2 })]); // derived after A's correction: the highest version carrying the bytes (D14)
    await seedClaim({ claimId: CQ2.claimId, version: 2, type: 'CLM', evidence: A, classification: 'internal', eventTime: '2024-01-14T00:00:00Z', lifecycle: 'corrected', truthState: 'asserted', payload: { claim_kind: 'claim', subject: 'NORDWERK Magnet GmbH', predicate: 'stock_days', object_value: '10' }, payloadOver: { review: { state: 'corrected', reason: 'restated (harness)', decider: reviewer.principalId } } });
    const walkC = await propagate('claim_withdrawal', CQ2.claimId);
    expect(walkC.impact.memoryItems.map((m) => m.strategy_object_id)).toContain(M4b);
    expect((await itemRow(M4b)).attention_state).toBe('basis_corrected');
    expect((await itemEvents(M4b)).at(-1)).toMatchObject({ event: 'memory.attention', details: expect.objectContaining({ invalidation_id: walkC.impact.invalidationId, trigger_kind: 'claim_withdrawal', attention_state: 'basis_corrected' }) });
    await seedClaim({ claimId: CQ2.claimId, version: 3, type: 'CLM', evidence: A, classification: 'internal', eventTime: '2024-01-14T00:00:00Z', lifecycle: 'withdrawn', truthState: 'withdrawn', payload: { claim_kind: 'claim', subject: 'NORDWERK Magnet GmbH', predicate: 'stock_days', object_value: '10' } });
    const walkD = await propagate('claim_withdrawal', CQ2.claimId);
    expect(walkD.impact.memoryItems.map((m) => m.strategy_object_id)).toContain(M4b);
    expect((await itemRow(M4b)).attention_state).toBe('basis_withdrawn');
    expect((await itemEvents(M4b)).at(-1)).toMatchObject({ event: 'memory.attention', details: expect.objectContaining({ invalidation_id: walkD.impact.invalidationId, trigger_kind: 'claim_withdrawal', attention_state: 'basis_withdrawn' }) });
    expect((await retrieveAs(domainAdmin, M4b, 'memory')).memory.availability).toMatchObject({ basis_state: 'withdrawn' });
    // Path 3 — THE REVOCATION'S PORT under retention.import.revoke (an imported claim is refused as a basis, so the call is exercised as the port's unit): a second record on CA v2, then every active record on CA marked once.
    M4c = (await deriveAs(domainAdmin, basisOf('claim', CA.claimId))).memory.itemId;
    expect((await derivationOf(M4c))['basis']).toMatchObject({ id: CA.claimId, version: 2 });
    const markPort = (p: AuthenticatedPrincipal, action: string, basisKind: string) =>
      inCommitContext(commit, { sessionId: p.sessionId, contextKey: p.contextKey }, scope(), action, uuidv7(), async (tx) =>
        (await sql<{ r: Row }>`select memory.mark_basis_withdrawn(${T()}::uuid, ${D()}::uuid, ${basisKind}, ${CA.claimId}::uuid, 'the origin revoked the package (harness unit)', ${p.principalId}::uuid, ${uuidv7()}::uuid) as r`.execute(tx)).rows[0]!.r);
    const marked = await markPort(steward, 'retention.import.revoke', 'claim');
    expect(marked).toMatchObject({ basis_kind: 'claim', basis_id: CA.claimId, count: 2, via: 'retention.import.revoke', truncated: false });
    expect(sorted(marked['marked'] as string[])).toEqual(sorted([M1, M4c]));
    for (const id of [M1, M4c]) {
      expect((await itemRow(id)).attention_state).toBe('basis_withdrawn');
      expect((await itemEvents(id)).at(-1)).toMatchObject({ event: 'memory.basis_withdrawn', details: expect.objectContaining({ basis_kind: 'claim', basis_id: CA.claimId, via: 'retention.import.revoke' }) });
    }
    expect(await markPort(steward, 'retention.import.revoke', 'claim')).toMatchObject({ count: 0, marked: [] }); // once
    expect(await failure(markPort(knowledgeOwner, 'memory.item.record', 'claim'))).toMatchObject({ code: '42501', message: expect.stringMatching(/context is bound to action memory\.item\.record, which this port does not serve/) });
    expect(await failure(markPort(steward, 'retention.import.revoke', 'x'))).toMatchObject({ code: '22023', message: expect.stringMatching(/a withdrawn basis is a claim, a warning or evidence/) });
    // (d) THE RECORD AUTHORITY WITHDRAWS the record whose basis is gone: it leaves circulation (the withdrawn ITEM's rule, unchanged).
    expect((await withdrawAs(recordAuthority, M4, 'the basis is gone; the record leaves circulation (harness)')).memory.state).toBe('withdrawn');
    expect((await itemRow(M4)).state).toBe('withdrawn');
    expect(await failure(retrieveAs(domainAdmin, M4, 'memory'))).toMatchObject({ status: 409, code: 'EYE-STA-003' });
  }, 180_000);

  it('M5 · THE DELETION PAUSE (branch (f)): the manifest of the corrected evidence A paused naming the three derived records with their bases, versions, attention states and the route, released by their withdrawal; the manifest of the withdrawn evidence B a second paused case (the queued case, the standing record); the HUMAN CONTROL on its own evidence H a residual; the version rule probed on the function', async () => {
    // A's manifest (V(M) = {1, 2}; the object's latest version corrected — deletable): the three ACTIVE derived records resting on A's bytes (M1 v2 and M4c on CA@2, M4b on CQ2@1), by recorded_at.
    const a = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mA.manifest_id } });
    expect(a.scope).toMatchObject({ state: 'paused', blocking: 1, execute: 0 });
    const rowA = await actionRow(a.id);
    expect(rowA).toMatchObject({ failure_class: 'unresolved_dependency', disposition: 'human_review' });
    expect(rowA.failure_reason).toMatch(new RegExp(`cannot be retired safely: 1 blocking item\\(s\\) — manifest ${mA.manifest_id} ← memory_item:${M1}, memory_item:${M4b}, memory_item:${M4c}`));
    const itA = (await items(a.id))[0]!;
    expect(itA.disposition).toBe('blocking');
    expect(itA.details['versions']).toEqual([1, 2]);
    const depA = itA.details['dependents'] as Row[];
    expect(depA).toHaveLength(3);
    expect(depA[0]).toMatchObject({ kind: 'memory_item', ref: M1, version_aware: true, basis: `REL:${CA.claimId}@2`, record_version: 2, source_kind: 'document', attention_state: 'basis_withdrawn' });
    expect(depA[1]).toMatchObject({ kind: 'memory_item', ref: M4b, version_aware: true, basis: `CLM:${CQ2.claimId}@1`, record_version: 1, attention_state: 'basis_withdrawn' });
    expect(depA[2]).toMatchObject({ kind: 'memory_item', ref: M4c, version_aware: true, basis: `REL:${CA.claimId}@2`, record_version: 1, attention_state: 'basis_withdrawn' });
    expect(String(depA[0]!['route'])).toMatch(/withdraw the memory record \(memory\.item\.withdraw\) or supersede it on other evidence \(memory\.item\.supersede\); then resolve again/);
    const rsA = await residuals(a.id);
    expect(rsA.map((r) => r.kind)).toEqual(expect.arrayContaining(['claim_lineage', 'dependency', 'canonical_version']));
    await expect(approve(authority, a.id, a.digest)).rejects.toThrow(/only a resolved scope is approved/);
    // THE ROUTE: the record authority withdraws the three; resolved again the scope executes under a new digest (nothing executed here — the bytes stay).
    for (const id of [M1, M4b, M4c]) await withdrawAs(recordAuthority, id, 'released for the deletion (harness)');
    const rA = await resolve(steward, a.id);
    expect(rA.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    expect(String(rA.scope['scope_digest'])).not.toBe(a.digest);
    await withdraw(steward, a.id, 'the deletion control is withdrawn (harness)');
    // B's manifest (its latest version withdrawn — deletable): a SECOND paused case, as the code answers — the queued case on CQ (branch c) and the standing derived record M1b (branch f); M4 withdrawn, M4h a person's record.
    const mB = await manifestRow((await manifestOf(B.id, 1)).manifest_id);
    const b = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mB.manifest_id } });
    expect(b.scope).toMatchObject({ state: 'paused', blocking: 1, execute: 0 });
    const depB = ((await items(b.id))[0]!.details['dependents'] as Row[]).map((d) => `${String(d['kind'])}:${String(d['ref'])}`);
    expect(depB).toEqual([`review_case:${caseQ}`, `memory_item:${M1b}`]);
    expect((await residuals(b.id)).find((r) => r.kind === 'dependency')).toMatchObject({ count: 2, status: 'retained_by_policy' }); // M4h's row and M1b's evidence row; M4's rows retired by its withdrawal
    await withdraw(steward, b.id, 'the second paused case is withdrawn (harness)');
    // THE HUMAN CONTROL on its OWN evidence H (C3): a person's record citing H, H withdrawn by a correction case — deletable, no block, the row a residual.
    const [H] = (await upload([{ name: 'b19-h', text: csv('b19-h') }], 'internal')) as [Evd];
    const M5h = (await recordAs(knowledgeOwner, item({ cites: [{ kind: 'evidence', id: H.id, version: 1, rationale: 'a human record citing H (harness)' }] }))).memory.itemId;
    await applyCase(await submitCorrection([H.id], 'withdrawn (harness)', 'withdrawal', 'internal'), [H.id], 'withdrawn');
    expect((await itemRow(M5h)).attention_state).toBe('none');
    const mH = await manifestRow((await manifestOf(H.id, 1)).manifest_id);
    const hc = await opened({ kind: 'deletion', targetKind: 'evidence', selector: { manifestId: mH.manifest_id } });
    expect(hc.scope).toMatchObject({ state: 'scope_resolved', execute: 1, blocking: 0 });
    expect((await residuals(hc.id)).find((r) => r.kind === 'dependency')).toMatchObject({ count: 1, status: 'retained_by_policy' });
    await withdraw(steward, hc.id, 'the residual control is withdrawn (harness)');
    // THE VERSION RULE probed on the function itself (a revision under NEW bytes is not reachable through the routes; a correction keeps the manifest): matched by version, by the lineage digest though the version does not exist, by neither.
    [C] = (await upload([{ name: 'b19-c', text: csv('b19-c') }], 'internal')) as [Evd];
    const CC2 = await seedClaim({ type: 'ENT', evidence: C, classification: 'internal', payload: { claim_kind: 'entity', subject: 'NORDWERK Magnet GmbH', predicate: 'is_a', object_value: 'manufacturer' } });
    M5v = (await deriveAs(knowledgeOwner, basisOf('claim', CC2.claimId))).memory.itemId;
    const lbr = async (versions: number[], digest: string): Promise<Row[]> => (await sql<{ r: Row[] }>`select retention.load_bearing_references(${T()}::uuid, ${D()}::uuid, ${C.id}::uuid, ${versions}::bigint[], ${digest}) as r`.execute(su)).rows[0]!.r;
    expect(await lbr([1], 'a digest no lineage names')).toEqual([expect.objectContaining({ kind: 'memory_item', ref: M5v, version_aware: true })]);
    expect(await lbr([2], C.bytesDigest)).toEqual([expect.objectContaining({ kind: 'memory_item', ref: M5v, version_aware: true })]);
    expect(await lbr([2], 'a digest no lineage names')).toEqual([]);
  }, 120_000);

  it('M6 · THE BRIEFING carries the derived record with the basis\'s truth state, synthetic true and basis_state current (the human item unchanged; the composer\'s access recorded); the evidence withdrawn by a correction case → a second composition carries basis_state withdrawn on both derived records with the statements still carried', async () => {
    // C is the INTERNAL source's synthetic upload; the claim says confidential — the lift is the claim's, the synthetic state the evidence's.
    const CC3 = await seedClaim({ type: 'EVT', evidence: C, classification: 'confidential', eventTime: '2024-01-14T00:00:00Z', payload: { claim_kind: 'event', subject: 'NORDWERK Magnet GmbH', predicate: 'shipment_count', object_value: '3 on 2024-01-14' } });
    const r6 = await deriveAs(domainAdmin, basisOf('claim', CC3.claimId, null, { audience: { classification: 'internal', roles: [], purposes: ['briefing', 'memory'] } }));
    const M6 = r6.memory.itemId;
    expect(r6.memory).toMatchObject({ classification: { declared: 'internal', inherited: 'confidential', applied: 'confidential' }, inherited: { synthetic_state: true }, statement: 'NORDWERK Magnet GmbH shipment_count 3 on 2024-01-14 — as of 2024-01-14T00:00:00.000Z' });
    const M6h = (await recordAs(knowledgeOwner, item({ audience: { classification: 'internal', roles: [], purposes: ['briefing'] } }))).memory.itemId;
    await sleep(30); const knownAt = (await mark()).toISOString();
    const first = (await compose(executive, knownAt)).briefing;
    const m6 = memoryOf(first).find((i) => i['id'] === M6)!;
    expect(m6).toMatchObject({ kind: 'memory', version: 1, truth_state: 'extracted', synthetic_state: true,
      details: expect.objectContaining({ basis_state: 'current', statement: r6.memory.statement, derivation: expect.objectContaining({ basis: expect.objectContaining({ id: CC3.claimId, object_type: 'EVT', version: 1 }), method_ref: 'memory-derive@1.0.0' }) }) });
    expect(first.controls['synthetic_state']).toBe(true);
    const m6h = memoryOf(first).find((i) => i['id'] === M6h)!;
    expect(m6h).toMatchObject({ synthetic_state: false, truth_state: 'asserted', details: expect.objectContaining({ derivation: null, basis_state: null }) });
    expect((await accessRows(M6)).map((x) => [x.reader_principal_id, x.purpose_id])).toEqual([[executive.principalId, 'briefing']]);
    expect(first.memoryAccesses.some((x) => x['item_id'] === M6)).toBe(true);
    const m5v = memoryOf(first).find((i) => i['id'] === M5v)!;
    expect((m5v['details'] as Row)['basis_state']).toBe('current');
    // C withdrawn by its publisher: the two derived records on C marked in the applying transaction; the next composition SAYS so and still carries the statements (D5, C6).
    await applyCase(await submitCorrection([C.id], 'the record was withdrawn by its publisher (harness)', 'withdrawal', 'internal'), [C.id], 'withdrawn');
    expect((await itemRow(M6)).attention_state).toBe('basis_withdrawn');
    expect((await itemRow(M5v)).attention_state).toBe('basis_withdrawn');
    await sleep(30);
    const second = (await compose(executive, (await mark()).toISOString())).briefing;
    const m6b = memoryOf(second).find((i) => i['id'] === M6)!; const m5b = memoryOf(second).find((i) => i['id'] === M5v)!;
    expect((m6b['details'] as Row)['basis_state']).toBe('withdrawn');
    expect((m6b['details'] as Row)['statement']).toBe(r6.memory.statement);
    expect((m5b['details'] as Row)['basis_state']).toBe('withdrawn');
    expect((m5b['details'] as Row)['statement']).toBe('NORDWERK Magnet GmbH is_a manufacturer');
    expect(second.contentDigest).not.toBe(first.contentDigest);
    expect((memoryOf(second).find((i) => i['id'] === M6h)!['details'] as Row)['basis_state']).toBeNull();
  }, 120_000);
});
