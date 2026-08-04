/** Scope resolution unit tests (ADR-P0-04): fail closed, no client-trust. */
import { describe, expect, it } from 'vitest';
import { envelopeScopeMatches, resolveScope } from '../../src/shared/scope.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';

const T = 'tenant-1';
const D = 'domain-1';

function principal(bindings: AuthenticatedPrincipal['bindings']): AuthenticatedPrincipal {
  return {
    principalId: 'p', sessionId: 's', kind: 'human',
    homeScope: 'PLATFORM', homeTenantId: null, homeDomainId: null,
    assurance: 'password', bindings,
  };
}

describe('resolveScope', () => {
  const platformAdmin = principal([{ roleCode: 'platform_admin', scope: 'PLATFORM', tenantId: null, domainId: null }]);
  const tenantAdmin = principal([{ roleCode: 'tenant_admin', scope: 'TENANT', tenantId: T, domainId: null }]);

  it('platform scope requires explicit platform binding', () => {
    expect(resolveScope(platformAdmin, 'PLATFORM', null, null).ok).toBe(true);
    expect(resolveScope(tenantAdmin, 'PLATFORM', null, null).ok).toBe(false);
  });

  it('platform route carrying tenant ids fails closed', () => {
    expect(resolveScope(platformAdmin, 'PLATFORM', T, null).ok).toBe(false);
  });

  it('tenant scope requires matching binding (platform admin passes)', () => {
    expect(resolveScope(tenantAdmin, 'TENANT', T, null).ok).toBe(true);
    expect(resolveScope(tenantAdmin, 'TENANT', 'other', null).ok).toBe(false);
    expect(resolveScope(platformAdmin, 'TENANT', T, null).ok).toBe(true);
  });

  it('missing identifiers fail closed', () => {
    expect(resolveScope(tenantAdmin, 'TENANT', null, null).ok).toBe(false);
    expect(resolveScope(tenantAdmin, 'DOMAIN', T, null).ok).toBe(false);
  });

  it('domain scope honors domain bindings', () => {
    const domainAnalyst = principal([{ roleCode: 'domain_analyst', scope: 'DOMAIN', tenantId: T, domainId: D }]);
    expect(resolveScope(domainAnalyst, 'DOMAIN', T, D).ok).toBe(true);
    expect(resolveScope(domainAnalyst, 'DOMAIN', T, 'other').ok).toBe(false);
    expect(resolveScope(domainAnalyst, 'TENANT', T, null).ok).toBe(false);
  });

  it('envelope scope must match resolved scope exactly', () => {
    const ctx = { scope: 'TENANT' as const, tenantId: T, domainId: null };
    expect(envelopeScopeMatches({ scope: 'TENANT', tenant_id: T, domain_id: null }, ctx)).toBe(true);
    expect(envelopeScopeMatches({ scope: 'TENANT', tenant_id: 'other', domain_id: null }, ctx)).toBe(false);
    expect(envelopeScopeMatches({ scope: 'PLATFORM', tenant_id: null, domain_id: null }, ctx)).toBe(false);
  });
});
