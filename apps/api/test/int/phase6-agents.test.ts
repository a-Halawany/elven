/**
 * PHASE 6 · P6-M6 — the three bounded agents, through the real database, controller,
 * identity path and (with real Redis) the scheduler.
 *
 * F7: agents are registered as agent principals with owner, role grant, budgets, stop
 * conditions and escalation, and run through their own session; every output carries
 * the agent's identity, version and method and is marked agent-produced; an agent's
 * attempt to propose, approve, dissent or commit is refused at the PDP (no grant) AND
 * at the port (principal kind), and recorded; a budget hit stops the run and escalates
 * to the named human; the workflow contract reads every step from governed events; the
 * planner schedules a room's briefing through the existing scheduler on its own job
 * kind and queue; a refusal by clearance is recorded. Nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { DecisionAgentSessionService } from '../../src/executive/agents/agent-session.service.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let admin: AuthenticatedPrincipal;
let decisionAgent: { agentId: string; principalId: string }; let briefingAgent: { agentId: string; principalId: string }; let reportingAgent: { agentId: string; principalId: string };
let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
let roomId = '';
const DIGEST = 'a'.repeat(64);
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const budgets = (over: Record<string, unknown> = {}) => ({ max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000, ...over });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  admin = await h.humanWithSession(['tenant_admin'], 'tenant-admin', 'TENANT');
  P = await c.committed();
  roomId = (await c.openRoom({ packageId: P.pkg, title: 'January corridor collapse — Regensburg line', reviewEveryDays: 7 })).room.roomId;
  await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
}, 300_000);

afterAll(async () => {
  try { await h.app.get(SchedulerService).obliterateBriefingsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
});

describe('P6-M6 · F7 — agents are registered principals of kind agent, with an accountable human, budgets and an escalation target', () => {
  it('registration is the tenant administrator\'s; the principal is created on the identity authority with the agent\'s role; owner and escalation are humans', async () => {
    const base = { version: '1.0.0', codeDigest: DIGEST, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId, budgets: budgets() };
    expect(await status(c.registerAgent({ kind: 'decision', ...base }, w.owner))).toBe(403);
    expect(await status(c.registerAgent({ kind: 'decision', ...base }, await h.humanWithSession(['domain_admin'], 'domain-admin')))).toBe(403);
    expect(await status(c.registerAgent({ kind: 'decision', ...base, budgets: {} }, admin))).toBe(422);
    expect(await message(c.registerAgent({ kind: 'decision', ...base, ownerPrincipalId: w.machinePrincipalId }, admin))).toMatch(/accountable human, never another agent/);
    const d = await c.registerAgent({ kind: 'decision', ...base }, admin);
    const b = await c.registerAgent({ kind: 'briefing', ...base }, admin);
    const r = await c.registerAgent({ kind: 'reporting', ...base }, admin);
    decisionAgent = d.agent; briefingAgent = b.agent; reportingAgent = r.agent;
    expect([d.agent.role, b.agent.role, r.agent.role]).toEqual(['decision_agent', 'briefing_agent', 'reporting_agent']);
    const rows = (await sql<{ kind: string; status: string; roles: string[] }>`select p.kind, p.status, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
      where p.id in (${d.agent.principalId}::uuid, ${b.agent.principalId}::uuid, ${r.agent.principalId}::uuid) group by p.id order by p.id`.execute(h.su)).rows;
    expect(rows.length).toBe(3);
    expect(rows.every((x) => x.kind === 'agent' && x.status === 'active' && x.roles.length === 1)).toBe(true);
    const listed = await c.listAgents();
    expect(listed.agents.map((a) => a['agent_kind']).sort()).toEqual(['briefing', 'decision', 'reporting']);
    expect(await status(c.listAgents(w.operator))).toBe(403);
  });

  it('the agent session is the registry\'s: a revoked agent, a mismatched digest or a foreign domain open no session', async () => {
    const sessions = h.app.get(DecisionAgentSessionService);
    const ok = await sessions.openRunSession({ agentId: decisionAgent.agentId, tenantId: T(), domainId: D(), agentVersion: '1.0.0', codeDigest: DIGEST, correlationId: uuidv7() });
    expect(ok.principalId).toBe(decisionAgent.principalId);
    expect(ok.kind).toBe('agent');
    await expect(sessions.openRunSession({ agentId: decisionAgent.agentId, tenantId: T(), domainId: D(), agentVersion: '1.0.0', codeDigest: 'b'.repeat(64), correlationId: uuidv7() })).rejects.toThrow(/not valid for this run/);
    await expect(sessions.openRunSession({ agentId: uuidv7(), tenantId: T(), domainId: D(), agentVersion: '1.0.0', codeDigest: DIGEST, correlationId: uuidv7() })).rejects.toThrow(/not valid for this run/);
    const probe = await c.registerAgent({ kind: 'reporting', version: '1.0.0', codeDigest: DIGEST, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId, budgets: budgets() }, admin);
    await c.revokeAgent(probe.agent.agentId, 'probe', admin);
    await expect(sessions.openRunSession({ agentId: probe.agent.agentId, tenantId: T(), domainId: D(), agentVersion: '1.0.0', codeDigest: DIGEST, correlationId: uuidv7() })).rejects.toThrow(/not valid for this run/);
  });
});

describe('P6-M6 · F7 — the decision agent drafts and can decide nothing', () => {
  it('drafts option cards into a DRAFT version, marked agent-produced; its attempt to propose is refused at the PDP and recorded on the run and in the audit', async () => {
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Agent-drafted package', statement: 'the decision agent assembles the cards', owner: w.owner.principalId });
    const v = (await c.open(d.package.packageId)).version.version;
    expect(await status(c.runAgent(decisionAgent.agentId, { task: 'draft', packageId: d.package.packageId, version: v }, w.approver))).toBe(403);
    const r = (await c.runAgent(decisionAgent.agentId, { task: 'draft', packageId: d.package.packageId, version: v })).run;
    expect(r.outcome).toBe('finished');
    expect((r.outputs['drafted'] as string[]).length).toBeGreaterThanOrEqual(3);
    expect((r.outputs['drafted'] as string[])).toContain('status-quo');
    expect(r.outputs['marked']).toBe('agent-produced');
    expect((r.outputs['agent'] as Record<string, unknown>)['method']).toBe('decision-agent-option-cards@1.0.0');
    expect((r.outputs['agent'] as Record<string, unknown>)['code_digest']).toBe(DIGEST);
    expect(r.refusals.length).toBe(1);
    expect(r.refusals[0]?.['action']).toBe('decision.package.propose');
    expect(String(r.refusals[0]?.['code'])).toMatch(/EYE-AUT-001/);
    const opts = (await sql<{ key: string; set_by: string }>`select key, set_by::text from decision.options where package_id = ${d.package.packageId}::uuid and version = ${v} order by key`.execute(h.su)).rows;
    expect(opts.every((o) => o.set_by === decisionAgent.principalId)).toBe(true);
    expect((await sql<{ s: string }>`select state s from decision.package_versions where package_id = ${d.package.packageId}::uuid and version = ${v}`.execute(h.su)).rows[0]?.s).toBe('draft');
    const denied = (await sql<{ n: string }>`select count(*)::text n from policy.policy_decisions where action = 'decision.package.propose' and decision in ('deny', 'indeterminate') and principal_id like ${`%${decisionAgent.principalId}%`}`.execute(h.su)).rows[0]?.n;
    expect(Number(denied)).toBeGreaterThanOrEqual(1);
    const run = (await sql<Record<string, unknown>>`select * from executive.agent_runs where run_id = ${r.runId}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(run['trigger_kind']).toBe('operator');
    expect(String(run['trigger_principal_id'])).toBe(w.owner.principalId);
    expect(run['outcome']).toBe('finished');
    expect((run['refusals'] as unknown[]).length).toBe(1);
    // the draft the owner takes over: terms, choice, proposal — by the human
    await c.terms(d.package.packageId, v, c.validTerms());
    await c.choice(d.package.packageId, v, c.validChoice({ option_key: 'status-quo' }));
    await c.propose(d.package.packageId, v);
    await expect(sql`update executive.agent_runs set outcome = 'finished', outputs = '{}'::jsonb where run_id = ${r.runId}::uuid`.execute(h.su)).rejects.toThrow(/closed and immutable/);
  });

  it('approve, dissent and commit are refused at the PDP with no grant — and at the port by principal kind even when the API is bypassed', async () => {
    const sessions = h.app.get(DecisionAgentSessionService);
    const agent = await sessions.openRunSession({ agentId: decisionAgent.agentId, tenantId: T(), domainId: D(), agentVersion: '1.0.0', codeDigest: DIGEST, correlationId: uuidv7() });
    const q = await c.proposed();
    expect(await status(c.approve(q.pkg, q.v, { decision: 'approve', versionDigest: q.digest, rationale: 'an agent approving' }, agent))).toBe(403);
    expect(await status(c.dissent(q.pkg, q.v, { position: 'against', rationale: 'an agent dissenting on a decision' }, agent))).toBe(403);
    expect(await status(c.commit(q.pkg, q.v, q.digest, agent))).toBe(403);
    // the port, with the API bypassed: a commit context bound to the agent's own session and the right action still refuses by principal kind
    const approvalId = uuidv7();
    await expect(inCommitContext(h.fx.su as never, { sessionId: agent.sessionId, contextKey: agent.contextKey }, { tenantId: T(), domainId: D() }, 'decision.approve', approvalId, async (tx) =>
      sql`select decision.record_approval(${approvalId}::uuid, ${T()}::uuid, ${D()}::uuid, ${q.pkg}::uuid, ${q.v}, ${agent.principalId}::uuid, 'approve', ${q.digest}, 'an agent at the port', '[]'::jsonb, null, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never),
    )).rejects.toThrow(/only a named, active human principal approves|not an eligible approver/);
    const dissentId = uuidv7();
    await expect(inCommitContext(h.fx.su as never, { sessionId: agent.sessionId, contextKey: agent.contextKey }, { tenantId: T(), domainId: D() }, 'decision.dissent', dissentId, async (tx) =>
      sql`select decision.record_dissent(${dissentId}::uuid, ${T()}::uuid, ${D()}::uuid, ${q.pkg}::uuid, ${q.v}, ${agent.principalId}::uuid, 'against', 'an agent dissenting at the port', null, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never),
    )).rejects.toThrow(/only a named, active human principal may dissent/);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.approvals where package_id = ${q.pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
    expect((await sql<{ n: string }>`select count(*)::text n from decision.dissent where package_id = ${q.pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
  });
});

describe('P6-M6 · F7 — the briefing agent composes within its budget; a budget hit stops and escalates; the planner schedules through the existing scheduler', () => {
  it('composes the room\'s briefing as an agent run, evaluating the conditions first; the output carries the agent identity', async () => {
    const r = (await c.runAgent(briefingAgent.agentId, { task: 'briefing', roomId })).run;
    expect(r.outcome).toBe('finished');
    expect(typeof r.outputs['briefing_id']).toBe('string');
    expect(r.outputs['monitoring']).toBeDefined();
    expect(Number(r.spent['reads'])).toBeGreaterThan(2);
    const b = (await sql<Record<string, unknown>>`select composed_via, agent_id::text, composed_by::text from executive.briefings where briefing_id = ${String(r.outputs['briefing_id'])}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(b['composed_via']).toBe('agent');
    expect(b['agent_id']).toBe(briefingAgent.agentId);
    expect(b['composed_by']).toBe(briefingAgent.principalId);
    const obj = (await sql<{ m: string; h: string[] }>`select method_ref m, human_refs h from objects.canonical_objects where object_id = ${String(r.outputs['briefing_id'])}::uuid`.execute(h.su)).rows[0];
    expect(obj?.m).toBe(`briefing-composer@1.0.0/agent:${briefingAgent.agentId}`);
    expect(obj?.h).toEqual([`principal:${w.owner.principalId}`]);
    // a member reads it under their own authority; an outsider does not, whatever the agent could read
    expect(await status(c.getBriefing(String(r.outputs['briefing_id']), w.executive))).toBe('ok');
    expect(await status(c.getBriefing(String(r.outputs['briefing_id']), w.approver2))).toBe(403);
  });

  it('a budget of three reads: the run stops before anything is admitted, records the reason and escalates to the named human', async () => {
    const tight = await c.registerAgent({ kind: 'briefing', version: '1.0.0', codeDigest: DIGEST, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId, budgets: budgets({ max_reads: 3 }) }, admin);
    const before = (await sql<{ n: string }>`select count(*)::text n from executive.briefings where room_id = ${roomId}::uuid`.execute(h.su)).rows[0]?.n;
    const r = (await c.runAgent(tight.agent.agentId, { task: 'briefing', roomId })).run;
    expect(r.outcome).toBe('stopped');
    expect(String(r.stopReason)).toMatch(/remaining budget/);
    expect(r.escalatedTo).toBe(w.executive.principalId);
    expect((await sql<{ n: string }>`select count(*)::text n from executive.briefings where room_id = ${roomId}::uuid`.execute(h.su)).rows[0]?.n).toBe(before);
    const ev = (await sql<{ d: Record<string, unknown> }>`select details d from executive.room_events where room_id = ${roomId}::uuid and event = 'agent.escalated' order by occurred_at desc limit 1`.execute(h.su)).rows[0]?.d;
    expect(ev?.['outcome']).toBe('stopped');
    expect(String(ev?.['escalated_to'])).toBe(w.executive.principalId);
    const g = await c.getRoom(roomId, w.executive);
    expect(g.room.events.some((e) => e['event'] === 'agent.escalated')).toBe(true);
  });

  it('the planner: the room\'s cadence becomes a briefing job on its own queue; a promoted tick runs the agent as a scheduler-triggered run', async () => {
    const scheduler = h.app.get(SchedulerService);
    expect(scheduler.enabled).toBe(true);
    const s = (await c.scheduleRoom({ roomId, agentId: briefingAgent.agentId, cadenceSeconds: 60 })).schedule;
    expect(String(s['queueName'])).toBe(`exec:${T()}:${D()}:briefing`);
    expect(String(s['schedulerId'])).toBe(`exec:${T()}:${D()}:room:${roomId}`);
    expect(Number(s['cadenceSeconds'])).toBe(60);
    expect(scheduler.runningWorkers()).toContain(`exec.${T()}.${D()}.briefing`);
    const runsBefore = (await sql<{ n: string }>`select count(*)::text n from executive.agent_runs where agent_id = ${briefingAgent.agentId}::uuid and trigger_kind = 'scheduler'`.execute(h.su)).rows[0]?.n;
    // the first tick of an `every` scheduler may already be running; the promotion covers the delayed one, if any
    const promoted = await scheduler.promoteDelayedBriefingsForTests(T(), D());
    expect(promoted).toBeGreaterThanOrEqual(0);
    let seen = 0;
    for (let i = 0; i < 60 && seen === 0; i += 1) {
      await new Promise((res) => setTimeout(res, 500));
      seen = Number((await sql<{ n: string }>`select count(*)::text n from executive.agent_runs where agent_id = ${briefingAgent.agentId}::uuid and trigger_kind = 'scheduler' and outcome <> 'running'`.execute(h.su)).rows[0]?.n) - Number(runsBefore);
    }
    expect(seen).toBeGreaterThanOrEqual(1);
    const run = (await sql<Record<string, unknown>>`select * from executive.agent_runs where agent_id = ${briefingAgent.agentId}::uuid and trigger_kind = 'scheduler' order by started_at desc limit 1`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(run['outcome']).toBe('finished');
    expect(run['trigger_principal_id']).toBeNull();
    expect(String(run['trigger_ref']).length).toBeGreaterThan(0);
    expect(typeof (run['outputs'] as Record<string, unknown>)['briefing_id']).toBe('string');
    await scheduler.unscheduleBriefing(T(), D(), roomId);
  }, 90_000);
});

describe('P6-M6 · F7 — the reporting agent renders with controls intact and refuses what its clearance does not cover; the workflow contract', () => {
  it('renders a report marked agent-produced with SYNTHETIC marks and truth states; refuses a confidential package', async () => {
    const r = (await c.runAgent(reportingAgent.agentId, { task: 'report', packageId: P.pkg })).run;
    expect(r.outcome).toBe('finished');
    const rep = r.outputs['report'] as Record<string, unknown>;
    expect(rep['marked']).toBe('agent-produced');
    expect((rep['options'] as Array<Record<string, unknown>>).every((o) => (o['marks'] as string[]).includes('SYNTHETIC'))).toBe(true);
    expect((rep['package'] as Record<string, unknown>)['classification']).toBe('internal');
    // a package whose consequences fold to confidential: the agent's clearance (internal) refuses the export; an executive reads it
    const conf = await c.proposed();
    await sql`update decision.packages_current set controls = jsonb_build_object('classification', 'confidential') where package_id = ${conf.pkg}::uuid`.execute(h.su);
    const refused = (await c.runAgent(reportingAgent.agentId, { task: 'report', packageId: conf.pkg })).run;
    expect(refused.outcome).toBe('refused');
    expect(String(refused.stopReason)).toMatch(/classified confidential; the reader's clearance is internal/);
    expect(refused.escalatedTo).toBe(w.executive.principalId);
    expect(await status(c.report(conf.pkg, w.approver2))).toBe(403);
    expect((await c.report(conf.pkg, w.executive)).report['marked']).toBe('agent-produced');
    // the human render is audited as a consequential read
    expect(Number((await sql<{ n: string }>`select count(*)::text n from policy.policy_decisions where action = 'report.render' and decision = 'allow_with_obligations'`.execute(h.su)).rows[0]?.n)).toBeGreaterThanOrEqual(2);
  });

  it('the workflow contract reads every step of a decision from its governed events', async () => {
    const wf = (await c.workflow(P.pkg)).workflow;
    expect(wf.map((s) => s['step'])).toEqual(['draft', 'propose', 'review', 'approve', 'commit', 'monitor', 'close']);
    expect(wf.slice(0, 5).every((s) => s['status'] === 'recorded')).toBe(true);
    expect(wf[6]?.['status']).toBe('pending');
    expect((wf[4]?.['actors'] as string[])).toEqual([w.authority.principalId]);
  });
});
