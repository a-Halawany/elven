/**
 * THE EXPERIMENT'S PURE LOGIC — CP-6 B31 part O (0099 §O; F-P5-06). No database, no process: what the declaration must say, what one
 * chunk of a seeded supply-flow@1 experiment computes, and how the run's outputs are assembled from the chunks.
 *
 * THE CHUNK IS EXACT. supply-flow@1 draws path s from xoshiro128** seeded with `seed ^ imul(s + 1, 0x9e3779b1)` — the path's GLOBAL index —
 * so the paths [first, first + n) of a chunk are the same paths the single execution of the whole contract draws. The pinned
 * implementation (models/supply-flow.ts, digest-bound: never edited) exports no per-index sampler, so a chunk executes the contract with
 * `samples = first + n` and keeps its last n paths: the chunk's cost grows with its offset (5,000 paths in 10 chunks cost ≈ 5.5 single
 * executions — measured 2.2 s against 0.4 s), the price of using only the pinned implementation. The run assembled from every chunk
 * then has EXACTLY the outputs (and digest) the existing complete path would compute for the same contract, so it reproduces cold
 * through the existing reproduce route. A supply-flow@2 exporting the per-index sampler removes the overhead (left to the method's owner).
 */
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { errorBody, jcsCanonicalize } from '@eye/contracts';
import { simulateSupplyFlow, roundHalfEven, RNG_ALGORITHM, type SupplyFlowOptions, type SupplyFlowOutputs, type SupplyFlowParams, type Intervention, type Totals } from '../../models/supply-flow.js';
/* B30 experiments */
import { FABRIC_CHUNKABLE, fabricMeasures, isFabricChunkable } from '../fabric/fabric-plan.js';
/* end B30 experiments */

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MEASURES = ['total_cost', 'line_stop_days', 'days_below_safety_stock'] as const;
export const CHUNKABLE_METHODS: readonly string[] = Object.freeze(['supply-flow@1', /* B30 experiments: the method fabric's seeded methods (simulation.sio_chunkable_methods, 0103 §EX.2) */ ...FABRIC_CHUNKABLE]);
/** The chunk executor's containment (the method fabric's defaults for an isolated adapter; recorded on the manifest). */
export const CHUNK_CONTAINMENT = Object.freeze({ isolated: true, timeout_ms: 60_000, max_old_space_mb: 256 });

export interface ExperimentIntake {
  title: string; question: string;
  /** The run contract (the run route's intake without its stochastic block — the experiment supplies it: seeded, seed, samples = paths, jitter). */
  run: Row;
  twinId: string; twinVersion: number; scenarioId: string | null; scenarioBranchId: string | null; methodRef: string | null;
  measures: string[]; expectedOutputs: string[] | null;
  paths: number; chunkSize: number; seed: number; jitter: Record<string, number>;
  budget: { max_paths: number; max_wall_seconds: number; max_chunks: number };
  stopConditions: { converged: { measure: string; ci_half_width: number; min_paths: number } | null };
  pace: { chunks_per_tick: number };
}

