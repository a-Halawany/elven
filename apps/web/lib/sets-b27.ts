/**
 * The scenario sets client — CP-6 B27 part `sets` (0097 §S; F-P4-08: the set and its plurality check before a recommendation (ADR-012),
 * the side-by-side comparator (CAP-DS-02), the portfolio review, living scenarios, creation triggers).
 *
 * Every response is returned VERBATIM: a set's state, version, members and checks; the comparator's branches (live and not live, with the
 * reason); the plurality verdict with the missing kinds; a review's payoffs with the ROBUSTNESS and REGRET the server computed; the
 * relevance scores; the proposals. The helpers below only WORD what the record says — nothing here counts a branch, judges plurality or
 * computes a regret. The acts are the person's own; the server refuses anyone the policy or the port does not name.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type SetState = 'draft' | 'active' | 'retired';
export type ProposalKind = 'forecast_shift' | 'weak_signal' | 'risk' | 'planning_cycle';
export type ProposalState = 'open' | 'accepted' | 'dismissed';

export interface PluralityPolicy { require: string[]; min_branches: number; min_adverse: number }
export interface Finding { rule: string; outcome: 'fail' | 'note'; detail: string; kind?: string; branches?: Array<{ branch_id: string; name: string; kind: string; state: string; reason: string | null }> }
export interface Plurality {
  passed: boolean; missing_kinds: string[]; live_branches: number; adverse_branches: number; kinds_present: string[]; findings: Finding[]; policy: PluralityPolicy; set_version?: number;
}
export interface SetRow {
  set_id: string; title: string; purpose: string; owner_principal_id: string; package_id: string | null; plurality_policy: PluralityPolicy; state: SetState; version: number;
  last_check_id: string | null; last_check_outcome: 'passed' | 'failed' | null; declared_by: string; declared_at: string; activated_at: string | null; retired_at: string | null; retirement_reason: string | null;
  members?: number | MemberRow[]; bindings?: number | BindingRow[];
}
export interface MemberRow {
  member_id: string; set_id: string; scenario_id: string; branch_id: string | null; added_by: string; added_at: string; added_in_version: number;
  removed_by: string | null; removed_at: string | null; removal_reason: string | null; removed_in_version: number | null;
  scenario_title: string; scenario_state: string; branch_name: string | null; branch_kind: string | null;
}
export interface CheckRow {
  check_id: string; set_id: string; set_version: number; trigger: string; outcome: 'passed' | 'failed'; missing_kinds: string[]; live_branches: number; adverse_branches: number;
  kinds_present: string[]; findings: Finding[]; policy: PluralityPolicy; as_of: string; checked_by: string; item_id: string | null;
}
export interface BindingRow { binding_id: string; package_id: string; package_title: string | null; package_state: string | null; current_version: number | null; bound_by: string; bound_at: string }
export interface ReviewRow {
  review_id: string; set_id: string; set_version: number; package_id: string | null; package_version: number | null; reviewer: string;
  members: Array<{ member_id: string; scenario_id: string; branch_id: string | null; relevance: string; consequence: string; note: string | null }>;
  branches: Array<{ branch_id: string; scenario_id: string; name: string; kind: string; kind_label: string | null }>;
  options: Array<{ key: string; title: string; source: 'package' | 'named' }>; payoffs: Record<string, Record<string, number>>;
  robustness: Record<string, number>; regret: Record<string, number>; most_robust: string[]; least_regret: string[]; missing_kinds: string[]; plurality: Plurality;
  retirements_proposed: Array<{ scenario_id: string; note: string; owner: string; act: string }>; payoff_unit: string; note: string; reviewed_at: string;
}
export interface SetView extends SetRow {
  members: MemberRow[]; checks: CheckRow[]; bindings: BindingRow[]; reviews: ReviewRow[];
  events: Array<{ event: string; set_version: number; actor: string; details: Row; occurred_at: string }>;
}
export interface IndicatorView {
  indicator_id: string; series_key: string; comparator: string; threshold: number; consecutive_days: number; last_value: number | null; last_observation_at: string | null;
  last_evaluated_at: string | null; streak: number; breached: boolean; breached_at: string | null; state: string; next_review_at: string | null; age_days: number | null; freshness: 'fresh' | 'stale' | 'missing';
}
export interface CompareBranch {
  branch_id: string; scenario_id: string; scenario_title: string; scenario_state: string; scenario_version: number | null; coherence_state: string | null;
  name: string; kind: string; kind_label: string | null; state: string; live: boolean; not_counted_reason: string | null; suspended_at: string | null; suspension_reason: string | null;
  statement: string; divergence: string | null; assumptions: Array<{ statement: string; basis?: string | null }> | null; signpost: string | null; consequence: string; consequence_class: string | null;
  owner_principal_id: string; added_in_version: number | null; indicator: IndicatorView | null; elements: Row[] | Row | null; probability: Row | null;
}
export interface Comparison { set: SetRow; as_of: string; plurality: Plurality; anatomy_available: boolean; probability_available: boolean; stale_after_days: number; branches: CompareBranch[] }
export interface RelevanceRow {
  scenario_id: string; title: string; owner_principal_id: string;
  latest: { relevance_id: string; score: number; basis: { rule: string; movement: number; signposts_breached: number; review_due: boolean; branches: Row[] }; trigger: string; scored_at: string } | null;
  signposts_notified: Array<{ branch_id: string; breached_at: string; item_id: string; at: string }>;
}
export interface ProposalRow {
  proposal_id: string; kind: ProposalKind; source_ref: Row; source_key: string; source_facts: Row; related_scenario_id: string | null; title: string; rationale: string;
  proposed_by: string; proposed_kind: 'human' | 'agent'; proposed_at: string; state: ProposalState; resolved_by: string | null; resolved_at: string | null; resolution_note: string | null; item_id: string | null;
}

/* ───────────── the words ───────────── */
/** A set's state as a glyph, a token and words — never colour alone. */
export function setStateMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'draft': return { glyph: '◌', token: '--eye-color-ink-muted', text: 'DRAFT — members are gathered; the owner activates it' };
    case 'active': return { glyph: '●', token: '--eye-color-success', text: 'ACTIVE — checked for plurality; it can gate a recommendation' };
    case 'retired': return { glyph: '—', token: '--eye-color-ink-muted', text: 'RETIRED — kept as recorded; it gates nothing' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() || 'UNKNOWN' };
  }
}
/** The plurality verdict in words: PLURAL, or NOT PLURAL naming the missing kinds (as the server listed them) and the failing rules. */
export function pluralityLine(p: Pick<Plurality, 'passed' | 'missing_kinds' | 'live_branches' | 'adverse_branches' | 'findings'>): string {
  if (p.passed) return `PLURAL — ${p.live_branches} live branch(es), ${p.adverse_branches} adverse`;
  const missing = p.missing_kinds.length > 0 ? `missing ${p.missing_kinds.join(', ')}` : null;
  const other = p.findings.filter((f) => f.outcome === 'fail' && f.rule !== 'required_kind').map((f) => f.detail);
  return `NOT PLURAL — ${[missing, ...other].filter((x) => x !== null && x !== '').join('; ')} (${p.live_branches} live branch(es) counted)`;
}
/** The policy in words. */
export function policyLine(p: PluralityPolicy): string {
  const req = p.require.length === 0 ? 'no kind required' : `requires ${p.require.join(', ')}`;
  return `${req} · at least ${p.min_branches} live branch(es) · at least ${p.min_adverse} adverse`;
}
/** A branch's state in the comparator: LIVE, or NOT COUNTED with the server's reason (a suspended branch shows why). */
export function branchStateLine(b: Pick<CompareBranch, 'state' | 'live' | 'not_counted_reason'>): string {
  return b.live ? `${b.state.toUpperCase()} — counted` : `${b.state.toUpperCase()} — not counted${b.not_counted_reason ? `: ${b.not_counted_reason}` : ''}`;
}
/** The indicator's freshness in words (the server's freshness and age; never recomputed). */
export function freshnessLine(i: IndicatorView | null, staleAfterDays: number): string {
  if (i === null) return 'no indicator (a baseline)';
  if (i.freshness === 'missing') return `MISSING — ${i.series_key} has no observation`;
  const age = i.age_days === null ? '' : ` — last observation ${i.last_observation_at} (${i.age_days} day(s) ago)`;
  return `${i.freshness === 'stale' ? `STALE (older than ${staleAfterDays} days)` : 'fresh'}${age}${i.breached ? ' · BREACHED' : ` · streak ${i.streak}/${i.consecutive_days}`}`;
}
/** A payoff cell's words: the server's payoff; the best in its branch marked. */
export function payoffCell(v: number | undefined, bestInBranch: number | undefined): string {
  if (v === undefined) return '—';
  return v === bestInBranch ? `${v} ★` : String(v);
}
/** The review's verdict in words: the most robust and least-regret options as the server named them. */
export function reviewVerdictLine(r: Pick<ReviewRow, 'most_robust' | 'least_regret' | 'robustness' | 'regret' | 'payoff_unit'>): string {
  const rob = r.most_robust.map((k) => `${k} (worst ${r.robustness[k]} ${r.payoff_unit})`).join(', ');
  const reg = r.least_regret.map((k) => `${k} (max regret ${r.regret[k]} ${r.payoff_unit})`).join(', ');
  return `most robust: ${rob} · least regret: ${reg}`;
}
/** A proposal's source in words (the facts the server validated). */
export function proposalSourceLine(p: Pick<ProposalRow, 'kind' | 'source_facts'>): string {
  const f = p.source_facts;
  switch (p.kind) {
    case 'forecast_shift': return `forecast ${String(f['forecast_id']).slice(0, 8)}… median ${String(f['prior_q50'])} → ${String(f['q50'])} (shift ${String(f['shift'])}, band ${String(f['band_pct'])})`;
    case 'weak_signal': return `weak signal "${String(f['title'])}" — escalated ${String(f['disposition_at'] ?? '')}`;
    case 'risk': return `exposure "${String(f['title'])}" — accepted; residual ${String(f['residual_high'])} ${String(f['unit'] ?? '')} above the appetite ${String(f['threshold'])}`;
    case 'planning_cycle': return `cadence ${String(f['cadence_id']).slice(0, 8)}… ${String(f['reset'])} at ${String(f['reset_at'])}`;
    default: return JSON.stringify(f);
  }
}
/** A proposal's state in words: who acts next. */
export function proposalStateLine(p: Pick<ProposalRow, 'state' | 'resolution_note'>): string {
  if (p.state === 'open') return 'OPEN — a strategy owner (not the proposer) accepts or dismisses it; accepting declares nothing';
  return `${p.state.toUpperCase()}${p.resolution_note ? ` — ${p.resolution_note}` : ''}`;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction/scenarios/sets`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'prediction',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}
const READ = 'prediction.scenario.set.read';

export interface DeclareSet { title: string; purpose: string; ownerPrincipalId?: string; policy: Partial<PluralityPolicy>; packageId?: string | null }
export interface ReviewPayload {
  members: Array<{ member_id: string; relevance: 'low' | 'medium' | 'high'; consequence: string; note?: string }>;
  options?: Array<{ key: string; title: string }> | null; payoffs: Record<string, Record<string, number>>; unit: string; retirements?: Array<{ scenario_id: string; note: string }>; note: string;
}

export const sets = {
  list: (s: Scope, state?: SetState) => p<{ at: string; sets: SetRow[]; receipt: Receipt }>(s, '/list', READ, 'SCS', state ? { state } : {}),
  read: (s: Scope, id: string) => p<{ at: string; set: SetView; relevance: RelevanceRow[]; receipt: Receipt }>(s, `/${id}/read`, READ, 'SCS', {}, id),
  compare: (s: Scope, id: string) => p<{ comparison: Comparison; receipt: Receipt }>(s, `/${id}/compare`, READ, 'SCS', {}, id),
  declare: (s: Scope, payload: DeclareSet) => p<{ set: SetRow; receipt: Receipt }>(s, '/declare', 'prediction.scenario.set.declare', 'SCS', payload as unknown as Row),
  addMember: (s: Scope, id: string, scenarioId: string, branchId: string | null) => p<{ membership: { set: SetRow; member: MemberRow; check: Row | null }; receipt: Receipt }>(s, `/${id}/members/add`, 'prediction.scenario.set.member', 'SCS', { scenarioId, branchId }, id),
  removeMember: (s: Scope, id: string, memberId: string, reason: string) => p<{ membership: { set: SetRow; member: MemberRow; check: Row | null }; receipt: Receipt }>(s, `/${id}/members/${memberId}/remove`, 'prediction.scenario.set.member', 'SCS', { reason }, id),
  activate: (s: Scope, id: string) => p<{ transition: { set: SetRow; check: Row | null }; receipt: Receipt }>(s, `/${id}/activate`, 'prediction.scenario.set.activate', 'SCS', {}, id),
  retire: (s: Scope, id: string, reason: string) => p<{ transition: { set: SetRow; check: Row | null }; receipt: Receipt }>(s, `/${id}/retire`, 'prediction.scenario.set.retire', 'SCS', { reason }, id),
  check: (s: Scope, id: string) => p<{ check: Plurality & { check_id: string; outcome: 'passed' | 'failed'; new_gap: boolean; item_id: string | null; gap_items_closed: number }; receipt: Receipt }>(s, `/${id}/check`, 'prediction.scenario.set.check', 'SCS', {}, id),
  bind: (s: Scope, id: string, packageId: string) => p<{ binding: { binding_id: string; package_id: string; check: Row }; receipt: Receipt }>(s, `/${id}/bind`, 'prediction.scenario.set.bind', 'SCS', { packageId }, id),
  review: (s: Scope, id: string, payload: ReviewPayload) => p<{ review: ReviewRow; receipt: Receipt }>(s, `/${id}/review`, 'prediction.scenario.set.review', 'SCS', payload as unknown as Row, id),
  score: (s: Scope) => p<{ relevance: { scored: number; changed: number; signposts_notified: number }; receipt: Receipt }>(s, '/relevance/score', 'prediction.scenario.relevance.score', 'SCN'),
  proposals: (s: Scope, state?: ProposalState) => p<{ at: string; proposals: ProposalRow[]; receipt: Receipt }>(s, '/proposals/list', READ, 'SCP', state ? { state } : {}),
  propose: (s: Scope, payload: { kind: ProposalKind; source: Row; title: string; rationale: string }) => p<{ proposal: ProposalRow; receipt: Receipt }>(s, '/proposals/propose', 'prediction.scenario.proposal.propose', 'SCP', payload as unknown as Row),
  resolve: (s: Scope, id: string, resolution: 'accepted' | 'dismissed', note: string) => p<{ proposal: ProposalRow; receipt: Receipt }>(s, `/proposals/${id}/resolve`, 'prediction.scenario.proposal.resolve', 'SCP', { resolution, note }, id),
};
