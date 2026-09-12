/**
 * GraphChanged / MemoryCorrected — the event contracts of CP-6 B6 (migration 0063), and the consumer identities.
 *
 * AU-MEM-0030: "Graph and memory changes publish a GraphChanged/MemoryCorrected event with affected identities,
 * relationships, temporal scopes and subscriptions". An event is an immutable outbox row written in the SAME
 * transaction as the change it announces (ES-19-001), carrying stable references and the minimum transition data
 * a consumer needs (ES-19-002) — never an object body:
 *
 *   identities     the entity identities the change touched (id + role: origin/successor/resolved_to/subject/object …)
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

export const EMPTY_REACH: ReachedObjects = Object.freeze({ claims: [], assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], evidence: [], truncated: false, walked: true }) as ReachedObjects;

/** The consumer kinds AU-MEM-0030 names, each with the action it holds (PDP rule + port assertion) and its identity. */
export const CONSUMER_KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings'] as const;
export type ConsumerKind = (typeof CONSUMER_KINDS)[number];
export const CONSUMER_ACTION: Readonly<Record<ConsumerKind, string>> = Object.freeze({
  twins: 'twin.subscription.apply',
  forecasts: 'prediction.forecast.subscription.apply',
  scenarios: 'prediction.scenario.subscription.apply',
  decisions: 'decision.subscription.apply',
  retrieval: 'graph.retrieval.subscription.apply',
  'memory-mappings': 'graph.mapping.subscription.apply',
});
export const CONSUMER_ROLE: Readonly<Record<ConsumerKind, string>> = Object.freeze({
  twins: 'twin_subscriber', forecasts: 'forecast_subscriber', scenarios: 'scenario_subscriber', decisions: 'decision_subscriber', retrieval: 'retrieval_subscriber', 'memory-mappings': 'mapping_subscriber',
});
/** The consumer's identity, the walker precedent: a changed method is a new consumer, registered anew. */
export const CONSUMER_VERSION = '1.0.0';
const METHOD_REF: Readonly<Record<ConsumerKind, string>> = Object.freeze({
  twins: 'citing or boundary-bound admitted versions → twin.apply_subscription_mark (once per cause)',
  forecasts: 'subject, assumption or evidence affected → prediction.mark_forecast_attention (once)',
  scenarios: 'subject or forecast affected → prediction.mark_scenario_attention (once)',
  decisions: 'DEC or cited input affected → decision.note_input_invalidated (once per cause)',
  retrieval: 'graph.rebuild_projections verified → graph.record_retrieval_check',
  'memory-mappings': 'identifier/edge/resolution basis moved → graph.propose_mapping_reconciliation (a person decides)',
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
}

/** What a registered consumer supplies to the dispatcher: how to read its world, what an event means for it, and one effect per item. */
export interface SubscriptionConsumer<C> {
  kind: ConsumerKind;
  /** The AUD target type of the consumer's writes and the purpose its envelope carries. */
  objectType: string;
  purpose: string;
  capability: (tx: Tx, action: string) => C;
  /** The items this event affects for this consumer, resolved under the consumer's own capability (its reads, under RLS). Each item is a stable string key. */
  resolveItems(cap: C, scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]>;
  /** One bounded, idempotent effect for one item; returns what it did and the effect's reference for the ledger. */
  applyItem(cap: C, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string, subscriptionId: string):
    Promise<{ effect: string; effectRef: string | null; details?: Record<string, unknown>;
              /** The item was recorded but what it found is operator work (a projection mismatch): the delivery ends failed with this reason. */
              failure?: string }>;
}
