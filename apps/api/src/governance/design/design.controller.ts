/**
 * B107 §DG (0115_b107_x_dg; F-P7-E-17) — THE HTTP SURFACE of design governance.
 *
 * PLATFORM (the vendor's design system) — base /v1/governance/design:
 *   read · trace/read · baselines/:id/compare · preview/:what/:id                 governance.read (audited)
 *   baselines/propose                                                              governance.design.baseline.propose (the authority, the steward, the product authority)
 *   baselines/:id/decide                                                           governance.design.baseline.decide (human-gated; attest SIGNED; HELD 409 on an ownership gap)
 *   assets/register                                                                governance.design.asset.register (the inventory: the repository read first)
 *   assets/:id/approve                                                             governance.design.asset.approve (human-gated; the one accountable owner named)
 *   principles/declare                                                             governance.design.principle.declare (human-gated)
 *   evaluations/lint · evaluations/review                                          governance.design.evaluate
 *   evaluations/chart-grammar (B82 cf — dg-lint-4)                                 governance.design.evaluate
 *   exceptions/request · exceptions/:id/decide                                     governance.design.exception.request / .decide (human-gated; approve SIGNED)
 *   contributions/propose · contributions/:id/amend                                governance.design.contribution.propose / .amend
 *   contributions/:id/:step (review accept reject publish deprecate adopt measure migrate retire close)
 *                                                                                  governance.design.contribution.<step> (accept SIGNED; held steps 409)
 *   links/record                                                                   governance.design.link.record
 * DOMAIN — base /v1/tenants/:t/domains/:d/governance/design:
 *   read · packages/:id/read                                                       governance.read (audited)
 *   intake                                                                         governance.design.intake (B92 design_change_proposal → a contribution proposal)
 *   acceptances/propose · acceptances/:id/attest                                   governance.design.acceptance.propose / .attest (human-gated; SIGNED)
 *   packages/generate                                                              governance.design.package.generate (UNSIGNED — R2)
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseGovernance, type GovernanceNoun } from '../seams.js';
import { DesignGovernanceService } from './design.service.js';
import { CONTRIBUTION_KINDS, CONTRIBUTION_STEPS, OBLIGATIONS, evidenceProblem, tupleProblem, type ContributionStep } from './design-logic.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
const obj = (p: Row, k: string): Row => (p[k] !== null && typeof p[k] === 'object' && !Array.isArray(p[k]) ? p[k] as Row : {});
function id(v: unknown, what: string, noun: GovernanceNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseGovernance(noun, 'request', `${what} is an id`, cid);
  return v;
}
const optId = (v: unknown, what: string, noun: GovernanceNoun, cid: string): string | null => (v === undefined || v === null || v === '' ? null : id(v, what, noun, cid));
function ids(v: unknown, what: string, noun: GovernanceNoun, cid: string): string[] {
  if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === 'string' && UUID.test(x))) throw refuseGovernance(noun, 'request', `${what} is a non-empty list of ids`, cid);
  return [...new Set(v as string[])];
}
function int(v: unknown, what: string, noun: GovernanceNoun, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw refuseGovernance(noun, 'request', `${what} is a whole number`, cid);
  return v;
}
function reason(p: Row, noun: GovernanceNoun, cid: string): string {
  const r = str(p, 'reason');
  if (r.length < 8) throw refuseGovernance(noun, 'reason', 'a reason of at least 8 characters is stated', cid);
  return r;
}
function digest(p: Row, noun: GovernanceNoun, cid: string): string {
  const x = str(p, 'digest');
  if (!HEX64.test(x)) throw refuseGovernance(noun, 'digest', 'the decision names the exact digest it was shown (64 hex)', cid);
  return x;
}
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

@Controller('/v1/governance/design')
export class DesignPlatformController {
  constructor(private readonly svc: DesignGovernanceService) {}

  @Post('/read')
  async read(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.workspace(envelope, principal); }

  @Post('/trace/read')
  async trace(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const depth = p['depth'] === undefined ? 2 : int(p['depth'], 'depth', 'design baseline', cid);
    if (depth < 1 || depth > 4) throw refuseGovernance('design baseline', 'depth', 'the trace depth is 1–4', cid);
    return this.svc.trace(envelope, principal, { artifactId: optId(p['artifactId'], 'artifactId', 'design baseline', cid), query: str(p, 'query') || null, depth });
  }
  @Post('/baselines/:baselineId/compare')
  async compare(@Req() req: EyeRequest, @Param('baselineId') baselineId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.compare(envelope, principal, id(baselineId, 'baselineId', 'design baseline', cid), int(p['from'], 'from', 'design baseline', cid), int(p['to'], 'to', 'design baseline', cid));
  }
  @Post('/preview/:what/:subjectId')
  async preview(@Req() req: EyeRequest, @Param('what') what: string, @Param('subjectId') subjectId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    if (what !== 'baseline' && what !== 'contribution' && what !== 'exception' && what !== 'asset') throw refuseGovernance('design baseline', 'request', 'preview a baseline, contribution, exception or asset', cid);
    return this.svc.preview(envelope, principal, what, id(subjectId, 'subjectId', 'design baseline', cid), p['version'] === undefined ? null : int(p['version'], 'version', 'design baseline', cid));
  }

  @Post('/baselines/propose')
  async proposeBaseline(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.proposeBaseline(envelope, principal, { baselineId: optId(p['baselineId'], 'baselineId', 'design baseline', cid), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'design baseline', cid),
      title: str(p, 'title'), dsv: str(p, 'designSystemVersion'), scope: obj(p, 'scope'), members: ids(p['members'], 'members', 'design baseline', cid) });
  }
  @Post('/baselines/:baselineId/decide')
  async decideBaseline(@Req() req: EyeRequest, @Param('baselineId') baselineId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'attest' && decision !== 'reject') throw refuseGovernance('design baseline', 'decision', 'the decision is attest or reject', cid);
    return this.svc.decideBaseline(envelope, principal, id(baselineId, 'baselineId', 'design baseline', cid),
      { version: int(p['version'], 'version', 'design baseline', cid), decision, digest: digest(p, 'design baseline', cid), reason: reason(p, 'design baseline', cid) });
  }

  @Post('/assets/register')
  async registerAssets(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    return this.svc.registerInventory(envelope, principal, Array.isArray(p['assets']) ? p['assets'] as Row[] : null);
  }
  @Post('/assets/:assetId/approve')
  async approveAsset(@Req() req: EyeRequest, @Param('assetId') assetId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.approveAsset(envelope, principal, id(assetId, 'assetId', 'design baseline', cid), { version: int(p['version'], 'version', 'design baseline', cid),
      owner: id(p['ownerPrincipalId'], 'ownerPrincipalId', 'design baseline', cid), digest: digest(p, 'design baseline', cid), reason: reason(p, 'design baseline', cid) });
  }

  @Post('/principles/declare')
  async declarePrinciple(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.declarePrinciple(envelope, principal, { key: str(p, 'key'), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'design principle', cid), kind: str(p, 'kind'),
      statement: str(p, 'statement'), prohibited: str(p, 'prohibited') || null, patterns: list(p['patterns']).filter((x): x is string => typeof x === 'string'), remediation: str(p, 'remediation'),
      lintRule: str(p, 'lintRule') || null, unwaivable: p['unwaivable'] === true, state: str(p, 'state') || 'active', reason: reason(p, 'design principle', cid) });
  }
  @Post('/evaluations/lint')
  async lint(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const files = Array.isArray(p['files']) ? (p['files'] as Row[]).filter((f) => typeof f['path'] === 'string' && typeof f['text'] === 'string').map((f) => ({ path: String(f['path']), text: String(f['text']) })) : null;
    return this.svc.runLint(envelope, principal, files === null ? null : { files });
  }
  /* B82 cf: dg-lint-4 — the chart-grammar lint recorded through B107's evaluation port (governance.design.evaluate), with its ratchet */
  @Post('/evaluations/chart-grammar')
  async chartGrammar(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const files = Array.isArray(p['files']) ? (p['files'] as Row[]).filter((f) => typeof f['path'] === 'string' && typeof f['text'] === 'string').map((f) => ({ path: String(f['path']), text: String(f['text']) })) : null;
    return this.svc.runChartLint(envelope, principal, files === null ? null : { files });
  }
  /* end B82 cf */
  @Post('/evaluations/review')
  async review(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const notes = str(p, 'notes');
    if (notes.length < 8) throw refuseGovernance('design principle', 'notes', 'a review states what was reviewed (8+ characters)', cid);
    return this.svc.recordReview(envelope, principal, { assetId: id(p['assetId'], 'assetId', 'design principle', cid), assetVersion: int(p['assetVersion'], 'assetVersion', 'design principle', cid),
      findings: list(p['findings']) as Row[], notes });
  }
  @Post('/exceptions/request')
  async requestException(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const expiresAt = str(p, 'expiresAt');
    if (!Number.isFinite(Date.parse(expiresAt))) throw refuseGovernance('design principle', 'expiry', 'expiresAt is an instant (ISO 8601)', cid);
    return this.svc.requestException(envelope, principal, { principle: str(p, 'principle'), assetId: id(p['assetId'], 'assetId', 'design principle', cid), reason: str(p, 'reason'),
      compensating: str(p, 'compensating'), expiresAt, renews: optId(p['renews'], 'renews', 'design principle', cid) });
  }
  @Post('/exceptions/:exceptionId/decide')
  async decideException(@Req() req: EyeRequest, @Param('exceptionId') exceptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'approve' && decision !== 'reject') throw refuseGovernance('design principle', 'decision', 'the decision is approve or reject', cid);
    return this.svc.decideException(envelope, principal, id(exceptionId, 'exceptionId', 'design principle', cid), { decision, digest: digest(p, 'design principle', cid), reason: reason(p, 'design principle', cid) });
  }

  @Post('/contributions/propose')
  async propose(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'kind');
    if (!(CONTRIBUTION_KINDS as readonly string[]).includes(kind)) throw refuseGovernance('design contribution', 'kind', `the kind is one of ${CONTRIBUTION_KINDS.join(', ')}`, cid);
    return this.svc.proposeContribution(envelope, principal, { kind, target: optId(p['targetAssetId'], 'targetAssetId', 'design contribution', cid), proposal: obj(p, 'proposal'),
      summary: str(p, 'summary'), plans: obj(p, 'plans'), constitutional: p['constitutional'] === true });
  }
  @Post('/contributions/:contributionId/amend')
  async amend(@Req() req: EyeRequest, @Param('contributionId') contributionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.amendContribution(envelope, principal, id(contributionId, 'contributionId', 'design contribution', cid), { revision: int(p['revision'], 'revision', 'design contribution', cid),
      target: optId(p['targetAssetId'], 'targetAssetId', 'design contribution', cid), proposal: obj(p, 'proposal'), summary: str(p, 'summary'), plans: obj(p, 'plans') });
  }
  @Post('/contributions/:contributionId/:step')
  async step(@Req() req: EyeRequest, @Param('contributionId') contributionId: string, @Param('step') step: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    if (!(CONTRIBUTION_STEPS as readonly string[]).includes(step)) throw refuseGovernance('design contribution', 'step', `the step is one of ${CONTRIBUTION_STEPS.join(', ')}`, cid);
    return this.svc.advance(envelope, principal, id(contributionId, 'contributionId', 'design contribution', cid), step as ContributionStep, {
      revision: int(p['revision'], 'revision', 'design contribution', cid), digest: step === 'accept' ? digest(p, 'design contribution', cid) : (str(p, 'digest') || null),
      reason: reason(p, 'design contribution', cid), evidence: obj(p, 'evidence') });
  }
  @Post('/links/record')
  async link(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const retire = optId(p['retire'], 'retire', 'design baseline', cid);
    return this.svc.recordLink(envelope, principal, { from: retire === null ? id(p['from'], 'from', 'design baseline', cid) : null, to: retire === null ? id(p['to'], 'to', 'design baseline', cid) : null,
      relation: retire === null ? str(p, 'relation') : null, retire });
  }
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/governance/design')
export class DesignDomainController {
  constructor(private readonly svc: DesignGovernanceService) {}

