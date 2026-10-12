import { describe, expect, it } from 'vitest';
import { blockingLine, cohortShare, consequencePreview, contextLine, contextOf, dayText, gateLabel, goliveEligibility, itemLabel, latestGuard, measureLine } from './delivery-im-b94';

/** CP-6 B94 §IM+§AD (0114 §IM): the page WORDS the server's gate and OFFERS controls by role — the port decides. Every figure is SYNTHETIC. */
describe('the context, the gate and the items are worded, never judged on the client', () => {
  it('the global context names the tenant, the domain and the roles (WS-20)', () => {
    const c = contextOf({ principalId: 'p', accessToken: 'x', scope: { scope: 'TENANT', tenantId: 't-1', domainId: null }, bindings: [{ roleCode: 'customer_sponsor', scope: 'TENANT', tenantId: 't-1', domainId: null }] });
    expect(contextLine(c)).toBe('tenant t-1 · tenant scope · roles customer_sponsor');
    expect(contextLine(contextOf(null))).toMatch(/no tenant in this session/);
  });
  it('a held gate, a ready gate, an accepted one; satisfied, unsatisfied and residual items are visibly distinct', () => {
    expect(gateLabel('held').text).toMatch(/^HELD/);
    expect(gateLabel('ready').text).toMatch(/^READY/);
    expect(gateLabel('accepted').text).toMatch(/demonstration.*R2/);
    expect(new Set(['satisfied', 'unsatisfied', 'accepted_residual'].map((s) => itemLabel(s).mark)).size).toBe(3);
    expect(itemLabel('accepted_residual').text).toMatch(/not satisfied/);
  });
  it('a blocking line keeps the server\'s reason and says when an item is never overridable', () => {
    expect(blockingLine({ kind: 'role_filled', item_key: 'r', title: 'A risk owner', reason: 'nobody holds risk_owner in the domain', accountable_role: 'domain_admin', overridable: false }))
      .toBe('A risk owner — nobody holds risk_owner in the domain (not overridable: it is filled, never waived) · escalates to domain_admin');
    expect(blockingLine({ kind: 'custom', item_key: 'c', title: 'A note', reason: null, accountable_role: 'domain_admin', overridable: true })).toBe('A note — unsatisfied · escalates to domain_admin');
  });
});

describe('eligibility: the page offers go-live only to a named sponsor or authority who is not a lead, on a READY gate', () => {
  const c = (roles: string[]) => ({ scope: 'TENANT' as const, tenantId: 't', domainId: null, roles });
  it('a sponsor on a ready gate may approve and withhold; on a held gate only withhold, said why', () => {
    expect(goliveEligibility(c(['customer_sponsor']), { state: 'ready' })).toMatchObject({ approve: true, withhold: true });
    const held = goliveEligibility(c(['onboarding_authority']), { state: 'held' });
    expect(held).toMatchObject({ approve: false, withhold: true });
    expect(held.reason).toMatch(/no measure, cohort result or percentage releases it/);
  });
  it('the lead is never offered it, even holding an approving role; an executive is not offered it', () => {
    expect(goliveEligibility(c(['implementation_lead', 'customer_sponsor']), { state: 'ready' })).toMatchObject({ approve: false, withhold: false, reason: expect.stringMatching(/separation of duties/) });
    expect(goliveEligibility(c(['executive']), { state: 'ready' })).toMatchObject({ approve: false });
    expect(goliveEligibility(c(['customer_sponsor']), { state: 'accepted' })).toMatchObject({ approve: false, withhold: false });
  });
  it('the consequence is stated before the act: the version, the digest, the cadence, the journeys, the demonstration claim', () => {
    const s = consequencePreview({ title: 'Corridor go-live', version: 6 }, { digest: 'abcdef0123456789'.repeat(4) }, ['j1'], 'cad-1');
    expect(s).toMatch(/“Corridor go-live” v6 at gate digest abcdef012345…/);
    expect(s).toMatch(/cadence cad-1 and 1 priority journey/);
    expect(s).toMatch(/DEMONSTRATION.*R2/);
    expect(consequencePreview(null, null, [], null)).toBe('nothing selected');
  });
});

describe('below k, honest results, DATEs, stale answers', () => {
  it('a cohort below k is INDETERMINATE, never a percentage; at k a share', () => {
    expect(cohortShare(3, 3)).toBe('INDETERMINATE — 3 holder(s), below k = 5: no share is shown');
    expect(cohortShare(5, 6)).toBe('5 of 6 (83 %)');
  });
  it('a measure that is not determinate shows its state and reasons, never a value', () => {
    expect(measureLine({ metric_key: 'ADP-001', version: 1, latest: { state: 'indeterminate', value: null, period_key: '2026-10', reasons: ['the cohort rests on 3 distinct principals, below k = 5'] } }))
      .toBe('ADP-001 — INDETERMINATE (2026-10): the cohort rests on 3 distinct principals, below k = 5');
    expect(measureLine({ metric_key: 'MET-039', version: 2, latest: { state: 'determinate', value: 98.417, period_key: '2026-Q2', reasons: [] } })).toBe('MET-039 — 98.417 (2026-Q2)');
    expect(measureLine({ metric_key: 'ADP-002', version: 1, latest: null })).toMatch(/not computed yet/);
  });
  it('a DATE renders as the day it names; only the latest request\'s answer is applied', () => {
    expect(dayText('2026-11-15')).toBe('2026-11-15');
    expect(dayText(null)).toBe('—');
    const g = latestGuard(); const a = g.next(); const b = g.next();
    expect(g.current(a)).toBe(false); expect(g.current(b)).toBe(true);
  });
});
