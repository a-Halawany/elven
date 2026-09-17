/**
 * THE FORECAST'S TWO ANNOUNCED TRANSITIONS (CP-6 B18, 0078; design §2.1 #7–#8, §2.2; D2, D8, D20) — pure builders.
 *
 * ForecastIssued@v2 (L6-I02) is what the issue route publishes in the issuing write: the six v1 keys kept at the top
 * level (the telemetry index and view read `payload ->> 'forecast_id'`, 0065 — a reader of the v1 row reads v2 unchanged)
 * and the interface's fields added — the schema name, the cut-offs, the distribution summary, the validation state with its
 * backtest, the calibration (skill), the drivers, the lineage, the computed expiry from the refresh cadence, and the cause.
 * Not a rename: `eventType` stays `ForecastIssued`; the outbox row's `schema_version` column takes `v2` from the payload.
 *
 * ForecastWithdrawn@v1 (L6-I05) is what the withdraw route publishes in the withdrawing write, beside
 * GraphChanged/forecast.withdrawn (change-events.ts, the consumers' selector): the forecast marked unfit with its reason
 * and class, the FCT version admitted as withdrawn, what stood before, and the dependants the port enumerated (each
 * list already cut at 200 by the port, `truncated` said).
 *
 * The 0066+ convention (read-events.md §5(1)b): `schema`, `schema_version`, stable ids and versions (never bodies), the
 * minimum transition data, `temporal.known_at`, `cause: {action, actor (the bare principal), target_type, target_id}`;
 * every list that can grow is cut at LIFECYCLE_EVENT_LIST_MAX with a sibling `truncated`. No read, no service import:
 * the write hands the builder what it holds.
 */
import { LIFECYCLE_EVENT_LIST_MAX, type OutboxRow } from '../../graph/subscriptions/change-events.js';

type Row = Record<string, unknown>;

/** The classes a withdrawal names (the port refuses any other): why the forecast is unfit, in the owner's words. */
export const FORECAST_UNFIT_CLASSES = ['calibration_failure', 'data_shift', 'drift', 'envelope_breach', 'input_withdrawn', 'method_unfit', 'owner_judgement'] as const;
export type ForecastUnfitClass = (typeof FORECAST_UNFIT_CLASSES)[number];

/** The method the withdrawn FCT version names. */
export const FORECAST_WITHDRAW_METHOD_REF = 'prediction.forecast.withdraw@1.0.0';

/** The refresh cadence as a duration in days — the only cadences a forecast declares; anything else computes no expiry and says so. */
const CADENCE_DAYS: Readonly<Record<string, number>> = Object.freeze({ daily: 1, weekly: 7, monthly: 30, quarterly: 91 });

const cut = <T>(xs: T[]): T[] => xs.slice(0, LIFECYCLE_EVENT_LIST_MAX);

/**
 * When an issued forecast is due its refresh: `issuedAt` + the cadence (daily 1d, weekly 7d, monthly 30d, quarterly 91d),
 * the basis named; an unknown cadence or an unreadable instant yields null with the basis saying why.
 */
export function expiryOf(issuedAt: string, refreshCadence: string): { expires_at: string | null; basis: string } {
  const days = CADENCE_DAYS[refreshCadence];
  if (days === undefined) return { expires_at: null, basis: `no expiry computed: refresh cadence "${refreshCadence}" is not daily, weekly, monthly or quarterly` };
  const t = Date.parse(issuedAt);
  if (Number.isNaN(t)) return { expires_at: null, basis: `no expiry computed: the issue instant "${issuedAt}" is not an instant` };
  return { expires_at: new Date(t + days * 86_400_000).toISOString(), basis: refreshCadence };
}

/**
 * ForecastIssued@v2 — built in the issuing write from what `ForecastingService.issue` computed (nothing re-read). The v1
 * six (`forecast_id, series_key, horizon, method, validation_state, label, superseded_forecast_id`) stay where they were.
 */
