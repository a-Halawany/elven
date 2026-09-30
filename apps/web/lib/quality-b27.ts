/**
 * The scenario quality client — CP-6 B27 part `quality` (0097 §Q; F-P4-09; AI-49-003/-004; FEX-12).
 *
 * Every response is returned VERBATIM: the latest quality evaluation, the measures AS OF the instant the answer states (the indicator
 * freshness with the stale and missing ones named by the server), the decision-activity with its reasons, each branch's governed
 * probability with its method and basis, the frequency-to-probability maps. The acts are a named person's own: evaluate (the declaring
 * roles), declare a map, set or withdraw a probability (the scenario's or the branch's owner, or an administrator — the server refuses
 * anyone else). The helpers below only word what the record says; nothing here computes a finding, a freshness or a band.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type FindingOutcome = 'fail' | 'note';
export type FreshnessState = 'fresh' | 'awaiting' | 'stale' | 'missing' | 'not_required';
export type ProbabilityMethod = 'frequency_map' | 'expert_elicitation' | 'model';

export interface QualityFinding { rule: string; outcome: FindingOutcome; branch_ids: string[]; detail: string; [k: string]: unknown }
export interface Freshness {
  branch_id: string; name: string; kind: string; branch_state: string; live: boolean; indicator_id: string | null; series_key: string | null; state: FreshnessState;
  last_observation_at: string | null; cadence_days: number | null; max_age_days: number | null; age_days: number | null; reason: string;
}
export interface QualityMeasures {
  live_branches: number; suspended_branches: number;
  assumption_coverage: { with_assumption: number; live: number; ratio: number | null };
  branch_diversity: { kinds: number; live: number; ratio: number | null };
  indicator_freshness: Freshness[]; indicators: { missing: number; stale: number };
  signpost_discrimination: { distinct_indicators: number; branches_with_indicator: number; ratio: number | null; shared: Array<{ indicator_id: string; branch_ids: string[] }> };
  coverage: { present: string[]; missing: string[]; set_requires: string[] }; bias: 'all_adverse' | 'all_benign' | null;
  review_timeliness: { next_review_due_at: string | null; overdue: boolean }; elements_read: boolean; elements: number;
}
export interface QualityEvaluation {
  evaluation_id: string; scenario_id: string; scenario_version: number | null; rule_version: string; trigger: string; measures: QualityMeasures; findings: QualityFinding[];
  outcome: 'passed' | 'failed'; prior_outcome: string | null; new_failure: boolean; attention_item_id: string | null; evaluated_by: string; evaluated_at: string;
}
export interface Band { frequency_label: string; min_per_year: number; max_per_year: number | null; probability_low: number; probability_high: number }
export interface FrequencyMap { map_id: string; name: string; version: number; bands: Band[]; horizon: string; owner_principal_id?: string; owner?: string; state: 'active' | 'superseded'; supersedes: string | null; declared_by: string; declared_at: string }
export interface StandingProbability { probability_id: string; scenario_id: string; branch_id: string; probability_low: number; probability_high: number; method: ProbabilityMethod; map_id: string | null; basis: Row; set_by: string; set_at: string }
export interface QualityBranch { branch_id: string; name: string; kind: string; kind_label: string | null; state: string; live: boolean; owner: string; indicator_id: string | null; probability: StandingProbability | null }
export interface ScenarioQualityView {
  at: string;
  scenario: { scenario_id: string; title: string; statement: string; state: string; owner: string; current_version: number | null; coherence_state: string; next_review_due_at: string | null };
  rule: Row & { version: string };
  latest: QualityEvaluation | null;
  /** The recent evaluations (the route adds them, newest first). */
  evaluations: QualityEvaluation[];
  live: { outcome: 'passed' | 'failed'; findings: QualityFinding[]; measures: QualityMeasures; at: string; scenario_version: number | null; rule_version: string };
  quality_state: 'passed' | 'failed' | 'unevaluated';
  decision_active: { value: boolean; reasons: string[] };
  branches: QualityBranch[];
  probability_sum: { live_low: number; live_high: number; not_summed: number };
  history: Array<Row>;
  maps: FrequencyMap[];
}

