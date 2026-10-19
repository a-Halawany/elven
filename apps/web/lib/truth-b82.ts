/**
 * CP-6 B82 §TS (F-P7-E-07: CMP-021, CMP-023, HX-02, HX-11, HX-15, TS-01…TS-10, UX-ADR-005, UX-ADR-009, REL-06, REL-07, CNT-08, UX-06-001…005,
 * V00-T-102) — THE TRUTH, AI-NOTICE AND FRESHNESS MODELS as pure functions (vitest, node); components/truth.tsx and the state strip of
 * components/object.tsx render exactly what these decide.
 *
 *  - DISPLAY TRUTH: the server's derived read (objects.display_truth — RECOMMENDED / CORRECTED / INDETERMINATE, never stored) mapped to the
 *    seam's DisplayTruth; the TWELVE states (the nine stored + the three derived) each with ONE label, glyph and token from the symbol set —
 *    distinct (UX-ADR-005); the label view (the badge's state, the canonical term, the stored state when it differs, the correction links,
 *    the reasons and the constrained use); the HX-02 GATE — promote / approve / publish / review held with the reason while INDETERMINATE
 *    (the server's refusal stays B50's assert_usable).
 *  - THE AI NOTICE (HX-11, UX-ADR-009, REL-06, CNT-08): ONE wording — "AI recommends, forecasts, simulates, reasons and explains; it does not
 *    decide" — naming the agent or model; the AI-output label "PROPOSED / RECOMMENDED / SYNTHETIC — by <agent or model>; not a decision"; the
 *    agent-authored test the pages and the page ratchet (Q16) use.
 *  - FRESHNESS (CMP-023, HX-15): the cutoff, the source health, the missing intervals and the projection watermark as one watermark; a stale
 *    or partial state CONSTRAINS the page's consequential commands (with the reason).
 *  - THE STATE STRIP (UX-06-001/-002/-005): truth, freshness, policy (classification, purpose) and authority where they change meaning; a
 *    context dimension inspected through B80's switch (UX-06-003) with the person's pending commands named.
 *
 * Presentation never changes meaning: nothing here infers a state the server did not answer — an unread display truth shows the STORED state
 * and says the display truth was not read. CONSTRUCTION only; the walk is the demonstration; nothing here is accepted.
 */
import { SYMBOLS } from '@eye/tokens';
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
import type { ProjectionBlock } from './graph';
import { DISPLAY_TRUTH_RULE_VERSION, type DisplayReasonCode, type DisplayTruth, type DisplayTruthState, type StoredTruthState } from './b82-seams';
import { TRUTH_TERMS, type TermRecord } from './content-b81';
import { dependencyLabel, partialFromProjection, partialOf, staleOfSource, type DegradedState, type PartialDeclaration, type StaleView } from './degraded-b81';

type Row = Record<string, unknown>;

/* ═════════════════════════════ THE TWELVE STATES (UX-ADR-005, REL-07, TS-01…10) ═════════════════════════════ */
export const STORED_STATES: readonly StoredTruthState[] = ['observed', 'asserted', 'extracted', 'inferred', 'assessed', 'synthetic', 'decided', 'disputed', 'withdrawn'];
export const DERIVED_STATES: readonly DisplayTruthState[] = ['recommended', 'corrected', 'indeterminate'];
export const DISPLAY_STATES: readonly DisplayTruthState[] = [...STORED_STATES, ...DERIVED_STATES];
export interface TruthStateEntry { state: DisplayTruthState; label: string; symbolId: string; token: string; glyphDigest: string; meaning: string; derived: boolean }
/** Each state's label, glyph and token — from the symbol set (packages/tokens), never re-drawn here. */
export const TRUTH_STATE_ENTRIES: readonly TruthStateEntry[] = DISPLAY_STATES.map((state) => {
  const s = SYMBOLS.find((x) => x.key === state);
  if (s === undefined) throw new Error(`the symbol set has no glyph for the truth state ${state}`);
  return { state, label: s.label, symbolId: s.id, token: s.token, glyphDigest: s.glyphDigest, meaning: s.meaning, derived: (DERIVED_STATES as readonly string[]).includes(state) };
});
/** UX-ADR-005: the states that share a label, a glyph or — where the registry assigns one per row — a token (empty when every state is distinct). */
export function truthStateCollisions(entries: readonly TruthStateEntry[] = TRUTH_STATE_ENTRIES): string[] {
  const out: string[] = [];
  const dup = (k: (e: TruthStateEntry) => string, what: string) => {
    const seen = new Map<string, string>();
    for (const e of entries) { const v = k(e); const p = seen.get(v); if (p !== undefined) out.push(`${p} and ${e.state} share the ${what} ${v}`); else seen.set(v, e.state); }
  };
  dup((e) => e.label, 'label'); dup((e) => e.glyphDigest, 'glyph');
  // the ten Appendix B rows (TS-01…10) each carry their own token; EXTRACTED / DISPUTED are product glyphs that share a token by design
  dup((e) => (/^TS-/.test(e.symbolId) ? e.token : `${e.token}#${e.state}`), 'token');
  return out;
}

