/**
 * Derivation of the STORED facts a coverage evaluation runs on — §6, A6.
 *
 * Coverage is a claim about THE EVIDENCE WE HOLD, so the facts come from the
 * admitted canonical objects, not from the run log. The difference matters: a run
 * that succeeded and returned nothing is not coverage, and an item recorded today
 * that describes 14 January is coverage OF 14 JANUARY. Bucketing by record time
 * would make a replayed January corridor look like a September one.
 *
 * Every number here comes from a stored row. Nothing consults the wall clock
 * except the caller-supplied `evaluatedAt`, which is itself stored on every
 * measurement — which is precisely what makes a replay of the stream reproduce
 * the same timeline.
 */
import { Injectable } from '@nestjs/common';
import type { ObservationReads } from '../observation.capabilities.js';
import type { ObservedFacts } from './coverage.service.js';

/** The admitted OBS rows a source holds, with the times that place them. */
interface ObservationRow {
  object_id: string;
  event_time: Date | null;
  observation_time: Date | null;
  recorded_at: Date;
  payload: { item_key?: string; publisher_time?: string | null; fragment_ref?: string | null };
}

@Injectable()
export class CoverageFactsService {
  async gather(
    cap: ObservationReads,
    sourceId: string,
    windowStart: string,
    windowEnd: string,
    bucketSeconds: number | null,
    /** The contract's declared expected item count for the window, or null. */
    declaredExpectedItems: number | null,
  ): Promise<ObservedFacts> {
    const start = new Date(windowStart);
    const end = new Date(windowEnd);

    // The observations this source has produced. Provenance carries the source,
    // so no denormalised column can drift away from the object.
    const observations = (await cap
      .readCanonicalObjects()
      .selectAll()
      .where('object_type' as never, '=', 'OBS' as never)
      .where('provenance_ref' as never, 'like', `SRC:${sourceId}@%` as never)
      .orderBy('recorded_at' as never)
      .limit(5000)
      .execute()) as ObservationRow[];

    /*
     * WHICH TIME PLACES AN OBSERVATION IN THE WINDOW.
     *
     * The publisher's own time for the item (event time) if it gave one;
     * otherwise the time we observed it. Never the record time: when we wrote a
     * row down says nothing about the period it describes.
     */
    const placed = observations
      .map((o) => ({ row: o, at: o.event_time ?? o.observation_time ?? null }))
      .filter((o): o is { row: ObservationRow; at: Date } => o.at !== null);

    const inWindow = placed.filter((o) => o.at >= start && o.at < end);

    const runs = (await cap
      .readRuns()
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .orderBy('started_at' as never, 'desc')
      .limit(200)
      .execute()) as Array<{ run_id: string; state: string; started_at: Date; finished_at: Date | null }>;

    const corrections = (await cap
      .readCorrections()
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .execute()) as Array<{ received_at: Date; closed_at: Date | null; state: string }>;

    /*
     * COMPLETENESS IS MEASURED PER SERIES PER INTERVAL, not per interval.
     *
     * A source can publish several series — PortWatch chokepoints publishes three
     * — and pooling them would let one series' rows fill a gap in another's. The
     * unit is therefore the (series, interval) PAIR, which is exactly what the
     * contract's own denominator derivation says: "one framed row per chokepoint
     * per day".
     *
     * The series an observation belongs to is the parent it was framed out of,
     * carried in its item key. An unframed item is its own series.
     *
     * The expected count is the CONTRACT's declared number. Deriving it from the
     * window instead would let a wider window invent a gap, and a narrower one
     * hide a real one.
     */
    let bucketsCovered = 0;
    let bucketsExpected: number | null = null;
    const anyItemCarriesPublisherTime = placed.some((o) => o.row.event_time !== null);
    if (declaredExpectedItems !== null && bucketSeconds !== null && bucketSeconds > 0 && anyItemCarriesPublisherTime) {
      bucketsExpected = declaredExpectedItems;
      const covered = new Set<string>();
      for (const o of inWindow) {
        if (o.row.event_time === null) continue; // only publisher-timed items place a pair
        const idx = Math.floor((o.at.getTime() - start.getTime()) / (bucketSeconds * 1000));
        if (idx < 0) continue;
        covered.add(`${seriesOf(o.row)}@${idx}`);
      }
      bucketsCovered = covered.size;
    }

    /*
     * WHICH OBSERVATION IS "NEWEST" FOR FRESHNESS.
     *
     * When any of this source's items carry the publisher's own time, freshness
     * is measured against those ONLY. A framing parent — the raw response the
     * rows were cut from — carries no publisher time, so its observation time is
     * ours, which is now. Letting that stand in would report a replayed January
     * corridor as perfectly fresh in September, which is the single most
     * misleading number this panel could show.
     */
    const publisherTimed = placed.filter((o) => o.row.event_time !== null);
    const forFreshness = publisherTimed.length > 0 ? publisherTimed : placed;
    const newest = forFreshness.length === 0
      ? null
      : forFreshness.reduce((a, b) => (a.at > b.at ? a : b));

    const successfulRuns = runs.filter((r) => r.state === 'finished');
    const failedRuns = runs.filter((r) => r.state === 'failed' || r.state === 'budget_exceeded');

    // Publication-to-admission latency, measured only where BOTH times exist.
    const latencies: number[] = [];
    for (const o of inWindow) {
      if (o.row.event_time === null) continue;
      const admittedAt = new Date(o.row.recorded_at).getTime();
      latencies.push(Math.max(0, (admittedAt - o.row.event_time.getTime()) / 1000));
    }

    const correctionLags: number[] = [];
    for (const c of corrections) {
      if (c.closed_at !== null) {
        correctionLags.push(Math.max(0, (new Date(c.closed_at).getTime() - new Date(c.received_at).getTime()) / 1000));
      }
    }

    return {
      admittedInWindow: inWindow.length,
      bucketsCovered,
      bucketsExpected,
      lastAdmittedAt: newest !== null ? newest.at.toISOString() : null,
      lastSuccessfulRunAt: successfulRuns[0] !== undefined
        ? new Date(successfulRuns[0].finished_at ?? successfulRuns[0].started_at).toISOString() : null,
      lastFailedRunAt: failedRuns[0] !== undefined
        ? new Date(failedRuns[0].finished_at ?? failedRuns[0].started_at).toISOString() : null,
      medianLatencySeconds: median(latencies),
      correctionCount: corrections.length,
      medianCorrectionLagSeconds: median(correctionLags),
      // The measurement cites the exact objects and runs it was derived from, so
      // a reviewer can check the arithmetic rather than trusting it.
      evidenceRefs: [
        ...inWindow.slice(0, 50).map((o) => `OBS:${o.row.object_id}`),
        ...runs.slice(0, 10).map((r) => `run:${r.run_id}`),
      ],
    };
  }
}

/**
 * The series an observation belongs to: the parent it was framed out of. The item
 * key carries `<parent>#<path>:<key>` for a framed child and the bare key for an
 * unframed item, so the prefix is the series without needing a second column that
 * could drift away from it.
 */
function seriesOf(row: ObservationRow): string {
  const key = row.payload?.item_key ?? '';
  const hash = key.indexOf('#');
  return hash > 0 ? key.slice(0, hash) : key;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const v = s.length % 2 === 0 ? ((s[mid - 1] as number) + (s[mid] as number)) / 2 : (s[mid] as number);
  return Math.round(v * 100) / 100;
}
