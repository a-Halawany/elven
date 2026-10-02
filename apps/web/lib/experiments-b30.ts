/**
 * The method-fabric experiments client — CP-6 B30 part `experiments` (0103 §EX; F-P5-06's and F-P5-07's B30 pieces).
 *
 * Every response is returned VERBATIM: the chunkable methods and their adapters' health, the experiments with their on-unstable policy and
 * the checkpoint actions the server took (stopped, paused, adapter quarantined, review routed), the retirements with their reason and
 * reach, the envelope sweeps (response curves, thresholds, hidden dependencies) and the benchmark validations (discrepancy, rare-event
 * tail, convergence, verdict). The helpers below only WORD what the record says — nothing here judges stability, finds a threshold,
 * crosses two factors or computes a distance. Every figure is SYNTHETIC.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type UnstablePolicy = 'stop' | 'pause' | 'none';

export interface MethodHealth { state: 'healthy' | 'quarantined'; quarantined_at: string | null; last_fault: Row | null; reinstated_at: string | null }
export interface FabricMethod { method_ref: string; family: string; containment: Row; operating_envelope: Record<string, unknown>; health: MethodHealth | null }
export interface FabricExperiment {
  experiment_id: string; title: string; method_ref: string; state: string; on_unstable: UnstablePolicy; paths: number; chunk_size: number;
  progress: { paths_done: number; chunks_done: number }; run_id: string | null; retirement: Row | null; outcome: Row | null;
  actions: Array<{ event: string; details: Row; occurred_at: string }>; last_indicators: Row;
}
export interface Reach {
  run_id: string;
  packages: Array<{ package_id: string; title: string; owner: string | null; state: string; version: number; via: string; option_key: string | null; option_title: string | null; recommended: boolean; current: boolean; committed: boolean }>;
  analyses: { sensitivity: Row[]; second_order: string[]; probability_statements: string[]; envelope_sweeps: string[]; benchmark_validations: string[] };
  dependent_runs: Array<{ run_id: string; state: string; relation: 'control_of' | 'corrected_by'; retired: boolean }>;
  experiment: { experiment_id: string; title: string; state: string } | null;
  counts: { packages: number; analyses: number; dependent_runs: number };
}
export interface Retirement {
  retirement_id: string; subject_kind: 'run' | 'experiment'; run_id: string | null; experiment_id: string | null; reason: string; superseded_by: string | null;
  reach: Partial<Reach>; notified: Array<{ package_id: string; owner: string | null; attention_item_id: string }>; retired_by: string; retired_at: string;
}
export interface Threshold { kind: 'onset' | 'saturation' | 'kink'; at: number; between: [number, number]; slope_before: number; slope_after: number }
export interface SweepFactor {
  key: string; field: string; range: [number, number]; base_value: number; grid: Array<{ value: number; metric: number }>; slopes: number[];
  nonlinearity: number; nonlinear: boolean; curvature: number; response: 'flat' | 'linear' | 'nonlinear'; thresholds: Threshold[];
}
export interface Interaction { factors: [string, string]; corners: { ll: number; lh: number; hl: number; hh: number }; main_a: number; main_b: number; interaction: number; relative: number; hidden_dependency: boolean }
export interface Sweep {
  sweep_id: string; run_id: string; model_ref: string; metric: string; grid_points: number; base_value: number; factors: SweepFactor[]; interactions: Interaction[];
  nonlinear_factors: number; thresholds: number; hidden_dependencies: number; rule: string; digest: string; swept_at: string; requested_by: string;
}
export interface Validation {
  validation_id: string; run_id: string; model_ref: string; measure: string; benchmark_kind: 'observed' | 'benchmark'; benchmark: { values: number[]; basis: string; citations: Row[] };
  run_paths: number; benchmark_n: number; tolerance: number;
  discrepancy: { run_mean: number; benchmark_mean: number; bias: number; relative_bias: number | null; ks: number; ks_critical: number; band: [number, number]; coverage_in_band: number };
  tail: { threshold: number; threshold_basis: string; run_frequency: number; benchmark_frequency: number; ratio: number | null; run_tail_paths: number; expected_tail_paths: number; verdict: string };
  convergence: { checkpoints: Array<{ paths: number; mean: number; relative_change: number | null; relative_half_width: number }>; converged_at: number | null; verdict: string };
  verdict: 'consistent' | 'discrepant' | 'insufficient'; validated_at: string; requested_by: string;
}
export interface Overview { at: string; methods: FabricMethod[]; experiments: FabricExperiment[]; retirements: Retirement[]; sweeps: Sweep[]; validations: Validation[]; synthetic: boolean }
export interface RunRetirement { run_id: string; state: string; model_ref: string; retired_at: string | null; retired_by: string | null; retire_reason: string | null; retirement: Retirement | null; reach: Reach | null; sweeps: Sweep[]; validations: Validation[] }

/* ───────────── the words ───────────── */
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** The policy an experiment declared for an unstable, violated or indeterminate checkpoint. */
export function policyText(p: UnstablePolicy | string): string {
  switch (p) {
    case 'stop': return 'STOP — an unstable checkpoint stops the experiment (partial, reason unstable) and routes a review';
    case 'pause': return 'PAUSE — an unstable checkpoint pauses it for an operator to resume, and routes a review';
    case 'none': return 'NONE — the indicators are recorded, not acted on (B31\'s behaviour)';
    default: return String(p).toUpperCase();
  }
}

