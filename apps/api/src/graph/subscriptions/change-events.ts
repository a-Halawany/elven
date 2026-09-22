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
 * `objects.walked` is false only for the paths that legitimately skip the walk — the resolver's automatic
 * acceptance inside a run over many mentions when no subscription is live at the write, and an import's admission
 * (0077: nothing of the domain rests on ids minted a moment ago) — and every consumer that reads `objects` treats an
 * unwalked event as "select by identities and relationships, then by my own reads".
 *
 * 0077 (B17): the two events of the governed import. `import.admitted` is built PURE (the facts and the matching
 * subscriptions handed in; no read) inside the graph write that moves the import to admitted; `import.revoked` runs
 * the walk from every withdrawn record and claim on the IMPORTING domain's own capability — retention's, which carries
 * the reads the walker and this builder call (ChangeReads, a structural pick of GraphReads) — so the propagation is
 * the same method, never a second walker, and no graph capability is minted in a retention write.
 *
 * 0078 (B18): the three LIFECYCLE kinds, each built PURE inside the module write that makes the transition (the twin's
 * admit, the forecast's withdrawal, the run's invalidation) with the facts that write already holds: `twin.state_changed`
 * names the twin and the SUPERSEDED version's runs with no walk (the walker cannot seed a twin; the consumers select by
 * their own reads); `forecast.withdrawn` and `simulation.invalidated` name the one object and carry the dependants the
 * PORT enumerated in a typed block (`walked` true: the reach was made, by the port). Every list that can grow is cut at
 * LIFECYCLE_EVENT_LIST_MAX and says so.
 */
import type { GraphReads } from '../graph.capabilities.js';
import type { ImpactService, WalkReads } from '../strategy/impact.service.js';
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

/**
 * The reads the walker and the GraphChanged builder call — a structural pick, so a capability of another module
 * (retention, 0077) can carry the same walk without a second walker. Every GraphReads satisfies it.
 */
export type ChangeReads = WalkReads & Pick<GraphReads, 'readEntities' | 'readEdges' | 'readDependencies' | 'subscriptionsMatching'>;

type Walked = Awaited<ReturnType<ImpactService['walk']>>;
type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));

