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
  refresh_cadence: string; validation_state: 'unvalidated' | 'validated' | 'validated_retrospective' | 'validation_impossible'; validation_note: string;
  label: 'replay demonstration' | 'live'; skill: Record<string, unknown> | null; statement: string;
  /** The record that validated it, when one did; and the controls inherited from its evidence. */
  backtest_id?: string | null; controls?: Controls | null;
  state: 'issued' | 'superseded' | 'resolved' | 'withdrawn'; attention_state: 'none' | 'assumption_unverified';
  attention_reason: string | null; issued_by: string;
  events?: Array<Record<string, unknown>>; outcomes?: Array<Record<string, unknown>>; attribution?: string | null; unit?: string | null;
  /**
   * CP-6 B21 (0081, L6-I03 ForecastFitnessChanged): the latest prediction.assess_forecast_fitness under the versioned rule — the state,
   * the class an `unfit` names, the assessment id; `fitness` (the get) joins the assessment's measures. Absent from a server before 0081.
   */
  fitness_state?: 'none' | 'fit' | 'unfit' | 'indeterminate'; fitness_class?: string | null; fitness_assessment_id?: string | null;
  fitness?: ForecastFitness | null;
}

/** B21: the measures a fitness assessment recorded — the rule's, never the caller's (the window, the coverage, the pinball vs the backtest, the attention mark, the expiry). */
export interface FitnessMeasures {
  rule_version?: string;
  window?: { series_key: string; horizon: string; method: string; outcomes: number; required: number };
  coverage?: { observed: number | string | null; floor: number | string; checked: boolean };
  pinball?: { observed: number | string | null; backtest: number | string | null; backtest_id: string | null; factor: number | string; checked: boolean };
  attention_state?: string; expiry?: { expires_at: string | null; cadence: string | null; checked: boolean }; classes?: string[]; note?: string | null;
}
export interface ForecastFitness {
  state: string; class: string | null; assessment_id: string | null; measures: FitnessMeasures | null; rule_version: string | null; assessed_at: string | null; trigger: string | null;
}
/** The assessment as the port recorded it (POST …/forecasts/:id/assess, trigger `operator`) — VERBATIM. */
export interface FitnessAssessment {
  assessment_id: string; forecast_id: string; series_key: string; horizon: string; method: string; subject_entity_id: string | null; state: string;
  verdict: 'fit' | 'unfit' | 'indeterminate'; class: string | null; classes: string[]; prior_state: string; prior_class: string | null; changed: boolean;
  measures: FitnessMeasures; assessed_at: string;
}
/** B21 (L7-I04): one finding of a coherence check — a FAIL rule (duplicate_branch, assumption_invalid, forecast_relationship, temporal_order, dependency_retired) or a NOTE (coverage, basis_unchecked). */
export interface CoherenceFinding { rule: string; severity: 'fail' | 'note'; branch_id?: string; other_branch_id?: string; detail: string }
/** The check as the port recorded it (the declaring write, a review, the consumer, or POST …/scenarios/:id/check-coherence) — VERBATIM. */
export interface CoherenceCheck {
  check_id: string; scenario_id: string; scenario_version: number | null; title: string; owner: string; forecast_id: string | null;
  outcome: 'passed' | 'failed'; prior_state: string; changed: boolean; findings: CoherenceFinding[]; rule_version: string; checked_at: string;
}
/** The scenario's coherence as the get serves it — the recorded check joined, or `unchecked` (declared before 0081, or never checked). */
export interface ScenarioCoherence {
  state: string; check_id?: string | null; findings?: CoherenceFinding[]; rule_version?: string | null; checked_at?: string | null; trigger?: string | null;
}

/** Controls inherited from the evidence a derived object rests on (fail-closed fold). */
export interface Controls {
  synthetic_state: boolean; classification: string; rights_profile: string | null; residency_profile: string | null;
  retention_profile: string | null; access_policy_ref: string | null; inputs: number;
}

