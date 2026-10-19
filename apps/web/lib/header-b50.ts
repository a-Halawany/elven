/**
 * B50 §HD (F-P3-01: ES-05-001, V03-T-051, ES-26-001/-004) — THE HEADER ADAPTER: what a canonical version's header carries, in words, for
 * B81's ObjectHeader (components/object.tsx; lib/object-b81.ts's ObjectHeaderInput — its `trust` and `time` inputs). Pure functions only
 * (the component contract, unit-tested in header-b50.test.ts):
 *   - a VALUE is shown as the value;
 *   - a DECLARED ABSENCE ({state, reason}) is shown in words — "Not assessed — <reason>", never a blank and never "unresolved";
 *   - a field of a version RECORDED BEFORE B50 (no side-ledger row: the server's header read says so) reads "recorded before B50 — not
 *     populated" — nothing is back-filled, nothing is inferred;
 *   - a TIME VALUE is stated with its kind, bounds, precision, the zone it was stated in and who stated it; a DATE renders as the day it
 *     names (in the zone it was stated in); an unknown, recurring or conflicting time is said so — never forced to an instant.
 * Presentation never changes meaning: the words are the record's; the adapter decides nothing the server did not state.
 */
import type { AbsenceState, DeclaredAbsence, HeaderFieldValue, TimeValue } from './b50-seams';

export const PRE_B50 = 'recorded before B50 — not populated';

const ABSENCE_WORDS: Record<AbsenceState, string> = { not_assessed: 'Not assessed', not_applicable: 'Not applicable', unknown: 'Unknown' };

/** A stored jsonb header value that is a declared absence. */
export function asAbsence(v: unknown): DeclaredAbsence | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const s = o['state'];
  if ((s === 'not_assessed' || s === 'not_applicable' || s === 'unknown') && typeof o['reason'] === 'string' && o['reason'].trim().length > 0) return { state: s, reason: o['reason'].trim() };
  return null;
}

/**
 * One header field of one version: its value, its declared absence, or "recorded before B50". `stated` is the server's own reading of the
 * version (the header read's `header: 'stated' | 'recorded before B50 — not populated'`); a version the server has not described is
 * treated as recorded before B50 only for the fields B50 states — any other field with no value is the plain value null.
 */
export const B50_FIELDS = ['confidence', 'uncertainty', 'quality_state', 'freshness_state', 'ontology_ref', 'quality_profile', 'provenance_ref'] as const;
export function headerField(row: Record<string, unknown>, field: string, stated: boolean): HeaderFieldValue {
  const v = row[field];
  const a = asAbsence(v);
  if (a !== null) return { kind: 'absent', absence: a };
  if ((v === null || v === undefined) && (B50_FIELDS as readonly string[]).includes(field) && !stated) return { kind: 'pre_b50' };
  if (typeof v === 'string' && v.startsWith('none:')) return { kind: 'absent', absence: { state: 'not_applicable', reason: v.slice(5).trim() } };
  if (field === 'ontology_ref' && v === 'ontology:none') return { kind: 'absent', absence: { state: 'not_assessed', reason: 'no ontology version is bound to this version yet (B51 binds the domain\'s active ontology)' } };
  return { kind: 'value', value: v ?? null };
}

