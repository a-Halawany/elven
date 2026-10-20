/**
 * B50 §PV (0120_b50_x_pv; F-P3-03 + HX-14) — PROVENANCE, EXPLANATION, UNFIT AND THE CONTEST PATH as pure functions. components/knowledge.tsx
 * (the §PV block: ExplainPath, FitnessNote) and the pages /graph/explain/[type]/[id] and /graph/challenges render what these decide.
 *
 *   THE PATH        the server's explanation nodes ordered backward from the product (each node once, at its nearest depth; a node the path
 *                   does not reach is listed apart, never dropped); every outcome IN WORDS (denied, abstained, challenged, overridden,
 *                   corrected, failed, unresolved) — colour is never the only signal; the boundaries crossed, the TOOL boundary said to be
 *                   carried (B70), never shown as covered.
 *   THE FITNESS     the evaluation and the RECORDED mark kept apart: only the mark refuses use; an evaluation that did not examine the whole
 *                   history is "not determined", never fit; nothing is shown fit, current or accepted by inference.
 *   THE COMPARE     a version pair onto B80's DiffViewer (the header fields and the payload's JSON pointers, the record as recorded).
 *   THE CONTEST     a challenge's state in words and the acts a person may take, each disabled WITH its reason (reviewer ≠ opener ≠ owner; only
 *                   the reviewer decides; escalation only when overdue on the server's clock); a decision or a run is routed to its own path.
 *   THE DEEP LINK   /graph/explain/<TYPE>/<id>?version=<n> opens exactly what it names, or says why it cannot.
 *
 * THREE CLAIMS: construction (this file and provenance-b50.test.ts — every value SYNTHETIC); demonstrated operation (the act); real
 * acceptance — never claimed.
 */
import type { ExplainNode, ExplainNodeOutcome } from './b50-seams';

/* ── THE SERVER'S SHAPES (as the routes answer them) ── */
export type Boundary = NonNullable<ExplainNode['boundary']>;
export interface ExplainView {
  ref: string; root: string; method: string; asOf: string;
  product: { type: string; id: string; version: number; digest: string | null; label: string | null; outcome: string | null };
  nodes: Array<ExplainNode & { depth?: number; digest?: string; classification?: string }>;
  outcomes: Partial<Record<ExplainNodeOutcome, number>>;
  boundaries: Partial<Record<Exclude<Boundary, 'tool'>, number>> & { tool?: { nodes: number; state: string; carrier: string } };
  gaps: Array<{ kind: string; ref: string; at: string; reason: string }>;
  truncated: boolean; incomplete: boolean; examined: number; bounds: { max_depth: number; max_nodes: number };
  carried: Array<{ what: string; state: string; carrier: string }>;
  forward: Record<string, unknown> & { preview: boolean };
}
export interface FitnessView {
  ref: string;
  evaluation: { ref: string; verdict: 'fit' | 'unfit' | 'unknown'; reasons: string[]; gaps: string[]; examined: number; truncated: boolean; ruleVersion: string; evaluatedAt: string };
  mark: null | { mark_id: string; verdict: 'fit' | 'unfit' | 'unknown'; reasons: string[]; route: 'recompute' | 'adjudication' | null; marked_by: string; marked_at: string; note: string };
  refusesUse: boolean;
  history: Array<{ mark_id: string; verdict: string; reasons: string[]; marked_at: string; marked_by: string; route: string | null }>;
}
export type ChallengeState = 'open' | 'under_review' | 'upheld' | 'dismissed' | 'withdrawn';
export interface Challenge {
  challenge_id: string; state: ChallengeState; grounds: string; opened_by: string; reviewer: string | null; decided_by: string | null; review_by: string;
  overdue: boolean; escalations: number;
  subject: { kind: string; type: string; id: string; version: number; owner: string | null };
}

/* ── THE OUTCOMES IN WORDS ── */
export const OUTCOME_WORDS: Readonly<Record<ExplainNodeOutcome, { word: string; tone: 'neutral' | 'attention' | 'critical' }>> = {
  ok: { word: 'recorded', tone: 'neutral' },
  denied: { word: 'DENIED', tone: 'critical' },
  abstained: { word: 'ABSTAINED', tone: 'attention' },
  challenged: { word: 'CHALLENGED', tone: 'attention' },
  overridden: { word: 'OVERRIDDEN', tone: 'attention' },
  corrected: { word: 'CORRECTED', tone: 'attention' },
  failed: { word: 'FAILED', tone: 'critical' },
  unresolved: { word: 'UNRESOLVED', tone: 'critical' },
};
const NOT_OK: ExplainNodeOutcome[] = ['denied', 'abstained', 'challenged', 'overridden', 'corrected', 'failed', 'unresolved'];

