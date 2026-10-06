/**
 * B25 §EN (0108) — THE ENSEMBLE'S ARITHMETIC, pure and deterministic: the declared, versioned combination rules (linear_pool@1,
 * quantile_average@1), the weighting (equal | skill), the divergence measure (disagreement@1 — the SAME arithmetic as the port's
 * prediction.ensemble_divergence, which the completion port computes itself and compares), the precision check (PER-07: a combination
 * more precise than the members agree is refused) and the naming of the assumptions that split two members.
 *
 * ENSEMBLE_RULES is the TypeScript side of prediction.ensemble_rules() (the harness compares the two). Nothing here reads a clock, a
 * database or a random source.
 */

export interface Quantiles { q10: number; q50: number; q90: number }

/** The rules as prediction.ensemble_rules() declares them (§EN.1) — the same JSON, key for key. */
export const ENSEMBLE_RULES = Object.freeze({
  'manager@1': {
    kind: 'manager', version: 1, min_members: 2, max_members: 12, max_attempts: 5, max_compute_ms: 120000,
    defaults: { members: 6, attempts: 2, compute_ms: 30000 },
    statement: 'an ensemble needs at least two included members; members are run in the plan\'s order; a member that fails is retried up to the budget\'s attempts and then EXCLUDED and disclosed; members beyond the member budget, or reached after the compute budget is spent, are EXCLUDED and disclosed; a run with fewer than two members FAILS and is escalated to its forecast owner',
  },
  'linear_pool@1': {
    kind: 'combination', version: 1, tail_ratio: 0.25,
    statement: 'the members\' distributions MIXED with the declared weights (a linear opinion pool); each member read as the piecewise-linear CDF through its 10/50/90 quantiles, with linear tails carrying 10% each over a quarter of the adjacent inner span; the pool\'s 10/50/90 quantiles solved by bisection',
  },
  'quantile_average@1': {
    kind: 'combination', version: 1,
    statement: 'the weighted average of the members\' 10/50/90 quantiles (Vincentisation); refused when it is more precise than the members agree',
  },
  'disagreement@1': {
    kind: 'disagreement', version: 1, notable_gap: 0.25, material_gap: 0.5, material_overlap: 0.25, gap_cap: 999,
    statement: 'for every pair of included members: the median gap over the mean of their 10-90 widths (gap ratio) and the overlap of their 10-90 bands over the narrower width; MATERIAL when the gap ratio is at least 0.5 or the overlap at most 0.25, NOTABLE when the gap ratio is at least 0.25, else the members AGREE; the run\'s level is its worst pair',
  },
  weighting: {
    equal: 'every included member weighs the same',
    skill: 'each member weighs the inverse of its mean pinball loss on the applicable backtest (same series, horizon and method version, evidence known by the cut-off, history ending by the origin); when any included member has none, equal weights are used and the answer says so',
  },
  precision: { statement: 'PER-07: the combined 10-90 band must contain every included member\'s median; a combination more precise than the members agree is refused' },
});

export type CombinationRule = 'linear_pool@1' | 'quantile_average@1';
export const COMBINATION_RULES: readonly CombinationRule[] = ['linear_pool@1', 'quantile_average@1'];
export const DISAGREEMENT_RULE = 'disagreement@1';
export type Weighting = 'equal' | 'skill';
export type DisagreementLevel = 'agree' | 'notable' | 'material';

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/* ───────────────────────── the weights ───────────────────────── */

/**
 * The weights for the included members, in their order. `skill` uses the inverse of each member's mean pinball loss; when any member
 * has no positive, finite score the weights fall back to EQUAL and the answer says so (never a partial skill weighting).
 */
export function weightsFor(weighting: Weighting, pinballs: Array<number | null>): { weights: number[]; used: Weighting; note: string } {
  const n = pinballs.length;
  if (n === 0) return { weights: [], used: 'equal', note: 'no member to weigh' };
  const equal = pinballs.map(() => 1 / n);
  if (weighting === 'equal') return { weights: equal, used: 'equal', note: ENSEMBLE_RULES.weighting.equal };
  const scored = pinballs.every((p) => p !== null && Number.isFinite(p) && p > 0);
  if (!scored) {
    return { weights: equal, used: 'equal', note: `skill weights need an applicable backtest score for every member; ${pinballs.filter((p) => p === null || !(Number(p) > 0)).length} of ${n} have none, so EQUAL weights are used` };
  }
  const inv = pinballs.map((p) => 1 / (p as number));
  const total = inv.reduce((a, b) => a + b, 0);
  return { weights: inv.map((x) => x / total), used: 'skill', note: ENSEMBLE_RULES.weighting.skill };
}

/* ───────────────────────── the combinations ───────────────────────── */

