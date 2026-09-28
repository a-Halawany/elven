/**
 * CP-6 B34 client — THE DURABLE WORKFLOW ENGINE, THE HUMAN TASKS AND COLLABORATION (migration 0090 §W; F-P6-14; PR-46-001..006,
 * CAP-EO-09/-10, PER-22).
 *
 * Everything shown is the SERVER's: a task's deadline and its escalation chain (the assignment ledger), an instance's pinned definition
 * and its committed transitions, the replay's verdict, a timer's firing and drift, a drill's verdict, a grant's purpose, audience ceiling
 * and expiry. The words here only render those facts; the page offers what the server may refuse, and shows the refusal as it states it
 * (a gate or commitment task completes through its OWNING action — the page does not offer Complete for it; the server refuses it too).
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };
type Row = Record<string, unknown>;

export const TASK_STATES = ['open', 'escalated', 'completed', 'cancelled', 'lapsed'] as const;
export const INSTANCE_STATUSES = ['running', 'completed', 'compensated', 'irreconcilable', 'cancelled'] as const;
export const DRILL_KINDS = ['restart_replay', 'duplicate_task', 'duplicate_timer', 'definition_change'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const VERDICTS = ['endorse', 'endorse_with_conditions', 'concerns', 'object'] as const;
/** The longest grant (days) — the server's bound too. */
export const MAX_GRANT_DAYS = 30;

export interface Assignment { from: string | null; to: string | null; reason: 'opened' | 'reassign' | 'escalate' | 'access_lost' | string; actor: string; at: string | null }
export interface HumanTask {
  task_id: string; kind: string; title: string; subject: Row; state: string; assignee: string | null; candidate_roles: string[]; deadline_at: string | null; escalation: Row;
  escalation_level: number; outcome: string | null; completed_by: string | null; completed_at: string | null; completion_evidence: Row | null; opened_by: string; opened_at: string | null;
  completes_through_owning_action: boolean; escalation_chain?: Assignment[];
}
export interface WorkflowTimer { timer_id: string; owner_kind: string; owner_id: string; kind: string; due_at: string | null; fired_at: string | null; drift_seconds: number | null; cancelled_at: string | null;
  state: 'pending' | 'fired' | 'cancelled' | string; firing: { outcome: string; tick_key: number | null; result: Row; at: string | null } | null; failures?: Array<{ attempt: number; error: string; at: string | null }> }
export interface WorkflowInstance {
  instance_id: string; def_key: string; def_version: number; def_digest: string; subject: Row; state: string; status: string; last_seq: number; started_at: string | null; updated_at: string | null;
  lease: { owner: string | null; until: string | null; live: boolean }; newest: { version: number; digest: string } | null; pinned_behind_newest: boolean;
}
export interface Transition { seq: number; kind: string; event: string; from: string | null; to: string; idempotency_key: string; effect_ref: string | null; details: Row; actor: string; at: string | null }
export interface Drill { drill_id: string; kind: string; instance_id: string | null; verdict: 'pass' | 'fail' | string; observations: Row; run_by: string; run_at: string | null }
export interface WorkflowDefinition { definition_id: string; def_key: string; version: number; digest: string; spec: Row; owner: string; escalation: string; supersedes_version: number | null; reason: string;
  published_at: string | null; running_pinned: number; instances_pinned: number }
export interface Grant { grant_id: string; principal: string; purpose: string; audience_ceiling: string; state: string; expires_at: string | null; invitation_expires_at: string | null; invited_at: string | null;
  accepted_at: string | null; revoked_at: string | null; revoke_reason: string | null; lapsed_at: string | null; contact_label: string; live: boolean; days_left: number | null }
