/**
 * The simulation validity client — CP-6 B31 part `validity` (0099 §V; F-P5-09; the B31 pieces of F-P4-07/-09).
 *
 * Every response is returned VERBATIM: a run's DECISION USE (decision | diagnostic | refused) with the server's reasons and label, a
 * comparison's verdict, a package's options with each cited run's validity (the option citing an invalidated run MARKED), the domain's
 * decision-use policy, the reach of a twin correction (runs, packages, commitments, evaluation results, the owners tasked), a branch's twin
 * binding, the sensitivity to the branch's material assumptions. The acts are a named person's own (set the policy, identify a reach, bind or
 * retire a branch's binding); the server refuses anyone else. The helpers below only word what the record says.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type DecisionUse = 'decision' | 'diagnostic' | 'refused';
export interface UseReason { class: string; detail: string }
export interface RunUse {
  run_id: string; use: DecisionUse; state: string; validity: string; fitness_state: string; promotion_id: string | null; promoted_for: string | null;
  reasons: UseReason[]; label: string; partial: Row | null; invalidated_at: string | null; invalidation: Row | null;
}
export interface RunRow {
  run_id: string; twin_id: string; twin_version: number; run_kind: string; state: string; validity: string; fitness_state: string; promoted_for: string | null;
  scenario_id: string | null; scenario_branch_id: string | null; opened_at: string; completed_at: string | null; decision_use: RunUse;
}
export interface Verdict { decision_grade: boolean; counts: Record<DecisionUse, number>; diagnostic: string[]; refused: string[]; label: string }
export interface CitedRun { run_id: string; validity: string; state: string; use: DecisionUse; label: string; reasons: UseReason[]; invalidated_at: string | null; invalidation: Row | null }
export interface PackageOption { option_id: string; key: string; title: string; kind: string; recommended: boolean; runs: CitedRun[]; marked: 'input_invalidated' | 'input_refused' | 'diagnostic_only' | null; refused_on_next_derivation: boolean }
export interface PackageValidity {
  package_id: string; title: string; owner_principal_id: string; state: string; current_version: number | null; committed_version: number | null;
  versions: Array<{ version: number; state: string; recommended_option: string | null; options: PackageOption[] }>;
  input_invalidated: boolean; policy: { version: number; require_decision_use: boolean; set_by: string; set_at: string } | null;
}
export interface Policy { policy_id: string; version: number; require_decision_use: boolean; rationale: string; set_by: string; set_at: string }
export interface Reach {
  reach_id: string; twin_id: string; twin_version: number; trigger: string; cause_event_id: string | null; runs: Row[]; packages: Row[]; commitments: Row[];
  evaluation_results: { outcomes: Row[]; twin_validations: Row[] }; items: Row[]; identified_by: string; identified_at: string;
}
export interface Binding {
  binding_id: string; scenario_id: string; branch_id: string; version: number; twin_id: string; twin_version: number; initial_state_digest: string;
  initial_conditions: Array<{ key: string; value: unknown; unit: string | null }>; constraint_set_id: string | null; constraint_set_version: number | null;
  assumption_factors: Array<{ assumption_id: string; factor_key: string; note: string | null }>; rationale: string; state: string; bound_by: string; bound_at: string;
  ended_by: string | null; ended_at: string | null; end_reason: string | null;
}
export interface BindingView { branch: Row & { name: string; state: string }; active: Binding | null; history: Binding[]; runs: Array<Row & { run_id: string; from_bound_state: boolean }> }
export interface AssumptionSensitivity {
  run_id: string; source: 'analysis' | 'run'; factors: Row[];
  assumptions: Array<{ assumption_id: string; title: string; verification_state: string; condition_met: boolean; factor_key: string | null; rank: number | null; material: boolean | null; measured: boolean; note: string }>;
  material: string[]; unmeasured: string[];
}

/* ───────────── the words ───────────── */
/** A decision use as a glyph, a token and words — never colour alone. */
export function useMark(use: string): { glyph: string; token: string; text: string } {
  switch (use) {
    case 'decision': return { glyph: '●', token: '--eye-color-success', text: 'DECISION-GRADE' };
    case 'diagnostic': return { glyph: '◐', token: '--eye-color-uncertain', text: 'DIAGNOSTIC ONLY' };
    case 'refused': return { glyph: '⚑', token: '--eye-color-critical', text: 'REFUSED FOR DECISION' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: use.toUpperCase() };
  }
}
/** An option's mark in words (null: the option's runs are all decision-grade). */
export function optionMarkLine(marked: string | null, refusedNext: boolean): string {
  switch (marked) {
    case 'input_invalidated': return `INPUT INVALIDATED — a cited run was invalidated${refusedNext ? '; the option is refused at its next derivation (set, carry, proposal)' : ''}`;
    case 'input_refused': return 'INPUT REFUSED — a cited run has no result a decision may rest on';
    case 'diagnostic_only': return 'DIAGNOSTIC ONLY — a cited run is partial, unpromoted or disputed';
    default: return 'every cited run is decision-grade';
  }
}
/** The reasons in one line ("class: detail; …"). */
export function reasonsLine(reasons: UseReason[]): string {
  return reasons.length === 0 ? 'no reason stands against decision use' : reasons.map((r) => `${r.class.replace(/_/g, ' ')}: ${r.detail}`).join('; ');
}
/** "key=value" lines → initial conditions (a value parsed as JSON when it parses, else the text; a bare key takes the bound state's value). */
export function conditionsOf(text: string): Array<{ key: string; value?: unknown }> {
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '').map((l) => {
    const i = l.indexOf('=');
    if (i < 0) return { key: l };
    const key = l.slice(0, i).trim(); const raw = l.slice(i + 1).trim();
    try { return { key, value: JSON.parse(raw) as unknown }; } catch { return { key, value: raw }; }
  });
}
/** "assumptionId=factorKey" lines → the assumption → factor map. */
export function factorsOf(text: string): Array<{ assumptionId: string; factorKey: string }> {
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '' && l.includes('=')).map((l) => {
    const i = l.indexOf('=');
    return { assumptionId: l.slice(0, i).trim(), factorKey: l.slice(i + 1).trim() };
  });
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/simulations/validity`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: objectType === 'DPK' ? 'decision' : 'simulation', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const validity = {
  runs: (s: Scope, filter: { twinId?: string; branchId?: string } = {}) => p<{ at: string; runs: RunRow[]; receipt: Receipt }>(s, '/runs/list', 'simulation.validity.read', 'SIM', filter),
  use: (s: Scope, runId: string) => p<{ use: RunUse; assumptionSensitivity: AssumptionSensitivity | null; receipt: Receipt }>(s, `/runs/${runId}/use`, 'simulation.validity.read', 'SIM', {}, runId),
  compare: (s: Scope, runIds: string[]) => p<{ runs: RunUse[]; verdict: Verdict; receipt: Receipt }>(s, '/compare', 'simulation.validity.read', 'SIM', { runIds }),
  packageValidity: (s: Scope, packageId: string) => p<{ package: PackageValidity; receipt: Receipt }>(s, `/packages/${packageId}`, 'simulation.validity.read', 'DPK', {}, packageId),
  policy: (s: Scope) => p<{ current: Policy | null; history: Policy[]; receipt: Receipt }>(s, '/policy/read', 'simulation.validity.read', 'SIM'),
  setPolicy: (s: Scope, payload: { require: boolean; rationale: string; expectedVersion: number | null }) => p<{ policy: Policy; receipt: Receipt }>(s, '/policy', 'simulation.validity.policy', 'SIM', payload),
  reaches: (s: Scope, filter: { twinId?: string; version?: number } = {}) => p<{ reaches: Reach[]; now: Row | null; receipt: Receipt }>(s, '/reach/list', 'simulation.validity.read', 'TWN', filter, filter.twinId ?? null),
  identifyReach: (s: Scope, twinId: string, version: number) => p<{ reach: Reach; receipt: Receipt }>(s, '/reach/identify', 'simulation.validity.reach', 'TWN', { twinId, version }, twinId),
  binding: (s: Scope, branchId: string) => p<{ binding: BindingView; receipt: Receipt }>(s, `/branches/${branchId}/binding`, 'simulation.validity.read', 'BRN', {}, branchId),
  bind: (s: Scope, branchId: string, payload: { twinId: string; twinVersion: number; initialConditions: Array<{ key: string; value?: unknown }>; constraintSetId?: string | null;
    assumptionFactors?: Array<{ assumptionId: string; factorKey: string }>; rationale: string; expectedVersion?: number | null }) =>
    p<{ binding: Binding; receipt: Receipt }>(s, `/branches/${branchId}/bind`, 'simulation.validity.bind', 'BRN', payload as unknown as Row, branchId),
  retire: (s: Scope, branchId: string, reason: string) => p<{ binding: Binding; receipt: Receipt }>(s, `/branches/${branchId}/retire`, 'simulation.validity.bind', 'BRN', { reason }, branchId),
};
