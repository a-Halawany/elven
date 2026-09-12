/**
 * The EMITTERS of GraphChanged and MemoryCorrected (CP-6 B6, 0063) — one helper per event, called INSIDE the write
 * that makes the change, on the write's own capability, so the event is the change's second outbox row in the same
 * transaction (ES-19-001). What the helper does:
 *
 *   IDENTITIES     enriched from the entity rows the change touched (name, lifecycle, split lineage), read under RLS;
 *   RELATIONSHIPS  edges with their world and record intervals, resolutions, dependencies — the rows given plus
 *                  the ones the reach found;
 *   OBJECTS        the dependency walk (graph/strategy ImpactService.walk — the SAME method the invalidation uses,
 *                  never a second walker) from the change's seed: entity, edge, claim or evidence. Where the caller
 *                  already holds an assessed walk (the propagation consumer) that walk is carried, not repeated;
 *   TEMPORAL       the record instant, and the world interval when the change has one (an edge);
 *   SUBSCRIPTIONS  graph.subscriptions_matching at publication — evidence, never authority (the dispatcher
 *                  re-resolves at delivery);
 *   CAUSE          the governed action, actor and target.
 *
 * The walk is bounded (MAX_HOPS in the walker) and says so: `objects.truncated` is carried into the event exactly
 * as the walker reports it, so a consumer that selects from `objects` knows when the selection is incomplete.
 * `objects.walked` is false only for the one path that legitimately skips the walk — the resolver's automatic
 * acceptance inside a run over many mentions when no subscription is live at the write — and every consumer
 * that reads `objects` treats an unwalked event as "select by identities and relationships, then by my own reads".
 */
import type { GraphReads } from '../graph.capabilities.js';
import type { ImpactService } from '../strategy/impact.service.js';
import {
  EMPTY_REACH, type AffectedDependency, type AffectedEdge, type AffectedIdentity, type AffectedResolution, type ChangeCause,
  type CorrectedObject, type GraphChangeKind, type GraphChangedPayload, type MemoryChangeKind, type MemoryCorrectedPayload,
  type ReachedObjects, type SubscriptionRef,
} from './graph-change.js';

export type ReachSeed = { kind: 'entity' | 'edge' | 'claim' | 'evidence'; id: string };
/** The walker's trigger vocabulary is seed-typed; this is the one place the two are mapped. */
const TRIGGER_OF: Readonly<Record<ReachSeed['kind'], string>> = Object.freeze({
  entity: 'entity_split', edge: 'edge_retraction', claim: 'claim_correction', evidence: 'evidence_correction',
});

type Walked = Awaited<ReturnType<ImpactService['walk']>>;
type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

/** A walk's result (or an assessed impact record) as the event's `objects`. */
export function reachOf(w: Pick<Walked, 'assumptions' | 'objectives' | 'decisions' | 'commitments' | 'forecasts' | 'scenarios' | 'warnings' | 'twins' | 'simulations' | 'reachedClaims' | 'truncated'> & { reachedEvidence?: string[]; briefings?: Array<{ strategy_object_id: string }> }): ReachedObjects {
  const ids = (xs: Array<{ strategy_object_id: string }>): string[] => xs.map((x) => x.strategy_object_id);
  return {
    claims: [...w.reachedClaims], assumptions: ids(w.assumptions), objectives: ids(w.objectives), decisions: ids(w.decisions), commitments: ids(w.commitments),
    forecasts: ids(w.forecasts), scenarios: ids(w.scenarios), warnings: ids(w.warnings), twins: ids(w.twins), simulations: ids(w.simulations),
    evidence: [...(w.reachedEvidence ?? [])], briefings: ids(w.briefings ?? []), truncated: w.truncated, walked: true,
  };
}

export interface GraphChangedArgs {
  tenantId: string; domainId: string; kind: GraphChangeKind; occurredAt?: string;
  identities: AffectedIdentity[];
  edges?: AffectedEdge[]; resolutions?: AffectedResolution[]; dependencies?: AffectedDependency[];
  /** Where the reach starts; `null` skips the walk (objects.walked = false); a walk already made is carried as is. */
  reach: ReachSeed | { walked: Walked } | { reach: ReachedObjects } | null;
  graphEventId?: string | null; invalidationId?: string | null; correctionCaseId?: string | null;
  validFrom?: string | null; validTo?: string | null;
  cause: ChangeCause;
}

/** Build a GraphChanged@v1 outbox event inside the write that made the change. */
/** An outbox row as the pipeline takes it; the typed payload is the contract, the row is what is written. */
export interface OutboxRow { eventType: string; payload: Record<string, unknown> }
const asRow = (eventType: string, payload: GraphChangedPayload | MemoryCorrectedPayload): OutboxRow => ({ eventType, payload: payload as unknown as Record<string, unknown> });

