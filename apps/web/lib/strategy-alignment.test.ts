import { describe, expect, it } from 'vitest';
import { CLAIM_LABEL, CONTINUITY_LABEL, REASON_LABEL, criteriaLine, freshnessLine, /* B36 (0094 §S) strategy */ RAISED_KIND_LABEL, actStanding, raisedLine } from './strategy-alignment';

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

/* B36 (0094 §S) strategy: an act's standing (revoked, lapsed, in force) and a scheduled detection's routing are WORDED from the record. */
describe('B36 · revocable acts and the schedule\'s detections in words', () => {
  const now = new Date('2026-09-30T12:00:00Z');
  it('an act\'s standing: in force, rejected, lapsed, REVOKED with when, by whom and why', () => {
    expect(actStanding({ decision: 'approve', expires_at: '2027-03-01T00:00:00.000Z', revoked_at: null, revoked_by: null, revocation_reason: null }, now)).toBe('● in force until 2027-03-01T00:00:00.000Z');
    expect(actStanding({ decision: 'reject', expires_at: '2027-03-01T00:00:00.000Z', revoked_at: null, revoked_by: null, revocation_reason: null }, now)).toMatch(/^○ rejected/);
    expect(actStanding({ decision: 'approve', expires_at: '2026-01-01T00:00:00.000Z', revoked_at: null, revoked_by: null, revocation_reason: null }, now)).toBe('○ lapsed at 2026-01-01T00:00:00.000Z');
    expect(actStanding({ decision: 'approve', expires_at: '2027-03-01T00:00:00.000Z', revoked_at: '2026-09-30T10:00:00.000Z', revoked_by: '0190b1c2-d3e4-7000-8000-000000000361', revocation_reason: 'the supplier withdrew' }, now))
      .toBe('✕ REVOKED at 2026-09-30T10:00:00.000Z by 0190b1c2… — the supplier withdrew');
  });
  it('a raised detection: its kind, the routing the schedule gave it, whom', () => {
    expect(Object.keys(RAISED_KIND_LABEL)).toEqual(['stale_measure', 'gamed_measure', 'lost_linkage', 'owner_missing']);
    expect(raisedLine({ kind: 'stale_measure', routing: { state: 'open', route_roles: ['strategy_owner'] }, owner_principal_id: '0190b1c2-d3e4-7000-8000-000000000361', routed_item_id: '0190b1c2-d3e4-7000-8000-000000000362' }))
      .toBe('◍ stale measure — the input is shown stale, never current; the owner refreshes it · routed open to 0190b1c2… and the roles strategy_owner · item 0190b1c2…');
    expect(raisedLine({ kind: 'owner_missing', routing: { state: 'unrouted', route_roles: [] }, owner_principal_id: null, routed_item_id: null })).toMatch(/routed unrouted to the roles nobody$/);
  });
});
