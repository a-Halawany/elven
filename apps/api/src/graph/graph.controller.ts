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
 *
 * A fourth rule is CP-6 B20's (0080; D5, D6): EVERY exploration and memory read — the twelve
 * routes `/search`, `/entities/list`, `/entities/:id/get`, `/edges/list`, `/neighbourhood`,
 * `/path`, `/strategy/list`, `/strategy/:id/get`, `/overview`, `/memory/list`, `/memory/:id/get`,
 * `/memory/:id/retrieve` — reads the PROJECTION STATE of the partitions it depends on FIRST in
 * its transaction and answers it (`projection`: the domain's revision, the sequence the retrieval
 * subscriber verified through, the lag, each partition's condition — current / lagging /
 * unverified / withdrawn — and the label). While a partition is WITHDRAWN the route serves the
 * LAST VALID STATE from the event log, labelled: drifted rows with `drift`, missing rows
 * metadata-only, poisoned rows never; a traversal is constrained to depth 2 with
 * `bound.projection`. A stale projection never appears current (AU-MEM-0068); nothing here
 * refuses a read for it.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { GraphCapability } from './graph.capabilities.js';
import { GraphOrchestrator } from './graph.orchestrator.js';
import { EntitiesService } from './entities/entities.service.js';
import { ResolutionService } from './entities/resolution.service.js';
import { EdgesService, MAX_DEPTH, MAX_EDGES, nowAsOf, type AsOf } from './edges/edges.service.js';
import { StrategyService, validateStrategy } from './strategy/strategy.service.js';
import { MemoryService, validateDeriveIntake, validateMemoryItem, type DeriveAnswer } from './memory/memory.service.js';
import { CONTEXT_LIMIT_MAX } from './memory/context.js';
import { ImpactService } from './strategy/impact.service.js';
import { SearchService } from './search/search.service.js';
import { PropagationAgentsService } from './propagation/propagation-agents.service.js';
import { graphChangedEvent, revisionCommittedEvent } from './subscriptions/change-events.js';
/* B23 (0084) revision */
import { revisionHead, validateRevisionIntake } from './revisions/revision.service.js';
/* end B23 revision */
import { SubscriptionsService, flowTelemetry, type RegisterSubscriptionIntake } from './subscriptions/subscriptions.service.js';
import { EMPTY_REACH, type ReachedObjects } from './subscriptions/graph-change.js';
import { ROUTE_PARTITIONS, VERIFY_NOTE, projectionStateOf } from './projections/projection-state.js';
import { entitiesFromLog, entityFromLog, overviewFromLog, resolutionsFromLog, resolutionsKnownAt, strategyFromLog, strategyOneFromLog, type Scope } from './projections/fallback.js';
import type { ScopeContext } from '../shared/scope.js';

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

