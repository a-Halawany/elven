/**
 * CP-6 B82 §TS (F-P7-E-07: NUM-01, NUM-02, NUM-03, NUM-09, NUM-11, CNT-09, HX-03, REL-09) — THE NUMBER GRAMMAR as pure functions (vitest,
 * node): components/truth.tsx renders exactly what these decide.
 *
 *  - THE PRECISION POLICY (NUM-09; DESIGN D17 — "the number-precision policy in code"): a registry keyed by measure kind × horizon × evidence
 *    class → the precision a value may be SHOWN at (significant digits, or a step for probabilities); a value given with more precision than
 *    the policy supports is rounded for display, its exact value kept for copying, and the rounding SAID ("unsupported precision"). Applied
 *    through B80's formatNumber (format-b80.ts) — the canonical value is never lost. Versioned (`NUMBER_POLICY_VERSION`); a changed rule is a
 *    new version (a governed database policy is the owner's to ask for — Q17).
 *  - PROBABILITY (NUM-01): 0–100 % or 0–1 BY THE DOMAIN CONTRACT (the caller names the scale; nothing converts silently), with the definition,
 *    the calibration, the horizon, the cutoff and the uncertainty beside it — a missing one is stated, never left blank.
 *  - CONFIDENCE (NUM-02): a NAMED calibrated class or an interval — never a bare number and never authority; an uncalibrated score reads
 *    "confidence not calibrated" with the score as what it is (a model score, not a probability).
 *  - RANGE (NUM-03): lower–upper with the unit and the method / confidence / scenario basis.
 *  - ESTIMATE (NUM-11): "~" or "Estimated" with the basis and the revision state.
 *  - UNCERTAINTY (HX-03, CNT-09, REL-09): the form, the magnitude or class in plain words, the drivers, the calibration, unsupported precision,
 *    alternatives and dissent where the caller holds them, and "partial or abstains" — a plain-language class word plus the quantitative form.
 *
 * Presentation never changes meaning: nothing here re-scales, re-labels or upgrades a value; every rounding is said. The class words carry no
 * certainty or authority word (content-b81 CERTAINTY_WORDS). CONSTRUCTION only (the walk is the demonstration; nothing here is accepted).
 */
import { formatNumber, type FormattedNumber } from './format-b80';

export const NUMBER_POLICY_VERSION = 'b82-ts-numbers-1';

