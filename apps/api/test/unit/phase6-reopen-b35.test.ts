/**
 * CP-6 B35 part `reopen` (0101 §P) — the pure logic: the route validators (the change of conditions, the reopen's cause, the reversion's
 * resolution, the outcome assessment and its separation rule, the review terms, the replay's reason, the lesson, the cadence); EVERY refusal
 * text of the part (the ports' and the validators') through the observation-errors mapper in the B9 order (403 actor/ownership, 404
 * unknown_*, 409 state/stale/duplicate/append_only/cause_state, 422 the rest) with no older row catching them; the PDP's exact rules placed
 * before the `decision.review` and `decision.package.` prefixes; the two tick steps' names and orders.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import {
  CITED_RELEVANCE_ORDER, CITED_RELEVANCE_STEP, REOPEN_CAUSES, REVIEW_CADENCE_ORDER, REVIEW_CADENCE_STEP, separationProblem, validateCadence, validateCause, validateChange, validateLesson,
  validateOutcome, validateReplay, validateResolution, validateTerms, versionOf,
} from '../../src/decision/review/review.service.js';

const C = '00000000-0000-4000-8000-000000000001';
const U = '01a0f78e-7d30-7cea-9b84-1f614e716085';
const U2 = '01a0f78e-7d30-7cea-9b84-1f614e716086';
const msg = (f: () => unknown): string => {
  try { f(); } catch (e) { if (e instanceof HttpException) return String((e.getResponse() as { message?: string }).message); throw e; }
  return '';
};
const outcome = (over: Record<string, unknown> = {}) => ({
  observed: { outcomeIds: [U], statement: 'three days of line stop over the quarter' },
  inferred: { statement: 'the reroute saved about eleven line days', method: 'simulation_comparison', confidence: 0.6 },
  counterfactual: { claim: 'without it the line stops for fourteen days', basis: { kind: 'run', runId: U2 } },
  changedConditions: [{ condition: 'the corridor reopened in March', effect: 'rates fell' }], ...over,
});

describe('B35 reopen · the route validators', () => {
  it('the change of conditions: a name, a statement, 1–20 evidence items {kind, id, note?}', () => {
    expect(validateChange({ title: 'The corridor reopens', statement: 'transits resumed above the seasonal level', evidence: [{ kind: 'indicator', id: U.toUpperCase(), note: ' up ' }] }, C))
      .toEqual({ title: 'The corridor reopens', statement: 'transits resumed above the seasonal level', evidence: [{ kind: 'indicator', id: U, note: 'up' }] });
    expect(msg(() => validateChange({ title: 'x', statement: 'transits resumed above the seasonal level', evidence: [] }, C))).toMatch(/^review rejected \(title\)/);
    expect(msg(() => validateChange({ title: 'The corridor reopens', statement: 'short', evidence: [] }, C))).toMatch(/^review rejected \(statement\)/);
    expect(msg(() => validateChange({ title: 'The corridor reopens', statement: 'transits resumed above the seasonal level', evidence: [] }, C))).toMatch(/^review rejected \(evidence\)/);
    expect(msg(() => validateChange({ title: 'The corridor reopens', statement: 'transits resumed above the seasonal level', evidence: [{ kind: 'rumour', id: U }] }, C))).toMatch(/^review rejected \(evidence\): item 1/);
  });
  it('the reopen cause: six kinds, named by a uuid; the reversion resolution', () => {
    expect(REOPEN_CAUSES).toEqual(['input_invalidated', 'condition_breach', 'policy_changed', 'challenge_upheld', 'appeal_upheld', 'conditions_changed']);
    expect(validateCause({ kind: 'challenge_upheld', ref: U }, C)).toEqual({ kind: 'challenge_upheld', ref: U });
    expect(msg(() => validateCause({ kind: 'corridor_reopened', ref: U }, C))).toMatch(/^reopen rejected \(cause\)/);
    expect(msg(() => validateCause({ kind: 'appeal_upheld' }, C))).toMatch(/^reopen rejected \(cause\)/);
    expect(validateResolution({ resolution: 'reversioned', note: 'branch added' }, C)).toEqual({ resolution: 'reversioned', note: 'branch added' });
    expect(msg(() => validateResolution({ resolution: 'declined', note: 'too short' }, C))).toMatch(/^review rejected \(note\)/);
    expect(msg(() => validateResolution({ resolution: 'done', note: 'branch added' }, C))).toMatch(/^review rejected \(resolution\)/);
  });
  it('the outcome assessment: four fields in shape; the separation rule; a revision names the assessment read', () => {
    const o = validateOutcome(outcome({ supersedes: U2 }), C);
    expect(o).toMatchObject({ observed: { outcome_ids: [U] }, inferred: { method: 'simulation_comparison', confidence: 0.6, magnitude: null }, counterfactual: { basis: { kind: 'run', run_id: U2 } }, supersedes: U2 });
    expect(validateOutcome(outcome({ counterfactual: { claim: 'without it the line stops for fourteen days', basis: { kind: 'stated_model', model: 'line days lost per closure week, times the weeks' } }, changedConditions: undefined }), C).changed).toEqual([]);
    expect(msg(() => validateOutcome(outcome({ observed: { outcomeIds: [], statement: 'three days of line stop over the quarter' } }), C))).toMatch(/^review rejected \(observed\)/);
    expect(msg(() => validateOutcome(outcome({ inferred: { statement: 'the reroute saved about eleven line days', method: 'guess', confidence: 0.6 } }), C))).toMatch(/^review rejected \(inferred\)/);
    expect(msg(() => validateOutcome(outcome({ counterfactual: { claim: 'without it the line stops for fourteen days', basis: { kind: 'feeling' } } }), C))).toMatch(/^review rejected \(counterfactual\)/);
    expect(msg(() => validateOutcome(outcome({ inferred: { statement: 'Three days of line stop over the quarter', method: 'regression', confidence: 0.5 } }), C))).toMatch(/^review rejected \(separation\): .* repeats the observed result/);
    expect(separationProblem({ observed: 'a', inferred: 'b', counterfactual: 'c', changed: ['C '] })).toMatch(/changed condition "C " repeats/);
    expect(separationProblem({ observed: 'a', inferred: 'b', counterfactual: 'c', changed: ['d'] })).toBeNull();
  });
  it('the terms, the replay, the lesson, the cadence, the version', () => {
    expect(validateTerms({ baseline: { kind: 'stated', ref: 'ignored', statement: 'no line stop at all' }, replayHorizonDays: 180, evidenceStandard: 'reviewed', evidenceNote: 'reviewed inputs only' }, C))
      .toEqual({ baseline: { kind: 'stated', ref: null, statement: 'no line stop at all' }, horizonDays: 180, standard: 'reviewed', note: 'reviewed inputs only', expected: null });
    expect(msg(() => validateTerms({ baseline: { kind: 'run', ref: 'x', statement: 'the control run' }, replayHorizonDays: 180, evidenceStandard: 'reviewed', evidenceNote: 'reviewed inputs only' }, C))).toMatch(/^review rejected \(baseline\)/);
    expect(msg(() => validateTerms({ baseline: { kind: 'stated', statement: 'no line stop at all' }, replayHorizonDays: 0, evidenceStandard: 'reviewed', evidenceNote: 'reviewed inputs only' }, C))).toMatch(/^review rejected \(replay_horizon\)/);
    expect(msg(() => validateTerms({ baseline: { kind: 'stated', statement: 'no line stop at all' }, replayHorizonDays: 9, evidenceStandard: 'gold', evidenceNote: 'reviewed inputs only' }, C))).toMatch(/^review rejected \(evidence_standard\)/);
    expect(validateReplay({ reason: 'the board asks why', asOf: 'nonsense' }, C)).toEqual({ reason: 'the board asks why', asOf: null });
    expect(msg(() => validateReplay({ reason: 'why' }, C))).toMatch(/^review rejected \(reason\)/);
    expect(validateLesson({ kind: 'hypothesis', memoryItemId: U }, C)).toEqual({ kind: 'hypothesis', memoryItemId: U });
    expect(msg(() => validateLesson({ kind: 'moral', memoryItemId: U }, C))).toMatch(/^review rejected \(kind\)/);
    expect(validateCadence({ everyDays: 7, rationale: 'the corridor moves weekly', anchorAt: '2026-09-20T10:00:00Z' }, C)).toEqual({ everyDays: 7, anchorAt: '2026-09-20T10:00:00.000Z', rationale: 'the corridor moves weekly', expected: null });
    expect(msg(() => validateCadence({ everyDays: 400, rationale: 'the corridor moves weekly' }, C))).toMatch(/^review rejected \(every_days\)/);
    expect(msg(() => validateCadence({ everyDays: 7, rationale: 'the corridor moves weekly', expectedVersion: 0 }, C))).toMatch(/^review rejected \(stale\)/);
    expect(versionOf('3', C)).toBe(3);
    expect(msg(() => versionOf('0', C))).toMatch(/^review rejected \(version\)/);
  });
  it('the tick steps: cited-scenario-relevance 72, review-cadence 73', () => {
    expect([CITED_RELEVANCE_STEP, CITED_RELEVANCE_ORDER, REVIEW_CADENCE_STEP, REVIEW_CADENCE_ORDER]).toEqual(['cited-scenario-relevance', 72, 'review-cadence', 73]);
  });
});

describe('B35 reopen · every refusal text through the mapper (B9 order; no older row catches them)', () => {
  const TEXTS: Array<[string, number, string]> = [
    ['review rejected (actor): a change of conditions is recorded by the acting principal', 403, '42501'],
    ['review rejected (ownership): the package owner sets its review terms', 403, '42501'],
    ['review rejected (ownership): the scenario\'s owner resolves its reversion request', 403, '42501'],
    ['review rejected (unknown_package): p is not a decision package of this domain', 404, '23503'],
    ['review rejected (unknown_evidence): warning w is not a recorded object of this domain', 404, '23503'],
    ['review rejected (unknown_outcome): o is not a recorded outcome of version 1 of package p', 404, '23503'],
    ['review rejected (unknown_memory_item): m is not a memory record of this domain', 404, '23503'],
    ['review rejected (unknown_set): s is not a scenario set of this domain', 404, '23503'],
    ['review rejected (state): package p is reopened; a change of conditions is recorded against a standing commitment', 409, '22023'],
    ['review rejected (state): scenario s is still at version 1 (the version at the request); re-version it through the scenario route first', 409, '22023'],
    ['review rejected (stale): the newest assessment of version 1 is none; a revision names the assessment it read', 409, '22023'],
    ['review rejected (duplicate): memory record m is already linked to assessment a', 409, '22023'],
    ['review rejected (append_only): reversion request r is written once and resolved once', 409, '2F002'],
    ['review rejected (separation): the observed result, the inferred contribution, the counterfactual claim and the changed conditions are separate statements; one repeats another', 422, '22023'],
    ['review rejected (memory_item): memory record m does not name the package\'s decision (related.decisionId d)', 422, '22023'],
    ['review rejected (anchor): the anchor is the last review held — an instant within the last ten years, never in the future', 422, '22023'],
    ['reopen rejected (unknown_challenge): no such challenge c on package p', 404, '23503'],
    ['reopen rejected (unknown_appeal): no appeal cases are recorded in this database (appeal a)', 404, '23503'],
    ['reopen rejected (unknown_change): no such change of conditions c on package p', 404, '23503'],
    ['reopen rejected (cause_state): challenge c is open, effect none; only a challenge upheld after the commitment (reopen_required) is a cause to reopen', 409, '22023'],
    ['reopen rejected (cause_state): conditions changed c already reopened package p; a recorded cause reopens a decision once', 409, '22023'],
    // the older unclassed reopen texts keep their rows
    ['reopen rejected: no such note n on package p', 404, '23503'],
    ['reopen rejected: package p is reopened with version 2 open; propose and commit it before reopening again', 409, '22023'],
    ['reopen rejected: the package owner reopens it', 403, '42501'],
  ];
  it.each(TEXTS)('%s → %i', (t, status, code) => {
    const e = asObservationRefusal({ code, message: t }, C);
    expect(e, t).not.toBeNull();
    expect(e!.getStatus(), t).toBe(status);
    expect(String((e!.getResponse() as { message?: string }).message)).toBe(t);
  });
});

describe('B35 reopen · the PDP: exact rules before the prefixes; human-gated writes; no agent', () => {
  const T = '0193a3d0-0000-7000-8000-000000000001'; const D = '0193a3d0-0000-7000-8000-000000000002';
  const pdp = new PdpService();
  const allowed = (r: { decision: string }) => r.decision === 'allow' || r.decision === 'allow_with_obligations';
  const evaluate = (action: string, roles: string[], kind: 'human' | 'agent' = 'human') => pdp.evaluate({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: 'password', bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
    delegationId: null, action, objectType: 'DPK', objectId: null, purposeId: 'decision', context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  } as PolicyInput);
  it('the reads: the analyst and the strategy owner read; the decision agent does not (the `decision.review` prefix would have let only owners through)', () => {
    expect(allowed(evaluate('decision.review.read', ['domain_analyst']))).toBe(true);
    expect(allowed(evaluate('decision.review.metrics', ['strategy_owner']))).toBe(true);
    expect(evaluate('decision.review.read', ['decision_agent']).decision).toBe('deny');
  });
  it('the writes: each its roles, human-gated', () => {
    for (const [a, yes, no] of [['decision.review.change', 'domain_analyst', 'forecast_owner'], ['decision.review.outcome', 'decision_owner', 'decision_approver'], ['decision.review.terms', 'decision_owner', 'executive'],
      ['decision.review.lesson', 'strategy_owner', 'domain_analyst'], ['decision.review.reversion', 'strategy_owner', 'domain_analyst'], ['prediction.scenario.set.cadence', 'strategy_owner', 'domain_analyst']] as const) {
      const p = evaluate(a, [yes]);
      expect(allowed(p), a).toBe(true);
      expect(p.obligations.some((o) => o.type === 'human_gate'), a).toBe(true);
      expect(evaluate(a, [no]).decision, `${a} ${no}`).toBe('deny');
    }
  });
  it('the existing rules are unchanged: decision.review (prefix) still serves the room review; decision.package.reopen is the owner\'s', () => {
    expect(allowed(evaluate('decision.review', ['decision_approver']))).toBe(true);
    expect(allowed(evaluate('decision.package.reopen', ['decision_owner']))).toBe(true);
    expect(evaluate('decision.package.reopen', ['decision_authority']).decision).toBe('deny');
  });
});
