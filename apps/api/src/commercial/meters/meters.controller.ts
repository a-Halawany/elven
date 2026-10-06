/**
 * CP-6 B91 part `meters` (0105 §ME) — THE USAGE SURFACE: the meters per tenant, capability and profile, the caps and their breaches.
 * Two bases (no other stage's controller is touched here; the envelope sweep's refusal lives in B30's fabric controller, in its own
 * `B91 meters` blocks):
 *
 *   TENANT  /v1/tenants/:tenantId/commercial/usage
 *     POST /read            commercial.usage.read   { domainId?, limit? }   the meters (today, this month, all time; per domain), the caps
 *                                                                           with their standing, the breaches, the latest records, the licence
 *     POST /caps/status     commercial.usage.read   { domainId?, dimension? } the live caps and the first reached stop cap
 *     POST /caps            commercial.cap.set      { domainId?, dimension, unit?, period, limit, action, reason }  (human-gated; the
 *                                                                           tenant's administrator; within the licence's limits)
 *   DOMAIN  /v1/tenants/:tenantId/domains/:domainId/commercial/usage
 *     POST /read            commercial.usage.read   { limit? }              the domain's meters and the caps that bound it
 *     POST /caps/status     commercial.usage.read   { dimension? }
 *
 * Every read is consequential and audited (the reader's purpose); every figure the meters hold comes from the recording points (the
 * AFTER triggers and the two ports), never from a client.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { MeterCapability } from './meters.capabilities.js';
import { DIMENSIONS, validateCapIntake } from './meters.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const READ = 'commercial.usage.read';
const SET = 'commercial.cap.set';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const limitOf = (p: Row): number => (typeof p['limit'] === 'number' && Number.isFinite(p['limit']) ? Math.max(1, Math.min(200, Math.trunc(p['limit'] as number))) : 50);
const domainOf = (p: Row, correlationId: string): string | null => {
  const d = p['domainId'];
  if (d === undefined || d === null || d === '') return null;
  if (typeof d !== 'string' || !UUID.test(d)) throw new HttpException(errorBody('EYE_STA_001', correlationId, `usage cap rejected (unknown_domain): ${String(d)} is not a domain id`), 404);
  return d;
};
const dimensionOf = (p: Row, correlationId: string): string | null => {
  const d = p['dimension'];
  if (d === undefined || d === null || d === '') return null;
  if (typeof d !== 'string' || !(DIMENSIONS as readonly string[]).includes(d)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `usage cap rejected (dimension): the dimension is one of ${DIMENSIONS.join(', ')}`), 422);
  return d;
};

@Controller()
export class MetersController {
  constructor(private readonly pipeline: PipelineService) {}
  private tenantRoute(tenantId: string, action: string, objectId: string | null) { return { scope: 'TENANT' as const, tenantId, domainId: null, action, objectType: 'USG', objectId }; }
  private domainRoute(tenantId: string, domainId: string, action: string) { return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: 'USG', objectId: null }; }
  private readStep(envelope: Envelope): Envelope { return { ...envelope, action: READ, side_effect_class: 'none', message_id: newId() } as Envelope; }

  @Post('/v1/tenants/:tenantId/commercial/usage/read')
  async tenantRead(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const domainId = domainOf(p, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(this.readStep(envelope), principal, this.tenantRoute(tenantId, READ, null), MeterCapability.read,
      async (cap) => cap.summary({ tenantId, domainId, limit: limitOf(p) }));
    return { usage: out.result };
  }

  @Post('/v1/tenants/:tenantId/commercial/usage/caps/status')
  async tenantStatus(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const domainId = domainOf(p, envelope.correlation_id); const dimension = dimensionOf(p, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(this.readStep(envelope), principal, this.tenantRoute(tenantId, READ, null), MeterCapability.read,
      async (cap) => cap.capStatus({ tenantId, domainId, dimension }));
    return { status: out.result };
  }

  @Post('/v1/tenants/:tenantId/commercial/usage/caps')
  async setCap(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const intake = validateCapIntake(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.tenantRoute(tenantId, SET, null), MeterCapability.caps,
      async (cap) => {
        const c = await cap.setCap({ tenantId, domainId: intake.domainId, dimension: intake.dimension, unit: intake.unit, period: intake.period, limit: intake.limit, action: intake.action,
                                     reason: intake.reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: c, targetType: 'USG', targetId: String(c['cap_id'] ?? '') || null, targetVersion: c['version'] === undefined ? null : String(c['version']), outboxEvent: null };
      });
    return { cap: out.result, receipt: receipt(out) };
  }

  @Post('/v1/tenants/:tenantId/domains/:domainId/commercial/usage/read')
  async domainRead(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.consequentialRead(this.readStep(envelope), principal, this.domainRoute(tenantId, domainId, READ), MeterCapability.read,
      async (cap) => cap.summary({ tenantId, domainId, limit: limitOf(p) }));
    return { usage: out.result };
  }

  @Post('/v1/tenants/:tenantId/domains/:domainId/commercial/usage/caps/status')
  async domainStatus(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const dimension = dimensionOf(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(this.readStep(envelope), principal, this.domainRoute(tenantId, domainId, READ), MeterCapability.read,
      async (cap) => cap.capStatus({ tenantId, domainId, dimension }));
    return { status: out.result };
  }
}
