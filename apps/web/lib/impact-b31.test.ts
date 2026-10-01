import { describe, expect, it } from 'vitest';
import { effectTiming, effectValues, probabilityLine, robustnessMark, tornadoRows, voiVerdict, type Effect } from './impact-b31';

/** CP-6 B31 §I (0099): the impact page LAYS OUT and WORDS the server's record — it never ranks a factor, derives an effect, weighs a future or maps a frequency. */
describe('the impact page is laid out and worded, never judged on the client', () => {
  it('the tornado scales the recorded deltas to the widest swing, in rank order, each side its sign', () => {
    const rows = tornadoRows([
      { key: 'b', rank: 2, kind: 'parameter', delta_low: -50, delta_high: 25, low: { value: 1, metric: 0 }, high: { value: 2, metric: 0 } },
      { key: 'a', rank: 1, kind: 'timing', delta_low: 100, delta_high: -80, low: { value: '2024-01-10', metric: 0 }, high: { value: '2024-01-24', metric: 0 } },
    ]);
    expect(rows.map((r) => [r.key, r.lowPct, r.highPct])).toEqual([['a', 100, -80], ['b', -50, 25]]);
    expect(rows[0]).toMatchObject({ kind: 'timing', lowValue: '2024-01-10', highValue: '2024-01-24' });
    expect(tornadoRows([{ key: 'z', rank: 1, kind: 'parameter', delta_low: 0, delta_high: 0, low: { value: 1, metric: 0 }, high: { value: 1, metric: 0 } }])[0]).toMatchObject({ lowPct: 0, highPct: 0 });
  });
  it('the robustness verdict is a glyph, a token and words, naming the factors whose rank moved', () => {
    expect(robustnessMark({ verdict: 'stable' })).toMatchObject({ glyph: '●', token: '--eye-color-success' });
    expect(robustnessMark({ verdict: 'unstable', unstable: [{ key: 'terms.line_stop_cost_per_day', ranks: { 1: 2, 2: 3 } }] }).text).toMatch(/terms\.line_stop_cost_per_day moves between seeds/);
    expect(robustnessMark(null).text).toMatch(/not assessed/);
  });
  it('an effect\'s values and timing are the record\'s, a DATE shown as the day it names', () => {
    const e: Effect = { depth: 2, entity_twin_id: 'E', entity_label: 'Enterprise', via_link_id: 'l', metric: 'delivery_date_shift_days', unit: 'days',
      values: { p10: 12, p50: 14, p90: 16, deterministic: false }, timing: { first_affected: '2024-01-28', back_to_plan: '2024-04-07', recovery_days: 56, headroom: 0.25, reason: null }, basis: {} };
    expect(effectValues(e)).toBe('p10 12 · p50 14 · p90 16 days');
    expect(effectValues({ ...e, values: { p10: 14, p50: 14, p90: 14, deterministic: true } })).toBe('14 days (deterministic run: one value)');
    expect(effectTiming(e)).toBe('first affected 2024-01-28 · recovers in 56 day(s) at headroom 25% · back on plan 2024-04-07');
    expect(effectTiming({ depth: 1, timing: { first_affected: null, back_to_plan: null, recovery_days: null, headroom: null, reason: 'no delivery date moves at the median' } })).toBe('no delivery date moves at the median');
  });
  it('the value of information says WAIT or ACT with the numbers the port computed', () => {
    const base = { evsi: '169.684248', evpi: '303.15792', delay_cost: '40', net_value: '129.684248', payoff_unit: 'k€', prior_best: ['reroute'],
      information: { label: 'one more week of transit data', delay_days: 7, delay_cost: 40, signals: [], likelihood_basis: 'x' } };
    expect(voiVerdict({ ...base, recommendation: 'wait' }).text).toBe('WAIT for "one more week of transit data" (7 day(s)): it is worth 169.684248 k€ (EVSI) against a delay cost of 40 k€ — net 129.684248 k€; perfect information would be worth 303.15792 k€ (EVPI)');
    expect(voiVerdict({ ...base, recommendation: 'act', net_value: '-230' }).text).toMatch(/^ACT now \(reroute\)/);
  });
  it('a probability statement says it is a SIMULATED frequency mapped through the named map', () => {
    expect(probabilityLine({ event: { metric: 'line_stop_days', op: '>', threshold: 0, label: 'the line stops' }, occurrences: 200, samples: 200, per_year: '4.055556', map_name: 'Corridor', map_version: 1,
      map_horizon: 'the next 12 months', probability_low: '0.25', probability_high: '0.6' })).toBe('the line stops: 200 of 200 simulated samples → 4.055556 per year → 0.25–0.6 over the next 12 months through map "Corridor" v1 (a SIMULATED frequency, mapped — not a calibrated observation)');
  });
});
