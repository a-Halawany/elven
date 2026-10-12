/**
 * B92 §UX — THE PURE PIECES of the experience-quality workflow: the vocabulary (mirrors of 0113_b92_x_ux §UX.1 — the ports are the rule, these
 * only let a route refuse a malformed request in the server's words before any port runs) and the request readers. Nothing here decides a
 * privacy, consent, approval or measurement rule: the ports do, and re-check everything.
 */
import { PERIOD_RE, PERSON_DIMENSIONS, refuseAnalytics, type AnalyticsNoun } from '../seams.js';

type Row = Record<string, unknown>;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const KEY = /^[a-z][a-z0-9_.-]{2,62}$/;
export const STEP = /^[a-z][a-z0-9_]{1,40}$/;

/** analytics.aux_outcomes() */
export const OUTCOMES = ['started', 'success', 'failure', 'error', 'recovered', 'abandoned', 'cancelled'] as const;
/** analytics.aux_measures() — experience measures; an engagement proxy never is one. */
export const MEASURES = ['task_success_rate', 'step_p50_ms', 'error_recovery_rate'] as const;
/** analytics.aux_variant_kinds() — approved design alternatives only (D13). */
export const VARIANT_KINDS = ['layout', 'wording', 'ordering', 'default_visibility'] as const;
/** analytics.aux_action_kinds() (D14). */
export const ACTION_KINDS = ['backlog_item', 'design_change_proposal', 'research_request', 'hold_collection', 'retire_measure'] as const;
export const SEGMENT_DIMENSIONS = ['role', 'device_class', 'locale'] as const;
export const DEVICE_CLASSES = ['desktop', 'tablet', 'mobile'] as const;
export const FIELD_TYPES = ['enum', 'int', 'duration_ms', 'bool'] as const;
export const ORIGIN_KINDS = ['baseline', 'threshold', 'experiment', 'result'] as const;
export const BOUNDARY_UX = 'experience quality (B92 §UX): software capability; the harness and the demo are SYNTHETIC; the signed acceptance with named authorities (UX-70-006) → R2 / B107; accessibility conformance → B107/H3.';

export const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
export const optStr = (p: Row, k: string): string | null => (typeof p[k] === 'string' && String(p[k]).trim() !== '' ? String(p[k]).trim() : null);

/** A required id (a uuid), refused in the class form otherwise. */
export function needId(v: unknown, what: string, noun: AnalyticsNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseAnalytics(noun, 'request', `${what} is an id`, cid);
  return v;
}
export function optId(v: unknown, what: string, noun: AnalyticsNoun, cid: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  return needId(v, what, noun, cid);
}
/** A reason of 8+ characters (every human decision states one). */
export function needReason(p: Row, noun: AnalyticsNoun, cid: string, k = 'reason'): string {
  const r = str(p, k);
  if (r.length < 8) throw refuseAnalytics(noun, 'reason', `a ${k} of at least 8 characters is stated`, cid);
  return r;
}
export function needKey(p: Row, k: string, noun: AnalyticsNoun, cid: string, re: RegExp = KEY): string {
  const v = str(p, k);
  if (!re.test(v)) throw refuseAnalytics(noun, 'request', `payload.${k} matches ${String(re)}`, cid);
  return v;
}
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], what: string, noun: AnalyticsNoun, cid: string, cls = 'request'): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw refuseAnalytics(noun, cls, `${what} is one of ${allowed.join(', ')}`, cid);
  return v as T;
}
export function obj(v: unknown, what: string, noun: AnalyticsNoun, cid: string, allowMissing = true): Row {
  if ((v === undefined || v === null) && allowMissing) return {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw refuseAnalytics(noun, 'request', `${what} is an object`, cid);
  return v as Row;
}
export function optInt(v: unknown, what: string, noun: AnalyticsNoun, cid: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw refuseAnalytics(noun, 'request', `${what} is an integer`, cid);
  return v;
}
export function period(p: Row, noun: AnalyticsNoun, cid: string): string {
  const v = str(p, 'period');
  if (!PERIOD_RE.test(v)) throw refuseAnalytics(noun, 'period', 'payload.period is 2026-Q3, 2026-09 or R90@2026-10-12', cid);
  return v;
}

/**
 * The minimisation a route can see before the port: a field name that names a person is refused 403 (person) — the same words the port
 * would use for a segment; every other rule of the whitelist (content, identifiers, types, bounds) is the port's `(minimisation)` answer.
 */
export function personFields(fields: Row): string[] {
  return Object.keys(fields).filter((k) => (PERSON_DIMENSIONS as readonly string[]).includes(k));
}

/**
 * Telemetry fields as the CLIENT may send them: flat, scalar values only (an object, an array or a long string never travels — it could carry
 * content). Returns the problems in words that name no value.
 */
export function eventFieldProblems(fields: Row): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && typeof v === 'object') out.push(`the field ${k} is not a scalar`);
    else if (typeof v === 'string' && v.length > 40) out.push(`the field ${k} is longer than a code`);
  }
  return out;
}

/** A variant list's SHAPE (the port decides the kinds, the descriptions' manipulation check and the control). */
export function variantShapeOk(v: unknown): v is Array<{ key: string; kind: string; description: string }> {
  return Array.isArray(v) && v.length >= 2 && v.length <= 4 && v.every((x) => typeof x === 'object' && x !== null && !Array.isArray(x)
    && typeof (x as Row)['key'] === 'string' && typeof (x as Row)['kind'] === 'string' && typeof (x as Row)['description'] === 'string');
}
