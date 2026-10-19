/**
 * B50 §HD (migration 0120 §HD; F-P3-01: V03-T-051, V03-T-052, V00-T-076, ES-05-001, ES-26-001/-004, ADR-0003) — THE SHARED HEADER BUILDER.
 *
 * Every canonical header a writer admits is built HERE: the writer states what it knows (camelCase, one key per header field); the builder
 * owns the 43-field shape and fills, for a NEW version, what the writer leaves unstated — never with a bare null where the canonical model
 * asks for a statement (DESIGN D3):
 *   confidence / uncertainty / quality_state   a DECLARED ABSENCE {state: not_assessed | not_applicable | unknown, reason} when the writer has
 *                                              no value (the type's header profile or the builder's rule names the reason);
 *   freshness_state                            the age at write, computed from the version's own event / observation time (or a declared absence);
 *   ontology_ref                               `ontology:none` until B51 binds the domain's active ontology (the side ledger records which exists);
 *   quality_profile                            the type's header profile (`quality:<TYPE>@<profile version>`);
 *   provenance_ref                             `none:<reason>` when the version's provenance is its references alone.
 * The CONTROL profiles (rights / residency / retention / access_policy_ref) are inherited when the writer hands the builder its chain
 * (source contract → evidence → parent; DESIGN D3) and are otherwise carried exactly as the writer states them — a null there is load-bearing
 * (B36's residency gate on an external publication, the controls fold, the PUB controls equality), so the builder never stamps the domain's
 * profile into the header: `objects.admit_version` records each control field's basis — and the domain profile that governs a null — in the
 * side ledger `objects.version_operations.header_basis` (0120 §HD.4), in the same transaction.
 *
 * NO HEADER FIELD IS ADDED (DESIGN D2): the 43-field registry and `canonicalHeaderDigest` are unchanged, and an old version keeps its digest —
 * only what a NEW version carries changes. Mode `verbatim` (the governed import, which carries the origin's header) copies every stated field.
 *
 * THE RATCHET (test/unit/header-builder-b50.test.ts): no object literal outside this file names `owning_component`, `accountable_owner` or
 * `audit_correlation_id`, and none is typed or asserted `CanonicalHeader` — a writer reaches the header only through `buildHeader`.
 *
 * CONSTRUCTION only: this module and its unit tests; the act's demonstration is SYNTHETIC; no acceptance is claimed.
 */
import {
  HEADER_TIME_PRECISIONS,
  headerInstantOf,
  timeValueProblems,
  type CanonicalHeader,
  type TimeAxis,
  type TimeValue,
} from '@eye/contracts';
import type { DeclaredAbsence, UseKind } from './b50-seams.js';

type Json = Record<string, unknown>;
type Clock = CanonicalHeader['source_clock_quality'];

/** What a writer states: one camelCase key per header field. Arrays default to [], nullable fields to null (then stated by the rules). */
export interface HeaderSpec {
  objectId: string; objectType: string;
  tenantId: string | null; domainId: string | null; scope: CanonicalHeader['scope'];
  objectVersion: string | number; lifecycleState: string;
  owningComponent: string; accountableOwner: string;
  sourceObjectIds?: string[];
  eventTime?: string | null; observationTime?: string | null; validFrom?: string | null; validTo?: string | null;
  recordedAt: string; timePrecision?: string; sourceClockQuality?: Clock;
  truthState: string; syntheticState: boolean;
  confidence?: Json | null; uncertainty?: Json | null;
  evidenceRefs?: string[]; provenanceRef?: string | null; methodRef?: string | null;
  contradictionRefs?: string[]; corroborationRefs?: string[]; humanRefs?: string[];
  classification: string; purposeScope: string;
  rightsProfile?: string | null; residencyProfile?: string | null; retentionProfile?: string | null; accessPolicyRef?: string | null;
  qualityProfile?: string | null; qualityState?: Json | null; freshnessState?: Json | null;
  schemaRef: string; ontologyRef?: string | null;
  correctionOf?: string | null; supersedes?: string | null; withdrawalReason?: string | null;
  auditCorrelationId: string; contentRef?: string | null;
}

/** The controls a writer may hand the builder to inherit from (DESIGN D3's chain, in order). */
export interface ControlSet { rights_profile?: unknown; residency_profile?: unknown; retention_profile?: unknown; access_policy_ref?: unknown }
export interface InheritanceChain { sourceContract?: ControlSet | null; evidence?: ControlSet[]; parent?: ControlSet | null }

