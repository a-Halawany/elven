/**
 * CP-6 B27 §S (0097) — SCENARIO SETS, THE COMPARATOR AND THE PORTFOLIO REVIEW (F-P4-08; ADR-012 "a missing stress branch is flagged
 * before the recommendation is allowed"; CAP-DS-01/-02; PR-33-001/-003/-006; V03-T-343), through the real database and controllers, on
 * the decision world (phase6-fixtures' bootDecisionWorld) with a draft package:
 *
 *   a THE SET: a set of scenarios and branches with a named owner, a purpose, a plurality policy (require baseline + stress, at least three
 *     live branches, one adverse), declared draft v1, members added and removed (the version moves; the scenario's ledger records it),
 *     activated, its own ledger; a bad policy, a non-owner, an unknown or duplicate member, a retired set refused.
 *   b THE PLURALITY CHECK AND THE GATE: the check names the missing STRESS kind; the owner is tasked (scenario.set_gap); the set is BOUND
 *     to the package by its owner; the package's proposal is REFUSED (`recommendation rejected (plurality)`, 409) and stays a draft; a
 *     scenario declared with a stress branch joins the set, the check passes, the gap item closes, the proposal proceeds; a set gating a
 *     package in flight is not retired.
 *   c THE COMPARATOR: the baseline, the disruption and the user-defined "regional blockade" side by side with their indicators' freshness;
 *     a SUSPENDED branch (a stated superuser move — Part A's port suspends at integration) is shown NOT COUNTED with its reason and the
 *     check fails on it; reinstated, it counts again.
 *   d THE PORTFOLIO REVIEW: a named human rates every member and weighs the bound package's options against every live branch;
 *     robustness (the worst payoff) and maximum regret computed by the port and checked here against the matrix; a retirement proposed;
 *     an unrated member, a missing payoff, an analyst refused.
 *   e LIVING SCENARIOS: the tick step `scenario-relevance` (67) scores the members of active sets only (the world's own scenario is not
 *     scored), a row only on change; the indicator's breach notifies the scenario owner ONCE per signpost (scenario.signpost).
 *   f CREATION TRIGGERS: a forecast shift beyond its band and an escalated weak signal (a stated superuser row: the signal's escalation
 *     route needs corroborating sources this file does not build) proposed and routed to the strategy owners; within the band, a
 *     non-escalated signal, a duplicate, an unknown exposure, a cadence never reset refused; the proposer cannot resolve; a strategy owner
 *     accepts (declaring nothing) and dismisses.
 *   g THE LEDGERS: append-only; the older decision paths unaffected by the gate (a package bound to no set proposes as before).
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout (NORDWERK's data is the demonstration's). Stated superuser
 * moves: a branch suspended and reinstated (Part A's ports at integration), one escalated weak signal row, the attention agent's timer
 * unscheduled (the ticks are the harness's own). No real external integration is exercised.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ScenarioSetsController } from '../../src/prediction/scenarios/sets/sets.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// C5 / Nit 8: this file's own vault roots (bootDecisionWorld uploads through h.uploadSource()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b27-sets-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let setsCtl: ScenarioSetsController; let scheduler: SchedulerService; let timer: AttentionTimerService;
/** The strategy owner (J. Weber's part: owns the scenarios and the set, resolves proposals), the forecast owner (N. Eriksen's: proposes),
 *  the decision owner (the world's owner — L. Brandt's part: binds and proposes the package), the executive (the world's: reviews),
 *  an analyst (reads), an outsider, the administrators. */
let strategist: AuthenticatedPrincipal; let forecaster: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal;
let agentId = '';
/** What the cases leave one another. */
let I_BLOCKADE = ''; let SCN_A = ''; let SCN_B = ''; let SCN_C = ''; let B_DOWN = ''; let C_STRESS = '';
let SET = ''; let PKG = ''; let PKG_V = 0; let MEMBER_B = ''; let FCT_OLD = ''; let FCT_NEW = ''; let SIG_ESC = ''; let SIG_TENTATIVE = ''; let PROP_F = ''; let PROP_W = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(su)).rows as Row[];

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20 idiom). */
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

/* ───────────── the routes (in process) ───────────── */
const P = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'prediction');
const declareSet = (as: AuthenticatedPrincipal, payload: Row) => setsCtl.declare(P(as, 'prediction.scenario.set.declare', 'SCS'), T(), D(), { payload }) as Promise<{ set: Row }>;
const addMember = (as: AuthenticatedPrincipal, id: string, scenarioId: string, branchId: string | null = null) =>
  setsCtl.addMember(P(as, 'prediction.scenario.set.member', 'SCS', id), T(), D(), id, { payload: { scenarioId, branchId } }) as Promise<{ membership: { set: Row; member: Row; check: Row | null } }>;
const removeMember = (as: AuthenticatedPrincipal, id: string, memberId: string, reason: string) =>
  setsCtl.removeMember(P(as, 'prediction.scenario.set.member', 'SCS', id), T(), D(), id, memberId, { payload: { reason } }) as Promise<{ membership: { set: Row; member: Row; check: Row | null } }>;
