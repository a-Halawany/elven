/**
 * CP-6 B36 · part H — THE EXECUTIVE HOME, THE CADENCE AND THE COMMAND VIEWS (F-P6-11; 0094 §H), through the real database and controllers.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case: h1 the HOME in one read (the seven sections with their as-of, count, limitations
 * and the context they were read under) and the CADENCE (opened; the LOOP RESET closing the cycle with its closing record and opening the
 * next; open board-class decisions refusing the reset until the EXECUTIVE confirms with a reason — an operator's confirmation refused);
 * h2 the CONTEXT SWITCHER (§0's set_context through this part's only route; every section re-read under the new context and naming its
 * digest; a stale scenario shown stale and refused) and the COMMAND VIEWS (role × moment, composed from the same read; a view of a role
 * not held refused); h3 the SCENARIO ROOM and the OBJECTIVE REVIEW bound to their subject with a deadline and the separation of duties
 * (the objective's owner opens no review of it, chairs none), an OVERDUE room raising ONE attention item through the tick step
 * room-deadlines; h4 the SEARCH with explanation and its access ledger (no bodies); h5 the EXECUTIVE OPERATOR (PER-03): the agenda, a
 * gap escalated to the executive, work routed through the EXISTING delegation and reassignment ports, and the operator refused at the
 * PDP on approve / decide / commit / distribute / publish (each denial recorded); h6 the METRICS computed on read from the ledgers.
 * SYNTHETIC world (bootDecisionWorld); every figure is SYNTHETIC. Redis :6392 for the real dispatcher and the attention tick
 * (AttentionTimerService.tickNow). The hosted browser case is e2e/phase6-b36-home.demo.spec.ts (not run here).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { HomeController } from '../../src/executive/home/home.controller.js';
import { WorkflowController } from '../../src/executive/workflow/workflow.controller.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
type Section = { as_of: string; count: number; items: Row[]; limitations: string[]; context: string | null };
type Home = { read_at: string; as_of: string; context: Row; ceiling: Row; sections: Record<string, Section> & { cadence: Section & { open: Row | null; last_closed: Row | null; agenda: Row[]; escalations: Row[]; closed_since: Row | null } } };
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let hc: HomeController; let wc: WorkflowController;
let scheduler: SchedulerService; let timer: AttentionTimerService; let commitDb: Db;
let executive: AuthenticatedPrincipal; let operator: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let roleless: AuthenticatedPrincipal; let objectiveOwner: AuthenticatedPrincipal; let forecastOwner: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let agentId = ''; let tickDay = 1;
/** What the cases leave one another. */
let cadenceId = ''; let committed: { pkg: string; v: number; digest: string; commitmentId: string }; let roomId = ''; let warningId = ''; let boardPkg = '';
let objectiveRoom = ''; let scenarioRoom = ''; let reviewId = ''; let overdueItem = ''; let staleScenario = ''; let escalationId = ''; let escalationItem = ''; let contextDigest = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const DAY = 86_400_000;
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B24/B34/B36 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};
const evidence = (caseName: string, e: Row): void => console.log(`B36 HOME EVIDENCE ${caseName}: ${JSON.stringify(e).slice(0, 1500)}`);

