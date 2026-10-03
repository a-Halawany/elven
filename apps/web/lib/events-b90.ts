/**
 * The event products and subscriptions client — CP-6 B90 part `events` (0095 §E; F-P7-F-09's event half; V7 ch43).
 *
 * Every response is returned VERBATIM (the Graph client's rule): an event product's declaration and stream head, a subscription's state,
 * checkpoint and lag, the events a read served (each payload already PROJECTED by the server to the granted fields), the omitted count —
 * rendered exactly as the server computed them AS OF the instant the answer states. The acts are the person's OWN: the consumer registers,
 * reads, acknowledges, conforms and replays; the owner (or the steward) authorizes, pauses, resumes and revokes; the server refuses anyone
 * the policy or the port does not name. The helpers below only word what the record says; nothing here decides a state.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type EventKind = 'change' | 'signal' | 'correction' | 'lifecycle' | 'quality' | 'strategic';
export type SubscriptionState = 'registered' | 'active' | 'paused' | 'lagging' | 'revoked';
export type PausedReason = 'lag' | 'schema' | 'owner';
type Row = Record<string, unknown>;

export interface EventDeclaration {
  product_id: string; declaration_version: number; schema_ref: { object_type: string; schema_version: string } | null; schema_json: { version: string; fields: Array<{ name: string; type: string }> } | null;
  schema_version: string; schema_fields: string[]; compatibility: 'additive' | 'breaking'; producer_domain_id: string; subject_kind: string; ordering_key: string; delivery: 'pull';
  retention_days: number; replay_policy: { allowed: boolean; [k: string]: unknown }; source: { ledger: string; kinds?: string[]; since?: string }; declared_by: string; declared_at: string; updated_at: string;
}
export interface SubscriptionRow {
  subscription_id: string; product_id: string; consumer_principal_id: string; consumer_domain_id: string; purpose: string;
  granted: { fields: string[]; consequence: string; from: string | null; to: string | null }; filters: Row; schema_version: string; lag_policy: { max_lag_events: number; max_lag_seconds: number };
  handles_corrections: boolean; handles_replays: boolean; state: SubscriptionState; checkpoint_sequence: number; checkpoint_at: string | null;
  paused_reason: PausedReason | null; pause_note: string | null; paused_at: string | null; conformance: Row | null; conformed_at: string | null;
  revoked_at: string | null; revoked_by: string | null; revocation_reason: string | null; registered_at: string; registered_by: string; authorized_at: string | null; authorized_by: string | null; updated_at: string;
  lag_events?: number; oldest_unacknowledged_at?: string | null;
}
export interface SubscriptionView extends SubscriptionRow {
  product: { product_id: string; product_key: string; title: string; state: string; owner_principal_id: string; schema_version: string; compatibility: string; retention_days: number; subject_kind: string; emits_corrections: boolean };
  head: number; lag_events: number; oldest_unacknowledged_at: string | null; retention_floor: string;
  checkpoints: Array<{ checkpoint_id: string; kind: 'advance' | 'replay'; from_sequence: number; to_sequence: number; acknowledged_by: string; acknowledged_at: string }>;
  replays: Array<{ replay_id: string; from_sequence: number; to_sequence: number; reason: string; requested_by: string; requested_at: string }>;
}
export interface EventProductView {
  product_id: string; product_key: string; title: string; kind: string; purpose: string; owner_principal_id: string; state: string; current_version: number; released_version: number | null; declaration: Row | null;
  event: EventDeclaration; emits_corrections: boolean; head: number; retention_floor: string;
  stream: { rows: number; within_retention: number; oldest_at: string | null; newest_at: string | null; by_kind: Partial<Record<EventKind, number>> };
  subscriptions: SubscriptionRow[];
  slo: Partial<Record<'lag_events' | 'lag_seconds', { value: number; threshold: number | null; met: boolean; observed_at: string; source: string; details: Row }>>;
}
export interface ServedEvent { sequence: number; event_kind: EventKind; source_event: string; subject_id: string; subject_kind: string; ordering_key: string | null; occurred_at: string; schema_version: string; payload: Row }
export interface ReadResult {
  subscription_id: string; product_id: string; product_key: string; after: number; next_after: number; head: number; checkpoint: number; served: number;
  omitted: { corrections: number; reason?: string | null }; retention_floor: string; window: { from: string | null; to: string | null }; fields?: string[]; events: ServedEvent[]; note?: string;
}

/* ───────────── the words ───────────── */
/** A subscription's state as a glyph, a token and words — never colour alone; who acts next is named. */
export function subscriptionStateMark(state: string, pausedReason: string | null | undefined): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'registered': return { glyph: '◌', token: '--eye-color-ink-muted', text: 'REGISTERED — awaiting the owner\'s authorization' };
    case 'active': return { glyph: '●', token: '--eye-color-success', text: 'ACTIVE — the consumer reads and acknowledges' };
    case 'paused': return pausedReason === 'schema'
      ? { glyph: '⏸', token: '--eye-color-warning', text: 'PAUSED (schema) — the product broke its schema; conform to the new version, then the owner resumes' }
      : { glyph: '⏸', token: '--eye-color-warning', text: 'PAUSED (owner) — conform, then the owner resumes' };
    case 'lagging': return { glyph: '⚑', token: '--eye-color-critical', text: 'LAGGING — beyond the lag policy; delivery paused, the offset preserved; catch up and conform, then the owner resumes' };
    case 'revoked': return { glyph: '✕', token: '--eye-color-ink-muted', text: 'REVOKED — the offsets preserved; nothing is served' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() || 'UNKNOWN' };
  }
}
/** An event kind's glyph (the six of ch43). */
export function kindGlyph(kind: string): string {
  switch (kind) {
    case 'change': return 'Δ'; case 'signal': return '⚠'; case 'correction': return '↺'; case 'lifecycle': return '⟳'; case 'quality': return '◈'; case 'strategic': return '◇';
    default: return '·';
  }
}
/** The lag in words: the checkpoint against the head, the policy named — never a percentage. */
export function lagLine(s: { checkpoint_sequence: number; head: number; lag_events: number; lag_policy: { max_lag_events: number; max_lag_seconds: number } }): string {
  const over = s.lag_events > s.lag_policy.max_lag_events;
  return `checkpoint ${s.checkpoint_sequence} of head ${s.head} — ${s.lag_events} event(s) behind (policy ${s.lag_policy.max_lag_events} events / ${s.lag_policy.max_lag_seconds} s)${over ? ' — BEYOND POLICY' : ''}`;
}
/** The retention in words: the days and the floor instant the server states. */
export function retentionLine(days: number, floor: string): string {
  return `${days} day(s) — rows before ${floor} are not served`;
}
/** The grant in words: the fields, the consequence class, the window. */
export function grantLine(g: { fields: string[]; consequence: string; from: string | null; to: string | null }): string {
  const window = g.from === null && g.to === null ? 'no time window' : `from ${g.from ?? 'the start'} to ${g.to ?? 'open'}`;
  return `${g.fields.join(', ')} · consequence ${g.consequence} · ${window}`;
}
/** A served event's caption: the sequence, the kind, the source event, the instant. */
export function eventLine(e: { sequence: number; event_kind: string; source_event: string; occurred_at: string }): string {
  return `#${e.sequence} ${kindGlyph(e.event_kind)} ${e.event_kind} · ${e.source_event} · ${e.occurred_at}`;
}
/** The omitted corrections in words (only when any). */
export function omittedLine(r: { omitted: { corrections: number } }): string | null {
  return r.omitted.corrections > 0 ? `${r.omitted.corrections} correction row(s) withheld: this subscription declared it cannot process corrections` : null;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/products/events`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'executive',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}

export interface RegisterSubscription {
  productId: string; purpose: string; granted: { fields: string[]; consequence: string; from?: string | null; to?: string | null }; filters?: Row; schemaVersion: string;
  lagPolicy: { max_lag_events: number; max_lag_seconds: number }; handlesCorrections: boolean; handlesReplays: boolean; consumerPrincipalId?: string;
}

export const events = {
  list: (s: Scope, state?: string) => p<{ at: string; event_products: EventProductView[]; receipt: Receipt }>(s, '/list', 'products.product.read', 'DPR', state ? { state } : {}),
  read: (s: Scope, productId: string) => p<{ at: string; event_product: EventProductView; receipt: Receipt }>(s, `/${productId}/read`, 'products.product.read', 'DPR', {}, productId),
  declare: (s: Scope, productId: string, declaration: Row) => p<{ event_product: Row; receipt: Receipt }>(s, `/${productId}/declare`, 'products.event_product.declare', 'DPR', { declaration }, productId),
  register: (s: Scope, payload: RegisterSubscription) => p<{ subscription: SubscriptionRow; receipt: Receipt }>(s, '/subscriptions/register', 'products.subscription.register', 'SUB', payload as unknown as Row),
  mine: (s: Scope, productId?: string) => p<{ at: string; subscriptions: SubscriptionView[]; receipt: Receipt }>(s, '/subscriptions/list', 'products.subscription.read', 'SUB', { mine: true, ...(productId ? { productId } : {}) }),
  get: (s: Scope, id: string) => p<{ at: string; subscription: SubscriptionView; receipt: Receipt }>(s, `/subscriptions/${id}/get`, 'products.subscription.read', 'SUB', {}, id),
  readEvents: (s: Scope, id: string, afterSequence: number | null, limit = 50) => p<{ at: string; read: ReadResult; receipt: Receipt }>(s, `/subscriptions/${id}/read`, 'products.subscription.read', 'SUB', { afterSequence, limit }, id),
  authorize: (s: Scope, id: string) => p<{ subscription: SubscriptionRow; receipt: Receipt }>(s, `/subscriptions/${id}/authorize`, 'products.subscription.authorize', 'SUB', {}, id),
  /** B90-F1 (0096): the consumer's CATCH-UP of a lagging subscription's authorized backlog (bounded; recorded; ordinary delivery stays paused). */
  catchUp: (s: Scope, id: string, afterSequence: number | null, limit = 50) => p<{ catchup: ReadResult & { through: number; backlog_head: number; remaining: number; catchup_id: string }; receipt: Receipt }>(s, `/subscriptions/${id}/catch-up`, 'products.subscription.catch_up', 'SUB', { afterSequence, limit }, id),
  checkpoint: (s: Scope, id: string, sequence: number) => p<{ subscription: SubscriptionRow; receipt: Receipt }>(s, `/subscriptions/${id}/checkpoint`, 'products.subscription.checkpoint', 'SUB', { sequence }, id),
  pause: (s: Scope, id: string, reason: string) => p<{ subscription: SubscriptionRow; receipt: Receipt }>(s, `/subscriptions/${id}/pause`, 'products.subscription.pause', 'SUB', { reason }, id),
  conform: (s: Scope, id: string, declaration: { caught_up: boolean; can_process: boolean; note?: string; schema_version?: string; handles_corrections?: boolean }) =>
    p<{ subscription: SubscriptionRow; receipt: Receipt }>(s, `/subscriptions/${id}/conform`, 'products.subscription.conform', 'SUB', { declaration }, id),
  resume: (s: Scope, id: string) => p<{ subscription: SubscriptionRow; receipt: Receipt }>(s, `/subscriptions/${id}/resume`, 'products.subscription.resume', 'SUB', {}, id),
  replay: (s: Scope, id: string, fromSequence: number, reason: string) => p<{ subscription: SubscriptionRow; receipt: Receipt }>(s, `/subscriptions/${id}/replay`, 'products.subscription.replay', 'SUB', { fromSequence, reason }, id),
  revoke: (s: Scope, id: string, reason: string) => p<{ subscription: SubscriptionRow; receipt: Receipt }>(s, `/subscriptions/${id}/revoke`, 'products.subscription.revoke', 'SUB', { reason }, id),
};
