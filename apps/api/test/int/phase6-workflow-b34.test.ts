/**
 * CP-6 B34 (migration 0090 §W, part `workflow`; F-P6-14 "Collaboration, human tasks and durable workflow engine"; V6 IA-41-001/-003/-005,
 * INF-PF-05, RU-06, MS-05/-12, FM-23, SC-09; V8 PR-46-001..006, CAP-EO-09/-10, AT-46, PER-22) — on a real database, the world of
 * `bootDecisionWorld`, B34's own humans with sessions of their own, an ACTIVE ATTENTION AGENT whose ticks (tickNow, the timer host's own
 * path) fire the workflow timers, and the real sign-in route for the external collaborators.
 *
 *   W1 · THE ENGINE: a definition refused by the PDP (an analyst, 403) and by the port (a malformed spec, 422); published with its digest;
 *   an instance started (a duplicate start answers repeated); advanced under a worker's LEASE (a duplicate transition answers repeated, one
 *   row); another worker refused while the lease is live (409), a stale seq (409), an event the pinned definition does not permit (409), an
 *   unknown instance (404).
 *   W2 · RESTART / REPLAY AND THE DUPLICATE DRILLS: the first worker's lease expires (the crash); the second RESUMES from the committed seq
 *   (resumed_from recorded); the replay refolds the state consistently; the drills restart_replay, duplicate_task and duplicate_timer pass.
 *   W3 · A DEFINITION CHANGE: v2 published while an instance runs on v1 — the instance stays PINNED (v1's digest; v2's new event refused on
 *   it, 409), a new instance pins v2; the definition_change drill passes.
 *   W4 · A STEP TIMEOUT FIRED BY A REAL TICK, AND COMPENSATION: a state's timeout fires once (kind timeout, exactly once, its drift kept);
 *   a compensable instance COMPENSATED (a confirm task to the owner, completed through the task route); an instance whose newest advance has
 *   no declared compensation IRRECONCILABLE (escalated: a workflow.irreconcilable task to the escalation principal).
 *   T1 · THE HUMAN TASKS: a gate task (planted as the gates part opens it — stated) reassigned only to an ELIGIBLE member (422 otherwise:
 *   not eligible, excluded, an external); completion refused for gate.* and commitment.* (409, the owning action); a non-assignee refused
 *   (403); the inbox; a failing timer handler (a test double) retried by the next tick and abandoned on the third failure, the product's
 *   handler restored (recovery).
 *   C1 · THE DEMO SCENE: a customs expert from a partner firm (SYNTHETIC) invited with a 14-day expiry to review the dual-sourcing case — the
 *   owner REQUESTS, the tenant administrator PROVISIONS through the identity authority (B34-F1, 0091; the owner refused the provisioning); the
 *   invitation in the SYNTHETIC mailbox; signed in with its token, the invitation accepted (the credential now expires with the grant); the
 *   external reads only its workspace and only at its audience ceiling, discusses and adds an artifact; refused everything else (PDP 403 —
 *   the inbox, the workflow, an invitation, an approval; the port — another purpose 403, above its ceiling 422, a workspace it was never
 *   granted 404; a room membership: is_active_human is false for an external); its review task's deadline passes and a REAL TICK escalates
 *   it to the chief of staff; the external's late review refused (403); the chief of staff records the review, the task completed.
 *   C2 · ACCESS LOST: a grant LAPSES at its expiry (the grant.expiry timer fired by a tick): the external's open task reassigned with reason
 *   access_lost, the credentials and sessions revoked and the epoch bumped by the identity authority (the after-tick hook
 *   collab-access-revocation — B34-F1: the old session refused, the sign-in refused); a grant whose timer never fired lapsed by the sweep
 *   step (22); a REVOKED grant — its access revoked by the identity authority at once, the sign-in refused.
 *
 * EACH CASE LOGS ONE `B34 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { WorkflowController } from '../../src/executive/workflow/workflow.controller.js';
import { CollabService } from '../../src/executive/workflow/collab.service.js';
import { WorkflowTimerRegistry } from '../../src/executive/workflow/timers.js';
import { AuthController } from '../../src/pipeline/auth.controller.js';
import { IdentityService } from '../../src/identity/identity.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let wf: WorkflowController; let timer: AttentionTimerService; let collab: CollabService; let registry: WorkflowTimerRegistry;
let auth: AuthController; let identity: IdentityService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let chief: AuthenticatedPrincipal; let caseOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let approverA: AuthenticatedPrincipal; let approverB: AuthenticatedPrincipal; let plainMember: AuthenticatedPrincipal;
let agentId = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const PURPOSE = 'collaboration.dual-sourcing-review';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (asObservationRefusal — the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B34 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the routes (in process) ───────────── */
const r = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null, purpose = 'executive') => h.req(as, action, type, id, purpose);
const define = (payload: Row, as = chief) => wf.publishWorkflowDefinition(r(as, 'executive.workflow.define', 'WFD', null), T(), D(), { payload }) as Promise<{ definition: Row }>;
const start = (payload: Row, as = chief) => wf.startWorkflow(r(as, 'executive.workflow.start', 'WFI', null), T(), D(), { payload }) as Promise<{ instance: Row }>;
const advance = (id: string, payload: Row, as = chief) => wf.advanceWorkflow(r(as, 'executive.workflow.advance', 'WFI', id), T(), D(), id, { payload }) as Promise<{ transition: Row }>;
const compensate = (id: string, reason: string, as = chief) => wf.compensateWorkflow(r(as, 'executive.workflow.compensate', 'WFI', id), T(), D(), id, { payload: { reason } }) as Promise<{ compensation: Row }>;
const instance = (id: string, as = chief) => wf.getWorkflowInstance(r(as, 'executive.workflow.read', 'WFI', id), T(), D(), id) as unknown as Promise<{ instance: Row; transitions: Row[]; timers: Row[]; tasks: Row[]; replay: Row; compensations: Row[] }>;
const drill = (payload: Row, as = chief) => wf.runWorkflowDrill(r(as, 'executive.workflow.drill', 'WDR', null), T(), D(), { payload }) as Promise<{ drill: Row }>;
const inbox = (as: AuthenticatedPrincipal, payload: Row = {}, purpose = 'executive') => wf.taskInbox(r(as, 'executive.task.read', 'HTK', null, purpose), T(), D(), { payload }) as unknown as Promise<{ tasks: Row[] }>;
const reassign = (taskId: string, payload: Row, as = chief) => wf.reassignTask(r(as, 'executive.task.reassign', 'HTK', taskId), T(), D(), taskId, { payload }) as Promise<{ task: Row }>;
const complete = (taskId: string, payload: Row, as: AuthenticatedPrincipal, purpose = 'executive') => wf.completeTask(r(as, 'executive.task.complete', 'HTK', taskId, purpose), T(), D(), taskId, { payload }) as Promise<{ task: Row }>;
const openWs = (payload: Row, as = caseOwner) => wf.openWorkspace(r(as, 'executive.collab.workspace.open', 'CWS', null, PURPOSE), T(), D(), { payload }) as Promise<{ workspace: Row }>;
const getWs = (ws: string, as: AuthenticatedPrincipal, purpose = PURPOSE) => wf.getWorkspace(r(as, 'executive.collab.read', 'CWS', ws, purpose), T(), D(), ws) as unknown as Promise<Row & { artifacts: Row[]; tasks: Row[]; grants: Row[]; participants: Row[]; threads: Row[]; invitation_mail: Row[]; viewer: Row }>;
const listWs = (as: AuthenticatedPrincipal, purpose = PURPOSE) => wf.listWorkspaces(r(as, 'executive.collab.read', 'CWS', null, purpose), T(), D()) as unknown as Promise<{ workspaces: Row[] }>;
const participant = (ws: string, payload: Row, as = caseOwner) => wf.setParticipant(r(as, 'executive.collab.participant.set', 'CWS', ws, PURPOSE), T(), D(), ws, { payload });
const post = (ws: string, payload: Row, as: AuthenticatedPrincipal, purpose = PURPOSE) => wf.postMessage(r(as, 'executive.collab.discuss', 'CWS', ws, purpose), T(), D(), ws, { payload }) as Promise<{ message: Row }>;
const artifact = (ws: string, payload: Row, as: AuthenticatedPrincipal, purpose = PURPOSE) => wf.addArtifact(r(as, 'executive.collab.discuss', 'CWS', ws, purpose), T(), D(), ws, { payload }) as Promise<{ artifact: Row }>;
const requestReview = (ws: string, payload: Row, as = caseOwner) => wf.requestReview(r(as, 'executive.collab.review.request', 'HTK', null, PURPOSE), T(), D(), ws, { payload }) as Promise<{ task: Row }>;
const review = (ws: string, payload: Row, as: AuthenticatedPrincipal, purpose = PURPOSE) => wf.recordReview(r(as, 'executive.collab.review', 'CWS', ws, purpose), T(), D(), ws, { payload }) as Promise<{ review: Row }>;
const request = (ws: string, payload: Row, as = caseOwner) => wf.invite(r(as, 'executive.collab.invite', 'CGR', null, PURPOSE), T(), D(), ws, { payload }) as Promise<{ grant: Row }>;
/* B34-F1 (0091): the tenant administrator provisions a requested invitation through the identity authority */
const provision = (grantId: string, as = tenantAdmin) => wf.provisionInvitation(r(as, 'executive.collab.provision', 'CGR', grantId, PURPOSE), T(), D(), grantId) as Promise<{ grant: Row }>;
const invite = async (ws: string, payload: Row, as = caseOwner) => provision(String((await request(ws, payload, as)).grant['grant_id']));
const accept = (grantId: string, payload: Row, as: AuthenticatedPrincipal, purpose = PURPOSE) => wf.acceptInvitation(r(as, 'executive.collab.accept', 'CGR', grantId, purpose), T(), D(), grantId, { payload }) as Promise<{ grant: Row }>;
const revoke = (grantId: string, reason: string, as = caseOwner) => wf.revokeGrant(r(as, 'executive.collab.grant.revoke', 'CGR', grantId, PURPOSE), T(), D(), grantId, { payload: { reason } }) as Promise<{ grant: Row }>;