/* ───────────── the routes (in process) ───────────── */
const H = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'executive');
const readHome = (as: AuthenticatedPrincipal, limit = 10) => (hc.read(H(as, 'executive.home.read', 'HOM'), T(), D(), { payload: { limit } }) as unknown as Promise<{ home: Home }>).then((r) => r.home);
const setContext = (as: AuthenticatedPrincipal, payload: Row) => hc.setContext(H(as, 'executive.context.set', 'CTX'), T(), D(), { payload }) as unknown as Promise<{ context: Row }>;
const choices = (as: AuthenticatedPrincipal) => (hc.contextChoices(H(as, 'executive.home.read', 'CTX'), T(), D()) as unknown as Promise<{ choices: Row & { objectives: Row[]; scenarios: Row[]; current: Row | null } }>).then((r) => r.choices);
const openCadence = (as: AuthenticatedPrincipal, period = 'weekly') => (hc.openCadence(H(as, 'executive.cadence.open', 'CAD'), T(), D(), { payload: { period } }) as unknown as Promise<{ cadence: Row }>).then((r) => r.cadence);
const resetCadence = (as: AuthenticatedPrincipal, period = 'weekly', confirmReason?: string) => (hc.resetCadence(H(as, 'executive.cadence.reset', 'CAD'), T(), D(), { payload: confirmReason === undefined ? { period } : { period, confirmReason } }) as unknown as Promise<{ reset: Row & { closed: Row; opened: Row; confirmed: boolean } }>).then((r) => r.reset);
const getCadence = (as: AuthenticatedPrincipal, period?: string) => (hc.getCadence(H(as, 'executive.home.read', 'CAD'), T(), D(), { payload: period === undefined ? {} : { period } }) as unknown as Promise<{ cadence: Row & { open: Row | null; agenda: Row[]; escalations: Row[] } }>).then((r) => r.cadence);
const openRoom = (as: AuthenticatedPrincipal, payload: Row) => (hc.openRoom(H(as, 'executive.room.open', 'DRM'), T(), D(), { payload }) as unknown as Promise<{ room: Row }>).then((r) => r.room);
const views = (as: AuthenticatedPrincipal) => hc.listViews(H(as, 'executive.home.read', 'CVW'), T(), D()) as unknown as Promise<{ views: Row[]; context: Row | null }>;
const view = (as: AuthenticatedPrincipal, viewKey: string) => (hc.readView(H(as, 'executive.home.read', 'CVW'), T(), D(), { payload: { viewKey } }) as unknown as Promise<{ view: Row & { sections: Record<string, Section>; sections_order: string[]; actions: string[]; context: Row } }>).then((r) => r.view);
const search = (as: AuthenticatedPrincipal, q: string, limit?: number) => (hc.search(H(as, 'executive.search', 'SCH'), T(), D(), { payload: limit === undefined ? { q } : { q, limit } }) as unknown as Promise<{ search: Row & { hits: Row[]; count: number; kinds: Row; search_id: string } }>).then((r) => r.search);
const setAgenda = (as: AuthenticatedPrincipal, cadence: string, items: Row[]) => (hc.setAgenda(H(as, 'executive.agenda.set', 'AGD', cadence), T(), D(), { payload: { cadenceId: cadence, items } }) as unknown as Promise<{ agenda: Row & { items: Row[] } }>).then((r) => r.agenda);
const escalate = (as: AuthenticatedPrincipal, payload: Row) => (hc.escalate(H(as, 'executive.escalation.raise', 'ESC'), T(), D(), { payload }) as unknown as Promise<{ escalation: Row }>).then((r) => r.escalation);
const answer = (as: AuthenticatedPrincipal, id: string, text: string) => (hc.answerEscalation(H(as, 'executive.escalation.answer', 'ESC', id), T(), D(), id, { payload: { answer: text } }) as unknown as Promise<{ escalation: Row }>).then((r) => r.escalation);
const metrics = (as: AuthenticatedPrincipal, payload: Row = {}) => (hc.metrics(H(as, 'executive.metrics.read', 'MET'), T(), D(), { payload }) as unknown as Promise<{ metrics: Row & { metrics: Row[]; window: Row; stored: boolean } }>).then((r) => r.metrics);
const convene = (as: AuthenticatedPrincipal, payload: Row) => (w.exec.conveneReview(h.req(as, 'executive.review.convene', 'RVW', null, 'executive'), T(), D(), { payload }) as unknown as Promise<{ review: Row }>).then((r) => r.review);
const conclude = (as: AuthenticatedPrincipal, id: string, note: string) => w.exec.concludeReview(h.req(as, 'executive.review.close', 'RVW', id, 'executive'), T(), D(), id, { payload: { note } }) as unknown as Promise<{ review: Row }>;
const acknowledge = (as: AuthenticatedPrincipal, itemId: string) => w.exec.acknowledgeAttentionItem(H(as, 'executive.attention.item.acknowledge', 'ATI', itemId), T(), D(), itemId, { payload: { note: 'seen (B36 home harness)' } });
const delegate = (as: AuthenticatedPrincipal, itemId: string, to: string, key: string) => (w.exec.delegateAttentionItem(H(as, 'executive.attention.item.delegate', 'ATI', itemId), T(), D(), itemId, { payload: { to, reason: 'routed by the chief of staff (B36 home harness)', until: inDays(2), request_key: key } }) as unknown as Promise<{ delegation: Row }>).then((r) => r.delegation);
const reassign = (as: AuthenticatedPrincipal, taskId: string, to: string) => (wc.reassignTask(H(as, 'executive.task.reassign', 'HTK', taskId), T(), D(), taskId, { payload: { to, reason: 'routed by the chief of staff (B36 home harness)' } }) as unknown as Promise<{ task: Row }>).then((r) => r.task);
const publishPolicy = (rules: Row) => w.exec.publishAttentionPolicy(H(executive, 'executive.attention.policy.publish', 'ATP'), T(), D(), { payload: { rules, reason: 'the B36 home harness policy (SYNTHETIC)' } as never }) as unknown as Promise<{ policy: Row }>;
const processWarnings = () => w.prediction.processWarningCandidates(h.req(forecastOwner, 'prediction.warning.candidates.process', 'WRN', null), T(), D(), { payload: {} } as never) as unknown as Promise<{ processing: { raised: Row[] } }>;
const submitWarning = (title: string) => inCommitContext(commitDb, { sessionId: forecastOwner.sessionId as string, contextKey: forecastOwner.contextKey as string }, { tenantId: T(), domainId: D() },
  'prediction.warning.raise', uuidv7(), async (tx) => (await sql<{ r: Row }>`select prediction.submit_warning_candidate(${T()}::uuid, ${D()}::uuid, 'weak_signal', ${'b36h-' + uuidv7().slice(-8)},
    ${JSON.stringify({ synthetic: true })}::jsonb, ${title}, 'C2', 0.7::numeric, ${'incident:b36-home:' + uuidv7().slice(-6)},
    ${JSON.stringify({ objectives: [w.objectiveId], geographies: ['REGENSBURG'], horizon: '30d' })}::jsonb,
    ${JSON.stringify([{ object_id: w.evd.id, version: w.evd.version, source_id: h.fx.sourceId, stance: 'supporting' }])}::jsonb, ${72}::int, ${forecastOwner.principalId}::uuid, ${uuidv7()}::uuid) as r`.execute(tx as never)).rows[0]!.r);
const tick = async () => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, tickDay++)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  return t;
};

