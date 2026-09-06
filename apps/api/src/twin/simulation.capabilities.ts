/**
 * SIMULATION CAPABILITIES — Phase 5 (L8), stage P5-M3. Narrow interfaces over
 * SECURITY DEFINER ports; the experiment contract is bound at opening, the
 * outputs at completion, and a reproduction is recorded with its verdict.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SimulationReads {
  readonly action: string;
  readRuns(): any;
  readRunEvents(): any;
  readReproductions(): any;
  readTwins(): any;
  readVersions(): any;
  readElements(): any;
  readBehaviourModels(): any;
  rebuildProjections(): Promise<Array<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface OpenRunArgs {
  runId: string; tenantId: string; domainId: string; twinId: string; twinVersion: number; runKind: 'control' | 'intervention';
  controlRunId: string | null; correctsRunId: string | null; scenarioId: string | null; scenarioBranchId: string | null; shock: boolean; component: string;
  modelRef: string; implementationDigest: string; environmentDigest: string; environment: unknown;
  stochasticMode: 'deterministic' | 'seeded'; rng: string | null; seed: number | null; samples: number | null; jitter: unknown | null;
  interventions: unknown[]; constraints: Record<string, unknown>; assumptions: Record<string, unknown>; inputsDigest: string; validationStatus: string;
  actor: string; eventId: string; correlationId: string;
}
export interface OpenedRun {
  initial_state: unknown[]; initial_state_digest: string; known_at: string; observed_through: string | null; branch_id: string;
  synthetic_state: boolean; controls: unknown; verification_state: string;
}

export interface RunWrites extends SimulationReads {
  openRun(a: OpenRunArgs): Promise<OpenedRun>;
}
export interface CompleteWrites extends SimulationReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  completeRun(a: { runId: string; tenantId: string; domainId: string; outputs: unknown; outputsDigest: string; sensitivity: unknown; outsideEnvelope: boolean;
                   headerDigest: string; actor: string; eventId: string; correlationId: string }): Promise<void>;
  failRun(a: { runId: string; tenantId: string; domainId: string; failure: string; actor: string; eventId: string; correlationId: string }): Promise<void>;
}
export interface ReproduceWrites extends SimulationReads {
  recordReproduction(a: { reproductionId: string; tenantId: string; domainId: string; runId: string; verdict: 'reproduced' | 'mismatch' | 'unreproducible';
                          expected: string; actual: string | null; reason: string; environmentDigest: string; environmentMatches: boolean; cold: boolean;
                          actor: string; eventId: string; correlationId: string }): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class SimulationCapabilityImpl implements RunWrites, CompleteWrites, ReproduceWrites {
  readonly #tx: Tx; readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { const r = await q.execute(this.#tx); return r.rows as T[]; }

  readRuns(): any { return this.from('simulation.runs_current'); }
  readRunEvents(): any { return this.from('simulation.run_events'); }
  readReproductions(): any { return this.from('simulation.reproductions'); }
  readTwins(): any { return this.from('twin.twins_current'); }
  readVersions(): any { return this.from('twin.twin_versions'); }
  readElements(): any { return this.from('twin.state_elements'); }
  readBehaviourModels(): any { return this.from('twin.behaviour_models'); }

  async rebuildProjections() {
    return this.call<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>(
      sql`select projection, live_rows::text, rebuilt_rows::text, mismatched::text from simulation.rebuild_projections()`);
  }

  async openRun(a: OpenRunArgs): Promise<OpenedRun> {
    const rows = await this.call<{ r: OpenedRun }>(sql`select simulation.open_run(
      ${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.twinVersion}::int, ${a.runKind}, ${a.controlRunId}::uuid, ${a.correctsRunId}::uuid,
      ${a.scenarioId}::uuid, ${a.scenarioBranchId}::uuid, ${a.shock}, ${a.component},
      ${a.modelRef}, ${a.implementationDigest}, ${a.environmentDigest}, ${JSON.stringify(a.environment)}::jsonb,
      ${a.stochasticMode}, ${a.rng}, ${a.seed}::bigint, ${a.samples}::int, ${a.jitter === null ? null : JSON.stringify(a.jitter)}::jsonb,
      ${JSON.stringify(a.interventions)}::jsonb, ${JSON.stringify(a.constraints)}::jsonb, ${JSON.stringify(a.assumptions)}::jsonb, ${a.inputsDigest}, ${a.validationStatus},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('open_run returned no row');
    return r;
  }

  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(
      ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }

  async completeRun(a: Parameters<CompleteWrites['completeRun']>[0]): Promise<void> {
    await this.call(sql`select simulation.complete_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.outputs)}::jsonb, ${a.outputsDigest},
      ${JSON.stringify(a.sensitivity)}::jsonb, ${a.outsideEnvelope}, ${a.headerDigest}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async failRun(a: Parameters<CompleteWrites['failRun']>[0]): Promise<void> {
    await this.call(sql`select simulation.fail_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.failure}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async recordReproduction(a: Parameters<ReproduceWrites['recordReproduction']>[0]): Promise<void> {
    await this.call(sql`select simulation.record_reproduction(${a.reproductionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.verdict},
      ${a.expected}, ${a.actual}, ${a.reason}, ${a.environmentDigest}, ${a.environmentMatches}, ${a.cold}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const SimulationCapability = {
  read(tx: Tx, action: string): SimulationReads { return new SimulationCapabilityImpl(tx, action); },
  run(tx: Tx, action: string): RunWrites { return new SimulationCapabilityImpl(tx, action); },
  complete(tx: Tx, action: string): CompleteWrites { return new SimulationCapabilityImpl(tx, action); },
  reproduce(tx: Tx, action: string): ReproduceWrites { return new SimulationCapabilityImpl(tx, action); },
};
