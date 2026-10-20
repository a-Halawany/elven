/**
 * B50 §LC (0120_b50_x_lc) — THE HTTP SURFACE of the work-object lifecycle, inside the existing `api.objects` unit (DESIGN D13: no new unit).
 *
 * DOMAIN — base /v1/tenants/:t/domains/:d/lifecycle:
 *   profiles                                     objects.lifecycle.read   every type's lifecycle profile
 *   reconcile                                    objects.lifecycle.read   the domain's lifecycle disagreements (module vs canonical; ledger vs versions)
 *   verify-export                                objects.lifecycle.read   an exported lifecycle document verified (digests recomputed, replay re-derived)
 *   work-objects/author                          objects.work_object.author        (human-gated) a person authors the draft, version 1
 *   :type/list                                   objects.lifecycle.read   a type's work objects with their states
 *   :type/:objectId/history                      objects.lifecycle.read   versions, every attempted transition, proposals, the unresolved
 *   :type/:objectId/replay                       objects.lifecycle.read   the state at an instant (asOf)
 *   :type/:objectId/export                       objects.lifecycle.read   the self-verifying lifecycle document
 *   :type/:objectId/transition                   objects.lifecycle.transition      (human-gated) the owner / reviewer / approver act
 *   :type/:objectId/proposals/propose            objects.lifecycle.propose          a view, an agent, a model, an import or a projection proposes
 *   :type/:objectId/proposals/:proposalId/decide objects.lifecycle.proposal.decide  (human-gated) the owner accepts or declines
 *
 * Refusals in the server's words: `lifecycle transition rejected (<class>): …` (a rejected transition carries its recorded outcome),
 * `lifecycle proposal rejected (<class>): …`, `work object rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { EyeRequest } from '../../pipeline/http.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { LifecycleService, requestOf } from './lifecycle.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

@Controller('/v1/tenants/:tenantId/domains/:domainId/lifecycle')
export class LifecycleController {
  constructor(private readonly svc: LifecycleService) {}

  @Post('/profiles')
  async profiles(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.profiles(envelope, principal, { tenantId, domainId });
  }

  @Post('/reconcile')
  async reconcile(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.reconcile(envelope, principal, { tenantId, domainId });
  }

  @Post('/verify-export')
  async verifyExport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.verifyExport(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/work-objects/author')
  async author(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.author(envelope, principal, { tenantId, domainId }, body?.payload ?? {});
  }

  @Post('/:type/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('type') type: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.list(envelope, principal, { tenantId, domainId }, type, body?.payload ?? {});
  }

  @Post('/:type/:objectId/history')
  async history(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('type') type: string, @Param('objectId') objectId: string) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.history(envelope, principal, { tenantId, domainId }, type, objectId);
  }

  @Post('/:type/:objectId/replay')
  async replay(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('type') type: string, @Param('objectId') objectId: string,
               @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.replay(envelope, principal, { tenantId, domainId }, type, objectId, body?.payload ?? {});
  }

  @Post('/:type/:objectId/export')
  async exportDoc(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('type') type: string, @Param('objectId') objectId: string) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.exportDoc(envelope, principal, { tenantId, domainId }, type, objectId);
  }

  @Post('/:type/:objectId/transition')
  async transition(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('type') type: string, @Param('objectId') objectId: string,
                   @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.transition(envelope, principal, { tenantId, domainId }, type, objectId, body?.payload ?? {});
  }

  @Post('/:type/:objectId/proposals/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('type') type: string, @Param('objectId') objectId: string,
                @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.propose(envelope, principal, { tenantId, domainId }, type, objectId, body?.payload ?? {});
  }

  @Post('/:type/:objectId/proposals/:proposalId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('type') type: string, @Param('objectId') objectId: string,
               @Param('proposalId') proposalId: string, @Body() body: Payload) {
    const { envelope, principal } = requestOf(req, requireCorrelation(req));
    return this.svc.decide(envelope, principal, { tenantId, domainId }, type, objectId, proposalId, body?.payload ?? {});
  }
}
