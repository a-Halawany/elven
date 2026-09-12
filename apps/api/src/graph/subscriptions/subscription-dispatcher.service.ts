/**
 * The SUBSCRIPTION DISPATCHER — CP-6 batch B6 (migration 0063): the durable workflow behind GraphChanged and
 * MemoryCorrected. It starts with the process when the scheduler is enabled and does three things:
 *
 *  1. Holds the registry of CONSUMERS — one per kind (twins, forecasts, scenarios, decisions, retrieval, memory
 *     mappings), each registered by its own module at bootstrap and each supplying its capability, how an event
 *     resolves to items, and one bounded idempotent effect per item. The dispatcher never touches a consumer's
 *     tables itself.
 *  2. RECONCILES at startup, at every registration/resume, and on a periodic tick: every domain with an active
 *     subscription gets a worker; every published event of a subscribed type with no delivery or a non-terminal
 *     one (received: never applied or interrupted mid-apply; failed: infrastructure) is re-driven — the 0062 lesson
 *     from the start — and a row published out of order behind the checkpoint is found by the look-back. A job a
 *     live worker still holds is left alone (job-id dedupe; the report says inFlight).
 *  3. DELIVERS each job through the governed path: receive (the ledger, under the scheduler's bounded capability —
 *     a refused grant is still recorded) fans the event out to the domain's active subscriptions; for each, the
 *     subscriber's own session is opened by its port, its items are resolved and recorded under its action, and
 *     every item is ONE governed write: the per-item checkpoint locked FOR UPDATE inside the effect's transaction
 *     and committed with it, the session extended on each. The database decides the outcome and the checkpoint.
 *
 * FAILURE IS RECORDED, NEVER FATAL. A refused or absent grant, a missing consumer, a budget refusal or a
 * revocation mid-delivery is a GOVERNANCE answer — recorded as refused, not retried by the queue, re-driven only
 * by a registration, a resume or a replay. An infrastructure fault is recorded as failed and rethrown for the
 * queue's bounded retry; the next delivery resumes from the items already applied.
 */
import { HttpException, Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { sql } from 'kysely';
import type { Envelope } from '@eye/contracts';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db, Tx } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import { markSubscribedDomain } from '../../shared/queues.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService, type WriteEffect } from '../../pipeline/pipeline.service.js';
import { SchedulerService, type SubscriptionJobPayload } from '../../observation/scheduling/scheduler.service.js';
import { CONSUMER_ACTION, SubscriptionLedger, type ChangeEvent, type ConsumerKind, type SubscriptionConsumer } from './graph-change.js';
import { SubscriptionGrantRefused, SubscriptionSessionService } from './subscription-session.service.js';

interface DeliveryRow {
  subscription_id: string; consumer_kind: ConsumerKind; principal_id: string; consumer_version: string; code_digest: string;
  budgets: { max_items_per_event?: number; max_elapsed_ms?: number };
  state: 'received' | 'applied' | 'failed' | 'refused'; deliveries: number; attempts: number; items: string[];
  items_applied: Array<{ item: string; effect: string; effect_ref: string | null }>; replay_seq: number;
}
export interface SubscriptionReconcileReport {
  at: string; reason: string;
  domains: Array<{ tenantId: string; domainId: string; subscriptions: number }>;
  workers: string[];
  reDriven: Array<{ tenantId: string; domainId: string; eventId: string; subscriptionIds: string[]; previous: Array<string | null> }>;
  inFlight: Array<{ tenantId: string; domainId: string; eventId: string; jobState: string }>;
  outboxFailures: Array<{ tenantId: string; domainId: string; eventId: string; eventType: string }>;
}
export type DispatcherFault = 'before_item' | 'after_first_item' | 'interrupt_after_receipt' | 'interrupt_after_first_item' | 'slow_before_item';
const INTERRUPTED = (): Promise<never> => new Promise<never>(() => { /* a killed process never returns */ });
const RECONCILE_TICK_MS = 60_000;

