/**
 * Graph API client — the Search, Entities, Resolutions, Explore, Strategy and
 * Impact screens.
 *
 * Same rule as the observation and intelligence clients: every response is
 * returned VERBATIM and nothing here predicts a result or fills in a value the
 * server did not send.
 *
 * Phase 3 adds one of its own. EVERY answer about the graph carries the INSTANT
 * it is an answer for — `knownAt` (what we believed) and `validAt` (what held) —
 * and the screens render both wherever they render the graph. A reader must never
 * have to work out whether they are looking at a contemporary view or a
 * hindsight one.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type ResolutionMethod =
  'deterministic_identifier' | 'deterministic_name' | 'model_assisted' | 'human';

export interface AsOf { knownAt: string; validAt: string }

export interface EntityRow {
  entity_id: string;
  entity_type: string;
  canonical_name: string;
  normalized_name: string;
  lifecycle_state: 'active' | 'superseded' | 'retired';
  split_from: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
  mention_count?: number;
}

export interface ResolutionRow {
  resolution_id: string;
  claim_object_id: string;
  claim_version: number;
  mention_text: string;
  entity_id: string;
  method: ResolutionMethod;
  rule_id: string;
  rule_version: string;
  score: string;
  match_evidence: Record<string, unknown>;
  candidate_set: Array<Record<string, unknown>>;
  state: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  proposer_principal_id: string;
  proposed_at: string;
  accepted_at: string | null;
  superseded_at: string | null;
  superseded_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  mode: string | null;
  model_id: string | null;
  model_weights_digest: string | null;
  runtime_version: string | null;
  prompt_digest: string | null;
  decoding_digest: string | null;
  model_confidence: string | null;
  evidence_object_id: string;
  evidence_digest: string;
  entity?: EntityRow | null;
}

export interface EdgeRow {
  edge_id: string;
  subject_entity_id: string;
  predicate: string;
  object_entity_id: string;
  valid_from: string;
  valid_to: string | null;
  asserted_at: string;
  retracted_at: string | null;
  state: 'asserted' | 'retracted' | 'superseded';
  claim_object_id: string;
  claim_version: number;
  evidence_object_id: string;
  evidence_digest: string;
  mode: string;
  confidence: string;
  retraction_reason: string | null;
  direction?: 'out' | 'in';
  hop?: number;
}

export interface StrategyRow {
  strategy_object_id: string;
  object_type: 'OBJ' | 'ASU' | 'DEC' | 'CMT' | 'OUT';
  object_version: number;
  title: string;
  statement: string;
  status: 'active' | 'closed' | 'withdrawn';
  verification_state: 'verified' | 'unverified' | 'invalidated' | 'not_applicable';
  verification_reason: string | null;
  declared_at: string;
  updated_at: string;
  dependencies?: Array<{
    dependency_id: string; depends_on_kind: string; depends_on_id: string; rationale: string;
  }>;
}

export interface AffectedObject {
  strategy_object_id: string; object_type: string; title: string;
  reached_via: string; hop: number;
}

export interface ImpactResult {
  invalidationId?: string;
  triggerKind: string;
  triggerObjectId: string;
  correctionCaseId?: string | null;
  assumptions: AffectedObject[];
  objectives: AffectedObject[];
  decisions: AffectedObject[];
  commitments: AffectedObject[];
  reachedEntities: string[];
  reachedEdges: string[];
  statement?: string;
}

export interface EntityDetail {
  entity: EntityRow;
  identifiers: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  resolutions: ResolutionRow[];
  mentions: ResolutionRow[];
  claims: Array<Record<string, unknown>>;
  knownAt: string | null;
  receipt: Receipt;
}

export interface SearchHit {
  kind: 'entity' | 'claim' | 'evidence';
  id: string; label: string; detail: string; matched_on: string;
  recorded_at: string | null; extra: Record<string, unknown>;
}

export interface SearchResult {
  query: string; normalized: string;
  entities: SearchHit[]; claims: SearchHit[]; evidence: SearchHit[];
  total: number; scope_note: string;
}

export interface GraphOverview {
  entities: { total: number; active: number; split: number };
  resolutions: {
    total: number; accepted: number; queued: number; rejected: number;
    superseded: number; automatic: number; modelAssisted: number;
  };
  edges: { total: number; asserted: number; retracted: number };
  strategy: {
    total: number; objectives: number; assumptions: number; decisions: number;
    commitments: number; outcomes: number; unverified: number;
  };
  invalidations: { total: number; assessed: number };
}

async function g<T>(
  scope: Scope, path: string, action: string, objectType: string,
  payload: unknown = {}, objectId: string | null = null,
): Promise<ApiResult<T>> {
  return call<T>(
    `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/graph${path}`,
    {
      scope: 'DOMAIN',
      tenant_id: scope.tenantId,
      domain_id: scope.domainId,
      action,
      object_type: objectType,
      object_id: objectId,
      purpose_id: 'graph',
      side_effect_class: action === 'graph.read' ? 'none' : 'reversible',
      consequence_class: 'C2',
    },
    payload,
  );
}

/**
 * The same call under a DECLARED purpose. Memory retrieval (CP-6 B9/B10) is read under the purpose the item was
 * admitted for or one its audience declares — `memory`, `graph`, `decision`, `briefing`, `prediction` — never a fixed
 * `graph`; the server refuses any other and its refusal names the purposes it accepts. The side-effect class is the
 * caller's: a retrieval is a read (`none`) whose access is recorded; a record, supersession or withdrawal is reversible.
 */
async function gUnder<T>(
  scope: Scope, purposeId: string, path: string, action: string, objectType: string,
  payload: unknown = {}, objectId: string | null = null,
  sideEffect: 'none' | 'reversible' = 'reversible',
): Promise<ApiResult<T>> {
  return call<T>(
    `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/graph${path}`,
    {
      scope: 'DOMAIN',
      tenant_id: scope.tenantId,
      domain_id: scope.domainId,
      action,
      object_type: objectType,
      object_id: objectId,
      purpose_id: purposeId,
      side_effect_class: sideEffect,
      consequence_class: 'C2',
    },
    payload,
  );
}

/** A memory item's RECORD without its content (the statement and the source reference are a retrieval's). */
export type MemoryRow = Record<string, unknown>;

/** What is sent to record or supersede a memory item (0066 §3, OBJ-14/OBJ-16); `supersession` only on a supersession. */
export interface MemoryIntake {
  recordClass: 'institutional' | 'strategic';
  title: string;
  statement: string;
  source: { kind: 'human' | 'document' | 'communication' | 'telemetry'; ref: string | null };
  audience: { classification: 'public' | 'internal' | 'confidential' | 'restricted'; roles: string[]; purposes: string[] };
  validity: { from: string; to: string | null };
  retention: { profile: string; retainUntil: string | null; basis: string | null };
  cites: Array<{ kind: 'evidence' | 'claim' | 'strategy' | 'entity' | 'edge' | 'forecast' | 'warning'; id: string; version?: number; rationale: string }>;
  related: { decisionId: string | null; objectiveId: string | null };
  supersession?: { reason: string; effectiveAt: string | null };
}

