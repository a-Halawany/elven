/**
 * B107 §PG (0115_b107_x_pg) — THE HTTP SURFACE of the product-governance workspace. Base `/v1/governance/workspace`; every route PLATFORM
 * (`{scope: 'PLATFORM', tenant_id: null, domain_id: null}`), each its own EXACT action (pdp.service.ts `B107 workspace`).
 *
 *   read                                        governance.read (audited) — the home: baseline, inventory, rights, exceptions (+ the read-only
 *                                               engineering and supply-chain registers), conflicts, changes, records, posture, holds, ledger
 *   preview                                     governance.read — {kind, id, version}: the digest, the consequence, the caller's eligibility
 *   impact                                      governance.read — {subjects}: the deterministic impact
 *   owners/assign                               governance.baseline.owner.assign (human-gated) — the product authority
 *   rights/propose · rights/:id/decide          governance.rights.propose · governance.rights.decide (human-gated; SIGNED decision_rights)
 *   baseline/propose · baseline/:id/decide      governance.baseline.propose · governance.baseline.decide (human-gated; SIGNED baseline_decision)
 *   exceptions/propose                          governance.exception.propose — new (no exceptionId) or a RENEWAL (exceptionId + expectedVersion)
 *   exceptions/:id/decide                       governance.exception.decide (human-gated; SIGNED exception_approval) — independent
 *   exceptions/:id/withdraw · /close            governance.exception.withdraw · governance.exception.close (human-gated)
 *   exceptions/sweep                            governance.exception.sweep — the conformance steward
 *   reviews/:id/decide                          governance.remediation.decide (human-gated) — the product authority
 *   conflicts/raise · conflicts/:id/resolve     governance.conflict.raise · governance.conflict.resolve (human-gated; SIGNED conflict_resolution)
 *   changes/propose · changes/:id/decide        governance.change.propose · governance.change.decide (human-gated; SIGNED change_approval)
 *   records/propose · records/:id/decide · /review · /close    governance.record.* (decide, review and close human-gated)
 *   posture/record                              governance.posture.record — the conformance steward
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. A route refuses only what is malformed; nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseGovernance, type GovernanceNoun } from '../seams.js';
import { WorkspaceService } from './workspace.service.js';
import { HEX64, changeShape, conflictShape, evidenceShape, exceptionShape, isUuid, recordShape, resolutionShape, rightsShape, scopeShape, type Check } from './workspace-logic.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
function id(v: unknown, what: string, noun: GovernanceNoun, cid: string): string {
  if (!isUuid(v)) throw refuseGovernance(noun, 'request', `${what} is an id`, cid);
  return v;
}
const optId = (v: unknown, what: string, noun: GovernanceNoun, cid: string): string | null => (v === undefined || v === null ? null : id(v, what, noun, cid));
function int(v: unknown, what: string, noun: GovernanceNoun, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw refuseGovernance(noun, 'request', `${what} is a whole number`, cid);
  return v;
}
function reason(p: Row, noun: GovernanceNoun, cid: string, k = 'reason', min = 8): string {
  const r = str(p, k);
  if (r.length < min) throw refuseGovernance(noun, k, `a ${k} of at least ${min} characters is stated`, cid);
  return r;
}
function digest(p: Row, noun: GovernanceNoun, cid: string): string {
  const x = str(p, 'digest');
  if (!HEX64.test(x)) throw refuseGovernance(noun, 'digest', 'the decision names the exact digest it was shown (64 hex)', cid);
  return x;
}
function decision<T extends string>(p: Row, allowed: readonly T[], noun: GovernanceNoun, cid: string): T {
  const d = str(p, 'decision');
  if (!(allowed as readonly string[]).includes(d)) throw refuseGovernance(noun, 'decision', `the decision is ${allowed.join(' or ')}`, cid);
  return d as T;
}
function shaped(c: Check, noun: GovernanceNoun, cid: string): void {
  if (!c.ok) throw refuseGovernance(noun, c.field.toLowerCase().replace(/[^a-z_]/g, '_'), c.reason, cid);
}

@Controller('/v1/governance/workspace')
export class WorkspaceController {
  constructor(private readonly svc: WorkspaceService) {}

  /* ───────────── reads ───────────── */
  @Post('/read')
  async read(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.home(envelope, principal); }
  @Post('/preview')
  async preview(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'kind');
    if (!['exception', 'change', 'baseline', 'rights', 'conflict', 'record'].includes(kind)) throw refuseGovernance('governance record', 'kind', 'the kind is exception, change, baseline, rights, conflict or record', cid);
    return this.svc.preview(envelope, principal, kind, id(p['id'], 'id', 'governance record', cid), kind === 'conflict' ? 1 : int(p['version'], 'version', 'governance record', cid));
  }
  @Post('/impact')
  async impact(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const s = p['subjects'];
    if (!Array.isArray(s) || s.length === 0 || s.length > 50 || !s.every(isUuid)) throw refuseGovernance('change proposal', 'subjects', 'subjects is a list of 1–50 artifact ids', cid);
    return this.svc.impact(envelope, principal, [...new Set(s as string[])]);
  }

  /* ───────────── the baseline ───────────── */
  @Post('/owners/assign')
  async assignOwner(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.assignOwner(envelope, principal, { capabilityId: id(p['capabilityId'], 'capabilityId', 'product baseline', cid), owner: id(p['owner'], 'owner', 'product baseline', cid),
      ownerRole: str(p, 'ownerRole'), domainBoundary: str(p, 'domainBoundary'), reason: reason(p, 'product baseline', cid) });
  }
  @Post('/rights/propose')
  async proposeRights(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    shaped(rightsShape(p['rows']), 'decision rights', cid);
    return this.svc.proposeRights(envelope, principal, { matrixId: optId(p['matrixId'], 'matrixId', 'decision rights', cid), rows: p['rows'] as unknown[],
      expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'decision rights', cid) });
  }
  @Post('/rights/:matrixId/decide')
  async decideRights(@Req() req: EyeRequest, @Param('matrixId') matrixId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'decision rights';
    return this.svc.decideRights(envelope, principal, id(matrixId, 'matrixId', n, cid),
      { version: int(p['version'], 'version', n, cid), decision: decision(p, ['approve', 'reject'] as const, n, cid), digest: digest(p, n, cid), reason: reason(p, n, cid) });
  }
  @Post('/baseline/propose')
  async proposeBaseline(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'product baseline';
    shaped(scopeShape(p['scope']), n, cid);
    return this.svc.proposeBaseline(envelope, principal, { baselineId: optId(p['baselineId'], 'baselineId', n, cid), title: str(p, 'title'), scope: p['scope'] as Row,
      expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', n, cid) });
  }
  @Post('/baseline/:baselineId/decide')
  async decideBaseline(@Req() req: EyeRequest, @Param('baselineId') baselineId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'product baseline';
    return this.svc.decideBaseline(envelope, principal, id(baselineId, 'baselineId', n, cid),
      { version: int(p['version'], 'version', n, cid), decision: decision(p, ['sign', 'reject'] as const, n, cid), digest: digest(p, n, cid), reason: reason(p, n, cid) });
  }

  /* ───────────── the exception registry ───────────── */
  @Post('/exceptions/propose')
  async proposeException(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'governance exception';
    const exceptionId = optId(p['exceptionId'], 'exceptionId', n, cid);
    const expectedVersion = int(p['expectedVersion'] ?? 0, 'expectedVersion', n, cid);
    shaped(exceptionShape(p, exceptionId !== null && expectedVersion > 0), n, cid);
    const { exceptionId: _x, expectedVersion: _v, ...rest } = p;
    return this.svc.proposeException(envelope, principal, { exceptionId, body: rest, expectedVersion });
  }
  @Post('/exceptions/sweep')
  async sweep(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.sweep(envelope, principal); }
  @Post('/exceptions/:exceptionId/decide')
  async decideException(@Req() req: EyeRequest, @Param('exceptionId') exceptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'governance exception';
    return this.svc.decideException(envelope, principal, id(exceptionId, 'exceptionId', n, cid),
      { version: int(p['version'], 'version', n, cid), decision: decision(p, ['approve', 'reject'] as const, n, cid), digest: digest(p, n, cid), reason: reason(p, n, cid) });
  }
  @Post('/exceptions/:exceptionId/withdraw')
  async withdrawException(@Req() req: EyeRequest, @Param('exceptionId') exceptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'governance exception';
    return this.svc.withdrawException(envelope, principal, id(exceptionId, 'exceptionId', n, cid), { version: int(p['version'], 'version', n, cid), reason: reason(p, n, cid) });
  }
  @Post('/exceptions/:exceptionId/close')
  async closeException(@Req() req: EyeRequest, @Param('exceptionId') exceptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'governance exception';
    shaped(evidenceShape(p['exitEvidence'], 'exitEvidence'), n, cid);
    return this.svc.closeException(envelope, principal, id(exceptionId, 'exceptionId', n, cid),
      { version: int(p['version'], 'version', n, cid), evidence: p['exitEvidence'] as unknown[], reason: reason(p, n, cid) });
  }
  @Post('/reviews/:reviewId/decide')
  async decideReview(@Req() req: EyeRequest, @Param('reviewId') reviewId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'governance exception';
    const d = decision(p, ['remediation', 'change_review'] as const, n, cid);
    if (d === 'remediation' && (!isUuid(p['owner']) || typeof p['dueOn'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(p['dueOn'])))) {
      throw refuseGovernance(n, 'remediation', 'a remediation names its owner (an id) and its due day (YYYY-MM-DD)', cid);
    }
    if (d === 'change_review' && !isUuid(p['changeProposal'])) throw refuseGovernance(n, 'change_review', 'a formal change review names a change proposal (an id)', cid);
    return this.svc.decideReview(envelope, principal, id(reviewId, 'reviewId', n, cid),
      { decision: d, body: { plan: p['plan'], owner: p['owner'], dueOn: p['dueOn'], changeProposal: p['changeProposal'] }, reason: reason(p, n, cid) });
  }

  /* ───────────── conflicts ───────────── */
  @Post('/conflicts/raise')
  async raiseConflict(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    shaped(conflictShape(p), 'conformance conflict', cid);
    return this.svc.raiseConflict(envelope, principal, p);
  }
  @Post('/conflicts/:conflictId/resolve')
  async resolveConflict(@Req() req: EyeRequest, @Param('conflictId') conflictId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'conformance conflict';
    shaped(resolutionShape(p), n, cid);
    const { digest: _d, ...rest } = p;
    return this.svc.resolveConflict(envelope, principal, id(conflictId, 'conflictId', n, cid), { body: rest, digest: digest(p, n, cid) });
  }

  /* ───────────── change proposals ───────────── */
  @Post('/changes/propose')
  async proposeChange(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'change proposal';
    shaped(changeShape(p), n, cid);
    const { proposalId, expectedVersion, ...rest } = p;
    return this.svc.proposeChange(envelope, principal, { proposalId: optId(proposalId, 'proposalId', n, cid), body: rest, expectedVersion: int(expectedVersion ?? 0, 'expectedVersion', n, cid) });
  }
  @Post('/changes/:proposalId/decide')
  async decideChange(@Req() req: EyeRequest, @Param('proposalId') proposalId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'change proposal';
    return this.svc.decideChange(envelope, principal, id(proposalId, 'proposalId', n, cid),
      { version: int(p['version'], 'version', n, cid), decision: decision(p, ['approve', 'reject'] as const, n, cid), digest: digest(p, n, cid), reason: reason(p, n, cid) });
  }

  /* ───────────── the governance registry ───────────── */
  @Post('/records/propose')
  async proposeRecord(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'governance record';
    const { recordId, expectedVersion, ...rest } = p;
    const ev = int(expectedVersion ?? 0, 'expectedVersion', n, cid);
    shaped(recordShape(rest, ev > 0), n, cid);
    return this.svc.proposeRecord(envelope, principal, { recordId: optId(recordId, 'recordId', n, cid), body: rest, expectedVersion: ev });
  }
  @Post('/records/:recordId/decide')
  async decideRecord(@Req() req: EyeRequest, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'governance record';
    return this.svc.decideRecord(envelope, principal, id(recordId, 'recordId', n, cid),
      { version: int(p['version'], 'version', n, cid), decision: decision(p, ['approve', 'reject'] as const, n, cid), digest: digest(p, n, cid), reason: reason(p, n, cid) });
  }
  @Post('/records/:recordId/review')
  async reviewRecord(@Req() req: EyeRequest, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'governance record';
    return this.svc.reviewRecord(envelope, principal, id(recordId, 'recordId', n, cid), { version: int(p['version'], 'version', n, cid), note: reason(p, n, cid, 'note', 12) });
  }
  @Post('/records/:recordId/close')
  async closeRecord(@Req() req: EyeRequest, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id; const n: GovernanceNoun = 'governance record';
    const mode = str(p, 'mode');
    if (mode !== 'verified_closure' && mode !== 'retirement') throw refuseGovernance(n, 'mode', 'the mode is verified_closure or retirement', cid);
    shaped(evidenceShape(p['evidence']), n, cid);
    return this.svc.closeRecord(envelope, principal, id(recordId, 'recordId', n, cid), { version: int(p['version'], 'version', n, cid), mode, evidence: p['evidence'] as unknown[],
      successor: optId(p['successor'], 'successor', n, cid), reason: reason(p, n, cid, 'reason', 12) });
  }
  @Post('/posture/record')
  async recordPosture(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.recordPosture(envelope, principal); }
}
