/**
 * CP-6 B82 §CF — the adapters from the existing reads to the charts (lib/chart-reads-b82.ts): they reshape only — nothing filled, smoothed or
 * ranked; an unknown stays null. Every row here is SYNTHETIC fixture data shaped as the reads return it.
 */
import { describe, expect, it } from 'vitest';
import {
  backtestPoints, benchmarkInput, calibrationPairs, correlationInput, ensembleItems, forecastBand, forecastHorizonRows, healthSeries, HEALTH_LEVELS, outcomePoints,
  streamControl, timelineEvents, type CorrelationRead,
} from './chart-reads-b82';
import type { ForecastRow } from './prediction';

const F = (o: Partial<ForecastRow>): ForecastRow => ({
  forecast_id: 'f', series_key: 'cp4', subject_entity_id: null, horizon_code: '30d', horizon_days: 30, origin_at: '2026-10-01', known_at: '2026-10-01T00:00:00Z', target_at: '2026-10-31',
  issued_at: '2026-10-01T01:00:00Z', method: 'hw', method_version: '1', baseline_method: 'sn', quantiles: { q10: 1, q50: 2, q90: 3 }, path: [], drivers: [], assumptions: [], evidence_refs: [],
  refresh_cadence: 'P7D', validation_state: 'unvalidated', validation_note: '', label: 'replay demonstration', skill: null, statement: '', state: 'issued', attention_state: 'none', attention_reason: null, issued_by: 'p', ...o,
}) as ForecastRow;

describe('forecasts', () => {
  it('a path is the band; no path is the one interval at the target', () => {
    expect(forecastBand(F({ path: [{ step: 1, q10: 1, q50: 2, q90: 3 }] }))[0]!.at).toBe('2026-10-02');
    expect(forecastBand(F({}))).toEqual([{ at: '2026-10-31', q10: 1, q50: 2, q90: 3 }]);
  });
  it('per canonical horizon the issued forecast, newest first; another state is said', () => {
    const rows = forecastHorizonRows([
      F({ forecast_id: 'a', issued_at: '2026-10-01T00:00:00Z' }), F({ forecast_id: 'b', issued_at: '2026-10-02T00:00:00Z', state: 'superseded', quantiles: { q10: 9, q50: 9, q90: 9 } }),
      F({ horizon_code: '1y', state: 'withdrawn' }), F({ series_key: 'other', horizon_code: '90d' }),
    ], 'cp4');
    expect(rows.map((r) => r.horizon)).toEqual(['30d', '1y']); expect(rows[0]!.q50).toBe(2); expect(rows[1]!.target).toContain('(withdrawn)');
  });
});

describe('calibration', () => {
  it('outcomes promise 80 % with their sample; backtests give the model and the baseline over their window', () => {
    const o = outcomePoints({ outcomes: [{ series_key: 's', horizon_code: '30d', method: 'm', outcomes: 5, coverage_80: 0.6, pinball_mean: 1, labels: ['live'], t1_met: null }] });
    expect(o[0]).toMatchObject({ nominal: 0.8, observed: 0.6, n: 5, group: 'm' });
    const b = backtestPoints({ backtests: [{ backtest_id: 'k', series_key: 's', horizon_code: '90d', method: 'm', baseline_method: 'sn', origins: 12, coverage_80: 0.75, pinball_mean: 1, baseline_coverage_80: null, baseline_pinball_mean: null, skill_vs_baseline: null, t1_met: null, t2_met: null, verdict: '', window_from: '2025-01-01', window_to: '2026-01-01', computed_at: '' }] });
    expect(b.map((x) => x.group)).toEqual(['learned model', 'seasonal naive']); expect(b[1]!.observed).toBeNull(); expect(b[0]!.period).toContain('2025-01-01 → 2026-01-01');
  });
});