/** An adapter's health in words — a glyph and the word, never colour alone. */
export function healthLine(h: MethodHealth | null | undefined, containment?: Row): string {
  if (containment !== undefined && containment['isolated'] !== true) return '◇ IN PROCESS — not contained; never quarantined';
  if (h === null || h === undefined) return '● HEALTHY — never faulted in this domain';
  if (h.state === 'quarantined') {
    const f = h.last_fault ?? {};
    return `⊘ QUARANTINED since ${String(h.quarantined_at ?? '')} — ${String(f['kind'] ?? 'fault')}: ${String(f['message'] ?? '')}`.trim();
  }
  return h.reinstated_at ? `● HEALTHY — reinstated ${h.reinstated_at}` : '● HEALTHY';
}

/** A checkpoint action of the experiment's ledger, in the server's words. */
export function actionLine(a: { event: string; details: Row }): string {
  const d = a.details; const reading = (d['reading'] ?? {}) as Row;
  const why = ((reading['reasons'] ?? []) as string[]).join('; ');
  switch (a.event) {
    case 'policy_set': return `policy set to ${String(d['on_unstable']).toUpperCase()} (was ${String(d['previous'])}) — ${String(d['reason'] ?? '')}`;
    case 'stopped_unstable': return `STOPPED at checkpoint ${String(d['seq'])}${d['quarantined'] === true ? ' (its adapter quarantined)' : ''} — ${why}`;
    case 'paused_unstable': return `PAUSED at checkpoint ${String(d['seq'])} — ${why}`;
    case 'adapter_quarantined': return `ADAPTER QUARANTINED: ${String(d['model_ref'])} — its running mean diverged at checkpoint ${String(d['seq'])}`;
    case 'review_routed': return `review routed at checkpoint ${String(d['seq'])} to the declarer and the method stewards${((d['actions'] ?? []) as string[]).length > 0 ? ` (${((d['actions'] ?? []) as string[]).join(', ')})` : ''}`;
    case 'stopped_quarantined': return `STOPPED — its adapter ${String(d['model_ref'])} stands quarantined in this domain; no further chunk of it runs`;
    case 'retired': return `RETIRED — ${String(d['reason'] ?? '')}${d['run_retired'] === true ? ' (its run retired with it)' : ''}`;
    default: return a.event.replace(/_/g, ' ');
  }
}

/** A retirement's reach in words: what rested on the run when it was retired. */
export function reachLine(r: Partial<Reach> | null | undefined): string {
  if (r === null || r === undefined) return 'no reach recorded';
  const c = r.counts ?? { packages: (r.packages ?? []).length, analyses: 0, dependent_runs: (r.dependent_runs ?? []).length };
  const parts = [`${c.packages} package(s) citing it`, `${c.analyses} analysis record(s) resting on it`, `${c.dependent_runs} run(s) comparing against it or correcting it`];
  if (r.experiment) parts.push(`produced by experiment “${r.experiment.title}”`);
  return parts.join(' · ');
}

export function retirementLine(r: Retirement): string {
  const what = r.subject_kind === 'experiment' ? `experiment ${short(r.experiment_id)}${r.run_id ? ` and its run ${short(r.run_id)}` : ''}` : `run ${short(r.run_id)}`;
  return `${what} retired — “${r.reason}”${r.superseded_by ? ` · superseded by run ${short(r.superseded_by)}` : ''} · ${reachLine(r.reach)}${r.notified.length > 0 ? ` · ${r.notified.length} package owner(s) told` : ''}`;
}

/** One swept factor's response in words (rule sxp-sweep@1, as the server recorded it). */
export function sweepFactorLine(f: SweepFactor): string {
  const head = `${f.key} over [${f.range[0]}, ${f.range[1]}]: ${f.response.toUpperCase()}`;
  const shape = f.response === 'flat' ? 'the metric does not move across the envelope' : `nonlinearity ${pct(f.nonlinearity)} of the span · curvature ${pct(f.curvature)} of the steepest slope`;
  const thr = f.thresholds.length === 0 ? 'no threshold' : f.thresholds.map((t) => `${t.kind.toUpperCase()} at ${t.at} (slope ${t.slope_before} → ${t.slope_after})`).join('; ');
  return `${head} — ${shape} — ${thr}`;
}

