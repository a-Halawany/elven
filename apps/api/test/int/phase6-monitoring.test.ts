/**
 * PHASE 6 · P6-M5 — monitoring conditions, breaches, outcomes reconciled against the
 * approved choice, closure, and propagation to the package's DEC — through the real
 * database and controller.
 *
 * F6: a committed package's conditions reference existing indicators and branches; a
 * warning raised after commitment is a breach recorded once, routed to the condition's
 * owner with the window, surfaced on the room and in the next briefing; a review
 * falling due without a review event is recorded as overdue once; an outcome is a
 * human's OUT for one criterion of the approved choice, citing an admitted OBSERVED
 * element of the same unit, and — the chosen option being simulated — the chosen run's
 * exact output is a simulated element reconciled against it, nothing overwritten; the
 * package closes on its outcomes with lessons as text; an invalidated input reaches the
 * package through the operator-initiated walk via its DEC. Nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let observation: ObservationController;
let P: { pkg: string; v: number; digest: string; approvalId: string; commitmentId: string };
let roomId = '';
let warningId = '';
let vSim = 0; let vObs = 0; let reconciliationId = ''; let rerouteLineStopDays = 0;

const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
/** Act VI's separately identified synthetic observation: the plant's actual line-stop days over the decision window. */
export const OUTCOMES_CSV = ['synthetic,record_id,line_id,line_stop_days,window_from,window_to,note',
  'true,SYN-OUT-2024Q1-A1,SYN-LINE-A1,3,2024-01-11,2024-04-10,three days of line stop while the rerouted shipment cleared the Cape'].join('\n') + '\n';
const ELEMENT_KEY = 'outcome.line_stop_days:SYN-LINE-A1';
const packageState = async (pkg: string) => (await sql<{ s: string }>`select state s from decision.packages_current where package_id = ${pkg}::uuid`.execute(h.su)).rows[0]?.s;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  observation = h.app.get(O);
  P = await c.committed({ terms: { monitoringConditions: [
    { kind: 'indicator', indicator_id: w.indicatorId, owner: w.owner.principalId, note: 'corridor transits below 40 for five days' },
    { kind: 'warning', branch_id: w.branchId, owner: w.owner.principalId, note: 'the corridor-collapse branch' },
    { kind: 'review', every_days: 7, owner: w.owner.principalId },
  ] } });
  roomId = (await c.openRoom({ packageId: P.pkg, title: 'January corridor collapse — Regensburg line', reviewEveryDays: 7 })).room.roomId;
  await c.membership(roomId, { principal: w.executive.principalId, role: 'observer', op: 'add' });
}, 300_000);

afterAll(async () => { await h?.close(); });

