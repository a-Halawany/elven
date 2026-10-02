/**
 * THE ENTERPRISE MEMORY WORKSPACE (0066 §3; AU-MEM-0065 — V8 OBJ-14 record, OBJ-15 retrieve, OBJ-16 supersede;
 * PR-20-001/002; CAP-UM-07; V2:V02-T-118; V0:V00-T-039; CP-6 B19 (0079) — the source-derived records).
 *
 * A Memory item is an institutional or strategic record: a fact, decision rationale, commitment, outcome, lesson or
 * context a knowledge owner wants the organisation to remember, with its SOURCE — a person (source kind human: RECORDED,
 * the person's own words) or a document, a communication or telemetry (DERIVED by memory.item.derive from a claim version
 * or a warning under the method memory-derive@1.0.0: the content computed, the provenance and the controls inherited, the
 * basis followed) —, its AUDIENCE (classification, roles, purposes), its VALIDITY (world time) and its RETENTION (profile,
 * retain-until, basis). Every version is a canonical MEM object admitted through the same path as every canonical
 * object; the projection `memory.items_current` carries the current version; the prior version stays REPLAYABLE (a
 * known-at read serves the version that was current then, from `objects.canonical_objects`).
 *
 *   RECORD     — the knowledge owner (memory.item.record): a person's own record (source kind human); cites become
 *                dependency rows so the correction impact set reaches the item (AU-MEM-0031): an item resting on corrected
 *                evidence, a corrected claim or a changed strategy object is marked `basis_corrected` for the owner's
 *                attention, never rewritten by a walk.
 *   DERIVE     — the same roles, HUMAN-GATED (memory.item.derive; B19): the person names a claim version (ENT/EVT/CLM/REL/ASM,
 *                the exact version or the latest) or a warning; the SERVER computes the statement (derive.ts, §2.4) and its
 *                digest (re-verified by the port), resolves the evidence versions the basis rests on and their source
 *                contract, inherits the controls (ES-29-002 — the most restrictive classification of the declared audience,
 *                the basis and the evidence, SAID as declared/inherited/applied; synthetic state, rights, residency,
 *                retention), takes the truth state from the basis (extracted / asserted / inferred — never observed in B19:
 *                the observed series-window basis is owed) and refuses a basis a person has not decided (queued, rejected,
 *                corrected to a later version), a withdrawn basis or evidence, an imported claim — and a derivation whose
 *                applied classification the deriver's own clearance does not cover (the act is not an oracle over content
 *                its caller may not read). The derivation block travels on the MEM@v2 payload and the projection; the basis
 *                and its evidence are dependency rows whether or not the person cited them.
 *   RETRIEVE   — a purpose-authorised reader or agent (memory.item.retrieve): read-time authority is the reader's NOW —
 *                the declared purpose must be one the item is admitted for, the reader's clearance in this domain must
 *                cover the item's classification, and an audience of roles (when declared) must include one of the
 *                reader's roles here; the access is a ledger row inside the read's own transaction (who, which version,
 *                under which purpose, authorised by which policy decision, as of when). Nothing is mutated. A derived
 *                record whose basis was corrected or withdrawn is SERVED with the declaration (availability.basis_state).
 *   SUPERSEDE  — the record authority (memory.item.supersede, human-gated): the next version with its reason and
 *                effective time; the prior version's canonical row is untouched and named by the successor. A derived
 *                record is RE-DERIVED (payload.basis, the same gates); a person's record re-stated — the kind class of an
 *                item never changes (the route's 422; the port's own rule).
 *   WITHDRAW   — the record authority: the item leaves circulation; every version stays replayable.
 *
 * Retrieval frequency, similarity or annotation never make a memory item organisational truth (DP-37-003): a record's
 * truth state is what its owner asserted (human) or its BASIS's (derived: extracted, asserted, inferred), and stays so
 * until superseded. The listing (`record`) exposes a derived record's basis ids and digests (no content) to every lister —
 * the B9 listing rule: the statement is a retrieval's.
 *
 * THE TWO TIERS (CP-6 B20, 0080; AU-MEM-0067, D9). The METADATA tier is the six serving projections of the index tier —
 * here memory.items_current — and the canonical header; the CONTENT tier is the canonical version payloads (the MEM
 * versions, the claims) and the evidence bytes in the vault. The projection is one PARTITION of the domain's index tier
 * (graph.projection_partitions): while it is WITHDRAWN (a failed retrieval check — drifted, missing or poisoned rows, an
 * outdated representation — or the operator's act) `current` and `list` serve the LAST VALID STATE from the memory log
 * through the shared fallback reader (graph/projections/fallback.ts: the projection row joined to the log's state and
 * version, `drift` where they differ, a row the log has and the projection lacks built from the canonical version, a row
 * the log does not know never served), every such row `index_state 'stale'`; a serving projection's rows read
 * `index_state 'projected'`. The column memory.items_current.index_state is retired in place (D22): the partition row says
 * what a per-row flag cannot, and the retrieval COMPUTES index_state from the partition state. A retrieval whose CONTENT
 * tier does not answer — the canonical read fails at the fault point b20.memory_content_unavailable, or by a statement-level
 * failure that leaves the connection alive — answers 200 METADATA-ONLY (content 'unavailable', EYE-DEG-001 declared, no
 * version served, NO access row: memory.item_access requires the served version) and records ONE memory.retrieval_degraded
 * ledger row; the gates it can still apply are applied on the projection's audience LIST (narrower, never wider: the
 * admitted purpose is the canonical version's and cannot be checked); while the partition is withdrawn AND the content tier
 * does not answer nothing verified remains to gate a metadata answer on — the one read B20 refuses (503 EYE-DEG-001, C7).
 * B21 (Codex B20-F1): the reader's own canonical statements (the derivation's policy columns; the absent rows' versions) stand
 * under the same boundary inside fallback.ts, and their failure while the partition is withdrawn is the same 503 for a present
 * row as for a missing one — a missing row has no audience to gate a metadata answer on; /memory/list and /memory/:id/get answer
 * the same 503; the briefing composes without its memory items and says so.
 * An injected fault or a statement-level failure that leaves the connection alive MAY be answered metadata-only (classes
 * 53/58 include conditions after which the backend may not survive the statement; then the request fails as before); a
 * connection-class failure (08xxx, 57P01–57P03) kills the transaction the metadata was read in and the request fails 5xx as
 * before — the audit row cannot be committed on a dead connection. The evidence bytes' unavailability stays
 * observation.evidence.retrieve's 409 (D10: a missing and a corrupt read are the same shape to a caller).
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { validateHeader, canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { ScopeContext } from '../../shared/scope.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { assertClearance, bindingReaches, clearanceOf, covers } from '../../shared/clearance.js';
import { at } from '../../observation/fault-injection.js';
import type { GraphReads, MemoryContextReads, MemoryWrites } from '../graph.capabilities.js';
import { effectiveReviewState, isoOr } from '../edges/derive.js';
import type { ProjectionBlock } from '../projections/projection-state.js';
import { CONTEXT_PARTITIONS, projectionStateOf } from '../projections/projection-state.js';
import { CONTEXT_CONSISTENCY_NOTE, CONTEXT_LOG_NOTE, CONTEXT_POLICY_NOTE, CONTEXT_SCAN_BOUND, contentUnavailableReason, omissionsOf, productStateOf, type ContextOmission, type ContextProductState } from './context.js';
import { memoryItemFromLog, memoryItemsFromLog } from '../projections/fallback.js';
import { ContentTierUnavailable, contentFailureDetail } from '../projections/content-tier.js';
export { isContentTierFailure } from '../projections/content-tier.js';   // B21: moved to content-tier.ts; the unit test's import path stands
import {
  CLAIM_OBJECT_TYPES, MEMORY_BASIS_KINDS, MEMORY_DERIVE_METHOD, MEMORY_DERIVED_SOURCE_KINDS, MEMORY_SERIES_KEYS_MAX,
  anySynthetic, basisGate, derivedStatementOf, evidenceGate, evidenceVersionOf, mostRestrictive, sourceRefOf, statementDigestOf,
  type BasisRef, type Derivation, type DerivationSource, type DeriveRefusal, type EvidenceUse,
} from './derive.js';

type Row = Record<string, unknown>;
export const MEMORY_CITE_KINDS = ['evidence', 'claim', 'strategy', 'entity', 'edge', 'forecast', 'warning'] as const;
export const MEMORY_RECORD_CLASSES = ['institutional', 'strategic'] as const;
export const MEMORY_SOURCE_KINDS = ['human', 'document', 'communication', 'telemetry'] as const;
export const MEMORY_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;

export interface MemoryItemIntake {
  recordClass: (typeof MEMORY_RECORD_CLASSES)[number];
  title: string;
  statement: string;
  source: { kind: (typeof MEMORY_SOURCE_KINDS)[number]; ref: string | null };
  audience: { classification: (typeof MEMORY_CLASSIFICATIONS)[number]; roles: string[]; purposes: string[] };
  validity: { from: string; to: string | null };
  retention: { profile: string; retainUntil: string | null; basis: string | null };
  cites: Array<{ kind: (typeof MEMORY_CITE_KINDS)[number]; id: string; version: number | null; rationale: string }>;
  related: { decisionId: string | null; objectiveId: string | null };
  supersession: { reason: string; effectiveAt: string | null } | null;
}

/**
 * B19: what a person sends to DERIVE a record — the basis and the declared fields; the statement, the source reference and
 * the provenance are the server's (a statement or a source in the payload is refused). `validity.from` and
 * `retention.profile` are optional here: the basis's event time and the basis's (else the evidence's) retention profile stand in.
 */
