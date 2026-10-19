/**
 * B82 §EV — EVIDENCE, CITATION, CUSTODY, RIGHTS, VERIFICATION as PURE functions (F-P7-E-07 chapter 26: UX-26-001…005, CMP-025…028,
 * CMP-030…032, HX-01, UX-ADR-006, REL-08). The components (components/evidence.tsx) only render what these return; the pages only fetch.
 *
 *   the citation      parseCitations (from what a page carries — option consequences, twin element citations, briefing items),
 *                     citationLabel / citationKey / citationHref, toResolution (the server's snake_case answer → the seam's shape + the
 *                     own outcome, the reasons, the span basis, the fragment), OUTCOME_WORDS (a glyph and a word for each of the seven
 *                     outcomes — never colour alone), worstOutcome, decisionReady (only RESOLVED is decision-ready; anything else is
 *                     viewable, not decision-ready)
 *   the viewer        viewerKind (text / json / media / geo / binary — media and geospatial viewers are B83's, said so), segmentRequestOf
 *                     (the governed segment read a leaf asks for, ≤ 64 KiB, with context), splitSegment (the served bytes → before /
 *                     CITED / after, UTF-8 or hexadecimal, a lossy decode said so), base64ToBytes
 *   custody           custodyTimeline (every custody event in order, in words; a failure or an unreachable root never hidden)
 *   rights            rightsNotice (the governed terms — "no expiry declared" when none — beside the contract's own rights statement;
 *                     whether they block decision-active use)
 *   verification      bytesVerification / signatureVerifications / verificationSummary (VERIFIED / FAILED / UNAVAILABLE / NOT CHECKED —
 *                     an unavailable check is never shown as failed, and nothing is shown verified by inference)
 *   disclosure        evidenceDisclosure (HX-01: sources, citations, versions, cutoff, omissions, the policy-filtered scope; unresolved →
 *                     viewable, not decision-ready)
 *   the card          evidenceCard (CMP-025: source, truth, authority, rights, digest, custody, freshness, tier)
 *
 * DESIGN D9: the cited bytes are read only through the EXISTING evidence-read authority; a reader without it gets the server's refusal and
 * keeps the resolution, short of the bytes. THREE CLAIMS: CONSTRUCTION (this module and its tests); demonstrated operation is the act's;
 * real acceptance (B111, then H3) is never claimed.
 */
import type { CitationKind, CitationLeaf, CitationRef, CitationResolution, LeafOutcome, RightsTerms, VerificationOutcome } from './b82-seams';

type Row = Record<string, unknown>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/* ───────────────────────── the citation ───────────────────────── */
export const CITATION_KINDS: readonly CitationKind[] = ['evidence', 'claim', 'entity', 'forecast', 'assumption', 'run', 'twin', 'scenario', 'warning', 'estimate'];
export const KIND_WORDS: Readonly<Record<CitationKind, string>> = {
  evidence: 'evidence', claim: 'claim', entity: 'entity', forecast: 'forecast', assumption: 'assumption', run: 'simulation run', twin: 'twin version',
  scenario: 'scenario', warning: 'warning', estimate: 'estimate',
};
const KIND_TYPE: Readonly<Record<CitationKind, string | null>> = {
  evidence: 'EVD', claim: 'CLM', entity: 'ENT', forecast: 'FCT', assumption: 'ASU', run: 'SIM', twin: 'TWN', scenario: 'SCN', warning: 'WRN', estimate: null,
};

export const citationKey = (r: CitationRef): string => `${r.kind}:${r.id.toLowerCase()}@${r.version}`;
export const citationLabel = (r: CitationRef): string => `${KIND_WORDS[r.kind]} ${r.id.slice(0, 8)}… v${r.version}`;

/** Where the cited object opens: evidence on its page; any other recorded type on its explanation, exactly the version cited. */
export function citationHref(r: CitationRef): string | null {
  if (r.kind === 'evidence') return `/observation/evidence/${r.id}`;
  const t = KIND_TYPE[r.kind];
  return t === null ? null : `/graph/explain/${t}/${r.id}?version=${r.version}`;
}

