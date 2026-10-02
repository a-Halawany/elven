/**
 * The Strategy Graph's alignment client — CP-6 B32 (0089 §G; F-P6-09: PR-37-001..006, CAP-DS-08, AT-37, PER-09).
 *
 * Every response is returned VERBATIM (the Graph client's rule): the gap view's criteria, reasons and holds, a detection's continuity
 * and whom it is routed to, a measure's freshness — rendered exactly as the server computed them AS OF the instant the answer states.
 * Two rules are the server's and the screen only shows them: the alignment claim is a COUNT of criteria each with its basis (never a
 * weighted score — nothing ranked hides a missing component), and every authority act (set an objective, approve a measure or a
 * trade-off, allocate a resource) is a named human's on the DIGEST of the version read — this screen passes the digest it showed.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type Continuity = 'hold' | 'expose_affected_scope' | 'route_to_owner';
export type AuthorityAct = 'set_objective' | 'approve_measure' | 'approve_tradeoff' | 'allocate_resource';
export type AlignmentKind = 'supports' | 'builds' | 'resources' | 'measures' | 'affects' | 'conflicts_with';

export interface Criterion { criterion: string; met: boolean; basis: string }
export interface GapRow {
  objective_id: string; objective_title: string; objective_owner: string; objective_subject: { kind: 'strategy'; version: number; digest: string };
  objective_set: { set: boolean; act_id: string | null; decision: string | null; expires_at: string | null };
  capability_id: string | null; capability_title: string | null; alignment_id: string | null; strength: string | null;
  evidence_count: number; strongest_truth: string | null; evidence: Array<{ kind: string; id: string; version: number | null; truth_state: string | null; counted: boolean }>;
  initiatives: Array<{ initiative_id: string; title: string; status: string; resourced: boolean; resources: Array<Record<string, unknown>> }>;
  initiatives_active: number; initiatives_resourced: number;
  measures: Array<{ measure_id: string; title: string; approved: boolean; approval_state: string; state: string; age_days: number | string | null; freshness_days: number | string }>;
  criteria: Criterion[]; criteria_met: number; criteria_total: number; gap_reasons: string[];
  held_by: Array<{ kind: string; key: string; continuity: Continuity }>; alignment_claim: 'supported' | 'gap' | 'held';
}
export interface Gaps { at: string; rule: string | null; rows: GapRow[]; summary: { rows: number; by_claim: Record<string, number>; by_reason: Record<string, number> } }
export interface Detection {
  detection_kind: 'conflict' | 'cycle' | 'missing_owner' | 'stale_measure'; detection_key: string; state: 'open' | 'resolved'; subject_ids: string[];
  subjects: Array<{ id: string; type: string; title: string; status: string; owner: string; owner_active_human: boolean }> | null;
  detail: string; continuity: Continuity; continuity_detail: string; affected_ids: string[]; routed_to: string[];
  path: Array<{ id: string; type: string; title: string }> | null; resolved_by: string | null;
}
export interface MeasureRow {
  measure_id: string; title: string; status: string; objective_ids: string[]; unit: string; direction: string; target_value: number | string; target_date: string | null;
  freshness_days: number | string; definition_version: number; definition_digest: string; approval_state: string; approved_now: boolean; approval_act_id: string | null;
  last_value: number | string | null; last_observed_at: string | null; observations: number; age_days: number | string | null; state: 'fresh' | 'stale' | 'no_observation';
  subject: { kind: 'measure'; version: number; digest: string };
}
export interface AlignmentRow {
  alignment_id: string; kind: AlignmentKind; from_id: string; from_type: string; to_id: string; to_type: string; strength: string; digest: string; state: string;
  evidence: Array<{ kind: string; id: string; version: number }>; rationale: string; declared_by: string; declared_at: string; acts: Array<Record<string, unknown>>;
}

/* ───────────── what the screen says, in words (glyph + text, never colour alone) ───────────── */
export const CONTINUITY_LABEL: Record<Continuity, string> = {
  hold: '⏸ held — no health or alignment claim is made over these objects until a person resolves it',
  expose_affected_scope: '◐ affected scope exposed — the objectives it bears on are named; the input is shown stale, never current',
  route_to_owner: '→ routed to the planning review — an owner is assigned before any authority act',
};
export const CLAIM_LABEL: Record<GapRow['alignment_claim'], string> = {
  supported: '● supported — every criterion met',
  gap: '○ gap — see the unmet criteria',
  held: '⏸ held — a detection holds this row; no claim is made',
};
export const REASON_LABEL: Record<string, string> = {
  objective_not_set: 'the objective version is not set by a human authority',
  no_capability: 'no capability supports the objective',
  capability_under_evidenced: 'the capability is under-evidenced',
  no_active_initiative: 'no active initiative builds the capability',
  initiative_unresourced: 'no allocation approved by a human authority resources an initiative',
  no_measure: 'no measure measures the objective',
  measure_unapproved: 'no measure definition is approved',
  measure_stale: 'the approved measure is stale',
  held_by_detection: 'a detection holds this row',
};
export const CRITERION_LABEL: Record<string, string> = {
  objective_set: 'objective set', capability_evidenced: 'capability evidenced', initiative_active: 'initiative active',
  initiative_resourced: 'initiative resourced', measure_current: 'measure current',
};
/** The count in words — met of total, each criterion with its glyph; never a percentage, never a weighted number. */
export function criteriaLine(r: Pick<GapRow, 'criteria' | 'criteria_met' | 'criteria_total'>): string {
  return `${r.criteria_met} of ${r.criteria_total} · ${r.criteria.map((c) => `${c.met ? '●' : '○'} ${CRITERION_LABEL[c.criterion] ?? c.criterion}`).join(' · ')}`;
}
/** A measure's freshness in words, with the age where there is one. */
export function freshnessLine(m: { state: string; age_days: number | string | null; freshness_days: number | string }): string {
  if (m.state === 'no_observation') return `? never observed — window ${String(m.freshness_days)} day(s)`;
  const age = m.age_days === null ? '' : `${String(m.age_days)} d old, `;
  return m.state === 'stale' ? `◍ stale — ${age}window ${String(m.freshness_days)} day(s)` : `● fresh — ${age}window ${String(m.freshness_days)} day(s)`;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/graph`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'graph',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}

export const alignment = {
  gaps: (s: Scope, objectiveId?: string, at?: string) =>
    p<{ gaps: Gaps; receipt: Receipt }>(s, '/strategy/gaps', 'graph.strategy.alignment.read', 'OBJ', { ...(objectiveId ? { objectiveId } : {}), ...(at ? { at } : {}) }, objectiveId ?? null),
  detections: (s: Scope, at?: string) =>
    p<{ detections: { at: string; detections: Detection[]; counts: { open: number; resolved: number; open_by_kind: Record<string, number> } }; receipt: Receipt }>(
      s, '/strategy/detections', 'graph.strategy.alignment.read', 'OBJ', at ? { at } : {}),
  measures: (s: Scope, at?: string) => p<{ at: string; measures: MeasureRow[]; receipt: Receipt }>(s, '/strategy/measures/list', 'graph.strategy.alignment.read', 'MSR', at ? { at } : {}),
  list: (s: Scope, includeRetired = false) => p<{ alignments: AlignmentRow[]; receipt: Receipt }>(s, '/strategy/alignments/list', 'graph.strategy.alignment.read', 'ALN', { includeRetired }),
  declare: (s: Scope, payload: { kind: AlignmentKind; from: string; to: string; strength: 'weak' | 'moderate' | 'strong'; rationale: string; evidence?: Array<{ kind: 'claim' | 'evidence'; id: string }> }) =>
    p<{ alignment: Record<string, unknown>; receipt: Receipt }>(s, '/strategy/alignments/declare', 'graph.alignment.declare', 'ALN', payload),
  retire: (s: Scope, id: string, reason: string) => p<{ alignment: Record<string, unknown>; receipt: Receipt }>(s, `/strategy/alignments/${id}/retire`, 'graph.alignment.retire', 'ALN', { reason }, id),
  defineMeasure: (s: Scope, id: string, payload: { objectiveId: string; unit: string; direction: 'higher_better' | 'lower_better'; targetValue: number; targetDate?: string | null; freshnessDays: number }) =>
    p<{ measure: Record<string, unknown>; receipt: Receipt }>(s, `/strategy/measures/${id}/define`, 'graph.measure.define', 'MSR', payload, id),
  observe: (s: Scope, id: string, payload: { value: number; observedAt: string; source: { kind: 'claim' | 'evidence'; id: string }; note?: string }) =>
    p<{ observation: Record<string, unknown>; receipt: Receipt }>(s, `/strategy/measures/${id}/observe`, 'graph.measure.observe', 'MSR', payload, id),
  /** The authority act on the digest the screen SHOWED (the subject's `digest`); a stale digest is refused by the server. */
  act: (s: Scope, subjectId: string, payload: { actKind: AuthorityAct; subjectDigest: string; decision: 'approve' | 'reject'; rationale: string; expiresAt: string }) =>
    p<{ act: Record<string, unknown>; receipt: Receipt }>(s, `/strategy/${subjectId}/authority`, 'graph.strategy.authority.act', payload.actKind === 'approve_measure' ? 'MSR' : payload.actKind === 'set_objective' ? 'OBJ' : 'ALN', payload, subjectId),
  assignOwner: (s: Scope, objectId: string, ownerPrincipalId: string, reason: string) =>
    p<{ owner: Record<string, unknown>; receipt: Receipt }>(s, `/strategy/${objectId}/owner`, 'graph.strategy.owner.assign', 'OBJ', { ownerPrincipalId, reason }, objectId),
};

/* ───────────────────────── B36 (0094 §S) strategy: revocable acts, the scheduled detections, the plan links ───────────────────────── */
export type RaisedDetectionKind = 'stale_measure' | 'gamed_measure' | 'lost_linkage' | 'owner_missing';
export interface RaisedDetection {
  detection_id: string; kind: RaisedDetectionKind | string; subject_id: string; subject_type: string; measure_id: string | null; cause_key: string; detail: string;
  owner_principal_id: string | null; routed_item_id: string | null; routing: { state?: string; outcome?: string; route_roles?: string[]; policy_version?: number | null; due_at?: string | null }; raised_at: string; raised_by: string;
}
export interface AuthorityActRow { act_id: string; act_kind: AuthorityAct; subject_kind: string; subject_id: string; subject_version: number; decision: string; rationale: string; approver_principal_id: string; expires_at: string; recorded_at: string; revoked_at: string | null; revoked_by: string | null; revocation_reason: string | null }
export interface PlanLinks { available: boolean; reason?: string; initiatives: Array<Record<string, unknown>> }
export const RAISED_KIND_LABEL: Record<RaisedDetectionKind, string> = {
  stale_measure: '◍ stale measure — the input is shown stale, never current; the owner refreshes it',
  gamed_measure: '⚠ gamed measure — an owner edit inside the window before a favourable score change',
  lost_linkage: '⊘ lost linkage — an approved measure measures no active objective',
  owner_missing: '→ owner missing — routed to the planning review to assign one',
};
/** An act's standing in words: in force until, lapsed at, or REVOKED (when, by whom, why). */
export function actStanding(a: Pick<AuthorityActRow, 'decision' | 'expires_at' | 'revoked_at' | 'revoked_by' | 'revocation_reason'>, now: Date = new Date()): string {
  if (a.revoked_at !== null) return `✕ REVOKED at ${a.revoked_at} by ${(a.revoked_by ?? '?').slice(0, 8)}… — ${a.revocation_reason ?? ''}`;
  if (new Date(a.expires_at).getTime() <= now.getTime()) return `○ lapsed at ${a.expires_at}`;
  return a.decision === 'approve' ? `● in force until ${a.expires_at}` : `○ rejected (until ${a.expires_at})`;
}
/** A raised detection in words: the kind, the routing the schedule gave it, whom. */
export function raisedLine(d: Pick<RaisedDetection, 'kind' | 'routing' | 'owner_principal_id' | 'routed_item_id'>): string {
  const kind = RAISED_KIND_LABEL[d.kind as RaisedDetectionKind] ?? d.kind;
  const state = d.routing.state ?? 'unrouted';
  const who = d.owner_principal_id === null ? `the roles ${(d.routing.route_roles ?? []).join(', ') || 'nobody'}` : `${d.owner_principal_id.slice(0, 8)}… and the roles ${(d.routing.route_roles ?? []).join(', ') || '—'}`;
  return `${kind} · routed ${state} to ${who}${d.routed_item_id === null ? '' : ` · item ${d.routed_item_id.slice(0, 8)}…`}`;
}
export const strategyCompletion = {
  /** Revoke an authority act (human-gated): its issuer or a domain administrator; a lapsed act is refused by the server. */
  revoke: (s: Scope, actId: string, reason: string) => p<{ revocation: Record<string, unknown>; receipt: Receipt }>(s, `/strategy/authority/${actId}/revoke`, 'graph.strategy.authority.revoke', 'ALN', { reason: reason.trim() }, actId),
  acts: (s: Scope, subjectId?: string) => p<{ acts: AuthorityActRow[]; receipt: Receipt }>(s, '/strategy/authority/list', 'graph.strategy.alignment.read', 'OBJ', subjectId ? { subjectId } : {}, subjectId ?? null),
  raised: (s: Scope, kind?: string) => p<{ detections: RaisedDetection[]; receipt: Receipt }>(s, '/strategy/detections/list', 'graph.strategy.alignment.read', 'OBJ', kind ? { kind, limit: 200 } : { limit: 200 }),
  planLinks: (s: Scope, objectiveId?: string) => p<{ links: PlanLinks; receipt: Receipt }>(s, '/strategy/plans/links', 'graph.strategy.alignment.read', 'OBJ', objectiveId ? { objectiveId } : {}, objectiveId ?? null),
};
