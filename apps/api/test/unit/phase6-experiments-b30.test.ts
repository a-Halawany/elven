/**
 * CP-6 B30 part `experiments` (0103 §EX) — the pure logic: the fabric chunk's per-path stream (deterministic per seed offset, independent
 * of the chunking, the projection fabric-measures@1), the checkpoint reading sxp-unstable@1, the envelope sweep sxp-sweep@1 (grid,
 * nonlinearity, curvature, thresholds, interactions — on the NORDWERK-like corridor contract), the benchmark validation sxp-benchmark@1
 * (KS, tail, convergence, verdict), the fabric experiment's declaration, and every new refusal text mapped to its status. SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { SupplyFlowParams, SupplyFlowOptions, Intervention } from '../../src/twin/models/supply-flow.js';
import { xoshiro128ss } from '../../src/twin/models/supply-flow.js';
import { builtinMethod } from '../../src/twin/methods/builtin.js';
import { BEARING, FAMILY_ELEMENTS, FAMILY_PARAMS, LINE_ELEMENTS } from '../int/phase6-methods-fixtures.js';
import {
  FABRIC_CHUNKABLE, assembleFabricOutputs, digestOfJson, fabricChunkPaths, fabricMeasures, fabricPathsInOrder, pathSeed, projectPath, unstableReading,
} from '../../src/twin/simulations/fabric/fabric-plan.js';
import { analyseResponse, envelopeSweep, gridOf, interactionOf, sweepFactors } from '../../src/twin/simulations/fabric/sweep-core.js';
import { benchmarkValidation, convergenceOf, ksDistance, quantile, tailOf, verdictOf, discrepancyOf } from '../../src/twin/simulations/fabric/benchmark-core.js';
import { runValuesOf, validateBenchmarkIntake, validateSweepIntake } from '../../src/twin/simulations/fabric/fabric.service.js';
import { CHUNKABLE_METHODS, validateExperimentIntake } from '../../src/twin/simulations/orchestration/experiment-plan.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import type { MethodInput } from '../../src/twin/methods/types.js';

/** The NORDWERK corridor fixture (SYNTHETIC; phase5-supply-flow's). */
const P: SupplyFlowParams = {
  component: 'SYN-PART-MAG', t0: '2024-01-11', on_hand: 63400, safety_stock: 40000, weekly_consumption: 9200,
  shipments: [
    { id: 'SYN-SHIP-4471', qty: 38400, eta_port: '2024-01-29', position: 'Approaching Bab el-Mandeb', status: 'at risk' },
    { id: 'SYN-SHIP-4472', qty: 41000, eta_port: '2024-02-08', position: 'Malacca Strait', status: 'reroutable' },
    { id: 'SYN-SHIP-4475', qty: 39200, eta_port: '2024-02-22', position: 'Ningbo', status: 'bookable' },
  ],
  inland_days: 14, reroute_delay_days: 11, reroute_cost_per_container: 1850, units_per_container: 1600, air_cost_per_kg: 19.4,
  kg_per_unit: 4100 / 9200, air_lead_days: 7, line_stop_cost_per_day: 142000, corridor_delay_days: 14, production_policy: 'hold_safety_stock',
};
const DET: SupplyFlowOptions = { horizon_days: 90, shock: true, stochastic: { mode: 'deterministic' } };
const NONE: Intervention[] = [{ type: 'none' }];
const ENVELOPE = { horizon_days: [1, 365], corridor_delay_days: [0, 60], 'consumption.weekly': [0, 100000] };
const TWIN = '0190f3e2-aaaa-7000-8000-000000000001';
const status = (f: () => unknown): number | null => { try { f(); return null; } catch (e) { return e instanceof HttpException ? e.getStatus() : -1; } };
const map = (code: string, message: string): number | null => asObservationRefusal(Object.assign(new Error(message), { code }), 'c')?.getStatus() ?? null;

/** A fabric method's input over the Regensburg-like elements (SYNTHETIC), as methodInputOf builds it from a stored run. */
const inputOf = (family: string, over: Record<string, unknown> = {}): MethodInput => {
  const f = FAMILY_PARAMS[family]!;
  return { modelRef: f.modelRef, params: { ...f.params, component: BEARING, ...over }, elements: [...LINE_ELEMENTS, ...FAMILY_ELEMENTS], horizonDays: f.horizonDays, seed: 31 };
};

