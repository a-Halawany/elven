/**
 * The ensembles client — CP-6 B25 part `ensembles` (0108 §EN; F-P4-02: the Ensemble and Disagreement Manager, model-path availability,
 * the human judgement overlay).
 *
 * Every response is returned VERBATIM: the run and its lifecycle (admitted → running → completed | failed, its ledger, attempts and
 * budget), each member's distribution as issued, the ensemble's distribution (MODEL OUTPUT) under its declared combination rule, the
 * disagreement as the PORT measured it with the assumptions that split the members, the excluded method paths with their reasons, and
 * the judgement overlays (JUDGEMENT — never model output) beside the model's own distribution. The helpers below only word what the
 * record says; nothing here combines, measures or judges.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export interface Quantiles { q10: number; q50: number; q90: number }
export type RunState = 'admitted' | 'running' | 'completed' | 'failed';
export type DisagreementLevel = 'agree' | 'notable' | 'material';
export type ExclusionClass = 'unavailable' | 'unimplemented' | 'kind' | 'failed' | 'budget' | 'not_combined' | 'not_run';

export interface EnsembleRun {
  run_id: string; ensemble_forecast_id: string; series_key: string; target_key: string | null; horizon_code: string; known_at: string; observed_through: string | null;
  label: string; assumptions: string[]; plan: Row; combination_rule: string; weighting: 'equal' | 'skill'; disagreement_rule: string;
  budget: { members: number; attempts: number; compute_ms: number }; owner_principal_id: string; state: RunState; state_reason: string | null;
  outcome: Row | null; disagreement: Disagreement | null; escalation: { to: string; reason: string; channel: 'event' | 'attention_item'; attention_item_id: string | null } | null;
  admitted_by: string; admitted_at: string; started_at: string | null; finished_at: string | null;
}
export interface Member {
  ordinal: number; method_ref: string; family: string; forecast_kind: string; confidence_language: string | null; available: boolean; unavailable_reason: string | null;
  assumptions: string[]; tied_assumptions: string[]; state: 'planned' | 'issued' | 'excluded'; forecast_id: string | null; exclusion_class: ExclusionClass | null;
  exclusion_reason: string | null; attempts: number; weight: number | null; quantiles: Quantiles | null; method: string | null; validation_state: string | null;
  validation_note: string | null; statement: string | null; forecast_state: string | null;
}
export interface SplittingAssumption { assumption_id: string; title: string | null; held_by: string[]; not_held_by: string[] }
export interface Disagreement {
  level: DisagreementLevel; max_gap_ratio: number; min_overlap: number; rule: string; measured_by: 'port';
  pairs: Array<{ a: number; b: number; gap: number; gap_ratio: number; overlap: number; level: DisagreementLevel }>; driving_pair: { a: number; b: number } | null;
  analysis: { level: DisagreementLevel; splitting_assumptions: SplittingAssumption[]; structural: Array<{ method_ref: string; assumption: string }>; statement: string } | null;
}
export interface ExcludedModel { ordinal: number; method_ref: string; family?: string; class: ExclusionClass; reason: string; attempts: number }
export interface Overlay {
  overlay_id: string; version: number; forecast_id: string; forecast_kind: string; author_principal_id: string; author_name: string | null;
  adjustment: Row & { kind: 'quantiles' | 'probability' | 'categories' }; model_distribution: Row; rationale: string; evidence: Array<{ kind: string; id: string }>;
  label: 'JUDGEMENT'; state: 'active' | 'superseded' | 'withdrawn'; revises_version: number | null; created_at: string;
  withdrawn_by: string | null; withdrawn_at: string | null; withdrawal_reason: string | null;
}
export interface EnsemblePackage {
  run: EnsembleRun; members: Member[];
  ensemble: (Row & { forecast_id: string; quantiles: Quantiles; statement: string; validation_state: string; state: string; label_kind: 'MODEL OUTPUT'; combination: Row | null }) | null;
  disagreement: Disagreement | null; excluded_models: ExcludedModel[];
  attempts: Array<{ ordinal: number; method_ref: string; attempt: number; outcome: 'succeeded' | 'failed'; error: string | null; duration_ms: number; recorded_at: string }>;
  events: Array<{ event_id: string; event: string; actor_principal_id: string; details: Row; occurred_at: string }>;
  overlays: Overlay[]; standing_overlay: Overlay | null; rules: Row;
}
export interface RunSummary {
  run_id: string; ensemble_forecast_id: string; series_key: string; target_key: string | null; horizon_code: string; state: RunState; state_reason: string | null;
  combination_rule: string; weighting: string; disagreement_level: DisagreementLevel | null; admitted_at: string; finished_at: string | null; label: string;
  planned: number; included: number; excluded: number;
}
export interface IssueEnsemble {
  seriesKey: string; horizon: string; observedThrough?: string | null; knownAt?: string | null; assumptions: string[];
  members?: Array<{ methodRef: string; assumptions: string[] }>; combination?: 'linear_pool@1' | 'quantile_average@1'; weighting?: 'equal' | 'skill';
  label?: 'replay demonstration' | 'live'; owner?: string | null;
}
export interface OverlayInput { adjustment: Row; rationale: string; evidence: Array<{ kind: 'evidence' | 'strategy' | 'forecast'; id: string }>; expectedVersion?: number }

/* ───────────── the words ───────────── */
/** A run's state as a glyph, a token and words — never colour alone. */
export function runStateMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'completed': return { glyph: '●', token: '--eye-color-success', text: 'COMPLETED' };
    case 'failed': return { glyph: '✕', token: '--eye-color-critical', text: 'FAILED' };
    case 'running': return { glyph: '◐', token: '--eye-color-warning', text: 'RUNNING' };
    case 'admitted': return { glyph: '○', token: '--eye-color-ink-muted', text: 'ADMITTED' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
/** The disagreement level in words: material is never softened. */
export function disagreementMark(level: string | null | undefined): { glyph: string; token: string; text: string } {
  switch (level) {
    case 'material': return { glyph: '⚑', token: '--eye-color-critical', text: 'MATERIAL DISAGREEMENT' };
    case 'notable': return { glyph: '◑', token: '--eye-color-warning', text: 'NOTABLE DISAGREEMENT' };
    case 'agree': return { glyph: '●', token: '--eye-color-success', text: 'THE MEMBERS AGREE' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: 'NOT MEASURED' };
  }
}
const CLASS_WORDS: Readonly<Record<string, string>> = Object.freeze({
  unavailable: 'unavailable in the registry', unimplemented: 'no runner implements it', kind: 'a different forecast kind', failed: 'failed after its retries',
  budget: 'over the run\'s budget', not_combined: 'computed, not combined (the run failed)', not_run: 'not run (the run failed first)',
});
/** An excluded path: the method, why in words, and the server's own reason. */
export function exclusionLine(x: { method_ref: string; class: string; reason: string; attempts?: number }): string {
  return `${x.method_ref} — ${CLASS_WORDS[x.class] ?? x.class}${x.attempts !== undefined && x.attempts > 0 ? ` (${x.attempts} attempt${x.attempts === 1 ? '' : 's'})` : ''}: ${x.reason}`;
}
/** A distribution as its median and 10–90 band. */
export function quantileLine(q: Quantiles | null | undefined, unit = ''): string {
  if (q === null || q === undefined || !Number.isFinite(Number(q.q50))) return '—';
  const f = (n: number) => String(Number(Number(n).toFixed(2)));
  return `median ${f(q.q50)}${unit === '' ? '' : ` ${unit}`} (10–90: ${f(q.q10)}–${f(q.q90)})`;
}
/** A weight as a percentage. */
export function weightLine(w: number | null): string { return w === null ? '—' : `${Math.round(w * 1000) / 10}%`; }
/** What the overlay says, by kind — always labelled JUDGEMENT. */
export function overlayLine(o: Pick<Overlay, 'adjustment' | 'label' | 'version' | 'state'>): string {
  const a = o.adjustment;
  const body = a.kind === 'quantiles' ? quantileLine({ q10: Number(a['q10']), q50: Number(a['q50']), q90: Number(a['q90']) })
    : a.kind === 'probability' ? `probability ${Math.round(Number(a['p']) * 1000) / 10}%${a['low'] !== undefined ? ` (${Math.round(Number(a['low']) * 1000) / 10}%–${Math.round(Number(a['high']) * 1000) / 10}%)` : ''}`
    : Array.isArray(a['categories']) ? (a['categories'] as Array<{ name: string; p: number }>).map((c) => `${c.name} ${Math.round(c.p * 1000) / 10}%`).join(' · ') : '—';
  return `${o.label} v${o.version} (${o.state}): ${body}`;
}
/** The splitting assumptions in one line: who holds what. */
export function splitLine(s: SplittingAssumption[]): string {
  if (s.length === 0) return 'the members rest on the same declared assumptions; they differ in their methods\' own assumptions';
  return s.map((x) => `"${x.title ?? x.assumption_id}" (held by ${x.held_by.join(', ')})`).join(' vs ');
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'prediction',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}

export const ensembles = {
  list: (s: Scope) => p<{ at: string; runs: RunSummary[]; rules: Row }>(s, '/ensembles/list', 'prediction.ensemble.read', 'ENS', { limit: 50 }),
  read: (s: Scope, runId: string) => p<{ ensemble: EnsemblePackage }>(s, `/ensembles/${runId}/read`, 'prediction.ensemble.read', 'ENS', {}, runId),
  issue: (s: Scope, payload: IssueEnsemble) => p<{ ensemble: EnsemblePackage }>(s, '/ensembles/issue', 'prediction.ensemble.issue', 'ENS', payload as unknown as Row),
  resume: (s: Scope, runId: string) => p<{ ensemble: EnsemblePackage }>(s, `/ensembles/${runId}/resume`, 'prediction.ensemble.issue', 'ENS', {}, runId),
  overlays: (s: Scope, forecastId: string) => p<{ forecast_id: string; model: Row; standing: Overlay | null; overlays: Overlay[] }>(s, `/forecasts/${forecastId}/overlays/list`, 'prediction.read', 'FCT', {}, forecastId),
  addOverlay: (s: Scope, forecastId: string, o: OverlayInput) => p<{ overlay: Overlay; receipt: Receipt }>(s, `/forecasts/${forecastId}/overlays/add`, 'prediction.overlay.add', 'FCT', o as unknown as Row, forecastId),
  reviseOverlay: (s: Scope, forecastId: string, overlayId: string, o: OverlayInput) =>
    p<{ overlay: Overlay; receipt: Receipt }>(s, `/forecasts/${forecastId}/overlays/${overlayId}/revise`, 'prediction.overlay.add', 'FCT', o as unknown as Row, forecastId),
  withdrawOverlay: (s: Scope, forecastId: string, overlayId: string, reason: string) =>
    p<{ overlay: Overlay; receipt: Receipt }>(s, `/forecasts/${forecastId}/overlays/${overlayId}/withdraw`, 'prediction.overlay.withdraw', 'FCT', { reason }, forecastId),
};
