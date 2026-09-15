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

/* ───────────────────────── governed retention (0066 §4 / 0067 / 0068 / 0070 / 0072) ───────────────────────── */

/**
 * The retention routes live under `…/retention`, not `…/graph`, and every call is made under the purpose `retention`.
 * One governed act per state transition of an action — open, resolve, approve (human-gated, on the scope digest the
 * approver read), execute (human-gated, never the approver), verify — and the schedule's declare and evaluate; the
 * reads apart (`retention.read`, an audited access). RTS is a schedule, RTA an action, RTP the cold tier's policy (B12:
 * declared per domain, its state read beside the lists). The server's refusal is returned verbatim: the opener's own
 * approval, a wrong digest, an unresolved scope, a review's failed check, a budget exhausted are all its words.
 */
async function r<T>(
  scope: Scope, path: string, action: string, objectType: 'RTS' | 'RTA' | 'RTP',
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
 * schedule), manifestIds (1–200, a chosen object set); a customer export names its classificationCeiling (the redaction gate)
 * and may name destination `export` (the only destination this release binds); a log partition names partitionKey + toSeq
 * and takes the log_floor kind only.
 */
export interface RetentionOpenIntake {
  kind: RetentionKind;
  targetKind: RetentionTargetKind;
  selector: { manifestId?: string; sourceId?: string; manifestIds?: string[]; classificationCeiling?: RetentionClassification; destination?: 'export' } | { partitionKey: string; toSeq: number };
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
  }>;
  vault: { evidence: RetentionVaultInventory; archive: RetentionVaultInventory };
}

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

/** The export package's record (…/actions/:id/export/get, B11): the ledger row, manifest.json as written (null when its file is gone) and the files the package holds. */
export interface RetentionExportDetail {
  package: RetentionRow;
  manifest: Record<string, unknown> | null;
  files: string[];
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

  /** B11: the retention authority's act, human-gated — the package revoked once with a reason; its bytes removed after the commit. */
  revokeExport: (s: Scope, actionId: string, reason: string) =>
    r<{ revocation: Record<string, unknown>; bytes: { removed: boolean; error?: string }; receipt: Receipt }>(s, `/actions/${actionId}/export/revoke`, 'retention.export.revoke', 'RTA', { reason }, actionId),
};
