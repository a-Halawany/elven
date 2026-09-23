/**
 * THE DERIVATION'S RULES, as pure functions (CP-6 B19, 0079; design §2.2, §2.4, D6, D14; corrections C1, C2, N-d).
 *
 * A memory record of source kind document, communication or telemetry is never typed: it is DERIVED from a BASIS — a claim
 * version (ENT/EVT/CLM/REL/ASM; the exact version or the latest) or a warning — by the method `memory-derive@1.0.0`, whose
 * statement is a deterministic text over the basis (§2.4) and whose digest (sha256 of the statement's UTF-8) the port
 * `memory.record_item` re-computes: a derived statement is re-verifiable from the record itself, and a person's words never
 * enter it. `MemoryService.derive` (the route `memory.item.derive`; the re-derivation under `memory.item.supersede`) applies
 * these rules in this order, each refusal an HttpException the mapper never sees:
 *
 *   1. the BASIS gate (`basisGate`): the version asked for withdrawn, or the object's LATEST version withdrawn (no version of a
 *      withdrawn object grounds a record — the run-availability rule), or not active/admitted/corrected; a claim imported
 *      (`imported_from` on the latest version — the 0077 rule: derived at its origin and re-imported, never here); the REVIEW
 *      decision of the version — the CASE's, not the payload's (G2's `effectiveReviewState`, one implementation): queued,
 *      rejected or corrected-to-a-later-version refused; a warning not raised or acknowledged refused;
 *   2. the EVIDENCE gate (`evidenceGate`, C2): every evidence version the basis rests on (a claim's lineage, a warning's
 *      evidence) that is withdrawn — or whose object's latest version is withdrawn — grounds nothing; a record marked
 *      basis_withdrawn is not laundered by a re-derivation on the same withdrawn ground;
 *   3. the CONTROLS inherited (ES-29-002 is a floor, not a veto): `classification` the MOST RESTRICTIVE of the declared
 *      audience's, the basis row's and every evidence version's by CLEARANCE_RANK (`mostRestrictive`; an unknown level reads
 *      restricted), lifted silently and SAID as declared / inherited / applied; `synthetic_state` true when the basis or any
 *      evidence says true or says nothing (`anySynthetic` — prediction's foldControls rule, re-implemented here so graph never
 *      imports prediction); then the CLEARANCE line (C1): the deriver's clearance in the domain must cover the applied
 *      classification BEFORE anything is written — the derive act is not an oracle over content its caller may not read;
 *   4. the evidence VERSION a lineage row names is the highest EVD version carrying the lineage's bytes digest (D14:
 *      `evidenceVersionOf`) — a correction keeps the manifest and the digest under the next version, so the record names the
 *      version current at derivation and the deletion rule still matches by version or by digest.
 */
import { createHash } from 'node:crypto';
import { jcsCanonicalize } from '@eye/contracts';
import { CLEARANCE_RANK } from '../../shared/clearance.js';
import { effectiveReviewState } from '../edges/derive.js';

type Row = Record<string, unknown>;
export const MEMORY_DERIVE_METHOD = 'memory-derive@1.0.0';
export const MEMORY_BASIS_KINDS = ['claim', 'warning'] as const;
export const MEMORY_DERIVED_SOURCE_KINDS = ['document', 'communication', 'telemetry'] as const;
export const CLAIM_OBJECT_TYPES = ['ENT', 'EVT', 'CLM', 'REL', 'ASM'] as const;
/** The series keys a telemetry derivation carries (a source with more registered series names the first twenty, by key). */
export const MEMORY_SERIES_KEYS_MAX = 20;

export interface BasisRef { kind: (typeof MEMORY_BASIS_KINDS)[number]; id: string; version: number | null }
export interface EvidenceUse { object_id: string; version: number; digest: string; byte_start: number | null; byte_end: number | null }
export interface DerivationSource { source_id: string; source_key: string; contract_version: number; connector_kind: string; media_type: string | null; authority_class: string; data_origin: string }
/** The block `memory.record_item` validates (memory.assert_derivation) and `memory.items_current.derivation` carries. */
export interface Derivation {
  basis: { kind: BasisRef['kind']; id: string; version: number; content_digest: string; object_type: string };
  evidence: EvidenceUse[];
  source: DerivationSource;
  method_ref: string;
  derived_at: string;
  statement_digest: string;
  truth_state_of_basis: string;
  review_state_of_basis: string;
  series_keys?: string[];
  indicator?: { indicator_id: string; series_key: string; rule: string | null } | null;
}
export interface DeriveRefusal { status: 404 | 409 | 422; code: 'EYE_STA_001' | 'EYE_STA_002' | 'EYE_STA_003' | 'EYE_REQ_001'; message: string }

