/**
 * CP-6 B36 §P (0094) — STRATEGIC PLANNING AND INITIATIVE GOVERNANCE (F-P6-10; WS-16), through the real database and controllers.
 *
 *   p1 PLAN and INITIATIVE objects: a plan for an objective set and a horizon with its budget and authority ceiling; the initiatives ARE the
 *      Strategy Graph's INI objects (bound by id, never a copy); milestones proven by graph.measures rows; a dependency cycle refused; the
 *      plan's measures bound by id; every object's events append-only.
 *   p2 THE TRANSITIONS UNDER HUMAN AUTHORITY: propose (the lead, and the Planning Agent — the one act AI performs) → align → prioritise
 *      (the lead; an unaligned initiative cannot be prioritised) → fund (the authority, within the ceiling) → approve (the executive; never
 *      the proposer; the INI object's next version admitted) → BASELINE (a signed version: §0 record_signature kind plan_baseline; PLN
 *      admitted; refused unsigned) → pause / close (the sponsor); REPLAY = plan_as_of.
 *   p3 VARIANCE, INFEASIBILITY, BUDGET-AUTHORITY CONTINUITY: the tick step plan-variance (55) raises a run-basis variance (the control
 *      run's on_hand_end at the milestone's date undercuts the target) ROUTED as an attention item of class plan.variance to the
 *      initiative's owner, and an observation-basis one on a due milestone; the ceiling lowered below the funded sum opens a breach
 *      (never a silent acceptance) and a commitment on a package citing the initiative is HELD until the executive acknowledges it; the
 *      drift, infeasibility and lost-linkage breaches open once per cause and resolve when the cause is gone.
 *   p4 THE WORKSPACE READS: the composed view, the scenario SENSITIVITY (a run's outputs on the plan's measures by key, the digest named),
 *      the read's roles.
 *
 * Per clause a POSITIVE, a REFUSAL and a RECOVERY case. SYNTHETIC throughout (NORDWERK's data is the demonstration's). The signing key is
 * this process's own Ed25519 pair, bound as EYE_EXECUTIVE_SIGNING_KEY_DEMO before the harness boots. Stated superuser moves (the DB clock):
 * a plan's last review is moved into the past; an objective's status is set closed in the projection to stage a lost linkage.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { PlanningController } from '../../src/executive/planning/planning.controller.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

// THE SIGNING KEY: this process's own pair, by reference (the §0 discipline), set before the harness boots.
const KEY_REF = 'EYE_EXECUTIVE_SIGNING_KEY_DEMO';
const PAIR = generateKeyPairSync('ed25519');
const PRIVATE_B64 = PAIR.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const PUBLIC_PEM = PAIR.publicKey.export({ format: 'pem', type: 'spki' }).toString();
process.env[KEY_REF] = PRIVATE_B64;

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let planning: PlanningController; let scheduler: SchedulerService; let timer: AttentionTimerService; let signatures: SignatureService;
/** The strategy lead (strategy_owner), the executive and the decision authority (the world's), the sponsor, the Planning Agent (kind agent), the auditor, an analyst, the administrators. */
let lead: AuthenticatedPrincipal; let sponsor: AuthenticatedPrincipal; let agent: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let agentId = '';
/** What the cases leave one another. */
let OBJ2 = ''; let INI_A = ''; let INI_B = ''; let INI_C = ''; let MSR_STOCK = ''; let MSR_SHARE = ''; let MSR_TOOL = ''; let MSR_OTHER = '';
let PLAN = ''; let MS_Q2 = ''; let MS_DUE = ''; let MS_MET = ''; let MS_MET2 = ''; let DEP_AB = ''; let INI_D = ''; let INI_E = '';
let beforeFund: Date; let BREACH_BUDGET = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number): Promise<{ status: number | null; code: string | null; message: string }> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(su)).rows as Row[];
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;

