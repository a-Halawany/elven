import { describe, expect, it } from 'vitest';
import { CHANGE_MARK, comparisonView, diffCounts, diffRecords, emptyStatement, fmtNumber, metricText, quantile, summarize } from './inspection-b80';

/** CP-6 B80 §CL-D (CMP-051…056, PAT-28): inspection words what it is given and infers nothing. SYNTHETIC. */
describe('Metric: value, basis, time and uncertainty; unknown is UNKNOWN', () => {
  it('a measured value with its interval, basis and time; Intl formatting for the locale', () => {
    const m = metricText({ label: 'Transit delay', value: 1234.5, unit: 'h', state: 'measured', basis: 'IMF PortWatch daily transits', asOf: '2026-10-16', uncertainty: { low: 1100, high: 1400, level: '80 %' }, digits: 1 });
    expect(m.value).toBe('1,234.5'); expect(m.uncertainty).toBe('1,100.0 – 1,400.0 (80 %)'); expect(m.state).toBe('MEASURED');
    expect(m.ariaLabel).toBe('Transit delay: 1,234.5 h, measured, IMF PortWatch daily transits, as of 2026-10-16, 1,100.0 – 1,400.0 (80 %)');
    expect(fmtNumber(1234.5, 'de', 1)).toBe('1.234,5');
  });
  it('null or a non-finite value never renders as 0; missing basis/time/uncertainty are stated', () => {
    const m = metricText({ label: 'Delay', value: null, state: 'measured', basis: null, asOf: null });
    expect(m.value).toBe('UNKNOWN'); expect(m.basis).toBe('basis not stated'); expect(m.asOf).toBe('time not stated'); expect(m.uncertainty).toBe('uncertainty not stated');
    expect(metricText({ label: 'x', value: Number.NaN, state: 'estimated', basis: 'b', asOf: 't' }).value).toBe('UNKNOWN');
    expect(metricText({ label: 'x', value: 5, state: 'withheld', basis: 'b', asOf: 't' }).value).toBe('WITHHELD');
    expect(metricText({ label: 'x', value: 0, state: 'measured', basis: 'b', asOf: 't', uncertainty: { text: 'not assessed' } })).toMatchObject({ value: '0', uncertainty: 'not assessed' });
  });
});

describe('StatisticalSummary: n stated, missing counted, nothing computed beyond what n supports', () => {
  it('the five numbers, mean and sd', () => {
    const s = summarize([4, 1, null, 3, 2, undefined, 5]);
    expect(s).toMatchObject({ n: 5, missing: 2, min: 1, q1: 2, median: 3, mean: 3, q3: 4, max: 5 });
    expect(s.sd).toBeCloseTo(1.5811, 3);
    expect(s.notes).toEqual(['2 value(s) missing — counted, not imputed']);
  });
  it('n < 4: no quartiles; n < 2: no spread; n = 0: nothing, said so', () => {
    expect(summarize([7, 9])).toMatchObject({ n: 2, q1: null, q3: null, median: 8, notes: ['quartiles not computed (n < 4)'] });
    expect(summarize([7]).notes).toEqual(['spread not computed (n < 2)', 'quartiles not computed (n < 4)']);
    expect(summarize([null])).toMatchObject({ n: 0, missing: 1, median: null, notes: ['1 value(s) missing — counted, not imputed', 'no value to summarise'] });
    expect(Number.isNaN(quantile([], 0.5))).toBe(true);
  });
});

