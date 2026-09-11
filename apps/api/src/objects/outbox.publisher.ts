/**
 * Outbox publisher (ADR-P0-12; Gate-2 §1/§5): publishes pending outbox rows
 * AFTER their transaction committed — to the BullMQ 'domain-events' queue
 * (Redis is transport only; the durable record is the outbox row + queue job
 * id). Interval poller; at-least-once with idempotent job ids (outbox row id).
 *
 * Runs on the dedicated PUBLISHER authority (eye_publisher), whose entire
 * surface is two ports: objects.outbox_lease (take a time-bounded lease on
 * pending rows) and objects.outbox_ack_leased (compare-and-set tied to that
 * lease). A publisher that lost its lease cannot acknowledge anything.
 * It cannot rewrite an event, and it cannot mark anything published outside a
 * pending → published/failed transition — so publication can neither forge nor
 * suppress delivery. Event identity and content are immutable by trigger.
 *
 * ROUTING (CP-6 B1, migration 0060). `domain-events` stays the global log it has
 * been since Phase 0 — one queue shared by every process on the same Redis,
 * consumed by nobody. A `CorrectionApplied` row is ADDITIONALLY added to the
 * domain's own propagation queue, where the propagation consumer serves it; the
 * acknowledgement follows both adds, so delivery is at-least-once to both and
 * exactly-once by id (the outbox row id is the job id on both). Every other
 * event type is published exactly as before.
 */
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import { PUBLISHER_DB } from '../shared/shared.module.js';
import type { Db } from '../shared/db.js';
import { propagationQueueNameFor, redisName } from '../shared/queues.js';

/** The options a routed propagation job is added with (kept in step with the scheduler's re-drive). */
const PROPAGATION_JOB_OPTS = { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 500 } as const;

/** Event types routed to a second, per-domain queue besides `domain-events`; the function names the queue or declines. */
const ROUTED: Record<string, (r: { tenant_id: string | null; domain_id: string | null }) => string | null> = {
  CorrectionApplied: (r) => r.tenant_id === null || r.domain_id === null ? null : redisName(propagationQueueNameFor(r.tenant_id, r.domain_id)),
};

interface PendingRow {
  id: string;
  lease_id: string;
  event_type: string;
  payload: unknown;
  correlation_id: string;
  causation_id: string;
  tenant_id: string | null;
  domain_id: string | null;
}

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('objects.outbox');
  private queue: Queue | null = null;
  /** The per-domain queues a routed event was added to, opened on first use. */
  private readonly routed = new Map<string, Queue>();
  private timer: NodeJS.Timeout | null = null;
  /** Consecutive ticks whose LEASE step failed; reported when it changes, so a stuck publisher is visible without flooding the log. */
  private leaseFailures = 0;

  constructor(
    @Inject(PUBLISHER_DB) private readonly db: Db,
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
  ) {}

  private connection(): { host: string; port: number; password: string } {
    return { host: this.cfg['eye.redis.host'], port: this.cfg['eye.redis.port'], password: this.cfg['eye.redis.password'] };
  }

  private routedQueue(name: string): Queue {
    let q = this.routed.get(name);
    if (q === undefined) { q = new Queue(name, { connection: this.connection() }); this.routed.set(name, q); }
    return q;
  }

  onModuleInit(): void {
    this.queue = new Queue('domain-events', { connection: this.connection() });
    /*
     * A BACKGROUND PUBLISHER THAT CANNOT PUBLISH REPORTS AND RETRIES; IT NEVER ENDS THE
     * PROCESS. On 2026-09-10 the tick's first transaction rejected (`capability denied:
     * mode publish required (context is none)` — the publish context's 60-second
     * wall-clock expiry had elapsed between issuance and use while the process was busy
     * with a multi-minute correction transaction) and, with no catch here, Node ended
     * the API on the unhandled rejection. The rows stay pending and the next tick
     * retries them; that is the whole of what a failed tick means.
     */
    this.timer = setInterval(() => {
      this.publishPending().catch((e: unknown) => this.reportTick(e));
    }, 1000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    await this.queue?.close();
    for (const q of this.routed.values()) await q.close().catch(() => undefined);
    this.routed.clear();
  }

  /** The failure of one tick, reported once per streak and once when the streak ends. */
  private reportTick(e: unknown): void {
    this.leaseFailures += 1;
    const msg = e instanceof Error ? e.message : String(e);
    if (this.leaseFailures === 1) this.log.warn(`publish tick failed; pending rows stay pending and the next tick retries: ${msg}`);
    else if (this.leaseFailures % 60 === 0) this.log.warn(`publish tick has failed ${this.leaseFailures} times in a row: ${msg}`);
  }

  async publishPending(): Promise<number> {
    if (this.queue === null) return 0;
    // The capability is issued and the lease taken in ONE backend call (migration 0057),
    // so no time can elapse between them on this side.
    const rows = (await sql<PendingRow>`select * from objects.outbox_lease_as_publisher(50, 60)`.execute(this.db)).rows;
    if (this.leaseFailures > 0) {
      this.log.log(`publish tick recovered after ${this.leaseFailures} failed tick(s)`);
      this.leaseFailures = 0;
    }

    let published = 0;
    for (const row of rows) {
      try {
        const data = {
          event_id: row.id,
          event_type: row.event_type,
          payload: row.payload,
          correlation_id: row.correlation_id,
          causation_id: row.causation_id,
          tenant_id: row.tenant_id,
          domain_id: row.domain_id,
        };
        await this.queue.add(
          row.event_type,
          data,
          { jobId: row.id }, // idempotent: duplicate publishes dedupe on job id
        );
        // A routed event reaches its consumer's queue too, before the row is acknowledged;
        // the same job id dedupes a redelivery there as well.
        const target = ROUTED[row.event_type]?.(row) ?? null;
        if (target !== null) await this.routedQueue(target).add('propagate', data, { ...PROPAGATION_JOB_OPTS, jobId: row.id });
        // Narrow compare-and-set acknowledgement — the only mutation available —
        // tied to the LEASE: without the lease id and the expected current status,
        // nothing moves. Capability and acknowledgement in one call (0057).
        const ok = (await sql<{ ok: boolean }>`select objects.outbox_ack_as_publisher(
          ${row.id}::uuid, ${row.lease_id}::uuid, 'pending', 'published') as ok`.execute(this.db)).rows[0]?.ok === true;
        if (ok) published += 1;
      } catch (e) {
        // Redis unavailable, or the acknowledgement refused → the row stays leased until
        // its lease lapses and is retried (at-least-once). Reported, never fatal.
        this.reportTick(e);
      }
    }
    return published;
  }
}
