/**
 * CP-6 B50 §TL (0120_b50_x_tl) — THE TIMELINE, THE AS-OF EXPLORER AND THE SOURCE-TO-PRODUCT TRACE (F-P3-04): the routes' intake (what the
 * database cannot be handed without it — the fields present and typed) and the answers mapped onto the seams (TimelineItem,
 * TimelineDisclosure, TraceNode — b50-seams.ts). Everything an answer says is the port's: nothing here places an item, computes a clock
 * flag, drops a disclosure or decides that a trace is complete. The extra fields the database states beyond the seam (the ledgers, the
 * as-of reads, the per-reason counts, the continuity) are carried through unchanged.
 *
 * THREE CLAIMS: construction (this module and phase6-timeline-b50, its fixtures SYNTHETIC); demonstrated operation (the act — SYNTHETIC);
 * real acceptance (PR-22-006 / AT-22: B111's recording path, then R2) — never claimed here.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { TimelineAxis, TimelineDisclosure, TimelineItem, TimeValue, TraceNode } from '../../objects/b50-seams.js';
import { toExplainNode } from '../provenance/provenance.service.js';

type Row = Record<string, unknown>;
const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE_RE = /^[A-Z]{3}$/;
const SCOPE_RE = /^[a-z][a-z0-9_.-]{2,62}$/;
export const TIMELINE_AXES: readonly TimelineAxis[] = ['event', 'observation', 'valid', 'record'];
const CLOCKS: ReadonlyArray<TimelineItem['clock']> = ['trusted', 'degraded', 'unknown', 'observation_after_record', 'conflict'];
const STAGES: ReadonlyArray<TraceNode['stage']> = ['source', 'evidence', 'claim', 'product', 'decision'];

/* ── INTAKE ── */
export interface TimelineIntake { subjectType: string | null; subjectId: string | null; scopeKey: string | null; from: string; to: string; axis: TimelineAxis; asOf: string | null; limit: number }
const instant = (p: Row, key: string, correlationId: string, required: boolean): string | null => {
  const v = p[key];
  if (v === undefined || v === null || v === '') { if (required) bad(correlationId, `${key} is an instant (ISO 8601, e.g. 2024-01-14T00:00:00Z)`); return null; }
  if (typeof v !== 'string' || Number.isNaN(new Date(v).getTime()) || !/^\d{4}-\d{2}-\d{2}/.test(v)) bad(correlationId, `${key} is an instant (ISO 8601, e.g. 2024-01-14T00:00:00Z)`);
  return v as string;
};
export function timelineIntake(p: Row, correlationId: string): TimelineIntake {
  const subjectType = p['subjectType'] === undefined || p['subjectType'] === null || p['subjectType'] === '' ? null : p['subjectType'];
  const subjectId = p['subjectId'] === undefined || p['subjectId'] === null || p['subjectId'] === '' ? null : p['subjectId'];
  const scopeKey = p['scopeKey'] === undefined || p['scopeKey'] === null || p['scopeKey'] === '' ? null : p['scopeKey'];
  if (subjectType !== null && (typeof subjectType !== 'string' || !TYPE_RE.test(subjectType))) bad(correlationId, 'subjectType is the object type (three capitals, e.g. CLM, WRN, DPK)');
  if (subjectId !== null && (typeof subjectId !== 'string' || !UUID_RE.test(subjectId))) bad(correlationId, 'subjectId is the object id (a uuid)');
  if (scopeKey !== null && (typeof scopeKey !== 'string' || !SCOPE_RE.test(scopeKey))) bad(correlationId, 'scopeKey is the key of an approved governed scope');
  const axis = p['axis'] ?? 'record';
  if (typeof axis !== 'string' || !(TIMELINE_AXES as readonly string[]).includes(axis)) bad(correlationId, `axis is one of ${TIMELINE_AXES.join(', ')}`);
  const limit = p['limit'] === undefined || p['limit'] === null ? 200 : p['limit'];
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit)) bad(correlationId, 'limit, when given, is an integer (1 to 1000)');
  return {
    subjectType: subjectType as string | null, subjectId: subjectId === null ? null : (subjectId as string).toLowerCase(), scopeKey: scopeKey as string | null,
    from: instant(p, 'from', correlationId, true) as string, to: instant(p, 'to', correlationId, true) as string, axis: axis as TimelineAxis,
    asOf: instant(p, 'asOf', correlationId, false), limit: limit as number,
  };
}
export function traceIntake(p: Row, correlationId: string): { type: string; id: string; version: number } {
  const type = p['type']; const id = p['id']; const version = p['version'];
  if (typeof type !== 'string' || !TYPE_RE.test(type)) bad(correlationId, 'type is the object type (three capitals, e.g. CLM, FCT, BRF)');
  if (typeof id !== 'string' || !UUID_RE.test(id)) bad(correlationId, 'id is the object id (a uuid)');
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) bad(correlationId, 'version is the object version (an integer of 1 or more)');
  return { type: type as string, id: (id as string).toLowerCase(), version: version as number };
}
export function noteIntake(p: Row, correlationId: string): string {
  const v = p['note'];
  if (typeof v !== 'string' || v.trim().length < 8 || v.length > 2000) bad(correlationId, 'note says what the owner should reconcile (8 to 2000 characters)');
  return (v as string).trim();
}

