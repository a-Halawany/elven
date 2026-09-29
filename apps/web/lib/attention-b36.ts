/**
 * CP-6 B36 client — THE ATTENTION COMPLETION (migration 0094 §A; F-P6-07 completes).
 *
 *   (n)  an act whose settle failed after its governed action committed reads `settle_failed`; the launcher or the executive operator
 *        RESUMES it — the server re-runs the settle from the audit chain and never performs the governed action again;
 *   (o1) ACCEPT-PRIORITY is the accountable person's distinct act: the digest of the evaluation accepted, the consequence preview (what
 *        accepting commits the person to) and a SIGNATURE (Ed25519 by key reference) recorded in the same write;
 *   (o2) the queue evaluation HOLDS the queue when the fairness measure falls below the policy's floor or the staleness measure rises
 *        above its ceiling — the items are served read-only until the executive releases the hold with a reason;
 *   (o3) the degraded states and their recovery routes are the server's — listed with what each means, its route and the last outcome;
 *   (o4) the queue is served UNDER the active context (objective, horizon, scenario, classification, effective time) and the policy in
 *        force; what the context filters is counted, never dropped;
 *   (o5) a FORUM is a room whose members review the same items under the forum's context.
 * Nothing here computes a verdict: the helpers below only word what the server recorded.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };
type Row = Record<string, unknown>;

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'decision', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const HORIZONS = ['30d', '90d', '12m', '36m'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const FORUM_PERIODS = ['weekly', 'monthly', 'quarterly'] as const;
export const DEGRADED_STATES = ['delivery_sink_down', 'tick_stalled', 'policy_invalid', 'evaluation_stale', 'hold'] as const;
export type DegradedState = (typeof DEGRADED_STATES)[number];
/** The roles the server admits to release a hold (executive.release_queue_hold). */
export const RELEASE_ROLES = ['executive', 'domain_admin', 'platform_admin'] as const;
/** The roles the server admits to run a recovery route (executive.recover_queue) and to convene a forum (executive.convene_forum). */
export const RECOVERY_ROLES = ['executive', 'executive_operator', 'domain_admin', 'platform_admin'] as const;
export const FORUM_CONVENER_ROLES = ['executive_operator', 'executive', 'domain_admin', 'platform_admin'] as const;