/** The served version of a retrieval — the SERVED version's content and header; the current projection contributes availability only. */
export interface MemoryRetrieval {
  item: MemoryRow;
  version: {
    item_id: string; object_version: number; recorded_at: string; lifecycle_state: string; classification: string;
    purpose_scope: string; retention_profile: string; valid_from: string; valid_to: string | null; truth_state: string;
    accountable_owner: string; supersedes: string | null; schema_ref: string; content_digest: string | null;
    payload: Record<string, unknown>;
  };
  versionServed: number;
  versions: number;
  asOf: string | null;
  availability: {
    item_id: string; state: string; current_version: number; versions: number; superseded_versions: number;
    last_superseded_at: string | null; attention_state: string | null; served_is_current: boolean;
  };
  accessId: string;
}

/**
 * CP-6 B9 (0066 §7, L4-I05 OntologyChangeProposed): the domain's vocabulary is a VERSIONED set of entity types and
 * predicates, each predicate with the entity types it admits at either end. A change is PROPOSED as the next FULL
 * version (not a diff): what the proposal omits is removed. The compatibility analysis is the write's — the asserted
 * edges a removed or narrowed predicate would strand, the strategy resting on them — and the steward decides (never
 * the proposer). Once a version is active, the builder's port admits only its predicates.
 */
/**
 * A predicate as proposed. `subject_types` / `object_types` are OMITTED (not sent as `[]`) when the predicate declares
 * no restriction at that end: the server's NARROWED test (0066 §7) is `(op -> key) IS NOT NULL AND (np -> key) IS NOT
 * NULL AND NOT (np @> op)`, so an absent key is never a narrowing, whereas an explicit `[]` narrows a declared list to
 * the empty set and makes the change breaking.
 */
export interface OntologyPredicate { predicate: string; subject_types?: string[]; object_types?: string[] }

/** A row of graph.ontology_versions as the list returns it; the jsonb columns are rendered as served. */
export interface OntologyVersionRow {
  version_id: string; scope: string; tenant_id: string; domain_id: string; namespace: string; version: number;
  entity_types: string[]; predicates: Array<Record<string, unknown>>;
  state: 'proposed' | 'active' | 'superseded' | 'rejected';
  compatibility: 'additive' | 'breaking';
  /** { added: { entity_types, predicates }, removed: { entity_types, predicates }, narrowed: [{ predicate, from, to }] } */
  change: Record<string, unknown>;
  /** { class, edges: { count, sample: [{ edge_id, predicate }] }, entities_of_removed_types, strategy_dependencies_on_edges, from_version, to_version } */
  analysis: Record<string, unknown>;
  rationale: string; alternatives: unknown[];
  /** compatibility / migration / domain / governance → 'passed' | 'open' | 'failed' | 'not_required' (whatever the server holds). */
  reviews: Record<string, unknown>;
  migration_plan: string | null;
  proposed_by: string; proposed_at: string;
  decided_by: string | null; decided_at: string | null; decision_reason: string | null;
  activated_at: string | null; superseded_at: string | null; correlation_id: string;
}

export interface OntologyProposal {
  namespace: string; entityTypes: string[]; predicates: OntologyPredicate[];
  rationale: string; alternatives: string[]; migrationPlan: string | null;
}

/** What the proposing write returns: the version's number, its compatibility, the change and the analysis, its reviews as opened. */
export interface OntologyProposed {
  version_id: string; namespace: string; from_version: number | null; to_version: number;
  compatibility: 'additive' | 'breaking'; change: Record<string, unknown>; analysis: Record<string, unknown>;
  reviews: Record<string, unknown>;
}

export type OntologyReviewOutcome = 'passed' | 'failed';
/** The reviews a steward records with the decision; each key is optional and merges over what the proposal opened. */
export interface OntologyReviews { domain?: OntologyReviewOutcome; governance?: OntologyReviewOutcome; compatibility?: OntologyReviewOutcome; migration?: OntologyReviewOutcome }

/** What the decision returns: `supersedes` and `version` on an approval only. */
export interface OntologyDecided { version_id: string; state: 'active' | 'rejected'; supersedes?: string | null; version?: number }

