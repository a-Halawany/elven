/**
 * CP-6 B40 §IN (0123 §IN) — THE INTAKE CAPABILITIES: the reads (observation.intake_review_queue, observation.intake_case_read,
 * observation.inspection_verdicts_read — each port re-checks the bound action `observation.inspection.read` and the caller's read scope) and
 * the approval act (observation.decide_upload — the port re-checks the bound action, the scope, the acting principal, the person, the role
 * and that the decider is not the uploader). One narrow interface per action class (the Phase 1 discipline). CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface IntakeReads {
  queue(a: { tenantId: string; domainId: string; state: string | null; limit: number }): Promise<Row>;
  caseRead(a: { tenantId: string; domainId: string; caseId: string }): Promise<Row>;
  verdicts(a: { tenantId: string; domainId: string; evdId: string; version: number | null }): Promise<Row>;
}
export interface UploadApprovalWrites {
  decide(a: { approvalId: string; tenantId: string; domainId: string; decision: 'approve' | 'decline'; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  /** The held upload's case (read inside the act's own transaction, so the route releases or rejects the case the approval names). */
  approvalCase(a: { approvalId: string }): Promise<{ case_id: string; state: string } | null>;
}

class IntakeCapabilityImpl implements IntakeReads, UploadApprovalWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql<{ r: Row }>>): Promise<Row> {
    return ((await q.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
  queue(a: { tenantId: string; domainId: string; state: string | null; limit: number }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.intake_review_queue(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.state}::text, ${a.limit}::int) as r`);
  }
  caseRead(a: { tenantId: string; domainId: string; caseId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.intake_case_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid) as r`);
  }
  verdicts(a: { tenantId: string; domainId: string; evdId: string; version: number | null }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.inspection_verdicts_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.evdId}::uuid, ${a.version}::int) as r`);
  }
  decide(a: { approvalId: string; tenantId: string; domainId: string; decision: 'approve' | 'decline'; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.decide_upload(${a.approvalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.reason},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async approvalCase(a: { approvalId: string }): Promise<{ case_id: string; state: string } | null> {
    const r = await sql<{ case_id: string; state: string }>`select case_id::text, state from observation.upload_approvals where approval_id = ${a.approvalId}::uuid`.execute(this.#tx);
    return r.rows[0] ?? null;
  }
}

export const IntakeCapability = {
  read(tx: Tx, action: string): IntakeReads { return new IntakeCapabilityImpl(tx, action); },
  approve(tx: Tx, action: string): UploadApprovalWrites { return new IntakeCapabilityImpl(tx, action); },
};
