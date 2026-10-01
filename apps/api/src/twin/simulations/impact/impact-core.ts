/**
 * IMPACT ANALYSIS — the pure core of CP-6 B31 part `impact` (migration 0099 §I; F-P5-07: L8-C07, L8-C08, V00-T-062, V01-T-016,
 * V02-T-082/-167, V03-T-348). No clock, no I/O: every number here is produced by the pinned model (supply-flow@1, imported, never
 * edited — its digest is pinned) over a run's STORED contract, or is arithmetic over such outputs.
 *
 *   THE SWEEP (sensitivity, one at a time): every parameter of the run's contract the model reads (twelve supply-flow parameters, each
 *   named by the twin element key it came from) moved down and up by the relative step, and — SEQUENCING SENSITIVITY — the date of every
 *   dated intervention (an air bridge's decision day, a draw-down's window) moved earlier and later by a whole number of days. The metric
 *   (total cost, line-stop days, days below safety stock) on the deterministic trajectory; the factors ranked by SWING (the larger of the
 *   two deltas from the base — the tornado's bar), widest first.
 *   ROBUSTNESS: the same sweep repeated under at least three seeds (the run's own jitter, or one the requester declares), each factor's
 *   swing on the median of the seeded samples; the rank order per seed; a factor whose rank moves is UNSTABLE, the analysis STABLE only
 *   when none moves.
 *   THE METHOD FABRIC: a fabric run's numeric parameters (its `params`, nested paths) are perturbed and EXECUTED through the method runner
 *   by the service (contained, out of process) — this module only lists the leaves and builds the perturbed inputs.
 *   SECOND-ORDER (rule second-order@1): the run's lost production days against its COUNTERFACTUAL (the same stored contract re-executed
 *   without the shock, the same interventions and seeds — paired sample by sample) at the run's own twin, and the DELIVERY-DATE SHIFT
 *   carried 1:1 over every live twin link reachable from it (breadth first, to depth 4); per percentile (p10, p50, p90) over the paired
 *   samples, one value thrice for a deterministic run; the TIMING — the first affected day, and, where the downstream twin declares a
 *   line capacity above its demand, the days the headroom takes to recover the backlog and the day it is back on plan.
 */
import { createHash } from 'node:crypto';
import { jcsCanonicalize } from '@eye/contracts';
import { simulateSupplyFlow, addDays, type Intervention, type SupplyFlowOptions, type SupplyFlowOutputs, type SupplyFlowParams, type Totals } from '../../models/supply-flow.js';

export const SECOND_ORDER_RULE = 'second-order@1';
export const SUPPLY_METRICS = ['total_cost', 'line_stop_days', 'days_below_safety_stock'] as const;
export type SupplyMetric = (typeof SUPPLY_METRICS)[number];
export const MAX_ROBUSTNESS_SAMPLES = 1000;
export const MAX_DEPTH = 4;

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
export const digestOf = (v: unknown): string => sha256(jcsCanonicalize(v));
export const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;
const round3 = (x: number): number => Math.round(x * 1e3) / 1e3;

/** The supply-flow parameters the sweep moves, by the element-key prefix the twin names them with. */
export const SUPPLY_FLOW_FACTORS: ReadonlyArray<readonly [string, keyof SupplyFlowParams]> = Object.freeze([
  ['inventory.on_hand', 'on_hand'], ['inventory.safety_stock', 'safety_stock'], ['consumption.weekly', 'weekly_consumption'],
  ['route.inland_days', 'inland_days'], ['route.reroute_delay_days', 'reroute_delay_days'], ['terms.reroute_cost_per_container', 'reroute_cost_per_container'],
  ['terms.units_per_container', 'units_per_container'], ['terms.air_cost_per_kg', 'air_cost_per_kg'], ['terms.kg_per_unit', 'kg_per_unit'],
  ['terms.air_lead_days', 'air_lead_days'], ['terms.line_stop_cost_per_day', 'line_stop_cost_per_day'], ['shock.corridor_delay_days', 'corridor_delay_days'],
] as const);
/** Whole days stay whole when moved. */
const WHOLE: ReadonlySet<string> = new Set(['inland_days', 'reroute_delay_days', 'air_lead_days', 'corridor_delay_days']);