/** The real sign-in route (in process): the principal the session verifies to, or the refusal. */
const signIn = async (username: string, password: string): Promise<AuthenticatedPrincipal> => {
  const out = await auth.login({ eyeCorrelationId: uuidv7(), path: '/v1/auth/login', method: 'POST', headers: {} } as never, { payload: { username, password } });
  const p = await identity.verifyAccess(out.tokens.accessToken);
  if (p === null) throw new Error('the fresh session did not verify');
  return p;
};
/** One tick of the domain's attention agent, standing for its own instant (the timer host's own path). */
let slot = 0;
let lastAfter: Record<string, Row> = {};
const tick = async () => {
  const o = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2034, 0, 1) + (slot++) * 60_000) });
  expect(o.outcome, JSON.stringify(o.run?.outputs ?? o.stopReason).slice(0, 600)).toBe('finished');
  lastAfter = (o.run?.outputs['after'] ?? {}) as Record<string, Row>;
  return (o.run?.outputs['steps'] ?? {}) as Record<string, Row>;
};
const taskRow = async (id: string) => (await sql<{ state: string; assignee: string | null; escalation_level: number; deadline_at: Date | null; deadline_timer_id: string | null; outcome: string | null }>`
  select state, assignee_principal_id::text assignee, escalation_level, deadline_at, deadline_timer_id::text, outcome from executive.human_tasks where task_id = ${id}::uuid`.execute(su)).rows[0]!;
const taskEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from executive.human_task_events where task_id = ${id}::uuid order by at, event_id`.execute(su)).rows;
const assignments = async (id: string) => (await sql<{ from_p: string | null; to_p: string | null; reason: string }>`select from_principal::text from_p, to_principal::text to_p, reason from executive.human_task_assignments where task_id = ${id}::uuid order by at, assignment_id`.execute(su)).rows;
const timerRow = async (id: string) => (await sql<{ fired_at: Date | null; cancelled_at: Date | null; drift_seconds: string | null; kind: string }>`select fired_at, cancelled_at, drift_seconds, kind from executive.workflow_timers where timer_id = ${id}::uuid`.execute(su)).rows[0]!;
const firings = async (id: string) => (await sql<{ outcome: string; tick_key: string | null }>`select outcome, tick_key::text from executive.workflow_timer_firings where timer_id = ${id}::uuid`.execute(su)).rows;
/** Plants a task as another part's definer port opens it (stated): the superuser calls the prelude's internal _open_human_task. */
const plantTask = async (kind: string, assignee: string, eligibility: Row = {}, deadlineAt: string | null = null): Promise<string> => {
  const id = uuidv7();
  await sql`select executive._open_human_task(${id}::uuid, ${T()}::uuid, ${D()}::uuid, ${kind}, ${`b34-harness:${id}`}, ${JSON.stringify({ kind: 'decision_package', id: uuidv7(), planted: 'B34 harness' })}::jsonb,
            ${`Planted ${kind} task (B34 harness)`}, ${assignee}::uuid, '{}'::text[], ${JSON.stringify(eligibility)}::jsonb, ${deadlineAt}::timestamptz, '{}'::jsonb, null, null, ${chief.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
  return id;
};

/** The review workflow: requested → in_review → reviewed | lapsed, with a timeout on in_review and one declared compensation. */
const SPEC_V1 = (timeoutSeconds = 3600): Row => ({
  states: ['requested', 'in_review', 'reviewed', 'lapsed'], initial: 'requested', terminal: ['reviewed', 'lapsed'],
  transitions: [{ from: 'requested', event: 'start_review', to: 'in_review' }, { from: 'in_review', event: 'record_review', to: 'reviewed' }, { from: 'in_review', event: 'timeout', to: 'lapsed' },
                { from: 'in_review', event: 'request_changes', to: 'requested' }],
  timeouts: [{ state: 'in_review', after_seconds: timeoutSeconds, event: 'timeout' }],
  compensations: { start_review: 'withdraw the review request from the reviewer and restore the case to requested' },
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  w = await bootDecisionWorld(h);
  wf = h.app.get(WorkflowController); timer = h.app.get(AttentionTimerService); collab = h.app.get(CollabService); registry = h.app.get(WorkflowTimerRegistry);
  auth = h.app.get(AuthController); identity = h.app.get(IdentityService);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b34-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b34-domain-admin');
  chief = await h.humanWithSession(['executive'], 'b34-chief-of-staff');
  caseOwner = await h.humanWithSession(['decision_owner'], 'b34-case-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b34-analyst');
  approverA = await h.humanWithSession(['decision_approver'], 'b34-approver-a');
  approverB = await h.humanWithSession(['decision_approver'], 'b34-approver-b');
  plainMember = await h.humanWithSession(['strategy_owner'], 'b34-strategy-owner');
  // THE ATTENTION AGENT whose ticks fire the workflow timers (the B24 timer host; no scheduler in this file — the ticks are tickNow's)
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const exec = h.app.get(Ec);
  const a = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: {
    kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: chief.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } } }) as { agent: { agentId: string } };
  agentId = a.agent.agentId;
}, 600_000);