export const graph = {
  overview: (s: Scope) =>
    g<{ overview: GraphOverview; receipt: Receipt }>(s, '/overview', 'graph.read', 'ENT'),

  search: (s: Scope, query: string) =>
    g<{ search: SearchResult; receipt: Receipt }>(s, '/search', 'graph.read', 'SRC', { query }),

  listEntities: (s: Scope) =>
    g<{ entities: EntityRow[]; receipt: Receipt }>(
      s, '/entities/list', 'graph.read', 'ENT', { limit: 500 }),

  getEntity: (s: Scope, entityId: string, knownAt?: string) =>
    g<EntityDetail>(s, `/entities/${entityId}/get`, 'graph.read', 'ENT',
      knownAt === undefined ? {} : { knownAt }, entityId),

  resolve: (s: Scope, limit: number, methodId: string | null) =>
    g<{ resolution: {
      runId: string; mode: string | null; mentionsRead: number; autoResolved: number;
      proposed: number; modelAssisted: number; entitiesCreated: number; gatewayCalls: number;
      unresolved: Array<{ claimObjectId: string; mention: string; reason: string }>;
      resolutions: Array<{ resolutionId: string; mention: string; entityId: string;
                           method: string; score: number; state: string;
                           policyDecisionId: string; auditSeq: number }>;
    } }>(s, '/entities/resolve', 'graph.resolution.propose', 'RES', { limit, methodId }),

  listIdentifierSystems: (s: Scope) =>
    g<{ identifierSystems: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, '/entities/identifier-systems/list', 'graph.read', 'IDS'),

  registerIdentifierSystem: (
    s: Scope, p: { systemKey: string; authority: string; description: string;
                   isAuthoritative: boolean },
  ) =>
    g<{ identifierSystem: { systemKey: string }; receipt: Receipt }>(
      s, '/entities/identifier-systems/register', 'graph.entity.create', 'IDS', p),

  queue: (s: Scope) =>
    g<{ queue: ResolutionRow[]; receipt: Receipt }>(
      s, '/resolutions/queue', 'graph.read', 'RES', { limit: 300 }),

  getResolution: (s: Scope, resolutionId: string) =>
    g<{
      resolution: ResolutionRow; events: Array<Record<string, unknown>>;
      entity: EntityRow | null; claim: Record<string, unknown> | null; receipt: Receipt;
    }>(s, `/resolutions/${resolutionId}/get`, 'graph.read', 'RES', {}, resolutionId),

  decide: (
    s: Scope, resolutionId: string, decision: 'accept' | 'reject', reason: string,
    targetEntityId?: string | null,
  ) =>
    g<{ resolution: { resolutionId: string; state: string }; receipt: Receipt }>(
      s, `/resolutions/${resolutionId}/decide`, 'graph.resolution.decide', 'RES',
      targetEntityId === undefined || targetEntityId === null
        ? { decision, reason } : { decision, reason, targetEntityId },
      resolutionId),

  split: (
    s: Scope, entityId: string,
    p: { resolutionIds: string[]; canonicalName: string; entityType: string; reason: string },
  ) =>
    g<{ split: { newEntityId: string; moved: number }; receipt: Receipt }>(
      s, `/entities/${entityId}/split`, 'graph.entity.split', 'ENT', p, entityId),

  buildEdges: (s: Scope) =>
    g<{ edgeBuild: {
      runId: string; relClaimsRead: number; edgesAsserted: number;
      skipped: Array<{ claimObjectId: string; reason: string }>;
      edges: Array<{ edgeId: string; subject: string; predicate: string; object: string }>;
    } }>(s, '/edges/build', 'graph.edge.assert', 'EDG', { limit: 300 }),

  listEdges: (s: Scope, at?: Partial<AsOf>) =>
    g<{ edges: EdgeRow[]; total: number; returned: number; limit: number; complete: boolean;
        note: string | null; asOf: AsOf; receipt: Receipt }>(
      s, '/edges/list', 'graph.read', 'EDG', at ?? {}),

  retractEdge: (s: Scope, edgeId: string, reason: string) =>
    g<{ edge: { edgeId: string; state: string }; receipt: Receipt }>(
      s, `/edges/${edgeId}/retract`, 'graph.edge.retract', 'EDG', { reason }, edgeId),

  neighbourhood: (s: Scope, entityId: string, depth: number, at?: Partial<AsOf>) =>
    g<{ neighbourhood: { edges: EdgeRow[]; entities: EntityRow[]; complete: boolean;
                         searchedDepth: number; depthClamped: boolean; beyondDepth: boolean };
        asOf: AsOf; complete: boolean; searchedDepth: number; beyondDepth: boolean;
        scope: string; note: string | null; receipt: Receipt }>(
      s, '/neighbourhood', 'graph.read', 'EDG', { entityId, depth, ...(at ?? {}) }),

  path: (s: Scope, from: string, to: string, at?: Partial<AsOf>) =>
    g<{ path: EdgeRow[] | null; asOf: AsOf; complete: boolean; searchedDepth: number;
        bound: { scan: boolean; depth: boolean }; note: string | null; receipt: Receipt }>(
      s, '/path', 'graph.read', 'EDG', { from, to, ...(at ?? {}) }),

  listStrategy: (s: Scope) =>
    g<{ strategy: StrategyRow[]; receipt: Receipt }>(
      s, '/strategy/list', 'graph.read', 'OBJ', { limit: 300 }),

  declareStrategy: (s: Scope, payload: Record<string, unknown>) =>
    g<{ strategy: { objectId: string; objectType: string; version: number; links: number };
        receipt: Receipt }>(
      s, '/strategy/declare', 'graph.strategy.declare',
      String(payload['objectType'] ?? 'OBJ'), payload),

  previewImpact: (s: Scope, triggerObjectId: string, triggerKind = 'claim_correction') =>
    g<{ impact: ImpactResult; receipt: Receipt }>(
      s, '/impact/preview', 'graph.read', 'INV', { triggerObjectId, triggerKind },
      triggerObjectId),

  propagate: (
    s: Scope, triggerObjectId: string, triggerKind: string, correctionCaseId: string | null,
  ) =>
    g<{ impact: ImpactResult; receipt: Receipt }>(
      s, '/impact/propagate', 'graph.impact.propagate', 'INV',
      { triggerObjectId, triggerKind, correctionCaseId }, triggerObjectId),

  listImpact: (s: Scope) =>
    g<{ invalidations: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, '/impact/list', 'graph.read', 'INV', { limit: 200 }),

  /** Each row carries the latest AUTOMATIC attempt (CP-6 B1, migration 0060) beside the case's own status, or null where no consumer has seen it. */
  awaitingPropagation: (s: Scope, cursor?: string) =>
    g<{ awaiting: Array<Record<string, unknown> & { propagation_status: string;
          automatic: { state: 'received' | 'walking' | 'complete' | 'partial' | 'failed'; deliveries: number; attempts: number;
                       last_error: string | null; last_delivered_at: string | null; agent_id: string | null; event_id: string | null } | null }>;
        total: number; nextCursor: string | null;
        note: string; receipt: Receipt }>(
      s, '/impact/awaiting', 'graph.read', 'COR',
      cursor === undefined ? { limit: 100 } : { limit: 100, cursor }),

  /** CP-6 B6 (0063): the GraphChanged/MemoryCorrected subscription registry, the delivery ledger, the retrieval checks and the mapping proposals. */
  subscriptionStatus: (s: Scope) =>
    g<{ subscriptions: {
          consumers: Array<{ kind: string; version: string; codeDigest: string; registeredInThisProcess: boolean }>;
          subscriptions: Array<Record<string, unknown>>; deliveries: Array<Record<string, unknown>>;
          retrieval_checks: Array<Record<string, unknown>>; mapping_reconciliations: Array<Record<string, unknown>>;
          /** 0064 (AU-MEM-0041): execution state per delivery, and the deliveries in a failure state with their class and route. */
          telemetry: { deliveries: Array<Record<string, unknown>>; open_failure_states: Array<Record<string, unknown>>;
                       /** 0065: the tenant's outbox partitions — the head, whether it is held (blocked), dead letters, the retained floor. */
                       partitions?: Array<Record<string, unknown>> };
          runtime: { scheduler_enabled: boolean; worker_running: boolean; redis_queue: string;
                     /** 0065: who serves the domain's queue (one process at a time) and this process's identity. */
                     serving?: { holder: string | null; claimed_until: string | null; renewals: number | null; this_process: string; served_here: boolean; events: Array<Record<string, unknown>> };
                     last_reconciliation: Record<string, unknown> | null; last_failure: { at: string; where: string; message: string } | null } };
        receipt: Receipt }>(
      s, '/subscriptions/status', 'graph.read', 'SUB'),

  registerSubscription: (s: Scope, consumerKind: string, ownerPrincipalId: string, backlog: 'replay' | 'leave') =>
    g<{ subscription: Record<string, unknown>; served: { workerRunning: boolean; reDriven: number } }>(
      s, '/subscriptions/register', 'graph.subscription.register', 'SUB', { consumerKind, ownerPrincipalId, backlog }),

  controlSubscription: (s: Scope, subscriptionId: string, to: 'pause' | 'resume' | 'revoke', reason: string) =>
    g<{ subscription: { subscriptionId: string; status: string }; receipt: Receipt }>(
      s, `/subscriptions/${subscriptionId}/${to}`, 'graph.subscription.control', 'SUB', { reason }, subscriptionId),

  replaySubscription: (s: Scope, subscriptionId: string, reason: string, fromSeq: number | null = null) =>
    g<{ subscriptionId: string; replayed: number; events: string[]; receipt: Receipt }>(
      s, `/subscriptions/${subscriptionId}/replay`, 'graph.subscription.replay', 'SUB', fromSeq === null ? { reason } : { reason, fromSeq }, subscriptionId),

  subscriptionDelivery: (s: Scope, eventId: string) =>
    g<{ deliveries: Array<Record<string, unknown>>; events: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, `/subscriptions/deliveries/${eventId}/get`, 'graph.read', 'SUB', {}, eventId),

  listMappings: (s: Scope, state: 'proposed' | 'accepted' | 'rejected' = 'proposed') =>
    g<{ mappings: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, '/mappings/list', 'graph.read', 'MRC', { state, limit: 200 }),

  decideMapping: (s: Scope, reconciliationId: string, decision: 'accept' | 'reject', reason: string) =>
    g<{ mapping: { reconciliationId: string; state: string }; receipt: Receipt }>(
      s, `/mappings/${reconciliationId}/decide`, 'graph.resolution.decide', 'MRC', { decision, reason }, reconciliationId),

  verifyProjections: (s: Scope) =>
    g<{ projections: Array<{ projection: string; live_rows: string; rebuilt_rows: string;
                             mismatched: string }>; receipt: Receipt }>(
      s, '/projections/verify', 'graph.read', 'ENT'),

  /** CP-6 B9/B10 (0066 §3): the Enterprise Memory workspace — records without content; the content is a retrieval's. */
  listMemory: (s: Scope) =>
    g<{ memory: MemoryRow[]; receipt: Receipt }>(s, '/memory/list', 'graph.read', 'MEM', { limit: 200 }),

  /** The item's record: its events, its access history (who read which version under which purpose, as of when), what it rests on. */
  getMemory: (s: Scope, itemId: string) =>
    g<{ item: MemoryRow; events: Array<Record<string, unknown>>; access: Array<Record<string, unknown>>;
        dependencies: Array<Record<string, unknown>>; receipt: Receipt }>(
      s, `/memory/${itemId}/get`, 'graph.read', 'MEM', {}, itemId),

  /** A purpose-authorised, AUDITED read of the version current at `asOf` (the current one when omitted); a 403 names the reason. */
  retrieveMemory: (s: Scope, itemId: string, purposeId: string, asOf?: string) =>
    gUnder<{ memory: MemoryRetrieval; receipt: Receipt }>(
      s, purposeId, `/memory/${itemId}/retrieve`, 'memory.item.retrieve', 'MEM',
      asOf === undefined ? {} : { asOf }, itemId, 'none'),

  recordMemory: (s: Scope, intake: MemoryIntake, purposeId = 'memory') =>
    gUnder<{ memory: { itemId: string; version: number; cites: number; contentDigest: string }; receipt: Receipt }>(
      s, purposeId, '/memory/record', 'memory.item.record', 'MEM', intake),

  /** Human-gated: the record authority records the next version with its reason; the prior version stays replayable. */
  supersedeMemory: (s: Scope, itemId: string, intake: MemoryIntake, purposeId = 'memory') =>
    gUnder<{ memory: { itemId: string; version: number; cites: number; contentDigest: string; priorVersion: number }; receipt: Receipt }>(
      s, purposeId, `/memory/${itemId}/supersede`, 'memory.item.supersede', 'MEM', intake, itemId),

  /** Human-gated (B10: its own action, memory.item.withdraw): the record authority withdraws the item with a reason; every version stays replayable. */
  withdrawMemory: (s: Scope, itemId: string, reason: string, purposeId = 'memory') =>
    gUnder<{ memory: { itemId: string; state: string }; receipt: Receipt }>(
      s, purposeId, `/memory/${itemId}/withdraw`, 'memory.item.withdraw', 'MEM', { reason }, itemId),

  /** CP-6 B9 (0066 §7): every version of the domain's vocabulary, ordered by namespace then version (the only read route the controller has). */
  listOntology: (s: Scope) =>
    g<{ versions: OntologyVersionRow[]; receipt: Receipt }>(s, '/ontology/list', 'graph.read', 'ONT'),

  /** The next FULL version proposed with its rationale and alternatives; the server computes the compatibility analysis and opens the reviews. */
  proposeOntology: (s: Scope, p: OntologyProposal) =>
    g<{ ontology: OntologyProposed; receipt: Receipt }>(s, '/ontology/propose', 'graph.ontology.propose', 'ONT', p),

  /** Human-gated, the steward's (never the proposer's): approval activates the version and supersedes the prior one; a breaking change is refused while it would strand asserted edges. */
  decideOntology: (s: Scope, versionId: string, decision: 'approve' | 'reject', reason: string, reviews: OntologyReviews) =>
    g<{ ontology: OntologyDecided; receipt: Receipt }>(
      s, `/ontology/${versionId}/decide`, 'graph.ontology.decide', 'ONT', { decision, reason, reviews }, versionId),
};