export interface Factor {
  key: string; field: string; kind: 'parameter' | 'timing'; element_kind: string | null; base_value: number | string;
  low: { value: number | string; metric: number }; high: { value: number | string; metric: number };
  delta_low: number; delta_high: number; swing: number; rank: number; outside_envelope: boolean;
}
export interface Robustness { verdict: 'stable' | 'unstable' | 'not_assessed'; samples?: number; jitter?: Record<string, number>; ranks?: Record<string, string[]>; basis?: string }

export function metricOf(t: Totals, metric: SupplyMetric): number {
  return metric === 'total_cost' ? Number(t.cost.total) : Number(t[metric]);
}
/** The metric on a seeded execution's MEDIAN (the robustness reading). */
export function medianOf(o: SupplyFlowOutputs, metric: SupplyMetric): number {
  if (o.stochastic.mode !== 'seeded') return metricOf(o.totals, metric);
  return Number(o.stochastic.summary[metric].median);
}

/** One perturbation a sweep makes: what is moved, to which values, and how to build the moved contract. */
interface Perturbation {
  key: string; field: string; kind: 'parameter' | 'timing'; element_kind: string | null; base_value: number | string; outside: [boolean, boolean];
  values: [number | string, number | string];
  apply: (dir: 0 | 1) => { params: SupplyFlowParams; interventions: Intervention[] };
}

/**
 * The perturbations of a supply-flow contract: each parameter the model reads whose element key the run's snapshot names (the key as
 * the twin holds it, with its kind — assumed, observed …), moved by ±relative (whole days stay whole), each move marked against the
 * behaviour model's operating envelope; then each dated intervention moved by ±shiftDays (null: no timing factors).
 */
export function supplyFlowPerturbations(params: SupplyFlowParams, interventions: Intervention[], snapshotKeys: ReadonlyArray<{ key: string; kind: string }>, relative: number,
                                        envelope: Record<string, unknown>, shiftDays: number | null): Perturbation[] {
  const out: Perturbation[] = [];
  for (const [prefix, field] of SUPPLY_FLOW_FACTORS) {
    const el = snapshotKeys.find((e) => e.key === prefix || e.key.startsWith(`${prefix}:`));
    if (el === undefined) continue;
    const base = params[field] as number;
    if (typeof base !== 'number' || !Number.isFinite(base)) continue;
    const moved = [-1, 1].map((d) => { const raw = base * (1 + d * relative); return WHOLE.has(field) ? Math.max(0, Math.round(raw)) : round6(raw); }) as [number, number];
    const range = envelope[field] ?? envelope[prefix];
    const outside = moved.map((v) => Array.isArray(range) && (v < Number(range[0]) || v > Number(range[1]))) as [boolean, boolean];
    out.push({ key: el.key, field, kind: 'parameter', element_kind: el.kind, base_value: base, outside, values: moved,
               apply: (dir) => ({ params: { ...params, [field]: moved[dir] }, interventions }) });
  }
  if (shiftDays !== null) {
    interventions.forEach((iv, idx) => {
      if (iv.type === 'air_bridge') {
        const moved: [string, string] = [addDays(iv.decision_date, -shiftDays), addDays(iv.decision_date, shiftDays)];
        out.push({ key: `timing:air_bridge:${iv.decision_date}`, field: `interventions[${idx}].decision_date`, kind: 'timing', element_kind: null, base_value: iv.decision_date,
                   outside: [false, false], values: moved,
                   apply: (dir) => ({ params, interventions: interventions.map((x, j) => (j === idx ? { ...iv, decision_date: moved[dir] } : x)) }) });
      } else if (iv.type === 'draw_down') {
        const moved: [string, string] = [addDays(iv.from, -shiftDays), addDays(iv.from, shiftDays)];
        out.push({ key: `timing:draw_down:${iv.from}`, field: `interventions[${idx}].from..to`, kind: 'timing', element_kind: null, base_value: `${iv.from}..${iv.to}`,
                   outside: [false, false], values: [`${moved[0]}..${addDays(iv.to, -shiftDays)}`, `${moved[1]}..${addDays(iv.to, shiftDays)}`],
                   apply: (dir) => ({ params, interventions: interventions.map((x, j) => (j === idx ? { ...iv, from: dir === 0 ? addDays(iv.from, -shiftDays) : addDays(iv.from, shiftDays), to: dir === 0 ? addDays(iv.to, -shiftDays) : addDays(iv.to, shiftDays) } : x)) }) });
      }
    });
  }
  return out;
}

