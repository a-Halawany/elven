/**
 * CP-6 B31 §I (0099) — the pure core of the impact part: the sweep ranks by swing and re-executes the pinned model; robustness is a rank
 * comparison across seeds; the second-order rule (second-order@1) pairs samples with the counterfactual, carries the shift over every link
 * breadth first and recovers it from the declared headroom; the fabric's parameter leaves; the intakes word a request's fault before any
 * port is reached; the value-of-information arithmetic (the port's mirror) on a worked example; the refusal families map to honest
 * answers through the observation mapper, and the older families keep theirs.
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { simulateSupplyFlow, type SupplyFlowOutputs, type SupplyFlowParams } from '../../src/twin/models/supply-flow.js';
import {
  SUPPLY_FLOW_FACTORS, headroomOf, responseOf, lostDays, movedLeaf, numericLeaves, rankFactors, secondOrder, summaryMetric, supplyFlowPerturbations, supplyFlowRobustness, supplyFlowSweep,
  validateSensitivity, validateVoi, verdictOf, voiOf, withPath, type ChainTwin,
} from '../../src/twin/simulations/impact/impact-core.js';

const C = '0190b1c2-d3e4-7000-8000-0000000000c0';
const mapped = (message: string, code = '22023'): number | null => asObservationRefusal({ code, message }, C)?.getStatus() ?? null;
/** NORDWERK-shaped parameters (SYNTHETIC; the phase5 fixture's records). */
const PARAMS: SupplyFlowParams = { component: 'SYN-PART-MAG', t0: '2024-01-11', on_hand: 63400, safety_stock: 40000, weekly_consumption: 9200, shipments: [
  { id: 'SYN-SHIP-4471', qty: 38400, eta_port: '2024-01-29', position: 'Approaching Bab el-Mandeb', status: 'at risk' },
  { id: 'SYN-SHIP-4472', qty: 41000, eta_port: '2024-02-08', position: 'Malacca Strait', status: 'reroutable' },
  { id: 'SYN-SHIP-4475', qty: 39200, eta_port: '2024-02-22', position: 'Ningbo', status: 'bookable' }],
  inland_days: 14, reroute_delay_days: 11, reroute_cost_per_container: 1850, units_per_container: 1600, air_cost_per_kg: 19.4, kg_per_unit: 4100 / 9200, air_lead_days: 7,
  line_stop_cost_per_day: 142000, corridor_delay_days: 14, production_policy: 'hold_safety_stock' };
const KEYS = [...SUPPLY_FLOW_FACTORS.map(([p]) => ({ key: p.startsWith('terms.units') || p.startsWith('terms.kg') || p.startsWith('inventory') || p.startsWith('consumption') ? `${p}:SYN-PART-MAG` : p, kind: 'assumed' }))];
const OPT = { horizon_days: 90, shock: true, stochastic: { mode: 'deterministic' as const } };
const NONE = [{ type: 'none' as const }];

