/**
 * SCENARIO QUALITY CAPABILITIES — CP-6 B27 part `quality` (migration 0097 §Q; F-P4-09).
 *
 * The events idiom (products/events/events.capabilities.ts): one class, four views. Each write is a thin binding to a SECURITY DEFINER port
 * that asserts the route's own action, the scope and the acting principal (evaluate_scenario_quality, declare_frequency_map,
 * set_branch_probability, withdraw_branch_probability); the read is an invoker read under the caller's RLS (prediction.scenario_quality);
 * the tick view binds the sweep under executive.attention.tick. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../../shared/db.js';

type Row = Record<string, unknown>;

abstract class QualityCore {
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

export interface QualityReads {
  readonly action: string;
  now(): Promise<string>;
  /** prediction.scenario_quality: the latest evaluation, the live measures, the decision-activity, the probabilities, the maps (null: not visible). */
  quality(scenarioId: string): Promise<Row | null>;
  /** The evaluations of a scenario under the caller's RLS, newest first. */
  evaluations(scenarioId: string, limit: number): Promise<Row[]>;
  /** The domain's frequency maps under the caller's RLS (every version, newest first per name). */
  maps(): Promise<Row[]>;
}

export interface QualityWrites extends QualityReads {
  evaluate(a: { evaluationId: string; scenarioId: string; tenantId: string; domainId: string; trigger: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

export interface ProbabilityWrites extends QualityReads {
  declareMap(a: { mapId: string; tenantId: string; domainId: string; name: string; horizon: string; bands: Row[]; owner: string | null; actor: string; correlationId: string }): Promise<Row>;
  setProbability(a: { probabilityId: string; tenantId: string; domainId: string; branchId: string; method: string; low: number | null; high: number | null; mapId: string | null; basis: Row;
    actor: string; eventId: string; correlationId: string }): Promise<Row>;
  withdrawProbability(a: { withdrawalId: string; tenantId: string; domainId: string; branchId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

/** The tick's view (executive.attention.tick): the sweep of the scenarios already evaluated once. */
export interface QualityTickWrites {
  sweep(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

class QualityCapabilityImpl extends QualityCore implements QualityWrites, ProbabilityWrites, QualityTickWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async quality(scenarioId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select prediction.scenario_quality(${scenarioId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async evaluations(scenarioId: string, limit: number): Promise<Row[]> {
    return this.call<Row>(sql`select evaluation_id::text, scenario_version, rule_version, trigger, outcome, prior_outcome, new_failure, attention_item_id::text, evaluated_by::text, evaluated_at, findings
      from prediction.scenario_quality_evaluations where scenario_id = ${scenarioId}::uuid order by evaluated_at desc, evaluation_id desc limit ${limit}`);
  }
  async maps(): Promise<Row[]> {
    return this.call<Row>(sql`select map_id::text, name, version, bands, horizon, owner_principal_id::text as owner, state, supersedes::text, superseded_at, declared_by::text, declared_at
      from prediction.frequency_probability_maps order by name, version desc`);
  }
  async evaluate(a: Parameters<QualityWrites['evaluate']>[0]): Promise<Row> {
    return this.one(sql`select prediction.evaluate_scenario_quality(${a.evaluationId}::uuid, ${a.scenarioId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.trigger}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'evaluate_scenario_quality');
  }
  async declareMap(a: Parameters<ProbabilityWrites['declareMap']>[0]): Promise<Row> {
    return this.one(sql`select prediction.declare_frequency_map(${a.mapId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.name}, ${a.horizon}, ${JSON.stringify(a.bands)}::jsonb, ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_frequency_map');
  }
  async setProbability(a: Parameters<ProbabilityWrites['setProbability']>[0]): Promise<Row> {
    return this.one(sql`select prediction.set_branch_probability(${a.probabilityId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}::uuid, ${a.method}, ${a.low}::numeric, ${a.high}::numeric,
      ${a.mapId}::uuid, ${JSON.stringify(a.basis)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'set_branch_probability');
  }
  async withdrawProbability(a: Parameters<ProbabilityWrites['withdrawProbability']>[0]): Promise<Row> {
    return this.one(sql`select prediction.withdraw_branch_probability(${a.withdrawalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'withdraw_branch_probability');
  }
  async sweep(a: Parameters<QualityTickWrites['sweep']>[0]): Promise<Row> {
    return this.one(sql`select prediction.sweep_scenario_quality(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'sweep_scenario_quality');
  }
}

export const QualityCapability = {
  read(tx: Tx, action: string): QualityReads { return new QualityCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): QualityWrites { return new QualityCapabilityImpl(tx, action); },
  probability(tx: Tx, action: string): ProbabilityWrites { return new QualityCapabilityImpl(tx, action); },
  tick(tx: Tx, action: string): QualityTickWrites { return new QualityCapabilityImpl(tx, action); },
};
