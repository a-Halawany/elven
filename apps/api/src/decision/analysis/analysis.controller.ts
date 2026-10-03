/**
 * THE HTTP SURFACE OF DECISION OPTION ANALYSIS — CP-6 B35 part `analysis` (migration 0101 §A; F-P6-01, F-P5-07's adversarial-response
 * sensitivity, F-P4-08's reversibility and option value across futures). Its OWN controller under /decisions/analysis/… (decision.controller.ts'
 * routes are never edited):
 *
 *   POST …/decisions/analysis/list                                           the domain's packages (decision.analysis.read)
 *   POST …/decisions/analysis/packages/:packageId/read                       the ANALYSIS of a version — criteria and history, assessments,
 *                                                                            the server's scores and ranking, the weight sensitivity, the
 *                                                                            trade-offs, the obligations, the value of information, the
 *                                                                            validated second-order effects, robustness/regret and option
 *                                                                            value across futures, the adversarial rank changes, the newest
 *                                                                            candidates and assembly; the actors the package's scenarios name
 *                                                                            (decision.analysis.read)
 *   POST …/packages/:packageId/versions/:version/criteria                   the CRITERIA with exposed weights, the value-judgment owner named
 *                                                                            (decision.analysis.criteria; a named human — never an agent)
 *   POST …/packages/:packageId/versions/:version/assess                     an option's value on a criterion — computed from a cited object
 *                                                                            or entered with its basis (decision.analysis.assess)
 *   POST …/packages/:packageId/obligations                                  a CONSTRAINT or STAKEHOLDER OBLIGATION (decision.analysis.obligation)
 *   POST …/packages/:packageId/versions/:version/evaluate                   the obligations evaluated per option (decision.analysis.evaluate)
 *   POST …/packages/:packageId/versions/:version/generate                   option CANDIDATES (defer, stage, pilot, hedge, acquire information,
 *                                                                            exit) — drafts; the Decision Agent may (decision.analysis.generate)
 *   POST …/packages/:packageId/versions/:version/assemble                   the package's inputs found, each with why (decision.analysis.assemble)
 *   POST …/packages/:packageId/versions/:version/adversarial                an option's result under a named actor's response
 *                                                                            (decision.analysis.adversarial)
 *
 * No write here emits an outbox event or a package event: the analysis lives in its own records.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { AnalysisCapability } from './analysis.capabilities.js';
import { AnalysisService } from './analysis.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const READ = 'decision.analysis.read';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const limitOf = (p: Row): number => (typeof p['limit'] === 'number' && Number.isFinite(p['limit']) ? Math.max(1, Math.min(200, Math.trunc(p['limit'] as number))) : 50);

@Controller('/v1/tenants/:tenantId/domains/:domainId/decisions/analysis')
export class AnalysisController {
  constructor(private readonly pipeline: PipelineService, private readonly analysis: AnalysisService) {}
  private route(tenantId: string, domainId: string, action: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: 'DPK', objectId };
  }
  private write<T>(req: EyeRequest, tenantId: string, domainId: string, action: string, packageId: string, version: number | null, call: (cap: ReturnType<typeof AnalysisCapability.write>, actor: string, correlationId: string) => Promise<T>) {
    const { envelope, principal } = ctx(req);
    return this.pipeline.write(envelope, principal, this.route(tenantId, domainId, action, packageId), AnalysisCapability.write,
      async (cap) => ({ result: await call(cap, principal.principalId, envelope.correlation_id), targetType: 'DPK', targetId: packageId, targetVersion: version === null ? null : String(version), outboxEvent: null }));
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, null), AnalysisCapability.read,
      async (cap) => ({ at: await cap.now(), packages: await cap.packages(limitOf(body.payload ?? {})) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/packages/:packageId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const pkg = this.analysis.packageId(packageId, envelope.correlation_id);
    const version = this.analysis.readVersion(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, pkg), AnalysisCapability.read, async (cap) => {
      const analysis = await cap.analysis(pkg, version);
      const v = analysis === null ? null : Number((analysis['version'] as Row)['version']);
      return { analysis, actors: v === null ? [] : await cap.actors(pkg, v) };
    });
    if (out.result.analysis === null) {
      throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `analysis rejected (unknown_package): ${pkg}${version === null ? '' : ` version ${version}`} is not a decision package of this domain`), 404);
    }
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/packages/:packageId/versions/:version/criteria')
  async criteria(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string, @Body() body: Payload) {
    const correlationId = ctx(req).envelope.correlation_id;
    const pkg = this.analysis.packageId(packageId, correlationId); const v = this.analysis.version(version, correlationId);
    const c = this.analysis.criteria(body?.payload ?? {}, correlationId);
    const out = await this.write(req, tenantId, domainId, 'decision.analysis.criteria', pkg, v, (cap, actor, cid) =>
      cap.setCriteria({ tenantId, domainId, packageId: pkg, version: v, criteria: c.criteria, valueOwner: c.valueOwner, rationale: c.rationale, expectedVersion: c.expectedVersion, actor, correlationId: cid }));
    return { criteria: out.result, receipt: receipt(out) };
  }

  @Post('/packages/:packageId/versions/:version/assess')
  async assess(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string, @Body() body: Payload) {
    const correlationId = ctx(req).envelope.correlation_id;
    const pkg = this.analysis.packageId(packageId, correlationId); const v = this.analysis.version(version, correlationId);
    const a = this.analysis.assessment(body?.payload ?? {}, correlationId);
    const out = await this.write(req, tenantId, domainId, 'decision.analysis.assess', pkg, v, (cap, actor, cid) =>
      cap.assess({ assessmentId: a.assessmentId, tenantId, domainId, packageId: pkg, version: v, option: a.option, criterion: a.criterion, value: a.value, cited: a.cited, basis: a.basis, actor, correlationId: cid }));
    return { assessment: out.result, receipt: receipt(out) };
  }

  @Post('/packages/:packageId/obligations')
  async obligation(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const correlationId = ctx(req).envelope.correlation_id;
    const pkg = this.analysis.packageId(packageId, correlationId);
    const o = this.analysis.obligation(body?.payload ?? {}, correlationId);
    const out = await this.write(req, tenantId, domainId, 'decision.analysis.obligation', pkg, null, (cap, actor, cid) =>
      cap.declareObligation({ obligationId: o.obligationId, tenantId, domainId, packageId: pkg, key: o.key, kind: o.kind, stakeholder: o.stakeholder, stakeholderRef: o.stakeholderRef, statement: o.statement,
                              test: o.test, owner: o.owner, actor, correlationId: cid }));
    return { obligation: out.result, receipt: receipt(out) };
  }

  @Post('/packages/:packageId/versions/:version/evaluate')
  async evaluate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string, @Body() body: Payload) {
    const correlationId = ctx(req).envelope.correlation_id;
    const pkg = this.analysis.packageId(packageId, correlationId); const v = this.analysis.version(version, correlationId);
    const judgments = this.analysis.judgments(body?.payload ?? {}, correlationId);
    const evaluationId = newId();
    const out = await this.write(req, tenantId, domainId, 'decision.analysis.evaluate', pkg, v, (cap, actor, cid) =>
      cap.evaluate({ evaluationId, tenantId, domainId, packageId: pkg, version: v, judgments, actor, correlationId: cid }));
    return { evaluation: out.result, receipt: receipt(out) };
  }

  @Post('/packages/:packageId/versions/:version/generate')
  async generate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string) {
    const correlationId = ctx(req).envelope.correlation_id;
    const pkg = this.analysis.packageId(packageId, correlationId); const v = this.analysis.version(version, correlationId);
    const generationId = newId();
    const out = await this.write(req, tenantId, domainId, 'decision.analysis.generate', pkg, v, (cap, actor, cid) =>
      cap.generate({ generationId, tenantId, domainId, packageId: pkg, version: v, actor, correlationId: cid }));
    return { generation: out.result, receipt: receipt(out) };
  }

  @Post('/packages/:packageId/versions/:version/assemble')
  async assemble(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string) {
    const correlationId = ctx(req).envelope.correlation_id;
    const pkg = this.analysis.packageId(packageId, correlationId); const v = this.analysis.version(version, correlationId);
    const assemblyId = newId();
    const out = await this.write(req, tenantId, domainId, 'decision.analysis.assemble', pkg, v, (cap, actor, cid) =>
      cap.assemble({ assemblyId, tenantId, domainId, packageId: pkg, version: v, actor, correlationId: cid }));
    return { assembly: out.result, receipt: receipt(out) };
  }

  @Post('/packages/:packageId/versions/:version/adversarial')
  async adversarial(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string, @Body() body: Payload) {
    const correlationId = ctx(req).envelope.correlation_id;
    const pkg = this.analysis.packageId(packageId, correlationId); const v = this.analysis.version(version, correlationId);
    const a = this.analysis.adversarial(body?.payload ?? {}, correlationId);
    const out = await this.write(req, tenantId, domainId, 'decision.analysis.adversarial', pkg, v, (cap, actor, cid) =>
      cap.adversarial({ assessmentId: a.assessmentId, tenantId, domainId, packageId: pkg, version: v, option: a.option, actorElementId: a.actorElementId, response: a.response, effects: a.effects, basis: a.basis,
                        actor, correlationId: cid }));
    return { adversarial: out.result, receipt: receipt(out) };
  }
}