/* ═════════════════════════════ THE PRECISION POLICY (NUM-09) ═════════════════════════════ */
export const MEASURE_KINDS = ['probability', 'confidence', 'quantity', 'count', 'rate', 'currency', 'duration', 'ratio', 'score'] as const;
export type MeasureKind = (typeof MEASURE_KINDS)[number];
export const HORIZONS = ['observed', 'nowcast', 'short', 'medium', 'long'] as const;
/** observed: a past fact; nowcast ≤ 7 days; short ≤ 90 days; medium ≤ 2 years; long beyond. */
export type HorizonClass = (typeof HORIZONS)[number];
export const EVIDENCE_CLASSES = ['observed', 'derived', 'calibrated_model', 'uncalibrated_model', 'elicited', 'synthetic'] as const;
export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export interface PrecisionRule {
  /** significant digits a value may be shown with (quantities, counts, rates, currency, durations, ratios, scores) */ significant: number;
  /** for a probability: the step in percentage points it is shown to (1 = whole percent, 5, 10) */ percentStep: number;
  why: string;
}
/** The base rule by evidence class — the strongest evidence first. */
const BY_EVIDENCE: Readonly<Record<EvidenceClass, PrecisionRule>> = {
  observed: { significant: 4, percentStep: 1, why: 'an observed value is shown as recorded, to four significant digits' },
  derived: { significant: 3, percentStep: 1, why: 'a value derived by a recorded method keeps three significant digits' },
  calibrated_model: { significant: 3, percentStep: 1, why: 'a calibrated model output supports three significant digits and whole percentages' },
  uncalibrated_model: { significant: 2, percentStep: 5, why: 'an uncalibrated model output supports two significant digits and probabilities to the nearest 5 %' },
  elicited: { significant: 2, percentStep: 5, why: 'an elicited judgement supports two significant digits and probabilities to the nearest 5 %' },
  synthetic: { significant: 2, percentStep: 5, why: 'a synthetic (scenario or simulated) value supports two significant digits and probabilities to the nearest 5 %' },
};
/** The horizon's cap on what any evidence supports (a longer horizon never supports more precision). */
const HORIZON_CAP: Readonly<Record<HorizonClass, { significant: number; percentStep: number; why: string }>> = {
  observed: { significant: 4, percentStep: 1, why: '' },
  nowcast: { significant: 3, percentStep: 1, why: '' },
  short: { significant: 3, percentStep: 1, why: '' },
  medium: { significant: 2, percentStep: 5, why: 'a horizon beyond 90 days supports no more than two significant digits and 5 % steps' },
  long: { significant: 1, percentStep: 10, why: 'a horizon beyond two years supports one significant digit and 10 % steps' },
};
/** A count is a whole number at any precision; a confidence is shown as its class, never at a precision. */
export function precisionFor(a: { measure: MeasureKind; horizon: HorizonClass; evidence: EvidenceClass }): PrecisionRule & { key: string; version: string } {
  const base = BY_EVIDENCE[a.evidence]; const cap = HORIZON_CAP[a.horizon];
  const significant = Math.min(base.significant, cap.significant);
  const percentStep = Math.max(base.percentStep, cap.percentStep);
  const why = [base.why, significant < base.significant || percentStep > base.percentStep ? cap.why : ''].filter((x) => x !== '').join('; ');
  return { key: `${a.measure}:${a.horizon}:${a.evidence}`, version: NUMBER_POLICY_VERSION, significant, percentStep, why };
}
/** Round to n significant digits (exactly; negative and zero handled; no exponent text). */
export function roundSignificant(v: number, n: number): number {
  if (!Number.isFinite(v) || v === 0) return v;
  const mag = Math.floor(Math.log10(Math.abs(v)));
  const factor = Math.pow(10, n - 1 - mag);
  return Math.round(v * factor) / factor;
}
/** How many decimals a number rounded to n significant digits shows (0 for large values). */
const decimalsFor = (v: number, n: number): number => (v === 0 ? 0 : Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(v)))));

export interface PreciseNumber extends FormattedNumber {
  /** the value as shown (rounded by the policy) */ shown: number | null;
  /** the given value carried MORE precision than the policy supports — it was rounded for display, and that is said */ unsupportedPrecision: boolean;
  rule: { key: string; version: string; significant: number; why: string };
}
/** NUM-09 — a number at the precision its measure × horizon × evidence supports, through formatNumber; the canonical value kept. */
export function preciseNumber(value: number | string | null | undefined, a: { measure: MeasureKind; horizon: HorizonClass; evidence: EvidenceClass; unit?: string | null; locale?: string }): PreciseNumber {
  const rule = precisionFor(a);
  const raw = typeof value === 'number' ? value : value === null || value === undefined ? NaN : Number(String(value).trim());
  const unit = a.unit ?? null;
  if (value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(raw)) {
    const f = formatNumber(value, { unit, ...(a.locale === undefined ? {} : { locale: a.locale }) });
    return { ...f, shown: null, unsupportedPrecision: false, rule: { key: rule.key, version: rule.version, significant: rule.significant, why: rule.why } };
  }
  const sig = a.measure === 'count' ? Math.max(rule.significant, String(Math.round(Math.abs(raw))).length) : rule.significant;
  const shown = a.measure === 'count' ? Math.round(raw) : roundSignificant(raw, sig);
  const decimals = a.measure === 'count' ? 0 : decimalsFor(shown, sig);
  const unsupportedPrecision = shown !== raw;
  // a rounded value keeps its significant trailing zeros (0.30); an exact one is shown as recorded (12.5, never 12.50)
  const f = formatNumber(shown, { unit, ...(unsupportedPrecision ? { fractionDigits: decimals } : { maxFractionDigits: decimals }), ...(a.locale === undefined ? {} : { locale: a.locale }) });
  return {
    ...f, canonical: String(value).trim(), shown, unsupportedPrecision,
    note: unsupportedPrecision ? `shown to ${sig} significant digit${sig === 1 ? '' : 's'} (${rule.why}); the exact value is ${String(value).trim()}` : null,
    rule: { key: rule.key, version: rule.version, significant: sig, why: rule.why },
  };
}

