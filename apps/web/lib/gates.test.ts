import { describe, expect, it } from 'vitest';
import { CONDITION_KINDS, GATE_ACTS, actsFor, buildCondition, conditionLine, gatePayload, heldLine, previewMinutesLeft } from './gates';

/** CP-6 B34 (0090 §G): the gate's words are the server's; the helpers only shape what is sent and word what is recorded. */
describe('the human gate client', () => {
  const ASU = '0190b1c2-d3e4-7000-8000-000000000001';
  it('the vocabularies are the migration\'s and the PDP\'s', () => {
    expect([...CONDITION_KINDS]).toEqual(['assumption_holds', 'indicator_state', 'claim_truth', 'warning_absent', 'date_before']);
    expect(Object.values(GATE_ACTS)).toEqual(['decision.gate.review', 'decision.gate.acknowledge', 'decision.gate.ready', 'decision.gate.defer', 'decision.gate.reject',
      'decision.gate.request_information', 'decision.gate.resume']);
  });
  it('the condition builder types a condition or says why not', () => {
    expect(buildCondition({ kind: 'assumption_holds', ref: ASU, label: 'only if customs pre-clearance holds' }))
      .toEqual({ kind: 'assumption_holds', ref: ASU, label: 'only if customs pre-clearance holds', stages: ['commit', 'monitor'] });
    expect(buildCondition({ kind: 'date_before', expected: '2030-01-19', label: 'before the sailing', stages: ['commit'] }))
      .toEqual({ kind: 'date_before', expected: '2030-01-19T00:00:00.000Z', label: 'before the sailing', stages: ['commit'] });
    expect(buildCondition({ kind: 'indicator_state', ref: ASU, expected: 'x', label: 'clear corridor' })).toMatchObject({ expected: 'clear' });
    expect(buildCondition({ kind: 'gut', label: 'trust me' })).toMatch(/the kind is one of/);
    expect(buildCondition({ kind: 'assumption_holds', ref: 'nope', label: 'a label' })).toMatch(/names the id it is about/);
    expect(buildCondition({ kind: 'warning_absent', ref: ASU, label: 'no' })).toMatch(/label in words/);
    expect(buildCondition({ kind: 'claim_truth', ref: ASU, label: 'the claim stands' })).toMatch(/truth state expected/);
    expect(buildCondition({ kind: 'date_before', label: 'no instant', stages: [] })).toMatch(/at commitment, in monitoring, or both/);
  });
  it('conditions and holds are worded with glyph and word (never colour alone)', () => {
    expect(conditionLine({ kind: 'assumption_holds', ref: ASU, expected: 'verified', label: 'pre-clearance', holds: false, waived_by: null })).toMatch(/✕ DOES NOT HOLD$/);
    expect(conditionLine({ kind: 'date_before', expected: '2030-01-19T00:00:00Z', label: 'sailing', holds: false, waived_by: ASU })).toMatch(/◇ WAIVED/);
    expect(heldLine({ failed: [{ label: 'only if customs pre-clearance holds' }] })).toMatch(/^COMMITMENT HELD — 1 approval condition\(s\) do not hold: “only if customs pre-clearance holds”/);
    expect(heldLine(null)).toBeNull();
  });
  it('the acts offered by state, the payload sent, the preview window', () => {
    expect(actsFor('deferred')).toEqual(['review', 'acknowledge', 'resume', 'reject']);
    expect(actsFor('approved')).toContain('defer');
    expect(actsFor('committed')).toEqual([]);
    expect(gatePayload('defer', { rationale: 'wait', nextReviewAt: '2030-02-01T09:00:00Z', informationPackageDigest: 'x' })).toEqual({ rationale: 'wait', nextReviewAt: '2030-02-01T09:00:00.000Z' });
    expect(gatePayload('ready', { rationale: 'read', informationPackageDigest: 'a'.repeat(64) })).toEqual({ rationale: 'read', informationPackageDigest: 'a'.repeat(64) });
    const now = new Date('2030-01-01T10:00:00Z');
    expect(previewMinutesLeft('2030-01-01T09:45:00Z', now)).toBe(15);
    expect(previewMinutesLeft('2030-01-01T09:00:00Z', now)).toBe(0);
  });
});
