import { describe, expect, it } from 'vitest';
import { calibrationLine, driftMark, exploratoryLine, lifecycleMark, nextStates, outsideKeys, toleranceOf } from './envelope-b30';

describe('envelope-b30 words (B30 §EN)', () => {
  it('a drift state and a lifecycle state are a glyph, a token and words — never colour alone', () => {
    expect(driftMark('drifting')).toEqual({ glyph: '⚑', token: '--eye-color-critical', text: 'DRIFTING' });
    expect(driftMark('stable').text).toBe('STABLE');
    expect(driftMark('insufficient').text).toBe('INSUFFICIENT EVIDENCE');
    expect(driftMark('other').text).toBe('OTHER');
    expect(lifecycleMark('retired')).toMatchObject({ glyph: '⚑', text: 'RETIRED — runs are refused' });
    expect(lifecycleMark('approved', true).text).toMatch(/^APPROVED \(in use before its stewardship was recorded\)$/);
    expect(lifecycleMark('deprecated').text).toBe('DEPRECATED — runs are marked');
  });
  it('the lifecycle steps restate the port\'s rule (a retired model is re-proposed, never revived)', () => {
    expect(nextStates('approved')).toEqual(['deprecated']);
    expect(nextStates('deprecated')).toEqual(['approved', 'retired']);
    expect(nextStates('retired')).toEqual(['proposed']);
    expect(nextStates('proposed')).toEqual(['approved', 'retired']);
  });
  it('a calibration reads in one line: n, MAE, MAPE as a percentage, bias, the tolerance, the state', () => {
    expect(calibrationLine({ n: 3, mae: 11, mape: 0.44, bias: -5.666667, tolerance: { mape: 0.2, min_n: 3 }, drift_state: 'drifting' }))
      .toBe('3 pair(s): MAE 11, MAPE 44 %, bias -5.667 — DRIFTING (tolerance MAPE ≤ 20 %, at least 3 pairs)');
    expect(calibrationLine({ n: 0, mae: null, mape: null, bias: null, tolerance: { mae: 100, min_n: 2 }, drift_state: 'insufficient' }))
      .toBe('no pair yet — INSUFFICIENT EVIDENCE (tolerance MAE ≤ 100, at least 2 pairs)');
  });
  it('an outside run reads disabled, then exploratory awaiting the concurrence, then concurred', () => {
    expect(exploratoryLine({ envelope_state: 'inside', admission: null })).toBe('the run reads INSIDE against its envelope');
    expect(exploratoryLine({ envelope_state: 'outside', admission: null })).toMatch(/^OUTSIDE THE ENVELOPE — the behaviour is DISABLED for decision use; only a twin owner/);
    const a = { admission_id: 'a', run_id: 'r', twin_id: 't', twin_version: 2, model_ref: 'supply-flow@1', keys: [], reason: 'x', admitted_by: 'o', admitted_at: 'z', concurred_by: null, concurred_at: null, concurrence_note: null };
    expect(exploratoryLine({ envelope_state: 'outside', admission: a })).toMatch(/^EXPLORATORY — admitted by a twin owner; awaiting a method steward’s concurrence/);
    expect(exploratoryLine({ envelope_state: 'outside', admission: { ...a, concurred_by: 's', concurred_at: 'z', concurrence_note: 'n' } })).toMatch(/concurred by a method steward; promotable for an exploratory use; never decision-grade$/);
  });
  it('the outside keys of a recorded check; a tolerance from the form', () => {
    expect(outsideKeys({ keys: { corridor_delay_days: { range: [0, 60], value: 75, verdict: 'outside' }, horizon_days: { range: [1, 365], value: 90, verdict: 'inside' } } })).toEqual(['corridor_delay_days = 75 outside [0, 60]']);
    expect(outsideKeys(null)).toEqual([]);
    expect(toleranceOf('mape', '20', '')).toEqual({ mape: 0.2 });
    expect(toleranceOf('mae', '5', '4')).toEqual({ mae: 5, minN: 4 });
    expect(toleranceOf('mape', '0', '')).toEqual({ problem: 'the tolerance is a positive number' });
    expect(toleranceOf('mae', '5', '1')).toEqual({ problem: 'the minimum number of pairs is an integer from 2 to 1000' });
  });
});
