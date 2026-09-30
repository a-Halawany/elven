/**
 * CP-6 B90 §R (0095 §R) — the pure logic of the product registry completed: the refusal families through the mapper (every class to its
 * honest status; the consumer noun not caught by the prelude's row), the EXACT PDP rules (the roles, the human gate, no prefix match), the
 * validators (a cost is a decimal string, never a float; a contract test passes or fails; a consumer registers itself by default; the
 * window's bounds), the tick's degradation wording and the step's name and order.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { degradationReason, reasonOf, validateConsumerRegister, validateContractTest, validateCost, validateWindow, versionOf } from '../../src/products/consumers/consumers.service.js';
import { PRODUCT_SCORECARDS_ORDER, PRODUCT_SCORECARDS_STEP } from '../../src/products/consumers/scorecard-step.js';

const pg = (message: string, code: string) => Object.assign(new Error(message), { code });
const mapped = (message: string, code = '22023'): { status: number; text: string; code: string } => {
  const e = asObservationRefusal(pg(message, code), 'unit');
  if (!(e instanceof HttpException)) throw new Error(`${message} did not map`);
  const r = e.getResponse() as { message?: string; code?: string };
  return { status: e.getStatus(), text: String(r.message ?? ''), code: String(r.code ?? '') };
};
const thrown = (f: () => unknown): { status: number; text: string } => {
  try { f(); } catch (e) { if (e instanceof HttpException) return { status: e.getStatus(), text: String((e.getResponse() as { message?: string }).message ?? '') }; throw e; }
  throw new Error('nothing was thrown');
};

describe('B90 products · the refusal families through the mapper', () => {
  it('the consumer noun: the standing 403 (actor, authority, THE CONSUMER), the absences 404, the record\'s state 409, the caller\'s own 422 — never caught by the prelude\'s `data product rejected` row', () => {
    expect(mapped('data product consumer rejected (not_consumer): a contract is accepted by the consumer itself', '42501')).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    expect(mapped('data product consumer rejected (authority): a consumer registers itself, or a data steward registers it', '42501').status).toBe(403);
    expect(mapped('data product consumer rejected (actor): registered by the acting principal', '42501').status).toBe(403);
    expect(mapped('data product consumer rejected (unknown_consumer): x is not a consumer of product y').status).toBe(404);
    expect(mapped('data product consumer rejected (unknown_product): x is not a product of this domain').status).toBe(404);
    expect(mapped('data product consumer rejected (state): consumer x is accepted; acceptance follows registration once').status).toBe(409);
    expect(mapped('data product consumer rejected (duplicate): principal x is already a live consumer of product y', '23505').status).toBe(409);
    expect(mapped('data product consumer rejected (contract_tests): consumer x holds no passing contract test on version 3 of product y').status).toBe(409);
    expect(mapped('data product consumer rejected (version): the accepted contract version is the released one — version 1 of product y (not 7)')).toMatchObject({ status: 422, code: 'EYE-REQ-001' });
    expect(mapped('data product consumer rejected (purpose): a consumer states its purpose (8+ characters)').status).toBe(422);
  });
  it('the contract test, the scorecard and the cost nouns', () => {
    expect(mapped('contract test rejected (authority): a contract test is recorded by the consumer, the product\'s owner, or a data steward', '42501').status).toBe(403);
    expect(mapped('contract test rejected (unknown_version): product y has no version 9').status).toBe(404);
    expect(mapped('contract test rejected (state): consumer x is revoked; a live consumer tests').status).toBe(409);
    expect(mapped('contract test rejected (outcome): a contract test passes or fails').status).toBe(422);
    expect(mapped('product scorecard rejected (authority): a scorecard is computed by the product\'s owner, by a data steward, or by the attention tick', '42501').status).toBe(403);
    expect(mapped('product scorecard rejected (state): product y is registered; a scorecard is computed on a released or degraded product').status).toBe(409);
    expect(mapped('product scorecard rejected (window): a scorecard window is 1 to 366 days').status).toBe(422);
    expect(mapped('product cost rejected (authority): a cost is attributed by the product\'s owner or by a data steward', '42501').status).toBe(403);
    expect(mapped('product cost rejected (duplicate): the period 2026-01-01 – 2026-02-01 of product y is already attributed', '23505').status).toBe(409);
    expect(mapped('product cost rejected (state): product y is retired').status).toBe(409);
    expect(mapped('product cost rejected (period): a period runs from a start day to a later end day').status).toBe(422);
    expect(mapped('product cost rejected (amount): a cost is a non-negative amount').status).toBe(422);
  });
  it('the lifecycle ports use the prelude\'s family: not_owner 403; contract_tests, consumers, review, canonical, state 409; reason 422', () => {
    expect(mapped('data product rejected (not_owner): product y is withdrawn by its owner', '42501').status).toBe(403);
    expect(mapped('data product rejected (contract_tests): publication denied — version 2 of product y is BREAKING and accepted consumer(s) a, b hold no passing contract test on it').status).toBe(409);
    expect(mapped('data product rejected (consumers): product y still has 1 accepted consumer(s); revoke or migrate them before retiring').status).toBe(409);
    expect(mapped('data product rejected (review): product y has no accepted retirement review; retirement is reviewed by someone other than the owner').status).toBe(409);
    expect(mapped('data product rejected (canonical): the withdrawn DPR version of product y was not admitted in this write').status).toBe(409);
    expect(mapped('data product rejected (state): product y is withdrawn; a released or degraded product is withdrawn').status).toBe(409);
    expect(mapped('data product rejected (reason): a withdrawal names its reason (8+ characters)').status).toBe(422);
  });
});

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (over: Partial<PolicyInput> & { roles?: string[]; kind?: 'human' | 'workload' | 'agent' }): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: over.kind ?? 'human', assurance: 'password',
               bindings: (over.roles ?? ['risk_owner']).map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action: 'products.consumer.accept', objectType: 'DPR', objectId: null, purposeId: 'executive',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  ...over,
});

describe('B90 products · the EXACT PDP rules', () => {
  const pdp = new PdpService();
  it('a consumer role (risk_owner) accepts, human-gated; a collection manager is denied; a longer action is not a prefix match', () => {
    const r = pdp.evaluate(input({}));
    expect(r.decision).toBe('allow_with_obligations');
    expect(r.obligations).toEqual([{ type: 'human_gate' }]);
    expect(pdp.evaluate(input({ roles: ['collection_manager'] })).decision).toBe('deny');
    for (const action of ['products.consumer.accept.now', 'products.consumer', 'products.consumer.accep']) expect(pdp.evaluate(input({ action })).decision, action).toBe('deny');
  });
  it('the steward passes the lifecycle rules (the PORT asserts the owner for restore / withdraw / retire — so its own 403 is reachable); the tick\'s acts carry no human gate; an outsider is denied everywhere', () => {
    for (const action of ['products.product.degrade', 'products.product.restore', 'products.product.withdraw', 'products.product.retire', 'products.product.cost.attribute', 'products.product.scorecard.compute', 'products.consumer.register', 'products.product.contract_test']) {
      expect(pdp.evaluate(input({ action, roles: ['data_steward'] })).decision, action).not.toBe('deny');
      expect(pdp.evaluate(input({ action, roles: ['collection_manager'] })).decision, action).toBe('deny');
    }
    expect(pdp.evaluate(input({ action: 'products.product.contract_test' })).obligations).toEqual([]);
    expect(pdp.evaluate(input({ action: 'products.product.scorecard.compute', roles: ['domain_analyst'] })).obligations).toEqual([]);
    expect(pdp.evaluate(input({ action: 'products.product.retire', roles: ['domain_analyst'] })).obligations).toEqual([{ type: 'human_gate' }]);
  });
});

describe('B90 products · the validators and the tick\'s wording', () => {
  it('a cost is a decimal string with at most two places (an integer accepted), never a float; the period is two days in order; the currency an ISO-4217 code', () => {
    expect(validateCost({ periodStart: '2026-01-01', periodEnd: '2026-02-01', amount: '1250.00', currency: 'eur', basis: 'compute-minutes' }, 'c')).toMatchObject({ amount: '1250.00', currency: 'EUR', basis: 'compute-minutes', details: {} });
    expect(validateCost({ periodStart: '2026-01-01', periodEnd: '2026-02-01', amount: 1310, currency: 'EUR', basis: 'compute' }, 'c').amount).toBe('1310');
    expect(thrown(() => validateCost({ periodStart: '2026-01-01', periodEnd: '2026-02-01', amount: 12.5, currency: 'EUR', basis: 'x y' }, 'c'))).toMatchObject({ status: 422, text: expect.stringMatching(/^product cost rejected \(amount\): .* never a float$/) });
    expect(thrown(() => validateCost({ periodStart: '2026-02-01', periodEnd: '2026-01-01', amount: '1.00', currency: 'EUR', basis: 'x y' }, 'c')).text).toMatch(/^product cost rejected \(period\): a period runs from a start day to a later end day$/);
    expect(thrown(() => validateCost({ periodStart: '2026-1-1', periodEnd: '2026-02-01', amount: '1.00', currency: 'EUR', basis: 'x y' }, 'c')).text).toMatch(/^product cost rejected \(period\): periodStart and periodEnd are days/);
    expect(thrown(() => validateCost({ periodStart: '2026-01-01', periodEnd: '2026-02-01', amount: '1.00', currency: 'E1', basis: 'x y' }, 'c')).text).toMatch(/^product cost rejected \(currency\)/);
    expect(thrown(() => validateCost({ periodStart: '2026-01-01', periodEnd: '2026-02-01', amount: '1.00', currency: 'EUR', basis: 'x' }, 'c')).text).toMatch(/^product cost rejected \(basis\)/);
  });
  it('a contract test names a declared version and passes or fails; a consumer registers ITSELF by default; a reason says why; the window is 1–366', () => {
    expect(validateContractTest({ version: 2, outcome: 'pass' }, 'c')).toEqual({ version: 2, outcome: 'pass', evidence: {} });
    expect(thrown(() => validateContractTest({ version: 2, outcome: 'maybe' }, 'c')).text).toMatch(/^contract test rejected \(outcome\)/);
    expect(thrown(() => validateContractTest({ version: 0, outcome: 'pass' }, 'c')).text).toMatch(/^contract test rejected \(version\)/);
    expect(validateConsumerRegister({ purpose: 'procurement reads the warnings' }, 'actor-id', 'c')).toEqual({ consumer: 'actor-id', consumerDomainId: null, purpose: 'procurement reads the warnings', impact: null });
    expect(validateConsumerRegister({ consumerPrincipalId: '0190b1c2-d3e4-7000-8000-0000000000aa', purpose: 'the steward names the consumer', impact: ' orders stall ' }, 'actor-id', 'c')).toMatchObject({ consumer: '0190b1c2-d3e4-7000-8000-0000000000aa', impact: 'orders stall' });
    expect(thrown(() => validateConsumerRegister({ purpose: 'short' }, 'actor-id', 'c')).text).toMatch(/^data product consumer rejected \(purpose\)/);
    expect(thrown(() => validateConsumerRegister({ consumerPrincipalId: 'nope', purpose: 'a purpose of length' }, 'actor-id', 'c')).text).toMatch(/^data product consumer rejected \(consumer\): a uuid is required$/);
    expect(reasonOf('  a reason of eight  ', 'data product', 'reason', 'c')).toBe('a reason of eight');
    expect(thrown(() => reasonOf('short', 'data product', 'reason', 'c')).text).toMatch(/^data product rejected \(reason\): a governed act says why/);
    expect(versionOf(3, 'data product consumer', 'c')).toBe(3);
    expect(thrown(() => versionOf('3', 'data product consumer', 'c')).text).toMatch(/^data product consumer rejected \(version\)/);
    expect(validateWindow({}, 'c')).toBeNull();
    expect(validateWindow({ windowDays: 30 }, 'c')).toBe(30);
    expect(thrown(() => validateWindow({ windowDays: 0 }, 'c')).text).toMatch(/^product scorecard rejected \(window\)/);
    expect(thrown(() => validateWindow({ windowDays: 367 }, 'c')).status).toBe(422);
  });
  it('the tick\'s degradation names the attainment, the floor, the consecutive count, the window and the step; the step is product-scorecards at order 64 (after the plan variance at 55, before the metric certification at 65)', () => {
    expect(degradationReason({ attainmentPct: 75, floorPct: 95, consecutive: 2, windowDays: 30 })).toBe('SLO attainment 75% under the floor 95% on 2 consecutive scorecard(s) over 30 day(s) — degraded by the attention tick step product-scorecards');
    expect(PRODUCT_SCORECARDS_STEP).toBe('product-scorecards');
    expect(PRODUCT_SCORECARDS_ORDER).toBe(64);
  });
});
