/**
 * CP-6 B24 (migration 0086, part `timer`; F-P6-07) — THE TIMER HOST FOR ESCALATION AND THE DELIVERY PORT: the attention agent (the
 * fourth executive agent kind, role attention_agent, method attention-timer@1.0.0, task attention_tick) registered through the agents'
 * route; one tick per domain on its own queue (exec:{t}:{d}:attention) under the agent's OWN session, whose governed write
 * (executive.attention.tick) runs the registered steps in order — ESCALATE (10, executive.escalate_attention_due) and DELIVERIES (30:
 * plan the routed / escalated / unrouted item events over the channels of the item's own policy version, then drain the due attempts
 * through the adapters — in_app and the SYNTHETIC demo-mailbox) — with receipts, bounded retries and abandonment; on a real database
 * with real Redis (EYE_SCHEDULER_ENABLED at module top, the B6 rule) and B24's own humans with sessions of their own.
 *
 *   T1 · REGISTER + TICK ON THE SCHEDULER: the PDP (a domain administrator 403), the intake (a foreign digest 422, a cadence under the
 *   floor 422, the cadence on another kind 422); the agent registered with its role and the domain's timer pointed at it (the queue, the
 *   cadence, the Redis scheduler's payload); an item PLANTED routed (stated) with its due_at moved into the past by the superuser; the
 *   delayed tick PROMOTED (the test hook) → the item escalated under the AGENT's principal by a scheduler-triggered run (trigger_ref a
 *   BullMQ job), the tick's row with the steps in order, the escalation's deliveries planned in the same tick; the reconciliation port
 *   lists the domain; the agent refused on the human routes (403).
 *   T2 · REPEATED + REFUSED: the same scheduled instant ticked twice → the second answers `repeated` with the first tick's run (one
 *   row per key); two concurrent duplicates → exactly one ran; a REVOKED agent's tick → a refused run of the scheduler RECORDED on
 *   agent_runs (escalated to the named human) and the timer stopped; a successor registered → the timer re-pointed; a DRIFTED digest
 *   (the registration's code_digest moved by the superuser — stated: a deploy that changed the timer) → the run refused with the
 *   reason and recorded, no tick row; the digest restored → the next tick runs.
 *   D1 · DELIVERIES + RECEIPTS: an item PLANTED routed to its owner and a role → one delivery per channel and recipient (in_app,
 *   demo-mailbox), each DELIVERED with its receipt (the in-app placement; the demo mailbox's message, synthetic) — the item NOT
 *   acknowledged (a receipt is not an acknowledgement); the person acknowledges → the acknowledgement recorded, the deliveries untouched;
 *   the reads (the item's deliveries; the synthetic mailbox) and their refusals (403 policy, 404, 422); a second tick plans nothing again.
 *   D2 · RETRY → ABANDONED, THE ITEM STILL ESCALATES: a failing demo-mailbox adapter (a TEST DOUBLE) → attempt 1 failed, attempt 2 queued
 *   one minute later (the DB clock), attempt 2 failed → attempt 3 five minutes later, attempt 3 ABANDONED (max_attempts 3) — the item
 *   untouched; its due_at moved into the past → escalated by the next tick all the same; the adapter restored → the escalation's
 *   retried attempt delivered (recovery); a delivery that is not queued refused at the port (409).
 *   D3 · NO REAL PROVIDER: a policy naming email among its channels, and notify 'sms', refused (422) naming owner decision D6; the
 *   active version unchanged.
 *
 * EACH CASE LOGS ONE `B24 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { DeliveryService } from '../../src/executive/attention/delivery/delivery.service.js';
import type { ChannelAdapter } from '../../src/executive/attention/delivery/channel.js';
import { DecisionAgentSessionService } from '../../src/executive/agents/agent-session.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import type { AnyDb } from './helpers.js';

// The B6 rule: the scheduler (the attention timer's worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

type Row = Record<string, unknown>;
type Delivery = { delivery_id: string; item_event: string; item_event_id: string; channel: string; recipient_principal_id: string; attempt: number; max_attempts: number; state: string; receipt: Row | null;
  provider_ref: string | null; error: string | null; next_attempt_at: Date | null; attempted_at: Date | null; synthetic_state: boolean };
type Run = { run_id: string; agent_id: string; principal_id: string; task: string; trigger_kind: string; trigger_principal_id: string | null; trigger_ref: string | null; outcome: string; stop_reason: string | null;
  escalated_to: string | null; refusals: Row[]; outputs: Row };

let h: Phase4Harness; let su: AnyDb; let exec: ExecutiveController; let scheduler: SchedulerService; let timer: AttentionTimerService; let delivery: DeliveryService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let strategyOwner: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal;
let policyId = '';
/** What the cases leave one another. */
let agentA: { agentId: string; principalId: string } = { agentId: '', principalId: '' };
let agentB: { agentId: string; principalId: string } = { agentId: '', principalId: '' };
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const obj = (v: unknown): Row => (v ?? {}) as Row;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 60_000, poke?: () => Promise<unknown>): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; recent ticks: ${JSON.stringify(timer.recentTicks().slice(0, 4))}`);
    if (poke !== undefined) await poke();
    await sleep(500);
  }
}
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
  console.log(`B24 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the routes (in process) ───────────── */
