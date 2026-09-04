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
        return { result: r, targetType: 'RES', targetId: resolutionId, targetVersion: '1',
                 outboxEvent: r.state !== 'accepted' ? null : {
                   eventType: 'EntityResolved',
                   payload: { resolution_id: resolutionId, decided_by: principal.principalId },
                 } };
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
        return { result: r, targetType: 'ENT', targetId: r.newEntityId, targetVersion: '1',
                 outboxEvent: { eventType: 'EntitySplit',
                                payload: { from: entityId, to: r.newEntityId, moved: r.moved } } };
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
        return { result: r, targetType: 'EDG', targetId: edgeId, targetVersion: '1',
                 outboxEvent: null };
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
        return { result: r, targetType: intake.objectType, targetId: objectId,
                 targetVersion: '1', outboxEvent: null };
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
        return { result: r, targetType: 'INV', targetId: r.invalidationId, targetVersion: '1',
                 outboxEvent: { eventType: 'DependencyInvalidated',
                                payload: { invalidation_id: r.invalidationId,
                                           trigger: p.triggerObjectId,
                                           assumptions: r.assumptions.length,
                                           objectives: r.objectives.length } } };
      });
    return { impact: out.result, receipt: receipt(out) };
  }

  /**
   * Corrections nothing has propagated yet.
   *
   * Propagation is operator-initiated: the outbox publishes `CorrectionApplied`
   * and no consumer subscribes to it, so a correction can sit with its downstream
   * impact unassessed. This route makes that queue visible instead of leaving it
   * to be noticed.
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
        + 'uncovered. Propagation is operator-initiated; no consumer performs it automatically.',
      receipt: receipt(out),
    };
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