/* ── THE ANSWERS onto the seams ── */
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
type AxisTime = TimeValue & { axis: string; declared: boolean };
function timeValues(q: unknown): AxisTime[] | null {
  if (!Array.isArray(q)) return null;
  return (q as Row[]).map((x) => ({
    kind: String(x['kind']) as TimeValue['kind'], instant: str(x['instant']), earliest: str(x['earliest']), latest: str(x['latest']),
    precision: String(x['precision']) as TimeValue['precision'], zone: str(x['zone']), source: String(x['source'] ?? ''), rule: str(x['rule']),
    ...(Array.isArray(x['conflicts']) ? { conflicts: x['conflicts'] as Array<{ ref: string; value: string }> } : {}),
    clockQuality: String(x['clock_quality'] ?? 'unknown') as NonNullable<TimeValue['clockQuality']>,
    axis: String(x['axis']), declared: x['declared'] === true,
  } as AxisTime));
}
export type TimelineItemView = TimelineItem & {
  objectId: string; version: number; headerOnly: boolean; axisStart: string | null; axisEnd: string | null; times: Array<TimeValue & { axis: string; declared: boolean }> | null;
  timeStated: boolean; clockFlags: string[]; clockDetail: Row[]; lifecycle: string; truthState: string; synthetic: boolean; classification: string; owner: string;
  digest: string; believedAtAsOf: boolean; correctedLater: (TimelineItem['correctedLater'] & { version: number; lifecycle: string; knownAtAsOf: boolean }) | null;
  correctionCases: Row[]; brokenLineage: Row[];
};
export function toTimelineItem(r: Row): TimelineItemView {
  const clock = String(r['clock']) as TimelineItem['clock'];
  if (!CLOCKS.includes(clock)) throw new Error(`graph.timeline answered an unknown clock reading ${clock}`);
  const later = (r['corrected_later'] ?? null) as Row | null;
  const times = timeValues(r['time']);
  return {
    ref: String(r['ref']), objectType: String(r['object_type']), title: String(r['title']), objectId: String(r['object_id']), version: Number(r['version']),
    eventTime: str(r['event_time']), observedAt: str(r['observed_at']), validFrom: str(r['valid_from']), validTo: str(r['valid_to']), recordedAt: String(r['recorded_at']),
    correctedLater: later === null ? null : { at: String(later['at']), by: String(later['by']), version: Number(later['version']), lifecycle: String(later['lifecycle']), knownAtAsOf: later['known_at_as_of'] === true },
    clock, time: times === null ? null : (times.find((t) => t.axis === 'event') ?? times[0] ?? null),
    headerOnly: r['header_only'] === true, axisStart: str(r['axis_start']), axisEnd: str(r['axis_end']), times, timeStated: r['time_stated'] === true,
    clockFlags: Array.isArray(r['clock_flags']) ? (r['clock_flags'] as unknown[]).map(String) : [], clockDetail: (r['clock_detail'] ?? []) as Row[],
    lifecycle: String(r['lifecycle']), truthState: String(r['truth_state']), synthetic: r['synthetic'] === true, classification: String(r['classification']),
    owner: String(r['owner']), digest: String(r['digest']), believedAtAsOf: r['believed_at_as_of'] === true,
    correctionCases: (r['correction_cases'] ?? []) as Row[], brokenLineage: (r['broken_lineage'] ?? []) as Row[],
  };
}
export type TimelineDisclosureView = TimelineDisclosure & {
  missing: Row[]; unattributedOpenRanges: number; withheldByReason: { classification: number; audience: number }; clock: Record<string, number>;
  brokenDetail: Row[]; correctionsLater: number; untimed: number; bounds: Row;
};
export function toDisclosure(d: Row): TimelineDisclosureView {
  const missing = (d['missing_intervals'] ?? []) as Row[];
  const withheld = (d['withheld'] ?? {}) as Row;
  const broken = (d['broken_lineage'] ?? []) as Row[];
  return {
    missingIntervals: missing.map((m) => ({ sourceKey: String(m['source_key'] ?? m['source_id']), from: String(m['from'] ?? ''), to: m['to'] === null || m['to'] === undefined ? 'open' : String(m['to']) })),
    withheld: { count: Number(withheld['count'] ?? 0), reason: String(withheld['reason'] ?? 'policy') as TimelineDisclosure['withheld']['reason'] },
    clockFlags: Number(d['clock_flags'] ?? 0), brokenLineage: broken.map((b) => ({ ref: String(b['ref']), cites: String(b['cites']) })), incomplete: d['incomplete'] === true,
    missing, unattributedOpenRanges: Number(d['unattributed_open_ranges'] ?? 0), withheldByReason: (d['withheld_by_reason'] ?? { classification: 0, audience: 0 }) as { classification: number; audience: number },
    clock: (d['clock'] ?? {}) as Record<string, number>, brokenDetail: broken, correctionsLater: Number(d['corrections_later'] ?? 0), untimed: Number(d['untimed'] ?? 0), bounds: (d['bounds'] ?? {}) as Row,
  };
}
export function toTimelineView(r: Row) {
  return {
    method: r['method'], subject: r['subject'], window: r['window'], asOf: r['as_of'], live: r['live'] === true, readAt: r['read_at'], clearance: r['clearance'],
    items: (Array.isArray(r['items']) ? (r['items'] as Row[]) : []).map(toTimelineItem),
    events: (r['events'] ?? []) as Row[], asOfReads: (r['as_of_reads'] ?? {}) as Row, sources: (r['sources'] ?? []) as string[],
    disclosure: toDisclosure((r['disclosure'] ?? {}) as Row), claim: r['claim'],
  };
}
export type TraceNodeView = TraceNode & { visible: boolean; clock: string; clockFlags: string[]; clockDetail: Row[]; correctedLater: Row | null; recordedAt: string | null;
  eventTime: string | null; observedAt: string | null; depth?: number; digest?: string };
