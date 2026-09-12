/**
 * Graph API — the surface the Search, Entities, Resolutions, Graph, Strategy and
 * Impact screens render.
 *
 * The same rules Phases 1 and 2 hold to: a route returns the state the SERVER
 * committed with its receipt, never a prediction; and a denied object answers
 * exactly as an absent one does, so the API cannot be used as an existence oracle.
 *
 * A third rule is Phase 3's own: EVERY answer about the graph carries the INSTANT
 * it is an answer for. `knownAt` and `validAt` are on the response, not implied by
 * the request, so a reader can never mistake a hindsight view for a contemporary
 * one.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { GraphCapability } from './graph.capabilities.js';
import { GraphOrchestrator } from './graph.orchestrator.js';
import { EntitiesService } from './entities/entities.service.js';
import { ResolutionService } from './entities/resolution.service.js';
import { EdgesService, MAX_EDGES, nowAsOf, type AsOf } from './edges/edges.service.js';
import { StrategyService, validateStrategy } from './strategy/strategy.service.js';
import { ImpactService } from './strategy/impact.service.js';
import { SearchService } from './search/search.service.js';
import { PropagationAgentsService } from './propagation/propagation-agents.service.js';
import { graphChangedEvent } from './subscriptions/change-events.js';
import { SubscriptionsService, type RegisterSubscriptionIntake } from './subscriptions/subscriptions.service.js';
import { EMPTY_REACH, type ReachedObjects } from './subscriptions/graph-change.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  }
  return { envelope, principal };
}

const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({
  policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq,
});

/**
 * Both instants, always both, and stated in the answer.
 *
 * A caller that supplies neither gets `now` for both — never a silent mix of
 * "believed now" and "held then", which is the shape of a hindsight answer.
 */
