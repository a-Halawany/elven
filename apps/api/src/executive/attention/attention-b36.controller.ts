/**
 * THE ATTENTION COMPLETION ROUTES — CP-6 B36 part `attention` (0094 §A; F-P6-07 completes), under the executive module beside
 * executive.controller.ts's attention routes (0083 → 0090). Every write is human-gated at the PDP and performed by a SECURITY DEFINER port
 * that asserts its own action; every read is a consequential read under executive.attention.queue.read (the executive operator and the
 * board member among its roles).
 *
 *   POST /executive/attention/queue                         the queue UNDER the principal's context: {context, policy, hold, items, filtered, counts, ranking}
 *   POST /executive/attention/queue/context                 the context, the policy in force and the hold alone
 *   POST /executive/attention/acts/:actId/resume            (n) the settle re-run of a settle_failed act — the governed action never re-executed
 *   POST /executive/attention/items/:itemId/accept-priority (o1) the accountable person's acceptance: digest, consequence preview, signature
 *   POST /executive/attention/items/:itemId/acceptance      the acceptance with its signatures (verified against the bound key), the acts, the resumptions
 *   POST /executive/attention/holds/list                    (o2) the holds; POST /executive/attention/holds/:holdId/release — the executive's release
 *   POST /executive/attention/recovery/states               (o3) the degraded states with their routes and last outcomes; POST /executive/attention/recovery/run {state}
 *   POST /executive/attention/recovery/fixtures/arm         the SYNTHETIC one-shot settle fault (how (n) is reproduced; closes nothing on its own)
 *   POST /executive/attention/forums/convene | list | :roomId/queue   (o5) governance forums over the same memory
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { AttentionB36Service, validateAcceptPriority, validateForum, validateLimit, validateRecover, validateRelease } from './attention-b36.service.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const idOr422 = (v: string, name: string, correlationId: string): void => { if (!UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${name} is a uuid`), 422); };

@Controller('/v1/tenants/:tenantId/domains/:domainId')
export class AttentionB36Controller {
  constructor(private readonly svc: AttentionB36Service) {}

  /* (o4) the queue under the context */
  @Post('/executive/attention/queue')
  async queue(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    return this.svc.queue(envelope, principal, tenantId, domainId, validateLimit(body.payload ?? {}));
  }
  @Post('/executive/attention/queue/context')
  async queueContext(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.context(envelope, principal, tenantId, domainId);
  }

  /* (n) the resume */
  @Post('/executive/attention/acts/:actId/resume')
  async resume(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actId') actId: string) {
    const { envelope, principal } = ctx(req);
    idOr422(actId, 'actId', envelope.correlation_id);
    return this.svc.resume(envelope, principal, tenantId, domainId, actId);
  }

  /* (o1) accept-priority */
  @Post('/executive/attention/items/:itemId/accept-priority')
  async acceptPriority(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    idOr422(itemId, 'itemId', envelope.correlation_id);
    const intake = validateAcceptPriority(body.payload ?? {}, envelope.correlation_id);
    return this.svc.acceptPriority(envelope, principal, tenantId, domainId, itemId, intake.note);
  }
  @Post('/executive/attention/items/:itemId/acceptance')
  async acceptance(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string) {
    const { envelope, principal } = ctx(req);
    idOr422(itemId, 'itemId', envelope.correlation_id);
    return this.svc.acceptanceOf(envelope, principal, tenantId, domainId, itemId);
  }

  /* (o2) the holds and the release — the evaluation that HOLDS is executive.controller.ts's /executive/attention/evaluations/run (0086's route, acting since 0094) */
  @Post('/executive/attention/holds/list')
  async holds(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    return this.svc.holds(envelope, principal, tenantId, domainId, validateLimit(body.payload ?? {}));
  }
  @Post('/executive/attention/holds/:holdId/release')
  async release(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('holdId') holdId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    idOr422(holdId, 'holdId', envelope.correlation_id);
    const intake = validateRelease(body.payload ?? {}, envelope.correlation_id);
    return this.svc.release(envelope, principal, tenantId, domainId, holdId, intake.reason);
  }

  /* (o3) the degraded states and the recovery routes */
  @Post('/executive/attention/recovery/states')
  async degradedStates(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.degradedStates(envelope, principal, tenantId, domainId);
  }
  @Post('/executive/attention/recovery/run')
  async recover(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateRecover(body.payload ?? {}, envelope.correlation_id);
    return this.svc.recover(envelope, principal, tenantId, domainId, intake);
  }
  @Post('/executive/attention/recovery/fixtures/arm')
  async armFixture(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    if ((body.payload ?? {})['fixture'] !== 'settle_fault') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'payload.fixture is settle_fault (the SYNTHETIC one-shot settle fault of the next act in this process)'), 422);
    return this.svc.armSettleFault(envelope, principal, tenantId, domainId);
  }

  /* (o5) forums */
  @Post('/executive/attention/forums/convene')
  async convene(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateForum(body.payload ?? {}, envelope.correlation_id);
    return this.svc.convene(envelope, principal, tenantId, domainId, intake);
  }
  @Post('/executive/attention/forums/list')
  async forums(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.forums(envelope, principal, tenantId, domainId);
  }
  @Post('/executive/attention/forums/:roomId/queue')
  async forumQueue(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('roomId') roomId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    idOr422(roomId, 'roomId', envelope.correlation_id);
    return this.svc.forumQueue(envelope, principal, tenantId, domainId, roomId, validateLimit(body.payload ?? {}));
  }
}
