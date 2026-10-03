/**
 * DATA PRODUCT CAPABILITIES — CP-6 B90 §0 (migration 0095; F-P7-F-09/-10/-11's shared registry core).
 *
 * One class, two views (the planning capabilities' idiom): each write is a thin binding to a SECURITY DEFINER port that asserts the
 * route's own action, the scope and the acting principal; each read is an invoker read under the caller's RLS. Nothing here decides a
 * rule a port decides. The parts (§R consumers, §E events, §M metrics, §K catalog) declare their own capability files beside this one.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

type Row = Record<string, unknown>;

abstract class ProductsCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  /** One SQL statement under the pipeline's bound action (the §0 signer's SignatureWrites shape). */
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

export interface ProductReads {
  readonly action: string;
  call<T>(q: ReturnType<typeof sql>): Promise<T[]>;
  now(): Promise<string>;
  /** products.product_read: the product, its versions, its reviews and the latest observation per measure; NULL outside the caller's scope. */
  product(productId: string): Promise<Row | null>;
  /** The registry list under the caller's RLS (state and kind optional). */
  list(a: { state: string | null; kind: string | null; limit: number }): Promise<Row[]>;
  /** A declared version's row (the declaration the release admits). */
  version(productId: string, version: number): Promise<Row | null>;
}

export interface ProductWrites extends ProductReads {
  registerProduct(a: { productId: string; tenantId: string; domainId: string; key: string; title: string; kind: string; purpose: string; owner: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  declareVersion(a: { productId: string; tenantId: string; domainId: string; declaration: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  recordReview(a: { reviewId: string; productId: string; tenantId: string; domainId: string; version: number; kind: string; outcome: string; notes: string; evidence: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  releaseProduct(a: { productId: string; tenantId: string; domainId: string; version: number; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  observeSlo(a: { observationId: string; productId: string; tenantId: string; domainId: string; measure: string; value: number; threshold: number | null; met: boolean; source: string; details: Row; actor: string; correlationId: string }): Promise<Row>;
  /** objects.admit_version under the bound action (the canonical DPR the release binds). */
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  /** The latest canonical DPR version of a product (NULL before its first release). */
  latestObjectVersion(productId: string): Promise<number | null>;
}

class ProductsCapabilityImpl extends ProductsCore implements ProductWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async product(productId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select products.product_read(${productId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async list(a: { state: string | null; kind: string | null; limit: number }): Promise<Row[]> {
    return this.call<Row>(sql`select products.product_json(p) as product from products.products_current p
      where (${a.state}::text is null or p.state = ${a.state}) and (${a.kind}::text is null or p.kind = ${a.kind})
      order by p.registered_at desc limit ${a.limit}`).then((rows) => rows.map((x) => x['product'] as Row));
  }
  async version(productId: string, version: number): Promise<Row | null> {
    const rows = await this.call<Row>(sql`select product_id::text, version, declaration, digest, declared_by::text, declared_at, released_by::text, released_at
      from products.product_versions where product_id = ${productId}::uuid and version = ${version}`);
    return rows[0] ?? null;
  }
  async registerProduct(a: Parameters<ProductWrites['registerProduct']>[0]): Promise<Row> {
    return this.one(sql`select products.register_product(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.title}, ${a.kind}, ${a.purpose}, ${a.owner}::uuid,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'register_product');
  }
  async declareVersion(a: Parameters<ProductWrites['declareVersion']>[0]): Promise<Row> {
    return this.one(sql`select products.declare_product_version(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.declaration)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'declare_product_version');
  }
  async recordReview(a: Parameters<ProductWrites['recordReview']>[0]): Promise<Row> {
    return this.one(sql`select products.record_product_review(${a.reviewId}::uuid, ${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.kind}, ${a.outcome}, ${a.notes},
      ${JSON.stringify(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'record_product_review');
  }
  async releaseProduct(a: Parameters<ProductWrites['releaseProduct']>[0]): Promise<Row> {
    return this.one(sql`select products.release_product(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'release_product');
  }
  async observeSlo(a: Parameters<ProductWrites['observeSlo']>[0]): Promise<Row> {
    return this.one(sql`select products.observe_slo(${a.observationId}::uuid, ${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.measure}, ${a.value}::numeric, ${a.threshold}::numeric, ${a.met},
      ${a.source}, ${JSON.stringify(a.details)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'observe_slo');
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0]; if (r === undefined) throw new Error('admission returned no row'); return { contentDigest: r.content_digest };
  }
  async latestObjectVersion(productId: string): Promise<number | null> {
    const rows = await this.call<{ v: number | null }>(sql`select max(object_version)::int as v from objects.canonical_objects where object_id = ${productId}::uuid and object_type = 'DPR'`);
    const v = rows[0]?.v; return v === undefined || v === null ? null : Number(v);
  }
}

export const ProductCapability = {
  read(tx: Tx, action: string): ProductReads { return new ProductsCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ProductWrites { return new ProductsCapabilityImpl(tx, action); },
};
