/**
 * B25 §CX (0108; F-P4-03 — V00-T-009, L6-C02, V03-T-319, AI-48-002, V03-T-127; V03-T-196) — GROUNDED CONTEXT, THE FROZEN INFORMATION
 * SET, THE REPLAY, THE ENVIRONMENT.
 *
 *   THE GROUNDED ISSUE. A forecast issued through POST …/prediction/forecasts/issue-grounded freezes its information set FIRST, in the
 *   same transaction (the assembler's read as of the cut-off → the manifest → prediction.freeze_information_set), and is then issued
 *   through the ONE issue path (ForecastingService.issue, unchanged) with the B25 columns — information_set_id and the ENVIRONMENT
 *   (forecast-environment.ts: node, platform, arch, method reference, implementation digest, assembler version → sha-256) — and the FCT@v2
 *   payload sections `information_set` (the pins: the graph revision and cut-off, the twin snapshot, the feature keys, the gaps) and
 *   `environment`. The method is the one the issue's own LEASH chooses (computed here first, exactly as the issue does, so the environment
 *   names the method actually issued). The legacy route stays ungrounded: default-off for every existing caller.
 *
 *   THE REPLAY (POST …/prediction/forecasts/:forecastId/replay). Re-reads EXACTLY what was pinned — the evidence versions (the series
 *   assembled at the pinned cut-offs; each version used must be one the set pinned, with the same digest), the graph AS OF the pinned
 *   cut-off, the pinned twin version — re-assembles the manifest under the pins (revision head, policy, the twin's served mode), re-runs
 *   the method (the forecast-environment register's compute), and compares: manifest digest, output digest, environment. The port derives
 *   REPRODUCED | DIVERGED; what diverged is named; an environment that differs is REPORTED (environment_match, and which facts), never
 *   hidden. Beside it, the FRESH grounding — what a grounding at the database's instant would pin (its revision head, its digest, what it
 *   differs in) — reported, never substituted: after a later graph commit the replay is unchanged while a fresh grounding differs.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { environmentDifferences, forecastEnvironment, registeredForecastMethod } from '../../shared/forecast-environment.js';
import type { ForecastWrites } from '../prediction.capabilities.js';
import { ForecastingService, HORIZONS, type IssueArgs } from '../forecasting/forecasting.service.js';
import { SeriesService, cadenceOf, stepsFor, dayOf, type AssembledSeries, type Reader } from '../series/series.service.js';
import { HOLT_WINTERS, MODEL_VERSION, SEASONAL_NAIVE } from '../models/models.js';
import { ASSEMBLER_VERSION, assembleManifest, compareManifests, outputDigest, pinsOf, type Divergence, type Manifest } from './assembler.js';
import { PDP_BUNDLE_VERSION, freezeWith } from './context-freezer.js';
import { ContextCapability, type ContextReads, type FreezeWrites, type ReplayWrites } from './context.capabilities.js';
import { registerLegacyMethods } from './legacy-methods.js';

type Row = Record<string, unknown>;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
const rec = (v: unknown): Row | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null);

/** What the grounded issue's write handler receives: the forecast capability and the context capability, on ONE transaction. */
export interface GroundedIssueCaps { forecast: ForecastWrites; context: FreezeWrites }

@Injectable()
export class ContextService {
  constructor(private readonly series: SeriesService, private readonly forecasting: ForecastingService) { registerLegacyMethods(); }

  /** The method the issue's leash will choose for this request — computed exactly as ForecastingService.issue chooses it. */
  private async leashMethod(cap: ForecastWrites, reader: Reader, a: { seriesKey: string; horizonCode: string; knownAt: string; observedThrough: string | null; method?: string; assembled?: AssembledSeries }): Promise<string> {
    if (a.method !== undefined) return a.method;
    const assembled = a.assembled ?? await this.series.assemble(reader, a.seriesKey, a.knownAt, a.observedThrough);   // B25 act-found: the route's pre-assembly
    const originAt = assembled.points[assembled.points.length - 1]?.date;
    if (originAt === undefined) return SEASONAL_NAIVE;
    const applicable = await this.forecasting.applicableBacktests(cap, { seriesKey: a.seriesKey, horizonCode: a.horizonCode, knownAt: a.knownAt, originAt });
    const bt = applicable.historical ?? applicable.retrospective;
    return bt !== undefined && bt['t2_met'] === true ? HOLT_WINTERS : SEASONAL_NAIVE;
  }

