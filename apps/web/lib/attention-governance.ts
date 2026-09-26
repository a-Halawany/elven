/**
 * CP-6 B24 client — THE ATTENTION QUEUE'S GOVERNANCE (migration 0086 §G): suppression approval, item delegation, disposition, queue
 * evaluation.
 *
 * A suppression whose class rule (in the item's own policy version) says `approval_required` is a REQUEST: the item stays live and
 * keeps escalating until a SECOND person — never the requester, a holder of the version's approver roles — approves or refuses it; an
 * undecided request lapses at its instant and the approvers' sweep records it expired. An item is DELEGATED by a person who acts on it
 * in their own right to an active human holding an acknowledgement role, for a window, with a reason; the owner stays accountable; the
 * request_key is the delegator's idempotency key. A DISPOSITION records what an item turned out to be. An EVALUATION measures the queue
 * over a window from its ledgers; every measure may ABSTAIN (below min_sample, no rank, no delivery ledger) and says why.
 *
 * Nothing here decides who may, or computes a measure: the server does, in its own words. The helpers below only word what it recorded.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

export const DISPOSITIONS = ['actioned', 'not_material', 'duplicate', 'late', 'missed'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];
export const REQUEST_STATES = ['pending', 'approved', 'refused', 'expired'] as const;
export const DELEGATION_STATES = ['active', 'ended'] as const;
/** The roles the server admits to evaluate the queue (executive.evaluate_attention_queue; the PDP rule names the same). */
export const EVALUATOR_ROLES = ['executive', 'domain_admin', 'platform_admin'] as const;

