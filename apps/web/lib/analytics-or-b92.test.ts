import { describe, expect, it } from 'vitest';
import { dayOf, durationText, followLine, intervalLine, openFollowthrough, periodCell, populationLine, reviewMark, sampleLine, stateMark, thresholdLine, valueLine, windowLine } from './analytics-or-b92';

/** CP-6 B92 §OR (0113_b92_x_or): the operating review is WORDED, never computed on the client — an indeterminate result is never a zero. */
describe('the operating review words what the server recorded', () => {
  it('a state is a glyph, a token and words — no history, not computed, indeterminate and unsupported are distinct and never read as zero', () => {
    expect(stateMark('determinate')).toMatchObject({ glyph: '●', text: 'DETERMINATE' });
    expect(stateMark('indeterminate')).toMatchObject({ glyph: '◌', text: 'INDETERMINATE' });
    expect(stateMark('unsupported')).toMatchObject({ glyph: '⊘', token: '--eye-color-critical', text: 'UNSUPPORTED' });
    expect(stateMark(null, 'not_computed').text).toBe('NOT COMPUTED');
    expect(stateMark('indeterminate', 'no_history').text).toBe('NO HISTORY');
    expect(reviewMark('closed').text).toBe('CLOSED (signed by the chair; immutable)');
    expect(reviewMark('held').text).toMatch(/^HELD \(citations frozen/);
  });
  it('a determinate rate is a percentage, a duration is time; an indeterminate value is its state and its reason — never "0"', () => {
    expect(valueLine({ state: 'determinate', kind: 'rate', unit: 'share', value: '0.800000', reasons: [] })).toBe('80.0 %');
    expect(valueLine({ state: 'determinate', kind: 'duration', unit: 'seconds', value: 2100, reasons: [] })).toBe('35 min (2100 s)');
    const ind = valueLine({ state: 'indeterminate', kind: 'rate', unit: 'share', value: null, reasons: ['n = 6 is below the floor 8 the definition declares: the sample cannot carry a determinate value'] });
    expect(ind).toBe('INDETERMINATE — n = 6 is below the floor 8 the definition declares: the sample cannot carry a determinate value');
    expect(ind).not.toMatch(/(^|\s)0(\s|%|$)/);
    expect(valueLine({ state: 'unsupported', kind: 'rate', unit: 'share', value: null, reasons: ['unsupported: no source in the product'] })).toBe('UNSUPPORTED — unsupported: no source in the product');
    expect(valueLine(null, 'not computed: no result of MET-001 for 2026-Q3 has been computed yet')).toBe('NOT COMPUTED — not computed: no result of MET-001 for 2026-Q3 has been computed yet');
    expect(durationText(90)).toBe('90 s'); expect(durationText(10800)).toBe('3.0 h (10800 s)');
  });
  it('the interval: Wilson for a rate, the median\'s order statistics for a duration, unbounded said', () => {
    expect(intervalLine('rate', 'share', { method: 'wilson', level: 0.95, lo: 0.375, hi: 0.964 })).toBe('95 % Wilson 37.5 % – 96.4 %');
    expect(intervalLine('duration', 'seconds', { method: 'order_statistics', lo: 600, hi: 3600, lo_rank: 1, hi_rank: 6 })).toBe('median 95 % 10 min (600 s) – 60 min (3600 s) (ranks 1–6)');
    expect(intervalLine('duration', 'seconds', { method: 'order_statistics', lo_rank: null, hi_rank: null, note: 'n < 6: the interval of the median is unbounded' })).toMatch(/^the median's 95 % interval is unbounded/);
    expect(intervalLine('rate', 'share', null)).toBe('no interval (no determinate sample)');
  });
  it('n against the floor; a series cell for every period — no history and not computed are said, an indeterminate period keeps its n', () => {
    expect(sampleLine(6, 8, 5)).toBe('n 6 · floor 8 — BELOW the floor · k ≥ 5');
    expect(sampleLine(null, 3, 5)).toBe('n not measured · floor 3 · k ≥ 5');
    expect(periodCell({ period: '2025-Q4', window_from: '', window_to: '', status: 'no_history', state: 'indeterminate', value: null, n: null, reasons: ['no history: the deployment holds no records before 2026-04-10 (x)'] }))
      .toBe('NO HISTORY — no history: the deployment holds no records before 2026-04-10 (x)');
    expect(periodCell({ period: '2026-Q2', window_from: '', window_to: '', status: 'not_computed', state: null, value: null, n: null, reasons: [], previews: 1 })).toBe('NOT COMPUTED (1 preview(s) never shown as the value)');
    expect(periodCell({ period: '2026-Q2', window_from: '', window_to: '', status: 'computed', state: 'indeterminate', value: null, n: 2, reasons: ['n = 2 …'] })).toBe('INDETERMINATE (n 2)');
    expect(periodCell({ period: '2026-Q3', window_from: '', window_to: '', status: 'computed', state: 'determinate', value: 0.8, kind: 'rate', unit: 'share', n: 5, reasons: [] })).toBe('80.0 %');
  });
  it('the follow-through, the threshold, the window, the population and what still needs a decision', () => {
    expect(followLine({ kind: 'no_action', action: null, owner_name: null, due_on: null, reason: 'on target' })).toBe('NO ACTION — on target');
    expect(followLine({ kind: 'action', action: 'Extend the outcome ledger', owner_name: 'L. Brandt', due_on: '2026-12-10', reason: 'thin evidence' })).toBe('ACTION: Extend the outcome ledger — owner L. Brandt, due 2026-12-10 — thin evidence');
    expect(thresholdLine({ band: [0.75, 0.85] }, 'rate', 'share', 'band')).toBe('approved band 75.0 % – 85.0 %');
    expect(thresholdLine({ target: 7200 }, 'duration', 'seconds', 'lower')).toBe('target ≤ 2.0 h (7200 s)');
    expect(thresholdLine({}, 'rate', 'share', 'higher')).toBe('none declared');
    expect(windowLine('2026-07-01T00:00:00+00:00', '2026-10-01T00:00:00+00:00')).toBe('[2026-07-01, 2026-10-01) UTC');
    expect(populationLine({ subject: 'decision package', inclusion: 'committed in the window' })).toBe('subject: decision package · inclusion: committed in the window');
    expect(openFollowthrough(['MET-001', 'MET-022', 'MET-024'], [{ metric_key: 'MET-001' }, { metric_key: null }])).toEqual(['MET-022', 'MET-024']);
  });
  it('a DATE is the day it names', () => {
    expect(dayOf('2026-12-10')).toBe('2026-12-10');
    expect(dayOf('2026-12-10T23:30:00-05:00')).toBe('2026-12-10');
    expect(dayOf(null)).toBe('—');
  });
});
