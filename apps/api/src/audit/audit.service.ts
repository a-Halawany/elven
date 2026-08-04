/**
 * Audit query / verify / seal / intake — CP-AUD-01 (ADR-P0-09).
 * - query: policy-filtered, obligation-aware (mask_secret_metadata projects
 *   sanitized columns only — the obligation is EXECUTED here, ES-13-004).
 * - verifyPartition: recompute the JCS hash chain; on tamper → freeze the
 *   partition, preserve copies (ledger is immutable), raise an integrity
 *   incident, and NEVER seal the tampered range.
 * - sealPartition: periodic PRE-INCIDENT trusted checkpoint.
 * - securityIntake: bounded sanitized intake for failed/unauthenticated
 *   requests (ADR-P0-08 §7.2) — its own small transaction under the system
 *   workload principal; never stores credentials/payloads/client scope.
 */
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { auditRowHash, GENESIS_HASH, type AuditEventBody } from '@eye/contracts';
import { APP_DB } from '../shared/shared.module.js';
import type { Db, Tx } from '../shared/db.js';
import { newId } from '../shared/ids.js';
import type { ScopeContext } from '../shared/scope.js';
import { appendAuditEvent } from './internal/audit-append.port.js';

export const SYSTEM_PIPELINE_PRINCIPAL = 'workload:system.commit-pipeline';

export interface VerifyReport {
  partitionId: string;
  checked: number;
  ok: boolean;
  brokenAtSeq: number | null;
  headMatches: boolean | null;
  incidentId: string | null;
}

const SANITIZED_COLUMNS = [
  'partition_id', 'audit_seq', 'scope', 'tenant_id', 'domain_id', 'event_type',
  'outcome', 'actor', 'action', 'result_code', 'correlation_id', 'occurred_at',
  'row_hash', 'hash_alg_version',
] as const;

@Injectable()
export class AuditService {
  constructor(@Inject(APP_DB) private readonly db: Db) {}

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

  /** Recompute the chain. On mismatch: freeze + incident + no re-seal (correction #4). */
  async verifyPartition(partitionId: string): Promise<VerifyReport> {
    return this.db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
      const rows = (await tx
        .selectFrom('audit.audit_events')
        .select(['audit_seq', 'event', 'previous_hash', 'row_hash'])
        .where('partition_id', '=', partitionId)
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

      const head = await tx
        .selectFrom('audit.audit_chain_heads')
        .select(['next_seq', 'head_hash'])
        .where('partition_id', '=', partitionId)
        .executeTakeFirst();
      const headMatches =
        head === undefined ? null : brokenAtSeq === null && Number(head.next_seq) === expectedSeq && head.head_hash === prev;

      if (brokenAtSeq !== null || headMatches === false) {
        const incidentId = newId();
        await sql`select audit.freeze_partition(${partitionId})`.execute(tx);
        await tx
          .insertInto('audit.integrity_incidents')
          .values({
            id: incidentId,
            partition_id: partitionId,
            range_start_seq: brokenAtSeq ?? 0,
            range_end_seq: rows.length > 0 ? Number(rows[rows.length - 1]!.audit_seq) : 0,
            details: JSON.stringify({
              broken_at_seq: brokenAtSeq,
              head_matches: headMatches,
              note: 'partition frozen; range must not be re-sealed as trusted; recover through the governed procedure',
            }),
          })
          .execute();
        return { partitionId, checked: rows.length, ok: false, brokenAtSeq, headMatches, incidentId };
      }
      return { partitionId, checked: rows.length, ok: true, brokenAtSeq: null, headMatches, incidentId: null };
    });
  }

  /** Periodic pre-incident checkpoint. Refuses to seal when an incident overlaps or verification fails. */
  async sealPartition(partitionId: string, sealer: string): Promise<{ sealed: boolean; reason: string }> {
    const report = await this.verifyPartition(partitionId);
    if (!report.ok) return { sealed: false, reason: 'verification failed — tampered ranges are never sealed as trusted' };
    return this.db.transaction().execute(async (tx) => {
      await sql`select set_config('eye.scope', 'PLATFORM', true)`.execute(tx);
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
      const head = await tx
        .selectFrom('audit.audit_chain_heads')
        .select(['next_seq', 'head_hash'])
        .where('partition_id', '=', partitionId)
        .executeTakeFirst();
      if (head === undefined) return { sealed: false, reason: 'no such partition' };
      const start = last === undefined ? 1 : Number(last.range_end_seq) + 1;
      const end = Number(head.next_seq) - 1;
      if (end < start) return { sealed: false, reason: 'nothing new to seal' };
      await tx
        .insertInto('audit.audit_seals')
        .values({
          id: newId(),
          partition_id: partitionId,
          range_start_seq: start,
          range_end_seq: end,
          head_hash: head.head_hash,
          sealer,
        })
        .execute();
      return { sealed: true, reason: `sealed ${start}..${end}` };
    });
  }

  /**
   * Security-audit intake (ADR-P0-08 §7.2 failure path). Sanitized metadata only:
   * correlation, failure class, route/method, envelope-shape diagnostics.
   * NEVER credentials, tokens, payload content, or client-declared scope.
   * Rate-bounded by the caller. Runs in its own transaction (the failed request
   * has no transaction of its own).
   */
  async securityIntake(input: {
    failureClass: 'envelope_invalid' | 'authentication_failed' | 'scope_invalid' | 'validation_failed';
    resultCode: string;
    correlationId: string;
    route: string;
    method: string;
    diagnostics: string[];
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
      },
    };
    await this.db.transaction().execute(async (tx) => {
      await appendAuditEvent(tx, event);
    });
  }
}