export function toTraceNode(n: Row): TraceNodeView {
  const stage = String(n['stage']) as TraceNode['stage'];
  if (!STAGES.includes(stage)) throw new Error(`graph.trace answered an unknown stage ${stage}`);
  return {
    ...toExplainNode(n), stage, visible: n['visible'] !== false, clock: String(n['clock'] ?? 'unknown'),
    clockFlags: Array.isArray(n['clock_flags']) ? (n['clock_flags'] as unknown[]).map(String) : [], clockDetail: (n['clock_detail'] ?? []) as Row[],
    correctedLater: (n['corrected_later'] ?? null) as Row | null, recordedAt: str(n['recorded_at']), eventTime: str(n['event_time']), observedAt: str(n['observed_at']),
  };
}
export function toTraceView(r: Row) {
  return {
    method: r['method'], explainMethod: r['explain_method'], ref: r['ref'], root: r['root'], readAt: r['read_at'], clearance: r['clearance'], product: r['product'], subject: (r['subject'] ?? {}) as Row,
    nodes: (Array.isArray(r['nodes']) ? (r['nodes'] as Row[]) : []).map(toTraceNode),
    steps: (Array.isArray(r['steps']) ? (r['steps'] as Row[]) : []).map((s) => ({ ...toExplainNode(s), of: Array.isArray(s['of']) ? (s['of'] as unknown[]).map(String) : [] })),
    edges: (r['edges'] ?? []) as Row[], unresolvedEdges: (r['unresolved_edges'] ?? []) as Row[], gaps: (r['gaps'] ?? []) as Row[],
    decisionSnapshots: (r['decision_snapshots'] ?? []) as Row[], sources: (r['sources'] ?? []) as string[], missingIntervals: (r['missing_intervals'] ?? []) as Row[],
    continuity: (r['continuity'] ?? { state: 'normal', dependencies: [] }) as Row, disclosure: (r['disclosure'] ?? {}) as Row,
    reasons: (r['reasons'] ?? []) as Array<{ reason: string; count: number; detail?: unknown }>, incomplete: r['incomplete'] === true,
    // D20: the sources' own stated limitations (an unknown source clock) — served, never a reason the trace is incomplete
    limitations: (r['limitations'] ?? []) as Array<{ limitation: string; count: number }>,
    reconciliation: (r['reconciliation'] ?? []) as Row[], carried: r['carried'], claim: r['claim'],
  };
}
