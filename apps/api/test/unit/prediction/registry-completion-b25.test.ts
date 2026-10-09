/**
 * CP-6 B25 completion — UNIT TESTS of the gaps the bookkeeping review found in the method families (pure, deterministic; every series
 * SYNTHETIC — b25-synthetic.ts — so each proof is SOFTWARE CAPABILITY, never an empirical validation):
 *   G1 (V00-T-009, L6-C02) the regime family's CONDITIONS on the frozen features — held / not held, the pseudo-count added, the features listed
 *      with value and digest; refused `forecast rejected (context)` when the feature is absent, non-scalar, or the issue ungrounded;
 *   G3 (MC-012) the Bayesian IDENTIFIABILITY — the variance contraction per parameter, the design's conditioning, WEAKLY IDENTIFIED;
 *   G4 (MC-013) the causal TRANSPORT scope — in scope by series or subject, refused outside, the consistency across series NOT ASSESSED;
 *   G5 (MC-015) the optimisation ROBUSTNESS — feasibility, worst case and regret under each parameter scenario; an infeasible one named;
 *   G6 (V00-T-051) the regime family's PATH-DEPENDENT VIEW (transitions, persistence, the propagated horizon distribution) and the OPTIONS'
 *      value and resilience — the issued probabilities exactly as before.
 */
import { describe, expect, it } from 'vitest';
import {
  classifiedWindows, evaluateConditions, optionAnalysis, regimePaths, regimeProbabilities, type FrozenFeature, type RegimeCategory,
} from '../../../src/prediction/registry/methods/regime.js';
import { bayesForecast, identifiabilityOf, type NormalLinearPrior } from '../../../src/prediction/registry/methods/bayesian.js';
import { transportOf, type CausalDeclarations } from '../../../src/prediction/registry/methods/causal.js';
import { optimise, robustness, type OptimisationDeclarations } from '../../../src/prediction/registry/methods/optimisation.js';
import { FamilyRefusal, checkDeclarations, runFamily, type PlannedEntry, type TargetRow } from '../../../src/prediction/registry/families.js';
import { SYN_INTERVENTION, synPoints } from './b25-synthetic.js';

const ALL = synPoints();
const PRE_SHIFT = ALL.filter((p) => p.date <= '2023-05-31');
const NL: NormalLinearPrior = { model: 'normal_linear', window_days: 60, intercept: { mean: 60, sd: 20 }, slope_per_year: { mean: 0, sd: 2 } };
const CATS: RegimeCategory[] = [
  { key: 'closed', label: 'closed', rule: { comparator: '<', threshold: 45 } },
  { key: 'disrupted', label: 'disrupted', rule: { comparator: '<', threshold: 58 } },
  { key: 'open', label: 'open', rule: null },
];
const JUDGEMENT = { pseudo_counts: { closed: 2, disrupted: 6, open: 12 }, rationale: 'escalation risk in the strait (SYNTHETIC judgement)', judged_by: '00000000-0000-4000-8000-000000000001' };
const FEATURES: FrozenFeature[] = [
  { key: 'twin.shock.corridor_delay_days', source: 'twin:t@v1', digest: 'a'.repeat(64), value: 14 },
  { key: 'graph.edges.ships_through', source: 'graph.edges_current@x', digest: 'b'.repeat(64), value: 1 },
  { key: 'twin.production.policy:SYN-PART-MAG', source: 'twin:t@v1', digest: 'c'.repeat(64), value: 'hold_safety_stock' },
  { key: 'twin.shipment:SYN-SHIP-4472', source: 'twin:t@v1', digest: 'd'.repeat(64) },
];
const target = (definition: Record<string, unknown>): TargetRow => ({ target_key: 'corridor.transit_delay', version: 1, kind: 'event', unit: 'probability', title: 'Bab el-Mandeb transit delay (SYNTHETIC)',
  definition: { series_key: 'syn', ...definition }, sources: {}, subject_entity_id: null, risk_class: 'standard' });
