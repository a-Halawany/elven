/**
 * B94 §IM+§AD (0114 §IM) — THE HTTP SURFACE OF THE IMPLEMENTATION PROGRAMME, READINESS, GO-LIVE, ENABLEMENT AND ADOPTION (WS-20; CAP-DL-07/08).
 *
 * TENANT  `/v1/tenants/:t/implementation` (a TENANT session: the implementation lead, the sponsor, the authority, the tenant admin, the auditor)
 *   programmes/list · programmes/:id/read                  implementation.read (audited)
 *   programmes/open                                        implementation.programme.open — the lead or the tenant admin
 *   programmes/:id/revise                                  implementation.programme.revise
 *   programmes/:id/{start|hold|resume|withdraw}            implementation.programme.<act>
 *   programmes/:id/items/record                            implementation.item.record — the lead (milestones, dependencies, stakeholders, processes,
 *                                                          journeys, risks, outcomes, feedback, role requirements, value measures)
 *   programmes/:id/changes/propose · changes/:cid/decide   implementation.change.propose (the lead) · implementation.change.approve (HUMAN-GATED:
 *                                                          the customer sponsor or the onboarding authority, on the digest)
 * DOMAIN  `/v1/tenants/:t/domains/:d/implementation` (d = the programme's TARGET domain)
 *   programmes/list · programmes/:id/read                  implementation.read
 *   my-records                                             implementation.self.read — the caller's own training and competence records
 *   programmes/:id/readiness/declare                       implementation.readiness.declare — the lead or the onboarding authority
 *   readiness/:iid/retire · /confirm · /accept-residual    implementation.readiness.retire | .confirm | .accept_residual (HUMAN-GATED)
 *   programmes/:id/gate/evaluate                           implementation.gate.evaluate — records the live gate, raises / closes its items
 *   programmes/:id/golive/decide                           implementation.golive.approve (HUMAN-GATED: sponsor or authority; approve | withhold)
 *   training/paths/declare · training/paths/:pid/attest    implementation.training.path.declare | .attest (HUMAN-GATED)
 *   training/records/record · competence/record            implementation.training.record | implementation.competence.record (HUMAN-GATED)
 *   programmes/:id/cohorts/declare                         implementation.cohort.declare — role × wave, never a person
 *   shadow/record · shadow/:fid/resolve · programmes/:id/shadow/review   implementation.shadow.record | .resolve | .review
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseDelivery, type DeliveryNoun } from '../seams.js';
import { ImplementationService } from './implementation.service.js';
import { DIGEST, UUID, parseDecision, parseGolive, parseItem, parseOpen, parsePath, parsePersonRecord, parseReadiness, parseRevise, parseTransition, type Parsed } from './implementation-logic.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

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
function int(v: unknown, what: string, noun: DeliveryNoun, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw refuseDelivery(noun, 'request', `${what} is an integer`, cid);
  return v;
}
function digest(p: Row, k: string, noun: DeliveryNoun, cid: string): string {
  const v = str(p, k);
  if (!DIGEST.test(v)) throw refuseDelivery(noun, 'digest', `${k} names the exact digest read (64 hex)`, cid);
  return v;
}
function text(p: Row, k: string, min: number, noun: DeliveryNoun, cid: string): string {
  const v = str(p, k);
  if (v.length < min) throw refuseDelivery(noun, k, `a ${k} of at least ${min} characters is stated`, cid);
  return v;
}
function take<T>(r: Parsed<T>, cid: string): T {
  if (!r.ok) throw refuseDelivery(r.noun, r.cls, r.message, cid, r.status ?? 422);
  return r.value;
}
const iso = (v: unknown, what: string, noun: DeliveryNoun, cid: string): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw refuseDelivery(noun, 'request', `${what} is an instant (ISO 8601)`, cid);
  return new Date(v).toISOString();
};

@Controller('/v1/tenants/:tenantId/implementation')
export class ImplementationTenantController {
  constructor(private readonly svc: ImplementationService) {}

  @Post('/programmes/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') t: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.list(envelope, principal, t, null);
  }
  @Post('/programmes/:programmeId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.detail(envelope, principal, t, null, id(programmeId, 'programmeId', 'implementation programme', envelope.correlation_id));
  }
  @Post('/programmes/open')
  async open(@Req() req: EyeRequest, @Param('tenantId') t: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    return this.svc.open(envelope, principal, t, take(parseOpen(body.payload ?? {}), envelope.correlation_id));
  }
  @Post('/programmes/:programmeId/revise')
  async revise(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.revise(envelope, principal, t, id(programmeId, 'programmeId', 'implementation programme', cid), take(parseRevise(body.payload ?? {}), cid));
  }
  @Post('/programmes/:programmeId/items/record')
  async recordItem(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.recordItem(envelope, principal, t, id(programmeId, 'programmeId', 'implementation programme', cid), take(parseItem(body.payload ?? {}), cid));
  }
  @Post('/programmes/:programmeId/changes/propose')
  async proposeChange(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id; const p = body.payload ?? {};
    const impact = p['impact'] === undefined ? {} : p['impact'];
    if (impact === null || typeof impact !== 'object' || Array.isArray(impact)) throw refuseDelivery('implementation change', 'impact', 'the impact is an object', cid);
    return this.svc.proposeChange(envelope, principal, t, id(programmeId, 'programmeId', 'implementation change', cid),
      { title: text(p, 'title', 4, 'implementation change', cid), description: text(p, 'description', 8, 'implementation change', cid), impact: impact as Row });
  }
  @Post('/changes/:changeId/decide')
  async decideChange(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('changeId') changeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.decideChange(envelope, principal, t, id(changeId, 'changeId', 'implementation change', cid), take(parseDecision('implementation change', body.payload ?? {}, ['approve', 'reject']), cid));
  }
  /* the transitions last: `:act` must not shadow the routes above */
  @Post('/programmes/:programmeId/:act')
  async transition(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('programmeId') programmeId: string, @Param('act') act: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.transition(envelope, principal, t, id(programmeId, 'programmeId', 'implementation programme', cid), take(parseTransition(act, body.payload ?? {}), cid));
  }
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/implementation')
export class ImplementationDomainController {
  constructor(private readonly svc: ImplementationService) {}

