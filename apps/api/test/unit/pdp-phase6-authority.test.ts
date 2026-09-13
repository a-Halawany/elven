/**
 * PHASE 6 · the authority contract at the policy decision point (hermetic).
 * decision.commit matches exactly, only at C3, only for a decision_authority at the
 * domain, and carries the human gate; nothing near it inherits the rule.
 */
import { describe, expect, it } from 'vitest';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (over: Partial<PolicyInput> & { roles?: string[]; kind?: 'human' | 'workload' | 'agent' }): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: over.kind ?? 'human', assurance: 'password',
               bindings: (over.roles ?? ['decision_authority']).map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action: 'decision.commit', objectType: 'CMT', objectId: null, purposeId: 'decision',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C3',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  ...over,
});

describe('P6-M2 · decision.commit is one exact C3 rule', () => {
  const pdp = new PdpService();
  it('allows a decision_authority at C3 with the human_gate obligation', () => {
    const r = pdp.evaluate(input({}));
    expect(r.decision).toBe('allow_with_obligations');
    expect(r.obligations).toEqual([{ type: 'human_gate' }]);
  });
  it('denies C4 (nothing executes on the world) and C2 (a commitment below C3 is not a commitment)', () => {
    expect(pdp.evaluate(input({ consequenceClass: 'C4' })).decision).toBe('deny');
    expect(pdp.evaluate(input({ consequenceClass: 'C4' })).reason).toMatch(/exceeds C3/);
    expect(pdp.evaluate(input({ consequenceClass: 'C2' })).decision).toBe('deny');
    expect(pdp.evaluate(input({ consequenceClass: 'C2' })).reason).toMatch(/below C3/);
  });
  it('denies every other role, including the approver, the owner, the executive and platform_admin at the domain', () => {
    for (const role of ['decision_approver', 'decision_owner', 'executive', 'decision_agent', 'strategy_owner', 'domain_admin', 'platform_admin']) {
      expect(pdp.evaluate(input({ roles: [role] })).decision, role).toBe('deny');
    }
  });
  it('matches EXACTLY: a neighbouring action inherits nothing', () => {
    for (const action of ['decision.commitment', 'decision.commit.now', 'decision.commit ', 'decision.commi']) {
      const r = pdp.evaluate(input({ action }));
      expect(r.decision, action).toBe('indeterminate');
    }
  });
  it('the PDP alone does not distinguish a human from an agent — that is the gate the PEP discharges', () => {
    const r = pdp.evaluate(input({ kind: 'agent' }));
    expect(r.decision).toBe('allow_with_obligations');
    expect(r.obligations).toEqual([{ type: 'human_gate' }]);
  });
  it('decision.approve is C2, decision_approver only, human-gated; no decision.package.* rule reaches C3', () => {
    expect(pdp.evaluate(input({ action: 'decision.approve', roles: ['decision_approver'], consequenceClass: 'C2' })).obligations).toEqual([{ type: 'human_gate' }]);
    expect(pdp.evaluate(input({ action: 'decision.approve', roles: ['decision_approver'], consequenceClass: 'C3' })).decision).toBe('deny');
    expect(pdp.evaluate(input({ action: 'decision.approve', roles: ['decision_authority'], consequenceClass: 'C2' })).decision).toBe('deny');
    for (const action of ['decision.package.declare', 'decision.package.propose', 'decision.package.option', 'decision.dissent', 'decision.read']) {
      expect(pdp.evaluate(input({ action, roles: ['decision_owner', 'platform_admin'], consequenceClass: 'C3' })).decision, action).toBe('deny');
    }
  });
});
