/**
 * CP-6 B25 §MR (0108) — THE BAYESIAN FAMILY (`bayesian-conjugate`; MC-012): conjugate models with EXPLICIT priors, posterior predictive
 * quantiles, a PRIOR SENSITIVITY under declared alternative priors, and a calibration check (the rolling-origin coverage, validation.ts).
 *
 *   normal_linear — the quantity is the MEAN OF THE SERIES OVER A DECLARED WINDOW (window_days) ending at the target day. The history's
 *     non-overlapping window means m_j (back from the last observation) follow m_j = a + b·t_j + ε, ε ~ N(0, σ²), t in years from the first
 *     window. The prior is DECLARED: a ~ N(μa, sa²), b ~ N(μb, sb²) (independent). σ² is the plug-in residual variance of the least-squares
 *     fit (stated as such — an empirical-Bayes step, not a prior). Posterior: S = (S0⁻¹ + X'X/σ²)⁻¹, m = S (S0⁻¹ μ0 + X'y/σ²); the predictive
 *     at the target's window is N(x*'m, σ² + x*' S x*).
 *   gamma_poisson — the quantity is ONE DAY'S COUNT at the target day. Counts ~ Poisson(λ), λ ~ Gamma(shape, rate) DECLARED; posterior
 *     Gamma(shape + Σy, rate + n); the predictive is negative binomial (r = shape', p = rate'/(rate' + 1)); its 10/50/90 quantiles are read
 *     off the cumulative mass. Stationary: the horizon moves only the target day.
 *
 *   PRIOR SENSITIVITY: the same fit under each declared alternative prior; the shift of the predictive median in predictive standard
 *   deviations; SENSITIVE when the largest shift exceeds the declared threshold (default 0.25) — the forecast then says the prior moves it.
 */
import { addDays, between, daysBetween, inverse, lgamma, mean, ols, round, Z10, Z90, type Band, type Point } from './stats.js';

export const BAYESIAN_CONJUGATE_REF = 'bayesian-conjugate';

export interface NormalLinearPrior { model: 'normal_linear'; window_days: number; intercept: { mean: number; sd: number }; slope_per_year: { mean: number; sd: number } }
export interface GammaPoissonPrior { model: 'gamma_poisson'; shape: number; rate: number }
export type BayesPrior = NormalLinearPrior | GammaPoissonPrior;
export interface BayesDeclarations { prior: BayesPrior; alternatives: Array<{ label: string; prior: BayesPrior }>; sensitivity_threshold?: number }

export interface WindowMean { end: string; t: number; mean: number; n: number }

/** Non-overlapping window means back from the last observation (a window with fewer than half its days observed is skipped). */
export function windowMeans(points: readonly Point[], windowDays: number): WindowMean[] {
  if (points.length === 0) return [];
  const first = points[0]!.date; const end = points[points.length - 1]!.date;
  const out: Array<{ end: string; mean: number; n: number }> = [];
  for (let j = 0; ; j += 1) {
    const to = addDays(end, -j * windowDays); const from = addDays(to, -windowDays);
    if (from < addDays(first, -1)) break;
    const inside = between(points, from, to);
    if (inside.length * 2 < windowDays * 5 / 7) continue;
    out.push({ end: to, mean: mean(inside.map((p) => p.value)), n: inside.length });
  }
  out.reverse();
  const t0 = out[0]?.end ?? first;
  return out.map((w) => ({ ...w, t: daysBetween(t0, w.end) / 365.25 }));
}

export interface NormalLinearFit { m: [number, number]; S: number[][]; sigma2: number; t0: string; windows: number; lastEnd: string }

export function normalLinearFit(points: readonly Point[], prior: NormalLinearPrior): NormalLinearFit {
  if (!(prior.intercept.sd > 0 && prior.slope_per_year.sd > 0)) throw new Error('bayesian-conjugate: prior standard deviations must be positive');
  const w = windowMeans(points, prior.window_days);
  if (w.length < 4) throw new Error(`bayesian-conjugate: ${w.length} window mean(s) of ${prior.window_days} days; the model needs at least 4`);
  const X = w.map((x) => [1, x.t]); const y = w.map((x) => x.mean);
  const fit = ols(X, y);
  if (fit === null) throw new Error('bayesian-conjugate: the design is singular');
  const sigma2 = Math.max(fit.sigma2, 1e-9);
  const S0inv = [[1 / prior.intercept.sd ** 2, 0], [0, 1 / prior.slope_per_year.sd ** 2]];
  const xtx = [[0, 0], [0, 0]]; const xty = [0, 0];
  for (let r = 0; r < X.length; r += 1) for (let i = 0; i < 2; i += 1) { xty[i]! += X[r]![i]! * y[r]!; for (let j = 0; j < 2; j += 1) xtx[i]![j]! += X[r]![i]! * X[r]![j]!; }
  const precision = [[S0inv[0]![0]! + xtx[0]![0]! / sigma2, xtx[0]![1]! / sigma2], [xtx[1]![0]! / sigma2, S0inv[1]![1]! + xtx[1]![1]! / sigma2]];
  const S = inverse(precision);
  if (S === null) throw new Error('bayesian-conjugate: the posterior precision is singular');
  const rhs = [prior.intercept.mean / prior.intercept.sd ** 2 + xty[0]! / sigma2, prior.slope_per_year.mean / prior.slope_per_year.sd ** 2 + xty[1]! / sigma2];
  const m: [number, number] = [S[0]![0]! * rhs[0]! + S[0]![1]! * rhs[1]!, S[1]![0]! * rhs[0]! + S[1]![1]! * rhs[1]!];
  return { m, S, sigma2, t0: w[0]!.end, windows: w.length, lastEnd: w[w.length - 1]!.end };
}

