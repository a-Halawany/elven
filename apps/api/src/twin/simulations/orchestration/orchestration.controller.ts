/**
 * THE SIMULATION CENTER'S HTTP SURFACE — CP-6 B31 part O (0099 §O; F-P5-06, WS-13, JRN-14). Every write is one governed write whose port
 * asserts the route's own action (EXACT PDP rules, the B31 orchestration block); the reads are consequential reads under
 * simulation.experiment.read and the caller's RLS. The routes live under /simulations/orchestration of the domain (none meets the twin
 * controller's /twins/simulations/… routes). Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../../shared/ids.js';
import { requireCorrelation } from '../../../shared/correlation.js';
import { PipelineService } from '../../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../../pipeline/http.js';
import { OrchestrationCapability } from './orchestration.capabilities.js';
import { EXPERIMENT_OBJECT_TYPE, OrchestrationService } from './orchestration.service.js';
import { validateExperimentIntake } from './experiment-plan.js';

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
const idOf = (v: string, correlationId: string): string => {
  if (!UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `experiment rejected (unknown_experiment): ${v} is not an experiment id`), 404);
  return v;
};
const text = (p: Row, key: string, min: number, correlationId: string, what: string): string => {
  const v = typeof p[key] === 'string' ? (p[key] as string).trim() : '';
  if (v.length < min) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `experiment rejected (${key}): ${what} (at least ${min} characters)`), 422);
  return v;
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/simulations/orchestration')
export class OrchestrationController {
  constructor(private readonly pipeline: PipelineService, private readonly orchestration: OrchestrationService) {}
  private route(tenantId: string, domainId: string, action: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: EXPERIMENT_OBJECT_TYPE, objectId };
  }

  /** DECLARE an experiment (a twin owner, a simulation operator): the question, the run contract, the paths, the chunk size, the seed, the budget, the stop conditions. */
  @Post('/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const intake = validateExperimentIntake(body.payload ?? {}, envelope.correlation_id);
    const experimentId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.experiment.declare', experimentId), OrchestrationCapability.write,
      async (cap, scope) => ({ result: await this.orchestration.declare(cap, scope, intake, principal.principalId, envelope.correlation_id, experimentId),
                               targetType: EXPERIMENT_OBJECT_TYPE, targetId: experimentId, targetVersion: null, outboxEvent: null }));
    return { experiment: out.result, receipt: receipt(out) };
  }

  /** The experiments of the domain under the caller's RLS (newest first; by state). */
  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const limit = typeof p['limit'] === 'number' && Number.isFinite(p['limit']) ? Math.max(1, Math.min(200, Math.trunc(p['limit'] as number))) : 50;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.experiment.read', null), OrchestrationCapability.read,
      async (cap) => ({ at: await cap.now(), experiments: await cap.list({ state: typeof p['state'] === 'string' ? p['state'] : null, limit }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** ONE experiment: its declaration, budget (use vs approved), chunks, checkpoints, ledger, indicators, run (with a partial declaration) and manifest. */
  @Post('/:experimentId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('experimentId') experimentId: string) {
    const { envelope, principal } = ctx(req);
    idOf(experimentId, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.experiment.read', experimentId), OrchestrationCapability.read,
      async (cap) => ({ at: await cap.now(), experiment: await cap.experiment(experimentId) }));
    if (out.result.experiment === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `experiment rejected (unknown_experiment): ${experimentId} is not an experiment of this domain`), 404);
    return { ...out.result, receipt: receipt(out) };
  }

  /** APPROVE the budget (human-gated): a named human other than the declarer, naming the budget's digest they read. */
  @Post('/:experimentId/approve')
  async approve(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('experimentId') experimentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    idOf(experimentId, envelope.correlation_id);
    const p = body.payload ?? {};
    const budgetDigest = typeof p['budgetDigest'] === 'string' && /^[0-9a-f]{64}$/.test(p['budgetDigest']) ? p['budgetDigest']
      : (() => { throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'experiment rejected (stale): an approval names the digest of the budget it approves (budgetDigest)'), 422); })();
    const note = text(p, 'note', 8, envelope.correlation_id, 'an approval says why');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.experiment.approve', experimentId), OrchestrationCapability.write,
      async (cap) => ({ result: await cap.approve({ experimentId, tenantId, domainId, budgetDigest, note, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: EXPERIMENT_OBJECT_TYPE, targetId: experimentId, targetVersion: null, outboxEvent: null }));
    return { experiment: out.result, receipt: receipt(out) };
  }

  /** START: the admission (a refusal recorded, 409), then the run opened through the existing path and bound (or the experiment failed with the refusal). */
  @Post('/:experimentId/start')
  async start(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('experimentId') experimentId: string) {
    const { envelope, principal } = ctx(req);
    idOf(experimentId, envelope.correlation_id);
    return this.orchestration.start(envelope, principal, tenantId, domainId, experimentId);
  }

  @Post('/:experimentId/pause')
  async pause(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('experimentId') experimentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    idOf(experimentId, envelope.correlation_id);
    const reason = text(body.payload ?? {}, 'reason', 4, envelope.correlation_id, 'a pause says why');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.experiment.pause', experimentId), OrchestrationCapability.write,
      async (cap) => ({ result: await cap.pause({ experimentId, tenantId, domainId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: EXPERIMENT_OBJECT_TYPE, targetId: experimentId, targetVersion: null, outboxEvent: null }));
    return { experiment: out.result, receipt: receipt(out) };
  }

  @Post('/:experimentId/resume')
  async resume(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('experimentId') experimentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    idOf(experimentId, envelope.correlation_id);
    const p = body.payload ?? {};
    const reason = typeof p['reason'] === 'string' && p['reason'].trim().length > 0 ? p['reason'].trim() : null;
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.experiment.resume', experimentId), OrchestrationCapability.write,
      async (cap) => ({ result: await cap.resume({ experimentId, tenantId, domainId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: EXPERIMENT_OBJECT_TYPE, targetId: experimentId, targetVersion: null, outboxEvent: null }));
    return { experiment: out.result, receipt: receipt(out) };
  }

  /** CANCEL: the run partial over the chunks done (or failed when none), with the reason. */
  @Post('/:experimentId/cancel')
  async cancel(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('experimentId') experimentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    idOf(experimentId, envelope.correlation_id);
    const reason = text(body.payload ?? {}, 'reason', 8, envelope.correlation_id, 'a cancellation says why');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.experiment.cancel', experimentId), OrchestrationCapability.write,
      async (cap, scope) => ({ result: await this.orchestration.cancel(cap, scope, experimentId, reason, principal.principalId, envelope.correlation_id),
                               targetType: EXPERIMENT_OBJECT_TYPE, targetId: experimentId, targetVersion: null, outboxEvent: null }));
    return { experiment: out.result, receipt: receipt(out) };
  }
}
