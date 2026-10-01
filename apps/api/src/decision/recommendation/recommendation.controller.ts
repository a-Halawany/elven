/**
 * THE HTTP SURFACE OF RECOMMENDATIONS — CP-6 B35 part `recommendation` (migration 0101 §R; F-P6-02; F-P4-09's and F-P5-06's B35 pieces;
 * ES-37-008). The decision module's envelope, capabilities and receipts: every write is one governed write whose port asserts the route's
 * own action (an EXACT PDP rule, the B35 recommendation block); every read is a consequential read under decision.recommendation.read. The
 * routes live under /decisions/recommendations/… — none meets DecisionController's /:packageId/… shapes (its two-segment routes end in a
 * fixed word this controller never uses; its longer ones name `versions`, `approvals`, `overrides`, `delegations` or `board` second).
 * Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { RecommendationCapability } from './recommendation.capabilities.js';
import { assertUuid, validateAttest, validateReason, validateRecord, validateReview, versionOf } from './recommendation.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const READ = 'decision.recommendation.read';

@Controller('/v1/tenants/:tenantId/domains/:domainId/decisions/recommendations')
export class RecommendationController {
  constructor(private readonly pipeline: PipelineService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** THE PACKAGES of the domain with their recommendation counts (the page's list), newest activity first. */
  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'DPK', null), RecommendationCapability.read,
      async (cap) => ({ at: await cap.now(), packages: await cap.packages(100) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE RATIONALE VIEW of a package (HX-08, WS-15): every recommendation side by side — AI and human, each with what could make it wrong,
   *  its four components, its flags and coverage now, its reviews — with the current version's completeness and the attestations. */
  @Post('/packages/:packageId')
  async view(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'DPK', packageId), RecommendationCapability.read,
      async (cap) => cap.packageRecommendations(packageId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `recommendation rejected (unknown_package): ${packageId} is not a decision package of this domain`), 404);
    return { package: out.result, receipt: receipt(out) };
  }

  /** A VERSION's completeness (FEX-15): the gaps by category, the live recommendations, the attestation, the mode. */
  @Post('/packages/:packageId/versions/:version/completeness')
  async completeness(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'DPK', packageId), RecommendationCapability.read,
      async (cap) => cap.completeness({ packageId, version: v }));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `recommendation rejected (unknown_version): package ${packageId} has no version ${v} in this domain`), 404);
    return { completeness: out.result, receipt: receipt(out) };
  }

  /** RECORD a recommendation on a version's option — a named human or the Decision Agent. */
  @Post('/packages/:packageId/versions/:version/record')
  async record(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
               @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const v = versionOf(version, envelope.correlation_id);
    const c = validateRecord(body.payload ?? {}, envelope.correlation_id);
    const recommendationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.recommendation.record', 'DPK', packageId), RecommendationCapability.record,
      async (cap) => {
        const r = await cap.record({ recommendationId, tenantId, domainId, packageId, version: v, ...c, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { recommendation: out.result, receipt: receipt(out) };
  }

  /** REVIEW a recommendation — a named human who is not its author: accept for consideration, decline, request changes. */
  @Post('/:recommendationId/review')
  async review(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('recommendationId') recommendationId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(recommendationId, 'recommendation', envelope.correlation_id);
    const c = validateReview(body.payload ?? {}, envelope.correlation_id);
    const reviewId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.recommendation.review', 'REC', recommendationId), RecommendationCapability.review,
      async (cap) => {
        const r = await cap.review({ reviewId, tenantId, domainId, recommendationId, ...c, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'REC', targetId: recommendationId, targetVersion: null, outboxEvent: null };
      });
    return { review: out.result, receipt: receipt(out) };
  }

  /** WITHDRAW a recommendation — its human author, or the package owner. */
  @Post('/:recommendationId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('recommendationId') recommendationId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(recommendationId, 'recommendation', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.recommendation.withdraw', 'REC', recommendationId), RecommendationCapability.withdraw,
      async (cap) => {
        const r = await cap.withdraw({ tenantId, domainId, recommendationId, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'REC', targetId: recommendationId, targetVersion: null, outboxEvent: null };
      });
    return { withdrawal: out.result, receipt: receipt(out) };
  }

  /** ATTEST the human-led incomplete-package mode on a draft version — its owner, naming every gap. */
  @Post('/packages/:packageId/versions/:version/attest')
  async attest(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
               @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id, 'incomplete package');
    const v = versionOf(version, envelope.correlation_id, 'incomplete package');
    const c = validateAttest(body.payload ?? {}, envelope.correlation_id);
    const attestationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.incomplete.attest', 'DPK', packageId), RecommendationCapability.attest,
      async (cap) => {
        const r = await cap.attest({ attestationId, tenantId, domainId, packageId, version: v, act: 'attest', missing: c.missing, reason: c.reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { attestation: out.result, receipt: receipt(out) };
  }

  /** ACKNOWLEDGE an attestation — a second named human, never the attester. */
  @Post('/attestations/:attestationId/acknowledge')
  async acknowledge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('attestationId') attestationId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(attestationId, 'attestation', envelope.correlation_id, 'incomplete package');
    const note = validateReason(body.payload ?? {}, envelope.correlation_id, 8, 'incomplete package');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.incomplete.attest', 'DPK', null), RecommendationCapability.attest,
      async (cap) => {
        const r = await cap.attest({ attestationId, tenantId, domainId, packageId: null, version: null, act: 'acknowledge', missing: [], reason: note, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DPK', targetId: String(r['package_id']), targetVersion: String(r['version']), outboxEvent: null };
      });
    return { attestation: out.result, receipt: receipt(out) };
  }
}
