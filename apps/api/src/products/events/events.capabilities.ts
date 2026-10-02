/**
 * EVENT PRODUCT CAPABILITIES — CP-6 B90 part `events` (migration 0095 §E; F-P7-F-09's event half, V7 ch43).
 *
 * The prelude's idiom (products.capabilities.ts): one class, three views. Each write is a thin binding to a SECURITY DEFINER port that
 * asserts the route's own action, the scope and the acting principal; each read is an invoker read under the caller's RLS (or, for the
 * consumer's own read of events, the definer port under products.subscription.read); the tick view binds the two steps' ports under
 * executive.attention.tick. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class EventsCore {
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

export interface EventReads {
  readonly action: string;
  call<T>(q: ReturnType<typeof sql>): Promise<T[]>;
  now(): Promise<string>;
  /** products.event_product_read: the product, its event declaration, the stream head, the retention floor, its subscriptions with their lag. */
  eventProduct(productId: string): Promise<Row | null>;
  /** The event products of the domain under the caller's RLS (each as event_product_read). */
  list(a: { state: string | null; limit: number }): Promise<Row[]>;
  /** products.subscription_read: the subscription with its product, head, lag, checkpoints and replays. */
  subscription(subscriptionId: string): Promise<Row | null>;
  /** The subscriptions under the caller's RLS, by consumer and/or product (each as subscription_read). */
  subscriptions(a: { consumer: string | null; productId: string | null; limit: number }): Promise<Row[]>;
  /** products.read_subscription_events — the CONSUMER's own read (the definer port under products.subscription.read). */
  subscriptionEvents(a: { subscriptionId: string; tenantId: string; domainId: string; afterSequence: number | null; limit: number; actor: string; correlationId: string }): Promise<Row>;
}