export interface Workspace { workspace_id: string; title: string; subject: Row; purpose: string; classification_ceiling: string; owner: string; state: string; opened_at: string | null; participants?: number; grant?: Grant }
export interface WorkspaceDetail {
  now: string; viewer: { affiliation: 'member' | 'external'; principal: string; ceiling: string; clearance: string }; workspace: Workspace;
  participants: Array<{ principal: string; role: string; affiliation: string; grant_id: string | null; added_at: string | null; removed_at: string | null; removal_reason: string | null; standing: string }>;
  threads: Array<{ thread_id: string; title: string; opened_by: string; opened_at: string | null; messages: Array<{ message_id: string; author: string; affiliation: string; body: string; posted_at: string | null }> }>;
  artifacts: Array<{ artifact_id: string; key: string; version: number; title: string; kind: string; classification: string; content: string | null; object_ref: Row | null; withheld: string | null; added_at: string | null }>;
  reviews: Array<{ review_id: string; reviewer: string; affiliation: string; verdict: string; statement: string; task_id: string | null; recorded_at: string | null }>;
  tasks: HumanTask[]; grants: Grant[]; invitation_mail: Array<{ grant_id: string; to: string; channel: string; subject: string; synthetic: boolean; placed_at: string | null; note: string }>;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null, purpose = 'executive'): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: purpose, side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const workflow = {
  definitions: (s: Scope) => p<{ definitions: WorkflowDefinition[]; receipt: Receipt }>(s, '/executive/workflow/definitions/list', 'executive.workflow.read', 'WFD'),
  publish: (s: Scope, defKey: string, spec: Row, owner: string, escalation: string, reason: string) =>
    p<{ definition: Row; receipt: Receipt }>(s, '/executive/workflow/definitions/publish', 'executive.workflow.define', 'WFD', { def_key: defKey.trim(), spec, owner, escalation, reason: reason.trim() }),
  instances: (s: Scope, status: string | null = null) => p<{ now: string; instances: WorkflowInstance[]; receipt: Receipt }>(s, '/executive/workflow/instances/list', 'executive.workflow.read', 'WFI', status === null ? {} : { status }),
  instance: (s: Scope, id: string) => p<{ instance: WorkflowInstance; transitions: Transition[]; compensations: Row[]; timers: WorkflowTimer[]; drills: Drill[]; tasks: HumanTask[]; replay: Row | null; receipt: Receipt }>(
    s, `/executive/workflow/instances/${id}/get`, 'executive.workflow.read', 'WFI', {}, id),
  start: (s: Scope, defKey: string, subject: Row, startKey: string) => p<{ instance: Row; receipt: Receipt }>(s, '/executive/workflow/instances/start', 'executive.workflow.start', 'WFI', { def_key: defKey, subject, start_key: startKey }),
  advance: (s: Scope, id: string, event: string, idempotencyKey: string, leaseOwner: string, expectedSeq: number | null) =>
    p<{ transition: Row; receipt: Receipt }>(s, `/executive/workflow/instances/${id}/advance`, 'executive.workflow.advance', 'WFI',
      { event, idempotency_key: idempotencyKey, lease_owner: leaseOwner, lease_seconds: 60, ...(expectedSeq === null ? {} : { expected_seq: expectedSeq }) }, id),
  compensate: (s: Scope, id: string, reason: string) => p<{ compensation: Row; receipt: Receipt }>(s, `/executive/workflow/instances/${id}/compensate`, 'executive.workflow.compensate', 'WFI', { reason: reason.trim() }, id),
  timers: (s: Scope, state: string | null = null) => p<{ now: string; timers: WorkflowTimer[]; counts: Record<string, number>; receipt: Receipt }>(s, '/executive/workflow/timers/list', 'executive.workflow.read', 'WFT', state === null ? {} : { state }),
  drills: (s: Scope) => p<{ drills: Drill[]; receipt: Receipt }>(s, '/executive/workflow/drills/list', 'executive.workflow.read', 'WDR'),
  drill: (s: Scope, kind: string, instanceId: string | null) => p<{ drill: Drill; receipt: Receipt }>(s, '/executive/workflow/drills/run', 'executive.workflow.drill', 'WDR', instanceId === null ? { kind } : { kind, instance_id: instanceId }),
};

export const tasks = {
  inbox: (s: Scope, all = false) => p<{ now: string; tasks: HumanTask[]; order: string; receipt: Receipt }>(s, '/executive/tasks/inbox', 'executive.task.read', 'HTK', all ? { all: true } : {}),
  get: (s: Scope, id: string) => p<{ task: HumanTask; escalation_chain: Assignment[]; events: Row[]; timers: WorkflowTimer[]; receipt: Receipt }>(s, `/executive/tasks/${id}/get`, 'executive.task.read', 'HTK', {}, id),
  /** The work moves to a member; a gate task's stored eligibility is re-checked by the server (reassignment moves work, never authority). */
  reassign: (s: Scope, id: string, to: string, reason: string) => p<{ task: Row; receipt: Receipt }>(s, `/executive/tasks/${id}/reassign`, 'executive.task.reassign', 'HTK', { to: to.trim(), reason: reason.trim() }, id),
  complete: (s: Scope, id: string, outcome: string, note: string, purpose = 'executive') =>
    p<{ task: Row; receipt: Receipt }>(s, `/executive/tasks/${id}/complete`, 'executive.task.complete', 'HTK', { outcome: outcome.trim(), note: note.trim() }, id, purpose),
};

