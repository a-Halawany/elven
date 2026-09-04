/**
 * Graph capabilities — the Phase 1 and Phase 2 capability discipline, applied to
 * L3–L4.
 *
 * One capability per action class. The relation is never a parameter, the
 * transaction is unreachable, and a handler receives a narrow interface with no
 * way to widen it. A resolver route cannot decide a resolution; a decision route
 * cannot assert an edge; a strategy route cannot touch an entity.
 *
 * These sit on top of migration 0024's ports, which bind every write to the
 * context's own bound action. Both layers must agree, and both are load-bearing:
 * the capability says what the handler CAN call, the port says what the context is
 * ALLOWED to have called.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

abstract class GraphCore {
  readonly #tx: Tx;
  readonly #action: string;

  protected constructor(tx: Tx, action: string) {
    this.#tx = tx;
    this.#action = action;
  }

  get action(): string { return this.#action; }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }

  protected async call<T>(fragment: { execute: (tx: Tx) => Promise<{ rows: T[] }> }): Promise<T[]> {
    return (await fragment.execute(this.#tx)).rows;
  }
}

// ───────────────────────── reads ─────────────────────────

/**
 * Everything Phase 3 reads, and nothing it does not.
 *
 * The canonical-object reader is how the resolver sees mentions and how search
 * reaches claims and evidence metadata. It is the SAME relation Phase 1 and 2
 * read, under the same row-level security — so a row outside the caller's scope
 * is not visible to the query at all, which is most of C4.
 */