export interface MemoryDeriveIntake {
  basis: BasisRef;
  sourceKind: (typeof MEMORY_DERIVED_SOURCE_KINDS)[number];
  recordClass: MemoryItemIntake['recordClass']; title: string;
  audience: MemoryItemIntake['audience'];
  validity: { from: string | null; to: string | null };
  retention: { profile: string | null; retainUntil: string | null; basis: string | null };
  cites: MemoryItemIntake['cites'];
  related: MemoryItemIntake['related'];
  supersession: MemoryItemIntake['supersession'];
}

/** The derive route's answer: what was computed and where each inherited field came from. */
export interface DeriveAnswer {
  itemId: string; version: number; cites: number; contentDigest: string; statement: string; statementDigest: string;
  basis: { kind: string; object_type: string; id: string; version: number; content_digest: string; truth_state: string; review_state: string; event_time: string | null };
  source: DerivationSource; evidence: EvidenceUse[]; seriesKeys: string[];
  classification: { declared: string; inherited: string; applied: string };
  inherited: { synthetic_state: boolean; rights_profile: string | null; residency_profile: string | null; retention_profile: string; retention_from: 'declared' | 'basis' | 'evidence'; valid_from: string; valid_from_source: 'declared' | 'basis' | 'prior' };
  sourceKind: string;
}

/** The header fields the basis decides for a derived record (D6, N-d), handed to `write` beside the derivation block. */
interface DerivedHeader {
  truth_state: string; synthetic_state: boolean; classification: string; rights_profile: string | null; residency_profile: string | null;
  event_time: string | null; source_clock_quality: CanonicalHeader['source_clock_quality']; evidence_refs: string[]; provenance_ref: string; source_object_ids: string[];
}

const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const isoOrNull = (v: unknown, what: string, correlationId: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) bad(correlationId, `${what} is not an instant`);
  return d.toISOString();
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);

/* ───────────── the record form's pieces, shared by the two intakes (the texts are the 0066 route's) ───────────── */
function parseRecordClassAndTitle(p: Row, correlationId: string): { recordClass: MemoryItemIntake['recordClass']; title: string } {
  const recordClass = String(p['recordClass'] ?? '');
  if (!(MEMORY_RECORD_CLASSES as readonly string[]).includes(recordClass)) bad(correlationId, `recordClass is one of ${MEMORY_RECORD_CLASSES.join(', ')}`);
  const title = String(p['title'] ?? '').trim();
  if (title.length < 3 || title.length > 200) bad(correlationId, 'title is 3–200 characters');
  return { recordClass: recordClass as MemoryItemIntake['recordClass'], title };
}
function parseAudience(p: Row, correlationId: string): MemoryItemIntake['audience'] {
  const aud = (p['audience'] ?? {}) as Row;
  const classification = String(aud['classification'] ?? '');
  if (!(MEMORY_CLASSIFICATIONS as readonly string[]).includes(classification)) bad(correlationId, `audience.classification is one of ${MEMORY_CLASSIFICATIONS.join(', ')}`);
  const roles = Array.isArray(aud['roles']) ? (aud['roles'] as unknown[]).map(String) : [];
  const purposes = Array.isArray(aud['purposes']) ? (aud['purposes'] as unknown[]).map(String) : [];
  return { classification: classification as MemoryItemIntake['audience']['classification'], roles, purposes };
}
function parseCites(p: Row, correlationId: string): MemoryItemIntake['cites'] {
  const cites = Array.isArray(p['cites']) ? (p['cites'] as Row[]) : [];
  return cites.map((c) => {
    const kind = String(c['kind'] ?? '');
    if (!(MEMORY_CITE_KINDS as readonly string[]).includes(kind)) bad(correlationId, `cites[].kind is one of ${MEMORY_CITE_KINDS.join(', ')}`);
    const id = String(c['id'] ?? '');
    if (!UUID.test(id)) bad(correlationId, 'cites[].id is an object id');
    const rationale = String(c['rationale'] ?? '').trim();
    if (rationale.length < 8) bad(correlationId, 'cites[].rationale is at least 8 characters');
    const version = c['version'] === undefined || c['version'] === null ? null : Number(c['version']);
    return { kind: kind as MemoryItemIntake['cites'][number]['kind'], id, version, rationale };
  });
}
function parseRelated(p: Row, correlationId: string): MemoryItemIntake['related'] {
  const rel = (p['related'] ?? {}) as Row;
  const decisionId = rel['decisionId'] === undefined || rel['decisionId'] === null ? null : String(rel['decisionId']);
  const objectiveId = rel['objectiveId'] === undefined || rel['objectiveId'] === null ? null : String(rel['objectiveId']);
  if (decisionId !== null && !UUID.test(decisionId)) bad(correlationId, 'related.decisionId is an object id');
  if (objectiveId !== null && !UUID.test(objectiveId)) bad(correlationId, 'related.objectiveId is an object id');
  return { decisionId, objectiveId };
}
function parseSupersession(p: Row, correlationId: string, forSupersession: boolean): MemoryItemIntake['supersession'] {
  if (!forSupersession) return null;
  const sup = (p['supersession'] ?? {}) as Row;
  const reason = String(sup['reason'] ?? '').trim();
  if (reason.length < 8) bad(correlationId, 'supersession.reason is at least 8 characters (OBJ-16)');
  return { reason, effectiveAt: isoOrNull(sup['effectiveAt'], 'supersession.effectiveAt', correlationId) };
}
/** The retention block's two optional fields (the profile is checked by each intake in its own place — the record form's order of refusals is 0066's). */
function parseRetentionRest(p: Row, correlationId: string): { retainUntil: string | null; basis: string | null } {
  const ret = (p['retention'] ?? {}) as Row;
  return { retainUntil: isoOrNull(ret['retainUntil'], 'retention.retainUntil', correlationId), basis: ret['basis'] === undefined || ret['basis'] === null ? null : String(ret['basis']) };
}

export function validateMemoryItem(p: Row, correlationId: string, forSupersession: boolean): MemoryItemIntake {
  const { recordClass, title } = parseRecordClassAndTitle(p, correlationId);
  const statement = String(p['statement'] ?? '').trim();
  if (statement.length < 8) bad(correlationId, 'statement is at least 8 characters');
  const src = (p['source'] ?? {}) as Row;
  const sourceKind = String(src['kind'] ?? '');
  if (!(MEMORY_SOURCE_KINDS as readonly string[]).includes(sourceKind)) bad(correlationId, `source.kind is one of ${MEMORY_SOURCE_KINDS.join(', ')}`);
  // B19: only a person's own record is RECORDED; the other kinds are DERIVED (the supersede route decides the kind class itself; the port refuses a crossing).
  if (!forSupersession && sourceKind !== 'human') bad(correlationId, 'a document, communication or telemetry record is derived from its source (memory.item.derive); a person\'s own record is source kind human');
  const audience = parseAudience(p, correlationId);
  const val = (p['validity'] ?? {}) as Row;
  const from = isoOrNull(val['from'], 'validity.from', correlationId);
  if (from === null) bad(correlationId, 'validity.from is declared (the world time the record holds from)');
  const to = isoOrNull(val['to'], 'validity.to', correlationId);
  if (to !== null && to <= (from as string)) bad(correlationId, 'validity.to is after validity.from');
  const ret = (p['retention'] ?? {}) as Row;
  const profile = String(ret['profile'] ?? '').trim();
  if (profile.length === 0) bad(correlationId, 'retention.profile is declared at record time (OBJ-14)');
  const parsed = parseCites(p, correlationId);
  const related = parseRelated(p, correlationId);
  const supersession = parseSupersession(p, correlationId, forSupersession);
  return {
    recordClass, title, statement,
    source: { kind: sourceKind as MemoryItemIntake['source']['kind'], ref: src['ref'] === undefined || src['ref'] === null ? null : String(src['ref']) },
    audience,
    validity: { from: from as string, to }, retention: { profile, ...parseRetentionRest(p, correlationId) },
    cites: parsed, related, supersession,
  };
}

