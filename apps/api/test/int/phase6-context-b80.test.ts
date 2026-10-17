/**
 * CP-6 B80 §CB (migration 0118 §CB) — THE OPERATING CONTEXT BAR AND SCOPE SWITCHING (F-P7-E-01: UX-10-001…006, CMP-010, PAT-02, UX-ADR-003,
 * REL-03, CAP-AU-04, CAP-EO-02), through the real database and the real controller in process.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case:
 *   CB1 the roles — the PDP's `executive.context.set` list equals the port's executive.context_setter_roles(); every DOMAIN role of
 *       identity.roles is classified (a human setter, an agent, a subscriber or the external collaborator);
 *   CB2 the bar's read — every dimension explicit (objective, horizon, scenario, classification, effective time, version, digest, policy);
 *       a context naming a since-closed objective RECONCILED ON READ (the dimension unresolved, never shown current);
 *   CB3 the impact preview BEFORE any commit (PAT-02) — the changed dimensions, the affected open work (drafts, tasks, requests: kept),
 *       the approvals UNAFFECTED (an approval read under the old context still commits the package afterwards), reading it writes nothing;
 *       then the deliberate commit (receipt, version, the shell ledger row);
 *   CB4 stale — a closed scenario refused `context rejected (stale)` (409) in the port; a changed basis and changed work refused (409);
 *       the RECOVERY: preview again, commit; no commit without a preview (422); an unchanged context (422);
 *   CB5 who may set (D3) — a collection manager and an analyst now may; a principal holding only an agent role refused by the PDP; a
 *       non-human refused by the human gate; the port re-checks the human and the role;
 *   CB6 isolation — another principal's context impact refused (actor); a foreign domain refused at the PDP; the shell ledger is the
 *       principal's own (FORCE RLS).
 * SYNTHETIC world (bootDecisionWorld); every principal, draft, task and request here is SYNTHETIC fixture data. Redis: EYE_REDIS_PORT (6398
 * for this part). CONSTRUCTION evidence only — demonstrated operation is the act (act-b80, l.brandt's switch); real acceptance (UX-10-006)
 * is the shared non-demonstration recording path at B111 (F-P7-E-17's design acceptance slice), then H3.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { B80_CONTEXT_SETTER_ROLES } from '../../src/policy/pdp.service.js';
import { ContextBarController } from '../../src/shell/context/context.controller.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
type Impact = Row & { basis: Row | null; changed: Row[]; stale: Row[]; unchanged: boolean; committable: boolean; impact_digest: string;
                      affected: Record<string, Row & { count: number; items: Row[] }>; approvals: Row & { count: number; items: Row[]; effect: string }; previews: Row; proposed: Row };
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let cc: ContextBarController; let commitDb: Db;
let brandt: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let agentRole: AuthenticatedPrincipal; let roleless: AuthenticatedPrincipal;
let closingObjective = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;

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
const evidence = (caseName: string, e: unknown): void => console.log(`B80 CB EVIDENCE ${caseName}: ${JSON.stringify(e).slice(0, 1800)}`);

/* ───────────── the routes (in process) ───────────── */
const R = (as: AuthenticatedPrincipal, action: string, t = T(), d = D()) => ({ eyeEnvelope: { ...h.env(as, action, 'CTX', null, 'shell.context'), tenant_id: t, domain_id: d }, eyePrincipal: as }) as never;
const bar = (as: AuthenticatedPrincipal) => (cc.read(R(as, 'executive.context.read'), T(), D()) as unknown as Promise<{ bar: Row & { current: Row | null; version: number; unresolved: Row[]; may_set: boolean; choices: Row & { objectives: Row[]; scenarios: Row[] }; policy: Row } }>).then((r) => r.bar);
const impact = (as: AuthenticatedPrincipal, payload: Row) => (cc.impact(R(as, 'executive.context.read'), T(), D(), { payload }) as unknown as Promise<{ impact: Impact }>).then((r) => r.impact);
const commit = (as: AuthenticatedPrincipal, payload: Row) => (cc.commit(R(as, 'executive.context.set'), T(), D(), { payload }) as unknown as Promise<{ context: Row; receipt: Row }>);
/** The person's path: preview, then commit exactly what was previewed. */
const previewAndCommit = async (as: AuthenticatedPrincipal, proposed: Row, invalidated: string[] = []) => {
  const imp = await impact(as, proposed);
  const out = await commit(as, { ...proposed, basisContextId: (imp.basis?.['context_id'] as string | undefined) ?? null, impactDigest: imp.impact_digest, invalidated });
  return { imp, out };
};

