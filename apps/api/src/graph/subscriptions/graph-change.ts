/**
 * GraphChanged / MemoryCorrected — the event contracts of CP-6 B6 (migration 0063), and the consumer identities.
 *
 * AU-MEM-0030: "Graph and memory changes publish a GraphChanged/MemoryCorrected event with affected identities,
 * relationships, temporal scopes and subscriptions". An event is an immutable outbox row written in the SAME
 * transaction as the change it announces (ES-19-001), carrying stable references and the minimum transition data
 * a consumer needs (ES-19-002) — never an object body:
 *
 *   identities     the entity identities the change touched (id + role: origin/successor/resolved_to/subject/object,
 *                  created/retired for an import's admission and revocation, reached for the walk's …)
 *   relationships  the edges (with their world and record intervals), resolutions and dependencies changed or reached
 *   objects        what the dependency walk reached from the change (assumptions, forecasts, twins, runs, decisions …),
 *                  so a consumer selects rather than re-walks
 *   temporal       the record instant of the change (known_at) and, per relationship, valid_from/valid_to
 *   subscriptions  which subscriptions were live for this change at publication — EVIDENCE for the record, never
 *                  authority: the dispatcher re-resolves at delivery
 *   cause          the governed action, its actor and its target
 */
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

export const GRAPH_CHANGE_KINDS = [
  'entity.created', 'entity.resolved', 'entity.split', 'edge.asserted', 'edge.retracted', 'strategy.declared', 'invalidation.assessed',
  // 0065: a recomputation replaced an issued forecast (the superseded forecast is in objects.forecasts; the cause names the new one).
  'forecast.superseded',
  // 0065 §7: a model change (an extraction method suspended or retired) opened a reassessment on the edges its claims assert.
  'edge.reassessment_opened',
  // 0066 §3: a memory item recorded / superseded (the item is in objects.memoryItems; what it cites are its dependencies).
  'memory_item.recorded', 'memory_item.superseded',
  // 0077 (B17): a partner's package ADMITTED into this domain — the created identities, the imported edges as recorded, the admitted
  // claims and records; no walk (nothing of the domain rests on the new ids yet) — one event per admission, from the graph write.
  'import.admitted',
  // 0077 (B17): the origin's revocation EXECUTED here — the entities retired, the edges retracted, the versions withdrawn; the walk
  // from every withdrawn record (and every withdrawn claim no record's lineage reaches) to what the domain built on the copies.
  'import.revoked',
  // 0078 (B18): a twin version ADMITTED — objects.twins the twin, objects.simulations the SUPERSEDED version's runs; no walk (the
  // walker cannot seed a twin); the twins consumer leaves a twin's own admission alone — the new version is verified by admission.
  'twin.state_changed',
  // 0078 (B18): an issued forecast WITHDRAWN as unfit — objects.forecasts the forecast; the scenario, decision and twin consumers
  // select by it as they do for a supersession; the dependants the port enumerated ride the typed `forecast` block.
  'forecast.withdrawn',
  // 0078 (B18): a completed run's RESULT INVALIDATED (the operator's act, or a reproduction's unreproducible verdict) —
  // objects.simulations the run; the decisions consumer notes the packages citing it as a categorical loss of the input.
  'simulation.invalidated',
  // 0080 (B20): a withdrawn partition rebuilt (or restored unchanged) by the operator — no identities, no relationships, no walk: the typed block names the projection and the rows whose state the rebuild changed; the retrieval consumer re-verifies, the six others find nothing by construction.
  'projection.rebuilt',
  // 0081 (B21): a forecast ASSESSED UNFIT by prediction.assess_forecast_fitness (a transition to unfit, or a class change while unfit) —
  // objects.forecasts the forecast, no identities; the scenario, decision and twin consumers select by it (the scenario marked and
  // re-checked, the package noted with material_change — assessed unfit, NOT withdrawn: the owner decides —, the citing version
  // unverified); the FORECAST consumer leaves its own kind alone (a fitness change is not a basis change). A fit or indeterminate
  // verdict marks nothing and rides ForecastFitnessChanged only; the measures ride the typed `forecast_fitness` block.
  'forecast.fitness_changed',
] as const;
export type GraphChangeKind = (typeof GRAPH_CHANGE_KINDS)[number];
export const MEMORY_CHANGE_KINDS = ['evidence.corrected', 'claim.corrected'] as const;
export type MemoryChangeKind = (typeof MEMORY_CHANGE_KINDS)[number];

