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
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { propagationQueueNameFor, redisName, subscriptionQueueNameFor } from '../../shared/queues.js';

export { redisName, propagationQueueNameFor, subscriptionQueueNameFor };

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

/** Phase 6: a room's briefing cadence — its own job kind on its own queue, never mixed with collection. */
export interface BriefingJobPayload {
  tenantId: string; domainId: string; roomId: string; agentId: string; correlationId: string;
}
export type BriefingJobHandler = (payload: BriefingJobPayload, jobId: string) => Promise<void>;
export function briefingQueueNameFor(tenantId: string, domainId: string): string { return `exec:${tenantId}:${domainId}:briefing`; }
export function briefingSchedulerIdFor(tenantId: string, domainId: string, roomId: string): string { return `exec:${tenantId}:${domainId}:room:${roomId}`; }

/** The STORED, logical queue name (scope-prefixed with ':'; see migration 0022). */
export function queueNameFor(tenantId: string, domainId: string): string {
  return `obs:${tenantId}:${domainId}:collection`;
}

/** The STORED, logical scheduler id. */
export function schedulerIdFor(tenantId: string, domainId: string, sourceId: string): string {
  return `obs:${tenantId}:${domainId}:src:${sourceId}`;
}

/*
 * The Redis-facing identity derived from a logical one (`redisName`, shared/queues.ts):
 * BullMQ 6.0.6 refuses ':' in a queue name; '.' is accepted, and no scope identifier
 * contains either character, so the mapping is injective and scope-preserving.
 */
/** How long a readiness lookup waits for Redis before answering UNKNOWN. */
const LOOKUP_TIMEOUT_MS = 3_000;

/**
 * CP-6 B1: the propagation consumer's job — the published outbox row, verbatim (the job id
 * IS the outbox row id). The payload carries no authority: the worker re-resolves the case
 * and re-authorizes the walk under the domain's registered propagation agent.
 */
export interface PropagationJobPayload {
  event_id: string; event_type: string; payload: { case_id?: string; [k: string]: unknown };
  correlation_id: string; causation_id: string; tenant_id: string | null; domain_id: string | null;
  /** 0064: the outbox row's declared partition and ordinal (commit order) and its schema version, when the publisher routed it. */
  partition_key?: string; partition_seq?: number; schema_version?: string;
}
export type PropagationJobHandler = (payload: PropagationJobPayload, jobId: string, attemptsMade: number) => Promise<void>;
/**
 * CP-6 B6 (0063): a GraphChanged / MemoryCorrected delivery — the published outbox row, verbatim. The publisher's LIVE
 * job names no subscription (the receive port fans it out to every active subscription served from at or before the
 * row's sequence); a RE-DRIVE (a reconciliation, a registration, a resume, a replay — 0064) names the subscriptions it
 * is for in `only`, and the receive port touches no other. The job id is the outbox row id: a re-drive of an event a
 * live job still holds is left to that job.
 */
export interface SubscriptionJobPayload extends PropagationJobPayload {
  only?: string[] | null;
}
export type SubscriptionJobHandler = (payload: SubscriptionJobPayload, jobId: string, attemptsMade: number) => Promise<void>;
/** The options every propagation job is added with — by the publisher's routing and by a re-drive alike. */
export const PROPAGATION_JOB_OPTS = Object.freeze({
  attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 500,
});

export interface ScheduleRuntime {
  /** The deployment executes schedule entries at all. */
  scheduler_enabled: boolean;
  /** A worker for this domain's queue runs in THIS process. */
  worker_running: boolean;
  /**
   * The Redis job scheduler for this source: PRESENT, verified ABSENT, or UNKNOWN when
   * the lookup itself failed or timed out — a failed lookup is not evidence of absence.
   */
  redis_scheduler: { state: 'present' | 'absent' | 'unknown' | 'disabled'; present: boolean; every_seconds: number | null; next_at: string | null; error: string | null };
  /** The Redis-facing names, for the operator who looks at Redis. */
  redis_names: { queue: string; scheduler: string };
}

