/**
 * THE SEMANTIC LAYER'S CAPABILITIES — CP-6 B90 §M (migration 0095 §M; F-P7-F-10). The prelude's idiom (products.capabilities.ts): one
 * class, four views — each write a thin binding to a SECURITY DEFINER port that asserts the route's own action, the scope and the acting
 * principal; each read an invoker read under the caller's RLS; the tick view built from the attention tick's own transaction. `call`
 * (the §0 signer's SignatureWrites shape) runs one statement under the pipeline's bound action. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class MetricsCore {
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

export interface MetricReads {
  readonly action: string;
  call<T>(q: ReturnType<typeof sql>): Promise<T[]>;
  now(): Promise<string>;
  /** products.metric_read: the model, its versions, certifications (with signatures), diffs, recent servings; NULL outside the caller's scope. */
  model(modelId: string): Promise<Row | null>;
  /** The models of the caller's scope (state optional), newest first. */
  list(a: { state: string | null; limit: number }): Promise<Row[]>;
  /** The measure whitelist (products.metric_measures). */
  catalog(): Promise<Row>;
}

export interface MetricWrites extends MetricReads {
  declareMetric(a: { modelId: string; tenantId: string; domainId: string; title: string; measure: string; unit: string; aggregation: string; grain: string; dimensions: string[]; filters: Row; effectiveFrom: string | null; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  certifyMetric(a: { certificationId: string; modelId: string; tenantId: string; domainId: string; version: number; expiresAt: string; signatureId: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  withdrawCertification(a: { modelId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  serveMetric(a: { servingId: string; tenantId: string; domainId: string; metricKey: string; grain: string | null; filters: Row | null; asOf: string | null; view: string; actor: string; correlationId: string }): Promise<Row>;
  recalculateMetric(a: { modelId: string; tenantId: string; domainId: string; asOf: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  /** objects.admit_version under the bound action (the canonical MET the certification binds). */
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  /** The latest canonical MET version of a model (NULL before its first certification). */
  latestObjectVersion(modelId: string): Promise<number | null>;
}

export interface MetricTickWrites {
  readonly action: string;
  /** products.sweep_metric_certifications under executive.attention.tick (the step `metric-certification`, order 65). */
  sweepCertifications(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

class MetricsCapabilityImpl extends MetricsCore implements MetricWrites, MetricTickWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async model(modelId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select products.metric_read(${modelId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async list(a: { state: string | null; limit: number }): Promise<Row[]> {
    const rows = await this.call<{ r: Row }>(sql`select products.metric_read(m.model_id) as r from products.semantic_models m
      where (${a.state}::text is null or m.state = ${a.state}) order by m.declared_at desc limit ${a.limit}`);
    return rows.map((x) => x.r);
  }
  async catalog(): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select products.metric_measures() as r`);
    return rows[0]?.r ?? {};
  }
  async declareMetric(a: Parameters<MetricWrites['declareMetric']>[0]): Promise<Row> {
    return this.one(sql`select products.declare_metric(${a.modelId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.measure}, ${a.unit}, ${a.aggregation}, ${a.grain},
      ${a.dimensions}::text[], ${JSON.stringify(a.filters)}::jsonb, ${a.effectiveFrom}::timestamptz, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'declare_metric');
  }
  async certifyMetric(a: Parameters<MetricWrites['certifyMetric']>[0]): Promise<Row> {
    return this.one(sql`select products.certify_metric(${a.certificationId}::uuid, ${a.modelId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.expiresAt}::timestamptz,
      ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'certify_metric');
  }
  async withdrawCertification(a: Parameters<MetricWrites['withdrawCertification']>[0]): Promise<Row> {
    return this.one(sql`select products.withdraw_metric_certification(${a.modelId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'withdraw_metric_certification');
  }
  async serveMetric(a: Parameters<MetricWrites['serveMetric']>[0]): Promise<Row> {
    return this.one(sql`select products.serve_metric(${a.servingId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.metricKey}, ${a.grain}::text, ${a.filters === null ? null : JSON.stringify(a.filters)}::jsonb,
      ${a.asOf}::timestamptz, ${a.view}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'serve_metric');
  }
  async recalculateMetric(a: Parameters<MetricWrites['recalculateMetric']>[0]): Promise<Row> {
    return this.one(sql`select products.recalculate_metric(${a.modelId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.asOf}::timestamptz, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'recalculate_metric');
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0]; if (r === undefined) throw new Error('admission returned no row'); return { contentDigest: r.content_digest };
  }
  async latestObjectVersion(modelId: string): Promise<number | null> {
    const rows = await this.call<{ v: number | null }>(sql`select max(object_version)::int as v from objects.canonical_objects where object_id = ${modelId}::uuid and object_type = 'MET'`);
    const v = rows[0]?.v; return v === undefined || v === null ? null : Number(v);
  }
  async sweepCertifications(a: Parameters<MetricTickWrites['sweepCertifications']>[0]): Promise<Row> {
    return this.one(sql`select products.sweep_metric_certifications(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'sweep_metric_certifications');
  }
}

export const MetricCapability = {
  read(tx: Tx, action: string): MetricReads { return new MetricsCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): MetricWrites { return new MetricsCapabilityImpl(tx, action); },
  /** The attention tick's step (65): built from the tick's own transaction (bound to executive.attention.tick). */
  tick(tx: Tx, action: string): MetricTickWrites { return new MetricsCapabilityImpl(tx, action); },
};
