/**
 * THE HTTP SURFACE OF SCENARIO SETS — CP-6 B27 part `sets` (migration 0097 §S; F-P4-08). Its OWN controller under
 * /prediction/scenarios/sets/… (prediction.controller.ts' routes are never edited; every route here is three or more segments below
 * /scenarios or a literal the scenario routes do not use, so none meets /scenarios/:scenarioId/<verb>). Every write is one governed write
 * whose port asserts the route's own action (an EXACT PDP rule, the B27 sets block); every read is a consequential read under
 * prediction.scenario.set.read. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../../shared/ids.js';
import { requireCorrelation } from '../../../shared/correlation.js';
import { PipelineService } from '../../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../../pipeline/http.js';
import { SetCapability } from './sets.capabilities.js';
import { SET_STATES, assertUuid, validateMember, validateProposal, validateReason, validateResolution, validateReview, validateSetDeclaration } from './sets.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const limitOf = (p: Row): number => (typeof p['limit'] === 'number' && Number.isFinite(p['limit']) ? Math.max(1, Math.min(200, Math.trunc(p['limit'] as number))) : 100);
const READ = 'prediction.scenario.set.read';

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction/scenarios/sets')
export class ScenarioSetsController {
  constructor(private readonly pipeline: PipelineService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /** DECLARE a set (a named human): the title, the purpose, the owner (default: the declarer), the package it serves, the plurality policy. */
  @Post('/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const d = validateSetDeclaration(body.payload ?? {}, envelope.correlation_id);
    const setId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.declare', 'SCS', setId), SetCapability.write,
      async (cap) => ({ result: await cap.declare({ setId, tenantId, domainId, title: d.title, purpose: d.purpose, owner: d.owner ?? principal.principalId, policy: d.policy, packageId: d.packageId, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SCS', targetId: setId, targetVersion: '1', outboxEvent: null }));
    return { set: out.result, receipt: receipt(out) };
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const state = typeof p['state'] === 'string' && (SET_STATES as readonly string[]).includes(p['state']) ? p['state'] : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SCS', null), SetCapability.read,
      async (cap) => ({ at: await cap.now(), sets: await cap.list({ state, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE PROPOSALS of the domain (open first) — creation triggers (V03-T-343). */
  @Post('/proposals/list')
  async proposals(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const state = typeof p['state'] === 'string' && ['open', 'accepted', 'dismissed'].includes(p['state']) ? p['state'] : null;
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SCP', null), SetCapability.read,
      async (cap) => ({ at: await cap.now(), proposals: await cap.proposals({ state, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** PROPOSE a scenario from a forecast shift, a weak signal, a risk or a planning cycle (the port validates the source; routed to the strategy owners). */
  @Post('/proposals/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateProposal(body.payload ?? {}, envelope.correlation_id);
    const proposalId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.proposal.propose', 'SCP', proposalId), SetCapability.write,
      async (cap) => ({ result: await cap.propose({ proposalId, tenantId, domainId, kind: p.kind, source: p.source, title: p.title, rationale: p.rationale, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SCP', targetId: proposalId, targetVersion: '1', outboxEvent: null }));
    return { proposal: out.result, receipt: receipt(out) };
  }

  /** RESOLVE a proposal (a strategy owner who did not propose it): accepted | dismissed with a note — accepting declares nothing. */
  @Post('/proposals/:proposalId/resolve')
  async resolve(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('proposalId') proposalId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(proposalId, 'proposal', envelope.correlation_id, 'scenario proposal');
    const r = validateResolution(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.proposal.resolve', 'SCP', proposalId), SetCapability.write,
      async (cap) => ({ result: await cap.resolve({ proposalId, tenantId, domainId, resolution: r.resolution, note: r.note, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SCP', targetId: proposalId, targetVersion: null, outboxEvent: null }));
    return { proposal: out.result, receipt: receipt(out) };
  }

  /** SCORE the living portfolio now (an operator's act beside the tick step `scenario-relevance`). */
  @Post('/relevance/score')
  async score(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.relevance.score', 'SCN', null), SetCapability.write,
      async (cap) => ({ result: await cap.scoreRelevance({ tenantId, domainId, trigger: 'operator', actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'SCN', targetId: null, targetVersion: null, outboxEvent: null }));
    return { relevance: out.result, receipt: receipt(out) };
  }

  /** THE SET: the row, its members, checks, bindings, reviews and ledger tail. */
  @Post('/:setId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SCS', setId), SetCapability.read,
      async (cap) => ({ at: await cap.now(), set: await cap.set(setId), relevance: await cap.relevance(setId) }));
    if (out.result.set === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `scenario set rejected (unknown_set): ${setId} is not a scenario set of this domain`), 404);
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE COMPARATOR (CAP-DS-02): the set's branches side by side with the plurality verdict. */
  @Post('/:setId/compare')
  async compare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, READ, 'SCS', setId), SetCapability.read,
      async (cap) => ({ comparison: await cap.compare(setId) }));
    if (out.result.comparison === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `scenario set rejected (unknown_set): ${setId} is not a scenario set of this domain`), 404);
    return { ...out.result, receipt: receipt(out) };
  }

  /** ADD a member: a scenario (every live branch of it) or one of its branches. */
  @Post('/:setId/members/add')
  async addMember(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    const m = validateMember(body.payload ?? {}, envelope.correlation_id);
    const memberId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.member', 'SCS', setId), SetCapability.write,
      async (cap) => {
        const r = await cap.changeMember({ setId, tenantId, domainId, memberId, scenarioId: m.scenarioId, branchId: m.branchId, remove: false, reason: null, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SCS', targetId: setId, targetVersion: String((r['set'] as Row | undefined)?.['version'] ?? ''), outboxEvent: null };
      });
    return { membership: out.result, receipt: receipt(out) };
  }

  /** REMOVE a member, with a reason. */
  @Post('/:setId/members/:memberId/remove')
  async removeMember(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string, @Param('memberId') memberId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    assertUuid(memberId, 'member', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, envelope.correlation_id, 'removal');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.member', 'SCS', setId), SetCapability.write,
      async (cap) => {
        const r = await cap.changeMember({ setId, tenantId, domainId, memberId, scenarioId: null, branchId: null, remove: true, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'SCS', targetId: setId, targetVersion: String((r['set'] as Row | undefined)?.['version'] ?? ''), outboxEvent: null };
      });
    return { membership: out.result, receipt: receipt(out) };
  }

  /** ACTIVATE (the owner): draft → active; the plurality check runs and a gap is flagged. */
  @Post('/:setId/activate')
  async activate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.activate', 'SCS', setId), SetCapability.write,
      async (cap) => ({ result: await cap.transition({ setId, tenantId, domainId, state: 'active', reason: null, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'SCS', targetId: setId, targetVersion: null, outboxEvent: null }));
    return { transition: out.result, receipt: receipt(out) };
  }

  /** RETIRE (the owner), with a reason — refused while the set gates a package in flight. */
  @Post('/:setId/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    const reason = validateReason(body.payload ?? {}, envelope.correlation_id, 'retirement');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.retire', 'SCS', setId), SetCapability.write,
      async (cap) => ({ result: await cap.transition({ setId, tenantId, domainId, state: 'retired', reason, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'SCS', targetId: setId, targetVersion: null, outboxEvent: null }));
    return { transition: out.result, receipt: receipt(out) };
  }

  /** CHECK the plurality now (recorded whatever the outcome). */
  @Post('/:setId/check')
  async check(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    const checkId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.check', 'SCS', setId), SetCapability.write,
      async (cap) => ({ result: await cap.check({ checkId, setId, tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'SCS', targetId: setId, targetVersion: null, outboxEvent: null }));
    return { check: out.result, receipt: receipt(out) };
  }

  /** BIND the set to a package (the package's owner): its versions are not proposed while the check fails (ADR-012). */
  @Post('/:setId/bind')
  async bind(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id);
    const packageId = assertUuid((body.payload ?? {})['packageId'], 'package', envelope.correlation_id);
    const bindingId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.bind', 'SCS', setId), SetCapability.write,
      async (cap) => ({ result: await cap.bind({ bindingId, setId, packageId, tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'SCS', targetId: setId, targetVersion: null, outboxEvent: null }));
    return { binding: out.result, receipt: receipt(out) };
  }

  /** THE PORTFOLIO REVIEW (a named human): relevance and consequence per member, the payoffs; robustness and regret computed by the port. */
  @Post('/:setId/review')
  async review(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('setId') setId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertUuid(setId, 'set', envelope.correlation_id, 'portfolio review');
    const r = validateReview(body.payload ?? {}, envelope.correlation_id);
    const reviewId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'prediction.scenario.set.review', 'SCS', setId), SetCapability.write,
      async (cap) => ({ result: await cap.review({ reviewId, setId, tenantId, domainId, members: r.members, options: r.options, payoffs: r.payoffs, unit: r.unit, retirements: r.retirements, note: r.note, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'SCS', targetId: setId, targetVersion: null, outboxEvent: null }));
    return { review: out.result, receipt: receipt(out) };
  }
}
