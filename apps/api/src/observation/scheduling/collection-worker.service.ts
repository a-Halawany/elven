/**
 * The collection WORKER — scheduled-collection increment (SCHEDULED_COLLECTION.md §2).
 *
 * Starts with the process when the scheduler is enabled, and does three things:
 *
 *  1. Registers the job handler with the SchedulerService, so every domain queue that
 *     is scheduled — by an activation or by the reconciliation below — gets a worker.
 *  2. RECONCILES persisted schedules at startup: every eligible
 *     observation.scheduler_entries row (status scheduled; contract active, live,
 *     rights confirmed; an active agent for the connector) is re-materialized as a
 *     Redis job scheduler. Entries recorded while scheduling was disabled, or lost
 *     with a Redis restart, are served again after a restart. Ineligible entries are
 *     left exactly as they are; nothing here changes a row.
 *  3. RUNS each job through the existing agent-authorized path
 *     (CollectionOrchestrator.handleScheduledJob → agent session from the registry →
 *     AcquisitionLifecycle.run with its own re-verification), and RECORDS the attempt:
 *     finished / failed / cancelled / budget_exceeded when a run was opened, refused
 *     when it was not, FAULTED when an exception escaped the governed path (with the
 *     opened run's id when run.started had been committed). A refusal is not retried —
 *     it is a governance answer, not a transient fault; a fault is recorded and rethrown
 *     so BullMQ's bounded retry applies.
 *
 * AUTHORITY. The listing and the attempt record run under
 * observation.issue_schedule_capability — the bounded machine capability of migrations
 * 0038/0039 (mode schedule, class scheduler, one
 * action) on the eye_commit pool. No human principal, no domain business authority,
 * no evidence read. The run itself acts as the agent, exactly as an operator-triggered
 * run does.
 */
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { sql } from 'kysely';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import { CollectionOrchestrator } from '../acquisition/orchestrator.service.js';
import { SchedulerService, type CollectionJobPayload } from './scheduler.service.js';

interface ReconcileRow {
  tenant_id: string; domain_id: string; source_id: string; contract_version: number;
  scheduler_id: string; queue_name: string; cadence_seconds: number; jitter_seconds: number;
  connector_kind: string; agent_id: string; agent_version: string; code_digest: string;
  budgets: Record<string, number>;
}

export interface ReconcileReport {
  eligible: number;
  scheduled: Array<{ tenantId: string; domainId: string; sourceId: string; contractVersion: number; cadenceSeconds: number }>;
  workers: string[];
}

@Injectable()
export class CollectionWorkerService implements OnApplicationBootstrap {
  private readonly log = new Logger('observation.collection-worker');
  private lastReconcile: (ReconcileReport & { at: string }) | null = null;
  /** The last thing that went wrong in this worker — reconciliation or attempt recording — for operators and tests. */
  private lastFailure: { at: string; where: string; message: string } | null = null;