  /**
   * THE GROUNDED ISSUE (inside the route's write): freeze, then issue through the one issue path with the pins and the environment.
   * Answers the issue's own answer plus the frozen set and the environment.
   */
  async issueGrounded(caps: GroundedIssueCaps, scope: ScopeContext, reader: Reader, a: IssueArgs, actor: string, correlationId: string, purposeId: string, forecastId: string) {
    const tenantId = scope.tenantId as string; const domainId = scope.domainId as string;
    const series = await this.series.registry(caps.forecast, a.seriesKey);
    const frozen = await freezeWith(caps.context, {
      tenantId, domainId, seriesKey: a.seriesKey, subjectEntityId: series?.subject_entity_id ?? null, targetKey: null,
      knownAt: a.knownAt, observedThrough: a.observedThrough, assumptions: a.assumptions, actor, correlationId,
    });
    const method = await this.leashMethod(caps.forecast, reader, a);
    const env = forecastEnvironment(`${method}@${MODEL_VERSION}`, ASSEMBLER_VERSION);
    const environment = { ...env.facts, digest: env.digest };
    const r = await this.forecasting.issue(caps.forecast, scope, reader, {
      ...a, method,
      b25: { columns: { information_set_id: frozen.informationSetId, environment }, payload: { information_set: frozen.summary, environment } },
    }, actor, correlationId, purposeId, forecastId);
    return { ...r, informationSet: frozen.summary, environment };
  }

  /**
   * B25 act-found: THE SERIES A WRITE WILL READ, assembled BEFORE the write opens. A governed write's commit capability lives 60 s; the
   * corridor's real PortWatch history (~8,900 evidence versions, each a governed retrieval) takes minutes, and assembled inside the write it
   * lapsed the capability (the route answered 500). The grounded issue assembles its request; the replay its frozen set's request (read
   * first, under prediction.information_set.read). The write then uses the assembly when it matches exactly (series, known-at, observed-
   * through) and assembles itself otherwise, as before.
   */
  async preAssemble(reader: Reader, seriesKey: string, knownAt: string, observedThrough: string | null): Promise<AssembledSeries> {
    return this.series.assemble(reader, seriesKey, knownAt, observedThrough);
  }
  async preAssembleReplay(reader: Reader, forecastId: string): Promise<AssembledSeries | null> {
    const request = await this.series.readAs(reader, 'prediction.information_set.read', 'FCT', forecastId, ContextCapability.read, async (cap) => {
      const f = (await cap.readForecasts().select(['information_set_id']).where('forecast_id' as never, '=', forecastId as never).executeTakeFirst()) as Row | undefined;
      const setId = (f?.['information_set_id'] as string | null | undefined) ?? null;
      if (setId === null) return null;
      const set = (await cap.readSets().select(['manifest']).where('information_set_id' as never, '=', setId as never).executeTakeFirst()) as Row | undefined;
      return set === undefined ? null : ((set['manifest'] as unknown as Manifest).request ?? null);
    });
    if (request === null) return null;
    return this.series.assemble(reader, request.series_key, request.known_at, request.observed_through);
  }

