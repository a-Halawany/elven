/**
 * NONLINEAR RESPONSE ACROSS THE OPERATING ENVELOPE — the pure core of CP-6 B30 part `experiments` (0103 §EX.5; F-P5-07 V02-T-167, rule
 * sxp-sweep@1). No clock, no I/O: every number is the pinned supply-flow@1 over a run's STORED contract on its deterministic trajectory,
 * or arithmetic over such outputs.
 *
 *   THE FACTORS: each range of the behaviour model's operating envelope that names a parameter the contract carries — by its field
 *   (`corridor_delay_days`), its element-key prefix (`consumption.weekly` → weekly_consumption) or the horizon (`horizon_days`).
 *   THE GRID: `points` values from the range's low to its high bound, evenly spaced (whole days stay whole; a grid finer than the whole
 *   days of its range is refused rather than repeated).
 *   THE RESPONSE: the metric at each grid value with every other factor at its base; its slopes; its NONLINEARITY (the largest gap to the
 *   chord through the end points as a share of the response's span — nonlinear above 5%); its CURVATURE (the largest change of slope
 *   between neighbouring segments as a share of the steepest slope); its THRESHOLDS (an interior grid point where the slope changes by more
 *   than half the steepest slope: onset from flat, saturation to flat, else a kink).
 *   THE INTERACTIONS (hidden dependencies): every pair of factors at its four corners (each at its low or high bound, the rest at base);
 *   the interaction hh − hl − lh + ll against the larger of the two main effects — a HIDDEN DEPENDENCY above 10%.
 * The port (simulation.sweep_envelope) recomputes the nonlinearity of every grid and every interaction from its corners.
 */
import { createHash } from 'node:crypto';
import { jcsCanonicalize } from '@eye/contracts';
import { simulateSupplyFlow, type Intervention, type SupplyFlowOptions, type SupplyFlowParams } from '../../models/supply-flow.js';
import { SUPPLY_FLOW_FACTORS, metricOf, round6, type SupplyMetric } from '../impact/impact-core.js';

export const SWEEP_RULE = 'sxp-sweep@1';
export const NONLINEAR_ABOVE = 0.05;
export const HIDDEN_ABOVE = 0.1;
export const THRESHOLD_SLOPE_SHARE = 0.5;
const WHOLE: ReadonlySet<string> = new Set(['horizon_days', 'inland_days', 'reroute_delay_days', 'air_lead_days', 'corridor_delay_days']);

export interface SweepFactor { key: string; field: string; whole: boolean; range: [number, number]; base: number }
export interface Threshold { kind: 'onset' | 'saturation' | 'kink'; at: number; between: [number, number]; slope_before: number; slope_after: number }
export interface FactorResponse {
  key: string; field: string; range: [number, number]; base_value: number; grid: Array<{ value: number; metric: number }>; slopes: number[];
  nonlinearity: number; nonlinear: boolean; curvature: number; response: 'flat' | 'linear' | 'nonlinear'; thresholds: Threshold[];
}
export interface Interaction { factors: [string, string]; corners: { ll: number; lh: number; hl: number; hh: number }; main_a: number; main_b: number; interaction: number; relative: number; hidden_dependency: boolean }

/** The envelope's factors this contract carries (in the envelope's key order, sorted). */
export function sweepFactors(params: SupplyFlowParams, options: SupplyFlowOptions, envelope: Record<string, unknown>): SweepFactor[] {
  const out: SweepFactor[] = [];
  for (const key of Object.keys(envelope).sort()) {
    const r = envelope[key];
    if (!Array.isArray(r) || r.length !== 2 || !r.every((x) => typeof x === 'number' && Number.isFinite(x)) || (r[0] as number) >= (r[1] as number)) continue;
    let field: string | null = null; let base: number | null = null;
    if (key === 'horizon_days') { field = 'horizon_days'; base = options.horizon_days; }
    else {
      const byPrefix = SUPPLY_FLOW_FACTORS.find(([prefix, f]) => prefix === key || f === key);
      if (byPrefix !== undefined) { field = byPrefix[1]; base = params[byPrefix[1]] as unknown as number; }
    }
    if (field === null || typeof base !== 'number' || !Number.isFinite(base)) continue;
    out.push({ key, field, whole: WHOLE.has(field), range: [r[0] as number, r[1] as number], base });
  }
  return out;
}

/** The grid: `points` values from low to high, evenly spaced; whole days rounded — a grid that would repeat a value is refused. */
export function gridOf(f: Pick<SweepFactor, 'range' | 'whole' | 'key'>, points: number): number[] {
  if (!Number.isInteger(points) || points < 3 || points > 25) throw new Error('a grid has 3 to 25 points');
  const [lo, hi] = f.range;
  const xs = Array.from({ length: points }, (_, i) => (i === 0 ? lo : i === points - 1 ? hi : lo + ((hi - lo) * i) / (points - 1))).map((x) => (f.whole ? Math.round(x) : round6(x)));
  for (let i = 1; i < xs.length; i += 1) if ((xs[i] as number) <= (xs[i - 1] as number)) throw new Error(`the grid of ${f.key} repeats a value: ${points} points are finer than its range [${lo}, ${hi}] allows`);
  return xs;
}

