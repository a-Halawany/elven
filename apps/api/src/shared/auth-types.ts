/** Authentication result types — shared so the pipeline never imports the identity module (ADR-P0-02 boundaries). */
import type { Scope } from '@eye/contracts';

export interface RoleBinding {
  roleCode: string;
  scope: Scope;
  tenantId: string | null;
  domainId: string | null;
}

export interface AuthenticatedPrincipal {
  principalId: string;
  sessionId: string;
  /**
   * Proof-of-possession material for establishing an authoritative database
   * context (Gate-2 §2). Delivered only inside the verified access token; never
   * logged, never persisted, never returned to a client in a response body.
   */
  contextKey: string;
  kind: 'human' | 'workload' | 'agent';
  homeScope: Scope;
  homeTenantId: string | null;
  homeDomainId: string | null;
  assurance: 'password' | 'break_glass' | 'bootstrap_rotation' | 'system';
  bindings: RoleBinding[];
}
