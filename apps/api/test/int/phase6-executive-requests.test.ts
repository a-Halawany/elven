/**
 * CP-6 batch B9 (migration 0066 §9) — ExecutiveActionRequested (interface L10-I04; AU-EXO-0051) on a real database:
 *
 *   A person's TYPED REQUEST with an exactly-once institutional effect. The requester's request_key is the idempotency
 *   boundary under the request's content digest: the same key with the same request returns the recorded request (no
 *   second effect, no second event); the same key with a different request is refused. Human-gated: a workload holding
 *   the same roles is refused by the policy before any port runs. Stale context is refused (a subject version that is not
 *   current; a decision request on a committed package). Each kind reaches its responsible capability:
 *     analysis    → an agent run under the agent's own session, trigger kind `request`, the run fulfilling the request;
 *     delegation  → a member's standing in a room lent to another principal for a window (membership-level: the delegate
 *                   reviews the room while the window stands, is refused after it, and the delegation is visible on the room);
 *     suppression → a raised warning stays raised, listed and briefed as suppressed until the instant, prominent again after;
 *     follow_up   → an owned, dated item on the package's agenda, overdue after its date, completed by its owner with a note;
 *     scenario    → routed to the forecast owner, whose declaration names the request and fulfils it in the same write;
 *   withdrawn by the requester with the in-write effect reversed; a fulfilled act stands.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let admin: AuthenticatedPrincipal;
let P: { pkg: string; v: number; digest: string }; let roomId = ''; let briefingAgent: { agentId: string; principalId: string };
let warningId = ''; let delegate: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DIGEST = 'a'.repeat(64);
type Row = Record<string, unknown>;
const request = (payload: Row, as: AuthenticatedPrincipal = w.executive, purpose = 'decision') => w.exec.openRequest(h.req(as, 'executive.request', 'EXR', null, purpose), T(), D(), { payload }) as Promise<{ request: Row; run: Row | null }>;
const getRequest = (id: string, as: AuthenticatedPrincipal = w.executive) => w.exec.getRequest(h.req(as, 'executive.request.read', 'EXR', id, 'decision'), T(), D(), id) as Promise<{ request: Row & { events: Row[]; effect: Row } }>;
const listRequests = (as: AuthenticatedPrincipal = w.executive) => w.exec.listRequests(h.req(as, 'executive.request.read', 'EXR', null, 'decision'), T(), D(), { payload: {} }) as Promise<{ requests: Row[] }>;
const withdraw = (id: string, reason: string, as: AuthenticatedPrincipal = w.executive) => w.exec.withdrawRequest(h.req(as, 'executive.request.withdraw', 'EXR', id, 'decision'), T(), D(), id, { payload: { reason } }) as Promise<{ request: Row }>;
const events = async (eventType: string, since: Date) => (await sql<{ payload: Row; status: string }>`select payload, status from objects.object_outbox where event_type = ${eventType} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and created_at >= ${since} order by created_at`.execute(h.su)).rows;
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(h.su)).rows[0]!.t;
const subject = (object_type: string, object_id: string, extra: Row = {}) => ({ object_type, object_id, ...extra });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  admin = await h.humanWithSession(['tenant_admin'], 'tenant-admin', 'TENANT');
  P = await c.proposed();
  roomId = (await c.openRoom({ packageId: P.pkg, title: 'January corridor collapse — Regensburg line (B9 requests)', reviewEveryDays: 7 })).room.roomId;
  await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
  const base = { version: '1.0.0', codeDigest: DIGEST, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId, budgets: { max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000 } };
  briefingAgent = (await c.registerAgent({ kind: 'briefing', ...base }, admin)).agent;
  // the corridor warning: the fixture indicator raises it on evaluation
  await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', w.indicatorId), T(), D(), w.indicatorId, { payload: { knownAt: new Date().toISOString() } });
  warningId = String((await sql<{ id: string }>`select warning_id::text id from prediction.warnings_current where branch_id = ${w.branchId}::uuid order by raised_at desc limit 1`.execute(h.su)).rows[0]?.id);
  expect(warningId).toMatch(/^[0-9a-f-]{36}$/);
  // a decision owner who is NOT a member of the room: the delegate
  delegate = await h.humanWithSession(['decision_owner'], 'b9-delegate');
  // the forecast owner who answers a routed scenario request: a person with their own session (the ports record the acting principal)
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b9-forecast-owner');
}, 300_000);

afterAll(async () => {
  try { await h.app.get(SchedulerService).obliterateBriefingsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
});

describe('B9 · L10-I04 — a typed request is exactly-once under its key and digest, human-gated, and refuses stale context', () => {
  let first: Row; let since: Date;
  it('ANALYSIS: the executive\'s request runs the briefing agent under the agent\'s own session with trigger kind `request`; the request is fulfilled by the run; one ExecutiveActionRequested v1 is published', async () => {
    since = await mark();
    const r = await request({ kind: 'analysis', request_key: 'brief-2024-01-19', subject: subject('DRM', roomId, { task: 'briefing', agent_id: briefingAgent.agentId }), instruction: 'brief the room on the corridor before the Friday review' });
    first = r.request;
    expect(first).toMatchObject({ kind: 'analysis', repeated: false, routed_to: 'agent.run:briefing', state: 'fulfilled' });
    expect(r.run).not.toBeNull();
    expect(r.run).toMatchObject({ agent_id: briefingAgent.agentId, outcome: 'finished' });
    expect(first['routed_ref']).toBe(r.run!['run_id']);
    const run = (await sql<{ trigger_kind: string; trigger_ref: string; principal_id: string }>`select trigger_kind, trigger_ref, principal_id::text from executive.agent_runs where run_id = ${String(r.run!['run_id'])}::uuid`.execute(h.su)).rows[0]!;
    expect(run).toEqual({ trigger_kind: 'request', trigger_ref: String(first['request_id']), principal_id: briefingAgent.principalId });
    const ev = await events('ExecutiveActionRequested', since);
    expect(ev.length).toBe(1);
    expect(ev[0]!.payload).toMatchObject({ schema_version: 'v1', request_id: first['request_id'], kind: 'analysis', request_key: 'brief-2024-01-19', request_digest: first['request_digest'], routed_to: 'agent.run:briefing', requester: `principal:${w.executive.principalId}`, cause: { action: 'executive.request', target_type: 'EXR' } });
    const g = await getRequest(String(first['request_id']));
    expect(g.request['state']).toBe('fulfilled'); expect(g.request['routed_ref']).toBe(r.run!['run_id']);
    expect(g.request.events.map((e) => e['event'])).toEqual(['request.opened', 'request.fulfilled']);
  }, 120_000);

  it('EXACTLY ONCE: the same key with the same request returns the recorded request — no second run, no second event; the same key with a different instruction is refused; a new key is a new request', async () => {
    const runsBefore = (await sql<{ n: number }>`select count(*)::int n from executive.agent_runs where trigger_kind = 'request'`.execute(h.su)).rows[0]!.n;
    const again = await request({ kind: 'analysis', request_key: 'brief-2024-01-19', subject: subject('DRM', roomId, { task: 'briefing', agent_id: briefingAgent.agentId }), instruction: 'brief the room on the corridor before the Friday review' });
    expect(again.request).toMatchObject({ request_id: first['request_id'], repeated: true, state: 'fulfilled', routed_ref: first['routed_ref'] });
    expect(again.run).toBeNull();
    expect((await sql<{ n: number }>`select count(*)::int n from executive.agent_runs where trigger_kind = 'request'`.execute(h.su)).rows[0]!.n).toBe(runsBefore);
    expect((await events('ExecutiveActionRequested', since)).length).toBe(1);
    expect((await getRequest(String(first['request_id']))).request.events.map((e) => e['event'])).toEqual(['request.opened', 'request.fulfilled', 'request.repeated']);
    expect(await message(request({ kind: 'analysis', request_key: 'brief-2024-01-19', subject: subject('DRM', roomId, { task: 'briefing', agent_id: briefingAgent.agentId }), instruction: 'brief the room on the corridor AND the premium' }))).toMatch(/already used by this requester for a different request/);
    // another requester's identical key is their own boundary
    const theirs = await request({ kind: 'follow_up', request_key: 'brief-2024-01-19', subject: subject('DPK', P.pkg), instruction: 'confirm the reroute premium with the broker', due_at: new Date(Date.now() + 86_400_000).toISOString() }, w.owner);
    expect(theirs.request['repeated']).toBe(false);
  }, 120_000);

  it('HUMAN GATE and STALE CONTEXT: a workload with the executive\'s roles is refused before any port; a decision request naming a stale version, or a package already committed, is refused with the reason', async () => {
    const asWorkload: AuthenticatedPrincipal = { ...w.executive, kind: 'workload', assurance: 'agent_grant' };
    expect(await status(request({ kind: 'follow_up', request_key: 'wl-1', subject: {}, instruction: 'a workload filing a request', due_at: new Date(Date.now() + 3_600_000).toISOString() }, asWorkload))).toBe(403);
    expect(await status(request({ kind: 'follow_up', request_key: 'agent-1', subject: {}, instruction: 'an agent filing a request', due_at: new Date(Date.now() + 3_600_000).toISOString() }, w.agent))).toBe(403);
    const current = (await sql<{ v: number }>`select max(object_version)::int v from objects.canonical_objects where object_id = ${P.pkg}::uuid`.execute(h.su)).rows[0]!.v;
    expect(await message(request({ kind: 'decision', request_key: 'dec-stale', subject: subject('DPK', P.pkg, { version: current + 7 }), instruction: 'review the package at a version that does not exist' }))).toMatch(/stale_version/);
    const d = await request({ kind: 'decision', request_key: 'dec-1', subject: subject('DPK', P.pkg, { version: current }), instruction: 'review the reroute package before the booking deadline' });
    expect(d.request).toMatchObject({ state: 'routed', routed_to: 'decision.package.review' });
    const committed = await c.committed();
    expect(await message(request({ kind: 'decision', request_key: 'dec-committed', subject: subject('DPK', committed.pkg), instruction: 'reopen the committed package' }))).toMatch(/stale_approval.*already committed/);
    expect((await listRequests()).requests.map((r) => r['request_key'])).toEqual(expect.arrayContaining(['brief-2024-01-19', 'dec-1']));
    expect(await status(listRequests(w.approver2))).toBe(403); // an approver holds no executive read
  }, 120_000);
});

describe('B9 · L10-I04 — delegation, suppression, follow-up and the routed scenario request take their effect and remain visible', () => {
  it('DELEGATION (membership-level): the executive lends their standing in the room to a decision owner who is no member; the delegate reviews the room inside the window, is refused after it; the delegation is listed on the room and briefed as a window; revoked by withdrawal', async () => {
    expect(await message(c.review(roomId, 'the delegate before any delegation', delegate))).toMatch(/only a member of the room/);
    const until = new Date(Date.now() + 4_000).toISOString();
    const r = await request({ kind: 'delegation', request_key: 'del-1', subject: subject('DRM', roomId, { action: 'decision.review' }), instruction: 'cover the Friday review while I travel', delegate: delegate.principalId, until });
    expect(r.request).toMatchObject({ state: 'fulfilled', routed_to: 'executive.delegation' });
    expect((r.request['effect'] as Row)['note']).toMatch(/membership-level/);
    const rv = await c.review(roomId, 'reviewed under the executive\'s delegation', delegate);
    expect(rv.review.roomId).toBe(roomId);
    const room = (await c.getRoom(roomId, w.executive)).room as Row & { delegations: Row[] };
    expect(room.delegations).toHaveLength(1);
    expect(room.delegations[0]).toMatchObject({ to_principal_id: delegate.principalId, from_principal_id: w.executive.principalId, action: 'decision.review', status: 'live', live: true });
    const briefing = (await c.compose({ roomId, knownAt: new Date().toISOString() })).briefing as { windows: Row[] };
    expect(briefing.windows.find((x) => x['kind'] === 'delegation')).toMatchObject({ id: room.delegations[0]!['delegation_id'], owner: w.executive.principalId, overdue: false });
    // the delegate is not a member: the room's own membership list is unchanged; the delegate cannot read the room after the window
    expect((room['members'] as Row[]).some((m) => m['principal_id'] === delegate.principalId)).toBe(false);
    await sleep(4_200);
    expect(await message(c.review(roomId, 'the delegate after the window', delegate))).toMatch(/only a member of the room/);
    expect(((await c.getRoom(roomId, w.executive)).room as Row & { delegations: Row[] }).delegations[0]).toMatchObject({ status: 'expired', live: false });
    // a second, longer delegation, then withdrawn: revoked at once
    const r2 = await request({ kind: 'delegation', request_key: 'del-2', subject: subject('DRM', roomId), instruction: 'cover the reviews for the week', delegate: delegate.principalId, until: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    await c.review(roomId, 'reviewed under the second delegation', delegate);
    const wd = await withdraw(String(r2.request['request_id']), 'back from travel');
    expect(wd.request).toMatchObject({ state: 'withdrawn', reversed: 'delegation revoked' });
    expect(await message(c.review(roomId, 'the delegate after the revocation', delegate))).toMatch(/only a member of the room/);
    // the delegation names a room member's standing only: a non-member cannot lend what they lack; a delegation to oneself is refused
    expect(await message(request({ kind: 'delegation', request_key: 'del-x', subject: subject('DRM', roomId), instruction: 'a non-member lending the room', delegate: w.executive.principalId, until: new Date(Date.now() + 86_400_000).toISOString() }, delegate))).toMatch(/only a member of room/);
    expect(await message(request({ kind: 'delegation', request_key: 'del-self', subject: subject('DRM', roomId), instruction: 'delegating to myself', delegate: w.executive.principalId, until: new Date(Date.now() + 86_400_000).toISOString() }))).toMatch(/to another principal/);
  }, 120_000);

  it('SUPPRESSION: the corridor warning stays raised; the list and the briefing mark it suppressed until the instant; after expiry it is prominent again; a second suppression while one stands is refused', async () => {
    const before = (await sql<{ state: string }>`select state from prediction.warnings_current where warning_id = ${warningId}::uuid`.execute(h.su)).rows[0]!.state;
    expect(before).toBe('raised');
    const until = new Date(Date.now() + 3_000).toISOString();
    const r = await request({ kind: 'suppression', request_key: 'sup-1', subject: subject('WRN', warningId), instruction: 'rebooking decided; keep the record, quiet the alarm until the booking deadline', until });
    expect(r.request).toMatchObject({ state: 'fulfilled', routed_to: 'prediction.warning.suppress' });
    expect((r.request['effect'] as Row)['warning_state']).toBe('raised');
    expect((await sql<{ state: string }>`select state from prediction.warnings_current where warning_id = ${warningId}::uuid`.execute(h.su)).rows[0]!.state).toBe('raised');
    const listed = (await w.prediction.listWarnings(h.req(w.twinOwner, 'prediction.read', 'WRN', null, 'prediction'), T(), D(), { payload: { limit: 50 } }) as { warnings: Row[] }).warnings.find((x) => x['warning_id'] === warningId)!;
    expect(listed).toMatchObject({ state: 'raised', suppressed: true, suppressed_until: until });
    const b1 = (await c.compose({ roomId, knownAt: new Date().toISOString() })).briefing as { items: Row[]; windows: Row[] };
    const win = b1.windows.find((x) => x['id'] === warningId);
    expect(win).toMatchObject({ kind: 'warning-suppressed' });
    expect(String(win!['title'])).toMatch(/^suppressed until /);
    expect(await message(request({ kind: 'suppression', request_key: 'sup-2', subject: subject('WRN', warningId), instruction: 'suppress it again on top of the first', until: new Date(Date.now() + 86_400_000).toISOString() }))).toMatch(/already suppressed/);
    await sleep(3_200);
    const later = (await w.prediction.listWarnings(h.req(w.twinOwner, 'prediction.read', 'WRN', null, 'prediction'), T(), D(), { payload: { limit: 50 } }) as { warnings: Row[] }).warnings.find((x) => x['warning_id'] === warningId)!;
    expect(later).toMatchObject({ state: 'raised', suppressed: false, suppressed_until: null });
    const b2 = (await c.compose({ roomId, knownAt: new Date().toISOString() })).briefing as { windows: Row[] };
    expect(b2.windows.find((x) => x['id'] === warningId)).toMatchObject({ kind: 'warning-response' });
    // a briefing composed AS OF an instant inside the window shows the suppression as it stood then
    const bAsOf = (await c.compose({ roomId, knownAt: new Date(Date.parse(until) - 1_000).toISOString(), priorBriefingId: null })).briefing as { windows: Row[] };
    expect(bAsOf.windows.find((x) => x['id'] === warningId)).toMatchObject({ kind: 'warning-suppressed' });
    // the suppression's request is visible with its effect
    expect(((await getRequest(String(r.request['request_id']))).request.effect['suppression'] as Row)).toMatchObject({ warning_id: warningId, state: 'active' });
  }, 120_000);

  it('FOLLOW-UP: an owned, dated item on the package\'s agenda — in the workflow and the briefing, overdue after its date, completed by its owner with a note (not by a stranger), and withdrawn by the requester while open', async () => {
    const due = new Date(Date.now() + 2_500).toISOString();
    const r = await request({ kind: 'follow_up', request_key: 'fu-1', subject: subject('DPK', P.pkg), instruction: 'confirm SYN-SHIP-4468 rebooked', owner: w.owner.principalId, due_at: due });
    expect(r.request).toMatchObject({ state: 'fulfilled', routed_to: 'executive.follow_up' });
    const followUpId = String((r.request['effect'] as Row)['follow_up_id']);
    const wf = await w.exec.workflow(h.req(w.owner, 'decision.read', 'DPK', P.pkg, 'decision'), T(), D(), P.pkg) as { workflow: unknown[]; follow_ups: Row[] };
    expect(wf.follow_ups.find((f) => f['follow_up_id'] === followUpId)).toMatchObject({ status: 'open', overdue: false, owner_principal_id: w.owner.principalId, instruction: 'confirm SYN-SHIP-4468 rebooked' });
    const b1 = (await c.compose({ roomId, knownAt: new Date().toISOString() })).briefing as { windows: Row[] };
    expect(b1.windows.find((x) => x['id'] === followUpId)).toMatchObject({ kind: 'follow-up', overdue: false, owner: w.owner.principalId, closes_at: due });
    await sleep(2_700);
    const wf2 = await w.exec.workflow(h.req(w.owner, 'decision.read', 'DPK', P.pkg, 'decision'), T(), D(), P.pkg) as { follow_ups: Row[] };
    expect(wf2.follow_ups.find((f) => f['follow_up_id'] === followUpId)).toMatchObject({ status: 'overdue', overdue: true });
    const b2 = (await c.compose({ roomId, knownAt: new Date().toISOString() })).briefing as { windows: Row[] };
    expect(b2.windows.find((x) => x['id'] === followUpId)).toMatchObject({ kind: 'follow-up', overdue: true });
    const complete = (id: string, note: string, as: AuthenticatedPrincipal) => w.exec.completeFollowUp(h.req(as, 'executive.follow_up.complete', 'EXR', id, 'decision'), T(), D(), id, { payload: { note } }) as Promise<{ follow_up: Row }>;
    expect(await message(complete(followUpId, 'a stranger completing it', delegate))).toMatch(/completed by its owner or its requester/);
    const done = await complete(followUpId, 'rebooked on 21 January; booking reference in the shipment record', w.owner);
    expect(done.follow_up).toMatchObject({ state: 'done', was_overdue: true });
    const b3 = (await c.compose({ roomId, knownAt: new Date().toISOString() })).briefing as { windows: Row[] };
    expect(b3.windows.find((x) => x['id'] === followUpId)).toBeUndefined();
    expect(await message(withdraw(String(r.request['request_id']), 'withdrawing a completed follow-up'))).toMatch(/was completed — the act stands/);
    // an open follow-up withdrawn by its requester leaves the agenda
    const r2 = await request({ kind: 'follow_up', request_key: 'fu-2', subject: subject('DRM', roomId), instruction: 'ask the broker for the premium quote', due_at: new Date(Date.now() + 86_400_000).toISOString() });
    const f2 = String((r2.request['effect'] as Row)['follow_up_id']);
    expect((await withdraw(String(r2.request['request_id']), 'the broker called first')).request).toMatchObject({ state: 'withdrawn', reversed: 'follow-up withdrawn' });
    expect((await w.exec.workflow(h.req(w.owner, 'decision.read', 'DPK', P.pkg, 'decision'), T(), D(), P.pkg) as { follow_ups: Row[] }).follow_ups.find((f) => f['follow_up_id'] === f2)).toMatchObject({ status: 'withdrawn' });
  }, 120_000);

  it('SCENARIO (routed): the request waits on the forecast owner; their declaration names the request and fulfils it in the same write with the scenario as the answer; a fulfilled act is not withdrawn', async () => {
    const since = await mark();
    const r = await request({ kind: 'scenario', request_key: 'scn-1', subject: subject('FCT', w.forecastId), instruction: 'declare the Suez-return scenario on the current forecast with a weekly cadence' });
    expect(r.request).toMatchObject({ state: 'routed', routed_to: 'prediction.scenario.declare', routed_ref: null });
    expect((await events('ExecutiveActionRequested', since))[0]!.payload).toMatchObject({ kind: 'scenario', state: 'routed', routed_to: 'prediction.scenario.declare' });
    const requestId = String(r.request['request_id']);
    const scn = await w.prediction.declareScenario(h.req(forecastOwner, 'prediction.scenario.declare', 'SCN', null, 'prediction'), T(), D(),
      { payload: { requestId, title: 'Suez return over the next quarter', statement: 'the corridor reopens and the reroute premium unwinds', forecastId: w.forecastId, owner: forecastOwner.principalId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: forecastOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Corridor reopens', kind: 'upside', statement: 'transits recover above 60/day', indicatorId: w.indicatorId, owner: forecastOwner.principalId, consequence: 'rebook via Suez and release the premium', responseWindowHours: 48 },
                   ] } }) as { scenario: { scenarioId: string; fulfilled_request: Row } };
    expect(scn.scenario.fulfilled_request).toMatchObject({ request_id: requestId, state: 'fulfilled', routed_ref: scn.scenario.scenarioId });
    const g = await getRequest(requestId);
    expect(g.request).toMatchObject({ state: 'fulfilled', routed_ref: scn.scenario.scenarioId, fulfilled_by: forecastOwner.principalId });
    expect(g.request.events.map((e) => e['event'])).toEqual(['request.opened', 'request.fulfilled']);
    expect(await message(withdraw(requestId, 'withdrawing the answered request'))).toMatch(/the act stands/);
    // the register: L10-I04 is bound to this surface
    const reg = (await sql<{ binding_state: string; schema_version: string | null; bound_to: string | null }>`select binding_state, schema_version, bound_to from objects.interface_register where interface_id = 'L10-I04'`.execute(h.su)).rows[0]!;
    expect(reg.binding_state).toBe('bound'); expect(reg.schema_version).toBe('v1'); expect(String(reg.bound_to)).toMatch(/executive\/requests/);
  }, 120_000);
});

describe('B9 · the review\'s corrections (0067 §2): a request is fulfilled only by an act of its kind; a delegation falls with its lender\'s standing; the analysis request needs the authority to trigger an agent and records a refused run', () => {
  it('FULFIL binds the kind: a decision request is not fulfilled by a random id nor by a scenario, only by a package of this domain; a strategy owner cannot trigger an agent through an analysis request (refused before any request is recorded); a run the agent port refuses leaves the request REFUSED with the reason', async () => {
    const d = await request({ kind: 'decision', request_key: 'dec-2', subject: subject('DPK', P.pkg), instruction: 'review the reroute package once more' });
    const fulfil = (id: string, ref: string, as: AuthenticatedPrincipal = w.owner) => w.exec.fulfilRequest(h.req(as, 'executive.request.fulfil', 'EXR', id, 'decision'), T(), D(), id, { payload: { routed_ref: ref, note: 'answered' } }) as Promise<{ request: Row }>;
    const id = String(d.request['request_id']);
    expect(await message(fulfil(id, uuidv7()))).toMatch(/is not a decision package of this domain/);
    expect(await message(fulfil(id, w.scenarioId))).toMatch(/is not a decision package of this domain/);
    expect((await fulfil(id, P.pkg)).request).toMatchObject({ state: 'fulfilled', routed_ref: P.pkg });
    // the requester's authority to TRIGGER an agent is decided before the request is recorded
    const strategist = await h.humanWithSession(['strategy_owner'], 'b9-strategist-req');
    const before = (await sql<{ n: number }>`select count(*)::int n from executive.requests where requester_principal_id = ${strategist.principalId}::uuid`.execute(h.su)).rows[0]!.n;
    expect(await status(request({ kind: 'analysis', request_key: 'st-brief', subject: subject('DRM', roomId, { task: 'briefing' }), instruction: 'a strategy owner asking for a briefing run' }, strategist))).toBe(403);
    expect((await sql<{ n: number }>`select count(*)::int n from executive.requests where requester_principal_id = ${strategist.principalId}::uuid`.execute(h.su)).rows[0]!.n).toBe(before);
    // a run the agent port refuses (the reporting agent asked to brief): the request is recorded and refused with the port's reason, never left routed
    const reporting = (await c.registerAgent({ kind: 'reporting', version: '1.0.0', codeDigest: DIGEST, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId, budgets: { max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000 } }, admin)).agent;
    const refused = await status(request({ kind: 'analysis', request_key: 'brief-by-reporting', subject: subject('DRM', roomId, { task: 'briefing', agent_id: reporting.agentId }), instruction: 'brief through the reporting agent' }));
    expect(refused).toBe(409);
    const row = (await sql<{ state: string; refusal: string | null }>`select state, refusal from executive.requests where requester_principal_id = ${w.executive.principalId}::uuid and request_key = 'brief-by-reporting'`.execute(h.su)).rows[0]!;
    expect(row.state).toBe('refused'); expect(String(row.refusal)).toMatch(/agent run was refused/);
  }, 120_000);

  it('DELEGATION falls with the lender: the executive lends the room to the delegate, then is removed from the room — the delegate\'s standing is gone with the lender\'s', async () => {
    const r = await request({ kind: 'delegation', request_key: 'del-3', subject: subject('DRM', roomId), instruction: 'cover the reviews next week', delegate: delegate.principalId, until: new Date(Date.now() + 7 * 86_400_000).toISOString() });
    expect(r.request['state']).toBe('fulfilled');
    await c.review(roomId, 'reviewed under the third delegation', delegate);
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'remove' });
    expect(await message(c.review(roomId, 'the delegate after the lender left the room', delegate))).toMatch(/only a member of the room/);
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    expect((await c.review(roomId, 'the delegate once the lender is back', delegate)).review.roomId).toBe(roomId);
  }, 120_000);
});
