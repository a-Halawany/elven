/**
 * B107 §DR (0115_b107_x_dr) — THE HTTP SURFACE of data governance and ownership.
 *
 * DOMAIN — base `/v1/tenants/:t/domains/:d/governance/ownership` (the customer's records):
 *   portal/read · assets/:assetId/read · products/read · cases/:caseId/preview          governance.ownership.read (audited)
 *   authorities/propose                                                                governance.ownership.authority.propose — a data steward or the domain admin
 *   authorities/:assetId/accept                                                        governance.ownership.authority.accept (human-gated) — the NAMED owner
 *   authorities/:assetId/decide                                                        governance.ownership.authority.ratify (human-gated) — never the proposer or the owner
 *   authorities/:assetId/recertify                                                     governance.ownership.authority.recertify (human-gated) — the owner
 *   domain/propose · domain/decide                                                     governance.ownership.domain.propose / .ratify (human-gated)
 *   reconcile                                                                          governance.ownership.reconcile — the steward (the tick reconciles a registered domain)
 *   gaps/:gapId/accept                                                                 governance.ownership.gap.accept (human-gated)
 *   cases/open · cases/:caseId/review · /close · /withdraw                             governance.ownership.case.* (review human-gated)
 *   evidence/assemble · evidence/:recordId/attest                                      governance.ownership.evidence.* (attest human-gated, SIGNED)
 *   lineage/:edgeId/retire                                                             products.catalog.lineage.retire (human-gated) — DP-49-006
 * PLATFORM — base `/v1/governance/ownership` (the vendor's registries):
 *   read · lint/read · transfers/:transferId/preview                                   governance.ownership.read (audited)
 *   capabilities/import · capabilities/:id/reconcile                                   governance.ownership.capability.declare / .reconcile — the conformance steward
 *   capabilities/:id/accept · capabilities/:id/admit                                   governance.ownership.capability.accept / .admit (human-gated)
 *   transfers/propose · /:id/accept · /:id/decide · /:id/withdraw                      governance.ownership.component.* (accept and decide human-gated; decide SIGNED)
 *   components/reconcile                                                               governance.ownership.component.reconcile — the conformance steward
 *   gaps/:gapId/accept                                                                 governance.ownership.platform_gap.accept (human-gated)
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseGovernance, type GovernanceNoun } from '../seams.js';
import { CASE_KINDS, CONSEQUENCES } from './ownership-logic.js';
import { OwnershipService } from './ownership.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const PROFILES = ['local-dev', 'saas', 'private-cloud', 'on-premise'];

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
function id(v: unknown, what: string, noun: GovernanceNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseGovernance(noun, 'request', `${what} is an id`, cid);
  return v;
}
function int(v: unknown, what: string, noun: GovernanceNoun, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw refuseGovernance(noun, 'request', `${what} is a whole number`, cid);
  return v;
}
function text(p: Row, k: string, noun: GovernanceNoun, cid: string, min = 8): string {
  const r = str(p, k);
  if (r.length < min) throw refuseGovernance(noun, k, `${k} is stated (${min}+ characters)`, cid);
  return r;
}
function digest(p: Row, noun: GovernanceNoun, cid: string): string {
  const x = str(p, 'digest');
  if (!HEX64.test(x)) throw refuseGovernance(noun, 'digest', 'the act names the exact digest it was shown (64 hex)', cid);
  return x;
}
function oneOf(p: Row, k: string, allowed: readonly string[], noun: GovernanceNoun, cid: string): string {
  const x = str(p, k);
  if (!allowed.includes(x)) throw refuseGovernance(noun, k, `${k} is one of ${allowed.join(', ')}`, cid);
  return x;
}
function obj(v: unknown, what: string, noun: GovernanceNoun, cid: string): Row {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw refuseGovernance(noun, 'request', `${what} is an object`, cid);
  return v as Row;
}
function list(v: unknown, what: string, noun: GovernanceNoun, cid: string): unknown[] {
  if (!Array.isArray(v)) throw refuseGovernance(noun, 'request', `${what} is a list`, cid);
  return v;
}
function instant(v: unknown, what: string, noun: GovernanceNoun, cid: string): string {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw refuseGovernance(noun, 'request', `${what} is an instant (ISO 8601)`, cid);
  return new Date(v).toISOString();
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/governance/ownership')
export class OwnershipDomainController {
  constructor(private readonly svc: OwnershipService) {}

  /* ───────────── reads ───────────── */
  @Post('/portal/read')
  async portal(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const profile = str(p, 'profile') || 'local-dev';
    if (!PROFILES.includes(profile)) throw refuseGovernance('data authority', 'profile', `the profile is one of ${PROFILES.join(', ')}`, envelope.correlation_id);
    return this.svc.portal(envelope, principal, t, d, profile);
  }
  @Post('/assets/:assetId/read')
  async asset(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('assetId') assetId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.resolve(envelope, principal, t, d, id(assetId, 'the asset', 'data authority', envelope.correlation_id));
  }
  @Post('/products/read')
  async products(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.products(envelope, principal, t, d);
  }
  @Post('/cases/:caseId/preview')
  async casePreview(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.casePreview(envelope, principal, t, d, id(caseId, 'the case', 'stewardship case', envelope.correlation_id));
  }

  /* ───────────── the data authority registry ───────────── */
  @Post('/authorities/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.proposeAuthority(envelope, principal, t, d, { assetId: id(p['assetId'], 'assetId', 'data authority', cid), expected: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'data authority', cid),
      duties: obj(p['duties'], 'duties', 'data authority', cid) });
  }
  @Post('/authorities/:assetId/accept')
  async accept(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('assetId') assetId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.acceptAuthority(envelope, principal, t, d, id(assetId, 'the asset', 'data authority', cid), { version: int(p['version'], 'version', 'data authority', cid), digest: digest(p, 'data authority', cid) });
  }
  @Post('/authorities/:assetId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('assetId') assetId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.decideAuthority(envelope, principal, t, d, id(assetId, 'the asset', 'data authority', cid), { version: int(p['version'], 'version', 'data authority', cid), digest: digest(p, 'data authority', cid),
      decision: oneOf(p, 'decision', ['ratify', 'reject'], 'data authority', cid), reason: text(p, 'reason', 'data authority', cid) });
  }
  @Post('/authorities/:assetId/recertify')
  async recertify(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('assetId') assetId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.recertifyAuthority(envelope, principal, t, d, id(assetId, 'the asset', 'data authority', envelope.correlation_id));
  }

  /* ───────────── the domain registry ───────────── */
  @Post('/domain/propose')
  async proposeDomain(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.proposeDomain(envelope, principal, t, d, { expected: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'data authority', cid), leader: id(p['leader'], 'leader', 'data authority', cid),
      boundary: text(p, 'boundary', 'data authority', cid, 12), contract: obj(p['contract'], 'contract', 'data authority', cid) });
  }
  @Post('/domain/decide')
  async decideDomain(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.decideDomain(envelope, principal, t, d, { version: int(p['version'], 'version', 'data authority', cid), digest: digest(p, 'data authority', cid),
      decision: oneOf(p, 'decision', ['ratify', 'reject'], 'data authority', cid), reason: text(p, 'reason', 'data authority', cid) });
  }

  /* ───────────── reconciliation and gaps ───────────── */
  @Post('/reconcile')
  async reconcile(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.reconcile(envelope, principal, t, d);
  }
  @Post('/gaps/:gapId/accept')
  async acceptGap(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('gapId') gapId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.acceptGap(envelope, principal, { t, d }, id(gapId, 'the gap', 'data authority', cid), { until: instant(p['until'], 'until', 'data authority', cid), reason: text(p, 'reason', 'data authority', cid, 12) });
  }

  /* ───────────── stewardship cases ───────────── */
  @Post('/cases/open')
  async openCase(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.openCase(envelope, principal, t, d, { kind: oneOf(p, 'kind', CASE_KINDS, 'stewardship case', cid), subjectKind: oneOf(p, 'subjectKind', ['catalog_asset', 'product', 'glossary_term'], 'stewardship case', cid),
      subjectId: id(p['subjectId'], 'subjectId', 'stewardship case', cid), title: text(p, 'title', 'stewardship case', cid, 4), action: text(p, 'action', 'stewardship case', cid),
      evidence: list(p['evidence'], 'evidence', 'stewardship case', cid), consequence: oneOf(p, 'consequence', CONSEQUENCES, 'stewardship case', cid) });
  }
  @Post('/cases/:caseId/review')
  async reviewCase(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const conditions = p['conditions'] === undefined || p['conditions'] === null ? null : list(p['conditions'], 'conditions', 'stewardship case', cid).map((x) => String(x));
    const expiresAt = p['expiresAt'] === undefined || p['expiresAt'] === null || p['expiresAt'] === '' ? null : instant(p['expiresAt'], 'expiresAt', 'stewardship case', cid);
    return this.svc.reviewCase(envelope, principal, t, d, id(caseId, 'the case', 'stewardship case', cid), { digest: digest(p, 'stewardship case', cid),
      outcome: oneOf(p, 'outcome', ['approve', 'reject'], 'stewardship case', cid), note: text(p, 'note', 'stewardship case', cid), conditions, expiresAt });
  }
  @Post('/cases/:caseId/close')
  async closeCase(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.closeCase(envelope, principal, t, d, id(caseId, 'the case', 'stewardship case', cid), { note: text(p, 'note', 'stewardship case', cid), evidence: list(p['evidence'] ?? [], 'evidence', 'stewardship case', cid) });
  }
  @Post('/cases/:caseId/withdraw')
  async withdrawCase(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('caseId') caseId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.withdrawCase(envelope, principal, t, d, id(caseId, 'the case', 'stewardship case', cid), text(p, 'reason', 'stewardship case', cid));
  }

  /* ───────────── the responsibility evidence record ───────────── */
  @Post('/evidence/assemble')
  async assemble(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.assembleEvidence(envelope, principal, t, d, { profile: str(p, 'profile') || 'local-dev', from: instant(p['from'], 'from', 'data authority', cid), to: instant(p['to'], 'to', 'data authority', cid) });
  }
  @Post('/evidence/:recordId/attest')
  async attest(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.attestEvidence(envelope, principal, t, d, id(recordId, 'the record', 'data authority', cid), { digest: digest(p, 'data authority', cid),
      decision: oneOf(p, 'decision', ['attest', 'reject'], 'data authority', cid), reason: text(p, 'reason', 'data authority', cid) });
  }

  /* ───────────── the carried B90 residual (DP-49-006) ───────────── */
  @Post('/lineage/:edgeId/retire')
  async retireLineage(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('edgeId') edgeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.retireLineage(envelope, principal, t, d, id(edgeId, 'the edge', 'data authority', cid), { reason: text(p, 'reason', 'data authority', cid),
      evidence: p['evidence'] === undefined || p['evidence'] === null ? null : obj(p['evidence'], 'evidence', 'data authority', cid) });
  }
}

