/**
 * CP-6 B29 §D (0092) — the constraint engine's routes: constraint sets (topology, conservation, business rules) declared and versioned
 * by a constraint steward, and the plan check. Base: /v1/tenants/:tenantId/domains/:domainId/constraints. Same envelope, capabilities
 * and receipts as the twin routes; every read is `simulation.constraint.read` (consequential, audited), every write its own exact action
 * (the B29 PDP rules):
 *
 *   POST /sets/list                     simulation.constraint.read
 *   POST /sets/declare                  simulation.constraint.declare   (a constraint steward — or a domain administrator naming one)
 *   POST /sets/:setId/read              simulation.constraint.read      (the set, every version, its events)
 *   POST /sets/:setId/version           simulation.constraint.version   (the set's own steward, or a domain administrator)
 *   POST /sets/:setId/retire            simulation.constraint.retire    (the same)
 *   POST /plans/check                   simulation.plan.check           (the verdict: SATISFIED 200, VIOLATED 422 with every violation —
 *                                                                        the plan refused —, INDETERMINATE 409; the check is recorded in
 *                                                                        every case, the refusal answered after it commits)
 *   POST /checks/list                   simulation.constraint.read
 *   POST /checks/:checkId/read          simulation.constraint.read
 *   POST /checks/:checkId/reproduce     simulation.constraint.read      (re-derived against the PINNED set versions; nothing written)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ConstraintCapability } from './constraint.capabilities.js';
import { ConstraintService, validatePlanIntake, validateReason, validateSetIntake, validateVersionIntake } from './constraint.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT_KINDS = ['plan', 'run_input', 'run_output'] as const;
const OUTCOMES = ['satisfied', 'violated', 'indeterminate'] as const;

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
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null);

@Controller('/v1/tenants/:tenantId/domains/:domainId/constraints')
export class ConstraintsController {
  constructor(private readonly pipeline: PipelineService, private readonly constraints: ConstraintService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ── sets ───────────────────────────────────────────────────────────────────────────
  @Post('/sets/list')
  async listSets(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: string } }) {
    const { envelope, principal } = ctx(req);
    const state = oneOf(body?.payload?.state, ['live', 'retired'] as const);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.constraint.read', 'CST', null),
      ConstraintCapability.read, async (cap) => this.constraints.listSets(cap, state));
    return { sets: out.result, receipt: receipt(out) };
  }

  @Post('/sets/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateSetIntake(body?.payload ?? {}, envelope.correlation_id);
    const setId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.constraint.declare', 'CST', setId), ConstraintCapability.set,
      async (cap, scope) => {
        const r = await this.constraints.declare(cap, scope, intake, principal.principalId, envelope.correlation_id, setId);
        return { result: r, targetType: 'CST', targetId: setId, targetVersion: '1', outboxEvent: null };
      });
    return { set: out.result, receipt: receipt(out) };
  }

  @Post('/sets/:setId/read')
  async readSet(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const setId = id(setIdRaw, 'setId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.constraint.read', 'CST', setId),
      ConstraintCapability.read, async (cap) => this.constraints.getSet(cap, setId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized constraint set matches'), 404);
    return { set: out.result, receipt: receipt(out) };
  }

  @Post('/sets/:setId/version')
  async version(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setIdRaw: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const setId = id(setIdRaw, 'setId', envelope.correlation_id);
    const intake = validateVersionIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.constraint.version', 'CST', setId), ConstraintCapability.set,
      async (cap, scope) => {
        const r = await this.constraints.version(cap, scope, setId, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'CST', targetId: setId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { set: out.result, receipt: receipt(out) };
  }

  @Post('/sets/:setId/retire')
  async retire(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setIdRaw: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const setId = id(setIdRaw, 'setId', envelope.correlation_id);
    const reason = validateReason(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.constraint.retire', 'CST', setId), ConstraintCapability.set,
      async (cap, scope) => {
        const r = await this.constraints.retire(cap, scope, setId, reason, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'CST', targetId: setId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { set: out.result, receipt: receipt(out) };
  }

  // ── the plan check ─────────────────────────────────────────────────────────────────
  /**
   * A plan (quantities per key per day, each in a stated unit, + edges) checked against the current versions of the named sets (every
   * live set when none is named). The check is RECORDED either way; a violated plan is REFUSED — 422 naming every violated constraint,
   * its bound and what the plan has (e.g. the day warehouse capacity is exceeded) — and an indeterminate verdict answers 409, never 200.
   */
  @Post('/plans/check')
  async checkPlan(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validatePlanIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'simulation.plan.check', 'CCK', null), ConstraintCapability.check,
      async (cap, scope) => {
        const r = await this.constraints.checkPlan(cap, scope, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'CCK', targetId: String(r.check['check_id']), targetVersion: '1', outboxEvent: null,
                 evidence: { resultCode: `PLAN_${r.verdict.outcome.toUpperCase()}`, metadata: { check_id: r.check['check_id'], outcome: r.verdict.outcome, violations: r.verdict.violations.length } } };
      });
    const { check, verdict } = out.result;
    const answer = { check, verdict, receipt: receipt(out) };
    if (verdict.outcome === 'violated') {
      const named = verdict.violations.map((v) => `${v.constraintKey} (${v.kind}): bound ${v.bound}, observed ${v.observed}`).join('; ');
      throw new HttpException({ ...errorBody('EYE_REQ_001', envelope.correlation_id,
        `plan refused: ${intake.subject.ref} violates ${verdict.violations.length} constraint${verdict.violations.length === 1 ? '' : 's'} — ${named}`.slice(0, 2000)), ...answer }, 422);
    }
    if (verdict.outcome === 'indeterminate') {
      throw new HttpException({ ...errorBody('EYE_STA_002', envelope.correlation_id,
        `plan not judged: the check of ${intake.subject.ref} is indeterminate — ${verdict.indeterminateReason ?? 'no reason given'} (an indeterminate check is never a pass)`.slice(0, 2000)), ...answer }, 409);
    }
    return answer;
  }

  // ── checks ─────────────────────────────────────────────────────────────────────────
  @Post('/checks/list')
  async listChecks(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string,
    @Body() body: { payload?: { subjectKind?: string; subjectRef?: string; outcome?: string; limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const limit = Number.isInteger(p.limit) && (p.limit as number) >= 1 && (p.limit as number) <= 200 ? (p.limit as number) : 50;
    const f = { subjectKind: oneOf(p.subjectKind, SUBJECT_KINDS), subjectRef: typeof p.subjectRef === 'string' && p.subjectRef.length <= 200 ? p.subjectRef : null, outcome: oneOf(p.outcome, OUTCOMES), limit };
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.constraint.read', 'CCK', null),
      ConstraintCapability.read, async (cap) => this.constraints.listChecks(cap, f));
    return { checks: out.result, receipt: receipt(out) };
  }

  @Post('/checks/:checkId/read')
  async readCheck(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('checkId') checkIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const checkId = id(checkIdRaw, 'checkId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.constraint.read', 'CCK', checkId),
      ConstraintCapability.read, async (cap) => this.constraints.getCheck(cap, checkId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized constraint check matches'), 404);
    return { check: out.result, receipt: receipt(out) };
  }

  @Post('/checks/:checkId/reproduce')
  async reproduce(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('checkId') checkIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const checkId = id(checkIdRaw, 'checkId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'simulation.constraint.read', 'CCK', checkId),
      ConstraintCapability.read, async (cap) => this.constraints.reproduce(cap, checkId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized constraint check matches'), 404);
    return { reproduction: out.result, receipt: receipt(out) };
  }
}
