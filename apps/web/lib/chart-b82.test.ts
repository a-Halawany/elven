/**
 * CP-6 B82 §CF — the chart geometry and the grammar's kind rules (lib/chart-b82.ts): scales and ticks, gaps drawn as gaps, the band never a
 * line, identity without colour, residuals shown, no causal words, no trendline without a method, a threshold as a rule, the table rows
 * mirroring the drawing, and chartGrammar = assertGrammar + additions only. Every figure here is SYNTHETIC fixture data.
 */
import { describe, expect, it } from 'vitest';
import { assertGrammar, type ChartSpec } from './b82-seams';
import {
  bandPath, bridgeGeometry, bridgeRows, bridgeSteps, calibrationGeometry, calibrationRows, causalWordsIn, cellText, chartGrammar, chartNumber, controlRows,
  correlationMatrix, DASH_ARRAY, eventTimelineGeometry, eventTimelineRows, extentOf, histogram, histogramGeometry, horizonMatrixRows, horizonRowScale, linearScale,
  markerPath, meanSigma, meets, nextPointIndex, niceDomain, niceStep, olsFit, pathOf, pathPoints, percentileGeometry, probabilityBandGeometry, probabilityBandRows,
  quantile, rowLines, rowText, runsAndGaps, scatterGeometry, SERIES_IDENTITIES, stepPathOf, timeSeriesGeometry, timeSeriesRows, timeTicks, toInstant, wilson,
  TIME_SERIES_COLUMNS, PROBABILITY_BAND_COLUMNS,
} from './chart-b82';

const DAY = 86_400_000;
const SPEC: ChartSpec = {
  kind: 'time_series', title: 'Chokepoint 4 daily transits (SYNTHETIC)', basis: 'observed daily transit counts',
  time: { basis: 'observation', cutoff: '2026-10-18T00:00:00Z', asOf: '2026-10-19T08:00:00Z' },
  units: [{ measure: 'transits', unit: 'vessels per day' }],
  sources: [{ specimen: 'a SYNTHETIC catalogue series' }],
  uncertainty: { kind: 'not_quantified', statement: 'counts as published; no measurement error is stated' },
  legend: [{ key: 'transits', label: 'transits', dash: 'solid', marker: 'circle' }],
  alternative: { summary: 'Transits per day.', columns: TIME_SERIES_COLUMNS('vessels per day') },
};

describe('instants and numbers', () => {
  it('a DATE is the UTC day it names; an unparseable value is null, never guessed', () => {
    expect(toInstant('2026-10-01')).toBe(Date.UTC(2026, 9, 1));
    expect(toInstant('2026-10-01T12:00:00Z')).toBe(Date.UTC(2026, 9, 1, 12));
    expect(toInstant('soon')).toBeNull(); expect(toInstant(null)).toBeNull(); expect(toInstant('')).toBeNull();
  });
  it('chartNumber keeps magnitude-based precision and says unknown', () => {
    expect(chartNumber(0.34312)).toBe('0.343'); expect(chartNumber(12.345)).toBe('12.3'); expect(chartNumber(1234.6)).toBe('1,235');
    expect(chartNumber(null)).toBe('unknown'); expect(chartNumber(Number.NaN)).toBe('unknown');
  });
  it('a cell keeps its unit, a date its day, an unknown its word', () => {
    expect(cellText(0.5, { kind: 'number', unit: 'probability' })).toBe('0.5 probability');
    expect(cellText('2026-10-01T05:00:00Z', { kind: 'date' })).toBe('2026-10-01');
    expect(cellText(null, { kind: 'text' })).toBe('unknown');
    expect(cellText('2026-10-01T05:06:00Z', { kind: 'instant' })).toBe('2026-10-01 05:06 UTC');
  });
});

