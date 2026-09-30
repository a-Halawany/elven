/**
 * CP-6 B27 §S (0097) — the pure logic of the sets part: the validators word a request's fault before any port is reached; the refusal
 * families `scenario set rejected (<class>)`, `portfolio review rejected (<class>)`, `scenario proposal rejected (<class>)` and
 * `recommendation rejected (<class>)` map to honest answers through the observation mapper (every class the migration raises); the older
 * unclassed `scenario rejected: …` and `branch rejected …` families keep their behaviour.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { ADVERSE_KINDS, PROPOSAL_KINDS, PROPOSAL_SOURCE_FIELD, SCENARIO_RELEVANCE_ORDER, SCENARIO_RELEVANCE_STEP, SET_STATES,
  validateMember, validatePolicy, validateProposal, validateReason, validateResolution, validateReview, validateSetDeclaration } from '../../src/prediction/scenarios/sets/sets.service.js';

const C = '0190b1c2-d3e4-7000-8000-0000000000c0';
const U = '0190b1c2-d3e4-7000-8000-0000000000aa';
const status = (f: () => unknown): { status: number; message: string } => {
  try { f(); } catch (e) { if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message) }; throw e; }
  throw new Error('the validator should have refused');
};
const mapped = (message: string, code = '22023'): { status: number | null; message: string } => {
  const e = asObservationRefusal({ code, message }, C);
  return e === null ? { status: null, message } : { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message) };
};

describe('the vocabularies and the step are the migration\'s', () => {
  it('the set states, the adverse kinds (prediction.scenario_set_adverse_kinds), the four proposal sources and their fields; the step scenario-relevance (67)', () => {
    expect([...SET_STATES]).toEqual(['draft', 'active', 'retired']);
    expect([...ADVERSE_KINDS]).toEqual(['downside', 'disruption', 'stress', 'adversarial']);
    expect([...PROPOSAL_KINDS]).toEqual(['forecast_shift', 'weak_signal', 'risk', 'planning_cycle']);
    expect(PROPOSAL_SOURCE_FIELD).toEqual({ forecast_shift: 'forecast_id', weak_signal: 'signal_id', risk: 'exposure_id', planning_cycle: 'cadence_id' });
    expect([SCENARIO_RELEVANCE_STEP, SCENARIO_RELEVANCE_ORDER]).toEqual(['scenario-relevance', 67]);
  });
});

describe('the validators word the request\'s fault (422) before any port', () => {
  it('the policy: kinds of vocabulary v1 each once, a plural min_branches, a whole min_adverse; nothing else', () => {
    expect(validatePolicy({ require: ['baseline', 'stress'], min_branches: 3, min_adverse: 1 }, C)).toEqual({ require: ['baseline', 'stress'], min_branches: 3, min_adverse: 1 });
    expect(validatePolicy({}, C)).toEqual({ require: [] });
    expect(status(() => validatePolicy({ require: ['meltdown'] }, C))).toMatchObject({ status: 422, message: expect.stringMatching(/^scenario set rejected \(policy\): require lists kinds of scenario kind vocabulary v1/) });
    expect(status(() => validatePolicy({ require: ['stress', 'stress'] }, C)).message).toMatch(/each kind once/);
    expect(status(() => validatePolicy({ min_branches: 1 }, C)).message).toMatch(/a set is plural/);
    expect(status(() => validatePolicy({ min_adverse: -1 }, C)).message).toMatch(/min_adverse/);
    expect(status(() => validatePolicy({ weights: 1 }, C)).message).toMatch(/weights is not a term/);
    expect(status(() => validatePolicy(null, C)).message).toMatch(/is an object/);
  });
  it('the declaration, the member, a reason', () => {
    expect(validateSetDeclaration({ title: ' Corridor set ', purpose: 'the corridor decision', policy: { require: ['baseline'] }, packageId: U }, C)).toMatchObject({ title: 'Corridor set', owner: null, packageId: U });
    expect(status(() => validateSetDeclaration({ title: 'x', purpose: 'the corridor decision', policy: {} }, C)).message).toMatch(/^scenario set rejected \(title\)/);
    expect(status(() => validateSetDeclaration({ title: 'Set', purpose: 'short', policy: {} }, C)).message).toMatch(/^scenario set rejected \(purpose\)/);
    expect(status(() => validateSetDeclaration({ title: 'Set', purpose: 'the corridor decision', policy: {}, ownerPrincipalId: 'nobody' }, C)).message).toMatch(/^scenario set rejected \(owner\): a uuid/);
    expect(validateMember({ scenarioId: U }, C)).toEqual({ scenarioId: U, branchId: null });
    expect(status(() => validateMember({ scenarioId: U, branchId: 'b' }, C)).message).toMatch(/^scenario set rejected \(branch\)/);
    expect(status(() => validateReason({ reason: 'short' }, C, 'removal')).message).toMatch(/^scenario set rejected \(reason\): a removal says why/);
  });
  it('the portfolio review: ratings, options, a finite payoff per branch id, the unit, the retirements, the note', () => {
    const ok = { members: [{ member_id: U, relevance: 'high', consequence: 'C3' }], payoffs: { reroute: { [U]: -40 } }, unit: 'EUR k', note: 'reroute is robust' };
    expect(validateReview(ok, C)).toMatchObject({ options: null, retirements: [], unit: 'EUR k' });
    expect(status(() => validateReview({ ...ok, members: [] }, C)).message).toMatch(/^portfolio review rejected \(members\)/);
    expect(status(() => validateReview({ ...ok, members: [{ member_id: U, relevance: 'huge', consequence: 'C3' }] }, C)).message).toMatch(/^portfolio review rejected \(relevance\)/);
    expect(status(() => validateReview({ ...ok, members: [{ member_id: U, relevance: 'low', consequence: 'C9' }] }, C)).message).toMatch(/^portfolio review rejected \(consequence\)/);
    expect(status(() => validateReview({ ...ok, options: [{ key: 'Bad Key', title: 'x' }] }, C)).message).toMatch(/^portfolio review rejected \(options\)/);
    expect(status(() => validateReview({ ...ok, payoffs: { reroute: { [U]: 'a lot' } } }, C)).message).toMatch(/^portfolio review rejected \(payoffs\): option reroute pays a finite number/);
    expect(status(() => validateReview({ ...ok, payoffs: { reroute: { 'not-a-branch': 1 } } }, C)).message).toMatch(/^portfolio review rejected \(payoffs\)/);
    expect(status(() => validateReview({ ...ok, unit: '' }, C)).message).toMatch(/^portfolio review rejected \(unit\)/);
    expect(status(() => validateReview({ ...ok, retirements: [{ scenario_id: U, note: 'x' }] }, C)).message).toMatch(/^portfolio review rejected \(retirements\)/);
    expect(status(() => validateReview({ ...ok, note: 'short' }, C)).message).toMatch(/^portfolio review rejected \(note\)/);
  });
  it('the proposal and its resolution: the source names its object by the kind\'s field; a forecast shift states its band', () => {
    expect(validateProposal({ kind: 'weak_signal', source: { signal_id: U }, title: 'War-risk cover', rationale: 'the insurer signal' }, C)).toMatchObject({ kind: 'weak_signal' });
    expect(status(() => validateProposal({ kind: 'rumour', source: {}, title: 'x', rationale: 'y' }, C)).message).toMatch(/^scenario proposal rejected \(kind\)/);
    expect(status(() => validateProposal({ kind: 'risk', source: { signal_id: U }, title: 'A risk', rationale: 'the exposure' }, C)).message).toMatch(/^scenario proposal rejected \(source\): a uuid/);
    expect(status(() => validateProposal({ kind: 'forecast_shift', source: { forecast_id: U }, title: 'A shift', rationale: 'the median moved' }, C)).message).toMatch(/band_pct/);
    expect(status(() => validateProposal({ kind: 'forecast_shift', source: { forecast_id: U, band_pct: 11 }, title: 'A shift', rationale: 'the median moved' }, C)).message).toMatch(/band_pct/);
    expect(status(() => validateProposal({ kind: 'planning_cycle', source: { cadence_id: U }, title: 'x', rationale: 'the cadence reset' }, C)).message).toMatch(/^scenario proposal rejected \(title\)/);
    expect(validateResolution({ resolution: 'accepted', note: 'declare it next review' }, C)).toEqual({ resolution: 'accepted', note: 'declare it next review' });
    expect(status(() => validateResolution({ resolution: 'maybe', note: 'declare it next review' }, C)).message).toMatch(/^scenario proposal rejected \(resolution\)/);
  });
});

describe('the refusal families map to honest answers (the classes the migration raises)', () => {
  it('403: the acting principal, the owner\'s authority, the separation of duties', () => {
    for (const t of ['scenario set rejected (actor): declared by the acting principal', 'scenario set rejected (authority): the members of a set are changed by its owner or an administrator',
                     'portfolio review rejected (actor): a portfolio review is a named human\'s act', 'scenario proposal rejected (separation_of_duties): the proposer of a scenario does not resolve the proposal',
                     'scenario proposal rejected (authority): a proposal is resolved by a named strategy owner of the domain']) {
      expect(mapped(t, '42501')).toMatchObject({ status: 403, message: t });
    }
  });
  it('404: the absences', () => {
    for (const t of ['scenario set rejected (unknown_set): x is not a scenario set of this domain', 'scenario set rejected (unknown_package): x', 'scenario set rejected (unknown_member): x',
                     'scenario set rejected (unknown_scenario): x', 'scenario set rejected (unknown_branch): x', 'portfolio review rejected (unknown_member): x',
                     'scenario proposal rejected (unknown_forecast): x', 'scenario proposal rejected (unknown_signal): x', 'scenario proposal rejected (unknown_exposure): x', 'scenario proposal rejected (unknown_proposal): x']) {
      expect(mapped(t, '23503')).toMatchObject({ status: 404, message: t });
    }
  });
  it('409: the record\'s state — and THE GATE: `recommendation rejected (plurality)`', () => {
    for (const t of ['scenario set rejected (state): set x is retired; its members are not changed', 'scenario set rejected (duplicate): x is already a member of set y',
                     'scenario set rejected (bound): set x is bound to package(s) still in flight — P (proposed); it is not retired while it gates a recommendation',
                     'scenario set rejected (empty): set x has no member', 'portfolio review rejected (state): set x is draft; an active set is reviewed',
                     'scenario proposal rejected (duplicate): a proposal from this forecast_shift (x) is already open', 'scenario proposal rejected (state): proposal x was accepted at t',
                     'recommendation rejected (plurality): package p version 1 is bound to the scenario set "S" (s), whose plurality check fails — no live stress branch in the set (the policy requires one); add the missing branch and check the set again (ADR-012)']) {
      expect(mapped(t)).toMatchObject({ status: 409, message: t });
    }
  });
  it('422: the caller\'s own request', () => {
    for (const t of ['scenario set rejected (policy): min_branches is a whole number in 2..64 (a set is plural)', 'scenario set rejected (owner): the owner x is not a named, active human',
                     'portfolio review rejected (payoffs): option reroute has no payoff for the live branch b', 'scenario proposal rejected (within_band): the median moved 60 → 58',
                     'scenario proposal rejected (source): signal x is tentative (disposition none); a proposal rests on an ESCALATED weak signal', 'recommendation rejected (other): x']) {
      expect(mapped(t)).toMatchObject({ status: 422, message: t });
    }
  });
  it('the older families are untouched: an unclassed `scenario rejected: …`, `branch rejected (duplicate)`, an unrelated `proposal rejected: …`', () => {
    expect(mapped('branch rejected (duplicate): a branch like this exists').status).toBe(409);
    expect(mapped('scenario rejected: forecast x was withdrawn').status).toBe(409);
    expect(mapped('proposal rejected: a decision compares at least two options').status).not.toBe(409);
  });
});