/** B20: the established DOMAIN context as the fallback readers' scope (every one of the twelve routes is DOMAIN-scoped). */
const scopeOf = (ctx: ScopeContext): Scope => ({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string });

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
    private readonly memory: MemoryService,
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
      async (cap, scope) => {
        // B20: the projection state FIRST; the block rides inside `search` (search.projection) with the completeness flags.
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.search);
        return this.search.search(cap, query, body.payload?.limit ?? 50, { projection, scope: scopeOf(scope) });
      });
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
      async (cap, scope) => {
        // B20: the projection state FIRST. While entities_current is withdrawn the rows are the log's last valid state
        // (drift / projected flagged); while resolutions_current ALONE is withdrawn the entity rows come from the projection
        // and only the accepted-resolution COUNTS come from the log (the block's label names the partition; the rows carry no `from`).
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.entitiesList);
        const withdrawn = new Set<string>(projection.withdrawn);
        const limit = body.payload?.limit ?? 200;
        const rows = withdrawn.has('entities_current') ? await entitiesFromLog(cap, scopeOf(scope), limit) : await this.entities.list(cap, limit);
        const accepted = withdrawn.has('resolutions_current')
          ? (await resolutionsFromLog(cap, scopeOf(scope))).filter((r) => r['state'] === 'accepted')
          : (await cap.readResolutions().selectAll()
              .where('state' as never, '=', 'accepted' as never)
              .execute()) as Array<Record<string, unknown>>;
        const counts = new Map<string, number>();
        for (const r of accepted) {
          const id = String(r['entity_id']);
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        return { entities: rows.map((e) => ({ ...e, mention_count: counts.get(String(e['entity_id'])) ?? 0 })), projection };
      });
    return { entities: out.result.entities, projection: out.result.projection, receipt: receipt(out) };
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
      async (cap, scope) => {
        // B20: the projection state FIRST. A withdrawn entities_current serves the entity from the log (a poisoned id is
        // absent there → 404 as an absent entity); a withdrawn resolutions_current serves the resolutions from the log-join —
        // the known-at predicate then runs over the projection row's accepted_at / superseded_at, so a metadata-only
        // resolution (no row: neither instant) is excluded from `mentions` rather than dated by inference.
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.entityGet);
        const withdrawn = new Set<string>(projection.withdrawn);
        const entity = withdrawn.has('entities_current') ? await entityFromLog(cap, scopeOf(scope), entityId) : await this.entities.get(cap, entityId);
        if (entity === undefined) return null;
        const resolutions = withdrawn.has('resolutions_current') ? await resolutionsFromLog(cap, scopeOf(scope), entityId) : await this.entities.resolutions(cap, entityId);
        const live = knownAt === undefined
          ? resolutions.filter((r) => r['state'] === 'accepted')
          : withdrawn.has('resolutions_current') ? resolutionsKnownAt(resolutions, knownAt) : await this.entities.mentionsKnownAt(cap, entityId, knownAt);
        // THE CUTOFF TRAVELS. Selecting the mentions current at an instant and then
        // fetching the LATEST version of each claim behind them is hindsight with
        // extra steps — the service takes the cutoff, so the endpoint gives it one.
        const claims = await this.entities.claimsFor(
          cap, live.filter((r) => r['claim_object_id'] !== null && r['claim_object_id'] !== undefined).map((r) => String(r['claim_object_id'])), knownAt);
        return {
          entity,
          identifiers: await this.entities.identifiers(cap, entityId),
          events: await this.entities.events(cap, entityId),
          resolutions,
          mentions: live,
          claims,
          knownAt: knownAt ?? null,
          projection,
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
                   payload: { schema_version: 'v1', resolution_id: resolutionId, decided_by: principal.principalId },
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
                                payload: { schema_version: 'v1', from: entityId, to: r.newEntityId, moved: r.moved } },
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
      async (cap, scope) => {
        // B20: the projection state FIRST; a withdrawn edges_current lists the log's last valid state (`from: 'log'`).
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.edgesList);
        const source = projection.withdrawn.includes('edges_current') ? 'log' as const : 'projection' as const;
        return { ...(await this.edges.list(cap, at, limit, { source, scope: scopeOf(scope) })), projection, source };
      });
    const { edges, total, complete, projection, source } = out.result;
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
      projection, ...(source === 'log' ? { from: 'log' } : {}),
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
      async (cap, scope) => {
        // B20: the projection state FIRST. With edges_current OR entities_current withdrawn the walk is CONSTRAINED to depth 2
        // (bound.projection) over the log-derived edge state (edges_current) and the log's entities (entities_current) — the
        // walk, not a refusal (IA-34-005).
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.neighbourhood);
        const withdrawn = new Set<string>(projection.withdrawn);
        const degraded = withdrawn.has('edges_current') || withdrawn.has('entities_current');
        const n = await this.edges.neighbourhood(cap, entityId, body.payload?.depth ?? 2, at,
          { source: withdrawn.has('edges_current') ? 'log' : 'projection', scope: scopeOf(scope), maxDepth: degraded ? 2 : MAX_DEPTH });
        const entities = withdrawn.has('entities_current') ? await entitiesFromLog(cap, scopeOf(scope), 1_000) : await this.entities.list(cap, 1_000);
        const byId = new Map(entities.map((e) => [String(e['entity_id']), e]));
        return {
          edges: n.edges,
          entities: n.entityIds.map((id) => byId.get(id) ?? null).filter((x) => x !== null),
          complete: n.complete, searchedDepth: n.searchedDepth,
          depthClamped: n.depthClamped, beyondDepth: n.beyondDepth,
          bound: { projection: n.projectionBound },
          projection,
        };
      });
    const n = out.result;
    /*
     * SCOPED TO THE DEPTH IT SEARCHED. A neighbourhood is "everything within N
     * hops" by definition, so depth is its scope rather than a defect — but the
     * scope is stated, a clamped request is named, and entities lying beyond it
     * are reported rather than left to be assumed absent. Scan incompleteness is
     * a defect in the answer and is reported as one. B20: a walk constrained by a
     * withdrawn partition says so first, in the block's own words.
     */
    const notes: string[] = [];
    if (n.projection.degraded && n.projection.label !== null) notes.push(n.projection.label);
    if (!n.complete) {
      notes.push('this neighbourhood was built from an incomplete scan; edges beyond the bound '
        + 'were not examined and the answer may be missing eligible relationships');
    }
    if (n.depthClamped) {
      notes.push(`the requested depth was reduced to the bound of ${n.searchedDepth} hop(s)`
        + (n.bound.projection ? ' (the traversal is constrained while a projection is withdrawn)' : ''));
    }
    const { projection, ...neighbourhood } = n;
    return {
      neighbourhood, asOf: at, complete: n.complete,
      searchedDepth: n.searchedDepth, beyondDepth: n.beyondDepth, depthClamped: n.depthClamped, bound: n.bound,
      scope: `everything within ${n.searchedDepth} hop(s) of the entity`
        + (n.beyondDepth ? '; further entities lie beyond that depth and are not included'
                         : '; nothing visible lies beyond that depth'),
      note: notes.length === 0 ? null : notes.join('. '),
      projection,
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
      async (cap, scope) => {
        // B20: the projection state FIRST; the search is constrained to depth 2 (bound.projection) while a partition it rests on is withdrawn.
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.path);
        const withdrawn = new Set<string>(projection.withdrawn);
        const degraded = withdrawn.has('edges_current') || withdrawn.has('entities_current');
        const r = await this.edges.path(cap, from, to, at,
          { source: withdrawn.has('edges_current') ? 'log' : 'projection', scope: scopeOf(scope), maxDepth: degraded ? 2 : MAX_DEPTH });
        return { ...r, projection };
      });
    const { path, complete, searchedDepth, bound, projection } = out.result;
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
    if (projection.degraded && projection.label !== null) notes.push(projection.label);
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
      projection,
      receipt: receipt(out),
    };
  }



  // ───────────────────────── ontology (0066 §7, L4-I05 OntologyChangeProposed) ─────────────────────────

  /** A change to the domain's vocabulary is PROPOSED as the next version with its rationale and alternatives; the compatibility analysis is the write's; the event announces the proposal and its reviews. */
  @Post('/ontology/propose')
  async proposeOntology(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { namespace?: string; entityTypes?: string[]; predicates?: Array<Record<string, unknown>>; rationale?: string; alternatives?: unknown[]; migrationPlan?: string | null } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const entityTypes = Array.isArray(p.entityTypes) ? p.entityTypes.map(String) : [];
    const predicates = Array.isArray(p.predicates) ? p.predicates : [];
    const rationale = String(p.rationale ?? '').trim();
    if (entityTypes.length === 0 || predicates.length === 0) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'an ontology version lists its entityTypes and predicates'), 422);
    if (rationale.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a proposal states its rationale (at least 8 characters)'), 422);
    const versionId = newId();
    const namespace = String(p.namespace ?? 'domain');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.ontology.propose', 'ONT', versionId), GraphCapability.ontology,
      async (cap) => {
        const r = await cap.proposeOntologyVersion({ versionId, tenantId, domainId, namespace, entityTypes, predicates, rationale, alternatives: Array.isArray(p.alternatives) ? p.alternatives : [], migrationPlan: p.migrationPlan ?? null, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'ONT', targetId: versionId, targetVersion: String(r['to_version'] ?? 1),
                 outboxEvent: { eventType: 'OntologyChangeProposed', payload: {
                   schema: 'OntologyChangeProposed', schema_version: 'v1', proposal_id: versionId, namespace, from_version: r['from_version'] ?? null, to_version: r['to_version'] ?? null,
                   change: r['change'] ?? null, rationale, alternatives: Array.isArray(p.alternatives) ? p.alternatives : [], compatibility: r['analysis'] ?? null, migration: { plan: p.migrationPlan ?? null, rollback: 'the prior version stays recorded and is restored by a new proposal' },
                   review: { required: ['compatibility', 'migration', 'domain', 'governance'], state: r['reviews'] ?? null, steward_role: 'ontology_steward' },
                   temporal: { known_at: new Date().toISOString() }, cause: { action: 'graph.ontology.propose', actor: principal.principalId, target_type: 'ONT', target_id: versionId },
                 } } };
      });
    return { ontology: out.result, receipt: receipt(out) };
  }

  /** The steward's decision (never the proposer's): approval activates the version; a breaking change is refused while it would strand asserted edges. */
  @Post('/ontology/:versionId/decide')
  async decideOntology(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('versionId') versionId: string, @Body() body: { payload?: { decision?: string; reason?: string; reviews?: Record<string, unknown> } }) {
    const { envelope, principal } = ctx(req);
    const decision = String(body.payload?.decision ?? ''); const reason = String(body.payload?.reason ?? '').trim();
    if (decision !== 'approve' && decision !== 'reject') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'decision is approve or reject'), 422);
    if (reason.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a decision states its reason (at least 8 characters)'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.ontology.decide', 'ONT', versionId), GraphCapability.ontology,
      async (cap) => ({ result: await cap.decideOntologyProposal({ versionId, tenantId, domainId, decision, reason, reviews: body.payload?.reviews ?? {}, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'ONT', targetId: versionId, targetVersion: null, outboxEvent: null }));
    return { ontology: out.result, receipt: receipt(out) };
  }

  @Post('/ontology/list')
  async listOntology(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'ONT', null), GraphCapability.read,
      async (cap) => ({ versions: (await cap.readOntologyVersions().selectAll().orderBy('namespace' as never).orderBy('version' as never).execute()) as Array<Record<string, unknown>> }));
    return { ...out.result, receipt: receipt(out) };
  }

  /* B23 (0084) revision */
  // ───────────────────────── graph revisions (0084, L4-I02 CommitGraphRevision) ─────────────────────────

  /**
   * ONE CHANGE SET, ONE REVISION (graph.revision.commit → graph.commit_revision): the nodes, identifiers and edges of `change_set`,
   * with the domain's active ontology version named and every fact's provenance (its claim version), validated and applied by the
   * port in ONE transaction against `expected_revision` — or refused, and nothing applied. IDEMPOTENT: the same
   * `idempotency_key` with the same change set answers the first result (`repeated: true`, no second effect, no event); the same
   * key with another change set is refused (409), as is a head that is not the expected one (409 conflict: read the head again).
   * The accepted revision publishes ONE GraphChanged/revision.committed, built from the port's answer without reads.
   */
  @Post('/revisions')
  async commitRevision(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateRevisionIntake(body.payload ?? {}, envelope.correlation_id);
    const revisionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.revision.commit', 'GRV', revisionId), GraphCapability.revisions,
      async (cap) => {
        const r = await cap.commitRevision({ revisionId, tenantId, domainId, changeSet: intake.changeSet, expectedRevision: intake.expectedRevision, idempotencyKey: intake.idempotencyKey,
          actor: principal.principalId, correlationId: envelope.correlation_id });
        // A REPEAT is the first answer: the recorded revision is the target, nothing is announced (one authoritative effect).
        if (r.repeated) return { result: r, targetType: 'GRV', targetId: r.revision_id, targetVersion: String(r.revision), outboxEvent: null };
        const subscriptions = await cap.subscriptionsMatching({ tenantId, domainId, eventType: 'GraphChanged', changeKind: 'revision.committed' });
        return { result: r, targetType: 'GRV', targetId: r.revision_id, targetVersion: String(r.revision),
                 outboxEvent: revisionCommittedEvent({ revision: r as unknown as Record<string, unknown>, subscriptions, actor: principal.principalId }) };
      });
    return { revision: out.result, receipt: receipt(out) };
  }

  /** The domain's revision head (graph.read): the `expected_revision` a change set names, the active ontology version(s) it names, the latest revisions. */
  @Post('/revisions/head')
  async revisionHead(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'GRV', null), GraphCapability.read,
      async (cap) => revisionHead(cap, { tenantId, domainId }));
    return { head: out.result, receipt: receipt(out) };
  }
  /* end B23 revision */

  // ───────────────────────── Enterprise Memory workspace (0066 §3, AU-MEM-0065; B19: /memory/derive and the re-derivation) ─────────────────────────

  /** OBJ-14 RECORD: the knowledge owner records a memory item — a person's own record (source kind human): its first canonical version, its projection, its cites as dependencies. */
  @Post('/memory/record')
  async recordMemoryItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateMemoryItem((body.payload ?? {}) as never, envelope.correlation_id, false);
    const itemId = newId();
    const out = await this.pipeline.write(
      envelope, principal,
      { ...this.route(tenantId, domainId, 'memory.item.record', 'MEM', itemId), writableTargets: [itemId] },
      GraphCapability.memory,
      async (cap, scope) => {
        const r = await this.memory.write(cap, scope, { itemId, version: 1, intake, owner: principal.principalId, actor: principal.principalId, correlationId: envelope.correlation_id, purposeId: envelope.purpose_id ?? 'memory' });
        // GraphChanged/memory_item.recorded: the item is its own reach; the entities it cites are identities it rests on.
        const changed = await graphChangedEvent(cap, this.impact, {
          tenantId, domainId, kind: 'memory_item.recorded',
          identities: intake.cites.filter((c) => c.kind === 'entity').map((c) => ({ entity_id: c.id, role: 'rests_on' })),
          dependencies: intake.cites.map((c) => ({ dependent_object_id: itemId, dependent_type: 'MEM', depends_on_kind: c.kind, depends_on_id: c.id })),
          reach: { reach: { ...EMPTY_REACH, memoryItems: [itemId], claims: intake.cites.filter((c) => c.kind === 'claim').map((c) => c.id) } },
          cause: { action: 'memory.item.record', actor: principal.principalId, target_type: 'MEM', target_id: itemId },
        });
        return { result: r, targetType: 'MEM', targetId: itemId, targetVersion: '1', outboxEvent: changed };
      });
    return { memory: out.result, receipt: receipt(out) };
  }

  /**
   * B19 (0079) DERIVE — the knowledge owner names a claim version or a warning; the SERVER computes the statement and the
   * provenance, inherits the controls, gates on the review state (and on the deriver's own clearance over the applied
   * classification) and records the first canonical MEM@v2 version with its derivation; human-gated (the PEP discharges the gate
   * before the capability is minted).
   */
  @Post('/memory/derive')
  async deriveMemoryItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateDeriveIntake((body.payload ?? {}) as never, envelope.correlation_id, false);
    const itemId = newId();
    const out = await this.pipeline.write(
      envelope, principal,
      { ...this.route(tenantId, domainId, 'memory.item.derive', 'MEM', itemId), writableTargets: [itemId] },
      GraphCapability.memory,
      async (cap, scope) => {
        const r = await this.memory.derive(cap, principal, scope, { itemId, version: 1, intake, owner: principal.principalId, actor: principal.principalId, correlationId: envelope.correlation_id, purposeId: envelope.purpose_id ?? 'memory', action: 'memory.item.derive' });
        // GraphChanged/memory_item.recorded (the kind unchanged; the cause says derive): the item is its own reach; the basis and its evidence are what it rests on.
        const changed = await graphChangedEvent(cap, this.impact, {
          tenantId, domainId, kind: 'memory_item.recorded',
          identities: intake.cites.filter((c) => c.kind === 'entity').map((c) => ({ entity_id: c.id, role: 'rests_on' })),
          dependencies: this.derivedDependencies(itemId, intake.cites, r),
          reach: { reach: this.derivedReach(itemId, r) },
          cause: { action: 'memory.item.derive', actor: principal.principalId, target_type: 'MEM', target_id: itemId },
        });
        return { result: r, targetType: 'MEM', targetId: itemId, targetVersion: '1', outboxEvent: changed };
      });
    return { memory: out.result, receipt: receipt(out) };
  }

  /** B19: what a derived record rests on, for the GraphChanged row — the basis, its evidence versions and the extra cites (deduplicated). */
  private derivedDependencies(itemId: string, cites: Array<{ kind: string; id: string }>, r: DeriveAnswer): Array<{ dependent_object_id: string; dependent_type: string; depends_on_kind: string; depends_on_id: string }> {
    const seen = new Set<string>();
    const out: Array<{ dependent_object_id: string; dependent_type: string; depends_on_kind: string; depends_on_id: string }> = [];
    for (const d of [{ kind: r.basis.kind, id: r.basis.id }, ...r.evidence.map((e) => ({ kind: 'evidence', id: e.object_id })), ...cites]) {
      const key = `${d.kind}:${d.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ dependent_object_id: itemId, dependent_type: 'MEM', depends_on_kind: d.kind, depends_on_id: d.id });
    }
    return out;
  }
  private derivedReach(itemId: string, r: DeriveAnswer): ReachedObjects {
    return { ...EMPTY_REACH, memoryItems: [itemId], claims: r.basis.kind === 'claim' ? [r.basis.id] : [], warnings: r.basis.kind === 'warning' ? [r.basis.id] : [], evidence: [...new Set(r.evidence.map((e) => e.object_id))] };
  }

  /**
   * OBJ-16 SUPERSEDE: the record authority records the next version with its reason; the prior version stays replayable.
   * B19: a DERIVED record is RE-DERIVED — `payload.basis` names the basis version (empty = the latest) and the same service runs
   * the same gates under memory.item.supersede; a person's record is re-stated. The kind class of an item never changes: the
   * route refuses the crossing in plain words before the port's own rule does.
   */
  @Post('/memory/:itemId/supersede')
  async supersedeMemoryItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const payload = (body.payload ?? {}) as Record<string, unknown>;
    const derived = payload['basis'] !== undefined;
    const deriveIntake = derived ? validateDeriveIntake(payload as never, envelope.correlation_id, true) : null;
    const intake = derived ? null : validateMemoryItem(payload as never, envelope.correlation_id, true);
    const cites = (deriveIntake ?? intake)!.cites;
    const out = await this.pipeline.write(
      envelope, principal,
      { ...this.route(tenantId, domainId, 'memory.item.supersede', 'MEM', itemId), writableTargets: [itemId] },
      GraphCapability.memory,
      async (cap, scope) => {
        const current = await this.memory.current(cap, itemId);
        if (current === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized memory item matches'), 404);
        const isDerived = current['derivation'] !== null && current['derivation'] !== undefined;
        if (derived !== isDerived) {
          throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, derived
            ? 'a person\'s record is superseded by a person\'s statement; a re-derivation (payload.basis) is for a derived record'
            : 'a derived record is superseded by a re-derivation (payload.basis); its statement is computed, not typed'), 422);
        }
        const version = Number(current['object_version']) + 1;
        const owner = String(current['owner_principal_id']);
        const common = { itemId, version, owner, actor: principal.principalId, correlationId: envelope.correlation_id, purposeId: envelope.purpose_id ?? 'memory' };
        const rederived: DeriveAnswer | null = deriveIntake === null ? null : await this.memory.derive(cap, principal, scope, { ...common, intake: deriveIntake, action: 'memory.item.supersede' });
        const r = rederived ?? await this.memory.write(cap, scope, { ...common, intake: intake! });
        const changed = await graphChangedEvent(cap, this.impact, {
          tenantId, domainId, kind: 'memory_item.superseded',
          identities: cites.filter((c) => c.kind === 'entity').map((c) => ({ entity_id: c.id, role: 'rests_on' })),
          dependencies: rederived !== null ? this.derivedDependencies(itemId, cites, rederived) : cites.map((c) => ({ dependent_object_id: itemId, dependent_type: 'MEM', depends_on_kind: c.kind, depends_on_id: c.id })),
          reach: { reach: rederived !== null ? this.derivedReach(itemId, rederived) : { ...EMPTY_REACH, memoryItems: [itemId] } },
          cause: { action: 'memory.item.supersede', actor: principal.principalId, target_type: 'MEM', target_id: itemId },
        });
        return { result: { ...r, priorVersion: version - 1 }, targetType: 'MEM', targetId: itemId, targetVersion: String(version), outboxEvent: changed };
      });
    return { memory: out.result, receipt: receipt(out) };
  }

  @Post('/memory/:itemId/withdraw')
  async withdrawMemoryItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = String(body.payload?.reason ?? '').trim();
    if (reason.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reason is at least 8 characters'), 422);
    const out = await this.pipeline.write(
      envelope, principal,
      this.route(tenantId, domainId, 'memory.item.withdraw', 'MEM', itemId),
      GraphCapability.memory,
      async (cap) => {
        await cap.withdrawMemoryItem({ itemId, tenantId, domainId, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: { itemId, state: 'withdrawn' }, targetType: 'MEM', targetId: itemId, targetVersion: null, outboxEvent: null };
      });
    return { memory: out.result, receipt: receipt(out) };
  }

  /**
   * OBJ-15 RETRIEVE: a purpose-authorised read of the version current at `asOf` (the record's replay), no mutation, the
   * access audited — the ledger row is written inside the read's transaction and the AUD row names the version served.
   */
  @Post('/memory/:itemId/retrieve')
  async retrieveMemoryItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string, @Body() body: { payload?: { asOf?: string } }) {
    const { envelope, principal } = ctx(req);
    const purpose = envelope.purpose_id ?? '';
    const asOfRaw = body.payload?.asOf === undefined || body.payload.asOf === null ? null : String(body.payload.asOf);
    if (asOfRaw !== null && Number.isNaN(Date.parse(asOfRaw))) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'payload.asOf must be an instant (ISO 8601)'), 422);
    const asOf = asOfRaw === null ? null : new Date(asOfRaw).toISOString();
    const out = await this.pipeline.consequentialReadEvidenced(
      envelope, principal,
      this.route(tenantId, domainId, 'memory.item.retrieve', 'MEM', itemId),
      GraphCapability.memory,
      async (cap, scope) => {
        // B20: the projection state FIRST (memory_items_current: the served availability's source and the index_state).
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.memoryRetrieve);
        const r = await this.memory.retrieve(cap, principal, scope, { itemId, purpose, asOf, correlationId: envelope.correlation_id, projection });
        if (r === null) return null;
        // B20 (D9): the content tier did not answer — the item's METADATA was served, no version, and NO access row (the
        // access ledger requires the served version); the service recorded memory.retrieval_degraded instead.
        if ('content' in r && r.content === 'unavailable') return { ...r, accessId: null, projection };
        const accessId = await cap.recordMemoryAccess({ itemId, tenantId, domainId, version: Number(r.versionServed), purpose, reader: principal.principalId, asOf, correlationId: envelope.correlation_id });
        return { ...r, accessId, projection };
      },
      (r) => {
        if (r === null) return { outcome: 'failure', resultCode: 'EYE_STA_001', metadata: { found: false } };
        const indexState = (r.availability as Record<string, unknown>)['index_state'] ?? null;
        // C21: EYE-DEG-001 (dashed) is the audit result code of a metadata-only answer — declared, not a refusal.
        if ('content' in r && r.content === 'unavailable') {
          return { outcome: 'success', resultCode: 'EYE-DEG-001',
                   metadata: { version_served: null, purpose, as_of: asOf, access_id: null, content: 'unavailable', degraded: 'content_unavailable', result_code: 'EYE-DEG-001', index_state: indexState } };
        }
        return { outcome: 'success', resultCode: 'OK', metadata: { version_served: r.versionServed, purpose, as_of: asOf, access_id: r.accessId, index_state: indexState } };
      });
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized memory item matches'), 404);
    return { memory: out.result, receipt: receipt(out) };
  }

  /* B23 (0084) context */
  /**
   * L3-I02 RETRIEVE CONTEXT: ONE query for an EXPLICIT purpose (envelope.purpose_id) about a SUBJECT ({ kind, id } — an entity, a
   * claim, an edge, a strategy object, an evidence object, a warning or a forecast), optionally AS OF an instant: the memory items
   * whose served version names the subject and admits the purpose, filtered by the reader's clearance and audience roles, each with
   * its explanation links; the revision, the verified sequence, the lag and the condition of the context's partitions read FIRST;
   * the PRODUCT STATE (complete | stale | partial — what was left out named). The query writes nothing (memory.retrieve_context is
   * STABLE); the access row of each served item version, the POL and the AUD rows are the governance record of the read. The audit
   * row's result code is OK, or EYE-DEG-001 for a stale or partial answer (declared, not a refusal). The subject's shape and an
   * empty purpose are the port's refusals (22023 → 422); the limit and the instant the route's.
   */
  @Post('/memory/context')
  async memoryContext(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { subject?: unknown; asOf?: string | null; limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const purpose = envelope.purpose_id ?? '';
    const asOfRaw = body.payload?.asOf === undefined || body.payload.asOf === null || body.payload.asOf === '' ? null : String(body.payload.asOf);
    if (asOfRaw !== null && Number.isNaN(Date.parse(asOfRaw))) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'payload.asOf must be an instant (ISO 8601)'), 422);
    const asOf = asOfRaw === null ? null : new Date(asOfRaw).toISOString();
    const limit = body.payload?.limit === undefined || body.payload.limit === null ? 50 : Number(body.payload.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > CONTEXT_LIMIT_MAX) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `payload.limit is 1..${CONTEXT_LIMIT_MAX}`), 422);
    const out = await this.pipeline.consequentialReadEvidenced(
      envelope, principal,
      this.route(tenantId, domainId, 'memory.context.retrieve', 'MEM', null),
      GraphCapability.memoryContext,
      async (cap, scope) => this.memory.context(cap, principal, scope, { purpose, subject: body.payload?.subject, asOf, limit, correlationId: envelope.correlation_id }),
      (r) => ({
        outcome: 'success', resultCode: r.product_state === 'complete' ? 'OK' : 'EYE-DEG-001',
        metadata: { purpose, subject: r.subject, as_of: asOf, product_state: r.product_state, revision: r.revision, verified_seq: r.verified_seq, condition: r.condition,
                    versions_served: r.items.map((it) => ({ item_id: it['item_id'], version: it['version'], access_id: it['access_id'] })),
                    omitted: r.omitted.map((o) => ({ projection: o.projection, rows: o.rows })), result_code: r.product_state === 'complete' ? 'OK' : 'EYE-DEG-001' },
      }));
    return { context: out.result, receipt: receipt(out) };
  }
  /* end B23 context */

  @Post('/memory/list')
  async listMemoryItems(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'MEM', null), GraphCapability.read,
      async (cap, scope) => {
        // B20: the projection state FIRST; a withdrawn memory_items_current lists the log's last valid state (index_state 'stale').
        // B21: the reader's canonical statements failing while withdrawn → 503 EYE-DEG-001 (the pipeline's failure row carries the code).
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.memoryList);
        const withdrawn = projection.withdrawn.includes('memory_items_current');
        return { memory: await this.memory.list(cap, body.payload?.limit ?? 200, { withdrawn, scope: scopeOf(scope), refusal: { projection, correlationId: envelope.correlation_id } }), projection };
      });
    return { memory: out.result.memory, projection: out.result.projection, receipt: receipt(out) };
  }

  /** The item's record: events, access history, what it rests on (no content of a version — that is a retrieval). */
  @Post('/memory/:itemId/get')
  async getMemoryItem(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('itemId') itemId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'MEM', itemId), GraphCapability.read,
      async (cap, scope) => {
        // B20: the projection state FIRST; a withdrawn memory_items_current serves the record from the log (a poisoned id is absent there → 404).
        // B21: the reader's canonical statements failing while withdrawn → 503 EYE-DEG-001 (the pipeline's failure row carries the code).
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.memoryGet);
        const withdrawn = projection.withdrawn.includes('memory_items_current');
        const item = await this.memory.current(cap, itemId, { withdrawn, scope: scopeOf(scope), refusal: { projection, correlationId: envelope.correlation_id } });
        if (item === null) return null;
        return { item: MemoryService.record(item), events: await this.memory.events(cap, itemId), access: await this.memory.accessHistory(cap, itemId), dependencies: await this.memory.dependencies(cap, itemId), projection };
      });
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized memory item matches'), 404);
    return { ...out.result, receipt: receipt(out) };
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
      async (cap, scope) => {
        // B20: the projection state FIRST; a withdrawn strategy_current lists the log-join (the dependencies are not a partition).
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.strategyList);
        const limit = body.payload?.limit ?? 200;
        const rows = projection.withdrawn.includes('strategy_current') ? await strategyFromLog(cap, scopeOf(scope), limit) : await this.strategy.list(cap, limit);
        const deps = (await cap.readDependencies().selectAll()
          .where('state' as never, '=', 'active' as never)
          .execute()) as Array<Record<string, unknown>>;
        return {
          strategy: rows.map((s) => ({
            ...s,
            dependencies: deps.filter(
              (d) => String(d['dependent_object_id']) === String(s['strategy_object_id'])),
          })),
          projection,
        };
      });
    return { strategy: out.result.strategy, projection: out.result.projection, receipt: receipt(out) };
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
      async (cap, scope) => {
        // B20: the projection state FIRST; a withdrawn strategy_current serves the object from the log-join (a poisoned id is absent there → 404).
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.strategyGet);
        const s = projection.withdrawn.includes('strategy_current') ? await strategyOneFromLog(cap, scopeOf(scope), objectId) : await this.strategy.get(cap, objectId);
        if (s === undefined) return null;
        return {
          object: s,
          events: await this.strategy.events(cap, objectId),
          dependencies: await this.strategy.dependencies(cap, objectId),
          projection,
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
                                payload: { schema_version: 'v1', invalidation_id: r.invalidationId,
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
    @Body() body: { payload?: { fromCreatedAt?: string | null; fromEventId?: string | null; fromSeq?: number | null; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    return this.subscriptions.replay(envelope, principal, tenantId, domainId, subscriptionId, { fromCreatedAt: p.fromCreatedAt ?? null, fromEventId: p.fromEventId ?? null, fromSeq: p.fromSeq ?? null, reason: p.reason as string });
  }

  /** 0065 §5 (AU-MEM-0041): the forecast, scenario, reconciliation and simulation flows' telemetry — recent rows and open failure states per flow. */
  @Post('/telemetry/flows')
  async flowTelemetry(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    // Each flow's state is read under ITS OWN read authority (prediction, twin, simulation), never widened by the graph's.
    const under = async (action: string, objectType: string, flowsOf: (cap: Parameters<typeof flowTelemetry>[0]) => Promise<Record<string, unknown>>) =>
      (await this.pipeline.consequentialRead({ ...envelope, message_id: newId(), action } as Envelope, principal, this.route(tenantId, domainId, action, objectType, null), GraphCapability.read, flowsOf)).result;
    const prediction = await under('prediction.read', 'FCT', (cap) => flowTelemetry(cap, ['forecasts', 'warnings']));
    const twin = await under('twin.read', 'TWN', (cap) => flowTelemetry(cap, ['reconciliations']));
    const simulation = await under('simulation.read', 'SIM', (cap) => flowTelemetry(cap, ['simulations']));
    return { flows: { ...prediction, ...twin, ...simulation } };
  }

  /** 0065 §6 (AU-DP-0071): the fifty canonical layer interfaces under their L<n>-I<nn> identities, with what this product binds to each. */
  @Post('/interfaces')
  async interfaces(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'graph.read', 'SUB', null), GraphCapability.read,
      async (cap) => (await cap.readInterfaceRegister().selectAll().orderBy('interface_id' as never).execute()) as Array<Record<string, unknown>>);
    return { interfaces: out.result, receipt: receipt(out) };
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
  /** 0065 §7 (TT-04): the person's decision that a relationship pending reassessment STANDS — the route a model-change reassessment (no mapping proposal) closes by. */
  @Post('/edges/:edgeId/reassessment/keep')
  async keepEdge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('edgeId') edgeId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = body.payload?.reason;
    if (typeof reason !== 'string' || reason.trim().length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'a reassessment decision needs a reason of at least 8 characters'), 400);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'graph.resolution.decide', 'EDG', edgeId), GraphCapability.decision,
      async (cap) => {
        await cap.keepEdgeUnderReassessment({ edgeId, tenantId, domainId, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { edgeId, reassessment: 'decided:kept' }, targetType: 'EDG', targetId: edgeId, targetVersion: '1', outboxEvent: null };
      });
    return { edge: out.result, receipt: receipt(out) };
  }

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
      async (cap, scope) => {
        // B20: the projection state of ALL SIX partitions first; the sections of a withdrawn partition are counted from the
        // log's last valid state and say so (`from: 'log'`), the others from the projection (`from: 'projection'`).
        const projection = await projectionStateOf(cap, ROUTE_PARTITIONS.overview);
        const sections = await overviewFromLog(cap, scopeOf(scope), new Set(projection.withdrawn));
        return { ...sections, projection };
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
    // B20 (0080; C10): the symmetric check's seven columns per row; this route REPORTS and withdraws nothing — said on the answer.
    return { projections: out.result, note: VERIFY_NOTE, receipt: receipt(out) };
  }
}
