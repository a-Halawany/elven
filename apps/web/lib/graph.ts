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
};