/* ───────────── the words ───────────── */
/** A freshness state as a glyph, a token and words — never colour alone. */
export function freshnessMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'fresh': return { glyph: '●', token: '--eye-color-success', text: 'FRESH' };
    case 'awaiting': return { glyph: '◌', token: '--eye-color-ink-muted', text: 'AWAITING its first observation' };
    case 'stale': return { glyph: '⚑', token: '--eye-color-critical', text: 'STALE' };
    case 'missing': return { glyph: '✕', token: '--eye-color-critical', text: 'MISSING' };
    case 'not_required': return { glyph: '—', token: '--eye-color-ink-muted', text: 'no signpost needed' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
/** A finding's outcome as a glyph and words. */
export function findingMark(outcome: string): { glyph: string; token: string; text: string } {
  return outcome === 'fail' ? { glyph: '✕', token: '--eye-color-critical', text: 'FAIL' } : { glyph: 'ℹ', token: '--eye-color-ink-muted', text: 'NOTE' };
}
/** A rule's name in words. */
export function ruleLabel(rule: string): string {
  switch (rule) {
    case 'indistinct_branches': return 'distinctiveness — branches differ only in wording';
    case 'collapse_to_one_forecast': return 'collapse — every branch rests on one forecast threshold';
    case 'prohibited_contradiction': return 'prohibited contradiction';
    case 'element_temporal_order': return 'temporal ordering of elements';
    case 'indicator_missing': return 'indicator missing';
    case 'indicator_stale': return 'indicator stale';
    case 'coverage': return 'coverage';
    case 'bias': return 'bias';
    case 'signpost_shared': return 'signpost discrimination';
    case 'review_overdue': return 'review timeliness';
    default: return rule;
  }
}
/** A probability band in words: a percentage range (a point when low = high). */
export function bandLine(low: number, high: number): string {
  const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
  return low === high ? pct(low) : `${pct(low)}–${pct(high)}`;
}
/** A method with its basis in words — the frequency and the map band, the elicitation record, the run. */
export function basisLine(method: string, basis: Row): string {
  if (method === 'frequency_map') {
    const map = (basis['map'] ?? {}) as Row; const band = (basis['band'] ?? {}) as Row;
    return `frequency map "${String(map['name'] ?? '?')}" v${String(map['version'] ?? '?')} (${String(map['horizon'] ?? '')}): ${String(basis['frequency_per_year'])} per year observed in ${String(basis['observation'] ?? '?')} → band "${String(band['frequency_label'] ?? '?')}"`;
  }
  if (method === 'expert_elicitation') {
    const e = (basis['elicitation'] ?? {}) as Row;
    const experts = Array.isArray(e['experts']) ? (e['experts'] as unknown[]).map(String).join(', ') : '?';
    return `expert elicitation of ${experts} at ${String(e['elicited_at'] ?? '?')} on "${String(e['question'] ?? '?')}"`;
  }
  if (method === 'model') return `model — simulation run ${String(basis['run_id'] ?? '?')}`;
  return method;
}
/** The decision-activity in words (FEX-12). */
export function decisionActiveLine(d: { value: boolean; reasons: string[] }): string {
  return d.value ? 'DECISION-ACTIVE — no failed coherence check or quality evaluation stands' : `NOT DECISION-ACTIVE — ${d.reasons.join('; ')}`;
}
/** A ratio as a percentage, or "—" when there is nothing to divide. */
export function ratioLine(r: number | null): string {
  return r === null ? '—' : `${Math.round(r * 1000) / 10}%`;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction/scenarios/quality`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'prediction',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}

export interface SetProbability { method: ProbabilityMethod; low?: number | null; high?: number | null; mapId?: string | null; basis: Row }

export const quality = {
  read: (s: Scope, scenarioId: string) => p<ScenarioQualityView & { receipt: Receipt }>(s, `/${scenarioId}/read`, 'prediction.scenario.quality.read', 'SCN', {}, scenarioId),
  evaluate: (s: Scope, scenarioId: string, trigger: 'operator' | 'declare' | 'branch' = 'operator') =>
    p<{ evaluation: QualityEvaluation & { title: string }; receipt: Receipt }>(s, `/${scenarioId}/evaluate`, 'prediction.scenario.quality.evaluate', 'SCN', { trigger }, scenarioId),
  maps: (s: Scope) => p<{ at: string; maps: FrequencyMap[]; receipt: Receipt }>(s, '/maps/list', 'prediction.scenario.quality.read', 'FPM'),
  declareMap: (s: Scope, payload: { name: string; horizon: string; bands: Band[]; ownerPrincipalId?: string }) => p<{ map: FrequencyMap; receipt: Receipt }>(s, '/maps/declare', 'prediction.scenario.probability.map', 'FPM', payload as unknown as Row),
  setProbability: (s: Scope, branchId: string, payload: SetProbability) => p<{ probability: Row; receipt: Receipt }>(s, `/branches/${branchId}/probability`, 'prediction.scenario.probability.set', 'BRN', payload as unknown as Row, branchId),
  withdrawProbability: (s: Scope, branchId: string, reason: string) => p<{ withdrawal: Row; receipt: Receipt }>(s, `/branches/${branchId}/probability/withdraw`, 'prediction.scenario.probability.withdraw', 'BRN', { reason }, branchId),
};