  /** THE REPLAY of a grounded forecast from its frozen set (inside the route's write; the port records it and derives the outcome). */
  async replay(cap: ReplayWrites, scope: ScopeContext, reader: Reader, forecastId: string, actor: string, correlationId: string, pre: AssembledSeries | null = null): Promise<Row> {
    const tenantId = scope.tenantId as string; const domainId = scope.domainId as string;
    const ids = { tenantId, domainId, actor, eventId: newId(), correlationId };
    const f = (await cap.readForecasts().selectAll().where('forecast_id' as never, '=', forecastId as never).executeTakeFirst()) as Row | undefined;
    const setId = f === undefined ? null : (f['information_set_id'] as string | null);
    const s = setId === null ? undefined : (await cap.readSets().selectAll().where('information_set_id' as never, '=', setId as never).executeTakeFirst()) as Row | undefined;
    if (f === undefined || s === undefined) {
      // The port answers what is missing: an unknown forecast (404) or an ungrounded one (422).
      await cap.recordReplay({ ...ids, replayId: newId(), forecastId, informationSetId: setId, originalManifestDigest: null, replayedManifestDigest: null,
        originalOutputDigest: null, replayedOutputDigest: null, originalEnvironmentDigest: null, replayedEnvironmentDigest: null, diverged: [], fresh: null, detail: {} });
      throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized grounded forecast matches'), 404);
    }
    const frozen = s['manifest'] as unknown as Manifest;
    const diverged: Divergence[] = [];

    // 1. THE MANIFEST, re-assembled from the pinned inputs as of the pinned cut-off (the twin: exactly the pinned version).
    const ctx = await cap.groundingContext({ seriesKey: frozen.request.series_key, knownAt: frozen.request.known_at, assumptions: frozen.request.assumptions,
      twin: frozen.twin === null ? null : { twin_id: frozen.twin.twin_id, version: frozen.twin.version } });
    const replayed = assembleManifest(frozen.request, ctx, { pdpBundle: PDP_BUNDLE_VERSION, pins: pinsOf(frozen) });
    diverged.push(...compareManifests(frozen, replayed.manifest));

    // 2. THE METHOD, re-run on exactly the pinned evidence.
    const methodRef = `${String(f['method'])}@${String(f['method_version'])}`;
    const originalOutput = outputDigest(f['quantiles'], f['path']);
    let replayedOutput: string | null = null; let replayedQuantiles: unknown = null;
    const usePre = pre !== null && pre.series.series_key === frozen.request.series_key && pre.knownAt === frozen.request.known_at && pre.observedThrough === frozen.request.observed_through;
    const assembled = usePre ? pre : await this.series.assemble(reader, frozen.request.series_key, frozen.request.known_at, frozen.request.observed_through);   // B25 act-found
    const pinned = new Set(frozen.evidence.map((e) => `${String(e['evidence_object_id'])}@${String(e['evidence_version'])}:${String(e['evidence_digest'])}`));
    const strays = assembled.evidence.filter((e) => !pinned.has(`${e.evidence_object_id}@${e.evidence_version}:${e.evidence_digest}`));
    if (!assembled.complete) diverged.push({ what: 'evidence.readable', note: `${assembled.unreadable.length} pinned evidence version(s) could not be read by this reader now`, replayed: assembled.unreadable.slice(0, 5) });
    if (strays.length > 0) diverged.push({ what: 'evidence.pinned', note: 'the series read evidence the set did not pin', replayed: strays.slice(0, 5) });
    const reg = registeredForecastMethod(methodRef);
    if (reg?.compute === null || reg?.compute === undefined) {
      diverged.push({ what: 'output', note: `method ${methodRef} has no registered deterministic compute in this process; its output is not recomputed` });
    } else if (assembled.points.length >= 8) {
      const cadence = cadenceOf(assembled.points);
      const steps = stepsFor(Number(f['horizon_days'] ?? HORIZONS[String(f['horizon_code'])]), cadence);
      const season = cadence === 'daily' ? Number(assembled.series.seasonality_days) : 1;
      const out = reg.compute(assembled.points.map((p) => ({ date: p.date, value: p.value })), steps, season);
      replayedOutput = outputDigest(out.quantiles, out.path); replayedQuantiles = out.quantiles;
      const origin = assembled.points[assembled.points.length - 1]?.date ?? null;
      if (origin !== dayOf(f['origin_at'])) diverged.push({ what: 'origin', original: dayOf(f['origin_at']), replayed: origin });
      if (replayedOutput !== originalOutput) diverged.push({ what: 'output', original: f['quantiles'], replayed: out.quantiles });
    } else {
      diverged.push({ what: 'output', note: `only ${assembled.points.length} observation(s) were readable at the pinned cut-offs; the method was not re-run` });
    }

    // 3. THE ENVIRONMENT, compared and reported.
    const env = forecastEnvironment(methodRef, ASSEMBLER_VERSION);
    const environment = { ...env.facts, digest: env.digest };
    const original = rec(f['environment']);
    const envDiff = environmentDifferences(original, environment as unknown as Row);

    // 4. THE FRESH GROUNDING at the database's instant — reported beside the replay, never substituted for it.
    const now = await cap.dbNow();
    const freshCtx = await cap.groundingContext({ seriesKey: frozen.request.series_key, knownAt: now, assumptions: frozen.request.assumptions, twin: null });
    const fresh = assembleManifest({ ...frozen.request, known_at: now }, freshCtx, { pdpBundle: PDP_BUNDLE_VERSION });
    const freshDiff = compareManifests(frozen, fresh.manifest, ['request']);
    const freshReport = { known_at: now, revision_head: fresh.manifest.graph.revision_head, manifest_digest: fresh.digest, differs: freshDiff.length > 0,
                          what: freshDiff.map((d) => d.what), twin: fresh.manifest.twin === null ? null : { twin_id: fresh.manifest.twin.twin_id, version: fresh.manifest.twin.version } };

    const row = await cap.recordReplay({
      ...ids, replayId: newId(), forecastId, informationSetId: setId,
      originalManifestDigest: String(s['manifest_digest']), replayedManifestDigest: replayed.digest,
      originalOutputDigest: originalOutput, replayedOutputDigest: replayedOutput,
      originalEnvironmentDigest: (f['environment_digest'] as string | null) ?? null, replayedEnvironmentDigest: env.digest,
      diverged, fresh: freshReport,
      detail: { method_ref: methodRef, assembler_version: ASSEMBLER_VERSION, environment_differences: envDiff, pinned: { revision_head: frozen.graph.revision_head,
                twin: frozen.twin === null ? null : { twin_id: frozen.twin.twin_id, version: frozen.twin.version }, known_at: frozen.request.known_at },
                replayed_quantiles: replayedQuantiles },
    });
    return {
      ...row, forecastId, informationSetId: setId, outcome: row['outcome'], diverged,
      manifest: { original: s['manifest_digest'], replayed: replayed.digest }, output: { original: originalOutput, replayed: replayedOutput },
      environment: { original: f['environment_digest'] ?? null, replayed: env.digest, match: envDiff.length === 0, differences: envDiff },
      fresh: freshReport,
    };
  }