/** Rank factors by swing, widest first (ties by key), and number them. */
export function rankFactors<T extends { key: string; swing: number }>(rows: T[]): Array<T & { rank: number }> {
  return [...rows].sort((a, b) => (b.swing - a.swing) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((r, i) => ({ ...r, rank: i + 1 }));
}

/** THE SWEEP over a supply-flow contract on the deterministic trajectory. */
export function supplyFlowSweep(a: { params: SupplyFlowParams; options: SupplyFlowOptions; interventions: Intervention[]; snapshotKeys: ReadonlyArray<{ key: string; kind: string }>;
                                    relative: number; metric: SupplyMetric; envelope: Record<string, unknown>; shiftDays: number | null }): { base: number; factors: Factor[] } {
  const det: SupplyFlowOptions = { ...a.options, stochastic: { mode: 'deterministic' } };
  const base = round6(metricOf(simulateSupplyFlow(a.params, det, a.interventions).totals, a.metric));
  const rows = supplyFlowPerturbations(a.params, a.interventions, a.snapshotKeys, a.relative, a.envelope, a.shiftDays).map((p) => {
    const m = ([0, 1] as const).map((dir) => { const c = p.apply(dir); return round6(metricOf(simulateSupplyFlow(c.params, det, c.interventions).totals, a.metric)); });
    const dl = round6(m[0]! - base); const dh = round6(m[1]! - base);
    return { key: p.key, field: p.field, kind: p.kind, element_kind: p.element_kind, base_value: p.base_value,
             low: { value: p.values[0], metric: m[0]! }, high: { value: p.values[1], metric: m[1]! }, delta_low: dl, delta_high: dh,
             swing: round6(Math.max(Math.abs(dl), Math.abs(dh))), outside_envelope: p.outside[0] || p.outside[1] };
  });
  return { base, factors: rankFactors(rows) };
}

/** ROBUSTNESS of a supply-flow sweep: the rank order of the same factors under each seed (swings on the seeded median). */
export function supplyFlowRobustness(a: { params: SupplyFlowParams; options: SupplyFlowOptions; interventions: Intervention[]; snapshotKeys: ReadonlyArray<{ key: string; kind: string }>;
                                         relative: number; metric: SupplyMetric; envelope: Record<string, unknown>; shiftDays: number | null;
                                         seeds: number[]; samples: number; jitter: Record<string, number> }): Robustness {
  const perts = supplyFlowPerturbations(a.params, a.interventions, a.snapshotKeys, a.relative, a.envelope, a.shiftDays);
  const ranks: Record<string, string[]> = {};
  for (const seed of a.seeds) {
    const opt: SupplyFlowOptions = { ...a.options, stochastic: { mode: 'seeded', seed, samples: a.samples, jitter: a.jitter } };
    const base = medianOf(simulateSupplyFlow(a.params, opt, a.interventions), a.metric);
    const rows = perts.map((p) => {
      const m = ([0, 1] as const).map((dir) => { const c = p.apply(dir); return medianOf(simulateSupplyFlow(c.params, opt, c.interventions), a.metric); });
      return { key: p.key, swing: round6(Math.max(Math.abs(m[0]! - base), Math.abs(m[1]! - base))) };
    });
    ranks[String(seed)] = rankFactors(rows).map((r) => r.key);
  }
  return { verdict: verdictOf(ranks), samples: a.samples, jitter: a.jitter, ranks, basis: 'the swing of each factor on the MEDIAN of the seeded samples, per seed' };
}

/** stable when no factor's rank differs between the seeds' orders. */
export function verdictOf(ranks: Record<string, string[]>): 'stable' | 'unstable' {
  const orders = Object.values(ranks);
  if (orders.length === 0) return 'stable';
  const first = orders[0]!;
  return orders.every((o) => o.length === first.length && o.every((k, i) => first[i] === k)) ? 'stable' : 'unstable';
}

/* ───────────── THE METHOD FABRIC ───────────── */
/** The numeric leaves of a fabric run's parameters (dot paths; `component` and non-numbers skipped; arrays not entered). */
export function numericLeaves(params: Record<string, unknown>, prefix = ''): Array<{ path: string; value: number }> {
  const out: Array<{ path: string; value: number }> = [];
  for (const [k, v] of Object.entries(params)) {
    const path = prefix === '' ? k : `${prefix}.${k}`;
    if (path === 'component') continue;
    if (typeof v === 'number' && Number.isFinite(v)) out.push({ path, value: v });
    else if (v !== null && typeof v === 'object' && !Array.isArray(v)) out.push(...numericLeaves(v as Record<string, unknown>, path));
  }
  return out;
}
/** A deep copy of the parameters with one path set. */
export function withPath(params: Record<string, unknown>, path: string, value: number): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(params)) as Record<string, unknown>;
  const parts = path.split('.');
  let at: Record<string, unknown> = copy;
  for (const p of parts.slice(0, -1)) at = at[p] as Record<string, unknown>;
  at[parts[parts.length - 1]!] = value;
  return copy;
}
/** A leaf moved by ±relative: whole numbers stay whole (a day, a count), others to 6 dp. */
export function movedLeaf(value: number, relative: number): [number, number] {
  return [-1, 1].map((d) => { const raw = value * (1 + d * relative); return Number.isInteger(value) ? Math.round(raw) : round6(raw); }) as [number, number];
}
/** A fabric output's numeric summary value (a number, or a numeric string), or null. */
export function summaryMetric(summary: Record<string, unknown>, metric: string): number | null {
  const v = summary[metric];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? round6(n) : null;
}