/* ═════════════════════════════ PROBABILITY (NUM-01) ═════════════════════════════ */
export type ProbabilityScale = 'percent' | 'unit';
export interface CalibrationFacts { state: 'calibrated' | 'uncalibrated' | 'unknown'; basis?: string | null; score?: { name: string; value: number } | null }
export interface ProbabilityInput {
  /** the value as the record holds it: 0–1 */ value: number | null;
  /** the DOMAIN CONTRACT's scale: 0–100 % or 0–1 — named by the caller, never guessed */ scale: ProbabilityScale;
  /** what the probability is OF (the event and its threshold) */ definition: string | null;
  calibration: CalibrationFacts;
  /** e.g. "30 days" — the horizon the probability is for */ horizon: string | null;
  horizonClass: HorizonClass;
  /** the last instant the inputs could include */ cutoff: string | null;
  /** the band or interval beside it, as words (e.g. "q10–q90 28–41 %") */ uncertainty: string | null;
  evidence: EvidenceClass;
}
export interface ProbabilityView { text: string; exact: string | null; lines: Array<{ term: string; value: string }>; unsupportedPrecision: boolean; problems: string[] }
/** NUM-01 — a probability on its contract's scale with its definition, calibration, horizon, cutoff and uncertainty; every gap stated. */
export function probabilityView(p: ProbabilityInput): ProbabilityView {
  const problems: string[] = [];
  const lines: Array<{ term: string; value: string }> = [];
  let text = 'unknown'; let exact: string | null = null; let unsupported = false;
  if (p.value === null || !Number.isFinite(p.value)) problems.push('no probability is recorded');
  else if (p.value < 0 || p.value > 1) problems.push(`the recorded value ${p.value} is not a probability (outside 0–1) — shown as recorded, not re-scaled`);
  if (p.value !== null && Number.isFinite(p.value)) {
    exact = String(p.value);
    if (p.value >= 0 && p.value <= 1) {
      const step = precisionFor({ measure: 'probability', horizon: p.horizonClass, evidence: p.calibration.state === 'calibrated' ? (p.evidence === 'uncalibrated_model' ? 'calibrated_model' : p.evidence) : (p.evidence === 'calibrated_model' ? 'uncalibrated_model' : p.evidence) }).percentStep;
      const pct = p.value * 100;
      const shownPct = Math.round(pct / step) * step;
      unsupported = Math.abs(shownPct - pct) > 1e-9;
      text = p.scale === 'percent' ? `${formatNumber(shownPct, { fractionDigits: 0 }).text} %` : formatNumber(shownPct / 100, { fractionDigits: step >= 1 ? 2 : 3 }).text;
      if (unsupported) lines.push({ term: 'Precision', value: `shown to the nearest ${step} %${p.scale === 'unit' ? ` (${formatNumber(step / 100, { fractionDigits: 2 }).text})` : ''} — the recorded value ${exact} carries more precision than the evidence supports` });
    } else text = exact;
  }
  lines.unshift({ term: 'Probability of', value: p.definition ?? 'not defined on this record — read the source before using the value' });
  if (p.definition === null) problems.push('the probability has no definition (what it is the probability of)');
  lines.push({ term: 'Calibration', value: p.calibration.state === 'calibrated' ? `calibrated${p.calibration.basis ? ` — ${p.calibration.basis}` : ''}${p.calibration.score ? ` (${p.calibration.score.name} ${p.calibration.score.value})` : ''}`
    : p.calibration.state === 'uncalibrated' ? `NOT calibrated${p.calibration.basis ? ` — ${p.calibration.basis}` : ''}: treat the value as a model's output, not a frequency` : 'calibration unknown — no calibration is recorded for this source' });
  lines.push({ term: 'Horizon', value: p.horizon ?? 'not stated' });
  lines.push({ term: 'Cutoff', value: p.cutoff ?? 'not stated — the data the value rests on has no recorded cutoff' });
  lines.push({ term: 'Uncertainty', value: p.uncertainty ?? 'not quantified on this record' });
  if (p.horizon === null) problems.push('the horizon is not stated');
  if (p.cutoff === null) problems.push('the cutoff is not stated');
  return { text, exact, lines, unsupportedPrecision: unsupported, problems };
}