describe('scales and ticks', () => {
  it('a linear scale maps the domain; a degenerate domain maps to the middle (no division by zero)', () => {
    const s = linearScale([0, 10], [100, 200]); expect(s(5)).toBe(150); expect(s(0)).toBe(100);
    expect(linearScale([3, 3], [0, 10])(3)).toBe(5);
  });
  it('nice steps are 1, 2 or 5 × 10ⁿ and the nice domain covers the data', () => {
    expect(niceStep(0, 100, 5)).toBe(20); expect(niceStep(0, 1, 5)).toBe(0.2); expect(niceStep(0, 0)).toBe(1);
    const d = niceDomain(0.282, 0.406); expect(d.min).toBeLessThanOrEqual(0.282); expect(d.max).toBeGreaterThanOrEqual(0.406);
    expect(d.ticks[0]).toBe(d.min); expect(niceDomain(5, 5).max).toBeGreaterThan(5); expect(niceDomain(3, 8, { includeZero: true }).min).toBe(0);
  });
  it('time ticks are UTC days, months or years by span', () => {
    const d = timeTicks(Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 30));
    expect(d.length).toBeGreaterThan(1); expect(d[0]!.label).toMatch(/^2026-10-\d{2}$/);
    expect(timeTicks(Date.UTC(2025, 0, 15), Date.UTC(2026, 9, 1))[0]!.label).toMatch(/^\d{4}-\d{2}$/);
    expect(timeTicks(Date.UTC(2000, 0, 1), Date.UTC(2026, 0, 1))[0]!.label).toMatch(/^\d{4}$/);
    expect(timeTicks(5, 1)).toEqual([]);
  });
  it('extentOf ignores non-finite values', () => { expect(extentOf([null, 3, Number.NaN, -1, undefined])).toEqual([-1, 3]); expect(extentOf([null])).toBeNull(); });
});

describe('gaps are gaps (VIZ-01)', () => {
  it('a null value breaks the line and is reported as a missing value', () => {
    const r = runsAndGaps([{ t: 0, v: 1 }, { t: DAY, v: null }, { t: 2 * DAY, v: 3 }], DAY);
    expect(r.runs.length).toBe(2); expect(r.gaps).toEqual([{ from: 0, to: 2 * DAY, reason: 'missing_value' }]);
  });
  it('a step wider than 1.5 cadences is a missing interval', () => {
    const r = runsAndGaps([{ t: 0, v: 1 }, { t: DAY, v: 2 }, { t: 5 * DAY, v: 3 }], DAY);
    expect(r.runs.length).toBe(2); expect(r.gaps[0]!.reason).toBe('missing_interval');
    expect(runsAndGaps([{ t: 0, v: 1 }, { t: 5 * DAY, v: 3 }], null).runs.length).toBe(1);
  });
  it('the path has one M per run — never bridged', () => {
    expect(pathOf([[{ x: 0, y: 0 }, { x: 1, y: 1 }], [{ x: 5, y: 5 }]]).match(/M/g)!.length).toBe(2);
    expect(stepPathOf([[{ x: 0, y: 0 }, { x: 2, y: 1 }]], 4)).toBe('M0 0 H2 V1 H4');
  });
  it('the time series geometry draws the gap, keeps one value axis and indexes the table rows', () => {
    const series = [{ key: 'a', label: 'A', points: [{ at: '2026-10-01', value: 2 }, { at: '2026-10-02', value: null }, { at: '2026-10-03', value: 4 }] }];
    const g = timeSeriesGeometry(series, { cadenceMs: DAY });
    expect(g.gaps.length).toBe(1); expect(g.series[0]!.points.map((p) => p.row)).toEqual([0, 2]);
    const rows = timeSeriesRows(series); expect(rows).toHaveLength(3); expect(rows[1]!['value']).toBeNull();
    expect(chartGrammar(SPEC, rows)).toEqual([]);
    expect(timeSeriesGeometry([]).empty).toBe(true);
  });
  it('an ordinal series is drawn as steps with the state words as ticks', () => {
    const g = timeSeriesGeometry([{ key: 's', label: 'health', points: [{ at: '2026-10-01T00:00:00Z', value: 0 }, { at: '2026-10-02T00:00:00Z', value: 2 }] }], { levels: ['healthy', 'degraded', 'failing'] });
    expect(g.yTicks.map((t) => t.label)).toEqual(['healthy', 'degraded', 'failing']); expect(g.series[0]!.d).toContain('H');
    expect(timeSeriesRows([{ key: 's', label: 'health', points: [{ at: '2026-10-01', value: 1 }] }], ['healthy', 'degraded'])[0]!['value']).toBe('degraded');
  });
});

