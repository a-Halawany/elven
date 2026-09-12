/**
 * The residual paths of the independent review of PR #46 at 07edd9dc (R3–R7 in their second
 * form), reproduced through the real database, controller, identity path and Redis harness
 * BEFORE being corrected, and kept as the regression afterwards. Each `it` states the corrected
 * expectation; against the reviewed head the failures ARE the reproductions (PHASE6_REPORT.md
 * §13), and a case that passes before any change is a refutation at the boundary, recorded.
 *
 *  R7  the reporting agent's nested renderer is metered: no query family starts after the
 *      elapsed deadline; the in-budget report still renders.
 *  R6  an aggregate over a SUPERSET of the criterion's period is not that outcome: the observed
 *      period matches the interval the choice binds.
 *  R4  the reader boundary applies to every outward response: a composition's response, an
 *      operator's trigger response, and stored agent outputs under the admitted purpose.
 *  R3  a reconciliation shown in the observed layer contributes the restrictions of both its
 *      sides and their cited evidence; a reader whose clearance does not cover them is refused.
 *  R5  a source's rights at the cut-off come from the recorded rights events, not from the
 *      current projection: a later withdrawal leaves the earlier briefing's digest alone and is
 *      enforced NOW on availability.
 *
 * The order of the blocks is deliberate: the restricted evidence R4 and R3 need enters the domain
 * after R7 and R6, and the rights withdrawal of R5 suspends the fixture source last.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let admin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const DIGEST = 'd'.repeat(64);
const dbNow = async (): Promise<string> => String((await sql<{ t: string }>`select decision.iso(clock_timestamp()) t`.execute(h.su)).rows[0]?.t);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const budgets = (over: Record<string, unknown> = {}) => ({ max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000, ...over });
const RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
const objectRow = async (id: string) => (await sql<Record<string, unknown>>`select object_type, classification, rights_profile, synthetic_state, purpose_scope from objects.canonical_objects where object_id = ${id}::uuid order by object_version desc limit 1`.execute(h.su)).rows[0] as Record<string, unknown>;
const agentBase = () => ({ version: '1.0.0', codeDigest: DIGEST, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId });
/** The serialised text of a response, to assert that a refusal or a withholding discloses no restricted value. */
const text = (x: unknown): string => JSON.stringify(x);
const KEY = 'outcome.line_stop_days:SYN-LINE-A1';
const ground = (twinId: string, version: number, elements: unknown[]) => w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(version), { payload: { elements } });
const admit = (twinId: string, version: number) => w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(version), { payload: {} });
const openV = async (twinId: string, over: Record<string, unknown>) => ((await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-04-10', ...over } })) as { version: { version: number } }).version.version;
const observed = (key: string, value: number, unit: string, evd: { id: string; version: number; locator: string; field: string }, validFrom: string, validTo: string) =>
  ({ key, kind: 'observed', value, unit, validFrom, validTo, citations: [{ kind: 'evidence', id: evd.id, version: evd.version }], record: { locator: evd.locator, field: evd.field } });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  // the tenant administrator (restricted clearance, from the TENANT binding) also holds the domain's executive role, so it may compose: the covering composer of the positive controls
  admin = await h.humanWithSession(['tenant_admin'], 'tenant-admin', 'TENANT', { extraBindings: [{ roleCode: 'executive', domainId: h.fx.domainId }] });
  analyst = await h.humanWithSession(['domain_analyst'], 'analyst');
}, 300_000);

