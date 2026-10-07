/**
 * CP-6 B25 §MR (0108) — THE CAUSAL FAMILY (`causal-its`; MC-013): an INTERRUPTED-TIME-SERIES estimate of a DECLARED intervention's effect
 * on the series, with its interval, under DECLARED identification assumptions, and the checks that say how far to trust it.
 *
 *   Identification (declared in the registry entry, each an ASU of the Strategy Graph, approved with the entry): the pre-intervention
 *   trend and season would have continued without the intervention; nothing else changed at the intervention date; the post window is not
 *   contaminated by anticipation. They are carried on the forecast, never implied.
 *   Estimate: on the PRE window (pre_days before the intervention) the series is fitted by least squares with a level, a linear trend and
 *   day-of-season dummies (season = the series' declared seasonality, ≤ 14); the fit is extrapolated over the POST window (post_days from
 *   the intervention) as the counterfactual; the effect is the mean of (actual − counterfactual). Its standard error inflates the residual
 *   standard deviation for lag-1 autocorrelation ((1+ρ)/(1−ρ)) and adds the mean extrapolation's parameter variance; the 80% band is
 *   effect ± 1.2816·se.
 *   PLACEBO: the same estimator at up to eight fake intervention dates inside the pre window (each with its own pre history and a post
 *   window of the same length ending before the real date); the placebo p-value is (1 + #{|placebo| ≥ |effect|}) / (K + 1).
 *   BALANCE: the pre-fit's residual mean over its last post_days, in residual standard deviations — the counterfactual is only as good as
 *   the fit just before the break (|SMD| < 0.25 is balanced).
 *   SENSITIVITY: the estimate re-computed with pre windows of 0.5×, 0.75×, 1× and 1.25× (what the history allows); the range, and whether
 *   the sign is stable.
 *   B25 completion (G4, MC-013) — TRANSPORTABILITY: the entry declares where its effect may be carried (declarations.transport {scope: series
 *   keys and/or subject entity ids, assumptions: ASU ids, statement}). Applied to a series (or a subject) outside that scope it is REFUSED —
 *   an effect is never transported silently; inside it, the forecast carries the transport assumptions. When the scope names more than
 *   one series, the effect's consistency across them is reported only when the route read them — a routed issue reads ONE series, so it
 *   says NOT ASSESSED rather than implying it.
 */
import { addDays, between, lag1, mean, ols, round, Z90, type Point } from './stats.js';

export const CAUSAL_ITS_REF = 'causal-its';

export interface Intervention { date: string; description: string }
export interface Transport { scope: string[]; assumptions: string[]; statement: string }
export interface CausalDeclarations { intervention: Intervention; identification: { assumptions: string[]; statement: string }; pre_days: number; post_days: number; season?: number; transport?: Transport }

const ENTITY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TransportReport {
  declared: boolean; in_scope: boolean; applied_to: { series_key: string; subjects: string[] }; matched: string | null;
  scope: string[]; assumptions: string[]; statement: string | null;
  consistency: { series_in_scope: number; assessed: false; note: string } | null;
}

/** Where the entry is applied against where it declared its effect transportable (pure; the routed issue refuses `in_scope: false`). */
export function transportOf(d: CausalDeclarations, applied: { seriesKey: string; subjects: Array<string | null> }): TransportReport {
  const subjects = applied.subjects.filter((x): x is string => typeof x === 'string');
  const t = d.transport;
  if (t === undefined) {
    return { declared: false, in_scope: true, applied_to: { series_key: applied.seriesKey, subjects }, matched: null, scope: [], assumptions: [], statement: null,
             consistency: { series_in_scope: 1, assessed: false, note: 'no transport scope is declared (an entry approved before transport was declared): the effect is claimed for this series alone' } };
  }
  const matched = t.scope.find((s) => s === applied.seriesKey) ?? t.scope.find((s) => subjects.some((x) => x.toLowerCase() === s.toLowerCase())) ?? null;
  const seriesInScope = t.scope.filter((s) => !ENTITY_ID.test(s)).length;
  return {
    declared: true, in_scope: matched !== null, applied_to: { series_key: applied.seriesKey, subjects }, matched, scope: [...t.scope], assumptions: [...t.assumptions], statement: t.statement,
    consistency: seriesInScope > 1
      ? { series_in_scope: seriesInScope, assessed: false, note: `the declared scope names ${seriesInScope} series; this routed issue reads only ${applied.seriesKey}, so the effect's consistency (sign and magnitude) across them is NOT ASSESSED` }
      : null,
  };
}

interface Estimate { effect: number; se: number; preN: number; postN: number; residualSd: number; rho: number; slope: number; counterfactualMean: number; actualMean: number; residuals: number[] }

function design(dayIndex: number, season: number): number[] {
  const row = [1, dayIndex];
  for (let s = 1; s < season; s += 1) row.push(((dayIndex % season) + season) % season === s ? 1 : 0);
  return row;
}

