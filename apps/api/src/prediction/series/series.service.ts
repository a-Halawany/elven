/**
 * SERIES ASSEMBLY — a number, read out of evidence, at an instant.
 *
 * TWO CUT-OFFS, ALWAYS BOTH (the known-at discipline, D2):
 *
 *   * `knownAt`        record time — only evidence VERSIONS recorded at or
 *                       before this instant are read. A revision recorded later
 *                       does not exist for this reader.
 *   * `observedThrough` world time — only observations the publisher dated at
 *                       or before this day are used. A hindcast origin.
 *
 * The bytes come through Phase 1's retrieval path — manifest-resolved,
 * digest-verified, in custody, under `observation.evidence.retrieve` — and are
 * parsed by a deterministic, version-pinned parser. Nothing here interprets a
 * value; it addresses one.
 *
 * A version's parsed rows are cached in process, keyed by object id AND version,
 * so a backtest with many origins reads each version once and filters in memory.
 * The custody entry for the read is written on the retrieval, once.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { errorBody, type Envelope } from '@eye/contracts';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { CapabilityFactory } from '../../shared/capabilities.js';
import { ObservationCapability, type AcquisitionWrites } from '../../observation/observation.capabilities.js';
import { EvidenceService, INTEGRITY_REFUSED_MESSAGE } from '../../observation/vault/evidence.service.js';
import { PredictionCapability, type PredictionReads, type EvidenceVersionRow } from '../prediction.capabilities.js';
import { parserFor, type ParsedObservation } from './parsers.js';
import type { Point } from '../models/models.js';
import { foldControls, type Controls } from '../controls.js';

export interface SeriesRow {
  series_key: string; source_key: string; parser_ref: string; value_field: string; selector: string | null;
  unit: string; seasonality_days: number; subject_entity_id: string | null; attribution: string | null;
  description: string;
  publication_calendar?: { rule: 'daily' | 'business-days'; closures?: string[]; authority?: string } | null;
}

export interface SeriesPoint extends Point {
  evidence_object_id: string;
  evidence_version: number;
  evidence_digest: string;
  recorded_at: string;
}

export interface EvidenceRef { evidence_object_id: string; evidence_version: number; evidence_digest: string; recorded_at: string }

export interface AssembledSeries {
  series: SeriesRow;
  knownAt: string;
  observedThrough: string | null;
  points: SeriesPoint[];
  /** Every evidence version that contributed at least one point. */
  evidence: EvidenceRef[];
  /** Versions read but yielding no point (wrong selector, empty window). */
  versionsRead: number;
  /**
   * Versions this reader could NOT read — withdrawn, governed-deleted, or failing
   * integrity. Disclosed, never silently omitted: a series missing a window is
   * not the series.
   */
  unreadable: Array<{ evidence_object_id: string; evidence_version: number; reason: string }>;
  /**
   * B25 act-found: unreadable FRAMED FRAGMENTS (one row each, their day stated by the event time) whose day a LATER-recorded readable
   * version of this series serves — the later version wins the day whatever the lost row held, so the history is not incomplete for
   * them. Disclosed here, never hidden; not counted against `complete`.
   */
  supersededUnreadable: Array<{ evidence_object_id: string; evidence_version: number; reason: string; day: string; served_by: string }>;
  complete: boolean;
  /** The controls folded from every evidence version that contributed a point. */
  controls: Controls;
  /** The evidence versions that contributed a point, with the controls each carries. */
  evidenceRows: EvidenceVersionRow[];
  /** The instant the newest evidence used was recorded: the honest freshness. */
  freshestRecordedAt: string | null;
  attribution: string | null;
  /** B25-R: a TAIL read's first day (the rows before it were not read), null when the whole history was read. */
  readFrom?: string | null;
  /** B25-R: the framed fragments dated before `readFrom`, left unretrieved. */
  versionsLeftOut?: number;
}

/**
 * B25-R (the demo regression of 2026-10-07): a TAIL read — the caller needs only the latest `points` points (the twin's estimators read
 * their declared windows: at most 30 of the corridor's daily counts) and names the span of days that should hold them. The whole history
 * was read per estimate — the corridor's ~9,000 framed PortWatch fragments, each a governed retrieval, twice per scan — and the scan
 * outlived its agent's session. What a tail read leaves out is exactly what cannot touch its rows: a FRAMED FRAGMENT is one row of its
 * parent, dated by its event time, so a fragment dated before the tail holds no row of it; every other version (a parent, a window, a
 * fragment that states no day) is read as before. The tail widens (×4) until it holds `points` days, else the whole history is read.
 */
