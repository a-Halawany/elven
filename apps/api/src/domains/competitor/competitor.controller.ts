/**
 * B33 §CI — the competitor intelligence routes (F-P4-15 ch.29; JRN-10; CAP-FW-06). Base: /v1/tenants/:tenantId/domains/:domainId/domain-competitors.
 * Same envelope, capabilities and receipts as the other routes; reads are `domain.competitor.read` (consequential, audited); each write its
 * own exact action (the B33 competitor PDP rules). Refusals answer in the ports' words (`competitor profile|comparison|assessment|watchlist
 * rejected (<class>): …`, mapped 403/404/409/422 by the B33 competitor rows).
 *
 *   POST /overview                               read       the competitors, heads, coverage, the package's functions, the agents
 *   POST /competitors/declare                    declare    bound to a graph organization entity (resolve)
 *   POST /competitors/:id/read                   read       the competitor: versions, events, assessments, proposals, alerts, items, challenges, uses, ledger
 *   POST /competitors/:id/as-of                  read       REPLAY: believed at knownAt (record time), held on effectiveOn (effective time)
 *   POST /competitors/:id/revalidate             revalidate identity / conflict / coverage re-judged (limited + routed when found)
 *   POST /competitors/:id/twin/bind              twin.bind  the competitor twin's owner binds it (CI8)
 *   POST /proposals/propose                      propose    a person's proposal (the agent proposes inside its scan)
 *   POST /proposals/:id/read                     read
 *   POST /proposals/:id/withdraw                 propose    the proposer
 *   POST /proposals/:id/decide                   assessment.approve   the named analyst: approved | declined, digest-bound (human-gated)
 *   POST /comparisons/list                       read
 *   POST /comparisons/basis                      compare    declare / re-declare a versioned comparison basis
 *   POST /comparisons/run                        compare    compare competitors on the active basis
 *   POST /watchlists/list                        read
 *   POST /watchlists/declare                     watchlist
 *   POST /watchlists/:id/retire                  watchlist
 *   POST /assessments/:id/challenge              challenge          an analyst's challenge (human-gated)
 *   POST /challenges/:id/decide                  challenge.decide   another analyst: upheld | dismissed (human-gated)
 *   POST /competitors/:id/decision-use           decision.cite      a decision package cites a profile version (human-gated)
 *   POST /twin-proposals/:id/decide              twin.decide        the twin's owner: applied (an admitted version) | declined (human-gated)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { CompetitorCapability } from './competitor.capabilities.js';
import { CompetitorService } from './competitor.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PKG = /^[a-z][a-z0-9-]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
type Payload = { payload?: Record<string, unknown> };

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
const bad = (c: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', c, msg), 422); };
const text = (v: unknown, min: number, max: number): string | null => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);

@Controller('/v1/tenants/:tenantId/domains/:domainId/domain-competitors')
export class CompetitorController {
  constructor(private readonly pipeline: PipelineService, private readonly competitors: CompetitorService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private who(scope: { tenantId: string | null; domainId: string | null }, actor: string, correlationId: string) {
    return { tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor, correlationId };
  }

  // ───────────────────────── reads ─────────────────────────
  @Post('/overview')
  async overview(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.read', 'DCI', null), CompetitorCapability.read,
      async (cap) => this.competitors.overview(cap, tenantId, domainId));
    return { overview: out.result, receipt: receipt(out) };
  }

  @Post('/competitors/:competitorId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('competitorId') raw: string) {
    const { envelope, principal } = ctx(req);
    const competitorId = id(raw, 'competitorId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.read', 'DCI', competitorId), CompetitorCapability.read,
      async (cap) => this.competitors.competitor(cap, tenantId, domainId, competitorId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized competitor matches'), 404);
    return { competitor: out.result, receipt: receipt(out) };
  }

  @Post('/competitors/:competitorId/as-of')
  async asOf(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('competitorId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const competitorId = id(raw, 'competitorId', envelope.correlation_id);
    const p = body.payload ?? {};
    const knownAt = p['knownAt'] === undefined || p['knownAt'] === null ? null
      : (typeof p['knownAt'] === 'string' && !Number.isNaN(Date.parse(p['knownAt'])) ? new Date(p['knownAt']).toISOString() : bad(envelope.correlation_id, 'knownAt is an instant (ISO 8601)'));
    const effectiveOn = p['effectiveOn'] === undefined || p['effectiveOn'] === null ? null
      : (typeof p['effectiveOn'] === 'string' && DAY.test(p['effectiveOn']) ? p['effectiveOn'] : bad(envelope.correlation_id, 'effectiveOn is a day (YYYY-MM-DD)'));
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.read', 'DCI', competitorId), CompetitorCapability.read,
      async (cap) => this.competitors.asOf(cap, competitorId, knownAt, effectiveOn));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized competitor matches'), 404);
    return { replay: out.result, receipt: receipt(out) };
  }

  @Post('/proposals/:proposalId/read')
  async readProposal(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('proposalId') raw: string) {
    const { envelope, principal } = ctx(req);
    const proposalId = id(raw, 'proposalId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.read', 'DCP', proposalId), CompetitorCapability.read,
      async (cap) => this.competitors.proposal(cap, proposalId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized proposal matches'), 404);
    return { proposal: out.result, receipt: receipt(out) };
  }

  @Post('/comparisons/list')
  async listComparisons(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.read', 'DCC', null), CompetitorCapability.read,
      async (cap) => this.competitors.comparisons(cap));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/watchlists/list')
  async listWatchlists(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.read', 'DCW', null), CompetitorCapability.read,
      async (cap) => this.competitors.watchlists(cap));
    return { watchlists: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── writes ─────────────────────────
  @Post('/competitors/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const entityId = id(p['entityId'], 'entityId', envelope.correlation_id);
    const owner = id(p['ownerPrincipalId'], 'ownerPrincipalId', envelope.correlation_id);
    const packageKey = typeof p['packageKey'] === 'string' && PKG.test(p['packageKey']) ? p['packageKey'] : bad(envelope.correlation_id, 'packageKey names the competitor package');
    const name = text(p['name'], 2, 200) ?? bad(envelope.correlation_id, 'name is 2–200 characters');
    const competitorId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.declare', 'DCI', competitorId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.declare({ ...this.who(scope, principal.principalId, envelope.correlation_id), competitorId, packageKey, entityId, name, owner }),
                               targetType: 'DCI', targetId: competitorId, targetVersion: '1', outboxEvent: null }));
    return { competitor: out.result, receipt: receipt(out) };
  }

  @Post('/proposals/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const competitorId = id(p['competitorId'], 'competitorId', envelope.correlation_id);
    const content = p['content'];
    if (content === null || typeof content !== 'object' || Array.isArray(content)) bad(envelope.correlation_id, 'content is {effective_from, events[], changes[], interpretation?}');
    const proposalId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.propose', 'DCP', proposalId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.propose({ ...this.who(scope, principal.principalId, envelope.correlation_id), proposalId, competitorId, content: content as Record<string, unknown>,
                                                         agentId: null, runId: null }), targetType: 'DCP', targetId: proposalId, targetVersion: '1', outboxEvent: null }));
    return { proposal: out.result, receipt: receipt(out) };
  }

  @Post('/proposals/:proposalId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('proposalId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const proposalId = id(raw, 'proposalId', envelope.correlation_id);
    const reason = text(body.payload?.['reason'], 8, 2000) ?? bad(envelope.correlation_id, 'a withdrawal says why (reason, 8–2000 characters)');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.propose', 'DCP', proposalId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.withdraw({ ...this.who(scope, principal.principalId, envelope.correlation_id), proposalId, reason }),
                               targetType: 'DCP', targetId: proposalId, targetVersion: null, outboxEvent: null }));
    return { proposal: out.result, receipt: receipt(out) };
  }

  @Post('/proposals/:proposalId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('proposalId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const proposalId = id(raw, 'proposalId', envelope.correlation_id);
    const p = body.payload ?? {};
    if (p['decision'] !== 'approved' && p['decision'] !== 'declined') bad(envelope.correlation_id, 'decision is approved or declined');
    const digest = typeof p['digest'] === 'string' && /^[0-9a-f]{64}$/.test(p['digest']) ? p['digest'] : bad(envelope.correlation_id, 'digest names the proposal content the decision is bound to');
    const reason = text(p['reason'], 1, 2000);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.assessment.approve', 'DCP', proposalId), CompetitorCapability.write,
      async (cap, scope) => {
        const r = await this.competitors.decide(cap, scope, principal, proposalId, p['decision'] as 'approved' | 'declined', digest, reason, envelope.correlation_id);
        return { result: r, targetType: 'DCP', targetId: proposalId, targetVersion: r['version'] === undefined ? null : String(r['version']), outboxEvent: null };
      });
    return { decision: out.result, receipt: receipt(out) };
  }

  @Post('/competitors/:competitorId/revalidate')
  async revalidate(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('competitorId') raw: string) {
    const { envelope, principal } = ctx(req);
    const competitorId = id(raw, 'competitorId', envelope.correlation_id);
    const r = await this.competitors.revalidate(envelope, principal, tenantId, domainId, competitorId, envelope.correlation_id);
    return { revalidation: r, receipt: r['receipt'] };
  }

  @Post('/comparisons/basis')
  async basis(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const packageKey = typeof p['packageKey'] === 'string' && PKG.test(p['packageKey']) ? p['packageKey'] : bad(envelope.correlation_id, 'packageKey names the competitor package');
    const basisKey = typeof p['basisKey'] === 'string' ? p['basisKey'] : bad(envelope.correlation_id, 'basisKey names the comparison basis');
    const title = typeof p['title'] === 'string' ? p['title'] : '';
    const metrics = Array.isArray(p['metrics']) ? p['metrics'] : bad(envelope.correlation_id, 'metrics is [{key, fact_kind, definition, unit, period, population}]');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.compare', 'DCB', null), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.declareBasis({ ...this.who(scope, principal.principalId, envelope.correlation_id), packageKey, basisKey, title, metrics }),
                               targetType: 'DCB', targetId: null, targetVersion: null, outboxEvent: null }));
    return { basis: out.result, receipt: receipt(out) };
  }

  @Post('/comparisons/run')
  async compare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const basisKey = typeof p['basisKey'] === 'string' ? p['basisKey'] : bad(envelope.correlation_id, 'basisKey names the comparison basis');
    const ids = Array.isArray(p['competitorIds']) ? (p['competitorIds'] as unknown[]).map((x) => id(x, 'competitorIds[]', envelope.correlation_id)) : bad(envelope.correlation_id, 'competitorIds lists the competitors compared');
    const comparisonId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.compare', 'DCC', comparisonId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.compare({ ...this.who(scope, principal.principalId, envelope.correlation_id), comparisonId, basisKey, competitorIds: ids }),
                               targetType: 'DCC', targetId: comparisonId, targetVersion: '1', outboxEvent: null }));
    return { comparison: out.result, receipt: receipt(out) };
  }

  @Post('/watchlists/declare')
  async declareWatchlist(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const packageKey = typeof p['packageKey'] === 'string' && PKG.test(p['packageKey']) ? p['packageKey'] : bad(envelope.correlation_id, 'packageKey names the competitor package');
    const owner = id(p['ownerPrincipalId'], 'ownerPrincipalId', envelope.correlation_id);
    const ids = Array.isArray(p['competitorIds']) ? (p['competitorIds'] as unknown[]).map((x) => id(x, 'competitorIds[]', envelope.correlation_id)) : [];
    const rules = Array.isArray(p['rules']) ? p['rules'] : bad(envelope.correlation_id, 'rules is [{rule_key, title?, event_kinds[], fact_kinds[], markets[]}]');
    const freshnessDays = Number.isInteger(p['freshnessDays']) ? (p['freshnessDays'] as number) : 30;
    const watchlistId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.watchlist', 'DCW', watchlistId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.declareWatchlist({ ...this.who(scope, principal.principalId, envelope.correlation_id), watchlistId, packageKey,
                                 title: typeof p['title'] === 'string' ? p['title'] : '', owner, competitorIds: ids, rules, freshnessDays }),
                               targetType: 'DCW', targetId: watchlistId, targetVersion: '1', outboxEvent: null }));
    return { watchlist: out.result, receipt: receipt(out) };
  }

  @Post('/watchlists/:watchlistId/retire')
  async retireWatchlist(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('watchlistId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const watchlistId = id(raw, 'watchlistId', envelope.correlation_id);
    const reason = typeof body.payload?.['reason'] === 'string' ? (body.payload['reason'] as string) : '';
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.watchlist', 'DCW', watchlistId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.retireWatchlist({ ...this.who(scope, principal.principalId, envelope.correlation_id), watchlistId, reason }),
                               targetType: 'DCW', targetId: watchlistId, targetVersion: null, outboxEvent: null }));
    return { watchlist: out.result, receipt: receipt(out) };
  }

  @Post('/assessments/:assessmentId/challenge')
  async challenge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('assessmentId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const assessmentId = id(raw, 'assessmentId', envelope.correlation_id);
    const p = body.payload ?? {};
    const proposed = p['proposed'] !== null && typeof p['proposed'] === 'object' && !Array.isArray(p['proposed']) ? p['proposed'] as Record<string, unknown> : {};
    const challengeId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.challenge', 'DCH', challengeId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.challenge({ ...this.who(scope, principal.principalId, envelope.correlation_id), challengeId, assessmentId,
                                                             reason: typeof p['reason'] === 'string' ? p['reason'] : '', proposed }),
                               targetType: 'DCH', targetId: challengeId, targetVersion: '1', outboxEvent: null }));
    return { challenge: out.result, receipt: receipt(out) };
  }

  @Post('/challenges/:challengeId/decide')
  async decideChallenge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('challengeId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const challengeId = id(raw, 'challengeId', envelope.correlation_id);
    const p = body.payload ?? {};
    if (p['decision'] !== 'upheld' && p['decision'] !== 'dismissed') bad(envelope.correlation_id, 'decision is upheld or dismissed');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.challenge.decide', 'DCH', challengeId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.decideChallenge({ ...this.who(scope, principal.principalId, envelope.correlation_id), challengeId, decision: p['decision'] as 'upheld' | 'dismissed',
                                                                   reason: typeof p['reason'] === 'string' ? p['reason'] : '' }),
                               targetType: 'DCH', targetId: challengeId, targetVersion: null, outboxEvent: null }));
    return { challenge: out.result, receipt: receipt(out) };
  }

  @Post('/competitors/:competitorId/decision-use')
  async cite(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('competitorId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const competitorId = id(raw, 'competitorId', envelope.correlation_id);
    const p = body.payload ?? {};
    const packageId = id(p['packageId'], 'packageId', envelope.correlation_id);
    const version = Number.isInteger(p['version']) && (p['version'] as number) >= 1 ? (p['version'] as number) : bad(envelope.correlation_id, 'version names the cited profile version');
    const useId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.decision.cite', 'DCU', useId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.citeInDecision({ ...this.who(scope, principal.principalId, envelope.correlation_id), useId, competitorId, version, packageId,
                                                                  note: typeof p['note'] === 'string' ? p['note'] : '' }),
                               targetType: 'DCU', targetId: useId, targetVersion: '1', outboxEvent: null }));
    return { use: out.result, receipt: receipt(out) };
  }

  @Post('/competitors/:competitorId/twin/bind')
  async bindTwin(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('competitorId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const competitorId = id(raw, 'competitorId', envelope.correlation_id);
    const twinId = id(body.payload?.['twinId'], 'twinId', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.twin.bind', 'DCI', competitorId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.bindTwin({ ...this.who(scope, principal.principalId, envelope.correlation_id), competitorId, twinId }),
                               targetType: 'DCI', targetId: competitorId, targetVersion: null, outboxEvent: null }));
    return { binding: out.result, receipt: receipt(out) };
  }

  @Post('/twin-proposals/:proposalId/decide')
  async decideTwin(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('proposalId') raw: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const proposalId = id(raw, 'proposalId', envelope.correlation_id);
    const p = body.payload ?? {};
    if (p['decision'] !== 'applied' && p['decision'] !== 'declined') bad(envelope.correlation_id, 'decision is applied or declined');
    const version = Number.isInteger(p['version']) ? (p['version'] as number) : null;
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.twin.decide', 'DCT', proposalId), CompetitorCapability.write,
      async (cap, scope) => ({ result: await cap.decideTwin({ ...this.who(scope, principal.principalId, envelope.correlation_id), proposalId, decision: p['decision'] as 'applied' | 'declined',
                                                              version, note: typeof p['note'] === 'string' ? p['note'] : null }),
                               targetType: 'DCT', targetId: proposalId, targetVersion: version === null ? null : String(version), outboxEvent: null }));
    return { proposal: out.result, receipt: receipt(out) };
  }
}