describe('ComparisonMatrix: a common basis or no ranking; not assessed is said; dissent shown', () => {
  const options = [{ id: 'reroute' }, { id: 'hold' }, { id: 'air' }];
  it('a best cell only on a common basis with a declared direction; a tie marks none', () => {
    const v = comparisonView(options, [
      { key: 'cost', label: 'Cost', better: 'lower' },
      { key: 'days', label: 'Delay', better: 'lower' },
      { key: 'risk', label: 'Risk' },
      { key: 'tie', label: 'Tie', better: 'higher' },
    ], {
      reroute: { cost: { value: 1.2, basis: 'Q1 plan', unit: 'M EUR', uncertainty: '±0.2' }, days: { value: 14, basis: 'carrier', unit: 'd' }, risk: { value: 'medium', basis: 'b' }, tie: { value: 1, basis: 'b' } },
      hold: { cost: { value: 0.4, basis: 'Q1 plan', unit: 'M EUR', dissent: 'L. Brandt: understates line stoppage (SYNTHETIC)' }, days: { value: 30, basis: 'insurer', unit: 'd' }, tie: { value: 1, basis: 'b' } },
      air: { cost: { value: 3.1, basis: 'Q1 plan', unit: 'M EUR' }, tie: { value: 0, basis: 'b' } },
    });
    const [cost, days, risk, tie] = v.rows;
    expect(cost!.common).toBe(true); expect(cost!.basisNote).toBe('common basis: Q1 plan');
    expect(cost!.cells['hold']).toEqual({ text: '0.4 M EUR', uncertainty: 'uncertainty not stated', dissent: 'L. Brandt: understates line stoppage (SYNTHETIC)', best: true, assessed: true });
    expect(cost!.cells['reroute']!.best).toBe(false);
    expect(days!.common).toBe(false); expect(days!.basisNote).toMatch(/^NOT ON A COMMON BASIS/);
    expect(Object.values(days!.cells).some((c) => c.best)).toBe(false);
    expect(days!.cells['air']).toMatchObject({ text: 'not assessed', assessed: false });
    expect(Object.values(risk!.cells).some((c) => c.best)).toBe(false);
    expect(Object.values(tie!.cells).some((c) => c.best)).toBe(false);
  });
});

describe('DiffViewer: aligned field by field; canonical equality', () => {
  it('declared fields first in order, then the rest sorted; added / removed / changed / unchanged', () => {
    const rows = diffRecords(
      { title: 'Reroute via Cape', owner: 'L. Brandt', cost: { amount: 1.2, unit: 'M EUR' }, note: 'x' },
      { title: 'Reroute via Cape of Good Hope', owner: 'L. Brandt', cost: { unit: 'M EUR', amount: 1.2 }, added: true },
      [{ key: 'title', label: 'Title' }, { key: 'owner', label: 'Owner' }],
    );
    expect(rows.map((r) => [r.key, r.kind])).toEqual([['title', 'changed'], ['owner', 'unchanged'], ['added', 'added'], ['cost', 'unchanged'], ['note', 'removed']]);
    expect(rows[2]).toEqual({ key: 'added', label: 'added', before: '—', after: 'true', kind: 'added' });
    expect(diffCounts(rows)).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 2 });
    expect(CHANGE_MARK.changed).toEqual({ glyph: '±', word: 'CHANGED' });
    expect(diffRecords(null, null, [{ key: 'a', label: 'A' }])[0]!.kind).toBe('unchanged');
  });
});

describe('the empty state never implies a zero world (PAT-28)', () => {
  it('scope, evidence status, permission and a safe next step', () => {
    expect(emptyStatement({ scope: 'Red Sea sources in Supply Corridor Intelligence', evidence: 'filtered_out', hiddenByFilter: 6, permission: 'partial', nextStep: 'clear the filter' })).toEqual([
      'Scope: Red Sea sources in Supply Corridor Intelligence.', 'Records exist but the current filter hides 6 of them.',
      'Some records in this scope may be outside what you are authorized to see.', 'Next: clear the filter',
    ]);
    expect(emptyStatement({ scope: 's', evidence: 'unknown', permission: 'none', nextStep: null })).toEqual(['Scope: s.', 'Whether records exist is UNKNOWN — the read did not complete.', 'You are not authorized to see records in this scope.', 'No action is available here.']);
    expect(emptyStatement({ scope: 's', evidence: 'not_collected', permission: 'full', nextStep: 'run a collection' })[1]).toMatch(/absence of records is not absence of events/);
  });
});