export interface SuppressionRequest {
  request_id: string; item_id: string; state: (typeof REQUEST_STATES)[number] | string; requested_by: string; requested_at: string | null; until: string | null; reason: string;
  policy_version: number | null; max_hours: number | null; approver_roles: string[]; from_state: string; decided_by: string | null; decided_at: string | null;
  decision_reason: string | null; approved_until: string | null; capped: boolean | null; lapsed: boolean;
}
export interface Decided extends Omit<SuppressionRequest, 'lapsed'> { item_state: string }
export interface ItemDelegation {
  delegation_id: string; item_id: string; from: string; to: string; owner: string | null; owner_stays_accountable: true; reason: string; from_at: string | null; until: string | null;
  state: (typeof DELEGATION_STATES)[number] | string; ended_at: string | null; ended_by: string | null; end_reason: string | null; request_key: string; in_force?: boolean; repeated?: boolean;
}
export interface DispositionRecorded { item_id: string; disposition: Disposition; note: string | null; repeated: boolean; previous: string | null; recorded_by: string }
/** A measured ratio or its abstention (the server's words). */
export interface Ratio { abstained: boolean; sample: number; value?: number; reason?: string }
export interface ClassMeasures { items: number; true_positive: number; false_positive: number; missed: number; late: number; undisposed: number; precision: Ratio; recall: Ratio }
export interface QueueEvaluation {
  evaluation_id: string; verdict: 'measured' | 'partial' | 'abstained' | string; reason: string; evaluated_by: string; evaluated_at: string | null;
  window?: { from: string; to: string }; window_from?: string | null; window_to?: string | null; min_sample: number; items?: number;
  classes?: Record<string, ClassMeasures>; overall?: ClassMeasures;
  ranking_stability?: { abstained: boolean; ranked: number; reason?: string; value?: number; method?: string; concordant?: number; discordant?: number };
  severe?: { items: number; routed: number; acknowledged: number; acknowledged_before_deadline: number; overload_deprioritized: number; never_overload_deprioritized: boolean;
             time_to_acknowledge_seconds: { p50: number; p90: number } | null; delivered_before_deadline: { measurable: boolean; reason?: string; delivered_before_deadline?: number; of?: number };
             breaches: Array<{ item_id: string; signal_class: string; consequence: string; breach: string; deadline?: string | null; acknowledged_at?: string | null }> };
  escalation_latency?: { abstained: boolean; escalations: number; reason?: string; p50_seconds?: number; p90_seconds?: number; max_seconds?: number };
  measures?: Omit<QueueEvaluation, 'measures'>;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
/** The governance routes are made under the purpose `executive` (the reviews' idiom). */
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'executive', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

/** The delegation payload: the ISO instant, the trimmed reason and key (the server validates each and binds the key to the content). */
export function delegatePayload(f: { to: string; reason: string; until: string | null; key: string }): Record<string, unknown> {
  return { to: f.to.trim(), reason: f.reason.trim(), until: f.until, request_key: f.key.trim() };
}
/** The evaluation payload: only what is set is sent (the server defaults the window to the 30 days before now and min_sample to 5). */
export function evaluatePayload(f: { from: string | null; to: string | null; minSample: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.from !== null && f.from !== '') out['window_from'] = f.from;
  if (f.to !== null && f.to !== '') out['window_to'] = f.to;
  if (f.minSample.trim() !== '') out['min_sample'] = Number(f.minSample.trim());
  return out;
}

export const governance = {
  requests: (s: Scope, filter: { state?: string | null; itemId?: string | null } = {}) => {
    const payload: Record<string, unknown> = { limit: 200 };
    if (typeof filter.state === 'string' && filter.state !== '') payload['state'] = filter.state;
    if (typeof filter.itemId === 'string' && filter.itemId !== '') payload['itemId'] = filter.itemId;
    return p<{ requests: SuppressionRequest[]; receipt: Receipt }>(s, '/executive/attention/suppressions/list', 'executive.attention.read', 'ATS', payload);
  },
  /** Human-gated; never the requester; a holder of the item version's approver roles. A reason of 8+ characters. */
  decide: (s: Scope, requestId: string, decision: 'approve' | 'refuse', reason: string) =>
    p<{ request: Decided; receipt: Receipt }>(s, `/executive/attention/suppressions/${requestId}/decide`, 'executive.attention.suppression.decide', 'ATS', { decision, reason: reason.trim() }, requestId),
  /** The approvers' sweep: the pending requests past their instant recorded expired. */
  expire: (s: Scope) => p<{ expiry: { expired: Array<{ request_id: string; item_id: string; until: string }>; at: string }; receipt: Receipt }>(s, '/executive/attention/suppressions/expire', 'executive.attention.suppression.decide', 'ATS'),
  delegations: (s: Scope, filter: { state?: string | null; itemId?: string | null } = {}) => {
    const payload: Record<string, unknown> = { limit: 200 };
    if (typeof filter.state === 'string' && filter.state !== '') payload['state'] = filter.state;
    if (typeof filter.itemId === 'string' && filter.itemId !== '') payload['itemId'] = filter.itemId;
    return p<{ delegations: ItemDelegation[]; receipt: Receipt }>(s, '/executive/attention/delegations/list', 'executive.attention.read', 'ATD', payload);
  },
  /** Human-gated; exactly once on the delegator's request_key under the delegation's content. */
  delegate: (s: Scope, itemId: string, f: { to: string; reason: string; until: string | null; key: string }) =>
    p<{ delegation: ItemDelegation; receipt: Receipt }>(s, `/executive/attention/items/${itemId}/delegate`, 'executive.attention.item.delegate', 'ATI', delegatePayload(f), itemId),
  endDelegation: (s: Scope, delegationId: string, reason: string) =>
    p<{ delegation: ItemDelegation; receipt: Receipt }>(s, `/executive/attention/delegations/${delegationId}/end`, 'executive.attention.item.delegate', 'ATD', { reason: reason.trim() }, delegationId),
  disposition: (s: Scope, itemId: string, disposition: Disposition, note: string) =>
    p<{ disposition: DispositionRecorded; receipt: Receipt }>(s, `/executive/attention/items/${itemId}/disposition`, 'executive.attention.disposition.record', 'ATI', note.trim() === '' ? { disposition } : { disposition, note: note.trim() }, itemId),
  /** Human-gated (executive, domain_admin, platform_admin); the measures are the server's, computed in the write. */
  evaluate: (s: Scope, f: { from: string | null; to: string | null; minSample: string }) =>
    p<{ evaluation: QueueEvaluation; receipt: Receipt }>(s, '/executive/attention/evaluations/run', 'executive.attention.queue.evaluate', 'ATE', evaluatePayload(f)),
  evaluations: (s: Scope) => p<{ evaluations: QueueEvaluation[]; receipt: Receipt }>(s, '/executive/attention/evaluations/list', 'executive.attention.read', 'ATE', { limit: 50 }),
};

// ───────────────────────── the words (pure; tested in attention-governance.test.ts) ─────────────────────────

/** A request's state, three channels: glyph, uppercase word, colour token; a pending request past its instant says LAPSED. */
export function requestMark(state: string, lapsed = false): { glyph: string; token: string; text: string } {
  if (state === 'pending' && lapsed) return { glyph: '⌛', token: '--eye-color-warning', text: 'PENDING — LAPSED (the sweep records it expired)' };
  const m: Record<string, { glyph: string; token: string }> = {
    pending: { glyph: '○', token: '--eye-color-uncertain' }, approved: { glyph: '✓', token: '--eye-color-success' },
    refused: { glyph: '✕', token: '--eye-color-critical' }, expired: { glyph: '⌛', token: '--eye-color-ink-muted' },
  };
  const s = m[state] ?? { glyph: '?', token: '--eye-color-ink-muted' };
  return { ...s, text: state.toUpperCase() };
}

/** A ratio in words: its value with the sample, or the server's reason for abstaining. */
export function ratioWords(r: Ratio | null | undefined): string {
  if (r === null || r === undefined) return 'not reported';
  if (r.abstained) return `abstained — ${r.reason ?? `sample ${r.sample}`}`;
  return `${typeof r.value === 'number' ? r.value.toFixed(4) : '—'} (n = ${r.sample})`;
}

/** A verdict in words (three channels: glyph, uppercase word, token). */
export function verdictMark(v: string): { glyph: string; token: string; text: string } {
  switch (v) {
    case 'measured': return { glyph: '●', token: '--eye-color-success', text: 'MEASURED' };
    case 'partial': return { glyph: '◐', token: '--eye-color-uncertain', text: 'PARTIAL — SOME MEASURES ABSTAINED' };
    case 'abstained': return { glyph: '○', token: '--eye-color-ink-muted', text: 'ABSTAINED — TOO LITTLE TO MEASURE' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: v.toUpperCase() };
  }
}

/** The measures of an evaluation, whether the answer carried them at the top (the run) or under `measures` (the list). */
export function measuresOf(e: QueueEvaluation): Omit<QueueEvaluation, 'measures'> {
  return e.measures === undefined || e.measures === null ? e : { ...e, ...e.measures };
}
