/**
 * P5-M2 — `supply-flow@1` executes PHASE5_BUILD_PLAN.md §6b on the corrected fixture.
 * The golden trajectories are DERIVED by executing the specification; the hand-derived
 * checkpoints of §6b are the anchors they are checked against before being trusted.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { jcsCanonicalize } from '@eye/contracts';
import { simulateSupplyFlow, roundHalfEven, type SupplyFlowParams, type SupplyFlowOptions, type Intervention } from '../../src/twin/models/supply-flow.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../../src/twin/models/supply-flow.digest.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The NORDWERK fixture as the twin would hold it (SYNTHETIC_COMPANY_SPEC.md §4–§9, routes-and-terms-2024Q1.csv). */
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
const det = (shock: boolean, horizon = 90): SupplyFlowOptions => ({ horizon_days: horizon, shock, stochastic: { mode: 'deterministic' } });
const NONE: Intervention[] = [{ type: 'none' }];
const digest = (o: unknown) => createHash('sha256').update(jcsCanonicalize(o)).digest('hex');
const day = (out: ReturnType<typeof simulateSupplyFlow>, date: string) => out.days.find((d) => d.date === date);

describe('supply-flow@1 — the §6b checkpoints, executed', () => {
  it('control, no shock: the floor is reached on 2024-01-28; 4471 lands 2024-02-12; 15 line-stop days = €2 130 000', () => {
    const o = simulateSupplyFlow(P, det(false), NONE);
    expect(day(o, '2024-01-27')?.line_stop).toBe(false);
    expect(day(o, '2024-01-28')?.line_stop).toBe(true);
    expect(o.totals.first_line_stop_date).toBe('2024-01-28');
    expect(o.arrivals.find((a) => a.source === 'SYN-SHIP-4471')?.date).toBe('2024-02-12');
    expect(day(o, '2024-02-12')?.line_stop).toBe(false);
    expect(o.totals.line_stop_days).toBe(15);
    expect(o.totals.cost.line_stop).toBe('2130000.00');
    expect(o.totals.cost.total).toBe('2130000.00');
  });

  it('control, with the shock: 4471 is exposed and lands 2024-02-26; 29 line-stop days = €4 118 000', () => {
    const o = simulateSupplyFlow(P, det(true), NONE);
    const a = o.arrivals.find((x) => x.source === 'SYN-SHIP-4471');
    expect(a?.exposed).toBe(true);
    expect(a?.date).toBe('2024-02-26');
    expect(o.totals.line_stop_days).toBe(29);
    expect(o.totals.cost.total).toBe('4118000.00');
    // the shipment already past the chokepoint would not be exposed
    const past = simulateSupplyFlow({ ...P, shipments: [{ id: 'X', qty: 1, eta_port: '2024-02-01', position: 'Suez transit', status: 'in transit' }] }, det(true), NONE);
    expect(past.arrivals[0]?.exposed).toBe(false);
    expect(past.arrivals[0]?.date).toBe('2024-02-15');
  });

  it('draw_down alone, with the shock: consumption continues, 0 line-stop days, on-hand 2 942.857 at the start of 2024-02-26', () => {
    const o = simulateSupplyFlow(P, det(true), [{ type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-01-11', to: '2024-04-09' }]);
    expect(o.totals.line_stop_days).toBe(0);
    expect(day(o, '2024-02-26')?.on_hand_start).toBe('2942.857');
    expect(day(o, '2024-01-28')?.below_safety_stock).toBe(true);
    expect(day(o, '2024-01-27')?.below_safety_stock).toBe(false);
    expect(o.totals.days_below_safety_stock).toBeGreaterThan(0);
    // without 4471 the first stop would be 2024-02-28 (48 full days of consumption)
    const alone = simulateSupplyFlow({ ...P, shipments: [] }, det(true), [{ type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-01-11', to: '2024-04-09' }]);
    expect(alone.totals.first_line_stop_date).toBe('2024-02-28');
  });

  it('reroute(SYN-SHIP-4472): lands 2024-03-04, 26 containers → €48 100; 4471 cannot be rerouted', () => {
    const o = simulateSupplyFlow(P, det(true), [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }]);
    const a = o.arrivals.find((x) => x.source === 'SYN-SHIP-4472');
    expect(a?.date).toBe('2024-03-04');
    expect(a?.rerouted).toBe(true);
    expect(a?.exposed).toBe(true);
    expect(o.totals.cost.reroute).toBe('48100.00');
    expect(() => simulateSupplyFlow(P, det(true), [{ type: 'reroute', shipment: 'SYN-SHIP-4471' }])).toThrow(/cannot be rerouted/);
  });

  it('air_bridge(1 week, 2024-01-17): 9 200 units on 2024-01-24, €79 540.00', () => {
    const o = simulateSupplyFlow(P, det(true), [{ type: 'air_bridge', component: 'SYN-PART-MAG', weeks: 1, decision_date: '2024-01-17' }]);
    const a = o.arrivals.find((x) => x.source.startsWith('air-bridge'));
    expect(a?.date).toBe('2024-01-24');
    expect(a?.qty).toBe('9200.000');
    expect(o.totals.cost.air).toBe('79540.00');
  });

  it('combined draw_down + reroute is one run with both applied once', () => {
    const o = simulateSupplyFlow(P, det(true), [
      { type: 'reroute', shipment: 'SYN-SHIP-4472' }, { type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-01-11', to: '2024-04-09' }]);
    expect(o.totals.cost.reroute).toBe('48100.00');
    expect(o.totals.line_stop_days).toBe(0);
    expect(o.interventions.length).toBe(2);
  });
});

describe('supply-flow@1 — reproducibility and the contract', () => {
  it('identical inputs give byte-identical outputs and digests; intervention order does not change the digest', () => {
    const a = simulateSupplyFlow(P, det(true), [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }, { type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-02-01', to: '2024-02-20' }]);
    const b = simulateSupplyFlow(P, det(true), [{ type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-02-01', to: '2024-02-20' }, { type: 'reroute', shipment: 'SYN-SHIP-4472' }]);
    expect(digest(a)).toBe(digest(b));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the seeded mode reproduces exactly for the same seed and differs for another; an unseeded stochastic run is refused', () => {
    const jitter = { '-2': 0.1, '0': 0.6, '2': 0.2, '5': 0.1 };
    const s1 = simulateSupplyFlow(P, { horizon_days: 90, shock: true, stochastic: { mode: 'seeded', seed: 42, samples: 200, jitter } }, NONE);
    const s2 = simulateSupplyFlow(P, { horizon_days: 90, shock: true, stochastic: { mode: 'seeded', seed: 42, samples: 200, jitter } }, NONE);
    const s3 = simulateSupplyFlow(P, { horizon_days: 90, shock: true, stochastic: { mode: 'seeded', seed: 43, samples: 200, jitter } }, NONE);
    expect(digest(s1)).toBe(digest(s2));
    expect(digest(s1)).not.toBe(digest(s3));
    if (s1.stochastic.mode === 'seeded') {
      expect(s1.stochastic.rng).toBe('xoshiro128**@1');
      expect(s1.stochastic.sample_totals.length).toBe(200);
      expect(Number(s1.stochastic.summary.line_stop_days.min)).toBeLessThanOrEqual(Number(s1.stochastic.summary.line_stop_days.max));
    }
    expect(() => simulateSupplyFlow(P, { horizon_days: 90, shock: true, stochastic: { mode: 'seeded', seed: 1.5, samples: 10, jitter } as never }, NONE)).toThrow(/integer seed/);
    expect(() => simulateSupplyFlow(P, { horizon_days: 90, shock: true, stochastic: { mode: 'random' } as never }, NONE)).toThrow(/deterministic or seeded/);
  });

  it('an incomplete contract is refused: no interventions, a horizon outside the envelope, a negative parameter', () => {
    expect(() => simulateSupplyFlow(P, det(true), [])).toThrow(/none.*is an intervention/);
    expect(() => simulateSupplyFlow(P, det(true, 0), NONE)).toThrow(/horizon_days/);
    expect(() => simulateSupplyFlow({ ...P, on_hand: -1 }, det(true), NONE)).toThrow(/on_hand/);
  });

  it('numeric canonicalisation is half-even at fixed decimals', () => {
    expect(roundHalfEven(2.5, 0)).toBe('2');
    expect(roundHalfEven(3.5, 0)).toBe('4');
    expect(roundHalfEven(1314.2857142857142, 3)).toBe('1314.286');
    expect(roundHalfEven(-0.0004, 3)).toBe('0.000');
  });

  it('the pinned implementation digest is the sha256 of the model source', () => {
    const src = readFileSync(join(HERE, '..', '..', 'src', 'twin', 'models', 'supply-flow.ts'));
    expect(createHash('sha256').update(src).digest('hex')).toBe(SUPPLY_FLOW_IMPLEMENTATION_DIGEST);
  });
});
