/**
 * counterfactual@1 — CP-6 B29 §C (0092): the SAME structural model run twice, as the CONTROL world and under a DO-INTERVENTION,
 * the difference reported (F-P5-05 clause 2, family `counterfactual`).
 *
 * The structural model, one step per day: supply sₜ = the inbound delivery (`inbound.daily:<component>`, at
 * `params.shortage.fraction` inside the shortage window) times (1 − noise·uₜ) in a seeded run, floored; production
 * pₜ = min(capacity (`line.capacity_daily`), ⌊(stockₜ₋₁ + sₜ) / `bom.per_unit`⌋, open orders); the component stock
 * falls by pₜ·per_unit; orders (`demand.daily`) open each day and production ships against them — the rest is the backlog.
 * The intervention do(X := v) over [from_day, to_day) replaces the structural equation of X ∈ {supply, capacity, demand} by the
 * constant v. The EXOGENOUS noise uₜ is drawn ONCE per day and shared by both worlds — the counterfactual's defining condition — so
 * every difference between them is the intervention's. Reported per day both worlds and the deltas; the summary (totals and
 * final values per world, the deltas, the days production stopped); the BALANCES of the component stock and the backlog in each
 * world for §D. PURE; the pinned digest (counterfactual.digest.ts) is this file's sha256.
 */
import type { MethodAdapter, MethodElement, MethodInput, MethodOutput } from './types.js';
import { addDays, xoshiro128ss } from '../models/supply-flow.js';
import { COUNTERFACTUAL_IMPLEMENTATION_DIGEST } from './counterfactual.digest.js';

export const COUNTERFACTUAL_METHOD_REF = 'counterfactual@1';
export const COUNTERFACTUAL_REQUIRED_INPUTS: readonly string[] = Object.freeze(['inbound.daily', 'inventory.on_hand', 'bom.per_unit', 'demand.daily', 'line.capacity_daily']);
const VARIABLES = ['supply', 'capacity', 'demand'] as const;
type Variable = (typeof VARIABLES)[number];

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
function scoped(els: MethodElement[], prefix: string, component: string): unknown {
  return (els.find((e) => e.key === `${prefix}:${component}`) ?? els.find((e) => e.key === prefix))?.value;
}

interface Model { component: string; start: string; inbound: number; stock: number; per: number; demand: number; capacity: number; noise: number;
                  shortage: { start: number; days: number; fraction: number } | null; intervention: { variable: Variable; value: number; from: number; to: number } }

function readModel(input: MethodInput): { model: Model | null; problems: string[] } {
  const problems: string[] = [];
  const p = input.params ?? {};
  const component = typeof p['component'] === 'string' ? p['component'] : '';
  if (component.length < 2) problems.push('params.component names the component');
  if (!isDay(p['start_date'])) problems.push('params.start_date is the first simulated day (YYYY-MM-DD)');
  if (!Number.isInteger(input.horizonDays) || input.horizonDays < 1 || input.horizonDays > 365) problems.push('horizonDays is an integer in [1, 365]');
  const inbound = num(scoped(input.elements, 'inbound.daily', component)); const stock = num(scoped(input.elements, 'inventory.on_hand', component));
  const per = num(scoped(input.elements, 'bom.per_unit', component)); const demand = num(input.elements.find((e) => e.key === 'demand.daily')?.value);
  const capacity = num(input.elements.find((e) => e.key === 'line.capacity_daily')?.value);
  for (const [k, v, min] of [[`inbound.daily:${component}`, inbound, 0], [`inventory.on_hand:${component}`, stock, 0], [`bom.per_unit:${component}`, per, 1], ['demand.daily', demand, 0], ['line.capacity_daily', capacity, 0]] as const) {
    if (!Number.isInteger(v) || v < min) problems.push(`${k} is an integer ≥ ${min}`);
  }
  const noise = p['noise'] === undefined ? 0 : num(p['noise']);
  if (!(noise >= 0 && noise <= 0.5)) problems.push('params.noise is in [0, 0.5]');
  if (noise > 0 && input.seed === null) problems.push('a run with noise is seeded (stochastic.mode seeded); an unseeded draw is refused');
  let shortage: Model['shortage'] = null;
  if (p['shortage'] !== undefined && p['shortage'] !== null) {
    const s = p['shortage'] as Record<string, unknown>;
    const start = num(s['start_day']); const days = num(s['days']); const fraction = num(s['fraction']);
    if (!Number.isInteger(start) || start < 0 || !Number.isInteger(days) || days < 1 || !(fraction >= 0 && fraction <= 1)) {
      problems.push('params.shortage is { start_day (integer ≥ 0), days (integer ≥ 1), fraction (0..1 of the daily inbound delivered) }');
    } else shortage = { start, days, fraction };
  }
  const iv = (p['intervention'] ?? null) as Record<string, unknown> | null;
  let intervention: Model['intervention'] | null = null;
  if (iv === null || typeof iv !== 'object' || Array.isArray(iv)) problems.push('params.intervention is the do-intervention { variable (supply | capacity | demand), value, from_day, to_day }');
  else {
    const value = num(iv['value']); const from = num(iv['from_day']); const to = num(iv['to_day']);
    if (!VARIABLES.includes(iv['variable'] as Variable) || !Number.isInteger(value) || value < 0 || !Number.isInteger(from) || from < 0 || !Number.isInteger(to) || to <= from) {
      problems.push('params.intervention is { variable (supply | capacity | demand), value (integer ≥ 0), from_day (integer ≥ 0), to_day (> from_day) }');
    } else intervention = { variable: iv['variable'] as Variable, value, from, to };
  }
  if (problems.length > 0 || intervention === null) return { model: null, problems };
  return { model: { component, start: p['start_date'] as string, inbound, stock, per, demand, capacity, noise, shortage, intervention }, problems };
}

