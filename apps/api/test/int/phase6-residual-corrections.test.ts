/**
 * The six residual paths of the independent correction review of PR #46 at 9aaf0311,
 * reproduced through the real database, controller, identity path and Redis harness BEFORE
 * being corrected, and kept as the regression afterwards. Each `it` states the corrected
 * expectation; against the reviewed head the failures ARE the reproductions (PHASE6_REPORT.md
 * §12), and a case that passes before any change is a refutation at the boundary, recorded.
 *
 *  R2  CARRIED OPTIONS — a carry-forward into a version with earlier record/world cut-offs
 *      revalidates every copied citation (and the proposal does again).
 *  R3  INHERITED RESTRICTIONS — an older warning whose response window is still open
 *      contributes its controls and is a cited source; the replay folds every layer's
 *      contributors, observed ones included.
 *  R4  READ AUTHORIZATION — clearance is evaluated against the target context (no role
 *      borrowed from another domain); lists, reports and agent outputs are governed like the
 *      detail view (clearance, purpose, membership); planner metadata is scoped; availability
 *      covers governed deletion and run/warning sources.
 *  R5  HISTORICAL TRUTH — a later contract version, a later-completed attempt and a later
 *      binding revocation do not change an earlier briefing; eligibility is reconstructed at
 *      the cut-off.
 *  R6  OUTCOME BINDING — the approved criterion binds the twin and the interval, so an
 *      all-unsimulated decision has a bound twin and a same-key observation over the wrong
 *      period is refused.
 *  R7  AGENT LIMITS — reads are reserved before each unit of composition work, the elapsed
 *      deadline is checked before admission, and max_items applies to the decision draft.
 *
 * Fixture setup without a governed route (a binding in another domain, an attempt row, a
 * binding's revocation) is written by the database controller and labelled where it happens.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';
import { completeElements } from './phase5-fixtures.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AgentWorkerService } from '../../src/executive/agents/agent-worker.service.js';
import type { TenancyController } from '../../src/tenancy/tenancy.controller.js';
import { COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let admin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let confidentialEvd: { id: string; version: number; classification: string };
let domainB = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const DIGEST = 'c'.repeat(64);
const dbNow = async (): Promise<string> => String((await sql<{ t: string }>`select decision.iso(clock_timestamp()) t`.execute(h.su)).rows[0]?.t);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const budgets = (over: Record<string, unknown> = {}) => ({ max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120_000, ...over });
const RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
const objectRow = async (id: string) => (await sql<Record<string, unknown>>`select object_type, classification, rights_profile, synthetic_state, purpose_scope from objects.canonical_objects where object_id = ${id}::uuid order by object_version desc limit 1`.execute(h.su)).rows[0] as Record<string, unknown>;
/** A request in another domain of the same tenant. */
const reqIn = (as: AuthenticatedPrincipal, domainId: string, action: string, objectType: string, objectId: string | null, purpose: string) =>
  ({ eyeEnvelope: { ...(h.req(as, action, objectType, objectId, purpose) as { eyeEnvelope: Record<string, unknown> }).eyeEnvelope, domain_id: domainId }, eyePrincipal: as }) as never;