@Controller('/v1/governance/ownership')
export class OwnershipPlatformController {
  constructor(private readonly svc: OwnershipService) {}

  @Post('/read')
  async read(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.platform(envelope, principal); }
  @Post('/lint/read')
  async lint(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.lint(envelope, principal); }

  /* ───────────── the data capability inventory ───────────── */
  @Post('/capabilities/import')
  async importCapabilities(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const prefix = str(p, 'prefix') || 'DAT-GV-';
    if (!/^DAT-([A-Z]{2}-?)?([0-9]{1,2})?$/.test(prefix)) throw refuseGovernance('data authority', 'prefix', 'the prefix names DAT ids (DAT-, DAT-GV-, DAT-GV-0 …)', cid);
    const owner = p['owner'] === undefined || p['owner'] === null ? null : id(p['owner'], 'owner', 'data authority', cid);
    const ownerRole = owner === null ? null : (str(p, 'ownerRole') || 'product_authority');
    return this.svc.importCapabilities(envelope, principal, { prefix, owner, ownerRole });
  }
  @Post('/capabilities/:capabilityId/reconcile')
  async reconcileCapability(@Req() req: EyeRequest, @Param('capabilityId') capabilityId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.reconcileCapability(envelope, principal, id(capabilityId, 'the capability', 'data authority', envelope.correlation_id));
  }
  @Post('/capabilities/:capabilityId/accept')
  async acceptCapability(@Req() req: EyeRequest, @Param('capabilityId') capabilityId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.acceptCapability(envelope, principal, id(capabilityId, 'the capability', 'data authority', cid), { version: int(p['version'], 'version', 'data authority', cid), digest: digest(p, 'data authority', cid) });
  }
  @Post('/capabilities/:capabilityId/admit')
  async admitCapability(@Req() req: EyeRequest, @Param('capabilityId') capabilityId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.admitCapability(envelope, principal, id(capabilityId, 'the capability', 'data authority', cid), { version: int(p['version'], 'version', 'data authority', cid), digest: digest(p, 'data authority', cid),
      reason: text(p, 'reason', 'data authority', cid) });
  }

