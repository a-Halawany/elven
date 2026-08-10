/**
 * Audit query / verify / seal / intake — CP-AUD-01 (ADR-P0-09; Gate-2 §1/§4/§6).
 *
 * Authority split:
 *   query        — APP pool, inside the caller's governed transaction; the
 *                  mask_secret_metadata obligation is EXECUTED as a sanitized
 *                  projection (ES-13-004).
 *   verify/seal  — VERIFIER pool (eye_verifier). Verification locks the head,
 *                  recomputes the chain against exactly that head and seals
 *                  precisely what it verified. Tamper detection records
 *                  freeze + incident atomically; REPAIR (chain-head rebuild) is
 *                  NOT reachable from here — it belongs to the break-glass
 *                  recovery role which no application pool loads.
 *   intake       — IDENTITY pool. Sanitized failure evidence for
 *                  unauthenticated/rejected requests, with restart-durable
 *                  suppression accounting in audit.intake_suppression so
 *                  rate-limited drops can never be silently erased.
 */
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { auditRowHash, GENESIS_HASH, type AuditEventBody } from '@eye/contracts';
import { APP_DB, IDENTITY_DB, VERIFIER_DB } from '../shared/shared.module.js';
import type { Db, Tx as KyselyTx } from '../shared/db.js';
import type { AuditReads } from '../shared/capabilities.js';
import { newId } from '../shared/ids.js';
import { degradedAudit } from '../shared/degraded-store.js';

export const SYSTEM_PIPELINE_PRINCIPAL = 'workload:system.commit-pipeline';