const budgets = (over: Row = {}): Row => ({ max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60, ...over });
const registerAgent = (payload: Row, as = tenantAdmin) => exec.registerAgent(h.req(as, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload }) as Promise<{ agent: { agentId: string; principalId: string; kind: string; role: string }; timer?: { schedulerId: string; queueName: string; cadenceSeconds: number } }>;
const attentionAgent = (over: Row = {}) => registerAgent({ kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: budgets(), ...over });
const revokeAgent = (agentId: string, reason: string) => exec.revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason } });
const publish = (rules: unknown, reason: string, as = executive) => exec.publishAttentionPolicy(h.req(as, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { rules, reason } as never }) as unknown as Promise<{ policy: Row }>;
const deliveriesOf = (itemId: string, as = executive) => exec.attentionDeliveries(h.req(as, 'executive.attention.read', 'ATI', itemId, 'executive'), T(), D(), itemId) as unknown as Promise<{ item: Row; acknowledgement: Row; deliveries: Row[]; counts: Record<string, number>; events: Row[]; note: string }>;
const mailbox = (payload: Row = {}, as = executive) => exec.attentionMailbox(h.req(as, 'executive.attention.read', 'ATI', null, 'executive'), T(), D(), { payload: payload as never }) as unknown as Promise<{ synthetic: boolean; note: string; messages: Row[]; timer: Row }>;
const acknowledge = (as: AuthenticatedPrincipal, itemId: string, note?: string) => exec.acknowledgeAttentionItem(h.req(as, 'executive.attention.item.acknowledge', 'ATI', itemId, 'executive'), T(), D(), itemId, { payload: note === undefined ? {} : { note } }) as unknown as Promise<{ item: Row }>;
const escalateDue = (as: AuthenticatedPrincipal) => exec.escalateAttentionDue(h.req(as, 'executive.attention.escalate', 'ATI', null, 'executive'), T(), D());

/* ───────────── the rows ───────────── */
const itemRow = async (itemId: string) => (await sql<{ state: string; escalations: number; route_roles: string[]; acknowledged_at: Date | null; acknowledged_by: string | null; due_at: Date | null }>`select state, escalations, route_roles, acknowledged_at, acknowledged_by::text, due_at from executive.attention_items where item_id = ${itemId}::uuid`.execute(su)).rows[0]!;
const itemEvents = async (itemId: string) => (await sql<{ event_id: string; event: string; actor: string; details: Row }>`select event_id::text, event, actor_principal_id::text actor, details from executive.attention_item_events where item_id = ${itemId}::uuid order by occurred_at, event_id`.execute(su)).rows;
const deliveryRows = async (itemId: string) => (await sql<Delivery>`select delivery_id::text, item_event, item_event_id::text, channel, recipient_principal_id::text, attempt, max_attempts, state, receipt, provider_ref, error, next_attempt_at, attempted_at, synthetic_state from executive.attention_deliveries where item_id = ${itemId}::uuid order by created_at, channel, recipient_principal_id, attempt`.execute(su)).rows;
const runsOf = async (agentId: string) => (await sql<Run>`select run_id::text, agent_id::text, principal_id::text, task, trigger_kind, trigger_principal_id::text, trigger_ref, outcome, stop_reason, escalated_to::text, refusals, outputs from executive.agent_runs where agent_id = ${agentId}::uuid order by started_at`.execute(su)).rows;
const ticksOf = async (runId: string) => (await sql<{ tick_key: string; result: Row }>`select tick_key::text, result from executive.attention_ticks where run_id = ${runId}::uuid`.execute(su)).rows;
/** An attention item PLANTED as the attention subscriber would have routed it (the item and its item.routed event, the B22 A8 idiom — stated): material, open, under the domain's active version. */
async function plantRouted(title: string, ownerId: string | null, over: { dueInMinutes?: number } = {}): Promise<{ itemId: string; eventId: string }> {
  const itemId = uuidv7(); const eventId = uuidv7(); const corr = uuidv7();
  const due = over.dueInMinutes ?? 60;
  const evaluation = { outcome: 'material', reasons: ['PLANTED routed item (B24 harness): consequence C3 at or above C2', 'confidence 0.9 at or above 0.6'], dimensions: { consequence: 'C3', confidence: 0.9 }, thresholds: { min_consequence: 'C2', min_confidence: 0.6 }, policy_version: 1 };
  await sql`insert into executive.attention_items (item_id, scope, tenant_id, domain_id, signal_class, subject_kind, subject_id, cause_event_id, cause_event_type, title, outcome, state,
                                                   owner_principal_id, route_roles, policy_id, policy_version, evaluation, details, due_at, escalations, correlation_id)
            values (${itemId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'warning.raised', 'warning', ${uuidv7()}::uuid, ${uuidv7()}::uuid, 'EarlyWarningRaised', ${title}, 'material', 'open',
                    ${ownerId}::uuid, ARRAY['strategy_owner'], ${policyId}::uuid, 1, ${JSON.stringify(evaluation)}::jsonb, '{"planted":"B24 harness"}'::jsonb, clock_timestamp() + make_interval(mins => ${due}::int), 0, ${corr}::uuid)`.execute(su);
  await sql`insert into executive.attention_item_events (event_id, scope, tenant_id, domain_id, item_id, event, actor_principal_id, details, correlation_id)
            values (${eventId}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${itemId}::uuid, 'item.routed', ${executive.principalId}::uuid,
                    jsonb_build_object('outcome', 'material', 'policy_version', 1, 'owner', ${ownerId}::uuid, 'route_roles', jsonb_build_array('strategy_owner'), 'planted', true), ${corr}::uuid)`.execute(su);
  return { itemId, eventId };
}
/** The superuser moves an item's deadline into the past (stated): the DB clock, one minute ago. */
const overdue = async (itemId: string) => { await sql`update executive.attention_items set due_at = clock_timestamp() - interval '1 minute' where item_id = ${itemId}::uuid`.execute(su); };
/** The superuser moves an item's queued attempts to now (stated): the retry's backoff elapsed. */
const retryDue = async (itemId: string) => { await sql`update executive.attention_deliveries set next_attempt_at = clock_timestamp() - interval '1 second' where item_id = ${itemId}::uuid and state = 'queued'`.execute(su); };
/** Each hook tick stands for its OWN scheduled instant (a minute apart, far from the wall clock) unless the case names one: a background job of this minute never makes it `repeated`. */
let slot = 0;
const nextInstant = (): Date => new Date(Date.UTC(2032, 0, 1) + (slot++) * 60_000);
const tick = (agentId: string, scheduledAt?: Date) => timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: scheduledAt ?? nextInstant() });

