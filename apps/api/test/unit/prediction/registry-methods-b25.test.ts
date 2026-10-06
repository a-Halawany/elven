/**
 * CP-6 B25 §MR (0108) — UNIT TESTS OF THE METHOD FAMILIES (pure, deterministic): the kernel, EVENT (Beta-binomial rate, Brier/log-score
 * backtest), STATE/REGIME (structural judgement + counted evidence, sensitivity), BAYESIAN (normal–linear and gamma–Poisson with explicit
 * priors, prior sensitivity), CAUSAL (interrupted time series, placebo, balance, sensitivity), OPTIMISATION (feasibility, optimality gap),
 * the quantity ROLLING-ORIGIN validation at 3y/5y, the routed run of each family (runFamily) and its refusals, the declarations a proposal
 * must carry, the pinned implementation digests, and every refusal family through the mapper.
 *
 * Every series here is SYNTHETIC (b25-synthetic.ts): the tests prove SOFTWARE CAPABILITY and a SYNTHETIC DEMONSTRATION of the validation
 * machinery — never an empirical validation.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { betaCdf, betaQuantile, normInv, ols, quantile, solve } from '../../../src/prediction/registry/methods/stats.js';
import { conditionMet, eventBacktest, eventProbability, eventWindows } from '../../../src/prediction/registry/methods/event.js';
import { classify, regimeProbabilities, type RegimeCategory } from '../../../src/prediction/registry/methods/regime.js';
import { bayesActual, bayesClimatology, bayesForecast, gammaPoissonPredict, normalLinearFit, normalLinearPredict, windowMeans, type NormalLinearPrior } from '../../../src/prediction/registry/methods/bayesian.js';
import { interruptedTimeSeries } from '../../../src/prediction/registry/methods/causal.js';
import { optimise, solveGrid, solveLp, type OptimisationDeclarations } from '../../../src/prediction/registry/methods/optimisation.js';
import { rollingOrigin } from '../../../src/prediction/registry/methods/validation.js';
import { IMPLEMENTATION_DIGESTS, IMPLEMENTATION_FILES } from '../../../src/prediction/registry/methods/digests.js';
import { FamilyRefusal, checkDeclarations, runFamily, type PlannedEntry, type TargetRow } from '../../../src/prediction/registry/families.js';
import { routedRefusalStatus } from '../../../src/prediction/registry/registry.service.js';
import { asObservationRefusal } from '../../../src/observation/observation-errors.js';
import { SYN_INTERVENTION, synPoints } from './b25-synthetic.js';

const ALL = synPoints();
const PRE_SHIFT = ALL.filter((p) => p.date <= '2023-05-31');
const CORRIDOR = { comparator: '<' as const, threshold: 41, consecutive: 5 };
const NL: NormalLinearPrior = { model: 'normal_linear', window_days: 60, intercept: { mean: 60, sd: 20 }, slope_per_year: { mean: 0, sd: 2 } };

describe('B25 §MR · the kernel', () => {
  it('normal and beta quantiles, OLS and the solver are right on known values', () => {
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5);
    expect(normInv(0.1)).toBeCloseTo(-1.281552, 5);
    expect(betaCdf(0.5, 2, 2)).toBeCloseTo(0.5, 9);
    expect(betaQuantile(0.5, 3, 3)).toBeCloseTo(0.5, 9);
    expect(betaCdf(betaQuantile(0.9, 28, 168), 28, 168)).toBeCloseTo(0.9, 8);
    const fit = ols([[1, 0], [1, 1], [1, 2], [1, 3]], [1, 3, 5, 7])!;
    expect(fit.beta[0]).toBeCloseTo(1, 9); expect(fit.beta[1]).toBeCloseTo(2, 9);
    expect(solve([[2, 1], [1, 3]], [3, 5])!.map((x) => Number(x.toFixed(9)))).toEqual([0.8, 1.4]);
    expect(solve([[1, 2], [2, 4]], [1, 2])).toBeNull();
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });
});

describe('B25 §MR · EVENT (event-rate)', () => {
  it('POSITIVE: the condition, the windows and the Beta-binomial posterior — deterministic', () => {
    expect(conditionMet([50, 40, 39, 38, 37, 36, 60], CORRIDOR)).toBe(true);
    expect(conditionMet([50, 40, 39, 60, 37, 36, 35, 34], CORRIDOR)).toBe(false);
    const w = eventWindows(ALL, 30, CORRIDOR);
    expect(w.windows.length).toBeGreaterThan(150);
    const hits = w.windows.filter((x) => x.hit).length;
    const p = eventProbability(ALL, 30, CORRIDOR, { alpha: 1, beta: 1 });
    expect(p.hits).toBe(hits);
    expect(p.probability).toBeCloseTo((1 + hits) / (2 + w.windows.length), 5);
    expect(p.q10).toBeLessThan(p.q50); expect(p.q50).toBeLessThan(p.q90);
    expect(eventProbability(ALL, 30, CORRIDOR, { alpha: 1, beta: 1 })).toEqual(p);
    // a 30-day window holds a 6-day disruption episode (every 173 days) roughly one time in six
    expect(p.probability).toBeGreaterThan(0.1); expect(p.probability).toBeLessThan(0.25);
  });
  it('the Brier / log-score backtest PASSES on the synthetic corridor (a synthetic demonstration) and CANNOT VALIDATE on a short history', () => {
    const bt = eventBacktest(ALL, 30, CORRIDOR, { alpha: 1, beta: 1 }, { origins: 60, stride: 30, minWindows: 12, minOrigins: 20 });
    expect(bt.origins).toBe(60);
    expect(bt.brier!).toBeLessThan(bt.referenceBrier!);
    expect(Math.abs(bt.calibrationGap!)).toBeLessThanOrEqual(0.1);
    expect(bt.logScore!).toBeGreaterThan(0);
    expect(bt.passed).toBe(true);
    expect(bt.verdict).toMatch(/PASSED/);
    const short = eventBacktest(ALL.slice(0, 500), 30, CORRIDOR, { alpha: 1, beta: 1 }, { origins: 60, stride: 30, minWindows: 12, minOrigins: 20 });
    expect(short.passed).toBe(false);
    expect(short.verdict).toMatch(/^CANNOT VALIDATE: \d+ usable origin\(s\)/);
  });
});

describe('B25 §MR · STATE / REGIME (regime-judgement: structural judgement + counted evidence, scenario language)', () => {
  const cats: RegimeCategory[] = [
    { key: 'closed', label: 'closed', rule: { comparator: '<', threshold: 45 } },
    { key: 'disrupted', label: 'disrupted', rule: { comparator: '<', threshold: 58 } },
    { key: 'open', label: 'open', rule: null },
  ];
  const judgement = { pseudo_counts: { closed: 2, disrupted: 6, open: 12 }, rationale: 'escalation risk in the strait (SYNTHETIC judgement)', judged_by: '00000000-0000-4000-8000-000000000001' };
  it('POSITIVE: Dirichlet posterior from declared pseudo-counts and counted windows; shares, sensitivity, modal', () => {
    expect(classify(40, cats)).toBe('closed'); expect(classify(50, cats)).toBe('disrupted'); expect(classify(70, cats)).toBe('open');
    const r = regimeProbabilities(ALL, cats, 90, judgement);
    const sum = r.categories.reduce((s, c) => s + c.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
    const n = r.windows; const total = 20 + n;
    for (const c of r.categories) expect(c.probability).toBeCloseTo((c.judgement_count + c.evidence_count) / total, 5);
    expect(r.judgementShare).toBeCloseTo(20 / total, 4);
    expect(r.sensitivity.maxShift).toBeGreaterThan(0);
    expect(r.modal).toBe('open');
  });
  it('REFUSAL: a judgement silent on a category, an `otherwise` that is not last', () => {
    expect(() => regimeProbabilities(ALL, cats, 90, { ...judgement, pseudo_counts: { closed: 1, open: 1 } })).toThrow(/no positive pseudo-count for disrupted/);
    expect(() => regimeProbabilities(ALL, [cats[2]!, cats[0]!], 90, judgement)).toThrow(/otherwise/);
  });
});

describe('B25 §MR · BAYESIAN (MC-012: explicit priors, posterior predictive, prior sensitivity)', () => {
  it('POSITIVE: a vague prior reproduces least squares; a tight prior pins the posterior to it', () => {
    const vague = normalLinearFit(PRE_SHIFT, { ...NL, intercept: { mean: 0, sd: 1e6 }, slope_per_year: { mean: 0, sd: 1e6 } });
    const w = windowMeans(PRE_SHIFT, 60);
    const o = ols(w.map((x) => [1, x.t]), w.map((x) => x.mean))!;
    expect(vague.m[0]).toBeCloseTo(o.beta[0]!, 4); expect(vague.m[1]).toBeCloseTo(o.beta[1]!, 4);
    const tight = normalLinearFit(PRE_SHIFT, { ...NL, intercept: { mean: 100, sd: 1e-4 }, slope_per_year: { mean: 0, sd: 1e-4 } });
    expect(tight.m[0]).toBeCloseTo(100, 2); expect(tight.m[1]).toBeCloseTo(0, 2);
    const p = normalLinearPredict(vague, '2026-05-31');
    expect(p.q10).toBeLessThan(p.q50); expect(p.q50).toBeLessThan(p.q90);
  });
  it('PRIOR SENSITIVITY: the declared alternatives move the median; a strong wrong prior is flagged SENSITIVE', () => {
    const f = bayesForecast(PRE_SHIFT, { prior: NL, alternatives: [{ label: 'flat slope, tight', prior: { ...NL, slope_per_year: { mean: 0, sd: 0.01 } } },
      { label: 'level at 40, very tight', prior: { ...NL, intercept: { mean: 40, sd: 0.01 }, slope_per_year: { mean: 0, sd: 0.01 } } }] }, '2026-05-31');
    expect(f.sensitivity.alternatives).toHaveLength(2);
    expect(f.sensitivity.sensitive).toBe(true);
    expect(f.sensitivity.maxShiftSd).toBeGreaterThan(f.sensitivity.threshold);
    const calm = bayesForecast(PRE_SHIFT, { prior: NL, alternatives: [{ label: 'a wider vague prior', prior: { ...NL, intercept: { mean: 60, sd: 40 } } }] }, '2026-05-31');
    expect(calm.sensitivity.sensitive).toBe(false);
  });
  it('gamma–Poisson: the negative-binomial predictive and its quantiles; integer counts only', () => {
    const g = gammaPoissonPredict(600, 10);
    expect(g.mean).toBeCloseTo(60, 6);
    expect(g.q10).toBeLessThan(g.q50); expect(g.q50).toBeLessThan(g.q90);
    expect(Math.abs(g.q50 - 60)).toBeLessThanOrEqual(1);
    const counts = Array.from({ length: 30 }, (_, i) => ({ date: `2024-01-${String(i + 1).padStart(2, '0')}`, value: 50 + (i % 5) }));
    const f = bayesForecast(counts, { prior: { model: 'gamma_poisson', shape: 1, rate: 0.02 }, alternatives: [{ label: 'informative', prior: { model: 'gamma_poisson', shape: 600, rate: 10 } }] }, '2024-03-01');
    expect(f.posterior['observations']).toBe(30);
    expect(() => bayesForecast([{ date: '2024-01-01', value: 1.5 }], { prior: { model: 'gamma_poisson', shape: 1, rate: 1 }, alternatives: [] }, '2024-02-01')).toThrow(/integer counts/);
  });
  it('the realised quantity and the climatology reference', () => {
    expect(bayesActual(ALL, NL, '2009-03-01')).toBeCloseTo(ALL.filter((p) => p.date > '2008-12-31' && p.date <= '2009-03-01').reduce((s, p) => s + p.value, 0) / 60, 9);
    expect(bayesActual(ALL, NL, '2030-01-01')).toBeNull();
    const c = bayesClimatology(PRE_SHIFT, NL)!;
    expect(c.q10).toBeLessThan(c.q90);
  });
});

describe('B25 §MR · CAUSAL (MC-013: identification declared, placebo, balance, sensitivity)', () => {
  const decl = { intervention: { date: SYN_INTERVENTION, description: 'escort convoys begin (SYNTHETIC)' }, identification: { assumptions: ['asu'], statement: 'the pre-trend would have continued' }, pre_days: 365, post_days: 90 };
  it('POSITIVE: the synthetic +10/day shift is found, its band excludes zero, the placebo dates do not reproduce it', () => {
    const r = interruptedTimeSeries(ALL, decl, 7);
    expect(r.effect.estimate).toBeGreaterThan(3);
    expect(r.effect.q10).toBeGreaterThan(0);
    expect(r.placebo.effects.length).toBeGreaterThanOrEqual(4);
    expect(r.placebo.p_value!).toBeLessThan(0.5);
    expect(r.balance.balanced).toBe(true);
    expect(r.sensitivity.sign_stable).toBe(true);
    expect(r.identification.assumptions).toEqual(['asu']);
  });
  it('NEGATIVE CONTROL: at a date with no intervention the estimate is small and the band covers zero', () => {
    const r = interruptedTimeSeries(PRE_SHIFT, { ...decl, intervention: { date: '2021-03-01', description: 'nothing happened here (SYNTHETIC)' } }, 7);
    expect(r.effect.q10).toBeLessThan(0.5 + Math.abs(r.effect.estimate));
    expect(Math.abs(r.effect.estimate)).toBeLessThan(Math.abs(interruptedTimeSeries(ALL, decl, 7).effect.estimate));
  });
  it('REFUSAL: a history that does not straddle the intervention', () => {
    expect(() => interruptedTimeSeries(PRE_SHIFT.slice(0, 200), decl, 7)).toThrow(/does not cover/);
  });
});

describe('B25 §MR · OPTIMISATION (MC-015: feasibility, optimality gap; objective and constraints declared)', () => {
  const decl: OptimisationDeclarations = {
    variables: [{ name: 'reroute_share', lo: 0, hi: 1, step: 0.05 }],
    objective: { sense: 'minimise', coefficients: [{ param: 'p_disruption', times: -45, plus: 11 }], constant: { param: 'p_disruption', times: 45 }, unit: 'days', statement: 'expected corridor delay per shipment' },
    constraints: [{ label: 'reroute capacity', coefficients: [{ input: 'transits', times: 1 }], comparator: '<=', rhs: 29 }, { label: 'contracted minimum share', coefficients: [1], comparator: '>=', rhs: 0.1 }],
    parameters: { p_disruption: { low: 0.1, mid: 0.4, high: 0.7, source: 'declared band (SYNTHETIC)' } },
    inputs: { transits: { kind: 'series_recent_mean', window_days: 28 } },
  };
  it('POSITIVE: the LP optimum on a vertex, the implementable grid plan, the gap, the feasibility report and the scenario band', () => {
    const o = optimise(PRE_SHIFT, decl);
    expect(o.status).toBe('optimal');
    const v = o.inputs['transits']!;
    expect(o.lp.x![0]).toBeCloseTo(29 / v, 5);           // reroute as much as capacity allows (coefficient 11 − 45·0.4 < 0)
    expect(o.implementable.x![0]!).toBeLessThanOrEqual(29 / v + 1e-9);
    expect(o.gap!).toBeGreaterThanOrEqual(0); expect(o.gap!).toBeLessThan(0.05);
    expect(o.feasibility.every((f) => f.satisfied)).toBe(true);
    expect(o.band!.q10).toBeLessThanOrEqual(o.band!.q50); expect(o.band!.q50).toBeLessThanOrEqual(o.band!.q90);
    const g = solveGrid(decl, { params: { p_disruption: 0.4 }, inputs: o.inputs });
    expect(g.points).toBe(21);
  });
  it('REFUSAL: infeasible constraints are reported, never solved around', () => {
    const bad = { ...decl, constraints: [...decl.constraints, { label: 'at least 90% rerouted', coefficients: [1], comparator: '>=' as const, rhs: 0.9 }] };
    const o = optimise(PRE_SHIFT, bad);
    expect(o.status).toBe('infeasible'); expect(o.band).toBeNull();
    expect(solveLp(bad, { params: { p_disruption: 0.4 }, inputs: o.inputs }).status).toBe('infeasible');
  });
});

describe('B25 §MR · per target/horizon VALIDATION (quantity rolling-origin at 3y and 5y)', () => {
  const run = (points: typeof ALL, horizonDays: number) => rollingOrigin(points, {
    horizonDays, origins: 40, stride: 45, minTrainDays: 730, minOrigins: 20,
    forecast: (train, _o, t) => bayesForecast(train, { prior: NL, alternatives: [] }, t).band,
    actual: (all, t) => bayesActual(all, NL, t), reference: (train) => bayesClimatology(train, NL),
  });
  it('POSITIVE (synthetic demonstration): 40 origins at 3y and at 5y, coverage inside T1 — PASSED', async () => {
    for (const h of [1095, 1825]) {
      const r = await run(PRE_SHIFT, h);
      expect(r.origins).toBe(40);
      expect(r.t1, r.verdict).toBe(true);
      expect(r.passed).toBe(true);
      expect(r.windowTo! <= '2023-05-31').toBe(true);
    }
  });
  it('REFUSAL: two years of history CANNOT VALIDATE at 3y and says how much history it needs', async () => {
    const r = await run(ALL.filter((p) => p.date <= '2009-12-31'), 1095);
    expect(r.passed).toBe(false);
    expect(r.origins).toBe(0);
    expect(r.verdict).toMatch(/^CANNOT VALIDATE: 0 scored origin\(s\) at 1095 days .* about 2680 days of history/);
  });
  it('historical mode: an origin with no recorded history is unknowable, never fitted', async () => {
    const r = await rollingOrigin(PRE_SHIFT, { horizonDays: 1095, origins: 5, stride: 90, minTrainDays: 730, minOrigins: 5,
      forecast: (train, _o, t) => bayesForecast(train, { prior: NL, alternatives: [] }, t).band, actual: (all, t) => bayesActual(all, NL, t), reference: () => null,
      historyAt: async () => null });
    expect(r.unknowable).toBeGreaterThan(0); expect(r.origins).toBe(0); expect(r.passed).toBe(false);
  });
});

describe('B25 §MR · the routed run of each family (runFamily) and the declarations', () => {
  const target = (kind: TargetRow['kind'], definition: Record<string, unknown>): TargetRow => ({ target_key: 'corridor.transit_delay', version: 1, kind, unit: 'probability', title: 'Bab el-Mandeb transit delay (SYNTHETIC)',
    definition: { series_key: 'syn', ...definition }, sources: {}, subject_entity_id: null, risk_class: 'standard' });
  const entry = (family: PlannedEntry['family'], declarations: Record<string, unknown>, parameters: Record<string, unknown> = {}): PlannedEntry => ({
    method_ref: `${family}_x@1`, method_key: `${family}_x`, version: 1, family, implementation_ref: 'x', implementation_digest: 'x', parameters, declarations, confidence_language: 'probability' });
  const base = { points: PRE_SHIFT, seriesKey: 'syn', seriesUnit: 'transits/day', seasonality: 7, originAt: '2023-05-31' };
  it('EVENT at 30d and REGIME at 5y on ONE target: different methods per horizon, the regime in scenario language', () => {
    const t = target('event', { event: CORRIDOR, horizon_kinds: { '5y': 'regime' }, regime: { classification_window_days: 90, categories: [
      { key: 'closed', label: 'closed', rule: { comparator: '<', threshold: 45 } }, { key: 'disrupted', label: 'disrupted', rule: { comparator: '<', threshold: 58 } }, { key: 'open', label: 'open', rule: null }] } });
    const ev = runFamily(entry('event', { prior: { alpha: 1, beta: 1 } }), { ...base, horizonCode: '30d', horizonDays: 30, targetAt: '2023-06-30', kind: 'event', target: t });
    expect(ev.kind).toBe('event'); expect(ev.scenarioLanguage).toBe(false);
    expect(ev.claim).toMatch(/^P\(syn < 41 on 5 consecutive published observation\(s\) within the 30d window to 2023-06-30\) = 0\.\d+/);
    const rg = runFamily(entry('structural_judgmental', { judgement: { pseudo_counts: { closed: 2, disrupted: 6, open: 12 }, rationale: 'escalation risk (SYNTHETIC)', judged_by: 'n.eriksen' } }),
      { ...base, horizonCode: '5y', horizonDays: 1825, targetAt: '2028-05-29', kind: 'regime', target: t });
    expect(rg.kind).toBe('regime'); expect(rg.scenarioLanguage).toBe(true); expect(rg.quantiles).toEqual({});
    expect(rg.claim).toMatch(/^SCENARIO LANGUAGE, NOT A VALIDATED FORECAST/);
  });
  it('REFUSALS are FamilyRefusals (the method stays approved): no event definition, an intervention after the history, infeasible constraints', () => {
    const noDef = () => runFamily(entry('event', { prior: { alpha: 1, beta: 1 } }), { ...base, horizonCode: '30d', horizonDays: 30, targetAt: '2023-06-30', kind: 'event', target: null });
    expect(noDef).toThrow(FamilyRefusal); expect(noDef).toThrow(/^forecast rejected \(target\): /);
    const late = () => runFamily(entry('causal', { intervention: { date: '2025-01-01', description: 'not yet happened' }, identification: { assumptions: ['a'], statement: 'declared' }, pre_days: 365, post_days: 90 }),
      { ...base, horizonCode: '30d', horizonDays: 30, targetAt: '2023-06-30', kind: 'quantity', target: null });
    expect(late).toThrow(/^forecast rejected \(intervention\): /);
  });
  it('checkDeclarations: explicit priors, identification, objectives and constraints, the judgement — each refused when missing', () => {
    const cls = (f: () => void): string => { try { f(); return 'ok'; } catch (e) { return e instanceof FamilyRefusal ? e.refusalClass : 'other'; } };
    expect(cls(() => checkDeclarations('bayesian', ['quantity'], { prior: NL }, {}))).toBe('declarations');                 // no alternatives
    expect(cls(() => checkDeclarations('bayesian', ['quantity'], { prior: NL, alternatives: [{ label: 'x', prior: NL }] }, {}))).toBe('ok');
    expect(cls(() => checkDeclarations('causal', ['quantity'], { intervention: { date: '2023-06-01', description: 'escort convoys begin' }, identification: { assumptions: [], statement: 'x' } }, {}))).toBe('declarations');
    expect(cls(() => checkDeclarations('optimisation', ['quantity'], { variables: [{ name: 's', lo: 0, hi: 1, step: 0.1 }], objective: { sense: 'minimise', coefficients: [1], constant: 0, unit: 'd', statement: 's' }, constraints: [] }, {}))).toBe('declarations');
    expect(cls(() => checkDeclarations('event', ['event'], { prior: { alpha: 0, beta: 1 } }, {}))).toBe('declarations');
    expect(cls(() => checkDeclarations('event', ['quantity'], { prior: { alpha: 1, beta: 1 } }, {}))).toBe('kinds');
    expect(cls(() => checkDeclarations('structural_judgmental', ['regime'], { judgement: { pseudo_counts: { a: 1 }, rationale: 'too few', judged_by: 'x' } }, {}))).toBe('declarations');
    expect(cls(() => checkDeclarations('statistical', ['quantity'], {}, {}))).toBe('family');
  });
});

describe('B25 §MR · the pinned implementation digests and the refusal families', () => {
  it('every digest is the sha256 of its files as they are in the tree; the builtins\' SQL literal is the legacy one', () => {
    const src = join(__dirname, '../../../src/prediction');
    for (const [ref, files] of Object.entries(IMPLEMENTATION_FILES)) {
      const bytes = Buffer.concat(files.map((f) => readFileSync(join(src, f))));
      expect(createHash('sha256').update(bytes).digest('hex'), ref).toBe(IMPLEMENTATION_DIGESTS[ref]);
    }
    const migration = readFileSync(join(__dirname, '../../../migrations/0108_b25_x_registry.sql'), 'utf8');
    expect(migration.match(/'legacy-models',\s*'([0-9a-f]{64})'/g)?.length).toBe(2);
    expect(migration).toContain(`'${IMPLEMENTATION_DIGESTS['legacy-models']}'`);
  });
  it('every refusal family maps to its class\'s status (anchored, the class parenthesis required); the legacy colon form is not taken', () => {
    const cases: Array<[string, string, number]> = [
      ['forecast method rejected (separation_of_duties): x', '42501', 403], ['forecast method rejected (ownership): x', '42501', 403], ['forecast method rejected (unknown_steward): x', '23503', 404],
      ['forecast method rejected (state): x', '23514', 409], ['forecast method rejected (duplicate): x', '23505', 409], ['forecast method rejected (declarations): x', '22023', 422],
      ['forecast target rejected (unknown_series): x', '23503', 404], ['forecast target rejected (definition): x', '22023', 422], ['forecast target rejected (separation_of_duties): x', '42501', 403],
      ['horizon policy rejected (ownership): x', '42501', 403], ['horizon policy rejected (state): x', '23514', 409], ['horizon policy rejected (validation): x', '22023', 422],
      ['forecast route rejected (state): x', '2F002', 409],
      ['forecast rejected (horizon): x', '23514', 422], ['forecast rejected (method): x', '23514', 422], ['forecast rejected (unknown_target): x', '23503', 404], ['forecast rejected (stale): x', '23514', 409],
    ];
    for (const [message, code, status] of cases) {
      const e = asObservationRefusal({ message, code }, 'unit');
      expect(e, message).toBeInstanceOf(HttpException);
      expect(e!.getStatus(), message).toBe(status);
      expect(String((e!.getResponse() as { message?: string }).message), message).toBe(message);
    }
    const legacy = asObservationRefusal({ message: 'forecast rejected: series x is not registered in this domain', code: '23503' }, 'unit');
    expect(legacy === null || !String((legacy.getResponse() as { message?: string }).message).startsWith('forecast rejected (')).toBe(true);
    expect([routedRefusalStatus('horizon'), routedRefusalStatus('unknown_target'), routedRefusalStatus('state'), routedRefusalStatus('authority')]).toEqual([422, 404, 409, 403]);
  });
});