export interface QueueContext {
  context: { context_id: string | null; objective_id: string | null; horizon: string; scenario_id: string | null; classification: string | null; effective_at: string | null; digest: string | null; set_at: string | null; source: 'default' | 'executive.contexts' | string; note?: string };
  policy: { policy_id: string | null; version: number | null; digest: string | null; governance: { fairness_floor: number; staleness_ceiling_hours: number } | null; effective_at?: string | null; note?: string };
  hold: QueueHoldSummary | null;
  as_of: string;
}
export interface QueueHoldSummary { hold_id: string; cause: string; measure: number; threshold: number; held_at: string; held_by: string; governance_item_id: string | null; read_only: boolean }
export interface QueueHold extends QueueHoldSummary { evaluation_id: string; state: 'held' | 'released' | string; measures: Row; governance: Row; policy_version: number; context_digest: string | null; released_by: string | null; released_at: string | null; release_reason: string | null }
export interface QueueItem {
  item_id: string; signal_class: string; subject_kind: string; subject_id: string; title: string; outcome: string; state: string; owner_principal_id: string | null; route_roles: string[];
  policy_version: number | null; evaluation: Row; details: Row; due_at: string | null; escalations: number; created_at: string; objectives: string[]; rank_position: number; linkage: string;
  priority_accepted: { acceptance_id: string; accepted_by: string; accepted_at: string; evaluation_digest: string } | null;
  act_in_flight: { act_id: string; state: string; action_key: string } | null;
}
export interface FilteredItem { item_id: string; title: string; signal_class: string; state: string; filtered_by: string[]; linkage: string }
export interface QueueCounts { total: number; served: number; filtered: number; by: { objective: number; horizon: number; effective_at: number }; linkage_unknown: number }
export interface QueueRead extends QueueContext { items: QueueItem[]; filtered: FilteredItem[]; counts: QueueCounts; ranking: { context_digest: string | null; method: string; objective_id: string | null; horizon: string; horizon_hours: number; effective_at: string | null; limit: number } }
export interface Acceptance { acceptance_id: string; item_id: string; accepted_by: string; accepted_at: string; evaluation_digest: string; consequence: Consequence; rank_explanation: string | null; note: string | null; context_digest: string | null }
export interface Consequence { accountable: string; state: string; rank: string | null; response_window: { due_at: string | null; hours_remaining: number | null; ack_within_minutes: number | null }; escalation: { roles: string[]; max_escalations: number; so_far: number }; commits_to: string; policy_version: number | null; evaluation_digest: string; context_digest: string | null }
export interface Signature { signature_id: string; signer: string; key_id: string; algorithm: string; signature: string; subject_digest: string; bound_action: string; signed_at: string; verified?: boolean }
export interface Resumption { resumption_id: string; act_id: string; item_id: string; from_state: string; failure: Row | null; action_receipt: Row; effect_ref: string; resumed_by: string; resumed_at: string }
export interface DegradedStateRow { state: DegradedState | string; active: boolean; route: string; meaning: string; detail: Row; route_does: string; last_route: RecoveryRoute | null }
export interface RecoveryRoute { route_id: string; degraded_state: string; route: string; before_state: Row; after_state: Row; outcome: string; note: string | null; run_by: string; run_at: string }
export interface Forum { room_id: string; title: string; kind: 'forum'; review_every_days: number; next_review_at: string; owner_principal_id: string; opened_at: string; forum_context: { objective_id: string | null; horizon: string; scenario_id: string | null; classification: string; period: string; digest: string }; members: Array<{ principal_id: string; role: string }> }

export const attentionB36 = {
  queue: (s: Scope, limit = 200) => p<QueueRead & { receipt: Receipt }>(s, '/executive/attention/queue', 'executive.attention.queue.read', 'ATI', { limit }),
  context: (s: Scope) => p<QueueContext & { receipt: Receipt }>(s, '/executive/attention/queue/context', 'executive.attention.queue.read', 'ATI'),
  /** (n) Human-gated; the launcher or the executive operator. The governed action is never performed again — the server says so (re_executed: false). */
  resume: (s: Scope, actId: string) => p<{ act: Row; resumption: Row | null; re_executed: boolean; receipt: Receipt }>(s, `/executive/attention/acts/${actId}/resume`, 'executive.attention.item.act.resume', 'ATI', {}, actId),
  /** (o1) Human-gated; the item's accountable person. The signature is recorded in the same write (a deployment without a key refuses, never signs silently). */
  acceptPriority: (s: Scope, itemId: string, note: string) => p<{ acceptance: Acceptance; signature: Row; receipt: Receipt }>(s, `/executive/attention/items/${itemId}/accept-priority`, 'executive.attention.item.accept_priority', 'ATI', note.trim() === '' ? {} : { note: note.trim() }, itemId),
  acceptance: (s: Scope, itemId: string) => p<{ acceptance: Acceptance | null; signatures: Signature[]; acts: Row[]; resumptions: Resumption[]; signing: { bound: boolean; key: string | null }; receipt: Receipt }>(s, `/executive/attention/items/${itemId}/acceptance`, 'executive.attention.queue.read', 'ATI', {}, itemId),
  holds: (s: Scope) => p<{ holds: QueueHold[]; receipt: Receipt }>(s, '/executive/attention/holds/list', 'executive.attention.queue.read', 'ATH'),
  /** (o2) Human-gated; the executive. */
  release: (s: Scope, holdId: string, reason: string) => p<{ hold: Row; receipt: Receipt }>(s, `/executive/attention/holds/${holdId}/release`, 'executive.attention.queue.release', 'ATH', { reason: reason.trim() }, holdId),
  degradedStates: (s: Scope) => p<{ as_of: string; degraded: number; states: DegradedStateRow[]; routes: RecoveryRoute[]; fixtures: { settle_fault: Row | null; synthetic: true }; receipt: Receipt }>(s, '/executive/attention/recovery/states', 'executive.attention.queue.read', 'ATR'),
  /** (o3) Human-gated; the executive, the executive operator or an administrator. The hold's route is the release. */
  recover: (s: Scope, state: string, note: string) => p<{ recovery: RecoveryRoute & { before: Row; after: Row }; mechanics: Row; receipt: Receipt }>(s, '/executive/attention/recovery/run', 'executive.attention.queue.recover', 'ATR', note.trim() === '' ? { state } : { state, note: note.trim() }),
  /** The SYNTHETIC one-shot settle fault (how the resume is reproduced): human-gated, audited, closes nothing. */
  armSettleFault: (s: Scope) => p<{ fixture: Row; receipt: Receipt }>(s, '/executive/attention/recovery/fixtures/arm', 'executive.attention.fixture.arm', 'ATI', { fixture: 'settle_fault' }),
  forums: (s: Scope) => p<{ forums: Forum[]; receipt: Receipt }>(s, '/executive/attention/forums/list', 'executive.attention.queue.read', 'ROOM'),
  /** (o5) Human-gated; the executive operator. */
  convene: (s: Scope, f: ForumForm) => p<{ forum: Row; receipt: Receipt }>(s, '/executive/attention/forums/convene', 'executive.forum.convene', 'ROOM', forumPayload(f)),
  forumQueue: (s: Scope, roomId: string, limit = 200) => p<{ forum: Row; context: Row; policy: Row; hold: QueueHoldSummary | null; items: QueueItem[]; filtered: FilteredItem[]; counts: QueueCounts; ranking: Row; receipt: Receipt }>(s, `/executive/attention/forums/${roomId}/queue`, 'executive.attention.queue.read', 'ROOM', { limit }, roomId),
};

