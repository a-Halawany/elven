/**
 * B107 §AR (0115_b107_x_ar) — THE HTTP SURFACE of scope-specific acceptance. Base `/v1/tenants/:t/domains/:d/governance/acceptance` (DOMAIN:
 * an acceptance is scoped to its tenant and domain) and `/v1/platform/governance/acceptance` (the vendor's enforcement register).
 *
 *   read · scope/read · records/:id/preview · records/:id/history     governance.acceptance.read (audited) — the workspace, the accepted
 *                                                                     scope, OBJ-40's preview (eligibility, digest, consequence), the replay
 *   evidence/record                                                   governance.acceptance.evidence.record — the evidence vault
 *   records/propose                                                   governance.acceptance.propose — the exact scope (PAT-48)
 *   records/:id/verify                                                governance.acceptance.verify (human-gated) — the customer verifies
 *   records/:id/attest                                                governance.acceptance.attest (human-gated; SIGNED) — one obligation
 *   records/:id/trigger                                               governance.acceptance.trigger (human-gated) — review or suspend
 *   records/:id/conditions/close                                      governance.acceptance.condition.close (human-gated)
 *   records/:id/withdraw                                              governance.acceptance.withdraw (human-gated)
 *   sweep                                                             governance.acceptance.sweep — the reconciliation, on demand
 *   PLATFORM enforcement/read · enforcement/set                       governance.acceptance.read / governance.acceptance.enforce (human-gated)
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseGovernance, type GovernanceNoun } from '../seams.js';
import { AcceptanceService } from './acceptance.service.js';
import { ACT_TRIGGERS, EVIDENCE_KINDS, EVIDENCE_SUBJECTS, OBLIGATIONS, RECORD_KINDS, blanketPath, missingScopeKeys, type RecordKind } from './acceptance-logic.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const NOUN: GovernanceNoun = 'acceptance record';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
function id(v: unknown, what: string, cid: string, noun: GovernanceNoun = NOUN): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseGovernance(noun, 'request', `${what} is an id`, cid);
  return v;
}
function ids(v: unknown, what: string, cid: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && UUID.test(x))) throw refuseGovernance(NOUN, 'request', `${what} is a list of ids`, cid);
  return [...new Set(v as string[])];
}
function int(v: unknown, what: string, cid: string, noun: GovernanceNoun = NOUN): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw refuseGovernance(noun, 'request', `${what} is a whole number`, cid);
  return v;
}
function reason(p: Row, cid: string, noun: GovernanceNoun = NOUN, k = 'reason'): string {
  const r = str(p, k);
  if (r.length < 8) throw refuseGovernance(noun, k, `a ${k} of at least 8 characters is stated`, cid);
  return r;
}
function digest(p: Row, cid: string, noun: GovernanceNoun = NOUN): string {
  const x = str(p, 'digest');
  if (!HEX64.test(x)) throw refuseGovernance(noun, 'digest', 'the act names the exact digest it was shown (64 hex)', cid);
  return x;
}
function obj(v: unknown, what: string, cid: string): Row {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw refuseGovernance(NOUN, 'request', `${what} is an object`, cid);
  return v as Row;
}
function instant(v: unknown, what: string, cid: string): string {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw refuseGovernance(NOUN, 'request', `${what} is an instant (ISO 8601)`, cid);
  return new Date(v).toISOString();
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/governance/acceptance')
export class AcceptanceController {
  constructor(private readonly svc: AcceptanceService) {}

  /* ───────────── reads ───────────── */
  @Post('/read')
  async workspace(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.workspace(envelope, principal, t, d);
  }
  @Post('/scope/read')
  async scope(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const key = str(body.payload ?? {}, 'subjectKey');
    if (key.length < 2) throw refuseGovernance(NOUN, 'request', 'the accepted-scope read names its subject key (a capability, release candidate or design artifact key)', envelope.correlation_id);
    return this.svc.scope(envelope, principal, t, d, key);
  }
  @Post('/records/:recordId/preview')
  async preview(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    return this.svc.preview(envelope, principal, t, d, id(recordId, 'the record', envelope.correlation_id), int((body.payload ?? {})['version'], 'the version', envelope.correlation_id));
  }
  @Post('/records/:recordId/history')
  async history(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('recordId') recordId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.history(envelope, principal, t, d, id(recordId, 'the record', envelope.correlation_id));
  }

  /* ───────────── writes ───────────── */
  @Post('/evidence/record')
  async recordEvidence(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'kind'); const subjectKind = str(p, 'subjectKind') || 'external'; const outcome = str(p, 'outcome') || 'passed';
    if (!(EVIDENCE_KINDS as readonly string[]).includes(kind)) throw refuseGovernance(NOUN, 'evidence', `the kind is one of ${EVIDENCE_KINDS.join(', ')}`, cid);
    if (!(EVIDENCE_SUBJECTS as readonly string[]).includes(subjectKind)) throw refuseGovernance(NOUN, 'evidence', `the subject kind is one of ${EVIDENCE_SUBJECTS.join(', ')}`, cid);
    const subjectId = subjectKind === 'external' ? null : id(p['subjectId'], 'the referenced subject', cid);
    const dg = str(p, 'digest');
    if (dg !== '' && !HEX64.test(dg)) throw refuseGovernance(NOUN, 'evidence', 'a digest is 64 hex', cid);
    return this.svc.recordEvidence(envelope, principal, t, d, {
      kind, title: str(p, 'title'), subjectKind, subjectId, subjectVersion: p['subjectVersion'] === undefined || p['subjectVersion'] === null ? null : int(p['subjectVersion'], 'the subject version', cid),
      digest: dg === '' ? null : dg, pointer: str(p, 'pointer') || null, covers: obj(p['covers'], 'covers', cid), outcome,
      capturedAt: instant(p['capturedAt'] ?? new Date().toISOString(), 'capturedAt', cid), validUntil: instant(p['validUntil'], 'validUntil', cid),
      renews: p['renews'] === undefined || p['renews'] === null ? null : id(p['renews'], 'the renewed item', cid),
    });
  }
  @Post('/records/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'kind') as RecordKind;
    if (!(RECORD_KINDS as readonly string[]).includes(kind)) throw refuseGovernance(NOUN, 'kind', `the kind is one of ${RECORD_KINDS.join(', ')}`, cid);
    const scope = obj(p['scope'], 'the scope', cid);
    const missing = missingScopeKeys(scope, kind);
    if (missing.length > 0) throw refuseGovernance(NOUN, 'scope', `the scope names ${missing.join(', ')} (acceptance binds an exact scope)`, cid);
    const blanket = blanketPath(scope);
    if (blanket !== null) throw refuseGovernance(NOUN, 'blanket', `${blanket} is a blanket value — acceptance binds an exact scope (PAT-48: no blanket acceptance)`, cid);
    const obligations = Array.isArray(p['obligations']) ? (p['obligations'] as unknown[]).map(String) : [];
    const bad = obligations.filter((o) => !(OBLIGATIONS as readonly string[]).includes(o));
    if (bad.length > 0) throw refuseGovernance(NOUN, 'obligation', `${bad.join(', ')} is not an obligation (${OBLIGATIONS.join(', ')})`, cid);
    const conditions = Array.isArray(p['conditions']) ? (p['conditions'] as unknown[]).map((c) => obj(c, 'a condition', cid)) : [];
    return this.svc.propose(envelope, principal, t, d, {
      recordId: p['recordId'] === undefined || p['recordId'] === null ? null : id(p['recordId'], 'the record', cid), kind, title: str(p, 'title'), subjectKey: str(p, 'subjectKey'),
      scope, obligations, evidence: ids(p['evidence'], 'the evidence', cid), conditions, exceptions: ids(p['exceptions'], 'the exceptions', cid),
      operational: p['operational'] === undefined || p['operational'] === null ? null : obj(p['operational'], 'the operating terms', cid), builders: ids(p['builders'], 'the builders', cid),
      expectedVersion: int(p['expectedVersion'] ?? 0, 'the expected version', cid),
    });
  }
  @Post('/records/:recordId/verify')
  async verify(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const outcome = str(p, 'outcome') || 'verified';
    if (!['verified', 'not_verified'].includes(outcome)) throw refuseGovernance('acceptance attestation', 'outcome', 'verified or not_verified', cid);
    return this.svc.verify(envelope, principal, t, d, id(recordId, 'the record', cid, 'acceptance attestation'), { version: int(p['version'], 'the version', cid, 'acceptance attestation'),
      digest: digest(p, cid, 'acceptance attestation'), outcome, findings: reason(p, cid, 'acceptance attestation', 'findings') });
  }
  @Post('/records/:recordId/attest')
  async attest(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = (str(p, 'decision') || 'attest') as 'attest' | 'withhold';
    if (!['attest', 'withhold'].includes(decision)) throw refuseGovernance('acceptance attestation', 'decision', 'attest or withhold', cid);
    const obligation = str(p, 'obligation');
    if (!(OBLIGATIONS as readonly string[]).includes(obligation)) throw refuseGovernance('acceptance attestation', 'obligation', `the obligation is one of ${OBLIGATIONS.join(', ')}`, cid);
    return this.svc.attest(envelope, principal, t, d, id(recordId, 'the record', cid, 'acceptance attestation'), { version: int(p['version'], 'the version', cid, 'acceptance attestation'),
      obligation, decision, digest: digest(p, cid, 'acceptance attestation'), reason: reason(p, cid, 'acceptance attestation') });
  }
  @Post('/records/:recordId/trigger')
  async trigger(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'kind'); const policy = str(p, 'policy') || 'review';
    if (!(ACT_TRIGGERS as readonly string[]).includes(kind)) throw refuseGovernance(NOUN, 'trigger', `the trigger is one of ${ACT_TRIGGERS.join(', ')}`, cid);
    if (!['review', 'suspend'].includes(policy)) throw refuseGovernance(NOUN, 'policy', 'review or suspend', cid);
    return this.svc.trigger(envelope, principal, t, d, id(recordId, 'the record', cid), { kind, policy, detail: obj(p['detail'], 'the detail', cid), reason: reason(p, cid) });
  }
  @Post('/records/:recordId/conditions/close')
  async conditionMet(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const key = str(p, 'key');
    if (key.length < 2) throw refuseGovernance(NOUN, 'condition', 'the condition is named by its key', cid);
    return this.svc.conditionMet(envelope, principal, t, d, id(recordId, 'the record', cid), { version: int(p['version'], 'the version', cid), key,
      evidenceId: id(p['evidenceId'], 'the evidence that meets it', cid), reason: reason(p, cid) });
  }
  @Post('/records/:recordId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.withdraw(envelope, principal, t, d, id(recordId, 'the record', cid), reason(body.payload ?? {}, cid));
  }
  @Post('/sweep')
  async sweep(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.sweep(envelope, principal, t, d);
  }
}

@Controller('/v1/platform/governance/acceptance')
export class AcceptancePlatformController {
  constructor(private readonly svc: AcceptanceService) {}
  @Post('/enforcement/read')
  async read(@Req() req: EyeRequest) {
    const { envelope, principal } = ctx(req);
    return this.svc.enforcementRead(envelope, principal);
  }
  @Post('/enforcement/set')
  async set(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const key = str(p, 'capabilityKey');
    if (key.length < 2) throw refuseGovernance(NOUN, 'request', 'the marking names its capability key', cid);
    if (typeof p['enforced'] !== 'boolean') throw refuseGovernance(NOUN, 'request', 'enforced is true or false', cid);
    const prefixes = Array.isArray(p['prefixes']) ? (p['prefixes'] as unknown[]).map(String) : [];
    return this.svc.enforce(envelope, principal, { capabilityKey: key, enforced: p['enforced'], prefixes, reason: reason(p, cid) });
  }
}
