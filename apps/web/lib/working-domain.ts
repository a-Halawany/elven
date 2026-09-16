/**
 * The WORKING DOMAIN of a TENANT-homed principal (CP-6 B18 part 3).
 *
 * The six domain shells operate inside one Intelligence Domain and resolve it from the SERVER's answer about who the
 * principal is (`/v1/me`). A principal bound at TENANT scope has no home domain; until B18 the shells refused it, and every
 * act the policy reserves to a tenant role (a retention authority's approval, the tenant administrator's key) was
 * unreachable from the browser. The shells now offer such a principal a choice of domain to WORK IN. The choice is the
 * browser tab's (sessionStorage, beside the session), the principal's (bound to its id and its home tenant), shown in
 * the header, changeable — and it decides only which domain the envelopes NAME: the server resolves the route's scope
 * and the policy decides what this principal may do there (a TENANT binding on a DOMAIN envelope of its own tenant,
 * `shared/scope.ts`; `pdp.service.ts` bindingSatisfies), exactly as it does for the API.
 *
 * Nothing here widens a principal: a DOMAIN-homed principal's home domain always wins over a stored choice, another
 * principal's choice is never inherited (the principal check), a choice of another tenant reads as no choice, and a
 * value that is not exactly the stored shape reads as no choice — the chooser again, never a guessed domain.
 */
import type { Me } from './observation';

export const WORKING_DOMAIN_KEY = 'eye.working_domain';
export type ChooserMode = 'listed' | 'pasted';
export interface WorkingDomain { principalId: string; tenantId: string; domainId: string; mode: ChooserMode; chosenAt: string }
export type MeLike = Pick<Me, 'principalId' | 'homeTenantId' | 'homeDomainId' | 'bindings'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isDomainId = (v: string): boolean => UUID.test(v.trim());

/** The stored value, or null for anything that is not exactly the shape (garbage, another shape, a non-uuid). */
export function parseWorkingDomain(raw: string | null): WorkingDomain | null {
  if (raw === null) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : null);
  const principalId = s('principalId');
  const tenantId = s('tenantId');
  const domainId = s('domainId');
  const mode = s('mode');
  const chosenAt = s('chosenAt');
  if (principalId === null || tenantId === null || domainId === null || chosenAt === null) return null;
  if (!isDomainId(tenantId) || !isDomainId(domainId)) return null;
  if (mode !== 'listed' && mode !== 'pasted') return null;
  return { principalId, tenantId, domainId, mode, chosenAt };
}

/**
 * The domain the shell works in: the HOME domain when the principal has one (a stored choice is ignored — never widened);
 * else the stored choice when it is THIS principal's and names a domain of ITS home tenant; else null (the chooser).
 */
export function workingDomainFor(me: MeLike, stored: WorkingDomain | null): string | null {
  if (me.homeTenantId === null) return null;
  if (me.homeDomainId !== null) return me.homeDomainId;
  if (stored === null) return null;
  if (stored.principalId !== me.principalId || stored.tenantId !== me.homeTenantId) return null;
  return stored.domainId;
}

/**
 * `listed` for a tenant administrator of the home tenant (the only TENANT role `tenancy.domain.list` admits); `pasted` for
 * every other TENANT-homed principal; null when the chooser is not offered (a home domain, or no home tenant).
 */
export function chooserModeFor(me: MeLike): ChooserMode | null {
  if (me.homeTenantId === null || me.homeDomainId !== null) return null;
  const t = me.homeTenantId;
  return me.bindings.some((b) => b.roleCode === 'tenant_admin' && b.scope === 'TENANT' && b.tenantId === t) ? 'listed' : 'pasted';
}

/** The tab's stored choice, parsed; null on the server, in a tab without storage, or for anything not the shape. */
export function readWorkingDomain(): WorkingDomain | null {
  if (typeof window === 'undefined') return null;
  try { return parseWorkingDomain(sessionStorage.getItem(WORKING_DOMAIN_KEY)); } catch { return null; }
}
export function writeWorkingDomain(w: WorkingDomain): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(WORKING_DOMAIN_KEY, JSON.stringify(w));
}
export function clearWorkingDomain(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(WORKING_DOMAIN_KEY);
}