/** sha256 of the statement's UTF-8, hex — what memory.record_item re-verifies (encode(sha256(convert_to(statement, 'UTF8')), 'hex')). */
export function statementDigestOf(statement: string): string {
  return createHash('sha256').update(statement, 'utf8').digest('hex');
}

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
/** A qualifier's value in the statement: a string as is, a number or boolean by String(), anything else (an object, a list, null) by JCS. */
const scalar = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : jcsCanonicalize(v ?? null));

/**
 * THE METHOD memory-derive@1.0.0 (§2.4): deterministic text from the basis; never the person's words.
 *   claim   — `${subject} ${predicate} ${object_value}` + (qualifiers, an object with ≥ 1 key: ` (` + the entries sorted by key,
 *             each `${key} ${scalar}`, joined `; ` + `)`) + (an event time: ` — as of ${eventTime}`, ISO with milliseconds).
 *   warning — `${title} — ${consequence}` + (` (` + [`observed ${observation_at}: ${value}` from the evidence entry of kind
 *             `evidence`] [`rule ${rule}` from the entry of kind `indicator`] joined `; ` + `)`).
 * The unit test pins the three shapes byte for byte; the port pins the digest.
 */
export function derivedStatementOf(a: { kind: 'claim'; payload: Row; eventTime: string | null } | { kind: 'warning'; payload: Row; row: Row }): string {
  if (a.kind === 'claim') {
    const p = a.payload;
    let s = `${text(p['subject'])} ${text(p['predicate'])} ${text(p['object_value'])}`;
    const q = p['qualifiers'];
    if (q !== null && typeof q === 'object' && !Array.isArray(q) && Object.keys(q as Row).length > 0) {
      const entries = Object.keys(q as Row).sort().map((k) => `${k} ${scalar((q as Row)[k])}`);
      s += ` (${entries.join('; ')})`;
    }
    if (a.eventTime !== null) s += ` — as of ${a.eventTime}`;
    return s;
  }
  const p = a.payload; const w = a.row;
  const title = text(p['title'] ?? w['title']);
  const consequence = text(p['consequence'] ?? w['consequence']);
  const evidence = (Array.isArray(p['evidence']) ? p['evidence'] : Array.isArray(w['evidence']) ? w['evidence'] : []) as Row[];
  const observed = evidence.find((e) => e !== null && typeof e === 'object' && e['kind'] === 'evidence');
  const indicator = evidence.find((e) => e !== null && typeof e === 'object' && e['kind'] === 'indicator');
  const parts: string[] = [];
  if (observed !== undefined) parts.push(`observed ${text(observed['observation_at'])}: ${text(observed['value'])}`);
  const rule = indicator === undefined ? '' : text(indicator['rule']);
  if (rule.length > 0) parts.push(`rule ${rule}`);
  return `${title} — ${consequence}` + (parts.length > 0 ? ` (${parts.join('; ')})` : '');
}

const LEVEL_OF_RANK: Readonly<Record<number, string>> = Object.freeze({ 0: 'public', 1: 'internal', 2: 'confidential', 3: 'restricted' });
/** The most restrictive of the given classifications by CLEARANCE_RANK (public < internal < confidential < restricted); an unknown or absent level is restricted (fail-closed); no level at all is restricted too. */
export function mostRestrictive(levels: Array<string | null | undefined>): string {
  let rank = -1;
  for (const l of levels) rank = Math.max(rank, typeof l === 'string' ? (CLEARANCE_RANK[l] ?? 3) : 3);
  return LEVEL_OF_RANK[rank < 0 ? 3 : rank] ?? 'restricted';
}
/** The fold's synthetic rule (prediction/controls.ts foldControls, re-implemented so graph never imports prediction): true when any input says true or says nothing; nothing folded at all is synthetic (fail-closed). */
export function anySynthetic(inputs: Array<boolean | null | undefined>): boolean {
  return inputs.length === 0 || inputs.some((i) => i !== false);
}