/** A fresh indicator + scenario branch, NOT yet evaluated (a warning is raised once per flip; each probe needs its own). */
async function declareProbe(label: string, threshold: number): Promise<{ indicatorId: string; branchId: string }> {
  const ind = await w.prediction.defineIndicator(h.req(w.twinOwner, 'prediction.indicator.define', 'IND', null), T(), D(),
    { payload: { seriesKey: w.seriesKey, description: `${label}: transits below ${threshold} for two days`, comparator: '<', threshold, consecutiveDays: 2, owner: w.twinOwner.principalId } }) as { indicator: { indicatorId: string } };
  const scn = await w.prediction.declareScenario(h.req(w.twinOwner, 'prediction.scenario.declare', 'SCN', null), T(), D(),
    { payload: { title: `${label} scenario`, statement: 'a probe scenario', forecastId: w.forecastId, owner: w.twinOwner.principalId, reviewCadence: 'weekly',
                 branches: [
                   { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: w.twinOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                   { name: `${label} collapse`, kind: 'downside', statement: `below ${threshold}`, indicatorId: ind.indicator.indicatorId, owner: w.twinOwner.principalId, consequence: 'rebook now', responseWindowHours: 48 },
                 ] } }) as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  return { indicatorId: ind.indicator.indicatorId, branchId: scn.scenario.branches.find((b) => b.kind === 'downside')?.branchId as string };
}
async function evaluateProbe(label: string, indicatorId: string): Promise<string> {
  await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', indicatorId), T(), D(), indicatorId, { payload: { knownAt: new Date().toISOString() } });
  const wr = (await sql<{ id: string }>`select warning_id::text id from prediction.warnings_current where indicator_id = ${indicatorId}::uuid order by raised_at desc limit 1`.execute(h.su)).rows[0];
  expect(wr, `${label}: the indicator raises a warning`).toBeDefined();
  return String(wr?.id);
}
/** A warning raised on a fresh indicator + scenario branch. */
async function raiseWarning(label: string, threshold: number): Promise<{ warningId: string; indicatorId: string; branchId: string }> {
  const probe = await declareProbe(label, threshold);
  return { ...probe, warningId: await evaluateProbe(label, probe.indicatorId) };
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  admin = await h.humanWithSession(['tenant_admin'], 'tenant-admin', 'TENANT');
  analyst = await h.humanWithSession(['domain_analyst'], 'analyst');
  // a contract version whose evidence is confidential (a different window, so the bytes are new)
  const sv = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 150, controls: { classification_ceiling: 'confidential', licence: 'CC-BY-4.0' } });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  confidentialEvd = (await sql<{ id: string; version: number; classification: string }>`select object_id::text id, object_version::int version, classification
    from objects.canonical_objects where object_type = 'EVD' and provenance_ref = ${`SRC:${h.fx.sourceId}@${sv.version}`} order by recorded_at limit 1`.execute(h.su)).rows[0] as typeof confidentialEvd;
  expect(confidentialEvd?.classification).toBe('confidential');
  // a second domain of the same tenant, through the tenancy route (the tenant administrator's act)
  const { TenancyController: Tc } = await import('../../src/tenancy/tenancy.controller.js');
  const tenancy = h.app.get(Tc) as TenancyController;
  const env = { ...(h.req(admin, 'tenancy.domain.create', 'CID', null, 'platform.administration') as { eyeEnvelope: Record<string, unknown> }).eyeEnvelope, scope: 'TENANT', domain_id: null };
  const d = await tenancy.createDomain({ eyeEnvelope: env, eyePrincipal: admin } as never, T(), { payload: { name: `Residual probe domain ${uuidv7().slice(-6)}` } }) as { domain: { id: string } };
  domainB = d.domain.id;
}, 300_000);

