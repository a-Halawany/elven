/**
 * The forecast's two announced transitions at the function boundary (CP-6 B18; design §2.1 #7–#8, §2.2; D2, D20): the
 * PURE builders pinned key by key on uuid fixtures — ForecastIssued@v2 with the six v1 keys where they were and the
 * interface's fields beside them, `expiryOf` for the four cadences and the rest, the 200 ceiling on the drivers with
 * `truncated` said; ForecastWithdrawn@v1 from a port-shaped answer (`prediction.withdraw_forecast`) with the dependants
 * carried as the port cut them, and the unfit classes the port admits. No database: what the B18 harness proves on a
 * live forecast (S1(7), S2(a)), this holds on the builders.
 */
import { describe, expect, it } from 'vitest';
import { LIFECYCLE_EVENT_LIST_MAX } from '../../../src/graph/subscriptions/change-events.js';
import { FORECAST_UNFIT_CLASSES, FORECAST_WITHDRAW_METHOD_REF, expiryOf, forecastIssuedEvent, forecastWithdrawnEvent } from '../../../src/prediction/forecasting/forecast-events.js';

type Row = Record<string, unknown>;
let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190d1e2-f3a4-7000-8000-${h}`; };
const FCT = uid(); const ENTITY = uid(); const ACTOR = uid(); const ASU = uid(); const BKT = uid();
const ISSUED = '2026-09-17T10:00:00.000Z';

const issued = (over: Partial<Parameters<typeof forecastIssuedEvent>[0]> = {}) => forecastIssuedEvent({
  forecastId: FCT, seriesKey: 'ecb-eurusd', subjectEntityId: ENTITY, horizon: '90d', horizonDays: 90,
  method: 'seasonal-naive', methodVersion: '1.0.0', baselineMethod: 'seasonal-naive',
  validationState: 'validation_impossible', validationNote: '12 observation(s) are known for this series at this cut-off', backtestId: null, skill: null,
  label: 'short history', supersededForecastId: null,
  originAt: '2021-02-15', knownAt: '2026-09-17T09:59:59.000Z', targetAt: '2021-05-16', observedThrough: '2021-02-15', issuedAt: ISSUED, refreshCadence: 'weekly',
  quantiles: { q10: 1.1, q50: 1.2, q90: 1.3 }, unit: 'USD per EUR',
  drivers: [{ series_key: 'ecb-eurusd', role: 'the series itself, fitted on its own history', share: 1 }], assumptions: [ASU],
  evidenceRefs: [{ evidence_object_id: uid(), evidence_version: 1, evidence_digest: 'a'.repeat(64) }, { evidence_object_id: uid(), evidence_version: 2, evidence_digest: 'b'.repeat(64) }],
  controls: { synthetic_state: false, classification: 'internal' }, actor: ACTOR, ...over,
});

describe('B18 · expiryOf — the refresh cadence as a duration', () => {
  it('daily 1d, weekly 7d, monthly 30d, quarterly 91d from the issue instant, the basis named', () => {
    expect(expiryOf(ISSUED, 'daily')).toEqual({ expires_at: '2026-09-18T10:00:00.000Z', basis: 'daily' });
    expect(expiryOf(ISSUED, 'weekly')).toEqual({ expires_at: '2026-09-24T10:00:00.000Z', basis: 'weekly' });
    expect(expiryOf(ISSUED, 'monthly')).toEqual({ expires_at: '2026-10-17T10:00:00.000Z', basis: 'monthly' });
    expect(expiryOf(ISSUED, 'quarterly')).toEqual({ expires_at: '2026-12-17T10:00:00.000Z', basis: 'quarterly' });
  });
  it('anything else computes no expiry and says why', () => {
    const odd = expiryOf(ISSUED, 'fortnightly');
    expect(odd.expires_at).toBeNull(); expect(odd.basis).toMatch(/"fortnightly" is not daily, weekly, monthly or quarterly/);
    const bad = expiryOf('not an instant', 'weekly');
    expect(bad.expires_at).toBeNull(); expect(bad.basis).toMatch(/is not an instant/);
  });
});

describe('B18 · forecastIssuedEvent — ForecastIssued@v2, not a rename', () => {
  it('the six v1 keys where they were; the v2 fields pinned key by key; the expiry from the issue instant; the cause on the FCT', () => {
    const row = issued();
    expect(row.eventType).toBe('ForecastIssued');
    const p = row.payload;
    expect(p['schema']).toBe('ForecastIssued'); expect(p['schema_version']).toBe('v2');
    // the v1 six (the telemetry index reads payload ->> 'forecast_id')
    expect(p['forecast_id']).toBe(FCT); expect(p['series_key']).toBe('ecb-eurusd'); expect(p['horizon']).toBe('90d'); expect(p['method']).toBe('seasonal-naive');
    expect(p['validation_state']).toBe('validation_impossible'); expect(p['label']).toBe('short history'); expect(p['superseded_forecast_id']).toBeNull();
    // v2
    expect(p['subject_entity_id']).toBe(ENTITY); expect(p['horizon_days']).toBe(90); expect(p['method_version']).toBe('1.0.0'); expect(p['baseline_method']).toBe('seasonal-naive');
    expect(p['origin_at']).toBe('2021-02-15'); expect(p['known_at']).toBe('2026-09-17T09:59:59.000Z'); expect(p['target_at']).toBe('2021-05-16');
    expect(p['observed_through']).toBe('2021-02-15'); expect(p['issued_at']).toBe(ISSUED); expect(p['refresh_cadence']).toBe('weekly');
    expect(p['expiry']).toEqual({ expires_at: '2026-09-24T10:00:00.000Z', basis: 'weekly' });
    expect(p['distribution']).toEqual({ q10: 1.1, q50: 1.2, q90: 1.3, unit: 'USD per EUR' });
    expect(p['validation']).toEqual({ state: 'validation_impossible', note: '12 observation(s) are known for this series at this cut-off', backtest_id: null });
    expect(p['calibration']).toEqual({ skill: null });
    expect(p['drivers']).toEqual({ count: 1, keys: ['ecb-eurusd'] });
    expect(p['lineage']).toEqual({ assumptions: [ASU], evidence_refs: 2, evidence_sample: expect.arrayContaining([expect.objectContaining({ evidence_version: 1 })]) });
    expect((p['lineage'] as Row)['evidence_sample']).toHaveLength(2);
    expect(p['controls']).toEqual({ synthetic_state: false, classification: 'internal' });
    expect(p['truncated']).toBe(false);
    expect(p['temporal']).toEqual({ known_at: '2026-09-17T09:59:59.000Z' });
    expect(p['cause']).toEqual({ action: 'prediction.forecast.issue', actor: ACTOR, target_type: 'FCT', target_id: FCT });
    // nothing of the body: no path, no statement, no narrative
    for (const k of ['path', 'statement', 'narrative', 'evidence']) expect(p).not.toHaveProperty(k);
  });
  it('a validated re-issue names its backtest, its skill and the forecast it superseded; a driver without a series key is named by its role', () => {
    const superseded = uid();
    const p = issued({ validationState: 'validated', backtestId: BKT, skill: { skill_vs_baseline: 0.2, t2_met: true }, supersededForecastId: superseded, label: 'live',
                       drivers: [{ role: 'the corridor', share: 0.4 }, { series_key: 'x', share: 0.6 }] }).payload;
    expect(p['validation']).toEqual(expect.objectContaining({ state: 'validated', backtest_id: BKT }));
    expect(p['calibration']).toEqual({ skill: { skill_vs_baseline: 0.2, t2_met: true } });
    expect(p['superseded_forecast_id']).toBe(superseded); expect(p['label']).toBe('live');
    expect(p['drivers']).toEqual({ count: 2, keys: ['the corridor', 'x'] });
  });
  it('the drivers are cut at LIFECYCLE_EVENT_LIST_MAX and truncated says so; the evidence sample is at most twenty', () => {
    const drivers = Array.from({ length: 250 }, (_, i) => ({ series_key: `s-${i}`, share: 1 / 250 }));
    const evidenceRefs = Array.from({ length: 60 }, (_, i) => ({ evidence_object_id: uid(), evidence_version: i, evidence_digest: 'c'.repeat(64) }));
    const p = issued({ drivers, evidenceRefs }).payload;
    expect(LIFECYCLE_EVENT_LIST_MAX).toBe(200);
    expect((p['drivers'] as Row)['count']).toBe(250); expect(((p['drivers'] as Row)['keys'] as string[]).length).toBe(200);
    expect(p['truncated']).toBe(true);
    expect((p['lineage'] as Row)['evidence_refs']).toBe(60); expect(((p['lineage'] as Row)['evidence_sample'] as unknown[]).length).toBe(20);
  });
});

describe('B18 · forecastWithdrawnEvent — ForecastWithdrawn@v1 from the port\'s answer', () => {
  /** The port's answer (prediction.withdraw_forecast RETURNS jsonb), as the design pins it. */
  const answer = (over: Row = {}): Row => ({
    forecast_id: FCT, series_key: 'ecb-eurusd', horizon: '30d', subject_entity_id: ENTITY, withdrawn_at: '2026-09-17T11:00:00.123456+00:00',
    dependants: { scenarios: [{ scenario_id: uid(), state: 'active', attention_state: 'none' }], warnings: [], twins: [{ twin_id: uid(), version: 2, verification_state: 'verified' }],
                  simulations: [{ run_id: uid(), state: 'completed', validity: 'valid' }], packages: [{ package_id: uid(), version: 1, state: 'committed', committed: true, option_keys: ['reroute'] }], truncated: false },
    prior: { issued_at: ISSUED, known_at: '2026-09-17T09:59:59.000Z', origin_at: '2021-02-15', target_at: '2021-03-17', validation_state: 'validation_impossible',
             quantiles: { q10: 1.1, q50: 1.2, q90: 1.3 }, label: 'replay demonstration', method: 'seasonal-naive', method_version: '1.0.0' },
    ...over,
  });
  it('the unfit classes and the method the withdrawn version names are the port\'s', () => {
    expect([...FORECAST_UNFIT_CLASSES]).toEqual(['calibration_failure', 'data_shift', 'drift', 'envelope_breach', 'input_withdrawn', 'method_unfit', 'owner_judgement']);
    expect(FORECAST_WITHDRAW_METHOD_REF).toBe('prediction.forecast.withdraw@1.0.0');
  });
  it('pinned key by key: the forecast, the reason and class, the version admitted, what stood before, the dependants as the port cut them, the cause on the FCT', () => {
    const withdrawn = answer();
    const row = forecastWithdrawnEvent({ withdrawn, reason: 'the corridor series shifted after issue; the fit no longer holds', unfitClass: 'data_shift', withdrawnVersion: 2, actor: ACTOR, occurredAt: '2026-09-17T11:00:00.000Z' });
    expect(row.eventType).toBe('ForecastWithdrawn');
    const p = row.payload;
    expect(p['schema']).toBe('ForecastWithdrawn'); expect(p['schema_version']).toBe('v1');
    expect(p['forecast_id']).toBe(FCT); expect(p['series_key']).toBe('ecb-eurusd'); expect(p['horizon']).toBe('30d'); expect(p['subject_entity_id']).toBe(ENTITY);
    expect(p['reason']).toBe('the corridor series shifted after issue; the fit no longer holds'); expect(p['unfit_class']).toBe('data_shift');
    expect(p['withdrawn_at']).toBe('2026-09-17T11:00:00.123456+00:00'); expect(p['withdrawn_version']).toBe(2);
    expect(p['prior']).toEqual({ issued_at: ISSUED, known_at: '2026-09-17T09:59:59.000Z', validation_state: 'validation_impossible', quantiles: { q10: 1.1, q50: 1.2, q90: 1.3 }, label: 'replay demonstration', method: 'seasonal-naive' });
    expect(p['dependants']).toEqual(withdrawn['dependants']);
    expect(p['temporal']).toEqual({ known_at: '2026-09-17T11:00:00.000Z' });
    expect(p['cause']).toEqual({ action: 'prediction.forecast.withdraw', actor: ACTOR, target_type: 'FCT', target_id: FCT });
  });
  it('a sparse answer (no prior, no dependants) yields nulls and empty lists, never a throw', () => {
    const p = forecastWithdrawnEvent({ withdrawn: { forecast_id: FCT }, reason: 'owner judgement', unfitClass: 'owner_judgement', withdrawnVersion: 2, actor: ACTOR, occurredAt: ISSUED }).payload;
    expect(p['series_key']).toBeNull(); expect(p['withdrawn_at']).toBeNull();
    expect(p['prior']).toEqual({ issued_at: null, known_at: null, validation_state: null, quantiles: null, label: null, method: null });
    expect(p['dependants']).toEqual({ scenarios: [], warnings: [], twins: [], simulations: [], packages: [], truncated: false });
  });
});