/** The response's shape from its grid (rule sxp-sweep@1). */
export function analyseResponse(xs: number[], ms: number[]): Pick<FactorResponse, 'slopes' | 'nonlinearity' | 'nonlinear' | 'curvature' | 'response' | 'thresholds'> {
  const g = xs.length;
  const slopes = xs.slice(1).map((x, i) => round6(((ms[i + 1] as number) - (ms[i] as number)) / (x - (xs[i] as number))));
  const span = Math.max(...ms) - Math.min(...ms);
  let gap = 0;
  if (span > 0) {
    for (let i = 0; i < g; i += 1) {
      const chord = (ms[0] as number) + ((ms[g - 1] as number) - (ms[0] as number)) * ((xs[i] as number) - (xs[0] as number)) / ((xs[g - 1] as number) - (xs[0] as number));
      gap = Math.max(gap, Math.abs((ms[i] as number) - chord) / span);
    }
  }
  const nonlinearity = round6(gap);
  const steepest = Math.max(0, ...slopes.map(Math.abs));
  let bend = 0;
  const thresholds: Threshold[] = [];
  for (let i = 1; i < slopes.length; i += 1) {
    const before = slopes[i - 1] as number; const after = slopes[i] as number; const d = Math.abs(after - before);
    bend = Math.max(bend, d);
    if (steepest > 0 && d > THRESHOLD_SLOPE_SHARE * steepest) {
      thresholds.push({ kind: before === 0 ? 'onset' : after === 0 ? 'saturation' : 'kink', at: xs[i] as number, between: [xs[i - 1] as number, xs[i + 1] as number], slope_before: before, slope_after: after });
    }
  }
  const nonlinear = nonlinearity > NONLINEAR_ABOVE;
  return { slopes, nonlinearity, nonlinear, curvature: steepest === 0 ? 0 : round6(bend / steepest), response: span === 0 ? 'flat' : nonlinear ? 'nonlinear' : 'linear', thresholds };
}

/** One pair's interaction from its four corners (rule sxp-sweep@1). */
export function interactionOf(a: string, b: string, corners: Interaction['corners']): Interaction {
  const { ll, lh, hl, hh } = corners;
  const mainA = round6(((hl + hh) - (ll + lh)) / 2); const mainB = round6(((lh + hh) - (ll + hl)) / 2); const inter = round6(hh - hl - lh + ll);
  const den = Math.max(Math.abs(mainA), Math.abs(mainB));
  const relative = round6(den === 0 ? (inter === 0 ? 0 : 1) : Math.abs(inter) / den);
  return { factors: [a, b], corners, main_a: mainA, main_b: mainB, interaction: inter, relative, hidden_dependency: relative > HIDDEN_ABOVE && inter !== 0 };
}

const withFactor = (params: SupplyFlowParams, options: SupplyFlowOptions, f: SweepFactor, v: number): { params: SupplyFlowParams; options: SupplyFlowOptions } =>
  f.field === 'horizon_days' ? { params, options: { ...options, horizon_days: v } } : { params: { ...params, [f.field]: v }, options };

/** THE SWEEP over a supply-flow contract (deterministic trajectory). */
export function envelopeSweep(a: { params: SupplyFlowParams; options: SupplyFlowOptions; interventions: Intervention[]; envelope: Record<string, unknown>; metric: SupplyMetric; points: number }):
  { base: number; factors: FactorResponse[]; interactions: Interaction[] } {
  const det: SupplyFlowOptions = { ...a.options, stochastic: { mode: 'deterministic' } };
  const at = (p: SupplyFlowParams, o: SupplyFlowOptions): number => round6(metricOf(simulateSupplyFlow(p, o, a.interventions).totals, a.metric));
  const base = at(a.params, det);
  const defs = sweepFactors(a.params, det, a.envelope);
  const factors: FactorResponse[] = defs.map((f) => {
    const xs = gridOf(f, a.points);
    const ms = xs.map((v) => { const c = withFactor(a.params, det, f, v); return at(c.params, c.options); });
    return { key: f.key, field: f.field, range: f.range, base_value: f.base, grid: xs.map((v, i) => ({ value: v, metric: ms[i] as number })), ...analyseResponse(xs, ms) };
  });
  const interactions: Interaction[] = [];
  for (let i = 0; i < defs.length; i += 1) {
    for (let j = i + 1; j < defs.length; j += 1) {
      const fa = defs[i]!; const fb = defs[j]!;
      const corner = (va: number, vb: number): number => { const c1 = withFactor(a.params, det, fa, va); const c2 = withFactor(c1.params, c1.options, fb, vb); return at(c2.params, c2.options); };
      interactions.push(interactionOf(fa.key, fb.key, { ll: corner(fa.range[0], fb.range[0]), lh: corner(fa.range[0], fb.range[1]), hl: corner(fa.range[1], fb.range[0]), hh: corner(fa.range[1], fb.range[1]) }));
    }
  }
  return { base, factors, interactions };
}

export const sweepDigest = (v: unknown): string => createHash('sha256').update(jcsCanonicalize(v)).digest('hex');
