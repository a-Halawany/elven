/**
 * THE HTTP SURFACE OF SCENARIO QUALITY AND GOVERNED BRANCH PROBABILITIES — CP-6 B27 part `quality` (migration 0097 §Q; F-P4-09). The
 * prediction module's envelope, capabilities and receipts: every write is one governed write whose port asserts the route's own action (an
 * EXACT PDP rule, the B27 quality block); the read is a consequential read (prediction.scenario.quality.read). The routes live under
 * /prediction/scenarios/quality/… of the domain — four segments or more below /prediction, so none meets PredictionController's
 * /scenarios/:scenarioId/<verb> routes. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../../shared/ids.js';
import { requireCorrelation } from '../../../shared/correlation.js';
import { PipelineService } from '../../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../../pipeline/http.js';
import { QualityCapability } from './quality.capabilities.js';
import { assertUuid, validateMap, validateProbability, validateTrigger, validateWithdrawal } from './quality.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction/scenarios/quality')
export class ScenarioQualityController {
  constructor(private readonly pipeline: PipelineService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** THE MAPS of the domain (every version; the reader's view under prediction.scenario.quality.read). */
  @Post('/maps/list')
  async listMaps(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.quality.read', 'FPM', null), QualityCapability.read,
      async (cap) => ({ at: await cap.now(), maps: await cap.maps() }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** DECLARE a frequency-to-probability map (a named human; a name already declared → its next version, the prior superseded). */
  @Post('/maps/declare')
  async declareMap(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const m = validateMap(body.payload ?? {}, envelope.correlation_id);
    const mapId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.probability.map', 'FPM', mapId), QualityCapability.probability,
      async (cap) => {
        const r = await cap.declareMap({ mapId, tenantId, domainId, name: m.name, horizon: m.horizon, bands: m.bands, owner: m.owner, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'FPM', targetId: mapId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { map: out.result, receipt: receipt(out) };
  }

  /** SET a branch's probability band (a named human — the scenario's or the branch's owner or an administrator — with a method and its basis). */
  @Post('/branches/:branchId/probability')
  async setProbability(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('branchId') branchId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(branchId, 'branch', envelope.correlation_id, 'branch probability');
    const p = validateProbability(body.payload ?? {}, envelope.correlation_id);
    const probabilityId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.probability.set', 'BRN', branchId), QualityCapability.probability,
      async (cap) => {
        const r = await cap.setProbability({ probabilityId, tenantId, domainId, branchId, method: p.method, low: p.low, high: p.high, mapId: p.mapId, basis: p.basis, actor: principal.principalId,
          eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'BRN', targetId: branchId, targetVersion: null, outboxEvent: null };
      });
    return { probability: out.result, receipt: receipt(out) };
  }

  /** WITHDRAW a branch's standing probability (the same named humans; a reason). */
  @Post('/branches/:branchId/probability/withdraw')
  async withdrawProbability(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('branchId') branchId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(branchId, 'branch', envelope.correlation_id, 'branch probability');
    const reason = validateWithdrawal(body.payload ?? {}, envelope.correlation_id);
    const withdrawalId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.probability.withdraw', 'BRN', branchId), QualityCapability.probability,
      async (cap) => {
        const r = await cap.withdrawProbability({ withdrawalId, tenantId, domainId, branchId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'BRN', targetId: branchId, targetVersion: null, outboxEvent: null };
      });
    return { withdrawal: out.result, receipt: receipt(out) };
  }

  /** EVALUATE a scenario's quality (a person's act; recorded whatever the outcome; trigger declare | branch | operator, default operator). */
  @Post('/:scenarioId/evaluate')
  async evaluate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scenarioId') scenarioId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(scenarioId, 'scenario', envelope.correlation_id);
    const trigger = validateTrigger(body.payload ?? {}, envelope.correlation_id);
    const evaluationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.quality.evaluate', 'SCN', scenarioId), QualityCapability.write,
      async (cap) => {
        const r = await cap.evaluate({ evaluationId, scenarioId, tenantId, domainId, trigger, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SCN', targetId: scenarioId, targetVersion: r['scenario_version'] === null || r['scenario_version'] === undefined ? null : String(r['scenario_version']), outboxEvent: null };
      });
    return { evaluation: out.result, receipt: receipt(out) };
  }

  /** THE SCENARIO'S QUALITY: the latest evaluation, the live measures (freshness with the stale and missing named), the decision-activity,
   *  the probabilities with method and basis, the maps; and the recent evaluations. */
  @Post('/:scenarioId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scenarioId') scenarioId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(scenarioId, 'scenario', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.quality.read', 'SCN', scenarioId), QualityCapability.read,
      async (cap) => ({ quality: await cap.quality(scenarioId), evaluations: await cap.evaluations(scenarioId, 20) }));
    if (out.result.quality === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `scenario quality rejected (unknown_scenario): ${scenarioId} is not a scenario of this domain`), 404);
    return { ...out.result.quality, evaluations: out.result.evaluations, receipt: receipt(out) };
  }
}