/**
 * B19: the derive form — the record form's keys (recordClass, title, audience, validity, retention, cites, related,
 * supersession) plus `basis: { kind, id, version? }` and `sourceKind`; `statement` and `source` are refused if present.
 */
export function validateDeriveIntake(p: Row, correlationId: string, forSupersession: boolean): MemoryDeriveIntake {
  const b = isObject(p['basis']) ? (p['basis'] as Row) : {};
  const kind = String(b['kind'] ?? '');
  if (!(MEMORY_BASIS_KINDS as readonly string[]).includes(kind)) bad(correlationId, `basis.kind is one of ${MEMORY_BASIS_KINDS.join(', ')}`);
  const id = String(b['id'] ?? '');
  if (!UUID.test(id)) bad(correlationId, 'basis.id is an object id');
  let version: number | null = null;
  if (b['version'] !== undefined && b['version'] !== null && b['version'] !== '') {
    version = Number(b['version']);
    if (!Number.isInteger(version) || version < 1) bad(correlationId, 'basis.version is a positive integer, or omitted for the latest version');
  }
  const sourceKind = String(p['sourceKind'] ?? '');
  if (!(MEMORY_DERIVED_SOURCE_KINDS as readonly string[]).includes(sourceKind)) bad(correlationId, `sourceKind is one of ${MEMORY_DERIVED_SOURCE_KINDS.join(', ')} (a person\'s own record is source kind human: memory.item.record)`);
  if (p['statement'] !== undefined || p['source'] !== undefined) bad(correlationId, 'a derived record\'s statement and source are computed from the basis; do not send them');
  const { recordClass, title } = parseRecordClassAndTitle(p, correlationId);
  const audience = parseAudience(p, correlationId);
  const val = (p['validity'] ?? {}) as Row;
  const from = isoOrNull(val['from'], 'validity.from', correlationId);
  const to = isoOrNull(val['to'], 'validity.to', correlationId);
  if (from !== null && to !== null && to <= from) bad(correlationId, 'validity.to is after validity.from');
  const profile = String(((p['retention'] ?? {}) as Row)['profile'] ?? '').trim();
  const rest = parseRetentionRest(p, correlationId);
  const cites = parseCites(p, correlationId);
  const related = parseRelated(p, correlationId);
  const supersession = parseSupersession(p, correlationId, forSupersession);
  return {
    basis: { kind: kind as BasisRef['kind'], id, version }, sourceKind: sourceKind as MemoryDeriveIntake['sourceKind'],
    recordClass, title, audience, validity: { from, to },
    retention: { profile: profile.length === 0 ? null : profile, retainUntil: rest.retainUntil, basis: rest.basis },
    cites, related, supersession,
  };
}

/** B19 (C6): the basis's state as the projection's attention state declares it — null for a person's own record; used by the retrieval and the briefing alike. */
export function basisStateOf(item: Row): string | null {
  if (item['derivation'] === null || item['derivation'] === undefined) return null;
  const s = String(item['attention_state'] ?? 'none');
  return ({ none: 'current', basis_corrected: 'corrected', basis_withdrawn: 'withdrawn' } as Record<string, string>)[s] ?? s;
}

/* ───────────── B20 (0080; D9): the content tier ───────────── */
/** The label a metadata-only retrieval carries (a literal the harness and the page pin). */
export const MEMORY_CONTENT_UNAVAILABLE_LABEL = 'the content tier did not answer; this is the item\'s metadata (its state, versions and audience) — the statement is not served; retry or contact the operator';
/** B21: `isContentTierFailure` lives in ../projections/content-tier.ts (shared with the fallback reader); re-exported above. */
/** The source of the memory workspace's reads while its partition is withdrawn (§2.7): the log through the fallback reader, under the same capability and action. B21: `refusal` is how a content-tier failure of the reader is answered — the route's projection block and correlation id build the 503 (D1.3); without it the typed error propagates (a 500 as before; no caller today). */
export interface MemoryReadOpts { withdrawn: boolean; scope: { tenantId: string; domainId: string }; refusal?: { projection: ProjectionBlock | undefined; correlationId: string } }
/**
 * C7 (B20) and B21: while memory_items_current is WITHDRAWN and the content tier does not answer nothing verified remains to gate a
 * metadata answer on — the ONE refusal B20 adds to a read, raised for every canonical statement of the withdrawn path (the reader's
 * two, the retrieval's versions read), for a present row as for a missing one (a missing row's audience exists only in the canonical
 * version). ONE literal (the harness regex, the memory page); the detail a trailing parenthesis.
 */
export function refuseWithdrawnAndDown(block: ProjectionBlock | undefined, correlationId: string, detail: string | null): HttpException {
  const mem = block?.partitions.find((p) => p.projection === 'memory_items_current');
  return new HttpException(errorBody('EYE_DEG_001', correlationId,
    `the memory_items_current projection of this domain is withdrawn (since ${String(mem?.withdrawn_since ?? 'an unknown instant')}: ${String(mem?.reason ?? 'no reason recorded')}) and the content tier did not answer; nothing verified remains to gate a metadata answer on — retry when the content tier answers, or after the rebuild (graph.projection.rebuild)${detail === null ? '' : ` (${detail})`}`), 503);
}
/** A retrieval SERVED: the served version's content, header fields and audience; the availability from the metadata tier. */
export interface MemoryServed { item: Row; version: Row; versionServed: number; versions: number; asOf: string | null; availability: Row; content?: undefined; degraded?: undefined }
/** A retrieval answered METADATA-ONLY (D9): no version served, the count is the content tier's, the degradation declared. */
export interface MemoryMetadataOnly {
  item: Row; version: null; versionServed: null; versions: null; asOf: string | null; availability: Row; content: 'unavailable';
  degraded: { kind: 'content_unavailable'; code: 'EYE-DEG-001'; label: string; detail: string };
}
export type MemoryRetrieval = MemoryServed | MemoryMetadataOnly;

