/**
 * THE ATTENTION TIMER HOST — CP-6 B24 (0086 §T; F-P6-07 "a timer host for escalation"). The shape of the briefing planner
 * (agent-worker.service.ts): every domain with an active ATTENTION agent gets one tick job on the existing scheduler (its own job
 * kind and queue, exec:{t}:{d}:attention), reconciled at startup under the schedule capability and re-pointed when an attention
 * agent is registered; each tick runs the attention agent under its OWN session as a scheduler-triggered run (task attention_tick),
 * whose one governed write (executive.attention.tick) runs the registered tick steps in order. This host registers the first
 * step, ESCALATE (order 10: executive.escalate_attention_due — the overdue escalated to their class's roles, the lapsed
 * suppressions reopened); the delivery section registers its own (order 30).
 *
 * A tick that cannot open the agent's session (a revoked agent, an inactive principal) is RECORDED — a closed, refused run of the
 * scheduler on executive.agent_runs, escalated to the agent's named human (executive.record_attention_tick_refusal) — never skipped
 * silently; the timer is then re-pointed to the domain's newest active attention agent, or stopped when there is none. A drifted
 * digest is refused by the run itself (agents.service.ts). The job's scheduled instant is the tick's key: a duplicate job of the
 * same instant answers `repeated`.
 */