/* ───────────── the rows ───────────── */
const items = async (cls: string) => (await sql<Row>`select item_id::text, signal_class, subject_kind, subject_id::text, state, owner_principal_id::text owner, cause_event_type, title, details from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${cls} order by created_at`.execute(su)).rows;
const cadenceEvents = async (id: string) => (await sql<{ event: string; details: Row }>`select event, details from executive.cadence_events where cadence_id = ${id}::uuid order by occurred_at`.execute(su)).rows;
const searchEvents = async () => (await sql<Row>`select search_id::text, principal_id::text, query, hits, kinds, context_digest from executive.search_events where tenant_id = ${T()}::uuid order by searched_at`.execute(su)).rows;
const roomEvents = async (room: string, event: string) => (await sql<{ details: Row }>`select details from executive.room_events where room_id = ${room}::uuid and event = ${event} order by occurred_at`.execute(su)).rows;
const deniedCount = async (action: string) => Number((await sql<{ n: string }>`select count(*)::text n from audit.audit_events where tenant_id = ${T()}::uuid and action = ${action} and outcome = 'denied'`.execute(su)).rows[0]!.n);
const gateTask = async (pkg: string) => (await sql<{ task_id: string; assignee: string; state: string }>`select task_id::text, assignee_principal_id::text assignee, state from executive.human_tasks where kind = 'gate.approve' and (subject ->> 'id' = ${pkg} or subject ->> 'package_id' = ${pkg}) order by opened_at`.execute(su)).rows;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su as AnyDb;
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  hc = h.app.get(HomeController); wc = h.app.get(WorkflowController);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService); commitDb = h.app.get<Db>(COMMIT_DB);
  executive = w.executive; owner = w.owner;
  operator = await h.humanWithSession(['executive_operator'], 'b36h-chief-of-staff');
  strategist = await h.humanWithSession(['strategy_owner'], 'b36h-strategy-owner');
  auditor = await h.humanWithSession(['auditor'], 'b36h-auditor', 'TENANT');
  analyst = await h.humanWithSession(['domain_analyst'], 'b36h-analyst');
  roleless = await h.principalWith([], 'b36h-roleless');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b36h-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b36h-domain-admin');
  forecastOwner = await h.humanWithSession(['forecast_owner'], 'b36h-forecast-owner');
  // the objective's OWNER (bootDecisionWorld's twin owner, a strategy owner) acting in their own session — the SoD probe
  objectiveOwner = await h.openSession(w.twinOwner);
  // the attention policy (SYNTHETIC): review.convened routed to the executive — the overdue-room item and the review items; warning.raised likewise
  await publishPolicy({ classes: {
    'review.convened': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['executive'], ack_within_minutes: 1440 },
    'warning.raised': { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['executive'], ack_within_minutes: 1440 } } });
  // the attention agent (the tick's host); its first scheduled tick waited for, then unscheduled — the ticks below are the harness's
  const r = await w.exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
  // the decisions of the world: one committed (its tracker root item, its room), one proposed and RESERVED for the board (in flight)
  committed = await c.committed();
  roomId = (await c.openRoom({ packageId: committed.pkg, title: 'Cape reroute decision room (SYNTHETIC)', reviewEveryDays: 7 }, owner)).room.roomId;
  await c.membership(roomId, { principal: executive.principalId, role: 'observer', op: 'add' }, owner);
  const b = await c.fullDraft();
  boardPkg = b.pkg;
  await w.decisions.reserveBoard(h.req(executive, 'decision.board.reserve', 'DPK', boardPkg, 'decision'), T(), D(), boardPkg, { payload: { board: { charter: 'The supervisory board (SYNTHETIC)', quorum: 2 }, rationale: 'Reserved for the board (B36 home harness).' } });
  await c.propose(boardPkg, b.v);
  // a SYNTHETIC warning through the B28 intake: submitted, then processed (raised inside its response window)
  await submitWarning('Regensburg: a bearings shipment held at customs (SYNTHETIC)');
  const p = await processWarnings();
  warningId = String(p.processing.raised[0]?.['warning_id'] ?? p.processing.raised[0]?.['warningId'] ?? '');
  if (warningId === '') warningId = String((await sql<{ id: string }>`select warning_id::text id from prediction.warnings_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and state = 'raised' order by raised_at desc limit 1`.execute(su)).rows[0]?.id ?? '');
}, 600_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('h1 · THE EXECUTIVE HOME in one read and THE CADENCE with its loop reset (WS-01, JRN-19)', () => {
  it('h1 · POSITIVE: the executive opens the weekly cadence; the home answers seven sections, each with its as-of, count, limitations and context; the committed decision in its room with its gate state, its tracker item, the warning in its window; the reset closes the cycle with its closing record and opens the next', async () => {
    const cad = await openCadence(executive);
    expect(cad).toMatchObject({ period: 'weekly', sequence: 1, open: true, opened_by: executive.principalId });
    cadenceId = String(cad['cadence_id']);
    const home = await readHome(executive);
    expect(Object.keys(home.sections).sort()).toEqual(['cadence', 'commitments', 'decisions', 'intelligence', 'outcomes', 'priorities', 'warnings']);
    for (const [name, s] of Object.entries(home.sections)) {
      expect(typeof s.as_of, name).toBe('string'); expect(typeof s.count, name).toBe('number'); expect(Array.isArray(s.limitations) && s.limitations.length > 0, `${name} declares its limitations`).toBe(true);
    }
    expect(home.context).toMatchObject({ set: false, horizon: '90d' });
    expect(home.ceiling).toMatchObject({ reader: 'confidential', effective: 'confidential' }); // the executive's clearance, no context lowering it
    // decisions: the room of the committed package with the gates part's uniform state (present on this base), the board-class package in flight
    const room = home.sections['decisions']!.items.find((x) => x['room_id'] === roomId)!;
    expect(room).toMatchObject({ kind: 'decision', package_id: committed.pkg, package_state: 'committed' });
    expect((room['gate'] as Row)['state']).toBe('approved');
    expect(home.sections['decisions']!.items.find((x) => x['package_id'] === boardPkg)).toMatchObject({ decision_class: 'board', package_state: 'proposed', room_id: null });
    // commitments: the tracker's root obligation of the committed decision (0090's seed: due 30 days after the commitment — inside the 90d horizon, not overdue)
    const cmt = home.sections['commitments']!.items.find((x) => x['package_id'] === committed.pkg)!;
    expect(cmt).toMatchObject({ kind: 'obligation', overdue: false, state: 'open' });
    expect(new Date(String(cmt['due_at'])).getTime() - Date.now()).toBeLessThan(31 * DAY);
    expect(home.sections['commitments']!.limitations.some((l) => l.includes('horizon 90d'))).toBe(true);
    // warnings: the SYNTHETIC warning inside its response window
    expect(warningId).not.toBe('');
    expect(home.sections['warnings']!.items.some((x) => x['warning_id'] === warningId)).toBe(true);
    // intelligence: the ceiling is said (nothing hidden for a confidential reader here)
    expect(home.sections['intelligence']!.limitations.some((l) => /ceiling confidential/.test(l))).toBe(true);
    // outcomes: since the cadence opened (none recorded since)
    expect(home.sections['outcomes']!.limitations.some((l) => l.startsWith('the outcomes recorded since the open cadence opened'))).toBe(true);
    // the cadence: open, with what closed since (nothing yet) and the board-class decision counted
    expect((home.sections.cadence.open as Row)['cadence_id']).toBe(cadenceId);
    expect(((home.sections.cadence.closed_since as Row)['left_open'] as Row)['board_decisions_open']).toHaveLength(1);
    // THE RESET is refused while the board-class decision stands (h1 REFUSAL proves it); the board package withdrawn, the reset closes the cycle
    await c.withdraw(boardPkg, 'withdrawn to let the cycle close (B36 home harness)', owner);
    const reset = await resetCadence(executive);
    expect(reset.confirmed).toBe(false);
    expect(reset.closed).toMatchObject({ cadence_id: cadenceId, open: false, closed_by: executive.principalId });
    expect(reset.opened).toMatchObject({ sequence: 2, open: true });
    const record = reset.closed['closing_record'] as Row;
    expect(Object.keys(record).sort()).toEqual(['committed', 'decided', 'left_open', 'reviewed', 'window']);
    expect((record['decided'] as Row)['withdrawn']).toBe(1);
    expect((record['left_open'] as Row)['board_decisions_open']).toEqual([]);
    expect((await cadenceEvents(cadenceId)).map((e) => e.event)).toEqual(['cadence.opened', 'cadence.reset']);
    cadenceId = String(reset.opened['cadence_id']);
    expect((await cadenceEvents(cadenceId)).map((e) => e.event)).toEqual(['cadence.opened']);
    // the closed cycle's record reads on the home now
    const after = await readHome(executive);
    expect((after.sections.cadence.last_closed as Row)['sequence']).toBe(1);
    evidence('h1-positive', { sections: Object.fromEntries(Object.entries(after.sections).map(([k, s]) => [k, { count: s.count, limitations: s.limitations }])), record });
  });

  it('h1 · REFUSAL: a second weekly cadence (409), the analyst opening one (403 at the PDP), the reset over an open board-class decision without a reason (409), the operator confirming it (403), a reset of a period with no open cadence (409), a roleless reader (403)', async () => {
    await refused(openCadence(executive), /^cadence rejected \(state\): a weekly cadence is already open/, 409);
    await refused(openCadence(analyst), /./, 403);
    // a board-class decision proposed again: the reset needs the executive's confirmation
    const b = await c.fullDraft();
    boardPkg = b.pkg;
    await w.decisions.reserveBoard(h.req(executive, 'decision.board.reserve', 'DPK', boardPkg, 'decision'), T(), D(), boardPkg, { payload: { board: { charter: 'The supervisory board (SYNTHETIC)', quorum: 2 }, rationale: 'Reserved for the board (B36 home harness).' } });
    await c.propose(boardPkg, b.v);
    await refused(resetCadence(executive), /^cadence rejected \(state\): \d+ board-class decision\(s\) remain open; the executive confirms the reset with a reason/, 409);
    await refused(resetCadence(operator, 'weekly', 'the board meets next week; the cycle closes now (operator)'), /^cadence rejected \(actor\): only the executive confirms a reset over \d+ open board-class decision\(s\)/, 403);
    await refused(resetCadence(executive, 'weekly', 'short'), /^cadence rejected \(reason\)/, 422);
    await refused(resetCadence(executive, 'monthly'), /^cadence rejected \(state\): no monthly cadence is open/, 409);
    await refused(readHome(roleless), /./, 403);
    expect((await getCadence(executive)).open).toMatchObject({ cadence_id: cadenceId, sequence: 2 });
  });

  it('h1 · RECOVERY: the executive confirms the reset with a reason — the cycle closes (the confirmation in its record), the next opens; the operator may open the next period', async () => {
    const boardOpen = Number((await sql<{ n: string }>`select count(*)::text n from decision.packages_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and decision_class = 'board' and state in ('proposed', 'under_review', 'approved')`.execute(su)).rows[0]!.n);
    expect(boardOpen).toBeGreaterThanOrEqual(1);
    const reset = await resetCadence(executive, 'weekly', 'the board decides the second source on Thursday; the weekly loop closes now (B36 home harness)');
    expect(reset.confirmed).toBe(true);
    expect(((reset.closed['closing_record'] as Row)['confirmed'] as Row)).toMatchObject({ by: executive.principalId, board_decisions_open: boardOpen });
    expect(reset.opened).toMatchObject({ sequence: 3, open: true });
    expect((await cadenceEvents(cadenceId)).map((e) => e.event)).toEqual(['cadence.opened', 'cadence.reset_confirmed']);
    cadenceId = String(reset.opened['cadence_id']);
    const monthly = await openCadence(operator, 'monthly');
    expect(monthly).toMatchObject({ period: 'monthly', sequence: 1, opened_by: operator.principalId });
    expect((await getCadence(executive)).open).toMatchObject({ period: 'weekly', sequence: 3 }); // the weekly cycle is the home's first
  });
});

