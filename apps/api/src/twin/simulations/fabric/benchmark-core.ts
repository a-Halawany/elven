/**
 * RARE EVENTS, MODEL DISCREPANCY, BENCHMARK VALIDATION AND CONVERGENCE OUTSIDE AN EXPERIMENT — the pure core of CP-6 B30 part
 * `experiments` (0103 §EX.6; F-P5-07 AI-50-004, rule sxp-benchmark@1). Arithmetic over a run's stored paths of one measure and an entered
 * sample of the same measure (observed — the evidence cited — or a benchmark — its basis stated). The port (simulation.validate_benchmark)
 * recomputes the discrepancy and the tail from the stored paths and decides the verdict; the convergence is this module's, checked there
 * at its end.
 *
 *   DISCREPANCY: the means, the bias (run − benchmark) and the relative bias (against |benchmark mean|; none when that mean is 0), the
 *   two-sample Kolmogorov–Smirnov distance (the largest gap between the two empirical distribution functions) and its 5% critical value
 *   1.358·√((n + m)/(n·m)), the run's p05–p95 band and the benchmark's share inside it.
 *   RARE EVENTS: the tail threshold (declared, else the benchmark's p95), the run's and the benchmark's frequency at or above it, their
 *   ratio, the run's tail paths and the tail paths it should hold (n × the benchmark's frequency): covered; under-represented below half;
 *   over-represented above twice (or any run tail where the benchmark has none); insufficient paths when fewer than 5 are expected.
 *   CONVERGENCE (outside an experiment): the running mean at every tenth of the paths (path order), its relative change and the 95%
 *   half-width relative to it; converged once the last three changes are ≤ 1% and the half-width ≤ 5% at 30 paths or more; not
 *   applicable to a single deterministic path.
 *   VERDICT: insufficient (fewer than 5 benchmark values, or fewer than 30 paths of a seeded run); discrepant (|relative bias| — or |bias|
 *   when the benchmark mean is 0 — above the tolerance, KS above its critical value, or the tail under-represented); else consistent.
 */
import { round6 } from '../impact/impact-core.js';

export const BENCHMARK_RULE = 'sxp-benchmark@1';
export const KS_C_ALPHA_05 = 1.358;

/** The linear-interpolation quantile of a sorted sample (PostgreSQL's percentile_cont). */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo);
}
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** The two-sample Kolmogorov–Smirnov distance: the largest gap between the empirical distribution functions, read at every value of either. */
export function ksDistance(a: number[], b: number[]): number {
  const sa = [...a].sort((x, y) => x - y); const sb = [...b].sort((x, y) => x - y);
  const values = [...new Set([...sa, ...sb])].sort((x, y) => x - y);
  let ia = 0; let ib = 0; let d = 0;
  for (const v of values) {
    while (ia < sa.length && (sa[ia] as number) <= v) ia += 1;
    while (ib < sb.length && (sb[ib] as number) <= v) ib += 1;
    d = Math.max(d, Math.abs(ia / sa.length - ib / sb.length));
  }
  return d;
}

export interface Discrepancy { run_paths: number; benchmark_n: number; run_mean: number; benchmark_mean: number; bias: number; relative_bias: number | null; ks: number; ks_critical: number; band: [number, number]; coverage_in_band: number }
export interface Tail { threshold: number; threshold_basis: string; run_frequency: number; benchmark_frequency: number; ratio: number | null; run_tail_paths: number; expected_tail_paths: number;
                        verdict: 'covered' | 'under_represented' | 'over_represented' | 'insufficient_paths' }
export interface Convergence { checkpoints: Array<{ paths: number; mean: number; relative_change: number | null; relative_half_width: number }>; converged_at: number | null; verdict: 'converged' | 'not_converged' | 'not_applicable' }

export function discrepancyOf(run: number[], bench: number[]): Discrepancy {
  const n = run.length; const m = bench.length;
  const rm = mean(run); const bm = mean(bench); const bias = rm - bm;
  const sr = [...run].sort((x, y) => x - y);
  const p05 = quantile(sr, 0.05); const p95 = quantile(sr, 0.95);
  return { run_paths: n, benchmark_n: m, run_mean: round6(rm), benchmark_mean: round6(bm), bias: round6(bias), relative_bias: bm === 0 ? null : round6(bias / Math.abs(bm)),
           ks: round6(ksDistance(run, bench)), ks_critical: round6(KS_C_ALPHA_05 * Math.sqrt((n + m) / (n * m))), band: [round6(p05), round6(p95)],
           coverage_in_band: round6(bench.filter((v) => v >= p05 && v <= p95).length / m) };
}