describe('ensembles, streams, health, timeline, twins, fabric', () => {
  it('members, the ensemble (MODEL OUTPUT) and the judgement beside it', () => {
    const items = ensembleItems({
      members: [{ ordinal: 1, method_ref: 'a@1', state: 'issued', quantiles: { q10: 1, q50: 2, q90: 3 }, weight: 0.5 }, { ordinal: 2, method_ref: 'b@1', state: 'excluded', quantiles: null, weight: null }] as never,
      ensemble: { forecast_id: 'e', quantiles: { q10: 1, q50: 2, q90: 4 }, statement: '', validation_state: '', state: 'issued', label_kind: 'MODEL OUTPUT', combination: null },
      standing_overlay: { version: 2, adjustment: { kind: 'quantiles', q10: 2, q50: 3, q90: 5 } } as never,
    });
    expect(items.map((i) => i.note)).toEqual(['member; weight 0.5', 'MODEL OUTPUT', 'JUDGEMENT — beside the model output, never in its place']);
  });
  it('the stream: the latest value per day, late-beyond excluded, the rule as the limit, retractions as interventions', () => {
    const c = streamControl({
      inputs: [
        { input_seq: 1, event_time: '2026-10-01T00:00:00Z', value: 10, lateness: 'on_time', disposition: 'new' }, { input_seq: 3, event_time: '2026-10-01T00:00:00Z', value: 12, lateness: 'late_within_allowance', disposition: 'revision' },
        { input_seq: 2, event_time: '2026-10-02T00:00:00Z', value: 99, lateness: 'late_beyond_allowance', disposition: 'new' },
      ] as never,
      rule: { rule_key: 'r', title: 'Low transits', version: 1, predicate: { comparator: 'le', threshold: 20, min_hits: 2 } } as never,
      signals: [{ emission: 'retracted', emitted_at: '2026-10-03T00:00:00Z', retraction_kind: 'operator' }] as never, checkpoints: [],
    });
    expect(c.points).toEqual([{ at: '2026-10-01', value: 12 }]); expect(c.limits[0]).toMatchObject({ comparator: '<=', value: 20, kind: 'rule' }); expect(c.interventions).toHaveLength(1);
    expect(streamControl({ inputs: [], rule: null, signals: [], checkpoints: [] }).limits).toEqual([]);
  });
  it('health states map to the ordinal levels; an unknown state is "unknown", last', () => {
    expect(healthSeries([{ evaluated_at: '2026-10-01T00:00:00Z', state: 'degraded' }, { evaluated_at: '2026-10-02T00:00:00Z', state: 'weird' }, { evaluated_at: null, state: 'healthy' }]))
      .toEqual([{ at: '2026-10-01T00:00:00Z', value: 1 }, { at: '2026-10-02T00:00:00Z', value: HEALTH_LEVELS.length - 1 }]);
  });
  it('the timeline places versions on the read\'s own axis; ledger events only on record time', () => {
    const items = [{ ref: 'CLM:x@1', objectType: 'CLM', title: 'c', eventTime: '2026-10-01T00:00:00Z', observedAt: null, validFrom: null, validTo: null, recordedAt: '2026-10-02T00:00:00Z', correctedLater: { at: '2026-10-05T00:00:00Z', by: 'K. M' } }] as never;
    const ev = timelineEvents({ items, events: [{ at: '2026-10-03T00:00:00Z', ledger: 'review', event: 'opened', ref: 'r' }], window: { axis: 'event', from: '', to: '' } });
    expect(ev).toHaveLength(1); expect(ev[0]!.at).toBe('2026-10-01T00:00:00Z'); expect(ev[0]!.correction).toContain('2026-10-05');
    expect(timelineEvents({ items, events: [{ at: '2026-10-03T00:00:00Z', ledger: 'review', event: 'opened', ref: 'r' }], window: { axis: 'record', from: '', to: '' } })).toHaveLength(2);
  });
  it('calibration pairs keep their source as the group; benchmark bins state their rule', () => {
    const p = calibrationPairs([{ calibration_id: 'c', key: 'k', twin_title: 'T', pairs: [{ source: 'run', predicted: 1, observed: 2, error: 1, from: 'a', against: 'b' }] } as never, { calibration_id: 'd', key: 'k' } as never]);
    expect(p).toHaveLength(1); expect(p[0]).toMatchObject({ x: 1, y: 2, group: 'run' });
    const b = benchmarkInput({ benchmark: { values: [1, 2, 3, 4, 5, 6, 7, 8], basis: '', citations: [] }, discrepancy: { run_mean: 4, benchmark_mean: 4.5, bias: 0, relative_bias: null, ks: 0, ks_critical: 0, band: [3, 6], coverage_in_band: 0 } });
    expect(b.bins.count).toBe(4); expect(b.marks.map((m) => m.key)).toEqual(['run', 'bench', 'lo', 'hi']); expect(b.rule).toContain('Sturges');
  });
  it('the correlation input titles the exposures and says how each entry was set', () => {
    const r: CorrelationRead = { variables: [{ exposure_id: '0190aaaa-0000', polarity: 'risk', category: 'c', state: 's', title: null }], entries: [{ exposure_a: 'x', exposure_b: 'y', relation: 'correlated', coefficient: '0.4', basis: 'b', estimated_kind: 'agent' }],
      latest: [], counts: { entries: 1, pairs: 1, declared: 0, proposed_by_agent: 1 }, method: 'm', at: '' };
    const c = correlationInput(r); expect(c.variables[0]!.label).toBe('risk 0190aaaa…'); expect(c.cells[0]).toMatchObject({ coefficient: 0.4, kind: 'proposed by an agent run' });
  });
});
