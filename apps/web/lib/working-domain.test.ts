import { describe, expect, it } from 'vitest';
import {
  WORKING_DOMAIN_KEY, chooserModeFor, clearWorkingDomain, isDomainId, parseWorkingDomain, readWorkingDomain,
  workingDomainFor, writeWorkingDomain, type MeLike, type WorkingDomain,
} from './working-domain';

/**
 * The rule this pins: a working domain is a TENANT-homed principal's OWN choice of a domain of ITS home tenant, read
 * back only for that principal — it never widens a DOMAIN-homed principal, never carries over to another principal on the
 * same tab, and anything that is not exactly the stored shape reads as no choice (the chooser again, never a guess).
 */
const T = '0192a1b2-7c3d-4e5f-8a9b-0c1d2e3f4a5b';
const D1 = '0192a1b2-7c3d-4e5f-8a9b-0c1d2e3f4a5c';
const D2 = '0192a1b2-7c3d-4e5f-8a9b-0c1d2e3f4a5d';
const OTHER_T = '0192a1b2-7c3d-4e5f-8a9b-0c1d2e3f4a5e';

const me = (over: Partial<MeLike> = {}): MeLike => ({ principalId: 'p1', homeTenantId: T, homeDomainId: null, bindings: [], ...over });
const stored = (over: Partial<WorkingDomain> = {}): WorkingDomain => ({
  principalId: 'p1', tenantId: T, domainId: D1, mode: 'pasted', chosenAt: '2026-09-16T00:00:00.000Z', ...over,
});
const binding = (roleCode: string, scope: string, tenantId: string | null, domainId: string | null = null) => ({ roleCode, scope, tenantId, domainId });

describe('the working domain of a tenant-homed principal (B18)', () => {
  it('parseWorkingDomain reads exactly the stored shape and nothing else', () => {
    expect(WORKING_DOMAIN_KEY).toBe('eye.working_domain');
    expect(parseWorkingDomain(null)).toBeNull();
    expect(parseWorkingDomain('not json')).toBeNull();
    expect(parseWorkingDomain('[]')).toBeNull();
    expect(parseWorkingDomain('"x"')).toBeNull();
    expect(parseWorkingDomain('{}')).toBeNull();
    expect(parseWorkingDomain(JSON.stringify(stored({ domainId: 'nope' })))).toBeNull();
    expect(parseWorkingDomain(JSON.stringify(stored({ tenantId: 'nope' })))).toBeNull();
    expect(parseWorkingDomain(JSON.stringify({ ...stored(), mode: 'typed' }))).toBeNull();
    expect(parseWorkingDomain(JSON.stringify({ ...stored(), chosenAt: 12 }))).toBeNull();
    expect(parseWorkingDomain(JSON.stringify(stored()))).toEqual(stored());
    expect(parseWorkingDomain(JSON.stringify(stored({ mode: 'listed' })))).toEqual(stored({ mode: 'listed' }));
    // extra keys are dropped: the value read back is the five fields exactly
    expect(parseWorkingDomain(JSON.stringify({ ...stored(), extra: 'ignored' }))).toEqual(stored());
  });

  it('workingDomainFor: the home domain wins, a stored choice is read only for its own principal and tenant', () => {
    // a DOMAIN-homed principal keeps its home domain even with a stored choice of another domain (never widened)
    expect(workingDomainFor(me({ homeDomainId: D2 }), stored({ domainId: D1 }))).toBe(D2);
    expect(workingDomainFor(me({ homeDomainId: D2 }), null)).toBe(D2);
    // a TENANT-homed principal: no choice → the chooser; its own valid choice → that domain
    expect(workingDomainFor(me(), null)).toBeNull();
    expect(workingDomainFor(me(), stored())).toBe(D1);
    expect(workingDomainFor(me(), stored({ domainId: D2, mode: 'listed' }))).toBe(D2);
    // another principal's choice, or a choice of another tenant, is never inherited
    expect(workingDomainFor(me(), stored({ principalId: 'p2' }))).toBeNull();
    expect(workingDomainFor(me(), stored({ tenantId: OTHER_T }))).toBeNull();
    // a PLATFORM principal has no home tenant: null even with a stored choice (the refusal, not the chooser)
    expect(workingDomainFor(me({ homeTenantId: null }), stored())).toBeNull();
    expect(workingDomainFor(me({ homeTenantId: null, homeDomainId: null }), null)).toBeNull();
  });

  it('chooserModeFor: listed for the home tenant’s administrator, pasted for every other tenant-homed principal, else null', () => {
    expect(chooserModeFor(me({ bindings: [binding('tenant_admin', 'TENANT', T)] }))).toBe('listed');
    expect(chooserModeFor(me({ bindings: [binding('retention_authority', 'TENANT', T), binding('tenant_admin', 'TENANT', T)] }))).toBe('listed');
    // tenant_admin of ANOTHER tenant lists nothing here: pasted
    expect(chooserModeFor(me({ bindings: [binding('tenant_admin', 'TENANT', OTHER_T)] }))).toBe('pasted');
    // a tenant_admin role code at a scope other than TENANT is not the listing right
    expect(chooserModeFor(me({ bindings: [binding('tenant_admin', 'DOMAIN', T, D1)] }))).toBe('pasted');
    expect(chooserModeFor(me({ bindings: [binding('retention_authority', 'TENANT', T)] }))).toBe('pasted');
    expect(chooserModeFor(me({ bindings: [binding('auditor', 'TENANT', T)] }))).toBe('pasted');
    expect(chooserModeFor(me())).toBe('pasted');
    // not offered: a DOMAIN-homed principal (its home domain), a PLATFORM principal (no home tenant)
    expect(chooserModeFor(me({ homeDomainId: D1, bindings: [binding('tenant_admin', 'TENANT', T)] }))).toBeNull();
    expect(chooserModeFor(me({ homeTenantId: null, bindings: [binding('platform_admin', 'PLATFORM', null)] }))).toBeNull();
  });

  it('isDomainId accepts a uuid in either case and nothing else', () => {
    expect(isDomainId(D1)).toBe(true);
    expect(isDomainId(D1.toUpperCase())).toBe(true);
    expect(isDomainId(`  ${D1}  `)).toBe(true);
    expect(isDomainId('')).toBe(false);
    expect(isDomainId('0192a1b2')).toBe(false);
    expect(isDomainId(`${D1}x`)).toBe(false);
    expect(isDomainId(D1.replace('-', ''))).toBe(false);
  });

  it('the storage accessors are safe where there is no window (the server render; this node environment)', () => {
    expect(typeof window).toBe('undefined');
    expect(() => writeWorkingDomain(stored())).not.toThrow();
    expect(readWorkingDomain()).toBeNull();
    expect(() => clearWorkingDomain()).not.toThrow();
    expect(readWorkingDomain()).toBeNull();
  });
});
