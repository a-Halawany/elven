/**
 * THE DURABLE WORKFLOW ENGINE AND THE HUMAN TASK SERVICE — CP-6 B34 part `workflow` (migration 0090 §W1–§W3, §W6; F-P6-14; V6 IA-41-001
 * "durable, versioned state machines, timers, tasks, compensations, human gates, and terminal outcomes across failures and upgrades",
 * IA-41-003 "workflow engines persist orchestration state; business truth changes only through owning-service contracts", IA-41-005,
 * MS-12 "exactly-once committed state … transactional history and replay", SC-09, FM-23 "resume from committed transition"; V8 PR-46-001/-002,
 * CAP-EO-10 "crash, duplicate, and compensation tests").
 *
 * A DEFINITION is versioned: a spec {states, initial, terminal, transitions, timeouts?, compensations?} and its digest; publishing a change
 * is a NEW version, and an INSTANCE stays pinned to the digest it started with — a definition change never re-points a running instance.
 * A TRANSITION is appended to the instance's log exactly once per idempotency key (a duplicate worker's answer is `repeated`); a worker
 * holds a LEASE while it drives an instance, and when it crashes the lease expires and the next worker RESUMES from the committed seq (a
 * stale expected seq is refused). COMPENSATION walks the committed advances back: a declared compensation is recorded and handed to a named
 * human to confirm; an undeclared one makes the instance IRRECONCILABLE and escalates it. Nothing is inferred healthy: the REPLAY refolds
 * the state from the log under the pinned spec and says whether it is consistent.
 *
 * THE HUMAN TASKS (the prelude's service core) are read here — the inbox (what the caller holds, with its deadline and the escalation
 * chain) — and acted on: reassign (to a member; a gate.* task's stored eligibility re-checked: reassignment moves work, never authority) and
 * complete (never a gate.* or commitment.* task: those complete through the owning action).
 *
 * DRILLS (restart_replay, duplicate_task, duplicate_timer, definition_change) are executed in the port and recorded with their verdict.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { WorkflowReads } from './workflow.capabilities.js';

type Row = Record<string, unknown>;
export const INSTANCE_STATUSES = ['running', 'completed', 'compensated', 'irreconcilable', 'cancelled'] as const;
export const TASK_STATES = ['open', 'escalated', 'completed', 'cancelled', 'lapsed'] as const;
export const DRILL_KINDS = ['restart_replay', 'duplicate_task', 'duplicate_timer', 'definition_change'] as const;
/** The kinds a direct completion refuses (they complete through the owning action — the approval, the review, the checkpoint …). */
export const OWNING_ACTION_PREFIXES = ['gate.', 'commitment.'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const bad = (correlationId: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
const text = (p: Row, k: string): string => (typeof p[k] === 'string' ? (p[k] as string).trim() : '');
const limitOf = (v: unknown, dflt: number, max: number) => Math.min(Math.max(Number(v ?? dflt) || dflt, 1), max);
const uuidOf = (p: Row, k: string, correlationId: string, what: string): string => {
  const v = p[k];
  if (typeof v !== 'string' || !UUID.test(v)) bad(correlationId, `payload.${k} is ${what} (a uuid)`);
  return v as string;
};
export const assertUuid = (v: string, correlationId: string, what: string): string => { if (!UUID.test(v)) bad(correlationId, `the ${what} id is a uuid`); return v; };

/** The intake of a definition: its key, its spec (the port validates it whole — 22023 names the key), its owner and escalation principal, the reason. */
export function validateDefine(p: Row, correlationId: string): { defKey: string; spec: Row; owner: string; escalation: string; reason: string } {
  const defKey = text(p, 'def_key');
  if (!/^[a-z][a-z0-9_.-]{2,63}$/.test(defKey)) bad(correlationId, 'payload.def_key is a lower-case key of 3..64 characters');
  const spec = p['spec'];
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) bad(correlationId, 'payload.spec is the definition {states, initial, terminal, transitions, timeouts?, compensations?}');
  const reason = text(p, 'reason');
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, 'payload.reason says why the definition changes (8–2000 characters)');
  return { defKey, spec: spec as Row, owner: uuidOf(p, 'owner', correlationId, 'the definition\'s owner'), escalation: uuidOf(p, 'escalation', correlationId, 'the escalation principal'), reason };
}

