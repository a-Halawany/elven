/**
 * B80 §SH (0118_b80_x_sh) — THE HTTP SURFACE of the shell's navigation state and deep links.
 *
 * DOMAIN — base /v1/tenants/:t/domains/:d/shell:
 *   navigation/read                          shell.navigation.read (audited; the caller's OWN states in this domain)
 *   navigation/save                          shell.navigation.save (append-only version; `(stale)` when the save read an older version)
 *   links/warnings/:warningId/as-of          prediction.read (the deep link's read: the warning AS OF an instant + the variance; reads only)
 * PLATFORM — base /v1/shell (the admin workspace):
 *   navigation/read · navigation/save        the same actions at the PLATFORM scope (no tenant, no domain)
 *
 * Refusals in the server's words: `navigation state rejected (<class>): …`, `warning as-of rejected (<class>): …`.
 */
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { EyeRequest } from '../../pipeline/http.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { NavigationService, requestOf } from './navigation.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

@Controller('/v1/tenants/:tenantId/domains/:domainId/shell')
export class NavigationDomainController {
  constructor(private readonly nav: NavigationService) {}

  @Post('/navigation/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.nav.read(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  @Post('/navigation/save')
  async save(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.nav.save(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  /** THE DEEP LINK (PAT-25): the warning's exact recorded state as of the link's instant, the variance against current — opening it writes nothing. */
  @Post('/links/warnings/:warningId/as-of')
  async warningAsOf(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('warningId') warningId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.nav.warningAsOf(envelope, principal, tenantId, domainId, warningId, (body.payload ?? {})['at']);
  }
}

@Controller('/v1/shell')
export class NavigationPlatformController {
  constructor(private readonly nav: NavigationService) {}

  @Post('/navigation/read')
  async read(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.nav.read(envelope, principal, { tenantId: null, domainId: null }, body.payload ?? {});
  }

  @Post('/navigation/save')
  async save(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.nav.save(envelope, principal, { tenantId: null, domainId: null }, body.payload ?? {});
  }
}