export interface SeriesTail { points: number; spanDays: number }

const dayMinus = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** B25-R: the first day of a tail of `spanDays` before the newest dated fragment (or the observed-through cut-off); null — read everything. */
export function tailFromDay(versions: readonly EvidenceVersionRow[], spanDays: number, observedThrough: string | null): string | null {
  const days = versions.filter((v) => v.is_fragment && typeof v.event_time === 'string' && v.event_time !== '').map((v) => v.event_time as string);
  if (days.length === 0) return null;   // nothing dated: nothing can be left out
  let anchor = days.reduce((a, b) => (b > a ? b : a));
  if (observedThrough !== null && observedThrough < anchor) anchor = observedThrough;
  const oldest = days.reduce((a, b) => (b < a ? b : a));
  const from = dayMinus(anchor, spanDays);
  return from <= oldest ? null : from;
}

/** B25-R: whether a tail from `fromDay` reads this version — every version but a framed fragment dated before the tail (a day's margin
 *  for the event time's zone against the row's own date). */
export function readsInTail(v: Pick<EvidenceVersionRow, 'is_fragment' | 'event_time'>, fromDay: string | null): boolean {
  return fromDay === null || !v.is_fragment || typeof v.event_time !== 'string' || v.event_time === '' || v.event_time >= dayMinus(fromDay, 1);
}

export interface Reader {
  principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string; purposeId: string;
}

interface LoadedVersion { rows: ParsedObservation[]; digest: string; recordedAt: string; isFragment: boolean }


@Injectable()
export class SeriesService {

  constructor(private readonly pipeline: PipelineService, private readonly evidence: EvidenceService) {}

  async registry(cap: PredictionReads, seriesKey: string): Promise<SeriesRow | undefined> {
    return (await cap.readSeries().selectAll()
      .where('series_key' as never, '=', seriesKey as never)
      .executeTakeFirst()) as SeriesRow | undefined;
  }

  async listRegistry(cap: PredictionReads): Promise<SeriesRow[]> {
    return (await cap.readSeries().selectAll().orderBy('series_key' as never).execute()) as SeriesRow[];
  }

