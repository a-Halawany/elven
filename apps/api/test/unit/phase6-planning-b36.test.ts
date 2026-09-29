/**
 * CP-6 B36 §P (0094, part `planning`) · hermetic: the planning acts at the PDP (exact rules; propose is the Planning Agent's one act, no human
 * gate; every other transition and planning edit human-gated; funding and approval the executive's or the decision authority's; the read's
 * roles), the refusal rows of the ports' texts (403 → 404 → 409 → 422 — each through the mapper, so no earlier unanchored row swallows one;
 * B22's `plan selection rejected` and B24's `plan execution rejected` untouched), the route intakes (money as a decimal string, never a
 * float; a horizon of the four; a reason of eight characters), the transition table and the sensitivity summary (a count, never a percentage).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { HORIZONS, PLAN_VARIANCE_ORDER, PLAN_VARIANCE_STEP, TRANSITION_OF, moneyOf, sensitivitySummary, validateDependency, validateFunding, validateMilestone,
  validatePlan, validatePriority, validateProposal } from '../../src/executive/planning/planning.service.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const U = '0193a3d0-0000-7000-8000-0000000000cc';
const input = (action: string, roles: string[], kind: 'human' | 'agent' = 'human', scope: 'DOMAIN' | 'TENANT' = 'DOMAIN'): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: kind === 'agent' ? 'agent_grant' : 'password',
               bindings: roles.map((roleCode) => ({ roleCode, scope, tenantId: T, domainId: scope === 'DOMAIN' ? D : null })) },
  delegationId: null, action, objectType: 'PLN', objectId: null, purposeId: 'executive',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
} as PolicyInput);
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (message: string, code = '22023') => {
  const r = asObservationRefusal(pg(code, message), 'corr');
  return r === null ? null : { status: r.getStatus(), code: (r.getResponse() as { code: string }).code, message: String((r.getResponse() as { message?: string }).message) };
};
const status = (f: () => unknown): { status: number; message: string } => {
  try { f(); return { status: 0, message: '' }; } catch (e) { return { status: (e as HttpException).getStatus(), message: String(((e as HttpException).getResponse() as { message?: string }).message) }; }
};

describe('B36 planning · the PDP', () => {
  const pdp = new PdpService();
  it('PROPOSE is the one act the Planning Agent performs (no human gate); the strategy lead and the administrator propose too; the executive does not', () => {
    expect(pdp.evaluate(input('executive.initiative.propose', ['planning_agent'], 'agent')).decision).toBe('allow');
    for (const role of ['strategy_owner', 'domain_admin']) expect(pdp.evaluate(input('executive.initiative.propose', [role])).decision, role).toBe('allow');
    for (const role of ['executive', 'decision_authority', 'domain_analyst', 'collection_manager']) expect(pdp.evaluate(input('executive.initiative.propose', [role])).decision, role).toBe('deny');
    for (const role of ['decision_agent', 'risk_agent', 'attention_agent']) expect(pdp.evaluate(input('executive.initiative.propose', [role], 'agent')).decision, role).toBe('deny');
  });
  it('the lead\'s acts (declare, align, prioritise, milestone, dependency, measure, run) are human-gated and never an agent\'s — not even the Planning Agent\'s', () => {
    for (const action of ['executive.plan.declare', 'executive.initiative.align', 'executive.initiative.prioritise', 'executive.plan.milestone.set', 'executive.plan.dependency.declare', 'executive.plan.measure.bind', 'executive.plan.run.attach']) {
      for (const role of ['strategy_owner', 'domain_admin']) {
        const r = pdp.evaluate(input(action, [role]));
        expect(r.decision, `${action} ${role}`).toBe('allow_with_obligations');
        expect(r.obligations, action).toEqual([{ type: 'human_gate' }]);
      }
      expect(pdp.evaluate(input(action, ['planning_agent'], 'agent')).decision, action).toBe('deny');
      for (const role of ['executive', 'decision_authority', 'domain_analyst']) expect(pdp.evaluate(input(action, [role])).decision, `${action} ${role}`).toBe('deny');
      expect(pdp.evaluate({ ...input(action, ['strategy_owner']), consequenceClass: 'C3' }).decision).toBe('deny');
      expect(pdp.evaluate(input(`${action}.x`, ['strategy_owner'])).decision, 'exact').not.toBe('allow_with_obligations');
    }
  });
  it('FUNDING, APPROVAL, the AUTHORITY CEILING and a breach ACKNOWLEDGEMENT are the executive\'s or the decision authority\'s (human-gated); the BASELINE the executive\'s; the lead holds none of them', () => {
    for (const action of ['executive.initiative.fund', 'executive.initiative.approve', 'executive.plan.authority.set', 'executive.plan.breach.acknowledge']) {
      for (const role of ['executive', 'decision_authority', 'domain_admin']) expect(pdp.evaluate(input(action, [role])).obligations, `${action} ${role}`).toEqual([{ type: 'human_gate' }]);
      for (const role of ['strategy_owner', 'decision_owner', 'domain_analyst']) expect(pdp.evaluate(input(action, [role])).decision, `${action} ${role}`).toBe('deny');
      expect(pdp.evaluate(input(action, ['planning_agent'], 'agent')).decision, action).toBe('deny');
    }
    expect(pdp.evaluate(input('executive.plan.baseline', ['executive'])).obligations).toEqual([{ type: 'human_gate' }]);
    for (const role of ['decision_authority', 'strategy_owner']) expect(pdp.evaluate(input('executive.plan.baseline', [role])).decision, role).toBe('deny');
    for (const role of ['strategy_owner', 'executive', 'decision_authority']) expect(pdp.evaluate(input('executive.initiative.pause', [role])).obligations, role).toEqual([{ type: 'human_gate' }]);
    for (const role of ['strategy_owner', 'decision_owner', 'decision_authority']) expect(pdp.evaluate(input('executive.plan.initiative.cite', [role])).obligations, role).toEqual([{ type: 'human_gate' }]);
  });
  it('the READ (executive.plan.read) adds the executive, the operator, the board member, the decision roles, the analysts, the tenant administrator and the auditor to the planning roles — and the Planning Agent reads what it proposes into', () => {
    for (const role of ['strategy_owner', 'executive', 'executive_operator', 'board_member', 'decision_owner', 'decision_authority', 'decision_approver', 'domain_analyst', 'domain_admin']) {
      expect(pdp.evaluate(input('executive.plan.read', [role])).decision, role).toBe('allow_with_obligations');
    }
    for (const role of ['tenant_admin', 'auditor']) expect(pdp.evaluate(input('executive.plan.read', [role], 'human', 'TENANT')).decision, role).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('executive.plan.read', ['planning_agent'], 'agent')).decision).toBe('allow_with_obligations');
    for (const role of ['collection_manager', 'forecast_owner', 'twin_owner']) expect(pdp.evaluate(input('executive.plan.read', [role])).decision, role).toBe('deny');
  });
});

describe('B36 planning · the refusal rows (each text through the mapper)', () => {
  it('the standing 403: the acting principal, the sponsor, the separation of proposer and approver, the package\'s owner', () => {
    expect(answer('plan rejected (actor): declared by the acting principal', '42501')).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    expect(answer('initiative rejected (not_sponsor): initiative "x" is paused by its sponsor', '42501')).toMatchObject({ status: 403 });
    expect(answer('initiative rejected (separation): initiative "x" is approved by someone other than its proposer', '42501')).toMatchObject({ status: 403 });
    expect(answer('initiative citation rejected (not_owner): package "x" is cited by its owner or the plan\'s lead', '42501')).toMatchObject({ status: 403 });
    expect(answer('plan baseline rejected (actor): baselined by the acting principal', '42501')).toMatchObject({ status: 403 });
  });
  it('the absences 404 (unknown_*)', () => {
    for (const m of ['plan rejected (unknown_plan): x is not a plan of this domain', 'plan rejected (unknown_objective): x is not a live objective (OBJ) of this domain', 'initiative rejected (unknown_initiative): x',
      'milestone rejected (unknown_measure): x', 'plan run rejected (unknown_run): x', 'plan breach rejected (unknown_breach): x', 'initiative citation rejected (unknown_package): x', 'plan dependency rejected (unknown_initiative): x']) {
      expect(answer(m, '23503'), m).toMatchObject({ status: 404, code: 'EYE-STA-001' });
    }
  });
  it('the record\'s state 409: state, closed, duplicate, an open breach — and the commitment HOLD', () => {
    for (const m of ['initiative rejected (state): initiative "x" is not aligned to an objective yet — align it before it is prioritised', 'plan rejected (closed): plan "x" is closed', 'initiative rejected (duplicate): initiative "x" is already proposed into a plan',
      'plan baseline rejected (breach_open): plan "x" has an open breach; acknowledge or resolve it before a baseline', 'plan breach rejected (state): breach x is acknowledged, not open', 'milestone rejected (duplicate): x is already a milestone',
      'plan dependency rejected (duplicate): "a" → "b" (finish_to_start) is already declared', 'plan commitment rejected (breach_open): package x cites initiative "y" of a plan with open breach(es) — budget_over_authority [funded 800001.00 > authority 700000.00]; the commitment is held until the executive acknowledges the breach or it resolves']) {
      expect(answer(m), m).toMatchObject({ status: 409, code: 'EYE-STA-002' });
    }
  });
  it('the caller\'s own 422: the budget authority (funding above the ceiling is the request\'s fault), the cycle, the objectives, the currency, the reason', () => {
    for (const m of ['initiative rejected (budget_authority): funding 400000.00 EUR for "x" would bring the funded sum of plan "p" to 1000000.00 EUR, above its authority ceiling of 900000.00 EUR',
      'plan dependency rejected (cycle): "a" → "b" would close a finish_to_start cycle (…)', 'initiative rejected (objectives): objective x is not in the objective set of plan "p"', 'plan rejected (currency): the currency is an ISO-4217 code',
      'initiative rejected (reason): a proposal says why (8 characters or more)', 'milestone rejected (measure_objective): measure x measures objective y, which initiative "i" is not aligned to', 'plan measure rejected (quantity_key): a run output key is 1 to 128 characters']) {
      expect(answer(m), m).toMatchObject({ status: 422, code: 'EYE-REQ-001' });
    }
  });
  it('the earlier plan nouns keep their own rows (B22 `plan selection rejected`, B24 `plan execution rejected`) and the §0 signature texts are not this family\'s', () => {
    expect(answer('plan selection rejected: evidence x is not a record of this domain')).toMatchObject({ status: 404 });
    expect(answer('plan execution rejected: execution x is completed, not running')).toMatchObject({ status: 409 });
    expect(answer('plan execution rejected: something else')).toMatchObject({ status: 422 });
  });
});

describe('B36 planning · the intakes and the pure logic', () => {
  it('money is a decimal string with at most two places (an integer accepted): a float, a negative, a third decimal, a thousands separator are refused', () => {
    expect(moneyOf('1250000.00', 'x', 'c')).toBe('1250000.00');
    expect(moneyOf(1250000, 'x', 'c')).toBe('1250000');
    for (const bad of [1250000.5, '1250000.505', '-1', '1,250,000', '', 'abc']) expect(status(() => moneyOf(bad, 'budgetTotal', 'c')), String(bad)).toMatchObject({ status: 422 });
    expect(status(() => moneyOf(0.1 + 0.2, 'x', 'c')).message).toMatch(/never a float/);
  });
  it('a plan names at least one objective, a horizon of the four, an ISO-4217 currency, a budget and its authority; the classification and the cadence are optional', () => {
    const ok = validatePlan({ title: 'Dual-sourcing 2027', statement: 'a second source', horizon: '12m', objectiveIds: [U], currency: 'eur', budgetTotal: '1200000.00', budgetAuthority: '900000.00' }, 'c');
    expect(ok).toMatchObject({ horizon: '12m', currency: 'EUR', objectiveIds: [U], classification: null, reviewCadenceDays: null });
    expect(HORIZONS).toEqual(['30d', '90d', '12m', '36m']);
    expect(status(() => validatePlan({ title: 'x', statement: 'a second source', horizon: '12m', objectiveIds: [U], currency: 'EUR', budgetTotal: '1', budgetAuthority: '1' }, 'c')).message).toMatch(/title/);
    expect(status(() => validatePlan({ title: 'plan', statement: 'a second source', horizon: '6m', objectiveIds: [U], currency: 'EUR', budgetTotal: '1', budgetAuthority: '1' }, 'c')).message).toMatch(/horizon is one of/);
    expect(status(() => validatePlan({ title: 'plan', statement: 'a second source', horizon: '12m', objectiveIds: [], currency: 'EUR', budgetTotal: '1', budgetAuthority: '1' }, 'c')).message).toMatch(/at least one objective/);
    expect(status(() => validatePlan({ title: 'plan', statement: 'a second source', horizon: '12m', objectiveIds: [U], currency: 'EU', budgetTotal: '1', budgetAuthority: '1' }, 'c')).message).toMatch(/ISO-4217/);
    expect(status(() => validatePlan({ title: 'plan', statement: 'a second source', horizon: '12m', objectiveIds: [U], currency: 'EUR', budgetTotal: '1', budgetAuthority: '1', reviewCadenceDays: 400 }, 'c')).message).toMatch(/1 to 366/);
  });
  it('a proposal names the INI object, the plan, the objective, the sponsor, the owner and says why; a priority is a rank; a funding an amount; a milestone a day and a target; a dependency one of two kinds', () => {
    expect(validateProposal({ initiativeId: U, planId: U, objectiveId: U, sponsor: U, owner: U, rationale: 'the core of the plan' }, 'c')).toMatchObject({ budgetShare: '0' });
    expect(status(() => validateProposal({ initiativeId: 'not-a-uuid', planId: U, objectiveId: U, sponsor: U, owner: U, rationale: 'the core of the plan' }, 'c')).message).toMatch(/initiativeId .* is a uuid/);
    expect(status(() => validateProposal({ initiativeId: U, planId: U, objectiveId: U, sponsor: U, owner: U, rationale: 'short' }, 'c')).message).toMatch(/8 to 2000 characters/);
    expect(validatePriority({ priority: 3, rationale: 'ranked third' }, 'c')).toEqual({ priority: 3, rationale: 'ranked third' });
    expect(status(() => validatePriority({ priority: 0, rationale: 'ranked zero!' }, 'c')).message).toMatch(/rank from 1 to 1000/);
    expect(validateFunding({ amount: '600000.00', rationale: 'within authority' }, 'c')).toEqual({ amount: '600000.00', rationale: 'within authority' });
    expect(validateMilestone({ initiativeId: U, name: 'Q2', dueDate: '2027-06-30', measureId: U, targetValue: 900 }, 'c')).toMatchObject({ dueDate: '2027-06-30', targetValue: '900' });
    expect(status(() => validateMilestone({ initiativeId: U, name: 'Q2', dueDate: '30/06/2027', measureId: U, targetValue: 900 }, 'c')).message).toMatch(/calendar day/);
    expect(validateDependency({ from: U, to: U, kind: 'shares_resource', rationale: 'one tooling line' }, 'c')).toMatchObject({ kind: 'shares_resource' });
    expect(status(() => validateDependency({ from: U, to: U, kind: 'blocks', rationale: 'one tooling line' }, 'c')).message).toMatch(/finish_to_start, shares_resource/);
  });
  it('the transition table names the next act and who holds it; the tick step is plan-variance at order 55 (after the strategy detections at 50)', () => {
    expect(Object.keys(TRANSITION_OF)).toEqual(['proposed', 'aligned', 'prioritised', 'funded', 'approved']);
    expect(TRANSITION_OF['funded']).toEqual({ next: 'approve', by: 'the executive or the decision authority — never the proposer' });
    expect(PLAN_VARIANCE_STEP).toBe('plan-variance');
    expect(PLAN_VARIANCE_ORDER).toBe(55);
  });
  it('the sensitivity summary is a count in words — never a percentage', () => {
    const s = sensitivitySummary([{ status: 'at_risk' }, { status: 'at_risk' }, { status: 'on_track' }, { status: 'unmapped' }, { status: 'no_value' }, { status: 'other' }]);
    expect(s).toMatchObject({ at_risk: 2, on_track: 1, unmapped: 1, no_value: 1 });
    expect(s.line).toBe('2 at risk · 1 on track · 1 unmapped · 1 without a value at their date');
    expect(s.line).not.toMatch(/%/);
  });
});
