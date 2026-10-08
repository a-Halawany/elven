/**
 * CP-6 B25-F2 — ENSEMBLE OUTPUT COMPATIBILITY. The review's finding: the router's `run` dropped each family's unit, outcome meaning and
 * uncertainty type, and the manager labelled every member with the series' unit — an EUR optimisation SCENARIO BAND passed through and was
 * combined with a transit-level predictive DISTRIBUTION (all three carry q10/q50/q90; the precision check accepted it).
 *
 * THE RULE (pure; the manager applies it to every computed member before anything is combined): an ensemble answers ONE question — the
 * FUTURE LEVEL of its series (or of its target) in one unit and one temporal aggregation, as a PREDICTIVE DISTRIBUTION. A member is combined
 * only when its output semantics match that question on all four: meaning, temporal aggregation, unit and uncertainty. Anything else — a
 * causal EFFECT (an effect interval), an optimisation OBJECTIVE (a scenario band over declared parameters), an event probability, a
 * 60-day mean where the question is the day's value, another unit — is EXCLUDED and DISCLOSED with the mismatch named (class
 * `incompatible`); when fewer than two compatible members remain the run is REFUSED (`ensemble rejected (incompatible): …`). An output
 * that declares no semantics is never assumed compatible.
 *
 * THE QUESTION: without a target, the series' value on the target day in the series' unit (the legacy builtins' quantity). With a quantity
 * target, its unit and its declared aggregation (definition.quantity.aggregation: value | window_mean with window_days). A target that
 * declares an `effect` or an `objective` quantity is refused at ADMISSION: the declared combination rules (linear_pool@1,
 * quantile_average@1) pool predictive distributions of a future level, not effect intervals or scenario bands.
 */
import type { OutputSemantics } from '../portfolio/seams.js';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});

/** The legacy builtins (seasonal naive, Holt-Winters): the series' value at the horizon, an empirical-error predictive band. */
export function legacySemantics(seriesUnit: string): OutputSemantics {
  return { meaning: 'future_level', aggregation: 'value', unit: seriesUnit, uncertainty: 'predictive_distribution', statement: 'the series\' value on the target day' };
}

/** The question a run answers, or the reason it cannot be an ensemble's question (refused at admission). */
export function questionOf(target: Row | null | undefined, seriesUnit: string): { question: OutputSemantics } | { refused: string } {
  const t = target === null || target === undefined ? null : rec(target);
  const kind = t === null ? 'quantity' : String(t['kind'] ?? 'quantity');
  const q = rec(rec(t?.['definition'])['quantity']);
  const agg = typeof q['aggregation'] === 'string' ? q['aggregation'] : 'value';
  if (t !== null && kind === 'quantity' && (agg === 'effect' || agg === 'objective')) {
    return { refused: `target ${String(t['target_key'])} v${String(t['version'])} declares its quantity as "${agg}"; the ensemble manager combines predictive distributions of a future level only `
      + '(linear_pool@1 and quantile_average@1 pool predictive distributions, not effect intervals or scenario bands)' };
  }
  const unit = t !== null && kind === 'quantity' ? String(t['unit']) : seriesUnit;
  const windowDays = typeof q['window_days'] === 'number' && Number.isInteger(q['window_days']) && q['window_days'] >= 1 ? q['window_days'] : null;
  const aggregation = agg === 'window_mean' ? (windowDays === null ? 'window_mean:undeclared' : windowDays === 1 ? 'value' : `window_mean:${windowDays}d`) : 'value';
  return { question: { meaning: 'future_level', aggregation, unit, uncertainty: 'predictive_distribution',
                       statement: aggregation === 'value' ? 'the value on the target day' : aggregation === 'window_mean:undeclared' ? 'a window mean whose window the target does not declare' : `the ${windowDays}-day mean ending at the target day` } };
}

/** The question in words (used in the refusals and the disclosures). */
export function describeQuestion(q: OutputSemantics): string {
  return `a future level (${q.aggregation}) in ${q.unit}, a predictive distribution`;
}

/** null when the member answers the question; otherwise each mismatch named (`meaning objective_value ≠ future_level; unit EUR ≠ …`). */
export function incompatibility(question: OutputSemantics, s: OutputSemantics | null | undefined): string | null {
  if (s === null || s === undefined || typeof s !== 'object') return 'the output declares no semantics (meaning, aggregation, unit, uncertainty); it is never assumed compatible';
  const diff: string[] = [];
  if (s.meaning !== question.meaning) diff.push(`meaning ${s.meaning} ≠ ${question.meaning}`);
  if (s.aggregation !== question.aggregation) diff.push(`aggregation ${s.aggregation} ≠ ${question.aggregation}`);
  if (s.unit !== question.unit) diff.push(`unit ${s.unit} ≠ ${question.unit}`);
  if (s.uncertainty !== question.uncertainty) diff.push(`uncertainty ${s.uncertainty} ≠ ${question.uncertainty}`);
  return diff.length === 0 ? null : diff.join('; ');
}