  /* ───────────────────────── reads (prediction.information_set.read) ───────────────────────── */

  async listSets(cap: ContextReads, a: { seriesKey: string | null; limit: number }): Promise<Row[]> {
    let q = cap.readSets().select(['information_set_id', 'series_key', 'subject_entity_id', 'target_key', 'known_at', 'observed_through', 'manifest_digest',
      'assembler_version', 'revision_head', 'twin_id', 'twin_version', 'frozen_via', 'frozen_by', 'frozen_at', 'coverage_gaps']);
    if (a.seriesKey !== null) q = q.where('series_key' as never, '=', a.seriesKey as never);
    const rows = (await q.orderBy('frozen_at' as never, 'desc').limit(Math.max(1, Math.min(a.limit, 200))).execute()) as Row[];
    return rows.map((r) => ({ ...r, known_at: iso(r['known_at']), frozen_at: iso(r['frozen_at']), observed_through: dayOf(r['observed_through']) }));
  }

  async getSet(cap: ContextReads, setId: string, correlationId: string): Promise<Row> {
    const s = (await cap.readSets().selectAll().where('information_set_id' as never, '=', setId as never).executeTakeFirst()) as Row | undefined;
    if (s === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized information set matches'), 404);
    const events = (await cap.readSetEvents().selectAll().where('information_set_id' as never, '=', setId as never).orderBy('occurred_at' as never).execute()) as Row[];
    const forecasts = (await cap.readForecasts().select(['forecast_id', 'horizon_code', 'method', 'method_version', 'state', 'validation_state', 'label', 'environment_digest', 'known_at'])
      .where('information_set_id' as never, '=', setId as never).orderBy('forecast_id' as never).execute()) as Row[];
    const replays = (await cap.readReplays().selectAll().where('information_set_id' as never, '=', setId as never).orderBy('replayed_at' as never, 'desc').execute()) as Row[];
    return { ...s, known_at: iso(s['known_at']), frozen_at: iso(s['frozen_at']), observed_through: dayOf(s['observed_through']),
             events: events.map((e) => ({ ...e, occurred_at: iso(e['occurred_at']) })),
             forecasts: forecasts.map((x) => ({ ...x, known_at: iso(x['known_at']) })),
             replays: replays.map((x) => ({ ...x, replayed_at: iso(x['replayed_at']) })) };
  }

  /** THE GROUNDING of a forecast (the page's read): the forecast, its environment, the set it pins with the manifest, its replays. */
  async grounding(cap: ContextReads, forecastId: string, correlationId: string): Promise<Row> {
    const f = (await cap.readForecasts().selectAll().where('forecast_id' as never, '=', forecastId as never).executeTakeFirst()) as Row | undefined;
    if (f === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized forecast matches'), 404);
    const forecast = {
      forecast_id: f['forecast_id'], series_key: f['series_key'], subject_entity_id: f['subject_entity_id'], horizon_code: f['horizon_code'],
      method: f['method'], method_version: f['method_version'], state: f['state'], validation_state: f['validation_state'], validation_note: f['validation_note'],
      label: f['label'], statement: f['statement'], quantiles: f['quantiles'], known_at: iso(f['known_at']), origin_at: dayOf(f['origin_at']),
      target_at: dayOf(f['target_at']), environment: f['environment'] ?? null, environment_digest: f['environment_digest'] ?? null,
      information_set_id: f['information_set_id'] ?? null,
    };
    if (f['information_set_id'] === null || f['information_set_id'] === undefined) {
      return { grounded: false, forecast, set: null, replays: [], note: 'this forecast was issued without a frozen information set: nothing pins the graph revision, the twin snapshot or the features it used, and it cannot be replayed' };
    }
    const set = await this.getSet(cap, String(f['information_set_id']), correlationId);
    const replays = (set['replays'] as Row[]).filter((r) => r['forecast_id'] === forecastId);
    return { grounded: true, forecast, set: { ...set, replays: undefined }, replays };
  }
}