/** The domain's attention policy: warning.raised routed to the strategy owner, escalated to the executive, notified in_app AND on the SYNTHETIC demo-mailbox, three attempts. */
const RULES = (): Row => ({
  classes: {
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.6 }, route_roles: ['strategy_owner'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 2,
                        suppression: { allowed: true, max_hours: 12 }, notify: { channels: ['in_app', 'demo-mailbox'], max_attempts: 3 } },
  },
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  exec = h.app.get(Ec); scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService); delivery = h.app.get(DeliveryService);
  // THE HUMANS of this file, each with a session of its own (the ports compare the acting principal).
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b24-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b24-domain-admin');
  executive = await h.humanWithSession(['executive'], 'b24-executive');
  strategyOwner = await h.humanWithSession(['strategy_owner'], 'b24-strategy-owner');
  owner = await h.humanWithSession(['domain_analyst'], 'b24-owner');
  auditor = await h.humanWithSession(['auditor'], 'b24-auditor', 'TENANT');
  policyId = String((await publish(RULES(), 'the corridor warnings notified in-app and on the synthetic demo mailbox (B24 harness)')).policy['policy_id']);
}, 300_000);

afterAll(async () => {
  try { delivery.useChannelForTests('demo-mailbox', null); } catch { /* restored */ }
  // no active attention agent is left behind: a later file's startup reconciliation schedules no timer for this domain
  try { if (agentB.agentId !== '') await revokeAgent(agentB.agentId, 'the harness is done (B24 harness)'); } catch { /* already revoked */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);


describe('B24 · the timer host for escalation and the delivery port (0086 §T, §D; F-P6-07)', () => {
  it('T1 · REGISTER + TICK ON THE SCHEDULER: the PDP and the intake refuse; the attention agent registered and the domain\'s timer pointed at it; an overdue item escalated under the agent\'s principal by a promoted scheduler tick; the reconciliation lists the domain; the agent is refused on the human routes', async () => {
    /* T1.1 THE PDP (registration is the tenant administrator's) and the intake (the runtime's timer identity; the cadence and its kind). */
    const base = { kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: budgets() };
    await refused(registerAgent(base, dadmin), /./, 403, 'EYE-AUT-001');
    await refused(attentionAgent({ codeDigest: 'c'.repeat(64) }), /an attention agent is registered with this runtime's timer/, 422, 'EYE-REQ-001');
    await refused(attentionAgent({ version: '9.9.9' }), /an attention agent is registered with this runtime's timer/, 422, 'EYE-REQ-001');
    await refused(attentionAgent({ budgets: budgets({ tick_every_seconds: 30 }) }), /tick_every_seconds is a whole number of seconds in \[60, 86400\]/, 422, 'EYE-REQ-001');
    await refused(registerAgent({ ...base, kind: 'briefing', version: '1.0.0', codeDigest: 'a'.repeat(64) }), /tick_every_seconds is the attention timer's cadence/, 422, 'EYE-REQ-001');
    expect((await sql<{ n: number }>`select count(*)::int n from executive.agents where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and agent_kind = 'attention'`.execute(su)).rows[0]!.n, 'no refused registration was written').toBe(0);
    /* T1.2 THE REGISTRATION: an agent principal with the attention_agent role; the domain's one timer pointed at it (queue, scheduler id, cadence, payload). */
    const r = await attentionAgent();
    agentA = r.agent;
    expect(r.agent).toMatchObject({ kind: 'attention', role: 'attention_agent' });
    expect(r.timer).toMatchObject({ queueName: `exec:${T()}:${D()}:attention`, schedulerId: `exec:${T()}:${D()}:attention-timer`, cadenceSeconds: 60 });
    const principal = (await sql<{ kind: string; status: string; roles: string[] }>`select p.kind, p.status, array_agg(b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id where p.id = ${agentA.principalId}::uuid group by p.id`.execute(su)).rows[0]!;
    expect(principal).toEqual({ kind: 'agent', status: 'active', roles: ['attention_agent'] });
    const reg = (await sql<{ agent_kind: string; agent_version: string; code_digest: string; budgets: Row }>`select agent_kind, agent_version, code_digest, budgets from executive.agents where agent_id = ${agentA.agentId}::uuid`.execute(su)).rows[0]!;
    expect(reg).toMatchObject({ agent_kind: 'attention', agent_version: ATTENTION_TIMER_VERSION, code_digest: ATTENTION_TIMER_DIGEST });
    expect(reg.budgets['tick_every_seconds']).toBe(60);
    const sched = await scheduler.attentionSchedulerForTests(T(), D());
    expect(sched?.every).toBe(60_000);
    expect(sched?.data).toMatchObject({ tenantId: T(), domainId: D(), agentId: agentA.agentId, cadenceSeconds: 60 });
    expect(scheduler.runningWorkers()).toContain(`exec.${T()}.${D()}.attention`);
    /* T1.3 AN OVERDUE ITEM (PLANTED routed — stated; its deadline moved into the past by the superuser) escalated by a scheduler tick (the delayed job PROMOTED — the test hook). */
    const it1 = await plantRouted('Bab el-Mandeb transits fell below the warning line (B24 T1)', strategyOwner.principalId);
    await overdue(it1.itemId);
    const escalated = await waitFor('the overdue item escalated by a scheduler tick', () => itemRow(it1.itemId), (x) => x.state === 'escalated', 90_000, () => scheduler.promoteDelayedAttentionTicksForTests(T(), D()));
    expect(escalated.escalations).toBe(1);
    expect([...escalated.route_roles].sort()).toEqual(['executive', 'strategy_owner']);
    const esc = (await itemEvents(it1.itemId)).find((e) => e.event === 'item.escalated')!;
    expect(esc.actor, 'the escalation is the attention agent\'s act').toBe(agentA.principalId);
    expect(esc.details).toMatchObject({ escalation: 1, policy_version: 1 });
    const hasItem = (x: Run) => JSON.stringify(obj(obj(x.outputs['steps'])['escalate'])['escalated'] ?? []).includes(it1.itemId);
    const runs = await waitFor('the scheduler run that escalated it closed', () => runsOf(agentA.agentId), (rs) => rs.some((x) => x.outcome === 'finished' && hasItem(x)));
    const run = runs.find((x) => x.outcome === 'finished' && hasItem(x))!;
    expect(run).toMatchObject({ task: 'attention_tick', trigger_kind: 'scheduler', trigger_principal_id: null, principal_id: agentA.principalId, escalated_to: null });
    expect(String(run.trigger_ref), 'a BullMQ job of the domain\'s timer').toMatch(/^repeat:/);
    const names = (run.outputs['order'] as Row[]).map((o) => String(o['name']));
    expect(names.indexOf('escalate'), 'escalate (10) runs before deliveries (30)').toBeLessThan(names.indexOf('deliveries'));
    expect(obj(run.outputs['agent'])).toMatchObject({ agent_kind: 'attention', method: 'attention-timer@1.0.0', code_digest: ATTENTION_TIMER_DIGEST, principal_id: agentA.principalId });
    const ticks = await ticksOf(run.run_id);
    expect(ticks).toHaveLength(1);
    expect(String(ticks[0]!.tick_key)).toBe(String(run.outputs['tick_key']));
    // the escalation's deliveries were planned in the SAME tick (deliveries 30 after escalate 10): the executive is among the recipients
    const ds = await deliveryRows(it1.itemId);
    expect(ds.filter((d) => d.item_event === 'item.escalated').map((d) => d.recipient_principal_id)).toContain(executive.principalId);
    /* T1.4 THE RECONCILIATION (the schedule capability): the domain listed with its agent and cadence. */
    const rec = await timer.reconcile('B24 harness reconciliation');
    expect(rec.scheduled.find((s) => s.tenantId === T() && s.domainId === D())).toEqual({ tenantId: T(), domainId: D(), agentId: agentA.agentId, cadenceSeconds: 60 });
    /* T1.5 THE AGENT on the human routes: its own session holds attention_agent alone — escalate (human-gated), acknowledge and publish refused at the PDP. */
    const agentP = (await h.app.get(DecisionAgentSessionService).openRunSession({ agentId: agentA.agentId, tenantId: T(), domainId: D(), correlationId: uuidv7() })).principal;
    await refused(escalateDue(agentP), /./, 403, 'EYE-AUT-001');
    await refused(acknowledge(agentP, it1.itemId), /./, 403, 'EYE-AUT-001');
    await refused(publish(RULES(), 'the agent may not set the policy (B24 harness)', agentP), /./, 403, 'EYE-AUT-001');
    // the Redis timer is stopped: the cases below tick by the hook alone (deterministic)
    await scheduler.obliterateAttentionTicksForTests(T(), D());
    sixEvidence('T1', { fault_trace: { refused: ['PDP 403 domain_admin', '422 foreign digest', '422 foreign version', '422 cadence 30 s', '422 cadence on a briefing agent'], planted: it1.itemId, overdue_by: 'superuser due_at − 1 min' },
      watermark: { run: run.run_id, trigger_ref: run.trigger_ref, tick_key: run.outputs['tick_key'], order: names }, consumer_behaviour: { escalated: it1.itemId, actor: esc.actor, route_roles: escalated.route_roles, escalation_deliveries: ds.filter((d) => d.item_event === 'item.escalated').length },
      operator_action: 'the tenant administrator registers the attention agent; the harness promotes the delayed tick', recovery: 'none needed', reconciliation: { reconciled: rec.scheduled.length, failures: rec.failures } });
  }, 180_000);

  it('T2 · REPEATED + REFUSED: a duplicate of one scheduled instant answers `repeated`; of two concurrent duplicates exactly one runs; a revoked agent\'s tick is recorded refused and the timer stops (or follows the successor); a drifted digest is refused and recorded', async () => {
    /* T2.1 THE SAME INSTANT TWICE: the second answers repeated, naming the first tick's run; one row for the key. */
    const X = new Date('2031-03-01T09:00:10Z');
    const first = await tick(agentA.agentId, X);
    expect(first).toMatchObject({ outcome: 'finished', repeated: false });
    const key = Math.floor(X.getTime() / 1000 / 60);
    expect(Number(first.run!.outputs['tick_key'])).toBe(key);
    const second = await tick(agentA.agentId, X);
    expect(second).toMatchObject({ outcome: 'finished', repeated: true });
    expect(obj(second.run!.outputs['prior'])['run_id']).toBe(first.runId);
    expect(Number(second.run!.outputs['tick_key'])).toBe(key);
    expect((await sql<{ n: number }>`select count(*)::int n from executive.attention_ticks where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and tick_key = ${key}`.execute(su)).rows[0]!.n).toBe(1);
    /* T2.2 TWO CONCURRENT DUPLICATES: the advisory lock serialises them — exactly one runs. */
    const Y = new Date('2031-03-01T09:05:10Z');
    const both = await Promise.all([tick(agentA.agentId, Y), tick(agentA.agentId, Y)]);
    expect(both.map((b) => b.outcome)).toEqual(['finished', 'finished']);
    expect(both.filter((b) => b.repeated)).toHaveLength(1);
    /* T2.3 REVOKED: the session port refuses; the tick is RECORDED as a refused run of the scheduler (escalated to the named human) and the timer stops. */
    await timer.scheduleDomain(T(), D(), agentA.agentId, 60);
    await scheduler.obliterateAttentionTicksForTests(T(), D());
    await timer.scheduleDomain(T(), D(), agentA.agentId, 60);
    await revokeAgent(agentA.agentId, 'the attention agent is retired (B24 harness)');
    const refusedTick = await tick(agentA.agentId);
    expect(refusedTick.outcome).toBe('refused');
    expect(refusedTick.recordedRefusal).toMatchObject({ outcome: 'refused', escalated_to: dadmin.principalId, agent_status: 'revoked', active_agent_id: null });
    const rrun = (await runsOf(agentA.agentId)).find((x) => x.run_id === refusedTick.runId)!;
    expect(rrun).toMatchObject({ outcome: 'refused', task: 'attention_tick', trigger_kind: 'scheduler', escalated_to: dadmin.principalId, principal_id: agentA.principalId });
    expect(String(rrun.stop_reason)).toMatch(/attention tick refused before any session: agent grant is not valid for this run/);
    expect(rrun.refusals[0]).toMatchObject({ action: 'agent.run', code: 'EYE-AUT-001' });
    expect(obj(rrun.outputs)['refused_before_session']).toBe(true);
    expect(await scheduler.attentionSchedulerForTests(T(), D()), 'no active attention agent is left: the timer stops').toBeNull();
    /* T2.4 A SUCCESSOR: registered → the timer re-pointed; a stale job of the revoked agent then re-points to the successor (never stops it). */
    agentB = (await attentionAgent()).agent;
    expect((await scheduler.attentionSchedulerForTests(T(), D()))?.data?.agentId).toBe(agentB.agentId);
    await scheduler.obliterateAttentionTicksForTests(T(), D());
    const stale = await tick(agentA.agentId);
    expect(stale.recordedRefusal).toMatchObject({ outcome: 'refused', active_agent_id: agentB.agentId });
    expect((await scheduler.attentionSchedulerForTests(T(), D()))?.data?.agentId).toBe(agentB.agentId);
    await scheduler.obliterateAttentionTicksForTests(T(), D());
    /* T2.5 DRIFT: the registration's digest moved by the superuser (stated: a deploy that changed the timer) → the run refused, recorded, escalated; no tick row. */
    await sql`update executive.agents set code_digest = ${'b'.repeat(64)} where agent_id = ${agentB.agentId}::uuid`.execute(su);
    const drifted = await tick(agentB.agentId);
    expect(drifted.outcome).toBe('refused');
    expect(String(drifted.stopReason)).toMatch(/^attention tick refused \(drift\): the agent is registered as 1\.0\.0 with code digest bbbbbbbbbbbb/);
    const drun = (await runsOf(agentB.agentId)).find((x) => x.run_id === drifted.runId)!;
    expect(drun).toMatchObject({ outcome: 'refused', trigger_kind: 'scheduler', escalated_to: dadmin.principalId });
    expect(drun.refusals[0]).toMatchObject({ action: 'executive.attention.tick', code: 'EYE-AUT-001' });
    expect(await ticksOf(drifted.runId!)).toEqual([]);
    /* T2.6 RECOVERY: the digest restored → the next tick runs. */
    await sql`update executive.agents set code_digest = ${ATTENTION_TIMER_DIGEST} where agent_id = ${agentB.agentId}::uuid`.execute(su);
    const ok = await tick(agentB.agentId);
    expect(ok).toMatchObject({ outcome: 'finished', repeated: false });
    expect(await ticksOf(ok.runId!)).toHaveLength(1);
    sixEvidence('T2', { fault_trace: { duplicate_instant: X.toISOString(), concurrent: Y.toISOString(), revoked: agentA.agentId, drifted_digest: 'b'.repeat(12) },
      watermark: { tick_key: key, first_run: first.runId, repeated_run: second.runId, refused_run: refusedTick.runId, drift_run: drifted.runId }, consumer_behaviour: { repeated: second.repeated, concurrent_repeated: both.filter((b) => b.repeated).length, revoked: rrun.stop_reason, drift: drun.stop_reason },
      operator_action: 'the tenant administrator revokes agent A and registers agent B', recovery: { timer: 'stopped on revocation, re-pointed to the successor', drift: 'digest restored → finished' }, reconciliation: { tick_rows_for_key: 1 } });
  }, 180_000);

  it('D1 · DELIVERIES + RECEIPTS: one delivery per channel and recipient, each delivered with its receipt; delivered is not acknowledged; the acknowledgement leaves the deliveries untouched; the reads and their refusals', async () => {
    /* D1.1 AN ITEM (PLANTED routed — stated) owned by one person and routed to a role another holds → 2 channels × 2 recipients. */
    const it2 = await plantRouted('Suez rerouting cost crossed the corridor threshold (B24 D1)', owner.principalId);
    const t = await tick(agentB.agentId);
    expect(t.outcome).toBe('finished');
    const ds = await deliveryRows(it2.itemId);
    expect(ds).toHaveLength(4);
    expect(ds.every((d) => d.state === 'delivered' && d.attempt === 1 && d.max_attempts === 3 && d.item_event === 'item.routed' && d.item_event_id === it2.eventId)).toBe(true);
    expect([...new Set(ds.map((d) => d.recipient_principal_id))].sort()).toEqual([owner.principalId, strategyOwner.principalId].sort());
    const inApp = ds.filter((d) => d.channel === 'in_app'); const demo = ds.filter((d) => d.channel === 'demo-mailbox');
    expect(inApp.every((d) => d.synthetic_state === false && d.receipt?.['placed'] === true && d.receipt?.['channel'] === 'in_app' && d.provider_ref === `in_app:${it2.itemId}`)).toBe(true);
    expect(demo.every((d) => d.synthetic_state === true && d.receipt?.['synthetic'] === true && typeof d.receipt?.['message_id'] === 'string' && String(d.provider_ref).startsWith('demo-mailbox:'))).toBe(true);
    /* D1.2 DELIVERED IS NOT ACKNOWLEDGED: the item is still open and unacknowledged. */
    const before = await itemRow(it2.itemId);
    expect(before).toMatchObject({ state: 'open', acknowledged_at: null, acknowledged_by: null });
    const view = await deliveriesOf(it2.itemId);
    expect(view.acknowledgement).toMatchObject({ acknowledged: false, acknowledged_at: null });
    expect(view.counts).toMatchObject({ delivered: 4, queued: 0, failed: 0, abandoned: 0 });
    expect(view.note).toMatch(/a receipt is the channel's machine proof of placement; an acknowledgement is the person's act .* neither sets the other/);
    expect(view.events.filter((e) => e['event'] === 'delivery.planned')).toHaveLength(4);
    expect(view.events.filter((e) => e['event'] === 'delivery.delivered')).toHaveLength(4);
    expect(view.deliveries.filter((d) => d['channel'] === 'demo-mailbox').every((d) => d['synthetic'] === true)).toBe(true);
    /* D1.3 THE SYNTHETIC MAILBOX: the owner's message, its digest the receipt's. */
    const mb = await mailbox({ recipient: owner.principalId });
    expect(mb.synthetic).toBe(true);
    expect(mb.note).toMatch(/SYNTHETIC .* no email, SMS or Teams message was sent .*owner decision D6/);
    const ownerDemo = demo.find((d) => d.recipient_principal_id === owner.principalId)!;
    const msg = mb.messages.find((m) => m['delivery_id'] === ownerDemo.delivery_id)!;
    expect(msg).toMatchObject({ recipient: owner.principalId, synthetic_state: true, body_digest: ownerDemo.receipt?.['body_digest'], message_id: ownerDemo.receipt?.['message_id'] });
    expect(String(msg['subject'])).toBe('[attention · warning.raised] Suez rerouting cost crossed the corridor threshold (B24 D1)');
    expect(mb.messages.every((m) => m['recipient'] === owner.principalId)).toBe(true);
    /* D1.4 THE PERSON ACKNOWLEDGES: the acknowledgement recorded; the deliveries and their receipts untouched. */
    await acknowledge(strategyOwner, it2.itemId, 'seen — a receipt of the item, not an agreement (B24 D1)');
    expect(await deliveryRows(it2.itemId)).toEqual(ds);
    const view2 = await deliveriesOf(it2.itemId);
    expect(view2.acknowledgement).toMatchObject({ acknowledged: true, acknowledged_by: strategyOwner.principalId });
    expect(view2.counts).toMatchObject({ delivered: 4 });
    /* D1.5 A SECOND TICK plans nothing again for the event (one delivery per channel and recipient). */
    await tick(agentB.agentId);
    expect(await deliveryRows(it2.itemId)).toHaveLength(4);
    /* D1.6 THE REFUSALS of the reads: the PDP (an auditor), no such item, a malformed id, a malformed recipient. */
    await refused(deliveriesOf(it2.itemId, auditor), /./, 403, 'EYE-AUT-001');
    await refused(deliveriesOf(uuidv7()), /no authorized attention item matches/, 404, 'EYE-STA-001');
    await refused(deliveriesOf('not-a-uuid'), /the item id is a uuid/, 422, 'EYE-REQ-001');
    await refused(mailbox({ recipient: 'nobody' }), /payload\.recipient is a principal id/, 422, 'EYE-REQ-001');
    await refused(mailbox({}, auditor), /./, 403, 'EYE-AUT-001');
    /* D1.7 AN ELEVATED ITEM REACHES ITS PEOPLE (found by the B24 act: the rebalance's item.elevated was planned for nobody). The item is
       PLANTED waiting and its item.elevated PLANTED (stated — the elevation itself is §M6's, proven in phase6-attention-materiality-b24). */
    const el = await plantRouted('Hormuz insurance premium elevated from the overload hold (B24 D1.7)', owner.principalId);
    await tick(agentB.agentId); // the routing's deliveries (planted as routed first)
    const elEvent = uuidv7();
    await sql`insert into executive.attention_item_events (event_id, scope, tenant_id, domain_id, item_id, event, actor_principal_id, details, correlation_id)
              values (${elEvent}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${el.itemId}::uuid, 'item.elevated', ${executive.principalId}::uuid,
                      jsonb_build_object('from_state', 'deprioritized', 'to_state', 'open', 'policy_version', 1, 'route_roles', jsonb_build_array('strategy_owner'), 'unrouted', false, 'planted', true), ${uuidv7()}::uuid)`.execute(su);
    await tick(agentB.agentId);
    const elDs = (await deliveryRows(el.itemId)).filter((d) => d.item_event_id === elEvent);
    expect(elDs).toHaveLength(4);
    expect(elDs.every((d) => d.item_event === 'item.elevated' && d.state === 'delivered')).toBe(true);
    expect([...new Set(elDs.map((d) => d.recipient_principal_id))].sort()).toEqual([owner.principalId, strategyOwner.principalId].sort());
    sixEvidence('D1', { fault_trace: { planted: it2.itemId, recipients: [owner.principalId, strategyOwner.principalId] }, watermark: { run: t.runId, deliveries: ds.map((d) => `${d.channel}:${d.state}`) },
      consumer_behaviour: { receipts: { in_app: inApp[0]?.receipt?.['proof'], demo_mailbox: demo[0]?.receipt?.['note'] }, acknowledged_before: before.acknowledged_at, acknowledged_after: view2.acknowledgement },
      operator_action: 'the strategy owner acknowledges the item', recovery: 'none needed', reconciliation: { mailbox_messages_for_owner: mb.messages.length, second_tick_new_deliveries: 0 } });
  }, 180_000);

  it('D2 · RETRY → ABANDONED, THE ITEM STILL ESCALATES: a failing adapter (a test double) retries after 1 and 5 minutes to abandoned; the item is untouched and escalates by its deadline; the adapter restored → the retried attempt delivered; the port refuses an attempt of a delivery no longer queued (409) and an unknown delivery (404)', async () => {
    const failing: ChannelAdapter = { name: 'demo-mailbox', synthetic: true, deliver: async () => { throw new Error('the synthetic provider is down (B24 test double)'); } };
    delivery.useChannelForTests('demo-mailbox', failing);
    const it3 = await plantRouted('Red Sea insurance premium doubled (B24 D2)', strategyOwner.principalId);
    const gap = async (attempt: number): Promise<number> => (await sql<{ s: number }>`select extract(epoch from (q.next_attempt_at - f.attempted_at))::float8 s from executive.attention_deliveries f join executive.attention_deliveries q
      on q.item_event_id = f.item_event_id and q.channel = f.channel and q.recipient_principal_id = f.recipient_principal_id and q.attempt = f.attempt + 1
      where f.item_id = ${it3.itemId}::uuid and f.channel = 'demo-mailbox' and f.attempt = ${attempt}`.execute(su)).rows[0]!.s;
    const demoOf = async () => (await deliveryRows(it3.itemId)).filter((d) => d.channel === 'demo-mailbox' && d.item_event === 'item.routed').sort((a, b) => a.attempt - b.attempt);
    /* D2.1 ATTEMPT 1 fails → attempt 2 queued ONE minute later (on the DB clock); in_app delivered. */
    await tick(agentB.agentId);
    let demo = await demoOf();
    expect(demo.map((d) => `${d.attempt}:${d.state}`)).toEqual(['1:failed', '2:queued']);
    expect(String(demo[0]!.error)).toMatch(/^demo-mailbox: the synthetic provider is down \(B24 test double\)/);
    expect(await gap(1)).toBeCloseTo(60, 3);
    expect((await deliveryRows(it3.itemId)).filter((d) => d.channel === 'in_app').map((d) => d.state)).toEqual(['delivered']);
    /* D2.2 ATTEMPT 2 (its backoff elapsed — the superuser moves next_attempt_at, stated) fails → attempt 3 FIVE minutes later. */
    await retryDue(it3.itemId); await tick(agentB.agentId);
    demo = await demoOf();
    expect(demo.map((d) => `${d.attempt}:${d.state}`)).toEqual(['1:failed', '2:failed', '3:queued']);
    expect(await gap(2)).toBeCloseTo(300, 3);
    /* D2.3 ATTEMPT 3 = max_attempts fails → ABANDONED; no fourth attempt; the item untouched. */
    await retryDue(it3.itemId); await tick(agentB.agentId);
    demo = await demoOf();
    expect(demo.map((d) => `${d.attempt}:${d.state}`)).toEqual(['1:failed', '2:failed', '3:abandoned']);
    const view = await deliveriesOf(it3.itemId);
    expect(view.events.filter((e) => e['event'] === 'delivery.retry_scheduled')).toHaveLength(2);
    expect(view.events.filter((e) => e['event'] === 'delivery.abandoned')).toHaveLength(1);
    expect(await itemRow(it3.itemId)).toMatchObject({ state: 'open', escalations: 0, acknowledged_at: null });
    /* D2.4 THE ITEM STILL ESCALATES by its deadline (moved into the past by the superuser — stated). */
    await overdue(it3.itemId);
    const t4 = await tick(agentB.agentId);
    expect(JSON.stringify(obj(obj(t4.run!.outputs['steps'])['escalate'])['escalated'])).toContain(it3.itemId);
    expect(await itemRow(it3.itemId)).toMatchObject({ state: 'escalated', escalations: 1 });
    const escEvent = (await itemEvents(it3.itemId)).find((e) => e.event === 'item.escalated')!;
    expect(escEvent.actor).toBe(agentB.principalId);
    const escDemo = (await deliveryRows(it3.itemId)).filter((d) => d.item_event_id === escEvent.event_id && d.channel === 'demo-mailbox');
    expect(escDemo.map((d) => `${d.attempt}:${d.state}`).sort()).toEqual(['1:failed', '1:failed', '2:queued', '2:queued']);
    /* D2.5 RECOVERY: the adapter restored → the escalation's retried attempts delivered. */
    delivery.useChannelForTests('demo-mailbox', null);
    await retryDue(it3.itemId); await tick(agentB.agentId);
    const recovered = (await deliveryRows(it3.itemId)).filter((d) => d.item_event_id === escEvent.event_id && d.channel === 'demo-mailbox' && d.attempt === 2);
    expect(recovered.map((d) => d.state)).toEqual(['delivered', 'delivered']);
    expect(recovered.every((d) => d.receipt?.['synthetic'] === true)).toBe(true);
    /* D2.6 THE PORT (through the tick's own context — the agent's session): an attempt of an abandoned delivery 409; an unknown delivery 404. */
    const agentP = (await h.app.get(DecisionAgentSessionService).openRunSession({ agentId: agentB.agentId, tenantId: T(), domainId: D(), correlationId: uuidv7() })).principal;
    const abandoned = demo[2]!.delivery_id;
    await refused(inCommitContext(h.fx.su as never, { sessionId: agentP.sessionId, contextKey: agentP.contextKey }, { tenantId: T(), domainId: D() }, 'executive.attention.tick', abandoned, async (tx) =>
      sql`select executive.record_delivery_attempt(${abandoned}::uuid, ${T()}::uuid, ${D()}::uuid, 'delivered', '{"channel":"demo-mailbox"}'::jsonb, null, null, ${agentP.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx as never)),
      /^attention delivery rejected \(not_queued\): delivery .* is abandoned/, 409, 'EYE-STA-002');
    const nobody = uuidv7();
    await refused(inCommitContext(h.fx.su as never, { sessionId: agentP.sessionId, contextKey: agentP.contextKey }, { tenantId: T(), domainId: D() }, 'executive.attention.tick', nobody, async (tx) =>
      sql`select executive.record_delivery_attempt(${nobody}::uuid, ${T()}::uuid, ${D()}::uuid, 'failed', null, null, 'nothing', ${agentP.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx as never)),
      /^attention delivery rejected: no such delivery/, 404, 'EYE-STA-001');
    // an abandoned (or delivered) row is immutable
    expect(await sql`update executive.attention_deliveries set state = 'queued', next_attempt_at = clock_timestamp(), attempted_at = null where delivery_id = ${abandoned}::uuid`.execute(su).then(() => null, (e: { code?: string }) => e.code)).toBe('2F002');
    sixEvidence('D2', { fault_trace: { adapter: 'demo-mailbox test double throws', item: it3.itemId, backoff_minutes: [1, 5] }, watermark: { attempts: demo.map((d) => `${d.attempt}:${d.state}`), escalation_event: escEvent.event_id },
      consumer_behaviour: { abandoned, item_after_abandon: 'open, 0 escalations', escalated_by: escEvent.actor }, operator_action: 'the superuser moves next_attempt_at and due_at (stated)',
      recovery: { adapter_restored: recovered.map((d) => d.state) }, reconciliation: { retry_scheduled: 2, abandoned: 1, port_refusals: ['409 not_queued', '404 no such delivery'] } });
  }, 180_000);

  it('D3 · NO REAL PROVIDER: a policy naming email, notify \'sms\' and more than five attempts refused (422) — the first two naming owner decision D6; the active version unchanged', async () => {
    const withNotify = (notify: unknown): Row => { const r = RULES(); ((r['classes'] as Record<string, Row>)['warning.raised'] as Row)['notify'] = notify; return r; };
    await refused(publish(withNotify({ channels: ['in_app', 'email'], max_attempts: 3 }), 'email notifications for the corridor (B24 harness)'),
      /^attention policy rejected: class warning\.raised notify\.channels are in_app and demo-mailbox \(synthetic\); email needs a delivery provider \(owner decision D6\)/, 422, 'EYE-REQ-001');
    await refused(publish(withNotify('sms'), 'sms notifications for the corridor (B24 harness)'), /sms needs a delivery provider \(owner decision D6\)/, 422, 'EYE-REQ-001');
    await refused(publish(withNotify({ channels: ['demo-mailbox'], max_attempts: 9 }), 'nine attempts on the demo mailbox (B24 harness)'), /notify\.max_attempts is 1\.\.5/, 422, 'EYE-REQ-001');
    const versions = (await sql<{ version: number; state: string }>`select version, state from executive.attention_policies where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by version`.execute(su)).rows;
    expect(versions).toEqual([{ version: 1, state: 'active' }]);
    sixEvidence('D3', { fault_trace: { refused: ['422 email (D6)', '422 sms (D6)', '422 max_attempts 9'] }, watermark: { active_version: 1 }, consumer_behaviour: 'the port validates the channels whole (the prelude\'s validator)',
      operator_action: 'the executive tries to publish a real-provider channel', recovery: 'none needed: nothing written', reconciliation: { versions } });
  }, 60_000);
});
