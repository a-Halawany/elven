/**
 * CP-6 B25-F — the review's findings on the ensemble manager, at the unit level (pure; no database):
 *   B25-F1 THE ROUTER HOLDS NO STATE: `RegistryMethodRouter.run` executes ONLY the entry and the target version the run's persisted plan
 *          pinned — no pin, a pinned implementation this build does not carry, or a pinned target definition that no longer digests as
 *          planned, each FAILS with its reason; two runs pinned to DIFFERENT targets cannot affect each other in any order (the reviewer's
 *          probe: A's causal transport refusal never becomes an acceptance because B was run in between).
 *   B25-F2 OUTPUT SEMANTICS: each family states what its output means (meaning, temporal aggregation, unit, uncertainty) beside its numbers,
 *          and `incompatibility` refuses to treat an effect, an objective's scenario band, a 60-day mean or another unit as the run's
 *          question (a future level, the day's value, in the series' unit, a predictive distribution). SYNTHETIC series.
 */
import { describe, expect, it } from 'vitest';
import { canonicalDigest } from '../../../src/shared/forecast-environment.js';
import { IMPLEMENTATION_DIGESTS } from '../../../src/prediction/registry/methods/digests.js';
import { runFamily, type PlannedEntry, type TargetRow } from '../../../src/prediction/registry/families.js';
import { RegistryMethodRouter, targetPlanPinOf } from '../../../src/prediction/registry/method-router.js';
import { describeQuestion, incompatibility, legacySemantics, questionOf } from '../../../src/prediction/ensembles/compatibility.js';
import { SYN_INTERVENTION, synPoints } from './b25-synthetic.js';

const ALL = synPoints('2019-01-01', '2024-01-01');
const NL = { model: 'normal_linear', window_days: 60, intercept: { mean: 60, sd: 20 }, slope_per_year: { mean: 0, sd: 2 } };
const HORMUZ = '00000000-0000-4000-8000-00000000a0a0';
const ITS = { intervention: { date: SYN_INTERVENTION, description: 'escort convoys begin (SYNTHETIC)' }, identification: { assumptions: ['asu'], statement: 'the pre-trend would have continued' },
  pre_days: 365, post_days: 90, transport: { scope: [HORMUZ], assumptions: ['00000000-0000-4000-8000-0000000000a1'], statement: 'the escorts act alike in Hormuz (SYNTHETIC)' } };
const LP = {
  variables: [{ name: 'reroute_share', lo: 0, hi: 1, step: 0.05 }],
  objective: { sense: 'minimise', coefficients: [{ param: 'p', times: -45, plus: 11 }], constant: { param: 'p', times: 45 }, unit: 'EUR', statement: 'expected rerouting cost per shipment (SYNTHETIC)' },
  constraints: [{ label: 'reroute capacity', coefficients: [{ input: 'transits', times: 1 }], comparator: '<=', rhs: 29 }],
  parameters: { p: { low: 0.1, mid: 0.4, high: 0.7, source: 'declared band (SYNTHETIC)' } }, inputs: { transits: { kind: 'series_recent_mean', window_days: 28 } },
};
const pin = (family: PlannedEntry['family'], ref: string, declarations: Record<string, unknown>) => ({ method_ref: ref, method_key: ref.split('@')[0], version: 1, family,
  implementation_ref: { bayesian: 'bayesian-conjugate', causal: 'causal-its', optimisation: 'optimisation-lp' }[family as 'bayesian'],
  implementation_digest: IMPLEMENTATION_DIGESTS[{ bayesian: 'bayesian-conjugate', causal: 'causal-its', optimisation: 'optimisation-lp' }[family as 'bayesian']],
  parameters: {}, declarations, confidence_language: 'distribution' });
const target = (subject: string | null, version = 1): TargetRow => ({ target_key: 'corridor.transits.level', version, kind: 'quantity', unit: 'transits/day', title: 'corridor transits (SYNTHETIC)',
  definition: { series_key: 'syn', quantity: { aggregation: 'value' } }, sources: {}, subject_entity_id: subject, risk_class: 'standard' });
