/**
 * FORECASTING — issue, backtest, score, calibrate.
 *
 * A forecast is a CANONICAL OBJECT (FCT) with the 43-column header, and a row in
 * the projection the screens read. It cannot be admitted without its
 * distribution, its drivers, the assumptions it rests on and the evidence under
 * every one of them — T4 is a schema constraint and a table constraint, not a
 * habit.
 *
 * THE MODEL IS ON A LEASH. The learned model is used only when the latest
 * backtest for this series and horizon shows it beat seasonal naive by the T2
 * margin; otherwise the seasonal baseline is issued AS the forecaster and the
 * forecast says so. A forecast is `validated` only by a backtest with real
 * held-out history; a series too short to backtest is `validation_impossible`
 * and the forecast says that too.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { PredictionReads, ForecastWrites, BacktestWrites, OutcomeWrites } from '../prediction.capabilities.js';
import { SeriesService, cadenceOf, stepsFor, dayOf, type AssembledSeries, type Reader } from '../series/series.service.js';
import { forecastWith, seasonalNaive, holtWinters, pinballMean, covered, SEASONAL_NAIVE, HOLT_WINTERS,
  MODEL_VERSION, T1_LOW, T1_HIGH, T2_SKILL, type ForecastOutput } from '../models/models.js';
import type { Controls } from '../controls.js';

export const HORIZONS: Readonly<Record<string, number>> = Object.freeze({
  '30d': 30, '90d': 90, '180d': 180, '1y': 365, '3y': 1095, '5y': 1825,
});

/** Below this many observations, no backtest can say anything (§9). */
export const MIN_HISTORY_FOR_BACKTEST = 400;
export const MIN_ORIGINS = 20;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const round = (x: number, p = 4): number => Number(x.toFixed(p));

export interface IssueArgs {
  seriesKey: string; horizonCode: string; knownAt: string; observedThrough: string | null;
  assumptions: string[]; refreshCadence: string; label: 'replay demonstration' | 'live';
  method?: string;
}

export type BacktestMode = 'retrospective' | 'historical';

@Injectable()
export class ForecastingService {
  constructor(private readonly series: SeriesService) {}

  /**
   * The backtest that APPLIES to a forecast: same series, horizon and method
   * version; computed on evidence known no later than the forecast's own cut-off;
   * over history that ends no later than the forecast's origin; with enough
   * origins. The latest such record per mode. A backtest over a later, longer
   * history says nothing about a forecast fitted on an early slice of it.
   */
  async applicableBacktests(
    cap: PredictionReads, a: { seriesKey: string; horizonCode: string; knownAt: string; originAt: string },
  ): Promise<{ historical: Record<string, unknown> | undefined; retrospective: Record<string, unknown> | undefined }> {
    const rows = (await cap.readBacktests().selectAll()
      .where('series_key' as never, '=', a.seriesKey as never)
      .where('horizon_code' as never, '=', a.horizonCode as never)
      .where('method_version' as never, '=', MODEL_VERSION as never)
      .orderBy('computed_at' as never, 'desc').limit(50)
      .execute()) as Array<Record<string, unknown>>;
    const applies = (b: Record<string, unknown>): boolean => {
      const knownAt = b['known_at'] ?? b['computed_at'];
      const windowTo = dayOf(b['window_to']);
      return Number(b['origins']) >= MIN_ORIGINS
        && new Date(String(knownAt)).getTime() <= new Date(a.knownAt).getTime()
        && windowTo !== null && windowTo <= a.originAt;
    };
    return {
      historical: rows.find((b) => b['mode'] === 'historical' && applies(b)),
      retrospective: rows.find((b) => (b['mode'] ?? 'retrospective') === 'retrospective' && applies(b)),
    };
  }

