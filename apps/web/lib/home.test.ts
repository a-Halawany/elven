import { describe, expect, it } from 'vitest';
import { HOME_SECTIONS, actionLabel, buildAgenda, cadenceLine, choiceLabel, closingRecordLine, contextLine, hitLine, limitationsLine, metricLine, resetNeedsConfirmation, sectionLine, viewsByRole } from './home';

/** CP-6 B36 (0094 §H): the home is worded from what the server composed; the helpers never filter, rank, judge staleness or authorise. */
describe('the executive home client', () => {
  const ID = '0190b1c2-d3e4-7000-8000-000000000001';
  const DIGEST = 'a'.repeat(64);
  it('the seven sections are the prelude\'s order (executive.home_section_names) and a section line says its count, as-of and context', () => {
    expect([...HOME_SECTIONS]).toEqual(['priorities', 'intelligence', 'warnings', 'decisions', 'commitments', 'outcomes', 'cadence']);
    expect(sectionLine('priorities', { count: 3, as_of: '2026-09-30T08:00:00Z', context: DIGEST })).toBe('priorities: 3 as of 2026-09-30T08:00:00Z · under context aaaaaaaaaaaa…');
    expect(sectionLine('warnings', { count: 0, as_of: '2026-09-30T08:00:00Z', context: null })).toBe('warnings: 0 as of 2026-09-30T08:00:00Z · under no context (the whole domain)');
    expect(sectionLine('outcomes', null)).toBe('outcomes: not composed');
    expect(limitationsLine({ limitations: ['a', 'b'] })).toBe('a · b');
    expect(limitationsLine({ limitations: null })).toBe('no limitation declared');
  });
  it('the context line names the objective, horizon, scenario, the EFFECTIVE ceiling (and the context\'s when the reader\'s is lower), the effective instant and the digest', () => {
    expect(contextLine(null, { reader: 'confidential', context: null, effective: 'confidential' })).toBe('no context set — the whole domain, horizon 90d, the reader\'s own ceiling (confidential), effective now');
    const c = { digest: DIGEST, context_id: ID, objective_id: ID, scenario_id: null, horizon: '30d', classification: 'restricted', effective_at: null, set: true };
    expect(contextLine(c, { reader: 'confidential', context: 'restricted', effective: 'confidential' })).toBe('objective 0190b1c2… · horizon 30d · scenario none · ceiling confidential (the context asked restricted; the reader\'s is confidential) · effective now · digest aaaaaaaaaaaa…');
    expect(choiceLabel({ id: ID, title: 'Regensburg on-time delivery', status: 'closed', owner: ID, stale: true })).toBe('Regensburg on-time delivery (closed) — STALE, cannot be set');
    expect(choiceLabel({ id: ID, title: 'Corridor closure', state: 'active', owner: ID, stale: false })).toBe('Corridor closure (active)');
  });
  it('the cadence and the closing record in words; the reset needs a confirmation only when the server lists open board-class decisions', () => {
    expect(cadenceLine(null, null)).toBe('no cadence is open — the executive or the operator opens one');
    expect(cadenceLine({ period: 'weekly', sequence: 2, opened_at: '2026-09-28T07:00:00Z', opened_by: ID }, { sequence: 1, closed_at: '2026-09-28T06:59:00Z' })).toBe('weekly cycle #2 open since 2026-09-28T07:00:00Z by 0190b1c2… · the previous (#1) closed 2026-09-28T06:59:00Z');
    const record = { reviewed: { room_reviews: 2, reviews_concluded: 1 }, decided: { committed: [{}], rejected: 0, withdrawn: 1 }, committed: { items_opened: 3, items_done: 1 }, left_open: { attention_items: 4, rooms_overdue: 1, packages_in_flight: 2, commitment_items_overdue: 0, board_decisions_open: [{ package_id: ID }] } };
    expect(closingRecordLine(record)).toBe('reviewed 2 room review(s) + 1 concluded · decided 1 committed, 0 rejected, 1 withdrawn · committed 3 item(s) opened, 1 done · left open 4 queue item(s), 1 room(s) overdue, 2 package(s) in flight, 0 commitment item(s) overdue, 1 board-class decision(s) open');
    expect(resetNeedsConfirmation(record)).toBe(1);
    expect(resetNeedsConfirmation({ left_open: { board_decisions_open: [] } })).toBe(0);
    expect(resetNeedsConfirmation(null)).toBe(0);
  });
  it('a search hit line carries the explanation the server gave (field, terms, as-of, the context filter) and the gate state when present', () => {
    const h = { kind: 'package', id: ID, title: 'Regensburg dual sourcing', state: 'proposed', gate: { state: 'review_requested' }, as_of: '2026-09-29T10:00:00Z', package_id: ID,
      explanation: { field: 'title', terms: ['regensburg'], query: 'Regensburg', as_of: '2026-09-29T10:00:00Z', read_at: '2026-09-30T08:00:00Z', context_filter: 'no objective context: every kind of the domain, newest first', context_digest: null, why: 'regensburg matched in title: Regensburg dual sourcing' } };
    expect(hitLine(h)).toBe('package "Regensburg dual sourcing" (proposed · gate REVIEW_REQUESTED) — regensburg matched in title: Regensburg dual sourcing · as of 2026-09-29T10:00:00Z · no objective context: every kind of the domain, newest first');
  });
  it('a metric line names its value, population and basis; an empty population reads "not measured"', () => {
    expect(metricLine({ name: 'time_to_understanding', unit: 'seconds', population: 'items routed', n: 4, n_acted: 3, n_without_act: 1, median: 95, p90: 4000, basis: 'b', as_of: 't' })).toBe('time_to_understanding: median 1.6 min, p90 1.1 h over 4 (3 acted on, 1 without an act) — items routed · as of t');
    expect(metricLine({ name: 'decision_latency', unit: 'seconds', population: 'commitments', n: 0, median: null, p90: null, basis: 'b', as_of: 't' })).toBe('decision_latency: median not measured, p90 not measured over 0 — commitments · as of t');
    expect(metricLine({ name: 'review_completion', unit: 'ratio', population: 'reviews', n: 2, within_deadline: 1, overdue_open: 1, ratio: 0.5, rooms: { with_deadline: 1, reviewed_before_deadline: 0, ratio: 0 }, basis: 'b', as_of: 't' }))
      .toBe('review_completion: 50.0 % of 2 review(s) concluded by their due instant (1 still open past it); rooms: 0.0 % of 1 reviewed before their deadline — reviews · as of t');
  });
  it('the views are grouped by the role the server listed them under; the agenda builder sends only complete rows; the actions are worded', () => {
    const v = (role: string, moment: string) => ({ view_key: `${role}/${moment}`, role_code: role, moment, title: moment, description: 'd', sections: ['priorities'], actions: [] });
    expect(viewsByRole([v('executive', 'morning'), v('executive_operator', 'cadence-prep'), v('executive', 'board-day')]).map((g) => `${g.role}:${g.views.map((x) => x.moment).join(',')}`)).toEqual(['executive:board-day,morning', 'executive_operator:cadence-prep']);
    expect(buildAgenda([{ kind: 'room', id: ID, note: ' first ' }, { kind: 'nonsense', id: ID, note: '' }, { kind: 'package', id: 'not-an-id', note: '' }, { kind: 'warning', id: ID, note: '' }])).toEqual([{ kind: 'room', id: ID, note: 'first' }, { kind: 'warning', id: ID }]);
    expect(actionLabel('reset_cadence')).toBe('Reset the loop');
    expect(actionLabel('unknown_act')).toBe('unknown_act');
  });
});