describe('event timeline (VIZ-02)', () => {
  const ev = [
    { key: 'b', at: '2026-10-02T10:00:00Z', label: 'claim corrected', actor: 'K. Müller', source: 'review', correction: 'v2 corrects v1' },
    { key: 'a', at: '2026-10-01T10:00:00Z', label: 'claim extracted', actor: 'extractor', source: 'EVD', correction: null },
    { key: 'c', at: null, label: 'untimed version', actor: null, source: null, correction: null },
  ];
  it('rows are in time order; an untimed event is listed last, never dropped', () => {
    const r = eventTimelineRows(ev); expect(r.map((x) => x['event'])).toEqual(['claim extracted', 'claim corrected', 'untimed version']);
    expect(r[0]!['correction']).toBe('none recorded');
  });
  it('marks are placed in lanes without collisions; the untimed count is stated', () => {
    const g = eventTimelineGeometry(ev); expect(g.marks).toHaveLength(2); expect(g.unplaced).toBe(1); expect(g.marks[1]!.corrected).toBe(true);
    const crowd = eventTimelineGeometry(Array.from({ length: 5 }, (_, i) => ({ key: String(i), at: '2026-10-01T00:00:00Z', label: 'x', actor: null, source: null, correction: null })));
    expect(new Set(crowd.marks.map((m) => m.lane)).size).toBe(5);
  });
});

