/**
 * discrete-event@1 — CP-6 B29 §C (0092): a DISCRETE-EVENT simulation of a production line (F-P5-05 clause 2, family `discrete-event`).
 *
 * The line is a sequence of STATIONS (each with a cycle time) separated by finite BUFFERS; the first station consumes `bom.per_unit`
 * units of the run's COMPONENT (the bearing) per unit started, from a component stock replenished by a daily INBOUND delivery at the
 * start of each working day. Time is WORKING time: day d spans the minutes [d·M, (d+1)·M) of `line.minutes_per_day` M, so a job in
 * progress at the end of a day finishes early the next. Events are processed in (time, sequence) order from a binary heap: a station
 * finishing moves its unit into the downstream buffer, or is BLOCKED while that buffer is full; a station starts when it holds input
 * (the component stock for the first, the upstream buffer for the others). A SUPPLY SHORTAGE window (params.shortage: from start_day,
 * for `days`, deliveries at `fraction` of the daily inbound, floored) starves the first station; the day's starved minutes are
 * counted, and a day starved for half its minutes or more is a LINE-STOP day. Demand (`demand.daily`) opens orders each day; the
 * finished units ship against them and the unshipped orders are the BACKLOG.
 *
 * Reported per day: deliveries, the component stock, consumption, output, shipments, backlog, starved minutes, line stop and every
 * buffer's level; the summary (totals, peak backlog, line-stop days); the BALANCES of the component stock, the finished goods and
 * every buffer (opening + inflow − outflow = closing, for §D's conservation checks). PURE: no clock, no I/O; a seeded run draws each
 * cycle time's variation (`variability`, uniform ±) from xoshiro128** (imported from supply-flow@1, whose bytes are pinned there);
 * a deterministic run uses the cycle times as declared. The pinned digest (discrete-event.digest.ts) is this file's sha256.
 */
import type { MethodAdapter, MethodElement, MethodInput, MethodOutput } from './types.js';
import { addDays, roundHalfEven, xoshiro128ss } from '../models/supply-flow.js';
import { DISCRETE_EVENT_IMPLEMENTATION_DIGEST } from './discrete-event.digest.js';

export const DISCRETE_EVENT_METHOD_REF = 'discrete-event@1';
export const DISCRETE_EVENT_REQUIRED_INPUTS: readonly string[] = Object.freeze(['line.station', 'line.buffer', 'line.minutes_per_day', 'bom.per_unit', 'inventory.on_hand', 'inbound.daily', 'demand.daily']);
/** The bound on the events one run may process (days × stations × minutes / the shortest cycle): a larger run is refused, never truncated. */
const MAX_EVENTS = 5_000_000;

