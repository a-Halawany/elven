import { describe, expect, it } from 'vitest';
import {
  FIRST_POLICY_TEMPLATE, ITEM_STATES, SIGNAL_CLASSES, canAcknowledge, canClose, canSuppress, listPayload, parseRules, ruleLines, stateMark, whyLine,
  /* B23 (0084) attention */ REVIEW_SUBJECT_KINDS, bandMark, convenePayload, reviewSubjectOf /* end B23 attention */,
  /* B24 (0086) timer */ DELIVERY_STATES, channelLabel, channelLine, deliveryStateMark, receiptLine /* end B24 timer */,
  /* B24 (0086) materiality */ FURTHER_DIMENSIONS, furtherLine, overloadRuleLine, rankLine, waitingWhy, type OverloadRecord /* end B24 materiality */,
} from './attention';

/** CP-6 B22 (0083): the queue's words are the server's; the helpers only word what the record says. */
describe('attention is worded, never judged on the client', () => {
  it('the vocabularies are the migration\'s (executive.attention_items CHECKs)', () => {
    // B23 (0084): decision.material_change (L10-I02) and review.convened (L10-I03) join the five
    expect([...SIGNAL_CLASSES]).toEqual(['forecast.unfit', 'scenario.incoherent', 'warning.raised', 'source.coverage_loss', 'proposal.review', 'decision.material_change', 'review.convened']);
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
  /* B23 (0084) attention */
  it('the review\'s vocabulary is the migration\'s; the convening payload sends only what is set', () => {
    expect([...REVIEW_SUBJECT_KINDS]).toEqual(['objective', 'decision', 'scenario', 'commitment', 'outcome']);
    expect(convenePayload({ kind: 'decision', subjectId: ' p-1 ', version: '', question: ' Does it stand? ', chair: 'c-1', reviewers: 'r-1, r-2  r-3', due: null, key: ' k ', causeItemId: null }))
      .toEqual({ subject: { kind: 'decision', id: 'p-1' }, question: 'Does it stand?', chair: 'c-1', convene_key: 'k', reviewers: ['r-1', 'r-2', 'r-3'] });
    expect(convenePayload({ kind: 'scenario', subjectId: 's', version: '3', question: 'q', chair: 'c', reviewers: '', due: '2026-10-01T00:00:00.000Z', key: 'k', causeItemId: 'i' }))
      .toEqual({ subject: { kind: 'scenario', id: 's', version: 3 }, question: 'q', chair: 'c', convene_key: 'k', due_at: '2026-10-01T00:00:00.000Z', cause_item_id: 'i' });
  });
  it('a queue item reviews as its subject (a material change\'s package as a decision); a band reads in three channels', () => {
    expect(reviewSubjectOf({ subject_kind: 'package', signal_class: 'decision.material_change' })).toBe('decision');
    expect(reviewSubjectOf({ subject_kind: 'scenario', signal_class: 'scenario.incoherent' })).toBe('scenario');
    expect(reviewSubjectOf({ subject_kind: 'claim', signal_class: 'proposal.review' })).toBeNull();
    expect(bandMark('high').text).toBe('HIGH CONFIDENCE');
    expect(bandMark('low').token).toBe('--eye-color-warning');
    expect(bandMark('whatever').text).toBe('CONFIDENCE UNKNOWN');
  });
  /* end B23 attention */
});

/* B24 (0086) timer: the deliveries are worded, never judged — the receipt is the channel's, the demo mailbox always SYNTHETIC. */
describe('deliveries and receipts are worded, never judged on the client', () => {
  it('the policy table words notify: in_app, or the channels and the bound — the demo mailbox marked SYNTHETIC', () => {
    expect(channelLine({ notify: 'in_app' })).toBe('in_app');
    expect(channelLine({})).toBe('in_app');
    expect(channelLine({ notify: { channels: ['in_app', 'demo-mailbox'], max_attempts: 4 } })).toBe('in_app, demo-mailbox (SYNTHETIC) · up to 4 attempt(s)');
    expect(channelLine({ notify: { channels: ['demo-mailbox'] } })).toBe('demo-mailbox (SYNTHETIC) · up to 3 attempt(s)');
    expect(ruleLines({ ...FIRST_POLICY_TEMPLATE.classes['warning.raised']!, notify: { channels: ['demo-mailbox'], max_attempts: 2 } } as never).channel).toBe('demo-mailbox (SYNTHETIC) · up to 2 attempt(s)');
    expect(channelLabel('demo-mailbox')).toMatch(/SYNTHETIC/);
    expect(channelLabel('in_app')).toBe('in_app');
  });
  it('every delivery state has glyph + word + token; a receipt says only what the channel proved', () => {
    expect([...DELIVERY_STATES]).toEqual(['queued', 'sent', 'delivered', 'failed', 'abandoned']);
    for (const s of DELIVERY_STATES) expect(deliveryStateMark(s).token).toMatch(/^--eye-color-/);
    expect(deliveryStateMark('abandoned')).toEqual({ glyph: '■', token: '--eye-color-critical', text: 'ABANDONED' });
    expect(receiptLine({ channel: 'in_app', state: 'delivered', receipt: { placed: true }, error: null })).toBe("placed in the recipient's attention queue");
    expect(receiptLine({ channel: 'demo-mailbox', state: 'delivered', receipt: { message_id: '0190b1c2-d3e4-7000', body_digest: 'ab'.repeat(32) }, error: null })).toMatch(/^SYNTHETIC — message 0190b1c2… placed in the demo mailbox .*no email was sent$/);
    expect(receiptLine({ channel: 'demo-mailbox', state: 'abandoned', receipt: null, error: 'demo-mailbox: down' })).toBe('no receipt — demo-mailbox: down');
    expect(receiptLine({ channel: 'in_app', state: 'queued', receipt: null, error: null })).toBe('no receipt yet — the attempt is queued');
  });
});
/* end B24 timer */
/* B24 (0086) materiality */
describe('B24 · the overload, the rank and the further dimensions are worded, never judged on the client', () => {
  const held: OverloadRecord = { cap: 2, open: 2, window_hours: 24, displaced_by: ['a', 'b'], owner: 'o', consequence: 'C1', exempt_min_consequence: 'C3' };
  it('why an item waits: held for capacity, awaiting the rebalance, or the engine\'s reasons', () => {
    expect(waitingWhy({ outcome: 'material', overload: held, reasons: ['consequence C1 at or above C0'], policy_version: 1 }))
      .toBe('material, held for capacity (policy v1): the owner holds 2 of 2 open or escalated item(s) within 24 h; C1 is below the exemption C3');
    expect(waitingWhy({ outcome: 'material', overload: { ...held, awaiting_rebalance: true, note: 'policy version 2 frees this item' }, reasons: [], policy_version: 2 }))
      .toBe('material, waiting for the rebalance (policy v2): policy version 2 frees this item');
    expect(waitingWhy({ outcome: 'abstained', overload: null, reasons: ['probability: no input, not judged'], policy_version: 1 })).toBe('the engine abstained (policy v1): probability: no input, not judged');
    expect(waitingWhy({ outcome: 'below_threshold', overload: null, reasons: [], policy_version: null })).toBe('below the thresholds of no policy version: no reason recorded');
  });
  it('the rank is the server\'s explanation; the rule enforced, legacy or absent', () => {
    expect(rankLine({ tuple: { consequence: 'C2', hours_to_window: 5, confidence: 0.5, exposure: null, strategic_relevance: null }, order: [], rule: 'lexicographic', explanation: 'consequence C2 · 5.0 h to the window' })).toBe('consequence C2 · 5.0 h to the window');
    expect(rankLine(null)).toBe('no rank recorded');
    expect(overloadRuleLine({ policy_version: 3, max_open_per_owner: 5, window_hours: 24, exempt_min_consequence: 'C3', enforced: true, legacy_max_open_per_role: null, note: '' }))
      .toBe('policy v3: at most 5 open or escalated item(s) per owner within 24 h; exempt from C3 (C3 and C4 always)');
    expect(overloadRuleLine({ policy_version: 1, max_open_per_owner: null, window_hours: null, exempt_min_consequence: null, enforced: false, legacy_max_open_per_role: 50, note: 'this version names only the legacy max_open_per_role, which is not enforced' }))
      .toBe('policy v1: this version names only the legacy max_open_per_role, which is not enforced');
    expect(overloadRuleLine(null)).toBe('no attention policy is published: nothing waits for capacity');
  });
  it('the further dimensions: a missing input says so; an item judged before 0086 says it has none', () => {
    expect([...FURTHER_DIMENSIONS]).toEqual(['probability', 'exposure', 'strategic_relevance', 'information_value', 'irreversibility']);
    expect(furtherLine({ probability: 0.5, exposure: null, strategic_relevance: 1, information_value: null, irreversibility: 'costly' }))
      .toBe('probability 0.5 · exposure — no input · strategic relevance 1 · information value — no input · irreversibility costly');
    expect(furtherLine({ consequence: 'C2' })).toBe('judged before 0086: no further dimension recorded');
  });
});
/* end B24 materiality */
