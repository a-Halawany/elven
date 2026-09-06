/**
 * Prediction API — the surface the Forecasts, Scenarios, Warnings and
 * Calibration screens render.
 *
 * The rules of every earlier phase hold: a route returns the state the SERVER
 * committed with its receipt, never a prediction of its own; a denied object
 * answers as an absent one; and every answer that depends on an instant carries
 * that instant.
 *
 * One rule is this phase's own: A FORECAST SAYS WHAT IT IS ALLOWED TO CLAIM.
 * Every forecast answer carries its `validation_state`, its `label` and its
 * validation note verbatim from the record, and a replay demonstration or an
 * unvalidated forecast is never presented as anything else.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { PredictionCapability } from './prediction.capabilities.js';
import { SeriesService, type Reader } from './series/series.service.js';
import { ForecastingService, HORIZONS } from './forecasting/forecasting.service.js';
import { ScenariosService, validateScenario } from './scenarios/scenarios.service.js';
import { PARSERS } from './series/parsers.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  }
  return { envelope, principal };
}

const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({
  policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq,
});

function instant(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

function day(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction')
export class PredictionController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly series: SeriesService,
    private readonly forecasting: ForecastingService,
    private readonly scenarios: ScenariosService,
  ) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  private reader(req: EyeRequest, tenantId: string, domainId: string): Reader {
    const { envelope, principal } = ctx(req);
    return { principal, tenantId, domainId, correlationId: envelope.correlation_id, purposeId: envelope.purpose_id ?? 'prediction' };
  }

  // ───────────────────────── series ─────────────────────────

  @Post('/series/register')
  async registerSeries(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Body() body: { payload?: {
      seriesKey?: string; sourceKey?: string; parserRef?: string; valueField?: string; selector?: string | null;
      unit?: string; seasonalityDays?: number; subjectEntityId?: string | null; attribution?: string | null; description?: string;
      publicationCalendar?: { rule?: string; closures?: unknown; authority?: string } | null;
    } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const cal = p.publicationCalendar ?? null;
    if (cal !== null) {
      const closures = cal.closures ?? [];
      if ((cal.rule !== 'daily' && cal.rule !== 'business-days') || typeof cal.authority !== 'string' || cal.authority.trim().length < 8
        || !Array.isArray(closures) || !closures.every((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) {
        throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
          "publicationCalendar must be { rule: 'daily' | 'business-days', closures: [YYYY-MM-DD...], authority: <who attests it, ≥ 8 chars> }"), 400);
      }
    }
    for (const k of ['seriesKey', 'sourceKey', 'parserRef', 'valueField', 'unit', 'description'] as const) {
      if (typeof p[k] !== 'string' || (p[k] as string).trim().length < 2) {
        throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `${k} is required`), 400);
      }
    }
    if (PARSERS[p.parserRef as string] === undefined) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        `parserRef must be one of ${Object.keys(PARSERS).join(', ')} — a series is read by a registered deterministic parser, never by a model`), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'prediction.series.register', 'SER', null),
      PredictionCapability.series,
      async (cap, scope) => {
        await cap.registerSeries({
          tenantId: scope.tenantId as string, domainId: scope.domainId as string, seriesKey: p.seriesKey as string,
          sourceKey: p.sourceKey as string, parserRef: p.parserRef as string, valueField: p.valueField as string,
          selector: p.selector ?? null, unit: p.unit as string, seasonalityDays: p.seasonalityDays ?? 1,
          subjectEntityId: p.subjectEntityId ?? null, attribution: p.attribution ?? null, description: p.description as string,
          publicationCalendar: cal === null ? null
            : { rule: cal.rule as 'daily' | 'business-days', closures: (cal.closures ?? []) as string[], authority: cal.authority as string },
          actor: principal.principalId, correlationId: envelope.correlation_id,
        });
        return { result: { seriesKey: p.seriesKey }, targetType: 'SER', targetId: null, targetVersion: '1', outboxEvent: null };
      });
    return { series: out.result, receipt: receipt(out) };
  }

  @Post('/series/list')
  async listSeries(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'SER', null),
      PredictionCapability.read, async (cap) => this.series.listRegistry(cap));
    return { series: out.result, parsers: Object.keys(PARSERS), receipt: receipt(out) };
  }

  /** The series as known at an instant: every point names the evidence it came from. */
  @Post('/series/:seriesKey/points')
  async seriesPoints(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Param('seriesKey') seriesKey: string,
    @Body() body: { payload?: { knownAt?: string; observedThrough?: string; limit?: number } },
  ) {
    const reader = this.reader(req, tenantId, domainId);
    const knownAt = instant(body.payload?.knownAt, new Date().toISOString());
    const assembled = await this.series.assemble(reader, seriesKey, knownAt, day(body.payload?.observedThrough));
    const limit = Math.min(Math.max(1, body.payload?.limit ?? 400), 5000);
    const unreadableNote = assembled.complete ? ''
      : ` INCOMPLETE: ${assembled.unreadable.length} evidence version(s) could not be read by this reader and contributed no points.`;
    return {
      seriesKey, knownAt, observedThrough: assembled.observedThrough,
      unit: assembled.series.unit, attribution: assembled.attribution,
      total: assembled.points.length, points: assembled.points.slice(-limit),
      evidence: assembled.evidence.length, freshestRecordedAt: assembled.freshestRecordedAt,
      complete: assembled.complete, unreadable: assembled.unreadable, controls: assembled.controls,
      note: (assembled.attribution === null ? '' : `${assembled.attribution} Shown as published; the statistics are not modified.`) + unreadableNote || null,
    };
  }

  // ───────────────────────── forecasts ─────────────────────────

  @Post('/forecasts/issue')
  async issueForecast(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Body() body: { payload?: {
      seriesKey?: string; horizon?: string; knownAt?: string; observedThrough?: string; assumptions?: string[];
      refreshCadence?: string; label?: string; method?: string;
    } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.seriesKey !== 'string' || typeof p.horizon !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'seriesKey and horizon are required'), 400);
    }
    if (HORIZONS[p.horizon] === undefined) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `horizon must be one of ${Object.keys(HORIZONS).join(', ')}`), 400);
    }
    const label = p.label === 'live' ? 'live' : 'replay demonstration';
    const reader = this.reader(req, tenantId, domainId);
    // The object id is minted HERE so the capability is bound to exactly the
    // forecast that will be admitted, before the transaction opens.
    const forecastId = newId();
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'prediction.forecast.issue', 'FCT', forecastId),
      PredictionCapability.forecast,
      async (cap, scope) => {
        const r = await this.forecasting.issue(cap, scope, reader, {
          seriesKey: p.seriesKey as string, horizonCode: p.horizon as string,
          knownAt: instant(p.knownAt, new Date().toISOString()), observedThrough: day(p.observedThrough),
          assumptions: Array.isArray(p.assumptions) ? p.assumptions.filter((x): x is string => typeof x === 'string') : [],
          refreshCadence: p.refreshCadence ?? 'daily', label, ...(typeof p.method === 'string' ? { method: p.method } : {}),
        }, principal.principalId, envelope.correlation_id, envelope.purpose_id ?? 'prediction', forecastId);
        return { result: r, targetType: 'FCT', targetId: r.forecastId, targetVersion: '1',
                 outboxEvent: { eventType: 'ForecastIssued', payload: { forecast_id: r.forecastId, series_key: p.seriesKey,
                                horizon: p.horizon, method: r.method, validation_state: r.validationState, label } } };
      });
    return { forecast: out.result, receipt: receipt(out) };
  }

  @Post('/forecasts/list')
  async listForecasts(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number; seriesKey?: string; knownAt?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const knownAt = typeof body.payload?.knownAt === 'string' ? instant(body.payload.knownAt, new Date().toISOString()) : null;
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'FCT', null),
      PredictionCapability.read,
      async (cap) => knownAt === null
        ? this.forecasting.list(cap, body.payload?.limit ?? 100, body.payload?.seriesKey ?? null)
        : this.forecasting.knownAt(cap, knownAt, body.payload?.limit ?? 100));
    return { forecasts: out.result, knownAt, receipt: receipt(out) };
  }

  @Post('/forecasts/:forecastId/get')
  async getForecast(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Param('forecastId') forecastId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'FCT', forecastId),
      PredictionCapability.read,
      async (cap) => {
        const f = await this.forecasting.get(cap, forecastId);
        if (f === undefined) return null;
        const outcomes = (await cap.readOutcomes().selectAll().where('forecast_id' as never, '=', forecastId as never).execute()) as unknown[];
        const series = await this.series.registry(cap, String(f['series_key']));
        return { ...f, events: await this.forecasting.events(cap, forecastId), outcomes,
                 attribution: series?.attribution ?? null, unit: series?.unit ?? null };
      });
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized forecast matches'), 404);
    return { forecast: out.result, receipt: receipt(out) };
  }

  @Post('/backtests/run')
  async runBacktest(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Body() body: { payload?: { seriesKey?: string; horizon?: string; knownAt?: string; observedThrough?: string; origins?: number; stride?: number; mode?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.seriesKey !== 'string' || typeof p.horizon !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'seriesKey and horizon are required'), 400);
    }
    if (p.mode !== undefined && p.mode !== 'retrospective' && p.mode !== 'historical') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, "mode must be 'retrospective' or 'historical'"), 400);
    }
    const reader = this.reader(req, tenantId, domainId);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'prediction.backtest.record', 'BKT', null),
      PredictionCapability.backtest,
      async (cap, scope) => {
        const r = await this.forecasting.backtest(cap, scope, reader, {
          seriesKey: p.seriesKey as string, horizonCode: p.horizon as string,
          knownAt: instant(p.knownAt, new Date().toISOString()), observedThrough: day(p.observedThrough),
          ...(typeof p.origins === 'number' ? { origins: p.origins } : {}), ...(typeof p.stride === 'number' ? { stride: p.stride } : {}),
          ...(p.mode === 'historical' ? { mode: 'historical' as const } : {}),
        }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'BKT', targetId: String(r['backtestId']), targetVersion: '1', outboxEvent: null };
      });
    return { backtest: out.result, receipt: receipt(out) };
  }

  @Post('/backtests/list')
  async listBacktests(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'BKT', null),
      PredictionCapability.read,
      async (cap) => (await cap.readBacktests().selectAll().orderBy('computed_at' as never, 'desc').limit(200).execute()) as unknown[]);
    return { backtests: out.result, receipt: receipt(out) };
  }

  @Post('/outcomes/record')
  async recordOutcome(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Body() body: { payload?: { forecastId?: string; knownAt?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const forecastId = body.payload?.forecastId;
    if (typeof forecastId !== 'string') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'forecastId is required'), 400);
    const reader = this.reader(req, tenantId, domainId);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'prediction.outcome.record', 'OUT', forecastId),
      PredictionCapability.outcome,
      async (cap, scope) => {
        const r = await this.forecasting.recordOutcome(cap, scope, reader, forecastId,
          instant(body.payload?.knownAt, new Date().toISOString()), principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'OUT', targetId: String(r['outcomeId']), targetVersion: '1', outboxEvent: null };
      });
    return { outcome: out.result, receipt: receipt(out) };
  }

  @Post('/calibration/summary')
  async calibration(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'OUT', null),
      PredictionCapability.read, async (cap) => this.forecasting.calibration(cap));
    return { calibration: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── scenarios and indicators ─────────────────────────

  @Post('/indicators/define')
  async defineIndicator(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Body() body: { payload?: { seriesKey?: string; description?: string; comparator?: string; threshold?: number; consecutiveDays?: number; owner?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.seriesKey !== 'string' || typeof p.description !== 'string' || typeof p.comparator !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'seriesKey, description and comparator are required'), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'prediction.indicator.define', 'IND', null),
      PredictionCapability.indicator,
      async (cap, scope) => {
        const r = await this.scenarios.defineIndicator(cap, scope, {
          seriesKey: p.seriesKey as string, description: p.description as string, comparator: p.comparator as string,
          threshold: Number(p.threshold), consecutiveDays: Number(p.consecutiveDays ?? 1), owner: p.owner ?? principal.principalId,
        }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'IND', targetId: r.indicatorId, targetVersion: '1', outboxEvent: null };
      });
    return { indicator: out.result, receipt: receipt(out) };
  }

  @Post('/indicators/list')
  async listIndicators(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'IND', null),
      PredictionCapability.read, async (cap) => this.scenarios.listIndicators(cap));
    return { indicators: out.result, receipt: receipt(out) };
  }

  /**
   * Evaluate an indicator against everything newer than it last saw. A breach
   * flips every open branch that names it, and each flip records the WARNING
   * it owes; the warning is raised to the branch owner in its own governed
   * operation. A raise that fails leaves the obligation recorded on the branch
   * and is retried by the next evaluation — a flip without a warning is not
   * silent, it is owed, and this call fails loudly while it is.
   *
   * `timing` is 'live' (window opens at the audit clock) or 'replay' (window
   * opens at the breaching observation; recorded_at stays the audit clock).
   */
  @Post('/indicators/:indicatorId/evaluate')
  async evaluateIndicator(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Param('indicatorId') indicatorId: string,
    @Body() body: { payload?: { knownAt?: string; confidence?: number; timing?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const reader = this.reader(req, tenantId, domainId);
    const knownAt = instant(body.payload?.knownAt, new Date().toISOString());
    const confidence = Math.max(0, Math.min(1, Number(body.payload?.confidence ?? 0.8)));
    const timing = body.payload?.timing ?? 'live';
    if (timing !== 'live' && timing !== 'replay') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, "timing must be 'live' or 'replay'"), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'prediction.indicator.evaluate', 'IND', indicatorId),
      PredictionCapability.evaluation,
      async (cap, scope) => {
        const r = await this.scenarios.evaluate(cap, scope, reader, indicatorId, knownAt, principal.principalId, envelope.correlation_id);
        // Live warnings expire on the audit clock; replayed ones only against THIS evaluation's replay clock.
        const expired = await cap.expireWarnings({ tenantId, domainId, replayAsOf: timing === 'replay' ? r.replayAsOf : null,
          actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { ...r, expiredWarnings: expired }, targetType: 'IND', targetId: indicatorId, targetVersion: '1', outboxEvent: null };
      });
    const warnings: Array<{ warningId: string; routedTo: string; raisedAsOf: string; closesAt: string; timely: boolean | null; decisionMissed: boolean; timingMode: string; branchId: string; recovered: boolean }> = [];
    const failed: Array<{ branchId: string; flipEventId: string; reason: string }> = [];
    const due = [...out.result.flips.map((f) => ({ flip: f, recovered: false })), ...out.result.owed.map((f) => ({ flip: f, recovered: true }))];
    for (const { flip, recovered } of due) {
      const warningId = newId();
      try {
        const w = await this.pipeline.write(
          { ...envelope, action: 'prediction.warning.raise', message_id: newId() }, principal,
          this.route(tenantId, domainId, 'prediction.warning.raise', 'WRN', warningId),
          PredictionCapability.warning,
          async (cap, scope) => {
            const r = await this.scenarios.warnForFlip(cap, scope, flip, confidence, principal.principalId,
              envelope.correlation_id, envelope.purpose_id ?? 'prediction', timing, new Date(), warningId);
            return { result: r, targetType: 'WRN', targetId: r.warningId, targetVersion: '1',
                     outboxEvent: { eventType: 'EarlyWarningRaised', payload: { warning_id: r.warningId, routed_to: r.routedTo,
                                    raised_as_of: r.raisedAsOf, closes_at: r.closesAt, timing_mode: r.timingMode, timely: r.timely, decision_missed: r.decisionMissed,
                                    branch_id: flip.branchId, flip_event_id: flip.flipEventId } } };
          });
        warnings.push({ ...w.result, branchId: flip.branchId, recovered });
      } catch (e) {
        failed.push({ branchId: flip.branchId, flipEventId: flip.flipEventId, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    const { owed: _owed, replayAsOf, ...evaluation } = out.result;
    if (failed.length > 0) {
      throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id,
        `${failed.length} flip(s) are committed and still OWE a warning that could not be raised `
        + `(${failed.map((f) => `branch ${f.branchId}: ${f.reason}`).join('; ')}); the obligation stays recorded on the branch and is retried by the next evaluation. `
        + `${warnings.length} warning(s) were raised.`), 409);
    }
    return { evaluation: { ...evaluation, knownAt, timing, replayAsOf: timing === 'replay' ? replayAsOf : null, owedRecovered: out.result.owed.length }, warnings, receipt: receipt(out) };
  }

  @Post('/scenarios/declare')
  async declareScenario(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const intake = validateScenario((body.payload ?? {}) as never, envelope.correlation_id);
    const scenarioId = newId();
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.declare', 'SCN', scenarioId),
      PredictionCapability.scenario,
      async (cap, scope) => {
        const r = await this.scenarios.declare(cap, scope, intake, principal.principalId, envelope.correlation_id, envelope.purpose_id ?? 'prediction', scenarioId);
        return { result: r, targetType: 'SCN', targetId: r.scenarioId, targetVersion: '1', outboxEvent: null };
      });
    return { scenario: out.result, receipt: receipt(out) };
  }

  @Post('/scenarios/list')
  async listScenarios(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'SCN', null),
      PredictionCapability.read, async (cap) => this.scenarios.listScenarios(cap));
    return { scenarios: out.result, receipt: receipt(out) };
  }

  @Post('/scenarios/:scenarioId/get')
  async getScenario(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Param('scenarioId') scenarioId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'SCN', scenarioId),
      PredictionCapability.read, async (cap) => this.scenarios.getScenario(cap, scenarioId));
    if (out.result === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized scenario matches'), 404);
    return { scenario: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── warnings ─────────────────────────

  @Post('/warnings/list')
  async listWarnings(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'WRN', null),
      PredictionCapability.read, async (cap) => this.scenarios.listWarnings(cap, body.payload?.limit ?? 100));
    return { warnings: out.result, receipt: receipt(out) };
  }

  @Post('/warnings/:warningId/get')
  async getWarning(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Param('warningId') warningId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'WRN', warningId),
      PredictionCapability.read, async (cap) => this.scenarios.getWarning(cap, warningId));
    if (out.result === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized warning matches'), 404);
    return { warning: out.result, receipt: receipt(out) };
  }

  @Post('/warnings/:warningId/acknowledge')
  async acknowledgeWarning(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Param('warningId') warningId: string,
    @Body() body: { payload?: { note?: string; asOf?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'prediction.warning.acknowledge', 'WRN', warningId),
      PredictionCapability.acknowledge,
      async (cap, scope) => {
        const state = await this.scenarios.acknowledge(cap, scope, warningId, body.payload?.note ?? '',
          typeof body.payload?.asOf === 'string' ? body.payload.asOf : null, principal.principalId, envelope.correlation_id);
        return { result: { warningId, state }, targetType: 'WRN', targetId: warningId, targetVersion: '1', outboxEvent: null };
      });
    return { warning: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── overview and projections ─────────────────────────

  @Post('/overview')
  async overview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'FCT', null),
      PredictionCapability.read,
      async (cap) => {
        const forecasts = (await cap.readForecasts().selectAll().execute()) as Array<Record<string, unknown>>;
        const warnings = (await cap.readWarnings().selectAll().execute()) as Array<Record<string, unknown>>;
        const scenarios = (await cap.readScenarios().selectAll().execute()) as Array<Record<string, unknown>>;
        const branches = (await cap.readBranches().selectAll().execute()) as Array<Record<string, unknown>>;
        const outcomes = (await cap.readOutcomes().selectAll().execute()) as unknown[];
        const backtests = (await cap.readBacktests().selectAll().execute()) as unknown[];
        const series = await this.series.listRegistry(cap);
        const count = (rows: Array<Record<string, unknown>>, k: string) =>
          rows.reduce<Record<string, number>>((acc, r) => { const v = String(r[k]); acc[v] = (acc[v] ?? 0) + 1; return acc; }, {});
        return {
          series: series.length,
          forecasts: { total: forecasts.length, by_state: count(forecasts, 'state'), by_validation: count(forecasts, 'validation_state'),
                       by_label: count(forecasts, 'label'), attention: forecasts.filter((f) => f['attention_state'] !== 'none').length },
          scenarios: { total: scenarios.length, branches: branches.length, flipped: branches.filter((b) => b['state'] === 'flipped').length },
          warnings: { total: warnings.length, by_state: count(warnings, 'state') },
          outcomes: outcomes.length, backtests: backtests.length,
        };
      });
    return { overview: out.result, receipt: receipt(out) };
  }

  @Post('/projections/verify')
  async verifyProjections(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal, this.route(tenantId, domainId, 'prediction.read', 'FCT', null),
      PredictionCapability.read, async (cap) => cap.rebuildProjections());
    return { projections: out.result, receipt: receipt(out) };
  }
}
