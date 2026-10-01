/**
 * The simulation center client — CP-6 B31 part `orchestration` (0099 §O; F-P5-06, WS-13, JRN-14).
 *
 * Every response is returned VERBATIM: an experiment's state, its budget (approved and used), its admission, its chunks, its checkpoints
 * with the indicators the server computed (numerical stability per measure, latency, cost, failures, constraint satisfaction), its ledger,
 * the run it produced (completed, partial with the declaration of what is missing, or failed) and the manifest. The helpers below only
 * WORD what the record says — nothing here counts a path, judges stability or decides a stop. Every figure is SYNTHETIC.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export type ExperimentState = 'declared' | 'approved' | 'running' | 'paused' | 'completed' | 'partial' | 'failed' | 'cancelled';

export interface Budget { max_paths: number; max_wall_seconds: number; max_chunks: number }
export interface BudgetUse {
  paths: { done: number; declared: number; approved_max: number };
  wall_seconds: { used: number; approved_max: number };
  chunk_executions: { used: number; approved_max: number };
}
export interface Stability { measure: string; n: number; mean?: number; ci_half_width?: number; relative_half_width?: number; change_since_previous?: number | null; state: 'stable' | 'unstable' | 'indeterminate'; rule: string }
export interface Indicators {
  numerical_stability?: Record<string, Stability>;
  constraint_satisfaction?: { outcome: string; note?: string; set_id?: string | null };
  latency?: { chunk_wall_ms: number; ms_per_path: number };
  cost?: { wall_seconds_used: number; wall_seconds_approved: number; chunk_executions_used: number; chunk_executions_approved: number };
  failure_containment?: { chunk_failures: number; contained: boolean; executor: string };
}
export interface ChunkRow { chunk_index: number; first_path: number; paths: number; state: 'queued' | 'running' | 'done' | 'failed'; attempts: number; wall_ms: number | null; digest: string | null; error: string | null }
export interface CheckpointRow { seq: number; chunk_index: number; paths_done: number; chunks_done: number; digest: string; indicators: Indicators; created_at: string }
export interface PartialDeclaration { reason: string; completed_paths: number; declared_paths: number; missing_paths: Array<{ chunk_index: number; from_path: number; to_path: number; state: string }>; missing_outputs: string[]; decision_use: string }
export interface ExperimentRun { run_id: string; state: 'opened' | 'completed' | 'failed' | 'partial'; validity: string; fitness_state: string; partial: PartialDeclaration | null; outputs_digest: string | null; samples: number | null; seed: number | null; failure: string | null }
export interface Admission { admitted: boolean; reasons: string[]; capacity: number; in_use: number; deterministic: boolean; chunks: number; checked_at: string }
export interface Experiment {
  experiment_id: string; title: string; question: string; twin_id: string; twin_version: number; scenario_id: string | null; scenario_branch_id: string | null; method_ref: string;
  run_intake: Row; measures: string[]; expected_outputs: string[]; paths: number; chunk_size: number; seed: number; jitter: Record<string, number>;
  budget: Budget; budget_digest: string; stop_conditions: { paths: number; converged: { measure: string; ci_half_width: number; min_paths: number } | null }; pace: { chunks_per_tick: number };
  state: ExperimentState; declared_by: string; declared_at: string; approved_by: string | null; approved_at: string | null; approval_note: string | null;
  started_by: string | null; started_at: string | null; admission: Admission | null; run_id: string | null;
  progress: { paths_done: number; chunks_done: number; executions: number; wall_ms: number; failures: number; last_checkpoint?: number };
  indicators: Indicators; stop_pending: { outcome: string; reason: string } | null; manifest: Row | null; outcome: Row | null; finished_at: string | null;
  budget_use?: BudgetUse; chunks?: ChunkRow[]; checkpoints?: CheckpointRow[]; events?: Array<{ event_id: string; event: string; actor: string; details: Row; occurred_at: string }>;
  run?: ExperimentRun | null; executor?: { kind: string; active: boolean }; chunks_total?: number; synthetic?: boolean;
}

/* ───────────── the words ───────────── */
/** An experiment's state as a glyph, a token and words — never colour alone. */
export function stateMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'declared': return { glyph: '◌', token: '--eye-color-ink-muted', text: 'DECLARED — waiting for a named human other than the declarer to approve the budget' };
    case 'approved': return { glyph: '◍', token: '--eye-color-accent-default', text: 'APPROVED — the budget is approved; an operator starts it (admission)' };
    case 'running': return { glyph: '▶', token: '--eye-color-accent-default', text: 'RUNNING — chunks execute in the background, one checkpoint each' };
    case 'paused': return { glyph: '❚❚', token: '--eye-color-warning', text: 'PAUSED — resumes from its last checkpoint' };
    case 'completed': return { glyph: '●', token: '--eye-color-success', text: 'COMPLETED — every declared path ran; the run is completed with its manifest' };
    case 'partial': return { glyph: '◐', token: '--eye-color-warning', text: 'PARTIAL — stopped before the declared paths; the run is diagnostic only, its missing outputs declared' };
    case 'failed': return { glyph: '✕', token: '--eye-color-critical', text: 'FAILED — no path completed' };
    case 'cancelled': return { glyph: '—', token: '--eye-color-ink-muted', text: 'CANCELLED — stopped by an operator' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() || 'UNKNOWN' };
  }
}

