/**
 * optimisation@1 — CP-6 B29 §C (0092): the ALLOCATION of a scarce component across production lines, maximising throughput
 * (F-P5-05 clause 2, family `optimisation`). Deterministic.
 *
 * Each line (`line.throughput_cap:<line>` units/day, `line.bearings_per_unit:<line>` components per unit, and an optional weight
 * `line.margin_per_unit:<line>`, default 1 — the objective counts units unless a line's unit is worth more) draws on ONE daily pool
 * of the component: yesterday's leftover + the day's inbound delivery (`inbound.daily:<component>`, at `params.shortage.fraction`
 * inside the shortage window, floored), starting from `inventory.on_hand:<component>`. The problem each day is a bounded knapsack
 * LP — maximise Σ wᵢxᵢ subject to Σ aᵢxᵢ ≤ pool, 0 ≤ xᵢ ≤ capᵢ — whose optimum is GREEDY by wᵢ/aᵢ (ties by line id); the integer
 * allocation floors each line's share in that order and hands the remainder to the next line, and the LP bound (the fractional
 * optimum) is reported beside it, so the rounding GAP is said, never hidden. The marginal value of one more component (the ratio of
 * the line the pool ran out on — the constraint's shadow price) is reported on binding days.
 *
 * Reported per day: supply, pool, used, leftover, each line's units, the objective, the LP bound, binding; the summary (totals,
 * gap, binding days, the allocation order); the BALANCE of the component pool for §D. PURE; the pinned digest
 * (optimisation.digest.ts) is this file's sha256.
 */
import type { MethodAdapter, MethodElement, MethodInput, MethodOutput } from './types.js';
import { addDays, roundHalfEven } from '../models/supply-flow.js';
import { OPTIMISATION_IMPLEMENTATION_DIGEST } from './optimisation.digest.js';

export const OPTIMISATION_METHOD_REF = 'optimisation@1';
export const OPTIMISATION_REQUIRED_INPUTS: readonly string[] = Object.freeze(['line.throughput_cap', 'line.bearings_per_unit', 'inventory.on_hand', 'inbound.daily']);

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
function scoped(els: MethodElement[], prefix: string, component: string): unknown {
  return (els.find((e) => e.key === `${prefix}:${component}`) ?? els.find((e) => e.key === prefix))?.value;
}

interface Line { id: string; cap: number; per: number; weight: number }
interface Problem { component: string; start: string; stock: number; inbound: number; lines: Line[]; shortage: { start: number; days: number; fraction: number } | null }

function readProblem(input: MethodInput): { problem: Problem | null; problems: string[] } {
  const problems: string[] = [];
  const p = input.params ?? {};
  const component = typeof p['component'] === 'string' ? p['component'] : '';
  if (component.length < 2) problems.push('params.component names the scarce component');
  if (!isDay(p['start_date'])) problems.push('params.start_date is the first planned day (YYYY-MM-DD)');
  if (!Number.isInteger(input.horizonDays) || input.horizonDays < 1 || input.horizonDays > 365) problems.push('horizonDays is an integer in [1, 365]');
  const stock = num(scoped(input.elements, 'inventory.on_hand', component));
  const inbound = num(scoped(input.elements, 'inbound.daily', component));
  if (!Number.isInteger(stock) || stock < 0) problems.push(`inventory.on_hand:${component} is a non-negative integer`);
  if (!Number.isInteger(inbound) || inbound < 0) problems.push(`inbound.daily:${component} is a non-negative integer`);
  const lines: Line[] = [];
  for (const e of input.elements.filter((x) => x.key.startsWith('line.throughput_cap:'))) {
    const id = e.key.slice('line.throughput_cap:'.length);
    const cap = num(e.value); const per = num(input.elements.find((x) => x.key === `line.bearings_per_unit:${id}`)?.value);
    const wRaw = input.elements.find((x) => x.key === `line.margin_per_unit:${id}`)?.value; const weight = wRaw === undefined ? 1 : num(wRaw);
    if (!Number.isInteger(cap) || cap < 0) problems.push(`line.throughput_cap:${id} is a non-negative integer`);
    if (!Number.isInteger(per) || per < 1) problems.push(`line.bearings_per_unit:${id} is a positive integer`);
    if (!(weight > 0)) problems.push(`line.margin_per_unit:${id} is positive`);
    lines.push({ id, cap, per, weight });
  }
  if (lines.length === 0) problems.push('no line to allocate to (line.throughput_cap:<line>)');
  let shortage: Problem['shortage'] = null;
  if (p['shortage'] !== undefined && p['shortage'] !== null) {
    const s = p['shortage'] as Record<string, unknown>;
    const start = num(s['start_day']); const days = num(s['days']); const fraction = num(s['fraction']);
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(days) || days < 1 || !(fraction >= 0 && fraction <= 1)) {
      problems.push('params.shortage is { start_day (integer ≥ 0), days (integer ≥ 1), fraction (0..1 of the daily inbound delivered) }');
    } else shortage = { start, days, fraction };
  }
  if (problems.length > 0) return { problem: null, problems };
  // The greedy order: the objective's value per component, highest first (ties by line id) — the LP's optimal order on one constraint.
  lines.sort((a, b) => b.weight / b.per - a.weight / a.per || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { problem: { component, start: p['start_date'] as string, stock, inbound, lines, shortage }, problems };
}

