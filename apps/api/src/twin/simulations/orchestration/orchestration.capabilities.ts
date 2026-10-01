/**
 * ORCHESTRATION CAPABILITIES — CP-6 B31 part O (0099 §O; F-P5-06). The events.capabilities.ts idiom: one class, a view per port group.
 * Each write is a thin binding to a SECURITY DEFINER port that asserts the route's own action, the scope and the acting principal; each
 * read is an invoker read under the caller's RLS. Nothing here decides a rule a port decides.
 *
 *   declare     simulation.experiment.declare   simulation.declare_experiment
 *   approve     simulation.experiment.approve   simulation.approve_experiment (human-gated)
 *   start       simulation.experiment.start     simulation.start_experiment (the admission), simulation.fail_experiment_start
 *   bind        simulation.run                  simulation.bind_experiment_run (inside the run's opening write)
 *   operate     simulation.experiment.{pause,resume,cancel}
 *   execute     simulation.experiment.execute   claim / record / finish (the worker: the domain's attention agent), the SIM admission
 */
import { sql } from 'kysely';
import type { Tx } from '../../../shared/db.js';

type Row = Record<string, unknown>;

abstract class OrchestrationCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  /** The database's clock (every "as of now" read compares against it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface ExperimentReads {
  readonly action: string;
  now(): Promise<string>;
  experiment(experimentId: string): Promise<Row | null>;
  list(a: { state: string | null; limit: number }): Promise<Row[]>;
  /** The chunks done, with their paths, in path order (the assembly of a run's outputs). */
  chunkPaths(experimentId: string): Promise<Array<{ chunk_index: number; first_path: number; paths: number; digest: string; wall_ms: number | null; sample_totals: unknown }>>;
  /** The run row the experiment bound (the stored contract). */
  run(runId: string): Promise<Row | null>;
  /** The behaviour model's declared operating envelope (the sensitivity marks breaches against it). */
  operatingEnvelope(modelRef: string): Promise<Record<string, unknown>>;
}

type Common = { tenantId: string; domainId: string; actor: string; eventId: string; correlationId: string };

export interface ExperimentWrites extends ExperimentReads {
  declare(a: Common & { experimentId: string; declaration: Row }): Promise<Row>;
  approve(a: Common & { experimentId: string; budgetDigest: string; note: string }): Promise<Row>;
  start(a: Common & { experimentId: string; implementationDigest: string }): Promise<Row>;
  failStart(a: Common & { experimentId: string; reason: string }): Promise<Row>;
  pause(a: Common & { experimentId: string; reason: string }): Promise<Row>;
  resume(a: Common & { experimentId: string; reason: string | null }): Promise<Row>;
  cancel(a: Common & { experimentId: string; reason: string; doneChunks: number[]; outputs: unknown; outputsDigest: string | null; resource: unknown }): Promise<Row>;
}

export interface ExperimentBindWrites {
  bindRun(a: Common & { experimentId: string; runId: string }): Promise<Row>;
}

export interface ExperimentExecuteWrites extends ExperimentReads {
  claim(a: { tenantId: string; domainId: string; experimentId: string | null; exclude: string[]; leaseSeconds: number; actor: string; correlationId: string }): Promise<Row | null>;
  record(a: Common & { experimentId: string; chunkIndex: number; attempt: number; outcome: 'done' | 'failed'; sampleTotals: unknown; digest: string | null; wallMs: number; error: string | null }): Promise<Row>;
  finish(a: Common & { experimentId: string; outcome: string; reason: string; outputs: unknown; outputsDigest: string | null; sensitivity: unknown; headerDigest: string | null; resource: unknown }): Promise<Row>;
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
}