export interface BacktestRow {
  backtest_id: string; series_key: string; horizon_code: string; method: string; baseline_method: string; origins: number;
  /** 'historical' — each origin saw only what was recorded by then; 'retrospective' — one vintage cut by publisher date. */
  mode?: 'retrospective' | 'historical'; known_at?: string | null; observations?: number | null;
  coverage_80: number | null; pinball_mean: number | null; baseline_coverage_80: number | null; baseline_pinball_mean: number | null;
  skill_vs_baseline: number | null; t1_met: boolean | null; t2_met: boolean | null; verdict: string; window_from: string;
  window_to: string; computed_at: string;
}

export interface BranchRow {
  branch_id: string; scenario_id: string; name: string; kind: 'baseline' | 'upside' | 'downside' | 'disruption' | 'stress' | 'adversarial' | 'counterfactual' | 'user-defined'; kind_label?: string | null; divergence?: string | null; assumptions?: Array<{ statement: string; basis?: string | null }>; kind_vocabulary_version?: number | null; statement: string;
  indicator_id: string | null; signpost: string | null; owner_principal_id: string; review_cadence: string;
  response_window_hours: number; consequence: string; state: 'open' | 'flipped' | 'closed'; flipped_at: string | null;
  /** B2 (0061): the C0–C4 class of the consequence the flip reaches, as declared; null = not stated (a warning assumes C2 and says so). */
  consequence_class?: 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | null;
  flip_event_id: string | null; indicator?: IndicatorRow | null;
  /** 'owed' — the flip is committed and its warning has not yet been raised. */
  warning_state?: 'none' | 'owed' | 'raised'; decision_deadline?: string | null;
  /** 0066 §8 (L7-I05): the instant a review promoted this branch to simulation; null until one did. */
  simulation_candidate_at?: string | null;
  /** B23 (0084, L7-I02): the scenario version that added the branch — 1 when declared with the tree, higher when a BranchScenario added it. */
  added_in_version?: number;
}

/** B23 (0084, L7-I02): the kinds BranchScenario adds, spelled as the vocabulary spells them (baseline and the other four are declared with the tree). */
export type BranchableKind = 'upside' | 'downside' | 'disruption' | 'user-defined';

/** What is sent to add a branch — the declaration's branch keys verbatim. */
export interface BranchIntake {
  name: string; kind: BranchableKind; statement: string; indicatorId: string; owner: string; consequence: string; responseWindowHours: number;
  /** Required for, and only for, a user-defined kind (2-64 characters). */
  kindLabel?: string | null;
  /** Required for a disruption or a user-defined kind (8+ characters): how it diverges from the baseline. */
  divergence?: string | null;
  assumptions?: Array<{ statement: string; basis?: string | null }>;
  consequenceClass?: 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | null;
  signpost?: string | null; decisionDeadline?: string | null;
}

/** The branching as the port recorded it — VERBATIM: `repeated` says the same key and body were answered the first result (no second effect). */
export interface Branching {
  request_id: string; scenario_id: string; branch_id: string; base_version: number; version: number; repeated: boolean;
  name: string; kind: string; kind_label: string | null; requested_at: string; request_digest: string;
  /** The check the write ran on the new version (trigger `branch`); null on a repeat (nothing was checked again). */
  coherence: CoherenceCheck | null;
}