/** The citations a page carries (option consequences, twin element citations, briefing items …), each exactly once; malformed ones counted, never guessed. */
export function parseCitations(v: unknown): { refs: CitationRef[]; rejected: number } {
  const out: CitationRef[] = []; const seen = new Set<string>(); let rejected = 0;
  for (const x of Array.isArray(v) ? v : []) {
    const c = (x ?? {}) as Row;
    const kind = c['kind']; const id = c['id']; const version = num(c['version']); const digest = c['digest'] ?? null;
    if (typeof kind !== 'string' || !(CITATION_KINDS as readonly string[]).includes(kind) || typeof id !== 'string' || !UUID_RE.test(id) || version === null || !Number.isInteger(version) || version < 1
        || (digest !== null && (typeof digest !== 'string' || !DIGEST_RE.test(digest)))) { rejected += 1; continue; }
    const ref: CitationRef = { kind: kind as CitationKind, id: id.toLowerCase(), version, digest: digest as string | null };
    const k = citationKey(ref);
    if (!seen.has(k)) { seen.add(k); out.push(ref); }
  }
  return { refs: out, rejected };
}

/** A briefing item's id (`<kind>:<uuid>@<version>`, BRF items and narrative cites) as the citation it names — or null when it names no
 *  citable object (an indicator, a ledger event): never guessed. The item carries no digest, so the citation names the version, unbound. */
