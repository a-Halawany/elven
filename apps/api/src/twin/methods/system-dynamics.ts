/**
 * system-dynamics@1 — CP-6 B29 §C (0092): a STOCK-AND-FLOW model integrated with Euler steps (F-P5-05 clause 2, family `system-dynamics`).
 *
 * Two stocks: the order BACKLOG B and the production CAPACITY C (units/day). Orders flow into the backlog at the demand rate
 * (`demand.daily`, times `params.demand_step.factor` from its day on); shipments flow out at S = min(C_eff, B / 1 day), where C_eff is
 * the capacity at `params.capacity_loss.fraction` inside the loss window (a component shortage) and C otherwise. Capacity adjusts
 * toward the capacity the backlog asks for, C* = B / `sd.target_delivery_days`, over `sd.adjust_days` (a first-order delay):
 * dC/dt = (C* − C) / τ. The backlog starts at its equilibrium D·T. Integrated with Euler steps of `params.dt` days (1, ½, ¼, ⅛ or
 * 1/16 — a step that divides the day), reported once per day.
 *
 * Reported per day: orders, shipments, the backlog, the capacity, the delivery delay B / S; the summary (peak backlog, the day it
 * peaked, final values); the BALANCE of the backlog (opening + orders − shipments = closing) for §D. PURE and deterministic (a seed
 * is ignored: nothing here draws). The pinned digest (system-dynamics.digest.ts) is this file's sha256.
 */
import type { MethodAdapter, MethodElement, MethodInput, MethodOutput } from './types.js';
import { addDays, roundHalfEven } from '../models/supply-flow.js';
import { SYSTEM_DYNAMICS_IMPLEMENTATION_DIGEST } from './system-dynamics.digest.js';

export const SYSTEM_DYNAMICS_METHOD_REF = 'system-dynamics@1';
export const SYSTEM_DYNAMICS_REQUIRED_INPUTS: readonly string[] = Object.freeze(['sd.capacity', 'sd.adjust_days', 'sd.target_delivery_days', 'demand.daily']);
const STEPS = [1, 0.5, 0.25, 0.125, 0.0625];

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const el = (els: MethodElement[], key: string): number => num(els.find((e) => e.key === key)?.value);

interface Model { start: string; dt: number; demand: number; capacity: number; tau: number; target: number;
                  step: { day: number; factor: number } | null; loss: { start: number; days: number; fraction: number } | null }

function readModel(input: MethodInput): { model: Model | null; problems: string[] } {
  const problems: string[] = [];
  const p = input.params ?? {};
  if (!isDay(p['start_date'])) problems.push('params.start_date is the first simulated day (YYYY-MM-DD)');
  if (!Number.isInteger(input.horizonDays) || input.horizonDays < 1 || input.horizonDays > 365) problems.push('horizonDays is an integer in [1, 365]');
  const dt = p['dt'] === undefined ? 0.25 : num(p['dt']);
  if (!STEPS.includes(dt)) problems.push(`params.dt is one of ${STEPS.join(', ')} (a step that divides the day)`);
  const demand = el(input.elements, 'demand.daily'); const capacity = el(input.elements, 'sd.capacity');
  const tau = el(input.elements, 'sd.adjust_days'); const target = el(input.elements, 'sd.target_delivery_days');
  if (!(demand >= 0)) problems.push('demand.daily is a non-negative number');
  if (!(capacity >= 0)) problems.push('sd.capacity is a non-negative number (units per day)');
  if (!(tau >= 1)) problems.push('sd.adjust_days is at least 1 day');
  if (!(target > 0)) problems.push('sd.target_delivery_days is positive');
  let step: Model['step'] = null;
  if (p['demand_step'] !== undefined && p['demand_step'] !== null) {
    const s = p['demand_step'] as Record<string, unknown>;
    const day = num(s['day']); const factor = num(s['factor']);
    if (!Number.isInteger(day) || day < 0 || !(factor >= 0 && factor <= 10)) problems.push('params.demand_step is { day (integer ≥ 0), factor (0..10) }');
    else step = { day, factor };
  }
  let loss: Model['loss'] = null;
  if (p['capacity_loss'] !== undefined && p['capacity_loss'] !== null) {
    const s = p['capacity_loss'] as Record<string, unknown>;
    const start = num(s['start_day']); const days = num(s['days']); const fraction = num(s['fraction']);
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(days) || days < 1 || !(fraction >= 0 && fraction <= 1)) {
      problems.push('params.capacity_loss is { start_day (integer ≥ 0), days (integer ≥ 1), fraction (0..1 of the capacity available) }');
    } else loss = { start, days, fraction };
  }
  if (problems.length > 0) return { model: null, problems };
  return { model: { start: p['start_date'] as string, dt, demand, capacity, tau, target, step, loss }, problems };
}

