/**
 * The metric catalog client — CP-6 B92 §MD (0113_b92_x_md; PR-70-002/-003, CAP-DL-11, V01-T-040, DP-44-005, ES-40-008) and the prelude's compute
 * surface (0113 §0.7–§0.9) the catalog drives.
 *
 * Every response is returned VERBATIM: the purposes, scopes and definitions with their states and digests, the contract of each version, the
 * field-level diff, the results with their state, value, n, floor, uncertainty, reasons, source revision and records, the uses and the replays.
 * The helpers below only WORD what the record says: an INDETERMINATE result is said as indeterminate with its reasons, n and floor — never as 0
 * or a dash that reads like zero; an UNSUPPORTED one names its carrier; a PREVIEW is marked; a DATE is the day it names. Nothing here approves,
 * computes or decides — the server's refusal is shown in the server's words.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type DefinitionState = 'draft' | 'proposed' | 'approved' | 'rejected' | 'superseded' | 'retired';
export type ResultState = 'determinate' | 'indeterminate' | 'unsupported';
export interface Mark { glyph: string; token: string; text: string }

export interface Purpose {
  purpose_id: string; purpose_key: string; version: number; title: string; purpose_kind: string; description: string; retention_days: number; state: DefinitionState; digest: string;
  proposed_by: string; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_reason: string | null; retired_at: string | null; retire_reason: string | null;
  proposed_by_name: string | null; decided_by_name: string | null; definitions_naming_it: number;
}
export interface ScopeRow {
  scope_id: string; scope_key: string; version: number; title: string; entity_ids: string[]; objective_ids: string[]; series_keys: string[]; geographies: string[]; description: string;
  state: DefinitionState; digest: string; proposed_by: string; proposed_at: string; decided_by: string | null; decided_at: string | null; decision_reason: string | null; retired_at: string | null;
  proposed_by_name: string | null; decided_by_name: string | null; entities: Array<{ entity_id: string; name: string; type: string; state: string }>;
  objectives: Array<{ objective_id: string; title: string; status: string }>; results_under_it: number;
}
export interface ResultSummary {
  result_id: string; period_key: string; scope_key: string | null; scope_version?: number | null; definition_version: number; state: ResultState; value: number | string | null; unit?: string;
  n: number | null; reasons: string[]; uncertainty: Row | null; clock?: string; threshold_eval: Row | null; computed_at: string; preview?: boolean; replay_of?: string | null; replay_verdict?: string | null;
}
export interface CatalogRow {
  definition_id: string; metric_key: string; version: number; state: DefinitionState; title: string; meaning: string; kind: string; unit: string; direction: string; supported: boolean;
  unsupported_reason: string | null; computation_key: string | null; purpose_key: string; serves: Row; cadence: string; floor_n: number; k_min: number; privacy_class: string; window_spec: Row;
  owner_principal_id: string; owner_name: string | null; digest: string; source_refs: string[]; results_by_period: ResultSummary[]; uses: number; b90_catalog_entry: Row | null;
}
export interface DefinitionVersion extends Row {
  definition_id: string; metric_key: string; version: number; state: DefinitionState; digest: string; contract: Row; proposed_by: string; proposed_by_name: string | null;
  decided_by: string | null; decided_by_name: string | null; decided_at: string | null; decision_reason: string | null; effective_from: string | null; superseded_at: string | null;
  retired_at: string | null; retire_reason: string | null; owner_name: string | null; supported: boolean; floor_n: number; k_min: number;
}
export interface DiffRow { field: string; from: unknown; to: unknown }
export interface UseRow { use_id: string; result_id: string; used_in_kind: string; used_in_id: string; note: string | null; used_at: string; used_by_name: string | null; metric_key: string; definition_version: number; period_key: string; result_state: ResultState }
export interface DefinitionCard {
  metric_key: string; versions: DefinitionVersion[]; diff: { from: Row; to: Row; changed: DiffRow[] } | null; results: Array<ResultSummary & Row>; uses: UseRow[];
  ledger: Array<{ event_id: string; event: string; version: number | null; occurred_at: string; actor_name: string | null; details: Row }>;
  items: Array<{ item_id: string; signal_class: string; title: string; state: string; created_at: string }>; read_at: string; boundary: string;
}
export interface RecordRow { ordinal: number; record_kind: string; record_id: string; role: 'numerator' | 'denominator' | 'included' | 'excluded' | 'context'; reason: string | null; detail: Row }
export interface ResultRead extends Row {
  result_id: string; metric_key: string; definition_version: number; definition_digest: string; preview: boolean; scope_key: string | null; scope_version: number | null; period_key: string;
  window_from: string; window_to: string; clock: string; cohort: Row; as_of: string; state: ResultState; kind: string; unit: string; value: number | string | null; numerator: number | string | null;
  denominator: number | string | null; n: number | null; distribution: Row | null; uncertainty: Row | null; reasons: string[]; quality: Row; evaluation: Row; threshold_eval: Row | null;
  computation_key: string | null; computation_version: number | null; computation_digest: string | null; source_revision: string; records_count: number; replay_of: string | null; replay_verdict: string | null;
  computed_at: string; computed_by_kind: string; definition: Row | null; scope_row: Row | null; records: RecordRow[]; records_by_role: Record<string, number>;
  uses: Row[]; replays: Array<{ result_id: string; verdict: string; computed_at: string; source_revision: string }>;
}

/* ───────────── the words ───────────── */
/** A definition / purpose / scope state as a glyph, a token and words — never colour alone; the four lifecycle states are visibly distinct. */
export function stateMark(state: string): Mark {
  switch (state) {
    case 'approved': return { glyph: '●', token: '--eye-color-success', text: 'APPROVED' };
    case 'proposed': return { glyph: '◌', token: '--eye-color-warning', text: 'PROPOSED (awaiting a named approver)' };
    case 'draft': return { glyph: '◇', token: '--eye-color-ink-muted', text: 'DRAFT' };
    case 'rejected': return { glyph: '✕', token: '--eye-color-critical', text: 'REJECTED' };
    case 'superseded': return { glyph: '○', token: '--eye-color-ink-muted', text: 'SUPERSEDED' };
    case 'retired': return { glyph: '⊘', token: '--eye-color-ink-muted', text: 'RETIRED' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
/** A result's standing: determinate / indeterminate / unsupported, and PREVIEW (a proposed definition's review — never current) and REPLAY marked. */
export function resultMark(r: { state: string; preview?: boolean | null; replay_of?: string | null }): Mark {
  const suffix = r.preview === true ? ' · PREVIEW (not current)' : r.replay_of ? ' · REPLAY' : '';
  switch (r.state) {
    case 'determinate': return { glyph: '■', token: '--eye-color-success', text: `DETERMINATE${suffix}` };
    case 'indeterminate': return { glyph: '◩', token: '--eye-color-warning', text: `INDETERMINATE${suffix}` };
    case 'unsupported': return { glyph: '▢', token: '--eye-color-ink-muted', text: `UNSUPPORTED${suffix}` };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: `${String(r.state).toUpperCase()}${suffix}` };
  }
}
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** A value in its unit: a rate as a percentage, a duration in seconds / minutes / hours. */
export function formatValue(v: unknown, kind: string, unit: string): string {
  const n = num(v);
  if (n === null) return '';
  if (kind === 'rate') return `${(n * 100).toFixed(1)} %`;
  if (kind === 'duration') return n >= 7200 ? `${(n / 3600).toFixed(1)} h` : n >= 120 ? `${(n / 60).toFixed(1)} min` : `${n.toFixed(0)} s`;
  return `${Number.isInteger(n) ? n : n.toFixed(3)} ${unit}`.trim();
}
/**
 * THE VALUE LINE. A determinate result says its value, n and interval; an INDETERMINATE one says so with n, the floor and its first reason —
 * never 0, never a dash that reads like zero; an UNSUPPORTED one says it is not computed and why.
 */
export function valueLine(r: { state: string; value: unknown; kind: string; unit: string; n: number | null; reasons?: string[] | null; uncertainty?: Row | null }, floorN: number | null): string {
  const reasons = Array.isArray(r.reasons) ? r.reasons : [];
  if (r.state === 'unsupported') return `UNSUPPORTED — not computed: ${String(reasons[0] ?? 'no source in the product').replace(/^unsupported: /, '')}`;
  if (r.state !== 'determinate' || num(r.value) === null) {
    const floor = floorN === null ? '' : `, floor ${floorN}`;
    return `INDETERMINATE (n = ${r.n ?? 'not counted'}${floor}) — ${reasons[0] ?? 'no reason recorded'}${reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ''}`;
  }
  const u = intervalLine(r.uncertainty ?? null, r.kind, r.unit);
  return `${formatValue(r.value, r.kind, r.unit)} (n = ${r.n ?? '?'}${u === '' ? '' : `; ${u}`})`;
}
/** The uncertainty as words: Wilson's interval for a rate; the median's order-statistic interval for a duration (unbounded below n = 6 — said). */
export function intervalLine(u: Row | null, kind: string, unit: string): string {
  if (u === null || u === undefined) return '';
  if (u['method'] === 'wilson') return `95 % Wilson ${formatValue(u['lo'], kind, unit)}–${formatValue(u['hi'], kind, unit)}`;
  if (u['method'] === 'order_statistics') {
    if (u['lo'] === undefined || u['lo'] === null) return String(u['note'] ?? 'the interval of the median is unbounded at this n');
    return `95 % median interval ${formatValue(u['lo'], kind, unit)}–${formatValue(u['hi'], kind, unit)} (ranks ${String(u['lo_rank'])}–${String(u['hi_rank'])})`;
  }
  return '';
}
/** A threshold evaluation in words (a breach opens a REVIEW, never an automatic decision). */
export function thresholdLine(t: Row | null | undefined): string {
  if (t === null || t === undefined) return 'no threshold evaluated';
  const th = (t['threshold'] ?? {}) as Row;
  const what = Array.isArray(th['band']) ? `band ${String((th['band'] as unknown[])[0])}–${String((th['band'] as unknown[])[1])}` : th['target'] !== undefined ? `target ${String(th['target'])}` : 'threshold';
  if (t['breach'] === true) return `BREACH of the ${what} — a review: ${String(t['action'] ?? 'the definition\'s review workflow')}`;
  if (t['breach'] === false) return `within the ${what}`;
  return `the ${what} is not evaluated for this direction`;
}
/** The records by role, in the drill-down's order. */
export function roleCounts(byRole: Record<string, number> | null | undefined): Array<{ role: string; count: number }> {
  const order = ['numerator', 'denominator', 'included', 'excluded', 'context'];
  return order.filter((r) => (byRole?.[r] ?? 0) > 0).map((role) => ({ role, count: byRole?.[role] ?? 0 }));
}
/** A diff value as short text. */
export function diffValue(v: unknown): string {
  if (v === null || v === undefined) return '—none—';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
/** The results of a key grouped by period (newest period first), each period's results newest first; previews and replays kept, marked. */
export function byPeriod<T extends { period_key: string; computed_at: string }>(results: T[]): Array<{ period: string; results: T[] }> {
  const m = new Map<string, T[]>();
  for (const r of results) m.set(r.period_key, [...(m.get(r.period_key) ?? []), r]);
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([period, rs]) => ({ period, results: [...rs].sort((a, b) => b.computed_at.localeCompare(a.computed_at)) }));
}
/** The quarter before the one containing `at` (the scene's "last quarter") — mirrors the API's seams.previousQuarter. */
export function previousQuarter(at: Date): string {
  const y = at.getUTCFullYear(); const q = Math.floor(at.getUTCMonth() / 3) + 1;
  return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
}
export const PERIOD_RE = /^([0-9]{4}-Q[1-4]|[0-9]{4}-(0[1-9]|1[0-2])|R[0-9]{1,4}@[0-9]{4}-[0-9]{2}-[0-9]{2})$/;
/** A DATE (or the date part of an instant) as the day it names — never shifted by the viewer's zone. */
export const dayOf = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '—');
/** A window [from, to) as the days it covers (to is exclusive: the last day is the day before). */
export function windowLine(from: string, to: string): string {
  const last = new Date(Date.parse(to) - 86_400_000).toISOString().slice(0, 10);
  return `${dayOf(from)} … ${last} (UTC)`;
}
/** The fields of a contract, labelled, in App M's Contract-control order. */
export const CONTRACT_FIELDS: Array<[string, string]> = [
  ['meaning', 'Meaning'], ['kind', 'Kind'], ['unit', 'Unit'], ['direction', 'Direction'], ['population', 'Population'], ['numerator', 'Numerator'], ['denominator', 'Denominator'],
  ['exclusions', 'Exclusions'], ['window', 'Window and clock'], ['dimensions', 'Cohort dimensions'], ['privacy_class', 'Privacy class'], ['k_min', 'k (minimum distinct principals)'],
  ['floor_n', 'Floor (minimum n)'], ['threshold', 'Threshold / target'], ['action', 'Breach action (a review)'], ['purpose_key', 'Purpose'], ['serves', 'Serves (V01-T-040)'], ['cadence', 'Cadence'],
  ['owner_principal_id', 'Owner'], ['retirement', 'Retirement condition'], ['quality', 'Quality requirement'], ['cost_allocation', 'Cost allocation'], ['computation_key', 'Computation'],
  ['supported', 'Supported'], ['unsupported_reason', 'Unsupported because'], ['params', 'Parameters'], ['source_refs', 'Source rows'],
];

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/analytics`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'intelligence',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}
const R = 'analytics.read';
type Decision = { decision: 'approve' | 'reject'; digest: string; reason: string };
export const catalogApi = {
  catalog: (s: Scope) => p<{ catalog: CatalogRow[]; service: Row; catalog_note: string; read_at: string; boundary: string; receipt: Receipt }>(s, '/catalog/read', R, 'AMD'),
  definitions: (s: Scope) => p<{ definitions: Row[]; computations: Row[]; owner_roles: Record<string, string>; read_at: string }>(s, '/definitions/list', R, 'AMD'),
  card: (s: Scope, metricKey: string) => p<DefinitionCard & { receipt: Receipt }>(s, `/definitions/${encodeURIComponent(metricKey)}/read`, R, 'AMD'),
  diff: (s: Scope, from: string, to: string) => p<{ diff: { from: Row; to: Row; changed: DiffRow[] } }>(s, '/definitions/diff', R, 'AMD', { from, to }),
  propose: (s: Scope, contract: Row, ownerPrincipalId: string | null) => p<{ definition: Row; receipt: Receipt }>(s, '/definitions/propose', 'analytics.definition.propose', 'AMD', { contract, ownerPrincipalId }),
  decide: (s: Scope, id: string, b: Decision) => p<{ definition: Row; receipt: Receipt }>(s, `/definitions/${id}/decide`, 'analytics.definition.decide', 'AMD', b, id),
  retire: (s: Scope, id: string, reason: string) => p<{ definition: Row & { uses: Row[] }; receipt: Receipt }>(s, `/definitions/${id}/retire`, 'analytics.definition.retire', 'AMD', { reason }, id),
  purposes: (s: Scope) => p<{ purposes: Purpose[]; read_at: string }>(s, '/purposes/list', R, 'APU'),
  proposePurpose: (s: Scope, b: { key: string; title: string; kind: string; description: string; retentionDays: number }) => p<{ purpose: Purpose; receipt: Receipt }>(s, '/purposes/propose', 'analytics.purpose.propose', 'APU', b),
  decidePurpose: (s: Scope, id: string, b: Decision) => p<{ purpose: Purpose; receipt: Receipt }>(s, `/purposes/${id}/decide`, 'analytics.purpose.decide', 'APU', b, id),
  retirePurpose: (s: Scope, id: string, reason: string) => p<{ purpose: Purpose; receipt: Receipt }>(s, `/purposes/${id}/retire`, 'analytics.purpose.retire', 'APU', { reason }, id),
  scopes: (s: Scope) => p<{ scopes: ScopeRow[]; read_at: string }>(s, '/scopes/list', R, 'ASC'),
  proposeScope: (s: Scope, b: { key: string; title: string; description: string; entityIds: string[]; objectiveIds: string[]; seriesKeys: string[]; geographies: string[] }) =>
    p<{ scope: ScopeRow; receipt: Receipt }>(s, '/scopes/propose', 'analytics.scope.propose', 'ASC', b),
  decideScope: (s: Scope, id: string, b: Decision) => p<{ scope: ScopeRow; receipt: Receipt }>(s, `/scopes/${id}/decide`, 'analytics.scope.decide', 'ASC', b, id),
  retireScope: (s: Scope, id: string, reason: string) => p<{ scope: ScopeRow; receipt: Receipt }>(s, `/scopes/${id}/retire`, 'analytics.scope.retire', 'ASC', { reason }, id),
  uses: (s: Scope, b: { metricKey?: string; resultId?: string }) => p<{ uses: UseRow[] }>(s, '/uses/list', R, 'AMU', b),
  recordUse: (s: Scope, b: { resultId: string; usedInKind: string; usedInId: string; note?: string; qualified?: boolean }) => p<{ use: Row; receipt: Receipt }>(s, '/uses/record', 'analytics.use.record', 'AMU', b),
  /* the prelude's compute surface (0113 §0.7–§0.9) */
  compute: (s: Scope, b: { metricKey: string; period: string; scopeKey?: string | null; cohort?: Record<string, string>; preview?: boolean }) =>
    p<{ result: ResultRead; boundary: string; receipt: Receipt }>(s, '/metrics/compute', 'analytics.metric.compute', 'AMR', b),
  result: (s: Scope, resultId: string, recordsLimit = 500) => p<{ result: ResultRead | null; read_at: string; boundary: string; receipt: Receipt }>(s, `/results/${resultId}/read`, R, 'AMR', { recordsLimit }, resultId),
  replay: (s: Scope, resultId: string) => p<{ replay: ResultRead & { replay_reasons: string[]; original: Row }; receipt: Receipt }>(s, `/results/${resultId}/replay`, 'analytics.metric.replay', 'AMR', {}, resultId),
};