/** The intake of a start: the definition key, the subject {kind, id} and the start's idempotency key. */
export function validateStart(p: Row, correlationId: string): { defKey: string; subject: Row; startKey: string } {
  const defKey = text(p, 'def_key');
  if (defKey === '') bad(correlationId, 'payload.def_key names the definition');
  const subject = p['subject'] as Row | undefined;
  if (subject === undefined || subject === null || typeof subject !== 'object' || typeof subject['kind'] !== 'string' || typeof subject['id'] !== 'string') bad(correlationId, 'payload.subject is {kind, id}');
  const startKey = text(p, 'start_key');
  if (startKey.length < 3 || startKey.length > 200) bad(correlationId, 'payload.start_key is the start\'s idempotency key (3–200 characters)');
  return { defKey, subject: subject as Row, startKey };
}

/** The intake of an advance: the event, its idempotency key, the worker (lease owner, lease seconds) and the seq it expects (optional). */
export function validateAdvance(p: Row, correlationId: string): { event: string; idempotencyKey: string; expectedSeq: number | null; leaseOwner: string; leaseSeconds: number; effectRef: string | null; details: Row } {
  const event = text(p, 'event');
  if (!/^[a-z][a-z0-9_.]{1,60}$/.test(event)) bad(correlationId, 'payload.event is a transition event of the pinned definition');
  const idempotencyKey = text(p, 'idempotency_key');
  if (idempotencyKey.length < 3 || idempotencyKey.length > 200) bad(correlationId, 'payload.idempotency_key is the transition\'s idempotency key (3–200 characters)');
  const es = p['expected_seq'];
  if (es !== undefined && es !== null && (typeof es !== 'number' || !Number.isInteger(es) || es < 0)) bad(correlationId, 'payload.expected_seq is the committed seq the worker last saw (an integer)');
  const leaseOwner = text(p, 'lease_owner');
  if (leaseOwner.length < 3 || leaseOwner.length > 120) bad(correlationId, 'payload.lease_owner names the worker (3–120 characters)');
  const ls = p['lease_seconds'] ?? 60;
  if (typeof ls !== 'number' || !Number.isInteger(ls) || ls < 1 || ls > 3600) bad(correlationId, 'payload.lease_seconds is 1..3600');
  const effectRef = p['effect_ref'];
  if (effectRef !== undefined && effectRef !== null && (typeof effectRef !== 'string' || !UUID.test(effectRef))) bad(correlationId, 'payload.effect_ref is the owning port\'s effect (a uuid)');
  const details = p['details'] ?? {};
  if (typeof details !== 'object' || details === null || Array.isArray(details)) bad(correlationId, 'payload.details is an object');
  return { event, idempotencyKey, expectedSeq: es === undefined || es === null ? null : Number(es), leaseOwner, leaseSeconds: Number(ls), effectRef: (effectRef as string | undefined) ?? null, details: details as Row };
}

export function validateReason(p: Row, correlationId: string, what: string): { reason: string } {
  const reason = text(p, 'reason');
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, `payload.reason says why ${what} (8–2000 characters)`);
  return { reason };
}

