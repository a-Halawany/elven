/**
 * B81 §LY-G (0119_b81_x_lyg) — THE HTTP SURFACE of the person's own layout preferences (density, the saved layout per composition).
 *
 * DOMAIN — base /v1/tenants/:t/domains/:d/shell:
 *   preferences/read                         shell.preferences.read (audited; the caller's OWN preferences)
 *   preferences/save                         shell.preferences.save (append-only version; `(stale)` when the save read an older version)
 * PLATFORM — base /v1/shell (the admin workspace):
 *   preferences/read · preferences/save      the same actions at the PLATFORM scope (no tenant, no domain)
 *
 * Refusals in the server's words: `layout preference rejected (<class>): …`.
 */
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { EyeRequest } from '../../pipeline/http.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { requestOf } from '../navigation/navigation.service.js';
import { PreferencesService } from './preferences.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

@Controller('/v1/tenants/:tenantId/domains/:domainId/shell')
export class PreferencesDomainController {
  constructor(private readonly prefs: PreferencesService) {}

  @Post('/preferences/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.prefs.read(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  @Post('/preferences/save')
  async save(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.prefs.save(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }
}

@Controller('/v1/shell')
export class PreferencesPlatformController {
  constructor(private readonly prefs: PreferencesService) {}

  @Post('/preferences/read')
  async read(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.prefs.read(envelope, principal, { tenantId: null, domainId: null }, body.payload ?? {});
  }

  @Post('/preferences/save')
  async save(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.prefs.save(envelope, principal, { tenantId: null, domainId: null }, body.payload ?? {});
  }
}
