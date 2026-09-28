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
  /* B23 (0084) revision */
  // 0084 (B23, L4-I02): a CHANGE SET committed as one graph revision (graph.commit_revision) — the nodes it created (`created`), the
  // existing ends its edges touch (`subject` / `object`), the edges it asserted and the ones it superseded, the claims and evidence they
  // rest on; built PURE from the port's answer (the importAdmittedEvent precedent: many facts in ONE event, walked: false — nothing of
  // the domain rests on ids minted in this write); the typed `revision` block carries the revision, the expected head and the counts.
  'revision.committed',
  /* end B23 revision */
  /* B34 (0090) commitments */
  // 0090 (B34, V02-T-117): an OBJECTIVE CHANGED — revised (graph.revise_objective: the OBJ's next version) or its owner transferred
  // (graph.assign_strategy_owner on an OBJ); objects.objectives the objective, no walk; the typed `objective` block. Only the
  // commitments consumer selects it: every other consumer's selection yields nothing for it (the warnings consumer's graph-impact
  // kinds are a fixed list without it; the decisions consumer matches a package's DEC and its options' citations, never an OBJ; the
  // twins, forecasts, scenarios, relationships and memory-mappings consumers select by identities, edges, claims, evidence and forecasts,
  // all empty here; the retrieval consumer re-verifies the projections as for any change) — NO existing METHOD_REF changes.
  'objective.changed',
  /* end B34 commitments */
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
  /* B32 (0089) graph */
  /**
   * 0089 §G: the six new strategy types the walk reached (through the alignments' mirrors and their own rests_on) — present only when
   * the walk reached one (absent otherwise, so every earlier payload shape is unchanged). No consumer selects by them: every
   * consumer's selection method is unchanged and no METHOD_REF moves.
   */
  capabilities?: string[]; initiatives?: string[]; resources?: string[]; measures?: string[]; stakeholders?: string[]; exposures?: string[];
  /* end B32 graph */
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
  /* B23 (0084) revision */
  /**
   * 0084 (B23; L4-I02): the typed block of `revision.committed` — the graph revision a change set became (graph.revisions): its id,
   * the resulting revision and the head it was made against (always revision − 1), the idempotency key and the request digest the
   * ledger keeps, the ontology version it named (null while the domain has none) and the port's counts (nodes, identifiers,
   * identifiers_already, edges, superseded). Absent on every other kind; never a second `cause`.
   */
  revision?: { revision_id: string; revision: number; expected: number; idempotency_key: string; request_digest: string; ontology_version_id: string | null; counts: Record<string, number> };
  /* end B23 revision */
  /* B34 (0090) commitments */
  /** 0090 (B34): the typed block of `objective.changed` — the objective, what changed (a revision or an owner transfer), its versions and owners, the reason. Absent on every other kind. */
  objective?: { objective_id: string; change: 'revised' | 'owner_assigned'; from_version: number; to_version: number; owner_from: string | null; owner_to: string | null; reason: string | null };
  /* end B34 commitments */
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
/**
 * 0083 (B22): the SUBSCRIBABLE event types (graph.subscribable_event_types): the two graph contracts, and the eight flat events a
 * B22 consumer selects — their payloads are the producers' own (no `change`, no `cause`), each consumer reads and validates its type
 * and QUARANTINES a payload that is not the contract (failure class invalid_event → human_review).
 */
export const FLAT_EVENT_TYPES = ['ObservationRecorded', 'SourceHealthChanged', 'ClaimsExtracted', 'IntelligenceObjectAdmitted', 'ForecastFitnessChanged', 'ScenarioCoherenceFailed',
  'EarlyWarningRaised', 'AttentionPolicyChanged',
  /* B23 (0084) attention */ 'MaterialChangeRaised', 'ReviewConvened' /* end B23 attention */,
  /* B34 (0090) attention: the prelude's three outbox events (their contracts: executive/attention/signal-contracts.ts) */ 'ExposureChanged', 'HealthScoreChanged', 'CommitmentChanged' /* end B34 attention */] as const;