interface Station { id: string; seq: number; cycle: number; variability: number }
interface Buffer { id: string; after: number; capacity: number; initial: number }
interface Line {
  component: string; start: string; minutes: number; perUnit: number; stock: number; inbound: number; demand: number;
  stations: Station[]; buffers: Buffer[]; shortage: { start: number; days: number; fraction: number } | null;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const isInt = (x: number, min: number): boolean => Number.isInteger(x) && x >= min;
/** The component's own element (`prefix:component`), else the shared one (`prefix`). */
function scoped(els: MethodElement[], prefix: string, component: string): unknown {
  return (els.find((e) => e.key === `${prefix}:${component}`) ?? els.find((e) => e.key === prefix))?.value;
}

function readLine(input: MethodInput): { line: Line | null; problems: string[] } {
  const problems: string[] = [];
  const p = input.params ?? {};
  const component = p['component'];
  if (typeof component !== 'string' || component.length < 2) problems.push('params.component names the component the first station consumes');
  if (!isDay(p['start_date'])) problems.push('params.start_date is the first simulated day (YYYY-MM-DD)');
  if (!isInt(input.horizonDays, 1) || input.horizonDays > 365) problems.push('horizonDays is an integer in [1, 365]');
  let shortage: Line['shortage'] = null;
  if (p['shortage'] !== undefined && p['shortage'] !== null) {
    const s = p['shortage'] as Record<string, unknown>;
    const start = num(s['start_day']); const days = num(s['days']); const fraction = num(s['fraction']);
    if (typeof s !== 'object' || Array.isArray(s) || !isInt(start, 0) || !isInt(days, 1) || !(fraction >= 0 && fraction <= 1)) {
      problems.push('params.shortage is { start_day (integer ≥ 0), days (integer ≥ 1), fraction (0..1 of the daily inbound delivered) }');
    } else shortage = { start, days, fraction };
  }
  const comp = typeof component === 'string' ? component : '';
  const minutes = num(input.elements.find((e) => e.key === 'line.minutes_per_day')?.value);
  if (!(minutes > 0 && minutes <= 1440)) problems.push('line.minutes_per_day is in (0, 1440]');
  const perUnit = num(scoped(input.elements, 'bom.per_unit', comp));
  if (!isInt(perUnit, 1)) problems.push(`bom.per_unit:${comp} is a positive integer`);
  const stock = num(scoped(input.elements, 'inventory.on_hand', comp));
  if (!isInt(stock, 0)) problems.push(`inventory.on_hand:${comp} is a non-negative integer`);
  const inbound = num(scoped(input.elements, 'inbound.daily', comp));
  if (!isInt(inbound, 0)) problems.push(`inbound.daily:${comp} is a non-negative integer`);
  const demand = num(input.elements.find((e) => e.key === 'demand.daily')?.value);
  if (!isInt(demand, 0)) problems.push('demand.daily is a non-negative integer');
  const stations: Station[] = [];
  for (const e of input.elements.filter((x) => x.key.startsWith('line.station:'))) {
    const v = (e.value ?? {}) as Record<string, unknown>;
    const seq = num(v['seq']); const cycle = num(v['cycle_minutes']); const variability = v['variability'] === undefined ? 0 : num(v['variability']);
    if (!isInt(seq, 1) || !(cycle >= 0.05 && cycle <= 1440) || !(variability >= 0 && variability <= 0.9)) {
      problems.push(`${e.key} is { seq (integer ≥ 1), cycle_minutes (0.05..1440), variability (0..0.9, optional) }`);
      continue;
    }
    stations.push({ id: e.key.slice('line.station:'.length), seq, cycle, variability });
  }
  stations.sort((a, b) => a.seq - b.seq);
  if (stations.length === 0) problems.push('the line has no station (line.station:<id>)');
  stations.forEach((s, i) => { if (s.seq !== i + 1) problems.push(`the stations' seq run 1..${stations.length} without gaps or repeats (found ${s.seq} at position ${i + 1})`); });
  const buffers: Buffer[] = [];
  for (const e of input.elements.filter((x) => x.key.startsWith('line.buffer:'))) {
    const v = (e.value ?? {}) as Record<string, unknown>;
    const after = num(v['after_seq']); const capacity = num(v['capacity']); const initial = v['initial'] === undefined ? 0 : num(v['initial']);
    if (!isInt(after, 1) || !isInt(capacity, 1) || !isInt(initial, 0) || initial > capacity) {
      problems.push(`${e.key} is { after_seq (integer ≥ 1), capacity (integer ≥ 1), initial (0..capacity, optional) }`);
      continue;
    }
    buffers.push({ id: e.key.slice('line.buffer:'.length), after, capacity, initial });
  }
  buffers.sort((a, b) => a.after - b.after);
  for (let s = 1; s < stations.length; s++) {
    const n = buffers.filter((b) => b.after === s).length;
    if (n !== 1) problems.push(`exactly one buffer follows station ${s} (found ${n})`);
  }
  for (const b of buffers) if (b.after >= stations.length && stations.length > 0) problems.push(`line.buffer:${b.id} follows station ${b.after}, which has no downstream station`);
  if (problems.length === 0) {
    const minCycle = Math.min(...stations.map((s) => s.cycle * (1 - s.variability)));
    const events = input.horizonDays * stations.length * (minutes / minCycle);
    if (events > MAX_EVENTS) problems.push(`the run would process up to ${Math.round(events)} events, above the bound of ${MAX_EVENTS}; shorten the horizon or coarsen the cycle times`);
  }
  if (problems.length > 0) return { line: null, problems };
  return { line: { component: comp, start: p['start_date'] as string, minutes, perUnit, stock, inbound, demand, stations, buffers, shortage }, problems };
}

/** A binary min-heap of finish events by (time, sequence): the sequence breaks ties in the order the events were scheduled. */
class EventHeap {
  private readonly a: Array<{ t: number; seq: number; station: number }> = [];
  private n = 0;
  get size(): number { return this.a.length; }
  peek(): { t: number; seq: number; station: number } | undefined { return this.a[0]; }
  push(t: number, station: number): void {
    const e = { t, seq: this.n++, station };
    this.a.push(e);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(this.a[i]!, this.a[p]!)) break;
      [this.a[i], this.a[p]] = [this.a[p]!, this.a[i]!]; i = p;
    }
  }
  pop(): { t: number; seq: number; station: number } | undefined {
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length > 0 && last !== undefined) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < this.a.length && this.less(this.a[l]!, this.a[m]!)) m = l;
        if (r < this.a.length && this.less(this.a[r]!, this.a[m]!)) m = r;
        if (m === i) break;
        [this.a[i], this.a[m]] = [this.a[m]!, this.a[i]!]; i = m;
      }
    }
    return top;
  }
  private less(x: { t: number; seq: number }, y: { t: number; seq: number }): boolean { return x.t < y.t || (x.t === y.t && x.seq < y.seq); }
}