describe('P6-M5 · F6 — conditions bound to what exists; a breach after commitment is routed to its owner with the window', () => {
  it('a condition naming a branch that does not exist is refused at the terms; the committed package watches nothing until something happens', async () => {
    const d = await c.fullDraft();
    expect(await message(c.terms(d.pkg, d.v, c.validTerms({ monitoringConditions: [{ kind: 'warning', branch_id: '00000000-0000-7000-8000-000000000000', owner: w.owner.principalId }] })))).toMatch(/scenario branch that exists/);
    const m = (await c.monitor(P.pkg)).monitoring;
    expect(m.new_breaches).toBe(0);
    expect(m.breaches).toEqual([]);
    expect(m.review_overdue).toBe(false);
    expect(await packageState(P.pkg)).toBe('committed');
    expect(await status(c.monitor(P.pkg, w.approver))).toBe(403);
    // a package that is not committed is not monitored
    expect(await message(c.monitor(d.pkg))).toMatch(/watched after commitment/);
  });

  it('the indicator breaches, the branch flips, a warning is raised: the breach is recorded once per condition, routed to the condition\'s owner, surfaced on the room and in the next briefing', async () => {
    await w.prediction.evaluateIndicator(h.req(w.twinOwner, 'prediction.indicator.evaluate', 'IND', w.indicatorId), T(), D(), w.indicatorId, { payload: { knownAt: new Date().toISOString() } });
    const wr = (await sql<{ id: string; routed_to: string; closes: string }>`select warning_id::text id, routed_to::text, decision.iso(response_window_closes_at) closes from prediction.warnings_current where branch_id = ${w.branchId}::uuid order by raised_at desc limit 1`.execute(h.su)).rows[0];
    expect(wr).toBeDefined();
    warningId = (wr as { id: string }).id;
    const m = (await c.monitor(P.pkg)).monitoring;
    expect(m.new_breaches).toBe(2); // the indicator condition and the branch condition, on the same warning
    expect(m.breaches.map((b) => b['warning_id'])).toEqual([warningId, warningId]);
    expect(m.breaches.map((b) => b['routed_to'])).toEqual([w.owner.principalId, w.owner.principalId]);
    expect(m.breaches.every((b) => b['response_window_closes_at'] !== null)).toBe(true);
    expect(m.state).toBe('monitoring');
    expect(await packageState(P.pkg)).toBe('monitoring');
    const again = (await c.monitor(P.pkg, w.executive)).monitoring;
    expect(again.new_breaches).toBe(0);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.package_events where package_id = ${P.pkg}::uuid and event = 'condition.breached'`.execute(h.su)).rows[0]?.n).toBe('2');
    const room = await c.getRoom(roomId, w.executive);
    expect(room.room.events.filter((e) => e['event'] === 'condition.breached').length).toBe(2);
    expect(room.room['state']).toBe('monitoring');
    const b = (await c.compose({ roomId, knownAt: new Date().toISOString(), priorBriefingId: null }, w.executive)).briefing;
    expect(b.items.some((i) => i['kind'] === 'warning' && i['id'] === warningId && i['owner'] === w.twinOwner.principalId)).toBe(true);
    expect(b.items.filter((i) => (i['details'] as Record<string, unknown>)['event'] === 'condition.breached').length).toBe(2);
    expect(b.windows.some((x) => x['kind'] === 'warning-response' && x['id'] === warningId && x['overdue'] === false)).toBe(true);
    await expect(sql`delete from decision.condition_breaches where package_id = ${P.pkg}::uuid`.execute(h.su)).rejects.toThrow(/append-only|prohibited/i);
  });

  it('a review falling due without a review event is recorded as overdue once; a member\'s review clears it', async () => {
    await c.cadence(roomId, { reviewEveryDays: 7, nextReviewAt: new Date(Date.now() - 3_600_000).toISOString() });
    const m1 = (await c.monitor(P.pkg)).monitoring;
    expect(m1.review_overdue).toBe(true);
    expect(m1.review_overdue_recorded_now).toBe(true);
    const m2 = (await c.monitor(P.pkg)).monitoring;
    expect(m2.review_overdue).toBe(true);
    expect(m2.review_overdue_recorded_now).toBe(false);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.package_events where package_id = ${P.pkg}::uuid and event = 'review.overdue'`.execute(h.su)).rows[0]?.n).toBe('1');
    await c.review(roomId, 'Reviewed after the corridor warning; the reroute stands.', w.executive);
    const m3 = (await c.monitor(P.pkg)).monitoring;
    expect(m3.review_overdue).toBe(false);
  });
});

