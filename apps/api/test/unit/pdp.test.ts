/** PDP unit tests (TS-006): decision-table coverage, fail-closed semantics. */
import { describe, expect, it } from 'vitest';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const pdp = new PdpService();
const T = '01890a5d-ac96-774b-bcce-b302099a8051';
const D = '01890a5d-ac96-774b-bcce-b302099a8052';

function input(over: Partial<PolicyInput>): PolicyInput {
  return {
    principal: {
      principalId: 'p1', kind: 'human', assurance: 'password',
      bindings: [{ roleCode: 'platform_admin', scope: 'PLATFORM', tenantId: null, domainId: null }],
    },
    delegationId: null,
    action: 'tenancy.tenant.create',
    objectType: 'TEN', objectId: null,
    purposeId: 'admin',
    context: { scope: 'PLATFORM', tenantId: null, domainId: null },
    consequenceClass: 'C1',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
    ...over,
  };
}

describe('PDP (ADR-P0-10)', () => {
  it('allows platform admin to create tenants', () => {
    expect(pdp.evaluate(input({})).decision).toBe('allow');
  });

  it('unknown action → indeterminate (deny at PEP)', () => {
    const r = pdp.evaluate(input({ action: 'unknown.thing' }));
    expect(r.decision).toBe('indeterminate');
  });

  it('missing purpose on protected operation → deny', () => {
    expect(pdp.evaluate(input({ purposeId: null })).decision).toBe('deny');
  });

  it('no qualifying binding → deny (tenant admin of other tenant)', () => {
    const r = pdp.evaluate(input({
      action: 'tenancy.domain.create',
      principal: {
        principalId: 'p2', kind: 'human', assurance: 'password',
        bindings: [{ roleCode: 'tenant_admin', scope: 'TENANT', tenantId: 'other', domainId: null }],
      },
      context: { scope: 'TENANT', tenantId: T, domainId: null },
    }));
    expect(r.decision).toBe('deny');
  });

  it('tenant admin allowed within own tenant', () => {
    const r = pdp.evaluate(input({
      action: 'tenancy.domain.create',
      principal: {
        principalId: 'p2', kind: 'human', assurance: 'password',
        bindings: [{ roleCode: 'tenant_admin', scope: 'TENANT', tenantId: T, domainId: null }],
      },
      context: { scope: 'TENANT', tenantId: T, domainId: null },
    }));
    expect(r.decision).toBe('allow');
  });

  it('audit.read returns enforced obligations (allow_with_obligations)', () => {
    const r = pdp.evaluate(input({ action: 'audit.read', objectType: 'AUD' }));
    expect(r.decision).toBe('allow_with_obligations');
    expect(r.obligations).toEqual(
      expect.arrayContaining([{ type: 'audit_access' }, { type: 'mask_secret_metadata' }]),
    );
  });

  it('objects.create above C2 → deny (no human-gate runtime in Phase 0, fail closed)', () => {
    const r = pdp.evaluate(input({
      action: 'objects.create',
      consequenceClass: 'C3',
      principal: {
        principalId: 'p3', kind: 'human', assurance: 'password',
        bindings: [{ roleCode: 'domain_admin', scope: 'DOMAIN', tenantId: T, domainId: D }],
      },
      context: { scope: 'DOMAIN', tenantId: T, domainId: D },
    }));
    expect(r.decision).toBe('deny');
    expect(r.reason).toMatch(/human-gate/);
  });

  it('every decision carries bundle version + input digest (POL replay context)', () => {
    const r = pdp.evaluate(input({}));
    expect(r.bundleVersion).toBe('bundle-v1');
    expect(r.inputDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(r.revocationState).toBe('none');
  });
});
