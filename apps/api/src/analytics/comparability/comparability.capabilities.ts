/**
 * B92 §CO (0113 §CO.5–§CO.7) — THE COMPARABILITY CAPABILITIES: thin bindings to the definer ports (the cohort comparison, the cost
 * reconciliation, the semantic objects' declare / certify / withdraw) and the INVOKER reads. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export interface ComparabilityReads {
  readonly action: string; readonly tx: Tx;
  now(): Promise<string>;
  comparisons(metricKey: string | null, limit: number): Promise<Row[]>;
  comparison(id: string): Promise<Row | null>;
  reconciliations(limit: number): Promise<Row[]>;
  costs(period: string | null, limit: number): Promise<Row[]>;
  semanticObject(id: string): Promise<Row | null>;
  semanticObjects(kind: string | null): Promise<Row[]>;
}
export interface ComparabilityWrites extends ComparabilityReads {
  compare(a: { comparisonId: string; tenantId: string; domainId: string; resultA: string; resultB: string; cohortObjectA: string | null; cohortObjectB: string | null; actor: string; correlationId: string }): Promise<Row>;
  reconcile(a: { reconciliationId: string; tenantId: string; domainId: string; period: string; tolerance: number | null; actor: string; correlationId: string }): Promise<Row>;
  declare(a: { objectId: string; tenantId: string; domainId: string; key: string; kind: string; title: string; definition: Row; owner: string; actor: string; correlationId: string }): Promise<Row>;
  certify(a: { certificationId: string; objectId: string; tenantId: string; domainId: string; version: number; digest: string; expiresAt: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  withdraw(a: { objectId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}

class ComparabilityCapabilityImpl implements ComparabilityWrites {
  constructor(readonly tx: Tx, readonly action: string) {}
  private async r<T>(q: ReturnType<typeof sql>): Promise<T | null> { return ((await q.execute(this.tx)).rows as Array<{ r: T | null }>)[0]?.r ?? null; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = await this.r<Row>(q);
    if (row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }
  async comparisons(metricKey: string | null, limit: number): Promise<Row[]> { return (await this.r<Row[]>(sql`select analytics.comparison_list(${metricKey}::text, ${limit}::int) as r`)) ?? []; }
  async comparison(id: string): Promise<Row | null> { return this.r<Row>(sql`select analytics.comparison_read(${id}::uuid) as r`); }
  async reconciliations(limit: number): Promise<Row[]> { return (await this.r<Row[]>(sql`select analytics.reconciliation_list(${limit}::int) as r`)) ?? []; }
  async costs(period: string | null, limit: number): Promise<Row[]> { return (await this.r<Row[]>(sql`select analytics.computation_cost_list(${period}::text, ${limit}::int) as r`)) ?? []; }
  async semanticObject(id: string): Promise<Row | null> { return this.r<Row>(sql`select products.semantic_object_read(${id}::uuid) as r`); }
  async semanticObjects(kind: string | null): Promise<Row[]> { return (await this.r<Row[]>(sql`select products.semantic_object_list(${kind}::text) as r`)) ?? []; }
  async compare(a: Parameters<ComparabilityWrites['compare']>[0]): Promise<Row> {
    return this.one(sql`select analytics.compare_results(${a.comparisonId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.resultA}::uuid, ${a.resultB}::uuid,
      ${a.cohortObjectA}::uuid, ${a.cohortObjectB}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'compare_results');
  }
  async reconcile(a: Parameters<ComparabilityWrites['reconcile']>[0]): Promise<Row> {
    return this.one(sql`select analytics.reconcile_costs(${a.reconciliationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.period}, ${a.tolerance}::numeric, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reconcile_costs');
  }
  async declare(a: Parameters<ComparabilityWrites['declare']>[0]): Promise<Row> {
    return this.one(sql`select products.semantic_declare(${a.objectId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.kind}, ${a.title}, ${j(a.definition)}::jsonb, ${a.owner}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'semantic_declare');
  }
  async certify(a: Parameters<ComparabilityWrites['certify']>[0]): Promise<Row> {
    return this.one(sql`select products.semantic_certify(${a.certificationId}::uuid, ${a.objectId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.digest}, ${a.expiresAt}::timestamptz,
      ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'semantic_certify');
  }
  async withdraw(a: Parameters<ComparabilityWrites['withdraw']>[0]): Promise<Row> {
    return this.one(sql`select products.semantic_withdraw(${a.objectId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'semantic_withdraw');
  }
}

export const ComparabilityCapability = {
  read(tx: Tx, action: string): ComparabilityReads { return new ComparabilityCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ComparabilityWrites { return new ComparabilityCapabilityImpl(tx, action); },
};
