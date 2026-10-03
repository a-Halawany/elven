/**
 * THE HTTP SURFACE OF SIMULATION VALIDITY — CP-6 B31 part `validity` (migration 0099 §V; F-P5-09, F-P4-07/-09's B31 pieces). The twin
 * module's envelope, capabilities and receipts: every write is one governed write whose port asserts the route's own action (an EXACT PDP
 * rule, the B31 validity block); every read is a consequential read under simulation.validity.read. The routes live under
 * /simulations/validity/… of the domain — never under /twins, so none meets TwinController's /:twinId/… routes. Nothing here decides a rule
 * a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../../shared/ids.js';
import { requireCorrelation } from '../../../shared/correlation.js';
import { PipelineService } from '../../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../../pipeline/http.js';
import { ValidityCapability } from './validity.capabilities.js';
import { assertUuid, comparisonVerdict, validateBinding, validatePolicy, validateReach, validateRetirement, validateRunIds, type DecisionUse } from './validity.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const READ = 'simulation.validity.read';
const intOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null);
const uuidOrNull = (v: unknown, what: string, correlationId: string): string | null => (v === undefined || v === null ? null : assertUuid(v, what, correlationId));

@Controller('/v1/tenants/:tenantId/domains/:domainId/simulations/validity')
export class ValidityController {
  constructor(private readonly pipeline: PipelineService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** THE RUNS of the domain (optionally a twin or a branch), each with its DECISION USE and label. */
  @Post('/runs/list')
  async listRuns(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = uuidOrNull(p['twinId'], 'twin', envelope.correlation_id); const branchId = uuidOrNull(p['branchId'], 'branch', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SIM', null), ValidityCapability.read,
      async (cap) => ({ at: await cap.now(), runs: await cap.runs({ twinId, branchId, limit: 100 }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** ONE RUN's decision use (decision | diagnostic | refused), the reasons and the label; with the assumption sensitivity of its branch. */
  @Post('/runs/:runId/use')
  async runUse(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('runId') runId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(runId, 'run', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SIM', runId), ValidityCapability.read,
      async (cap) => ({ use: await cap.decisionUse(runId), sensitivity: await cap.assumptionSensitivity(runId) }));
    if (out.result.use === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `run use rejected (unknown_run): ${runId} is not a run of this domain`), 404);
    return { use: out.result.use, assumptionSensitivity: out.result.sensitivity, receipt: receipt(out) };
  }

  /** THE COMPARISON LABELLED: each named run's use, and whether the comparison rests on decision-grade results only. */
  @Post('/compare')
  async compare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const runIds = validateRunIds(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SIM', null), ValidityCapability.read,
      async (cap) => Promise.all(runIds.map((id) => cap.decisionUse(id))));
    const missing = runIds.filter((_, i) => out.result[i] === null);
    if (missing.length > 0) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `run use rejected (unknown_run): ${missing.join(', ')} is not a run of this domain`), 404);
    const uses = out.result as Row[];
    return { runs: uses, verdict: comparisonVerdict(uses.map((u) => ({ run_id: String(u['run_id']), use: u['use'] as DecisionUse }))), receipt: receipt(out) };
  }

  /** THE PACKAGE's run validity: every option's cited runs with their validity and use, the invalidated input marked, the policy. */
  @Post('/packages/:packageId')
  async packageValidity(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(packageId, 'package', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'DPK', packageId), ValidityCapability.read,
      async (cap) => cap.packageValidity(packageId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `run use rejected (unknown_package): ${packageId} is not a package of this domain`), 404);
    return { package: out.result, receipt: receipt(out) };
  }

  /** THE DOMAIN'S DECISION-USE POLICY (every version). */
  @Post('/policy/read')
  async readPolicy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SIM', null), ValidityCapability.read,
      async (cap) => cap.policies());
    return { current: out.result[0] ?? null, history: out.result, receipt: receipt(out) };
  }

  /** SET the policy (a named human; the next version names the version it read). */
  @Post('/policy')
  async setPolicy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validatePolicy(body.payload ?? {}, envelope.correlation_id);
    const policyId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.validity.policy', 'SIM', policyId), ValidityCapability.policy,
      async (cap) => {
        const r = await cap.setPolicy({ policyId, tenantId, domainId, require: p.require, rationale: p.rationale, expectedVersion: p.expectedVersion, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SIM', targetId: policyId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { policy: out.result, receipt: receipt(out) };
  }

  /** THE REACH of a twin correction: the recorded identifications and what the version reaches now. */
  @Post('/reach/list')
  async listReach(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = uuidOrNull(p['twinId'], 'twin', envelope.correlation_id); const version = intOrNull(p['version']);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'TWN', twinId), ValidityCapability.read,
      async (cap) => ({ reaches: await cap.reaches({ twinId, version, limit: 50 }),
                        now: twinId !== null && version !== null ? await cap.reachNow({ tenantId, domainId, twinId, version }) : null }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** IDENTIFY the reach of a twin version again (a person's act): recorded, the owners tasked. */
  @Post('/reach/identify')
  async identifyReach(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const r0 = validateReach(body.payload ?? {}, envelope.correlation_id);
    const reachId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.validity.reach', 'TWN', r0.twinId), ValidityCapability.reach,
      async (cap) => {
        const r = await cap.identifyReach({ reachId, tenantId, domainId, twinId: r0.twinId, version: r0.version, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'TWN', targetId: r0.twinId, targetVersion: String(r0.version), outboxEvent: null };
      });
    return { reach: out.result, receipt: receipt(out) };
  }

  /** THE BRANCH's twin binding (the active one, the history, the runs on the branch and whether each started from it). */
  @Post('/branches/:branchId/binding')
  async binding(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('branchId') branchId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(branchId, 'branch', envelope.correlation_id, 'branch binding');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'BRN', branchId), ValidityCapability.read,
      async (cap) => cap.binding(branchId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `branch binding rejected (unknown_branch): ${branchId} is not a branch of this domain`), 404);
    return { binding: out.result, receipt: receipt(out) };
  }

  /** BIND (or REBIND, naming the version read) a branch to its baseline twin state — the branch's or the scenario's owner. */
  @Post('/branches/:branchId/bind')
  async bind(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('branchId') branchId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(branchId, 'branch', envelope.correlation_id, 'branch binding');
    const b = validateBinding(body.payload ?? {}, envelope.correlation_id);
    const bindingId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.validity.bind', 'BRN', branchId), ValidityCapability.binding,
      async (cap) => {
        const r = await cap.bind({ bindingId, tenantId, domainId, branchId, twinId: b.twinId, twinVersion: b.twinVersion, conditions: b.conditions, constraintSetId: b.constraintSetId,
          assumptionFactors: b.assumptionFactors, rationale: b.rationale, expectedVersion: b.expectedVersion, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'BRN', targetId: branchId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { binding: out.result, receipt: receipt(out) };
  }

  /** RETIRE a branch's active binding (the same owners; a reason). */
  @Post('/branches/:branchId/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('branchId') branchId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(branchId, 'branch', envelope.correlation_id, 'branch binding');
    const reason = validateRetirement(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.validity.bind', 'BRN', branchId), ValidityCapability.binding,
      async (cap) => {
        const r = await cap.retire({ tenantId, domainId, branchId, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'BRN', targetId: branchId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { binding: out.result, receipt: receipt(out) };
  }
}
