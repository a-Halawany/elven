/**
 * CP-6 B82 §PX (0121_b82_x_px) — THE TRUST ROUTES: a further controller on the graph's base path (inside the existing api.graph unit — no new
 * unit), so no other controller changes. Every route is a POST under the envelope; each answer is the read's or the port's with the receipt.
 *
 *   READS (graph.trust.read, audited)
 *     POST …/graph/trust/envelope                          {type, id, version}            facets (never a score), strength, attestations, digest
 *     POST …/graph/trust/strength                          {type, id, version}            graph.provenance_strength (B81's weak_provenance read)
 *     POST …/graph/trust/overview                          {types?, limit?, days?}        the Trust and Governance workspace (WS-18)
 *   ACTS (human-gated; the ports re-check the person and the role)
 *     POST …/graph/trust/verify                            {requestId, type, id, version, facet}                                graph.trust.verify
 *     POST …/graph/trust/attest                            {requestId, type, id, version, facets, statement, envelopeDigest}    graph.trust.attest
 *     POST …/graph/trust/attestations/:attestationId/withdraw   {requestId, reason}                                            graph.trust.withdraw
 *     POST …/graph/trust/investigate                       {itemId, type, id, version, facet?, note}                            graph.trust.investigate
 */
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { EyeRequest } from '../../pipeline/http.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { TrustService, requestOf } from './trust.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row } | undefined;

@Controller('/v1/tenants/:tenantId/domains/:domainId/graph/trust')
export class TrustController {
  constructor(private readonly svc: TrustService) {}

  @Post('/envelope')
  async envelope(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.envelope(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/strength')
  async strength(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.strength(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/overview')
  async overview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.overview(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/verify')
  async verify(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.verify(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/attest')
  async attest(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.attest(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/attestations/:attestationId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('attestationId') attestationId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.withdraw(envelope, principal, { tenantId, domainId }, attestationId, body?.payload ?? {});
  }

  @Post('/investigate')
  async investigate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.investigate(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }
}
