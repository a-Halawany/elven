/**
 * CP-6 B82 §CF — every spec a page places passes the grammar WITH the rows its adapter produces (chartGrammar(spec, rows) = []), and states
 * the record's own words (the validation state quoted, "declared, not estimated", a rule as a signal). SYNTHETIC rows shaped as the reads return.
 */
import { describe, expect, it } from 'vitest';
import {
  bridgeRows, bridgeSteps, calibrationRows, chartGrammar, controlRows, correlationMatrix, distributionBinRows, distributionPercentileRows, eventTimelineRows, histogram,
  horizonMatrixRows, probabilityBandRows, scatterRows, timeSeriesRows,
} from './chart-b82';
import {
  backtestSpec, benchmarkSpec, correlationSpec, ensembleSpec, forecastBandSpec, healthSpec, horizonSpec, outcomesSpec, pairsSpec, readExport, seriesSpec, streamSpec, timelineSpec,
} from './chart-specs-b82';
import type { ForecastRow } from './prediction';

const READ_AT = '2026-10-19T08:00:00.000Z';
const F = { forecast_id: '01a0f7df-0000-7000-8000-000000000001', series_key: 'corridor.bab-el-mandeb.transit-delay', horizon_code: '30d', known_at: '2026-10-18T00:00:00Z',
  method: 'event_logit', method_version: '1', validation_state: 'unvalidated', validation_note: 'no applicable backtest has scored it', label: 'replay demonstration', unit: 'probability' } as unknown as ForecastRow;

describe('the page specs pass the grammar with their rows', () => {
  it('the forecast band quotes the validation state and cites the forecast', () => {
    const pts = [{ at: '2026-10-19', q10: 0.282, q50: 0.343, q90: 0.406 }];
    const s = forecastBandSpec(F, pts, READ_AT);
    expect(chartGrammar(s, probabilityBandRows(pts))).toEqual([]);
    expect(s.uncertainty.statement).toContain('UNVALIDATED'); expect(s.sources[0]).toMatchObject({ citation: { kind: 'forecast', version: 1 } });
  });
  it('a cutoff after the as-of is clamped; an absent one is declared', () => {
    expect(forecastBandSpec({ ...F, known_at: '2030-01-01T00:00:00Z' } as ForecastRow, [], READ_AT).time.cutoff).toBe(READ_AT);
    expect(forecastBandSpec({ ...F, known_at: null } as unknown as ForecastRow, [], READ_AT).time.cutoff).toHaveProperty('absent');
  });
  it('horizons, series, calibration, ensembles', () => {
    expect(chartGrammar(horizonSpec('s', [], READ_AT), horizonMatrixRows([]))).toEqual([]);
    expect(chartGrammar(seriesSpec('s', 'u', 2, '2026-10-18T00:00:00Z', READ_AT, 'cadence 1 day', null), timeSeriesRows([{ key: 's', label: 's', points: [{ at: '2026-10-01', value: 1 }] }]))).toEqual([]);
    const cp = [{ key: 'k', label: 'L', group: 'm', nominal: 0.8, observed: 0.7, n: 10, period: null, extra: { pinball: 1.2, t1: 'MET' } }];
    expect(chartGrammar(outcomesSpec(cp, READ_AT), calibrationRows(cp))).toEqual([]);
    const bp = [{ key: 'k', label: 'L', group: 'learned model', nominal: 0.8, observed: 0.7, n: 10, period: 'w', extra: { skill: 0.1, targets: 'T1 MET' } }, { key: 'n', label: 'L', group: 'seasonal naive', nominal: 0.8, observed: null, n: 10, period: 'w', extra: { skill: null, targets: 'T1 NOT MET' } }];
    expect(chartGrammar(backtestSpec(bp, READ_AT), calibrationRows(bp))).toEqual([]);
    expect(chartGrammar(outcomesSpec([], READ_AT), [])).toEqual([]);
    const items = [{ key: 'a', label: 'A', p10: 1, p50: 2, p90: 3, note: 'member' }];
    expect(chartGrammar(ensembleSpec('s', '30d', 'u', items, '2026-10-18T00:00:00Z', READ_AT, 'linear_pool@1'), distributionPercentileRows(items))).toEqual([]);
  });
  it('the stream, health, timeline, pairs, benchmark, correlations', () => {
    const lim = [{ key: 'r', label: 'r', value: 20, comparator: '<=' as const, basis: 'b', kind: 'rule' as const }];
    expect(chartGrammar(streamSpec('t', 'vessels', 1, '2026-10-18T00:00:00Z', READ_AT, 'a day ≤ 20', 0), controlRows([{ at: '2026-10-01', value: 3 }], lim))).toEqual([]);
    expect(chartGrammar(healthSpec('src', 1, READ_AT, true), timeSeriesRows([{ key: 'h', label: 'health', points: [{ at: '2026-10-01T00:00:00Z', value: 0, note: 'r' }] }], ['healthy']))).toEqual([]);
    for (const axis of ['event', 'observation', 'valid', 'record']) {
      expect(chartGrammar(timelineSpec('CLM x', axis, [], '2026-10-18T00:00:00Z', READ_AT, false), eventTimelineRows([{ key: 'a', at: '2026-10-01T00:00:00Z', label: 'l', actor: null, source: null, correction: null, recordedAt: null }])), axis).toEqual([]);
    }
    expect(chartGrammar(timelineSpec('CLM x', 'record', [], READ_AT, READ_AT, true), [])).toEqual([]);
    const pts = [{ key: 'p', label: 'p', x: 1, y: 2, group: 'run' }];
    expect(chartGrammar(pairsSpec('m@1', pts, READ_AT), scatterRows(pts))).toEqual([]);
    expect(chartGrammar(pairsSpec('m@1', [], READ_AT), [])).toEqual([]);
    expect(chartGrammar(benchmarkSpec('total_cost', 'benchmark', 3, READ_AT, 'Sturges', 'consistent', 'a basis'), distributionBinRows(histogram([1, 2, 3], { count: 2 }).bins))).toEqual([]);
    const m = correlationMatrix([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], []);
    expect(chartGrammar(correlationSpec(m.pairs, m.missing, READ_AT, 'declared by a person'), m.rows)).toEqual([]);
    expect(chartGrammar(streamSpec('t', 'u', 0, null, READ_AT, 'r', 0), [])).toEqual([]);
  });
  it('the export label names the scope, the ceiling (or that none is declared) and the as-of', () => {
    const e = readExport({ tenantId: 't', domainId: 'd' } as never, READ_AT);
    expect(e.scope).toBe('tenant t / domain d'); expect(e.classificationCeiling).toContain('declares none'); expect(e.asOf).toBe(READ_AT);
  });
  it('the bridge rows stay grammatical for §SC (waterfall rows)', () => {
    expect(bridgeRows(bridgeSteps({ label: 'a', value: 1 }, [], { label: 'b', value: 2 }))).toHaveLength(3);
  });
});