/** One pair's interaction in words (a hidden dependency named as such). */
export function interactionLine(i: Interaction): string {
  return `${i.factors[0]} × ${i.factors[1]}: interaction ${i.interaction} (${pct(i.relative)} of the larger main effect)${i.hidden_dependency ? ' — HIDDEN DEPENDENCY' : ' — additive'}`;
}

/** A validation's verdict and its reasons in words. */
export function validationLine(v: Validation): string {
  const d = v.discrepancy;
  const bias = d.relative_bias === null ? `bias ${d.bias}` : `bias ${d.bias} (${pct(d.relative_bias)})`;
  return `${v.verdict.toUpperCase()} — ${v.run_paths} path(s) against ${v.benchmark_n} ${v.benchmark_kind} value(s) of ${v.measure}: ${bias}; KS ${d.ks} ${d.ks > d.ks_critical ? '>' : '≤'} ${d.ks_critical} (5%); ${pct(d.coverage_in_band)} of the sample inside the run's p05–p95 band`;
}

export function tailLine(t: Validation['tail']): string {
  return `rare events at ≥ ${t.threshold} (${t.threshold_basis}): the run ${pct(t.run_frequency)} (${t.run_tail_paths} path(s)), the sample ${pct(t.benchmark_frequency)} — ${t.verdict.replace(/_/g, ' ').toUpperCase()}`;
}

export function convergenceLine(c: Validation['convergence']): string {
  if (c.verdict === 'not_applicable') return 'convergence: not applicable (a single deterministic path)';
  const last = c.checkpoints[c.checkpoints.length - 1];
  return `convergence: ${c.verdict.replace('_', ' ').toUpperCase()}${c.converged_at === null ? '' : ` from ${c.converged_at} paths`} — running mean ${last?.mean ?? '—'} over ${last?.paths ?? 0} paths, 95% half-width ${last === undefined ? '—' : pct(last.relative_half_width)} of the mean`;
}

/** Comma-, space- or newline-separated numbers; null when any item is not a number. */
export function parseValues(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter((x) => x !== '');
  if (parts.length === 0) return null;
  const xs = parts.map(Number);
  return xs.every((x) => Number.isFinite(x)) ? xs : null;
}

export const short = (id: string | null | undefined): string => (id ? `${id.slice(0, 8)}…${id.slice(-6)}` : '—');

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/simulations/fabric`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'simulation',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}
const READ = 'simulation.fabric.read';

export interface BenchmarkPayload { measure: string; kind: 'observed' | 'benchmark'; values: number[]; basis: string; citations?: Row[]; tolerance?: number; tailThreshold?: number | null }

export const fabricExperiments = {
  list: (s: Scope) => p<Overview & { receipt: Receipt }>(s, '/list', READ, 'SXP'),
  readRun: (s: Scope, runId: string) => p<{ at: string; run: RunRetirement; receipt: Receipt }>(s, `/runs/${runId}/read`, READ, 'SIM', {}, runId),
  policy: (s: Scope, experimentId: string, policy: UnstablePolicy, reason: string) =>
    p<{ experiment: Row; receipt: Receipt }>(s, `/experiments/${experimentId}/policy`, 'simulation.experiment.policy', 'SXP', { policy, reason }, experimentId),
  quarantine: (s: Scope, modelRef: string, reason: string, runId: string | null) =>
    p<{ adapter: Row; receipt: Receipt }>(s, '/adapters/quarantine', 'simulation.adapter.quarantine', 'SIM', { modelRef, reason, runId }, runId),
  retireRun: (s: Scope, runId: string, reason: string, supersededBy: string | null) =>
    p<{ retirement: Retirement & { run: Row }; receipt: Receipt }>(s, `/runs/${runId}/retire`, 'simulation.retirement.run', 'SIM', { reason, supersededBy }, runId),
  retireExperiment: (s: Scope, experimentId: string, reason: string) =>
    p<{ retirement: Retirement & { experiment: Row }; receipt: Receipt }>(s, `/experiments/${experimentId}/retire`, 'simulation.retirement.experiment', 'SXP', { reason }, experimentId),
  sweep: (s: Scope, runId: string, metric: string, gridPoints: number) =>
    p<{ sweep: Sweep; receipt: Receipt }>(s, `/runs/${runId}/sweep`, 'simulation.sweep.run', 'SIM', { metric, gridPoints }, runId),
  benchmark: (s: Scope, runId: string, payload: BenchmarkPayload) =>
    p<{ validation: Validation; receipt: Receipt }>(s, `/runs/${runId}/benchmark`, 'simulation.benchmark.validate', 'SIM', payload as unknown as Row, runId),
};