interface WorldState { stock: number; backlog: number; produced: number; received: number; ordered: number; stops: number }

export function compareWorlds(input: MethodInput): MethodOutput {
  const { model: m, problems } = readModel(input);
  if (m === null) throw new Error(`${COUNTERFACTUAL_METHOD_REF} input invalid: ${problems.join('; ')}`);
  const rng = input.seed === null ? null : xoshiro128ss(input.seed >>> 0);
  const worlds: Record<'control' | 'do', WorldState> = {
    control: { stock: m.stock, backlog: 0, produced: 0, received: 0, ordered: 0, stops: 0 },
    do: { stock: m.stock, backlog: 0, produced: 0, received: 0, ordered: 0, stops: 0 },
  };
  const series: MethodOutput['series'] = [];
  for (let d = 0; d < input.horizonDays; d++) {
    const u = rng === null ? 0 : rng(); // the exogenous noise: ONE draw per day, shared by both worlds
    const row: Record<string, string | number | boolean | null> = { day: d + 1, date: addDays(m.start, d) };
    for (const name of ['control', 'do'] as const) {
      const w = worlds[name];
      const forced = name === 'do' && d >= m.intervention.from && d < m.intervention.to ? m.intervention : null;
      const short = m.shortage !== null && d >= m.shortage.start && d < m.shortage.start + m.shortage.days;
      const supply = forced?.variable === 'supply' ? forced.value : Math.floor(m.inbound * (short ? m.shortage!.fraction : 1) * (1 - m.noise * u));
      const capacity = forced?.variable === 'capacity' ? forced.value : m.capacity;
      const demand = forced?.variable === 'demand' ? forced.value : m.demand;
      w.stock += supply; w.received += supply; w.backlog += demand; w.ordered += demand;
      const made = Math.min(capacity, Math.floor(w.stock / m.per), w.backlog);
      w.stock -= made * m.per; w.backlog -= made; w.produced += made;
      if (made === 0 && demand > 0) w.stops++;
      row[`${name}_supply`] = String(supply); row[`${name}_production`] = String(made); row[`${name}_backlog`] = String(w.backlog); row[`${name}_stock`] = String(w.stock);
    }
    row['delta_production'] = String(Number(row['do_production']) - Number(row['control_production']));
    row['delta_backlog'] = String(Number(row['do_backlog']) - Number(row['control_backlog']));
    series.push(row);
  }
  const c = worlds.control; const x = worlds.do;
  const iv = m.intervention;
  return {
    series,
    summary: { component: m.component, horizon_days: input.horizonDays, intervention: `do(${iv.variable} := ${iv.value}) on days ${iv.from + 1}..${iv.to}`,
               control_production: String(c.produced), do_production: String(x.produced), delta_production: String(x.produced - c.produced),
               control_final_backlog: String(c.backlog), do_final_backlog: String(x.backlog), delta_final_backlog: String(x.backlog - c.backlog),
               control_stop_days: c.stops, do_stop_days: x.stops, delta_stop_days: x.stops - c.stops },
    balances: (['control', 'do'] as const).flatMap((name) => [
      { key: `${name}:inventory.on_hand:${m.component}`, opening: m.stock, inflow: worlds[name].received, outflow: worlds[name].produced * m.per, closing: worlds[name].stock },
      { key: `${name}:backlog`, opening: 0, inflow: worlds[name].ordered, outflow: worlds[name].produced, closing: worlds[name].backlog },
    ]),
  };
}

export const COUNTERFACTUAL_PROBE: MethodInput = {
  modelRef: COUNTERFACTUAL_METHOD_REF,
  params: { component: 'probe-part', start_date: '2026-01-05', shortage: { start_day: 0, days: 2, fraction: 0.5 }, intervention: { variable: 'supply', value: 40, from_day: 0, to_day: 2 } },
  elements: [{ key: 'inbound.daily:probe-part', value: 40, unit: 'pcs' }, { key: 'inventory.on_hand:probe-part', value: 0, unit: 'pcs' }, { key: 'bom.per_unit:probe-part', value: 2, unit: 'pcs' },
             { key: 'demand.daily', value: 20, unit: 'units' }, { key: 'line.capacity_daily', value: 25, unit: 'units/day' }],
  horizonDays: 3, seed: null,
};

export const counterfactualAdapter: MethodAdapter = {
  modelRef: COUNTERFACTUAL_METHOD_REF, family: 'counterfactual', digest: COUNTERFACTUAL_IMPLEMENTATION_DIGEST, requiredInputs: COUNTERFACTUAL_REQUIRED_INPUTS,
  validate: (input) => readModel(input).problems,
  run: compareWorlds,
};
