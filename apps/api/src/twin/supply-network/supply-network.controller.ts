/**
 * CP-6 B29 §B (0092) — the supply-network routes: a version's analysis (the measures and the findings a scan would propose), the Supply
 * Chain Agent's proposals, the draft (the agent's — the route is the same governed write its scan makes; a person is refused at the PDP),
 * the owner's decision. Base: /v1/tenants/:tenantId/domains/:domainId/twin-supply-network. Same envelope, capabilities and receipts as the
 * twin routes; reads are `twin.read` (consequential, audited), each write its own exact action (the B29 PDP rules):
 *
 *   POST /twins/:twinId/analysis            twin.read
 *   POST /proposals/list                    twin.read
 *   POST /proposals/draft                   twin.proposal.draft    (the domain's active Supply Chain Agent, in its running supply scan)
 *   POST /proposals/:proposalId/decide      twin.proposal.decide   (the twin's owner: accepted | dismissed)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { SupplyNetworkCapability } from './supply-network.capabilities.js';
import { PROPOSAL_STATES, SupplyNetworkService, validateDecisionIntake } from './supply-network.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

@Controller('/v1/tenants/:tenantId/domains/:domainId/twin-supply-network')
export class SupplyNetworkController {
  constructor(private readonly pipeline: PipelineService, private readonly network: SupplyNetworkService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  @Post('/twins/:twinId/analysis')
  async analysis(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinIdRaw: string,
    @Body() body: { payload?: { version?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const twinId = id(twinIdRaw, 'twinId', envelope.correlation_id);
    const v = body.payload?.version;
    const version = Number.isInteger(v) && (v as number) >= 1 ? (v as number) : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      SupplyNetworkCapability.read, async (cap) => this.network.analysis(cap, twinId, version));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized twin matches'), 404);
    return { analysis: out.result, receipt: receipt(out) };
  }

  @Post('/proposals/list')
  async listProposals(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { twinId?: string; state?: string } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = p.twinId === undefined ? null : id(p.twinId, 'twinId', envelope.correlation_id);
    const state = typeof p.state === 'string' && (PROPOSAL_STATES as readonly string[]).includes(p.state) ? p.state : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId),
      SupplyNetworkCapability.read, async (cap) => this.network.listProposals(cap, twinId, state));
    return { proposals: out.result, receipt: receipt(out) };
  }

  /** The draft as a route: the agent's governed write (its scan makes the same one); anyone else is refused at the PDP, and at the port. */
  @Post('/proposals/draft')
  async draft(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const twinId = id(p['twinId'], 'twinId', envelope.correlation_id);
    const agentId = id(p['agentId'], 'agentId', envelope.correlation_id);
    const runId = id(p['runId'], 'runId', envelope.correlation_id);
    if (!Number.isInteger(p['version']) || Number(p['version']) < 1) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'version is the admitted version the findings were read from'), 422);
    if (!Array.isArray(p['findings']) || p['findings'].length === 0 || p['findings'].length > 50) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'findings is a list of 1 to 50 findings'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.proposal.draft', 'TWN', twinId), SupplyNetworkCapability.draft,
      async (cap, scope) => {
        const r = await cap.draft({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, twinId, version: Number(p['version']), findings: p['findings'] as unknown[],
          complete: p['complete'] === true, agentId, runId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(p['version']), outboxEvent: null };
      });
    return { draft: out.result, receipt: receipt(out) };
  }

  @Post('/proposals/:proposalId/decide')
  async decide(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('proposalId') proposalIdRaw: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const proposalId = id(proposalIdRaw, 'proposalId', envelope.correlation_id);
    const intake = validateDecisionIntake(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.proposal.decide', 'TWP', proposalId), SupplyNetworkCapability.decide,
      async (cap, scope) => {
        const r = await this.network.decide(cap, scope, proposalId, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWP', targetId: proposalId, targetVersion: '1', outboxEvent: null };
      });
    return { decision: out.result, receipt: receipt(out) };
  }
}
