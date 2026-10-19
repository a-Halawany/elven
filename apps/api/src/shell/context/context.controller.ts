/**
 * B80 §CB (0118 §CB) — THE HTTP SURFACE of the operating context bar (F-P7-E-01: UX-10-001…005, PAT-02, CMP-010). Base
 * `/v1/tenants/:tenantId/domains/:domainId/context`.
 *
 *   read      executive.context.read (audited) — the bar: the principal's current context in this domain (objective, horizon, scenario,
 *             classification ceiling, effective time, its version and digest), the dimensions it cannot honour (unresolved), whether the
 *             principal may set one, the choices with their staleness, the policy bundle in force
 *   impact    executive.context.read (audited) — THE IMPACT PREVIEW of a proposed switch: the changed dimensions, the stale choices, the
 *             affected open work (kept), the approvals (unaffected), the client-held previews (invalidated by the page), the impact digest
 *   commit    executive.context.set (human-gated; every human domain role, D3) — the DELIBERATE commit of the previewed switch: it names the
 *             basis and the impact digest of its preview; a changed basis or changed work is refused `context rejected (stale)` — preview again
 *
 * B36's `/home/context/set` stays as it is (its route, its semantics); the bar commits through this route so that no switch is silent.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { PdpService } from '../../policy/pdp.service.js';
import { ContextCapability } from './context.capabilities.js';
import { ContextBarService, validateCommit, validateProposed } from './context.service.js';

type Row = Record<string, unknown>;
function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Controller('/v1/tenants/:tenantId/domains/:domainId/context')
export class ContextBarController {
  constructor(private readonly pipeline: PipelineService, private readonly service: ContextBarService, private readonly pdp: PdpService) {}
  private route(tenantId: string, domainId: string, action: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: 'CTX', objectId };
  }

  /** THE BAR (UX-10-001/-002, UX-ADR-003): every dimension that changes meaning, explicit; an unresolved one said, never shown current. */
  @Post('/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.context.read', null), ContextCapability.read,
      async (cap, scope) => this.service.bar(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, principalId: principal.principalId, policyVersion: this.pdp.bundleVersion }));
    return { bar: out.result, receipt: receipt(out) };
  }

  /** THE IMPACT PREVIEW (PAT-02, UX-10-003/-004): shown BEFORE any commit; reading it changes nothing. */
  @Post('/impact')
  async impact(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const proposed = validateProposed(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.context.read', null), ContextCapability.read,
      async (cap, scope) => this.service.impact(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string, principalId: principal.principalId, proposed }));
    return { impact: out.result, receipt: receipt(out) };
  }

  /** THE DELIBERATE COMMIT (PAT-02): the previewed switch, or a refusal in the port's words; never a silent switch. */
  @Post('/commit')
  async commit(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateCommit(body.payload ?? {}, envelope.correlation_id);
    const contextId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.context.set', contextId), ContextCapability.write,
      async (cap, scope) => ({ result: await this.service.commit(cap, { contextId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'CTX', targetId: contextId, targetVersion: '1', outboxEvent: null }));
    return { context: out.result, receipt: receipt(out) };
  }
}
