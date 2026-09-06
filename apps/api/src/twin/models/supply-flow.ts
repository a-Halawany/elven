/**
 * `supply-flow@1` — the ONLY behaviour model of Phase 5, implemented from the
 * executable specification in PHASE5_BUILD_PLAN.md §6b. Pure: no clock, no I/O,
 * no randomness except the explicitly seeded lead-time jitter. Its parameters
 * are the twin's state elements; nothing here is a literal about the world.
 *
 * Any change to this file is a new implementation: SUPPLY_FLOW_IMPLEMENTATION_DIGEST
 * (supply-flow.digest.ts) is the sha256 of these bytes, pinned in the behaviour
 * model registry, and a unit control recomputes it.
 *
 * Conventions (§6b): daily steps; arrivals at the start of a day, consumption at
 * the end; `daily = weekly / 7` carried at full precision and canonicalised only
 * on output (quantities 3 dp, money 2 dp, half-even); calendar days; a single
 * component per run; liquidated damages not modelled.
 */

export const SUPPLY_FLOW_METHOD_REF = 'supply-flow@1';
export const RNG_ALGORITHM = 'xoshiro128**@1';
export const EXPOSED_POSITIONS: readonly string[] = Object.freeze(['Ningbo', 'Malacca Strait', 'Approaching Bab el-Mandeb']);
export const REROUTABLE_STATUSES: readonly string[] = Object.freeze(['reroutable', 'bookable']);

export interface Shipment { id: string; qty: number; eta_port: string; position: string; status: string }
export interface SupplyFlowParams {
  component: string;
  t0: string;                      // the inventory element's valid_from
  on_hand: number;
  safety_stock: number;
  weekly_consumption: number;
  shipments: Shipment[];
  inland_days: number;
  reroute_delay_days: number;
  reroute_cost_per_container: number;
  units_per_container: number;
  air_cost_per_kg: number;
  kg_per_unit: number;
  air_lead_days: number;
  line_stop_cost_per_day: number;
  corridor_delay_days: number;
  production_policy: 'hold_safety_stock' | 'consume_to_zero';
}
export type Intervention =
  | { type: 'none' }
  | { type: 'reroute'; shipment: string }
  | { type: 'air_bridge'; component: string; weeks: number; decision_date: string }
  | { type: 'draw_down'; component: string; from: string; to: string };
export interface JitterDistribution { [days: string]: number }
export interface SupplyFlowOptions {
  horizon_days: number;
  shock: boolean;                  // the flipped scenario branch applies corridor_delay_days to exposed, un-rerouted shipments
  stochastic: { mode: 'deterministic' } | { mode: 'seeded'; seed: number; samples: number; jitter: JitterDistribution };
}
export interface DayRow { date: string; on_hand_start: string; arrivals: string; consumed: string; on_hand_end: string; line_stop: boolean; below_safety_stock: boolean }
export interface Totals {
  line_stop_days: number; days_below_safety_stock: number; min_on_hand: string; first_line_stop_date: string | null;
  cost: { reroute: string; air: string; line_stop: string; total: string };
}
export interface SupplyFlowOutputs {
  method_ref: string; component: string; horizon: { from: string; to: string; days: number };
  policy: string; shock: boolean; interventions: Intervention[];
  arrivals: Array<{ source: string; date: string; qty: string; exposed: boolean; rerouted: boolean; delay_days: number; jitter_days: number }>;
  days: DayRow[]; totals: Totals;
  stochastic: { mode: 'deterministic' } | { mode: 'seeded'; rng: string; seed: number; samples: number; jitter: JitterDistribution;
                summary: Record<'line_stop_days' | 'days_below_safety_stock' | 'total_cost', { min: string; p10: string; median: string; p90: string; max: string }>;
                sample_totals: Totals[] };
}

/* ── numeric canonicalisation: half-even at a fixed number of decimals ── */
export function roundHalfEven(x: number, dp: number): string {
  const f = 10 ** dp;
  const scaled = x * f;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let n: number;
  const eps = 1e-9;
  if (Math.abs(diff - 0.5) < eps) n = floor % 2 === 0 ? floor : floor + 1;
  else n = diff > 0.5 ? floor + 1 : floor;
  const s = (n / f).toFixed(dp);
  return s === `-${(0).toFixed(dp)}` ? (0).toFixed(dp) : s;
}
const qty = (x: number): string => roundHalfEven(x, 3);
const money = (x: number): string => roundHalfEven(x, 2);

/* ── dates ── */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/* ── xoshiro128** seeded from splitmix32 (declared, reproducible) ── */
function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a ^ (a >>> 16); t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15; t = Math.imul(t, 0x735a2d97); t ^= t >>> 15;
    return t >>> 0;
  };
}
export function xoshiro128ss(seed: number): () => number {
  const sm = splitmix32(seed);
  let s0 = sm(); let s1 = sm(); let s2 = sm(); let s3 = sm();
  return () => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t; s3 = rotl(s3, 11);
    return result / 4294967296;
  };
}
function rotl(x: number, k: number): number { return ((x << k) | (x >>> (32 - k))) >>> 0; }

