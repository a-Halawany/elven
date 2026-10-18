/**
 * B81 §SI (0119_b81_x_si) — THE HTTP SURFACE of the person's own saved searches and intent records.
 *
 * DOMAIN — base /v1/tenants/:t/domains/:d/shell:
 *   search/read          shell.search.read (audited; the caller's OWN saved searches of this domain + recent intent records; `savedSearchId` = one
 *                        version exactly as saved)
 *   search/save          shell.search.save (append-only version; every searched leg's receipt verified; `(stale)` when the save read an older
 *                        version or a read is older than the window)
 *   intents/record       shell.intent.record (append-only; nothing preselected; a command only as its Command Review's hand-off)
 *
 * The searching itself is NOT here: the web federates the existing governed reads (graph search, strategy list, catalog search, exposures
 * list, decision packages list) — each its own audited read under its own action. Refusals in the server's words: `saved search rejected
 * (<class>): …`, `intent record rejected (<class>): …`.
 */
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { EyeRequest } from '../../pipeline/http.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { requestOf } from '../navigation/navigation.service.js';
import { SearchService } from './search.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

@Controller('/v1/tenants/:tenantId/domains/:domainId/shell')
export class SearchController {
  constructor(private readonly searches: SearchService) {}

  @Post('/search/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.searches.read(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  @Post('/search/save')
  async save(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.searches.save(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }

  @Post('/intents/record')
  async record(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.searches.record(envelope, principal, { tenantId, domainId }, body.payload ?? {});
  }
}
