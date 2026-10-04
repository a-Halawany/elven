/**
 * CP-6 B91 §LE (0105 §LE) — the ledger's PURE rules (the specification the ports implement and the ledger harness cross-checks): the rate in
 * force at an instant and pricing (direct, allocated, unallocated, unpriced), the period, the variance and its run-rate forecast, the
 * thresholds, the anomaly rule (applied, not applied without a baseline), the energy ESTIMATE (never zero for an uncovered line), the
 * optimisation boundary, the reconciliation; the refusal families through the mapper (every class to its honest status); the EXACT PDP
 * rules (roles, scope, the human gate, no prefix match); the tick step's name and order. Every figure is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import {
  ADJUSTABLE_CONTROLS, PROTECTED_CONTROLS, allocationValid, anomaly, boundaryCheck, energyEstimate, periodBounds, priceUsage, rateInForce, reconcile, thresholdsReached, variance,
  type RateVersion,
} from '../../src/commercial/ledger/ledger-math.js';
import { COMMERCIAL_LEDGER_ORDER, COMMERCIAL_LEDGER_STEP } from '../../src/commercial/ledger/ledger-step.js';
import { decimalOf, validateBudgetIntake, windowOf } from '../../src/commercial/ledger/ledger.service.js';

const RATES: RateVersion[] = [
  { version: 1, effectiveFrom: '2026-01-01T00:00:00Z', pricePerUnit: 0.002, currency: 'EUR', energyKwhPerUnit: 0.00005 },
  { version: 2, effectiveFrom: '2026-06-01T00:00:00Z', pricePerUnit: 0.003, currency: 'EUR', energyKwhPerUnit: null },
];
const D1 = '0193a3d0-0000-7000-8000-0000000000d1'; const D2 = '0193a3d0-0000-7000-8000-0000000000d2';

describe('B91 ledger · pricing at the rate in force', () => {
  it('the version in force is the latest effective_from at or before the instant; before the first version nothing is in force', () => {
    expect(rateInForce(RATES, '2025-12-31T23:59:59Z')).toBeNull();
    expect(rateInForce(RATES, '2026-01-01T00:00:00Z')?.version).toBe(1);
    expect(rateInForce(RATES, '2026-05-31T23:59:59.999Z')?.version).toBe(1);
    expect(rateInForce(RATES, '2026-06-01T00:00:00Z')?.version).toBe(2); // the rate changes AT the instant
    expect(rateInForce([...RATES].reverse(), '2026-07-01T00:00:00Z')?.version).toBe(2);
  });
  it('a domain usage is one DIRECT line; the energy follows the coefficient of the version that priced it', () => {
    const p = priceUsage({ quantity: 60_000, domainId: D1, occurredAt: '2026-03-10T12:00:00Z' }, RATES);
    expect(p.priced).toBe(true);
    if (!p.priced) return;
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]).toMatchObject({ line: 0, domainId: D1, allocation: 'direct', share: 1, rateVersion: 1, currency: 'EUR' });
    expect(p.lines[0]!.amount).toBeCloseTo(120, 9);
    expect(p.lines[0]!.energyKwh).toBeCloseTo(3, 9);
    const after = priceUsage({ quantity: 60_000, domainId: D1, occurredAt: '2026-06-10T12:00:00Z' }, RATES);
    expect(after.priced && after.lines[0]!.amount).toBeCloseTo(180, 9);
    expect(after.priced && after.lines[0]!.energyKwh).toBeNull();
  });
  it('no rate in force: UNPRICED, with the reason — never a zero amount', () => {
    expect(priceUsage({ quantity: 5, domainId: D1, occurredAt: '2025-01-01T00:00:00Z' }, RATES)).toEqual({ priced: false, reason: 'no rate in force at occurred_at' });
  });
  it('a tenant-level usage is ALLOCATED by the key in force (one line per share), or kept UNALLOCATED when no key is in force', () => {
    const keys = [{ version: 1, effectiveFrom: '2026-02-01T00:00:00Z', shares: [{ domainId: D1, weight: 0.75 }, { domainId: D2, weight: 0.25, productId: 'p' }] }];
    const a = priceUsage({ quantity: 1000, domainId: null, occurredAt: '2026-03-01T00:00:00Z' }, RATES, keys);
    expect(a.priced && a.lines.map((l) => [l.line, l.domainId, l.allocation, l.share, l.quantity, l.allocationVersion, l.productId])).toEqual([[0, D1, 'allocated', 0.75, 750, 1, null], [1, D2, 'allocated', 0.25, 250, 1, 'p']]);
    expect(a.priced && a.lines.reduce((x, l) => x + l.amount, 0)).toBeCloseTo(2, 9);
    const u = priceUsage({ quantity: 1000, domainId: null, occurredAt: '2026-01-15T00:00:00Z' }, RATES, keys);
    expect(u.priced && u.lines.map((l) => [l.domainId, l.allocation, l.share])).toEqual([[null, 'unallocated', 1]]);
  });
  it('an allocation is valid only when every weight is in (0, 1] and they sum to 1', () => {
    expect(allocationValid([{ domainId: D1, weight: 0.5 }, { domainId: D2, weight: 0.5 }]).ok).toBe(true);
    expect(allocationValid([{ domainId: D1, weight: 0.5 }, { domainId: D2, weight: 0.4 }])).toEqual({ ok: false, sum: 0.9 });
    expect(allocationValid([{ domainId: D1, weight: 1.2 }, { domainId: D2, weight: -0.2 }]).ok).toBe(false);
    expect(allocationValid([]).ok).toBe(false);
  });
});

describe('B91 ledger · the period, the variance and the forecast (cle-variance@1)', () => {
  it('the calendar period (UTC) containing the instant', () => {
    expect(periodBounds('month', '2026-10-04T10:00:00Z')).toMatchObject({ start: '2026-10-01', end: '2026-11-01' });
    expect(periodBounds('month', '2026-12-31T23:59:59Z')).toMatchObject({ start: '2026-12-01', end: '2027-01-01' });
    expect(periodBounds('quarter', '2026-08-15T00:00:00Z')).toMatchObject({ start: '2026-07-01', end: '2026-10-01' });
    expect(periodBounds('year', '2026-08-15T00:00:00Z')).toMatchObject({ start: '2026-01-01', end: '2027-01-01' });
  });
  it('variance = spent − amount; pct; the linear run-rate forecast to period end', () => {
    // 10 days into a 30-day month (September): 300 spent of 1200 → forecast 900, 300 under
    const v = variance({ spent: 300, amount: 1200, periodKind: 'month', at: '2026-09-11T00:00:00Z' });
    expect(v).toMatchObject({ spent: 300, amount: 1200, variance: -900, pct: 25, periodStart: '2026-09-01', periodEnd: '2026-10-01' });
    expect(v.elapsedFraction).toBeCloseTo(1 / 3, 6);
    expect(v.forecast).toBeCloseTo(900, 3);
    expect(v.forecastVariance).toBeCloseTo(-300, 3);
    const over = variance({ spent: 1000, amount: 1200, periodKind: 'month', at: '2026-09-16T00:00:00Z' });
    expect(over.forecast).toBeCloseTo(2000, 3); // half the month gone, 1000 spent → 2000 by period end: 800 over
    expect(variance({ spent: 0, amount: 100, periodKind: 'month', at: '2026-09-01T00:00:00Z' }).forecast).toBeNull(); // no elapsed time → no forecast (never inferred)
  });
  it('the thresholds a pct has reached, each once, ascending', () => {
    expect(thresholdsReached(79.99, [80, 100])).toEqual([]);
    expect(thresholdsReached(80, [100, 80])).toEqual([80]);
    expect(thresholdsReached(130, [80, 100, 80])).toEqual([80, 100]);
  });
});

describe('B91 ledger · the anomaly rule (cle-anomaly@1)', () => {
  it('today > k × the trailing mean is an anomaly; at or under it is not', () => {
    const base = [10, 10, 10, 10, 10, 10, 10];
    expect(anomaly({ todaySpend: 31, trailingDaily: base, k: 3 })).toMatchObject({ anomalous: true, basis: 'applied', trailingMean: 10, ratio: 3.1, windowDays: 7 });
    expect(anomaly({ todaySpend: 30, trailingDaily: base, k: 3 }).anomalous).toBe(false);
    // zero days count in the mean: 70 over 7 days with 6 zero days is a mean of 10
    expect(anomaly({ todaySpend: 31, trailingDaily: [70, 0, 0, 0, 0, 0, 0], k: 3 }).anomalous).toBe(true);
  });
  it('with no baseline (no spend in the window) the rule is NOT applied — neither anomaly nor all-clear is inferred', () => {
    expect(anomaly({ todaySpend: 500, trailingDaily: [0, 0, 0], k: 3 })).toMatchObject({ anomalous: false, basis: 'no_baseline', ratio: null });
    expect(anomaly({ todaySpend: 500, trailingDaily: [], k: 3 }).basis).toBe('no_baseline');
  });
});

describe('B91 ledger · the energy ESTIMATE', () => {
  it('Σ quantity × coefficient over the covered lines; an uncovered line is counted, never zero', () => {
    expect(energyEstimate([{ quantity: 1000, kwhPerUnit: 0.0002 }, { quantity: 50, kwhPerUnit: 0.01 }, { quantity: 9999, kwhPerUnit: null }])).toEqual({ kwh: expect.closeTo(0.7, 9) as unknown as number, estimated: 2, notEstimated: 1, label: 'ESTIMATE' });
    expect(energyEstimate([])).toEqual({ kwh: 0, estimated: 0, notEstimated: 0, label: 'ESTIMATE' });
  });
});

describe('B91 ledger · the optimisation boundary (cle-boundary@1; IA-70-003, DP-70-003)', () => {
  it('residency, isolation, retention and recovery are protected; an adjustable control passes', () => {
    for (const c of ['residency', 'isolation', 'retention', 'recovery']) expect(PROTECTED_CONTROLS as readonly string[]).toContain(c);
    expect(boundaryCheck([{ control: 'compute_schedule', from: 'any', to: 'off-peak' }])).toEqual({ touched: [], unknown: [], passed: true });
    expect(boundaryCheck([{ control: 'Retention', from: '7y', to: '1y' }])).toMatchObject({ touched: ['retention'], passed: false });
  });
  it('a protected control hidden as a KEY in what an adjustable change touches is caught; an unknown control is not assumed safe', () => {
    expect(boundaryCheck([{ control: 'instance_size', from: { size: 'm' }, to: { size: 's', placement: { Region: 'us-east-1' } } }])).toMatchObject({ touched: ['region'], passed: false });
    expect(boundaryCheck([{ control: 'cache_tier', to: [{ tier: 'cold', isolation: 'shared' }] }]).touched).toEqual(['isolation']);
    expect(boundaryCheck([{ control: 'turbo_mode', to: true }])).toMatchObject({ touched: [], unknown: ['turbo_mode'], passed: false });
    for (const c of ADJUSTABLE_CONTROLS) expect(PROTECTED_CONTROLS as readonly string[]).not.toContain(c);
  });
});

describe('B91 ledger · the reconciliation (cle-reconcile@1)', () => {
  it('matched when every dimension is within tolerance and nothing is unpriced; the differences otherwise, per dimension', () => {
    const inv = [{ dimension: 'simulation_compute', quantity: 120_000, amount: 240 }, { dimension: 'model_inference', quantity: 40, amount: 8 }];
    const led = [{ dimension: 'simulation_compute', quantity: 120_000, amount: 240.004 }, { dimension: 'model_inference', quantity: 40, amount: 8 }];
    expect(reconcile({ invoice: inv, ledger: led, tolerance: 0.01 }).outcome).toBe('matched');
    const r = reconcile({ invoice: inv, ledger: [{ dimension: 'simulation_compute', quantity: 100_000, amount: 200 }], tolerance: 0.01, unpriced: { storage: 2 } });
    expect(r.outcome).toBe('differences');
    expect(r.lines.map((l) => [l.dimension, l.amountDifference, l.quantityDifference, l.unpricedUsage, l.withinTolerance])).toEqual([
      ['model_inference', 8, 40, 0, false], ['simulation_compute', 40, 20_000, 0, false], ['storage', 0, 0, 2, false]]);
    expect(reconcile({ invoice: inv, ledger: led, tolerance: 0.01, otherCurrencyEntries: 1 }).outcome).toBe('differences');
  });
});

describe('B91 ledger · the intake', () => {
  it('a decimal is exact text; a budget declaration names neither budgetId nor expectedVersion, a revision both', () => {
    expect(decimalOf('1200.50')).toBe('1200.50'); expect(decimalOf(12)).toBe('12'); expect(decimalOf('1e3')).toBeNull(); expect(decimalOf(Number.NaN)).toBeNull();
    const owner = '0193a3d0-0000-7000-8000-0000000000aa';
    expect(validateBudgetIntake({ label: 'Simulation compute', amount: 1200, currency: 'EUR', ownerPrincipalId: owner, reason: 'the month of October' }, 'c')).toMatchObject({ budgetId: null, expectedVersion: null, capabilityKey: 'all', periodKind: 'month', amount: '1200' });
    expect(() => validateBudgetIntake({ budgetId: owner, amount: 1, currency: 'EUR', ownerPrincipalId: owner }, 'c')).toThrow(/budget rejected \(stale\)/);
    expect(() => validateBudgetIntake({ amount: 1, currency: 'EUR' }, 'c')).toThrow(/budget rejected \(owner\)/);
  });
  it('the window defaults to the current month at the database\'s instant; an inverted window is refused', () => {
    expect(windowOf({}, '2026-10-04T10:00:00.000Z', 'c')).toEqual({ from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' });
    expect(() => windowOf({ from: '2026-10-05T00:00:00Z', to: '2026-10-01T00:00:00Z' }, '2026-10-04T10:00:00Z', 'c')).toThrow(HttpException);
  });
});

describe('B91 ledger · the refusal families through the mapper', () => {
  const cases: Array<[string, string, number]> = [
    ['42501', 'rate card rejected (actor): recorded by the acting principal', 403],
    ['42501', 'rate card rejected (authority): a named, active human holding the commercial authority sets it', 403],
    ['42501', 'budget rejected (ownership): a budget is revised by the tenant administrator or its owner', 403],
    ['42501', 'ledger tick rejected (authority): the ledger is priced by the domain\'s active attention agent', 403],
    ['23503', 'allocation key rejected (unknown_domain): x is not a domain of this tenant', 404],
    ['23503', 'reconciliation rejected (unknown_invoice): x is not an imported invoice', 404],
    ['23503', 'budget rejected (unknown_budget): x is not a budget of this tenant', 404],
    ['2F002', 'rate card rejected (stale): version 1 of simulation_compute:wall_ms takes effect …', 409],
    ['2F002', 'rate card rejected (priced): usage of simulation_compute:wall_ms that occurred at … is already priced', 409],
    ['2F002', 'allocation key rejected (priced): tenant-level storage usage … is already priced and allocated', 409],
    ['2F002', 'budget rejected (stale): the budget is at version 2, not 1', 409],
    ['23505', 'budget rejected (duplicate): this tenant already has a month budget for all in this scope — revise it', 409],
    ['23505', 'invoice rejected (duplicate): invoice SYN-1 of this tenant is already imported', 409],
    ['22023', 'allocation key rejected (weights): the weights sum to 0.9, not 1', 422],
    ['22023', 'budget rejected (owner): the owner is a named, active human of the tenant — never an agent', 422],
    ['22023', 'invoice rejected (synthetic): this build imports SYNTHETIC invoices only', 422],
    ['22023', 'invoice rejected (total): the lines sum to 10, the total is 11', 422],
    ['22023', 'optimisation rejected (boundary): "x" would change residency — economic optimisation never weakens residency, isolation, retention or recovery', 422],
    ['22023', 'optimisation rejected (control): turbo_mode — an optimisation changes only declared adjustable controls', 422],
    ['22023', 'reconciliation rejected (tolerance): the tolerance is an amount in [0, 1000000]', 422],
  ];
  it('every class to its honest status (403 / 404 / 409 / 422), the database text kept', () => {
    for (const [code, message, status] of cases) {
      const r = asObservationRefusal(Object.assign(new Error(message), { code }), 'c');
      expect(r, message).not.toBeNull();
      expect(r!.getStatus(), message).toBe(status);
      expect(String((r!.getResponse() as { message?: string }).message), message).toBe(message);
    }
  });
  it('the older unanchored `reconciliation rejected: ` row still reads its own colon form', () => {
    const r = asObservationRefusal(Object.assign(new Error('reconciliation rejected: no element x'), { code: '23503' }), 'c');
    expect(r).not.toBeNull();
  });
});

describe('B91 ledger · the EXACT PDP rules', () => {
  const T = '0193a3d0-0000-7000-8000-0000000000a1'; const D = '0193a3d0-0000-7000-8000-0000000000a2';
  const pdp = new PdpService();
  const input = (action: string, roles: Array<[string, 'PLATFORM' | 'TENANT' | 'DOMAIN']>, scope: 'PLATFORM' | 'TENANT' | 'DOMAIN', kind: 'human' | 'agent' = 'human'): PolicyInput => ({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: 'password',
                 bindings: roles.map(([roleCode, s]) => ({ roleCode, scope: s, tenantId: s === 'PLATFORM' ? null : T, domainId: s === 'DOMAIN' ? D : null })) },
    delegationId: null, action, objectType: 'CLG', objectId: null, purposeId: 'commercial',
    context: { scope, tenantId: scope === 'PLATFORM' ? null : T, domainId: scope === 'DOMAIN' ? D : null }, consequenceClass: 'C2',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  it('the vendor\'s writes: the commercial authority (PLATFORM), human-gated; the platform administrator and the tenant administrator are denied', () => {
    for (const a of ['commercial.rate.set', 'commercial.allocation.set', 'commercial.invoice.import', 'commercial.invoice.reconcile', 'commercial.optimisation.record']) {
      const r = pdp.evaluate(input(a, [['commercial_authority', 'PLATFORM']], 'PLATFORM'));
      expect(r.decision, a).toBe('allow_with_obligations');
      expect(r.obligations, a).toEqual([{ type: 'human_gate' }]);
      expect(pdp.evaluate(input(a, [['platform_admin', 'PLATFORM']], 'PLATFORM')).decision, a).toBe('deny');
      expect(pdp.evaluate(input(a, [['tenant_admin', 'TENANT']], 'TENANT')).decision, a).toBe('deny');
    }
  });
  it('the budget: the tenant administrator (TENANT) and the domain\'s budget-holding roles, human-gated; an analyst is denied', () => {
    expect(pdp.evaluate(input('commercial.budget.set', [['tenant_admin', 'TENANT']], 'TENANT'))).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'human_gate' }] });
    expect(pdp.evaluate(input('commercial.budget.set', [['tenant_admin', 'TENANT']], 'DOMAIN')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.budget.set', [['executive', 'DOMAIN']], 'DOMAIN')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.budget.set', [['domain_analyst', 'DOMAIN']], 'DOMAIN')).decision).toBe('deny');
    expect(pdp.evaluate(input('commercial.budget.set', [['domain_admin', 'DOMAIN']], 'TENANT')).decision).toBe('deny'); // a domain binding does not reach the tenant scope
  });
  it('the read: consequential and audited; the platform administrator is not a reader of cost governance', () => {
    expect(pdp.evaluate(input('commercial.ledger.read', [['auditor', 'TENANT']], 'TENANT'))).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'audit_access' }] });
    expect(pdp.evaluate(input('commercial.ledger.read', [['commercial_authority', 'PLATFORM']], 'PLATFORM')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.ledger.read', [['platform_admin', 'PLATFORM']], 'PLATFORM')).decision).toBe('deny');
  });
  it('no prefix match: a longer or shorter name is not covered', () => {
    for (const a of ['commercial.rate.set.now', 'commercial.rate', 'commercial.ledger.reader', 'commercial.budget.se']) {
      expect(['deny', 'indeterminate'], a).toContain(pdp.evaluate(input(a, [['commercial_authority', 'PLATFORM'], ['tenant_admin', 'TENANT']], 'TENANT')).decision);
    }
  });
});

describe('B91 ledger · the tick step', () => {
  it('commercial-ledger, order 82 (after the B90 and B30 steps)', () => {
    expect(COMMERCIAL_LEDGER_STEP).toBe('commercial-ledger');
    expect(COMMERCIAL_LEDGER_ORDER).toBe(82);
  });
});
