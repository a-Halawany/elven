/**
 * CP-6 B50 §CL (0120_b50_x_cl) — THE CORRECTION-CLOSURE ROUTES: a further controller on the graph's base path (inside the existing api.graph
 * unit, as §PV's and §CI's), so the graph controller is untouched. Every route is a POST under the envelope; each answer is the port's with
 * the receipt (policy decision, audit sequence). Refusals are the port's, in the class form `correction closure rejected (<class>): …`.
 *
 *   READS (graph.read, audited)
 *     POST …/graph/closure/cases/list                {limit?}                         every case with its closure state
 *     POST …/graph/closure/cases/:caseId             {check?}                         one case whole: consumers, acks, freezes, escalations, record, notice
 *                                                                                     (check = true runs the projection reconciliation in the read)
 *     POST …/graph/closure/adoptable                 {}                               the applied cases with no closure record (listed, never adopted)
 *     POST …/graph/closure/contract                  {}                               the domain's closure contract and its versions
 *   THE OWNER'S READ (B82-F cc; graph.closure.obligation.read — the acknowledge / except roles, audited; NOT graph.read)
 *     POST …/graph/closure/obligations               {caseId?}                        the caller's OWN obligations, with only what the act needs
 *   ACTS (human-gated; the sweep is a person's route here and the attention tick's step otherwise)
 *     POST …/graph/closure/contract/declare          {windows, exceptionMaxDays, synthetic, statement, contractId?}   graph.closure.contract.declare
 *     POST …/graph/closure/cases/:caseId/acknowledge {consumerRef, state?, note, recomputeRef?, ackId?}               graph.closure.acknowledge
 *     POST …/graph/closure/cases/:caseId/except      {consumerRef, reason, expiresAt, ownerPrincipalId, ackId?}       graph.closure.except
 *     POST …/graph/closure/cases/:caseId/freeze      {consumerRef, reason}                                            graph.closure.freeze
 *     POST …/graph/closure/freezes/:freezeId/lift    {reason}                                                         graph.closure.freeze.lift
 *     POST …/graph/closure/cases/:caseId/close       {statement}                                                      graph.closure.close
 *     POST …/graph/closure/cases/:caseId/adopt       {reason}                                                         graph.closure.adopt
 *     POST …/graph/closure/sweep                     {}                                                               graph.closure.sweep
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ClosureCapability } from './closure.capabilities.js';
import { acknowledgeIntake, consumerRef, contractIntake, exceptIntake, optionalUuid, text } from './closure.service.js';

type Row = Record<string, unknown>;
type Body_ = { payload?: Row } | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const pathId = (v: string, what: string, correlationId: string): string => {
  if (!UUID_RE.test(v)) throw new HttpException(errorBody('EYE_STA_001', correlationId, `${what} ${v} is not an id of this domain`), 404);
  return v.toLowerCase();
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/graph')
export class ClosureB50Controller {
  constructor(private readonly pipeline: PipelineService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── reads ─────────────────────────
  @Post('/closure/cases/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const limit = typeof body?.payload?.['limit'] === 'number' ? Math.min(Math.max(Math.trunc(body.payload['limit'] as number), 1), 500) : 100;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'COR', null), ClosureCapability.read,
      async (cap) => cap.list({ tenantId, domainId, limit }));
    return { cases: out.result, receipt: receipt(out) };
  }

  @Post('/closure/adoptable')
  async adoptable(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'COR', null), ClosureCapability.read,
      async (cap) => cap.adoptable({ tenantId, domainId }));
    return { cases: out.result, receipt: receipt(out) };
  }

  @Post('/closure/contract')
  async contract(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'CCT', null), ClosureCapability.read,
      async (cap) => cap.contract({ tenantId, domainId }));
    return { contract: out.result, receipt: receipt(out) };
  }

  @Post('/closure/cases/:caseId')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const caseId = pathId(caseIdRaw, 'correction case', envelope.correlation_id);
    const check = body?.payload?.['check'] === true;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'COR', caseId), ClosureCapability.read,
      async (cap) => cap.read({ tenantId, domainId, caseId, check }));
    return { closure: out.result, receipt: receipt(out) };
  }

  /* B82-F cc */
  /** The affected product's owner reaches their OWN obligation without graph.read: the port answers only the consumers the caller
   *  answers for as the acknowledge / except ports decide — never the case's graph, its other consumers or any evidence. */
  @Post('/closure/obligations')
  async obligations(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const caseId = optionalUuid(body?.payload ?? {}, 'caseId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.closure.obligation.read', 'COR', caseId), ClosureCapability.obligations,
      async (cap) => cap.obligations({ tenantId, domainId, actor: principal.principalId, caseId }));
    return { obligations: out.result, receipt: receipt(out) };
  }
  /* end B82-F cc */

  // ───────────────────────── the contract ─────────────────────────
  @Post('/closure/contract/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const c = contractIntake(p, envelope.correlation_id);
    const contractId = optionalUuid(p, 'contractId', envelope.correlation_id) ?? newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.closure.contract.declare', 'CCT', contractId), ClosureCapability.contract,
      async (cap) => {
        const r = await cap.declare({ tenantId, domainId, contractId, ...c, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CCT', targetId: contractId, targetVersion: String(r['version'] ?? ''), outboxEvent: null };
      });
    return { contract: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the consumers' acts ─────────────────────────
  @Post('/closure/cases/:caseId/acknowledge')
  async acknowledge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const caseId = pathId(caseIdRaw, 'correction case', envelope.correlation_id);
    const a = acknowledgeIntake(body?.payload ?? {}, envelope.correlation_id);
    const ackId = a.ackId ?? newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.closure.acknowledge', 'COR', caseId), ClosureCapability.acknowledge,
      async (cap) => {
        const r = await cap.acknowledge({ tenantId, domainId, ackId, caseId, consumerRef: a.consumerRef, state: a.state, note: a.note, recomputeRef: a.recomputeRef, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CAK', targetId: ackId, targetVersion: null, outboxEvent: null };
      });
    return { acknowledgement: out.result, receipt: receipt(out) };
  }

  @Post('/closure/cases/:caseId/except')
  async except(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const caseId = pathId(caseIdRaw, 'correction case', envelope.correlation_id);
    const e = exceptIntake(body?.payload ?? {}, envelope.correlation_id);
    const ackId = e.ackId ?? newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.closure.except', 'COR', caseId), ClosureCapability.except,
      async (cap) => {
        const r = await cap.except({ tenantId, domainId, ackId, caseId, consumerRef: e.consumerRef, reason: e.reason, expiresAt: e.expiresAt, owner: e.owner, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CAK', targetId: ackId, targetVersion: null, outboxEvent: null };
      });
    return { exception: out.result, receipt: receipt(out) };
  }

  @Post('/closure/cases/:caseId/freeze')
  async freeze(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const caseId = pathId(caseIdRaw, 'correction case', envelope.correlation_id);
    const p = body?.payload ?? {};
    const ref = consumerRef(p, envelope.correlation_id);
    const reason = text(p, 'reason', 16, 2000, envelope.correlation_id, 'why the product must not be published now');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.closure.freeze', 'COR', caseId), ClosureCapability.freeze,
      async (cap) => {
        const r = await cap.freeze({ tenantId, domainId, caseId, consumerRef: ref, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'COR', targetId: caseId, targetVersion: null, outboxEvent: null };
      });
    return { freeze: out.result, receipt: receipt(out) };
  }

  @Post('/closure/freezes/:freezeId/lift')
  async lift(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('freezeId') freezeIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const freezeId = pathId(freezeIdRaw, 'freeze', envelope.correlation_id);
    const reason = text(body?.payload ?? {}, 'reason', 16, 2000, envelope.correlation_id, 'why the freeze lifts now');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.closure.freeze.lift', 'CFZ', freezeId), ClosureCapability.lift,
      async (cap) => {
        const r = await cap.lift({ tenantId, domainId, freezeId, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CFZ', targetId: freezeId, targetVersion: null, outboxEvent: null };
      });
    return { freeze: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the case's acts ─────────────────────────
  @Post('/closure/cases/:caseId/close')
  async close(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const caseId = pathId(caseIdRaw, 'correction case', envelope.correlation_id);
    const statement = text(body?.payload ?? {}, 'statement', 16, 2000, envelope.correlation_id, 'what was reconciled');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.closure.close', 'COR', caseId), ClosureCapability.close,
      async (cap) => {
        const r = await cap.close({ tenantId, domainId, caseId, statement, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'COR', targetId: caseId, targetVersion: null, outboxEvent: null };
      });
    return { closure: out.result, receipt: receipt(out) };
  }

  @Post('/closure/cases/:caseId/adopt')
  async adopt(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const caseId = pathId(caseIdRaw, 'correction case', envelope.correlation_id);
    const reason = text(body?.payload ?? {}, 'reason', 16, 2000, envelope.correlation_id, 'why this older case is tracked to its closure now');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.closure.adopt', 'COR', caseId), ClosureCapability.adopt,
      async (cap) => {
        const r = await cap.adopt({ tenantId, domainId, caseId, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'COR', targetId: caseId, targetVersion: null, outboxEvent: null };
      });
    return { closure: out.result, receipt: receipt(out) };
  }

  @Post('/closure/sweep')
  async sweep(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.closure.sweep', 'COR', null), ClosureCapability.sweep,
      async (cap) => {
        const r = await cap.sweep({ tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'COR', targetId: null, targetVersion: null, outboxEvent: null };
      });
    return { sweep: out.result, receipt: receipt(out) };
  }
}