afterAll(async () => {
  try { await h.app.get(SchedulerService).obliterateBriefingsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R2 · carried options obey the receiving version\'s cut-offs; the proposal revalidates every citation', () => {
  let pkg = ''; let evd16: { id: string; version: number };
  beforeAll(async () => {
    evd16 = (await h.upload([{ filename: 'carry-observation-16.csv', text: 'synthetic,record_id,value\ntrue,SYN-C16,1\n', documentTime: '2024-01-16T00:00:00Z' }]))[0] as { id: string; version: number };
    await sleep(30);
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: w.owner.principalId });
    pkg = d.package.packageId;
    const v1 = (await c.open(pkg, { knownAt: new Date().toISOString(), observedThrough: '2024-01-17' })).version.version;
    await c.option(pkg, v1, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    await c.option(pkg, v1, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: evd16.id, version: evd16.version }] });
    await c.terms(pkg, v1, c.validTerms());
    await c.choice(pkg, v1, c.validChoice());
    await c.propose(pkg, v1);
  }, 120_000);

  it('a carry into earlier world or record cut-offs is refused at the carry; a carry into eligible cut-offs stays valid and proposable', async () => {
    const before = (await sql<{ t: string }>`select decision.iso(recorded_at - interval '1 second') t from objects.canonical_objects where object_id = ${evd16.id}::uuid and object_version = ${evd16.version}`.execute(h.su)).rows[0]?.t as string;
    expect(await message(c.open(pkg, { knownAt: new Date().toISOString(), observedThrough: '2024-01-15', carryFrom: 1 }))).toMatch(/carried option .*observed_through|after the version's observed_through/i);
    expect(await message(c.open(pkg, { knownAt: before, observedThrough: '2024-01-17', carryFrom: 1 }))).toMatch(/carried option .*known_at|after the version's known_at/i);
    const v2 = (await c.open(pkg, { knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: 1 })).version.version;
    const carried = (await sql<{ key: string; u: Record<string, unknown> }>`select key, uncertainty u from decision.options where package_id = ${pkg}::uuid and version = ${v2} order by key`.execute(h.su)).rows;
    expect(carried.map((o) => o.key)).toEqual(['reroute', 'status-quo']);
    expect(carried.every((o) => String(o.u['method']).startsWith('derived-at-port'))).toBe(true);
    await c.choice(pkg, v2, c.validChoice({ rationale: 'The reroute still keeps the line running; the premium is acceptable.' }));
    expect(await status(c.propose(pkg, v2))).toBe('ok');
  });

  it('the proposal itself revalidates: an option row that reached a draft outside the option port is refused at the proposal', async () => {
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: w.owner.principalId });
    const p2 = d.package.packageId;
    // a draft that KNOWS less than the 16 January record (opened a second before it was recorded) while its world cut-off admits the fixture runs
    const before = (await sql<{ t: string }>`select decision.iso(recorded_at - interval '1 second') t from objects.canonical_objects where object_id = ${evd16.id}::uuid and object_version = ${evd16.version}`.execute(h.su)).rows[0]?.t as string;
    const v = (await c.open(p2, { knownAt: before, observedThrough: '2024-01-17' })).version.version;
    await c.option(p2, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    const good = (await sql<Record<string, unknown>>`select * from decision.options where package_id = ${pkg}::uuid and version = 1 and key = 'reroute'`.execute(h.su)).rows[0] as Record<string, unknown>;
    // fixture setup: the database controller copies the 16 January citation into a 15 January draft — no port would
    await sql`insert into decision.options (option_id, scope, tenant_id, domain_id, package_id, version, key, title, kind, consequences, simulated, unsimulated_reason, uncertainty, second_order, risks, opportunities, reversibility, synthetic_state, controls, set_by, correlation_id)
              values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${p2}::uuid, ${v}, 'reroute', 'Reroute via the Cape', 'intervention', ${JSON.stringify(good['consequences'])}::jsonb, true, null,
                      ${JSON.stringify(good['uncertainty'])}::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null, true, ${JSON.stringify(good['controls'])}::jsonb, ${w.owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await c.terms(p2, v, c.validTerms());
    await c.choice(p2, v, c.validChoice());
    expect(await message(c.propose(p2, v))).toMatch(/proposal rejected: option reroute.*known_at/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R3 · inherited restrictions cover carried warning windows and every replay contributor', () => {
  it('an older warning whose window is still open is a cited source of the next briefing and contributes its controls', async () => {
    const P = await c.committed();
    const roomId = (await c.openRoom({ packageId: P.pkg, title: 'Carried window room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    const wr = await raiseWarning('carried-window', 46);
    const wrn = await objectRow(wr.warningId);
    await sleep(30);
    const k0 = await dbNow();
    const prior = (await c.compose({ roomId, knownAt: k0, priorBriefingId: null })).briefing;
    expect(prior.windows.map((x) => x['id'])).toContain(wr.warningId);
    await sleep(30);
    await c.review(roomId, 'Reviewed with the warning still open.', w.executive);
    await sleep(30);
    const next = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: prior.briefingId })).briefing;
    expect(next.items.map((i) => i['id'])).not.toContain(wr.warningId);      // raised before the interval
    expect(next.windows.map((x) => x['id'])).toContain(wr.warningId);        // its window is still open
    expect(next.sources).toContain(`warning:${wr.warningId}`);
    const brf = await objectRow(next.briefingId);
    expect(RANK[String(brf['classification'])] ?? 3).toBeGreaterThanOrEqual(RANK[String(wrn['classification'])] ?? 3);
    if (wrn['synthetic_state'] === true) expect(brf['synthetic_state']).toBe(true);
    if (typeof wrn['rights_profile'] === 'string') expect(String(brf['rights_profile'])).toContain(String(wrn['rights_profile']));
  }, 120_000);

  it('the replay names every contributor with its controls — the observed layer included — and the RPL folds them', async () => {
    const probe = await declareProbe('replay-contributor', 47);      // watched by the version, not yet evaluated
    const R = await c.committed({ terms: { monitoringConditions: [{ kind: 'indicator', indicator_id: probe.indicatorId, owner: w.owner.principalId, note: 'replay probe' }, { kind: 'review', every_days: 7, owner: w.owner.principalId }] } });
    await sleep(30);
    await evaluateProbe('replay-contributor', probe.indicatorId);    // the warning is raised AFTER the decision
    await sleep(30);
    const r = (await c.replay(R.pkg, R.v, {}, w.executive)).replay as Record<string, unknown> & { replayId: string; layers: Record<string, Record<string, Array<Record<string, unknown>>>> };
    const observedWarnings = r.layers['observed']?.['warnings'] ?? [];
    expect(observedWarnings.length).toBeGreaterThanOrEqual(1);
    const contributors = r['contributors'] as Array<Record<string, unknown>>;
    expect(Array.isArray(contributors)).toBe(true);
    for (const ow of observedWarnings) {
      const k = contributors.find((x) => x['id'] === ow['warning_id']);
      expect(k, `observed warning ${String(ow['warning_id'])} is a named contributor with its controls`).toBeDefined();
      expect(typeof k?.['classification']).toBe('string');
      expect(k?.['layer']).toBe('observed');
    }
    const rpl = await objectRow(r.replayId);
    const maxRank = Math.max(...contributors.map((x) => RANK[String(x['classification'])] ?? 3));
    expect(RANK[String(rpl['classification'])] ?? 3).toBeGreaterThanOrEqual(maxRank);
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R4 · read authorization is evaluated against the target context, on every read surface', () => {
  let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  let confPkg = ''; let roomId = ''; let confRoom = ''; let briefingId = '';
  beforeAll(async () => {
    P = await c.committed();
    roomId = (await c.openRoom({ packageId: P.pkg, title: 'Authorization room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    // a confidential package (cites the confidential evidence) with a room
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: w.owner.principalId });
    confPkg = d.package.packageId; const v = (await c.open(confPkg)).version.version;
    await c.option(confPkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] });
    await c.option(confPkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: confidentialEvd.id, version: confidentialEvd.version }] });
    await c.terms(confPkg, v, c.validTerms()); await c.choice(confPkg, v, c.validChoice());
    await c.propose(confPkg, v);
    confRoom = (await c.openRoom({ packageId: confPkg, title: 'Confidential room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(confRoom, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    briefingId = (await c.compose({ roomId: confRoom, knownAt: await dbNow(), priorBriefingId: null }, w.owner)).briefing.briefingId;
    expect((await objectRow(briefingId))['classification']).toBe('confidential');
  }, 180_000);

  it('a clearance is not borrowed from another domain: an analyst of this domain who owns decisions elsewhere reads no confidential briefing here', async () => {
    // Phase 0's boundary refuses a DOMAIN principal any binding outside its home domain (partial refutation, recorded); a TENANT-scoped person
    // may hold DOMAIN bindings in several domains — that is the borrowing path
    const borrower = await h.humanWithSession([], 'borrower', 'TENANT', { extraBindings: [{ roleCode: 'domain_analyst', domainId: D() }, { roleCode: 'decision_owner', domainId: domainB }] });
    await c.membership(confRoom, { principal: borrower.principalId, role: 'observer', op: 'add' });
    const read = w.exec.getBriefing(h.req(borrower, 'briefing.read', 'BRF', briefingId, 'briefing'), T(), D(), briefingId);
    expect(await status(read)).toBe(403);
    expect(await message(read)).toMatch(/clearance/);
    // the control: an executive OF THIS DOMAIN reads it
    expect(await status(w.exec.getBriefing(h.req(w.executive, 'briefing.read', 'BRF', briefingId, 'briefing'), T(), D(), briefingId))).toBe('ok');
  });

  it('the package list is governed like the detail view: clearance and purpose', async () => {
    const listAs = (as: AuthenticatedPrincipal, purpose = 'decision') => w.decisions.list(h.req(as, 'decision.read', 'DPK', null, purpose), T(), D()) as Promise<{ packages: Array<Record<string, unknown>> }>;
    const analystList = (await listAs(analyst)).packages;
    expect(analystList.map((p) => p['package_id'])).not.toContain(confPkg);
    expect(analystList.map((p) => p['package_id'])).toContain(P.pkg);
    expect((await listAs(w.executive)).packages.map((p) => p['package_id'])).toContain(confPkg);
    // the wrong purpose lists nothing that was admitted for another
    expect((await listAs(w.executive, 'research')).packages.map((p) => p['package_id'])).not.toContain(P.pkg);
  });

  it('a report is rendered under the package\'s admitted purpose by a member of its room; a non-member and the wrong purpose are refused', async () => {
    const report = (as: AuthenticatedPrincipal, purpose: string) => w.exec.report(h.req(as, 'report.render', 'DPK', P.pkg, purpose), T(), D(), P.pkg);
    expect(await status(report(w.executive, 'decision'))).toBe('ok');
    expect(await status(report(w.executive, 'research'))).toBe(403);
    expect(await message(report(w.executive, 'research'))).toMatch(/purpose/);
    expect(await status(report(w.authority, 'decision'))).toBe(403);       // not a member of the room
    expect(await message(report(w.authority, 'decision'))).toMatch(/member/);
  });

  it('stored agent outputs are read by the run\'s room members; a same-domain executive outside the room sees them withheld', async () => {
    const briefingAgent = (await c.registerAgent({ kind: 'briefing', version: '1.0.0', codeDigest: DIGEST, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId, budgets: budgets() }, admin)).agent;
    const run = (await c.runAgent(briefingAgent.agentId, { task: 'briefing', roomId })).run;
    expect(run.outcome).toBe('finished');
    const outsider = await h.humanWithSession(['executive'], 'outside-executive');
    const listed = (await c.listAgents(outsider, 'briefing')).runs.find((r) => r['run_id'] === run.runId) as Record<string, unknown>;
    expect(listed).toBeDefined();
    expect((listed['outputs'] as Record<string, unknown>)['withheld']).toBeDefined();
    const member = (await c.listAgents(w.executive, 'briefing')).runs.find((r) => r['run_id'] === run.runId) as Record<string, unknown>;
    expect((member['outputs'] as Record<string, unknown>)['briefing_id']).toBeDefined();
  }, 120_000);

  it('planner metadata is scoped: a reader in another domain of the tenant sees none of this domain\'s reconciliation or runs', async () => {
    const worker = h.app.get(AgentWorkerService); const scheduler = h.app.get(SchedulerService);
    const r = await worker.reconcile('scoping probe');
    expect(r.scheduled.map((s) => s.roomId)).toContain(roomId);
    await scheduler.promoteDelayedBriefingsForTests(T(), D());
    for (let i = 0; i < 60 && worker.recentRuns().length === 0; i += 1) await sleep(500);
    for (const s of r.scheduled) await scheduler.unscheduleBriefing(T(), D(), s.roomId);
    const executiveB = await h.humanWithSession(['executive'], 'executive-b', 'DOMAIN', { domainId: domainB });
    const inB = await w.exec.listAgents(reqIn(executiveB, domainB, 'agent.read', 'AGT', null, 'decision'), T(), domainB) as { agents: unknown[]; planner: { reconciliation: { scheduled: unknown[] } | null; recent_runs: unknown[] } };
    expect(inB.agents).toEqual([]);
    expect(inB.planner.recent_runs).toEqual([]);
    expect(inB.planner.reconciliation?.scheduled ?? []).toEqual([]);
    const inA = await c.listAgents(w.executive) as unknown as { planner: { reconciliation: { scheduled: Array<{ roomId: string }> }; recent_runs: unknown[] } };
    expect(inA.planner.reconciliation.scheduled.map((s) => s.roomId)).toContain(roomId);
  }, 90_000);

  it('availability now covers governed blob deletion and run and warning sources, apart from the historical content', async () => {
    const b = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: null })).briefing;
    const cited = b.sources.filter((s) => /^evidence:/.test(s)).map((s) => s.slice('evidence:'.length).split('@')[0] as string);
    const target = (await sql<{ id: string; manifest: string }>`select object_id::text id, payload ->> 'manifest_id' manifest from objects.canonical_objects
      where object_type = 'EVD' and object_id in (${sql.join(cited.map((x) => sql`${x}::uuid`))}) and payload ->> 'manifest_id' is not null order by recorded_at limit 1`.execute(h.su)).rows[0];
    expect(target, 'a cited evidence object with a blob manifest').toBeDefined();
    // the governed deletion: the tombstone port under the manager's bound context (the sweeper's own action)
    await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T(), domainId: D() }, 'observation.sweeper.reconcile', String(target?.id),
      async (tx) => { await sql`select observation.tombstone_blob(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${String(target?.manifest)}::uuid, 'residual probe: governed deletion', ${uuidv7()}::uuid)`.execute(tx as never); });
    const g = (await c.getBriefing(b.briefingId, w.executive)).briefing;
    expect(g['content_digest']).toBe(b.contentDigest);
    const unavailable = (g['availability'] as Record<string, unknown>)['unavailable'] as Array<Record<string, unknown>>;
    expect(unavailable.find((u) => u['id'] === target?.id)?.['reason']).toBe('governed-deleted');
    // run and warning sources are checked too: every cited run and warning is either readable or listed
    const checked = (g['availability'] as Record<string, unknown>)['checked'] as Record<string, number>;
    expect(checked['runs']).toBeGreaterThanOrEqual(1);
    expect(typeof checked['warnings']).toBe('number');
  }, 120_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R5 · a fixed cut-off holds against later contract versions, attempt completions and binding revocations', () => {
  let roomId = ''; let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  beforeAll(async () => {
    P = await c.committed();
    roomId = (await c.openRoom({ packageId: P.pkg, title: 'History room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
  }, 120_000);

  it('a contract version registered later does not change the earlier briefing; the later briefing sees it', async () => {
    const k = await dbNow();
    const a = (await c.compose({ roomId, knownAt: k, priorBriefingId: null })).briefing;
    const before = a.sourceStates.find((s) => s['source_id'] === h.fx.sourceId) as Record<string, unknown>;
    await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 120 });     // supersedes the active contract version
    const b = (await c.compose({ roomId, knownAt: k, priorBriefingId: null })).briefing;
    expect(b.contentDigest).toBe(a.contentDigest);
    expect((b.sourceStates.find((s) => s['source_id'] === h.fx.sourceId) as Record<string, unknown>)['contract_version']).toBe(before['contract_version']);
    const later = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: null })).briefing;
    expect(Number((later.sourceStates.find((s) => s['source_id'] === h.fx.sourceId) as Record<string, unknown>)['contract_version'])).toBeGreaterThan(Number(before['contract_version']));
  }, 120_000);

  it('an attempt still running at the cut-off is not a failure then; its later completion changes only later briefings', async () => {
    const k = await dbNow();
    const a = (await c.compose({ roomId, knownAt: k, priorBriefingId: null })).briefing;
    // fixture setup: an attempt that started before the cut-off and finished (failed) after it, recorded by the database controller
    await sql`insert into observation.scheduled_attempts (attempt_id, scope, tenant_id, domain_id, source_id, contract_version, scheduler_id, job_id, trigger, started_at, finished_at, outcome, run_id, reason, items_admitted, items_noop, items_quarantined)
              values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${h.fx.sourceId}::uuid, ${h.version}, 'residual-probe', 'residual-probe-1', 'scheduler', ${k}::timestamptz - interval '10 minutes', clock_timestamp(), 'failed', ${uuidv7()}::uuid, 'residual probe: completed after the cut-off', 0, 0, 0)`.execute(h.su);
    const b = (await c.compose({ roomId, knownAt: k, priorBriefingId: null })).briefing;
    expect(b.contentDigest).toBe(a.contentDigest);
    const later = (await c.compose({ roomId, knownAt: await dbNow(), priorBriefingId: null })).briefing;
    expect((later.sourceStates.find((s) => s['source_id'] === h.fx.sourceId) as Record<string, unknown>)['state']).toBe('degraded');
  }, 60_000);

  it('approval eligibility is reconstructed at the cut-off: a binding revoked after it still stands there; revoked before it, the window is gone', async () => {
    const roleApprover = await h.humanWithSession(['decision_approver'], 'history-approver');
    const p = await c.proposed({ terms: { approverPolicy: { quorum: 2, roles: ['decision_approver'], expires_after_days: 14 } } });
    const room2 = (await c.openRoom({ packageId: p.pkg, title: 'Eligibility room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(room2, { principal: w.executive.principalId, role: 'observer', op: 'add' });
    await c.approve(p.pkg, p.v, { decision: 'approve', versionDigest: p.digest, rationale: 'Approved under the approver role.' }, roleApprover);
    await sleep(30);
    const k1 = await dbNow();
    await sleep(30);
    await sql`update identity.role_bindings set revoked_at = clock_timestamp() where principal_id = ${roleApprover.principalId}::uuid and role_code = 'decision_approver'`.execute(h.su);   // fixture setup
    const atK1 = (await c.compose({ roomId: room2, knownAt: k1, priorBriefingId: null })).briefing;
    expect(atK1.windows.filter((x) => x['kind'] === 'approval-expiry').map((x) => x['owner'])).toContain(roleApprover.principalId);
    const now = (await c.compose({ roomId: room2, knownAt: await dbNow(), priorBriefingId: null })).briefing;
    expect(now.windows.filter((x) => x['kind'] === 'approval-expiry').map((x) => x['owner'])).not.toContain(roleApprover.principalId);
  }, 60_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R6 · the approved criterion binds the twin and the interval', () => {
  const KEY = 'outcome.line_stop_days:SYN-LINE-A1';
  let otherTwin = ''; let otherV = 0; let vFull = 0; let vDay = 0; let vEarly = 0;
  const ground = (twinId: string, version: number, elements: unknown[]) => w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', twinId), T(), D(), twinId, String(version), { payload: { elements } });
  const admit = (twinId: string, version: number) => w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', twinId), T(), D(), twinId, String(version), { payload: {} });
  const openV = async (twinId: string, over: Record<string, unknown>) => ((await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', twinId), T(), D(), twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-04-10', ...over } })) as { version: { version: number } }).version.version;
  const observed = (value: number, evd: { id: string; version: number; locator: string }, validFrom: string, validTo: string) =>
    ({ key: KEY, kind: 'observed', value, unit: 'days', validFrom, validTo, citations: [{ kind: 'evidence', id: evd.id, version: evd.version }], record: { locator: evd.locator, field: 'line_stop_days' } });
  const criterion = (over: Record<string, unknown> = {}) => ({ key: 'line_stop_days', quantity: 'line stop days over the horizon', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: `twin:${KEY}`, twin_id: w.twinId, period: { from: '2024-01-11', to: '2024-04-10' }, ...over });
  /** A decision with NO simulated option at all: nothing infers a twin. */
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

  beforeAll(async () => {
    const d2 = await w.twins.declare(h.req(w.twinOwner, 'twin.declare', 'TWN', null), T(), D(), { payload: { kind: 'supply-chain', title: 'Unrelated chain', statement: 'another synthetic chain',
      boundary: [w.entityId], owner: w.twinOwner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
    otherTwin = d2.twin.twinId;
  }, 120_000);

  it('a criterion must bind its twin and its period at the choice', async () => {
    const d = await c.fullDraft();
    expect(await message(c.choice(d.pkg, d.v, c.validChoice({ outcome_criteria: [criterion({ twin_id: undefined })] })))).toMatch(/twin_id/);
    expect(await message(c.choice(d.pkg, d.v, c.validChoice({ outcome_criteria: [criterion({ period: undefined })] })))).toMatch(/period/);
    expect(await message(c.choice(d.pkg, d.v, c.validChoice({ outcome_criteria: [criterion({ twin_id: uuidv7() })] })))).toMatch(/twin/);
    expect(await message(c.choice(d.pkg, d.v, c.validChoice({ outcome_criteria: [criterion({ period: { from: '2024-04-11', to: '2024-04-10' } })] })))).toMatch(/period/);
    expect(await status(c.choice(d.pkg, d.v, c.validChoice({ outcome_criteria: [criterion()] })))).toBe('ok');
  });

  it('an all-unsimulated decision has a bound twin: a same-key observation on an unrelated twin is refused; the bound twin records', async () => {
    const pkg = await allUnsimulated({ outcome_criteria: [criterion()] });
    await sleep(30);
    const evd = { ...(await h.upload([{ filename: 'outcomes-residual-a.csv', text: 'synthetic,record_id,line_id,line_stop_days\ntrue,SYN-RES-A,SYN-LINE-A1,3\n', documentTime: '2024-04-10T00:00:00Z' }]))[0] as { id: string; version: number }, locator: 'SYN-RES-A' };
    otherV = await openV(otherTwin, {});
    await ground(otherTwin, otherV, [...completeElements(w.records), observed(3, evd, '2024-01-11', '2024-04-10')]);
    await admit(otherTwin, otherV);
    vFull = await openV(w.twinId, { carryFrom: w.v1 });
    await ground(w.twinId, vFull, [observed(3, evd, '2024-01-11', '2024-04-10')]);
    await admit(w.twinId, vFull);
    expect(await message(c.outcome(pkg, { criterionKey: 'line_stop_days', twinId: otherTwin, twinVersion: otherV, elementKey: KEY }))).toMatch(/twin/);
    const ok = (await c.outcome(pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vFull, elementKey: KEY })).outcome;
    expect(Number(ok.observedValue)).toBe(3);
  }, 180_000);

  it('a same-key observation over the wrong period is refused: a one-day aggregate and an earlier period; the full interval records', async () => {
    const pkg = await allUnsimulated({ outcome_criteria: [criterion()] });
    await sleep(30);
    const evd = { ...(await h.upload([{ filename: 'outcomes-residual-b.csv', text: 'synthetic,record_id,line_id,line_stop_days\ntrue,SYN-RES-B,SYN-LINE-A1,1\n', documentTime: '2024-04-10T00:00:00Z' }]))[0] as { id: string; version: number }, locator: 'SYN-RES-B' };
    vDay = await openV(w.twinId, { carryFrom: vFull, except: [KEY] });
    await ground(w.twinId, vDay, [observed(1, evd, '2024-04-10', '2024-04-10')]);
    await admit(w.twinId, vDay);
    const vLate = await openV(w.twinId, { carryFrom: vDay, except: [KEY] });
    await ground(w.twinId, vLate, [observed(1, evd, '2024-04-01', '2024-04-10')]);
    await admit(w.twinId, vLate);
    vEarly = await openV(w.twinId, { carryFrom: vLate, except: [KEY] });
    await ground(w.twinId, vEarly, [observed(1, evd, '2024-01-11', '2024-02-10')]);
    await admit(w.twinId, vEarly);
    const full = await openV(w.twinId, { carryFrom: vEarly, except: [KEY] });
    await ground(w.twinId, full, [observed(1, evd, '2024-01-11', '2024-04-10')]);
    await admit(w.twinId, full);
    expect(await message(c.outcome(pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vDay, elementKey: KEY }))).toMatch(/period/);
    expect(await message(c.outcome(pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vLate, elementKey: KEY }))).toMatch(/period/);
    // the window that ended two months before the version's world cut-off is refused by the twin's own health rule as STALE before the period check runs — a guard at the boundary, recorded
    expect(await message(c.outcome(pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vEarly, elementKey: KEY }))).toMatch(/period|stale/);
    const ok = (await c.outcome(pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: full, elementKey: KEY })).outcome;
    expect(Number(ok.observedValue)).toBe(1);
  }, 180_000);
});

// ═══════════════════════════════════════════════════════════════════════════════════
describe('R7 · limits are enforced before the work they constrain, inside nested composition and on every task', () => {
  let roomId = ''; let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
  const base = () => ({ version: '1.0.0', codeDigest: DIGEST, ownerPrincipalId: w.owner.principalId, escalationPrincipalId: w.executive.principalId });
  const briefingsOf = async (room: string) => Number((await sql<{ n: string }>`select count(*)::text n from executive.briefings where room_id = ${room}::uuid`.execute(h.su)).rows[0]?.n);
  beforeAll(async () => {
    P = await c.committed();
    roomId = (await c.openRoom({ packageId: P.pkg, title: 'Limits room', reviewEveryDays: 7 })).room.roomId;
    await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
  }, 120_000);

  it('composition reserves a read before each unit of work: an exhausted allowance stops before the first evidence read, a partial one at the unit it cannot afford', async () => {
    const two = (await c.registerAgent({ kind: 'briefing', ...base(), budgets: budgets({ max_reads: 2 }) }, admin)).agent;
    const r2 = (await c.runAgent(two.agentId, { task: 'briefing', roomId })).run;
    expect(r2.outcome).toBe('stopped');
    expect(Number(r2.spent['reads'])).toBe(2);
    expect(String(r2.stopReason)).toMatch(/before/);
    expect(r2.outputs['briefing_id']).toBeUndefined();
    const four = (await c.registerAgent({ kind: 'briefing', ...base(), budgets: budgets({ max_reads: 4 }) }, admin)).agent;
    const r4 = (await c.runAgent(four.agentId, { task: 'briefing', roomId })).run;
    expect(r4.outcome).toBe('stopped');
    expect(Number(r4.spent['reads'])).toBe(4);      // every metered unit counted, none beyond the allowance
    expect(String(r4.stopReason)).toMatch(/before/);
    expect(r4.outputs['briefing_id']).toBeUndefined();
  }, 60_000);

  it('the elapsed deadline is checked before admission: an overrun composition admits no briefing', async () => {
    // A 3 ms budget is refused by the outer meter before composition starts (a guard at the boundary, recorded). The
    // consequence under review begins INSIDE composition: a budget the room read and the evaluation pass (~80 ms here)
    // and the composition overruns. Timing-dependent by nature; the corrected expectation holds on either path.
    const before = await briefingsOf(roomId);
    const slow = (await c.registerAgent({ kind: 'briefing', ...base(), budgets: budgets({ max_elapsed_ms: 80 }) }, admin)).agent;
    const r = (await c.runAgent(slow.agentId, { task: 'briefing', roomId })).run;
    // either the deadline fell before admission (stopped, nothing admitted) or the composition completed inside it (finished, one
    // briefing); a stopped label after a committed write never happens
    if (r.outcome === 'stopped') {
      expect(String(r.stopReason)).toMatch(/elapsed/);
      expect(r.outputs['briefing_id']).toBeUndefined();
      expect(await briefingsOf(roomId)).toBe(before);
    } else {
      expect(r.outcome).toBe('finished');
      expect(typeof r.outputs['briefing_id']).toBe('string');
      expect(await briefingsOf(roomId)).toBe(before + 1);
    }
  }, 60_000);

  it('max_items applies to the decision draft; task/condition pairs that cannot be enforced are refused at registration', async () => {
    expect(await status(c.registerAgent({ kind: 'reporting', ...base(), budgets: budgets(), stopConditions: [{ kind: 'max_items', value: 1 }] }, admin))).toBe(422);
    expect(await status(c.registerAgent({ kind: 'decision', ...base(), budgets: budgets(), stopConditions: [{ kind: 'on_degraded' }] }, admin))).toBe(422);
    const bounded = (await c.registerAgent({ kind: 'decision', ...base(), budgets: budgets(), stopConditions: [{ kind: 'max_items', value: 1 }] }, admin)).agent;
    const dd = await c.declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'an empty draft for the bounded agent', owner: w.owner.principalId });
    const d = { pkg: dd.package.packageId, v: (await c.open(dd.package.packageId)).version.version };
    const r = (await c.runAgent(bounded.agentId, { task: 'draft', packageId: d.pkg, version: d.v })).run;
    expect(r.outcome).toBe('stopped');
    expect(String(r.stopReason)).toMatch(/max_items/);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.options where package_id = ${d.pkg}::uuid and version = ${d.v}`.execute(h.su)).rows[0]?.n).toBe('0');
    expect(r.escalatedTo).toBe(w.executive.principalId);
  }, 60_000);
});
