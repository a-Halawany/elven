/**
 * STATISTICS FIRST, AND THE MODEL ON A LEASH (Phase 4 plan §8).
 *
 * Two forecasters over an ordered series of observations, both producing
 * quantiles (q10/q50/q90) from EMPIRICAL h-step errors measured on the history
 * they were given — never a point number, never an interval assumed normal.
 *
 *   seasonal-naive@1      ŷ(t+h) = y(t+h−m·⌈h/m⌉)          the baseline that must be beaten
 *   holt-winters-additive@1  level + trend + additive season, parameters chosen by
 *                          grid search on one-step SSE  the learned model
 *
 * Everything is deterministic: the same history gives the same forecast.
 */

export interface Point { date: string; value: number }

export interface Quantiles { q10: number; q50: number; q90: number }

export interface ForecastOutput {
  method: string;
  version: string;
  /** Quantiles for the FINAL step (the horizon). */
  quantiles: Quantiles;
  /** Quantiles per step, 1..h. */
  path: Array<{ step: number; date: string | null } & Quantiles>;
  parameters: Record<string, number>;
  /** How many h-step errors the interval rests on. */
  errorsUsed: number;
}

export const SEASONAL_NAIVE = 'seasonal-naive';
export const HOLT_WINTERS = 'holt-winters-additive';
export const MODEL_VERSION = '1';

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  const w = idx - lo;
  return (sorted[lo] as number) * (1 - w) + (sorted[hi] as number) * w;
}

/** Seasonal naive point forecast for step h from the end of `y`. */
export function seasonalNaivePoint(y: number[], h: number, m: number): number {
  const n = y.length;
  if (n === 0) return NaN;
  const period = Math.max(1, Math.min(m, n));
  const k = Math.ceil(h / period);
  const idx = n + h - period * k - 1;
  return y[Math.max(0, Math.min(n - 1, idx))] as number;
}

/**
 * The interval rests on RECENT errors. A 27-year FX history carries regimes far
 * more volatile than today's; measuring the band over all of them makes it
 * wider than the present warrants (and T1 measures exactly that). The window is
 * the last `ERROR_WINDOW` observations, or everything when there are fewer.
 */
export const ERROR_WINDOW = 750;

/**
 * Empirical h-step error quantiles for a point forecaster, by re-forecasting from
 * every origin in the recent window that has a realised value h steps later.
 */
function errorQuantiles(
  y: number[], h: number, point: (train: number[], step: number) => number, minTrain: number, maxOrigins = 400,
): { errors: number[]; q: Quantiles } {
  const errors: number[] = [];
  const first = Math.max(minTrain, 1, y.length - ERROR_WINDOW);
  const last = y.length - h - 1;
  const stride = Math.max(1, Math.ceil((last - first + 1) / maxOrigins));
  for (let o = last; o >= first; o -= stride) {
    const train = y.slice(0, o + 1);
    const p = point(train, h);
    const actual = y[o + h] as number;
    if (Number.isFinite(p) && Number.isFinite(actual)) errors.push(actual - p);
  }
  const sorted = [...errors].sort((a, b) => a - b);
  return { errors, q: { q10: quantile(sorted, 0.1), q50: quantile(sorted, 0.5), q90: quantile(sorted, 0.9) } };
}

/**
 * When the history is too short to measure h-step errors, the interval is
 * APPROXIMATED from the longest step that has errors, scaled by √(h/k) — and the
 * output says so (`intervalBasisStep`), so a band built on an approximation is
 * never presented as one that was measured.
 */
function quantilesWithFallback(
  y: number[], h: number, point: (train: number[], s: number) => number, minTrain: number, maxOrigins: number,
): { q: Quantiles; errorsUsed: number; basisStep: number } {
  for (let k = h; k >= 1; k -= 1) {
    const { errors, q } = errorQuantiles(y, k, point, minTrain, maxOrigins);
    if (errors.length >= 3) {
      if (k === h) return { q, errorsUsed: errors.length, basisStep: k };
      // Scaled from a shorter step: the band widens around the point and is never
      // allowed to sit on one side of it, so the quantiles stay ordered.
      const scale = Math.sqrt(h / k);
      return { q: { q10: Math.min(q.q10 * scale, 0), q50: 0, q90: Math.max(q.q90 * scale, 0) }, errorsUsed: errors.length, basisStep: k };
    }
  }
  return { q: { q10: 0, q50: 0, q90: 0 }, errorsUsed: 0, basisStep: 0 };
}