export interface ScenarioRow {
  scenario_id: string; title: string; statement: string; forecast_id: string | null; subject_entity_id: string | null;
  owner_principal_id: string; review_cadence: string; state: 'active' | 'closed' | 'retired'; declared_at: string;
  branches: BranchRow[]; events?: Array<Record<string, unknown>>;
  /**
   * 0066 §8 (L7-I05 ScenarioReviewed): the scenario's review state as the server records it — how many reviews, the last,
   * the next due (null when retired or when the cadence names no interval), and the retirement with its note.
   */
  reviews?: number; last_reviewed_at?: string | null; next_review_due_at?: string | null;
  retired_at?: string | null; retirement_reason?: string | null;
  /**
   * B21 (0081, L7-I04 ScenarioCoherenceFailed): the state of the latest check (`unchecked | passed | failed`) and its id on the list row;
   * the get joins the check (`coherence`). A FAILED scenario is admitted, never refused; no branch of it is simulated and no review
   * promotes it until the findings are resolved (the correction path: retire, declare a successor).
   */
  coherence_state?: 'unchecked' | 'passed' | 'failed'; coherence_check_id?: string | null; coherence?: ScenarioCoherence;
  /**
   * B23 (0084, L7-I02 BranchScenario): the SCN version the tree stands at (1 at declaration, one more per accepted branching) — what an
   * "Add a branch" request names as its expected_version; the get adds the history (every version, what it supersedes, its branches).
   */
  current_version?: number;
  versions?: Array<{ version: number; recorded_at: string; supersedes: string | null; branch_ids: string[] }>;
}

/** A review's outcome (0066 §8): the four the server accepts, spelled as it spells them. */
export type ScenarioReviewOutcome = 'continue' | 'dissent' | 'promote_to_simulation' | 'retire';

/** What is sent to review a scenario — the controller's payload keys verbatim. */
export interface ScenarioReviewIntake {
  outcome: ScenarioReviewOutcome;
  /** The branch the review names: required for a promotion, optional for a dissent, ignored otherwise. */
  branch_id: string | null;
  /** The review's note (8+ characters); on a retirement it becomes the retirement reason. */
  note: string;
  /** A dissent's position (4+) and rationale (8+); the server refuses a dissent without them. */
  dissent: { position: string; rationale: string } | null;
  /** An instant that names the next review; otherwise the cadence's interval from now (daily/weekly/monthly/quarterly; other cadences leave it open). */
  next_review_by: string | null;
}

/** The review as the port recorded it — VERBATIM. */
export interface ScenarioReview {
  scenario_id: string; outcome: ScenarioReviewOutcome; review_ordinal: number; state_after: 'active' | 'closed' | 'retired';
  branch: { branch_id: string; kind: string; state_after: string } | null;
  next_review_due_at: string | null; branches_closed: number; cadence: string | null;
  links: { forecast_id: string | null; decision_objects: string[]; dependents: Array<{ type: string; id: string }>; simulation_runs: string[] };
  /** B21: a continuation or a promotion RE-CHECKS the scenario first (trigger `review`); a dissent or a retirement checks nothing (null). */
  coherence?: CoherenceCheck | null;
}

export interface IndicatorRow {
  indicator_id: string; series_key: string; description: string; comparator: string; threshold: number;
  consecutive_days: number; owner_principal_id: string; state: string; last_value: number | null;
  last_observation_at: string | null; last_evaluated_at: string | null; streak: number; breached: boolean; breached_at: string | null;
  /** The first observation day the indicator watches (migration 0059); null from the series' beginning. */
  observes_from?: string | null;
}

