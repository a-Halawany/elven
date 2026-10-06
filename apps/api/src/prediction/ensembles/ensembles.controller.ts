/**
 * THE HTTP SURFACE OF ENSEMBLES, DISAGREEMENT AND THE JUDGEMENT OVERLAY — CP-6 B25 part `ensembles` (migration 0108 §EN; F-P4-02).
 *
 *   …/prediction/ensembles/issue                 prediction.ensemble.issue (admission, completion) + prediction.forecast.issue (the members
 *                                                and the ensemble, one write) — the manager's lifecycle, answered as the run's package
 *   …/prediction/ensembles/list                  prediction.ensemble.read
 *   …/prediction/ensembles/:runId/read           prediction.ensemble.read — the package: members, ensemble, disagreement, excluded, overlays
 *   …/prediction/ensembles/:runId/members        prediction.ensemble.read — every member's distribution, inspectable
 *   …/prediction/ensembles/:runId/disagreement   prediction.ensemble.read — the port's measure and the analysis (what splits the members)
 *   …/prediction/ensembles/:runId/resume         prediction.ensemble.issue — a run left admitted or running continues from what stands
 *   …/prediction/forecasts/:forecastId/overlays/add                   prediction.overlay.add (human-gated) — the first version
 *   …/prediction/forecasts/:forecastId/overlays/:overlayId/revise     prediction.overlay.add (human-gated) — the next version
 *   …/prediction/forecasts/:forecastId/overlays/:overlayId/withdraw   prediction.overlay.withdraw (human-gated)
 *   …/prediction/forecasts/:forecastId/overlays/list                  prediction.read — every version, beside the MODEL's distribution
 *
 * The overlay routes are four segments below /prediction/forecasts, so none meets PredictionController's /forecasts/:forecastId/<verb>.
 * Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { EnsembleCapability } from './ensembles.capabilities.js';
import { EnsemblesService, refuse, validateEnsembleRequest, validateOverlay } from './ensembles.service.js';

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

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction')
export class EnsemblesController {
  constructor(private readonly pipeline: PipelineService, private readonly ensembles: EnsemblesService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private id(v: string, what: string, cid: string, noun: 'ensemble' | 'judgement overlay' = 'ensemble'): void {
    if (!UUID.test(v)) throw refuse(noun, 'request', `${what} is an id`, cid);
  }

  /* ───────────── the manager ───────────── */

  /** ISSUE an ensemble: admit the run, compute and issue its members and the ensemble, complete (or fail) — the run's package answered. */
  @Post('/ensembles/issue')
  async issue(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const r = validateEnsembleRequest(body.payload ?? {}, envelope.correlation_id);
    return { ensemble: await this.ensembles.issue(envelope, principal, tenantId, domainId, r) };
  }

  @Post('/ensembles/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const limit = typeof body.payload?.['limit'] === 'number' ? Number(body.payload['limit']) : 50;
    return this.ensembles.list(envelope, principal, tenantId, domainId, limit);
  }

  @Post('/ensembles/:runId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    this.id(runId, 'runId', envelope.correlation_id);
    return { ensemble: await this.ensembles.read(envelope, principal, tenantId, domainId, runId) };
  }

  @Post('/ensembles/:runId/members')
  async members(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    this.id(runId, 'runId', envelope.correlation_id);
    return this.ensembles.members(envelope, principal, tenantId, domainId, runId);
  }

  @Post('/ensembles/:runId/disagreement')
  async disagreement(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    this.id(runId, 'runId', envelope.correlation_id);
    return this.ensembles.disagreement(envelope, principal, tenantId, domainId, runId);
  }

  @Post('/ensembles/:runId/resume')
  async resume(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    this.id(runId, 'runId', envelope.correlation_id);
    return { ensemble: await this.ensembles.resume(envelope, principal, tenantId, domainId, runId) };
  }

  /* ───────────── the judgement overlay ───────────── */

  /** ADD a judgement overlay on an issued forecast (a named human forecast owner; labelled JUDGEMENT; the model's output untouched). */
  @Post('/forecasts/:forecastId/overlays/add')
  async addOverlay(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('forecastId') forecastId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    this.id(forecastId, 'forecastId', envelope.correlation_id, 'judgement overlay');
    const o = validateOverlay(body.payload ?? {}, envelope.correlation_id, false);
    const overlayId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.overlay.add', 'FCT', forecastId), EnsembleCapability.overlay,
      async (cap) => {
        const r = await cap.add({ overlayId, tenantId, domainId, forecastId, adjustment: o.adjustment, rationale: o.rationale, evidence: o.evidence,
          actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'FCT', targetId: forecastId, targetVersion: null, outboxEvent: null };
      });
    return { overlay: out.result, receipt: receipt(out) };
  }

  /** REVISE the standing overlay: its next version (the prior superseded, never edited); expectedVersion guards a stale revision. */
  @Post('/forecasts/:forecastId/overlays/:overlayId/revise')
  async reviseOverlay(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('forecastId') forecastId: string,
                      @Param('overlayId') overlayId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    this.id(forecastId, 'forecastId', envelope.correlation_id, 'judgement overlay');
    this.id(overlayId, 'overlayId', envelope.correlation_id, 'judgement overlay');
    const o = validateOverlay(body.payload ?? {}, envelope.correlation_id, true);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.overlay.add', 'FCT', forecastId), EnsembleCapability.overlay,
      async (cap) => {
        const r = await cap.revise({ overlayId, tenantId, domainId, forecastId, expectedVersion: o.expectedVersion as number, adjustment: o.adjustment, rationale: o.rationale,
          evidence: o.evidence, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'FCT', targetId: forecastId, targetVersion: null, outboxEvent: null };
      });
    return { overlay: out.result, receipt: receipt(out) };
  }

  /** WITHDRAW the standing overlay (a human forecast owner or the domain's administrator, with a reason). */
  @Post('/forecasts/:forecastId/overlays/:overlayId/withdraw')
  async withdrawOverlay(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('forecastId') forecastId: string,
                        @Param('overlayId') overlayId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    this.id(forecastId, 'forecastId', envelope.correlation_id, 'judgement overlay');
    this.id(overlayId, 'overlayId', envelope.correlation_id, 'judgement overlay');
    const reason = typeof body.payload?.['reason'] === 'string' ? String(body.payload['reason']) : '';
    if (reason.trim().length < 8) throw refuse('judgement overlay', 'reason', 'a withdrawal states its reason (at least 8 characters)', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.overlay.withdraw', 'FCT', forecastId), EnsembleCapability.overlay,
      async (cap) => {
        const r = await cap.withdraw({ overlayId, tenantId, domainId, forecastId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'FCT', targetId: forecastId, targetVersion: null, outboxEvent: null };
      });
    return { overlay: out.result, receipt: receipt(out) };
  }

  @Post('/forecasts/:forecastId/overlays/list')
  async listOverlays(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('forecastId') forecastId: string) {
    const { envelope, principal } = ctx(req);
    this.id(forecastId, 'forecastId', envelope.correlation_id, 'judgement overlay');
    return this.ensembles.overlays(envelope, principal, tenantId, domainId, forecastId);
  }
}