export function seasonalNaive(points: Point[], h: number, m: number): ForecastOutput {
  const y = points.map((p) => p.value);
  const path: ForecastOutput['path'] = [];
  let errorsUsed = 0; let basis = h;
  for (let step = 1; step <= h; step += 1) {
    const p = seasonalNaivePoint(y, step, m);
    const r = quantilesWithFallback(y, step, (train, s) => seasonalNaivePoint(train, s, m), Math.max(m + 1, 4), 400);
    if (step === h) { errorsUsed = r.errorsUsed; basis = r.basisStep; }
    path.push({ step, date: null, q10: p + r.q.q10, q50: p + r.q.q50, q90: p + r.q.q90 });
  }
  const last = path[path.length - 1] as ForecastOutput['path'][number];
  return {
    method: SEASONAL_NAIVE, version: MODEL_VERSION,
    quantiles: { q10: last.q10, q50: last.q50, q90: last.q90 }, path,
    parameters: { season: m, intervalBasisStep: basis }, errorsUsed,
  };
}

interface HW { alpha: number; beta: number; gamma: number }

/** Fit additive Holt-Winters on `y` with season `m`; returns state and one-step SSE. */
function fitHW(y: number[], m: number, p: HW): { level: number; trend: number; season: number[]; sse: number } {
  const n = y.length;
  const period = Math.max(1, m);
  if (n < 2 * period + 2) {
    // Too short for a seasonal fit: level only.
    let level = y[0] as number; let sse = 0;
    for (let t = 1; t < n; t += 1) {
      const e = (y[t] as number) - level; sse += e * e;
      level = level + p.alpha * e;
    }
    return { level, trend: 0, season: new Array<number>(period).fill(0), sse };
  }
  // Initial season from the first two periods, initial level/trend from period means.
  const mean1 = y.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const mean2 = y.slice(period, 2 * period).reduce((a, b) => a + b, 0) / period;
  let level = mean1;
  let trend = (mean2 - mean1) / period;
  const season = new Array<number>(period).fill(0).map((_, i) => ((y[i] as number) + (y[i + period] as number)) / 2 - (mean1 + mean2) / 2);
  let sse = 0;
  for (let t = 0; t < n; t += 1) {
    const s = season[t % period] as number;
    const fc = level + trend + s;
    const e = (y[t] as number) - fc;
    if (t >= 2 * period) sse += e * e;
    const newLevel = p.alpha * ((y[t] as number) - s) + (1 - p.alpha) * (level + trend);
    const newTrend = p.beta * (newLevel - level) + (1 - p.beta) * trend;
    season[t % period] = p.gamma * ((y[t] as number) - newLevel) + (1 - p.gamma) * s;
    level = newLevel; trend = newTrend;
  }
  return { level, trend, season, sse };
}

const GRID = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9];

function bestHW(y: number[], m: number): HW {
  let best: HW = { alpha: 0.3, beta: 0.05, gamma: 0.1 };
  let bestSse = Number.POSITIVE_INFINITY;
  for (const alpha of GRID) for (const beta of [0, 0.01, 0.05, 0.1, 0.2]) for (const gamma of (m > 1 ? [0.05, 0.1, 0.2, 0.3, 0.5] : [0])) {
    const { sse } = fitHW(y, m, { alpha, beta, gamma });
    if (sse < bestSse) { bestSse = sse; best = { alpha, beta, gamma }; }
  }
  return best;
}

function hwPoint(train: number[], h: number, m: number, p: HW): number {
  const f = fitHW(train, m, p);
  const period = Math.max(1, m);
  const s = f.season[(train.length + h - 1) % period] as number;
  return f.level + h * f.trend + s;
}

/**
 * ONE PASS over the history: at every instant t the filter's state gives an
 * h-step forecast for every h ≤ H, and the realised values give the errors.
 * Refitting from scratch at every origin would be O(n²·H); this is O(n·H).
 */
