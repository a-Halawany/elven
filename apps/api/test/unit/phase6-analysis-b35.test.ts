/**
 * CP-6 B35 part `analysis` (0101 §A) — the pure core: the intake's shape checks, the MIRROR of the server's scores, weight sensitivity,
 * dominance and the adversarial response (the harness compares the server against it), the PDP rules (exact, the agent's reach) and the
 * refusal family's mapping.
 */
import { describe, expect, it } from 'vitest';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import {
  applyResponse, dominance, scoreOptions, validateAdversarial, validateAssess, validateCriteria, validateJudgments, validateObligation, versionOf, weightSensitivity, type MirrorCriterion,
} from '../../src/decision/analysis/analysis-core.js';

const U = '0193a3d0-0000-7000-8000-0000000000aa';
const CRIT: MirrorCriterion[] = [{ key: 'line_stop', weight: 5, direction: 'min' }, { key: 'cost', weight: 3, direction: 'min' }, { key: 'customs', weight: 2, direction: 'min' }];
const VALUES = { 'status-quo': { line_stop: 20, cost: 0, customs: 3 }, morocco: { line_stop: 4, cost: 480, customs: 7 }, buffer: { line_stop: 10, cost: 260, customs: 3 } };

describe('the scores (decision.dsa_scores mirrored)', () => {
  it('min-max normalises each criterion with its direction and weighs Σ w·n / Σ w; an option with a missing cell is not ranked', () => {
    const m = scoreOptions(CRIT, VALUES);
    expect(m.normalised['morocco']).toEqual({ line_stop: 1, cost: 0, customs: 0 });
    expect(m.normalised['status-quo']).toEqual({ line_stop: 0, cost: 1, customs: 1 });
    expect(m.scores['morocco']).toBeCloseTo(0.5, 9);
    expect(m.scores['status-quo']).toBeCloseTo(0.5, 9);
    expect(m.scores['buffer']).toBeCloseTo((5 * (10 / 16) + 3 * (220 / 480) + 2 * 1) / 10, 9);
    expect(m.ranking).toEqual(['buffer', 'morocco', 'status-quo']);
    const missing = scoreOptions(CRIT, { ...VALUES, defer: { line_stop: 1 } });
    expect(missing.scores['defer']).toBeNull();
    expect(missing.ranking).not.toContain('defer');
  });
  it('all-equal values normalise to 1 (the criterion does not discriminate)', () => {
    expect(scoreOptions([{ key: 'x', weight: 1, direction: 'max' }], { a: { x: 2 }, b: { x: 2 } }).normalised).toEqual({ a: { x: 1 }, b: { x: 1 } });
  });
});

describe('the weight sensitivity (decision.dsa_sensitivity mirrored)', () => {
  it('names the weight at which another option takes the lead, above and below; enacting it changes the leader', () => {
    const m = scoreOptions(CRIT, VALUES);
    const s = weightSensitivity(CRIT, m);
    expect(s.leader).toBe('buffer');
    const ls = s.criteria.find((c) => c.key === 'line_stop')!;
    expect(ls.flipUp?.to).toBe('morocco');
    const w = ls.flipUp!.weight;
    const after = scoreOptions(CRIT.map((c) => (c.key === 'line_stop' ? { ...c, weight: w * 1.01 } : c)), VALUES);
    expect(after.ranking[0]).toBe('morocco');
    const before = scoreOptions(CRIT.map((c) => (c.key === 'line_stop' ? { ...c, weight: w * 0.99 } : c)), VALUES);
    expect(before.ranking[0]).toBe('buffer');
    expect(s.mostSensitive).not.toBeNull();
  });
  it('one ranked option has no sensitivity', () => {
    expect(weightSensitivity(CRIT, scoreOptions(CRIT, { a: { line_stop: 1, cost: 1, customs: 1 } })).criteria).toEqual([]);
  });
});

describe('dominance and the adversarial response', () => {
  it('X dominates Y when at least as good everywhere and better somewhere', () => {
    const m = scoreOptions(CRIT, { a: { line_stop: 1, cost: 1, customs: 1 }, b: { line_stop: 2, cost: 1, customs: 1 }, c: { line_stop: 0, cost: 9, customs: 1 } });
    expect(dominance(CRIT, m)).toEqual([{ dominant: 'a', dominated: 'b' }]);
  });
  it('a response model adds, multiplies or sets — declared changes, nothing evaluated', () => {
    expect(applyResponse({ customs: 4, cost: 480, line_stop: 4 }, [{ criterion: 'customs', op: 'add', value: 10 }, { criterion: 'cost', op: 'multiply', value: 1.2 }, { criterion: 'line_stop', op: 'set', value: 9 }]))
      .toEqual({ customs: 14, cost: 576, line_stop: 9 });
  });
});

