/**
 * B92 §CO (0113 §CO.2/§CO.5) — THE UNCERTAINTY OF A COMPARISON, as pure functions. The port (analytics.compare_results) decides; these mirror
 * its rules so the harness can cross-check the database's numbers and a reader (§MD's catalog, §OR's review) can word a comparison without
 * re-deciding it: Wilson's 95 % interval of a proportion (D6, the prelude's analytics.wilson), Newcombe's hybrid score interval of a
 * difference of two proportions (method 10), and the medians rule for durations (a claim only when the two order-statistic intervals do not
 * overlap; none when one is unbounded — n < 6). Nothing here invents a value: an absent input answers null.
 */
export const Z95 = 1.959964;

export interface Interval { lo: number; hi: number }
/** Wilson's 95 % interval of k/n; null when n ≤ 0 or k outside [0, n]. Rounded to 6 places as the database rounds. */
export function wilson(k: number, n: number, z = Z95): Interval | null {
  if (!(n > 0) || k < 0 || k > n) return null;
  const p = k / n; const z2 = z * z;
  const centre = p + z2 / (2 * n); const half = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n); const den = 1 + z2 / n;
  return { lo: round6(Math.max(0, (centre - half) / den)), hi: round6(Math.min(1, (centre + half) / den)) };
}
export const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

export interface Difference { estimate: number; lo: number; hi: number }
/** Newcombe's hybrid score interval (method 10) of k1/n1 − k2/n2 from the two Wilson intervals; null when either side has no interval. */
export function newcombe(k1: number, n1: number, k2: number, n2: number): Difference | null {
  const w1 = wilson(k1, n1); const w2 = wilson(k2, n2);
  if (w1 === null || w2 === null) return null;
  const p1 = k1 / n1; const p2 = k2 / n2; const d = p1 - p2;
  return {
    estimate: round6(d),
    lo: round6(Math.max(-1, d - Math.sqrt((p1 - w1.lo) ** 2 + (w2.hi - p2) ** 2))),
    hi: round6(Math.min(1, d + Math.sqrt((w1.hi - p1) ** 2 + (p2 - w2.lo) ** 2))),
  };
}

export type RateClaim = 'a_higher' | 'a_lower' | 'no_difference_shown';
/** The claim a rate comparison may make: a direction only when the difference's interval excludes 0. */
export function rateClaim(d: Difference): RateClaim {
  if (d.lo > 0) return 'a_higher';
  if (d.hi < 0) return 'a_lower';
  return 'no_difference_shown';
}

export type MedianClaim = 'a_higher' | 'a_lower' | 'no_claim_overlap' | 'no_claim_unbounded';
/** The claim a duration comparison may make from the two medians' intervals (null bounds = unbounded, n < 6). */
export function medianClaim(a: { lo: number | null; hi: number | null }, b: { lo: number | null; hi: number | null }): MedianClaim {
  if (a.lo === null || a.hi === null || b.lo === null || b.hi === null) return 'no_claim_unbounded';
  if (a.lo > b.hi) return 'a_higher';
  if (a.hi < b.lo) return 'a_lower';
  return 'no_claim_overlap';
}

/** The class word of a standing-evaluation reason (0113 §CO.3): the prefix before the colon, or null for a reason of another origin. */
export const CHECK_CLASSES = ['stale', 'incomplete', 'biased', 'non-comparable', 'gamed', 'privacy', 'outcome-detached'] as const;
export type CheckClass = (typeof CHECK_CLASSES)[number];
export function reasonClass(reason: string): CheckClass | null {
  const head = reason.split(':', 1)[0]?.trim() ?? '';
  return (CHECK_CLASSES as readonly string[]).includes(head) ? (head as CheckClass) : null;
}
/** The attention class a standing-evaluation failure routes to (hook 2): privacy → analytics.privacy; the others → analytics.metric. */
export function routedClass(c: CheckClass): 'analytics.privacy' | 'analytics.metric' { return c === 'privacy' ? 'analytics.privacy' : 'analytics.metric'; }

/** A reconciliation's outcome from its unit classes (0113 §CO.7): discrepant > unpriced > matched; no unit at all is `empty` — never a pass. */
export function reconciliationOutcome(classes: Array<'matched' | 'unpriced' | 'discrepant'>): 'matched' | 'unpriced' | 'discrepant' | 'empty' {
  if (classes.length === 0) return 'empty';
  if (classes.includes('discrepant')) return 'discrepant';
  if (classes.includes('unpriced')) return 'unpriced';
  return 'matched';
}