export interface EventWrites extends EventReads {
  declareEventProduct(a: { productId: string; tenantId: string; domainId: string; declaration: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  registerSubscription(a: { subscriptionId: string; productId: string; tenantId: string; domainId: string; consumer: string; purpose: string; granted: Row; filters: Row; schemaVersion: string; lagPolicy: Row;
    handlesCorrections: boolean; handlesReplays: boolean; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  authorizeSubscription(a: { subscriptionId: string; tenantId: string; domainId: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  advanceCheckpoint(a: { checkpointId: string; subscriptionId: string; tenantId: string; domainId: string; sequence: number; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  /* B90-F1 (0096): the CONSUMER's catch-up of a LAGGING subscription's authorized backlog (products.catch_up_subscription_events under products.subscription.catch_up) */
  catchUp(a: { catchupId: string; subscriptionId: string; tenantId: string; domainId: string; afterSequence: number | null; limit: number; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  pauseSubscription(a: { subscriptionId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  conformSubscription(a: { subscriptionId: string; tenantId: string; domainId: string; declaration: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  resumeSubscription(a: { subscriptionId: string; tenantId: string; domainId: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  replaySubscription(a: { replayId: string; subscriptionId: string; tenantId: string; domainId: string; fromSequence: number; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  revokeSubscription(a: { subscriptionId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

/** The tick's view (executive.attention.tick): the released event products of the domain, the emitter, the lag evaluation. */
export interface EventTickWrites {
  releasedEventProducts(): Promise<Array<{ product_id: string; product_key: string }>>;
  emitEvents(a: { productId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  evaluateSubscriptionLag(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

class EventsCapabilityImpl extends EventsCore implements EventWrites, EventTickWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async eventProduct(productId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select products.event_product_read(${productId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async list(a: { state: string | null; limit: number }): Promise<Row[]> {
    return this.call<{ r: Row }>(sql`select products.event_product_read(p.product_id) as r from products.products_current p join products.event_products ep on ep.product_id = p.product_id
      where p.kind = 'event' and (${a.state}::text is null or p.state = ${a.state}) order by p.registered_at desc limit ${a.limit}`).then((rows) => rows.map((x) => x.r));
  }
  async subscription(subscriptionId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select products.subscription_read(${subscriptionId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async subscriptions(a: { consumer: string | null; productId: string | null; limit: number }): Promise<Row[]> {
    return this.call<{ r: Row }>(sql`select products.subscription_read(s.subscription_id) as r from products.event_subscriptions s
      where (${a.consumer}::uuid is null or s.consumer_principal_id = ${a.consumer}::uuid) and (${a.productId}::uuid is null or s.product_id = ${a.productId}::uuid)
      order by s.registered_at desc limit ${a.limit}`).then((rows) => rows.map((x) => x.r));
  }
  async subscriptionEvents(a: Parameters<EventReads['subscriptionEvents']>[0]): Promise<Row> {
    return this.one(sql`select products.read_subscription_events(${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.afterSequence}::bigint, ${a.limit}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'read_subscription_events');
  }
  async declareEventProduct(a: Parameters<EventWrites['declareEventProduct']>[0]): Promise<Row> {
    return this.one(sql`select products.declare_event_product(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.declaration)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'declare_event_product');
  }
  async registerSubscription(a: Parameters<EventWrites['registerSubscription']>[0]): Promise<Row> {
    return this.one(sql`select products.register_subscription(${a.subscriptionId}::uuid, ${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.consumer}::uuid, ${a.purpose},
      ${JSON.stringify(a.granted)}::jsonb, ${JSON.stringify(a.filters)}::jsonb, ${a.schemaVersion}, ${JSON.stringify(a.lagPolicy)}::jsonb, ${a.handlesCorrections}, ${a.handlesReplays},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'register_subscription');
  }
  async authorizeSubscription(a: Parameters<EventWrites['authorizeSubscription']>[0]): Promise<Row> {
    return this.one(sql`select products.authorize_subscription(${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'authorize_subscription');
  }
  /* B90-F1 (0096) */
  async catchUp(a: Parameters<EventWrites['catchUp']>[0]): Promise<Row> {
    return this.one(sql`select products.catch_up_subscription_events(${a.catchupId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.afterSequence}::bigint, ${a.limit}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'catch_up_subscription_events');
  }
  async advanceCheckpoint(a: Parameters<EventWrites['advanceCheckpoint']>[0]): Promise<Row> {
    return this.one(sql`select products.advance_checkpoint(${a.checkpointId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sequence}::bigint, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'advance_checkpoint');
  }
  async pauseSubscription(a: Parameters<EventWrites['pauseSubscription']>[0]): Promise<Row> {
    return this.one(sql`select products.pause_subscription(${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'pause_subscription');
  }
  async conformSubscription(a: Parameters<EventWrites['conformSubscription']>[0]): Promise<Row> {
    return this.one(sql`select products.conform_subscription(${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.declaration)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'conform_subscription');
  }
  async resumeSubscription(a: Parameters<EventWrites['resumeSubscription']>[0]): Promise<Row> {
    return this.one(sql`select products.resume_subscription(${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'resume_subscription');
  }
  async replaySubscription(a: Parameters<EventWrites['replaySubscription']>[0]): Promise<Row> {
    return this.one(sql`select products.replay_subscription(${a.replayId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.fromSequence}::bigint, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'replay_subscription');
  }
  async revokeSubscription(a: Parameters<EventWrites['revokeSubscription']>[0]): Promise<Row> {
    return this.one(sql`select products.revoke_subscription(${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'revoke_subscription');
  }
  /* the tick's view */
  async releasedEventProducts(): Promise<Array<{ product_id: string; product_key: string }>> {
    return this.call<{ product_id: string; product_key: string }>(sql`select p.product_id::text as product_id, p.product_key from products.products_current p join products.event_products ep on ep.product_id = p.product_id
      where p.kind = 'event' and p.state in ('released', 'degraded') order by p.registered_at`);
  }
  async emitEvents(a: Parameters<EventTickWrites['emitEvents']>[0]): Promise<Row> {
    return this.one(sql`select products.emit_events(${a.productId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'emit_events');
  }
  async evaluateSubscriptionLag(a: Parameters<EventTickWrites['evaluateSubscriptionLag']>[0]): Promise<Row> {
    return this.one(sql`select products.evaluate_subscription_lag(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'evaluate_subscription_lag');
  }
}

export const EventCapability = {
  read(tx: Tx, action: string): EventReads { return new EventsCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): EventWrites { return new EventsCapabilityImpl(tx, action); },
  tick(tx: Tx, action: string): EventTickWrites { return new EventsCapabilityImpl(tx, action); },
};
