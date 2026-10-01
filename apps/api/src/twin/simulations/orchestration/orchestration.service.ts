/**
 * SIMULATION ORCHESTRATION — CP-6 B31 part O (0099 §O; F-P5-06: L8-C06, V03-T-149/-153/-155/-344..-347/-354, ES-38-007..-009,
 * V04-T-033/-034, PR-35-001..-005, CAP-DS-04/-05, WS-13, JRN-14).
 *
 * THE ROUTES' LOGIC. An experiment is DECLARED (simulation.experiment.declare), its budget APPROVED by a named human other than the
 * declarer (simulation.experiment.approve, human-gated), STARTED (three governed steps, the run route's own order: the ADMISSION —
 * simulation.experiment.start, a refusal recorded and answered 409 —; the evidence and the constraint gate read OUTSIDE any write
 * (SimulationService.prepareRun / retrieveEvidence / checkGate, the B21 rule); the RUN opened through the existing open path
 * (SimulationService.open under simulation.run — every gate of simulation.open_run applies: fitness, coherence, the suspension trigger,
 * the envelope, the inputs' availability) and BOUND to the experiment in that same write (SimulationStarted published as by the run
 * route); a refused opening FAILS the experiment with the refusal as its reason), PAUSED, RESUMED and CANCELLED (the run partial over the
 * chunks done, assembled here, or failed when none).
 *
 * THE WORKER (drainOnce). The background executor is the domain's ATTENTION AGENT: an after-tick hook (`simulation-experiments`) runs
 * once the agent's tick has committed, under the agent's own session — the repository's precedent for governed background work (the
 * B28 warning raise, the B34 commitment signals). Per running experiment (oldest first, at most five per tick) and up to its declared
 * pace of chunks: CLAIM (simulation.experiment.execute: the next chunk FOR UPDATE SKIP LOCKED with a lease, or a lapsed lease's chunk
 * reclaimed), EXECUTE the chunk OUTSIDE any write in a SEPARATE PROCESS (experiment-chunk-worker.js, bounded: 60 s, 256 MB heap,
 * environment PATH/NODE_ENV only; the answer's digest recomputed here), RECORD it (the port computes the chunk's aggregate itself,
 * checkpoints, decides the stop), and FINISH when the port says so (the run completed from the aggregate over every chunk — the SIM
 * object admitted under the worker's own action, SimulationCompleted published —, partial with its declaration, or failed). A pause is
 * honoured between chunks; a crash mid-chunk leaves a running chunk whose lease lapses and is reclaimed (the attempt fenced). A harness
 * drives it with the attention timer's tickNow; the test runtime may replace the executor (useExecutorForTests) to inject faults.
 *
 * Left out (said): distributed execution across machines (the worker is per process; FOR UPDATE SKIP LOCKED and the lease make
 * several processes safe, but nothing schedules across hosts), the Simulation Agent preparing experiments (AG-021), methods other than
 * supply-flow@1 (a method-fabric adapter does not execute in chunks of a seeded stream).
 */
import { HttpException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader, type Envelope } from '@eye/contracts';
import { newId } from '../../../shared/ids.js';
import type { ScopeContext } from '../../../shared/scope.js';
import type { AuthenticatedPrincipal } from '../../../shared/auth-types.js';
import { EYE_CONFIG } from '../../../config/config.module.js';
import type { EyeConfig } from '../../../config/config.js';
import { PipelineService } from '../../../pipeline/pipeline.service.js';
import type { Reader } from '../../../prediction/series/series.service.js';
import { controlsOf, foldControls } from '../../../prediction/controls.js';
import { AttentionTickRegistry } from '../../../executive/attention/tick.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../../models/supply-flow.digest.js';
import type { Totals } from '../../models/supply-flow.js';
import { SimulationCapability, type Resource } from '../../simulation.capabilities.js';
import { SimulationService, contractOf, environmentOf, sensitivityOf, validateRunIntake } from '../simulation.service.js';
import { simulationCompletedEvent, simulationStartedEvent } from '../simulation-events.js';
import { OrchestrationCapability, type ExperimentExecuteWrites, type ExperimentWrites } from './orchestration.capabilities.js';
import { CHUNK_CONTAINMENT, assembleOutputs, digestOfJson, pathsInOrder, runIntakeOf, type ExperimentIntake } from './experiment-plan.js';