const REGIME_TARGET = target({ horizon_kinds: { '5y': 'regime' }, regime: { classification_window_days: 90, categories: CATS } });
const entry = (family: PlannedEntry['family'], declarations: Record<string, unknown>): PlannedEntry => ({
  method_ref: `${family}_x@1`, method_key: `${family}_x`, version: 1, family, implementation_ref: 'x', implementation_digest: 'x', parameters: {}, declarations, confidence_language: 'scenario_language' });
const fiveYears = { points: PRE_SHIFT, seriesKey: 'syn', seriesUnit: 'transits/day', seasonality: 7, originAt: '2023-05-31', horizonCode: '5y', horizonDays: 1825, targetAt: '2028-05-29', kind: 'regime' as const, target: REGIME_TARGET };
const refusalOf = (f: () => unknown): { cls: string; message: string } => {
  try { f(); return { cls: 'ok', message: '' }; } catch (e) { return e instanceof FamilyRefusal ? { cls: e.refusalClass, message: e.message } : { cls: 'other', message: (e as Error).message }; }
};

describe('B25 completion · G1 FEATURES AS MODEL INPUTS (the regime family\'s conditions on the frozen features)', () => {
  const CONDS = [
    { feature: 'twin.shock.corridor_delay_days', comparator: '>=', threshold: 10, regime: 'disrupted', pseudo_count: 4, rationale: 'a two-week corridor delay in the twin weighs towards disruption (SYNTHETIC)' },
    { feature: 'graph.edges.ships_through', comparator: '>', threshold: 3, regime: 'closed', pseudo_count: 2, rationale: 'many operators routing through the strait (SYNTHETIC)' },
    { feature: 'twin.production.policy:SYN-PART-MAG', comparator: '=', threshold: 'hold_safety_stock', regime: 'open', pseudo_count: 1, rationale: 'the plant still holds safety stock (SYNTHETIC)' },
  ] as const;
  it('POSITIVE: each condition read from the frozen value — held or not — and the held pseudo-counts added to their regime', () => {
    const ev = evaluateConditions(CONDS as never, FEATURES);
    expect(ev.problems).toEqual([]);
    expect(ev.results.map((r) => [r.feature, r.value, r.held, r.digest])).toEqual([
      ['twin.shock.corridor_delay_days', 14, true, 'a'.repeat(64)], ['graph.edges.ships_through', 1, false, 'b'.repeat(64)], ['twin.production.policy:SYN-PART-MAG', 'hold_safety_stock', true, 'c'.repeat(64)]]);
    expect(ev.added).toEqual({ disrupted: 4, open: 1 });
    // the routed run: the probabilities are the Dirichlet posterior of the CONDITIONED judgement; the outcome lists every feature used
    const r = runFamily(entry('structural_judgmental', { judgement: JUDGEMENT, conditions: CONDS }), { ...fiveYears, features: FEATURES });
    const conditioned = regimeProbabilities(PRE_SHIFT, CATS, 90, { ...JUDGEMENT, pseudo_counts: { closed: 2, disrupted: 10, open: 13 } });
    expect((r.distribution['categories'] as Array<{ key: string; probability: number }>).map((c) => c.probability)).toEqual(conditioned.categories.map((c) => c.probability));
    expect(r.outcome['features_used']).toEqual([
      { key: 'twin.shock.corridor_delay_days', source: 'twin:t@v1', digest: 'a'.repeat(64), value: 14, held: true },
      { key: 'graph.edges.ships_through', source: 'graph.edges_current@x', digest: 'b'.repeat(64), value: 1, held: false },
      { key: 'twin.production.policy:SYN-PART-MAG', source: 'twin:t@v1', digest: 'c'.repeat(64), value: 'hold_safety_stock', held: true }]);
    expect((r.outcome['judgement'] as Record<string, unknown>)['conditioned_pseudo_counts']).toEqual({ closed: 2, disrupted: 10, open: 13 });
    expect(r.claim).toMatch(/Conditions on the frozen features: twin\.shock\.corridor_delay_days = 14 >= 10 HELD \(\+4 to disrupted\); graph\.edges\.ships_through = 1 > 3 did not hold/);
  });
  it('REFUSAL: an absent feature, a non-scalar one, a number compared with a string, an UNGROUNDED issue — each `forecast rejected (context)`', () => {
    const run = (conds: unknown[], features: FrozenFeature[] | null) => refusalOf(() => runFamily(entry('structural_judgmental', { judgement: JUDGEMENT, conditions: conds }), { ...fiveYears, features }));
    const absent = run([{ ...CONDS[0], feature: 'twin.route.canal_toll' }], FEATURES);
    expect(absent.cls).toBe('context'); expect(absent.message).toMatch(/^forecast rejected \(context\): .*twin\.route\.canal_toll is not a feature of the frozen information set/);
    const object = run([{ ...CONDS[0], feature: 'twin.shipment:SYN-SHIP-4472' }], FEATURES);
    expect(object.message).toMatch(/^forecast rejected \(context\): .*has no scalar value/);
    const typed = run([{ ...CONDS[2], comparator: '>' as const, threshold: 1 }], FEATURES);
    expect(typed.message).toMatch(/^forecast rejected \(context\): .*cannot be compared/);
    const ungrounded = run([CONDS[0]], null);
    expect(ungrounded.cls).toBe('context'); expect(ungrounded.message).toMatch(/^forecast rejected \(context\): .*an UNGROUNDED issue has no frozen information set/);
    expect(run([CONDS[0]], undefined as never).cls).toBe('context');
    const strange = run([{ ...CONDS[0], regime: 'blockaded' }], FEATURES);
    expect(strange.cls).toBe('target');
  });
  it('RECOVERY / DEFAULT-OFF: an entry with no conditions issues exactly as before (grounded or not); the declarations are checked at proposal', () => {
    const plain = runFamily(entry('structural_judgmental', { judgement: JUDGEMENT }), { ...fiveYears, features: null });
    expect((plain.distribution['categories'] as Array<{ probability: number }>).map((c) => c.probability)).toEqual(regimeProbabilities(PRE_SHIFT, CATS, 90, JUDGEMENT).categories.map((c) => c.probability));
    expect(plain.outcome['conditions']).toBeUndefined();
    const cls = (decl: Record<string, unknown>) => refusalOf(() => checkDeclarations('structural_judgmental', ['regime'], { judgement: JUDGEMENT, ...decl }, {})).cls;
    expect(cls({ conditions: CONDS })).toBe('ok');
    expect(cls({ conditions: [{ ...CONDS[0], feature: 'weather.wind' }] })).toBe('declarations');          // not a frozen feature family
    expect(cls({ conditions: [{ ...CONDS[0], regime: 'blockaded' }] })).toBe('declarations');               // not a category of the judgement
    expect(cls({ conditions: [{ ...CONDS[0], threshold: 'ten' }] })).toBe('declarations');                  // a numeric comparator needs a number
    expect(cls({ conditions: [{ ...CONDS[0], pseudo_count: 0 }] })).toBe('declarations');
    expect(cls({ conditions: [{ ...CONDS[0], rationale: 'short' }] })).toBe('declarations');
    expect(cls({ conditions: [] })).toBe('declarations');
  });
});

