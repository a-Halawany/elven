/**
 * PHASE 6 fixtures — the decision world every Phase 6 suite starts from, built
 * through the product's own ports: the corridor twin, the runs a package cites (one
 * control, two interventions, a second control on another baseline), the OBJ and the
 * DEC declared through Phase 3's strategy port, the indicator a monitoring condition
 * names, and the named humans with sessions of their own.
 */
import { expect } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { DecisionController } from '../../src/decision/decision.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { RECORD_FILES, completeElements } from './phase5-fixtures.js';

export interface DecisionWorld {
  twins: TwinController; graph: GraphController; prediction: PredictionController; decisions: DecisionController; exec: ExecutiveController;
  twinOwner: AuthenticatedPrincipal; operator: AuthenticatedPrincipal;
  owner: AuthenticatedPrincipal; approver: AuthenticatedPrincipal; approver2: AuthenticatedPrincipal; authority: AuthenticatedPrincipal; authority2: AuthenticatedPrincipal;
  executive: AuthenticatedPrincipal; agent: AuthenticatedPrincipal;
  /** A human who is both an owner and an approver: the self-approval probe. */
  authorApprover: AuthenticatedPrincipal;
  /** A human who is both an approver and an authority: the approver-cannot-commit probe. */
  approverAuthority: AuthenticatedPrincipal;
  /** A principal of kind 'agent' (no session): the target of "an agent is never a member / an approver" probes. */
  machinePrincipalId: string;
  /** The corridor scenario: a downside branch on the transit indicator, owned by the twin owner. */
  scenarioId: string; branchId: string; forecastId: string; seriesKey: string;
  twinId: string; v1: number; controlId: string; rerouteId: string; airId: string; control2Id: string;
  objectiveId: string; decisionId: string; indicatorId: string; entityId: string;
  /** An ASU the package may cite: 'the corridor stays open'. */
  assumptionId: string;
  uploadSourceId: string;
  evd: { id: string; version: number };
  records: { inv: { id: string; version: number }; ship: { id: string; version: number }; terms: { id: string; version: number } };
}

export const status = async (p: Promise<unknown>): Promise<number | string> => { try { await p; return 'ok'; } catch (e) { return e instanceof HttpException ? e.getStatus() : (e instanceof Error ? e.message : String(e)); } };
export const message = async (p: Promise<unknown>): Promise<string> => { try { await p; return ''; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? '') : (e instanceof Error ? e.message : String(e)); } };

