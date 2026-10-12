/**
 * B92 §CO (0113 §CO) — the PURE logic of comparability: Wilson's interval, Newcombe's interval of a difference of proportions, the claims a
 * rate or a duration comparison may make, the class of a standing-evaluation reason and where it routes, the reconciliation outcome, and the
 * route's validation of a comparison side (never a person cohort). The database decides; these mirror its rules (the harness cross-checks).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { medianClaim, newcombe, rateClaim, reasonClass, reconciliationOutcome, routedClass, wilson } from '../../src/analytics/comparability/stats.js';
import { parseSide } from '../../src/analytics/comparability/comparability.controller.js';

describe('B92 §CO · uncertainty (D6): Wilson and Newcombe', () => {
  it('Wilson\'s 95 % interval: the database\'s values; none for n = 0 or k outside [0, n] (never an invented interval)', () => {
    expect(wilson(6, 8)).toEqual({ lo: 0.409275, hi: 0.928521 });   // the database's analytics.wilson(6, 8), to the digit
    expect(wilson(0, 10)!.lo).toBe(0);
    expect(wilson(10, 10)!.hi).toBe(1);
    expect(wilson(1, 0)).toBeNull();
    expect(wilson(5, 4)).toBeNull();
  });
  it('Newcombe\'s hybrid score interval (method 10): Newcombe 1998 table II example 56/70 − 48/80 = 0.2, interval 0.0524 to 0.3339', () => {
    const d = newcombe(56, 70, 48, 80)!;
    expect(d.estimate).toBeCloseTo(0.2, 6);
    expect(d.lo).toBeCloseTo(0.0524, 3);
    expect(d.hi).toBeCloseTo(0.3339, 3);
    expect(rateClaim(d)).toBe('a_higher');
    expect(rateClaim(newcombe(48, 80, 56, 70)!)).toBe('a_lower');
    expect(rateClaim(newcombe(5, 10, 6, 10)!)).toBe('no_difference_shown');
    expect(newcombe(1, 0, 1, 2)).toBeNull();
  });
  it('a duration comparison claims a direction only when the medians\' intervals do not overlap; none when an interval is unbounded (n < 6)', () => {
    expect(medianClaim({ lo: 60, hi: 600 }, { lo: 2070, hi: 2700 })).toBe('a_lower');
    expect(medianClaim({ lo: 2070, hi: 2700 }, { lo: 60, hi: 600 })).toBe('a_higher');
    expect(medianClaim({ lo: 60, hi: 600 }, { lo: 500, hi: 900 })).toBe('no_claim_overlap');
    expect(medianClaim({ lo: null, hi: null }, { lo: 1, hi: 2 })).toBe('no_claim_unbounded');
  });
});

describe('B92 §CO · the standing evaluation\'s vocabulary and the reconciliation outcome', () => {
  it('a reason\'s class is its prefix; privacy routes to analytics.privacy, every other class to analytics.metric; a reason of another origin has no class', () => {
    expect(reasonClass('stale: the population\'s newest record …')).toBe('stale');
    expect(reasonClass('outcome-detached: the objective(s) …')).toBe('outcome-detached');
    expect(reasonClass('n = 2 is below the floor 3 the definition declares')).toBeNull();
    expect(routedClass('privacy')).toBe('analytics.privacy');
    expect(routedClass('gamed')).toBe('analytics.metric');
  });
  it('a reconciliation is never a silent pass: no unit is `empty`; any discrepant unit wins, then any unpriced', () => {
    expect(reconciliationOutcome([])).toBe('empty');
    expect(reconciliationOutcome(['matched', 'matched'])).toBe('matched');
    expect(reconciliationOutcome(['matched', 'unpriced'])).toBe('unpriced');
    expect(reconciliationOutcome(['unpriced', 'discrepant', 'matched'])).toBe('discrepant');
  });
});

describe('B92 §CO · the route\'s side validation (the caller\'s own request)', () => {
  const status = (f: () => unknown): [number, string] => {
    try { f(); return [0, '']; } catch (e) { const h = e as HttpException; return [h.getStatus(), String((h.getResponse() as { message?: string }).message)]; }
  };
  it('a result id, or a period with a scope, a cohort or a cohort object', () => {
    expect(parseSide({ resultId: '01a12d68-5578-7f17-9a49-e630030d12ba' }, 'a', 'c')).toEqual({ resultId: '01a12d68-5578-7f17-9a49-e630030d12ba' });
    expect(parseSide({ period: '2026-Q3', scopeKey: 'red-sea-corridor', cohort: { severity: 'high' } }, 'a', 'c'))
      .toEqual({ period: '2026-Q3', scopeKey: 'red-sea-corridor', cohort: { severity: 'high' }, cohortObjectId: null, asOf: null });
  });
  it('refused: a person-grained cohort (403), a bad period (422), a cohort AND a cohort object (422), a malformed id (422)', () => {
    expect(status(() => parseSide({ period: '2026-Q3', cohort: { acknowledged_by: 'x' } }, 'a', 'c'))).toEqual([403, expect.stringMatching(/^cohort comparison rejected \(person\)/)]);
    expect(status(() => parseSide({ period: '2026-Q5' }, 'b', 'c'))).toEqual([422, expect.stringMatching(/^cohort comparison rejected \(period\)/)]);
    expect(status(() => parseSide({ period: '2026-Q3', cohort: { severity: 'high' }, cohortObjectId: '01a12d68-5578-7f17-9a49-e630030d12ba' }, 'a', 'c'))[0]).toBe(422);
    expect(status(() => parseSide({ resultId: 'nope' }, 'a', 'c'))).toEqual([422, expect.stringMatching(/^cohort comparison rejected \(request\)/)]);
  });
});
