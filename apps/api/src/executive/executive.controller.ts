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
import { ExecutiveCapability } from './executive.capabilities.js';
import { RoomService } from './rooms/room.service.js';
import { BriefingService } from './briefings/briefing.service.js';
import { AgentsService, renderReport, validateRegisterAgent, type AgentTask } from './agents/agents.service.js';
import { AgentWorkerService } from './agents/agent-worker.service.js';
import { DecisionCapability } from '../decision/decision.capabilities.js';

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
  constructor(private readonly pipeline: PipelineService, private readonly rooms: RoomService, private readonly briefings: BriefingService, private readonly agents: AgentsService, private readonly worker: AgentWorkerService) {}
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
        }, principal.principalId, via, agentId, envelope.purpose_id ?? 'briefing', envelope.correlation_id, briefingId);
        return { result: r, targetType: 'BRF', targetId: briefingId, targetVersion: '1', outboxEvent: null };
      });
    return { briefing: out.result, receipt: receipt(out) };
  }

  @Post('/briefings/list')
  async listBriefings(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { roomId?: string | null } }) {
    const { envelope, principal } = ctx(req);
    const roomId = typeof body.payload?.roomId === 'string' ? body.payload.roomId : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'briefing.read', 'BRF', null), ExecutiveCapability.read, async (cap) => this.briefings.list(cap, principal.principalId, roomId));
    return { briefings: out.result, receipt: receipt(out) };
  }

  @Post('/briefings/:briefingId/get')
  async getBriefing(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('briefingId') briefingId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'briefing.read', 'BRF', briefingId), ExecutiveCapability.read, async (cap) => this.briefings.get(cap, briefingId, principal.principalId, envelope.correlation_id));
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
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'agent.read', 'AGT', null), ExecutiveCapability.read, async (cap) => this.agents.list(cap));
    return { ...out.result, planner: { reconciliation: this.worker.lastReconciliation(), recent_runs: this.worker.recentRuns() }, receipt: receipt(out) };
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
    this.agents.setSystemReader(principal);
    const run = await this.agents.run({ agentId, tenantId, domainId, task, trigger: { kind: 'operator', principalId: principal.principalId, ref: trigger.policyDecisionId },
      roomId: typeof p.roomId === 'string' ? p.roomId : null, packageId: typeof p.packageId === 'string' ? p.packageId : null, version: Number.isInteger(p.version) ? (p.version as number) : null, correlationId: envelope.correlation_id });
    return { run, receipt: receipt(trigger) };
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
    const clearance = principal.bindings.some((b) => ['tenant_admin', 'platform_admin', 'auditor', 'executive', 'decision_owner', 'decision_authority'].includes(b.roleCode)) ? 'confidential' : 'internal';
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'report.render', 'DPK', packageId), DecisionCapability.read,
      async (cap) => renderReport(cap, packageId, clearance, { principal_id: principal.principalId, method: 'report-render@1.0.0', via: 'human' }, envelope.correlation_id));
    if (out.result.refused === true) throw new HttpException(errorBody('EYE_AUT_001', envelope.correlation_id, out.result.reason), 403);
    return { report: out.result, receipt: receipt(out) };
  }

  @Post('/workflow/:packageId')
  async workflow(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', packageId), ExecutiveCapability.read, async (cap) => cap.workflowOf({ packageId }));
    return { workflow: out.result, receipt: receipt(out) };
  }
}
