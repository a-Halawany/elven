/**
 * Policy Decision Point — CP-POL-01 (ADR-P0-10).
 * Four-value ABAC decisions over the Vol 3 Ch.22 six-dimension input.
 * bundle-v1 expresses Phase 0 RBAC rules inside the ABAC model.
 * Default DENY; unknown action → INDETERMINATE (treated as deny at the PEP).
 * Obligations returned here are EXECUTED and evidenced by the enforcing
 * boundary (ES-13-004) — see pipeline + audit query service.
 */
import { Injectable } from '@nestjs/common';
import { contentDigest, type ConsequenceClass, type Scope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import type { ScopeContext } from '../shared/scope.js';

export type Decision = 'allow' | 'deny' | 'indeterminate' | 'allow_with_obligations';

export type Obligation =
  | { type: 'audit_access' }                 // evidence the access itself (consequential reads)
  | { type: 'mask_secret_metadata' };        // audit viewer must project sanitized columns only

export interface PolicyInput {
  principal: Pick<AuthenticatedPrincipal, 'principalId' | 'kind' | 'assurance' | 'bindings'>;
  delegationId: string | null;
  action: string;
  objectType: string | null;
  objectId: string | null;
  purposeId: string | null;
  context: ScopeContext;
  consequenceClass: ConsequenceClass;
  environment: { deployment: 'local-dev'; clockQuality: string };
}

export interface PolicyResult {
  decision: Decision;
  obligations: Obligation[];
  reason: string;
  bundleVersion: string;
  inputDigest: string;
  exceptionRef: string | null;
  expiresAt: string | null;
  revocationState: 'none';
}

interface Rule {
  actionPrefix: string;
  requiredAnyRole: Array<{ role: string; atScope: Scope }>;
  obligations?: Obligation[];
  requiresPurpose?: boolean;
  maxConsequence?: ConsequenceClass;
}

/** bundle-v1 — RBAC rules in the ABAC model. Order matters: first match wins. */
const BUNDLE_V1: Rule[] = [
  { actionPrefix: 'tenancy.tenant.', requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }], requiresPurpose: true },
  {
    actionPrefix: 'tenancy.domain.',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'identity.',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'audit.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'tenant_admin', atScope: 'TENANT' },
    ],
    obligations: [{ type: 'audit_access' }, { type: 'mask_secret_metadata' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'policy.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'tenant_admin', atScope: 'TENANT' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'objects.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'auditor', atScope: 'TENANT' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'objects.',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
    // Phase 0 ships no human-gate runtime: consequential decision support (C3+)
    // cannot be authorized yet — fail closed rather than silently allow.
    maxConsequence: 'C2',
  },
];

const CONSEQ_ORDER: ConsequenceClass[] = ['C0', 'C1', 'C2', 'C3', 'C4'];

function bindingSatisfies(
  b: AuthenticatedPrincipal['bindings'][number],
  req: { role: string; atScope: Scope },
  ctx: ScopeContext,
): boolean {
  if (b.roleCode !== req.role || b.scope !== req.atScope) return false;
  if (req.atScope === 'PLATFORM') return true;
  if (req.atScope === 'TENANT') return ctx.tenantId !== null && b.tenantId === ctx.tenantId;
  return ctx.tenantId !== null && ctx.domainId !== null && b.tenantId === ctx.tenantId && b.domainId === ctx.domainId;
}

@Injectable()
export class PdpService {
  readonly bundleVersion = 'bundle-v1';

  evaluate(input: PolicyInput): PolicyResult {
    const inputDigest = contentDigest({
      principal: input.principal.principalId,
      delegation: input.delegationId,
      action: input.action,
      object_type: input.objectType,
      object_id: input.objectId,
      purpose: input.purposeId,
      scope: input.context,
      consequence: input.consequenceClass,
      environment: input.environment,
    });
    const base = {
      bundleVersion: this.bundleVersion,
      inputDigest,
      exceptionRef: null,
      expiresAt: null,
      revocationState: 'none' as const,
    };

    const rule = BUNDLE_V1.find((r) => input.action.startsWith(r.actionPrefix));
    if (!rule) {
      // Unknown action: cannot be safely resolved → indeterminate (deny at PEP).
      return { ...base, decision: 'indeterminate', obligations: [], reason: `no rule covers action "${input.action}"` };
    }
    if (rule.requiresPurpose === true && (input.purposeId === null || input.purposeId === '')) {
      return { ...base, decision: 'deny', obligations: [], reason: 'purpose_id required for protected operation' };
    }
    if (rule.maxConsequence !== undefined) {
      if (CONSEQ_ORDER.indexOf(input.consequenceClass) > CONSEQ_ORDER.indexOf(rule.maxConsequence)) {
        return {
          ...base,
          decision: 'deny',
          obligations: [],
          reason: `consequence class ${input.consequenceClass} exceeds ${rule.maxConsequence}; human-gate runtime not available in Phase 0 (fail closed)`,
        };
      }
    }
    const satisfied = rule.requiredAnyRole.some((req) =>
      input.principal.bindings.some((b) => bindingSatisfies(b, req, input.context)),
    );
    if (!satisfied) {
      return { ...base, decision: 'deny', obligations: [], reason: 'no qualifying role binding for action in resolved scope' };
    }
    const obligations = rule.obligations ?? [];
    return {
      ...base,
      decision: obligations.length > 0 ? 'allow_with_obligations' : 'allow',
      obligations,
      reason: 'rule matched; role binding qualifies in resolved scope',
    };
  }
}
