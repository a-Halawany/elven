import { describe, expect, it } from 'vitest';
import { acceptanceStateText, ageText, assetOwnerText, baselineStateText, conformanceText, dayText, endOfDay, exceptionStateText, isId, latestOnly, loopHeader, safeReturn, shortDigest, stageText } from './governance-dg-b107';

/** CP-6 B107 §DG (0115_b107_x_dg): the page WORDS the server's record — states, blockers and eligibility are the server's. SYNTHETIC. */
describe('nothing is shown conformant, accepted or in force by inference', () => {
  it('conformance: withheld with its reasons, or "no blocking finding" — which says it is not conformance', () => {
    expect(conformanceText({ state: 'withheld', reasons: [{ class: 'orphan', reason: 'x' }] })).toBe('⊘ CONFORMANCE WITHHELD — 1 reason');
    expect(conformanceText({ state: 'no_blocking_finding', reasons: [] })).toMatch(/this is not conformance/);
    expect(conformanceText({ state: 'no_blocking_finding', reasons: [] })).not.toMatch(/^.*\bCONFORMANT\b/);
  });
  it('a proposal is never worded like an attestation or an approval; a held proposal says why it waits', () => {
    expect(baselineStateText({ state: 'proposed', blockers: [] })).toMatch(/^PROPOSED — not in force/);
    expect(baselineStateText({ state: 'proposed', blockers: [{ class: 'ownership_gap' }] })).toMatch(/^PROPOSED — HELD/);
    expect(baselineStateText({ state: 'attested', decided_at: '2026-10-15T10:00:00Z' })).toMatch(/^ATTESTED and SIGNED — the controlling design baseline since/);
    expect(stageText('proposed')).toMatch(/a proposal, not a change/);
    expect(stageText('measured')).toMatch(/never changes a pattern/);
    expect(stageText('unknown')).toBe('unknown');
  });
  it('exceptions on the read\'s clock: an approved exception past its expiry is EXPIRED and covers nothing', () => {
    const read = '2026-10-15T12:00:00.000Z';
    expect(exceptionStateText({ state: 'approved', expires_at: '2026-10-16T00:00:00.000Z' }, read)).toMatch(/^APPROVED and SIGNED — narrow/);
    expect(exceptionStateText({ state: 'approved', expires_at: '2026-10-15T11:59:00.000Z' }, read)).toMatch(/^EXPIRED .* covers nothing/);
    expect(exceptionStateText({ state: 'requested' }, read)).toMatch(/never the asset's owner/);
  });
  it('ownership gaps and acceptance states', () => {
    expect(assetOwnerText({ owner_principal_id: null })).toMatch(/^⊘ NO ACCOUNTABLE OWNER/);
    expect(assetOwnerText({ owner_principal_id: 'u', owner_name: 'A (SYNTHETIC)', status: 'approved' })).toBe('A (SYNTHETIC) · APPROVED');
    expect(acceptanceStateText({ state: 'proposed', attestations: [{}], obligations: ['design', 'assurance'] })).toBe('PROPOSED — 1 of 2 obligations attested; NOT accepted');
    expect(acceptanceStateText({ state: 'accepted', claim: 'demonstration', valid_until: 'X' })).toMatch(/exact tuple only \(claim: demonstration\)/);
    expect(acceptanceStateText({ state: 'withheld', withheld_reason: 'evidence expired' })).toMatch(/^WITHHELD — evidence expired/);
  });
});

describe('dates, digests, ages, ids, stale responses', () => {
  it('a DATE renders as the day it names; an expiry date is recorded at the end of that day (UTC)', () => {
    expect(dayText('2026-10-15')).toBe('2026-10-15');
    expect(dayText('2026-10-15T00:00:00.000Z')).toBe('2026-10-15');
    expect(endOfDay('2026-10-31')).toBe('2026-10-31T23:59:59.000Z');
    expect(endOfDay('31/10/2026')).toBeNull();
  });
  it('digests shortened, never altered; ages in words; ids', () => {
    expect(shortDigest('a'.repeat(64))).toBe(`${'a'.repeat(12)}…aaaa`);
    expect(ageText(0.5)).toBe('12 h old');
    expect(ageText(3.2)).toBe('3.2 d old');
    expect(ageText(null)).toBe('age unknown');
    expect(isId('0199e6f2-7d1c-7a3b-8c4d-123456789abc')).toBe(true);
    expect(isId('nope')).toBe(false);
  });
  it('only the newest selection-driven answer applies', () => {
    const g = latestOnly(); const a = g.next(); const b = g.next();
    expect(g.isLatest(a)).toBe(false);
    expect(g.isLatest(b)).toBe(true);
  });
});

describe('the loop-stage header (UX-02): one loop, a broken handoff shown, no skipped gate, a safe return path', () => {
  it('the current stage among six; the next action allowed only when the handoff is whole and no gate is open', () => {
    const h = loopHeader({ stage: 'Learn', upstream: [{ label: 'an attested design baseline', present: true }], next: { label: 'review the queue', gate: null }, from: '/observation' });
    expect(h.stages.filter((s) => s.current).map((s) => s.stage)).toEqual(['Learn']);
    expect(h.stages).toHaveLength(6);
    expect(h.next).toEqual({ label: 'review the queue', allowed: true, reason: null });
    expect(h.returnPath).toBe('/observation');
  });
  it('a broken handoff keeps the last coherent state and blocks the next transition; a required gate blocks it too', () => {
    const broken = loopHeader({ stage: 'Decide', upstream: [{ label: 'the lint evaluation', present: false }, { label: 'x', present: true }], next: { label: 'attest', gate: null }, from: null });
    expect(broken.broken).toEqual(['the lint evaluation']);
    expect(broken.next.allowed).toBe(false);
    expect(broken.next.reason).toMatch(/^the handoff is broken: the lint evaluation/);
    const gated = loopHeader({ stage: 'Decide', upstream: [], next: { label: 'attest', gate: 'the Design System Authority attests — a named human' }, from: null });
    expect(gated.next).toEqual({ label: 'attest', allowed: false, reason: 'the Design System Authority attests — a named human' });
  });
  it('the return path is internal only', () => {
    expect(safeReturn('/admin/governance?x=1')).toBe('/admin/governance?x=1');
    expect(safeReturn('//evil.example')).toBeNull();
    expect(safeReturn('https://evil.example')).toBeNull();
    expect(safeReturn('javascript:alert(1)')).toBeNull();
    expect(safeReturn(null)).toBeNull();
  });
});