  @Post('/programmes/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.list(envelope, principal, t, d);
  }
  @Post('/programmes/:programmeId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('programmeId') programmeId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.detail(envelope, principal, t, d, id(programmeId, 'programmeId', 'implementation programme', envelope.correlation_id));
  }
  @Post('/my-records')
  async myRecords(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.myRecords(envelope, principal, t, d);
  }

  /* ───────────── readiness and the gate ───────────── */
  @Post('/programmes/:programmeId/readiness/declare')
  async declareReadiness(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.declareReadiness(envelope, principal, t, d, id(programmeId, 'programmeId', 'readiness item', cid), take(parseReadiness(body.payload ?? {}), cid));
  }
  @Post('/readiness/:itemId/retire')
  async retireReadiness(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('itemId') itemId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id; const p = body.payload ?? {};
    return this.svc.retireReadiness(envelope, principal, t, d, id(itemId, 'itemId', 'readiness item', cid),
      { expectedVersion: int(p['expectedVersion'], 'expectedVersion', 'readiness item', cid), reason: text(p, 'reason', 12, 'readiness item', cid) });
  }
  @Post('/readiness/:itemId/confirm')
  async confirmReadiness(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('itemId') itemId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id; const p = body.payload ?? {};
    return this.svc.confirmReadiness(envelope, principal, t, d, id(itemId, 'itemId', 'readiness item', cid),
      { version: int(p['version'], 'version', 'readiness item', cid), digest: digest(p, 'digest', 'readiness item', cid), statement: text(p, 'statement', 8, 'readiness item', cid) });
  }
  @Post('/readiness/:itemId/accept-residual')
  async acceptResidual(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('itemId') itemId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id; const p = body.payload ?? {};
    return this.svc.acceptResidual(envelope, principal, t, d, id(itemId, 'itemId', 'readiness item', cid),
      { version: int(p['version'], 'version', 'readiness item', cid), digest: digest(p, 'digest', 'readiness item', cid), reason: text(p, 'reason', 12, 'readiness item', cid) });
  }
  @Post('/programmes/:programmeId/gate/evaluate')
  async evaluate(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('programmeId') programmeId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.evaluateGate(envelope, principal, t, d, id(programmeId, 'programmeId', 'go-live gate', envelope.correlation_id));
  }
  @Post('/programmes/:programmeId/golive/decide')
  async golive(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.golive(envelope, principal, t, d, id(programmeId, 'programmeId', 'go-live gate', cid), take(parseGolive(body.payload ?? {}), cid));
  }

