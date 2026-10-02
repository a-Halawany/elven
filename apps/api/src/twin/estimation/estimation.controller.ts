/**
 * CP-6 B30 §ES (0103) — the estimation routes (F-P5-02). Base: /v1/tenants/:tenantId/domains/:domainId/twin-estimation. Same envelope,
 * capabilities and receipts as the twin routes; reads are `twin.estimation.read` (consequential, audited — the twin readers, the Reconciliation
 * Agent), each write its own exact action (the B30 estimation PDP rules):
 *
 *   POST /overview                          twin.estimation.read      one twin: its head's values of the estimated keys, estimators, estimates, requests, pending checks
 *   POST /estimators/list                   twin.estimation.read
 *   POST /estimators/declare                twin.estimator.declare    the twin's owner (a re-declaration of the same name is version n+1)
 *   POST /estimators/:estimatorId/retire    twin.estimator.declare    the twin's owner, with a reason
 *   POST /estimates/preview                 twin.estimation.read      the computation without a write (qualification, candidates, constraint check)
 *   POST /estimates/propose                 twin.estimate.propose     computed server-side from the declared estimators — never client values
 *   POST /estimates/list                    twin.estimation.read
 *   POST /estimates/:estimateId/read        twin.estimation.read      the estimate with its qualifications, its ledger and its attention item
 *   POST /estimates/:estimateId/decide      twin.estimate.decide      the twin's owner: approved (a NEW SNAPSHOT, one transaction) | declined (a reason)
 *   POST /requests/list                     twin.estimation.read
 *   POST /requests/create                   twin.observation.request  new observations of a missing or stale input (V02-T-013)
 *   POST /requests/:requestId/cancel        twin.observation.request  the requester or the twin's owner, with a reason
 *   POST /ledger                            twin.estimation.read      the estimation ledger (twin.estimation_events), newest first
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { EstimationCapability } from './estimation.capabilities.js';
import { EstimationService } from './estimation.service.js';
import { ESTIMATE_STATES, REASON_CLASSES, REQUEST_STATES, estimatorProblems, toIntake } from './estimators.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$/;
type Payload = { payload?: Record<string, unknown> };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
function id(v: unknown, what: string, correlationId: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${what} must be an id`), 400);
  return v;
}
const optId = (v: unknown, what: string, c: string): string | null => (v === undefined || v === null ? null : id(v, what, c));
const bad = (c: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', c, msg), 422); };
const text = (v: unknown, min: number, max: number): string | null => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);

@Controller('/v1/tenants/:tenantId/domains/:domainId/twin-estimation')
export class EstimationController {
  constructor(private readonly pipeline: PipelineService, private readonly estimation: EstimationService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  @Post('/overview')
  async overview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const twinId = id(body.payload?.['twinId'], 'twinId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.estimation.read', 'TWN', twinId), EstimationCapability.read,
      async (cap) => this.estimation.overview(cap, twinId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized twin matches'), 404);
    return { overview: out.result, receipt: receipt(out) };
  }

  @Post('/estimators/list')
  async listEstimators(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = optId(p['twinId'], 'twinId', envelope.correlation_id);
    const state = typeof p['state'] === 'string' && ['active', 'superseded', 'retired'].includes(p['state']) ? p['state'] : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.estimation.read', 'TWN', twinId), EstimationCapability.read,
      async (cap) => this.estimation.listEstimators(cap, twinId, state));
    return { estimators: out.result, receipt: receipt(out) };
  }

  @Post('/estimators/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const problems = estimatorProblems(p);
    if (problems.length > 0) bad(envelope.correlation_id, `estimator refused: ${problems.slice(0, 8).join('; ')}`.slice(0, 2000));
    const intake = toIntake(p);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.estimator.declare', 'TWN', intake.twinId), EstimationCapability.declare,
      async (cap, scope) => {
        const r = await this.estimation.declare(cap, scope, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: intake.twinId, targetVersion: null, outboxEvent: null };
      });
    return { estimator: out.result, receipt: receipt(out) };
  }

  @Post('/estimators/:estimatorId/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('estimatorId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const estimatorId = id(raw, 'estimatorId', envelope.correlation_id);
    const reason = text(body.payload?.['reason'], 8, 2000) ?? bad(envelope.correlation_id, 'a retirement says why (reason, 8–2000 characters)');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.estimator.declare', 'TWX', estimatorId), EstimationCapability.declare,
      async (cap, scope) => ({ result: await cap.retire({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id,
        estimatorId, reason }), targetType: 'TWX', targetId: estimatorId, targetVersion: null, outboxEvent: null }));
    return { estimator: out.result, receipt: receipt(out) };
  }

  /** The computation without a write: what a proposal would carry now (qualification, every candidate, the constraint check). */
  @Post('/estimates/preview')
  async preview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const twinId = id(body.payload?.['twinId'], 'twinId', envelope.correlation_id);
    const key = typeof body.payload?.['key'] === 'string' && KEY.test(body.payload['key']) ? body.payload['key'] : bad(envelope.correlation_id, 'key names the estimated element');
    const c = await this.estimation.compute(envelope, principal, tenantId, domainId, twinId, key);
    return { preview: { twin_id: twinId, key, head_version: c.head?.['version'] ?? null, as_of: c.asOf, now: c.now, qualification: c.qualification, candidates: c.candidates,
                        primary: c.primary, constraint: { ...c.constraint, subject: undefined }, unqualified: c.unqualified } };
  }

  @Post('/estimates/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const twinId = id(body.payload?.['twinId'], 'twinId', envelope.correlation_id);
    const key = typeof body.payload?.['key'] === 'string' && KEY.test(body.payload['key']) ? body.payload['key'] : bad(envelope.correlation_id, 'key names the estimated element');
    const r = await this.estimation.propose(envelope, principal, tenantId, domainId, twinId, key, null, { kind: 'person', note: text(body.payload?.['note'], 1, 500) });
    return { estimate: r.estimate, receipt: r.receipt };
  }

  @Post('/estimates/list')
  async listEstimates(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = optId(p['twinId'], 'twinId', envelope.correlation_id);
    const key = typeof p['key'] === 'string' && KEY.test(p['key']) ? p['key'] : null;
    const state = typeof p['state'] === 'string' && (ESTIMATE_STATES as readonly string[]).includes(p['state']) ? p['state'] : null;
    const limit = Number.isInteger(p['limit']) && (p['limit'] as number) >= 1 && (p['limit'] as number) <= 200 ? (p['limit'] as number) : 50;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.estimation.read', 'TWN', twinId), EstimationCapability.read,
      async (cap) => this.estimation.listEstimates(cap, { twinId, key, state, limit }));
    return { estimates: out.result, receipt: receipt(out) };
  }

  @Post('/estimates/:estimateId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('estimateId') raw: string) {
    const { envelope, principal } = ctx(req);
    const estimateId = id(raw, 'estimateId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.estimation.read', 'TWE', estimateId), EstimationCapability.read,
      async (cap) => this.estimation.getEstimate(cap, estimateId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized estimate matches'), 404);
    return { estimate: out.result, receipt: receipt(out) };
  }

  @Post('/estimates/:estimateId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('estimateId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const estimateId = id(raw, 'estimateId', envelope.correlation_id);
    const p = body.payload ?? {};
    if (p['decision'] !== 'approved' && p['decision'] !== 'declined') bad(envelope.correlation_id, 'decision is approved or declined');
    const note = text(p['note'], 1, 2000);
    if (p['decision'] === 'declined' && (note === null || note.length < 8)) bad(envelope.correlation_id, 'a declined estimate states its reason (note, at least 8 characters)');
    const r = await this.estimation.decide(envelope, principal, tenantId, domainId, estimateId, { decision: p['decision'] as 'approved' | 'declined', note, allowIncomplete: p['allowIncomplete'] === true });
    return { decision: r.decision, snapshot: r.snapshot, receipt: r.receipt };
  }

  @Post('/requests/list')
  async listRequests(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = optId(p['twinId'], 'twinId', envelope.correlation_id);
    const state = typeof p['state'] === 'string' && (REQUEST_STATES as readonly string[]).includes(p['state']) ? p['state'] : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.estimation.read', 'TWN', twinId), EstimationCapability.read,
      async (cap) => this.estimation.listRequests(cap, twinId, state));
    return { requests: out.result, receipt: receipt(out) };
  }

  @Post('/requests/create')
  async request(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = id(p['twinId'], 'twinId', envelope.correlation_id);
    const key = p['key'] === undefined || p['key'] === null ? null : (typeof p['key'] === 'string' && KEY.test(p['key']) ? p['key'] : bad(envelope.correlation_id, 'key names a twin element'));
    const estimatorId = optId(p['estimatorId'], 'estimatorId', envelope.correlation_id);
    const input = p['input'];
    if (input === null || typeof input !== 'object' || Array.isArray(input)) bad(envelope.correlation_id, 'input is { kind: series, series_key } or { kind: element, key }');
    if (typeof p['reasonClass'] !== 'string' || !(REASON_CLASSES as readonly string[]).includes(p['reasonClass'])) bad(envelope.correlation_id, `reasonClass is one of ${REASON_CLASSES.join(', ')}`);
    const note = text(p['note'], 8, 2000) ?? bad(envelope.correlation_id, 'note says what is missing or stale (8–2000 characters)');
    const requestId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.observation.request', 'TWQ', requestId), EstimationCapability.request,
      async (cap, scope) => ({ result: await this.estimation.request(cap, scope, { twinId, key, estimatorId, input: input as Record<string, unknown>, reasonClass: p['reasonClass'] as string, note }, null,
        principal.principalId, envelope.correlation_id), targetType: 'TWQ', targetId: requestId, targetVersion: '1', outboxEvent: null }));
    return { request: out.result, receipt: receipt(out) };
  }

  @Post('/requests/:requestId/cancel')
  async cancel(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('requestId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const requestId = id(raw, 'requestId', envelope.correlation_id);
    const reason = text(body.payload?.['reason'], 8, 2000) ?? bad(envelope.correlation_id, 'a cancellation says why (reason, 8–2000 characters)');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.observation.request', 'TWQ', requestId), EstimationCapability.request,
      async (cap, scope) => ({ result: await cap.cancel({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: envelope.correlation_id,
        requestId, reason }), targetType: 'TWQ', targetId: requestId, targetVersion: null, outboxEvent: null }));
    return { request: out.result, receipt: receipt(out) };
  }

  @Post('/ledger')
  async ledger(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = optId(p['twinId'], 'twinId', envelope.correlation_id);
    const limit = Number.isInteger(p['limit']) && (p['limit'] as number) >= 1 && (p['limit'] as number) <= 500 ? (p['limit'] as number) : 100;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.estimation.read', 'TWN', twinId), EstimationCapability.read,
      async (cap) => this.estimation.ledger(cap, twinId, limit));
    return { events: out.result, receipt: receipt(out) };
  }
}