const DERIVABLE_LIFECYCLE = new Set(['active', 'admitted', 'corrected']);
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The review gate over a basis version: the version's own lifecycle, then the object's LATEST version (withdrawn: no version
 * of a withdrawn object grounds a record), then — a claim — the latest version's `imported_from` (the 0077 rule) and the LATEST
 * case for the version (G2: `effectiveReviewState` — `superseded` for a case-corrected version, the payload's own state
 * otherwise; a review-corrected version's payload says `corrected` and is derivable, a `not_required` payload is derivable);
 * — a warning — its state (raised or acknowledged). Returns null when derivable, else the refusal.
 */
export function basisGate(a: { kind: 'claim' | 'warning'; row: Row; latest: Row; caseState: string | null; supersededTo: number | null; label: string; queuedReason?: string | null; warningState?: string | null }): DeriveRefusal | null {
  const id = String(a.row['object_id'] ?? '');
  const state = String(a.row['lifecycle_state'] ?? '');
  if (state === 'withdrawn') {
    const reason = text(a.row['withdrawal_reason']);
    return { status: 409, code: 'EYE_STA_003', message: `${a.label} was withdrawn${reason.length > 0 ? ` (${reason})` : ''}; a withdrawn basis grounds no memory record` };
  }
  if (String(a.latest['lifecycle_state'] ?? '') === 'withdrawn') {
    return { status: 409, code: 'EYE_STA_003', message: `${a.kind} ${id} was withdrawn at version ${String(a.latest['object_version'])}; no version of a withdrawn object grounds a memory record` };
  }
  if (!DERIVABLE_LIFECYCLE.has(state)) return { status: 409, code: 'EYE_STA_002', message: `${a.label} is ${state}; a memory record is derived from an active, admitted or corrected version` };
  if (a.kind === 'warning') {
    const ws = a.warningState ?? null;
    if (ws !== 'raised' && ws !== 'acknowledged') return { status: 409, code: 'EYE_STA_002', message: `warning ${id} is ${ws ?? 'not raised'}; a memory record is derived from a raised or acknowledged warning` };
    return null;
  }
  const latestPayload = isObject(a.latest['payload']) ? (a.latest['payload'] as Row) : {};
  if (isObject(latestPayload['imported_from'])) {
    return { status: 409, code: 'EYE_STA_002', message: `claim ${id} is imported (import ${String((latestPayload['imported_from'] as Row)['import_id'] ?? 'unknown')}); an imported claim is derived at its origin and re-imported; it is not derived here` };
  }
  const review = effectiveReviewState(a.row, a.caseState);
  if (review === 'queued') {
    const payload = isObject(a.row['payload']) ? (a.row['payload'] as Row) : {};
    const own = isObject(payload['review']) ? text((payload['review'] as Row)['reason']) : '';
    const why = own.length > 0 ? own : text(a.queuedReason).length > 0 ? text(a.queuedReason) : 'queued';
    return { status: 409, code: 'EYE_STA_002', message: `${a.label} is queued for review (${why}); a claim a person has not decided does not ground a memory record` };
  }
  if (review === 'rejected') return { status: 409, code: 'EYE_STA_002', message: `${a.label} was rejected in review; it grounds no memory record` };
  if (review === 'superseded') return { status: 409, code: 'EYE_STA_002', message: `${a.label} was corrected in review to version ${a.supersededTo === null ? 'a later one' : String(a.supersededTo)}; derive from the corrected version` };
  return null;
}

/**
 * C2 — a WITHDRAWN evidence version grounds no record: the version picked (the claim's lineage; the warning's evidence)
 * withdrawn, or the evidence object's LATEST version withdrawn while an earlier one was picked (a withdrawal copies the
 * digest, so today they coincide; a revision-then-withdrawal would not). A `corrected` version stays admissible: it is the
 * object's current reading, and its bytes are what the deletion rule pauses on.
 */
export function evidenceGate(ev: Row, latest: Row | null, label: string): DeriveRefusal | null {
  const id = String(ev['object_id'] ?? '');
  if (String(ev['lifecycle_state'] ?? '') === 'withdrawn') {
    const reason = text(ev['withdrawal_reason']);
    return { status: 409, code: 'EYE_STA_003', message: `evidence ${id}@${String(ev['object_version'])} was withdrawn${reason.length > 0 ? ` (${reason})` : ''}; ${label} rests on withdrawn evidence and grounds no memory record` };
  }
  if (latest !== null && String(latest['lifecycle_state'] ?? '') === 'withdrawn') {
    return { status: 409, code: 'EYE_STA_003', message: `evidence ${id} was withdrawn at version ${String(latest['object_version'])}; ${label} rests on withdrawn evidence and grounds no memory record` };
  }
  return null;
}

/** The evidence VERSION named by a lineage row: the highest EVD version whose payload.content_digest equals the lineage digest (D14); null when none carries it. */
export function evidenceVersionOf(rows: Row[], digest: string): Row | null {
  let best: Row | null = null;
  for (const r of rows) {
    const payload = isObject(r['payload']) ? (r['payload'] as Row) : {};
    if (String(payload['content_digest'] ?? '') !== digest) continue;
    if (best === null || Number(r['object_version']) > Number(best['object_version'])) best = r;
  }
  return best;
}

/** `SRC:<source_id>@<contract_version>` (the EVD's provenance_ref) → the pair; null when the reference is not of that shape (a claim's `SRC:<id>@extraction:<key>` is not). */
export function sourceRefOf(provenanceRef: unknown): { sourceId: string; contractVersion: number } | null {
  if (typeof provenanceRef !== 'string') return null;
  const m = /^SRC:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@([0-9]+)$/i.exec(provenanceRef);
  if (m === null) return null;
  return { sourceId: (m[1] as string).toLowerCase(), contractVersion: Number(m[2]) };
}
