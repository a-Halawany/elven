/**
 * The impact-analysis client — CP-6 B31 part `impact` (0099 §I; F-P5-07: the sensitivity analysis with its robustness and the timing of
 * the dated interventions (the tornado), the second-order, distributional and timing effects over the twin links, the value of
 * information, a run's frequency stated as a probability only through an approved map).
 *
 * Every response is returned VERBATIM: an analysis's factors, ranks and robustness verdict; the effects per percentile with their
 * timing; the EVPI, EVSI, delay cost and recommendation the PORT computed from the governed probabilities; the map's band. The helpers
 * below only LAY OUT and WORD what the record says (the tornado's bar geometry from the recorded deltas) — nothing here ranks a factor,
 * derives an effect, weighs a future or converts a frequency. Every figure is SYNTHETIC: the output of a declared model on a declared state.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;

export interface Factor {
  key: string; field: string; kind: 'parameter' | 'timing'; element_kind: string | null; base_value: number | string;
  low: { value: number | string; metric: number }; high: { value: number | string; metric: number };
  delta_low: number; delta_high: number; swing: number; rank: number; outside_envelope: boolean;
}
export interface Robustness { verdict: 'stable' | 'unstable' | 'not_assessed'; samples?: number; jitter?: Record<string, number>; ranks?: Record<string, string[]>; stable?: string[]; unstable?: Array<{ key: string; ranks: Record<string, number> }>; basis?: string }
export interface Analysis {
  analysis_id: string; run_id: string; run_outputs_digest: string; model_ref: string; method: 'one_at_a_time'; metric: string; relative: number | string; base_value: number | string;
  factors: Factor[]; seeds: number[] | null; robustness: Robustness; robustness_verdict: Robustness['verdict']; timing_shift_days: number | null; digest: string;
  synthetic_state: boolean; requested_by: string; analysed_at: string;
}
export interface Effect {
  effect_id?: string; derivation_id?: string; depth: number; entity_twin_id: string; entity_label: string; via_link_id: string | null;
  metric: 'line_stop_days_added' | 'delivery_date_shift_days'; unit: string;
  values: { p10: number; p50: number; p90: number; deterministic: boolean };
  timing: { first_affected: string | null; last_stop?: string | null; back_to_plan: string | null; recovery_days: number | null; headroom: number | null; reason: string | null };
  basis: Row; derived_at?: string;
}
export interface ProbabilityStatement {
  statement_id: string; run_id: string; map_id: string; map_name: string; map_version: number; map_horizon: string; event: { metric: string; op: string; threshold: number; label: string };
  samples: number; occurrences: number; horizon_days: number; frequency: number | string; per_year: number | string; conversion: string; band: Row;
  probability_low: number | string; probability_high: number | string; stated_by: string; stated_at: string; caveat?: string;
}
export interface RunImpact {
  run: { run_id: string; twin_id: string; twin_version: number; run_kind: string; control_run_id: string | null; state: string; validity: string; fitness_state: string; promoted_for: string | null;
         model_ref: string; stochastic_mode: string; samples: number | null; shock: boolean; scenario_id: string | null; scenario_branch_id: string | null; outputs_digest: string | null; component: string };
  as_of: string; analyses: Analysis[]; second_order: Effect[]; probabilities: ProbabilityStatement[]; synthetic: boolean;
}
export interface AnalysisRow { analysis_id: string; run_id: string; metric: string; robustness_verdict: string; analysed_at: string; factor_count: number; widest: string | null; twin_title: string | null; run_kind: string; validity: string; scenario_branch_id: string | null }
export interface Signal { key: string; label: string; likelihoods: Record<string, number> }
export interface Information { label: string; delay_days: number; delay_cost: number; signals: Signal[]; likelihood_basis: string }
export interface Assessment {
  assessment_id: string; package_id: string | null; package_version: number | null; scenario_id: string; source: 'portfolio_review' | 'entered'; review_id: string | null;
  branches: Array<{ branch_id: string; name: string; kind: string; probability_id: string; low: number; high: number; method: string; mid: number; weight: number }>;
  options: Array<{ key: string; title: string }>; payoffs: Record<string, Record<string, number>>; payoff_unit: string; payoff_basis: string; information: Information;
  prior_best: string[]; ev_now: number | string; ev_perfect: number | string; evpi: number | string; evsi: number | string; delay_cost: number | string; net_value: number | string;
  posteriors: Array<{ key: string; label: string; p_signal: number; posterior: Record<string, number> | null; best: string[]; ev: number | null }>;
  recommendation: 'wait' | 'act'; item_id: string | null; recorded_by: string; recorded_at: string; package_title?: string | null; scenario_title?: string | null;
}
export interface VoiPayload {
  scenarioId: string; packageId?: string | null; branchIds?: string[] | null; reviewId?: string | null;
  options?: Array<{ key: string; title: string }> | null; payoffs?: Record<string, Record<string, number>> | null; unit?: string | null; payoffBasis?: string | null; information: Information;
}

/* ───────────── the layout and the words ───────────── */
const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
/**
 * THE TORNADO: one bar per factor in rank order, the low move's delta and the high move's delta drawn from the base line, both scaled to
 * the widest swing (percent of half the chart's width). Only the recorded deltas are used.
 */
