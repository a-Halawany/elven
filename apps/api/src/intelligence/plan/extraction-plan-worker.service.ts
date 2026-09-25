/**
 * THE EXTRACTION PLAN WORKER — CP-6 B24 (migration 0086 §P): the selected transformation plan EXECUTES.
 *
 * Since 0083 the observations subscriber selects the plan for every recorded evidence version; since 0086 it also queues ONE pending
 * execution per selected method (intelligence.plan_executions, UNIQUE per method version and evidence version) in the delivery's own
 * transaction. This worker is what runs them — and it runs them as the domain's EXTRACTION AGENT, never as the subscriber:
 *
 *  1. SERVES every domain with an active extraction agent: a repeatable DRAIN on the domain's own queue (intel:{t}:{d}:plan, one job at a
 *     time), scheduled at registration and by the STARTUP RECONCILE (intelligence.plan_executions_to_reconcile, the shape of the
 *     briefing planner's 0048 port). BullMQ runs a scheduler's first job at once, so a registration drains what was waiting.
 *  2. CLAIMS the domain's executions under the scheduler's bounded machine capability (intelligence.claim_plan_executions, FOR UPDATE
 *     SKIP LOCKED — two workers never hold one execution; a stale running lease and a failed row under its attempt budget are taken again).
 *  3. RUNS each one under the agent's OWN SESSION (ExtractionAgentSessionService) through the SAME governed path an operator's /extract
 *     takes — ExtractionOrchestrator.run, for exactly that evidence, at the method version the plan named, with newAttempt = false, so
 *     0023's extraction identity makes a repeat free (a re-run of an execution whose outcome was lost admits nothing twice).
 *  4. RECORDS the outcome on the execution row (intelligence.record_plan_execution): done with the run id and the admitted claims;
 *     refused with the governance answer (the grant revoked, the policy, the method's state, the evidence unreadable); failed with the
 *     fault (taken again while under the budget). The session is extended per recorded execution, re-verifying the grant.
 *
 * NO AGENT, NO RUN — AND NOTHING DROPPED. A domain with no active agent has no drain: its executions stay pending, visible through the
 * status read with the reason, until a registration serves them. A REVOKED agent's drain is left in place (the grant, not the queue, is
 * the authority — the propagation precedent): its next job claims, is refused by the session port, RECORDS the refusal on each execution
 * and removes its own schedule; the next registration re-queues the refused executions (0086 §P.3).
 *
 * FAILURE IS RECORDED, NEVER FATAL: no handler path throws into BullMQ except a job whose scope disagrees with its queue (unrecoverable).
 */