import { HttpException, Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { SchedulerService, type AttentionTickPayload } from '../../observation/scheduling/scheduler.service.js';
import { AgentsService, type RunOutcome } from '../agents/agents.service.js';
import { ExecutiveCapability } from '../executive.capabilities.js';
import { AttentionTickRegistry } from './tick.js';

export interface AttentionReconcileReport { eligible: number; scheduled: Array<{ tenantId: string; domainId: string; agentId: string; cadenceSeconds: number }>; failures: string[] }
/** What one tick came to: the run (finished, stopped, refused by drift, faulted) or the refusal recorded before any session. */
export interface AttentionTickOutcome { jobId: string; agentId: string; outcome: string; runId: string | null; repeated: boolean; stopReason: string | null; recordedRefusal: Record<string, unknown> | null; run: RunOutcome | null }

@Injectable()
export class AttentionTimerService implements OnModuleInit, OnApplicationBootstrap {
  private readonly log = new Logger(AttentionTimerService.name);
  private lastReconcile: (AttentionReconcileReport & { at: string }) | null = null;
  private lastTicks: Array<{ tenantId: string; domainId: string; jobId: string; agentId: string; outcome: string; at: string }> = [];

  constructor(@Inject(COMMIT_DB) private readonly commitDb: Db, @Inject(EYE_CONFIG) private readonly cfg: EyeConfig, private readonly scheduler: SchedulerService,
              private readonly agents: AgentsService, private readonly ticks: AttentionTickRegistry) {}

  /** The ESCALATE step (order 10): escalate-due under the tick's own write, the agent's principal the actor of every item event. */
  onModuleInit(): void {
    this.ticks.register({
      name: 'escalate', order: 10,
      run: async (ctx) => ExecutiveCapability.attentionTick(ctx.tx, 'executive.attention.tick')
        .escalateDue({ tenantId: ctx.tenantId, domainId: ctx.domainId, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId }),
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.scheduler.enabled) return;
    this.scheduler.registerAttentionHandler(async (payload, jobId, scheduledAt) => { await this.handle(payload, jobId, scheduledAt); });
    try {
      const r = await this.reconcile('startup reconciliation');
      this.log.log(`reconciled ${r.scheduled.length}/${r.eligible} attention timer(s)`);
    } catch (e) { this.log.error(`attention timer reconciliation failed: ${(e as Error).message.slice(0, 200)}`); }
  }

  /** The host's metadata, SCOPED to the caller's tenant and domain (the planner's rule, residual review R4). */
  lastReconciliation(tenantId?: string, domainId?: string) {
    if (this.lastReconcile === null) return null;
    if (tenantId === undefined) return this.lastReconcile;
    const scoped = this.lastReconcile.scheduled.filter((s) => s.tenantId === tenantId && s.domainId === domainId);
    return { ...this.lastReconcile, eligible: scoped.length, scheduled: scoped, failures: this.lastReconcile.failures.filter((f) => f.startsWith(`${tenantId}/${domainId}:`)) };
  }
  recentTicks(tenantId?: string, domainId?: string) {
    return tenantId === undefined ? this.lastTicks : this.lastTicks.filter((r) => r.tenantId === tenantId && r.domainId === domainId).map(({ tenantId: _t, domainId: _d, ...rest }) => rest);
  }

  /** Every domain with an active attention agent (the newest registration): one timer at its cadence. Read under the schedule capability (0086 §T). */
  async reconcile(reason: string): Promise<AttentionReconcileReport> {
    const rows = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${reason}, 60)`.execute(tx);
      return (await sql<{ tenant_id: string; domain_id: string; agent_id: string; cadence_seconds: number }>`select * from executive.attention_timers_to_reconcile()`.execute(tx)).rows;
    });
    const report: AttentionReconcileReport = { eligible: rows.length, scheduled: [], failures: [] };
    for (const r of rows) {
      try {
        const applied = await this.scheduleDomain(r.tenant_id, r.domain_id, r.agent_id, r.cadence_seconds);
        report.scheduled.push({ tenantId: r.tenant_id, domainId: r.domain_id, agentId: r.agent_id, cadenceSeconds: applied.cadenceSeconds });
      } catch (e) { report.failures.push(`${r.tenant_id}/${r.domain_id}:${r.agent_id}: ${(e as Error).message.slice(0, 200)}`); }
    }
    this.lastReconcile = { ...report, at: new Date().toISOString() };
    return report;
  }

  /** One timer per domain: a registration (or a reconciliation) points it at the agent and its cadence. */
  async scheduleDomain(tenantId: string, domainId: string, agentId: string, cadenceSeconds: number) {
    const r = await this.scheduler.scheduleAttentionTick(tenantId, domainId, { tenantId, domainId, agentId, cadenceSeconds, correlationId: newId() });
    return { ...r, scheduled: this.scheduler.enabled, schedulerEnabled: this.scheduler.enabled };
  }

  /**
   * TEST CONTROL ONLY: one tick now, without Redis — the same path a job takes (the agent's run, or the recorded refusal). `scheduledAt`
   * is the instant the tick stands for (its key); two calls with the same instant are the duplicate job a scheduler may deliver.
   */
  async tickNow(a: { tenantId: string; domainId: string; agentId: string; cadenceSeconds?: number; scheduledAt?: Date | null }): Promise<AttentionTickOutcome> {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('tickNow is available only in the test runtime');
    return this.handle({ tenantId: a.tenantId, domainId: a.domainId, agentId: a.agentId, cadenceSeconds: a.cadenceSeconds ?? 0, correlationId: newId() }, `tick-now:${newId()}`,
      a.scheduledAt === undefined || a.scheduledAt === null ? null : a.scheduledAt.getTime());
  }

  private async handle(payload: AttentionTickPayload, jobId: string, scheduledAt: number | null): Promise<AttentionTickOutcome> {
    const T = payload.tenantId; const D = payload.domainId;
    let outcome: AttentionTickOutcome;
    try {
      const run = await this.agents.run({ agentId: payload.agentId, tenantId: T, domainId: D, task: 'attention_tick', trigger: { kind: 'scheduler', principalId: null, ref: jobId },
        roomId: null, packageId: null, version: null, correlationId: payload.correlationId,
        tick: { scheduledAt: scheduledAt === null ? null : new Date(scheduledAt).toISOString(), cadenceSeconds: payload.cadenceSeconds > 0 ? payload.cadenceSeconds : null } });
      outcome = { jobId, agentId: payload.agentId, outcome: run.outcome, runId: run.runId, repeated: run.outputs['repeated'] === true, stopReason: run.stopReason, recordedRefusal: null, run };
    } catch (e) {
      // The session port refused the agent (revoked, inactive, unknown): the tick is RECORDED as a refused run of the scheduler, never skipped.
      if (!(e instanceof HttpException && e.getStatus() === 403)) {
        this.note(T, D, jobId, payload.agentId, `fault: ${(e as Error).message.slice(0, 120)}`);
        throw e;
      }
      const reason = `attention tick refused before any session: ${String((e.getResponse() as { message?: string }).message ?? e.message)} (agent ${payload.agentId})`;
      const recorded = await this.recordRefusal(payload, jobId, reason);
      outcome = { jobId, agentId: payload.agentId, outcome: 'refused', runId: String(recorded['run_id']), repeated: false, stopReason: reason, recordedRefusal: recorded, run: null };
      // The timer follows the domain's newest ACTIVE attention agent, or stops when there is none (a successor's timer is never stopped).
      const next = typeof recorded['active_agent_id'] === 'string' ? recorded['active_agent_id'] : null;
      if (next === null) await this.scheduler.unscheduleAttentionTick(T, D);
      else if (next !== payload.agentId) await this.scheduleDomain(T, D, next, Number(recorded['active_cadence_seconds'] ?? 0) || payload.cadenceSeconds);
    }
    this.note(T, D, jobId, payload.agentId, outcome.repeated ? `${outcome.outcome} (repeated)` : outcome.outcome);
    return outcome;
  }

  private async recordRefusal(payload: AttentionTickPayload, jobId: string, reason: string): Promise<Record<string, unknown>> {
    return this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${'attention tick refusal'}, 60)`.execute(tx);
      const rows = await sql<{ r: Record<string, unknown> }>`select executive.record_attention_tick_refusal(${newId()}::uuid, ${payload.tenantId}::uuid, ${payload.domainId}::uuid, ${payload.agentId}::uuid, ${jobId}, ${reason}, ${payload.correlationId}::uuid) as r`.execute(tx);
      const r = rows.rows[0]?.r; if (r === undefined) throw new Error('record_attention_tick_refusal returned no row'); return r;
    });
  }

  private note(tenantId: string, domainId: string, jobId: string, agentId: string, outcome: string): void {
    this.lastTicks.unshift({ tenantId, domainId, jobId, agentId, outcome, at: new Date().toISOString() });
    this.lastTicks = this.lastTicks.slice(0, 50);
  }
}
