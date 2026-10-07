/**
 * CP-6 B25 §MR (0108) — THE STRUCTURAL-JUDGMENTAL FAMILY (`regime-judgement`): regime / state probabilities at a long horizon, ISSUED IN
 * SCENARIO LANGUAGE and never presented as validated.
 *
 *   A target declares its REGIME CATEGORIES (each a rule on the mean of a classification window — `< 41 transits/day`, … — and one
 *   `otherwise` category last). The registry entry declares a STRUCTURAL JUDGEMENT: pseudo-counts per category, a rationale, and the named
 *   human who made it (approved by the method steward with the entry). The EVIDENCE SUMMARY is counted, not narrated: the series is cut into
 *   non-overlapping classification windows and each window is classified by its mean. The probability of category c is the Dirichlet
 *   posterior mean (α_c + n_c) / (Σα + n): every number traceable to a declared count or a counted window — a probability is never derived
 *   from narrative. The judgement's weight is shown beside the evidence's (their shares of the total count) and a SENSITIVITY to the
 *   judgement (pseudo-counts halved and doubled) is reported: what the issued numbers would be had the judgement been held more loosely or
 *   more firmly.
 */
import { addDays, between, mean, round, type Point } from './stats.js';
import type { Comparator } from './event.js';

export const REGIME_JUDGEMENT_REF = 'regime-judgement';

export interface RegimeCategory { key: string; label: string; rule: { comparator: Comparator; threshold: number } | null }
export interface RegimeJudgement { pseudo_counts: Record<string, number>; rationale: string; judged_by: string }

export function classify(value: number, categories: readonly RegimeCategory[]): string {
  for (const c of categories) {
    if (c.rule === null) return c.key;
    const t = c.rule.threshold;
    const ok = c.rule.comparator === '<' ? value < t : c.rule.comparator === '<=' ? value <= t : c.rule.comparator === '>' ? value > t : value >= t;
    if (ok) return c.key;
  }
  return categories[categories.length - 1]?.key ?? 'unclassified';
}

export interface RegimeOutput {
  categories: Array<{ key: string; label: string; judgement_count: number; evidence_count: number; probability: number }>;
  windows: number; skipped: number; classificationWindowDays: number;
  judgementShare: number; evidenceShare: number;
  sensitivity: { halved: Record<string, number>; doubled: Record<string, number>; maxShift: number };
  modal: string;
}

export function regimeProbabilities(points: readonly Point[], categories: readonly RegimeCategory[], classificationWindowDays: number, judgement: RegimeJudgement): RegimeOutput {
  if (categories.length < 2) throw new Error('regime-judgement: at least two categories are declared');
  if (categories[categories.length - 1]?.rule !== null) throw new Error('regime-judgement: the last category is the `otherwise` category (rule null)');
  for (const c of categories) {
    const a = judgement.pseudo_counts[c.key];
    if (a === undefined || !(a > 0)) throw new Error(`regime-judgement: the judgement declares no positive pseudo-count for ${c.key}`);
  }
  const counts = new Map<string, number>(categories.map((c) => [c.key, 0]));
  let windows = 0; let skipped = 0;
  if (points.length > 0) {
    const first = points[0]!.date; const end = points[points.length - 1]!.date;
    for (let j = 0; ; j += 1) {
      const to = addDays(end, -j * classificationWindowDays); const from = addDays(to, -classificationWindowDays);
      if (from < addDays(first, -1)) break;
      const inside = between(points, from, to);
      if (inside.length * 2 < classificationWindowDays * 5 / 7) { skipped += 1; continue; }   // half a business-day window at least
      const k = classify(mean(inside.map((p) => p.value)), categories);
      counts.set(k, (counts.get(k) ?? 0) + 1); windows += 1;
    }
  }
  const probs = (scale: number): Record<string, number> => {
    const total = categories.reduce((s, c) => s + scale * judgement.pseudo_counts[c.key]! + (counts.get(c.key) ?? 0), 0);
    return Object.fromEntries(categories.map((c) => [c.key, round((scale * judgement.pseudo_counts[c.key]! + (counts.get(c.key) ?? 0)) / total)]));
  };
  const base = probs(1); const halved = probs(0.5); const doubled = probs(2);
  const maxShift = round(Math.max(...categories.map((c) => Math.max(Math.abs(halved[c.key]! - base[c.key]!), Math.abs(doubled[c.key]! - base[c.key]!)))), 4);
  const alpha = categories.reduce((s, c) => s + judgement.pseudo_counts[c.key]!, 0);
  const out = categories.map((c) => ({ key: c.key, label: c.label, judgement_count: judgement.pseudo_counts[c.key]!, evidence_count: counts.get(c.key) ?? 0, probability: base[c.key]! }));
  const modal = [...out].sort((a, b) => b.probability - a.probability || a.key.localeCompare(b.key))[0]!.key;
  return { categories: out, windows, skipped, classificationWindowDays, judgementShare: round(alpha / (alpha + windows), 4), evidenceShare: round(windows / (alpha + windows), 4),
           sensitivity: { halved, doubled, maxShift }, modal };
}

