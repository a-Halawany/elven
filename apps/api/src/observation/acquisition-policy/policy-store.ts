/**
 * CP-6 B40 §AP — THE POLICY RECORDS' PORTS (0123 §AP.6), called by the run's own machinery: the authorize and throttle stages inside a run,
 * the scheduler after one. Each call is ONE short transaction on the commit pool under the BOUNDED MACHINE CAPABILITY the scheduler already
 * holds (observation.issue_schedule_capability — mode schedule, class scheduler; the 0038/0039 idiom the B1/B6/B7 consumers reuse); the
 * ports fence every in-run write by the run's lease (0056) and attribute it to the run's own agent. Nothing here is reachable from a request.
 * No external I/O happens inside these transactions (PHASE1_PLAN §5's rule): the stages fetch robots.txt BETWEEN them.
 */
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';

type Row = Record<string, unknown>;
export interface RunRef { tenantId: string; domainId: string; sourceId: string; contractVersion: number; runId: string; correlationId: string }

@Injectable()
export class AcquisitionPolicyStore {
  constructor(@Inject(COMMIT_DB) private readonly db: Db) {}

  private async one<T = Row>(reason: string, q: ReturnType<typeof sql<{ r: T }>>): Promise<T> {
    return this.db.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${reason}, 30)`.execute(tx);
      return (await q.execute(tx)).rows[0]?.r as T;
    });
  }

  /** The facts the authorize stage decides from (current state; fenced by the run's lease). */
  runInputs(r: RunRef): Promise<Row> {
    return this.one('acquisition policy: authorize', sql<{ r: Row }>`select observation.ap_run_inputs(${r.tenantId}::uuid, ${r.domainId}::uuid,
      ${r.sourceId}::uuid, ${r.contractVersion}::int, ${r.runId}::uuid) as r`);
  }

  recordAuthorization(r: RunRef, a: { form: 'command' | 'stream'; purposeId: string; decision: 'proceed' | 'refuse'; refusalClass: string | null; reason: string; record: Row }): Promise<string> {
    const id = newId();
    return this.one('acquisition policy: authorization', sql<{ r: string }>`select observation.record_acquisition_authorization(${id}::uuid, ${r.tenantId}::uuid,
      ${r.domainId}::uuid, ${r.sourceId}::uuid, ${r.contractVersion}::int, ${r.runId}::uuid, ${a.form}, ${a.purposeId}, ${a.decision}, ${a.refusalClass},
      ${a.reason}, ${JSON.stringify(a.record)}::jsonb, ${r.correlationId}::uuid) as r`).then((x) => String(x));
  }

  recordRobots(r: RunRef, a: { origin: string; outcome: 'fetched' | 'no_robots_file' | 'unavailable'; status: number | null; digest: string | null; bytes: number | null;
                               rules: unknown[]; via: 'replay' | 'live'; detail: string }): Promise<string> {
    const id = newId();
    return this.one('acquisition policy: robots', sql<{ r: string }>`select observation.record_robots_fetch(${id}::uuid, ${r.tenantId}::uuid, ${r.domainId}::uuid,
      ${r.sourceId}::uuid, ${r.contractVersion}::int, ${r.runId}::uuid, ${a.origin}, ${a.outcome}, ${a.status}::int, ${a.digest}, ${a.bytes}::int,
      ${JSON.stringify(a.rules)}::jsonb, ${a.via}, ${a.detail}, ${r.correlationId}::uuid) as r`).then((x) => String(x));
  }

  /** ES-31-007: the rights from current state, before a request. */
  rightsNow(r: RunRef): Promise<{ ok: boolean; class: 'rights' | 'licence' | 'policy' | null; reason: string; at?: string }> {
    return this.one('acquisition policy: rights re-check', sql<{ r: { ok: boolean; class: 'rights' | 'licence' | 'policy' | null; reason: string; at?: string } }>`select
      observation.ap_rights_now(${r.tenantId}::uuid, ${r.domainId}::uuid, ${r.sourceId}::uuid, ${r.contractVersion}::int, ${r.runId}::uuid) as r`);
  }

  /**
   * A rate-limited (or unavailable) attempt: the next attempt number is read, `compute` turns it into the contract's backoff, and the record
   * is written — in ONE transaction, under the source's lease row's order (the port refuses a stale attempt number).
   */
  async recordRateLimit(r: Omit<RunRef, 'runId'> & { runId: string | null }, a: {
    origin: 'publisher_429' | 'contract_rate' | 'unavailable'; endpoint: string | null; status: number | null; retryAfterRaw: string | null; retryAfterSeconds: number | null;
  }, compute: (attempt: number) => { retryAfterState: string; maxAttempts: number; scheduleDelaySeconds: number; appliedDelaySeconds: number; exhausted: boolean; retryPlanned: boolean; reason: string }): Promise<Row & { attempt: number; until: string; exhausted: boolean; retry_planned: boolean; rate_limit_id: string }> {
    const id = newId();
    return this.db.transaction().execute(async (tx) => {
      await sql`select observation.issue_schedule_capability(${'acquisition policy: rate limit'}, 30)`.execute(tx);
      const attempt = Number((await sql<{ n: number }>`select observation.ap_next_attempt(${r.tenantId}::uuid, ${r.domainId}::uuid, ${r.sourceId}::uuid,
        ${r.contractVersion}::int) as n`.execute(tx)).rows[0]?.n);
      const b = compute(attempt);
      return (await sql<{ r: Row & { attempt: number; until: string; exhausted: boolean; retry_planned: boolean; rate_limit_id: string } }>`select observation.record_rate_limit(
        ${id}::uuid, ${r.tenantId}::uuid, ${r.domainId}::uuid, ${r.sourceId}::uuid, ${r.contractVersion}::int, ${r.runId}::uuid, ${a.origin}, ${a.endpoint},
        ${a.status}::int, ${a.retryAfterRaw}, ${a.retryAfterSeconds}::int, ${b.retryAfterState}, ${attempt}::int, ${b.maxAttempts}::int,
        ${b.scheduleDelaySeconds}::int, ${b.appliedDelaySeconds}::int, ${null}::timestamptz, ${b.exhausted}::boolean, ${b.retryPlanned}::boolean, ${b.reason},
        ${r.correlationId}::uuid) as r`.execute(tx)).rows[0]!.r;
    });
  }

  /** The scheduler's question after a run (or a fault before one opened). */
  afterRun(a: { tenantId: string; domainId: string; sourceId: string; contractVersion: number; runId: string | null }): Promise<Row> {
    return this.one('acquisition policy: after run', sql<{ r: Row }>`select observation.ap_after_run(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.contractVersion}::int, ${a.runId}::uuid) as r`);
  }

  lastFingerprint(r: RunRef, pollKey: string): Promise<Row | null> {
    return this.one<Row | null>('acquisition policy: response check', sql<{ r: Row | null }>`select observation.ap_last_fingerprint(${r.tenantId}::uuid, ${r.domainId}::uuid,
      ${r.sourceId}::uuid, ${r.contractVersion}::int, ${r.runId}::uuid, ${pollKey}) as r`);
  }

  recordFingerprint(r: RunRef, a: { pollKey: string; mediaType: string | null; rootType: string; keysDigest: string | null; keyCount: number | null; bytes: number;
                                     digest: string; verdict: 'baseline' | 'consistent' | 'anomaly'; anomaly: unknown[] }): Promise<string> {
    const id = newId();
    return this.one('acquisition policy: response fingerprint', sql<{ r: string }>`select observation.record_response_fingerprint(${id}::uuid, ${r.tenantId}::uuid,
      ${r.domainId}::uuid, ${r.sourceId}::uuid, ${r.contractVersion}::int, ${r.runId}::uuid, ${a.pollKey}, ${a.mediaType}, ${a.rootType}, ${a.keysDigest},
      ${a.keyCount}::int, ${a.bytes}::int, ${a.digest}, ${a.verdict}, ${JSON.stringify(a.anomaly)}::jsonb, ${r.correlationId}::uuid) as r`).then((x) => String(x));
  }
}
