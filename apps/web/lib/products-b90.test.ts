import { describe, expect, it } from 'vitest';
import { CONSUMER_STATE_LABEL, OVERALL_LABEL, PRODUCT_KINDS, STATE_LABEL, actsOf, attainmentLine, costLine, short } from './products-b90';

/** CP-6 B90 §R (0095): the products pages are worded, never judged on the client (the states, the verdicts and the attainment are the server's). */
describe('the data products pages are worded, never scored on the client', () => {
  it('the vocabularies are the migration\'s (the five product states, the three verdicts, the four consumer states, the twenty kinds), each with a glyph and words', () => {
    expect(Object.keys(STATE_LABEL)).toEqual(['registered', 'released', 'degraded', 'withdrawn', 'retired']);
    expect(Object.keys(OVERALL_LABEL)).toEqual(['ok', 'degraded', 'failing']);
    expect(Object.keys(CONSUMER_STATE_LABEL)).toEqual(['registered', 'accepted', 'revoked', 'migrated']);
    expect(PRODUCT_KINDS.length).toBe(20);
    expect(STATE_LABEL.withdrawn).toMatch(/last valid/);
    expect(CONSUMER_STATE_LABEL.accepted).toMatch(/itself/);
  });
  it('the attainment line keeps the server\'s percentage against the declared floor and names UNDER THE FLOOR only when the server said so; no observation is said, not scored', () => {
    expect(attainmentLine({ attainment_pct: '75.00', floor_pct: 95, below_floor: true, window_days: 30 })).toBe('attainment 75.00% vs floor 95% over 30 day(s) — UNDER THE FLOOR');
    expect(attainmentLine({ attainment_pct: 100, floor_pct: 95, below_floor: false, window_days: 7 })).toBe('attainment 100% vs floor 95% over 7 day(s)');
    expect(attainmentLine({ attainment_pct: null, floor_pct: 90, below_floor: false, window_days: 30 })).toMatch(/^no SLO observation in the last 30 day\(s\) — attainment unknown \(floor 90%\)$/);
  });
  it('a cost line keeps the decimal string, the currency and the period\'s days as the days they name', () => {
    expect(costLine({ period_start: '2026-01-01', period_end: '2026-02-01', amount: '1250.00', currency: 'EUR', basis: 'compute-minutes' })).toBe('2026-01-01 → 2026-02-01: 1250.00 EUR (compute-minutes)');
  });
  it('the acts follow the state and name who holds each: a retired product admits nothing; a degraded one is restored by the owner through evidence; a withdrawn one only retires', () => {
    expect(actsOf('retired')).toEqual([]);
    expect(actsOf('degraded').map((a) => a.act)).toEqual(['restore', 'release', 'withdraw', 'retire']);
    expect(actsOf('degraded')[0]!.by).toMatch(/scorecard that reads ok or a domain review/);
    expect(actsOf('withdrawn').map((a) => a.act)).toEqual(['retire']);
    expect(actsOf('released').find((a) => a.act === 'degrade')?.by).toMatch(/every accepted consumer is notified/);
    expect(short(null)).toBe('—');
    expect(short('0190b1c2-d3e4-7000-8000-0000000000aa')).toBe('0190b1c2…');
  });
});
