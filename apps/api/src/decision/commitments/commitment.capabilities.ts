/**
 * COMMITMENT CAPABILITIES — CP-6 B34 part C (0090, F-P6-05): the commitment tracker and the governed execution handoff.
 *
 * The decision capabilities' shape: one implementation, narrow interfaces, every write a SECURITY DEFINER port asserting the
 * caller's own bound action:
 *
 *   CommitmentReads            the tracker, the timeline, the closure blockers, the rows (decision.commitment.read)
 *   ItemWrites                 declare / accept / complete an item; raise / decide an exception (their own actions each)
 *   ExecutionTargetWrites      declare / retire a SYNTHETIC execution target (decision.execution.target.*)
 *   HandoffDraftWrites         draft a handoff (decision.execution.draft)
 *   HandoffIssueWrites         issue it and record its first attempt (decision.execution.issue — C3, human-gated)
 *   CompensationWrites         assign / co-sign a compensation, reconcile a handoff
 *   ClosureWrites              propose / co-sign a closure (the co-sign admits CMT version 2: decision.commitment.close)
 *   ExecutionTickWrites        the tick's two steps (executive.attention.tick): the deadline sweep, the due retries and their attempts
 *   CommitmentSignalReads      the after-tick publication (decision.commitment.signal.publish)
 *   CommitmentSubscriberWrites the commitments consumer (decision.commitment.subscription.apply)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class CommitmentCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  protected async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
  protected async one(q: ReturnType<typeof sql>): Promise<Row> {
    const rows = await this.call<{ r: Row }>(q);
    const r = rows[0]?.r;
    if (r === undefined || r === null) throw new Error('the commitment port returned no row');
    return r;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CommitmentReads {
  readonly action: string;
  readItems(): any;
  readEvents(): any;
  readExceptions(): any;
  readTargets(): any;
  readHandoffs(): any;
  readAttempts(): any;
  readEffects(): any;
  readCompensations(): any;
  readClosures(): any;
  readCommitments(): any;
  tracker(a: { tenantId: string; domainId: string; at: string | null }): Promise<Row[]>;
  timeline(a: { tenantId: string; domainId: string; commitmentId: string; at: string | null }): Promise<Row[]>;
  closureBlockers(commitmentId: string): Promise<string | null>;
  /** The latest canonical version of an object (the CMT the closure supersedes). */
  canonicalLatest(a: { objectType: string; objectId: string }): Promise<Row | undefined>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Scoped { tenantId: string; domainId: string; actor: string; correlationId: string }
export interface ItemWrites extends CommitmentReads {
  declareItem(a: Scoped & { itemId: string; commitmentId: string; parentItemId: string | null; kind: string; title: string; owner: string; reviewer: string | null; dueAt: string; resourceIds: string[]; deliverables: unknown[] }): Promise<Row>;
  acceptItem(a: Scoped & { itemId: string; note: string | null }): Promise<Row>;
  completeItem(a: Scoped & { itemId: string; evidence: string; deliverables: unknown[] | null }): Promise<Row>;
  raiseException(a: Scoped & { itemId: string; kind: string; detail: string }): Promise<Row>;
  decideException(a: Scoped & { exceptionId: string; act: string; newDueAt: string | null; note: string }): Promise<Row>;
}
export interface ExecutionTargetWrites extends CommitmentReads {
  declareTarget(a: Scoped & { targetId: string; targetKey: string; label: string; endpoint: string; trustAnchorPem: string | null; credentialRef: string | null; synthetic: boolean }): Promise<Row>;
  retireTarget(a: Scoped & { targetKey: string; reason: string }): Promise<Row>;
}
export interface HandoffDraftWrites extends CommitmentReads {
  draftHandoff(a: Scoped & { handoffId: string; itemId: string; targetKey: string; lines: unknown[]; compensationId: string | null }): Promise<Row>;
}
export interface AttemptRecorder {
  recordAttempt(a: Scoped & { attemptId: string; handoffId: string; attempt: number; httpStatus: number | null; failureDetail: string | null; receipt: unknown; egress: unknown }): Promise<Row>;
}
export interface HandoffIssueWrites extends CommitmentReads, AttemptRecorder {
  issueHandoff(a: Scoped & { handoffId: string; payloadDigest: string }): Promise<Row>;
}
export interface CompensationWrites extends CommitmentReads {
  assignCompensation(a: Scoped & { compensationId: string; handoffId: string; kind: string; owner: string; dueAt: string; note: string }): Promise<Row>;
  cosignCompensation(a: Scoped & { compensationId: string; note: string }): Promise<Row>;
  reconcileHandoff(a: Scoped & { handoffId: string }): Promise<Row>;
}
export interface ClosureWrites extends CommitmentReads {
  proposeClosure(a: Scoped & { closureId: string; commitmentId: string; deliverables: unknown[]; statement: string }): Promise<Row>;
  cosignClosure(a: Scoped & { closureId: string; cmtHeaderDigest: string }): Promise<Row>;
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
}
export interface ExecutionTickWrites extends AttemptRecorder {
  sweepDeadlines(a: Omit<Scoped, 'actor'> & { actor: string }): Promise<Row>;
  dueHandoffs(a: { tenantId: string; domainId: string }): Promise<Row[]>;
}
export interface CommitmentSignalReads {
  readonly action: string;
  signals(a: { tenantId: string; domainId: string; eventIds: string[] }): Promise<Row[]>;
}
export interface CommitmentSubscriberWrites {
  readonly action: string;
  itemsRestingOn(a: { tenantId: string; domainId: string; objectiveId: string }): Promise<string[]>;
  applyObjectiveChange(a: Scoped & { itemId: string; objectiveId: string; sourceEventId: string }): Promise<Row>;
}

