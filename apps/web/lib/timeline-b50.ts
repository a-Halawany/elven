/**
 * B50 §TL (0120_b50_x_tl; F-P3-04: PR-22-001/002/003/005, CAP-UM-10, AT-22) — THE TIMELINE, THE AS-OF EXPLORER AND THE SOURCE-TO-PRODUCT
 * TRACE as pure functions. components/knowledge.tsx (the §TL block: TimelineScrubber, TimelineDisclosureNote, TraceView) and the pages
 * /graph/timeline and /graph/trace/[type]/[id] render what these decide.
 *
 *   THE ASK         a timeline names ONE subject (a type and an id) or ONE approved governed scope; an axis (event | observation | valid |
 *                   record); a window; an as-of instant on RECORD time (none: now). A deep link opens exactly what it names, or says why not.
 *   THE SCRUBBER    the as-of instant steps over the RECORD instants the answer itself carries (each version's record time, each ledger
 *                   event) — never an instant the server did not state; "now" is the live read.
 *   THE ITEMS       each version with its four times in words (a DATE renders as the day it names), its clock reading as a glyph AND a word,
 *                   whether it was believed at the instant, the correction recorded LATER ("corrected on …") and the citations that no
 *                   longer resolve — all from the server; nothing here places, flags or hides an item.
 *   THE DISCLOSURE  every disclosure has a line, ALWAYS — a zero says "none" (PR-22-003: no read path drops them; the test asserts it):
 *                   missing intervals, policy filtering (counts, never content), clock skew, broken lineage, later corrections, versions
 *                   with no time on the axis, the bound. It feeds B81's PartialResult; nothing is shown complete by inference.
 *   THE TRACE       the server's staged nodes source → evidence → claim → product → decision; every reason it is incomplete in words; the
 *                   chapter continuity onto B81's DegradedContractView; the reconciliation offered only to the roles the rule admits, and
 *                   only while the trace IS incomplete — disabled with the reason otherwise (the server re-checks both).
 *
 * THREE CLAIMS: construction (this file and timeline-b50.test.ts — every value SYNTHETIC); demonstrated operation (the act); real acceptance
 * (PR-22-006 / AT-22: B111's recording path, then R2) — never claimed.
 */
import type { ExplainNode, TimelineAxis, TimelineDisclosure, TimelineItem, TimeValue, TraceNode } from './b50-seams';
import { partialOf, type DegradedState, type PartialDeclaration } from './degraded-b81';

type Row = Record<string, unknown>;

/* ── THE SERVER'S SHAPES (as the routes answer them) ── */
export type TimelineItemView = TimelineItem & {
  objectId: string; version: number; headerOnly: boolean; axisStart: string | null; axisEnd: string | null;
  times: Array<TimeValue & { axis: string; declared: boolean }> | null; timeStated: boolean; clockFlags: string[]; clockDetail: Row[];
  lifecycle: string; truthState: string; synthetic: boolean; classification: string; owner: string; digest: string; believedAtAsOf: boolean;
  correctedLater: (NonNullable<TimelineItem['correctedLater']> & { version: number; lifecycle: string; knownAtAsOf: boolean }) | null;
  correctionCases: Row[]; brokenLineage: Row[];
};
export type DisclosureView = TimelineDisclosure & {
  missing: Row[]; unattributedOpenRanges: number; withheldByReason: { classification: number; audience: number }; clock: Record<string, number>;
  brokenDetail: Row[]; correctionsLater: number; untimed: number; bounds: Row;
};
export interface TimelineView {
  method: string; subject: Row; window: { from: string; to: string; axis: TimelineAxis }; asOf: string; live: boolean; readAt: string; clearance: string;
  items: TimelineItemView[]; events: Row[]; asOfReads: Row; sources: string[]; disclosure: DisclosureView; claim: string;
}
export type TraceNodeView = TraceNode & { visible: boolean; clock: string; clockFlags: string[]; clockDetail: Row[]; correctedLater: Row | null; recordedAt: string | null;
  eventTime: string | null; observedAt: string | null; depth?: number };
export interface TraceView {
  method: string; ref: string; root: string; readAt: string; clearance: string; product: Row; subject: Row;
  nodes: TraceNodeView[]; steps: Array<ExplainNode & { of: string[] }>; edges: Row[]; unresolvedEdges: Row[]; gaps: Row[];
  decisionSnapshots: Row[]; sources: string[]; missingIntervals: Row[]; continuity: Row & { state: string; dependencies: Row[] };
  disclosure: Row; reasons: Array<{ reason: string; count: number; detail?: unknown }>; incomplete: boolean; reconciliation: Row[]; claim: string;
}

