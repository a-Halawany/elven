/**
 * CP-6 B29 §D (0092) — the constraint evaluator's pure logic (twin/constraints/evaluator.ts): validation and normalisation, the three
 * kinds, units, the outcome rule (nothing checked is never satisfied; a missing input or an exhausted budget is indeterminate) and the
 * frozen verdict. The database, the routes and the gate are the integration harness's (test/int/phase6-constraints-b29.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { evaluate, fmt, toVerdict, validateConstraints, type SetVersion } from '../../src/twin/constraints/evaluator.js';
import type { ConstraintSubject } from '../../src/twin/methods/types.js';

const DIGEST = 'a'.repeat(64);
function set(raw: unknown[], key = 'regensburg-capacity', version = 1): SetVersion {
  const v = validateConstraints(raw);
  expect(v.problems).toEqual([]);
  return { setId: '0199a000-0000-7000-8000-00000000000' + String(version), setKey: key, version, digest: DIGEST, constraints: v.constraints };
}
const CAPACITY = { key: 'regensburg-pallets', kind: 'business_rule', title: 'Regensburg warehouse capacity', quantity: 'warehouse:regensburg.pallets', op: '<=', value: 1800, unit: 'pallets' };
const plan = (days: Array<[string, number, string | null]>, extra: Partial<ConstraintSubject> = {}): ConstraintSubject =>
  ({ kind: 'plan', ref: 'replenishment-w42', quantities: days.map(([date, value, unit]) => ({ key: 'warehouse:regensburg.pallets', date, value, unit })), ...extra });

describe('B29 §D · validation', () => {
  it('normalises a declaration to known fields in a fixed shape (the digest is the declaration\'s)', () => {
    const v = validateConstraints([{ ...CAPACITY, stray: 'dropped' }]);
    expect(v.problems).toEqual([]);
    expect(v.constraints).toEqual([{ key: 'regensburg-pallets', title: 'Regensburg warehouse capacity', kind: 'business_rule', quantity: 'warehouse:regensburg.pallets', op: '<=', value: 1800, unit: 'pallets', per: 'day' }]);
  });
  it('refuses what is malformed, in words', () => {
    expect(validateConstraints([]).problems[0]).toMatch(/1–200/);
    expect(validateConstraints([{ ...CAPACITY }, { ...CAPACITY }]).problems[0]).toMatch(/declared twice/);
    expect(validateConstraints([{ ...CAPACITY, op: '<' }]).problems[0]).toMatch(/op must be/);
    expect(validateConstraints([{ ...CAPACITY, op: 'between', min: 5, max: 1 }]).problems[0]).toMatch(/min ≤ max/);
    expect(validateConstraints([{ ...CAPACITY, per: 'week' }]).problems[0]).toMatch(/per must be "day"/);
    expect(validateConstraints([{ key: 'k1', kind: 'conservation', unit: 'units' }]).problems[0]).toMatch(/tolerance/);
    expect(validateConstraints([{ key: 'k1', kind: 'conservation', unit: 'units', tolerance: 0 }]).problems[0]).toMatch(/stocks/);
    expect(validateConstraints([{ key: 'k1', kind: 'topology', sources: {}, targets: { prefix: 'demand:' } }]).problems[0]).toMatch(/sources must be/);
    expect(validateConstraints([{ key: 'k1', kind: 'capacity' }]).problems[0]).toMatch(/kind must be/);
    expect(validateConstraints([{ ...CAPACITY, applies_to: ['forecast'] }]).problems[0]).toMatch(/applies_to/);
  });
});

describe('B29 §D · business rules (a bound per day, in the rule\'s unit)', () => {
  it('positive: a replenishment plan within the warehouse capacity is satisfied', () => {
    const e = evaluate(plan([['2026-10-13', 1650, 'pallets'], ['2026-10-14', 1800, 'pallets']]), [set([CAPACITY])], { budgetMs: 1000 });
    expect(e.outcome).toBe('satisfied');
    expect(e.evaluated).toBe(1);
    expect(e.pins).toEqual([{ set_id: expect.any(String), set_key: 'regensburg-capacity', version: 1, digest: DIGEST }]);
  });
  it('refusal: a day over capacity names the constraint, its bound and the day; entries of one day are summed', () => {
    const e = evaluate(plan([['2026-10-13', 1650, 'pallets'], ['2026-10-14', 1500, 'pallets'], ['2026-10-14', 850, 'pallets']]), [set([CAPACITY])], { budgetMs: 1000 });
    expect(e.outcome).toBe('violated');
    expect(e.violations).toEqual([{ constraintKey: 'regensburg-pallets', kind: 'business_rule', bound: '≤ 1800 pallets per day', observed: '2350 pallets on 2026-10-14',
      message: 'Regensburg warehouse capacity: warehouse:regensburg.pallets exceeds the bound by 550 pallets on 2026-10-14', setKey: 'regensburg-capacity', setVersion: 1 }]);
    const v = toVerdict(e);
    expect(v).toMatchObject({ outcome: 'violated', setVersion: 1, violations: [{ message: expect.stringMatching(/^\[regensburg-capacity v1\] /) }] });
    expect(v.indeterminateReason).toBeUndefined();
  });
  it('refusal: a stated unit that is not the rule\'s is a violation, never a conversion; an unstated unit is read in the rule\'s', () => {
    const e = evaluate(plan([['2026-10-13', 30, 't'], ['2026-10-14', 900, null]]), [set([CAPACITY])], { budgetMs: 1000 });
    expect(e.outcome).toBe('violated');
    expect(e.violations).toHaveLength(1);
    expect(e.violations[0]).toMatchObject({ bound: 'unit pallets', observed: '30 t on 2026-10-13' });
  });
  it('>= and between; a missing quantity or an undated one is indeterminate (a missing input)', () => {
    const floor = set([{ ...CAPACITY, key: 'floor', op: '>=', value: 100 }, { ...CAPACITY, key: 'band', op: 'between', min: 100, max: 2000 }]);
    expect(evaluate(plan([['2026-10-13', 50, 'pallets']]), [floor], { budgetMs: 1000 }).violations.map((v) => [v.constraintKey, v.bound])).toEqual([
      ['floor', '≥ 100 pallets per day'], ['band', 'between 100 and 2000 pallets per day']]);
    const none = evaluate({ kind: 'plan', ref: 'p', quantities: [{ key: 'other', date: '2026-10-13', value: 1, unit: 'pallets' }] }, [set([CAPACITY])], { budgetMs: 1000 });
    expect(none.outcome).toBe('indeterminate');
    expect(toVerdict(none).indeterminateReason).toMatch(/has no quantity warehouse:regensburg.pallets/);
    expect(evaluate(plan([[null as unknown as string, 5, 'pallets']]), [set([CAPACITY])], { budgetMs: 1000 }).outcome).toBe('indeterminate');
  });
});

describe('B29 §D · conservation', () => {
  const RULE = { key: 'bearings-balance', kind: 'conservation', stock_prefix: 'stock:', tolerance: 0.5, unit: 'units' };
  const bal = (stock: string, date: string | null, o: number, i: number, out: number, c: number) =>
    (['opening', 'inflow', 'outflow', 'closing'] as const).map((f, n) => ({ key: `${stock}.${f}`, date, value: [o, i, out, c][n] as number, unit: null }));
  it('positive: a balanced run output (the §C balance keys, units unstated) is satisfied; one day carries to the next', () => {
    const s: ConstraintSubject = { kind: 'run_output', ref: 'run-1', quantities: [...bal('stock:bearings', '2026-10-01', 100, 40, 60, 80), ...bal('stock:bearings', '2026-10-02', 80, 0, 30, 50), ...bal('stock:housings', null, 10, 5, 5, 10)] };
    expect(evaluate(s, [set([RULE], 'flows')], { budgetMs: 1000 }).outcome).toBe('satisfied');
  });
  it('refusal: a break, a negative stock and a broken carry are each named', () => {
    const s: ConstraintSubject = { kind: 'run_output', ref: 'run-2', quantities: [...bal('stock:bearings', '2026-10-01', 100, 40, 60, 70), ...bal('stock:bearings', '2026-10-02', 90, 0, 130, -40)] };
    const e = evaluate(s, [set([RULE], 'flows')], { budgetMs: 1000 });
    expect(e.outcome).toBe('violated');
    expect(e.violations.map((v) => v.bound)).toEqual(['opening + inflow − outflow = closing ± 0.5 units', '≥ 0 units', 'opening = the prior day\'s closing ± 0.5 units']);
    expect(e.violations[0]?.observed).toBe('100 + 40 − 60 = 80, closing 70 units on 2026-10-01');
  });
  it('a missing flow is indeterminate; a named stock the subject lacks is indeterminate', () => {
    const s: ConstraintSubject = { kind: 'run_output', ref: 'run-3', quantities: bal('stock:bearings', null, 1, 1, 1, 1).slice(0, 3) };
    expect(toVerdict(evaluate(s, [set([RULE], 'flows')], { budgetMs: 1000 })).indeterminateReason).toMatch(/lacks stock:bearings.closing/);
    expect(evaluate(s, [set([{ ...RULE, stock_prefix: undefined, stocks: ['stock:other'] }], 'flows')], { budgetMs: 1000 }).outcome).toBe('indeterminate');
  });
});

describe('B29 §D · topology', () => {
  const RULE = { key: 'demand-reachable', kind: 'topology', title: 'Every demand site served', sources: { prefix: 'supply:' }, targets: { prefix: 'demand:' }, avoid: ['site:hamburg-old'] };
  const edges = (pairs: Array<[string, string]>) => pairs.map(([from, to]) => ({ from, to, kind: 'route' }));
  const net = (pairs: Array<[string, string]>): ConstraintSubject => ({ kind: 'plan', ref: 'network', quantities: [], edges: edges(pairs) });
  it('positive: a connected network is satisfied', () => {
    const e = evaluate(net([['supply:ningbo', 'port:hamburg'], ['port:hamburg', 'warehouse:regensburg'], ['warehouse:regensburg', 'demand:munich'], ['warehouse:regensburg', 'demand:vienna']]), [set([RULE], 'network')], { budgetMs: 1000 });
    expect(e.outcome).toBe('satisfied');
  });
  it('refusal: an unreachable demand site; a route through a retired site; a missing required edge', () => {
    const e = evaluate(net([['supply:ningbo', 'site:hamburg-old'], ['site:hamburg-old', 'demand:munich'], ['supply:ningbo', 'port:rotterdam'], ['port:rotterdam', 'warehouse:regensburg'], ['x:island', 'demand:vienna']]),
      [set([{ ...RULE, required_edges: [{ from: 'warehouse:regensburg', to: 'demand:vienna' }] }], 'network')], { budgetMs: 1000 });
    expect(e.outcome).toBe('violated');
    expect(e.violations.map((v) => [v.bound, v.observed])).toEqual([
      ['no route through site:hamburg-old (retired)', 'edge supply:ningbo → site:hamburg-old (route)'],
      ['no route through site:hamburg-old (retired)', 'edge site:hamburg-old → demand:munich (route)'],
      ['edge warehouse:regensburg → demand:vienna present', 'absent'],
      ['reachable from supply:ningbo', 'demand:munich: no route'],
      ['reachable from supply:ningbo', 'demand:vienna: no route'],
    ]);
  });
  it('no edges, or a prefix that selects no site, is indeterminate; an explicit target absent from the network is unreachable', () => {
    expect(evaluate({ kind: 'plan', ref: 'p', quantities: [] }, [set([RULE], 'network')], { budgetMs: 1000 }).outcome).toBe('indeterminate');
    const e = evaluate(net([['supply:a', 'demand:b']]), [set([{ ...RULE, targets: { nodes: ['demand:b', 'demand:ghost'] } }], 'network')], { budgetMs: 1000 });
    expect(e.violations.map((v) => v.observed)).toEqual(['demand:ghost: not in the network']);
  });
});

describe('B29 §D · the outcome rule', () => {
  it('nothing applicable: named sets checked nothing (indeterminate); a domain that declares nothing for the subject is VACUOUSLY satisfied', () => {
    expect(evaluate(plan([['2026-10-13', 1, 'pallets']]), [], { budgetMs: 1000 })).toMatchObject({ outcome: 'indeterminate', vacuous: false, indeterminate: ['no live constraint set applies — nothing was checked'] });
    const onlyRuns = set([{ ...CAPACITY, applies_to: ['run_output'] }]);
    expect(evaluate(plan([['2026-10-13', 99999, 'pallets']]), [onlyRuns], { budgetMs: 1000 }).outcome).toBe('indeterminate');
    expect(evaluate(plan([['2026-10-13', 1, 'pallets']]), [], { budgetMs: 1000, vacuousWhenUndeclared: true })).toMatchObject({ outcome: 'satisfied', vacuous: true, evaluated: 0 });
    const v = evaluate(plan([['2026-10-13', 99999, 'pallets']]), [onlyRuns], { budgetMs: 1000, vacuousWhenUndeclared: true });
    expect(v).toMatchObject({ outcome: 'satisfied', vacuous: true });
    expect(toVerdict({ ...v, pins: [] })).toMatchObject({ outcome: 'satisfied', setId: null, setVersion: null });
    // a missing input is never vacuous
    expect(evaluate({ kind: 'plan', ref: 'p', quantities: [] }, [set([CAPACITY])], { budgetMs: 1000, vacuousWhenUndeclared: true })).toMatchObject({ outcome: 'indeterminate', vacuous: false });
  });
  it('an evaluation over its time budget is indeterminate, never a pass; a violation already found still stands', () => {
    const zero = evaluate(plan([['2026-10-13', 1, 'pallets']]), [set([CAPACITY])], { budgetMs: 0 });
    expect(zero).toMatchObject({ outcome: 'indeterminate', evaluated: 0 });
    expect(zero.indeterminate[0]).toMatch(/exceeded its time budget of 0 ms after 0 of 1 constraints/);
    let t = 0;
    const clock = () => (t += 10);
    const two = set([CAPACITY, { ...CAPACITY, key: 'floor', op: '>=', value: 5000 }]);
    const partial = evaluate(plan([['2026-10-13', 1900, 'pallets']]), [two], { budgetMs: 15, now: clock });
    expect(partial.outcome).toBe('violated');
    expect(partial.violations.map((v) => v.constraintKey)).toEqual(['regensburg-pallets']);
    expect(partial.indeterminate[0]).toMatch(/after 1 of 2/);
  });
  it('the verdict names the first violated set; a single satisfied set is named; several are not', () => {
    const a = set([CAPACITY], 'a-set', 1), b = set([{ ...CAPACITY, key: 'tight', value: 10 }], 'b-set', 2);
    expect(toVerdict(evaluate(plan([['2026-10-13', 100, 'pallets']]), [a, b], { budgetMs: 1000 }))).toMatchObject({ outcome: 'violated', setId: b.setId, setVersion: 2 });
    expect(toVerdict(evaluate(plan([['2026-10-13', 1, 'pallets']]), [a], { budgetMs: 1000 }))).toMatchObject({ outcome: 'satisfied', setId: a.setId, setVersion: 1 });
    expect(toVerdict(evaluate(plan([['2026-10-13', 1, 'pallets']]), [a, { ...a, setKey: 'c-set' }], { budgetMs: 1000 }))).toMatchObject({ setId: null, setVersion: null });
  });
  it('numbers read as a person writes them', () => {
    expect([fmt(1800), fmt(0.1 + 0.2), fmt(-40), fmt(2.5)]).toEqual(['1800', '0.3', '-40', '2.5']);
  });
});
