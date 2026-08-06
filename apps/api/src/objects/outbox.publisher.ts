/**
 * Outbox publisher (ADR-P0-12; Gate-2 §1/§5): publishes pending outbox rows
 * AFTER their transaction committed — to the BullMQ 'domain-events' queue
 * (Redis is transport only; the durable record is the outbox row + queue job
 * id). Interval poller; at-least-once with idempotent job ids (outbox row id).
 *
 * Runs on the dedicated PUBLISHER authority (eye_publisher), whose entire
 * surface is two ports: objects.outbox_claim (read pending) and
 * objects.outbox_ack (compare-and-set on the permitted status transitions).
 * It cannot rewrite an event, and it cannot mark anything published outside a
 * pending → published/failed transition — so publication can neither forge nor
 * suppress delivery. Event identity and content are immutable by trigger.
 */
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import { PUBLISHER_DB } from '../shared/shared.module.js';
import type { Db } from '../shared/db.js';

interface PendingRow {
  id: string;
  event_type: string;
  payload: unknown;
  correlation_id: string;
  causation_id: string;
  tenant_id: string | null;
  domain_id: string | null;
}

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private queue: Queue | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PUBLISHER_DB) private readonly db: Db,
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
  ) {}

  onModuleInit(): void {
    this.queue = new Queue('domain-events', {
      connection: {
        host: this.cfg['eye.redis.host'],
        port: this.cfg['eye.redis.port'],
        password: this.cfg['eye.redis.password'],
      },
    });
    this.timer = setInterval(() => {
      void this.publishPending();
    }, 1000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    await this.queue?.close();
  }

  async publishPending(): Promise<number> {
    if (this.queue === null) return 0;
    const rows = (
      await this.db.transaction().execute(async (tx) => {
        await sql`select ctx.issue_system('outbox publication sweep')`.execute(tx);
        return sql<PendingRow>`select * from objects.outbox_claim(50)`.execute(tx);
      })
    ).rows;

    let published = 0;
    for (const row of rows) {
      try {
        await this.queue.add(
          row.event_type,
          {
            event_id: row.id,
            event_type: row.event_type,
            payload: row.payload,
            correlation_id: row.correlation_id,
            causation_id: row.causation_id,
            tenant_id: row.tenant_id,
            domain_id: row.domain_id,
          },
          { jobId: row.id }, // idempotent: duplicate publishes dedupe on job id
        );
        // Narrow compare-and-set acknowledgement — the only mutation available.
        const ok = await this.db.transaction().execute(async (tx) => {
          await sql`select ctx.issue_system('outbox publication acknowledgement')`.execute(tx);
          return (
            await sql<{ ok: boolean }>`select objects.outbox_ack(${row.id}::uuid, 'pending', 'published') as ok`.execute(tx)
          ).rows[0]?.ok === true;
        });
        if (ok) published += 1;
      } catch {
        // Redis unavailable → rows stay pending; retried next tick (at-least-once).
      }
    }
    return published;
  }
}