export function simulateLine(input: MethodInput): MethodOutput {
  const { line: m, problems } = readLine(input);
  if (m === null) throw new Error(`${DISCRETE_EVENT_METHOD_REF} input invalid: ${problems.join('; ')}`);
  const rng = input.seed === null ? null : xoshiro128ss(input.seed >>> 0);
  const n = m.stations.length; const M = m.minutes;
  const cap = m.stations.slice(0, n - 1).map((_, i) => m.buffers.find((b) => b.after === i + 1)!.capacity);
  const level = m.stations.slice(0, n - 1).map((_, i) => m.buffers.find((b) => b.after === i + 1)!.initial);
  const bufIn = level.map(() => 0); const bufOut = level.map(() => 0);
  const busy = new Array<boolean>(n).fill(false); const blocked = new Array<boolean>(n).fill(false);
  const heap = new EventHeap();
  let stock = m.stock; let received = 0; let consumed = 0; let output = 0; let starvedSince: number | null = null;

  const duration = (s: Station): number => (rng === null || s.variability === 0 ? s.cycle : s.cycle * (1 + s.variability * (2 * rng() - 1)));
  const tryStart = (i: number, now: number): boolean => {
    if (busy[i] || blocked[i]) return false;
    if (i === 0) {
      if (stock < m.perUnit) { if (starvedSince === null) starvedSince = now; return false; }
      stock -= m.perUnit; consumed += m.perUnit;
    } else {
      if (level[i - 1]! <= 0) return false;
      level[i - 1] = level[i - 1]! - 1; bufOut[i - 1] = bufOut[i - 1]! + 1;
    }
    busy[i] = true;
    heap.push(now + duration(m.stations[i]!), i);
    return true;
  };
  /* Move blocked units downstream and start every station that can, until nothing changes (downstream first: space frees upstream). */
  const settle = (now: number): void => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = n - 1; i >= 0; i--) {
        if (blocked[i] && i < n - 1 && level[i]! < cap[i]!) { level[i] = level[i]! + 1; bufIn[i] = bufIn[i]! + 1; blocked[i] = false; changed = true; }
        if (tryStart(i, now)) changed = true;
      }
    }
  };

  const series: MethodOutput['series'] = [];
  let openOrders = 0; let finished = 0; let shippedTotal = 0; let peakBacklog = 0; let lineStops = 0; let starvedTotal = 0; let shortageDays = 0; let demandTotal = 0;
  for (let d = 0; d < input.horizonDays; d++) {
    const t1 = (d + 1) * M;
    const short = m.shortage !== null && d >= m.shortage.start && d < m.shortage.start + m.shortage.days;
    if (short) shortageDays++;
    const deliveries = short ? Math.floor(m.inbound * m.shortage!.fraction) : m.inbound;
    stock += deliveries; received += deliveries;
    starvedSince = null;
    const outputBefore = output; const consumedBefore = consumed;
    settle(d * M);
    for (let e = heap.peek(); e !== undefined && e.t < t1; e = heap.peek()) {
      heap.pop();
      const i = e.station;
      busy[i] = false;
      if (i === n - 1) output++;
      else if (level[i]! < cap[i]!) { level[i] = level[i]! + 1; bufIn[i] = bufIn[i]! + 1; }
      else blocked[i] = true;
      settle(e.t);
    }
    const starved = starvedSince === null ? 0 : t1 - (starvedSince as number);
    starvedTotal += starved;
    const lineStop = starved >= M / 2;
    if (lineStop) lineStops++;
    const made = output - outputBefore;
    openOrders += m.demand; demandTotal += m.demand;
    const ship = Math.min(openOrders, finished + made);
    finished += made - ship; openOrders -= ship; shippedTotal += ship;
    if (openOrders > peakBacklog) peakBacklog = openOrders;
    const row: Record<string, string | number | boolean | null> = {
      day: d + 1, date: addDays(m.start, d), shortage: short, deliveries: String(deliveries), component_stock_end: String(stock), consumed: String(consumed - consumedBefore),
      output: String(made), shipped: String(ship), backlog: String(openOrders), starved_minutes: roundHalfEven(starved, 1), line_stop: lineStop,
    };
    m.buffers.forEach((b) => { row[`buffer:${b.id}`] = String(level[b.after - 1]); });
    series.push(row);
  }
  const bottleneck = Math.max(...m.stations.map((s) => s.cycle));
  return {
    series,
    summary: {
      component: m.component, horizon_days: input.horizonDays, total_output: String(output), total_demand: String(demandTotal), total_shipped: String(shippedTotal),
      final_backlog: String(openOrders), peak_backlog: String(peakBacklog), line_stop_days: lineStops, shortage_days: shortageDays,
      starved_minutes: roundHalfEven(starvedTotal, 1), avg_daily_output: roundHalfEven(output / input.horizonDays, 2),
      unconstrained_daily_capacity: roundHalfEven(M / bottleneck, 2), bottleneck_station: m.stations.find((s) => s.cycle === bottleneck)!.id,
    },
    balances: [
      { key: `inventory.on_hand:${m.component}`, opening: m.stock, inflow: received, outflow: consumed, closing: stock },
      { key: 'finished_goods', opening: 0, inflow: output, outflow: shippedTotal, closing: finished },
      ...m.buffers.map((b) => ({ key: `line.buffer:${b.id}`, opening: b.initial, inflow: bufIn[b.after - 1]!, outflow: bufOut[b.after - 1]!, closing: level[b.after - 1]! })),
    ],
  };
}

