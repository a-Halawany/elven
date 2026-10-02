/**
 * CP-6 B34 · part G — HUMAN GATE COMPLETENESS (F-P6-04; 0090 §G), through the real database and controller.
 *
 * The demo end to end: the approver sets "only if customs pre-clearance holds" (an assumption_holds condition on the ASU "Customs
 * pre-clearance holds for the rerouted consignments", declared unverified); at commitment the condition is evaluated and HOLDS the
 * commit (commit.held recorded; 200 {commitment: null, held}); the owner defers with a next-review date (a gate.review task and its
 * deadline timer); the assumption is verified; the owner resumes; the authority previews and commits with the preview's digest; in
 * monitoring the condition's failure is recorded once. Then each clause — positive, refusal (403 / 404 / 409 / 422) and recovery:
 * the typed conditions, the seven distinct gate acts (HX-12), the independent decision-ready (OBJ-32), the override (normal and
 * emergency, its after-the-fact review), delegation with expiry, end and reassignment (FEX-16), the reserved board class (PER-01),
 * the consequence preview (HX-13), the versioned controls in force at the decision instant in the replay, and a deferred version
 * superseded by a withdrawal and by a new proposal. The DEADLINE FIRING of a gate task is the workflow part's tick (not here): this
 * harness asserts the task and its timer exist. SYNTHETIC world (bootDecisionWorld); persona text is pronoun-neutral.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { DecisionCapability } from '../../src/decision/decision.capabilities.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let pipeline: PipelineService;
let analyst: AuthenticatedPrincipal; let executive2: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const DAY = 86_400_000;
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B24 idiom). */
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
/** A pre-B34 port text the mapper does not answer (0042's quorum and state sentences reach the caller as the port's own error). */
const refusedRaw = async (p: Promise<unknown>, re: RegExp) => { const r = await refusal(p); expect(r.message).toMatch(re); return r; };
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B34 GATES EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the calls ───────────── */
const dc = () => w.decisions;
const ACTION: Record<string, string> = { 'request-information': 'decision.gate.request_information' };
const gate = (as: AuthenticatedPrincipal, pkg: string, v: number, act: string, payload: Row = {}) =>
  dc().gateAct(h.req(as, ACTION[act] ?? `decision.gate.${act}`, 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), act, { payload }) as Promise<{ gate: Row }>;
const status = (pkg: string, v: number, as = w.executive) => dc().gateStatus(h.req(as, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v)) as Promise<{ gate: Row & { conditions: Row; actions: Row[]; overrides: Row[]; delegations: Row[]; tasks: Row[]; previews: Row[]; holds: Row[] } }>;
const override = (as: AuthenticatedPrincipal, pkg: string, v: number, payload: Row) => dc().grantOverride(h.req(as, 'decision.override.grant', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload }) as Promise<{ override: Row }>;
const reviewOverride = (as: AuthenticatedPrincipal, pkg: string, id: string, payload: Row) => dc().reviewOverride(h.req(as, 'decision.override.review', 'DPK', pkg, 'decision'), T(), D(), pkg, id, { payload }) as Promise<{ review: Row }>;
const delegate = (as: AuthenticatedPrincipal, pkg: string, payload: Row) => dc().delegate(h.req(as, 'decision.delegation.grant', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload }) as Promise<{ delegation: Row }>;
const endDelegation = (as: AuthenticatedPrincipal, pkg: string, id: string, payload: Row) => dc().endDelegation(h.req(as, 'decision.delegation.end', 'DPK', pkg, 'decision'), T(), D(), pkg, id, { payload }) as Promise<{ delegation: Row }>;
const reserve = (as: AuthenticatedPrincipal, pkg: string, payload: Row) => dc().reserveBoard(h.req(as, 'decision.board.reserve', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload }) as Promise<{ board: Row }>;
const control = (as: AuthenticatedPrincipal, payload: Row) => dc().recordControl(h.req(as, 'decision.control.record', 'DPK', null, 'decision'), T(), D(), { payload }) as Promise<{ control: Row }>;
const infoDigest = async (pkg: string, v: number) => String((await status(pkg, v)).gate['information_package_digest']);

/* ───────────── the record ───────────── */
const events = async (pkg: string, event: string) => (await sql<{ details: Row; actor: string }>`select details, actor_principal_id::text actor from decision.package_events
  where package_id = ${pkg}::uuid and event = ${event} order by occurred_at, event_id`.execute(su)).rows;
const versionState = async (pkg: string, v: number) => (await sql<{ s: string }>`select state s from decision.package_versions where package_id = ${pkg}::uuid and version = ${v}`.execute(su)).rows[0]?.s;
const pkgState = async (pkg: string) => (await sql<{ s: string }>`select state s from decision.packages_current where package_id = ${pkg}::uuid`.execute(su)).rows[0]?.s;
const commitments = async (pkg: string) => Number((await sql<{ n: number }>`select count(*)::int n from decision.commitments where package_id = ${pkg}::uuid`.execute(su)).rows[0]!.n);
const tasks = async (pkg: string, kind: string) => (await sql<{ task_id: string; state: string; assignee: string | null; deadline_at: Date | null; timer: string | null; outcome: string | null }>`
  select task_id::text, state, assignee_principal_id::text assignee, deadline_at, deadline_timer_id::text timer, outcome from executive.human_tasks
   where kind = ${kind} and (subject ->> 'id' = ${pkg} or subject ->> 'package_id' = ${pkg}) order by opened_at`.execute(su)).rows;
const timer = async (id: string) => (await sql<{ kind: string; fired_at: Date | null; cancelled_at: Date | null; due_at: Date }>`select kind, fired_at, cancelled_at, due_at from executive.workflow_timers where timer_id = ${id}::uuid`.execute(su)).rows[0];
const evaluations = async (pkg: string, stage: string) => (await sql<{ holds: boolean; waived_by: string | null }>`select holds, waived_by::text from decision.approval_condition_evaluations
  where package_id = ${pkg}::uuid and stage = ${stage} order by evaluated_at`.execute(su)).rows;

