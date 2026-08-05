/**
 * Outbox publisher (ADR-P0-12, remediation R1a): publishes pending outbox rows
 * AFTER their transaction committed — to the BullMQ 'domain-events' queue
 * (Redis is transport only; the durable record is the outbox row + queue job
 * id). Interval poller; at-least-once with idempotent job ids (outbox row id).
 *
 * Runs on the SYSTEM pool: platform context is established through the audited
 * eye_set_system_context port (eye_system only) — never via raw GUCs.
 * Redis requires authentication (R7).
 */
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import { SYSTEM_DB } from '../shared/shared.module.js';
import type { Db } from '../shared/db.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private queue: Queue | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(SYSTEM_DB) private readonly db: Db,
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
    const rows = (await this.db.transaction().execute(async (tx) => {
      await sql`select public.eye_set_system_context('outbox publication sweep')`.execute(tx);
      return tx
        .selectFrom('objects.object_outbox')
        .selectAll()
        .where('status', '=', 'pending')
        .orderBy('created_at')
        .limit(50)
        .execute();
    })) as Array<{ id: string; event_type: string; payload: unknown; correlation_id: string; causation_id: string; tenant_id: string | null; domain_id: string | null }>;
    let published = 0;
    for (const row of rows) {
      try {
        await this.queue.add(row.event_type, {
          event_id: row.id,
          event_type: row.event_type,
          payload: row.payload,
          correlation_id: row.correlation_id,
          causation_id: row.causation_id,
          tenant_id: row.tenant_id,
          domain_id: row.domain_id,
        }, { jobId: row.id }); // idempotent: duplicate publishes dedupe on job id
        await this.db.transaction().execute(async (tx) => {
          await sql`select public.eye_set_system_context('outbox publication acknowledgement')`.execute(tx);
          await tx
            .updateTable('objects.object_outbox')
            .set({ status: 'published', published_at: new Date() })
            .where('id', '=', row.id)
            .execute();
        });
        published += 1;
      } catch {
        // Redis unavailable → rows stay pending; retried next tick (at-least-once).
      }
    }
    return published;
  }
}