afterAll(async () => {
  try { registry.useHandlerForTests('task.reminder', null); } catch { /* restored */ }
  try {
    const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
    if (agentId !== '') await h.app.get(Ec).revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason: 'the B34 workflow harness is done' } });
  } catch { /* already revoked */ }
  await h?.close();
}, 120_000);

describe('B34 · the durable workflow engine, the human tasks and collaboration (0090 §W; F-P6-14)', () => {
  let inst1 = '';
  it('W1 · THE ENGINE: define (PDP 403, spec 422), start (a duplicate answers repeated), advance under a lease (a duplicate answers repeated; another worker 409; a stale seq 409; an unpermitted event 409; unknown 404)', async () => {
    await refused(define({ def_key: 'collab.review', spec: SPEC_V1(), owner: caseOwner.principalId, escalation: chief.principalId, reason: 'the review workflow (B34 harness)' }, analyst), /./, 403, 'EYE-AUT-001');
    await refused(define({ def_key: 'collab.review', spec: { ...SPEC_V1(), initial: 'nowhere' }, owner: caseOwner.principalId, escalation: chief.principalId, reason: 'a broken spec (B34 harness)' }),
      /^workflow definition rejected \(initial\)/, 422, 'EYE-REQ-001');
    await refused(define({ def_key: 'collab.review', spec: SPEC_V1(), owner: w.machinePrincipalId, escalation: chief.principalId, reason: 'an agent as owner (B34 harness)' }),
      /^workflow definition rejected \(owner\)/, 422, 'EYE-REQ-001');
    const v1 = (await define({ def_key: 'collab.review', spec: SPEC_V1(), owner: caseOwner.principalId, escalation: chief.principalId, reason: 'the review workflow of a collaboration workspace (B34 harness)' })).definition;
    expect(v1).toMatchObject({ def_key: 'collab.review', version: 1 });
    expect(String(v1['digest'])).toMatch(/^[0-9a-f]{64}$/);
    await refused(define({ def_key: 'collab.review', spec: SPEC_V1(), owner: caseOwner.principalId, escalation: chief.principalId, reason: 'the same spec again (B34 harness)' }), /^workflow definition rejected \(unchanged\)/, 409, 'EYE-STA-002');
    const s1 = (await start({ def_key: 'collab.review', subject: { kind: 'decision_package', id: uuidv7() }, start_key: 'b34-w1-start' })).instance;
    inst1 = String(s1['instance_id']);
    expect(s1).toMatchObject({ state: 'requested', seq: 0, def_version: 1, repeated: false });
    expect((await start({ def_key: 'collab.review', subject: { kind: 'decision_package', id: uuidv7() }, start_key: 'b34-w1-start' })).instance).toMatchObject({ instance_id: inst1, repeated: true });
    const a1 = (await advance(inst1, { event: 'start_review', idempotency_key: 'w1-start-review', lease_owner: 'worker-a', lease_seconds: 2, expected_seq: 0 })).transition;
    expect(a1).toMatchObject({ seq: 1, from: 'requested', to: 'in_review', repeated: false, lease_owner: 'worker-a' });
    const dup = (await advance(inst1, { event: 'start_review', idempotency_key: 'w1-start-review', lease_owner: 'worker-b', lease_seconds: 30 })).transition;
    expect(dup).toMatchObject({ seq: 1, repeated: true });
    const rows = (await sql<{ n: number }>`select count(*)::int n from executive.workflow_transitions where instance_id = ${inst1}::uuid`.execute(su)).rows[0]!.n;
    expect(rows, 'a duplicate transition wrote nothing').toBe(2);
    // worker-a's lease (2 s) is still live right after its advance: a second worker is refused
    await refused(advance(inst1, { event: 'record_review', idempotency_key: 'w1-by-b', lease_owner: 'worker-b', lease_seconds: 30 }), /^workflow rejected \(leased\)/, 409, 'EYE-STA-002');
    await refused(advance(inst1, { event: 'record_review', idempotency_key: 'w1-stale', lease_owner: 'worker-a', lease_seconds: 1, expected_seq: 0 }), /^workflow rejected \(stale_seq\)/, 409, 'EYE-STA-002');
    await refused(advance(inst1, { event: 'start_review', idempotency_key: 'w1-bad-event', lease_owner: 'worker-a', lease_seconds: 1 }), /^workflow rejected \(no_transition\)/, 409, 'EYE-STA-002');
    await refused(advance(uuidv7(), { event: 'start_review', idempotency_key: 'w1-unknown', lease_owner: 'worker-a', lease_seconds: 1 }), /^workflow rejected \(unknown_instance\)/, 404, 'EYE-STA-001');
    await refused(advance(inst1, { event: 'record_review', idempotency_key: 'w1-x', lease_owner: 'worker-a', lease_seconds: 1 }, analyst), /./, 403, 'EYE-AUT-001');
    const pending = (await instance(inst1)).timers.filter((t) => t['state'] === 'pending');
    expect(pending.map((t) => t['kind']), 'in_review\'s timeout scheduled').toEqual(['workflow.step_timeout']);
    sixEvidence('W1', { fault_trace: { refused: ['403 PDP analyst', '422 spec', '422 owner', '409 unchanged', '409 leased', '409 stale_seq', '409 no_transition', '404 unknown'] }, watermark: { instance: inst1, seq: 1, digest: v1['digest'] },
      consumer_behaviour: { duplicate_start: 'repeated', duplicate_transition: 'repeated, one row' }, operator_action: 'the chief of staff defines, starts and advances', recovery: 'none needed', reconciliation: { transitions: rows } });
  }, 120_000);

  it('W2 · RESTART / REPLAY: the crashed worker\'s lease expires, the next worker RESUMES from the committed seq; the replay is consistent; the restart, duplicate-task and duplicate-timer drills pass', async () => {
    await sleep(2_300); // worker-a's 2-second lease expires: the engine "restarts" with a new worker
    const resumed = (await advance(inst1, { event: 'request_changes', idempotency_key: 'w2-resume', lease_owner: 'worker-b', lease_seconds: 30, expected_seq: 1 })).transition;
    expect(resumed).toMatchObject({ seq: 2, from: 'in_review', to: 'requested', resumed_from: 'worker-a', lease_owner: 'worker-b' });
    const got = await instance(inst1);
    expect(got.replay).toMatchObject({ consistent: true, replayed_state: 'requested', replayed_seq: 2, stored_state: 'requested', stored_seq: 2 });
    expect(got.transitions.map((t) => `${String(t['seq'])}:${String(t['event'])}`)).toEqual(['0:start', '1:start_review', '2:request_changes']);
    // the step timeout of in_review was cancelled when the instance left it
    expect(got.timers.map((t) => t['state'])).toEqual(['cancelled']);
    const d1 = (await drill({ kind: 'restart_replay', instance_id: inst1 })).drill;
    expect(d1).toMatchObject({ kind: 'restart_replay', verdict: 'pass' });
    const d2 = (await drill({ kind: 'duplicate_task' })).drill;
    expect(d2).toMatchObject({ kind: 'duplicate_task', verdict: 'pass' });
    expect((d2['observations'] as Row)['rows_with_key']).toBe(1);
    const d3 = (await drill({ kind: 'duplicate_timer', instance_id: inst1 })).drill;
    expect(d3).toMatchObject({ kind: 'duplicate_timer', verdict: 'pass' });
    expect(String((d3['observations'] as Row)['second_refused'])).toMatch(/^workflow timer rejected \(fired\)/);
    await refused(drill({ kind: 'restart_replay', instance_id: uuidv7() }), /^workflow drill rejected \(unknown_instance\)/, 404, 'EYE-STA-001');
    await refused(drill({ kind: 'restart_replay' }), /names the instance/, 422, 'EYE-REQ-001');
    await refused(drill({ kind: 'duplicate_task' }, analyst), /./, 403, 'EYE-AUT-001');
    const recorded = (await sql<{ kind: string; verdict: string }>`select kind, verdict from executive.workflow_drills where tenant_id = ${T()}::uuid order by run_at`.execute(su)).rows;
    expect(recorded).toEqual([{ kind: 'restart_replay', verdict: 'pass' }, { kind: 'duplicate_task', verdict: 'pass' }, { kind: 'duplicate_timer', verdict: 'pass' }]);
    sixEvidence('W2', { fault_trace: { crashed_worker: 'worker-a (lease 2 s, expired)' }, watermark: { resumed_at_seq: 1, now_seq: 2 }, consumer_behaviour: { resumed_from: resumed['resumed_from'], replay: got.replay },
      operator_action: 'the chief of staff runs the drills', recovery: 'worker-b resumed from the committed transition', reconciliation: { drills: recorded } });
  }, 120_000);

  it('W3 · A DEFINITION CHANGE: the running instance stays pinned to v1 (v2\'s event refused on it); a new instance pins v2; the definition_change drill passes', async () => {
    const spec2 = SPEC_V1(); (spec2['transitions'] as Row[]).push({ from: 'requested', event: 'escalate_to_board', to: 'lapsed' });
    const v2 = (await define({ def_key: 'collab.review', spec: spec2, owner: caseOwner.principalId, escalation: chief.principalId, reason: 'the board escalation path added (B34 harness)' })).definition;
    expect(v2).toMatchObject({ version: 2, supersedes_version: 1, running_on_prior: 1 });
    await refused(advance(inst1, { event: 'escalate_to_board', idempotency_key: 'w3-v2-event', lease_owner: 'worker-b', lease_seconds: 30 }), /^workflow rejected \(no_transition\): escalate_to_board is not a transition from requested in collab\.review v1 \(the pinned definition\)/, 409, 'EYE-STA-002');
    const got = await instance(inst1);
    expect(got.instance).toMatchObject({ def_version: 1, pinned_behind_newest: true });
    const s2 = (await start({ def_key: 'collab.review', subject: { kind: 'decision_package', id: uuidv7() }, start_key: 'b34-w3-start' })).instance;
    expect(s2).toMatchObject({ def_version: 2, def_digest: v2['digest'] });
    const d = (await drill({ kind: 'definition_change', instance_id: inst1 })).drill;
    expect(d).toMatchObject({ verdict: 'pass' });
    expect((d['observations'] as Row)['changed_since_start']).toBe(true);
    expect((d['observations'] as Row)['newest_events_from_state']).toContain('escalate_to_board');
    expect((d['observations'] as Row)['pinned_events_from_state']).not.toContain('escalate_to_board');
    // the pin is the table's too: nobody re-points an instance
    expect(await sql`update executive.workflow_instances set def_version = 2 where instance_id = ${inst1}::uuid`.execute(su).then(() => null, (e: { message?: string }) => String(e.message))).toMatch(/pinned/);
    sixEvidence('W3', { fault_trace: { published: 'v2 while v1 runs' }, watermark: { pinned: 1, newest: 2 }, consumer_behaviour: { v2_event_on_v1: '409 no_transition', new_instance: 'v2' },
      operator_action: 'the chief of staff publishes v2', recovery: 'none needed: the pin held', reconciliation: { drill: d['verdict'] } });
  }, 120_000);

  it('W4 · A STEP TIMEOUT FIRED BY A REAL TICK (exactly once); COMPENSATION — compensated with a confirm task completed through the task route; irreconcilable and escalated', async () => {
    const spec = SPEC_V1(2);
    await define({ def_key: 'collab.review-fast', spec, owner: caseOwner.principalId, escalation: chief.principalId, reason: 'a two-second review window (B34 harness)' });
    const i = String((await start({ def_key: 'collab.review-fast', subject: { kind: 'decision_package', id: uuidv7() }, start_key: 'b34-w4-timeout' })).instance['instance_id']);
    await advance(i, { event: 'start_review', idempotency_key: 'w4-start', lease_owner: 'worker-a', lease_seconds: 1 });
    await sleep(2_500);
    const steps = await tick();
    const fired = (steps['workflow-timers']?.['timers'] as Row[]).filter((t) => t['owner_id'] === i);
    expect(fired.map((t) => t['outcome'])).toEqual(['fired']);
    const got = await instance(i);
    expect(got.instance).toMatchObject({ state: 'lapsed', status: 'completed' });
    expect(got.transitions.at(-1)).toMatchObject({ kind: 'timeout', event: 'timeout', to: 'lapsed' });
    const tId = String(got.timers[0]!['timer_id']);
    expect(Number((await timerRow(tId)).drift_seconds)).toBeGreaterThanOrEqual(0);
    await tick();
    expect((await firings(tId)).length, 'fired once').toBe(1);
    // COMPENSATED: start_review has a declared compensation
    const c = String((await start({ def_key: 'collab.review', subject: { kind: 'decision_package', id: uuidv7() }, start_key: 'b34-w4-comp' })).instance['instance_id']);
    await advance(c, { event: 'start_review', idempotency_key: 'w4-c-start', lease_owner: 'worker-c', lease_seconds: 1 });
    const comp = (await compensate(c, 'the partner firm withdrew from the review (B34 harness)')).compensation;
    expect(comp).toMatchObject({ status: 'compensated', irreconcilable: null });
    const confirmTask = String(comp['confirm_task_id']);
    expect((await taskRow(confirmTask))).toMatchObject({ state: 'open', assignee: caseOwner.principalId });
    await refused(complete(confirmTask, { outcome: 'confirmed', note: 'the reviewer was told' }, chief), /^human task rejected \(not_assignee\)/, 403, 'EYE-AUT-001');
    expect((await complete(confirmTask, { outcome: 'confirmed', note: 'the review request was withdrawn with the reviewer (B34 harness)' }, caseOwner)).task).toMatchObject({ state: 'completed' });
    await refused(compensate(c, 'a second compensation (B34 harness)'), /^workflow rejected \(not_running\)/, 409, 'EYE-STA-002');
    // IRRECONCILABLE: request_changes has none declared
    const x = String((await start({ def_key: 'collab.review', subject: { kind: 'decision_package', id: uuidv7() }, start_key: 'b34-w4-irr' })).instance['instance_id']);
    await advance(x, { event: 'start_review', idempotency_key: 'w4-x-1', lease_owner: 'worker-x', lease_seconds: 1 });
    await advance(x, { event: 'request_changes', idempotency_key: 'w4-x-2', lease_owner: 'worker-x', lease_seconds: 1 });
    const irr = (await compensate(x, 'the case was withdrawn mid-review (B34 harness)')).compensation;
    expect(irr).toMatchObject({ status: 'irreconcilable' });
    expect((irr['irreconcilable'] as Row)).toMatchObject({ event: 'request_changes', escalated_to: chief.principalId });
    const irrTask = String((irr['irreconcilable'] as Row)['task_id']);
    expect(await taskRow(irrTask)).toMatchObject({ state: 'open', assignee: chief.principalId });
    expect((await inbox(chief)).tasks.map((t) => t['task_id'])).toContain(irrTask);
    sixEvidence('W4', { fault_trace: { timeout_after_seconds: 2, irreconcilable_event: 'request_changes' }, watermark: { timeout_timer: tId, firings: 1 }, consumer_behaviour: { timeout_transition: 'lapsed', compensated: c, irreconcilable: x },
      operator_action: 'the chief of staff compensates; the owner confirms', recovery: { confirm_task: 'completed', escalated_to: chief.principalId }, reconciliation: { second_tick_firings: 1 } });
  }, 120_000);

  it('T1 · THE HUMAN TASKS: reassignment moves work, never authority (eligibility re-checked; 422); gate and commitment tasks complete only through the owning action (409); 403 not the assignee; a failing handler retried then abandoned; recovery', async () => {
    const gate = await plantTask('gate.approve', approverA.principalId, { roles: ['decision_approver'], exclude: [approverB.principalId] });
    await refused(reassign(gate, { to: analyst.principalId, reason: 'the approver is travelling (B34 harness)' }), /^human task rejected \(not_eligible\)/, 422, 'EYE-REQ-001');
    await refused(reassign(gate, { to: approverB.principalId, reason: 'the approver is travelling (B34 harness)' }), /^human task rejected \(not_eligible\)/, 422, 'EYE-REQ-001');
    await refused(reassign(gate, { to: w.machinePrincipalId, reason: 'an agent (B34 harness)' }), /^human task rejected \(not_member\)/, 422, 'EYE-REQ-001');
    await refused(reassign(gate, { to: approverB.principalId, reason: 'the approver is travelling (B34 harness)' }, plainMember), /^human task rejected \(not_assignee\)/, 403, 'EYE-AUT-001');
    const approver3 = await h.humanWithSession(['decision_approver'], 'b34-approver-c');
    const moved = (await reassign(gate, { to: approver3.principalId, reason: 'the approver is travelling (B34 harness)' })).task;
    expect(moved).toMatchObject({ from: approverA.principalId, to: approver3.principalId });
    expect((await assignments(gate)).map((a) => a.reason)).toEqual(['opened', 'reassign']);
    await refused(complete(gate, { outcome: 'approved', note: 'approved from the inbox (B34 harness)' }, approver3), /^human task rejected \(owning_action\): a gate\.approve task is completed through the owning action/, 409, 'EYE-STA-002');
    const commitment = await plantTask('commitment.accept', caseOwner.principalId);
    await refused(complete(commitment, { outcome: 'accepted', note: 'accepted from the inbox (B34 harness)' }, caseOwner), /^human task rejected \(owning_action\)/, 409, 'EYE-STA-002');
    await refused(complete(uuidv7(), { outcome: 'done', note: 'nothing to complete (B34 harness)' }, caseOwner), /^human task rejected \(unknown_task\)/, 404, 'EYE-STA-001');
    await refused(complete(gate, { outcome: 'x', note: 'short' }, approver3), /payload\.outcome/, 422, 'EYE-REQ-001');
    const box = await inbox(approver3);
    expect(box.tasks.find((t) => t['task_id'] === gate)).toMatchObject({ kind: 'gate.approve', completes_through_owning_action: true });
    expect(((box.tasks.find((t) => t['task_id'] === gate)!['escalation_chain']) as Row[]).map((a) => a['reason'])).toEqual(['opened', 'reassign']);
    // A FAILING HANDLER (a test double for task.reminder), a reminder timer PLANTED due now (stated): retried, then abandoned on the third failure
    const remindOf = await plantTask('collab.contribute', caseOwner.principalId);
    const plantReminder = async () => {
      const id = uuidv7();
      await sql`insert into executive.workflow_timers (timer_id, scope, tenant_id, domain_id, owner_kind, owner_id, kind, due_at, payload, created_by, correlation_id)
                values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'task', ${remindOf}::uuid, 'task.reminder', clock_timestamp() - interval '1 second', '{"planted":"B34 harness"}'::jsonb, ${chief.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
      return id;
    };
    const bad = await plantReminder();
    registry.useHandlerForTests('task.reminder', { kind: 'task.reminder', handle: async () => { throw new Error('the reminder channel is down (B34 test double)'); } });
    const outcomes: string[] = [];
    for (let n = 0; n < 3; n++) {
      const s = await tick();
      outcomes.push(String(((s['workflow-timers']?.['timers'] as Row[]) ?? []).find((t) => t['timer_id'] === bad)?.['outcome']));
    }
    expect(outcomes).toEqual(['failed', 'failed', 'abandoned']);
    expect(await firings(bad)).toEqual([{ outcome: 'failed', tick_key: expect.any(String) }]);
    expect((await sql<{ n: number }>`select count(*)::int n from executive.workflow_timer_failures where timer_id = ${bad}::uuid`.execute(su)).rows[0]!.n).toBe(3);
    registry.useHandlerForTests('task.reminder', null);
    const good = await plantReminder();
    const s = await tick();
    expect(((s['workflow-timers']?.['timers'] as Row[]) ?? []).find((t) => t['timer_id'] === good)?.['outcome']).toBe('fired');
    expect((await taskEvents(remindOf)).map((e) => e.event)).toContain('task.reminded');
    sixEvidence('T1', { fault_trace: { handler: 'task.reminder test double throws', outcomes }, watermark: { gate_task: gate, reassigned_to: approver3.principalId }, consumer_behaviour: { not_eligible: 422, excluded: 422, owning_action: 409 },
      operator_action: 'the chief of staff reassigns; the harness swaps the handler', recovery: { restored_handler: 'fired', event: 'task.reminded' }, reconciliation: { failures: 3, abandoned_firing: 'failed' } });
  }, 180_000);

  /* ───────────── THE DEMO SCENE and ACCESS LOST ───────────── */
  let ws = ''; let expert: AuthenticatedPrincipal; let expertGrant = ''; let expertLogin = ''; let reviewTask = '';
  const EXPERT_PASSWORD = ['customs', 'expert', 'b34', 'synthetic'].join('-');
  it('C1 · THE DEMO SCENE: a customs expert invited for 14 days to review the dual-sourcing case; bounded by audience, purpose and expiry; the deadline passes and a real tick escalates the review to the chief of staff', async () => {
    const pkg = (await decisionCalls(h, w).declare({ decisionObjectId: w.decisionId, title: 'Dual-sourcing of the corridor components (B34 harness)', statement: 'whether to qualify a second customs route', owner: w.owner.principalId })).package.packageId;
    await refused(openWs({ title: 'x', subject: { kind: 'decision_package', id: pkg }, purpose: PURPOSE, classification_ceiling: 'confidential' }), /payload\.title/, 422, 'EYE-REQ-001');
    ws = String((await openWs({ title: 'Dual-sourcing case — customs review', subject: { kind: 'decision_package', id: pkg }, purpose: PURPOSE, classification_ceiling: 'confidential' })).workspace['workspace_id']);
    await participant(ws, { op: 'add', principal: chief.principalId, role: 'reviewer' });
    await participant(ws, { op: 'add', principal: analyst.principalId, role: 'contributor' });
    await refused(participant(ws, { op: 'add', principal: analyst.principalId, role: 'observer' }), /^collaboration rejected \(duplicate\)/, 409, 'EYE-STA-002');
    await refused(participant(ws, { op: 'add', principal: plainMember.principalId, role: 'contributor' }, analyst), /^collaboration rejected \(not_owner\)/, 403, 'EYE-AUT-001');
    await artifact(ws, { key: 'route-summary', title: 'Second customs route — summary', kind: 'note', classification: 'internal', content: 'The second route clears through the northern bonded warehouse.' }, caseOwner);
    await artifact(ws, { key: 'tariff-model', title: 'Tariff exposure model', kind: 'document', classification: 'confidential', content: 'Duty exposure by lane (confidential figures).' }, caseOwner);
    // THE INVITATION: 14 days, audience ceiling internal
    await refused(invite(ws, { display_name: 'Customs expert (partner firm, SYNTHETIC)', contact_label: 'customs.expert@partner.example (SYNTHETIC)', audience_ceiling: 'internal', expires_in_days: 45 }), /expires_in_days is 1\.\.30/, 422, 'EYE-REQ-001');
    await refused(invite(ws, { display_name: 'Customs expert (partner firm, SYNTHETIC)', contact_label: 'customs.expert@partner.example (SYNTHETIC)', audience_ceiling: 'restricted', expires_in_days: 14 }), /^collaboration grant rejected \(ceiling\)/, 422, 'EYE-REQ-001');
    await refused(invite(ws, { display_name: 'Customs expert (partner firm, SYNTHETIC)', contact_label: 'customs.expert@partner.example (SYNTHETIC)', audience_ceiling: 'internal', expires_in_days: 14 }, chief), /^collaboration grant rejected \(not_owner\)/, 403, 'EYE-AUT-001');
    // B34-F1: the owner REQUESTS (no identity row); the owner cannot PROVISION (403 — the identity administrators' act); the tenant administrator does
    const requested = (await request(ws, { display_name: 'Customs expert (partner firm, SYNTHETIC)', contact_label: 'customs.expert@partner.example (SYNTHETIC)', audience_ceiling: 'internal', expires_in_days: 14 })).grant;
    expect(requested).toMatchObject({ state: 'requested', purpose: PURPOSE, audience_ceiling: 'internal' });
    await refused(provision(String(requested['grant_id']), caseOwner), /./, 403, 'EYE-AUT-001');
    const g = (await provision(String(requested['grant_id']))).grant;
    expertGrant = String(g['grant_id']); expertLogin = String(g['login_name']);
    expect(g).toMatchObject({ state: 'invited', purpose: PURPOSE, audience_ceiling: 'internal', requested_by: caseOwner.principalId, provisioned_by: tenantAdmin.principalId, mail: { channel: 'demo-mailbox', synthetic: true } });
    expect(JSON.stringify(g)).not.toMatch(/token/i);
    const days = (new Date(String(g['expires_at'])).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9); expect(days).toBeLessThanOrEqual(14);
    const principalRow = (await sql<{ kind: string; affiliation: string; scope: string; roles: string[] }>`select p.kind, executive.principal_affiliation(p.id) affiliation, p.scope, array_agg(b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id where p.id = ${String(g['principal_id'])}::uuid group by p.id`.execute(su)).rows[0]!;
    expect(principalRow).toEqual({ kind: 'human', affiliation: 'external', scope: 'DOMAIN', roles: ['external_collaborator'] });
    expect((await sql<{ ok: boolean }>`select decision.is_active_human(${String(g['principal_id'])}::uuid, ${T()}::uuid) ok`.execute(su)).rows[0]!.ok, 'an external is never an active member').toBe(false);
    const mail = collab.syntheticInvitation(expertGrant)!;
    expect(mail.body).toContain('SYNTHETIC');
    // SIGNED IN WITH THE TOKEN; the invitation ACCEPTED (their own password — a credential expiring with the grant)
    const withToken = await signIn(expertLogin, mail.token);
    expect((await listWs(withToken)).workspaces, 'nothing is visible before acceptance').toEqual([]);
    await refused(post(ws, { thread_title: 'Hello', body: 'before accepting' }, withToken), /^collaboration rejected \(grant_not_accepted\)/, 403, 'EYE-AUT-001');
    await refused(accept(expertGrant, { token: 'x'.repeat(32), password: EXPERT_PASSWORD }, withToken), /^collaboration grant rejected \(token\)/, 403, 'EYE-AUT-001');
    await refused(accept(expertGrant, { token: mail.token, password: EXPERT_PASSWORD }, withToken, 'executive'), /^collaboration grant rejected \(purpose\)/, 403, 'EYE-AUT-001');
    await refused(accept(expertGrant, { token: mail.token, password: EXPERT_PASSWORD }, caseOwner), /./, 403, 'EYE-AUT-001');
    const acc = (await accept(expertGrant, { token: mail.token, password: EXPERT_PASSWORD }, withToken)).grant;
    expect(acc).toMatchObject({ state: 'accepted', credential_expires_at: g['expires_at'], credential: 'rotated by the identity authority' });
    expect((await sql<{ status: string }>`select status from identity.sessions where id = ${withToken.sessionId}::uuid`.execute(su)).rows[0]!.status, 'the rotation revoked the invitation session').toBe('revoked');
    await refused(signIn(expertLogin, mail.token), /./, 401);
    expert = await signIn(expertLogin, EXPERT_PASSWORD);
    const cred = (await sql<{ expires_at: Date }>`select expires_at from identity.credentials where principal_id = ${expert.principalId}::uuid and status = 'active'`.execute(su)).rows[0]!;
    expect(cred.expires_at.toISOString()).toBe(new Date(String(g['expires_at'])).toISOString());
    // WHAT THE EXTERNAL SEES: its one workspace, at its audience ceiling (the confidential model is not listed at all)
    expect((await listWs(expert)).workspaces.map((x) => x['workspace_id'])).toEqual([ws]);
    const seen = await getWs(ws, expert);
    expect(seen.viewer).toMatchObject({ affiliation: 'external', ceiling: 'internal', clearance: 'internal' });
    expect(seen.artifacts.map((a) => a['key'])).toEqual(['route-summary']);
    expect(seen.grants.map((x) => x['grant_id'])).toEqual([expertGrant]);
    expect(seen.invitation_mail).toEqual([]);
    const other = String((await openWs({ title: 'An unrelated workspace (B34 harness)', subject: { kind: 'decision_package', id: pkg }, purpose: PURPOSE, classification_ceiling: 'internal' })).workspace['workspace_id']);
    await refused(getWs(other, expert), /no authorized workspace matches/, 404, 'EYE-STA-001');
    await refused(getWs(ws, expert, 'executive'), /^collaboration rejected \(purpose\)/, 403, 'EYE-AUT-001');
    await refused(post(ws, { thread_title: 'Other purpose', body: 'under another purpose' }, expert, 'executive'), /^collaboration rejected \(purpose\)/, 403, 'EYE-AUT-001');
    // THE EXTERNAL DISCUSSES AND CONTRIBUTES (at or below its ceiling)
    const m = (await post(ws, { thread_title: 'Customs classification of the housings', body: 'The housings classify under the aluminium heading; the bonded route adds two days.' }, expert)).message;
    expect(m).toMatchObject({ affiliation: 'external' });
    await artifact(ws, { key: 'expert-note', title: 'Customs classification note', kind: 'note', classification: 'internal', content: 'Classification opinion (partner firm, SYNTHETIC).' }, expert);
    await refused(artifact(ws, { key: 'expert-conf', title: 'Confidential attempt', kind: 'note', classification: 'confidential', content: 'above the audience ceiling' }, expert), /^collaboration rejected \(above_ceiling\)/, 422, 'EYE-REQ-001');
    // REFUSED EVERYTHING BEYOND ITS GRANT: the PDP (no rule names the external for these) and the ports
    await refused(inbox(expert, {}, PURPOSE), /./, 403, 'EYE-AUT-001');
    await refused(instance(inst1, expert), /./, 403, 'EYE-AUT-001');
    await refused(invite(ws, { display_name: 'A colleague of the expert', contact_label: 'colleague (SYNTHETIC)', audience_ceiling: 'public', expires_in_days: 3 }, expert), /./, 403, 'EYE-AUT-001');
    await refused(openWs({ title: 'An external\'s workspace', subject: { kind: 'decision_package', id: pkg }, purpose: PURPOSE, classification_ceiling: 'public' }, expert), /./, 403, 'EYE-AUT-001');
    await refused(decisionCalls(h, w).approve(pkg, 1, { decision: 'approve', versionDigest: 'a'.repeat(64), rationale: 'an external approving the case (B34 harness)' }, expert), /./, 403, 'EYE-AUT-001');
    await refused(participant(ws, { op: 'add', principal: expert.principalId, role: 'contributor' }), /^collaboration rejected \(members_only\)/, 422, 'EYE-REQ-001');
    const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
    const exec = h.app.get(Ec);
    const room = await exec.openRoom(h.req(w.owner, 'room.open', 'DRM', null, 'decision'), T(), D(), { payload: { packageId: pkg, title: 'Dual-sourcing room (B34 harness)', reviewEveryDays: 7 } }) as { room: { roomId: string } };
    // the room port's own refusal (is_active_human admits members only — the prelude; the port is unchanged)
    expect((await refusal(exec.membership(h.req(w.owner, 'room.membership', 'DRM', room.room.roomId, 'decision'), T(), D(), room.room.roomId, { payload: { principal: expert.principalId, role: 'observer', op: 'add' } }))).message)
      .toMatch(/membership rejected: members are named, active human principals/);
    // THE REVIEW REQUEST: a 4-second deadline (the demo's 14-day window shortened — stated), escalating to the chief of staff
    const deadline = new Date(Date.now() + 4_000).toISOString();
    await refused(requestReview(ws, { reviewer: expert.principalId, title: 'Review the customs route', deadline_at: deadline, escalation: { principal: expert.principalId, max_escalations: 1, extend_minutes: 1440 }, request_key: 'b34-' + 'bad-esc' }),
      /^human task rejected \(escalation\)/, 422, 'EYE-REQ-001');
    const rq = (await requestReview(ws, { reviewer: expert.principalId, title: 'Review the dual-sourcing customs route', deadline_at: deadline, escalation: { principal: chief.principalId, max_escalations: 1, extend_minutes: 1440 }, request_key: 'b34-' + 'expert-review' })).task;
    reviewTask = String(rq['task_id']);
    expect(rq).toMatchObject({ state: 'open', repeated: false, reviewer: expert.principalId });
    expect((await requestReview(ws, { reviewer: expert.principalId, title: 'Review the dual-sourcing customs route', deadline_at: deadline, escalation: { principal: chief.principalId, max_escalations: 1, extend_minutes: 1440 }, request_key: 'b34-' + 'expert-review' })).task)
      .toMatchObject({ task_id: reviewTask, repeated: true });
    expect((await getWs(ws, expert)).tasks.map((t) => t['task_id'])).toEqual([reviewTask]);
    // THE DEADLINE PASSES; A REAL TICK ESCALATES THE TASK TO THE CHIEF OF STAFF
    await sleep(4_500);
    const deadlineTimer = String((await taskRow(reviewTask)).deadline_timer_id);
    const steps = await tick();
    const escFire = ((steps['workflow-timers']?.['timers'] as Row[]) ?? []).find((t) => t['timer_id'] === deadlineTimer)!;
    expect(escFire).toMatchObject({ outcome: 'fired', result: { escalated: true, from: expert.principalId, to: chief.principalId, escalation_level: 1 } });
    expect(await taskRow(reviewTask)).toMatchObject({ state: 'escalated', assignee: chief.principalId, escalation_level: 1 });
    expect((await assignments(reviewTask)).map((a) => `${a.reason}:${a.to_p === chief.principalId ? 'chief' : a.to_p === expert.principalId ? 'expert' : String(a.to_p)}`)).toEqual(['opened:expert', 'escalate:chief']);
    expect((await taskEvents(reviewTask)).map((e) => e.event)).toEqual(['task.opened', 'task.repeated', 'task.escalated']);
    expect((await timerRow(deadlineTimer)).fired_at).not.toBeNull();
    expect((await firings(deadlineTimer))).toHaveLength(1);
    const chiefBox = await inbox(chief);
    const inBox = chiefBox.tasks.find((t) => t['task_id'] === reviewTask)!;
    expect(inBox).toMatchObject({ state: 'escalated', escalation_level: 1 });
    expect((inBox['escalation_chain'] as Row[]).map((a) => a['reason'])).toEqual(['opened', 'escalate']);
    // a second tick: the fired timer never fires again; the new deadline is pending
    await tick();
    expect((await firings(deadlineTimer))).toHaveLength(1);
    // THE EXTERNAL'S LATE REVIEW: the task moved — refused; the chief of staff reviews, the task completed
    await refused(review(ws, { task_id: reviewTask, verdict: 'endorse', statement: 'The route is sound (late).' }, expert), /^collaboration rejected \(not_assignee\)/, 403, 'EYE-AUT-001');
    expect((await review(ws, { verdict: 'concerns', statement: 'Two extra days on the bonded route (partner firm, SYNTHETIC).' }, expert)).review).toMatchObject({ affiliation: 'external', resolved: null });
    const rv = (await review(ws, { task_id: reviewTask, verdict: 'endorse_with_conditions', statement: 'Endorsed on the partner firm\'s classification opinion; the bonded-route delay is accepted.' }, chief)).review;
    expect((rv['resolved'] as Row)['resolved']).toBe(1);
    expect(await taskRow(reviewTask)).toMatchObject({ state: 'completed', outcome: 'endorse_with_conditions' });
    expect((await timerRow(String((await taskRow(reviewTask)).deadline_timer_id))).cancelled_at, 'the pending deadline cancelled with the completion').not.toBeNull();
    sixEvidence('C1', { fault_trace: { deadline_missed_by: expert.principalId }, watermark: { grant: expertGrant, expires_in_days: 14, task: reviewTask, deadline_timer: deadlineTimer },
      consumer_behaviour: { escalated_to: chief.principalId, external_scope: seen.artifacts.map((a) => a['key']), refused: ['PDP inbox/workflow/invite/open/approve 403', 'purpose 403', 'above_ceiling 422', 'not granted 404', 'room member 403'] },
      operator_action: 'the case owner requests, the tenant administrator provisions; the chief of staff reviews', recovery: 'the escalated task completed by the chief of staff', reconciliation: { firings: 1, mail: 'SYNTHETIC demo-mailbox' } });
  }, 240_000);

  it('C2 · ACCESS LOST: a grant lapses at its expiry — tasks reassigned (access_lost), the session and the sign-in refused; a grant whose timer never fired lapsed by the sweep; a revoked grant\'s sign-in refused', async () => {
    const pwd = ['short', 'grant', 'b34', 'synthetic'].join('-');
    const onboard = async (label: string, seconds: number) => {
      const g = (await invite(ws, { display_name: `${label} (partner firm, SYNTHETIC)`, contact_label: `${label} (SYNTHETIC)`, audience_ceiling: 'public', expires_at: new Date(Date.now() + seconds * 1000).toISOString() })).grant;
      const mail = collab.syntheticInvitation(String(g['grant_id']))!;
      const t = await signIn(String(g['login_name']), mail.token);
      await accept(String(g['grant_id']), { token: mail.token, password: pwd }, t);
      return { grantId: String(g['grant_id']), login: String(g['login_name']), session: await signIn(String(g['login_name']), pwd), expiresAt: String(g['expires_at']) };
    };
    const a = await onboard('Short-grant expert', 10);
    const b = await onboard('Swept-grant expert', 10);
    // a's open task (no deadline); b's expiry timer CANCELLED by the superuser (stated: a timer that never fired) — the sweep must catch it
    const ta = String((await requestReview(ws, { reviewer: a.session.principalId, title: 'A second opinion', escalation: { max_escalations: 0 }, request_key: 'b34-' + 'short-grant' })).task['task_id']);
    await sql`update executive.workflow_timers set cancelled_at = clock_timestamp() where kind = 'grant.expiry' and owner_id = ${b.grantId}::uuid`.execute(su);
    const wait = Math.max(new Date(a.expiresAt).getTime(), new Date(b.expiresAt).getTime()) - Date.now() + 700;
    if (wait > 0) await sleep(wait);
    const steps = await tick();
    expect(((steps['workflow-timers']?.['timers'] as Row[]) ?? []).filter((t) => t['kind'] === 'grant.expiry').map((t) => (t['result'] as Row)['grant_id'])).toEqual([a.grantId]);
    expect(((steps['collab-grant-expiry']?.['lapsed'] as Row[]) ?? []).map((x) => x['grant_id'])).toEqual([b.grantId]);
    const states = (await sql<{ grant_id: string; state: string }>`select grant_id::text, state from executive.collab_grants where grant_id in (${a.grantId}::uuid, ${b.grantId}::uuid) order by invited_at`.execute(su)).rows;
    expect(states.map((x) => x.state)).toEqual(['lapsed', 'lapsed']);
    expect(await taskRow(ta)).toMatchObject({ state: 'open', assignee: caseOwner.principalId });
    expect((await assignments(ta)).map((x) => x.reason)).toEqual(['opened', 'access_lost']);
    expect((await taskEvents(ta)).find((e) => e.event === 'task.reassigned')?.details).toMatchObject({ reason: 'access_lost', grant_id: a.grantId });
    // B34-F1: the identity half — the after-tick hook revoked a's and b's credentials and sessions (the epoch bumped) through the identity authority
    const revokedBy = (((lastAfter['collab-access-revocation'] ?? {}) as Row)['revoked'] ?? []) as Row[];
    expect(revokedBy.map((x) => x['principal']).sort()).toEqual([a.session.principalId, b.session.principalId].sort());
    expect(revokedBy.every((x) => Number(x['credentials_revoked']) === 1 && Number(x['sessions_revoked']) >= 1)).toBe(true);
    expect((await sql<{ n: number }>`select count(*)::int n from identity.credentials where principal_id in (${a.session.principalId}::uuid, ${b.session.principalId}::uuid) and status in ('active', 'must_rotate')`.execute(su)).rows[0]!.n).toBe(0);
    // the old session is refused (the sessions revoked — the epoch moved), and the sign-in (the credential revoked)
    await refused(getWs(ws, a.session), /./, 403);
    await refused(signIn(a.login, pwd), /./, 401);
    await refused(signIn(b.login, pwd), /./, 401);
    // REVOKED: a third external, revoked by the owner — the sign-in refused
    const c = await onboard('Revoked expert', 600);
    await refused(revoke(c.grantId, 'ended'), /payload\.reason/, 422, 'EYE-REQ-001');
    await refused(revoke(c.grantId, 'the engagement ended (B34 harness)', chief), /^collaboration grant rejected \(not_owner\)/, 403, 'EYE-AUT-001');
    expect((await revoke(c.grantId, 'the engagement ended (B34 harness)')).grant).toMatchObject({ state: 'revoked', access: { principal: c.session.principalId, credentials_revoked: 1, epoch_bumped: true } });
    await refused(revoke(c.grantId, 'the engagement ended again (B34 harness)'), /^collaboration grant rejected \(state\)/, 409, 'EYE-STA-002');
    await refused(signIn(c.login, pwd), /./, 401);
    const owner = await getWs(ws, caseOwner);
    expect(owner.grants.filter((g) => [a.grantId, b.grantId, c.grantId].includes(String(g['grant_id']))).map((g) => `${String(g['state'])}:${String(g['live'])}`)).toEqual(['lapsed:false', 'lapsed:false', 'revoked:false']);
    expect(owner.participants.filter((p) => p['affiliation'] === 'external' && p['removed_at'] !== null).length).toBe(3);
    // the lapsed task's work is preserved and routed: the owner completes it
    expect((await complete(ta, { outcome: 'done', note: 'the second opinion was taken in-house (B34 harness)' }, caseOwner)).task).toMatchObject({ state: 'completed' });
    sixEvidence('C2', { fault_trace: { lapsed: [a.grantId, b.grantId], revoked: c.grantId }, watermark: { a_expires_at: a.expiresAt }, consumer_behaviour: { timer_lapse: a.grantId, sweep_lapse: b.grantId, reassigned: ta },
      operator_action: 'the superuser cancels b\'s expiry timer (stated); the owner revokes c', recovery: 'the reassigned task completed by the owner', reconciliation: { states, sign_in: '401 for a, b and c' } });
  }, 240_000);
});
