import { describe, expect, it } from 'vitest';
import { allowsText, stateLabel, transitionLine, usageText, type Transition, type UsageLine } from './grace-b91';

/** CP-6 B91 part grace (0105 §GR): the states, the grace, the transitions and the usage are WORDED from the record, never judged on the client. */
describe('B91 grace · the words', () => {
  it('every state has a label carried in words (never colour alone); uncontracted says the gate does not apply', () => {
    expect(stateLabel('active')).toEqual({ text: 'ACTIVE', token: '--eye-color-success' });
    expect(stateLabel('grace').text).toBe('GRACE');
    expect(stateLabel('suspended').token).toBe('--eye-color-critical');
    expect(stateLabel('lapsed').text).toBe('LAPSED');
    expect(stateLabel('uncontracted').text).toMatch(/the availability gate does not apply/);
    expect(stateLabel('superseded').text).toBe('SUPERSEDED');
  });
  it('what grace allows, in words', () => {
    expect(allowsText(['read_and_preserve', 'finish_running_work'])).toBe('read and preserve every record; finish running work');
    expect(allowsText(['read_and_preserve', 'new_work'])).toBe('read and preserve every record; start new work');
  });
  it('a transition says what moved, why and by whom; a notice moves nothing', () => {
    const base: Transition = { transition_id: 't', licence_id: 'l', version: 2, kind: 'grace_entered', cause: 'term_ended', from_state: 'active', to_state: 'grace', reason: 'the term ended; the declared grace runs 10 days',
      actor_kind: 'tick', actor_principal_id: 'a', term_end_before: null, term_end_after: null, renewed_until: null, grace_until: null, occurred_at: '2026-10-04T00:00:00Z', attention_items: [] };
    expect(transitionLine(base)).toBe('v2 grace entered (active → grace; term ended) by the attention tick — the term ended; the declared grace runs 10 days');
    expect(transitionLine({ ...base, kind: 'renewal_notice', cause: 'renewal_due', to_state: 'active', reason: 'the term ends soon' })).toBe('v2 renewal notice (renewal notice; renewal due) by the attention tick — the term ends soon');
    expect(transitionLine({ ...base, kind: 'suspended', cause: 'commanded', to_state: 'suspended', actor_kind: 'human', reason: 'payment overdue' })).toMatch(/by the commercial authority — payment overdue$/);
  });
  it('usage against a named limit, or the plain count when the licence names none', () => {
    const u: UsageLine = { dimension: 'model_inference', unit: 'calls', quantity: '1500', records: 2, first_at: null, last_at: null, limit: 5000, share: 0.3 };
    expect(usageText(u)).toBe('1,500 of 5,000 calls (30.0%)');
    expect(usageText({ ...u, limit: null, share: null, records: 1 })).toBe('1,500 calls (1 record; no limit named for model_inference)');
  });
});