describe('h2 · THE CONTEXT SWITCHER (§0 through this part\'s route) and THE COMMAND VIEWS (role × moment)', () => {
  it('h2 · POSITIVE: the executive sets the context (the objective, 30d, the scenario, internal); every section re-reads under it and names its digest; the decisions linked to the objective stay, the ceiling lowers to the context\'s; the executive holds two views; executive/morning composes four sections from the same read', async () => {
    const ch = await choices(executive);
    expect(ch.objectives.find((o) => o['id'] === w.objectiveId)).toMatchObject({ stale: false, status: 'active' });
    expect(ch.scenarios.find((s) => s['id'] === w.scenarioId)).toMatchObject({ stale: false, state: 'active' });
    expect(ch.current).toBeNull();
    const ctx = await setContext(executive, { objectiveId: w.objectiveId, horizon: '30d', scenarioId: w.scenarioId, classification: 'internal' });
    contextDigest = String(ctx.context['digest']);
    expect(contextDigest).toMatch(/^[0-9a-f]{64}$/);
    const home = await readHome(executive);
    expect(home.context).toMatchObject({ set: true, digest: contextDigest, objective_id: w.objectiveId, scenario_id: w.scenarioId, horizon: '30d' });
    expect(home.ceiling).toMatchObject({ reader: 'confidential', context: 'internal', effective: 'internal' });
    for (const [name, s] of Object.entries(home.sections)) expect(s.context, name).toBe(contextDigest);
    // the committed decision's version names the objective: its room stays under the objective context
    expect(home.sections['decisions']!.items.some((x) => x['room_id'] === roomId)).toBe(true);
    expect(home.sections['commitments']!.limitations.some((l) => l.includes(`filtered to the items linked to objective ${w.objectiveId}`))).toBe(true);
    expect(home.sections['commitments']!.limitations.some((l) => l.includes('horizon 30d'))).toBe(true);
    // the views: the executive's two, composed from the same read under the same context
    const v = await views(executive);
    expect(v.views.map((x) => x['view_key'])).toEqual(['executive/board-day', 'executive/morning']);
    expect((v.context as Row)['digest']).toBe(contextDigest);
    const morning = await view(executive, 'executive/morning');
    expect(morning.sections_order).toEqual(['priorities', 'warnings', 'intelligence', 'decisions']);
    expect(Object.keys(morning.sections).sort()).toEqual(['decisions', 'intelligence', 'priorities', 'warnings']);
    expect(morning.sections['decisions']!.count).toBe(home.sections['decisions']!.count);
    expect(morning.context['digest']).toBe(contextDigest);
    expect(morning.actions).toEqual(['acknowledge_item', 'open_room', 'set_context']);
    const boardDay = await view(executive, 'executive/board-day');
    expect(boardDay.sections_order).toEqual(['decisions', 'commitments', 'outcomes', 'cadence']);
    evidence('h2-positive', { context: home.context, ceiling: home.ceiling, morning: morning.sections_order, decisions: home.sections['decisions']!.count });
  });

  it('h2 · REFUSAL: a stale scenario (closed) is shown stale and refused before the port (409 context rejected (stale)); an unknown objective refused by the port (409); the operator opening the executive\'s view (403 command view rejected (role)); an unknown view (404); the analyst on a view of a role it lacks (403); a malformed horizon (422)', async () => {
    // a second SYNTHETIC scenario, then CLOSED by fixture (no product route closes a scenario at 0094; the state is the table's own vocabulary)
    const scn = await w.prediction.declareScenario(h.req(w.twinOwner, 'prediction.scenario.declare', 'SCN', null), T(), D(), { payload: { title: 'A stale scenario (SYNTHETIC)', statement: 'closed before the switcher reads it', forecastId: w.forecastId, owner: w.twinOwner.principalId, reviewCadence: 'weekly',
      branches: [{ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: w.twinOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 }] } } as never) as unknown as { scenario: { scenarioId: string } };
    staleScenario = scn.scenario.scenarioId;
    await sql`update prediction.scenarios_current set state = 'closed', updated_at = clock_timestamp() where scenario_id = ${staleScenario}::uuid`.execute(su);
    expect((await choices(executive)).scenarios.find((s) => s['id'] === staleScenario)).toMatchObject({ stale: true, state: 'closed' });
    await refused(setContext(executive, { objectiveId: w.objectiveId, horizon: '30d', scenarioId: staleScenario, classification: 'internal' }), /^context rejected \(stale\): scenario .* is closed; a stale scenario cannot be set/, 409);
    await refused(setContext(executive, { objectiveId: uuidv7(), horizon: '30d', scenarioId: null, classification: 'internal' }), /^context rejected \(stale\): objective .* is not a live strategy object of this domain/, 409);
    await refused(setContext(executive, { horizon: '7d' }), /horizon is one of 30d, 90d, 12m, 36m/, 422);
    await refused(view(operator, 'executive/morning'), /^command view rejected \(role\): the view executive\/morning is the executive's/, 403);
    await refused(view(executive, 'executive/lunch'), /^command view rejected \(unknown_view\)/, 404);
    await refused(view(analyst, 'decision_owner/review'), /^command view rejected \(role\)/, 403);
    await refused(view(executive, 'nonsense'), /viewKey is role\/moment/, 422);
    // the refused choices left the context standing
    expect((await readHome(executive)).context['digest']).toBe(contextDigest);
    expect((await views(operator)).views.map((x) => x['view_key'])).toEqual(['executive_operator/cadence-prep']);
    expect((await views(analyst)).views).toEqual([]);
  });

  it('h2 · RECOVERY: the executive sets the context back to the whole domain (a new context supersedes the old; the old superseded, never edited); the sections read unfiltered; the operator reads its own view', async () => {
    const before = String((await readHome(executive)).context['context_id']);
    const ctx = await setContext(executive, { horizon: '90d', classification: 'confidential' });
    expect(ctx.context['supersedes']).toBe(before);
    const home = await readHome(executive);
    expect(home.context).toMatchObject({ set: true, objective_id: null, scenario_id: null, horizon: '90d' });
    expect(home.ceiling).toMatchObject({ effective: 'confidential' });
    expect(home.sections['commitments']!.limitations.some((l) => l.includes('filtered to the items linked'))).toBe(false);
    const rows = (await sql<{ context_id: string; superseded: boolean }>`select context_id::text, superseded_at is not null superseded from executive.contexts where principal_id = ${executive.principalId}::uuid order by set_at`.execute(su)).rows;
    expect(rows.map((r) => r.superseded)).toEqual([true, false]); // h2 POSITIVE's context superseded; the refused choices of h2 REFUSAL recorded none
    contextDigest = String(home.context['digest']);
    const prep = await view(operator, 'executive_operator/cadence-prep');
    expect(prep.sections_order).toEqual(['cadence', 'priorities', 'decisions', 'commitments']);
    expect(prep.actions).toEqual(['set_agenda', 'route_work', 'escalate_gap']);
  });
});

describe('h3 · SCENARIO ROOMS and OBJECTIVE REVIEWS bound to their subject, with a deadline and the separation of duties', () => {
  it('h3 · POSITIVE: the strategy owner (not the objective\'s owner) opens an objective review on the objective with a deadline; the executive opens a scenario room; a governed review convened around the objective in that room with a chair who is not its owner; the home\'s decisions section lists both rooms with their kind, subject and deadline', async () => {
    const or = await openRoom(strategist, { kind: 'objective_review', subjectId: w.objectiveId, title: 'Corridor objective review (SYNTHETIC)', deadline: inDays(2) });
    expect(or).toMatchObject({ kind: 'objective_review', subject_id: w.objectiveId, owner: strategist.principalId });
    objectiveRoom = String(or['room_id']);
    const sr = await openRoom(executive, { kind: 'scenario', subjectId: w.scenarioId, title: 'Bab el-Mandeb scenario room (SYNTHETIC)', deadline: inDays(1), reviewEveryDays: 3 });
    expect(sr).toMatchObject({ kind: 'scenario', subject_id: w.scenarioId });
    scenarioRoom = String(sr['room_id']);
    expect((await roomEvents(objectiveRoom, 'room.opened'))[0]!.details).toMatchObject({ kind: 'objective_review', subject_id: w.objectiveId, subject_owner: w.twinOwner.principalId });
    const rv = await convene(executive, { subject: { kind: 'objective', id: w.objectiveId }, question: 'Does the corridor objective still hold under the reroute? (SYNTHETIC)', chair: strategist.principalId, reviewers: [owner.principalId],
      due_at: inDays(2), convene_key: 'b36h-' + 'objective-review', room_id: objectiveRoom });
    expect(rv).toMatchObject({ state: 'convened', subject_kind: 'objective', chair: strategist.principalId, room_id: objectiveRoom });
    reviewId = String(rv['review_id']);
    const home = await readHome(executive, 50);
    const rooms = home.sections['decisions']!.items;
    expect(rooms.find((x) => x['room_id'] === objectiveRoom)).toMatchObject({ kind: 'objective_review', subject_id: w.objectiveId, overdue: false, gate: null, gate_basis: 'a subject room has no gate' });
    expect(rooms.find((x) => x['room_id'] === scenarioRoom)).toMatchObject({ kind: 'scenario', subject_id: w.scenarioId, overdue: false });
    evidence('h3-positive', { objectiveRoom, scenarioRoom, reviewId });
  });

  it('h3 · REFUSAL: the objective\'s owner opening a review of it (403 separation_of_duties), chairing one (403), reviewing one (403); a deadline in the past (422), an unknown subject (404), a second room on the same subject while the first stands (409), the analyst (403 at the PDP), a decision kind (422)', async () => {
    await refused(openRoom(objectiveOwner, { kind: 'objective_review', subjectId: w.objectiveId, title: 'My own review (SYNTHETIC)', deadline: inDays(3) }), /^objective review rejected \(separation_of_duties\): the owner of objective .* opens no review of it/, 403);
    await refused(convene(executive, { subject: { kind: 'objective', id: w.objectiveId }, question: 'A review chaired by the owner? (SYNTHETIC)', chair: objectiveOwner.principalId, reviewers: [], convene_key: 'b36h-' + 'owner-chair' }),
      /^objective review rejected \(separation_of_duties\): the owner of objective .* is neither its review's chair nor a reviewer/, 403);
    await refused(convene(executive, { subject: { kind: 'objective', id: w.objectiveId }, question: 'A review reviewed by the owner? (SYNTHETIC)', chair: strategist.principalId, reviewers: [objectiveOwner.principalId], convene_key: 'b36h-' + 'owner-reviewer' }),
      /^objective review rejected \(separation_of_duties\)/, 403);
    await refused(openRoom(executive, { kind: 'scenario', subjectId: w.scenarioId, title: 'Yesterday (SYNTHETIC)', deadline: inDays(-1) }), /^executive room rejected \(deadline\)/, 422);
    await refused(openRoom(executive, { kind: 'scenario', subjectId: uuidv7(), title: 'No such scenario (SYNTHETIC)', deadline: inDays(1) }), /^executive room rejected \(unknown_subject\): no scenario/, 404);
    await refused(openRoom(executive, { kind: 'objective_review', subjectId: w.objectiveId, title: 'A second review room (SYNTHETIC)', deadline: inDays(5) }), /^executive room rejected \(state\): a objective_review room on .* is already open/, 409);
    await refused(openRoom(analyst, { kind: 'scenario', subjectId: w.scenarioId, title: 'An analyst room (SYNTHETIC)', deadline: inDays(1) }), /./, 403);
    await refused(openRoom(executive, { kind: 'decision', subjectId: committed.pkg, title: 'A decision room here? (SYNTHETIC)', deadline: inDays(1) }), /kind is one of scenario, objective_review/, 422);
  });

  it('h3 · RECOVERY: the scenario room\'s deadline passes (the clock moved by fixture) — the attention tick step room-deadlines raises ONE item of class review.convened with the OVERDUE marker to the room\'s owner; a second tick raises no duplicate; the home shows the room overdue and the item among the priorities; the review concluded by its chair before its due instant', async () => {
    await sql`update executive.rooms_current set deadline = clock_timestamp() - interval '1 hour' where room_id = ${scenarioRoom}::uuid`.execute(su);
    const t1 = await tick();
    const step = (t1.steps as Row[] | undefined)?.find((s) => s['name'] === 'room-deadlines') ?? null;
    const raised = (await items('review.convened')).filter((i) => i['cause_event_type'] === 'RoomDeadlinePassed');
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ subject_kind: 'scenario', subject_id: w.scenarioId, state: 'open', owner: executive.principalId });
    expect(raised[0]!['details']).toMatchObject({ room_id: scenarioRoom, kind: 'scenario', overdue: true, marker: 'overdue' });
    expect(String(raised[0]!['title'])).toMatch(/^OVERDUE scenario: Bab el-Mandeb scenario room/);
    overdueItem = String(raised[0]!['item_id']);
    expect((await roomEvents(scenarioRoom, 'review.overdue'))).toHaveLength(1);
    await tick();
    expect((await items('review.convened')).filter((i) => i['cause_event_type'] === 'RoomDeadlinePassed')).toHaveLength(1);
    const home = await readHome(executive, 50);
    expect(home.sections['decisions']!.items.find((x) => x['room_id'] === scenarioRoom)).toMatchObject({ overdue: true });
    expect(home.sections['priorities']!.items.find((x) => x['item_id'] === overdueItem)).toMatchObject({ signal_class: 'review.convened', state: 'open' });
    // the governed review concluded by its chair before its due instant (h6 reads it as completed)
    const closed = await conclude(strategist, reviewId, 'The objective holds; the reroute is inside its assumptions (SYNTHETIC).');
    expect(closed.review).toMatchObject({ state: 'concluded' });
    evidence('h3-recovery', { step, overdueItem });
  });
});