/* ───────────── SECOND-ORDER (rule second-order@1) ───────────── */
export interface ChainLink { linkId: string; upstreamTwinId: string; downstreamTwinId: string; mapping: unknown }
export interface ChainTwin { twinId: string; title: string; elements: Array<{ key: string; value: unknown }> }
export interface Effect {
  depth: number; entity_twin_id: string; entity_label: string; via_link_id: string | null;
  metric: 'line_stop_days_added' | 'delivery_date_shift_days'; unit: 'days';
  values: { p10: number; p50: number; p90: number; deterministic: boolean };
  timing: { first_affected: string | null; last_stop?: string | null; back_to_plan: string | null; recovery_days: number | null; headroom: number | null; reason: string | null };
  basis: Record<string, unknown>;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo);
}
/** The lost production days of a run against its counterfactual: per percentile over paired samples, or one value. */
export function lostDays(run: SupplyFlowOutputs, cf: SupplyFlowOutputs): { p10: number; p50: number; p90: number; deterministic: boolean } {
  if (run.stochastic.mode === 'seeded' && cf.stochastic.mode === 'seeded' && run.stochastic.sample_totals.length === cf.stochastic.sample_totals.length && run.stochastic.sample_totals.length > 0) {
    const cfs = cf.stochastic.sample_totals;
    const diffs = run.stochastic.sample_totals.map((t, i) => t.line_stop_days - (cfs[i] as Totals).line_stop_days).sort((a, b) => a - b);
    return { p10: round3(quantile(diffs, 0.1)), p50: round3(quantile(diffs, 0.5)), p90: round3(quantile(diffs, 0.9)), deterministic: false };
  }
  const d = run.totals.line_stop_days - cf.totals.line_stop_days;
  return { p10: d, p50: d, p90: d, deterministic: true };
}
const baseOf = (key: string): string => key.split(':')[0] ?? key;
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN);
/** A downstream twin's capacity HEADROOM: Σ line capacities ÷ Σ demand − 1, when both are declared and capacity exceeds demand. */
export function headroomOf(elements: ChainTwin['elements']): { headroom: number | null; capacity: number | null; demand: number | null; reason: string | null } {
  const cap = elements.filter((e) => ['line.capacity_per_day', 'process.line_capacity_per_day'].includes(baseOf(e.key))).map((e) => num(e.value)).filter(Number.isFinite);
  const dem = elements.filter((e) => baseOf(e.key) === 'demand.per_day').map((e) => num(e.value)).filter(Number.isFinite);
  const capacity = cap.length === 0 ? null : cap.reduce((x, y) => x + y, 0);
  const demand = dem.length === 0 ? null : dem.reduce((x, y) => x + y, 0);
  if (capacity === null || demand === null) return { headroom: null, capacity, demand, reason: `the twin declares no ${capacity === null ? 'line capacity' : 'demand per day'}: the shift is carried, its recovery not derivable` };
  if (demand <= 0 || capacity <= demand) return { headroom: null, capacity, demand, reason: `capacity ${capacity} does not exceed demand ${demand}: no headroom to recover the backlog within the horizon` };
  return { headroom: round6(capacity / demand - 1), capacity, demand, reason: null };
}
/** The line-stop days of a trajectory: its last one. */
function lastStop(o: SupplyFlowOutputs): string | null {
  for (let i = o.days.length - 1; i >= 0; i -= 1) if (o.days[i]?.line_stop) return o.days[i]!.date;
  return null;
}