  /**
   * Assemble the series as it was KNOWN at `knownAt`, using observations dated
   * at or before `observedThrough` (or all of them when null).
   */
  async assemble(
    r: Reader, seriesKey: string, knownAt: string, observedThrough: string | null,
    /* B25-R: only the latest points (null: the whole history, as every caller but the twin's estimation reads) */
    tail: SeriesTail | null = null,
  ): Promise<AssembledSeries> {
    const reg = await this.pipeline.consequentialRead(
      this.envelope(r, 'prediction.read', 'SER', null), r.principal,
      { scope: 'DOMAIN', tenantId: r.tenantId, domainId: r.domainId, action: 'prediction.read', objectType: 'SER', objectId: null },
      PredictionCapability.read,
      async (cap) => {
        const series = await this.registry(cap, seriesKey);
        if (series === undefined) return { series: undefined, versions: [] as EvidenceVersionRow[] };
        return { series, versions: await cap.evidenceVersionsKnownAt({ sourceKey: series.source_key, knownAt }) };
      });
    const series = reg.result.series;
    if (series === undefined) throw new Error(`series ${seriesKey} is not registered in this domain`);
    const versions = { result: reg.result.versions };

    const parse = parserFor(series.parser_ref);
    // Per date: the row from the evidence recorded LATEST at or before knownAt;
    // a framed fragment beats its parent at equal instants.
    const byDate = new Map<string, { obs: ParsedObservation; v: EvidenceVersionRow }>();
    const used = new Map<string, EvidenceRef>();
    const usedRows = new Map<string, EvidenceVersionRow>();
    const unreadable: AssembledSeries['unreadable'] = [];
    let freshest: string | null = null;
    /* B25-R: the TAIL — retrieved once each (a widened tail reads only the versions it adds), then assembled as before over what it reads */
    const loaded = new Map<string, LoadedVersion | string>();
    const keyOf = (v: EvidenceVersionRow) => `${v.object_id}@${v.object_version}`;
    let span = tail?.spanDays ?? 0;
    let fromDay = tail === null ? null : tailFromDay(versions.result, span, observedThrough);
    let wanted = versions.result;
    for (;;) {
      wanted = versions.result.filter((v) => readsInTail(v, fromDay));
      for (const v of wanted) if (!loaded.has(keyOf(v))) loaded.set(keyOf(v), await this.load(r, v, parse, series));
      if (tail === null || fromDay === null) break;
      const days = new Set<string>();
      for (const v of wanted) {
        const c = loaded.get(keyOf(v));
        if (typeof c !== 'string' && c !== undefined) for (const o of c.rows) if (o.date >= fromDay && (observedThrough === null || o.date <= observedThrough)) days.add(o.date);
      }
      if (days.size >= tail.points) break;
      span *= 4;
      fromDay = tailFromDay(versions.result, span, observedThrough);
    }
    for (const v of wanted) {
      const cached = loaded.get(keyOf(v)) as LoadedVersion | string;
      if (typeof cached === 'string') {
        unreadable.push({ evidence_object_id: v.object_id, evidence_version: v.object_version, reason: cached });
        continue;
      }
      for (const obs of cached.rows) {
        if (observedThrough !== null && obs.date > observedThrough) continue;
        if (fromDay !== null && obs.date < fromDay) continue;   // B25-R: before the tail (its days are not all read)
        const prev = byDate.get(obs.date);
        const newer = prev === undefined
          || v.recorded_at > prev.v.recorded_at
          || (v.recorded_at === prev.v.recorded_at && v.is_fragment && !prev.v.is_fragment);
        if (newer) byDate.set(obs.date, { obs, v });
      }
    }
    /*
     * B25 act-found (the rehearsal of the B25 act on eye_demo_b25): the routine retention of SUPERSEDED evidence (a 2024 PortWatch replay-set
     * fragment, tombstoned by a retention action) left every PortWatch series INCOMPLETE for good, so every forecast on the corridor was
     * refused — the B30 act found the same for the twin's estimators (estimators.ts unreadableInWindow). An unreadable version is set aside
     * — disclosed, not counted — only when it is a FRAMED FRAGMENT (one row of its parent) whose stated day (its event time) this series
     * holds a point for from a version recorded LATER: by the rule above the later version wins that day whatever the lost row held, so
     * nothing the lost bytes could say reaches the series. Anything else unreadable (a window, a parent, a fragment with no day or whose
     * day nothing later serves) still makes the history incomplete.
     */
    const supersededUnreadable: AssembledSeries['supersededUnreadable'] = [];
    const rowOf = new Map(versions.result.map((v) => [`${v.object_id}@${v.object_version}`, v]));
    for (let i = unreadable.length - 1; i >= 0; i -= 1) {
      const u = unreadable[i]!; const v = rowOf.get(`${u.evidence_object_id}@${u.evidence_version}`);
      const dayOf = v?.event_time ?? null;
      if (v === undefined || !v.is_fragment || dayOf === null) continue;
      if (observedThrough !== null && dayOf > observedThrough) { supersededUnreadable.push({ ...u, day: dayOf, served_by: 'outside the cut-off (observed through)' }); unreadable.splice(i, 1); continue; }
      const served = byDate.get(dayOf);
      if (served !== undefined && Date.parse(served.v.recorded_at) > Date.parse(v.recorded_at)) {
        supersededUnreadable.push({ ...u, day: dayOf, served_by: `${served.v.object_id}@${served.v.object_version}` });
        unreadable.splice(i, 1);
      }
    }
    const points: SeriesPoint[] = [...byDate.values()]
      .sort((a, b) => a.obs.date.localeCompare(b.obs.date))
      .map(({ obs, v }) => {
        used.set(`${v.object_id}@${v.object_version}`, {
          evidence_object_id: v.object_id, evidence_version: v.object_version,
          evidence_digest: v.content_digest, recorded_at: v.recorded_at });
        usedRows.set(`${v.object_id}@${v.object_version}`, v);
        if (freshest === null || v.recorded_at > freshest) freshest = v.recorded_at;
        return { date: obs.date, value: obs.value, evidence_object_id: v.object_id,
                 evidence_version: v.object_version, evidence_digest: v.content_digest, recorded_at: v.recorded_at };
      });
    return {
      series, knownAt, observedThrough, points, evidence: [...used.values()],
      versionsRead: wanted.length, freshestRecordedAt: freshest, attribution: series.attribution,
      /* B25-R */ readFrom: fromDay, versionsLeftOut: versions.result.length - wanted.length,
      unreadable, supersededUnreadable, complete: unreadable.length === 0,
      controls: foldControls([...usedRows.values()]),
      evidenceRows: [...usedRows.values()],
    };
  }