export interface GraphReads {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEntities(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEntityEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readIdentifierSystems(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readIdentifiers(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readResolutions(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readResolutionEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEdges(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEdgeEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readStrategy(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readStrategyEvents(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readDependencies(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readInvalidations(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readClaimLineage(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCorrections(): any;
  /**
   * Edges VISIBLE at an instant, filtered in the query.
   *
   * The bound has to come after the temporal predicate or it is not a bound on
   * the answer, it is a bound on the search — and one eligible edge behind enough
   * newer rows simply disappears. `total` is the count of everything eligible, so
   * a caller can say whether the page it received was the whole answer.
   */
  edgesVisibleAt(a: { knownAt: string; validAt: string; limit: number }):
    Promise<{ rows: Array<Record<string, unknown>>; total: number }>;
  /**
   * Applied corrections whose propagation is not complete, filtered in the query.
   *
   * Filtering after a page has been taken loses old outstanding work behind newer
   * irrelevant rows, which is exactly what an outstanding-work list must not do.
   */
  correctionsOutstanding(a: { limit: number; before: string | null }):
    Promise<{ rows: Array<Record<string, unknown>>; total: number }>;
  rebuildProjections(): Promise<Array<{
    projection: string; live_rows: string; rebuilt_rows: string; mismatched: string;
  }>>;
}

// ───────────────────────── resolver ─────────────────────────

export interface ProposeResolutionArgs {
  resolutionId: string; tenantId: string; domainId: string;
  claimObjectId: string; claimVersion: number; mentionText: string; entityId: string;
  method: 'deterministic_identifier' | 'deterministic_name' | 'model_assisted' | 'human';
  ruleId: string; ruleVersion: string; score: number;
  matchEvidence: Record<string, unknown>;
  candidateSet: Array<Record<string, unknown>>;
  proposer: string; evidenceObjectId: string; evidenceDigest: string;
  mode: string | null; modelId: string | null; weights: string | null; runtime: string | null;
  promptDigest: string | null; decodingDigest: string | null; modelConfidence: number | null;
  callId: string | null; methodId: string | null; runId: string | null;
  identifierSystem: string | null; identifierValue: string | null;
  eventId: string; correlationId: string;
}

export interface ResolverWrites extends GraphReads {
  registerIdentifierSystem(a: {
    tenantId: string; domainId: string; systemKey: string; authority: string;
    description: string; isAuthoritative: boolean; actor: string; correlationId: string;
  }): Promise<void>;
  createEntity(a: {
    entityId: string; tenantId: string; domainId: string; entityType: string;
    canonicalName: string; normalizedName: string; actor: string;
    splitFrom: string | null; eventId: string; correlationId: string;
  }): Promise<void>;
  attachIdentifier(a: {
    identifierId: string; tenantId: string; domainId: string; entityId: string;
    systemKey: string; value: string; claimObjectId: string; evidenceObjectId: string;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
  /** The DATABASE decides whether this becomes an acceptance, never the caller. */
  proposeResolution(a: ProposeResolutionArgs): Promise<{ state: string; auto_accepted: boolean }>;
}

// ───────────────────────── resolution decisions ─────────────────────────

export interface ResolutionDecisionWrites extends GraphReads {
  decideResolution(a: {
    resolutionId: string; tenantId: string; domainId: string; state: 'accepted' | 'rejected';
    decider: string; reason: string;
    /** The entity the DECIDER chose, when it is not the one proposed. */
    targetEntityId: string | null;
    eventId: string; correlationId: string;
  }): Promise<void>;
}

export interface SplitWrites extends GraphReads {
  splitEntity(a: {
    newEntityId: string; tenantId: string; domainId: string; fromEntityId: string;
    resolutionIds: string[]; entityType: string; canonicalName: string;
    normalizedName: string; decider: string; reason: string;
    eventId: string; correlationId: string;
  }): Promise<{ moved: number }>;
}

// ───────────────────────── edges ─────────────────────────

export interface EdgeWrites extends GraphReads {
  assertEdge(a: {
    edgeId: string; tenantId: string; domainId: string; subject: string; predicate: string;
    object: string; validFrom: string; validTo: string | null; claimObjectId: string;
    claimVersion: number; evidenceObjectId: string; evidenceDigest: string;
    methodId: string | null; runId: string | null; mode: string; confidence: number;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

export interface EdgeRetractionWrites extends GraphReads {
  retractEdge(a: {
    edgeId: string; tenantId: string; domainId: string; actor: string; reason: string;
    eventId: string; correlationId: string;
  }): Promise<void>;
}

// ───────────────────────── strategy ─────────────────────────

export interface StrategyWrites extends GraphReads {
  /** Strategy objects go through the SAME canonical path Phases 0–2 use. */
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  declareStrategy(a: {
    objectId: string; tenantId: string; domainId: string; objectType: string;
    version: number; title: string; statement: string; status: string;
    verification: string; parent: string | null; owner: string; actor: string;
    eventId: string; correlationId: string;
  }): Promise<void>;
  linkDependency(a: {
    dependencyId: string; tenantId: string; domainId: string; dependent: string;
    dependentType: string; kind: string; target: string; rationale: string;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
  setAssumptionState(a: {
    objectId: string; tenantId: string; domainId: string; state: string; reason: string;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

// ───────────────────────── invalidation ─────────────────────────

export interface ImpactWrites extends GraphReads {
  openInvalidation(a: {
    invalidationId: string; tenantId: string; domainId: string; triggerKind: string;
    triggerObjectId: string; correctionCaseId: string | null; actor: string;
    eventId: string; correlationId: string;
  }): Promise<void>;
  recordImpact(a: {
    invalidationId: string; tenantId: string; domainId: string;
    assumptions: unknown[]; objectives: unknown[]; decisions: unknown[]; commitments: unknown[];
    statement: string;
    /** A bounded walk that stopped early is recorded as partial, never as assessed. */
    truncated: boolean; unexplored: unknown[];
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
  setAssumptionState(a: {
    objectId: string; tenantId: string; domainId: string; state: string; reason: string;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

// ───────────────────────── implementation ─────────────────────────

class GraphCapabilityImpl extends GraphCore
  implements ResolverWrites, ResolutionDecisionWrites, SplitWrites, EdgeWrites,
             EdgeRetractionWrites, StrategyWrites, ImpactWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEntities(): any { return this.from('graph.entities_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEntityEvents(): any { return this.from('graph.entity_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readIdentifierSystems(): any { return this.from('graph.identifier_systems'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readIdentifiers(): any { return this.from('graph.entity_identifiers'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readResolutions(): any { return this.from('graph.resolutions_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readResolutionEvents(): any { return this.from('graph.resolution_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEdges(): any { return this.from('graph.edges_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEdgeEvents(): any { return this.from('graph.edge_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readStrategy(): any { return this.from('graph.strategy_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readStrategyEvents(): any { return this.from('graph.strategy_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readDependencies(): any { return this.from('graph.dependencies'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readInvalidations(): any { return this.from('graph.invalidations_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCanonicalObjects(): any { return this.from('objects.canonical_objects'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readClaimLineage(): any { return this.from('intelligence.claim_lineage'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCorrections(): any { return this.from('observation.correction_current'); }

  async edgesVisibleAt(a: { knownAt: string; validAt: string; limit: number }):
    Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    const rows = await this.call<Record<string, unknown>>(sql`
      select * from graph.edges_current
       where asserted_at <= ${a.knownAt}::timestamptz
         and (retracted_at is null or retracted_at > ${a.knownAt}::timestamptz)
         and (superseded_at is null or superseded_at > ${a.knownAt}::timestamptz)
         and valid_from <= ${a.validAt}::timestamptz
         and (valid_to is null or valid_to > ${a.validAt}::timestamptz)
       order by asserted_at desc, edge_id
       limit ${a.limit}`);
    const counted = await this.call<{ n: string }>(sql`
      select count(*)::text n from graph.edges_current
       where asserted_at <= ${a.knownAt}::timestamptz
         and (retracted_at is null or retracted_at > ${a.knownAt}::timestamptz)
         and (superseded_at is null or superseded_at > ${a.knownAt}::timestamptz)
         and valid_from <= ${a.validAt}::timestamptz
         and (valid_to is null or valid_to > ${a.validAt}::timestamptz)`);
    return { rows, total: Number(counted[0]?.n ?? rows.length) };
  }

  async correctionsOutstanding(a: { limit: number; before: string | null }):
    Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    const rows = await this.call<Record<string, unknown>>(sql`
      select * from observation.correction_current
       where state = 'applied' and propagation_state <> 'complete'
         and (${a.before}::timestamptz is null or received_at < ${a.before}::timestamptz)
       order by received_at desc
       limit ${a.limit}`);
    const counted = await this.call<{ n: string }>(sql`
      select count(*)::text n from observation.correction_current
       where state = 'applied' and propagation_state <> 'complete'`);
    return { rows, total: Number(counted[0]?.n ?? rows.length) };
  }

  async rebuildProjections(): Promise<Array<{
    projection: string; live_rows: string; rebuilt_rows: string; mismatched: string;
  }>> {
    return this.call(sql`select projection, live_rows::text, rebuilt_rows::text,
                                mismatched::text from graph.rebuild_projections()`);
  }

  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(
      sql`select content_digest from objects.admit_version(
        ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('strategy admission returned no row');
    return { contentDigest: r.content_digest };
  }

  async registerIdentifierSystem(a: {
    tenantId: string; domainId: string; systemKey: string; authority: string;
    description: string; isAuthoritative: boolean; actor: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.register_identifier_system(
      ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.systemKey}, ${a.authority},
      ${a.description}, ${a.isAuthoritative}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }

  async createEntity(a: {
    entityId: string; tenantId: string; domainId: string; entityType: string;
    canonicalName: string; normalizedName: string; actor: string;
    splitFrom: string | null; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.create_entity(
      ${a.entityId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.entityType},
      ${a.canonicalName}, ${a.normalizedName}, ${a.actor}::uuid, ${a.splitFrom}::uuid,
      ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async attachIdentifier(a: {
    identifierId: string; tenantId: string; domainId: string; entityId: string;
    systemKey: string; value: string; claimObjectId: string; evidenceObjectId: string;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.attach_identifier(
      ${a.identifierId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.entityId}::uuid,
      ${a.systemKey}, ${a.value}, ${a.claimObjectId}::uuid, ${a.evidenceObjectId}::uuid,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async proposeResolution(a: ProposeResolutionArgs): Promise<{ state: string; auto_accepted: boolean }> {
    const rows = await this.call<{ state: string; auto_accepted: boolean }>(
      sql`select * from graph.propose_resolution(
        ${a.resolutionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
        ${a.claimObjectId}::uuid, ${a.claimVersion}::bigint, ${a.mentionText},
        ${a.entityId}::uuid, ${a.method}, ${a.ruleId}, ${a.ruleVersion}, ${a.score}::numeric,
        ${JSON.stringify(a.matchEvidence)}::jsonb, ${JSON.stringify(a.candidateSet)}::jsonb,
        ${a.proposer}::uuid, ${a.evidenceObjectId}::uuid, ${a.evidenceDigest},
        ${a.mode}, ${a.modelId}, ${a.weights}, ${a.runtime}, ${a.promptDigest},
        ${a.decodingDigest}, ${a.modelConfidence}::numeric, ${a.callId}::uuid,
        ${a.methodId}::uuid, ${a.runId}::uuid, ${a.identifierSystem}, ${a.identifierValue},
        ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
    const r = rows[0];
    if (r === undefined) throw new Error('resolution proposal returned no row');
    return r;
  }

  async decideResolution(a: {
    resolutionId: string; tenantId: string; domainId: string; state: 'accepted' | 'rejected';
    decider: string; reason: string; targetEntityId: string | null;
    eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.decide_resolution(
      ${a.resolutionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.state},
      ${a.decider}::uuid, ${a.reason}, ${a.targetEntityId}::uuid,
      ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async splitEntity(a: {
    newEntityId: string; tenantId: string; domainId: string; fromEntityId: string;
    resolutionIds: string[]; entityType: string; canonicalName: string;
    normalizedName: string; decider: string; reason: string;
    eventId: string; correlationId: string;
  }): Promise<{ moved: number }> {
    const rows = await this.call<{ moved: number }>(sql`select * from graph.split_entity(
      ${a.newEntityId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.fromEntityId}::uuid,
      ${a.resolutionIds}::uuid[], ${a.entityType}, ${a.canonicalName}, ${a.normalizedName},
      ${a.decider}::uuid, ${a.reason}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
    const r = rows[0];
    if (r === undefined) throw new Error('split returned no row');
    return r;
  }

  async assertEdge(a: {
    edgeId: string; tenantId: string; domainId: string; subject: string; predicate: string;
    object: string; validFrom: string; validTo: string | null; claimObjectId: string;
    claimVersion: number; evidenceObjectId: string; evidenceDigest: string;
    methodId: string | null; runId: string | null; mode: string; confidence: number;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.assert_edge(
      ${a.edgeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.subject}::uuid,
      ${a.predicate}, ${a.object}::uuid, ${a.validFrom}::timestamptz, ${a.validTo}::timestamptz,
      ${a.claimObjectId}::uuid, ${a.claimVersion}::bigint, ${a.evidenceObjectId}::uuid,
      ${a.evidenceDigest}, ${a.methodId}::uuid, ${a.runId}::uuid, ${a.mode},
      ${a.confidence}::numeric, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async retractEdge(a: {
    edgeId: string; tenantId: string; domainId: string; actor: string; reason: string;
    eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.retract_edge(
      ${a.edgeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid,
      ${a.reason}, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async declareStrategy(a: {
    objectId: string; tenantId: string; domainId: string; objectType: string;
    version: number; title: string; statement: string; status: string;
    verification: string; parent: string | null; owner: string; actor: string;
    eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.declare_strategy(
      ${a.objectId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectType},
      ${a.version}::bigint, ${a.title}, ${a.statement}, ${a.status}, ${a.verification},
      ${a.parent}::uuid, ${a.owner}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid,
      ${a.correlationId}::uuid)`);
  }

  async linkDependency(a: {
    dependencyId: string; tenantId: string; domainId: string; dependent: string;
    dependentType: string; kind: string; target: string; rationale: string;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.link_dependency(
      ${a.dependencyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.dependent}::uuid,
      ${a.dependentType}, ${a.kind}, ${a.target}::uuid, ${a.rationale}, ${a.actor}::uuid,
      ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async setAssumptionState(a: {
    objectId: string; tenantId: string; domainId: string; state: string; reason: string;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.set_assumption_state(
      ${a.objectId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.state}, ${a.reason},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async openInvalidation(a: {
    invalidationId: string; tenantId: string; domainId: string; triggerKind: string;
    triggerObjectId: string; correctionCaseId: string | null; actor: string;
    eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.open_invalidation(
      ${a.invalidationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.triggerKind},
      ${a.triggerObjectId}::uuid, ${a.correctionCaseId}::uuid, ${a.actor}::uuid,
      ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async recordImpact(a: {
    invalidationId: string; tenantId: string; domainId: string;
    assumptions: unknown[]; objectives: unknown[]; decisions: unknown[]; commitments: unknown[];
    statement: string; truncated: boolean; unexplored: unknown[];
    actor: string; eventId: string; correlationId: string;
  }): Promise<void> {
    await this.call(sql`select graph.record_impact(
      ${a.invalidationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
      ${JSON.stringify(a.assumptions)}::jsonb, ${JSON.stringify(a.objectives)}::jsonb,
      ${JSON.stringify(a.decisions)}::jsonb, ${JSON.stringify(a.commitments)}::jsonb,
      ${a.statement}, ${a.truncated}, ${JSON.stringify(a.unexplored)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
}

export const GraphCapability = {
  read(tx: Tx, action: string): GraphReads {
    return new GraphCapabilityImpl(tx, action);
  },
  resolver(tx: Tx, action: string): ResolverWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  decision(tx: Tx, action: string): ResolutionDecisionWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  split(tx: Tx, action: string): SplitWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  edges(tx: Tx, action: string): EdgeWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  edgeRetraction(tx: Tx, action: string): EdgeRetractionWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  strategy(tx: Tx, action: string): StrategyWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  impact(tx: Tx, action: string): ImpactWrites {
    return new GraphCapabilityImpl(tx, action);
  },
};