export type StatedField = 'confidence' | 'uncertainty' | 'quality_state' | 'freshness_state' | 'provenance_ref';
export interface BuildOptions {
  /** 'state' (the default): a new version's unstated fields are stated by the rules above. 'verbatim': every field as given (the import). */
  mode?: 'state' | 'verbatim';
  /** The writer's own reasons for an absence (they win over the profile's and the builder's). */
  absent?: Partial<Record<StatedField, DeclaredAbsence>>;
  /** Inherit the control profiles the spec leaves UNDEFINED (an explicit null is the writer's statement and is kept). */
  inherit?: InheritanceChain;
  /** A stated time per axis (ES-26-004): its header instant and precision are placed when the spec leaves them undefined, and checked otherwise. */
  time?: Partial<Record<TimeAxis, TimeValue>>;
}

export class HeaderBuildError extends Error {
  constructor(readonly problems: string[]) { super(`header rejected: ${problems.join('; ')}`); this.name = 'HeaderBuildError'; }
}

/* ───────────────────────────── THE HEADER PROFILES (the TS mirror of objects.header_profiles; the harness asserts they agree) ───────────────────────────── */

export const HEADER_PROFILE_VERSION = 1;
/** Every use's base: the identity / control fields the owning component always states (NOT NULL in the store — never missing on a recorded row). */
export const BASE_MANDATORY = ['accountable_owner', 'owning_component', 'classification', 'purpose_scope', 'schema_ref', 'truth_state', 'recorded_at'] as const;
/** The fields B50 states on every NEW version; a version recorded before B50 is "recorded before B50 — not populated" for them (no back-fill). */
export const B50_STATED_FIELDS = ['confidence', 'uncertainty', 'quality_state', 'freshness_state', 'ontology_ref', 'quality_profile', 'provenance_ref'] as const;
/** The trust envelope (V00-T-076): identity, tenant, owner, source, time, truth, confidence/uncertainty, sensitivity, expiry, known limitations. */
export const TRUST_ENVELOPE = ['object_id', 'tenant_id', 'accountable_owner', 'source_object_ids', 'recorded_at', 'truth_state', 'confidence', 'uncertainty',
  'classification', 'rights_profile', 'valid_to', 'retention_profile', 'quality_state'] as const;

export interface HeaderProfileDef {
  /** The owning component that ISSUES the type's identities (ES-25-002), and the port family it issues them through. */
  issuingAuthority: string; issuedThrough: string;
  /** Fields mandatory per decision-active use, beyond BASE_MANDATORY (checked by objects._header_usable before the use). */
  mandatory: Partial<Record<UseKind, string[]>>;
  /** jsonb fields that must carry a VALUE for a decision-active use — a declared absence (not_assessed / unknown) does not satisfy them. */
  valueRequired: string[];
  /** The type's own reasons for an absence, where the builder's rule would say less. */
  absence?: Partial<Record<'confidence' | 'uncertainty', DeclaredAbsence>>;
}

const ALL_USES = (fields: string[]): Partial<Record<UseKind, string[]>> => ({ decision_option: fields, publication: fields, export: fields, gate: fields });
const P = (issuingAuthority: string, issuedThrough: string, mandatory: Partial<Record<UseKind, string[]>> = {}, valueRequired: string[] = [],
           absence?: HeaderProfileDef['absence']): HeaderProfileDef => ({ issuingAuthority, issuedThrough, mandatory, valueRequired, ...(absence === undefined ? {} : { absence }) });

