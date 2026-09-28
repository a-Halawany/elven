import { describe, expect, it } from 'vitest';
import { CLAIM_LABEL, CONTINUITY_LABEL, REASON_LABEL, criteriaLine, freshnessLine } from './strategy-alignment';

/** CP-6 B32 (0089 §G): the gap view and the detections are worded, never judged on the client (the criteria and the continuity are the server's). */
describe('the Strategy Graph alignment workspace is worded, never scored on the client', () => {
  it('the vocabularies are the migration\'s (the continuity responses, the claim states, every gap reason alignment_rule@1 emits), each with a glyph and words', () => {
    expect(Object.keys(CONTINUITY_LABEL)).toEqual(['hold', 'expose_affected_scope', 'route_to_owner']);
    expect(Object.keys(CLAIM_LABEL)).toEqual(['supported', 'gap', 'held']);
    expect(Object.keys(REASON_LABEL).sort()).toEqual(['capability_under_evidenced', 'held_by_detection', 'initiative_unresourced', 'measure_stale', 'measure_unapproved',
      'no_active_initiative', 'no_capability', 'no_measure', 'objective_not_set']);
    expect(CONTINUITY_LABEL.expose_affected_scope).toMatch(/never current/);
  });
  it('the criteria are a COUNT with each criterion shown — never a percentage or a weighted number', () => {
    const line = criteriaLine({ criteria_met: 3, criteria_total: 5, criteria: [
      { criterion: 'objective_set', met: true, basis: '' }, { criterion: 'capability_evidenced', met: false, basis: '' }, { criterion: 'initiative_active', met: true, basis: '' },
      { criterion: 'initiative_resourced', met: true, basis: '' }, { criterion: 'measure_current', met: false, basis: '' }] });
    expect(line).toBe('3 of 5 · ● objective set · ○ capability evidenced · ● initiative active · ● initiative resourced · ○ measure current');
    expect(line).not.toMatch(/%/);
  });
  it('a measure\'s freshness in words: stale with its age, never observed stated', () => {
    expect(freshnessLine({ state: 'stale', age_days: '10.00', freshness_days: '7' })).toBe('◍ stale — 10.00 d old, window 7 day(s)');
    expect(freshnessLine({ state: 'fresh', age_days: 1, freshness_days: 7 })).toBe('● fresh — 1 d old, window 7 day(s)');
    expect(freshnessLine({ state: 'no_observation', age_days: null, freshness_days: 30 })).toBe('? never observed — window 30 day(s)');
  });
});
