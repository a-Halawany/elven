/**
 * CP-6 B25 §MR (0108) — PER TARGET / HORIZON VALIDATION of a quantity method: the ROLLING-ORIGIN backtest at the horizon itself (3y and 5y
 * included), with the codebase's own targets.
 *
 *   Origins every `stride` days back from (last observation − horizon); each origin's model is fitted ONLY on observations dated by it (and,
 *   in the historical mode, recorded by it — the caller assembles that history per origin); its 10/50/90 band for the target day is scored
 *   against the realised quantity there (the method's own definition of the quantity: a window mean, a day's value). The reference is the
 *   training history's climatology (its empirical 10/50/90 of the same quantity).
 *   PASSED when there are at least the policy's minimum origins AND the 80% band's coverage is inside T1 (75–85%) — the same bar the legacy
 *   backtest applies. A history too short for that many origins at that horizon CANNOT VALIDATE, and says how much history it would need.
 */
import { addDays, coveredBy, pinballBand, round, upTo, type Band, type Point } from './stats.js';

export const T1_LOW = 0.75;
export const T1_HIGH = 0.85;

export interface RollingOriginArgs {
  horizonDays: number; origins: number; stride: number; minTrainDays: number; minOrigins: number;
  /** the band for the target day from a training history (null: the method cannot fit this history) */
  forecast: (train: readonly Point[], originDay: string, targetDay: string) => Band | null;
  /** the realised quantity at the target day (null: the history does not cover it) */
  actual: (all: readonly Point[], targetDay: string) => number | null;
  /** the reference band from the training history (climatology) */
  reference: (train: readonly Point[]) => Band | null;
  /** historical mode: the history as RECORDED by the origin (null: none recorded — the origin is unknowable) */
  historyAt?: (originDay: string) => Promise<readonly Point[] | null>;
}

export interface RollingOriginResult {
  origins: number; unknowable: number; unfitted: number; coverage: number | null; pinball: number | null; referenceCoverage: number | null; referencePinball: number | null;
  skill: number | null; t1: boolean | null; passed: boolean; verdict: string; windowFrom: string | null; windowTo: string | null;
  rows: Array<{ origin: string; target: string; actual: number; band: Band; covered: boolean; pinball: number }>;
  needed: { observations_span_days: number };
}

export async function rollingOrigin(points: readonly Point[], a: RollingOriginArgs): Promise<RollingOriginResult> {
  const rows: RollingOriginResult['rows'] = [];
  let cov = 0; let pin = 0; let rcov = 0; let rpin = 0; let rn = 0; let unknowable = 0; let unfitted = 0;
  const needed = { observations_span_days: a.minTrainDays + a.horizonDays + (a.minOrigins - 1) * Math.max(1, a.stride) };
  if (points.length > 0) {
    const first = points[0]!.date; const last = points[points.length - 1]!.date;
    let attempts = 0;
    for (let origin = addDays(last, -a.horizonDays); rows.length < a.origins && attempts < a.origins * 4; origin = addDays(origin, -Math.max(1, a.stride))) {
      attempts += 1;
      if (origin < addDays(first, a.minTrainDays)) break;
      const target = addDays(origin, a.horizonDays);
      const actual = a.actual(points, target);
      if (actual === null) continue;
      let train: readonly Point[] = upTo(points, origin);
      if (a.historyAt !== undefined) {
        const h = await a.historyAt(origin);
        if (h === null || h.length === 0 || h[0]!.date > addDays(origin, -a.minTrainDays)) { unknowable += 1; continue; }
        train = upTo(h, origin);
      }
      let band: Band | null = null;
      try { band = a.forecast(train, origin, target); } catch { band = null; }
      if (band === null) { unfitted += 1; continue; }
      const c = coveredBy(actual, band); const p = pinballBand(actual, band);
      cov += c ? 1 : 0; pin += p;
      const ref = a.reference(train);
      if (ref !== null) { rcov += coveredBy(actual, ref) ? 1 : 0; rpin += pinballBand(actual, ref); rn += 1; }
      rows.push({ origin, target, actual: round(actual, 6), band: { q10: round(band.q10, 6), q50: round(band.q50, 6), q90: round(band.q90, 6) }, covered: c, pinball: round(p, 6) });
    }
    rows.reverse();
  }
  const n = rows.length;
  const coverage = n === 0 ? null : round(cov / n, 4);
  const pinball = n === 0 ? null : round(pin / n, 6);
  const referenceCoverage = rn === 0 ? null : round(rcov / rn, 4);
  const referencePinball = rn === 0 ? null : round(rpin / rn, 6);
  const skill = pinball === null || referencePinball === null || referencePinball === 0 ? null : round(1 - pinball / referencePinball, 4);
  const t1 = coverage === null ? null : coverage >= T1_LOW && coverage <= T1_HIGH;
  const passed = n >= a.minOrigins && t1 === true;
  const verdict = n < a.minOrigins
    ? `CANNOT VALIDATE: ${n} scored origin(s) at ${a.horizonDays} days (${unknowable} unknowable, ${unfitted} unfitted); the policy needs ${a.minOrigins}, `
      + `i.e. about ${needed.observations_span_days} days of history (${a.minTrainDays} training + ${a.horizonDays} horizon + ${a.minOrigins - 1}×${a.stride} stride). No accuracy is claimed at this horizon.`
    : `${n} origins at ${a.horizonDays} days: 80% band coverage ${pct(coverage)} (T1 ${t1 === true ? 'met' : 'NOT met'}, band 75–85%), pinball ${coverage === null ? 'n/a' : String(pinball)} `
      + `vs climatology ${referencePinball ?? 'n/a'} (skill ${skill ?? 'n/a'}) — ${passed ? 'PASSED' : 'NOT passed'}.`;
  return { origins: n, unknowable, unfitted, coverage, pinball, referenceCoverage, referencePinball, skill, t1, passed, verdict,
           windowFrom: rows[0]?.origin ?? null, windowTo: rows.length === 0 ? null : rows[rows.length - 1]!.target, rows: rows.slice(-60), needed };
}

const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
