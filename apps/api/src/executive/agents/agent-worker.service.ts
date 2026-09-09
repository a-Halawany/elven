/**
 * THE PLANNER — Phase 6 (L9), stage P6-M6: rooms with a review cadence and an active
 * briefing agent in their domain get a briefing job on the existing scheduler (its own
 * job kind and queue), reconciled at startup like collection schedules; each tick runs
 * the briefing agent under its budget as a scheduler-triggered run.
 */
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'kysely';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import { SchedulerService, type BriefingJobPayload } from '../../observation/scheduling/scheduler.service.js';
import { AgentsService } from './agents.service.js';

export interface BriefingReconcileReport { eligible: number; scheduled: Array<{ roomId: string; agentId: string; cadenceSeconds: number }>; failures: string[] }

@Injectable()
export class AgentWorkerService implements OnApplicationBootstrap {
  private readonly log = new Logger(AgentWorkerService.name);
  private lastReconcile: (BriefingReconcileReport & { at: string }) | null = null;
  private lastRuns: Array<{ jobId: string; roomId: string; outcome: string; at: string }> = [];

  constructor(@Inject(COMMIT_DB) private readonly commitDb: Db, private readonly scheduler: SchedulerService, private readonly agents: AgentsService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.scheduler.enabled) return;
    this.scheduler.registerBriefingHandler((payload, jobId) => this.handle(payload, jobId));
    try {
      const r = await this.reconcile('startup reconciliation');
      this.log.log(`reconciled ${r.scheduled.length}/${r.eligible} room briefing cadence(s)`);
    } catch (e) { this.log.error(`briefing cadence reconciliation failed: ${(e as Error).message.slice(0, 200)}`); }
  }

  lastReconciliation() { return this.lastReconcile; }
  recentRuns() { return this.lastRuns; }

  /** Every open room in a domain with an active briefing agent: one scheduler at the room's review cadence. */
  async reconcile(reason: string): Promise<BriefingReconcileReport> {
    // Under the schedule capability (no tenant) every RLS table hides its rows: the eligible rooms are read by the port that asserts that capability (0048).
    const rows = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${reason}, 60)`.execute(tx);
      return (await sql<{ tenant_id: string; domain_id: string; room_id: string; agent_id: string; review_every_days: number }>`select * from executive.briefings_to_reconcile()`.execute(tx)).rows;
    });
    const report: BriefingReconcileReport = { eligible: rows.length, scheduled: [], failures: [] };
    for (const r of rows) {
      try {
        const applied = await this.scheduler.scheduleBriefing(r.tenant_id, r.domain_id, { tenantId: r.tenant_id, domainId: r.domain_id, roomId: r.room_id, agentId: r.agent_id, correlationId: newId() }, r.review_every_days * 86_400);
        report.scheduled.push({ roomId: r.room_id, agentId: r.agent_id, cadenceSeconds: applied.cadenceSeconds });
      } catch (e) { report.failures.push(`${r.room_id}: ${(e as Error).message.slice(0, 200)}`); }
    }
    this.lastReconcile = { ...report, at: new Date().toISOString() };
    return report;
  }

  async scheduleRoom(tenantId: string, domainId: string, roomId: string, agentId: string, cadenceSeconds: number) {
    return this.scheduler.scheduleBriefing(tenantId, domainId, { tenantId, domainId, roomId, agentId, correlationId: newId() }, cadenceSeconds);
  }

  private async handle(payload: BriefingJobPayload, jobId: string): Promise<void> {
    try {
      const r = await this.agents.run({ agentId: payload.agentId, tenantId: payload.tenantId, domainId: payload.domainId, task: 'briefing', trigger: { kind: 'scheduler', principalId: null, ref: jobId }, roomId: payload.roomId, packageId: null, version: null, correlationId: newId() });
      this.lastRuns.unshift({ jobId, roomId: payload.roomId, outcome: r.outcome, at: new Date().toISOString() });
    } catch (e) {
      this.lastRuns.unshift({ jobId, roomId: payload.roomId, outcome: `fault: ${(e as Error).message.slice(0, 120)}`, at: new Date().toISOString() });
      throw e;
    }
    this.lastRuns = this.lastRuns.slice(0, 50);
  }
}