const bad = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, `experiment rejected (declaration): ${msg}`), 422); };
const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** The declaration's shape (the port decides the rest: the twin version, the method, the budget's sufficiency). */
export function validateExperimentIntake(m: Row, correlationId: string): ExperimentIntake {
  const title = typeof m['title'] === 'string' ? m['title'].trim() : '';
  const question = typeof m['question'] === 'string' ? m['question'].trim() : '';
  if (title.length < 4 || title.length > 200) bad(correlationId, 'title is 4–200 characters');
  if (question.length < 8) bad(correlationId, 'question names what the experiment answers (at least 8 characters)');
  const run = m['run'];
  if (run === null || typeof run !== 'object' || Array.isArray(run)) return bad(correlationId, 'run is the run contract (twinId, twinVersion, runKind, controlRunId, shock, component, interventions, horizonDays)');
  const r = run as Row;
  if (r['stochastic'] !== undefined) bad(correlationId, 'the run contract carries no stochastic block: the experiment declares the seed, the paths and the jitter');
  if (typeof r['twinId'] !== 'string' || !UUID.test(r['twinId'])) bad(correlationId, 'run.twinId is a twin id');
  if (!int(r['twinVersion']) || (r['twinVersion'] as number) < 1) bad(correlationId, 'run.twinVersion is a positive integer');
  const paths = m['paths'];
  if (!int(paths) || paths < 1 || paths > 10_000) bad(correlationId, 'paths is an integer in [1, 10000]');
  const chunkSize = m['chunkSize'];
  if (!int(chunkSize) || chunkSize < 1 || chunkSize > (paths as number)) bad(correlationId, 'chunkSize is an integer in [1, paths]');
  if (!int(m['seed'])) bad(correlationId, 'seed is an integer: an experiment is seeded (determinism)');
  /* B30 experiments: a FABRIC experiment (its run names a chunkable fabric method) draws its paths from the adapter's own stream — no
     lead-time jitter: absent, it is the degenerate { "0": 1 } the run records; its measures default to those the method projects. */
  const fabricRef = typeof r['modelRef'] === 'string' && isFabricChunkable(r['modelRef']) ? (r['modelRef'] as string) : null;
  if (fabricRef !== null && m['jitter'] === undefined) m = { ...m, jitter: { '0': 1 } };
  if (fabricRef !== null && m['measures'] === undefined) m = { ...m, measures: fabricMeasures(fabricRef) };
  if (fabricRef !== null && (m['measures'] as unknown[] | undefined)?.some((x) => !fabricMeasures(fabricRef).includes(String(x) as never))) {
    bad(correlationId, `the measures of a ${fabricRef} experiment are among those it projects (${fabricMeasures(fabricRef).join(', ')}; rule fabric-measures@1)`);
  }
  if (fabricRef !== null && (r['params'] === undefined || r['params'] === null || typeof r['params'] !== 'object' || Array.isArray(r['params']))) bad(correlationId, `run.params is the ${fabricRef} contract's parameters`);
  /* end B30 experiments */
  const jitter = m['jitter'];
  if (jitter === null || typeof jitter !== 'object' || Array.isArray(jitter) || Object.keys(jitter).length === 0) bad(correlationId, 'jitter is the lead-time jitter distribution { days: probability }');
  const j = jitter as Record<string, unknown>;
  if (!Object.entries(j).every(([d, p]) => /^-?\d+$/.test(d) && typeof p === 'number' && p >= 0 && p <= 1)) bad(correlationId, 'jitter maps whole days to probabilities in [0, 1]');
  const total = Object.values(j).reduce((s: number, p) => s + (p as number), 0);
  if (Math.abs(total - 1) > 1e-9) bad(correlationId, `jitter's probabilities sum to 1 (they sum to ${total})`);
  const b = (m['budget'] ?? null) as Row | null;
  if (b === null || typeof b !== 'object' || !int(b['max_paths']) || typeof b['max_wall_seconds'] !== 'number' || !int(b['max_chunks'])) {
    bad(correlationId, 'budget declares max_paths, max_wall_seconds and max_chunks');
  }
  const measures = m['measures'] === undefined ? ['total_cost', 'line_stop_days'] : m['measures'];
  if (!Array.isArray(measures) || measures.length === 0 || !measures.every((x) => (MEASURES as readonly string[]).includes(String(x)))) bad(correlationId, `measures are among ${MEASURES.join(', ')}`);
  const expected = m['expectedOutputs'];
  if (expected !== undefined && (!Array.isArray(expected) || !expected.every((x) => typeof x === 'string'))) bad(correlationId, 'expectedOutputs, when given, is a list of output names');
  const sc = (m['stopConditions'] ?? {}) as Row;
  const conv = sc['converged'] ?? null;
  let converged: ExperimentIntake['stopConditions']['converged'] = null;
  if (conv !== null) {
    const c = conv as Row;
    if (typeof c !== 'object' || typeof c['measure'] !== 'string' || typeof c['ci_half_width'] !== 'number' || !int(c['min_paths'])) bad(correlationId, 'stopConditions.converged is { measure, ci_half_width, min_paths }');
    converged = { measure: String(c['measure']), ci_half_width: c['ci_half_width'] as number, min_paths: c['min_paths'] as number };
  }
  const pace = (m['pace'] ?? {}) as Row;
  const perTick = pace['chunks_per_tick'] === undefined ? 1 : pace['chunks_per_tick'];
  if (!int(perTick) || perTick < 1 || perTick > 50) bad(correlationId, 'pace.chunks_per_tick is an integer in [1, 50]');
  const methodRef = typeof r['modelRef'] === 'string' ? r['modelRef'] : null;
  if (r['params'] !== undefined && r['params'] !== null && !isFabricChunkable(methodRef)) bad(correlationId, `a method-fabric run (params) is chunkable only for ${FABRIC_CHUNKABLE.join(', ')} (it names ${methodRef ?? 'no modelRef'}): supply-flow@1 runs from the twin's snapshot`); /* B30 experiments */
  return {
    title, question, run: r, twinId: r['twinId'] as string, twinVersion: r['twinVersion'] as number,
    scenarioId: typeof r['scenarioId'] === 'string' ? r['scenarioId'] : null, scenarioBranchId: typeof r['scenarioBranchId'] === 'string' ? r['scenarioBranchId'] : null, methodRef,
    measures: (measures as unknown[]).map(String), expectedOutputs: expected === undefined ? null : (expected as string[]),
    paths: paths as number, chunkSize: chunkSize as number, seed: m['seed'] as number, jitter: j as Record<string, number>,
    budget: { max_paths: (b as Row)['max_paths'] as number, max_wall_seconds: (b as Row)['max_wall_seconds'] as number, max_chunks: (b as Row)['max_chunks'] as number },
    stopConditions: { converged }, pace: { chunks_per_tick: perTick as number },
  };
}

