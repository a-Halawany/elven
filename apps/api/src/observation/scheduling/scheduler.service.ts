/**
 * Scheduled collection — PHASE1_PLAN §0.4, §0.6, §12 (P1-M3); execution wired in the
 * scheduled-collection increment (SCHEDULED_COLLECTION.md).
 *
 * BullMQ Job Schedulers (`upsertJobScheduler`) drive polling. Four properties are
 * load-bearing and are asserted rather than assumed:
 *
 *  1. THE 60-SECOND FLOOR IS ENFORCED IN THREE PLACES — the source contract
 *     validator, this scheduler, and a CHECK constraint on
 *     observation.scheduler_entries. A contract that slipped past one still meets
 *     the others.
 *  2. QUEUE NAMES AND SCHEDULER IDS ARE SCOPE-PREFIXED (`obs:{tenant}:{domain}:…`),
 *     so a job cannot be enqueued into another tenant's queue by naming it. Those
 *     are the STORED, LOGICAL identities (migration 0022's sched_scoped_names
 *     constraint). The pinned BullMQ 6.0.6 refuses a queue name containing ':'
 *     ("Queue name cannot contain :"), so the Redis-facing identity is DERIVED from
 *     the logical one by `redisName()` — ':' → '.' — which is injective (neither a
 *     tenant id nor a domain id contains '.' or ':'), keeps tenant and domain in the
 *     name, and is never persisted.
 *  3. A JOB PAYLOAD CARRIES NO AUTHORITY. It holds scoped opaque identifiers, the
 *     exact contract version, a correlation id and the budgets — never a
 *     credential, never a token, never a delegated capability. The worker
 *     re-resolves and re-authorizes everything at execution time.
 *  4. A REPLAYED OR TAMPERED JOB FAILS CLOSED. The worker compares the payload's
 *     scope against the queue it arrived on and refuses on disagreement; the run
 *     itself re-verifies agent, contract version and lifecycle.
 *
 * WHO STARTS WORKERS. `CollectionWorkerService` registers the job handler at
 * application bootstrap when the scheduler is enabled; from then on every
 * `schedule()` — an activation, or a startup reconciliation — also ensures a worker
 * for that domain's queue. Without a registered handler, scheduling records the
 * intention in Redis and nothing executes; readiness says so (`worker_running`).
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
  /** Re-verified against the registry at execution; a drifted digest is refused. */
  codeDigest: string;
  connector: string;
  correlationId: string;
  budgets: Record<string, number>;
}

export type CollectionJobHandler = (payload: CollectionJobPayload, jobId: string) => Promise<void>;

/** The STORED, logical queue name (scope-prefixed with ':'; see migration 0022). */
export function queueNameFor(tenantId: string, domainId: string): string {
  return `obs:${tenantId}:${domainId}:collection`;
}

/** The STORED, logical scheduler id. */
export function schedulerIdFor(tenantId: string, domainId: string, sourceId: string): string {
  return `obs:${tenantId}:${domainId}:src:${sourceId}`;
}

/**
 * The Redis-facing identity derived from a logical one. BullMQ 6.0.6 refuses ':'
 * in a queue name; '.' is accepted, and no scope identifier contains either
 * character, so the mapping is injective and scope-preserving.
 */
export function redisName(logical: string): string {
  return logical.replaceAll(':', '.');
}

export interface ScheduleRuntime {
  /** The deployment executes schedule entries at all. */
  scheduler_enabled: boolean;
  /** A worker for this domain's queue runs in THIS process. */
  worker_running: boolean;
  /** The Redis job scheduler for this source, if one is materialized. */
  redis_scheduler: { present: boolean; every_seconds: number | null; next_at: string | null };
  /** The Redis-facing names, for the operator who looks at Redis. */
  redis_names: { queue: string; scheduler: string };
}

