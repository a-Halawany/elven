/**
 * THE PRODUCT REGISTRY COMPLETED — CP-6 B90 §R (migration 0095 §R; F-P7-F-09's product half): the capabilities of the consumers, the
 * scorecards and the lifecycle, one class per port group (the prelude's products.capabilities.ts idiom). Each write is a thin binding to a
 * SECURITY DEFINER port that asserts the route's own action, the scope and the acting principal; each read is an invoker read under the
 * caller's RLS. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class Core {
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
  /** The database's clock (every "as of now" read and every header instant, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
  /** §0's product read (NULL outside the caller's scope). */
  async product(productId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select products.product_read(${productId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
}

/* ───────────── the consumers (a, b) ───────────── */
export interface ConsumerWrites {
  readonly action: string;
  now(): Promise<string>;
  product(productId: string): Promise<Row | null>;
  registerConsumer(a: { consumerId: string; productId: string; tenantId: string; domainId: string; consumer: string; consumerDomainId: string | null; purpose: string; impact: string | null; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  acceptContract(a: { consumerId: string; productId: string; tenantId: string; domainId: string; version: number; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  revokeConsumer(a: { consumerId: string; productId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  migrateConsumer(a: { consumerId: string; newConsumerId: string; productId: string; tenantId: string; domainId: string; version: number; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  recordContractTest(a: { testId: string; productId: string; consumerId: string; tenantId: string; domainId: string; version: number; outcome: string; evidence: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

class ConsumersImpl extends Core implements ConsumerWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  registerConsumer(a: Parameters<ConsumerWrites['registerConsumer']>[0]): Promise<Row> {
    return this.one(sql`select products.register_consumer(${a.consumerId}::uuid, ${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.consumer}::uuid, ${a.consumerDomainId}::uuid,
      ${a.purpose}, ${a.impact}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'register_consumer');
  }
  acceptContract(a: Parameters<ConsumerWrites['acceptContract']>[0]): Promise<Row> {
    return this.one(sql`select products.accept_consumer_contract(${a.consumerId}::uuid, ${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'accept_consumer_contract');
  }
  revokeConsumer(a: Parameters<ConsumerWrites['revokeConsumer']>[0]): Promise<Row> {
    return this.one(sql`select products.revoke_consumer(${a.consumerId}::uuid, ${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'revoke_consumer');
  }
  migrateConsumer(a: Parameters<ConsumerWrites['migrateConsumer']>[0]): Promise<Row> {
    return this.one(sql`select products.migrate_consumer(${a.consumerId}::uuid, ${a.newConsumerId}::uuid, ${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'migrate_consumer');
  }
  recordContractTest(a: Parameters<ConsumerWrites['recordContractTest']>[0]): Promise<Row> {
    return this.one(sql`select products.record_contract_test(${a.testId}::uuid, ${a.productId}::uuid, ${a.consumerId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.outcome},
      ${JSON.stringify(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'record_contract_test');
  }
}
export const ConsumerCapability = {
  write(tx: Tx, action: string): ConsumerWrites { return new ConsumersImpl(tx, action); },
};

/* ───────────── the scorecards and the cost (c, d) — and the tick's view ───────────── */
export interface ScorecardReads {
  readonly action: string;
  now(): Promise<string>;
  product(productId: string): Promise<Row | null>;
  /** products.product_scorecard: the latest scorecard, the recent ones, the consumers, the contract tests, the cost, the observations, the events. */
  scorecard(productId: string): Promise<Row | null>;
  /** The registry with each product's latest scorecard verdict (the list page). */
  listWithScorecards(a: { state: string | null; kind: string | null; limit: number }): Promise<Row[]>;
}
export interface ScorecardWrites extends ScorecardReads {
  attributeCost(a: { attributionId: string; productId: string; tenantId: string; domainId: string; periodStart: string; periodEnd: string; amount: string; currency: string; basis: string; details: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  computeScorecard(a: { scorecardId: string; productId: string; tenantId: string; domainId: string; windowDays: number | null; actor: string; correlationId: string }): Promise<Row>;
}
/** The tick step's view (bound to executive.attention.tick): the products to score, the scorecard, the degradation. */
export interface ScorecardTickWrites extends ScorecardWrites {
  productsToScore(a: { tenantId: string; domainId: string }): Promise<Array<{ product_id: string; product_key: string; state: string }>>;
  degrade(a: { productId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

class ScorecardsImpl extends Core implements ScorecardTickWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async scorecard(productId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select products.product_scorecard(${productId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async listWithScorecards(a: { state: string | null; kind: string | null; limit: number }): Promise<Row[]> {
    return this.call<Row>(sql`select products.product_json(p) as product, s.overall, s.attainment_pct, s.floor_pct, s.below_floor, s.computed_at as scorecard_at
      from products.products_current p
      left join lateral (select x.overall, x.attainment_pct, x.floor_pct, x.below_floor, x.computed_at from products.scorecards x where x.product_id = p.product_id order by x.computed_at desc limit 1) s on true
      where (${a.state}::text is null or p.state = ${a.state}) and (${a.kind}::text is null or p.kind = ${a.kind})
      order by p.registered_at desc limit ${a.limit}`).then((rows) => rows.map((x) => ({ ...(x['product'] as Row),
        scorecard: x['overall'] === null || x['overall'] === undefined ? null : { overall: x['overall'], attainment_pct: x['attainment_pct'], floor_pct: x['floor_pct'], below_floor: x['below_floor'], computed_at: x['scorecard_at'] } })));
  }
  attributeCost(a: Parameters<ScorecardWrites['attributeCost']>[0]): Promise<Row> {
    return this.one(sql`select products.attribute_cost(${a.attributionId}::uuid, ${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.periodStart}::date, ${a.periodEnd}::date, ${a.amount}::numeric, ${a.currency}, ${a.basis},
      ${JSON.stringify(a.details)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'attribute_cost');
  }
  computeScorecard(a: Parameters<ScorecardWrites['computeScorecard']>[0]): Promise<Row> {
    return this.one(sql`select products.compute_scorecard(${a.scorecardId}::uuid, ${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.windowDays}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'compute_scorecard');
  }
  productsToScore(a: { tenantId: string; domainId: string }): Promise<Array<{ product_id: string; product_key: string; state: string }>> {
    return this.call(sql`select p.product_id::text as product_id, p.product_key, p.state from products.products_current p
      where p.tenant_id = ${a.tenantId}::uuid and p.domain_id = ${a.domainId}::uuid and p.state in ('released', 'degraded') order by p.registered_at`);
  }
  degrade(a: Parameters<ScorecardTickWrites['degrade']>[0]): Promise<Row> {
    return this.one(sql`select products.degrade_product(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'degrade_product');
  }
}
export const ScorecardCapability = {
  read(tx: Tx, action: string): ScorecardReads { return new ScorecardsImpl(tx, action); },
  write(tx: Tx, action: string): ScorecardWrites { return new ScorecardsImpl(tx, action); },
  tick(tx: Tx, action: string): ScorecardTickWrites { return new ScorecardsImpl(tx, action); },
};

/* ───────────── the lifecycle (e): degrade / restore / withdraw / retire, the DPR's withdrawn and archived versions ───────────── */
export interface LifecycleWrites {
  readonly action: string;
  now(): Promise<string>;
  product(productId: string): Promise<Row | null>;
  degrade(a: { productId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  restore(a: { productId: string; tenantId: string; domainId: string; note: string | null; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  withdraw(a: { productId: string; tenantId: string; domainId: string; reason: string; objectVersion: number; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  retire(a: { productId: string; tenantId: string; domainId: string; objectVersion: number | null; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  /** The latest canonical DPR version of the product with the header fields carried forward (NULL before its first release). */
  latestDpr(productId: string): Promise<Row | null>;
  /** objects.admit_version under the bound action (products.product.withdraw | products.product.retire). */
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
}

class LifecycleImpl extends Core implements LifecycleWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  degrade(a: Parameters<LifecycleWrites['degrade']>[0]): Promise<Row> {
    return this.one(sql`select products.degrade_product(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'degrade_product');
  }
  restore(a: Parameters<LifecycleWrites['restore']>[0]): Promise<Row> {
    return this.one(sql`select products.restore_product(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'restore_product');
  }
  withdraw(a: Parameters<LifecycleWrites['withdraw']>[0]): Promise<Row> {
    return this.one(sql`select products.withdraw_product(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.objectVersion}::bigint, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'withdraw_product');
  }
  retire(a: Parameters<LifecycleWrites['retire']>[0]): Promise<Row> {
    return this.one(sql`select products.retire_product(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectVersion}::bigint, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'retire_product');
  }
  async latestDpr(productId: string): Promise<Row | null> {
    const rows = await this.call<Row>(sql`select object_id::text, object_type, tenant_id::text, domain_id::text, object_version::int as object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids,
        event_time, observation_time, valid_from, valid_to, time_precision, source_clock_quality, truth_state, synthetic_state, evidence_refs, provenance_ref, method_ref, classification, purpose_scope,
        rights_profile, residency_profile, retention_profile, schema_ref, withdrawal_reason, content_ref, payload
      from objects.canonical_objects where object_id = ${productId}::uuid and object_type = 'DPR' order by object_version desc limit 1`);
    return rows[0] ?? null;
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0]; if (r === undefined) throw new Error('admission returned no row'); return { contentDigest: r.content_digest };
  }
}
export const LifecycleCapability = {
  write(tx: Tx, action: string): LifecycleWrites { return new LifecycleImpl(tx, action); },
};