  @Post('/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) { const { envelope, principal } = ctx(req); return this.svc.domainRead(envelope, principal, t, d); }
  @Post('/packages/:packageId/read')
  async readPackage(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.packageRead(envelope, principal, t, d, id(packageId, 'packageId', 'conformance package', envelope.correlation_id));
  }
  @Post('/intake')
  async intake(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    return this.svc.intake(envelope, principal, t, d, optId(p['actionId'], 'actionId', 'design contribution', envelope.correlation_id));
  }
  @Post('/acceptances/propose')
  async proposeAcceptance(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const tp = tupleProblem(p['tuple']);
    if (tp !== null) throw refuseGovernance('design acceptance', 'tuple', tp, cid);
    const ep = evidenceProblem(p['evidence'], new Date().toISOString());
    if (ep !== null) throw refuseGovernance('design acceptance', 'evidence', ep, cid);
    const obligations = Array.isArray(p['obligations']) ? (p['obligations'] as unknown[]).map(String) : ['design', 'assurance'];
    if (!obligations.every((o) => (OBLIGATIONS as readonly string[]).includes(o))) throw refuseGovernance('design acceptance', 'obligations', `the obligations are among ${OBLIGATIONS.join(', ')}`, cid);
    return this.svc.proposeAcceptance(envelope, principal, t, d, { acceptanceId: optId(p['acceptanceId'], 'acceptanceId', 'design acceptance', cid),
      expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'design acceptance', cid), baselineId: id(p['baselineId'], 'baselineId', 'design acceptance', cid),
      components: ids(p['components'], 'components', 'design acceptance', cid), tuple: obj(p, 'tuple'), evidence: list(p['evidence']), findings: list(p['findings']), conditions: list(p['conditions']),
      obligations, builders: Array.isArray(p['builders']) ? ids(p['builders'], 'builders', 'design acceptance', cid) : [] });
  }
  @Post('/acceptances/:acceptanceId/attest')
  async attest(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('acceptanceId') acceptanceId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const obligation = str(p, 'obligation');
    if (!(OBLIGATIONS as readonly string[]).includes(obligation)) throw refuseGovernance('design acceptance', 'obligation', `the obligation is one of ${OBLIGATIONS.join(', ')}`, cid);
    return this.svc.attestAcceptance(envelope, principal, t, d, id(acceptanceId, 'acceptanceId', 'design acceptance', cid),
      { version: int(p['version'], 'version', 'design acceptance', cid), obligation, digest: digest(p, 'design acceptance', cid), reason: reason(p, 'design acceptance', cid) });
  }
  @Post('/packages/generate')
  async generate(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const target = str(p, 'target');
    if (target !== 'UX-70-006' && target !== 'UX-66-006') throw refuseGovernance('conformance package', 'target', 'the package is for UX-70-006 or UX-66-006', cid);
    return this.svc.generatePackage(envelope, principal, t, d, { target, acceptanceId: optId(p['acceptanceId'], 'acceptanceId', 'conformance package', cid) });
  }
}