/* ───────────── B25 completion (G1, V00-T-009 / L6-C02): FEATURES AS MODEL INPUTS — declared conditions on the frozen features ───────────── */

/**
 * A CONDITION declared with the judgement (approved by the steward with the entry): when the frozen information set's feature `feature`
 * holds `comparator threshold` on its SCALAR value, `pseudo_count` is added to regime `regime`. The feature is read from the FROZEN set
 * (graph.*, twin.<element>, evidence.*, assumption.*) — never re-read, never narrated; a condition that does not hold adds nothing.
 */
export type ConditionComparator = '<' | '<=' | '>' | '>=' | '=' | '!=';
export interface RegimeCondition { feature: string; comparator: ConditionComparator; threshold: number | string | boolean; regime: string; pseudo_count: number; rationale: string }
export interface FrozenFeature { key: string; source: string; digest: string; value?: unknown }
export interface ConditionResult {
  feature: string; source: string | null; digest: string | null; value: number | string | boolean | null; comparator: ConditionComparator; threshold: number | string | boolean;
  regime: string; pseudo_count: number; rationale: string; held: boolean;
}

const isScalar = (v: unknown): v is number | string | boolean => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';

/** Evaluate the declared conditions on the frozen features. `problems` names every condition that cannot be read (absent, non-scalar, a
 *  numeric comparison on a non-number): the caller refuses the forecast (`forecast rejected (context)`) — a condition is never skipped. */
export function evaluateConditions(conditions: readonly RegimeCondition[], features: readonly FrozenFeature[]): { results: ConditionResult[]; added: Record<string, number>; problems: string[] } {
  const byKey = new Map(features.map((f) => [f.key, f]));
  const results: ConditionResult[] = []; const added: Record<string, number> = {}; const problems: string[] = [];
  for (const c of conditions) {
    const f = byKey.get(c.feature);
    if (f === undefined) { problems.push(`${c.feature} is not a feature of the frozen information set`); continue; }
    if (!isScalar(f.value)) { problems.push(`${c.feature} has no scalar value in the frozen information set (a condition reads a number, a string or a boolean)`); continue; }
    const numeric = c.comparator !== '=' && c.comparator !== '!=';
    if (numeric && (typeof f.value !== 'number' || typeof c.threshold !== 'number')) { problems.push(`${c.feature} = ${String(f.value)} cannot be compared ${c.comparator} ${String(c.threshold)} (a number is needed)`); continue; }
    const v = f.value; const t = c.threshold;
    const held = c.comparator === '=' ? v === t : c.comparator === '!=' ? v !== t
      : c.comparator === '<' ? (v as number) < (t as number) : c.comparator === '<=' ? (v as number) <= (t as number) : c.comparator === '>' ? (v as number) > (t as number) : (v as number) >= (t as number);
    if (held) added[c.regime] = round((added[c.regime] ?? 0) + c.pseudo_count, 6);
    results.push({ feature: c.feature, source: f.source, digest: f.digest, value: v, comparator: c.comparator, threshold: t, regime: c.regime, pseudo_count: c.pseudo_count, rationale: c.rationale, held });
  }
  return { results, added, problems };
}

/* ───────────── B25 completion (G6, V00-T-051: the 5y treatment) — PATH DEPENDENCE, OPTION VALUE, RESILIENCE (additional output) ───────────── */