const run = (router: RegistryMethodRouter, p: Record<string, unknown> | null, t: TargetRow | null, horizonCode = '90d') =>
  router.run({ methodRef: String(p?.['method_ref'] ?? 'x@1'), points: ALL, steps: 90, season: 7, horizonCode, seriesKey: 'syn', seriesUnit: 'transits/day', subjectEntityId: null,
               pin: p, target: targetPlanPinOf(t) });

describe('B25-F1 · the router runs the PERSISTED pins only (no process state)', () => {
  it('REFUSAL: no pin, another implementation, a target definition that no longer digests as planned — each fails with its reason, never runs blind', () => {
    const r = new RegistryMethodRouter();
    expect(() => run(r, null, null, '1y')).toThrow(/the run's persisted plan pins no registry entry for it; the member is not run blind/);
    const p = pin('bayesian', 'bayes_daily@1', { prior: { ...NL, window_days: 1 }, alternatives: [{ label: 'x', prior: { ...NL, window_days: 1 } }] });
    expect(() => run(r, { ...p, implementation_digest: '0'.repeat(64) }, null, '1y')).toThrow(/implementation digest mismatch — the run's plan pinned bayesian-conjugate 000000000000…, this build carries/);
    const t = targetPlanPinOf(target(null))!;
    expect(() => r.run({ methodRef: 'bayes_daily@1', points: ALL, steps: 365, season: 7, horizonCode: '1y', seriesKey: 'syn', seriesUnit: 'transits/day', pin: p,
      target: { ...t, definition: { series_key: 'syn', edited: true } } })).toThrow(/no longer digests as planned \(target\.definition\); not run/);
    expect(t['definition_digest']).toBe(canonicalDigest(target(null).definition));
  });

  it('INTERLEAVING: run A (a target outside the causal entry\'s transport scope) and run B (the in-scope strait), in either order — A stays refused, B stays computed', () => {
    const r = new RegistryMethodRouter();
    const its = pin('causal', 'its_hormuz@1', ITS);
    const A = (): unknown => run(r, its, target(null)); const B = () => run(r, its, target(HORMUZ));
    expect(A).toThrow(/^forecast rejected \(transport\): its_hormuz@1's effect is declared transportable to/);
    const b = B();
    expect(b.semantics).toMatchObject({ meaning: 'effect', aggregation: 'effect:90d', uncertainty: 'effect_interval' });
    expect(A).toThrow(/^forecast rejected \(transport\)/);   // B in between changed nothing for A
    expect(B().quantiles).toEqual(b.quantiles);
  });

  it('RECOVERY: a fresh router (a restart) runs a persisted pin exactly as the first did', () => {
    const p = pin('bayesian', 'bayes_daily@1', { prior: { ...NL, window_days: 1 }, alternatives: [{ label: 'x', prior: { ...NL, window_days: 1, intercept: { mean: 60, sd: 40 } } }] });
    const a = run(new RegistryMethodRouter(), p, target(null), '1y'); const b = run(new RegistryMethodRouter(), p, target(null), '1y');
    expect(b.quantiles).toEqual(a.quantiles);
    expect(a.semantics).toEqual({ meaning: 'future_level', aggregation: 'value', unit: 'transits/day', uncertainty: 'predictive_distribution', statement: 'the 1-day mean ending at the target day' });
  });
});

describe('B25-F2 · each family states what its output means; only the question\'s meaning is combined', () => {
  const entry = (family: PlannedEntry['family'], declarations: Record<string, unknown>): PlannedEntry => ({ method_ref: `${family}_x@1`, method_key: `${family}_x`, version: 1, family,
    implementation_ref: 'x', implementation_digest: 'x', parameters: {}, declarations, confidence_language: 'distribution' });
  const base = { points: ALL, seriesKey: 'syn', seriesUnit: 'transits/day', seasonality: 7, originAt: '2023-12-31', kind: 'quantity' as const, target: null };
  const question = (questionOf(null, 'transits/day') as { question: ReturnType<typeof legacySemantics> }).question;

  it('the semantics of each family: a level (the day\'s value or a window mean), an effect, an objective\'s scenario band', () => {
    const daily = runFamily(entry('bayesian', { prior: { ...NL, window_days: 1 }, alternatives: [{ label: 'x', prior: { ...NL, window_days: 1 } }] }), { ...base, horizonCode: '1y', horizonDays: 365, targetAt: '2024-12-30' });
    const mean60 = runFamily(entry('bayesian', { prior: NL, alternatives: [{ label: 'x', prior: NL }] }), { ...base, horizonCode: '1y', horizonDays: 365, targetAt: '2024-12-30' });
    const effect = runFamily(entry('causal', { ...ITS, transport: { ...ITS.transport, scope: ['syn'] } }), { ...base, horizonCode: '90d', horizonDays: 90, targetAt: '2024-03-30' });
    const objective = runFamily(entry('optimisation', LP), { ...base, horizonCode: '30d', horizonDays: 30, targetAt: '2024-01-30' });
    expect([daily.semantics.meaning, daily.semantics.aggregation, daily.semantics.unit, daily.semantics.uncertainty]).toEqual(['future_level', 'value', 'transits/day', 'predictive_distribution']);
    expect([mean60.semantics.meaning, mean60.semantics.aggregation]).toEqual(['future_level', 'window_mean:60d']);
    expect([effect.semantics.meaning, effect.semantics.aggregation, effect.semantics.uncertainty]).toEqual(['effect', 'effect:90d', 'effect_interval']);
    expect([objective.semantics.meaning, objective.semantics.unit, objective.semantics.uncertainty]).toEqual(['objective_value', 'EUR', 'scenario_band']);
    // all four carry q10/q50/q90 — only the semantics tell them apart
    for (const r of [daily, mean60, effect, objective]) expect(Object.keys(r.quantiles).sort()).toEqual(['q10', 'q50', 'q90']);
    // THE RULE against the run's question (the series' value, transits/day, a predictive distribution)
    expect(incompatibility(question, legacySemantics('transits/day'))).toBeNull();
    expect(incompatibility(question, daily.semantics)).toBeNull();
    expect(incompatibility(question, mean60.semantics)).toBe('aggregation window_mean:60d ≠ value');
    expect(incompatibility(question, effect.semantics)).toBe('meaning effect ≠ future_level; aggregation effect:90d ≠ value; uncertainty effect_interval ≠ predictive_distribution');
    expect(incompatibility(question, objective.semantics)).toBe('meaning objective_value ≠ future_level; aggregation objective ≠ value; unit EUR ≠ transits/day; uncertainty scenario_band ≠ predictive_distribution');
    expect(incompatibility(question, null)).toMatch(/declares no semantics .* never assumed compatible/);
  });

  it('the question: the series\' value by default; a quantity target\'s unit and declared aggregation; an effect or objective target is refused', () => {
    expect(describeQuestion(question)).toBe('a future level (value) in transits/day, a predictive distribution');
    const q = (definition: Record<string, unknown>, unit = 'transits/day') => questionOf({ target_key: 't', version: 2, kind: 'quantity', unit, definition }, 'transits/day');
    expect(q({ series_key: 'syn' })).toEqual({ question: { ...question } });
    expect(q({ series_key: 'syn' }, 'EUR')).toMatchObject({ question: { unit: 'EUR', aggregation: 'value' } });
    expect(q({ series_key: 'syn', quantity: { aggregation: 'window_mean', window_days: 60 } })).toMatchObject({ question: { aggregation: 'window_mean:60d' } });
    expect(q({ series_key: 'syn', quantity: { aggregation: 'window_mean' } })).toMatchObject({ question: { aggregation: 'window_mean:undeclared' } });
    expect(q({ series_key: 'syn', quantity: { aggregation: 'effect' } })).toEqual({ refused: expect.stringMatching(/^target t v2 declares its quantity as "effect"; the ensemble manager combines predictive distributions of a future level only/) });
    expect(q({ series_key: 'syn', quantity: { aggregation: 'objective' } })).toEqual({ refused: expect.stringMatching(/declares its quantity as "objective"/) });
    // an EVENT target (its kind decides the plan; the members' kind exclusion applies) asks nothing of the unit: the series' own
    expect(questionOf({ target_key: 'e', version: 1, kind: 'event', unit: 'probability', definition: {} }, 'transits/day')).toEqual({ question });
  });
});