/** One profile per registered object type (objects.schema_registry, 36 types / 53 schema rows at 0120). */
export const HEADER_PROFILES: Readonly<Record<string, HeaderProfileDef>> = Object.freeze({
  APR: P('CP-DEC-01', 'decision.approval'),
  ASM: P('CP-INT-01', 'intelligence.extraction'),
  ASU: P('CP-GRA-01', 'graph.strategy', ALL_USES(['provenance_ref', 'method_ref'])),
  BRF: P('CP-EXE-01', 'executive.briefing.compose', { publication: ['provenance_ref', 'method_ref'] }),
  CAP: P('CP-GRA-01', 'graph.strategy'),
  CLM: P('CP-INT-01', 'intelligence.extraction / intelligence.review', ALL_USES(['confidence', 'provenance_ref', 'method_ref']), ['confidence']),
  CMT: P('CP-DEC-01', 'decision.commitment'),
  CPF: P('CP-DOM-CI', 'domain.competitor'),
  DAS: P('CP-DOM-PKG', 'domain.assessment'),
  DEC: P('CP-GRA-01', 'graph.strategy'),
  DPG: P('CP-DOM-PKG', 'domain.package'),
  DPK: P('CP-DEC-01', 'decision.package', { publication: ['provenance_ref', 'method_ref'] }),
  DPR: P('CP-DAT-01', 'products.release'),
  ENT: P('CP-INT-01', 'intelligence.extraction'),
  EVD: P('CP-OBS-01', 'observation.acquisition / observation.quarantine.release', ALL_USES(['provenance_ref', 'content_ref'])),
  EVT: P('CP-INT-01', 'intelligence.extraction'),
  FCT: P('CP-PRD-01', 'prediction.forecast', ALL_USES(['uncertainty', 'method_ref', 'valid_from', 'valid_to']), ['uncertainty'],
         { confidence: { state: 'not_applicable', reason: 'a quantile forecast states its uncertainty (q10 / q50 / q90), not a confidence' } }),
  INI: P('CP-GRA-01', 'graph.strategy'),
  MEM: P('CP-MEM-01', 'memory.item.record / memory.item.derive'),
  MET: P('CP-DAT-01', 'products.metric.certify'),
  MSR: P('CP-GRA-01', 'graph.strategy'),
  OBJ: P('CP-GRA-01', 'graph.strategy'),
  OBS: P('CP-OBS-01', 'observation.acquisition / observation.quarantine.release'),
  OUT: P('CP-DEC-01', 'decision.monitoring'),
  PLN: P('CP-EXE-01', 'executive.plan'),
  PUB: P('CP-EXE-01', 'executive.publication.approve'),
  REL: P('CP-INT-01', 'intelligence.extraction'),
  RPL: P('CP-DEC-01', 'decision.replay'),
  RSC: P('CP-GRA-01', 'graph.strategy'),
  RSK: P('CP-GRA-01', 'graph.strategy'),
  SCN: P('CP-PRD-01', 'prediction.scenario'),
  SIM: P('CP-SIM-01', 'simulation.run', ALL_USES(['method_ref', 'provenance_ref'])),
  SRC: P('CP-OBS-01', 'observation.source.register'),
  STK: P('CP-GRA-01', 'graph.strategy'),
  TWN: P('CP-TWN-01', 'twin.version'),
  WRN: P('CP-PRD-01', 'prediction.warning', ALL_USES(['confidence', 'valid_from', 'valid_to', 'method_ref']), ['confidence']),
});

export const qualityProfileOf = (type: string): string => `quality:${type}@${HEADER_PROFILE_VERSION}`;

/** The profile row as objects.header_profiles stores it (the harness compares this with the table). */
export function profileRow(type: string): { object_type: string; profile_version: number; issuing_authority: string; issued_through: string;
  quality_profile: string; mandatory: Record<UseKind, string[]>; value_required: string[]; envelope: string[]; absence: Json } {
  const p = HEADER_PROFILES[type];
  if (p === undefined) throw new Error(`no header profile for ${type}`);
  const uses: UseKind[] = ['decision_option', 'publication', 'export', 'gate'];
  const mandatory = Object.fromEntries(uses.map((u) => [u, [...BASE_MANDATORY, ...(p.mandatory[u] ?? [])]])) as Record<UseKind, string[]>;
  return { object_type: type, profile_version: HEADER_PROFILE_VERSION, issuing_authority: p.issuingAuthority, issued_through: p.issuedThrough,
           quality_profile: qualityProfileOf(type), mandatory, value_required: [...p.valueRequired], envelope: [...TRUST_ENVELOPE], absence: { ...(p.absence ?? {}) } };
}

/* ───────────────────────────── THE RULES ───────────────────────────── */

const HUMAN_RECORD_TYPES = new Set(['APR', 'CAP', 'CMT', 'CPF', 'DAS', 'DEC', 'DPG', 'DPK', 'DPR', 'INI', 'MET', 'MSR', 'OBJ', 'OUT', 'PLN', 'PUB', 'RPL', 'RSC', 'RSK', 'SRC', 'STK', 'BRF', 'MEM', 'ASU', 'SCN']);

