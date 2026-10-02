import { describe, expect, it } from 'vitest';
import { CLOSURE_CRITERIA, FEEDBACK_KINDS, ORIGIN_KINDS, closePayload, evaluatePayload, memberMark, originWords, ratioWords, verdictMark } from './warning-lifecycle';

/** CP-6 B28 (0088 §W): the lifecycle's words are the server's; the helpers only word what the record says. */
describe('the early-warning lifecycle is worded, never judged on the client', () => {
  it('the vocabularies are the migration\'s (the CHECKs of 0088 §0 and §W)', () => {
    expect([...ORIGIN_KINDS]).toEqual(['indicator_breach', 'stream_rule', 'weak_signal', 'graph_impact', 'forecast_revision', 'twin_degradation']);
    expect([...FEEDBACK_KINDS]).toEqual(['false', 'late', 'missed', 'duplicated', 'useful']);
    expect([...CLOSURE_CRITERIA]).toEqual(['resolved', 'falsified', 'duplicate', 'no_longer_relevant']);
  });
  it('an origin in words; a warning from before B28 is an indicator breach', () => {
    expect(originWords('weak_signal')).toBe('escalated weak signal');
    expect(originWords(undefined)).toBe('indicator breach');
  });
  it('a contradicting member is marked in three channels, never colour alone', () => {
    expect(memberMark('duplicate', 'contradicting')).toEqual({ glyph: '⊘', token: '--eye-color-critical', text: 'DUPLICATE · CONTRADICTING' });
    expect(memberMark('storm', 'supporting').text).toBe('STORM MEMBER · supporting');
    expect(memberMark('lead', 'supporting').text).toBe('LEAD · supporting');
  });
  it('a ratio is its value with the sample, or the server\'s reason for abstaining; the verdict in words', () => {
    expect(ratioWords({ abstained: false, sample: 2, value: 0.5 })).toBe('0.5000 (n = 2)');
    expect(ratioWords({ abstained: true, sample: 0, reason: 'T3: 0 warning(s), below min_sample 5' })).toBe('abstained — T3: 0 warning(s), below min_sample 5');
    expect(ratioWords(undefined)).toBe('not reported');
    expect(verdictMark('partial').glyph).toBe('◐');
  });
  it('the payloads send only what is set, trimmed', () => {
    expect(closePayload({ criterion: 'falsified', reason: ' the transits recovered ', condition: '0', duplicateOf: 'x' })).toEqual({ criterion: 'falsified', reason: 'the transits recovered', condition: 0 });
    expect(closePayload({ criterion: 'duplicate', reason: 'the same attack', duplicateOf: ' w ' })).toEqual({ criterion: 'duplicate', reason: 'the same attack', duplicate_of: 'w' });
    expect(evaluatePayload({ from: null, to: '', minSample: '' })).toEqual({});
    expect(evaluatePayload({ from: '2026-09-01T00:00:00.000Z', to: null, minSample: ' 3 ' })).toEqual({ window_from: '2026-09-01T00:00:00.000Z', min_sample: 3 });
  });
});