class CommitmentCapabilityImpl extends CommitmentCore implements ItemWrites, ExecutionTargetWrites, HandoffDraftWrites, HandoffIssueWrites, CompensationWrites, ClosureWrites,
  ExecutionTickWrites, CommitmentSignalReads, CommitmentSubscriberWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readItems(): any { return this.from('decision.commitment_items'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEvents(): any { return this.from('decision.commitment_events'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readExceptions(): any { return this.from('decision.commitment_exceptions'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readTargets(): any { return this.from('decision.execution_targets'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readHandoffs(): any { return this.from('decision.execution_handoffs'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readAttempts(): any { return this.from('decision.execution_attempts'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readEffects(): any { return this.from('decision.execution_effects'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCompensations(): any { return this.from('decision.execution_compensations'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readClosures(): any { return this.from('decision.commitment_closures'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readCommitments(): any { return this.from('decision.commitments'); }
  async tracker(a: { tenantId: string; domainId: string; at: string | null }): Promise<Row[]> {
    return this.call<Row>(sql`select * from decision.commitment_tracker(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.at}::timestamptz)`);
  }
  async timeline(a: { tenantId: string; domainId: string; commitmentId: string; at: string | null }): Promise<Row[]> {
    return this.call<Row>(sql`select * from decision.execution_timeline(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.commitmentId}::uuid, ${a.at}::timestamptz)`);
  }
  async closureBlockers(commitmentId: string): Promise<string | null> {
    const rows = await this.call<{ b: string | null }>(sql`select decision.commitment_closure_blockers(${commitmentId}::uuid) as b`);
    return rows[0]?.b ?? null;
  }
  async canonicalLatest(a: { objectType: string; objectId: string }): Promise<Row | undefined> {
    const rows = await this.call<Row>(sql`select to_jsonb(o) - 'content_digest' as o from objects.canonical_objects o where o.object_type = ${a.objectType} and o.object_id = ${a.objectId}::uuid order by o.object_version desc limit 1`);
    return rows[0]?.['o'] as Row | undefined;
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }

  declareItem(a: Parameters<ItemWrites['declareItem']>[0]): Promise<Row> {
    return this.one(sql`select decision.declare_commitment_item(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.commitmentId}::uuid, ${a.parentItemId}::uuid, ${a.kind}, ${a.title},
      ${a.owner}::uuid, ${a.reviewer}::uuid, ${a.dueAt}::timestamptz, ${a.resourceIds}::uuid[], ${JSON.stringify(a.deliverables)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  acceptItem(a: Parameters<ItemWrites['acceptItem']>[0]): Promise<Row> {
    return this.one(sql`select decision.accept_commitment_item(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.itemId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  completeItem(a: Parameters<ItemWrites['completeItem']>[0]): Promise<Row> {
    return this.one(sql`select decision.complete_commitment_item(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.itemId}::uuid, ${a.evidence}, ${a.deliverables === null ? null : JSON.stringify(a.deliverables)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  raiseException(a: Parameters<ItemWrites['raiseException']>[0]): Promise<Row> {
    return this.one(sql`select decision.raise_commitment_exception(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.itemId}::uuid, ${a.kind}, ${a.detail}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  decideException(a: Parameters<ItemWrites['decideException']>[0]): Promise<Row> {
    return this.one(sql`select decision.decide_commitment_exception(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.exceptionId}::uuid, ${a.act}, ${a.newDueAt}::timestamptz, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  declareTarget(a: Parameters<ExecutionTargetWrites['declareTarget']>[0]): Promise<Row> {
    return this.one(sql`select decision.declare_execution_target(${a.targetId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.targetKey}, ${a.label}, ${a.endpoint}, ${a.trustAnchorPem}::text,
      ${a.credentialRef}::text, ${a.synthetic}::boolean, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  retireTarget(a: Parameters<ExecutionTargetWrites['retireTarget']>[0]): Promise<Row> {
    return this.one(sql`select decision.retire_execution_target(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.targetKey}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  draftHandoff(a: Parameters<HandoffDraftWrites['draftHandoff']>[0]): Promise<Row> {
    return this.one(sql`select decision.draft_execution_handoff(${a.handoffId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.itemId}::uuid, ${a.targetKey}, ${JSON.stringify(a.lines)}::jsonb,
      ${a.compensationId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  issueHandoff(a: Parameters<HandoffIssueWrites['issueHandoff']>[0]): Promise<Row> {
    return this.one(sql`select decision.issue_execution_handoff(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.handoffId}::uuid, ${a.payloadDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  recordAttempt(a: Parameters<AttemptRecorder['recordAttempt']>[0]): Promise<Row> {
    return this.one(sql`select decision.record_execution_attempt(${a.attemptId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.handoffId}::uuid, ${a.attempt}::int, ${a.httpStatus}::int,
      ${a.failureDetail}::text, ${a.receipt === null || a.receipt === undefined ? null : JSON.stringify(a.receipt)}::jsonb, ${a.egress === null || a.egress === undefined ? null : JSON.stringify(a.egress)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  assignCompensation(a: Parameters<CompensationWrites['assignCompensation']>[0]): Promise<Row> {
    return this.one(sql`select decision.assign_execution_compensation(${a.compensationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.handoffId}::uuid, ${a.kind}, ${a.owner}::uuid,
      ${a.dueAt}::timestamptz, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  cosignCompensation(a: Parameters<CompensationWrites['cosignCompensation']>[0]): Promise<Row> {
    return this.one(sql`select decision.cosign_execution_compensation(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.compensationId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  reconcileHandoff(a: Parameters<CompensationWrites['reconcileHandoff']>[0]): Promise<Row> {
    return this.one(sql`select decision.reconcile_execution_handoff(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.handoffId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  proposeClosure(a: Parameters<ClosureWrites['proposeClosure']>[0]): Promise<Row> {
    return this.one(sql`select decision.propose_commitment_closure(${a.closureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.commitmentId}::uuid, ${JSON.stringify(a.deliverables)}::jsonb,
      ${a.statement}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  cosignClosure(a: Parameters<ClosureWrites['cosignClosure']>[0]): Promise<Row> {
    return this.one(sql`select decision.cosign_commitment_closure(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.closureId}::uuid, ${a.cmtHeaderDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  sweepDeadlines(a: Parameters<ExecutionTickWrites['sweepDeadlines']>[0]): Promise<Row> {
    return this.one(sql`select decision.sweep_commitment_deadlines(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async dueHandoffs(a: { tenantId: string; domainId: string }): Promise<Row[]> {
    const rows = await this.call<{ r: Row }>(sql`select r from decision.due_execution_handoffs(${a.tenantId}::uuid, ${a.domainId}::uuid) r`);
    return rows.map((x) => x.r);
  }
  async signals(a: { tenantId: string; domainId: string; eventIds: string[] }): Promise<Row[]> {
    const rows = await this.call<{ r: Row }>(sql`select r from decision.commitment_signals(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.eventIds}::uuid[]) r`);
    return rows.map((x) => x.r);
  }
  async itemsRestingOn(a: { tenantId: string; domainId: string; objectiveId: string }): Promise<string[]> {
    const rows = await this.call<{ i: string }>(sql`select i::text as i from decision.items_resting_on(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectiveId}::uuid) i`);
    return rows.map((x) => x.i);
  }
  applyObjectiveChange(a: Parameters<CommitmentSubscriberWrites['applyObjectiveChange']>[0]): Promise<Row> {
    return this.one(sql`select decision.apply_objective_change(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.itemId}::uuid, ${a.objectiveId}::uuid, ${a.sourceEventId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const CommitmentCapability = {
  read(tx: Tx, action: string): CommitmentReads { return new CommitmentCapabilityImpl(tx, action); },
  item(tx: Tx, action: string): ItemWrites { return new CommitmentCapabilityImpl(tx, action); },
  target(tx: Tx, action: string): ExecutionTargetWrites { return new CommitmentCapabilityImpl(tx, action); },
  draft(tx: Tx, action: string): HandoffDraftWrites { return new CommitmentCapabilityImpl(tx, action); },
  issue(tx: Tx, action: string): HandoffIssueWrites { return new CommitmentCapabilityImpl(tx, action); },
  compensation(tx: Tx, action: string): CompensationWrites { return new CommitmentCapabilityImpl(tx, action); },
  closure(tx: Tx, action: string): ClosureWrites { return new CommitmentCapabilityImpl(tx, action); },
  tick(tx: Tx, action: string): ExecutionTickWrites { return new CommitmentCapabilityImpl(tx, action); },
  signals(tx: Tx, action: string): CommitmentSignalReads { return new CommitmentCapabilityImpl(tx, action); },
  subscriber(tx: Tx, action: string): CommitmentSubscriberWrites { return new CommitmentCapabilityImpl(tx, action); },
};
