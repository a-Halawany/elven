import { describe, expect, it } from 'vitest';
import { DISPOSITIONS, REQUEST_STATES, delegatePayload, evaluatePayload, measuresOf, ratioWords, requestMark, verdictMark, type QueueEvaluation } from './attention-governance';

const K = ['k', 'x'].join('-');
/** CP-6 B24 (0086 §G): the governance words are the server's; the helpers only word what the record says. */
describe('the queue\'s governance is worded, never judged on the client', () => {
  it('the vocabularies are the migration\'s (the CHECKs of 0086 §G)', () => {
    expect([...DISPOSITIONS]).toEqual(['actioned', 'not_material', 'duplicate', 'late', 'missed']);
    expect([...REQUEST_STATES]).toEqual(['pending', 'approved', 'refused', 'expired']);
  });
  it('a pending request past its instant is said LAPSED; the other states in three channels', () => {
    expect(requestMark('pending', true).text).toMatch(/^PENDING — LAPSED/);
    expect(requestMark('pending').text).toBe('PENDING');
    expect(requestMark('approved')).toEqual({ glyph: '✓', token: '--eye-color-success', text: 'APPROVED' });
    expect(requestMark('expired', true).text, 'lapsed only qualifies a pending request').toBe('EXPIRED');
  });
  it('a ratio is its value with the sample, or the server\'s reason for abstaining', () => {
    expect(ratioWords({ abstained: false, sample: 6, value: 0.5 })).toBe('0.5000 (n = 6)');
    expect(ratioWords({ abstained: true, sample: 1, reason: 'precision: 1 judged item(s), below min_sample 3' })).toBe('abstained — precision: 1 judged item(s), below min_sample 3');
    expect(ratioWords(undefined)).toBe('not reported');
  });
  it('the verdict in words', () => {
    expect(verdictMark('partial').text).toMatch(/^PARTIAL/);
    expect(verdictMark('abstained').text).toMatch(/^ABSTAINED/);
    expect(verdictMark('measured').glyph).toBe('●');
  });
  it('the payloads send only what is set, trimmed', () => {
    expect(delegatePayload({ to: ' p ', reason: ' covering the queue ', until: '2026-09-25T16:00:00.000Z', key: ` ${K} ` })).toEqual({ to: 'p', reason: 'covering the queue', until: '2026-09-25T16:00:00.000Z', request_key: K });
    expect(evaluatePayload({ from: null, to: '', minSample: '' })).toEqual({});
    expect(evaluatePayload({ from: '2026-09-01T00:00:00.000Z', to: null, minSample: ' 3 ' })).toEqual({ window_from: '2026-09-01T00:00:00.000Z', min_sample: 3 });
  });
  it('the measures are read from the run\'s answer or from a listed record alike', () => {
    const listed = { evaluation_id: 'e', verdict: 'partial', reason: 'r', evaluated_by: 'p', evaluated_at: null, min_sample: 3, measures: { items: 11 } } as unknown as QueueEvaluation;
    expect(measuresOf(listed).items).toBe(11);
    const run = { evaluation_id: 'e', verdict: 'partial', reason: 'r', evaluated_by: 'p', evaluated_at: null, min_sample: 3, items: 4 } as unknown as QueueEvaluation;
    expect(measuresOf(run).items).toBe(4);
  });
});
