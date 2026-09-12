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
 * FAILURE IS RECORDED, NEVER FATAL — AND CLASSIFIED (AU-MEM-0039, 0064). A refused or absent grant, a missing
 * consumer, a budget refusal or a revocation mid-delivery is a GOVERNANCE answer — recorded as refused with its
 * failure class and disposition (authority_disputed → human_review, consumer_unavailable → retry, budget →
 * human_review), not retried by the queue, re-driven only by a registration, a resume or a replay. An infrastructure
 * fault is recorded as failed (infrastructure → retry) and rethrown for the queue's bounded retry; the next delivery
 * resumes from the items already applied. An item whose effect finds OPERATOR WORK (a projection mismatch) is
 * recorded as UNRESOLVED — its check committed, the item never checkpointed as applied — and the delivery ends
 * `unresolved` (unresolved_dependency → human_review); every re-drive re-checks it and only a passing check applies
 * it (Codex finding 3: before 0064 the mismatched item was checkpointed as applied and the re-drive cleared the
 * failure with no second check).
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
import { hostname } from 'node:os';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService, type WriteEffect } from '../../pipeline/pipeline.service.js';
import { SchedulerService, type SubscriptionJobPayload } from '../../observation/scheduling/scheduler.service.js';
import { CONSUMER_ACTION, SubscriptionLedger, type ChangeEvent, type ConsumerKind, type Disposition, type FailureClass, type SubscriptionConsumer } from './graph-change.js';
import { SubscriptionGrantRefused, SubscriptionSessionService } from './subscription-session.service.js';

interface DeliveryRow {
  subscription_id: string; consumer_kind: ConsumerKind; principal_id: string; consumer_version: string; code_digest: string;
  budgets: { max_items_per_event?: number; max_elapsed_ms?: number };
  state: 'received' | 'applied' | 'failed' | 'refused' | 'unresolved'; deliveries: number; attempts: number; items: string[];
  items_applied: Array<{ item: string; effect: string; effect_ref: string | null }>;
  items_unresolved: Array<{ item: string; effect: string; effect_ref: string | null; reason: string; checks: number }>; replay_seq: number;
}
export interface SubscriptionReconcileReport {
  at: string; reason: string;
  /** Every domain with an active subscription, who serves it (the holder of its serving claim) and whether that is this process. */
  domains: Array<{ tenantId: string; domainId: string; subscriptions: number; servedBy: string | null; mine: boolean; claimedUntil: string | null; takenOver: boolean }>;
  workers: string[];
  reDriven: Array<{ tenantId: string; domainId: string; eventId: string; subscriptionIds: string[]; previous: Array<string | null>; partitionSeq: number | null }>;
  inFlight: Array<{ tenantId: string; domainId: string; eventId: string; jobState: string }>;
  outboxFailures: Array<{ tenantId: string; domainId: string; eventId: string; eventType: string }>;
}
export type DispatcherFault = 'before_item' | 'after_first_item' | 'interrupt_after_receipt' | 'interrupt_after_first_item' | 'slow_before_item';
const INTERRUPTED = (): Promise<never> => new Promise<never>(() => { /* a killed process never returns */ });
const RECONCILE_TICK_MS = 60_000;
/** An unresolved delivery (operator work) is re-checked on the tick only after this long; at once at a start, a registration, a resume or a replay. */
const UNRESOLVED_RECHECK = '10 minutes';
/**
 * ONE SERVER PER DOMAIN (0065 §3): a domain's queue is consumed by the process holding its serving claim — renewed on
 * every reconciliation (the tick), released at shutdown, taken over by another process once it lapses. Two and a half
 * ticks: a process that stops renewing loses the domain within that.
 */
