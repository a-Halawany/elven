import { describe, expect, it } from 'vitest';
import { candidateLine, constraintLine, estimateMark, eventLine, materialityLine, proposalLine, qualificationLine, requestLine, spreadLine } from './estimation-b30';

/** CP-6 B30 §ES (0103): the reconciliation page WORDS the server's record — it never estimates, qualifies, checks or decides. SYNTHETIC. */
describe('the reconciliation page is worded, never judged on the client', () => {
  it('a state is a glyph, a token and words — never colour alone', () => {
    expect(estimateMark('proposed').text).toMatch(/active snapshot is unchanged/);
    expect(estimateMark('approved')).toMatchObject({ glyph: '●', token: '--eye-color-success' });
    expect(estimateMark('odd').text).toBe('ODD');
  });
  it('the proposal, against the head', () => {
    expect(proposalLine({ key: 'corridor.capacity_share', proposed_value: '62.000', unit: '%', confidence: '0.93', head_value: 100, head_unit: '%', head_version: 4, as_of: '2024-01-17' }))
      .toBe('corridor.capacity_share = 62 % (confidence 0.93; as of 2024-01-17) — head v4: 100 %');
    expect(proposalLine({ key: 'k', proposed_value: 1, unit: 'u', confidence: 1, head_value: null, head_unit: null, head_version: null, as_of: '2024-01-17' })).toMatch(/no head on actual$/);
  });
  it('every candidate kept: its value, or why it has none; the spread as the server stated it', () => {
    expect(candidateLine({ estimator_id: 'e', version: 1, name: 'portwatch-ratio', role: 'primary', method: 'ratio_to_baseline', value: 62, raw: 64.48, confidence: 0.931,
                           window: { from: '2024-01-17', to: '2024-01-17', n: 1 }, last_point: null, evidence: [], excluded: null }))
      .toBe('portwatch-ratio (primary, ratio_to_baseline): 62 (confidence 0.931) over 1 point(s) 2024-01-17…2024-01-17');
    expect(candidateLine({ estimator_id: 'e', version: 1, name: 'weekly', role: 'challenger', method: 'last_observation', value: null, raw: null, confidence: null, window: null, last_point: null, evidence: [],
                           excluded: 'unit mismatch' })).toBe('weekly (challenger, last_observation): no candidate — unit mismatch');
    expect(spreadLine({ n: 3, min: 54.459, max: 63.881, abs: 9.422, relative: 0.173011, ambiguity_threshold: 0.5 })).toBe('3 candidates from 54.459 to 63.881 — spread 9.422 (17.3% of the proposal; ambiguous above 50.0%)');
    expect(spreadLine({ n: 1, min: 1, max: 1, abs: 0, relative: 0 })).toBe('one candidate — nothing to disagree with');
  });
  it('the qualification, the constraint check, the materiality and the requests, as recorded', () => {
    expect(qualificationLine({ estimator_id: 'e', input: { kind: 'series', series_key: 'portwatch:chokepoint4:n_total' }, source_id: null, source_health: { state: 'healthy' },
                               cadence: { last_point: '2024-01-17' }, unit_check: { verdict: 'match' }, truth_state: { verdict: 'admissible' }, verdict: 'qualified', reasons: [] }))
      .toBe('series portwatch:chokepoint4:n_total: QUALIFIED — health healthy, latest 2024-01-17, unit match, truth admissible');
    expect(qualificationLine({ estimator_id: 'e', input: { kind: 'series', series_key: 's' }, source_id: null, source_health: { state: 'suspended' }, cadence: {}, unit_check: {}, truth_state: {},
                               verdict: 'disqualified', reasons: ['source health is suspended (contract.suspended)'] })).toBe('series s: DISQUALIFIED — source health is suspended (contract.suspended)');
    expect(constraintLine({ outcome: 'satisfied', pins: [{ set_key: 'corridor-transit-balance', version: 1 }], violations: [] }, 'satisfied')).toBe('SATISFIED — corridor-transit-balance v1');
    expect(constraintLine({ outcome: 'violated', pins: [], violations: [{ message: 'stock does not balance' }] }, 'violated')).toBe('VIOLATED — stock does not balance');
    expect(materialityLine({ materiality: { head_version: 4, head_value: 100, delta_abs: 38, delta_relative: 0.38, threshold: 0.05, material: true, basis: 'relative change against the head' },
                             material: true, ambiguous: false, ambiguity_reasons: [], routed: true })).toBe('MATERIAL — change 38.0% against the head (threshold 5.0%) · routed to the twin owner for review');
    expect(requestLine({ input_ref: 'series:s', reason_class: 'stale', via: 'scheduler', scheduler: { scheduler_id: 'obs:x', cadence_seconds: 3600 }, state: 'open', requester_kind: 'agent' }))
      .toBe('series:s is stale — OPEN, requested by the Reconciliation Agent through the collection scheduler (obs:x, every 3600 s)');
    expect(eventLine({ event: 'estimate.approved', details: { applied_version: 5 } })).toBe('approved — snapshot v5');
    expect(eventLine({ event: 'trigger.telemetry', details: { series_key: 's' } })).toBe('trigger: a new observation of s');
  });
});
