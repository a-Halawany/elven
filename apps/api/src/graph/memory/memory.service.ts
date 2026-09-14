/**
 * THE ENTERPRISE MEMORY WORKSPACE (0066 §3; AU-MEM-0065 — V8 OBJ-14 record, OBJ-15 retrieve, OBJ-16 supersede;
 * PR-20-001/002; CAP-UM-07; V2:V02-T-118; V0:V00-T-039).
 *
 * A Memory item is an institutional or strategic record: a fact, decision rationale, commitment, outcome, lesson or
 * context a knowledge owner wants the organisation to remember, with its SOURCE (a person, a document, a communication,
 * telemetry), its AUDIENCE (classification, roles, purposes), its VALIDITY (world time) and its RETENTION (profile,
 * retain-until, basis). Every version is a canonical MEM object admitted through the same path as every canonical
 * object; the projection `memory.items_current` carries the current version; the prior version stays REPLAYABLE (a
 * known-at read serves the version that was current then, from `objects.canonical_objects`).
 *
 *   RECORD     — the knowledge owner (memory.item.record); cites become dependency rows so the correction impact set
 *                reaches the item (AU-MEM-0031): an item resting on corrected evidence, a corrected claim or a changed
 *                strategy object is marked `basis_corrected` for the owner's attention, never rewritten by a walk.
 *   RETRIEVE   — a purpose-authorised reader or agent (memory.item.retrieve): read-time authority is the reader's NOW —
 *                the declared purpose must be one the item is admitted for, the reader's clearance in this domain must
 *                cover the item's classification, and an audience of roles (when declared) must include one of the
 *                reader's roles here; the access is a ledger row inside the read's own transaction (who, which version,
 *                under which purpose, authorised by which policy decision, as of when). Nothing is mutated.
 *   SUPERSEDE  — the record authority (memory.item.supersede, human-gated): the next version with its reason and
 *                effective time; the prior version's canonical row is untouched and named by the successor.
 *   WITHDRAW   — the record authority: the item leaves circulation; every version stays replayable.
 *
 * Retrieval frequency, similarity or annotation never make a memory item organisational truth (DP-37-003): a record's
 * truth state is what its owner asserted (human) or what telemetry observed, and stays so until superseded.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { validateHeader, canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { ScopeContext } from '../../shared/scope.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { assertClearance, bindingReaches } from '../../shared/clearance.js';
import type { GraphReads, MemoryWrites } from '../graph.capabilities.js';

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

const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const isoOrNull = (v: unknown, what: string, correlationId: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) bad(correlationId, `${what} is not an instant`);
  return d.toISOString();
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateMemoryItem(p: Row, correlationId: string, forSupersession: boolean): MemoryItemIntake {
  const recordClass = String(p['recordClass'] ?? '');
  if (!(MEMORY_RECORD_CLASSES as readonly string[]).includes(recordClass)) bad(correlationId, `recordClass is one of ${MEMORY_RECORD_CLASSES.join(', ')}`);
  const title = String(p['title'] ?? '').trim();
  if (title.length < 3 || title.length > 200) bad(correlationId, 'title is 3–200 characters');
  const statement = String(p['statement'] ?? '').trim();
  if (statement.length < 8) bad(correlationId, 'statement is at least 8 characters');
  const src = (p['source'] ?? {}) as Row;
  const sourceKind = String(src['kind'] ?? '');
  if (!(MEMORY_SOURCE_KINDS as readonly string[]).includes(sourceKind)) bad(correlationId, `source.kind is one of ${MEMORY_SOURCE_KINDS.join(', ')}`);
  const aud = (p['audience'] ?? {}) as Row;
  const classification = String(aud['classification'] ?? '');
  if (!(MEMORY_CLASSIFICATIONS as readonly string[]).includes(classification)) bad(correlationId, `audience.classification is one of ${MEMORY_CLASSIFICATIONS.join(', ')}`);
  const roles = Array.isArray(aud['roles']) ? (aud['roles'] as unknown[]).map(String) : [];
  const purposes = Array.isArray(aud['purposes']) ? (aud['purposes'] as unknown[]).map(String) : [];
  const val = (p['validity'] ?? {}) as Row;
  const from = isoOrNull(val['from'], 'validity.from', correlationId);
  if (from === null) bad(correlationId, 'validity.from is declared (the world time the record holds from)');
  const to = isoOrNull(val['to'], 'validity.to', correlationId);
  if (to !== null && to <= (from as string)) bad(correlationId, 'validity.to is after validity.from');
  const ret = (p['retention'] ?? {}) as Row;
  const profile = String(ret['profile'] ?? '').trim();
  if (profile.length === 0) bad(correlationId, 'retention.profile is declared at record time (OBJ-14)');
  const cites = Array.isArray(p['cites']) ? (p['cites'] as Row[]) : [];
  const parsed = cites.map((c) => {
    const kind = String(c['kind'] ?? '');
    if (!(MEMORY_CITE_KINDS as readonly string[]).includes(kind)) bad(correlationId, `cites[].kind is one of ${MEMORY_CITE_KINDS.join(', ')}`);
    const id = String(c['id'] ?? '');
    if (!UUID.test(id)) bad(correlationId, 'cites[].id is an object id');
    const rationale = String(c['rationale'] ?? '').trim();
    if (rationale.length < 8) bad(correlationId, 'cites[].rationale is at least 8 characters');
    const version = c['version'] === undefined || c['version'] === null ? null : Number(c['version']);
    return { kind: kind as MemoryItemIntake['cites'][number]['kind'], id, version, rationale };
  });
  const rel = (p['related'] ?? {}) as Row;
  const decisionId = rel['decisionId'] === undefined || rel['decisionId'] === null ? null : String(rel['decisionId']);
  const objectiveId = rel['objectiveId'] === undefined || rel['objectiveId'] === null ? null : String(rel['objectiveId']);
  if (decisionId !== null && !UUID.test(decisionId)) bad(correlationId, 'related.decisionId is an object id');
  if (objectiveId !== null && !UUID.test(objectiveId)) bad(correlationId, 'related.objectiveId is an object id');
  let supersession: MemoryItemIntake['supersession'] = null;
  if (forSupersession) {
    const sup = (p['supersession'] ?? {}) as Row;
    const reason = String(sup['reason'] ?? '').trim();
    if (reason.length < 8) bad(correlationId, 'supersession.reason is at least 8 characters (OBJ-16)');
    supersession = { reason, effectiveAt: isoOrNull(sup['effectiveAt'], 'supersession.effectiveAt', correlationId) };
  }
  return {
    recordClass: recordClass as MemoryItemIntake['recordClass'], title, statement,
    source: { kind: sourceKind as MemoryItemIntake['source']['kind'], ref: src['ref'] === undefined || src['ref'] === null ? null : String(src['ref']) },
    audience: { classification: classification as MemoryItemIntake['audience']['classification'], roles, purposes },
    validity: { from: from as string, to }, retention: { profile, retainUntil: isoOrNull(ret['retainUntil'], 'retention.retainUntil', correlationId), basis: ret['basis'] === undefined || ret['basis'] === null ? null : String(ret['basis']) },
    cites: parsed, related: { decisionId, objectiveId }, supersession,
  };
}

@Injectable()
export class MemoryService {
  /** Record (version 1) or supersede (version n+1): the canonical MEM version and the projection, in one transaction. */
  async write(cap: MemoryWrites, ctx: ScopeContext, a: { itemId: string; version: number; intake: MemoryItemIntake; owner: string; actor: string; correlationId: string; purposeId: string }): Promise<{ itemId: string; version: number; cites: number; contentDigest: string }> {
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const m = a.intake; const now = new Date().toISOString();
    const payload = {
      record_class: m.recordClass, title: m.title, statement: m.statement,
      source: { kind: m.source.kind, ref: m.source.ref },
      audience: { classification: m.audience.classification, roles: m.audience.roles, purposes: m.audience.purposes },
      validity: { from: m.validity.from, to: m.validity.to },
      retention: { profile: m.retention.profile, retain_until: m.retention.retainUntil, basis: m.retention.basis },
      cites: m.cites.map((c) => ({ kind: c.kind, id: c.id, version: c.version, rationale: c.rationale })),
      related: { decision_id: m.related.decisionId, objective_id: m.related.objectiveId },
      ...(m.supersession === null ? {} : { supersession: { reason: m.supersession.reason, effective_at: m.supersession.effectiveAt } }),
    };
    const prior = a.version > 1 ? `MEM:${a.itemId}@${a.version - 1}` : null;
    const header: CanonicalHeader = {
      object_id: a.itemId, object_type: 'MEM', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: String(a.version), lifecycle_state: 'active', owning_component: 'CP-MEM-01', accountable_owner: `principal:${a.owner}`,
      source_object_ids: m.cites.filter((c) => c.kind === 'evidence' || c.kind === 'claim').map((c) => c.id),
      event_time: null, observation_time: now, valid_from: m.validity.from, valid_to: m.validity.to, recorded_at: now,
      time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: m.source.kind === 'telemetry' ? 'observed' : 'asserted', synthetic_state: false, confidence: null, uncertainty: null,
      evidence_refs: m.cites.map((c) => `${c.kind}:${c.id}`), provenance_ref: `principal:${a.owner}`, method_ref: 'human-record@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${a.owner}`],
      classification: m.audience.classification, purpose_scope: a.purposeId, rights_profile: null, residency_profile: null,
      retention_profile: m.retention.profile, access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null,
      schema_ref: 'MEM@v1', ontology_ref: null, correction_of: null, supersedes: prior, withdrawal_reason: null,
      audit_correlation_id: a.correlationId, content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', a.correlationId, `memory item header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    const admitted = await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.recordMemoryItem({
      itemId: a.itemId, tenantId, domainId, version: a.version,
      record: {
        record_class: m.recordClass, title: m.title, statement: m.statement, source_kind: m.source.kind, source_ref: m.source.ref,
        owner_principal_id: a.owner, classification: m.audience.classification, audience_roles: m.audience.roles, audience_purposes: m.audience.purposes,
        valid_from: m.validity.from, valid_to: m.validity.to, retention_profile: m.retention.profile, retain_until: m.retention.retainUntil, retention_basis: m.retention.basis,
        related_decision_id: m.related.decisionId, related_objective_id: m.related.objectiveId,
        ...(m.supersession === null ? {} : { supersession: { reason: m.supersession.reason, effective_at: m.supersession.effectiveAt } }),
      },
      cites: m.cites.map((c) => ({ kind: c.kind, id: c.id, rationale: c.rationale })),
      actor: a.actor, eventId: newId(), correlationId: a.correlationId,
    });
    return { itemId: a.itemId, version: a.version, cites: m.cites.length, contentDigest: admitted.contentDigest };
  }

  async current(cap: GraphReads, itemId: string): Promise<Row | null> {
    return ((await cap.readMemoryItems().selectAll().where('item_id' as never, '=', itemId as never).execute()) as Row[])[0] ?? null;
  }

  /**
   * RETRIEVE (OBJ-15): the version current at `asOf` (the record's replay), under the reader's authority now; the access
   * ledger row is written by the caller inside the same transaction once the read is authorised.
   */
  async retrieve(cap: GraphReads, principal: AuthenticatedPrincipal, ctx: ScopeContext, a: { itemId: string; purpose: string; asOf: string | null; correlationId: string }):
    Promise<{ item: Row; version: Row; versionServed: number; versions: number; asOf: string | null; availability: Row } | null> {
    const item = await this.current(cap, a.itemId);
    if (item === null) return null;
    // A WITHDRAWN item has left circulation (B10): its current reading is refused with the withdrawal named; every version it
    // ever had stays replayable AS OF an instant — the record is not rewritten by the withdrawal.
    if (String(item['state']) === 'withdrawn' && a.asOf === null) {
      throw new HttpException(errorBody('EYE_STA_003', a.correlationId, `memory item ${a.itemId} was withdrawn and is out of circulation; its versions stay replayable as of an instant (payload.asOf)`), 409);
    }
    const target = { tenantId: ctx.tenantId, domainId: ctx.domainId };
    // Purpose: the one the item was admitted under, or one it declares for its audience.
    const versions = (await cap.readCanonicalObjects().selectAll().where('object_id' as never, '=', a.itemId as never).where('object_type' as never, '=', 'MEM' as never)
      .orderBy('object_version' as never, 'desc').execute()) as Row[];
    if (versions.length === 0) return null;
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
    // versions exist, when it was last superseded, its attention state — never the current statement, source or audience,
    // which a reader authorised for a historical version is not authorised for. The access recorded names the served version.
    const availability: Row = {
      item_id: a.itemId, state: String(item['state']), current_version: Number(item['object_version']), versions: versions.length,
      superseded_versions: Number(item['superseded_versions'] ?? 0), last_superseded_at: item['last_superseded_at'] instanceof Date ? (item['last_superseded_at'] as Date).toISOString() : item['last_superseded_at'] ?? null,
      attention_state: item['attention_state'] ?? null, served_is_current: Number(served['object_version']) === Number(item['object_version']),
    };
    const version: Row = {
      item_id: a.itemId, object_version: served['object_version'], recorded_at: served['recorded_at'] instanceof Date ? (served['recorded_at'] as Date).toISOString() : served['recorded_at'],
      lifecycle_state: served['lifecycle_state'], classification: served['classification'], purpose_scope: served['purpose_scope'], retention_profile: served['retention_profile'],
      valid_from: served['valid_from'], valid_to: served['valid_to'], truth_state: served['truth_state'], accountable_owner: served['accountable_owner'], supersedes: served['supersedes'],
      schema_ref: served['schema_ref'], content_digest: served['content_digest'] ?? null, payload: servedPayload,
    };
    return { item: availability, version, versionServed: Number(served['object_version']), versions: versions.length, asOf: a.asOf, availability };
  }

  /** The RECORD of an item without its content: the statement, the source reference and the related objects are a retrieval's (purpose, audience, the access recorded) — never a listing's (B9 review). */
  static record(row: Row): Row {
    const { statement: _s, source_ref: _r, ...rest } = row;
    return { ...rest, content: 'retrieve under a declared purpose (memory.item.retrieve); the statement is not listed' };
  }
  async list(cap: GraphReads, limit = 200): Promise<Row[]> {
    return ((await cap.readMemoryItems().selectAll().orderBy('recorded_at' as never, 'desc').limit(limit).execute()) as Row[]).map((r) => MemoryService.record(r));
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
}
