import { describe, expect, it } from 'vitest';
import { DISPOSITION_LABEL, INDEPENDENCE_LABEL, MATURITY_LABEL, corroborationLine, nominatorLabel } from './signals';
import { furtherLine } from './attention';

/** CP-6 B28 (0088 §S): the workbench words what the record says; it judges nothing (the maturity and the verdicts are the server's). */
describe('the weak-signal workbench is worded, never judged on the client', () => {
  it('the vocabularies are the migration\'s (prediction.signals_current / signal_evidence CHECKs), each with a glyph and words', () => {
    expect(Object.keys(MATURITY_LABEL)).toEqual(['tentative', 'corroborated', 'invalid']);
    expect(Object.keys(INDEPENDENCE_LABEL)).toEqual(['independent', 'dependent', 'unknown']);
    expect(Object.keys(DISPOSITION_LABEL)).toEqual(['confirm', 'monitor', 'dismiss', 'escalate']);
    expect(INDEPENDENCE_LABEL.unknown).toMatch(/never counted/);
  });
  it('the corroboration line and the nominator in words', () => {
    expect(corroborationLine({ independent_sources: 1, contradicting_sources: 0, corroboration_threshold: 2 }, 3)).toBe('1 of 2 independent supporting source(s) · 0 independent contradicting · 3 not counted');
    expect(corroborationLine({})).toBe('0 of 2 independent supporting source(s) · 0 independent contradicting');
    expect(nominatorLabel('agent')).toMatch(/nominates and ranks only/);
    expect(nominatorLabel('detector')).toBe('a detector run by a person');
  });
  it('the attention queue shows the novelty input beside the B24 dimensions, and nothing new where an item carries none', () => {
    expect(furtherLine({ probability: null, exposure: 2, strategic_relevance: null, information_value: null, irreversibility: null, novelty: 1 }))
      .toBe('probability — no input · exposure 2 · strategic relevance — no input · information value — no input · irreversibility — no input · novelty 1');
    expect(furtherLine({ probability: 0.5, exposure: null, strategic_relevance: 1, information_value: null, irreversibility: 'costly' })).not.toMatch(/novelty/);
  });
});