/**
 * THE DERIVATION: the run's own effect (depth 0) and one effect per live link reachable breadth first from its twin (to depth 4), each
 * downstream effect the delivery-date shift = max(0, lost days) per percentile, with its recovery from the twin's declared headroom.
 */
export function secondOrder(a: { runTwin: ChainTwin; run: SupplyFlowOutputs; counterfactual: SupplyFlowOutputs; counterfactualBasis: string;
                                 links: ChainLink[]; twins: ReadonlyMap<string, ChainTwin> }): Effect[] {
  const lost = lostDays(a.run, a.counterfactual);
  const first = a.run.totals.first_line_stop_date;
  const effects: Effect[] = [{
    depth: 0, entity_twin_id: a.runTwin.twinId, entity_label: a.runTwin.title, via_link_id: null, metric: 'line_stop_days_added', unit: 'days', values: lost,
    timing: { first_affected: first, last_stop: lastStop(a.run), back_to_plan: lastStop(a.run) === null ? null : addDays(lastStop(a.run) as string, 1), recovery_days: null, headroom: null,
              reason: lost.p50 <= 0 ? 'the run loses no production day against its counterfactual at the median' : null },
    basis: { rule: SECOND_ORDER_RULE, counterfactual: a.counterfactualBasis, run_line_stop_days: a.run.totals.line_stop_days, counterfactual_line_stop_days: a.counterfactual.totals.line_stop_days },
  }];
  const shift = { p10: Math.max(0, lost.p10), p50: Math.max(0, lost.p50), p90: Math.max(0, lost.p90), deterministic: lost.deterministic };
  const seen = new Set<string>();
  let frontier: Array<{ twinId: string; depth: number }> = [{ twinId: a.runTwin.twinId, depth: 0 }];
  while (frontier.length > 0) {
    const next: Array<{ twinId: string; depth: number }> = [];
    for (const node of frontier) {
      if (node.depth >= MAX_DEPTH) continue;
      for (const l of a.links.filter((x) => x.upstreamTwinId === node.twinId).sort((x, y) => (x.linkId < y.linkId ? -1 : 1))) {
        if (seen.has(l.linkId)) continue;
        seen.add(l.linkId);
        const t = a.twins.get(l.downstreamTwinId) ?? { twinId: l.downstreamTwinId, title: l.downstreamTwinId, elements: [] };
        const h = headroomOf(t.elements);
        const recovery = h.headroom === null || shift.p50 <= 0 ? null : Math.ceil(shift.p50 / h.headroom);
        effects.push({
          depth: node.depth + 1, entity_twin_id: t.twinId, entity_label: t.title, via_link_id: l.linkId, metric: 'delivery_date_shift_days', unit: 'days', values: shift,
          timing: { first_affected: shift.p50 > 0 ? first : null, back_to_plan: recovery === null || first === null ? null : addDays(first, Math.ceil(shift.p50) + recovery),
                    recovery_days: recovery, headroom: h.headroom, reason: shift.p50 <= 0 ? 'no delivery date moves at the median' : h.reason },
          basis: { rule: SECOND_ORDER_RULE, via: { link_id: l.linkId, upstream_twin_id: l.upstreamTwinId, mapping: l.mapping }, propagation: 'the lost production days carried 1:1 to the delivery dates',
                   capacity: h.capacity, demand: h.demand },
        });
        next.push({ twinId: t.twinId, depth: node.depth + 1 });
      }
    }
    frontier = next;
  }
  return effects;
}