@Injectable()
export class SchedulerService implements OnModuleDestroy {
  private readonly log = new Logger('observation.scheduler');
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private handler: CollectionJobHandler | null = null;
  private briefingHandler: BriefingJobHandler | null = null;
  private propagationHandler: PropagationJobHandler | null = null;
  private subscriptionHandler: SubscriptionJobHandler | null = null;

  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}

  get enabled(): boolean { return this.cfg['eye.scheduler.enabled']; }

  private connection(): { host: string; port: number; password: string } {
    return {
      host: this.cfg['eye.redis.host'],
      port: this.cfg['eye.redis.port'],
      password: this.cfg['eye.redis.password'],
    };
  }

  private queue(tenantId: string, domainId: string): Queue { return this.queueNamed(redisName(queueNameFor(tenantId, domainId))); }
  private queueNamed(name: string): Queue {
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

  // ───────────────────────── Phase 6: room briefing cadence ─────────────────────────
  registerBriefingHandler(handler: BriefingJobHandler): void { this.briefingHandler = handler; }

  async scheduleBriefing(tenantId: string, domainId: string, payload: BriefingJobPayload, cadenceSeconds: number): Promise<{ schedulerId: string; queueName: string; cadenceSeconds: number }> {
    const applied = Math.max(cadenceSeconds, this.cfg['eye.scheduler.min_interval_seconds']);
    const schedulerId = briefingSchedulerIdFor(tenantId, domainId, payload.roomId);
    const queueName = briefingQueueNameFor(tenantId, domainId);
    if (this.enabled) {
      await this.queueNamed(redisName(queueName)).upsertJobScheduler(redisName(schedulerId), { every: applied * 1000 },
        { name: 'briefing', data: payload, opts: { attempts: 1, removeOnComplete: 200, removeOnFail: 100 } });
      this.ensureBriefingWorker(tenantId, domainId);
    }
    return { schedulerId, queueName, cadenceSeconds: applied };
  }

  async unscheduleBriefing(tenantId: string, domainId: string, roomId: string): Promise<string> {
    const schedulerId = briefingSchedulerIdFor(tenantId, domainId, roomId);
    if (this.enabled) await this.queueNamed(redisName(briefingQueueNameFor(tenantId, domainId))).removeJobScheduler(redisName(schedulerId)).catch(() => undefined);
    return schedulerId;
  }

  async enqueueBriefingOnce(tenantId: string, domainId: string, payload: BriefingJobPayload): Promise<string | null> {
    if (!this.enabled) return null;
    const job = await this.queueNamed(redisName(briefingQueueNameFor(tenantId, domainId))).add('briefing', payload, { attempts: 1, removeOnComplete: 200, removeOnFail: 100 });
    this.ensureBriefingWorker(tenantId, domainId);
    return job.id ?? null;
  }

  private ensureBriefingWorker(tenantId: string, domainId: string): void {
    if (this.briefingHandler !== null) this.startBriefingWorker(tenantId, domainId, this.briefingHandler);
  }

  startBriefingWorker(tenantId: string, domainId: string, handler: BriefingJobHandler): void {
    if (!this.enabled) return;
    const name = redisName(briefingQueueNameFor(tenantId, domainId));
    if (this.workers.has(name)) return;
    const worker = new Worker(name, async (job: Job<BriefingJobPayload>) => {
      const payload = job.data;
      if (payload.tenantId !== tenantId || payload.domainId !== domainId) throw new Error('job payload scope does not match the queue it was delivered on');
      await handler(payload, job.id ?? 'unknown');
    }, { connection: this.connection(), concurrency: 1 });
    worker.on('failed', (job, err) => { this.log.warn(`briefing job ${job?.id ?? '?'} failed: ${err.message.slice(0, 200)}`); });
    this.workers.set(name, worker);
    this.log.log(`briefing worker started for ${name}`);
  }

  /** Test-only: promote the delayed briefing ticks of a domain. */
  async promoteDelayedBriefingsForTests(tenantId: string, domainId: string): Promise<number> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('promoteDelayedBriefingsForTests is available only in the test runtime');
    const q = this.queueNamed(redisName(briefingQueueNameFor(tenantId, domainId)));
    const delayed = await q.getDelayed();
    for (const j of delayed) await j.promote().catch(() => undefined);
    return delayed.length;
  }
  async obliterateBriefingsForTests(tenantId: string, domainId: string): Promise<void> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('obliterateBriefingsForTests is available only in the test runtime');
    await this.queueNamed(redisName(briefingQueueNameFor(tenantId, domainId))).obliterate({ force: true }).catch(() => undefined);
  }

  // ───────────────────────── CP-6 B1: the propagation consumer ─────────────────────────
  registerPropagationHandler(handler: PropagationJobHandler): void { this.propagationHandler = handler; }

  /**
   * A worker for one domain's propagation queue: one job at a time, the payload's scope
   * compared against the queue it arrived on before anything else looks at it (rule 4). A
   * disagreement is UNRECOVERABLE — a tampered or misrouted job is not retried.
   */
  startPropagationWorker(tenantId: string, domainId: string): void {
    if (!this.enabled || this.propagationHandler === null) return;
    const handler = this.propagationHandler;
    const name = redisName(propagationQueueNameFor(tenantId, domainId));
    if (this.workers.has(name)) return;
    const worker = new Worker(name, async (job: Job<PropagationJobPayload>) => {
      const payload = job.data;
      if (payload.tenant_id !== tenantId || payload.domain_id !== domainId) {
        throw new UnrecoverableError('job payload scope does not match the queue it was delivered on');
      }
      await handler(payload, job.id ?? 'unknown', job.attemptsMade);
    }, { connection: this.connection(), concurrency: 1 });
    worker.on('failed', (job, err) => { this.log.warn(`propagation job ${job?.id ?? '?'} failed: ${err.message.slice(0, 200)}`); });
    this.workers.set(name, worker);
    this.log.log(`propagation worker started for ${name}`);
  }

  /**
   * Re-drive one event (a startup reconciliation, a registration, a test). BullMQ ignores
   * an add whose job id exists in ANY state, so a completed or failed job of the same id is
   * removed first; a waiting, delayed or active one is left to run. Durability rests on
   * graph.propagation_attempts, never on Redis state.
   */
  async enqueuePropagation(tenantId: string, domainId: string, data: PropagationJobPayload): Promise<{ jobId: string | null; added: boolean; inFlight: string | null }> {
    if (!this.enabled) return { jobId: null, added: false, inFlight: null };
    const q = this.queueNamed(redisName(propagationQueueNameFor(tenantId, domainId)));
    const existing = await q.getJob(data.event_id);
    if (existing !== undefined && existing !== null) {
      const state = await existing.getState();
      // A job still waiting, delayed or ACTIVE belongs to a live worker: the re-drive is a no-op (0062).
      if (state === 'completed' || state === 'failed') await existing.remove();
      else return { jobId: existing.id ?? null, added: false, inFlight: state };
    }
    const job = await q.add('propagate', data, { ...PROPAGATION_JOB_OPTS, jobId: data.event_id });
    this.startPropagationWorker(tenantId, domainId);
    return { jobId: job.id ?? null, added: true, inFlight: null };
  }

  /**
   * TEST CONTROL ONLY: abandon a domain's propagation worker the way a killed process does — the
   * connection is closed without waiting for the active job, nothing is acknowledged, nothing is
   * recorded. What the interrupted handler had committed stays committed; what it had not, is not.
   */
  async abandonPropagationWorkerForTests(tenantId: string, domainId: string): Promise<boolean> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('abandonPropagationWorkerForTests is available only in the test runtime');
    const name = redisName(propagationQueueNameFor(tenantId, domainId));
    const w = this.workers.get(name);
    if (w === undefined) return false;
    await w.close(true).catch(() => undefined);
    this.workers.delete(name);
    return true;
  }

  /** TEST CONTROL ONLY: the propagation queue's counts, to wait for it to settle. */
  async propagationQueueCountsForTests(tenantId: string, domainId: string): Promise<{ active: number; waiting: number; delayed: number; completed: number; failed: number }> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('propagationQueueCountsForTests is available only in the test runtime');
    const c = await this.queueNamed(redisName(propagationQueueNameFor(tenantId, domainId))).getJobCounts('active', 'waiting', 'delayed', 'prioritized', 'completed', 'failed');
    return { active: c['active'] ?? 0, waiting: (c['waiting'] ?? 0) + (c['prioritized'] ?? 0), delayed: c['delayed'] ?? 0, completed: c['completed'] ?? 0, failed: c['failed'] ?? 0 };
  }
  /** TEST CONTROL ONLY: how BullMQ ended a propagation job — whether it was retried. */
  async propagationJobStateForTests(tenantId: string, domainId: string, jobId: string): Promise<{ state: string; attemptsMade: number; failedReason: string | null } | null> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('propagationJobStateForTests is available only in the test runtime');
    const job = await this.queueNamed(redisName(propagationQueueNameFor(tenantId, domainId))).getJob(jobId);
    if (job === undefined || job === null) return null;
    return { state: await job.getState(), attemptsMade: job.attemptsMade, failedReason: job.failedReason ?? null };
  }
  /** TEST CONTROL ONLY: add a job onto a domain's propagation queue as the publisher would (scope fail-closed cases). */
  async addPropagationJobForTests(tenantId: string, domainId: string, data: PropagationJobPayload): Promise<string | null> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('addPropagationJobForTests is available only in the test runtime');
    const job = await this.queueNamed(redisName(propagationQueueNameFor(tenantId, domainId))).add('propagate', data, { ...PROPAGATION_JOB_OPTS, jobId: data.event_id });
    return job.id ?? null;
  }
  async obliteratePropagationsForTests(tenantId: string, domainId: string): Promise<void> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('obliteratePropagationsForTests is available only in the test runtime');
    const name = redisName(propagationQueueNameFor(tenantId, domainId));
    const w = this.workers.get(name);
    if (w !== undefined) { await w.close().catch(() => undefined); this.workers.delete(name); }
    const q = this.queueNamed(name);
    await q.obliterate({ force: true }).catch(() => undefined);
    await q.close().catch(() => undefined);
    this.queues.delete(name);
  }

  // ───────────────────────── CP-6 B6: the subscription dispatcher ─────────────────────────
  registerSubscriptionHandler(handler: SubscriptionJobHandler): void { this.subscriptionHandler = handler; }

  /** A worker for one domain's subscription queue: one job at a time, the payload's scope checked against the queue. */
  startSubscriptionWorker(tenantId: string, domainId: string): void {
    if (!this.enabled || this.subscriptionHandler === null) return;
    const handler = this.subscriptionHandler;
    const name = redisName(subscriptionQueueNameFor(tenantId, domainId));
    if (this.workers.has(name)) return;
    const worker = new Worker(name, async (job: Job<SubscriptionJobPayload>) => {
      const payload = job.data;
      if (payload.tenant_id !== tenantId || payload.domain_id !== domainId) {
        throw new UnrecoverableError('job payload scope does not match the queue it was delivered on');
      }
      await handler(payload, job.id ?? 'unknown', job.attemptsMade);
    }, { connection: this.connection(), concurrency: 1 });
    worker.on('failed', (job, err) => { this.log.warn(`subscription delivery ${job?.id ?? '?'} failed: ${err.message.slice(0, 200)}`); });
    this.workers.set(name, worker);
    this.log.log(`subscription worker started for ${name}`);
  }

  /** Re-drive one event (a reconciliation, a registration, a replay): a job of the same id still waiting, delayed or active is left to its worker. */
  async enqueueSubscriptionDelivery(tenantId: string, domainId: string, data: SubscriptionJobPayload): Promise<{ jobId: string | null; added: boolean; inFlight: string | null }> {
    if (!this.enabled) return { jobId: null, added: false, inFlight: null };
    const q = this.queueNamed(redisName(subscriptionQueueNameFor(tenantId, domainId)));
    const jobId = data.event_id;
    const existing = await q.getJob(jobId);
    if (existing !== undefined && existing !== null) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') await existing.remove();
      else return { jobId: existing.id ?? null, added: false, inFlight: state };
    }
    const job = await q.add('deliver', data, { ...PROPAGATION_JOB_OPTS, jobId });
    this.startSubscriptionWorker(tenantId, domainId);
    return { jobId: job.id ?? null, added: true, inFlight: null };
  }

  async subscriptionQueueCountsForTests(tenantId: string, domainId: string): Promise<{ active: number; waiting: number; delayed: number; completed: number; failed: number }> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('subscriptionQueueCountsForTests is available only in the test runtime');
    const c = await this.queueNamed(redisName(subscriptionQueueNameFor(tenantId, domainId))).getJobCounts('active', 'waiting', 'delayed', 'prioritized', 'completed', 'failed');
    return { active: c['active'] ?? 0, waiting: (c['waiting'] ?? 0) + (c['prioritized'] ?? 0), delayed: c['delayed'] ?? 0, completed: c['completed'] ?? 0, failed: c['failed'] ?? 0 };
  }
  async subscriptionJobStateForTests(tenantId: string, domainId: string, jobId: string): Promise<{ state: string; attemptsMade: number; failedReason: string | null } | null> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('subscriptionJobStateForTests is available only in the test runtime');
    const job = await this.queueNamed(redisName(subscriptionQueueNameFor(tenantId, domainId))).getJob(jobId);
    if (job === undefined || job === null) return null;
    return { state: await job.getState(), attemptsMade: job.attemptsMade, failedReason: job.failedReason ?? null };
  }
  async addSubscriptionJobForTests(tenantId: string, domainId: string, data: SubscriptionJobPayload): Promise<string | null> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('addSubscriptionJobForTests is available only in the test runtime');
    const job = await this.queueNamed(redisName(subscriptionQueueNameFor(tenantId, domainId))).add('deliver', data, { ...PROPAGATION_JOB_OPTS, jobId: data.event_id });
    return job.id ?? null;
  }
  async abandonSubscriptionWorkerForTests(tenantId: string, domainId: string): Promise<boolean> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('abandonSubscriptionWorkerForTests is available only in the test runtime');
    const name = redisName(subscriptionQueueNameFor(tenantId, domainId));
    const w = this.workers.get(name);
    if (w === undefined) return false;
    await w.close(true).catch(() => undefined);
    this.workers.delete(name);
    return true;
  }
  async obliterateSubscriptionsForTests(tenantId: string, domainId: string): Promise<void> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('obliterateSubscriptionsForTests is available only in the test runtime');
    const name = redisName(subscriptionQueueNameFor(tenantId, domainId));
    const w = this.workers.get(name);
    if (w !== undefined) { await w.close().catch(() => undefined); this.workers.delete(name); }
    const q = this.queueNamed(name);
    await q.obliterate({ force: true }).catch(() => undefined);
    await q.close().catch(() => undefined);
    this.queues.delete(name);
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
      redis_scheduler: { state: this.enabled ? 'unknown' : 'disabled', present: false, every_seconds: null, next_at: null, error: null },
      redis_names: names,
    };
    if (!this.enabled) return base;
    try {
      const lookup = this.queue(tenantId, domainId).getJobScheduler(names.scheduler);
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`redis lookup timed out after ${LOOKUP_TIMEOUT_MS} ms`)), LOOKUP_TIMEOUT_MS).unref());
      const s = await Promise.race([lookup, timeout]);
      if (s === undefined || s === null) return { ...base, redis_scheduler: { ...base.redis_scheduler, state: 'absent' } };
      const every = (s as { every?: number | string }).every;
      const next = (s as { next?: number }).next;
      return {
        ...base,
        redis_scheduler: {
          state: 'present', present: true, error: null,
          every_seconds: every === undefined ? null : Math.round(Number(every) / 1000),
          next_at: next === undefined || next === null ? null : new Date(Number(next)).toISOString(),
        },
      };
    } catch (e) {
      const message = (e as Error).message.slice(0, 160);
      this.log.warn(`redis scheduler lookup failed: ${message}`);
      return { ...base, redis_scheduler: { ...base.redis_scheduler, state: 'unknown', error: message } };
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