@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private readonly log = new Logger('observation.scheduler');
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private handler: CollectionJobHandler | null = null;

  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}

  get enabled(): boolean { return this.cfg['eye.scheduler.enabled']; }

  private connection(): { host: string; port: number; password: string } {
    return {
      host: this.cfg['eye.redis.host'],
      port: this.cfg['eye.redis.port'],
      password: this.cfg['eye.redis.password'],
    };
  }

  private queue(tenantId: string, domainId: string): Queue {
    const name = redisName(queueNameFor(tenantId, domainId));
    let q = this.queues.get(name);
    if (q === undefined) {
      q = new Queue(name, { connection: this.connection() });
      this.queues.set(name, q);
    }
    return q;
  }

  /**
   * The job handler every worker runs. Registered once by CollectionWorkerService
   * at bootstrap; a `schedule()` before registration records the schedule and
   * starts no worker (readiness reports `worker_running: false`).
   */
  registerHandler(handler: CollectionJobHandler): void {
    this.handler = handler;
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

    if (this.enabled) {
      await this.queue(tenantId, domainId).upsertJobScheduler(
        redisName(schedulerId),
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
      this.ensureWorker(tenantId, domainId);
    }
    return { schedulerId, queueName, cadenceSeconds: applied };
  }

  async unschedule(tenantId: string, domainId: string, sourceId: string): Promise<string> {
    const schedulerId = schedulerIdFor(tenantId, domainId, sourceId);
    if (this.enabled) {
      await this.queue(tenantId, domainId).removeJobScheduler(redisName(schedulerId)).catch(() => undefined);
    }
    return schedulerId;
  }

  /** Enqueue one immediate collection — the operator's "collect now". */
  async enqueueOnce(tenantId: string, domainId: string, payload: CollectionJobPayload): Promise<string | null> {
    if (!this.enabled) return null;
    const job = await this.queue(tenantId, domainId).add('collect', payload, {
      attempts: 1,
      removeOnComplete: 500,
      removeOnFail: 200,
    });
    this.ensureWorker(tenantId, domainId);
    return job.id ?? null;
  }

  /**
   * What the runtime actually holds for a source: whether the deployment executes
   * schedules, whether THIS process runs a worker for the domain, and whether Redis
   * holds a job scheduler for the source and when it fires next. Read live from
   * Redis, labelled as runtime — distinct from the stored schedule entry and from
   * the observed attempts.
   */
  async describe(tenantId: string, domainId: string, sourceId: string): Promise<ScheduleRuntime> {
    const queueName = queueNameFor(tenantId, domainId);
    const schedulerId = schedulerIdFor(tenantId, domainId, sourceId);
    const names = { queue: redisName(queueName), scheduler: redisName(schedulerId) };
    const base: ScheduleRuntime = {
      scheduler_enabled: this.enabled,
      worker_running: this.workers.has(names.queue),
      redis_scheduler: { present: false, every_seconds: null, next_at: null },
      redis_names: names,
    };
    if (!this.enabled) return base;
    try {
      const s = await this.queue(tenantId, domainId).getJobScheduler(names.scheduler);
      if (s === undefined || s === null) return base;
      const every = (s as { every?: number | string }).every;
      const next = (s as { next?: number }).next;
      return {
        ...base,
        redis_scheduler: {
          present: true,
          every_seconds: every === undefined ? null : Math.round(Number(every) / 1000),
          next_at: next === undefined || next === null ? null : new Date(Number(next)).toISOString(),
        },
      };
    } catch (e) {
      this.log.warn(`redis scheduler lookup failed: ${(e as Error).message.slice(0, 120)}`);
      return base;
    }
  }

  /**
   * TEST CONTROL ONLY: promote every delayed job on a domain's queue so the next
   * tick runs now instead of at the cadence boundary. Refused outside the test
   * runtime; a controlled test that uses it says so in its evidence.
   */
  async promoteDelayedForTests(tenantId: string, domainId: string): Promise<number> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('promoteDelayedForTests is available only in the test runtime');
    if (!this.enabled) return 0;
    const q = this.queue(tenantId, domainId);
    const before = await q.getDelayedCount();
    await q.promoteJobs();
    return before;
  }

  /** TEST CONTROL ONLY: the queue's job counts, to wait for it to settle between controlled ticks. */
  async queueCountsForTests(tenantId: string, domainId: string): Promise<{ active: number; waiting: number; delayed: number }> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('queueCountsForTests is available only in the test runtime');
    const c = await this.queue(tenantId, domainId).getJobCounts('active', 'waiting', 'delayed', 'prioritized');
    return { active: c['active'] ?? 0, waiting: (c['waiting'] ?? 0) + (c['prioritized'] ?? 0), delayed: c['delayed'] ?? 0 };
  }

  /** TEST CONTROL ONLY: how BullMQ ended a job — whether it was retried. */
  async jobStateForTests(tenantId: string, domainId: string, jobId: string): Promise<{ state: string; attemptsMade: number } | null> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('jobStateForTests is available only in the test runtime');
    const job = await this.queue(tenantId, domainId).getJob(jobId);
    if (job === undefined || job === null) return null;
    return { state: await job.getState(), attemptsMade: job.attemptsMade };
  }

  /** TEST/OPERATOR CLEANUP: remove the Redis scheduler and drain the queue for a domain. */
  async obliterateForTests(tenantId: string, domainId: string): Promise<void> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('obliterateForTests is available only in the test runtime');
    if (!this.enabled) return;
    const name = redisName(queueNameFor(tenantId, domainId));
    const w = this.workers.get(name);
    if (w !== undefined) { await w.close().catch(() => undefined); this.workers.delete(name); }
    const q = this.queue(tenantId, domainId);
    await q.obliterate({ force: true }).catch(() => undefined);
    await q.close().catch(() => undefined);
    this.queues.delete(name);
  }

  private ensureWorker(tenantId: string, domainId: string): void {
    if (this.handler !== null) this.startWorker(tenantId, domainId, this.handler);
  }

  /**
   * Start a worker for one domain's queue. The handler is supplied by the module
   * so this class never imports the acquisition path — the scheduler moves jobs,
   * it does not know what a run is.
   */
  startWorker(
    tenantId: string, domainId: string,
    handler: CollectionJobHandler,
  ): void {
    if (!this.enabled) return;
    const name = redisName(queueNameFor(tenantId, domainId));
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
    this.log.log(`collection worker started for ${name}`);
  }

  /** The domains this process runs a worker for (Redis-facing queue names). */
  runningWorkers(): string[] { return [...this.workers.keys()]; }

  async onModuleDestroy(): Promise<void> {
    for (const w of this.workers.values()) await w.close().catch(() => undefined);
    for (const q of this.queues.values()) await q.close().catch(() => undefined);
    this.workers.clear();
    this.queues.clear();
  }
}
