/**
 * The strategic planning client — CP-6 B36 part `planning` (0094 §P; F-P6-10; WS-16).
 *
 * Every response is returned VERBATIM (the Graph client's rule): the plan's state, an initiative's transitions, a milestone's state, a
 * variance's direction, a breach's kind and what it forecasts to impact, a sensitivity's statuses — rendered exactly as the server computed
 * them AS OF the instant the answer states. Money is a decimal STRING with its ISO-4217 code, never a float, and is passed back as such.
 * The transitions are the person's OWN acts: the screen offers the next act the state admits and names who holds it; the server refuses
 * anyone the policy or the port does not name.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

export type Horizon = '30d' | '90d' | '12m' | '36m';
export type InitiativeState = 'proposed' | 'aligned' | 'prioritised' | 'funded' | 'approved' | 'paused' | 'closed';
export type BreachKind = 'lost_linkage' | 'infeasible' | 'budget_over_authority' | 'conflicting_dependencies' | 'drift_without_review';
export type DependencyKind = 'finish_to_start' | 'shares_resource';

export interface PlanRow {
  plan_id: string; title: string; statement: string; horizon: Horizon; objective_ids: string[]; owner_principal_id: string;
  budget_currency: string; budget_total: Decimal; budget_authority: Decimal; classification: string; review_cadence_days: number; last_reviewed_at: string | null;
  state: 'open' | 'baselined' | 'closed'; current_version: number; digest: string; declared_by: string; declared_at: string; updated_at: string;
}
export interface Transition { transition: string; from: string | null; to: string; actor: string; actor_kind: 'human' | 'agent'; reason: string | null; at: string; details: Record<string, unknown> }
export interface MilestoneRow {
  milestone_id: string; initiative_id: string; plan_id: string; name: string; due_date: string; measure_id: string; measure_title?: string; target_value: Decimal; unit?: string; direction?: string;
  state: 'planned' | 'at_risk' | 'met' | 'missed' | 'cancelled'; declared_at: string;
}
export interface InitiativeRow {
  initiative_id: string; plan_id: string; objective_id: string; title: string; sponsor_principal_id: string; owner_principal_id: string; budget_share: Decimal; funded_amount: Decimal | null;
  priority: number | null; state: InitiativeState; proposed_by: string; proposed_by_kind: 'human' | 'agent'; proposed_at: string; approved_by: string | null; approved_at: string | null;
  approved_object_version: number | null; pause_reason: string | null; close_reason: string | null; version: number; digest: string;
  graph_status?: string; graph_version?: number; objectives?: Array<{ objective_id: string; title: string; status: string }>; transitions?: Transition[]; milestones?: MilestoneRow[];
}
export interface DependencyRow { dependency_id: string; from_initiative_id: string; to_initiative_id: string; from_title?: string; to_title?: string; kind: DependencyKind; rationale: string; state: string; declared_at: string }
export interface PlanMeasureRow { measure_id: string; quantity_key: string | null; title: string; objective_id: string; unit: string; direction: string; target_value: Decimal; target_date: string | null; definition_version: number; approval_state: string; last_value: Decimal | null; last_observed_at: string | null; bound_at: string }
export interface PlanRunRow { run_id: string; model_ref: string; outputs_digest: string; scenario_id: string | null; component: string; completed_at: string; attached_at: string }
export interface VersionRow { version_id: string; version: number; digest: string; note: string | null; baselined_by: string; baselined_at: string; signatures: Array<{ signature_id: string; signer: string; key_id: string; signed_at: string; bound_action: string }> }
export interface VarianceRow {
  variance_id: string; plan_id: string; initiative_id: string; initiative_title?: string; milestone_id: string; milestone?: string; measure_id: string; basis_kind: 'observation' | 'run'; basis_id: string; basis_digest: string | null; basis_date: string | null;
  observed_value: Decimal; target_value: Decimal; direction: string; variance: Decimal; adverse: boolean; owner_principal_id: string | null; routed_item_id: string | null; routing: Record<string, unknown>; raised_at: string;
}
export interface BreachRow {
  breach_id: string; plan_id: string; initiative_id: string | null; kind: BreachKind; cause_key: string; detail: string; forecast_impact: Record<string, unknown>;
  state: 'open' | 'acknowledged' | 'resolved'; opened_at: string; acknowledged_by: string | null; acknowledged_at: string | null; authorization_note: string | null; resolved_at: string | null; resolution: string | null;
}
export interface PlanView extends PlanRow {
  at: string; funded: Decimal; objectives: Array<{ objective_id: string; title: string; status: string; owner: string }>; initiatives: InitiativeRow[]; dependencies: DependencyRow[]; measures: PlanMeasureRow[];
  runs: PlanRunRow[]; versions: VersionRow[]; variances: VarianceRow[]; breaches: BreachRow[]; events: Array<{ event: string; subject_kind: string; subject_id: string; actor: string; at: string; details: Record<string, unknown> }>;
}
export interface SensitivityMilestone { milestone_id: string; name: string; initiative_id: string; initiative_title: string; due_date: string; measure_title: string; target_value: Decimal; unit: string; direction: string; quantity_key: string | null; value: Decimal | null; value_date: string | null; status: 'at_risk' | 'on_track' | 'unmapped' | 'no_value'; variance: string | null }
export interface Sensitivity {
  available: boolean; reason?: string; plan_id?: string; run_id?: string; model_ref?: string; outputs_digest?: string; scenario_id?: string | null; run_completed_at?: string; at?: string; attached?: boolean;
  milestones?: SensitivityMilestone[]; summary?: { at_risk: number; on_track: number; unmapped: number; no_value: number; line: string } | null;
}

/** Money and measured values: a decimal STRING from a row read (the list routes) or a JSON number from a jsonb answer (the view, the replay, the sensitivity) — never computed here beyond a comparison for the OVER AUTHORITY word. */
export type Decimal = string | number;