/** The canonical TERM of a truth state for B81's Term (the registry fallback, marked `registry`; the act publishes the governed terms). */
export function truthTermOf(state: string): TermRecord | null {
  const k = state.trim().toLowerCase();
  const ts = TRUTH_TERMS.find((t) => t.key === `truth.${k}`);
  if (ts !== undefined) return ts;
  const s = SYMBOLS.find((x) => x.key === k && /^TG-/.test(x.id));
  if (s === undefined) return null;
  return { key: `truth.${s.key}`, label: s.label, definition: s.meaning, explanations: {}, locale: 'en', version: 0, category: 'truth_state', protectedWords: [], synonyms: [], example: null,
           conditions: [], cites: [], glossaryKeys: [], state: 'registry', digest: s.glyphDigest, translation: null, correction: null };
}

/* ═════════════════════════════ THE SERVER'S READ ═════════════════════════════ */
export interface TruthRef { type: string; id: string; version: number }
export interface DisplayTruthRead extends DisplayTruth { lifecycle: string | null; agentAuthored: boolean }
const isState = (v: unknown): v is DisplayTruthState => typeof v === 'string' && (DISPLAY_STATES as readonly string[]).includes(v);
/** A row of objects.display_truth as the seam's DisplayTruth — nothing re-worded, nothing defaulted to a state it does not hold. */
export function displayTruthOf(row: Row): DisplayTruthRead | null {
  const stored = row['stored']; const display = row['display'];
  if (!isState(stored) || !(STORED_STATES as readonly string[]).includes(stored) || !isState(display)) return null;
  const reasons = Array.isArray(row['reasons']) ? (row['reasons'] as Row[]).map((r) => ({ code: String(r['code']) as DisplayReasonCode, detail: String(r['detail'] ?? ''), ref: (r['ref'] as string | null | undefined) ?? null })) : [];
  return {
    ref: String(row['ref'] ?? ''), stored: stored as StoredTruthState, display, basis: String(row['basis'] ?? ''), ruleVersion: String(row['rule_version'] ?? ''), reasons,
    constrainedUse: (row['constrained_use'] as string | null | undefined) ?? null, correctionOf: (row['correction_of'] as string | null | undefined) ?? null,
    correctedBy: (row['corrected_by'] as string | null | undefined) ?? null, lifecycle: (row['lifecycle'] as string | null | undefined) ?? null, agentAuthored: row['agent_authored'] === true,
  };
}
export const refKey = (r: TruthRef): string => `${r.type}:${r.id.toLowerCase()}@${r.version}`;
/** The read (POST …/display-truth, objects.display_truth.read — audited). Up to 200 refs per request; the caller batches. */
export const truthApi = {
  read: (s: Scope, refs: TruthRef[]): Promise<ApiResult<{ truth: Row[]; receipt: { policyDecisionId: string; auditSeq: number } }>> =>
    call(`/v1/tenants/${s.tenantId}/domains/${s.domainId}/display-truth`, {
      scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action: 'objects.display_truth.read', object_type: refs.length === 1 ? refs[0]!.type : 'OBJ',
      object_id: refs.length === 1 ? refs[0]!.id : null, purpose_id: 'analysis', side_effect_class: 'none', consequence_class: 'C1',
    }, { refs }),
};
/** Unique refs in batches the server admits (≤ 200), the order kept. */
export function truthBatches(refs: readonly TruthRef[], size = 200): TruthRef[][] {
  const seen = new Set<string>(); const uniq: TruthRef[] = [];
  for (const r of refs) { const k = refKey(r); if (!seen.has(k) && /^[A-Z]{3}$/.test(r.type) && Number.isInteger(r.version) && r.version >= 1) { seen.add(k); uniq.push(r); } }
  const out: TruthRef[][] = [];
  for (let i = 0; i < uniq.length; i += size) out.push(uniq.slice(i, i + size));
  return out;
}
/** A ref from a row the pages hold (object_id / object_type / object_version), or null. */
export function refOfRow(row: Row, type?: string): TruthRef | null {
  const t = type ?? (typeof row['object_type'] === 'string' ? row['object_type'] : null);
  const id = row['object_id']; const v = Number(row['object_version'] ?? row['version']);
  if (t === null || typeof id !== 'string' || !Number.isInteger(v) || v < 1) return null;
  return { type: t, id, version: v };
}

