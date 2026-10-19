/**
 * CP-6 B82 §GM (0121_b82_x_gm) — THE GEOGRAPHIC-REFERENCE ROUTES: a further controller on the graph's base path (inside the existing api.graph
 * unit — no new unit), so the graph controller is untouched. Every route is a POST under the envelope; each answer is the port's with the
 * receipt (policy decision, audit sequence).
 *
 *   READ (graph.geo.read, audited)
 *     POST …/graph/geo/layer                              {keys?, kinds?, referenceId?, includeRetired?}   the layer the map canvases draw
 *   ACTS (human-gated; a named data steward — the port re-checks)
 *     POST …/graph/geo/references                         {requestId, expectedVersion: 0, key, label, kind, geometry, crs, uncertaintyM,
 *                                                          sourceStatement, licenceStatement, linked?, chokepointKey?, reason}    graph.geo.declare
 *     POST …/graph/geo/references/:referenceId/revise     {requestId, expectedVersion, … as declare}                          graph.geo.declare
 *     POST …/graph/geo/references/:referenceId/retire     {requestId, expectedVersion, reason}                                graph.geo.retire
 */
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { EyeRequest } from '../../pipeline/http.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { GeoService, requestOf } from './geo.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row } | undefined;

@Controller('/v1/tenants/:tenantId/domains/:domainId/graph/geo')
export class GeoController {
  constructor(private readonly svc: GeoService) {}

  @Post('/layer')
  async layer(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.layer(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/references')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.declare(envelope, principal, { tenantId, domainId }, body?.payload ?? {}, null);
  }

  @Post('/references/:referenceId/revise')
  async revise(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('referenceId') referenceId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.declare(envelope, principal, { tenantId, domainId }, body?.payload ?? {}, referenceId);
  }

  @Post('/references/:referenceId/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('referenceId') referenceId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.retire(envelope, principal, { tenantId, domainId }, referenceId, body?.payload ?? {});
  }
}