/* ───────────── THE INTAKES (the refusals before anything is computed) ───────────── */
export interface SensitivityIntake { metric: string; relative: number; seeds: number[] | null; samples: number; jitter: Record<string, number> | null; timingShiftDays: number | null }
export function validateSensitivity(p: Record<string, unknown>): { ok: SensitivityIntake } | { problem: string } {
  const metric = p['metric'] === undefined ? 'total_cost' : p['metric'];
  if (typeof metric !== 'string' || !/^[a-z][a-z0-9_.]{0,63}$/.test(metric)) return { problem: 'impact analysis rejected (metric): the metric is a named output of the run' };
  const relative = p['relative'] === undefined ? 0.2 : p['relative'];
  if (typeof relative !== 'number' || !(relative > 0 && relative <= 1)) return { problem: 'impact analysis rejected (relative): the step is a fraction in (0, 1]' };
  let seeds: number[] | null = null;
  if (p['seeds'] !== undefined && p['seeds'] !== null) {
    const s = p['seeds'];
    if (!Array.isArray(s) || s.some((x) => !Number.isInteger(x)) || new Set(s).size !== s.length || s.length < 3 || s.length > 10) {
      return { problem: 'impact analysis rejected (robustness): robustness is judged across 3 to 10 distinct integer seeds' };
    }
    seeds = s as number[];
  }
  const samples = p['samples'] === undefined ? 100 : p['samples'];
  if (!Number.isInteger(samples) || (samples as number) < 10 || (samples as number) > MAX_ROBUSTNESS_SAMPLES) return { problem: `impact analysis rejected (robustness): samples is a whole number in 10..${MAX_ROBUSTNESS_SAMPLES}` };
  let jitter: Record<string, number> | null = null;
  if (p['jitter'] !== undefined && p['jitter'] !== null) {
    const j = p['jitter'];
    if (typeof j !== 'object' || Array.isArray(j) || Object.keys(j as object).length === 0 || Object.entries(j as Record<string, unknown>).some(([k, v]) => !Number.isInteger(Number(k)) || typeof v !== 'number' || v < 0)
        || Math.abs(Object.values(j as Record<string, number>).reduce((x, y) => x + y, 0) - 1) > 1e-9) {
      return { problem: 'impact analysis rejected (robustness): the jitter is a distribution over whole days summing to 1' };
    }
    jitter = j as Record<string, number>;
  }
  const t = p['timingShiftDays'] === undefined || p['timingShiftDays'] === null ? null : p['timingShiftDays'];
  if (t !== null && (!Number.isInteger(t) || (t as number) < 1 || (t as number) > 90)) return { problem: 'impact analysis rejected (timing): timingShiftDays is a whole number of days in 1..90' };
  return { ok: { metric, relative, seeds, samples: samples as number, jitter, timingShiftDays: t as number | null } };
}