  constructor(
    @Inject(COMMIT_DB) private readonly commitDb: Db,
    private readonly scheduler: SchedulerService,
    private readonly orchestrator: CollectionOrchestrator,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.scheduler.enabled) {
      this.log.log('scheduler disabled: no collection worker started, persisted schedules not reconciled');
      return;
    }
    this.scheduler.registerHandler((payload, jobId) => this.handle(payload, jobId));
    try {
      const report = await this.reconcile('startup reconciliation');
      this.log.log(`reconciled ${report.scheduled.length}/${report.eligible} persisted schedule(s); workers: ${report.workers.length}`);
    } catch (e) {
      // A failed reconciliation must not take the API down; it is reported and retried on the next start.
      this.note('startup reconciliation', e);
    }
  }

  /** What the last reconciliation did, for readiness and operators. */
  lastReconciliation(): (ReconcileReport & { at: string }) | null { return this.lastReconcile; }
  /** The last failure this worker met, or null. */
  lastFailureSeen(): { at: string; where: string; message: string } | null { return this.lastFailure; }

  private note(where: string, e: unknown): void {
    const message = (e as Error)?.message ?? String(e);
    this.lastFailure = { at: new Date().toISOString(), where, message: message.slice(0, 300) };
    this.log.error(`${where} failed: ${message.slice(0, 200)}`);
  }

  /**
   * Restore every eligible persisted schedule into Redis and start the workers for
   * their domains. Idempotent: upsertJobScheduler keeps an existing scheduler's
   * cadence in step and creates a missing one.
   */
  async reconcile(reason: string): Promise<ReconcileReport> {
    const rows = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${reason}, 60)`.execute(tx);
      return (await sql<ReconcileRow>`select * from observation.schedules_to_reconcile()`.execute(tx)).rows;
    });
    const report: ReconcileReport = { eligible: rows.length, scheduled: [], workers: [] };
    for (const r of rows) {
      const payload: CollectionJobPayload = {
        tenantId: r.tenant_id, domainId: r.domain_id, sourceId: r.source_id, contractVersion: r.contract_version,
        agentId: r.agent_id, agentVersion: r.agent_version, codeDigest: r.code_digest,
        connector: r.connector_kind, correlationId: newId(), budgets: r.budgets ?? {},
      };
      try {
        const applied = await this.scheduler.schedule(r.tenant_id, r.domain_id, payload, r.cadence_seconds, r.jitter_seconds);
        report.scheduled.push({ tenantId: r.tenant_id, domainId: r.domain_id, sourceId: r.source_id, contractVersion: r.contract_version, cadenceSeconds: applied.cadenceSeconds });
      } catch (e) {
        this.note(`restore schedule for source ${r.source_id.slice(0, 8)}`, e);
      }
    }
    report.workers = this.scheduler.runningWorkers();
    this.lastReconcile = { ...report, at: new Date().toISOString() };
    return report;
  }

  /** One job: run through the governed path, then record the attempt whatever happened. */
  private async handle(payload: CollectionJobPayload, jobId: string): Promise<void> {
    const startedAt = new Date();
    let openedRunId: string | null = null;
    let outcome: { state: string; runId: string; admitted: number; noop: number; quarantined: number; reason?: string; opened?: boolean };
    try {
      outcome = await this.orchestrator.handleScheduledJob(payload, jobId, (runId) => { openedRunId = runId; });
    } catch (e) {
      // An EXECUTION FAULT — an exception that escaped the governed path — is not a
      // governance refusal. It is recorded as `faulted`, with the run it belongs to when
      // run.started had already been committed, and rethrown so BullMQ's bounded retry
      // applies (a refusal, by contrast, returns normally and is never retried).
      this.note('scheduled job', e);
      await this.record(payload, jobId, startedAt, 'faulted', openedRunId, `fault: ${(e as Error).message}`, 0, 0, 0).catch((re) => this.note('record attempt', re));
      throw e;
    }
    // A run is OPENED only when run.started was persisted; a refusal before that has no run, whatever id was allocated.
    const opened = outcome.runId !== 'none' && outcome.opened !== false;
    try {
      await this.record(
        payload, jobId, startedAt,
        opened ? outcome.state : 'refused',
        opened ? outcome.runId : null,
        outcome.reason ?? null, outcome.admitted, outcome.noop, outcome.quarantined,
      );
    } catch (e) {
      // The run's own record stands; the attempt record is what failed, and that is a fault to surface, not to hide.
      this.note('record attempt', e);
      throw e;
    }
  }

  private async record(
    p: CollectionJobPayload, jobId: string, startedAt: Date, outcome: string, runId: string | null,
    reason: string | null, admitted: number, noop: number, quarantined: number,
  ): Promise<void> {
    const schedulerId = `obs:${p.tenantId}:${p.domainId}:src:${p.sourceId}`;
    await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${'record scheduled attempt'}, 60)`.execute(tx);
      await sql`select observation.record_scheduled_attempt(
        ${newId()}::uuid, ${p.tenantId}::uuid, ${p.domainId}::uuid, ${p.sourceId}::uuid, ${p.contractVersion},
        ${schedulerId}, ${jobId}, ${startedAt}, ${new Date()}, ${outcome}, ${runId}::uuid, ${reason},
        ${admitted}, ${noop}, ${quarantined})`.execute(tx);
    });
  }
}
