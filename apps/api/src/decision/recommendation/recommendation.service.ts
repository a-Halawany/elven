/**
 * RECOMMENDATIONS — CP-6 B35 part `recommendation` (migration 0101 §R; F-P6-02: V0 C-005, V00-T-006/-010/-063/-065, L9-C06, AI-37-003, AI-51-003,
 * AI-64-001, AG-022, ADR-014, PR-38-001..006, CAP-DS-09/-10, AT-38, OBJ-33, FEX-15, WS-15, HX-08; F-P4-09's B35 piece; F-P5-06's B35 piece;
 * ES-37-008).
 *
 *   THE OBJECT       a recommendation on a version's option: what, for whom, by when; the assumptions; what could make it wrong (required);
 *                    the missing evidence; the FOUR SEPARATED components — value judgments, policy constraints, analytical assumptions,
 *                    model outputs — each item sourced. A named human or the Decision Agent records it (author kind from the principal).
 *   THE REVIEW       a named human who is not the author accepts it FOR CONSIDERATION, declines it or requests changes, with the comparison
 *                    (the package's other recommendations, AI and human, side by side) read at review. The Decision Agent never reviews.
 *   THE FLAGS        the option resting on a scenario that FAILS its quality evaluation (F-P4-09), or on a run whose last checkpoint reads
 *                    UNSTABLE or whose completion constraint check is VIOLATED / INDETERMINATE (F-P5-06): acceptance needs the reviewer's
 *                    stated override.
 *   THE HUMAN-LED    an incomplete version (FEX-15) proceeds human-led, without recommendation, once its owner attests the named gaps and a
 *   MODE             second human acknowledges; without it, a version CARRYING recommendations is not proposed while incomplete.
 *   This service validates what a route hands in, in plain words, and words the reads; the ports decide every rule.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';

type Row = Record<string, unknown>;

export const VERDICTS = ['accept_for_consideration', 'decline', 'request_changes'] as const;
export type Verdict = (typeof VERDICTS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTION_KEY = /^[a-z][a-z0-9_-]{0,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DIGEST = /^[0-9a-f]{64}$/;

const refuse = (correlationId: string, text: string, noun = 'recommendation'): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${noun} rejected ${text}`), 422); };
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

export function assertUuid(v: unknown, what: string, correlationId: string, noun = 'recommendation'): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `(${what}): a uuid is required`, noun);
  return v as string;
}
export function versionOf(v: unknown, correlationId: string, noun = 'recommendation'): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1) refuse(correlationId, '(version): the package version is a positive integer', noun);
  return n;
}
/** A real calendar day YYYY-MM-DD (the day it names; never shifted by a time zone). */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const list = (v: unknown, field: string, correlationId: string, min = 0): Row[] => {
  if (v === undefined || v === null) { if (min > 0) refuse(correlationId, `(${field}): at least ${min} item(s) are required`); return []; }
  if (!Array.isArray(v) || v.length > 20 || v.length < min || v.some((x) => !isObject(x))) refuse(correlationId, `(${field}): a list of ${min} to 20 objects`);
  return v as Row[];
};

export interface RecordCommand {
  optionKey: string; what: string; forWhom: string; byWhen: string;
  assumptions: Row[]; whatCouldMakeItWrong: Row[]; missingEvidence: Row[];
  valueJudgments: Row[]; policyConstraints: Row[]; analyticalAssumptions: Row[]; modelOutputs: Row[];
}
/** The recommendation's SHAPE: the option key, what (8–2000), for whom (2–512), by when (a day), the lists (at most 20 objects each; what could
 *  make it wrong at least one), the four components (lists of {statement, source: {kind, ref}}). The port validates the items and their sources. */
export function validateRecord(p: Row, correlationId: string): RecordCommand {
  if (typeof p['optionKey'] !== 'string' || !OPTION_KEY.test(p['optionKey'])) refuse(correlationId, '(option_key): names the version\'s option it recommends (its key)');
  if (!text(p['what'], 8, 2000)) refuse(correlationId, '(what): says what is recommended (8 to 2000 characters)');
  if (!text(p['forWhom'], 2, 512)) refuse(correlationId, '(for_whom): names for whom (2 to 512 characters)');
  if (!isDay(p['byWhen'])) refuse(correlationId, '(by_when): names the day it is to be acted on by (YYYY-MM-DD)');
  const c = isObject(p['components']) ? p['components'] : {};
  return {
    optionKey: p['optionKey'] as string, what: (p['what'] as string).trim(), forWhom: (p['forWhom'] as string).trim(), byWhen: p['byWhen'] as string,
    assumptions: list(p['assumptions'], 'assumptions', correlationId), whatCouldMakeItWrong: list(p['whatCouldMakeItWrong'], 'what_could_make_it_wrong', correlationId, 1),
    missingEvidence: list(p['missingEvidence'], 'missing_evidence', correlationId),
    valueJudgments: list(c['valueJudgments'], 'value_judgments', correlationId), policyConstraints: list(c['policyConstraints'], 'policy_constraints', correlationId),
    analyticalAssumptions: list(c['analyticalAssumptions'], 'analytical_assumptions', correlationId), modelOutputs: list(c['modelOutputs'], 'model_outputs', correlationId),
  };
}