/** An ASU through the strategy port (declared UNVERIFIED — the strategy service's rule). */
const declareAssumption = async (title: string): Promise<string> =>
  ((await w.graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title, statement: 'the customs broker pre-clears every rerouted consignment before arrival',
    restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the assumption is about the rerouted chain' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
/** The assumption's verification: VERIFIED by a person through the integrator's route (0090 §I, graph.assumption.verify — the strategy owner on a
 *  session of its own); moved back to UNVERIFIED as impact propagation does (the port under graph.strategy.declare — a person records only
 *  verified or invalidated). */
const setAssumption = async (asu: string, state: 'verified' | 'unverified', reason: string) => {
  if (state === 'verified') {
    const me = await h.openSession(w.twinOwner);
    await w.graph.verifyAssumption(h.req(me, 'graph.assumption.verify', 'ASU', asu, 'graph'), T(), D(), asu, { payload: { state, reason } });
    return;
  }
  await pipeline.write(h.env(w.twinOwner, 'graph.strategy.declare', 'ASU', asu, 'graph'), w.twinOwner,
    { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'graph.strategy.declare', objectType: 'ASU', objectId: asu }, (tx: unknown) => tx,
    async (tx) => {
      await sql`select graph.set_assumption_state(${asu}::uuid, ${T()}::uuid, ${D()}::uuid, ${state}, ${reason}, ${w.twinOwner.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
      return { result: null, targetType: 'ASU', targetId: asu, targetVersion: '1', outboxEvent: null };
    });
};
const approveWith = (pkg: string, v: number, digest: string, conditions: unknown[], as = w.approver) =>
  c.approve(pkg, v, { decision: 'approve', versionDigest: digest, rationale: 'The reroute keeps the line running, on the stated condition.', conditions }, as);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su as AnyDb;
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  pipeline = h.app.get(PipelineService);
  analyst = await h.humanWithSession(['domain_analyst'], 'b34-analyst');
  executive2 = await h.humanWithSession(['executive'], 'b34-executive-2');
}, 300_000);
afterAll(async () => { await h?.close(); });

describe('B34 G1 — THE DEMO: a condition holds the commit; the owner defers; verified → resumed → previewed → committed; monitored', () => {
  it('holds, defers, resumes and commits, with the controls in force at the decision instant in the replay', async () => {
    const asu = await declareAssumption('Customs pre-clearance holds for the rerouted consignments');
    expect((await sql<{ s: string }>`select verification_state s from graph.strategy_current where strategy_object_id = ${asu}::uuid`.execute(su)).rows[0]?.s).toBe('unverified');
    const P = await c.proposed();
    // the gate.approve task opened at the proposal
    expect((await tasks(P.pkg, 'gate.approve')).map((t) => t.state)).toEqual(['open']);
    /* the approver's condition (typed; a plain string stays a note) */
    const a = await approveWith(P.pkg, P.v, P.digest, [{ kind: 'assumption_holds', ref: asu, label: 'only if customs pre-clearance holds' }, 'watch the Cape weather']);
    expect(a.approval.state).toBe('approved');
    expect((await tasks(P.pkg, 'gate.approve')).map((t) => [t.state, t.outcome])).toEqual([['completed', 'quorum']]);
    const stored = (await sql<{ c: unknown[] }>`select conditions c from decision.approvals where approval_id = ${a.approval.approvalId}::uuid`.execute(su)).rows[0]!.c;
    expect(stored).toEqual([{ kind: 'assumption_holds', ref: asu, expected: 'verified', label: 'only if customs pre-clearance holds', stages: ['commit', 'monitor'] }, 'watch the Cape weather']);
    /* a control decision in force before the commitment */
    const ctl1 = (await control(w.authority, { kind: 'control_decision', controlKey: 'b34' + '.reroute-premium-cap', body: { cap_eur: 60000 }, rationale: 'the reroute premium is capped for Q1 (B34 harness)' })).control;
    expect(ctl1).toMatchObject({ version: 1, supersedes: null });
    /* the preview says the commit would be HELD */
    const pv1 = (await c.preview(P.pkg, P.v, P.digest)).preview;
    expect(pv1.preview['would_commit']).toBe(false);
    expect(String((pv1.preview['blockers'] as string[])[0])).toMatch(/1 approval condition\(s\) do not hold — the commit would be HELD/);
    /* THE HOLD: 200 {commitment: null, held}, recorded; nothing committed */
    const held = await c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', pv1.preview_digest);
    expect(held.commitment).toBeNull();
    expect((held.held as { failed: Row[] }).failed.map((f) => [f['kind'], f['ref'], f['holds']])).toEqual([['assumption_holds', asu, false]]);
    expect((await events(P.pkg, 'commit.held')).map((e) => e.details['failed'])).toHaveLength(1);
    expect(await evaluations(P.pkg, 'commit')).toEqual([{ holds: false, waived_by: null }]);
    expect(await commitments(P.pkg)).toBe(0);
    expect(await versionState(P.pkg, P.v)).toBe('approved');
    /* a DIRECT call of the port re-checks and refuses (a raising refusal rolls back: no second hold, no commitment) */
    const cmt = uuidv7();
    const direct = pipeline.write(h.env(w.authority, 'decision.commit', 'CMT', null, 'decision'), w.authority,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'decision.commit', objectType: 'CMT', objectId: cmt, consequenceClass: 'C3', writableTargets: [cmt] }, DecisionCapability.commit,
      async (cap) => ({ result: await cap.commitPackage({ commitmentId: cmt, tenantId: T(), domainId: D(), packageId: P.pkg, version: P.v, committer: w.authority.principalId, versionDigest: P.digest,
        headerDigest: 'a'.repeat(64), title: 'direct', statement: 'direct', eventId: uuidv7(), correlationId: uuidv7(), previewDigest: pv1.preview_digest }), targetType: 'CMT', targetId: cmt, targetVersion: '1', outboxEvent: null }));
    await refused(direct, /^commitment rejected \(conditions_hold\): 1 approval condition\(s\) do not hold at commitment — only if customs pre-clearance holds \(assumption_holds /, 409);
    expect(await events(P.pkg, 'commit.held')).toHaveLength(1);
    /* THE OWNER DEFERS with a next-review date: a gate.review task, its deadline timer pending (the workflow part fires it) */
    const next = inDays(7);
    const d = (await gate(w.owner, P.pkg, P.v, 'defer', { rationale: 'Wait for the broker to confirm pre-clearance (B34 harness)', nextReviewAt: next })).gate;
    expect(d).toMatchObject({ action: 'defer', from_state: 'approved', to_state: 'deferred', standing: 'owner', event: 'version.deferred' });
    expect(await versionState(P.pkg, P.v)).toBe('deferred');
    expect(await pkgState(P.pkg)).toBe('deferred');
    const rt = await tasks(P.pkg, 'gate.review');
    expect(rt).toHaveLength(1);
    expect(rt[0]).toMatchObject({ state: 'open', assignee: w.owner.principalId });
    expect(rt[0]!.deadline_at?.toISOString()).toBe(next);
    expect(await timer(rt[0]!.timer as string)).toMatchObject({ kind: 'task.deadline', fired_at: null, cancelled_at: null });
    expect((await events(P.pkg, 'version.deferred'))[0]!.details).toMatchObject({ rationale: 'Wait for the broker to confirm pre-clearance (B34 harness)', to_state: 'deferred' });
    /* while deferred: no commit, no preview, no approval */
    await refused(c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', pv1.preview_digest), /version 1 is deferred, not approved/, 409);
    await refused(c.preview(P.pkg, P.v, P.digest), /^preview rejected \(state\): version 1 is deferred/, 409);
    await refused(c.approve(P.pkg, P.v, { decision: 'approve', versionDigest: P.digest, rationale: 'approving a deferred version' }, w.approver2), /only a proposed version is approved/, 409);
    /* VERIFIED later → the owner RESUMES → approved (the live approval still stands) */
    // the route refuses the analyst (no planning authority, 403) and a person recording 'unverified' (422)
    await refused(w.graph.verifyAssumption(h.req(w.operator, 'graph.assumption.verify', 'ASU', asu, 'graph'), T(), D(), asu, { payload: { state: 'verified', reason: 'the operator verifies it (harness)' } }), /./, 403);
    await refused(w.graph.verifyAssumption(h.req(await h.openSession(w.twinOwner), 'graph.assumption.verify', 'ASU', asu, 'graph'), T(), D(), asu, { payload: { state: 'unverified', reason: 'a person never records unverified (harness)' } }), /^assumption verification rejected \(state\)/, 422);
    await setAssumption(asu, 'verified', 'the broker confirmed pre-clearance for all three consignments (SYNTHETIC)');
    const r = (await gate(w.owner, P.pkg, P.v, 'resume', { rationale: 'Pre-clearance confirmed; back to the gate (B34 harness)' })).gate;
    expect(r).toMatchObject({ from_state: 'deferred', to_state: 'approved', event: 'version.resumed' });
    expect((await tasks(P.pkg, 'gate.review'))[0]).toMatchObject({ state: 'completed', outcome: 'resumed' });
    expect((await timer(rt[0]!.timer as string))!.cancelled_at).not.toBeNull();
    /* the stale preview: the commit carries a digest recorded BEFORE — it still matches within 30 minutes, but the preview is re-read */
    const pv2 = (await c.preview(P.pkg, P.v, P.digest)).preview;
    expect(pv2.preview['would_commit']).toBe(true);
    const cm = await c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', pv2.preview_digest);
    expect(cm.commitment.commitmentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await commitments(P.pkg)).toBe(1);
    expect((await events(P.pkg, 'package.committed'))[0]!.details).toMatchObject({ preview_digest: pv2.preview_digest, decision_class: 'standard', conditions_evaluated: 1 });
    expect((await evaluations(P.pkg, 'commit')).map((e) => e.holds)).toEqual([false, true]);
    /* a control recorded AFTER the decision is not in force in its replay */
    const ctl2 = (await control(w.authority, { kind: 'control_decision', controlKey: 'b34' + '.reroute-premium-cap', body: { cap_eur: 45000 }, rationale: 'the cap tightened after the decision (B34 harness)' })).control;
    expect(ctl2).toMatchObject({ version: 2, supersedes: ctl1['control_id'] });
    const rp = (await c.replay(P.pkg, P.v)).replay as unknown as { controlsInForce: { at: string; controls: Row[] } };
    expect(rp.controlsInForce.controls.filter((x) => x['control_key'] === 'b34.reroute-premium-cap').map((x) => x['version'])).toEqual([1]);
    /* MONITORING: the condition fails after the commitment → approval_condition.failed, once */
    await setAssumption(asu, 'unverified', 'the broker withdrew pre-clearance for one consignment (SYNTHETIC)');
    const m1 = (await c.monitor(P.pkg)).monitoring as Row;
    expect(m1['approval_conditions_failed_now']).toBe(1);
    const m2 = (await c.monitor(P.pkg)).monitoring as Row;
    expect(m2['approval_conditions_failed_now']).toBe(0);
    const failed = await events(P.pkg, 'approval_condition.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]!.details).toMatchObject({ kind: 'assumption_holds', ref: asu, label: 'only if customs pre-clearance holds', routed_to: [w.owner.principalId, w.approver.principalId] });
    expect(await pkgState(P.pkg)).toBe('monitoring');
    sixEvidence('G1', { fault_trace: { held: held.held, direct: 'conditions_hold 409' }, watermark: { asu, preview: pv2.preview_digest }, consumer_behaviour: 'the hold recorded before the commit; the monitor records the failure once',
      operator_action: 'the owner deferred with a next review, then resumed', recovery: 'verified → resumed → previewed → committed', reconciliation: { commitments: await commitments(P.pkg), failed: failed.length, controls_in_force: 1 } });
  });
});

describe('B34 G2 — the typed conditions: validated at approval, evaluated at commitment', () => {
  it('refuses a malformed condition (422) and an unknown reference (404); a date_before past its instant holds the commit', async () => {
    const P = await c.proposed();
    await refused(approveWith(P.pkg, P.v, P.digest, [{ kind: 'gut_feeling', ref: w.assumptionId, label: 'trust me' }]), /^approval rejected \(conditions\): condition 0 kind gut_feeling is not one of/, 422);
    await refused(approveWith(P.pkg, P.v, P.digest, [{ kind: 'assumption_holds', ref: w.assumptionId }]), /^approval rejected \(conditions\): condition 0 names its label/, 422);
    await refused(approveWith(P.pkg, P.v, P.digest, [{ kind: 'indicator_state', ref: uuidv7(), label: 'the corridor indicator is clear' }]), /^approval rejected \(condition_ref\): condition 0 names no indicator of this domain/, 404);
    await refused(approveWith(P.pkg, P.v, P.digest, [{ kind: 'date_before', label: 'before the sailing', stages: ['later'] }]), /^approval rejected \(conditions\): condition 0 stages/, 422);
    expect((await sql<{ n: number }>`select count(*)::int n from decision.approvals where package_id = ${P.pkg}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    // indicator clear and warning absent hold; a date_before in the past does not
    await approveWith(P.pkg, P.v, P.digest, [
      { kind: 'indicator_state', ref: w.indicatorId, expected: 'clear', label: 'the corridor indicator is clear' },
      { kind: 'warning_absent', ref: w.branchId, label: 'no warning on the collapse branch' },
      { kind: 'date_before', expected: '2020-01-01T00:00:00Z', label: 'decide before the 2020 sailing', stages: ['commit'] },
    ]);
    const s = (await status(P.pkg, P.v)).gate.conditions as { conditions: Row[]; failed: number };
    expect(s.conditions.map((x) => [x['kind'], x['holds']])).toEqual([['indicator_state', true], ['warning_absent', true], ['date_before', false]]);
    const held = await c.commit(P.pkg, P.v, P.digest);
    expect(held.commitment).toBeNull();
    expect((held.held as { failed: Row[] }).failed.map((f) => f['kind'])).toEqual(['date_before']);
    sixEvidence('G2', { fault_trace: 'date_before past its instant', watermark: s.failed, consumer_behaviour: 'refusals leave no approval', operator_action: 'none', recovery: 'see G5 (override)', reconciliation: { commitments: await commitments(P.pkg) } });
  });
});

describe('B34 G3 — the distinct gate acts (HX-12) and OBJ-35', () => {
  it('review and acknowledge record a reading; request-information and resume; reject by the owner; the refusals', async () => {
    const P = await c.proposed();
    const rv = (await gate(w.approver, P.pkg, P.v, 'review', { rationale: 'Read the options and the dissent (B34 harness)' })).gate;
    expect(rv).toMatchObject({ action: 'review', from_state: 'proposed', to_state: 'proposed', event: 'gate.reviewed' });
    const ak = (await gate(w.executive, P.pkg, P.v, 'acknowledge', { rationale: 'Acknowledged for the board pack (B34 harness)' })).gate;
    expect(ak).toMatchObject({ action: 'acknowledge', event: 'gate.acknowledged' });
    // the PDP: each act its own action — an agent and an executive (no gate standing for defer) are refused before any port
    await refused(gate(w.agent, P.pkg, P.v, 'defer', { rationale: 'an agent defers', nextReviewAt: inDays(3) }), /./, 403);
    await refused(gate(w.executive, P.pkg, P.v, 'reject', { rationale: 'an executive rejects' }), /./, 403);
    const machine: AuthenticatedPrincipal = { ...w.owner, kind: 'agent' };
    await refused(gate(machine, P.pkg, P.v, 'defer', { rationale: 'a machine with the role', nextReviewAt: inDays(3) }), /human gate/, 403);
    // an approver the policy does not name holds the role but no standing at this gate
    await refused(gate(w.approver2, P.pkg, P.v, 'defer', { rationale: 'not named by the policy', nextReviewAt: inDays(3) }), /^gate rejected \(authority\)/, 403);
    // the caller's request
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: 'no next review' }), /^gate rejected \(next_review\)/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: 'a next review in the past', nextReviewAt: new Date(Date.now() - DAY).toISOString() }), /^gate rejected \(next_review\)/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'request-information', { rationale: 'what is asked is missing', nextReviewAt: inDays(3) }), /^gate rejected \(info_request\)/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'postpone', { rationale: 'not an act' }), /^gate rejected \(action\): postpone is not a gate act/, 422);
    await refused(gate(w.owner, uuidv7(), 1, 'review', { rationale: 'a package that is not there' }), /^gate rejected: no such package in this domain/, 404);
    await refused(gate(w.owner, P.pkg, P.v, 'resume', { rationale: 'nothing to resume' }), /^gate rejected \(state\): version 1 is proposed; only a deferred/, 409);
    // RFI → information_requested, a task for the OWNER; resume → proposed (no approvals yet)
    const rfi = (await gate(w.approver, P.pkg, P.v, 'request-information', { rationale: 'The air-bridge cost is missing (B34 harness)', infoRequest: 'the air-bridge quote for week 3', nextReviewAt: inDays(5) })).gate;
    expect(rfi).toMatchObject({ to_state: 'information_requested', standing: 'approver', event: 'version.information_requested' });
    expect((await tasks(P.pkg, 'gate.review')).map((t) => [t.state, t.assignee])).toEqual([['open', w.owner.principalId]]);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: 'deferring twice', nextReviewAt: inDays(3) }), /^gate rejected \(state\): version 1 is already information_requested/, 409);
    const rs = (await gate(w.owner, P.pkg, P.v, 'resume', { rationale: 'The quote is attached to the package (B34 harness)' })).gate;
    expect(rs).toMatchObject({ to_state: 'proposed' });
    // REJECT by the owner, with a rationale: the version ends; its gate tasks cancelled; nothing further moves
    const rj = (await gate(w.owner, P.pkg, P.v, 'reject', { rationale: 'The corridor reopened; the reroute is moot (B34 harness)' })).gate;
    expect(rj).toMatchObject({ to_state: 'rejected', event: 'version.rejected_by_owner' });
    expect(await pkgState(P.pkg)).toBe('rejected');
    expect((await tasks(P.pkg, 'gate.approve')).map((t) => t.state)).toEqual(['cancelled']);
    await refused(gate(w.owner, P.pkg, P.v, 'review', { rationale: 'after the rejection' }), /^gate rejected \(state\): version 1 is rejected/, 409);
    const acts = (await status(P.pkg, P.v)).gate.actions.map((x) => x['action']);
    expect(acts).toEqual(['review', 'acknowledge', 'request_information', 'resume', 'reject']);
    sixEvidence('G3', { fault_trace: 'refusals 403/404/409/422', watermark: acts, consumer_behaviour: 'each act its own PDP action', operator_action: 'RFI, resume, reject', recovery: 'resume from information_requested', reconciliation: { state: await pkgState(P.pkg) } });
  });
});