/** A value shown in words (objects as their own key: value pairs; never a raw JSON blob). */
export function valueText(v: unknown): string {
  if (v === null || v === undefined) return 'none recorded';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length === 0 ? 'none' : v.map(valueText).join(', ');
  return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k.replace(/_/g, ' ')}: ${typeof x === 'object' && x !== null ? valueText(x) : String(x)}`).join('; ');
}

export function fieldText(f: HeaderFieldValue): string {
  if (f.kind === 'pre_b50') return PRE_B50;
  if (f.kind === 'absent') return `${ABSENCE_WORDS[f.absence.state]} — ${f.absence.reason}`;
  return valueText(f.value);
}

/** ObjectHeaderInput.trust: confidence, uncertainty, quality and freshness, each stated (ES-05-001 — never blank). */
export function trustText(row: Record<string, unknown>, stated: boolean): string {
  const part = (label: string, field: string) => `${label}: ${fieldText(headerField(row, field, stated))}`;
  return [part('Confidence', 'confidence'), part('Uncertainty', 'uncertainty'), part('Quality', 'quality_state'), part('Freshness', 'freshness_state')].join(' · ');
}

/* ───────────────────────────── TIME ───────────────────────────── */

const PRECISION_WORDS: Record<string, string> = {
  exact: 'exact', second: 'to the second', minute: 'to the minute', hour: 'to the hour', day: 'to the day', part_of_month: 'part of a month',
  month: 'to the month', quarter: 'to the quarter', year: 'to the year', approximate: 'approximate', unknown: 'unknown',
};

/** The day an instant names IN A ZONE (the zone the value was stated in, else UTC): "21 Aug 2026". */
export function dayIn(instant: string, zone: string | null, locale = 'en-GB'): string {
  const t = Date.parse(instant);
  if (!Number.isFinite(t)) return instant;
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: zone ?? 'UTC' }).format(new Date(t));
}
function instantIn(instant: string, zone: string | null, locale = 'en-GB'): string {
  const t = Date.parse(instant);
  if (!Number.isFinite(t)) return instant;
  const s = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: zone ?? 'UTC' }).format(new Date(t));
  return `${s} ${zone ?? 'UTC'}`;
}
/** The last day a half-open bound [earliest, latest) covers: the day before `latest` in the stated zone. */
function lastDayIn(latest: string, zone: string | null): string {
  return dayIn(new Date(Date.parse(latest) - 1).toISOString(), zone);
}
const coarse = (p: string) => !['exact', 'second', 'minute', 'hour'].includes(p);

/** A TIME VALUE in words: its kind, its bounds as the days they name, its precision, the zone it was stated in, and who stated it. */
export function timeValueText(v: TimeValue): string {
  const zone = v.zone; const by = `stated by ${v.source}`;
  const where = zone === null ? 'no zone stated' : zone;
  const prec = PRECISION_WORDS[v.precision] ?? v.precision;
  const clock = v.clockQuality !== undefined && v.clockQuality !== 'trusted' ? `; source clock ${v.clockQuality}` : '';
  switch (v.kind) {
    case 'exact':
      return `${coarse(v.precision) ? dayIn(String(v.instant), zone) : instantIn(String(v.instant), zone)} (exact; ${where}; ${by}${clock})`;
    case 'approximate':
      return `about ${coarse(v.precision) ? dayIn(String(v.instant), zone) : instantIn(String(v.instant), zone)} (approximate, ${prec}; ${where}; ${by}${clock})`;
    case 'bounded':
      return `between ${dayIn(String(v.earliest), zone)} and ${lastDayIn(String(v.latest), zone)} (bounded, ${prec}; ${where}; ${by}${clock})`;
    case 'unknown':
      return `unknown — no time is stated, and none is assumed (${by})`;
    case 'recurring':
      return `recurring: ${String(v.rule ?? '').replace(/^RRULE:/, '')} (${where}; ${by})`;
    case 'conflicting':
      return `conflicting — ${(v.conflicts ?? []).map((c) => `${c.ref} states ${c.value}`).join('; ')} (no single time is assumed; ${by})`;
    default:
      return 'an unrecognised time value — not shown as a time';
  }
}

/** A qualifier row as the header read serves it (camelCase), back to a TimeValue. */
export interface QualifierRow {
  axis: string; kind: TimeValue['kind']; instant: string | null; earliest: string | null; latest: string | null; precision: TimeValue['precision'];
  zone: string | null; source: string; rule: string | null; conflicts: Array<{ ref: string; value: string }> | null; clockQuality: 'trusted' | 'degraded' | 'unknown'; declared: boolean;
}
export function qualifierValue(q: QualifierRow): TimeValue {
  const iso = (s: string | null) => (s === null ? null : new Date(s).toISOString());
  return { kind: q.kind, instant: iso(q.instant), earliest: iso(q.earliest), latest: iso(q.latest), precision: q.precision, zone: q.zone, source: q.source,
           rule: q.rule, ...(q.conflicts === null ? {} : { conflicts: q.conflicts }), clockQuality: q.clockQuality };
}

const AXIS_LABEL: Record<string, string> = { event: 'Event time', observation: 'Observation time', valid_from: 'Valid from', valid_to: 'Valid to', recorded: 'Record time', document: 'Document time' };
const AXIS_FIELD: Record<string, string> = { event: 'event_time', observation: 'observation_time', valid_from: 'valid_from', valid_to: 'valid_to', recorded: 'recorded_at' };

/**
 * ObjectHeaderInput.time: one row per axis. A version stated after B50 shows each axis from its qualifier (declared or derived — said
 * which); a version recorded before B50 shows the header instant with its precision word and says the qualifiers are not populated.
 */
export function headerTime(row: Record<string, unknown>, qualifiers: QualifierRow[] | null): Array<{ label: string; value: string | null }> {
  const out: Array<{ label: string; value: string | null }> = [];
  for (const axis of ['event', 'observation', 'valid_from', 'valid_to', 'recorded', 'document']) {
    const q = qualifiers?.find((x) => x.axis === axis) ?? null;
    if (q !== null) { out.push({ label: AXIS_LABEL[axis] as string, value: `${timeValueText(qualifierValue(q))}${q.declared ? '' : ' — derived from the header'}` }); continue; }
    const f = AXIS_FIELD[axis]; if (f === undefined) continue;
    const v = row[f];
    if (v === null || v === undefined) {
      if (axis === 'event' || axis === 'valid_from') out.push({ label: AXIS_LABEL[axis] as string, value: qualifiers === null ? `none recorded (${PRE_B50})` : 'none stated' });
      continue;
    }
    const at = v instanceof Date ? v.toISOString() : String(v);
    const p = axis === 'recorded' || axis === 'observation' ? 'exact' : String(row['time_precision'] ?? 'exact');
    out.push({ label: AXIS_LABEL[axis] as string, value: `${coarse(p) ? dayIn(at, null) : instantIn(at, null)} (${PRECISION_WORDS[p] ?? p}${qualifiers === null ? `; ${PRE_B50}` : ''})` });
  }
  return out;
}

/** The header read of one version (the API's POST …/objects/:id/header) → the adapter's inputs for B81's ObjectHeader. */
export interface HeaderReadVersion { version: number; header: string; time: QualifierRow[] }
export function adaptHeader(row: Record<string, unknown>, read: HeaderReadVersion | null): { trust: string; time: Array<{ label: string; value: string | null }>; stated: boolean } {
  const stated = read !== null && read.header === 'stated';
  return { trust: trustText(row, stated), time: headerTime(row, stated ? read.time : null), stated };
}