describe('h4 · THE EXECUTIVE SEARCH with explanation across rooms, briefings, decisions, commitments, queue items, warnings and reviews — and its access ledger', () => {
  it('h4 · POSITIVE: "Cape" hits the committed package (title; its gate state), its room and the tracker item; each hit explains the field, the terms, the as-of and the context filter; the ledger records who searched what and how many hits per kind — no bodies', async () => {
    const s = await search(executive, 'Cape');
    expect(s.count).toBeGreaterThanOrEqual(2);
    const pkg = s.hits.find((x) => x['kind'] === 'package' && x['id'] === committed.pkg)!;
    expect(pkg).toMatchObject({ state: 'committed', title: 'Reroute SYN-SHIP-4472 around the Cape' });
    expect((pkg['gate'] as Row)['state']).toBe('approved');
    expect(pkg['explanation']).toMatchObject({ field: 'title', terms: ['cape'], query: 'Cape', context_filter: 'no objective context: every kind of the domain, newest first', context_digest: contextDigest });
    expect(String((pkg['explanation'] as Row)['why'])).toBe('cape matched in title: Reroute SYN-SHIP-4472 around the Cape');
    expect(s.hits.find((x) => x['kind'] === 'room' && x['id'] === roomId)).toMatchObject({ state: 'decision' });
    expect(s.hits.some((x) => x['kind'] === 'commitment_item')).toBe(true);
    const led = await searchEvents();
    expect(led).toHaveLength(1);
    expect(led[0]).toMatchObject({ search_id: s.search_id, principal_id: executive.principalId, query: 'Cape', hits: s.count, context_digest: contextDigest });
    expect(Object.keys(led[0]!['kinds'] as Row)).toEqual(expect.arrayContaining(['package', 'room']));
    expect(JSON.stringify(led[0])).not.toContain('SYN-SHIP-4472'); // no result body on the ledger
    // the overdue item and the review are found by their words too
    const s2 = await search(executive, 'scenario room');
    expect(s2.hits.some((x) => x['kind'] === 'attention_item' && x['id'] === overdueItem)).toBe(true);
    expect(s2.hits.some((x) => x['kind'] === 'room' && x['id'] === scenarioRoom)).toBe(true);
    const s3 = await search(executive, 'corridor objective');
    expect(s3.hits.find((x) => x['kind'] === 'review' && x['id'] === reviewId)).toMatchObject({ state: 'concluded' });
    evidence('h4-positive', { count: s.count, kinds: s.kinds, first: s.hits[0] });
  });

  it('h4 · REFUSAL: a one-character query (422, nothing on the ledger), a roleless searcher (403 at the PDP), a too-long query (422)', async () => {
    const before = (await searchEvents()).length;
    await refused(search(executive, 'C'), /q is 2–200 characters/, 422);
    await refused(search(roleless, 'Cape'), /./, 403);
    await refused(search(executive, 'x'.repeat(201)), /q is 2–200 characters/, 422);
    expect((await searchEvents()).length).toBe(before);
  });

  it('h4 · RECOVERY: under an objective context the hits linked to the objective sort first and say so; an unlinked hit says it is outside the context; a query with no hit answers zero and is on the ledger too', async () => {
    await setContext(executive, { objectiveId: w.objectiveId, horizon: '90d', classification: 'confidential' });
    const s = await search(executive, 'SYNTHETIC', 100);
    const linked = s.hits.filter((x) => String((x['explanation'] as Row)['context_filter']).startsWith('linked to the context'));
    const outside = s.hits.filter((x) => String((x['explanation'] as Row)['context_filter']).startsWith('outside the context'));
    expect(linked.length).toBeGreaterThan(0); expect(outside.length).toBeGreaterThan(0);
    expect(s.hits.indexOf(linked[linked.length - 1]!)).toBeLessThan(s.hits.indexOf(outside[0]!));
    const none = await search(executive, 'zzqxjv nothing');
    expect(none.count).toBe(0);
    expect((await searchEvents()).at(-1)).toMatchObject({ query: 'zzqxjv nothing', hits: 0 });
    await setContext(executive, { horizon: '90d', classification: 'confidential' });
    contextDigest = String((await readHome(executive)).context['digest']);
  });
});

