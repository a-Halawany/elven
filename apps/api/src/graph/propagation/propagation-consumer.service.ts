/**
 * The `CorrectionApplied` CONSUMER — CP-6 batch B1 (migration 0060).
 *
 * Since Phase 3 every review carried the same deferred sentence: the outbox publishes an
 * applied correction and nothing subscribes. This service is what makes that stop being
 * true. It starts with the process when the scheduler is enabled and does three things:
 *
 *  1. Registers the propagation job handler with the SchedulerService and starts a worker
 *     for every domain that has an ACTIVE propagation agent (graph.propagation_agents),
 *     one job at a time per domain.
 *  2. RECONCILES at startup and at every registration: applied cases whose propagation is
 *     not complete, in a served domain, whose latest apply event has no attempt or a failed
 *     one, are re-driven onto the domain queue (the job id is the outbox row id, so a job
 *     already waiting is not duplicated). Redis state is never the record: the attempt
 *     ledger is.
 *  3. RUNS each job through the SAME governed path an operator uses — a session opened for
 *     the domain's agent by its own port, then `graph.impact.propagate` through
 *     PipelineService.write with the impact capability, ImpactService.propagate, 0034's
 *     record_impact — once per corrected object of the case, with a per-root checkpoint
 *     taken FOR UPDATE inside the walk's transaction (propagation_root_begin/_done). The
 *     case moves out of the awaiting queue only when the DATABASE records its coverage
 *     complete (0027 §2); a truncated walk stays partial and visible.
 *
 * FAILURE IS RECORDED, NEVER FATAL. A refused grant, an absent agent, a budget refusal or a
 * revocation mid-walk is a GOVERNANCE answer: recorded on the attempt as failed with its
 * reason, the job completes, nothing is retried by the queue, the case stays visible with
 * the reason under `automatic`, and the operator route remains available. An
 * infrastructure fault is recorded and RETHROWN so BullMQ's bounded retry applies, and the
 * next delivery resumes from the roots already walked. No handler path can end the API
 * process (the 0057 publisher rule).
 *
 * AUTHORITY. The attempt ledger runs under observation.issue_schedule_capability — the
 * bounded machine capability of 0038/0039 on the commit pool (a refused grant still has to
 * be recorded). The walk itself acts as the agent, under the agent's session, and holds no
 * write the operator route lacks.
 */
import { HttpException, Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { sql } from 'kysely';
import type { Envelope } from '@eye/contracts';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService, type WriteEffect } from '../../pipeline/pipeline.service.js';
import { SchedulerService, type PropagationJobPayload } from '../../observation/scheduling/scheduler.service.js';
import { GraphCapability } from '../graph.capabilities.js';
import { ImpactService } from '../strategy/impact.service.js';
import { PropagationAgentSessionService, PropagationGrantRefused } from './propagation-agent-session.service.js';

interface Receipt {
  state: 'received' | 'walking' | 'complete' | 'partial' | 'failed';
  deliveries: number; attempts: number;
  roots: string[]; roots_walked: Array<{ root: string; invalidation_id: string; truncated: boolean }>;
  case_state: string; case_propagation_state: string;
  agent: { agent_id: string; principal_id: string; agent_version: string; code_digest: string; budgets: { max_roots_per_event?: number; max_elapsed_ms?: number } } | null;
}

export interface ReconcileReport {
  at: string; reason: string;
  domains: Array<{ tenantId: string; domainId: string; agentId: string }>;
  workers: string[];
  reDriven: Array<{ tenantId: string; domainId: string; eventId: string; caseId: string; previous: string | null }>;
}

/** A test-only fault, armed once: thrown at the named point of the NEXT delivery. Refused outside the test runtime. */
export type ConsumerFault = 'before_root' | 'after_first_root';