/* ───────────── the rows ───────────── */
const contexts = async (principal: string) => (await sql<Row>`select context_id::text, objective_id::text, scenario_id::text, horizon, classification, digest, superseded_at is not null as superseded
  from executive.contexts where principal_id = ${principal}::uuid and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid order by set_at`.execute(su)).rows;
const shellEvents = async (principal: string, event?: string) => (await sql<Row>`select event, subject_kind, subject_id::text, version, details from shell.events
  where principal_id = ${principal}::uuid ${event === undefined ? sql`` : sql`and event = ${event}`} order by occurred_at`.execute(su)).rows;
const draft = async (principal: string, title: string, event = 'shell.draft.saved', id = uuidv7(), expiresAt: string | null = null) => {
  await sql`select shell.ledger(${T()}::uuid, ${D()}::uuid, ${principal}::uuid, 'draft', ${id}::uuid, 1, ${event},
    ${JSON.stringify({ form_key: 'decisions.package.new', title, ...(expiresAt === null ? {} : { expires_at: expiresAt }), synthetic: true })}::jsonb, ${uuidv7()}::uuid)`.execute(su);
  return id;
};
const task = async (principal: string, subjectId: string, title: string) => {
  const id = uuidv7();
  await sql`insert into executive.human_tasks (task_id, scope, tenant_id, domain_id, kind, dedupe_key, subject, title, assignee_principal_id, state, opened_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'gate.review', ${'b80cb-' + id}, ${JSON.stringify({ kind: 'gate', id: subjectId })}::jsonb, ${title},
            ${principal}::uuid, 'open', ${principal}::uuid, ${uuidv7()}::uuid)`.execute(su);
  return id;
};
const request = async (principal: string, subjectId: string) => {
  const id = uuidv7();
  await sql`insert into executive.requests (request_id, scope, tenant_id, domain_id, kind, request_key, request_digest, subject, instruction, requester_principal_id, routed_to, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'analysis', ${'b80cb-' + id}, ${'0'.repeat(64)}, ${JSON.stringify({ kind: 'objective', id: subjectId })}::jsonb,
            'assess the corridor exposure under the objective (SYNTHETIC)', ${principal}::uuid, 'analysis_queue', ${uuidv7()}::uuid)`.execute(su);
  return id;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su as AnyDb;
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  cc = h.app.get(ContextBarController); commitDb = h.app.get<Db>(COMMIT_DB);
  // l.brandt's SYNTHETIC stand-in: the decision authority, the decision owner and the opportunity sponsor of the corridor domain
  brandt = await h.humanWithSession(['decision_authority', 'decision_owner', 'opportunity_sponsor'], 'b80cb-brandt');
  manager = await h.humanWithSession(['collection_manager'], 'b80cb-collection-manager');
  analyst = await h.humanWithSession(['domain_analyst'], 'b80cb-analyst');
  agentRole = await h.humanWithSession(['decision_agent'], 'b80cb-agent-role');
  roleless = await h.humanWithSession([], 'b80cb-roleless');
  // a second objective of the domain, closed later (the reconciliation-on-read probe)
  closingObjective = uuidv7();
  await sql`insert into graph.strategy_current select (jsonb_populate_record(null::graph.strategy_current, to_jsonb(s) || jsonb_build_object('strategy_object_id', ${closingObjective}::text,
      'title', 'Hold the Hamburg buffer stock through Q1 (SYNTHETIC)', 'status', 'active'))).*
      from graph.strategy_current s where s.strategy_object_id = ${w.objectiveId}::uuid`.execute(su);
}, 900_000);
afterAll(async () => { await h?.close(); });

