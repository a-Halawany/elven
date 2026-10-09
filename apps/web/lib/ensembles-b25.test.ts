import { describe, expect, it } from 'vitest';
import { disagreementMark, exclusionLine, overlayLine, quantileLine, runStateMark, splitLine, weightLine } from './ensembles-b25';

/** CP-6 B25 §EN (0108): the ensembles page is worded, never computed on the client (the combination, the divergence and the exclusions are the server's). */
describe('the ensembles page is worded, never scored on the client', () => {
  it('a run state and a disagreement level are a glyph, a token and words — never colour alone; material is critical', () => {
    expect(runStateMark('completed')).toMatchObject({ glyph: '●', text: 'COMPLETED' });
    expect(runStateMark('failed')).toMatchObject({ glyph: '✕', token: '--eye-color-critical', text: 'FAILED' });
    expect(runStateMark('odd').text).toBe('ODD');
    expect(disagreementMark('material')).toMatchObject({ glyph: '⚑', token: '--eye-color-critical', text: 'MATERIAL DISAGREEMENT' });
    expect(disagreementMark('agree').text).toBe('THE MEMBERS AGREE');
    expect(disagreementMark(null).text).toBe('NOT MEASURED');
  });
  it('an excluded path names its method, its class in words and the server\'s reason', () => {
    expect(exclusionLine({ method_ref: 'bayes_normal@1', class: 'unavailable', reason: 'bayes_normal@1 is unavailable: quarantined (SYNTHETIC)', attempts: 0 }))
      .toBe('bayes_normal@1 — unavailable in the registry: bayes_normal@1 is unavailable: quarantined (SYNTHETIC)');
    expect(exclusionLine({ method_ref: 'holt_winters@1', class: 'failed', reason: 'x', attempts: 2 })).toBe('holt_winters@1 — failed after its retries (2 attempts): x');
  });
  it('a distribution is its median and band; a weight a percentage; an overlay is always JUDGEMENT', () => {
    expect(quantileLine({ q10: 15.9394, q50: 27.15, q90: 28.785 }, 'transits/day')).toBe('median 27.15 transits/day (10–90: 15.94–28.79)');
    expect(quantileLine(null)).toBe('—');
    expect(weightLine(0.5)).toBe('50%'); expect(weightLine(null)).toBe('—');
    expect(overlayLine({ label: 'JUDGEMENT', version: 2, state: 'active', adjustment: { kind: 'quantiles', q10: 12, q50: 14, q90: 20 } })).toBe('JUDGEMENT v2 (active): median 14 (10–90: 12–20)');
    expect(overlayLine({ label: 'JUDGEMENT', version: 1, state: 'withdrawn', adjustment: { kind: 'probability', p: 0.35, low: 0.25, high: 0.45 } })).toBe('JUDGEMENT v1 (withdrawn): probability 35% (25%–45%)');
  });
  it('the split names the assumptions and who holds them — or says the members share them', () => {
    expect(splitLine([{ assumption_id: 'a', title: 'The diversion wave has run its course', held_by: ['seasonal_naive@1'], not_held_by: ['holt_winters@1'] },
                      { assumption_id: 'b', title: 'Carriers keep diverting', held_by: ['holt_winters@1'], not_held_by: ['seasonal_naive@1'] }]))
      .toBe('"The diversion wave has run its course" (held by seasonal_naive@1) vs "Carriers keep diverting" (held by holt_winters@1)');
    expect(splitLine([])).toMatch(/same declared assumptions/);
  });
});