@Injectable()
export class SubscriptionDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('graph.subscriptions');
  private readonly consumers = new Map<ConsumerKind, SubscriptionConsumer<unknown>>();
  private lastReconcile: SubscriptionReconcileReport | null = null;
  private lastFailure: { at: string; where: string; message: string } | null = null;
  private fault: DispatcherFault | null = null;
  /** A per-item fault fires only for deliveries of this kind (null: the first delivery that reaches the point). */
  private faultKind: ConsumerKind | null = null;
  private tick: NodeJS.Timeout | null = null;
  private readonly recent: Array<{ at: string; eventId: string; subscriptionId: string; kind: string; outcome: string; reason: string | null }> = [];

  constructor(
    @Inject(COMMIT_DB) private readonly commitDb: Db,
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    private readonly pipeline: PipelineService,
    private readonly scheduler: SchedulerService,
    private readonly sessions: SubscriptionSessionService,
  ) {}

  /** Each consumer module registers its consumer at its own module init, before the dispatcher's bootstrap. */
  registerConsumer<C>(consumer: SubscriptionConsumer<C>): void {
    this.consumers.set(consumer.kind, consumer as SubscriptionConsumer<unknown>);
  }
  registeredKinds(): ConsumerKind[] { return [...this.consumers.keys()]; }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.scheduler.enabled) {
      this.log.log('scheduler disabled: no subscription worker started; graph and memory changes are not delivered');
      return;
    }
    this.scheduler.registerSubscriptionHandler((payload, jobId, attempt) => this.handle(payload, jobId, attempt));
    try {
      const r = await this.reconcile('startup reconciliation', false);
      this.log.log(`serving ${r.domains.length} domain(s) with subscriptions (consumers: ${this.registeredKinds().join(', ') || 'none'}); re-drove ${r.reDriven.length} event(s)`);
    } catch (e) { this.note('startup reconciliation', e); }
    // A stranded delivery never waits for a restart: the tick re-drives non-terminal and failed deliveries.
    this.tick = setInterval(() => { this.reconcile('periodic reconciliation', false).catch((e) => this.note('periodic reconciliation', e)); }, RECONCILE_TICK_MS);
    this.tick.unref();
  }
  onModuleDestroy(): void { if (this.tick !== null) clearInterval(this.tick); }

  lastReconciliation(): SubscriptionReconcileReport | null { return this.lastReconcile; }
  lastFailureSeen(): { at: string; where: string; message: string } | null { return this.lastFailure; }
  recentDeliveries(): ReadonlyArray<{ at: string; eventId: string; subscriptionId: string; kind: string; outcome: string; reason: string | null }> { return this.recent; }
  armFaultForTests(kind: DispatcherFault | null, forKind: ConsumerKind | null = null): void {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('armFaultForTests is available only in the test runtime');
    this.fault = kind; this.faultKind = forKind;
  }
  private faultArmed(kind: DispatcherFault, consumerKind: ConsumerKind): boolean {
    return this.fault === kind && (this.faultKind === null || this.faultKind === consumerKind);
  }
  private note(where: string, e: unknown): void {
    const message = (e as Error)?.message ?? String(e);
    this.lastFailure = { at: new Date().toISOString(), where, message: message.slice(0, 300) };
    this.log.error(`${where} failed: ${message.slice(0, 200)}`);
  }

  /**
   * Serve every domain with an active subscription; re-drive every outstanding delivery. `includeRefused` is true at a
   * registration, a resume or a replay (the governance answer may have changed); false at startup and on the tick.
   */
  async reconcile(reason: string, includeRefused: boolean): Promise<SubscriptionReconcileReport> {
    const { domains, rows, failures } = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${reason}, 60)`.execute(tx);
      const domains = (await sql<{ tenant_id: string; domain_id: string; subscriptions: number }>`select * from graph.subscription_domains_to_serve()`.execute(tx)).rows;
      const rows = (await sql<{ tenant_id: string; domain_id: string; event_id: string; event_type: string; change_kind: string; outbox_created_at: Date; correlation_id: string; causation_id: string; subscription_id: string; delivery_state: string | null }>`
        select * from graph.subscription_deliveries_to_reconcile(${includeRefused}, interval '24 hours')`.execute(tx)).rows;
      const failures = (await sql<{ tenant_id: string; domain_id: string; event_id: string; event_type: string }>`select tenant_id, domain_id, event_id, event_type from graph.subscription_outbox_failures()`.execute(tx)).rows;
      return { domains, rows, failures };
    });
    const report: SubscriptionReconcileReport = { at: new Date().toISOString(), reason, domains: [], workers: [], reDriven: [], inFlight: [], outboxFailures: [] };
    const served = new Set<string>();
    for (const d of domains) {
      this.scheduler.startSubscriptionWorker(d.tenant_id, d.domain_id);
      markSubscribedDomain(d.tenant_id, d.domain_id, true);
      served.add(`${d.tenant_id}/${d.domain_id}`);
      report.domains.push({ tenantId: d.tenant_id, domainId: d.domain_id, subscriptions: d.subscriptions });
    }
    // One job per event: the receive port fans it out to every subscription it matches.
    const byEvent = new Map<string, typeof rows>();
    for (const r of rows) { const k = r.event_id; if (!byEvent.has(k)) byEvent.set(k, []); byEvent.get(k)!.push(r); }
    for (const [eventId, group] of byEvent) {
      const e = group[0]!;
      try {
        const r = await this.scheduler.enqueueSubscriptionDelivery(e.tenant_id, e.domain_id, {
          event_id: eventId, event_type: e.event_type, payload: { re_driven: reason },
          correlation_id: e.correlation_id, causation_id: e.causation_id, tenant_id: e.tenant_id, domain_id: e.domain_id, replay: null,
        });
        if (r.added) report.reDriven.push({ tenantId: e.tenant_id, domainId: e.domain_id, eventId, subscriptionIds: group.map((g) => g.subscription_id), previous: group.map((g) => g.delivery_state) });
        else if (r.inFlight !== null) report.inFlight.push({ tenantId: e.tenant_id, domainId: e.domain_id, eventId, jobState: r.inFlight });
      } catch (x) { this.note(`re-drive of event ${eventId.slice(0, 8)}`, x); }
    }
    report.outboxFailures = failures.map((f) => ({ tenantId: f.tenant_id, domainId: f.domain_id, eventId: f.event_id, eventType: f.event_type }));
    report.workers = this.scheduler.runningWorkers();
    this.lastReconcile = report;
    return report;
  }

  // ───────────────────────── one delivery ─────────────────────────

  private async loadEvent(eventId: string, tenantId: string, domainId: string): Promise<{ event_type: string; payload: Record<string, unknown>; created_at: Date } | null> {
    // The published outbox row is the event; the job carried only its id (a re-drive carries no payload at all).
    const rows = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('subscription delivery: read the event', 60)`.execute(tx);
      return (await sql<{ event_type: string; payload: Record<string, unknown>; created_at: Date }>`select event_type, payload, created_at from graph.subscription_event_row(${eventId}::uuid, ${tenantId}::uuid, ${domainId}::uuid)`.execute(tx)).rows;
    });
    return rows[0] ?? null;
  }
  private async receive(a: { eventId: string; tenantId: string; domainId: string; eventType: string; changeKind: string; createdAt: Date; only: string | null; replaySeq: number | null }): Promise<DeliveryRow[]> {
    return this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('subscription delivery received', 60)`.execute(tx);
      const rows = await sql<{ r: DeliveryRow[] }>`select graph.subscription_delivery_receive(${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.eventType}, ${a.changeKind}, ${a.createdAt}, ${a.only}::uuid, ${a.replaySeq}, ${newId()}::uuid) as r`.execute(tx);
      return rows.rows[0]?.r ?? [];
    });
  }
  private async finish(a: { eventId: string; subscriptionId: string; kind: string; tenantId: string; domainId: string; outcome: 'applied' | 'failed' | 'refused'; reason: string | null }): Promise<string> {
    const state = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('subscription delivery finished', 60)`.execute(tx);
      const rows = await sql<{ s: string }>`select graph.subscription_delivery_finish(${a.eventId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${a.reason}) as s`.execute(tx);
      return rows.rows[0]?.s ?? 'failed';
    });
    this.recent.unshift({ at: new Date().toISOString(), eventId: a.eventId, subscriptionId: a.subscriptionId, kind: a.kind, outcome: state, reason: a.reason });
    if (this.recent.length > 200) this.recent.length = 200;
    if (state !== 'applied') this.log.warn(`event ${a.eventId.slice(0, 8)} → ${a.kind}: delivery ${state}: ${a.reason ?? '(no reason)'}`);
    return state;
  }
  private env(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, action: string, purpose: string, objectType: string, objectId: string, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`,
      purpose_id: purpose, action, side_effect_class: 'reversible', consequence_class: 'C2',
      object_type: objectType, object_id: objectId, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: 'graph-subscription-dispatcher',
    } as unknown as Envelope;
  }

  /** One delivery of one event to every subscription it matches (or the one a replay names). */
  async handle(p: SubscriptionJobPayload, jobId: string, attemptsMade: number): Promise<void> {
    const tenantId = p.tenant_id; const domainId = p.domain_id;
    if ((p.event_type !== 'GraphChanged' && p.event_type !== 'MemoryCorrected') || tenantId === null || domainId === null) {
      throw new UnrecoverableError(`job ${jobId} is not a scoped GraphChanged or MemoryCorrected event`);
    }
    const row = await this.loadEvent(p.event_id, tenantId, domainId);
    if (row === null) throw new UnrecoverableError(`job ${jobId}: outbox row ${p.event_id} is not a published event of this domain`);
    const changeKind = String((row.payload['change'] as Record<string, unknown> | undefined)?.['kind'] ?? '');
    const event = { event_id: p.event_id, event_type: row.event_type, payload: row.payload } as unknown as ChangeEvent;
    const deliveries = await this.receive({ eventId: p.event_id, tenantId, domainId, eventType: row.event_type, changeKind, createdAt: row.created_at, only: p.replay?.subscription_id ?? null, replaySeq: p.replay?.replay_seq ?? null });
    if (this.fault === 'interrupt_after_receipt') { this.fault = null; await INTERRUPTED(); }
    let rethrow: unknown = null;
    for (const d of deliveries) {
      if (d.state === 'applied') continue; // a redelivery of an applied delivery: a durable no-op
      try {
        await this.deliverOne(event, d, tenantId, domainId, attemptsMade + 1);
      } catch (e) {
        rethrow = rethrow ?? e; // an infrastructure fault: every other subscription still gets its delivery, then the queue retries
      }
    }
    if (rethrow !== null) throw rethrow;
  }

  private async deliverOne(event: ChangeEvent, d: DeliveryRow, tenantId: string, domainId: string, attempt: number): Promise<void> {
    const base = { eventId: event.event_id, subscriptionId: d.subscription_id, kind: d.consumer_kind, tenantId, domainId };
    const consumer = this.consumers.get(d.consumer_kind);
    if (consumer === undefined) { await this.finish({ ...base, outcome: 'refused', reason: `no ${d.consumer_kind} consumer is registered in this process` }); return; }
    const action = CONSUMER_ACTION[d.consumer_kind];
    const maxItems = Number(d.budgets.max_items_per_event ?? 200);
    const maxElapsed = Number(d.budgets.max_elapsed_ms ?? 600_000);
    let principal: AuthenticatedPrincipal;
    const correlationId = newId();
    try {
      principal = await this.sessions.openRunSession({ subscriptionId: d.subscription_id, kind: d.consumer_kind, tenantId, domainId, correlationId });
    } catch (e) {
      if (e instanceof SubscriptionGrantRefused) { await this.finish({ ...base, outcome: 'refused', reason: e.message }); return; }
      await this.finish({ ...base, outcome: 'failed', reason: `fault opening the subscriber session: ${(e as Error).message.slice(0, 200)}` });
      throw e;
    }
    const scope = { tenantId, domainId };
    const factory = (tx: Tx, act: string) => ({ cap: consumer.capability(tx, act), ledger: new SubscriptionLedger(tx, act) });
    // The governed target of an item's write is the object the item names (its uuid), or the delivery's event when the
    // item names none (retrieval's "projections"); the item key itself is carried on the ledger, never as a target.
    const targetOf = (item: string): string => /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(item)?.[0] ?? event.event_id;
    const route = (objectId: string) => ({ scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: consumer.objectType, objectId });
    // 1. The items, resolved under the subscriber's own capability and recorded once (a resumed delivery keeps its list).
    let items: string[];
    try {
      items = (await this.pipeline.write(this.env(principal, tenantId, domainId, action, consumer.purpose, consumer.objectType, event.event_id, correlationId), principal, route(event.event_id), factory,
        async ({ cap, ledger }): Promise<WriteEffect<string[]>> => {
          const resolved = d.items.length > 0 ? d.items : await consumer.resolveItems(cap, scope, event);
          if (resolved.length > maxItems) throw new BudgetRefused(`budget: ${resolved.length} item(s) exceed max_items_per_event ${maxItems}`);
          const recorded = await ledger.setItems({ eventId: event.event_id, subscriptionId: d.subscription_id, tenantId, domainId, items: resolved });
          return { result: recorded, targetType: consumer.objectType, targetId: null, targetVersion: null, outboxEvent: null };
        })).result;
    } catch (e) {
      if (e instanceof BudgetRefused) { await this.finish({ ...base, outcome: 'refused', reason: e.message }); return; }
      if (e instanceof HttpException && e.getStatus() === 403) { await this.finish({ ...base, outcome: 'refused', reason: 'authority refused: the subscription grant does not cover this delivery' }); return; }
      await this.finish({ ...base, outcome: 'failed', reason: `fault resolving items: ${(e as Error).message.slice(0, 200)}` });
      throw e;
    }
    // 2. One governed write per item, each with its checkpoint, the session extended on each.
    const started = Date.now();
    const applied = new Set(d.items_applied.map((x) => x.item));
    let appliedNow = 0;
    for (const item of items) {
      if (applied.has(item)) continue;
      if (Date.now() - started > maxElapsed) { await this.finish({ ...base, outcome: 'failed', reason: `budget: max_elapsed_ms ${maxElapsed} reached; the next delivery resumes from the checkpoint` }); return; }
      if (this.faultArmed('before_item', d.consumer_kind)) { this.fault = null; await this.finish({ ...base, outcome: 'failed', reason: 'fault: injected infrastructure fault before the item (test)' }); throw new Error('injected infrastructure fault before the item (test)'); }
      if (this.faultArmed('slow_before_item', d.consumer_kind)) { this.fault = null; await new Promise((r) => setTimeout(r, 4000)); }
      let failure: string | null = null;
      try {
        failure = (await this.pipeline.write(this.env(principal, tenantId, domainId, action, consumer.purpose, consumer.objectType, targetOf(item), correlationId), principal, route(targetOf(item)), factory,
          async ({ cap, ledger }): Promise<WriteEffect<string | null>> => {
            const begun = await ledger.itemBegin({ eventId: event.event_id, subscriptionId: d.subscription_id, tenantId, domainId, item });
            if (!begun) return { result: null, targetType: consumer.objectType, targetId: null, targetVersion: null, outboxEvent: null };
            const r = await consumer.applyItem(cap, scope, event, item, principal.principalId, correlationId, d.subscription_id);
            await ledger.itemDone({ eventId: event.event_id, subscriptionId: d.subscription_id, tenantId, domainId, item, effect: r.effect, effectRef: r.effectRef, ...(r.details === undefined ? {} : { details: r.details }) });
            return { result: r.failure ?? null, targetType: consumer.objectType, targetId: r.effectRef, targetVersion: null, outboxEvent: null };
          })).result;
      } catch (e) {
        if (e instanceof HttpException && e.getStatus() === 403) { await this.finish({ ...base, outcome: 'refused', reason: 'authority refused mid-delivery: the subscription grant no longer covers it' }); return; }
        await this.finish({ ...base, outcome: 'failed', reason: `fault: ${(e as Error).message.slice(0, 200)}` });
        throw e;
      }
      appliedNow += 1;
      // The item is recorded; what it found is operator work: the delivery ends failed, visibly, and the tick re-verifies.
      if (failure !== null) { await this.finish({ ...base, outcome: 'failed', reason: failure }); return; }
      if (this.faultArmed('interrupt_after_first_item', d.consumer_kind) && appliedNow === 1) { this.fault = null; await INTERRUPTED(); }
      if (this.faultArmed('after_first_item', d.consumer_kind) && appliedNow === 1) { this.fault = null; await this.finish({ ...base, outcome: 'failed', reason: 'fault: injected infrastructure fault after the first item (test)' }); throw new Error('injected infrastructure fault after the first item (test)'); }
      const until = await this.sessions.extendRunSession({ sessionId: principal.sessionId, principalId: principal.principalId, subscriptionId: d.subscription_id, kind: d.consumer_kind, tenantId, domainId, correlationId });
      if (until === null) { await this.finish({ ...base, outcome: 'refused', reason: 'subscription paused or revoked during the delivery; the remaining items were not applied' }); return; }
    }
    await this.finish({ ...base, outcome: 'applied', reason: null });
  }
}

class BudgetRefused extends Error {}