describe('CB1 · who may set a context (DESIGN D3) — one list, in the PDP and in the port', () => {
  it('the PDP list equals executive.context_setter_roles(); every DOMAIN role is a human setter, an agent, a subscriber or the external collaborator', async () => {
    const sqlList = (await sql<{ r: string[] }>`select executive.context_setter_roles() as r`.execute(su)).rows[0]!.r;
    expect([...sqlList].sort()).toEqual([...B80_CONTEXT_SETTER_ROLES].sort());
    const domainRoles = (await sql<{ code: string }>`select code from identity.roles where scope = 'DOMAIN' order by code`.execute(su)).rows.map((r) => r.code);
    const unclassified = domainRoles.filter((r) => !sqlList.includes(r) && !/_agent$/.test(r) && !/_subscriber$/.test(r) && r !== 'external_collaborator');
    expect(unclassified, 'a new DOMAIN role must be classified as a context setter or not').toEqual([]);
    expect(sqlList.filter((r) => /_agent$|_subscriber$|^external_collaborator$/.test(r))).toEqual([]);
    expect(sqlList.every((r) => domainRoles.includes(r))).toBe(true);
    evidence('CB1', { setters: sqlList.length, domainRoles: domainRoles.length });
  });
});

describe('CB2 · the bar: every dimension explicit; reconciled on read (UX-10-001/-002/-005, UX-ADR-003, REL-03)', () => {
  it('POSITIVE: no context set — stated as such, version 0, the choices with their staleness, may set, the policy bundle', async () => {
    const b = await bar(brandt);
    expect(b.current).toBeNull();
    expect(b.version).toBe(0);
    expect(b.may_set).toBe(true);
    expect(b.unresolved).toEqual([]);
    expect(b.policy).toEqual({ bundle: 'bundle-v1' });
    expect(b.choices.objectives.find((o) => o['id'] === w.objectiveId)).toMatchObject({ stale: false, status: 'active' });
    expect(b.choices.scenarios.find((s) => s['id'] === w.scenarioId)).toMatchObject({ stale: false });
    expect(b['tenant_id']).toBe(T()); expect(b['domain_id']).toBe(D());
    expect((await bar(agentRole).then(() => 'read', () => 'refused'))).toBe('refused');
  });
  it('RECONCILED ON READ: a context naming an objective since closed keeps its last valid digest and states the objective UNRESOLVED (never current); RECOVERY by a new switch', async () => {
    const { out } = await previewAndCommit(analyst, { objectiveId: closingObjective, horizon: '90d', scenarioId: null, classification: 'internal', effectiveAt: null });
    const digest = String(out.context['digest']);
    await sql`update graph.strategy_current set status = 'closed' where strategy_object_id = ${closingObjective}::uuid`.execute(su);
    const b = await bar(analyst);
    expect(b.current).toMatchObject({ digest, version: 1, objective: { id: closingObjective, status: 'closed', stale: true } });
    expect(b.unresolved).toEqual([expect.objectContaining({ dimension: 'objective', id: closingObjective, status: 'closed', reason: expect.stringMatching(/^context rejected \(stale\): objective .* is closed/) })]);
    expect(b.choices.objectives.find((o) => o['id'] === closingObjective)).toMatchObject({ stale: true });
    // the stale objective cannot be chosen again (the port's words); the recovery is a switch away from it
    await refused(commit(analyst, { objectiveId: closingObjective, horizon: '30d', scenarioId: null, classification: 'internal', basisContextId: out.context['context_id'], impactDigest: 'a'.repeat(64) }),
      /^context rejected \(stale\): objective .* is closed; a stale objective cannot be set/, 409);
    await previewAndCommit(analyst, { objectiveId: w.objectiveId, horizon: '90d', scenarioId: null, classification: 'internal', effectiveAt: null });
    expect((await bar(analyst)).unresolved).toEqual([]);
    evidence('CB2', { reconciled: b.unresolved, current: b.current });
  });
});

