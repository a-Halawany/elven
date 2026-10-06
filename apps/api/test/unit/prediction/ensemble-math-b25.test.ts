/**
 * B25 §EN (0108) — the ensemble's arithmetic at the function boundary: the combination rules (linear_pool@1 — the mixture of the members'
 * piecewise-linear CDFs, solved by bisection; quantile_average@1 — Vincentisation), the weighting (equal | skill, the skill fall-back
 * SAID), the disagreement measure (disagreement@1 — the port's prediction.ensemble_divergence line for line; the harness compares the two
 * on the issued members), the PER-07 precision check, and the naming of the assumptions that split two members. No database.
 */
import { describe, expect, it } from 'vitest';
import {
  ENSEMBLE_RULES, combine, combinePaths, divergence, legacyMethodOf, mixtureQuantile, pieceCdf, precisionBreaches, splittingAssumptions, weightsFor,
} from '../../../src/prediction/ensembles/ensemble-math.js';
import { validateEnsembleRequest, validateOverlay } from '../../../src/prediction/ensembles/ensembles.service.js';
import { HttpException } from '@nestjs/common';

const A = { q10: 20, q50: 27, q90: 33 };   // a member that reads the disrupted week forward (SYNTHETIC figures)
const B = { q10: 55, q50: 64, q90: 72 };   // a member that reads the level and trend forward
const near = (x: number, y: number, eps = 1e-6) => expect(Math.abs(x - y)).toBeLessThan(eps);

describe('the piecewise-linear CDF (linear_pool@1\'s reading of a member)', () => {
  it('passes through the 10/50/90 quantiles with 10% tails over a quarter of the inner span', () => {
    const F = pieceCdf(A);
    near(F(20), 0.1); near(F(27), 0.5); near(F(33), 0.9);
    near(F(20 - 0.25 * 7), 0); near(F(33 + 0.25 * 6), 1);
    near(F(23.5), 0.3);           // halfway between q10 and q50
    expect(F(-1e9)).toBe(0); expect(F(1e9)).toBe(1);
  });
  it('is monotone, and a point distribution is a step', () => {
    const F = pieceCdf(A); let prev = -1;
    for (let x = 15; x <= 36; x += 0.25) { const f = F(x); expect(f).toBeGreaterThanOrEqual(prev); prev = f; }
    const P = pieceCdf({ q10: 5, q50: 5, q90: 5 });
    expect(P(4.999)).toBe(0); expect(P(5)).toBe(1);
  });
});

describe('the combinations', () => {
  it('a single member pooled with itself is itself (both rules)', () => {
    for (const rule of ['linear_pool@1', 'quantile_average@1'] as const) {
      const c = combine(rule, [A, A], [0.5, 0.5]);
      near(c.q10, 20, 1e-6); near(c.q50, 27, 1e-6); near(c.q90, 33, 1e-6);
    }
  });
  it('quantile_average@1 averages the quantiles with the weights', () => {
    const c = combine('quantile_average@1', [A, B], [0.5, 0.5]);
    expect(c).toEqual({ q10: 37.5, q50: 45.5, q90: 52.5 });
    const w = combine('quantile_average@1', [A, B], [0.75, 0.25]);
    near(w.q50, 0.75 * 27 + 0.25 * 64);
  });
  it('linear_pool@1 mixes: two disjoint members give a band spanning both and a median between them', () => {
    const c = combine('linear_pool@1', [A, B], [0.5, 0.5]);
    // the pool's 10% quantile is the 20% quantile of A (q10 + quarter of the way to q50), its 90% the 80% quantile of B
    near(c.q10, 20 + (27 - 20) * 0.25, 1e-6);
    near(c.q90, 64 + (72 - 64) * 0.75, 1e-6);
    // F(x) = 0.5 everywhere between A's top (34.5) and B's bottom (52.75): the smallest x with F ≥ 0.5 is A's top
    near(c.q50, 33 + 0.25 * 6, 1e-6);
    expect(c.q10).toBeLessThanOrEqual(c.q50); expect(c.q50).toBeLessThanOrEqual(c.q90);
  });
  it('mixtureQuantile is the smallest x with F(x) ≥ p', () => {
    const x = mixtureQuantile([A, B], [0.5, 0.5], 0.25);
    near(x, 27, 1e-6);   // the pool's 25% is A's 50%
  });
  it('combinePaths combines step by step under the same rule', () => {
    const p = combinePaths('quantile_average@1', [[{ step: 1, ...A }, { step: 2, ...A }], [{ step: 1, ...B }, { step: 2, ...B }]], [0.5, 0.5]);
    expect(p).toHaveLength(2);
    expect(p[1]).toEqual({ step: 2, date: null, q10: 37.5, q50: 45.5, q90: 52.5 });
  });
});