export function tailOf(run: number[], bench: number[], declared: number | null): Tail {
  const thr = declared ?? quantile([...bench].sort((x, y) => x - y), 0.95);
  const rf = run.filter((v) => v >= thr).length / run.length; const bf = bench.filter((v) => v >= thr).length / bench.length;
  const ratio = bf === 0 ? null : rf / bf;
  const verdict: Tail['verdict'] = bf === 0 && rf === 0 ? 'covered' : bf === 0 ? 'over_represented' : run.length * bf < 5 ? 'insufficient_paths'
    : (ratio as number) < 0.5 ? 'under_represented' : (ratio as number) > 2 ? 'over_represented' : 'covered';
  return { threshold: round6(thr), threshold_basis: declared === null ? 'the benchmark\'s p95' : 'declared', run_frequency: round6(rf), benchmark_frequency: round6(bf),
           ratio: ratio === null ? null : round6(ratio), run_tail_paths: run.filter((v) => v >= thr).length, expected_tail_paths: round6(run.length * bf), verdict };
}

export function convergenceOf(run: number[]): Convergence {
  if (run.length <= 1) return { checkpoints: [{ paths: run.length, mean: round6(run[0] ?? 0), relative_change: null, relative_half_width: 0 }], converged_at: null, verdict: 'not_applicable' };
  const ks = [...new Set(Array.from({ length: 10 }, (_, j) => Math.max(1, Math.ceil((run.length * (j + 1)) / 10))))];
  const checkpoints: Convergence['checkpoints'] = [];
  let prev: number | null = null;
  for (const k of ks) {
    const xs = run.slice(0, k); const mu = mean(xs);
    const v = k > 1 ? xs.reduce((s, x) => s + (x - mu) * (x - mu), 0) / (k - 1) : 0;
    const hw = 1.96 * Math.sqrt(v) / Math.sqrt(k);
    checkpoints.push({ paths: k, mean: round6(mu), relative_change: prev === null ? null : round6(prev === 0 ? Math.abs(mu - prev) : Math.abs(mu - prev) / Math.abs(prev)),
                       relative_half_width: round6(mu === 0 ? hw : hw / Math.abs(mu)) });
    prev = mu;
  }
  let convergedAt: number | null = null;
  for (let i = 3; i < checkpoints.length; i += 1) {
    const last3 = checkpoints.slice(i - 2, i + 1);
    const c = checkpoints[i]!;
    if (c.paths >= 30 && c.relative_half_width <= 0.05 && last3.every((x) => x.relative_change !== null && x.relative_change <= 0.01)) { convergedAt = c.paths; break; }
  }
  const tail = checkpoints.slice(-3); const last = checkpoints[checkpoints.length - 1]!;
  const converged = last.paths >= 30 && last.relative_half_width <= 0.05 && tail.length === 3 && tail.every((x) => x.relative_change !== null && x.relative_change <= 0.01);
  return { checkpoints, converged_at: converged ? convergedAt : null, verdict: converged ? 'converged' : 'not_converged' };
}

/** The verdict (the port decides the same from its own figures). */
export function verdictOf(d: Discrepancy, t: Tail, seeded: boolean, tolerance: number): 'consistent' | 'discrepant' | 'insufficient' {
  if (d.benchmark_n < 5 || (seeded && d.run_paths < 30)) return 'insufficient';
  const biasOut = d.relative_bias === null ? Math.abs(d.bias) > tolerance : Math.abs(d.relative_bias) > tolerance;
  return biasOut || d.ks > d.ks_critical || t.verdict === 'under_represented' ? 'discrepant' : 'consistent';
}

export function benchmarkValidation(run: number[], seeded: boolean, bench: number[], tolerance: number, tailThreshold: number | null) {
  const discrepancy = discrepancyOf(run, bench); const tail = tailOf(run, bench, tailThreshold); const convergence = convergenceOf(run);
  return { discrepancy, tail, convergence, verdict: verdictOf(discrepancy, tail, seeded, tolerance) };
}