type Row = Record<string, unknown>;
export const EXPERIMENT_OBJECT_TYPE = 'SXP';
export const EXPERIMENT_HOOK = 'simulation-experiments';
const LEASE_SECONDS = 300;
const EXPERIMENTS_PER_DRAIN = 5;
const DRAIN_WALL_MS = 50_000;

/** What one chunk's execution came to (the separate process's answer, re-checked here). */
export type ChunkExecution = { ok: true; sampleTotals: Totals[]; digest: string; wallMs: number; pid: number | null } | { ok: false; error: string; wallMs: number };
/** The executor of one claimed chunk (the product's: a separate process; the test runtime's double may replace it). */
export type ChunkExecutor = (claimed: Row) => Promise<ChunkExecution>;

/** experiment-chunk-worker.js in the built tree (the method runner's resolution): beside this file in dist, or the dist beside a source checkout. */
export function chunkWorkerPath(): string | null {
  const candidates: string[] = [];
  const here = typeof __dirname === 'string' ? __dirname : null;
  if (here !== null) {
    candidates.push(join(here, 'experiment-chunk-worker.js'));
    candidates.push(join(here.replace(/([\\/])src([\\/])/, '$1dist$2'), 'experiment-chunk-worker.js'));
  }
  candidates.push(join(process.cwd(), 'dist', 'twin', 'simulations', 'orchestration', 'experiment-chunk-worker.js'));
  candidates.push(join(process.cwd(), 'apps', 'api', 'dist', 'twin', 'simulations', 'orchestration', 'experiment-chunk-worker.js'));
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** THE PRODUCT'S EXECUTOR: one chunk in a separate process under the containment's bounds; the digest recomputed from the paths it answered. */
export const processExecutor: ChunkExecutor = async (claimed) => {
  const worker = chunkWorkerPath();
  const t0 = performance.now();
  if (worker === null) return { ok: false, error: 'no chunk executor is installed beside the orchestration (experiment-chunk-worker.js)', wallMs: 0 };
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { PATH: process.env['PATH'] ?? '', NODE_ENV: process.env['NODE_ENV'] ?? 'production', EYE_EXPERIMENT_CHUNK_WORKER: '1' };
    const child = execFile(process.execPath, [`--max-old-space-size=${CHUNK_CONTAINMENT.max_old_space_mb}`, worker],
      { timeout: CHUNK_CONTAINMENT.timeout_ms, killSignal: 'SIGKILL', maxBuffer: 256 * 1024 * 1024, env, windowsHide: true }, (error, stdout, stderr) => {
        const wallMs = Math.round(performance.now() - t0);
        if (error) {
          const e = error as unknown as { killed?: boolean; signal?: string | null; code?: number | string };
          const tail = String(stderr ?? '').slice(-300).trim().split('\n').at(-1) ?? '';
          resolve({ ok: false, wallMs, error: e.killed === true && e.signal === 'SIGKILL' ? `the chunk ran past its bound of ${CHUNK_CONTAINMENT.timeout_ms} ms and was killed`
            : /heap out of memory|allocation failed/i.test(String(stderr ?? '')) ? `the chunk exhausted its heap bound of ${CHUNK_CONTAINMENT.max_old_space_mb} MB`
            : `the chunk's process ended abnormally (${e.signal ?? `exit ${String(e.code)}`})${tail ? `: ${tail}` : ''}`.slice(0, 500) });
          return;
        }
        let out: Row;
        try { out = JSON.parse(String(stdout)) as Row; } catch { resolve({ ok: false, wallMs, error: 'the chunk\'s process answered something that is not JSON' }); return; }
        if (typeof out['error'] === 'string') { resolve({ ok: false, wallMs, error: `the chunk failed: ${out['error']}`.slice(0, 500) }); return; }
        const totals = out['sample_totals'] as Totals[];
        if (!Array.isArray(totals) || totals.length !== Number(claimed['paths'])) { resolve({ ok: false, wallMs, error: 'the chunk\'s process answered the wrong number of paths' }); return; }
        if (out['implementation_digest'] !== SUPPLY_FLOW_IMPLEMENTATION_DIGEST) { resolve({ ok: false, wallMs, error: 'the chunk\'s process ran an implementation other than the pinned one' }); return; }
        const digest = digestOfJson(totals);
        if (out['digest'] !== digest) { resolve({ ok: false, wallMs, error: 'the chunk\'s process attested a digest its paths do not have' }); return; }
        resolve({ ok: true, sampleTotals: totals, digest, wallMs, pid: typeof out['pid'] === 'number' ? out['pid'] : null });
      });
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(JSON.stringify({ run: claimed['run'], first_path: claimed['first_path'], paths: claimed['paths'] }));
  });
};