/* ───────────── the routes (in process) ───────────── */
const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'executive');
const declarePlan = (as: AuthenticatedPrincipal, payload: Row) => planning.declarePlan(E(as, 'executive.plan.declare', 'PLN'), T(), D(), { payload }) as Promise<{ plan: Row }>;
const getPlan = (as: AuthenticatedPrincipal, id = PLAN) => planning.getPlan(E(as, 'executive.plan.read', 'PLN', id), T(), D(), id) as Promise<{ plan: Row }>;
const asOf = (as: AuthenticatedPrincipal, at: string | null, id = PLAN) => planning.planAsOf(E(as, 'executive.plan.read', 'PLN', id), T(), D(), id, { payload: at === null ? {} : { at } }) as Promise<{ replay: Row }>;
const sensitivity = (as: AuthenticatedPrincipal, runId: string, id = PLAN) => planning.planSensitivity(E(as, 'executive.plan.read', 'PLN', id), T(), D(), id, { payload: { runId } }) as Promise<{ sensitivity: Row }>;
const setAuthority = (as: AuthenticatedPrincipal, authority: string, reason: string) => planning.setAuthority(E(as, 'executive.plan.authority.set', 'PLN', PLAN), T(), D(), PLAN, { payload: { authority, reason } }) as Promise<{ authority: Row }>;
const review = (as: AuthenticatedPrincipal, note: string) => planning.reviewPlan(E(as, 'executive.plan.review', 'PLN', PLAN), T(), D(), PLAN, { payload: { note } }) as Promise<{ review: Row }>;
const baseline = (as: AuthenticatedPrincipal, note = 'the 2027 dual-sourcing plan baselined (B36 harness)') => planning.baselinePlan(E(as, 'executive.plan.baseline', 'PLN', PLAN), T(), D(), PLAN, { payload: { note } }) as Promise<{ baseline: Row }>;
const bindMeasure = (as: AuthenticatedPrincipal, measureId: string, quantityKey: string | null) => planning.bindMeasure(E(as, 'executive.plan.measure.bind', 'PLN', PLAN), T(), D(), PLAN, { payload: { measureId, quantityKey } }) as Promise<{ measure: Row }>;
const attachRun = (as: AuthenticatedPrincipal, runId: string) => planning.attachRun(E(as, 'executive.plan.run.attach', 'PLN', PLAN), T(), D(), PLAN, { payload: { runId } }) as Promise<{ run: Row }>;
const propose = (as: AuthenticatedPrincipal, payload: Row) => planning.proposeInitiative(E(as, 'executive.initiative.propose', 'INI', String(payload['initiativeId'])), T(), D(), { payload }) as Promise<{ initiative: Row }>;
const align = (as: AuthenticatedPrincipal, id: string, objectiveIds: string[] = [], rationale = 'aligned to the corridor objective (B36 harness)') => planning.alignInitiative(E(as, 'executive.initiative.align', 'INI', id), T(), D(), id, { payload: { objectiveIds, rationale } }) as Promise<{ initiative: Row }>;
const prioritise = (as: AuthenticatedPrincipal, id: string, priority: number, rationale = 'ranked by the lead (B36 harness)') => planning.prioritiseInitiative(E(as, 'executive.initiative.prioritise', 'INI', id), T(), D(), id, { payload: { priority, rationale } }) as Promise<{ initiative: Row }>;
const fund = (as: AuthenticatedPrincipal, id: string, amount: string, rationale = 'funded within the plan authority (B36 harness)') => planning.fundInitiative(E(as, 'executive.initiative.fund', 'INI', id), T(), D(), id, { payload: { amount, rationale } }) as Promise<{ initiative: Row }>;
const approve = (as: AuthenticatedPrincipal, id: string, rationale = 'approved by the executive (B36 harness)') => planning.approveInitiative(E(as, 'executive.initiative.approve', 'INI', id), T(), D(), id, { payload: { rationale } }) as Promise<{ initiative: Row }>;
const pause = (as: AuthenticatedPrincipal, id: string, reason = 'paused by the sponsor pending the supplier audit (B36 harness)') => planning.pauseInitiative(E(as, 'executive.initiative.pause', 'INI', id), T(), D(), id, { payload: { reason } }) as Promise<{ initiative: Row }>;
const close = (as: AuthenticatedPrincipal, id: string, reason = 'closed by the sponsor: superseded (B36 harness)') => planning.closeInitiative(E(as, 'executive.initiative.close', 'INI', id), T(), D(), id, { payload: { reason } }) as Promise<{ initiative: Row }>;
const setMilestone = (as: AuthenticatedPrincipal, payload: Row) => planning.setMilestone(E(as, 'executive.plan.milestone.set', 'INI', String(payload['initiativeId'])), T(), D(), { payload }) as Promise<{ milestone: Row }>;
const dependency = (as: AuthenticatedPrincipal, payload: Row) => planning.declareDependency(E(as, 'executive.plan.dependency.declare', 'INI', String(payload['from'])), T(), D(), { payload }) as Promise<{ dependency: Row }>;
const acknowledge = (as: AuthenticatedPrincipal, breachId: string, authorization: string) => planning.acknowledgeBreach(E(as, 'executive.plan.breach.acknowledge', 'PLN'), T(), D(), breachId, { payload: { authorization } }) as Promise<{ breach: Row }>;
const cite = (as: AuthenticatedPrincipal, packageId: string, initiativeId: string) => planning.citeInitiative(E(as, 'executive.plan.initiative.cite', 'DEC', packageId), T(), D(), packageId, { payload: { initiativeId } }) as Promise<{ citation: Row }>;
const declareStrategy = async (as: AuthenticatedPrincipal, objectType: string, title: string): Promise<string> =>
  ((await w.graph.declare(h.req(as, 'graph.strategy.declare', objectType, null, 'graph'), T(), D(), { payload: { objectType, title, statement: `${title} (B36 harness, SYNTHETIC)`, status: 'active',
    restsOn: [{ kind: 'entity', id: w.entityId, rationale: 'the object is about the corridor through this strait (B36 harness)' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
const defineMeasure = (as: AuthenticatedPrincipal, id: string, objectiveId: string, over: Row = {}) => w.graph.defineMeasure(h.req(as, 'graph.measure.define', 'MSR', id, 'graph'), T(), D(), id,
  { payload: { objectiveId, unit: 'units', direction: 'higher_better', targetValue: 1000, targetDate: '2027-06-30', freshnessDays: 30, ...over } }) as Promise<{ measure: Row }>;
const observe = (as: AuthenticatedPrincipal, id: string, value: number, observedAt: string) => w.graph.observeMeasure(h.req(as, 'graph.measure.observe', 'MSR', id, 'graph'), T(), D(), id,
  { payload: { value, observedAt, source: { kind: 'evidence', id: w.evd.id } } }) as Promise<{ observation: Row }>;
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  return t;
};
const variances = async () => rows(sql`select v.*, m.name as milestone from executive.plan_variances v join executive.milestones m on m.milestone_id = v.milestone_id where v.plan_id = ${PLAN}::uuid order by v.raised_at`);
const breaches = async () => rows(sql`select breach_id::text, kind, cause_key, state, initiative_id::text, forecast_impact from executive.plan_breaches where plan_id = ${PLAN}::uuid order by opened_at`);
const items = async () => rows(sql`select item_id::text, signal_class, subject_kind, subject_id::text, owner_principal_id::text as owner, state, title, details from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = 'plan.variance' order by created_at`);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { PlanningController: PC } = await import('../../src/executive/planning/planning.controller.js');
  planning = h.app.get(PC);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService); signatures = h.app.get(SignatureService);
  w = await bootDecisionWorld(h); c = decisionCalls(h, w);
  lead = await h.humanWithSession(['strategy_owner'], 'b36p-lead');
  sponsor = await h.humanWithSession(['decision_authority'], 'b36p-sponsor');
  auditor = await h.humanWithSession(['auditor'], 'b36p-auditor', 'TENANT');
  analyst = await h.humanWithSession(['domain_analyst'], 'b36p-analyst');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b36p-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b36p-dadmin');
  outsider = await h.humanWithSession(['collection_manager'], 'b36p-outsider');
  // THE PLANNING AGENT: a principal of kind agent, bound as planning_agent, with a session of its own (the port compares the acting principal).
  const agentPrincipalId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`agent:planning@1-${agentPrincipalId.slice(-8)}`}, null, 'active')`.execute(su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'planning_agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(su);
  agent = await h.openSession({ ...h.manager, principalId: agentPrincipalId, kind: 'agent', assurance: 'agent_grant', homeScope: 'DOMAIN', homeDomainId: D(), bindings: [{ roleCode: 'planning_agent', scope: 'DOMAIN', tenantId: T(), domainId: D() }] } as AuthenticatedPrincipal);
  // the attention agent: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await w.exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: w.executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
  // the attention policy names the class (the routing's roles when no owner is an active human)
  await w.exec.publishAttentionPolicy(h.req(w.executive, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the plan variance class for the planning harness', rules: { classes: {
    'plan.variance': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 240 } } } } as never });
  // THE STRATEGY GRAPH's objects (SYNTHETIC): a second objective, three initiatives (INI), three measures (MSR) — declared by the lead
  OBJ2 = await declareStrategy(lead, 'OBJ', 'Second magnet source qualified by 2027');
  INI_A = await declareStrategy(lead, 'INI', 'Dual-sourcing 2027: qualify the second NdFeB source');
  INI_B = await declareStrategy(lead, 'INI', 'Dual-sourcing 2027: dual-tooling at Regensburg');
  INI_C = await declareStrategy(lead, 'INI', 'Corridor insurance programme');
  MSR_STOCK = await declareStrategy(lead, 'MSR', 'Magnet stock on hand at Regensburg');
  MSR_SHARE = await declareStrategy(lead, 'MSR', 'Second-source share of magnet volume');
  MSR_TOOL = await declareStrategy(lead, 'MSR', 'Tooling stock on hand at Regensburg');
  MSR_OTHER = await declareStrategy(lead, 'MSR', 'A measure of another objective');
  await defineMeasure(lead, MSR_STOCK, w.objectiveId, { unit: 'units', targetValue: 500, direction: 'higher_better' });
  await defineMeasure(lead, MSR_SHARE, OBJ2, { unit: 'percent', targetValue: 40, direction: 'higher_better' });
  await defineMeasure(lead, MSR_TOOL, w.objectiveId, { unit: 'units', targetValue: 100, direction: 'higher_better' });
  const OBJ3 = await declareStrategy(lead, 'OBJ', 'An objective outside the plan');
  await defineMeasure(lead, MSR_OTHER, OBJ3, { unit: 'units', targetValue: 1 });
}, 400_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  delete process.env[KEY_REF];
  await h?.close();
});

describe('B36 §P · p1 the PLAN and INITIATIVE objects', () => {
  it('p1 · POSITIVE: a plan for an objective set with its budget and authority; the initiatives ARE the INI objects (the lead proposes one, the Planning Agent another); milestones proven by measures; a dependency; the plan measure bound by id with its run key; the run attached; the view composes it all', async () => {
    const p = (await declarePlan(lead, { title: 'Dual-sourcing 2027', statement: 'a second NdFeB source qualified and tooled before the 2027 corridor season', horizon: '12m', objectiveIds: [w.objectiveId, OBJ2],
      currency: 'EUR', budgetTotal: '1200000.00', budgetAuthority: '900000.00', reviewCadenceDays: 30 })).plan;
    PLAN = String(p['plan_id']);
    expect(p).toMatchObject({ title: 'Dual-sourcing 2027', horizon: '12m', state: 'open', current_version: 0, budget_currency: 'EUR', budget_total: 1200000, budget_authority: 900000, owner_principal_id: lead.principalId }); // a port answers jsonb: numeric renders as a JSON number (its digits exact); the intake takes strings
    const a = (await propose(lead, { initiativeId: INI_A, planId: PLAN, objectiveId: OBJ2, sponsor: sponsor.principalId, owner: analyst.principalId, budgetShare: '600000.00', rationale: 'the second source is the 2027 plan\'s core (B36 harness)' })).initiative;
    expect(a).toMatchObject({ initiative_id: INI_A, plan_id: PLAN, objective_id: OBJ2, state: 'proposed', proposed_by_kind: 'human', sponsor_principal_id: sponsor.principalId, owner_principal_id: analyst.principalId, budget_share: 600000 });
    expect(a['title']).toBe('Dual-sourcing 2027: qualify the second NdFeB source'); // the INI object's own title, as the planning view's caption
    // THE PLANNING AGENT proposes (no human gate on this one act): the proposer's kind is recorded
    const b = (await propose(agent, { initiativeId: INI_B, planId: PLAN, objectiveId: w.objectiveId, sponsor: sponsor.principalId, owner: analyst.principalId, budgetShare: '300000.00', rationale: 'drafted by the Planning Agent from the corridor scenario (B36 harness)' })).initiative;
    expect(b).toMatchObject({ initiative_id: INI_B, state: 'proposed', proposed_by_kind: 'agent', proposed_by: agent.principalId });
    // the INI row is the graph's: executive.initiatives references graph.strategy_current (one object, two views)
    const bound = await rows(sql`select i.initiative_id::text, s.object_type, s.title from executive.initiatives i join graph.strategy_current s on s.strategy_object_id = i.initiative_id where i.plan_id = ${PLAN}::uuid order by i.proposed_at`);
    expect(bound.map((r) => [r['object_type'], r['initiative_id']])).toEqual([['INI', INI_A], ['INI', INI_B]]);
    // milestones (the lead), a measure of an objective the initiative is aligned to; the plan measure bound with the run output key
    await align(lead, INI_A, [w.objectiveId]);
    await align(lead, INI_B);
    MS_Q2 = String((await setMilestone(lead, { initiativeId: INI_A, name: 'Q2 2024 stock floor held during qualification', dueDate: '2024-03-01', measureId: MSR_STOCK, targetValue: '100000' })).milestone['milestone_id']);
    MS_DUE = String((await setMilestone(lead, { initiativeId: INI_A, name: 'Second-source share reached', dueDate: '2024-02-15', measureId: MSR_SHARE, targetValue: '40' })).milestone['milestone_id']);
    MS_MET = String((await setMilestone(lead, { initiativeId: INI_B, name: 'Tooling stock floor', dueDate: '2024-02-01', measureId: MSR_TOOL, targetValue: '100' })).milestone['milestone_id']);
    MS_MET2 = String((await setMilestone(lead, { initiativeId: INI_A, name: 'Qualification tooling floor', dueDate: '2024-02-01', measureId: MSR_TOOL, targetValue: '100' })).milestone['milestone_id']);
    const bm = (await bindMeasure(lead, MSR_STOCK, 'on_hand_end')).measure;
    expect(bm).toMatchObject({ measure_id: MSR_STOCK, quantity_key: 'on_hand_end', unit: 'units', direction: 'higher_better' });
    DEP_AB = String((await dependency(lead, { from: INI_A, to: INI_B, kind: 'finish_to_start', rationale: 'tooling follows the qualified source (B36 harness)' })).dependency['dependency_id']);
    const run = (await attachRun(lead, w.controlId)).run;
    expect(run).toMatchObject({ plan_id: PLAN, run_id: w.controlId, model_ref: 'supply-flow@1' });
    const v = (await getPlan(lead)).plan;
    expect((v['initiatives'] as Row[]).map((i) => i['initiative_id'])).toEqual([INI_A, INI_B]);
    expect((v['measures'] as Row[]).map((m) => [m['measure_id'], m['quantity_key']])).toEqual(expect.arrayContaining([[MSR_STOCK, 'on_hand_end'], [MSR_SHARE, null]]));
    expect((v['dependencies'] as Row[])[0]).toMatchObject({ dependency_id: DEP_AB, kind: 'finish_to_start', from_initiative_id: INI_A, to_initiative_id: INI_B });
    expect((v['runs'] as Row[])[0]).toMatchObject({ run_id: w.controlId });
    expect(v['funded']).toBe(0);
    // Part S's plan links read the same rows (graph.strategy_plan_links when integrated): objective_id is the column they read
    const forObjective = (await planning.listInitiatives(E(lead, 'executive.plan.read', 'INI'), T(), D(), { payload: { objectiveId: OBJ2 } }) as { initiatives: Row[] }).initiatives;
    expect(forObjective.map((i) => i['initiative_id'])).toEqual([INI_A]);
  }, 120_000);

  it('p1 · REFUSAL: an objective that is not a live OBJ (404); an initiative that is not an INI (404); a proposal repeated (409); an objective outside the plan\'s set (422); a milestone on a measure of an objective the initiative is not aligned to (422); a dependency cycle (422); a float budget (422 at the intake)', async () => {
    await refused(declarePlan(lead, { title: 'x plan', statement: 'a plan with a ghost objective', horizon: '90d', objectiveIds: [uuidv7()], currency: 'EUR', budgetTotal: '1.00', budgetAuthority: '1.00' }), /^plan rejected \(unknown_objective\)/, 404);
    await refused(propose(lead, { initiativeId: MSR_STOCK, planId: PLAN, objectiveId: OBJ2, sponsor: sponsor.principalId, owner: analyst.principalId, budgetShare: '1.00', rationale: 'a measure is not an initiative' }), /^initiative rejected \(unknown_initiative\)/, 404);
    await refused(propose(lead, { initiativeId: INI_A, planId: PLAN, objectiveId: OBJ2, sponsor: sponsor.principalId, owner: analyst.principalId, budgetShare: '1.00', rationale: 'proposed a second time' }), /^initiative rejected \(duplicate\)/, 409);
    const OBJX = await declareStrategy(lead, 'OBJ', 'An objective the plan does not carry');
    await refused(propose(lead, { initiativeId: INI_C, planId: PLAN, objectiveId: OBJX, sponsor: sponsor.principalId, owner: analyst.principalId, budgetShare: '1.00', rationale: 'outside the objective set' }), /^initiative rejected \(objectives\)/, 422);
    await refused(setMilestone(lead, { initiativeId: INI_A, name: 'wrong measure', dueDate: '2024-03-01', measureId: MSR_OTHER, targetValue: '1' }), /^milestone rejected \(measure_objective\)/, 422);
    await refused(dependency(lead, { from: INI_B, to: INI_A, kind: 'finish_to_start', rationale: 'closing the loop the other way' }), /^plan dependency rejected \(cycle\)/, 422);
    const f = await refusal(declarePlan(lead, { title: 'float plan', statement: 'a budget as a float', horizon: '90d', objectiveIds: [OBJ2], currency: 'EUR', budgetTotal: 1200000.5, budgetAuthority: '1.00' }));
    expect(f.status).toBe(422); expect(f.message).toMatch(/never a float/);
    // an outsider holds no planning action (the PDP)
    expect((await refusal(declarePlan(outsider, { title: 'no', statement: 'no standing', horizon: '90d', objectiveIds: [OBJ2], currency: 'EUR', budgetTotal: '1.00', budgetAuthority: '1.00' }))).status).toBe(403);
  }, 60_000);

  it('p1 · RECOVERY: the ledgers are append-only (an event, a transition cannot be rewritten); a refused act left nothing behind; the third initiative proposes cleanly into the set', async () => {
    await expect(sql`update executive.plan_events set event = 'plan.closed' where plan_id = ${PLAN}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    await expect(sql`delete from executive.initiative_transitions where initiative_id = ${INI_A}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    expect((await rows(sql`select count(*)::int n from executive.initiatives where plan_id = ${PLAN}::uuid`))[0]!['n']).toBe(2);
    const cc = (await propose(lead, { initiativeId: INI_C, planId: PLAN, objectiveId: w.objectiveId, sponsor: sponsor.principalId, owner: analyst.principalId, budgetShare: '150000.00', rationale: 'the insurance programme joins the plan (B36 harness)' })).initiative;
    expect(cc['state']).toBe('proposed');
  });
});

describe('B36 §P · p2 the TRANSITIONS under human authority', () => {
  it('p2 · POSITIVE: align → prioritise (the lead) → fund (the authority, within the ceiling) → approve (the executive; the INI object\'s next version admitted) → BASELINE (the executive\'s signed version; PLN admitted; the signature verifies) → pause and close (the sponsor); the replay reads each instant', async () => {
    expect((await prioritise(lead, INI_A, 1)).initiative).toMatchObject({ state: 'prioritised', priority: 1 });
    await prioritise(lead, INI_B, 2);
    beforeFund = await mark();
    const fa = (await fund(w.authority, INI_A, '600000.00')).initiative;
    expect(fa).toMatchObject({ state: 'funded', funded_amount: 600000 });
    expect((await fund(w.authority, INI_B, '250000.00')).initiative['state']).toBe('funded');
    // APPROVE: the executive (not the proposer) — the INI object gains version 2 carrying the planning approval
    const ap = (await approve(w.executive, INI_A)).initiative;
    expect(ap).toMatchObject({ state: 'approved', approved_by: w.executive.principalId, approved_object_version: 2 });
    expect(ap['object']).toMatchObject({ object_type: 'INI', object_id: INI_A, object_version: 2 });
    const ini = await rows(sql`select object_version::int v, supersedes, payload -> 'metrics' -> 'planning' as planning, payload ->> 'title' as title from objects.canonical_objects where object_id = ${INI_A}::uuid order by object_version`);
    expect(ini.map((r) => r['v'])).toEqual([1, 2]);
    expect(ini[1]).toMatchObject({ supersedes: `${INI_A}@1`, title: 'Dual-sourcing 2027: qualify the second NdFeB source' });
    expect(ini[1]!['planning']).toMatchObject({ plan_id: PLAN, state: 'approved', approved_by: w.executive.principalId, funded_amount: 600000 });
    // the agent-proposed initiative is approved by the authority (a named human)
    expect((await approve(w.authority, INI_B)).initiative['state']).toBe('approved');
    // BASELINE: the signed version
    const bl = (await baseline(w.executive)).baseline;
    expect(bl).toMatchObject({ plan_id: PLAN, version: 1 });
    expect(String(bl['digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect(bl['signature']).toMatchObject({ subject_kind: 'plan_baseline', subject_id: PLAN, subject_version: 1, signer: w.executive.principalId });
    expect(bl['object']).toMatchObject({ object_type: 'PLN', object_id: PLAN, object_version: 1 });
    const sig = (await rows(sql`select executive.signature_of('plan_baseline', ${PLAN}::uuid, 1) as s`))[0]!['s'] as Array<{ signer: string; key_id: string; signature: string; subject_digest: string; bound_action: string }>;
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ signer: w.executive.principalId, bound_action: 'executive.plan.baseline', subject_digest: bl['digest'] });
    expect(signatures.verify(sig[0]!, PUBLIC_PEM)).toBe(true);
    expect(signatures.verify({ ...sig[0]!, subject_digest: '0'.repeat(64) }, PUBLIC_PEM)).toBe(false);
    const pln = await rows(sql`select object_type, object_version::int v, payload -> 'initiatives' as initiatives, payload ->> 'baseline_digest' as d from objects.canonical_objects where object_id = ${PLAN}::uuid`);
    expect(pln[0]).toMatchObject({ object_type: 'PLN', v: 1, d: bl['digest'] });
    expect((pln[0]!['initiatives'] as Row[]).map((i) => i['initiative_id'])).toEqual(expect.arrayContaining([INI_A, INI_B, INI_C]));
    const v = (await getPlan(w.executive)).plan;
    expect(v).toMatchObject({ state: 'baselined', current_version: 1, funded: 850000 });
    expect(((v['versions'] as Row[])[0]!['signatures'] as Row[])).toHaveLength(1);
    // PAUSE and CLOSE: the sponsor's acts; a paused initiative no longer draws on the authority
    expect((await pause(sponsor, INI_B)).initiative).toMatchObject({ state: 'paused', pause_reason: expect.stringMatching(/supplier audit/) });
    expect((await getPlan(lead)).plan['funded']).toBe(600000);
    expect((await close(sponsor, INI_C)).initiative['state']).toBe('closed');
    // THE REPLAY: before the funding, INI_A stood prioritised; now it stands approved; the baseline is v1
    const then = (await asOf(auditor, beforeFund.toISOString())).replay;
    expect(then).toMatchObject({ exists: true, state: 'open', current_version: 0 });
    expect((then['initiatives'] as Row[]).find((i) => i['initiative_id'] === INI_A)).toMatchObject({ state: 'prioritised', as_of_transition: 'prioritise', funded_amount: null });
    const now = (await asOf(auditor, null)).replay;
    expect(now).toMatchObject({ state: 'baselined', current_version: 1 });
    expect((now['initiatives'] as Row[]).find((i) => i['initiative_id'] === INI_A)).toMatchObject({ state: 'approved', funded_amount: 600000, priority: 1 });
    expect((now['initiatives'] as Row[]).find((i) => i['initiative_id'] === INI_B)).toMatchObject({ state: 'paused' });
    const transitions = await rows(sql`select transition, from_state, to_state, actor_kind from executive.initiative_transitions where initiative_id = ${INI_B}::uuid order by occurred_at`);
    expect(transitions.map((t) => [t['transition'], t['to_state'], t['actor_kind']])).toEqual([['propose', 'proposed', 'agent'], ['align', 'aligned', 'human'], ['prioritise', 'prioritised', 'human'], ['fund', 'funded', 'human'], ['approve', 'approved', 'human'], ['baseline', 'approved', 'human'], ['pause', 'paused', 'human']]);
  }, 120_000);

  it('p2 · REFUSAL: the Planning Agent cannot fund, approve or baseline (403 at the PDP — the human gate); an unaligned initiative cannot be prioritised (409); funding over the authority (422 budget_authority); the proposer cannot approve (403 separation); a stranger cannot pause (403 not_sponsor); a baseline without an approved initiative (409); a baseline without a signing key (409 unbound)', async () => {
    INI_D = await declareStrategy(lead, 'INI', 'Dual-sourcing 2027: a fourth initiative');
    await propose(lead, { initiativeId: INI_D, planId: PLAN, objectiveId: OBJ2, sponsor: sponsor.principalId, owner: analyst.principalId, budgetShare: '400000.00', rationale: 'proposed by the lead for the refusal cases (B36 harness)' });
    for (const p of [() => fund(agent, INI_D, '1.00'), () => approve(agent, INI_D), () => baseline(agent), () => align(agent, INI_D), () => prioritise(agent, INI_D, 3)]) {
      const r = await refusal(p()); expect(r.status, r.message).toBe(403);
    }
    await refused(prioritise(lead, INI_D, 3), /^initiative rejected \(state\): .* is not aligned/, 409);
    await align(lead, INI_D); await prioritise(lead, INI_D, 3);
    // 600000 funded (INI_A; INI_B paused) + 400000 = 1000000 > 900000
    await refused(fund(w.authority, INI_D, '400000.00'), /^initiative rejected \(budget_authority\): funding 400000.00 EUR .* above its authority ceiling of 900000.00 EUR/, 422);
    await fund(w.authority, INI_D, '200000.00');
    // the proposer (the lead, who also holds no approve action) is refused at the PDP; a lead with the executive role is refused by the port's separation
    const leadExec = await h.humanWithSession(['strategy_owner', 'executive'], 'b36p-lead-exec');
    INI_E = await declareStrategy(leadExec, 'INI', 'Dual-sourcing 2027: proposed and approved by one person');
    await propose(leadExec, { initiativeId: INI_E, planId: PLAN, objectiveId: OBJ2, sponsor: sponsor.principalId, owner: analyst.principalId, budgetShare: '1.00', rationale: 'the separation probe (B36 harness)' });
    await align(leadExec, INI_E); await prioritise(leadExec, INI_E, 9); await fund(leadExec, INI_E, '1.00');
    await refused(approve(leadExec, INI_E), /^initiative rejected \(separation\)/, 403);
    await refused(pause(w.authority, INI_D), /^initiative rejected \(not_sponsor\)/, 403);
    await refused(fund(w.authority, INI_A, '1.00'), /^initiative rejected \(state\): .* is approved, not prioritised/, 409);
    // a plan of proposals is not a baseline
    const p2 = String((await declarePlan(lead, { title: 'Proposals only', statement: 'nothing approved yet', horizon: '90d', objectiveIds: [OBJ2], currency: 'EUR', budgetTotal: '10.00', budgetAuthority: '10.00' })).plan['plan_id']);
    const r = await refusal(planning.baselinePlan(E(w.executive, 'executive.plan.baseline', 'PLN', p2), T(), D(), p2, { payload: {} }));
    expect(r.status, r.message).toBe(409); expect(r.message).toMatch(/^plan baseline rejected \(state\): .* has no approved initiative/);
    // no signing key bound: the baseline is refused whole (nothing written)
    await approve(w.executive, INI_D);
    const before = (await rows(sql`select count(*)::int n from executive.plan_versions where plan_id = ${PLAN}::uuid`))[0]!['n'];
    const saved = process.env[KEY_REF]; delete process.env[KEY_REF];
    try {
      const u = await refusal(baseline(w.executive, 'an unsigned baseline must not exist'));
      expect(u.status, u.message).toBe(409); expect(u.message).toMatch(/^signature rejected \(unbound\)/);
    } finally { process.env[KEY_REF] = saved; }
    expect((await rows(sql`select count(*)::int n from executive.plan_versions where plan_id = ${PLAN}::uuid`))[0]!['n']).toBe(before);
    expect((await rows(sql`select count(*)::int n from objects.canonical_objects where object_id = ${PLAN}::uuid`))[0]!['n']).toBe(1);
  }, 120_000);

  it('p2 · RECOVERY: with the key restored the second baseline is signed (v2, its own digest, PLN v2 superseding v1); a version row is append-only; the replay of an instant before the plan says it did not exist', async () => {
    const bl = (await baseline(w.executive, 'the plan re-baselined after the fourth initiative (B36 harness)')).baseline;
    expect(bl).toMatchObject({ version: 2 });
    const versions = await rows(sql`select version, digest from executive.plan_versions where plan_id = ${PLAN}::uuid order by version`);
    expect(versions.map((v) => v['version'])).toEqual([1, 2]);
    expect(versions[0]!['digest']).not.toBe(versions[1]!['digest']);
    expect((await rows(sql`select object_version::int v, supersedes from objects.canonical_objects where object_id = ${PLAN}::uuid order by object_version`))).toEqual([{ v: 1, supersedes: null }, { v: 2, supersedes: `${PLAN}@1` }]);
    await expect(sql`update executive.plan_versions set note = 'rewritten' where plan_id = ${PLAN}::uuid`.execute(su)).rejects.toThrow(/append-only/);
    const before = (await asOf(auditor, new Date(Date.now() - 365 * 86_400_000).toISOString())).replay;
    expect(before).toMatchObject({ exists: false });
  }, 60_000);
});

describe('B36 §P · p3 VARIANCE, INFEASIBILITY and BUDGET-AUTHORITY CONTINUITY', () => {
  it('p3 · POSITIVE: the tick step plan-variance raises the run-basis variance (the control run\'s on_hand_end at the Q2 date undercuts 100000) ROUTED to the initiative\'s owner as a plan.variance item; the due milestone below its observed share is missed; the tooling floor is met; the drift breach opens on the stale review and the infeasibility on the dependency', async () => {
    // observations (the analyst, from the evidence record): the share below its 40 target; the tooling floor above its 100
    await observe(analyst, MSR_SHARE, 22, new Date(Date.now() - 86_400_000).toISOString());
    await observe(analyst, MSR_TOOL, 640, new Date(Date.now() - 86_400_000).toISOString()); // MSR_STOCK stays unobserved: the Q2 milestone's only basis is the run
    // stated superuser move (the DB clock): the plan's last review 40 days back — beyond its 30-day cadence
    await sql`update executive.plans set last_reviewed_at = clock_timestamp() - interval '40 days' where plan_id = ${PLAN}::uuid`.execute(su);
    // the infeasibility: INI_A's last milestone (2024-03-01) is due after INI_B's first (2024-02-01) while A must finish before B starts
    const t = await tick(1);
    const step = (t as unknown as { steps?: Row }).steps?.['plan-variance'] as Row | undefined;
    const vs = await variances();
    const q2 = vs.find((v) => v['milestone_id'] === MS_Q2);
    expect(q2, JSON.stringify({ step, vs })).toMatchObject({ basis_kind: 'run', basis_id: w.controlId, adverse: true, direction: 'higher_better', target_value: '100000', owner_principal_id: analyst.principalId, initiative_id: INI_A });
    expect(Number(q2!['observed_value'])).toBeLessThan(100000); // the control run holds 72885.714 units on 2024-03-01
    expect(Number(q2!['variance'])).toBeLessThan(0);
    const run = (await rows(sql`select outputs_digest from simulation.runs_current where run_id = ${w.controlId}::uuid`))[0]!;
    expect(q2!['basis_digest']).toBe(run['outputs_digest']);
    const due = vs.find((v) => v['milestone_id'] === MS_DUE);
    expect(due).toMatchObject({ basis_kind: 'observation', observed_value: '22', target_value: '40', adverse: true });
    expect(vs.find((v) => v['milestone_id'] === MS_MET2)).toBeUndefined(); // 640 >= 100: met, no variance
    expect(vs.find((v) => v['milestone_id'] === MS_MET)).toBeUndefined(); // INI_B is paused: the schedule does not judge a paused initiative's milestones
    const ms = await rows(sql`select milestone_id::text id, state from executive.milestones where plan_id = ${PLAN}::uuid`);
    expect(Object.fromEntries(ms.map((m) => [m['id'], m['state']]))).toMatchObject({ [MS_Q2]: 'at_risk', [MS_DUE]: 'missed', [MS_MET2]: 'met', [MS_MET]: 'planned' });
    // THE ROUTING: an attention item of class plan.variance, subject the plan, owned by the initiative's owner (an active human)
    const its = await items();
    const routed = its.find((i) => (i['details'] as Row)['variance_id'] === q2!['variance_id']);
    expect(routed).toMatchObject({ signal_class: 'plan.variance', subject_kind: 'plan', subject_id: PLAN, owner: analyst.principalId, state: 'open' });
    expect(String(routed!['title'])).toMatch(/^plan variance: Q2 2024 stock floor/);
    expect(q2!['routed_item_id']).toBe(routed!['item_id']);
    // THE BREACHES: drift (the stale review) and infeasible (the dependency), each once per cause
    const bs = await breaches();
    expect(bs.filter((b) => b['state'] === 'open').map((b) => b['kind']).sort()).toEqual(['drift_without_review', 'infeasible']);
    const inf = bs.find((b) => b['kind'] === 'infeasible')!;
    expect(inf).toMatchObject({ cause_key: DEP_AB, initiative_id: INI_B });
    expect(inf['forecast_impact']).toMatchObject({ dependency_id: DEP_AB, predecessor_last_due: '2024-03-01', successor_first_due: '2024-02-01', slip_days: 29 });
    // the second tick raises nothing twice
    await tick(2);
    expect((await variances()).length).toBe(vs.length);
    expect((await breaches()).length).toBe(bs.length);
  }, 120_000);

  it('p3 · REFUSAL: the authority ceiling lowered below the funded sum opens a budget_over_authority breach at once (the CONTINUITY rule) with what it forecasts to impact; a commitment on a package that cites the initiative is HELD (409 breach_open); an acknowledgement by the lead is refused (403); a citation by a stranger (403 not_owner); a breach acknowledged twice (409)', async () => {
    // funded now: INI_A 600000 + INI_D 200000 + INI_E 1.00 = 800001.00 (INI_B paused, INI_C closed)
    const r = (await setAuthority(w.executive, '700000.00', 'the 2027 envelope cut by the board (B36 harness)')).authority;
    expect(r).toMatchObject({ budget_authority: 700000, prior_authority: 900000, funded: 800001, continuity: 'breach: the funded sum exceeds the new ceiling' });
    BREACH_BUDGET = String(r['breach_id']);
    const b = (await breaches()).find((x) => x['breach_id'] === BREACH_BUDGET)!;
    expect(b).toMatchObject({ kind: 'budget_over_authority', state: 'open' });
    expect(b['forecast_impact']).toMatchObject({ funded: 800001, authority: 700000, over_by: 100001, currency: 'EUR' });
    expect(((b['forecast_impact'] as Row)['initiatives'] as Row[]).map((i) => i['initiative_id'])).toEqual(expect.arrayContaining([INI_A, INI_D]));
    // THE HOLD: a package citing INI_A — proposed, approved — cannot be committed while the breach is open
    const p = await c.proposed();
    expect((await cite(w.owner, p.pkg, INI_A)).citation).toMatchObject({ package_id: p.pkg, initiative_id: INI_A, plan_id: PLAN });
    expect((await rows(sql`select event from decision.package_events where package_id = ${p.pkg}::uuid and event = 'initiative.cited'`)).length).toBe(1);
    await c.approve(p.pkg, p.v, { decision: 'approve', versionDigest: p.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, w.approver);
    const held = await refusal(c.commit(p.pkg, p.v, p.digest, w.authority));
    expect(held.status, held.message).toBe(409);
    expect(held.message).toMatch(/^plan commitment rejected \(breach_open\): package .* cites initiative "Dual-sourcing 2027: qualify the second NdFeB source" of a plan with open breach\(es\)/);
    expect((await rows(sql`select 1 from decision.commitments where package_id = ${p.pkg}::uuid`)).length).toBe(0);
    // the lead holds no acknowledge action; a stranger is not the package's owner nor the plan's lead
    expect((await refusal(acknowledge(lead, BREACH_BUDGET, 'the lead cannot authorize'))).status).toBe(403);
    const p2 = await c.proposed();
    await refused(cite(sponsor, p2.pkg, INI_A), /^initiative citation rejected \(not_owner\)/, 403);
    // acknowledged by the executive with the authority named: the budget breach no longer holds — but the drift and infeasible breaches still do
    expect((await acknowledge(w.executive, BREACH_BUDGET, 'board minute 2026-09-12: the overrun is carried into the Q1 review (B36 harness)')).breach).toMatchObject({ state: 'acknowledged', acknowledged_by: w.executive.principalId });
    const still = await refusal(c.commit(p.pkg, p.v, p.digest, w.authority));
    expect(still.status).toBe(409); expect(still.message).toMatch(/drift_without_review|infeasible/); expect(still.message).not.toMatch(/budget_over_authority/);
    for (const b2 of (await breaches()).filter((x) => x['state'] === 'open')) await acknowledge(w.executive, String(b2['breach_id']), `${String(b2['kind'])} carried under the board minute (B36 harness)`);
    const cm = await c.commit(p.pkg, p.v, p.digest, w.authority);
    expect(cm.commitment.commitmentId).toBeTruthy();
    await refused(acknowledge(w.executive, BREACH_BUDGET, 'acknowledged a second time'), /^plan breach rejected \(state\)/, 409);
  }, 120_000);

  it('p3 · RECOVERY: the review resolves the drift breach; the authority raised above the funded sum resolves the budget breach at the next tick; the dependency retired by a stated move resolves the infeasibility; a lost objective linkage opens and resolves with the objective\'s status; the held commitment then commits', async () => {
    expect((await review(lead, 'the Q1 review held; the plan stands (B36 harness)')).review).toMatchObject({ drift_breaches_resolved: 1 });
    await setAuthority(w.executive, '950000.00', 'the envelope restored after the board review (B36 harness)');
    await sql`update executive.initiative_dependencies set state = 'retired', retired_by = ${lead.principalId}::uuid, retired_at = clock_timestamp() where dependency_id = ${DEP_AB}::uuid`.execute(su); // stated: no retire port in this batch
    // stated superuser move: OBJ2 closed in the projection (the graph's own closure is 0089's; the tick reads the status)
    await sql`update graph.strategy_current set status = 'closed' where strategy_object_id = ${OBJ2}::uuid`.execute(su);
    await tick(3);
    let bs = await breaches();
    expect(bs.filter((b) => b['state'] === 'resolved').map((b) => b['kind']).sort()).toEqual(['budget_over_authority', 'drift_without_review', 'infeasible']);
    const lost = bs.filter((b) => b['kind'] === 'lost_linkage' && b['state'] === 'open');
    expect(lost.every((b) => String(b['cause_key']).startsWith(`${OBJ2}:`))).toBe(true); // one breach per objective and initiative, each with its own forecast impact
    expect(lost.map((b) => b['initiative_id']).sort()).toEqual([INI_A, INI_D, INI_E].sort()); // INI_B is on the other objective; INI_C is closed
    await sql`update graph.strategy_current set status = 'active' where strategy_object_id = ${OBJ2}::uuid`.execute(su);
    await tick(4);
    bs = await breaches();
    expect(bs.filter((b) => b['state'] === 'open')).toEqual([]);
    const p = await c.proposed();
    await cite(w.owner, p.pkg, INI_D);
    await c.approve(p.pkg, p.v, { decision: 'approve', versionDigest: p.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, w.approver);
    expect((await c.commit(p.pkg, p.v, p.digest, w.authority)).commitment.commitmentId).toBeTruthy();
    // the replay keeps the breach history as it stood
    const now = (await asOf(auditor, null)).replay;
    expect((now['breaches'] as Row[]).every((b) => b['state'] === 'resolved')).toBe(true);
  }, 120_000);
});

describe('B36 §P · p4 the WORKSPACE reads and the SCENARIO SENSITIVITY', () => {
  it('p4 · POSITIVE: the sensitivity of the plan under the control run names the run\'s outputs digest and marks the Q2 milestone at risk (its value at the date, the signed variance), the share milestone unmapped (no run key); the auditor and the board read; the view carries the signatures', async () => {
    const s = (await sensitivity(auditor, w.controlId)).sensitivity;
    const run = (await rows(sql`select outputs_digest, model_ref from simulation.runs_current where run_id = ${w.controlId}::uuid`))[0]!;
    expect(s).toMatchObject({ available: true, plan_id: PLAN, run_id: w.controlId, outputs_digest: run['outputs_digest'], model_ref: 'supply-flow@1', attached: true });
    const ms = s['milestones'] as Row[];
    const q2 = ms.find((m) => m['milestone_id'] === MS_Q2)!;
    expect(q2).toMatchObject({ status: 'at_risk', quantity_key: 'on_hand_end', target_value: 100000, direction: 'higher_better' });
    expect(q2['value_date']).toBe('2024-03-01');
    expect(Number(q2['value'])).toBeLessThan(100000);
    expect(Number(q2['variance'])).toBeLessThan(0);
    expect(ms.find((m) => m['milestone_id'] === MS_DUE)).toMatchObject({ status: 'unmapped', quantity_key: null });
    expect(String((s['summary'] as Row)['line'])).toMatch(/^\d+ at risk · \d+ on track · \d+ unmapped · \d+ without a value/);
    const board = await h.humanWithSession(['board_member'], 'b36p-board');
    expect((await getPlan(board)).plan['plan_id']).toBe(PLAN);
    const operator = await h.humanWithSession(['executive_operator'], 'b36p-operator');
    expect((await sensitivity(operator, w.controlId)).sensitivity['available']).toBe(true);
  }, 60_000);

  it('p4 · REFUSAL: an unknown run answers `available false` with its reason (never a guess); an unknown plan is 404; an outsider holds no read (403); the Planning Agent reads but cannot acknowledge (403)', async () => {
    const s = (await sensitivity(lead, uuidv7())).sensitivity;
    expect(s).toMatchObject({ available: false, reason: 'no such completed run in this domain' });
    await refused(getPlan(lead, uuidv7()), /^plan rejected \(unknown_plan\)/, 404);
    expect((await refusal(getPlan(outsider))).status).toBe(403);
    expect((await getPlan(agent)).plan['plan_id']).toBe(PLAN);
    expect((await refusal(acknowledge(agent, BREACH_BUDGET, 'an agent acknowledging'))).status).toBe(403);
  });

  it('p4 · RECOVERY: binding the share measure to a run key maps it (no_value: the run carries no such column) and re-binding the stock key keeps the at-risk reading; the sensitivity recorded nothing', async () => {
    const before = (await rows(sql`select count(*)::int n from executive.plan_events where plan_id = ${PLAN}::uuid`))[0]!['n'];
    await sensitivity(lead, w.controlId);
    expect((await rows(sql`select count(*)::int n from executive.plan_events where plan_id = ${PLAN}::uuid`))[0]!['n']).toBe(before);
    await bindMeasure(lead, MSR_SHARE, 'second_source_share');
    const s = (await sensitivity(lead, w.controlId)).sensitivity;
    const ms = s['milestones'] as Row[];
    expect(ms.find((m) => m['milestone_id'] === MS_DUE)).toMatchObject({ status: 'no_value', quantity_key: 'second_source_share' });
    expect(ms.find((m) => m['milestone_id'] === MS_Q2)).toMatchObject({ status: 'at_risk' });
    const v = (await getPlan(lead)).plan;
    expect((v['measures'] as Row[]).find((m) => m['measure_id'] === MSR_SHARE)).toMatchObject({ quantity_key: 'second_source_share' });
  });
});