describe('the intake (shape only; the ports decide)', () => {
  it('criteria, an assessment, an obligation, judgments and a response are checked for shape', () => {
    const c = { key: 'cost', title: 'Cost', objectiveId: U, direction: 'min', weight: 3, scale: 'ratio', unit: 'EUR k' };
    expect('ok' in validateCriteria({ criteria: [c], valueOwner: U, rationale: 'why this weighting', expectedVersion: null })).toBe(true);
    expect(validateCriteria({ criteria: [], valueOwner: U, rationale: 'x' })).toEqual({ problem: expect.stringMatching(/^analysis rejected \(criteria\)/) });
    expect(validateCriteria({ criteria: [{ ...c, direction: 'up' }], valueOwner: U, rationale: 'x' })).toEqual({ problem: expect.stringMatching(/states its direction/) });
    expect(validateCriteria({ criteria: [c], valueOwner: 'nobody', rationale: 'x' })).toEqual({ problem: expect.stringMatching(/^analysis rejected \(value_owner\)/) });
    expect(validateAssess({ option: 'a', criterion: 'b', cited: { kind: 'run', id: 'x', measure: 'm' } })).toEqual({ problem: expect.stringMatching(/^analysis rejected \(cited\)/) });
    expect(validateAssess({ option: 'a', criterion: 'b', value: 'seven' })).toEqual({ problem: expect.stringMatching(/^analysis rejected \(value\)/) });
    expect(validateObligation({ key: 'k', kind: 'obligation', statement: 's', owner: U })).toEqual({ problem: expect.stringMatching(/^analysis rejected \(test\)/) });
    expect(validateJudgments({ judgments: [{ obligation: 'k' }] })).toEqual({ problem: expect.stringMatching(/^analysis rejected \(judgment\)/) });
    expect(validateJudgments({})).toEqual({ ok: [] });
    expect(validateAdversarial({ option: 'a', actorElementId: U, response: 'r', basis: 'b', effects: [{ criterion: 'c', op: 'add' }] })).toEqual({ problem: expect.stringMatching(/^analysis rejected \(effects\)/) });
    expect(versionOf('2')).toBe(2); expect(versionOf('0')).toBeNull(); expect(versionOf('x')).toBeNull();
  });
});

describe('the refusal family `analysis rejected (<class>)`', () => {
  const C = 'corr';
  it('maps actor/ownership/authority → 403, unknown_* → 404, state/stale/duplicate → 409, the rest → 422, with the port\'s own words', () => {
    const at = (code: string, message: string) => asObservationRefusal({ code, message }, C)!;
    expect(at('42501', 'analysis rejected (ownership): the criteria of package "x" are set by its owner').getStatus()).toBe(403);
    expect(at('42501', 'analysis rejected (authority): a weight is a named human\'s act').getStatus()).toBe(403);
    expect(at('23503', 'analysis rejected (unknown_objective): x').getStatus()).toBe(404);
    expect(at('22023', 'analysis rejected (stale): the criteria were read at version 1').getStatus()).toBe(409);
    expect(at('22023', 'analysis rejected (duplicate): package "x" already declares').getStatus()).toBe(409);
    expect(at('22023', 'analysis rejected (agency): actor "x" has low agency').getStatus()).toBe(422);
    expect((at('22023', 'analysis rejected (weight): criterion cost').getResponse() as { message: string }).message).toBe('analysis rejected (weight): criterion cost');
    // B31's noun is another family, anchored
    expect(at('22023', 'impact analysis rejected (state): run x').getStatus()).toBe(409);
  });
});

describe('the PDP rules (exact; the agent drafts, never weighs)', () => {
  const pdp = new PdpService();
  const T = '0193a3d0-0000-7000-8000-000000000001'; const D = '0193a3d0-0000-7000-8000-000000000002';
  const input = (action: string, roles: string[]): PolicyInput => ({
    principal: { principalId: U, kind: 'human', assurance: 'password', bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
    delegationId: null, action, objectType: 'DPK', objectId: null, purposeId: 'decision', context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  it('the decision agent generates and assembles, and is refused the weights, the assessments, the obligations and the responses', () => {
    for (const a of ['decision.analysis.generate', 'decision.analysis.assemble', 'decision.analysis.read']) expect(pdp.evaluate(input(a, ['decision_agent'])).decision).not.toBe('deny');
    for (const a of ['decision.analysis.criteria', 'decision.analysis.assess', 'decision.analysis.obligation', 'decision.analysis.evaluate', 'decision.analysis.adversarial']) expect(pdp.evaluate(input(a, ['decision_agent'])).decision).toBe('deny');
  });
  it('the weights are human-gated for the owner; no analysis rule reaches C3; no other rule catches these names', () => {
    expect(pdp.evaluate(input('decision.analysis.criteria', ['decision_owner'])).obligations).toEqual([{ type: 'human_gate' }]);
    expect(pdp.evaluate({ ...input('decision.analysis.criteria', ['decision_owner']), consequenceClass: 'C3' }).decision).toBe('deny');
    expect(pdp.evaluate(input('decision.analysis.criteria', ['domain_analyst'])).decision).toBe('deny');
    expect(pdp.evaluate(input('decision.analysis.unknown', ['decision_owner'])).decision).not.toMatch(/^allow/);
  });
});
