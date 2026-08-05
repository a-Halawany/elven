/**
 * Audit query / verify / seal / intake — CP-AUD-01 (ADR-P0-09, remediation R2c/R3).
 * - query: policy-filtered, obligation-aware (mask_secret_metadata projects
 *   sanitized columns only — the obligation is EXECUTED here, ES-13-004).
 * - verifyPartition: recompute the JCS hash chain AGAINST A LOCKED HEAD —
 *   the head row lock serializes with appends (advance/commit hold the same
 *   lock through COMMIT), so verification sees a stable, complete prefix.
 *   On tamper → audit.open_integrity_incident freezes the partition AND
 *   records the incident in one definer call (never a silent freeze).
 * - sealPartition: verify and seal in ONE transaction under the same head
 *   lock — the seal covers exactly the verified head; intervening appends
 *   cannot enter a seal without verification (append_seal re-checks the head
 *   under the lock and rejects if it moved).
 * - securityIntake: bounded sanitized intake for failed/unauthenticated
 *   requests (ADR-P0-08 §7.2) on the SYSTEM pool. Rate limiting AGGREGATES:
 *   each admitted event carries suppressed_since_last — drops are counted,
 *   never erased.
 */
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { auditRowHash, GENESIS_HASH, type AuditEventBody } from '@eye/contracts';
import { APP_DB, SYSTEM_DB } from '../shared/shared.module.js';
import type { Db, Tx } from '../shared/db.js';
import { newId } from '../shared/ids.js';
import { appendAuditEvent } from './internal/audit-append.port.js';

export const SYSTEM_PIPELINE_PRINCIPAL = 'workload:system.commit-pipeline';

export interface VerifyReport {
  partitionId: string;
  checked: number;
  ok: boolean;
  brokenAtSeq: number | null;
  headMatches: boolean | null;
  incidentId: string | null;
  /** Head (next_seq, head_hash) the verification was performed against. */
  verifiedHeadSeq: number | null;
  verifiedHeadHash: string | null;
}

const SANITIZED_COLUMNS = [
  'partition_id', 'audit_seq', 'scope', 'tenant_id', 'domain_id', 'event_type',
  'outcome', 'actor', 'action', 'result_code', 'correlation_id', 'occurred_at',
  'row_hash', 'hash_alg_version',
] as const;

@Injectable()
export class AuditService {
  constructor(
    @Inject(APP_DB) private readonly db: Db,
    @Inject(SYSTEM_DB) private readonly systemDb: Db,
  ) {}

  /** Obligation-aware query. mask=true → sanitized projection only. */
  async query(tx: Tx, opts: { limit: number; mask: boolean; correlationId?: string }): Promise<unknown[]> {
    let q = tx
      .selectFrom('audit.audit_events')
      .orderBy('partition_id')
      .orderBy('audit_seq', 'desc')
      .limit(Math.min(opts.limit, 500));
    q = opts.mask ? q.select([...SANITIZED_COLUMNS]) : q.selectAll();
    if (opts.correlationId !== undefined) q = q.where('correlation_id', '=', opts.correlationId);
    return q.execute();
  }

  /**
   * Recompute the chain against a locked head. On mismatch: atomic
   * freeze+incident via the definer port; the tampered range is never sealed.
   */
  async verifyPartition(partitionId: string): Promise<VerifyReport> {
    return this.systemDb.transaction().execute(async (tx) => {
      await sql`select public.eye_set_system_context('audit chain verification')`.execute(tx);
      return this.verifyLocked(tx, partitionId);
    });
  }

  /**
   * Verify + seal in ONE transaction under the head lock: the seal covers
   * exactly the head that was verified. Intervening appends block on the head
   * lock until COMMIT, so nothing unverified can enter this seal.
   */
  async sealPartition(partitionId: string, sealer: string): Promise<{ sealed: boolean; reason: string }> {
    return this.systemDb.transaction().execute(async (tx) => {
      await sql`select public.eye_set_system_context('audit partition sealing')`.execute(tx);
      const report = await this.verifyLocked(tx, partitionId);
      if (report.verifiedHeadSeq === null) return { sealed: false, reason: 'no such partition' };
      if (!report.ok) {
        return { sealed: false, reason: 'verification failed — tampered ranges are never sealed as trusted' };
      }
      const incident = await tx
        .selectFrom('audit.integrity_incidents')
        .select('id')
        .where('partition_id', '=', partitionId)
        .executeTakeFirst();
      if (incident !== undefined) {
        return { sealed: false, reason: 'open integrity incident — partition cannot be sealed' };
      }
      const last = await tx
        .selectFrom('audit.audit_seals')
        .select('range_end_seq')
        .where('partition_id', '=', partitionId)
        .orderBy('range_end_seq', 'desc')
        .executeTakeFirst();
      const start = last === undefined ? 1 : Number(last.range_end_seq) + 1;
      const end = report.verifiedHeadSeq;
      if (end < start) return { sealed: false, reason: 'nothing new to seal' };
      // Definer port re-checks (under the same lock) that the head is exactly
      // what we verified, and refuses when frozen or an incident exists.
      await sql`select audit.append_seal(
        ${newId()}, ${partitionId}, ${start}, ${end}, ${report.verifiedHeadHash}, ${sealer}
      )`.execute(tx);
      return { sealed: true, reason: `sealed ${start}..${end}` };
    });
  }