  /**
   * Returns the parsed rows, or a REASON string when this reader could not read
   * the version.
   *
   * NO CACHE. An earlier version kept parsed rows per reader and purpose, and
   * served them again without asking: a reader whose retrieval authority had been
   * revoked, or whose evidence had been governed-deleted since, still got a
   * complete series while a cold reader was refused. Every read is now a
   * governed retrieval — authorised, custody-recorded, integrity-checked — at the
   * moment it is served. That costs one retrieval per evidence version per
   * assembly, which is the price of the answer being true when it is given.
   */
  private async load(
    r: Reader, v: EvidenceVersionRow, parse: ReturnType<typeof parserFor>, series: SeriesRow,
  ): Promise<LoadedVersion | string> {
    const got = await this.retrieveBytes(r, v.object_id, v.object_version,
      { read_for: 'prediction.series', series_key: series.series_key, parser: series.parser_ref, version: String(v.object_version) });
    // A POLICY DENIAL is the reader's answer, not a gap in the series: it is
    // raised, so an unauthorised reader is refused rather than handed an
    // empty history that looks like one. Withdrawn, governed-deleted or
    // unverifiable bytes are disclosed as unreadable and yield no point.
    if ('refused' in got) {
      if (got.status === 403) throw got.error;
      return got.refused;
    }
    return {
      rows: parse(got.bytes, series.value_field, series.selector), digest: v.content_digest,
      recordedAt: v.recorded_at, isFragment: v.is_fragment,
    };
  }

  /**
   * ONE GOVERNED RETRIEVAL of an exact evidence version for this reader: authorised,
   * custody-recorded, integrity-checked, at the moment it is served. Shared by the
   * series assembly, by twin grounding (a value is established from the record that
   * states it) and by reproduction (an artefact a run rests on is either still
   * available to this reader, or the run is unreproducible for them). A refusal —
   * policy, withdrawal, governed deletion, integrity — comes back as what it is; the
   * caller decides what a refusal means for its own answer.
   */
  async retrieveBytes(
    r: Reader, objectId: string, version: number, context: Readonly<Record<string, string>>,
  ): Promise<{ bytes: Buffer } | { refused: string; status: number | null; error: unknown }> {
    try {
      const got = await this.pipeline.write<{ integrity: 'verified' | 'unavailable' | 'failed'; base64: string | null; label: string | null; message: string | null }, AcquisitionWrites>(
        this.envelope(r, 'observation.evidence.retrieve', 'EVD', objectId), r.principal,
        { scope: 'DOMAIN', tenantId: r.tenantId, domainId: r.domainId, action: 'observation.evidence.retrieve', objectType: 'EVD', objectId },
        ObservationCapability.acquisition,
        async (cap, scope) => {
          const res = await this.evidence.retrieve(cap, scope, `principal:${r.principal.principalId}`, objectId, r.correlationId, context, version);
          // B21.2 (D2.6/D2.7): returned, not thrown — the custody row commits; the audit row carries the read's own code on a SUCCESS
          // outcome either way (the custody row is a business effect; 0013's closure needs one success audit row beside it).
          const evidence = res.integrity === 'verified' ? undefined
            : res.integrity === 'unavailable'
              ? { outcome: 'success' as const, resultCode: 'EYE-DEG-001', metadata: { integrity: 'unavailable', tier: res.tier, root_unreachable: res.degraded.root } }
              : { outcome: 'success' as const, resultCode: 'EYE-INT-001', metadata: { integrity: 'failed' } };
          return { result: { integrity: res.integrity, base64: res.integrity === 'verified' ? res.base64 : null,
                             label: res.integrity === 'unavailable' ? res.degraded.label : null, message: res.integrity === 'failed' ? res.refusal.message : null },
                   targetType: 'EVD', targetId: objectId, targetVersion: String(version), outboxEvent: null, ...(evidence === undefined ? {} : { evidence }) };
        });
      const res = got.result;
      if (res.integrity === 'verified' && res.base64 !== null) return { bytes: Buffer.from(res.base64, 'base64') };
      // A degraded read is disclosed as a tombstone is (unreadable, complete false): the tier, never the object. A refused read keeps
      // today's wording and status (409) so every caller that matched on it still does; neither is a 403, so no caller re-throws it.
      if (res.integrity === 'unavailable') {
        return { refused: `degraded (EYE-DEG-001): ${String(res.label)}`, status: 503, error: new HttpException(errorBody('EYE_DEG_001', r.correlationId, String(res.label)), 503) };
      }
      return { refused: `refused (409): ${String(res.message ?? INTEGRITY_REFUSED_MESSAGE).slice(0, 160)}`, status: 409, error: new HttpException(errorBody('EYE_INT_001', r.correlationId, String(res.message ?? INTEGRITY_REFUSED_MESSAGE)), 409) };
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : null;
      const msg = e instanceof HttpException ? String((e.getResponse() as { message?: string })?.message ?? e.message) : (e instanceof Error ? e.message : 'unknown');
      return { refused: `${status === null ? 'read failed' : `refused (${status})`}: ${msg.slice(0, 160)}`, status, error: e };
    }
  }