export interface AffectedIdentity { entity_id: string; role: string; canonical_name?: string | null; lifecycle_state?: string | null; split_from?: string | null }
export interface AffectedEdge { edge_id: string; state: string; predicate?: string; subject_entity_id?: string; object_entity_id?: string; valid_from?: string | null; valid_to?: string | null; asserted_at?: string | null; superseded_at?: string | null; retracted_at?: string | null; claim_object_id?: string | null }
export interface AffectedResolution { resolution_id: string; state: string; claim_object_id: string; claim_version: number; entity_id: string; superseded_by?: string | null }
export interface AffectedDependency { dependency_id?: string; dependent_object_id: string; dependent_type: string; depends_on_kind: string; depends_on_id: string }
export interface ReachedObjects {
  claims: string[]; assumptions: string[]; objectives: string[]; decisions: string[]; commitments: string[];
  forecasts: string[]; scenarios: string[]; warnings: string[]; twins: string[]; simulations: string[]; evidence: string[];
  /** 0065 §8: the briefings the walk reached (composed on what changed). Absent on events written before 0065. */
  briefings?: string[];
  /** 0066 §3: the memory items the walk reached (resting on what changed). Absent on events written before 0066. */
  memoryItems?: string[];
  /** The walker stopped at its bound before the graph was exhausted: the selection above is incomplete and says so. */
  truncated: boolean;
  /** False only where the write legitimately skipped the walk (see change-events.ts): consumers then select by their own reads. */
  walked: boolean;
}
export interface ChangeCause { action: string; actor: string; target_type: string; target_id: string | null }
export interface SubscriptionRef { subscription_id: string; consumer_kind: string }

export interface GraphChangedPayload {
  schema: 'GraphChanged'; schema_version: 'v1';
  change: { kind: GraphChangeKind; occurred_at: string; graph_event_id?: string | null; invalidation_id?: string | null; correction_case_id?: string | null };
  identities: AffectedIdentity[];
  relationships: { edges: AffectedEdge[]; resolutions: AffectedResolution[]; dependencies: AffectedDependency[] };
  objects: ReachedObjects;
  temporal: { known_at: string; valid_from?: string | null; valid_to?: string | null };
  subscriptions: SubscriptionRef[];
  cause: ChangeCause;
  /**
   * 0077 (B17): the import an `import.admitted` / `import.revoked` event is about — the ledger row's identity, the partner whose key
   * signed the package, the origin (the tenant, domain and action the package came from, and its digest) and the import's counts as
   * the ledger holds them; on a revocation the NOTICE the destruction answered (its id when the origin recorded one, the source it was
   * presented from, the origin's revocation instant and reason). Absent on every other kind.
   */
  import?: { import_id: string; partner_key: string; origin: { tenant_id: string; domain_id: string; action_id: string; package_digest: string }; counts: Record<string, unknown>;
             notice?: { notice_id: string | null; source: 'origin' | 'station'; revoked_at: string | null; reason: string | null } };
  /**
   * 0078 (B18): the typed block of each lifecycle kind — the minimum transition data a consumer reads WITHOUT re-reading the
   * object (the decisions consumer's note is built from it). `twin` on `twin.state_changed`: the version admitted, what it
   * supersedes, the branch, how many variables changed and how many runs of the superseded version were named in
   * objects.simulations (before the cut). `forecast` on `forecast.withdrawn`: the reason and unfit class, the instant, and the
   * dependants the port enumerated (scenarios, warnings, twins, simulations, packages; each ≤ 200 with `truncated`).
   * `simulation` on `simulation.invalidated`: the reason, who triggered it (a person, or a reproduction — `trigger_ref` names
   * the reproduction), the instant and the port's dependants (packages, commitments, decisions, twins, simulations). Absent on
   * every other kind; never a second `cause`.
   */
  twin?: { twin_id: string; version: number; supersedes: number | null; branch_id: string; change: 'version.admitted'; changed_variables: number; runs_of_superseded: number };
  forecast?: { forecast_id: string; series_key: string; horizon: string; reason: string; unfit_class: string; withdrawn_at: string; dependants: Record<string, unknown> };
  /** 0081 (B21): `trigger` gains `challenge` — an upheld challenge invalidated the run (`trigger_ref` names the challenge; the cause is simulation.challenge.decide). */
  simulation?: { run_id: string; reason: string; trigger: 'operator' | 'reproduction' | 'challenge'; trigger_ref: string | null; invalidated_at: string; dependants: Record<string, unknown> };
  /**
   * 0081 (B21; D7): the typed block of `forecast.fitness_changed` — the forecast assessed UNFIT under the versioned rule
   * (prediction.forecast_fitness_rule): its family, the class the state carries (the first of `classes` in the rule's order),
   * what stood before, the assessment row, the rule version, who triggered it (the outcome write, the forecast subscriber or a
   * person) and the MEASURES the verdict rests on (the family's window, the coverage against the floor, the pinball against the
   * applicable backtest, the refresh expiry) — so the decisions consumer's note and the scenario consumer's reason are built
   * WITHOUT re-reading the forecast. Absent on every other kind; never a second `cause`.
   */
  forecast_fitness?: { forecast_id: string; series_key: string; horizon: string; method: string; state: 'unfit'; class: string | null; prior_state: string; prior_class: string | null;
                       assessment_id: string; rule_version: string; trigger: 'outcome' | 'subscription' | 'operator';
                       measures: { outcomes: number; required: number; coverage: Record<string, unknown> | null; pinball: Record<string, unknown> | null; expiry: Record<string, unknown> | null } };
  /**
   * 0080 (B20; D8): the typed block of `projection.rebuilt` — a withdrawn partition of the domain's index tier REBUILT (rows
   * written) or RESTORED (nothing to write) by the operator under graph.projection.rebuild: the projection, the outcome, the
   * rebuild's id, the counts, the rows whose state the rebuild changed (`restored`, cut at LIFECYCLE_EVENT_LIST_MAX with
   * `restored_truncated`), the re-check's counts, the representation version recorded, and the withdrawal it closed. The
   * changed rows ride HERE and never as identities or relationships: a rebuild changes no fact of the world, so a consumer
   * that selects by identities or dependencies (a twin's boundary, a forecast's subject) is fed nothing. Absent on every other kind.
   */
  projection?: { projection: string; outcome: 'rebuilt' | 'restored'; rebuild_id: string; updated: number; inserted: number; removed: number;
                 restored: Array<{ id: string; change: string; to?: string; from?: string }>; restored_truncated: boolean; check: Record<string, unknown> | null;
                 representation_version: string; withdrawn_since: string | null; withdrawn_reason: string | null; withdrawn_by_check: string | null };
}