export function validateDrill(p: Row, correlationId: string): { kind: (typeof DRILL_KINDS)[number]; instanceId: string | null } {
  const kind = p['kind'];
  if (typeof kind !== 'string' || !(DRILL_KINDS as readonly string[]).includes(kind)) bad(correlationId, `payload.kind is one of ${DRILL_KINDS.join(', ')}`);
  const inst = p['instance_id'];
  if (kind !== 'duplicate_task' && (typeof inst !== 'string' || !UUID.test(inst))) bad(correlationId, `a ${String(kind)} drill names the instance it exercises (payload.instance_id)`);
  if (inst !== undefined && inst !== null && (typeof inst !== 'string' || !UUID.test(inst))) bad(correlationId, 'payload.instance_id is a uuid');
  return { kind: kind as (typeof DRILL_KINDS)[number], instanceId: (inst as string | undefined) ?? null };
}

/** The intake of a reassignment: the member it goes to, and why. */
export function validateReassign(p: Row, correlationId: string): { to: string; reason: string } {
  return { to: uuidOf(p, 'to', correlationId, 'the member the task goes to'), ...validateReason(p, correlationId, 'the task moves') };
}

/** The intake of a completion: the outcome word and the evidence {note, ref?}. The owning-action refusal is the port's (it knows the kind). */
export function validateComplete(p: Row, correlationId: string): { outcome: string; evidence: Row } {
  const outcome = text(p, 'outcome');
  if (!/^[a-z][a-z_]{2,40}$/.test(outcome)) bad(correlationId, 'payload.outcome is a snake_case word (done, confirmed, declined …)');
  const note = text(p, 'note');
  if (note.length < 8 || note.length > 4000) bad(correlationId, 'payload.note is the completion\'s evidence (8–4000 characters)');
  const ref = p['ref'];
  if (ref !== undefined && ref !== null && (typeof ref !== 'string' || ref.length > 300)) bad(correlationId, 'payload.ref is a reference (at most 300 characters)');
  return { outcome, evidence: { note, ...(typeof ref === 'string' ? { ref } : {}) } };
}

/** Whether a direct completion is refused for this kind (the port refuses it too; the page does not offer it). */
export const completesThroughOwningAction = (kind: string): boolean => OWNING_ACTION_PREFIXES.some((p) => kind.startsWith(p));

export function taskOf(r: Row): Row {
  return {
    task_id: r['task_id'], kind: r['kind'], title: r['title'], subject: r['subject'], state: r['state'], assignee: r['assignee_principal_id'] ?? null, candidate_roles: r['candidate_roles'] ?? [],
    deadline_at: iso(r['deadline_at']), escalation: r['escalation'] ?? {}, escalation_level: Number(r['escalation_level'] ?? 0), outcome: r['outcome'] ?? null, completed_by: r['completed_by'] ?? null,
    completed_at: iso(r['completed_at']), completion_evidence: r['completion_evidence'] ?? null, instance_id: r['instance_id'] ?? null, step: r['step'] ?? null, opened_by: r['opened_by'],
    opened_at: iso(r['opened_at']), updated_at: iso(r['updated_at']), completes_through_owning_action: completesThroughOwningAction(String(r['kind'])),
  };
}
const assignmentOf = (a: Row): Row => ({ from: a['from_principal'] ?? null, to: a['to_principal'] ?? null, reason: a['reason'], actor: a['actor_principal_id'], at: iso(a['at']) });
const eventOf = (e: Row): Row => ({ event: e['event'], actor: e['actor_principal_id'], details: e['details'], at: iso(e['at']) });
const timerOf = (t: Row, f: Row | undefined): Row & { state: string } => ({
  timer_id: t['timer_id'], owner_kind: t['owner_kind'], owner_id: t['owner_id'], kind: t['kind'], due_at: iso(t['due_at']), payload: t['payload'], fired_at: iso(t['fired_at']),
  drift_seconds: t['drift_seconds'] === null || t['drift_seconds'] === undefined ? null : Number(t['drift_seconds']), cancelled_at: iso(t['cancelled_at']),
  state: t['fired_at'] !== null && t['fired_at'] !== undefined ? 'fired' : t['cancelled_at'] !== null && t['cancelled_at'] !== undefined ? 'cancelled' : 'pending',
  firing: f === undefined ? null : { outcome: f['outcome'], tick_key: f['tick_key'] === null ? null : Number(f['tick_key']), result: f['result'], at: iso(f['at']) },
});

