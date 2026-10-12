import { describe, expect, it } from 'vitest';
import { byPeriod, dayOf, diffValue, formatValue, intervalLine, previousQuarter, resultMark, roleCounts, stateMark, thresholdLine, valueLine, windowLine } from './analytics-md-b92';

describe('the catalog words (B92 §MD)', () => {
  it('an INDETERMINATE result is said as indeterminate with n, the floor and its reason — never 0, never a bare dash', () => {
    const s = valueLine({ state: 'indeterminate', value: null, kind: 'rate', unit: 'share', n: 2, reasons: ['n = 2 is below the floor 3 the definition declares', 'the period is open'] }, 3);
    expect(s).toBe('INDETERMINATE (n = 2, floor 3) — n = 2 is below the floor 3 the definition declares (+1 more)');
    expect(s).not.toMatch(/(^|\s)0(\s|%|$)/);
    expect(valueLine({ state: 'indeterminate', value: null, kind: 'duration', unit: 'seconds', n: null, reasons: [] }, null)).toBe('INDETERMINATE (n = not counted) — no reason recorded');
  });
  it('an UNSUPPORTED result names its carrier; a determinate one its value, n and interval', () => {
    expect(valueLine({ state: 'unsupported', value: null, kind: 'rate', unit: 'share', n: null, reasons: ['unsupported: no source: B107/H3'] }, 3)).toBe('UNSUPPORTED — not computed: no source: B107/H3');
    expect(valueLine({ state: 'determinate', value: '0.75', kind: 'rate', unit: 'share', n: 8, uncertainty: { method: 'wilson', lo: 0.409, hi: 0.929 } }, 3)).toBe('75.0 % (n = 8; 95 % Wilson 40.9 %–92.9 %)');
    expect(valueLine({ state: 'determinate', value: 0, kind: 'rate', unit: 'share', n: 5, uncertainty: null }, 3)).toBe('0.0 % (n = 5)');   // a MEASURED zero is a value
  });
  it('durations and intervals; the median interval unbounded below n = 6 is said', () => {
    expect(formatValue(270, 'duration', 'seconds')).toBe('4.5 min');
    expect(formatValue(30, 'duration', 'seconds')).toBe('30 s');
    expect(formatValue(9000, 'duration', 'seconds')).toBe('2.5 h');
    expect(intervalLine({ method: 'order_statistics', lo_rank: null, hi_rank: null, note: 'n < 6: the interval of the median is unbounded' }, 'duration', 'seconds')).toBe('n < 6: the interval of the median is unbounded');
    expect(intervalLine({ method: 'order_statistics', lo_rank: 1, hi_rank: 8, lo: 60, hi: 480 }, 'duration', 'seconds')).toBe('95 % median interval 60 s–8.0 min (ranks 1–8)');
    expect(intervalLine(null, 'rate', 'share')).toBe('');
  });
  it('states are visibly distinct; a preview and a replay are marked', () => {
    const texts = ['draft', 'proposed', 'approved', 'retired', 'superseded', 'rejected'].map((s) => stateMark(s).text);
    expect(new Set(texts).size).toBe(6);
    expect(resultMark({ state: 'determinate', preview: true }).text).toBe('DETERMINATE · PREVIEW (not current)');
    expect(resultMark({ state: 'indeterminate', replay_of: 'x' }).text).toBe('INDETERMINATE · REPLAY');
    expect(resultMark({ state: 'unsupported' }).glyph).not.toBe(resultMark({ state: 'determinate' }).glyph);
  });
  it('a threshold breach is a REVIEW; the records by role in order; diff values; periods newest first', () => {
    expect(thresholdLine({ threshold: { target: 0.8 }, breach: true, action: 'a review by the owner' })).toBe('BREACH of the target 0.8 — a review: a review by the owner');
    expect(thresholdLine({ threshold: { band: [0.75, 0.85] }, breach: false })).toBe('within the band 0.75–0.85');
    expect(thresholdLine(null)).toBe('no threshold evaluated');
    expect(roleCounts({ excluded: 2, numerator: 6, denominator: 2 })).toEqual([{ role: 'numerator', count: 6 }, { role: 'denominator', count: 2 }, { role: 'excluded', count: 2 }]);
    expect(diffValue({ target: 0.6 })).toBe('{"target":0.6}');
    expect(diffValue(null)).toBe('—none—');
    const g = byPeriod([{ period_key: '2026-Q2', computed_at: '2026-10-01T00:00:00Z' }, { period_key: '2026-Q3', computed_at: '2026-10-02T00:00:00Z' }, { period_key: '2026-Q3', computed_at: '2026-10-03T00:00:00Z' }]);
    expect(g.map((x) => [x.period, x.results.length])).toEqual([['2026-Q3', 2], ['2026-Q2', 1]]);
    expect(g[0]!.results[0]!.computed_at).toBe('2026-10-03T00:00:00Z');
  });
  it('DATES as the day they name; the window\'s last day; the scene\'s last quarter', () => {
    expect(dayOf('2026-09-30')).toBe('2026-09-30');
    expect(dayOf('2026-09-30T23:30:00-05:00')).toBe('2026-09-30');
    expect(dayOf(null)).toBe('—');
    expect(windowLine('2026-07-01T00:00:00Z', '2026-10-01T00:00:00Z')).toBe('2026-07-01 … 2026-09-30 (UTC)');
    expect(previousQuarter(new Date('2026-10-12T10:00:00Z'))).toBe('2026-Q3');
    expect(previousQuarter(new Date('2027-02-01T10:00:00Z'))).toBe('2026-Q4');
  });
});