export interface CorrectedObject { object_id: string; object_type: string; from_version: number; to_version: number; lifecycle_state: string; recorded_at?: string | null; event_time?: string | null; observation_time?: string | null; valid_from?: string | null; valid_to?: string | null }
export interface MemoryCorrectedPayload {
  schema: 'MemoryCorrected'; schema_version: 'v1';
  change: { kind: MemoryChangeKind; occurred_at: string; correction_case_id?: string | null; review_case_id?: string | null };
  objects: CorrectedObject[];
  /** The claims derived from the corrected evidence (the walk's own seed), when known at the write. */
  claims: string[];
  temporal: { known_at: string };
  subscriptions: SubscriptionRef[];
  cause: ChangeCause;
}
export type ChangeEvent = { event_id: string; event_type: 'GraphChanged'; payload: GraphChangedPayload } | { event_id: string; event_type: 'MemoryCorrected'; payload: MemoryCorrectedPayload };

export const EMPTY_REACH: ReachedObjects = Object.freeze({ claims: [], assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], evidence: [], briefings: [], memoryItems: [], truncated: false, walked: true }) as ReachedObjects;

/** The consumer kinds AU-MEM-0030 names, each with the action it holds (PDP rule + port assertion) and its identity. */
export const CONSUMER_KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships'] as const;
export type ConsumerKind = (typeof CONSUMER_KINDS)[number];
export const CONSUMER_ACTION: Readonly<Record<ConsumerKind, string>> = Object.freeze({
  twins: 'twin.subscription.apply',
  forecasts: 'prediction.forecast.subscription.apply',
  scenarios: 'prediction.scenario.subscription.apply',
  decisions: 'decision.subscription.apply',
  retrieval: 'graph.retrieval.subscription.apply',
  'memory-mappings': 'graph.mapping.subscription.apply',
  relationships: 'graph.relationship.subscription.apply',
});
export const CONSUMER_ROLE: Readonly<Record<ConsumerKind, string>> = Object.freeze({
  twins: 'twin_subscriber', forecasts: 'forecast_subscriber', scenarios: 'scenario_subscriber', decisions: 'decision_subscriber', retrieval: 'retrieval_subscriber', 'memory-mappings': 'mapping_subscriber',
  relationships: 'relationship_subscriber',
});
/** The consumer's identity, the walker precedent: a changed method is a new consumer, registered anew. */
export const CONSUMER_VERSION = '1.0.0';
const METHOD_REF: Readonly<Record<ConsumerKind, string>> = Object.freeze({
  // 0078 (B18): the mark is announced (TwinStateChanged/version.unverified in the item's transaction) and a twin's own admission marks nothing — a new method, so a new identity (the B8 precedent: the live twins subscriptions are re-registered).
  twins: 'citing or boundary-bound admitted versions → twin.apply_subscription_mark (once per cause), the mark announced as TwinStateChanged/version.unverified in the item\'s transaction (0078); a twin\'s own admission (twin.state_changed) marks nothing',
  // 0081 (B21): the marked forecast is ASSESSED in the item's transaction and the kind forecast.fitness_changed selects nothing here — a new method, so a new identity (the live forecasts subscriptions are re-registered; the act revokes and registers anew).
  forecasts: 'subject, assumption or evidence affected → prediction.mark_forecast_attention (once); the marked forecast then ASSESSED (0081, B21: prediction.assess_forecast_fitness, trigger subscription — ForecastFitnessChanged on a changed verdict, GraphChanged/forecast.fitness_changed on a transition to unfit); forecast.fitness_changed is its own kind and selects nothing',
  // 0081 (B21): forecast.fitness_changed marks with the assessment's reason and every marked scenario is RE-CHECKED in the item's transaction — a new method, so a new identity (the live scenarios subscriptions are re-registered).
  scenarios: 'subject or forecast affected → prediction.mark_scenario_attention (once); forecast.fitness_changed (0081, B21) marks with the assessment\'s reason; the marked scenario then RE-CHECKED (prediction.check_scenario_coherence, trigger subscription — ScenarioCoherenceFailed on a failed and changed check)',
  // 0078 (B18): the two chain kinds are exposed as a categorical loss and a twin's admission is noted without exposure — a new method, so a new identity (the live decisions subscriptions are re-registered).
  // 0081 (B21): forecast.fitness_changed is exposed as material_change (assessed unfit, not withdrawn) — a new method again, so a new identity (the live decisions subscriptions are re-registered).
  decisions: 'DEC or cited input affected → decision.note_input_invalidated (once per cause); forecast.superseded judged for materiality against the declared rule → material_change exposed; forecast.withdrawn / simulation.invalidated (0078) → material_change exposed as a categorical loss of the cited input; forecast.fitness_changed (0081, B21) → material_change exposed (assessed unfit, not withdrawn — the owner decides); twin.state_changed (0078) → noted without exposure (the cited runs of the superseded version stand; the owner judges)',
  // 0080 (B20): the check is SYMMETRIC (a poisoned or a missing row fails it), covers the memory projection and the representation version, and WITHDRAWS every partition it fails — a new method, so a new identity (the live retrieval subscriptions are re-registered; the act revokes and registers anew in both domains).
  retrieval: 'graph.rebuild_projections verified — symmetric (mismatched + missing + unexpected) with the memory projection as the sixth row and the representation version (0080) → graph.record_retrieval_check, which WITHDRAWS every partition that failed; a GraphChanged/projection.rebuilt is re-verified like any change',
  // 0077 (B17): the import.revoked branch is a new method, so a new identity — every live memory-mappings subscription registered before it is re-registered (the B8 precedent).
  'memory-mappings': 'identifier/edge/resolution basis moved → graph.propose_mapping_reconciliation (a person decides); an edge whose provenance path cannot be established stays unresolved (provenance_incomplete); an import revoked (0077) → the identifiers of the entities it retired and the asserted edges with a retired end proposed',
  relationships: 'claim.corrected → the pending edge reassessed (graph.open_edge_reassessment), the relationship re-derived for the corrected version under the builder\'s rules and asserted (graph.assert_edge supersedes the pending edge; GraphChanged/edge.asserted published); a claim the builder cannot re-derive stays unresolved (unresolved_dependency) with the builder\'s reason',
});
export const consumerCodeDigest = (kind: ConsumerKind): string =>
  createHash('sha256').update(`graph.subscription.${kind}@${CONSUMER_VERSION}:${METHOD_REF[kind]}`, 'utf8').digest('hex');

