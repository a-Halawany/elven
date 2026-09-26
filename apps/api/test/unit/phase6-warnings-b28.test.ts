/*
 * CP-6 B28 (0088 §W) part `warnings` · the pure halves of the early-warning lifecycle: the warnings consumer's reading of a graph change (the
 * three origins, their items and their candidates), the candidate's window (T3, the missed decision), the route intakes (422 on a malformed
 * request — the ports decide the rest), the refusal rows of the five port families through the mapper (anchored; B9's order 403 → 404 → 409 →
 * 422; the older `warning rejected` row untouched), the PDP's seven exact rules and the two tick steps the section registers.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import type { ChangeEvent } from '../../src/graph/subscriptions/graph-change.js';
import { CONSUMER_ACTION, CONSUMER_EVENT_TYPES, CONSUMER_KINDS, CONSUMER_ROLE } from '../../src/graph/subscriptions/graph-change.js';
import { candidateOf, readOriginItem, warningOriginItems } from '../../src/prediction/warnings/warning-origins.js';
import { WARNING_CANDIDATES_STEP, WARNING_EXPIRY_STEP, WarningLifecycleService, candidateWindow, validateClose, validateContext, validateFeedback, validateWarningEvaluation } from '../../src/prediction/warnings/warning-lifecycle.service.js';

const OBJ = '0190b1c2-d3e4-7000-8000-000000000301'; const FCT = '0190b1c2-d3e4-7000-8000-000000000302'; const TWN = '0190b1c2-d3e4-7000-8000-000000000303';
const INV = '0190b1c2-d3e4-7000-8000-000000000304'; const EV = '0190b1c2-d3e4-7000-8000-000000000305'; const W = '0190b1c2-d3e4-7000-8000-000000000306';
const reach = (o: Record<string, string[]> = {}) => ({ claims: [], assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], evidence: [], truncated: false, walked: true, ...o });
const gc = (kind: string, objects: Record<string, string[]> = {}, extra: Record<string, unknown> = {}): ChangeEvent & { event_type: 'GraphChanged' } => ({
  event_id: EV, event_type: 'GraphChanged',
  payload: { schema: 'GraphChanged', schema_version: 'v1', change: { kind: kind as never, occurred_at: '2026-09-26T10:00:00.000Z', invalidation_id: kind === 'invalidation.assessed' ? INV : null }, identities: [],
             relationships: { edges: [], resolutions: [], dependencies: [] }, objects: reach(objects), temporal: { known_at: '2026-09-26T10:00:00.000Z' }, subscriptions: [],
             cause: { action: 'graph.x', actor: 'principal:x', target_type: 'OBJ', target_id: null }, ...extra } as never,
});
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, m: string, status: number, body: string): void => {
  const r = asObservationRefusal(pg(code, m), 'corr');
  expect(r?.getStatus(), m).toBe(status);
  const b = r?.getResponse() as { code: string; message: string };
  expect(b.code, m).toBe(body);
  expect(b.message, m).toBe(m);
};
const status422 = (f: () => unknown, re: RegExp): void => {
  try { f(); throw new Error('the intake should have refused'); } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(422);
    expect(String(((e as HttpException).getResponse() as { message?: string }).message)).toMatch(re);
  }
};

describe('B28 warnings · the consumer\'s reading of a graph change', () => {
  it('the kind is registered with its action, role and event (a new identity)', () => {
    expect(CONSUMER_KINDS).toContain('warnings');
    expect(CONSUMER_ACTION.warnings).toBe('prediction.warning.subscription.apply');
    expect(CONSUMER_ROLE.warnings).toBe('warning_subscriber');
    expect(CONSUMER_EVENT_TYPES.warnings).toEqual(['GraphChanged']);
  });
  it('graph impact: an invalidation (or a retraction, a revoked import, a split) reaching an objective — one item per objective', () => {
    expect(warningOriginItems(gc('invalidation.assessed', { objectives: [OBJ, OBJ.toUpperCase()] }))).toEqual([`graph_impact:${OBJ}`]);
    expect(warningOriginItems(gc('edge.retracted', { objectives: [OBJ] }))).toEqual([`graph_impact:${OBJ}`]);
    expect(warningOriginItems(gc('strategy.declared', { objectives: [OBJ] })), 'a declaration is not an impact').toEqual([]);
    expect(warningOriginItems(gc('invalidation.assessed', { objectives: ['not-a-uuid'] }))).toEqual([]);
  });
  it('forecast revision: superseded, withdrawn or assessed unfit — one item per forecast (the typed block included)', () => {
    expect(warningOriginItems(gc('forecast.superseded', { forecasts: [FCT] }))).toEqual([`forecast_revision:${FCT}`]);
    expect(warningOriginItems(gc('forecast.withdrawn', {}, { forecast: { forecast_id: FCT } }))).toEqual([`forecast_revision:${FCT}`]);
    expect(warningOriginItems(gc('forecast.fitness_changed', { twins: [TWN] }, { forecast_fitness: { forecast_id: FCT } })), 'a fitness change is not a twin degradation').toEqual([`forecast_revision:${FCT}`]);
  });
  it('twin degradation: a twin version admitted, or a twin the walk reached; a projection rebuild changes no fact', () => {
    expect(warningOriginItems(gc('twin.state_changed', {}, { twin: { twin_id: TWN, version: 2 } }))).toEqual([`twin_degradation:${TWN}`]);
    expect(warningOriginItems(gc('invalidation.assessed', { objectives: [OBJ], twins: [TWN] }))).toEqual([`graph_impact:${OBJ}`, `twin_degradation:${TWN}`]);
    expect(warningOriginItems(gc('projection.rebuilt', { twins: [TWN] }))).toEqual([]);
    expect(warningOriginItems({ event_id: EV, event_type: 'MemoryCorrected', payload: {} as never })).toEqual([]);
  });
  it('the candidate of each origin: its key (event + item), its cause, its affected block; C2, confidence not stated', () => {
    expect(readOriginItem(`graph_impact:${OBJ}`)).toEqual({ origin: 'graph_impact', subjectId: OBJ });
    expect(readOriginItem('something:else')).toBeNull();
    const g = candidateOf(gc('invalidation.assessed', { objectives: [OBJ] }), `graph_impact:${OBJ}`, { label: 'Keep the line running', horizon: null }, 'sub')!;
    expect(g).toMatchObject({ originKind: 'graph_impact', originKey: `${EV}:graph_impact:${OBJ}`, causeKey: `graph:${INV}`, consequenceClass: 'C2', confidence: null,
                              affected: { objectives: [OBJ], geographies: [], horizon: null }, title: 'Graph impact on objective "Keep the line running" (invalidation.assessed)' });
    const f = candidateOf(gc('forecast.withdrawn', { forecasts: [FCT], objectives: [OBJ] }), `forecast_revision:${FCT}`, { label: 'transits 30d', horizon: '30d' }, 'sub')!;
    expect(f).toMatchObject({ originKind: 'forecast_revision', causeKey: `forecast:${FCT}`, affected: { objectives: [OBJ], horizon: '30d' }, originRef: { forecast_id: FCT, change_kind: 'forecast.withdrawn' } });
    const t = candidateOf(gc('twin.state_changed', { twins: [TWN] }, { twin: { twin_id: TWN, version: 2, runs_of_superseded: 4 } }), `twin_degradation:${TWN}`, { label: null, horizon: null }, 'sub')!;
    expect(t).toMatchObject({ originKind: 'twin_degradation', causeKey: `twin:${TWN}`, affected: { assets: [TWN] }, originRef: { twin_version: 2, runs_of_superseded: 4 } });
    expect(t.title).toMatch(/^Twin "0190b1c2…" degraded/);
  });
});

describe('B28 warnings · the window and the intakes', () => {
  it('the window: 72 h by default, closing at an earlier deadline; raised at or after the deadline is a missed decision; no deadline is T3 unmeasured', () => {
    const now = '2026-09-26T10:00:00.000Z';
    expect(candidateWindow(now, null, null)).toEqual({ opensAt: now, closesAt: '2026-09-29T10:00:00.000Z', timely: null, decisionMissed: false });
    expect(candidateWindow(now, 24, '2026-09-26T20:00:00.000Z')).toEqual({ opensAt: now, closesAt: '2026-09-26T20:00:00.000Z', timely: true, decisionMissed: false });
    expect(candidateWindow(now, 24, '2026-09-30T20:00:00.000Z').closesAt).toBe('2026-09-27T10:00:00.000Z');
    expect(candidateWindow(now, 24, now)).toEqual({ opensAt: now, closesAt: '2026-09-27T10:00:00.000Z', timely: false, decisionMissed: true });
  });
  it('the context names the version it read and the four blocks\' shapes', () => {
    expect(validateContext({ expected_version: 0 }, 'c')).toEqual({ expectedVersion: 0, contradicting: [], affected: {}, falsification: [], playbook: null });
    status422(() => validateContext({ contradicting: [] }, 'c'), /expected_version is the context version read/);
    status422(() => validateContext({ expected_version: 1, contradicting: {} }, 'c'), /contradicting is a list/);
    status422(() => validateContext({ expected_version: 1, affected: [] }, 'c'), /affected is \{objectives/);
    status422(() => validateContext({ expected_version: 1, playbook: 'simulate it' }, 'c'), /playbook is \{kind: verification \| simulation/);
  });
  it('a closure names a criterion and a reason; the condition and the original ride the reference', () => {
    expect(validateClose({ criterion: 'falsified', condition: 0, reason: 'the transits recovered' }, 'c')).toEqual({ criterion: 'falsified', ref: { condition: 0 }, reason: 'the transits recovered' });
    expect(validateClose({ criterion: 'duplicate', duplicate_of: W, reason: 'the same attack' }, 'c').ref).toEqual({ warning_id: W });
    status422(() => validateClose({ criterion: 'forgotten', reason: 'not a criterion' }, 'c'), /criterion is one of resolved, falsified, duplicate, no_longer_relevant/);
    status422(() => validateClose({ criterion: 'resolved', reason: 'short' }, 'c'), /8–2000 characters/);
  });
  it('feedback is one of five kinds; an evaluation names its window and sample floor', () => {
    expect(validateFeedback({ kind: 'late', note: '  after the window  ' }, 'c')).toEqual({ kind: 'late', note: 'after the window' });
    status422(() => validateFeedback({ kind: 'meh' }, 'c'), /kind is one of false, late, missed, duplicated, useful/);
    expect(validateWarningEvaluation({}, 'c')).toEqual({ windowFrom: null, windowTo: null, minSample: 5 });
    status422(() => validateWarningEvaluation({ min_sample: 0 }, 'c'), /min_sample is a whole number/);
    status422(() => validateWarningEvaluation({ window_from: '2026-09-26T00:00:00Z', window_to: '2026-09-25T00:00:00Z' }, 'c'), /window_to is at or after window_from/);
  });
});

describe('B28 warnings · the refusal rows (B9 order; anchored)', () => {
  it('403 the standing', () => {
    for (const f of ['context', 'closure', 'feedback', 'evaluation']) answer('42501', `warning ${f} rejected: recorded by the acting principal`, 403, 'EYE-AUT-001');
    answer('42501', `warning context rejected: the context is set by the warning's owner (${W}) or a domain administrator`, 403, 'EYE-AUT-001');
    answer('42501', `warning closure rejected (not_owner): a warning is closed by its owner (${W}) or a domain administrator`, 403, 'EYE-AUT-001');
    answer('42501', 'warning feedback rejected: feedback is a named human\'s act', 403, 'EYE-AUT-001');
    answer('42501', 'warning evaluation rejected: the warnings are evaluated by a named human holding executive, domain_admin or platform_admin', 403, 'EYE-AUT-001');
  });
  it('404 the absences', () => {
    for (const m of [`warning context rejected: no such warning ${W} in this domain`, `warning context rejected: no such object ${W} in this domain (contradicting evidence)`,
                     `warning context rejected: no such objective ${W} in this domain`, `warning context rejected: no such indicator ${W} in this domain`,
                     `warning context rejected: no such scenario ${W} in this domain (playbook)`, `warning context rejected: no such branch ${W} of scenario ${W} (playbook)`,
                     `warning context rejected: no such run ${W} in this domain (playbook)`, `warning closure rejected: no such warning ${W} in this domain`,
                     `warning closure rejected: no such warning ${W} in this domain (the duplicate's original)`, `warning feedback rejected: no such warning ${W} in this domain`,
                     `warning cluster rejected: no such candidate ${W} in this domain`]) answer('23503', m, 404, 'EYE-STA-001');
  });
  it('409 the record\'s state', () => {
    answer('22023', 'warning context rejected (stale_version): the context stands at version 1, not 0', 409, 'EYE-STA-002');
    answer('22023', `warning context rejected (closed): warning ${W} was closed at 2026-09-26 10:00:00+00; its context is history`, 409, 'EYE-STA-002');
    answer('22023', `warning closure rejected (not_open): warning ${W} is closed`, 409, 'EYE-STA-002');
    answer('22023', `warning closure rejected (no_falsification): warning ${W} declares no falsification condition; set the context first`, 409, 'EYE-STA-002');
    answer('22023', `warning cluster rejected (not_pending): candidate ${W} is raised`, 409, 'EYE-STA-002');
  });
  it('422 the caller\'s own request; the older `warning rejected` row untouched', () => {
    for (const m of ['warning context rejected: affected.objectives lists objective ids', 'warning context rejected: each falsification condition is {condition: 8+ characters, indicator_id?: uuid}',
                     'warning closure rejected: the criterion is resolved, falsified, duplicate or no_longer_relevant', 'warning closure rejected: condition 3 is not one of the 1 declared',
                     'warning feedback rejected: false feedback carries a note of at least 8 characters (what was wrong)', 'warning evaluation rejected: the window ends before it begins',
                     'warning cluster rejected: the batch is 1..200 candidates', `warning cluster rejected: warning ${W} carries no cluster`]) answer('22023', m, 422, 'EYE-REQ-001');
    answer('23514', 'warning rejected: a warning raised since 0061 carries its derived level (level, level_version, urgency, consequence_class, op_class)', 422, 'EYE-REQ-001');
  });
});

describe('B28 warnings · the PDP and the tick steps', () => {
  const pdp = new PdpService();
  const T = '0190b1c2-d3e4-7000-8000-00000000000a'; const D = '0190b1c2-d3e4-7000-8000-00000000000b';
  const decide = (action: string, role: string, scope: 'DOMAIN' | 'TENANT' = 'DOMAIN') => pdp.evaluate({ action, principal: { principalId: W, kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope, tenantId: T, domainId: scope === 'DOMAIN' ? D : null }] },
    delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'prediction', consequenceClass: 'C2', objectType: 'WRN', objectId: null,
    environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput);
  it('seven exact rules: processing is the raisers\', context and closure the foresight owners\', feedback any decision or foresight human\'s, the evaluation the executive\'s', () => {
    expect(decide('prediction.warning.candidates.process', 'forecast_owner')).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'human_gate' }] });
    for (const role of ['strategy_owner', 'domain_analyst', 'forecast_agent']) expect(decide('prediction.warning.candidates.process', role).decision, role).toBe('deny');
    for (const action of ['prediction.warning.context.set', 'prediction.warning.close']) {
      for (const role of ['strategy_owner', 'forecast_owner', 'domain_admin', 'executive']) expect(decide(action, role).decision, `${action} ${role}`).toBe('allow_with_obligations');
      for (const role of ['domain_analyst', 'collection_manager', 'warning_subscriber']) expect(decide(action, role).decision, `${action} ${role}`).toBe('deny');
    }
    for (const role of ['executive', 'decision_owner', 'domain_analyst', 'strategy_owner']) expect(decide('prediction.warning.feedback', role).decision, role).toBe('allow_with_obligations');
    for (const role of ['forecast_agent', 'warning_subscriber']) expect(decide('prediction.warning.feedback', role).decision, role).toBe('deny');
    expect(decide('prediction.warning.feedback', 'auditor', 'TENANT').decision).toBe('deny');
    for (const role of ['executive', 'domain_admin']) expect(decide('prediction.warning.evaluate', role).decision, role).toBe('allow_with_obligations');
    for (const role of ['forecast_owner', 'strategy_owner']) expect(decide('prediction.warning.evaluate', role).decision, role).toBe('deny');
    expect(decide('prediction.warning.evaluations.read', 'auditor', 'TENANT').decision).toBe('allow_with_obligations');
    expect(decide('prediction.warning.evaluations.read', 'collection_manager').decision).toBe('deny');
    expect(decide('prediction.warning.subscription.apply', 'warning_subscriber').decision).toBe('allow');
    expect(decide('prediction.warning.subscription.apply', 'attention_subscriber').decision).toBe('deny');
    // the prefix rules of the warnings still answer for their own actions only
    expect(decide('prediction.warning.raise', 'forecast_owner').decision).toBe('allow');
    expect(decide('prediction.warning.closed', 'forecast_owner').decision, 'exact: no prefix match').toBe('indeterminate');
  });
  it('the section registers warning-candidates (5) and warning-expiry (6), before the escalation (10)', () => {
    const reg = new AttentionTickRegistry();
    new WarningLifecycleService(reg).onModuleInit();
    expect(reg.steps().map((s) => [s.name, s.order])).toEqual([[WARNING_CANDIDATES_STEP, 5], [WARNING_EXPIRY_STEP, 6]]);
    expect(() => new WarningLifecycleService(reg).onModuleInit()).toThrow(/registered twice/);
  });
});