export function forecastIssuedEvent(a: {
  forecastId: string; seriesKey: string; subjectEntityId: string | null; horizon: string; horizonDays: number;
  method: string; methodVersion: string; baselineMethod: string;
  validationState: string; validationNote: string; backtestId: string | null; skill: unknown | null;
  label: string; supersededForecastId: string | null;
  originAt: string; knownAt: string; targetAt: string; observedThrough: string | null; issuedAt: string; refreshCadence: string;
  quantiles: Record<string, number>; unit: string | null;
  drivers: unknown[]; assumptions: string[]; evidenceRefs: unknown[];
  controls: { synthetic_state: boolean; classification: string };
  actor: string;
}): OutboxRow {
  const driverKeys = a.drivers.map((d) => {
    const r = (d !== null && typeof d === 'object' ? d : {}) as Row;
    return String(r['series_key'] ?? r['role'] ?? '');
  });
  return { eventType: 'ForecastIssued', payload: {
    schema: 'ForecastIssued', schema_version: 'v2',
    // the six v1 keys, unchanged
    forecast_id: a.forecastId, series_key: a.seriesKey, horizon: a.horizon, method: a.method, validation_state: a.validationState,
    label: a.label, superseded_forecast_id: a.supersededForecastId,
    // v2
    subject_entity_id: a.subjectEntityId, horizon_days: a.horizonDays, method_version: a.methodVersion, baseline_method: a.baselineMethod,
    origin_at: a.originAt, known_at: a.knownAt, target_at: a.targetAt, observed_through: a.observedThrough, issued_at: a.issuedAt,
    refresh_cadence: a.refreshCadence, expiry: expiryOf(a.issuedAt, a.refreshCadence),
    distribution: { q10: a.quantiles['q10'] ?? null, q50: a.quantiles['q50'] ?? null, q90: a.quantiles['q90'] ?? null, unit: a.unit },
    validation: { state: a.validationState, note: a.validationNote, backtest_id: a.backtestId },
    calibration: { skill: a.skill },
    drivers: { count: a.drivers.length, keys: cut(driverKeys) },
    lineage: { assumptions: cut(a.assumptions), evidence_refs: a.evidenceRefs.length, evidence_sample: a.evidenceRefs.slice(0, 20) },
    controls: { synthetic_state: a.controls.synthetic_state, classification: a.controls.classification },
    truncated: a.drivers.length > LIFECYCLE_EVENT_LIST_MAX || a.assumptions.length > LIFECYCLE_EVENT_LIST_MAX,
    temporal: { known_at: a.knownAt },
    cause: { action: 'prediction.forecast.issue', actor: a.actor, target_type: 'FCT', target_id: a.forecastId },
  } };
}

/**
 * ForecastWithdrawn@v1 — built in the withdrawing write from the port's answer (`prediction.withdraw_forecast`: the
 * forecast, its series and horizon, the instant, the dependants enumerated and cut, what stood before) and the write's
 * own facts (the reason, the class, the FCT version admitted as withdrawn, the actor, the instant).
 */
export function forecastWithdrawnEvent(a: { withdrawn: Row; reason: string; unfitClass: string; withdrawnVersion: number; actor: string; occurredAt: string }): OutboxRow {
  const w = a.withdrawn;
  const prior = (w['prior'] !== null && typeof w['prior'] === 'object' ? w['prior'] : {}) as Row;
  const dependants = (w['dependants'] !== null && typeof w['dependants'] === 'object' ? w['dependants'] : {}) as Row;
  const forecastId = String(w['forecast_id']);
  return { eventType: 'ForecastWithdrawn', payload: {
    schema: 'ForecastWithdrawn', schema_version: 'v1',
    forecast_id: forecastId, series_key: w['series_key'] ?? null, horizon: w['horizon'] ?? null, subject_entity_id: w['subject_entity_id'] ?? null,
    reason: a.reason, unfit_class: a.unfitClass, withdrawn_at: w['withdrawn_at'] ?? null, withdrawn_version: a.withdrawnVersion,
    prior: { issued_at: prior['issued_at'] ?? null, known_at: prior['known_at'] ?? null, validation_state: prior['validation_state'] ?? null,
             quantiles: prior['quantiles'] ?? null, label: prior['label'] ?? null, method: prior['method'] ?? null },
    dependants: { scenarios: dependants['scenarios'] ?? [], warnings: dependants['warnings'] ?? [], twins: dependants['twins'] ?? [],
                  simulations: dependants['simulations'] ?? [], packages: dependants['packages'] ?? [], truncated: dependants['truncated'] === true },
    temporal: { known_at: a.occurredAt },
    cause: { action: 'prediction.forecast.withdraw', actor: a.actor, target_type: 'FCT', target_id: forecastId },
  } };
}