export interface WarningRow {
  warning_id: string; branch_id: string | null; indicator_id: string | null; forecast_id: string | null; title: string;
  evidence: Array<Record<string, unknown>>; consequence: string; confidence: number;
  response_window_opens_at: string; response_window_closes_at: string; routed_to: string; raised_at: string;
  state: 'raised' | 'acknowledged' | 'expired' | 'closed'; acknowledged_at: string | null; acknowledged_by: string | null;
  acknowledgement: string | null; events?: Array<Record<string, unknown>>;
  /** Timing: raised AS OF (replay: the breaching observation; live: the audit clock) versus the decision deadline. */
  flip_event_id?: string | null; raised_as_of?: string; timing_mode?: 'live' | 'replay'; decision_deadline?: string | null;
  timely?: boolean | null; controls?: Controls | null;
  /** Issuance vs RESPONSE: decision_missed says the warning came at or after the deadline; response_timely says whether the answer came before the window closed. */
  decision_missed?: boolean; acknowledged_as_of?: string | null; response_timely?: boolean | null; expired_as_of?: string | null;
  /**
   * B2 (0061): the level derived at raise time from the consequence class under level_version, the urgency the same
   * derivation states, the class it came from (declared on the branch, or assumed C2) and — kept apart — the C0–C4 class of
   * the OPERATION that raised it. Null on a warning raised before the derivation existed.
   */
  level?: 'low' | 'normal' | 'high' | 'critical' | null; level_version?: number | null;
  urgency?: 'routine' | 'prompt' | 'urgent' | 'immediate' | null;
  consequence_class?: 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | null; consequence_class_source?: 'declared' | 'assumed' | null;
  op_class?: 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | null;
}

export interface Calibration {
  statement: string;
  outcomes: Array<{ series_key: string; horizon_code: string; method: string; outcomes: number; coverage_80: number;
                    pinball_mean: number; labels: string[]; t1_met: boolean | null }>;
  backtests: BacktestRow[];
  targets: Record<string, string>;
  /** B21: the latest fitness assessment PER FAMILY (series, horizon, method) — the rule's verdict on LIVE outcomes over the family's last K; absent before 0081. */
  fitness?: Array<{
    series_key: string; horizon_code: string; method: string; forecast_id: string; state: string; class: string | null; outcomes: number;
    coverage: number | string | null; pinball_vs_backtest: unknown; rule_version: string; assessed_at: string; trigger: string;
  }>;
}

