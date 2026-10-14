/**
 * B94 §SA (0114_b94_x_sa) — THE HTTP SURFACE of responsibility, ownership, support access and the customer control center (CAP-TR-12).
 * Base `/v1/tenants/:t/domains/:d/support`.
 *
 *   control-center/read · owners/read                         service.read (audited) — the matrix and its owners (gaps visible), grants,
 *                                                              the access log, drills, exercises, admission records, residency, links
 *   matrix/propose                                             service.matrix.propose — the implementation lead or the domain admin
 *   matrix/:matrixId/decide                                    service.matrix.decide (human-gated) — the onboarding authority, on the digest, SIGNED
 *   reconcile                                                  service.responsibility.reconcile — read first, then recorded on change
 *   grants/request                                             service.grant.request — the support engineer
 *   grants/mine                                                support.grant.read — the engineer's OWN grants
 *   grants/:grantId/preview                                    service.read — the approval's preview and the caller's eligibility
 *   grants/:grantId/decide                                     service.grant.decide (human-gated) — the accountable owner of support.access; HELD (409) on an owner gap
 *   grants/:grantId/revoke                                     service.grant.revoke (human-gated) — immediate; the sessions revoked
 *   grants/:grantId/withdraw                                   service.grant.withdraw — the engineer
 *   diagnose/:what (source | runs | health | schedule)        support.diagnose.<what> — live grant FIRST, every attempt logged
 *   drills/run                                                 service.drill.run (human-gated) — a customer-control drill
 *   exercises/record                                           service.exercise.record (human-gated) — a joint operating exercise
 *   admission/propose · admission/:admissionId/decide          service.admission.propose / .decide (human-gated; SIGNED)
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseDelivery, type DeliveryNoun } from '../seams.js';
import { SupportService } from './support.service.js';
import { DIAGNOSTICS, GRANT_ACTIONS, PROFILES, grantMinutes, matrixRows } from './support-logic.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
function id(v: unknown, what: string, noun: DeliveryNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseDelivery(noun, 'request', `${what} is an id`, cid);
  return v;
}
function ids(v: unknown, what: string, noun: DeliveryNoun, cid: string): string[] {
  if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === 'string' && UUID.test(x))) throw refuseDelivery(noun, 'request', `${what} is a non-empty list of ids`, cid);
  return [...new Set(v as string[])];
}
function int(v: unknown, what: string, noun: DeliveryNoun, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw refuseDelivery(noun, 'request', `${what} is a whole number`, cid);
  return v;
}
function reason(p: Row, noun: DeliveryNoun, cid: string, k = 'reason'): string {
  const r = str(p, k);
  if (r.length < 8) throw refuseDelivery(noun, k, `a ${k} of at least 8 characters is stated`, cid);
  return r;
}
function digest(p: Row, noun: DeliveryNoun, cid: string): string {
  const x = str(p, 'digest');
  if (!HEX64.test(x)) throw refuseDelivery(noun, 'digest', 'the decision names the exact digest it was shown (64 hex)', cid);
  return x;
}
function profile(p: Row, noun: DeliveryNoun, cid: string): string {
  const x = str(p, 'profile') || 'local-dev';
  if (!(PROFILES as readonly string[]).includes(x)) throw refuseDelivery(noun, 'profile', `the profile is one of ${PROFILES.join(', ')}`, cid);
  return x;
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/support')
export class SupportController {
  constructor(private readonly svc: SupportService) {}

  /* ───────────── the control center's reads ───────────── */
  @Post('/control-center/read')
  async controlCenter(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    return this.svc.controlCenter(envelope, principal, t, d, profile(body.payload ?? {}, 'responsibility matrix', envelope.correlation_id));
  }
  @Post('/owners/read')
  async owners(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    return this.svc.owners(envelope, principal, t, d, profile(body.payload ?? {}, 'accountable owner', envelope.correlation_id));
  }

  /* ───────────── the matrix ───────────── */
  @Post('/matrix/propose')
  async proposeMatrix(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const rows = matrixRows(p['rows']);
    if (!rows.ok) throw refuseDelivery('responsibility matrix', 'rows', rows.reason, cid);
    return this.svc.proposeMatrix(envelope, principal, t, d, {
      matrixId: p['matrixId'] === undefined || p['matrixId'] === null ? null : id(p['matrixId'], 'matrixId', 'responsibility matrix', cid),
      programmeId: p['programmeId'] === undefined || p['programmeId'] === null ? null : id(p['programmeId'], 'programmeId', 'responsibility matrix', cid),
      profile: profile(p, 'responsibility matrix', cid), rows: rows.rows, expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'responsibility matrix', cid),
    });
  }
  @Post('/matrix/:matrixId/decide')
  async decideMatrix(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('matrixId') matrixId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'approve' && decision !== 'reject') throw refuseDelivery('responsibility matrix', 'decision', 'the decision is approve or reject', cid);
    return this.svc.decideMatrix(envelope, principal, t, d, id(matrixId, 'matrixId', 'responsibility matrix', cid),
      { version: int(p['version'], 'version', 'responsibility matrix', cid), decision, digest: digest(p, 'responsibility matrix', cid), reason: reason(p, 'responsibility matrix', cid) });
  }
  @Post('/reconcile')
  async reconcile(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    return this.svc.reconcile(envelope, principal, t, d, profile(body.payload ?? {}, 'accountable owner', envelope.correlation_id));
  }

  /* ───────────── support access ───────────── */
  @Post('/grants/request')
  async requestGrant(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const m = grantMinutes(p['durationMinutes']);
    if (!m.ok) throw refuseDelivery('support grant', 'duration', m.reason, cid);
    const actions = p['actions'];
    if (!Array.isArray(actions) || actions.length === 0 || !actions.every((a) => typeof a === 'string' && (GRANT_ACTIONS as readonly string[]).includes(a))) {
      throw refuseDelivery('support grant', 'actions', `the action scope is a non-empty subset of ${GRANT_ACTIONS.join(', ')}`, cid);
    }
    const purpose = str(p, 'purpose');
    if (purpose.length < 12) throw refuseDelivery('support grant', 'purpose', 'a grant states its purpose (12+ characters)', cid);
    return this.svc.requestGrant(envelope, principal, t, d, { caseId: id(p['caseId'], 'caseId', 'support grant', cid), purpose, sources: ids(p['sources'], 'sources', 'support grant', cid),
      actions: [...new Set(actions as string[])], minutes: m.minutes });
  }
  @Post('/grants/mine')
  async mine(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.myGrants(envelope, principal, t, d);
  }
  @Post('/grants/:grantId/preview')
  async preview(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('grantId') grantId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.preview(envelope, principal, t, d, id(grantId, 'grantId', 'support grant', envelope.correlation_id));
  }
  @Post('/grants/:grantId/decide')
  async decideGrant(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('grantId') grantId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'approve' && decision !== 'deny') throw refuseDelivery('support grant', 'decision', 'the decision is approve or deny', cid);
    return this.svc.decideGrant(envelope, principal, t, d, id(grantId, 'grantId', 'support grant', cid), { decision, digest: digest(p, 'support grant', cid), reason: reason(p, 'support grant', cid) });
  }
  @Post('/grants/:grantId/revoke')
  async revokeGrant(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('grantId') grantId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.revokeGrant(envelope, principal, t, d, id(grantId, 'grantId', 'support grant', cid), reason(body.payload ?? {}, 'support grant', cid));
  }
  @Post('/grants/:grantId/withdraw')
  async withdrawGrant(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('grantId') grantId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.withdrawGrant(envelope, principal, t, d, id(grantId, 'grantId', 'support grant', cid), reason(body.payload ?? {}, 'support grant', cid));
  }
  @Post('/diagnose/:what')
  async diagnose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('what') what: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    if (!(DIAGNOSTICS as readonly string[]).includes(what)) throw refuseDelivery('support access', 'diagnostic', `the diagnostic is one of ${DIAGNOSTICS.join(', ')}`, cid);
    return this.svc.diagnose(envelope, principal, t, d, what, { caseId: p['caseId'] === undefined || p['caseId'] === null ? null : id(p['caseId'], 'caseId', 'support access', cid),
      sourceId: id(p['sourceId'], 'sourceId', 'support access', cid) });
  }

  /* ───────────── drills, exercises, admission ───────────── */
  @Post('/drills/run')
  async runDrill(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'kind');
    if (kind !== 'revoke_live_grant' && kind !== 'expired_grant_refused') throw refuseDelivery('control drill', 'kind', 'the drill is revoke_live_grant or expired_grant_refused', cid);
    return this.svc.runDrill(envelope, principal, t, d, { kind, grantId: id(p['grantId'], 'grantId', 'control drill', cid), reason: reason(p, 'control drill', cid) });
  }
  @Post('/exercises/record')
  async recordExercise(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const heldOn = str(p, 'heldOn');
    if (!DAY.test(heldOn)) throw refuseDelivery('admission record', 'exercise', 'heldOn is a day (YYYY-MM-DD)', cid);
    return this.svc.recordExercise(envelope, principal, t, d, { title: str(p, 'title'), scenario: str(p, 'scenario'), heldOn,
      customer: ids(p['customerParticipants'], 'customerParticipants', 'admission record', cid), vendor: ids(p['vendorParticipants'], 'vendorParticipants', 'admission record', cid),
      outcome: str(p, 'outcome'), findings: str(p, 'findings') || null, evidence: Array.isArray(p['evidenceRefs']) ? p['evidenceRefs'] as unknown[] : [] });
  }
  @Post('/admission/propose')
  async proposeAdmission(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const from = str(p, 'periodFrom'); const to = str(p, 'periodTo'); const baseline = str(p, 'baselineDigest');
    if (!DAY.test(from) || !DAY.test(to)) throw refuseDelivery('admission record', 'period', 'periodFrom and periodTo are days (YYYY-MM-DD)', cid);
    if (!HEX64.test(baseline)) throw refuseDelivery('admission record', 'baseline', 'baselineDigest is the configuration baseline\'s digest (64 hex)', cid);
    return this.svc.proposeAdmission(envelope, principal, t, d, {
      admissionId: p['admissionId'] === undefined || p['admissionId'] === null ? null : id(p['admissionId'], 'admissionId', 'admission record', cid),
      profile: profile(p, 'admission record', cid), from, to, baselineDigest: baseline, exercises: ids(p['exercises'], 'exercises', 'admission record', cid),
      expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'admission record', cid) });
  }
  @Post('/admission/:admissionId/decide')
  async decideAdmission(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('admissionId') admissionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'sign' && decision !== 'reject') throw refuseDelivery('admission record', 'decision', 'the decision is sign or reject', cid);
    return this.svc.decideAdmission(envelope, principal, t, d, id(admissionId, 'admissionId', 'admission record', cid),
      { version: int(p['version'], 'version', 'admission record', cid), decision, digest: digest(p, 'admission record', cid), reason: reason(p, 'admission record', cid) });
  }
}