export function citationOfItemId(itemId: string): CitationRef | null {
  const m = /^([a-z_]+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@([1-9][0-9]{0,8})$/i.exec(itemId.trim());
  if (m === null) return null;
  const kind = m[1]!.toLowerCase();
  if (!(CITATION_KINDS as readonly string[]).includes(kind)) return null;
  return { kind: kind as CitationKind, id: m[2]!.toLowerCase(), version: Number(m[3]), digest: null };
}

export const OUTCOMES: readonly LeafOutcome[] = ['resolved', 'corrected', 'stale_citation', 'withdrawn', 'rights_expired', 'unverifiable', 'inaccessible'];
/** Each outcome: a glyph, a WORD and a sentence (never colour alone); the token NAME only reinforces it. */
export const OUTCOME_WORDS: Readonly<Record<LeafOutcome, { glyph: string; word: string; sentence: string; token: string }>> = {
  resolved: { glyph: '✓', word: 'RESOLVED', sentence: 'resolves to the exact evidence it names', token: 'color.success' },
  corrected: { glyph: '↻', word: 'CORRECTED SINCE', sentence: 'the cited version was corrected later; the correction is linked and the original preserved', token: 'color.corrected' },
  stale_citation: { glyph: '≠', word: 'STALE CITATION', sentence: 'the digest the citation carries is not the recorded digest of that version', token: 'color.warning' },
  withdrawn: { glyph: '⊘', word: 'WITHDRAWN', sentence: 'the cited version, or a later one, is withdrawn; the record is kept', token: 'color.withdrawn' },
  rights_expired: { glyph: '⊘', word: 'RIGHTS EXPIRED', sentence: 'the rights terms of the source expired or were withdrawn; no decision-active use', token: 'color.critical' },
  unverifiable: { glyph: '◍', word: 'UNVERIFIABLE', sentence: 'the bytes, the span, the digest or the lineage could not be verified; the citation and its evidence are kept', token: 'color.uncertain' },
  inaccessible: { glyph: '⌀', word: 'INACCESSIBLE', sentence: 'not recorded here, not visible to this reader, or its bytes cannot be reached; the citation is kept', token: 'color.degraded' },
};
export const outcomeRank = (o: LeafOutcome): number => { const i = OUTCOMES.indexOf(o); return i < 0 ? OUTCOMES.length : i; };
export function worstOutcome(os: readonly LeafOutcome[]): LeafOutcome {
  return os.reduce<LeafOutcome>((w, o) => (outcomeRank(o) > outcomeRank(w) ? o : w), 'resolved');
}
/** Only a RESOLVED citation is decision-ready; any other is viewable, not decision-ready (UX-26-005, HX-01). */
export const decisionReady = (o: LeafOutcome): boolean => o === 'resolved';

export interface ResolvedLeaf extends CitationLeaf {
  reasons: string[];
  spanBasis: 'whole_object' | 'claim_lineage' | null;
  fragment: { byteStart: number; byteEnd: number; methodRef: string | null; parentId: string | null } | null;
  custodyState: 'intact' | 'integrity_failed' | 'not_established' | null;
  lastVerifiedAt: string | null;
  lastFailedAt: string | null;
  sourceId: string | null; contractVersion: number | null;
  lifecycle: string | null; truthState: string | null; synthetic: boolean | null; recordedAt: string | null; byteLength: number | null;
  contractRightsState: string | null;
}
export interface ResolutionView extends CitationResolution {
  own: { outcome: LeafOutcome; digestBinds: 'version' | 'bytes' | 'none'; detail: string | null;
         object: { type: string; lifecycle: string; truthState: string; synthetic: boolean; recordedAt: string | null; title: string; correctionOf: string | null; correctedBy: string | null } | null };
  leaves: ResolvedLeaf[];
}

const asOutcome = (v: unknown): LeafOutcome => ((OUTCOMES as readonly string[]).includes(String(v)) ? (v as LeafOutcome) : 'unverifiable');

export function toRights(r: unknown): RightsTerms | null {
  const x = (r ?? null) as Row | null;
  if (x === null || typeof x !== 'object' || str(x['terms_id']) === null) return null;
  const state = String(x['state']);
  return {
    termsId: String(x['terms_id']), version: num(x['version']) ?? 0, sourceId: String(x['source_id'] ?? ''), contractVersion: num(x['contract_version']) ?? 0,
    expiresAt: str(x['expires_at']), purposes: Array.isArray(x['purposes']) ? (x['purposes'] as unknown[]).map(String) : [],
    prohibitedUses: Array.isArray(x['prohibited_uses']) ? (x['prohibited_uses'] as unknown[]).map(String) : [], attribution: str(x['attribution']),
    declaredBy: String(x['declared_by'] ?? ''), declaredAt: String(x['declared_at'] ?? ''), state: state === 'expired' || state === 'withdrawn' ? state : 'in_force',
  };
}

function toLeaf(l: Row): ResolvedLeaf {
  const e = (l['evidence'] ?? null) as Row | null;
  const cu = (l['custody'] ?? null) as Row | null;
  const corr = (l['correction'] ?? {}) as Row;
  const fr = (e?.['fragment'] ?? null) as Row | null;
  const tier = str(l['tier']);
  return {
    path: Array.isArray(l['path']) ? (l['path'] as unknown[]).map(String) : [],
    evidence: e === null ? null : { id: String(e['id']), version: num(e['version']) ?? 0, digest: String(e['digest'] ?? ''), byteStart: num(e['byte_start']) ?? 0, byteEnd: num(e['byte_end']) ?? 0, mediaType: str(e['media_type']) },
    digestOk: typeof l['digest_ok'] === 'boolean' ? (l['digest_ok'] as boolean) : null,
    custody: cu === null ? null : { events: num(cu['events']) ?? 0, lastEventAt: str(cu['last_event_at']) },
    rights: toRights(l['rights']),
    tier: tier === 'hot' || tier === 'cold' || tier === 'archived' ? tier : null,
    correction: { correctionOf: str(corr['correction_of']), correctedBy: str(corr['corrected_by']) },
    outcome: asOutcome(l['outcome']), detail: str(l['detail']),
    reasons: Array.isArray(l['reasons']) ? (l['reasons'] as unknown[]).map(String) : [],
    spanBasis: l['span_basis'] === 'claim_lineage' ? 'claim_lineage' : l['span_basis'] === 'whole_object' || (e !== null && l['path'] !== undefined && (l['path'] as unknown[]).length === 1) ? 'whole_object' : null,
    fragment: fr === null ? null : { byteStart: num(fr['byte_start']) ?? 0, byteEnd: num(fr['byte_end']) ?? 0, methodRef: str(fr['method_ref']), parentId: str(fr['parent_evd_id']) },
    custodyState: cu === null ? null : (['intact', 'integrity_failed', 'not_established'].includes(String(cu['state'])) ? cu['state'] as ResolvedLeaf['custodyState'] : null),
    lastVerifiedAt: cu === null ? null : str(cu['last_verified_at']), lastFailedAt: cu === null ? null : str(cu['last_failed_at']),
    sourceId: e === null ? null : str(e['source_id']), contractVersion: e === null ? null : num(e['contract_version']),
    lifecycle: e === null ? null : str(e['lifecycle']), truthState: e === null ? null : str(e['truth_state']), synthetic: e === null || typeof e['synthetic'] !== 'boolean' ? null : (e['synthetic'] as boolean),
    recordedAt: e === null ? null : str(e['recorded_at']), byteLength: e === null ? null : num(e['byte_length']),
    contractRightsState: str(l['contract_rights_state']),
  };
}

/** The server's resolution (graph.resolve_citation, snake_case) in the seam's shape, the own state and every leaf kept. */
export function toResolution(row: Row): ResolutionView {
  const ref = (row['ref'] ?? {}) as Row;
  const own = (row['own'] ?? {}) as Row;
  const ob = (own['object'] ?? null) as Row | null;
  const binds = own['digest_binds'];
  return {
    ref: { kind: String(ref['kind']) as CitationKind, id: String(ref['id']), version: num(ref['version']) ?? 0, digest: str(ref['digest']) },
    outcome: asOutcome(row['outcome']),
    leaves: (Array.isArray(row['leaves']) ? (row['leaves'] as Row[]) : []).map(toLeaf),
    truncated: row['truncated'] === true, depth: num(row['depth']) ?? 0, method: String(row['method'] ?? ''), asOf: String(row['as_of'] ?? ''),
    own: {
      outcome: asOutcome(own['outcome'] ?? row['outcome']), digestBinds: binds === 'version' || binds === 'bytes' ? binds : 'none', detail: str(own['detail']),
      object: ob === null ? null : { type: String(ob['type']), lifecycle: String(ob['lifecycle']), truthState: String(ob['truth_state']), synthetic: ob['synthetic'] === true,
        recordedAt: str(ob['recorded_at']), title: String(ob['title'] ?? ''), correctionOf: str(ob['correction_of']), correctedBy: str(ob['corrected_by']) },
    },
  };
}

/** One line for a citation: its label, its outcome in words, what it binds; the detail when it is not resolved. */
export function citationLine(r: ResolutionView): { label: string; outcome: string; binds: string; detail: string | null; ready: boolean } {
  const w = OUTCOME_WORDS[r.outcome];
  return {
    label: citationLabel(r.ref), outcome: `${w.glyph} ${w.word}`,
    binds: r.own.digestBinds === 'version' ? 'the digest binds this version' : r.own.digestBinds === 'bytes' ? 'the digest binds the evidence bytes' : 'no digest carried — the version is named, not bound',
    detail: r.outcome === 'resolved' ? null : [r.own.detail, ...r.leaves.filter((l) => l.outcome !== 'resolved').map((l) => l.detail)].filter((x): x is string => x !== null && x !== '').join('; ') || w.sentence,
    ready: decisionReady(r.outcome),
  };
}

/* ───────────────────────── the viewer ───────────────────────── */
export const SEGMENT_MAX_BYTES = 65_536;
export const SEGMENT_CONTEXT = 256;
export type ViewerKind = 'text' | 'json' | 'media' | 'geo' | 'binary';
export function viewerKind(mediaType: string | null): ViewerKind {
  const m = (mediaType ?? '').toLowerCase().split(';')[0]!.trim();
  if (/^application\/(geo\+json|vnd\.geo\+json|vnd\.google-earth\.kml\+xml|gml\+xml)$/.test(m) || m.endsWith('+geojson')) return 'geo';
  if (m === 'application/json' || m.endsWith('+json')) return 'json';
  if (m.startsWith('text/') || m === 'application/xml' || m.endsWith('+xml') || m === 'application/csv') return 'text';
  if (/^(image|audio|video)\//.test(m) || m === 'application/pdf') return 'media';
  return m === '' ? 'text' : 'binary';
}
/** What the viewer says about a kind it does not render in place (CMP-028: media / geospatial viewers are B83's, chapter 31). */
export function viewerStatement(k: ViewerKind): string | null {
  if (k === 'media') return 'A media viewer (images, audio, video, documents) is B83’s (chapter 31, UX-31-001); here the cited bytes are shown as hexadecimal and the governed download serves the object.';
  if (k === 'geo') return 'A geospatial evidence viewer is B83’s (chapter 31, UX-31-003); here the cited bytes are shown as text and the governed download serves the object.';
  if (k === 'binary') return 'These bytes are not text; the cited span is shown as hexadecimal.';
  return null;
}

/** The governed segment read a leaf asks for: its span (at most 64 KiB, said when cut), context either side, the exact version. */
/** A leaf whose version is unknown (a fragment's parent named by id only) carries version 0: the read then asks for the CURRENT version (null). */
export function segmentRequestOf(leaf: Pick<ResolvedLeaf, 'evidence'>, context = SEGMENT_CONTEXT): { evdId: string; version: number | null; byteStart: number; byteEnd: number; context: number; note: string | null } | { problem: string } {
  const e = leaf.evidence;
  if (e === null) return { problem: 'this leaf names no evidence bytes; there is nothing to read' };
  if (!(e.byteEnd > e.byteStart) || e.byteStart < 0) return { problem: `the cited span ${e.byteStart}–${e.byteEnd} is empty or malformed; nothing is read` };
  const cut = e.byteEnd - e.byteStart > SEGMENT_MAX_BYTES;
  return { evdId: e.id, version: e.version >= 1 ? e.version : null, byteStart: e.byteStart, byteEnd: cut ? e.byteStart + SEGMENT_MAX_BYTES : e.byteEnd, context: Math.max(0, Math.min(1024, Math.trunc(context))),
    note: cut ? `the cited span is ${e.byteEnd - e.byteStart} bytes; its first ${SEGMENT_MAX_BYTES} are read here — the governed download serves the whole object` : null };
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

/** The served bytes split at the cited span's offsets: before / CITED / after — UTF-8 for text kinds (a lossy decode said so), hexadecimal otherwise. */
export function splitSegment(bytes: Uint8Array, highlight: { start: number; end: number }, kind: ViewerKind): { before: string; cited: string; after: string; encoding: 'utf-8' | 'hex'; lossy: boolean; citedBytes: number } {
  const s = Math.max(0, Math.min(bytes.length, highlight.start)); const e = Math.max(s, Math.min(bytes.length, highlight.end));
  const parts = [bytes.subarray(0, s), bytes.subarray(s, e), bytes.subarray(e)] as const;
  if (kind === 'media' || kind === 'binary') return { before: hex(parts[0]), cited: hex(parts[1]), after: hex(parts[2]), encoding: 'hex', lossy: false, citedBytes: e - s };
  const dec = new TextDecoder('utf-8', { fatal: false });
  const [before, cited, after] = parts.map((p) => dec.decode(p)) as [string, string, string];
  return { before, cited, after, encoding: 'utf-8', lossy: [before, cited, after].some((t) => t.includes('�')), citedBytes: e - s };
}

/* ───────────────────────── custody ───────────────────────── */
export interface CustodyRow { eventId?: string; event: string; actor: string | null; occurredAt: string | null; digestVerified: boolean | null; details?: Row | null }
const CUSTODY_WORDS: Readonly<Record<string, { glyph: string; word: string }>> = {
  'custody.acquired': { glyph: '↓', word: 'acquired' }, 'custody.quarantined': { glyph: '⧗', word: 'quarantined' }, 'custody.verified': { glyph: '✓', word: 'verified' },
  'custody.candidate_verified': { glyph: '✓', word: 'candidate verified' }, 'custody.admitted': { glyph: '✓', word: 'admitted' }, 'custody.finalized': { glyph: '■', word: 'finalized' },
  'custody.retrieved': { glyph: '↑', word: 'read' }, 'custody.tombstoned': { glyph: '✝', word: 'governed-deleted (tombstoned)' }, 'custody.integrity_failed': { glyph: '✕', word: 'INTEGRITY FAILED' },
  'custody.archived': { glyph: '❄', word: 'archived to the cold tier' }, 'custody.exported': { glyph: '⇥', word: 'exported' }, 'custody.restored': { glyph: '↺', word: 'restored to the hot tier' },
  'custody.delivered': { glyph: '⇥', word: 'delivered' }, 'custody.revocation_notified': { glyph: '⊘', word: 'revocation notified' }, 'custody.imported': { glyph: '⇤', word: 'imported' },
  'custody.retrieval_degraded': { glyph: '◌', word: 'ROOT UNREACHABLE — nothing verified or refuted' },
};
export function custodyTimeline(rows: readonly CustodyRow[]): Array<{ key: string; at: string | null; glyph: string; word: string; actor: string; verified: string; note: string | null; alarm: boolean }> {
  return [...rows]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (Date.parse(a.r.occurredAt ?? '') || 0) - (Date.parse(b.r.occurredAt ?? '') || 0) || a.i - b.i)
    .map(({ r, i }) => {
      const w = CUSTODY_WORDS[r.event] ?? { glyph: '•', word: r.event.replace(/^custody\./, '') };
      const d = (r.details ?? {}) as Row;
      const seg = str(d['segment']);
      const note = seg !== null ? `the cited span ${seg.replace('-', '–')} was read (${String(d['purpose'] ?? 'a segment read')})`
        : str(d['failure']) !== null ? `failure: ${String(d['failure'])}` : str(d['purpose']) !== null ? `purpose: ${String(d['purpose'])}` : null;
      return {
        key: r.eventId ?? `${r.event}#${i}`, at: r.occurredAt, glyph: w.glyph, word: w.word, actor: r.actor ?? 'not recorded',
        verified: r.digestVerified === true ? '✓ digest verified' : r.digestVerified === false ? '✕ digest NOT verified' : '— not applicable',
        note, alarm: r.event === 'custody.integrity_failed' || r.event === 'custody.retrieval_degraded' || r.digestVerified === false,
      };
    });
}
export function custodySummary(rows: readonly CustodyRow[]): string {
  if (rows.length === 0) return 'no custody event is recorded for this evidence';
  const t = custodyTimeline(rows);
  const alarms = t.filter((x) => x.alarm).length;
  return `${rows.length} custody event(s), oldest first · ${alarms === 0 ? 'no integrity failure or unreachable read recorded' : `${alarms} integrity failure(s) or unreachable read(s) recorded — shown in the list`}`;
}

/* ───────────────────────── rights ───────────────────────── */
export interface ContractRights { rightsState: string | null; licence: string | null; permittedUse: string[]; attribution: string | null; retention: string | null }
export function rightsNotice(input: { terms: RightsTerms | null; contract: ContractRights | null; now: Date }): {
  state: 'in_force' | 'expired' | 'withdrawn' | 'none_declared'; headline: string; expiry: string; lines: string[]; blocksDecisionUse: boolean; staleSinceRead: boolean;
} {
  const { terms, contract, now } = input;
  const lines: string[] = [];
  if (contract !== null) {
    lines.push(`Source contract rights: ${contract.rightsState ?? 'not stated'}${contract.licence === null ? '' : ` · licence ${contract.licence}`}`);
    if (contract.permittedUse.length > 0) lines.push(`Permitted by the contract: ${contract.permittedUse.join('; ')}`);
    if (contract.retention !== null) lines.push(`Retention: ${contract.retention}`);
  }
  if (terms === null) {
    return { state: 'none_declared', headline: 'No rights terms declared — no expiry declared', expiry: 'no expiry declared', lines: [...lines, ...(contract?.attribution ? [`Attribution: ${contract.attribution}`] : [])],
      blocksDecisionUse: false, staleSinceRead: false };
  }
  const expiry = terms.expiresAt === null ? 'no expiry declared' : `${terms.state === 'expired' ? 'expired' : 'expires'} ${terms.expiresAt}`;
  lines.push(`Purposes: ${terms.purposes.join('; ') || 'none stated'}`);
  lines.push(`Prohibited uses: ${terms.prohibitedUses.length === 0 ? 'none declared' : terms.prohibitedUses.join('; ')}`);
  lines.push(`Attribution: ${terms.attribution ?? contract?.attribution ?? 'none required'}`);
  lines.push(`Terms v${terms.version}, declared ${terms.declaredAt} by ${terms.declaredBy}`);
  const staleSinceRead = terms.state === 'in_force' && terms.expiresAt !== null && Date.parse(terms.expiresAt) <= now.getTime();
  const headline = terms.state === 'withdrawn' ? '⊘ RIGHTS WITHDRAWN — no decision-active use'
    : terms.state === 'expired' ? '⊘ RIGHTS EXPIRED — no decision-active use'
    : staleSinceRead ? '⚠ The declared expiry has passed since this read — read the terms again'
    : '✓ Rights terms in force';
  return { state: terms.state, headline, expiry, lines, blocksDecisionUse: terms.state !== 'in_force', staleSinceRead };
}

/* ───────────────────────── verification ───────────────────────── */
export type FacetOutcome = VerificationOutcome | 'not_checked';
export interface VerificationFacet { facet: string; outcome: FacetOutcome; detail: string; checkedAt: string | null }
export const VERIFICATION_WORDS: Readonly<Record<FacetOutcome, { glyph: string; word: string; sentence: string }>> = {
  verified: { glyph: '✓', word: 'VERIFIED', sentence: 'checked on this read and it holds' },
  failed: { glyph: '✕', word: 'FAILED', sentence: 'checked on this read and it does not hold' },
  unavailable: { glyph: '◌', word: 'UNAVAILABLE', sentence: 'could not be checked — neither verified nor refuted' },
  not_checked: { glyph: '—', word: 'NOT CHECKED', sentence: 'not checked on this page yet' },
};
/** The bytes facet from the last governed segment read (or none): verified / failed (409 EYE-INT-001) / unavailable (EYE-DEG-001). */
export function bytesVerification(read: { integrity: 'verified' | 'failed' | 'unavailable'; contentDigest?: string | null; at: string; detail?: string | null } | null): VerificationFacet {
  if (read === null) return { facet: 'Byte digest', outcome: 'not_checked', detail: 'the bytes are re-hashed by the governed read; none was made on this page', checkedAt: null };
  if (read.integrity === 'verified') return { facet: 'Byte digest', outcome: 'verified', detail: `the bytes hash to the recorded digest${read.contentDigest ? ` ${read.contentDigest.slice(0, 16)}…` : ''} (re-hashed on this read)`, checkedAt: read.at };
  if (read.integrity === 'failed') return { facet: 'Byte digest', outcome: 'failed', detail: read.detail ?? 'evidence bytes failed integrity verification and were not served', checkedAt: read.at };
  return { facet: 'Byte digest', outcome: 'unavailable', detail: read.detail ?? 'the tier’s root could not be reached; nothing about the bytes was verified or refuted (EYE-DEG-001)', checkedAt: read.at };
}
export function signatureVerifications(rows: ReadonlyArray<Row>, checkedAt: string): VerificationFacet[] {
  return rows.map((s) => {
    const v = (s['verification'] ?? {}) as Row;
    const o = String(v['outcome']);
    return { facet: `Signature by ${String(s['signer'] ?? 'unknown')} (${String(s['key_id'] ?? 'no key id')})`,
      outcome: o === 'verified' || o === 'failed' || o === 'unavailable' ? o : 'unavailable', detail: String(v['reason'] ?? 'the verifier gave no reason'), checkedAt };
  });
}
/** Never "verified" overall by inference: verified only when every facet was checked and verified. */
export function verificationSummary(facets: readonly VerificationFacet[]): { outcome: FacetOutcome; text: string } {
  if (facets.length === 0) return { outcome: 'not_checked', text: 'nothing has been checked on this page' };
  const c = (o: FacetOutcome) => facets.filter((f) => f.outcome === o).length;
  const outcome: FacetOutcome = c('failed') > 0 ? 'failed' : c('unavailable') > 0 ? 'unavailable' : c('not_checked') > 0 ? 'not_checked' : 'verified';
  return { outcome, text: `${c('verified')} verified · ${c('failed')} failed · ${c('unavailable')} unavailable · ${c('not_checked')} not checked` };
}

/* ───────────────────────── disclosure (HX-01) ───────────────────────── */
export function evidenceDisclosure(resolutions: readonly ResolutionView[], scope: { withheld?: number | null; cutoff?: string | null; policyFiltered?: boolean | null } = {}): {
  sources: string; citations: string; versions: string[]; cutoff: string; omissions: string[]; policyScope: string; decisionReady: boolean; reasons: string[];
} {
  const leaves = resolutions.flatMap((r) => r.leaves);
  const sources = new Set(leaves.map((l) => l.sourceId).filter((x): x is string => x !== null));
  const notReady = resolutions.filter((r) => !decisionReady(r.outcome));
  const omissions: string[] = [];
  const truncated = resolutions.filter((r) => r.truncated).length;
  if (truncated > 0) omissions.push(`${truncated} citation(s) were cut at their lineage depth — not every evidence leaf is listed`);
  const noBytes = leaves.filter((l) => l.evidence === null).length;
  if (noBytes > 0) omissions.push(`${noBytes} lineage path(s) reach no evidence bytes`);
  if ((scope.withheld ?? 0) > 0) omissions.push(`${scope.withheld} item(s) withheld under policy from this reader`);
  return {
    sources: sources.size === 0 ? 'no evidence source reached' : `${sources.size} source(s)`,
    citations: `${resolutions.length} citation(s) · ${leaves.filter((l) => l.evidence !== null).length} evidence leaf(s)`,
    versions: resolutions.map((r) => `${citationLabel(r.ref)} — ${OUTCOME_WORDS[r.outcome].word.toLowerCase()}`),
    cutoff: scope.cutoff == null ? 'no cutoff stated by this read' : `known at ${scope.cutoff}`,
    omissions: omissions.length === 0 ? ['none recorded by this read'] : omissions,
    policyScope: scope.policyFiltered === true || (scope.withheld ?? 0) > 0 ? 'policy-filtered: this reader sees part of the scope' : scope.policyFiltered === false ? 'not policy-filtered for this reader' : 'the policy filter is not stated by this read',
    decisionReady: resolutions.length > 0 && notReady.length === 0 && (scope.withheld ?? 0) === 0,
    reasons: notReady.map((r) => `${citationLabel(r.ref)}: ${OUTCOME_WORDS[r.outcome].word.toLowerCase()}`),
  };
}

/* ───────────────────────── the card (CMP-025) ───────────────────────── */
export function evidenceCard(leaf: ResolvedLeaf, now: Date): { title: string; lines: Array<{ term: string; value: string }>; outcome: string } {
  const e = leaf.evidence;
  const age = leaf.recordedAt === null ? null : Math.max(0, Math.round((now.getTime() - Date.parse(leaf.recordedAt)) / 3_600_000));
  return {
    title: e === null ? 'No evidence bytes reached' : `Evidence ${e.id.slice(0, 8)}… v${e.version}`,
    outcome: `${OUTCOME_WORDS[leaf.outcome].glyph} ${OUTCOME_WORDS[leaf.outcome].word}`,
    lines: [
      { term: 'Source', value: leaf.sourceId === null ? 'not stated' : `source ${leaf.sourceId.slice(0, 8)}… contract v${leaf.contractVersion ?? '?'}` },
      { term: 'Truth', value: `${leaf.truthState ?? 'not stated'}${leaf.synthetic === true ? ' · SYNTHETIC' : ''}` },
      { term: 'Authority', value: 'admitted by collection under its source contract — evidence carries no approval' },
      { term: 'Rights', value: leaf.rights === null ? 'no rights terms declared — no expiry declared' : `terms v${leaf.rights.version}: ${leaf.rights.state.replace('_', ' ')}${leaf.rights.expiresAt === null ? ' · no expiry declared' : ` · expiry ${leaf.rights.expiresAt}`}` },
      { term: 'Digest', value: e === null ? 'none' : `${e.digest.slice(0, 16)}… · ${leaf.digestOk === true ? 'recorded digests agree' : leaf.digestOk === false ? 'DIGESTS DISAGREE OR INTEGRITY FAILED' : 'not checked'}` },
      { term: 'Custody', value: leaf.custody === null ? 'not recorded' : `${leaf.custody.events} event(s) · ${leaf.custodyState === 'integrity_failed' ? 'INTEGRITY FAILED after the last verified custody' : leaf.custodyState === 'not_established' ? 'not established' : 'intact'}` },
      { term: 'Freshness', value: age === null ? 'record time not stated' : `recorded ${age} h ago (${leaf.recordedAt})` },
      { term: 'Tier', value: leaf.tier === null ? 'no manifest' : leaf.tier },
    ],
  };
}