describe('probability band (CMP-061, VIZ-03)', () => {
  const path = [{ step: 1, q10: 0.28, q50: 0.34, q90: 0.41 }, { step: 2, q10: 0.27, q50: 0.35, q90: 0.43 }, { step: 3, q10: 0.26, q50: 0.36, q90: 0.45 }];
  it('a path is stepped in days from its origin', () => { expect(pathPoints('2026-10-01', path).map((p) => p.at)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04']); expect(pathPoints('bad', path)).toEqual([]); });
  it('the band is a closed polygon around the median; the cutoff is placed', () => {
    const pts = pathPoints('2026-10-01', path); const g = probabilityBandGeometry(pts, { cutoff: '2026-10-01' });
    expect(g.band.endsWith('Z')).toBe(true); expect(g.median.startsWith('M')).toBe(true); expect(g.cutoffX).not.toBeNull(); expect(g.medianPoints).toHaveLength(3);
    expect(probabilityBandRows(pts)).toHaveLength(3);
  });
  it('a missing quantile breaks the band (counted), a single point is an interval', () => {
    const g = probabilityBandGeometry([{ at: '2026-10-02', q10: 1, q50: 2, q90: 3 }, { at: '2026-10-03', q10: null, q50: 2, q90: null }, { at: '2026-10-04', q10: 1, q50: 2, q90: 3 }]);
    expect(g.gaps).toBe(1); expect(bandPath([[{ x: 5, lo: 10, hi: 2 }]])).toContain('Z');
  });
  it('the grammar refuses a band whose uncertainty is not quantified', () => {
    const band: ChartSpec = { ...SPEC, kind: 'probability_band', time: { ...SPEC.time, basis: 'horizon' }, uncertainty: { kind: 'not_quantified', statement: 'none' }, alternative: { summary: 's', columns: PROBABILITY_BAND_COLUMNS('vessels per day') } };
    expect(chartGrammar(band).some((p) => p.startsWith('uncertainty: a probability band'))).toBe(true);
    expect(chartGrammar({ ...band, uncertainty: { kind: 'band', statement: 'q10–q90', level: 0.8 } })).toEqual([]);
  });
});

describe('horizon matrix (VIZ-04)', () => {
  it('every canonical horizon has a row in order; an empty one says so', () => {
    const r = horizonMatrixRows([{ horizon: '1y', target: 't', q10: 1, q50: 2, q90: 3, unit: 'u', method: 'm', score: null, use: 'scenario language' }, { horizon: '10y', target: null, q10: null, q50: null, q90: null, unit: null, method: null, score: null, use: null }]);
    expect(r.map((x) => x['horizon'])).toEqual(['30d', '90d', '180d', '1y', '3y', '5y', '10y']); expect(r[0]!['score']).toBe('nothing issued at this horizon');
  });
  it('each row has its own declared scale', () => {
    const a = horizonRowScale({ q10: 0.2, q50: 0.3, q90: 0.4 }, 200); const b = horizonRowScale({ q10: 200, q50: 300, q90: 400 }, 200);
    expect(a.ticks[1]!.label).not.toBe(b.ticks[1]!.label); expect(a.lo).toBeLessThan(a.hi!); expect(horizonRowScale({ q10: null, q50: null, q90: null }, 100).mid).toBeNull();
  });
});

describe('distribution (VIZ-08)', () => {
  it('quantiles interpolate order statistics', () => { expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5); expect(quantile([], 0.5)).toBeNull(); expect(quantile([1], 2)).toBeNull(); });
  it('declared edges count every value; outside values are counted apart; the last bin is closed', () => {
    const h = histogram([0, 1, 2, 3, 10], { edges: [0, 1, 2, 3] });
    expect(h.bins.map((b) => b.count)).toEqual([1, 1, 2]); expect(h.outside).toBe(1); expect(h.n).toBe(5);
    expect(histogram([1, 1, 1], { count: 3 }).bins.reduce((s, b) => s + b.count, 0)).toBe(3); expect(histogram([], { count: 2 }).bins).toEqual([]);
  });
  it('bars start at zero; marks are placed; percentile strips share one axis', () => {
    const g = histogramGeometry(histogram([1, 2, 2, 3], { count: 2 }).bins, { marks: [{ key: 'm', label: 'mean', at: 2 }] });
    expect(g.yTicks[0]!.label).toBe('0'); expect(g.marks).toHaveLength(1); expect(g.bars).toHaveLength(2);
    const p = percentileGeometry([{ key: 'a', label: 'A', p10: 1, p50: 2, p90: 3 }, { key: 'b', label: 'B', p10: null, p50: 5, p90: null }]);
    expect(p.strips[1]!.lo).toBeNull(); expect(p.strips[0]!.lo).toBeLessThan(p.strips[0]!.hi!);
  });
});

describe('calibration (VIZ-09)', () => {
  it('the Wilson interval contains the observed rate and narrows with n', () => {
    const a = wilson(8, 10)!; const b = wilson(80, 100)!; expect(a[0]).toBeLessThan(0.8); expect(a[1]).toBeGreaterThan(0.8);
    expect(b[1] - b[0]).toBeLessThan(a[1] - a[0]); expect(wilson(1, 0)).toBeNull();
  });
  it('one shared nominal level lays out by category with the reference mark; mixed levels lie on the diagonal', () => {
    const pts = [{ key: 'a', label: 'A 30d', group: 'm1', nominal: 0.8, observed: 0.7, n: 10, period: 'p' }, { key: 'b', label: 'B 90d', group: 'm2', nominal: 0.8, observed: null, n: 0, period: null }];
    const g = calibrationGeometry(pts); expect(g.layout).toBe('category'); expect(g.points[1]!.y).toBeNull(); expect(g.diagonal).toBeNull();
    expect(calibrationGeometry([{ ...pts[0]!, nominal: 0.5 }, pts[0]!]).diagonal).not.toBeNull();
    expect(calibrationRows(pts)[1]!['lo']).toBeNull();
  });
});

describe('waterfall and variance bridge (VIZ-22, VIZ-23)', () => {
  it('the residual is always a step — and says "fully attributed" at zero', () => {
    const s = bridgeSteps({ label: 'Start', value: 10 }, [{ key: 'a', label: 'A', delta: 5 }, { key: 'b', label: 'B', delta: -2 }], { label: 'End', value: 14 });
    expect(s.map((x) => x.kind)).toEqual(['start', 'increase', 'decrease', 'residual', 'end']); expect(s[3]!.delta).toBe(1);
    const z = bridgeRows(bridgeSteps({ label: 'S', value: 1 }, [{ key: 'a', label: 'A', delta: 1 }], { label: 'E', value: 2 }));
    expect(z[2]!['kind']).toBe('residual — fully attributed');
  });
  it('an unknown component stays listed and falls into the residual', () => {
    const s = bridgeSteps({ label: 'S', value: 0 }, [{ key: 'u', label: 'U', delta: null }], { label: 'E', value: 3 });
    expect(s[1]!.delta).toBeNull(); expect(s[2]!.delta).toBe(3);
  });
  it('the geometry includes zero and connects the steps', () => {
    const g = bridgeGeometry(bridgeSteps({ label: 'S', value: 5 }, [{ key: 'a', label: 'A', delta: -8 }], { label: 'E', value: -3 }));
    expect(g.yTicks.some((t) => t.label === '0')).toBe(true); expect(g.connectors.match(/M/g)!.length).toBe(3); expect(bridgeGeometry([]).empty).toBe(true);
  });
});

describe('correlation matrix (VIZ-24)', () => {
  it('causal words are found as words', () => {
    expect(causalWordsIn('Port congestion drives delay')).toEqual(['drives']); expect(causalWordsIn('declared association, not estimated')).toEqual([]);
    expect(causalWordsIn('delay because of rain')).toEqual(['because of']); expect(causalWordsIn('due to rain')).toContain('due to'); expect(causalWordsIn('the recaused')).toEqual([]);
  });
  it('the upper triangle; the latest entry wins; a missing pair is stated, never zero', () => {
    const m = correlationMatrix([{ key: 'x', label: 'X' }, { key: 'y', label: 'Y' }, { key: 'z', label: 'Z' }], [
      { a: 'x', b: 'y', coefficient: 0.2, relation: 'correlated', n: null, basis: 'old', kind: 'human' },
      { a: 'y', b: 'x', coefficient: 0.5, relation: 'correlated', n: null, basis: 'new', kind: 'human' },
    ]);
    expect(m.pairs).toBe(3); expect(m.missing).toBe(2); expect(m.rows[0]!['coefficient']).toBe(0.5); expect(m.rows[2]!['relation']).toBe('missing — nothing declared');
  });
  it('the grammar refuses causal language and requires the method, sample and missingness definitions', () => {
    const c: ChartSpec = { ...SPEC, kind: 'correlation_matrix', time: { ...SPEC.time, basis: 'record' }, title: 'What drives the corridor exposures', alternative: { summary: 's', columns: [{ key: 'a', label: 'A', kind: 'text' }] } };
    const p = chartGrammar(c); expect(p.some((x) => x.startsWith('language:'))).toBe(true); expect(p.filter((x) => x.startsWith('definitions:'))).toHaveLength(3);
    const ok = { ...c, title: 'Declared exposure associations', alternative: { ...c.alternative, definitions: [{ term: 'Method', definition: 'declared by a person' }, { term: 'Sample', definition: 'none' }, { term: 'Missingness', definition: 'unstated pairs' }] } };
    expect(chartGrammar(ok)).toEqual([]);
  });
});

describe('scatter (VIZ-25)', () => {
  it('OLS needs three points with an x spread', () => {
    const f = olsFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])!; expect(f.slope).toBeCloseTo(2); expect(f.intercept).toBeCloseTo(1); expect(f.r2).toBeCloseTo(1);
    expect(olsFit([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }])).toBeNull(); expect(olsFit([{ x: 1, y: 1 }])).toBeNull();
  });
  it('the identity reference shares one scale; a fit is drawn only when asked with its method; unplottable points are counted', () => {
    const pts = [{ key: 'a', label: null, x: 1, y: 2, group: 'g' }, { key: 'b', label: null, x: 3, y: 2.5, group: 'g' }, { key: 'c', label: null, x: null, y: 1, group: 'g' }];
    const g = scatterGeometry(pts, { line: { kind: 'identity', label: 'perfect agreement' } }); expect(g.line).not.toBeNull(); expect(g.fit).toBeNull(); expect(g.dropped).toBe(1);
    expect(scatterGeometry(pts).line).toBeNull();
  });
});