/* ───────────── what the screen says, in words (glyph + text, never colour alone) ───────────── */
export const STATE_LABEL: Record<InitiativeState, string> = {
  proposed: '○ proposed — awaiting the lead\'s alignment',
  aligned: '◔ aligned — objectives linked; awaiting prioritisation',
  prioritised: '◑ prioritised — awaiting funding within authority',
  funded: '◕ funded — awaiting a second named human\'s approval',
  approved: '● approved — bound by the next baseline',
  paused: '⏸ paused by the sponsor',
  closed: '■ closed by the sponsor',
};
/** The NEXT act each state admits and WHO holds it (the PDP's roles; the port asserts the person). */
export const NEXT_ACT: Record<InitiativeState, { act: 'align' | 'prioritise' | 'fund' | 'approve' | null; by: string }> = {
  proposed: { act: 'align', by: 'the strategy lead' },
  aligned: { act: 'prioritise', by: 'the strategy lead' },
  prioritised: { act: 'fund', by: 'the executive or the decision authority, within the plan\'s authority' },
  funded: { act: 'approve', by: 'the executive or the decision authority — never the proposer' },
  approved: { act: null, by: 'the executive baselines the plan (a signed version)' },
  paused: { act: null, by: 'the sponsor' },
  closed: { act: null, by: 'nobody — closed' },
};
export const BREACH_LABEL: Record<BreachKind, string> = {
  lost_linkage: '⚠ lost objective linkage — the objective is no longer active in the Strategy Graph',
  infeasible: '⚠ infeasible — a predecessor finishes after its successor must start',
  budget_over_authority: '⚠ budget over authority — the funded sum exceeds the ceiling (continuity: the ceiling change is recorded, never silently accepted)',
  conflicting_dependencies: '⚠ conflicting initiatives — declared in conflict in the Strategy Graph',
  drift_without_review: '⚠ drift without review — no review inside the cadence window',
};
export const MILESTONE_LABEL: Record<MilestoneRow['state'], string> = {
  planned: '○ planned', at_risk: '◍ at risk', met: '● met', missed: '✕ missed', cancelled: '— cancelled',
};
export const SENSITIVITY_LABEL: Record<SensitivityMilestone['status'], string> = {
  at_risk: '◍ at risk under this scenario', on_track: '● on track under this scenario', unmapped: '? measure not mapped to a run output key', no_value: '? no value at the milestone\'s date in this run',
};
/** The budget line: funded vs total vs authority, in the plan's currency, as strings — never computed into a percentage. */
export function budgetLine(p: { budget_currency: string; budget_total: Decimal; budget_authority: Decimal; funded: Decimal }): string {
  const over = Number(p.funded) > Number(p.budget_authority);
  return `${p.funded} ${p.budget_currency} funded · ${p.budget_total} ${p.budget_currency} planned · authority ${p.budget_authority} ${p.budget_currency}${over ? ' — OVER AUTHORITY' : ''}`;
}
/** A variance in words: the milestone, the observed vs target, the basis. Negative = adverse. */
export function varianceLine(v: Pick<VarianceRow, 'milestone' | 'observed_value' | 'target_value' | 'variance' | 'basis_kind' | 'direction'> & { unit?: string }): string {
  const basis = v.basis_kind === 'run' ? 'a scenario run' : 'the latest observation';
  return `${v.milestone ?? 'milestone'}: ${v.observed_value}${v.unit ? ` ${v.unit}` : ''} vs target ${v.target_value} (${v.direction.replace('_', ' ')}) — variance ${v.variance}, from ${basis}`;
}
/** A DATE renders as the day it names (no timezone shift). */
export function dayOf(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m === null ? v : m[1]!;
}
/** The number of decimals a money string carries is kept (never re-rounded); an integer is shown as is. */
export function money(v: Decimal | null | undefined, currency: string): string {
  return v === null || v === undefined ? '—' : `${v} ${currency}`;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/planning`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'executive',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: 'C2',
  }, payload);
}

export const planning = {
  list: (s: Scope, state?: string) => p<{ at: string; plans: PlanRow[]; receipt: Receipt }>(s, '/plans/list', 'executive.plan.read', 'PLN', state ? { state } : {}),
  get: (s: Scope, planId: string) => p<{ plan: PlanView; receipt: Receipt }>(s, `/plans/${planId}/get`, 'executive.plan.read', 'PLN', {}, planId),
  asOf: (s: Scope, planId: string, at: string | null) => p<{ replay: Record<string, unknown>; receipt: Receipt }>(s, `/plans/${planId}/as-of`, 'executive.plan.read', 'PLN', at ? { at } : {}, planId),
  sensitivity: (s: Scope, planId: string, runId: string) => p<{ sensitivity: Sensitivity; receipt: Receipt }>(s, `/plans/${planId}/sensitivity`, 'executive.plan.read', 'PLN', { runId }, planId),
  initiatives: (s: Scope, q: { planId?: string; objectiveId?: string }) => p<{ at: string; initiatives: InitiativeRow[]; receipt: Receipt }>(s, '/initiatives/list', 'executive.plan.read', 'INI', q),
  declare: (s: Scope, payload: { title: string; statement: string; horizon: Horizon; objectiveIds: string[]; currency: string; budgetTotal: string; budgetAuthority: string; classification?: string; reviewCadenceDays?: number }) =>
    p<{ plan: PlanRow; receipt: Receipt }>(s, '/plans/declare', 'executive.plan.declare', 'PLN', payload),
  setAuthority: (s: Scope, planId: string, authority: string, reason: string) => p<{ authority: Record<string, unknown>; receipt: Receipt }>(s, `/plans/${planId}/authority`, 'executive.plan.authority.set', 'PLN', { authority, reason }, planId),
  review: (s: Scope, planId: string, note: string) => p<{ review: Record<string, unknown>; receipt: Receipt }>(s, `/plans/${planId}/review`, 'executive.plan.review', 'PLN', { note }, planId),
  baseline: (s: Scope, planId: string, note: string) => p<{ baseline: Record<string, unknown>; receipt: Receipt }>(s, `/plans/${planId}/baseline`, 'executive.plan.baseline', 'PLN', note ? { note } : {}, planId),
  bindMeasure: (s: Scope, planId: string, measureId: string, quantityKey: string | null) => p<{ measure: Record<string, unknown>; receipt: Receipt }>(s, `/plans/${planId}/measures/bind`, 'executive.plan.measure.bind', 'PLN', { measureId, quantityKey }, planId),
  attachRun: (s: Scope, planId: string, runId: string) => p<{ run: Record<string, unknown>; receipt: Receipt }>(s, `/plans/${planId}/runs/attach`, 'executive.plan.run.attach', 'PLN', { runId }, planId),
  propose: (s: Scope, payload: { initiativeId: string; planId: string; objectiveId: string; sponsor: string; owner: string; budgetShare: string; rationale: string }) =>
    p<{ initiative: InitiativeRow; receipt: Receipt }>(s, '/initiatives/propose', 'executive.initiative.propose', 'INI', payload, payload.initiativeId),
  align: (s: Scope, id: string, objectiveIds: string[], rationale: string) => p<{ initiative: InitiativeRow; receipt: Receipt }>(s, `/initiatives/${id}/align`, 'executive.initiative.align', 'INI', { objectiveIds, rationale }, id),
  prioritise: (s: Scope, id: string, priority: number, rationale: string) => p<{ initiative: InitiativeRow; receipt: Receipt }>(s, `/initiatives/${id}/prioritise`, 'executive.initiative.prioritise', 'INI', { priority, rationale }, id),
  fund: (s: Scope, id: string, amount: string, rationale: string) => p<{ initiative: InitiativeRow; receipt: Receipt }>(s, `/initiatives/${id}/fund`, 'executive.initiative.fund', 'INI', { amount, rationale }, id),
  approve: (s: Scope, id: string, rationale: string) => p<{ initiative: InitiativeRow; receipt: Receipt }>(s, `/initiatives/${id}/approve`, 'executive.initiative.approve', 'INI', { rationale }, id),
  pause: (s: Scope, id: string, reason: string) => p<{ initiative: InitiativeRow; receipt: Receipt }>(s, `/initiatives/${id}/pause`, 'executive.initiative.pause', 'INI', { reason }, id),
  close: (s: Scope, id: string, reason: string) => p<{ initiative: InitiativeRow; receipt: Receipt }>(s, `/initiatives/${id}/close`, 'executive.initiative.close', 'INI', { reason }, id),
  setMilestone: (s: Scope, payload: { initiativeId: string; name: string; dueDate: string; measureId: string; targetValue: string }) =>
    p<{ milestone: MilestoneRow; receipt: Receipt }>(s, '/milestones/set', 'executive.plan.milestone.set', 'INI', payload, payload.initiativeId),
  declareDependency: (s: Scope, payload: { from: string; to: string; kind: DependencyKind; rationale: string }) =>
    p<{ dependency: DependencyRow; receipt: Receipt }>(s, '/dependencies/declare', 'executive.plan.dependency.declare', 'INI', payload, payload.from),
  acknowledgeBreach: (s: Scope, breachId: string, authorization: string) => p<{ breach: BreachRow; receipt: Receipt }>(s, `/breaches/${breachId}/acknowledge`, 'executive.plan.breach.acknowledge', 'PLN', { authorization }),
  cite: (s: Scope, packageId: string, initiativeId: string) => p<{ citation: Record<string, unknown>; receipt: Receipt }>(s, `/packages/${packageId}/cite`, 'executive.plan.initiative.cite', 'DEC', { initiativeId }, packageId),
};