/* ═════════════════════════════ CONFIDENCE (NUM-02) ═════════════════════════════ */
/** The named classes (a calibrated mapping names one; the words carry no certainty or authority word). */
export const CONFIDENCE_CLASSES = [
  { key: 'very_low', label: 'very low confidence', definition: 'the basis is thin or contested; expect this to change' },
  { key: 'low', label: 'low confidence', definition: 'some basis, with material gaps or disagreement' },
  { key: 'moderate', label: 'moderate confidence', definition: 'a reasonable basis with known gaps' },
  { key: 'high', label: 'high confidence', definition: 'a strong, corroborated basis; it may still be wrong' },
  { key: 'very_high', label: 'very high confidence', definition: 'a strong basis from several independent sources; it may still be wrong' },
] as const;
export type ConfidenceClassKey = (typeof CONFIDENCE_CLASSES)[number]['key'];
export interface ConfidenceInput {
  /** a named class the record or a CALIBRATED mapping states */ class?: ConfidenceClassKey | null;
  /** an interval with its level, e.g. [0.62, 0.78] at 0.8 */ interval?: { lower: number; upper: number; level: number; unit?: string | null } | null;
  /** a raw score the record carries (e.g. an extraction model's 0.91) */ score?: number | null;
  calibrated: boolean;
  /** what produced the score (the model, the method) */ source?: string | null;
}
export interface ConfidenceView { text: string; definition: string | null; calibrated: boolean; note: string; problems: string[] }
/** NUM-02 — a named class or an interval; NEVER a bare number, never authority. An uncalibrated score reads "confidence not calibrated". */
export function confidenceView(c: ConfidenceInput): ConfidenceView {
  const problems: string[] = [];
  const cls = c.class === undefined || c.class === null ? null : CONFIDENCE_CLASSES.find((x) => x.key === c.class) ?? null;
  const note = 'Confidence describes the basis of a statement — it is never authority to act and never a guarantee.';
  if (c.calibrated && cls !== null) return { text: cls.label, definition: cls.definition, calibrated: true, note, problems };
  if (c.calibrated && c.interval !== undefined && c.interval !== null) {
    const i = c.interval;
    if (!(i.level > 0 && i.level < 1)) problems.push('the interval states no level in (0, 1)');
    const u = i.unit ?? '';
    return { text: `${formatNumber(i.lower, { maxFractionDigits: 3 }).text}–${formatNumber(i.upper, { maxFractionDigits: 3 }).text}${u ? ` ${u}` : ''} (${Math.round(i.level * 100)} % interval)`, definition: null, calibrated: true, note, problems };
  }
  const score = c.score === undefined || c.score === null || !Number.isFinite(c.score) ? null : c.score;
  if (c.calibrated && cls === null) problems.push('a calibrated confidence names its class or its interval');
  const scoreWords = score === null ? '' : ` — the ${c.source ?? 'model'} reported a score of ${formatNumber(score, { maxFractionDigits: 4 }).text}, which is not a probability`;
  return { text: `confidence not calibrated${scoreWords}`, definition: null, calibrated: false, note, problems };
}

/* ═════════════════════════════ RANGE (NUM-03) ═════════════════════════════ */
export interface RangeInput {
  lower: number | null; upper: number | null; unit: string | null;
  basis: { kind: 'method' | 'confidence' | 'scenario'; text: string } | null;
  measure?: MeasureKind; horizon?: HorizonClass; evidence?: EvidenceClass;
}
export interface RangeView { text: string; basis: string; problems: string[]; unsupportedPrecision: boolean }
/** NUM-03 — lower to upper with the unit and the method / confidence / scenario basis; a missing bound or basis is stated. */
export function rangeView(r: RangeInput): RangeView {
  const problems: string[] = [];
  const a = { measure: r.measure ?? 'quantity', horizon: r.horizon ?? 'short', evidence: r.evidence ?? 'derived' } as const;
  const lo = preciseNumber(r.lower, a); const hi = preciseNumber(r.upper, a);
  if (r.lower === null || r.upper === null) problems.push('a range states both bounds');
  if (r.lower !== null && r.upper !== null && r.lower > r.upper) problems.push('the lower bound is above the upper bound — shown as recorded');
  if (r.unit === null || r.unit.trim() === '') problems.push('a range states its unit');
  if (r.basis === null) problems.push('a range states its method, confidence or scenario basis');
  const unit = r.unit === null || r.unit.trim() === '' ? '' : ` ${r.unit.trim()}`;
  return {
    text: `${r.lower === null ? 'unknown' : lo.text}–${r.upper === null ? 'unknown' : hi.text}${unit}`,
    basis: r.basis === null ? 'basis not stated' : `${r.basis.kind === 'method' ? 'method' : r.basis.kind === 'confidence' ? 'confidence' : 'scenario'}: ${r.basis.text}`,
    problems, unsupportedPrecision: lo.unsupportedPrecision || hi.unsupportedPrecision,
  };
}