/** A walk's result (or an assessed impact record) as the event's `objects`. */
export function reachOf(w: Pick<Walked, 'assumptions' | 'objectives' | 'decisions' | 'commitments' | 'forecasts' | 'scenarios' | 'warnings' | 'twins' | 'simulations' | 'reachedClaims' | 'truncated'> & { reachedEvidence?: string[]; briefings?: Array<{ strategy_object_id: string }>; memoryItems?: Array<{ strategy_object_id: string }> }): ReachedObjects {
  const ids = (xs: Array<{ strategy_object_id: string }>): string[] => xs.map((x) => x.strategy_object_id);
  return {
    claims: [...w.reachedClaims], assumptions: ids(w.assumptions), objectives: ids(w.objectives), decisions: ids(w.decisions), commitments: ids(w.commitments),
    forecasts: ids(w.forecasts), scenarios: ids(w.scenarios), warnings: ids(w.warnings), twins: ids(w.twins), simulations: ids(w.simulations),
    evidence: [...(w.reachedEvidence ?? [])], briefings: ids(w.briefings ?? []), memoryItems: ids(w.memoryItems ?? []), truncated: w.truncated, walked: true,
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

export async function graphChangedEvent(cap: ChangeReads, impact: ImpactService, a: GraphChangedArgs): Promise<OutboxRow> {
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

// ───────────────────────── 0077 (B17): the governed import's two events ─────────────────────────

/**
 * The ceiling of every id list an import event carries (identities, edges, claims, evidence): the import ledger
 * (retention.import_items) is the full record — the event announces the change and says when it was cut.
 */
export const IMPORT_EVENT_LIST_MAX = 200;
/**
 * The walks one revocation event merges: the first IMPORT_WALK_SEEDS_MAX seeds (the tombstoned records, then the
 * withdrawn claims no seeded record's lineage reaches) are walked, the rest are listed unwalked and `truncated` says
 * so. Bounded cost: up to 32 walks, each reading the nine reach tables once (a `walkMany` is a later note).
 */
export const IMPORT_WALK_SEEDS_MAX = 32;

/** The facts an import's write hands the builders — collected from the item map and the ledger row, never read here. */
export interface ImportChangeFacts {
  tenantId: string; domainId: string; importId: string; partnerKey: string;
  origin: { tenant_id: string; domain_id: string; action_id: string; package_digest: string };
  /** The ledger's counts (countsOf): on an admission `reused` is explicit — a reused row is announced as an identity `reached`, never in objects. */
  counts: Record<string, unknown>;
  /** `created` (an admission minted it), `reached` (reused as it stands — retired or not), `retired` (a revocation retired it: a CHANGED identity, D2). */
  identities: Array<{ entity_id: string; role: 'created' | 'reached' | 'retired'; canonical_name?: string | null; lifecycle_state?: string | null }>;
  edges: Array<{ edge_id: string; state: string; predicate?: string; subject_entity_id?: string; object_entity_id?: string; valid_from?: string | null; valid_to?: string | null; asserted_at?: string | null; retracted_at?: string | null; claim_object_id?: string | null }>;
  /** Distinct claim object ids (admitted, or withdrawn) and record object ids (admitted, or tombstoned). */
  claims: string[]; evidence: string[];
  actor: string; occurredAt?: string;
}
/** The walk seed of a revocation: a tombstoned record (through its lineage to the claims), or a withdrawn claim no seeded record reaches. */
export type ImportWalkSeed = { kind: 'evidence' | 'claim'; id: string };
/** The walker's trigger per revocation seed — a record as a corrected one, a claim as a withdrawn one (a trigger the walker and 0025's CHECK know). */
const IMPORT_TRIGGER_OF: Readonly<Record<ImportWalkSeed['kind'], string>> = Object.freeze({ evidence: 'evidence_correction', claim: 'claim_withdrawal' });

const cut = <T>(xs: T[]): T[] => xs.slice(0, IMPORT_EVENT_LIST_MAX);
const union = (...lists: string[][]): string[] => [...new Set(lists.flat())];

/**
 * D1: the ONE event of an ADMISSION — pure over its arguments (no read: the write that calls it holds the item map and
 * the matching subscriptions), built inside the graph write that moves the import to admitted. The identities are the
 * entities the import CREATED (`created`) and the ones it REUSED (`reached`: nothing changed for them), the edges as
 * the import recorded them, the claims and records it admitted — reused claims and records are NOT announced in
 * `objects` (nothing changed for them; `import.counts.reused` says how many). Every list is cut at
 * IMPORT_EVENT_LIST_MAX and `objects.truncated` says so; `objects.walked` is false: nothing of the domain rests on
 * ids minted in this write. The cause is the admit act on the import (RIM).
 */
export function importAdmittedEvent(f: ImportChangeFacts & { subscriptions: SubscriptionRef[] }): OutboxRow {
  const now = f.occurredAt ?? new Date().toISOString();
  const truncated = f.identities.length > IMPORT_EVENT_LIST_MAX || f.edges.length > IMPORT_EVENT_LIST_MAX || f.claims.length > IMPORT_EVENT_LIST_MAX || f.evidence.length > IMPORT_EVENT_LIST_MAX;
  const identities: AffectedIdentity[] = cut(f.identities).map((i) => ({ entity_id: i.entity_id, role: i.role, canonical_name: i.canonical_name ?? null, lifecycle_state: i.lifecycle_state ?? null, split_from: null }));
  const edges: AffectedEdge[] = cut(f.edges).map((e) => ({ ...e }));
  const payload: GraphChangedPayload = {
    schema: 'GraphChanged', schema_version: 'v1',
    change: { kind: 'import.admitted', occurred_at: now, graph_event_id: null, invalidation_id: null, correction_case_id: null },
    identities,
    relationships: { edges, resolutions: [], dependencies: [] },
    objects: { ...EMPTY_REACH, claims: cut(f.claims), evidence: cut(f.evidence), truncated, walked: false },
    temporal: { known_at: now },
    subscriptions: f.subscriptions,
    cause: { action: 'retention.import.admit', actor: f.actor, target_type: 'RIM', target_id: f.importId },
    import: { import_id: f.importId, partner_key: f.partnerKey, origin: f.origin, counts: f.counts },
  };
  return asRow('GraphChanged', payload);
}

/**
 * D3: the ONE event of a REVOCATION attempt, built in the finish write after the destruction's batches committed (the
 * retired and retracted rows read back as they are). The walk runs from each seed — the tombstoned records as
 * evidence corrections (through the lineage to the claims), the withdrawn claims no seeded record reaches as claim
 * withdrawals — the first IMPORT_WALK_SEEDS_MAX of them; the merged walk (one entry per reached object, the routes it
 * was reached by merged; the reached entities, edges and claims united; `truncated` when any walk stopped at its bound
 * or a seed was left unwalked) is handed to graphChangedEvent as a walk already made, which enriches the given
 * identities and edges from their current rows (a retired entity reads back `retired`), adds the walk's entities and
 * edges as `reached`, the one-hop dependencies and the subscriptions matching `import.revoked`. The withdrawn claims and
 * tombstoned records are then united into `objects` (cut, `truncated` said) and the import block carries the notice.
 * A seed whose lineage names no claim reaches nothing — legitimate: the record alone was withdrawn.
 */
export async function importRevokedEvent(cap: ChangeReads, impact: ImpactService, f: ImportChangeFacts & {
  walkSeeds: ImportWalkSeed[]; notice: { notice_id: string | null; source: 'origin' | 'station'; revoked_at: string | null; reason: string | null };
}): Promise<OutboxRow> {
  const seeds = f.walkSeeds.slice(0, IMPORT_WALK_SEEDS_MAX);
  const walks: Walked[] = [];
  for (const s of seeds) walks.push(await impact.walk(cap, { triggerKind: IMPORT_TRIGGER_OF[s.kind], triggerObjectId: s.id }));
  const merged = mergeWalks(f.importId, walks, f.walkSeeds.length > IMPORT_WALK_SEEDS_MAX);
  const row = await graphChangedEvent(cap, impact, {
    tenantId: f.tenantId, domainId: f.domainId, kind: 'import.revoked', ...(f.occurredAt === undefined ? {} : { occurredAt: f.occurredAt }),
    identities: cut(f.identities).map((i) => ({ entity_id: i.entity_id, role: i.role, ...(i.canonical_name === undefined ? {} : { canonical_name: i.canonical_name }), ...(i.lifecycle_state === undefined ? {} : { lifecycle_state: i.lifecycle_state }) })),
    edges: cut(f.edges).map((e) => ({ ...e })),
    reach: { walked: merged },
    cause: { action: 'retention.import.revoke', actor: f.actor, target_type: 'RIM', target_id: f.importId },
  });
  const p = row.payload as unknown as GraphChangedPayload;
  const claims = union(f.claims, p.objects.claims); const evidence = union(f.evidence, p.objects.evidence);
  p.objects.claims = cut(claims); p.objects.evidence = cut(evidence);
  p.objects.truncated = p.objects.truncated || f.identities.length > IMPORT_EVENT_LIST_MAX || f.edges.length > IMPORT_EVENT_LIST_MAX || claims.length > IMPORT_EVENT_LIST_MAX || evidence.length > IMPORT_EVENT_LIST_MAX;
  p.import = { import_id: f.importId, partner_key: f.partnerKey, origin: f.origin, counts: f.counts, notice: f.notice };
  return row;
}

/** The union of several walks as one: per list one entry per reached object (the first route kept, the others merged into via_ids); the reach sets united; the frontiers concatenated. */
function mergeWalks(importId: string, walks: Walked[], seedsLeftUnwalked: boolean): Walked {
  type Affected = Walked['assumptions'][number];
  const mergeList = (key: keyof Pick<Walked, 'assumptions' | 'objectives' | 'decisions' | 'commitments' | 'forecasts' | 'scenarios' | 'warnings' | 'twins' | 'simulations' | 'briefings' | 'memoryItems'>): Affected[] => {
    const byId = new Map<string, Affected>();
    for (const w of walks) {
      for (const x of w[key]) {
        const already = byId.get(x.strategy_object_id);
        if (already === undefined) { byId.set(x.strategy_object_id, { ...x, ...(x.via_ids === undefined ? {} : { via_ids: [...x.via_ids] }) }); continue; }
        for (const v of x.via_ids ?? (x.via_id === undefined ? [] : [x.via_id])) {
          if (already.via_ids === undefined) already.via_ids = already.via_id === undefined ? [] : [already.via_id];
          if (!already.via_ids.includes(v)) already.via_ids.push(v);
        }
      }
    }
    return [...byId.values()].sort((x, y) => x.hop - y.hop);
  };
  return {
    triggerKind: 'import_revocation', triggerObjectId: importId,
    assumptions: mergeList('assumptions'), objectives: mergeList('objectives'), decisions: mergeList('decisions'), commitments: mergeList('commitments'),
    forecasts: mergeList('forecasts'), scenarios: mergeList('scenarios'), warnings: mergeList('warnings'), twins: mergeList('twins'), simulations: mergeList('simulations'),
    briefings: mergeList('briefings'), memoryItems: mergeList('memoryItems'),
    reachedEntities: union(...walks.map((w) => w.reachedEntities)), reachedEdges: union(...walks.map((w) => w.reachedEdges)), reachedClaims: union(...walks.map((w) => w.reachedClaims)),
    truncated: seedsLeftUnwalked || walks.some((w) => w.truncated),
    unexplored: walks.flatMap((w) => w.unexplored),
  };
}

// ───────────────────────── 0078 (B18): the lifecycle kinds ─────────────────────────

/**
 * The ceiling of every list a lifecycle event carries (the superseded version's runs here; the changed variables, the
 * provenance citations and the dependants in the module builders that import it): the ledger of each module is the full
 * record — the event announces the transition and says when it was cut.
 */
export const LIFECYCLE_EVENT_LIST_MAX = 200;
/** A list cut at the ceiling, with whether it was: the one idiom every B18 builder uses for a sibling `truncated`. */
export const cutList = <X>(xs: X[]): { list: X[]; truncated: boolean } => ({ list: xs.slice(0, LIFECYCLE_EVENT_LIST_MAX), truncated: xs.length > LIFECYCLE_EVENT_LIST_MAX });

/**
 * A twin version ADMITTED (0078, D3): no identities (the boundary did not change), objects.twins the twin, objects.simulations
 * the SUPERSEDED version's runs — read by (twin_id, twin_version) in the admit write; a first version has none — cut at the
 * ceiling with `truncated` said; `walked` false: the walker cannot seed a twin, so the consumers select by their own reads
 * (the twins consumer answers nothing for this kind — a twin's own admission never unverifies its versions; the decisions
 * consumer notes the packages citing the superseded version's runs, without exposure). The typed `twin` block carries the
 * version, what it supersedes, the branch and the counts; the cause is the admit act on the twin (TWN).
 */
export function twinStateChangedGraphEvent(a: { twinId: string; version: number; supersedes: number | null; branchId: string; changedVariables: number; runs: string[]; subscriptions: SubscriptionRef[]; actor: string; occurredAt?: string }): OutboxRow {
  const now = a.occurredAt ?? new Date().toISOString();
  const runs = cutList(a.runs);
  const payload: GraphChangedPayload = {
    schema: 'GraphChanged', schema_version: 'v1',
    change: { kind: 'twin.state_changed', occurred_at: now, graph_event_id: null, invalidation_id: null, correction_case_id: null },
    identities: [],
    relationships: { edges: [], resolutions: [], dependencies: [] },
    objects: { ...EMPTY_REACH, twins: [a.twinId], simulations: runs.list, truncated: runs.truncated, walked: false },
    temporal: { known_at: now },
    subscriptions: a.subscriptions,
    cause: { action: 'twin.version.admit', actor: a.actor, target_type: 'TWN', target_id: a.twinId },
    twin: { twin_id: a.twinId, version: a.version, supersedes: a.supersedes, branch_id: a.branchId, change: 'version.admitted', changed_variables: a.changedVariables, runs_of_superseded: a.runs.length },
  };
  return asRow('GraphChanged', payload);
}

/**
 * An issued forecast WITHDRAWN as unfit (0078, D8): the forecastSupersededEvent shape — no identities, objects.forecasts the
 * withdrawn forecast, `walked` true because the PORT enumerated the dependants (scenarios, warnings, twins, simulations,
 * packages; each ≤ 200 with its own `truncated`) and carries them in the typed `forecast` block with the reason and the unfit
 * class. The consumers that rest on the forecast select by objects.forecasts as they do for a supersession; the decisions
 * consumer reads the block for its note and exposes a categorical loss. The cause is the withdraw act on the forecast (FCT).
 */
export function forecastWithdrawnGraphEvent(a: { forecastId: string; seriesKey: string; horizon: string; subjectEntityId: string | null; reason: string; unfitClass: string; withdrawnAt: string; dependants: Row; subscriptions: SubscriptionRef[]; actor: string; occurredAt?: string }): OutboxRow {
  const now = a.occurredAt ?? new Date().toISOString();
  const payload: GraphChangedPayload = {
    schema: 'GraphChanged', schema_version: 'v1',
    change: { kind: 'forecast.withdrawn', occurred_at: now, graph_event_id: null, invalidation_id: null, correction_case_id: null },
    identities: [],
    relationships: { edges: [], resolutions: [], dependencies: [] },
    objects: { ...EMPTY_REACH, forecasts: [a.forecastId], walked: true },
    temporal: { known_at: now },
    subscriptions: a.subscriptions,
    cause: { action: 'prediction.forecast.withdraw', actor: a.actor, target_type: 'FCT', target_id: a.forecastId },
    forecast: { forecast_id: a.forecastId, series_key: a.seriesKey, horizon: a.horizon, reason: a.reason, unfit_class: a.unfitClass, withdrawn_at: a.withdrawnAt, dependants: a.dependants },
  };
  return asRow('GraphChanged', payload);
}

/**
 * A completed run's result INVALIDATED (0078, D6/D7): objects.simulations the run, `walked` true (the PORT enumerated the
 * dependants — packages, commitments, decisions, twins, simulations — carried in the typed `simulation` block with the
 * reason and the trigger: a person's act, or a reproduction's unreproducible verdict, `trigger_ref` naming the reproduction).
 * The cause is the act that invalidated — simulation.run.invalidate by hand, simulation.reproduce inside the reproduce write.
 */
export function simulationInvalidatedGraphEvent(a: { runId: string; reason: string; trigger: 'operator' | 'reproduction'; triggerRef: string | null; invalidatedAt: string; dependants: Row; subscriptions: SubscriptionRef[]; actor: string; action: 'simulation.run.invalidate' | 'simulation.reproduce'; occurredAt?: string }): OutboxRow {
  const now = a.occurredAt ?? new Date().toISOString();
  const payload: GraphChangedPayload = {
    schema: 'GraphChanged', schema_version: 'v1',
    change: { kind: 'simulation.invalidated', occurred_at: now, graph_event_id: null, invalidation_id: null, correction_case_id: null },
    identities: [],
    relationships: { edges: [], resolutions: [], dependencies: [] },
    objects: { ...EMPTY_REACH, simulations: [a.runId], walked: true },
    temporal: { known_at: now },
    subscriptions: a.subscriptions,
    cause: { action: a.action, actor: a.actor, target_type: 'SIM', target_id: a.runId },
    simulation: { run_id: a.runId, reason: a.reason, trigger: a.trigger, trigger_ref: a.triggerRef, invalidated_at: a.invalidatedAt, dependants: a.dependants },
  };
  return asRow('GraphChanged', payload);
}

/**
 * The identity roles that mean the ENTITY ITSELF (or a relationship it is an end of) changed — as opposed to
 * `rests_on` (a declared object now depends on it) and `reached` (the walk passed through it): a twin bounded by the
 * entity or a forecast about it is re-verified for the former, never for the latter (a declaration about an entity
 * changes nothing the twin or the forecast rests on). 0077 (D2): an entity RETIRED under an import's revocation is a
 * changed identity — a twin bounded by it re-verifies; `created` would state a creation, origin/successor are the split's.
 */
const CHANGED_ROLES = new Set(['created', 'origin', 'successor', 'resolved_to', 'subject', 'object', 'retired']);

/** Every stable id an event touches, by kind — the selection key set every consumer starts from. */
export function touchedIds(event: { event_type: 'GraphChanged'; payload: GraphChangedPayload } | { event_type: 'MemoryCorrected'; payload: MemoryCorrectedPayload }): {
  entities: Set<string>; changedEntities: Set<string>; edges: Set<string>; claims: Set<string>; evidence: Set<string>; strategy: Set<string>; forecasts: Set<string>; scenarios: Set<string>; twins: Set<string>; runs: Set<string>; memoryItems: Set<string>; walked: boolean; truncated: boolean;
} {
  const s = { entities: new Set<string>(), changedEntities: new Set<string>(), edges: new Set<string>(), claims: new Set<string>(), evidence: new Set<string>(), strategy: new Set<string>(), forecasts: new Set<string>(), scenarios: new Set<string>(), twins: new Set<string>(), runs: new Set<string>(), memoryItems: new Set<string>(), walked: false, truncated: false };
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
    for (const x of o.memoryItems ?? []) s.memoryItems.add(x);
    s.walked = o.walked; s.truncated = o.truncated;
  } else {
    const p = event.payload;
    // 0066 §3: a memory item (MEM) is its own key — a corrected or superseded item is neither evidence nor a claim (B9 review G9).
    for (const o of p.objects) { if (o.object_type === 'EVD') s.evidence.add(o.object_id); else if (o.object_type === 'MEM') s.memoryItems.add(o.object_id); else s.claims.add(o.object_id); }
    for (const c of p.claims) s.claims.add(c);
  }
  return s;
}