describe('B34 G4 — decision-ready by an INDEPENDENT reviewer on the information package (OBJ-32)', () => {
  it('a policy requiring ready refuses the commit until an independent reviewer marks the package as it stands', async () => {
    const P = await c.proposed({ terms: { approverPolicy: { quorum: 1, principals: [w.approver.principalId], requires_ready: true, gate_deadline_hours: 48 } } });
    const rr = await tasks(P.pkg, 'gate.ready_review');
    expect(rr).toHaveLength(1);
    expect(rr[0]!.timer).not.toBeNull();
    expect((await tasks(P.pkg, 'gate.approve'))[0]!.deadline_at).not.toBeNull();
    await approveWith(P.pkg, P.v, P.digest, []);
    await refused(c.commit(P.pkg, P.v, P.digest), /^commitment rejected \(not_ready\): no independent reviewer has marked version 1 decision-ready/, 409);
    const digest = await infoDigest(P.pkg, P.v);
    await refused(gate(w.approver, P.pkg, P.v, 'ready', { rationale: 'the approver marks ready', informationPackageDigest: digest }), /^gate rejected \(independence\)/, 403);
    await refused(gate(analyst, P.pkg, P.v, 'ready', { rationale: 'marks a package not read', informationPackageDigest: 'f'.repeat(64) }), /^gate rejected \(stale_package\)/, 409);
    const ok = (await gate(analyst, P.pkg, P.v, 'ready', { rationale: 'Complete: options, dissent, approvals read (B34 harness)', informationPackageDigest: digest })).gate;
    expect(ok).toMatchObject({ action: 'ready', event: 'version.ready' });
    expect((await tasks(P.pkg, 'gate.ready_review'))[0]).toMatchObject({ state: 'completed', outcome: 'ready' });
    // the package changes after the ready (a dissent): the ready is STALE — refused; a fresh ready recovers
    await c.dissent(P.pkg, P.v, { position: 'against', rationale: 'The premium is too high for a one-off reroute.' }, w.approver2);
    await refused(c.commit(P.pkg, P.v, P.digest), /^commitment rejected \(not_ready\): the information package changed since it was marked decision-ready/, 409);
    await gate(analyst, P.pkg, P.v, 'ready', { rationale: 'Re-read with the new dissent (B34 harness)', informationPackageDigest: await infoDigest(P.pkg, P.v) });
    await c.commit(P.pkg, P.v, P.digest);
    expect(await commitments(P.pkg)).toBe(1);
    sixEvidence('G4', { fault_trace: 'not_ready, stale', watermark: digest, consumer_behaviour: 'the ready_review task resolved', operator_action: 'an analyst marks ready', recovery: 'a fresh ready after the dissent', reconciliation: { commitments: 1 } });
  });
});