/* ═════════════════════════════ ESTIMATE (NUM-11) ═════════════════════════════ */
export type RevisionState = 'initial' | 'revised' | 'final' | 'superseded' | 'unknown';
export interface EstimateInput {
  value: number | null; unit: string | null; mark: 'tilde' | 'label';
  basis: string | null; revision: { state: RevisionState; version?: number | null; at?: string | null };
  measure?: MeasureKind; horizon?: HorizonClass; evidence?: EvidenceClass;
}
export interface EstimateView { text: string; marker: string; basis: string; revision: string; problems: string[]; unsupportedPrecision: boolean }
/** NUM-11 — "~" or "Estimated" with the basis and the revision state; an estimate is never shown as a measurement. */
export function estimateView(e: EstimateInput): EstimateView {
  const problems: string[] = [];
  const n = preciseNumber(e.value, { measure: e.measure ?? 'quantity', horizon: e.horizon ?? 'short', evidence: e.evidence ?? 'uncalibrated_model', unit: e.unit });
  if (e.basis === null || e.basis.trim() === '') problems.push('an estimate states its basis');
  const unit = e.unit === null || e.unit.trim() === '' ? '' : ` ${e.unit.trim()}`;
  const num = e.value === null ? 'unknown' : n.text;
  const marker = e.mark === 'tilde' ? '~' : 'Estimated';
  const text = e.mark === 'tilde' ? `~${num}${unit}` : `Estimated ${num}${unit}`;
  const rev = e.revision;
  const revision = rev.state === 'unknown' ? 'revision state not recorded'
    : `${rev.state}${rev.version !== undefined && rev.version !== null ? ` (v${rev.version})` : ''}${rev.at ? ` at ${rev.at}` : ''}`;
  return { text, marker, basis: e.basis ?? 'basis not stated', revision, problems, unsupportedPrecision: n.unsupportedPrecision };
}