  /**
   * B25 act-found: ONE consequential read under the reader's own envelope — what a write route needs to know BEFORE its write opens (the
   * series it will read, the cut-off). A governed write's commit capability lives 60 s; a real history (the corridor's ~8,900 PortWatch
   * evidence versions, each a governed retrieval) takes minutes to assemble, so the routes assemble first and write after.
   */
  async readAs<T, C>(r: Reader, action: string, objectType: string, objectId: string | null, capability: CapabilityFactory<C>, fn: (cap: C) => Promise<T>): Promise<T> {
    const out = await this.pipeline.consequentialRead(this.envelope(r, action, objectType, objectId), r.principal,
      { scope: 'DOMAIN', tenantId: r.tenantId, domainId: r.domainId, action, objectType, objectId }, capability, (cap) => fn(cap));
    return out.result;
  }

  private envelope(r: Reader, action: string, objectType: string, objectId: string | null): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: r.tenantId, domain_id: r.domainId,
      principal_id: `principal:${r.principal.principalId}`, purpose_id: r.purposeId, action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C1',
      object_type: objectType, object_id: objectId, schema_version: 'v1',
      issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: r.correlationId, trace_id: 'prediction',
    } as unknown as Envelope;
  }
}

/**
 * A DATE column as a day string. The driver hands a `date` back as a JavaScript
 * Date whose string form is not ISO; a naive `.slice(0, 10)` on it would compare
 * "Thu Nov 30" against "2023-11-30" and silently filter nothing.
 */
export function dayOf(v: unknown): string | null {
  if (v instanceof Date) {
    // The driver builds a DATE at LOCAL midnight; reading it back in UTC would
    // move it a day west of Greenwich. Local components give the day it names.
    if (Number.isNaN(v.getTime())) return null;
    const mm = String(v.getMonth() + 1).padStart(2, '0'); const dd = String(v.getDate()).padStart(2, '0');
    return `${v.getFullYear()}-${mm}-${dd}`;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

/** Mean gap in days between consecutive points: 1 for daily, ~1.4 for business days. */
export function cadenceOf(points: Point[]): 'daily' | 'business' | 'sparse' {
  if (points.length < 3) return 'sparse';
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += (Date.parse(points[i]?.date as string) - Date.parse(points[i - 1]?.date as string)) / 86_400_000;
  }
  const mean = total / (points.length - 1);
  if (mean <= 1.05) return 'daily';
  if (mean <= 1.6) return 'business';
  return 'sparse';
}

/** Horizon in OBSERVATIONS for a horizon in days, given the series' cadence. */
export function stepsFor(days: number, cadence: 'daily' | 'business' | 'sparse'): number {
  if (cadence === 'business') return Math.max(1, Math.round(days * 5 / 7));
  return Math.max(1, days);
}