describe('CB3 · the impact preview BEFORE any commit; the deliberate commit (PAT-02, UX-10-003/-004)', () => {
  it('POSITIVE: Regensburg objective → the corridor scenario — the changed dimensions, the affected work kept, the approvals unaffected; the preview writes nothing; the commit records it', async () => {
    // brandt's first context: the objective (previewed over none, then committed)
    const first = await previewAndCommit(brandt, { objectiveId: w.objectiveId, horizon: '90d', scenarioId: null, classification: 'internal', effectiveAt: null });
    expect(first.imp.basis).toBeNull();
    expect(first.imp.changed.map((x) => x['dimension']).sort()).toEqual(['classification', 'objective']);
    expect(first.out.context['version']).toBe(1);
    // brandt's open work (SYNTHETIC): a draft, a task linked to nothing old, a request on the objective
    const draftId = await draft(brandt.principalId, 'Bab el-Mandeb corridor reroute (SYNTHETIC)');
    await draft(brandt.principalId, 'an abandoned draft (SYNTHETIC)', 'shell.draft.discarded');
    await draft(brandt.principalId, 'an expired draft (SYNTHETIC)', 'shell.draft.saved', uuidv7(), new Date(Date.now() - 60_000).toISOString());
    const taskId = await task(brandt.principalId, uuidv7(), 'Review the corridor gate (SYNTHETIC)');
    const requestId = await request(brandt.principalId, w.objectiveId);
    const before = { contexts: (await contexts(brandt.principalId)).length, events: (await shellEvents(brandt.principalId)).length };
    const proposed = { objectiveId: null, horizon: '90d', scenarioId: w.scenarioId, classification: 'internal', effectiveAt: null };
    const imp = await impact(brandt, proposed);
    // THE PREVIEW: what changes, what is affected — before anything is committed
    expect(imp.basis).toMatchObject({ context_id: first.out.context['context_id'], digest: first.out.context['digest'] });
    expect(imp.changed.map((x) => x['dimension']).sort()).toEqual(['objective', 'scenario']);
    expect(imp.changed.find((x) => x['dimension'] === 'objective')).toMatchObject({ from_id: w.objectiveId, to_id: null, from: { id: w.objectiveId, status: 'active' } });
    expect(imp.changed.find((x) => x['dimension'] === 'scenario')).toMatchObject({ from_id: null, to_id: w.scenarioId });
    expect(imp.stale).toEqual([]);
    expect(imp.committable).toBe(true);
    expect(imp.affected['drafts']).toMatchObject({ count: 1, items: [expect.objectContaining({ draft_id: draftId, form_key: 'decisions.package.new', disposition: 'kept' })] });
    expect(imp.affected['tasks']).toMatchObject({ count: 1, items: [expect.objectContaining({ task_id: taskId, disposition: 'kept', linked_to_old: false })] });
    expect(imp.affected['requests']).toMatchObject({ count: 1, items: [expect.objectContaining({ request_id: requestId, disposition: 'kept', linked_to_old: true, linked_to_new: false })] });
    expect(imp.affected['home']).toMatchObject({ effect: 'recomposed under the new context' });
    expect(imp.previews).toMatchObject({ held_by: 'client' });
    expect(imp.approvals).toMatchObject({ effect: 'unaffected' });
    expect(imp.impact_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(imp.proposed['digest']).toMatch(/^[0-9a-f]{64}$/);
    // reading the impact wrote nothing
    expect({ contexts: (await contexts(brandt.principalId)).length, events: (await shellEvents(brandt.principalId)).length }).toEqual(before);
    // THE DELIBERATE COMMIT of exactly what was previewed
    const out = await commit(brandt, { ...proposed, basisContextId: imp.basis!['context_id'], impactDigest: imp.impact_digest, invalidated: ['decision-preview:pkg-1', 'bulk-selection:sources'] });
    expect(out.receipt).toMatchObject({ policyDecisionId: expect.any(String), auditSeq: expect.any(Number) });
    expect(out.context).toMatchObject({ digest: imp.proposed['digest'], supersedes: first.out.context['context_id'], version: 2, impact_digest: imp.impact_digest,
                                        invalidated_previews: ['decision-preview:pkg-1', 'bulk-selection:sources'] });
    const rows = await contexts(brandt.principalId);
    expect(rows.map((r) => r['superseded'])).toEqual([true, false]);
    expect(rows[1]).toMatchObject({ objective_id: null, scenario_id: w.scenarioId, digest: imp.proposed['digest'] });
    const led = await shellEvents(brandt.principalId, 'shell.context.committed');
    expect(led.at(-1)).toMatchObject({ subject_kind: 'context', subject_id: out.context['context_id'], version: 2,
      details: expect.objectContaining({ changed: ['objective', 'scenario'], impact_digest: imp.impact_digest, kept: { drafts: 1, tasks: 1, requests: 1, workspaces: 0, rooms: 0 },
                                          invalidated_previews: ['decision-preview:pkg-1', 'bulk-selection:sources'], invalidated_by: 'client' }) });
    // the drafts, the task and the request are where they were — nothing re-scoped, nothing discarded
    expect((await sql<{ state: string }>`select state from executive.human_tasks where task_id = ${taskId}::uuid`.execute(su)).rows[0]!.state).toBe('open');
    expect((await sql<{ state: string }>`select state from executive.requests where request_id = ${requestId}::uuid`.execute(su)).rows[0]!.state).toBe('routed');
    expect((await bar(brandt)).current).toMatchObject({ version: 2, scenario: { id: w.scenarioId }, objective: null });
    evidence('CB3 preview', { changed: imp.changed, affected: imp.affected, approvals: imp.approvals, previews: imp.previews, digest: imp.impact_digest });
    evidence('CB3 commit', { context: out.context, ledger: led.at(-1) });
  });

  it('APPROVALS UNAFFECTED (UX-10-004): an approver\'s live approval is listed unaffected with its version digest; after the approver switches context the approval still commits the package', async () => {
    const p = await c.proposed();
    const a = await c.approve(p.pkg, p.v, { decision: 'approve', versionDigest: p.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, w.approver);
    const imp = await impact(w.approver, { objectiveId: w.objectiveId, horizon: '30d', scenarioId: w.scenarioId, classification: 'internal', effectiveAt: null });
    const listed = imp.approvals.items.find((x) => x['approval_id'] === a.approval.approvalId);
    expect(listed).toMatchObject({ package_id: p.pkg, version: p.v, version_digest: p.digest, effect: 'unaffected' });
    await commit(w.approver, { objectiveId: w.objectiveId, horizon: '30d', scenarioId: w.scenarioId, classification: 'internal', effectiveAt: null,
                               basisContextId: (imp.basis?.['context_id'] as string | undefined) ?? null, impactDigest: imp.impact_digest });
    const row = (await sql<Row>`select revoked_at, version_digest from decision.approvals where approval_id = ${a.approval.approvalId}::uuid`.execute(su)).rows[0]!;
    expect(row).toMatchObject({ revoked_at: null, version_digest: p.digest });
    const cm = await c.commit(p.pkg, p.v, p.digest, w.authority);
    expect(cm.commitment.approvals.map((x) => x.approval_id)).toContain(a.approval.approvalId);
    evidence('CB3 approvals', { listed, committedWith: cm.commitment.approvals });
  });
});

describe('CB4 · stale context refused; the recovery (UX-10-005, PAT-02)', () => {
  it('REFUSAL: a closed scenario is listed stale in the preview and refused by the PORT `context rejected (stale)` (409); nothing recorded', async () => {
    const scn = (await sql<{ id: string }>`select scenario_id::text as id from prediction.scenarios_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and scenario_id <> ${w.scenarioId}::uuid limit 1`.execute(su)).rows[0]?.id
      ?? w.scenarioId;
    const closed = uuidv7();
    await sql`insert into prediction.scenarios_current select (jsonb_populate_record(null::prediction.scenarios_current, to_jsonb(s) || jsonb_build_object('scenario_id', ${closed}::text, 'title', 'A closed corridor scenario (SYNTHETIC)', 'state', 'closed'))).*
      from prediction.scenarios_current s where s.scenario_id = ${scn}::uuid`.execute(su);
    const before = (await contexts(brandt.principalId)).length;
    const proposed = { objectiveId: w.objectiveId, horizon: '90d', scenarioId: closed, classification: 'internal', effectiveAt: null };
    const imp = await impact(brandt, proposed);
    expect(imp.stale).toEqual([expect.objectContaining({ dimension: 'scenario', id: closed, reason: expect.stringMatching(/^context rejected \(stale\): scenario .* is closed; a stale scenario cannot be set/) })]);
    expect(imp.committable).toBe(false);
    await refused(commit(brandt, { ...proposed, basisContextId: imp.basis!['context_id'], impactDigest: imp.impact_digest }), /^context rejected \(stale\): scenario .* is closed; a stale scenario cannot be set/, 409);
    await refused(commit(brandt, { ...proposed, scenarioId: uuidv7(), basisContextId: imp.basis!['context_id'], impactDigest: imp.impact_digest }), /^context rejected \(stale\): scenario .* is not a scenario of this domain/, 409);
    expect((await contexts(brandt.principalId)).length).toBe(before);
  });

  it('REFUSAL: the basis changed since the preview (another switch committed) and the affected work changed (a new draft) — each refused (409); RECOVERY: preview again, commit', async () => {
    const a = { objectiveId: w.objectiveId, horizon: '12m', scenarioId: w.scenarioId, classification: 'internal', effectiveAt: null };
    const b = { objectiveId: w.objectiveId, horizon: '36m', scenarioId: w.scenarioId, classification: 'internal', effectiveAt: null };
    const pa = await impact(brandt, a);
    await previewAndCommit(brandt, b); // the context moves under the first preview
    await refused(commit(brandt, { ...a, basisContextId: pa.basis!['context_id'], impactDigest: pa.impact_digest }), /^context rejected \(stale\): the context changed since the preview .*; preview the switch again/, 409);
    const pa2 = await impact(brandt, a);
    await draft(brandt.principalId, 'a draft started after the preview (SYNTHETIC)');
    await refused(commit(brandt, { ...a, basisContextId: pa2.basis!['context_id'], impactDigest: pa2.impact_digest }), /^context rejected \(stale\): the affected work changed since the preview .*; preview the switch again/, 409);
    // RECOVERY: the person previews again (the new draft listed) and commits what they saw
    const pa3 = await impact(brandt, a);
    expect(pa3.affected['drafts']!.count).toBe(pa2.affected['drafts']!.count + 1);
    const out = await commit(brandt, { ...a, basisContextId: pa3.basis!['context_id'], impactDigest: pa3.impact_digest });
    expect(out.context).toMatchObject({ horizon: '12m', digest: pa3.proposed['digest'] });
  });

  it('REFUSAL: no commit without its preview (422 at the route and in the port); an unchanged context (422); a bad horizon (422)', async () => {
    const cur = await bar(brandt);
    const same = { objectiveId: w.objectiveId, horizon: '12m', scenarioId: w.scenarioId, classification: 'internal', effectiveAt: null };
    await refused(commit(brandt, { ...same, horizon: '30d' }), /^context rejected \(preview\): a context is committed only from its impact preview/, 422);
    await refused(commit(brandt, { ...same, horizon: '30d', basisContextId: cur.current!['context_id'] }), /^context rejected \(preview\): a context is committed only from its impact preview — the impact digest/, 422);
    const imp = await impact(brandt, same);
    expect(imp.unchanged).toBe(true);
    await refused(commit(brandt, { ...same, basisContextId: imp.basis!['context_id'], impactDigest: imp.impact_digest }), /^context rejected \(unchanged\)/, 422);
    await refused(impact(brandt, { ...same, horizon: '7d' }), /^context rejected \(horizon\): the horizon is one of 30d, 90d, 12m, 36m/, 422);
    // the port itself refuses a missing digest (the route is not the only line)
    const portRefusal = await refusal(inCommitContext(commitDb, { sessionId: brandt.sessionId as string, contextKey: brandt.contextKey as string }, { tenantId: T(), domainId: D() }, 'executive.context.set', uuidv7(),
      async (tx) => sql`select executive.commit_context(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, null, '30d', null, 'internal', null, ${String(cur.current!['context_id'])}::uuid, null, '[]'::jsonb, ${brandt.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx)));
    expect(portRefusal.message).toMatch(/^context rejected \(preview\)/);
    expect(portRefusal.status).toBe(422);
  });
});

describe('CB5 · who may set (D3): every human domain role; never an agent', () => {
  it('POSITIVE: a collection manager and an analyst set their own context (presentation only, their own rows)', async () => {
    const m = await previewAndCommit(manager, { objectiveId: w.objectiveId, horizon: '30d', scenarioId: null, classification: 'internal', effectiveAt: null });
    expect(m.out.context).toMatchObject({ objective_id: w.objectiveId, horizon: '30d', version: 1 });
    expect((await bar(manager)).may_set).toBe(true);
    const a = await previewAndCommit(analyst, { objectiveId: w.objectiveId, horizon: '30d', scenarioId: w.scenarioId, classification: 'confidential', effectiveAt: new Date(Date.UTC(2026, 9, 1)).toISOString() });
    expect(a.out.context).toMatchObject({ scenario_id: w.scenarioId, classification: 'confidential' });
    expect((await bar(analyst)).current).toMatchObject({ effective_at: expect.stringMatching(/^2026-10-01/) });
  });

  it('REFUSAL: a principal holding only an agent role (PDP, 403); a non-human holding a human role (the human gate, 403); a roleless human (no binding in the domain, 403) — the role and gate refusals recorded as denials', async () => {
    const proposed = { objectiveId: w.objectiveId, horizon: '30d', scenarioId: null, classification: 'internal', effectiveAt: null, basisContextId: null, impactDigest: 'b'.repeat(64) };
    await refused(commit(agentRole, proposed), /no qualifying role|role/i, 403);
    const r = await refused(commit({ ...brandt, kind: 'agent' } as AuthenticatedPrincipal, proposed), /human gate: executive\.context\.set requires a named human principal/, 403);
    expect(r.code).toBe('EYE-WFL-002');
    await refused(commit(roleless, proposed), /principal has no binding for this domain|no qualifying role/i, 403);
    await refused(impact(agentRole, proposed), /no qualifying role|role/i, 403);
    const denied = Number((await sql<{ n: string }>`select count(*)::text n from audit.audit_events where tenant_id = ${T()}::uuid and action = 'executive.context.set' and outcome = 'denied'`.execute(su)).rows[0]!.n);
    expect(denied).toBeGreaterThanOrEqual(2);
  });

  it('THE PORT RE-CHECKS: the agent-role holder reaching the port directly (no human domain role) and a principal that is no longer human — each `context rejected (actor)` (403)', async () => {
    const direct = (as: AuthenticatedPrincipal) => refusal(inCommitContext(commitDb, { sessionId: as.sessionId as string, contextKey: as.contextKey as string }, { tenantId: T(), domainId: D() }, 'executive.context.set', uuidv7(),
      async (tx) => sql`select executive.commit_context(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, null, '30d', null, 'internal', null, null, ${'c'.repeat(64)}, '[]'::jsonb, ${as.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx)));
    const r1 = await direct(agentRole);
    expect(r1.message).toMatch(/^context rejected \(actor\): the acting principal holds no human domain role in this domain/);
    expect(r1.status).toBe(403);
    const flipped = await h.humanWithSession(['domain_analyst'], 'b80cb-flipped');
    await sql`update identity.principals set kind = 'agent' where id = ${flipped.principalId}::uuid`.execute(su);
    const r2 = await direct(flipped);
    expect(r2.message).toMatch(/context rejected \(actor\): a context is set by a named human|human|agent/);
    expect(r2.status).toBe(403);
    evidence('CB5 port', { r1, r2 });
  });
});

describe('CB6 · isolation: the principal\'s own context, the domain\'s own scope (UX-10-006 fixtures)', () => {
  it('REFUSAL: another principal\'s impact (actor, 403); a foreign domain at the PDP (403); the shell ledger reads the principal\'s own rows only', async () => {
    const other = await refusal(inCommitContext(commitDb, { sessionId: analyst.sessionId as string, contextKey: analyst.contextKey as string }, { tenantId: T(), domainId: D() }, 'executive.context.read', uuidv7(),
      async (tx) => sql`select executive.context_impact(${T()}::uuid, ${D()}::uuid, ${brandt.principalId}::uuid, null, '90d', null, 'internal', null)`.execute(tx)));
    expect(other.message).toMatch(/^context rejected \(actor\): the impact is read by the acting principal, for its own context/);
    expect(other.status).toBe(403);
    const foreign = uuidv7();
    await refused(cc.read(R(brandt, 'executive.context.read', T(), foreign), T(), foreign) as unknown as Promise<unknown>, /./, 403);
    const own = await inCommitContext(commitDb, { sessionId: analyst.sessionId as string, contextKey: analyst.contextKey as string }, { tenantId: T(), domainId: D() }, 'executive.context.read', uuidv7(),
      async (tx) => (await sql<{ mine: string; theirs: string }>`select (select count(*) from shell.events where principal_id = ${analyst.principalId}::uuid)::text as mine,
                                                                       (select count(*) from shell.events where principal_id = ${brandt.principalId}::uuid)::text as theirs`.execute(tx)).rows[0]!);
    expect(Number(own.mine)).toBeGreaterThan(0);
    expect(Number(own.theirs)).toBe(0);
    expect((await shellEvents(brandt.principalId)).length).toBeGreaterThan(0);
  });

  it('the grants: the reads to eye_app and eye_commit, the commit to eye_commit alone; none to PUBLIC', async () => {
    const g = (await sql<Row>`select
      has_function_privilege('eye_app', 'executive.context_impact(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz)', 'EXECUTE') as app_impact,
      has_function_privilege('eye_app', 'executive.context_bar(uuid, uuid, uuid)', 'EXECUTE') as app_bar,
      has_function_privilege('eye_app', 'executive.commit_context(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, uuid, text, jsonb, uuid, uuid)', 'EXECUTE') as app_commit,
      has_function_privilege('eye_commit', 'executive.commit_context(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, uuid, text, jsonb, uuid, uuid)', 'EXECUTE') as cmt_commit,
      (select prosecdef from pg_proc where oid = 'executive.commit_context(uuid, uuid, uuid, uuid, text, uuid, text, timestamptz, uuid, text, jsonb, uuid, uuid)'::regprocedure) as definer`.execute(su)).rows[0]!;
    expect(g).toEqual({ app_impact: true, app_bar: true, app_commit: false, cmt_commit: true, definer: true });
  });
});
