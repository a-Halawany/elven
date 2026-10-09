/**
 * CP-6 B25 §MR (0108) — THE NUMERICAL KERNEL the method families share: quantiles, the normal and beta distributions, the log-gamma, a
 * small dense linear solver and ordinary least squares, the day arithmetic of a dated series. Pure, deterministic, dependency-free: the
 * same input gives the same bytes out. Every family's implementation digest covers this file beside its own (digests.ts).
 */

export interface Point { date: string; value: number }
export interface Band { q10: number; q50: number; q90: number }

export const Z10 = -1.2815515655446004;
export const Z90 = 1.2815515655446004;

export const round = (x: number, p = 6): number => Number(x.toFixed(p));

/** Linear-interpolated quantile of an ascending array. */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  const w = idx - lo;
  return (sorted[lo] as number) * (1 - w) + (sorted[hi] as number) * w;
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0; for (const x of xs) s += x;
  return s / xs.length;
}

/** The sample variance (n − 1). */
export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs); let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return s / (xs.length - 1);
}

/** Lag-1 autocorrelation (0 for fewer than three values). */
export function lag1(xs: readonly number[]): number {
  if (xs.length < 3) return 0;
  const m = mean(xs); let num = 0; let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    den += ((xs[i] as number) - m) ** 2;
    if (i > 0) num += ((xs[i] as number) - m) * ((xs[i - 1] as number) - m);
  }
  return den === 0 ? 0 : num / den;
}

/** The standard normal quantile (Acklam's rational approximation, |error| < 1.2e-9). */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error(`normInv: p must be in (0, 1), got ${p}`);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425; const hi = 1 - lo;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > hi) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const q = p - 0.5; const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

/** ln Γ(x), x > 0 (Lanczos, g = 7, n = 9). */
export function lgamma(x: number): number {
  const g = 7;
  const coef = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const xx = x - 1;
  let a = coef[0] as number;
  const t = xx + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) a += (coef[i] as number) / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The continued fraction of the regularized incomplete beta (Numerical Recipes betacf). */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300; const EPS = 3e-14; const FPMIN = 1e-300;
  const qab = a + b; const qap = a + 1; const qam = a - 1;
  let c = 1; let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** I_x(a, b): the regularized incomplete beta function (the Beta(a, b) CDF at x). */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** The Beta(a, b) quantile by bisection (deterministic: 80 halvings). */
export function betaQuantile(p: number, a: number, b: number): number {
  let lo = 0; let hi = 1;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Solve A x = b (dense, partial pivoting); null when A is singular. */
export function solve(A: readonly (readonly number[])[], b: readonly number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i] as number]);
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      for (let k = col; k <= n; k += 1) M[r]![k] = M[r]![k]! - f * M[col]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** The inverse of a small symmetric positive-definite matrix (columns of the identity solved); null when singular. */
export function inverse(A: readonly (readonly number[])[]): number[][] | null {
  const n = A.length; const cols: number[][] = [];
  for (let j = 0; j < n; j += 1) {
    const e = new Array<number>(n).fill(0); e[j] = 1;
    const x = solve(A, e);
    if (x === null) return null;
    cols.push(x);
  }
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => cols[j]![i]!));
}

/** Ordinary least squares: coefficients, residuals, the residual variance (n − p) and (X'X)⁻¹. */
export function ols(X: readonly (readonly number[])[], y: readonly number[]): { beta: number[]; residuals: number[]; sigma2: number; xtxInv: number[][] } | null {
  const p = X[0]?.length ?? 0; const n = y.length;
  if (n <= p) return null;
  const xtx = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => { let s = 0; for (let r = 0; r < n; r += 1) s += X[r]![i]! * X[r]![j]!; return s; }));
  const xty = Array.from({ length: p }, (_, i) => { let s = 0; for (let r = 0; r < n; r += 1) s += X[r]![i]! * y[r]!; return s; });
  const xtxInv = inverse(xtx);
  const beta = solve(xtx, xty);
  if (xtxInv === null || beta === null) return null;
  const residuals = y.map((v, r) => v - X[r]!.reduce((s, x, i) => s + x * beta[i]!, 0));
  const sigma2 = residuals.reduce((s, e) => s + e * e, 0) / (n - p);
  return { beta, residuals, sigma2, xtxInv };
}

/* ───────────── the dated series ───────────── */

const DAY = 86_400_000;
export function dayNumber(date: string): number { return Math.round(new Date(`${date}T00:00:00Z`).getTime() / DAY); }
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number { return dayNumber(to) - dayNumber(from); }

/** The observations dated in (from, to] — both bounds ISO days. */
export function between(points: readonly Point[], fromExclusive: string, toInclusive: string): Point[] {
  return points.filter((p) => p.date > fromExclusive && p.date <= toInclusive);
}

/** The observations dated at or before `day`. */
export function upTo(points: readonly Point[], day: string): Point[] {
  return points.filter((p) => p.date <= day);
}

/** Pinball loss of a three-quantile band (the mean over 10/50/90, the codebase's T2 measure). */
export function pinballBand(observed: number, q: Band): number {
  const pb = (v: number, tau: number): number => (observed >= v ? tau * (observed - v) : (1 - tau) * (v - observed));
  return (pb(q.q10, 0.1) + pb(q.q50, 0.5) + pb(q.q90, 0.9)) / 3;
}
export const coveredBy = (observed: number, q: Band): boolean => observed >= q.q10 && observed <= q.q90;