class OrchestrationCapabilityImpl extends OrchestrationCore implements ExperimentWrites, ExperimentBindWrites, ExperimentExecuteWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async experiment(experimentId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select simulation.experiment_read(${experimentId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async list(a: { state: string | null; limit: number }): Promise<Row[]> {
    const rows = await this.call<{ r: Row[] }>(sql`select simulation.experiments_list(${a.state}::text, ${a.limit}::int) as r`);
    return rows[0]?.r ?? [];
  }
  async chunkPaths(experimentId: string) {
    const rows = await this.call<{ r: Array<{ chunk_index: number; first_path: number; paths: number; digest: string; wall_ms: number | null; sample_totals: unknown }> }>(sql`select simulation.experiment_chunk_paths(${experimentId}::uuid) as r`);
    return rows[0]?.r ?? [];
  }
  async run(runId: string): Promise<Row | null> {
    const rows = await this.call<Row>(sql`select * from simulation.runs_current where run_id = ${runId}::uuid`);
    return rows[0] ?? null;
  }
  async operatingEnvelope(modelRef: string): Promise<Record<string, unknown>> {
    const rows = await this.call<{ operating_envelope: Record<string, unknown> }>(sql`select operating_envelope from twin.behaviour_models where method_ref = ${modelRef}`);
    return rows[0]?.operating_envelope ?? {};
  }
  async declare(a: Parameters<ExperimentWrites['declare']>[0]): Promise<Row> {
    return this.one(sql`select simulation.declare_experiment(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.declaration)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'declare_experiment');
  }
  async approve(a: Parameters<ExperimentWrites['approve']>[0]): Promise<Row> {
    return this.one(sql`select simulation.approve_experiment(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.budgetDigest}, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'approve_experiment');
  }
  async start(a: Parameters<ExperimentWrites['start']>[0]): Promise<Row> {
    return this.one(sql`select simulation.start_experiment(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.implementationDigest}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'start_experiment');
  }
  async failStart(a: Parameters<ExperimentWrites['failStart']>[0]): Promise<Row> {
    return this.one(sql`select simulation.fail_experiment_start(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'fail_experiment_start');
  }
  async pause(a: Parameters<ExperimentWrites['pause']>[0]): Promise<Row> {
    return this.one(sql`select simulation.pause_experiment(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'pause_experiment');
  }
  async resume(a: Parameters<ExperimentWrites['resume']>[0]): Promise<Row> {
    return this.one(sql`select simulation.resume_experiment(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'resume_experiment');
  }
  async cancel(a: Parameters<ExperimentWrites['cancel']>[0]): Promise<Row> {
    return this.one(sql`select simulation.cancel_experiment(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.doneChunks}::int[],
      ${a.outputs === null ? null : JSON.stringify(a.outputs)}::jsonb, ${a.outputsDigest}, ${a.resource === null ? null : JSON.stringify(a.resource)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'cancel_experiment');
  }
  async bindRun(a: Parameters<ExperimentBindWrites['bindRun']>[0]): Promise<Row> {
    return this.one(sql`select simulation.bind_experiment_run(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'bind_experiment_run');
  }
  async claim(a: Parameters<ExperimentExecuteWrites['claim']>[0]): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select simulation.claim_experiment_chunk(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.experimentId}::uuid, ${a.exclude}::uuid[], ${a.leaseSeconds}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async record(a: Parameters<ExperimentExecuteWrites['record']>[0]): Promise<Row> {
    return this.one(sql`select simulation.record_experiment_chunk(${a.experimentId}::uuid, ${a.chunkIndex}::int, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.attempt}::int, ${a.outcome},
      ${a.sampleTotals === null ? null : JSON.stringify(a.sampleTotals)}::jsonb, ${a.digest}, ${a.wallMs}::int, ${a.error}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'record_experiment_chunk');
  }
  async finish(a: Parameters<ExperimentExecuteWrites['finish']>[0]): Promise<Row> {
    const j = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
    return this.one(sql`select simulation.finish_experiment(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${a.reason}, ${j(a.outputs)}::jsonb, ${a.outputsDigest},
      ${j(a.sensitivity)}::jsonb, ${a.headerDigest}, ${j(a.resource)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'finish_experiment');
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }
}

export const OrchestrationCapability = {
  read(tx: Tx, action: string): ExperimentReads { return new OrchestrationCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ExperimentWrites { return new OrchestrationCapabilityImpl(tx, action); },
  bind(tx: Tx, action: string): ExperimentBindWrites { return new OrchestrationCapabilityImpl(tx, action); },
  execute(tx: Tx, action: string): ExperimentExecuteWrites { return new OrchestrationCapabilityImpl(tx, action); },
};