@Injectable()
export class WorkflowService {
  // ───────────────────────── the engine's reads (executive.workflow.read) ─────────────────────────
  /** The definitions, every version (newest first per key), with how many running instances each pins. */
  async definitions(cap: WorkflowReads, p: { def_key?: unknown }): Promise<Row> {
    let q = cap.readDefinitions().selectAll().orderBy('def_key' as never).orderBy('version' as never, 'desc');
    if (typeof p.def_key === 'string' && p.def_key !== '') q = q.where('def_key' as never, '=', p.def_key as never);
    const rows = (await q.execute()) as Row[];
    const inst = (await cap.readInstances().select(['definition_id', 'status'] as never).execute()) as Row[];
    return {
      definitions: rows.map((d) => ({
        definition_id: d['definition_id'], def_key: d['def_key'], version: d['version'], digest: d['digest'], spec: d['spec'], owner: d['owner_principal_id'], escalation: d['escalation_principal_id'],
        supersedes_version: d['supersedes_version'] ?? null, reason: d['reason'], published_by: d['published_by'], published_at: iso(d['published_at']),
        running_pinned: inst.filter((i) => i['definition_id'] === d['definition_id'] && i['status'] === 'running').length,
        instances_pinned: inst.filter((i) => i['definition_id'] === d['definition_id']).length,
      })),
    };
  }

  /** The instances (newest first): state, status, the pinned version and digest beside the newest one of the key, the lease. */
  async instances(cap: WorkflowReads, p: { status?: unknown; limit?: unknown }): Promise<Row> {
    let q = cap.readInstances().selectAll().orderBy('started_at' as never, 'desc').limit(limitOf(p.limit, 50, 200));
    if (typeof p.status === 'string' && (INSTANCE_STATUSES as readonly string[]).includes(p.status)) q = q.where('status' as never, '=', p.status as never);
    const rows = (await q.execute()) as Row[];
    const defs = (await cap.readDefinitions().select(['def_key', 'version', 'digest'] as never).execute()) as Row[];
    const now = await cap.now();
    return { now, instances: rows.map((i) => this.instanceOf(i, defs, now)) };
  }

  private instanceOf(i: Row, defs: Row[], now: string): Row {
    const newest = defs.filter((d) => d['def_key'] === i['def_key']).sort((a, b) => Number(b['version']) - Number(a['version']))[0];
    const leaseUntil = iso(i['lease_until']);
    return {
      instance_id: i['instance_id'], def_key: i['def_key'], def_version: i['def_version'], def_digest: i['def_digest'], subject: i['subject'], state: i['state'], status: i['status'],
      last_seq: i['last_seq'], started_by: i['started_by'], started_at: iso(i['started_at']), updated_at: iso(i['updated_at']),
      lease: { owner: i['lease_owner'] ?? null, until: leaseUntil, live: leaseUntil !== null && leaseUntil > now },
      newest: newest === undefined ? null : { version: newest['version'], digest: newest['digest'] }, pinned_behind_newest: newest !== undefined && newest['digest'] !== i['def_digest'],
    };
  }