/** The builder's rule for an absent confidence / uncertainty / quality_state when neither the writer nor the profile names a reason. */
export function defaultAbsence(field: 'confidence' | 'uncertainty' | 'quality_state', h: Pick<CanonicalHeader, 'object_type' | 'truth_state' | 'owning_component'>): DeclaredAbsence {
  const t = h.object_type; const truth = h.truth_state; const by = h.owning_component;
  if (field === 'quality_state') {
    return { state: 'not_assessed', reason: `${by} records no quality assessment of ${t} at write; continuous quality monitoring is B101's` };
  }
  if (truth === 'withdrawn') return { state: 'not_applicable', reason: `a withdrawn version states no ${field}; its predecessor's ${field} stands in its history` };
  if (truth === 'observed') {
    return field === 'confidence'
      ? { state: 'not_applicable', reason: 'an observation records what was received; confidence attaches to the claims extracted from it' }
      : { state: 'not_applicable', reason: 'an observation states no estimate, so it carries no uncertainty' };
  }
  if (truth === 'synthetic') return { state: 'not_applicable', reason: `a synthetic result states its validation and envelope in its quality state, not a ${field}` };
  if (truth === 'decided' || (truth === 'asserted' && HUMAN_RECORD_TYPES.has(t))) {
    return { state: 'not_applicable', reason: `a recorded ${truth === 'decided' ? 'decision' : 'declaration'} (${t}) carries no epistemic ${field}` };
  }
  return { state: 'not_assessed', reason: `${by} does not assess ${field} for ${t}` };
}

/** Freshness at write: the age of the version's own event (or observation) time at its record time — or why there is none. */
export function freshnessAtWrite(h: Pick<CanonicalHeader, 'event_time' | 'observation_time' | 'recorded_at' | 'object_type'>): Json {
  const basis = h.event_time !== null ? 'event_time' : h.observation_time !== null ? 'observation_time' : null;
  if (basis === null) return { state: 'not_applicable', reason: `${h.object_type} states no event or observation time; its age is its record time` };
  const at = (basis === 'event_time' ? h.event_time : h.observation_time) as string;
  const age = Math.round((Date.parse(h.recorded_at) - Date.parse(at)) / 1000);
  if (age < 0) return { state: 'not_applicable', reason: `the ${basis.replace('_', ' ')} is after the record time (a stated future time); an age is not defined` };
  return { state: 'assessed', method: 'header-age@1', basis, at, as_of: h.recorded_at, age_seconds: age };
}

const isAbsence = (v: unknown): boolean =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && ['not_assessed', 'not_applicable', 'unknown'].includes(String((v as Json)['state'])) && typeof (v as Json)['reason'] === 'string';

