/**
 * Phase 5 client — twins and simulations. Every read and write goes through the
 * governed envelope; the screens show what the record says, never a state
 * derived on the client. Simulated values are SYNTHETIC and are shown as such.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

export interface Citation { kind: 'evidence' | 'claim' | 'entity' | 'forecast' | 'assumption' | 'run'; id: string; version: number; digest: string }
export interface Element {
  element_id: string; key: string; kind: 'observed' | 'estimated' | 'assumed' | 'predicted' | 'simulated'; basis_truth_state: string | null;
  value: unknown; unit: string | null; material: boolean; citations: Citation[]; health: 'complete' | 'incomplete' | 'unreadable' | 'stale';
  valid_from: string | null; valid_to: string | null; confidence: number | null; synthetic_state: boolean; version: number;
  /** A PREDICTED element carries its forecast's validation state, exactly. */
  inherited_validation?: string | null;
}
export interface TwinVersion {
  version: number; branch_id: string; forked_from_version: number | null; supersedes: number | null; state: 'draft' | 'admitted';
  known_at: string; observed_through: string | null; state_set_digest: string | null; element_count: number; completeness: 'complete' | 'incomplete';
  missing_keys: string[]; synthetic_state: boolean; verification_state: 'verified' | 'unverified'; admitted_at: string | null; elements?: Element[];
}
export interface Twin {
  twin_id: string; kind: string; title: string; statement: string; boundary: string[]; owner_principal_id: string; behaviour_model_ref: string;
  validation: { status: string; envelope?: Record<string, unknown>; limitations: string[] }; synthetic_state: boolean; declared_at: string;
  versions: TwinVersion[]; events?: Array<Record<string, unknown>>; reconciliations?: Array<Record<string, unknown>>;
  propagation_pending?: Array<{ case_id: string; kind: string; state: string; propagation_state: string; propagation: string; reached_via?: string }>;
}
export interface Run {
  run_id: string; twin_id: string; twin_version: number; branch_id: string; run_kind: 'control' | 'intervention'; control_run_id: string | null;
  shock: boolean; component: string; known_at: string; observed_through: string | null; initial_state_digest: string; model_ref: string;
  /** The scenario binding the run applied — the exact SCN version and the branch's state at opening — and what the shock rests on. */
  scenario_id: string | null; scenario_branch_id: string | null; scenario_version: number | null; scenario_branch_state: 'open' | 'flipped' | 'closed' | null;
  shock_basis: 'none' | 'hypothetical' | 'scenario-branch-flipped' | 'unrecorded';
  implementation_digest: string; environment_digest: string; stochastic_mode: 'deterministic' | 'seeded'; rng: string | null; seed: number | null; samples: number | null;
  interventions: Array<Record<string, unknown>>; inputs_digest: string; outputs: { totals?: Totals; days?: Array<Record<string, unknown>> } | null;
  outputs_digest: string | null; sensitivity: { factors?: Array<{ key: string; cost_spread: string }>; outside_envelope?: boolean } | null;
  validation_status: string; outside_envelope: boolean; state: 'opened' | 'completed' | 'failed'; failure: string | null; opened_at: string; completed_at: string | null;
  events?: Array<Record<string, unknown>>; reproductions?: Array<{ verdict: string; reason: string; cold_process: boolean; environment_matches: boolean; reproduced_at: string }>;
}
export interface Totals { line_stop_days: number; days_below_safety_stock: number; min_on_hand: string; first_line_stop_date: string | null; cost: { reroute: string; air: string; line_stop: string; total: string } }

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/twins`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: objectType === 'SIM' ? 'simulation' : 'twin', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const twins = {
  list: (s: Scope) => p<{ twins: Twin[]; receipt: Receipt }>(s, '/list', 'twin.read', 'TWN'),
  get: (s: Scope, id: string) => p<{ twin: Twin; receipt: Receipt }>(s, `/${id}/get`, 'twin.read', 'TWN', {}, id),
  compare: (s: Scope, id: string, a: number, b: number) => p<{ comparison: Record<string, unknown>; receipt: Receipt }>(s, `/${id}/compare`, 'twin.read', 'TWN', { a, b }, id),
  behaviourModels: (s: Scope) => p<{ models: Array<Record<string, unknown>>; kinds: Array<Record<string, unknown>>; receipt: Receipt }>(s, '/behaviour-models/list', 'twin.read', 'TWN'),
  runs: (s: Scope, twinId: string | null) => p<{ runs: Run[]; receipt: Receipt }>(s, '/simulations/list', 'simulation.read', 'SIM', twinId ? { twinId } : {}),
  run: (s: Scope, id: string) => p<{ run: Run; receipt: Receipt }>(s, `/simulations/${id}/get`, 'simulation.read', 'SIM', {}, id),
  simulate: (s: Scope, payload: Record<string, unknown>) => p<{ run: { runId: string; outputsDigest: string; totals: Totals; state: string }; receipt: Receipt }>(s, '/simulations/run', 'simulation.run', 'SIM', payload),
  /** No attestation travels with the request: the product establishes availability and executes the stored contract in a separate process itself. */
  reproduce: (s: Scope, id: string) => p<{ reproduction: { verdict: string; expected: string; actual: string | null; reason: string; environmentMatches: boolean; coldProcess: boolean; unavailable: string[] }; receipt: Receipt }>(s, `/simulations/${id}/reproduce`, 'simulation.reproduce', 'SIM', {}, id),
  compareRuns: (s: Scope, runIds: string[]) => p<{ comparison: { control_run_id: string; runs: Array<{ run_id: string; run_kind: string; interventions: Array<Record<string, unknown>>; totals: Totals; carrying: string[] }>; synthetic: boolean }; receipt: Receipt }>(s, '/simulations/compare', 'simulation.read', 'SIM', { runIds }),
};