@Injectable()
export class MemoryService {
  /**
   * Record (version 1) or supersede (version n+1): the canonical MEM version and the projection, in one transaction.
   * B19: a DERIVED record hands in `derived` — the block memory.record_item validates and the header fields the basis decides
   * (D6); a person's record (no `derived`) is byte-identical to 0066's: asserted, not synthetic, its own classification, MEM@v1.
   */
  async write(cap: MemoryWrites, ctx: ScopeContext, a: { itemId: string; version: number; intake: MemoryItemIntake; owner: string; actor: string; correlationId: string; purposeId: string; derived?: { derivation: Derivation; header: DerivedHeader } | null }): Promise<{ itemId: string; version: number; cites: number; contentDigest: string }> {
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const m = a.intake; const now = new Date().toISOString(); const d = a.derived ?? null;
    const payload = {
      record_class: m.recordClass, title: m.title, statement: m.statement,
      source: { kind: m.source.kind, ref: m.source.ref },
      audience: { classification: m.audience.classification, roles: m.audience.roles, purposes: m.audience.purposes },
      validity: { from: m.validity.from, to: m.validity.to },
      retention: { profile: m.retention.profile, retain_until: m.retention.retainUntil, basis: m.retention.basis },
      cites: m.cites.map((c) => ({ kind: c.kind, id: c.id, version: c.version, rationale: c.rationale })),
      related: { decision_id: m.related.decisionId, objective_id: m.related.objectiveId },
      ...(m.supersession === null ? {} : { supersession: { reason: m.supersession.reason, effective_at: m.supersession.effectiveAt } }),
      ...(d === null ? {} : { derivation: d.derivation }),
    };
    const prior = a.version > 1 ? `MEM:${a.itemId}@${a.version - 1}` : null;
    const header: CanonicalHeader = {
      object_id: a.itemId, object_type: 'MEM', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: String(a.version), lifecycle_state: 'active', owning_component: 'CP-MEM-01', accountable_owner: `principal:${a.owner}`,
      source_object_ids: d?.header.source_object_ids ?? m.cites.filter((c) => c.kind === 'evidence' || c.kind === 'claim').map((c) => c.id),
      event_time: d?.header.event_time ?? null, observation_time: now, valid_from: m.validity.from, valid_to: m.validity.to, recorded_at: now,
      time_precision: 'exact', source_clock_quality: d?.header.source_clock_quality ?? 'trusted',
      // A person's record is ASSERTED (B19: the `telemetry → observed` stamp of 0066 is gone — nothing observed it); a derived record's truth state is its basis's.
      truth_state: d?.header.truth_state ?? 'asserted', synthetic_state: d?.header.synthetic_state ?? false, confidence: null, uncertainty: null,
      evidence_refs: d?.header.evidence_refs ?? m.cites.map((c) => `${c.kind}:${c.id}`), provenance_ref: d?.header.provenance_ref ?? `principal:${a.owner}`, method_ref: d === null ? 'human-record@1.0.0' : MEMORY_DERIVE_METHOD,
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${a.owner}`],
      classification: d?.header.classification ?? m.audience.classification, purpose_scope: a.purposeId, rights_profile: d?.header.rights_profile ?? null, residency_profile: d?.header.residency_profile ?? null,
      retention_profile: m.retention.profile, access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null,
      schema_ref: d === null ? 'MEM@v1' : 'MEM@v2', ontology_ref: null, correction_of: null, supersedes: prior, withdrawal_reason: null,
      audit_correlation_id: a.correlationId, content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', a.correlationId, `memory item header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    const admitted = await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.recordMemoryItem({
      itemId: a.itemId, tenantId, domainId, version: a.version,
      record: {
        record_class: m.recordClass, title: m.title, statement: m.statement, source_kind: m.source.kind, source_ref: m.source.ref,
        owner_principal_id: a.owner, classification: d?.header.classification ?? m.audience.classification, audience_roles: m.audience.roles, audience_purposes: m.audience.purposes,
        valid_from: m.validity.from, valid_to: m.validity.to, retention_profile: m.retention.profile, retain_until: m.retention.retainUntil, retention_basis: m.retention.basis,
        related_decision_id: m.related.decisionId, related_objective_id: m.related.objectiveId,
        ...(m.supersession === null ? {} : { supersession: { reason: m.supersession.reason, effective_at: m.supersession.effectiveAt } }),
      },
      cites: m.cites.map((c) => ({ kind: c.kind, id: c.id, rationale: c.rationale })),
      actor: a.actor, eventId: newId(), correlationId: a.correlationId, derivation: d === null ? null : (d.derivation as unknown as Row),
    });
    return { itemId: a.itemId, version: a.version, cites: m.cites.length, contentDigest: admitted.contentDigest };
  }

  /**
   * DERIVE (B19; design §2.3): a memory record from a claim version or a warning — every read through the write's own
   * capability, in the write's transaction. The gate order (§11, C2, C1): the basis row → its lifecycle and the object's
   * latest version → imported → the review case → the lineage and the EVIDENCE gate → the controls folded and the deriver's
   * CLEARANCE over the applied classification → the source contract → the kind rule → the statement → the header → the write.
   * `action` says which route called (the re-derivation is memory.item.supersede with the record's next version); the
   * database decides what the bound action admits.
   */
  async derive(cap: MemoryWrites, principal: AuthenticatedPrincipal, ctx: ScopeContext, a: { itemId: string; version: number; intake: MemoryDeriveIntake; owner: string; actor: string; correlationId: string; purposeId: string; action: 'memory.item.derive' | 'memory.item.supersede' }): Promise<DeriveAnswer> {
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const cid = a.correlationId; const intake = a.intake; const basis = intake.basis; const kind = basis.kind;
    const refuse = (r: DeriveRefusal): never => { throw new HttpException(errorBody(r.code, cid, r.message), r.status); };
    const absent = `no authorized basis matches (${kind} ${basis.id}${basis.version === null ? '' : `@${basis.version}`})`;
    const num = (v: unknown): number => Number(v);

    // 1. THE BASIS ROW — every version of the object (bigint versions arrive as strings: compared by Number).
    const rows = (await cap.readCanonicalObjects().selectAll().where('object_id' as never, '=', basis.id as never)
      .where('object_type' as never, 'in', (kind === 'claim' ? [...CLAIM_OBJECT_TYPES] : ['WRN']) as never).orderBy('object_version' as never, 'desc').execute()) as Row[];
    if (rows.length === 0) throw new HttpException(errorBody('EYE_STA_001', cid, absent), 404);
    const latest = rows[0]!;
    const row = basis.version === null ? latest : rows.find((r) => num(r['object_version']) === basis.version);
    if (row === undefined) throw new HttpException(errorBody('EYE_STA_001', cid, absent), 404);
    const objectType = String(row['object_type']); const basisVersion = num(row['object_version']);
    const label = `${objectType} ${basis.id}@${basisVersion}`;
    const rowPayload = isObject(row['payload']) ? (row['payload'] as Row) : {};

    // 2. THE GATE — the case's decision for a claim version (the latest case by opened_at); the warning's state for a warning.
    let caseState: string | null = null; let supersededTo: number | null = null; let queuedReason: string | null = null; let warning: Row | null = null;
    if (kind === 'claim') {
      const cases = (await cap.readReviewCases().selectAll().where('claim_object_id' as never, '=', basis.id as never).where('claim_version' as never, '=', basisVersion as never)
        .orderBy('opened_at' as never).execute()) as Row[];
      const last = cases.at(-1);
      if (last !== undefined) {
        caseState = String(last['state']);
        supersededTo = last['superseded_to_version'] === null || last['superseded_to_version'] === undefined ? null : num(last['superseded_to_version']);
        queuedReason = last['queued_reason'] === null || last['queued_reason'] === undefined ? null : String(last['queued_reason']);
      }
    } else {
      warning = ((await cap.readWarnings().selectAll().where('warning_id' as never, '=', basis.id as never).executeTakeFirst()) as Row | undefined) ?? null;
      if (warning === null) throw new HttpException(errorBody('EYE_STA_001', cid, absent), 404);
    }
    const gate = basisGate({ kind, row, latest, caseState, supersededTo, label, queuedReason, warningState: warning === null ? null : String(warning['state']) });
    if (gate !== null) refuse(gate);
    if (kind === 'warning' && intake.sourceKind !== 'telemetry') bad(cid, 'a warning rests on a series; its record is source kind telemetry');
    const reviewState = kind === 'claim' ? effectiveReviewState(row, caseState) : String(warning!['state']);

    // 3. THE EVIDENCE the basis rests on — the version each lineage row names (D14), each under the evidence gate (C2).
    const evidence: EvidenceUse[] = []; const evidenceRows: Row[] = [];
    const evdVersions = async (evdId: string): Promise<Row[]> => (await cap.readCanonicalObjects().selectAll().where('object_id' as never, '=', evdId as never)
      .where('object_type' as never, '=', 'EVD' as never).orderBy('object_version' as never, 'desc').execute()) as Row[];
    const warningEntries = warning === null ? [] : ((Array.isArray(warning['evidence']) ? warning['evidence'] : []) as unknown[]).filter(isObject);
    if (kind === 'claim') {
      const lineage = ((await cap.readClaimLineage().selectAll().where('claim_object_id' as never, '=', basis.id as never).where('claim_version' as never, '=', basisVersion as never).execute()) as Row[])
        .sort((x, y) => (String(x['evidence_object_id']) < String(y['evidence_object_id']) ? -1 : String(x['evidence_object_id']) > String(y['evidence_object_id']) ? 1 : 0));
      if (lineage.length === 0) bad(cid, `${label} carries no evidence lineage; a memory record without provenance is not derived`);
      for (const l of lineage) {
        const evdId = String(l['evidence_object_id']); const digest = String(l['evidence_digest'] ?? '');
        const versions = await evdVersions(evdId);
        const ev = evidenceVersionOf(versions, digest);
        if (ev === null) bad(cid, `the lineage of ${label} names bytes ${digest.slice(0, 16)}… that no version of evidence ${evdId} carries`);
        const eg = evidenceGate(ev!, versions[0] ?? null, label);
        if (eg !== null) refuse(eg);
        evidenceRows.push(ev!);
        evidence.push({ object_id: evdId, version: num(ev!['object_version']), digest, byte_start: l['byte_start'] === null || l['byte_start'] === undefined ? null : num(l['byte_start']), byte_end: l['byte_end'] === null || l['byte_end'] === undefined ? null : num(l['byte_end']) });
      }
    } else {
      const cited = warningEntries.filter((e) => e['kind'] === 'evidence');
      if (cited.length === 0) bad(cid, `warning ${basis.id} cites no evidence; a memory record without provenance is not derived`);
      for (const e of cited) {
        const evdId = String(e['evidence_object_id'] ?? ''); const evdVersion = num(e['evidence_version']);
        const versions = await evdVersions(evdId);
        const ev = versions.find((r) => num(r['object_version']) === evdVersion);
        if (ev === undefined) bad(cid, `warning ${basis.id} cites evidence ${evdId}@${String(e['evidence_version'])} that this domain does not hold`);
        const eg = evidenceGate(ev!, versions[0] ?? null, label);
        if (eg !== null) refuse(eg);
        evidenceRows.push(ev!);
        // The bytes digest is the EVD PAYLOAD's content_digest (the canonical row's content_digest is the header digest — not the bytes).
        const evPayload = isObject(ev!['payload']) ? (ev!['payload'] as Row) : {};
        const bytesDigest = String(evPayload['content_digest'] ?? '');
        if (!/^[0-9a-f]{64}$/.test(bytesDigest)) bad(cid, `evidence ${evdId}@${evdVersion} carries no bytes digest; a memory record without provenance is not derived`);
        evidence.push({ object_id: evdId, version: evdVersion, digest: bytesDigest, byte_start: null, byte_end: null });
      }
    }

    // 4. THE CONTROLS FOLDED (D6) and THE CLEARANCE LINE (C1): the deriver's clearance here must cover what the record would carry — nothing is written otherwise.
    const declared = intake.audience.classification;
    const inherited = mostRestrictive([row['classification'] as string | null, ...evidenceRows.map((e) => e['classification'] as string | null)]);
    const applied = mostRestrictive([declared, inherited]);
    assertClearance(principal, { tenantId, domainId }, applied, 'derived memory record (its classification inherited from the basis and its evidence)', cid);
    const synthetic = anySynthetic([row['synthetic_state'] as boolean | null, ...evidenceRows.map((e) => e['synthetic_state'] as boolean | null)]);

    // 5. THE SOURCE CONTRACT — the first evidence row's provenance (SRC:<source_id>@<contract_version>); the others are named in evidence[] only.
    const first = evidenceRows[0]!; const firstPayload = isObject(first['payload']) ? (first['payload'] as Row) : {};
    const firstLabel = `${String(first['object_id'])}@${String(first['object_version'])}`;
    const ref = sourceRefOf(first['provenance_ref']);
    if (ref === null) bad(cid, `evidence ${firstLabel} names no source contract`);
    const contract = (await cap.readSourceContracts().selectAll().where('source_id' as never, '=', ref!.sourceId as never).where('contract_version' as never, '=', ref!.contractVersion as never).executeTakeFirst()) as Row | undefined;
    if (contract === undefined) bad(cid, `evidence ${firstLabel} names source ${ref!.sourceId}@${ref!.contractVersion}, which has no contract row here`);
    const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
    const source: DerivationSource = {
      source_id: String(contract!['source_id']), source_key: String(contract!['source_key'] ?? ''), contract_version: num(contract!['contract_version']),
      connector_kind: String(contract!['connector_kind'] ?? ''), media_type: str(firstPayload['media_type_declared']) ?? str(firstPayload['media_type_sniffed']) ?? null,
      authority_class: String(contract!['authority_class'] ?? ''), data_origin: String(contract!['data_origin'] ?? ''),
    };

    // 6. THE KIND RULE (D3): telemetry names a source with a REGISTERED SERIES; a warning's series is the one registered on its evidence's source.
    let seriesKeys: string[] = []; let indicator: Derivation['indicator'] = null;
    if (intake.sourceKind === 'telemetry') {
      if (kind === 'claim') {
        const series = (await cap.readSeriesRegistry().select(['series_key', 'source_key'] as never).where('source_key' as never, '=', source.source_key as never).orderBy('series_key' as never).execute()) as Row[];
        if (series.length === 0) bad(cid, `telemetry names a source with a registered series; ${source.source_key} has none`);
        seriesKeys = series.map((s) => String(s['series_key'])).slice(0, MEMORY_SERIES_KEYS_MAX);
      } else {
        const indicatorId = String(warning!['indicator_id'] ?? '');
        const ind = (await cap.readIndicators().selectAll().where('indicator_id' as never, '=', indicatorId as never).executeTakeFirst()) as Row | undefined;
        if (ind === undefined) bad(cid, `warning ${basis.id} names indicator ${indicatorId}, which this domain does not hold`);
        const seriesKey = String(ind!['series_key']);
        const reg = (await cap.readSeriesRegistry().selectAll().where('series_key' as never, '=', seriesKey as never).executeTakeFirst()) as Row | undefined;
        if (reg === undefined || String(reg['source_key']) !== source.source_key) bad(cid, `the warning\'s series ${seriesKey} is registered under ${reg === undefined ? 'no source' : String(reg['source_key'])}; its evidence is ${source.source_key}\'s`);
        seriesKeys = [seriesKey];
        const rule = warningEntries.find((e) => e['kind'] === 'indicator')?.['rule'];
        indicator = { indicator_id: indicatorId, series_key: seriesKey, rule: typeof rule === 'string' ? rule : null };
      }
    }

    // 7. THE STATEMENT (§2.4) and its digest — computed here, re-verified by the port.
    const eventTime = isoOr(row['event_time']);
    const statement = kind === 'claim' ? derivedStatementOf({ kind: 'claim', payload: rowPayload, eventTime }) : derivedStatementOf({ kind: 'warning', payload: rowPayload, row: warning! });
    if (statement.trim().length < 8) bad(cid, 'the basis yields no statement of at least 8 characters');
    const statementDigest = statementDigestOf(statement);

    // 8. THE HEADER the basis decides (D6; N-d: the clock quality travels with the event time).
    const rights = str(row['rights_profile']) ?? str(first['rights_profile']) ?? null;
    const residency = str(row['residency_profile']) ?? str(first['residency_profile']) ?? null;
    const retentionFrom: DeriveAnswer['inherited']['retention_from'] = intake.retention.profile !== null ? 'declared' : str(row['retention_profile']) !== null ? 'basis' : 'evidence';
    const retention = intake.retention.profile ?? str(row['retention_profile']) ?? str(first['retention_profile']) ?? null;
    if (retention === null) bad(cid, 'retention.profile is declared: neither the basis nor its evidence carries a retention profile');
    // A RE-DERIVATION keeps the record's validity when nothing is declared and the basis carries no event time: the prior version's
    // valid_from is the record's own (the supersession recomputes the statement on the new basis, not the record's world time).
    let validFrom = intake.validity.from ?? eventTime;
    let validFromSource: DeriveAnswer['inherited']['valid_from_source'] = intake.validity.from !== null ? 'declared' : 'basis';
    if (validFrom === null && a.action === 'memory.item.supersede' && a.version > 1) {
      const priorRow = (await cap.readCanonicalObjects().select(['valid_from' as never]).where('object_type' as never, '=', 'MEM' as never).where('object_id' as never, '=', a.itemId as never).where('object_version' as never, '=', (a.version - 1) as never).executeTakeFirst()) as Row | undefined;
      const priorFrom = priorRow?.['valid_from'];
      if (priorFrom !== null && priorFrom !== undefined) { validFrom = priorFrom instanceof Date ? priorFrom.toISOString() : String(priorFrom); validFromSource = 'prior'; }
    }
    if (validFrom === null) bad(cid, 'validity.from is declared: the basis carries no event time');
    const validTo = intake.validity.to;
    if (validTo !== null && validTo <= (validFrom as string)) bad(cid, 'validity.to is after validity.from');
    const provenanceRef = `${objectType}:${basis.id}@${basisVersion}`;
    const evidenceRefs = [provenanceRef, ...evidence.map((e) => `EVD:${e.object_id}@${e.version}`)];
    const sourceObjectIds = [...new Set([basis.id, ...evidence.map((e) => e.object_id)])];
    const clock = String(row['source_clock_quality'] ?? 'trusted');
    const sourceClockQuality: CanonicalHeader['source_clock_quality'] = clock === 'degraded' || clock === 'unknown' ? clock : 'trusted';
    const truth = String(row['truth_state']);

    // 9. THE DERIVATION BLOCK (memory.assert_derivation's shape).
    const derivation: Derivation = {
      basis: { kind, id: basis.id, version: basisVersion, content_digest: String(row['content_digest'] ?? ''), object_type: objectType },
      evidence, source, method_ref: MEMORY_DERIVE_METHOD, derived_at: new Date().toISOString(), statement_digest: statementDigest,
      truth_state_of_basis: truth, review_state_of_basis: reviewState,
      ...(seriesKeys.length > 0 ? { series_keys: seriesKeys } : {}), ...(indicator === null ? {} : { indicator }),
    };

    // 10. THE WRITE — the basis and its evidence cited first (the port adds them as dependency rows regardless); an extra cite equal to either is dropped.
    const own = new Set<string>([basis.id, ...evidence.map((e) => e.object_id)]);
    const cites: MemoryItemIntake['cites'] = [
      { kind, id: basis.id, version: basisVersion, rationale: `derived from ${label} by ${MEMORY_DERIVE_METHOD}` },
      ...evidence.map((e) => ({ kind: 'evidence' as const, id: e.object_id, version: e.version, rationale: `the evidence the basis rests on (bytes ${e.digest.slice(0, 16)}…)` })),
      ...intake.cites.filter((c) => !own.has(c.id)),
    ];
    const m: MemoryItemIntake = {
      recordClass: intake.recordClass, title: intake.title, statement,
      source: { kind: intake.sourceKind, ref: `${source.source_key}@${source.contract_version} · ${provenanceRef}` },
      audience: { classification: applied as MemoryItemIntake['audience']['classification'], roles: intake.audience.roles, purposes: intake.audience.purposes },
      validity: { from: validFrom as string, to: validTo }, retention: { profile: retention as string, retainUntil: intake.retention.retainUntil, basis: intake.retention.basis },
      cites, related: intake.related, supersession: intake.supersession,
    };
    const written = await this.write(cap, ctx, {
      itemId: a.itemId, version: a.version, intake: m, owner: a.owner, actor: a.actor, correlationId: cid, purposeId: a.purposeId,
      derived: { derivation, header: { truth_state: truth, synthetic_state: synthetic, classification: applied, rights_profile: rights, residency_profile: residency, event_time: eventTime, source_clock_quality: sourceClockQuality, evidence_refs: evidenceRefs, provenance_ref: provenanceRef, source_object_ids: sourceObjectIds } },
    });
    return {
      itemId: written.itemId, version: written.version, cites: written.cites, contentDigest: written.contentDigest, statement, statementDigest,
      basis: { kind, object_type: objectType, id: basis.id, version: basisVersion, content_digest: String(row['content_digest'] ?? ''), truth_state: truth, review_state: reviewState, event_time: eventTime },
      source, evidence, seriesKeys,
      classification: { declared, inherited, applied },
      inherited: { synthetic_state: synthetic, rights_profile: rights, residency_profile: residency, retention_profile: retention as string, retention_from: retentionFrom, valid_from: validFrom as string, valid_from_source: validFromSource },
      sourceKind: intake.sourceKind,
    };
  }

  /**
   * The item's CURRENT record from the metadata tier: the projection row (`index_state 'projected'` — the column's stored value is
   * ignored, D22) or, while the memory partition is WITHDRAWN (B20), the last valid state from the log through the shared fallback
   * reader (`index_state 'stale'`, `projected`, `from`, `drift`); a poisoned row — one the log does not know — is not served (null →
   * the route's 404 as an absent item). The source is decided by the caller from the projection block it read FIRST in its transaction.
   */
  async current(cap: GraphReads, itemId: string, opts?: MemoryReadOpts): Promise<Row | null> {
    if (opts?.withdrawn === true) {
      try { return (await memoryItemFromLog(cap, opts.scope, itemId)) ?? null; }
      catch (e) { throw MemoryService.withdrawnRefusal(e, opts); }
    }
    const row = ((await cap.readMemoryItems().selectAll().where('item_id' as never, '=', itemId as never).execute()) as Row[])[0];
    return row === undefined ? null : { ...row, index_state: 'projected' };
  }
  /** B21 (D1.3): the reader's ContentTierUnavailable → the withdrawn 503 when the caller said how to refuse; anything else (and a caller without `refusal`) rethrown unchanged. */
  private static withdrawnRefusal(e: unknown, opts: MemoryReadOpts): unknown {
    if (e instanceof ContentTierUnavailable && opts.refusal !== undefined) return refuseWithdrawnAndDown(opts.refusal.projection, opts.refusal.correlationId, `${e.statement}: ${e.detail}`);
    return e;
  }

  /**
   * RETRIEVE (OBJ-15): the version current at `asOf` (the record's replay), under the reader's authority now; the access
   * ledger row is written by the caller inside the same transaction once the read is authorised. B20 (D9): the metadata
   * tier is read first (the projection, or the log while the partition is withdrawn — `a.projection` says which); the
   * CONTENT tier (the canonical versions) is read under a savepoint at the fault point b20.memory_content_unavailable —
   * when it does not answer, the answer is METADATA-ONLY (MemoryMetadataOnly: no version, no access row, the ledger row
   * memory.retrieval_degraded) after the gates the metadata can carry (C7); a refused reader learns nothing from a consumed
   * fault point: the answer is the same 403 as with the content tier up (the purpose gate on the audience list), and the
   * point is spent — the next retrieval is served in full (C5).
   */
  async retrieve(cap: GraphReads & Pick<MemoryWrites, 'recordRetrievalDegraded'>, principal: AuthenticatedPrincipal, ctx: ScopeContext, a: { itemId: string; purpose: string; asOf: string | null; correlationId: string; projection?: ProjectionBlock }):
    Promise<MemoryRetrieval | null> {
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const withdrawn = a.projection?.withdrawn.includes('memory_items_current') ?? false;
    const item = await this.current(cap, a.itemId, { withdrawn, scope: { tenantId, domainId }, refusal: { projection: a.projection, correlationId: a.correlationId } });
    if (item === null) return null;
    // A WITHDRAWN item has left circulation (B10): its current reading is refused with the withdrawal named; every version it
    // ever had stays replayable AS OF an instant — the record is not rewritten by the withdrawal.
    if (String(item['state']) === 'withdrawn' && a.asOf === null) {
      throw new HttpException(errorBody('EYE_STA_003', a.correlationId, `memory item ${a.itemId} was withdrawn and is out of circulation; its versions stay replayable as of an instant (payload.asOf)`), 409);
    }
    const target = { tenantId: ctx.tenantId, domainId: ctx.domainId };
    const indexState = withdrawn ? 'stale' : 'projected';
    const projected = item['projected'] === false ? false : true;
    const drift = item['drift'] ?? null;
    // THE CONTENT TIER (B20, D9): the canonical versions, read under a savepoint so a failure of this ONE statement leaves the
    // transaction usable for the metadata-only answer and its ledger row. The fault point fires once (the retry serves the content).
    let versions: Row[] | null = null; let contentFailure: string | null = null;
    try {
      versions = await cap.withSavepoint('mem_content', async () => {
        at('b20.memory_content_unavailable');
        return (await cap.readCanonicalObjects().selectAll().where('object_id' as never, '=', a.itemId as never).where('object_type' as never, '=', 'MEM' as never)
          .orderBy('object_version' as never, 'desc').execute()) as Row[];
      });
    } catch (e) {
      contentFailure = contentFailureDetail(e);
      if (contentFailure === null) throw e;
    }
    if (contentFailure !== null) {
      // C7: while memory_items_current is WITHDRAWN nothing verified remains to gate a metadata answer on — refused (the one read B20 refuses).
      if (withdrawn) throw refuseWithdrawnAndDown(a.projection, a.correlationId, contentFailure);
      // C7: the purpose gate is the audience LIST alone — narrower, never wider: the admitted purpose (purpose_scope) is the canonical version's and cannot be checked while the content tier does not answer.
      const listed = (item['audience_purposes'] as string[] | null) ?? [];
      if (!listed.includes(a.purpose)) throw new HttpException(errorBody('EYE_AUT_001', a.correlationId, `a memory item is read under a purpose its audience declares (${listed.length > 0 ? listed.join(', ') : 'none declared'}); the admitted purpose cannot be checked while the content tier does not answer; this read states ${a.purpose}`), 403);
      assertClearance(principal, target, String(item['classification'] ?? 'internal'), 'memory item', a.correlationId);
      // the roles gate on the projection's audience roles, exactly as the served-version gate below
      const listedRoles = (item['audience_roles'] as string[] | null) ?? [];
      if (listedRoles.length > 0) {
        const mine = principal.bindings.filter((b) => bindingReaches(b, target)).map((b) => b.roleCode);
        const admin = mine.some((r) => r === 'platform_admin' || r === 'tenant_admin' || r === 'domain_admin');
        if (!admin && !listedRoles.some((r) => mine.includes(r))) throw new HttpException(errorBody('EYE_AUT_001', a.correlationId, `the memory item is for the audience ${listedRoles.join(', ')}; the reader holds none of these roles in this domain`), 403);
      }
      // The ledger row (memory.retrieval_degraded) — never an access row: nothing was served (memory.item_access requires the served version).
      await cap.recordRetrievalDegraded({ itemId: a.itemId, tenantId, domainId, version: Number(item['object_version']), purpose: a.purpose, reader: principal.principalId, cause: 'content_unavailable', detail: contentFailure, correlationId: a.correlationId });
      const availability: Row = {
        item_id: a.itemId, state: String(item['state']), current_version: Number(item['object_version']), versions: null,   // the count is the content tier's
        superseded_versions: Number(item['superseded_versions'] ?? 0), last_superseded_at: item['last_superseded_at'] instanceof Date ? (item['last_superseded_at'] as Date).toISOString() : item['last_superseded_at'] ?? null,
        attention_state: item['attention_state'] ?? null, served_is_current: null,
        basis_state: basisStateOf(item), source_kind: item['source_kind'] ?? null,
        index_state: indexState, projected, drift,
      };
      return { item: availability, version: null, versionServed: null, versions: null, asOf: a.asOf, availability, content: 'unavailable',
               degraded: { kind: 'content_unavailable', code: 'EYE-DEG-001', label: MEMORY_CONTENT_UNAVAILABLE_LABEL, detail: contentFailure } };
    }
    // Purpose: the one the item was admitted under, or one it declares for its audience.
    if (versions === null || versions.length === 0) return null;
    // The record instant is a Date under kysely (milliseconds kept); a string rendering would lose them and mis-serve a version.
    const instant = (v: unknown): number => v instanceof Date ? v.getTime() : new Date(String(v)).getTime();
    const served = a.asOf === null ? versions[0]! : versions.find((v) => instant(v['recorded_at']) <= new Date(a.asOf as string).getTime()) ?? null;
    if (served === null) return null; // nothing was recorded yet at that instant
    const admittedFor = String(served['purpose_scope'] ?? '');
    // The audience is the SERVED version's (a historical version keeps the audience its owner declared then), read from its
    // own payload; the current projection stands in only when the version carries none (B9 review).
    const servedPayload = (served['payload'] ?? {}) as Row;
    const servedAudience = (servedPayload['audience'] ?? {}) as Row;
    const purposes = (Array.isArray(servedAudience['purposes']) ? servedAudience['purposes'] as string[] : (item['audience_purposes'] as string[] | null)) ?? [];
    if (a.purpose !== admittedFor && !purposes.includes(a.purpose)) {
      throw new HttpException(errorBody('EYE_AUT_001', a.correlationId, `a memory item is read under the purpose it was admitted for (${admittedFor})${purposes.length > 0 ? ` or one it declares for its audience (${purposes.join(', ')})` : ''}; this read states ${a.purpose}`), 403);
    }
    assertClearance(principal, target, String(served['classification'] ?? 'internal'), 'memory item', a.correlationId);
    const roles = (Array.isArray(servedAudience['roles']) ? servedAudience['roles'] as string[] : (item['audience_roles'] as string[] | null)) ?? [];
    if (roles.length > 0) {
      const mine = principal.bindings.filter((b) => bindingReaches(b, target)).map((b) => b.roleCode);
      const admin = mine.some((r) => r === 'platform_admin' || r === 'tenant_admin' || r === 'domain_admin');
      if (!admin && !roles.some((r) => mine.includes(r))) throw new HttpException(errorBody('EYE_AUT_001', a.correlationId, `the memory item is for the audience ${roles.join(', ')}; the reader holds none of these roles in this domain`), 403);
    }
    // THE RESPONSE IS THE SERVED VERSION'S (B9-F1): its content, its header fields and its audience — nothing of any other
    // version. The current projection contributes AVAILABILITY only — the item's state, which version is current, how many
    // versions exist, when it was last superseded, its attention state and (B19) its source kind (the kind class of an item never
    // changes across its versions) and the state of a derived record's BASIS (null for a person's record; current / corrected /
    // withdrawn — served with the declaration, never refused for the basis's sake: D5) — never the current statement, source or
    // audience, which a reader authorised for a historical version is not authorised for. B19 adds to the served version the
    // header fields a derived record's reader is shown — its own synthetic state, event time, method, provenance, rights and
    // residency (a person's record: false / null / human-record@1.0.0 / principal:<owner> / null / null). The access recorded
    // names the served version. B20: `index_state` is COMPUTED from the partition state (D22: 'stale' while memory_items_current
    // is withdrawn, 'projected' otherwise); while withdrawn the current version, the superseded count, the last supersession and
    // the attention state are the LOG's (the fallback row carries them), `projected` says whether the projection holds the row and
    // `drift` names a state/version the projection and the log disagree on; `served_is_current` compares against the LOG's current
    // version then. The served version is chosen from the canonical rows as today: the content is the content tier's, never the projection's.
    const availability: Row = {
      item_id: a.itemId, state: String(item['state']), current_version: Number(item['object_version']), versions: versions.length,
      superseded_versions: Number(item['superseded_versions'] ?? 0), last_superseded_at: item['last_superseded_at'] instanceof Date ? (item['last_superseded_at'] as Date).toISOString() : item['last_superseded_at'] ?? null,
      attention_state: item['attention_state'] ?? null, served_is_current: Number(served['object_version']) === Number(item['object_version']),
      basis_state: basisStateOf(item), source_kind: item['source_kind'] ?? null,
      index_state: indexState, projected, drift,
    };
    const version: Row = {
      item_id: a.itemId, object_version: served['object_version'], recorded_at: served['recorded_at'] instanceof Date ? (served['recorded_at'] as Date).toISOString() : served['recorded_at'],
      lifecycle_state: served['lifecycle_state'], classification: served['classification'], purpose_scope: served['purpose_scope'], retention_profile: served['retention_profile'],
      valid_from: served['valid_from'], valid_to: served['valid_to'], truth_state: served['truth_state'], accountable_owner: served['accountable_owner'], supersedes: served['supersedes'],
      schema_ref: served['schema_ref'], content_digest: served['content_digest'] ?? null, payload: servedPayload,
      synthetic_state: served['synthetic_state'] === true, event_time: served['event_time'] instanceof Date ? (served['event_time'] as Date).toISOString() : served['event_time'] ?? null,
      method_ref: served['method_ref'] ?? null, provenance_ref: served['provenance_ref'] ?? null, rights_profile: served['rights_profile'] ?? null, residency_profile: served['residency_profile'] ?? null,
    };
    return { item: availability, version, versionServed: Number(served['object_version']), versions: versions.length, asOf: a.asOf, availability };
  }

  /**
   * The RECORD of an item without its content: the statement, the source reference and the related objects are a retrieval's
   * (purpose, audience, the access recorded) — never a listing's (B9 review). B19: a derived record's derivation is listed in
   * its record form — the basis (ids, version, digest), the source (key, contract version, connector kind), the method, the
   * instant, the series keys — no evidence digests or byte spans, no statement digest (those are the retrieval's): ids and
   * digests are exposed to every lister, content never.
   */
  static record(row: Row): Row {
    const { statement: _s, source_ref: _r, derivation, ...rest } = row;
    const d = isObject(derivation) ? (derivation as Row) : null;
    const src = d !== null && isObject(d['source']) ? (d['source'] as Row) : {};
    const listed = d === null ? null : { basis: d['basis'] ?? null, source: { source_key: src['source_key'] ?? null, contract_version: src['contract_version'] ?? null, connector_kind: src['connector_kind'] ?? null }, method_ref: d['method_ref'] ?? null, derived_at: d['derived_at'] ?? null, series_keys: d['series_keys'] ?? [] };
    return { ...rest, derivation: listed, content: 'retrieve under a declared purpose (memory.item.retrieve); the statement is not listed' };
  }
  /**
   * The listing (`record` of each row: no content). B20: from the projection (`index_state 'projected'`), or — while the memory
   * partition is withdrawn — the last valid state from the log through the fallback reader (each row `index_state 'stale'`, with
   * `projected`, `from` and `drift` kept on the listed row; a poisoned row absent).
   */
  async list(cap: GraphReads, limit = 200, opts?: MemoryReadOpts): Promise<Row[]> {
    let rows: Row[];
    if (opts?.withdrawn === true) {
      try { rows = await memoryItemsFromLog(cap, opts.scope, { limit }); }
      catch (e) { throw MemoryService.withdrawnRefusal(e, opts); }
    } else rows = ((await cap.readMemoryItems().selectAll().orderBy('recorded_at' as never, 'desc').limit(limit).execute()) as Row[]).map((r) => ({ ...r, index_state: 'projected' }));
    return rows.map((r) => MemoryService.record(r));
  }
  async events(cap: GraphReads, itemId: string): Promise<Row[]> {
    // An event's details may carry the version's content (the record and supersession events do): the record lists the event, not the content.
    return ((await cap.readMemoryItemEvents().selectAll().where('item_id' as never, '=', itemId as never).orderBy('occurred_at' as never).execute()) as Row[])
      .map((e) => { const d = (e['details'] ?? {}) as Row; const { statement: _s, source: _src, ...rest } = d; return { ...e, details: rest }; });
  }
  async accessHistory(cap: GraphReads, itemId: string): Promise<Row[]> {
    return (await cap.readMemoryItemAccess().selectAll().where('item_id' as never, '=', itemId as never).orderBy('accessed_at' as never).execute()) as Row[];
  }
  async dependencies(cap: GraphReads, itemId: string): Promise<Row[]> {
    return (await cap.readDependencies().selectAll().where('dependent_object_id' as never, '=', itemId as never).where('dependent_type' as never, '=', 'MEM' as never).execute()) as Row[];
  }

  /* B23 (0084) context */
  /**
   * L3-I02 RetrieveContext: ONE purpose-bound query about a SUBJECT. (1) The projection state of the context's three partitions
   * FIRST in the transaction (the revision, the verified sequence, the lag, the condition; the source decision). (2) The STABLE
   * query memory.retrieve_context under a savepoint at the content tier's fault point (b20.memory_content_unavailable — the same
   * boundary as a single retrieval): when the content tier does not answer, the item set is LEFT OUT whole and named (200 partial;
   * never the 503 a single retrieval answers while withdrawn and down; no access row, nothing served). (3) CLEARANCE and AUDIENCE
   * ROLES — the briefing's rule (briefing.service.ts): an item the reader may not read is dropped and neither counted nor
   * mentioned. (4) The route's limit. (5) ONE access row (and memory.retrieved event) per SERVED item version, in this transaction.
   * (6) The omissions and the product state (context.ts). The query writes nothing; (5) is the governance record of the read.
   * B23-F1 (0085): (3) is applied INSIDE the query as well — the reader's clearance, roles and administrator flag are its arguments —
   * so its diagnostics (the content-absent count, the scan-bound flag) are over the AUTHORIZED set; the filter here stays as defence
   * in depth (the same result). A log-sourced answer carries the constant CONTEXT_LOG_NOTE.
   */
  async context(cap: MemoryContextReads, principal: AuthenticatedPrincipal, ctx: ScopeContext, a: { purpose: string; subject: unknown; asOf: string | null; limit: number; correlationId: string }): Promise<MemoryContext> {
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const projection = await projectionStateOf(cap, CONTEXT_PARTITIONS);
    const memoryWithdrawn = projection.withdrawn.includes('memory_items_current');
    const head = { purpose: a.purpose, subject: a.subject, as_of: a.asOf, revision: projection.revision, verified_seq: projection.verified_seq, lag_events: projection.lag_events, condition: projection.condition };
    // CLEARANCE and AUDIENCE ROLES (the briefing's rule): administrators are admitted to every audience role (0066 §3).
    // B23-F1 (0085): read BEFORE the query — the query applies them itself, so every aggregate it answers is over the authorized set.
    const target = { tenantId, domainId };
    const clearance = clearanceOf(principal, target);
    const mine = principal.bindings.filter((b) => bindingReaches(b, target)).map((b) => b.roleCode);
    const admin = mine.some((r) => r === 'platform_admin' || r === 'tenant_admin' || r === 'domain_admin');
    const logNote = memoryWithdrawn ? CONTEXT_LOG_NOTE : null;
    let raw: Row | null = null; let contentFailure: string | null = null;
    try {
      raw = await cap.withSavepoint('mem_context', async () => {
        at('b20.memory_content_unavailable');
        return cap.retrieveContext({ tenantId, domainId, purpose: a.purpose, subject: a.subject, asOf: a.asOf, scanBound: CONTEXT_SCAN_BOUND, withdrawn: projection.withdrawn, clearance, roles: mine, admin });
      });
    } catch (e) {
      contentFailure = contentFailureDetail(e);
      if (contentFailure === null) throw e;   // a port refusal (22023 → 422), a connection-class failure, a programming error
    }
    if (raw === null) {
      const omitted: ContextOmission[] = [{ projection: 'content_tier', reason: contentUnavailableReason(contentFailure as string, memoryWithdrawn), rows: null }];
      return { ...head, ...productStateOf(projection, omitted), source: memoryWithdrawn ? 'log' : 'projection', items: [], omitted,
               policy: CONTEXT_POLICY_NOTE, consistency: CONTEXT_CONSISTENCY_NOTE, log_note: logNote, bound: { limit: a.limit, scan_bound: CONTEXT_SCAN_BOUND, truncated: false }, projection };
    }
    // Defence in depth (B23-F1): the query already applied the same clearance and audience rule; this filter gives the same result.
    const readable = ((raw['items'] ?? []) as Row[]).filter((it) => {
      if (!covers(clearance, String(it['classification'] ?? 'restricted'))) return false;
      const roles = (((it['audience'] ?? {}) as Row)['roles'] ?? []) as string[];
      return roles.length === 0 || admin || roles.some((r) => mine.includes(r));
    });
    const served = readable.slice(0, a.limit);
    const items: Row[] = [];
    for (const it of served) {
      const accessId = await cap.recordMemoryAccess({ itemId: String(it['item_id']), tenantId, domainId, version: Number(it['version']), purpose: a.purpose, reader: principal.principalId, asOf: a.asOf, correlationId: a.correlationId });
      items.push({ ...it, access_id: accessId });
    }
    // B23-F1 (0085): the query's diagnostics are over the authorized set (content_absent_rows; bounded); nothing else is read from it.
    const omitted = omissionsOf(projection, served, { content_absent_rows: raw['content_absent_rows'] });
    const source = String(raw['source'] ?? (memoryWithdrawn ? 'log' : 'projection')) as 'log' | 'projection';
    return { ...head, subject: raw['subject'] ?? a.subject, ...productStateOf(projection, omitted), source, items, omitted,
             policy: CONTEXT_POLICY_NOTE, consistency: CONTEXT_CONSISTENCY_NOTE, log_note: source === 'log' ? CONTEXT_LOG_NOTE : null,
             // truncated: the AUTHORIZED items exceed the route's limit, or the authorized scan bound was reached
             bound: { limit: a.limit, scan_bound: CONTEXT_SCAN_BOUND, truncated: readable.length > a.limit || raw['bounded'] === true }, projection };
  }
  /* end B23 context */
}

/* B23 (0084) context */
/** The context query's answer (L3-I02): what was asked, the watermark, the product state, the items served with their links, what was left out and why. */
export interface MemoryContext {
  purpose: string; subject: unknown; as_of: string | null;
  revision: number | null; verified_seq: number | null; lag_events: number; condition: ProjectionBlock['condition'];
  product_state: ContextProductState; code: 'EYE-DEG-001' | null; label: string | null;
  /** Where the items' availability came from: the projection, or the log while memory_items_current is withdrawn. */
  source: 'projection' | 'log';
  items: Row[]; omitted: ContextOmission[];
  policy: string; consistency: string;
  /** B23-F1 (0085): CONTEXT_LOG_NOTE on an answer served from the log (memory_items_current withdrawn); null otherwise. */
  log_note: string | null;
  bound: { limit: number; scan_bound: number; truncated: boolean };
  projection: ProjectionBlock;
}
/* end B23 context */