export interface VerifyReport {
  partitionId: string;
  checked: number;
  ok: boolean;
  brokenAtSeq: number | null;
  headMatches: boolean | null;
  incidentId: string | null;
  verifiedHeadSeq: number | null;
  verifiedHeadHash: string | null;
  /** Gate-2.1 §7: the head the LEDGER claims vs the head RECOMPUTED from rows. */
  expectedHeadHash: string | null;
  calculatedHeadHash: string | null;
  expectedHeadSeq: number | null;
  calculatedHeadSeq: number | null;
  /** Machine-readable outcome class, so evidence never has to be inferred. */
  resultClass: 'verified' | 'partition_unknown' | 'chain_broken' | 'head_mismatch';
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
    @Inject(VERIFIER_DB) private readonly verifierDb: Db,
    @Inject(IDENTITY_DB) private readonly identityDb: Db,
  ) {}

  /** Obligation-aware query through the bounded capability. */
  async query(cap: AuditReads, opts: { limit: number; mask: boolean; correlationId?: string }): Promise<unknown[]> {
    let q = cap
      .readAuditEvents()
      .orderBy('partition_id' as never)
      .orderBy('audit_seq' as never, 'desc')
      .limit(Math.min(opts.limit, 500));
    q = opts.mask ? q.select([...SANITIZED_COLUMNS] as never) : q.selectAll();
    if (opts.correlationId !== undefined) q = q.where('correlation_id', '=', opts.correlationId as never);
    return q.execute();
  }

  /**
   * Verify against a STABLE SNAPSHOT (REPEATABLE READ) reading the head without
   * the append lock. This is deadlock-free against a governed transaction that
   * already holds the head lock to write its own evidence, while still giving a
   * consistent prefix: every row up to the snapshot's head is committed and no
   * later append can change what this transaction sees.
   */
  async verifyPartition(partitionId: string): Promise<VerifyReport> {
    return this.verifierDb.transaction().setIsolationLevel('repeatable read').execute(async (tx) => {
      await sql`select ctx.issue_verify(${partitionId}, false)`.execute(tx);
      return this.verifyChain(tx, partitionId, false);
    });
  }

  /**
   * Verify + seal in ONE transaction under the head lock: the seal covers
   * exactly the head that was verified. Intervening appends block on the head
   * lock until COMMIT, so nothing unverified can enter this seal.
   */
  async sealPartition(partitionId: string, sealer: string): Promise<{ sealed: boolean; reason: string }> {
    return this.verifierDb.transaction().execute(async (tx) => {
      await sql`select ctx.issue_verify(${partitionId}, true)`.execute(tx);
      const report = await this.verifyChain(tx, partitionId, true);
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
      await sql`select audit.append_seal(
        ${newId()}, ${partitionId}, ${start}, ${end}, ${report.verifiedHeadHash}, ${sealer}
      )`.execute(tx);
      return { sealed: true, reason: `sealed ${start}..${end}` };
    });
  }

  /**
   * Core verification: MUST run with system context.
   * `lockHead` = true for the sealing path (the seal must cover exactly the head
   * it verified); false for pure verification on a stable snapshot.
   */
  private async verifyChain(tx: KyselyTx, partitionId: string, lockHead: boolean): Promise<VerifyReport> {
    const head = (
      lockHead
        ? await sql<{ next_seq: string; head_hash: string; frozen: boolean }>`
            select * from audit.lock_head_for_seal(${partitionId})`.execute(tx)
        : await sql<{ next_seq: string; head_hash: string; frozen: boolean }>`
            select * from audit.read_head(${partitionId})`.execute(tx)
    ).rows[0];
    if (head === undefined) {
      // An UNKNOWN partition is not a successful verification of nothing.
      return {
        partitionId, checked: 0, ok: false, brokenAtSeq: null, headMatches: null,
        incidentId: null, verifiedHeadSeq: null, verifiedHeadHash: null,
        expectedHeadHash: null, calculatedHeadHash: null,
        expectedHeadSeq: null, calculatedHeadSeq: null,
        resultClass: 'partition_unknown',
      };
    }
    const headSeq = Number(head.next_seq) - 1;

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
      await sql`select audit.open_integrity_incident(
        ${incidentId}, ${partitionId}, ${brokenAtSeq ?? 0},
        ${rows.length > 0 ? Number(rows[rows.length - 1]!.audit_seq) : 0},
        ${JSON.stringify({
          broken_at_seq: brokenAtSeq,
          head_matches: headMatches,
          note: 'partition frozen; range must not be re-sealed as trusted; recover through the governed procedure',
        })}::jsonb
      )`.execute(tx);
      return {
        partitionId, checked: rows.length, ok: false, brokenAtSeq, headMatches,
        incidentId, verifiedHeadSeq: headSeq, verifiedHeadHash: head.head_hash,
        expectedHeadHash: head.head_hash, calculatedHeadHash: prev,
        expectedHeadSeq: headSeq, calculatedHeadSeq: expectedSeq - 1,
        resultClass: brokenAtSeq !== null ? 'chain_broken' : 'head_mismatch',
      };
    }
    return {
      partitionId, checked: rows.length, ok: true, brokenAtSeq: null, headMatches,
      incidentId: null, verifiedHeadSeq: headSeq, verifiedHeadHash: head.head_hash,
      expectedHeadHash: head.head_hash, calculatedHeadHash: prev,
      expectedHeadSeq: headSeq, calculatedHeadSeq: expectedSeq - 1,
      resultClass: 'verified',
    };
  }

  /**
   * Security-audit intake (ADR-P0-08 §7.2 failure path). Sanitized metadata
   * only: correlation, failure class, route/method, envelope-shape diagnostics.
   * NEVER credentials, tokens, payload content or client-declared scope.
   *
   * Rate-limit accounting is RESTART-DURABLE: audit.bump_suppression records
   * drops in the database, and the count of drops since the previous admitted
   * write rides on the next admitted event.
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
    await this.identityDb.transaction().execute(async (tx) => {
      await sql`select ctx.issue_identity_op('identity.security.intake', null::uuid,
        ${input.correlationId}::uuid, 60)`.execute(tx);
      await sql`select audit.commit_intake_event(
        'security.intake', 'request.rejected', ${input.resultCode},
        ${input.correlationId}::uuid, null::uuid,
        ${JSON.stringify({
          failure_class: input.failureClass,
          route: input.route,
          method: input.method,
          diagnostics: input.diagnostics.slice(0, 10).map((d) => d.slice(0, 200)),
          recorded_by: SYSTEM_PIPELINE_PRINCIPAL,
          suppressed_since_last: input.suppressedSinceLast,
        })}::jsonb
      )`.execute(tx);
    });
  }

  /** Restart-durable suppression accounting (Gate-2 §6). */
  async accountIntake(bucket: string, admitted: boolean): Promise<number> {
    try {
      return await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.security.intake', null::uuid,
          ${newId()}::uuid, 60)`.execute(tx);
        const r = (
          await sql<{ n: string }>`select audit.bump_suppression(${bucket}, ${admitted}) as n`.execute(tx)
        ).rows[0];
        return Number(r?.n ?? 0);
      });
    } catch (e) {
      // The counter itself is unavailable: record durably rather than lose the
      // fact that accounting was skipped.
      degradedAudit.record({
        kind: 'evidence_write_failed',
        correlationId: null, route: null, failureClass: 'intake_accounting', scope: null,
        detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
        suppressedCarried: 0,
      });
      return 0;
    }
  }

  /** Degraded-state snapshot for /readyz (never presented as healthy). */
  degradedState(): { degraded: boolean; since: string | null; incidents: number; lastError: string | null } {
    return degradedAudit.state();
  }

  /**
   * GOVERNED DEGRADED RECOVERY (Gate-2.2 C9).
   *
   * The production path back to healthy. For every unreconciled availability
   * incident it mints a RECOVERY capability bound to that exact incident and calls
   * the governed port, which reconciles the row and writes its integrity evidence
   * in the SAME transaction. Only when the ledger reports zero remaining
   * unreconciled incidents is the local degraded flag cleared — and it is cleared
   * by presenting that governed proof, so no local action can clear it alone.
   */
  async reconcileDegraded(reconciledBy: string, note: string): Promise<{
    reconciled: string[]; remainingUnreconciled: number; healthy: boolean;
  }> {
    const open = (
      await sql<{ id: string }>`select id from audit.unreconciled_incidents()`.execute(this.verifierDb)
    ).rows;
    const reconciled: string[] = [];
    let remaining = open.length;
    for (const incident of open) {
      const r = await this.verifierDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_recovery(${incident.id}::uuid)`.execute(tx);
        return (
          await sql<{ reconciled: boolean; remaining_unreconciled: number }>`
            select * from audit.reconcile_availability_incident_v2(
              ${incident.id}::uuid, ${reconciledBy}, ${note})`.execute(tx)
        ).rows[0];
      });
      if (r?.reconciled === true) {
        reconciled.push(incident.id);
        remaining = Number(r.remaining_unreconciled);
      }
    }
    // The local flag clears ONLY on governed proof that the ledger agrees.
    if (reconciled.length > 0 && remaining === 0) {
      degradedAudit.markRecovered({
        reconciledIncidentIds: reconciled,
        remainingUnreconciled: remaining,
        detail: `governed reconciliation by ${reconciledBy}`,
      });
    }
    return { reconciled, remainingUnreconciled: remaining, healthy: remaining === 0 };
  }
}
