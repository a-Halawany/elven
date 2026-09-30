/**
 * THE CATALOG CAPABILITIES — CP-6 B90 §K (migration 0095 §K; F-P7-F-11 the metadata catalog and data discovery).
 *
 * One class, three views (the prelude's products.capabilities idiom): each write is a thin binding to a SECURITY DEFINER port that asserts
 * the route's own action, the scope and the acting principal; each read is an invoker read under the caller's RLS; the tick view binds the
 * reconciliation to executive.attention.tick. Nothing here decides a rule a port decides. The catalog DESCRIBES and INDEXES authority: no
 * binding here writes a source, a schema, a product or a canonical object (DP-49-003).
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class CatalogCore {
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

export interface CatalogReads {
  readonly action: string;
  call<T>(q: ReturnType<typeof sql>): Promise<T[]>;
  now(): Promise<string>;
  /** products.catalog_asset_read: the entry, its owner, flags, lineage both ways, terms, its product's release and SLO; NULL outside the caller's scope. */
  asset(assetId: string): Promise<Row | null>;
  /** products.catalog_search: discoverable entries within the reader's clearance, ranked; the hidden counted. */
  search(a: { q: string; kinds: string[] | null; limit: number; clearance: string }): Promise<Row>;
  /** products.catalog_coverage: the coverage debt per kind. */
  coverage(a: { tenantId: string; domainId: string }): Promise<Row>;
  /** products.catalog_trust: the stop of new consumption — trusted, discoverable, the flags (an unknown asset is not trusted). */
  trust(kind: string, ref: string): Promise<Row>;
  /** The entries under the caller's RLS (kind and a flag kind optional). */
  list(a: { kind: string | null; flag: string | null; limit: number }): Promise<Row[]>;
  /** The glossary under the caller's RLS. */
  terms(a: { limit: number }): Promise<Row[]>;
  /** The reconciliation runs under the caller's RLS, newest first. */
  runs(a: { limit: number }): Promise<Row[]>;
}

export interface CatalogWrites extends CatalogReads {
  catalogueAsset(a: { assetId: string; tenantId: string; domainId: string; kind: string; ref: string; title: string; description: string | null; owner: string | null; classification: string | null;
                      contracts: Row | null; locations: unknown[] | null; glossaryTerms: string[]; quality: Row | null; slo: Row | null; actor: string; correlationId: string }): Promise<Row>;
  setOwner(a: { assetId: string; tenantId: string; domainId: string; owner: string; actor: string; correlationId: string }): Promise<Row>;
  recertify(a: { assetId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  declareLineage(a: { edgeId: string; tenantId: string; domainId: string; from: string; to: string; kind: string; evidence: Row; actor: string; correlationId: string }): Promise<Row>;
  defineTerm(a: { termId: string; tenantId: string; domainId: string; term: string; definition: string; owner: string; actor: string; correlationId: string }): Promise<Row>;
  flag(a: { assetId: string; tenantId: string; domainId: string; kind: string; reason: string; clear: boolean; actor: string; correlationId: string }): Promise<Row>;
  /** products.reconcile_catalog under the steward's action or the tick's. */
  reconcile(a: { runId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

class CatalogCapabilityImpl extends CatalogCore implements CatalogWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async asset(assetId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select products.catalog_asset_read(${assetId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async search(a: { q: string; kinds: string[] | null; limit: number; clearance: string }): Promise<Row> {
    return this.one(sql`select products.catalog_search(${a.q}, ${a.kinds}::text[], ${a.limit}::int, ${a.clearance}) as r`, 'catalog_search');
  }
  async coverage(a: { tenantId: string; domainId: string }): Promise<Row> {
    return this.one(sql`select products.catalog_coverage(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`, 'catalog_coverage');
  }
  async trust(kind: string, ref: string): Promise<Row> {
    return this.one(sql`select products.catalog_trust(${kind}, ${ref}) as r`, 'catalog_trust');
  }
  async list(a: { kind: string | null; flag: string | null; limit: number }): Promise<Row[]> {
    return this.call<{ r: Row }>(sql`select products.catalog_asset_json(a) as r from products.catalog_assets a
      where (${a.kind}::text is null or a.kind = ${a.kind}) and (${a.flag}::text is null or a.flags @> jsonb_build_array(jsonb_build_object('kind', ${a.flag}::text)))
      order by a.kind, a.title limit ${a.limit}`).then((rows) => rows.map((x) => x.r));
  }
  async terms(a: { limit: number }): Promise<Row[]> {
    return this.call<Row>(sql`select term_id::text, term, definition, owner_principal_id::text, products.catalog_principal_name(owner_principal_id) as owner_name, version, since, updated_at
      from products.glossary_terms order by term limit ${a.limit}`);
  }
  async runs(a: { limit: number }): Promise<Row[]> {
    return this.call<Row>(sql`select run_id::text, trigger, started_at, finished_at, counts, actor_principal_id::text from products.catalog_reconciliations order by finished_at desc limit ${a.limit}`);
  }
  async catalogueAsset(a: Parameters<CatalogWrites['catalogueAsset']>[0]): Promise<Row> {
    return this.one(sql`select products.catalogue_asset(${a.assetId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.ref}, ${a.title}, ${a.description}, ${a.owner}::uuid, ${a.classification},
      ${a.contracts === null ? null : JSON.stringify(a.contracts)}::jsonb, ${a.locations === null ? null : JSON.stringify(a.locations)}::jsonb, ${a.glossaryTerms}::text[],
      ${a.quality === null ? null : JSON.stringify(a.quality)}::jsonb, ${a.slo === null ? null : JSON.stringify(a.slo)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'catalogue_asset');
  }
  async setOwner(a: Parameters<CatalogWrites['setOwner']>[0]): Promise<Row> {
    return this.one(sql`select products.set_asset_owner(${a.assetId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_asset_owner');
  }
  async recertify(a: Parameters<CatalogWrites['recertify']>[0]): Promise<Row> {
    return this.one(sql`select products.recertify_asset_ownership(${a.assetId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'recertify_asset_ownership');
  }
  async declareLineage(a: Parameters<CatalogWrites['declareLineage']>[0]): Promise<Row> {
    return this.one(sql`select products.declare_lineage(${a.edgeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.from}::uuid, ${a.to}::uuid, ${a.kind}, ${JSON.stringify(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_lineage');
  }
  async defineTerm(a: Parameters<CatalogWrites['defineTerm']>[0]): Promise<Row> {
    return this.one(sql`select products.define_glossary_term(${a.termId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.term}, ${a.definition}, ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'define_glossary_term');
  }
  async flag(a: Parameters<CatalogWrites['flag']>[0]): Promise<Row> {
    return this.one(sql`select products.flag_asset(${a.assetId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.reason}, ${a.clear}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'flag_asset');
  }
  async reconcile(a: Parameters<CatalogWrites['reconcile']>[0]): Promise<Row> {
    return this.one(sql`select products.reconcile_catalog(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reconcile_catalog');
  }
}

export const CatalogCapability = {
  read(tx: Tx, action: string): CatalogReads { return new CatalogCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): CatalogWrites { return new CatalogCapabilityImpl(tx, action); },
  /** The attention tick's step (bound to executive.attention.tick): the reconciliation and nothing else. */
  tick(tx: Tx, action: string): Pick<CatalogWrites, 'reconcile' | 'now'> { return new CatalogCapabilityImpl(tx, action); },
};