/* ═════════════════════════════ THE LABEL (CMP-021) ═════════════════════════════ */
export type TruthInput = DisplayTruthRead | DisplayTruth | { stored: string; unread: string };
export interface TruthLabelView {
  /** the state the badge shows (the DISPLAY state — or the stored one when the display truth was not read) */ badge: string;
  derived: boolean; storedNote: string | null; term: TermRecord | null;
  correction: Array<{ label: string; ref: string }>;
  reasons: string[]; constrainedUse: string | null; basis: string; unread: string | null; ruleVersion: string | null;
}
const versionOf = (ref: string): string => { const m = /@(\d+)$/.exec(ref); return m === null ? ref : `v${m[1]}`; };
/** What TruthStateLabel shows: the display state with its term, the stored state when it differs, the correction links, the reasons and the
 *  constrained use — or the STORED state and the reason the display truth was not read (never a guessed display state). */
export function truthLabelView(t: TruthInput): TruthLabelView {
  if ('unread' in t) {
    return { badge: t.stored, derived: false, storedNote: null, term: truthTermOf(t.stored), correction: [], reasons: [], constrainedUse: null, basis: 'the stored truth state',
             unread: `display truth not read — ${t.unread}; the stored state is shown`, ruleVersion: null };
  }
  const derived = (DERIVED_STATES as readonly string[]).includes(t.display);
  const correction: Array<{ label: string; ref: string }> = [];
  if (t.correctionOf !== null) correction.push({ label: `corrects ${versionOf(t.correctionOf)} (the original is preserved)`, ref: t.correctionOf });
  if (t.correctedBy !== null) correction.push({ label: `superseded by correction ${versionOf(t.correctedBy)}`, ref: t.correctedBy });
  return {
    badge: t.display, derived, storedNote: t.display !== t.stored ? `stored ${t.stored.toUpperCase()}` : null, term: truthTermOf(t.display), correction,
    reasons: t.reasons.filter((r) => r.code !== 'correction_of' && r.code !== 'corrected_by').map((r) => r.detail), constrainedUse: t.constrainedUse, basis: t.basis, unread: null,
    ruleVersion: t.ruleVersion === '' ? null : t.ruleVersion,
  };
}
export const isCurrentRule = (t: DisplayTruth): boolean => t.ruleVersion === DISPLAY_TRUTH_RULE_VERSION;

/* ═════════════════════════════ HX-02 — THE GATE WHILE INDETERMINATE ═════════════════════════════ */
export const GATED_ACTS = ['promote', 'approve', 'publish', 'review', 'propose', 'derive'] as const;
export type GatedAct = (typeof GATED_ACTS)[number];
/** Why an act is HELD by the truth state (null when it is not): INDETERMINATE holds every decision-active act with its reasons; a WITHDRAWN
 *  object is never promoted, approved or published. A correction is never held (it is how an indeterminate state is resolved). The server
 *  refuses independently (B50's assert_usable); this only says it before the act is attempted. */
