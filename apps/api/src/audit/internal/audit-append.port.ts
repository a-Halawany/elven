/**
 * Bounded internal append port for AUD records (ADR-P0-08 §7.3, ADR-P0-09).
 *
 * GATE-2: this port is now a thin wrapper over the BOUND database port
 * audit.commit_event. It exists only so the commit pipeline and bootstrap have
 * a typed call site; it can no longer carry authority fields.
 *
 * What changed and why: previously the application built the audit event object,
 * canonicalized it in TypeScript, computed the chain hash, and inserted the row.
 * That made the ledger only as trustworthy as the caller. Now the database
 * derives scope/tenant/domain/actor/session from the validated bound context,
 * builds the event, canonicalizes it with the in-database RFC 8785
 * implementation (canon.jcs) and computes the chain hash (canon.audit_row_hash)
 * inside the trusted boundary — so `event_jcs` is exactly the byte string that
 * was hashed, and a caller cannot fabricate an actor, a scope or a digest.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

export interface AppendedAuditRef {
  partitionId: string;
  auditSeq: number;
  rowHash: string;
}

export interface AuditEventRequest {
  eventType: string;
  action: string;
  outcome: 'success' | 'denied' | 'failure' | 'indeterminate';
  resultCode: string;
  targetType?: string | null;
  targetId?: string | null;
  targetVersion?: string | null;
  policyDecisionId?: string | null;
  policyVersion?: string | null;
  correlationId: string;
  causationId?: string | null;
  traceId?: string | null;
  requestDigest?: string | null;
  delegationId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Append AUD evidence through the bound database port. */
export async function appendAuditEvent(tx: Tx, req: AuditEventRequest): Promise<AppendedAuditRef> {
  const row = (
    await sql<{ partition_id: string; audit_seq: string; row_hash: string }>`
      select * from audit.commit_event(
        ${req.eventType}, ${req.action}, ${req.outcome}, ${req.resultCode},
        ${req.targetType ?? null}, ${req.targetId ?? null}, ${req.targetVersion ?? null},
        ${req.policyDecisionId ?? null}::uuid, ${req.policyVersion ?? null},
        ${req.correlationId}::uuid, ${req.causationId ?? null}::uuid,
        ${req.traceId ?? null}, ${req.requestDigest ?? null},
        ${req.delegationId ?? null}, ${JSON.stringify(req.metadata ?? {})}::jsonb
      )`.execute(tx)
  ).rows[0];
  if (row === undefined) throw new Error('audit.commit_event returned no row');
  return { partitionId: row.partition_id, auditSeq: Number(row.audit_seq), rowHash: row.row_hash };
}