export interface Overview {
  series: number;
  forecasts: { total: number; by_state: Record<string, number>; by_validation: Record<string, number>; by_label: Record<string, number>; attention: number };
  scenarios: { total: number; branches: number; flipped: number };
  warnings: { total: number; by_state: Record<string, number>; by_level?: Record<string, number> };
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
        total: number; points: SeriesPoint[]; evidence: number; freshestRecordedAt: string | null; note: string | null;
        complete: boolean; unreadable: Array<{ evidence_object_id: string; evidence_version: number; reason: string }>; controls: Controls }>(
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
  runBacktest: (s: Scope, payload: { seriesKey: string; horizon: string; origins?: number; observedThrough?: string; mode?: 'retrospective' | 'historical' }) =>
    p<{ backtest: Record<string, unknown>; receipt: Receipt }>(s, '/backtests/run', 'prediction.backtest.record', 'BKT', payload),
  recordOutcome: (s: Scope, forecastId: string) =>
    p<{ outcome: Record<string, unknown>; receipt: Receipt }>(s, '/outcomes/record', 'prediction.outcome.record', 'OUT', { forecastId }, forecastId),
  calibration: (s: Scope) => p<{ calibration: Calibration; receipt: Receipt }>(s, '/calibration/summary', 'prediction.read', 'OUT'),
  /**
   * B21 (0081, L6-I03): a forecast owner's assessment of a forecast's fitness under the versioned rule (trigger `operator`; no human
   * gate — a ledger read that records its answer). The verdict is the rule's: `indeterminate` says the family's outcome ledger is thin.
   * The server refuses a withdrawn or superseded forecast; ForecastFitnessChanged@v1 is published only when the state or the class moved.
   */
  assessForecast: (s: Scope, forecastId: string) =>
    p<{ assessment: FitnessAssessment; receipt: Receipt }>(s, `/forecasts/${forecastId}/assess`, 'prediction.forecast.assess', 'FCT', {}, forecastId),
  /**
   * B21 (0081, L7-I04): a reviewer's coherence check of a scenario (trigger `operator`) — deterministic over what the product holds; a
   * FAILED outcome is recorded, never a refusal; the server refuses a retired scenario. Published on a failed and changed check.
   */
  checkCoherence: (s: Scope, scenarioId: string) =>
    p<{ coherence: CoherenceCheck; receipt: Receipt }>(s, `/scenarios/${scenarioId}/check-coherence`, 'prediction.scenario.check', 'SCN', {}, scenarioId),
  listScenarios: (s: Scope) => p<{ scenarios: ScenarioRow[]; receipt: Receipt }>(s, '/scenarios/list', 'prediction.read', 'SCN'),
  getScenario: (s: Scope, id: string) => p<{ scenario: ScenarioRow; receipt: Receipt }>(s, `/scenarios/${id}/get`, 'prediction.read', 'SCN', {}, id),
  /**
   * 0066 §8 (L7-I05): a person's review of a scenario — human-gated, under the purpose `prediction`, C2 (the `p` helper's
   * write class). CONTINUE sets the next review by the cadence or the named instant; DISSENT records a position and
   * rationale and changes nothing; PROMOTE_TO_SIMULATION marks the named branch the simulation candidate; RETIRE closes the
   * open branches and takes the scenario out of the portfolio. The server's refusal (a workload principal, a dissent
   * without its position, a promotion without a branch, a retired scenario) is returned as it states it.
   */
  reviewScenario: (s: Scope, id: string, intake: ScenarioReviewIntake) =>
    p<{ review: ScenarioReview; receipt: Receipt }>(s, `/scenarios/${id}/review`, 'prediction.scenario.review', 'SCN', { ...intake }, id),
  /**
   * B23 (0084, L7-I02 BranchScenario): add an upside, downside, disruption or user-defined branch to a declared scenario as a NEW
   * VERSION (`prediction.scenario.branch`, C2, not human-gated). `expectedVersion` is the current_version the form was opened on;
   * `idempotencyKey` is kept for the life of one open form, so a retry after a lost answer is answered the first result
   * (`repeated: true`). A stale version, a used key with a different branch and a duplicate branch come back 409; baseline and the
   * other kinds 422 — each as the server states it.
   */
  branchScenario: (s: Scope, id: string, expectedVersion: number, idempotencyKey: string, branch: BranchIntake) =>
    p<{ branching: Branching; receipt: Receipt }>(s, `/scenarios/${id}/branches`, 'prediction.scenario.branch', 'SCN',
      { expected_version: expectedVersion, idempotency_key: idempotencyKey, branch }, id),
  listIndicators: (s: Scope) => p<{ indicators: IndicatorRow[]; receipt: Receipt }>(s, '/indicators/list', 'prediction.read', 'IND'),
  evaluateIndicator: (s: Scope, id: string, timing: 'live' | 'replay' = 'live') =>
    p<{ evaluation: { evaluated: number; breached: boolean; streak: number; flips: unknown[]; expiredWarnings: number; knownAt: string; timing: string; owedRecovered: number };
        warnings: Array<{ warningId: string; routedTo: string; raisedAsOf: string; closesAt: string; timely: boolean | null; timingMode: string; recovered: boolean }>; receipt: Receipt }>(
      s, `/indicators/${id}/evaluate`, 'prediction.indicator.evaluate', 'IND', { timing }, id),
  listWarnings: (s: Scope) => p<{ warnings: WarningRow[]; receipt: Receipt }>(s, '/warnings/list', 'prediction.read', 'WRN', { limit: 200 }),
  getWarning: (s: Scope, id: string) => p<{ warning: WarningRow; receipt: Receipt }>(s, `/warnings/${id}/get`, 'prediction.read', 'WRN', {}, id),
  acknowledgeWarning: (s: Scope, id: string, note: string, asOf?: string) =>
    p<{ warning: { warningId: string; state: string }; receipt: Receipt }>(s, `/warnings/${id}/acknowledge`, 'prediction.warning.acknowledge', 'WRN', { note, ...(asOf ? { asOf } : {}) }, id),
};
