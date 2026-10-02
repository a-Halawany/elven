/**
 * CP-6 B29 §C — the method fabric's fixtures, shared by the unit controls (test/unit/phase6-methods-b29.test.ts) and the harness
 * (phase6-methods-b29.test.ts): a REGENSBURG-LIKE assembly line (SYNTHETIC — NORDWERK's data is the demonstration's) and the
 * elements every other family reads. Keys follow the element key rule (prefix[:suffix]); the component is `bearing`.
 */
export const BEARING = 'bearing';

/** The line: four stations (press → bearing fit → winding → end-of-line test), three buffers, 15 working hours, 2 bearings a unit. */
export const LINE_ELEMENTS = [
  { key: 'line.station:press', value: { seq: 1, cycle_minutes: 0.9, variability: 0.1 }, unit: null },
  { key: 'line.station:bearing-fit', value: { seq: 2, cycle_minutes: 1.0, variability: 0.1 }, unit: null },
  { key: 'line.station:winding', value: { seq: 3, cycle_minutes: 1.1, variability: 0.1 }, unit: null },
  { key: 'line.station:eol-test', value: { seq: 4, cycle_minutes: 0.8, variability: 0.1 }, unit: null },
  { key: 'line.buffer:press-fit', value: { after_seq: 1, capacity: 120, initial: 60 }, unit: 'units' },
  { key: 'line.buffer:fit-winding', value: { after_seq: 2, capacity: 120, initial: 60 }, unit: 'units' },
  { key: 'line.buffer:winding-test', value: { after_seq: 3, capacity: 80, initial: 40 }, unit: 'units' },
  { key: 'line.minutes_per_day', value: 900, unit: 'min' },
  { key: `bom.per_unit:${BEARING}`, value: 2, unit: 'pcs' },
  { key: `inventory.on_hand:${BEARING}`, value: 3200, unit: 'pcs' },
  { key: `inbound.daily:${BEARING}`, value: 1600, unit: 'pcs' },
  { key: 'demand.daily', value: 780, unit: 'units' },
];

/** The other families' elements (system dynamics, agent-based, optimisation, war-gaming, counterfactual). */
export const FAMILY_ELEMENTS = [
  { key: 'sd.capacity', value: 818, unit: 'units/day' },
  { key: 'sd.adjust_days', value: 10, unit: 'days' },
  { key: 'sd.target_delivery_days', value: 2, unit: 'days' },
  { key: 'supplier.capacity:schaeffler-like', value: 1100, unit: 'pcs/day' },
  { key: 'supplier.capacity:skf-like', value: 900, unit: 'pcs/day' },
  { key: 'supplier.capacity:ntn-like', value: 600, unit: 'pcs/day' },
  { key: 'buyer.demand:regensburg-a', value: 800, unit: 'pcs/day' },
  { key: 'buyer.demand:regensburg-b', value: 500, unit: 'pcs/day' },
  { key: 'buyer.demand:budweis', value: 400, unit: 'pcs/day' },
  { key: 'line.throughput_cap:a1', value: 520, unit: 'units/day' },
  { key: 'line.bearings_per_unit:a1', value: 2, unit: 'pcs' },
  { key: 'line.margin_per_unit:a1', value: 3, unit: 'k€' },
  { key: 'line.throughput_cap:a2', value: 300, unit: 'units/day' },
  { key: 'line.bearings_per_unit:a2', value: 3, unit: 'pcs' },
  { key: 'line.margin_per_unit:a2', value: 5, unit: 'k€' },
  { key: 'threat.impact:port-closure', value: { target: 'route', impact: 420 }, unit: 'k€' },
  { key: 'threat.impact:supplier-outage', value: { target: 'supply', impact: 610 }, unit: 'k€' },
  { key: 'threat.impact:demand-surge', value: { target: 'capacity', impact: 180 }, unit: 'k€' },
  { key: 'plan.response:reroute-cape', value: { counters: 'route', strength: 0.6, cost: 48, uses: 2 }, unit: null },
  { key: 'plan.response:second-source', value: { counters: 'supply', strength: 0.7, cost: 95, uses: 2 }, unit: null },
  { key: 'plan.response:overtime', value: { counters: 'capacity', strength: 0.5, cost: 30, uses: 3 }, unit: null },
  { key: 'line.capacity_daily', value: 818, unit: 'units/day' },
];

/** The 21-day bearing shortage from day 8 (bearing deliveries at 40 %), the demonstration's scene. */
export const SHORTAGE = { start_day: 7, days: 21, fraction: 0.4 };

/** One run's method parameters per family, over the Regensburg elements. */
export const FAMILY_PARAMS: Record<string, { modelRef: string; params: Record<string, unknown>; horizonDays: number; seeded: boolean }> = {
  'discrete-event': { modelRef: 'discrete-event@1', params: { start_date: '2026-10-05', shortage: SHORTAGE }, horizonDays: 42, seeded: true },
  'system-dynamics': { modelRef: 'system-dynamics@1', params: { start_date: '2026-10-05', dt: 0.25, capacity_loss: { start_day: 7, days: 21, fraction: 0.4 } }, horizonDays: 42, seeded: false },
  'agent-based': { modelRef: 'agent-based@1', params: { start_date: '2026-10-05', disruption: { supplier: 'schaeffler-like', start_day: 7, days: 21, fraction: 0.4 }, switch_threshold: 0.8, noise: 0.05 }, horizonDays: 42, seeded: true },
  'optimisation': { modelRef: 'optimisation@1', params: { start_date: '2026-10-05', shortage: SHORTAGE }, horizonDays: 42, seeded: false },
  'war-gaming': { modelRef: 'war-gaming@1', params: { turns: 6, adversary: 'greedy', tolerance: 900 }, horizonDays: 6, seeded: false },
  'counterfactual': { modelRef: 'counterfactual@1', params: { start_date: '2026-10-05', shortage: SHORTAGE, intervention: { variable: 'supply', value: 1600, from_day: 7, to_day: 28 } }, horizonDays: 42, seeded: false },
};