export function simulateStocks(input: MethodInput): MethodOutput {
  const { model: m, problems } = readModel(input);
  if (m === null) throw new Error(`${SYSTEM_DYNAMICS_METHOD_REF} input invalid: ${problems.join('; ')}`);
  const perDay = Math.round(1 / m.dt);
  let B = m.demand * m.target; let C = m.capacity;
  const opening = B;
  let ordersTotal = 0; let shippedTotal = 0; let peak = B; let peakDay = 0;
  const series: MethodOutput['series'] = [];
  for (let d = 0; d < input.horizonDays; d++) {
    const orderRate = m.demand * (m.step !== null && d >= m.step.day ? m.step.factor : 1);
    const lossFactor = m.loss !== null && d >= m.loss.start && d < m.loss.start + m.loss.days ? m.loss.fraction : 1;
    let orders = 0; let shipped = 0;
    for (let k = 0; k < perDay; k++) {
      const S = Math.min(C * lossFactor, B);
      const desired = B / m.target;
      const inflow = orderRate * m.dt; const outflow = S * m.dt;
      B = B + inflow - outflow;
      C = Math.max(0, C + m.dt * (desired - C) / m.tau);
      orders += inflow; shipped += outflow;
    }
    ordersTotal += orders; shippedTotal += shipped;
    if (B > peak) { peak = B; peakDay = d + 1; }
    series.push({ day: d + 1, date: addDays(m.start, d), orders: roundHalfEven(orders, 3), shipments: roundHalfEven(shipped, 3), backlog: roundHalfEven(B, 3),
                  capacity: roundHalfEven(C, 3), delivery_delay_days: shipped > 0 ? roundHalfEven(B / shipped, 3) : null, capacity_loss: lossFactor < 1 });
  }
  return {
    series,
    summary: { horizon_days: input.horizonDays, dt: m.dt, opening_backlog: roundHalfEven(opening, 3), final_backlog: roundHalfEven(B, 3), peak_backlog: roundHalfEven(peak, 3),
               peak_day: peakDay, final_capacity: roundHalfEven(C, 3), total_orders: roundHalfEven(ordersTotal, 3), total_shipments: roundHalfEven(shippedTotal, 3) },
    balances: [{ key: 'backlog', opening, inflow: ordersTotal, outflow: shippedTotal, closing: B }],
  };
}

export const SYSTEM_DYNAMICS_PROBE: MethodInput = {
  modelRef: SYSTEM_DYNAMICS_METHOD_REF, params: { start_date: '2026-01-05', dt: 0.5, demand_step: { day: 2, factor: 1.5 } },
  elements: [{ key: 'demand.daily', value: 100, unit: 'units' }, { key: 'sd.capacity', value: 100, unit: 'units/day' },
             { key: 'sd.adjust_days', value: 5, unit: 'days' }, { key: 'sd.target_delivery_days', value: 2, unit: 'days' }],
  horizonDays: 5, seed: null,
};

export const systemDynamicsAdapter: MethodAdapter = {
  modelRef: SYSTEM_DYNAMICS_METHOD_REF, family: 'system-dynamics', digest: SYSTEM_DYNAMICS_IMPLEMENTATION_DIGEST, requiredInputs: SYSTEM_DYNAMICS_REQUIRED_INPUTS,
  validate: (input) => readModel(input).problems,
  run: simulateStocks,
};
