/**
 * The operating-review client — CP-6 B92 §OR (0113_b92_x_or; PR-70-001: the role-appropriate measurement capability's accountable business
 * review; the NORDWERK scene: loop closure, warning acknowledgement latency and forecast calibration for the corridor over the last quarter).
 *
 * Every response is returned VERBATIM: the review, its cited results (their values, states, reasons, n, intervals, windows, clocks, scopes),
 * the series (every period — computed, not computed, or no history), the notes, the follow-through and the chair's digest-bound close. The
 * helpers below only WORD what the record says — an indeterminate or unsupported result is shown AS such with its reasons, never as 0 or a dash
 * that reads like zero; a DATE is the day it names. Nothing here computes, cites or decides: the server's ports do.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type ResultState = 'determinate' | 'indeterminate' | 'unsupported';
export type ReviewState = 'draft' | 'held' | 'closed';
export interface Uncertainty { method?: string; level?: number; lo?: number | null; hi?: number | null; lo_rank?: number | null; hi_rank?: number | null; note?: string }
export interface ResultRow {
  result_id: string; metric_key: string; definition_version: number; preview: boolean; scope_key: string | null; scope_version: number | null; period_key: string; period_kind: string;
  window_from: string; window_to: string; clock: 'record' | 'world'; cohort: Row; as_of: string; state: ResultState; kind: string; unit: string; value: number | string | null;
  numerator: number | string | null; denominator: number | string | null; n: number | null; distribution: Row | null; uncertainty: Uncertainty | null; reasons: string[];
  threshold_eval: { threshold: Row; breach: boolean | null; action: string } | null; computation_key: string | null; computation_version: number | null; source_revision: string;
  records_count: number; computed_at: string; computed_by_kind: string; records_by_role?: Record<string, number>; drilldown?: { result_id: string; route: string };
}
export interface DefinitionRowT {
  definition_id: string; metric_key: string; version: number; title: string; meaning: string; kind: string; unit: string; direction: string; population: Row;
  numerator: string | null; denominator: string | null; exclusions: Array<{ rule: string; reason: string }>; window_spec: { kind: string; clock?: string; days?: number };
  dimensions: string[]; privacy_class: string; k_min: number; floor_n: number; threshold: { target?: number; band?: [number, number] }; purpose_key: string; cadence: string;
  owner_principal_id: string; owner_name: string | null; action: string; supported: boolean; unsupported_reason: string | null; state: string; source_refs: string[];
}
export interface SeriesPeriod {
  period: string; window_from: string; window_to: string; status: 'computed' | 'not_computed' | 'no_history'; state: ResultState | null; value: number | string | null;
  unit?: string; kind?: string; n: number | null; uncertainty?: Uncertainty | null; reasons: string[]; result_id?: string; definition_version?: number; previews?: number;
  before_history?: boolean; drilldown?: { result_id: string; route: string };
}
export interface Series {
  metric_key: string; scope_key: string | null; through: string; count: number; periods: SeriesPeriod[]; comparable: boolean; comparability_note: string | null;
  definition_versions: number[]; history: { established: boolean; origin: string | null; source: string | null; why: string | null };
}
export interface Citation { metric_key: string; status: 'cited' | 'not_computed'; result_id: string | null; pinned: boolean; note: string | null; assembly: number; ordinal: number }
export interface MetricBlock {
  metric_key: string; ordinal: number; citation: Citation | null; definition: DefinitionRowT | null; definition_current_version: number | null; result: ResultRow | null; series: Series;
}
export interface NoteRow { note_id: string; metric_key: string | null; body: string; author_principal_id: string; author_name: string | null; created_at: string }
export interface FollowRow {
  followup_id: string; metric_key: string | null; kind: 'action' | 'no_action'; action: string | null; owner_principal_id: string | null; owner_name: string | null; due_on: string | null;
  reason: string; decided_at: string; item: { item_id: string; state: string; route_roles: string[]; due_at: string | null } | null;
}
export interface ReviewView {
  review_id: string; title: string; period_key: string; period_kind: string; window_from: string; window_to: string; scope_key: string | null; scope_version: number | null;
  metric_keys: string[]; chair_principal_id: string; chair_name: string | null; participant_roles: string[]; state: ReviewState; assembly: number; assembled_at: string | null;
  held_at: string | null; close_digest: string | null; close_statement: string | null; closed_by: string | null; closed_at: string | null; created_at: string;
  scope_row: (Row & { title: string; series_keys: string[]; geographies: string[] }) | null; metrics: MetricBlock[]; notes: NoteRow[]; followthrough: FollowRow[];
  events: Array<{ event: string; occurred_at: string; details: Row }>; uses: number; digest_now: string;
  signature: { digest: string; statement: string; closed_by: string; closed_at: string; closed_by_name: string | null; verified: boolean; kind: string } | null;
}
export interface ReviewListRow {
  review_id: string; title: string; period_key: string; scope_key: string | null; metric_keys: string[]; chair_name: string | null; participant_roles: string[]; state: ReviewState;
  assembly: number; not_computed: number; followthrough: number; closed_at: string | null; created_at: string;
}

/* ───────────── the words ───────────── */
export interface Mark { glyph: string; token: string; text: string }
/** A result or period state as a glyph, a token and words — never colour alone; never "0" for what was not measured. */
export function stateMark(state: string | null, status?: string): Mark {
  if (status === 'no_history') return { glyph: '◌', token: '--eye-color-warning', text: 'NO HISTORY' };
  if (status === 'not_computed' || state === null) return { glyph: '○', token: '--eye-color-ink-muted', text: 'NOT COMPUTED' };
  switch (state) {
    case 'determinate': return { glyph: '●', token: '--eye-color-success', text: 'DETERMINATE' };
    case 'indeterminate': return { glyph: '◌', token: '--eye-color-warning', text: 'INDETERMINATE' };
    case 'unsupported': return { glyph: '⊘', token: '--eye-color-critical', text: 'UNSUPPORTED' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
/** A review's state in words. */
export function reviewMark(state: string): Mark {
  switch (state) {
    case 'draft': return { glyph: '◌', token: '--eye-color-warning', text: 'DRAFT (citations may be re-assembled)' };
    case 'held': return { glyph: '◉', token: '--eye-color-accent-strong', text: 'HELD (citations frozen; follow-through and close are the chair\'s)' };
    case 'closed': return { glyph: '■', token: '--eye-color-ink-default', text: 'CLOSED (signed by the chair; immutable)' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
/** A duration in seconds, in words (and the seconds). */
export function durationText(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 120) return `${s} s`;
  if (s < 7200) return `${Math.round(s / 60)} min (${s} s)`;
  return `${(s / 3600).toFixed(1)} h (${s} s)`;
}
/** A measured value with its unit — a rate as a percentage; a duration as time. Only for a DETERMINATE value. */
export function measuredText(kind: string, unit: string, value: unknown): string {
  const v = num(value);
  if (v === null) return '';
  if (kind === 'rate') return `${(v * 100).toFixed(1)} %`;
  if (kind === 'duration') return unit === 'seconds' ? durationText(v) : `${v} ${unit}`;
  return `${v} ${unit}`;
}
/**
 * THE VALUE LINE of a result: a determinate value with its unit; otherwise the STATE and its first reason — an indeterminate or unsupported
 * result is never shown as 0, an empty cell or a dash.
 */
export function valueLine(r: Pick<ResultRow, 'state' | 'kind' | 'unit' | 'value' | 'reasons'> | null, notComputedNote?: string | null): string {
  if (r === null) return `NOT COMPUTED — ${notComputedNote ?? 'no result has been computed for this period and scope'}`;
  if (r.state === 'determinate' && num(r.value) !== null) return measuredText(r.kind, r.unit, r.value);
  const why = Array.isArray(r.reasons) && r.reasons.length > 0 ? r.reasons[0] : 'no reason recorded';
  return `${r.state.toUpperCase()} — ${why}`;
}
/** The interval (D6): Wilson's for a rate, the median's order-statistic interval for a duration — or why there is none. */
export function intervalLine(kind: string, unit: string, u: Uncertainty | null | undefined): string {
  if (u === null || u === undefined) return 'no interval (no determinate sample)';
  if (u.method === 'wilson' && num(u.lo) !== null && num(u.hi) !== null) return `95 % Wilson ${measuredText(kind, unit, u.lo)} – ${measuredText(kind, unit, u.hi)}`;
  if (u.method === 'order_statistics') {
    if (num(u.lo) === null || num(u.hi) === null) return `the median's 95 % interval is unbounded at this n${u.note ? ` (${u.note})` : ''}`;
    return `median 95 % ${measuredText(kind, unit, u.lo)} – ${measuredText(kind, unit, u.hi)} (ranks ${u.lo_rank}–${u.hi_rank})`;
  }
  return 'no interval';
}
/** n against the floor and k (the floor is the definition's). */
export function sampleLine(n: number | null | undefined, floor: number | null | undefined, k: number | null | undefined): string {
  const nn = n === null || n === undefined ? 'n not measured' : `n ${n}`;
  const below = n !== null && n !== undefined && floor !== null && floor !== undefined && n < floor ? ' — BELOW the floor' : '';
  return `${nn} · floor ${floor ?? '—'}${below} · k ≥ ${k ?? '—'}`;
}
/** A series cell: the period's value, or its state in words (no history / not computed / indeterminate) — never a blank. */
export function periodCell(p: SeriesPeriod): string {
  if (p.status === 'no_history') return `NO HISTORY — ${p.reasons[0] ?? ''}`.trim();
  if (p.status === 'not_computed') return `NOT COMPUTED${p.previews ? ` (${p.previews} preview(s) never shown as the value)` : ''}`;
  if (p.state === 'determinate' && num(p.value) !== null) return measuredText(p.kind ?? 'rate', p.unit ?? '', p.value);
  return `${String(p.state ?? 'indeterminate').toUpperCase()}${p.n !== null && p.n !== undefined ? ` (n ${p.n})` : ''}`;
}
/** The window of a period as days, half-open, UTC. */
export function windowLine(from: string, to: string): string { return `[${dayOf(from)}, ${dayOf(to)}) UTC`; }
/** A threshold in words: the target or the approved band and the direction. */
export function thresholdLine(t: { target?: number; band?: [number, number] } | null | undefined, kind: string, unit: string, direction: string): string {
  if (t === null || t === undefined) return 'none declared';
  if (Array.isArray(t.band)) return `approved band ${measuredText(kind, unit, t.band[0])} – ${measuredText(kind, unit, t.band[1])}`;
  if (t.target !== undefined) return `target ${direction === 'lower' ? '≤' : '≥'} ${measuredText(kind, unit, t.target)}`;
  return 'none declared';
}
/** A follow-through decision in words. */
export function followLine(f: Pick<FollowRow, 'kind' | 'action' | 'owner_name' | 'due_on' | 'reason'>): string {
  if (f.kind === 'no_action') return `NO ACTION — ${f.reason}`;
  return `ACTION: ${f.action ?? ''} — owner ${f.owner_name ?? 'unnamed'}, due ${dayOf(f.due_on)} — ${f.reason}`;
}
/** The population as the definition reads it (subject, inclusion), in one line. */
export function populationLine(p: Row | null | undefined): string {
  if (p === null || p === undefined) return '—';
  const parts = ['subject', 'inclusion', 'scope_rule', 'clock_note'].filter((k) => typeof p[k] === 'string').map((k) => `${k.replace(/_/g, ' ')}: ${String(p[k])}`);
  return parts.length > 0 ? parts.join(' · ') : JSON.stringify(p);
}
/** A DATE (or an instant) as the day it names — never shifted by the viewer's zone. */
export const dayOf = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '—');
/** Which metrics still need a follow-through before the chair may close. */
export function openFollowthrough(metricKeys: string[], follow: Array<Pick<FollowRow, 'metric_key'>>): string[] {
  const done = new Set(follow.map((f) => f.metric_key).filter((k): k is string => k !== null));
  return metricKeys.filter((k) => !done.has(k));
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/analytics`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action === 'analytics.read';
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'intelligence',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}
const R = 'analytics.read';
export const reviews = {
  list: (s: Scope, q: { period?: string; state?: string } = {}) => p<{ reviews: ReviewListRow[]; read_at: string; boundary: string; receipt: Receipt }>(s, '/reviews/list', R, 'AOR', q),
  read: (s: Scope, id: string) => p<{ review: ReviewView; read_at: string; boundary: string; receipt: Receipt }>(s, `/reviews/${id}/read`, R, 'AOR', {}, id),
  series: (s: Scope, q: { metricKey: string; scopeKey?: string | null; through?: string; count?: number }) => p<{ series: Series; read_at: string; receipt: Receipt }>(s, '/reviews/series', R, 'AOR', q),
  open: (s: Scope, b: { title: string; period: string; scopeKey: string | null; metricKeys: string[]; chair: string; participantRoles: string[] }) =>
    p<{ review: Row; receipt: Receipt }>(s, '/reviews/open', 'analytics.review.open', 'AOR', b),
  assemble: (s: Scope, id: string, pins: Record<string, string> = {}) => p<{ assembly: Row; receipt: Receipt }>(s, `/reviews/${id}/assemble`, 'analytics.review.assemble', 'AOR', { pins }, id),
  hold: (s: Scope, id: string) => p<{ review: Row; receipt: Receipt }>(s, `/reviews/${id}/hold`, 'analytics.review.hold', 'AOR', {}, id),
  note: (s: Scope, id: string, b: { metricKey: string | null; body: string }) => p<{ note: Row; receipt: Receipt }>(s, `/reviews/${id}/notes/add`, 'analytics.review.note', 'AOR', b, id),
  decide: (s: Scope, id: string, b: { metricKey: string | null; kind: 'action' | 'no_action'; action?: string; owner?: string; dueOn?: string; reason: string }) =>
    p<{ followthrough: Row; receipt: Receipt }>(s, `/reviews/${id}/decide`, 'analytics.review.decide', 'AOR', b, id),
  close: (s: Scope, id: string, b: { digest: string; statement: string }) => p<{ review: Row; receipt: Receipt }>(s, `/reviews/${id}/close`, 'analytics.review.close', 'AOR', b, id),
  /** the drill-down (the prelude's route): definition → result → records */
  result: (s: Scope, resultId: string, recordsLimit = 200) => p<{ result: (ResultRow & { definition: DefinitionRowT; records: Row[]; uses: Row[]; replays: Row[]; scope_row: Row | null }) | null; read_at: string; receipt: Receipt }>(
    s, `/results/${resultId}/read`, R, 'AMR', { recordsLimit }, resultId),
};