export const KIND_WORDS: Readonly<Record<string, string>> = {
  product: 'product', evidence: 'evidence', source: 'source', claim: 'claim', method: 'method', model_call: 'model call', agent_run: 'agent run', review: 'review',
  approval: 'approval', signature: 'signature', policy_decision: 'policy decision', workflow: 'workflow', human_action: 'person', correction: 'correction',
};

/** The outcomes other than "recorded", counted, in words — or that none is RECORDED (never "none happened"). */
export function outcomeSummary(nodes: Array<Pick<ExplainNode, 'outcome'>>): string {
  const n = (o: ExplainNodeOutcome) => nodes.filter((x) => x.outcome === o).length;
  const parts = NOT_OK.filter((o) => n(o) > 0).map((o) => `${n(o)} ${OUTCOME_WORDS[o].word.toLowerCase()}`);
  return parts.length === 0 ? 'no denied, abstained, challenged, overridden, corrected, failed or unresolved path is recorded' : parts.join(' · ');
}

/* ── THE PATH ── */
export interface PathRow { node: ExplainView['nodes'][number]; depth: number; via: string | null }
/** The nodes ordered backward from the root (breadth first over `parents`), each once at its nearest depth; the unreached listed apart. */
export function explainPath(view: Pick<ExplainView, 'root' | 'nodes'>): { rows: PathRow[]; unreached: ExplainView['nodes'] } {
  const byId = new Map(view.nodes.map((n) => [n.nodeId, n] as const));
  const rows: PathRow[] = []; const seen = new Set<string>();
  const queue: Array<{ id: string; depth: number; via: string | null }> = [{ id: view.root, depth: 0, via: null }];
  while (queue.length > 0) {
    const q = queue.shift()!;
    if (seen.has(q.id)) continue;
    const node = byId.get(q.id);
    if (node === undefined) continue;
    seen.add(q.id);
    rows.push({ node, depth: q.depth, via: q.via });
    for (const p of node.parents) if (!seen.has(p)) queue.push({ id: p, depth: q.depth + 1, via: q.id });
  }
  return { rows, unreached: view.nodes.filter((n) => !seen.has(n.nodeId)) };
}

/** One node in words: its kind, its label, its outcome, its boundary, its actor and instant (absent ones said, never blank). */
export function nodeLine(n: ExplainNode): { title: string; outcome: string; tone: 'neutral' | 'attention' | 'critical'; meta: string } {
  const o = OUTCOME_WORDS[n.outcome];
  const meta = [n.boundary === undefined ? null : `${n.boundary} boundary`, n.actor === null ? 'actor not recorded' : `by ${n.actor}`, n.at === null ? 'time not recorded' : `at ${n.at}`,
    n.span === null || n.span === undefined ? null : `bytes ${n.span.start}–${n.span.end}`].filter((x): x is string => x !== null).join(' · ');
  return { title: `${KIND_WORDS[n.kind] ?? n.kind}: ${n.label}`, outcome: o.word, tone: o.tone, meta };
}

export const BOUNDARIES: readonly Boundary[] = ['synchronous', 'event', 'workflow', 'agent', 'model', 'human', 'tool'];
/** The boundaries the path crosses, each with its count; the TOOL boundary is carried (no tool gateway exists) and said so. */
export function boundaryCoverage(b: ExplainView['boundaries']): Array<{ boundary: Boundary; nodes: number; statement: string }> {
  return BOUNDARIES.map((k) => {
    if (k === 'tool') {
      const t = b.tool;
      return { boundary: k, nodes: t?.nodes ?? 0, statement: t === undefined ? 'not stated by the server' : `${t.state} — ${t.carrier}` };
    }
    const n = Number(b[k] ?? 0);
    return { boundary: k, nodes: n, statement: n === 0 ? 'no node recorded across this boundary' : `${n} node${n === 1 ? '' : 's'} recorded` };
  });
}