export interface ReviewCommand { verdict: Verdict; rationale: string; override: string | null; expectedDigest: string | null }
export function validateReview(p: Row, correlationId: string): ReviewCommand {
  if (typeof p['verdict'] !== 'string' || !(VERDICTS as readonly string[]).includes(p['verdict'])) refuse(correlationId, '(verdict): a review accepts for consideration, declines or requests changes');
  if (!text(p['rationale'], 8, 4000)) refuse(correlationId, '(rationale): a review states its rationale (8 to 4000 characters)');
  const o = p['override'];
  if (o !== undefined && o !== null && o !== '' && !text(o, 16, 2000)) refuse(correlationId, '(override): an override states why the flags do not stand against consideration (16 to 2000 characters)');
  const d = p['expectedDigest'];
  if (d !== undefined && d !== null && (typeof d !== 'string' || !DIGEST.test(d))) refuse(correlationId, '(expected_digest): the digest read is 64 hex characters');
  return { verdict: p['verdict'] as Verdict, rationale: (p['rationale'] as string).trim(), override: typeof o === 'string' && o.trim() !== '' ? o.trim() : null,
           expectedDigest: typeof d === 'string' ? d : null };
}

export function validateReason(p: Row, correlationId: string, min = 8, noun = 'recommendation'): string {
  if (!text(p['reason'], min, 2000)) refuse(correlationId, `(reason): states its reason (${min} to 2000 characters)`, noun);
  return (p['reason'] as string).trim();
}

export interface AttestCommand { missing: Row[]; reason: string }
/** The attestation's SHAPE: the named missing items [{key, category?, note?}] (1–100), the reason (16–2000). The port judges coverage. */
export function validateAttest(p: Row, correlationId: string): AttestCommand {
  const m = p['missing'];
  if (!Array.isArray(m) || m.length < 1 || m.length > 100 || m.some((x) => !isObject(x) || typeof x['key'] !== 'string' || x['key'].length === 0)) {
    refuse(correlationId, '(missing): the attestation names the missing items [{key, category, note}]', 'incomplete package');
  }
  return { missing: (m as Row[]).map((x) => ({ key: x['key'], category: typeof x['category'] === 'string' ? x['category'] : null, note: typeof x['note'] === 'string' ? x['note'] : null })),
           reason: validateReason(p, correlationId, 16, 'incomplete package') };
}

/* ───────────── the proposal gate (FEX-15; package.service propose's B35 block consults it) ───────────── */
export interface ProposalGate { refuse: string | null; humanLed: Row | null }
/** A version CARRYING live recommendations that fails the completeness is refused unless an acknowledged attestation names every gap
 *  (human-led); a version without recommendations meets nothing new. null completeness (not visible) → nothing new either. */
export function proposalGate(c: Row | null, version: number): ProposalGate {
  if (c === null) return { refuse: null, humanLed: null };
  const gaps = Array.isArray(c['gaps']) ? (c['gaps'] as Row[]) : [];
  const live = Number(c['live_recommendations'] ?? 0);
  const att = isObject(c['attestation']) ? c['attestation'] : null;
  if (c['mode'] === 'human_led' && att !== null) {
    return { refuse: null, humanLed: { attestation_id: att['attestation_id'], acknowledged_by: att['acknowledged_by'], gaps: gaps.map((g) => g['key']), label: c['label'] } };
  }
  if (live === 0 || c['complete'] === true) return { refuse: null, humanLed: null };
  const uncovered = Array.isArray(c['uncovered']) ? (c['uncovered'] as Row[]) : gaps;
  return {
    refuse: `incomplete package rejected (unattested): version ${version} carries ${live} live recommendation(s) and is incomplete — ${uncovered.map((g) => `${String(g['category'])}: ${String(g['detail'])}`).join('; ')}; `
      + (att !== null && att['state'] === 'attested' ? `attestation ${String(att['attestation_id'])} awaits a second human's acknowledgement` : 'complete the package, or its owner attests the human-led mode and a second human acknowledges it'),
    humanLed: null,
  };
}

/* ───────────── the words ───────────── */
export function flagLine(flags: Row[]): string {
  if (flags.length === 0) return 'no flag stands';
  return flags.map((f) => (f['class'] === 'scenario_quality' ? 'SCENARIO QUALITY FAILED' : `INDICATOR ${String(f['indicator'] ?? '').replace(/_/g, ' ').toUpperCase()}`)).join(', ');
}
export function coverageLine(c: Row | null): string {
  if (c === null || c['share'] === null || c['share'] === undefined) return String(c?.['label'] ?? 'DECISION COVERAGE not applicable');
  return String(c['label']);
}
