/**
 * CP-6 B25 §MR (0108) — THE EVENT FAMILY (`event-rate`): the probability that a DECLARED event occurs within a window of the horizon's
 * length, from the series' own history — never from narrative.
 *
 *   The event is a target's declared condition on a series: the value `<comparator> threshold` on `consecutive` consecutive published
 *   observations (the B27/B28 indicator's definition, e.g. "transits below 41 per day for five consecutive published observations").
 *   The history is cut into NON-OVERLAPPING windows of the horizon's length, counted back from the last observation (a window with fewer
 *   than half its days observed is a coverage gap, skipped and counted). Each window either contains the event or does not; with the
 *   registry entry's EXPLICIT Beta(α, β) prior the posterior is Beta(α + hits, β + misses): the probability issued is its mean, the band
 *   its 10/50/90 quantiles (a credible band on the probability, not a frequency of outcomes).
 *
 *   The BACKTEST (Brier and log score) re-fits at rolling origins on the history known before each origin and scores the probability
 *   against whether the event occurred in the window after it; the reference is the prior mean, unconditioned on the series. A backtest
 *   passes when it has the policy's minimum origins, its Brier score is no worse than the reference's and its calibration-in-the-large
 *   gap (mean probability − observed frequency) is within 0.10.
 */
import { addDays, between, betaQuantile, mean, round, upTo, type Point } from './stats.js';

export type Comparator = '<' | '<=' | '>' | '>=';
export interface EventCondition { comparator: Comparator; threshold: number; consecutive: number }
export interface BetaPrior { alpha: number; beta: number }

export const EVENT_RATE_REF = 'event-rate';

function holds(v: number, c: EventCondition): boolean {
  switch (c.comparator) {
    case '<': return v < c.threshold;
    case '<=': return v <= c.threshold;
    case '>': return v > c.threshold;
    case '>=': return v >= c.threshold;
    default: return false;
  }
}

/** Whether the condition holds on `consecutive` consecutive observations of the (date-ordered) values. */
export function conditionMet(values: readonly number[], c: EventCondition): boolean {
  let run = 0;
  for (const v of values) {
    run = holds(v, c) ? run + 1 : 0;
    if (run >= c.consecutive) return true;
  }
  return false;
}

export interface EventWindow { from: string; to: string; observed: number; hit: boolean }

/**
 * The non-overlapping windows of `windowDays` ending at the last observation (window j covers (end − (j+1)W, end − jW]); a window with
 * fewer than half its days observed is skipped (a coverage gap).
 */
export function eventWindows(points: readonly Point[], windowDays: number, c: EventCondition): { windows: EventWindow[]; skipped: number } {
  if (points.length === 0 || windowDays < 1) return { windows: [], skipped: 0 };
  const first = points[0]!.date; const end = points[points.length - 1]!.date;
  const windows: EventWindow[] = []; let skipped = 0;
  for (let j = 0; ; j += 1) {
    const to = addDays(end, -j * windowDays); const from = addDays(to, -windowDays);
    if (to < first) break;
    if (from < addDays(first, -1)) break; // a partial window before the history begins is not a window
    const inside = between(points, from, to);
    if (inside.length * 2 < windowDays * cadenceFactor(points)) { skipped += 1; continue; }
    windows.push({ from: addDays(from, 1), to, observed: inside.length, hit: conditionMet(inside.map((p) => p.value), c) });
  }
  return { windows: windows.reverse(), skipped };
}

/** Observations per day of the series (1 for daily; ~0.71 for business days), so the coverage rule reads publication, not calendar. */
function cadenceFactor(points: readonly Point[]): number {
  if (points.length < 2) return 1;
  const span = (new Date(`${points[points.length - 1]!.date}T00:00:00Z`).getTime() - new Date(`${points[0]!.date}T00:00:00Z`).getTime()) / 86_400_000 + 1;
  return Math.min(1, points.length / span);
}

export interface EventProbability {
  probability: number; q10: number; q50: number; q90: number;
  prior: BetaPrior; posterior: BetaPrior; windows: number; hits: number; skipped: number; windowDays: number;
}

export function eventProbability(points: readonly Point[], windowDays: number, c: EventCondition, prior: BetaPrior): EventProbability {
  if (!(prior.alpha > 0 && prior.beta > 0)) throw new Error('event-rate: the Beta prior needs alpha > 0 and beta > 0');
  const { windows, skipped } = eventWindows(points, windowDays, c);
  const hits = windows.filter((w) => w.hit).length;
  const a = prior.alpha + hits; const b = prior.beta + (windows.length - hits);
  return {
    probability: round(a / (a + b)), q10: round(betaQuantile(0.1, a, b)), q50: round(betaQuantile(0.5, a, b)), q90: round(betaQuantile(0.9, a, b)),
    prior, posterior: { alpha: a, beta: b }, windows: windows.length, hits, skipped, windowDays,
  };
}