const SERVING_CLAIM_SECONDS = 150;

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
  /** This process, as the serving ledger names it (host, pid and an instance nonce — two application contexts in one process are two holders). */
  private readonly holder = `${hostname()}/${process.pid}/${newId().slice(-8)}`;
  /** The domains whose serving claim this process holds (their workers run here) and until when this process BELIEVES it holds them (the fence). */
  private readonly serving = new Map<string, { tenantId: string; domainId: string; claimedUntil: number }>();
  /** Test runtime only: this process claims no domain (as one that lost every election would) and still enqueues re-drives. */
  private standDown = false;
  /** Set at shutdown: a reconciliation still in flight starts no worker and keeps no claim after this. */
  private stopped = false;

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
  /** Test runtime only: the consumer of a kind gone from this process (the AU-MEM-0039 "consumer unavailable" condition); returns it for re-registration. */
  unregisterConsumerForTests(kind: ConsumerKind): SubscriptionConsumer<unknown> | null {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('unregisterConsumerForTests is available only in the test runtime');
    const c = this.consumers.get(kind) ?? null;
    this.consumers.delete(kind);
    return c;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.scheduler.enabled) {
      this.log.log('scheduler disabled: no subscription worker started; graph and memory changes are not delivered');
      return;
    }
    this.scheduler.registerSubscriptionHandler((payload, jobId, attempt) => this.handle(payload, jobId, attempt));
    try {
      // A start is the moment a consumer may be back or a grant repaired: refused deliveries are re-driven too.
      const r = await this.reconcile('startup reconciliation', true);
      this.log.log(`serving ${r.domains.length} domain(s) with subscriptions (consumers: ${this.registeredKinds().join(', ') || 'none'}); re-drove ${r.reDriven.length} event(s)`);
    } catch (e) { this.note('startup reconciliation', e); }
    // A stranded delivery never waits for a restart: the tick re-drives non-terminal and failed deliveries.
    this.tick = setInterval(() => { this.reconcile('periodic reconciliation', false, UNRESOLVED_RECHECK).catch((e) => this.note('periodic reconciliation', e)); }, RECONCILE_TICK_MS);
    this.tick.unref();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.tick !== null) clearInterval(this.tick);
    // The workers close first (an in-flight job finishes), then the claims are released: the next holder never
    // consumes the queue beside this one.
    await this.releaseAll('shutdown');
  }
  private async releaseAll(reason: string): Promise<void> {
    if (reason === 'shutdown') this.stopped = true;
    // In the order the claim port locks rows (tenant, domain), so a release never crosses another process's reconciliation.
    const held = [...this.serving.values()].sort((a, b) => a.tenantId.localeCompare(b.tenantId) || a.domainId.localeCompare(b.domainId));
    this.serving.clear();
    for (const d of held) await this.scheduler.stopSubscriptionWorker(d.tenantId, d.domainId).catch(() => undefined);
    if (held.length === 0) return;
    try {
      await this.commitDb.transaction().execute(async (tx) => {
        await sql`select observation.issue_schedule_capability(${`subscription serving released: ${reason}`}, 60)`.execute(tx);
        for (const d of held) await sql`select graph.subscription_domain_release(${d.tenantId}::uuid, ${d.domainId}::uuid, ${this.holder}, ${reason})`.execute(tx);
      });
    } catch (e) { this.note(`serving release (${reason})`, e); }
  }

  lastReconciliation(): SubscriptionReconcileReport | null { return this.lastReconcile; }
  /** The holder identity this process claims domains under. */
  holderId(): string { return this.holder; }
  /** A holder of THIS host whose process is gone (its pid does not exist): a crash without a release. Other hosts are never judged. */
  private holderIsDeadOnThisHost(holder: string): boolean {
    const m = /^(.*)\/(\d+)\/[0-9a-f]+$/.exec(holder);
    if (m === null || m[1] !== hostname()) return false;
    const pid = Number(m[2]);
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
    try { process.kill(pid, 0); return false; } catch (e) { return (e as NodeJS.ErrnoException).code === 'ESRCH'; }
  }
  /** Whether this process holds the serving claim of the domain (its worker runs here). */
  serves(tenantId: string, domainId: string): boolean { return this.serving.has(`${tenantId}/${domainId}`); }
  /** Test runtime only: claim no domain (release any held) until told otherwise — the process that lost the election. */
  async standDownForTests(v: boolean): Promise<void> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('standDownForTests is available only in the test runtime');
    this.standDown = v;
    if (v) await this.releaseAll('stand-down');
  }
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
  /**
   * Serve every domain with an active subscription; re-drive every outstanding delivery. `includeRefused` is true at a
   * registration, a resume or a replay (the governance answer may have changed); false at startup and on the tick. `only`
   * scopes the re-drives (and the refused re-drives) to one domain — a registration, a resume or a replay acts on its own.
   */
  async reconcile(reason: string, includeRefused: boolean, recheck: string = '0', only: { tenantId: string; domainId: string } | null = null): Promise<SubscriptionReconcileReport> {
    // A process that cannot serve (the scheduler disabled — no worker can run here) or stands down claims nothing; it still enqueues re-drives.
    const standDown = this.standDown || this.stopped || !this.scheduler.enabled;
    const claimedAt = Date.now();
    const { domains, rows, failures } = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${reason}, 60)`.execute(tx);
      const found = (await sql<{ tenant_id: string; domain_id: string; subscriptions: number; holder: string | null; claimed_until: Date | null }>`select * from graph.subscription_domains_to_serve()`.execute(tx)).rows;
      // THE SERVING CLAIM (0065 §3): claim or renew each domain; a live claim by another process is honoured — its worker
      // runs there, not here — unless that holder is a process of THIS host whose pid is gone (a crash without a release):
      // then the claim is taken over at once, the reason recorded. A process standing down claims nothing.
      const domains: Array<{ tenant_id: string; domain_id: string; subscriptions: number; holder: string | null; claimed_until: Date | null; mine: boolean; taken_over: boolean }> = [];
      for (const d of found) {
        if (standDown) { domains.push({ ...d, mine: false, taken_over: false }); continue; }
        const dead = d.holder !== null && d.holder !== this.holder && this.holderIsDeadOnThisHost(d.holder) ? d.holder : null;
        const c = (await sql<{ holder: string; claimed_until: Date; mine: boolean; taken_over: boolean }>`select * from graph.subscription_domain_claim(${d.tenant_id}::uuid, ${d.domain_id}::uuid, ${this.holder}, ${SERVING_CLAIM_SECONDS}, ${dead})`.execute(tx)).rows[0]!;
        domains.push({ ...d, holder: c.holder, claimed_until: c.claimed_until, mine: c.mine, taken_over: c.taken_over });
      }
      const rows = (await sql<{ tenant_id: string; domain_id: string; event_id: string; event_type: string; change_kind: string; outbox_created_at: Date; correlation_id: string; causation_id: string; subscription_id: string; delivery_state: string | null; partition_seq: string | null }>`
        select * from graph.subscription_deliveries_to_reconcile(${includeRefused}, interval '24 hours', ${recheck}::interval)`.execute(tx)).rows;
      const failures = (await sql<{ tenant_id: string; domain_id: string; event_id: string; event_type: string }>`select tenant_id, domain_id, event_id, event_type from graph.subscription_outbox_failures()`.execute(tx)).rows;
      return { domains, rows, failures };
    });
    const report: SubscriptionReconcileReport = { at: new Date().toISOString(), reason, domains: [], workers: [], reDriven: [], inFlight: [], outboxFailures: [] };
    // Claimed during a stand-down or a shutdown that began meanwhile: given back at once, no worker started.
    if ((this.standDown || this.stopped) && !standDown && domains.some((d) => d.mine)) {
      try {
        await this.commitDb.transaction().execute(async (tx) => {
          await sql`select observation.issue_schedule_capability('subscription serving released: stood down meanwhile', 60)`.execute(tx);
          for (const d of domains.filter((x) => x.mine)) await sql`select graph.subscription_domain_release(${d.tenant_id}::uuid, ${d.domain_id}::uuid, ${this.holder}, 'stand-down')`.execute(tx);
        });
      } catch (e) { this.note('serving release (stood down meanwhile)', e); }
      for (const d of domains) { d.mine = false; d.holder = null; }
    }
    const seen = new Set<string>();
    for (const d of domains) {
      const key = `${d.tenant_id}/${d.domain_id}`;
      seen.add(key);
      if (d.mine) {
        if (d.taken_over) this.log.warn(`serving of ${d.tenant_id}/${d.domain_id} taken over from ${d.holder === this.holder ? 'a lapsed or dead holder' : d.holder}`);
        this.scheduler.startSubscriptionWorker(d.tenant_id, d.domain_id);
        // The fence: this process serves the domain only while it believes its claim live (the claim's instant, less a margin for clocks).
        this.serving.set(key, { tenantId: d.tenant_id, domainId: d.domain_id, claimedUntil: claimedAt + SERVING_CLAIM_SECONDS * 1000 - 5_000 });
      } else {
        // Another process serves the domain (or this one stands down): no worker here; re-drives are still enqueued below.
        if (this.serving.delete(key)) this.log.log(`serving of ${d.tenant_id}/${d.domain_id} passed to ${d.holder ?? 'nobody'}`);
        await this.scheduler.stopSubscriptionWorker(d.tenant_id, d.domain_id).catch((e) => this.note('worker stop', e));
      }
      report.domains.push({ tenantId: d.tenant_id, domainId: d.domain_id, subscriptions: d.subscriptions, servedBy: d.holder, mine: d.mine, claimedUntil: d.claimed_until?.toISOString() ?? null, takenOver: d.taken_over });
    }
    // A domain this process served that has no active subscription any more: its worker stops and its claim is released
    // (a scoped reconciliation saw only its own domain and releases nothing).
    const gone = only === null ? [...this.serving.entries()].filter(([k]) => !seen.has(k)) : [];
    if (gone.length > 0) {
      for (const [k, d] of gone) { this.serving.delete(k); await this.scheduler.stopSubscriptionWorker(d.tenantId, d.domainId).catch(() => undefined); }
      try {
        await this.commitDb.transaction().execute(async (tx) => {
          await sql`select observation.issue_schedule_capability('subscription serving released: no active subscription', 60)`.execute(tx);
          for (const [, d] of gone) await sql`select graph.subscription_domain_release(${d.tenantId}::uuid, ${d.domainId}::uuid, ${this.holder}, 'no active subscription')`.execute(tx);
        });
      } catch (e) { this.note('serving release', e); }
    }
    // One job per event: the receive port fans it out to every subscription it matches. A scoped reconciliation re-drives
    // its own domain's rows only (a replay of one subscription does not re-drive every tenant's refused deliveries).
    const byEvent = new Map<string, typeof rows>();
    for (const r of rows) {
      if (only !== null && (r.tenant_id !== only.tenantId || r.domain_id !== only.domainId)) continue;
      const k = r.event_id; if (!byEvent.has(k)) byEvent.set(k, []); byEvent.get(k)!.push(r);
    }
    for (const [eventId, group] of byEvent) {
      const e = group[0]!;
      try {
        // The re-drive names the subscriptions it is for: no other subscription's delivery of the event is reopened by it.
        const r = await this.scheduler.enqueueSubscriptionDelivery(e.tenant_id, e.domain_id, {
          event_id: eventId, event_type: e.event_type, payload: { re_driven: reason },
          correlation_id: e.correlation_id, causation_id: e.causation_id, tenant_id: e.tenant_id, domain_id: e.domain_id,
          only: [...new Set(group.map((g) => g.subscription_id))],
        });
        if (r.added) report.reDriven.push({ tenantId: e.tenant_id, domainId: e.domain_id, eventId, subscriptionIds: group.map((g) => g.subscription_id), previous: group.map((g) => g.delivery_state), partitionSeq: e.partition_seq === null ? null : Number(e.partition_seq) });
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
  private async receive(a: { eventId: string; tenantId: string; domainId: string; eventType: string; changeKind: string; createdAt: Date; only: string[] | null }): Promise<DeliveryRow[]> {
    return this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('subscription delivery received', 60)`.execute(tx);
      const rows = await sql<{ r: DeliveryRow[] }>`select graph.subscription_delivery_receive(${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.eventType}, ${a.changeKind}, ${a.createdAt}, ${a.only}::uuid[], ${newId()}::uuid) as r`.execute(tx);
      return rows.rows[0]?.r ?? [];
    });
  }
  private async finish(a: { eventId: string; subscriptionId: string; kind: string; tenantId: string; domainId: string; outcome: 'applied' | 'failed' | 'refused' | 'unresolved'; reason: string | null;
                            failureClass?: FailureClass; disposition?: Disposition }): Promise<string> {
    const state = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('subscription delivery finished', 60)`.execute(tx);
      const rows = await sql<{ s: string }>`select graph.subscription_delivery_finish(${a.eventId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${a.reason}, ${a.failureClass ?? null}, ${a.disposition ?? null}) as s`.execute(tx);
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
    // THE FENCE (0065 §3): a job is served only while this process still believes its serving claim live. A claim it could
    // not renew (the reconciliation failing, the process stalled) lapses here too: the worker stops and the job is left,
    // unstarted, to the holder that took the domain over.
    const claim = this.serving.get(`${tenantId}/${domainId}`);
    if (claim === undefined || claim.claimedUntil < Date.now()) {
      this.serving.delete(`${tenantId}/${domainId}`);
      await this.scheduler.stopSubscriptionWorker(tenantId, domainId).catch(() => undefined);
      throw new Error(`job ${jobId}: this process no longer holds the serving claim of ${tenantId}/${domainId}; the job is left to the holder`);
    }
    const row = await this.loadEvent(p.event_id, tenantId, domainId);
    if (row === null) throw new UnrecoverableError(`job ${jobId}: outbox row ${p.event_id} is not a published event of this domain`);
    const changeKind = String((row.payload['change'] as Record<string, unknown> | undefined)?.['kind'] ?? '');
    const event = { event_id: p.event_id, event_type: row.event_type, payload: row.payload } as unknown as ChangeEvent;
    const deliveries = await this.receive({ eventId: p.event_id, tenantId, domainId, eventType: row.event_type, changeKind, createdAt: row.created_at, only: p.only ?? null });
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
    if (consumer === undefined) { await this.finish({ ...base, outcome: 'refused', reason: `no ${d.consumer_kind} consumer is registered in this process`, failureClass: 'consumer_unavailable', disposition: 'retry' }); return; }
    const action = CONSUMER_ACTION[d.consumer_kind];
    const maxItems = Number(d.budgets.max_items_per_event ?? 200);
    const maxElapsed = Number(d.budgets.max_elapsed_ms ?? 600_000);
    let principal: AuthenticatedPrincipal;
    const correlationId = newId();
    try {
      principal = await this.sessions.openRunSession({ subscriptionId: d.subscription_id, kind: d.consumer_kind, tenantId, domainId, correlationId });
    } catch (e) {
      if (e instanceof SubscriptionGrantRefused) { await this.finish({ ...base, outcome: 'refused', reason: e.message, failureClass: 'authority_disputed', disposition: 'human_review' }); return; }
      await this.finish({ ...base, outcome: 'failed', reason: `fault opening the subscriber session: ${(e as Error).message.slice(0, 200)}`, failureClass: 'infrastructure', disposition: 'retry' });
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
      if (e instanceof BudgetRefused) { await this.finish({ ...base, outcome: 'refused', reason: e.message, failureClass: 'budget', disposition: 'human_review' }); return; }
      if (e instanceof HttpException && e.getStatus() === 403) { await this.finish({ ...base, outcome: 'refused', reason: 'authority refused: the subscription grant does not cover this delivery', failureClass: 'authority_disputed', disposition: 'human_review' }); return; }
      await this.finish({ ...base, outcome: 'failed', reason: `fault resolving items: ${(e as Error).message.slice(0, 200)}`, failureClass: 'infrastructure', disposition: 'retry' });
      throw e;
    }
    // 2. One governed write per item, each with its checkpoint, the session extended on each. An item already applied
    //    is skipped (a typed no-op); an item left UNRESOLVED by an earlier delivery is re-checked — it was never applied.
    const started = Date.now();
    const applied = new Set(d.items_applied.map((x) => x.item));
    const unresolved: string[] = [];
    // The delivery's class is the first unresolved item's (a consumer names it; a plain reason is an unresolved dependency).
    let unresolvedClass: { failureClass: FailureClass; disposition: Disposition } | null = null;
    let appliedNow = 0;
    for (const item of items) {
      if (applied.has(item)) continue;
      if (Date.now() - started > maxElapsed) { await this.finish({ ...base, outcome: 'failed', reason: `budget: max_elapsed_ms ${maxElapsed} reached; the next delivery resumes from the checkpoint`, failureClass: 'budget', disposition: 'retry' }); return; }
      if (this.faultArmed('before_item', d.consumer_kind)) { this.fault = null; await this.finish({ ...base, outcome: 'failed', reason: 'fault: injected infrastructure fault before the item (test)', failureClass: 'infrastructure', disposition: 'retry' }); throw new Error('injected infrastructure fault before the item (test)'); }
      if (this.faultArmed('slow_before_item', d.consumer_kind)) { this.fault = null; await new Promise((r) => setTimeout(r, 4000)); }
      let outcome: { unresolved: string | null; failureClass?: FailureClass; disposition?: Disposition };
      try {
        outcome = (await this.pipeline.write(this.env(principal, tenantId, domainId, action, consumer.purpose, consumer.objectType, targetOf(item), correlationId), principal, route(targetOf(item)), factory,
          async ({ cap, ledger }): Promise<WriteEffect<{ unresolved: string | null; failureClass?: FailureClass; disposition?: Disposition }>> => {
            const begun = await ledger.itemBegin({ eventId: event.event_id, subscriptionId: d.subscription_id, tenantId, domainId, item });
            if (!begun) return { result: { unresolved: null }, targetType: consumer.objectType, targetId: null, targetVersion: null, outboxEvent: null };
            const r = await consumer.applyItem(cap, scope, event, item, principal.principalId, correlationId, d.subscription_id, d.budgets as Record<string, unknown>);
            const details = { ...(r.details ?? {}), ...(r.exposure === undefined ? {} : { exposure: r.exposure }) };
            if (r.unresolved !== undefined) {
              // The effect's record (a check) commits with this write; the item does not: it stays open for the next re-drive.
              const u = typeof r.unresolved === 'string' ? { reason: r.unresolved, failureClass: 'unresolved_dependency' as const, disposition: 'human_review' as const } : r.unresolved;
              const checks = await ledger.itemUnresolved({ eventId: event.event_id, subscriptionId: d.subscription_id, tenantId, domainId, item, effect: r.effect, effectRef: r.effectRef, reason: u.reason,
                                                            details: { ...details, failure_class: u.failureClass, disposition: u.disposition } });
              return { result: { unresolved: `${item}: ${u.reason} (check ${checks})`, failureClass: u.failureClass, disposition: u.disposition }, targetType: consumer.objectType, targetId: r.effectRef, targetVersion: null, outboxEvent: null };
            }
            await ledger.itemDone({ eventId: event.event_id, subscriptionId: d.subscription_id, tenantId, domainId, item, effect: r.effect, effectRef: r.effectRef, details });
            return { result: { unresolved: null }, targetType: consumer.objectType, targetId: r.effectRef, targetVersion: null, outboxEvent: null };
          })).result;
      } catch (e) {
        if (e instanceof HttpException && e.getStatus() === 403) { await this.finish({ ...base, outcome: 'refused', reason: 'authority refused mid-delivery: the subscription grant no longer covers it', failureClass: 'authority_disputed', disposition: 'human_review' }); return; }
        await this.finish({ ...base, outcome: 'failed', reason: `fault: ${(e as Error).message.slice(0, 200)}`, failureClass: 'infrastructure', disposition: 'retry' });
        throw e;
      }
      if (outcome.unresolved !== null) {
        unresolved.push(outcome.unresolved);
        if (unresolvedClass === null) unresolvedClass = { failureClass: outcome.failureClass ?? 'unresolved_dependency', disposition: outcome.disposition ?? 'human_review' };
        continue;
      }
      appliedNow += 1;
      if (this.faultArmed('interrupt_after_first_item', d.consumer_kind) && appliedNow === 1) { this.fault = null; await INTERRUPTED(); }
      if (this.faultArmed('after_first_item', d.consumer_kind) && appliedNow === 1) { this.fault = null; await this.finish({ ...base, outcome: 'failed', reason: 'fault: injected infrastructure fault after the first item (test)', failureClass: 'infrastructure', disposition: 'retry' }); throw new Error('injected infrastructure fault after the first item (test)'); }
      let until: Date | null;
      try {
        until = await this.sessions.extendRunSession({ sessionId: principal.sessionId, principalId: principal.principalId, subscriptionId: d.subscription_id, kind: d.consumer_kind, tenantId, domainId, correlationId });
      } catch (e) {
        // An infrastructure fault at the extension is recorded and classified like any other, never left as 'received' without a finish.
        await this.finish({ ...base, outcome: 'failed', reason: `fault extending the subscriber session: ${(e as Error).message.slice(0, 200)}`, failureClass: 'infrastructure', disposition: 'retry' });
        throw e;
      }
      if (until === null) { await this.finish({ ...base, outcome: 'refused', reason: 'subscription paused or revoked during the delivery; the remaining items were not applied', failureClass: 'authority_disputed', disposition: 'human_review' }); return; }
    }
    // The database decides: applied only when every item was applied; unresolved while any item is operator work.
    if (unresolved.length > 0) { await this.finish({ ...base, outcome: 'unresolved', reason: unresolved.join('; ').slice(0, 500), failureClass: unresolvedClass?.failureClass ?? 'unresolved_dependency', disposition: unresolvedClass?.disposition ?? 'human_review' }); return; }
    await this.finish({ ...base, outcome: 'applied', reason: null });
  }
}

class BudgetRefused extends Error {}
