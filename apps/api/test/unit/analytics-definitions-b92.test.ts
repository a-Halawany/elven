/**
 * B92 §MD — the pure logic of the definitions part: the MetricContract → port contract mapping, the request-shape test, the performance-purpose
 * word test (the mirror of analytics.states_performance_purpose), the person-dimension test, ES-40-008's qualification. SYNTHETIC values.
 */
import { describe, expect, it } from 'vitest';
import type { MetricContract } from '../../src/analytics/contract.js';
import { contractOfRequest, contractPayload, personDimension, qualificationProblem, statesPerformancePurpose } from '../../src/analytics/definitions/contract-payload.js';

const OWNER = '0190b1c2-d3e4-7000-8000-0000000000aa';
const C: MetricContract = {
  metricKey: 'MET-001', title: 'Strategic loop closure rate', meaning: 'Decisions with linked objective, evidence, foresight, commitment, outcome, and learning', kind: 'rate', unit: 'share', direction: 'higher',
  population: { subject: 'decision package committed in the window' }, numerator: 'packages with all six links', denominator: 'packages committed in the window', exclusions: [],
  window: { kind: 'calendar_quarter', clock: 'record' }, dimensions: [], privacyClass: 'aggregate', kMin: 5, floorN: 3, threshold: { target: 0.8 }, purposeKey: 'mission-outcomes',
  serves: { decision_classes: ['strategic'] }, cadence: 'monthly', ownerRole: 'Executive product owner', action: 'a review by the executive product owner', retirement: 'retired when App M retires MET-001',
  quality: { max_staleness_days: 120 }, costAllocation: {}, computationKey: 'met001_loop_closure', params: {}, unsupportedReason: null, sourceRefs: ['MET-001'],
};

describe('contractPayload / contractOfRequest', () => {
  it('maps every camelCase field onto the port\'s snake_case contract; the named owner bound; App M\'s owner role travels in quality.owner_role', () => {
    const p = contractPayload(C, OWNER);
    expect(p).toMatchObject({ metric_key: 'MET-001', window_spec: { kind: 'calendar_quarter', clock: 'record' }, privacy_class: 'aggregate', k_min: 5, floor_n: 3, purpose_key: 'mission-outcomes',
      owner_principal_id: OWNER, computation_key: 'met001_loop_closure', source_refs: ['MET-001'], cost_allocation: {} });
    expect(p['quality']).toEqual({ max_staleness_days: 120, owner_role: 'Executive product owner' });
    expect((p['window_spec'] as Record<string, unknown>)['days']).toBeUndefined();
    expect(contractPayload({ ...C, window: { kind: 'rolling_days', days: 90, clock: 'world' } }, OWNER)['window_spec']).toEqual({ kind: 'rolling_days', clock: 'world', days: 90 });
  });
  it('the request: camelCase needs the owner; snake_case passes through with defaults; anything else is a request problem', () => {
    expect('problem' in contractOfRequest(C, null)).toBe(true);
    expect(contractOfRequest(C, OWNER)).toMatchObject({ contract: { metric_key: 'MET-001', owner_principal_id: OWNER } });
    expect(contractOfRequest({ metric_key: 'MET-002' }, OWNER)).toMatchObject({ contract: { metric_key: 'MET-002', owner_principal_id: OWNER, dimensions: [], quality: {}, threshold: {} } });
    expect('problem' in contractOfRequest({ metricKey: 'MET-003' }, OWNER)).toBe(true);
    expect('problem' in contractOfRequest('MET-001', OWNER)).toBe(true);
    expect('problem' in contractOfRequest({ title: 'no key' }, OWNER)).toBe(true);
  });
});

describe('statesPerformancePurpose (the mirror of the port\'s test)', () => {
  it('finds a stated purpose of evaluating people; the longest phrase wins; dashes read as spaces', () => {
    expect(statesPerformancePurpose('The annual Employee-Performance review of the team')).toBe('employee performance');
    expect(statesPerformancePurpose('ranking staff by acknowledgement speed')).toBe('ranking staff');
    expect(statesPerformancePurpose('a performance review per analyst')).toBe('performance review');
    expect(statesPerformancePurpose('surveillance of the call centre')).toBe('surveil');
  });
  it('a negated phrase is a disclaimer, not a purpose; a product purpose passes', () => {
    expect(statesPerformancePurpose('improving decision support — never for employee performance, ranking or surveillance')).toBeNull();
    expect(statesPerformancePurpose('no ranking of staff; product quality only')).toBeNull();
    expect(statesPerformancePurpose('the reliability of the product\'s deliveries')).toBeNull();
    expect(statesPerformancePurpose(null)).toBeNull();
  });
});

describe('personDimension', () => {
  it('the prelude\'s list and the role-of-a-person names are persons; a factor, a severity or a role cohort is not', () => {
    for (const d of ['acknowledged_by', 'principal', 'owner', 'reviewer_role', 'employee_id', 'staff', 'user_class']) expect(personDimension(d), d).toBe(true);
    for (const d of ['severity', 'risk_factor', 'role', 'horizon', 'method', 'channel', 'detector']) expect(personDimension(d), d).toBe(false);
  });
});

describe('qualificationProblem (ES-40-008)', () => {
  it('a briefing or publication cites a non-determinate result only qualified, its note naming the state; a package or a determinate result needs nothing', () => {
    expect(qualificationProblem('decision_package', 'indeterminate', false, null)).toBeNull();
    expect(qualificationProblem('briefing', 'determinate', false, null)).toBeNull();
    expect(qualificationProblem('briefing', 'indeterminate', false, null)).toMatch(/only qualified/);
    expect(qualificationProblem('publication', 'unsupported', true, 'see appendix')).toMatch(/16\+ characters naming the state/);
    expect(qualificationProblem('publication', 'unsupported', true, 'UNSUPPORTED until B107/H3 ships the results')).toBeNull();
  });
});
