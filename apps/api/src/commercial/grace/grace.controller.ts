/**
 * CP-6 B91 §GR (0105 §GR) — the grace and continuity routes. Same envelope, pipeline, capabilities and receipts as every governed route;
 * every read is `commercial.grace.read` (consequential, audited), every write its own exact action (the B91 grace PDP rules), human-gated.
 *
 * THE COMMERCIAL AUTHORITY (PLATFORM scope; the vendor's named human):
 *   POST /v1/commercial/grace/licences/list                       commercial.grace.read          (every tenant's newest live versions)
 *   POST /v1/commercial/grace/standing                            commercial.grace.read          (payload tenantId: the tenant's standing)
 *   POST /v1/commercial/grace/licences/:licenceId/renew           commercial.licence.renew       (version, renewedUntil, reason, evidence)
 *   POST /v1/commercial/grace/licences/:licenceId/suspend         commercial.licence.suspend     (version, reason, evidence)
 *   POST /v1/commercial/grace/licences/:licenceId/reinstate       commercial.licence.reinstate   (version, reason, evidence)
 *   POST /v1/commercial/grace/policies/set                        commercial.grace.set           (tenantId, expectedVersion, graceDays, allows, renewalNoticeDays, reason)
 *   POST /v1/commercial/grace/licences/:licenceId/offline-token   commercial.offline_token.issue (version, profile, expiresAt, keyRef, reason) → the token
 *   POST /v1/commercial/grace/tokens/:tokenId/read                commercial.grace.read          (the token re-served exactly as issued)
 * THE TENANT (TENANT scope: the tenant administrator, the auditor):
 *   POST /v1/tenants/:tenantId/commercial/grace/standing          commercial.grace.read          (the /admin/commercial surface)
 *   POST /v1/tenants/:tenantId/commercial/grace/rules             commercial.grace.read          (commercial.grace_rules: what §EN's gate reads)
 * THE DOMAIN (the simulation workspace's readers):
 *   POST /v1/tenants/:tenantId/domains/:domainId/commercial/grace/explanation   commercial.grace.read  (payload capability, default 'simulation')
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { GraceCapability } from './grace.capabilities.js';
import { GraceService, validatePolicy, validateRenewal, validateToken, validateTransition } from './grace.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAPABILITY_KEY = /^[a-z][a-z0-9_]{1,40}$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
function id(v: string, what: string, correlationId: string): string {
  if (!UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${what} must be an id`), 400);
  return v;
}
const platform = (action: string, objectType: string, objectId: string | null) => ({ scope: 'PLATFORM' as const, tenantId: null, domainId: null, action, objectType, objectId });

@Controller()
export class GraceController {
  constructor(private readonly pipeline: PipelineService, private readonly grace: GraceService) {}

  // ── the commercial authority (PLATFORM) ───────────────────────────────────────────
  @Post('/v1/commercial/grace/licences/list')
  async listLicences(@Req() req: EyeRequest, @Body() body: { payload?: { tenantId?: string } }) {
    const { envelope, principal } = ctx(req);
    const t = body?.payload?.tenantId;
    const tenantId = typeof t === 'string' ? id(t, 'tenantId', envelope.correlation_id) : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, platform('commercial.grace.read', 'LIC', null), GraceCapability.read,
      async (cap) => this.grace.licences(cap, tenantId));
    return { licences: out.result, receipt: receipt(out) };
  }

  @Post('/v1/commercial/grace/standing')
  async platformStanding(@Req() req: EyeRequest, @Body() body: { payload?: { tenantId?: string } }) {
    const { envelope, principal } = ctx(req);
    const tenantId = id(String(body?.payload?.tenantId ?? ''), 'tenantId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, platform('commercial.grace.read', 'LIC', null), GraceCapability.read,
      async (cap) => this.grace.standing(cap, tenantId));
    return { standing: out.result, receipt: receipt(out) };
  }

  @Post('/v1/commercial/grace/licences/:licenceId/renew')
  async renew(@Req() req: EyeRequest, @Param('licenceId') licenceIdRaw: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const licenceId = id(licenceIdRaw, 'licenceId', envelope.correlation_id);
    const intake = validateRenewal(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.licence.renew', 'LIC', licenceId), GraceCapability.transition,
      async (cap) => ({ result: await this.grace.renew(cap, licenceId, intake, principal.principalId, envelope.correlation_id), targetType: 'LIC', targetId: licenceId, targetVersion: String(intake.version), outboxEvent: null }));
    return { transition: out.result, receipt: receipt(out) };
  }

  @Post('/v1/commercial/grace/licences/:licenceId/suspend')
  async suspend(@Req() req: EyeRequest, @Param('licenceId') licenceIdRaw: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const licenceId = id(licenceIdRaw, 'licenceId', envelope.correlation_id);
    const intake = validateTransition(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.licence.suspend', 'LIC', licenceId), GraceCapability.transition,
      async (cap) => ({ result: await this.grace.suspend(cap, licenceId, intake, principal.principalId, envelope.correlation_id), targetType: 'LIC', targetId: licenceId, targetVersion: String(intake.version), outboxEvent: null }));
    return { transition: out.result, receipt: receipt(out) };
  }

  @Post('/v1/commercial/grace/licences/:licenceId/reinstate')
  async reinstate(@Req() req: EyeRequest, @Param('licenceId') licenceIdRaw: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const licenceId = id(licenceIdRaw, 'licenceId', envelope.correlation_id);
    const intake = validateTransition(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.licence.reinstate', 'LIC', licenceId), GraceCapability.transition,
      async (cap) => ({ result: await this.grace.reinstate(cap, licenceId, intake, principal.principalId, envelope.correlation_id), targetType: 'LIC', targetId: licenceId, targetVersion: String(intake.version), outboxEvent: null }));
    return { transition: out.result, receipt: receipt(out) };
  }

  @Post('/v1/commercial/grace/policies/set')
  async setPolicy(@Req() req: EyeRequest, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validatePolicy(body?.payload ?? {}, envelope.correlation_id);
    const policyId = newId();
    const out = await this.pipeline.write(envelope, principal, platform('commercial.grace.set', 'GRP', policyId), GraceCapability.policy,
      async (cap) => {
        const r = await this.grace.setPolicy(cap, policyId, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'GRP', targetId: policyId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { policy: out.result, receipt: receipt(out) };
  }

  @Post('/v1/commercial/grace/licences/:licenceId/offline-token')
  async issueToken(@Req() req: EyeRequest, @Param('licenceId') licenceIdRaw: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const licenceId = id(licenceIdRaw, 'licenceId', envelope.correlation_id);
    const intake = validateToken(body?.payload ?? {}, envelope.correlation_id);
    const tokenId = newId();
    const out = await this.pipeline.write(envelope, principal, platform('commercial.offline_token.issue', 'LTK', tokenId), GraceCapability.token,
      async (cap) => ({ result: await this.grace.issueToken(cap, licenceId, tokenId, intake, principal.principalId, envelope.correlation_id), targetType: 'LTK', targetId: tokenId, targetVersion: '1', outboxEvent: null }));
    return { record: out.result.record, token: out.result.token, receipt: receipt(out) };
  }

  @Post('/v1/commercial/grace/tokens/:tokenId/read')
  async readToken(@Req() req: EyeRequest, @Param('tokenId') tokenIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const tokenId = id(tokenIdRaw, 'tokenId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, platform('commercial.grace.read', 'LTK', tokenId), GraceCapability.read,
      async (cap) => this.grace.token(cap, tokenId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no offline token matches'), 404);
    return { record: out.result.record, token: out.result.token, receipt: receipt(out) };
  }

  // ── the tenant (TENANT) ───────────────────────────────────────────────────────────
  @Post('/v1/tenants/:tenantId/commercial/grace/standing')
  async standing(@Req() req: EyeRequest, @Param('tenantId') tenantIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const tenantId = id(tenantIdRaw, 'tenantId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, { scope: 'TENANT', tenantId, domainId: null, action: 'commercial.grace.read', objectType: 'LIC', objectId: null },
      GraceCapability.read, async (cap) => this.grace.standing(cap, tenantId));
    return { standing: out.result, receipt: receipt(out) };
  }

  @Post('/v1/tenants/:tenantId/commercial/grace/rules')
  async rules(@Req() req: EyeRequest, @Param('tenantId') tenantIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const tenantId = id(tenantIdRaw, 'tenantId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, { scope: 'TENANT', tenantId, domainId: null, action: 'commercial.grace.read', objectType: 'LIC', objectId: null },
      GraceCapability.read, async (cap) => cap.graceRules(tenantId));
    return { rules: out.result, receipt: receipt(out) };
  }

  // ── the domain (the simulation workspace's banner) ───────────────────────────────
  @Post('/v1/tenants/:tenantId/domains/:domainId/commercial/grace/explanation')
  async explanation(@Req() req: EyeRequest, @Param('tenantId') tenantIdRaw: string, @Param('domainId') domainIdRaw: string, @Body() body: { payload?: { capability?: string } }) {
    const { envelope, principal } = ctx(req);
    const tenantId = id(tenantIdRaw, 'tenantId', envelope.correlation_id);
    const domainId = id(domainIdRaw, 'domainId', envelope.correlation_id);
    const c = body?.payload?.capability ?? 'simulation';
    if (typeof c !== 'string' || !CAPABILITY_KEY.test(c)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'capability must be a capability key'), 422);
    const out = await this.pipeline.consequentialRead(envelope, principal, { scope: 'DOMAIN', tenantId, domainId, action: 'commercial.grace.read', objectType: 'LIC', objectId: null },
      GraceCapability.read, async (cap) => this.grace.explanation(cap, tenantId, c));
    return { explanation: out.result, receipt: receipt(out) };
  }
}