describe('h5 · THE CHIEF OF STAFF (PER-03): the agenda, a gap escalated, work routed through the existing ports — and never an approval, a decision, a commitment or a publication', () => {
  it('h5 · POSITIVE: the operator curates the agenda of the open cycle (the room, the package, the overdue item, in that order); escalates a gap to the executive (an item on the executive\'s queue, class queue.governance); delegates the overdue item to the decision owner and reassigns the board package\'s gate task to the second approver — through the existing ports; the executive answers the escalation; the tracker reads on the operator\'s home', async () => {
    cadenceId = String(((await getCadence(executive, 'weekly')).open as Row)['cadence_id']);
    const agenda = await setAgenda(operator, cadenceId, [{ kind: 'room', id: scenarioRoom, note: 'the overdue scenario first' }, { kind: 'package', id: boardPkg }, { kind: 'attention_item', id: overdueItem }]);
    expect(agenda.items.map((i) => `${String(i['position'])}:${String(i['object_kind'])}`)).toEqual(['1:room', '2:package', '3:attention_item']);
    expect(agenda.items[0]).toMatchObject({ note: 'the overdue scenario first', set_by: operator.principalId });
    const esc = await escalate(operator, { cadenceId, subjectKind: 'room', subjectId: scenarioRoom, reason: 'The scenario room is past its deadline and nobody has reviewed it (SYNTHETIC).', to: executive.principalId });
    expect(esc).toMatchObject({ state: 'open', raised_by: operator.principalId, raised_to: executive.principalId, subject_kind: 'room', subject_id: scenarioRoom });
    escalationId = String(esc['escalation_id']); escalationItem = String(esc['item_id']);
    const q = (await items('queue.governance')).find((i) => i['item_id'] === escalationItem)!;
    expect(q).toMatchObject({ subject_kind: 'queue', subject_id: cadenceId, state: 'open', owner: executive.principalId, cause_event_type: 'CadenceGapEscalated' });
    const home = await readHome(executive, 50);
    expect(home.sections['priorities']!.items.find((x) => x['item_id'] === escalationItem)).toMatchObject({ signal_class: 'queue.governance', owner: executive.principalId });
    expect(home.sections.cadence.agenda.map((a) => a['object_kind'])).toEqual(['room', 'package', 'attention_item']);
    expect(home.sections.cadence.escalations.find((e) => e['escalation_id'] === escalationId)).toMatchObject({ state: 'open' });
    // ROUTING through the EXISTING ports (each re-declared with one change: the operator admitted)
    const d = await delegate(operator, overdueItem, owner.principalId, 'b36h-' + 'route-1');
    expect(d).toMatchObject({ from: operator.principalId, to: owner.principalId, state: 'active' });
    const tasks = await gateTask(boardPkg);
    expect(tasks.length).toBeGreaterThanOrEqual(1);
    const task = tasks.find((t) => t.state === 'open') ?? tasks[0]!;
    const moved = await reassign(operator, task.task_id, w.approver2.principalId);
    expect(moved).toMatchObject({ task_id: task.task_id, to: w.approver2.principalId });
    // the executive acknowledges the escalation's item (time-to-understanding, h6) and answers the escalation
    await acknowledge(executive, escalationItem);
    const a = await answer(executive, escalationId, 'Reviewed on Monday; the room owner briefs the board (SYNTHETIC).');
    expect(a).toMatchObject({ state: 'answered', answered_by: executive.principalId });
    // the operator's own home carries the tracker (the commitments section) and its cadence view
    const opHome = await readHome(operator, 50);
    expect(opHome.sections['commitments']!.items.some((x) => x['package_id'] === committed.pkg)).toBe(true);
    expect(opHome.ceiling).toMatchObject({ reader: 'internal' });
    evidence('h5-positive', { agenda: agenda.items.length, escalationId, delegation: d['delegation_id'], task: task.task_id });
  });

  it('h5 · REFUSAL: the operator CANNOT approve (decision.approve), commit (decision.commit), decide as the board (decision.board.approve), distribute (decision.distribute), publish a briefing policy (briefing.policy.set) nor accept a health snapshot (executive.health.snapshot.approve) — each refused at the PDP and recorded; an escalation to a non-executive (422), an agenda on an unknown object (404), an agenda on a closed cycle (409), an escalation answered by the operator (403)', async () => {
    const v = 1; const digest = (await sql<{ d: string }>`select version_digest d from decision.package_versions where package_id = ${boardPkg}::uuid and version = 1`.execute(su)).rows[0]!.d;
    // each probe LAZY: the denial is counted before the act, then the act refused, then counted again
    const probes: Array<[string, () => Promise<unknown>]> = [
      ['decision.approve', () => c.approve(boardPkg, v, { decision: 'approve', versionDigest: digest, rationale: 'the operator approving (B36 home harness)' }, operator)],
      ['decision.commit', () => c.commit(boardPkg, v, digest, operator, 'C2', null)],
      ['decision.board.approve', () => w.decisions.boardAct(h.req(operator, 'decision.board.approve', 'APR', null, 'decision'), T(), D(), boardPkg, String(v), 'approve', { payload: { decision: 'approve', versionDigest: digest, rationale: 'the operator as the board (B36 home harness)' } }) as Promise<unknown>],
      ['decision.distribute', () => w.decisions.distribute(h.req(operator, 'decision.distribute', 'DPK', committed.pkg, 'decision'), T(), D(), committed.pkg, String(committed.v), { payload: { channels: ['in_app'], recipients: [] } }) as Promise<unknown>],
      ['briefing.policy.set', () => w.exec.setBriefingPolicy(h.req(operator, 'briefing.policy.set', 'BRF', null, 'briefing'), T(), D(), { payload: { rules: {}, reason: 'the operator publishing (B36 home harness)' } } as never) as Promise<unknown>],
      ['executive.health.snapshot.approve', () => w.exec.approveHealthSnapshot(H(operator, 'executive.health.snapshot.approve', 'HSD', uuidv7()), T(), D(), uuidv7(), { payload: { result_digest: 'a'.repeat(64), note: 'the operator accepting (B36 home harness)' } } as never) as Promise<unknown>],
    ];
    for (const [action, p] of probes) {
      const before = await deniedCount(action);
      const r = await refused(p(), /./, 403);
      expect(await deniedCount(action), `${action} denial recorded`).toBeGreaterThan(before);
      evidence(`h5-refusal-${action}`, { status: r.status, message: r.message.slice(0, 160) });
    }
    expect((await sql<{ n: string }>`select count(*)::text n from decision.commitments where package_id = ${boardPkg}::uuid`.execute(su)).rows[0]!.n).toBe('0');
    await refused(escalate(operator, { cadenceId, subjectKind: 'room', subjectId: scenarioRoom, reason: 'to the analyst? (SYNTHETIC)', to: analyst.principalId }), /^escalation rejected \(recipient\)/, 422);
    await refused(escalate(operator, { cadenceId, subjectKind: 'room', subjectId: scenarioRoom, reason: 'to myself? (SYNTHETIC)', to: operator.principalId }), /^escalation rejected \(recipient\)/, 422);
    await refused(setAgenda(operator, cadenceId, [{ kind: 'package', id: uuidv7() }]), /^agenda rejected \(unknown_object\): item 1/, 404);
    const closedCadence = (await sql<{ id: string }>`select cadence_id::text id from executive.cadences where tenant_id = ${T()}::uuid and period = 'weekly' and sequence = 1`.execute(su)).rows[0]!.id;
    await refused(setAgenda(operator, closedCadence, [{ kind: 'room', id: scenarioRoom }]), /^agenda rejected \(state\): cadence .* is closed/, 409);
    await refused(answer(operator, escalationId, 'the operator answering its own escalation'), /./, 403); // executive.escalation.answer admits no operator (the PDP)
    await refused(setAgenda(analyst, cadenceId, [{ kind: 'room', id: scenarioRoom }]), /./, 403);
  });

  it('h5 · RECOVERY: the corrected agenda is set (the old rows superseded, never edited); a second escalation to the decision authority; the executive resets the loop over the board decision with a reason — the agenda belongs to the closed cycle, the new cycle starts empty', async () => {
    const agenda = await setAgenda(operator, cadenceId, [{ kind: 'attention_item', id: escalationItem, note: 'the escalation' }, { kind: 'warning', id: warningId }]);
    expect(agenda.items.map((i) => String(i['object_kind']))).toEqual(['attention_item', 'warning']);
    const rows = (await sql<{ removed: boolean }>`select removed_at is not null removed from executive.cadence_agenda where cadence_id = ${cadenceId}::uuid order by set_at, position`.execute(su)).rows;
    expect(rows.map((r) => r.removed)).toEqual([true, true, true, false, false]);
    const esc2 = await escalate(operator, { cadenceId, subjectKind: 'warning', subjectId: warningId, reason: 'The customs warning has no owner acting on it (SYNTHETIC).', to: w.authority.principalId });
    expect(esc2).toMatchObject({ state: 'open', raised_to: w.authority.principalId });
    const reset = await resetCadence(executive, 'weekly', 'the board decides on Thursday; the weekly loop closes (B36 home harness, h5)');
    expect(reset.confirmed).toBe(true);
    cadenceId = String(reset.opened['cadence_id']);
    const cad = await getCadence(executive, 'weekly');
    expect((cad.open as Row)['cadence_id']).toBe(cadenceId);
    expect(cad.agenda).toEqual([]);
    expect(cad.escalations).toEqual([]);
  });
});

