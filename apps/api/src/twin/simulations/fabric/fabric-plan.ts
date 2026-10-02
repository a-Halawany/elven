/**
 * CHUNKED METHOD-FABRIC EXPERIMENTS — the pure logic of CP-6 B30 part `experiments` (0103 §EX.2/§EX.3; F-P5-06: L8-C06, PR-35-001,
 * V03-T-354, ES-38-007/-009, V04-T-034). No database, no process.
 *
 * THE PER-PATH STREAM. supply-flow@1 draws path s from xoshiro128** seeded with `seed ^ imul(s + 1, 0x9e3779b1)`. A fabric adapter draws
 * from its OWN stream seeded with its input's seed (discrete-event@1's cycle-time variation, counterfactual@1's noise, war-gaming@1's random
 * adversary). A path s of a fabric experiment is therefore ONE execution of the adapter over the run's stored contract with the seed
 * `pathSeed(seed, s)` — the same per-path seed supply-flow@1 uses, applied per adapter. A chunk [first, first + n) is the n executions at
 * those indexes: deterministic per seed offset (the same chunk run twice, in any process, is the same paths and the same digest), and
 * independent of the chunking (a path's value depends on its global index only).
 *
 * THE PROJECTION (rule fabric-measures@1). An experiment measures total_cost, line_stop_days or days_below_safety_stock (B31's vocabulary;
 * the declaration port is not re-declared). Each chunkable fabric method states which of them its summary reports, and from which field:
 *   discrete-event@1  line_stop_days ← summary.line_stop_days (days the line was starved for half its minutes or more)
 *   counterfactual@1  line_stop_days ← summary.do_stop_days (the stop days of the do-world)
 *   war-gaming@1      total_cost     ← summary.total_residual + summary.response_cost (the residual damage and the responses' cost, k€)
 * A measure a method does not report is not declarable for its experiment. system-dynamics@1 and optimisation@1 draw nothing (every path
 * would be the same) and agent-based@1 reports none of the measures: they are not chunkable.
 */
import { createHash } from 'node:crypto';
import { jcsCanonicalize } from '@eye/contracts';
import type { MethodAdapter, MethodInput } from '../../methods/types.js';
import { RNG_ALGORITHM, roundHalfEven } from '../../models/supply-flow.js';

type Row = Record<string, unknown>;
export const FABRIC_MEASURE_RULE = 'fabric-measures@1';
export type Measure = 'total_cost' | 'line_stop_days' | 'days_below_safety_stock';

export interface Projection { measure: Measure; from: string; unit: string; read: (summary: Record<string, unknown>) => number }
/** A number rounded half-even to dp decimals (supply-flow@1's rounding, as a number). */
const rhe = (x: number, dp: number): number => Number(roundHalfEven(x, dp));
const n = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/** The chunkable fabric methods and what each projects onto the experiment measures (the header's table). */
export const FABRIC_PROJECTIONS: Readonly<Record<string, readonly Projection[]>> = Object.freeze({
  'discrete-event@1': [{ measure: 'line_stop_days', from: 'summary.line_stop_days', unit: 'days', read: (s) => n(s['line_stop_days']) }],
  'counterfactual@1': [{ measure: 'line_stop_days', from: 'summary.do_stop_days', unit: 'days', read: (s) => n(s['do_stop_days']) }],
  'war-gaming@1': [{ measure: 'total_cost', from: 'summary.total_residual + summary.response_cost', unit: 'k€', read: (s) => rhe(n(s['total_residual']) + n(s['response_cost']), 3) }],
});
export const FABRIC_CHUNKABLE: readonly string[] = Object.freeze(Object.keys(FABRIC_PROJECTIONS));
export const isFabricChunkable = (modelRef: unknown): boolean => typeof modelRef === 'string' && FABRIC_CHUNKABLE.includes(modelRef);
/** The measures a fabric method reports (an experiment of it declares among these; the default is all of them). */
export const fabricMeasures = (modelRef: string): Measure[] => (FABRIC_PROJECTIONS[modelRef] ?? []).map((p) => p.measure);

/** Path s's seed: supply-flow@1's per-path stream, applied per adapter. */
export const pathSeed = (seed: number, s: number): number => (seed ^ Math.imul(s + 1, 0x9e3779b1)) >>> 0;

/** One path of a fabric experiment: its index, its seed, the projected measures (the Totals shape B31's aggregate reads) and the method's numeric summary. */
export interface FabricPath {
  path: number; seed: number;
  line_stop_days?: number; days_below_safety_stock?: number; cost?: { total: number };
  summary: Record<string, number | string | boolean | null>;
}

/** The numeric (and short scalar) part of a summary kept on the path (the headline the page shows per path). */
function keptSummary(s: Record<string, unknown>): FabricPath['summary'] {
  const out: FabricPath['summary'] = {};
  for (const [k, v] of Object.entries(s)) if (v === null || typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 64)) out[k] = v as never;
  return out;
}

/** The projection of one execution's summary: every projected measure a finite number, or the reason it is not. */
export function projectPath(modelRef: string, s: number, seed: number, summary: Record<string, unknown>): FabricPath | { error: string } {
  const proj = FABRIC_PROJECTIONS[modelRef];
  if (proj === undefined) return { error: `${modelRef} is not a chunkable fabric method` };
  const p: FabricPath = { path: s, seed, summary: keptSummary(summary) };
  for (const x of proj) {
    const v = x.read(summary);
    if (!Number.isFinite(v)) return { error: `path ${s}: ${modelRef} answered no finite ${x.from} for ${x.measure}` };
    if (x.measure === 'total_cost') p.cost = { total: v }; else p[x.measure] = v;
  }
  return p;
}