describe('B34 G5 — OVERRIDE as a recorded object (normal and emergency)', () => {
  it('a normal override waives the failing condition; its grantor never commits; the separation and the standing refused', async () => {
    const P = await c.proposed();
    await approveWith(P.pkg, P.v, P.digest, [{ kind: 'date_before', expected: '2020-01-01T00:00:00Z', label: 'decide before the 2020 sailing', stages: ['commit'] }]);
    await refused(override(w.executive, P.pkg, P.v, { kind: 'normal', rationale: 'an executive may not grant a normal override' }), /^override rejected \(authority\): a normal override is a decision authority/, 403);
    await refused(override(w.authority2, P.pkg, P.v, { kind: 'normal', rationale: 'short' }), /^override rejected \(rationale\)/, 422);
    await refused(override(w.authority2, uuidv7(), 1, { kind: 'normal', rationale: 'a package that is not in this domain at all' }), /^override rejected: no such package/, 404);
    const o = (await override(w.authority2, P.pkg, P.v, { kind: 'normal', rationale: 'The sailing date moved; the date condition is obsolete (B34 harness)' })).override;
    expect(o).toMatchObject({ kind: 'normal', quorum_shortfall: 0 });
    expect((o['waived_conditions'] as Row[]).map((x) => x['condition_index'])).toEqual([0]);
    await refused(override(w.authority2, P.pkg, P.v, { kind: 'normal', rationale: 'nothing is failing any more once it is waived' }), /^override rejected \(nothing_to_override\)/, 409);
    await refused(c.commit(P.pkg, P.v, P.digest, w.authority2), /^commitment rejected \(override_self\)/, 403);
    const cm = await c.commit(P.pkg, P.v, P.digest, w.authority);
    expect(cm.commitment.commitmentId).toBeTruthy();
    expect(await evaluations(P.pkg, 'commit')).toEqual([{ holds: false, waived_by: String(o['override_id']) }]);
    expect((await events(P.pkg, 'package.committed'))[0]!.details['overrides']).toEqual([{ override_id: o['override_id'], kind: 'normal', granted_by: w.authority2.principalId }]);
    sixEvidence('G5a', { fault_trace: 'override_self', watermark: o['override_id'], consumer_behaviour: 'the waived condition marked in the ledger', operator_action: 'a normal override', recovery: 'another authority commits', reconciliation: { commitments: 1 } });
  });

  it('an emergency override covers a quorum shortfall, opens its 72-hour review task, and is reviewed by another', async () => {
    const P = await c.proposed({ terms: { approverPolicy: { quorum: 2, roles: ['decision_approver'] } } });
    await approveWith(P.pkg, P.v, P.digest, []);
    expect(await versionState(P.pkg, P.v)).toBe('under_review');
    await refusedRaw(c.commit(P.pkg, P.v, P.digest), /commitment rejected: version 1 is under_review, not approved/);
    await refused(override(w.authority, P.pkg, P.v, { kind: 'emergency', rationale: 'an authority may not grant an emergency override' }), /^override rejected \(authority\): an emergency override is an executive/, 403);
    const o = (await override(w.executive, P.pkg, P.v, { kind: 'emergency', rationale: 'The second approver is unreachable; the sailing closes tonight (B34 harness)' })).override;
    expect(o).toMatchObject({ kind: 'emergency', quorum_shortfall: 1 });
    const rt = await tasks(P.pkg, 'gate.override_review');
    expect(rt).toHaveLength(1);
    expect(rt[0]!.deadline_at!.getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
    expect(await timer(rt[0]!.timer as string)).toMatchObject({ kind: 'task.deadline', fired_at: null });
    const cm = await c.commit(P.pkg, P.v, P.digest, w.authority);
    expect(cm.commitment.approvals).toHaveLength(1);
    expect(await versionState(P.pkg, P.v)).toBe('committed');
    await refused(reviewOverride(w.executive, P.pkg, String(o['override_id']), { outcome: 'upheld', note: 'reviewing my own override' }), /^override review rejected \(separation\)/, 403);
    await refused(reviewOverride(executive2, P.pkg, uuidv7(), { outcome: 'upheld', note: 'an override that is not there' }), /^override review rejected: no such override/, 404);
    const rv = (await reviewOverride(executive2, P.pkg, String(o['override_id']), { outcome: 'upheld', note: 'The sailing did close; the override was warranted (B34 harness)' })).review;
    expect(rv).toMatchObject({ outcome: 'upheld', late: false });
    expect((await tasks(P.pkg, 'gate.override_review'))[0]).toMatchObject({ state: 'completed', outcome: 'upheld' });
    await refused(reviewOverride(w.authority2, P.pkg, String(o['override_id']), { outcome: 'contested', note: 'a second review' }), /^override review rejected \(reviewed\)/, 409);
    sixEvidence('G5b', { fault_trace: 'quorum shortfall', watermark: o['override_id'], consumer_behaviour: 'the review task opened with its timer', operator_action: 'an emergency override; another executive reviews', recovery: 'committed under cover; upheld', reconciliation: { commitments: await commitments(P.pkg) } });
  });
});

describe('B34 G6 — the reserved BOARD decision class (PER-01)', () => {
  it('an executive reserves a draft; the board decision is never overridden or delegated, needs ready and the board quorum', async () => {
    const { pkg, v } = await c.fullDraft({ terms: { approverPolicy: { quorum: 1, roles: ['decision_approver'] } } });
    await refused(reserve(w.owner, pkg, { board: { charter: 'the supervisory board', quorum: 2 }, rationale: 'the owner cannot reserve' }), /./, 403);
    await refused(reserve(w.executive, pkg, { board: { charter: 'the board', quorum: 1 }, rationale: 'a quorum of one is no board' }), /^board reservation rejected \(board\)/, 422);
    const b = (await reserve(w.executive, pkg, { board: { charter: 'The supervisory board of NORDWERK (SYNTHETIC)', quorum: 2 }, rationale: 'A reroute above the premium cap is a reserved decision (B34 harness)' })).board;
    expect(b).toMatchObject({ decision_class: 'board' });
    await refused(reserve(w.executive, pkg, { board: { charter: 'The supervisory board again', quorum: 2 }, rationale: 'twice (B34 harness)' }), /^board reservation rejected \(reserved\)/, 409);
    const digest = (await c.propose(pkg, v)).proposal.versionDigest;
    expect(await tasks(pkg, 'gate.ready_review')).toHaveLength(1);
    await refused(delegate(w.approver, pkg, { delegate: w.approver2.principalId, expiresAt: inDays(2), reason: 'away for the board meeting' }), /^delegation rejected \(board\)/, 403);
    await approveWith(pkg, v, digest, []);
    await refused(override(w.authority2, pkg, v, { kind: 'normal', rationale: 'overriding a board decision is never allowed' }), /^override rejected \(board\)/, 403);
    await gate(analyst, pkg, v, 'ready', { rationale: 'The board pack is complete (B34 harness)', informationPackageDigest: await infoDigest(pkg, v) });
    await refused(c.commit(pkg, v, digest), /^commitment rejected \(board_quorum\): a board decision needs 2 live approvals of the board; 1 stand now/, 403);
    await approveWith(pkg, v, digest, [], w.approver2);
    await gate(analyst, pkg, v, 'ready', { rationale: 'Re-read with the second approval (B34 harness)', informationPackageDigest: await infoDigest(pkg, v) });
    await c.commit(pkg, v, digest);
    expect(await commitments(pkg)).toBe(1);
    expect((await events(pkg, 'package.committed'))[0]!.details['decision_class']).toBe('board');
    sixEvidence('G6', { fault_trace: 'board_quorum', watermark: b, consumer_behaviour: 'override and delegation refused', operator_action: 'reserve, ready, two approvals', recovery: 'committed at the board quorum', reconciliation: { commitments: 1 } });
  });
});

describe('B34 G7 — DELEGATION of approval authority: expiry, end, reassignment (FEX-16)', () => {
  it('the delegate approves under delegation:<id>; the approval stops counting at the end or the expiry; reassignment', async () => {
    const P = await c.proposed();
    await refused(delegate(w.approver, P.pkg, { delegate: w.approver2.principalId, expiresAt: inDays(31), reason: 'a month away (B34 harness)' }), /^delegation rejected \(expiry\)/, 422);
    await refused(delegate(w.approver, P.pkg, { delegate: w.owner.principalId, expiresAt: inDays(2), reason: 'to the owner (B34 harness)' }), /^delegation rejected \(delegate\): the package owner/, 422);
    await refused(delegate(w.owner, P.pkg, { delegate: w.approver2.principalId, expiresAt: inDays(2), reason: 'the owner delegates' }), /./, 403);
    const d1 = (await delegate(w.approver, P.pkg, { delegate: w.approver2.principalId, expiresAt: inDays(2), reason: 'On leave during the sailing window (B34 harness)' })).delegation;
    expect((await tasks(P.pkg, 'gate.delegated_approval')).map((t) => [t.state, t.assignee])).toEqual([['open', w.approver2.principalId]]);
    await refused(delegate(w.approver, P.pkg, { delegate: w.authorApprover.principalId, expiresAt: inDays(2), reason: 'a second delegation (B34 harness)' }), /^delegation rejected \(duplicate\)/, 409);
    const a = await approveWith(P.pkg, P.v, P.digest, [], w.approver2);
    expect(a.approval).toMatchObject({ state: 'approved', eligibleBy: `delegation:${String(d1['delegation_id'])}` });
    expect((await tasks(P.pkg, 'gate.delegated_approval'))[0]).toMatchObject({ state: 'completed', outcome: 'approved' });
    await refused(approveWith(P.pkg, P.v, P.digest, []), /^approval rejected \(delegation\): your delegate already signed/, 409);
    await refused(endDelegation(w.approver2, P.pkg, String(d1['delegation_id']), { reason: 'not mine to end' }), /./, 403);
    // REASSIGNMENT: the delegation ends; the new delegate holds it; the first delegate's approval stops counting
    const re = (await endDelegation(w.approver, P.pkg, String(d1['delegation_id']), { reason: 'Handing over to the other approver (B34 harness)', reassignTo: w.authorApprover.principalId })).delegation;
    expect((re['reassigned'] as Row)['replaces']).toBe(d1['delegation_id']);
    expect((await sql<{ n: number }>`select count(*)::int n from decision.live_approvals(${P.pkg}::uuid, ${P.v})`.execute(su)).rows[0]!.n).toBe(0);
    await refusedRaw(c.commit(P.pkg, P.v, P.digest), /quorum is 1 distinct eligible humans; 0 live approval/);
    await refused(endDelegation(w.approver, P.pkg, String(d1['delegation_id']), { reason: 'ending it twice (B34 harness)' }), /^delegation end rejected \(ended\)/, 409);
    await approveWith(P.pkg, P.v, P.digest, [], w.authorApprover);
    await c.commit(P.pkg, P.v, P.digest);
    expect(await commitments(P.pkg)).toBe(1);
    // EXPIRY: a short delegation; its delegate's approval stands only while it lives
    const Q = await c.proposed();
    const d2 = (await delegate(w.approver, Q.pkg, { delegate: w.approver2.principalId, expiresAt: new Date(Date.now() + 4000).toISOString(), reason: 'A few seconds only (B34 harness)' })).delegation;
    await approveWith(Q.pkg, Q.v, Q.digest, [], w.approver2);
    expect((await sql<{ n: number }>`select count(*)::int n from decision.live_approvals(${Q.pkg}::uuid, ${Q.v})`.execute(su)).rows[0]!.n).toBe(1);
    await new Promise((r) => setTimeout(r, 4500));
    expect((await sql<{ n: number }>`select count(*)::int n from decision.live_approvals(${Q.pkg}::uuid, ${Q.v})`.execute(su)).rows[0]!.n).toBe(0);
    await refusedRaw(c.commit(Q.pkg, Q.v, Q.digest), /quorum is 1 distinct eligible humans; 0 live approval/);
    sixEvidence('G7', { fault_trace: 'delegation ended / expired', watermark: [d1['delegation_id'], d2['delegation_id']], consumer_behaviour: 'the delegated task resolved on approval', operator_action: 'delegate, reassign', recovery: 'the reassigned delegate approves; committed', reconciliation: { commitments: 1 } });
  });
});

describe('B34 G8 — the CONSEQUENCE PREVIEW before commit (HX-13)', () => {
  it('no preview, a stale or another person\'s preview, and a preview by a non-authority are refused', async () => {
    const P = await c.proposed();
    await approveWith(P.pkg, P.v, P.digest, []);
    await refused(c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', null), /^commitment rejected \(no_preview\)/, 409);
    await refused(c.preview(P.pkg, P.v, P.digest, w.approver), /./, 403);
    await refused(c.preview(P.pkg, P.v, 'c'.repeat(64)), /^preview rejected: the digest previewed/, 409);
    await refused(c.preview(uuidv7(), 1, P.digest), /^preview rejected: no such package/, 404);
    const other = (await c.preview(P.pkg, P.v, P.digest, w.authority2)).preview;
    expect(other.preview['affected_objects']).toMatchObject({ decision: w.decisionId, objectives: [w.objectiveId] });
    expect(other.preview['intended_effect']).toMatchObject({ writes: 'CMT', bound_action: 'decision.commit', op_class: 'C3' });
    await refused(c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', other.preview_digest), /^commitment rejected \(no_preview\)/, 409);
    // stale: a preview older than 30 minutes (the world's clock moved — fixture)
    const mine = (await c.preview(P.pkg, P.v, P.digest)).preview;
    await sql`alter table decision.commit_previews disable trigger append_only`.execute(su);
    await sql`update decision.commit_previews set previewed_at = previewed_at - interval '31 minutes' where preview_id = ${mine.preview_id}::uuid`.execute(su);
    await sql`alter table decision.commit_previews enable trigger append_only`.execute(su);
    await refused(c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', mine.preview_digest), /^commitment rejected \(no_preview\)/, 409);
    await c.commit(P.pkg, P.v, P.digest);
    expect(await commitments(P.pkg)).toBe(1);
    expect((await events(P.pkg, 'commit.previewed')).length).toBe(3);
    sixEvidence('G8', { fault_trace: 'no_preview ×3', watermark: mine.preview_digest, consumer_behaviour: 'every preview recorded', operator_action: 'preview then commit', recovery: 'a fresh preview', reconciliation: { commitments: 1 } });
  });
});

describe('B34 G9 — the versioned controls', () => {
  it('versions per key; refuses a back-dated control, a missing body and a role without standing', async () => {
    await refused(control(w.owner, { kind: 'policy_revision', controlKey: 'b34' + '.quorum-policy', body: { quorum: 2 }, rationale: 'the owner records a policy' }), /./, 403);
    await refused(control(w.executive, { kind: 'policy_revision', controlKey: 'b34' + '.quorum-policy', body: {}, rationale: 'an empty body (B34 harness)' }), /^control rejected \(body\)/, 422);
    await refused(control(w.executive, { kind: 'policy_revision', controlKey: 'b34' + '.quorum-policy', body: { quorum: 2 }, rationale: 'back-dated (B34 harness)', effectiveFrom: '2024-01-01T00:00:00Z' }), /^control rejected \(backdated\)/, 422);
    const v1 = (await control(w.executive, { kind: 'policy_revision', controlKey: 'b34' + '.quorum-policy', body: { quorum: 2 }, rationale: 'two approvers above the cap (B34 harness)' })).control;
    const v2 = (await control(w.executive, { kind: 'policy_revision', controlKey: 'b34' + '.quorum-policy', body: { quorum: 3 }, rationale: 'three approvers above the cap (B34 harness)' })).control;
    expect([v1['version'], v2['version'], v2['supersedes']]).toEqual([1, 2, v1['control_id']]);
    await refused(control(w.executive, { kind: 'control_decision', controlKey: 'b34' + '.quorum-policy', body: { quorum: 3 }, rationale: 'another kind (B34 harness)' }), /^control rejected \(kind\)/, 422);
    const asOf = (await dc().controlsAsOf(h.req(w.executive, 'decision.read', 'DPK', null, 'decision'), T(), D(), { payload: {} })) as { controls: Row[] };
    expect(asOf.controls.find((x) => x['control_key'] === 'b34.quorum-policy')?.['version']).toBe(2);
    await expect(sql`update decision.control_decisions set body = '{}'::jsonb where control_id = ${String(v1['control_id'])}::uuid`.execute(su)).rejects.toThrow(/append-only|prohibited/i);
  });
});

describe('B34 G10 — a deferred version is superseded by the withdrawal and by a new proposal', () => {
  it('withdraw supersedes a deferred version and cancels its gate tasks; a new proposal supersedes a deferred one', async () => {
    const P = await c.proposed();
    await gate(w.owner, P.pkg, P.v, 'defer', { rationale: 'Deferred until the corridor settles (B34 harness)', nextReviewAt: inDays(10) });
    await c.withdraw(P.pkg, 'The corridor settled; the decision is moot (B34 harness)');
    expect(await versionState(P.pkg, P.v)).toBe('superseded');
    expect(await pkgState(P.pkg)).toBe('withdrawn');
    expect((await tasks(P.pkg, 'gate.review')).map((t) => t.state)).toEqual(['cancelled']);
    expect((await tasks(P.pkg, 'gate.approve')).map((t) => t.state)).toEqual(['cancelled']);
    const Q = await c.proposed();
    await gate(w.approver, Q.pkg, Q.v, 'request-information', { rationale: 'The quote is missing (B34 harness)', infoRequest: 'the reroute quote', nextReviewAt: inDays(4) });
    const v2 = (await c.open(Q.pkg, { carryFrom: Q.v })).version.version;
    await c.choice(Q.pkg, v2, c.validChoice());
    await c.propose(Q.pkg, v2);
    expect(await versionState(Q.pkg, Q.v)).toBe('superseded');
    expect((await tasks(Q.pkg, 'gate.review')).map((t) => t.state)).toEqual(['cancelled']);
    expect(await versionState(Q.pkg, v2)).toBe('proposed');
    sixEvidence('G10', { fault_trace: 'deferred / information_requested versions', watermark: [P.pkg, Q.pkg], consumer_behaviour: 'their gate tasks cancelled', operator_action: 'withdraw; re-propose', recovery: 'v2 proposed', reconciliation: { superseded: 2 } });
  });
});
