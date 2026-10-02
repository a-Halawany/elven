/**
 * CP-6 B30 part `experiments` (0103 §EX) — THE FABRIC CAPABILITIES: the constraint capability's shape (one implementation, a narrow
 * interface per port group, every write a SECURITY DEFINER port that asserts the caller's own bound action; every read an INVOKER read
 * under the caller's RLS).
 *
 *   simulation.experiment.policy      → simulation.set_unstable_policy  (an experiment's declarer, starter, a twin owner, the administrator)
 *   simulation.adapter.quarantine     → simulation.quarantine_adapter   (a method steward, human-gated)
 *   simulation.retirement.run         → simulation.retire_run           (a run's operator, its twin's owner, a twin owner, the administrator; human-gated)
 *   simulation.retirement.experiment  → simulation.retire_experiment    (an experiment's declarer, starter, a twin owner, the administrator; human-gated)
 *   simulation.sweep.run              → simulation.sweep_envelope       (the analysis's requester)
 *   simulation.benchmark.validate     → simulation.validate_benchmark   (the validation's requester)
 *   simulation.fabric.read            → simulation.fabric_overview, simulation.run_retirement, the run row, the behaviour model
 */
import { sql } from 'kysely';
import type { Tx } from '../../../shared/db.js';

type Row = Record<string, unknown>;
interface Ids { tenantId: string; domainId: string; actor: string; correlationId: string }

export interface FabricReads {
  readonly action: string;
  now(): Promise<string>;
  overview(limit: number): Promise<Row>;
  runRetirement(runId: string): Promise<Row | null>;
  /** The run row (its stored contract and outputs) under the caller's RLS, or null. */
  run(runId: string): Promise<Row | null>;
  /** The behaviour model row of a method (operating envelope, containment, family). */
  model(modelRef: string): Promise<Row | null>;
}
export interface PolicyWrites extends FabricReads { setPolicy(a: Ids & { experimentId: string; policy: string; reason: string; eventId: string }): Promise<Row> }
export interface QuarantineWrites extends FabricReads { quarantine(a: Ids & { modelRef: string; runId: string | null; reason: string; eventId: string }): Promise<Row> }
export interface RetirementWrites extends FabricReads {
  retireRun(a: Ids & { retirementId: string; runId: string; reason: string; supersededBy: string | null }): Promise<Row>;
  retireExperiment(a: Ids & { retirementId: string; experimentId: string; reason: string; eventId: string }): Promise<Row>;
}
export interface SweepWrites extends FabricReads {
  sweep(a: Ids & { sweepId: string; runId: string; outputsDigest: string; metric: string; gridPoints: number; base: number; factors: unknown[]; interactions: unknown[]; digest: string }): Promise<Row>;
}
export interface BenchmarkWrites extends FabricReads {
  validate(a: Ids & { validationId: string; runId: string; outputsDigest: string; measure: string; kind: string; benchmark: Row; tolerance: number; tailThreshold: number | null;
                      discrepancy: unknown; tail: unknown; convergence: unknown; digest: string }): Promise<Row>;
}

class FabricCapabilityImpl implements PolicyWrites, QuarantineWrites, RetirementWrites, SweepWrites, BenchmarkWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows[0] as { r?: Row | null } | undefined)?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  private async maybe(q: ReturnType<typeof sql>): Promise<Row | null> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Row | null } | undefined)?.r) ?? null;
  }
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
  async overview(limit: number): Promise<Row> { return (await this.maybe(sql`select simulation.fabric_overview(${limit}::int) as r`)) ?? {}; }
  async runRetirement(runId: string): Promise<Row | null> { return this.maybe(sql`select simulation.run_retirement(${runId}::uuid) as r`); }
  async run(runId: string): Promise<Row | null> {
    const r = await sql`select * from simulation.runs_current where run_id = ${runId}::uuid`.execute(this.#tx);
    return (r.rows[0] as Row | undefined) ?? null;
  }
  async model(modelRef: string): Promise<Row | null> {
    const r = await sql`select * from twin.behaviour_models where method_ref = ${modelRef}`.execute(this.#tx);
    return (r.rows[0] as Row | undefined) ?? null;
  }
  async setPolicy(a: Parameters<PolicyWrites['setPolicy']>[0]) {
    return this.one(sql`select simulation.set_unstable_policy(${a.experimentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.policy}, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'set_unstable_policy');
  }
  async quarantine(a: Parameters<QuarantineWrites['quarantine']>[0]) {
    return this.one(sql`select simulation.quarantine_adapter(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.modelRef}, ${a.runId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'quarantine_adapter');
  }
  async retireRun(a: Parameters<RetirementWrites['retireRun']>[0]) {
    return this.one(sql`select simulation.retire_run(${a.retirementId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.reason}, ${a.supersededBy}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_run');
  }
  async retireExperiment(a: Parameters<RetirementWrites['retireExperiment']>[0]) {
    return this.one(sql`select simulation.retire_experiment(${a.retirementId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.experimentId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'retire_experiment');
  }
  async sweep(a: Parameters<SweepWrites['sweep']>[0]) {
    return this.one(sql`select simulation.sweep_envelope(${a.sweepId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.outputsDigest}, ${a.metric}, ${a.gridPoints}::int, ${a.base}::numeric,
      ${JSON.stringify(a.factors)}::jsonb, ${JSON.stringify(a.interactions)}::jsonb, ${a.digest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'sweep_envelope');
  }
  async validate(a: Parameters<BenchmarkWrites['validate']>[0]) {
    return this.one(sql`select simulation.validate_benchmark(${a.validationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.outputsDigest}, ${a.measure}, ${a.kind},
      ${JSON.stringify(a.benchmark)}::jsonb, ${a.tolerance}::numeric, ${a.tailThreshold}::numeric, ${JSON.stringify(a.discrepancy)}::jsonb, ${JSON.stringify(a.tail)}::jsonb,
      ${JSON.stringify(a.convergence)}::jsonb, ${a.digest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'validate_benchmark');
  }
}

export const FabricCapability = {
  read(tx: Tx, action: string): FabricReads { return new FabricCapabilityImpl(tx, action); },
  policy(tx: Tx, action: string): PolicyWrites { return new FabricCapabilityImpl(tx, action); },
  quarantine(tx: Tx, action: string): QuarantineWrites { return new FabricCapabilityImpl(tx, action); },
  retirement(tx: Tx, action: string): RetirementWrites { return new FabricCapabilityImpl(tx, action); },
  sweep(tx: Tx, action: string): SweepWrites { return new FabricCapabilityImpl(tx, action); },
  benchmark(tx: Tx, action: string): BenchmarkWrites { return new FabricCapabilityImpl(tx, action); },
};