/** The run route's intake an experiment opens its run with: the declared contract, SEEDED with the experiment's seed, its samples the paths. */
export function runIntakeOf(e: Row): Row {
  const run = (e['run_intake'] ?? {}) as Row;
  return { ...run, twinId: e['twin_id'], twinVersion: Number(e['twin_version']), scenarioId: e['scenario_id'] ?? null, scenarioBranchId: e['scenario_branch_id'] ?? null,
           stochastic: { mode: 'seeded', seed: Number(e['seed']), samples: Number(e['paths']), jitter: e['jitter'] } };
}

/** The chunk plan: [first_path, paths] per chunk index (the port writes the same). */
export function chunkPlan(paths: number, chunkSize: number): Array<{ chunk_index: number; first_path: number; paths: number }> {
  const out: Array<{ chunk_index: number; first_path: number; paths: number }> = [];
  for (let i = 0, first = 0; first < paths; i += 1, first += chunkSize) out.push({ chunk_index: i, first_path: first, paths: Math.min(chunkSize, paths - first) });
  return out;
}

export const digestOfJson = (v: unknown): string => createHash('sha256').update(jcsCanonicalize(v)).digest('hex');

/** ONE CHUNK: the paths [first, first + n) of the seeded contract — exactly the single execution's (see the header). */
export function chunkSampleTotals(params: SupplyFlowParams, options: SupplyFlowOptions, interventions: Intervention[], first: number, n: number): Totals[] {
  if (options.stochastic.mode !== 'seeded') throw new Error('an experiment chunk executes a seeded contract');
  if (!Number.isInteger(first) || !Number.isInteger(n) || first < 0 || n < 1 || first + n > options.stochastic.samples) throw new Error(`chunk [${first}, ${first + n}) lies outside the contract's ${options.stochastic.samples} paths`);
  const out = simulateSupplyFlow(params, { ...options, stochastic: { ...options.stochastic, samples: first + n } }, interventions);
  if (out.stochastic.mode !== 'seeded') throw new Error('the seeded contract answered a deterministic output');
  return out.stochastic.sample_totals.slice(first, first + n);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q; const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return sorted[lo] === undefined ? 0 : (sorted[lo] as number) + ((sorted[hi] as number) - (sorted[lo] as number)) * (pos - lo);
}

/**
 * THE RUN'S OUTPUTS from the chunks' paths in path order: the deterministic trajectory (the base the single execution reports beside its
 * samples) and the seeded block — the summary over the paths present, the paths themselves. Over EVERY declared path this is exactly
 * simulateSupplyFlow(contract) (the unit test pins the digest); over the completed chunks of a stopped experiment it is the partial
 * run's aggregate (its `samples` the paths present; the row's declaration says what is missing).
 */
export function assembleOutputs(params: SupplyFlowParams, options: SupplyFlowOptions, interventions: Intervention[], sampleTotals: Totals[]): SupplyFlowOutputs {
  if (options.stochastic.mode !== 'seeded') throw new Error('an experiment assembles a seeded contract');
  const base = simulateSupplyFlow(params, { ...options, stochastic: { mode: 'deterministic' } }, interventions);
  const { stochastic: _det, ...rest } = base;
  const summarise = (pick: (t: Totals) => number, fmt: (x: number) => string) => {
    const xs = sampleTotals.map(pick).sort((a, b) => a - b);
    return { min: fmt(xs[0] ?? 0), p10: fmt(quantile(xs, 0.1)), median: fmt(quantile(xs, 0.5)), p90: fmt(quantile(xs, 0.9)), max: fmt(xs[xs.length - 1] ?? 0) };
  };
  const three = (x: number) => roundHalfEven(x, 3); const money = (x: number) => roundHalfEven(x, 2);
  return { ...rest, stochastic: { mode: 'seeded', rng: RNG_ALGORITHM, seed: options.stochastic.seed, samples: sampleTotals.length, jitter: options.stochastic.jitter,
    summary: { line_stop_days: summarise((t) => t.line_stop_days, three), days_below_safety_stock: summarise((t) => t.days_below_safety_stock, three),
               total_cost: summarise((t) => Number(t.cost.total), money) },
    sample_totals: sampleTotals } };
}

/** The chunks' paths in path order, each chunk's digest re-checked against its stored paths (an altered row is refused, never assembled). */
export function pathsInOrder(chunks: Array<{ chunk_index: number; first_path: number; paths: number; digest: string; sample_totals: unknown }>): { totals: Totals[]; indexes: number[] } {
  const sorted = [...chunks].sort((a, b) => a.first_path - b.first_path);
  const totals: Totals[] = []; const indexes: number[] = [];
  for (const c of sorted) {
    const st = c.sample_totals as Totals[];
    if (!Array.isArray(st) || st.length !== c.paths) throw new Error(`chunk ${c.chunk_index} holds ${Array.isArray(st) ? st.length : 0} paths, not ${c.paths}`);
    if (digestOfJson(st) !== c.digest) throw new Error(`chunk ${c.chunk_index}'s paths no longer have the digest it recorded`);
    totals.push(...st); indexes.push(c.chunk_index);
  }
  return { totals, indexes };
}