describe('B25 completion · G3 MC-012 IDENTIFIABILITY (variance contraction, conditioning, WEAKLY IDENTIFIED)', () => {
  it('POSITIVE: a vague prior is contracted by the data (≈ 1) for both parameters; the design\'s conditioning and posterior correlation are reported', () => {
    const f = bayesForecast(PRE_SHIFT, { prior: { ...NL, intercept: { mean: 60, sd: 1000 }, slope_per_year: { mean: 0, sd: 1000 } }, alternatives: [] }, '2024-05-31');
    expect(f.identifiability.parameters.map((p) => p.name)).toEqual(['intercept', 'slope_per_year']);
    for (const p of f.identifiability.parameters) { expect(p.contraction).toBeGreaterThan(0.99); expect(p.weakly_identified).toBe(false); }
    expect(f.identifiability.weakly_identified).toEqual([]);
    expect(f.identifiability.conditioning!.xtx_condition_number).toBeGreaterThan(1);
    expect(Math.abs(f.identifiability.conditioning!.posterior_correlation)).toBeLessThanOrEqual(1);
    expect(f.identifiability.threshold).toBe(0.1);
  });
  it('REFUSAL (disclosed): a slope prior so tight the data cannot move it is WEAKLY IDENTIFIED — on the forecast and in its statement', () => {
    const decl = { prior: { ...NL, slope_per_year: { mean: 0, sd: 0.0001 } }, alternatives: [{ label: 'wider', prior: NL }] };
    const f = bayesForecast(PRE_SHIFT, decl, '2024-05-31');
    const slope = f.identifiability.parameters.find((p) => p.name === 'slope_per_year')!;
    expect(slope.contraction).toBeLessThan(0.1); expect(slope.weakly_identified).toBe(true);
    expect(f.identifiability.weakly_identified).toEqual(['slope_per_year']);
    const r = runFamily(entry('bayesian', decl), { points: PRE_SHIFT, seriesKey: 'syn', seriesUnit: 'transits/day', seasonality: 7, originAt: '2023-05-31', horizonCode: '1y', horizonDays: 365, targetAt: '2024-05-30', kind: 'quantity', target: null });
    expect(r.claim).toMatch(/WEAKLY IDENTIFIED: slope_per_year — posterior\/prior variance contraction intercept [\d.]+, slope_per_year [\d.]+ \(threshold 0\.1\); the data barely inform it/);
    expect((r.outcome['identifiability'] as Record<string, unknown>)['weakly_identified']).toEqual(['slope_per_year']);
    // gamma–Poisson: a prior worth a million observations is barely contracted by a thousand
    const gp = identifiabilityOf({ model: 'gamma_poisson', shape: 6e7, rate: 1e6 }, { shape: 6e7 + 60_000, rate: 1e6 + 1000 }, 0.1);
    expect(gp.weakly_identified).toEqual(['rate_lambda']); expect(gp.conditioning).toBeNull();
  });
  it('RECOVERY: the declared threshold is the bar (a stricter one flags what the default does not); an invalid threshold is refused at proposal', () => {
    // a slope prior of sd 0.05/year: the data contract its variance by ≈ 0.65 — identified at the default bar, weakly at a declared 0.7
    const decl = { prior: { ...NL, slope_per_year: { mean: 0, sd: 0.05 } }, alternatives: [{ label: 'x', prior: NL }] };
    const calm = bayesForecast(PRE_SHIFT, decl, '2024-05-31');
    const slope = calm.identifiability.parameters.find((p) => p.name === 'slope_per_year')!.contraction;
    expect(slope).toBeGreaterThan(0.5); expect(slope).toBeLessThan(0.7); expect(calm.identifiability.weakly_identified).toEqual([]);
    const strict = bayesForecast(PRE_SHIFT, { ...decl, identifiability_threshold: 0.7 }, '2024-05-31');
    expect(strict.identifiability.weakly_identified).toEqual(['slope_per_year']);
    const cls = (t: unknown) => refusalOf(() => checkDeclarations('bayesian', ['quantity'], { ...decl, identifiability_threshold: t }, {})).cls;
    expect([cls(0.2), cls(0), cls(1), cls('x')]).toEqual(['ok', 'declarations', 'declarations', 'declarations']);
  });
});

