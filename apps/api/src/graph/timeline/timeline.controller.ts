/**
 * CP-6 B50 §TL (0120_b50_x_tl) — THE TIMELINE ROUTES: a further controller on the graph's base path (inside the existing api.graph unit, as
 * §PV's ProvenanceController), so the graph controller is untouched. Every route is a POST under the envelope; each answer is the port's
 * with the receipt (policy decision, audit sequence). The reader's CLEARANCE is the route's (shared/clearance.ts clearanceOf, evaluated
 * against this domain) — handed to the database, which COUNTS what it withholds.
 *
 *   READS (graph.timeline.read, audited)
 *     POST …/graph/timeline/read        {subjectType, subjectId | scopeKey, from, to, axis, asOf?, limit?}   the timeline and the as-of explorer
 *     POST …/graph/timeline/trace       {type, id, version}                                                  the source-to-product trace
 *     POST …/graph/timeline/scopes      {}                                                                   the approved governed scopes (the picker)
 *   ACT (human-gated)
 *     POST …/graph/timeline/trace/reconcile  {type, id, version, note, itemId?}                              graph.timeline.reconcile
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { clearanceOf } from '../../shared/clearance.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { TimelineCapability } from './timeline.capabilities.js';
import { noteIntake, timelineIntake, toTimelineView, toTraceView, traceIntake } from './timeline.service.js';

type Row = Record<string, unknown>;
type Body_ = { payload?: Row } | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TIMELINE_ACTIONS = { read: 'graph.timeline.read', reconcile: 'graph.timeline.reconcile' } as const;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Controller('/v1/tenants/:tenantId/domains/:domainId/graph')
export class TimelineController {
  constructor(private readonly pipeline: PipelineService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  @Post('/timeline/read')
  async timeline(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const t = timelineIntake(body?.payload ?? {}, envelope.correlation_id);
    const clearance = clearanceOf(principal, { tenantId, domainId });
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, TIMELINE_ACTIONS.read, t.subjectType ?? 'TLN', t.subjectId), TimelineCapability.read,
      async (cap) => toTimelineView(await cap.timeline({ tenantId, domainId, ...t, clearance })));
    return { timeline: out.result, receipt: receipt(out) };
  }

  @Post('/timeline/trace')
  async trace(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const s = traceIntake(body?.payload ?? {}, envelope.correlation_id);
    const clearance = clearanceOf(principal, { tenantId, domainId });
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, TIMELINE_ACTIONS.read, s.type, s.id), TimelineCapability.read,
      async (cap) => toTraceView(await cap.trace({ tenantId, domainId, ...s, clearance })));
    return { trace: out.result, receipt: receipt(out) };
  }

  @Post('/timeline/scopes')
  async scopes(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, TIMELINE_ACTIONS.read, 'ASC', null), TimelineCapability.read,
      async (cap) => cap.scopes({ tenantId, domainId }));
    return { scopes: out.result, receipt: receipt(out) };
  }

  @Post('/timeline/trace/reconcile')
  async reconcile(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const s = traceIntake(p, envelope.correlation_id);
    const note = noteIntake(p, envelope.correlation_id);
    const itemId = typeof p['itemId'] === 'string' && UUID_RE.test(p['itemId']) ? (p['itemId'] as string).toLowerCase() : newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, TIMELINE_ACTIONS.reconcile, s.type, s.id), TimelineCapability.reconcile,
      async (cap) => {
        const r = await cap.reconcile({ itemId, tenantId, domainId, ...s, note, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: s.type, targetId: s.id, targetVersion: String(s.version), outboxEvent: null };
      });
    return { reconciliation: out.result, receipt: receipt(out) };
  }
}