describe('B30 §EX.2 · a fabric chunk is a seeded per-path stream — deterministic per seed offset', () => {
  it('the chunkable list: supply-flow@1 and the three seeded fabric methods (system dynamics and optimisation draw nothing; agent-based projects no measure)', () => {
    expect([...CHUNKABLE_METHODS]).toEqual(['supply-flow@1', 'discrete-event@1', 'counterfactual@1', 'war-gaming@1']);
    expect([...FABRIC_CHUNKABLE]).toEqual(['discrete-event@1', 'counterfactual@1', 'war-gaming@1']);
    expect(fabricMeasures('discrete-event@1')).toEqual(['line_stop_days']);
    expect(fabricMeasures('war-gaming@1')).toEqual(['total_cost']);
    expect(fabricMeasures('agent-based@1')).toEqual([]);
  });
  it('path s is seeded with supply-flow@1\'s per-path seed seed ^ imul(s + 1, 0x9e3779b1)', () => {
    expect(pathSeed(31, 0)).toBe((31 ^ Math.imul(1, 0x9e3779b1)) >>> 0);
    expect(pathSeed(31, 7)).toBe((31 ^ Math.imul(8, 0x9e3779b1)) >>> 0);
    expect(new Set(Array.from({ length: 50 }, (_, s) => pathSeed(31, s))).size).toBe(50);
    expect(xoshiro128ss(pathSeed(31, 3))()).toBe(xoshiro128ss(pathSeed(31, 3))());
  });
  it('a chunk is the same paths whatever the chunking, and the same chunk twice is the same digest (discrete-event@1, its cycle-time variation drawn)', () => {
    const des = builtinMethod('discrete-event@1')!.adapter;
    const base = inputOf('discrete-event', { start_date: '2026-10-05' });
    const whole = fabricChunkPaths(des, { ...base, horizonDays: 14 }, 31, 0, 6, 6);
    const parts = [...fabricChunkPaths(des, { ...base, horizonDays: 14 }, 31, 0, 2, 6), ...fabricChunkPaths(des, { ...base, horizonDays: 14 }, 31, 2, 4, 6)];
    expect(parts).toEqual(whole);
    expect(digestOfJson(fabricChunkPaths(des, { ...base, horizonDays: 14 }, 31, 2, 4, 6))).toBe(digestOfJson(whole.slice(2)));
    expect(whole.map((p) => p.path)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(whole.every((p) => typeof p.line_stop_days === 'number' && p.cost === undefined)).toBe(true);
    // the paths differ from one another (the seeded stream is drawn): at least two distinct outputs
    expect(new Set(whole.map((p) => JSON.stringify(p.summary))).size).toBeGreaterThan(1);
    expect(() => fabricChunkPaths(des, base, 31, 5, 3, 6)).toThrow(/outside the contract/);
  });
  it('war-gaming@1 with a random adversary projects total_cost = residual + response cost (k€); counterfactual@1 its do-world stop days', () => {
    const wg = builtinMethod('war-gaming@1')!.adapter;
    const paths = fabricChunkPaths(wg, inputOf('war-gaming', { adversary: 'random' }), 7, 0, 20, 20);
    expect(paths.every((p) => typeof p.cost?.total === 'number' && p.line_stop_days === undefined)).toBe(true);
    const p0 = paths[0]!;
    expect(p0.cost!.total).toBeCloseTo(Number(p0.summary['total_residual']) + Number(p0.summary['response_cost']), 6);
    expect(new Set(paths.map((p) => p.cost!.total)).size).toBeGreaterThan(1);
    const cf = builtinMethod('counterfactual@1')!.adapter;
    const cp = fabricChunkPaths(cf, inputOf('counterfactual', { noise: 0.2 }), 7, 0, 3, 3);
    expect(cp.every((p) => p.line_stop_days === Number(p.summary['do_stop_days']))).toBe(true);
    expect(projectPath('agent-based@1', 0, 1, {})).toEqual({ error: 'agent-based@1 is not a chunkable fabric method' });
    expect(projectPath('war-gaming@1', 0, 1, { total_residual: 'x' })).toMatchObject({ error: expect.stringMatching(/no finite/) });
  });
  it('the run\'s outputs are assembled from the chunks in path order; an altered chunk is refused', () => {
    const wg = builtinMethod('war-gaming@1')!.adapter;
    const all = fabricChunkPaths(wg, inputOf('war-gaming', { adversary: 'random' }), 7, 0, 10, 10);
    const chunks = [{ chunk_index: 1, first_path: 5, paths: 5, digest: digestOfJson(all.slice(5)), sample_totals: all.slice(5) },
                    { chunk_index: 0, first_path: 0, paths: 5, digest: digestOfJson(all.slice(0, 5)), sample_totals: all.slice(0, 5) }];
    const { paths, indexes } = fabricPathsInOrder(chunks);
    expect(indexes).toEqual([0, 1]);
    expect(paths).toEqual(all);
    const o = assembleFabricOutputs('war-gaming@1', BEARING, 7, paths, ['total_cost']);
    expect((o['stochastic'] as Record<string, unknown>)['samples']).toBe(10);
    expect(((o['stochastic'] as Record<string, unknown>)['sample_totals'] as unknown[]).length).toBe(10);
    expect(o['projection']).toEqual([{ measure: 'total_cost', from: 'summary.total_residual + summary.response_cost', unit: 'k€' }]);
    expect(runValuesOf(o, 'total_cost')).toEqual(all.map((p) => p.cost!.total));
    expect(() => fabricPathsInOrder([{ ...chunks[0]!, sample_totals: all.slice(0, 5) }])).toThrow(/no longer have the digest/);
  });
});

describe('B30 §EX.3 · the checkpoint reading sxp-unstable@1 (the port\'s rule mirrored)', () => {
  it('stable and indeterminate are not acted on; unstable is; a violated or indeterminate constraint is', () => {
    expect(unstableReading({ total_cost: { state: 'stable', change_since_previous: 0.01, n: 500 } }, { outcome: 'satisfied' }, null)).toMatchObject({ acted: false, faultShaped: false });
    expect(unstableReading({ total_cost: { state: 'indeterminate', n: 10 } }, null, null)).toMatchObject({ acted: false });
    expect(unstableReading({ total_cost: { state: 'unstable', change_since_previous: 0.04, n: 100 } }, null, { total_cost: { n: 50 } })).toMatchObject({ acted: true, unstable: ['total_cost'], faultShaped: false });
    expect(unstableReading({}, { outcome: 'violated' }, null)).toMatchObject({ acted: true, constraint: 'violated' });
    expect(unstableReading({}, { outcome: 'indeterminate' }, null)).toMatchObject({ acted: true, constraint: 'indeterminate' });
  });
  it('FAULT-SHAPED: the mean moved more than half since a previous checkpoint of 30 paths or more', () => {
    expect(unstableReading({ line_stop_days: { state: 'unstable', change_since_previous: 0.8, n: 100 } }, null, { line_stop_days: { n: 50 } })).toMatchObject({ faultShaped: true, divergence: ['line_stop_days'] });
    expect(unstableReading({ line_stop_days: { state: 'unstable', change_since_previous: 0.8, n: 40 } }, null, { line_stop_days: { n: 20 } })).toMatchObject({ faultShaped: false });
    expect(unstableReading({ line_stop_days: { state: 'unstable', change_since_previous: 0.5, n: 100 } }, null, { line_stop_days: { n: 50 } })).toMatchObject({ faultShaped: false });
  });
});

describe('B30 §EX.5 · nonlinear response across the envelope (sxp-sweep@1)', () => {
  it('the grid runs from the low to the high bound; whole days stay whole; a grid that would repeat a value is refused', () => {
    expect(gridOf({ key: 'corridor_delay_days', range: [0, 60], whole: true }, 5)).toEqual([0, 15, 30, 45, 60]);
    expect(gridOf({ key: 'corridor_delay_days', range: [0, 60], whole: true }, 9)).toEqual([0, 8, 15, 23, 30, 38, 45, 53, 60]);
    expect(gridOf({ key: 'x', range: [0, 1], whole: false }, 3)).toEqual([0, 0.5, 1]);
    expect(() => gridOf({ key: 'd', range: [0, 3], whole: true }, 9)).toThrow(/repeats a value/);
    expect(() => gridOf({ key: 'd', range: [0, 3], whole: true }, 2)).toThrow(/3 to 25/);
  });
  it('a straight response is linear; a hockey stick has an ONSET threshold and is nonlinear; a flat one is flat', () => {
    const lin = analyseResponse([0, 1, 2, 3, 4], [0, 2, 4, 6, 8]);
    expect(lin).toMatchObject({ nonlinearity: 0, nonlinear: false, curvature: 0, response: 'linear', thresholds: [] });
    const hockey = analyseResponse([0, 10, 20, 30, 40], [0, 0, 0, 50, 100]);
    expect(hockey.nonlinear).toBe(true);
    expect(hockey.response).toBe('nonlinear');
    expect(hockey.thresholds).toEqual([{ kind: 'onset', at: 20, between: [10, 30], slope_before: 0, slope_after: 5 }]);
    const sat = analyseResponse([0, 1, 2, 3], [0, 10, 10, 10]);
    expect(sat.thresholds.map((t) => t.kind)).toEqual(['saturation']);
    expect(analyseResponse([0, 1, 2], [5, 5, 5])).toMatchObject({ response: 'flat', nonlinearity: 0, thresholds: [] });
  });
  it('an additive pair has no interaction; a multiplicative one is a HIDDEN DEPENDENCY', () => {
    expect(interactionOf('a', 'b', { ll: 0, lh: 10, hl: 5, hh: 15 })).toMatchObject({ interaction: 0, relative: 0, hidden_dependency: false, main_a: 5, main_b: 10 });
    expect(interactionOf('a', 'b', { ll: 0, lh: 0, hl: 0, hh: 100 })).toMatchObject({ interaction: 100, main_a: 50, main_b: 50, relative: 2, hidden_dependency: true });
    expect(interactionOf('a', 'b', { ll: 3, lh: 3, hl: 3, hh: 3 })).toMatchObject({ interaction: 0, relative: 0, hidden_dependency: false });
  });
  it('the corridor contract swept across supply-flow@1\'s envelope: three factors, the delay\'s line-stop onset, the delay × consumption dependency', () => {
    expect(sweepFactors(P, DET, ENVELOPE).map((f) => [f.key, f.field, f.whole])).toEqual([
      ['consumption.weekly', 'weekly_consumption', false], ['corridor_delay_days', 'corridor_delay_days', true], ['horizon_days', 'horizon_days', true]]);
    const s = envelopeSweep({ params: P, options: DET, interventions: NONE, envelope: ENVELOPE, metric: 'line_stop_days', points: 7 });
    expect(s.factors).toHaveLength(3);
    expect(s.interactions.map((i) => i.factors)).toEqual([['consumption.weekly', 'corridor_delay_days'], ['consumption.weekly', 'horizon_days'], ['corridor_delay_days', 'horizon_days']]);
    const delay = s.factors.find((f) => f.key === 'corridor_delay_days')!;
    expect(delay.grid.map((g) => g.value)).toEqual([0, 10, 20, 30, 40, 50, 60]);
    expect(delay.grid[0]!.metric).toBeLessThanOrEqual(delay.grid[6]!.metric);
    expect(delay.response).not.toBe('flat');
    const delayConsumption = s.interactions.find((i) => i.factors.join() === 'consumption.weekly,corridor_delay_days')!;
    expect(delayConsumption.interaction).toBe(Math.round((delayConsumption.corners.hh - delayConsumption.corners.hl - delayConsumption.corners.lh + delayConsumption.corners.ll) * 1e6) / 1e6);
    // deterministic: the same sweep twice is the same numbers
    expect(envelopeSweep({ params: P, options: DET, interventions: NONE, envelope: ENVELOPE, metric: 'line_stop_days', points: 7 })).toEqual(s);
  });
  it('the intake: metric and grid points', () => {
    expect(validateSweepIntake({}, 'c')).toEqual({ metric: 'total_cost', gridPoints: 9 });
    expect(status(() => validateSweepIntake({ metric: 'revenue' }, 'c'))).toBe(422);
    expect(status(() => validateSweepIntake({ gridPoints: 2 }, 'c'))).toBe(422);
  });
});

describe('B30 §EX.6 · rare events, model discrepancy, benchmark validation, convergence (sxp-benchmark@1)', () => {
  it('the KS distance is the largest gap of the empirical distribution functions', () => {
    expect(ksDistance([1, 2, 3], [1, 2, 3])).toBe(0);
    expect(ksDistance([1, 2, 3, 4], [5, 6, 7, 8])).toBe(1);
    expect(ksDistance([1, 2, 3, 4], [3, 4, 5, 6])).toBe(0.5);
    expect(quantile([1, 2, 3, 4, 5], 0.95)).toBeCloseTo(4.8, 10);
  });
  it('the discrepancy, the tail and the verdict: consistent, discrepant (bias, KS), under-represented tail, insufficient', () => {
    const run = Array.from({ length: 200 }, (_, i) => i % 20);
    const same = Array.from({ length: 40 }, (_, i) => i % 20);
    const d = discrepancyOf(run, same);
    expect(d).toMatchObject({ run_paths: 200, benchmark_n: 40, run_mean: 9.5, benchmark_mean: 9.5, bias: 0, relative_bias: 0, ks: 0 });
    const t = tailOf(run, same, null);
    expect(t.verdict).toBe('covered');
    expect(verdictOf(d, t, true, 0.1)).toBe('consistent');
    const shifted = same.map((x) => x + 10);
    expect(benchmarkValidation(run, true, shifted, 0.1, null).verdict).toBe('discrepant');
    // the observed tail (≥ 40) is reached by 1 in 10 observations, by no path of the run: UNDER-represented rare events
    const heavy = [...Array.from({ length: 36 }, (_, i) => i % 20), 40, 45, 50, 60];
    const tail = tailOf(run, heavy, 40);
    expect(tail).toMatchObject({ threshold: 40, run_frequency: 0, benchmark_frequency: 0.1, verdict: 'under_represented', run_tail_paths: 0, expected_tail_paths: 20 });
    expect(benchmarkValidation(run, true, [1, 2, 3], 0.1, null).verdict).toBe('insufficient');
    expect(benchmarkValidation(run.slice(0, 20), true, same, 0.1, null).verdict).toBe('insufficient');
    expect(tailOf([1, 2, 3], [1, 2, 3, 4, 100], 50).verdict).toBe('insufficient_paths');
  });
  it('convergence outside an experiment: the running mean at every tenth of the paths; converged once the last three moved ≤ 1% with a tight half-width', () => {
    const steady = Array.from({ length: 1000 }, (_, i) => 100 + ((i * 7919) % 11) - 5);
    const c = convergenceOf(steady);
    expect(c.checkpoints).toHaveLength(10);
    expect(c.checkpoints[9]!.paths).toBe(1000);
    expect(c.verdict).toBe('converged');
    expect(c.converged_at).not.toBeNull();
    const drifting = Array.from({ length: 100 }, (_, i) => i * i);
    expect(convergenceOf(drifting).verdict).toBe('not_converged');
    expect(convergenceOf([42])).toMatchObject({ verdict: 'not_applicable', checkpoints: [{ paths: 1, mean: 42 }] });
  });
  it('the intake', () => {
    expect(validateBenchmarkIntake({ measure: 'line_stop_days', kind: 'observed', values: [1, 2], basis: 'the 2024 disruption log (SYNTHETIC)' }, 'c'))
      .toMatchObject({ tolerance: 0.1, tailThreshold: null, citations: [] });
    for (const bad of [{ measure: 'revenue', kind: 'observed', values: [1] }, { measure: 'line_stop_days', kind: 'guess', values: [1] }, { measure: 'line_stop_days', kind: 'observed', values: [] },
                       { measure: 'line_stop_days', kind: 'observed', values: ['x'] }, { measure: 'line_stop_days', kind: 'observed', values: [1], tolerance: 2 }]) {
      expect(status(() => validateBenchmarkIntake(bad, 'c')), JSON.stringify(bad)).toBe(422);
    }
  });
});

describe('B30 §EX.2 · the fabric experiment\'s declaration', () => {
  const intake = (over: Record<string, unknown> = {}, run: Record<string, unknown> = {}) => ({
    title: 'Line study — 60 paths (SYNTHETIC)', question: 'How many line-stop days does the bearing shortage cost across cycle-time variation?',
    run: { twinId: TWIN, twinVersion: 1, runKind: 'control', controlRunId: null, shock: false, component: BEARING, interventions: [{ type: 'none' }], horizonDays: 42,
           modelRef: 'discrete-event@1', params: { start_date: '2026-10-05' }, ...run },
    paths: 60, chunkSize: 20, seed: 31, budget: { max_paths: 60, max_wall_seconds: 120, max_chunks: 6 }, ...over,
  });
  it('a chunkable fabric method declares its params; its jitter defaults to { "0": 1 } and its measures to those it projects', () => {
    const x = validateExperimentIntake(intake(), 'c');
    expect(x).toMatchObject({ methodRef: 'discrete-event@1', jitter: { '0': 1 }, measures: ['line_stop_days'] });
  });
  it('refused: a measure the method does not project; params of a method that is not chunkable; a fabric run without params', () => {
    expect(status(() => validateExperimentIntake(intake({ measures: ['total_cost'] }), 'c'))).toBe(422);
    expect(status(() => validateExperimentIntake(intake({}, { modelRef: 'system-dynamics@1' }), 'c'))).toBe(422);
    expect(status(() => validateExperimentIntake(intake({}, { params: undefined }), 'c'))).toBe(422);
    // B31's refusal stands: a contract with params and no fabric model reference
    expect(status(() => validateExperimentIntake(intake({}, { modelRef: undefined }), 'c'))).toBe(422);
  });
});

describe('B30 §EX · the refusal texts mapped (403 · 404 · 409 · 422)', () => {
  it('retirement, adapter quarantine, envelope sweep, benchmark validation, the retired control', () => {
    expect(map('42501', 'retirement rejected (actor): recorded by the acting principal')).toBe(403);
    expect(map('42501', 'retirement rejected (authority): a run is retired by its operator, its twin\'s owner, a twin owner or the domain administrator')).toBe(403);
    expect(map('23503', 'retirement rejected (unknown_run): x is not a simulation run of this domain')).toBe(404);
    expect(map('23503', 'retirement rejected (unknown_superseding_run): x is not a simulation run of this domain')).toBe(404);
    expect(map('2F002', 'retirement rejected (state): run x was retired at 2026-10-02 (superseded); a retirement is recorded once')).toBe(409);
    expect(map('22023', 'retirement rejected (reason): a retirement says why, in at least 8 characters')).toBe(422);
    expect(map('22023', 'retirement rejected (superseded_by): run x is not a completed, valid, unretired run other than the one retired (it is partial)')).toBe(422);
    expect(map('42501', 'adapter quarantine rejected (authority): an adapter is quarantined on demand by a named, active human')).toBe(403);
    expect(map('23503', 'adapter quarantine rejected (unknown_model): no behaviour model x@1 is registered')).toBe(404);
    expect(map('2F002', 'adapter quarantine rejected (state): the adapter of discrete-event@1 is already quarantined in this domain since 2026-10-02')).toBe(409);
    expect(map('22023', 'adapter quarantine rejected (not_contained): supply-flow@1 runs in process (containment.isolated false); only a contained adapter is quarantined')).toBe(422);
    expect(map('42501', 'envelope sweep rejected (actor): a sweep is requested by the acting principal')).toBe(403);
    expect(map('23503', 'envelope sweep rejected (unknown_run): x is not a simulation run of this domain')).toBe(404);
    expect(map('22023', 'envelope sweep rejected (state): run x is partial; only a completed run is analysed (a partial run is diagnostic only)')).toBe(409);
    expect(map('22023', 'envelope sweep rejected (stale): the analysis was computed over outputs a and run x holds b')).toBe(409);
    expect(map('22023', 'envelope sweep rejected (factors): corridor_delay_days states a nonlinearity of 0.1, its grid makes 0.2')).toBe(422);
    expect(map('22023', 'envelope sweep rejected (method): rule sxp-sweep@1 sweeps supply-flow@1\'s deterministic trajectory; run x is discrete-event@1')).toBe(422);
    expect(map('42501', 'benchmark validation rejected (actor): a validation is requested by the acting principal')).toBe(403);
    expect(map('23503', 'benchmark validation rejected (unknown_citation): evidence x version 1 is not an object of this tenant')).toBe(404);
    expect(map('22023', 'benchmark validation rejected (state): run x was retired at 2026-10-02 (superseded); a retired result is not validated')).toBe(409);
    expect(map('22023', 'benchmark validation rejected (discrepancy): bias is stated 1, the run\'s paths and the sample make 2')).toBe(422);
    expect(map('22023', 'run rejected (retired_control): control run x was retired at 2026-10-02 (superseded); an intervention is compared against a control that is not retired')).toBe(409);
    expect(map('22023', 'impact analysis rejected (state): run x was retired at 2026-10-02 (superseded); a retired result is not analysed — analyse the run that supersedes it')).toBe(409);
    expect(map('2F002', 'experiment rejected (state): experiment x is approved; its unstable-checkpoint policy is set while it is declared, before its budget is approved')).toBe(409);
    expect(map('22023', 'experiment rejected (policy): the unstable-checkpoint policy is stop, pause or none (not halt)')).toBe(422);
  });
});
