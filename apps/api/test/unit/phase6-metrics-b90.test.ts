/**
 * CP-6 B90 §M (0095) — the semantic layer's pure logic: the PDP rules of the `B90 metrics` block (exact; the owner's roles and the steward
 * declare, certify, withdraw and recalculate under a human gate; serving is an access mode without one; the read's audience), the
 * error-map rows (every class of the two families answers its B9 status; the prelude's `data product rejected` rows untouched), and
 * the request validators (a DECLARATIVE definition — never an expression; the instants; the filters; the certification's expiry).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AGGREGATIONS, MAX_CERTIFICATION_DAYS, MET_SCHEMA, METRIC_CERTIFICATION_ORDER, METRIC_CERTIFICATION_STEP, filtersOf, instantOf, reasonOf, validateCertify, validateDefinition, validateServe } from '../../src/products/metrics/metrics.service.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (action: string, roles: string[], kind: 'human' | 'agent' = 'human', scope: 'DOMAIN' | 'TENANT' = 'DOMAIN'): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: kind === 'agent' ? 'agent_grant' : 'password',
               bindings: roles.map((roleCode) => ({ roleCode, scope, tenantId: T, domainId: scope === 'DOMAIN' ? D : null })) },
  delegationId: null, action, objectType: 'MET', objectId: null, purposeId: 'executive',
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

describe('B90 metrics · the PDP block', () => {
  const pdp = new PdpService();
  const gated = ['products.metric.declare', 'products.metric.certify', 'products.metric.withdraw_certification', 'products.metric.recalculate'];
  it('declare, certify, withdraw and recalculate: the owners\' roles and the steward, human-gated; a collector and a person holding nothing are refused; an agent meets the gate', () => {
    for (const action of gated) {
      for (const role of ['data_steward', 'strategy_owner', 'executive', 'domain_admin', 'domain_analyst', 'risk_owner']) {
        const r = pdp.evaluate(input(action, [role]));
        expect(r.decision, `${action} ${role}`).toBe('allow_with_obligations'); // the human gate rides along
        expect(r.obligations.some((o) => o.type === 'human_gate'), `${action} ${role} gate`).toBe(true);
      }
      expect(pdp.evaluate(input(action, ['collection_manager'])).decision, action).toBe('deny');
      expect(pdp.evaluate(input(action, [])).decision, action).toBe('deny');
      expect(pdp.evaluate(input(action, ['board_member'])).decision, action).toBe('deny');
      const agent = pdp.evaluate(input(action, ['executive'], 'agent'));
      expect(agent.decision === 'deny' || agent.obligations.some((o) => o.type === 'human_gate'), `${action} agent`).toBe(true);
    }
  });
  it('serve is an access mode: the readers (the board member, the analysts, the auditor at tenant scope, the executive roles) without a human gate; the read adds the planning agent; an outsider is refused', () => {
    for (const role of ['board_member', 'domain_analyst', 'executive', 'executive_operator', 'decision_owner', 'strategy_owner', 'data_steward']) {
      const r = pdp.evaluate(input('products.metric.serve', [role]));
      expect(r.decision, role).toBe('allow');
      expect(r.obligations.some((o) => o.type === 'human_gate'), role).toBe(false);
    }
    expect(pdp.evaluate(input('products.metric.serve', ['auditor'], 'human', 'TENANT')).decision).toBe('allow');
    expect(pdp.evaluate(input('products.metric.serve', ['collection_manager'])).decision).toBe('deny');
    expect(pdp.evaluate(input('products.metric.read', ['planning_agent'], 'agent')).decision).toBe('allow_with_obligations'); // audit_access rides along
    expect(pdp.evaluate(input('products.metric.read', ['board_member'])).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('products.metric.read', ['collection_manager'])).decision).toBe('deny');
    // no prefix rule leaks: an action nobody declared is refused
    expect(pdp.evaluate(input('products.metric.delete', ['platform_admin'])).decision).not.toMatch(/^allow/);
  });
});

describe('B90 metrics · the error map (the two families; the prelude\'s untouched)', () => {
  it('the standing 403: the acting principal, the authority (a steward certifying, a non-owner declaring)', () => {
    expect(answer('metric rejected (actor): declared by the acting principal', '42501')).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    expect(answer('metric rejected (authority): a semantic model is declared by the product\'s owner or by a data steward', '42501')).toMatchObject({ status: 403 });
    expect(answer('metric certification rejected (authority): metric x is certified by its owner (a steward declares, never certifies)', '42501')).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
  });
  it('the absences 404: unknown_product, unknown_metric, unknown_version, unknown_serving', () => {
    for (const t of ['metric rejected (unknown_product): x', 'metric rejected (unknown_metric): x', 'metric certification rejected (unknown_metric): x', 'metric certification rejected (unknown_version): x', 'metric rejected (unknown_serving): x']) {
      expect(answer(t), t).toMatchObject({ status: 404, code: 'EYE-STA-001' });
    }
  });
  it('the record\'s state 409: state, the executive view\'s certification refusal, a conflict, unchanged, effective, the signature and the canonical object', () => {
    for (const t of ['metric rejected (state): x', 'metric certification rejected (state): x', 'metric rejected (certification): metric x is declared — the executive view serves certified metrics only',
                     'metric certification rejected (conflict): x', 'metric rejected (unchanged): x', 'metric rejected (effective): x', 'metric certification rejected (signature): x', 'metric certification rejected (canonical): x']) {
      expect(answer(t), t).toMatchObject({ status: 409, code: 'EYE-STA-002' });
    }
  });
  it('the caller\'s own 422: the measure, the grain, a dimension, a filter, the aggregation, the unit, the view, the instant, the expiry, the reason', () => {
    for (const t of ['metric rejected (measure): x', 'metric rejected (grain): x', 'metric rejected (dimension): x', 'metric rejected (filter): x', 'metric rejected (aggregation): x', 'metric rejected (unit): x',
                     'metric rejected (view): x', 'metric rejected (as_of): x', 'metric certification rejected (expiry): x', 'metric certification rejected (reason): x', 'metric rejected (kind): x', 'metric rejected (title): x']) {
      expect(answer(t), t).toMatchObject({ status: 422, code: 'EYE-REQ-001' });
    }
  });
  it('the prelude\'s family answers as before, and neither family is matched by the other\'s rows', () => {
    expect(answer('data product rejected (state): x')).toMatchObject({ status: 409 });
    expect(answer('data product rejected (not_owner): x', '42501')).toMatchObject({ status: 403 });
    expect(answer('data product rejected (measure): an SLO measure is a lower-case identifier')).toMatchObject({ status: 422 });
    expect(answer('a metric rejected (state): not anchored')).toBeNull();
  });
});

describe('B90 metrics · the validators (a declarative definition, never an expression)', () => {
  it('a definition names a whitelisted measure name, a unit, an aggregation, a grain, dimensions and scalar filters; the dimensions are deduplicated; the effective instant is optional', () => {
    const d = validateDefinition({ measure: 'measure_observations', unit: ' EUR ', aggregation: 'last', grain: 'month', dimensions: ['measure_id', 'objective_id', 'measure_id'], filters: { measure_id: 'abc' }, effectiveFrom: '2026-01-01T00:00:00Z' }, 'c');
    expect(d).toEqual({ title: null, measure: 'measure_observations', unit: 'EUR', aggregation: 'last', grain: 'month', dimensions: ['measure_id', 'objective_id'], filters: { measure_id: 'abc' }, effectiveFrom: '2026-01-01T00:00:00.000Z' });
    expect(validateDefinition({ measure: 'health_score', unit: 'points', aggregation: 'last', grain: 'component' }, 'c')).toMatchObject({ dimensions: [], filters: {}, effectiveFrom: null });
    expect(status(() => validateDefinition({ measure: 'sum(value) / 2', unit: 'EUR', aggregation: 'sum', grain: 'month' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric rejected \(measure\).*never an expression/) });
    expect(status(() => validateDefinition({ measure: 'health_score', unit: '', aggregation: 'last', grain: 'component' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric rejected \(unit\)/) });
    expect(status(() => validateDefinition({ measure: 'health_score', unit: 'points', aggregation: 'median', grain: 'component' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric rejected \(aggregation\)/) });
    expect(status(() => validateDefinition({ measure: 'health_score', unit: 'points', aggregation: 'last', grain: 'Per Day' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric rejected \(grain\)/) });
    expect(status(() => validateDefinition({ measure: 'health_score', unit: 'points', aggregation: 'last', grain: 'component', dimensions: 'component_key' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric rejected \(dimension\)/) });
    expect(status(() => validateDefinition({ measure: 'health_score', unit: 'points', aggregation: 'last', grain: 'component', filters: { component_key: { in: ['a'] } } }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric rejected \(filter\).*scalar/) });
    expect(status(() => validateDefinition({ measure: 'health_score', unit: 'points', aggregation: 'last', grain: 'component', effectiveFrom: 'yesterday' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric rejected \(effective_from\)/) });
    expect(AGGREGATIONS).toEqual(['sum', 'avg', 'min', 'max', 'last', 'count']);
  });
  it('a serve names its view (executive | analyst); the grain, the filters and the instant are optional; a certification names the version and an ISO expiry; a withdrawal says why', () => {
    expect(validateServe({ view: 'executive' }, 'c')).toEqual({ grain: null, filters: null, asOf: null, view: 'executive' });
    expect(validateServe({ view: 'analyst', grain: 'measure', filters: { objective_id: 'x' }, asOf: '2026-09-30T10:00:00Z' }, 'c')).toEqual({ grain: 'measure', filters: { objective_id: 'x' }, asOf: '2026-09-30T10:00:00.000Z', view: 'analyst' });
    expect(status(() => validateServe({ view: 'board' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric rejected \(view\)/) });
    expect(status(() => validateServe({ view: 'executive', asOf: 'soon' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric rejected \(as_of\)/) });
    expect(validateCertify({ version: 2, expiresAt: '2026-12-29T00:00:00Z' }, 'c')).toEqual({ version: 2, expiresAt: '2026-12-29T00:00:00.000Z' });
    expect(status(() => validateCertify({ version: 0, expiresAt: '2026-12-29T00:00:00Z' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric certification rejected \(version\)/) });
    expect(status(() => validateCertify({ version: 1 }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric certification rejected \(expiry\).*366 days/) });
    expect(reasonOf({ reason: '  the source grain became incompatible  ' }, 'c')).toBe('the source grain became incompatible');
    expect(status(() => reasonOf({ reason: 'short' }, 'c'))).toMatchObject({ status: 422, message: expect.stringMatching(/^metric certification rejected \(reason\)/) });
    expect(instantOf(undefined, 'x', 'c')).toBeNull();
    expect(filtersOf({ aa: 1, bb: 'x', cc: true }, 'c')).toEqual({ aa: 1, bb: 'x', cc: true });
    expect(status(() => filtersOf({ 'Bad Key': 'x' }, 'c'))).toMatchObject({ status: 422 });
  });
  it('the constants: the tick step, its order, the canonical schema, the longest certification', () => {
    expect(METRIC_CERTIFICATION_STEP).toBe('metric-certification');
    expect(METRIC_CERTIFICATION_ORDER).toBe(65);
    expect(MET_SCHEMA).toBe('MET@v1');
    expect(MAX_CERTIFICATION_DAYS).toBe(366);
  });
});