export async function graphChangedEvent(cap: GraphReads, impact: ImpactService, a: GraphChangedArgs): Promise<OutboxRow> {
  const now = a.occurredAt ?? new Date().toISOString();
  let objects: ReachedObjects = { ...EMPTY_REACH, walked: false };
  let walked: Walked | null = null;
  if (a.reach !== null) {
    if ('walked' in a.reach) { walked = a.reach.walked; objects = reachOf(walked); }
    else if ('reach' in a.reach) objects = a.reach.reach;
    else { walked = await impact.walk(cap, { triggerKind: TRIGGER_OF[a.reach.kind], triggerObjectId: a.reach.id }); objects = reachOf(walked); }
  }
  // Identities: the ones given, plus every entity the walk reached — each enriched from its current row under RLS.
  const identityIds = new Set<string>(a.identities.map((i) => i.entity_id));
  const identities: AffectedIdentity[] = [...a.identities];
  for (const e of walked?.reachedEntities ?? []) if (!identityIds.has(e)) { identityIds.add(e); identities.push({ entity_id: e, role: 'reached' }); }
  if (identities.length > 0) {
    const rows = (await cap.readEntities().selectAll().where('entity_id' as never, 'in', [...identityIds] as never).execute()) as Row[];
    const byId = new Map(rows.map((r) => [String(r['entity_id']), r]));
    for (const i of identities) {
      const r = byId.get(i.entity_id);
      if (r === undefined) continue;
      if (i.canonical_name === undefined) i.canonical_name = str(r['canonical_name']);
      if (i.lifecycle_state === undefined) i.lifecycle_state = str(r['lifecycle_state']);
      if (i.split_from === undefined) i.split_from = str(r['split_from']);
    }
  }
  // Edges: the ones given plus the reached ones, each with its intervals from the current row.
  const edgeIds = new Set<string>((a.edges ?? []).map((e) => e.edge_id));
  const edges: AffectedEdge[] = [...(a.edges ?? [])];
  for (const e of walked?.reachedEdges ?? []) if (!edgeIds.has(e)) { edgeIds.add(e); edges.push({ edge_id: e, state: 'reached' }); }
  if (edges.length > 0) {
    const rows = (await cap.readEdges().selectAll().where('edge_id' as never, 'in', [...edgeIds] as never).execute()) as Row[];
    const byId = new Map(rows.map((r) => [String(r['edge_id']), r]));
    for (const e of edges) {
      const r = byId.get(e.edge_id);
      if (r === undefined) continue;
      if (e.state === 'reached') e.state = String(r['state']);
      e.predicate ??= String(r['predicate']); e.subject_entity_id ??= String(r['subject_entity_id']); e.object_entity_id ??= String(r['object_entity_id']);
      e.valid_from ??= str(r['valid_from']); e.valid_to ??= str(r['valid_to']); e.asserted_at ??= str(r['asserted_at']);
      e.retracted_at ??= str(r['retracted_at']); e.claim_object_id ??= str(r['claim_object_id']);
    }
  }
  // Dependencies: the ones given plus the active rows that rest on what the change touched (one hop, so a consumer sees the join it selects by).
  const dependencies: AffectedDependency[] = [...(a.dependencies ?? [])];
  const restsOn: Array<{ kind: string; id: string }> = [
    ...[...identityIds].map((id) => ({ kind: 'entity', id })), ...[...edgeIds].map((id) => ({ kind: 'edge', id })), ...objects.claims.map((id) => ({ kind: 'claim', id })),
  ];
  if (restsOn.length > 0) {
    const rows = (await cap.readDependencies().selectAll().where('state' as never, '=', 'active' as never)
      .where('depends_on_id' as never, 'in', restsOn.map((r) => r.id) as never).execute()) as Row[];
    // One entry per (dependent, kind, id): a row given by the caller without its id is completed by the read, not repeated.
    const keyOf = (d: { dependent_object_id: string; depends_on_kind: string; depends_on_id: string }) => `${d.dependent_object_id}:${d.depends_on_kind}:${d.depends_on_id}`;
    const given = new Map(dependencies.map((d) => [keyOf(d), d]));
    for (const r of rows) {
      const kind = String(r['depends_on_kind']); const id = String(r['depends_on_id']);
      if (!restsOn.some((x) => x.kind === kind && x.id === id)) continue;
      const row = { dependency_id: String(r['dependency_id']), dependent_object_id: String(r['dependent_object_id']), dependent_type: String(r['dependent_type']), depends_on_kind: kind, depends_on_id: id };
      const g = given.get(keyOf(row));
      if (g !== undefined) { g.dependency_id ??= row.dependency_id; continue; }
      given.set(keyOf(row), row); dependencies.push(row);
    }
  }
  const subscriptions: SubscriptionRef[] = await cap.subscriptionsMatching({ tenantId: a.tenantId, domainId: a.domainId, eventType: 'GraphChanged', changeKind: a.kind });
  const payload: GraphChangedPayload = {
    schema: 'GraphChanged', schema_version: 'v1',
    change: { kind: a.kind, occurred_at: now, graph_event_id: a.graphEventId ?? null, invalidation_id: a.invalidationId ?? null, correction_case_id: a.correctionCaseId ?? null },
    identities, relationships: { edges, resolutions: a.resolutions ?? [], dependencies },
    objects, temporal: { known_at: now, valid_from: a.validFrom ?? null, valid_to: a.validTo ?? null },
    subscriptions, cause: a.cause,
  };
  return asRow('GraphChanged', payload);
}

