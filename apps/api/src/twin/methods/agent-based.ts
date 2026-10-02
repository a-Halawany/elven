/**
 * agent-based@1 — CP-6 B29 §C (0092): SUPPLIERS and BUYERS as agents with simple rules (F-P5-05 clause 2, family `agent-based`).
 *
 * Suppliers (`supplier.capacity:<id>`, units/day) and buyers (`buyer.demand:<id>`, units/day). Each buyer starts with a preferred
 * supplier, assigned round-robin in id order. Each day: a supplier YIELDS its capacity — times `params.disruption.fraction` while
 * it is the disrupted supplier inside the window, times (1 − noise·u) in a seeded run (u from xoshiro128**, drawn in supplier order),
 * floored — and fills its buyers' orders pro rata (floored, the remainder handed out one unit at a time in buyer order); unmet
 * demand is lost. A buyer whose fill rate falls below `params.switch_threshold` SWITCHES to the supplier with the most spare capacity
 * that day (ties by id) — the herding the method is there to show. The run reports per day demand, deliveries, unmet demand, the
 * fill rate, the switches and each supplier's order book; the summary (fill rate, switches, the final allocation, the largest share).
 * No stocks: no balances. PURE; the pinned digest (agent-based.digest.ts) is this file's sha256.
 */
import type { MethodAdapter, MethodInput, MethodOutput } from './types.js';
import { addDays, roundHalfEven, xoshiro128ss } from '../models/supply-flow.js';
import { AGENT_BASED_IMPLEMENTATION_DIGEST } from './agent-based.digest.js';

export const AGENT_BASED_METHOD_REF = 'agent-based@1';
export const AGENT_BASED_REQUIRED_INPUTS: readonly string[] = Object.freeze(['supplier.capacity', 'buyer.demand']);

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface World { start: string; suppliers: Array<{ id: string; capacity: number }>; buyers: Array<{ id: string; demand: number }>;
                  threshold: number; noise: number; disruption: { supplier: string; start: number; days: number; fraction: number } | null }

function readWorld(input: MethodInput): { world: World | null; problems: string[] } {
  const problems: string[] = [];
  const p = input.params ?? {};
  if (!isDay(p['start_date'])) problems.push('params.start_date is the first simulated day (YYYY-MM-DD)');
  if (!Number.isInteger(input.horizonDays) || input.horizonDays < 1 || input.horizonDays > 365) problems.push('horizonDays is an integer in [1, 365]');
  const suppliers = input.elements.filter((e) => e.key.startsWith('supplier.capacity:')).map((e) => ({ id: e.key.slice('supplier.capacity:'.length), capacity: num(e.value) })).sort(byId);
  const buyers = input.elements.filter((e) => e.key.startsWith('buyer.demand:')).map((e) => ({ id: e.key.slice('buyer.demand:'.length), demand: num(e.value) })).sort(byId);
  if (suppliers.length < 2) problems.push('at least two suppliers (supplier.capacity:<id>) — a buyer needs somewhere to switch to');
  if (buyers.length < 1) problems.push('at least one buyer (buyer.demand:<id>)');
  for (const s of suppliers) if (!Number.isInteger(s.capacity) || s.capacity < 0) problems.push(`supplier.capacity:${s.id} is a non-negative integer`);
  for (const b of buyers) if (!Number.isInteger(b.demand) || b.demand < 0) problems.push(`buyer.demand:${b.id} is a non-negative integer`);
  const threshold = p['switch_threshold'] === undefined ? 0.8 : num(p['switch_threshold']);
  if (!(threshold >= 0 && threshold <= 1)) problems.push('params.switch_threshold is in [0, 1]');
  const noise = p['noise'] === undefined ? 0 : num(p['noise']);
  if (!(noise >= 0 && noise <= 0.5)) problems.push('params.noise is in [0, 0.5]');
  if (noise > 0 && input.seed === null) problems.push('a run with noise is seeded (stochastic.mode seeded); an unseeded draw is refused');
  let disruption: World['disruption'] = null;
  if (p['disruption'] !== undefined && p['disruption'] !== null) {
    const s = p['disruption'] as Record<string, unknown>;
    const start = num(s['start_day']); const days = num(s['days']); const fraction = num(s['fraction']);
    if (typeof s['supplier'] !== 'string' || !suppliers.some((x) => x.id === s['supplier']) || !Number.isInteger(start) || start < 0 || !Number.isInteger(days) || days < 1 || !(fraction >= 0 && fraction <= 1)) {
      problems.push('params.disruption is { supplier (a supplier id of the twin), start_day (integer ≥ 0), days (integer ≥ 1), fraction (0..1 of its capacity) }');
    } else disruption = { supplier: s['supplier'] as string, start, days, fraction };
  }
  if (problems.length > 0) return { world: null, problems };
  return { world: { start: p['start_date'] as string, suppliers, buyers, threshold, noise, disruption }, problems };
}

