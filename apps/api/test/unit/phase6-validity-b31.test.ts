/**
 * CP-6 B31 part `validity` (0099 §V) — the pure logic: the route validators (the policy, the reach, the binding, the retirement, the
 * comparison's run ids), the comparison's verdict over the decision uses, and EVERY refusal text of the part (the ports' and the
 * validators') through the observation-errors mapper — the B9 order (403 actor/ownership, 404 unknown_*, 409 state/stale/duplicate/the
 * gate's classes/the run and promotion gates, 422 the rest), and no older row catching them.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { comparisonVerdict, validateBinding, validatePolicy, validateReach, validateRetirement, validateRunIds } from '../../src/twin/simulations/validity/validity.service.js';

const C = '00000000-0000-4000-8000-000000000001';
const U = '01a0f78e-7d30-7cea-9b84-1f614e716085';
const msg = (f: () => unknown): string => {
  try { f(); } catch (e) { if (e instanceof HttpException) return String((e.getResponse() as { message?: string }).message); throw e; }
  return '';
};

describe('B31 validity · the route validators', () => {
  it('the policy: require is a boolean, the rationale 16–2048, the version read a positive integer or none', () => {
    expect(validatePolicy({ require: true, rationale: 'only promoted results support a commitment' }, C)).toEqual({ require: true, rationale: 'only promoted results support a commitment', expectedVersion: null });
    expect(validatePolicy({ require: false, rationale: '  only promoted results support a commitment ', expectedVersion: 2 }, C)).toMatchObject({ require: false, expectedVersion: 2 });
    expect(msg(() => validatePolicy({ require: 'yes', rationale: 'only promoted results support a commitment' }, C))).toMatch(/^run use rejected \(require\)/);
    expect(msg(() => validatePolicy({ require: true, rationale: 'short' }, C))).toMatch(/^run use rejected \(rationale\)/);
    expect(msg(() => validatePolicy({ require: true, rationale: 'only promoted results support a commitment', expectedVersion: 0 }, C))).toMatch(/^run use rejected \(expected_version\)/);
  });
  it('the reach: a twin uuid and a positive version', () => {
    expect(validateReach({ twinId: U, version: 1 }, C)).toEqual({ twinId: U, version: 1 });
    expect(msg(() => validateReach({ twinId: 'x', version: 1 }, C))).toMatch(/^run use rejected \(twin\)/);
    expect(msg(() => validateReach({ twinId: U }, C))).toMatch(/^run use rejected \(version\)/);
  });
  it('the binding: twin, version, 1–50 conditions with keys (a value kept only when stated), the factor map, the rationale', () => {
    const b = validateBinding({ twinId: U, twinVersion: 2, initialConditions: [{ key: ' consumption.weekly ' }, { key: 'k', value: 0 }], assumptionFactors: [{ assumptionId: U, factorKey: 'route.delay' }], rationale: 'starts from the admitted state' }, C);
    expect(b).toEqual({ twinId: U, twinVersion: 2, conditions: [{ key: 'consumption.weekly' }, { key: 'k', value: 0 }], constraintSetId: null, assumptionFactors: [{ assumption_id: U, factor_key: 'route.delay', note: null }],
      rationale: 'starts from the admitted state', expectedVersion: null });
    expect(msg(() => validateBinding({ twinId: U, twinVersion: 0, initialConditions: [{ key: 'k' }], rationale: 'starts from here' }, C))).toMatch(/^branch binding rejected \(twin_version\)/);
    expect(msg(() => validateBinding({ twinId: U, twinVersion: 1, initialConditions: [], rationale: 'starts from here' }, C))).toMatch(/^branch binding rejected \(initial_conditions\)/);
    expect(msg(() => validateBinding({ twinId: U, twinVersion: 1, initialConditions: [{ value: 1 }], rationale: 'starts from here' }, C))).toMatch(/^branch binding rejected \(initial_conditions\): condition 1/);
    expect(msg(() => validateBinding({ twinId: U, twinVersion: 1, initialConditions: [{ key: 'k' }], assumptionFactors: [{ assumptionId: 'x', factorKey: 'f' }], rationale: 'starts from here' }, C))).toMatch(/^branch binding rejected \(assumption_factors\)/);
    expect(msg(() => validateBinding({ twinId: U, twinVersion: 1, initialConditions: [{ key: 'k' }], rationale: 'short' }, C))).toMatch(/^branch binding rejected \(rationale\)/);
    expect(msg(() => validateRetirement({ reason: 'too short' }, C))).toMatch(/^branch binding rejected \(reason\)/);
  });
  it('the comparison names 1–20 distinct runs', () => {
    expect(validateRunIds({ runIds: [U] }, C)).toEqual([U]);
    expect(msg(() => validateRunIds({ runIds: [] }, C))).toMatch(/^run use rejected \(run_ids\)/);
    expect(msg(() => validateRunIds({ runIds: [U, U] }, C))).toMatch(/a run is named once/);
  });
});

describe('B31 validity · the comparison verdict', () => {
  it('decision-grade only when every run is; refused named before diagnostic', () => {
    expect(comparisonVerdict([{ run_id: 'a', use: 'decision' }, { run_id: 'b', use: 'decision' }])).toMatchObject({ decision_grade: true, counts: { decision: 2, diagnostic: 0, refused: 0 } });
    expect(comparisonVerdict([{ run_id: 'a', use: 'decision' }, { run_id: 'b', use: 'diagnostic' }]).label).toBe('DIAGNOSTIC ONLY: 1 of 2 run(s) are partial, unpromoted, challenged or rest on a suspended or failing scenario');
    const v = comparisonVerdict([{ run_id: 'a', use: 'refused' }, { run_id: 'b', use: 'diagnostic' }]);
    expect(v).toMatchObject({ decision_grade: false, refused: ['a'], diagnostic: ['b'] });
    expect(v.label).toMatch(/^NOT FOR DECISION: 1 run\(s\) refused/);
    expect(comparisonVerdict([]).decision_grade).toBe(false);
  });
});

describe('B31 validity · every refusal text through the mapper', () => {
  const TEXTS: Array<[string, number]> = [
    ['run use rejected (actor): recorded by the acting principal', 403],
    ['run use rejected (actor): a named, active member sets the decision-use policy', 403],
    ['run use rejected (unknown_run): x is not a run of this domain', 404],
    ['run use rejected (unknown_package): x is not a package of this domain', 404],
    ['run use rejected (unknown_twin_version): version 9 of twin x is not a version in this domain', 404],
    ['run use rejected (state): version 1 of twin x is draft; only an admitted version carries runs', 409],
    ['run use rejected (stale): the domain\'s policy stands at version 1, the request names version <none>; reload and set it again', 409],
    ['run use rejected (diagnostic_only): package p version 1 recommends option "reroute", which cites run r — DIAGNOSTIC ONLY — not decision-active: unpromoted; the domain\'s decision-use policy (v1) requires a decision-grade result at the proposal: promote the result (a reviewer other than its operator) or cite another run; it stays readable as a diagnostic', 409],
    ['run use rejected (refused): package p version 1 recommends option "reroute", which cites run r — REFUSED for decision use: invalidated; the domain\'s decision-use policy (v1) requires a decision-grade result at the commitment: cite another run (a re-run of the corrected case)', 409],
    ['run use rejected (require): the policy says whether a decision-grade result is required (require: true|false)', 422],
    ['run use rejected (rationale): the policy states why (16-2048 characters)', 422],
    ['run use rejected (run_ids): name 1 to 20 runs', 422],
    ['run use rejected (version): the twin version is a positive integer', 422],
    ['branch binding rejected (actor): recorded by the acting principal', 403],
    ['branch binding rejected (ownership): branch "Baseline" is bound by its owner or the scenario\'s owner', 403],
    ['branch binding rejected (unknown_branch): no branch x in this domain', 404],
    ['branch binding rejected (unknown_element): no.such.element is not an element of version 2 of twin x', 404],
    ['branch binding rejected (unknown_assumption): x is not linked to branch "Baseline" or its scenario', 404],
    ['branch binding rejected (unknown_constraint_set): no constraint set x in this domain', 404],
    ['branch binding rejected (state): branch "Baseline" has no active binding', 409],
    ['branch binding rejected (stale): branch "Baseline" is bound at version 2, the request names version 1; reload and rebind the current version', 409],
    ['branch binding rejected (duplicate): branch "Baseline" is bound at version 1, the request names version <none>; reload and rebind the current version', 409],
    ['branch binding rejected (initial_conditions): element k holds 1 in version 2 of twin x, not the stated "y"', 422],
    ['branch binding rejected (twin_version): version 2 of twin x is unverified (a cited input was corrected); bind a verified state', 422],
    ['branch binding rejected (rationale): a binding states why the branch starts from this state (8-2048 characters)', 422],
    ['branch binding rejected (reason): a retirement states why the branch no longer starts from the bound state (16+ characters)', 422],
    ['run rejected (scenario_quality): scenario s failed its quality evaluation e at 2026-10-01 (indistinct_branches); a scenario that fails its quality rules is not simulated until an evaluation passes', 409],
    ['run rejected (branch_binding): branch b is bound (binding v1) to version 2 of twin t, not version 3 of twin t; a run on the branch starts from its bound state (or the binding is revised first)', 409],
    ['run rejected (branch_binding): the run\'s initial state a differs from the state b bound to branch c (binding v1)', 409],
    ['promotion to simulation rejected (branch_suspended): branch "Strait shutdown" is suspended since 2026-10-01 (x); a suspended branch is not promoted to simulation until its owner reinstates it', 409],
    ['promotion to simulation rejected (scenario_quality): scenario s failed its quality evaluation e at 2026-10-01 (indistinct_branches); resolve the findings and evaluate again before promoting a branch', 409],
  ];
  it.each(TEXTS)('%s → %i', (t, status) => {
    const e = asObservationRefusal({ code: '22023', message: t }, C);
    expect(e, t).not.toBeNull();
    expect(e!.getStatus(), t).toBe(status);
    expect(String((e!.getResponse() as { message?: string }).message)).toBe(t);
  });
});