function asOfFrom(p: { knownAt?: string; validAt?: string } | undefined): AsOf {
  const now = nowAsOf();
  const parse = (v: string | undefined, fallback: string): string => {
    if (typeof v !== 'string') return fallback;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  };
  return {
    knownAt: parse(p?.knownAt, now.knownAt),
    validAt: parse(p?.validAt, p?.knownAt === undefined ? now.validAt : parse(p.knownAt, now.validAt)),
  };
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/graph')
export class GraphController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly orchestrator: GraphOrchestrator,
    private readonly entities: EntitiesService,
    private readonly resolutions: ResolutionService,
    private readonly edges: EdgesService,
    private readonly strategy: StrategyService,
    private readonly impact: ImpactService,
    private readonly search: SearchService,
    private readonly propagationAgents: PropagationAgentsService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  private route(tenantId: string, domainId: string, action: string,
                objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── search ─────────────────────────

  @Post('/search')
  async searchAll(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { query?: string; limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const query = body.payload?.query ?? '';
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'SRC', null),
      GraphCapability.read,
      async (cap) => this.search.search(cap, query, body.payload?.limit ?? 50));
    return { search: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── entities ─────────────────────────

  @Post('/entities/list')
  async listEntities(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'ENT', null),
      GraphCapability.read,
      async (cap) => {
        const rows = await this.entities.list(cap, body.payload?.limit ?? 200);
        const accepted = (await cap.readResolutions().selectAll()
          .where('state' as never, '=', 'accepted' as never)
          .execute()) as Array<Record<string, unknown>>;
        const counts = new Map<string, number>();
        for (const r of accepted) {
          const id = String(r['entity_id']);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        return rows.map((e) => ({ ...e, mention_count: counts.get(String(e['entity_id'])) ?? 0 }));
      });
    return { entities: out.result, receipt: receipt(out) };
  }

  @Post('/entities/:entityId/get')
  async getEntity(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('entityId') entityId: string,
    @Body() body: { payload?: { knownAt?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const knownAt = body.payload?.knownAt;
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'ENT', entityId),
      GraphCapability.read,
      async (cap) => {
        const entity = await this.entities.get(cap, entityId);
        if (entity === undefined) return null;
        const resolutions = await this.entities.resolutions(cap, entityId);
        const live = knownAt === undefined
          ? resolutions.filter((r) => r['state'] === 'accepted')
          : await this.entities.mentionsKnownAt(cap, entityId, knownAt);
        // THE CUTOFF TRAVELS. Selecting the mentions current at an instant and then
        // fetching the LATEST version of each claim behind them is hindsight with
        // extra steps — the service takes the cutoff, so the endpoint gives it one.
        const claims = await this.entities.claimsFor(
          cap, live.map((r) => String(r['claim_object_id'])), knownAt);
        return {
          entity,
          identifiers: await this.entities.identifiers(cap, entityId),
          events: await this.entities.events(cap, entityId),
          resolutions,
          mentions: live,
          claims,
          knownAt: knownAt ?? null,
        };
      });
    if (out.result === null) {
      // A denied entity answers exactly as an absent one does.
      throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id,
        'no authorized entity matches'), 404);
    }
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/entities/resolve')
  async resolve(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number; methodId?: string | null } },
  ) {
    const { envelope, principal } = ctx(req);
    const outcome = await this.orchestrator.runResolution({
      envelope, principal, tenantId, domainId,
      limit: Math.min(body.payload?.limit ?? 100, 500),
      // Absent a method the gateway is never reached and the ambiguous tail goes
      // to the queue on deterministic evidence alone.
      methodId: typeof body.payload?.methodId === 'string' ? body.payload.methodId : null,
    });
    return { resolution: outcome };
  }

  @Post('/entities/identifier-systems/register')
  async registerSystem(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: {
      systemKey?: string; authority?: string; description?: string; isAuthoritative?: boolean } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.systemKey !== 'string' || !/^[a-z0-9][a-z0-9_.:-]{1,63}$/.test(p.systemKey)) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'systemKey must be a lowercase key of 2 to 64 characters'), 400);
    }
    if (typeof p.authority !== 'string' || p.authority.trim().length < 2) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'authority is required: an identifier system with no issuing authority is not authoritative'), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.entity.create', 'IDS', null),
      GraphCapability.resolver,
      async (cap, scope) => {
        await cap.registerIdentifierSystem({
          tenantId: scope.tenantId as string, domainId: scope.domainId as string,
          systemKey: p.systemKey as string, authority: p.authority as string,
          description: p.description ?? '', isAuthoritative: p.isAuthoritative === true,
          actor: principal.principalId, correlationId: envelope.correlation_id,
        });
        return { result: { systemKey: p.systemKey }, targetType: 'IDS',
                 targetId: null, targetVersion: '1', outboxEvent: null };
      });
    return { identifierSystem: out.result, receipt: receipt(out) };
  }

  @Post('/entities/identifier-systems/list')
  async listSystems(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'IDS', null),
      GraphCapability.read,
      async (cap) => (await cap.readIdentifierSystems().selectAll()
        .orderBy('system_key' as never).execute()) as Array<Record<string, unknown>>);
    return { identifierSystems: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── resolution queue ─────────────────────────

  @Post('/resolutions/queue')
  async queue(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'RES', null),
      GraphCapability.read,
      async (cap) => {
        const rows = await this.resolutions.queue(cap, body.payload?.limit ?? 200);
        const entities = await this.entities.list(cap, 1_000);
        const byId = new Map(entities.map((e) => [String(e['entity_id']), e]));
        return rows.map((r) => ({
          ...r, entity: byId.get(String(r['entity_id'])) ?? null,
        }));
      });
    return { queue: out.result, receipt: receipt(out) };
  }

  @Post('/resolutions/:resolutionId/get')
  async getResolution(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('resolutionId') resolutionId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'RES', resolutionId),
      GraphCapability.read,
      async (cap) => {
        const r = await this.resolutions.get(cap, resolutionId);
        if (r === undefined) return null;
        const claims = await this.entities.claimsFor(cap, [String(r['claim_object_id'])]);
        return {
          resolution: r,
          events: await this.resolutions.events(cap, resolutionId),
          entity: await this.entities.get(cap, String(r['entity_id'])),
          claim: claims[0] ?? null,
        };
      });
    if (out.result === null) {
      throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id,
        'no authorized resolution matches'), 404);
    }
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/resolutions/:resolutionId/decide')
  async decide(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('resolutionId') resolutionId: string,
    @Body() body: { payload?: {
      decision?: 'accept' | 'reject'; reason?: string; targetEntityId?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (p.decision !== 'accept' && p.decision !== 'reject') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        "decision must be 'accept' or 'reject'"), 400);
    }
    if (typeof p.reason !== 'string' || p.reason.trim().length < 8) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'a resolution decision needs a reason of at least 8 characters'), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.resolution.decide', 'RES', resolutionId),
      GraphCapability.decision,
      async (cap, scope) => {
        const r = await this.resolutions.decide(cap, scope, {
          decision: { resolutionId, decision: p.decision as 'accept' | 'reject',
                      reason: p.reason as string,
                      targetEntityId: typeof p.targetEntityId === 'string'
                        ? p.targetEntityId : null },
          decider: principal.principalId, correlationId: envelope.correlation_id,
        });
        if (r.state !== 'accepted') {
          return { result: r, targetType: 'RES', targetId: resolutionId, targetVersion: '1', outboxEvent: null };
        }
        // GraphChanged (B6): the accepted resolution, its claim and entity, and what rests on them — in this transaction.
        const row = (await cap.readResolutions().selectAll().where('resolution_id' as never, '=', resolutionId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
        const entityId = String(row?.['entity_id'] ?? p.targetEntityId ?? ''); const claimId = String(row?.['claim_object_id'] ?? '');
        const changed = await graphChangedEvent(cap, this.impact, {
          tenantId, domainId, kind: 'entity.resolved',
          identities: entityId === '' ? [] : [{ entity_id: entityId, role: 'resolved_to' }],
          resolutions: row === undefined ? [] : [{ resolution_id: resolutionId, state: 'accepted', claim_object_id: claimId, claim_version: Number(row['claim_version']), entity_id: entityId }],
          reach: claimId === '' ? null : { kind: 'claim', id: claimId },
          cause: { action: 'graph.resolution.decide', actor: principal.principalId, target_type: 'RES', target_id: resolutionId },
        });
        return { result: r, targetType: 'RES', targetId: resolutionId, targetVersion: '1',
                 outboxEvent: {
                   eventType: 'EntityResolved',
                   payload: { resolution_id: resolutionId, decided_by: principal.principalId },
                 },
                 outboxEvents: [changed] };
      });
    return { resolution: out.result, receipt: receipt(out) };
  }

  @Post('/entities/:entityId/split')
  async split(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('entityId') entityId: string,
    @Body() body: { payload?: {
      resolutionIds?: string[]; canonicalName?: string; entityType?: string; reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (!Array.isArray(p.resolutionIds) || p.resolutionIds.length === 0) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'a split must name the resolutions it moves'), 400);
    }
    if (typeof p.canonicalName !== 'string' || p.canonicalName.trim().length < 1) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'the new entity needs a name'), 400);
    }
    if (typeof p.reason !== 'string' || p.reason.trim().length < 8) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'a split needs a reason of at least 8 characters'), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.entity.split', 'ENT', entityId),
      GraphCapability.split,
      async (cap, scope) => {
        const r = await this.resolutions.split(cap, scope, {
          fromEntityId: entityId, resolutionIds: p.resolutionIds as string[],
          entityType: p.entityType ?? 'other', canonicalName: p.canonicalName as string,
          decider: principal.principalId, reason: p.reason as string,
          correlationId: envelope.correlation_id,
        });
        // GraphChanged (B6): origin and successor identities, the resolutions that moved, and what rests on the origin.
        const moved = (await cap.readResolutions().selectAll().where('entity_id' as never, '=', r.newEntityId as never).execute()) as Array<Record<string, unknown>>;
        const changed = await graphChangedEvent(cap, this.impact, {
          tenantId, domainId, kind: 'entity.split',
          identities: [{ entity_id: entityId, role: 'origin' }, { entity_id: r.newEntityId, role: 'successor', split_from: entityId }],
          resolutions: moved.map((m) => ({ resolution_id: String(m['resolution_id']), state: String(m['state']), claim_object_id: String(m['claim_object_id']), claim_version: Number(m['claim_version']), entity_id: r.newEntityId })),
          reach: { kind: 'entity', id: entityId },
          cause: { action: 'graph.entity.split', actor: principal.principalId, target_type: 'ENT', target_id: entityId },
        });
        return { result: r, targetType: 'ENT', targetId: r.newEntityId, targetVersion: '1',
                 outboxEvent: { eventType: 'EntitySplit',
                                payload: { from: entityId, to: r.newEntityId, moved: r.moved } },
                 outboxEvents: [changed] };
      });
    return { split: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── graph retrieval ─────────────────────────

  @Post('/edges/build')
  async buildEdges(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const outcome = await this.orchestrator.runEdgeBuild({
      envelope, principal, tenantId, domainId,
      limit: Math.min(body.payload?.limit ?? 200, 500),
    });
    return { edgeBuild: outcome };
  }

  @Post('/edges/list')
  async listEdges(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { knownAt?: string; validAt?: string; limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const at = asOfFrom(body.payload);
    const limit = Math.max(1, Math.min(Number(body.payload?.limit ?? MAX_EDGES) || MAX_EDGES, MAX_EDGES));
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'EDG', null),
      GraphCapability.read,
      async (cap) => this.edges.list(cap, at, limit));
    const { edges, total, complete } = out.result;
    /*
     * ACCURATE COUNTS, DISCLOSED TRUNCATION.
     *
     * `total` is the number of edges eligible at this instant — not the size of
     * some other read. When the page is smaller than that, the answer says so in
     * words as well as in `complete`, so a screen has nothing to infer.
     */
    return {
      edges, total, returned: edges.length, limit, complete, asOf: at,
      note: complete ? null
        : `${edges.length} of ${total} eligible edge(s) are shown; the listing is bounded at `
          + `${limit} and the remaining ${total - edges.length} were not returned`,
      receipt: receipt(out),
    };
  }

  @Post('/edges/:edgeId/retract')
  async retractEdge(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('edgeId') edgeId: string,
    @Body() body: { payload?: { reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const reason = body.payload?.reason ?? '';
    if (reason.trim().length < 8) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'a retraction needs a reason of at least 8 characters'), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.edge.retract', 'EDG', edgeId),
      GraphCapability.edgeRetraction,
      async (cap, scope) => {
        const r = await this.edges.retract(cap, scope, {
          edgeId, actor: principal.principalId, reason,
          correlationId: envelope.correlation_id });
        // GraphChanged (B6): the retracted edge with its intervals, both ends, and what rests on the edge.
        const row = (await cap.readEdges().selectAll().where('edge_id' as never, '=', edgeId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
        const changed = await graphChangedEvent(cap, this.impact, {
          tenantId, domainId, kind: 'edge.retracted',
          identities: row === undefined ? [] : [{ entity_id: String(row['subject_entity_id']), role: 'subject' }, { entity_id: String(row['object_entity_id']), role: 'object' }],
          edges: [{ edge_id: edgeId, state: 'retracted' }],
          reach: { kind: 'edge', id: edgeId },
          validFrom: row === undefined ? null : new Date(String(row['valid_from'])).toISOString(),
          validTo: row?.['valid_to'] == null ? null : new Date(String(row['valid_to'])).toISOString(),
          cause: { action: 'graph.edge.retract', actor: principal.principalId, target_type: 'EDG', target_id: edgeId },
        });
        return { result: r, targetType: 'EDG', targetId: edgeId, targetVersion: '1',
                 outboxEvent: changed };
      });
    return { edge: out.result, receipt: receipt(out) };
  }

  @Post('/neighbourhood')
  async neighbourhood(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: {
      entityId?: string; depth?: number; knownAt?: string; validAt?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const entityId = body.payload?.entityId;
    if (typeof entityId !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'entityId is required'), 400);
    }
    const at = asOfFrom(body.payload);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'EDG', entityId),
      GraphCapability.read,
      async (cap) => {
        const n = await this.edges.neighbourhood(cap, entityId, body.payload?.depth ?? 2, at);
        const entities = await this.entities.list(cap, 1_000);
        const byId = new Map(entities.map((e) => [String(e['entity_id']), e]));
        return {
          edges: n.edges,
          entities: n.entityIds.map((id) => byId.get(id) ?? null).filter((x) => x !== null),
          complete: n.complete, searchedDepth: n.searchedDepth,
          depthClamped: n.depthClamped, beyondDepth: n.beyondDepth,
        };
      });
    const n = out.result;
    /*
     * SCOPED TO THE DEPTH IT SEARCHED. A neighbourhood is "everything within N
     * hops" by definition, so depth is its scope rather than a defect — but the
     * scope is stated, a clamped request is named, and entities lying beyond it
     * are reported rather than left to be assumed absent. Scan incompleteness is
     * a defect in the answer and is reported as one.
     */
    const notes: string[] = [];
    if (!n.complete) {
      notes.push('this neighbourhood was built from an incomplete scan; edges beyond the bound '
        + 'were not examined and the answer may be missing eligible relationships');
    }
    if (n.depthClamped) {
      notes.push(`the requested depth was reduced to the bound of ${n.searchedDepth} hop(s)`);
    }
    return {
      neighbourhood: n, asOf: at, complete: n.complete,
      searchedDepth: n.searchedDepth, beyondDepth: n.beyondDepth,
      scope: `everything within ${n.searchedDepth} hop(s) of the entity`
        + (n.beyondDepth ? '; further entities lie beyond that depth and are not included'
                         : '; nothing visible lies beyond that depth'),
      note: notes.length === 0 ? null : notes.join('. '),
      receipt: receipt(out),
    };
  }

  @Post('/path')
  async path(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: {
      from?: string; to?: string; knownAt?: string; validAt?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const from = body.payload?.from; const to = body.payload?.to;
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'from and to are required'), 400);
    }
    const at = asOfFrom(body.payload);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'EDG', null),
      GraphCapability.read,
      async (cap) => this.edges.path(cap, from, to, at));
    const { path, complete, searchedDepth, bound } = out.result;
    /*
     * A BOUNDED SEARCH MAY NOT CLAIM DEFINITIVE ABSENCE — AND AN INCOMPLETE
     * ANSWER ALWAYS SAYS SO, FOUND OR NOT.
     *
     * "No path exists" is a statement about the world. A search that did not
     * examine every eligible edge, or that stopped at its depth with entities
     * still ahead, has not earned it and says the weaker, true thing instead. A
     * FOUND path from an incomplete scan previously carried `note: null`, which a
     * screen read as "nothing to say"; the note is now present whenever the
     * answer is incomplete, independent of whether a path was found.
     */
    const notes: string[] = [];
    if (path !== null) {
      if (!complete) {
        notes.push('a path was found, but the search did not examine every eligible edge, so '
          + 'a shorter path may exist among the edges it did not see');
      }
    } else if (complete) {
      notes.push('no path exists in what this principal may see at this instant');
    } else {
      if (bound.depth) {
        notes.push(`no path of at most ${searchedDepth} hop(s) was found; entities beyond that `
          + 'depth were not searched');
      }
      if (bound.scan) {
        notes.push('no path was FOUND, and the search did not examine every eligible edge');
      }
      notes.push('this is not a statement that no path exists');
    }
    return {
      path, asOf: at, complete, searchedDepth, bound,
      note: notes.length === 0 ? null : notes.join(' — '),
      receipt: receipt(out),
    };
  }

  // ───────────────────────── strategy graph ─────────────────────────

  @Post('/strategy/declare')
  async declare(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const intake = validateStrategy((body.payload ?? {}) as never, envelope.correlation_id);
    // THE OBJECT THIS OPERATION WILL WRITE IS DECLARED BEFORE THE CAPABILITY IS
    // MINTED. An id invented inside the handler could not have been declared, and
    // the database refuses it.
    const objectId = newId();
    const out = await this.pipeline.write(
      envelope, principal,
      { ...this.route(tenantId, domainId, 'graph.strategy.declare', intake.objectType, objectId),
        writableTargets: [objectId] },
      GraphCapability.strategy,
      async (cap, scope) => {
        const r = await this.strategy.declare(cap, scope, {
          objectId, intake, owner: principal.principalId, actor: principal.principalId,
          correlationId: envelope.correlation_id,
          purposeId: envelope.purpose_id ?? 'graph',
        });
        // GraphChanged (B6): the declared object, the entities it rests on and its dependencies; the object is its own reach.
        const restsOnEntities = intake.restsOn.filter((x) => x.kind === 'entity').map((x) => ({ entity_id: x.id, role: 'rests_on' }));
        const own: ReachedObjects = { ...EMPTY_REACH };
        const bucket = ({ ASU: 'assumptions', OBJ: 'objectives', DEC: 'decisions', CMT: 'commitments' } as Record<string, keyof ReachedObjects | undefined>)[intake.objectType];
        if (bucket !== undefined) (own as unknown as Record<string, string[]>)[bucket] = [objectId];
        own.claims = intake.restsOn.filter((x) => x.kind === 'claim').map((x) => x.id);
        const changed = await graphChangedEvent(cap, this.impact, {
          tenantId, domainId, kind: 'strategy.declared',
          identities: restsOnEntities,
          dependencies: intake.restsOn.map((x) => ({ dependent_object_id: objectId, dependent_type: intake.objectType, depends_on_kind: x.kind, depends_on_id: x.id })),
          reach: { reach: own },
          cause: { action: 'graph.strategy.declare', actor: principal.principalId, target_type: intake.objectType, target_id: objectId },
        });
        return { result: r, targetType: intake.objectType, targetId: objectId,
                 targetVersion: '1', outboxEvent: changed };
      });
    return { strategy: out.result, receipt: receipt(out) };
  }

  @Post('/strategy/list')
  async listStrategy(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'OBJ', null),
      GraphCapability.read,
      async (cap) => {
        const rows = await this.strategy.list(cap, body.payload?.limit ?? 200);
        const deps = (await cap.readDependencies().selectAll()
          .where('state' as never, '=', 'active' as never)
          .execute()) as Array<Record<string, unknown>>;
        return rows.map((s) => ({
          ...s,
          dependencies: deps.filter(
            (d) => String(d['dependent_object_id']) === String(s['strategy_object_id'])),
        }));
      });
    return { strategy: out.result, receipt: receipt(out) };
  }

  @Post('/strategy/:objectId/get')
  async getStrategy(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('objectId') objectId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'OBJ', objectId),
      GraphCapability.read,
      async (cap) => {
        const s = await this.strategy.get(cap, objectId);
        if (s === undefined) return null;
        return {
          object: s,
          events: await this.strategy.events(cap, objectId),
          dependencies: await this.strategy.dependencies(cap, objectId),
        };
      });
    if (out.result === null) {
      throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id,
        'no authorized strategy object matches'), 404);
    }
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── impact ─────────────────────────

  /** What WOULD this affect? A read, so a person can look before committing. */
  @Post('/impact/preview')
  async previewImpact(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { triggerKind?: string; triggerObjectId?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.triggerObjectId !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'triggerObjectId is required'), 400);
    }
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'INV', p.triggerObjectId),
      GraphCapability.read,
      async (cap) => this.impact.walk(cap, {
        triggerKind: p.triggerKind ?? 'claim_correction',
        triggerObjectId: p.triggerObjectId as string,
      }));
    return { impact: out.result, receipt: receipt(out) };
  }

  @Post('/impact/propagate')
  async propagate(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: {
      triggerKind?: string; triggerObjectId?: string; correctionCaseId?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.triggerObjectId !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'triggerObjectId is required'), 400);
    }
    const kind = p.triggerKind ?? 'claim_correction';
    if (!['claim_correction', 'claim_withdrawal', 'edge_retraction', 'entity_split',
          'evidence_correction', 'manual'].includes(kind)) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'triggerKind is not one this system propagates'), 400);
    }
    /*
     * A WALK LINKED TO A CASE MUST BE ABLE TO COVER WHAT THE CASE CORRECTED.
     *
     * A correction supersedes evidence objects; only an `evidence_correction` walk
     * of one of them reaches the claims derived from it. A `manual` walk linked
     * to a case reaches nothing the case changed and previously counted as
     * coverage anyway. The port (`graph.open_invalidation`) is the boundary and
     * also checks the object is one the case recorded; this is the early,
     * plainly-worded refusal.
     */
    if (typeof p.correctionCaseId === 'string' && kind !== 'evidence_correction') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id,
        'a walk linked to a correction case must be an evidence_correction of an object the '
        + `case superseded; a ${kind} walk reaches none of them and cannot count as propagation`), 400);
    }
    const out = await this.pipeline.write(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.impact.propagate', 'INV', p.triggerObjectId),
      GraphCapability.impact,
      async (cap, scope) => {
        const r = await this.impact.propagate(cap, scope, {
          triggerKind: kind, triggerObjectId: p.triggerObjectId as string,
          correctionCaseId: typeof p.correctionCaseId === 'string' ? p.correctionCaseId : null,
          actor: principal.principalId, correlationId: envelope.correlation_id,
        });
        // GraphChanged (B6): the assessed walk is carried as the reach — never walked a second time.
        const changed = await graphChangedEvent(cap, this.impact, {
          tenantId, domainId, kind: 'invalidation.assessed',
          identities: [], reach: { walked: r }, invalidationId: r.invalidationId, correctionCaseId: r.correctionCaseId,
          cause: { action: 'graph.impact.propagate', actor: principal.principalId, target_type: 'INV', target_id: r.invalidationId },
        });
        return { result: r, targetType: 'INV', targetId: r.invalidationId, targetVersion: '1',
                 outboxEvent: { eventType: 'DependencyInvalidated',
                                payload: { invalidation_id: r.invalidationId,
                                           trigger: p.triggerObjectId,
                                           assumptions: r.assumptions.length,
                                           objectives: r.objectives.length } },
                 outboxEvents: [changed] };
      });
    return { impact: out.result, receipt: receipt(out) };
  }

  /**
   * Corrections whose propagation is not complete.
   *
   * Where the domain has a registered propagation agent (CP-6 B1, 0060) the outbox's
   * `CorrectionApplied` is consumed and the walk runs automatically; where it has
   * none, or the automatic walk was refused, failed or truncated, the correction sits
   * here with its downstream impact unassessed until an operator walks it. This route
   * makes that queue visible instead of leaving it to be noticed, each row carrying the
   * latest automatic attempt under `automatic`.
   */
  @Post('/impact/awaiting')
  async awaitingPropagation(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number; cursor?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const cursor = typeof body.payload?.cursor === 'string' ? body.payload.cursor : null;
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'COR', null),
      GraphCapability.read,
      async (cap) => this.impact.awaitingPropagation(cap, body.payload?.limit ?? 100, cursor));
    return {
      awaiting: out.result.cases,
      total: out.result.total,
      // A page is not the answer. When more outstanding work exists than fits,
      // the continuation needed to reach it is part of the response — opaque,
      // and carrying both key columns so a boundary inside tied timestamps loses
      // nothing.
      nextCursor: out.result.nextCursor,
      note: 'these corrections are applied and their downstream propagation is not complete — '
        + 'either nothing has walked them, or a walk was truncated or left corrected objects '
        + 'uncovered. Where a propagation agent is registered the walk runs automatically on '
        + 'CorrectionApplied and its state is shown under automatic; propagation can always be '
        + 'run by an operator through /impact/propagate.',
      receipt: receipt(out),
    };
  }

  // ───────────────────────── CP-6 B1: the propagation agent (0060) ─────────────────────────

  /** Register the domain's propagation agent: its principal on the identity authority, its grant on the commit authority. */
  @Post('/impact/propagation/agents/register')
  async registerPropagationAgent(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { ownerPrincipalId?: string; backlog?: 'walk' | 'leave'; budgets?: { max_roots_per_event?: number; max_elapsed_ms?: number } } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    return this.propagationAgents.register(envelope, principal, tenantId, domainId,
      { ownerPrincipalId: p.ownerPrincipalId as string, ...(p.backlog === undefined ? {} : { backlog: p.backlog }), ...(p.budgets === undefined ? {} : { budgets: p.budgets }) });
  }

  @Post('/impact/propagation/agents/:agentId/revoke')
  async revokePropagationAgent(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Param('agentId') agentId: string,
    @Body() body: { payload?: { reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    return this.propagationAgents.revoke(envelope, principal, tenantId, domainId, agentId, body.payload?.reason as string);
  }

  /** The registry, the recent attempts and whether this process serves the domain's queue. */
  @Post('/impact/propagation/status')
  async propagationStatus(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'AGT', null),
      GraphCapability.read,
      async (cap) => this.propagationAgents.status(cap, tenantId, domainId));
    return { propagation: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── CP-6 B6: GraphChanged / MemoryCorrected subscriptions (0063) ─────────────────────────

  /** Register a subscriber of one kind: its principal on the identity authority, its subscription on the commit authority. */
  @Post('/subscriptions/register')
  async registerSubscription(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: RegisterSubscriptionIntake },
  ) {
    const { envelope, principal } = ctx(req);
    return this.subscriptions.register(envelope, principal, tenantId, domainId, (body.payload ?? {}) as RegisterSubscriptionIntake);
  }

  @Post('/subscriptions/:subscriptionId/pause')
  async pauseSubscription(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    return this.subscriptions.control(envelope, principal, tenantId, domainId, subscriptionId, 'paused', body.payload?.reason as string);
  }
  @Post('/subscriptions/:subscriptionId/resume')
  async resumeSubscription(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    return this.subscriptions.control(envelope, principal, tenantId, domainId, subscriptionId, 'active', body.payload?.reason as string);
  }
  @Post('/subscriptions/:subscriptionId/revoke')
  async revokeSubscription(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    return this.subscriptions.control(envelope, principal, tenantId, domainId, subscriptionId, 'revoked', body.payload?.reason as string);
  }
  /** Move the subscription's cursor back and re-drive the events after it — to this subscription alone. */
  @Post('/subscriptions/:subscriptionId/replay')
  async replaySubscription(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('subscriptionId') subscriptionId: string,
    @Body() body: { payload?: { fromCreatedAt?: string | null; fromEventId?: string | null; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    return this.subscriptions.replay(envelope, principal, tenantId, domainId, subscriptionId, { fromCreatedAt: p.fromCreatedAt ?? null, fromEventId: p.fromEventId ?? null, reason: p.reason as string });
  }

  /** The registry, the delivery ledger, the retrieval checks, the mapping proposals, and whether this process serves the domain. */
  @Post('/subscriptions/status')
  async subscriptionStatus(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'SUB', null), GraphCapability.read,
      async (cap) => this.subscriptions.status(cap, tenantId, domainId));
    return { subscriptions: out.result, receipt: receipt(out) };
  }

  /** The delivery ledger of one event: every subscription it reached, the items and their effects. */
  @Post('/subscriptions/deliveries/:eventId/get')
  async subscriptionDelivery(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('eventId') eventId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'SUB', eventId), GraphCapability.read,
      async (cap) => ({
        deliveries: await cap.readSubscriptionDeliveries().selectAll().where('event_id' as never, '=', eventId as never).execute(),
        events: await cap.readSubscriptionDeliveryEvents().selectAll().where('outbox_event_id' as never, '=', eventId as never).orderBy('occurred_at' as never).execute(),
      }));
    return { ...(out.result as Record<string, unknown>), receipt: receipt(out) };
  }

  /** Mapping reconciliations proposed by the memory-mappings consumer, awaiting a person. */
  @Post('/mappings/list')
  async listMappings(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { state?: 'proposed' | 'accepted' | 'rejected'; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const state = body.payload?.state ?? 'proposed';
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'MRC', null), GraphCapability.read,
      async (cap) => cap.readMappingReconciliations().selectAll().where('state' as never, '=', state as never).orderBy('proposed_at' as never, 'desc').limit(Math.min(body.payload?.limit ?? 100, 500)).execute());
    return { mappings: out.result, receipt: receipt(out) };
  }

  /** A person decides a proposed reconciliation under the resolution manager's authority (rule 7: never automatic). */
  @Post('/mappings/:reconciliationId/decide')
  async decideMapping(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('reconciliationId') reconciliationId: string,
    @Body() body: { payload?: { decision?: 'accept' | 'reject'; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (p.decision !== 'accept' && p.decision !== 'reject') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, "decision must be 'accept' or 'reject'"), 400);
    if (typeof p.reason !== 'string' || p.reason.trim().length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a mapping decision needs a reason of at least 8 characters'), 400);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.resolution.decide', 'MRC', reconciliationId), GraphCapability.decision,
      async (cap) => {
        await cap.decideMappingReconciliation({ reconciliationId, tenantId, domainId, state: p.decision === 'accept' ? 'accepted' : 'rejected', reason: p.reason as string, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { reconciliationId, state: p.decision === 'accept' ? 'accepted' : 'rejected' }, targetType: 'MRC', targetId: reconciliationId, targetVersion: '1', outboxEvent: null };
      });
    return { mapping: out.result, receipt: receipt(out) };
  }

  @Post('/impact/list')
  async listImpact(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: { limit?: number } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'INV', null),
      GraphCapability.read,
      async (cap) => this.impact.list(cap, body.payload?.limit ?? 100));
    return { invalidations: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── overview and projections ─────────────────────────

  @Post('/overview')
  async overview(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'ENT', null),
      GraphCapability.read,
      async (cap) => {
        const entities = (await cap.readEntities().selectAll().limit(5_000).execute()) as Array<Record<string, unknown>>;
        const resolutions = (await cap.readResolutions().selectAll().limit(20_000).execute()) as Array<Record<string, unknown>>;
        const edges = (await cap.readEdges().selectAll().limit(20_000).execute()) as Array<Record<string, unknown>>;
        const strategy = (await cap.readStrategy().selectAll().limit(5_000).execute()) as Array<Record<string, unknown>>;
        const invalidations = (await cap.readInvalidations().selectAll().limit(1_000).execute()) as Array<Record<string, unknown>>;
        const by = (rows: Array<Record<string, unknown>>, k: string, v: string): number =>
          rows.filter((r) => String(r[k]) === v).length;
        return {
          entities: {
            total: entities.length,
            active: by(entities, 'lifecycle_state', 'active'),
            split: entities.filter((e) => e['split_from'] !== null).length,
          },
          resolutions: {
            total: resolutions.length,
            accepted: by(resolutions, 'state', 'accepted'),
            queued: by(resolutions, 'state', 'proposed'),
            rejected: by(resolutions, 'state', 'rejected'),
            superseded: by(resolutions, 'state', 'superseded'),
            automatic: resolutions.filter(
              (r) => r['state'] === 'accepted' && r['decided_by'] === null).length,
            modelAssisted: by(resolutions, 'method', 'model_assisted'),
          },
          edges: {
            total: edges.length,
            asserted: by(edges, 'state', 'asserted'),
            retracted: by(edges, 'state', 'retracted'),
          },
          strategy: {
            total: strategy.length,
            objectives: by(strategy, 'object_type', 'OBJ'),
            assumptions: by(strategy, 'object_type', 'ASU'),
            decisions: by(strategy, 'object_type', 'DEC'),
            commitments: by(strategy, 'object_type', 'CMT'),
            outcomes: by(strategy, 'object_type', 'OUT'),
            unverified: strategy.filter(
              (s) => s['object_type'] === 'ASU' && s['verification_state'] === 'unverified').length,
          },
          invalidations: {
            total: invalidations.length,
            assessed: by(invalidations, 'state', 'assessed'),
          },
        };
      });
    return { overview: out.result, receipt: receipt(out) };
  }

  @Post('/projections/verify')
  async verifyProjections(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      this.route(tenantId, domainId, 'graph.read', 'ENT', null),
      GraphCapability.read,
      async (cap) => cap.rebuildProjections());
    return { projections: out.result, receipt: receipt(out) };
  }
}