  /* ───────────── enablement ───────────── */
  @Post('/training/paths/declare')
  async declarePath(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    return this.svc.declarePath(envelope, principal, t, d, take(parsePath(body.payload ?? {}), envelope.correlation_id));
  }
  @Post('/training/paths/:pathId/attest')
  async attestPath(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('pathId') pathId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id; const p = body.payload ?? {};
    const verdict = str(p, 'verdict');
    if (verdict !== 'accessible' && verdict !== 'inaccessible') throw refuseDelivery('training path', 'verdict', 'accessible or inaccessible', cid);
    return this.svc.attestPath(envelope, principal, t, d, id(pathId, 'pathId', 'training path', cid),
      { version: int(p['version'], 'version', 'training path', cid), digest: digest(p, 'digest', 'training path', cid), verdict, statement: text(p, 'statement', 8, 'training path', cid) });
  }
  @Post('/training/records/record')
  async recordTraining(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id; const p = body.payload ?? {};
    const r = take(parsePersonRecord('training record', p), cid);
    return this.svc.recordTraining(envelope, principal, t, d, { pathId: id(p['pathId'], 'pathId', 'training record', cid), version: int(p['version'], 'version', 'training record', cid), ...r });
  }
  @Post('/competence/record')
  async recordCompetence(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id; const p = body.payload ?? {};
    const r = take(parsePersonRecord('competence record', p), cid);
    const key = str(p, 'competenceKey'); const role = str(p, 'role');
    if (!/^[a-z][a-z0-9_.-]{2,62}$/.test(key)) throw refuseDelivery('competence record', 'key', 'competenceKey is lower-case (3–63 characters)', cid);
    if (!/^[a-z][a-z_]{2,62}$/.test(role)) throw refuseDelivery('competence record', 'request', 'role is a role code', cid);
    return this.svc.recordCompetence(envelope, principal, t, d, { key, role, ...r });
  }

  /* ───────────── adoption cohorts and shadow workflows ───────────── */
  @Post('/programmes/:programmeId/cohorts/declare')
  async declareCohort(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id; const p = body.payload ?? {};
    const dims = p['dimensions'];
    if (dims === null || typeof dims !== 'object' || Array.isArray(dims)) throw refuseDelivery('adoption cohort', 'dimensions', 'dimensions is {role, wave}', cid);
    return this.svc.declareCohort(envelope, principal, t, d, id(programmeId, 'programmeId', 'adoption cohort', cid),
      { dimensions: dims as Row, from: iso(p['boundFrom'], 'boundFrom', 'adoption cohort', cid), to: iso(p['boundTo'], 'boundTo', 'adoption cohort', cid) });
  }
  @Post('/shadow/record')
  async recordShadow(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id; const p = body.payload ?? {};
    const attempt = p['attempt'];
    if (attempt === null || typeof attempt !== 'object' || Array.isArray(attempt)) throw refuseDelivery('shadow finding', 'attempt', 'attempt is {refusal, at?, filename?} — the refused legacy upload, in the server\'s words', cid);
    return this.svc.recordShadow(envelope, principal, t, d, { sourceId: id(p['sourceId'], 'sourceId', 'shadow finding', cid), attempt: attempt as Row });
  }
  @Post('/shadow/:findingId/resolve')
  async resolveShadow(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('findingId') findingId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.resolveShadow(envelope, principal, t, d, id(findingId, 'findingId', 'shadow finding', cid), text(body.payload ?? {}, 'remediation', 8, 'shadow finding', cid));
  }
  @Post('/programmes/:programmeId/shadow/review')
  async reviewShadow(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('programmeId') programmeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.reviewShadow(envelope, principal, t, d, id(programmeId, 'programmeId', 'shadow finding', cid), text(body.payload ?? {}, 'statement', 12, 'shadow finding', cid));
  }
}
