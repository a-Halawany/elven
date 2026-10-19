/**
 * B92 §0 (0113 §0.7–§0.9) — THE COMPUTE CAPABILITIES: thin bindings to the definer ports (compute, replay) and the INVOKER reads (a result with
 * its definition, scope and records; the results list; the registry). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { registryByKey } from '../computation-versions.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export interface ComputeReads {
  readonly action: string; readonly tx: Tx;
  now(): Promise<string>;
  result(resultId: string, recordsLimit: number): Promise<Row | null>;
  /** B82-F mt: the registry row of a computation key NOW (the version a computation would run), or null. */
  computationNow(key: string | null): Promise<Row | null>;
  results(q: { metricKey: string | null; period: string | null; scopeKey: string | null; limit: number }): Promise<Row[]>;
  registry(): Promise<Row[]>;
}
export interface ComputeWrites extends ComputeReads {
  compute(a: { resultId: string; tenantId: string; domainId: string; metricKey: string; period: string; scopeKey: string | null; cohort: Row; asOf: string | null; preview: boolean; actor: string; correlationId: string }): Promise<Row>;
  replay(a: { replayId: string; tenantId: string; domainId: string; resultId: string; actor: string; correlationId: string }): Promise<Row>;
}

class ComputeCapabilityImpl implements ComputeWrites {
  constructor(readonly tx: Tx, readonly action: string) {}
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }
  async result(resultId: string, recordsLimit: number): Promise<Row | null> {
    return (await this.rows<{ r: Row | null }>(sql`select analytics.result_read(${resultId}::uuid, ${recordsLimit}::int) as r`))[0]?.r ?? null;
  }
  async computationNow(key: string | null): Promise<Row | null> { return key === null ? null : ((await registryByKey(this.tx, [key])).get(key) ?? null); }
  async results(q: { metricKey: string | null; period: string | null; scopeKey: string | null; limit: number }): Promise<Row[]> {
    return this.rows(sql`select r.result_id::text, r.metric_key, r.definition_version, r.preview, r.scope_key, r.scope_version, r.period_key, r.window_from, r.window_to, r.clock, r.cohort,
        r.as_of, r.state, r.kind, r.unit, r.value, r.numerator, r.denominator, r.n, r.uncertainty, r.reasons, r.threshold_eval, r.replay_of::text, r.replay_verdict, r.computed_at,
        r.computed_by_kind, r.records_count, r.computation_key, r.computation_version, r.computation_digest
      from analytics.metric_results r
      where (${q.metricKey}::text is null or r.metric_key = ${q.metricKey}) and (${q.period}::text is null or r.period_key = ${q.period})
        and (${q.scopeKey}::text is null or r.scope_key = ${q.scopeKey})
      order by r.computed_at desc limit ${Math.min(Math.max(q.limit, 1), 500)}`);
  }
  async registry(): Promise<Row[]> {
    return this.rows(sql`select computation_key, function_name, version, kind, dimensions, reads, scope_rule, description, body_digest, registered_in, registered_at from analytics.computation_registry order by computation_key`);
  }
  async compute(a: Parameters<ComputeWrites['compute']>[0]): Promise<Row> {
    return this.one(sql`select analytics.compute_metric(${a.resultId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.metricKey}, ${a.period}, ${a.scopeKey}, ${j(a.cohort)}::jsonb,
      ${a.asOf}::timestamptz, ${a.preview}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'compute_metric');
  }
  async replay(a: Parameters<ComputeWrites['replay']>[0]): Promise<Row> {
    return this.one(sql`select analytics.replay_result(${a.replayId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.resultId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'replay_result');
  }
}

export const ComputeCapability = {
  read(tx: Tx, action: string): ComputeReads { return new ComputeCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ComputeWrites { return new ComputeCapabilityImpl(tx, action); },
};
