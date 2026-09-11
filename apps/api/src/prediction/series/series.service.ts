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
import type { Envelope } from '@eye/contracts';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { ObservationCapability, type AcquisitionWrites } from '../../observation/observation.capabilities.js';
import { EvidenceService } from '../../observation/vault/evidence.service.js';
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
  complete: boolean;
  /** The controls folded from every evidence version that contributed a point. */
  controls: Controls;
  /** The evidence versions that contributed a point, with the controls each carries. */
  evidenceRows: EvidenceVersionRow[];
  /** The instant the newest evidence used was recorded: the honest freshness. */
  freshestRecordedAt: string | null;
  attribution: string | null;
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
    for (const v of versions.result) {
      const cached = await this.load(r, v, parse, series);
      if (typeof cached === 'string') {
        unreadable.push({ evidence_object_id: v.object_id, evidence_version: v.object_version, reason: cached });
        continue;
      }
      for (const obs of cached.rows) {
        if (observedThrough !== null && obs.date > observedThrough) continue;
        const prev = byDate.get(obs.date);
        const newer = prev === undefined
          || v.recorded_at > prev.v.recorded_at
          || (v.recorded_at === prev.v.recorded_at && v.is_fragment && !prev.v.is_fragment);
        if (newer) byDate.set(obs.date, { obs, v });
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
      versionsRead: versions.result.length, freshestRecordedAt: freshest, attribution: series.attribution,
      unreadable, complete: unreadable.length === 0,
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
      const got = await this.pipeline.write<{ base64: string }, AcquisitionWrites>(
        this.envelope(r, 'observation.evidence.retrieve', 'EVD', objectId), r.principal,
        { scope: 'DOMAIN', tenantId: r.tenantId, domainId: r.domainId,
          action: 'observation.evidence.retrieve', objectType: 'EVD', objectId },
        ObservationCapability.acquisition,
        async (cap, scope) => {
          const res = await this.evidence.retrieve(
            cap, scope, `principal:${r.principal.principalId}`, objectId, r.correlationId, context, version);
          return { result: { base64: res.base64 }, targetType: 'EVD', targetId: objectId,
                   targetVersion: String(version), outboxEvent: null };
        });
      return { bytes: Buffer.from(got.result.base64, 'base64') };
    } catch (e) {
      const status = e instanceof HttpException ? e.getStatus() : null;
      const msg = e instanceof HttpException ? String((e.getResponse() as { message?: string })?.message ?? e.message) : (e instanceof Error ? e.message : 'unknown');
      return { refused: `${status === null ? 'read failed' : `refused (${status})`}: ${msg.slice(0, 160)}`, status, error: e };
    }
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
