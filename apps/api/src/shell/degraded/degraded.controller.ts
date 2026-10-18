/**
 * B81 §DG (0119_b81_x_dg) — THE HTTP SURFACE of the degraded state, its contracts and their exits.
 *
 * DOMAIN — base /v1/tenants/:t/domains/:d/shell/degraded:
 *   state                         shell.degraded.read (audited; the platform's contracts and this domain's, each with its live signal and mode;
 *                                 the undeclared degraded dependencies; the unavailable functions in force) — reads only
 *   contracts/:contractId/read    shell.degraded.read (one contract's versions and exits)
 *   contracts/declare             shell.degraded.contract.declare (human-gated; the operations authority or the domain administrator)
 *   contracts/:contractId/exit    shell.degraded.exit (human-gated; the contract's owner, once the signal reads recovered)
 * PLATFORM — base /v1/shell/degraded: the same routes at the PLATFORM scope (the audit journal, models, the outbound network).
 *
 * Refusals in the server's words: `degraded contract rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { EyeRequest } from '../../pipeline/http.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { DegradedService, requestOf } from './degraded.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

@Controller('/v1/tenants/:tenantId/domains/:domainId/shell/degraded')
export class DegradedDomainController {
  constructor(private readonly svc: DegradedService) {}

  @Post('/state')
  async state(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.state(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/contracts/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.declare(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/contracts/:contractId/read')
  async history(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('contractId') contractId: string) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.history(envelope, principal, { tenantId, domainId }, contractId);
  }

  @Post('/contracts/:contractId/exit')
  async exit(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('contractId') contractId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.exit(envelope, principal, { tenantId, domainId }, contractId, body?.payload ?? {});
  }
}

@Controller('/v1/shell/degraded')
export class DegradedPlatformController {
  constructor(private readonly svc: DegradedService) {}

  @Post('/state')
  async state(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.state(envelope, principal, { tenantId: null, domainId: null }, body?.payload ?? {});
  }

  @Post('/contracts/declare')
  async declare(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.declare(envelope, principal, { tenantId: null, domainId: null }, body?.payload ?? {});
  }

  @Post('/contracts/:contractId/read')
  async history(@Req() req: EyeRequest, @Param('contractId') contractId: string) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.history(envelope, principal, { tenantId: null, domainId: null }, contractId);
  }

  @Post('/contracts/:contractId/exit')
  async exit(@Req() req: EyeRequest, @Param('contractId') contractId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.exit(envelope, principal, { tenantId: null, domainId: null }, contractId, body?.payload ?? {});
  }
}
