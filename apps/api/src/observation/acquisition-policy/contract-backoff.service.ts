/**
 * CP-6 B40 §AP (DP-10-005) — THE CONTRACT'S BACKOFF, applied by the scheduler after a scheduled run of an SRC@v4 source (called from
 * collection-worker.service.ts, its B40 ap block). The generic BullMQ retry (`attempts: 3`, exponential) never applied to a FAILED run (a
 * governed outcome returns normally) and applied to an execution FAULT without regard to the publisher; for a v4 contract both are replaced
 * by the contract's own schedule:
 *   * the run met a PUBLISHER'S 429 (the throttle stage recorded the rate-limited interval with the contract's backoff): the one retry it
 *     planned is enqueued at the end of the hold — none when the retries are exhausted (the cadence resumes after the hold);
 *   * the run FAILED because the source was UNAVAILABLE (a transport failure, a timeout, a name that does not resolve, a TLS failure — the
 *     lifecycle's `egress refused (<class>)`): an `unavailable` interval is recorded with the schedule's delay (attempt n of max_attempts) and,
 *     unless exhausted, a retry is enqueued at its end;
 *   * an execution FAULT (an exception that escaped the governed path): the same `unavailable` interval and retry, and BullMQ's generic
 *     retry is NOT used (the caller raises UnrecoverableError) — when the contract cannot even be read, the generic retry stays (fail safe).
 * A run refused by a hold (the authorize stage) records nothing new and plans nothing: the hold already says when collection resumes.
 * A v1–v3 contract is untouched (D8). Every record goes through the §AP ports under the scheduler's machine capability.
 */
import { Injectable, Logger } from '@nestjs/common';
import { newId } from '../../shared/ids.js';
import { SchedulerService, type CollectionJobPayload } from '../scheduling/scheduler.service.js';
import type { SrcV4AcquisitionPolicy } from '../sources/source-contract.js';
import { contractBackoff } from './policy-model.js';
import { AcquisitionPolicyStore } from './policy-store.js';

type Row = Record<string, unknown>;
const UNAVAILABLE = /^egress refused \((transport_failure|timeout|dns_failure|tls_failure)\)/;

export interface BackoffOutcome { action: 'none' | 'retry_enqueued' | 'recorded_no_retry'; reason: string; rateLimitId?: string; delaySeconds?: number; jobId?: string | null }

@Injectable()
export class ContractBackoffAp {
  private readonly log = new Logger('observation.acquisition-policy');

  constructor(private readonly store: AcquisitionPolicyStore, private readonly scheduler: SchedulerService) {}

  /** After a scheduled run's outcome is recorded: the contract's retry, when the contract is v4 and the outcome calls for one. */
  async afterOutcome(payload: CollectionJobPayload, outcome: { state: string; runId: string; reason?: string }, opened: boolean): Promise<BackoffOutcome> {
    const info = await this.store.afterRun({ tenantId: payload.tenantId, domainId: payload.domainId, sourceId: payload.sourceId,
      contractVersion: payload.contractVersion, runId: opened ? outcome.runId : null });
    if (info['v4'] !== true) return { action: 'none', reason: 'a v1–v3 contract keeps its recorded retry behaviour (D8)' };
    const rl = info['rate_limit'] as Row | null;
    if (opened && rl !== null) {
      if (rl['retry_planned'] !== true) return { action: 'recorded_no_retry', reason: `the rate-limited interval (attempt ${String(rl['attempt'])}) plans no retry${rl['exhausted'] === true ? ': retries exhausted' : ''}`, rateLimitId: String(rl['rate_limit_id']) };
      return this.enqueue(payload, String(rl['rate_limit_id']), Number(rl['applied_delay_seconds']), `the publisher's rate limit (attempt ${String(rl['attempt'])})`);
    }
    if (outcome.state === 'failed' && typeof outcome.reason === 'string' && UNAVAILABLE.test(outcome.reason)) {
      return this.unavailable(payload, opened ? outcome.runId : null, info, outcome.reason);
    }
    return { action: 'none', reason: `the outcome (${outcome.state}) calls for no contract retry` };
  }

  /** After an execution FAULT: true when the contract's retry replaces BullMQ's generic one (the caller then raises UnrecoverableError). */
  async afterFault(payload: CollectionJobPayload, openedRunId: string | null, error: unknown): Promise<boolean> {
    let info: Row;
    try {
      info = await this.store.afterRun({ tenantId: payload.tenantId, domainId: payload.domainId, sourceId: payload.sourceId, contractVersion: payload.contractVersion, runId: openedRunId });
    } catch {
      return false; // the contract could not be read: the generic retry stays (fail safe)
    }
    if (info['v4'] !== true) return false;
    const r = await this.unavailable(payload, openedRunId, info, `an execution fault: ${(error as Error)?.message?.slice(0, 200) ?? String(error)}`).catch((e: unknown) => {
      this.log.warn(`source ${payload.sourceId}: the contract's retry after a fault could not be planned: ${(e as Error).message.slice(0, 200)}`);
      return null;
    });
    return r !== null;
  }

  private async unavailable(payload: CollectionJobPayload, runId: string | null, info: Row, why: string): Promise<BackoffOutcome> {
    const backoff = info['backoff'] as SrcV4AcquisitionPolicy['backoff'] | null;
    if (backoff === null) return { action: 'none', reason: 'the v4 contract declares no backoff' };
    let applied = 0;
    const rec = await this.store.recordRateLimit(
      { tenantId: payload.tenantId, domainId: payload.domainId, sourceId: payload.sourceId, contractVersion: payload.contractVersion, runId, correlationId: newId() },
      { origin: 'unavailable', endpoint: null, status: null, retryAfterRaw: null, retryAfterSeconds: null },
      (attempt) => {
        const b = contractBackoff(backoff, attempt, null);
        applied = b.appliedDelaySeconds;
        return { ...b, reason: `the source was unavailable (${why.slice(0, 300)}); ${b.reason}` };
      });
    if (rec.retry_planned !== true) return { action: 'recorded_no_retry', reason: `unavailable (attempt ${rec.attempt}): retries exhausted`, rateLimitId: rec.rate_limit_id };
    return this.enqueue(payload, rec.rate_limit_id, applied, `the source unavailable (attempt ${rec.attempt})`);
  }

  private async enqueue(payload: CollectionJobPayload, rateLimitId: string, delaySeconds: number, what: string): Promise<BackoffOutcome> {
    const jobId = await this.scheduler.enqueueContractRetry(payload.tenantId, payload.domainId, { ...payload, correlationId: newId() }, delaySeconds, rateLimitId);
    return { action: jobId === null ? 'recorded_no_retry' : 'retry_enqueued', rateLimitId, delaySeconds, jobId,
      reason: jobId === null ? `${what}: the scheduler is disabled — no automatic retry; the hold applies` : `${what}: the contract's retry in ${delaySeconds} s` };
  }
}