/** The collaboration routes are made under the WORKSPACE's purpose (an external's grant is for it; any other purpose is refused). */
export const collab = {
  list: (s: Scope, purpose: string) => p<{ now: string; viewer: Row; workspaces: Workspace[]; receipt: Receipt }>(s, '/executive/collab/workspaces/list', 'executive.collab.read', 'CWS', {}, null, purpose),
  get: (s: Scope, id: string, purpose: string) => p<WorkspaceDetail & { receipt: Receipt }>(s, `/executive/collab/workspaces/${id}/get`, 'executive.collab.read', 'CWS', {}, id, purpose),
  open: (s: Scope, a: { title: string; subject: Row; purpose: string; ceiling: string }) =>
    p<{ workspace: Row; receipt: Receipt }>(s, '/executive/collab/workspaces/open', 'executive.collab.workspace.open', 'CWS', { title: a.title.trim(), subject: a.subject, purpose: a.purpose.trim(), classification_ceiling: a.ceiling }, null, a.purpose.trim()),
  participant: (s: Scope, id: string, purpose: string, principal: string, role: string, op: 'add' | 'remove') =>
    p<{ participant: Row; receipt: Receipt }>(s, `/executive/collab/workspaces/${id}/participants`, 'executive.collab.participant.set', 'CWS', { principal: principal.trim(), role, op }, id, purpose),
  post: (s: Scope, id: string, purpose: string, body: string, threadId: string | null, threadTitle: string) =>
    p<{ message: Row; receipt: Receipt }>(s, `/executive/collab/workspaces/${id}/messages`, 'executive.collab.discuss', 'CWS', threadId === null ? { body, thread_title: threadTitle.trim() } : { body, thread_id: threadId }, id, purpose),
  artifact: (s: Scope, id: string, purpose: string, a: { key: string; title: string; classification: string; content: string }) =>
    p<{ artifact: Row; receipt: Receipt }>(s, `/executive/collab/workspaces/${id}/artifacts`, 'executive.collab.discuss', 'CWS', { key: a.key.trim(), title: a.title.trim(), kind: 'note', classification: a.classification, content: a.content }, id, purpose),
  requestReview: (s: Scope, id: string, purpose: string, a: { reviewer: string; title: string; deadlineAt: string | null; escalateTo: string | null; requestKey: string }) =>
    p<{ task: Row; receipt: Receipt }>(s, `/executive/collab/workspaces/${id}/review-requests`, 'executive.collab.review.request', 'HTK', {
      reviewer: a.reviewer.trim(), title: a.title.trim(), ...(a.deadlineAt === null ? {} : { deadline_at: a.deadlineAt }),
      escalation: { ...(a.escalateTo === null || a.escalateTo.trim() === '' ? {} : { principal: a.escalateTo.trim() }), max_escalations: 1, extend_minutes: 1440 }, request_key: a.requestKey }, null, purpose),
  review: (s: Scope, id: string, purpose: string, a: { taskId: string | null; verdict: string; statement: string }) =>
    p<{ review: Row; receipt: Receipt }>(s, `/executive/collab/workspaces/${id}/reviews`, 'executive.collab.review', 'CWS', { ...(a.taskId === null ? {} : { task_id: a.taskId }), verdict: a.verdict, statement: a.statement.trim() }, id, purpose),
  invite: (s: Scope, id: string, purpose: string, a: { displayName: string; contactLabel: string; ceiling: string; days: number }) =>
    p<{ grant: Row; receipt: Receipt }>(s, `/executive/collab/workspaces/${id}/invitations`, 'executive.collab.invite', 'CGR',
      { display_name: a.displayName.trim(), contact_label: a.contactLabel.trim(), audience_ceiling: a.ceiling, expires_in_days: a.days }, null, purpose),
  revoke: (s: Scope, grantId: string, purpose: string, reason: string) => p<{ grant: Row; receipt: Receipt }>(s, `/executive/collab/grants/${grantId}/revoke`, 'executive.collab.grant.revoke', 'CGR', { reason: reason.trim() }, grantId, purpose),
  accept: (s: Scope, grantId: string, purpose: string, token: string, password: string) =>
    p<{ grant: Row; receipt: Receipt }>(s, `/executive/collab/grants/${grantId}/accept`, 'executive.collab.accept', 'CGR', { token, password }, grantId, purpose),
};

