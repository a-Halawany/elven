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
    /*
     * A principal reading its OWN identity and bindings. Ordered before the
     * general `identity.` rule so a domain operator can discover the scope it is
     * working in without holding tenant administration — which it must not.
     *
     * The route returns the CALLER's own record only: there is no identifier to
     * pass, so there is nothing to widen it into a directory.
     */
    actionPrefix: 'identity.self.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
      { role: 'collection_agent', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
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
    // Gate-2 §6: chain verification is its OWN governed action, distinct from
    // reading events — a verifier may prove integrity without evidence access,
    // and the decision is recorded against audit.verify.
    actionPrefix: 'audit.verify',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'auditor', atScope: 'TENANT' },
    ],
    obligations: [{ type: 'audit_access' }],
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
  /*
   * ── Phase 1: observation (L1) ────────────────────────────────────────────
   *
   * Ordered before the generic `objects.` rules because these actions have their
   * own separation-of-duties shape, and a first-match bundle must see the
   * specific rule first.
   *
   * TWO SEPARATIONS ARE EXPRESSED HERE, and neither is only a policy rule:
   *   * REGISTER vs. APPROVE. A domain_analyst may register a source contract; a
   *     collection_manager approves it. The rule that the REGISTRAR MAY NOT BE
   *     THE APPROVER lives in the database port (observation.approve_source),
   *     because a policy bundle cannot see who registered what.
   *   * COLLECT vs. REVIEW. An agent principal may run collection and admit or
   *     quarantine items; it may NOT release a quarantined item or apply a
   *     correction. Those need a human collection_manager.
   */
  {
    // Read of observation state: operators, managers, auditors — and the
    // COLLECTION AGENT, which must read the contract it is collecting under, its
    // own checkpoint and its own runs. It is deliberately absent from
    // `observation.evidence.retrieve` below: an agent writes evidence, and has no
    // business reading the original bytes back out.
    actionPrefix: 'observation.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
      { role: 'collection_agent', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
  },
  // ───────────────────────── Phase 2: the intelligence layer ─────────────────────────
  //
  // The same two splits Phase 1 makes, for the same reasons.
  //
  //   * REGISTER vs. APPROVE. An extraction method is registered by an operator
  //     and approved by an extraction_manager who is not its registrar — the
  //     database enforces the second half, because a policy bundle cannot see who
  //     registered what.
  //   * EXTRACT vs. REVIEW. An extraction agent may run a method and admit claims;
  //     it may NOT approve a method or decide a review case. An agent that could
  //     clear its own low-confidence output would make the queue decorative.
  {
    actionPrefix: 'intelligence.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
      { role: 'extraction_agent', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'intelligence.method.register',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    // Approval and activation are the MANAGER surface, and deliberately not the
    // agent's: nothing that runs extraction can decide what extraction may run.
    actionPrefix: 'intelligence.method.approve',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'intelligence.method.activate',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'intelligence.run',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
      { role: 'extraction_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'intelligence.gateway.call',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
      { role: 'extraction_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'intelligence.claim.admit',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
      { role: 'extraction_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    // THE REVIEW DECISION IS A HUMAN ACT. No agent role appears here, and the
    // database additionally refuses a decision by the agent that produced the
    // output — two independent boundaries, as everywhere else.
    actionPrefix: 'intelligence.review.decide',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    // Retrieving the ORIGINAL BYTES is a consequential read of its own: POL and
    // AUD are durable before any byte moves, and it is not folded into the
    // general observation read.
    actionPrefix: 'observation.evidence.retrieve',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
  },
  {
    // Approval, lifecycle transitions, rights confirmation, quarantine review,
    // correction application, agent revocation: the MANAGER surface.
    actionPrefix: 'observation.source.approve',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'observation.source.transition',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'observation.source.rights',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'observation.quarantine.review',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'observation.correction.apply',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'observation.agent.revoke',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    // Registration, agent registration and correction intake: the OPERATOR
    // surface. A registrar cannot approve what they registered.
    actionPrefix: 'observation.source.register',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'observation.agent.register',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'observation.correction.receive',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
      // A collection agent may RECEIVE a publisher correction it detected; it may
      // never APPLY one (see observation.correction.apply above).
      { role: 'collection_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    // The COLLECTION surface: run lifecycle, admission, quarantine, checkpoints,
    // coverage measurement and sweeper reconciliation. Held by the agent role and
    // by an operator triggering a collection by hand.
    actionPrefix: 'observation.',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
      { role: 'collection_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
    // Phase 1 ships no human-gate runtime either: consequential decision support
    // (C3+) cannot be authorized, so it fails closed exactly as `objects.` does.
    maxConsequence: 'C2',
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

    // Bootstrap-rotation sessions may not perform ANY governed action (ADR-P0-17):
    // the only permitted operation is credential rotation, which happens at the
    // authentication boundary, not through the pipeline.
    if (input.principal.assurance === 'bootstrap_rotation') {
      return {
        ...base,
        decision: 'deny',
        obligations: [],
        reason: 'credential rotation required before any governed action (one-time bootstrap secret)',
      };
    }

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