/** The budget as the server counted it: used against approved, per dimension. */
export function budgetUseLine(u: BudgetUse | undefined): string {
  if (u === undefined) return 'no budget use recorded';
  return `paths ${u.paths.done}/${u.paths.declared} (approved ≤ ${u.paths.approved_max}) · wall ${u.wall_seconds.used} s of ${u.wall_seconds.approved_max} s · chunk executions ${u.chunk_executions.used} of ${u.chunk_executions.approved_max}`;
}

/** Progress in words and the server's own fraction (paths done of declared). */
export function progressLine(e: Pick<Experiment, 'progress' | 'paths' | 'chunks_total'>): string {
  const pct = e.paths > 0 ? Math.floor((e.progress.paths_done / e.paths) * 100) : 0;
  return `${e.progress.paths_done} of ${e.paths} paths (${pct}%) · ${e.progress.chunks_done}${e.chunks_total === undefined ? '' : ` of ${e.chunks_total}`} chunks · ${e.progress.failures} chunk failure(s)`;
}

/** One measure's numerical stability as the server judged it (rule sio-stability@1). */
export function stabilityLine(s: Stability | undefined): string {
  if (s === undefined) return 'not measured yet';
  if (s.state === 'indeterminate' || s.mean === undefined) return `${s.measure}: INDETERMINATE (${s.n} path(s); at least 30 are needed)`;
  const change = s.change_since_previous === null || s.change_since_previous === undefined ? '' : ` · moved ${(s.change_since_previous * 100).toFixed(2)}% since the previous checkpoint`;
  return `${s.measure}: ${s.state.toUpperCase()} — mean ${s.mean} ± ${s.ci_half_width} (95%; ${((s.relative_half_width ?? 0) * 100).toFixed(2)}% of the mean) over ${s.n} paths${change}`;
}

/** The admission as recorded: admitted, or the reasons it was refused. */
export function admissionLine(a: Admission | null | undefined): string {
  if (a === null || a === undefined) return 'not yet admitted';
  if (a.admitted) return `ADMITTED — deterministic (${a.chunks} chunks), capacity ${a.in_use}/${a.capacity} in use before this one`;
  return `REFUSED — ${a.reasons.join('; ')}`;
}

/** A partial run's declaration: why it stopped and what is missing — the server's words. */
export function partialLine(p: PartialDeclaration | null | undefined): string {
  if (p === null || p === undefined) return '';
  const ranges = p.missing_paths.map((m) => `${m.from_path}–${m.to_path}`).join(', ');
  return `PARTIAL (${p.reason}) — ${p.completed_paths} of ${p.declared_paths} paths completed; missing paths ${ranges === '' ? 'none' : ranges}; ${p.decision_use}`;
}

