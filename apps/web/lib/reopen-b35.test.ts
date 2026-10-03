import { describe, expect, it } from 'vitest';
import { causeWords, changedOf, completenessLine, evidenceOf, hoursWords, reversionMark, separationProblem, shareWords, type Metrics } from './reopen-b35';

describe('reopen-b35 words (B35 §P)', () => {
  it('the six reopen causes read in words', () => {
    expect(causeWords('challenge_upheld')).toBe('a challenge was upheld after the commitment');
    expect(causeWords('conditions_changed')).toBe('the conditions changed');
    expect(causeWords('appeal_upheld')).toMatch(/appeal of the decided package/);
    expect(causeWords('something_else')).toBe('something else');
  });
  it('a reversion request is a glyph, a token and words — never colour alone', () => {
    expect(reversionMark('open')).toEqual({ glyph: '⚑', token: '--eye-color-uncertain', text: 'RE-VERSION REQUESTED' });
    expect(reversionMark('reversioned').text).toBe('RE-VERSIONED');
    expect(reversionMark('declined').glyph).toBe('○');
  });
  it('shares, hours and the completeness line', () => {
    expect(shareWords(0.6667)).toBe('66.7%');
    expect(shareWords(null)).toBe('—');
    expect(hoursWords(12.5)).toBe('12.5 h');
    expect(hoursWords(72)).toBe('72 h (3 d)');
    const c = { score: 0.7, met: 7, of: 10, criteria: [{ key: 'a', met: false, detail: '' }, { key: 'b', met: true, detail: '' }], missing: [{ what: 'x' }, { what: 'a' }], disputed: [{ option_key: 'k', kind: 'run', id: 'r', standing: 'disputed' }], post_commitment_notes: [], challenges: [], appeals_open: 0 } as Metrics['completeness'];
    expect(completenessLine(c)).toBe('7 of 10 criteria met; 2 missing (1 criteria, 1 named items); 1 disputed or withdrawn citation');
  });
  it('the four fields stay separate (the server\'s rule, said early)', () => {
    expect(separationProblem({ observed: 'Savings of 1.2 M', inferred: 'savings of 1.2 m ', counterfactual: 'x', changed: [] })).toBe('the inferred contribution repeats the observed result');
    expect(separationProblem({ observed: 'a', inferred: 'b', counterfactual: 'A', changed: [] })).toBe('the counterfactual claim repeats the observed result');
    expect(separationProblem({ observed: 'a', inferred: 'b', counterfactual: 'c', changed: ['B'] })).toBe('the changed condition "B" repeats another field');
    expect(separationProblem({ observed: 'a', inferred: 'b', counterfactual: 'c', changed: ['d'] })).toBeNull();
  });
  it('evidence and changed conditions parse from lines', () => {
    expect(evidenceOf('warning:0190-a the corridor\nnocolon\n signal:0190-b ')).toEqual([{ kind: 'warning', id: '0190-a', note: 'the corridor' }, { kind: 'signal', id: '0190-b' }]);
    expect(changedOf('the corridor reopened — freight rates fell\n\nfuel prices rose')).toEqual([{ condition: 'the corridor reopened', effect: 'freight rates fell' }, { condition: 'fuel prices rose' }]);
  });
});
