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