@Injectable()
export class PropagationConsumerService implements OnApplicationBootstrap {
  private readonly log = new Logger('graph.propagation-consumer');
  private lastReconcile: ReconcileReport | null = null;
  private lastFailure: { at: string; where: string; message: string } | null = null;
  private fault: ConsumerFault | null = null;
  /** Every finished delivery this process handled, newest first (bounded), for operators and tests. */
  private readonly recent: Array<{ at: string; eventId: string; caseId: string; outcome: string; reason: string | null; attempt: number }> = [];

  constructor(
    @Inject(COMMIT_DB) private readonly commitDb: Db,
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    private readonly pipeline: PipelineService,
    private readonly scheduler: SchedulerService,
    private readonly impact: ImpactService,
    private readonly sessions: PropagationAgentSessionService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.scheduler.enabled) {
      this.log.log('scheduler disabled: no propagation worker started; corrections are propagated by operators');
      return;
    }
    this.scheduler.registerPropagationHandler((payload, jobId, attempt) => this.handle(payload, jobId, attempt));
    try {
      const r = await this.reconcile('startup reconciliation');
      this.log.log(`serving ${r.domains.length} domain(s) with a propagation agent; re-drove ${r.reDriven.length} outstanding correction event(s)`);
    } catch (e) {
      // A failed reconciliation must not take the API down; it is reported and retried on the next start.
      this.note('startup reconciliation', e);
    }
  }

  lastReconciliation(): ReconcileReport | null { return this.lastReconcile; }
  lastFailureSeen(): { at: string; where: string; message: string } | null { return this.lastFailure; }
  recentDeliveries(): ReadonlyArray<{ at: string; eventId: string; caseId: string; outcome: string; reason: string | null; attempt: number }> { return this.recent; }

  /** TEST CONTROL ONLY: arm a one-shot fault in the next delivery. */
  armFaultForTests(kind: ConsumerFault | null): void {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('armFaultForTests is available only in the test runtime');
    this.fault = kind;
  }

  private note(where: string, e: unknown): void {
    const message = (e as Error)?.message ?? String(e);
    this.lastFailure = { at: new Date().toISOString(), where, message: message.slice(0, 300) };
    this.log.error(`${where} failed: ${message.slice(0, 200)}`);
  }

  /**
   * Serve every domain with an active agent and re-drive every outstanding apply event
   * that has no attempt or a failed one. Idempotent: a worker already running is kept, a
   * job already waiting is kept.
   */
  async reconcile(reason: string): Promise<ReconcileReport> {
    const { domains, events } = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${reason}, 60)`.execute(tx);
      const domains = (await sql<{ tenant_id: string; domain_id: string; agent_id: string }>`select tenant_id, domain_id, agent_id from graph.propagation_domains_to_serve()`.execute(tx)).rows;
      const events = (await sql<{ tenant_id: string; domain_id: string; event_id: string; case_id: string; event_type: string; correlation_id: string; causation_id: string; attempt_state: string | null }>`
        select * from graph.propagations_to_reconcile()`.execute(tx)).rows;
      return { domains, events };
    });
    const report: ReconcileReport = { at: new Date().toISOString(), reason, domains: [], workers: [], reDriven: [] };
    for (const d of domains) {
      this.scheduler.startPropagationWorker(d.tenant_id, d.domain_id);
      report.domains.push({ tenantId: d.tenant_id, domainId: d.domain_id, agentId: d.agent_id });
    }
    for (const e of events) {
      try {
        const id = await this.scheduler.enqueuePropagation(e.tenant_id, e.domain_id, {
          event_id: e.event_id, event_type: 'CorrectionApplied',
          // A pre-0060 apply row carried the submission's name; the re-drive says so.
          payload: { case_id: e.case_id, re_driven: reason, original_event_type: e.event_type },
          correlation_id: e.correlation_id, causation_id: e.causation_id, tenant_id: e.tenant_id, domain_id: e.domain_id,
        });
        if (id !== null) report.reDriven.push({ tenantId: e.tenant_id, domainId: e.domain_id, eventId: e.event_id, caseId: e.case_id, previous: e.attempt_state });
      } catch (x) {
        this.note(`re-drive of event ${e.event_id.slice(0, 8)}`, x);
      }
    }
    report.workers = this.scheduler.runningWorkers();
    this.lastReconcile = report;
    return report;
  }

  // ───────────────────────── one delivery ─────────────────────────

  private async receive(eventId: string, tenantId: string, domainId: string, caseId: string): Promise<Receipt> {
    return this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('propagation attempt received', 60)`.execute(tx);
      const rows = await sql<{ r: Receipt }>`select graph.propagation_attempt_receive(${eventId}::uuid, ${tenantId}::uuid, ${domainId}::uuid, ${caseId}::uuid, ${newId()}::uuid) as r`.execute(tx);
      return rows.rows[0]?.r as Receipt;
    });
  }

  private async finish(eventId: string, tenantId: string, domainId: string, caseId: string, outcome: 'walked' | 'failed', reason: string | null, attempt: number): Promise<string> {
    const state = await this.commitDb.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability('propagation attempt finished', 60)`.execute(tx);
      const rows = await sql<{ s: string }>`select graph.propagation_attempt_finish(${eventId}::uuid, ${tenantId}::uuid, ${domainId}::uuid, ${outcome}, ${reason}) as s`.execute(tx);
      return rows.rows[0]?.s ?? 'failed';
    });
    this.recent.unshift({ at: new Date().toISOString(), eventId, caseId, outcome: state, reason, attempt });
    if (this.recent.length > 100) this.recent.length = 100;
    if (state === 'failed') this.log.warn(`correction ${caseId.slice(0, 8)} event ${eventId.slice(0, 8)}: automatic propagation failed: ${reason ?? '(no reason)'}`);
    else this.log.log(`correction ${caseId.slice(0, 8)} event ${eventId.slice(0, 8)}: automatic propagation ${state}`);
    return state;
  }

  /** The envelope an agent's governed walk needs. Built server-side; never client-supplied. */
  private env(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, objectId: string, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`,
      purpose_id: 'graph', action: 'graph.impact.propagate', side_effect_class: 'reversible', consequence_class: 'C2',
      object_type: 'INV', object_id: objectId, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: 'graph-propagation-consumer',
    } as unknown as Envelope;
  }

  /** One delivery of one CorrectionApplied event: record it, walk what is not yet walked, record the outcome. */
  async handle(p: PropagationJobPayload, jobId: string, attemptsMade: number): Promise<void> {
    const attempt = attemptsMade + 1;
    const tenantId = p.tenant_id; const domainId = p.domain_id;
    const caseId = typeof p.payload?.case_id === 'string' ? p.payload.case_id : '';
    if (p.event_type !== 'CorrectionApplied' || caseId === '' || tenantId === null || domainId === null) {
      // Not this consumer's event: a routing or tampering error, never retried.
      throw new UnrecoverableError(`job ${jobId} is not a scoped CorrectionApplied event`);
    }
    const rec = await this.receive(p.event_id, tenantId, domainId, caseId);
    if (rec.state === 'complete' || rec.state === 'partial') return; // a redelivery of a finished event: a durable no-op
    if (rec.agent === null) { await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', 'no active propagation agent is registered in this domain; operator-initiated propagation remains available', attempt); return; }
    if (rec.case_state !== 'applied') { await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', `the correction case is ${rec.case_state}, not applied; nothing to propagate`, attempt); return; }
    const maxRoots = Number(rec.agent.budgets.max_roots_per_event ?? 64);
    const maxElapsed = Number(rec.agent.budgets.max_elapsed_ms ?? 600_000);
    if (rec.roots.length > maxRoots) {
      await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', `budget: ${rec.roots.length} corrected object(s) exceed max_roots_per_event ${maxRoots}; operator-initiated propagation required`, attempt);
      return;
    }
    if (rec.roots.length === 0) {
      await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', 'the case records no corrected object to walk', attempt);
      return;
    }

    let principal: AuthenticatedPrincipal;
    const correlationId = newId();
    try {
      principal = await this.sessions.openRunSession({ agentId: rec.agent.agent_id, tenantId, domainId, correlationId });
    } catch (e) {
      if (e instanceof PropagationGrantRefused) { await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', e.message, attempt); return; }
      await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', `fault opening the agent session: ${(e as Error).message.slice(0, 200)}`, attempt);
      throw e; // infrastructure: BullMQ's bounded retry
    }

    const started = Date.now();
    const walked = new Set(rec.roots_walked.map((r) => r.root));
    let walkedNow = 0;
    for (const root of rec.roots) {
      if (walked.has(root)) continue;
      if (Date.now() - started > maxElapsed) {
        await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', `budget: max_elapsed_ms ${maxElapsed} reached before every corrected object was walked; the next delivery resumes from the checkpoint`, attempt);
        return;
      }
      if (this.fault === 'before_root') { this.fault = null; await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', 'fault: injected infrastructure fault before the root (test)', attempt); throw new Error('injected infrastructure fault before the root (test)'); }
      try {
        await this.pipeline.write(this.env(principal, tenantId, domainId, root, correlationId), principal,
          { scope: 'DOMAIN', tenantId, domainId, action: 'graph.impact.propagate', objectType: 'INV', objectId: root }, GraphCapability.impact,
          async (cap, scope): Promise<WriteEffect<{ skipped: boolean; invalidationId: string | null }>> => {
            // The checkpoint: locked until the impact record commits; false = already walked for this event.
            const begun = await cap.propagationRootBegin({ eventId: p.event_id, tenantId, domainId, root });
            if (!begun) return { result: { skipped: true, invalidationId: null }, targetType: 'INV', targetId: null, targetVersion: null, outboxEvent: null };
            const r = await this.impact.propagate(cap, scope, { triggerKind: 'evidence_correction', triggerObjectId: root, correctionCaseId: caseId, actor: principal.principalId, correlationId });
            await cap.propagationRootDone({ eventId: p.event_id, tenantId, domainId, root, invalidationId: r.invalidationId, truncated: r.truncated });
            return { result: { skipped: false, invalidationId: r.invalidationId }, targetType: 'INV', targetId: r.invalidationId, targetVersion: '1',
                     outboxEvent: { eventType: 'DependencyInvalidated',
                                    payload: { invalidation_id: r.invalidationId, trigger: root, assumptions: r.assumptions.length, objectives: r.objectives.length,
                                               automatic: true, event_id: p.event_id, agent_id: rec.agent?.agent_id, agent_version: rec.agent?.agent_version, code_digest: rec.agent?.code_digest } } };
          });
      } catch (e) {
        if (e instanceof HttpException && e.getStatus() === 403) {
          await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', 'authority refused mid-walk: the grant no longer covers this walk; operator-initiated propagation remains available', attempt);
          return;
        }
        await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', `fault: ${(e as Error).message.slice(0, 200)}`, attempt);
        throw e; // infrastructure: BullMQ retries from the checkpoint
      }
      walkedNow += 1;
      if (this.fault === 'after_first_root' && walkedNow === 1) { this.fault = null; await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', 'fault: injected infrastructure fault after the first root (test)', attempt); throw new Error('injected infrastructure fault after the first root (test)'); }
      // The session follows the walk's progress: re-verified at every committed root.
      const until = await this.sessions.extendRunSession({ sessionId: principal.sessionId, principalId: principal.principalId, agentId: rec.agent.agent_id, tenantId, domainId, correlationId });
      if (until === null) {
        await this.finish(p.event_id, tenantId, domainId, caseId, 'failed', 'agent grant revoked during the walk; the remaining corrected objects were not walked; operator-initiated propagation remains available', attempt);
        return;
      }
    }
    await this.finish(p.event_id, tenantId, domainId, caseId, 'walked', null, attempt);
  }
}