  /**
   * Fit and issue. The history is assembled through the known-at path; the
   * method is chosen by the backtest record, never by preference.
   */
  async issue(
    cap: ForecastWrites, ctx: ScopeContext, reader: Reader, a: IssueArgs, actor: string, correlationId: string, purposeId: string,
    /** Minted by the caller: the capability is bound to exactly this object before the transaction opens. */
    forecastId: string = newId(),
  ): Promise<{ forecastId: string; method: string; validationState: string; validationNote: string; backtestId: string | null; controls: Controls; quantiles: Record<string, number>; statement: string; targetAt: string }> {
    const horizonDays = HORIZONS[a.horizonCode];
    if (horizonDays === undefined) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId,
        `horizon must be one of ${Object.keys(HORIZONS).join(', ')}`), 422);
    }
    if (a.assumptions.length === 0) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId,
        'a forecast must name at least one assumption it rests on; one that rests on nothing can never be reached by a correction'), 422);
    }
    const assembled = await this.series.assemble(reader, a.seriesKey, a.knownAt, a.observedThrough);
    if (!assembled.complete) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `${assembled.unreadable.length} evidence version(s) of ${a.seriesKey} could not be read by this reader `
        + `(${assembled.unreadable.map((u) => u.reason).slice(0, 2).join('; ')}); a forecast on an incomplete history is refused`), 409);
    }
    if (assembled.points.length < 8) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `series ${a.seriesKey} has ${assembled.points.length} observation(s) known at ${a.knownAt}; a forecast needs at least 8`), 422);
    }
    const cadence = cadenceOf(assembled.points);
    const steps = stepsFor(horizonDays, cadence);
    const m = cadence === 'daily' ? assembled.series.seasonality_days : 1;
    const originAt = assembled.points[assembled.points.length - 1]?.date as string;
    const targetAt = addDays(originAt, horizonDays);

    /*
     * THE LEASH, BOUND TO THE APPLICABLE RECORD. The learned model is used only
     * when a backtest that APPLIES to this forecast — same series, horizon and
     * method version, evidence known by this cut-off, history ending by this
     * origin — says it beat the baseline by the T2 margin. An explicit request
     * for the learned model is subject to the same rule; asking is not earning.
     */
    const applicable = await this.applicableBacktests(cap, { seriesKey: a.seriesKey, horizonCode: a.horizonCode, knownAt: a.knownAt, originAt });
    const bt = applicable.historical ?? applicable.retrospective;
    const learnedEarnedIt = bt !== undefined && bt['t2_met'] === true;
    if (a.method !== undefined && a.method !== SEASONAL_NAIVE && a.method !== HOLT_WINTERS) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, `method must be ${SEASONAL_NAIVE} or ${HOLT_WINTERS}`), 422);
    }
    if (a.method === HOLT_WINTERS && !learnedEarnedIt) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId,
        bt === undefined
          ? `${HOLT_WINTERS} was requested but no applicable backtest exists for ${a.seriesKey} at ${a.horizonCode} on this history; the learned model has not earned the forecast`
          : `${HOLT_WINTERS} was requested but the applicable backtest records T2 NOT met; the seasonal baseline is the forecaster`), 422);
    }
    const method = a.method ?? (learnedEarnedIt ? HOLT_WINTERS : SEASONAL_NAIVE);
    const out = forecastWith(method, assembled.points, steps, m);

    // VALIDATION STATE, from the applicable record and nothing else. `validated`
    // needs a HISTORICAL-mode backtest (each origin read only what was recorded
    // by then); a retrospective one (one evidence vintage, cut by publisher date)
    // earns `validated_retrospective`, which says exactly what it is. Either way
    // the method actually issued must have met T1 with its own band.
    let validationState: string; let validationNote: string;
    const ownCoverage = bt === undefined ? null
      : method === SEASONAL_NAIVE ? Number(bt['baseline_coverage_80']) : Number(bt['coverage_80']);
    const ownT1 = ownCoverage !== null && Number.isFinite(ownCoverage) && ownCoverage >= T1_LOW && ownCoverage <= T1_HIGH;
    const approximated = out.errorsUsed === 0 || (Number(out.parameters['intervalBasisStep'] ?? steps) < steps)
      ? ` The 10–90 band is APPROXIMATED from ${out.errorsUsed} ${String(out.parameters['intervalBasisStep'] ?? '?')}-step error(s) scaled to the horizon, not measured at it.` : '';
    const describe = (b: Record<string, unknown>): string =>
      `backtested (${String(b['mode'] ?? 'retrospective')}) on ${String(b['origins'])} rolling origins (${dayOf(b['window_from'])} → ${dayOf(b['window_to'])}, `
      + `evidence known at ${String(b['known_at'] ?? b['computed_at'])}): ${method} 80% coverage ${fmtPct(ownCoverage)}; learned model pinball `
      + `${fmtNum(b['pinball_mean'])} vs seasonal naive ${fmtNum(b['baseline_pinball_mean'])} (T2 ${b['t2_met'] === true ? 'met' : 'NOT met'})`;
    if (bt !== undefined && ownT1) {
      validationState = bt['mode'] === 'historical' ? 'validated' : 'validated_retrospective';
      validationNote = `${describe(bt)} (T1 met).`
        + (bt['mode'] === 'historical' ? '' : ' RETROSPECTIVE: one evidence vintage cut by publisher date; publisher revisions before that vintage are not distinguishable, so this is retrospective analysis, not historical-knowledge validation.')
        + approximated;
    } else if (bt !== undefined) {
      validationState = 'unvalidated';
      validationNote = `${describe(bt)} but the band of ${method} is MIS-CALIBRATED: 80% coverage ${fmtPct(ownCoverage)}, outside the 75–85% T1 band. Not presented as validated.` + approximated;
    } else if (assembled.points.length < MIN_HISTORY_FOR_BACKTEST) {
      validationState = 'validation_impossible';
      validationNote = `${assembled.points.length} observation(s) are known for this series at this cut-off; a backtest needs at least `
        + `${MIN_HISTORY_FOR_BACKTEST}. Forecast quality CANNOT be established on this history and no accuracy is claimed` + approximated;
    } else {
      validationState = 'unvalidated';
      validationNote = 'no backtest applies to this series, horizon, cut-off and history; the numbers below are unscored' + approximated;
    }

    const skill = bt === undefined ? null : {
      backtest_id: bt['backtest_id'], mode: bt['mode'] ?? 'retrospective', coverage_80: bt['coverage_80'],
      baseline_coverage_80: bt['baseline_coverage_80'], pinball_mean: bt['pinball_mean'],
      baseline_pinball_mean: bt['baseline_pinball_mean'], skill_vs_baseline: bt['skill_vs_baseline'],
      t1_met: bt['t1_met'], t2_met: bt['t2_met'],
    };
    const controls: Controls = assembled.controls;
    const drivers = [{
      series_key: a.seriesKey, role: 'the series itself, fitted on its own history', share: 1,
      evidence_object_id: assembled.points[assembled.points.length - 1]?.evidence_object_id,
      evidence_version: assembled.points[assembled.points.length - 1]?.evidence_version,
      evidence_digest: assembled.points[assembled.points.length - 1]?.evidence_digest,
      attribution: assembled.attribution,
    }];
    const fallback = method === SEASONAL_NAIVE && !learnedEarnedIt
      ? ' The seasonal baseline is the forecaster: the learned model has not beaten it by 15% on this series and horizon.'
      : '';
    const statement = `${a.seriesKey} at ${a.horizonCode} (${targetAt}): median ${fmtNum(out.quantiles.q50)} ${assembled.series.unit}, `
      + `10–90 band ${fmtNum(out.quantiles.q10)}–${fmtNum(out.quantiles.q90)}; ${method}@${MODEL_VERSION} on `
      + `${assembled.points.length} observation(s) known at ${a.knownAt} (last ${originAt}); ${validationState.replace(/_/g, ' ')}.`
      + fallback + (a.label === 'replay demonstration' ? ' REPLAY DEMONSTRATION — not a live forecast.' : '')
      + (controls.synthetic_state ? ' SYNTHETIC: at least one evidence version it rests on is synthetic.' : '');

    const now = new Date().toISOString();
    const payload = {
      series_key: a.seriesKey, subject_entity_id: assembled.series.subject_entity_id,
      horizon: { code: a.horizonCode, days: horizonDays },
      origin_at: originAt, known_at: a.knownAt, target_at: targetAt,
      method: { name: method, version: MODEL_VERSION, parameters: out.parameters },
      baseline_method: SEASONAL_NAIVE,
      distribution: { q10: round(out.quantiles.q10), q50: round(out.quantiles.q50), q90: round(out.quantiles.q90),
                      unit: assembled.series.unit, path: out.path.map((p) => ({ ...p, q10: round(p.q10), q50: round(p.q50), q90: round(p.q90) })) },
      drivers, assumptions: a.assumptions,
      evidence: assembled.evidence.map((e) => ({ evidence_object_id: e.evidence_object_id, evidence_version: e.evidence_version, evidence_digest: e.evidence_digest })),
      refresh_cadence: a.refreshCadence,
      validation: { state: validationState, note: validationNote, backtest_id: bt?.['backtest_id'] ?? null, skill },
      label: a.label, statement,
      narrative: null,
      controls,
    };
    const header: CanonicalHeader = {
      object_id: forecastId, object_type: 'FCT', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-PRD-01',
      accountable_owner: `principal:${actor}`,
      source_object_ids: assembled.evidence.slice(0, 64).map((e) => `EVD:${e.evidence_object_id}@${e.evidence_version}`),
      event_time: `${targetAt}T00:00:00.000Z`, observation_time: now, valid_from: `${originAt}T00:00:00.000Z`,
      valid_to: `${targetAt}T00:00:00.000Z`, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
      // INHERITED, NOT DECLARED: the caller's label says what the demonstration is;
      // the evidence says what the forecast is made of.
      truth_state: 'inferred', synthetic_state: controls.synthetic_state,
      confidence: null, uncertainty: { q10: round(out.quantiles.q10), q50: round(out.quantiles.q50), q90: round(out.quantiles.q90) },
      evidence_refs: assembled.evidence.slice(0, 64).map((e) => `EVD:${e.evidence_object_id}@${e.evidence_version}`),
      provenance_ref: `series:${a.seriesKey}`, method_ref: `${method}@${MODEL_VERSION}`,
      contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: controls.classification,
      purpose_scope: purposeId, rights_profile: controls.rights_profile ?? assembled.attribution,
      residency_profile: controls.residency_profile, retention_profile: controls.retention_profile,
      access_policy_ref: controls.access_policy_ref, quality_profile: null, quality_state: { validation: validationState },
      freshness_state: { freshest_evidence_recorded_at: assembled.freshestRecordedAt, origin_at: originAt },
      schema_ref: 'FCT@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
      audit_correlation_id: correlationId, content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `forecast header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.issueForecast({
      forecastId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, seriesKey: a.seriesKey,
      subjectEntityId: assembled.series.subject_entity_id, horizonCode: a.horizonCode, horizonDays,
      originAt, knownAt: a.knownAt, targetAt, method, methodVersion: MODEL_VERSION, baselineMethod: SEASONAL_NAIVE,
      quantiles: { q10: round(out.quantiles.q10), q50: round(out.quantiles.q50), q90: round(out.quantiles.q90) },
      path: payload.distribution.path, drivers, assumptions: a.assumptions,
      evidenceRefs: payload.evidence, refreshCadence: a.refreshCadence,
      validationState, validationNote, label: a.label, skill, statement,
      backtestId: validationState.startsWith('validated') ? String(bt?.['backtest_id']) : null, controls,
      actor, eventId: newId(), correlationId,
    });
    return { forecastId, method, validationState, validationNote, backtestId: validationState.startsWith('validated') ? String(bt?.['backtest_id']) : null,
             controls, quantiles: { q10: round(out.quantiles.q10), q50: round(out.quantiles.q50), q90: round(out.quantiles.q90) }, statement, targetAt };
  }

  /**
   * ROLLING-ORIGIN BACKTEST of the learned model against seasonal naive.
   *
   * Every origin reads only observations dated at or before it (world time) from
   * evidence known at `knownAt` (record time). Both models forecast the same
   * horizon from the same origins and are scored against the same realised
   * values. The verdict names which target was met and which was not.
   */
  async backtest(
    cap: BacktestWrites, ctx: ScopeContext, reader: Reader,
    a: { seriesKey: string; horizonCode: string; knownAt: string; observedThrough?: string | null; origins?: number; stride?: number; mode?: BacktestMode },
    actor: string, correlationId: string,
  ): Promise<Record<string, unknown>> {
    const horizonDays = HORIZONS[a.horizonCode];
    if (horizonDays === undefined) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, `horizon must be one of ${Object.keys(HORIZONS).join(', ')}`), 422);
    }
    const mode: BacktestMode = a.mode ?? 'retrospective';
    // `observedThrough` cuts the history in world time, so a record can be computed
    // for exactly the history a forecast will be fitted on — that is what makes it applicable.
    const full = await this.series.assemble(reader, a.seriesKey, a.knownAt, a.observedThrough ?? null);
    if (!full.complete) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `${full.unreadable.length} evidence version(s) could not be read by this reader; a backtest on an incomplete history is refused`), 409);
    }
    const cadence = cadenceOf(full.points);
    const steps = stepsFor(horizonDays, cadence);
    const m = cadence === 'daily' ? full.series.seasonality_days : 1;
    const n = full.points.length;
    const wanted = Math.min(a.origins ?? 40, 200);
    const stride = Math.max(1, a.stride ?? Math.max(steps, 7));
    const minTrain = Math.max(4 * Math.max(m, 7), 60);

    const origins: number[] = [];
    for (let o = n - steps - 1; o >= minTrain && origins.length < wanted; o -= stride) origins.push(o);
    origins.reverse();

    const backtestId = newId();
    const record = async (fields: Record<string, unknown>) => cap.recordBacktest({
      backtestId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, seriesKey: a.seriesKey,
      horizonCode: a.horizonCode, horizonDays, method: HOLT_WINTERS, methodVersion: MODEL_VERSION, baselineMethod: SEASONAL_NAIVE,
      windowFrom: full.points[0]?.date ?? '1970-01-01', windowTo: full.points[n - 1]?.date ?? '1970-01-02',
      origins: origins.length, coverage: null, pinball: null, baselineCoverage: null, baselinePinball: null,
      skill: null, t1: null, t2: null, verdict: '', discipline: this.discipline(full, mode), details: {},
      knownAt: a.knownAt, observations: n, mode, actor, correlationId,
      ...fields,
    } as Parameters<BacktestWrites['recordBacktest']>[0]);

    if (n < MIN_HISTORY_FOR_BACKTEST || origins.length < MIN_ORIGINS) {
      const verdict = `CANNOT VALIDATE (${mode}): ${n} observation(s) known and ${origins.length} usable origin(s); a backtest needs `
        + `${MIN_HISTORY_FOR_BACKTEST} observations and ${MIN_ORIGINS} origins. No accuracy is claimed for this series and horizon.`;
      await record({ verdict, details: { observations: n, cadence, steps, reason: 'insufficient history' } });
      return { backtestId, mode, verdict, origins: origins.length, observations: n, t1_met: null, t2_met: null };
    }

    const rows: Array<Record<string, unknown>> = [];
    let cov = 0; let pin = 0; let bcov = 0; let bpin = 0; let usable = 0; let unknowable = 0;
    for (const o of origins) {
      const originDate = full.points[o]?.date as string;
      const actual = full.points[o + steps] as { value: number; date: string };
      let train = full.points.slice(0, o + 1);
      if (mode === 'historical') {
        /*
         * HISTORICAL KNOWLEDGE: this origin sees only evidence RECORDED by the end
         * of its own day, and only observations dated by then. A history backfilled
         * after the fact was recorded later than every origin in it, and such an
         * origin sees NOTHING — which is the truth about what was known then, and
         * why a backfilled series cannot validate historically.
         */
        const then = await this.series.assemble(reader, a.seriesKey, `${originDate}T23:59:59.999Z`, originDate);
        train = then.points;
        if (train.length < minTrain) { unknowable += 1; continue; }
      }
      usable += 1;
      const learned = holtWinters(train, steps, m);
      const naive = seasonalNaive(train, steps, m);
      const c = covered(actual.value, learned.quantiles); const bc = covered(actual.value, naive.quantiles);
      const p = pinballMean(actual.value, learned.quantiles); const bp = pinballMean(actual.value, naive.quantiles);
      cov += c ? 1 : 0; bcov += bc ? 1 : 0; pin += p; bpin += bp;
      rows.push({ origin: train[train.length - 1]?.date, target: actual.date, actual: actual.value, train: train.length,
                  learned: learned.quantiles, naive: naive.quantiles, covered: c, baseline_covered: bc,
                  pinball: round(p), baseline_pinball: round(bp) });
    }
    if (usable < MIN_ORIGINS) {
      const verdict = `CANNOT VALIDATE (${mode}): ${usable} of ${origins.length} origin(s) had enough history recorded by their own day `
        + `(${unknowable} had none — the history was recorded after them). A historical backtest needs ${MIN_ORIGINS} such origins. `
        + 'No accuracy is claimed for this series and horizon under historical knowledge.';
      await record({ verdict, origins: usable, details: { observations: n, cadence, steps, unknowable, reason: 'history recorded after the origins' } });
      return { backtestId, mode, verdict, origins: usable, observations: n, unknowable, t1_met: null, t2_met: null };
    }
    const k = usable;
    const coverage = cov / k; const bcoverage = bcov / k;
    const pinball = pin / k; const bpinball = bpin / k;
    const skill = bpinball === 0 ? 0 : 1 - pinball / bpinball;
    const t1 = coverage >= T1_LOW && coverage <= T1_HIGH;
    const t2 = skill >= T2_SKILL;
    const verdict = `${k} origins (${mode}), ${a.horizonCode}: learned ${HOLT_WINTERS} coverage ${fmtPct(coverage)} (T1 ${t1 ? 'met' : 'NOT met'}, band 75–85%), `
      + `pinball ${fmtNum(pinball)} vs seasonal naive ${fmtNum(bpinball)} → skill ${fmtPct(skill)} (T2 ${t2 ? 'met' : 'NOT met'}, bar 15%). `
      + (t2 ? 'The learned model has earned the forecast.' : 'The seasonal baseline is the forecaster until the learned model beats it.');
    await record({
      windowFrom: full.points[origins[0] as number]?.date ?? full.points[0]?.date ?? '1970-01-01',
      origins: k, coverage: round(coverage), pinball: round(pinball), baselineCoverage: round(bcoverage),
      baselinePinball: round(bpinball), skill: round(skill), t1, t2, verdict,
      details: { observations: n, cadence, steps, season: m, stride, unknowable, rows: rows.slice(-60) },
    });
    return { backtestId, mode, verdict, origins: k, observations: n, coverage_80: round(coverage), pinball_mean: round(pinball),
             baseline_coverage_80: round(bcoverage), baseline_pinball_mean: round(bpinball), skill_vs_baseline: round(skill),
             t1_met: t1, t2_met: t2, discipline: this.discipline(full, mode) };
  }

  private discipline(s: AssembledSeries, mode: BacktestMode): string {
    return mode === 'historical'
      ? `HISTORICAL KNOWLEDGE: every origin read only evidence versions recorded by the end of its own day, and only observations dated by then; `
        + `scored against the value known at ${s.knownAt}. An origin whose history was recorded after it is counted as unknowable, not fitted.`
      : `RETROSPECTIVE: one evidence vintage known at ${s.knownAt} (${s.evidence.length} version(s), freshest recorded ${s.freshestRecordedAt ?? 'n/a'}), `
        + 'cut by publisher date at each origin. Publisher revisions before that vintage are not distinguishable from the series as first published, '
        + 'so this measures the method on the series as known now — retrospective analysis, not historical-knowledge validation.';
  }

  /**
   * Score a forecast against what the series says its target day turned out to be.
   *
   * NEVER BEFORE THE TARGET. The reader must be positioned after the target
   * day, and the observation must be the target day's own — or, for a series
   * the publisher does not publish every calendar day, the last published
   * observation within three days before it, taken only once a LATER observation
   * proves the calendar moved on. The day actually observed and the reason for
   * any substitution are persisted with the score.
   */
  async recordOutcome(
    cap: OutcomeWrites, ctx: ScopeContext, reader: Reader, forecastId: string, knownAt: string, actor: string, correlationId: string,
  ): Promise<Record<string, unknown>> {
    const f = (await cap.readForecasts().selectAll()
      .where('forecast_id' as never, '=', forecastId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (f === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized forecast matches'), 404);
    const target = dayOf(f['target_at']);
    if (target === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'the forecast has no target day'), 409);
    if (knownAt.slice(0, 10) <= target) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `the target day ${target} has not passed at ${knownAt}; the outcome cannot be scored yet`), 409);
    }
    // Read a little PAST the target so a later observation can prove the calendar moved on.
    const assembled = await this.series.assemble(reader, String(f['series_key']), knownAt, addDays(target, 7));
    if (!assembled.complete) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `${assembled.unreadable.length} evidence version(s) could not be read by this reader; the outcome is not scored on an incomplete history`), 409);
    }
    const exact = assembled.points.find((p) => p.date === target);
    let point = exact; let substitution = 'none';
    if (point === undefined) {
      const cadence = cadenceOf(assembled.points);
      const later = assembled.points.some((p) => p.date > target);
      const before = [...assembled.points].reverse().find((p) => p.date < target && p.date >= addDays(target, -3));
      if (cadence === 'business' && later && before !== undefined) {
        point = before;
        substitution = `previous published observation (${before.date}): the publisher does not publish on ${target}`;
      }
    }
    if (point === undefined) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `no observation on ${target} is known at ${knownAt}, and no admissible substitution exists; the outcome cannot be scored yet`), 409);
    }
    const outcomeId = newId();
    await cap.recordOutcome({
      outcomeId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, forecastId, observed: point.value,
      evidenceObjectId: point.evidence_object_id, evidenceVersion: point.evidence_version, evidenceDigest: point.evidence_digest,
      knownAt, observedOn: point.date, substitution, actor, eventId: newId(), correlationId,
    });
    const q = f['quantiles'] as { q10: number; q50: number; q90: number };
    return { outcomeId, forecastId, target, observedOn: point.date, observed: point.value, substitution,
             covered: covered(point.value, q), pinball_mean: round(pinballMean(point.value, q)) };
  }

  /**
   * CALIBRATION — the track record, by horizon and method, from the ledger and
   * the backtests. When there is nothing to score it says so in words.
   */
  async calibration(cap: PredictionReads): Promise<Record<string, unknown>> {
    const outcomes = (await cap.readOutcomes().selectAll().execute()) as Array<Record<string, unknown>>;
    const backtests = (await cap.readBacktests().selectAll().orderBy('computed_at' as never, 'desc').execute()) as Array<Record<string, unknown>>;
    const groups = new Map<string, { n: number; covered: number; pinball: number; label: Set<string> }>();
    for (const o of outcomes) {
      const key = `${String(o['series_key'])}|${String(o['horizon_code'])}|${String(o['method'])}`;
      const g = groups.get(key) ?? { n: 0, covered: 0, pinball: 0, label: new Set<string>() };
      g.n += 1; g.covered += o['covered'] === true ? 1 : 0; g.pinball += Number(o['pinball_mean']); g.label.add(String(o['label']));
      groups.set(key, g);
    }
    const scored = [...groups.entries()].map(([key, g]) => {
      const [series_key, horizon_code, method] = key.split('|');
      return { series_key, horizon_code, method, outcomes: g.n, coverage_80: round(g.covered / g.n),
               pinball_mean: round(g.pinball / g.n), labels: [...g.label],
               t1_met: g.n >= MIN_ORIGINS ? (g.covered / g.n >= T1_LOW && g.covered / g.n <= T1_HIGH) : null };
    });
    const latestByKey = new Map<string, Record<string, unknown>>();
    for (const b of backtests) {
      // The latest record PER MODE: a historical verdict does not hide the retrospective one, or vice versa.
      const key = `${String(b['series_key'])}|${String(b['horizon_code'])}|${String(b['mode'] ?? 'retrospective')}`;
      if (!latestByKey.has(key)) latestByKey.set(key, b);
    }
    const emptyStatement = outcomes.length === 0
      ? 'No forecast has been scored against an outcome yet: no issued horizon has elapsed against a recorded observation. '
        + 'The calibration numbers below come from BACKTESTS on held-out history, not from live outcomes, and say so.'
      : `${outcomes.length} outcome(s) scored across ${scored.length} series/horizon/method group(s).`;
    return {
      statement: emptyStatement,
      outcomes: scored,
      backtests: [...latestByKey.values()].map((b) => ({
        backtest_id: b['backtest_id'], series_key: b['series_key'], horizon_code: b['horizon_code'], method: b['method'],
        baseline_method: b['baseline_method'], origins: b['origins'], coverage_80: b['coverage_80'], pinball_mean: b['pinball_mean'],
        baseline_coverage_80: b['baseline_coverage_80'], baseline_pinball_mean: b['baseline_pinball_mean'],
        skill_vs_baseline: b['skill_vs_baseline'], t1_met: b['t1_met'], t2_met: b['t2_met'], verdict: b['verdict'],
        window_from: b['window_from'], window_to: b['window_to'], computed_at: b['computed_at'],
        mode: b['mode'] ?? 'retrospective', known_at: b['known_at'] ?? null, observations: b['observations'] ?? null,
        discipline: b['discipline'],
      })),
      targets: { T1: 'the 10–90 interval contains the outcome 80% ± 5pp', T2: '≥15% lower pinball loss than seasonal naive at the 30-day horizon',
                 T3: 'the warning fires before the decision window closes in ≥80% of replayed disruption episodes',
                 T4: '100% of shown forecasts carry distribution, drivers, assumptions and evidence — enforced at admission' },
    };
  }

  async list(cap: PredictionReads, limit = 100, seriesKey: string | null = null): Promise<Array<Record<string, unknown>>> {
    let q = cap.readForecasts().selectAll().orderBy('issued_at' as never, 'desc').limit(Math.min(limit, 500));
    if (seriesKey !== null) q = q.where('series_key' as never, '=', seriesKey as never);
    return (await q.execute()) as Array<Record<string, unknown>>;
  }

  async get(cap: PredictionReads, forecastId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap.readForecasts().selectAll()
      .where('forecast_id' as never, '=', forecastId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
  }

  async events(cap: PredictionReads, forecastId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap.readForecastEvents().selectAll()
      .where('forecast_id' as never, '=', forecastId as never).orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
  }

  /** The forecasts as they were KNOWN at an instant: issued by then, by their record time. */
  async knownAt(cap: PredictionReads, knownAt: string, limit = 100): Promise<Array<Record<string, unknown>>> {
    const rows = (await cap.readForecasts().selectAll()
      .where('issued_at' as never, '<=', knownAt as never)
      .orderBy('issued_at' as never, 'desc').limit(Math.min(limit, 500)).execute()) as Array<Record<string, unknown>>;
    return rows;
  }
}

function fmtNum(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? n.toFixed(4).replace(/\.?0+$/, '') : 'n/a'; }
function fmtPct(v: unknown): string { const n = Number(v); return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : 'n/a'; }
export { ForecastOutput };