const bad = (correlationId: string, msg: string, status = 422): never => { throw new HttpException(errorBody(status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001', correlationId, msg), status); };
/** The predicted inputs' inherited validation, by name (complete()'s rule). */
const inheritedOf = (r: Row): Row[] => (((r['initial_state'] ?? []) as Row[]).filter((e) => e['kind'] === 'predicted' && e['inherited_validation']).map((e) => ({
  key: e['key'], forecast: ((e['citations'] ?? []) as Row[]).filter((c) => c['kind'] === 'forecast').map((c) => `FCT:${String(c['id'])}@${String(c['version'])}`).join(','), state: String(e['inherited_validation']) })));
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

@Injectable()
export class OrchestrationService implements OnModuleInit {
  private readonly log = new Logger('simulation.orchestration');
  private executor: ChunkExecutor = processExecutor;

  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService, private readonly simulations: SimulationService,
              @Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}

  /** THE WORKER registers itself as an after-tick hook of the attention tick (the host never names a section). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: experiments are not executed in the background'); return; }
    registry.registerAfter({ name: EXPERIMENT_HOOK, run: async (a) => this.drainOnce({ principal: a.principal, tenantId: a.tenantId, domainId: a.domainId, correlationId: a.correlationId }) });
  }

  /** TEST CONTROL ONLY: replace the chunk executor with a double (a fault, a slow chunk), or restore the product's with null. */
  useExecutorForTests(executor: ChunkExecutor | null): void {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('useExecutorForTests is available only in the test runtime');
    this.executor = executor ?? processExecutor;
  }

  // ───────────────────────── the routes ─────────────────────────

  async declare(cap: ExperimentWrites, scope: ScopeContext, intake: ExperimentIntake, actor: string, correlationId: string, experimentId: string): Promise<Row> {
    // The run contract is judged NOW by the run route's own intake rule (the experiment's stochastic block added): a malformed contract never waits for its approval.
    validateRunIntake(runIntakeOf({ run_intake: intake.run, twin_id: intake.twinId, twin_version: intake.twinVersion, scenario_id: intake.scenarioId, scenario_branch_id: intake.scenarioBranchId,
                                    seed: intake.seed, paths: intake.paths, jitter: intake.jitter }), correlationId);
    const { twinId: _t, twinVersion: _v, scenarioId: _s, scenarioBranchId: _b, ...run } = intake.run as Row & { twinId?: unknown; twinVersion?: unknown; scenarioId?: unknown; scenarioBranchId?: unknown };
    return cap.declare({ experimentId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor, eventId: newId(), correlationId,
      declaration: { title: intake.title, question: intake.question, twin_id: intake.twinId, twin_version: intake.twinVersion, scenario_id: intake.scenarioId, scenario_branch_id: intake.scenarioBranchId,
                     method_ref: intake.methodRef, run_intake: run, measures: intake.measures, expected_outputs: intake.expectedOutputs ?? undefined, paths: intake.paths, chunk_size: intake.chunkSize,
                     seed: intake.seed, jitter: intake.jitter, budget: intake.budget, stop_conditions: { converged: intake.stopConditions.converged }, pace: intake.pace } });
  }

  /**
   * START: the admission (recorded either way), then the run opened through the existing path and bound — or the experiment failed with
   * the opening's refusal. Answers the experiment as read after the last write.
   */
  async start(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, experimentId: string): Promise<{ experiment: Row; receipt: { policyDecisionId: string; auditSeq: number } }> {
    const corr = envelope.correlation_id;
    const route = (action: string, type: string, id: string | null) => ({ scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: type, objectId: id });
    const admitted = await this.pipeline.write(envelope, principal, route('simulation.experiment.start', EXPERIMENT_OBJECT_TYPE, experimentId), OrchestrationCapability.write,
      async (cap) => ({ result: await cap.start({ experimentId, tenantId, domainId, implementationDigest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST, actor: principal.principalId, eventId: newId(), correlationId: corr }),
                        targetType: EXPERIMENT_OBJECT_TYPE, targetId: experimentId, targetVersion: null, outboxEvent: null }));
    const e = admitted.result;
    if (e['admitted'] !== true) {
      const reasons = (((e['admission'] ?? {}) as Row)['reasons'] ?? []) as string[];
      bad(corr, `experiment rejected (admission): experiment ${experimentId} was not admitted — ${reasons.join('; ')} (the refusal is recorded)`, 409);
    }
    const runId = newId();
    try {
      const intake = validateRunIntake(runIntakeOf(e), corr);
      const reader: Reader = { principal, tenantId, domainId, correlationId: corr, purposeId: envelope.purpose_id ?? 'simulation' };
      const prepared = (await this.pipeline.consequentialRead({ ...envelope, action: 'simulation.read', side_effect_class: 'none', message_id: newId() } as Envelope, principal,
        route('simulation.read', 'SIM', null), SimulationCapability.read, async (cap) => this.simulations.prepareRun(cap, intake, runId))).result;
      if (prepared.path !== 'supply-flow') bad(corr, `experiment rejected (method): the run of experiment ${experimentId} is not a supply-flow@1 run`);
      const evidence = await this.simulations.retrieveEvidence(reader, prepared.citations, 'simulation.run', { twin_id: intake.twinId, version: String(intake.twinVersion), component: intake.component });
      const verdict = prepared.subject === null ? null : await this.simulations.checkGate({ tenantId, domainId }, prepared.subject);
      if (verdict !== null) this.simulations.refuseViolation(verdict, corr);
      const opened = await this.pipeline.write({ ...envelope, action: 'simulation.run', message_id: newId() } as Envelope, principal, route('simulation.run', 'SIM', runId),
        (tx, action) => ({ run: SimulationCapability.run(tx, action), bind: OrchestrationCapability.bind(tx, action) }),
        async (c, scope) => {
          const r = await this.simulations.open(c.run, scope, evidence, intake, principal.principalId, corr, runId, verdict);
          const bound = await c.bind.bindRun({ experimentId, runId, tenantId, domainId, actor: principal.principalId, eventId: newId(), correlationId: corr });
          return { result: bound, targetType: 'SIM', targetId: runId, targetVersion: '0',
                   outboxEvent: simulationStartedEvent({ runId, opened: r.opened, intake, scenario: r.scenario, shockBasis: r.shockBasis, modelRef: r.modelRef, implementationDigest: r.implementationDigest,
                     environmentDigest: r.environmentDigest, environment: r.environment, inputsDigest: r.inputsDigest, rng: r.rng, twinFitness: r.twinFitness, envelope: r.envelope,
                     envelopeAck: r.envelopeAck, challengeId: r.challengeId, operator: principal.principalId, occurredAt: new Date().toISOString() }) };
        });
      return { experiment: opened.result, receipt: { policyDecisionId: opened.policyDecisionId, auditSeq: opened.auditSeq } };
    } catch (err) {
      const reason = textOf(err);
      try {
        await this.pipeline.write({ ...envelope, message_id: newId() } as Envelope, principal, route('simulation.experiment.start', EXPERIMENT_OBJECT_TYPE, experimentId), OrchestrationCapability.write,
          async (cap) => ({ result: await cap.failStart({ experimentId, tenantId, domainId, reason: `the run was refused at opening: ${reason}`.slice(0, 1000), actor: principal.principalId, eventId: newId(), correlationId: corr }),
                            targetType: EXPERIMENT_OBJECT_TYPE, targetId: experimentId, targetVersion: null, outboxEvent: null }));
      } catch (e2) { this.log.error(`experiment ${experimentId}: the failed start could not be recorded: ${textOf(e2).slice(0, 200)}`); }
      throw err;
    }
  }

  /** CANCEL: the run partial over the chunks done (assembled here from their paths, re-checked), or failed when none; the port fences the chunk set. */
  async cancel(cap: ExperimentWrites, scope: ScopeContext, experimentId: string, reason: string, actor: string, correlationId: string): Promise<Row> {
    const e = await cap.experiment(experimentId);
    if (e === null) bad(correlationId, `experiment rejected (unknown_experiment): ${experimentId} is not an experiment of this domain`, 404);
    let outputs: unknown = null; let digest: string | null = null; let resource: Resource | null = null; let done: number[] = [];
    const runId = (e as Row)['run_id'];
    if (typeof runId === 'string') {
      const chunks = await cap.chunkPaths(experimentId);
      if (chunks.length > 0) {
        const run = await cap.run(runId);
        if (run === null) bad(correlationId, `experiment rejected (unknown_run): run ${runId} is not readable`, 404);
        const c = contractOf(run as Row);
        const { totals, indexes } = pathsInOrder(chunks);
        const o = assembleOutputs(c.params, c.options, c.interventions, totals);
        outputs = o; digest = digestOfJson(o); done = indexes;
        resource = this.resourceOf(chunks.reduce((s, x) => s + Number(x.wall_ms ?? 0), 0), totals.length);
      }
    }
    return cap.cancel({ experimentId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, reason, doneChunks: done, outputs, outputsDigest: digest, resource, actor, eventId: newId(), correlationId });
  }

  // ───────────────────────── the worker ─────────────────────────

  private env(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null, correlationId: string): Envelope {
    return { message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`, purpose_id: 'simulation', action,
             side_effect_class: 'reversible', consequence_class: 'C2', object_type: objectType, object_id: objectId, schema_version: 'v1', issued_at: new Date().toISOString(),
             clock_quality: 'trusted', correlation_id: correlationId, trace_id: 'experiment-worker' } as unknown as Envelope;
  }

  private exec<T>(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }, objectId: string | null,
                  handler: (cap: ExperimentExecuteWrites, scope: ScopeContext) => Promise<{ result: T; outboxEvent?: { eventType: string; payload: Record<string, unknown> } | null }>): Promise<T> {
    const action = 'simulation.experiment.execute';
    return this.pipeline.write(this.env(a.principal, a.tenantId, a.domainId, action, EXPERIMENT_OBJECT_TYPE, objectId, a.correlationId), a.principal,
      { scope: 'DOMAIN' as const, tenantId: a.tenantId, domainId: a.domainId, action, objectType: EXPERIMENT_OBJECT_TYPE, objectId }, OrchestrationCapability.execute,
      async (cap, scope) => { const r = await handler(cap, scope); return { result: r.result, targetType: EXPERIMENT_OBJECT_TYPE, targetId: objectId, targetVersion: null, outboxEvent: r.outboxEvent ?? null }; })
      .then((o) => o.result);
  }

  /**
   * ONE DRAIN (the after-tick hook; a harness calls it through the tick): every running experiment of the domain (oldest first, at most
   * five), up to its pace of chunks each, within a wall bound. Answers what it did; a refusal of one step is recorded in the answer and
   * the drain moves on (the next tick retries from the rows).
   */
  async drainOnce(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    const t0 = performance.now();
    const visited: string[] = []; const steps: Row[] = []; let chunks = 0;
    for (let k = 0; k < EXPERIMENTS_PER_DRAIN && performance.now() - t0 < DRAIN_WALL_MS; k += 1) {
      let claimed: Row | null;
      try { claimed = await this.exec(a, null, async (cap) => ({ result: await cap.claim({ tenantId: a.tenantId, domainId: a.domainId, experimentId: null, exclude: visited, leaseSeconds: LEASE_SECONDS, actor: a.principal.principalId, correlationId: a.correlationId }) })); }
      catch (e) { steps.push({ step: 'claim', error: textOf(e).slice(0, 300) }); break; }
      if (claimed === null) break;
      const experimentId = String(claimed['experiment_id']);
      visited.push(experimentId);
      let done = 0;
      for (;;) {
        if (claimed === null) break;
        if (claimed['kind'] === 'finish') {
          steps.push(await this.finish(a, experimentId, String(claimed['outcome']), String(claimed['reason'])));
          break;
        }
        const ran = await this.executor(claimed);
        chunks += 1; done += 1;
        let rec: Row;
        try {
          rec = await this.exec(a, experimentId, async (cap) => ({ result: await cap.record({ experimentId, chunkIndex: Number(claimed!['chunk_index']), attempt: Number(claimed!['attempt']), tenantId: a.tenantId, domainId: a.domainId,
            outcome: ran.ok ? 'done' : 'failed', sampleTotals: ran.ok ? ran.sampleTotals : null, digest: ran.ok ? ran.digest : null, wallMs: ran.wallMs, error: ran.ok ? null : ran.error,
            actor: a.principal.principalId, eventId: newId(), correlationId: a.correlationId }) }));
        } catch (e) { steps.push({ step: 'record', experiment_id: experimentId, chunk_index: claimed['chunk_index'], error: textOf(e).slice(0, 300) }); break; }
        steps.push({ step: 'chunk', experiment_id: experimentId, chunk_index: claimed['chunk_index'], attempt: claimed['attempt'], outcome: ran.ok ? 'done' : 'failed', wall_ms: ran.wallMs, next: rec['next'] });
        if (rec['next'] === 'finish') { steps.push(await this.finish(a, experimentId, String(rec['outcome']), String(rec['reason']))); break; }
        if (rec['next'] !== 'continue' || done >= Number(claimed['chunks_per_tick'] ?? 1) || performance.now() - t0 >= DRAIN_WALL_MS) break;
        try { claimed = await this.exec(a, experimentId, async (cap) => ({ result: await cap.claim({ tenantId: a.tenantId, domainId: a.domainId, experimentId, exclude: [], leaseSeconds: LEASE_SECONDS, actor: a.principal.principalId, correlationId: a.correlationId }) })); }
        catch (e) { steps.push({ step: 'claim', experiment_id: experimentId, error: textOf(e).slice(0, 300) }); break; }
      }
    }
    return { experiments: visited.length, chunks, elapsed_ms: Math.round(performance.now() - t0), steps };
  }

  private resourceOf(wallMs: number, samples: number): Resource {
    const env = environmentOf();
    return { elapsed_ms: wallMs, samples_run: samples, process: { node: env.node, platform: env.platform, arch: env.arch }, memory_rss_bytes: process.memoryUsage().rss };
  }

  /**
   * THE FINISH (simulation.experiment.execute): the pending outcome written. COMPLETED: the outputs assembled from every chunk's paths (each
   * chunk's digest re-checked), the sensitivity of the deterministic trajectory (one-at-a-time ±relative over the assumed elements — the
   * paths are not re-swept), the SIM object admitted (synthetic; the experiment named in its payload) and SimulationCompleted published.
   * PARTIAL: the outputs over the chunks done; the port declares what is missing. FAILED: nothing ran.
   */
  private async finish(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }, experimentId: string, outcome: string, reason: string): Promise<Row> {
    try {
      const out = await this.exec(a, experimentId, async (cap, scope) => {
        if (outcome === 'failed') {
          return { result: await cap.finish({ experimentId, tenantId: a.tenantId, domainId: a.domainId, outcome, reason, outputs: null, outputsDigest: null, sensitivity: null, headerDigest: null, resource: null,
                                              actor: a.principal.principalId, eventId: newId(), correlationId: a.correlationId }) };
        }
        const e = await cap.experiment(experimentId);
        const runId = String((e ?? {})['run_id']);
        const run = await cap.run(runId);
        if (e === null || run === null) throw new Error(`experiment ${experimentId} or its run is not readable`);
        const chunks = await cap.chunkPaths(experimentId);
        const c = contractOf(run);
        const { totals } = pathsInOrder(chunks);
        const outputs = assembleOutputs(c.params, c.options, c.interventions, totals);
        const outputsDigest = digestOfJson(outputs);
        const resource = this.resourceOf(chunks.reduce((s, x) => s + Number(x.wall_ms ?? 0), 0), totals.length);
        if (outcome !== 'completed') {
          return { result: await cap.finish({ experimentId, tenantId: a.tenantId, domainId: a.domainId, outcome, reason, outputs, outputsDigest, sensitivity: null, headerDigest: null, resource,
                                              actor: a.principal.principalId, eventId: newId(), correlationId: a.correlationId }) };
        }
        const envelope = await cap.operatingEnvelope(String(run['model_ref']));
        const sens = sensitivityOf(c.params, { ...c.options, stochastic: { mode: 'deterministic' } }, c.interventions, c.assumptions, c.sensitivityRelative, envelope);
        const sensitivity = { ...sens, basis: 'the deterministic trajectory of the contract (one-at-a-time ±relative over the assumed elements); the experiment\'s paths are not re-swept' };
        const sim = this.simObjectOf(run, scope, experimentId, outputs.totals, outputsDigest, sensitivity, a.correlationId);
        await cap.admitObject(sim.header, sim.payload, sim.headerDigest);
        const finished = await cap.finish({ experimentId, tenantId: a.tenantId, domainId: a.domainId, outcome, reason, outputs, outputsDigest, sensitivity, headerDigest: sim.headerDigest, resource,
                                            actor: a.principal.principalId, eventId: newId(), correlationId: a.correlationId });
        const event = simulationCompletedEvent({ runId, state: 'completed', run, outputsDigest, totals: outputs.totals, impacts: { control_run_id: run['control_run_id'] === null ? null : String(run['control_run_id']), deltas: null },
          sensitivity: { relative: sens.relative, outside_envelope: sens.outside_envelope, factors: sens.factors },
          validation: { validation_status: run['validation_status'] === null || run['validation_status'] === undefined ? null : String(run['validation_status']), inherited_validation: inheritedOf(run), outside_envelope: sens.outside_envelope },
          resource, simObject: { object_id: runId, version: 1, header_digest: sim.headerDigest }, failure: null, actor: a.principal.principalId, occurredAt: new Date().toISOString() });
        const payload = event.payload as Row;
        return { result: finished, outboxEvent: { eventType: event.eventType, payload: { ...payload, cause: { ...(payload['cause'] as Row), action: 'simulation.experiment.execute', experiment_id: experimentId } } } };
      });
      return { step: 'finish', experiment_id: experimentId, outcome, reason, state: out['state'] };
    } catch (e) {
      return { step: 'finish', experiment_id: experimentId, outcome, reason, error: textOf(e).slice(0, 300) };
    }
  }

  /** The SIM object of an experiment's completed run: complete()'s header and payload (simulation.service.ts), the experiment named, SYNTHETIC. */
  private simObjectOf(r: Row, ctx: ScopeContext, experimentId: string, totals: unknown, outputsDigest: string, sensitivity: { relative: number; factors: Array<Record<string, unknown>>; outside_envelope: boolean },
                      correlationId: string): { header: CanonicalHeader; payload: Row; headerDigest: string } {
    const runId = String(r['run_id']);
    const controls = foldControls([controlsOf(r['controls']) ?? { synthetic_state: true, classification: 'restricted' }]);
    const now = new Date().toISOString();
    const scenarioId = r['scenario_id'] === null || r['scenario_id'] === undefined ? null : String(r['scenario_id']);
    const scenarioVersion = r['scenario_version'] === null || r['scenario_version'] === undefined ? null : Number(r['scenario_version']);
    const day = (v: unknown): string | null => (v === null || v === undefined ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
    const payload: Row = {
      twin: { twin_id: r['twin_id'], version: Number(r['twin_version']), branch_id: r['branch_id'] }, run_kind: r['run_kind'], control_run_id: r['control_run_id'] ?? null, corrects_run_id: r['corrects_run_id'] ?? null,
      scenario: scenarioId === null ? null : { scenario_id: scenarioId, version: scenarioVersion, branch_id: r['scenario_branch_id'], branch_state: r['scenario_branch_state'], flip_event_id: r['scenario_flip_event'] ?? null },
      shock: r['shock'], shock_basis: String(r['shock_basis']), component: r['component'],
      cutoffs: { known_at: r['known_at'] instanceof Date ? r['known_at'].toISOString() : new Date(String(r['known_at'])).toISOString(), observed_through: day(r['observed_through']) },
      initial_state_digest: r['initial_state_digest'], model: { ref: r['model_ref'], implementation_digest: r['implementation_digest'] },
      environment: { digest: r['environment_digest'], ...(r['environment'] as Row) },
      stochastic: { mode: 'seeded', rng: r['rng'], seed: Number(r['seed']), samples: Number(r['samples']), jitter: r['jitter'] },
      interventions: r['interventions'], constraints: r['constraints'], assumptions: r['assumptions'], inputs_digest: r['inputs_digest'], outputs_digest: outputsDigest,
      totals, sensitivity: { relative: sensitivity.relative, carrying: sensitivity.factors.slice(0, 3).map((f) => ({ key: f['key'], cost_spread: f['cost_spread'] })) },
      outside_envelope: sensitivity.outside_envelope, validation_status: r['validation_status'], inherited_validation: inheritedOf(r), operator: `principal:${String(r['operator_principal_id'])}`,
      experiment: { experiment_id: experimentId, executed: 'in chunks by the background worker; the manifest binds every chunk' },
    };
    const header: CanonicalHeader = {
      object_id: runId, object_type: 'SIM', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active',
      owning_component: 'CP-SIM-01', accountable_owner: `principal:${String(r['operator_principal_id'])}`,
      source_object_ids: [`TWN:${String(r['twin_id'])}@${String(r['twin_version'])}`, ...(r['control_run_id'] ? [`SIM:${String(r['control_run_id'])}@1`] : []), ...(scenarioId === null ? [] : [`SCN:${scenarioId}@${String(scenarioVersion)}`])],
      event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'synthetic', synthetic_state: true, confidence: null, uncertainty: null,
      evidence_refs: [], provenance_ref: `twin:${String(r['twin_id'])}@${String(r['twin_version'])}`, method_ref: `${String(r['model_ref'])}#${String(r['implementation_digest']).slice(0, 16)}`,
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${String(r['operator_principal_id'])}`],
      classification: controls.classification, purpose_scope: 'simulation', rights_profile: controls.rights_profile, residency_profile: controls.residency_profile,
      retention_profile: controls.retention_profile, access_policy_ref: controls.access_policy_ref, quality_profile: null,
      quality_state: { validation: r['validation_status'], outside_envelope: sensitivity.outside_envelope, shock_basis: r['shock_basis'] }, freshness_state: null, schema_ref: 'SIM@v2', ontology_ref: null,
      correction_of: r['corrects_run_id'] ? `SIM:${String(r['corrects_run_id'])}@1` : null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `simulation header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    return { header, payload, headerDigest: canonicalHeaderDigest(header, payload) };
  }
}