/** The classification windows in CHRONOLOGICAL order (the same windows regimeProbabilities counts; a sparse window is null — it breaks a path). */
export function classifiedWindows(points: readonly Point[], categories: readonly RegimeCategory[], classificationWindowDays: number): Array<{ end: string; regime: string | null }> {
  const out: Array<{ end: string; regime: string | null }> = [];
  if (points.length === 0) return out;
  const first = points[0]!.date; const end = points[points.length - 1]!.date;
  for (let j = 0; ; j += 1) {
    const to = addDays(end, -j * classificationWindowDays); const from = addDays(to, -classificationWindowDays);
    if (from < addDays(first, -1)) break;
    const inside = between(points, from, to);
    out.push({ end: to, regime: inside.length * 2 < classificationWindowDays * 5 / 7 ? null : classify(mean(inside.map((p) => p.value)), categories) });
  }
  return out.reverse();
}

export interface RegimePaths {
  windows: number; transitions_counted: number; smoothing: number; current: string | null; current_window_end: string | null; steps: number;
  counts: Record<string, Record<string, number>>; matrix: Record<string, Record<string, number>>; persistence: Record<string, number>;
  horizon_distribution: Record<string, number> | null; statement: string;
}

/**
 * THE PATH-DEPENDENT VIEW: the empirical window-to-window regime TRANSITIONS (consecutive classified windows; a sparse window breaks the
 * chain), Dirichlet-smoothed (a symmetric pseudo-count `smoothing` per cell, default 1), each regime's PERSISTENCE (its diagonal), and the
 * horizon's regime distribution PROPAGATED from the CURRENT regime (the latest classified window) over ⌈horizon / window⌉ steps. It is shown
 * BESIDE the issued probabilities, never instead of them: the issued numbers are the judgement-and-counts posterior; this is what the
 * history's own transitions say when the path starts where the corridor is now.
 */
export function regimePaths(points: readonly Point[], categories: readonly RegimeCategory[], classificationWindowDays: number, horizonDays: number, smoothing = 1): RegimePaths {
  if (!(smoothing > 0)) throw new Error('regime-judgement: the transition smoothing is a positive pseudo-count');
  const keys = categories.map((c) => c.key);
  const seq = classifiedWindows(points, categories, classificationWindowDays);
  const counts: Record<string, Record<string, number>> = Object.fromEntries(keys.map((a) => [a, Object.fromEntries(keys.map((b) => [b, 0]))]));
  let transitions = 0;
  for (let i = 1; i < seq.length; i += 1) {
    const a = seq[i - 1]!.regime; const b = seq[i]!.regime;
    if (a === null || b === null) continue;
    counts[a]![b]! += 1; transitions += 1;
  }
  const matrix: Record<string, Record<string, number>> = {};
  for (const a of keys) {
    const total = keys.reduce((s, b) => s + counts[a]![b]! + smoothing, 0);
    matrix[a] = Object.fromEntries(keys.map((b) => [b, (counts[a]![b]! + smoothing) / total]));
  }
  const persistence = Object.fromEntries(keys.map((k) => [k, round(matrix[k]![k]!, 4)]));
  const last = [...seq].reverse().find((w) => w.regime !== null) ?? null;
  const steps = Math.max(1, Math.ceil(horizonDays / classificationWindowDays));
  let dist: Record<string, number> | null = null;
  if (last !== null) {
    let pi: Record<string, number> = Object.fromEntries(keys.map((k) => [k, k === last.regime ? 1 : 0]));
    for (let s = 0; s < steps; s += 1) pi = Object.fromEntries(keys.map((b) => [b, keys.reduce((acc, a) => acc + pi[a]! * matrix[a]![b]!, 0)]));
    dist = Object.fromEntries(keys.map((k) => [k, round(pi[k]!, 4)]));
  }
  const label = (k: string): string => categories.find((c) => c.key === k)?.label ?? k;
  const statement = last === null
    ? 'THE PATH-DEPENDENT VIEW: no classified window — no current regime to start a path from; not assessed.'
    : `THE PATH-DEPENDENT VIEW (scenario language, not a validated forecast): starting from the current regime "${label(last.regime as string)}" (the window ending ${last.end}), `
      + `${transitions} counted window-to-window transition(s) (Dirichlet-smoothed, ${smoothing} per cell) carried over ${steps} step(s) of ${classificationWindowDays} days give `
      + `${keys.map((k) => `${label(k)} ${round(dist![k]!, 2)}`).join(', ')}; persistence ${keys.map((k) => `${label(k)} ${round(persistence[k]!, 2)}`).join(', ')}.`;
  return { windows: seq.filter((w) => w.regime !== null).length, transitions_counted: transitions, smoothing, current: last?.regime ?? null, current_window_end: last?.end ?? null, steps,
           counts, matrix: Object.fromEntries(keys.map((a) => [a, Object.fromEntries(keys.map((b) => [b, round(matrix[a]![b]!, 4)]))])), persistence, horizon_distribution: dist, statement };
}

