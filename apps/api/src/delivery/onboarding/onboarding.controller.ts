/**
 * B94 §ON (0114_b94_x_on) — THE HTTP SURFACE OF THE ONBOARDING PROGRAMME (CAP-DL-04 / CAP-PD-04: the customer onboarding workspace) AND THE
 * CONFIGURATION BASELINE MANAGER (CAP-DL-05 / CAP-PD-05).
 *
 * TENANT routes, base `/v1/tenants/:t/onboarding` (a TENANT envelope):
 *   programmes/list · programmes/:id/read · programmes/:id/history        onboarding.read (audited)
 *   programmes/open                                                        onboarding.programme.open — the implementation lead or the tenant admin
 *   programmes/:id/revise · /hold · /resume                                onboarding.programme.revise / .hold / .resume
 *   programmes/:id/withdraw                                                onboarding.programme.withdraw (human-gated) — the sponsor or the tenant admin
 *   programmes/:id/intent                                                  onboarding.intent.record (human-gated) — the CUSTOMER SPONSOR only
 *   programmes/:id/steps/plan · steps/:sid/record · /hold · /revert        onboarding.step.plan / .record / .hold / .revert
 *   programmes/:id/domain-draft                                            tenancy.domain.draft — the tenant administrator (the draft domain)
 * DOMAIN routes, base `/v1/tenants/:t/domains/:d/onboarding/baselines` (a DOMAIN envelope):
 *   read                                                                   onboarding.read — versions, signatures, observed, drift, rollback plan
 *   capture · promote                                                      onboarding.baseline.capture / .promote — the implementation lead
 *   :bid/versions/:v/propose                                               onboarding.baseline.propose — the implementation lead, at the digest
 *   :bid/versions/:v/decide                                                onboarding.baseline.decide (human-gated, signed) — THE ONBOARDING AUTHORITY
 *   drift/record                                                           onboarding.baseline.drift — read first, then recorded on change
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseDelivery, type DeliveryNoun } from '../seams.js';
import { OnboardingService } from './onboarding.service.js';
import { PROFILES, STEP_KEYS } from './rollback.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{64}$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
const optStr = (p: Row, k: string): string | null => (p[k] === undefined || p[k] === null ? null : str(p, k));
function id(v: unknown, what: string, noun: DeliveryNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseDelivery(noun, 'request', `${what} is an id`, cid);
  return v;
}
function int(v: unknown, what: string, noun: DeliveryNoun, cid: string): number {
  const n = typeof v === 'string' && /^[0-9]+$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw refuseDelivery(noun, 'request', `${what} is a non-negative integer`, cid);
  return n;
}
function reason(p: Row, noun: DeliveryNoun, cid: string): string {
  const r = str(p, 'reason');
  if (r.length < 8) throw refuseDelivery(noun, 'reason', 'a reason of at least 8 characters is stated', cid);
  return r;
}
function obj(v: unknown, what: string, noun: DeliveryNoun, cid: string): Row | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw refuseDelivery(noun, 'request', `${what} is an object`, cid);
  return v as Row;
}
function strings(v: unknown, what: string, noun: DeliveryNoun, cid: string, min: number): string[] {
  if (v === undefined && min === 0) return [];
  if (!Array.isArray(v) || v.length < min || !v.every((x) => typeof x === 'string')) throw refuseDelivery(noun, what, `${what} is a list of statements${min > 0 ? ` (at least ${min})` : ''}`, cid);
  return (v as string[]).map((x) => x.trim());
}

@Controller('/v1/tenants/:tenantId/onboarding')
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  @Post('/programmes/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') t: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.list(envelope, principal, t);
  }
  @Post('/programmes/open')
  async open(@Req() req: EyeRequest, @Param('tenantId') t: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const profile = optStr(p, 'deploymentProfile');
    if (profile !== null && !(PROFILES as readonly string[]).includes(profile)) throw refuseDelivery('onboarding programme', 'profile', `the deployment profile is one of ${PROFILES.join(', ')}`, cid);
    return this.svc.open(envelope, principal, t, { key: str(p, 'key'), title: str(p, 'title'), profile, plan: obj(p['plan'], 'plan', 'onboarding programme', cid),
      owner: p['ownerPrincipalId'] === undefined || p['ownerPrincipalId'] === null ? null : id(p['ownerPrincipalId'], 'ownerPrincipalId', 'onboarding programme', cid) });
  }
  @Post('/programmes/:programmeId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.detail(envelope, principal, t, id(programmeId, 'programmeId', 'onboarding programme', envelope.correlation_id));
  }
  @Post('/programmes/:programmeId/history')
  async history(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.history(envelope, principal, t, id(programmeId, 'programmeId', 'onboarding programme', envelope.correlation_id));
  }
  @Post('/programmes/:programmeId/revise')
  async revise(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'onboarding programme';
    return this.svc.revise(envelope, principal, t, id(programmeId, 'programmeId', N, cid), { expectedVersion: int(p['expectedVersion'], 'expectedVersion', N, cid),
      title: optStr(p, 'title'), plan: obj(p['plan'], 'plan', N, cid), profile: optStr(p, 'deploymentProfile'), reason: reason(p, N, cid) });
  }
  @Post('/programmes/:programmeId/hold')
  async hold(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) { return this.transition(req, t, programmeId, 'hold', body); }
  @Post('/programmes/:programmeId/resume')
  async resume(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) { return this.transition(req, t, programmeId, 'resume', body); }
  @Post('/programmes/:programmeId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) { return this.transition(req, t, programmeId, 'withdraw', body); }
  private async transition(req: EyeRequest, t: string, programmeId: string, act: 'hold' | 'resume' | 'withdraw', body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'onboarding programme';
    return this.svc.transition(envelope, principal, t, id(programmeId, 'programmeId', N, cid), act, { expectedVersion: int(p['expectedVersion'], 'expectedVersion', N, cid), reason: reason(p, N, cid) });
  }
  @Post('/programmes/:programmeId/intent')
  async intent(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'sponsor intent';
    return this.svc.recordIntent(envelope, principal, t, id(programmeId, 'programmeId', N, cid), {
      expectedVersion: p['expectedVersion'] === undefined ? 0 : int(p['expectedVersion'], 'expectedVersion', N, cid),
      objectives: strings(p['objectives'], 'objectives', N, cid, 1), scopeStatement: str(p, 'scopeStatement'), successMeasures: strings(p['successMeasures'], 'success_measures', N, cid, 1),
      constraints: strings(p['constraints'], 'constraints', N, cid, 0), targetDomainName: str(p, 'targetDomainName'), deploymentProfile: str(p, 'deploymentProfile') || 'local-dev',
    });
  }
  @Post('/programmes/:programmeId/steps/plan')
  async planStep(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'onboarding step';
    const stepKey = str(p, 'stepKey');
    if (!(STEP_KEYS as readonly string[]).includes(stepKey)) throw refuseDelivery(N, 'step_key', `a step is one of ${STEP_KEYS.join(', ')}`, cid);
    return this.svc.planStep(envelope, principal, t, id(programmeId, 'programmeId', N, cid), { stepKey, compensation: obj(p['compensation'], 'compensation', N, cid) });
  }
  @Post('/steps/:stepId/record')
  async recordStep(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('stepId') stepId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'onboarding step';
    const state = str(p, 'state');
    if (state !== 'in_progress' && state !== 'done') throw refuseDelivery(N, 'step_state', 'a step is recorded in_progress or done', cid);
    const ev = p['evidence'];
    if (ev !== undefined && ev !== null && !Array.isArray(ev)) throw refuseDelivery(N, 'evidence', 'evidence is a list of references {kind, ref|id, note?}', cid);
    return this.svc.recordStep(envelope, principal, t, id(stepId, 'stepId', N, cid), { expectedVersion: int(p['expectedVersion'], 'expectedVersion', N, cid), state,
      realizedBy: obj(p['realizedBy'], 'realizedBy', N, cid), evidence: (ev ?? null) as Row[] | null, compensation: obj(p['compensation'], 'compensation', N, cid) });
  }
  @Post('/steps/:stepId/hold')
  async holdStep(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('stepId') stepId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'onboarding step';
    return this.svc.holdStep(envelope, principal, t, id(stepId, 'stepId', N, cid), { expectedVersion: int(p['expectedVersion'], 'expectedVersion', N, cid), reason: reason(p, N, cid) });
  }
  @Post('/steps/:stepId/revert')
  async revertStep(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('stepId') stepId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'onboarding step';
    const compensating = obj(p['compensatingAct'], 'compensatingAct', N, cid);
    if (compensating === null) throw refuseDelivery(N, 'compensation', 'a revert names the compensating act {kind, id, version?, action} it records', cid);
    return this.svc.revertStep(envelope, principal, t, id(stepId, 'stepId', N, cid), { expectedVersion: int(p['expectedVersion'], 'expectedVersion', N, cid), compensating, reason: reason(p, N, cid) });
  }
  @Post('/programmes/:programmeId/domain-draft')
  async draftDomain(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'domain draft';
    const name = str(p, 'name');
    if (name.length < 2) throw refuseDelivery(N, 'name', 'a domain name is 2–200 characters', cid);
    return this.svc.draftDomain(envelope, principal, t, id(programmeId, 'programmeId', N, cid), name);
  }
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/onboarding/baselines')
export class BaselinesController {
  constructor(private readonly svc: OnboardingService) {}
  @Post('/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.baselines(envelope, principal, t, d);
  }
  @Post('/capture')
  async capture(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const programmeId = p['programmeId'] === undefined || p['programmeId'] === null ? null : id(p['programmeId'], 'programmeId', 'config baseline', envelope.correlation_id);
    return this.svc.capture(envelope, principal, t, d, programmeId);
  }
  @Post('/promote')
  async promote(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.promote(envelope, principal, t, d);
  }
  @Post('/:baselineId/versions/:version/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('baselineId') baselineId: string, @Param('version') version: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'config baseline';
    const digest = str(p, 'digest');
    if (!HEX.test(digest)) throw refuseDelivery(N, 'digest', 'the proposal names the version digest it read (64 hex)', cid);
    return this.svc.propose(envelope, principal, t, d, id(baselineId, 'baselineId', N, cid), int(version, 'version', N, cid), digest);
  }
  @Post('/:baselineId/versions/:version/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('baselineId') baselineId: string, @Param('version') version: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const N: DeliveryNoun = 'config baseline';
    const decision = str(p, 'decision');
    if (decision !== 'approve' && decision !== 'reject') throw refuseDelivery(N, 'decision', 'the decision is approve or reject', cid);
    const digest = str(p, 'digest');
    if (!HEX.test(digest)) throw refuseDelivery(N, 'digest', 'the decision names the version digest it read (64 hex)', cid);
    return this.svc.decide(envelope, principal, t, d, id(baselineId, 'baselineId', N, cid), { version: int(version, 'version', N, cid), decision, digest, reason: reason(p, N, cid) });
  }
  @Post('/drift/record')
  async drift(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.recordDrift(envelope, principal, t, d);
  }
}