/** A member's distribution as the piecewise-linear CDF through its quantiles (linear_pool@1's reading). */
export function pieceCdf(q: Quantiles, tailRatio = ENSEMBLE_RULES['linear_pool@1'].tail_ratio): (x: number) => number {
  const lo = q.q10 - tailRatio * (q.q50 - q.q10);
  const hi = q.q90 + tailRatio * (q.q90 - q.q50);
  const knots: Array<[number, number]> = [[lo, 0], [q.q10, 0.1], [q.q50, 0.5], [q.q90, 0.9], [hi, 1]];
  return (x: number): number => {
    if (x < lo) return 0;
    if (x >= hi) return 1;
    for (let i = 1; i < knots.length; i += 1) {
      const [x1, f1] = knots[i] as [number, number]; const [x0, f0] = knots[i - 1] as [number, number];
      if (x < x1) return x1 === x0 ? f1 : f0 + ((f1 - f0) * (x - x0)) / (x1 - x0);
      // a degenerate segment (x1 === x0) jumps straight to f1 at x0
    }
    return 1;
  };
}

/** The p-quantile of the weighted mixture of the members' CDFs, by bisection (the smallest x with F(x) ≥ p, to 1e-9 of the span). */
export function mixtureQuantile(qs: Quantiles[], weights: number[], p: number, tailRatio = ENSEMBLE_RULES['linear_pool@1'].tail_ratio): number {
  const cdfs = qs.map((q) => pieceCdf(q, tailRatio));
  const F = (x: number): number => cdfs.reduce((s, c, i) => s + (weights[i] as number) * c(x), 0);
  let lo = Math.min(...qs.map((q) => q.q10 - tailRatio * (q.q50 - q.q10))) - 1e-9;
  let hi = Math.max(...qs.map((q) => q.q90 + tailRatio * (q.q90 - q.q50))) + 1e-9;
  if (lo === hi) return lo;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (F(mid) >= p) hi = mid; else lo = mid;
    if (hi - lo < 1e-9 * Math.max(1, Math.abs(hi))) break;
  }
  return hi;
}

export function combine(rule: CombinationRule, qs: Quantiles[], weights: number[]): Quantiles {
  if (qs.length === 0) throw new Error('nothing to combine');
  if (rule === 'quantile_average@1') {
    const avg = (k: keyof Quantiles): number => qs.reduce((s, q, i) => s + (weights[i] as number) * q[k], 0);
    return { q10: avg('q10'), q50: avg('q50'), q90: avg('q90') };
  }
  const q10 = mixtureQuantile(qs, weights, 0.1); const q50 = mixtureQuantile(qs, weights, 0.5); const q90 = mixtureQuantile(qs, weights, 0.9);
  // bisection is monotone in p; the max/min guard only absorbs the last ulp
  return { q10, q50: Math.max(q10, q50), q90: Math.max(q50, q90) };
}

/** Each step of the members' paths combined by the same rule (the paths have the same steps: one history, one horizon). */
export function combinePaths(rule: CombinationRule, paths: Array<Array<{ step: number } & Quantiles>>, weights: number[]): Array<{ step: number; date: null } & Quantiles> {
  const steps = Math.min(...paths.map((p) => p.length));
  const out: Array<{ step: number; date: null } & Quantiles> = [];
  for (let s = 0; s < steps; s += 1) {
    const qs = paths.map((p) => p[s] as Quantiles);
    out.push({ step: (paths[0]?.[s]?.step ?? s + 1), date: null, ...combine(rule, qs, weights) });
  }
  return out;
}

/* ───────────────────────── the disagreement ───────────────────────── */

export interface PairMeasure { a: number; b: number; gap: number; gap_ratio: number; overlap: number; level: DisagreementLevel }
export interface Divergence { level: DisagreementLevel; max_gap_ratio: number; min_overlap: number; pairs: PairMeasure[]; driving_pair: { a: number; b: number } | null }