/* ── THE ASK AND THE DEEP LINK ── */
export const AXES: readonly TimelineAxis[] = ['event', 'observation', 'valid', 'record'];
export const AXIS_WORDS: Readonly<Record<TimelineAxis, { label: string; meaning: string }>> = {
  event: { label: 'Event time', meaning: 'when it happened, as the source states it' },
  observation: { label: 'Observation time', meaning: 'when it was observed' },
  valid: { label: 'Validity', meaning: 'when it holds' },
  record: { label: 'Record time', meaning: 'when the platform recorded it' },
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_RE = /^[A-Z]{3}$/;
const SCOPE_RE = /^[a-z][a-z0-9_.-]{2,62}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export interface TimelineAsk { subjectType: string | null; subjectId: string | null; scopeKey: string | null; axis: TimelineAxis; from: string; to: string; asOf: string | null }
const isInstant = (v: string) => /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(new Date(v).getTime());
/** A window bound as typed (a day, or an instant) → the instant the server reads: a day is its UTC start. */
export function boundInstant(v: string): string | null {
  const t = v.trim();
  if (DAY_RE.test(t)) return `${t}T00:00:00Z`;
  return isInstant(t) ? new Date(t).toISOString() : null;
}
export const DEFAULT_WINDOW = { from: '2020-01-01T00:00:00Z', to: '2100-01-01T00:00:00Z' } as const;
/** /graph/timeline?type=&id= | ?scope= &axis=&from=&to=&asOf= → the ask, or why the link cannot open one. */
export function parseTimelineLink(q: { get(k: string): string | null }): { ok: true; ask: TimelineAsk } | { ok: false; reason: string } | { ok: 'empty' } {
  const type = q.get('type'); const id = q.get('id'); const scope = q.get('scope');
  if (type === null && id === null && scope === null) return { ok: 'empty' };
  if ((type !== null || id !== null) && scope !== null) return { ok: false, reason: 'the link names both a subject and a scope; a timeline opens one of them' };
  if (scope !== null && !SCOPE_RE.test(scope)) return { ok: false, reason: `“${scope}” is not the key of a governed scope` };
  if (scope === null && (type === null || !TYPE_RE.test(type))) return { ok: false, reason: 'the link names no object type (three capitals, e.g. CLM)' };
  if (scope === null && (id === null || !UUID_RE.test(id))) return { ok: false, reason: 'the link names no object id (a uuid)' };
  const axis = (q.get('axis') ?? 'record') as TimelineAxis;
  if (!AXES.includes(axis)) return { ok: false, reason: `“${axis}” is not an axis (${AXES.join(', ')})` };
  const from = q.get('from') === null ? DEFAULT_WINDOW.from : boundInstant(q.get('from') as string);
  const to = q.get('to') === null ? DEFAULT_WINDOW.to : boundInstant(q.get('to') as string);
  if (from === null || to === null) return { ok: false, reason: 'the window bounds are not instants' };
  if (new Date(to).getTime() <= new Date(from).getTime()) return { ok: false, reason: 'the window ends before it starts' };
  const asOfRaw = q.get('asOf');
  const asOf = asOfRaw === null ? null : (isInstant(asOfRaw) ? new Date(asOfRaw).toISOString() : undefined);
  if (asOf === undefined) return { ok: false, reason: 'the as-of instant is not an instant' };
  return { ok: true, ask: { subjectType: scope === null ? type : null, subjectId: scope === null ? (id as string).toLowerCase() : null, scopeKey: scope, axis, from, to, asOf } };
}
export function timelineHref(a: TimelineAsk): string {
  const p = new URLSearchParams();
  if (a.scopeKey !== null) p.set('scope', a.scopeKey); else { p.set('type', a.subjectType ?? ''); p.set('id', a.subjectId ?? ''); }
  p.set('axis', a.axis);
  if (a.from !== DEFAULT_WINDOW.from) p.set('from', a.from);
  if (a.to !== DEFAULT_WINDOW.to) p.set('to', a.to);
  if (a.asOf !== null) p.set('asOf', a.asOf);
  return `/graph/timeline?${p.toString()}`;
}
export const traceHref = (type: string, id: string, version: number): string => `/graph/trace/${encodeURIComponent(type)}/${encodeURIComponent(id)}?version=${version}`;
export function parseTraceLink(type: string | undefined, id: string | undefined, version: string | null): { ok: true; type: string; id: string; version: number } | { ok: false; reason: string } {
  if (type === undefined || !TYPE_RE.test(type)) return { ok: false, reason: 'the link names no object type (three capitals, e.g. CLM)' };
  if (id === undefined || !UUID_RE.test(id)) return { ok: false, reason: 'the link names no object id (a uuid)' };
  if (version === null || !/^[1-9][0-9]{0,8}$/.test(version)) return { ok: false, reason: 'the link names no version (?version=<n>)' };
  return { ok: true, type, id: id.toLowerCase(), version: Number(version) };
}

/* ── THE SCRUBBER (record time) ── */
export interface Stop { at: string; label: string }
/** The record instants the answer carries (each version, each ledger event), ascending and unique; the live read is the last stop. */
export function scrubberStops(v: Pick<TimelineView, 'items' | 'events'>): Stop[] {
  const at = new Set<string>();
  for (const i of v.items) at.add(i.recordedAt);
  for (const e of v.events) if (typeof e['at'] === 'string') at.add(e['at'] as string);
  return [...at].sort((a, b) => new Date(a).getTime() - new Date(b).getTime()).map((x) => ({ at: x, label: `as recorded at ${instantText(x)}` }))
    .concat([{ at: 'now', label: 'now — the live read' }]);
}
export function stopIndex(stops: readonly Stop[], asOf: string | null): number {
  if (asOf === null) return stops.length - 1;
  const t = new Date(asOf).getTime();
  let best = 0;
  stops.forEach((s, i) => { if (s.at !== 'now' && new Date(s.at).getTime() <= t) best = i; });
  return best;
}

/* ── WORDS ── */
/** An instant in UTC words, to the second; a DATE (YYYY-MM-DD) renders as the day it names — never shifted by a zone. */
export function instantText(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return 'none stated';
  if (DAY_RE.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}
export const CLOCK_WORDS: Readonly<Record<string, { glyph: string; word: string; meaning: string }>> = {
  trusted: { glyph: '●', word: 'TRUSTED CLOCK', meaning: 'the source clock is trusted and agrees with the record clock' },
  degraded: { glyph: '◐', word: 'DEGRADED CLOCK', meaning: 'the source states its clock is degraded — its times may be off' },
  unknown: { glyph: '?', word: 'UNKNOWN CLOCK', meaning: 'the source states its clock is unknown — its times are as stated, not verified' },
  observation_after_record: { glyph: '⇄', word: 'OBSERVED AFTER RECORDED', meaning: 'it was observed after the platform recorded it — the two clocks diverge' },
  conflict: { glyph: '≠', word: 'TIMES CONFLICT', meaning: 'the sources state different times for it' },
};
export function clockWord(clock: string): { glyph: string; word: string; meaning: string; known: boolean } {
  const w = CLOCK_WORDS[clock];
  return w === undefined ? { glyph: '?', word: clock.toUpperCase(), meaning: 'not a known clock reading — shown as the server stated it', known: false } : { ...w, known: true };
}
export const REASON_WORDS: Readonly<Record<string, string>> = {
  broken_lineage: 'a citation or lineage edge does not resolve',
  evidence_unavailable: 'evidence is unavailable: broken custody or an unverifiable artifact',
  time_conflict: 'the sources state conflicting times',
  clock_divergence: 'the clocks diverge (observed after recorded, or a degraded source clock)',
  clock_unknown: 'a source states its clock is unknown (its own limitation)',
  missing_interval: 'a source has a missing interval',
  continuity_degraded: 'a source the trace rests on is degraded',
  policy_filtered: 'some nodes are not shown to you (policy)',
  bounded: 'the trace reached its bound',
};
export const reasonText = (r: { reason: string; count: number }): string => `${REASON_WORDS[r.reason] ?? `${r.reason} (as the server states it)`} — ${r.count}`;

export interface ItemLine { title: string; times: Array<{ label: string; value: string }>; clock: ReturnType<typeof clockWord>; believed: string; correction: string | null; broken: string[] }
export function itemLine(i: TimelineItemView): ItemLine {
  const c = i.correctedLater;
  return {
    title: i.title,
    times: [
      { label: 'Event time', value: instantText(i.eventTime) }, { label: 'Observation time', value: instantText(i.observedAt) },
      { label: 'Valid', value: i.validFrom === null ? 'none stated' : `${instantText(i.validFrom)} to ${i.validTo === null ? 'open' : instantText(i.validTo)}` },
      { label: 'Record time', value: instantText(i.recordedAt) },
    ],
    clock: clockWord(i.clock),
    believed: i.believedAtAsOf ? 'believed at the instant' : 'superseded by a later version known at the instant',
    correction: c === null ? null : `corrected on ${instantText(c.at)} by ${c.by} (version ${c.version}, ${c.lifecycle})${c.knownAtAsOf ? '' : ' — not yet known at the instant'}`,
    broken: i.brokenLineage.map((b) => `${String(b['ref'])} — ${String(b['state'])}${b['reason'] === undefined || b['reason'] === null ? '' : `: ${String(b['reason'])}`}`),
  };
}

/* ── THE DISCLOSURE: one line per kind, always ── */
export const DISCLOSURE_KEYS = ['missing', 'withheld', 'clock', 'broken', 'corrections', 'untimed', 'bounds'] as const;
export type DisclosureKey = (typeof DISCLOSURE_KEYS)[number];
export interface DisclosureLine { key: DisclosureKey; tone: 'neutral' | 'attention'; text: string; detail: string[] }
export function disclosureLines(d: DisclosureView): DisclosureLine[] {
  const n = (x: number, one: string, many: string) => `${x} ${x === 1 ? one : many}`;
  const missing = d.missing.map((m) => `${String(m['source_key'])}: ${instantText(String(m['from'] ?? ''))} to ${m['to'] === null || m['to'] === undefined ? 'open' : instantText(String(m['to']))} — ${String(m['reason'])}${m['resolved_later'] === true ? ' (resolved later, not known at the instant)' : m['resolved_at'] ? ` (resolved ${instantText(String(m['resolved_at']))})` : ''}${m['placed'] === false ? ' (its bounds are not instants: not placed on the axis)' : ''}`);
  const clockParts = Object.entries(d.clock).filter(([, v]) => v > 0).map(([k, v]) => `${clockWord(k).word.toLowerCase()} ${v}`);
  const lines: DisclosureLine[] = [
    { key: 'missing', tone: d.missing.length > 0 ? 'attention' : 'neutral', detail: missing,
      text: d.missing.length === 0 ? `Missing intervals: none declared for the sources these rest on${d.unattributedOpenRanges > 0 ? ` (${d.unattributedOpenRanges} open range(s) of other sources of the domain are not attributed here)` : ''}` : `Missing intervals: ${n(d.missing.length, 'interval', 'intervals')}` },
    { key: 'withheld', tone: d.withheld.count > 0 ? 'attention' : 'neutral', detail: [],
      text: d.withheld.count === 0 ? 'Policy filtering: nothing withheld from you' : `Policy filtering: ${n(d.withheldByReason.classification, 'version', 'versions')} withheld above your clearance; ${n(d.withheldByReason.audience, 'version', 'versions')} shown header-only (audience) — counted, their content not shown` },
    { key: 'clock', tone: d.clockFlags > 0 ? 'attention' : 'neutral', detail: [],
      text: d.clockFlags === 0 ? 'Clock skew: none flagged' : `Clock skew: ${n(d.clockFlags, 'version', 'versions')} flagged (${clockParts.join(', ')})` },
    { key: 'broken', tone: d.brokenLineage.length > 0 ? 'attention' : 'neutral', detail: d.brokenLineage.map((b) => `${b.ref} cites ${b.cites}`),
      text: d.brokenLineage.length === 0 ? 'Broken lineage: every citation resolves' : `Broken lineage: ${n(d.brokenLineage.length, 'citation does', 'citations do')} not resolve` },
    { key: 'corrections', tone: 'neutral', detail: [],
      text: d.correctionsLater === 0 ? 'Later corrections: none recorded' : `Later corrections: ${n(d.correctionsLater, 'version was', 'versions were')} corrected later — each says when` },
    { key: 'untimed', tone: d.untimed > 0 ? 'attention' : 'neutral', detail: [],
      text: d.untimed === 0 ? 'Every version carries a time on this axis' : `${n(d.untimed, 'version carries', 'versions carry')} no time on this axis and ${d.untimed === 1 ? 'is' : 'are'} not placed (counted, not dropped)` },
    { key: 'bounds', tone: d.bounds['truncated'] === true ? 'attention' : 'neutral', detail: [],
      text: d.bounds['truncated'] === true ? `Bounded: ${String(d.bounds['listed'])} of ${String(d.bounds['matched'])} versions listed — narrow the window to read the rest` : `All ${String(d.bounds['matched'] ?? 0)} matching versions listed` },
  ];
  return lines;
}
/** B81's PartialResult declaration from the disclosure: incomplete is never complete-styled. */
export function partialFromDisclosure(d: DisclosureView): PartialDeclaration {
  return partialOf({
    missingIntervals: d.missing.map((m) => ({ from: instantText(String(m['from'] ?? '')), to: m['to'] === null || m['to'] === undefined ? 'open' : instantText(String(m['to'])) })),
    filters: [
      ...(d.withheldByReason.classification > 0 ? [`${d.withheldByReason.classification} withheld above your clearance`] : []),
      ...(d.withheldByReason.audience > 0 ? [`${d.withheldByReason.audience} shown header-only`] : []),
      ...(d.clockFlags > 0 ? [`${d.clockFlags} with a clock flag`] : []),
      ...(d.brokenLineage.length > 0 ? [`${d.brokenLineage.length} citation(s) that do not resolve`] : []),
    ],
    bounds: d.bounds['truncated'] === true ? `${String(d.bounds['listed'])} of ${String(d.bounds['matched'])} listed` : null,
    impact: 'what is missing, withheld or unresolved may change what this timeline says was known',
  });
}

/* ── THE TRACE ── */
export const STAGES: ReadonlyArray<TraceNode['stage']> = ['source', 'evidence', 'claim', 'product', 'decision'];
export const STAGE_WORDS: Readonly<Record<TraceNode['stage'], string>> = { source: 'Sources', evidence: 'Evidence', claim: 'Claims', product: 'Products', decision: 'Decisions' };
/** The nodes per stage in the trace's order; a stage the server did not state is never invented, an empty stage says so. */
export function stagesOf(nodes: readonly TraceNodeView[]): Array<{ stage: TraceNode['stage']; label: string; nodes: TraceNodeView[] }> {
  return STAGES.map((s) => ({ stage: s, label: STAGE_WORDS[s], nodes: nodes.filter((n) => n.stage === s) }));
}
export function traceSummary(t: Pick<TraceView, 'incomplete' | 'reasons'>): { complete: boolean; text: string } {
  if (!t.incomplete) return { complete: true, text: 'every edge resolves, every clock is trusted, no interval is missing and nothing is withheld from you' };
  return { complete: false, text: t.reasons.map(reasonText).join('; ') };
}
/** The continuity onto B81's DegradedState (DegradedContractView): the contracts in force and the undeclared degradations, as evaluated. */
export function continuityState(t: Pick<TraceView, 'continuity' | 'readAt'>): DegradedState | null {
  if (t.continuity.state !== 'degraded') return null;
  const deps = t.continuity.dependencies;
  const all = <T,>(k: string) => deps.flatMap((d) => (Array.isArray(d[k]) ? (d[k] as T[]) : []));
  const contracts = all<DegradedState['contracts'][number]>('contracts');
  return { read_at: t.readAt, tenant_id: null, domain_id: null, contracts, undeclared: all<DegradedState['undeclared'][number]>('undeclared'),
    unavailable_functions: all<DegradedState['unavailable_functions'][number]>('unavailable_functions'), degraded: true, unknown: contracts.filter((c) => c.mode === 'unknown').length };
}
/** The roles graph.timeline.reconcile admits (apps/api/src/policy/pdp.service.ts B50 tl — the test reads the file and compares). */
export const RECONCILE_ROLES: readonly string[] = ['knowledge_owner', 'data_steward', 'record_authority', 'domain_analyst', 'domain_admin', 'forecast_owner', 'decision_owner', 'strategy_owner', 'risk_owner'];
export function reconcileCommand(t: Pick<TraceView, 'incomplete' | 'reconciliation' | 'reasons'>, roles: readonly string[], isHuman: boolean, isOwner: boolean, note: string): { enabled: boolean; reason: string | null } {
  if (!isHuman) return { enabled: false, reason: 'a reconciliation is routed by a person, never an agent' };
  if (!t.incomplete) return { enabled: false, reason: 'the trace is complete — there is nothing to reconcile' };
  if (!isOwner && !roles.some((r) => RECONCILE_ROLES.includes(r))) return { enabled: false, reason: 'your roles here do not route a reconciliation (the product\'s owner, a knowledge owner, a data steward, a record authority or an analyst does)' };
  if (note.trim().length < 8) return { enabled: false, reason: 'say what the owner should reconcile (8 characters or more)' };
  return { enabled: true, reason: null };
}