describe('B25 completion · G4 MC-013 TRANSPORTABILITY (the declared scope; refused outside it)', () => {
  const ASU = '00000000-0000-4000-8000-0000000000a1'; const STRAIT = '00000000-0000-4000-8000-0000000000e1';
  const decl = (scope: string[]): CausalDeclarations => ({ intervention: { date: SYN_INTERVENTION, description: 'escort convoys begin (SYNTHETIC)' },
    identification: { assumptions: ['asu'], statement: 'the pre-trend would have continued' }, pre_days: 365, post_days: 90,
    transport: { scope, assumptions: [ASU], statement: 'the escorts act alike on every strait transit count (SYNTHETIC)' } });
  const ninety = { points: ALL, seriesKey: 'syn', seriesUnit: 'transits/day', seasonality: 7, originAt: '2023-12-31', horizonCode: '90d', horizonDays: 90, targetAt: '2024-03-30', kind: 'quantity' as const, target: null };
  it('POSITIVE: inside the scope (by the series, or by its subject) the forecast carries the transport assumptions; a one-series scope has nothing to compare', () => {
    expect(transportOf(decl(['syn']), { seriesKey: 'syn', subjects: [null] })).toMatchObject({ declared: true, in_scope: true, matched: 'syn', assumptions: [ASU], consistency: null });
    expect(transportOf(decl([STRAIT]), { seriesKey: 'other', subjects: [STRAIT] })).toMatchObject({ in_scope: true, matched: STRAIT });
    const r = runFamily(entry('causal', decl(['syn'])), ninety);
    expect(r.outcome['transport']).toMatchObject({ declared: true, in_scope: true, assumptions: [ASU], statement: expect.stringMatching(/escorts act alike/) });
    expect(r.claim).toMatch(/transported within its declared scope \(syn\) under 1 transport assumption\(s\)/);
  });
  it('REFUSAL: applied outside its scope — `forecast rejected (transport)`, a FamilyRefusal (the entry stays approved); no transport declared is refused at proposal', () => {
    const out = refusalOf(() => runFamily(entry('causal', decl(['syn-other'])), { ...ninety, subjectEntityId: STRAIT }));
    expect(out.cls).toBe('transport');
    expect(out.message).toMatch(/^forecast rejected \(transport\): causal_x@1's effect is declared transportable to syn-other; syn \(subject 00000000-0000-4000-8000-0000000000e1\) is outside that scope/);
    const { transport: _t, ...bare } = decl(['syn']);
    expect(refusalOf(() => checkDeclarations('causal', ['quantity'], bare as never, {})).cls).toBe('declarations');
    expect(refusalOf(() => checkDeclarations('causal', ['quantity'], { ...decl(['syn']), transport: { scope: ['syn'], assumptions: ['not-a-uuid'], statement: 'x is fine here' } } as never, {})).cls).toBe('declarations');
    expect(refusalOf(() => checkDeclarations('causal', ['quantity'], decl(['syn']) as never, {})).cls).toBe('ok');
  });
  it('RECOVERY: a scope naming more than one series reports their consistency NOT ASSESSED (the route reads one); an entry approved before transport existed is said to claim this series alone', () => {
    const two = transportOf(decl(['syn', 'syn-red-sea']), { seriesKey: 'syn', subjects: [] });
    expect(two.consistency).toEqual({ series_in_scope: 2, assessed: false, note: expect.stringMatching(/reads only syn, so the effect's consistency \(sign and magnitude\) across them is NOT ASSESSED/) });
    const r = runFamily(entry('causal', decl(['syn', 'syn-red-sea'])), ninety);
    expect(r.claim).toMatch(/NOT ASSESSED/);
    const { transport: _t, ...old } = decl(['syn']);
    expect(transportOf(old, { seriesKey: 'syn', subjects: [] })).toMatchObject({ declared: false, in_scope: true });
  });
});

describe('B25 completion · G5 MC-015 ROBUSTNESS (the plan under every parameter scenario)', () => {
  const base: OptimisationDeclarations = {
    variables: [{ name: 'reroute_share', lo: 0, hi: 1, step: 0.05 }],
    objective: { sense: 'minimise', coefficients: [{ param: 'p_disruption', times: -45, plus: 11 }], constant: { param: 'p_disruption', times: 45 }, unit: 'days', statement: 'expected corridor delay per shipment' },
    constraints: [{ label: 'reroute capacity', coefficients: [{ input: 'transits', times: 1 }], comparator: '<=', rhs: 29 }, { label: 'contracted minimum share', coefficients: [1], comparator: '>=', rhs: 0.1 }],
    parameters: { p_disruption: { low: 0.1, mid: 0.4, high: 0.7, source: 'declared band (SYNTHETIC)' } },
    inputs: { transits: { kind: 'series_recent_mean', window_days: 28 } },
  };
  it('POSITIVE: feasible in every scenario — ROBUST; the worst case is the high-disruption objective; regret against each scenario\'s own optimum ≥ 0', () => {
    const o = optimise(PRE_SHIFT, base);
    const rb = o.robustness!;
    expect(rb.robust).toBe(true); expect(rb.infeasible_scenarios).toEqual([]);
    expect(rb.scenarios.map((s) => s.scenario)).toEqual(['low', 'mid', 'high']);
    expect(rb.worst_case.objective).toBe(Math.max(...rb.scenarios.map((s) => s.objective)));
    for (const s of rb.scenarios) { expect(s.feasible).toBe(true); expect(s.regret!).toBeGreaterThanOrEqual(0); }
    // at low disruption rerouting costs more than it saves (coefficient 11 − 4.5 > 0): the scenario's own optimum is the minimum share, the mid plan regrets
    const low = rb.scenarios.find((s) => s.scenario === 'low')!;
    expect(low.scenario_optimum.x).toEqual([0.1]); expect(low.regret!).toBeGreaterThan(0);
    expect(rb.scenarios.find((s) => s.scenario === 'mid')!.regret).toBe(0);
    expect(rb.statement).toMatch(/^ROBUST: the plan is feasible under every declared parameter scenario/);
  });
  it('REFUSAL (named, never hidden): a constraint that tightens under the low scenario makes the mid plan INFEASIBLE there — NOT ROBUST', () => {
    const tight: OptimisationDeclarations = { ...base, constraints: [...base.constraints, { label: 'escort slots (share)', coefficients: [1], comparator: '<=', rhs: { param: 'slots' } }],
      parameters: { ...base.parameters, slots: { low: 0.2, mid: 0.5, high: 0.8, source: 'declared escort slot band (SYNTHETIC)' } } };
    const o = optimise(PRE_SHIFT, tight);
    expect(o.status).toBe('optimal');
    const rb = o.robustness!;
    expect(rb.robust).toBe(false); expect(rb.infeasible_scenarios).toEqual(['low']);
    expect(rb.scenarios.find((s) => s.scenario === 'low')!.broken).toEqual([expect.stringMatching(/^escort slots \(share\)/)]);
    expect(rb.statement).toMatch(/^NOT ROBUST: the plan is INFEASIBLE under the low scenario \(low: escort slots \(share\)/);
    const r = runFamily(entry('optimisation', tight as never), { points: PRE_SHIFT, seriesKey: 'syn', seriesUnit: 'transits/day', seasonality: 7, originAt: '2023-05-31', horizonCode: '30d', horizonDays: 30, targetAt: '2023-06-30', kind: 'quantity', target: null });
    expect(r.claim).toMatch(/NOT ROBUST/);
    expect((r.outcome['robustness'] as Record<string, unknown>)['robust']).toBe(false);
  });
  it('RECOVERY: the steward\'s corrected plan bound (the plan feasible under all three) is ROBUST again; a maximising objective\'s worst case is its minimum', () => {
    const o = optimise(PRE_SHIFT, base);
    const rb = robustness({ ...base, objective: { ...base.objective, sense: 'maximise' } }, o.inputs, o.implementable.x!);
    expect(rb.worst_case.objective).toBe(Math.min(...rb.scenarios.map((s) => s.objective)));
    expect(rb.robust).toBe(true);
  });
});

describe('B25 completion · G6 V00-T-051 PATH DEPENDENCE, OPTION VALUE, RESILIENCE (beside the issued probabilities)', () => {
  it('POSITIVE: transitions between consecutive classified windows, Dirichlet-smoothed rows, persistence, the horizon distribution propagated from the current regime', () => {
    const p = regimePaths(PRE_SHIFT, CATS, 90, 1825);
    const seq = classifiedWindows(PRE_SHIFT, CATS, 90);
    const consecutive = seq.slice(1).filter((w, i) => w.regime !== null && seq[i]!.regime !== null).length;
    expect(p.transitions_counted).toBe(consecutive);
    const counted = Object.values(p.counts).reduce((s, row) => s + Object.values(row).reduce((a, b) => a + b, 0), 0);
    expect(counted).toBe(consecutive);
    for (const row of Object.values(p.matrix)) expect(Object.values(row).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    expect(p.current).toBe([...seq].reverse().find((w) => w.regime !== null)!.regime);
    expect(p.steps).toBe(Math.ceil(1825 / 90));
    expect(Object.values(p.horizon_distribution!).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    expect(p.statement).toMatch(/^THE PATH-DEPENDENT VIEW \(scenario language, not a validated forecast\): starting from the current regime/);
    // exact on a hand-made path: four 'open' windows, smoothing 1 over three regimes → P(open→open) = (3 + 1) / (3 + 3)
    const flat = Array.from({ length: 8 }, (_, i) => ({ date: `2024-01-0${i + 1}`, value: 70 }));
    const q = regimePaths(flat, CATS, 2, 2);
    expect(q.counts['open']!['open']).toBe(3); expect(q.persistence['open']).toBeCloseTo(4 / 6, 4);
    expect(q.horizon_distribution).toEqual({ closed: Number((1 / 6).toFixed(4)), disrupted: Number((1 / 6).toFixed(4)), open: Number((4 / 6).toFixed(4)) });
  });
  it('POSITIVE: option value and resilience — expected net payoff, the worst regime, E[best per regime] − the best single commitment', () => {
    const two: RegimeCategory[] = [{ key: 'a', label: 'calm', rule: { comparator: '<', threshold: 50 } }, { key: 'b', label: 'storm', rule: null }];
    const o = optionAnalysis([
      { key: 'x', label: 'commit to Suez', cost: 0, payoff: { a: 10, b: 0 } },
      { key: 'y', label: 'commit to the Cape', cost: 0, payoff: { a: 0, b: 10 } },
      { key: 'z', label: 'dual sourcing', cost: 1, payoff: { a: 6, b: 6 } },
    ], two, { a: 0.5, b: 0.5 }, { a: 0.2, b: 0.8 });
    expect(o.options.map((x) => [x.key, x.expected, x.resilience, x.expected_under_path_view])).toEqual([['x', 5, 0, 2], ['y', 5, 0, 8], ['z', 5, 5, 5]]);
    expect(o.best_per_regime).toEqual({ a: 'x', b: 'y' });
    expect(o.expected_best_per_regime).toBe(10); expect(o.best_commitment).toEqual({ key: 'x', expected: 5 }); expect(o.option_value).toBe(5);
    expect(o.most_resilient).toEqual({ key: 'z', resilience: 5 });
  });
  it('the ISSUED probabilities are exactly as before; the path view and the options ride beside them; an option that does not price every regime is refused', () => {
    const options = [{ key: 'hold', label: 'hold safety stock', cost: 2, payoff: { closed: 8, disrupted: 6, open: 3 } }, { key: 'reroute', label: 'reroute via the Cape', cost: 4, payoff: { closed: 10, disrupted: 7, open: 1 } }];
    const r = runFamily(entry('structural_judgmental', { judgement: JUDGEMENT, options }), { ...fiveYears, features: null });
    const before = regimeProbabilities(PRE_SHIFT, CATS, 90, JUDGEMENT);
    expect((r.distribution['categories'] as Array<{ key: string; probability: number }>)).toEqual(before.categories.map((c) => ({ key: c.key, label: c.label, probability: c.probability })));
    expect((r.outcome['path_dependence'] as Record<string, unknown>)['current']).not.toBeUndefined();
    const oa = r.outcome['options'] as { option_value: number; options: Array<{ key: string }> };
    expect(oa.options.map((x) => x.key)).toEqual(['hold', 'reroute']); expect(oa.option_value).toBeGreaterThanOrEqual(0);
    expect(r.claim).toMatch(/THE PATH-DEPENDENT VIEW .* OPTION VALUE AND RESILIENCE .* DECLARED with the entry \(approved by its steward\), not measured$/);
    expect(refusalOf(() => runFamily(entry('structural_judgmental', { judgement: JUDGEMENT, options: [{ ...options[0], payoff: { closed: 1, open: 2 } }] }), { ...fiveYears, features: null })).cls).toBe('target');
    const cls = (decl: Record<string, unknown>) => refusalOf(() => checkDeclarations('structural_judgmental', ['regime'], { judgement: JUDGEMENT, ...decl }, {})).cls;
    expect([cls({ options }), cls({ options: [{ ...options[0], cost: -1 }] }), cls({ options: [options[0], options[0]] }), cls({ path: { smoothing: 0 } }), cls({ path: { smoothing: 0.5 } })])
      .toEqual(['ok', 'declarations', 'declarations', 'declarations', 'ok']);
  });
});
