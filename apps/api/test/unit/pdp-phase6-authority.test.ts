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

/*
 * CP-6 B18 (0078; design §3.2, D5): the three lifecycle acts — the withdrawal of an issued forecast, the invalidation of a
 * completed run, the reopening of a committed decision — are EXACT, human-gated C2 rules, each placed before the prefix
 * rule that would otherwise catch it (first match wins): `decision.package.` would admit platform_admin to the reopen and
 * `simulation.run` would admit the invalidation without the gate and without the domain administrator.
 */
describe('B18 · the three lifecycle acts are exact, human-gated rules with named holders', () => {
  const pdp = new PdpService();
  const platform = { roleCode: 'platform_admin', scope: 'PLATFORM' as const, tenantId: null, domainId: null };
  const at = (action: string, roles: string[], consequenceClass: 'C1' | 'C2' | 'C3' = 'C2', objectType = 'FCT') => input({ action, roles, consequenceClass, objectType });
  const asPlatform = (action: string, consequenceClass: 'C2' | 'C3' = 'C2') =>
    input({ action, consequenceClass, principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: 'human', assurance: 'password', bindings: [platform] } });

  it('the holders: forecast_owner / domain_admin / platform_admin withdraw a forecast; twin_owner / simulation_operator / domain_admin / platform_admin invalidate a run; the decision_owner alone reopens — each allowed with the human gate at C2, none at C3', () => {
    const holders: Array<[string, string[]]> = [
      ['prediction.forecast.withdraw', ['forecast_owner', 'domain_admin']],
      ['simulation.run.invalidate', ['twin_owner', 'simulation_operator', 'domain_admin']],
      ['decision.package.reopen', ['decision_owner']],
    ];
    for (const [action, roles] of holders) {
      for (const role of roles) {
        const r = pdp.evaluate(at(action, [role]));
        expect(r.decision, `${action} by ${role}`).toBe('allow_with_obligations');
        expect(r.obligations, `${action} by ${role}`).toEqual([{ type: 'human_gate' }]);
        expect(pdp.evaluate(at(action, [role], 'C3')).decision, `${action} by ${role} at C3`).toBe('deny');
      }
      // The platform administrator holds the two module acts at the platform scope; the reopen is the owner's alone (D5).
      expect(pdp.evaluate(asPlatform(action)).decision, `${action} by platform_admin`).toBe(action === 'decision.package.reopen' ? 'deny' : 'allow_with_obligations');
      // A purpose is required, as for every governed act.
      expect(pdp.evaluate({ ...at(action, roles), purposeId: null }).decision, `${action} without a purpose`).toBe('deny');
    }
  });

  it('who does not hold them: a forecast_agent never withdraws (it may issue), an approver, an authority, an executive, a strategy_owner, a decision_agent, a domain_analyst; a twin_owner does not withdraw a forecast and a forecast_owner does not invalidate a run', () => {
    expect(pdp.evaluate(at('prediction.forecast.issue', ['forecast_agent'])).decision).toBe('allow');
    for (const role of ['forecast_agent', 'twin_owner', 'simulation_operator', 'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'strategy_owner', 'domain_analyst', 'tenant_admin']) {
      expect(pdp.evaluate(at('prediction.forecast.withdraw', [role])).decision, `withdraw by ${role}`).toBe('deny');
    }
    for (const role of ['forecast_owner', 'forecast_agent', 'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'strategy_owner', 'domain_analyst', 'tenant_admin']) {
      expect(pdp.evaluate(at('simulation.run.invalidate', [role])).decision, `invalidate by ${role}`).toBe('deny');
    }
    for (const role of ['decision_approver', 'decision_authority', 'decision_agent', 'executive', 'strategy_owner', 'domain_admin', 'domain_analyst', 'forecast_owner', 'twin_owner', 'tenant_admin']) {
      expect(pdp.evaluate(at('decision.package.reopen', [role])).decision, `reopen by ${role}`).toBe('deny');
    }
    // The rules match EXACTLY: a neighbouring action inherits nothing from them.
    for (const action of ['prediction.forecast.withdrawn', 'prediction.forecast.withdraw.now', 'simulation.run.invalidated', 'decision.package.reopened']) {
      const r = pdp.evaluate(at(action, ['forecast_owner', 'domain_admin', 'twin_owner', 'simulation_operator', 'decision_owner']));
      // `decision.package.reopened` and `simulation.run.invalidated` still fall to their prefix rules; the forecast neighbours to no rule at all.
      expect(r.decision, action).not.toBe('allow_with_obligations');
    }
    expect(pdp.evaluate(at('prediction.forecast.withdrawn', ['forecast_owner'])).decision).toBe('indeterminate');
  });

  it('the placement: decision.package.reopen is matched by its own rule, not by `decision.package.` (which admits platform_admin without a gate); simulation.run.invalidate by its own, not by `simulation.run` (which admits no domain_admin and carries no gate)', () => {
    // `decision.package.` admits platform_admin at the platform scope and gates nothing — the reopen does neither.
    expect(pdp.evaluate(asPlatform('decision.package.declare')).decision).toBe('allow');
    expect(pdp.evaluate(asPlatform('decision.package.reopen')).decision).toBe('deny');
    expect(pdp.evaluate(at('decision.package.declare', ['decision_owner'])).obligations).toEqual([]);
    expect(pdp.evaluate(at('decision.package.reopen', ['decision_owner'])).obligations).toEqual([{ type: 'human_gate' }]);
    // `simulation.run` admits twin_owner / simulation_operator / platform_admin without a gate and no domain_admin — the invalidation gates and adds the administrator.
    expect(pdp.evaluate(at('simulation.run', ['domain_admin'])).decision).toBe('deny');
    expect(pdp.evaluate(at('simulation.run.invalidate', ['domain_admin'])).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(at('simulation.run', ['twin_owner'])).obligations).toEqual([]);
    expect(pdp.evaluate(at('simulation.run.invalidate', ['twin_owner'])).obligations).toEqual([{ type: 'human_gate' }]);
    // The reproduce route invalidates under its own action (D6): its holders are unchanged and ungated at the PDP.
    expect(pdp.evaluate(at('simulation.reproduce', ['simulation_operator'])).decision).toBe('allow');
    expect(pdp.evaluate(at('simulation.reproduce', ['domain_admin'])).decision).toBe('deny');
    // `prediction.forecast.issue` stays a prefix rule for the agent and the owner; the withdrawal is exact and excludes the agent.
    expect(pdp.evaluate(at('prediction.forecast.issue', ['domain_admin'])).decision).toBe('deny');
    expect(pdp.evaluate(at('prediction.forecast.withdraw', ['domain_admin'])).decision).toBe('allow_with_obligations');
  });
});
