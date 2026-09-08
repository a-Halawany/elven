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
  constructor(private readonly pipeline: PipelineService, private readonly rooms: RoomService, private readonly briefings: BriefingService) {}
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
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'room.open', 'ROOM', roomId), ExecutiveCapability.room,
      async (cap, scope) => {
        const r = await this.rooms.open(cap, scope, { packageId: p.packageId as string, title: String(p.title ?? ''), reviewEveryDays: Number(p.reviewEveryDays ?? 7) }, principal.principalId, envelope.correlation_id, roomId);
        return { result: r, targetType: 'ROOM', targetId: roomId, targetVersion: '1', outboxEvent: null };
      });
    return { room: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/:roomId/membership')
  async membership(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('roomId') roomId: string, @Body() body: { payload?: { principal?: string; role?: string; op?: 'add' | 'remove' } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'room.membership', 'ROOM', roomId), ExecutiveCapability.room,
      async (cap, scope) => {
        const r = await this.rooms.membership(cap, scope, roomId, { principal: String(p.principal ?? ''), role: String(p.role ?? 'observer'), op: p.op === 'remove' ? 'remove' : 'add' }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'ROOM', targetId: roomId, targetVersion: '1', outboxEvent: null };
      });
    return { membership: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/:roomId/cadence')
  async cadence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('roomId') roomId: string, @Body() body: { payload?: { reviewEveryDays?: number; nextReviewAt?: string | null } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'room.cadence', 'ROOM', roomId), ExecutiveCapability.room,
      async (cap, scope) => {
        const r = await this.rooms.cadence(cap, scope, roomId, { everyDays: Number(p.reviewEveryDays ?? 7), nextReviewAt: typeof p.nextReviewAt === 'string' ? instant(p.nextReviewAt, new Date().toISOString()) : null }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'ROOM', targetId: roomId, targetVersion: '1', outboxEvent: null };
      });
    return { cadence: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/:roomId/review')
  async review(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('roomId') roomId: string, @Body() body: { payload?: { note?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.review', 'ROOM', roomId), ExecutiveCapability.room,
      async (cap, scope) => {
        const r = await this.rooms.review(cap, scope, roomId, String(body.payload?.note ?? ''), principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'ROOM', targetId: roomId, targetVersion: '1', outboxEvent: null };
      });
    return { review: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/list')
  async listRooms(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'room.read', 'ROOM', null), ExecutiveCapability.read, async (cap) => this.rooms.list(cap, principal.principalId));
    return { rooms: out.result, receipt: receipt(out) };
  }

  @Post('/rooms/:roomId/get')
  async getRoom(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('roomId') roomId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'room.read', 'ROOM', roomId), ExecutiveCapability.read, async (cap) => this.rooms.get(cap, roomId, principal.principalId, envelope.correlation_id));
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
}
