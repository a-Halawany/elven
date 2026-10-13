import { describe, expect, it } from 'vitest';
import { consequenceLines, dayText, grantStateText, grantView, isGap, latestOnly, matrixStateText, minutesLeft, ownerText, shortDigest } from './delivery-sa-b94';

/** CP-6 B94 §SA (0114_b94_x_sa): the control center WORDS the server's record — ownership, liveness and eligibility are the server's. SYNTHETIC. */
describe('support grants are worded on the read\'s clock', () => {
  const read = '2026-10-13T12:00:00.000Z';
  it('pending / live / expired (refused before the sweep) / ended', () => {
    expect(grantView({ state: 'requested', expires_at: null }, read)).toBe('pending');
    expect(grantView({ state: 'approved', expires_at: '2026-10-13T13:00:00.000Z' }, read)).toBe('live');
    expect(grantView({ state: 'approved', expires_at: '2026-10-13T12:00:00.000Z' }, read)).toBe('expired');
    expect(grantView({ state: 'lapsed', expires_at: '2026-10-13T11:00:00.000Z' }, read)).toBe('ended');
    expect(grantStateText({ state: 'approved', expires_at: '2026-10-13T11:59:00.000Z', end_reason: null }, read)).toMatch(/^EXPIRED .* refused already/);
    expect(grantStateText({ state: 'revoked', expires_at: null, end_reason: 'the diagnosis is complete' }, read)).toBe('REVOKED — the diagnosis is complete');
    expect(grantStateText({ state: 'requested', expires_at: null, end_reason: null }, read)).toMatch(/no access/);
    expect(minutesLeft({ state: 'approved', expires_at: '2026-10-13T13:30:30.000Z' }, read)).toBe(90);
    expect(minutesLeft({ state: 'approved', expires_at: '2026-10-13T11:00:00.000Z' }, read)).toBeNull();
  });
  it('the consequence of an approval, in words', () => {
    const l = consequenceLines({ case_ref: 'CASE-0042', purpose: 'diagnose the stalled feed', action_scope: ['diagnose.source'], object_scope: { sources: ['a', 'b'] }, duration_minutes: 240 });
    expect(l[1]).toBe('Allows: diagnose.source — on 2 named sources only');
    expect(l[2]).toMatch(/^For 4 h from your approval/);
    expect(l[3]).toMatch(/^Never:/);
  });
});

describe('owners and matrices: a gap is shown as a gap, a proposal never like an approval', () => {
  it('owner states', () => {
    expect(ownerText({ state: 'resolved', reason: null })).toBe('● resolved');
    expect(ownerText({ state: 'unfilled', reason: 'nobody holds risk_owner in the domain' })).toBe('⊘ UNFILLED — dependent acts stop (nobody holds risk_owner in the domain)');
    expect(isGap({ state: 'ambiguous' })).toBe(true);
    expect(isGap({ state: 'resolved' })).toBe(false);
  });
  it('matrix states', () => {
    expect(matrixStateText({ state: 'proposed' })).toMatch(/^PROPOSED — not in force/);
    expect(matrixStateText({ state: 'approved', decided_at: '2026-10-13T10:00:00Z' })).toMatch(/^APPROVED and SIGNED — in force since/);
    expect(matrixStateText({ state: 'superseded' })).toMatch(/no longer in force/);
  });
  it('a DATE is the day it names; digests are shortened, never altered', () => {
    expect(dayText('2026-10-13')).toBe('2026-10-13');
    expect(dayText('2026-10-13T00:00:00.000Z')).toBe('2026-10-13');
    expect(shortDigest('a'.repeat(64))).toBe(`${'a'.repeat(12)}…aaaa`);
  });
  it('a selection-loaded view applies only the newest answer', () => {
    const g = latestOnly(); const a = g.next(); const b = g.next();
    expect(g.isLatest(a)).toBe(false); expect(g.isLatest(b)).toBe(true);
  });
});
