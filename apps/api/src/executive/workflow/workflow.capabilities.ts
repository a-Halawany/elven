/**
 * THE WORKFLOW, HUMAN-TASK AND COLLABORATION CAPABILITIES — CP-6 B34 part `workflow` (migration 0090 §W; F-P6-14).
 *
 * The same capability discipline as executive.capabilities.ts (a route receives exactly the capability its action names; every write
 * goes through a SECURITY DEFINER port that asserts that action), kept in its own module so the B34 parts do not share one hotspot:
 * the engine (definitions, instances, transitions, compensations, drills), the timer firing the attention tick's steps call, the human
 * tasks' reassign / complete, and the collaboration workspaces with their external collaborators.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class WorkflowCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  /** The executive capability's savepoint (executive.capabilities.ts): a handler's failure leaves the tick's transaction usable. */
  async withSavepoint<T>(name: string, run: () => Promise<T>): Promise<T> {
    const sp = name.replace(/[^a-z0-9_]/gi, '');
    await sql.raw(`savepoint ${sp}`).execute(this.#tx);
    try {
      const out = await run();
      await sql.raw(`release savepoint ${sp}`).execute(this.#tx);
      return out;
    } catch (e) {
      await sql.raw(`rollback to savepoint ${sp}`).execute(this.#tx);
      throw e;
    }
  }
  /** The database's clock (the deadline and expiry reads compare against it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
  /** The state refolded from the committed transitions under the pinned definition (an invoker read under RLS). */
  async replay(instanceId: string): Promise<Row | null> {
    const r = await sql<{ r: Row | null }>`select executive.workflow_replay(${instanceId}::uuid) as r`.execute(this.#tx);
    return r.rows[0]?.r ?? null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface WorkflowReads {
  readonly action: string;
  now(): Promise<string>;
  withSavepoint<T>(name: string, run: () => Promise<T>): Promise<T>;
  replay(instanceId: string): Promise<Row | null>;
  readDefinitions(): any;
  readInstances(): any;
  readTransitions(): any;
  readCompensations(): any;
  readTimers(): any;
  readTimerFirings(): any;
  readTimerFailures(): any;
  readDrills(): any;
  readTasks(): any;
  readTaskAssignments(): any;
  readTaskEvents(): any;
  readWorkspaces(): any;
  readParticipants(): any;
  readThreads(): any;
  readMessages(): any;
  readArtifacts(): any;
  readReviews(): any;
  readGrants(): any;
  readCollabEvents(): any;
  readInvitationMail(): any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface WorkflowWrites extends WorkflowReads {
  publishDefinition(a: { definitionId: string; tenantId: string; domainId: string; defKey: string; spec: Row; owner: string; escalation: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  startWorkflow(a: { instanceId: string; tenantId: string; domainId: string; defKey: string; subject: Row; startKey: string; actor: string; correlationId: string }): Promise<Row>;
  advanceWorkflow(a: { instanceId: string; tenantId: string; domainId: string; event: string; idempotencyKey: string; expectedSeq: number | null; leaseOwner: string; leaseSeconds: number;
                       effectRef: string | null; details: Row; actor: string; correlationId: string }): Promise<Row>;
  compensateWorkflow(a: { instanceId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  runDrill(a: { drillId: string; tenantId: string; domainId: string; kind: string; instanceId: string | null; actor: string; correlationId: string }): Promise<Row>;
}

export interface TaskWrites extends WorkflowReads {
  reassignTask(a: { taskId: string; tenantId: string; domainId: string; to: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  completeTask(a: { taskId: string; tenantId: string; domainId: string; outcome: string; evidence: Row; actor: string; correlationId: string }): Promise<Row>;
}

export interface CollabWrites extends WorkflowReads {
  openWorkspace(a: { workspaceId: string; tenantId: string; domainId: string; title: string; subject: Row; purpose: string; ceiling: string; actor: string; correlationId: string }): Promise<Row>;
  setParticipant(a: { workspaceId: string; tenantId: string; domainId: string; principal: string; role: string | null; op: 'add' | 'remove'; actor: string; correlationId: string }): Promise<Row>;
  postMessage(a: { messageId: string; threadId: string | null; newThreadTitle: string | null; tenantId: string; domainId: string; workspaceId: string; body: string; bodyDigest: string; mentions: string[];
                   actor: string; correlationId: string }): Promise<Row>;
  addArtifact(a: { artifactId: string; tenantId: string; domainId: string; workspaceId: string; key: string; title: string; kind: string; classification: string; content: string | null;
                   objectRef: Row | null; contentDigest: string; actor: string; correlationId: string }): Promise<Row>;
  requestReview(a: { taskId: string; tenantId: string; domainId: string; workspaceId: string; reviewer: string; title: string; deadlineAt: string | null; escalation: Row; requestKey: string;
                     actor: string; correlationId: string }): Promise<Row>;
  recordReview(a: { reviewId: string; tenantId: string; domainId: string; workspaceId: string; taskId: string | null; artifactId: string | null; verdict: string; statement: string; actor: string; correlationId: string }): Promise<Row>;
  /* B34-F1 (0091): the invitation is TWO acts — the owner's request (no identity write) and the identity administrator's provisioning
     (reserve → the identity authority creates the principal and its invitation credential → activate, which verifies what it wrote) */
  requestInvite(a: { grantId: string; tenantId: string; domainId: string; workspaceId: string; displayName: string; contactLabel: string; ceiling: string; expiresAt: string;
                     actor: string; correlationId: string }): Promise<Row>;
  reserveInvitee(a: { grantId: string; principalId: string; tenantId: string; domainId: string; loginName: string; actor: string; correlationId: string }): Promise<Row>;
  activateInvite(a: { grantId: string; tenantId: string; domainId: string; tokenHash: string; invitationExpiresAt: string; mailSubject: string; mailBodyDigest: string; actor: string;
                      correlationId: string }): Promise<Row>;
  /** Records the acceptance only: the credential is rotated by the identity authority (collab-identity.service.ts). */
  accept(a: { grantId: string; tenantId: string; domainId: string; tokenHash: string; actor: string; correlationId: string }): Promise<Row>;
  /** The external principals still holding a live credential or session although no live grant names them (0091 §7). */
  accessPending(a: { tenantId: string; domainId: string }): Promise<Row[]>;
  /* end B34-F1 */
  revokeGrant(a: { grantId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}

/** The tick steps' ports (each lists executive.attention.tick). */
export interface WorkflowTickWrites extends WorkflowReads {
  claimDueTimers(a: { tenantId: string; domainId: string; limit: number }): Promise<Row[]>;
  fireTimer(a: { timerId: string; tenantId: string; domainId: string; tickKey: number; tickRef: string; outcome: 'fired' | 'skipped'; result: Row; actor: string; correlationId: string }): Promise<Row>;
  recordTimerFailure(a: { timerId: string; tenantId: string; domainId: string; error: string; tickKey: number; tickRef: string; actor: string; correlationId: string }): Promise<Row>;
  escalateTask(a: { timerId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  remindTask(a: { timerId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  stepTimeout(a: { timerId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  lapseGrant(a: { timerId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  lapseExpiredGrants(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  /** B34-F1 (0091 §7): what the after-tick hook revokes through the identity authority. */
  accessPending(a: { tenantId: string; domainId: string }): Promise<Row[]>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class WorkflowCapabilityImpl extends WorkflowCore implements WorkflowWrites, TaskWrites, CollabWrites, WorkflowTickWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  readDefinitions(): any { return this.from('executive.workflow_definitions'); }
  readInstances(): any { return this.from('executive.workflow_instances'); }
  readTransitions(): any { return this.from('executive.workflow_transitions'); }
  readCompensations(): any { return this.from('executive.workflow_compensations'); }
  readTimers(): any { return this.from('executive.workflow_timers'); }
  readTimerFirings(): any { return this.from('executive.workflow_timer_firings'); }
  readTimerFailures(): any { return this.from('executive.workflow_timer_failures'); }
  readDrills(): any { return this.from('executive.workflow_drills'); }
  readTasks(): any { return this.from('executive.human_tasks'); }
  readTaskAssignments(): any { return this.from('executive.human_task_assignments'); }
  readTaskEvents(): any { return this.from('executive.human_task_events'); }
  readWorkspaces(): any { return this.from('executive.collab_workspaces'); }
  readParticipants(): any { return this.from('executive.collab_participants'); }
  readThreads(): any { return this.from('executive.collab_threads'); }
  readMessages(): any { return this.from('executive.collab_messages'); }
  readArtifacts(): any { return this.from('executive.collab_artifacts'); }
  readReviews(): any { return this.from('executive.collab_reviews'); }
  readGrants(): any { return this.from('executive.collab_grants'); }
  readCollabEvents(): any { return this.from('executive.collab_events'); }
  readInvitationMail(): any { return this.from('executive.collab_invitation_mail'); }

  async publishDefinition(a: Parameters<WorkflowWrites['publishDefinition']>[0]) {
    return this.one(sql`select executive.publish_workflow_definition(${a.definitionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.defKey}, ${JSON.stringify(a.spec)}::jsonb,
      ${a.owner}::uuid, ${a.escalation}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'publish_workflow_definition');
  }
  async startWorkflow(a: Parameters<WorkflowWrites['startWorkflow']>[0]) {
    return this.one(sql`select executive.start_workflow(${a.instanceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.defKey}, ${JSON.stringify(a.subject)}::jsonb, ${a.startKey},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'start_workflow');
  }
  async advanceWorkflow(a: Parameters<WorkflowWrites['advanceWorkflow']>[0]) {
    return this.one(sql`select executive.advance_workflow(${a.instanceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.event}, ${a.idempotencyKey}, ${a.expectedSeq}::int, ${a.leaseOwner},
      ${a.leaseSeconds}::int, ${a.effectRef}::uuid, ${JSON.stringify(a.details)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'advance_workflow');
  }
  async compensateWorkflow(a: Parameters<WorkflowWrites['compensateWorkflow']>[0]) {
    return this.one(sql`select executive.compensate_workflow(${a.instanceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'compensate_workflow');
  }
  async runDrill(a: Parameters<WorkflowWrites['runDrill']>[0]) {
    return this.one(sql`select executive.run_workflow_drill(${a.drillId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.instanceId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'run_workflow_drill');
  }
  async reassignTask(a: Parameters<TaskWrites['reassignTask']>[0]) {
    return this.one(sql`select executive.reassign_human_task(${a.taskId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.to}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reassign_human_task');
  }
  async completeTask(a: Parameters<TaskWrites['completeTask']>[0]) {
    return this.one(sql`select executive.complete_human_task(${a.taskId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${JSON.stringify(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'complete_human_task');
  }
  async openWorkspace(a: Parameters<CollabWrites['openWorkspace']>[0]) {
    return this.one(sql`select executive.open_collab_workspace(${a.workspaceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${JSON.stringify(a.subject)}::jsonb, ${a.purpose}, ${a.ceiling},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'open_collab_workspace');
  }
  async setParticipant(a: Parameters<CollabWrites['setParticipant']>[0]) {
    return this.one(sql`select executive.set_collab_participant(${a.workspaceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principal}::uuid, ${a.role}, ${a.op}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_collab_participant');
  }
  async postMessage(a: Parameters<CollabWrites['postMessage']>[0]) {
    return this.one(sql`select executive.post_collab_message(${a.messageId}::uuid, ${a.threadId}::uuid, ${a.newThreadTitle}, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.workspaceId}::uuid, ${a.body}, ${a.bodyDigest},
      ${a.mentions}::uuid[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'post_collab_message');
  }
  async addArtifact(a: Parameters<CollabWrites['addArtifact']>[0]) {
    return this.one(sql`select executive.add_collab_artifact(${a.artifactId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.workspaceId}::uuid, ${a.key}, ${a.title}, ${a.kind}, ${a.classification},
      ${a.content}, ${a.objectRef === null ? null : JSON.stringify(a.objectRef)}::jsonb, ${a.contentDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'add_collab_artifact');
  }
  async requestReview(a: Parameters<CollabWrites['requestReview']>[0]) {
    return this.one(sql`select executive.request_collab_review(${a.taskId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.workspaceId}::uuid, ${a.reviewer}::uuid, ${a.title}, ${a.deadlineAt}::timestamptz,
      ${JSON.stringify(a.escalation)}::jsonb, ${a.requestKey}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'request_collab_review');
  }
  async recordReview(a: Parameters<CollabWrites['recordReview']>[0]) {
    return this.one(sql`select executive.record_collab_review(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.workspaceId}::uuid, ${a.taskId}::uuid, ${a.artifactId}::uuid, ${a.verdict}, ${a.statement},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_collab_review');
  }
  /* B34-F1 (0091) */
  async requestInvite(a: Parameters<CollabWrites['requestInvite']>[0]) {
    return this.one(sql`select executive.request_collaborator(${a.grantId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.workspaceId}::uuid, ${a.displayName}, ${a.contactLabel}, ${a.ceiling},
      ${a.expiresAt}::timestamptz, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'request_collaborator');
  }
  async reserveInvitee(a: Parameters<CollabWrites['reserveInvitee']>[0]) {
    return this.one(sql`select executive.reserve_collaborator(${a.grantId}::uuid, ${a.principalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.loginName}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`,
      'reserve_collaborator');
  }
  async activateInvite(a: Parameters<CollabWrites['activateInvite']>[0]) {
    return this.one(sql`select executive.activate_collaborator(${a.grantId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.tokenHash}, ${a.invitationExpiresAt}::timestamptz, ${a.mailSubject},
      ${a.mailBodyDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'activate_collaborator');
  }
  async accept(a: Parameters<CollabWrites['accept']>[0]) {
    return this.one(sql`select executive.accept_collaboration(${a.grantId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.tokenHash}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'accept_collaboration');
  }
  async accessPending(a: { tenantId: string; domainId: string }): Promise<Row[]> {
    return (await this.one(sql`select jsonb_build_object('pending', executive.collab_access_pending(${a.tenantId}::uuid, ${a.domainId}::uuid)) as r`, 'collab_access_pending'))['pending'] as Row[];
  }
  /* end B34-F1 */
  async revokeGrant(a: Parameters<CollabWrites['revokeGrant']>[0]) {
    return this.one(sql`select executive.revoke_collaboration_grant(${a.grantId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'revoke_collaboration_grant');
  }
  async claimDueTimers(a: Parameters<WorkflowTickWrites['claimDueTimers']>[0]): Promise<Row[]> {
    return (await this.one(sql`select jsonb_build_object('timers', executive.claim_due_workflow_timers(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.limit}::int)) as r`, 'claim_due_workflow_timers'))['timers'] as Row[];
  }
  async fireTimer(a: Parameters<WorkflowTickWrites['fireTimer']>[0]) {
    return this.one(sql`select executive.fire_workflow_timer(${a.timerId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.tickKey}::bigint, ${a.tickRef}::uuid, ${a.outcome}, ${JSON.stringify(a.result)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'fire_workflow_timer');
  }
  async recordTimerFailure(a: Parameters<WorkflowTickWrites['recordTimerFailure']>[0]) {
    return this.one(sql`select executive.record_workflow_timer_failure(${a.timerId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.error}, ${a.tickKey}::bigint, ${a.tickRef}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_workflow_timer_failure');
  }
  async escalateTask(a: Parameters<WorkflowTickWrites['escalateTask']>[0]) {
    return this.one(sql`select executive.escalate_human_task(${a.timerId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'escalate_human_task');
  }
  async remindTask(a: Parameters<WorkflowTickWrites['remindTask']>[0]) {
    return this.one(sql`select executive.remind_human_task(${a.timerId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'remind_human_task');
  }
  async stepTimeout(a: Parameters<WorkflowTickWrites['stepTimeout']>[0]) {
    return this.one(sql`select executive.workflow_step_timeout(${a.timerId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'workflow_step_timeout');
  }
  async lapseGrant(a: Parameters<WorkflowTickWrites['lapseGrant']>[0]) {
    return this.one(sql`select executive.lapse_collaboration_grant(${a.timerId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'lapse_collaboration_grant');
  }
  async lapseExpiredGrants(a: Parameters<WorkflowTickWrites['lapseExpiredGrants']>[0]) {
    return this.one(sql`select executive.lapse_expired_collab_grants(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'lapse_expired_collab_grants');
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const WorkflowCapability = {
  read(tx: Tx, action: string): WorkflowReads { return new WorkflowCapabilityImpl(tx, action); },
  workflow(tx: Tx, action: string): WorkflowWrites { return new WorkflowCapabilityImpl(tx, action); },
  task(tx: Tx, action: string): TaskWrites { return new WorkflowCapabilityImpl(tx, action); },
  collab(tx: Tx, action: string): CollabWrites { return new WorkflowCapabilityImpl(tx, action); },
  /** The attention tick's workflow steps (20, 22): built from the tick's own transaction (bound to executive.attention.tick). */
  tick(tx: Tx, action: string): WorkflowTickWrites { return new WorkflowCapabilityImpl(tx, action); },
};