/* ───────────────────────── governed retention (0066 §4 / 0067 / 0068 / 0070 / 0072 / 0073 / 0076) ───────────────────────── */

/**
 * The retention routes live under `…/retention`, not `…/graph`, and every call is made under the purpose `retention`.
 * One governed act per state transition of an action — open, resolve, approve (human-gated, on the scope digest the
 * approver read), execute (human-gated, never the approver), verify — and the schedule's declare, evaluate and (B13)
 * retire; the reads apart (`retention.read`, an audited access). RTS is a schedule, RTA an action, RTP the cold tier's
 * policy (B12: declared per domain, its state read beside the lists); since B13 (0073) RSK is an export signing key (the
 * tenant's, declared by a credential REFERENCE — the private key never leaves the process environment and no answer
 * carries it), RDS an export destination (a transfer station or an https endpoint, declared per domain), RDL a delivery and RXN (B14) a revocation notice
 * of a package to one. The download of a package is a governed WRITE (`retention.export.download` records the event on the
 * action; the bytes ride the same answer), so its envelope carries `reversible` as every act does. Since B16 (0076) RXP is an
 * EXCHANGE PARTNER (the party whose key-signed packages this domain admits, bound to an intake source contract of the domain)
 * and RIM a governed IMPORT (a package quarantined, verified, approved on its digest — never by the opener — and admitted under
 * ids this installation mints — never by the approver; or withdrawn). The server's refusal is returned verbatim: the opener's
 * own approval, a wrong digest, an unresolved scope, a review's failed check, a budget exhausted, an expired or revoked package,
 * an unbound credential reference, a key no partner holds are all its words.
 *
 * The envelope's object id is a uuid or null: a signing key's id (`ed25519:<hex>`) is not one, so those calls carry null
 * and the key travels in the path — percent-encoded, the colon included (design C16).
 */
async function r<T>(
  scope: Scope, path: string, action: string, objectType: 'RTS' | 'RTA' | 'RTP' | 'RSK' | 'RDS' | 'RDL' | 'RXN' | 'RXP' | 'RIM',
  payload: unknown = {}, objectId: string | null = null,
): Promise<ApiResult<T>> {
  return call<T>(
    `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/retention${path}`,
    {
      scope: 'DOMAIN',
      tenant_id: scope.tenantId,
      domain_id: scope.domainId,
      action,
      object_type: objectType,
      object_id: objectId,
      purpose_id: 'retention',
      side_effect_class: action === 'retention.read' ? 'none' : 'reversible',
      consequence_class: 'C2',
    },
    payload,
  );
}

export const RETENTION_KINDS = ['review', 'deletion', 'archive', 'log_floor', 'customer_export', 'restore'] as const;
export const RETENTION_TARGET_KINDS = ['evidence', 'log_partition'] as const;
export type RetentionKind = (typeof RETENTION_KINDS)[number];
export type RetentionTargetKind = (typeof RETENTION_TARGET_KINDS)[number];

/** A row of `retention.schedules` or `retention.actions_current`, as the server serves it (snake_case columns). */
export type RetentionRow = Record<string, unknown>;

/**
 * What opens an action (validateOpenAction): an evidence selector names a manifestId or a sourceId — or, for an archive, a
 * customer export (B11) or a restore (B12: the archived bytes moved back to the hot tier, opened on demand and never by a
 * schedule), manifestIds (1–200, a chosen object set); a customer export names its classificationCeiling (the redaction gate),
 * may name destination `export` (the vault's export namespace, where its package is built — a delivery to a declared
 * destination is its own act since B13) and may name expiresAfter (B13, an interval as a dueAfter is spelled, 1 hour to
 * 1 year; the server's default is 30 days — the package's download and delivery are refused once it expired); a log
 * partition names partitionKey + toSeq and takes the log_floor kind only.
 */
export interface RetentionOpenIntake {
  kind: RetentionKind;
  targetKind: RetentionTargetKind;
  selector: { manifestId?: string; sourceId?: string; manifestIds?: string[]; classificationCeiling?: RetentionClassification; destination?: 'export'; expiresAfter?: string } | { partitionKey: string; toSeq: number };
  retentionProfile?: string;
}
export const RETENTION_CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export type RetentionClassification = (typeof RETENTION_CLASSIFICATIONS)[number];

