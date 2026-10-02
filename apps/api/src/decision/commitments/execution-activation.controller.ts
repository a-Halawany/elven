/**
 * THE EXECUTION TARGET ACTIVATION ROUTES — CP-6 B36 part `collab` (0094 §C4; F-P6-05 (u)), under the decision module beside
 * commitment.controller.ts's gateway routes. Every write is human-gated at the PDP and performed by a SECURITY DEFINER port that asserts
 * its own action.
 *
 *   POST …/commitments/targets/register               a NON-synthetic target registered `inactive` by the domain administrator (an https endpoint,
 *                                                     the trust anchor its TLS identity is verified against, a credential by reference)
 *   POST …/commitments/targets/:targetKey/activate    {decisionPackageId} — the execution authority (not the registrar) with the owner's COMMITTED decision
 *   POST …/commitments/targets/:targetKey/deactivate  {reason} — new handoffs refused at once
 *
 * The demonstration ACTIVATES NOTHING REAL: the registered target is a loopback literal (SYNTHETIC record) that the production egress
 * refuses by the B14 rule; the mechanism — inactive → refused handoff → activation with the decision → refused by the egress — is what is shown.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { CommitmentService } from './commitment.service.js';
import { ExecutionActivationCapability } from './execution-activation.capabilities.js';

type Row = Record<string, unknown>;
type B = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const bad = (correlationId: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };

@Controller('/v1/tenants/:tenantId/domains/:domainId/commitments')
export class ExecutionActivationController {
  constructor(private readonly pipeline: PipelineService, private readonly commitments: CommitmentService) {}
  private route(tenantId: string, domainId: string, action: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: 'EXT', objectId };
  }

  @Post('/targets/register')
  async register(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const endpoint = text(p['endpoint']);
    let u: URL | null = null;
    try { u = new URL(endpoint); } catch { u = null; }
    if (u === null || u.protocol !== 'https:' || u.username !== '' || u.password !== '') bad(envelope.correlation_id, 'execution registration rejected (endpoint): an https:// URL without userinfo');
    const anchor = text(p['trustAnchorPem']);
    if (anchor === '') bad(envelope.correlation_id, 'execution registration rejected (trust_anchor): a non-synthetic target declares the trust anchor its TLS identity is verified against');
    const trustAnchorPem = this.commitments.checkAnchor(anchor, envelope.correlation_id);
    const credentialRef = text(p['credentialRef']) === '' ? null : text(p['credentialRef']);
    const targetId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.execution.target.register', null), ExecutionActivationCapability.target,
      async (cap) => {
        const r = await cap.register({ targetId, tenantId, domainId, targetKey: text(p['targetKey']), label: text(p['label']), endpoint, trustAnchorPem, credentialRef, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'EXT', targetId: String(r['target_id']), targetVersion: null, outboxEvent: null };
      });
    return { target: out.result, receipt: receipt(out), note: 'registered INACTIVE — a named execution authority activates it with the owner\'s committed decision; nothing reaches it until then' };
  }

  @Post('/targets/:targetKey/activate')
  async activate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('targetKey') targetKey: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const decisionPackageId = body.payload?.['decisionPackageId'];
    if (typeof decisionPackageId !== 'string' || !UUID.test(decisionPackageId)) bad(envelope.correlation_id, 'payload.decisionPackageId is the owner\'s committed decision package (a uuid) that names the target');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.execution.target.activate', null), ExecutionActivationCapability.target,
      async (cap) => {
        const r = await cap.activate({ tenantId, domainId, targetKey, decisionPackageId: String(decisionPackageId).toLowerCase(), actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'EXT', targetId: String(r['target_id']), targetVersion: null, outboxEvent: null };
      });
    return { target: out.result, receipt: receipt(out) };
  }

  @Post('/targets/:targetKey/deactivate')
  async deactivate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('targetKey') targetKey: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const reason = text(body.payload?.['reason']);
    if (reason.length < 8) bad(envelope.correlation_id, 'execution activation rejected (reason): a deactivation states its reason (8+ characters)');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.execution.target.deactivate', null), ExecutionActivationCapability.target,
      async (cap) => {
        const r = await cap.deactivate({ tenantId, domainId, targetKey, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'EXT', targetId: String(r['target_id']), targetVersion: null, outboxEvent: null };
      });
    return { target: out.result, receipt: receipt(out) };
  }
}
