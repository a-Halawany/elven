/**
 * EXECUTIVE OS — the HTTP surface of rooms and briefings. Same envelope, same
 * capabilities, same receipts; reading and writing stay separate decisions.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { ExecutiveCapability } from './executive.capabilities.js';
import { RoomService } from './rooms/room.service.js';
import { BriefingService } from './briefings/briefing.service.js';
import { AgentsService, renderReport, validateRegisterAgent, type AgentTask } from './agents/agents.service.js';
import { clearanceOf } from '../decision/clearance.js';
import { AgentWorkerService } from './agents/agent-worker.service.js';
import { DecisionCapability } from '../decision/decision.capabilities.js';
import { RequestsService, validateRequest } from './requests/requests.service.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
function instant(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

@Controller('/v1/tenants/:tenantId/domains/:domainId')
export class ExecutiveController {
  constructor(private readonly pipeline: PipelineService, private readonly rooms: RoomService, private readonly briefings: BriefingService, private readonly agents: AgentsService, private readonly worker: AgentWorkerService, private readonly requests: RequestsService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── rooms ─────────────────────────
  @Post('/rooms/open')
  async openRoom(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { packageId?: string; title?: string; reviewEveryDays?: number } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.packageId !== 'string') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'packageId is required'), 422);
    const roomId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'room.open', 'DRM', roomId), ExecutiveCapability.room,
      async (cap, scope) => {
        const r = await this.rooms.open(cap, scope, { packageId: p.packageId as string, title: String(p.title ?? ''), reviewEveryDays: Number(p.reviewEveryDays ?? 7) }, principal.principalId, envelope.correlation_id, roomId);
        return { result: r, targetType: 'DRM', targetId: roomId, targetVersion: '1', outboxEvent: null };
      });
    return { room: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/:roomId/membership')
  async membership(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('roomId') roomId: string, @Body() body: { payload?: { principal?: string; role?: string; op?: 'add' | 'remove' } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'room.membership', 'DRM', roomId), ExecutiveCapability.room,
      async (cap, scope) => {
        const r = await this.rooms.membership(cap, scope, roomId, { principal: String(p.principal ?? ''), role: String(p.role ?? 'observer'), op: p.op === 'remove' ? 'remove' : 'add' }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DRM', targetId: roomId, targetVersion: '1', outboxEvent: null };
      });
    return { membership: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/:roomId/cadence')
  async cadence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('roomId') roomId: string, @Body() body: { payload?: { reviewEveryDays?: number; nextReviewAt?: string | null } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'room.cadence', 'DRM', roomId), ExecutiveCapability.room,
      async (cap, scope) => {
        const r = await this.rooms.cadence(cap, scope, roomId, { everyDays: Number(p.reviewEveryDays ?? 7), nextReviewAt: typeof p.nextReviewAt === 'string' ? instant(p.nextReviewAt, new Date().toISOString()) : null }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DRM', targetId: roomId, targetVersion: '1', outboxEvent: null };
      });
    return { cadence: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/:roomId/review')
  async review(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('roomId') roomId: string, @Body() body: { payload?: { note?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.review', 'DRM', roomId), ExecutiveCapability.room,
      async (cap, scope) => {
        const r = await this.rooms.review(cap, scope, roomId, String(body.payload?.note ?? ''), principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DRM', targetId: roomId, targetVersion: '1', outboxEvent: null };
      });
    return { review: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/list')
  async listRooms(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'room.read', 'DRM', null), ExecutiveCapability.read, async (cap) => this.rooms.list(cap, principal.principalId));
    return { rooms: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/:roomId/get')
  async getRoom(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('roomId') roomId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'room.read', 'DRM', roomId), ExecutiveCapability.read, async (cap) => this.rooms.get(cap, roomId, principal.principalId, envelope.correlation_id));
    return { room: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── briefings ─────────────────────────
  @Post('/briefings/compose')
  async compose(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
                @Body() body: { payload?: { roomId?: string | null; knownAt?: string; priorBriefingId?: string | null; narrative?: string | null; narrativeCites?: string[] } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const briefingId = newId();
    const via: 'human' | 'agent' = principal.kind === 'agent' ? 'agent' : 'human';
    const out = await this.pipeline.write(envelope, principal, { ...this.route(tenantId, domainId, 'briefing.compose', 'BRF', briefingId), writableTargets: [briefingId] }, ExecutiveCapability.briefing,
      async (cap, scope) => {
        let agentId: string | null = null;
        if (via === 'agent') {
          const a = (await cap.readAgents().select(['agent_id' as never]).where('principal_id' as never, '=', principal.principalId as never).executeTakeFirst()) as { agent_id: string } | undefined;
          agentId = a?.agent_id ?? null;
        }
        const r = await this.briefings.compose(cap, scope, {
          roomId: typeof p.roomId === 'string' ? p.roomId : null, knownAt: instant(p.knownAt, new Date().toISOString()),
          priorBriefingId: p.priorBriefingId === undefined ? undefined : (typeof p.priorBriefingId === 'string' ? p.priorBriefingId : null),
          narrative: typeof p.narrative === 'string' ? p.narrative : null, narrativeCites: Array.isArray(p.narrativeCites) ? p.narrativeCites.filter((x): x is string => typeof x === 'string') : [],
        }, principal.principalId, via, agentId, envelope.purpose_id ?? 'briefing', envelope.correlation_id, briefingId, null,
        // the composition is returned to the composer: a human reads it under the clearance the target context gives (residual review R4a)
        via === 'human' ? clearanceOf(principal, { tenantId: scope.tenantId, domainId: scope.domainId }) : null);
        return { result: r, targetType: 'BRF', targetId: briefingId, targetVersion: '1', outboxEvent: null };
      });
    return { briefing: out.result, receipt: receipt(out) };
  }

  @Post('/briefings/list')
  async listBriefings(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { roomId?: string | null } }) {
    const { envelope, principal } = ctx(req);
    const roomId = typeof body.payload?.roomId === 'string' ? body.payload.roomId : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'briefing.read', 'BRF', null), ExecutiveCapability.read, async (cap, scope) => this.briefings.list(cap, principal, roomId, envelope.purpose_id ?? null, { tenantId: scope.tenantId, domainId: scope.domainId }));
    return { briefings: out.result, receipt: receipt(out) };
  }

  @Post('/briefings/:briefingId/get')
  async getBriefing(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('briefingId') briefingId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'briefing.read', 'BRF', briefingId), ExecutiveCapability.read, async (cap, scope) => this.briefings.get(cap, briefingId, principal, envelope.correlation_id, envelope.purpose_id ?? null, { tenantId: scope.tenantId, domainId: scope.domainId }));
    return { briefing: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── agents (P6-M6) ─────────────────────────
  @Post('/agents/decision/register')
  async registerAgent(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateRegisterAgent((body.payload ?? {}) as never, envelope.correlation_id);
    return this.agents.register(envelope, principal, tenantId, domainId, intake);
  }

  @Post('/agents/decision/:agentId/revoke')
  async revokeAgent(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('agentId') agentId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'agent.revoke', 'AGT', agentId), ExecutiveCapability.agent,
      async (cap) => { await cap.revokeAgent({ agentId, tenantId, domainId, reason: String(body.payload?.reason ?? ''), actor: principal.principalId, correlationId: envelope.correlation_id }); return { result: { agentId, status: 'revoked' }, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null }; });
    return { agent: out.result, receipt: receipt(out) };
  }

  @Post('/agents/decision/list')
  async listAgents(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'agent.read', 'AGT', null), ExecutiveCapability.read, async (cap, scope) => this.agents.list(cap, principal, { tenantId: scope.tenantId, domainId: scope.domainId }, envelope.purpose_id ?? null));
    return { ...out.result, planner: { reconciliation: this.worker.lastReconciliation(tenantId, domainId), recent_runs: this.worker.recentRuns(tenantId, domainId) }, receipt: receipt(out) };
  }

  /** An operator's trigger: recorded as the operator's governed act; the run then happens under the AGENT's own session. */
  @Post('/agents/decision/:agentId/run')
  async runAgent(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('agentId') agentId: string,
                 @Body() body: { payload?: { task?: AgentTask; roomId?: string | null; packageId?: string | null; version?: number | null } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const task = p.task ?? 'briefing';
    if (!['draft', 'briefing', 'report', 'monitor'].includes(task)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'task is draft, briefing, report or monitor'), 422);
    const trigger = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'agent.trigger', 'AGT', agentId), ExecutiveCapability.read,
      async () => ({ result: { agentId, task, triggeredBy: principal.principalId }, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null }));
    const run = await this.agents.run({ agentId, tenantId, domainId, task, trigger: { kind: 'operator', principalId: principal.principalId, ref: trigger.policyDecisionId },
      roomId: typeof p.roomId === 'string' ? p.roomId : null, packageId: typeof p.packageId === 'string' ? p.packageId : null, version: Number.isInteger(p.version) ? (p.version as number) : null, correlationId: envelope.correlation_id });
    // The agent finished its own authorized work; the OPERATOR receives the run's metadata and only the outputs the operator may read —
    // the same decision as the stored-output list (residual review R4c), recorded as the operator's governed read of the run.
    const seen = await this.pipeline.consequentialRead({ ...envelope, action: 'agent.read', object_type: 'RUN', object_id: run.runId, message_id: newId(), side_effect_class: 'none', consequence_class: 'C1' } as typeof envelope, principal, this.route(tenantId, domainId, 'agent.read', 'RUN', run.runId), ExecutiveCapability.read,
      async (cap, scope) => this.agents.redactRun(cap, { run_id: run.runId, agent_id: run.agentId, task, outcome: run.outcome, spent: run.spent, stop_reason: run.stopReason, refusals: run.refusals, outputs: run.outputs, escalated_to: run.escalatedTo,
                                                        package_id: typeof p.packageId === 'string' ? p.packageId : null, room_id: typeof p.roomId === 'string' ? p.roomId : null },
                                                  principal, envelope.purpose_id ?? null, { tenantId: scope.tenantId, domainId: scope.domainId }));
    const r = seen.result;
    return { run: { runId: run.runId, agentId: run.agentId, outcome: run.outcome, spent: run.spent, stopReason: run.stopReason, refusals: run.refusals, outputs: r['outputs'] as Record<string, unknown>, escalatedTo: run.escalatedTo }, receipt: receipt(trigger) };
  }

  /** The planner: bind a room's review cadence to the scheduler with the domain's active briefing agent. */
  @Post('/agents/decision/schedule')
  async scheduleRoom(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { roomId?: string; agentId?: string; cadenceSeconds?: number } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.roomId !== 'string' || typeof p.agentId !== 'string') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'roomId and agentId are required'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'agent.trigger', 'DRM', p.roomId), ExecutiveCapability.read,
      async (cap) => {
        const room = (await cap.readRooms().selectAll().where('room_id' as never, '=', p.roomId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
        if (room === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no such room'), 404);
        const cadence = Number(p.cadenceSeconds ?? Number(room['review_every_days']) * 86_400);
        const r = await this.worker.scheduleRoom(tenantId, domainId, p.roomId as string, p.agentId as string, cadence);
        return { result: { ...r, roomId: p.roomId, agentId: p.agentId, scheduler_enabled: this.worker !== undefined }, targetType: 'DRM', targetId: p.roomId as string, targetVersion: '1', outboxEvent: null };
      });
    return { schedule: out.result, receipt: receipt(out) };
  }

  @Post('/reports/:packageId/render')
  async report(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'report.render', 'DPK', packageId), DecisionCapability.read,
      async (cap, scope) => renderReport(cap, packageId, clearanceOf(principal, { tenantId: scope.tenantId, domainId: scope.domainId }), { principal_id: principal.principalId, method: 'report-render@1.0.0', via: 'human' }, envelope.correlation_id,
        { purpose: envelope.purpose_id ?? 'decision', member: principal.principalId }));
    if (out.result.refused === true) throw new HttpException(errorBody('EYE_AUT_001', envelope.correlation_id, out.result.reason), 403);
    return { report: out.result, receipt: receipt(out) };
  }

  /** The package's workflow steps and, since 0066 §9, the follow-ups on its agenda (overdue read against now). */
  @Post('/workflow/:packageId')
  async workflow(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', packageId), ExecutiveCapability.read,
      async (cap) => ({ workflow: await cap.workflowOf({ packageId }), follow_ups: await this.requests.followUps(cap, { packageId }) }));
    return { workflow: out.result.workflow, follow_ups: out.result.follow_ups, receipt: receipt(out) };
  }

  // ───────────────────────── typed requests (0066 §9, L10-I04 ExecutiveActionRequested) ─────────────────────────
  /**
   * A person's typed request: human-gated, idempotent on the requester's request_key under the request's digest, routed
   * to the responsible capability or effected in the write; ExecutiveActionRequested published for a new request. An
   * `analysis` request then runs the agent under its own session (trigger kind `request`) and the run fulfils the request.
   */
  @Post('/executive/requests')
  async openRequest(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateRequest(body.payload ?? {}, envelope.correlation_id);
    const requestId = newId();
    // An ANALYSIS request triggers an agent run: the requester's authority to trigger one (agent.trigger — the operator's act, its own
    // policy rule) is decided FIRST, so a role admitted to request but not to trigger is refused before any request is recorded (B9 review).
    let agentId: string | null = null; let task: AgentTask = 'briefing';
    if (intake.kind === 'analysis') {
      task = (typeof intake.subject['task'] === 'string' ? intake.subject['task'] : 'briefing') as AgentTask;
      agentId = typeof intake.subject['agent_id'] === 'string' ? intake.subject['agent_id'] : await this.activeAgent(envelope, principal, tenantId, domainId, task);
      await this.pipeline.write({ ...envelope, action: 'agent.trigger', object_type: 'AGT', object_id: agentId, message_id: newId() } as typeof envelope, principal, this.route(tenantId, domainId, 'agent.trigger', 'AGT', agentId), ExecutiveCapability.read,
        async () => ({ result: { agentId, task, requestId }, targetType: 'AGT', targetId: agentId as string, targetVersion: '1', outboxEvent: null }));
    }
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.request', 'EXR', requestId), ExecutiveCapability.request,
      async (cap, scope) => {
        const r = await this.requests.open(cap, scope, requestId, intake, principal.principalId, envelope.correlation_id);
        return { result: r.request, targetType: 'EXR', targetId: String(r.request['request_id']), targetVersion: '1', outboxEvent: r.event };
      });
    let run: Record<string, unknown> | null = null;
    if (intake.kind === 'analysis' && out.result['repeated'] !== true && agentId !== null) {
      // The responsible capability: the agent named, or the domain's active agent of the task's kind; its run is the agent's own governed work.
      const roomId = intake.subject['object_type'] === 'DRM' && typeof intake.subject['object_id'] === 'string' ? intake.subject['object_id'] : null;
      const packageId = intake.subject['object_type'] === 'DPK' && typeof intake.subject['object_id'] === 'string' ? intake.subject['object_id'] : null;
      const version = Number.isInteger(intake.subject['version']) ? (intake.subject['version'] as number) : null;
      let r: Awaited<ReturnType<AgentsService['run']>>;
      try {
        r = await this.agents.run({ agentId, tenantId, domainId, task, trigger: { kind: 'request', principalId: principal.principalId, ref: requestId }, roomId, packageId, version, correlationId: envelope.correlation_id });
      } catch (e) {
        // The routed act was refused (the agent's session or run port said no): the request is recorded REFUSED with that reason, never left routed (B9 review).
        const reason = e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e as Error).message;
        const refused = await this.pipeline.write({ ...envelope, action: 'executive.request.fulfil', object_type: 'EXR', object_id: requestId, message_id: newId() } as typeof envelope, principal,
          this.route(tenantId, domainId, 'executive.request.fulfil', 'EXR', requestId), ExecutiveCapability.request,
          async (cap, scope) => ({ result: await cap.refuseRequest({ requestId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, reason: `the agent run was refused: ${reason}`, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'EXR', targetId: requestId, targetVersion: '2', outboxEvent: null }));
        throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `request ${requestId} recorded and refused: ${String(refused.result['refusal'])}`), 409);
      }
      const fulfilled = await this.pipeline.write({ ...envelope, action: 'executive.request.fulfil', object_type: 'EXR', object_id: requestId, message_id: newId() } as typeof envelope, principal,
        this.route(tenantId, domainId, 'executive.request.fulfil', 'EXR', requestId), ExecutiveCapability.request,
        async (cap, scope) => ({ result: await cap.fulfilRequest({ requestId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, routedRef: r.runId, note: `agent run ${r.outcome}${r.stopReason === null ? '' : ` (${r.stopReason})`}`, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'EXR', targetId: requestId, targetVersion: '2', outboxEvent: null }));
      run = { run_id: r.runId, agent_id: r.agentId, outcome: r.outcome, stop_reason: r.stopReason, refusals: r.refusals, escalated_to: r.escalatedTo, fulfilment: fulfilled.result };
    }
    return { request: { ...out.result, ...(run === null ? {} : { state: 'fulfilled', routed_ref: run['run_id'] }) }, run, receipt: receipt(out) };
  }

  /** The domain's active agent of the kind that runs the task (0046: decision → draft; briefing → briefing, monitor; reporting → report), the newest registration first. */
  private async activeAgent(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, task: AgentTask): Promise<string> {
    const kind = task === 'draft' ? 'decision' : task === 'report' ? 'reporting' : 'briefing';
    const out = await this.pipeline.consequentialRead({ ...envelope, action: 'agent.read', object_type: 'AGT', object_id: null, message_id: newId(), side_effect_class: 'none', consequence_class: 'C1' } as typeof envelope, principal, this.route(tenantId, domainId, 'agent.read', 'AGT', null), ExecutiveCapability.read,
      async (cap) => (await cap.readAgents().select(['agent_id' as never]).where('status' as never, '=', 'active' as never).where('agent_kind' as never, '=', kind as never).orderBy('created_at' as never, 'desc').executeTakeFirst()) as { agent_id: string } | undefined);
    if (out.result === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `an analysis request for the task ${task} needs a registered active ${kind} agent in this domain (or subject.agent_id)`), 404);
    return String(out.result.agent_id);
  }

  @Post('/executive/requests/list')
  async listRequests(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: string | null; kind?: string | null; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.request.read', 'EXR', null), ExecutiveCapability.read, async (cap) => this.requests.list(cap, body.payload ?? {}));
    return { requests: out.result, receipt: receipt(out) };
  }

  @Post('/executive/requests/:requestId/get')
  async getRequest(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('requestId') requestId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.request.read', 'EXR', requestId), ExecutiveCapability.read, async (cap) => this.requests.get(cap, requestId, envelope.correlation_id));
    return { request: out.result, receipt: receipt(out) };
  }

  /** The responsible owner's act answered a routed request (a run, a scenario, a package): named here when the act did not carry the request itself. */
  @Post('/executive/requests/:requestId/fulfil')
  async fulfilRequest(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('requestId') requestId: string, @Body() body: { payload?: { routed_ref?: string; note?: string } }) {
    const { envelope, principal } = ctx(req);
    const ref = String(body.payload?.routed_ref ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'payload.routed_ref names the act that answered the request'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.request.fulfil', 'EXR', requestId), ExecutiveCapability.request,
      async (cap, scope) => ({ result: await cap.fulfilRequest({ requestId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, routedRef: ref, note: typeof body.payload?.note === 'string' ? body.payload.note : null, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'EXR', targetId: requestId, targetVersion: '2', outboxEvent: null }));
    return { request: out.result, receipt: receipt(out) };
  }

  @Post('/executive/requests/:requestId/withdraw')
  async withdrawRequest(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('requestId') requestId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.request.withdraw', 'EXR', requestId), ExecutiveCapability.request,
      async (cap, scope) => ({ result: await cap.withdrawRequest({ requestId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, reason: String(body.payload?.reason ?? ''), actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'EXR', targetId: requestId, targetVersion: '2', outboxEvent: null }));
    return { request: out.result, receipt: receipt(out) };
  }

  @Post('/executive/follow-ups/:followUpId/complete')
  async completeFollowUp(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('followUpId') followUpId: string, @Body() body: { payload?: { note?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.follow_up.complete', 'EXR', followUpId), ExecutiveCapability.request,
      async (cap, scope) => ({ result: await cap.completeFollowUp({ followUpId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, note: String(body.payload?.note ?? ''), actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'EXR', targetId: followUpId, targetVersion: '1', outboxEvent: null }));
    return { follow_up: out.result, receipt: receipt(out) };
  }
}