/** Whether the path is the whole recorded history, in words: the gaps and the bound named; never "complete" by inference. */
export function completenessNote(v: Pick<ExplainView, 'incomplete' | 'truncated' | 'gaps' | 'examined' | 'bounds'>): { complete: boolean; text: string } {
  if (v.truncated) return { complete: false, text: `INCOMPLETE — the walk reached its bound (depth ${v.bounds.max_depth}, ${v.bounds.max_nodes} versions) after ${v.examined}; history beyond it was not examined${v.gaps.length > 0 ? `; ${v.gaps.length} gap${v.gaps.length === 1 ? '' : 's'} found` : ''}` };
  if (v.incomplete || v.gaps.length > 0) return { complete: false, text: `INCOMPLETE — ${v.gaps.length} gap${v.gaps.length === 1 ? '' : 's'} in the recorded lineage (${[...new Set(v.gaps.map((g) => g.kind.replace(/_/g, ' ')))].join(', ')})` };
  return { complete: true, text: `the whole recorded lineage was examined (${v.examined} version${v.examined === 1 ? '' : 's'}); every reference resolved` };
}

/* ── THE FITNESS ── */
const reasonWords = (r: string[]) => r.map((x) => x.replace(/_/g, ' ')).join(', ');
/** The recorded mark FIRST (it alone refuses use), the evaluation beside it; never fit by inference. */
export function fitnessNote(f: FitnessView): { headline: string; refusesUse: boolean; evaluation: string; tone: 'neutral' | 'attention' | 'critical' } {
  const ev = f.evaluation;
  const evaluation = ev.verdict === 'unfit' ? `the evaluation (${ev.ruleVersion}) finds it unfit: ${reasonWords(ev.reasons)}`
    : ev.verdict === 'unknown' || ev.truncated ? `the evaluation (${ev.ruleVersion}) could not determine it: the history beyond the bound was not examined`
    : `the evaluation (${ev.ruleVersion}) found no gap in the ${ev.examined} recorded version${ev.examined === 1 ? '' : 's'} it examined`;
  if (f.mark !== null && f.mark.verdict === 'unfit') {
    return { headline: `MARKED UNFIT (${reasonWords(f.mark.reasons)}) — consequential use and export are refused; routed to ${f.mark.route ?? 'no route'}`, refusesUse: true, evaluation, tone: 'critical' };
  }
  if (ev.verdict === 'unfit') {
    return { headline: 'NOT MARKED — the evaluation finds gaps; use is refused only once a person records the mark', refusesUse: false, evaluation, tone: 'attention' };
  }
  if (f.mark === null) return { headline: 'NOT MARKED — no fitness mark is recorded for this version', refusesUse: false, evaluation, tone: 'neutral' };
  return { headline: `marked ${f.mark.verdict} at ${f.mark.marked_at}`, refusesUse: false, evaluation, tone: 'neutral' };
}

/** The mark command: who may record it and what it needs (a route when the evaluation finds it unfit) — disabled with its reason. */
export function markCommand(f: FitnessView, canMark: boolean, route: string): { enabled: boolean; reason: string | null } {
  if (!canMark) return { enabled: false, reason: 'recording a fitness mark is a knowledge owner\'s, data steward\'s or domain administrator\'s act' };
  if (f.evaluation.verdict === 'unfit' && route !== 'recompute' && route !== 'adjudication') return { enabled: false, reason: 'the evaluation finds it unfit: choose where the mark routes it (recompute or adjudication)' };
  return { enabled: true, reason: null };
}

/* ── THE COMPARE (onto B80's DiffViewer) ── */
/** A record flattened to JSON pointers (a payload compared leaf by leaf; arrays by position). */
export function flattenPointers(v: unknown, prefix = ''): Record<string, unknown> {
  if (v === null || typeof v !== 'object') return { [prefix === '' ? '/' : prefix]: v };
  const out: Record<string, unknown> = {};
  const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) out[prefix === '' ? '/' : prefix] = Array.isArray(v) ? '[]' : '{}';
  for (const [k, x] of entries) Object.assign(out, flattenPointers(x, `${prefix}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`));
  return out;
}
/** The two sides DiffViewer compares: the header fields as recorded beside the payload pointers (`payload/…`). */
export function compareSides(record: Record<string, unknown> | null): Record<string, unknown> | null {
  if (record === null) return null;
  const { payload, ...header } = record;
  const p = flattenPointers(payload ?? {});
  return { ...header, ...Object.fromEntries(Object.entries(p).map(([k, x]) => [`payload${k === '/' ? '' : k}`, typeof x === 'object' && x !== null ? JSON.stringify(x) : x])) };
}