describe('control chart (VIZ-26)', () => {
  it('a rule is met, never "out of control"; mean and sigma need two values', () => {
    expect(meets(5, '>=', 5)).toBe(true); expect(meets(5, '<', 5)).toBe(false);
    expect(meanSigma([1, 3])!.mean).toBe(2); expect(meanSigma([1])).toBeNull();
    const r = controlRows([{ at: '2026-10-02', value: 40 }, { at: '2026-10-01', value: 12 }, { at: '2026-10-03', value: null }], [{ key: 'r', label: 'B28 rule: transits ≤ 20', value: 20, comparator: '<=', basis: 'the rule', kind: 'rule' }]);
    expect(r.map((x) => x['rules'])).toEqual(['B28 rule: transits ≤ 20', 'none', 'unknown — no value']);
  });
  it('the grammar asks the control chart for its baseline and rule definitions and a time basis', () => {
    const c: ChartSpec = { ...SPEC, kind: 'control_chart', time: { ...SPEC.time, basis: 'none' } };
    const p = chartGrammar(c); expect(p.some((x) => x.startsWith('time: a control chart'))).toBe(true); expect(p.filter((x) => x.startsWith('definitions:'))).toHaveLength(2);
  });
});

describe('identity without colour, the keyboard path and the tooltip (D5, CMP-058, CMP-059)', () => {
  it('every dash and marker has a drawing; the identity set is distinct', () => {
    expect(DASH_ARRAY.solid).toBeNull(); expect(DASH_ARRAY.dashed).not.toBeNull();
    for (const m of ['circle', 'square', 'triangle', 'diamond', 'cross'] as const) expect(markerPath(m, 10, 10).length).toBeGreaterThan(5);
    expect(markerPath('none', 0, 0)).toBe('');
    expect(new Set(SERIES_IDENTITIES.map((s) => `${s.dash}+${s.marker}`)).size).toBe(SERIES_IDENTITIES.length);
  });
  it('arrow keys move one point, Home / End to the ends, RTL mirrors', () => {
    expect(nextPointIndex(0, 'ArrowRight', 3)).toBe(1); expect(nextPointIndex(2, 'ArrowRight', 3)).toBe(2); expect(nextPointIndex(1, 'Home', 3)).toBe(0);
    expect(nextPointIndex(0, 'End', 3)).toBe(2); expect(nextPointIndex(1, 'ArrowRight', 3, 'rtl')).toBe(0); expect(nextPointIndex(0, 'x', 3)).toBeNull(); expect(nextPointIndex(0, 'Home', 0)).toBeNull();
  });
  it('the tooltip mirrors the table row in the column order', () => {
    const cols = TIME_SERIES_COLUMNS('vessels per day'); const row = { series: 'A', at: '2026-10-01', value: 12 };
    expect(rowLines(row, cols)).toEqual([{ label: 'Series', value: 'A' }, { label: 'Time', value: '2026-10-01' }, { label: 'Value', value: '12 vessels per day' }]);
    expect(rowText(row, cols)).toBe('Series: A; Time: 2026-10-01; Value: 12 vessels per day');
  });
});