// ───────────────────────── the words (pure; unit-tested) ─────────────────────────
const H = 3_600_000; const DAY = 24 * H;
/** A task's deadline against the server's now: overdue by …, due in …, or no deadline. */
export function deadlineWords(deadlineAt: string | null | undefined, now: string): string {
  if (deadlineAt === null || deadlineAt === undefined) return 'no deadline';
  const d = new Date(deadlineAt).getTime() - new Date(now).getTime();
  const span = (ms: number) => (ms >= DAY ? `${Math.round((ms / DAY) * 10) / 10} d` : ms >= H ? `${Math.round((ms / H) * 10) / 10} h` : `${Math.max(1, Math.round(ms / 60_000))} min`);
  return d < 0 ? `overdue by ${span(-d)}` : `due in ${span(d)}`;
}
/** The escalation chain in words, oldest first: who held it and why it moved. */
export function chainWords(chain: Assignment[] | undefined, name: (id: string | null) => string = (id) => (id === null ? 'the candidate roles' : `${id.slice(0, 8)}…`)): string {
  if (chain === undefined || chain.length === 0) return 'no assignment recorded';
  return chain.map((a) => (a.reason === 'opened' ? `opened for ${name(a.to)}` : `${a.reason === 'escalate' ? 'escalated' : a.reason === 'access_lost' ? 'access lost —' : 'reassigned'} to ${name(a.to)}`)).join(' → ');
}
/** A task's state, three channels. */
export function taskMark(state: string, level = 0): { glyph: string; token: string; text: string } {
  const m: Record<string, { glyph: string; token: string }> = {
    open: { glyph: '○', token: '--eye-color-accent-default' }, escalated: { glyph: '⚑', token: '--eye-color-warning' }, completed: { glyph: '✓', token: '--eye-color-success' },
    cancelled: { glyph: '↩', token: '--eye-color-ink-muted' }, lapsed: { glyph: '✕', token: '--eye-color-critical' },
  };
  const s = m[state] ?? { glyph: '?', token: '--eye-color-ink-muted' };
  return { ...s, text: state === 'escalated' ? `ESCALATED (level ${level})` : state.toUpperCase() };
}
/** Whether this page offers Complete (a gate or commitment task completes through its owning action; the server refuses it too). */
export const completableHere = (kind: string): boolean => !kind.startsWith('gate.') && !kind.startsWith('commitment.');
/** A grant's standing in words: its state and, while live, the time left. */
export function grantWords(g: Pick<Grant, 'state' | 'expires_at' | 'live'>, now: string): string {
  if (g.state === 'revoked') return 'revoked — access is lost';
  if (g.state === 'lapsed') return 'lapsed at its expiry — access is lost';
  if (!g.live) return 'expired — access is lost';
  return `${g.state} · ${deadlineWords(g.expires_at, now).replace('due in', 'expires in')}`;
}
/** Whether a ceiling covers a classification (the server's rank: public < internal < confidential < restricted). */
export const covers = (ceiling: string, classification: string): boolean =>
  (CLASSIFICATIONS as readonly string[]).indexOf(classification) >= 0 && (CLASSIFICATIONS as readonly string[]).indexOf(classification) <= (CLASSIFICATIONS as readonly string[]).indexOf(ceiling);
/** A timer's state in words: pending with its due instant, fired with its drift and outcome, or cancelled. */
export function timerWords(t: Pick<WorkflowTimer, 'state' | 'due_at' | 'drift_seconds' | 'firing'>, now: string): string {
  if (t.state === 'cancelled') return 'cancelled — never fires';
  if (t.state === 'fired') return `fired once (${t.firing?.outcome ?? 'fired'}), ${t.drift_seconds === null ? 'drift not recorded' : `${Math.round(t.drift_seconds * 10) / 10} s after its due instant`}`;
  return `pending · ${deadlineWords(t.due_at, now).replace('overdue by', 'due since').replace('due in', 'fires in')}`;
}
/** A definition's spec parsed from the editor's text (the server validates it whole; this only says whether it is an object). */
export function parseSpec(text: string): { ok: true; spec: Row } | { ok: false; error: string } {
  try {
    const v = JSON.parse(text) as unknown;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: 'the spec is a JSON object {states, initial, terminal, transitions, timeouts?, compensations?}' };
    return { ok: true, spec: v as Row };
  } catch (e) {
    return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
}