import { HttpException, Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import { sql } from 'kysely';
import type { Envelope } from '@eye/contracts';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import { redisName } from '../../shared/queues.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { asObservationRefusal } from '../../observation/observation-errors.js';
import { ExtractionOrchestrator } from '../extraction/orchestrator.service.js';
import { ExtractionAgentSessionService, ExtractionGrantRefused } from './extraction-agent-session.service.js';
import { planQueueNameFor, planSchedulerIdFor, type PlanDrainJobPayload } from './plan-executor.js';

/** A claimed execution, as the claim port answers it. */
interface Claimed { execution_id: string; selection_id: string; method_id: string; method_key: string; method_version: number; evd_object_id: string; evd_version: number; attempts: number; correlation_id: string }
type Outcome = { state: 'done' | 'refused' | 'failed'; runId: string | null; error: string | null; details: Record<string, unknown> };

export interface PlanReconcileReport { at: string; reason: string; domains: Array<{ tenantId: string; domainId: string; agentId: string; claimable: number; everySeconds: number }>; failures: string[] }
export interface DrainReport { at: string; tenantId: string; domainId: string; agentId: string; jobId: string; claimed: number; done: number; refused: number; failed: number; note: string | null }

@Injectable()
export class ExtractionPlanWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('intelligence.plan-worker');
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private lastReconcile: PlanReconcileReport | null = null;
  private lastFailure: { at: string; where: string; message: string } | null = null;
  /** Every drain this process ran, newest first (bounded) — for operators and tests. */
  private readonly recent: DrainReport[] = [];

  constructor(
    @Inject(COMMIT_DB) private readonly commitDb: Db,
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    private readonly orchestrator: ExtractionOrchestrator,
    private readonly sessions: ExtractionAgentSessionService,
  ) {}

  get enabled(): boolean { return this.cfg['eye.scheduler.enabled']; }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) {
      this.log.log('scheduler disabled: no plan worker started; selected plans stay pending and visible');
      return;
    }
    try {
      const r = await this.reconcile('startup reconciliation');
      this.log.log(`serving ${r.domains.length} domain(s) with an extraction agent; ${r.domains.reduce((n, d) => n + d.claimable, 0)} execution(s) claimable`);
    } catch (e) {
      // A failed reconciliation must not take the API down; it is reported and retried on the next start.
      this.note('startup reconciliation', e);
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const w of this.workers.values()) await w.close().catch(() => undefined);
    for (const q of this.queues.values()) await q.close().catch(() => undefined);
    this.workers.clear(); this.queues.clear();
  }

  lastReconciliation(): PlanReconcileReport | null { return this.lastReconcile; }
  lastFailureSeen(): { at: string; where: string; message: string } | null { return this.lastFailure; }
  recentDrains(tenantId?: string, domainId?: string): DrainReport[] {
    return tenantId === undefined ? [...this.recent] : this.recent.filter((r) => r.tenantId === tenantId && r.domainId === domainId);
  }
  runtime(tenantId: string, domainId: string) {
    const name = redisName(planQueueNameFor(tenantId, domainId));
    return { scheduler_enabled: this.enabled, worker_running: this.workers.has(name), redis_queue: name,
             last_reconciliation: this.lastReconcile === null ? null : { ...this.lastReconcile, domains: this.lastReconcile.domains.filter((d) => d.tenantId === tenantId && d.domainId === domainId),
                                                                        failures: this.lastReconcile.failures.filter((f) => f.startsWith(`${tenantId}/${domainId}:`)) },
             recent_drains: this.recentDrains(tenantId, domainId).slice(0, 10).map(({ tenantId: _t, domainId: _d, ...rest }) => rest) };
  }

  private note(where: string, e: unknown): void {
    const message = (e as Error)?.message ?? String(e);
    this.lastFailure = { at: new Date().toISOString(), where, message: message.slice(0, 300) };
    this.log.error(`${where} failed: ${message.slice(0, 200)}`);
  }

  private connection(): { host: string; port: number; password: string } {
    return { host: this.cfg['eye.redis.host'], port: this.cfg['eye.redis.port'], password: this.cfg['eye.redis.password'] };
  }
  private queue(tenantId: string, domainId: string): Queue {
    const name = redisName(planQueueNameFor(tenantId, domainId));
    let q = this.queues.get(name);
    if (q === undefined) { q = new Queue(name, { connection: this.connection() }); this.queues.set(name, q); }
    return q;
  }

  // ───────────────────────── serving ─────────────────────────

  /** Serve every domain with an active extraction agent: its repeatable drain (whose first job runs at once) and a worker. Idempotent. */
  async reconcile(reason: string): Promise<PlanReconcileReport> {
    // Under the schedule capability (no tenant) every RLS table hides its rows: the served domains are read by the port that asserts it (0086 §P.6).
    const rows = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${reason}, 60)`.execute(tx);
      return (await sql<{ tenant_id: string; domain_id: string; agent_id: string; budgets: { drain_every_seconds?: number }; claimable: number }>`
        select tenant_id::text, domain_id::text, agent_id::text, budgets, claimable from intelligence.plan_executions_to_reconcile()`.execute(tx)).rows;
    });
    const report: PlanReconcileReport = { at: new Date().toISOString(), reason, domains: [], failures: [] };
    for (const r of rows) {
      try {
        const every = await this.schedule(r.tenant_id, r.domain_id, r.agent_id, Number(r.budgets.drain_every_seconds ?? 60));
        report.domains.push({ tenantId: r.tenant_id, domainId: r.domain_id, agentId: r.agent_id, claimable: Number(r.claimable), everySeconds: every });
      } catch (e) { report.failures.push(`${r.tenant_id}/${r.domain_id}: ${(e as Error).message.slice(0, 200)}`); }
    }
    this.lastReconcile = report;
    return report;
  }

  /** The domain's repeatable drain for this agent (replacing any earlier one — one active agent per domain), and a worker. Returns the applied cadence. */
  async schedule(tenantId: string, domainId: string, agentId: string, everySeconds: number): Promise<number> {
    const applied = Math.max(everySeconds, this.cfg['eye.scheduler.min_interval_seconds']);
    if (!this.enabled) return applied;
    const payload: PlanDrainJobPayload = { tenantId, domainId, agentId, correlationId: newId() };
    await this.queue(tenantId, domainId).upsertJobScheduler(redisName(planSchedulerIdFor(tenantId, domainId)), { every: applied * 1000 },
      { name: 'drain', data: payload, opts: { attempts: 1, removeOnComplete: 200, removeOnFail: 100 } });
    this.startWorker(tenantId, domainId);
    return applied;
  }

  /** Remove the domain's drain — only if it is still the one for this agent (a later registration's drain is never removed by an older agent's refusal). */
  private async unscheduleFor(tenantId: string, domainId: string, agentId: string): Promise<boolean> {
    if (!this.enabled) return false;
    const q = this.queue(tenantId, domainId);
    const id = redisName(planSchedulerIdFor(tenantId, domainId));
    const current = await q.getJobScheduler(id).catch(() => undefined) as { template?: { data?: Partial<PlanDrainJobPayload> } } | undefined;
    if (current?.template?.data?.agentId !== agentId) return false;
    return q.removeJobScheduler(id).catch(() => false);
  }

  private startWorker(tenantId: string, domainId: string): void {
    const name = redisName(planQueueNameFor(tenantId, domainId));
    if (!this.enabled || this.workers.has(name)) return;
    const worker = new Worker(name, async (job: Job<PlanDrainJobPayload>) => {
      const p = job.data;
      // Rule 4 of the scheduler: a job whose scope disagrees with the queue it arrived on fails closed and is never retried.
      if (p.tenantId !== tenantId || p.domainId !== domainId) throw new UnrecoverableError('job payload scope does not match the queue it was delivered on');
      await this.drain(p, job.id ?? 'unknown');
    }, { connection: this.connection(), concurrency: 1 });
    worker.on('failed', (job, err) => { this.log.warn(`plan drain ${job?.id ?? '?'} failed: ${err.message.slice(0, 200)}`); });
    this.workers.set(name, worker);
    this.log.log(`plan worker started for ${name}`);
  }

  // ───────────────────────── one drain ─────────────────────────

  private async claim(p: PlanDrainJobPayload): Promise<Claimed[]> {
    return this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('plan executions claimed', 60)`.execute(tx);
      return (await sql<Claimed>`select execution_id::text, selection_id::text, method_id::text, method_key, method_version, evd_object_id::text, evd_version, attempts, correlation_id::text
        from intelligence.claim_plan_executions(${p.tenantId}::uuid, ${p.domainId}::uuid, ${p.agentId}::uuid, null, ${p.correlationId}::uuid)`.execute(tx)).rows;
    });
  }

  private async record(p: PlanDrainJobPayload, x: Claimed, o: Outcome): Promise<void> {
    await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('plan execution recorded', 60)`.execute(tx);
      await sql`select intelligence.record_plan_execution(${x.execution_id}::uuid, ${p.tenantId}::uuid, ${p.domainId}::uuid, ${o.state}, ${o.runId}::uuid, ${o.error}, ${JSON.stringify(o.details)}::jsonb)`.execute(tx);
    });
  }

  /** The envelope the run carries (its correlation and purpose). Built server-side; never client-supplied. */
  private env(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`,
      purpose_id: 'intelligence', action: 'intelligence.claim.admit', side_effect_class: 'reversible', consequence_class: 'C2',
      object_type: 'CLM', object_id: null, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: 'intelligence-plan-worker',
    } as unknown as Envelope;
  }

  /** One execution, as the agent: the orchestrator over exactly its evidence at the method version its plan named. */
  private async runOne(principal: AuthenticatedPrincipal, p: PlanDrainJobPayload, x: Claimed): Promise<Outcome> {
    try {
      const out = await this.orchestrator.run({
        envelope: this.env(principal, p.tenantId, p.domainId, x.correlation_id), principal, tenantId: p.tenantId, domainId: p.domainId,
        methodId: x.method_id, limit: 1, newAttempt: false, evidenceIds: [x.evd_object_id], methodVersion: x.method_version,
      });
      const details = { run_state: out.state, mode: out.mode, evidence_read: out.evidenceRead, claims_admitted: out.claimsAdmitted, claims: out.claims.map((c) => c.objectId),
                        idempotent_hits: out.idempotentHits, abstentions: out.abstentions, calls_used: out.callsUsed, queued_for_review: out.queuedForReview, method_key: x.method_key };
      if (out.state !== 'completed') return { state: 'failed', runId: out.runId, error: out.failure ?? `the run ended ${out.state}`, details };
      if (out.evidenceRead === 0) {
        return { state: 'refused', runId: out.runId, details,
                 error: 'the evidence was not read (refused, withdrawn, tombstoned, unreachable or damaged — the retrieval recorded why); nothing was extracted' };
      }
      return { state: 'done', runId: out.runId, error: null, details };
    } catch (e) {
      // A governance answer (the policy's 403, an absent method's 404, a method no longer active or re-versioned 409, a port's refusal) is a REFUSAL;
      // anything else is a fault, recorded as failed and taken again by a later drain while under the attempt budget.
      const mapped = e instanceof HttpException ? e : asObservationRefusal(e, x.correlation_id);
      if (mapped !== null && mapped.getStatus() >= 400 && mapped.getStatus() < 500) {
        const body = mapped.getResponse() as { code?: string; message?: string };
        return { state: 'refused', runId: null, error: `${body.code ?? mapped.getStatus()}: ${String(body.message ?? mapped.message)}`, details: { status: mapped.getStatus(), method_key: x.method_key } };
      }
      return { state: 'failed', runId: null, error: (e as Error)?.message ?? String(e), details: { method_key: x.method_key } };
    }
  }

  /** Claim, open the agent's session, run, record — one execution at a time; the session extended per recorded execution. */
  async drain(p: PlanDrainJobPayload, jobId: string): Promise<DrainReport> {
    const report: DrainReport = { at: new Date().toISOString(), tenantId: p.tenantId, domainId: p.domainId, agentId: p.agentId, jobId, claimed: 0, done: 0, refused: 0, failed: 0, note: null };
    const tally = (o: Outcome) => { report[o.state] += 1; };
    try {
      const claimed = await this.claim(p);
      report.claimed = claimed.length;
      if (claimed.length === 0) return report;
      let principal: AuthenticatedPrincipal;
      try {
        principal = await this.sessions.openRunSession({ agentId: p.agentId, tenantId: p.tenantId, domainId: p.domainId, correlationId: p.correlationId });
      } catch (e) {
        const refused = e instanceof ExtractionGrantRefused;
        const o: Outcome = refused
          ? { state: 'refused', runId: null, error: `the extraction agent's grant refused the run: ${e.message}`, details: { agent_id: p.agentId } }
          : { state: 'failed', runId: null, error: `the agent's session could not be opened: ${(e as Error)?.message ?? String(e)}`, details: { agent_id: p.agentId } };
        for (const x of claimed) { await this.record(p, x, o); tally(o); }
        if (refused) {
          // A refused grant serves nothing more: its drain is removed (a later registration schedules its own and re-queues these).
          const removed = await this.unscheduleFor(p.tenantId, p.domainId, p.agentId);
          report.note = `grant refused (${e.message}); ${claimed.length} execution(s) recorded refused; drain ${removed ? 'removed' : 'already replaced'}`;
        } else report.note = o.error;
        return report;
      }
      for (let i = 0; i < claimed.length; i += 1) {
        const x = claimed[i] as Claimed;
        if (i > 0) {
          const until = await this.sessions.extendRunSession({ sessionId: principal.sessionId, principalId: principal.principalId, agentId: p.agentId, tenantId: p.tenantId, domainId: p.domainId, correlationId: p.correlationId });
          if (until === null) {
            // Revoked (or lapsed) mid-drain: the executions still held are refused, recorded — none runs on a grant that ended.
            const o: Outcome = { state: 'refused', runId: null, error: 'the extraction agent\'s grant ended during the drain (the session extension was refused)', details: { agent_id: p.agentId } };
            for (const rest of claimed.slice(i)) { await this.record(p, rest, o); tally(o); }
            report.note = 'grant ended mid-drain';
            break;
          }
        }
        const o = await this.runOne(principal, p, x);
        await this.record(p, x, o);
        tally(o);
      }
      return report;
    } catch (e) {
      this.note(`plan drain ${jobId}`, e);
      report.note = `fault: ${((e as Error)?.message ?? String(e)).slice(0, 200)}`;
      return report;
    } finally {
      this.recent.unshift(report);
      if (this.recent.length > 100) this.recent.length = 100;
    }
  }

  // ───────────────────────── test control ─────────────────────────

  private testOnly(what: string): void {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error(`${what} is available only in the test runtime`);
  }
  /** Test-only: promote the delayed drains of a domain (never wait on BullMQ's 60-second floor). */
  async promoteDelayedDrainsForTests(tenantId: string, domainId: string): Promise<number> {
    this.testOnly('promoteDelayedDrainsForTests');
    const delayed = await this.queue(tenantId, domainId).getDelayed();
    for (const j of delayed) await j.promote().catch(() => undefined);
    return delayed.length;
  }
  /** Test-only: the domain's drain queue emptied (the scheduler, its jobs) and its worker closed. */
  async obliterateDrainsForTests(tenantId: string, domainId: string): Promise<void> {
    this.testOnly('obliterateDrainsForTests');
    const name = redisName(planQueueNameFor(tenantId, domainId));
    await this.workers.get(name)?.close().catch(() => undefined);
    this.workers.delete(name);
    await this.queue(tenantId, domainId).obliterate({ force: true }).catch(() => undefined);
  }
  /** Test-only: the domain's queue counts (a drain in flight is `active`). */
  async queueCountsForTests(tenantId: string, domainId: string): Promise<Record<string, number>> {
    this.testOnly('queueCountsForTests');
    return this.queue(tenantId, domainId).getJobCounts('active', 'waiting', 'delayed', 'completed', 'failed');
  }
  /** Test-only: the domain's repeatable drain as Redis holds it (whose agent it drains for). */
  async drainSchedulerForTests(tenantId: string, domainId: string): Promise<{ agentId: string | null; every: number | null } | null> {
    this.testOnly('drainSchedulerForTests');
    const s = await this.queue(tenantId, domainId).getJobScheduler(redisName(planSchedulerIdFor(tenantId, domainId))) as { every?: number | string; template?: { data?: Partial<PlanDrainJobPayload> } } | undefined;
    return s === undefined || s === null ? null : { agentId: s.template?.data?.agentId ?? null, every: s.every === undefined ? null : Number(s.every) };
  }
}