/** disagreement@1 — the port's prediction.ensemble_divergence, line for line (members are {ordinal, quantiles} as ISSUED: rounded). */
export function divergence(members: Array<{ ordinal: number } & Quantiles>, rule = ENSEMBLE_RULES['disagreement@1']): Divergence {
  const pairs: PairMeasure[] = [];
  let worst: DisagreementLevel = 'agree'; let maxRatio = 0; let minOverlap = 1; let drive: { a: number; b: number } | null = null;
  for (let i = 0; i < members.length - 1; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const a = members[i] as { ordinal: number } & Quantiles; const b = members[j] as { ordinal: number } & Quantiles;
      const wa = a.q90 - a.q10; const wb = b.q90 - b.q10;
      const gap = Math.abs(a.q50 - b.q50); const spread = (wa + wb) / 2;
      const ratio = spread > 0 ? Math.min(gap / spread, rule.gap_cap) : gap > 0 ? rule.gap_cap : 0;
      const inter = Math.max(0, Math.min(a.q90, b.q90) - Math.max(a.q10, b.q10));
      const narrow = Math.min(wa, wb);
      const overlap = narrow > 0 ? Math.min(inter / narrow, 1)
        : wa <= wb ? (a.q50 >= b.q10 && a.q50 <= b.q90 ? 1 : 0)
        : (b.q50 >= a.q10 && b.q50 <= a.q90 ? 1 : 0);
      const level: DisagreementLevel = ratio >= rule.material_gap || overlap <= rule.material_overlap ? 'material' : ratio >= rule.notable_gap ? 'notable' : 'agree';
      pairs.push({ a: a.ordinal, b: b.ordinal, gap: r4(gap), gap_ratio: r4(ratio), overlap: r4(overlap), level });
      if (drive === null || ratio > maxRatio) drive = { a: a.ordinal, b: b.ordinal };
      maxRatio = Math.max(maxRatio, ratio); minOverlap = Math.min(minOverlap, overlap);
      worst = worst === 'material' || level === 'material' ? 'material' : worst === 'notable' || level === 'notable' ? 'notable' : 'agree';
    }
  }
  return { level: worst, max_gap_ratio: r4(maxRatio), min_overlap: r4(minOverlap), pairs, driving_pair: drive };
}

/** PER-07: the members whose median lies outside the combined 10–90 band (empty: the combination claims no precision they lack). */
export function precisionBreaches(combined: Quantiles, members: Array<{ ordinal: number; methodRef: string } & Quantiles>): Array<{ ordinal: number; methodRef: string; q50: number }> {
  const eps = 1e-9 * Math.max(1, Math.abs(combined.q90), Math.abs(combined.q10));
  return members.filter((m) => m.q50 < combined.q10 - eps || m.q50 > combined.q90 + eps).map((m) => ({ ordinal: m.ordinal, methodRef: m.methodRef, q50: m.q50 }));
}

/* ───────────────────────── the assumptions that split ───────────────────────── */

/**
 * The structural assumption each method makes by construction — declared here, never inferred: what the method takes the future to be
 * like. A disagreement between two methods resting on the SAME declared assumptions is still named: it is this split.
 */
export const STRUCTURAL_ASSUMPTIONS: Readonly<Record<string, string>> = Object.freeze({
  'seasonal-naive': 'the next period repeats the last observed season: no trend and no change of level',
  'holt-winters-additive': 'the fitted level and trend continue through the horizon, with the additive season',
});

/** The method family behind a router reference (`seasonal_naive@1`, `holt_winters@1`, or the models' own names). */
export function legacyMethodOf(methodRef: string): 'seasonal-naive' | 'holt-winters-additive' | null {
  const key = methodRef.split('@')[0]?.replace(/_/g, '-') ?? '';
  if (key === 'seasonal-naive') return 'seasonal-naive';
  if (key === 'holt-winters' || key === 'holt-winters-additive') return 'holt-winters-additive';
  return null;
}

export interface SplitMember { ordinal: number; methodRef: string; tied: string[] }
export interface SplittingAssumption { assumption_id: string; title: string | null; held_by: string[]; not_held_by: string[] }

/**
 * The DECLARED assumptions on which two members differ (the symmetric difference of their tied sets), each with who holds it, and the
 * methods' structural assumptions beside them. `titles` names each assumption as the Strategy Graph holds it.
 */
export function splittingAssumptions(a: SplitMember, b: SplitMember, titles: Readonly<Record<string, string>>): {
  declared: SplittingAssumption[]; structural: Array<{ method_ref: string; assumption: string }>;
} {
  const declared: SplittingAssumption[] = [];
  for (const id of a.tied) if (!b.tied.includes(id)) declared.push({ assumption_id: id, title: titles[id] ?? null, held_by: [a.methodRef], not_held_by: [b.methodRef] });
  for (const id of b.tied) if (!a.tied.includes(id)) declared.push({ assumption_id: id, title: titles[id] ?? null, held_by: [b.methodRef], not_held_by: [a.methodRef] });
  const structural = [a, b].map((m) => {
    const legacy = legacyMethodOf(m.methodRef);
    return { method_ref: m.methodRef, assumption: legacy === null ? 'the method\'s structural assumption is declared in its registry entry' : (STRUCTURAL_ASSUMPTIONS[legacy] as string) };
  });
  return { declared, structural };
}

/** A number for a statement (four significant decimals, trailing zeros dropped). */
export function fmt(v: number): string { return Number.isFinite(v) ? v.toFixed(4).replace(/\.?0+$/, '') : 'n/a'; }
