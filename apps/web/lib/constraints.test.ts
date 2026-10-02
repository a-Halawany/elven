import { describe, expect, it } from 'vitest';
import { CAPACITY_TEMPLATE, appliesLine, constraintLine, dailyTotals, outcomeLine, parseConstraints, parsePlan, pinsLine } from './constraints';

describe('B29 §D constraint engine client helpers', () => {
  it('says each kind of constraint in one line', () => {
    expect(constraintLine(CAPACITY_TEMPLATE[0]!)).toBe('Regensburg warehouse capacity: warehouse:regensburg.pallets ≤ 1800 pallets per day');
    expect(constraintLine({ key: 'b', kind: 'business_rule', quantity: 'q', op: 'between', min: 1, max: 5, unit: 'u' })).toBe('b: q between 1 and 5 u per day');
    expect(constraintLine({ key: 'c', kind: 'conservation', stock_prefix: 'stock:', tolerance: 0.5, unit: 'units' })).toBe('c: every stock under stock: — opening + inflow − outflow = closing ± 0.5 units, never negative');
    expect(constraintLine({ key: 't', kind: 'topology', sources: { prefix: 'supply:' }, targets: { nodes: ['demand:munich'] }, avoid: ['site:old'] }))
      .toBe('t: demand:munich reachable from every site under supply:, never through site:old');
    expect(appliesLine(CAPACITY_TEMPLATE[0]!)).toBe('plans');
    expect(appliesLine({ key: 'x', kind: 'topology' })).toBe("plans · runs' inputs · runs' outputs");
  });
  it('reads a plan per day with its units, and says what is wrong', () => {
    const r = parsePlan('# week 42\n2026-10-12, 1650\n2026-10-14, 2350\nwarehouse:linz.pallets, 2026-10-14, 10, pallets', { key: 'warehouse:regensburg.pallets', unit: 'pallets' });
    expect(r).toEqual({ ok: true, quantities: [
      { key: 'warehouse:regensburg.pallets', date: '2026-10-12', value: 1650, unit: 'pallets' }, { key: 'warehouse:regensburg.pallets', date: '2026-10-14', value: 2350, unit: 'pallets' },
      { key: 'warehouse:linz.pallets', date: '2026-10-14', value: 10, unit: 'pallets' }] });
    expect(parsePlan('', { key: 'k', unit: 'u' })).toEqual({ ok: false, problem: 'the plan has no quantities' });
    expect(parsePlan('14.10.2026, 5', { key: 'k', unit: 'u' })).toMatchObject({ ok: false, problem: expect.stringMatching(/not a day/) });
    expect(parsePlan('2026-10-14, many', { key: 'k', unit: 'u' })).toMatchObject({ ok: false, problem: expect.stringMatching(/not a number/) });
    expect(parsePlan('2026-10-14, 5', { key: 'k', unit: '' })).toMatchObject({ ok: false, problem: expect.stringMatching(/states its units/) });
    expect(parsePlan('a, b, c', { key: 'k', unit: 'u' })).toMatchObject({ ok: false, problem: expect.stringMatching(/write "date, value"/) });
    expect(dailyTotals([{ key: 'k', date: '2026-10-14', value: 1500, unit: 'u' }, { key: 'k', date: '2026-10-12', value: 1, unit: 'u' }, { key: 'k', date: '2026-10-14', value: 850, unit: 'u' }, { key: 'o', date: '2026-10-14', value: 9, unit: 'u' }], 'k'))
      .toEqual([['2026-10-12', 1], ['2026-10-14', 2350]]);
  });
  it('shows the verdict as the server gave it — indeterminate never as a pass', () => {
    expect(outcomeLine({ outcome: 'satisfied', violations: [] }).glyph).toBe('✓');
    expect(outcomeLine({ outcome: 'violated', violations: [{ constraintKey: 'regensburg-pallets', kind: 'business_rule', bound: '≤ 1800 pallets per day', observed: '2350 pallets on 2026-10-14', message: 'm' }] }).text)
      .toBe('REFUSED — 1 violation: regensburg-pallets (bound ≤ 1800 pallets per day, observed 2350 pallets on 2026-10-14)');
    expect(outcomeLine({ outcome: 'indeterminate', violations: [], indeterminate_reason: 'the evaluation exceeded its time budget' }).text).toBe('INDETERMINATE — not a pass: the evaluation exceeded its time budget');
    expect(pinsLine([{ set_id: 'x', set_key: 'regensburg-capacity', version: 2, digest: 'd' }])).toBe('regensburg-capacity v2');
    expect(pinsLine([])).toBe('no set declared — nothing to check');
  });
  it('reads the constraints editor and refuses what is not a list of keyed constraints', () => {
    expect(parseConstraints(JSON.stringify(CAPACITY_TEMPLATE))).toEqual({ ok: true, value: CAPACITY_TEMPLATE });
    expect(parseConstraints('{')).toMatchObject({ ok: false });
    expect(parseConstraints('[]')).toMatchObject({ ok: false, problem: expect.stringMatching(/non-empty/) });
    expect(parseConstraints('[{"key":"a"}]')).toMatchObject({ ok: false, problem: expect.stringMatching(/key and a kind/) });
  });
});
