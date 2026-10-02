import { describe, expect, it } from 'vitest';
import { AGGREGATION_METHODS, EXPOSURE_STATES, POLARITY_LABEL, RESPONSE_KINDS, STATE_LABEL, VERSION_STATES, assessorLine, gapLine, likelihoodLine, methodLine, rangeLine, residualLine } from './exposures';

/** CP-6 B32 (0089 §R): the risk and opportunity workspace words what the record says; it judges nothing (the server's residual, appetite and aggregation). */
describe('the risk and opportunity workspace is worded, never judged on the client', () => {
  it('the vocabularies are the migration\'s (the CHECKs of 0089 §R4), each with a glyph and words', () => {
    expect([...EXPOSURE_STATES]).toEqual(['identified', 'assessed', 'accepted', 'contested', 'sponsored', 'closed']);
    expect([...VERSION_STATES]).toEqual(['proposed', 'accepted', 'superseded', 'contested']);
    expect([...RESPONSE_KINDS]).toEqual(['mitigate', 'exploit', 'accept', 'transfer', 'avoid']);
    expect([...AGGREGATION_METHODS]).toEqual(['max', 'sum', 'bounded']);
    expect(Object.keys(STATE_LABEL)).toEqual([...EXPOSURE_STATES]);
    expect(POLARITY_LABEL.risk).toMatch(/^▼/);
    expect(POLARITY_LABEL.opportunity).toMatch(/^▲/);
  });
  it('a range stays a range; a plausibility is never turned into a probability', () => {
    expect(rangeLine('120000', '540000.000000', 'EUR')).toBe('120,000 – 540,000 EUR');
    expect(rangeLine(null, 1, 'EUR')).toBe('no input');
    expect(likelihoodLine({ probability_low: '0.3', probability_high: '0.6', plausibility: null })).toBe('probability 0.3 – 0.6');
    expect(likelihoodLine({ probability_low: null, probability_high: null, plausibility: 'medium' })).toBe('plausibility medium (no probability stated)');
    expect(likelihoodLine({ probability_low: null, probability_high: null, plausibility: null })).toBe('likelihood: no input');
  });
  it('the residual with its appetite; the gaps; an agent\'s version is an estimate', () => {
    const r = { residual_id: 'r', version: 1, inherent_low: 1, inherent_high: 2, residual_low: '120000', residual_high: '540000', unit: 'EUR', computation: 'c', breach: true, threshold: '250000', appetite_version: 1, computed_at: 'x', cause: 'acceptance' as const };
    expect(residualLine(r)).toBe('120,000 – 540,000 EUR · OUTSIDE appetite (threshold 250,000 EUR)');
    expect(residualLine({ ...r, breach: null, threshold: null })).toBe('120,000 – 540,000 EUR · appetite not judged');
    expect(residualLine(null)).toBe('no residual — no accepted assessment');
    expect(gapLine([])).toBe('● complete — admissible to a roll-up');
    expect(gapLine(['unassessed', 'stale (review due 2026-09-26)'])).toBe('⚠ INCOMPLETE — unassessed · stale (review due 2026-09-26)');
    expect(assessorLine({ assessed_kind: 'agent', estimate_rule: 'exposure-estimate@1', state: 'proposed' })).toMatch(/an agent's ESTIMATE \(exposure-estimate@1\) — a recommendation, never an input/);
    expect(assessorLine({ assessed_kind: 'human', estimate_rule: null, state: 'accepted' })).toBe('a person\'s assessment — accepted');
  });
  it('an aggregation says how it counted — once over a shared driver, bounded without a declaration', () => {
    expect(methodLine({ method: 'max', unit: 'EUR', total: { low: 25200, high: 288000 }, naive_sum_high: 438000 })).toBe('one shared driver: counted ONCE — 288,000 EUR (the naive sum would say 438,000 EUR)');
    expect(methodLine({ method: 'bounded', unit: 'EUR', total: { low: 25200, high: 388000 }, naive_sum_high: 388000 })).toMatch(/^dependence not declared: BOUNDED 25,200 – 388,000 EUR — not a single number/);
    expect(methodLine({ method: 'sum', unit: 'EUR', total_low: 45200, total_high: 388000, naive_sum_high: 388000 })).toBe('independence declared by a person: 45,200 – 388,000 EUR');
  });
});
