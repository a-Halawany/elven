/**
 * THE B36 COLLABORATION ROUTES — CP-6 B36 part `collab` (0094 §C1–§C3; F-P6-14 completes), under the executive module beside
 * workflow.controller.ts. Every write is human-gated at the PDP and performed by a SECURITY DEFINER port that asserts its own action; every
 * read is a consequential read.
 *
 *   POST /v1/collab/invitations/pickup                                  (t) THE PICKUP — no principal: {invitationId, code} → the acceptance material ONCE
 *   POST /v1/tenants/:t/domains/:d/executive/collab/self                (q) the external's bounded surface (executive.collab.read)
 *   POST …/executive/collab/grants/:grantId/deliver                      (t) the provisioner re-drives a delivery that failed after the activation
 *   POST …/executive/collab/grants/:grantId/mailbox                      (t) the SYNTHETIC mailbox message (the code inside; never the token) — the
 *                                                                        identity administrators' read (executive.collab.mailbox.read); the demo's path
 *   POST …/executive/collab/grants/:grantId/delivery                     (t) the delivery's state (delivered | picked_up | locked | expired; the attempts) — a member's read
 *   POST …/executive/tasks/:taskId/dependencies                          (r) declare: {depends_on} — finish-to-start; a cycle refused
 *   POST …/executive/tasks/:taskId/dependencies/get                      (r) what a task waits on and what waits on it
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { Public, recordSecurityFailure, type EyeRequest } from '../../pipeline/http.js';
import { AuditService } from '../../audit/audit.service.js';
import { assertUuid } from './workflow.service.js';
import { CollabService } from './collab.service.js';
import { CollabB36Capability } from './collab-b36.capabilities.js';
import { InvitationDeliveryService } from './invitation-delivery.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
/** Where an unauthenticated pickup came from, as the request states it (a loopback in the harness and the demonstration). */
const fromOf = (req: EyeRequest): string => {
  const fwd = req.headers?.['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : typeof fwd === 'string' ? fwd.split(',')[0] : undefined;
  const ip = (first ?? req.ip ?? req.socket?.remoteAddress ?? 'unstated').trim();
  return ip === '' ? 'unstated' : ip.slice(0, 200);
};

/** THE PICKUP — the addressed person is not yet a principal: the route is public and the mailbox's one-time code is its authority. */
@Controller('/v1/collab')
export class InvitationPickupController {
  constructor(private readonly delivery: InvitationDeliveryService, private readonly audit: AuditService) {}

  @Public()
  @Post('/invitations/pickup')
  async pickup(@Req() req: EyeRequest, @Body() body: Payload) {
    const correlationId = requireCorrelation(req);
    const p = body.payload ?? {};
    if (typeof p['invitationId'] !== 'string' || typeof p['code'] !== 'string') {
      await recordSecurityFailure(this.audit, req, 'validation_failed', 'EYE-REQ-001', correlationId, ['pickup payload malformed: {invitationId, code}']);
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'payload is {invitationId, code}'), 400);
    }
    try {
      return await this.delivery.pickup(correlationId, p['invitationId'], p['code'], fromOf(req));
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 403) {
        await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-AUT-001', correlationId, ['invitation pickup: the code did not match']);
      }
      throw e;
    }
  }
}

@Controller('/v1/tenants/:tenantId/domains/:domainId')
export class CollabB36Controller {
  constructor(private readonly pipeline: PipelineService, private readonly collab: CollabService, private readonly delivery: InvitationDeliveryService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** (q) The external collaborator's bounded surface: the grants that name the caller — nothing of the tenant beyond. A member reads its own (none). */
  @Post('/executive/collab/self')
  async self(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.collab.read', 'CGR', null), CollabB36Capability.surface,
      async (cap) => cap.grantSurface(principal.principalId));
    return { surface: out.result, receipt: receipt(out) };
  }

  /** (t) The provisioner re-drives a delivery that failed after the activation (the material still in this process's sink). */
  @Post('/executive/collab/grants/:grantId/deliver')
  async deliver(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('grantId') grantId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(grantId, envelope.correlation_id, 'grant');
    return { delivery: await this.delivery.redeliver(envelope, principal, tenantId, domainId, grantId) };
  }

  /**
   * (t) THE SYNTHETIC MAILBOX as the addressed person would read it — the message with the pickup CODE, never the token. An identity
   * administrator's consequential read (executive.collab.mailbox.read): the local supported path a demonstration reads the code from
   * (a real provider delivers to the invitee's own mailbox — owner decision D6). The read is recorded like every other.
   */
  @Post('/executive/collab/grants/:grantId/mailbox')
  async mailbox(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('grantId') grantId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(grantId, envelope.correlation_id, 'grant');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.collab.mailbox.read', 'CGR', grantId), CollabB36Capability.delivery,
      async (cap) => {
        const d = await cap.deliveryOf(grantId);
        if (d === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no delivered invitation matches'), 404);
        const m = this.collab.mailboxMessage(grantId);
        return { delivery: d, message: m === null ? null : m, note: m === null ? 'the message is not held by this process (delivered by another, or the process restarted): the record of its delivery stands' : 'SYNTHETIC — the demo mailbox; the code inside is the invitee\'s' };
      });
    return { ...out.result, receipt: receipt(out) };
  }

  /** (t) The delivery's state as a member reads it (never the hash, never the sealed material): delivered, picked up, locked or expired; the attempts. */
  @Post('/executive/collab/grants/:grantId/delivery')
  async deliveryState(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('grantId') grantId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(grantId, envelope.correlation_id, 'grant');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.collab.read', 'CGR', grantId), CollabB36Capability.delivery,
      async (cap) => ({ delivery: await cap.deliveryOf(grantId) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** (r) DECLARE that a task waits on another (finish-to-start): the holder, the opener, the workspace's owner, an executive or a domain administrator. */
  @Post('/executive/tasks/:taskId/dependencies')
  async declareDependency(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('taskId') taskId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(taskId, envelope.correlation_id, 'task');
    const dependsOn = body.payload?.['depends_on'];
    if (typeof dependsOn !== 'string' || !UUID.test(dependsOn)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'payload.depends_on is the task this one waits on (a uuid)'), 422);
    const dependencyId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.task.dependency.declare', 'HTK', taskId), CollabB36Capability.dependency,
      async (cap) => ({ result: await cap.declareDependency({ dependencyId, tenantId, domainId, taskId, dependsOn: dependsOn.toLowerCase(), actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'HTK', targetId: taskId, targetVersion: null, outboxEvent: null }));
    return { dependency: out.result, receipt: receipt(out) };
  }

  /** (r) What a task waits on (each prerequisite, its state, whether met) and what waits on it. */
  @Post('/executive/tasks/:taskId/dependencies/get')
  async dependencies(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('taskId') taskId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(taskId, envelope.correlation_id, 'task');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.task.read', 'HTK', taskId), CollabB36Capability.dependency,
      async (cap) => ({ dependencies: await cap.dependenciesOf(taskId) }));
    return { ...out.result, receipt: receipt(out) };
  }
}