/** The run the experiment produced, in words. */
export function runLine(r: ExperimentRun | null | undefined): string {
  if (r === null || r === undefined) return 'no run opened yet';
  const head = `run ${r.run_id.slice(0, 8)}… ${r.state.toUpperCase()}${r.validity === 'invalidated' ? ' · INVALIDATED' : ''}`;
  if (r.state === 'partial') return `${head} — ${partialLine(r.partial)}`;
  if (r.state === 'failed') return `${head} — ${r.failure ?? 'failed'}`;
  if (r.state === 'completed') return `${head} — ${r.samples ?? '?'} paths, outputs ${r.outputs_digest?.slice(0, 12) ?? '—'}…`;
  return `${head} — executing`;
}

/** A ledger row, in words. */
export function eventLine(e: { event: string; details: Row }): string {
  const d = e.details;
  switch (e.event) {
    case 'checkpointed': return `checkpoint ${String(d['seq'])} — chunk ${String(d['chunk_index'])}, ${String(d['paths_done'])}/${String(d['declared_paths'])} paths`;
    case 'chunk_failed': return `chunk ${String(d['chunk_index'])} failed (attempt ${String(d['attempt'])}${d['final'] === true ? ', final' : ', retried'}) — ${String(d['error'] ?? '')}`;
    case 'admission_refused': return `admission refused — ${((d['reasons'] ?? []) as string[]).join('; ')}`;
    case 'paused': case 'resumed': case 'cancelled': return `${e.event} — ${String(d['reason'] ?? '')}`.trim();
    case 'budget_exceeded': return 'budget exceeded — the experiment stops';
    default: return e.event.replace('_', ' ');
  }
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/simulations/orchestration`;
async function p<T>(s: Scope, path: string, action: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'SXP', object_id: objectId, purpose_id: 'simulation',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}
const READ = 'simulation.experiment.read';

export interface DeclareExperiment {
  title: string; question: string; run: Row; paths: number; chunkSize: number; seed: number; jitter: Record<string, number>; budget: Budget;
  measures?: string[]; stopConditions?: { converged: { measure: string; ci_half_width: number; min_paths: number } | null }; pace?: { chunks_per_tick: number };
}

export const orchestration = {
  list: (s: Scope, state?: ExperimentState) => p<{ at: string; experiments: Experiment[]; receipt: Receipt }>(s, '/list', READ, state ? { state } : {}),
  read: (s: Scope, id: string) => p<{ at: string; experiment: Experiment; receipt: Receipt }>(s, `/${id}/read`, READ, {}, id),
  declare: (s: Scope, payload: DeclareExperiment) => p<{ experiment: Experiment; receipt: Receipt }>(s, '/declare', 'simulation.experiment.declare', payload as unknown as Row),
  approve: (s: Scope, id: string, budgetDigest: string, note: string) => p<{ experiment: Experiment; receipt: Receipt }>(s, `/${id}/approve`, 'simulation.experiment.approve', { budgetDigest, note }, id),
  start: (s: Scope, id: string) => p<{ experiment: Experiment; receipt: Receipt }>(s, `/${id}/start`, 'simulation.experiment.start', {}, id),
  pause: (s: Scope, id: string, reason: string) => p<{ experiment: Experiment; receipt: Receipt }>(s, `/${id}/pause`, 'simulation.experiment.pause', { reason }, id),
  resume: (s: Scope, id: string, reason: string) => p<{ experiment: Experiment; receipt: Receipt }>(s, `/${id}/resume`, 'simulation.experiment.resume', { reason }, id),
  cancel: (s: Scope, id: string, reason: string) => p<{ experiment: Experiment; receipt: Receipt }>(s, `/${id}/cancel`, 'simulation.experiment.cancel', { reason }, id),
};
