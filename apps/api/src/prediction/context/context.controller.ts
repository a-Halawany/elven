/**
 * B25 §CX (0108) — THE HTTP SURFACE OF GROUNDED CONTEXT: the frozen information set, the grounded issue, the replay, the reads. The
 * prediction module's envelope, capabilities and receipts; every write one governed write whose port asserts the route's own action.
 *
 *   POST …/prediction/information-sets/freeze          prediction.information_set.freeze   freeze a set for a series at a cut-off
 *   POST …/prediction/information-sets/list            prediction.information_set.read     the domain's sets, newest first
 *   POST …/prediction/information-sets/:setId/get      prediction.information_set.read     a set: manifest, ledger, forecasts pinning it, replays
 *   POST …/prediction/forecasts/issue-grounded         prediction.forecast.issue           freeze, then issue pinned to the set (+ environment)
 *   POST …/prediction/forecasts/:forecastId/replay     prediction.forecast.replay          replay from the frozen set → REPRODUCED | DIVERGED
 *   POST …/prediction/forecasts/:forecastId/grounding  prediction.information_set.read     the forecast's grounding (the page's read)
 *
 * None of these paths meets PredictionController's (/forecasts/issue, /forecasts/list, /forecasts/:id/{withdraw,assess,get}).
 * The grounded issue publishes what the legacy issue publishes (ForecastIssued@v2; GraphChanged/forecast.superseded on a supersession).
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import type { Tx } from '../../shared/db.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { forecastSupersededEvent } from '../../graph/subscriptions/change-events.js';
import { PredictionCapability } from '../prediction.capabilities.js';
import { HORIZONS } from '../forecasting/forecasting.service.js';
import { forecastIssuedEvent } from '../forecasting/forecast-events.js';
import type { Reader } from '../series/series.service.js';
import { ContextCapability } from './context.capabilities.js';
import { ContextService, type GroundedIssueCaps } from './context.service.js';
import { freezeWith } from './context-freezer.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
function instant(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The grounded issue's capability: the forecast capability and the context capability on the write's ONE transaction. */
const groundedIssueCapability = (tx: Tx, action: string): GroundedIssueCaps & { tx: Tx } =>
  ({ forecast: PredictionCapability.forecast(tx, action), context: ContextCapability.freeze(tx, action), tx });

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction')
export class ContextController {
  constructor(private readonly pipeline: PipelineService, private readonly context: ContextService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private reader(req: EyeRequest, tenantId: string, domainId: string): Reader {
    const { envelope, principal } = ctx(req);
    return { principal, tenantId, domainId, correlationId: envelope.correlation_id, purposeId: envelope.purpose_id ?? 'prediction' };
  }
  private uuid(v: string, what: string, correlationId: string): void {
    if (!UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${what} is a uuid`), 400);
  }

  /** FREEZE an information set (the forecast owner, the forecast agent, the platform administrator): the assembler's read → the port. */
  @Post('/information-sets/freeze')
  async freeze(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p['seriesKey'] !== 'string') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'seriesKey is required'), 400);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.information_set.freeze', 'INS', null), ContextCapability.freeze,
      async (cap) => {
        const subject = (await cap.readSeries().select(['subject_entity_id']).where('series_key' as never, '=', p['seriesKey'] as never).executeTakeFirst()) as Row | undefined;
        const frozen = await freezeWith(cap, {
          tenantId, domainId, seriesKey: p['seriesKey'] as string, subjectEntityId: (subject?.['subject_entity_id'] as string | null | undefined) ?? null,
          targetKey: typeof p['targetKey'] === 'string' ? p['targetKey'] : null,
          knownAt: typeof p['knownAt'] === 'string' ? p['knownAt'] : await cap.dbNow(), observedThrough: day(p['observedThrough']),
          assumptions: strings(p['assumptions']), actor: principal.principalId, correlationId: envelope.correlation_id,
        });
        return { result: frozen, targetType: 'INS', targetId: frozen.informationSetId, targetVersion: '1', outboxEvent: null };
      });
    return { informationSet: out.result, receipt: receipt(out) };
  }

  @Post('/information-sets/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.information_set.read', 'INS', null), ContextCapability.read,
      async (cap) => ({ at: await cap.dbNow(), sets: await this.context.listSets(cap, { seriesKey: typeof p['seriesKey'] === 'string' ? p['seriesKey'] : null, limit: Number(p['limit'] ?? 50) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/information-sets/:setId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string) {
    const { envelope, principal } = ctx(req);
    this.uuid(setId, 'setId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.information_set.read', 'INS', setId), ContextCapability.read,
      async (cap) => this.context.getSet(cap, setId, envelope.correlation_id));
    return { informationSet: out.result, receipt: receipt(out) };
  }

  /** THE GROUNDED ISSUE: freeze the information set, then issue the forecast pinned to it, recording the environment. */
  @Post('/forecasts/issue-grounded')
  async issueGrounded(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p['seriesKey'] !== 'string' || typeof p['horizon'] !== 'string') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'seriesKey and horizon are required'), 400);
    if (HORIZONS[p['horizon']] === undefined) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `horizon must be one of ${Object.keys(HORIZONS).join(', ')}`), 400);
    const label = p['label'] === 'live' ? 'live' : 'replay demonstration';
    const reader = this.reader(req, tenantId, domainId);
    const knownAt = instant(p['knownAt'], new Date().toISOString());
    const refreshCadence = typeof p['refreshCadence'] === 'string' ? p['refreshCadence'] : 'daily';
    const forecastId = newId();
    // B25 act-found: the series is assembled BEFORE the write opens (a long real history outlives the write's 60-second commit capability)
    // (any refusal of the read is left to the write, which answers it exactly as before)
    const assembled = await this.context.preAssemble(reader, p['seriesKey'] as string, knownAt, day(p['observedThrough'])).catch(() => undefined);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.forecast.issue', 'FCT', forecastId), groundedIssueCapability,
      async (caps, scope) => {
        const r = await this.context.issueGrounded(caps, scope, reader, {
          seriesKey: p['seriesKey'] as string, horizonCode: p['horizon'] as string, knownAt, observedThrough: day(p['observedThrough']),
          assumptions: strings(p['assumptions']), refreshCadence, label, ...(typeof p['method'] === 'string' ? { method: p['method'] } : {}), ...(assembled === undefined ? {} : { assembled }),
        }, principal.principalId, envelope.correlation_id, envelope.purpose_id ?? 'prediction', forecastId);
        const superseded = await caps.forecast.supersededBy({ forecastId: r.forecastId });
        const events = superseded === null ? [] : [forecastSupersededEvent({ supersededForecastId: superseded.forecast_id, newForecastId: r.forecastId, subjectEntityId: superseded.subject_entity_id,
          subscriptions: await caps.forecast.changeSubscriptions({ tenantId, domainId, changeKind: 'forecast.superseded' }), actor: principal.principalId })];
        return { result: { ...r, supersededForecastId: superseded?.forecast_id ?? null }, targetType: 'FCT', targetId: r.forecastId, targetVersion: '1',
                 outboxEvent: forecastIssuedEvent({
                   forecastId: r.forecastId, seriesKey: p['seriesKey'] as string, subjectEntityId: r.subjectEntityId, horizon: p['horizon'] as string, horizonDays: r.horizonDays,
                   method: r.method, methodVersion: r.methodVersion, baselineMethod: r.baselineMethod, validationState: r.validationState, validationNote: r.validationNote,
                   backtestId: r.backtestId, skill: r.skill, label, supersededForecastId: superseded?.forecast_id ?? null,
                   originAt: r.originAt, knownAt, targetAt: r.targetAt, observedThrough: r.observedThrough, issuedAt: r.issuedAt,
                   refreshCadence, quantiles: r.quantiles, unit: r.unit, drivers: r.drivers, assumptions: r.assumptions, evidenceRefs: r.evidenceRefs,
                   controls: { synthetic_state: r.controls.synthetic_state, classification: r.controls.classification }, actor: principal.principalId,
                 }),
                 outboxEvents: events };
      });
    return { forecast: out.result, receipt: receipt(out) };
  }

  /** THE REPLAY of a grounded forecast from its frozen information set. */
  @Post('/forecasts/:forecastId/replay')
  async replay(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('forecastId') forecastId: string) {
    const { envelope, principal } = ctx(req);
    this.uuid(forecastId, 'forecastId', envelope.correlation_id);
    const reader = this.reader(req, tenantId, domainId);
    // B25 act-found: the pinned series is assembled BEFORE the write opens (read under prediction.information_set.read; null: ungrounded or unknown — the port answers)
    let pre: Awaited<ReturnType<ContextService['preAssembleReplay']>> = null;
    try { pre = await this.context.preAssembleReplay(reader, forecastId); } catch { pre = null; }
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.forecast.replay', 'FCT', forecastId), ContextCapability.replay,
      async (cap, scope) => {
        const r = await this.context.replay(cap, scope, reader, forecastId, principal.principalId, envelope.correlation_id, pre);
        return { result: r, targetType: 'FCT', targetId: forecastId, targetVersion: null, outboxEvent: null };
      });
    return { replay: out.result, receipt: receipt(out) };
  }

  /** THE GROUNDING of a forecast: the set it pins (graph revision, twin snapshot, features, assumptions, policy, gaps), the environment, the replays. */
  @Post('/forecasts/:forecastId/grounding')
  async grounding(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('forecastId') forecastId: string) {
    const { envelope, principal } = ctx(req);
    this.uuid(forecastId, 'forecastId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.information_set.read', 'FCT', forecastId), ContextCapability.read,
      async (cap) => this.context.grounding(cap, forecastId, envelope.correlation_id));
    return { grounding: out.result, receipt: receipt(out) };
  }
}
