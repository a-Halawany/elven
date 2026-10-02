/**
 * THE HTTP SURFACE OF THE DURABLE WORKFLOW ENGINE, THE HUMAN TASKS AND THE COLLABORATION WORKSPACES — CP-6 B34 part `workflow` (migration
 * 0090 §W; F-P6-14). Same envelope, same capabilities, same receipts as the executive controller: every write is one governed write whose
 * port asserts the route's own action; every read is a consequential read. The actions are EXACT PDP rules (pdp.service.ts, the B34
 * workflow block): an external collaborator holds executive.collab.{read,discuss,review}, executive.task.complete and the acceptance of its
 * own invitation — nothing else — and every collaboration port checks its live grant. B34-F1 (0091): the invitation is the owner's REQUEST
 * and an identity administrator's PROVISIONING (executive.collab.provision); every identity row — the invitee's principal, its credentials,
 * their revocation — is written by the identity authority (collab-identity.service.ts), never by a collaboration port.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { bindingReaches } from '../../shared/clearance.js';
import { WorkflowCapability } from './workflow.capabilities.js';
import { WorkflowService, assertUuid, validateAdvance, validateComplete, validateDefine, validateDrill, validateReason, validateReassign, validateStart } from './workflow.service.js';
import { CollabIdentityService } from './collab-identity.service.js';
import { CollabService, validateAccept, validateArtifact, validateInvite, validateMessage, validateOpenWorkspace, validateParticipant, validateReview, validateReviewRequest } from './collab.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Controller('/v1/tenants/:tenantId/domains/:domainId')
export class WorkflowController {
  constructor(private readonly pipeline: PipelineService, private readonly workflow: WorkflowService, private readonly collab: CollabService,
              /* B34-F1 (0091) */ private readonly collabIdentity: CollabIdentityService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── the workflow engine ─────────────────────────
  /** Publish a definition version (a new version of its key; running instances keep their pin). */
  @Post('/executive/workflow/definitions/publish')
  async publishWorkflowDefinition(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateDefine(body.payload ?? {}, envelope.correlation_id);
    const definitionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.define', 'WFD', definitionId), WorkflowCapability.workflow,
      async (cap) => {
        const r = await cap.publishDefinition({ definitionId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'WFD', targetId: definitionId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { definition: out.result, receipt: receipt(out) };
  }

  @Post('/executive/workflow/definitions/list')
  async listWorkflowDefinitions(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.read', 'WFD', null), WorkflowCapability.read,
      async (cap) => this.workflow.definitions(cap, body.payload ?? {}));
    return { ...out.result, receipt: receipt(out) };
  }

  /** Start an instance (idempotent on start_key): pinned to the newest version's digest. */
  @Post('/executive/workflow/instances/start')
  async startWorkflow(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateStart(body.payload ?? {}, envelope.correlation_id);
    const instanceId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.start', 'WFI', instanceId), WorkflowCapability.workflow,
      async (cap) => {
        const r = await cap.startWorkflow({ instanceId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'WFI', targetId: String(r['instance_id']), targetVersion: String(r['seq']), outboxEvent: null };
      });
    return { instance: out.result, receipt: receipt(out) };
  }

  @Post('/executive/workflow/instances/list')
  async listWorkflowInstances(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.read', 'WFI', null), WorkflowCapability.read,
      async (cap) => this.workflow.instances(cap, body.payload ?? {}));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/executive/workflow/instances/:instanceId/get')
  async getWorkflowInstance(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('instanceId') instanceId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(instanceId, envelope.correlation_id, 'instance');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.read', 'WFI', instanceId), WorkflowCapability.read,
      async (cap) => this.workflow.instance(cap, instanceId, envelope.correlation_id));
    return { ...out.result, receipt: receipt(out) };
  }

  /** Advance under a lease (a crashed worker's lease expires; the next resumes from the committed seq; a duplicate answers repeated). */
  @Post('/executive/workflow/instances/:instanceId/advance')
  async advanceWorkflow(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('instanceId') instanceId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(instanceId, envelope.correlation_id, 'instance');
    const p = validateAdvance(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.advance', 'WFI', instanceId), WorkflowCapability.workflow,
      async (cap) => {
        const r = await cap.advanceWorkflow({ instanceId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'WFI', targetId: instanceId, targetVersion: String(r['seq']), outboxEvent: null };
      });
    return { transition: out.result, receipt: receipt(out) };
  }

  @Post('/executive/workflow/instances/:instanceId/compensate')
  async compensateWorkflow(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('instanceId') instanceId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(instanceId, envelope.correlation_id, 'instance');
    const p = validateReason(body.payload ?? {}, envelope.correlation_id, 'the instance is compensated');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.compensate', 'WFI', instanceId), WorkflowCapability.workflow,
      async (cap) => {
        const r = await cap.compensateWorkflow({ instanceId, tenantId, domainId, reason: p.reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'WFI', targetId: instanceId, targetVersion: null, outboxEvent: null };
      });
    return { compensation: out.result, receipt: receipt(out) };
  }

  @Post('/executive/workflow/timers/list')
  async listWorkflowTimers(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.read', 'WFT', null), WorkflowCapability.read,
      async (cap) => this.workflow.timers(cap, body.payload ?? {}));
    return { ...out.result, receipt: receipt(out) };
  }

  /** Run a drill (restart_replay, duplicate_task, duplicate_timer, definition_change) — recorded with its verdict. */
  @Post('/executive/workflow/drills/run')
  async runWorkflowDrill(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateDrill(body.payload ?? {}, envelope.correlation_id);
    const drillId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.drill', 'WDR', drillId), WorkflowCapability.workflow,
      async (cap) => {
        const r = await cap.runDrill({ drillId, tenantId, domainId, kind: p.kind, instanceId: p.instanceId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'WDR', targetId: drillId, targetVersion: '1', outboxEvent: null };
      });
    return { drill: out.result, receipt: receipt(out) };
  }

  @Post('/executive/workflow/drills/list')
  async listWorkflowDrills(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.workflow.read', 'WDR', null), WorkflowCapability.read,
      async (cap) => this.workflow.drills(cap, body.payload ?? {}));
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the human tasks ─────────────────────────
  /** My inbox: the tasks I hold (assigned, or unassigned with a candidate role I hold here), soonest deadline first, with the escalation chain. */
  @Post('/executive/tasks/inbox')
  async taskInbox(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const roles = principal.bindings.filter((b) => bindingReaches(b, { tenantId, domainId })).map((b) => b.roleCode);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.task.read', 'HTK', null), WorkflowCapability.read,
      async (cap) => this.workflow.inbox(cap, { principalId: principal.principalId, roles }, body.payload ?? {}));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/executive/tasks/:taskId/get')
  async getTask(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('taskId') taskId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(taskId, envelope.correlation_id, 'task');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.task.read', 'HTK', taskId), WorkflowCapability.read,
      async (cap) => this.workflow.task(cap, taskId, envelope.correlation_id));
    return { ...out.result, receipt: receipt(out) };
  }

  /** Reassign: the work moves to a member; a gate task's stored eligibility is re-checked (reassignment moves work, never authority). */
  @Post('/executive/tasks/:taskId/reassign')
  async reassignTask(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('taskId') taskId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(taskId, envelope.correlation_id, 'task');
    const p = validateReassign(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.task.reassign', 'HTK', taskId), WorkflowCapability.task,
      async (cap) => {
        const r = await cap.reassignTask({ taskId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'HTK', targetId: taskId, targetVersion: null, outboxEvent: null };
      });
    return { task: out.result, receipt: receipt(out) };
  }

  /** Complete a task directly — never a gate.* or commitment.* task (the port refuses: complete through the owning action). */
  @Post('/executive/tasks/:taskId/complete')
  async completeTask(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('taskId') taskId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(taskId, envelope.correlation_id, 'task');
    const p = validateComplete(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.task.complete', 'HTK', taskId), WorkflowCapability.task,
      async (cap) => {
        const r = await cap.completeTask({ taskId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'HTK', targetId: taskId, targetVersion: null, outboxEvent: null };
      });
    return { task: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the collaboration workspaces ─────────────────────────
  @Post('/executive/collab/workspaces/open')
  async openWorkspace(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateOpenWorkspace(body.payload ?? {}, envelope.correlation_id);
    const workspaceId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.collab.workspace.open', 'CWS', workspaceId), WorkflowCapability.collab,
      async (cap) => {
        const r = await cap.openWorkspace({ workspaceId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CWS', targetId: workspaceId, targetVersion: '1', outboxEvent: null };
      });
    return { workspace: out.result, receipt: receipt(out) };
  }

  @Post('/executive/collab/workspaces/list')
  async listWorkspaces(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.collab.read', 'CWS', null), WorkflowCapability.read,
      async (cap) => this.collab.workspaces(cap, principal, { tenantId, domainId }, envelope.purpose_id ?? null));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/executive/collab/workspaces/:workspaceId/get')
  async getWorkspace(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('workspaceId') workspaceId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(workspaceId, envelope.correlation_id, 'workspace');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.collab.read', 'CWS', workspaceId), WorkflowCapability.read,
      async (cap) => this.collab.workspace(cap, principal, { tenantId, domainId }, envelope.purpose_id ?? null, workspaceId, envelope.correlation_id));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/executive/collab/workspaces/:workspaceId/participants')
  async setParticipant(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('workspaceId') workspaceId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(workspaceId, envelope.correlation_id, 'workspace');
    const p = validateParticipant(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.collab.participant.set', 'CWS', workspaceId), WorkflowCapability.collab,
      async (cap) => ({ result: await cap.setParticipant({ workspaceId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'CWS', targetId: workspaceId, targetVersion: null, outboxEvent: null }));
    return { participant: out.result, receipt: receipt(out) };
  }

  @Post('/executive/collab/workspaces/:workspaceId/messages')
  async postMessage(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('workspaceId') workspaceId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(workspaceId, envelope.correlation_id, 'workspace');
    const p = validateMessage(body.payload ?? {}, envelope.correlation_id);
    const messageId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.collab.discuss', 'CWS', workspaceId), WorkflowCapability.collab,
      async (cap) => ({ result: await cap.postMessage({ messageId, tenantId, domainId, workspaceId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'CWS', targetId: workspaceId, targetVersion: null, outboxEvent: null }));
    return { message: out.result, receipt: receipt(out) };
  }

  @Post('/executive/collab/workspaces/:workspaceId/artifacts')
  async addArtifact(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('workspaceId') workspaceId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(workspaceId, envelope.correlation_id, 'workspace');
    const p = validateArtifact(body.payload ?? {}, envelope.correlation_id);
    const artifactId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.collab.discuss', 'CWS', workspaceId), WorkflowCapability.collab,
      async (cap) => ({ result: await cap.addArtifact({ artifactId, tenantId, domainId, workspaceId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'CWS', targetId: workspaceId, targetVersion: null, outboxEvent: null }));
    return { artifact: out.result, receipt: receipt(out) };
  }

  /** Request a review: a collab.review task to a participant with a deadline and its escalation (idempotent on request_key). */
  @Post('/executive/collab/workspaces/:workspaceId/review-requests')
  async requestReview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('workspaceId') workspaceId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(workspaceId, envelope.correlation_id, 'workspace');
    const p = validateReviewRequest(body.payload ?? {}, envelope.correlation_id);
    const taskId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.collab.review.request', 'HTK', taskId), WorkflowCapability.collab,
      async (cap) => {
        const r = await cap.requestReview({ taskId, tenantId, domainId, workspaceId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'HTK', targetId: String(r['task_id']), targetVersion: null, outboxEvent: null };
      });
    return { task: out.result, receipt: receipt(out) };
  }

  @Post('/executive/collab/workspaces/:workspaceId/reviews')
  async recordReview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('workspaceId') workspaceId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(workspaceId, envelope.correlation_id, 'workspace');
    const p = validateReview(body.payload ?? {}, envelope.correlation_id);
    const reviewId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.collab.review', 'CWS', workspaceId), WorkflowCapability.collab,
      async (cap) => ({ result: await cap.recordReview({ reviewId, tenantId, domainId, workspaceId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'CWS', targetId: workspaceId, targetVersion: null, outboxEvent: null }));
    return { review: out.result, receipt: receipt(out) };
  }

  /* B34-F1 (0091): THE INVITATION IS TWO GOVERNED ACTS, AND EVERY IDENTITY ROW IS THE IDENTITY AUTHORITY'S (collab-identity.service.ts) */
  /**
   * REQUEST an invitation (the workspace's owner): the grant `requested` — who (a display name, a SYNTHETIC contact label), the audience
   * ceiling, the expiry (≤ 30 days). No principal and no credential yet: an identity administrator provisions it.
   */
  @Post('/executive/collab/workspaces/:workspaceId/invitations')
  async invite(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('workspaceId') workspaceId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(workspaceId, envelope.correlation_id, 'workspace');
    const p = validateInvite(body.payload ?? {}, envelope.correlation_id, Date.now());
    const grantId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.collab.invite', 'CGR', grantId), WorkflowCapability.collab,
      async (cap) => ({ result: await cap.requestInvite({ grantId, tenantId, domainId, workspaceId, displayName: p.displayName, contactLabel: p.contactLabel, ceiling: p.ceiling, expiresAt: p.expiresAt,
                                                          actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'CGR', targetId: grantId, targetVersion: '0', outboxEvent: null }));
    return { grant: out.result, receipt: receipt(out) };
  }

  /**
   * PROVISION a requested invitation (an identity administrator — platform_admin or tenant_admin, never the requester): the invitee's
   * principal created by identity.create_principal on the IDENTITY authority, its one-time invitation credential issued by the identity
   * ports, the grant activated (`invited`) once what they wrote is verified; the invitation placed in the SYNTHETIC mailbox. A failure
   * after the identity write is compensated (the credential revoked). The response never carries the token.
   */
  @Post('/executive/collab/grants/:grantId/provision')
  async provisionInvitation(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('grantId') grantId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(grantId, envelope.correlation_id, 'grant');
    return this.collabIdentity.provision(envelope, principal, tenantId, domainId, grantId);
  }

  /**
   * ACCEPT (the invitee, signed in with the invitation token): the acceptance recorded, then the invitation credential ROTATED to their own
   * password by the identity authority — a credential expiring with the grant; every session revoked (sign in again with the password).
   */
  @Post('/executive/collab/grants/:grantId/accept')
  async acceptInvitation(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('grantId') grantId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(grantId, envelope.correlation_id, 'grant');
    const p = validateAccept(body.payload ?? {}, envelope.correlation_id);
    return this.collabIdentity.accept(envelope, principal, tenantId, domainId, grantId, p.token, p.password, this.collab.tokenHash(p.token));
  }

  /** REVOKE (the workspace's owner): the grant ended, then the external's credentials, sessions and epoch revoked by the identity authority. */
  @Post('/executive/collab/grants/:grantId/revoke')
  async revokeGrant(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('grantId') grantId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(grantId, envelope.correlation_id, 'grant');
    const p = validateReason(body.payload ?? {}, envelope.correlation_id, 'the grant is revoked');
    return this.collabIdentity.revokeGrant(envelope, principal, tenantId, domainId, grantId, p.reason);
  }
  /* end B34-F1 */
}
