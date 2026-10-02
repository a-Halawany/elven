/**
 * CP-6 B29 §A (0092) — the twin family, composition and extension routes: kinds (the product's families and a domain's x- kinds),
 * composition contracts, twin-to-twin links, coupling proposals and their application, dependency completeness, the family measures.
 * Base: /v1/tenants/:tenantId/domains/:domainId/twin-composition. Same envelope, capabilities and receipts as the twin routes; reads are
 * `twin.read` (consequential, audited), every write its own exact action (the B29 PDP rules):
 *
 *   POST /kinds/list                          twin.read
 *   POST /kinds/register                      twin.kind.register       (human-gated; an x- kind of this tenant and domain)
 *   POST /twins/:twinId/contracts/list        twin.read
 *   POST /twins/:twinId/contract/publish      twin.contract.publish    (the twin's owner)
 *   POST /twins/:twinId/completeness          twin.read                (L5-C06)
 *   POST /twins/:twinId/measures              twin.read                (the family-derived measures)
 *   POST /links/list                          twin.read
 *   POST /links/declare                       twin.link.declare        (the downstream owner; target: the downstream twin)
 *   POST /links/:linkId/retire                twin.link.retire         (the downstream owner)
 *   POST /couplings/list                      twin.read
 *   POST /couplings/:proposalId/apply         twin.coupling.apply      (the downstream owner; through the version and ground ports)
 *   POST /couplings/:proposalId/decline       twin.coupling.decline    (the downstream owner)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { CompositionCapability } from './composition.capabilities.js';
import { CompositionService, validateContractIntake, validateKindIntake, validateLinkIntake, validateReason } from './composition.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_STATES = ['live', 'retired'] as const;
const PROPOSAL_STATES = ['proposed', 'applied', 'declined', 'superseded'] as const;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
function id(v: string, what: string, correlationId: string): string {
  if (!UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${what} must be an id`), 400);
  return v;
}
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null);

@Controller('/v1/tenants/:tenantId/domains/:domainId/twin-composition')
export class CompositionController {
  constructor(private readonly pipeline: PipelineService, private readonly composition: CompositionService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ── kinds ─────────────────────────────────────────────────────────────────────────────
  @Post('/kinds/list')
  async listKinds(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', null),
      CompositionCapability.read, async (cap) => this.composition.listKinds(cap));
    return { kinds: out.result, receipt: receipt(out) };
  }

  /** V03-T-473: a domain registers its own twin kind — x-<name>, family `extension`, its element schema; human-gated by the PDP. */
  @Post('/kinds/register')
  async registerKind(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateKindIntake(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.kind.register', 'TWK', null), CompositionCapability.kind,
      async (cap, scope) => {
        const r = await this.composition.registerKind(cap, scope, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWK', targetId: String(r['subject']), targetVersion: '1', outboxEvent: null };
      });
    return { kind: out.result, receipt: receipt(out) };
  }

  // ── contracts, completeness, measures ────────────────────────────────────────────────
  @Post('/twins/:twinId/contracts/list')
  async listContracts(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const twinId = id(twinIdRaw, 'twinId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      CompositionCapability.read, async (cap) => this.composition.listContracts(cap, twinId));
    return { contracts: out.result, receipt: receipt(out) };
  }

  @Post('/twins/:twinId/contract/publish')
  async publishContract(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinIdRaw: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const twinId = id(twinIdRaw, 'twinId', envelope.correlation_id);
    const intake = validateContractIntake(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.contract.publish', 'TWN', twinId), CompositionCapability.contract,
      async (cap, scope) => {
        const r = await this.composition.publishContract(cap, scope, twinId, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(r['contract_version']), outboxEvent: null };
      });
    return { contract: out.result, receipt: receipt(out) };
  }

  /** L5-C06: the dependency-completeness measure of a twin. */
  @Post('/twins/:twinId/completeness')
  async completeness(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const twinId = id(twinIdRaw, 'twinId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      CompositionCapability.read, async (cap, scope) => this.composition.completeness(cap, scope, twinId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized twin matches'), 404);
    return { completeness: out.result, receipt: receipt(out) };
  }

  @Post('/twins/:twinId/measures')
  async measures(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinIdRaw: string,
    @Body() body: { payload?: { version?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const twinId = id(twinIdRaw, 'twinId', envelope.correlation_id);
    const v = body.payload?.version;
    const version = Number.isInteger(v) && (v as number) >= 1 ? (v as number) : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      CompositionCapability.read, async (cap) => this.composition.measures(cap, twinId, version));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized twin matches'), 404);
    return { measures: out.result, receipt: receipt(out) };
  }

  // ── links ─────────────────────────────────────────────────────────────────────────────
  @Post('/links/list')
  async listLinks(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { twinId?: string; state?: string } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = typeof p.twinId === 'string' ? id(p.twinId, 'twinId', envelope.correlation_id) : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      CompositionCapability.read, async (cap) => this.composition.listLinks(cap, twinId, oneOf(p.state, LINK_STATES)));
    return { links: out.result, receipt: receipt(out) };
  }

  @Post('/links/declare')
  async declareLink(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateLinkIntake(body.payload ?? {}, envelope.correlation_id);
    const linkId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.link.declare', 'TWN', intake.downstreamTwinId), CompositionCapability.link,
      async (cap, scope) => {
        const r = await this.composition.declareLink(cap, scope, linkId, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: intake.downstreamTwinId, targetVersion: '0', outboxEvent: null };
      });
    return { link: out.result, receipt: receipt(out) };
  }

  @Post('/links/:linkId/retire')
  async retireLink(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('linkId') linkIdRaw: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const linkId = id(linkIdRaw, 'linkId', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.link.retire', 'TWL', linkId), CompositionCapability.link,
      async (cap, scope) => {
        const r = await this.composition.retireLink(cap, scope, linkId, reason, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWL', targetId: linkId, targetVersion: '1', outboxEvent: null };
      });
    return { link: out.result, receipt: receipt(out) };
  }

  // ── coupling ──────────────────────────────────────────────────────────────────────────
  @Post('/couplings/list')
  async listProposals(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { twinId?: string; state?: string } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = typeof p.twinId === 'string' ? id(p.twinId, 'twinId', envelope.correlation_id) : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      CompositionCapability.read, async (cap) => this.composition.listProposals(cap, twinId, oneOf(p.state, PROPOSAL_STATES)));
    return { proposals: out.result, receipt: receipt(out) };
  }

  @Post('/couplings/:proposalId/apply')
  async applyCoupling(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('proposalId') proposalIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const proposalId = id(proposalIdRaw, 'proposalId', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.coupling.apply', 'CPL', proposalId), CompositionCapability.coupling,
      async (cap, scope) => {
        const r = await this.composition.applyCoupling(cap, scope, proposalId, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'CPL', targetId: proposalId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { applied: out.result, receipt: receipt(out) };
  }

  @Post('/couplings/:proposalId/decline')
  async declineCoupling(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('proposalId') proposalIdRaw: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const proposalId = id(proposalIdRaw, 'proposalId', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.coupling.decline', 'CPL', proposalId), CompositionCapability.coupling,
      async (cap, scope) => {
        const r = await this.composition.declineCoupling(cap, scope, proposalId, reason, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'CPL', targetId: proposalId, targetVersion: '1', outboxEvent: null };
      });
    return { declined: out.result, receipt: receipt(out) };
  }
}