export function tornadoRows(factors: ReadonlyArray<Pick<Factor, 'key' | 'rank' | 'delta_low' | 'delta_high' | 'low' | 'high' | 'kind'>>):
  Array<{ key: string; rank: number; kind: string; lowPct: number; highPct: number; lowDelta: number; highDelta: number; lowValue: string; highValue: string }> {
  const widest = Math.max(0, ...factors.map((f) => Math.max(Math.abs(n(f.delta_low)), Math.abs(n(f.delta_high)))));
  const pct = (d: number): number => (widest === 0 ? 0 : Math.round((d / widest) * 1000) / 10);
  return [...factors].sort((a, b) => a.rank - b.rank).map((f) => ({
    key: f.key, rank: f.rank, kind: f.kind, lowDelta: n(f.delta_low), highDelta: n(f.delta_high), lowPct: pct(n(f.delta_low)), highPct: pct(n(f.delta_high)),
    lowValue: String(f.low.value), highValue: String(f.high.value),
  }));
}
/** The robustness verdict as a glyph, a token and words — never colour alone. */
export function robustnessMark(r: Pick<Robustness, 'verdict' | 'unstable'> | null | undefined): { glyph: string; token: string; text: string } {
  switch (r?.verdict) {
    case 'stable': return { glyph: '●', token: '--eye-color-success', text: 'ROBUST — the ranking holds under every seed' };
    case 'unstable': return { glyph: '▲', token: '--eye-color-warning', text: `NOT ROBUST — the rank of ${(r.unstable ?? []).map((u) => u.key).join(', ') || 'a factor'} moves between seeds` };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: 'robustness not assessed (no seeds named)' };
  }
}
/** An effect's percentile line: "p10 a · p50 b · p90 c days", or one value for a deterministic run. */
export function effectValues(e: Pick<Effect, 'values' | 'unit'>): string {
  return e.values.deterministic ? `${e.values.p50} ${e.unit} (deterministic run: one value)` : `p10 ${e.values.p10} · p50 ${e.values.p50} · p90 ${e.values.p90} ${e.unit}`;
}
/** An effect's timing line in the record's words; a DATE is shown as the day it names. */
export function effectTiming(e: Pick<Effect, 'timing' | 'depth'>): string {
  const t = e.timing;
  const parts: string[] = [];
  if (t.first_affected !== null) parts.push(`first affected ${t.first_affected}`);
  if (e.depth === 0 && t.last_stop) parts.push(`last line-stop day ${t.last_stop}`);
  if (t.recovery_days !== null) parts.push(`recovers in ${t.recovery_days} day(s) at headroom ${Math.round((t.headroom ?? 0) * 1000) / 10}%`);
  if (t.back_to_plan !== null) parts.push(`back on plan ${t.back_to_plan}`);
  if (t.reason !== null) parts.push(t.reason);
  return parts.join(' · ') || '—';
}
/** The recommendation as glyph, token and words, with the numbers the port computed. */
export function voiVerdict(a: Pick<Assessment, 'recommendation' | 'evsi' | 'evpi' | 'delay_cost' | 'net_value' | 'payoff_unit' | 'information' | 'prior_best'>): { glyph: string; token: string; text: string } {
  const u = a.payoff_unit;
  if (a.recommendation === 'wait') {
    return { glyph: '⏸', token: '--eye-color-warning', text: `WAIT for "${a.information.label}" (${a.information.delay_days} day(s)): it is worth ${a.evsi} ${u} (EVSI) against a delay cost of ${a.delay_cost} ${u} — net ${a.net_value} ${u}; perfect information would be worth ${a.evpi} ${u} (EVPI)` };
  }
  return { glyph: '▶', token: '--eye-color-success', text: `ACT now (${a.prior_best.join(', ')}): "${a.information.label}" is worth ${a.evsi} ${u} (EVSI), not more than its delay cost of ${a.delay_cost} ${u} — net ${a.net_value} ${u}; EVPI ${a.evpi} ${u}` };
}
/** A probability statement in words: the count, the conversion, the map's band — and that it is a simulated frequency. */
export function probabilityLine(p: Pick<ProbabilityStatement, 'event' | 'occurrences' | 'samples' | 'per_year' | 'map_name' | 'map_version' | 'map_horizon' | 'probability_low' | 'probability_high'>): string {
  return `${p.event.label}: ${p.occurrences} of ${p.samples} simulated samples → ${p.per_year} per year → ${p.probability_low}–${p.probability_high} over ${p.map_horizon} through map "${p.map_name}" v${p.map_version} (a SIMULATED frequency, mapped — not a calibrated observation)`;
}