/** A declared OPTION (human-approved with the entry): its cost and its payoff in each regime (the same unit for every option). */
export interface RegimeOption { key: string; label: string; cost: number; payoff: Record<string, number> }
export interface OptionAnalysis {
  options: Array<{ key: string; label: string; cost: number; net: Record<string, number>; expected: number; expected_under_path_view: number | null; resilience: number; worst_regime: string }>;
  best_commitment: { key: string; expected: number }; best_per_regime: Record<string, string>; expected_best_per_regime: number; option_value: number;
  most_resilient: { key: string; resilience: number }; statement: string;
}

/**
 * OPTION VALUE AND RESILIENCE under the ISSUED probabilities: each option's net payoff per regime (payoff − cost), its EXPECTED net payoff,
 * its RESILIENCE (the worst regime's net payoff); the OPTION VALUE OF FLEXIBILITY = E[best option per regime] − the best single commitment —
 * what waiting to learn the regime is worth (≥ 0). Under the path-dependent view each option's expectation is reported beside it.
 */
export function optionAnalysis(options: readonly RegimeOption[], categories: readonly RegimeCategory[], probabilities: Record<string, number>, pathView: Record<string, number> | null): OptionAnalysis {
  if (options.length === 0) throw new Error('regime-judgement: no option is declared');
  const keys = categories.map((c) => c.key);
  const rows = options.map((o) => {
    const net = Object.fromEntries(keys.map((k) => [k, round(Number(o.payoff[k]) - o.cost, 6)]));
    const expected = round(keys.reduce((s, k) => s + (probabilities[k] ?? 0) * net[k]!, 0), 6);
    const expectedPath = pathView === null ? null : round(keys.reduce((s, k) => s + (pathView[k] ?? 0) * net[k]!, 0), 6);
    const worst = [...keys].sort((a, b) => net[a]! - net[b]! || a.localeCompare(b))[0]!;
    return { key: o.key, label: o.label, cost: o.cost, net, expected, expected_under_path_view: expectedPath, resilience: net[worst]!, worst_regime: worst };
  });
  const best = [...rows].sort((a, b) => b.expected - a.expected || a.key.localeCompare(b.key))[0]!;
  const bestPer = Object.fromEntries(keys.map((k) => [k, [...rows].sort((a, b) => b.net[k]! - a.net[k]! || a.key.localeCompare(b.key))[0]!.key]));
  const ebr = round(keys.reduce((s, k) => s + (probabilities[k] ?? 0) * rows.find((r) => r.key === bestPer[k])!.net[k]!, 0), 6);
  const optionValue = round(Math.max(0, ebr - best.expected), 6);
  const resilient = [...rows].sort((a, b) => b.resilience - a.resilience || a.key.localeCompare(b.key))[0]!;
  const label = (k: string): string => categories.find((c) => c.key === k)?.label ?? k;
  const statement = `OPTION VALUE AND RESILIENCE (declared options; scenario language): the best single commitment under the issued probabilities is "${best.label}" (expected ${round(best.expected, 4)}); `
    + `choosing per regime after learning it would earn ${round(ebr, 4)} — the option value of flexibility is ${round(optionValue, 4)}; `
    + `the most resilient option is "${resilient.label}" (worst regime ${label(rows.find((r) => r.key === resilient.key)!.worst_regime)}: ${round(resilient.resilience, 4)}).`;
  return { options: rows, best_commitment: { key: best.key, expected: best.expected }, best_per_regime: bestPer, expected_best_per_regime: ebr, option_value: optionValue,
           most_resilient: { key: resilient.key, resilience: resilient.resilience }, statement };
}