const activate = (as: AuthenticatedPrincipal, id: string) => setsCtl.activate(P(as, 'prediction.scenario.set.activate', 'SCS', id), T(), D(), id) as Promise<{ transition: { set: Row; check: Row | null } }>;
const retire = (as: AuthenticatedPrincipal, id: string, reason: string) => setsCtl.retire(P(as, 'prediction.scenario.set.retire', 'SCS', id), T(), D(), id, { payload: { reason } }) as Promise<{ transition: { set: Row } }>;
const check = (as: AuthenticatedPrincipal, id: string) => setsCtl.check(P(as, 'prediction.scenario.set.check', 'SCS', id), T(), D(), id) as Promise<{ check: Row }>;
const bind = (as: AuthenticatedPrincipal, id: string, packageId: string) => setsCtl.bind(P(as, 'prediction.scenario.set.bind', 'SCS', id), T(), D(), id, { payload: { packageId } }) as Promise<{ binding: Row }>;
const readSet = (as: AuthenticatedPrincipal, id: string) => setsCtl.read(P(as, 'prediction.scenario.set.read', 'SCS', id), T(), D(), id) as Promise<{ set: Row; relevance: Row[] }>;
const listSets = (as: AuthenticatedPrincipal) => setsCtl.list(P(as, 'prediction.scenario.set.read', 'SCS'), T(), D(), { payload: {} }) as Promise<{ sets: Row[] }>;
const compare = (as: AuthenticatedPrincipal, id: string) => setsCtl.compare(P(as, 'prediction.scenario.set.read', 'SCS', id), T(), D(), id) as Promise<{ comparison: Row }>;
const review = (as: AuthenticatedPrincipal, id: string, payload: Row) => setsCtl.review(P(as, 'prediction.scenario.set.review', 'SCS', id), T(), D(), id, { payload }) as Promise<{ review: Row }>;
const score = (as: AuthenticatedPrincipal) => setsCtl.score(P(as, 'prediction.scenario.relevance.score', 'SCN'), T(), D()) as Promise<{ relevance: Row }>;
const propose = (as: AuthenticatedPrincipal, payload: Row) => setsCtl.propose(P(as, 'prediction.scenario.proposal.propose', 'SCP'), T(), D(), { payload }) as Promise<{ proposal: Row }>;
const resolve = (as: AuthenticatedPrincipal, id: string, resolution: string, note: string) =>
  setsCtl.resolve(P(as, 'prediction.scenario.proposal.resolve', 'SCP', id), T(), D(), id, { payload: { resolution, note } }) as Promise<{ proposal: Row }>;
const proposals = (as: AuthenticatedPrincipal) => setsCtl.proposals(P(as, 'prediction.scenario.set.read', 'SCP'), T(), D(), { payload: {} }) as Promise<{ proposals: Row[] }>;

type Declared = { scenario: Row & { scenarioId: string; branches: Array<{ branchId: string; name: string; kind: string }> } };
const declareScenario = (payload: Row) => w.prediction.declareScenario(P(strategist, 'prediction.scenario.declare', 'SCN'), T(), D(), { payload }) as unknown as Promise<Declared>;
const defineIndicator = (payload: Row) => w.prediction.defineIndicator(P(w.twinOwner, 'prediction.indicator.define', 'IND'), T(), D(), { payload: { seriesKey: w.seriesKey, comparator: '<', consecutiveDays: 5, owner: w.twinOwner.principalId, ...payload } }) as unknown as Promise<{ indicator: { indicatorId: string } }>;
const evaluateIndicator = (indicatorId: string) => w.prediction.evaluateIndicator(P(w.twinOwner, 'prediction.indicator.evaluate', 'IND', indicatorId), T(), D(), indicatorId, { payload: { knownAt: new Date().toISOString() } }) as unknown as Promise<{ evaluation: Row }>;
const issueForecast = (observedThrough: string) => w.prediction.issueForecast(P(w.twinOwner, 'prediction.forecast.issue', 'FCT'), T(), D(),
  { payload: { seriesKey: w.seriesKey, horizon: '90d', knownAt: new Date().toISOString(), observedThrough, assumptions: [w.assumptionId], label: 'B27 sets harness (SYNTHETIC)' } }) as unknown as Promise<{ forecast: { forecastId: string } }>;

/* ───────────── the rows ───────────── */
const setRow = async (id: string) => (await rows(sql`select state, version, last_check_outcome, owner_principal_id::text as owner from prediction.scenario_sets where set_id = ${id}::uuid`))[0]!;
const setEvents = async (id: string) => (await rows(sql`select event, set_version from prediction.scenario_set_events where set_id = ${id}::uuid order by occurred_at, event_id`)).map((e) => `${String(e['event'])}@${String(e['set_version'])}`);
const checksOf = async (id: string) => rows(sql`select check_id::text, trigger, outcome, missing_kinds, live_branches, adverse_branches, findings, item_id::text from prediction.scenario_set_checks where set_id = ${id}::uuid order by as_of`);
const items = async (cls: string, subject?: string) => rows(sql`select item_id::text, subject_kind, subject_id::text, owner_principal_id::text as owner, route_roles, state, title, details from executive.attention_items
  where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${cls} and (${subject ?? null}::uuid is null or subject_id = ${subject ?? null}::uuid) order by created_at`);
const scenarioEvents = async (id: string, event: string) => rows(sql`select branch_id::text, details from prediction.scenario_events where scenario_id = ${id}::uuid and event = ${event} order by occurred_at`);
const versionState = async (pkg: string, v: number) => (await rows(sql`select state from decision.package_versions where package_id = ${pkg}::uuid and version = ${v}`))[0]?.['state'];
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2036, 2, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  const outputs = obj(t.run?.outputs);
  const steps = obj(outputs['steps'] ?? outputs);
  return obj(steps['scenario-relevance']);
};

/** The branches (SYNTHETIC; the corridor's demonstration shape). */
const baseline = (): Row => ({ name: 'Baseline', kind: 'baseline', statement: 'transits stay at their seasonal level (B27 sets harness)', owner: strategist.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 });
const disruption = (): Row => ({ name: 'Disruption', kind: 'disruption', statement: 'transits fall below 40 for five days', divergence: 'a security incident closes the strait for a week', indicatorId: w.indicatorId,
  owner: strategist.principalId, consequence: 'rebook the open consignments via the Cape', consequenceClass: 'C3', responseWindowHours: 48 });
const blockade = (): Row => ({ name: 'Regional blockade', kind: 'user-defined', kindLabel: 'regional blockade', statement: 'naval activity halts transits for a quarter',
  divergence: 'a regional blockade halts every transit whatever the season', indicatorId: I_BLOCKADE, owner: strategist.principalId, consequence: 'dual-source the bearings now', consequenceClass: 'C4', responseWindowHours: 24,
  assumptions: [{ statement: 'naval activity halts transits' }, { statement: 'insurers withdraw cover' }] });
