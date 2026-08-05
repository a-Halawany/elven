/**
 * Bounded internal append port for AUD records (ADR-P0-08 §7.3, ADR-P0-09, R2b).
 * Importable ONLY by the audit module, the commit pipeline, and bootstrap.
 *
 * Since remediation R2, eye_app/eye_system hold NO direct INSERT on
 * audit_events: the append goes through the SECURITY DEFINER port
 * audit.append_event(partition, seq, event, prev, hash), which enforces
 * partition/event scope consistency AND that the caller's signed context is
 * authorized for the event's scope — forging cross-scope or inconsistent
 * evidence is structurally rejected at the database. commit_chain_head is
 * invoked inside the port under the same head lock.
 */
import { sql } from 'kysely';
import {
  auditRowHash,
  partitionIdFor,
  type AuditEventBody,
} from '@eye/contracts';
import type { Tx } from '../../shared/db.js';

export interface AuditAppendResult {
  partitionId: string;
  auditSeq: number;
  rowHash: string;
}

export async function appendAuditEvent(tx: Tx, event: AuditEventBody): Promise<AuditAppendResult> {
  const partitionId = partitionIdFor(event.scope, event.tenant_id);

  const head = (
    await sql<{ seq: string; prev_hash: string }>`
      select * from audit.advance_chain_head(${partitionId})`.execute(tx)
  ).rows[0];
  if (!head) throw new Error('audit allocator returned no head row');

  const auditSeq = Number(head.seq);
  const rowHash = auditRowHash({
    partitionId,
    auditSeq,
    previousHash: head.prev_hash,
    event,
  });

  await sql`select audit.append_event(
    ${partitionId}, ${auditSeq}, ${JSON.stringify(event)}::jsonb, ${head.prev_hash}, ${rowHash}
  )`.execute(tx);

  return { partitionId, auditSeq, rowHash };
}
