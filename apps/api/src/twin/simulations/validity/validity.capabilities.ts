/**
 * SIMULATION VALIDITY CAPABILITIES — CP-6 B31 part `validity` (migration 0099 §V; F-P5-09 and the B31 pieces of F-P4-07/-09).
 *
 * The events idiom (products/events/events.capabilities.ts): one class, four views. Each write is a thin binding to a SECURITY DEFINER port
 * that asserts the route's own action, the scope and the acting principal (set_decision_use_policy, identify_validity_reach,
 * bind_branch_twin, retire_branch_twin); each read is an invoker read under the caller's RLS (run_decision_use, package_run_validity,
 * siv_reach_of, branch_twin_binding_read, run_assumption_sensitivity). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../../shared/db.js';

type Row = Record<string, unknown>;

abstract class ValidityCore {
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
  protected async maybe(q: ReturnType<typeof sql>): Promise<Row | null> {
    const r = await q.execute(this.#tx);
    return (r.rows as Array<{ r: Row | null }>)[0]?.r ?? null;
  }
  /** The database's clock (every "as of now" read compares against it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface ValidityReads {
  readonly action: string;
  now(): Promise<string>;
  /** simulation.run_decision_use: decision | diagnostic | refused with the reasons and the label (null: not visible). */
  decisionUse(runId: string): Promise<Row | null>;
  /** The recent runs of the domain (optionally one twin or one branch) under the caller's RLS, each with its decision use. */
  runs(a: { twinId: string | null; branchId: string | null; limit: number }): Promise<Row[]>;
  /** simulation.package_run_validity: the package's options with each cited run's validity and use; the invalidated input marked. */
  packageValidity(packageId: string): Promise<Row | null>;
  /** The domain's decision-use policy (every version, newest first). */
  policies(): Promise<Row[]>;
  /** The recorded reach identifications (optionally one twin / version), newest first. */
  reaches(a: { twinId: string | null; version: number | null; limit: number }): Promise<Row[]>;
  /** simulation.siv_reach_of: what a twin version reaches NOW (runs, packages, commitments, evaluation results). */
  reachNow(a: { tenantId: string; domainId: string; twinId: string; version: number }): Promise<Row>;
  /** prediction.branch_twin_binding_read: the active binding, the history, the runs on the branch (null: not visible). */
  binding(branchId: string): Promise<Row | null>;
  /** simulation.run_assumption_sensitivity: the run's factors read against the critical assumptions of its branch (null: not visible). */
  assumptionSensitivity(runId: string): Promise<Row | null>;
}

export interface PolicyWrites extends ValidityReads {
  setPolicy(a: { policyId: string; tenantId: string; domainId: string; require: boolean; rationale: string; expectedVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
}

export interface ReachWrites extends ValidityReads {
  identifyReach(a: { reachId: string; tenantId: string; domainId: string; twinId: string; version: number; actor: string; correlationId: string }): Promise<Row>;
}

export interface BindingWrites extends ValidityReads {
  bind(a: { bindingId: string; tenantId: string; domainId: string; branchId: string; twinId: string; twinVersion: number; conditions: Row[]; constraintSetId: string | null;
    assumptionFactors: Row[]; rationale: string; expectedVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
  retire(a: { tenantId: string; domainId: string; branchId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}

class ValidityCapabilityImpl extends ValidityCore implements PolicyWrites, ReachWrites, BindingWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async decisionUse(runId: string): Promise<Row | null> {
    return this.maybe(sql`select simulation.run_decision_use(${runId}::uuid) as r`);
  }
  async runs(a: Parameters<ValidityReads['runs']>[0]): Promise<Row[]> {
    return this.call<Row>(sql`select r.run_id::text, r.twin_id::text, r.twin_version, r.run_kind, r.state, r.validity, r.fitness_state, r.promoted_for, r.scenario_id::text, r.scenario_branch_id::text,
        r.opened_at, r.completed_at, simulation.run_decision_use(r.run_id) as decision_use
      from simulation.runs_current r
     where (${a.twinId}::uuid is null or r.twin_id = ${a.twinId}::uuid) and (${a.branchId}::uuid is null or r.scenario_branch_id = ${a.branchId}::uuid)
     order by r.opened_at desc, r.run_id limit ${a.limit}`);
  }
  async packageValidity(packageId: string): Promise<Row | null> {
    return this.maybe(sql`select simulation.package_run_validity(${packageId}::uuid) as r`);
  }
  async policies(): Promise<Row[]> {
    return this.call<Row>(sql`select policy_id::text, version, require_decision_use, rationale, set_by::text, set_at from simulation.decision_use_policies order by version desc`);
  }
  async reaches(a: Parameters<ValidityReads['reaches']>[0]): Promise<Row[]> {
    return this.call<Row>(sql`select reach_id::text, twin_id::text, twin_version, trigger, cause_event_id::text, runs, packages, commitments, evaluation_results, items, identified_by::text, identified_at
      from simulation.validity_reach where (${a.twinId}::uuid is null or twin_id = ${a.twinId}::uuid) and (${a.version}::int is null or twin_version = ${a.version}::int)
      order by identified_at desc, reach_id limit ${a.limit}`);
  }
  async reachNow(a: Parameters<ValidityReads['reachNow']>[0]): Promise<Row> {
    return this.one(sql`select simulation.siv_reach_of(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.version}::int) as r`, 'siv_reach_of');
  }
  async binding(branchId: string): Promise<Row | null> {
    return this.maybe(sql`select prediction.branch_twin_binding_read(${branchId}::uuid) as r`);
  }
  async assumptionSensitivity(runId: string): Promise<Row | null> {
    return this.maybe(sql`select simulation.run_assumption_sensitivity(${runId}::uuid) as r`);
  }
  async setPolicy(a: Parameters<PolicyWrites['setPolicy']>[0]): Promise<Row> {
    return this.one(sql`select simulation.set_decision_use_policy(${a.policyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.require}, ${a.rationale}, ${a.expectedVersion}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_decision_use_policy');
  }
  async identifyReach(a: Parameters<ReachWrites['identifyReach']>[0]): Promise<Row> {
    return this.one(sql`select simulation.identify_validity_reach(${a.reachId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.version}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`,
      'identify_validity_reach');
  }
  async bind(a: Parameters<BindingWrites['bind']>[0]): Promise<Row> {
    return this.one(sql`select prediction.bind_branch_twin(${a.bindingId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}::uuid, ${a.twinId}::uuid, ${a.twinVersion}::int,
      ${JSON.stringify(a.conditions)}::jsonb, ${a.constraintSetId}::uuid, ${JSON.stringify(a.assumptionFactors)}::jsonb, ${a.rationale}, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`,
      'bind_branch_twin');
  }
  async retire(a: Parameters<BindingWrites['retire']>[0]): Promise<Row> {
    return this.one(sql`select prediction.retire_branch_twin(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_branch_twin');
  }
}

export const ValidityCapability = {
  read(tx: Tx, action: string): ValidityReads { return new ValidityCapabilityImpl(tx, action); },
  policy(tx: Tx, action: string): PolicyWrites { return new ValidityCapabilityImpl(tx, action); },
  reach(tx: Tx, action: string): ReachWrites { return new ValidityCapabilityImpl(tx, action); },
  binding(tx: Tx, action: string): BindingWrites { return new ValidityCapabilityImpl(tx, action); },
};
