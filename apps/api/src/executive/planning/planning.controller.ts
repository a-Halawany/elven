/**
 * THE HTTP SURFACE OF STRATEGIC PLANNING — CP-6 B36 part `planning` (migration 0094 §P; F-P6-10; WS-16). Same envelope, same capabilities,
 * same receipts as the executive controller: every write is one governed write whose port asserts the route's own action (an EXACT PDP
 * rule, the B36 planning block); every read is a consequential read under executive.plan.read. The routes live under /planning/… of the
 * domain. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { PlanningCapability } from './planning.capabilities.js';
import { PlanningService, assertUuid, validateAcknowledgement, validateAlign, validateAsOf, validateAuthority, validateDependency, validateFunding, validateMeasureBind,
  validateMilestone, validateNote, validatePlan, validatePriority, validateProposal, validateReason } from './planning.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const limitOf = (p: Row): number => (typeof p['limit'] === 'number' && Number.isFinite(p['limit']) ? Math.trunc(p['limit'] as number) : 200);

@Controller('/v1/tenants/:tenantId/domains/:domainId/planning')
export class PlanningController {
  constructor(private readonly pipeline: PipelineService, private readonly planning: PlanningService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── the plan ─────────────────────────
  @Post('/plans/declare')
  async declarePlan(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validatePlan(body.payload ?? {}, envelope.correlation_id);
    const planId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.declare', 'PLN', planId), PlanningCapability.plan,
      async (cap) => {
        const r = await cap.declarePlan({ planId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'PLN', targetId: planId, targetVersion: '0', outboxEvent: null };
      });
    return { plan: out.result, receipt: receipt(out) };
  }

  @Post('/plans/list')
  async listPlans(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.plan.read', 'PLN', null), PlanningCapability.read,
      async (cap) => ({ at: await cap.now(), plans: await this.planning.plans(cap, { state: typeof p['state'] === 'string' ? p['state'] : null, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** The workspace's read: the plan, its initiatives with objectives, transitions and milestones, dependencies, measures, runs, versions with signatures, variances, breaches, events. */
  @Post('/plans/:planId/get')
  async getPlan(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('planId') planId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(planId, 'planId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.plan.read', 'PLN', planId), PlanningCapability.read,
      async (cap) => ({ plan: await this.planning.view(cap, planId, envelope.correlation_id) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE REPLAY: the plan as of an instant (`at`; the database's now when omitted). */
  @Post('/plans/:planId/as-of')
  async planAsOf(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('planId') planId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(planId, 'planId', envelope.correlation_id);
    const at = validateAsOf(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.plan.read', 'PLN', planId), PlanningCapability.read,
      async (cap) => ({ replay: await this.planning.asOf(cap, planId, at, envelope.correlation_id) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE SCENARIO SENSITIVITY: a run's outputs on the plan's milestones (a read; the run's outputs digest named). */
  @Post('/plans/:planId/sensitivity')
  async planSensitivity(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('planId') planId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(planId, 'planId', envelope.correlation_id);
    const runId = assertUuid((body.payload ?? {})['runId'], 'runId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.plan.read', 'PLN', planId), PlanningCapability.read,
      async (cap) => ({ sensitivity: await this.planning.sensitivity(cap, planId, runId) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/plans/:planId/authority')
  async setAuthority(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('planId') planId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(planId, 'planId', envelope.correlation_id);
    const p = validateAuthority(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.authority.set', 'PLN', planId), PlanningCapability.plan,
      async (cap) => {
        const r = await cap.setPlanAuthority({ planId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'PLN', targetId: planId, targetVersion: null, outboxEvent: null };
      });
    return { authority: out.result, receipt: receipt(out) };
  }

  @Post('/plans/:planId/review')
  async reviewPlan(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('planId') planId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(planId, 'planId', envelope.correlation_id);
    const p = validateNote(body.payload ?? {}, envelope.correlation_id, true);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.review', 'PLN', planId), PlanningCapability.plan,
      async (cap) => {
        const r = await cap.reviewPlan({ planId, tenantId, domainId, note: p.note as string, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'PLN', targetId: planId, targetVersion: null, outboxEvent: null };
      });
    return { review: out.result, receipt: receipt(out) };
  }

  /** THE BASELINE: the signed version (the executive), the PLN object admitted. */
  @Post('/plans/:planId/baseline')
  async baselinePlan(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('planId') planId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(planId, 'planId', envelope.correlation_id);
    const p = validateNote(body.payload ?? {}, envelope.correlation_id, false);
    const versionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.baseline', 'PLN', planId), PlanningCapability.plan,
      async (cap) => {
        const r = await this.planning.baseline(cap, { versionId, planId, tenantId, domainId, note: p.note, actor: principal.principalId, correlationId: envelope.correlation_id, purposeId: envelope.purpose_id ?? 'executive' });
        return { result: r, targetType: 'PLN', targetId: planId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { baseline: out.result, receipt: receipt(out) };
  }

  @Post('/plans/:planId/measures/bind')
  async bindMeasure(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('planId') planId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(planId, 'planId', envelope.correlation_id);
    const p = validateMeasureBind(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.measure.bind', 'PLN', planId), PlanningCapability.edit,
      async (cap) => {
        const r = await cap.bindMeasure({ planId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'PLN', targetId: planId, targetVersion: null, outboxEvent: null };
      });
    return { measure: out.result, receipt: receipt(out) };
  }

  @Post('/plans/:planId/runs/attach')
  async attachRun(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('planId') planId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(planId, 'planId', envelope.correlation_id);
    const runId = assertUuid((body.payload ?? {})['runId'], 'runId', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.run.attach', 'PLN', planId), PlanningCapability.edit,
      async (cap) => {
        const r = await cap.attachRun({ planId, tenantId, domainId, runId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'PLN', targetId: planId, targetVersion: null, outboxEvent: null };
      });
    return { run: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the initiatives ─────────────────────────
  @Post('/initiatives/propose')
  async proposeInitiative(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateProposal(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.initiative.propose', 'INI', p.initiativeId), PlanningCapability.initiative,
      async (cap) => {
        const r = await cap.proposeInitiative({ tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'INI', targetId: p.initiativeId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { initiative: out.result, receipt: receipt(out) };
  }

  @Post('/initiatives/list')
  async listInitiatives(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const planId = typeof p['planId'] === 'string' ? assertUuid(p['planId'], 'planId', envelope.correlation_id) : null;
    const objectiveId = typeof p['objectiveId'] === 'string' ? assertUuid(p['objectiveId'], 'objectiveId', envelope.correlation_id) : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.plan.read', 'INI', null), PlanningCapability.read,
      async (cap) => ({ at: await cap.now(), initiatives: await this.planning.initiatives(cap, { planId, objectiveId, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  private async transition(req: EyeRequest, tenantId: string, domainId: string, initiativeId: string, action: string,
                           run: (cap: ReturnType<typeof PlanningCapability.initiative>, actor: string, correlationId: string) => Promise<Row>) {
    const { envelope, principal } = ctx(req);
    assertUuid(initiativeId, 'initiativeId', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, action, 'INI', initiativeId), PlanningCapability.initiative,
      async (cap) => {
        const r = await run(cap, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'INI', targetId: initiativeId, targetVersion: String(r['version'] ?? ''), outboxEvent: null };
      });
    return { initiative: out.result, receipt: receipt(out) };
  }

  @Post('/initiatives/:initiativeId/align')
  async alignInitiative(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('initiativeId') initiativeId: string, @Body() body: Payload) {
    const p = validateAlign(body.payload ?? {}, requireCorrelation(req));
    return this.transition(req, tenantId, domainId, initiativeId, 'executive.initiative.align', (cap, actor, correlationId) => cap.alignInitiative({ initiativeId, tenantId, domainId, ...p, actor, correlationId }));
  }
  @Post('/initiatives/:initiativeId/prioritise')
  async prioritiseInitiative(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('initiativeId') initiativeId: string, @Body() body: Payload) {
    const p = validatePriority(body.payload ?? {}, requireCorrelation(req));
    return this.transition(req, tenantId, domainId, initiativeId, 'executive.initiative.prioritise', (cap, actor, correlationId) => cap.prioritiseInitiative({ initiativeId, tenantId, domainId, ...p, actor, correlationId }));
  }
  @Post('/initiatives/:initiativeId/fund')
  async fundInitiative(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('initiativeId') initiativeId: string, @Body() body: Payload) {
    const p = validateFunding(body.payload ?? {}, requireCorrelation(req));
    return this.transition(req, tenantId, domainId, initiativeId, 'executive.initiative.fund', (cap, actor, correlationId) => cap.fundInitiative({ initiativeId, tenantId, domainId, ...p, actor, correlationId }));
  }
  /** THE HUMAN BOUNDARY: approval by a second named human; the INI object's next version admitted. */
  @Post('/initiatives/:initiativeId/approve')
  async approveInitiative(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('initiativeId') initiativeId: string, @Body() body: Payload) {
    const { envelope } = ctx(req);
    const p = validateReason(body.payload ?? {}, envelope.correlation_id);
    return this.transition(req, tenantId, domainId, initiativeId, 'executive.initiative.approve',
      (cap, actor, correlationId) => this.planning.approve(cap, { initiativeId, tenantId, domainId, rationale: p['rationale'] as string, actor, correlationId, purposeId: envelope.purpose_id ?? 'executive' }));
  }
  @Post('/initiatives/:initiativeId/pause')
  async pauseInitiative(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('initiativeId') initiativeId: string, @Body() body: Payload) {
    const p = validateReason(body.payload ?? {}, requireCorrelation(req), 'reason');
    return this.transition(req, tenantId, domainId, initiativeId, 'executive.initiative.pause', (cap, actor, correlationId) => cap.pauseInitiative({ initiativeId, tenantId, domainId, reason: p['reason'] as string, actor, correlationId }));
  }
  @Post('/initiatives/:initiativeId/close')
  async closeInitiative(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('initiativeId') initiativeId: string, @Body() body: Payload) {
    const p = validateReason(body.payload ?? {}, requireCorrelation(req), 'reason');
    return this.transition(req, tenantId, domainId, initiativeId, 'executive.initiative.close', (cap, actor, correlationId) => cap.closeInitiative({ initiativeId, tenantId, domainId, reason: p['reason'] as string, actor, correlationId }));
  }

  // ───────────────────────── the planning edits ─────────────────────────
  @Post('/milestones/set')
  async setMilestone(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateMilestone(body.payload ?? {}, envelope.correlation_id);
    const milestoneId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.milestone.set', 'INI', p.initiativeId), PlanningCapability.edit,
      async (cap) => {
        const r = await cap.setMilestone({ milestoneId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'INI', targetId: p.initiativeId, targetVersion: null, outboxEvent: null };
      });
    return { milestone: out.result, receipt: receipt(out) };
  }

  @Post('/dependencies/declare')
  async declareDependency(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateDependency(body.payload ?? {}, envelope.correlation_id);
    const dependencyId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.dependency.declare', 'INI', p.from), PlanningCapability.edit,
      async (cap) => {
        const r = await cap.declareDependency({ dependencyId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'INI', targetId: p.from, targetVersion: null, outboxEvent: null };
      });
    return { dependency: out.result, receipt: receipt(out) };
  }

  @Post('/breaches/:breachId/acknowledge')
  async acknowledgeBreach(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('breachId') breachId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(breachId, 'breachId', envelope.correlation_id);
    const p = validateAcknowledgement(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.breach.acknowledge', 'PLN', null), PlanningCapability.edit,
      async (cap) => {
        const r = await cap.acknowledgeBreach({ breachId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'PLN', targetId: String(r['plan_id']), targetVersion: null, outboxEvent: null };
      });
    return { breach: out.result, receipt: receipt(out) };
  }

  /** The citation: a decision package names the initiative it commits to (the package event initiative.cited). */
  @Post('/packages/:packageId/cite')
  async citeInitiative(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'packageId', envelope.correlation_id);
    const initiativeId = assertUuid((body.payload ?? {})['initiativeId'], 'initiativeId', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.plan.initiative.cite', 'DEC', packageId), PlanningCapability.edit,
      async (cap) => {
        const r = await cap.citeInitiative({ packageId, tenantId, domainId, initiativeId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'DEC', targetId: packageId, targetVersion: null, outboxEvent: null };
      });
    return { citation: out.result, receipt: receipt(out) };
  }
}