export type FlatEventType = (typeof FLAT_EVENT_TYPES)[number];
export const SUBSCRIBABLE_EVENT_TYPES = ['GraphChanged', 'MemoryCorrected', ...FLAT_EVENT_TYPES] as const;
export type SubscribableEventType = (typeof SUBSCRIBABLE_EVENT_TYPES)[number];
export type FlatEvent = { event_id: string; event_type: FlatEventType; payload: Record<string, unknown> };
/** What the dispatcher hands a consumer: a graph change (the seven graph consumers) or a flat event (the four B22 consumers). */
export type SubscribedEvent = ChangeEvent | FlatEvent;

export const EMPTY_REACH: ReachedObjects = Object.freeze({ claims: [], assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], evidence: [], briefings: [], memoryItems: [], truncated: false, walked: true }) as ReachedObjects;

/** The consumer kinds AU-MEM-0030 names, each with the action it holds (PDP rule + port assertion) and its identity. */
export const CONSUMER_KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships',
  // 0083 (B22): the consumers of L1-I03, L1-I04 and L2-I02, and the attention router (L10-I05 and the foresight signals).
  'observations', 'source-health', 'proposals', 'attention',
  /* B28 (0088) warnings: the warnings consumer (graph impact, forecast revision, twin degradation → warning candidates) */ 'warnings' /* end B28 warnings */,
  /* B28 (0088) streams: the event-time stream processors' feed (F-P4-11) */ 'stream-rules' /* end B28 streams */,
  /* B34 (0090) commitments: the commitment tracker's re-tasking (V02-T-117) */ 'commitments' /* end B34 commitments */] as const;
