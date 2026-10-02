import { describe, expect, it } from 'vitest';
import { B34_CLASS_WORDS, SIGNAL_CLASSES, actLine, actOptions, canAct, channelLabel, channelLine, receiptLine, sponsorParams, type ActRegistryRow } from './attention';
import { disparityWords, fairnessRows, type RankingFairness } from './attention-governance';

/** CP-6 B34 (0090 part attention): the new classes, the act and the synthetic channels are worded, never judged on the client. */
const REG: ActRegistryRow[] = [
  { signal_class: 'opportunity.raised', action_key: 'sponsor', governed_action: 'prediction.exposure.sponsor', gate: 'human_gate', target_kind: 'exposure', description: 'sponsor the opportunity', since: '0090', performable: true },
  { signal_class: 'warning.raised', action_key: 'acknowledge_warning', governed_action: 'prediction.warning.acknowledge', gate: 'human_gate', target_kind: 'warning', description: 'acknowledge the warning', since: '0090', performable: true },
];
describe('B34 attention · the classes and the act', () => {
  it('every new class is worded; health.change says it never acts', () => {
    for (const c of ['opportunity.raised', 'health.change', 'commitment.due', 'commitment.breach']) {
      expect(SIGNAL_CLASSES as readonly string[]).toContain(c);
      expect(B34_CLASS_WORDS[c]).toBeTruthy();
    }
    expect(B34_CLASS_WORDS['health.change']).toMatch(/never action/);
  });
  it('the acts offered are the registry\'s for the class; health.change has none, in the server\'s words', () => {
    expect(actOptions('opportunity.raised', REG).acts.map((a) => a.action_key)).toEqual(['sponsor']);
    expect(actOptions('health.change', REG, { 'health.change': 'a score change triggers review, never action' })).toEqual({ acts: [], none: 'a score change triggers review, never action' });
    expect(actOptions('commitment.breach', REG).none).toBe('no act is registered for commitment.breach');
    expect(actOptions('opportunity.raised', [{ ...REG[0]!, performable: false }]).acts).toEqual([]);
    expect(['open', 'escalated', 'unrouted', 'acknowledged'].every(canAct)).toBe(true);
    expect(['closed', 'suppressed', 'deprioritized'].some(canAct)).toBe(false);
  });
  it('the sponsorship params and the act\'s outcome in words', () => {
    expect(sponsorParams({ version: '1', digest: ' ab ', optionKey: 'qualify', rationale: ' worth it ', conditions: 'first\n\n second ' }))
      .toEqual({ version: 1, digest: 'ab', terms: { option_key: 'qualify', rationale: 'worth it', conditions: ['first', 'second'] } });
    expect(actLine({ state: 'acted', governed_action: 'prediction.exposure.sponsor', effect_ref: 'RSK:x@v1:sponsored', refusal: null })).toBe('acted — prediction.exposure.sponsor → RSK:x@v1:sponsored');
    expect(actLine({ state: 'refused', governed_action: 'prediction.exposure.sponsor', effect_ref: null, refusal: 'answered 403' })).toBe('refused — answered 403');
    expect(actLine({ state: 'launched', governed_action: 'g', effect_ref: null, refusal: null })).toMatch(/not yet settled/);
  });
});

describe('B34 attention · the synthetic channels', () => {
  it('email / sms / teams are labelled SYNTHETIC everywhere they are shown', () => {
    expect(channelLabel('email')).toMatch(/SYNTHETIC \(local sink/);
    expect(channelLabel('in_app')).toBe('in_app');
    expect(channelLine({ notify: { channels: ['in_app', 'email', 'teams'], max_attempts: 2 } })).toBe('in_app, email (SYNTHETIC), teams (SYNTHETIC) · up to 2 attempt(s)');
    expect(receiptLine({ channel: 'sms', state: 'delivered', error: null, receipt: { sink: 'http://127.0.0.1:1/sms', sink_message_id: 'abcdef123456', body_digest: 'f'.repeat(64) } }))
      .toMatch(/^SYNTHETIC — sms accepted by the local sink http:\/\/127\.0\.0\.1:1\/sms as abcdef12… .*closes no real-provider clause$/);
  });
});

describe('B34 attention · the ranking fairness', () => {
  const f: RankingFairness = { items: 3, gates_nothing: true,
    by_class: { 'health.change': { items: 2, measured: false, mean_rank_percentile: 0.25, top_decile_share: 0.5, structural_null_shares: { hours_to_window: 1, confidence: 0, exposure: 0, strategic_relevance: 0 } },
                'opportunity.raised': { items: 1, measured: false, mean_rank_percentile: 1, top_decile_share: 0, structural_null_shares: { hours_to_window: 0, confidence: 0, exposure: 0, strategic_relevance: 0 } } },
    disparity: { abstained: true, classes_measured: 0, reason: 'fewer than two classes with at least min_sample 5 item(s)' }, by_consequence_tier: {} };
  it('the rows by class, the structural nulls named; the disparity worded or its abstention', () => {
    expect(fairnessRows(f)).toEqual([
      { signalClass: 'health.change', items: 2, measured: false, mean: '0.25', top: '50%', nulls: 'hours to window 100%' },
      { signalClass: 'opportunity.raised', items: 1, measured: false, mean: '1.00', top: '0%', nulls: 'none' },
    ]);
    expect(disparityWords(f.disparity)).toBe('abstained — fewer than two classes with at least min_sample 5 item(s)');
    expect(disparityWords({ abstained: false, value: 0.75, classes_measured: 2 })).toBe('0.75 between 2 classes (spread of the mean rank percentile)');
    expect(fairnessRows(undefined)).toEqual([]);
  });
});
