import { describe, expect, it } from 'vitest';
import { CHECKS, checkMark, comparisonLine, dayOf, evaluationLines, reconciliationMark, standingMark } from './analytics-co-b92';

/** CP-6 B92 §CO (0113 §CO): the standing evaluation, the comparison and the reconciliation are WORDED, never judged on the client. */
describe('the comparability reads are worded, never scored on the client', () => {
  it('every check of the standing evaluation has a meaning; a failure is never softened and an unevaluable check never reads as a pass', () => {
    expect(Object.keys(CHECKS)).toEqual(['stale', 'incomplete', 'biased', 'synthetic_share', 'replay_share', 'non_comparable', 'gamed', 'privacy', 'outcome_detached']);
    expect(checkMark('fail').text).toMatch(/indeterminate/);
    expect(checkMark('not_evaluable').text).not.toMatch(/PASS/);
    expect(checkMark('pass').glyph).toBe('✓');
  });
  it('the evaluation list puts the failures first, each with its meaning', () => {
    const lines = evaluationLines({ reasons: ['stale: …'], by: 'B92 co', checks: [
      { check: 'incomplete', status: 'pass', detail: {} }, { check: 'stale', status: 'fail', detail: {} }, { check: 'biased', status: 'not_declared', detail: {} }, { check: 'gamed', status: 'not_evaluable', detail: {} }] });
    expect(lines.map((l) => l.check)).toEqual(['stale', 'gamed', 'incomplete', 'biased']);
    expect(lines[0]!.line).toMatch(/^✕ stale — FAILS — the result is indeterminate: the source went quiet/);
    expect(evaluationLines(null)).toEqual([]);
  });
  it('an indeterminate comparison is shown AS indeterminate with its reasons — never a zero; a determinate one with its interval and the server\'s claim', () => {
    const ind = comparisonLine({ state: 'indeterminate', kind: 'rate', estimate: null, interval: null, claim: 'indeterminate: …', reasons: ['side b: n = 2 is below the floor 5'] });
    expect(ind).toBe('INDETERMINATE — no difference is shown (side b: n = 2 is below the floor 5)');
    expect(ind).not.toMatch(/\b0\b(?!\.)/);
    const det = comparisonLine({ state: 'determinate', kind: 'rate', estimate: '0.400000', interval: { lo: 0.1163, hi: 0.6012 }, claim: 'a is higher than b by 0.400000', reasons: [] });
    expect(det).toBe('difference 0.4 (95 % interval 0.1163 to 0.6012) — a is higher than b by 0.400000');
    expect(comparisonLine({ state: 'determinate', kind: 'duration', estimate: -2055, interval: {}, claim: 'no claim: the medians\' intervals overlap', reasons: [] }))
      .toBe('difference of medians -2055 — no claim: the medians\' intervals overlap');
  });
  it('a reconciliation is never a silent pass: unpriced, discrepant and empty say what they name', () => {
    expect(reconciliationMark('matched').text).toMatch(/^MATCHED/);
    expect(reconciliationMark('unpriced').text).toMatch(/not priced by B91/);
    expect(reconciliationMark('discrepant').token).toBe('--eye-color-critical');
    expect(reconciliationMark('empty').text).toMatch(/not a pass/);
  });
  it('a semantic object\'s standing: certified, expired (not usable), declared (awaiting its owner), withdrawn (the last valid version readable); a DATE is the day it names', () => {
    expect(standingMark('certified').text).toMatch(/^CERTIFIED/);
    expect(standingMark('certified, past its expiry — not usable until re-certified').text).toMatch(/EXPIRED — not usable/);
    expect(standingMark('declared').text).toMatch(/awaiting its owner/);
    expect(standingMark('withdrawn').text).toMatch(/last valid version stays readable/);
    expect(dayOf('2026-09-30')).toBe('2026-09-30');
    expect(dayOf(null)).toBe('—');
  });
});
