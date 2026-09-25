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
import type { ProjectionName } from './projections/projection-state.js';

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

  /**
   * A port refusal the caller EXPECTS and records (the builder's port refusing a derivation; a hold refusing a
   * tombstone) must not leave the enclosing transaction aborted — PostgreSQL ignores every later statement of an
   * aborted transaction until it ends. The refusable call runs under a savepoint: refused, the savepoint is rolled
   * back and the transaction goes on; admitted, the savepoint is released (B9-F2).
   */
  async withSavepoint<T>(name: string, run: () => Promise<T>): Promise<T> {
    const sp = name.replace(/[^a-z0-9_]/gi, '');
    await sql.raw(`savepoint ${sp}`).execute(this.#tx);
    try {
      const out = await run();
      await sql.raw(`release savepoint ${sp}`).execute(this.#tx);
      return out;
    } catch (e) {
      await sql.raw(`rollback to savepoint ${sp}`).execute(this.#tx);
      throw e;
    }
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
/** Where the previous page of outstanding work ended: both key columns, exactly. */
export interface OutstandingCursor {
  /** The timestamp as PostgreSQL renders it — microseconds and all. */
  receivedAt: string;
  caseId: string;
}

export interface GraphReads {
  /** B9-F2: run a refusable port call under a savepoint so an expected refusal leaves the transaction usable. */
  withSavepoint<T>(name: string, run: () => Promise<T>): Promise<T>;
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
  /** G2 (B10): the review cases — the person's decision on a claim version lives here, not on the claim's payload. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readReviewCases(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCorrections(): any;
  /** Phase 4 dependents the walk may reach: forecasts, scenarios and warnings. */
  readForecasts(): any;
  readScenarios(): any;
  readWarnings(): any;
  /** Phase 5 dependents: twins (versions marked unverified by the port) and simulation runs (surfaced). */
  readTwins(): any;
  readRuns(): any;
  /** CP-6 B1 (0060): the domain's propagation agents and the attempts the consumer recorded. */
  readPropagationAgents(): any;
  readPropagationAttempts(): any;
  readPropagationAttemptEvents(): any;
  /** CP-6 B6 (0063): the subscription registry, the delivery ledger, the retrieval checks and the mapping proposals. */
  readSubscriptions(): any;
  readSubscriptionEvents(): any;
  readSubscriptionDeliveries(): any;
  readSubscriptionDeliveryEvents(): any;
  readRetrievalChecks(): any;
  readMappingReconciliations(): any;
  readEntityIdentifiers(): any;
  /** 0064 (AU-MEM-0041): execution-state telemetry per delivery and per propagation attempt, from the ledgers. */
  readSubscriptionTelemetry(): any;
  readPropagationTelemetry(): any;
  /** 0065: who serves the domain's subscription queue, the hand-over ledger, and the outbox partitions' state. */
  readSubscriptionServing(): any;
  readSubscriptionServingEvents(): any;
  outboxPartitionTelemetry(): Promise<Array<Record<string, unknown>>>;
  /** 0065 §5: the forecast, scenario (warning), reconciliation and simulation flows' telemetry views (AU-MEM-0041). */
  readForecastTelemetry(): any;
  readWarningTelemetry(): any;
  readReconciliationTelemetry(): any;
  readRunTelemetry(): any;
  /** 0065 §6: the fifty canonical layer interfaces under their identities (AU-DP-0071). */
  readInterfaceRegister(): any;
  /** 0065 §8: the briefings the walk may reach (AU-MEM-0031). */
  readBriefings(): any;
  /** 0066 §7: the domain's ontology versions and their events. */
  readOntologyVersions(): any;
  readOntologyEvents(): any;
  /** 0066 §3: memory items — the current version of each, their events and their access ledger (AU-MEM-0065, AU-MEM-0031). */
  readMemoryItems(): any;
  readMemoryItemEvents(): any;
  readMemoryItemAccess(): any;
  /** B19 (0079): what a DERIVATION reads beside the claim, its lineage, its review case and the warning — the evidence's source contract, the series registered on it, the warning's indicator (structural picks; reads only). */
  readSourceContracts(): any;
  readSeriesRegistry(): any;
  readIndicators(): any;
  /**
   * What is subscribed to a change at PUBLICATION time — evidence the event carries, never authority
   * (the dispatcher re-resolves at delivery). Total: an empty list outside a DOMAIN context.
   */
  subscriptionsMatching(a: { tenantId: string; domainId: string; eventType: 'GraphChanged' | 'MemoryCorrected'; changeKind: string }): Promise<Array<{ subscription_id: string; consumer_kind: string }>>;
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
  correctionsOutstanding(a: { limit: number; cursor: OutstandingCursor | null }):
    Promise<{ rows: Array<Record<string, unknown>>; total: number }>;
  /**
   * B20 (0080): the check is SYMMETRIC — the rows in both whose state differs (`mismatched`), the rows the log has and the
   * projection lacks (`missing`), the rows the projection has and the log does not know (`unexpected`: the poisoned rows) —
   * six rows (the memory projection is the sixth) with whether the partition was verified under the current derivation rule.
   * Still a COMPARISON: the writer is `rebuildProjection` on the projections capability.
   */
  rebuildProjections(): Promise<Array<{
    projection: string; live_rows: string; rebuilt_rows: string; mismatched: string; missing: string; unexpected: string; representation_ok: boolean;
  }>>;
  /** B20 (0080): the six partitions' state with the DERIVED watermark — graph.projection_state() under the established context (one call, six rows). */
  projectionState(): Promise<Array<Record<string, unknown>>>;
  /** B20: the partition rows and their ledger (the subscriptions page reads the ledger; the state comes from projectionState). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readProjectionPartitions(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readProjectionEvents(): any;
  /** B20: the ONE derivation, read as the CALLER under the event tables' forced RLS — the fallback readers' source while a partition is withdrawn. */
  expected(projection: ProjectionName, a: { tenantId: string; domainId: string }): Promise<Array<Record<string, unknown>>>;
  /* B23 (0084) revision */
  /** B23 (0084 §1, §2): the domain's revision head (one row per domain once it has a graph write since 0084), the revision ledger and its items (FORCE RLS by tenant/domain). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRevisionHeads(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRevisions(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRevisionItems(): any;
  /* end B23 revision */
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
  /** CP-6 B6 (0063): a person decides a memory-mapping reconciliation the subscriber proposed. */
  decideMappingReconciliation(a: { reconciliationId: string; tenantId: string; domainId: string; state: 'accepted' | 'rejected'; reason: string; actor: string; correlationId: string }): Promise<void>;
  /** 0065 §7 (TT-04): a person decides that a relationship pending reassessment STANDS under its changed basis (a model retired, evidence corrected). */
  keepEdgeUnderReassessment(a: { edgeId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<void>;
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

// ───────────────────────── ontology (0066 §7) ─────────────────────────

export interface OntologyWrites extends GraphReads {
  proposeOntologyVersion(a: { versionId: string; tenantId: string; domainId: string; namespace: string; entityTypes: string[]; predicates: Array<Record<string, unknown>>; rationale: string; alternatives: unknown[]; migrationPlan: string | null; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  decideOntologyProposal(a: { versionId: string; tenantId: string; domainId: string; decision: 'approve' | 'reject'; reason: string; reviews: Record<string, unknown>; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}

// ───────────────────────── memory items (0066 §3) ─────────────────────────

export interface MemoryWrites extends GraphReads {
  /** A memory item's version is a canonical MEM object, admitted through the same path every canonical object takes. */
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  /** B19 (0079): `derivation` is the block memory.record_item validates for a DERIVED record (memory.item.derive; a re-derivation under memory.item.supersede) — null for a person's own record; passed explicitly either way. */
  recordMemoryItem(a: { itemId: string; tenantId: string; domainId: string; version: number; record: Record<string, unknown>; cites: Array<{ kind: string; id: string; rationale: string }>; actor: string; eventId: string; correlationId: string; derivation?: Record<string, unknown> | null }): Promise<void>;
  withdrawMemoryItem(a: { itemId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<void>;
  /** OBJ-15: the access ledger row of a retrieval, written inside the read's own transaction. */
  recordMemoryAccess(a: { itemId: string; tenantId: string; domainId: string; version: number; purpose: string; reader: string; asOf: string | null; correlationId: string }): Promise<string>;
  /**
   * B20 (0080, D9): the content tier did not answer — the retrieval served the item's METADATA only and records THIS ledger row
   * (memory.retrieval_degraded), never an access row (memory.item_access requires the served version; nothing was served).
   */
  recordRetrievalDegraded(a: { itemId: string; tenantId: string; domainId: string; version: number; purpose: string; reader: string; cause: 'content_unavailable'; detail: string; correlationId: string }): Promise<string>;
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
    /** Phase 4: forecasts the walk reached, marked for attention by the port. */
    forecasts: unknown[];
    /** Phase 5: twins whose citing versions the port marks unverified, and runs it surfaces. */
    twins: unknown[]; simulations: unknown[];
    /** 0065 §8: warnings the port marks for attention and briefings it re-flags (AU-MEM-0031); 0066 §3: memory items marked for attention. */
    warnings?: unknown[]; briefings?: unknown[]; memoryItems?: unknown[];
    statement: string;
    /** A bounded walk that stopped early is recorded as partial, never as assessed. */
    truncated: boolean; unexplored: unknown[];
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
  setAssumptionState(a: {
    objectId: string; tenantId: string; domainId: string; state: string; reason: string;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
  /**
   * CP-6 B1 (0060): the automatic walker's per-root checkpoint, inside the walk's own
   * transaction. `begin` locks the attempt row until the impact record commits and
   * answers false for a root already walked for this event (a typed skip, never a
   * second walk); `done` binds the root to the assessed invalidation it produced.
   */
  propagationRootBegin(a: { eventId: string; tenantId: string; domainId: string; root: string }): Promise<boolean>;
  propagationRootDone(a: { eventId: string; tenantId: string; domainId: string; root: string; invalidationId: string; truncated: boolean }): Promise<void>;
}

// ───────────────────────── subscriptions (CP-6 B6) ─────────────────────────

export interface SubscriptionWrites extends GraphReads {
  registerSubscription(a: {
    subscriptionId: string; tenantId: string; domainId: string; consumerKind: string; eventTypes: string[]; filter: Record<string, unknown>;
    principalId: string; version: string; codeDigest: string; owner: string; budgets: Record<string, unknown>; actor: string; eventId: string; correlationId: string;
  }): Promise<{ subscription_id: string; consumer_kind: string; principal_id: string; version: string; code_digest: string; budgets: Record<string, unknown> }>;
  setSubscriptionStatus(a: { subscriptionId: string; tenantId: string; domainId: string; to: 'active' | 'paused' | 'revoked'; reason: string; actor: string; eventId: string; correlationId: string }): Promise<string>;
  replaySubscription(a: { subscriptionId: string; tenantId: string; domainId: string; fromCreatedAt: string | null; fromEventId: string | null; reason: string; actor: string; eventId: string; correlationId: string }):
    Promise<Array<{ event_id: string; event_type: string; change_kind: string; outbox_created_at: string; correlation_id: string; causation_id: string; replay_seq: number }>>;
  /** 0064: a replay from a sequence in the declared partition (the cursor's ordinal) — the same act, the point named by its ordinal. */
  replaySubscriptionFromSeq(a: { subscriptionId: string; tenantId: string; domainId: string; fromSeq: number; reason: string; actor: string; eventId: string; correlationId: string }):
    Promise<Array<{ event_id: string; event_type: string; change_kind: string; outbox_created_at: string; correlation_id: string; causation_id: string; replay_seq: number }>>;
}

/** The retrieval and memory-mapping consumers' effects (graph-side), driven by the subscriber's own action. */
/** What the relationships consumer holds under its one action: the subscriber's ports and the builder's assert (0066 §2). */
export type RelationshipSubscriberWrites = GraphSubscriberWrites & EdgeWrites;
export interface GraphSubscriberWrites extends GraphReads {
  /** 0063; 0080 (B20): the recorded `mismatched` is the SUM mismatched + missing + unexpected + (NOT representation_ok), each `projections[]` row carries the four counts and `failed`, and `withdrawn` names the partitions the check took out of service in its own transaction ([{ projection, changed, withdrawn_since }]). */
  recordRetrievalCheck(a: { checkId: string; eventId: string; subscriptionId: string; tenantId: string; domainId: string; touched: Record<string, unknown>; actor: string; correlationId: string }):
    Promise<{ check_id: string; projections: unknown[]; mismatched: number; withdrawn: Array<{ projection: string; changed: boolean; withdrawn_since: string | null }> }>;
  proposeMappingReconciliation(a: { reconciliationId: string; tenantId: string; domainId: string; subjectKind: 'identifier' | 'edge' | 'resolution'; subjectId: string; fromEntityId: string | null; toEntityId: string | null;
    basis: string; causeEventId: string; subscriptionId: string; actor: string; correlationId: string }): Promise<string | null>;
  /** 0065 §7 (TT-04): open a reassessment on an edge whose inference record's basis moved (evidence or claim); false when already pending or not asserted. */
  openEdgeReassessment(a: { edgeId: string; tenantId: string; domainId: string; trigger: 'evidence' | 'claim' | 'model'; reason: string; causeId: string; actor: string; correlationId: string }): Promise<boolean>;
}

// ───────────────────────── propagation agent (CP-6 B1) ─────────────────────────

export interface PropagationAgentWrites extends GraphReads {
  registerPropagationAgent(a: {
    agentId: string; tenantId: string; domainId: string; principalId: string; version: string; codeDigest: string;
    owner: string; budgets: Record<string, unknown>; actor: string; eventId: string; correlationId: string;
  }): Promise<{ agent_id: string; principal_id: string; version: string; code_digest: string; budgets: Record<string, unknown> }>;
  revokePropagationAgent(a: { agentId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<void>;
}

// ───────────────────────── projections (CP-6 B20) ─────────────────────────

/**
 * The two governed acts on a projection partition (0080 §5, §7): the operator's WITHDRAWAL (idempotent — a second withdrawal
 * is a second ledger row with `changed: false` and the earlier reason kept; no outbox event, a withdrawal changes no fact of
 * the graph) and the REBUILD — the only transition from withdrawn to serving, under a per-partition advisory lock, from the
 * ONE derivation the check uses; its answer is the port's own report (outcome rebuilt | restored | refused), never rethrown
 * by the capability (a refusal is an outcome on the ledger, not a lost transaction — the B18.1 `copies_refused` idiom).
 */
export interface ProjectionWrites extends GraphReads {
  /** The operator's withdrawal (graph.projection.withdraw): idempotent; the answer says whether the state changed. The operator passes NO check id. */
  withdrawProjection(a: { eventId: string; tenantId: string; domainId: string; projection: ProjectionName; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  /** The rebuild (graph.projection.rebuild): outcome rebuilt | restored | refused with the report — the port's own answer, never rethrown by the capability. */
  rebuildProjection(a: { rebuildId: string; tenantId: string; domainId: string; projection: ProjectionName; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}

/* B23 (0084) context */
// ───────────────────────── the context query (CP-6 B23, L3-I02) ─────────────────────────

/**
 * L3-I02 RetrieveContext (0084 §2): ONE purpose-bound query — memory.retrieve_context, STABLE (it cannot write) and SECURITY
 * INVOKER (the caller's RLS) — and the access ledger of each item it serves (memory.record_access under memory.context.retrieve).
 * Nothing else: the query's handler cannot record, supersede or withdraw an item, and cannot touch a partition.
 */
export interface MemoryContextReads extends GraphReads {
  /**
   * The query's one jsonb answer (0084 §2; B23-F1, 0085): items (filtered by the purpose AND the reader's policy — its clearance, its
   * roles, whether it administers — with explanation links and withheld-link counts), content_absent_rows and bounded, both over the
   * same AUTHORIZED set (no unverified_rows: rows the log cannot vouch for are neither counted nor mentioned).
   */
  retrieveContext(a: { tenantId: string; domainId: string; purpose: string; subject: unknown; asOf: string | null; scanBound: number; withdrawn: readonly ProjectionName[];
    clearance: string; roles: readonly string[]; admin: boolean }): Promise<Record<string, unknown>>;
  /** OBJ-15's access row for each SERVED item version, inside the read's own transaction (the governance record of the read). */
  recordMemoryAccess(a: { itemId: string; tenantId: string; domainId: string; version: number; purpose: string; reader: string; asOf: string | null; correlationId: string }): Promise<string>;
}
/* end B23 context */
/* B23 (0084) revision */
// ───────────────────────── graph revisions (CP-6 B23, L4-I02) ─────────────────────────

/** What graph.commit_revision answers (0084 §3): the revision, the head it was made against, the ids it wrote — or, for a repeat, the first answer with `repeated: true` and the head now. */
export interface RevisionAnswer {
  revision_id: string; revision: number; expected: number; idempotency_key: string; request_digest: string; ontology_version_id: string | null;
  counts: Record<string, number>;
  node_ids: Array<{ ordinal: number; ref: string; entity_id: string; entity_type: string; canonical_name: string; claim_object_id: string; claim_version: number }>;
  identifier_ids: Array<Record<string, unknown>>;
  edge_ids: Array<{ ordinal: number; edge_id: string; predicate: string; subject_entity_id: string; object_entity_id: string; subject_ref: string | null; object_ref: string | null;
                    valid_from: string; valid_to: string | null; claim_object_id: string; claim_version: number; evidence_object_id: string }>;
  superseded_edges: Array<{ edge_id: string; superseded_by: string; claim_object_id: string }>;
  committed_at: string; committed_by: string; repeated: boolean;
  /** On a repeat only: the domain's head when the retry was answered. */
  head?: number;
}

/**
 * The ONE write a change set is (graph.revision.commit): the port validates every item and applies them in order, or refuses
 * and nothing is applied. The capability reads what every graph capability reads (the subscriptions matching at publication).
 */
export interface RevisionWrites extends GraphReads {
  commitRevision(a: { revisionId: string; tenantId: string; domainId: string; changeSet: Record<string, unknown>; expectedRevision: number; idempotencyKey: string; actor: string; correlationId: string }): Promise<RevisionAnswer>;
}
/* end B23 revision */

// ───────────────────────── implementation ─────────────────────────

class GraphCapabilityImpl extends GraphCore
  implements ResolverWrites, ResolutionDecisionWrites, SplitWrites, EdgeWrites,
             EdgeRetractionWrites, StrategyWrites, MemoryWrites, OntologyWrites, ImpactWrites, PropagationAgentWrites, SubscriptionWrites, GraphSubscriberWrites, ProjectionWrites,
             MemoryContextReads,
             RevisionWrites {
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
  readReviewCases(): any { return this.from('intelligence.review_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCorrections(): any { return this.from('observation.correction_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readForecasts(): any { return this.from('prediction.forecasts_current'); }
  readTwins(): any { return this.from('twin.twins_current'); }
  readRuns(): any { return this.from('simulation.runs_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readPropagationAgents(): any { return this.from('graph.propagation_agents'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readPropagationAttempts(): any { return this.from('graph.propagation_attempts'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readPropagationAttemptEvents(): any { return this.from('graph.propagation_attempt_events'); }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  readSubscriptions(): any { return this.from('graph.subscriptions'); }
  readSubscriptionEvents(): any { return this.from('graph.subscription_events'); }
  readSubscriptionDeliveries(): any { return this.from('graph.subscription_deliveries'); }
  readSubscriptionDeliveryEvents(): any { return this.from('graph.subscription_delivery_events'); }
  readRetrievalChecks(): any { return this.from('graph.retrieval_checks'); }
  readMappingReconciliations(): any { return this.from('graph.mapping_reconciliations'); }
  readEntityIdentifiers(): any { return this.from('graph.entity_identifiers'); }
  readSubscriptionTelemetry(): any { return this.from('graph.subscription_delivery_telemetry'); }
  readPropagationTelemetry(): any { return this.from('graph.propagation_attempt_telemetry'); }
  readSubscriptionServing(): any { return this.from('graph.subscription_domain_serving'); }
  readSubscriptionServingEvents(): any { return this.from('graph.subscription_serving_events'); }
  async outboxPartitionTelemetry(): Promise<Array<Record<string, unknown>>> { return this.call<Record<string, unknown>>(sql`select * from objects.outbox_partition_telemetry()`); }
  readForecastTelemetry(): any { return this.from('prediction.forecast_telemetry'); }
  readWarningTelemetry(): any { return this.from('prediction.warning_telemetry'); }
  readReconciliationTelemetry(): any { return this.from('twin.reconciliation_telemetry'); }
  readRunTelemetry(): any { return this.from('simulation.run_telemetry'); }
  readInterfaceRegister(): any { return this.from('objects.interface_register'); }
  readBriefings(): any { return this.from('executive.briefings'); }
  readOntologyVersions(): any { return this.from('graph.ontology_versions'); }
  readOntologyEvents(): any { return this.from('graph.ontology_events'); }
  readMemoryItems(): any { return this.from('memory.items_current'); }
  readMemoryItemEvents(): any { return this.from('memory.item_events'); }
  readMemoryItemAccess(): any { return this.from('memory.item_access'); }
  // B19: the derivation's structural picks — FORCE RLS by tenant/domain on all three; a DOMAIN context reads its own rows.
  readSourceContracts(): any { return this.from('observation.source_contracts_current'); }
  readSeriesRegistry(): any { return this.from('prediction.series_registry'); }
  readIndicators(): any { return this.from('prediction.indicators_current'); }
  // B20 (0080): the partition rows and their append-only ledger (FORCE RLS by tenant/domain; a DOMAIN context reads its own six).
  readProjectionPartitions(): any { return this.from('graph.projection_partitions'); }
  readProjectionEvents(): any { return this.from('graph.projection_events'); }
  /* B23 (0084) revision */
  readRevisionHeads(): any { return this.from('graph.revision_heads'); }
  readRevisions(): any { return this.from('graph.revisions'); }
  readRevisionItems(): any { return this.from('graph.revision_items'); }
  /* end B23 revision */
  /* eslint-enable @typescript-eslint/no-explicit-any */
  async projectionState(): Promise<Array<Record<string, unknown>>> { return this.call<Record<string, unknown>>(sql`select * from graph.projection_state()`); }
  /**
   * The ONE derivation (0080 §2) read as the CALLER: `LANGUAGE sql STABLE`, no definer — the event tables' forced RLS applies
   * to this read exactly as to every other read of the capability (policy equivalence: nothing widens while a partition is
   * withdrawn). The six names are the six functions; anything else is a programming error, not a request.
   */
  async expected(projection: ProjectionName, a: { tenantId: string; domainId: string }): Promise<Array<Record<string, unknown>>> {
    switch (projection) {
      case 'entities_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_entities(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'resolutions_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_resolutions(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'edges_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_edges(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'strategy_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_strategy(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'invalidations_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_invalidations(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'memory_items_current': return this.call<Record<string, unknown>>(sql`select * from memory.expected_items(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      default: throw new Error(`${String(projection)} is not a projection`);
    }
  }
  async subscriptionsMatching(a: { tenantId: string; domainId: string; eventType: 'GraphChanged' | 'MemoryCorrected'; changeKind: string }): Promise<Array<{ subscription_id: string; consumer_kind: string }>> {
    const rows = await this.call<{ s: Array<{ subscription_id: string; consumer_kind: string }> }>(sql`select graph.subscriptions_matching(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.eventType}, ${a.changeKind}) as s`);
    return rows[0]?.s ?? [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readScenarios(): any { return this.from('prediction.scenarios_current'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readWarnings(): any { return this.from('prediction.warnings_current'); }

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

  /*
   * A COMPOSITE, PRECISION-PRESERVING CURSOR.
   *
   * `received_at` alone with a strict `<` skipped every other case sharing the
   * instant, and a cursor rendered through a JavaScript Date lost the column's
   * microseconds — so even the composite key could skip rows in the same
   * millisecond. The key is (received_at, case_id), compared as a row value in
   * the same order the page is sorted, and the timestamp travels as the text
   * PostgreSQL itself renders, microseconds included.
   */
  async correctionsOutstanding(a: { limit: number; cursor: OutstandingCursor | null }):
    Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    // The latest automatic attempt per case (0060) rides along, visible under the reader's own scope.
    const rows = await this.call<Record<string, unknown>>(sql`
      select c.*,
             to_char(c.received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
               as cursor_received_at,
             pa.automatic_state, pa.automatic_deliveries, pa.automatic_attempts, pa.automatic_last_error,
             pa.automatic_last_delivered_at, pa.automatic_agent_id, pa.automatic_event_id
        from observation.correction_current c
        left join lateral (
          select a.state as automatic_state, a.deliveries as automatic_deliveries, a.attempts as automatic_attempts,
                 a.last_error as automatic_last_error, a.last_delivered_at as automatic_last_delivered_at,
                 a.agent_id::text as automatic_agent_id, a.event_id::text as automatic_event_id
            from graph.propagation_attempts a
           where a.case_id = c.case_id
           order by a.last_delivered_at desc limit 1) pa on true
       where c.state = 'applied' and c.propagation_state <> 'complete'
         and (${a.cursor === null}::boolean
              or (c.received_at, c.case_id)
                 < (${a.cursor?.receivedAt ?? null}::timestamptz, ${a.cursor?.caseId ?? null}::uuid))
       order by c.received_at desc, c.case_id desc
       limit ${a.limit}`);
    const counted = await this.call<{ n: string }>(sql`
      select count(*)::text n from observation.correction_current
       where state = 'applied' and propagation_state <> 'complete'`);
    return { rows, total: Number(counted[0]?.n ?? rows.length) };
  }

  async rebuildProjections(): Promise<Array<{
    projection: string; live_rows: string; rebuilt_rows: string; mismatched: string; missing: string; unexpected: string; representation_ok: boolean;
  }>> {
    // B20 (0080): the seven columns of the symmetric check — the counts as text (bigint), the representation as a boolean.
    return this.call(sql`select projection, live_rows::text, rebuilt_rows::text, mismatched::text,
                                missing::text, unexpected::text, representation_ok from graph.rebuild_projections()`);
  }

  async proposeOntologyVersion(a: Parameters<OntologyWrites['proposeOntologyVersion']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select graph.propose_ontology_version(${a.versionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.namespace}, ${a.entityTypes}::text[], ${JSON.stringify(a.predicates)}::jsonb, ${a.rationale}, ${JSON.stringify(a.alternatives)}::jsonb, ${a.migrationPlan}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async decideOntologyProposal(a: Parameters<OntologyWrites['decideOntologyProposal']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select graph.decide_ontology_proposal(${a.versionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.reason}, ${JSON.stringify(a.reviews)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async recordMemoryItem(a: Parameters<MemoryWrites['recordMemoryItem']>[0]): Promise<void> {
    // B19 (0079): the tenth argument is the derivation block — null::jsonb for a person's own record, passed explicitly so the call reads as what it is.
    await this.call(sql`select memory.record_item(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}, ${JSON.stringify(a.record)}::jsonb, ${JSON.stringify(a.cites)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid, ${a.derivation === undefined || a.derivation === null ? null : JSON.stringify(a.derivation)}::jsonb)`);
  }
  async withdrawMemoryItem(a: Parameters<MemoryWrites['withdrawMemoryItem']>[0]): Promise<void> {
    await this.call(sql`select memory.withdraw_item(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async recordMemoryAccess(a: Parameters<MemoryWrites['recordMemoryAccess']>[0]): Promise<string> {
    const rows = await this.call<{ id: string }>(sql`select memory.record_access(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}, ${a.purpose}, ${a.reader}::uuid, ${a.asOf}::timestamptz, ${a.correlationId}::uuid) as id`);
    return rows[0]?.id ?? '';
  }
  async recordRetrievalDegraded(a: Parameters<MemoryWrites['recordRetrievalDegraded']>[0]): Promise<string> {
    const rows = await this.call<{ id: string }>(sql`select memory.record_retrieval_degraded(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.purpose}, ${a.reader}::uuid, ${a.cause}, ${a.detail}, ${a.correlationId}::uuid) as id`);
    return rows[0]?.id ?? '';
  }
  // B20 (0080 §5): the operator's withdrawal passes NO check id (null); the retrieval subscriber's path is the port's own, inside graph.record_retrieval_check.
  async withdrawProjection(a: Parameters<ProjectionWrites['withdrawProjection']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select graph.withdraw_projection(${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.projection}, ${a.reason}, null::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  // B20 (0080 §7): the report is the port's answer in every outcome (rebuilt | restored | refused); the port's REFUSALS (the standing, the name, the reason, a serving partition) are raised and mapped.
  async rebuildProjection(a: Parameters<ProjectionWrites['rebuildProjection']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select graph.rebuild_projection(${a.rebuildId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.projection}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  /* B23 (0084) context */
  // The subject is passed as the caller sent it (the port validates its shape: 22023 'memory context rejected: …'); the withdrawn
  // partitions are the ones the route read FIRST in its transaction (the source decision is the route's, the B20 idiom).
  async retrieveContext(a: Parameters<MemoryContextReads['retrieveContext']>[0]): Promise<Record<string, unknown>> {
    const subject = a.subject === undefined ? null : JSON.stringify(a.subject);
    // B23-F1 (0085): the reader's policy is the query's own argument, so every aggregate it answers is over the authorized set.
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select memory.retrieve_context(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.purpose}, ${subject}::jsonb, ${a.asOf}::timestamptz, ${a.scanBound}::int, ${[...a.withdrawn]}::text[],
      ${a.clearance}, ${[...a.roles]}::text[], ${a.admin}::boolean) as r`);
    return rows[0]?.r ?? {};
  }
  /* end B23 context */
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
    forecasts: unknown[]; twins: unknown[]; simulations: unknown[];
    statement: string; truncated: boolean; unexplored: unknown[];
    actor: string; eventId: string; correlationId: string;
    /** 0065 §8: the warnings marked for attention and the briefings re-flagged by the assessment; 0066 §3: the memory items marked. */
    warnings?: unknown[]; briefings?: unknown[]; memoryItems?: unknown[];
  }): Promise<void> {
    await this.call(sql`select graph.record_impact(
      ${a.invalidationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
      ${JSON.stringify(a.assumptions)}::jsonb, ${JSON.stringify(a.objectives)}::jsonb,
      ${JSON.stringify(a.decisions)}::jsonb, ${JSON.stringify(a.commitments)}::jsonb,
      ${JSON.stringify(a.forecasts)}::jsonb, ${JSON.stringify(a.twins)}::jsonb, ${JSON.stringify(a.simulations)}::jsonb,
      ${a.statement}, ${a.truncated}, ${JSON.stringify(a.unexplored)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid,
      ${JSON.stringify(a.warnings ?? [])}::jsonb, ${JSON.stringify(a.briefings ?? [])}::jsonb, ${JSON.stringify(a.memoryItems ?? [])}::jsonb)`);
  }

  async propagationRootBegin(a: { eventId: string; tenantId: string; domainId: string; root: string }): Promise<boolean> {
    const rows = await this.call<{ ok: boolean }>(sql`select graph.propagation_root_begin(
      ${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.root}::uuid) as ok`);
    return rows[0]?.ok === true;
  }

  async propagationRootDone(a: { eventId: string; tenantId: string; domainId: string; root: string; invalidationId: string; truncated: boolean }): Promise<void> {
    await this.call(sql`select graph.propagation_root_done(
      ${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.root}::uuid, ${a.invalidationId}::uuid, ${a.truncated})`);
  }

  async registerPropagationAgent(a: {
    agentId: string; tenantId: string; domainId: string; principalId: string; version: string; codeDigest: string;
    owner: string; budgets: Record<string, unknown>; actor: string; eventId: string; correlationId: string;
  }): Promise<{ agent_id: string; principal_id: string; version: string; code_digest: string; budgets: Record<string, unknown> }> {
    const rows = await this.call<{ r: { agent_id: string; principal_id: string; version: string; code_digest: string; budgets: Record<string, unknown> } }>(sql`
      select graph.register_propagation_agent(
        ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid, ${a.version}, ${a.codeDigest},
        ${a.owner}::uuid, ${JSON.stringify(a.budgets)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r as { agent_id: string; principal_id: string; version: string; code_digest: string; budgets: Record<string, unknown> };
  }

  async revokePropagationAgent(a: { agentId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<void> {
    await this.call(sql`select graph.revoke_propagation_agent(
      ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async registerSubscription(a: Parameters<SubscriptionWrites['registerSubscription']>[0]) {
    const rows = await this.call<{ r: { subscription_id: string; consumer_kind: string; principal_id: string; version: string; code_digest: string; budgets: Record<string, unknown> } }>(sql`
      select graph.register_subscription(${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.consumerKind}, ${a.eventTypes}::text[], ${JSON.stringify(a.filter)}::jsonb,
        ${a.principalId}::uuid, ${a.version}, ${a.codeDigest}, ${a.owner}::uuid, ${JSON.stringify(a.budgets)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r as { subscription_id: string; consumer_kind: string; principal_id: string; version: string; code_digest: string; budgets: Record<string, unknown> };
  }
  async setSubscriptionStatus(a: Parameters<SubscriptionWrites['setSubscriptionStatus']>[0]): Promise<string> {
    const rows = await this.call<{ s: string }>(sql`select graph.set_subscription_status(${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.to}, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as s`);
    return rows[0]?.s ?? a.to;
  }
  async replaySubscription(a: Parameters<SubscriptionWrites['replaySubscription']>[0]) {
    return this.call<{ event_id: string; event_type: string; change_kind: string; outbox_created_at: string; correlation_id: string; causation_id: string; replay_seq: number }>(sql`
      select event_id::text, event_type, change_kind, outbox_created_at::text, correlation_id::text, causation_id::text, replay_seq from graph.subscription_replay(
        ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.fromCreatedAt}::timestamptz, ${a.fromEventId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async replaySubscriptionFromSeq(a: Parameters<SubscriptionWrites['replaySubscriptionFromSeq']>[0]) {
    return this.call<{ event_id: string; event_type: string; change_kind: string; outbox_created_at: string; correlation_id: string; causation_id: string; replay_seq: number }>(sql`
      select event_id::text, event_type, change_kind, outbox_created_at::text, correlation_id::text, causation_id::text, replay_seq from graph.subscription_replay_from_seq(
        ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.fromSeq}::bigint, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async recordRetrievalCheck(a: Parameters<GraphSubscriberWrites['recordRetrievalCheck']>[0]) {
    type Answer = Awaited<ReturnType<GraphSubscriberWrites['recordRetrievalCheck']>>;
    const rows = await this.call<{ r: Answer }>(sql`select graph.record_retrieval_check(
      ${a.checkId}::uuid, ${a.eventId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.touched)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r as Answer;
  }
  async openEdgeReassessment(a: Parameters<GraphSubscriberWrites['openEdgeReassessment']>[0]): Promise<boolean> {
    const rows = await this.call<{ ok: boolean }>(sql`select graph.open_edge_reassessment(${a.edgeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.trigger}, ${a.reason}, ${a.causeId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as ok`);
    return rows[0]?.ok === true;
  }
  async proposeMappingReconciliation(a: Parameters<GraphSubscriberWrites['proposeMappingReconciliation']>[0]): Promise<string | null> {
    const rows = await this.call<{ id: string | null }>(sql`select graph.propose_mapping_reconciliation(
      ${a.reconciliationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.subjectKind}, ${a.subjectId}::uuid, ${a.fromEntityId}::uuid, ${a.toEntityId}::uuid,
      ${a.basis}, ${a.causeEventId}::uuid, ${a.subscriptionId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid)::text as id`);
    return rows[0]?.id ?? null;
  }
  async decideMappingReconciliation(a: { reconciliationId: string; tenantId: string; domainId: string; state: 'accepted' | 'rejected'; reason: string; actor: string; correlationId: string }): Promise<void> {
    await this.call(sql`select graph.decide_mapping_reconciliation(${a.reconciliationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.state}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  /* B23 (0084) revision */
  async commitRevision(a: Parameters<RevisionWrites['commitRevision']>[0]): Promise<RevisionAnswer> {
    const rows = await this.call<{ r: RevisionAnswer }>(sql`select graph.commit_revision(${a.revisionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.changeSet)}::jsonb,
      ${a.expectedRevision}::bigint, ${a.idempotencyKey}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('graph revision returned no answer');
    return r;
  }
  /* end B23 revision */
  async keepEdgeUnderReassessment(a: { edgeId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<void> {
    await this.call(sql`select graph.keep_edge_under_reassessment(${a.edgeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
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
  memory(tx: Tx, action: string): MemoryWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  ontology(tx: Tx, action: string): OntologyWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  impact(tx: Tx, action: string): ImpactWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  propagationAgents(tx: Tx, action: string): PropagationAgentWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  subscriptions(tx: Tx, action: string): SubscriptionWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  graphSubscriber(tx: Tx, action: string): GraphSubscriberWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  /** The relationships consumer (0066 §2): a subscriber that also asserts edges through the builder's port. */
  relationshipSubscriber(tx: Tx, action: string): RelationshipSubscriberWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  /** B20 (0080): the operator's two acts on a projection partition — the withdrawal and the rebuild. */
  projections(tx: Tx, action: string): ProjectionWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  /* B23 (0084) context */
  /** B23 (0084): the context query (memory.context.retrieve) — the STABLE query and the access rows of what it serves. */
  memoryContext(tx: Tx, action: string): MemoryContextReads {
    return new GraphCapabilityImpl(tx, action);
  },
  /* end B23 context */
  /* B23 (0084) revision */
  /** B23 (0084): the change-set commit (graph.revision.commit) — one validated, atomic, idempotent graph revision. */
  revisions(tx: Tx, action: string): RevisionWrites {
    return new GraphCapabilityImpl(tx, action);
  },
  /* end B23 revision */
};