  /** One instance: its transition log, its compensations, its timers, its drills and the replay's verdict (consistent or not — never assumed). */
  async instance(cap: WorkflowReads, instanceId: string, correlationId: string): Promise<Row> {
    assertUuid(instanceId, correlationId, 'instance');
    const i = ((await cap.readInstances().selectAll().where('instance_id' as never, '=', instanceId as never).execute()) as Row[])[0];
    if (i === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized workflow instance matches'), 404);
    const defs = (await cap.readDefinitions().select(['def_key', 'version', 'digest'] as never).execute()) as Row[];
    const transitions = (await cap.readTransitions().selectAll().where('instance_id' as never, '=', instanceId as never).orderBy('seq' as never).execute()) as Row[];
    const compensations = (await cap.readCompensations().selectAll().where('instance_id' as never, '=', instanceId as never).orderBy('for_seq' as never, 'desc').execute()) as Row[];
    const timers = (await cap.readTimers().selectAll().where('owner_id' as never, '=', instanceId as never).orderBy('created_at' as never).execute()) as Row[];
    const firings = (await cap.readTimerFirings().selectAll().execute()) as Row[];
    const drills = (await cap.readDrills().selectAll().where('instance_id' as never, '=', instanceId as never).orderBy('run_at' as never, 'desc').execute()) as Row[];
    const tasks = (await cap.readTasks().selectAll().where('instance_id' as never, '=', instanceId as never).orderBy('opened_at' as never).execute()) as Row[];
    const now = await cap.now();
    return {
      instance: this.instanceOf(i, defs, now),
      transitions: transitions.map((t) => ({ seq: t['seq'], kind: t['kind'], event: t['event'], from: t['from_state'] ?? null, to: t['to_state'], idempotency_key: t['idempotency_key'],
        effect_ref: t['effect_ref'] ?? null, details: t['details'], actor: t['actor_principal_id'], at: iso(t['at']) })),
      compensations: compensations.map((c) => ({ for_seq: c['for_seq'], for_event: c['for_event'], action: c['action'] ?? null, outcome: c['outcome'], task_id: c['task_id'] ?? null, reason: c['reason'], at: iso(c['at']) })),
      timers: timers.map((t) => timerOf(t, firings.find((f) => f['timer_id'] === t['timer_id']))),
      drills: drills.map((d) => ({ drill_id: d['drill_id'], kind: d['kind'], verdict: d['verdict'], observations: d['observations'], run_by: d['run_by'], run_at: iso(d['run_at']) })),
      tasks: tasks.map(taskOf),
      replay: await cap.replay(instanceId),
    };
  }

  /** The domain's timers (pending first, then the fired and the cancelled, newest first), each with its firing and its failures. */
  async timers(cap: WorkflowReads, p: { state?: unknown; limit?: unknown }): Promise<Row> {
    const rows = (await cap.readTimers().selectAll().orderBy('due_at' as never, 'desc').limit(limitOf(p.limit, 100, 500)).execute()) as Row[];
    const firings = (await cap.readTimerFirings().selectAll().execute()) as Row[];
    const failures = (await cap.readTimerFailures().selectAll().orderBy('at' as never).execute()) as Row[];
    const all = rows.map((t) => ({ ...timerOf(t, firings.find((f) => f['timer_id'] === t['timer_id'])),
      failures: failures.filter((f) => f['timer_id'] === t['timer_id']).map((f) => ({ attempt: f['attempt'], error: f['error'], at: iso(f['at']) })) }));
    const wanted = typeof p.state === 'string' ? all.filter((t) => t.state === p.state) : all;
    return { now: await cap.now(), timers: wanted, counts: { pending: all.filter((t) => t.state === 'pending').length, fired: all.filter((t) => t.state === 'fired').length, cancelled: all.filter((t) => t.state === 'cancelled').length } };
  }

  async drills(cap: WorkflowReads, p: { limit?: unknown }): Promise<Row> {
    const rows = (await cap.readDrills().selectAll().orderBy('run_at' as never, 'desc').limit(limitOf(p.limit, 50, 200)).execute()) as Row[];
    return { drills: rows.map((d) => ({ drill_id: d['drill_id'], kind: d['kind'], instance_id: d['instance_id'] ?? null, verdict: d['verdict'], observations: d['observations'], run_by: d['run_by'], run_at: iso(d['run_at']) })) };
  }

  // ───────────────────────── the human tasks' reads (executive.task.read) ─────────────────────────
  /**
   * THE INBOX: the open and escalated tasks the caller holds — assigned to them, or unassigned with a candidate role they hold here —
   * soonest deadline first (no deadline last), each with its escalation chain (the assignment ledger, oldest first). `all` adds the
   * closed ones (completed, cancelled, lapsed) the caller held.
   */
  async inbox(cap: WorkflowReads, me: { principalId: string; roles: string[] }, p: { all?: unknown; limit?: unknown }): Promise<Row> {
    const states = p.all === true ? [...TASK_STATES] : ['open', 'escalated'];
    const rows = (await cap.readTasks().selectAll().where('state' as never, 'in', states as never).orderBy('opened_at' as never, 'desc').limit(500).execute()) as Row[];
    const mine = rows.filter((t) => t['assignee_principal_id'] === me.principalId
      || ((t['assignee_principal_id'] === null || t['assignee_principal_id'] === undefined) && ((t['candidate_roles'] ?? []) as string[]).some((r) => me.roles.includes(r))));
    const ids = mine.map((t) => t['task_id']);
    const assignments = ids.length === 0 ? [] : (await cap.readTaskAssignments().selectAll().where('task_id' as never, 'in', ids as never).orderBy('at' as never).execute()) as Row[];
    const sorted = mine.sort((a, b) => {
      const da = a['deadline_at'] === null || a['deadline_at'] === undefined ? Number.POSITIVE_INFINITY : new Date(String(a['deadline_at'])).getTime();
      const db = b['deadline_at'] === null || b['deadline_at'] === undefined ? Number.POSITIVE_INFINITY : new Date(String(b['deadline_at'])).getTime();
      return da - db;
    }).slice(0, limitOf(p.limit, 100, 500));
    /* B36 (0094 §C2): what each open task waits on (finish-to-start) — the inbox says "waits on …" and offers Complete only when nothing is unmet */
    const waits = new Map<string, Row[]>();
    for (const t of sorted) if (t['state'] === 'open' || t['state'] === 'escalated') waits.set(String(t['task_id']), await cap.unmetDependencies(String(t['task_id'])));
    /* end B36 */
    return {
      now: await cap.now(),
      tasks: sorted.map((t) => ({ ...taskOf(t), escalation_chain: assignments.filter((a) => a['task_id'] === t['task_id']).map(assignmentOf),
        /* B36 (0094 §C2) */ waits_on: waits.get(String(t['task_id'])) ?? [], blocked: (waits.get(String(t['task_id'])) ?? []).length > 0 /* end B36 */ })),
      order: 'soonest deadline first; a task without a deadline last (no score)',
    };
  }

  /** One task: its record, the escalation chain (assignments) and its events. Visible to its holder and to the domain's task readers. */
  async task(cap: WorkflowReads, taskId: string, correlationId: string): Promise<Row> {
    assertUuid(taskId, correlationId, 'task');
    const t = ((await cap.readTasks().selectAll().where('task_id' as never, '=', taskId as never).execute()) as Row[])[0];
    if (t === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized task matches'), 404);
    const assignments = (await cap.readTaskAssignments().selectAll().where('task_id' as never, '=', taskId as never).orderBy('at' as never).execute()) as Row[];
    const events = (await cap.readTaskEvents().selectAll().where('task_id' as never, '=', taskId as never).orderBy('at' as never).execute()) as Row[];
    const timers = (await cap.readTimers().selectAll().where('owner_id' as never, '=', taskId as never).orderBy('created_at' as never).execute()) as Row[];
    const firings = (await cap.readTimerFirings().selectAll().execute()) as Row[];
    return { task: taskOf(t), escalation_chain: assignments.map(assignmentOf), events: events.map(eventOf), timers: timers.map((x) => timerOf(x, firings.find((f) => f['timer_id'] === x['timer_id']))),
             /* B36 (0094 §C2) */ dependencies: await cap.taskDependencies(taskId) /* end B36 */ };
  }
}
