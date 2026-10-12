/**
 * CP-6 B92 §OR (0113_b92_x_or) — the operating review's PURE logic: the named periods a review covers, the series' periods (every period,
 * oldest first — the scene's 2025-Q4 … 2026-Q3), and the shape checks of the follow-through and the pins. The rules that matter are the
 * ports' (the harness phase6-review-b92 proves them); these only refuse a malformed request before a port runs.
 */
import { describe, expect, it } from 'vitest';
import { isReviewPeriod, parseFollowthrough, parsePins, seriesPeriods, shiftPeriod } from '../../src/analytics/review/review-logic.js';
import { previousQuarter } from '../../src/analytics/seams.js';

const ID = '0192f5a0-0000-7000-8000-000000000001';

describe('the operating review — periods and series', () => {
  it('a review covers a named calendar quarter or month — never a rolling window or a malformed period', () => {
    expect(isReviewPeriod('2026-Q3')).toBe(true);
    expect(isReviewPeriod('2026-09')).toBe(true);
    expect(isReviewPeriod('R90@2026-10-12')).toBe(false);
    expect(isReviewPeriod('2026-Q5')).toBe(false);
    expect(isReviewPeriod('2026-13')).toBe(false);
  });
  it('a period shifts within its own kind across year boundaries (mirrors analytics.aor_shift_period)', () => {
    expect(shiftPeriod('2026-Q3', -3)).toBe('2025-Q4');
    expect(shiftPeriod('2026-Q1', -1)).toBe('2025-Q4');
    expect(shiftPeriod('2025-Q4', 1)).toBe('2026-Q1');
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('R90@2026-10-12', 1)).toBeNull();
  });
  it('the scene\'s series: four quarters through the last quarter, oldest first — every period listed', () => {
    expect(seriesPeriods('2026-Q3', 4)).toEqual(['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3']);
    expect(seriesPeriods('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(seriesPeriods(previousQuarter(new Date('2026-10-12T09:00:00Z')), 4)).toEqual(['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3']);
    expect(seriesPeriods('nonsense', 2)).toEqual([]);
  });
});

describe('the operating review — the follow-through and the pins (shape only)', () => {
  it('an action names its text, a principal as owner, a due day and a reason', () => {
    expect(parseFollowthrough({ metricKey: 'MET-024', kind: 'action', action: 'Research request: extend the outcome ledger', owner: ID, dueOn: '2026-12-31', reason: 'calibration is indeterminate' }))
      .toEqual({ ok: true, value: { kind: 'action', metricKey: 'MET-024', action: 'Research request: extend the outcome ledger', owner: ID, dueOn: '2026-12-31', reason: 'calibration is indeterminate' } });
    expect(parseFollowthrough({ kind: 'action', action: 'short', owner: ID, dueOn: '2026-12-31', reason: 'a good reason' })).toMatchObject({ ok: false, cls: 'action' });
    expect(parseFollowthrough({ kind: 'action', action: 'A long enough action', owner: 'alice', dueOn: '2026-12-31', reason: 'a good reason' })).toMatchObject({ ok: false, cls: 'owner' });
    expect(parseFollowthrough({ kind: 'action', action: 'A long enough action', owner: ID, dueOn: '31/12/2026', reason: 'a good reason' })).toMatchObject({ ok: false, cls: 'due' });
  });
  it('"no action" carries its reason and nothing else; every follow-through states a reason; the kind is action or no_action', () => {
    expect(parseFollowthrough({ kind: 'no_action', reason: 'on target this quarter' })).toEqual({ ok: true, value: { kind: 'no_action', metricKey: null, reason: 'on target this quarter' } });
    expect(parseFollowthrough({ kind: 'no_action', reason: 'on target this quarter', owner: ID })).toMatchObject({ ok: false, cls: 'kind' });
    expect(parseFollowthrough({ kind: 'no_action', reason: 'short' })).toMatchObject({ ok: false, cls: 'reason' });
    expect(parseFollowthrough({ kind: 'escalate', reason: 'a good reason here' })).toMatchObject({ ok: false, cls: 'kind' });
    expect(parseFollowthrough({ kind: 'no_action', metricKey: 'met-1', reason: 'a good reason here' })).toMatchObject({ ok: false, cls: 'request' });
  });
  it('pins are {metric key: result id}; anything else is refused before the port (which refuses a preview, a replay, a mismatch)', () => {
    expect(parsePins(undefined)).toEqual({ ok: true, value: {} });
    expect(parsePins({ 'MET-001': ID })).toEqual({ ok: true, value: { 'MET-001': ID } });
    expect(parsePins([ID]).ok).toBe(false);
    expect(parsePins({ 'MET-001': 'latest' }).ok).toBe(false);
    expect(parsePins({ 'met-001': ID }).ok).toBe(false);
  });
});
