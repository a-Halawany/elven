/**
 * THE HTTP SURFACE OF SCENARIO ANATOMY — CP-6 B27 part `anatomy` (migration 0097 §A; F-P4-07). A controller of its own under
 * …/prediction/scenarios/anatomy (four or more segments below /prediction, so none meets prediction.controller.ts' /scenarios/:id/<verb>
 * routes). Every write is ONE governed write whose port asserts the route's own EXACT action (the `/* B27 anatomy *\/` PDP block); the read is
 * a consequential read under prediction.scenario.anatomy.read. Nothing here decides a rule a port decides.
 *
 *   POST /:scenarioId/read                          the anatomy (elements by kind per branch, the intervention → impact map, the register, the records, suspensions)
 *   POST /:scenarioId/elements/declare              a new element                                   (prediction.scenario.anatomy.element)
 *   POST /:scenarioId/elements/:elementId/revise    a revision naming the version read               (prediction.scenario.anatomy.element)
 *   POST /:scenarioId/elements/:elementId/retire    a reasoned retirement                            (prediction.scenario.anatomy.retire)
 *   POST /:scenarioId/assumptions/link              link / revise / relink an ASU                    (prediction.scenario.anatomy.assumption)
 *   POST /:scenarioId/assumptions/:linkId/unlink    a reasoned unlink                                (prediction.scenario.anatomy.assumption)
 *   POST /:scenarioId/records/add                   a narrative, implication or option record        (prediction.scenario.anatomy.record)
 *   POST /branches/:branchId/suspend                a person suspends a live branch with a reason    (prediction.scenario.anatomy.suspend)
 *   POST /branches/:branchId/reinstate              the branch or scenario owner reinstates          (prediction.scenario.anatomy.reinstate)
 *   POST /assumptions/:assumptionId/apply           a person re-applies an ASU's invalidation         (prediction.scenario.anatomy.suspend)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../../shared/ids.js';
import { requireCorrelation } from '../../../shared/correlation.js';
import { PipelineService } from '../../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../../pipeline/http.js';
import { AnatomyCapability } from './anatomy.capabilities.js';
import { AnatomyService, assertId, validateElement, validateLink, validateReason, validateRecord, validateSuspend } from './anatomy.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction/scenarios/anatomy')
export class AnatomyController {
  constructor(private readonly pipeline: PipelineService, private readonly anatomy: AnatomyService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────── the static-prefixed routes FIRST (a path id never shadows them) ─────────────
  /** A PERSON suspends a live branch with a reason (cause operator, or the element named). */
  @Post('/branches/:branchId/suspend')
  async suspend(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('branchId') branchId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const id = assertId(branchId, 'branch', 'branch suspension', envelope.correlation_id);
    const p = validateSuspend(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.anatomy.suspend', 'SCN', id), AnatomyCapability.suspension,
      async (cap) => ({ result: await cap.suspendBranch({ branchId: id, reason: p.reason, elementId: p.elementId, tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SCN', targetId: id, targetVersion: null, outboxEvent: null }));
    return { suspension: out.result, receipt: receipt(out) };
  }

  /** The branch's owner or the scenario's owner REINSTATES with a note (refused while a critical linked assumption is still invalidated). */
  @Post('/branches/:branchId/reinstate')
  async reinstate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('branchId') branchId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const id = assertId(branchId, 'branch', 'branch suspension', envelope.correlation_id);
    const note = validateReason(body.payload ?? {}, 'note', 16, 'branch suspension', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.anatomy.reinstate', 'SCN', id), AnatomyCapability.suspension,
      async (cap) => ({ result: await cap.reinstateBranch({ branchId: id, note, tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id }),
                        targetType: 'SCN', targetId: id, targetVersion: null, outboxEvent: null }));
    return { reinstatement: out.result, receipt: receipt(out) };
  }

  /** A PERSON re-applies an invalidated assumption's suspension (the trigger's path by hand; idempotent). */
  @Post('/assumptions/:assumptionId/apply')
  async apply(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('assumptionId') assumptionId: string) {
    const { envelope, principal } = ctx(req);
    const id = assertId(assumptionId, 'assumption', 'branch suspension', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.anatomy.suspend', 'ASU', id), AnatomyCapability.suspension,
      async (cap) => ({ result: await cap.applyInvalidation({ assumptionId: id, tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'ASU', targetId: id, targetVersion: null, outboxEvent: null }));
    return { application: out.result, receipt: receipt(out) };
  }

  // ───────────── a scenario's anatomy ─────────────
  /** THE READ: the anatomy as of the database's instant, the map composed. */
  @Post('/:scenarioId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scenarioId') scenarioId: string) {
    const { envelope, principal } = ctx(req);
    const id = assertId(scenarioId, 'scenario', 'scenario element', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.anatomy.read', 'SCN', id), AnatomyCapability.read,
      async (cap) => ({ at: await cap.now(), anatomy: await cap.anatomy(id) }));
    if (out.result.anatomy === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `scenario element rejected (unknown_scenario): no scenario ${id} in this domain`), 404);
    return { at: out.result.at, anatomy: this.anatomy.compose(out.result.anatomy), receipt: receipt(out) };
  }

  @Post('/:scenarioId/elements/declare')
  async declareElement(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scenarioId') scenarioId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const id = assertId(scenarioId, 'scenario', 'scenario element', envelope.correlation_id);
    const p = validateElement(body.payload ?? {}, envelope.correlation_id);
    if (p.expectedVersion !== null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'scenario element rejected (expectedVersion): a new element names no version; a revision goes to …/elements/:elementId/revise'), 422);
    return this.writeElement(tenantId, domainId, id, newId(), p, envelope, principal);
  }

  @Post('/:scenarioId/elements/:elementId/revise')
  async reviseElement(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scenarioId') scenarioId: string, @Param('elementId') elementId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const id = assertId(scenarioId, 'scenario', 'scenario element', envelope.correlation_id);
    const el = assertId(elementId, 'element', 'scenario element', envelope.correlation_id);
    const p = validateElement(body.payload ?? {}, envelope.correlation_id);
    if (p.expectedVersion === null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'scenario element rejected (expectedVersion): a revision names the version it read (expectedVersion)'), 422);
    return this.writeElement(tenantId, domainId, id, el, p, envelope, principal);
  }

  private async writeElement(tenantId: string, domainId: string, scenarioId: string, elementId: string, p: ReturnType<typeof validateElement>,
                             envelope: NonNullable<EyeRequest['eyeEnvelope']>, principal: NonNullable<EyeRequest['eyePrincipal']>) {
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.anatomy.element', 'SCN', scenarioId), AnatomyCapability.elements,
      async (cap) => {
        const r = await cap.declareElement({ elementId, scenarioId, branchId: p.branchId, kind: p.kind, name: p.name, description: p.description, attributes: p.attributes, graphRefs: p.graphRefs,
          expectedVersion: p.expectedVersion, tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SCN', targetId: scenarioId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { element: out.result, receipt: receipt(out) };
  }

  @Post('/:scenarioId/elements/:elementId/retire')
  async retireElement(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scenarioId') scenarioId: string, @Param('elementId') elementId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const id = assertId(scenarioId, 'scenario', 'scenario element', envelope.correlation_id);
    const el = assertId(elementId, 'element', 'scenario element', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, 'reason', 8, 'scenario element', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.anatomy.retire', 'SCN', id), AnatomyCapability.elements,
      async (cap) => {
        const r = await cap.retireElement({ elementId: el, reason, tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        if (String(r['scenario_id']) !== id) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `scenario element rejected (unknown_element): ${el} is not an element of scenario ${id}`), 404);
        return { result: r, targetType: 'SCN', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { element: out.result, receipt: receipt(out) };
  }

  @Post('/:scenarioId/assumptions/link')
  async link(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scenarioId') scenarioId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const id = assertId(scenarioId, 'scenario', 'scenario assumption', envelope.correlation_id);
    const p = validateLink(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.anatomy.assumption', 'SCN', id), AnatomyCapability.assumptions,
      async (cap) => {
        const r = await cap.linkAssumption({ linkId: newId(), scenarioId: id, branchId: p.branchId, assumptionId: p.assumptionId, critical: p.critical, condition: p.condition, rationale: p.rationale,
          expectedVersion: p.expectedVersion, tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SCN', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { link: out.result, receipt: receipt(out) };
  }

  @Post('/:scenarioId/assumptions/:linkId/unlink')
  async unlink(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scenarioId') scenarioId: string, @Param('linkId') linkId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const id = assertId(scenarioId, 'scenario', 'scenario assumption', envelope.correlation_id);
    const link = assertId(linkId, 'link', 'scenario assumption', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, 'reason', 16, 'scenario assumption', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.anatomy.assumption', 'SCN', id), AnatomyCapability.assumptions,
      async (cap) => {
        const r = await cap.unlinkAssumption({ linkId: link, reason, tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        if (String(r['scenario_id']) !== id) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `scenario assumption rejected (unknown_link): ${link} is not a link of scenario ${id}`), 404);
        return { result: r, targetType: 'SCN', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { link: out.result, receipt: receipt(out) };
  }

  @Post('/:scenarioId/records/add')
  async addRecord(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scenarioId') scenarioId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const id = assertId(scenarioId, 'scenario', 'scenario record', envelope.correlation_id);
    const p = validateRecord(body.payload ?? {}, envelope.correlation_id);
    const recordId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.anatomy.record', 'SCN', id), AnatomyCapability.records,
      async (cap) => {
        const r = await cap.addRecord({ recordId, scenarioId: id, branchId: p.branchId, kind: p.kind, title: p.title, body: p.body, cites: p.cites, supersedes: p.supersedes,
          tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SCN', targetId: id, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { record: out.result, receipt: receipt(out) };
  }
}
