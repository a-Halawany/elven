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

  awaitingPropagation: (s: Scope, cursor?: string) =>
    g<{ awaiting: Array<Record<string, unknown>>; total: number; nextCursor: string | null;
        note: string; receipt: Receipt }>(
      s, '/impact/awaiting', 'graph.read', 'COR',
      cursor === undefined ? { limit: 100 } : { limit: 100, cursor }),

  verifyProjections: (s: Scope) =>
    g<{ projections: Array<{ projection: string; live_rows: string; rebuilt_rows: string;
                             mismatched: string }>; receipt: Receipt }>(
      s, '/projections/verify', 'graph.read', 'ENT'),
};