/**
 * Build a MemoryCorrected@v1 outbox event inside the correcting write. The caller (observation for evidence,
 * intelligence for a claim) has no graph capability and no walker — by design (the layering) — so it supplies
 * the corrected objects, the derived claims it can read (claim lineage) and the matching subscriptions through
 * its own capability's ports; the consumers select by those and by their own reads.
 */
/**
 * A RECOMPUTATION replaced an issued forecast (0065, AU-MEM-0039 "recomputation changes recommendation materially"): a
 * GraphChanged of kind forecast.superseded, written inside the issue, naming the SUPERSEDED forecast in objects.forecasts
 * (the consumers that rest on it select by it: a scenario tree, a decision package citing it) and the new forecast as the
 * cause's target. No identities are carried on purpose: the entity did not change, the product about it did.
 */
export function forecastSupersededEvent(a: { supersededForecastId: string; newForecastId: string; subjectEntityId: string | null; occurredAt?: string; subscriptions: SubscriptionRef[]; actor: string }): OutboxRow {
  const now = a.occurredAt ?? new Date().toISOString();
  const payload: GraphChangedPayload = {
    schema: 'GraphChanged', schema_version: 'v1',
    change: { kind: 'forecast.superseded', occurred_at: now, graph_event_id: null, invalidation_id: null, correction_case_id: null },
    identities: [],
    relationships: { edges: [], resolutions: [], dependencies: [] },
    objects: { ...EMPTY_REACH, forecasts: [a.supersededForecastId], walked: true },
    temporal: { known_at: now },
    subscriptions: a.subscriptions,
    cause: { action: 'prediction.forecast.issue', actor: a.actor, target_type: 'FCT', target_id: a.newForecastId },
  };
  return asRow('GraphChanged', payload);
}

/**
 * A MODEL CHANGE opened reassessments (0065 §7, TT-04): an extraction method was suspended or retired and the edges its
 * claims assert are pending reassessment — GraphChanged/edge.reassessment_opened, written inside the transition, carrying
 * the edges (with their ends as subject/object identities, so a twin bounded by them or a forecast resting on the edge
 * re-verifies as it would on a retraction) and the method as the cause.
 */
export function edgeReassessmentEvent(a: { tenantId: string; domainId: string; methodId: string; edges: Array<{ edge_id: string; subject_entity_id: string; object_entity_id: string; predicate: string; claim_object_id: string; claim_version: number; valid_from: string | null; valid_to: string | null;
                                                                                                        dependencies?: Array<{ dependency_id: string; dependent_object_id: string; dependent_type: string; depends_on_kind: string; depends_on_id: string }> }>;
                                            occurredAt?: string; subscriptions: SubscriptionRef[]; actor: string }): OutboxRow {
  const now = a.occurredAt ?? new Date().toISOString();
  const identities: AffectedIdentity[] = [];
  const seen = new Set<string>();
  for (const e of a.edges) {
    for (const [id, role] of [[e.subject_entity_id, 'subject'], [e.object_entity_id, 'object']] as const) {
      if (!seen.has(`${id}/${role}`)) { seen.add(`${id}/${role}`); identities.push({ entity_id: id, role }); }
    }
  }
  const payload: GraphChangedPayload = {
    schema: 'GraphChanged', schema_version: 'v1',
    change: { kind: 'edge.reassessment_opened', occurred_at: now, graph_event_id: null, invalidation_id: null, correction_case_id: null },
    identities,
    relationships: { edges: a.edges.map((e) => ({ edge_id: e.edge_id, state: 'asserted', predicate: e.predicate, subject_entity_id: e.subject_entity_id, object_entity_id: e.object_entity_id, valid_from: str(e.valid_from), valid_to: str(e.valid_to), claim_object_id: e.claim_object_id })), resolutions: [],
                     // what declares it rests on a reassessed edge (a decision, a forecast): the consumers select by it as they would on a retraction
                     dependencies: a.edges.flatMap((e) => (e.dependencies ?? []).map((d) => ({ dependency_id: d.dependency_id, dependent_object_id: d.dependent_object_id, dependent_type: d.dependent_type, depends_on_kind: d.depends_on_kind, depends_on_id: d.depends_on_id }))) },
    objects: { ...EMPTY_REACH, walked: false },
    temporal: { known_at: now },
    subscriptions: a.subscriptions,
    cause: { action: 'intelligence.method.activate', actor: a.actor, target_type: 'MTH', target_id: a.methodId },
  };
  return asRow('GraphChanged', payload);
}

