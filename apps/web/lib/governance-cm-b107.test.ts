import { describe, expect, it } from 'vitest';
import { attestDisabledReason, candidateStateText, checkLine, componentStateText, dayText, evidenceAge, latestOnly, parseEvidence, shortDigest, syncText, type Preview } from './governance-cm-b107';

/** CP-6 B107 §CM (0115_b107_x_cm): the conformance page WORDS the server's record — it never decides conformance, evidence or eligibility. SYNTHETIC. */
describe('the conformance record is worded, never judged on the client', () => {
  it('candidate states are visibly distinct; nothing is worded as a release', () => {
    const states = ['assembled', 'conformant', 'refused', 'held', 'attested', 'withdrawn', 'superseded'];
    const texts = states.map(candidateStateText);
    expect(new Set(texts).size).toBe(states.length);
    expect(candidateStateText('assembled')).toBe('ASSEMBLED — not checked');
    expect(candidateStateText('conformant')).toMatch(/not attested, not a release/);
    expect(candidateStateText('attested')).toMatch(/not a release \(B65\), not production admission \(R1\)/);
    for (const t of texts) expect(t).not.toMatch(/\breleased\b/i);
  });
  it('component states and the manifest sync in words (unreadable is never healthy)', () => {
    expect(componentStateText('conformant_local')).toBe('conformant (local, build-level evidence)');
    expect(componentStateText('not_deployed')).toMatch(/not deployed/);
    expect(syncText({ state: 'in_sync' })).toMatch(/registered one/);
    expect(syncText({ state: 'drift', committed: 'a'.repeat(64), registered: 'b'.repeat(64) })).toMatch(/^DRIFT — the committed manifest \(aaaaaaaaaaaa…aaaa\)/);
    expect(syncText({ state: 'unreadable', reason: 'missing' })).toMatch(/nothing is inferred conformant/);
  });
  it('a DATE is the day it names; a digest is shortened; an evidence age is read against the server\'s instant', () => {
    expect(dayText('2026-10-15')).toBe('2026-10-15');
    expect(dayText('2026-10-15T23:30:00Z')).toBe('2026-10-15');
    expect(shortDigest('0123456789abcdef0123')).toBe('0123456789ab…0123');
    expect(evidenceAge({ captured_at: '2026-10-14T12:00:00Z', valid_until: '2026-10-20T12:00:00Z' }, '2026-10-15T12:00:00Z')).toBe('captured 24 h ago · valid 5 d more');
    expect(evidenceAge({ captured_at: '2026-10-15T11:00:00Z', valid_until: '2026-10-15T11:30:00Z' }, '2026-10-15T12:00:00Z')).toBe('captured 60 min ago · EXPIRED 30 min ago');
    expect(evidenceAge({ captured_at: 'x', valid_until: 'y' }, 'z')).toBe('age unknown');
  });
  it('the evidence form checks shape only (the server judges truth)', () => {
    expect(parseEvidence('nope')).toEqual({ ok: false, reason: 'the evidence is not JSON' });
    expect(parseEvidence('[]')).toMatchObject({ ok: false });
    expect(parseEvidence('[{"family":"trust","kind":"test_report","ref":"r","captured_at":"a"}]')).toEqual({ ok: false, reason: 'item 1 names no valid_until' });
    expect(parseEvidence('[{"family":"trust","kind":"test_report","ref":"r","captured_at":"a","valid_until":"b"}]')).toMatchObject({ ok: true });
  });
  it('the attest control: disabled with the server\'s reasons, without a bound key, without a reason', () => {
    const p = (over: Partial<Preview>): Preview => ({ candidate: {}, digest: 'd', eligibility: { can_attest: true, reasons: [] }, consequence: '', signer_bound: true, read_at: '', receipt: { policyDecisionId: '', auditSeq: 0 }, ...over });
    expect(attestDisabledReason(null, 'x')).toBe('open the preview first');
    expect(attestDisabledReason(p({ signer_bound: false }), 'a reason here')).toMatch(/binds no signing key/);
    expect(attestDisabledReason(p({ eligibility: { can_attest: false, reasons: ['you assembled this candidate (never its proposer)'] } }), 'a reason here')).toBe('you assembled this candidate (never its proposer)');
    expect(attestDisabledReason(p({}), 'short')).toMatch(/8\+ characters/);
    expect(attestDisabledReason(p({}), 'the evidence reads true')).toBeNull();
  });
  it('the check line is the outcome then the server\'s reasons; the latest-only guard drops a stale answer', () => {
    expect(checkLine(null)).toBe('not checked');
    expect(checkLine({ outcome: 'held', holds: [{ reason_kind: 'exception_expired' }], reasons: [{ class: 'stale', detail: 'x expired' }] })).toBe('HELD · held (exception_expired) · stale: x expired');
    const g = latestOnly(); const a = g.next(); const b = g.next();
    expect(g.isLatest(a)).toBe(false); expect(g.isLatest(b)).toBe(true);
  });
});