export interface VoiIntake {
  packageId: string | null; scenarioId: string; branchIds: string[] | null; reviewId: string | null;
  options: Array<{ key: string; title: string }> | null; payoffs: Record<string, Record<string, number>> | null; unit: string | null; payoffBasis: string | null;
  information: Record<string, unknown>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateVoi(p: Record<string, unknown>): { ok: VoiIntake } | { problem: string } {
  const id = (k: string): string | null | false => (p[k] === undefined || p[k] === null ? null : typeof p[k] === 'string' && UUID.test(p[k] as string) ? (p[k] as string) : false);
  const scenarioId = id('scenarioId'); const packageId = id('packageId'); const reviewId = id('reviewId');
  if (scenarioId === null || scenarioId === false) return { problem: 'value of information rejected (scenario): name the scenario whose futures are weighed (scenarioId)' };
  if (packageId === false) return { problem: 'value of information rejected (package): packageId, when given, is a package id' };
  if (reviewId === false) return { problem: 'value of information rejected (payoffs): reviewId, when given, is a portfolio review id' };
  let branchIds: string[] | null = null;
  if (p['branchIds'] !== undefined && p['branchIds'] !== null) {
    if (!Array.isArray(p['branchIds']) || p['branchIds'].some((b) => typeof b !== 'string' || !UUID.test(b))) return { problem: 'value of information rejected (branches): branchIds is a list of branch ids' };
    branchIds = p['branchIds'] as string[];
  }
  if (typeof p['information'] !== 'object' || p['information'] === null || Array.isArray(p['information'])) return { problem: 'value of information rejected (information): name the information {label, delay_days, delay_cost, signals, likelihood_basis}' };
  const opts = p['options'] === undefined || p['options'] === null ? null : p['options'];
  if (opts !== null && !Array.isArray(opts)) return { problem: 'value of information rejected (options): the options are a list [{key, title}]' };
  const payoffs = p['payoffs'] === undefined || p['payoffs'] === null ? null : p['payoffs'];
  if (payoffs !== null && (typeof payoffs !== 'object' || Array.isArray(payoffs))) return { problem: 'value of information rejected (payoffs): the payoffs are {option_key: {branch_id: number}}' };
  return { ok: { packageId, scenarioId, branchIds, reviewId, options: opts as VoiIntake['options'], payoffs: payoffs as VoiIntake['payoffs'],
                 unit: typeof p['unit'] === 'string' ? p['unit'] : null, payoffBasis: typeof p['payoffBasis'] === 'string' ? p['payoffBasis'] : null,
                 information: p['information'] as Record<string, unknown> } };
}

/** A pure mirror of the port's value-of-information arithmetic (the unit test's control; the PORT computes the record). */
export function voiOf(weights: Record<string, number>, payoffs: Record<string, Record<string, number>>, signals: Array<{ key: string; likelihoods: Record<string, number> }>, delayCost: number):
  { evNow: number; best: string[]; evPerfect: number; evpi: number; evsi: number; net: number; recommendation: 'wait' | 'act' } {
  const branches = Object.keys(weights); const opts = Object.keys(payoffs);
  const ev = (w: Record<string, number>, o: string) => branches.reduce((s, b) => s + (w[b] ?? 0) * (payoffs[o]?.[b] ?? 0), 0);
  const evs = opts.map((o) => ev(weights, o)); const evNow = Math.max(...evs);
  const best = opts.filter((_, i) => Math.abs(evs[i]! - evNow) <= 1e-9);
  const evPerfect = branches.reduce((s, b) => s + (weights[b] ?? 0) * Math.max(...opts.map((o) => payoffs[o]?.[b] ?? 0)), 0);
  let acc = 0;
  for (const sg of signals) {
    const ps = branches.reduce((s, b) => s + (weights[b] ?? 0) * (sg.likelihoods[b] ?? 0), 0);
    if (ps <= 0) continue;
    const post: Record<string, number> = Object.fromEntries(branches.map((b) => [b, (weights[b] ?? 0) * (sg.likelihoods[b] ?? 0) / ps]));
    acc += ps * Math.max(...opts.map((o) => ev(post, o)));
  }
  const evpi = round6(Math.max(evPerfect - evNow, 0)); const evsi = round6(Math.max(acc - evNow, 0)); const net = round6(evsi - delayCost);
  return { evNow: round6(evNow), best, evPerfect: round6(evPerfect), evpi, evsi, net, recommendation: net > 0 ? 'wait' : 'act' };
}