describe('P6-M5 · F6 — the outcome, reconciled against the approved choice; closure; propagation', () => {
  it('the chosen run\'s exact output becomes a SIMULATED element; the outcomes upload becomes an OBSERVED element; Phase 5 reconciles the two', async () => {
    const run = (await sql<{ o: Record<string, unknown> }>`select outputs o from simulation.runs_current where run_id = ${w.rerouteId}::uuid`.execute(h.su)).rows[0]?.o as Record<string, unknown>;
    rerouteLineStopDays = Number((run['totals'] as Record<string, unknown>)['line_stop_days']);
    expect(Number.isFinite(rerouteLineStopDays)).toBe(true);
    const o2 = await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-01-17', carryFrom: w.v1 } }) as { version: { version: number } };
    vSim = o2.version.version;
    await w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(vSim), { payload: { elements: [
      { key: ELEMENT_KEY, kind: 'simulated', value: rerouteLineStopDays, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'run', id: w.rerouteId, version: 1 }] } ] } });
    await w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(vSim), { payload: {} });
    // the separately identified synthetic observation, recorded now, dated 2024-04-10
    const up = await h.upload([{ filename: 'outcomes-2024Q1.csv', text: OUTCOMES_CSV, documentTime: '2024-04-10T00:00:00Z' }]);
    const outEvd = up[0] as { id: string; version: number };
    const o3 = await w.twins.openVersion(h.req(w.twinOwner, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: new Date().toISOString(), observedThrough: '2024-04-10', carryFrom: vSim, except: [ELEMENT_KEY] } }) as { version: { version: number } };
    vObs = o3.version.version;
    await w.twins.ground(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(vObs), { payload: { elements: [
      { key: ELEMENT_KEY, kind: 'observed', value: 3, unit: 'days', validFrom: '2024-01-11', validTo: '2024-04-10', citations: [{ kind: 'evidence', id: outEvd.id, version: outEvd.version }], record: { locator: 'SYN-OUT-2024Q1-A1', field: 'line_stop_days' } } ] } });
    await w.twins.admit(h.req(w.twinOwner, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(vObs), { payload: {} });
    const rc = await w.twins.reconcile(h.req(w.twinOwner, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { key: ELEMENT_KEY, fromVersion: vSim, againstVersion: vObs, note: 'the chosen run against the plant\'s actual line-stop days' } }) as { reconciliation: Record<string, unknown> };
    expect(rc.reconciliation).toBeDefined();
    reconciliationId = String((await sql<{ id: string }>`select reconciliation_id::text id from twin.reconciliations where twin_id = ${w.twinId}::uuid and key = ${ELEMENT_KEY} and from_version = ${vSim} and against_version = ${vObs} order by recorded_at desc limit 1`.execute(h.su)).rows[0]?.id);
    expect(reconciliationId).toMatch(/^[0-9a-f-]{36}$/);
    const row = (await sql<{ from_value: unknown; against_value: unknown }>`select from_value, against_value from twin.reconciliations where reconciliation_id = ${reconciliationId}::uuid`.execute(h.su)).rows[0];
    expect(Number(row?.from_value)).toBe(rerouteLineStopDays);
    expect(Number(row?.against_value)).toBe(3);
  }, 120_000);

  it('the OUT: refused without the reconciliation, for a wrong criterion, unit or element; recorded once by the owner; the bounded write lands in the strategy graph', async () => {
    const base = { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vObs, elementKey: ELEMENT_KEY };
    expect(await message(c.outcome(P.pkg, { ...base }))).toMatch(/record the reconciliation .* first/);
    expect(await message(c.outcome(P.pkg, { ...base, criterionKey: 'cost' , reconciliationId }))).toMatch(/not an outcome criterion/);
    expect(await message(c.outcome(P.pkg, { ...base, twinVersion: vSim, reconciliationId }))).toMatch(/not a complete OBSERVED element/);
    expect(await message(c.outcome(P.pkg, { ...base, elementKey: 'inventory.on_hand:SYN-PART-MAG', reconciliationId }))).toMatch(/in sets, the criterion in days/);
    expect(await status(c.outcome(P.pkg, { ...base, reconciliationId }, w.executive))).toBe(403);
    expect(await status(c.outcome(P.pkg, { ...base, reconciliationId }, w.approver))).toBe(403);
    const r = (await c.outcome(P.pkg, { ...base, reconciliationId, note: 'Three days of line stop while the rerouted shipment cleared the Cape.' })).outcome;
    expect(r.met).toBe(false);
    expect(Number(r.observedValue)).toBe(3);
    expect(Number(r.target)).toBe(0);
    expect(r.reconciliationId).toBe(reconciliationId);
    expect(Number((r.simulated as Record<string, unknown>)['value'])).toBe(rerouteLineStopDays);
    const out = (await sql<Record<string, unknown>>`select s.object_type, s.status, s.owner_principal_id::text owner, o.object_type otype, o.schema_ref, o.method_ref, o.truth_state, o.source_object_ids
      from graph.strategy_current s join objects.canonical_objects o on o.object_id = s.strategy_object_id where s.strategy_object_id = ${r.outcomeId}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(out['object_type']).toBe('OUT');
    expect(out['otype']).toBe('OUT');
    expect(out['schema_ref']).toBe('OUT@v1');
    expect(out['method_ref']).toBe('decision-outcome@1.0.0');
    expect(out['truth_state']).toBe('observed');
    expect(out['source_object_ids']).toEqual(expect.arrayContaining([`CMT:${P.commitmentId}@1`, `TWN:${w.twinId}@${vObs}`]));
    const deps = (await sql<{ k: string; id: string }>`select depends_on_kind k, depends_on_id::text id from graph.dependencies where dependent_object_id = ${r.outcomeId}::uuid and dependent_type = 'OUT' order by 1`.execute(h.su)).rows;
    expect(deps.map((d) => d.k)).toEqual(['run', 'strategy', 'twin']);
    expect(deps.find((d) => d.k === 'strategy')?.id).toBe(P.commitmentId);
    expect(deps.find((d) => d.k === 'run')?.id).toBe(w.rerouteId);
    expect(await message(c.outcome(P.pkg, { ...base, reconciliationId }))).toMatch(/already has its outcome; nothing is overwritten/);
    expect((await sql<{ t: string[] }>`select object_types t from observation.canonical_write_actions where action = 'decision.outcome'`.execute(h.su)).rows[0]?.t).toEqual(['OUT']);
    // the replay's observed layer now holds the outcome and the reconciliation; the earlier layers did not move
    const rp = (await c.replay(P.pkg, P.v, {}, w.executive)).replay;
    const obs = rp.layers['observed'] as Record<string, Array<Record<string, unknown>>>;
    expect(obs['outcomes']?.map((x) => x['id'])).toEqual([r.outcomeId]);
    expect(obs['reconciliations']?.map((x) => x['reconciliation_id'])).toEqual([reconciliationId]);
    expect((obs['warnings'] ?? []).map((x) => x['warning_id'])).toEqual([warningId]);
    expect((obs['branch_flips'] ?? []).length).toBe(1);
    const listed = await c.outcomes(P.pkg, w.executive);
    expect(listed.outcomes.length).toBe(1);
    expect(listed.breaches.length).toBe(2);
  });

  it('closure records the lessons as text on the outcomes; nothing reopens; the room mirrors closed', async () => {
    expect(await status(c.close(P.pkg, 'The reroute held the line but cost three days; next time reroute a week earlier.', w.executive))).toBe(403);
    expect(await status(c.close(P.pkg, 'short'))).toBe(422);
    const other = await c.committed();
    expect(await message(c.close(other.pkg, 'Closing without any outcome recorded.'))).toMatch(/no outcome is recorded/);
    const r = (await c.close(P.pkg, 'The reroute held the line but cost three days; next time reroute a week earlier.')).closure;
    expect(r).toMatchObject({ state: 'closed', outcomesRecorded: 1, criteria: 1 });
    expect(await packageState(P.pkg)).toBe('closed');
    expect((await c.getRoom(roomId)).room['state']).toBe('closed');
    expect(await message(c.outcome(P.pkg, { criterionKey: 'line_stop_days', twinId: w.twinId, twinVersion: vObs, elementKey: ELEMENT_KEY, reconciliationId }))).toMatch(/package is closed/);
    expect(await message(c.open(P.pkg))).toMatch(/package is closed/);
    expect(await message(c.close(P.pkg, 'Closing twice is not a second closure.'))).toMatch(/package is closed/);
    const ev = (await sql<{ d: Record<string, unknown> }>`select details d from decision.package_events where package_id = ${P.pkg}::uuid and event = 'package.closed'`.execute(h.su)).rows[0]?.d;
    expect(String(ev?.['lessons'])).toMatch(/reroute a week earlier/);
    expect((ev?.['outcomes'] as Array<Record<string, unknown>>)[0]?.['met']).toBe(false);
  });

  it('an invalidated input reaches the package through the operator-initiated walk, via its DEC', async () => {
    const cor = await observation.submitCorrection(h.req(h.manager, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
      { payload: { sourceId: w.uploadSourceId, kind: 'correction', channel: 'operator re-upload', publisherRef: 'inventory restated', reason: 'the inventory count was restated after a stock take', affectedEvdIds: [w.records.inv.id] } }) as { correction: { caseId: string } };
    await observation.applyCorrection(h.req(h.manager, 'observation.correction.apply', 'COR', cor.correction.caseId, 'observation'), T(), D(), cor.correction.caseId,
      { payload: { decision: 'apply', affectedEvdIds: [w.records.inv.id], reason: 'restatement verified' } });
    const walk = await w.graph.propagate(h.req(w.twinOwner, 'graph.impact.propagate', 'INV', w.records.inv.id, 'graph'), T(), D(),
      { payload: { triggerKind: 'evidence_correction', triggerObjectId: w.records.inv.id, correctionCaseId: cor.correction.caseId } }) as { impact: { decisions: Array<{ strategy_object_id: string }>; commitments: Array<{ strategy_object_id: string }>; statement: string } };
    expect(walk.impact.decisions.map((d) => d.strategy_object_id)).toContain(w.decisionId);
    expect(walk.impact.statement).toMatch(/decision\(s\)/);
  }, 120_000);
});