function hwErrorsAllSteps(y: number[], m: number, p: HW, H: number): number[][] {
  const n = y.length;
  const period = Math.max(1, m);
  const errors: number[][] = Array.from({ length: H + 1 }, () => []);
  if (n < 2 * period + 2) {
    let level = y[0] as number;
    for (let t = 1; t < n; t += 1) {
      for (let h = 1; h <= H && t + h - 1 < n; h += 1) errors[h]?.push((y[t + h - 1] as number) - level);
      level = level + p.alpha * ((y[t] as number) - level);
    }
    return errors;
  }
  const mean1 = y.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const mean2 = y.slice(period, 2 * period).reduce((a, b) => a + b, 0) / period;
  let level = mean1; let trend = (mean2 - mean1) / period;
  const season = new Array<number>(period).fill(0).map((_, i) => ((y[i] as number) + (y[i + period] as number)) / 2 - (mean1 + mean2) / 2);
  for (let t = 0; t < n; t += 1) {
    const s = season[t % period] as number;
    const newLevel = p.alpha * ((y[t] as number) - s) + (1 - p.alpha) * (level + trend);
    const newTrend = p.beta * (newLevel - level) + (1 - p.beta) * trend;
    season[t % period] = p.gamma * ((y[t] as number) - newLevel) + (1 - p.gamma) * s;
    level = newLevel; trend = newTrend;
    // From the state after observing t, forecast t+h for every h — recent window only.
    if (t >= 2 * period && t >= n - ERROR_WINDOW) {
      for (let h = 1; h <= H && t + h < n; h += 1) {
        const fc = level + h * trend + (season[(t + h) % period] as number);
        errors[h]?.push((y[t + h] as number) - fc);
      }
    }
  }
  return errors;
}

export function holtWinters(points: Point[], h: number, m: number): ForecastOutput {
  const y = points.map((p) => p.value);
  const params = bestHW(y, m);
  const all = hwErrorsAllSteps(y, m, params, h);
  const path: ForecastOutput['path'] = [];
  let errorsUsed = 0; let basis = h;
  for (let step = 1; step <= h; step += 1) {
    const p = hwPoint(y, step, m, params);
    // The longest step with enough measured errors, scaled if it is not this one.
    let k = step; let errs = all[k] ?? [];
    while (errs.length < 3 && k > 1) { k -= 1; errs = all[k] ?? []; }
    const sorted = [...errs].sort((a, b) => a - b);
    const scale = errs.length >= 3 ? Math.sqrt(step / k) : 0;
    const q = k === step && errs.length >= 3
      ? { q10: quantile(sorted, 0.1), q50: quantile(sorted, 0.5), q90: quantile(sorted, 0.9) }
      : { q10: Math.min(quantile(sorted, 0.1) * scale, 0), q50: 0, q90: Math.max(quantile(sorted, 0.9) * scale, 0) };
    if (step === h) { errorsUsed = errs.length; basis = errs.length >= 3 ? k : 0; }
    path.push({ step, date: null, q10: p + q.q10, q50: p + q.q50, q90: p + q.q90 });
  }
  const last = path[path.length - 1] as ForecastOutput['path'][number];
  return {
    method: HOLT_WINTERS, version: MODEL_VERSION,
    quantiles: { q10: last.q10, q50: last.q50, q90: last.q90 }, path,
    parameters: { alpha: params.alpha, beta: params.beta, gamma: params.gamma, season: m, intervalBasisStep: basis }, errorsUsed,
  };
}

export function forecastWith(method: string, points: Point[], h: number, m: number): ForecastOutput {
  if (method === SEASONAL_NAIVE) return seasonalNaive(points, h, m);
  if (method === HOLT_WINTERS) return holtWinters(points, h, m);
  throw new Error(`unknown forecasting method ${method}`);
}

/* ───────────────────────── scoring ───────────────────────── */

/** Pinball loss for one quantile. */
export function pinball(observed: number, q: number, tau: number): number {
  return observed >= q ? tau * (observed - q) : (1 - tau) * (q - observed);
}

/** Mean pinball over the three declared quantiles — the number T2 compares. */
export function pinballMean(observed: number, q: Quantiles): number {
  return (pinball(observed, q.q10, 0.1) + pinball(observed, q.q50, 0.5) + pinball(observed, q.q90, 0.9)) / 3;
}

export function covered(observed: number, q: Quantiles): boolean {
  return observed >= q.q10 && observed <= q.q90;
}

/** The T1 band: coverage within 80% ± 5pp. */
export const T1_LOW = 0.75;
export const T1_HIGH = 0.85;
/** The T2 bar: at least 15% lower pinball loss than the baseline. */
export const T2_SKILL = 0.15;