/* ── THE CONTEST ── */
export const CHALLENGE_STATE_WORDS: Readonly<Record<ChallengeState, string>> = {
  open: 'OPEN — awaiting a reviewer', under_review: 'UNDER REVIEW', upheld: 'UPHELD — the product\'s fitness evaluation reads it', dismissed: 'DISMISSED', withdrawn: 'WITHDRAWN by its opener',
};
/** The subjects a knowledge challenge takes; a decision and a run are routed to their own paths (never duplicated). */
export function challengeRoute(type: string): { allowed: boolean; statement: string } {
  if (['CLM', 'ENT', 'EVT', 'REL', 'ASM', 'WRN', 'FCT'].includes(type)) return { allowed: true, statement: 'a knowledge challenge (open → under review → upheld, dismissed or withdrawn)' };
  if (['DPK', 'DEC', 'APR', 'CMT'].includes(type)) return { allowed: false, statement: 'a decision is contested through its appeal (B35) or its gate challenge (B36)' };
  if (type === 'SIM') return { allowed: false, statement: 'a simulation run is contested through its simulation challenge (B21)' };
  return { allowed: false, statement: `${type} is not a decision-active intelligence product (claims, assessments, warnings, forecasts are)` };
}
export type ChallengeAct = 'review' | 'decide' | 'withdraw' | 'escalate' | 'evidence';
/** Each act on a challenge for this person: enabled, or disabled WITH its reason (the server re-checks every one). */
export function challengeActs(ch: Challenge, me: { principalId: string; steward: boolean; domainAdmin: boolean }): Record<ChallengeAct, { enabled: boolean; reason: string | null }> {
  const live = ch.state === 'open' || ch.state === 'under_review';
  const party = me.principalId === ch.opened_by || me.principalId === ch.subject.owner || me.principalId === ch.reviewer;
  const off = (reason: string) => ({ enabled: false, reason });
  const on = { enabled: true, reason: null };
  return {
    review: ch.state !== 'open' ? off(`the challenge is ${ch.state.replace('_', ' ')}; a review is started on an open challenge`)
      : !me.steward ? off('a review is a knowledge owner\'s, data steward\'s or domain administrator\'s act')
      : me.principalId === ch.opened_by ? off('the opener never reviews their own challenge')
      : me.principalId === ch.subject.owner ? off('the subject\'s owner never reviews a challenge of it') : on,
    decide: ch.state !== 'under_review' ? off('a challenge is decided under review') : me.principalId !== ch.reviewer ? off('only the reviewer who took it decides it') : on,
    withdraw: !live ? off(`the challenge is ${ch.state.replace('_', ' ')}; only a live challenge is withdrawn`) : me.principalId !== ch.opened_by ? off('only its opener withdraws a challenge') : on,
    escalate: !live ? off('only a live challenge is escalated') : !ch.overdue ? off(`not overdue: the review is due by ${ch.review_by} (the server's clock decides)`)
      : !(party || me.domainAdmin || me.steward) ? off('an overdue challenge is escalated by a party to it or a domain administrator') : on,
    evidence: !live ? off('evidence is submitted while the challenge is live') : !party ? off('evidence is submitted by a party (the opener, the subject\'s owner, the reviewer)') : on,
  };
}

/* ── THE DEEP LINK ── */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const explainHref = (type: string, id: string, version: number): string => `/graph/explain/${encodeURIComponent(type)}/${encodeURIComponent(id)}?version=${version}`;
/** The link's parameters, exactly — or why it cannot open what it names. */
export function parseExplainLink(type: string | undefined, id: string | undefined, version: string | null): { ok: true; type: string; id: string; version: number } | { ok: false; reason: string } {
  if (type === undefined || !/^[A-Z]{3}$/.test(type)) return { ok: false, reason: `this link names no object type (three capitals, e.g. CLM); it named ${type === undefined || type === '' ? 'none' : `"${type}"`}` };
  if (id === undefined || !UUID.test(id)) return { ok: false, reason: 'this link names no object id (a uuid); check the link you followed' };
  if (version === null || !/^[1-9][0-9]{0,8}$/.test(version)) return { ok: false, reason: 'this link names no version (?version=<n>); an explanation is of one recorded version — add the version to the link' };
  return { ok: true, type, id: id.toLowerCase(), version: Number(version) };
}

/* ── THE ALIGNMENT IN WORDS ── */
export function alignmentWords(a: { verdict: string; summary: Record<string, number> }): string {
  const s = a.summary;
  const n = (k: string) => Number(s[k] ?? 0);
  const base = `${n('citations')} citation${n('citations') === 1 ? '' : 's'}: ${n('bound')} bound to evidence, ${n('unsupported_labelled')} unsupported but labelled, ${n('unsupported_unlabelled')} unsupported and unlabelled, ${n('unresolved')} not resolving`;
  return a.verdict === 'misaligned' ? `MISALIGNED — ${base}` : `aligned — ${base}`;
}
