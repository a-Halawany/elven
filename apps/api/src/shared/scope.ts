/**
 * Scope resolution (ADR-P0-04, ADR-P0-08 step 3).
 * Resolves PLATFORM/TENANT/DOMAIN scope from the AUTHENTICATED principal plus
 * TRUSTED ROUTING information (route params — never body/header client claims).
 * Fails closed on ambiguity or on any mismatch between claimed envelope scope
 * and the resolved scope (EYE-TEN-001).
 */
import type { Scope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../identity/identity.service.js';

export interface ScopeContext {
  scope: Scope;
  tenantId: string | null;
  domainId: string | null;
}

export type ScopeResolution =
  | { ok: true; context: ScopeContext }
  | { ok: false; reason: string };

/**
 * @param principal   authenticated principal (step 2 output)
 * @param routeScope  the scope class the route is declared to operate in
 * @param routeTenantId / routeDomainId — from trusted route params only
 */
export function resolveScope(
  principal: AuthenticatedPrincipal,
  routeScope: Scope,
  routeTenantId: string | null,
  routeDomainId: string | null,
): ScopeResolution {
  if (routeScope === 'PLATFORM') {
    if (routeTenantId !== null || routeDomainId !== null) {
      return { ok: false, reason: 'platform route carries tenant/domain identifiers' };
    }
    // Platform scope requires an explicit PLATFORM binding — never inferred.
    const has = principal.bindings.some((b) => b.scope === 'PLATFORM');
    if (!has) return { ok: false, reason: 'no platform authority binding' };
    return { ok: true, context: { scope: 'PLATFORM', tenantId: null, domainId: null } };
  }

  if (routeScope === 'TENANT') {
    if (routeTenantId === null) return { ok: false, reason: 'tenant route missing tenant id' };
    if (routeDomainId !== null) return { ok: false, reason: 'tenant route carries domain id' };
    const permitted =
      principal.bindings.some((b) => b.scope === 'PLATFORM') ||
      principal.bindings.some((b) => b.scope === 'TENANT' && b.tenantId === routeTenantId);
    if (!permitted) return { ok: false, reason: 'principal has no binding for this tenant' };
    return { ok: true, context: { scope: 'TENANT', tenantId: routeTenantId, domainId: null } };
  }

  // DOMAIN
  if (routeTenantId === null || routeDomainId === null) {
    return { ok: false, reason: 'domain route missing tenant or domain id' };
  }
  const permitted =
    principal.bindings.some((b) => b.scope === 'PLATFORM') ||
    principal.bindings.some((b) => b.scope === 'TENANT' && b.tenantId === routeTenantId) ||
    principal.bindings.some(
      (b) => b.scope === 'DOMAIN' && b.tenantId === routeTenantId && b.domainId === routeDomainId,
    );
  if (!permitted) return { ok: false, reason: 'principal has no binding for this domain' };
  return { ok: true, context: { scope: 'DOMAIN', tenantId: routeTenantId, domainId: routeDomainId } };
}

/** Envelope scope must MATCH the resolved scope exactly — client-declared scope is never trusted independently. */
export function envelopeScopeMatches(env: { scope: string; tenant_id?: string | null; domain_id?: string | null }, ctx: ScopeContext): boolean {
  return (
    env.scope === ctx.scope &&
    (env.tenant_id ?? null) === ctx.tenantId &&
    (env.domain_id ?? null) === ctx.domainId
  );
}