describe('the sweep (one at a time, ranked by swing — the tornado)', () => {
  it('moves every parameter the snapshot names ±relative (whole days stay whole), each bar the pinned model\'s own numbers, ranked widest first', () => {
    const s = supplyFlowSweep({ params: PARAMS, options: OPT, interventions: NONE, snapshotKeys: KEYS, relative: 0.2, metric: 'total_cost', envelope: {}, shiftDays: null });
    expect(s.factors).toHaveLength(12);
    expect(s.factors.map((f) => f.rank)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    for (let i = 1; i < 12; i += 1) expect(s.factors[i]!.swing).toBeLessThanOrEqual(s.factors[i - 1]!.swing);
    const inland = s.factors.find((f) => f.field === 'inland_days')!;
    expect([inland.low.value, inland.high.value]).toEqual([11, 17]);   // 14 × 0.8 = 11.2 → 11; 14 × 1.2 = 16.8 → 17
    expect(inland.low.metric).toBe(Number(simulateSupplyFlow({ ...PARAMS, inland_days: 11 }, OPT, NONE).totals.cost.total));
    expect(s.base).toBe(Number(simulateSupplyFlow(PARAMS, OPT, NONE).totals.cost.total));
    for (const f of s.factors) expect(f.swing).toBeCloseTo(Math.max(Math.abs(f.delta_low), Math.abs(f.delta_high)), 9);
  });
  it('only the named keys; the envelope marks a move outside it; the timing of an air bridge is a factor of its own (±shift days)', () => {
    const p = supplyFlowPerturbations(PARAMS, [{ type: 'air_bridge', component: 'SYN-PART-MAG', weeks: 1, decision_date: '2024-01-17' }], [{ key: 'shock.corridor_delay_days', kind: 'assumed' }], 0.5,
      { corridor_delay_days: [0, 20] }, 7);
    expect(p.map((x) => [x.key, x.kind, x.values, x.outside])).toEqual([
      ['shock.corridor_delay_days', 'parameter', [7, 21], [false, true]],
      ['timing:air_bridge:2024-01-17', 'timing', ['2024-01-10', '2024-01-24'], [false, false]],
    ]);
    expect(p[1]!.apply(1).interventions).toEqual([{ type: 'air_bridge', component: 'SYN-PART-MAG', weeks: 1, decision_date: '2024-01-24' }]);
  });
  it('the response\'s shape (V02-T-167): linear when the two moves answer alike and opposite, NONLINEAR when asymmetric beyond a tenth of the swing — a threshold one-sided', () => {
    expect(responseOf(-10, 10)).toEqual({ swing: 10, asymmetry: 0, nonlinear: false });
    expect(responseOf(-10, 10.5)).toEqual({ swing: 10.5, asymmetry: 0.5, nonlinear: false });
    expect(responseOf(0, 142000)).toEqual({ swing: 142000, asymmetry: 142000, nonlinear: true });
    expect(responseOf(0, 0)).toEqual({ swing: 0, asymmetry: 0, nonlinear: false });
  });
  it('ranks ties by key; the verdict is stable only when every seed orders the factors alike', () => {
    expect(rankFactors([{ key: 'b', swing: 2 }, { key: 'a', swing: 2 }, { key: 'c', swing: 5 }]).map((f) => [f.key, f.rank])).toEqual([['c', 1], ['a', 2], ['b', 3]]);
    expect(verdictOf({ 1: ['a', 'b'], 2: ['a', 'b'], 3: ['a', 'b'] })).toBe('stable');
    expect(verdictOf({ 1: ['a', 'b'], 2: ['b', 'a'], 3: ['a', 'b'] })).toBe('unstable');
    const r = supplyFlowRobustness({ params: PARAMS, options: OPT, interventions: NONE, snapshotKeys: KEYS.slice(0, 4), relative: 0.2, metric: 'line_stop_days', envelope: {}, shiftDays: null,
      seeds: [1, 2, 3], samples: 20, jitter: { 0: 0.5, 3: 0.5 } });
    expect(Object.keys(r.ranks!)).toEqual(['1', '2', '3']);
    expect(r.verdict).toBe(verdictOf(r.ranks!));
  });
});

describe('the method fabric\'s parameters', () => {
  it('lists the numeric leaves by path (component and strings skipped), sets one path on a copy, keeps whole numbers whole, reads a numeric summary value', () => {
    const params = { component: 'bearing', start_date: '2026-10-05', dt: 0.25, shortage: { start_day: 7, days: 21, fraction: 0.4 }, list: [1, 2] };
    expect(numericLeaves(params)).toEqual([{ path: 'dt', value: 0.25 }, { path: 'shortage.start_day', value: 7 }, { path: 'shortage.days', value: 21 }, { path: 'shortage.fraction', value: 0.4 }]);
    const moved = withPath(params, 'shortage.days', 25);
    expect(moved['shortage']).toEqual({ start_day: 7, days: 25, fraction: 0.4 });
    expect(params.shortage.days).toBe(21);
    expect(movedLeaf(21, 0.2)).toEqual([17, 25]);
    expect(movedLeaf(0.4, 0.2)).toEqual([0.32, 0.48]);
    expect(summaryMetric({ a: '12.5', b: 3, c: 'x', d: true }, 'a')).toBe(12.5);
    expect(summaryMetric({ a: '12.5', b: 3, c: 'x' }, 'c')).toBeNull();
  });
});

describe('second-order@1', () => {
  const run = simulateSupplyFlow(PARAMS, OPT, NONE);
  const cf = simulateSupplyFlow(PARAMS, { ...OPT, shock: false }, NONE);
  it('the lost days: one value thrice for a deterministic pair; percentiles over PAIRED samples for a seeded pair', () => {
    const d = lostDays(run, cf);
    expect(d).toEqual({ p10: run.totals.line_stop_days - cf.totals.line_stop_days, p50: run.totals.line_stop_days - cf.totals.line_stop_days, p90: run.totals.line_stop_days - cf.totals.line_stop_days, deterministic: true });
    const st = { mode: 'seeded' as const, seed: 3, samples: 50, jitter: { 0: 0.5, 7: 0.5 } };
    const s = lostDays(simulateSupplyFlow(PARAMS, { ...OPT, stochastic: st }, NONE), simulateSupplyFlow(PARAMS, { ...OPT, shock: false, stochastic: st }, NONE));
    expect(s.deterministic).toBe(false);
    expect(s.p10).toBeLessThanOrEqual(s.p50); expect(s.p50).toBeLessThanOrEqual(s.p90);
  });
  it('the headroom: Σ line capacities ÷ Σ demand − 1, or the reason it cannot be derived', () => {
    expect(headroomOf([{ key: 'demand.per_day', value: 800 }, { key: 'process.line_capacity_per_day:regensburg', value: 1000 }])).toEqual({ headroom: 0.25, capacity: 1000, demand: 800, reason: null });
    expect(headroomOf([{ key: 'line.capacity_per_day:l1', value: 1000 }]).reason).toMatch(/declares no demand per day/);
    expect(headroomOf([{ key: 'line.capacity_per_day:l1', value: 700 }, { key: 'demand.per_day', value: 800 }]).reason).toMatch(/does not exceed demand/);
  });
  it('carries the shift over every link breadth first (a diamond traversed once per link), the recovery from the headroom, the run\'s own effect at depth 0', () => {
    const twins = new Map<string, ChainTwin>([
      ['P', { twinId: 'P', title: 'Regensburg line', elements: [{ key: 'line.capacity_per_day:l1', value: 1000 }] }],
      ['Q', { twinId: 'Q', title: 'Budweis line', elements: [] }],
      ['E', { twinId: 'E', title: 'Enterprise', elements: [{ key: 'demand.per_day', value: 800 }, { key: 'process.line_capacity_per_day:x', value: 1000 }] }],
    ]);
    const links = [{ linkId: 'l1', upstreamTwinId: 'S', downstreamTwinId: 'P', mapping: [] }, { linkId: 'l2', upstreamTwinId: 'S', downstreamTwinId: 'Q', mapping: [] },
                   { linkId: 'l3', upstreamTwinId: 'P', downstreamTwinId: 'E', mapping: [] }, { linkId: 'l4', upstreamTwinId: 'Q', downstreamTwinId: 'E', mapping: [] }];
    const e = secondOrder({ runTwin: { twinId: 'S', title: 'corridor', elements: [] }, run, counterfactual: cf, counterfactualBasis: 'without the shock', links, twins });
    expect(e.map((x) => [x.depth, x.entity_twin_id, x.via_link_id])).toEqual([[0, 'S', null], [1, 'P', 'l1'], [1, 'Q', 'l2'], [2, 'E', 'l3'], [2, 'E', 'l4']]);
    const L = run.totals.line_stop_days - cf.totals.line_stop_days;
    expect(e[3]!.values.p50).toBe(Math.max(0, L));
    expect(e[3]!.timing.recovery_days).toBe(L > 0 ? Math.ceil(L / 0.25) : null);
    expect(e[1]!.timing.reason).toMatch(/declares no demand per day/);
  });
});

describe('the intakes word a fault before any port', () => {
  it('the sensitivity request', () => {
    expect(validateSensitivity({})).toEqual({ ok: { metric: 'total_cost', relative: 0.2, seeds: null, samples: 100, jitter: null, timingShiftDays: null, parameters: null } });
    expect(validateSensitivity({ relative: 1.5 })).toEqual({ problem: expect.stringMatching(/^impact analysis rejected \(relative\)/) });
    expect(validateSensitivity({ seeds: [1, 1, 2] })).toEqual({ problem: expect.stringMatching(/^impact analysis rejected \(robustness\)/) });
    expect(validateSensitivity({ jitter: { 0: 0.5 } })).toEqual({ problem: expect.stringMatching(/summing to 1/) });
    expect(validateSensitivity({ timingShiftDays: 0 })).toEqual({ problem: expect.stringMatching(/^impact analysis rejected \(timing\)/) });
    expect(validateSensitivity({ parameters: [] })).toEqual({ problem: expect.stringMatching(/^impact analysis rejected \(parameters\)/) });
    expect(validateSensitivity({ metric: 'DROP TABLE' })).toEqual({ problem: expect.stringMatching(/^impact analysis rejected \(metric\)/) });
  });
  it('the value-of-information request', () => {
    expect(validateVoi({ information: {} })).toEqual({ problem: expect.stringMatching(/^value of information rejected \(scenario\)/) });
    expect(validateVoi({ scenarioId: C, information: [] })).toEqual({ problem: expect.stringMatching(/^value of information rejected \(information\)/) });
    expect(validateVoi({ scenarioId: C, information: {}, branchIds: ['x'] })).toEqual({ problem: expect.stringMatching(/^value of information rejected \(branches\)/) });
    expect('ok' in validateVoi({ scenarioId: C, information: {}, packageId: C })).toBe(true);
  });
});

describe('the value of information (the port\'s mirror)', () => {
  it('a worked example: wait for the week of transit data — EVSI 169.68 against a delay cost of 40; act when the wait costs 400', () => {
    const w = { b: 0.6 / 0.95, d: 0.35 / 0.95 };
    const pay = { 'status-quo': { b: 0, d: -2000 }, reroute: { b: -480, d: -600 } };
    const sig = [{ key: 'recover', likelihoods: { b: 0.9, d: 0.2 } }, { key: 'stay-low', likelihoods: { b: 0.1, d: 0.8 } }];
    const r = voiOf(w, pay, sig, 40);
    expect(r).toMatchObject({ best: ['reroute'], recommendation: 'wait' });
    expect(r.evpi).toBeCloseTo(303.157895, 5);
    expect(r.evsi).toBeCloseTo(169.684211, 5);
    expect(r.evsi).toBeLessThanOrEqual(r.evpi);
    expect(voiOf(w, pay, sig, 400).recommendation).toBe('act');
    // perfectly uninformative information is worth nothing
    expect(voiOf(w, pay, [{ key: 'x', likelihoods: { b: 0.5, d: 0.5 } }, { key: 'y', likelihoods: { b: 0.5, d: 0.5 } }], 0)).toMatchObject({ evsi: 0, recommendation: 'act' });
  });
});

describe('the refusal families map to honest answers', () => {
  it('impact analysis rejected (<class>) and value of information rejected (<class>): 403 actor/authority, 404 unknown_*, 409 state/stale/execution, 422 the rest', () => {
    expect(mapped('impact analysis rejected (actor): an analysis is requested by the acting principal', '42501')).toBe(403);
    expect(mapped('impact analysis rejected (authority): a simulated frequency is stated as a probability by a named human', '42501')).toBe(403);
    expect(mapped('value of information rejected (authority): an assessment that recommends waiting or acting is a named human\'s', '42501')).toBe(403);
    for (const m of ['impact analysis rejected (unknown_run): x', 'impact analysis rejected (unknown_link): x', 'impact analysis rejected (unknown_map): x', 'value of information rejected (unknown_scenario): x',
                     'value of information rejected (unknown_package): x', 'value of information rejected (unknown_branch): x', 'value of information rejected (unknown_review): x', 'value of information rejected (unknown_option): x']) {
      expect(mapped(m, '23503'), m).toBe(404);
    }
    for (const m of ['impact analysis rejected (state): run x is failed', 'impact analysis rejected (stale): the analysis was computed over outputs', 'value of information rejected (state): scenario x is retired']) {
      expect(mapped(m), m).toBe(409);
    }
    for (const m of ['impact analysis rejected (factors): x', 'impact analysis rejected (robustness): x', 'impact analysis rejected (links): x', 'impact analysis rejected (reach): x',
                     'impact analysis rejected (effects): x', 'impact analysis rejected (samples): x', 'impact analysis rejected (event): x', 'impact analysis rejected (frequency_map): x',
                     'impact analysis rejected (metric): x', 'impact analysis rejected (relative): x', 'impact analysis rejected (digest): x',
                     'value of information rejected (no_probability): x', 'value of information rejected (branches): x', 'value of information rejected (likelihood): x',
                     'value of information rejected (payoffs): x', 'value of information rejected (options): x', 'value of information rejected (unit): x', 'value of information rejected (basis): x',
                     'value of information rejected (information): x']) {
      expect(mapped(m), m).toBe(422);
    }
  });
  it('the older families keep their answers (the unanchored "impact rejected: no such invalidation" row, the run gate, the B27 families)', () => {
    expect(mapped('run rejected (branch_suspended): branch x is suspended')).toBe(409);
    expect(mapped('branch probability rejected (narrative): a probability is never derived from narrative text')).toBe(422);
    expect(mapped('scenario set rejected (unknown_set): x', '23503')).toBe(404);
  });
});

// The run outputs type is exercised above through the pinned model; keep the import honest for the type checker.
export type _Outputs = SupplyFlowOutputs;