export function allocate(input: MethodInput): MethodOutput {
  const { problem: q, problems } = readProblem(input);
  if (q === null) throw new Error(`${OPTIMISATION_METHOD_REF} input invalid: ${problems.join('; ')}`);
  let pool = q.stock; let received = 0; let used = 0; let units = 0; let objective = 0; let bound = 0; let bindingDays = 0;
  const series: MethodOutput['series'] = [];
  for (let d = 0; d < input.horizonDays; d++) {
    const short = q.shortage !== null && d >= q.shortage.start && d < q.shortage.start + q.shortage.days;
    const supply = short ? Math.floor(q.inbound * q.shortage!.fraction) : q.inbound;
    pool += supply; received += supply;
    const available = pool;
    // The LP bound: fractional greedy.
    let lpLeft = available; let lp = 0; let shadow: number | null = null;
    for (const l of q.lines) {
      const x = Math.min(l.cap, lpLeft / l.per);
      lp += x * l.weight; lpLeft -= x * l.per;
      if (x < l.cap && shadow === null) shadow = l.weight / l.per;
    }
    // The integer allocation: floored greedy, the remainder carried to the next line in order.
    const row: Record<string, string | number | boolean | null> = { day: d + 1, date: addDays(q.start, d), shortage: short, supply: String(supply), pool: String(available) };
    let dayUnits = 0; let dayObjective = 0; let dayUsed = 0;
    for (const l of q.lines) {
      const x = Math.min(l.cap, Math.floor(pool / l.per));
      pool -= x * l.per; dayUsed += x * l.per; dayUnits += x; dayObjective += x * l.weight;
      row[`units:${l.id}`] = String(x);
    }
    const binding = shadow !== null;
    if (binding) bindingDays++;
    used += dayUsed; units += dayUnits; objective += dayObjective; bound += lp;
    Object.assign(row, { used: String(dayUsed), leftover: String(pool), units: String(dayUnits), objective: roundHalfEven(dayObjective, 3), lp_bound: roundHalfEven(lp, 3),
                         binding, shadow_price: shadow === null ? null : roundHalfEven(shadow, 4) });
    series.push(row);
  }
  return {
    series,
    summary: { component: q.component, horizon_days: input.horizonDays, total_units: String(units), objective: roundHalfEven(objective, 3), lp_bound: roundHalfEven(bound, 3),
               rounding_gap: roundHalfEven(bound - objective, 3), binding_days: bindingDays, allocation_order: q.lines.map((l) => l.id).join(' > ') },
    balances: [{ key: `inventory.on_hand:${q.component}`, opening: q.stock, inflow: received, outflow: used, closing: pool }],
  };
}

export const OPTIMISATION_PROBE: MethodInput = {
  modelRef: OPTIMISATION_METHOD_REF, params: { component: 'probe-part', start_date: '2026-01-05' },
  elements: [{ key: 'line.throughput_cap:l1', value: 10, unit: 'units/day' }, { key: 'line.bearings_per_unit:l1', value: 2, unit: 'pcs' },
             { key: 'line.throughput_cap:l2', value: 10, unit: 'units/day' }, { key: 'line.bearings_per_unit:l2', value: 3, unit: 'pcs' },
             { key: 'inventory.on_hand:probe-part', value: 5, unit: 'pcs' }, { key: 'inbound.daily:probe-part', value: 30, unit: 'pcs' }],
  horizonDays: 2, seed: null,
};

export const optimisationAdapter: MethodAdapter = {
  modelRef: OPTIMISATION_METHOD_REF, family: 'optimisation', digest: OPTIMISATION_IMPLEMENTATION_DIGEST, requiredInputs: OPTIMISATION_REQUIRED_INPUTS,
  validate: (input) => readProblem(input).problems,
  run: allocate,
};
