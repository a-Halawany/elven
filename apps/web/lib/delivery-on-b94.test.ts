import { describe, expect, it } from 'vitest';
import { baselineMark, changeLine, consequencePreview, dayOf, decisionEligibility, driftMark, freshness, latestOnly, pointerSummary, programmeMark, short, stepMark, stepMoves } from './delivery-on-b94';

const T = 't-1';
const B = (role: string, scope = 'TENANT') => ({ roleCode: role, scope, tenantId: T, domainId: null });

describe('the onboarding words (B94 §ON)', () => {
  it('states are visibly distinct; a PROPOSED baseline never reads like an APPROVED one', () => {
    expect(new Set(['planned', 'in_progress', 'held', 'accepted', 'withdrawn'].map((s) => programmeMark(s).text)).size).toBe(5);
    expect(new Set(['planned', 'in_progress', 'done', 'held', 'reverted'].map((s) => stepMark(s).glyph)).size).toBe(5);
    const proposed = baselineMark('proposed'); const approved = baselineMark('approved');
    expect(proposed.text).toMatch(/PROPOSED — awaiting the onboarding authority/);
    expect(proposed.glyph).not.toBe(approved.glyph);
    expect(proposed.token).not.toBe(approved.token);
    expect(new Set(['draft', 'proposed', 'approved', 'rejected', 'superseded'].map((s) => baselineMark(s).text)).size).toBe(5);
  });
  it('drift is never inferred: no baseline is said as such, never as in line', () => {
    expect(driftMark({ state: 'no_baseline', changes: [] }).text).toMatch(/NO APPROVED BASELINE — drift is not inferred/);
    expect(driftMark(null).text).toMatch(/nothing to compare/);
    expect(driftMark({ state: 'in_sync', changes: [] }).text).toMatch(/IN LINE/);
    expect(driftMark({ state: 'drifted', changes: [{ section: 'packages', key: 'x', change: 'added', baseline: null, observed: { version: 1 } }] }).text).toBe('DRIFTED — 1 pointer(s) differ from the approved baseline');
  });
  it('a change in words; the pointers as counts (never persons); a digest shortened only when it is one; a DATE is the day it names', () => {
    expect(changeLine({ section: 'attention_policy', key: null, change: 'changed', baseline: { version: 1 }, observed: { version: 2 } })).toBe('attention_policy: v1 in the baseline → v2 observed');
    expect(changeLine({ section: 'packages', key: 'geo', change: 'added', baseline: null, observed: { version: 3 } })).toBe('packages.geo: added after the baseline (now v3)');
    expect(changeLine({ section: 'source_contracts', key: 'feed', change: 'removed', baseline: 2, observed: null })).toBe('source_contracts.feed: removed since the baseline (was 2)');
    const s = pointerSummary({ attention_policy: { version: 4 }, role_census: { domain_admin: 2, risk_owner: 1 }, licence: null, packages: { a: {}, b: {} } });
    expect(s).toContain('attention policy: v4');
    expect(s).toContain('role census: domain_admin ×2, risk_owner ×1');
    expect(s).toContain('licence: none (uncontracted)');
    expect(s).toContain('active packages: 2');
    expect(short('a'.repeat(64))).toBe('aaaaaaaaaaaa…');
    expect(short('nope')).toBe('—');
    expect(dayOf('2026-10-13')).toBe('2026-10-13');
    expect(dayOf('2026-10-13T23:30:00Z')).toBe('2026-10-13');
  });
  it('freshness is the age of the server\'s read', () => {
    const at = '2026-10-13T10:00:00.000Z'; const t0 = Date.parse(at);
    expect(freshness(at, t0 + 12_000)).toBe('read 12 s ago');
    expect(freshness(at, t0 + 5 * 60_000)).toBe('read 5 min ago');
    expect(freshness(null, t0)).toBe('not read');
  });
});

describe('the approval control (eligibility and consequence — the port decides; the page explains)', () => {
  const proposed = { state: 'proposed', proposed_by: 'lead', captured_by: 'lead' };
  it('the onboarding authority, not the proposer, not a lead → eligible', () => {
    expect(decisionEligibility(proposed, { principalId: 'auth', bindings: [B('onboarding_authority')] }, T)).toEqual({ eligible: true, reasons: [] });
  });
  it('a lead, the proposer, a principal without the role, a non-proposed version → not eligible, with the reasons', () => {
    const lead = decisionEligibility(proposed, { principalId: 'x', bindings: [B('onboarding_authority'), B('implementation_lead')] }, T);
    expect(lead.eligible).toBe(false); expect(lead.reasons.join(' ')).toMatch(/never approves on the customer's behalf/);
    const self = decisionEligibility({ ...proposed, proposed_by: 'auth' }, { principalId: 'auth', bindings: [B('onboarding_authority')] }, T);
    expect(self.reasons.join(' ')).toMatch(/proposer never approves/);
    expect(decisionEligibility(proposed, { principalId: 'y', bindings: [B('customer_sponsor')] }, T).reasons.join(' ')).toMatch(/onboarding authority's/);
    expect(decisionEligibility({ ...proposed, state: 'draft' }, { principalId: 'auth', bindings: [B('onboarding_authority')] }, T).reasons[0]).toMatch(/only a proposed version is decided/);
    expect(decisionEligibility(proposed, { principalId: 'auth', bindings: [{ ...B('onboarding_authority'), tenantId: 'other' }] }, T).eligible).toBe(false);
  });
  it('the consequence preview names the digest, the supersession and the changes', () => {
    const next = { version: 2, pointers: {}, digest: 'b'.repeat(64), basis: 'promotion' as const, promoted_from: 1,
                   absorbed: [{ section: 'attention_policy', key: null, change: 'changed' as const, baseline: { version: 1 }, observed: { version: 2 } }] };
    const lines = consequencePreview(next, { version: 1, pointers: {} }, []);
    expect(lines[0]).toMatch(/^v2 \(digest bbbbbbbbbbbb…\) becomes the domain's desired configuration/);
    expect(lines[1]).toMatch(/Approved v1 is SUPERSEDED \(kept on record, never deleted\)/);
    expect(lines[2]).toBe('1 pointer(s) differ from v1: attention_policy: v1 in the baseline → v2 observed.');
    expect(consequencePreview({ ...next, version: 1, basis: 'capture', promoted_from: null, absorbed: [] }, null, [])[1]).toMatch(/first/);
  });
  it('the step moves the page disables, with the reason', () => {
    expect(stepMoves('done', 'in_progress').find((m) => m.to === 'reverted')).toEqual({ to: 'reverted', allowed: true, reason: null });
    expect(stepMoves('done', 'in_progress').find((m) => m.to === 'in_progress')?.reason).toMatch(/only by its revert/);
    expect(stepMoves('planned', 'held').find((m) => m.to === 'done')).toEqual({ to: 'done', allowed: false, reason: 'the programme is held' });
    expect(stepMoves('planned', 'withdrawn').every((m) => !m.allowed && m.reason === 'the programme is withdrawn')).toBe(true);
  });
  it('a page loading by selection applies only the latest response', () => {
    const g = latestOnly(); const a = g.next(); const b = g.next();
    expect(g.current(a)).toBe(false); expect(g.current(b)).toBe(true);
  });
});
