/**
 * B50 §CI (migration 0120) — the impact triggers and the classed products, on the graph's base path (inside api.graph; no new unit).
 *
 *   POST …/graph/impact/triggers/:kind/record      the steward's trigger (graph.impact.trigger.<kind>, human-gated), then the agent's walk
 *   POST …/graph/impact/triggers/:triggerId/close  the deciding person closes a human challenge (graph.impact.trigger.close, human-gated)
 *   POST …/graph/impact/triggers/reconcile         an operator asks the agent to walk the domain's unwalked triggers (graph.impact.trigger.reconcile)
 *   POST …/graph/impact/triggers/list              the triggers with their walk state (graph.read)
 *   POST …/graph/impact/triggers/:triggerId/get    one trigger and its events (graph.read)
 *   POST …/graph/impact/affected                   the classed products of an invalidation or of a correction case (graph.read)
 *   POST …/graph/impact/classes                    the versioned classification rule(s) (graph.read)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { GraphCapability } from '../graph.capabilities.js';
import { ImpactTriggersService, type TriggerIntake } from './impact-triggers.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Controller('/v1/tenants/:tenantId/domains/:domainId/graph')
export class ImpactB50Controller {
  constructor(private readonly pipeline: PipelineService, private readonly triggers: ImpactTriggersService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  @Post('/impact/triggers/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'ITR', null), GraphCapability.read,
      async (cap) => this.triggers.triggers(cap, typeof body.payload?.limit === 'number' ? body.payload.limit : 100));
    return { triggers: out.result, receipt: receipt(out) };
  }

  @Post('/impact/triggers/reconcile')
  async reconcile(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    // The operator's ASK is authorised and audited as a read of the domain's triggers under its own action; the walk is the agent's.
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.impact.trigger.reconcile', 'ITR', null), GraphCapability.read,
      async (cap) => (await this.triggers.triggers(cap, 500)).filter((t) => t['state'] !== 'walked').length);
    const walks = await this.triggers.reconcile({ tenantId, domainId });
    return { unwalkedBefore: out.result, walks, receipt: receipt(out) };
  }

  @Post('/impact/triggers/:kind/record')
  async record(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('kind') kind: string,
               @Body() body: { payload?: TriggerIntake }) {
    const { envelope, principal } = ctx(req);
    return this.triggers.record(envelope, principal, tenantId, domainId, kind, body.payload ?? {});
  }

  @Post('/impact/triggers/:triggerId/close')
  async close(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('triggerId') triggerId: string,
              @Body() body: { payload?: { reason?: unknown } }) {
    const { envelope, principal } = ctx(req);
    return this.triggers.close(envelope, principal, tenantId, domainId, triggerId, body.payload?.reason);
  }

  @Post('/impact/triggers/:triggerId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('triggerId') triggerId: string) {
    const { envelope, principal } = ctx(req);
    if (!UUID_RE.test(triggerId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'triggerId: a trigger id'), 400);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'ITR', triggerId), GraphCapability.read,
      async (cap) => {
        const t = (await this.triggers.triggers(cap, 500)).find((x) => x['trigger_id'] === triggerId);
        return t === undefined ? null : { ...t, events: await this.triggers.triggerEvents(cap, triggerId) };
      });
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `no impact trigger ${triggerId} in this domain`), 404);
    return { trigger: out.result, receipt: receipt(out) };
  }

  @Post('/impact/affected')
  async affected(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
                 @Body() body: { payload?: { invalidationId?: unknown; caseId?: unknown } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const inv = typeof p.invalidationId === 'string' && UUID_RE.test(p.invalidationId) ? p.invalidationId : undefined;
    const kase = typeof p.caseId === 'string' && UUID_RE.test(p.caseId) ? p.caseId : undefined;
    if ((inv === undefined) === (kase === undefined)) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'name exactly one: invalidationId (one walk) or caseId (a correction case: the latest walk of each root)'), 400);
    }
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', inv !== undefined ? 'INV' : 'COR', (inv ?? kase) as string), GraphCapability.read,
      async (cap) => this.triggers.affected(cap, inv !== undefined ? { invalidationId: inv } : { caseId: kase as string }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/impact/classes')
  async classes(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'INV', null), GraphCapability.read,
      async (cap) => this.triggers.rules(cap));
    return { rules: out.result, receipt: receipt(out) };
  }
}