  /* ───────────── component ownership ───────────── */
  @Post('/transfers/propose')
  async proposeTransfer(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.proposeTransfer(envelope, principal, { componentId: id(p['componentId'], 'componentId', 'ownership record', cid), expected: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'ownership record', cid),
      proposal: obj(p['proposal'], 'proposal', 'ownership record', cid), checklist: obj(p['checklist'], 'checklist', 'ownership record', cid) });
  }
  @Post('/transfers/:transferId/preview')
  async transferPreview(@Req() req: EyeRequest, @Param('transferId') transferId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.transferPreview(envelope, principal, id(transferId, 'the transfer', 'ownership record', envelope.correlation_id));
  }
  @Post('/transfers/:transferId/accept')
  async acceptTransfer(@Req() req: EyeRequest, @Param('transferId') transferId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.acceptTransfer(envelope, principal, id(transferId, 'the transfer', 'ownership record', cid), digest(p, 'ownership record', cid));
  }
  @Post('/transfers/:transferId/decide')
  async decideTransfer(@Req() req: EyeRequest, @Param('transferId') transferId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.decideTransfer(envelope, principal, id(transferId, 'the transfer', 'ownership record', cid), { digest: digest(p, 'ownership record', cid),
      decision: oneOf(p, 'decision', ['ratify', 'reject'], 'ownership record', cid), reason: text(p, 'reason', 'ownership record', cid) });
  }
  @Post('/transfers/:transferId/withdraw')
  async withdrawTransfer(@Req() req: EyeRequest, @Param('transferId') transferId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.withdrawTransfer(envelope, principal, id(transferId, 'the transfer', 'ownership record', cid), text(p, 'reason', 'ownership record', cid));
  }
  @Post('/components/reconcile')
  async reconcileComponents(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.reconcileComponents(envelope, principal); }
  @Post('/gaps/:gapId/accept')
  async acceptGap(@Req() req: EyeRequest, @Param('gapId') gapId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.acceptGap(envelope, principal, null, id(gapId, 'the gap', 'data authority', cid), { until: instant(p['until'], 'until', 'data authority', cid), reason: text(p, 'reason', 'data authority', cid, 12) });
  }
}