const stress = (): Row => ({ name: 'Corridor stress', kind: 'stress', statement: 'transits at half their level for ninety days', divergence: 'a sustained stress: half the transits for a full quarter',
  indicatorId: w.indicatorId, owner: strategist.principalId, consequence: 'draw the safety stock down to its floor', consequenceClass: 'C3', responseWindowHours: 48 });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { ScenarioSetsController: SC } = await import('../../src/prediction/scenarios/sets/sets.controller.js');
  setsCtl = h.app.get(SC);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  strategist = await h.humanWithSession(['strategy_owner'], 'b27s-strategist');
  forecaster = await h.humanWithSession(['forecast_owner'], 'b27s-forecaster');
  analyst = await h.humanWithSession(['domain_analyst'], 'b27s-analyst');
  outsider = await h.humanWithSession(['collection_manager'], 'b27s-outsider');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b27s-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b27s-dadmin');
  w = await bootDecisionWorld(h); c = decisionCalls(h, w);
  I_BLOCKADE = (await defineIndicator({ description: 'B27: transits below 20 for five days (the blockade signpost)', threshold: 20 })).indicator.indicatorId;
  // THE SCENARIOS (SYNTHETIC): A — baseline, disruption, the user-defined "regional blockade"; B — baseline and a downside
  const a = await declareScenario({ title: 'Bab el-Mandeb corridor — B27 sets harness', statement: 'the corridor stays open, is disrupted, or is blockaded', forecastId: w.forecastId,
    owner: strategist.principalId, reviewCadence: 'weekly', branches: [baseline(), disruption(), blockade()] });
  SCN_A = a.scenario.scenarioId;
  const b = await declareScenario({ title: 'Suez approaches — B27 sets harness', statement: 'the approaches stay open, or transits fall', forecastId: w.forecastId,
    owner: strategist.principalId, reviewCadence: 'weekly', branches: [baseline(), { name: 'Approaches downside', kind: 'downside', statement: 'transits below 40 for five days', indicatorId: w.indicatorId,
      owner: strategist.principalId, consequence: 'rebook the next sailing', responseWindowHours: 48 }] });
  SCN_B = b.scenario.scenarioId; B_DOWN = b.scenario.branches.find((x) => x.kind === 'downside')!.branchId;
  // THE PACKAGE (the decision owner's draft on the world's DEC: status quo vs reroute)
  const d = await c.fullDraft({ as: w.owner });
  PKG = d.pkg; PKG_V = d.v;
  // THE ATTENTION AGENT: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await w.exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: w.executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } } as never) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
}, 600_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B27 §S · a THE SET', () => {
  it('a · REFUSAL: a policy naming a kind outside vocabulary v1, a single-branch policy, an owner who holds no scenario role, an unknown package — refused before anything is written', async () => {
    const base = { title: 'Regensburg supply — corridor set (B27 harness)', purpose: 'the scenarios the Regensburg supply decision is weighed against (SYNTHETIC)' };
    await refused(declareSet(strategist, { ...base, policy: { require: ['baseline', 'meltdown'] } }), /^scenario set rejected \(policy\): require lists kinds of scenario kind vocabulary v1/, 422);
    await refused(declareSet(strategist, { ...base, policy: { require: ['baseline'], min_branches: 1 } }), /^scenario set rejected \(policy\): min_branches is a whole number in 2\.\.64/, 422);
    await refused(declareSet(strategist, { ...base, ownerPrincipalId: analyst.principalId, policy: { require: ['baseline'] } }), /^scenario set rejected \(owner\):/, 422);
    await refused(declareSet(strategist, { ...base, packageId: uuidv7(), policy: { require: ['baseline'] } }), /^scenario set rejected \(unknown_package\):/, 404);
    await refused(declareSet(analyst, { ...base, policy: { require: ['baseline'] } }), /./, 403); // the PDP: an analyst declares no set
    expect((await listSets(strategist)).sets).toHaveLength(0);
  });

  it('a · POSITIVE: the strategy owner declares the set (draft v1, the package it serves, the policy baseline + stress), adds scenario A whole and B\'s downside alone — the version moves, each scenario\'s ledger records it', async () => {
    const s = (await declareSet(strategist, { title: 'Regensburg supply — corridor set (B27 harness)', purpose: 'the scenarios the Regensburg supply decision is weighed against (SYNTHETIC)',
      packageId: PKG, policy: { require: ['baseline', 'stress'], min_branches: 3, min_adverse: 1 } })).set;
    SET = String(s['set_id']);
    expect(s).toMatchObject({ state: 'draft', version: 1, owner_principal_id: strategist.principalId, package_id: PKG, plurality_policy: { require: ['baseline', 'stress'], min_branches: 3, min_adverse: 1 } });
    const m1 = (await addMember(strategist, SET, SCN_A)).membership;
    expect(m1.set).toMatchObject({ version: 2, state: 'draft' });
    expect(m1.member).toMatchObject({ scenario_id: SCN_A, branch_id: null, added_in_version: 2, added_by: strategist.principalId });
    expect(m1.check).toBeNull(); // a draft set is not checked on a member change
    const m2 = (await addMember(strategist, SET, SCN_B, B_DOWN)).membership;
    MEMBER_B = String(m2.member['member_id']);
    expect(m2.set['version']).toBe(3);
    expect((await scenarioEvents(SCN_A, 'scenario.set_member_added')).map((e) => obj(e['details'])['set_id'])).toEqual([SET]);
    expect((await scenarioEvents(SCN_B, 'scenario.set_member_added'))[0]).toMatchObject({ branch_id: B_DOWN });
    expect(await setEvents(SET)).toEqual(['set.declared@1', 'set.member_added@2', 'set.member_added@3']);
  });

  it('a · REFUSAL: a member changed by someone other than the owner (403), an unknown scenario (404), a branch of another scenario (404), a duplicate member (409)', async () => {
    await refused(addMember(forecaster, SET, SCN_A), /^scenario set rejected \(authority\): the members of a set are changed by its owner/, 403);
    await refused(addMember(strategist, SET, uuidv7()), /^scenario set rejected \(unknown_scenario\):/, 404);
    await refused(addMember(strategist, SET, SCN_A, B_DOWN), /^scenario set rejected \(unknown_branch\):/, 404);
    await refused(addMember(strategist, SET, SCN_B, B_DOWN), /^scenario set rejected \(duplicate\):/, 409);
    expect((await setRow(SET))['version']).toBe(3);
  });

  it('a · RECOVERY: B\'s downside is removed with a reason and B joins whole (v4, v5); the owner ACTIVATES — the check runs, fails on the missing stress kind and tasks the owner', async () => {
    await refused(removeMember(strategist, SET, MEMBER_B, 'short'), /^scenario set rejected \(reason\):/, 422);
    const rm = (await removeMember(strategist, SET, MEMBER_B, 'the whole of B is weighed, not its downside alone (B27 harness)')).membership;
    expect(rm.member).toMatchObject({ removed_in_version: 4, removal_reason: 'the whole of B is weighed, not its downside alone (B27 harness)' });
    await refused(removeMember(strategist, SET, MEMBER_B, 'removed twice (B27 harness)'), /^scenario set rejected \(state\): member .* was removed at/, 409);
    expect((await addMember(strategist, SET, SCN_B)).membership.set['version']).toBe(5);
    await refused(activate(forecaster, SET), /^scenario set rejected \(authority\):/, 403);
    const act = (await activate(strategist, SET)).transition;
    expect(act.set).toMatchObject({ state: 'active', version: 5, last_check_outcome: 'failed' });
    expect(act.check).toMatchObject({ trigger: 'activate', outcome: 'failed', missing_kinds: ['stress'], new_gap: true, live_branches: 5 });
    const gap = await items('scenario.set_gap', SET);
    expect(gap).toHaveLength(1);
    expect(gap[0]).toMatchObject({ subject_kind: 'scenario_set', owner: strategist.principalId, state: 'open' });
    expect(String(gap[0]!['title'])).toMatch(/missing stress/);
    await refused(activate(strategist, SET), /^scenario set rejected \(state\): set .* is active; only a draft set is activated/, 409);
    expect((await setEvents(SET)).slice(-3)).toEqual(['set.member_added@5', 'set.activated@5', 'set.checked@5']);
  });
});

