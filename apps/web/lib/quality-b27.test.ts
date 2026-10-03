import { describe, expect, it } from 'vitest';
import { bandLine, basisLine, decisionActiveLine, findingMark, freshnessMark, ratioLine, ruleLabel } from './quality-b27';

/** CP-6 B27 §Q (0097): the quality page is worded, never judged on the client (the findings, the freshness and the bands are the server's). */
describe('the scenario quality page is worded, never scored on the client', () => {
  it('a freshness state is a glyph, a token and words — never colour alone; stale and missing are critical', () => {
    expect(freshnessMark('fresh')).toMatchObject({ glyph: '●', token: '--eye-color-success', text: 'FRESH' });
    expect(freshnessMark('stale')).toMatchObject({ glyph: '⚑', token: '--eye-color-critical', text: 'STALE' });
    expect(freshnessMark('missing')).toMatchObject({ glyph: '✕', token: '--eye-color-critical', text: 'MISSING' });
    expect(freshnessMark('awaiting').text).toMatch(/AWAITING its first observation/);
    expect(freshnessMark('not_required').text).toBe('no signpost needed');
    expect(freshnessMark('odd').text).toBe('ODD');
  });
  it('a finding is FAIL or NOTE with a glyph; the rules have words', () => {
    expect(findingMark('fail')).toMatchObject({ glyph: '✕', text: 'FAIL' });
    expect(findingMark('note')).toMatchObject({ glyph: 'ℹ', text: 'NOTE' });
    expect(ruleLabel('indistinct_branches')).toMatch(/differ only in wording/);
    expect(ruleLabel('collapse_to_one_forecast')).toMatch(/one forecast/);
    expect(ruleLabel('something_else')).toBe('something_else');
  });
  it('a band is a percentage range (a point when low = high); a ratio is a percentage or a dash', () => {
    expect(bandLine(0.1, 0.25)).toBe('10%–25%');
    expect(bandLine(0.05, 0.05)).toBe('5%');
    expect(ratioLine(null)).toBe('—');
    expect(ratioLine(0.6667)).toBe('66.7%');
  });
  it('the basis is named per method — the map band and the observed frequency, the elicitation record, the run', () => {
    expect(basisLine('frequency_map', { frequency_per_year: 1.5, observation: 'the corridor incident log 2015–2024 (SYNTHETIC)', map: { name: 'Corridor events', version: 2, horizon: 'the next 12 months' }, band: { frequency_label: 'occasional' } }))
      .toBe('frequency map "Corridor events" v2 (the next 12 months): 1.5 per year observed in the corridor incident log 2015–2024 (SYNTHETIC) → band "occasional"');
    expect(basisLine('expert_elicitation', { elicitation: { experts: ['N. Eriksen', 'J. Weber'], elicited_at: '2026-09-29T10:00:00Z', question: 'will insurers withdraw cover?' } }))
      .toBe('expert elicitation of N. Eriksen, J. Weber at 2026-09-29T10:00:00Z on "will insurers withdraw cover?"');
    expect(basisLine('model', { run_id: 'r-1' })).toBe('model — simulation run r-1');
  });
  it('the decision-activity names its reasons when it is withheld (FEX-12)', () => {
    expect(decisionActiveLine({ value: true, reasons: [] })).toMatch(/^DECISION-ACTIVE/);
    expect(decisionActiveLine({ value: false, reasons: ['the coherence check (v1) failed', 'the quality evaluation failed'] })).toBe('NOT DECISION-ACTIVE — the coherence check (v1) failed; the quality evaluation failed');
  });
});
