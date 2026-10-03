/**
 * The envelope client — CP-6 B30 part `envelope` (0103 §EN; F-P5-04).
 *
 * Every response is returned VERBATIM: a run outside its model's operating envelope with its DECISION USE (refused: outside_envelope —
 * the behaviour is disabled for decision use), its EXPLORATORY admission (a twin owner's only) and the method steward's CONCURRENCE (the
 * raised threshold before a promotion); a model's CALIBRATION on a twin (MAE, MAPE, bias over n pairs, the drift state against the declared
 * tolerance); the behaviour models' STEWARDSHIP (proposed → approved → deprecated → retired, compatibility per twin kind); the AI CONTEXT
 * of a twin version. The acts are a named person's own; the server refuses anyone else. The helpers below only word what the record says.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type DriftState = 'stable' | 'drifting' | 'insufficient';
export type LifecycleState = 'proposed' | 'approved' | 'deprecated' | 'retired';
export interface UseReason { class: string; detail: string }
export interface DecisionUse {
  run_id: string; use: 'decision' | 'diagnostic' | 'refused'; label: string; reasons: UseReason[];
  exploratory?: boolean; exploratory_admission?: { admission_id: string; admitted_by: string; admitted_at: string; reason: string; concurred_by: string | null; concurred_at: string | null } | null;
  retired_at?: string; retire_reason?: string;
}
export interface Admission {
  admission_id: string; run_id: string; twin_id: string; twin_version: number; model_ref: string; keys: Array<{ key: string; value: number; range: [number, number] }>;
  reason: string; admitted_by: string; admitted_at: string; concurred_by: string | null; concurred_at: string | null; concurrence_note: string | null;
}
export interface EnvelopeRun {
  run_id: string; twin_id: string; twin_title: string; twin_owner?: string; twin_version: number; run_kind: string; state: string; validity: string; model_ref: string; model_state?: string;
  envelope_state: string; envelope_check: Row | null; envelope_ack: Row | null; operator_principal_id: string; promotion_id: string | null; promoted_for: string | null;
  retired_at: string | null; admission: Admission | null; decision_use: DecisionUse;
}
export interface CalibrationPair { source: 'reconciliation' | 'element' | 'run'; predicted: number; observed: number; error: number; from: string; against: string }
export interface Calibration {
  calibration_id: string; model_ref: string; twin_id?: string; twin_title?: string; key: string; seq: number; n: number; mae: number | null; mape: number | null; bias: number | null;
  tolerance: { mape?: number; mae?: number; min_n: number }; drift_state: DriftState; prior_state?: DriftState | null; pairs?: CalibrationPair[]; calibrated_at: string;
}
export interface CalibrationRead { twin_id: string; latest: Calibration[]; models: Array<{ model_ref: string; keys: number; pairs: number; fitness: DriftState }>; history: Calibration[]; rule: Row }
export interface ModelRow {
  method_ref: string; name: string; version: number; family: string; operating_envelope: Record<string, unknown>; validation_notes: string; pinned: boolean;
  state: LifecycleState; implicit: boolean; steward: string | null; proposed_by: string | null; approved_by: string | null; reason: string | null;
  compatibility: Record<string, { compatible: boolean; note: string; declared_by: string; declared_at: string }>; lifecycle_version: number | null; updated_at: string | null;
  calibrations: Calibration[]; runs: number;
}
export interface EnvelopeEvent { event_id: string; event: string; twin_id: string | null; run_id: string | null; method_ref: string | null; actor_principal_id: string; details: Row; occurred_at: string }
export interface AiContext {
  twin_id: string; title: string; kind: string; version: number; branch_id: string; state: string; verification_state: string; fitness_state: string; synthetic_state: boolean; as_of: string;
  cutoffs: { known_at: string; observed_through: string | null; record_age_days: number; observation_age_days: number | null };
  model: { model_ref: string; family: string; lifecycle_state: string; compatibility: Row | null };
  envelope: { declared: Record<string, unknown>; check: { state: string; keys: Record<string, { range: [number, number]; value: number | null; source: string | null; verdict: string }> }; rule: string };
  stale_variables: Array<{ key: string; kind: string; health: string; valid_to: string | null; reason: string }>;
  sensitivity: { analysis_id: string; run_id: string; metric: string; factors: Row[]; robustness_verdict: string } | null;
  fitness: { version_fitness: string; validation: Row | null; calibrations: Calibration[] };
  runs: Array<{ run_id: string; run_kind: string; envelope_state: string; use: string; label: string; exploratory: boolean }>;
  served_state: Row | null; freshness: Row | null; instructions: string[];
}

/* ───────────── the words ───────────── */
/** A drift state as a glyph, a token and words — never colour alone. */
export function driftMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'stable': return { glyph: '●', token: '--eye-color-success', text: 'STABLE' };
    case 'drifting': return { glyph: '⚑', token: '--eye-color-critical', text: 'DRIFTING' };
    case 'insufficient': return { glyph: '◌', token: '--eye-color-uncertain', text: 'INSUFFICIENT EVIDENCE' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: state.toUpperCase() };
  }
}
/** A lifecycle state as a glyph, a token and words; a model with no recorded stewardship reads approved (in use before B30). */
export function lifecycleMark(state: string, implicit = false): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'approved': return { glyph: '●', token: '--eye-color-success', text: implicit ? 'APPROVED (in use before its stewardship was recorded)' : 'APPROVED' };
    case 'proposed': return { glyph: '◐', token: '--eye-color-uncertain', text: 'PROPOSED — runs are marked' };
    case 'deprecated': return { glyph: '◐', token: '--eye-color-warning', text: 'DEPRECATED — runs are marked' };
    case 'retired': return { glyph: '⚑', token: '--eye-color-critical', text: 'RETIRED — runs are refused' };
    default: return { glyph: '?', token: '--eye-color-ink-muted', text: state.toUpperCase() };
  }
}
/** The lifecycle steps a steward may take from a state (the port's rule, restated for the form; the server decides). */
export function nextStates(state: LifecycleState): LifecycleState[] {
  switch (state) {
    case 'proposed': return ['approved', 'retired'];
    case 'approved': return ['deprecated'];
    case 'deprecated': return ['approved', 'retired'];
    case 'retired': return ['proposed'];
  }
}
const num = (v: number | null | undefined, dp = 3): string => (v === null || v === undefined ? '—' : Number(v).toFixed(dp).replace(/\.?0+$/, ''));
/** A calibration in one line: n, MAE, MAPE (as %), bias, the tolerance and the drift state. */
export function calibrationLine(c: Pick<Calibration, 'n' | 'mae' | 'mape' | 'bias' | 'tolerance' | 'drift_state'>): string {
  const tol = c.tolerance.mape !== undefined ? `MAPE ≤ ${num(c.tolerance.mape * 100, 1)} %` : `MAE ≤ ${num(c.tolerance.mae)}`;
  if (c.n === 0) return `no pair yet — ${driftMark(c.drift_state).text} (tolerance ${tol}, at least ${c.tolerance.min_n} pairs)`;
  return `${c.n} pair(s): MAE ${num(c.mae)}, MAPE ${c.mape === null ? '—' : `${num(c.mape * 100, 1)} %`}, bias ${num(c.bias)} — ${driftMark(c.drift_state).text} (tolerance ${tol}, at least ${c.tolerance.min_n} pairs)`;
}
/** A run's envelope verdict in words: disabled, exploratory (awaiting concurrence or concurred), or not outside. */
export function exploratoryLine(r: Pick<EnvelopeRun, 'envelope_state' | 'admission'>): string {
  if (r.envelope_state !== 'outside') return `the run reads ${r.envelope_state.toUpperCase()} against its envelope`;
  if (r.admission === null) return 'OUTSIDE THE ENVELOPE — the behaviour is DISABLED for decision use; only a twin owner may admit it as exploratory';
  if (r.admission.concurred_at === null) return 'EXPLORATORY — admitted by a twin owner; awaiting a method steward’s concurrence before any promotion; never decision-grade';
  return 'EXPLORATORY — admitted by a twin owner and concurred by a method steward; promotable for an exploratory use; never decision-grade';
}
/** The outside keys of a recorded envelope check, "key = value outside [lo, hi]". */
export function outsideKeys(check: Row | null | undefined): string[] {
  const keys = (check?.['keys'] ?? {}) as Record<string, { range?: unknown[]; value?: unknown; verdict?: string }>;
  return Object.entries(keys).filter(([, x]) => x?.verdict === 'outside').map(([k, x]) => `${k} = ${String(x.value)} outside [${String(x.range?.[0])}, ${String(x.range?.[1])}]`).sort();
}
/** A tolerance from the form: "mape" with a percentage, or "mae" with an absolute; minN optional. */
export function toleranceOf(metric: 'mape' | 'mae', value: string, minN: string): { mape?: number; mae?: number; minN?: number } | { problem: string } {
  const v = Number(value);
  if (value.trim() === '' || !Number.isFinite(v) || v <= 0) return { problem: 'the tolerance is a positive number' };
  const out: { mape?: number; mae?: number; minN?: number } = metric === 'mape' ? { mape: v / 100 } : { mae: v };
  if (minN.trim() !== '') {
    const n = Number(minN);
    if (!Number.isInteger(n) || n < 2 || n > 1000) return { problem: 'the minimum number of pairs is an integer from 2 to 1000' };
    out.minN = n;
  }
  return out;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/twin-envelope`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: objectType === 'SIM' ? 'simulation' : 'twin', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const envelope = {
  runs: (s: Scope, twinId?: string) => p<{ at: string; runs: EnvelopeRun[]; receipt: Receipt }>(s, '/runs/list', 'twin.read', 'SIM', twinId === undefined ? {} : { twinId }),
  run: (s: Scope, runId: string) => p<{ run: EnvelopeRun; receipt: Receipt }>(s, `/runs/${runId}/read`, 'twin.read', 'SIM', {}, runId),
  admit: (s: Scope, runId: string, reason: string) => p<{ admission: Admission & { decision_use: DecisionUse }; receipt: Receipt }>(s, `/runs/${runId}/admit`, 'twin.envelope.admit', 'SIM', { reason }, runId),
  concur: (s: Scope, runId: string, note: string) => p<{ concurrence: Row & { decision_use: DecisionUse }; receipt: Receipt }>(s, `/runs/${runId}/concur`, 'twin.envelope.concur', 'SIM', { note }, runId),
  calibrate: (s: Scope, payload: { twinId: string; modelRef: string; key: string; tolerance: { mape?: number; mae?: number; minN?: number } }) =>
    p<{ calibration: Calibration & { pairs: CalibrationPair[] }; receipt: Receipt }>(s, '/calibrations/run', 'twin.calibration.run', 'TWN', payload as unknown as Row, payload.twinId),
  calibrations: (s: Scope, twinId: string, modelRef?: string) => p<{ calibrations: CalibrationRead; receipt: Receipt }>(s, '/calibrations/read', 'twin.read', 'TWN', { twinId, ...(modelRef ? { modelRef } : {}) }, twinId),
  models: (s: Scope) => p<{ at: string; models: ModelRow[]; events: EnvelopeEvent[]; receipt: Receipt }>(s, '/models/list', 'twin.read', 'TWN'),
  setState: (s: Scope, payload: { modelRef: string; state: LifecycleState; reason: string }) => p<{ lifecycle: Row; receipt: Receipt }>(s, '/models/state', 'twin.model.lifecycle', 'TWN', payload),
  compatibility: (s: Scope, payload: { modelRef: string; kind: string; compatible: boolean; note: string }) => p<{ lifecycle: Row; receipt: Receipt }>(s, '/models/compatibility', 'twin.model.lifecycle', 'TWN', payload),
  aiContext: (s: Scope, twinId: string, version?: number) => p<{ context: AiContext; receipt: Receipt }>(s, '/ai-context', 'twin.ai_context.read', 'TWN', version === undefined ? { twinId } : { twinId, version }, twinId),
};
