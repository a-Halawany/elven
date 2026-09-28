/**
 * COMMITMENTS — the HTTP surface of the commitment tracker and the governed execution handoff (CP-6 B34 part C, 0090 §C, F-P6-05).
 * Same envelope, same capabilities, same receipts as the decisions workspace; every write its own exact action (the PDP's B34 block),
 * human-gated; the ISSUE is the one C3 action (decision.execution.issue, execution_authority). Every write that changes an item's
 * standing enqueues CommitmentChanged@v1 in its own transaction (the owning route's outboxEvents).
 *
 *   POST …/commitments/tracker                         decision.commitment.read      the cross-package tracker (as of an instant)
 *   POST …/commitments/:commitmentId/get                decision.commitment.read      items, exceptions, handoffs (attempts, effects, residual, compensations), closures, blockers, timeline
 *   POST …/commitments/:commitmentId/items              decision.commitment.item.declare
 *   POST …/commitments/items/:itemId/accept             decision.commitment.item.accept
 *   POST …/commitments/items/:itemId/complete           decision.commitment.item.complete
 *   POST …/commitments/items/:itemId/exceptions         decision.commitment.exception.raise
 *   POST …/commitments/exceptions/:exceptionId/decide   decision.commitment.exception.decide
 *   POST …/commitments/targets                          decision.execution.target.declare   (SYNTHETIC only)
 *   POST …/commitments/targets/list                     decision.commitment.read
 *   POST …/commitments/targets/:targetKey/retire        decision.execution.target.retire
 *   POST …/commitments/items/:itemId/handoffs           decision.execution.draft
 *   POST …/commitments/handoffs/:handoffId/issue        decision.execution.issue (C3)
 *   POST …/commitments/handoffs/:handoffId/compensations  decision.execution.compensation.assign
 *   POST …/commitments/compensations/:compensationId/cosign  decision.execution.compensation.cosign
 *   POST …/commitments/handoffs/:handoffId/reconcile    decision.execution.reconcile
 *   POST …/commitments/:commitmentId/closure            decision.commitment.closure.propose
 *   POST …/commitments/closures/:closureId/cosign       decision.commitment.close (the CMT's next version)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { CommitmentCapability } from './commitment.capabilities.js';
import { CommitmentService } from './commitment.service.js';

type Row = Record<string, unknown>;
function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const atOf = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null);
type B = { payload?: Row };

@Controller('/v1/tenants/:tenantId/domains/:domainId/commitments')
export class CommitmentController {
  constructor(private readonly pipeline: PipelineService, private readonly commitments: CommitmentService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── reads ─────────────────────────

  @Post('/tracker')
  async tracker(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.commitment.read', 'CMI', null), CommitmentCapability.read,
      async (cap, scope) => this.commitments.tracker(cap, scope, atOf(body.payload?.['at'])));
    return { tracker: out.result, receipt: receipt(out) };
  }

  @Post('/targets/list')
  async listTargets(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.commitment.read', 'EXT', null), CommitmentCapability.read,
      async (cap) => ((await cap.readTargets().select(['target_id', 'target_key', 'label', 'endpoint', 'credential_ref', 'synthetic', 'state', 'retired_at', 'declared_at'] as never).orderBy('declared_at' as never).execute()) as Row[]));
    return { targets: out.result, receipt: receipt(out) };
  }

  @Post('/:commitmentId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('commitmentId') commitmentId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.commitment.read', 'CMT', commitmentId), CommitmentCapability.read,
      async (cap, scope) => this.commitments.commitment(cap, scope, commitmentId, atOf(body.payload?.['at']), envelope.correlation_id));
    return { commitment: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── items and exceptions ─────────────────────────

  @Post('/:commitmentId/items')
  async declareItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('commitmentId') commitmentId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.commitment.item.declare', 'CMT', commitmentId), CommitmentCapability.item,
      async (cap, scope) => {
        const r = await this.commitments.declareItem(cap, scope, commitmentId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'CMI', targetId: String(r.result['item_id']), targetVersion: '1', outboxEvents: r.events };
      });
    return { item: out.result, receipt: receipt(out) };
  }

  @Post('/items/:itemId/accept')
  async accept(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.commitment.item.accept', 'CMI', itemId), CommitmentCapability.item,
      async (cap, scope) => {
        const r = await this.commitments.acceptItem(cap, scope, itemId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'CMI', targetId: itemId, targetVersion: String(r.result['version'] ?? ''), outboxEvents: r.events };
      });
    return { item: out.result, receipt: receipt(out) };
  }

  @Post('/items/:itemId/complete')
  async complete(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.commitment.item.complete', 'CMI', itemId), CommitmentCapability.item,
      async (cap, scope) => {
        const r = await this.commitments.completeItem(cap, scope, itemId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'CMI', targetId: itemId, targetVersion: String(r.result['version'] ?? ''), outboxEvents: r.events };
      });
    return { item: out.result, receipt: receipt(out) };
  }

  @Post('/items/:itemId/exceptions')
  async raise(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.commitment.exception.raise', 'CMI', itemId), CommitmentCapability.item,
      async (cap, scope) => {
        const r = await this.commitments.raiseException(cap, scope, itemId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'CMX', targetId: String(r.result['exception_id']), targetVersion: null, outboxEvents: r.events };
      });
    return { exception: out.result, receipt: receipt(out) };
  }

  @Post('/exceptions/:exceptionId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exceptionId') exceptionId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.commitment.exception.decide', 'CMX', exceptionId), CommitmentCapability.item,
      async (cap, scope) => {
        const r = await this.commitments.decideException(cap, scope, exceptionId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'CMX', targetId: exceptionId, targetVersion: null, outboxEvents: r.events };
      });
    return { exception: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the gateway ─────────────────────────

  @Post('/targets')
  async declareTarget(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.execution.target.declare', 'EXT', null), CommitmentCapability.target,
      async (cap, scope) => {
        const r = await this.commitments.declareTarget(cap, scope, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'EXT', targetId: String(r['target_id']), targetVersion: null, outboxEvent: null };
      });
    return { target: out.result, receipt: receipt(out) };
  }

  @Post('/targets/:targetKey/retire')
  async retireTarget(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('targetKey') targetKey: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.execution.target.retire', 'EXT', null), CommitmentCapability.target,
      async (cap, scope) => {
        const r = await this.commitments.retireTarget(cap, scope, targetKey, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'EXT', targetId: String(r['target_id']), targetVersion: null, outboxEvent: null };
      });
    return { target: out.result, receipt: receipt(out) };
  }

  @Post('/items/:itemId/handoffs')
  async draft(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const handoffId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.execution.draft', 'EXH', handoffId), CommitmentCapability.draft,
      async (cap, scope) => ({ result: await this.commitments.draftHandoff(cap, scope, itemId, body.payload ?? {}, principal.principalId, envelope.correlation_id, handoffId),
                               targetType: 'EXH', targetId: handoffId, targetVersion: null, outboxEvent: null }));
    return { handoff: out.result, receipt: receipt(out) };
  }

  /** THE ISSUE (V03-T-366): C3, human-gated, execution_authority; the first attempt in the same write — its outcome recorded, never thrown. */
  @Post('/handoffs/:handoffId/issue')
  async issue(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('handoffId') handoffId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, { ...this.route(tenantId, domainId, 'decision.execution.issue', 'EXH', handoffId), consequenceClass: 'C3' }, CommitmentCapability.issue,
      async (cap, scope) => {
        const r = await this.commitments.issue(cap, scope, handoffId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'EXH', targetId: handoffId, targetVersion: null, outboxEvents: r.events };
      });
    return { handoff: out.result, receipt: receipt(out) };
  }

  @Post('/handoffs/:handoffId/compensations')
  async compensate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('handoffId') handoffId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.execution.compensation.assign', 'EXH', handoffId), CommitmentCapability.compensation,
      async (cap, scope) => {
        const r = await this.commitments.assignCompensation(cap, scope, handoffId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'EXC', targetId: String(r.result['compensation_id']), targetVersion: null, outboxEvents: r.events };
      });
    return { compensation: out.result, receipt: receipt(out) };
  }

  @Post('/compensations/:compensationId/cosign')
  async cosignCompensation(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('compensationId') compensationId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.execution.compensation.cosign', 'EXC', compensationId), CommitmentCapability.compensation,
      async (cap, scope) => {
        const r = await this.commitments.cosignCompensation(cap, scope, compensationId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'EXC', targetId: compensationId, targetVersion: null, outboxEvents: r.events };
      });
    return { compensation: out.result, receipt: receipt(out) };
  }

  @Post('/handoffs/:handoffId/reconcile')
  async reconcile(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('handoffId') handoffId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.execution.reconcile', 'EXH', handoffId), CommitmentCapability.compensation,
      async (cap, scope) => {
        const r = await this.commitments.reconcile(cap, scope, handoffId, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'EXH', targetId: handoffId, targetVersion: null, outboxEvents: r.events };
      });
    return { handoff: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── closure ─────────────────────────

  @Post('/:commitmentId/closure')
  async proposeClosure(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('commitmentId') commitmentId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.commitment.closure.propose', 'CMT', commitmentId), CommitmentCapability.closure,
      async (cap, scope) => {
        const r = await this.commitments.proposeClosure(cap, scope, commitmentId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r.result, targetType: 'CMT', targetId: commitmentId, targetVersion: null, outboxEvents: r.events };
      });
    return { closure: out.result, receipt: receipt(out) };
  }

  /** THE CO-SIGN (OBJ-37): the reviewer; the CMT's next version admitted under decision.commitment.close — the declared target is the commitment. */
  @Post('/closures/:closureId/cosign')
  async cosignClosure(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('closureId') closureId: string, @Body() body: B) {
    const { envelope, principal } = ctx(req);
    const commitmentId = typeof body.payload?.['commitmentId'] === 'string' ? String(body.payload['commitmentId']) : '';
    if (!/^[0-9a-f-]{36}$/i.test(commitmentId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'commitment closure rejected (commitment): payload.commitmentId names the commitment the co-sign closes'), 422);
    const out = await this.pipeline.write(envelope, principal, { ...this.route(tenantId, domainId, 'decision.commitment.close', 'CMT', commitmentId), writableTargets: [commitmentId] }, CommitmentCapability.closure,
      async (cap, scope) => {
        const r = await this.commitments.cosignClosure(cap, scope, closureId, principal.principalId, envelope.purpose_id ?? 'decision', envelope.correlation_id);
        if (String(r.result['commitment_id']) !== commitmentId) throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, 'commitment closure rejected (commitment): the closure closes another commitment'), 409);
        return { result: r.result, targetType: 'CMT', targetId: commitmentId, targetVersion: String(r.version), outboxEvents: r.events };
      });
    return { closure: out.result, receipt: receipt(out) };
  }
}