afterAll(async () => {
  try { await h.app.get(SchedulerService).obliterateBriefingsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R7 · the reporting agent\'s nested renderer is metered', () => {
  let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  beforeAll(async () => { P = await c.committed(); }, 120_000);

  it('no query family of the report starts after the elapsed deadline: the run stops, records and escalates with no report; the in-budget report still renders', async () => {
    // A 1 ms budget: the outer reservation passes at the meter's first instant; everything the renderer does afterwards
    // lies beyond the deadline. When the outer meter itself refuses (the millisecond turned first), the run is repeated:
    // that refusal is the guard already in place, not the path under review.
    const slow = (await c.registerAgent({ kind: 'reporting', ...agentBase(), budgets: budgets({ max_elapsed_ms: 1 }) }, admin)).agent;
    let r: Awaited<ReturnType<typeof c.runAgent>>['run'] | null = null;
    for (let i = 0; i < 8; i += 1) {
      r = (await c.runAgent(slow.agentId, { task: 'report', packageId: P.pkg })).run;
      if (!(r.outcome === 'stopped' && /before the package and its records/.test(String(r.stopReason)))) break;
    }
    expect(r).not.toBeNull();
    const run = r as NonNullable<typeof r>;
    expect(run.outcome).toBe('stopped');
    expect(String(run.stopReason)).toMatch(/elapsed/);
    expect(run.outputs['report']).toBeUndefined();
    expect(run.escalatedTo).toBe(w.executive.principalId);
    // the positive control: a budget that admits the whole render
    const fine = (await c.registerAgent({ kind: 'reporting', ...agentBase(), budgets: budgets() }, admin)).agent;
    const ok = (await c.runAgent(fine.agentId, { task: 'report', packageId: P.pkg })).run;
    expect(ok.outcome).toBe('finished');
    expect((ok.outputs['report'] as Record<string, unknown>)['marked']).toBe('agent-produced');
    // every query family of the render is a metered read (the package, its purpose, the version, the options, the dissent, the approvals, the decision)
    expect(Number(ok.spent['reads'])).toBeGreaterThanOrEqual(2);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R6 · the observed period is the criterion\'s interval, not a superset of it', () => {
  const COST_KEY = 'outcome.monthly_cost:SYN-LINE-A1';
  const criterion = (over: Record<string, unknown> = {}) => ({ key: 'monthly_cost', quantity: 'the line\'s cost over the month', unit: 'EUR', target: 100, comparator: '<=', by: '2024-04-10', observed_on: `twin:${COST_KEY}`, twin_id: w.twinId, period: { from: '2024-03-11', to: '2024-04-10' }, ...over });
  const allUnsimulated = async (choiceOver: Record<string, unknown>) => {
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Draw down the buffer', statement: 'whether to draw down the safety stock', owner: w.owner.principalId });
    const pkg = d.package.packageId; const v = (await c.open(pkg)).version.version;
    await c.option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', unsimulatedReason: 'the status quo is not simulated for this decision', consequences: [{ kind: 'evidence', id: w.evd.id, version: w.evd.version }] });
    await c.option(pkg, v, { key: 'drawdown', title: 'Draw down the buffer', kind: 'intervention', unsimulatedReason: 'the drawdown is a stock decision the model does not simulate', consequences: [{ kind: 'evidence', id: w.evd.id, version: w.evd.version }] });
    await c.terms(pkg, v, c.validTerms());
    await c.choice(pkg, v, c.validChoice({ option_key: 'drawdown', rationale: 'The drawdown keeps the line running without the reroute premium.', ...choiceOver }));
    const pr = await c.propose(pkg, v);
    await c.approve(pkg, v, { decision: 'approve', versionDigest: pr.proposal.versionDigest, rationale: 'The drawdown is the cheaper of the two.' }, w.approver);
    await c.commit(pkg, v, pr.proposal.versionDigest, w.authority);
    return pkg;
  };

  it('a quarter total covering the month is refused as the month\'s outcome; the month\'s own aggregate records', async () => {
    const pkg = await allUnsimulated({ outcome_criteria: [criterion()] });
    await sleep(30);
    const up = await h.upload([
      { filename: 'cost-2024Q1.csv', text: 'synthetic,record_id,line_id,monthly_cost\ntrue,SYN-COST-Q1,SYN-LINE-A1,150\n', documentTime: '2024-04-10T00:00:00Z' },
      { filename: 'cost-2024-03.csv', text: 'synthetic,record_id,line_id,monthly_cost\ntrue,SYN-COST-M3,SYN-LINE-A1,50\n', documentTime: '2024-04-10T00:00:00Z' },
    ]);
    const q1 = { ...(up[0] as { id: string; version: number }), locator: 'SYN-COST-Q1', field: 'monthly_cost' };
    const m3 = { ...(up[1] as { id: string; version: number }), locator: 'SYN-COST-M3', field: 'monthly_cost' };
    const vQuarter = await openV(w.twinId, { carryFrom: w.v1 });
    await ground(w.twinId, vQuarter, [observed(COST_KEY, 150, 'EUR', q1, '2024-01-11', '2024-04-10')]);
    await admit(w.twinId, vQuarter);
    const vMonth = await openV(w.twinId, { carryFrom: vQuarter, except: [COST_KEY] });
    await ground(w.twinId, vMonth, [observed(COST_KEY, 50, 'EUR', m3, '2024-03-11', '2024-04-10')]);
    await admit(w.twinId, vMonth);
    // the superset: the quarter's 150 covers March but is not March's cost — refused, and no OUT recorded
    const refused = await message(c.outcome(pkg, { criterionKey: 'monthly_cost', twinId: w.twinId, twinVersion: vQuarter, elementKey: COST_KEY }));
    expect(refused).toMatch(/period/);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.outcomes where package_id = ${pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
    // the positive control: the month's own aggregate
    const ok = (await c.outcome(pkg, { criterionKey: 'monthly_cost', twinId: w.twinId, twinVersion: vMonth, elementKey: COST_KEY })).outcome;
    expect(Number(ok.observedValue)).toBe(50);
    expect(ok.met).toBe(true);
  }, 180_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R4 · the reader boundary applies to every outward response', () => {
  let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  let roomId = ''; let restrictedPkg = ''; let restrictedRoom = ''; let restrictedEvd: { id: string; version: number };
  let owner2: AuthenticatedPrincipal;
  beforeAll(async () => {
    P = await c.committed();
    roomId = (await c.openRoom({ packageId: P.pkg, title: 'Response room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    owner2 = await h.humanWithSession(['decision_owner'], 'second-owner');
    // restricted evidence enters the domain here (an upload under a restricted ceiling): every composition from now on folds to restricted
    restrictedEvd = (await h.upload([{ filename: 'restricted-terms.csv', text: 'synthetic,record_id,note\ntrue,SYN-RESTRICTED-1,board-only terms\n', documentTime: '2024-01-16T00:00:00Z' }], 'restricted'))[0] as { id: string; version: number };
    expect((await objectRow(restrictedEvd.id))['classification']).toBe('restricted');
    // a restricted package (cites the restricted evidence) with a room of its own
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: w.owner.principalId });
    restrictedPkg = d.package.packageId; const v = (await c.open(restrictedPkg)).version.version;
    await c.option(restrictedPkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    await c.option(restrictedPkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: restrictedEvd.id, version: restrictedEvd.version }] });
    await c.terms(restrictedPkg, v, c.validTerms()); await c.choice(restrictedPkg, v, c.validChoice());
    await c.propose(restrictedPkg, v);
    restrictedRoom = (await c.openRoom({ packageId: restrictedPkg, title: 'Restricted room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(restrictedRoom, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    await c.membership(restrictedRoom, { principal: admin.principalId, role: 'observer', op: 'add' });
  }, 180_000);

  it('R4a · a composition whose fold the composer\'s clearance does not cover is refused before admission, and discloses nothing; a covering member composes it', async () => {
    const before = Number((await sql<{ n: string }>`select count(*)::text n from executive.briefings where room_id = ${roomId}::uuid`.execute(h.su)).rows[0]?.n);
    // the executive (confidential in this domain) is a member and may compose; the fold is restricted (the restricted evidence is in the window)
    const refusal = c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: null }, w.executive);
    expect(await status(refusal)).toBe(403);
    const reason = await message(refusal);
    expect(reason).toMatch(/clearance|restricted/);
    expect(reason).not.toContain('board-only');
    expect(Number((await sql<{ n: string }>`select count(*)::text n from executive.briefings where room_id = ${roomId}::uuid`.execute(h.su)).rows[0]?.n)).toBe(before);
    // the positive control: a member whose clearance covers the fold (the tenant administrator: restricted)
    await c.membership(roomId, { principal: admin.principalId, role: 'observer', op: 'add' });
    const ok = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: null }, admin)).briefing;
    expect(ok.items.some((i) => i['id'] === restrictedEvd.id)).toBe(true);
    expect((await objectRow(ok.briefingId))['classification']).toBe('restricted');
    // and the stored snapshot is read by the same rule
    expect(await status(c.getBriefing(ok.briefingId, w.executive))).toBe(403);
    expect(await status(c.getBriefing(ok.briefingId, admin))).toBe('ok');
  }, 120_000);

  it('R4b · a stored agent report is read under the purpose it was rendered for: the wrong purpose sees it withheld; provenance is stored with the output', async () => {
    const reporter = (await c.registerAgent({ kind: 'reporting', ...agentBase(), budgets: budgets() }, admin)).agent;
    const run = (await c.runAgent(reporter.agentId, { task: 'report', packageId: P.pkg })).run;
    expect(run.outcome).toBe('finished');
    const list = (as: AuthenticatedPrincipal, purpose: string) => w.exec.listAgents(h.req(as, 'agent.read', 'AGT', null, purpose), T(), D()) as Promise<{ runs: Array<Record<string, unknown>> }>;
    const asResearch = (await list(w.executive, 'research')).runs.find((r) => r['run_id'] === run.runId) as Record<string, unknown>;
    expect(asResearch).toBeDefined();
    expect((asResearch['outputs'] as Record<string, unknown>)['report']).toBeUndefined();
    expect(String((asResearch['outputs'] as Record<string, unknown>)['withheld'])).toMatch(/purpose/);
    const asDecision = (await list(w.executive, 'decision')).runs.find((r) => r['run_id'] === run.runId) as Record<string, unknown>;
    expect((asDecision['outputs'] as Record<string, unknown>)['report']).toBeDefined();
    // the stored output carries what its authority is checked against
    const stored = (await sql<{ o: Record<string, unknown> }>`select outputs o from executive.agent_runs where run_id = ${run.runId}::uuid`.execute(h.su)).rows[0]?.o as Record<string, unknown>;
    const prov = stored['provenance'] as Record<string, unknown>;
    expect(prov).toBeDefined();
    expect(prov['purpose']).toBe('decision');
    expect(prov['package_id']).toBe(P.pkg);
    expect(typeof prov['classification']).toBe('string');
  }, 120_000);

  it('R4c · an operator\'s trigger returns the run\'s metadata, not what the operator may not read: a restricted report is withheld from a confidential executive; a non-member sees a room\'s report withheld; a covering member receives it', async () => {
    const reporter = (await c.registerAgent({ kind: 'reporting', ...agentBase(), budgets: budgets({ clearance: 'restricted' }) }, admin)).agent;
    // the direct report of the restricted package refuses the executive
    expect(await status(c.report(restrictedPkg, w.executive))).toBe(403);
    // the executive triggers the agent, whose clearance covers restricted work: the agent finishes; the executive does not receive the report
    const r = (await c.runAgent(reporter.agentId, { task: 'report', packageId: restrictedPkg }, w.executive)).run;
    expect(r.outcome).toBe('finished');
    expect(r.outputs['report']).toBeUndefined();
    expect(String(r.outputs['withheld'])).toMatch(/clearance|restricted/);
    expect(text(r)).not.toContain('board-only');
    expect(text(r)).not.toContain('Reroute via the Cape');
    // the stored run holds the report for those who may read it
    const stored = (await sql<{ o: Record<string, unknown> }>`select outputs o from executive.agent_runs where run_id = ${r.runId}::uuid`.execute(h.su)).rows[0]?.o as Record<string, unknown>;
    expect(stored['report']).toBeDefined();
    // membership: a second owner (not a member of the room) triggers a report of the internal package — withheld for membership
    const r2 = (await c.runAgent(reporter.agentId, { task: 'report', packageId: P.pkg }, owner2)).run;
    expect(r2.outcome).toBe('finished');
    expect(r2.outputs['report']).toBeUndefined();
    expect(String(r2.outputs['withheld'])).toMatch(/member/);
    // the positive controls: a member whose clearance covers the fold receives the report from the trigger response
    const r3 = (await c.runAgent(reporter.agentId, { task: 'report', packageId: restrictedPkg }, admin)).run;
    expect(r3.outcome).toBe('finished');
    expect((r3.outputs['report'] as Record<string, unknown>)['marked']).toBe('agent-produced');
    const r4 = (await c.runAgent(reporter.agentId, { task: 'report', packageId: P.pkg }, w.executive)).run;
    expect((r4.outputs['report'] as Record<string, unknown>)['marked']).toBe('agent-produced');
  }, 180_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R3 · a reconciliation in the observed layer contributes the restrictions of both its sides', () => {
  let R: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  let vSim = 0; let vObs = 0; let reconciliationId = '';
  beforeAll(async () => {
    // the decision: internal (the chosen run reroute, internal evidence); committed BEFORE the observation exists
    R = await c.committed();
    await sleep(30);
    const run = (await sql<{ o: Record<string, unknown> }>`select outputs o from simulation.runs_current where run_id = ${w.rerouteId}::uuid`.execute(h.su)).rows[0]?.o as Record<string, unknown>;
    const simulated = Number((run['totals'] as Record<string, unknown>)['line_stop_days']);
    vSim = await openV(w.twinId, { carryFrom: w.v1, observedThrough: '2024-01-17' });
    await ground(w.twinId, vSim, [{ key: KEY, kind: 'simulated', value: simulated, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'run', id: w.rerouteId, version: 1 }] }]);
    await admit(w.twinId, vSim);
    // the later observation: RESTRICTED evidence (the plant's board-only outcome record) grounds the observed element
    const evd = { ...(await h.upload([{ filename: 'outcomes-board.csv', text: 'synthetic,record_id,line_id,line_stop_days\ntrue,SYN-BOARD-Q1,SYN-LINE-A1,2\n', documentTime: '2024-04-10T00:00:00Z' }], 'restricted'))[0] as { id: string; version: number }, locator: 'SYN-BOARD-Q1', field: 'line_stop_days' };
    expect((await objectRow(evd.id))['classification']).toBe('restricted');
    vObs = await openV(w.twinId, { carryFrom: vSim, except: [KEY] });
    await ground(w.twinId, vObs, [observed(KEY, 2, 'days', evd, '2024-01-11', '2024-04-10')]);
    await admit(w.twinId, vObs);
    expect((await sql<{ c: string }>`select classification c from objects.canonical_objects where object_type = 'TWN' and object_id = ${w.twinId}::uuid and object_version = ${String(vObs)}`.execute(h.su)).rows[0]?.c).toBe('restricted');
    await w.twins.reconcile(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { key: KEY, fromVersion: vSim, againstVersion: vObs, note: 'the chosen run against the board\'s figure' } });
    reconciliationId = String((await sql<{ id: string }>`select reconciliation_id::text id from twin.reconciliations where twin_id = ${w.twinId}::uuid and key = ${KEY} and from_version = ${vSim} and against_version = ${vObs} order by recorded_at desc limit 1`.execute(h.su)).rows[0]?.id);
    expect(reconciliationId).toMatch(/^[0-9a-f-]{36}$/);
    await sleep(30);
  }, 240_000);

  it('a reader whose clearance does not cover the observation is refused the replay that would show its reconciliation; nothing is admitted', async () => {
    const before = Number((await sql<{ n: string }>`select count(*)::text n from decision.replays where package_id = ${R.pkg}::uuid`.execute(h.su)).rows[0]?.n);
    for (const reader of [analyst, w.executive]) {
      const attempt = c.replay(R.pkg, R.v, {}, reader);
      expect(await status(attempt), `reader ${reader.principalId}`).toBe(403);
      expect(await message(attempt)).toMatch(/clearance|restricted/);
    }
    expect(Number((await sql<{ n: string }>`select count(*)::text n from decision.replays where package_id = ${R.pkg}::uuid`.execute(h.su)).rows[0]?.n)).toBe(before);
  }, 120_000);

  it('a covering reader sees the reconciliation, both sides and the cited evidence are named contributors, and the RPL folds to restricted', async () => {
    const r = (await c.replay(R.pkg, R.v, {}, admin)).replay as Record<string, unknown> & { replayId: string; layers: Record<string, Record<string, Array<Record<string, unknown>>>> };
    const recs = r.layers['observed']?.['reconciliations'] ?? [];
    expect(recs.map((x) => x['reconciliation_id'])).toContain(reconciliationId);
    const contributors = r['contributors'] as Array<Record<string, unknown>>;
    const twinSides = contributors.filter((k) => k['object_type'] === 'TWN' && k['id'] === w.twinId).map((k) => Number(k['version']));
    expect(twinSides).toContain(vObs);
    expect(twinSides).toContain(vSim);
    expect(contributors.some((k) => k['object_type'] === 'EVD' && k['classification'] === 'restricted')).toBe(true);
    expect(contributors.every((k) => k['unresolved'] !== true)).toBe(true);
    expect((await objectRow(r.replayId))['classification']).toBe('restricted');
    expect(RANK[String((r['controls'] as Record<string, unknown>)['classification'])]).toBe(RANK['restricted']);
  }, 120_000);

  it('an as_of before the reconciliation shows none of it and folds no restriction from it', async () => {
    // the instant before the reconciliation was recorded (after the decision)
    const justBefore = String((await sql<{ t: string }>`select decision.iso(recorded_at - interval '1 millisecond') t from twin.reconciliations where reconciliation_id = ${reconciliationId}::uuid`.execute(h.su)).rows[0]?.t);
    const r = (await c.replay(R.pkg, R.v, { asOf: justBefore }, w.executive)).replay as Record<string, unknown> & { replayId: string; layers: Record<string, Record<string, unknown[]>> };
    expect((r.layers['observed']?.['reconciliations'] ?? []).length).toBe(0);
    expect(RANK[String((await objectRow(r.replayId))['classification'])]).toBeLessThan(RANK['restricted']);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R5 · a source\'s rights at the cut-off come from the recorded rights events', () => {
  let roomId = ''; let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  let observation: ObservationController; let firstBriefingId = '';
  const setRights = (rightsState: string, evidence: string) => observation.setRights(h.req(h.manager, 'observation.source.rights', 'SRC', h.fx.sourceId, 'observation'), T(), D(), h.fx.sourceId, { payload: { contractVersion: h.version, rightsState, evidence } });
  beforeAll(async () => {
    const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
    observation = h.app.get(Oc);
    P = await c.committed();
    roomId = (await c.openRoom({ packageId: P.pkg, title: 'Rights room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: admin.principalId, role: 'observer', op: 'add' });
  }, 120_000);

  it('a withdrawal after the cut-off leaves the earlier briefing\'s source state and digest alone; the briefing composed now shows the withdrawal; a later confirmation rewrites neither', async () => {
    const k1 = await dbNow();
    const a = (await c.compose({ roomId, knownAt: k1, priorBriefingId: null }, admin)).briefing;
    firstBriefingId = a.briefingId;
    const stateAt = (b: typeof a) => b.sourceStates.find((s) => s['source_id'] === h.fx.sourceId) as Record<string, unknown>;
    expect(stateAt(a)['state']).toBe('live');
    await sleep(30);
    expect(await status(setRights('withdrawn', 'the publisher withdrew reuse on 20 January (fixture)'))).toBe('ok');
    await sleep(30);
    const b = (await c.compose({ roomId, knownAt: k1, priorBriefingId: null }, admin)).briefing;
    expect(stateAt(b)['state']).toBe('live');
    expect(b.contentDigest).toBe(a.contentDigest);
    // NOW: the withdrawal is represented, and enforced on the stored snapshot's availability
    const now = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: null }, admin)).briefing;
    const s = now.sourceStates.find((x) => x['source_id'] === h.fx.sourceId) as Record<string, unknown> | undefined;
    if (s !== undefined) { expect(s['state']).toBe('blocked'); expect(String(s['reason'])).toMatch(/withdrawn/); }
    const stored = (await c.getBriefing(a.briefingId, admin)).briefing as Record<string, unknown> & { availability: { unavailable: Array<Record<string, unknown>> } };
    expect(stored.availability.unavailable.some((u) => u['kind'] === 'source' && u['id'] === h.fx.sourceId && /withdrawn/.test(String(u['reason'])))).toBe(true);
    // a confirmation afterwards restores nothing retroactively
    await sleep(30);
    expect(await status(setRights('confirmed', 'the publisher confirmed reuse again (fixture)'))).toBe('ok');
    await sleep(30);
    const d = (await c.compose({ roomId, knownAt: k1, priorBriefingId: null }, admin)).briefing;
    expect(d.contentDigest).toBe(a.contentDigest);
  }, 120_000);

  it('a withdrawal inside the interval is represented there: the briefing since the prior shows the source it rested on blocked as of the later cut-off', async () => {
    await sleep(30);
    expect(await status(setRights('withdrawn', 'withdrawn again (fixture)'))).toBe('ok');
    await sleep(30);
    const k2 = await dbNow();
    await sleep(30);
    expect(await status(setRights('confirmed', 'confirmed again (fixture)'))).toBe('ok');
    await sleep(30);
    // the interval (k1, k2]: the source was active at the prior's cut-off and suspended by the withdrawal before k2 — it is listed, blocked, with the withdrawal named
    const atK2 = (await c.compose({ roomId, knownAt: k2, priorBriefingId: firstBriefingId }, admin)).briefing;
    const s = atK2.sourceStates.find((x) => x['source_id'] === h.fx.sourceId) as Record<string, unknown> | undefined;
    expect(s).toBeDefined();
    expect(s?.['state']).toBe('blocked');
    expect(String(s?.['reason'])).toMatch(/withdrawn/);
    expect(s?.['rights_state']).toBe('withdrawn');
    // the confirmation after k2 does not reach back: the same composition again carries the same digest
    const again = (await c.compose({ roomId, knownAt: k2, priorBriefingId: firstBriefingId }, admin)).briefing;
    expect(again.contentDigest).toBe(atK2.contentDigest);
  }, 120_000);
});