export type ConsumerKind = (typeof CONSUMER_KINDS)[number];
export const CONSUMER_ACTION: Readonly<Record<ConsumerKind, string>> = Object.freeze({
  twins: 'twin.subscription.apply',
  forecasts: 'prediction.forecast.subscription.apply',
  scenarios: 'prediction.scenario.subscription.apply',
  decisions: 'decision.subscription.apply',
  retrieval: 'graph.retrieval.subscription.apply',
  'memory-mappings': 'graph.mapping.subscription.apply',
  relationships: 'graph.relationship.subscription.apply',
  observations: 'intelligence.observation.subscription.apply',
  'source-health': 'observation.source_health.subscription.apply',
  proposals: 'intelligence.proposal.subscription.apply',
  attention: 'executive.attention.subscription.apply',
  /* B28 (0088) warnings */ warnings: 'prediction.warning.subscription.apply', /* end B28 warnings */
  /* B28 (0088) streams */ 'stream-rules': 'prediction.stream.subscription.apply', /* end B28 streams */
  /* B34 (0090) commitments */ commitments: 'decision.commitment.subscription.apply', /* end B34 commitments */
});
export const CONSUMER_ROLE: Readonly<Record<ConsumerKind, string>> = Object.freeze({
  twins: 'twin_subscriber', forecasts: 'forecast_subscriber', scenarios: 'scenario_subscriber', decisions: 'decision_subscriber', retrieval: 'retrieval_subscriber', 'memory-mappings': 'mapping_subscriber',
  relationships: 'relationship_subscriber',
  observations: 'observation_subscriber', 'source-health': 'source_health_subscriber', proposals: 'proposal_subscriber', attention: 'attention_subscriber',
  /* B28 (0088) warnings */ warnings: 'warning_subscriber', /* end B28 warnings */
  /* B28 (0088) streams */ 'stream-rules': 'stream_rule_subscriber', /* end B28 streams */
  /* B34 (0090) commitments */ commitments: 'commitment_subscriber', /* end B34 commitments */
});
/** 0083: the event types each kind may select (graph.subscription_consumer_events) — the default of a registration that names none. */
export const CONSUMER_EVENT_TYPES: Readonly<Record<ConsumerKind, readonly SubscribableEventType[]>> = Object.freeze({
  twins: ['GraphChanged', 'MemoryCorrected'], forecasts: ['GraphChanged', 'MemoryCorrected'], scenarios: ['GraphChanged', 'MemoryCorrected'],
  decisions: ['GraphChanged', 'MemoryCorrected'], retrieval: ['GraphChanged', 'MemoryCorrected'], 'memory-mappings': ['GraphChanged', 'MemoryCorrected'],
  relationships: ['GraphChanged', 'MemoryCorrected'],
  observations: ['ObservationRecorded'], 'source-health': ['SourceHealthChanged'], proposals: ['ClaimsExtracted', 'IntelligenceObjectAdmitted'],
  attention: ['ForecastFitnessChanged', 'ScenarioCoherenceFailed', 'EarlyWarningRaised', 'AttentionPolicyChanged',
    /* B23 (0084) attention: L10-I02 and L10-I03 */ 'MaterialChangeRaised', 'ReviewConvened' /* end B23 attention */,
    /* B34 (0090) attention */ 'ExposureChanged', 'HealthScoreChanged', 'CommitmentChanged' /* end B34 attention */],
  /* B28 (0088) warnings */ warnings: ['GraphChanged'], /* end B28 warnings */
  /* B28 (0088) streams */ 'stream-rules': ['ObservationRecorded'], /* end B28 streams */
  /* B34 (0090) commitments */ commitments: ['GraphChanged'], /* end B34 commitments */
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
  decisions: 'DEC or cited input affected → decision.note_input_invalidated (once per cause); forecast.superseded judged for materiality against the declared rule → material_change exposed; forecast.withdrawn / simulation.invalidated (0078) → material_change exposed as a categorical loss of the cited input; forecast.fitness_changed (0081, B21) → material_change exposed (assessed unfit, not withdrawn — the owner decides); twin.state_changed (0078) → noted without exposure (the cited runs of the superseded version stand; the owner judges)'
    /* B23 (0084) attention: a material_change exposure on a NEW note publishes MaterialChangeRaised@v1 in the item's transaction — a new method, so a new
       identity: every live decisions subscription registered before 0084 is re-registered (the B8 precedent; the act revokes and registers anew). */
    + '; a material_change exposure on a new note → MaterialChangeRaised@v1 in the item\'s transaction (0084: consequence, confidence, hours to the decision deadline, the active attention-policy version)' /* end B23 attention */,
  // 0080 (B20): the check is SYMMETRIC (a poisoned or a missing row fails it), covers the memory projection and the representation version, and WITHDRAWS every partition it fails — a new method, so a new identity (the live retrieval subscriptions are re-registered; the act revokes and registers anew in both domains).
  retrieval: 'graph.rebuild_projections verified — symmetric (mismatched + missing + unexpected) with the memory projection as the sixth row and the representation version (0080) → graph.record_retrieval_check, which WITHDRAWS every partition that failed; a GraphChanged/projection.rebuilt is re-verified like any change',
  // 0077 (B17): the import.revoked branch is a new method, so a new identity — every live memory-mappings subscription registered before it is re-registered (the B8 precedent).
  'memory-mappings': 'identifier/edge/resolution basis moved → graph.propose_mapping_reconciliation (a person decides); an edge whose provenance path cannot be established stays unresolved (provenance_incomplete); an import revoked (0077) → the identifiers of the entities it retired and the asserted edges with a retired end proposed',
  relationships: 'claim.corrected → the pending edge reassessed (graph.open_edge_reassessment), the relationship re-derived for the corrected version under the builder\'s rules and asserted (graph.assert_edge supersedes the pending edge; GraphChanged/edge.asserted published); a claim the builder cannot re-derive stays unresolved (unresolved_dependency) with the builder\'s reason',
  // 0083 (B22): the four new consumers — each its own identity from the start.
  observations: 'ObservationRecorded → intelligence.select_transformation_plan (the active extraction methods that read the evidence\'s source, or no_plan with the reason; once per event and evidence); the run stays an extraction agent\'s act; a payload that is not the contract is quarantined (invalid_event)'
    /* B24 (0086) plan: the selection now QUEUES one pending plan execution per selected method and evidence version in the item's transaction (UNIQUE — a
       redelivery, a replay or a second producer's event queues nothing more), named in the delivery's details — a new method, so a new identity: every
       live observations subscription registered before 0086 is re-registered (the B8 precedent; the act revokes and registers anew). */
    + '; each selected method queued as ONE pending plan execution per evidence version (0086: intelligence.plan_executions, UNIQUE), named in the details — run by the domain\'s extraction agent under its own session, never by this subscriber' /* end B24 plan */,
  'source-health': 'SourceHealthChanged (the coverage evaluation\'s new_state or the lifecycle transition\'s state) → observation.mark_source_impact (markers on the issued forecasts of the source\'s series, the open warnings on them, the packages citing them; cleared on healthy | active) and, when degraded, executive.route_attention_item source.coverage_loss under the attention policy; a payload that is not the contract is quarantined'
    /* B24 (0086) materiality: the coverage loss carries the further dimensions (exposure = the active impact markers) — a new method, so a
       new identity: every live source-health subscription registered before 0086 is re-registered (the B8 precedent; the act revokes and
       registers anew). */
    + '; the coverage loss carries the further dimensions (0086: exposure from the active impact markers, the rest declared null) from executive.attention_dimensions' /* end B24 materiality */,
  proposals: 'ClaimsExtracted / IntelligenceObjectAdmitted → each proposed claim held for review (a queued review case) routed as proposal.review under the attention policy; a claim with no review recorded no_review_required; nothing promoted; a payload that is not the contract is quarantined'
    /* B24 (0086) materiality: the held claim's further dimensions declared null (no input exists) — a new method, so a new identity (the
       live proposals subscriptions are re-registered). */
    + '; the further dimensions declared null (0086: no input exists for proposal.review)' /* end B24 materiality */,
  attention: 'ForecastFitnessChanged (to unfit) → forecast.unfit; ScenarioCoherenceFailed → scenario.incoherent; EarlyWarningRaised → warning.raised — each routed under the domain\'s active attention policy (executive.route_attention_item, transparent dimensions); AttentionPolicyChanged → every live item re-evaluated (executive.reevaluate_attention_item) and the policy cause noted on every committed or monitored package (decision.note_policy_changed); overdue items escalated at every delivery (executive.escalate_attention_due); a payload that is not the contract is quarantined'
    /* B23 (0084) attention: two more types, so a new method and a new identity — every live attention subscription registered before 0084 is
       re-registered (it would not select the two types anyway: a registration names its event types). */
    + '; MaterialChangeRaised (0084) → decision.material_change to the package owner; ReviewConvened (0084) → review.convened to the chair; a package withdrawn or closed, a review concluded or withdrawn since → signal.no_longer_stands' /* end B23 attention */
    /* B24 (0086) materiality: every routed signal carries the further dimensions read by executive.attention_dimensions and the windows of a
       warning and a review are measured on the database clock — a new method, so a new identity: every live attention subscription
       registered before 0086 is re-registered (the B8 precedent; the act revokes and registers anew). */
    + '; each routed signal carries the further dimensions (0086: probability, exposure, strategic relevance, information value, irreversibility — the real inputs from executive.attention_dimensions, null where none) and the warning and review windows on the database clock' /* end B24 materiality */
    /* B28 (0088) integrator: the routed warning's dimensions carry NOVELTY (the weak-signal detectors' measure, 0088 §S8) where the input
       exists — a new method, so a new identity: every live attention subscription registered before 0088 is re-registered (demo: the act) */
    + '; the novelty dimension forwarded where the detector measured it (0088: the originating signal\'s measure or the indicator\'s latest novelty reading)' /* end B28 integrator */
    /* B34 (0090) attention: three more types, so a new method and a new identity — every live attention subscription registered before 0090 is
       revoked and re-registered (demo: the integrator's act). */
    + '; ExposureChanged (0090) → opportunity.raised for an opportunity with an accepted assessment (a risk not a signal here); HealthScoreChanged (0090) → health.change (review, never action); CommitmentChanged (0090) → commitment.due | commitment.breach, the item read only through decision.commitment_item_signal (NULL → not routed)' /* end B34 attention */,
  /* B28 (0088) warnings: a NEW consumer — its own identity from the start (no existing subscription is re-registered). */
  warnings: 'GraphChanged → the ORIGINS of a warning other than an indicator breach — an invalidation, retracted edge, revoked import or split entity whose walk reached an objective (graph_impact, one item per objective), a forecast superseded, withdrawn or assessed unfit (forecast_revision, one per forecast), a twin version admitted or a twin the walk reached (twin_degradation, one per twin) — each SUBMITTED as a warning candidate (prediction.submit_warning_candidate, origin_key = the event id and the item; C2, confidence not stated); never a warning: the lifecycle clusters or raises it',
  /* end B28 warnings */
  /* B28 (0088) streams: the stream-rules consumer — its own identity from the start (a new kind; no live subscription to re-register). */
  'stream-rules': 'ObservationRecorded of a live processor\'s source → the evidence version read through the governed retrieval (custody by prediction.stream_evidence_custody in the item\'s transaction), parsed by the series\' registered parser into (day, value) points — the event time the publisher\'s day — and ingested (prediction.ingest_stream_input: the state verified, each point keyed evd@version:day and labelled on_time | late_within_allowance | late_beyond_allowance and new | duplicate | revision, the watermark = max event time − lag, the due windows fired, a late input\'s window revised, a holding predicate\'s warning candidate submitted through prediction.submit_warning_candidate); unreadable evidence recorded, never guessed at; a payload that is not the contract quarantined (invalid_event)',
  /* end B28 streams */
  /* B34 (0090) commitments: a NEW consumer — its own identity from the start (a new kind; no live subscription to re-register). */
  commitments: 'GraphChanged/objective.changed → every live commitment item resting on the objective (decision.items_resting_on) re-tasked by decision.apply_objective_change: an objective_changed exception keyed by the event (once), the item retask_required, the reviewer reassigned to the objective\'s owner when its basis is objective_owner and the owner moved; CommitmentChanged item.retasked / reviewer.reassigned in the item\'s transaction; every other kind selects nothing',
  /* end B34 commitments */
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
export type FailureClass = 'authority_disputed' | 'consumer_unavailable' | 'provenance_incomplete' | 'executed_action' | 'legal_hold' | 'material_change' | 'unresolved_dependency' | 'budget' | 'infrastructure'
  // 0083 (B22): the interface contracts' "quarantine invalid event" — a payload that is not the contract, never applied
  | 'invalid_event';
export type Disposition = 'retry' | 'compensation' | 'challenge' | 'human_review';

/** What a registered consumer supplies to the dispatcher: how to read its world, what an event means for it, and one effect per item. */
export interface SubscriptionConsumer<C, E extends SubscribedEvent = ChangeEvent> {
  kind: ConsumerKind;
  /** The AUD target type of the consumer's writes and the purpose its envelope carries. */
  objectType: string;
  purpose: string;
  capability: (tx: Tx, action: string) => C;
  /** The items this event affects for this consumer, resolved under the consumer's own capability (its reads, under RLS). Each item is a stable string key. */
  resolveItems(cap: C, scope: { tenantId: string; domainId: string }, event: E): Promise<string[]>;
  /**
   * One bounded, idempotent effect for one item; returns what it did and the effect's reference for the ledger. `policy` is
   * the subscription's declared budgets (0065: a consumer's own rule — a materiality threshold — is read from there).
   */
  applyItem(cap: C, scope: { tenantId: string; domainId: string }, event: E, item: string, actor: string, correlationId: string, subscriptionId: string, policy?: Record<string, unknown>):
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
