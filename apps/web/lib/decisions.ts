/**
 * Phase 6 client — decision packages, replay, rooms, briefings, agents and reports.
 * Every read and write goes through the governed envelope; the screens show what the
 * record says, never a state derived on the client. Simulated consequences are
 * SYNTHETIC and are shown as such; receipts come only from authoritative responses.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

export interface Citation { kind: 'run' | 'forecast' | 'claim' | 'evidence' | 'assumption' | 'warning'; id: string; version: number; digest: string }
export interface Option {
  option_id: string; key: string; title: string; kind: 'intervention' | 'status_quo'; consequences: Citation[]; simulated: boolean; unsimulated_reason: string | null;
  uncertainty: { method?: string; citations?: number; synthetic_inputs?: number; unvalidated_runs?: number; outside_envelope_runs?: number; truth_states?: string[]; basis?: Array<Record<string, unknown>> };
  second_order: unknown[]; risks: unknown[]; opportunities: unknown[]; reversibility: string | null; synthetic_state: boolean; version: number;
}
export interface Choice { option_key: string; rationale: string; decision_deadline: string; accepted_trade_offs: string[]; action_owner: string; outcome_criteria: Array<{ key: string; quantity: string; unit: string; target: number; comparator: string; by: string; observed_on: string; twin_id?: string; period?: { from: string; to: string } }> }
export interface Approval { approval_id: string; approver_principal_id: string; decision: 'approve' | 'reject'; version_digest: string; rationale: string; eligible_by: string; expires_at: string; revoked_at: string | null; revoked_reason: string | null; recorded_at: string; live: boolean }
export interface Dissent { dissent_id: string; principal_id: string; position: string; rationale: string; citation: Citation | null; recorded_at: string }
export interface PackageVersion {
  version: number; state: string; supersedes: number | null; known_at: string; observed_through: string | null; objectives: string[]; constraints: unknown[];
  approver_policy: { quorum?: number; principals?: string[]; roles?: string[]; expires_after_days?: number }; monitoring_conditions: Array<Record<string, unknown>>;
  choice: Choice | null; reversibility: string | null; information_value: string | null; baseline_run_id: string | null; version_digest: string | null; synthetic_state: boolean;
  proposed_at: string | null; options: Option[]; dissent: Dissent[]; approvals: Approval[];
}
export interface Package {
  package_id: string; decision_object_id: string; title: string; statement: string; owner_principal_id: string; state: string; current_version: number | null; committed_version: number | null;
  decided_at: string | null; synthetic_state: boolean; controls: Record<string, unknown>; declared_at: string; versions: PackageVersion[];
  decision?: { title: string; statement: string; status: string } | null; commitment?: Record<string, unknown> | null; events?: Array<Record<string, unknown>>;
}
export interface Replay {
  replayId: string; contentDigest: string; asOf: string; cutoffs: Record<string, unknown>;
  layers: { known: Array<Record<string, unknown>>; believed: Record<string, Array<Record<string, unknown>>>; tested: Record<string, Array<Record<string, unknown>>>; decided: Record<string, unknown>; observed: Record<string, Array<Record<string, unknown>>> };
  excluded: Array<Record<string, unknown>>; unavailable: Array<Record<string, unknown>>; summary: Record<string, number>; invocation: Record<string, unknown>;
}
export interface Room {
  room_id: string; package_id: string; title: string; owner_principal_id: string; state: string; package_state?: string; package_title?: string; review_every_days: number; next_review_at: string; last_review_at: string | null;
  review_overdue: boolean; review_status?: string; member?: boolean; members?: Array<{ principal_id: string; role: string; live: boolean }>; events?: Array<Record<string, unknown>>; briefings?: Array<Record<string, unknown>>;
}
export interface BriefingItem { item_id: string; kind: string; id: string; title: string; at: string; truth_state: string; synthetic_state: boolean; freshness: { recorded_at: string; age_hours: number }; source_state: string; owner: string | null; matters: Array<{ dependent_object_id: string; dependent_type: string; rationale: string }>; details: Record<string, unknown> }
export interface BriefingWindow { kind: string; id: string; title: string; closes_at: string; time_left_seconds: number; overdue: boolean; owner: string | null }
export interface Briefing {
  briefing_id: string; room_id: string | null; package_id: string | null; composed_by: string; composed_via: 'human' | 'agent'; agent_id: string | null; known_at: string; prior_briefing_id: string | null;
  /** B20: the memory projection's state at composition; B21 (Codex B20-F1): `memory_content 'unavailable'` rides ONLY a composition whose memory items were omitted because the withdrawn projection's log could not be read (absent means served). */
  watermark: { prior_briefing_id: string | null; prior_known_at?: string | null; prior_composed_at: string | null; known_at: string; projection?: { memory?: 'serving' | 'withdrawn'; memory_content?: 'unavailable' } }; sources: string[]; items: BriefingItem[]; windows: BriefingWindow[];
  source_states: Array<{ source_key: string; name: string; acquisition_mode: string; state: string; reason: string }>; degraded: boolean; narrative: string | null; narrative_cites: string[]; content_digest: string; composed_at: string;
  /** B10: items withheld from THIS reader (outside a cited memory version's audience) and the present availability of the citations, apart from the content. */
  items_withheld?: number;
  availability?: { checked_at: string; checked: Record<string, number>; unavailable: Array<{ kind: string; id: string; version: number | null; reason: string }>; corrected: Array<{ kind: string; id: string; version: number; by_version: number; reason: string }> };
  /* B23 (0084) attention: BRF@v2 — the edition's schema version (a v1 edition, composed before 0084, carries no attention section). */
  schema_version?: 'v1' | 'v2';
  attention?: BriefingAttention | null;
  /* end B23 attention */
}
/* B23 (0084) attention: BRF@v2's attention section — the routed items AS OF the edition's known_at, each with its confidence band, every
   state counted, and the material changes since the prior edition; inside the content digest (the server composes it, never the client). */
