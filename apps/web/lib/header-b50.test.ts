/**
 * B50 §HD — the header adapter's contract (pure): a declared absence in words, "recorded before B50 — not populated" for an old version,
 * a time value with its bounds as the days they name in the zone they were stated in. Every value is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { PRE_B50, adaptHeader, asAbsence, dayIn, fieldText, headerField, headerTime, timeValueText, trustText, type QualifierRow } from './header-b50';
import type { TimeValue } from './b50-seams';

const LATE_AUGUST: TimeValue = { kind: 'bounded', earliest: '2026-08-21T00:00:00+02:00', latest: '2026-09-01T00:00:00+02:00', precision: 'part_of_month', zone: 'Europe/Berlin', source: 'publisher text' };

describe('header-b50 · fields', () => {
  it('a declared absence is shown in words, never blank, never "unresolved"', () => {
    const row = { confidence: { state: 'not_applicable', reason: 'a quantile forecast states its uncertainty (q10 / q50 / q90), not a confidence' } };
    const f = headerField(row, 'confidence', true);
    expect(f).toEqual({ kind: 'absent', absence: { state: 'not_applicable', reason: 'a quantile forecast states its uncertainty (q10 / q50 / q90), not a confidence' } });
    expect(fieldText(f)).toBe('Not applicable — a quantile forecast states its uncertainty (q10 / q50 / q90), not a confidence');
    expect(fieldText(headerField({ quality_state: { state: 'not_assessed', reason: 'no quality assessment at write' } }, 'quality_state', true))).toBe('Not assessed — no quality assessment at write');
  });
  it('a version recorded before B50 reads so for the fields B50 states; nothing is back-filled or inferred', () => {
    expect(headerField({ confidence: null }, 'confidence', false)).toEqual({ kind: 'pre_b50' });
    expect(fieldText({ kind: 'pre_b50' })).toBe(PRE_B50);
    expect(headerField({ rights_profile: null }, 'rights_profile', false)).toEqual({ kind: 'value', value: null });
    expect(headerField({ confidence: null }, 'confidence', true)).toEqual({ kind: 'value', value: null });
  });
  it('values in words; none:<reason> and ontology:none are absences', () => {
    expect(fieldText(headerField({ uncertainty: { q10: 1, q50: 2, q90: 3 } }, 'uncertainty', true))).toBe('q10: 1; q50: 2; q90: 3');
    expect(fieldText(headerField({ provenance_ref: 'none:the provenance is its references' }, 'provenance_ref', true))).toBe('Not applicable — the provenance is its references');
    expect(headerField({ ontology_ref: 'ontology:none' }, 'ontology_ref', true)).toMatchObject({ kind: 'absent', absence: { state: 'not_assessed' } });
    expect(asAbsence({ state: 'assessed', method: 'header-age@1' })).toBeNull();
  });
  it('the trust line states all four, in order', () => {
    const t = trustText({ confidence: { value: 0.7 }, uncertainty: null, quality_state: { state: 'not_assessed', reason: 'none at write' }, freshness_state: { state: 'assessed', age_seconds: 60 } }, false);
    expect(t).toBe(`Confidence: value: 0.7 · Uncertainty: ${PRE_B50} · Quality: Not assessed — none at write · Freshness: state: assessed; age seconds: 60`);
  });
});

describe('header-b50 · time values (ES-26-001 / ES-26-004)', () => {
  it('"late August 2026": the bounds as the days they name in Europe/Berlin — the last day the half-open interval covers', () => {
    expect(timeValueText(LATE_AUGUST)).toBe('between 21 Aug 2026 and 31 Aug 2026 (bounded, part of a month; Europe/Berlin; stated by publisher text)');
  });
  it('a DATE renders as the day it names in its zone (a UTC midnight is not the previous day elsewhere when the zone is stated)', () => {
    expect(dayIn('2026-08-20T22:00:00.000Z', 'Europe/Berlin')).toBe('21 Aug 2026');
    expect(dayIn('2026-08-20T22:00:00.000Z', null)).toBe('20 Aug 2026');
  });
  it('exact, approximate, unknown, recurring and conflicting — each said as what it is; none forced to an instant', () => {
    expect(timeValueText({ kind: 'exact', instant: '2024-01-14T09:30:00Z', precision: 'minute', zone: null, source: 'operator' })).toBe('14 Jan 2024, 09:30 UTC (exact; no zone stated; stated by operator)');
    expect(timeValueText({ kind: 'approximate', instant: '2026-08-25T00:00:00Z', precision: 'day', zone: 'UTC', source: 'carrier notice', clockQuality: 'degraded' }))
      .toBe('about 25 Aug 2026 (approximate, to the day; UTC; stated by carrier notice; source clock degraded)');
    expect(timeValueText({ kind: 'unknown', precision: 'unknown', zone: null, source: 'operator' })).toBe('unknown — no time is stated, and none is assumed (stated by operator)');
    expect(timeValueText({ kind: 'recurring', rule: 'RRULE:FREQ=WEEKLY;BYDAY=MO', precision: 'day', zone: 'Europe/Berlin', source: 'publisher text' })).toBe('recurring: FREQ=WEEKLY;BYDAY=MO (Europe/Berlin; stated by publisher text)');
    expect(timeValueText({ kind: 'conflicting', conflicts: [{ ref: 'EVD:a', value: '2026-08-21' }, { ref: 'EVD:b', value: '2026-08-28' }], precision: 'day', zone: null, source: 'two publishers' }))
      .toBe('conflicting — EVD:a states 2026-08-21; EVD:b states 2026-08-28 (no single time is assumed; stated by two publishers)');
  });
  it('the header\'s time rows: from the qualifiers when stated (declared or derived — said which); the header instant and "recorded before B50" otherwise', () => {
    const q: QualifierRow[] = [
      { axis: 'event', kind: 'bounded', instant: null, earliest: '2026-08-20T22:00:00.000Z', latest: '2026-08-31T22:00:00.000Z', precision: 'part_of_month', zone: 'Europe/Berlin', source: 'publisher text', rule: null, conflicts: null, clockQuality: 'trusted', declared: true },
      { axis: 'recorded', kind: 'exact', instant: '2026-10-19T10:00:00.000Z', earliest: null, latest: null, precision: 'exact', zone: null, source: 'header (CP-OBS-01)', rule: null, conflicts: null, clockQuality: 'trusted', declared: false },
    ];
    const stated = adaptHeader({ event_time: '2026-08-20T22:00:00.000Z', recorded_at: '2026-10-19T10:00:00.000Z', confidence: { state: 'not_applicable', reason: 'an observation records what was received' } }, { version: 1, header: 'stated', time: q });
    expect(stated.time).toEqual([
      { label: 'Event time', value: 'between 21 Aug 2026 and 31 Aug 2026 (bounded, part of a month; Europe/Berlin; stated by publisher text)' },
      { label: 'Valid from', value: 'none stated' },
      { label: 'Record time', value: '19 Oct 2026, 10:00 UTC (exact; no zone stated; stated by header (CP-OBS-01)) — derived from the header' },
    ]);
    expect(stated.trust).toMatch(/^Confidence: Not applicable — an observation records what was received · Uncertainty: none recorded/);
    expect(headerTime({ event_time: '2024-01-14T00:00:00.000Z', time_precision: 'day', recorded_at: '2024-01-15T08:00:00.000Z' }, null)).toEqual([
      { label: 'Event time', value: `14 Jan 2024 (to the day; ${PRE_B50})` },
      { label: 'Valid from', value: `none recorded (${PRE_B50})` },
      { label: 'Record time', value: `15 Jan 2024, 08:00 UTC (exact; ${PRE_B50})` },
    ]);
  });
});
