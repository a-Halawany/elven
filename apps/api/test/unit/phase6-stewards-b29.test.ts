/**
 * CP-6 B29 (0092) — the method and constraint stewards' standing in the policy: a PURE steward (no other role) opens the shell
 * (identity.self.read — found by the B29 demonstration walk: S. Lindqvist's constraints page answered "no qualifying role binding"),
 * reads the twins and the constraint sets, and holds exactly its own writes.
 */
import { describe, expect, it } from 'vitest';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (action: string, roles: string[]): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: 'human', assurance: 'password',
               bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action, objectType: 'TWN', objectId: null, purposeId: 'twin',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
} as PolicyInput);
const ok = (d: string) => d === 'allow' || d === 'allow_with_obligations';

describe('B29 · the stewards in the policy', () => {
  const pdp = new PdpService();
  it('a pure method or constraint steward opens the shell and reads the twins and the constraint sets', () => {
    for (const role of ['method_steward', 'constraint_steward']) {
      for (const action of ['identity.self.read', 'twin.read', 'simulation.read', 'simulation.constraint.read']) expect(ok(pdp.evaluate(input(action, [role])).decision), `${role} ${action}`).toBe(true);
    }
  });
  it('each steward holds its own writes and not the other\'s', () => {
    expect(ok(pdp.evaluate(input('simulation.adapter.reinstate', ['method_steward'])).decision)).toBe(true);
    expect(pdp.evaluate(input('simulation.adapter.reinstate', ['constraint_steward'])).decision).toBe('deny');
    expect(ok(pdp.evaluate(input('simulation.constraint.declare', ['constraint_steward'])).decision)).toBe(true);
    expect(pdp.evaluate(input('simulation.constraint.declare', ['method_steward'])).decision).toBe('deny');
    for (const role of ['method_steward', 'constraint_steward']) expect(pdp.evaluate(input('twin.version.admit', [role])).decision, role).toBe('deny');
  });
});
