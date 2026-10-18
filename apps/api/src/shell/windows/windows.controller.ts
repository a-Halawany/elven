/**
 * B81 §LY-M (0119_b81_x_lym) — THE HTTP SURFACE of the person's session handoffs and displays (PAT-45, PAT-46, UX-16-001…005).
 *
 * DOMAIN — base /v1/tenants/:t/domains/:d/shell:
 *   handoffs/read · handoffs/offer · handoffs/claim · handoffs/revoke     shell.handoff.{read,offer,claim,revoke}
 *   presentations/read · presentations/publish                            shell.presentation.{read,publish}
 * PLATFORM — base /v1/shell (the admin workspace):
 *   handoffs/read · handoffs/offer · handoffs/claim · handoffs/revoke     the same actions at the PLATFORM scope (no display: a display shows a domain's work)
 *
 * Refusals in the server's words: `session handoff rejected (<class>): …`, `presentation state rejected (<class>): …`.
 */
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { EyeRequest } from '../../pipeline/http.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { requestOf } from '../navigation/navigation.service.js';
import { WindowsService } from './windows.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

@Controller('/v1/tenants/:tenantId/domains/:domainId/shell')
export class WindowsDomainController {
  constructor(private readonly windows: WindowsService) {}

  @Post('/handoffs/read')
  async handoffs(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.handoffs(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  @Post('/handoffs/offer')
  async offer(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.offer(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  @Post('/handoffs/claim')
  async claim(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.claim(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  @Post('/handoffs/revoke')
  async revoke(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.revoke(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  @Post('/presentations/read')
  async presentations(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.presentations(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  @Post('/presentations/publish')
  async publish(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.publish(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }
}

@Controller('/v1/shell')
export class WindowsPlatformController {
  constructor(private readonly windows: WindowsService) {}

  @Post('/handoffs/read')
  async handoffs(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.handoffs(envelope, principal, { tenantId: null, domainId: null }, body.payload ?? {});
  }

  @Post('/handoffs/offer')
  async offer(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.offer(envelope, principal, { tenantId: null, domainId: null }, body.payload ?? {});
  }

  @Post('/handoffs/claim')
  async claim(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.claim(envelope, principal, { tenantId: null, domainId: null }, body.payload ?? {});
  }

  @Post('/handoffs/revoke')
  async revoke(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.windows.revoke(envelope, principal, { tenantId: null, domainId: null }, body.payload ?? {});
  }
}