export function truthGate(t: TruthInput | null | undefined, act: GatedAct): string | null {
  if (t === null || t === undefined || 'unread' in t) return null;
  if (t.display === 'indeterminate') {
    const why = t.reasons.filter((r) => r.code !== 'correction_of' && r.code !== 'corrected_by').map((r) => r.detail).join('; ');
    return `the truth state is INDETERMINATE${why === '' ? '' : ` — ${why}`}; ${act} is held until it is resolved`;
  }
  const done: Record<GatedAct, string> = { promote: 'promoted', approve: 'approved', publish: 'published', review: 'reviewed', propose: 'proposed', derive: 'derived from' };
  if (t.display === 'withdrawn' && act !== 'review') return `the object is WITHDRAWN — it is not ${done[act]} again`;
  return null;
}

/* ═════════════════════════════ THE AI NOTICE (HX-11, UX-ADR-009, REL-06, CNT-08) ═════════════════════════════ */
/** THE ONE WORDING (HX-11) — every AI-assisted view states it, naming the agent or the model. */
export const AI_NOTICE_TEXT = 'AI recommends, forecasts, simulates, reasons and explains; it does not decide.';
export type AiOutputState = 'proposed' | 'recommended' | 'synthetic';
export interface AiProducer { kind: 'agent' | 'model'; name: string; version?: string | null }
/** CNT-08 — the AI-output label: "PROPOSED / RECOMMENDED / SYNTHETIC — by <agent or model>; not a decision". */
export function aiOutputLabel(state: AiOutputState, by: AiProducer | null): string {
  const who = by === null ? 'an unnamed agent or model (not recorded on this read)' : `${by.kind === 'agent' ? 'the agent' : 'the model'} ${by.name}${by.version ? ` ${by.version}` : ''}`;
  return `${state.toUpperCase()} — by ${who}; not a decision`;
}
export interface AiNoticeView { statement: string; output: string; producer: string; contest: string | null; explain: string | null; problems: string[] }
/** The notice: the one wording, the output's state and producer, where it is explained and where it is contested (REL-06). */
export function aiNoticeView(a: { output: AiOutputState; producer: AiProducer | null; contestHref?: string | null; explainHref?: string | null }): AiNoticeView {
  const problems: string[] = [];
  if (a.producer === null) problems.push('the AI notice names no agent or model — the producer is not recorded on this read');
  return {
    statement: AI_NOTICE_TEXT, output: aiOutputLabel(a.output, a.producer),
    producer: a.producer === null ? 'not recorded on this read' : `${a.producer.kind === 'agent' ? 'Agent' : 'Model'}: ${a.producer.name}${a.producer.version ? ` (${a.producer.version})` : ''}`,
    contest: a.contestHref ?? null, explain: a.explainHref ?? null, problems,
  };
}
/** Is a record AGENT-AUTHORED? (the B35 author kind, the briefing's composer, the rendering's renderer, a proposal's proposer, the display
 *  truth's own flag) — what decides that a view carries the AI notice. */
