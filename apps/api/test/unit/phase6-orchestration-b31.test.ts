/**
 * CP-6 B31 part O (0099 §O) — the experiment's pure logic: the declaration's shape, the chunk plan, the EXACTNESS of a chunk (its paths are
 * the single execution's — the seeded stream is indexed by the path's global index), the assembly of the run's outputs from the chunks
 * (over every path: the single execution's digest; over the completed chunks: the partial run's aggregate), a chunk whose paths no longer
 * have their recorded digest refused; and every refusal text of the `experiment rejected (<class>)` family mapped to its status. SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { simulateSupplyFlow, type SupplyFlowParams, type SupplyFlowOptions, type Intervention } from '../../src/twin/models/supply-flow.js';
import { assembleOutputs, chunkPlan, chunkSampleTotals, digestOfJson, pathsInOrder, runIntakeOf, validateExperimentIntake } from '../../src/twin/simulations/orchestration/experiment-plan.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

/** The NORDWERK fixture (SYNTHETIC; phase5-supply-flow's). */
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
const seeded = (samples: number): SupplyFlowOptions => ({ horizon_days: 90, shock: true, stochastic: { mode: 'seeded', seed: 31, samples, jitter: { '0': 0.5, '3': 0.3, '7': 0.2 } } });
const NONE: Intervention[] = [{ type: 'none' }];
const TWIN = '0190f3e2-aaaa-7000-8000-000000000001';
const intake = (over: Record<string, unknown> = {}) => ({
  title: 'Corridor closure (SYNTHETIC)', question: 'How many line-stop days across jitter?',
  run: { twinId: TWIN, twinVersion: 1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90 },
  paths: 1000, chunkSize: 250, seed: 31, jitter: { '0': 0.5, '3': 0.3, '7': 0.2 }, budget: { max_paths: 1000, max_wall_seconds: 60, max_chunks: 6 }, ...over,
});
const status = (f: () => unknown): number | null => { try { f(); return null; } catch (e) { return e instanceof HttpException ? e.getStatus() : -1; } };

describe('the experiment declaration (its shape; the port decides the rest)', () => {
  it('accepts a seeded control contract and answers its parts', () => {
    const x = validateExperimentIntake(intake(), 'c');
    expect(x).toMatchObject({ twinId: TWIN, twinVersion: 1, paths: 1000, chunkSize: 250, seed: 31, measures: ['total_cost', 'line_stop_days'], pace: { chunks_per_tick: 1 }, stopConditions: { converged: null } });
  });
  it('refuses paths beyond the model, a chunk larger than the paths, an unseeded or unjittered experiment, a stochastic block in the contract, a method-fabric contract, a bad measure', () => {
    for (const over of [{ paths: 20_000 }, { chunkSize: 2000 }, { seed: 1.5 }, { jitter: {} }, { jitter: { '0': 0.4 } }, { jitter: { x: 1 } }, { measures: ['revenue'] },
                        { run: { ...intake().run, stochastic: { mode: 'deterministic' } } }, { run: { ...intake().run, params: { a: 1 } } }, { budget: { max_paths: 1 } }, { title: 'ab' }, { question: 'why' },
                        { stopConditions: { converged: { measure: 'total_cost' } } }, { pace: { chunks_per_tick: 0 } }]) {
      expect(status(() => validateExperimentIntake(intake(over), 'c')), JSON.stringify(over)).toBe(422);
    }
  });
  it('the run is opened with the experiment\'s stochastic block: seeded, the seed, samples = the paths, the jitter', () => {
    expect(runIntakeOf({ run_intake: { runKind: 'control', interventions: [{ type: 'none' }] }, twin_id: TWIN, twin_version: 2, scenario_id: null, scenario_branch_id: null, seed: 7, paths: 300, jitter: { '0': 1 } }))
      .toEqual({ runKind: 'control', interventions: [{ type: 'none' }], twinId: TWIN, twinVersion: 2, scenarioId: null, scenarioBranchId: null, stochastic: { mode: 'seeded', seed: 7, samples: 300, jitter: { '0': 1 } } });
  });
});