/* ───────────── pure helpers: words for what the server recorded (unit-tested) ───────────── */
export interface ForumForm { title: string; members: string; period: string; objectiveId: string; horizon: string; scenarioId: string; classification: string }
/** The convene payload: members one id per line or comma; empty optional ids left out. */
export function forumPayload(f: ForumForm): Record<string, unknown> {
  const members = f.members.split(/[\s,;]+/).map((m) => m.trim()).filter((m) => m !== '');
  const context: Record<string, unknown> = { horizon: f.horizon, classification: f.classification === '' ? 'internal' : f.classification };
  if (f.objectiveId.trim() !== '') context['objective_id'] = f.objectiveId.trim();
  if (f.scenarioId.trim() !== '') context['scenario_id'] = f.scenarioId.trim();
  return { title: f.title.trim(), members: [...new Set(members)], period: f.period, context };
}
/** The context strip's line: the objective (or the whole domain), the horizon, the scenario, the classification, the effective instant, the source. */
export function contextLine(c: QueueContext['context'] | null | undefined): string {
  if (c === null || c === undefined) return 'context not read';
  const obj = c.objective_id === null ? 'the whole domain' : `objective ${c.objective_id.slice(0, 8)}…`;
  const scn = c.scenario_id === null ? 'no scenario' : `scenario ${c.scenario_id.slice(0, 8)}…`;
  const cls = c.classification === null ? 'your own classification ceiling' : `classification ${c.classification}`;
  const eff = c.effective_at === null ? 'effective now' : `as of ${c.effective_at}`;
  return `${obj} · horizon ${c.horizon} · ${scn} · ${cls} · ${eff} · ${c.source === 'default' ? 'the default (no context set)' : 'your executive context'}`;
}
/** The policy line beside the context: the version, its digest, the governance in force (or none). */
export function policyLine(pol: QueueContext['policy'] | null | undefined): string {
  if (pol === null || pol === undefined || pol.version === null) return 'no active attention policy';
  const g = pol.governance === null || pol.governance === undefined ? 'no governance fields (the evaluation reports, gating nothing)' : `fairness floor ${pol.governance.fairness_floor}, staleness ceiling ${pol.governance.staleness_ceiling_hours} h`;
  return `policy version ${pol.version} (${(pol.digest ?? '').slice(0, 12)}…) — ${g}`;
}
/** What the context filtered, counted: never silently dropped. */
export function filteredLine(c: QueueCounts | null | undefined): string {
  if (c === null || c === undefined) return '';
  if (c.filtered === 0) return `${c.served} item(s) served; none filtered by the context${c.linkage_unknown > 0 ? ` (${c.linkage_unknown} with unknown objective linkage, served)` : ''}`;
  const by = [c.by.objective > 0 ? `${c.by.objective} outside the objective` : null, c.by.horizon > 0 ? `${c.by.horizon} beyond the horizon` : null, c.by.effective_at > 0 ? `${c.by.effective_at} after the effective instant` : null].filter((x) => x !== null).join(', ');
  return `${c.served} item(s) served; ${c.filtered} filtered by the context (${by})${c.linkage_unknown > 0 ? `; ${c.linkage_unknown} with unknown objective linkage, served` : ''}`;
}
/** The hold banner's words: the cause, the measure against the threshold, since when. */
export function holdLine(h: QueueHoldSummary | null | undefined): string | null {
  if (h === null || h === undefined) return null;
  const cause = h.cause === 'fairness_below_floor' ? `the ranking fairness ${h.measure} fell below the floor ${h.threshold}` : `the queue's staleness ${h.measure} h rose above the ceiling ${h.threshold} h`;
  return `The queue is HELD since ${h.held_at}: ${cause}. Its items are served read-only until the executive releases the hold.`;
}
/** The consequence preview, as accepting commits the person: the response window, the escalation. */
export function consequenceLines(c: Consequence | null | undefined): string[] {
  if (c === null || c === undefined) return [];
  const window = c.response_window.due_at === null ? 'no deadline is set' : `due ${c.response_window.due_at}${typeof c.response_window.hours_remaining === 'number' ? ` (${c.response_window.hours_remaining} h remaining)` : ''}`;
  const esc = c.escalation.roles.length === 0 ? 'no escalation roles' : `escalates to ${c.escalation.roles.join(', ')} (up to ${c.escalation.max_escalations}; ${c.escalation.so_far} so far)`;
  return [c.commits_to, `Response window: ${window}.`, `Escalation: ${esc}.`, c.rank === null ? 'No rank explanation recorded.' : `Rank: ${c.rank}.`];
}
/** An act's state in words — settle_failed names the resume. */
export function actStateLine(a: { state: string; effect_ref?: string | null; refusal?: string | null; settle_failure?: Row | null; resumed_at?: string | null }): string {
  if (a.state === 'settle_failed') return `settle FAILED after the governed action committed (${String((a.settle_failure ?? {})['reason'] ?? 'no reason recorded')}) — resume it; the action is not performed again`;
  if (a.state === 'acted') return `acted → ${a.effect_ref ?? ''}${a.resumed_at ? ' (resumed)' : ''}`;
  if (a.state === 'refused') return `refused: ${a.refusal ?? ''}`;
  return a.state;
}
export const canResume = (state: string) => state === 'settle_failed' || state === 'launched';
/** A degraded state's words. */
export function degradedMark(s: Pick<DegradedStateRow, 'active' | 'state'>): { glyph: string; token: string; text: string } {
  return s.active ? { glyph: '▲', token: '--eye-color-critical', text: 'DEGRADED' } : { glyph: '●', token: '--eye-color-healthy', text: 'nominal' };
}
export function outcomeWords(outcome: string): string {
  switch (outcome) {
    case 'recovered': return 'recovered — the state is nominal after the route';
    case 'requeued': return 're-queued — the next tick drains the deliveries';
    case 'exhausted': return 'exhausted — the ledger admits five attempts; the recipient is reached in-app';
    case 'unchanged': return 'unchanged — nothing to recover';
    case 'still_degraded': return 'still degraded after the route — the cause is not the route\'s to remove';
    default: return outcome;
  }
}