  /** Core verification: MUST run with system context; locks the head first. */
  private async verifyLocked(tx: Tx, partitionId: string): Promise<VerifyReport> {
    const head = (
      await sql<{ next_seq: string; head_hash: string; frozen: boolean }>`
        select * from audit.lock_head_for_seal(${partitionId})`.execute(tx)
    ).rows[0];
    if (head === undefined) {
      return { partitionId, checked: 0, ok: false, brokenAtSeq: null, headMatches: null, incidentId: null, verifiedHeadSeq: null, verifiedHeadHash: null };
    }
    const headSeq = Number(head.next_seq) - 1;

    // The head lock is held by appends through COMMIT: every row <= headSeq is
    // committed and visible; no new row can advance the head while we hold it.
    const rows = (await tx
      .selectFrom('audit.audit_events')
      .select(['audit_seq', 'event', 'previous_hash', 'row_hash'])
      .where('partition_id', '=', partitionId)
      .where('audit_seq', '<=', headSeq)
      .orderBy('audit_seq')
      .execute()) as Array<{ audit_seq: string; event: unknown; previous_hash: string; row_hash: string }>;

    let prev = GENESIS_HASH;
    let brokenAtSeq: number | null = null;
    let expectedSeq = 1;
    for (const r of rows) {
      const seq = Number(r.audit_seq);
      if (seq !== expectedSeq || r.previous_hash !== prev) {
        brokenAtSeq = seq;
        break;
      }
      const recomputed = auditRowHash({
        partitionId,
        auditSeq: seq,
        previousHash: prev,
        event: r.event as AuditEventBody,
      });
      if (recomputed !== r.row_hash) {
        brokenAtSeq = seq;
        break;
      }
      prev = r.row_hash;
      expectedSeq += 1;
    }

    const headMatches = brokenAtSeq === null && expectedSeq === headSeq + 1 && head.head_hash === prev;

    if (brokenAtSeq !== null || !headMatches) {
      const incidentId = newId();
      // Atomic freeze + incident record — a silent freeze is impossible.
      await sql`select audit.open_integrity_incident(
        ${incidentId},
        ${partitionId},
        ${brokenAtSeq ?? 0},
        ${rows.length > 0 ? Number(rows[rows.length - 1]!.audit_seq) : 0},
        ${JSON.stringify({
          broken_at_seq: brokenAtSeq,
          head_matches: headMatches,
          note: 'partition frozen; range must not be re-sealed as trusted; recover through the governed procedure',
        })}::jsonb
      )`.execute(tx);
      return { partitionId, checked: rows.length, ok: false, brokenAtSeq, headMatches, incidentId, verifiedHeadSeq: headSeq, verifiedHeadHash: head.head_hash };
    }
    return { partitionId, checked: rows.length, ok: true, brokenAtSeq: null, headMatches, incidentId: null, verifiedHeadSeq: headSeq, verifiedHeadHash: head.head_hash };
  }

  /**
   * Security-audit intake (ADR-P0-08 §7.2 failure path). Sanitized metadata only:
   * correlation, failure class, route/method, envelope-shape diagnostics.
   * NEVER credentials, tokens, payload content, or client-declared scope.
   * Runs on the SYSTEM pool in its own transaction (the failed request has no
   * transaction of its own). suppressedSinceLast makes rate-limit drops
   * visible: the count of failures dropped since the previous admitted event.
   */
  async securityIntake(input: {
    failureClass: 'envelope_invalid' | 'authentication_failed' | 'scope_invalid' | 'validation_failed';
    resultCode: string;
    correlationId: string;
    route: string;
    method: string;
    diagnostics: string[];
    suppressedSinceLast: number;
  }): Promise<void> {
    const event: AuditEventBody = {
      event_type: 'security.intake',
      outcome: 'failure',
      scope: 'PLATFORM', // unauthenticated/unresolvable requests chain to the platform partition
      tenant_id: null,
      domain_id: null,
      actor: 'anonymous',
      delegation_id: null,
      action: 'request.rejected',
      target_type: null,
      target_id: null,
      target_version: null,
      purpose_id: null,
      policy_decision_id: null,
      policy_version: null,
      result_code: input.resultCode,
      occurred_at: new Date().toISOString(),
      clock_quality: 'trusted',
      correlation_id: input.correlationId,
      causation_id: null,
      trace_id: null,
      request_digest: null,
      metadata: {
        failure_class: input.failureClass,
        route: input.route,
        method: input.method,
        diagnostics: input.diagnostics.slice(0, 10).map((d) => d.slice(0, 200)),
        recorded_by: SYSTEM_PIPELINE_PRINCIPAL,
        suppressed_since_last: input.suppressedSinceLast,
      },
    };
    await this.systemDb.transaction().execute(async (tx) => {
      await sql`select public.eye_set_system_context('security intake evidence')`.execute(tx);
      await appendAuditEvent(tx, event);
    });
  }
}
