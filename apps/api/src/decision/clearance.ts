/**
 * READ-TIME AUTHORITY over a stored snapshot (review of PR #46, item 4; residual review R4).
 *
 * A stored record — a briefing, a replay, a package, an agent's output — is read under the
 * reader's authority NOW: the purpose it was admitted for, the reader's clearance against
 * the classification it inherited, the room's membership where one exists. Availability
 * now (a source withdrawn, deleted or above the reader's clearance since) is reported
 * apart from the historical content, which keeps its digest.
 *
 * Clearance is evaluated AGAINST THE TARGET CONTEXT, the way the PDP matches a binding: a
 * PLATFORM binding counts everywhere, a TENANT binding in its tenant, a DOMAIN binding in its
 * domain only. A role held in another domain lends no clearance here.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';

export const CLEARANCE_RANK: Readonly<Record<string, number>> = Object.freeze({ public: 0, internal: 1, confidential: 2, restricted: 3 });
const RESTRICTED_ROLES = new Set(['platform_admin', 'tenant_admin', 'auditor']);
const CONFIDENTIAL_ROLES = new Set(['executive', 'decision_owner', 'decision_authority', 'domain_admin']);

export interface TargetContext { tenantId: string | null; domainId: string | null }
type Binding = AuthenticatedPrincipal['bindings'][number];

/** Whether a binding reaches the target context (the PDP's own rule). */
export function bindingReaches(b: Binding, target: TargetContext): boolean {
  if (b.scope === 'PLATFORM') return true;
  if (b.scope === 'TENANT') return target.tenantId !== null && b.tenantId === target.tenantId;
  return target.tenantId !== null && target.domainId !== null && b.tenantId === target.tenantId && b.domainId === target.domainId;
}

/** The clearance a principal's role bindings carry IN THIS CONTEXT: administrators and auditors restricted; executives, owners, authorities and domain administrators confidential; every other reader internal. */
export function clearanceOf(principal: Pick<AuthenticatedPrincipal, 'bindings'>, target: TargetContext): string {
  const roles = principal.bindings.filter((b) => bindingReaches(b, target)).map((b) => b.roleCode);
  if (roles.some((r) => RESTRICTED_ROLES.has(r))) return 'restricted';
  if (roles.some((r) => CONFIDENTIAL_ROLES.has(r))) return 'confidential';
  return 'internal';
}

export function covers(clearance: string, classification: string): boolean {
  return (CLEARANCE_RANK[classification] ?? 3) <= (CLEARANCE_RANK[clearance] ?? 0);
}

const deny = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_AUT_001', correlationId, message), 403); };

/** The reader's clearance in the target context must cover the record's classification. */
export function assertClearance(principal: Pick<AuthenticatedPrincipal, 'bindings'>, target: TargetContext, classification: string, what: string, correlationId: string): string {
  const clearance = clearanceOf(principal, target);
  if (!covers(clearance, classification)) deny(correlationId, `the ${what} is classified ${classification}; the reader's clearance in this domain is ${clearance}; the read is refused`);
  return clearance;
}

/** The reader's stated purpose must be the purpose the record was admitted for. */
export function assertPurpose(purpose: string, admittedFor: string | null, what: string, correlationId: string): void {
  if (admittedFor !== null && purpose !== admittedFor) deny(correlationId, `a ${what} is read under the purpose it was admitted for (${admittedFor}); this read states ${purpose}`);
}

export const denyRead = deny;