function drawJitter(u: number, dist: JitterDistribution): number {
  const entries = Object.entries(dist).map(([d, p]) => [Number(d), p] as const).sort((a, b) => a[0] - b[0]);
  let acc = 0;
  for (const [d, p] of entries) { acc += p; if (u < acc) return d; }
  return entries[entries.length - 1]?.[0] ?? 0;
}

export function validateParams(p: SupplyFlowParams, o: SupplyFlowOptions, interventions: Intervention[]): string[] {
  const problems: string[] = [];
  if (!isDay(p.t0)) problems.push('t0 must be a calendar day');
  for (const k of ['on_hand', 'safety_stock', 'weekly_consumption', 'inland_days', 'reroute_delay_days', 'reroute_cost_per_container',
    'units_per_container', 'air_cost_per_kg', 'kg_per_unit', 'air_lead_days', 'line_stop_cost_per_day', 'corridor_delay_days'] as const) {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k]) || p[k] < 0) problems.push(`${k} must be a non-negative number`);
  }
  if (p.units_per_container <= 0) problems.push('units_per_container must be positive');
  if (p.production_policy !== 'hold_safety_stock' && p.production_policy !== 'consume_to_zero') problems.push('production_policy must be hold_safety_stock or consume_to_zero');
  if (!Array.isArray(p.shipments)) problems.push('shipments must be an array');
  else for (const s of p.shipments) {
    if (typeof s.id !== 'string' || typeof s.qty !== 'number' || s.qty < 0 || !isDay(s.eta_port) || typeof s.position !== 'string' || typeof s.status !== 'string') problems.push(`shipment ${String(s.id)} is malformed`);
  }
  if (!Number.isInteger(o.horizon_days) || o.horizon_days < 1 || o.horizon_days > 365) problems.push('horizon_days must be an integer in [1, 365]');
  if (o.stochastic.mode === 'seeded') {
    if (!Number.isInteger(o.stochastic.seed)) problems.push('a seeded run needs an integer seed');
    if (!Number.isInteger(o.stochastic.samples) || o.stochastic.samples < 1 || o.stochastic.samples > 10_000) problems.push('samples must be an integer in [1, 10000]');
    const sum = Object.values(o.stochastic.jitter ?? {}).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-9 || Object.keys(o.stochastic.jitter ?? {}).some((k) => !Number.isInteger(Number(k)))) problems.push('jitter must be a discrete distribution over integer days summing to 1');
  } else if ((o.stochastic as { mode: string }).mode !== 'deterministic') problems.push('stochastic.mode must be deterministic or seeded');
  const ids = new Set(p.shipments.map((s) => s.id));
  for (const i of interventions) {
    if (i.type === 'reroute') {
      const s = p.shipments.find((x) => x.id === i.shipment);
      if (s === undefined) problems.push(`reroute: shipment ${i.shipment} is not in the twin`);
      else if (!REROUTABLE_STATUSES.includes(s.status)) problems.push(`reroute: shipment ${i.shipment} has status ${s.status} and cannot be rerouted`);
    } else if (i.type === 'air_bridge') {
      if (i.component !== p.component) problems.push(`air_bridge: component ${i.component} is not this run's component`);
      if (!Number.isFinite(i.weeks) || i.weeks <= 0) problems.push('air_bridge: weeks must be positive');
      if (!isDay(i.decision_date)) problems.push('air_bridge: decision_date must be a calendar day');
    } else if (i.type === 'draw_down') {
      if (i.component !== p.component) problems.push(`draw_down: component ${i.component} is not this run's component`);
      if (!isDay(i.from) || !isDay(i.to) || i.to < i.from) problems.push('draw_down: from/to must be calendar days with to >= from');
    } else if (i.type !== 'none') problems.push(`unknown intervention ${(i as { type: string }).type}`);
  }
  if (interventions.length === 0) problems.push('a run declares its interventions; `none` is an intervention');
  void ids;
  return problems;
}