/**
 * The delivery ledger's per-item checkpoint, INSIDE the consumer effect's own transaction: begin locks the delivery row
 * until the effect commits and answers false for an item already applied (a typed skip, never a second effect); done
 * binds the item to the effect it produced. The ports assert the KIND's action, so a capability of another kind cannot
 * drive them. Composed with each module's own capability by the dispatcher.
 */
export class SubscriptionLedger {
  constructor(private readonly tx: Tx, readonly action: string) {}
  async setItems(a: { eventId: string; subscriptionId: string; tenantId: string; domainId: string; items: string[] }): Promise<string[]> {
    const r = await sql<{ items: string[] }>`select graph.subscription_delivery_items(${a.eventId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.items)}::jsonb, ${this.action}) as items`.execute(this.tx);
    return r.rows[0]?.items ?? a.items;
  }
  async itemBegin(a: { eventId: string; subscriptionId: string; tenantId: string; domainId: string; item: string }): Promise<boolean> {
    const r = await sql<{ ok: boolean }>`select graph.subscription_item_begin(${a.eventId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.item}, ${this.action}) as ok`.execute(this.tx);
    return r.rows[0]?.ok === true;
  }
  async itemDone(a: { eventId: string; subscriptionId: string; tenantId: string; domainId: string; item: string; effect: string; effectRef: string | null; details?: Record<string, unknown> }): Promise<void> {
    await sql`select graph.subscription_item_done(${a.eventId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.item}, ${this.action}, ${a.effect}, ${a.effectRef}::uuid, ${JSON.stringify(a.details ?? {})}::jsonb)`.execute(this.tx);
  }
  /**
   * The effect found OPERATOR WORK (0064): what it recorded is committed with this call — a check is evidence — but the
   * item is NOT applied; it stays open, re-checked at every re-drive until a check passes. Returns how many checks so far.
   */
  async itemUnresolved(a: { eventId: string; subscriptionId: string; tenantId: string; domainId: string; item: string; effect: string; effectRef: string | null; reason: string; details?: Record<string, unknown> }): Promise<number> {
    const r = await sql<{ n: number }>`select graph.subscription_item_unresolved(${a.eventId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.item}, ${this.action}, ${a.effect}, ${a.effectRef}::uuid, ${a.reason}, ${JSON.stringify(a.details ?? {})}::jsonb) as n`.execute(this.tx);
    return Number(r.rows[0]?.n ?? 1);
  }
}