export function normalLinearPredict(fit: NormalLinearFit, targetDay: string): Band & { mean: number; sd: number } {
  const t = daysBetween(fit.t0, targetDay) / 365.25;
  const mu = fit.m[0] + fit.m[1] * t;
  const v = fit.sigma2 + fit.S[0]![0]! + 2 * t * fit.S[0]![1]! + t * t * fit.S[1]![1]!;
  const sd = Math.sqrt(v);
  return { mean: mu, sd, q10: mu + Z10 * sd, q50: mu, q90: mu + Z90 * sd };
}

/** Negative-binomial predictive quantiles of a Gamma–Poisson posterior. */
export function gammaPoissonPredict(shape: number, rate: number): Band & { mean: number; sd: number } {
  const p = rate / (rate + 1);
  const logpmf = (k: number): number => lgamma(k + shape) - lgamma(k + 1) - lgamma(shape) + shape * Math.log(p) + k * Math.log(1 - p);
  const qs: number[] = []; const targets = [0.1, 0.5, 0.9];
  let cdf = 0; let k = 0; let ti = 0;
  const cap = Math.max(1000, Math.ceil(10 * shape / rate) + 1000);
  while (ti < targets.length && k <= cap) {
    cdf += Math.exp(logpmf(k));
    while (ti < targets.length && cdf >= targets[ti]!) { qs.push(k); ti += 1; }
    k += 1;
  }
  while (qs.length < 3) qs.push(k);
  const m = shape / rate; const v = (shape / rate) * (1 + 1 / rate);
  return { mean: m, sd: Math.sqrt(v), q10: qs[0]!, q50: qs[1]!, q90: qs[2]! };
}

export interface BayesForecast {
  model: string; quantity: string; band: Band; mean: number; sd: number; posterior: Record<string, unknown>;
  sensitivity: { alternatives: Array<{ label: string; q50: number; shift_sd: number }>; maxShiftSd: number; threshold: number; sensitive: boolean };
}

function predictWith(points: readonly Point[], prior: BayesPrior, targetDay: string): { band: Band & { mean: number; sd: number }; posterior: Record<string, unknown> } {
  if (prior.model === 'normal_linear') {
    const fit = normalLinearFit(points, prior);
    return { band: normalLinearPredict(fit, targetDay), posterior: { intercept: round(fit.m[0]), slope_per_year: round(fit.m[1]), cov: fit.S.map((r) => r.map((x) => round(x, 8))), sigma: round(Math.sqrt(fit.sigma2)), windows: fit.windows, t0: fit.t0 } };
  }
  if (!(prior.shape > 0 && prior.rate > 0)) throw new Error('bayesian-conjugate: the Gamma prior needs shape > 0 and rate > 0');
  const ys = points.map((p) => p.value);
  if (ys.some((y) => y < 0 || !Number.isInteger(y))) throw new Error('bayesian-conjugate: gamma_poisson needs non-negative integer counts');
  const shape = prior.shape + ys.reduce((s, y) => s + y, 0); const rate = prior.rate + ys.length;
  return { band: gammaPoissonPredict(shape, rate), posterior: { shape: round(shape), rate: round(rate), observations: ys.length } };
}

export function bayesForecast(points: readonly Point[], d: BayesDeclarations, targetDay: string): BayesForecast {
  const base = predictWith(points, d.prior, targetDay);
  const threshold = d.sensitivity_threshold ?? 0.25;
  const alternatives = d.alternatives.map((a) => {
    const alt = predictWith(points, a.prior, targetDay);
    return { label: a.label, q50: round(alt.band.q50, 4), shift_sd: round(Math.abs(alt.band.q50 - base.band.q50) / Math.max(base.band.sd, 1e-9), 4) };
  });
  const maxShiftSd = alternatives.reduce((m, a) => Math.max(m, a.shift_sd), 0);
  return {
    model: d.prior.model,
    quantity: d.prior.model === 'normal_linear' ? `the ${d.prior.window_days}-day mean ending at the target day` : 'the count on the target day',
    band: { q10: round(base.band.q10, 4), q50: round(base.band.q50, 4), q90: round(base.band.q90, 4) }, mean: round(base.band.mean, 4), sd: round(base.band.sd, 4),
    posterior: base.posterior, sensitivity: { alternatives, maxShiftSd: round(maxShiftSd, 4), threshold, sensitive: maxShiftSd > threshold },
  };
}

/** The realised quantity a bayesian forecast for `targetDay` is scored against (null when the history does not cover it). */
export function bayesActual(points: readonly Point[], prior: BayesPrior, targetDay: string): number | null {
  if (prior.model === 'normal_linear') {
    const inside = between(points, addDays(targetDay, -prior.window_days), targetDay);
    return inside.length * 2 < prior.window_days * 5 / 7 ? null : mean(inside.map((p) => p.value));
  }
  return points.find((p) => p.date === targetDay)?.value ?? null;
}

/** The climatological band of the quantity on the training history (the reference a calibration check compares against). */
export function bayesClimatology(points: readonly Point[], prior: BayesPrior): Band | null {
  const xs = (prior.model === 'normal_linear' ? windowMeans(points, prior.window_days).map((w) => w.mean) : points.map((p) => p.value)).sort((a, b) => a - b);
  if (xs.length < 3) return null;
  const q = (p: number): number => { const i = (xs.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i); return xs[lo]! + (xs[hi]! - xs[lo]!) * (i - lo); };
  return { q10: q(0.1), q50: q(0.5), q90: q(0.9) };
}