/** What declares a schedule: `dueAfter` is an interval such as "90 days"; `selector` and `ownerPrincipalId` are optional (the owner defaults to the declarer). The server refuses the restore kind (a restore is opened on demand). */
export interface RetentionScheduleIntake {
  retentionProfile: string;
  targetKind: RetentionTargetKind;
  actionKind: RetentionKind;
  dueAfter: string;
  selector?: Record<string, unknown>;
  ownerPrincipalId?: string;
}

/**
 * evaluate's answer (B12, 0072 §1/§6): the actions opened (oldest due first, at most the policy's opens per evaluation per schedule;
 * `deferred` is what fell due beyond that bound and waits for the next evaluation) and, from the cold-tier manager's pass after the
 * schedules, the paused-for-retry actions it ESCALATED for human review because their pause is older than the policy's escalate-after
 * — each `{ action_id, kind, paused_at, reason }` in the server's words.
 */
export interface RetentionEvaluation {
  opened: Array<Record<string, unknown>>;
  escalated: Array<Record<string, unknown>>;
  deferred: number;
}

/**
 * What declares the cold tier's policy (B12, 0072 §1 `retention.tier_policies`): every field is optional and the server takes its
 * defaults for what is omitted — `budgetBytesPerDay` null (unbounded), `maxOpensPerEvaluation` 200 (1–200), `maxAttempts` 3 (1–10),
 * `escalateAfter` "7 days", `restoreHotFor` "30 days" (intervals as `dueAfter` is spelled). Each declaration is the next version.
 */
export interface RetentionTierPolicyIntake {
  budgetBytesPerDay?: number | null;
  maxOpensPerEvaluation?: number;
  maxAttempts?: number;
  escalateAfter?: string;
  restoreHotFor?: string;
}

/** One blob root's inventory as the controller adds it to the tier state (one readdir of the domain's directory); nulls with `error` when the root could not be listed. */
export interface RetentionVaultInventory { blobs: number | null; staged: number | null; temp: number | null; error?: string }

/**
 * The cold tier's observable state (B12, `retention.tier_state` + the vault's inventory of both roots): the policy in force (the
 * defaults with `declared` false when none is declared), the manifests and bytes per tier, the moves of the last 24 hours, the
 * daily byte budget (`remaining` null when unbounded; `window_resets_at` the instant the rolling window frees), the actions by
 * state, the hot manifests whose latest tier record is a restore (awaiting their re-archive by the schedule after the restore
 * window), and the schedules with their last evaluation `{ at, opened, deferred }` (`{}` until one runs). Intervals are text.
 */
export interface RetentionTierState {
  policy: {
    declared: boolean; version: number; policy_id?: string | null;
    budget_bytes_per_day: number | null; max_opens_per_evaluation: number; max_attempts: number;
    escalate_after: string; restore_hot_for: string;
  };
  tiers: { hot: { manifests: number; bytes: number }; archive: { manifests: number; bytes: number } };
  moves_24h: { archived: { count: number; bytes: number }; restored: { count: number; bytes: number } };
  budget: { bytes_per_day: number | null; used_24h: number; remaining: number | null; window_resets_at: string | null };
  actions: { executing: number; paused_retry: number; paused_human_review: number; escalated: number; pending_bytes_residuals: number };
  restored_awaiting_rearchive: number;
  schedules: Array<{
    schedule_id: string; action_kind: string; retention_profile: string; due_after: string; state: string;
    last_evaluated_at: string | null; last_evaluation: Record<string, unknown>;
    /** B13 (0073 §1): the instant a retired schedule was retired; null while active (absent from a server before 0073). */
    retired_at?: string | null;
  }>;
  vault: { evidence: RetentionVaultInventory; archive: RetentionVaultInventory };
}

/* ── B13 (0073): the export's delivery — signing keys, destinations, the download, the deliveries ── */

export const RETENTION_KEY_PURPOSES = ['demonstration', 'production'] as const;
export type RetentionKeyPurpose = (typeof RETENTION_KEY_PURPOSES)[number];
export const RETENTION_DESTINATION_KINDS = ['transfer_station', 'https'] as const;
export type RetentionDestinationKind = (typeof RETENTION_DESTINATION_KINDS)[number];

/**
 * What declares an export signing key (0073 §2 `retention.export_signing_keys`, the tenant's): the credential REFERENCE
 * (`EYE_EXPORT_SIGNING_KEY_<NAME>`, bound in the server's process environment — the value is never sent, never recorded and
 * never answered; the server derives and records the PUBLIC key) and the purpose, `demonstration` or `production`, shown
 * everywhere the signature is shown. The list serves each key's reference NAME and its readiness (`bound` | `blocked-credential`).
 */
export interface RetentionSigningKeyIntake { credentialRef: string; purpose: RetentionKeyPurpose }

/**
 * What declares an export destination (0073 §3 `retention.export_destinations`, the domain's): a key unique among the domain's
 * active destinations (`^[a-z0-9][a-z0-9-]{1,63}$`), the kind — a `transfer_station` (an absolute directory outside the vault's
 * roots, existing at declaration; the disconnected-transfer path: the product writes the package there and reads the recipient's
 * receipt back) or `https` (an endpoint the package is POSTed to; its bearer credential by REFERENCE `EYE_DST_<NAME>`, https only,
 * never recorded) — the endpoint, the recipient (the exchange identity: who receives) and the purpose.
 */
export interface RetentionDestinationIntake {
  destinationKey: string;
  kind: RetentionDestinationKind;
  endpoint: string;
  credentialRef?: string;
  /** B14 (0074 §2): an https destination's TRUST ANCHOR — one or more PEM certificates its server certificate must chain to (the deployment's trust store otherwise); never for a transfer station. */
  trustAnchorPem?: string;
  recipient: string;
  purpose: string;
}

/**
 * What declares an EXCHANGE PARTNER (B16, 0076 §3 `retention.exchange_partners`, the domain's): a key unique among the domain's
 * active partners (`^[a-z0-9][a-z0-9-]{1,63}$`), the party (who signs the packages this domain admits) and the purpose, the
 * party's Ed25519 PUBLIC key as a SubjectPublicKeyInfo PEM (the server derives the key id `ed25519:<first 16 hex of sha256(SPKI DER)>`
 * exactly as the export's own signing key is named), and the INTAKE SOURCE CONTRACT of this domain the imported records are held
 * under — an active upload contract with confirmed rights, whose classification ceiling is the import's policy gate. The server
 * refuses a key or a partner key already declared among the active partners, and an intake contract that is not active, not an
 * upload contract or whose rights are not confirmed.
 */
export interface RetentionPartnerIntake {
  partnerKey: string;
  party: string;
  purpose: string;
  publicKeyPem: string;
  intakeSourceId: string;
  intakeContractVersion: number;
}

/**
 * What an IMPORT is opened on (B16, 0076 §4; D4): the package INLINE — the tar as base64 in the governed payload, at most 64 MiB
 * decoded, with the sender's exchange statement (delivery.json, or the stream's headers as an object) when there is one — or from a
 * transfer STATION declared in this domain, at the origin's `<tenantId>/<domainId>/<actionId>` (package.tar with delivery.json,
 * package.sig and, when the origin revoked it there, revocation.json beside it). The station is the disconnected path and the
 * only one for a package above the listener's body limit.
 */
export type RetentionImportSource =
  | { kind: 'inline'; base64: string; exchange?: Record<string, unknown> }
  | { kind: 'station'; destinationKey: string; origin: { tenantId: string; domainId: string; actionId: string } };