describe('the weights', () => {
  it('equal: every member the same', () => {
    expect(weightsFor('equal', [null, 2]).weights).toEqual([0.5, 0.5]);
  });
  it('skill: the inverse mean pinball, normalised', () => {
    const w = weightsFor('skill', [1, 3]);
    expect(w.used).toBe('skill');
    near(w.weights[0] as number, 0.75); near(w.weights[1] as number, 0.25);
  });
  it('skill without a score for every member falls back to EQUAL and says so', () => {
    const w = weightsFor('skill', [1, null]);
    expect(w.used).toBe('equal'); expect(w.weights).toEqual([0.5, 0.5]);
    expect(w.note).toMatch(/1 of 2 have none, so EQUAL weights are used/);
  });
});

describe('disagreement@1 (the port\'s prediction.ensemble_divergence, line for line)', () => {
  it('disjoint members are MATERIAL; the driving pair is named', () => {
    const d = divergence([{ ordinal: 1, ...A }, { ordinal: 2, ...B }]);
    expect(d.level).toBe('material');
    expect(d.max_gap_ratio).toBe(2.4667);   // 37 / ((13 + 17) / 2) — the figure the psql smoke read gave
    expect(d.min_overlap).toBe(0);
    expect(d.driving_pair).toEqual({ a: 1, b: 2 });
    expect(d.pairs[0]).toEqual({ a: 1, b: 2, gap: 37, gap_ratio: 2.4667, overlap: 0, level: 'material' });
  });
  it('close members AGREE; a moderate gap is NOTABLE', () => {
    expect(divergence([{ ordinal: 1, q10: 10, q50: 20, q90: 30 }, { ordinal: 2, q10: 11, q50: 21, q90: 31 }]).level).toBe('agree');
    // gap 6, spread 20 → 0.3 (notable); overlap 14/20 = 0.7
    const n = divergence([{ ordinal: 1, q10: 10, q50: 20, q90: 30 }, { ordinal: 2, q10: 16, q50: 26, q90: 36 }]);
    expect(n.level).toBe('notable'); expect(n.max_gap_ratio).toBe(0.3); expect(n.min_overlap).toBe(0.7);
  });
  it('the worst pair is the run\'s level; zero-width members are handled', () => {
    const d = divergence([{ ordinal: 1, q10: 10, q50: 20, q90: 30 }, { ordinal: 2, q10: 11, q50: 21, q90: 31 }, { ordinal: 3, q10: 80, q50: 90, q90: 100 }]);
    expect(d.level).toBe('material'); expect(d.pairs).toHaveLength(3);
    expect(d.driving_pair).toEqual({ a: 1, b: 3 });
    const z = divergence([{ ordinal: 1, q10: 5, q50: 5, q90: 5 }, { ordinal: 2, q10: 5, q50: 5, q90: 5 }]);
    expect(z.level).toBe('agree'); expect(z.max_gap_ratio).toBe(0);
    const zc = divergence([{ ordinal: 1, q10: 5, q50: 5, q90: 5 }, { ordinal: 2, q10: 6, q50: 6, q90: 6 }]);
    expect(zc.max_gap_ratio).toBe(999); expect(zc.level).toBe('material');
  });
  it('the rules are the declared constants (the harness compares them with prediction.ensemble_rules())', () => {
    expect(ENSEMBLE_RULES['disagreement@1']).toMatchObject({ material_gap: 0.5, notable_gap: 0.25, material_overlap: 0.25, gap_cap: 999, version: 1 });
    expect(ENSEMBLE_RULES['manager@1'].min_members).toBe(2);
  });
});

