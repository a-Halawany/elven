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