/* ───────────── the calls ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/simulations/impact`;
const READ = 'simulation.impact.read';
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'simulation', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const impact = {
  list: (s: Scope) => p<{ at: string; analyses: AnalysisRow[]; receipt: Receipt }>(s, '/list', READ, 'SIM'),
  read: (s: Scope, runId: string) => p<{ impact: RunImpact; receipt: Receipt }>(s, `/runs/${runId}/read`, READ, 'SIM', {}, runId),
  sensitivity: (s: Scope, runId: string, payload: { metric?: string; relative?: number; seeds?: number[] | null; samples?: number; jitter?: Record<string, number> | null; timingShiftDays?: number | null }) =>
    p<{ analysis: Analysis; receipt: Receipt }>(s, `/runs/${runId}/sensitivity`, 'simulation.impact.sensitivity', 'SIM', payload as Row, runId),
  secondOrder: (s: Scope, runId: string) =>
    p<{ secondOrder: { derivation_id: string; run_id: string; twin_id: string; links_traversed: number; effects: Effect[]; synthetic: boolean }; receipt: Receipt }>(s, `/runs/${runId}/second-order`, 'simulation.impact.second_order', 'SIM', {}, runId),
  probability: (s: Scope, runId: string, payload: { mapId: string | null; event: { metric: string; op: string; threshold: number; label: string } }) =>
    p<{ statement: ProbabilityStatement; receipt: Receipt }>(s, `/runs/${runId}/probability`, 'simulation.impact.probability', 'SIM', payload as unknown as Row, runId),
  assess: (s: Scope, payload: VoiPayload) =>
    p<{ assessment: Assessment; receipt: Receipt }>(s, '/voi/assess', 'simulation.impact.voi', payload.packageId ? 'DPK' : 'SCN', payload as unknown as Row, payload.packageId ?? payload.scenarioId),
  assessments: (s: Scope, filter: { packageId?: string | null; scenarioId?: string | null } = {}) =>
    p<{ at: string; assessments: Assessment[]; receipt: Receipt }>(s, '/voi/list', READ, 'DPK', filter as Row, filter.packageId ?? null),
};