export interface EventBacktest {
  origins: number; brier: number | null; logScore: number | null; referenceBrier: number | null; brierSkill: number | null;
  meanProbability: number | null; observedFrequency: number | null; calibrationGap: number | null;
  reliability: Array<{ bin: string; n: number; mean_probability: number; observed: number }>;
  rows: Array<{ origin: string; probability: number; occurred: boolean }>;
  passed: boolean; verdict: string; windowFrom: string | null; windowTo: string | null;
}

/**
 * Rolling-origin backtest of the event probability: origins every `stride` days back from (last − W); each fitted on the observations
 * dated by its origin (at least `minWindows` windows), scored on whether the event occurred in (origin, origin + W] (the window must be
 * half observed, else the origin is skipped).
 */
export function eventBacktest(points: readonly Point[], windowDays: number, c: EventCondition, prior: BetaPrior,
  o: { origins: number; stride: number; minWindows: number; minOrigins: number }): EventBacktest {
  const rows: EventBacktest['rows'] = [];
  if (points.length > 0) {
    const last = points[points.length - 1]!.date;
    for (let origin = addDays(last, -windowDays); rows.length < o.origins; origin = addDays(origin, -Math.max(1, o.stride))) {
      const train = upTo(points, origin);
      if (train.length === 0) break;
      const fit = eventWindows(train, windowDays, c);
      if (fit.windows.length < o.minWindows) break;
      const after = between(points, origin, addDays(origin, windowDays));
      if (after.length * 2 < windowDays * cadenceFactor(points)) continue;
      const p = eventProbability(train, windowDays, c, prior).probability;
      rows.push({ origin, probability: p, occurred: conditionMet(after.map((x) => x.value), c) });
    }
    rows.reverse();
  }
  const n = rows.length;
  const refP = prior.alpha / (prior.alpha + prior.beta);
  const clip = (p: number): number => Math.min(1 - 1e-6, Math.max(1e-6, p));
  const brier = n === 0 ? null : mean(rows.map((r) => (r.probability - (r.occurred ? 1 : 0)) ** 2));
  const referenceBrier = n === 0 ? null : mean(rows.map((r) => (refP - (r.occurred ? 1 : 0)) ** 2));
  const logScore = n === 0 ? null : mean(rows.map((r) => -Math.log(r.occurred ? clip(r.probability) : 1 - clip(r.probability))));
  const meanProbability = n === 0 ? null : mean(rows.map((r) => r.probability));
  const observedFrequency = n === 0 ? null : rows.filter((r) => r.occurred).length / n;
  const calibrationGap = meanProbability === null || observedFrequency === null ? null : meanProbability - observedFrequency;
  const brierSkill = brier === null || referenceBrier === null || referenceBrier === 0 ? null : 1 - brier / referenceBrier;
  const bins = [[0, 0.1], [0.1, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1.0001]] as const;
  const reliability = bins.map(([lo, hi]) => {
    const inBin = rows.filter((r) => r.probability >= lo && r.probability < hi);
    return { bin: `${lo}–${Math.min(hi, 1)}`, n: inBin.length, mean_probability: inBin.length === 0 ? 0 : round(mean(inBin.map((r) => r.probability)), 4),
             observed: inBin.length === 0 ? 0 : round(inBin.filter((r) => r.occurred).length / inBin.length, 4) };
  }).filter((b) => b.n > 0);
  const passed = n >= o.minOrigins && brier !== null && referenceBrier !== null && brier <= referenceBrier && calibrationGap !== null && Math.abs(calibrationGap) <= 0.1;
  const verdict = n < o.minOrigins
    ? `CANNOT VALIDATE: ${n} usable origin(s) for a ${windowDays}-day event window; the policy needs ${o.minOrigins}. No skill is claimed.`
    : `${n} origins: Brier ${fmt(brier)} vs the prior-mean reference ${fmt(referenceBrier)} (skill ${fmt(brierSkill)}), log score ${fmt(logScore)}, `
      + `mean probability ${fmt(meanProbability)} vs observed frequency ${fmt(observedFrequency)} (gap ${fmt(calibrationGap)}, bar ±0.10) — ${passed ? 'PASSED' : 'NOT passed'}.`;
  return { origins: n, brier: r4(brier), logScore: r4(logScore), referenceBrier: r4(referenceBrier), brierSkill: r4(brierSkill), meanProbability: r4(meanProbability),
           observedFrequency: r4(observedFrequency), calibrationGap: r4(calibrationGap), reliability, rows: rows.slice(-60), passed, verdict,
           windowFrom: rows[0]?.origin ?? null, windowTo: rows.length === 0 ? null : addDays(rows[rows.length - 1]!.origin, windowDays) };
}

const r4 = (v: number | null): number | null => (v === null || !Number.isFinite(v) ? null : round(v, 4));
const fmt = (v: number | null): string => (v === null || !Number.isFinite(v) ? 'n/a' : v.toFixed(4));