describe('chartGrammar = assertGrammar + additions only (UX-ADR-015)', () => {
  it('every assertGrammar problem is kept, first and in order', () => {
    const bad = { ...SPEC, title: '', units: [] } as ChartSpec;
    const base = assertGrammar(bad); expect(chartGrammar(bad).slice(0, base.length)).toEqual(base);
  });
  it('rows are checked against the columns', () => {
    const p = chartGrammar(SPEC, [{ series: 'A', at: '2026-10-01', value: 'twelve' }, { extra: 1 }]);
    expect(p).toContain('rows: row 1\'s "value" is not a number (a number column holds a number or unknown)');
    expect(p).toContain('rows: row 2 names "extra", which the alternative\'s columns do not declare');
  });
  it('never throws on any shape', () => {
    for (const x of [null, undefined, 1, 'x', {}, { kind: 'correlation_matrix', alternative: null }]) expect(() => chartGrammar(x as unknown as ChartSpec)).not.toThrow();
  });
  it('a horizon matrix declares the horizon basis', () => {
    expect(chartGrammar({ ...SPEC, kind: 'horizon_matrix', uncertainty: { kind: 'band', statement: 'b', level: 0.8 } }).some((p) => p.startsWith('time: a horizon matrix'))).toBe(true);
  });
});

describe('cadence, notes and extra columns', () => {
  it('the observed cadence is the median step; under three points none', async () => {
    const { medianStepMs } = await import('./chart-b82');
    expect(medianStepMs(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10'])).toBe(86_400_000); expect(medianStepMs(['2026-10-01', '2026-10-02'])).toBeNull();
  });
  it('a point\'s note and a calibration point\'s extra columns reach the table rows', () => {
    expect(timeSeriesRows([{ key: 'a', label: 'A', points: [{ at: '2026-10-01', value: 1, note: 'why' }] }])[0]!['note']).toBe('why');
    expect(TIME_SERIES_COLUMNS('u', 'date', false, 'Reason').map((c) => c.key)).toEqual(['series', 'at', 'value', 'note']);
    expect(calibrationRows([{ key: 'k', label: 'L', group: 'g', nominal: 0.8, observed: 0.5, n: 4, period: null, extra: { pinball: 1.2 } }])[0]!['pinball']).toBe(1.2);
  });
});

describe('direct labels never overlap', () => {
  it('labels closer than the gap are spread apart within the bounds', async () => {
    const { spreadLabels } = await import('./chart-b82');
    const m = spreadLabels([{ key: 'a', y: 100 }, { key: 'b', y: 104 }, { key: 'c', y: 300 }], 14, 10, 200);
    expect(m.get('b')! - m.get('a')!).toBeGreaterThanOrEqual(14); expect(m.get('c')).toBeLessThanOrEqual(200);
  });
});