export async function bootDecisionWorld(h: Phase4Harness): Promise<DecisionWorld> {
  const { TwinController: Tc } = await import('../../src/twin/twin.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { DecisionController: Dc } = await import('../../src/decision/decision.controller.js');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const twins = h.app.get(Tc); const graph = h.app.get(Gc); const prediction = h.app.get(Pc); const decisions = h.app.get(Dc); const exec = h.app.get(Ec);
  const T = h.fx.tenantId; const D = h.fx.domainId;
  const twinOwner = await h.principalWith(['twin_owner', 'forecast_owner', 'strategy_owner'], 'twin-owner');
  const operator = await h.principalWith(['simulation_operator'], 'sim-operator');
  const owner = await h.humanWithSession(['decision_owner'], 'decision-owner');
  const approver = await h.humanWithSession(['decision_approver'], 'approver');
  const approver2 = await h.humanWithSession(['decision_approver'], 'approver-2');
  const authority = await h.humanWithSession(['decision_authority'], 'authority');
  const authority2 = await h.humanWithSession(['decision_authority'], 'authority-2');
  const executive = await h.humanWithSession(['executive'], 'executive');
  const agent = await h.humanWithSession(['decision_agent'], 'decision-agent');
  const authorApprover = await h.humanWithSession(['decision_owner', 'decision_approver'], 'author-approver');
  const approverAuthority = await h.humanWithSession(['decision_approver', 'decision_authority'], 'approver-authority');
  const machinePrincipalId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${machinePrincipalId}::uuid, 'agent', 'DOMAIN', ${T}::uuid, ${D}::uuid, ${`fixture-machine-${machinePrincipalId.slice(-8)}`}, ${`fx-mach-${machinePrincipalId.slice(-8)}`}, 'active')`.execute(h.su);
  const sv = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  const evd = (await sql<{ id: string; version: number }>`select object_id::text id, object_version::int version from objects.canonical_objects
    where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at limit 1`.execute(h.su)).rows[0] as { id: string; version: number };
  const up = await h.upload(RECORD_FILES());
  const records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
  const entityId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${twinOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(twinOwner, 'twin.declare', 'TWN', null), T, D, { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet chain',
    boundary: [entityId], owner: twinOwner.principalId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  const twinId = d.twin.twinId;
  const o = await twins.openVersion(h.req(twinOwner, 'twin.version', 'TWN', twinId), T, D, twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(twinOwner, 'twin.ground', 'TWN', twinId), T, D, twinId, String(o.version.version), { payload: { elements: completeElements(records) } });
  await twins.admit(h.req(twinOwner, 'twin.version.admit', 'TWN', twinId), T, D, twinId, String(o.version.version), { payload: {} });
  const v1 = o.version.version;
  const run = (payload: Record<string, unknown>) => twins.run(h.req(operator, 'simulation.run', 'SIM', null), T, D, { payload }) as Promise<{ run: { runId: string; state: string } }>;
  const base = (over: Record<string, unknown> = {}) => ({ twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...over });
  const controlId = (await run(base())).run.runId;
  const rerouteId = (await run(base({ runKind: 'intervention', controlRunId: controlId, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] }))).run.runId;
  const airId = (await run(base({ runKind: 'intervention', controlRunId: controlId, interventions: [{ type: 'air_bridge', component: 'SYN-PART-MAG', weeks: 1, decision_date: '2024-01-17' }] }))).run.runId;
  const control2Id = (await run(base({ shock: false }))).run.runId;
  const obj = await graph.declare(h.req(twinOwner, 'graph.strategy.declare', 'OBJ', null, 'graph'), T, D, { payload: { objectType: 'OBJ', title: 'Keep the Regensburg line running through Q1', statement: 'no line stop attributable to the magnet chain',
    restsOn: [{ kind: 'entity', id: entityId, rationale: 'the objective is about the chain through this strait' }] } }) as { strategy: { objectId: string } };
  const objectiveId = obj.strategy.objectId;
  const dec = await graph.declare(h.req(twinOwner, 'graph.strategy.declare', 'DEC', null, 'graph'), T, D, { payload: { objectType: 'DEC', title: 'Routing of SYN-SHIP-4472', statement: 'reroute, air-bridge, draw down, or wait',
    restsOn: [{ kind: 'strategy', id: objectiveId, rationale: 'the decision serves the objective' }] } }) as { strategy: { objectId: string } };
  const decisionId = dec.strategy.objectId;
  const asu = await graph.declare(h.req(twinOwner, 'graph.strategy.declare', 'ASU', null, 'graph'), T, D, { payload: { objectType: 'ASU', title: 'The corridor stays open', statement: 'transits through Bab el-Mandeb continue at their seasonal level',
    restsOn: [{ kind: 'entity', id: entityId, rationale: 'the assumption is about this strait' }] } }) as { strategy: { objectId: string } };
  const uploadSourceId = await h.uploadSource();
  const seriesKey = `fixture:${sv.sourceKey}:value`;
  await prediction.registerSeries(h.req(twinOwner, 'prediction.series.register', 'SER', null), T, D,
    { payload: { seriesKey, sourceKey: sv.sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                 seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode' } });
  const ind = await prediction.defineIndicator(h.req(twinOwner, 'prediction.indicator.define', 'IND', null), T, D,
    { payload: { seriesKey, description: 'corridor collapse: transits below 40 for five days', comparator: '<', threshold: 40, consecutiveDays: 5, owner: twinOwner.principalId } }) as { indicator: { indicatorId: string } };
  const f = await prediction.issueForecast(h.req(twinOwner, 'prediction.forecast.issue', 'FCT', null), T, D,
    { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), observedThrough: '2021-02-15', assumptions: [asu.strategy.objectId], label: 'short history' } }) as { forecast: { forecastId: string } };
  const scn = await prediction.declareScenario(h.req(twinOwner, 'prediction.scenario.declare', 'SCN', null), T, D,
    { payload: { title: 'Bab el-Mandeb over the next 30 days', statement: 'the corridor stays open, or collapses', forecastId: f.forecast.forecastId, owner: twinOwner.principalId, reviewCadence: 'weekly',
                 branches: [
                   { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: twinOwner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                   { name: 'Corridor collapse', kind: 'downside', statement: 'below 40 for five days', indicatorId: ind.indicator.indicatorId, owner: twinOwner.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48 },
                 ] } }) as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  const branchId = scn.scenario.branches.find((b) => b.kind === 'downside')?.branchId as string;
  return { twins, graph, prediction, decisions, exec, twinOwner, operator, owner, approver, approver2, authority, authority2, executive, agent, authorApprover, approverAuthority, machinePrincipalId,
           twinId, v1, controlId, rerouteId, airId, control2Id, objectiveId, decisionId, indicatorId: ind.indicator.indicatorId, entityId, assumptionId: asu.strategy.objectId, uploadSourceId, evd, records,
           scenarioId: scn.scenario.scenarioId, branchId, forecastId: f.forecast.forecastId, seriesKey };
}

/** The calls a suite makes against the decision controller, as the named principal. */
export function decisionCalls(h: Phase4Harness, w: DecisionWorld) {
  const T = () => h.fx.tenantId; const D = () => h.fx.domainId; const dc = w.decisions;
  const declare = (payload: Record<string, unknown>, as = w.owner) => dc.declare(h.req(as, 'decision.package.declare', 'DPK', null, 'decision'), T(), D(), { payload }) as Promise<{ package: { packageId: string } }>;
  const open = (pkg: string, payload: Record<string, unknown> = {}, as = w.owner) => dc.openVersion(h.req(as, 'decision.package.version', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload: { knownAt: new Date().toISOString(), observedThrough: '2024-01-17', ...payload } }) as Promise<{ version: { version: number } }>;
  const option = (pkg: string, v: number, payload: Record<string, unknown>, as = w.owner) => dc.setOption(h.req(as, 'decision.package.option', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload }) as Promise<{ option: { optionId: string; simulated: boolean; uncertainty: Record<string, unknown>; syntheticState: boolean } }>;
  const terms = (pkg: string, v: number, payload: Record<string, unknown>, as = w.owner) => dc.setTerms(h.req(as, 'decision.package.terms', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload });
  const choice = (pkg: string, v: number, payload: Record<string, unknown>, as = w.owner) => dc.setChoice(h.req(as, 'decision.package.choice', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload });
  const propose = (pkg: string, v: number, as = w.owner) => dc.propose(h.req(as, 'decision.package.propose', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v)) as Promise<{ proposal: { versionDigest: string; baselineRunId: string | null; syntheticState: boolean } }>;
  const dissent = (pkg: string, v: number, payload: Record<string, unknown>, as = w.approver) => dc.dissent(h.req(as, 'decision.dissent', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload }) as Promise<{ dissent: { dissentId: string } }>;
  const withdraw = (pkg: string, reason: string, as = w.owner) => dc.withdraw(h.req(as, 'decision.package.withdraw', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload: { reason } });
  const get = (pkg: string, as = w.owner) => dc.get(h.req(as, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg) as Promise<{ package: Record<string, unknown> & { versions: Array<Record<string, unknown> & { options: Array<Record<string, unknown>>; dissent: unknown[]; approvals: unknown[] }>; commitment: Record<string, unknown> | null } }>;
  const approve = (pkg: string, v: number, payload: Record<string, unknown>, as = w.approver) => dc.approve(h.req(as, 'decision.approve', 'APR', null, 'decision'), T(), D(), pkg, String(v), { payload }) as Promise<{ approval: { approvalId: string; state: string; liveApprovals: number; quorum: number; expiresAt: string; eligibleBy: string } }>;
  const revoke = (pkg: string, approvalId: string, reason: string, as = w.approver) => dc.revoke(h.req(as, 'decision.approve.revoke', 'APR', approvalId, 'decision'), T(), D(), pkg, approvalId, { payload: { reason } }) as Promise<{ revocation: { state: string; liveApprovals: number; quorum: number } }>;
  /** The commit as the product sends it: the envelope says C2 like every other write; the ROUTE pins C3. */
  const commit = (pkg: string, v: number, versionDigest: string, as = w.authority, consequence: 'C2' | 'C3' | 'C4' = 'C2') => {
    const env = { ...h.env(as, 'decision.commit', 'CMT', null, 'decision'), consequence_class: consequence };
    return dc.commit({ eyeEnvelope: env, eyePrincipal: as } as never, T(), D(), pkg, String(v), { payload: { versionDigest } }) as Promise<{ commitment: { commitmentId: string; approvals: Array<{ approval_id: string; approver: string }>; opClass: string; decidedAt: string; title: string } }>;
  };
  const validTerms = (over: Record<string, unknown> = {}) => ({
    objectives: [w.objectiveId], constraints: ['no air freight above 60 t/week'],
    approverPolicy: { quorum: 1, principals: [w.approver.principalId], expires_after_days: 14 },
    monitoringConditions: [
      { kind: 'indicator', indicator_id: w.indicatorId, owner: w.owner.principalId, note: 'corridor transits below 40 for five days' },
      { kind: 'review', every_days: 7, owner: w.owner.principalId },
    ],
    reversibility: 'reversible within one sailing', informationValue: 'a week of observation would not change the ranking', ...over,
  });
  const validChoice = (over: Record<string, unknown> = {}) => ({
    option_key: 'reroute', rationale: 'The reroute is the only option that keeps the line running without the air-bridge premium.',
    decision_deadline: '2024-01-19', accepted_trade_offs: ['+14 days of transit', '+48,100 reroute cost'], action_owner: w.owner.principalId,
    outcome_criteria: [{ key: 'line_stop_days', quantity: 'line stop days over the horizon', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1' }],
    ...over,
  });
  /** A full draft on a fresh package: two options on the common control, terms, the choice. */
  const fullDraft = async (over: { terms?: Record<string, unknown>; choice?: Record<string, unknown>; as?: AuthenticatedPrincipal; owner?: string } = {}): Promise<{ pkg: string; v: number }> => {
    const as = over.as ?? w.owner;
    const d = await declare({ decisionObjectId: w.decisionId, title: 'Reroute SYN-SHIP-4472 around the Cape', statement: 'whether to reroute the second magnet shipment now', owner: over.owner ?? as.principalId }, as);
    const pkg = d.package.packageId;
    const v = (await open(pkg, {}, as)).version.version;
    await option(pkg, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }] }, as);
    await option(pkg, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: w.evd.id, version: w.evd.version }] }, as);
    await terms(pkg, v, validTerms(over.terms ?? {}), as);
    await choice(pkg, v, validChoice({ action_owner: as.principalId, ...(over.choice ?? {}) }), as);
    return { pkg, v };
  };
  const replay = (pkg: string, v: number, payload: Record<string, unknown> = {}, as = w.executive) => dc.replay(h.req(as, 'decision.replay', 'RPL', null, 'decision'), T(), D(), pkg, String(v), { payload }) as Promise<{ replay: { replayId: string; contentDigest: string; asOf: string; cutoffs: Record<string, unknown>; layers: Record<string, unknown>; excluded: unknown[]; unavailable: unknown[]; invocation: Record<string, unknown> } }>;
  const replays = (pkg: string, as = w.executive) => dc.listReplays(h.req(as, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg) as Promise<{ replays: Array<Record<string, unknown>> }>;
  /** A proposed version, with its digest. */
  const proposed = async (over: Parameters<typeof fullDraft>[0] = {}): Promise<{ pkg: string; v: number; digest: string }> => {
    const { pkg, v } = await fullDraft(over);
    const r = await propose(pkg, v, over.as ?? w.owner);
    return { pkg, v, digest: r.proposal.versionDigest };
  };
  /** A committed version: proposed, approved by the named approver, committed by the authority. */
  const committed = async (over: Parameters<typeof fullDraft>[0] = {}): Promise<{ pkg: string; v: number; digest: string; approvalId: string; commitmentId: string }> => {
    const p = await proposed(over);
    const a = await approve(p.pkg, p.v, { decision: 'approve', versionDigest: p.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, w.approver);
    const cm = await commit(p.pkg, p.v, p.digest, w.authority);
    return { ...p, approvalId: a.approval.approvalId, commitmentId: cm.commitment.commitmentId };
  };
  // monitoring, outcomes, closure
  const monitor = (pkg: string, as = w.owner) => dc.monitor(h.req(as, 'decision.monitor', 'DPK', pkg, 'decision'), T(), D(), pkg) as Promise<{ monitoring: { state: string; new_breaches: number; breaches: Array<Record<string, unknown>>; review_overdue: boolean; review_overdue_recorded_now: boolean } }>;
  const outcome = (pkg: string, payload: Record<string, unknown>, as = w.owner) => dc.outcome(h.req(as, 'decision.outcome', 'OUT', null, 'decision'), T(), D(), pkg, { payload }) as Promise<{ outcome: { outcomeId: string; met: boolean; observedValue: unknown; target: string; reconciliationId: string | null; simulated: unknown } }>;
  const close = (pkg: string, lessons: string, as = w.owner) => dc.close(h.req(as, 'decision.close', 'DPK', pkg, 'decision'), T(), D(), pkg, { payload: { lessons } }) as Promise<{ closure: { state: string; outcomesRecorded: number; criteria: number } }>;
  const outcomes = (pkg: string, as = w.owner) => dc.listOutcomes(h.req(as, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg) as Promise<{ outcomes: Array<Record<string, unknown>>; breaches: Array<Record<string, unknown>> }>;
  // agents
  const registerAgent = (payload: Record<string, unknown>, as: AuthenticatedPrincipal) => w.exec.registerAgent(h.req(as, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload }) as Promise<{ agent: { agentId: string; principalId: string; kind: string; role: string } }>;
  const revokeAgent = (agentId: string, reason: string, as: AuthenticatedPrincipal) => w.exec.revokeAgent(h.req(as, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason } });
  const listAgents = (as = w.executive) => w.exec.listAgents(h.req(as, 'agent.read', 'AGT', null, 'decision'), T(), D()) as Promise<{ agents: Array<Record<string, unknown>>; runs: Array<Record<string, unknown>>; planner: Record<string, unknown> }>;
  const runAgent = (agentId: string, payload: Record<string, unknown>, as = w.owner) => w.exec.runAgent(h.req(as, 'agent.trigger', 'AGT', agentId, 'decision'), T(), D(), agentId, { payload: payload as never }) as Promise<{ run: { runId: string; outcome: string; spent: Record<string, unknown>; stopReason: string | null; refusals: Array<Record<string, unknown>>; outputs: Record<string, unknown>; escalatedTo: string | null } }>;
  const scheduleRoom = (payload: Record<string, unknown>, as = w.owner) => w.exec.scheduleRoom(h.req(as, 'agent.trigger', 'DRM', null, 'decision'), T(), D(), { payload: payload as never }) as Promise<{ schedule: Record<string, unknown> }>;
  const report = (pkg: string, as = w.executive) => w.exec.report(h.req(as, 'report.render', 'DPK', pkg, 'decision'), T(), D(), pkg) as Promise<{ report: Record<string, unknown> }>;
  const workflow = (pkg: string, as = w.executive) => w.exec.workflow(h.req(as, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg) as Promise<{ workflow: Array<Record<string, unknown>> }>;
  // rooms and briefings
  const ec = w.exec;
  const openRoom = (payload: Record<string, unknown>, as = w.owner) => ec.openRoom(h.req(as, 'room.open', 'DRM', null, 'decision'), T(), D(), { payload }) as Promise<{ room: { roomId: string; nextReviewAt: string } }>;
  const membership = (roomId: string, payload: Record<string, unknown>, as = w.owner) => ec.membership(h.req(as, 'room.membership', 'DRM', roomId, 'decision'), T(), D(), roomId, { payload: payload as never });
  const cadence = (roomId: string, payload: Record<string, unknown>, as = w.owner) => ec.cadence(h.req(as, 'room.cadence', 'DRM', roomId, 'decision'), T(), D(), roomId, { payload: payload as never }) as Promise<{ cadence: { nextReviewAt: string; reviewEveryDays: number } }>;
  const review = (roomId: string, note: string, as = w.owner) => ec.review(h.req(as, 'decision.review', 'DRM', roomId, 'decision'), T(), D(), roomId, { payload: { note } }) as Promise<{ review: { reviewedAt: string; nextReviewAt: string; wasOverdue: boolean } }>;
  const getRoom = (roomId: string, as = w.owner) => ec.getRoom(h.req(as, 'room.read', 'DRM', roomId, 'decision'), T(), D(), roomId) as Promise<{ room: Record<string, unknown> & { members: Array<Record<string, unknown>>; briefings: unknown[]; events: Array<Record<string, unknown>> } }>;
  const listRooms = (as = w.owner) => ec.listRooms(h.req(as, 'room.read', 'DRM', null, 'decision'), T(), D()) as Promise<{ rooms: Array<Record<string, unknown>> }>;
  const compose = (payload: Record<string, unknown>, as = w.executive) => ec.compose(h.req(as, 'briefing.compose', 'BRF', null, 'briefing'), T(), D(), { payload }) as Promise<{ briefing: { briefingId: string; contentDigest: string; watermark: Record<string, unknown>; items: Array<Record<string, unknown>>; windows: Array<Record<string, unknown>>; sourceStates: Array<Record<string, unknown>>; sources: string[]; degraded: boolean; narrative: string | null; narrativeCites: string[]; composedVia: string } }>;
  const getBriefing = (id: string, as = w.executive) => ec.getBriefing(h.req(as, 'briefing.read', 'BRF', id, 'briefing'), T(), D(), id) as Promise<{ briefing: Record<string, unknown> }>;
  const listBriefings = (roomId: string | null, as = w.executive) => ec.listBriefings(h.req(as, 'briefing.read', 'BRF', null, 'briefing'), T(), D(), { payload: { roomId } }) as Promise<{ briefings: Array<Record<string, unknown>> }>;
  return { declare, open, option, terms, choice, propose, dissent, withdraw, get, approve, revoke, commit, replay, replays, validTerms, validChoice, fullDraft, proposed, committed,
           openRoom, membership, cadence, review, getRoom, listRooms, compose, getBriefing, listBriefings, monitor, outcome, close, outcomes,
           registerAgent, revokeAgent, listAgents, runAgent, scheduleRoom, report, workflow };
}