export function simulateAgents(input: MethodInput): MethodOutput {
  const { world: w, problems } = readWorld(input);
  if (w === null) throw new Error(`${AGENT_BASED_METHOD_REF} input invalid: ${problems.join('; ')}`);
  const rng = input.seed === null ? null : xoshiro128ss(input.seed >>> 0);
  const pref = new Map<string, string>(w.buyers.map((b, i) => [b.id, w.suppliers[i % w.suppliers.length]!.id]));
  const series: MethodOutput['series'] = [];
  let demanded = 0; let delivered = 0; let switches = 0;
  for (let d = 0; d < input.horizonDays; d++) {
    const yieldOf = new Map<string, number>();
    for (const s of w.suppliers) {
      const disrupted = w.disruption !== null && w.disruption.supplier === s.id && d >= w.disruption.start && d < w.disruption.start + w.disruption.days;
      const u = rng === null ? 0 : rng();
      yieldOf.set(s.id, Math.floor(s.capacity * (disrupted ? w.disruption!.fraction : 1) * (1 - w.noise * u)));
    }
    const got = new Map<string, number>();
    const orders = new Map<string, number>();
    for (const s of w.suppliers) {
      const mine = w.buyers.filter((b) => pref.get(b.id) === s.id);
      const ordered = mine.reduce((a, b) => a + b.demand, 0);
      orders.set(s.id, ordered);
      const y = yieldOf.get(s.id)!;
      if (y >= ordered) { for (const b of mine) got.set(b.id, b.demand); continue; }
      let left = y;
      for (const b of mine) { const g = ordered === 0 ? 0 : Math.floor((b.demand * y) / ordered); got.set(b.id, g); left -= g; }
      for (const b of mine) { if (left <= 0) break; if (got.get(b.id)! < b.demand) { got.set(b.id, got.get(b.id)! + 1); left--; } }
    }
    let dayDemand = 0; let dayGot = 0; let daySwitches = 0;
    const spare = (id: string): number => yieldOf.get(id)! - orders.get(id)!;
    for (const b of w.buyers) {
      dayDemand += b.demand; dayGot += got.get(b.id)!;
      const fill = b.demand === 0 ? 1 : got.get(b.id)! / b.demand;
      if (fill < w.threshold) {
        const best = [...w.suppliers].sort((x, y) => spare(y.id) - spare(x.id) || byId(x, y))[0]!;
        if (best.id !== pref.get(b.id)) { pref.set(b.id, best.id); daySwitches++; }
      }
    }
    demanded += dayDemand; delivered += dayGot; switches += daySwitches;
    const row: Record<string, string | number | boolean | null> = { day: d + 1, date: addDays(w.start, d), demanded: String(dayDemand), delivered: String(dayGot),
      unmet: String(dayDemand - dayGot), fill_rate: roundHalfEven(dayDemand === 0 ? 1 : dayGot / dayDemand, 4), switches: daySwitches };
    for (const s of w.suppliers) { row[`orders:${s.id}`] = String(orders.get(s.id)); row[`yield:${s.id}`] = String(yieldOf.get(s.id)); }
    series.push(row);
  }
  const share = new Map<string, number>();
  for (const b of w.buyers) share.set(pref.get(b.id)!, (share.get(pref.get(b.id)!) ?? 0) + b.demand);
  const total = w.buyers.reduce((a, b) => a + b.demand, 0);
  const largest = [...share.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  return {
    series,
    summary: { horizon_days: input.horizonDays, suppliers: w.suppliers.length, buyers: w.buyers.length, total_demanded: String(demanded), total_delivered: String(delivered),
               total_unmet: String(demanded - delivered), fill_rate: roundHalfEven(demanded === 0 ? 1 : delivered / demanded, 4), switches,
               final_allocation: w.buyers.map((b) => `${b.id}→${pref.get(b.id)}`).join(', '),
               largest_share: largest === undefined || total === 0 ? null : `${largest[0]} ${roundHalfEven(largest[1] / total, 4)}` },
  };
}

export const AGENT_BASED_PROBE: MethodInput = {
  modelRef: AGENT_BASED_METHOD_REF, params: { start_date: '2026-01-05', disruption: { supplier: 'p1', start_day: 0, days: 1, fraction: 0.5 } },
  elements: [{ key: 'supplier.capacity:p1', value: 100, unit: 'units/day' }, { key: 'supplier.capacity:p2', value: 100, unit: 'units/day' },
             { key: 'buyer.demand:b1', value: 60, unit: 'units/day' }, { key: 'buyer.demand:b2', value: 60, unit: 'units/day' }],
  horizonDays: 3, seed: null,
};

export const agentBasedAdapter: MethodAdapter = {
  modelRef: AGENT_BASED_METHOD_REF, family: 'agent-based', digest: AGENT_BASED_IMPLEMENTATION_DIGEST, requiredInputs: AGENT_BASED_REQUIRED_INPUTS,
  validate: (input) => readWorld(input).problems,
  run: simulateAgents,
};
