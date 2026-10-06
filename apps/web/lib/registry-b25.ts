/**
 * CP-6 B25 §MR (0108) client — THE GOVERNED MODEL REGISTRY, THE TARGETS, THE HORIZON POLICY, THE PLAN AND THE ROUTED ISSUE (F-P4-01). Every
 * act goes through the governed envelope; the server decides (the named steward, the separation of duties, the policy's validation
 * requirement) and the screen shows its answer verbatim. The pure helpers below are unit-tested (registry-b25.test.ts): what a forecast's
 * validation claim IS (software capability · synthetic demonstration · empirical validation — never conflated) and the words of a plan.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };
type Row = Record<string, unknown>;

export type ForecastKind = 'quantity' | 'event' | 'state' | 'regime';
export interface RegistryMethod {
  method_id: string | null; method_ref: string; method_key: string; version: number; family: string; forecast_kinds: ForecastKind[]; horizons: string[];
  implementation_ref: string; implementation_digest: string; parameters: Row; declarations: Row; description: string; state: string; state_reason: string | null;
  steward_principal_id: string | null; builtin: boolean; proposed_by: string | null; decided_by: string | null;
}
export interface RegistryTarget { target_id: string; target_key: string; version: number; kind: ForecastKind; unit: string; title: string; definition: Row; sources: Row; risk_class: string; state: string;
  declared_by: string; decided_by: string | null }
export interface HorizonPolicy { policy_id: string; risk_class: string; version: number; rules: Record<string, Row>; statement: string; state: string; steward_principal_id: string; published_by: string;
  concurred_by: string | null }
export interface MethodValidation { validation_id: string; method_ref: string; series_key: string; horizon_code: string; kind: string; mode: string; origins: number; min_origins: number; passed: boolean;
  verdict: string; synthetic: boolean; window_from: string; window_to: string; metrics: Row; computed_at: string }
export interface Route { route_id: string; target_key: string | null; series_key: string | null; horizon_code: string; outcome: 'planned' | 'refused' | 'issued'; refusal: string | null; refusal_class: string | null;
  method_ref: string | null; forecast_id: string; requested_at: string }
export interface PlanMethod { method_ref: string; family: string; available: boolean; unavailable_reason: string | null; confidence_language: string; validation: Row }
export interface Plan { target_key: string | null; series_key: string; forecast_kind: ForecastKind; horizon: string; confidence_language: string; treatment: string | null; validation_required: boolean;
  policy: { policy_id: string | null; version: number | null; risk_class: string; legacy?: boolean }; methods: PlanMethod[]; refusal: string | null; refusal_class: string | null }
export interface RegistryView { at: string; methods: RegistryMethod[]; targets: RegistryTarget[]; policies: HorizonPolicy[]; validations: MethodValidation[]; routes: Route[]; events: Row[]; receipt: Receipt }
export interface RoutedForecast { forecastId: string; method_ref: string; family: string; forecast_kind: ForecastKind; validation_state: string; validation_note: string; statement: string;
  quantiles: Row; distribution?: Row; outcome?: Row; confidence_language?: string; target_at: string }

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'prediction', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const registry = {
  read: (s: Scope) => p<RegistryView>(s, '/registry/read', 'prediction.registry.read', 'FMR'),
  plan: (s: Scope, payload: { targetKey?: string; seriesKey?: string; horizon: string; knownAt?: string; observedThrough?: string }) =>
    p<{ plan: Plan; receipt: Receipt }>(s, '/registry/plan', 'prediction.registry.plan.read', 'FMR', payload),
  propose: (s: Scope, payload: Row) => p<{ method: Row; receipt: Receipt }>(s, '/registry/methods/propose', 'prediction.registry.method.propose', 'FMR', payload),
  /** The NAMED steward only — a named human, never the proposer (human-gated; the port names the steward). */
  decide: (s: Scope, methodId: string, decision: 'approve' | 'reject', note: string) =>
    p<{ method: Row; receipt: Receipt }>(s, `/registry/methods/${methodId}/decide`, 'prediction.registry.method.approve', 'FMR', { decision, note }, methodId),
  retire: (s: Scope, methodRef: string, reason: string) => p<{ method: Row; receipt: Receipt }>(s, '/registry/methods/retire', 'prediction.registry.method.retire', 'FMR', { methodRef, reason }),
  quarantine: (s: Scope, methodRef: string, reason: string) => p<{ method: Row; receipt: Receipt }>(s, '/registry/methods/quarantine', 'prediction.registry.method.quarantine', 'FMR', { methodRef, reason }),
  reinstate: (s: Scope, methodRef: string, note: string) => p<{ method: Row; receipt: Receipt }>(s, '/registry/methods/reinstate', 'prediction.registry.method.reinstate', 'FMR', { methodRef, note }),
  declareTarget: (s: Scope, payload: Row) => p<{ target: Row; receipt: Receipt }>(s, '/registry/targets/declare', 'prediction.registry.target.declare', 'FTG', payload),
  decideTarget: (s: Scope, targetId: string, decision: 'approve' | 'reject', note: string) =>
    p<{ target: Row; receipt: Receipt }>(s, `/registry/targets/${targetId}/decide`, 'prediction.registry.target.approve', 'FTG', { decision, note }, targetId),
  publishPolicy: (s: Scope, payload: Row) => p<{ policy: Row; receipt: Receipt }>(s, '/registry/policies/publish', 'prediction.registry.policy.publish', 'HZP', payload),
  concur: (s: Scope, policyId: string, decision: 'concur' | 'reject', note: string) =>
    p<{ policy: Row; receipt: Receipt }>(s, `/registry/policies/${policyId}/concur`, 'prediction.registry.policy.concur', 'HZP', { decision, note }, policyId),
  validate: (s: Scope, payload: Row) => p<{ validation: Row; receipt: Receipt }>(s, '/registry/validations/run', 'prediction.registry.validation.record', 'MVL', payload),
  /** THE ROUTED ISSUE: refused (with the governed refusal and the plan) when the policy does not support the horizon. */
  issue: (s: Scope, payload: Row) => p<{ forecast: RoutedForecast; plan: Plan; receipt: Receipt }>(s, '/portfolio/issue', 'prediction.portfolio.issue', 'FCT', payload),
};