/* ═════════════════════════════ UNCERTAINTY (HX-03, CNT-09, REL-09) ═════════════════════════════ */
export const UNCERTAINTY_FORMS = ['interval', 'band', 'distribution', 'range', 'ordinal', 'not_quantified', 'abstained', 'partial'] as const;
export type UncertaintyForm = (typeof UNCERTAINTY_FORMS)[number];
/** The plain-language classes of a spread (relative width of the interval to its centre) — no certainty word among them. */
export const UNCERTAINTY_CLASSES = [
  { key: 'narrow', max: 0.1, words: 'narrow uncertainty' },
  { key: 'moderate', max: 0.3, words: 'moderate uncertainty' },
  { key: 'wide', max: 0.75, words: 'wide uncertainty' },
  { key: 'very_wide', max: Number.POSITIVE_INFINITY, words: 'very wide uncertainty' },
] as const;
/** CNT-09 — the plain-language class of an interval (relative half-width against the centre); null when it cannot be computed. */
export function uncertaintyWords(lower: number, upper: number): { key: string; words: string; relative: number } | null {
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper < lower) return null;
  const centre = (lower + upper) / 2;
  if (centre === 0) return null;
  const relative = (upper - lower) / 2 / Math.abs(centre);
  const c = UNCERTAINTY_CLASSES.find((x) => relative <= x.max)!;
  return { key: c.key, words: c.words, relative };
}
export interface UncertaintyInput {
  form: UncertaintyForm;
  /** the quantitative form in words (e.g. "q10–q90 0.282–0.406") — required unless not quantified / abstained */ magnitude?: string | null;
  /** the interval, to derive the plain-language class from */ interval?: { lower: number; upper: number; level?: number | null } | null;
  /** an ordinal class the record names (e.g. "high", "medium") */ ordinal?: string | null;
  drivers?: string[];
  calibration?: CalibrationFacts | null;
  /** values carrying more precision than their evidence supports */ unsupportedPrecision?: string[];
  alternatives?: string[];
  dissent?: string[];
  /** why it is not quantified, or why the source abstained / answered partly */ reason?: string | null;
}
export interface UncertaintyView { headline: string; lines: Array<{ term: string; value: string }>; problems: string[] }
/** HX-03 — form, magnitude or class, drivers, calibration, unsupported precision (and alternatives, dissent); partial or abstaining said. */
export function uncertaintyView(u: UncertaintyInput): UncertaintyView {
  const problems: string[] = []; const lines: Array<{ term: string; value: string }> = [];
  const cls = u.interval ? uncertaintyWords(u.interval.lower, u.interval.upper) : null;
  let headline: string;
  if (u.form === 'not_quantified') headline = `uncertainty not quantified${u.reason ? ` — ${u.reason}` : ''}`;
  else if (u.form === 'abstained') headline = `the source abstained${u.reason ? ` — ${u.reason}` : ''}: no value and no uncertainty are offered`;
  else if (u.form === 'partial') headline = `a partial answer${u.reason ? ` — ${u.reason}` : ''}: the uncertainty covers only what was answered`;
  else if (u.form === 'ordinal') headline = u.ordinal ? `${u.ordinal} uncertainty (an ordinal class)` : 'an ordinal uncertainty class not named';
  else headline = cls !== null ? `${cls.words} — ${u.magnitude ?? `${u.interval!.lower}–${u.interval!.upper}`}` : (u.magnitude ?? 'the magnitude is not stated');
  if ((u.form === 'not_quantified' || u.form === 'abstained' || u.form === 'partial') && (u.reason === undefined || u.reason === null || u.reason.trim() === '')) problems.push(`a ${u.form.replace('_', ' ')} uncertainty states its reason`);
  if (['interval', 'band', 'distribution', 'range'].includes(u.form) && (u.magnitude === undefined || u.magnitude === null) && (u.interval === undefined || u.interval === null)) problems.push('a quantified uncertainty states its magnitude');
  lines.push({ term: 'Form', value: u.form.replace('_', ' ') + (u.interval?.level ? ` (${Math.round(u.interval.level * 100)} % level)` : '') });
  if (u.magnitude) lines.push({ term: 'Magnitude', value: u.magnitude });
  if (cls !== null) lines.push({ term: 'In plain words', value: `${cls.words} (the interval spans ±${Math.round(cls.relative * 100)} % of its centre)` });
  lines.push({ term: 'Drivers', value: u.drivers && u.drivers.length > 0 ? u.drivers.join('; ') : 'no driver is recorded' });
  lines.push({ term: 'Calibration', value: u.calibration === undefined || u.calibration === null || u.calibration.state === 'unknown' ? 'calibration unknown'
    : u.calibration.state === 'calibrated' ? `calibrated${u.calibration.basis ? ` — ${u.calibration.basis}` : ''}` : `not calibrated${u.calibration.basis ? ` — ${u.calibration.basis}` : ''}` });
  if (u.unsupportedPrecision && u.unsupportedPrecision.length > 0) lines.push({ term: 'Unsupported precision', value: u.unsupportedPrecision.join('; ') });
  if (u.alternatives && u.alternatives.length > 0) lines.push({ term: 'Alternatives', value: u.alternatives.join('; ') });
  if (u.dissent && u.dissent.length > 0) lines.push({ term: 'Dissent', value: u.dissent.join('; ') });
  return { headline, lines, problems };
}

/** The horizon class of a horizon in days (null → observed). */
export function horizonClassOf(days: number | null): HorizonClass {
  if (days === null || !Number.isFinite(days) || days <= 0) return 'observed';
  if (days <= 7) return 'nowcast';
  if (days <= 90) return 'short';
  if (days <= 730) return 'medium';
  return 'long';
}
/** A horizon written as '30d' / '12w' / '6m' / '5y' in days (null when unreadable). */
export function horizonDays(h: string | null | undefined): number | null {
  const m = /^\s*(\d+)\s*([dwmy])\s*$/i.exec(h ?? '');
  if (m === null) return null;
  const n = Number(m[1]); const u = m[2]!.toLowerCase();
  return u === 'd' ? n : u === 'w' ? n * 7 : u === 'm' ? n * 30 : n * 365;
}