/** One of the import's ordered checks as the open act recorded it: `ok` true (passed), false (failed: the import is quarantined) or null (a note — a fact the product cannot establish here, stated). */
export interface RetentionImportCheck { name: string; ok: boolean | null; detail: string | null }

/**
 * The import's record (…/imports/:id/get, B16): the row (its state — quarantined, verified, approved, admitting, admitted, withdrawn —
 * the origin as the manifest states it, the intake, the exchange statement, the digests, the counts), the partner whose key signed it
 * (null when none held the key), the ITEMS — the map from each origin reference (`<object_id>@<version>`, `entity:<id>`, `edge:<id>`,
 * `system:<key>`, `identifier:<key>:<value>`, `excluded:…`) to the id minted here, each with its disposition (staged, admitted, reused,
 * excluded, refused) and its gate — the events, the ordered checks and the IMPORT RECEIPT (the importer's own record of the exchange).
 */
export interface RetentionImportDetail {
  import: RetentionRow;
  partner: RetentionRow | null;
  items: RetentionRow[];
  events: RetentionRow[];
  checks: RetentionImportCheck[];
  importReceipt: Record<string, unknown>;
  receipt: Receipt;
}

/** The open act's answer (B16): the row as recorded (verified or quarantined), the ordered checks, the planned items, and the import receipt. */
export type RetentionImportOpened = {
  import: RetentionRow;
  checks: RetentionImportCheck[];
  items: RetentionRow[];
  verified: boolean;
  importReceipt: Record<string, unknown>;
  receipt: Receipt;
};

/**
 * The download's answer (…/actions/:id/export/download, B13 D7): the package's ARCHIVE — one deterministic ustar tar of
 * manifest.json and the object files — as base64, rebuilt from the files and compared with the recorded archive digest before
 * it is served (a mismatch is refused, never served); the filename `<action_id>.tar`; the digests; the signature block as the
 * manifest carries it (for scheme eye-customer-export/2 with the public key PEM and the key's purpose); the expiry.
 */
export interface RetentionExportDownload {
  filename: string;
  byteLength: number;
  archiveDigest: string;
  packageDigest: string;
  manifestDigest: string;
  signature: Record<string, unknown>;
  expiresAt: string | null;
  base64: string;
}

/**
 * A recipient's receipt as the specification shapes it (B13 D6/C7): the delivery it answers (`delivery_id`, `attempt` — a receipt
 * naming another delivery is refused), the recipient, the instant, both digests and whether the recipient's verification passed;
 * anything else is kept as received. The server acknowledges a delivery on a receipt naming the SAME digests with `verified` true,
 * and records a MISMATCH — the exchange denied, the evidence preserved — on other digests or `verified` false.
 */
export type RetentionDeliveryReceipt = Record<string, unknown>;

export interface RetentionResidual { kind: string; count: number; status: string; ref?: string | null; note?: string | null }

/** resolve_scope's answer: the counts by disposition (excluded since B11), the residual inventory, the state the action moved to and the digest the approval signs. */
export interface RetentionScopeSummary {
  items: number; execute: number; held: number; blocking: number; excluded?: number; residuals: RetentionResidual[];
  state: string; scope_digest: string;
}

/** execute's answer: a fresh execution (what executed, was held, was refused; the floor moved for a log_floor; the package built for a customer export; the bytes removed after the commit) or the retry of an executed action's pending bytes residuals. */
export type RetentionExecutionResult =
  | { retried?: false; executed: number; held: number; refused: number; floor: Record<string, unknown> | null; package?: Record<string, unknown> | null; bytes: { removed: string[]; failed: string[] } }
  | { retried: true; pending: number; bytes: { removed: string[]; failed: string[] } };

/**
 * The export package's record (…/actions/:id/export/get, B11): the ledger row, manifest.json as written (null when its file is
 * gone) and the files the package holds. Since B13 (0073 §2): the key the package was signed with — its id, purpose, current
 * state (`active` | `retired`: a package signed by a key retired since still verifies against the recorded public key) and the
 * PUBLIC key PEM a customer fetches to verify — null for a package on the digest chain (scheme /1); the expiry and whether it
 * passed; the archive digest (null for a package built before B13); the action's deliveries as recorded.
 */
export interface RetentionExportDetail {
  package: RetentionRow;
  manifest: Record<string, unknown> | null;
  files: string[];
  signing_key?: { key_id: string; purpose: string; state: string; public_key_pem: string } | null;
  expires_at?: string | null;
  expired?: boolean;
  archive_digest?: string | null;
  deliveries?: RetentionRow[];
  receipt: Receipt;
}

/** verify_action's verdict: each check with its outcome; on a pass, the scope the DeletionVerified event carries (a review's verification publishes none). */
export interface RetentionVerdict {
  state: string; verified: boolean;
  checks: Array<{ item: string; kind: string; disposition: string; passed: boolean }>;
  scope_digest?: string | null; kind?: string; target_kind?: string; selector?: Record<string, unknown>;
  authorized_by?: string[]; executed?: number; held?: number; excluded?: number; residual?: RetentionResidual[];
}

/** The action's record (…/actions/:id/get): the row, its events, its scope items in dependency order, approvals, executions, residual inventory, verifications. */
export interface RetentionActionDetail {
  action: RetentionRow;
  events: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  executions: Array<Record<string, unknown>>;
  residuals: Array<Record<string, unknown>>;
  verifications: Array<Record<string, unknown>>;
  receipt: Receipt;
}

