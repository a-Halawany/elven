/**
 * Bounded internal append port for AUD records (ADR-P0-08 §7.3, ADR-P0-09).
 * Importable ONLY by the audit module and the commit pipeline.
 *
 * Sequence inside the caller's transaction:
 *   1. audit.advance_chain_head(partition)  — locks head row, returns (seq, prev)
 *   2. compute row_hash = SHA-256(JCS({version, partition_id, audit_seq, previous_hash, event}))
 *   3. INSERT the immutable row (event_jcs canonical bytes; typed cols generated)
 *   4. audit.commit_chain_head(partition, seq, row_hash)
 * The head-row lock holds until COMMIT — appends serialize per partition and
 * a rollback leaves no gap. Audit durability precedes acknowledgement
 * (ES-55-002): the caller's transaction includes this append or nothing.
 */
import { sql } from 'kysely';
import {
  auditRowHash,
  jcsCanonicalize,
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

  await tx
    .insertInto('audit.audit_events')
    .values({
      partition_id: partitionId,
      audit_seq: auditSeq,
      event_jcs: jcsCanonicalize(event),
      previous_hash: head.prev_hash,
      row_hash: rowHash,
    })
    .execute();

  await sql`select audit.commit_chain_head(${partitionId}, ${auditSeq}, ${rowHash})`.execute(tx);

  return { partitionId, auditSeq, rowHash };
}
