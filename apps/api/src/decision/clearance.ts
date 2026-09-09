/**
 * READ-TIME AUTHORITY over a stored snapshot (review of PR #46, item 4).
 *
 * A stored record — a briefing, a replay, a package, an agent's output — is read under the
 * reader's authority NOW: the purpose it was admitted for, the reader's clearance against
 * the classification it inherited, the room's membership where one exists. Availability
 * now (a source withdrawn, deleted or above the reader's clearance since) is reported
 * apart from the historical content, which keeps its digest.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';

export const CLEARANCE_RANK: Readonly<Record<string, number>> = Object.freeze({ public: 0, internal: 1, confidential: 2, restricted: 3 });
const RESTRICTED_ROLES = new Set(['platform_admin', 'tenant_admin', 'auditor']);
const CONFIDENTIAL_ROLES = new Set(['executive', 'decision_owner', 'decision_authority', 'domain_admin']);

/** The clearance a principal's role bindings carry: administrators and auditors restricted; executives, owners and authorities confidential; every other reader internal. */
export function clearanceOf(principal: Pick<AuthenticatedPrincipal, 'bindings'>): string {
  const roles = principal.bindings.map((b) => b.roleCode);
  if (roles.some((r) => RESTRICTED_ROLES.has(r))) return 'restricted';
  if (roles.some((r) => CONFIDENTIAL_ROLES.has(r))) return 'confidential';
  return 'internal';
}

export function covers(clearance: string, classification: string): boolean {
  return (CLEARANCE_RANK[classification] ?? 3) <= (CLEARANCE_RANK[clearance] ?? 0);
}

const deny = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_AUT_001', correlationId, message), 403); };

/** The reader's clearance must cover the record's classification. */
export function assertClearance(principal: Pick<AuthenticatedPrincipal, 'bindings'>, classification: string, what: string, correlationId: string): string {
  const clearance = clearanceOf(principal);
  if (!covers(clearance, classification)) deny(correlationId, `the ${what} is classified ${classification}; the reader's clearance is ${clearance}; the read is refused`);
  return clearance;
}

/** The reader's stated purpose must be the purpose the record was admitted for. */
export function assertPurpose(purpose: string, admittedFor: string | null, what: string, correlationId: string): void {
  if (admittedFor !== null && purpose !== admittedFor) deny(correlationId, `a ${what} is read under the purpose it was admitted for (${admittedFor}); this read states ${purpose}`);
}

export const denyRead = deny;