/** One deterministic trajectory; `jitterFor` supplies the per-shipment lead-time jitter (0 in deterministic mode). */
function trajectory(p: SupplyFlowParams, o: SupplyFlowOptions, interventions: Intervention[], jitterFor: (shipmentIndex: number) => number) {
  const daily = p.weekly_consumption / 7;
  const rerouted = new Set(interventions.filter((i): i is Extract<Intervention, { type: 'reroute' }> => i.type === 'reroute').map((i) => i.shipment));
  const arrivals = new Map<string, number>();
  const arrivalRows: SupplyFlowOutputs['arrivals'] = [];
  let rerouteCost = 0; let airCost = 0;
  p.shipments.forEach((s, idx) => {
    const isRerouted = rerouted.has(s.id);
    const exposed = EXPOSED_POSITIONS.includes(s.position);
    const delay = (isRerouted ? p.reroute_delay_days : 0) + (o.shock && exposed && !isRerouted ? p.corridor_delay_days : 0);
    const jitter = jitterFor(idx);
    const date = addDays(s.eta_port, p.inland_days + delay + jitter);
    arrivals.set(date, (arrivals.get(date) ?? 0) + s.qty);
    arrivalRows.push({ source: s.id, date, qty: qty(s.qty), exposed, rerouted: isRerouted, delay_days: delay, jitter_days: jitter });
    if (isRerouted) rerouteCost += Math.ceil(s.qty / p.units_per_container) * p.reroute_cost_per_container;
  });
  for (const i of interventions) {
    if (i.type === 'air_bridge') {
      const units = i.weeks * p.weekly_consumption;
      const date = addDays(i.decision_date, p.air_lead_days);
      arrivals.set(date, (arrivals.get(date) ?? 0) + units);
      arrivalRows.push({ source: `air-bridge:${i.decision_date}`, date, qty: qty(units), exposed: false, rerouted: false, delay_days: 0, jitter_days: 0 });
      airCost += units * p.kg_per_unit * p.air_cost_per_kg;
    }
  }
  arrivalRows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.source < b.source ? -1 : 1));
  const drawDowns = interventions.filter((i): i is Extract<Intervention, { type: 'draw_down' }> => i.type === 'draw_down');
  const days: DayRow[] = [];
  let onHand = p.on_hand; let stops = 0; let below = 0; let minOnHand = p.on_hand; let firstStop: string | null = null;
  for (let t = 0; t < o.horizon_days; t += 1) {
    const date = addDays(p.t0, t);
    const start = onHand;
    const arr = arrivals.get(date) ?? 0;
    const policy = drawDowns.some((d) => date >= d.from && date <= d.to) ? 'consume_to_zero' : p.production_policy;
    const available = start + arr;
    const runs = policy === 'hold_safety_stock' ? available - daily >= p.safety_stock : available >= daily;
    const consumed = runs ? daily : 0;
    onHand = available - consumed;
    if (!runs) { stops += 1; if (firstStop === null) firstStop = date; }
    if (onHand < p.safety_stock) below += 1;
    if (onHand < minOnHand) minOnHand = onHand;
    days.push({ date, on_hand_start: qty(start), arrivals: qty(arr), consumed: qty(consumed), on_hand_end: qty(onHand), line_stop: !runs, below_safety_stock: onHand < p.safety_stock });
  }
  const lineStopCost = stops * p.line_stop_cost_per_day;
  const totals: Totals = {
    line_stop_days: stops, days_below_safety_stock: below, min_on_hand: qty(minOnHand), first_line_stop_date: firstStop,
    cost: { reroute: money(rerouteCost), air: money(airCost), line_stop: money(lineStopCost), total: money(rerouteCost + airCost + lineStopCost) },
  };
  return { arrivals: arrivalRows, days, totals };
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return sorted[lo] === undefined ? 0 : (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo);
}

/** Execute the specification. Throws on an invalid contract; never on the numbers. */
export function simulateSupplyFlow(p: SupplyFlowParams, o: SupplyFlowOptions, interventions: Intervention[]): SupplyFlowOutputs {
  const problems = validateParams(p, o, interventions);
  if (problems.length > 0) throw new Error(`supply-flow@1 contract invalid: ${problems.join('; ')}`);
  const horizon = { from: p.t0, to: addDays(p.t0, o.horizon_days - 1), days: o.horizon_days };
  const canonicalInterventions = [...interventions].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  if (o.stochastic.mode === 'deterministic') {
    const t = trajectory(p, o, canonicalInterventions, () => 0);
    return { method_ref: SUPPLY_FLOW_METHOD_REF, component: p.component, horizon, policy: p.production_policy, shock: o.shock,
             interventions: canonicalInterventions, ...t, stochastic: { mode: 'deterministic' } };
  }
  const { seed, samples, jitter } = o.stochastic;
  const sampleTotals: Totals[] = [];
  for (let s = 0; s < samples; s += 1) {
    const rng = xoshiro128ss((seed ^ Math.imul(s + 1, 0x9e3779b1)) >>> 0);
    const draws = p.shipments.map(() => drawJitter(rng(), jitter));
    sampleTotals.push(trajectory(p, o, canonicalInterventions, (i) => draws[i] ?? 0).totals);
  }
  const base = trajectory(p, o, canonicalInterventions, () => 0);
  const summarise = (pick: (t: Totals) => number, fmt: (x: number) => string) => {
    const xs = sampleTotals.map(pick).sort((a, b) => a - b);
    return { min: fmt(xs[0] ?? 0), p10: fmt(quantile(xs, 0.1)), median: fmt(quantile(xs, 0.5)), p90: fmt(quantile(xs, 0.9)), max: fmt(xs[xs.length - 1] ?? 0) };
  };
  return {
    method_ref: SUPPLY_FLOW_METHOD_REF, component: p.component, horizon, policy: p.production_policy, shock: o.shock, interventions: canonicalInterventions,
    ...base,
    stochastic: { mode: 'seeded', rng: RNG_ALGORITHM, seed, samples, jitter,
      summary: { line_stop_days: summarise((t) => t.line_stop_days, (x) => roundHalfEven(x, 3)),
                 days_below_safety_stock: summarise((t) => t.days_below_safety_stock, (x) => roundHalfEven(x, 3)),
                 total_cost: summarise((t) => Number(t.cost.total), money) },
      sample_totals: sampleTotals },
  };
}