export function memoryCorrectedEvent(a: {
  kind: MemoryChangeKind; occurredAt?: string; objects: CorrectedObject[]; claims: string[];
  correctionCaseId?: string | null; reviewCaseId?: string | null; subscriptions: SubscriptionRef[]; cause: ChangeCause;
}): OutboxRow {
  const now = a.occurredAt ?? new Date().toISOString();
  const payload: MemoryCorrectedPayload = {
    schema: 'MemoryCorrected', schema_version: 'v1',
    change: { kind: a.kind, occurred_at: now, correction_case_id: a.correctionCaseId ?? null, review_case_id: a.reviewCaseId ?? null },
    objects: a.objects, claims: a.claims, temporal: { known_at: now }, subscriptions: a.subscriptions, cause: a.cause,
  };
  return asRow('MemoryCorrected', payload);
}

/**
 * The identity roles that mean the ENTITY ITSELF (or a relationship it is an end of) changed — as opposed to
 * `rests_on` (a declared object now depends on it) and `reached` (the walk passed through it): a twin bounded by the
 * entity or a forecast about it is re-verified for the former, never for the latter (a declaration about an entity
 * changes nothing the twin or the forecast rests on).
 */
const CHANGED_ROLES = new Set(['created', 'origin', 'successor', 'resolved_to', 'subject', 'object']);

/** Every stable id an event touches, by kind — the selection key set every consumer starts from. */
export function touchedIds(event: { event_type: 'GraphChanged'; payload: GraphChangedPayload } | { event_type: 'MemoryCorrected'; payload: MemoryCorrectedPayload }): {
  entities: Set<string>; changedEntities: Set<string>; edges: Set<string>; claims: Set<string>; evidence: Set<string>; strategy: Set<string>; forecasts: Set<string>; scenarios: Set<string>; twins: Set<string>; runs: Set<string>; walked: boolean; truncated: boolean;
} {
  const s = { entities: new Set<string>(), changedEntities: new Set<string>(), edges: new Set<string>(), claims: new Set<string>(), evidence: new Set<string>(), strategy: new Set<string>(), forecasts: new Set<string>(), scenarios: new Set<string>(), twins: new Set<string>(), runs: new Set<string>(), walked: false, truncated: false };
  if (event.event_type === 'GraphChanged') {
    const p = event.payload;
    for (const i of p.identities) { s.entities.add(i.entity_id); if (CHANGED_ROLES.has(i.role)) s.changedEntities.add(i.entity_id); }
    for (const e of p.relationships.edges) { s.edges.add(e.edge_id); if (e.claim_object_id) s.claims.add(e.claim_object_id); }
    for (const r of p.relationships.resolutions) { s.entities.add(r.entity_id); s.claims.add(r.claim_object_id); }
    for (const d of p.relationships.dependencies) s.strategy.add(d.dependent_object_id);
    const o = p.objects;
    for (const c of o.claims) s.claims.add(c);
    for (const x of [...o.assumptions, ...o.objectives, ...o.decisions, ...o.commitments]) s.strategy.add(x);
    for (const x of o.forecasts) s.forecasts.add(x);
    for (const x of o.scenarios) s.scenarios.add(x);
    for (const x of o.twins) s.twins.add(x);
    for (const x of o.simulations) s.runs.add(x);
    for (const x of o.evidence) s.evidence.add(x);
    s.walked = o.walked; s.truncated = o.truncated;
  } else {
    const p = event.payload;
    for (const o of p.objects) { if (o.object_type === 'EVD') s.evidence.add(o.object_id); else s.claims.add(o.object_id); }
    for (const c of p.claims) s.claims.add(c);
  }
  return s;
}