/** AU-MEM-0039: the class of a delivery's failure state and the route it is sent down. */
export type FailureClass = 'authority_disputed' | 'consumer_unavailable' | 'provenance_incomplete' | 'executed_action' | 'legal_hold' | 'material_change' | 'unresolved_dependency' | 'budget' | 'infrastructure';
export type Disposition = 'retry' | 'compensation' | 'challenge' | 'human_review';

/** What a registered consumer supplies to the dispatcher: how to read its world, what an event means for it, and one effect per item. */
export interface SubscriptionConsumer<C> {
  kind: ConsumerKind;
  /** The AUD target type of the consumer's writes and the purpose its envelope carries. */
  objectType: string;
  purpose: string;
  capability: (tx: Tx, action: string) => C;
  /** The items this event affects for this consumer, resolved under the consumer's own capability (its reads, under RLS). Each item is a stable string key. */
  resolveItems(cap: C, scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]>;
  /**
   * One bounded, idempotent effect for one item; returns what it did and the effect's reference for the ledger. `policy` is
   * the subscription's declared budgets (0065: a consumer's own rule — a materiality threshold — is read from there).
   */
  applyItem(cap: C, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string, subscriptionId: string, policy?: Record<string, unknown>):
    Promise<{ effect: string; effectRef: string | null; details?: Record<string, unknown>;
              /**
               * What the effect found is OPERATOR WORK (a projection mismatch, an unestablishable provenance path): the effect's
               * record is committed, the item is left UNRESOLVED (never checkpointed as applied) and re-checked at every re-drive;
               * the delivery ends `unresolved` with this reason (0064, Codex finding 3) — classified as the consumer says (0065:
               * provenance_incomplete → human_review) or, for a plain reason, unresolved_dependency → human_review.
               */
              unresolved?: string | { reason: string; failureClass: FailureClass; disposition: Disposition };
              /** The effect exposes a condition a person must route (an input invalidated on a committed decision): recorded on the item, the delivery still applied. */
              exposure?: { failureClass: FailureClass; disposition: Disposition; note: string };
              /** Events the effect's committed transition announces (0066 §2: a re-derived edge publishes GraphChanged/edge.asserted) — enqueued by the pipeline in the item's own transaction. */
              outboxEvents?: Array<{ eventType: string; payload: Record<string, unknown> }> }>;
}