/**
 * ONE CHUNK of a fabric experiment: the paths [first, first + count) — each the adapter run once over `base` (the run's stored contract as
 * a method input) with its path seed. The adapter is the caller's (the chunk worker resolves the product's builtin in its own process).
 */
export function fabricChunkPaths(adapter: MethodAdapter, base: MethodInput, runSeed: number, first: number, count: number, samples: number): FabricPath[] {
  if (!Number.isInteger(first) || !Number.isInteger(count) || first < 0 || count < 1 || first + count > samples) throw new Error(`chunk [${first}, ${first + count}) lies outside the contract's ${samples} paths`);
  const out: FabricPath[] = [];
  for (let s = first; s < first + count; s += 1) {
    const seed = pathSeed(runSeed, s);
    const input: MethodInput = { ...base, seed };
    const problems = adapter.validate(input);
    if (problems.length > 0) throw new Error(`path ${s}: ${adapter.modelRef} input invalid: ${problems.join('; ')}`);
    const o = adapter.run(input);
    const p = projectPath(adapter.modelRef, s, seed, o.summary);
    if ('error' in p) throw new Error(p.error);
    out.push(p);
  }
  return out;
}

export const digestOfJson = (v: unknown): string => createHash('sha256').update(jcsCanonicalize(v)).digest('hex');

/** The value of one measure on a path (the projected shape and supply-flow@1's Totals alike). */
export function measureOf(t: Row, measure: Measure): number {
  return measure === 'total_cost' ? n((t['cost'] as Row | undefined)?.['total']) : n(t[measure]);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo);
}

/**
 * THE RUN'S OUTPUTS from a fabric experiment's paths in path order: the projection named, the per-measure summary (min, p10, median, p90,
 * max) and mean, the paths themselves (stochastic.sample_totals — what B31's finish counts and §EX.6's validation reads).
 */
export function assembleFabricOutputs(modelRef: string, component: string, seed: number, paths: FabricPath[], measures: Measure[]): Row {
  const summary: Record<string, Row> = {}; const totals: Record<string, number> = {};
  for (const m of measures) {
    const xs = paths.map((p) => measureOf(p as unknown as Row, m)).sort((a, b) => a - b);
    const r6 = (x: number) => rhe(x, 6);
    summary[m] = { min: r6(xs[0] ?? 0), p10: r6(quantile(xs, 0.1)), median: r6(quantile(xs, 0.5)), p90: r6(quantile(xs, 0.9)), max: r6(xs[xs.length - 1] ?? 0) };
    totals[m] = xs.length === 0 ? 0 : r6(xs.reduce((a, b) => a + b, 0) / xs.length);
  }
  return {
    method_ref: modelRef, component, rule: FABRIC_MEASURE_RULE,
    projection: (FABRIC_PROJECTIONS[modelRef] ?? []).filter((p) => measures.includes(p.measure)).map((p) => ({ measure: p.measure, from: p.from, unit: p.unit })),
    totals: { ...totals, paths: paths.length },
    stochastic: { mode: 'seeded', rng: RNG_ALGORITHM, seed, samples: paths.length,
                  stream: 'path s: the adapter seeded with seed ^ imul(s + 1, 0x9e3779b1) (its own stream, per adapter)', summary, sample_totals: paths },
  };
}

/** The chunks' paths in path order, each chunk's digest re-checked against its stored paths (an altered row is refused, never assembled). */
export function fabricPathsInOrder(chunks: Array<{ chunk_index: number; first_path: number; paths: number; digest: string; sample_totals: unknown }>): { paths: FabricPath[]; indexes: number[] } {
  const sorted = [...chunks].sort((a, b) => a.first_path - b.first_path);
  const paths: FabricPath[] = []; const indexes: number[] = [];
  for (const c of sorted) {
    const st = c.sample_totals as FabricPath[];
    if (!Array.isArray(st) || st.length !== c.paths) throw new Error(`chunk ${c.chunk_index} holds ${Array.isArray(st) ? st.length : 0} paths, not ${c.paths}`);
    if (digestOfJson(st) !== c.digest) throw new Error(`chunk ${c.chunk_index}'s paths no longer have the digest it recorded`);
    paths.push(...st); indexes.push(c.chunk_index);
  }
  return { paths, indexes };
}

/**
 * THE CHECKPOINT READING (rule sxp-unstable@1) — the TS mirror of simulation.sxp_unstable_reading (the port is the authority; the unit
 * test pins both on the same cases): ACTED ON when a measure is `unstable` or the constraint indicator is violated or indeterminate;
 * FAULT-SHAPED when an unstable measure's mean moved more than half since a previous checkpoint that held 30 paths or more.
 */
export function unstableReading(stability: Record<string, { state?: string; change_since_previous?: number | null; n?: number }>, constraint: { outcome?: string } | null,
                                previous: Record<string, { n?: number }> | null): { acted: boolean; unstable: string[]; constraint: string; faultShaped: boolean; divergence: string[] } {
  const unstable: string[] = []; const divergence: string[] = [];
  for (const m of Object.keys(stability).sort()) {
    const s = stability[m]!;
    if (s.state !== 'unstable') continue;
    unstable.push(m);
    if (s.change_since_previous !== null && s.change_since_previous !== undefined && s.change_since_previous > 0.5 && (previous?.[m]?.n ?? 0) >= 30) divergence.push(m);
  }
  const cc = constraint?.outcome ?? 'not_applicable';
  return { acted: unstable.length > 0 || cc === 'violated' || cc === 'indeterminate', unstable, constraint: cc, faultShaped: divergence.length > 0, divergence };
}

export const UNSTABLE_POLICIES = ['stop', 'pause', 'none'] as const;
export type UnstablePolicy = (typeof UNSTABLE_POLICIES)[number];