function estimate(points: readonly Point[], date: string, preDays: number, postDays: number, season: number): Estimate | null {
  const pre = between(points, addDays(date, -preDays - 1), addDays(date, -1));
  const post = between(points, addDays(date, -1), addDays(date, postDays - 1));
  const p = 2 + Math.max(0, season - 1);
  if (pre.length < Math.max(3 * p, 20) || post.length < 3) return null;
  const origin = pre[0]!.date;
  const idx = (d: string): number => Math.round((new Date(`${d}T00:00:00Z`).getTime() - new Date(`${origin}T00:00:00Z`).getTime()) / 86_400_000);
  const fit = ols(pre.map((x) => design(idx(x.date), season)), pre.map((x) => x.value));
  if (fit === null) return null;
  const cf = post.map((x) => design(idx(x.date), season).reduce((s, v, i) => s + v * fit.beta[i]!, 0));
  const diffs = post.map((x, i) => x.value - cf[i]!);
  const effect = mean(diffs);
  const residualSd = Math.sqrt(fit.sigma2);
  const rho = Math.max(-0.95, Math.min(0.95, lag1(fit.residuals)));
  const inflate = Math.sqrt((1 + rho) / (1 - rho));
  const xbar = design(0, season).map((_, j) => mean(post.map((x) => design(idx(x.date), season)[j]!)));
  let paramVar = 0;
  for (let i = 0; i < xbar.length; i += 1) for (let j = 0; j < xbar.length; j += 1) paramVar += xbar[i]! * fit.xtxInv[i]![j]! * xbar[j]!;
  const se = Math.sqrt((residualSd * inflate) ** 2 / post.length + fit.sigma2 * paramVar);
  return { effect, se, preN: pre.length, postN: post.length, residualSd, rho, slope: fit.beta[1]!, counterfactualMean: mean(cf), actualMean: mean(post.map((x) => x.value)), residuals: fit.residuals };
}

export interface CausalOutput {
  effect: { estimate: number; se: number; q10: number; q50: number; q90: number };
  pre: { observations: number; slope_per_day: number; residual_sd: number; lag1: number }; post: { observations: number; actual_mean: number; counterfactual_mean: number };
  placebo: { dates: string[]; effects: number[]; p_value: number | null };
  balance: { smd: number; balanced: boolean };
  sensitivity: { pre_windows: Array<{ pre_days: number; effect: number }>; range: [number, number]; sign_stable: boolean };
  identification: { assumptions: string[]; statement: string }; intervention: Intervention;
}

export function interruptedTimeSeries(points: readonly Point[], d: CausalDeclarations, seasonality: number): CausalOutput {
  const season = Math.max(1, Math.min(14, d.season ?? seasonality));
  const main = estimate(points, d.intervention.date, d.pre_days, d.post_days, season);
  if (main === null) {
    throw new Error(`causal-its: the history does not cover ${d.pre_days} pre-intervention and at least 3 post-intervention days around ${d.intervention.date}`);
  }
  // PLACEBO — fake dates spaced through the pre window, each leaving a full post window before the real date.
  const placeboDates: string[] = []; const placeboEffects: number[] = [];
  const firstDate = points[0]?.date ?? d.intervention.date;
  for (let k = 1; k <= 8; k += 1) {
    const fake = addDays(d.intervention.date, -d.post_days - k * Math.max(7, Math.floor(d.post_days / 2)));
    if (addDays(fake, -Math.floor(d.pre_days / 2)) < firstDate) break;
    const e = estimate(points.filter((p) => p.date < d.intervention.date), fake, Math.min(d.pre_days, Math.max(28, Math.floor(d.pre_days / 2))), d.post_days, season);
    if (e !== null) { placeboDates.push(fake); placeboEffects.push(round(e.effect, 4)); }
  }
  const pValue = placeboEffects.length === 0 ? null : round((1 + placeboEffects.filter((e) => Math.abs(e) >= Math.abs(main.effect)).length) / (placeboEffects.length + 1), 4);
  // BALANCE — the pre fit's residual mean over its last post_days, in residual standard deviations.
  const tail = main.residuals.slice(-Math.min(d.post_days, main.residuals.length));
  const smd = main.residualSd === 0 ? 0 : mean(tail) / main.residualSd;
  // SENSITIVITY — other pre windows.
  const preWindows: Array<{ pre_days: number; effect: number }> = [];
  for (const f of [0.5, 0.75, 1, 1.25]) {
    const pd = Math.round(d.pre_days * f);
    const e = estimate(points, d.intervention.date, pd, d.post_days, season);
    if (e !== null) preWindows.push({ pre_days: pd, effect: round(e.effect, 4) });
  }
  const effects = preWindows.map((w) => w.effect);
  const range: [number, number] = [Math.min(...effects), Math.max(...effects)];
  return {
    effect: { estimate: round(main.effect, 4), se: round(main.se, 4), q10: round(main.effect - Z90 * main.se, 4), q50: round(main.effect, 4), q90: round(main.effect + Z90 * main.se, 4) },
    pre: { observations: main.preN, slope_per_day: round(main.slope, 6), residual_sd: round(main.residualSd, 4), lag1: round(main.rho, 4) },
    post: { observations: main.postN, actual_mean: round(main.actualMean, 4), counterfactual_mean: round(main.counterfactualMean, 4) },
    placebo: { dates: placeboDates, effects: placeboEffects, p_value: pValue },
    balance: { smd: round(smd, 4), balanced: Math.abs(smd) < 0.25 },
    sensitivity: { pre_windows: preWindows, range, sign_stable: effects.every((e) => Math.sign(e) === Math.sign(main.effect)) },
    identification: d.identification, intervention: d.intervention,
  };
}
