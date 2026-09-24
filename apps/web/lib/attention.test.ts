import { describe, expect, it } from 'vitest';
import {
  FIRST_POLICY_TEMPLATE, ITEM_STATES, SIGNAL_CLASSES, canAcknowledge, canClose, canSuppress, listPayload, parseRules, ruleLines, stateMark, whyLine,
} from './attention';

/** CP-6 B22 (0083): the queue's words are the server's; the helpers only word what the record says. */
describe('attention is worded, never judged on the client', () => {
  it('the vocabularies are the migration\'s (executive.attention_items CHECKs)', () => {
    expect([...SIGNAL_CLASSES]).toEqual(['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review']);
    expect([...ITEM_STATES]).toEqual(['open', 'escalated', 'unrouted', 'acknowledged', 'suppressed', 'deprioritized', 'closed']);
  });
  it('the list payload sends only what is set, with the limit', () => {
    expect(listPayload()).toEqual({ limit: 200 });
    expect(listPayload({ state: '', signalClass: null })).toEqual({ limit: 200 });
    expect(listPayload({ state: 'deprioritized', signalClass: 'warning.raised', limit: 50 })).toEqual({ limit: 50, state: 'deprioritized', signalClass: 'warning.raised' });
  });
  it('the acts offered follow the states the server grants them from', () => {
    expect(ITEM_STATES.filter(canAcknowledge)).toEqual(['open', 'escalated', 'unrouted']);
    expect(ITEM_STATES.filter(canSuppress)).toEqual(['open', 'escalated', 'unrouted', 'acknowledged']);
    expect(ITEM_STATES.filter(canClose)).toEqual(['open', 'escalated', 'unrouted', 'acknowledged', 'suppressed', 'deprioritized']);
  });
  it('an overdue live item is flagged; every state has glyph + word + token', () => {
    expect(stateMark('open', true)).toEqual({ glyph: '⚑', token: '--eye-color-critical', text: 'OPEN — OVERDUE' });
    expect(stateMark('acknowledged', true).text).toBe('ACKNOWLEDGED');
    for (const s of ITEM_STATES) expect(stateMark(s).token).toMatch(/^--eye-color-/);
  });
  it('the why line is the engine\'s reasons under the version it judged', () => {
    expect(whyLine({ outcome: 'below_threshold', state: 'deprioritized', policy_version: 2, evaluation: { outcome: 'below_threshold', reasons: ['consequence C1 below the threshold C2', 'confidence 0.9 at or above 0.5'], dimensions: {}, thresholds: null } }))
      .toBe('below the thresholds of policy v2: consequence C1 below the threshold C2; confidence 0.9 at or above 0.5');
    expect(whyLine({ outcome: 'abstained', state: 'deprioritized', policy_version: null, evaluation: { outcome: 'abstained', reasons: ['no attention policy is published for this domain'], dimensions: {}, thresholds: null } }))
      .toBe('the engine abstained (no policy version): no attention policy is published for this domain');
    expect(whyLine({ outcome: 'material', state: 'open', policy_version: 1, evaluation: { outcome: 'material', reasons: [], dimensions: {}, thresholds: null } }))
      .toBe('material under policy v1: no reason recorded');
  });
  it('a class rule reads in words; a missing rule says the engine abstains', () => {
    const w = ruleLines(FIRST_POLICY_TEMPLATE.classes['warning.raised']);
    expect(w.thresholds).toBe('consequence ≥ C2 · confidence ≥ 0.5 · within 168 h of the response window');
    expect(w.escalation).toBe('to domain_admin, at most 2 time(s)');
    expect(w.suppression).toBe('allowed, at most 24 h');
    expect(ruleLines(FIRST_POLICY_TEMPLATE.classes['proposal.review']).suppression).toBe('not allowed');
    expect(ruleLines(undefined).thresholds).toBe('no rule — the engine abstains for this class');
  });
  it('the rules textarea parses to an object or says why not', () => {
    expect(parseRules('{"classes":{}}')).toEqual({ ok: true, rules: { classes: {} } });
    expect(parseRules('[]').ok).toBe(false);
    expect(parseRules('{').ok).toBe(false);
  });
});