describe('B27 §S · b THE PLURALITY CHECK AND THE GATE (ADR-012)', () => {
  it('b · POSITIVE: the owner\'s check names the missing STRESS kind (the same gap: no second item); the package\'s owner BINDS the set — the binding\'s check recorded', async () => {
    const k = (await check(strategist, SET)).check;
    expect(k).toMatchObject({ trigger: 'operator', outcome: 'failed', missing_kinds: ['stress'], new_gap: false, item_id: null, live_branches: 5, adverse_branches: 2, policy: { require: ['baseline', 'stress'], min_branches: 3, min_adverse: 1 } });
    expect((k['findings'] as Row[]).filter((f) => f['outcome'] === 'fail')).toEqual([expect.objectContaining({ rule: 'required_kind', kind: 'stress' })]);
    expect(await items('scenario.set_gap', SET)).toHaveLength(1);
    await refused(bind(strategist, SET, PKG), /^scenario set rejected \(authority\): a set is bound to a package by the package's owner/, 403);
    const bd = (await bind(w.owner, SET, PKG)).binding;
    expect(bd).toMatchObject({ set_id: SET, package_id: PKG, bound_by: w.owner.principalId, check: expect.objectContaining({ trigger: 'bind', outcome: 'failed', missing_kinds: ['stress'] }) });
    await refused(bind(w.owner, SET, PKG), /^scenario set rejected \(duplicate\):/, 409);
    expect((await checksOf(SET)).map((x) => `${String(x['trigger'])}:${String(x['outcome'])}`)).toEqual(['activate:failed', 'operator:failed', 'bind:failed']);
  });

  it('b · REFUSAL: the package\'s proposal is REFUSED while the bound set is not plural — 409 `recommendation rejected (plurality)` naming the missing stress branch; the version stays a draft, no proposal recorded', async () => {
    const r = await refused(c.propose(PKG, PKG_V, w.owner), /^recommendation rejected \(plurality\): package .* is bound to the scenario set "Regensburg supply — corridor set \(B27 harness\)".*no live stress branch/, 409);
    expect(r.code).toBe('EYE-STA-002');
    expect(await versionState(PKG, PKG_V)).toBe('draft');
    expect(await rows(sql`select 1 from decision.package_events where package_id = ${PKG}::uuid and event = 'version.proposed'`)).toHaveLength(0);
    // a set gating a package in flight is not retired
    await refused(retire(strategist, SET, 'the set is no longer needed (B27 harness)'), /^scenario set rejected \(bound\): set .* is bound to package\(s\) still in flight/, 409);
  });

  it('b · RECOVERY: a scenario DECLARED with a stress branch joins the set — the member check passes, the gap item closes; the proposal proceeds', async () => {
    const cc = await declareScenario({ title: 'Corridor stress test — B27 sets harness', statement: 'transits hold, or halve for a quarter', forecastId: w.forecastId,
      owner: strategist.principalId, reviewCadence: 'weekly', branches: [baseline(), stress()] });
    SCN_C = cc.scenario.scenarioId; C_STRESS = cc.scenario.branches.find((x) => x.kind === 'stress')!.branchId;
    const m = (await addMember(strategist, SET, SCN_C)).membership;
    expect(m.check).toMatchObject({ trigger: 'member', outcome: 'passed', missing_kinds: [], gap_items_closed: 1, live_branches: 7 });
    expect((await items('scenario.set_gap', SET))[0]).toMatchObject({ state: 'closed' });
    const pr = await c.propose(PKG, PKG_V, w.owner);
    expect(pr.proposal.versionDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(await versionState(PKG, PKG_V)).toBe('proposed');
    // a package bound to NO set proposes exactly as before (the gate reads only bindings)
    const other = await c.proposed({ as: w.owner });
    expect(await versionState(other.pkg, other.v)).toBe('proposed');
  });
});

describe('B27 §S · c THE COMPARATOR (CAP-DS-02)', () => {
  it('c · POSITIVE: the baseline, the disruption and the user-defined "regional blockade" side by side — kind, label, state, divergence, assumptions, the indicator with its freshness, the consequence class; live first', async () => {
    const cmp = (await compare(analyst, SET)).comparison;
    expect(cmp).toMatchObject({ plurality: expect.objectContaining({ passed: true, missing_kinds: [] }), stale_after_days: 14 });
    const br = cmp['branches'] as Row[];
    expect(br).toHaveLength(7);
    expect(br.every((b) => b['live'] === true)).toBe(true);
    const a = br.filter((b) => b['scenario_id'] === SCN_A);
    expect(a.map((b) => [b['kind'], b['kind_label']])).toEqual([['baseline', null], ['disruption', null], ['user-defined', 'regional blockade']]);
    const blk = a.find((b) => b['kind'] === 'user-defined')!;
    expect(blk).toMatchObject({ name: 'Regional blockade', divergence: 'a regional blockade halts every transit whatever the season', consequence_class: 'C4', assumptions: [{ statement: 'naval activity halts transits' }, { statement: 'insurers withdraw cover' }] });
    expect(obj(blk['indicator'])).toMatchObject({ indicator_id: I_BLOCKADE, comparator: '<', threshold: 20, freshness: expect.stringMatching(/^(stale|missing)$/) });
    expect(a.find((b) => b['kind'] === 'baseline')!['indicator']).toBeNull();
    // §A and §Q are read by to_regclass: absent in this part's worktree, present after integration — never assumed here
    expect(br.every((b) => b['elements'] === null || Array.isArray(b['elements']))).toBe(true);
    expect(['boolean']).toContain(typeof cmp['anatomy_available']);
  });

  it('c · §I (the integrator): a probability set through §Q\'s route shows on the comparison with its method; withdrawn, it is no longer shown', async () => {
    const { ScenarioQualityController: Qc } = await import('../../src/prediction/scenarios/quality/quality.controller.js');
    const q = h.app.get(Qc);
    const blk = ((await compare(analyst, SET)).comparison['branches'] as Row[]).find((b) => b['scenario_id'] === SCN_A && b['kind'] === 'user-defined')!;
    const branchId = String(blk['branch_id']);
    const basis = { elicitation: { experts: ['N. Eriksen (SYNTHETIC)', 'J. Weber (SYNTHETIC)'], question: 'will a regional blockade halt transits within the quarter?', elicited_at: '2026-09-29T10:00:00Z',
      record: 'two experts, independent estimates, reconciled in a recorded session (SYNTHETIC)' } };
    await q.setProbability(P(strategist, 'prediction.scenario.probability.set', 'BRN', branchId), T(), D(), branchId, { payload: { method: 'expert_elicitation', low: 0.05, high: 0.15, basis } } as never);
    const shown = ((await compare(analyst, SET)).comparison['branches'] as Row[]).find((b) => b['branch_id'] === branchId)!;
    expect(obj(shown['probability'])).toMatchObject({ method: 'expert_elicitation', probability_low: 0.05, probability_high: 0.15 });
    await q.withdrawProbability(P(strategist, 'prediction.scenario.probability.withdraw', 'BRN', branchId), T(), D(), branchId, { payload: { reason: 'the elicitation is re-run next week (B27 sets harness)' } } as never);
    const gone = ((await compare(analyst, SET)).comparison['branches'] as Row[]).find((b) => b['branch_id'] === branchId)!;
    expect(gone['probability'] ?? null).toBeNull();
  });
  it('c · REFUSAL: an outsider is refused by the policy; an unknown set is 404', async () => {
    await refused(compare(outsider, SET), /./, 403);
    await refused(compare(analyst, uuidv7()), /^scenario set rejected \(unknown_set\):/, 404);
  });

  it('c · RECOVERY: a SUSPENDED stress branch (stated superuser move) is shown NOT COUNTED with its reason and the check fails on it; reinstated, it counts again and the check passes', async () => {
    await sql`update prediction.branches_current set state = 'suspended', suspended_at = clock_timestamp(), suspended_by = ${strategist.principalId}::uuid,
              suspension_reason = 'the critical corridor assumption was invalidated (B27 harness)', suspension_cause = ${JSON.stringify({ kind: 'operator', id: null })}::jsonb, suspended_from = 'open'
              where branch_id = ${C_STRESS}::uuid`.execute(su);
    const cmp = (await compare(analyst, SET)).comparison;
    const st = (cmp['branches'] as Row[]).find((b) => b['branch_id'] === C_STRESS)!;
    expect(st).toMatchObject({ state: 'suspended', live: false, not_counted_reason: 'suspended — the critical corridor assumption was invalidated (B27 harness)', suspension_reason: 'the critical corridor assumption was invalidated (B27 harness)' });
    expect((cmp['branches'] as Row[]).at(-1)!['branch_id']).toBe(C_STRESS); // the not-live last
    const k = (await check(strategist, SET)).check;
    expect(k).toMatchObject({ outcome: 'failed', missing_kinds: ['stress'], new_gap: true, live_branches: 6 });
    expect((k['findings'] as Row[]).find((f) => f['rule'] === 'not_counted')).toMatchObject({ outcome: 'note', branches: [expect.objectContaining({ branch_id: C_STRESS, state: 'suspended' })] });
    expect((await items('scenario.set_gap', SET)).map((x) => x['state'])).toEqual(['closed', 'open']);
    await sql`update prediction.branches_current set state = 'open', reinstated_at = clock_timestamp(), reinstated_by = ${strategist.principalId}::uuid, reinstatement_note = 'the assumption was re-verified (B27 harness)'
              where branch_id = ${C_STRESS}::uuid`.execute(su);
    const k2 = (await check(strategist, SET)).check;
    expect(k2).toMatchObject({ outcome: 'passed', missing_kinds: [], gap_items_closed: 1, live_branches: 7 });
    expect(((await compare(analyst, SET)).comparison['branches'] as Row[]).find((b) => b['branch_id'] === C_STRESS)).toMatchObject({ live: true, state: 'open' });
  });
});

/** The matrix the reviewer weighs (SYNTHETIC EUR k): reroute pays better in the adverse branches, status quo in the benign. */
const payoffFor = (key: string, kind: string): number => {
  const adverse = ['disruption', 'downside', 'stress', 'user-defined'].includes(kind);
  if (key === 'reroute') return adverse ? -40 : -48;
  return adverse ? (kind === 'user-defined' ? -310 : -120) : 0;
};

describe('B27 §S · d THE PORTFOLIO REVIEW', () => {
  it('d · REFUSAL: an analyst (the policy), an unrated member, a missing payoff for a live branch, an option outside the review — refused', async () => {
    const members = (await readSet(strategist, SET)).set['members'] as Row[];
    const current = members.filter((m) => m['removed_at'] === null);
    const live = ((await compare(analyst, SET)).comparison['branches'] as Row[]).filter((b) => b['live']);
    const ratings = current.map((m) => ({ member_id: m['member_id'], relevance: 'high', consequence: 'C3' }));
    const full = Object.fromEntries(['reroute', 'status-quo'].map((k) => [k, Object.fromEntries(live.map((b) => [String(b['branch_id']), payoffFor(k, String(b['kind']))]))]));
    await refused(review(analyst, SET, { members: ratings, payoffs: full, unit: 'EUR k', note: 'the analyst would review (B27 harness)' }), /./, 403);
    await refused(review(w.executive, SET, { members: ratings.slice(1), payoffs: full, unit: 'EUR k', note: 'one member unrated (B27 harness)' }), /^portfolio review rejected \(members\): every current member of the set is rated exactly once/, 422);
    const short = { ...full, reroute: Object.fromEntries(Object.entries(full['reroute'] as Row).slice(1)) };
    await refused(review(w.executive, SET, { members: ratings, payoffs: short, unit: 'EUR k', note: 'a live branch without a payoff (B27 harness)' }), /^portfolio review rejected \(payoffs\): option reroute has no payoff for the live branch/, 422);
    await refused(review(w.executive, SET, { members: ratings, payoffs: { ...full, 'air-bridge': full['reroute'] }, unit: 'EUR k', note: 'an option outside (B27 harness)' }), /^portfolio review rejected \(payoffs\): air-bridge is not an option of this review/, 422);
    expect(await rows(sql`select 1 from prediction.portfolio_reviews where set_id = ${SET}::uuid`)).toHaveLength(0);
  });

  it('d · POSITIVE: the executive weighs the BOUND package\'s options against every live branch — robustness (worst payoff) and maximum regret computed by the port equal the matrix\'s; a retirement proposed stays the scenario owner\'s', async () => {
    const members = ((await readSet(strategist, SET)).set['members'] as Row[]).filter((m) => m['removed_at'] === null);
    const live = ((await compare(analyst, SET)).comparison['branches'] as Row[]).filter((b) => b['live']);
    const keys = ['reroute', 'status-quo'];
    const matrix = Object.fromEntries(keys.map((k) => [k, Object.fromEntries(live.map((b) => [String(b['branch_id']), payoffFor(k, String(b['kind']))]))])) as Record<string, Record<string, number>>;
    const rv = (await review(w.executive, SET, { members: members.map((m) => ({ member_id: m['member_id'], relevance: m['scenario_id'] === SCN_B ? 'low' : 'high', consequence: 'C3' })),
      payoffs: matrix, unit: 'EUR k', retirements: [{ scenario_id: SCN_B, note: 'the approaches scenario duplicates the corridor downside (B27 harness)' }],
      note: 'reroute is the robust choice across the corridor branches (SYNTHETIC)' })).review;
    // the expectation, computed here from the same matrix
    const worst = (k: string) => Math.min(...live.map((b) => matrix[k]![String(b['branch_id'])]!));
    const regret = (k: string) => Math.max(...live.map((b) => Math.max(...keys.map((x) => matrix[x]![String(b['branch_id'])]!)) - matrix[k]![String(b['branch_id'])]!));
    expect(rv).toMatchObject({ package_id: PKG, package_version: PKG_V, reviewer: w.executive.principalId, payoff_unit: 'EUR k', missing_kinds: [], most_robust: ['reroute'], least_regret: ['reroute'] });
    expect((rv['options'] as Row[]).map((o) => [o['key'], o['source']])).toEqual([['reroute', 'package'], ['status-quo', 'package']]);
    for (const k of keys) {
      expect(Number(obj(rv['robustness'])[k])).toBe(worst(k));
      expect(Number(obj(rv['regret'])[k])).toBe(regret(k));
    }
    expect(Number(obj(rv['regret'])['status-quo'])).toBe(270); // −40 − (−310) under the blockade
    expect((rv['retirements_proposed'] as Row[])[0]).toMatchObject({ scenario_id: SCN_B, owner: strategist.principalId, act: expect.stringMatching(/scenario owner retires it through the review/) });
    // a proposed retirement retires nothing
    expect((await rows(sql`select state from prediction.scenarios_current where scenario_id = ${SCN_B}::uuid`))[0]!['state']).toBe('active');
    expect((await setEvents(SET)).at(-1)).toMatch(/^set\.reviewed@/);
  });

  it('d · RECOVERY: a second review with NAMED options (a third, the air bridge) is recorded beside the first; the latest first on the read', async () => {
    const members = ((await readSet(strategist, SET)).set['members'] as Row[]).filter((m) => m['removed_at'] === null);
    const live = ((await compare(analyst, SET)).comparison['branches'] as Row[]).filter((b) => b['live']);
    const opts = [{ key: 'reroute', title: 'Reroute via the Cape' }, { key: 'air-bridge', title: 'Air bridge for four weeks' }, { key: 'status-quo', title: 'Do nothing' }];
    const matrix = Object.fromEntries(opts.map((o) => [o.key, Object.fromEntries(live.map((b) => [String(b['branch_id']), o.key === 'air-bridge' ? -90 : payoffFor(o.key, String(b['kind']))]))]));
    const rv = (await review(strategist, SET, { members: members.map((m) => ({ member_id: m['member_id'], relevance: 'medium', consequence: 'C2' })), options: opts, payoffs: matrix, unit: 'EUR k',
      note: 'the air bridge weighed beside the package options (SYNTHETIC)' })).review;
    expect(rv).toMatchObject({ most_robust: ['reroute'], least_regret: ['reroute'] });
    expect(Number(obj(rv['robustness'])['air-bridge'])).toBe(-90);
    const reviews = (await readSet(analyst, SET)).set['reviews'] as Row[];
    expect(reviews).toHaveLength(2);
    expect(reviews[0]!['review_id']).toBe(rv['review_id']);
  });
});

describe('B27 §S · e LIVING SCENARIOS', () => {
  it('e · POSITIVE: the tick step scenario-relevance (67) scores the members of the active set only — A, B and C, not the world\'s own scenario — and writes again only on change', async () => {
    const reg = h.app.get(AttentionTickRegistry);
    expect(reg.steps().map((s) => [s.name, s.order])).toContainEqual(['scenario-relevance', 67]);
    const r1 = await tick(1);
    expect(r1).toMatchObject({ scored: 3, changed: 3, signposts_notified: 0 });
    expect((r1['scenarios'] as Row[]).map((x) => x['scenario_id']).sort()).toEqual([SCN_A, SCN_B, SCN_C].sort());
    expect(await rows(sql`select 1 from prediction.scenario_relevance where scenario_id = ${w.scenarioId}::uuid`)).toHaveLength(0);
    const rel = (await readSet(analyst, SET)).relevance;
    expect(rel).toHaveLength(3);
    expect(obj(rel.find((x) => x['scenario_id'] === SCN_A)!['latest'])).toMatchObject({ trigger: 'tick', basis: expect.objectContaining({ rule: expect.stringMatching(/^relevance v1/), signposts_breached: 0 }) });
    const r2 = await tick(2);
    expect(r2).toMatchObject({ scored: 3, changed: 0, signposts_notified: 0 });
    expect(await scenarioEvents(SCN_A, 'scenario.relevance_scored')).toHaveLength(1);
  });

  it('e · POSITIVE: the corridor indicator\'s breach — the next tick raises the score and notifies the scenario owner ONCE per breached signpost (scenario.signpost on the branch); the tick after notifies nothing', async () => {
    await evaluateIndicator(w.indicatorId);
    // the run below 40 for five days is on record (breached_at stays when the run ends and `breached` resets)
    expect((await rows(sql`select breached_at from prediction.indicators_current where indicator_id = ${w.indicatorId}::uuid`))[0]!['breached_at']).not.toBeNull();
    const r3 = await tick(3);
    expect(r3).toMatchObject({ scored: 3, changed: 3 });
    // the live branches on the breached indicator: A's disruption, B's downside, C's stress
    expect(r3['signposts_notified']).toBe(3);
    const sp = await items('scenario.signpost');
    expect(sp).toHaveLength(3);
    expect(sp.every((x) => x['subject_kind'] === 'branch' && x['owner'] === strategist.principalId && x['state'] === 'open')).toBe(true);
    expect(sp.map((x) => x['subject_id']).sort()).toEqual([C_STRESS, B_DOWN, ...(await rows(sql`select branch_id::text from prediction.branches_current where scenario_id = ${SCN_A}::uuid and kind = 'disruption'`)).map((x) => x['branch_id'])].sort());
    const latestA = obj((await readSet(analyst, SET)).relevance.find((x) => x['scenario_id'] === SCN_A)!['latest']);
    expect(Number(latestA['score'])).toBeGreaterThanOrEqual(0.8);
    const r4 = await tick(4);
    expect(r4).toMatchObject({ changed: 0, signposts_notified: 0 });
    expect(await items('scenario.signpost')).toHaveLength(3);
  });

  it('e · REFUSAL + RECOVERY: an analyst does not score (the policy); the strategy owner scores on request (trigger operator), nothing changed; a scenario that leaves the set is no longer scored', async () => {
    await refused(score(analyst), /./, 403);
    const s = (await score(strategist)).relevance;
    expect(s).toMatchObject({ scored: 3, changed: 0, signposts_notified: 0 });
    const members = (await readSet(strategist, SET)).set['members'] as Row[];
    const bMember = members.find((m) => m['scenario_id'] === SCN_B && m['removed_at'] === null)!;
    await removeMember(strategist, SET, String(bMember['member_id']), 'the approaches scenario leaves the portfolio (B27 harness)');
    expect((await score(strategist)).relevance).toMatchObject({ scored: 2 });
  });
});

describe('B27 §S · f CREATION TRIGGERS (V03-T-343)', () => {
  it('f · POSITIVE: a forecast SHIFT beyond its band (the 90-day forecast re-issued across the disruption) is proposed by the forecast owner, the source validated and routed to the strategy owners; an ESCALATED weak signal too', async () => {
    FCT_OLD = (await issueForecast('2021-02-15')).forecast.forecastId;
    FCT_NEW = (await issueForecast('2023-11-26')).forecast.forecastId;
    const p = (await propose(forecaster, { kind: 'forecast_shift', source: { forecast_id: FCT_NEW, band_pct: 0.01 }, title: 'A lower-transit corridor regime', rationale: 'the 90-day median moved beyond its band (SYNTHETIC)' })).proposal;
    PROP_F = String(p['proposal_id']);
    expect(p).toMatchObject({ kind: 'forecast_shift', state: 'open', proposed_by: forecaster.principalId, proposed_kind: 'human', source_key: FCT_NEW,
      source_facts: expect.objectContaining({ forecast_id: FCT_NEW, superseded_forecast_id: FCT_OLD, band_pct: 0.01 }) });
    expect(Number(obj(p['source_facts'])['shift'])).toBeGreaterThan(0.01);
    const it0 = await items('scenario.proposal', PROP_F);
    expect(it0).toHaveLength(1);
    expect(it0[0]).toMatchObject({ subject_kind: 'scenario', owner: null, route_roles: ['strategy_owner'], state: 'open' });
    // the escalated weak signal (a stated superuser row) and a tentative one
    SIG_ESC = uuidv7(); SIG_TENTATIVE = uuidv7();
    for (const [id, esc] of [[SIG_ESC, true], [SIG_TENTATIVE, false]] as const) {
      await sql`insert into prediction.signals_current (signal_id, scope, tenant_id, domain_id, title, statement, subject_kind, nominator_kind, nominated_by, observation, baseline, novelty_basis, maturity,
                  disposition, disposition_by, disposition_at, disposition_note, candidate_id, synthetic_state, correlation_id)
                values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${esc ? 'Insurers quote war-risk cover by the day (SYNTHETIC)' : 'A tentative murmur (SYNTHETIC)'}, 'a weak signal for the B27 sets harness (SYNTHETIC)', 'none', 'analyst',
                  ${forecaster.principalId}::uuid, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'tentative',
                  ${esc ? 'escalate' : null}, ${esc ? forecaster.principalId : null}::uuid, ${esc ? new Date() : null}, ${esc ? 'escalated (B27 harness)' : null}, ${esc ? uuidv7() : null}::uuid, true, ${uuidv7()}::uuid)`.execute(su);
    }
    const q = (await propose(forecaster, { kind: 'weak_signal', source: { signal_id: SIG_ESC }, title: 'War-risk cover withdrawn', rationale: 'the escalated insurer signal (SYNTHETIC)' })).proposal;
    PROP_W = String(q['proposal_id']);
    expect(q).toMatchObject({ kind: 'weak_signal', source_facts: expect.objectContaining({ disposition: 'escalate', maturity: 'tentative' }) });
    expect((await proposals(analyst)).proposals.map((x) => x['proposal_id'])).toEqual(expect.arrayContaining([PROP_F, PROP_W]));
  });

  it('f · REFUSAL: within the band, a signal not escalated, a duplicate open proposal, an unknown exposure, a cadence never reset; the proposer resolving its own proposal', async () => {
    await refused(propose(forecaster, { kind: 'forecast_shift', source: { forecast_id: FCT_NEW, band_pct: 9 }, title: 'Within the band', rationale: 'a band wider than the move (B27 harness)' }), /^scenario proposal rejected \(within_band\): the median moved/, 422);
    await refused(propose(forecaster, { kind: 'forecast_shift', source: { forecast_id: FCT_OLD, band_pct: 0.01 }, title: 'The first forecast', rationale: 'it replaced nothing (B27 harness)' }), /^scenario proposal rejected \(source\): forecast .* superseded no earlier forecast/, 422);
    await refused(propose(forecaster, { kind: 'weak_signal', source: { signal_id: SIG_TENTATIVE }, title: 'A tentative murmur', rationale: 'not escalated (B27 harness)' }), /^scenario proposal rejected \(source\): signal .* is tentative \(disposition none\)/, 422);
    await refused(propose(forecaster, { kind: 'forecast_shift', source: { forecast_id: FCT_NEW, band_pct: 0.01 }, title: 'Again', rationale: 'the same shift again (B27 harness)' }), /^scenario proposal rejected \(duplicate\):/, 409);
    await refused(propose(forecaster, { kind: 'risk', source: { exposure_id: uuidv7() }, title: 'An unknown risk', rationale: 'no such exposure (B27 harness)' }), /^scenario proposal rejected \(unknown_exposure\):/, 404);
    await refused(propose(forecaster, { kind: 'planning_cycle', source: { cadence_id: uuidv7() }, title: 'A cycle never reset', rationale: 'no reset recorded (B27 harness)' }), /^scenario proposal rejected \(source\): cadence .* has not been reset/, 422);
    await refused(propose(analyst, { kind: 'weak_signal', source: { signal_id: 'x' }, title: 'Bad source', rationale: 'a malformed source id (B27 harness)' }), /^scenario proposal rejected \(source\): a uuid is required/, 422);
    await refused(resolve(forecaster, PROP_F, 'accepted', 'the forecast owner would accept its own (B27 harness)'), /./, 403); // the PDP: resolving is a strategy owner's
  });

  it('f · RECOVERY: a strategy owner ACCEPTS the forecast-shift proposal (the item closes; no scenario is declared) and DISMISSES the signal\'s; resolving again is 409; a new shift proposal is admitted once the first is resolved', async () => {
    const before = Number((await rows(sql`select count(*)::int n from prediction.scenarios_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`))[0]!['n']);
    const acc = (await resolve(strategist, PROP_F, 'accepted', 'declare a lower-transit regime scenario next review (B27 harness)')).proposal;
    expect(acc).toMatchObject({ state: 'accepted', resolved_by: strategist.principalId, declares: expect.stringMatching(/^nothing/) });
    expect((await items('scenario.proposal', PROP_F))[0]).toMatchObject({ state: 'closed' });
    expect(Number((await rows(sql`select count(*)::int n from prediction.scenarios_current where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`))[0]!['n'])).toBe(before);
    await refused(resolve(strategist, PROP_F, 'dismissed', 'changing the answer (B27 harness)'), /^scenario proposal rejected \(state\): proposal .* was accepted at/, 409);
    const dis = (await resolve(strategist, PROP_W, 'dismissed', 'covered by the corridor set already (B27 harness)')).proposal;
    expect(dis).toMatchObject({ state: 'dismissed' });
    // the SoD at the port: a strategy owner who proposed does not resolve
    const second = await h.humanWithSession(['strategy_owner'], 'b27s-strategist-2');
    const own = (await propose(second, { kind: 'forecast_shift', source: { forecast_id: FCT_NEW, band_pct: 0.01 }, title: 'The shift, proposed again', rationale: 'the first proposal was resolved (B27 harness)' })).proposal;
    await refused(resolve(second, String(own['proposal_id']), 'accepted', 'accepting my own proposal (B27 harness)'), /^scenario proposal rejected \(separation_of_duties\):/, 403);
    expect((await resolve(strategist, String(own['proposal_id']), 'dismissed', 'already accepted once (B27 harness)')).proposal['state']).toBe('dismissed');
  });
});

describe('B27 §S · g THE LEDGERS AND THE RETIREMENT', () => {
  it('g · the ledgers are append-only; a membership and a proposal change only as the ports change them', async () => {
    await expect(sql`update prediction.scenario_set_events set set_version = 99 where set_id = ${SET}::uuid`.execute(su)).rejects.toThrow();
    await expect(sql`delete from prediction.scenario_set_checks where set_id = ${SET}::uuid`.execute(su)).rejects.toThrow();
    await expect(sql`update prediction.portfolio_reviews set note = 'rewritten' where set_id = ${SET}::uuid`.execute(su)).rejects.toThrow();
    await expect(sql`delete from decision.package_scenario_sets where set_id = ${SET}::uuid`.execute(su)).rejects.toThrow();
    await expect(sql`update prediction.scenario_set_members set scenario_id = ${SCN_C}::uuid where set_id = ${SET}::uuid`.execute(su)).rejects.toThrow(/written once and removed once/);
    await expect(sql`update prediction.scenario_proposals set title = 'rewritten' where proposal_id = ${PROP_F}::uuid`.execute(su)).rejects.toThrow(/written once and resolved once/);
    await expect(sql`update prediction.scenario_relevance set score = 0 where scenario_id = ${SCN_A}::uuid`.execute(su)).rejects.toThrow();
  });

  it('g · the set is RETIRED once its package leaves flight (withdrawn), with a reason; a retired set takes no member and gates nothing', async () => {
    await c.withdraw(PKG, 'the decision is taken elsewhere (B27 harness)', w.owner);
    const r = (await retire(strategist, SET, 'the Regensburg decision no longer needs the set (B27 harness)')).transition;
    expect(r.set).toMatchObject({ state: 'retired', retirement_reason: 'the Regensburg decision no longer needs the set (B27 harness)' });
    await refused(addMember(strategist, SET, SCN_B), /^scenario set rejected \(state\): set .* is retired/, 409);
    await refused(check(strategist, SET), /^scenario set rejected \(state\): set .* is retired; an active set is checked/, 409);
    expect((await setEvents(SET)).at(-1)).toMatch(/^set\.retired@/);
  });
});
