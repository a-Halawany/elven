/**
 * The comparability client — CP-6 B92 §CO (0113 §CO; PR-70-005, PR-70-006, AT-70, DP-44-001). §CO has no page of its own: §MD's metric
 * catalog and §OR's operating review show these reads (a result's STANDING EVALUATION, a cohort comparison with its uncertainty, the cost
 * reconciliation, the governed semantic objects).
 *
 * Every response is returned VERBATIM. The helpers below only WORD what the record says — a failing check by its class word, an
 * indeterminate comparison AS indeterminate with its reasons (never a zero or a dash that reads like one), a reconciliation that is not
 * `matched` with what it names — they never compute, judge or decide. BOUNDARY: the signed acceptance (AT-70, PR-70-006) → R2.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type CheckStatus = 'pass' | 'fail' | 'not_evaluable' | 'not_declared';
export interface Check { check: string; status: CheckStatus; detail: unknown }
export interface Evaluation { reasons: string[]; checks: Check[]; by: string; failed?: string[]; evaluated_as_of?: string | null }
export interface ComparisonSide { result_id: string; period: string; scope_key: string | null; cohort: Row; state: string; value: number | string | null; n: number | null;
  uncertainty: Row | null; definition_version: number; cohort_object: Row | null }
export interface Comparison {
  comparison_id: string; metric_key: string; kind: string; state: 'determinate' | 'indeterminate'; estimate: number | string | null; interval: Row | null; method: string | null;
  claim: string; sides: { a: ComparisonSide; b: ComparisonSide }; composition: Row; comparability: Row; reasons: string[]; digest: string; run_by_kind: string; run_at: string;
  cohort_object_a: Row | null; cohort_object_b: Row | null;
}
export type UnitClass = 'matched' | 'unpriced' | 'discrepant';
export interface ReconciliationUnit { class: UnitClass; result_id?: string; usage_id?: string; metric_key?: string; unit?: string; metered?: number; measured?: number; amount?: number; currency?: string; note?: string }
export interface Reconciliation {
  reconciliation_id: string; period_key: string; window_from: string; window_to: string; tolerance: number; outcome: 'matched' | 'unpriced' | 'discrepant' | 'empty';
  units: ReconciliationUnit[]; counts: { matched: number; unpriced: number; discrepant: number; units: number }; totals: Row; reasons: string[]; digest: string; run_at: string;
}
export interface SemanticObject {
  object_id: string; object_key: string; kind: 'cohort' | 'relationship' | 'analytical_model'; title: string; owner_principal_id: string; current_version: number; certified_version: number | null;
  last_valid_version: number | null; state: string; standing: string; versions?: Row[]; certifications?: Row[]; uses?: Row[]; definition?: Row; digest?: string;
}

/* ───────────── the words ───────────── */
/** The class words of the standing evaluation (0113 §CO.3), in the order the database lists them, and what each one MEANS for a reader. */
export const CHECKS: Record<string, string> = {
  stale: 'the source went quiet: the newest record is older than the definition allows',
  incomplete: 'too much of the population is excluded for the rest to stand for it',
  biased: 'a declared cohort is under-represented (or the check could not be evaluated)',
  synthetic_share: 'too much of the population is synthetic (a substitute, never the measure)',
  replay_share: 'too much of the population is replayed world-clock records',
  non_comparable: 'the definition changed inside the window, or the clocks are mixed',
  gamed: 'an improvement bought by exclusion, or a threshold re-drawn across the value',
  privacy: 'beyond an approved purpose, a person-grained cohort, or k not established',
  outcome_detached: 'the objective the measure serves is withdrawn, closed or absent',
};
/** A check's status as a glyph, a token and words — never colour alone; a failure is never softened, an unevaluable check never reads as a pass. */
export function checkMark(status: string): { glyph: string; token: string; text: string } {
  switch (status) {
    case 'pass': return { glyph: '✓', token: '--eye-color-success', text: 'PASSES' };
    case 'fail': return { glyph: '✕', token: '--eye-color-critical', text: 'FAILS — the result is indeterminate' };
    case 'not_evaluable': return { glyph: '?', token: '--eye-color-warning', text: 'NOT EVALUABLE (said, not assumed)' };
    case 'not_declared': return { glyph: '○', token: '--eye-color-ink-muted', text: 'NOT DECLARED by the definition' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(status).toUpperCase() };
  }
}
/** The failing checks first, then the rest, each worded with its meaning — the drill-down's evaluation list. */
export function evaluationLines(e: Evaluation | null | undefined): Array<{ check: string; status: string; line: string }> {
  if (e === null || e === undefined || !Array.isArray(e.checks)) return [];
  const order = (s: string) => (s === 'fail' ? 0 : s === 'not_evaluable' ? 1 : s === 'pass' ? 2 : 3);
  return [...e.checks].sort((a, b) => order(a.status) - order(b.status))
    .map((c) => ({ check: c.check, status: c.status, line: `${checkMark(c.status).glyph} ${c.check.replace(/_/g, ' ')} — ${checkMark(c.status).text}${c.status === 'fail' ? `: ${CHECKS[c.check] ?? ''}` : ''}` }));
}
/** A comparison in one line: a determinate one with its estimate, interval and claim; an indeterminate one AS indeterminate with its reasons. */
export function comparisonLine(c: Pick<Comparison, 'state' | 'kind' | 'estimate' | 'interval' | 'claim' | 'reasons'>): string {
  if (c.state !== 'determinate' || c.estimate === null || c.estimate === undefined) {
    const why = Array.isArray(c.reasons) && c.reasons.length > 0 ? c.reasons.join('; ') : 'no reason recorded';
    return `INDETERMINATE — no difference is shown (${why})`;
  }
  if (c.kind === 'rate' && c.interval !== null && c.interval['lo'] !== undefined) {
    return `difference ${fmt(c.estimate)} (95 % interval ${fmt(c.interval['lo'])} to ${fmt(c.interval['hi'])}) — ${c.claim}`;
  }
  return `difference of medians ${fmt(c.estimate)} — ${c.claim}`;
}
const fmt = (v: unknown): string => { const n = Number(v); return Number.isFinite(n) ? String(Math.round(n * 1e4) / 1e4) : '—'; };
/** A reconciliation outcome as a glyph, a token and words: anything but `matched` says what it names; `empty` is never a pass. */
export function reconciliationMark(outcome: string): { glyph: string; token: string; text: string } {
  switch (outcome) {
    case 'matched': return { glyph: '●', token: '--eye-color-success', text: 'MATCHED — every computation metered and priced by B91' };
    case 'unpriced': return { glyph: '◌', token: '--eye-color-warning', text: 'UNPRICED — measured here, not priced by B91 (no meter or no rate card)' };
    case 'discrepant': return { glyph: '⚑', token: '--eye-color-critical', text: 'DISCREPANT — B91\'s meter and this ledger disagree' };
    case 'empty': return { glyph: '○', token: '--eye-color-ink-muted', text: 'NOTHING TO RECONCILE — not a pass' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(outcome).toUpperCase() };
  }
}
/** A semantic object's standing in words (the server's standing string is shown beside it verbatim). */
export function standingMark(standing: string): { glyph: string; token: string; text: string } {
  if (standing === 'certified') return { glyph: '◉', token: '--eye-color-success', text: 'CERTIFIED — a governed definition' };
  if (/past its expiry/.test(standing)) return { glyph: '⊘', token: '--eye-color-critical', text: 'CERTIFICATION EXPIRED — not usable until re-certified' };
  if (standing === 'declared') return { glyph: '◌', token: '--eye-color-warning', text: 'DECLARED — awaiting its owner\'s certification' };
  if (standing === 'withdrawn' || standing === 'expired') return { glyph: '✕', token: '--eye-color-ink-muted', text: `${standing.toUpperCase()} — the last valid version stays readable` };
  return { glyph: '○', token: '--eye-color-ink-muted', text: standing.toUpperCase() };
}
/** A DATE as the day it names (never shifted by the viewer's zone). */
export const dayOf = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '—');

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/analytics`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'intelligence',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}
const R = 'analytics.read'; const SR = 'products.semantic.read';
export type SideRequest = { resultId: string } | { period: string; scopeKey?: string; cohort?: Row; cohortObjectId?: string; asOf?: string };
export const comparability = {
  compare: (s: Scope, b: { metricKey?: string; a: SideRequest; b: SideRequest; cohortObjectA?: string; cohortObjectB?: string }) =>
    p<{ comparison: Comparison; computed: { a: Row | null; b: Row | null }; boundary: string; receipt: Receipt }>(s, '/comparisons/run', 'analytics.comparison.run', 'ACM', b),
  comparisons: (s: Scope, metricKey?: string) => p<{ comparisons: Comparison[]; read_at: string; receipt: Receipt }>(s, '/comparisons/list', R, 'ACM', metricKey === undefined ? {} : { metricKey }),
  comparison: (s: Scope, id: string) => p<{ comparison: Comparison; read_at: string; receipt: Receipt }>(s, `/comparisons/${id}/read`, R, 'ACM', {}, id),
  reconcile: (s: Scope, period: string, tolerance?: number) => p<{ reconciliation: Reconciliation; boundary: string; receipt: Receipt }>(s, '/reconciliations/run', 'analytics.reconciliation.run', 'ARC',
    tolerance === undefined ? { period } : { period, tolerance }),
  reconciliations: (s: Scope) => p<{ reconciliations: Reconciliation[]; read_at: string; receipt: Receipt }>(s, '/reconciliations/list', R, 'ARC'),
  costs: (s: Scope, period?: string) => p<{ costs: Row[]; read_at: string; receipt: Receipt }>(s, '/costs/list', R, 'ARC', period === undefined ? {} : { period }),
  declare: (s: Scope, b: { objectId?: string; key: string; kind: string; title: string; definition: Row; owner: string }) =>
    p<{ object: SemanticObject; receipt: Receipt }>(s, '/semantic-objects/declare', 'products.semantic.declare', 'SOB', b),
  objects: (s: Scope, kind?: string) => p<{ objects: SemanticObject[]; read_at: string; receipt: Receipt }>(s, '/semantic-objects/list', SR, 'SOB', kind === undefined ? {} : { kind }),
  object: (s: Scope, id: string) => p<{ object: SemanticObject; read_at: string; receipt: Receipt }>(s, `/semantic-objects/${id}/read`, SR, 'SOB', {}, id),
  certify: (s: Scope, id: string, b: { version: number; digest: string; expiresAt: string; reason: string }) =>
    p<{ object: SemanticObject; receipt: Receipt }>(s, `/semantic-objects/${id}/certify`, 'products.semantic.certify', 'SOB', b, id),
  withdraw: (s: Scope, id: string, reason: string) => p<{ object: SemanticObject; receipt: Receipt }>(s, `/semantic-objects/${id}/withdraw`, 'products.semantic.withdraw', 'SOB', { reason }, id),
};