export interface BriefingAttentionItem {
  item_id: string; signal_class: string; subject_kind: string; subject_id: string; title: string; state: string; policy_version: number | null; owner: string | null;
  consequence: string | null; confidence: number | null; confidence_band: 'high' | 'medium' | 'low' | 'unknown'; hours_to_window: number | null; created_at: string; cause_event_id: string;
}
export interface BriefingAttention { as_of: string; since: string | null; policy_version: number | null; items: BriefingAttentionItem[]; counts: Record<string, number>; material_changes_since_prior: BriefingAttentionItem[] }
/* end B23 attention */

/**
 * CP-6 B9 (0066 §9; interface L10-I04 ExecutiveActionRequested): a person's TYPED REQUEST with an exactly-once
 * institutional effect. The requester's `request_key` is the idempotency boundary: the same key with the same request
 * returns the request already recorded (no second effect, no second event); the same key with a different request is
 * refused. The server routes the request to the responsible capability (`analysis` → an agent run; `scenario`,
 * `simulation`, `decision` → the owner's own governed act, which names the request and fulfils it) or effects it in the
 * write (`delegation`, `suppression`, `follow_up`). Every row below is the server's; nothing is derived on the client.
 */
export const REQUEST_KINDS = ['analysis', 'scenario', 'simulation', 'decision', 'delegation', 'suppression', 'follow_up'] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export type RequestState = 'routed' | 'fulfilled' | 'refused' | 'withdrawn';
/** A request as the list and the get serve it (executive.requests, instants as ISO). */
export interface RequestRow {
  request_id: string; kind: RequestKind; request_key: string; request_digest: string; subject: Record<string, unknown>; instruction: string;
  delegate_principal_id: string | null; owner_principal_id: string | null; due_at: string | null; until_at: string | null;
  requester_principal_id: string; routed_to: string; routed_ref: string | null; state: RequestState; refusal: string | null;
  requested_at: string; fulfilled_at: string | null; fulfilled_by: string | null; withdrawn_at: string | null; correlation_id: string;
}
export interface RequestEvent { event: string; occurred_at: string; actor_principal_id: string; details: Record<string, unknown> }
/** A follow-up on a package's (or room's) agenda; `overdue` and `status` are the workflow route's reading against now — the get's effect row carries the stored columns only. */
export interface FollowUp {
  follow_up_id: string; request_id: string; package_id: string | null; room_id: string | null; instruction: string; owner_principal_id: string;
  due_at: string; state: 'open' | 'done' | 'withdrawn'; done_at: string | null; done_by: string | null; note: string | null; created_at: string;
  overdue?: boolean; status?: string;
}
/** The get: the row, its events and the in-write effect of its kind (a delegation, a suppression or a follow-up), or null where none was recorded. */
export interface RequestDetail extends RequestRow {
  effect: { delegation?: Record<string, unknown> | null; suppression?: Record<string, unknown> | null; follow_up?: FollowUp | null };
  events: RequestEvent[];
}
/** What the open route returns for the request: recorded (`repeated: false`) or the one already recorded under the key (`repeated: true`, no second effect). */
export interface OpenedRequest {
  request_id: string; repeated: boolean; kind: RequestKind; state: string; routed_to: string; routed_ref: string | null; requested_at: string;
  effect: Record<string, unknown>; request_digest: string;
}
/** The agent run an ANALYSIS request triggered, as the open route reports it (null for every other kind and for a repeat). */
export interface RequestRun {
  run_id: string; agent_id: string; outcome: string; stop_reason: string | null; refusals: unknown; escalated_to: unknown; fulfilment: Record<string, unknown>;
}
/** What is sent to open a request (the controller's validateRequest): the per-kind fields are the server's requirements, refused verbatim when missing. */
export type RequestIntake = {
  kind: RequestKind; request_key: string; subject: Record<string, unknown>; instruction: string;
  delegate?: string; owner?: string; due_at?: string; until?: string;
};

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null, purpose = 'decision'): Promise<ApiResult<T>> {
  const read = action.endsWith('.read') || action === 'report.render';
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: purpose, side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const decisions = {
  list: (s: Scope) => p<{ packages: Package[]; receipt: Receipt }>(s, '/decisions/list', 'decision.read', 'DPK'),
  get: (s: Scope, id: string) => p<{ package: Package; receipt: Receipt }>(s, `/decisions/${id}/get`, 'decision.read', 'DPK', {}, id),
  outcomes: (s: Scope, id: string) => p<{ outcomes: Array<Record<string, unknown>>; breaches: Array<Record<string, unknown>>; receipt: Receipt }>(s, `/decisions/${id}/outcomes/list`, 'decision.read', 'DPK', {}, id),
  replays: (s: Scope, id: string) => p<{ replays: Array<Record<string, unknown>>; receipt: Receipt }>(s, `/decisions/${id}/replays/list`, 'decision.read', 'DPK', {}, id),
  /** The package's workflow steps and, since 0066 §9, the follow-ups on its agenda (overdue read against now). */
  workflow: (s: Scope, id: string) => p<{ workflow: Array<Record<string, unknown>>; follow_ups: FollowUp[]; receipt: Receipt }>(s, `/workflow/${id}`, 'decision.read', 'DPK', {}, id),
  approve: (s: Scope, id: string, version: number, payload: { decision: 'approve' | 'reject'; versionDigest: string; rationale: string }) =>
    p<{ approval: Record<string, unknown>; receipt: Receipt }>(s, `/decisions/${id}/versions/${version}/approve`, 'decision.approve', 'APR', payload),
  /** The commit: the route pins C3 on the server; the envelope says what every write says. */
  commit: (s: Scope, id: string, version: number, versionDigest: string) =>
    p<{ commitment: Record<string, unknown>; receipt: Receipt }>(s, `/decisions/${id}/versions/${version}/commit`, 'decision.commit', 'CMT', { versionDigest }),
  dissent: (s: Scope, id: string, version: number, payload: { position: string; rationale: string }) =>
    p<{ dissent: Record<string, unknown>; receipt: Receipt }>(s, `/decisions/${id}/versions/${version}/dissent`, 'decision.dissent', 'DPK', payload, id),
  replay: (s: Scope, id: string, version: number, asOf: string | null) =>
    p<{ replay: Replay; receipt: Receipt }>(s, `/decisions/${id}/versions/${version}/replay`, 'decision.replay', 'RPL', asOf === null ? {} : { asOf }),
  monitor: (s: Scope, id: string) => p<{ monitoring: Record<string, unknown>; receipt: Receipt }>(s, `/decisions/${id}/monitor`, 'decision.monitor', 'DPK', {}, id),
  report: (s: Scope, id: string) => p<{ report: Record<string, unknown>; receipt: Receipt }>(s, `/reports/${id}/render`, 'report.render', 'DPK', {}, id),
  rooms: (s: Scope) => p<{ rooms: Room[]; receipt: Receipt }>(s, '/rooms/list', 'room.read', 'DRM'),
  room: (s: Scope, id: string) => p<{ room: Room; receipt: Receipt }>(s, `/rooms/${id}/get`, 'room.read', 'DRM', {}, id),
  review: (s: Scope, id: string, note: string) => p<{ review: Record<string, unknown>; receipt: Receipt }>(s, `/rooms/${id}/review`, 'decision.review', 'DRM', { note }, id),
  briefings: (s: Scope, roomId: string | null) => p<{ briefings: Array<Record<string, unknown>>; receipt: Receipt }>(s, '/briefings/list', 'briefing.read', 'BRF', { roomId }, null, 'briefing'),
  briefing: (s: Scope, id: string) => p<{ briefing: Briefing; receipt: Receipt }>(s, `/briefings/${id}/get`, 'briefing.read', 'BRF', {}, id, 'briefing'),
  compose: (s: Scope, roomId: string | null) => p<{ briefing: Briefing; receipt: Receipt }>(s, '/briefings/compose', 'briefing.compose', 'BRF', { roomId }, null, 'briefing'),
  agents: (s: Scope) => p<{ agents: Array<Record<string, unknown>>; runs: Array<Record<string, unknown>>; planner: Record<string, unknown>; receipt: Receipt }>(s, '/agents/decision/list', 'agent.read', 'AGT'),

  /** CP-6 B9 (0066 §9): the domain's typed requests, newest first; `state` and `kind` narrow the list when given. */
  requests: (s: Scope, filter: { state?: string | null; kind?: string | null } = {}) =>
    p<{ requests: RequestRow[]; receipt: Receipt }>(s, '/executive/requests/list', 'executive.request.read', 'EXR', { ...filter, limit: 200 }),
  request: (s: Scope, id: string) => p<{ request: RequestDetail; receipt: Receipt }>(s, `/executive/requests/${id}/get`, 'executive.request.read', 'EXR', {}, id),
  /**
   * Human-gated, exactly once on the requester's `request_key`. An ANALYSIS request runs the briefing agent under the agent's own
   * session and is made under the purpose `briefing`; every other kind is made under `decision`. The response carries the request as
   * recorded (or the one repeated under the key) and, for an analysis, the run that fulfilled it.
   */
  openRequest: (s: Scope, intake: RequestIntake) =>
    p<{ request: OpenedRequest; run: RequestRun | null; receipt: Receipt }>(s, '/executive/requests', 'executive.request', 'EXR', intake, null, intake.kind === 'analysis' ? 'briefing' : 'decision'),
  /** The responsible owner's act answered a ROUTED request: `routedRef` names that act (a uuid); the server binds it to the request's kind. */
  fulfilRequest: (s: Scope, id: string, routedRef: string, note: string | null) =>
    p<{ request: { request_id: string; kind: RequestKind; state: RequestState; routed_to: string; routed_ref: string }; receipt: Receipt }>(
      s, `/executive/requests/${id}/fulfil`, 'executive.request.fulfil', 'EXR', note === null ? { routed_ref: routedRef } : { routed_ref: routedRef, note }, id),
  /** The requester's: a routed request is withdrawn, an in-write effect reversed (`reversed` says which); an act already done stands and the server refuses. */
  withdrawRequest: (s: Scope, id: string, reason: string) =>
    p<{ request: { request_id: string; kind: RequestKind; state: RequestState; reversed: string | null }; receipt: Receipt }>(
      s, `/executive/requests/${id}/withdraw`, 'executive.request.withdraw', 'EXR', { reason }, id),
  /** A follow-up is completed by its owner or its requester with a note; `was_overdue` is the server's reading at completion. */
  completeFollowUp: (s: Scope, followUpId: string, note: string) =>
    p<{ follow_up: { follow_up_id: string; state: string; was_overdue: boolean }; receipt: Receipt }>(
      s, `/executive/follow-ups/${followUpId}/complete`, 'executive.follow_up.complete', 'EXR', { note }, followUpId),
};
