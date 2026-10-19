/**
 * B50 §HD (F-P3-01; ES-26-001 / ES-26-004) — THE TIME VALUE: a material time stated with its zone, precision, source and
 * uncertainty, and the kinds of time that are NOT an instant (unknown, approximate, bounded, recurring, conflicting) stated as such —
 * never forced into a false instant.
 *
 * The 43-field canonical header is NOT widened (DESIGN D2): its four axes stay instants and `time_precision` stays one word, now from
 * the governed vocabulary below (the canonical CHECK, `objects.assert_header_semantics` and HEADER_SCHEMA agree). The full statement of
 * a time — its bounds, zone, source, rule or conflicts — lives in the side ledger `objects.time_qualifiers`, keyed by (object_id,
 * version, axis) and written by `objects.admit_version` in the admission's own transaction. A header instant derived from a TimeValue
 * is the value's lower bound (bounded), its centre (approximate) or its instant (exact); a TimeValue of kind unknown / recurring /
 * conflicting places NO instant on the header axis (null) — the qualifier says why.
 *
 * Pure: types, the vocabulary and validation only. Shared by the API (the builder, the upload intake) and readable by the web.
 */

/** The governed time_precision vocabulary, coarsest last. `approximate` is kept: the Phase 0 header schema admitted it. */
export const HEADER_TIME_PRECISIONS = [
  'exact', 'second', 'minute', 'hour', 'day', 'part_of_month', 'month', 'quarter', 'year', 'approximate', 'unknown',
] as const;
export type HeaderTimePrecision = (typeof HEADER_TIME_PRECISIONS)[number];

export const TIME_VALUE_KINDS = ['exact', 'bounded', 'approximate', 'unknown', 'recurring', 'conflicting'] as const;
export type TimeValueKind = (typeof TIME_VALUE_KINDS)[number];

/** The header axes a time value may qualify (record time is the committing component's and is always exact). */
export const TIME_AXES = ['event', 'observation', 'valid_from', 'valid_to', 'recorded', 'document'] as const;
export type TimeAxis = (typeof TIME_AXES)[number];

export interface TimeValue {
  kind: TimeValueKind;
  /** exact: the instant; approximate: the centre. ISO 8601 with an offset. */
  instant?: string | null;
  /** bounded: the half-open interval [earliest, latest); approximate: the tolerance it is known within, when stated. */
  earliest?: string | null;
  latest?: string | null;
  precision: HeaderTimePrecision;
  /** The IANA zone the value was STATED in (e.g. Europe/Berlin); null when the source did not state one. */
  zone: string | null;
  /** Who stated it: 'publisher text', 'operator', 'source clock', 'derived from header' … */
  source: string;
  /** recurring: the rule (RFC 5545 RRULE). */
  rule?: string | null;
  /** conflicting: the sources that disagree, each with the value it states. */
  conflicts?: Array<{ ref: string; value: string }>;
  clockQuality?: 'trusted' | 'degraded' | 'unknown';
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const ZONE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$|^UTC$/;
const isIso = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v));

/** Validates a TimeValue's SHAPE and its kind's own rules; returns the problems (empty = valid). */
export function timeValueProblems(v: unknown): string[] {
  const p: string[] = [];
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return ['a time value is an object'];
  const t = v as Record<string, unknown>;
  const allowed = new Set(['kind', 'instant', 'earliest', 'latest', 'precision', 'zone', 'source', 'rule', 'conflicts', 'clockQuality']);
  for (const k of Object.keys(t)) if (!allowed.has(k)) p.push(`unknown field ${k}`);
  if (!(TIME_VALUE_KINDS as readonly string[]).includes(String(t['kind']))) p.push(`kind must be one of ${TIME_VALUE_KINDS.join(', ')}`);
  if (!(HEADER_TIME_PRECISIONS as readonly string[]).includes(String(t['precision']))) p.push(`precision must be one of ${HEADER_TIME_PRECISIONS.join(', ')}`);
  if (t['zone'] !== null && t['zone'] !== undefined && (typeof t['zone'] !== 'string' || !ZONE.test(t['zone']))) p.push('zone is an IANA zone name or null');
  if (typeof t['source'] !== 'string' || t['source'].trim().length < 2 || t['source'].length > 200) p.push('source names who stated the time (2–200 characters)');
  if (t['clockQuality'] !== undefined && !['trusted', 'degraded', 'unknown'].includes(String(t['clockQuality']))) p.push('clockQuality is trusted, degraded or unknown');
  for (const k of ['instant', 'earliest', 'latest'] as const) {
    if (t[k] !== undefined && t[k] !== null && !isIso(t[k])) p.push(`${k} is an ISO 8601 instant with an offset`);
  }
  switch (t['kind']) {
    case 'exact':
      if (!isIso(t['instant'])) p.push('an exact time names its instant');
      if (t['earliest'] != null || t['latest'] != null) p.push('an exact time has no bounds');
      break;
    case 'bounded':
      if (!isIso(t['earliest']) || !isIso(t['latest'])) p.push('a bounded time names earliest and latest');
      else if (Date.parse(t['latest'] as string) <= Date.parse(t['earliest'] as string)) p.push('a bounded time\'s latest is after its earliest');
      if (t['instant'] != null) p.push('a bounded time names no single instant');
      if (t['precision'] === 'exact') p.push('a bounded time is not of exact precision');
      break;
    case 'approximate':
      if (!isIso(t['instant'])) p.push('an approximate time names its centre instant');
      if (t['precision'] === 'exact') p.push('an approximate time is not of exact precision');
      break;
    case 'unknown':
      if (t['instant'] != null || t['earliest'] != null || t['latest'] != null) p.push('an unknown time names no instant or bounds');
      if (t['precision'] !== 'unknown') p.push('an unknown time has precision unknown');
      break;
    case 'recurring':
      if (typeof t['rule'] !== 'string' || !/^(RRULE:)?FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Za-z0-9,+-]+)*$/.test(t['rule'])) p.push('a recurring time names its RRULE (FREQ=…)');
      break;
    case 'conflicting': {
      const c = t['conflicts'];
      if (!Array.isArray(c) || c.length < 2) p.push('a conflicting time names at least two disagreeing sources');
      else for (const x of c) {
        if (x === null || typeof x !== 'object' || typeof (x as Record<string, unknown>)['ref'] !== 'string' || typeof (x as Record<string, unknown>)['value'] !== 'string') {
          p.push('each conflict names its ref and the value it states'); break;
        }
      }
      if (t['instant'] != null) p.push('a conflicting time names no single instant');
      break;
    }
    default: break;
  }
  if (t['kind'] !== 'recurring' && t['rule'] != null) p.push('only a recurring time names a rule');
  if (t['kind'] !== 'conflicting' && t['conflicts'] !== undefined) p.push('only a conflicting time names conflicts');
  return p;
}

export function isTimeValue(v: unknown): v is TimeValue { return timeValueProblems(v).length === 0; }

/**
 * The header instant a time value places on its axis (normalised to UTC ISO), and the precision word: never a false instant — an
 * unknown, recurring or conflicting time places none.
 */
export function headerInstantOf(v: TimeValue): { instant: string | null; precision: HeaderTimePrecision } {
  const utc = (s: string) => new Date(s).toISOString();
  switch (v.kind) {
    case 'exact': return { instant: utc(v.instant as string), precision: v.precision };
    case 'approximate': return { instant: utc(v.instant as string), precision: v.precision };
    case 'bounded': return { instant: utc(v.earliest as string), precision: v.precision };
    default: return { instant: null, precision: v.kind === 'unknown' ? 'unknown' : v.precision };
  }
}
