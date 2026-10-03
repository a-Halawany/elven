import { describe, expect, it } from 'vitest';
import { POSTURES, flipWords, mergedWeights, rankChangeWords, resultMark, testWords, type Criterion } from './analysis-b35';

/** CP-6 B35 part `analysis` (0101 §A): the analysis page WORDS the server's record; it never scores, ranks or evaluates. */
const C = (over: Partial<Criterion> = {}): Criterion => ({ key: 'reliability', title: 'Delivery reliability', objective_id: '0190b1c2-d3e4-7000-8000-000000000001', direction: 'max', weight: 5, share: 0.5,
  scale: 'ratio', unit: '%', value_owner: '0190b1c2-d3e4-7000-8000-000000000002', ...over });

describe('the analysis page is worded from the record', () => {
  it('the six postures of option generation are named', () => {
    expect(Object.keys(POSTURES)).toEqual(['defer', 'stage', 'pilot', 'hedge', 'acquire_information', 'exit']);
  });
  it('a weight flip says the weight, the relative change and who takes the lead; none says so', () => {
    expect(flipWords({ weight: 7.5, to: 'morocco', change_pct: 50 }, 'up')).toBe('at weight 7.5 (+50%) morocco takes the lead');
    expect(flipWords({ weight: 2, to: 'buffer', change_pct: -60 }, 'down')).toBe('at weight 2 (-60%) buffer takes the lead');
    expect(flipWords(null, 'up')).toBe('no higher weight changes the lead');
    expect(flipWords(null, 'down')).toBe('no lower weight (above 0) changes the lead');
  });
  it('an obligation result carries a glyph and a word — never colour alone', () => {
    expect(resultMark('violated')).toEqual({ glyph: '✕', token: '--eye-color-critical', text: 'violated' });
    expect(resultMark('satisfied').text).toBe('satisfied');
    expect(resultMark(undefined).text).toBe('unknown');
  });
  it('a rank change reads as a fall, a rise or no change', () => {
    expect(rankChangeWords(1, 3)).toBe('falls from 1st to 3rd');
    expect(rankChangeWords(2, 1)).toBe('rises from 2nd to 1st');
    expect(rankChangeWords(11, 11)).toBe('keeps its rank (11th)');
  });
  it('a test reads as its rule or its owner\'s judgment', () => {
    expect(testWords({ kind: 'threshold', criterion: 'customs_days', op: '<=', value: 5 })).toBe('customs_days ≤ 5');
    expect(testWords({ kind: 'judgment' })).toBe('its owner\'s judgment');
  });
  it('the weights editor merges typed weights over the current set and refuses a non-positive one', () => {
    const set = [C(), C({ key: 'cost', title: 'Cost', direction: 'min', weight: 3, unit: 'EUR k' })];
    expect(mergedWeights(set, { cost: '6' })).toEqual([
      { key: 'reliability', title: 'Delivery reliability', objectiveId: set[0]!.objective_id, direction: 'max', weight: 5, scale: 'ratio', unit: '%' },
      { key: 'cost', title: 'Cost', objectiveId: set[0]!.objective_id, direction: 'min', weight: 6, scale: 'ratio', unit: 'EUR k' },
    ]);
    expect(mergedWeights(set, { cost: '0' })).toBeNull();
    expect(mergedWeights(set, { cost: 'abc' })).toBeNull();
  });
});
