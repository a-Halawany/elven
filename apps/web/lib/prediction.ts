/**
 * Prediction API client — the Forecasts, Scenarios, Warnings and Calibration
 * screens.
 *
 * Every response is returned VERBATIM. In this workspace that rule carries one
 * more consequence: a forecast's `validation_state`, `label` and validation note
 * are rendered exactly as the server recorded them, and a screen never softens
 * "replay demonstration" or "unvalidated" into something it is not.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export interface SeriesRow {
  series_key: string; source_key: string; parser_ref: string; value_field: string; selector: string | null;
  unit: string; seasonality_days: number; subject_entity_id: string | null; attribution: string | null;
  description: string; registered_at: string;
}

export interface SeriesPoint {
  date: string; value: number; evidence_object_id: string; evidence_version: number; evidence_digest: string; recorded_at: string;
}

export interface ForecastRow {
  forecast_id: string; series_key: string; subject_entity_id: string | null; horizon_code: string; horizon_days: number;
  origin_at: string; known_at: string; target_at: string; issued_at: string; method: string; method_version: string;
  baseline_method: string; quantiles: { q10: number; q50: number; q90: number };
  path: Array<{ step: number; q10: number; q50: number; q90: number }>;
  drivers: Array<{ series_key: string; role: string; share: number | null; evidence_object_id: string; evidence_version: number;
                   evidence_digest: string; attribution: string | null }>;
  assumptions: string[]; evidence_refs: Array<{ evidence_object_id: string; evidence_version: number; evidence_digest: string }>;
  refresh_cadence: string; validation_state: 'unvalidated' | 'validated' | 'validation_impossible'; validation_note: string;
  label: 'replay demonstration' | 'live'; skill: Record<string, unknown> | null; statement: string;
  state: 'issued' | 'superseded' | 'resolved' | 'withdrawn'; attention_state: 'none' | 'assumption_unverified';
  attention_reason: string | null; issued_by: string;
  events?: Array<Record<string, unknown>>; outcomes?: Array<Record<string, unknown>>; attribution?: string | null; unit?: string | null;
}

export interface BacktestRow {
  backtest_id: string; series_key: string; horizon_code: string; method: string; baseline_method: string; origins: number;
  coverage_80: number | null; pinball_mean: number | null; baseline_coverage_80: number | null; baseline_pinball_mean: number | null;
  skill_vs_baseline: number | null; t1_met: boolean | null; t2_met: boolean | null; verdict: string; window_from: string;
  window_to: string; computed_at: string;
}

export interface BranchRow {
  branch_id: string; scenario_id: string; name: string; kind: 'baseline' | 'upside' | 'downside'; statement: string;
  indicator_id: string | null; signpost: string | null; owner_principal_id: string; review_cadence: string;
  response_window_hours: number; consequence: string; state: 'open' | 'flipped' | 'closed'; flipped_at: string | null;
  flip_event_id: string | null; indicator?: IndicatorRow | null;
}

export interface ScenarioRow {
  scenario_id: string; title: string; statement: string; forecast_id: string | null; subject_entity_id: string | null;
  owner_principal_id: string; review_cadence: string; state: 'active' | 'closed'; declared_at: string;
  branches: BranchRow[]; events?: Array<Record<string, unknown>>;
}

export interface IndicatorRow {
  indicator_id: string; series_key: string; description: string; comparator: string; threshold: number;
  consecutive_days: number; owner_principal_id: string; state: string; last_value: number | null;
  last_observation_at: string | null; last_evaluated_at: string | null; streak: number; breached: boolean; breached_at: string | null;
}

export interface WarningRow {
  warning_id: string; branch_id: string | null; indicator_id: string | null; forecast_id: string | null; title: string;
  evidence: Array<Record<string, unknown>>; consequence: string; confidence: number;
  response_window_opens_at: string; response_window_closes_at: string; routed_to: string; raised_at: string;
  state: 'raised' | 'acknowledged' | 'expired' | 'closed'; acknowledged_at: string | null; acknowledged_by: string | null;
  acknowledgement: string | null; events?: Array<Record<string, unknown>>;
}

export interface Calibration {
  statement: string;
  outcomes: Array<{ series_key: string; horizon_code: string; method: string; outcomes: number; coverage_80: number;
                    pinball_mean: number; labels: string[]; t1_met: boolean | null }>;
  backtests: BacktestRow[];
  targets: Record<string, string>;
}

export interface Overview {
  series: number;
  forecasts: { total: number; by_state: Record<string, number>; by_validation: Record<string, number>; by_label: Record<string, number>; attention: number };
  scenarios: { total: number; branches: number; flipped: number };
  warnings: { total: number; by_state: Record<string, number> };
  outcomes: number; backtests: number;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction`;

async function p<T>(
  s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {},
  objectId: string | null = null,
): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType,
    object_id: objectId, purpose_id: 'prediction',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const prediction = {
  overview: (s: Scope) => p<{ overview: Overview; receipt: Receipt }>(s, '/overview', 'prediction.read', 'FCT'),
  listSeries: (s: Scope) => p<{ series: SeriesRow[]; parsers: string[]; receipt: Receipt }>(s, '/series/list', 'prediction.read', 'SER'),
  seriesPoints: (s: Scope, seriesKey: string, knownAt?: string, observedThrough?: string, limit = 400) =>
    p<{ seriesKey: string; knownAt: string; observedThrough: string | null; unit: string; attribution: string | null;
        total: number; points: SeriesPoint[]; evidence: number; freshestRecordedAt: string | null; note: string | null }>(
      s, `/series/${encodeURIComponent(seriesKey)}/points`, 'prediction.read', 'SER',
      { ...(knownAt ? { knownAt } : {}), ...(observedThrough ? { observedThrough } : {}), limit }),
  listForecasts: (s: Scope, knownAt?: string) =>
    p<{ forecasts: ForecastRow[]; knownAt: string | null; receipt: Receipt }>(
      s, '/forecasts/list', 'prediction.read', 'FCT', { limit: 200, ...(knownAt ? { knownAt } : {}) }),
  getForecast: (s: Scope, forecastId: string) =>
    p<{ forecast: ForecastRow; receipt: Receipt }>(s, `/forecasts/${forecastId}/get`, 'prediction.read', 'FCT', {}, forecastId),
  issueForecast: (s: Scope, payload: { seriesKey: string; horizon: string; assumptions: string[]; label: string; knownAt?: string; observedThrough?: string; refreshCadence?: string }) =>
    p<{ forecast: { forecastId: string; method: string; validationState: string; quantiles: { q10: number; q50: number; q90: number }; statement: string; targetAt: string }; receipt: Receipt }>(
      s, '/forecasts/issue', 'prediction.forecast.issue', 'FCT', payload),
  runBacktest: (s: Scope, payload: { seriesKey: string; horizon: string; origins?: number }) =>
    p<{ backtest: Record<string, unknown>; receipt: Receipt }>(s, '/backtests/run', 'prediction.backtest.record', 'BKT', payload),
  recordOutcome: (s: Scope, forecastId: string) =>
    p<{ outcome: Record<string, unknown>; receipt: Receipt }>(s, '/outcomes/record', 'prediction.outcome.record', 'OUT', { forecastId }, forecastId),
  calibration: (s: Scope) => p<{ calibration: Calibration; receipt: Receipt }>(s, '/calibration/summary', 'prediction.read', 'OUT'),
  listScenarios: (s: Scope) => p<{ scenarios: ScenarioRow[]; receipt: Receipt }>(s, '/scenarios/list', 'prediction.read', 'SCN'),
  getScenario: (s: Scope, id: string) => p<{ scenario: ScenarioRow; receipt: Receipt }>(s, `/scenarios/${id}/get`, 'prediction.read', 'SCN', {}, id),
  listIndicators: (s: Scope) => p<{ indicators: IndicatorRow[]; receipt: Receipt }>(s, '/indicators/list', 'prediction.read', 'IND'),
  evaluateIndicator: (s: Scope, id: string) =>
    p<{ evaluation: { evaluated: number; breached: boolean; streak: number; flips: unknown[]; expiredWarnings: number; knownAt: string };
        warnings: Array<{ warningId: string; routedTo: string; closesAt: string }>; receipt: Receipt }>(
      s, `/indicators/${id}/evaluate`, 'prediction.indicator.evaluate', 'IND', {}, id),
  listWarnings: (s: Scope) => p<{ warnings: WarningRow[]; receipt: Receipt }>(s, '/warnings/list', 'prediction.read', 'WRN', { limit: 200 }),
  getWarning: (s: Scope, id: string) => p<{ warning: WarningRow; receipt: Receipt }>(s, `/warnings/${id}/get`, 'prediction.read', 'WRN', {}, id),
  acknowledgeWarning: (s: Scope, id: string, note: string) =>
    p<{ warning: { warningId: string; state: string }; receipt: Receipt }>(s, `/warnings/${id}/acknowledge`, 'prediction.warning.acknowledge', 'WRN', { note }, id),
};