describe('the chunks are exact', () => {
  it('the plan covers the paths once, in order, with the last chunk short', () => {
    expect(chunkPlan(1000, 300)).toEqual([{ chunk_index: 0, first_path: 0, paths: 300 }, { chunk_index: 1, first_path: 300, paths: 300 }, { chunk_index: 2, first_path: 600, paths: 300 }, { chunk_index: 3, first_path: 900, paths: 100 }]);
    expect(chunkPlan(5000, 500)).toHaveLength(10);
  });
  it('a chunk\'s paths are the single execution\'s paths at the same indexes; every chunk together are all of them', () => {
    const single = simulateSupplyFlow(P, seeded(600), NONE);
    if (single.stochastic.mode !== 'seeded') throw new Error('seeded');
    const parts = chunkPlan(600, 250).map((c) => chunkSampleTotals(P, seeded(600), NONE, c.first_path, c.paths));
    expect(parts.map((p) => p.length)).toEqual([250, 250, 100]);
    expect(parts.flat()).toEqual(single.stochastic.sample_totals);
    expect(() => chunkSampleTotals(P, seeded(600), NONE, 500, 200)).toThrow(/outside the contract/);
    expect(() => chunkSampleTotals(P, { ...seeded(10), stochastic: { mode: 'deterministic' } }, NONE, 0, 1)).toThrow(/seeded contract/);
  });
  it('the outputs assembled from every chunk ARE the single execution\'s (the digest the reproduction compares)', () => {
    const single = simulateSupplyFlow(P, seeded(600), NONE);
    const chunks = chunkPlan(600, 250).map((c) => { const st = chunkSampleTotals(P, seeded(600), NONE, c.first_path, c.paths); return { ...c, digest: digestOfJson(st), sample_totals: st }; });
    const { totals, indexes } = pathsInOrder([...chunks].reverse());
    expect(indexes).toEqual([0, 1, 2]);
    expect(digestOfJson(assembleOutputs(P, seeded(600), NONE, totals))).toBe(digestOfJson(single));
  });
  it('over the completed chunks only (a partial run): the summary of the paths present, samples = their count', () => {
    const st = chunkSampleTotals(P, seeded(600), NONE, 0, 250);
    const o = assembleOutputs(P, seeded(600), NONE, st);
    if (o.stochastic.mode !== 'seeded') throw new Error('seeded');
    expect(o.stochastic.samples).toBe(250);
    expect(o.stochastic.sample_totals).toHaveLength(250);
    expect(o.totals).toEqual(simulateSupplyFlow(P, { ...seeded(1), stochastic: { mode: 'deterministic' } }, NONE).totals);
  });
  it('a chunk whose stored paths no longer have their recorded digest is refused, never assembled', () => {
    const st = chunkSampleTotals(P, seeded(10), NONE, 0, 5);
    expect(() => pathsInOrder([{ chunk_index: 0, first_path: 0, paths: 5, digest: digestOfJson(st), sample_totals: st.slice(0, 4) }])).toThrow(/holds 4 paths/);
    expect(() => pathsInOrder([{ chunk_index: 0, first_path: 0, paths: 5, digest: 'a'.repeat(64), sample_totals: st }])).toThrow(/no longer have the digest/);
  });
});

describe('the experiment rejected (<class>) family is mapped (B9 order)', () => {
  const map = (code: string, message: string) => (asObservationRefusal({ code, message }, 'c') as HttpException).getStatus();
  it('403 · 404 · 409 · 422', () => {
    expect(map('42501', 'experiment rejected (actor): recorded by the acting principal')).toBe(403);
    expect(map('42501', 'experiment rejected (authority): the executor of experiment chunks is an active attention agent of this domain')).toBe(403);
    expect(map('42501', 'experiment rejected (separation_of_duties): the declarer of experiment x does not approve its own budget')).toBe(403);
    expect(map('23503', 'experiment rejected (unknown_experiment): x is not an experiment of this domain')).toBe(404);
    expect(map('23503', 'experiment rejected (unknown_twin_version): twin x has no version 9')).toBe(404);
    expect(map('2F002', 'experiment rejected (state): experiment x is declared, not approved')).toBe(409);
    expect(map('2F002', 'experiment rejected (stale): chunk 0 of experiment x is running at attempt 2 (this record is attempt 1; the experiment is running)')).toBe(409);
    expect(map('22023', 'experiment rejected (budget): the declared 1000 paths exceed the budget\'s max_paths 500')).toBe(422);
    expect(map('22023', 'experiment rejected (method): discrete-event@1 does not support deterministic execution in chunks of a seeded stream')).toBe(422);
    expect(map('22023', 'experiment rejected (stop_conditions): converged names a declared measure')).toBe(422);
  });
});
