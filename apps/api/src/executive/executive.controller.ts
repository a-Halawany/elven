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
import { bindingReaches, clearanceOf } from '../decision/clearance.js';
import { AgentWorkerService } from './agents/agent-worker.service.js';
import { DecisionCapability } from '../decision/decision.capabilities.js';
import { RequestsService, validateRequest } from './requests/requests.service.js';
import { AttentionService } from './attention/attention.service.js';
/* B24 (0086) materiality */
import { AttentionMaterialityService } from './attention/materiality.js';
/* end B24 materiality */
/* B23 (0084) attention */
import { ReviewsService, validateConvene } from './reviews/reviews.service.js';
/* end B23 attention */
/* B24 (0086) timer */
import { AttentionTimerService } from './attention/attention-timer.service.js';
import { DeliveryService } from './attention/delivery/delivery.service.js';
import { cadenceOf } from './attention/timer-identity.js';
/* end B24 timer */
/* B24 (0086) governance */
import { AttentionGovernanceService, delegationDigest, validateDecide, validateDelegate, validateDisposition, validateEvaluate } from './attention/governance.service.js';
/* end B24 governance */
/* B32 (0089) health */
import { HealthService, validateAcknowledge, validateApprove, validateChallenge, validateCompute, validateDecideChange, validatePropose, validateRefuse, validateWithdraw } from './health/health.service.js';
/* end B32 health */
/* B36 (0094 §S) strategy */
import { HealthInputsService, validateExceptionDecision, validateExceptionRequest, validateSetInput, validateSnapshotApproval } from './health/health-inputs.service.js';
/* end B36 strategy */
/* B34 (0090) attention */
import { AttentionActService, validateAct } from './attention/act.service.js';
import { healthScoreChangedEvents } from './attention/b34-signals.js';
/* end B34 attention */
/* B36 (0094 §A3) attention: the evaluation route holds the queue through the B36 capability */
import { AttentionB36Capability } from './attention/attention-b36.capabilities.js';
/* end B36 attention */

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
  constructor(private readonly pipeline: PipelineService, private readonly rooms: RoomService, private readonly briefings: BriefingService, private readonly agents: AgentsService, private readonly worker: AgentWorkerService, private readonly requests: RequestsService, private readonly attention: AttentionService,
              /* B23 (0084) attention */ private readonly reviews: ReviewsService /* end B23 attention */,
              /* B24 (0086) timer */ private readonly attentionTimer: AttentionTimerService, private readonly deliveries: DeliveryService /* end B24 timer */,
              /* B24 (0086) materiality */ private readonly materiality: AttentionMaterialityService /* end B24 materiality */,
              /* B24 (0086) governance */ private readonly governance: AttentionGovernanceService /* end B24 governance */,
              /* B32 (0089) health */ private readonly health: HealthService /* end B32 health */,
              /* B36 (0094 §S) strategy */ private readonly healthInputs: HealthInputsService /* end B36 strategy */,
              /* B34 (0090) attention */ private readonly acts: AttentionActService /* end B34 attention */) {}
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
                @Body() body: { payload?: { roomId?: string | null; knownAt?: string; priorBriefingId?: string | null; narrative?: string | null; narrativeCites?: string[];
                                            /* B36 briefing (0094 §B): the v3 contract — absent means the defaults (every reader role, in-app, plain; the cadence's expiry) */
                                            audience?: unknown; purpose?: string | null; expiresAt?: string | null; disputedNote?: string | null } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const briefingId = newId();
    const via: 'human' | 'agent' = principal.kind === 'agent' ? 'agent' : 'human';
    /* B36 briefing: the contract as sent (validated by the composer, then by the port); `undefined` = the default */
    const v3 = { audience: p.audience, purpose: typeof p.purpose === 'string' ? p.purpose : null, expiresAt: typeof p.expiresAt === 'string' ? p.expiresAt : null, disputedNote: typeof p.disputedNote === 'string' ? p.disputedNote : null };
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
        via === 'human' ? clearanceOf(principal, { tenantId: scope.tenantId, domainId: scope.domainId }) : null,
        // B10: the composer's roles in the target — a memory item for an audience role is read by a holder of it
        principal.bindings.filter((b) => bindingReaches(b, { tenantId: scope.tenantId, domainId: scope.domainId })).map((b) => b.roleCode),
        /* B36 briefing (0094 §B): the v3 contract */ v3);
        return { result: r, targetType: 'BRF', targetId: briefingId, targetVersion: '1', outboxEvent: null };
      });
    return { briefing: out.result, receipt: receipt(out) };
  }

  /* B36 briefing (0094 §B.2): the suppression policy — published by a named human (briefing.policy.set), read under briefing.read. */
  @Post('/briefings/policy/set')
  async setBriefingPolicy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { rules?: unknown; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const policyId = newId();
    const out = await this.pipeline.write(envelope, principal, { ...this.route(tenantId, domainId, 'briefing.policy.set', 'BRP', policyId), writableTargets: [policyId] }, ExecutiveCapability.briefingPolicy,
      async (cap, scope) => ({ result: await this.briefings.setPolicy(cap, scope, policyId, body.payload?.rules, body.payload?.reason, principal.principalId, envelope.correlation_id), targetType: 'BRP', targetId: policyId, targetVersion: '1', outboxEvent: null }));
    return { policy: out.result, receipt: receipt(out) };
  }

  @Post('/briefings/policy/get')
  async getBriefingPolicy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { at?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'briefing.read', 'BRP', null), ExecutiveCapability.read,
      async (cap, scope) => this.briefings.policy(cap, scope, typeof body.payload?.at === 'string' ? instant(body.payload.at, await cap.now()) : null));
    return { policy: out.result.current, history: out.result.history, receipt: receipt(out) };
  }
  /* end B36 briefing */

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
    /* B24 (0086) timer: an ATTENTION agent is the domain's timer host — its registration points the domain's one timer at it (and its cadence) */
    if (intake.kind === 'attention') {
      const registered = await this.agents.register(envelope, principal, tenantId, domainId, intake);
      // the registration stands if the scheduler is unreachable now: the startup reconciliation points the timer at it (said in the answer)
      const timer = await this.attentionTimer.scheduleDomain(tenantId, domainId, String(registered.agent.agentId), cadenceOf(intake.budgets))
        .catch((e: Error) => ({ scheduled: false, error: `the timer was not scheduled now (${e.message.slice(0, 200)}); the startup reconciliation schedules it` }));
      return { ...registered, timer };
    }
    /* end B24 timer */
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
                 @Body() body: { payload?: { task?: AgentTask; roomId?: string | null; packageId?: string | null; version?: number | null; /* B28 (0088) signals */ asOf?: string | null /* end B28 signals */ } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const task = p.task ?? 'briefing';
    if (!['draft', 'briefing', 'report', 'monitor', /* B28 (0088) signals */ 'signal_scan' /* end B28 signals */, /* B32 (0089) exposures */ 'risk_assess', 'opportunity_assess' /* end B32 exposures */, /* B29 (0092) §B */ 'supply_scan', /* B30 estimation */ 'reconcile_scan'].includes(task)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'task is draft, briefing, report, monitor, signal_scan, risk_assess, opportunity_assess, supply_scan or reconcile_scan'), 422);
    /* B28 (0088) signals: the scan reads as of an OBSERVATION day (event time), or each subject's latest when none is named */
    if (task === 'signal_scan' && p.asOf !== undefined && p.asOf !== null && (typeof p.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.asOf))) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'asOf is an observation day (YYYY-MM-DD)'), 422);
    /* end B28 signals */
    const trigger = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'agent.trigger', 'AGT', agentId), ExecutiveCapability.read,
      async () => ({ result: { agentId, task, triggeredBy: principal.principalId }, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null }));
    const run = await this.agents.run({ agentId, tenantId, domainId, task, trigger: { kind: 'operator', principalId: principal.principalId, ref: trigger.policyDecisionId },
      roomId: typeof p.roomId === 'string' ? p.roomId : null, packageId: typeof p.packageId === 'string' ? p.packageId : null, version: Number.isInteger(p.version) ? (p.version as number) : null, correlationId: envelope.correlation_id,
      /* B28 (0088) signals */ ...(task === 'signal_scan' ? { scan: { asOf: typeof p.asOf === 'string' ? p.asOf : null } } : {}) /* end B28 signals */ });
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

  // ───────────────────────── the attention policy and the queue (0083, L10-I05 AttentionPolicyChanged) ─────────────────────────
  /** A new VERSION of the domain's attention policy — a named human's act (human-gated); AttentionPolicyChanged@v1 from the write. */
  @Post('/executive/attention/policy/publish')
  async publishAttentionPolicy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = this.attention.validatePublish(body.payload ?? {}, envelope.correlation_id);
    const policyId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.policy.publish', 'ATP', policyId), ExecutiveCapability.attention,
      async (cap, scope) => {
        const r = await this.attention.publish(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string }, policyId, intake.rules, intake.reason, principal.principalId, envelope.correlation_id);
        return { result: r.published, targetType: 'ATP', targetId: policyId, targetVersion: String(r.published['version']), outboxEvent: r.event };
      });
    return { policy: out.result, receipt: receipt(out) };
  }

  @Post('/executive/attention/policy/get')
  async attentionPolicy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATP', null), ExecutiveCapability.read, async (cap) => this.attention.policy(cap));
    return { policy: out.result, receipt: receipt(out) };
  }

  /** The QUEUE: every item by state — the deprioritized and the suppressed listed, never hidden — with the reasons and the version each was judged under. */
  @Post('/executive/attention/items/list')
  async listAttentionItems(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: string; signalClass?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATI', null), ExecutiveCapability.read,
      async (cap) => this.attention.list(cap, body.payload ?? {}, await cap.now()));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/executive/attention/items/:itemId/get')
  async getAttentionItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATI', itemId), ExecutiveCapability.read,
      async (cap) => this.attention.get(cap, itemId, await cap.now(), envelope.correlation_id));
    return { item: out.result, receipt: receipt(out) };
  }

  /** Receipt, never agreement (OBJ-20): the owner or a holder of a routed role. */
  @Post('/executive/attention/items/:itemId/acknowledge')
  async acknowledgeAttentionItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: { note?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.item.acknowledge', 'ATI', itemId), ExecutiveCapability.attention,
      async (cap, scope) => ({ result: await cap.acknowledgeItem({ itemId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, note: typeof body.payload?.note === 'string' ? body.payload.note : null, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATI', targetId: itemId, targetVersion: null, outboxEvent: null }));
    return { item: out.result, receipt: receipt(out) };
  }

  /** Time-bound, reasoned, visible (OBJ-21, PAT-38): within the class's maximum under the item's own policy version. */
  @Post('/executive/attention/items/:itemId/suppress')
  async suppressAttentionItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: { until?: string; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const until = typeof body.payload?.until === 'string' && !Number.isNaN(Date.parse(body.payload.until)) ? new Date(body.payload.until).toISOString() : null;
    if (until === null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'payload.until is the instant the suppression lapses (ISO 8601)'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.item.suppress', 'ATI', itemId), ExecutiveCapability.attention,
      async (cap, scope) => ({ result: await cap.suppressItem({ itemId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, until, reason: String(body.payload?.reason ?? ''), actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATI', targetId: itemId, targetVersion: null, outboxEvent: null }));
    return { item: out.result, receipt: receipt(out) };
  }

  @Post('/executive/attention/items/:itemId/close')
  async closeAttentionItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: { note?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.item.close', 'ATI', itemId), ExecutiveCapability.attention,
      async (cap, scope) => ({ result: await cap.closeItem({ itemId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, note: String(body.payload?.note ?? ''), actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATI', targetId: itemId, targetVersion: null, outboxEvent: null }));
    return { item: out.result, receipt: receipt(out) };
  }

  /** The overdue escalated and the lapsed suppressions reopened, on demand (the attention subscriber does it at every delivery; no timer host). */
  @Post('/executive/attention/escalate-due')
  async escalateAttentionDue(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.escalate', 'ATI', null), ExecutiveCapability.attention,
      async (cap, scope) => ({ result: await cap.escalateDue({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATI', targetId: null, targetVersion: null, outboxEvent: null }));
    return { escalation: out.result, receipt: receipt(out) };
  }

  /* B24 (0086) timer: THE DELIVERY PORT's reads ───────────────────────── */
  /** An item's deliveries (every attempt with its receipt) beside its acknowledgement — a receipt is not an acknowledgement; neither sets the other. */
  @Post('/executive/attention/items/:itemId/deliveries')
  async attentionDeliveries(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string) {
    const { envelope, principal } = ctx(req);
    // the id is the read's audited target: a malformed one is the caller's request, refused before any decision is recorded
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'the item id is a uuid'), 422);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATI', itemId), ExecutiveCapability.read,
      async (cap) => this.deliveries.forItem(cap, itemId, envelope.correlation_id));
    return { ...out.result, receipt: receipt(out) };
  }

  /** The SYNTHETIC demo mailbox (the demo-mailbox channel's local sink): nothing in it was sent by email, SMS or Teams (owner decision D6). */
  @Post('/executive/attention/mailbox')
  async attentionMailbox(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { recipient?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATI', null), ExecutiveCapability.read,
      async (cap) => this.deliveries.mailbox(cap, body.payload ?? {}, envelope.correlation_id));
    return { ...out.result, timer: { reconciliation: this.attentionTimer.lastReconciliation(tenantId, domainId), recent_ticks: this.attentionTimer.recentTicks(tenantId, domainId) }, receipt: receipt(out) };
  }
  /* end B24 timer */
  /* B24 (0086) materiality: THE DEPRIORITIZED VIEW AND THE REBALANCE ───────────────────────── */
  /** The deprioritized view: the items WAITING for capacity (overload) and those below the thresholds or abstained on — in RANK order, each with its explanation — and the recent elevations with theirs. */
  @Post('/executive/attention/deprioritized')
  async deprioritizedAttention(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATI', null), ExecutiveCapability.read,
      async (cap) => this.materiality.deprioritized(cap, await cap.now()));
    return { ...out.result, receipt: receipt(out) };
  }

  /** The waiting items elevated in rank order where capacity has freed, on an operator's demand (the attention tick does it on its schedule — step `rebalance`). */
  @Post('/executive/attention/rebalance')
  async rebalanceAttention(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.rebalance', 'ATI', null), ExecutiveCapability.attention,
      async (cap, scope) => ({ result: await cap.rebalance({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATI', targetId: null, targetVersion: null, outboxEvent: null }));
    return { rebalance: out.result, receipt: receipt(out) };
  }
  /* end B24 materiality */

  /* B23 (0084) attention: THE GOVERNED REVIEW (L10-I03 ReviewConvened) ───────────────────────── */
  /**
   * A NAMED HUMAN convenes a review around a declared objective, decision, scenario, commitment or outcome (human-gated); idempotent on
   * the convener's convene_key under the review's digest; ReviewConvened@v1 published from the write of a NEW review (a repeat, none).
   */
  @Post('/executive/reviews/convene')
  async conveneReview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateConvene(body.payload ?? {}, envelope.correlation_id);
    const reviewId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.review.convene', 'RVW', reviewId), ExecutiveCapability.review,
      async (cap, scope) => {
        const r = await this.reviews.convene(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string }, reviewId, intake, principal.principalId, envelope.correlation_id);
        return { result: r.review, targetType: 'RVW', targetId: String(r.review['review_id']), targetVersion: '1', outboxEvent: r.event };
      });
    return { review: out.result, receipt: receipt(out) };
  }

  @Post('/executive/reviews/list')
  async listReviews(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: string; subjectKind?: string; subjectId?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.review.read', 'RVW', null), ExecutiveCapability.read, async (cap) => this.reviews.list(cap, body.payload ?? {}));
    return { reviews: out.result, receipt: receipt(out) };
  }

  @Post('/executive/reviews/:reviewId/get')
  async getReview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('reviewId') reviewId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.review.read', 'RVW', reviewId), ExecutiveCapability.read, async (cap) => this.reviews.get(cap, reviewId, envelope.correlation_id));
    return { review: out.result, receipt: receipt(out) };
  }

  /** The chair concludes the review with its conclusion (a domain / platform administrator may too). */
  @Post('/executive/reviews/:reviewId/conclude')
  async concludeReview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('reviewId') reviewId: string, @Body() body: { payload?: { note?: string } }) {
    return this.closeReview(req, tenantId, domainId, reviewId, 'concluded', body.payload?.note);
  }

  /** The convener (or the chair) withdraws the review, saying why. */
  @Post('/executive/reviews/:reviewId/withdraw')
  async withdrawReview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('reviewId') reviewId: string, @Body() body: { payload?: { note?: string } }) {
    return this.closeReview(req, tenantId, domainId, reviewId, 'withdrawn', body.payload?.note);
  }

  private async closeReview(req: EyeRequest, tenantId: string, domainId: string, reviewId: string, disposition: 'concluded' | 'withdrawn', note: unknown) {
    const { envelope, principal } = ctx(req);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reviewId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reviewId must be a review id'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.review.close', 'RVW', reviewId), ExecutiveCapability.review,
      async (cap, scope) => ({ result: await this.reviews.close(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string }, reviewId, disposition, typeof note === 'string' ? note : '', principal.principalId, envelope.correlation_id),
                               targetType: 'RVW', targetId: reviewId, targetVersion: '2', outboxEvent: null }));
    return { review: out.result, receipt: receipt(out) };
  }
  /* end B23 attention */

  /* B24 (0086) governance: THE QUEUE'S GOVERNANCE (0086 §G) — suppression approval, item delegation, disposition, evaluation ───────────── */
  private static readonly UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  private idOr422(id: string, what: string, correlationId: string): void {
    if (!ExecutiveController.UUID.test(id)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${what} must be an id`), 422);
  }

  /** The suppression requests (pending, approved, refused, expired) — a pending one past its instant shown lapsed. */
  @Post('/executive/attention/suppressions/list')
  async listSuppressionRequests(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: string; itemId?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATS', null), ExecutiveCapability.read,
      async (cap) => this.governance.requests(cap, body.payload ?? {}, await cap.now()));
    return { requests: out.result, receipt: receipt(out) };
  }

  /** A SECOND person approves or refuses a pending request — never the requester; a holder of the approver roles (human-gated). */
  @Post('/executive/attention/suppressions/:requestId/decide')
  async decideSuppression(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('requestId') requestId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(requestId, 'requestId', envelope.correlation_id);
    const intake = validateDecide(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.suppression.decide', 'ATS', requestId), ExecutiveCapability.governance,
      async (cap, scope) => ({ result: await cap.decideSuppression({ requestId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, decision: intake.decision, reason: intake.reason, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATS', targetId: requestId, targetVersion: null, outboxEvent: null }));
    return { request: out.result, receipt: receipt(out) };
  }

  /** The approvers' sweep: every pending request past its instant recorded EXPIRED (the attention tick runs the same step). */
  @Post('/executive/attention/suppressions/expire')
  async expireSuppressions(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.suppression.decide', 'ATS', null), ExecutiveCapability.governance,
      async (cap, scope) => ({ result: await cap.expireSuppressions({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATS', targetId: null, targetVersion: null, outboxEvent: null }));
    return { expiry: out.result, receipt: receipt(out) };
  }

  /** The item delegations (active, ended) — `in_force` inside the window; the owner stays accountable. */
  @Post('/executive/attention/delegations/list')
  async listItemDelegations(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: string; itemId?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATD', null), ExecutiveCapability.read,
      async (cap) => this.governance.delegations(cap, body.payload ?? {}, await cap.now()));
    return { delegations: out.result, receipt: receipt(out) };
  }

  /** An item lent to an active human holding an acknowledgement role, for a window, with a reason; exactly once on the delegator's key (human-gated). */
  @Post('/executive/attention/items/:itemId/delegate')
  async delegateAttentionItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(itemId, 'itemId', envelope.correlation_id);
    const intake = validateDelegate(body.payload ?? {}, envelope.correlation_id);
    const delegationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.item.delegate', 'ATI', itemId), ExecutiveCapability.governance,
      async (cap, scope) => ({ result: await cap.delegateItem({ delegationId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, itemId, to: intake.to, reason: intake.reason, until: intake.until,
                                                                requestKey: intake.requestKey, requestDigest: delegationDigest(itemId, intake), actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATI', targetId: itemId, targetVersion: null, outboxEvent: null }));
    return { delegation: out.result, receipt: receipt(out) };
  }

  /** The delegator, the delegate, the item's owner or an administrator ends a delegation, saying why. */
  @Post('/executive/attention/delegations/:delegationId/end')
  async endItemDelegation(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('delegationId') delegationId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(delegationId, 'delegationId', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.item.delegate', 'ATD', delegationId), ExecutiveCapability.governance,
      async (cap, scope) => ({ result: await cap.endDelegation({ delegationId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, reason: String(body.payload?.reason ?? ''), actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATD', targetId: delegationId, targetVersion: null, outboxEvent: null }));
    return { delegation: out.result, receipt: receipt(out) };
  }

  /** What the item turned out to be (actioned | not_material | duplicate | late | missed), by a person who may act on it (human-gated). */
  @Post('/executive/attention/items/:itemId/disposition')
  async recordAttentionDisposition(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(itemId, 'itemId', envelope.correlation_id);
    const intake = validateDisposition(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.disposition.record', 'ATI', itemId), ExecutiveCapability.governance,
      async (cap, scope) => ({ result: await cap.recordDisposition({ itemId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, disposition: intake.disposition, note: intake.note, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATI', targetId: itemId, targetVersion: null, outboxEvent: null }));
    return { disposition: out.result, receipt: receipt(out) };
  }

  /** The queue EVALUATED over a window by a named human (executive, domain_admin, platform_admin; human-gated) — measures from the ledgers, each abstaining below min_sample. */
  @Post('/executive/attention/evaluations/run')
  async evaluateAttentionQueue(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateEvaluate(body.payload ?? {}, envelope.correlation_id);
    const evaluationId = newId();
    /* B36 (0094 §A3; PR-44-005): the evaluation ACTS — after 0090 §A5's measures, executive.hold_queue in the same write: the fairness measure
       below the policy's floor or the staleness measure above its ceiling holds the queue (read-only) and routes a queue.governance item to
       the executive; a policy without governance fields is reported as before, gating nothing. */
    const holdId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.attention.queue.evaluate', 'ATE', evaluationId), AttentionB36Capability.hold,
      async (cap, scope) => {
        const evaluation = await cap.evaluateQueue({ evaluationId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, windowFrom: intake.windowFrom, windowTo: intake.windowTo, minSample: intake.minSample,
                                                     actor: principal.principalId, correlationId: envelope.correlation_id });
        const governance = await cap.holdQueue({ holdId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, evaluationId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { evaluation, governance }, targetType: 'ATE', targetId: evaluationId, targetVersion: null, outboxEvent: null };
      });
    return { evaluation: out.result.evaluation, governance: out.result.governance, receipt: receipt(out) };
    /* end B36 attention */
  }

  @Post('/executive/attention/evaluations/list')
  async listAttentionEvaluations(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATE', null), ExecutiveCapability.read,
      async (cap) => this.governance.evaluations(cap, body.payload ?? {}));
    return { evaluations: out.result, receipt: receipt(out) };
  }
  /* end B24 governance */

  /* B34 (0090) attention: THE ACT TRANSITION (0090 §A4) — a registered governed action launched from an item under the human gate ───────── */
  /** Launch → the governed action (its own write, its own PDP rule) → settle acted | refused; a refused governed action is recorded, then answered with its status. */
  @Post('/executive/attention/items/:itemId/act')
  async actOnAttentionItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(itemId, 'itemId', envelope.correlation_id);
    const intake = validateAct(body.payload ?? {}, envelope.correlation_id);
    return this.acts.act(envelope, principal, tenantId, domainId, itemId, intake);
  }

  /** The act registry (what each class may launch; health.change has none) and an item's acts, newest first. */
  @Post('/executive/attention/acts/list')
  async listAttentionActs(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { itemId?: string } }) {
    const { envelope, principal } = ctx(req);
    const itemId = typeof body.payload?.itemId === 'string' && ExecutiveController.UUID.test(body.payload.itemId) ? body.payload.itemId : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.attention.read', 'ATI', itemId), ExecutiveCapability.read,
      async (cap) => {
        let q = cap.readAttentionItemActs().selectAll();
        if (itemId !== null) q = q.where('item_id' as never, '=', itemId as never);
        const acts = (await q.orderBy('launched_at' as never, 'desc').limit(200).execute()) as Array<Record<string, unknown>>;
        return { ...(await this.acts.registry(cap)), items: acts };
      });
    return { ...out.result, receipt: receipt(out) };
  }
  /* end B34 attention */

  /* B32 (0089) health: THE DECOMPOSABLE STRATEGIC HEALTH SCORE (0089 §H; F-P6-08) — a two-person definition, the computation from the
     health input contract, the decomposed snapshots, the baseline comparison, the score changes acknowledged and challenged ───────────── */
  /** The definition versions — the active one, the pending proposal, the refused and the superseded. */
  @Post('/executive/health/definitions/list')
  async listHealthDefinitions(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSD', null), ExecutiveCapability.read,
      async (cap) => this.health.definitions(cap, body.payload ?? {}));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/executive/health/definitions/:definitionId/get')
  async getHealthDefinition(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('definitionId') definitionId: string) {
    const { envelope, principal } = ctx(req);
    this.idOr422(definitionId, 'definitionId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSD', definitionId), ExecutiveCapability.read,
      async (cap) => this.health.definition(cap, definitionId, envelope.correlation_id));
    return { definition: out.result, receipt: receipt(out) };
  }

  /** A new VERSION of the score model PROPOSED by a named human (human-gated); it awaits a second person. */
  @Post('/executive/health/definitions/propose')
  async proposeHealthDefinition(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validatePropose(body.payload ?? {}, envelope.correlation_id);
    const definitionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.definition.propose', 'HSD', definitionId), ExecutiveCapability.health,
      async (cap, scope) => {
        const r = await cap.proposeDefinition({ definitionId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, model: intake.model, reason: intake.reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'HSD', targetId: definitionId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { definition: out.result, receipt: receipt(out) };
  }

  /** A SECOND person approves (activates) the proposal — never the proposer; the anti-gaming review where it is flagged (human-gated). */
  @Post('/executive/health/definitions/:definitionId/approve')
  async approveHealthDefinition(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('definitionId') definitionId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(definitionId, 'definitionId', envelope.correlation_id);
    const intake = validateApprove(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.definition.approve', 'HSD', definitionId), ExecutiveCapability.health,
      async (cap, scope) => {
        const r = await cap.approveDefinition({ definitionId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, note: intake.note, gamingReview: intake.gamingReview, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'HSD', targetId: definitionId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { definition: out.result, receipt: receipt(out) };
  }

  /** A SECOND person refuses the proposal, saying why (human-gated). */
  @Post('/executive/health/definitions/:definitionId/refuse')
  async refuseHealthDefinition(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('definitionId') definitionId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(definitionId, 'definitionId', envelope.correlation_id);
    const intake = validateRefuse(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.definition.approve', 'HSD', definitionId), ExecutiveCapability.health,
      async (cap, scope) => ({ result: await cap.refuseDefinition({ definitionId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, reason: intake.reason, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'HSD', targetId: definitionId, targetVersion: null, outboxEvent: null }));
    return { definition: out.result, receipt: receipt(out) };
  }

  /** The score COMPUTED under the active definition from the health input contract, at now or an earlier instant (an as_of replay). */
  @Post('/executive/health/compute')
  async computeHealthScore(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateCompute(body.payload ?? {}, envelope.correlation_id);
    const snapshotId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.compute', 'HSS', snapshotId), ExecutiveCapability.health,
      async (cap, scope) => {
        const r = await cap.computeScore({ snapshotId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, at: intake.at, actor: principal.principalId, correlationId: envelope.correlation_id });
        /* B34 (0090) attention: HealthScoreChanged@v1 — one per change this compute RAISED, in the same governed write (an as_of replay raises none) */
        return { result: r, targetType: 'HSS', targetId: snapshotId, targetVersion: null, outboxEvent: null, outboxEvents: healthScoreChangedEvents(r, principal.principalId) };
        /* end B34 attention */
      });
    return { snapshot: out.result, receipt: receipt(out) };
  }

  @Post('/executive/health/snapshots/list')
  async listHealthSnapshots(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { definitionId?: string; kind?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSS', null), ExecutiveCapability.read,
      async (cap) => this.health.snapshots(cap, body.payload ?? {}));
    return { snapshots: out.result, receipt: receipt(out) };
  }

  /** One snapshot DECOMPOSED: dimensions, components, evidence, confidence, trend, freshness, sensitivity, decision links, its changes. */
  @Post('/executive/health/snapshots/:snapshotId/get')
  async getHealthSnapshot(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('snapshotId') snapshotId: string) {
    const { envelope, principal } = ctx(req);
    this.idOr422(snapshotId, 'snapshotId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSS', snapshotId), ExecutiveCapability.read,
      async (cap) => this.health.snapshot(cap, snapshotId, envelope.correlation_id));
    return { snapshot: out.result, receipt: receipt(out) };
  }

  /** The snapshot against a BASELINE of the same definition and formula (refused otherwise, 409); the peer comparison declared absent. */
  @Post('/executive/health/compare')
  async compareHealthSnapshots(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { snapshot_id?: string; baseline_id?: string } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const target = typeof p.snapshot_id === 'string' && ExecutiveController.UUID.test(p.snapshot_id) ? p.snapshot_id : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSS', target), ExecutiveCapability.read,
      async (cap) => this.health.compare(cap, { snapshotId: p.snapshot_id, baselineId: p.baseline_id }, envelope.correlation_id));
    return { comparison: out.result, receipt: receipt(out) };
  }

  @Post('/executive/health/changes/list')
  async listHealthChanges(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: string; snapshotId?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSC', null), ExecutiveCapability.read,
      async (cap) => this.health.changes(cap, body.payload ?? {}));
    return { changes: out.result, receipt: receipt(out) };
  }

  /** Receipt, never agreement (OBJ-20): a named human of the domain's strategy and decision roles (human-gated). */
  @Post('/executive/health/changes/:changeId/acknowledge')
  async acknowledgeHealthChange(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('changeId') changeId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(changeId, 'changeId', envelope.correlation_id);
    const intake = validateAcknowledge(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.change.acknowledge', 'HSC', changeId), ExecutiveCapability.health,
      async (cap, scope) => ({ result: await cap.acknowledgeChange({ changeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, note: intake.note, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'HSC', targetId: changeId, targetVersion: null, outboxEvent: null }));
    return { change: out.result, receipt: receipt(out) };
  }

  /** A score change CHALLENGED — an input, a weight, a threshold, the formula or the interpretation, with the case (human-gated). */
  @Post('/executive/health/changes/:changeId/challenge')
  async challengeHealthChange(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('changeId') changeId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(changeId, 'changeId', envelope.correlation_id);
    const intake = validateChallenge(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.change.challenge', 'HSC', changeId), ExecutiveCapability.health,
      async (cap, scope) => ({ result: await cap.challengeChange({ changeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, kind: intake.kind, statement: intake.statement, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'HSC', targetId: changeId, targetVersion: null, outboxEvent: null }));
    return { change: out.result, receipt: receipt(out) };
  }

  /** The challenger withdraws their challenge, saying why (human-gated). */
  @Post('/executive/health/changes/:changeId/withdraw')
  async withdrawHealthChallenge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('changeId') changeId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(changeId, 'changeId', envelope.correlation_id);
    const intake = validateWithdraw(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.change.challenge', 'HSC', changeId), ExecutiveCapability.health,
      async (cap, scope) => ({ result: await cap.withdrawChallenge({ changeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, reason: intake.reason, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'HSC', targetId: changeId, targetVersion: null, outboxEvent: null }));
    return { change: out.result, receipt: receipt(out) };
  }

  /* B36 (0094 §S) strategy: THE SCORE COMPLETED — the input contract with owners and edit history, the owner-correction route, the
     exceptions as recorded objects, the signed snapshot approval (0094 §S1–§S5; F-P6-08 (f)(g)(h)) ───────────── */
  /** The input CONTRACT: per component its owner, the value last read or stated, its as-of, the edit history; the owner-edit analysis; the reader's active context. */
  @Post('/executive/health/inputs/list')
  async listHealthInputs(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { definitionId?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSD', null), ExecutiveCapability.healthInputs,
      async (cap, scope) => this.healthInputs.inputs(cap, { definitionId: body.payload?.definitionId, principalId: principal.principalId, tenantId: scope.tenantId as string, domainId: scope.domainId as string }));
    return { contract: out.result, receipt: receipt(out) };
  }

  /** THE OWNER-CORRECTION ROUTE (executive.health.input.set, human-gated): the input's owner restates its reading with a reason; anyone else is refused. */
  @Post('/executive/health/inputs/set')
  async setHealthInput(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateSetInput(body.payload ?? {}, envelope.correlation_id);
    const editId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.input.set', 'HSD', null), ExecutiveCapability.healthInputs,
      async (cap, scope) => ({ result: await cap.setHealthInput({ editId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, componentKey: intake.componentKey, value: intake.value, reason: intake.reason, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'HSD', targetId: editId, targetVersion: null, outboxEvent: null }));
    return { edit: out.result, receipt: receipt(out) };
  }

  /** The anti-gaming measure per owner (a read): edits, the ones flagged on a favourable change, the components touched. */
  @Post('/executive/health/owner-edits')
  async ownerEditAnalysis(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { definitionId?: string } }) {
    const { envelope, principal } = ctx(req);
    const definitionId = typeof body.payload?.definitionId === 'string' && ExecutiveController.UUID.test(body.payload.definitionId) ? body.payload.definitionId : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSD', definitionId), ExecutiveCapability.healthInputs,
      async (cap, scope) => cap.ownerEditAnalysis({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, definitionId }));
    return { analysis: out.result, receipt: receipt(out) };
  }

  @Post('/executive/health/exceptions/list')
  async listHealthExceptions(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: string; definitionId?: string; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSX', null), ExecutiveCapability.read,
      async (cap) => this.healthInputs.exceptions(cap, body.payload ?? {}));
    return { exceptions: out.result, receipt: receipt(out) };
  }

  /** An exception REQUESTED (executive.health.exception.request, human-gated): a component excluded or its bound relaxed, with a reason and an expiry; no effect until approved. */
  @Post('/executive/health/exceptions/request')
  async requestHealthException(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateExceptionRequest(body.payload ?? {}, envelope.correlation_id);
    const exceptionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.exception.request', 'HSX', exceptionId), ExecutiveCapability.healthInputs,
      async (cap, scope) => ({ result: await cap.requestHealthException({ exceptionId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, componentKey: intake.componentKey, kind: intake.kind, relaxedDays: intake.relaxedDays, reason: intake.reason, expiresAt: intake.expiresAt, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'HSX', targetId: exceptionId, targetVersion: null, outboxEvent: null }));
    return { exception: out.result, receipt: receipt(out) };
  }

  /** An exception APPROVED or refused (executive.health.exception.approve, human-gated) by ANOTHER person holding the executive's authority — the port refuses the requester. */
  @Post('/executive/health/exceptions/:exceptionId/approve')
  async approveHealthException(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exceptionId') exceptionId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(exceptionId, 'exceptionId', envelope.correlation_id);
    const intake = validateExceptionDecision(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.exception.approve', 'HSX', exceptionId), ExecutiveCapability.healthInputs,
      async (cap, scope) => ({ result: await cap.approveHealthException({ exceptionId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, decision: intake.decision, note: intake.note, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'HSX', targetId: exceptionId, targetVersion: null, outboxEvent: null }));
    return { exception: out.result, receipt: receipt(out) };
  }

  /** The PREVIEW of a snapshot's approval: the digest it binds, the consequence, the flagged changes, the owner-stated inputs, the exceptions in force, the approvals and signatures so far. */
  @Post('/executive/health/snapshots/:snapshotId/approval-preview')
  async previewHealthSnapshotApproval(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('snapshotId') snapshotId: string) {
    const { envelope, principal } = ctx(req);
    this.idOr422(snapshotId, 'snapshotId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.health.read', 'HSS', snapshotId), ExecutiveCapability.healthInputs,
      async (cap) => this.healthInputs.preview(cap, snapshotId, envelope.correlation_id));
    return { preview: out.result, receipt: receipt(out) };
  }

  /** The executive ACCEPTS a current snapshot on the digest previewed (executive.health.snapshot.approve, human-gated) — recorded and SIGNED beyond the audit chain in the same write. */
  @Post('/executive/health/snapshots/:snapshotId/approve')
  async approveHealthSnapshot(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('snapshotId') snapshotId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(snapshotId, 'snapshotId', envelope.correlation_id);
    const intake = validateSnapshotApproval(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.snapshot.approve', 'HSS', snapshotId), ExecutiveCapability.healthInputs,
      async (cap, scope) => ({ result: await this.healthInputs.approveSnapshot(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, snapshotId, digest: intake.digest, note: intake.note, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'HSS', targetId: snapshotId, targetVersion: '1', outboxEvent: null }));
    return { approval: out.result, receipt: receipt(out) };
  }
  /* end B36 strategy */

  /** A challenge DECIDED (upheld | dismissed) by a person who is neither the challenger nor the definition's approver (human-gated). */
  @Post('/executive/health/changes/:changeId/decide')
  async decideHealthChange(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('changeId') changeId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    this.idOr422(changeId, 'changeId', envelope.correlation_id);
    const intake = validateDecideChange(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.health.change.decide', 'HSC', changeId), ExecutiveCapability.health,
      async (cap, scope) => ({ result: await cap.decideChange({ changeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, decision: intake.decision, note: intake.note, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'HSC', targetId: changeId, targetVersion: null, outboxEvent: null }));
    return { change: out.result, receipt: receipt(out) };
  }
  /* end B32 health */
}
