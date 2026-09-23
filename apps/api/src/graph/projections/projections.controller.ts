/**
 * THE PROJECTION PARTITIONS' ROUTES (CP-6 B20, 0080; design §2.8) — a second controller on the graph's base path, so the
 * graph controller gains only the twelve projection blocks.
 *
 *   POST …/graph/projections/:projection/withdraw   graph.projection.withdraw   {reason}   the operator takes a partition out of service
 *   POST …/graph/projections/:projection/rebuild    graph.projection.rebuild    {reason}   the only way back to serving; the port's report
 *
 * A name outside the six answers 404 before the pipeline (EYE_STA_001 — the domain has no such projection); a reason under
 * eight characters 422 (EYE_REQ_001). Everything else — the standing, a serving partition, the rebuild's own refusals — is
 * the port's, mapped by family.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ProjectionsService } from './projections.service.js';
import { PROJECTIONS, type ProjectionName } from './projection-state.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  }
  return { envelope, principal };
}

/** The route's own checks, before the pipeline: the name is one of the six; the reason is stated. */
function intake(projection: string, body: { payload?: { reason?: string } } | undefined, correlationId: string, act: 'withdrawal' | 'rebuild'): { projection: ProjectionName; reason: string } {
  if (!(PROJECTIONS as readonly string[]).includes(projection)) {
    throw new HttpException(errorBody('EYE_STA_001', correlationId, `${projection} is not a projection of this domain (one of ${PROJECTIONS.join(', ')})`), 404);
  }
  const reason = String(body?.payload?.reason ?? '').trim();
  if (reason.length < 8) {
    throw new HttpException(errorBody('EYE_REQ_001', correlationId, act === 'withdrawal' ? 'a withdrawal states its reason (8+ characters)' : 'a rebuild states its reason (8+ characters)'), 422);
  }
  return { projection: projection as ProjectionName, reason };
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/graph')
export class ProjectionsController {
  constructor(private readonly projections: ProjectionsService) {}

  /** B20 (0080): the operator takes a partition out of service — a suspicion, a representation review, a planned rebuild; human-gated. */
  @Post('/projections/:projection/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('projection') projection: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const a = intake(projection, body, envelope.correlation_id, 'withdrawal');
    return this.projections.withdraw(envelope, principal, tenantId, domainId, a.projection, a.reason);
  }

  /** B20: the rebuild — the only way back to serving; the answer is the port's report (outcome rebuilt | restored | refused), 200 in every outcome. */
  @Post('/projections/:projection/rebuild')
  async rebuild(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('projection') projection: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const a = intake(projection, body, envelope.correlation_id, 'rebuild');
    return this.projections.rebuild(envelope, principal, tenantId, domainId, a.projection, a.reason);
  }
}