/** The fixed PROBE input of this method: a two-station line over three days (the fabric's probe runs it after a fault, §C). */
export const DISCRETE_EVENT_PROBE: MethodInput = {
  modelRef: DISCRETE_EVENT_METHOD_REF, params: { component: 'probe-part', start_date: '2026-01-05', shortage: { start_day: 1, days: 1, fraction: 0.5 } },
  elements: [
    { key: 'line.station:a', value: { seq: 1, cycle_minutes: 2 }, unit: null }, { key: 'line.station:b', value: { seq: 2, cycle_minutes: 3 }, unit: null },
    { key: 'line.buffer:ab', value: { after_seq: 1, capacity: 10, initial: 0 }, unit: null }, { key: 'line.minutes_per_day', value: 120, unit: 'min' },
    { key: 'bom.per_unit:probe-part', value: 1, unit: 'pcs' }, { key: 'inventory.on_hand:probe-part', value: 10, unit: 'pcs' },
    { key: 'inbound.daily:probe-part', value: 40, unit: 'pcs' }, { key: 'demand.daily', value: 40, unit: 'units' },
  ],
  horizonDays: 3, seed: null,
};

export const discreteEventAdapter: MethodAdapter = {
  modelRef: DISCRETE_EVENT_METHOD_REF, family: 'discrete-event', digest: DISCRETE_EVENT_IMPLEMENTATION_DIGEST, requiredInputs: DISCRETE_EVENT_REQUIRED_INPUTS,
  validate: (input) => readLine(input).problems,
  run: simulateLine,
};
