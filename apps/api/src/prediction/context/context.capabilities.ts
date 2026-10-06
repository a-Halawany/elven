/**
 * B25 §CX (0108) — THE CONTEXT CAPABILITIES: one implementation, narrow interfaces (the constraint-capabilities idiom). Every write is a
 * SECURITY DEFINER port asserting the caller's own bound action; the reads go through the tables' row security and the INVOKER grounding
 * read (prediction.pcx_grounding_context — the caller's RLS scopes it).
 *
 *   prediction.information_set.freeze (and the issuing actions that freeze through the seam) → prediction.freeze_information_set
 *   prediction.forecast.replay                                                                → prediction.record_forecast_replay
 *   prediction.information_set.read                                                           → the tables, under RLS
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ContextReads {
  readonly action: string;
  readSets(): any;
  readSetEvents(): any;
  readReplays(): any;
  readForecasts(): any;
  readForecastEvents(): any;
  readSeries(): any;
  /** The assembler's database half: the grounding context of a series at a cut-off (p_twin: the replay's pin). */
  groundingContext(a: { seriesKey: string; knownAt: string; assumptions: string[]; twin: { twin_id: string; version: number } | null }): Promise<Record<string, unknown>>;
  /** The database's instant (every "now" of this part is the database's, never the process clock). */
  dbNow(): Promise<string>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Ids { tenantId: string; domainId: string; actor: string; eventId: string; correlationId: string }
export interface FreezeWrites extends ContextReads {
  freezeSet(a: Ids & { setId: string; request: Record<string, unknown>; manifest: Record<string, unknown>; manifestDigest: string; assemblerVersion: string }): Promise<Record<string, unknown>>;
}
export interface ReplayWrites extends ContextReads {
  recordReplay(a: Ids & {
    replayId: string; forecastId: string; informationSetId: string | null;
    originalManifestDigest: string | null; replayedManifestDigest: string | null; originalOutputDigest: string | null; replayedOutputDigest: string | null;
    originalEnvironmentDigest: string | null; replayedEnvironmentDigest: string | null;
    diverged: unknown[]; fresh: Record<string, unknown> | null; detail: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class ContextCapabilityImpl implements FreezeWrites, ReplayWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async one(q: ReturnType<typeof sql>): Promise<Record<string, unknown>> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Record<string, unknown> } | undefined)?.r) ?? {};
  }

  readSets(): any { return this.from('prediction.information_sets'); }
  readSetEvents(): any { return this.from('prediction.information_set_events'); }
  readReplays(): any { return this.from('prediction.forecast_replays'); }
  readForecasts(): any { return this.from('prediction.forecasts_current'); }
  readForecastEvents(): any { return this.from('prediction.forecast_events'); }
  readSeries(): any { return this.from('prediction.series_registry'); }

  async groundingContext(a: Parameters<ContextReads['groundingContext']>[0]) {
    const assumptions = `{${a.assumptions.join(',')}}`;
    return this.one(sql`select prediction.pcx_grounding_context(${a.seriesKey}, ${a.knownAt}::timestamptz, ${assumptions}::uuid[],
      ${a.twin === null ? null : JSON.stringify(a.twin)}::jsonb) as r`);
  }
  async dbNow(): Promise<string> {
    const r = await sql<{ now: string }>`select prediction.pcx_ts(clock_timestamp()) as now`.execute(this.#tx);
    return String(r.rows[0]?.now);
  }
  async freezeSet(a: Parameters<FreezeWrites['freezeSet']>[0]) {
    return this.one(sql`select prediction.freeze_information_set(${a.setId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.request)}::jsonb,
      ${JSON.stringify(a.manifest)}::jsonb, ${a.manifestDigest}, ${a.assemblerVersion}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async recordReplay(a: Parameters<ReplayWrites['recordReplay']>[0]) {
    return this.one(sql`select prediction.record_forecast_replay(${a.replayId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.forecastId}::uuid,
      ${a.informationSetId}::uuid, ${a.originalManifestDigest}, ${a.replayedManifestDigest}, ${a.originalOutputDigest}, ${a.replayedOutputDigest},
      ${a.originalEnvironmentDigest}, ${a.replayedEnvironmentDigest}, ${JSON.stringify(a.diverged)}::jsonb,
      ${a.fresh === null ? null : JSON.stringify(a.fresh)}::jsonb, ${JSON.stringify(a.detail)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const ContextCapability = {
  read(tx: Tx, action: string): ContextReads { return new ContextCapabilityImpl(tx, action); },
  freeze(tx: Tx, action: string): FreezeWrites { return new ContextCapabilityImpl(tx, action); },
  replay(tx: Tx, action: string): ReplayWrites { return new ContextCapabilityImpl(tx, action); },
};
