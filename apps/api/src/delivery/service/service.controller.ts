/**
 * B94 §SV (0114_b94_x_sv) — THE SERVICE PORTAL'S HTTP SURFACE (CAP-DL-09, CAP-DL-10; WS-20). Base `/v1/tenants/:t/domains/:d/service`.
 *
 *   cases/list · cases/:id/read · policies · problems/list · customer-success/read           service.read (audited)
 *   cases/:id/support-read                                                                    service.case.support_read (the engineer, under a grant; logged)
 *   cases/open                                                                                service.case.open (a customer role; NEVER licence-gated; routed)
 *   cases/:id/triage · /progress · /workaround/propose · /known-error/reuse                  the domain admin, or the engineer under a grant
 *   cases/:id/notes · /bundles/assemble                                                       a customer role (notes) / the admin or a steward (bundles), or the engineer under a grant
 *   cases/:id/workaround/execute · /reopen                                                    the customer's own role
 *   cases/:id/close                                                                           the customer's confirmation (human-gated)
 *   cases/:id/commitments/record · commitments/:mid/settle                                    the domain admin, or the engineer under a grant
 *   cases/:id/sla/drill                                                                       an sla_escalation drill (human-gated)
 *   problems/open · problems/:pid/link · problems/:pid/known-errors/publish · problems/:pid/close   the domain admin
 *   changes/propose · changes/:cid/decide (human-gated; never the proposer) · changes/:cid/record    the domain admin
 *   value-reviews/record · value-reviews/:rid/decide (human-gated; never the recorder)                 a domain admin or an executive
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseDelivery, type DeliveryNoun } from '../seams.js';
import { ServicePortalService } from './service.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal, cid: envelope.correlation_id };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
const optStr = (p: Row, k: string): string | null => (p[k] === undefined || p[k] === null ? null : str(p, k));
function id(v: unknown, what: string, noun: DeliveryNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseDelivery(noun, 'request', `${what} is an id`, cid);
  return v;
}
function int(v: unknown, what: string, noun: DeliveryNoun, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw refuseDelivery(noun, 'request', `${what} is an integer (the version the act read)`, cid);
  return v;
}
function obj(v: unknown, what: string, noun: DeliveryNoun, cid: string): Row {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw refuseDelivery(noun, 'request', `${what} is an object`, cid);
  return v as Row;
}
const day = (v: string, what: string, noun: DeliveryNoun, cid: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw refuseDelivery(noun, 'request', `${what} is a day (YYYY-MM-DD)`, cid);
  return v;
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/service')
export class ServicePortalController {
  constructor(private readonly svc: ServicePortalService) {}

  /* ───────────── reads ───────────── */
  @Post('/cases/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    return this.svc.listCases(envelope, principal, t, d, optStr(body.payload ?? {}, 'state'));
  }
  @Post('/cases/:caseId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string) {
    const { envelope, principal, cid } = ctx(req);
    return this.svc.caseDetail(envelope, principal, t, d, id(caseId, 'caseId', 'service case', cid));
  }
  @Post('/cases/:caseId/support-read')
  async supportRead(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string) {
    const { envelope, principal, cid } = ctx(req);
    return this.svc.supportRead(envelope, principal, t, d, id(caseId, 'caseId', 'support access', cid));
  }
  @Post('/policies')
  async policies(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.policies(envelope, principal, t, d);
  }
  @Post('/problems/list')
  async problems(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.problems(envelope, principal, t, d);
  }
  @Post('/customer-success/read')
  async success(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.success(envelope, principal, t, d);
  }

  /* ───────────── the case acts ───────────── */
  @Post('/cases/open')
  async open(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const objects = p['objects'] === undefined ? [] : p['objects'];
    if (!Array.isArray(objects)) throw refuseDelivery('service case', 'objects', 'objects is a list of {kind: source | run, id}', cid);
    return this.svc.open(envelope, principal, t, d, { title: str(p, 'title'), severity: str(p, 'severity'), capability: str(p, 'capability'), objects: objects as Row[], description: str(p, 'description') });
  }
  @Post('/cases/:caseId/triage')
  async triage(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.triage(envelope, principal, t, d, id(caseId, 'caseId', 'service case', cid), { expectedVersion: int(p['expectedVersion'], 'expectedVersion', 'service case', cid), severity: optStr(p, 'severity'), note: str(p, 'note') });
  }
  @Post('/cases/:caseId/notes')
  async note(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.note(envelope, principal, t, d, id(caseId, 'caseId', 'service case', cid), { kind: str(p, 'kind') || 'note', body: str(p, 'body') });
  }
  @Post('/cases/:caseId/progress')
  async progress(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.progress(envelope, principal, t, d, id(caseId, 'caseId', 'service case', cid), { expectedVersion: int(p['expectedVersion'], 'expectedVersion', 'service case', cid), to: str(p, 'to'), statement: str(p, 'statement') });
  }
  @Post('/cases/:caseId/workaround/propose')
  async proposeWorkaround(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.proposeWorkaround(envelope, principal, t, d, id(caseId, 'caseId', 'service case', cid), {
      expectedVersion: int(p['expectedVersion'], 'expectedVersion', 'service case', cid), steps: str(p, 'steps'), act: obj(p['act'], 'act', 'service case', cid), risk: optStr(p, 'risk') });
  }
  @Post('/cases/:caseId/workaround/execute')
  async executeWorkaround(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.executeWorkaround(envelope, principal, t, d, id(caseId, 'caseId', 'service case', cid), {
      expectedVersion: int(p['expectedVersion'], 'expectedVersion', 'service case', cid), policyDecisionId: id(p['policyDecisionId'], 'policyDecisionId (the receipt of the act you performed)', 'service case', cid), note: optStr(p, 'note') });
  }
  @Post('/cases/:caseId/known-error/reuse')
  async reuse(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.reuseKnownError(envelope, principal, t, d, id(caseId, 'caseId', 'known error', cid), {
      expectedVersion: int(p['expectedVersion'], 'expectedVersion', 'known error', cid), knownErrorId: id(p['knownErrorId'], 'knownErrorId', 'known error', cid) });
  }
  @Post('/cases/:caseId/bundles/assemble')
  async bundle(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string) {
    const { envelope, principal, cid } = ctx(req);
    return this.svc.bundle(envelope, principal, t, d, id(caseId, 'caseId', 'evidence bundle', cid));
  }
  @Post('/cases/:caseId/close')
  async close(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.close(envelope, principal, t, d, id(caseId, 'caseId', 'service case', cid), { expectedVersion: int(p['expectedVersion'], 'expectedVersion', 'service case', cid), outcome: str(p, 'outcome'), note: str(p, 'note') });
  }
  @Post('/cases/:caseId/reopen')
  async reopen(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.reopen(envelope, principal, t, d, id(caseId, 'caseId', 'service case', cid), { expectedVersion: int(p['expectedVersion'], 'expectedVersion', 'service case', cid), regression: str(p, 'regression') });
  }
  @Post('/cases/:caseId/commitments/record')
  async commit(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const due = str(p, 'dueAt');
    if (Number.isNaN(Date.parse(due))) throw refuseDelivery('service commitment', 'request', 'dueAt is an instant (ISO 8601)', cid);
    return this.svc.recordCommitment(envelope, principal, t, d, id(caseId, 'caseId', 'service commitment', cid), { kind: str(p, 'kind'), statement: str(p, 'statement'), dueAt: new Date(due).toISOString() });
  }
  @Post('/commitments/:commitmentId/settle')
  async settle(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('commitmentId') commitmentId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.settleCommitment(envelope, principal, t, d, id(commitmentId, 'commitmentId', 'service commitment', cid), { outcome: str(p, 'outcome'), note: str(p, 'note') });
  }
  @Post('/cases/:caseId/sla/drill')
  async drill(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.drill(envelope, principal, t, d, id(caseId, 'caseId', 'service case', cid), { objective: str(p, 'objective') || 'response', reason: str(p, 'reason') });
  }

  /* ───────────── problems, known errors, changes ───────────── */
  @Post('/problems/open')
  async openProblem(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const cases = p['cases'];
    if (!Array.isArray(cases) || !cases.every((x) => typeof x === 'string' && UUID.test(x))) throw refuseDelivery('service problem', 'request', 'cases is a list of case ids', cid);
    return this.svc.openProblem(envelope, principal, t, d, { title: str(p, 'title'), statement: str(p, 'statement'), cases: cases as string[] });
  }
  @Post('/problems/:problemId/link')
  async link(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('problemId') problemId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.linkProblem(envelope, principal, t, d, id(problemId, 'problemId', 'service problem', cid), { caseId: id(p['caseId'], 'caseId', 'service problem', cid), reason: str(p, 'reason') });
  }
  @Post('/problems/:problemId/known-errors/publish')
  async publish(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('problemId') problemId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.publishKnownError(envelope, principal, t, d, id(problemId, 'problemId', 'known error', cid), {
      title: str(p, 'title'), symptom: str(p, 'symptom'), workaround: str(p, 'workaround'), act: p['act'] === undefined || p['act'] === null ? {} : obj(p['act'], 'act', 'known error', cid) });
  }
  @Post('/problems/:problemId/close')
  async closeProblem(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('problemId') problemId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.closeProblem(envelope, principal, t, d, id(problemId, 'problemId', 'service problem', cid), { outcome: str(p, 'outcome'), rootCause: optStr(p, 'rootCause'), reason: str(p, 'reason') });
  }
  @Post('/changes/propose')
  async proposeChange(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.proposeChange(envelope, principal, t, d, { problemId: id(p['problemId'], 'problemId', 'service change', cid), title: str(p, 'title'), description: str(p, 'description'), effect: str(p, 'expectedEffect') });
  }
  @Post('/changes/:changeId/decide')
  async decideChange(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('changeId') changeId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.decideChange(envelope, principal, t, d, id(changeId, 'changeId', 'service change', cid), {
      expectedVersion: p['expectedVersion'] === undefined ? null : int(p['expectedVersion'], 'expectedVersion', 'service change', cid), decision: str(p, 'decision'), reason: str(p, 'reason') });
  }
  @Post('/changes/:changeId/record')
  async recordChange(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('changeId') changeId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.recordChange(envelope, principal, t, d, id(changeId, 'changeId', 'service change', cid), { outcome: str(p, 'outcome'), evidence: str(p, 'evidence') });
  }

  /* ───────────── the value review ───────────── */
  @Post('/value-reviews/record')
  async recordReview(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const digest = str(p, 'inputsDigest');
    if (!/^[0-9a-f]{64}$/.test(digest)) throw refuseDelivery('value review', 'request', 'inputsDigest names the customer-success view you read (64 hex)', cid);
    return this.svc.recordValueReview(envelope, principal, t, d, { from: day(str(p, 'periodFrom'), 'periodFrom', 'value review', cid), to: day(str(p, 'periodTo'), 'periodTo', 'value review', cid),
                                                                    outcomes: str(p, 'outcomes'), inputsDigest: digest });
  }
  @Post('/value-reviews/:reviewId/decide')
  async decideReview(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('reviewId') reviewId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const digest = str(p, 'digest');
    if (!/^[0-9a-f]{64}$/.test(digest)) throw refuseDelivery('value review', 'request', 'the decision names the review digest it read (64 hex)', cid);
    return this.svc.decideValueReview(envelope, principal, t, d, id(reviewId, 'reviewId', 'value review', cid), { digest, decision: str(p, 'decision'), note: str(p, 'note') });
  }
}