describe('h6 · THE EXECUTIVE METRICS — computed on read from the ledgers; nothing stored', () => {
  it('h6 · POSITIVE: over the harness\'s window, time-to-understanding measures the escalation item (routed → acknowledged) and counts the unacted; decision latency measures the committed package (proposal → commitment); review completion reads the concluded review inside its due instant and the rooms past their deadline; each metric names its population, its basis and its as-of', async () => {
    const m = await metrics(executive, { from: new Date(Date.now() - 6 * 3600_000).toISOString(), to: new Date(Date.now() + 3600_000).toISOString() });
    expect(m.stored).toBe(false);
    expect(m.metrics.map((x) => x['name'])).toEqual(['time_to_understanding', 'decision_latency', 'review_completion']);
    const ttu = m.metrics[0]!; const lat = m.metrics[1]!; const rev = m.metrics[2]!;
    expect(Number(ttu['n'])).toBeGreaterThanOrEqual(2); // the overdue item (unacted) and the escalation (acknowledged)
    expect(Number(ttu['n_acted'])).toBeGreaterThanOrEqual(1);
    expect(Number(ttu['n_without_act'])).toBeGreaterThanOrEqual(1);
    expect(Number(ttu['median'])).toBeGreaterThanOrEqual(0);
    expect(Number(lat['n'])).toBeGreaterThanOrEqual(1);
    expect(Number(lat['median'])).toBeGreaterThan(0);
    expect(rev).toMatchObject({ n: 1, within_deadline: 1, overdue_open: 0, ratio: 1 });
    expect((rev['rooms'] as Row)['with_deadline']).toBe(1); // the scenario room's deadline (moved into the window), not reviewed before it
    for (const x of m.metrics) { expect(typeof x['population']).toBe('string'); expect(typeof x['basis']).toBe('string'); expect(typeof x['as_of']).toBe('string'); }
    expect((await sql<{ n: string }>`select count(*)::text n from information_schema.tables where table_schema = 'executive' and table_name like '%metric%'`.execute(su)).rows[0]!.n).toBe('0');
    evidence('h6-positive', { ttu, lat, rev });
  });

  it('h6 · REFUSAL: a window with from after to (422), a malformed instant (422), the analyst (403 at the PDP), a roleless reader (403)', async () => {
    await refused(metrics(executive, { from: inDays(1), to: inDays(-1) }), /from is before to/, 422);
    await refused(metrics(executive, { from: 'yesterday' }), /from must be an instant/, 422);
    await refused(metrics(analyst), /./, 403);
    await refused(metrics(roleless), /./, 403);
  });

  it('h6 · RECOVERY: the default window (the last 90 days, the database\'s instant) reads the same populations; an empty window reads "not measured" (null), never a fabricated number; the auditor reads the metrics', async () => {
    const m = await metrics(executive);
    expect(Number(m.metrics[1]!['n'])).toBeGreaterThanOrEqual(1);
    const empty = await metrics(executive, { from: '2000-01-01T00:00:00Z', to: '2000-01-02T00:00:00Z' });
    expect(empty.metrics[0]).toMatchObject({ n: 0, median: null, p90: null });
    expect(empty.metrics[2]).toMatchObject({ n: 0, ratio: null });
    const au = await metrics(auditor);
    expect(au.metrics).toHaveLength(3);
  });
});
