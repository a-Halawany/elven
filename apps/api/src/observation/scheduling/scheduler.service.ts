/**
 * Scheduled collection — PHASE1_PLAN §0.4, §0.6, §12 (P1-M3).
 *
 * BullMQ Job Schedulers (`upsertJobScheduler`) drive polling. Four properties are
 * load-bearing and are asserted rather than assumed:
 *
 *  1. THE 60-SECOND FLOOR IS ENFORCED IN THREE PLACES — the source contract
 *     validator, this scheduler, and a CHECK constraint on
 *     observation.scheduler_entries. A contract that slipped past one still meets
 *     the others.
 *  2. QUEUE NAMES AND SCHEDULER IDS ARE SCOPE-PREFIXED (`obs:{tenant}:{domain}:…`),
 *     so a job cannot be enqueued into another tenant's queue by naming it.
 *  3. A JOB PAYLOAD CARRIES NO AUTHORITY. It holds scoped opaque identifiers, the
 *     exact contract version, a correlation id and the budgets — never a
 *     credential, never a token, never a delegated capability. The worker
 *     re-resolves and re-authorizes everything at execution time.
 *  4. A REPLAYED OR TAMPERED JOB FAILS CLOSED. The worker compares the payload's
 *     scope against the contract's registered scope and refuses on disagreement.
 */
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, type Job } from 'bullmq';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';

export interface CollectionJobPayload {
  /** Scope triple — compared against the CONTRACT's registered scope at execution. */
  tenantId: string;
  domainId: string;
  sourceId: string;
  /** The EXACT contract version this job was scheduled against. */
  contractVersion: number;
  agentId: string;
  agentVersion: string;
  connector: string;
  correlationId: string;
  budgets: Record<string, number>;
}

export function queueNameFor(tenantId: string, domainId: string): string {
  return `obs:${tenantId}:${domainId}:collection`;
}

export function schedulerIdFor(tenantId: string, domainId: string, sourceId: string): string {
  return `obs:${tenantId}:${domainId}:src:${sourceId}`;
}

@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private readonly log = new Logger('observation.scheduler');
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();

  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}

  private connection(): { host: string; port: number; password: string } {
    return {
      host: this.cfg['eye.redis.host'],
      port: this.cfg['eye.redis.port'],
      password: this.cfg['eye.redis.password'],
    };
  }

  private queue(tenantId: string, domainId: string): Queue {
    const name = queueNameFor(tenantId, domainId);
    let q = this.queues.get(name);
    if (q === undefined) {
      q = new Queue(name, { connection: this.connection() });
      this.queues.set(name, q);
    }
    return q;
  }

  /**
   * Schedule (or reschedule) a source. Returns the scheduler id and the cadence
   * that was ACTUALLY applied, which may be the floor rather than the request —
   * and the caller records the applied value, not the requested one.
   */
  async schedule(
    tenantId: string, domainId: string, payload: CollectionJobPayload,
    cadenceSeconds: number, jitterSeconds: number,
  ): Promise<{ schedulerId: string; queueName: string; cadenceSeconds: number }> {
    const floor = this.cfg['eye.scheduler.min_interval_seconds'];
    const applied = Math.max(cadenceSeconds, floor);
    const schedulerId = schedulerIdFor(tenantId, domainId, payload.sourceId);
    const queueName = queueNameFor(tenantId, domainId);

    if (this.cfg['eye.scheduler.enabled']) {
      await this.queue(tenantId, domainId).upsertJobScheduler(
        schedulerId,
        { every: applied * 1000 },
        {
          name: 'collect',
          data: payload,
          opts: {
            // Retries are bounded and back off; a source that is down must not
            // become a retry storm against the publisher.
            attempts: 3,
            backoff: { type: 'exponential', delay: Math.max(1000, jitterSeconds * 1000) },
            removeOnComplete: 500,
            removeOnFail: 200,
          },
        },
      );
    }
    return { schedulerId, queueName, cadenceSeconds: applied };
  }

  async unschedule(tenantId: string, domainId: string, sourceId: string): Promise<string> {
    const schedulerId = schedulerIdFor(tenantId, domainId, sourceId);
    if (this.cfg['eye.scheduler.enabled']) {
      await this.queue(tenantId, domainId).removeJobScheduler(schedulerId).catch(() => undefined);
    }
    return schedulerId;
  }

  /** Enqueue one immediate collection — the operator's "collect now". */
  async enqueueOnce(tenantId: string, domainId: string, payload: CollectionJobPayload): Promise<string | null> {
    if (!this.cfg['eye.scheduler.enabled']) return null;
    const job = await this.queue(tenantId, domainId).add('collect', payload, {
      attempts: 1,
      removeOnComplete: 500,
      removeOnFail: 200,
    });
    return job.id ?? null;
  }

  /**
   * Start a worker for one domain's queue. The handler is supplied by the module
   * so this class never imports the acquisition path — the scheduler moves jobs,
   * it does not know what a run is.
   */
  startWorker(
    tenantId: string, domainId: string,
    handler: (payload: CollectionJobPayload, jobId: string) => Promise<void>,
  ): void {
    if (!this.cfg['eye.scheduler.enabled']) return;
    const name = queueNameFor(tenantId, domainId);
    if (this.workers.has(name)) return;
    const worker = new Worker(
      name,
      async (job: Job<CollectionJobPayload>) => {
        const payload = job.data;
        // A job whose payload scope disagrees with the queue it arrived on is
        // rejected before anything else looks at it. The contract check at
        // execution time is the second, authoritative test.
        if (payload.tenantId !== tenantId || payload.domainId !== domainId) {
          throw new Error('job payload scope does not match the queue it was delivered on');
        }
        await handler(payload, job.id ?? 'unknown');
      },
      {
        connection: this.connection(),
        concurrency: this.cfg['eye.connector.per_source_concurrency'],
        // A global cap as well as a per-source one, so many sources cannot
        // collectively saturate egress.
        limiter: { max: this.cfg['eye.connector.global_concurrency'], duration: 1000 },
      },
    );
    worker.on('failed', (job, err) => {
      this.log.warn(`collection job ${job?.id ?? '?'} failed: ${err.message.slice(0, 200)}`);
    });
    this.workers.set(name, worker);
  }

  async onModuleDestroy(): Promise<void> {
    for (const w of this.workers.values()) await w.close().catch(() => undefined);
    for (const q of this.queues.values()) await q.close().catch(() => undefined);
  }
}