describe('PER-07 — no precision beyond what the members agree on', () => {
  it('quantile averaging of disagreeing members excludes both medians: refused', () => {
    const c = combine('quantile_average@1', [A, B], [0.5, 0.5]);
    const b = precisionBreaches(c, [{ ordinal: 1, methodRef: 'seasonal_naive@1', ...A }, { ordinal: 2, methodRef: 'holt_winters@1', ...B }]);
    expect(b.map((x) => x.methodRef)).toEqual(['seasonal_naive@1', 'holt_winters@1']);
  });
  it('the linear pool keeps every member\'s median inside its band', () => {
    const c = combine('linear_pool@1', [A, B], [0.5, 0.5]);
    expect(precisionBreaches(c, [{ ordinal: 1, methodRef: 'a', ...A }, { ordinal: 2, methodRef: 'b', ...B }])).toEqual([]);
  });
});

describe('the assumptions that split two members', () => {
  it('names the declared assumptions on which they differ (who holds each) and the methods\' structural assumptions', () => {
    const s = splittingAssumptions({ ordinal: 1, methodRef: 'seasonal_naive@1', tied: ['asu-reopen', 'asu-shared'] },
      { ordinal: 2, methodRef: 'holt_winters@1', tied: ['asu-persist', 'asu-shared'] }, { 'asu-reopen': 'Corridor traffic returns to its seasonal pattern', 'asu-persist': 'The decline persists' });
    expect(s.declared).toEqual([
      { assumption_id: 'asu-reopen', title: 'Corridor traffic returns to its seasonal pattern', held_by: ['seasonal_naive@1'], not_held_by: ['holt_winters@1'] },
      { assumption_id: 'asu-persist', title: 'The decline persists', held_by: ['holt_winters@1'], not_held_by: ['seasonal_naive@1'] },
    ]);
    expect(s.structural.map((x) => x.method_ref)).toEqual(['seasonal_naive@1', 'holt_winters@1']);
    expect(s.structural[0]?.assumption).toMatch(/repeats the last observed season/);
    expect(s.structural[1]?.assumption).toMatch(/level and trend continue/);
  });
  it('the router\'s references and the models\' names map to the legacy methods; anything else is a registry method', () => {
    expect(legacyMethodOf('seasonal_naive@1')).toBe('seasonal-naive');
    expect(legacyMethodOf('holt_winters@1')).toBe('holt-winters-additive');
    expect(legacyMethodOf('holt-winters-additive@1')).toBe('holt-winters-additive');
    expect(legacyMethodOf('event_beta_binomial@1')).toBeNull();
  });
});

describe('the request and the overlay, validated before any write', () => {
  const ASU = '0190d1e2-f3a4-7000-8000-000000000001';
  const msg = (f: () => unknown): string => { try { f(); return ''; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message?: string }).message) : String(e); } };
  it('defaults: linear_pool@1, equal weights, replay demonstration, the database\'s now', () => {
    const r = validateEnsembleRequest({ seriesKey: 'portwatch:chokepoint4:n_total', horizon: '30d', assumptions: [ASU] }, 'c');
    expect(r).toMatchObject({ combination: 'linear_pool@1', weighting: 'equal', label: 'replay demonstration', knownAt: null, members: [] });
  });
  it('refusals in the class form', () => {
    expect(msg(() => validateEnsembleRequest({ seriesKey: 's1', horizon: '2y', assumptions: [ASU] }, 'c'))).toMatch(/^ensemble rejected \(horizon\)/);
    expect(msg(() => validateEnsembleRequest({ seriesKey: 's1', horizon: '30d', assumptions: [] }, 'c'))).toMatch(/^ensemble rejected \(assumptions\)/);
    expect(msg(() => validateEnsembleRequest({ seriesKey: 's1', horizon: '30d', assumptions: [ASU], combination: 'median@1' }, 'c'))).toMatch(/^ensemble rejected \(rule\)/);
    expect(msg(() => validateEnsembleRequest({ seriesKey: 's1', horizon: '30d', assumptions: [ASU], members: [{ methodRef: 'a@1', assumptions: [] }, { methodRef: 'a@1', assumptions: [] }] }, 'c'))).toMatch(/named twice/);
    expect(msg(() => validateOverlay({ adjustment: { kind: 'quantiles' }, rationale: 'short', evidence: [] }, 'c', false))).toMatch(/^judgement overlay rejected \(rationale\)/);
    expect(msg(() => validateOverlay({ adjustment: { kind: 'quantiles' }, rationale: 'a judgement with enough words', evidence: [{ kind: 'strategy', id: ASU }] }, 'c', true))).toMatch(/expectedVersion/);
  });
});