function checkAbsence(field: string, a: DeclaredAbsence): DeclaredAbsence {
  if (!['not_assessed', 'not_applicable', 'unknown'].includes(a.state)) throw new HeaderBuildError([`${field}: an absence's state is not_assessed, not_applicable or unknown`]);
  if (typeof a.reason !== 'string' || a.reason.trim().length < 8 || a.reason.length > 500) throw new HeaderBuildError([`${field}: an absence states its reason (8–500 characters)`]);
  return { state: a.state, reason: a.reason.trim() };
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
function inheritOne(field: keyof ControlSet, chain: InheritanceChain): string | null {
  const fromContract = str(chain.sourceContract?.[field]);
  if (fromContract !== null) return fromContract;
  const ev = [...new Set((chain.evidence ?? []).map((e) => str(e[field])).filter((x): x is string => x !== null))].sort();
  if (ev.length > 0) return ev.join('; ');
  return str(chain.parent?.[field]);
}

const iso = (s: string | null | undefined): string | null => (s === null || s === undefined ? null : new Date(s).toISOString());
const AXIS_FIELD: Partial<Record<TimeAxis, 'event_time' | 'observation_time' | 'valid_from' | 'valid_to'>> = {
  event: 'event_time', observation: 'observation_time', valid_from: 'valid_from', valid_to: 'valid_to',
};

/* ───────────────────────────── THE BUILDER ───────────────────────────── */

export function buildHeader(spec: HeaderSpec, opts: BuildOptions = {}): CanonicalHeader {
  const verbatim = opts.mode === 'verbatim';
  const h: CanonicalHeader = {
    object_id: spec.objectId, object_type: spec.objectType, tenant_id: spec.tenantId, domain_id: spec.domainId, scope: spec.scope,
    object_version: String(spec.objectVersion), lifecycle_state: spec.lifecycleState,
    owning_component: spec.owningComponent, accountable_owner: spec.accountableOwner, source_object_ids: spec.sourceObjectIds ?? [],
    event_time: spec.eventTime ?? null, observation_time: spec.observationTime ?? null, valid_from: spec.validFrom ?? null, valid_to: spec.validTo ?? null,
    recorded_at: spec.recordedAt, time_precision: spec.timePrecision ?? 'exact', source_clock_quality: spec.sourceClockQuality ?? 'trusted',
    truth_state: spec.truthState, synthetic_state: spec.syntheticState,
    confidence: spec.confidence ?? null, uncertainty: spec.uncertainty ?? null,
    evidence_refs: spec.evidenceRefs ?? [], provenance_ref: spec.provenanceRef ?? null, method_ref: spec.methodRef ?? null,
    contradiction_refs: spec.contradictionRefs ?? [], corroboration_refs: spec.corroborationRefs ?? [], human_refs: spec.humanRefs ?? [],
    classification: spec.classification, purpose_scope: spec.purposeScope,
    rights_profile: spec.rightsProfile ?? null, residency_profile: spec.residencyProfile ?? null,
    retention_profile: spec.retentionProfile ?? null, access_policy_ref: spec.accessPolicyRef ?? null,
    quality_profile: spec.qualityProfile ?? null, quality_state: spec.qualityState ?? null, freshness_state: spec.freshnessState ?? null,
    schema_ref: spec.schemaRef, ontology_ref: spec.ontologyRef ?? null,
    correction_of: spec.correctionOf ?? null, supersedes: spec.supersedes ?? null, withdrawal_reason: spec.withdrawalReason ?? null,
    audit_correlation_id: spec.auditCorrelationId, content_ref: spec.contentRef ?? null,
  };
  if (verbatim) return h;

  // ── stated time (ES-26-001/-004): a TimeValue places its header instant and precision; a given instant must agree with it ──
  if (opts.time !== undefined) {
    const problems: string[] = [];
    for (const [axis, tv] of Object.entries(opts.time) as Array<[TimeAxis, TimeValue]>) {
      const p = timeValueProblems(tv);
      if (p.length > 0) { problems.push(...p.map((x) => `${axis} time: ${x}`)); continue; }
      const field = AXIS_FIELD[axis];
      if (field === undefined) continue; // 'document' / 'recorded' qualify the version, never a header axis
      const { instant, precision } = headerInstantOf(tv);
      const given = (spec as unknown as Record<string, unknown>)[{ event_time: 'eventTime', observation_time: 'observationTime', valid_from: 'validFrom', valid_to: 'validTo' }[field]];
      if (given === undefined) h[field] = instant;
      else if (iso(given as string | null) !== instant) problems.push(`${axis} time: the header's ${field} ${String(given)} is not the stated value's instant ${String(instant)}`);
      if (axis === 'event' && spec.timePrecision === undefined) h.time_precision = precision;
    }
    if (problems.length > 0) throw new HeaderBuildError(problems);
  }
  if (!(HEADER_TIME_PRECISIONS as readonly string[]).includes(h.time_precision)) {
    throw new HeaderBuildError([`time_precision ${h.time_precision} is not in the governed vocabulary (${HEADER_TIME_PRECISIONS.join(', ')})`]);
  }

  // ── the control profiles: inherited where the writer left them undefined (never stamped from the domain — see the head comment) ──
  if (opts.inherit !== undefined) {
    if (spec.rightsProfile === undefined) h.rights_profile = inheritOne('rights_profile', opts.inherit);
    if (spec.residencyProfile === undefined) h.residency_profile = inheritOne('residency_profile', opts.inherit);
    if (spec.retentionProfile === undefined) h.retention_profile = inheritOne('retention_profile', opts.inherit);
    if (spec.accessPolicyRef === undefined) h.access_policy_ref = inheritOne('access_policy_ref', opts.inherit);
  }

  // ── the statements (DESIGN D3): never a bare null on a new version ──
  const profile = HEADER_PROFILES[h.object_type];
  for (const f of ['confidence', 'uncertainty', 'quality_state'] as const) {
    if (h[f] !== null) continue;
    const given = opts.absent?.[f];
    const a = given !== undefined ? checkAbsence(f, given)
      : (f !== 'quality_state' ? profile?.absence?.[f] : undefined) ?? defaultAbsence(f, h);
    h[f] = { state: a.state, reason: a.reason };
  }
  if (h.freshness_state === null) {
    const given = opts.absent?.freshness_state;
    h.freshness_state = given !== undefined ? { ...checkAbsence('freshness_state', given) } : freshnessAtWrite(h);
  }
  if (h.provenance_ref === null) {
    const given = opts.absent?.provenance_ref;
    h.provenance_ref = `none:${given !== undefined ? checkAbsence('provenance_ref', given).reason
      : 'the provenance of this version is its references (evidence, sources, method, humans); no separate provenance record'}`;
  }
  if (h.ontology_ref === null) h.ontology_ref = 'ontology:none';
  if (h.quality_profile === null) h.quality_profile = qualityProfileOf(h.object_type);
  return h;
}

/** Whether a stored header value is a declared absence ({state, reason}). */
export function isDeclaredAbsence(v: unknown): v is DeclaredAbsence { return isAbsence(v); }

/**
 * The qualifier declaration `objects.admit_version(header, payload, digest, declaration)` records in objects.time_qualifiers (0120 §HD.4):
 * one stated TimeValue per axis. A writer whose capability carries the declaration passes it; every other admission's qualifiers are
 * derived from the header by the admit itself.
 */
export function timeDeclaration(time: Partial<Record<TimeAxis, TimeValue>>): { time: Array<TimeValue & { axis: TimeAxis }> } {
  return { time: (Object.entries(time) as Array<[TimeAxis, TimeValue]>).map(([axis, v]) => ({ axis, ...v })) };
}

/* ───────────────────────────── THE ROW → HEADER REBUILD (the storage round trip; moved here from objects.service.ts) ───────────────────────────── */

/** Rebuild the 43-field canonical header from a stored row (round-trip check). */
export function rebuildHeaderFromRow(row: Record<string, unknown>): CanonicalHeader {
  const isoOf = (v: unknown): string | null => (v == null ? null : new Date(v as string | Date).toISOString());
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : (JSON.parse(String(v)) as string[]));
  const obj = (v: unknown): Json | null => (v == null ? null : typeof v === 'object' ? (v as Json) : (JSON.parse(String(v)) as Json));
  const s = (v: unknown): string | null => (v as string | null) ?? null;
  return buildHeader({
    objectId: String(row['object_id']), objectType: String(row['object_type']),
    tenantId: s(row['tenant_id']), domainId: s(row['domain_id']), scope: row['scope'] as CanonicalHeader['scope'],
    objectVersion: String(Number(row['object_version'])), lifecycleState: String(row['lifecycle_state']),
    owningComponent: String(row['owning_component']), accountableOwner: String(row['accountable_owner']), sourceObjectIds: arr(row['source_object_ids']),
    eventTime: isoOf(row['event_time']), observationTime: isoOf(row['observation_time']), validFrom: isoOf(row['valid_from']), validTo: isoOf(row['valid_to']),
    recordedAt: isoOf(row['recorded_at']) as string, timePrecision: String(row['time_precision']), sourceClockQuality: row['source_clock_quality'] as Clock,
    truthState: String(row['truth_state']), syntheticState: Boolean(row['synthetic_state']),
    confidence: obj(row['confidence']), uncertainty: obj(row['uncertainty']),
    evidenceRefs: arr(row['evidence_refs']), provenanceRef: s(row['provenance_ref']), methodRef: s(row['method_ref']),
    contradictionRefs: arr(row['contradiction_refs']), corroborationRefs: arr(row['corroboration_refs']), humanRefs: arr(row['human_refs']),
    classification: String(row['classification']), purposeScope: String(row['purpose_scope']),
    rightsProfile: s(row['rights_profile']), residencyProfile: s(row['residency_profile']), retentionProfile: s(row['retention_profile']), accessPolicyRef: s(row['access_policy_ref']),
    qualityProfile: s(row['quality_profile']), qualityState: obj(row['quality_state']), freshnessState: obj(row['freshness_state']),
    schemaRef: String(row['schema_ref']), ontologyRef: s(row['ontology_ref']),
    correctionOf: s(row['correction_of']), supersedes: s(row['supersedes']), withdrawalReason: s(row['withdrawal_reason']),
    auditCorrelationId: String(row['audit_correlation_id']), contentRef: s(row['content_ref']),
  }, { mode: 'verbatim' });
}