export const retention = {
  listSchedules: (s: Scope) =>
    r<{ schedules: RetentionRow[]; receipt: Receipt }>(s, '/schedules/list', 'retention.read', 'RTS'),

  /** A domain admin's act: the schedule under which evaluation opens actions for what fell due. */
  declareSchedule: (s: Scope, intake: RetentionScheduleIntake) =>
    r<{ schedule: { scheduleId: string }; receipt: Receipt }>(s, '/schedules/declare', 'retention.schedule.declare', 'RTS', intake),

  /** The steward's act: every object past its schedule raises an action (RetentionActionDue each), oldest due first and bounded by the policy (B12: the rest deferred); nothing is deleted. The cold-tier manager's escalations by age ride the same act. */
  evaluateSchedules: (s: Scope) =>
    r<{ evaluation: RetentionEvaluation; receipt: Receipt }>(s, '/schedules/evaluate', 'retention.schedule.evaluate', 'RTS'),

  /** B13 (0073 §1): a domain admin's act, `retention.schedule.retire` — the schedule moves active → retired once, with a reason (8+ characters); its row, its last evaluation, the actions it opened and their events stay; a retired schedule opens nothing. */
  retireSchedule: (s: Scope, scheduleId: string, reason: string) =>
    r<{ schedule: RetentionRow; receipt: Receipt }>(s, `/schedules/${scheduleId}/retire`, 'retention.schedule.retire', 'RTS', { reason }, scheduleId),

  /** B13 (0073 §2): the tenant's export signing keys — each with its reference NAME and readiness, never the reference's value (an audited read). */
  listSigningKeys: (s: Scope) =>
    r<{ keys: RetentionRow[]; receipt: Receipt }>(s, '/signing-keys/list', 'retention.read', 'RSK'),

  /** B13: the tenant's (or the platform's) administrator declares a key from a credential reference bound in the server's environment; the server derives and records the public key. Human-gated. */
  declareSigningKey: (s: Scope, intake: RetentionSigningKeyIntake) =>
    r<{ key: RetentionRow; receipt: Receipt }>(s, '/signing-keys/declare', 'retention.signing_key.declare', 'RSK', intake),

  /** B13: a key retired once with a reason; its row and public key stay (a package it signed still verifies). The key id carries a colon, so it is percent-encoded in the path and the envelope's object id is null (not a uuid). */
  retireSigningKey: (s: Scope, keyId: string, reason: string) =>
    r<{ key: RetentionRow; receipt: Receipt }>(s, `/signing-keys/${encodeURIComponent(keyId)}/retire`, 'retention.signing_key.retire', 'RSK', { reason }),

  /** B13 (0073 §3): the domain's export destinations with their readiness — `active` / `retired`, and for an https destination `blocked-credential` while its reference is not bound in the server's process (an audited read). */
  listDestinations: (s: Scope) =>
    r<{ destinations: RetentionRow[]; receipt: Receipt }>(s, '/destinations/list', 'retention.read', 'RDS'),

  /** B13: a domain admin's act — a destination declared; the server refuses a transfer station that is not an existing absolute directory outside the vault's roots, an endpoint that is not https, a credential reference on a transfer station, a duplicate key. */
  declareDestination: (s: Scope, intake: RetentionDestinationIntake) =>
    r<{ destination: RetentionRow; receipt: Receipt }>(s, '/destinations/declare', 'retention.destination.declare', 'RDS', intake),

  /** B13: a destination retired once with a reason; a delivery to it is refused from then on, its recorded deliveries stay. */
  retireDestination: (s: Scope, destinationId: string, reason: string) =>
    r<{ destination: RetentionRow; receipt: Receipt }>(s, `/destinations/${encodeURIComponent(destinationId)}/retire`, 'retention.destination.retire', 'RDS', { reason }, destinationId),

  /** B12 (0072 §1): the cold tier's observable state — an audited read (`retention.read`) of the policy in force, the tiers, the moves, the budget, the actions by state and the vault's inventory of both roots. */
  tierState: (s: Scope) =>
    r<{ state: RetentionTierState; receipt: Receipt }>(s, '/tier/state', 'retention.read', 'RTP'),

  /** B12: a domain admin's act (`retention.tier.declare`) — the next version of the domain's cold-tier policy; the server states what it refuses (a budget below one byte, opens outside 1–200, attempts outside 1–10, an interval it cannot read). */
  declareTierPolicy: (s: Scope, intake: RetentionTierPolicyIntake) =>
    r<{ policy: Record<string, unknown>; receipt: Receipt }>(s, '/tier/declare', 'retention.tier.declare', 'RTP', intake),

  /** The actions, newest first, with the tenant's outbox partitions (the floor a log_floor action moves). */
  listActions: (s: Scope, limit = 200) =>
    r<{ actions: RetentionRow[]; partitions: Array<Record<string, unknown>>; receipt: Receipt }>(s, '/actions/list', 'retention.read', 'RTA', { limit }),

  getAction: (s: Scope, actionId: string) =>
    r<RetentionActionDetail>(s, `/actions/${actionId}/get`, 'retention.read', 'RTA', {}, actionId),

  openAction: (s: Scope, intake: RetentionOpenIntake) =>
    r<{ action: { actionId: string; kind: string; targetKind: string; state: string }; receipt: Receipt }>(s, '/actions/open', 'retention.action.open', 'RTA', intake),

  /** The scope resolved: each item with its disposition (execute / held / excluded / blocking) and the digest the approval signs. */
  resolveAction: (s: Scope, actionId: string) =>
    r<{ scope: RetentionScopeSummary; receipt: Receipt }>(s, `/actions/${actionId}/resolve`, 'retention.action.resolve', 'RTA', {}, actionId),

  /** Human-gated, the retention authority's: on the resolved scope's digest the approver read; the opener never approves. */
  approveAction: (s: Scope, actionId: string, scopeDigest: string, rationale: string) =>
    r<{ approval: { approvalId: string; actionId: string; state: string }; receipt: Receipt }>(s, `/actions/${actionId}/approve`, 'retention.action.approve', 'RTA', { scopeDigest, rationale }, actionId),

  /** Human-gated, the steward's (never an approver): the approved scope in one transaction; a hold placed since rolls it back whole and pauses the action (409). */
  executeAction: (s: Scope, actionId: string) =>
    r<{ execution: RetentionExecutionResult; receipt: Receipt }>(s, `/actions/${actionId}/execute`, 'retention.action.execute', 'RTA', {}, actionId),

  verifyAction: (s: Scope, actionId: string) =>
    r<{ verification: RetentionVerdict; receipt: Receipt }>(s, `/actions/${actionId}/verify`, 'retention.action.verify', 'RTA', {}, actionId),

  /** B11: a withdrawal is its own named act, `retention.action.withdraw`. */
  withdrawAction: (s: Scope, actionId: string, reason: string) =>
    r<{ action: { actionId: string; state: string }; receipt: Receipt }>(s, `/actions/${actionId}/withdraw`, 'retention.action.withdraw', 'RTA', { reason }, actionId),

  /** B11 (0070 §3): the export package of a customer-export action — its record, its manifest and its files; a 409 once revoked (the bytes are gone). */
  getExport: (s: Scope, actionId: string) =>
    r<RetentionExportDetail>(s, `/actions/${actionId}/export/get`, 'retention.read', 'RTA', {}, actionId),

  /** B11: the retention authority's act, human-gated — the package revoked once with a reason; its bytes removed after the commit. B14 (0074 §3): the first REVOCATION NOTICE to every destination that received the package is sent in the same act (`notices`, every outcome recorded); the product's copies at each transfer station removed after the commit (`stations`). */
  revokeExport: (s: Scope, actionId: string, reason: string) =>
    r<{ revocation: Record<string, unknown>; notices: RetentionRow[]; bytes: { removed: boolean; error?: string }; stations: RetentionRow[]; receipt: Receipt }>(s, `/actions/${actionId}/export/revoke`, 'retention.export.revoke', 'RTA', { reason }, actionId),

  /** B14 (0074 §3): a FURTHER revocation notice to one destination that received the (revoked) package — the retry of a failed notice, human-gated (`retention.export.notify`); 409 while the package is not revoked or the destination never received it. */
  notifyRevocation: (s: Scope, actionId: string, destinationKey: string) =>
    r<{ notice: RetentionRow; receipt: Receipt }>(s, `/actions/${actionId}/export/revocation-notices`, 'retention.export.notify', 'RTA', { destinationKey }, actionId),

  /** B14: the action's revocation notices as recorded — attempt, destination, state (notified / acknowledged / mismatched / failed with its class), the notice sent, the receipt as received (an audited read). */
  listRevocationNotices: (s: Scope, actionId: string) =>
    r<{ notices: RetentionRow[]; receipt: Receipt }>(s, `/actions/${actionId}/export/revocation-notices/list`, 'retention.read', 'RTA', {}, actionId),

  /** B14: for a transfer-station notice in state notified — the recipient's revocation-receipt.json read from the station's directory and applied (`retention.export.acknowledge`, human-gated); 409 while no receipt is there. */
  collectRevocationReceipt: (s: Scope, actionId: string, noticeId: string) =>
    r<{ notice: RetentionRow; receipt: Receipt }>(s, `/actions/${actionId}/export/revocation-notices/${encodeURIComponent(noticeId)}/collect-receipt`, 'retention.export.acknowledge', 'RXN', {}, noticeId),

  /** B14: a notice's receipt presented out of band ({ notice_id?, package_digest, copies_destroyed, … }) applied to a notified notice — acknowledged on the package digest with copies_destroyed true, mismatched otherwise; a receipt naming another notice refused. */
  acknowledgeRevocationNotice: (s: Scope, actionId: string, noticeId: string, receipt: RetentionDeliveryReceipt) =>
    r<{ notice: RetentionRow; receipt: Receipt }>(s, `/actions/${actionId}/export/revocation-notices/${encodeURIComponent(noticeId)}/acknowledge`, 'retention.export.acknowledge', 'RXN', { receipt }, noticeId),

  /**
   * B13 (D7): the package's archive downloaded — a governed, audited act (`retention.export.download`: the event export.downloaded is
   * written on the action; the tar's bytes ride the same answer as base64). Refused once revoked or expired, and when the archive
   * does not rebuild to its recorded digest (an integrity failure: nothing is served).
   */
  downloadExport: (s: Scope, actionId: string) =>
    r<{ download: RetentionExportDownload; receipt: Receipt }>(s, `/actions/${actionId}/export/download`, 'retention.export.download', 'RTA', {}, actionId),

  /**
   * B13 (D6): the retention authority's act, human-gated — the VERIFIED, unrevoked, unexpired package delivered to one of the domain's
   * active destinations by its key, the rights of every exported source re-checked first. A delivery that failed is a recorded fact
   * (state `failed` with its class), not a rolled-back one; a transfer-station delivery waits for the recipient's receipt (`delivered`);
   * an https destination's answer is its receipt (`delivered`, `acknowledged` or `mismatched`).
   */
  deliverExport: (s: Scope, actionId: string, destinationKey: string) =>
    r<{ delivery: RetentionRow; receipt: Receipt }>(s, `/actions/${actionId}/export/deliver`, 'retention.export.deliver', 'RTA', { destinationKey }, actionId),

  /** B13: the action's deliveries as recorded — attempt, destination, state, the receipt as received (or the failure), its digest, the failure class (an audited read). */
  listDeliveries: (s: Scope, actionId: string) =>
    r<{ deliveries: RetentionRow[]; receipt: Receipt }>(s, `/actions/${actionId}/export/deliveries/list`, 'retention.read', 'RTA', {}, actionId),

  /** B13: for a transfer-station delivery in state delivered — the recipient's receipt.json read from the station's directory and applied (`retention.export.acknowledge`, human-gated); 409 while no receipt is there. */
  collectReceipt: (s: Scope, actionId: string, deliveryId: string) =>
    r<{ delivery: RetentionRow; receipt: Receipt }>(s, `/actions/${actionId}/export/deliveries/${encodeURIComponent(deliveryId)}/collect-receipt`, 'retention.export.acknowledge', 'RDL', {}, deliveryId),

  /** B13: a receipt presented out-of-band (carried by hand from a station, or an https recipient's later answer) applied to a delivered delivery — the same act; the server's words on a mismatch. */
  acknowledgeDelivery: (s: Scope, actionId: string, deliveryId: string, receipt: RetentionDeliveryReceipt) =>
    r<{ delivery: RetentionRow; receipt: Receipt }>(s, `/actions/${actionId}/export/deliveries/${encodeURIComponent(deliveryId)}/acknowledge`, 'retention.export.acknowledge', 'RDL', { receipt }, deliveryId),

  /** B16 (0076 §3): the domain's exchange partners, oldest first, each with its state (active / retired) and its intake contract as it stands now (an audited read). */
  listPartners: (s: Scope) =>
    r<{ partners: RetentionRow[]; receipt: Receipt }>(s, '/partners/list', 'retention.read', 'RXP'),

  /** B16: an administrator's act, human-gated (`retention.partner.declare`) — the partner declared from its public key PEM and the intake contract; the server states what it refuses. */
  declarePartner: (s: Scope, intake: RetentionPartnerIntake) =>
    r<{ partner: RetentionRow; receipt: Receipt }>(s, '/partners/declare', 'retention.partner.declare', 'RXP', intake),

  /** B16: a partner retired once with a reason (8+ characters); its row and its imports stay; its key no longer resolves a package (one it signed is quarantined until a partner holds the key again). */
  retirePartner: (s: Scope, partnerId: string, reason: string) =>
    r<{ partner: RetentionRow; receipt: Receipt }>(s, `/partners/${encodeURIComponent(partnerId)}/retire`, 'retention.partner.retire', 'RXP', { reason }, partnerId),

  /**
   * B16 (0076 §4): the steward's act (`retention.import.open`) — the package QUARANTINED as vault blobs and checked in one governed write:
   * the archive, the manifest, the integrity of every file, the re-import compatibility of every object, the chain, the key-based
   * signature against a declared partner's key, the closure by exact version, the intake contract's policy, a live duplicate, the
   * origin's revocation and expiry as far as they are provable here. The answer says VERIFIED (the plan of ids this installation mints)
   * or QUARANTINED with the failed checks named — a quarantined import keeps its evidence. An inline package above 64 MiB decoded is
   * refused (422): deliver it to a transfer station and open the import from there.
   */
  openImport: (s: Scope, source: RetentionImportSource) =>
    r<RetentionImportOpened>(s, '/imports/open', 'retention.import.open', 'RIM', { source }),

  /** B16: the domain's imports, newest first, each with its state, its origin, its counts and its partner (an audited read). */
  listImports: (s: Scope) =>
    r<{ imports: RetentionRow[]; receipt: Receipt }>(s, '/imports/list', 'retention.read', 'RIM'),

  getImport: (s: Scope, importId: string) =>
    r<RetentionImportDetail>(s, `/imports/${encodeURIComponent(importId)}/get`, 'retention.read', 'RIM', {}, importId),

  /** B16: the retention authority's act, human-gated (`retention.import.approve`) — on the PACKAGE DIGEST the approver read on the verified import, with a rationale (8+ characters); the opener never approves; a verified import only. */
  approveImport: (s: Scope, importId: string, packageDigest: string, rationale: string) =>
    r<{ import: RetentionRow; receipt: Receipt }>(s, `/imports/${encodeURIComponent(importId)}/approve`, 'retention.import.approve', 'RIM', { packageDigest, rationale }, importId),

  /**
   * B16: the steward's act, human-gated (`retention.import.admit`; never the approver) — the records, the claim versions, the entities,
   * the identifiers and the edges admitted under NEW ids in batches (each batch its own governed write, the batches answered with
   * their receipts); an item the intake's ceiling excludes, a header the port refuses, an edge whose claim version is not admitted
   * (never rebased) are settled as such, never the whole import; the quarantine copies of the admitted records are tombstoned after
   * the commit. An admission interrupted resumes with the same act.
   */
  admitImport: (s: Scope, importId: string) =>
    r<{ import: RetentionRow; batches: Array<Record<string, unknown>>; receipt: Receipt }>(s, `/imports/${encodeURIComponent(importId)}/admit`, 'retention.import.admit', 'RIM', {}, importId),

  /** B16 (C5): the steward's act (`retention.import.withdraw`) — a quarantined, verified, approved or admitting import withdrawn once with a reason; its ledger stays, its quarantine copies are tombstoned after the commit (the answer says how many); an admitted import is never withdrawn. */
  withdrawImport: (s: Scope, importId: string, reason: string) =>
    r<{ import: RetentionRow; quarantine: Record<string, unknown>; receipt: Receipt }>(s, `/imports/${encodeURIComponent(importId)}/withdraw`, 'retention.import.withdraw', 'RIM', { reason }, importId),
};