export function isAgentAuthored(row: Row | null | undefined): boolean {
  if (row === null || row === undefined) return false;
  return row['author_kind'] === 'agent' || row['composed_via'] === 'agent' || row['renderer_kind'] === 'agent' || row['proposed_by_kind'] === 'agent'
    || row['actor_kind'] === 'agent' || row['agent_authored'] === true || row['agentAuthored'] === true;
}
/** THE PAGE RATCHET (Q16; DESIGN D16): a page source that renders agent-authored content (its markers) without `<AiNotice` — the finding. */
export const AI_CONTENT_MARKERS = /\b(?:author_kind|composed_via|renderer_kind|proposed_by_kind)\b|authorMark\(|isAgentAuthored\(/;
export function aiNoticeFinding(source: string): 'missing' | null {
  return AI_CONTENT_MARKERS.test(source) && !/<AiNotice\b/.test(source) ? 'missing' : null;
}

/* ═════════════════════════════ FRESHNESS (CMP-023, HX-15) ═════════════════════════════ */
export interface SourceHealth { label: string; state: 'healthy' | 'stale' | 'degraded' | 'unknown'; lastSeen: string | null; stale?: StaleView | null }
export interface FreshnessInput {
  /** the last instant the data could include (ISO), or null when none is recorded */ cutoff: string | null;
  /** when this read was made */ asOf: string | null;
  sources?: SourceHealth[];
  missingIntervals?: Array<{ from: string; to: string }>;
  projection?: ProjectionBlock | null;
  /** the read is LIVE (no as-of) — said */ live?: boolean;
  /** what to say when no source health is listed (not read, and why; or read with no source signal) */ sourcesNote?: string | null;
}
export interface FreshnessView {
  state: 'current' | 'stale' | 'partial' | 'unknown';
  watermark: string; lines: string[]; partial: PartialDeclaration; stale: Array<{ label: string; view: StaleView }>;
  /** consequential commands that depend on this data are held — with this reason */ constrains: string | null;
}
/** The watermark: cutoff, source health, missing intervals and the projection's watermark as one statement; stale or partial constrains. */
export function freshnessView(f: FreshnessInput): FreshnessView {
  const sources = f.sources ?? []; const intervals = f.missingIntervals ?? []; const p = f.projection ?? null;
  const fromProjection = partialFromProjection(p);
  const partial = partialOf({ missingIntervals: [...fromProjection.missingIntervals, ...intervals], withdrawn: fromProjection.withdrawn, bounds: fromProjection.bounds,
    missingSources: sources.filter((s) => s.state === 'unknown').map((s) => s.label), ...(fromProjection.impact === null ? {} : { impact: fromProjection.impact }) });
  const stale = sources.flatMap((s) => (s.stale !== undefined && s.stale !== null && s.stale.stale ? [{ label: s.label, view: s.stale }] : []));
  const staleWords = sources.filter((s) => s.state === 'stale' || s.state === 'degraded');
  const lines: string[] = [
    `Data cutoff: ${f.cutoff ?? 'not recorded on this read'}`,
    `Read at: ${f.asOf ?? 'not recorded'}${f.live === true ? ' (live — no as-of applied)' : ''}`,
    ...(sources.length === 0 ? [`Source health: ${f.sourcesNote ?? 'not read on this page'}`] : sources.map((s) => `Source ${s.label}: ${s.state.toUpperCase()}${s.lastSeen ? ` (last seen ${s.lastSeen})` : ''}`)),
    ...intervals.map((i) => `Missing interval: ${i.from} – ${i.to}`),
    p === null ? 'Projection watermark: this read has no projection' : `Projection watermark: revision ${p.revision ?? 'none'}${p.verified_at ? `, verified ${p.verified_at}` : ', not verified'}${p.lag_events > 0 ? `, ${p.lag_events} change(s) behind` : ''} (${p.condition})`,
  ];
  // CURRENT is said only when something VERIFIED it — every source read healthy, or a current projection watermark; never inferred from a cutoff
  const verified = (sources.length > 0 && sources.every((s) => s.state === 'healthy')) || (p !== null && p.condition === 'current');
  const state: FreshnessView['state'] = staleWords.length > 0 || stale.length > 0 ? 'stale' : !partial.complete ? 'partial' : verified ? 'current' : 'unknown';
  const watermark = state === 'current' ? `CURRENT as of ${f.asOf ?? 'this read'} — cutoff ${f.cutoff ?? 'not recorded'}`
    : state === 'stale' ? `STALE — ${[...new Set([...staleWords.map((s) => s.label), ...stale.map((s) => s.label)])].join(', ')} not current`
      : state === 'partial' ? 'PARTIAL — not every source, interval or partition is in this read'
        : `FRESHNESS NOT VERIFIED — cutoff ${f.cutoff ?? 'not recorded'}; no source health or projection watermark verifies it on this read`;
  const constrains = state === 'stale' ? 'the data this rests on is stale — consequential commands that depend on it are held until it is refreshed or the staleness is accepted on the record'
    : state === 'partial' ? 'the read is partial — consequential commands that depend on the missing part are held' : null;
  return { state, watermark, lines, partial, stale, constrains };
}

/** The SOURCE health a domain's degraded state reports (B81 §DG — evaluated by the server on the database clock), as freshness sources. */
export function sourceHealthOf(d: DegradedState | null): SourceHealth[] {
  if (d === null) return [];
  const all = [...d.contracts.map((c) => ({ dep: c.dependency, signal: c.signal })), ...d.undeclared.map((u) => ({ dep: u.dependency, signal: u.signal }))].filter((x) => x.dep.kind === 'source');
  const seen = new Set<string>(); const out: SourceHealth[] = [];
  for (const x of all) {
    const label = dependencyLabel(x.dep); if (seen.has(label)) continue; seen.add(label);
    const st = staleOfSource(x.signal);
    out.push({ label, state: x.signal.state === 'healthy' ? 'healthy' : x.signal.state === 'degraded' ? (st !== null && st.stale ? 'stale' : 'degraded') : 'unknown', lastSeen: st?.watermark ?? x.signal.since, stale: st });
  }
  return out;
}

/* ═════════════════════════════ THE STATE STRIP (UX-06-001/-002/-005) ═════════════════════════════ */
export interface StatePolicy { classification: string | null; purpose: string | null }
export interface StateStripItem { key: 'truth' | 'freshness' | 'policy' | 'authority'; label: string; value: string; held: string | null }
/** The strip's items where they change meaning: the display truth, the freshness, the policy and the authority — each stated, an unread one
 *  said; `held` is the reason a consequential command is held by that dimension. */
export function stateStripView(a: { truth?: TruthInput | null; freshness?: FreshnessView | null; policy?: StatePolicy | null; authority: string }): StateStripItem[] {
  const out: StateStripItem[] = [];
  if (a.truth !== undefined) {
    const v = a.truth === null ? null : truthLabelView(a.truth);
    out.push({ key: 'truth', label: 'Display truth', value: v === null ? 'not read on this page' : `${v.badge.toUpperCase()}${v.storedNote ? ` (${v.storedNote})` : ''}${v.unread ? ` — ${v.unread}` : ''}`,
               held: a.truth === null ? null : truthGate(a.truth, 'propose') });
  }
  if (a.freshness !== undefined) out.push({ key: 'freshness', label: 'Freshness', value: a.freshness === null ? 'not read on this page' : a.freshness.watermark, held: a.freshness?.constrains ?? null });
  if (a.policy !== undefined) {
    const p = a.policy;
    out.push({ key: 'policy', label: 'Policy', value: p === null ? 'not recorded on this read' : `classification ${p.classification ?? 'not recorded'} · purpose ${p.purpose ?? 'not recorded'}`, held: null });
  }
  out.push({ key: 'authority', label: 'Authority', value: a.authority, held: null });
  return out;
}
/** UX-06-003 — the context dimensions the strip opens B80's switch for, one at a time. */
export const STRIP_DIMENSIONS = [
  { key: 'objective', label: 'objective' }, { key: 'scenario', label: 'scenario' }, { key: 'horizon', label: 'horizon' },
  { key: 'classification', label: 'classification ceiling' }, { key: 'effective', label: 'effective time' },
] as const;
export type StripDimension = (typeof STRIP_DIMENSIONS)[number]['key'];
export interface PendingCommand { label: string; kind: 'draft' | 'command_review' | 'preview' }
/** What the switch's preview adds: the person's pending commands on this page — never altered by the switch (a draft stays personal and
 *  unsent; an open Command Review keeps its digest — the server refuses it if the version changed). */
export function pendingCommandsLine(items: readonly PendingCommand[]): string {
  if (items.length === 0) return 'You hold no pending command on this page — no draft and no open Command Review.';
  const words = items.map((i) => `${i.label} (${i.kind === 'draft' ? 'your draft — stays yours, never submitted by a switch' : i.kind === 'command_review' ? 'an open Command Review — it keeps its digest; a switch approves nothing' : 'a preview — recomputed under the new context'})`);
  return `Your pending commands here, unaffected by the switch: ${words.join('; ')}.`;
}
export function dimensionIntro(d: StripDimension): string {
  const label = STRIP_DIMENSIONS.find((x) => x.key === d)?.label ?? d;
  return `You opened the switch for ONE dimension — the ${label}. Change only that field, preview the impact, then set the context; the other dimensions stay as they are.`;
}
