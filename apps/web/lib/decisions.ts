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
export interface Choice { option_key: string; rationale: string; decision_deadline: string; accepted_trade_offs: string[]; action_owner: string; outcome_criteria: Array<{ key: string; quantity: string; unit: string; target: number; comparator: string; by: string; observed_on: string }> }
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
  watermark: { prior_briefing_id: string | null; prior_composed_at: string | null; known_at: string }; sources: string[]; items: BriefingItem[]; windows: BriefingWindow[];
  source_states: Array<{ source_key: string; name: string; acquisition_mode: string; state: string; reason: string }>; degraded: boolean; narrative: string | null; narrative_cites: string[]; content_digest: string; composed_at: string;
}

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
  workflow: (s: Scope, id: string) => p<{ workflow: Array<Record<string, unknown>>; receipt: Receipt }>(s, `/workflow/${id}`, 'decision.read', 'DPK', {}, id),
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
  rooms: (s: Scope) => p<{ rooms: Room[]; receipt: Receipt }>(s, '/rooms/list', 'room.read', 'ROOM'),
  room: (s: Scope, id: string) => p<{ room: Room; receipt: Receipt }>(s, `/rooms/${id}/get`, 'room.read', 'ROOM', {}, id),
  review: (s: Scope, id: string, note: string) => p<{ review: Record<string, unknown>; receipt: Receipt }>(s, `/rooms/${id}/review`, 'decision.review', 'ROOM', { note }, id),
  briefings: (s: Scope, roomId: string | null) => p<{ briefings: Array<Record<string, unknown>>; receipt: Receipt }>(s, '/briefings/list', 'briefing.read', 'BRF', { roomId }, null, 'briefing'),
  briefing: (s: Scope, id: string) => p<{ briefing: Briefing; receipt: Receipt }>(s, `/briefings/${id}/get`, 'briefing.read', 'BRF', {}, id, 'briefing'),
  compose: (s: Scope, roomId: string | null) => p<{ briefing: Briefing; receipt: Receipt }>(s, '/briefings/compose', 'briefing.compose', 'BRF', { roomId }, null, 'briefing'),
  agents: (s: Scope) => p<{ agents: Array<Record<string, unknown>>; runs: Array<Record<string, unknown>>; planner: Record<string, unknown>; receipt: Receipt }>(s, '/agents/decision/list', 'agent.read', 'AGT'),
};
