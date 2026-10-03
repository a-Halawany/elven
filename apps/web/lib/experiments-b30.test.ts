import { describe, expect, it } from 'vitest';
import { actionLine, convergenceLine, healthLine, interactionLine, parseValues, policyText, reachLine, retirementLine, sweepFactorLine, tailLine, validationLine, type Retirement, type Validation } from './experiments-b30';

/** CP-6 B30 §EX (0103): the method-fabric page WORDS the server's record — it never judges stability, finds a threshold or computes a distance. SYNTHETIC. */
describe('the method-fabric experiments are worded, never judged on the client', () => {
  it('the policy, the adapter health and the checkpoint actions are the server\'s', () => {
    expect(policyText('stop')).toMatch(/^STOP — an unstable checkpoint stops the experiment/);
    expect(policyText('none')).toMatch(/not acted on/);
    expect(healthLine(null, { isolated: false })).toBe('◇ IN PROCESS — not contained; never quarantined');
    expect(healthLine(null, { isolated: true })).toBe('● HEALTHY — never faulted in this domain');
    expect(healthLine({ state: 'quarantined', quarantined_at: '2026-10-02T10:00:00Z', last_fault: { kind: 'unstable', message: 'the running mean diverged' }, reinstated_at: null }, { isolated: true }))
      .toBe('⊘ QUARANTINED since 2026-10-02T10:00:00Z — unstable: the running mean diverged');
    expect(actionLine({ event: 'stopped_unstable', details: { seq: 1, quarantined: true, reading: { reasons: ['numerical_stability: total_cost is unstable'] } } }))
      .toBe('STOPPED at checkpoint 1 (its adapter quarantined) — numerical_stability: total_cost is unstable');
    expect(actionLine({ event: 'review_routed', details: { seq: 2, actions: ['paused'] } })).toBe('review routed at checkpoint 2 to the declarer and the method stewards (paused)');
    expect(actionLine({ event: 'policy_set', details: { on_unstable: 'pause', previous: 'none', reason: 'review each wobble' } })).toBe('policy set to PAUSE (was none) — review each wobble');
    expect(actionLine({ event: 'something_else', details: {} })).toBe('something else');
  });
  it('a retirement names its reason, its superseding run and its reach', () => {
    const r: Retirement = { retirement_id: 'r', subject_kind: 'run', run_id: '0190f3e2-aaaa-7000-8000-000000000001', experiment_id: null, reason: 'superseded by the corrected control',
      superseded_by: '0190f3e2-bbbb-7000-8000-000000000002', reach: { counts: { packages: 1, analyses: 2, dependent_runs: 2 } }, notified: [{ package_id: 'p', owner: 'o', attention_item_id: 'i' }],
      retired_by: 'x', retired_at: 'y' };
    expect(retirementLine(r)).toBe('run 0190f3e2…000001 retired — “superseded by the corrected control” · superseded by run 0190f3e2…000002 · 1 package(s) citing it · 2 analysis record(s) resting on it · 2 run(s) comparing against it or correcting it · 1 package owner(s) told');
    expect(reachLine(null)).toBe('no reach recorded');
  });
  it('a sweep\'s factor and interaction, as recorded', () => {
    expect(sweepFactorLine({ key: 'corridor_delay_days', field: 'corridor_delay_days', range: [0, 60], base_value: 14, grid: [], slopes: [], nonlinearity: 0.42, nonlinear: true, curvature: 1,
      response: 'nonlinear', thresholds: [{ kind: 'onset', at: 20, between: [10, 30], slope_before: 0, slope_after: 2.1 }] }))
      .toBe('corridor_delay_days over [0, 60]: NONLINEAR — nonlinearity 42.0% of the span · curvature 100.0% of the steepest slope — ONSET at 20 (slope 0 → 2.1)');
    expect(sweepFactorLine({ key: 'h', field: 'h', range: [1, 2], base_value: 1, grid: [], slopes: [], nonlinearity: 0, nonlinear: false, curvature: 0, response: 'flat', thresholds: [] }))
      .toBe('h over [1, 2]: FLAT — the metric does not move across the envelope — no threshold');
    expect(interactionLine({ factors: ['a', 'b'], corners: { ll: 0, lh: 0, hl: 0, hh: 100 }, main_a: 50, main_b: 50, interaction: 100, relative: 2, hidden_dependency: true }))
      .toBe('a × b: interaction 100 (200.0% of the larger main effect) — HIDDEN DEPENDENCY');
  });
  it('a validation\'s verdict, tail and convergence, as recorded', () => {
    const v = { verdict: 'discrepant', run_paths: 400, benchmark_n: 40, benchmark_kind: 'observed', measure: 'total_cost',
      discrepancy: { run_mean: 10, benchmark_mean: 12, bias: -2, relative_bias: -0.1667, ks: 0.31, ks_critical: 0.226, band: [5, 15], coverage_in_band: 0.85 },
      tail: { threshold: 20, threshold_basis: 'declared', run_frequency: 0, benchmark_frequency: 0.1, ratio: 0, run_tail_paths: 0, expected_tail_paths: 40, verdict: 'under_represented' },
      convergence: { checkpoints: [{ paths: 400, mean: 10, relative_change: 0.001, relative_half_width: 0.01 }], converged_at: 280, verdict: 'converged' } } as unknown as Validation;
    expect(validationLine(v)).toBe('DISCREPANT — 400 path(s) against 40 observed value(s) of total_cost: bias -2 (-16.7%); KS 0.31 > 0.226 (5%); 85.0% of the sample inside the run\'s p05–p95 band');
    expect(tailLine(v.tail)).toBe('rare events at ≥ 20 (declared): the run 0.0% (0 path(s)), the sample 10.0% — UNDER REPRESENTED');
    expect(convergenceLine(v.convergence)).toBe('convergence: CONVERGED from 280 paths — running mean 10 over 400 paths, 95% half-width 1.0% of the mean');
    expect(convergenceLine({ checkpoints: [], converged_at: null, verdict: 'not_applicable' })).toMatch(/not applicable/);
  });
  it('the sample is numbers or nothing', () => {
    expect(parseValues('1, 2 3;4\n5')).toEqual([1, 2, 3, 4, 5]);
    expect(parseValues('1, x')).toBeNull();
    expect(parseValues('  ')).toBeNull();
  });
});
