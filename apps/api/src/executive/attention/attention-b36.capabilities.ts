/**
 * ATTENTION COMPLETION CAPABILITIES — CP-6 B36 part `attention` (0094 §A; F-P6-07 completes).
 *
 * The commitment capabilities' shape (commitment.capabilities.ts): one implementation, narrow interfaces, every write a SECURITY DEFINER
 * port asserting the caller's own bound action:
 *
 *   AttentionB36Reads        the queue under the context, the context, the degraded states, the holds, the resumptions, the acceptances,
 *                            the recovery routes, the forums (executive.attention.queue.read)
 *   ActResumeWrites          the settle failure recorded (executive.attention.item.act) and the resume (executive.attention.item.act.resume)
 *   PriorityWrites           accept-priority (executive.attention.item.accept_priority) — the route signs in the same write (SignatureWrites)
 *   HoldWrites               the hold after an evaluation (executive.attention.queue.evaluate) and the release (executive.attention.queue.release)
 *   RecoveryWrites           the recovery routes (executive.attention.queue.recover)
 *   ForumWrites              convene a forum (executive.forum.convene)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import type { SignatureWrites } from '../signatures/signature.service.js';

type Row = Record<string, unknown>;

abstract class AttentionB36Core {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  /** One SQL statement under the pipeline's bound action (the port asserts it) — the signer's `SignatureWrites.call` too. */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const rows = await this.call<{ r: Row }>(q);
    const r = rows[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface AttentionB36Reads {
  readonly action: string;
  readAttentionItems(): any;
  readAttentionItemActs(): any;
  readActResumptions(): any;
  readPriorityAcceptances(): any;
  readQueueHolds(): any;
  readRecoveryRoutes(): any;
  readRooms(): any;
  readRoomMembers(): any;
  readAttentionAgents(): any;
  now(): Promise<string>;
  /** /attention/queue: the context, the policy, the hold, the items served under the principal's context, the filtered counted. */
  queueRead(a: { principal: string; tenantId: string; domainId: string; limit: number }): Promise<Row>;
  queueContext(a: { principal: string; tenantId: string; domainId: string }): Promise<Row>;
  degradedStates(a: { tenantId: string; domainId: string }): Promise<Row>;
  forumQueue(a: { roomId: string; tenantId: string; domainId: string; principal: string; limit: number }): Promise<Row>;
  /** §0's read: the signatures of a subject. */
  signatureOf(a: { kind: string; subjectId: string; version: number }): Promise<Row[]>;
}
export interface ActResumeWrites extends AttentionB36Reads {
  recordSettleFailure(a: { actId: string; tenantId: string; domainId: string; failure: Row; actionReceipt: Row; actor: string; correlationId: string }): Promise<Row>;
  resumeAct(a: { resumptionId: string; actId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface PriorityWrites extends AttentionB36Reads, SignatureWrites {
  acceptPriority(a: { acceptanceId: string; itemId: string; tenantId: string; domainId: string; note: string | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface HoldWrites extends AttentionB36Reads {
  /** 0090 §A5's evaluation (executive.evaluate_attention_queue), called through this class so the hold follows it in the same write. */
  evaluateQueue(a: { evaluationId: string; tenantId: string; domainId: string; windowFrom: string | null; windowTo: string | null; minSample: number; actor: string; correlationId: string }): Promise<Row>;
  holdQueue(a: { holdId: string; tenantId: string; domainId: string; evaluationId: string; actor: string; correlationId: string }): Promise<Row>;
  releaseHold(a: { holdId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface RecoveryWrites extends AttentionB36Reads {
  recoverQueue(a: { routeId: string; tenantId: string; domainId: string; state: string; before: Row; note: string | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface ForumWrites extends AttentionB36Reads {
  conveneForum(a: { roomId: string; tenantId: string; domainId: string; title: string; members: string[]; period: string; context: Row; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

class AttentionB36CapabilityImpl extends AttentionB36Core implements ActResumeWrites, PriorityWrites, HoldWrites, RecoveryWrites, ForumWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  readAttentionItems(): any { return this.from('executive.attention_items'); }
  readAttentionItemActs(): any { return this.from('executive.attention_item_acts'); }
  readActResumptions(): any { return this.from('executive.attention_act_resumptions'); }
  readPriorityAcceptances(): any { return this.from('executive.attention_priority_acceptances'); }
  readQueueHolds(): any { return this.from('executive.attention_queue_holds'); }
  readRecoveryRoutes(): any { return this.from('executive.attention_recovery_routes'); }
  readRooms(): any { return this.from('executive.rooms_current'); }
  readRoomMembers(): any { return this.from('executive.room_members'); }
  readAttentionAgents(): any { return this.from('executive.agents'); }
  async now(): Promise<string> {
    const rows = await this.call<{ t: string }>(sql`select decision.iso(clock_timestamp()) as t`);
    return String(rows[0]?.t);
  }
  async queueRead(a: Parameters<AttentionB36Reads['queueRead']>[0]) {
    return this.one(sql`select executive.attention_queue_read(${a.principal}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.limit}::int) as r`, 'attention_queue_read');
  }
  async queueContext(a: Parameters<AttentionB36Reads['queueContext']>[0]) {
    return this.one(sql`select executive.queue_context(${a.principal}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid) as r`, 'queue_context');
  }
  async degradedStates(a: Parameters<AttentionB36Reads['degradedStates']>[0]) {
    return this.one(sql`select executive.attention_degraded_states(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`, 'attention_degraded_states');
  }
  async forumQueue(a: Parameters<AttentionB36Reads['forumQueue']>[0]) {
    return this.one(sql`select executive.forum_queue(${a.roomId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principal}::uuid, ${a.limit}::int) as r`, 'forum_queue');
  }
  async signatureOf(a: Parameters<AttentionB36Reads['signatureOf']>[0]) {
    const rows = await this.call<{ r: Row[] }>(sql`select executive.signature_of(${a.kind}, ${a.subjectId}::uuid, ${a.version}::int) as r`);
    return rows[0]?.r ?? [];
  }
  async recordSettleFailure(a: Parameters<ActResumeWrites['recordSettleFailure']>[0]) {
    return this.one(sql`select executive.record_act_settle_failure(${a.actId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.failure)}::jsonb, ${JSON.stringify(a.actionReceipt)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_act_settle_failure');
  }
  async resumeAct(a: Parameters<ActResumeWrites['resumeAct']>[0]) {
    return this.one(sql`select executive.resume_attention_act(${a.resumptionId}::uuid, ${a.actId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'resume_attention_act');
  }
  async acceptPriority(a: Parameters<PriorityWrites['acceptPriority']>[0]) {
    return this.one(sql`select executive.accept_priority(${a.acceptanceId}::uuid, ${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'accept_priority');
  }
  async evaluateQueue(a: Parameters<HoldWrites['evaluateQueue']>[0]) {
    return this.one(sql`select executive.evaluate_attention_queue(${a.evaluationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.windowFrom}::timestamptz, ${a.windowTo}::timestamptz, ${a.minSample}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'evaluate_attention_queue');
  }
  async holdQueue(a: Parameters<HoldWrites['holdQueue']>[0]) {
    return this.one(sql`select executive.hold_queue(${a.holdId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.evaluationId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'hold_queue');
  }
  async releaseHold(a: Parameters<HoldWrites['releaseHold']>[0]) {
    return this.one(sql`select executive.release_queue_hold(${a.holdId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'release_queue_hold');
  }
  async recoverQueue(a: Parameters<RecoveryWrites['recoverQueue']>[0]) {
    return this.one(sql`select executive.recover_queue(${a.routeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.state}, ${JSON.stringify(a.before)}::jsonb, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'recover_queue');
  }
  async conveneForum(a: Parameters<ForumWrites['conveneForum']>[0]) {
    return this.one(sql`select executive.convene_forum(${a.roomId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.members}::uuid[], ${a.period}, ${JSON.stringify(a.context)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'convene_forum');
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const AttentionB36Capability = {
  read(tx: Tx, action: string): AttentionB36Reads { return new AttentionB36CapabilityImpl(tx, action); },
  actResume(tx: Tx, action: string): ActResumeWrites { return new AttentionB36CapabilityImpl(tx, action); },
  priority(tx: Tx, action: string): PriorityWrites { return new AttentionB36CapabilityImpl(tx, action); },
  hold(tx: Tx, action: string): HoldWrites { return new AttentionB36CapabilityImpl(tx, action); },
  recovery(tx: Tx, action: string): RecoveryWrites { return new AttentionB36CapabilityImpl(tx, action); },
  forum(tx: Tx, action: string): ForumWrites { return new AttentionB36CapabilityImpl(tx, action); },
};