/* ───────────── pure helpers (unit-tested) ───────────── */

/** WHICH CLAIM a forecast's validation makes — the three are never conflated. */
export function validationClaim(state: string, note: string): { claim: 'empirical validation' | 'synthetic demonstration' | 'scenario language' | 'no validation claimed'; text: string } {
  if (state === 'scenario_language') return { claim: 'scenario language', text: 'SCENARIO LANGUAGE — no empirical validation is claimed or implied' };
  if (state === 'validated' || state === 'validated_retrospective') {
    if (/SYNTHETIC/.test(note)) return { claim: 'synthetic demonstration', text: 'SYNTHETIC DEMONSTRATION of the validation machinery — not empirical validation' };
    return { claim: 'empirical validation', text: state === 'validated' ? 'VALIDATED on historical knowledge' : 'VALIDATED RETROSPECTIVELY (one evidence vintage)' };
  }
  if (state === 'validation_impossible') return { claim: 'no validation claimed', text: 'VALIDATION IMPOSSIBLE on this history — no accuracy is claimed' };
  return { claim: 'no validation claimed', text: 'UNVALIDATED — the numbers are unscored' };
}

/** The words of a confidence language. */
export function languageLabel(language: string): string {
  switch (language) {
    case 'probability': return 'a probability within the window (with its credible band)';
    case 'distribution': return 'a distribution (10–50–90)';
    case 'distribution_with_scenarios': return 'a distribution, read beside scenarios';
    case 'scenario_language': return 'scenario / regime language — never presented as validated';
    default: return language;
  }
}

/** One line per planned method: available, or why not (the disclosure §EN carries too). */
export function planLines(plan: Plan): string[] {
  if (plan.refusal !== null) return [plan.refusal];
  return plan.methods.map((m) => `${m.method_ref} (${m.family}) — ${m.available ? `available, ${languageLabel(m.confidence_language)}` : `UNAVAILABLE: ${m.unavailable_reason ?? 'no reason given'}`}`);
}

/** A routed forecast's headline: the probability, the band, or the categories — never more precise than the server sent. */
export function headline(f: RoutedForecast): string {
  const d = (f.distribution ?? {}) as Row;
  if (Array.isArray(d['categories'])) return (d['categories'] as Array<{ label: string; probability: number }>).map((c) => `${c.label} ${c.probability.toFixed(2)}`).join(' · ');
  const q = f.quantiles as { q10?: number; q50?: number; q90?: number };
  if (f.forecast_kind === 'event' && typeof d['probability'] === 'number') return `P = ${(d['probability'] as number).toFixed(3)} (80% band ${q.q10?.toFixed(3)}–${q.q90?.toFixed(3)})`;
  return q.q50 === undefined ? '—' : `median ${q.q50} (10–90: ${q.q10}–${q.q90})`;
}
