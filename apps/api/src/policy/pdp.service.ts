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
  | { type: 'mask_secret_metadata' }         // audit viewer must project sanitized columns only
  | { type: 'human_gate' };                  // the PEP admits only a named human principal at session assurance (Phase 6)

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
  /** Phase 6: match the action EXACTLY, not by prefix — the one C3 rule must cover one action and nothing near it. */
  exact?: boolean;
  requiredAnyRole: Array<{ role: string; atScope: Scope }>;
  obligations?: Obligation[];
  requiresPurpose?: boolean;
  maxConsequence?: ConsequenceClass;
  /** Phase 6: the action is meaningless below this class (a commitment is C3 or it is not a commitment). */
  minConsequence?: ConsequenceClass;
}

/* B80 cb (0118 §CB; DESIGN D3) — THE HUMAN DOMAIN ROLES THAT MAY SET AN OPERATING CONTEXT: every human domain role; the agents (`*_agent`), the
   subscribers (workloads, `*_subscriber`) and the external collaborator never. The port re-checks the SAME list (executive.context_setter_roles(),
   0118 §CB.1); the harness phase6-context-b80 proves the two equal and every DOMAIN role of identity.roles classified. */
export const B80_CONTEXT_SETTER_ROLES: readonly string[] = [
  'domain_admin', 'domain_analyst', 'collection_manager', 'extraction_manager', 'resolution_manager',
  'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'executive_operator', 'board_member',
  'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator',
  'knowledge_owner', 'record_authority', 'retention_steward', 'ontology_steward',
  'risk_owner', 'opportunity_sponsor', 'execution_authority', 'method_steward', 'constraint_steward', 'data_steward',
  'domain_specialist', 'product_analytics_owner', 'privacy_officer', 'product_analyst', 'support_engineer', 'enablement_assessor',
];
/** The TENANT-bound humans who READ the bar (they work in a chosen domain and see its context; they set none — D3 names the domain roles). */
const B80_CONTEXT_TENANT_READERS: readonly string[] = ['tenant_admin', 'auditor', 'retention_authority', 'customer_sponsor', 'onboarding_authority', 'implementation_lead', 'branding_authority'];
/* end B80 cb */

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
      /* B91 (0105) */ { role: 'commercial_authority', atScope: 'PLATFORM' }, /* end B91 */
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
      { role: 'collection_agent', atScope: 'DOMAIN' },
      // Phase 6 — the seven decision roles resolve their own scope like every other (the Decisions shell found it, as the Graph shell did for Phase 3).
      { role: 'decision_owner', atScope: 'DOMAIN' },
      { role: 'decision_approver', atScope: 'DOMAIN' },
      { role: 'decision_authority', atScope: 'DOMAIN' },
      { role: 'executive', atScope: 'DOMAIN' },
      { role: 'decision_agent', atScope: 'DOMAIN' },
      { role: 'briefing_agent', atScope: 'DOMAIN' },
      { role: 'reporting_agent', atScope: 'DOMAIN' },
      /*
       * EVERY DOMAIN ROLE, INCLUDING THE ONES LATER PHASES ADDED.
       *
       * This list was written when `collection_*` were the only domain roles, and
       * it was never extended — so a Phase 2 or Phase 3 principal was refused its
       * OWN identity, and the Intelligence and Graph shells (which resolve the
       * working scope from the server's answer about who you are, deliberately
       * never from anything the client remembered) could not open at all. An
       * authenticated walkthrough as `resolution_manager` is what found it.
       *
       * Widening this is safe for the reason the route already relies on: it
       * returns the CALLER's own record, there is no identifier to pass, and so
       * there is nothing here to widen into a directory.
       */
      { role: 'extraction_manager', atScope: 'DOMAIN' },
      { role: 'extraction_agent', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'resolution_agent', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'forecast_agent', atScope: 'DOMAIN' },
          { role: 'twin_owner', atScope: 'DOMAIN' },
      { role: 'simulation_operator', atScope: 'DOMAIN' },
      // B9 (0066 §3/§4): the Enterprise Memory and retention roles.
      { role: 'knowledge_owner', atScope: 'DOMAIN' },
      { role: 'record_authority', atScope: 'DOMAIN' },
      { role: 'retention_steward', atScope: 'DOMAIN' },
      { role: 'retention_authority', atScope: 'TENANT' },
      { role: 'ontology_steward', atScope: 'DOMAIN' },
      // B32 (0089 §0): the risk and opportunity roles resolve their own scope (a pure risk owner opens the shell; the §I integrator).
      { role: 'risk_owner', atScope: 'DOMAIN' },
      { role: 'opportunity_sponsor', atScope: 'DOMAIN' },
      { role: 'risk_agent', atScope: 'DOMAIN' },
      { role: 'opportunity_agent', atScope: 'DOMAIN' },
      /* B34 (0090) commitments: the execution authority resolves its own scope (a pure issuer opens the shell) */
      { role: 'execution_authority', atScope: 'DOMAIN' },
      /* end B34 commitments */
      /* B29 (0092): the method and constraint stewards resolve their own scope (a pure steward opens the shell — found by the B29 demo walk) */
      { role: 'method_steward', atScope: 'DOMAIN' },
      { role: 'constraint_steward', atScope: 'DOMAIN' },
      /* end B29 */
      /* B36 (0094): the executive operator and the board member resolve their own scope (a pure holder opens the shell) */
      { role: 'executive_operator', atScope: 'DOMAIN' },
      { role: 'board_member', atScope: 'DOMAIN' },
      /* end B36 */
      /* B36 collab (0094 §C1): the external collaborator reads its OWN identity — the route answers it BOUNDED TO ITS GRANT (F-P6-14 (q)) */
      { role: 'external_collaborator', atScope: 'DOMAIN' },
      /* end B36 collab */
      /* B30 estimation: the Reconciliation Agent (the prelude's DOMAIN role) resolves its own scope, as every new domain role does */
      { role: 'reconciliation_agent', atScope: 'DOMAIN' },
      /* end B30 estimation */
      /* B90 browser (0095 §0): the data steward resolves its own scope (a PURE steward opens the shell — found by the B90 browser gate: the
         /graph/data pages answered "no qualifying role binding for action in resolved scope" to a principal holding data_steward alone) */
      { role: 'data_steward', atScope: 'DOMAIN' },
      /* end B90 browser */
      /* B33 §0 (0111 §0.1): the domain specialist and the Domain Intelligence Agent (the prelude's DOMAIN roles) resolve their own scope, as every new domain role does */
      { role: 'domain_specialist', atScope: 'DOMAIN' },
      { role: 'domain_intelligence_agent', atScope: 'DOMAIN' },
      /* end B33 §0 */
      /* B92 §0 (0113 §0.2): the product analytics owner, the privacy officer and the product analyst resolve their own scope, as every new domain role does */
      { role: 'product_analytics_owner', atScope: 'DOMAIN' },
      { role: 'privacy_officer', atScope: 'DOMAIN' },
      { role: 'product_analyst', atScope: 'DOMAIN' },
      /* end B92 §0 */
      /* B94 §0 (0114 §0.2): the customer sponsor, the onboarding authority and the implementation lead (TENANT), the support engineer and the
         enablement assessor (DOMAIN) resolve their own scope, as every new role does */
      { role: 'customer_sponsor', atScope: 'TENANT' },
      { role: 'onboarding_authority', atScope: 'TENANT' },
      { role: 'implementation_lead', atScope: 'TENANT' },
      { role: 'support_engineer', atScope: 'DOMAIN' },
      { role: 'enablement_assessor', atScope: 'DOMAIN' },
      /* end B94 §0 */
      /* B107 §0 (0115 §0.2): the five PLATFORM governance roles resolve their own scope */
      { role: 'product_authority', atScope: 'PLATFORM' },
      { role: 'design_system_authority', atScope: 'PLATFORM' },
      { role: 'independent_assurance', atScope: 'PLATFORM' },
      { role: 'operations_authority', atScope: 'PLATFORM' },
      { role: 'conformance_steward', atScope: 'PLATFORM' },
      /* end B107 §0 */
      /* B80 §0 (0118 §0.2): the customer's brand owner resolves its own scope */
      { role: 'branding_authority', atScope: 'TENANT' },
      /* end B80 §0 */
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
      // Phase 3 reads the METHOD PIN it ranks under through Phase 2's own read.
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'resolution_agent', atScope: 'DOMAIN' },
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
    // B9 (0066 §6): the producing version's evaluation (quality, safety, cost, latency, fitness) — the extraction manager's act.
    actionPrefix: 'intelligence.method.evaluate',
    exact: true,
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
    maxConsequence: 'C2',
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
      // PHASE 3, NARROWLY. The resolver's ambiguous tail reaches a model through
      // Phase 2's single egress rather than one of its own, so the resolution
      // roles hold THIS action in their own right — and holding it authorises
      // reaching the model, nothing else. It does not let them admit a claim.
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'resolution_agent', atScope: 'DOMAIN' },
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
    // B9 (0066 §5): a CHALLENGE opens a review case on an admitted claim (V00-T-037) — the people who read claims and rest work on them.
    actionPrefix: 'intelligence.review.request',
    exact: true,
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  // ───────────────────────── Phase 3: the graph layer ─────────────────────────
  //
  // THE EIGHT RESOLVER AUTHORITY RULES DIVIDE THIS SURFACE.
  //
  //   * PROPOSE vs. DECIDE. A resolution agent may run the resolver and propose
  //     candidates; it may NOT decide one, split an entity or retract an edge.
  //     Rule 6 says an ambiguous resolution needs a human who is not the proposing
  //     agent — so no agent role appears on the deciding actions AT ALL, and
  //     migration 0024 additionally refuses a decider who proposed the row. Two
  //     independent boundaries, as everywhere else.
  //   * OBSERVE vs. DECLARE. The Strategy Graph is declared by people. No agent
  //     role can write an objective, an assumption or a commitment, because
  //     nothing automatic has standing to say what an organisation intends.
  // ───────────────────────── Phase 4: prediction ─────────────────────────
  //   * READ is broad: forecasts are for the people who decide on them.
  //   * A JOB (forecast_agent) may issue forecasts, run backtests, score outcomes
  //     and evaluate indicators. It may NOT declare a scenario, define an
  //     indicator or acknowledge a warning: those say what an organisation
  //     watches for and who answered, and nothing automatic has standing there.
  //   * strategy_owner may declare scenarios — a scenario tree is strategy.
  {
    actionPrefix: 'prediction.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'forecast_agent', atScope: 'DOMAIN' },
          { role: 'twin_owner', atScope: 'DOMAIN' },
      { role: 'simulation_operator', atScope: 'DOMAIN' },
      // B9 (0066 §3/§4): the Enterprise Memory and retention roles.
      { role: 'knowledge_owner', atScope: 'DOMAIN' },
      { role: 'record_authority', atScope: 'DOMAIN' },
      { role: 'retention_steward', atScope: 'DOMAIN' },
      { role: 'retention_authority', atScope: 'TENANT' },
      { role: 'ontology_steward', atScope: 'DOMAIN' },
      // B32 (0089 §I): the risk owner and the opportunity sponsor read the foresight their exposures rest on (the warning routed to them).
      { role: 'risk_owner', atScope: 'DOMAIN' },
      { role: 'opportunity_sponsor', atScope: 'DOMAIN' },
      /* B30 estimation: the Reconciliation Agent reads the series its estimators declare (the forecast agent's precedent: in its own right, audited) */
      { role: 'reconciliation_agent', atScope: 'DOMAIN' },
      /* end B30 estimation */
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'prediction.series.register',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'prediction.forecast.issue',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'forecast_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  // B18 (0078): the WITHDRAWAL of an issued forecast — its owner or the domain's administrator marks a version unfit; human-gated. Exact: forecast_agent never withdraws.
  { actionPrefix: 'prediction.forecast.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B21 (0081, L6-I03): a PERSON's fitness ASSESSMENT — the owner or the domain's administrator; a ledger read that records its answer under the versioned rule, no gate. Exact: a forecast_agent never assesses by hand (the outcome write assesses under its own action).
  { actionPrefix: 'prediction.forecast.assess', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  {
    actionPrefix: 'prediction.backtest.record',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'forecast_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'prediction.outcome.record',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'forecast_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'prediction.scenario.declare',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'prediction.indicator.define',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'prediction.indicator.evaluate',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'forecast_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'prediction.warning.raise',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'forecast_agent', atScope: 'DOMAIN' },
      /* B28 (0088) integrator: the attention agent raises a candidate owed a warning after its tick (the warning-candidate intake, 0088 §0/§W) */
      { role: 'attention_agent', atScope: 'DOMAIN' },
      /* end B28 integrator */
    ],
    requiresPurpose: true,
  },
  {
    // Acknowledging a warning is a PERSON answering for it.
    actionPrefix: 'prediction.warning.acknowledge',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      // B32 (0089 §I): an exposure's warning routes to the exposure's owner first (§R's preflight) — who must be able to acknowledge it.
      { role: 'risk_owner', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },

  // ───────────────────────── Phase 5: twins ─────────────────────────
  //   * READ is broad: a twin is for the people who decide on what it represents.
  //   * A twin is DECLARED, versioned, grounded and admitted by its owner — four
  //     separate governed writes. A simulation operator holds none of them.
  /* B29 (0092) — twin families, composition, the method fabric and the constraint engine: EXACT rules, placed before the twin and
     simulation PREFIX rules (none of these names falls under twin.read / twin.declare / twin.version / twin.ground / simulation.run /
     simulation.reproduce, and exact rules make the placement explicit). The ports check ownership, separation and the approved uses. */
  { actionPrefix: 'twin.kind.register', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true },
  { actionPrefix: 'twin.contract.publish', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'twin.link.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'twin.link.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'twin.coupling.apply', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'twin.coupling.decline', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'twin.proposal.draft', exact: true, requiredAnyRole: [{ role: 'supply_chain_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.proposal.decide', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'simulation.method.bind', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'simulation.method.unbind', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'simulation.adapter.reinstate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'method_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true },
  /* B29 §C (part C adds): the PROBE a reinstatement rests on — a method steward runs a contained adapter on its fixed probe input; the answer is recorded (a failing probe is a fault) */
  { actionPrefix: 'simulation.adapter.probe', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'method_steward', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'simulation.constraint.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'constraint_steward', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'simulation.constraint.version', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'constraint_steward', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'simulation.constraint.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'constraint_steward', atScope: 'DOMAIN' }], requiresPurpose: true },
  { actionPrefix: 'simulation.constraint.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
    { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'constraint_steward', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true },
  { actionPrefix: 'simulation.plan.check', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'constraint_steward', atScope: 'DOMAIN' }],
    requiresPurpose: true },
  /* end B29 */
  {
    actionPrefix: 'twin.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'twin_owner', atScope: 'DOMAIN' },
      { role: 'simulation_operator', atScope: 'DOMAIN' },
      /* B29 (0092) */ { role: 'supply_chain_agent', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'constraint_steward', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'twin.declare',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'twin.version.admit',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }],
    requiresPurpose: true,
  },
  // B21 (0081, L5-I05): the VALIDATION of an admitted version — a twin owner (the twin's OWN owner is refused by the port: separation of duties;
  // a peer twin owner validates) or the domain administrator; human-gated. Placed BEFORE the `twin.version` prefix rule, which would otherwise match first.
  { actionPrefix: 'twin.version.validate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B29-F1 (0093): the WITHDRAWAL of an open draft — a twin owner (the port refuses everyone but the twin's own owner and the draft's opener) or
  // the platform administrator; a reason is required by the port. Placed BEFORE the `twin.version` prefix rule, which would otherwise match first.
  { actionPrefix: 'twin.version.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  {
    actionPrefix: 'twin.version',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'twin.ground',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }],
    requiresPurpose: true,
  },

  // ───────────────────────── Phase 6: the authority contract (P6-M2) ─────────────────────────
  //   * decision.commit is the ONE action above C2 in this bundle. It matches EXACTLY
  //     (no prefix), only a decision_authority at the domain holds it, it carries the
  //     human_gate obligation (the PEP refuses any non-human principal), and C4 is
  //     denied: nothing in The Eye executes on the world.
  //   * decision.approve is a named human's signature: decision_approver only, C2.
  {
    actionPrefix: 'decision.commit',
    exact: true,
    requiredAnyRole: [{ role: 'decision_authority', atScope: 'DOMAIN' }],
    obligations: [{ type: 'human_gate' }],
    requiresPurpose: true,
    minConsequence: 'C3',
    maxConsequence: 'C3',
  },
  {
    actionPrefix: 'decision.approve',
    requiredAnyRole: [{ role: 'decision_approver', atScope: 'DOMAIN' }],
    obligations: [{ type: 'human_gate' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },

  // ───────────────────────── Phase 6: rooms and briefings (P6-M4) ─────────────────────────
  //   * A room is the owner's (and an executive may open one for a package they own);
  //     membership and cadence are the owner's governed writes; a review is a member's act.
  //   * A briefing is composed by an executive, a decision owner, or the briefing agent
  //     (its one write); every reader role reads briefings, under room membership at read time.
  {
    actionPrefix: 'room.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' },
      { role: 'executive', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' },
      /* B36 briefing (0094 §0's roles): the board member and the executive operator read rooms and briefings — under room membership and, on a BRF@v3 edition, the audience contract at read time */
      { role: 'board_member', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'room.',
    requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  /* B35 reopen (0101 §P; F-P6-06, F-P4-08/-09's B35 pieces). EXACT rules — placed HERE, before the `decision.review` PREFIX rule just below
     (first match wins: placed after the end-of-B31-validity marker they would never be reached, the prefix catching every `decision.review.*`).
     THE READS (a package's review and its metrics, a set's review status, the index) — the reading roles of the decisions and scenarios, the
     auditor and the administrators. A CHANGE OF CONDITIONS — the decision owner and authority, the analyst, the strategy owner, the executive.
     The OUTCOME ASSESSMENT — the decision owner and authority, the executive, the analyst. The REVIEW TERMS — the decision owner (the port
     requires the package's owner). A LESSON's link — the decision owner and authority, the strategy and knowledge owners (the port requires the
     memory record's recorder or the package owner). A REVERSION REQUEST's resolution — the scenario roles and the administrators (the port
     requires the scenario's owner). A SET's review CADENCE (and the operator's check) — the set roles (the port requires the set's owner or an
     administrator). Every write human-gated. The reopen reuses `decision.package.reopen` and the replay `decision.replay` (both unchanged).
     No agent role; no new role. */
  { actionPrefix: 'decision.review.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.review.metrics', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.review.change', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.review.outcome', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.review.terms', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.review.lesson', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.review.reversion', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.set.cadence', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B35 reopen */
  {
    actionPrefix: 'decision.review',
    requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  /* B36 briefing (0094 §B): the suppression policy's publication — an EXACT rule placed before the briefing.compose / briefing.read
     PREFIX rules (neither prefix matches `briefing.policy.set`, and the exact rule makes the placement explicit). A named human of the
     executive or the domain administration publishes it; the port asserts the human and records the acting principal. */
  { actionPrefix: 'briefing.policy.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B36 briefing */
  {
    actionPrefix: 'briefing.compose',
    requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'briefing.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' },
      { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' },
      { role: 'executive', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' },
      /* B36 briefing (0094 §0's roles): the board member and the executive operator read rooms and briefings — under room membership and, on a BRF@v3 edition, the audience contract at read time */
      { role: 'board_member', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },

  // ───────────────────────── Phase 6: the bounded agents (P6-M6) ─────────────────────────
  //   * Registration and revocation are the platform / domain administrator's; the trigger
  //     of a run is an owner's or an executive's act; the run's own bookkeeping is the
  //     agent's, under its own session; the decision agent's ONE write is a draft option.
  {
    // Registration creates the agent's principal on the identity authority: the tenant or platform administrator's act.
    actionPrefix: 'agent.register',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'agent.revoke',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'agent.trigger',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  /* B33 §0 (0111 §0.3): the Domain Intelligence Agent opens and closes its own runs — an EXACT `agent.run` rule inserted before B30's (the first
     match wins): the nine agents before it and the domain_intelligence agent. B30's rule below is kept as it was (it now matches nothing this one does not). */
  { actionPrefix: 'agent.run', exact: true, requiredAnyRole: [{ role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }, { role: 'weak_signal_agent', atScope: 'DOMAIN' }, { role: 'risk_agent', atScope: 'DOMAIN' }, { role: 'opportunity_agent', atScope: 'DOMAIN' }, { role: 'supply_chain_agent', atScope: 'DOMAIN' }, { role: 'reconciliation_agent', atScope: 'DOMAIN' }, { role: 'domain_intelligence_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B33 §0 */
  /* B30 estimation: the Reconciliation Agent opens and closes its own runs — an EXACT `agent.run` rule inserted before B29's (the first match wins):
     the eight agents before it and the reconciliation agent. B29's rule below is kept as it was (it now matches nothing this one does not). */
  { actionPrefix: 'agent.run', exact: true, requiredAnyRole: [{ role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }, { role: 'weak_signal_agent', atScope: 'DOMAIN' }, { role: 'risk_agent', atScope: 'DOMAIN' }, { role: 'opportunity_agent', atScope: 'DOMAIN' }, { role: 'supply_chain_agent', atScope: 'DOMAIN' }, { role: 'reconciliation_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B30 estimation */
  /* B29 (0092): the Supply Chain Agent opens and closes its own runs — an EXACT `agent.run` rule inserted before B32's (the first match wins):
     the seven agents before it and the supply_chain agent. */
  { actionPrefix: 'agent.run', exact: true, requiredAnyRole: [{ role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }, { role: 'weak_signal_agent', atScope: 'DOMAIN' }, { role: 'risk_agent', atScope: 'DOMAIN' }, { role: 'opportunity_agent', atScope: 'DOMAIN' }, { role: 'supply_chain_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B29 */
  /* B32 (0089) exposures: the Risk and Opportunity Agents open and close their own runs — an EXACT `agent.run` rule INSERTED before B28's exact
     rule (the first match wins, and B28's names the five agents before it): the same five and the risk and opportunity agents. B28's and B24's
     rules below are kept as they were (they now match nothing this one does not); the integrator may fold the three. */
  { actionPrefix: 'agent.run', exact: true, requiredAnyRole: [{ role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }, { role: 'weak_signal_agent', atScope: 'DOMAIN' }, { role: 'risk_agent', atScope: 'DOMAIN' }, { role: 'opportunity_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B32 exposures */
  /* B28 (0088) signals: the Weak Signal Agent opens and closes its own runs — an EXACT `agent.run` rule INSERTED before B24's exact rule
     (the first match wins, and B24's names the four agents before it): the same four and the weak_signal agent. B24's rule below is kept
     as it was (it now matches nothing this one does not); the integrator may fold the two. */
  { actionPrefix: 'agent.run', exact: true, requiredAnyRole: [{ role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }, { role: 'weak_signal_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B28 signals */
  /* B24 (0086) timer: the attention agent (the timer host's principal) opens and closes its own runs — an EXACT `agent.run` rule placed
     before the prefix rule below (which it would otherwise meet first): the three agents of P6-M6 and the attention agent. */
  { actionPrefix: 'agent.run', exact: true, requiredAnyRole: [{ role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B24 timer */
  {
    actionPrefix: 'agent.run',
    requiredAnyRole: [{ role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'agent.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'report.render',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'decision.package.draft',
    requiredAnyRole: [{ role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },

  // ───────────────────────── Phase 6: decision packages (P6-M1) ─────────────────────────
  //   * READ is broad: a package is for the people who decide, approve, watch and
  //     account for it. The bounded agents read what they compose from.
  //   * A package is declared, versioned, optioned, termed, chosen, proposed and
  //     withdrawn by its OWNER — seven separate governed writes, every one ≤ C2. An
  //     approver, an authority or an executive holds none of them. The decision agent
  //     holds exactly ONE write: an option card into a DRAFT (decision.package.option).
  //   * Dissent is a human's own act: approvers, authorities, executives and owners.
  //   * No rule here reaches C3: the exact-action commit rule arrives with 0042.
  {
    actionPrefix: 'decision.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'decision_owner', atScope: 'DOMAIN' },
      { role: 'decision_approver', atScope: 'DOMAIN' },
      { role: 'decision_authority', atScope: 'DOMAIN' },
      { role: 'executive', atScope: 'DOMAIN' },
      { role: 'decision_agent', atScope: 'DOMAIN' },
      { role: 'briefing_agent', atScope: 'DOMAIN' },
      { role: 'reporting_agent', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'decision.monitor',
    requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'decision.outcome',
    requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }],
    obligations: [{ type: 'human_gate' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'decision.close',
    requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }],
    obligations: [{ type: 'human_gate' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'decision.replay',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'twin_owner', atScope: 'DOMAIN' },
      { role: 'simulation_operator', atScope: 'DOMAIN' },
      { role: 'decision_owner', atScope: 'DOMAIN' },
      { role: 'decision_approver', atScope: 'DOMAIN' },
      { role: 'decision_authority', atScope: 'DOMAIN' },
      { role: 'executive', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  // B18 (0078): the REOPENING of a committed decision — its owner re-enters the lifecycle on a recorded cause; human-gated; the port refuses a non-owner.
  // Placed BEFORE the `decision.package.` prefix rule, which would otherwise match first (first match wins).
  { actionPrefix: 'decision.package.reopen', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  {
    actionPrefix: 'decision.package.option',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'decision.package.',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'decision_owner', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'decision.dissent',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'decision_owner', atScope: 'DOMAIN' },
      { role: 'decision_approver', atScope: 'DOMAIN' },
      { role: 'decision_authority', atScope: 'DOMAIN' },
      { role: 'executive', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },

  // ───────────────────────── Phase 5: simulations ─────────────────────────
  //   * A run is opened, completed and reproduced by a simulation operator or a
  //     twin owner; READ is broad. Nothing here declares or grounds a twin.
  {
    actionPrefix: 'simulation.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'twin_owner', atScope: 'DOMAIN' },
      { role: 'simulation_operator', atScope: 'DOMAIN' },
      /* B29 (0092) */ { role: 'supply_chain_agent', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'constraint_steward', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
  },
  // B18 (0078): the INVALIDATION of a completed run — the twin owner, the operator or the administrator marks its result unfit; human-gated.
  // The reproduce route invalidates under its own action (simulation.reproduce). Placed BEFORE the `simulation.run` prefix rule, which would otherwise match first.
  { actionPrefix: 'simulation.run.invalidate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B21 (0081, L8-I04): the CHALLENGE of a completed run's result — OPENED, sent to a RE-RUN and WITHDRAWN by the people who decide on what a run
  // represents (the simulation.read holders minus the auditors and analysts; decision_owner because a package cites runs, 0041); DECIDED by a twin
  // owner, a strategy owner or the administrator, human-gated (the port refuses the opener and the run's operator: separation of duties); and the
  // PROMOTION (OBJ-29, `simulation.result.promote`) by the same four, human-gated (the port refuses the operator and a disputed result). Exact rules.
  { actionPrefix: 'simulation.challenge.open', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.challenge.rerun', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.challenge.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.challenge.decide', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.result.promote', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  {
    actionPrefix: 'simulation.run.complete',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'simulation.run',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'simulation.reproduce',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'graph.read',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'tenant_admin', atScope: 'TENANT' },
      { role: 'auditor', atScope: 'TENANT' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'resolution_agent', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'forecast_agent', atScope: 'DOMAIN' },
          { role: 'twin_owner', atScope: 'DOMAIN' },
      { role: 'simulation_operator', atScope: 'DOMAIN' },
      // B9 (0066 §3/§4): the Enterprise Memory and retention roles.
      { role: 'knowledge_owner', atScope: 'DOMAIN' },
      { role: 'record_authority', atScope: 'DOMAIN' },
      { role: 'retention_steward', atScope: 'DOMAIN' },
      { role: 'retention_authority', atScope: 'TENANT' },
      { role: 'ontology_steward', atScope: 'DOMAIN' },
    ],
    obligations: [{ type: 'audit_access' }],
    requiresPurpose: true,
  },
  {
    // Creating an entity and registering an identifier system: the resolver
    // surface. An identifier system is what makes an automatic resolution
    // possible at all (rule 1), so declaring one is a governed act in its own
    // right and not something a run does on the way past.
    actionPrefix: 'graph.entity.create',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'resolution_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    // A SPLIT IS A HUMAN ACT. Rule 8 makes wrong resolutions reversible; nothing
    // automatic gets to decide that a merge was wrong.
    actionPrefix: 'graph.entity.split',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'graph.resolution.propose',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'resolution_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    // RULE 6, AT THE POLICY BOUNDARY. No agent role appears here, so an agent
    // cannot hold this decision even before the database refuses it one.
    actionPrefix: 'graph.resolution.decide',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'graph.edge.assert',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'resolution_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    // Retracting an assertion the graph is built on is a judgement, not a job.
    actionPrefix: 'graph.edge.retract',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'graph.strategy.declare',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    actionPrefix: 'graph.strategy.link',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  {
    // CP-6 B1 (0060): the propagation agent — its principal on the identity authority, its
    // grant on the commit authority — is the tenant or platform administrator's act, exactly
    // as the collection and decision agents are; revocation is also the domain administrator's.
    actionPrefix: 'graph.propagation.agent.register',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'graph.propagation.agent.revoke',
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    // Propagation REPORTS; it decides nothing. It is held by the people who own
    // what it reports on — including the collection_manager, because a Phase 1
    // correction is what most often triggers it — and by the AUTOMATIC walker
    // (0060), which holds exactly this decision and no other.
    actionPrefix: 'graph.impact.propagate',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
      { role: 'propagation_agent', atScope: 'DOMAIN' },
    ],
    requiresPurpose: true,
  },
  // ───────────────────────── CP-6 B6 (0063): GraphChanged / MemoryCorrected subscriptions ─────────────────────────
  //   * Registering a subscriber (its principal on the identity authority, its grant on the
  //     commit authority) is the tenant or platform administrator's act, as every agent
  //     registration is; pause, resume and revocation are also the domain administrator's;
  //     a replay is the same set — it moves a cursor and re-drives events, nothing else.
  //   * Each CONSUMER holds EXACTLY its own apply action (exact match, no prefix): the twin
  //     subscriber marks twin versions, the forecast subscriber marks forecasts, …, and none
  //     of them holds any other decision. The ports assert the same action, so a capability
  //     of one kind cannot drive another kind's effect even inside the process.
  {
    actionPrefix: 'graph.subscription.register',
    exact: true,
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'graph.subscription.control',
    exact: true,
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'graph.subscription.replay',
    exact: true,
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  // B20 (0080): a projection partition is WITHDRAWN and REBUILT by an administrator — exact, human-gated (a person answers for a served index).
  { actionPrefix: 'graph.projection.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.projection.rebuild', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.subscription.apply', exact: true, requiredAnyRole: [{ role: 'twin_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.forecast.subscription.apply', exact: true, requiredAnyRole: [{ role: 'forecast_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.subscription.apply', exact: true, requiredAnyRole: [{ role: 'scenario_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.subscription.apply', exact: true, requiredAnyRole: [{ role: 'decision_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.retrieval.subscription.apply', exact: true, requiredAnyRole: [{ role: 'retrieval_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.mapping.subscription.apply', exact: true, requiredAnyRole: [{ role: 'mapping_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B9 (0066 §2): the relationships consumer re-derives a pending inferred relationship for a corrected claim — one exact action, its own role.
  { actionPrefix: 'graph.relationship.subscription.apply', exact: true, requiredAnyRole: [{ role: 'relationship_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B22 (0083): the four consumers of L1-I03, L1-I04, L2-I02 and the attention router — one exact action each, its own role.
  { actionPrefix: 'intelligence.observation.subscription.apply', exact: true, requiredAnyRole: [{ role: 'observation_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'observation.source_health.subscription.apply', exact: true, requiredAnyRole: [{ role: 'source_health_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'intelligence.proposal.subscription.apply', exact: true, requiredAnyRole: [{ role: 'proposal_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.subscription.apply', exact: true, requiredAnyRole: [{ role: 'attention_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /*
   * B22 (0083): THE ATTENTION POLICY is set by a named human (PR-44-003: "humans set policy") — the domain administrator or the
   * executive (the platform administrator at its scope), human-gated. The queue's acts (acknowledge — receipt, not agreement —,
   * suppress with a reason and an expiry, close, escalate the overdue) are open to the domain's human roles at the PDP; the PORT
   * admits only the item's owner or a holder of one of its routed roles (or an administrator). No agent sets policy or suppresses.
   */
  { actionPrefix: 'executive.attention.policy.publish', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.item.acknowledge', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, /* B91 (0105): the commercial items are routed to the tenant administrator, who acknowledges them */ { role: 'tenant_admin', atScope: 'TENANT' }, /* end B91 */ { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.item.suppress', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.item.close', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.escalate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'tenant_admin', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  /*
   * B9 (0066 §3): the Enterprise Memory workspace. Recording is the knowledge owner's (a strategy owner may record too —
   * the strategic record is theirs to keep); superseding and withdrawing are the record authority's, human-gated (PR-20:
   * humans govern the strategic record); retrieval is purpose-declared and audited (audit_access) for every reader who
   * reads the graph, plus the executive and briefing roles that consult memory — the item's own audience and
   * classification are enforced at read time in the service.
   */
  { actionPrefix: 'memory.item.record', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B19 (0079): the DERIVATION of a memory record from a claim version or a warning — the recording roles, HUMAN-GATED: the server computes the content and the provenance; a named person admits it (AG-015's ownership gate — no agent derives).
  { actionPrefix: 'memory.item.derive', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'memory.item.supersede', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B10: the withdrawal of a memory item — the record authority's own named act, the same gate as the supersession.
  { actionPrefix: 'memory.item.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B9 (0066 §9): a typed executive request is a person's command (human-gated) — the executive, the decision and strategy owners, the decision authority, the domain administrator; the responsible owners fulfil; the requester withdraws; a follow-up's owner completes.
  { actionPrefix: 'executive.request', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.request.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.request.fulfil', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.follow_up.complete', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.request.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B9 (0066 §8): a scenario's review is a person's (human-gated); the strategy and forecast owners and the domain administrator.
  { actionPrefix: 'prediction.scenario.review', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B21 (0081, L7-I04): a PERSON's coherence CHECK — the review roles; a check records what the versioned rule finds (the review decides), no gate.
  { actionPrefix: 'prediction.scenario.check', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* B23 (0084) branch */
  // L7-I02 BranchScenario: a branch ADDED to a declared scenario as a new version — the DECLARING roles (prediction.scenario.declare), NOT
  // human-gated because the declaration is not (a branch is a declarer's act of the same kind; the review stays the human-gated judgement).
  // EXACT, and named outside the `prediction.scenario.declare` PREFIX rule (:421), which would otherwise swallow a `…declare.*` action.
  { actionPrefix: 'prediction.scenario.branch', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B23 branch */
  // B9 (0066 §7): ontology change proposals (the people who shape the graph) and the steward's decision (human-gated; the port refuses the proposer).
  { actionPrefix: 'graph.ontology.propose', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.ontology.decide', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* B23 (0084) revision */
  // B23 (0084, L4-I02): a CHANGE SET committed as one graph revision — the knowledge owner (who holds no other graph write) and the resolution
  // manager (the resolver's human) beside the administrators; exact, so no prefix rule answers for it (no earlier prefix is a prefix of it).
  { actionPrefix: 'graph.revision.commit', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B23 revision */
  /*
   * B9 (0066 §4): governed retention. The steward opens, resolves, executes and verifies; the retention authority (a
   * tenant role: the accountable lifecycle authority of DC-14/DZ-18) approves, on the resolved scope's digest; both the
   * approval and the execution are human-gated (a destructive act is a person's, twice); the schedule is the domain
   * administrator's; the ports refuse an opener approving or an approver executing.
   */
  { actionPrefix: 'retention.schedule.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B12 (0072 §1; L3-C08): the cold-tier manager's POLICY — the daily byte budget, the opens per evaluation, the attempts before escalation, the
  // escalation age, the restore window — is the domain administrator's declaration, like the schedule; the steward evaluates and executes under it.
  { actionPrefix: 'retention.tier.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.schedule.evaluate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.action.open', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B11: a withdrawal is its own named act (the retention workspace found the route bound to the opener's action); the same holders.
  { actionPrefix: 'retention.action.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.action.resolve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.action.approve', exact: true, requiredAnyRole: [{ role: 'retention_authority', atScope: 'TENANT' }, { role: 'tenant_admin', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.action.execute', exact: true, requiredAnyRole: [{ role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.action.verify', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'auditor', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'retention_authority', atScope: 'TENANT' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true },
  // B11 (0070 §3; V03-T-047 "revocation where supported"): an export package is revoked by the ACCOUNTABLE AUTHORITY (the retention authority, or an administrator), never by the executor; human-gated.
  { actionPrefix: 'retention.export.revoke', exact: true, requiredAnyRole: [{ role: 'retention_authority', atScope: 'TENANT' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /*
   * B13 (0073): the schedule's RETIREMENT is the schedule declare's holders' (D1); the tenant's export SIGNING KEY is declared and retired by
   * the TENANT's administrator or the platform's, human-gated (D3, C1 — the key is the tenant's, under the route's domain); a DESTINATION
   * (a transfer station, an https endpoint) is the domain administrator's declaration, like the schedule (D5); the DELIVERY and the
   * ACKNOWLEDGEMENT of a package are the accountable authority's, human-gated, as the revocation is (D6); the DOWNLOAD is an audited read
   * of the archive by the steward, the authority, the administrators and the auditor (D7).
   */
  { actionPrefix: 'retention.schedule.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.signing_key.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.signing_key.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.destination.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.destination.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.export.deliver', exact: true, requiredAnyRole: [{ role: 'retention_authority', atScope: 'TENANT' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.export.acknowledge', exact: true, requiredAnyRole: [{ role: 'retention_authority', atScope: 'TENANT' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B14 (0074 §3): a further REVOCATION NOTICE to a destination that received the package — the deliver rule's holders, human-gated (the first notices are the revoke act's own).
  { actionPrefix: 'retention.export.notify', exact: true, requiredAnyRole: [{ role: 'retention_authority', atScope: 'TENANT' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.export.download', exact: true, requiredAnyRole: [{ role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'retention_authority', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /*
   * B16 (0076 §3, §4): the governed IMPORT. An EXCHANGE PARTNER — the key whose packages this domain admits, bound to the intake
   * source contract the imported records are held under — is declared and retired by the administrators (the schedule declare's
   * holders), human-gated: a partner is a standing decision about whose knowledge enters the domain. The import itself is the
   * retention action's gate reproduced (D1): the steward OPENS (the package quarantined, checked, verified) and WITHDRAWS; the
   * retention authority APPROVES on the package digest, human-gated, never the opener (the port refuses); the steward ADMITS,
   * human-gated, never the approver (the port refuses) — two people before a partner's records become this domain's.
   */
  { actionPrefix: 'retention.partner.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.partner.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.import.open', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.import.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.import.approve', exact: true, requiredAnyRole: [{ role: 'retention_authority', atScope: 'TENANT' }, { role: 'tenant_admin', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'retention.import.admit', exact: true, requiredAnyRole: [{ role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  // B17 (0077): the REVOCATION of an admitted import — the origin's revocation executed where the copies are: the tenant's retention authority and
  // administrator (acting across the tenant's domains from the revoke act), the importing domain's steward and administrator (the manual and the foreign path); human-gated.
  { actionPrefix: 'retention.import.revoke', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'retention_authority', atScope: 'TENANT' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'memory.item.retrieve', exact: true, requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' },
      { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* B23 (0084) context */
  // L3-I02 RetrieveContext: the context query is a RETRIEVAL of every item it serves — the same readers as memory.item.retrieve (an
  // EXACT rule: no prefix rule starts with 'memory.context'), audited (audit_access), under a declared purpose, C2. The port asserts
  // the action (memory.retrieve_context), the access ledger admits it (memory.record_access), the projection state admits it.
  { actionPrefix: 'memory.context.retrieve', exact: true, requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' },
      { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B23 context */
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
      // PHASE 2, NARROWLY. An extraction agent must read the bytes it makes claims
      // about, and reading them is NOT something `intelligence.claim.admit` may
      // authorise — that action writes claims. So the agent holds this decision in
      // its own right, at DOMAIN scope, and every read it makes goes through the
      // same manifest-resolved, digest-verified, custody-writing path an operator
      // download uses. The collection agent is still absent: it WRITES evidence
      // and has no business reading the original bytes back out.
      { role: 'extraction_agent', atScope: 'DOMAIN' },
      { role: 'extraction_manager', atScope: 'DOMAIN' },
      // PHASE 4, THE SAME WAY. A series is read out of evidence bytes by a
      // deterministic parser, and the forecaster holds this decision in its own
      // right; every read it makes is manifest-resolved, digest-verified and in
      // custody, with the purpose and the series named on the entry.
      { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'forecast_agent', atScope: 'DOMAIN' },
      // B30 estimation, THE SAME WAY: the Reconciliation Agent reads the series its estimators declare out of the evidence bytes — manifest-resolved,
      // digest-verified and in custody, the purpose and the series named on the entry.
      { role: 'reconciliation_agent', atScope: 'DOMAIN' },
      // B33 supply (0111 §SC2), THE SAME WAY: the Supply Chain Agent reads the shipment / customs / supplier records of a network's declared record
      // sources out of the evidence bytes — manifest-resolved, digest-verified and in custody, the purpose and the network named on the entry.
      { role: 'supply_chain_agent', atScope: 'DOMAIN' },
      // end B33 supply
          { role: 'twin_owner', atScope: 'DOMAIN' },
      { role: 'simulation_operator', atScope: 'DOMAIN' },
      // B9 (0066 §3/§4): the Enterprise Memory and retention roles.
      { role: 'knowledge_owner', atScope: 'DOMAIN' },
      { role: 'record_authority', atScope: 'DOMAIN' },
      { role: 'retention_steward', atScope: 'DOMAIN' },
      { role: 'retention_authority', atScope: 'TENANT' },
      { role: 'ontology_steward', atScope: 'DOMAIN' },
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
    // 0064 (AU-MEM-0039): a LEGAL HOLD on evidence is placed and lifted by the people who answer for the
    // record's retention — the administrators — never by a collection agent or a correction; a withdrawal
    // against a held object fails the case before any object is touched.
    actionPrefix: 'observation.legal_hold.place',
    exact: true,
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
  },
  {
    actionPrefix: 'observation.legal_hold.lift',
    exact: true,
    requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }],
    requiresPurpose: true,
    maxConsequence: 'C2',
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
  /* B23 (0084) stream */
  /*
   * L1-I02's STREAM form: the operator's own acts on a partition's stream — open (or resume by partition), resume a stream by
   * id, interrupt it with a reason — exact rules, the roles that may trigger a collection by hand (the collection agent
   * excluded: the run acts as the agent, the operator's request is the human's). Placed before the catch-all `observation.`
   * rule so it never widens to the agent. The run's own writes ride observation.run.* under that catch-all, unchanged; the
   * reads are observation.read.streams under the `observation.read` rule.
   */
  { actionPrefix: 'observation.stream.open', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'observation.stream.resume', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'observation.stream.interrupt', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B23 stream */
  /* B24 (0086) markers */
  /*
   * F-P6-07 (V03-T-077): SOURCE-IMPACT MARKERS. EXACT rules, placed before the catch-all `observation.` rule (which would otherwise
   * answer `observation.source_impact.read` for the collection roles alone); no prefix rule starts `decision.source_impact`.
   *   * READING the markers (the domain's, grouped by source, or those bearing on one package version) is an audited read for the
   *     people who use or answer for the products they sit on — the decision, strategy, forecast, twin and simulation roles, the
   *     collection manager whose source it is, the executive, the analyst, the administrators and the auditor.
   *   * ACKNOWLEDGING a source impact for one package version is the DECISION AUTHORITY's (the role that commits — the person who
   *     answers for committing on a degraded source; not the decision owner, who drafts and proposes, nor the approver), human-gated;
   *     the port (decision.acknowledge_source_impact) re-checks the role, the acting principal and a named active human.
   */
  { actionPrefix: 'observation.source_impact.read', exact: true, requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' },
      { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.source_impact.acknowledge', exact: true, requiredAnyRole: [{ role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B24 markers */
  /* B34 (0090) gates */
  /*
   * THE HUMAN GATE MADE COMPLETE (F-P6-04; HX-12 "separate review, acknowledgment, approval, rejection, deferral"; HX-13; OBJ-32/-35;
   * FEX-16; PER-01). EXACT rules, every one human-gated and ≤ C2 — no prefix rule matches these names (the `decision.approve`,
   * `decision.review` and `decision.package.` prefixes above are different namespaces; `decision.commit` is exact). The ports re-judge
   * the person: the independent reviewer (ready), the owner / eligible approver / authority (defer, reject, request information,
   * resume), the separation of an override from the version's author, owner and approvers, the delegator's own authority, the
   * committing authority's own preview.
   */
  { actionPrefix: 'decision.gate.review', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.gate.acknowledge', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.gate.ready', exact: true, requiredAnyRole: [{ role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.gate.defer', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.gate.reject', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.gate.request_information', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.gate.resume', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.commit.preview', exact: true, requiredAnyRole: [{ role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.override.grant', exact: true, requiredAnyRole: [{ role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.override.review', exact: true, requiredAnyRole: [{ role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.delegation.grant', exact: true, requiredAnyRole: [{ role: 'decision_approver', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.delegation.end', exact: true, requiredAnyRole: [{ role: 'decision_approver', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.board.reserve', exact: true, requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.control.record', exact: true, requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B34 gates */
  /* B36 (0094) gates */
  /* THE HUMAN GATE COMPLETED (0094 §G; F-P6-04): EXACT rules, every act human-gated and ≤ C2 — no prefix rule matches these names
     (`decision.approve` is a prefix of neither `decision.sign.*` nor `decision.board.*`; `decision.board.reserve` above is exact). The
     signature: an approval by an approver or a board member (its own approval), a decision by its owner or the committing authority.
     Recusal: an approver's or a board member's own act. A challenge: a room member (any decision role) or the tenant's AUDITOR; its
     resolution the owner's. The distribution: the owner or the authority. THE BOARD (PER-01): board_member holds ONLY decision.board.* —
     its approve / reject / defer on a board-class package (the port refuses a standard one) and the board surface's read; no standard
     action (decision.approve, decision.gate.*) admits the role, so a board member's standard act is refused at the PDP. */
  { actionPrefix: 'decision.sign.approval', exact: true, requiredAnyRole: [{ role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.sign.decision', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.recuse', exact: true, requiredAnyRole: [{ role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.challenge', exact: true, requiredAnyRole: [{ role: 'auditor', atScope: 'TENANT' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.challenge.resolve', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.distribute', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.board.approve', exact: true, requiredAnyRole: [{ role: 'board_member', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.board.reject', exact: true, requiredAnyRole: [{ role: 'board_member', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.board.defer', exact: true, requiredAnyRole: [{ role: 'board_member', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.board.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B36 gates */
  /* B28 (0088) remediation */
  /*
   * THE REMEDIATION WORKFLOW ON SOURCE COVERAGE LOSS (the B24 carryover (a)). EXACT rules, placed before the catch-all `observation.`
   * rule (which would otherwise answer every `observation.coverage_remediation.*` action for the collection roles AND the collection
   * agent); no earlier prefix rule matches `observation.coverage_remediation` (`observation.correction.*` and `observation.read` are
   * not its prefixes).
   *   * READING a source's remediations is an audited read for the people who answer for the source and for what rests on it — the
   *     same holders as the source-impact markers' read.
   *   * OPENING, a STEP, CLOSING and WITHDRAWING are HUMAN-GATED acts of the humans who work the attention queue's coverage losses —
   *     the collection manager (the class's route role), the domain administrator (its escalation role), the analyst and the
   *     executive (an item delegated to them); never the collection agent. The PORTS decide the rest: the opener is the item's owner
   *     or a collection_manager; a fallback or a re-collection is recorded by the remediation's owner or a collection_manager; the
   *     gap is accepted by a SECOND person (never the owner) holding collection_manager or domain_admin.
   */
  { actionPrefix: 'observation.coverage_remediation.read', exact: true, requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
      { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' },
      { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'observation.coverage_remediation.open', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'observation.coverage_remediation.step', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'observation.coverage_remediation.close', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'observation.coverage_remediation.withdraw', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B28 remediation */
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
  /* B23 (0084) attention: THE GOVERNED REVIEW (L10-I03). EXACT rules — no prefix rule matches `executive.review.*` (the `decision.review`
     prefix rule above is a different namespace; the room's review stays decision.review). CONVENING is a named human's act (human-gated):
     the executive, the strategy owner, the decision owner and authority, the domain administrator (the platform administrator at its
     scope) — the roles that own an objective, a decision, a scenario, a commitment or its outcome; the PORT re-checks the same roles
     (executive.review_convening_roles). CLOSING is open to the domain's human roles at the PDP (a chair may hold any of them); the PORT
     admits the chair (conclude), the convener or the chair (withdraw), or an administrator. READING is the attention queue's readers. */
  { actionPrefix: 'executive.review.convene', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.review.close', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.review.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B23 attention */
  /* B24 (0086) plan: THE EXTRACTION AGENT (0086 §P) — the principal the selected transformation plans run under. EXACT rules: no earlier
     prefix rule matches `intelligence.extraction.*` (`intelligence.read`, `intelligence.run`, `intelligence.method.*`, `intelligence.claim.admit`,
     `intelligence.review.*` and `intelligence.gateway.call` are other names). Registering and revoking are a NAMED HUMAN's act (human-gated): the
     domain administrator and the extraction manager — who already decide what extraction may run (method approval and activation) — and the
     tenant and platform administrators. Creating the agent's principal stays `identity.principal.create` (tenant / platform administrator); an
     extraction manager or domain administrator registers a principal an administrator provisioned. No agent role holds either action: nothing
     that runs extraction decides who runs it. The RUN itself uses the existing actions under the agent's own session (intelligence.read,
     intelligence.run.*, observation.evidence.retrieve, intelligence.claim.admit — all already held by extraction_agent). */
  { actionPrefix: 'intelligence.extraction.agent.register', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'intelligence.extraction.agent.revoke', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B24 plan */
  /* B24 (0086) timer: THE ATTENTION TICK — the timer host's one action, EXACT (no prefix rule matches `executive.attention.tick`: every
     executive.attention.* rule above is exact). Only the attention agent holds it, under its own session; NO human gate — it is the
     machine's scheduled act (escalate the overdue, plan and drain the deliveries). The human route executive.attention.escalate above
     keeps its human gate; a person never ticks, and the agent never publishes a policy, acknowledges, suppresses or closes. */
  { actionPrefix: 'executive.attention.tick', exact: true, requiredAnyRole: [{ role: 'attention_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B24 timer */
  /* B24 (0086) materiality: THE REBALANCE on an operator's demand — the waiting (overload-deprioritized) items elevated in rank order where
     capacity has freed. EXACT, human-gated, the executive and the domain administrator (the attention tick does the same under its own
     action, executive.attention.tick). No prefix rule matches `executive.attention.rebalance`. Reading the deprioritized view is the
     queue's read (executive.attention.read). */
  { actionPrefix: 'executive.attention.rebalance', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B24 materiality */
  /* B24 (0086) governance: THE QUEUE'S GOVERNANCE (0086 §G). EXACT rules — no rule's prefix is a prefix of these four actions. DECIDING a
     suppression request, DELEGATING an item and RECORDING a disposition are open to the domain's human roles that may acknowledge (the
     acknowledge rule's holders), human-gated; the PORTS decide the person: the decider is never the requester and holds the approver roles
     of the item's policy version; the delegator acts on the item in their own right and the delegate is an active human holding one of these
     roles; a disposition is recorded by a person who may act on the item (its delegate included). EVALUATING the queue is a named human's act
     — the executive or the domain administrator (the platform administrator at its scope), human-gated; the port re-checks the same roles. */
  { actionPrefix: 'executive.attention.suppression.decide', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.item.delegate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, /* B36 home (0094 §H4): the executive operator routes work */ { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.disposition.record', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.queue.evaluate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B24 governance */
  /* B28 (0088) warnings: THE EARLY-WARNING LIFECYCLE (0088 §W; F-P4-12). Every rule EXACT and named outside the two prefix rules of the
     warnings (`prediction.warning.raise`, `prediction.warning.acknowledge` — neither is a prefix of these actions), so no earlier rule answers.
     PROCESSING the candidate intake is the raisers' act (a raise-due candidate is raised in its own write under prediction.warning.raise, whose
     prefix rule admits the forecast owner and the platform administrator): the forecast owner, human-gated — the tick does the same under its
     own action (executive.attention.tick) and never raises in that write — the attention agent raises the owed candidates right after it (0088 §I, under prediction.warning.raise). The CONTEXT and the CLOSURE are the owner's (the port: the warning's routed_to, or a
     domain administrator) among the domain's foresight roles, human-gated. FEEDBACK is any named human of the domain's decision and foresight
     roles, human-gated (the port re-checks a named human). The EVALUATION is the executive's or the domain administrator's, human-gated; its
     list is a read of the same people plus the foresight owners and the auditors. The warnings CONSUMER holds exactly its action. */
  { actionPrefix: 'prediction.warning.candidates.process', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.warning.context.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.warning.close', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.warning.feedback', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.warning.evaluate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.warning.evaluations.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.warning.subscription.apply', exact: true, requiredAnyRole: [{ role: 'warning_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B28 warnings */
  /* B28 (0088) signals: THE WEAK-SIGNAL WORKBENCH (F-P4-10; PR-25-003 "AI may nominate and rank weak signals; humans decide strategic
     relevance, escalation, collection changes, and incorporation into assessments"). EXACT rules — no earlier rule's prefix is a prefix of
     `prediction.signal.*` (`prediction.read`, `prediction.series.register`, … are other names) or of `prediction.indicator.govern|retire|renew`
     (`prediction.indicator.define` and `.evaluate` are other names). NOMINATE and RANK: the domain's analysts and owners, and the Weak Signal
     Agent (its only two actions; no human gate — the agent is a machine; the port records which kind nominated). EVERY OTHER act is a NAMED
     HUMAN's, human-gated: adding evidence (corroboration), the independence test, the disposition, the conditions, the escalation (the
     intake's admitted action, 0088 §0) — the ports refuse the nominator's own disposition. Reading the workbench is prediction.read. THE
     INDICATOR REGISTRY's governance (classification, expiry, review cadence, lineage note; retire; renew): the stewards who may define an
     indicator, human-gated. */
  { actionPrefix: 'prediction.signal.nominate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'weak_signal_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.signal.rank', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'weak_signal_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.signal.evidence.add', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.signal.independence.test', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.signal.dispose', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.signal.conditions.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.signal.escalate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.indicator.govern', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.indicator.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.indicator.renew', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B28 signals */
  /* B28 (0088) streams: THE EVENT-TIME STREAM PROCESSORS (F-P4-11). EXACT rules — no rule's prefix is a prefix of `prediction.stream.*` (the
     prediction prefix rules read prediction.read / .series.register / .forecast.issue / .backtest.record / .outcome.record / .scenario.declare /
     .indicator.define / .indicator.evaluate / .warning.raise / .warning.acknowledge). What an organisation's stream WATCHES FOR is a person's act:
     defining and activating a rule version are human-gated, for the domain administrator, the strategy owner and the forecast owner (the platform
     administrator at its scope); starting a processor and reconciling its offsets are the same roles' operational acts (the collection manager may
     reconcile, the stream's acquisition being theirs); RECOVERING a processor and RETRACTING a signal are human-gated. The stream-rules consumer
     holds exactly prediction.stream.subscription.apply (0088 §0: its role stream_rule_subscriber) — the one action the warning-candidate intake
     admits for a stream. The reads are prediction.read. */
  { actionPrefix: 'prediction.stream.rule.define', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.stream.rule.activate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.stream.processor.start', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.stream.processor.reconcile', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.stream.processor.recover', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.stream.signal.retract', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.stream.subscription.apply', exact: true, requiredAnyRole: [{ role: 'stream_rule_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B28 streams */
  /* B32 (0089) graph: THE STRATEGY GRAPH'S ALIGNMENT, MEASURES AND HUMAN AUTHORITY (F-P6-09; PR-37-003 "AI may detect misalignment and
     recommend options; human authorities set objectives, approve measures and trade-offs, allocate resources"). EXACT rules — no earlier
     rule's prefix is a prefix of these names (`graph.read`, `graph.strategy.declare`, `graph.strategy.link` are other names; nothing reads
     `graph.alignment.` or `graph.measure.`). Declaring or retiring an ALIGNMENT and defining a MEASURE are the planning lead's acts (PER-09:
     the strategy owner, the domain administrator; the platform administrator at its scope), human-gated. OBSERVING a measure is data entry
     for the same roles and the domain's analysts — the port records who, from which claim or evidence. The AUTHORITY ACT (set_objective,
     approve_measure, approve_tradeoff, allocate_resource) is a named human's: the executive, the decision authority, the domain
     administrator, the strategy owner — human-gated (an agent's attempt is refused and its denial recorded); the port names the role and
     refuses the subject's declarer. An OWNER TRANSFER is the strategy owner's or the domain administrator's, human-gated. The READ
     (graph.strategy.alignment.read — the gap view, the detections, the measures, the alignments, the acts) adds the executive and the
     decision roles to the planning roles, audited. No agent role appears in any of them. */
  { actionPrefix: 'graph.alignment.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.alignment.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.measure.define', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.measure.observe', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.strategy.authority.act', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* B34 (0090 §I): an assumption verified (or invalidated) by a person — the planning authority, human-gated */
  { actionPrefix: 'graph.assumption.verify', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.strategy.owner.assign', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.strategy.alignment.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B32 graph */
  /* B32 (0089) health: THE DECOMPOSABLE STRATEGIC HEALTH SCORE (0089 §H; F-P6-08; PR-43-003 "AI may compute and explain; humans approve
     dimensions, measures, weights, thresholds, exceptions, and any decisions based on the score"). EXACT rules — no rule's prefix is a
     prefix of `executive.health.*` (there is no `executive` prefix rule; the executive rules above are all exact). PROPOSING a definition
     is a named human's act (the executive, the domain administrator, the strategy owner; the platform administrator at its scope),
     human-gated; APPROVING or REFUSING it is a SECOND named human's (executive, domain_admin, platform_admin), human-gated — the port
     refuses the proposer. COMPUTING is no decision: the same people and the domain's analysts, not human-gated (the port records who).
     ACKNOWLEDGING and CHALLENGING a score change are the domain's strategy and decision people, human-gated; DECIDING a challenge is the
     executive's or the domain administrator's, human-gated — the port refuses the challenger and the definition's approver. The reads are
     executive.health.read (the decision and strategy people, the analysts, the tenant administrator and the auditor). */
  { actionPrefix: 'executive.health.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.health.definition.propose', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.health.definition.approve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.health.compute', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.health.change.acknowledge', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.health.change.challenge', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.health.change.decide', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B32 health */
  /* B36 (0094 §S) strategy: THE SCORE AND THE STRATEGY GRAPH COMPLETED (F-P6-08 (f)(g)(h), F-P6-09 (b)). EXACT rules — no rule's prefix is a
     prefix of these names (no `executive` or `graph.strategy.authority` prefix rule exists; `graph.strategy.authority.act` is exact and
     another name). SETTING A HEALTH INPUT is the input OWNER's act — the PDP admits the domain's owning roles (the strategy, decision, risk
     and forecast owners, the analysts, the executive and the administrators; the platform administrator at its scope), human-gated; the
     PORT admits the derived owner alone (`health input rejected (ownership)`). REQUESTING an exception is a named human's of the same
     roles, human-gated; APPROVING or refusing it is the EXECUTIVE's authority (executive, domain_admin, platform_admin), human-gated — the
     port refuses the requester. ACCEPTING a snapshot is the EXECUTIVE's (executive, platform_admin), human-gated, signed. REVOKING an
     authority act is a named human's of the planning authority (executive, decision_authority, domain_admin, strategy_owner; the platform
     administrator), human-gated — the port admits the act's issuer or a domain administrator. The tick step raises the detections under
     executive.attention.tick (the attention agent's rule above, unchanged). The reads are executive.health.read and
     graph.strategy.alignment.read (unchanged). No agent role appears in any of them. */
  { actionPrefix: 'executive.health.input.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.health.exception.request', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.health.exception.approve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.health.snapshot.approve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.strategy.authority.revoke', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B36 strategy */
  /* B36 planning (0094 §P): STRATEGIC PLANNING AND INITIATIVE GOVERNANCE (F-P6-10; PR-45-001..006 "AI may draft and propose; the strategy lead
     aligns and prioritises; the executive or the decision authority funds and approves within authority; the baseline is signed; the sponsor
     pauses and closes"). EXACT rules — no earlier rule's prefix is a prefix of `executive.plan.*` or `executive.initiative.*` (there is no
     `executive` prefix rule; every executive rule is exact). PROPOSING an initiative is the ONE act the Planning Agent may perform (no human
     gate on it; the port records the proposer's kind and the approver may never be the proposer); every other transition and every planning
     edit is a named human's, human-gated. The READ (executive.plan.read — the workspace, the replay, the sensitivity) adds the executive,
     the decision roles, the operator, the board member, the analysts, the tenant administrator and the auditor to the planning roles. */
  { actionPrefix: 'executive.plan.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.authority.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.review', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.baseline', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.milestone.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.dependency.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.measure.bind', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.run.attach', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.breach.acknowledge', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.initiative.cite', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.initiative.propose', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'planning_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.initiative.align', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.initiative.prioritise', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.initiative.fund', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.initiative.approve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.initiative.pause', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.initiative.close', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.plan.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'planning_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B36 planning */
  /* B90 prelude (0095 §0): THE DATA PRODUCT REGISTRY CORE (F-P7-F-09/-10/-11; DP-05, DP-41 — "a data product is an accountable operational
     contract"; the owner a named human; the steward registers and curates; a review by someone other than the owner; the OWNER releases).
     EXACT rules — no earlier rule's prefix is a prefix of `products.*` (a new action family). The parts (§R consumers, §E events, §M metrics,
     §K catalog) add their own `products.<part>.*` rules in their own blocks. The READ adds the tenant administrator, the auditor, the
     executive roles, the owners' roles and the planning agent to the steward. */
  { actionPrefix: 'products.product.register', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.review', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.release', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.slo.observe', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'planning_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B90 prelude */
  /* B90 metrics (0095 §M): THE SEMANTIC ANALYTICS LAYER AND CERTIFIED METRICS (F-P7-F-10; DP-44 — "calculated metrics and semantic models
     remain versioned products linked to canonical data"; the OWNER certifies, whoever declared; a steward declares, withdraws and
     recalculates, never certifies — the port refuses it). EXACT rules — no earlier rule's prefix is a prefix of `products.metric.*`.
     DECLARING, WITHDRAWING a certification and RECALCULATING are the owners' roles' and the steward's, human-gated. CERTIFYING is the same
     list (the port admits the owner alone; the steward is listed so the port's own refusal is reachable), human-gated, signed. SERVING is
     an ACCESS MODE (a dashboard's read that records itself): the readers' roles, no human gate, audited as a write. The READ (the models,
     the catalogue) is the registry read's audience. No agent role appears in any of them. */
  { actionPrefix: 'products.metric.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.metric.certify', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.metric.withdraw_certification', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.metric.recalculate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.metric.serve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.metric.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'planning_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B90 metrics */
  /* B90 products (0095 §R): THE PRODUCT REGISTRY COMPLETED (F-P7-F-09's product half; DP-05-006 "consumer acceptance is the consumer's own act",
     DP-41-005/-006 the lifecycle with consumer notification, the contract tests, the scorecard, the cost). EXACT rules — no earlier rule's
     prefix is a prefix of `products.*`. THE CONSUMER acts (register itself, accept, revoke itself, migrate, test) are open to every human
     role that may consume a product (the owners' roles, the decision roles, the executive roles) and to the steward, who registers a
     consumer for a named principal (an agent among them); the port asserts the person. The COST, the SCORECARD and the LIFECYCLE are the
     owner's or the steward's (the port asserts the owner where only the owner acts: restore, withdraw, retire); the tick computes
     scorecards and degrades under its own action (executive.attention.tick). */
  { actionPrefix: 'products.consumer.register', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.consumer.accept', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.consumer.revoke', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.consumer.migrate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.contract_test', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.cost.attribute', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.scorecard.compute', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.degrade', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.restore', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.product.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B90 products */
  /* B90 catalog (0095 §K): THE METADATA CATALOG AND DATA DISCOVERY (F-P7-F-11; DP-49 — "catalog metadata may describe and index authority
     but cannot replace the owning source, contract registry, policy service or canonical object state"). EXACT rules — no earlier rule's
     prefix is a prefix of `products.catalog.*`. The STEWARD (data_steward, with the administrators) catalogues, sets owners, defines terms,
     flags and reconciles; the OWNERS' roles catalogue their own assets, declare lineage on them and RECERTIFY their ownership (the port
     holds the owner rule); the readers of the prelude's product read SEARCH and READ the catalog (DAT-TR-01 "search permission" — the
     port serves discoverable entries within the reader's clearance only). The tick's reconciliation runs under executive.attention.tick. */
  { actionPrefix: 'products.catalog.asset.register', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.catalog.owner.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.catalog.recertify', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.catalog.lineage.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.catalog.term.define', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.catalog.flag', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.catalog.reconcile', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.catalog.search', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'planning_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.catalog.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'planning_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B90 catalog */
  /* B90 events (0095 §E): EVENT PRODUCTS AND SUBSCRIPTIONS (F-P7-F-09's event half; DP-43-001..006 — "subscriptions grant only declared
     data, purpose, time, tenant and consequence scope"; the continuity rule "revoke or pause delivery, preserve offsets, notify the owner,
     require conformance before resumption"). EXACT rules — no earlier rule's prefix is a prefix of `products.*`. The OWNER's acts (declare
     the event product, authorize, pause, resume, revoke) take the prelude's owners' roles and the steward, human-gated; the CONSUMER's acts
     (register, conform, replay) the consumer roles, human-gated; the consumer's ACKNOWLEDGEMENT (checkpoint) is a frequent act of the same
     roles without a gate (the port compares the acting principal to the subscription's consumer); the READ (the consumer's own events,
     a subscription) adds the tenant administrator and the auditor, audit_access. */
  { actionPrefix: 'products.event_product.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.subscription.register', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.subscription.authorize', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.subscription.pause', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.subscription.resume', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.subscription.revoke', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.subscription.conform', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.subscription.replay', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.subscription.checkpoint', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  /* B90-F1 (0096): the consumer's catch-up of its lagging subscription's authorized backlog — the checkpoint's roles, recorded as an access */
  { actionPrefix: 'products.subscription.catch_up', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.subscription.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B90 events */
  /* B27 anatomy (0097 §A; F-P4-07): THE SCENARIO'S ANATOMY — elements (declare/revise, retire), the assumption register (link/unlink), the
     narrative/implication/option records, the branch SUSPENSION (a person's, and the re-application of an invalidated assumption) and the
     REINSTATEMENT. EXACT rules named `prediction.scenario.anatomy.*` — outside the `prediction.scenario.declare` PREFIX rule (:447) and the
     `prediction.read` prefix rule, neither of which is a prefix of these names. The writes are the declaring roles', human-gated (the ports
     require a named active member and compare the acting principal; the reinstatement is the branch's or the scenario's owner's — the port
     says so); the read adds the analyst and the decision and executive roles. */
  { actionPrefix: 'prediction.scenario.anatomy.element', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.anatomy.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.anatomy.assumption', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.anatomy.record', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.anatomy.suspend', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.anatomy.reinstate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.anatomy.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B27 anatomy */
  /* B27 quality (0097 §Q): SCENARIO QUALITY AND GOVERNED BRANCH PROBABILITIES (F-P4-09; L7-C06, AI-49-003/-004, FEX-12). EXACT rules, named
     outside the `prediction.scenario.declare` PREFIX rule (none of these names begins with it) and outside `prediction.read`. THE
     EVALUATION (prediction.scenario.quality.evaluate) is a person's act of the declaring roles, not gated (the v1 check's idiom); THE READ
     (prediction.scenario.quality.read) adds the analyst, the decision owner, the decision authority and the executive; THE MAP and THE
     PROBABILITY (prediction.scenario.probability.{map,set,withdraw}) are human-gated acts of the declaring roles — the port further requires
     the scenario's or the branch's owner (or an administrator) and a method with its basis. The tick's sweep runs under
     executive.attention.tick (the step scenario-quality, order 68). */
  { actionPrefix: 'prediction.scenario.quality.evaluate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.quality.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.probability.map', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.probability.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.probability.withdraw', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B27 quality */
  /* B27 sets (0097 §S): SCENARIO SETS, THE COMPARATOR, THE PORTFOLIO REVIEW, LIVING SCENARIOS, CREATION TRIGGERS (F-P4-08; ADR-012
     "a missing stress branch is flagged before the recommendation is allowed"). EXACT rules, named OUTSIDE the `prediction.scenario.declare`
     PREFIX rule (:447) — no action here starts with `prediction.scenario.declare`, and no earlier prefix rule is a prefix of these names.
     THE SET's acts (declare, member, activate, retire) — the scenario owners and the decision owner beside the administrators, human-gated
     (the port: the set's owner or an administrator). THE CHECK — the set's roles plus the decision authority and the executive, not gated (a
     recorded act, whatever the outcome). THE BINDING — the package's owner (decision_owner) or the strategy owner and the administrators,
     human-gated (the port: the package's owner or an administrator). THE PORTFOLIO REVIEW — a named human: the owners, the decision
     authority, the executive, human-gated. THE RELEVANCE scored by a person (the tick's own step runs under executive.attention.tick). THE
     PROPOSALS — proposed by the scenario and decision roles and the analyst (not gated: an agent granted the action may propose), RESOLVED by
     a strategy owner (or an administrator), human-gated (the port: never the proposer). THE READ — every reading role of the scenarios,
     the auditor and the tenant administrator. No agent role appears here and no new role is added. */
  { actionPrefix: 'prediction.scenario.set.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.set.member', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.set.activate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.set.retire', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.set.check', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.set.bind', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.set.review', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.set.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.relevance.score', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.proposal.propose', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.scenario.proposal.resolve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B27 sets */
  /* B31 impact (0099 §I): IMPACT ANALYSIS (F-P5-07; V00-T-062 "request sensitivity analysis", V01-T-016, L8-C07/-C08, AI-50-005) and the
     comparator's sensitivity (F-P4-08, CAP-DS-02 — read through prediction.scenario.set.read, unchanged). EXACT rules named under
     `simulation.impact.` — no earlier PREFIX rule is a prefix of these names (`simulation.read`, `simulation.run`, `simulation.run.complete`
     and `simulation.reproduce` are not), and none of them is a prefix of another rule's. THE READ (simulation.impact.read — the run's
     impact, the analyses, the assessments; also the first step of a computed analysis) is consequential and audited: the simulation readers
     beside the decision owner, the authority and the executive. THE ANALYSES (sensitivity, second_order) are requested by the people who
     run, own or decide on a run — not gated (an analysis product: the model executes, nothing is decided). THE VALUE OF INFORMATION
     (voi — a recommendation to wait or act, routed to the package owner) and THE PROBABILITY STATEMENT (probability — a simulated frequency
     stated as a probability through an approved map) are a named human's acts, human-gated. No agent role and no new role. */
  { actionPrefix: 'simulation.impact.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.impact.sensitivity', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.impact.second_order', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.impact.voi', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.impact.probability', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B31 impact */
  /* B31 orchestration (0099 §O): SIMULATION EXPERIMENTS — budgets, admission, the background chunks, checkpoints, pause/resume (F-P5-06;
     JRN-14, PR-35-003). EXACT rules; no earlier prefix rule is a prefix of `simulation.experiment.*` (`simulation.read`, `simulation.run`,
     `simulation.reproduce` are other names). DECLARE, START, PAUSE, RESUME and CANCEL — the run's own operators (the simulation.run
     holders); the port further requires, for an operator's act on a started experiment, its declarer, its starter, a twin owner or the
     domain administrator. APPROVE the budget — a named human (human-gated) among the administrators, the strategy owners and the twin
     owners; the port refuses the declarer (separation of duties) and requires the digest of the budget read. EXECUTE — the background
     worker: the domain's attention agent after its tick (the port requires an ACTIVE attention agent of the domain). READ — the
     simulation.read holders. No role is added. */
  { actionPrefix: 'simulation.experiment.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.experiment.approve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.experiment.start', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.experiment.pause', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.experiment.resume', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.experiment.cancel', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.experiment.execute', exact: true, requiredAnyRole: [{ role: 'attention_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.experiment.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B31 orchestration */
  /* B31 validity (0099 §V; F-P5-09, F-P4-07/-09's B31 pieces). EXACT rules named `simulation.validity.*` — outside the `simulation.run` and
     `simulation.read` PREFIX rules (neither is a prefix of these names) and before nothing they share. THE READ (a run's decision use, the
     comparison labelled, a package's run validity, the twin-correction reach, a branch's binding, the assumption sensitivity) — every reading
     role of the twins, the scenarios and the decisions, the auditor and the administrators. THE POLICY (the domain's decision-use gate) — the
     administrators and the decision authority, human-gated. THE BINDING (a branch to its twin state; the port further requires the branch's
     or the scenario's owner) — the scenario and twin owners and the administrators, human-gated. THE REACH identified again by a person — the
     twin owner, the decision owner and the administrators, human-gated. No new role. */
  { actionPrefix: 'simulation.validity.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.validity.policy', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.validity.bind', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.validity.reach', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B31 validity */
  /* B35 analysis (0101 §A): DECISION OPTION ANALYSIS (F-P6-01; F-P5-07's adversarial-response sensitivity; F-P4-08's reversibility and option
     value across futures). EXACT rules named `decision.analysis.*` — no earlier PREFIX rule is a prefix of these names (`decision.approve`,
     `decision.review`, `decision.read`, `decision.package.` and the rest name other actions) and none of them is a prefix of another rule's.
     THE READ (the analysis of a package version; the domain's packages) is consequential and audited: every decision.read holder. THE
     CRITERIA (the weights — a VALUE JUDGMENT) are a named human's, human-gated: the decision owner, the strategy owner, the executive; the
     port further requires the package owner or the current value-judgment owner; the Decision Agent holds no rule here (a weight set by an
     agent is refused at the PDP). AN ASSESSMENT, AN OBLIGATION, AN EVALUATION and AN ADVERSARIAL RESPONSE MODEL are named humans' acts,
     human-gated (the port further requires the obligation's owner for its judgment, the package owner or the obligation owner to declare
     one). GENERATION and ASSEMBLY are drafts the owner reads: the decision owner, the analyst and the Decision Agent (decision_agent) — never
     a write into decision.options. No new role. */
  { actionPrefix: 'decision.analysis.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'reporting_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.analysis.criteria', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.analysis.assess', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.analysis.obligation', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.analysis.evaluate', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.analysis.generate', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.analysis.assemble', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.analysis.adversarial', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B35 analysis */
  /* B35 explanation (0101 §E; F-P6-03: App. L, AI-04-001..004, AI-63-005, AI-64-002..004, AG-040, AR-019, V10-T-007/-008). EXACT rules named
     `decision.explanation.*` and `decision.appeal.*` — no PREFIX rule catches them (`decision.read`, `decision.review`, `decision.replay`,
     `decision.package.` and `decision.approve` are other names; no `decision.` prefix rule exists), so they sit here, after B31's block.
     THE READS (the unified explanation surface, one explanation, the dry faithfulness check; the cases) — every reading role of the
     decisions, the scenarios and the twins, the auditor, the administrators and the decision agent; audited. GENERATE — the decision,
     strategy, forecast and twin roles, the analyst, the auditor, the administrator and the decision agent (the server writes the content; the
     requester is recorded). RENDER — the same holders: the decision agent is the Explainability Agent's stand-in (no explainability role
     exists; B35 adds none) and RENDERS ONLY. OPEN a contest — the roles standing v1 names and the auditor, human-gated (the port refuses an
     agent and a principal without standing). ADJUDICATE (assign and adjudicate) — the bench: decision authority, executive, domain
     administrator, auditor; human-gated; the decision agent holds no appeal write. CLOSE — an opener (the appellant withdraws) or the bench
     (the adjudicator resolves), human-gated; the port decides which. No rule here reaches C3. */
  { actionPrefix: 'decision.explanation.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.explanation.generate', exact: true, requiredAnyRole: [{ role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.explanation.render', exact: true, requiredAnyRole: [{ role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.appeal.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.appeal.open', exact: true, requiredAnyRole: [{ role: 'auditor', atScope: 'TENANT' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.appeal.adjudicate', exact: true, requiredAnyRole: [{ role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.appeal.close', exact: true, requiredAnyRole: [{ role: 'auditor', atScope: 'TENANT' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B35 explanation */
  /* B35 recommendation (0101 §R; F-P6-02, F-P4-09's and F-P5-06's B35 pieces). EXACT rules named `decision.recommendation.*` and
     `decision.incomplete.attest` — no earlier PREFIX rule is a prefix of these names (`decision.read`, `decision.review`, `decision.replay`
     and `decision.package.` are not), so first-match reaches them here; none reaches C3. RECORD — the package owner, an analyst and the
     Decision Agent (decision_agent: author kind agent — it drafts, never reviews), no human gate (an agent records). REVIEW — the owner, the
     approvers, the authority, an executive, an analyst — human-gated (the port further refuses the author and any agent). WITHDRAW — the
     owner and an analyst, human-gated (the port: the author or the package owner). THE HUMAN-LED MODE (attest and acknowledge) — the owner,
     the approvers, the authority, an executive — human-gated (the port: the owner attests, a second human acknowledges). READ — every reading
     role of the decisions, the auditor, the administrators and the Decision Agent. No new role. */
  { actionPrefix: 'decision.recommendation.record', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.recommendation.review', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.recommendation.withdraw', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.recommendation.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.incomplete.attest', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B35 recommendation */
  /* B30 branches (0103 §BR; F-P5-03). EXACT rules — none of these names starts with a twin PREFIX rule's name (twin.read, twin.declare,
     twin.version, twin.version.admit, twin.ground), so placed here they are reached. The ports decide ownership: a twin owner OPENS a merge
     (twin.branch.merge); the twin's OWN owner resolves its diverging keys (twin.branch.reconcile), completes or refuses it, restores a
     checkpoint (twin.branch.restore), freezes or lifts the served snapshot (twin.snapshot.freeze) and sets the freshness SLO
     (twin.freshness.policy). Human-gated where a named human decides the twin's state (reconcile, merge, freeze). The merge's draft, grounding
     and admission and a checkpoint's draft go through the EXISTING actions (twin.version, twin.ground, twin.version.admit); reads are twin.read. */
  { actionPrefix: 'twin.branch.merge', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.branch.reconcile', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.branch.restore', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.snapshot.freeze', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.freshness.policy', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B30 branches */
  /* B30 envelope (0103 §EN; F-P5-04). EXACT rules — none of these names starts with an earlier PREFIX rule's (`twin.read`, `twin.declare`,
     `twin.version.admit`, `twin.version`, `twin.ground`: 'twin.envelope', 'twin.calibration', 'twin.model' and 'twin.ai_context' are not
     under them), so first-match reaches them here; none reaches C3. ADMIT AS EXPLORATORY — a twin owner and the domain administrator reach
     the port, which admits a twin owner ONLY (the administrator's refusal is the port's own, in words: the raised threshold) — human-gated.
     CONCUR — a method steward, human-gated (the port: neither the admitter nor the run's operator). CALIBRATE — a twin owner, a method
     steward, the domain administrator, and the attention agent (the tick). THE MODEL'S LIFECYCLE and compatibility — a method steward and
     the domain administrator reach the port, which admits a method steward only — human-gated. THE AI CONTEXT — every reader of twin state
     (the `twin.read` set) and the agents that consume it (decision, briefing, supply chain, reconciliation, attention). No new role. */
  { actionPrefix: 'twin.envelope.admit', exact: true, requiredAnyRole: [{ role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.envelope.concur', exact: true, requiredAnyRole: [{ role: 'method_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.calibration.run', exact: true, requiredAnyRole: [{ role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.model.lifecycle', exact: true, requiredAnyRole: [{ role: 'method_steward', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.ai_context.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'constraint_steward', atScope: 'DOMAIN' },
    { role: 'decision_agent', atScope: 'DOMAIN' }, { role: 'briefing_agent', atScope: 'DOMAIN' }, { role: 'supply_chain_agent', atScope: 'DOMAIN' }, { role: 'reconciliation_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B30 envelope */
  /* B30 estimation (0103 §ES; F-P5-02). EXACT rules named `twin.estimator.*`, `twin.estimate.*`, `twin.estimation.*` and `twin.observation.*` —
     none falls under an earlier PREFIX rule (`twin.read`, `twin.declare`, `twin.version.admit`, `twin.version`, `twin.ground` are not prefixes
     of these names), so first-match reaches them here. READ — the twin readers, the auditor, the administrators and the Reconciliation Agent
     (audited). DECLARE an estimator (and retire it) — a twin owner (the port: the twin's own owner). PROPOSE — a twin owner, an analyst, a
     simulation operator and the Reconciliation Agent (no human gate: an agent proposes; the port binds an agent to its running scan). DECIDE —
     a twin owner, human-gated (the port: the twin's own owner, never the proposer; the approval opens the snapshot through the version, ground
     and admit ports, which serve this action). REQUEST observations — the proposers. TRIGGER — the attention agent only (after its tick). */
  { actionPrefix: 'twin.estimation.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
    { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'constraint_steward', atScope: 'DOMAIN' },
    { role: 'reconciliation_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true },
  { actionPrefix: 'twin.estimator.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.estimate.propose', exact: true, requiredAnyRole: [{ role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' },
    { role: 'reconciliation_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.estimate.decide', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.observation.request', exact: true, requiredAnyRole: [{ role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' },
    { role: 'reconciliation_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.estimation.trigger', exact: true, requiredAnyRole: [{ role: 'attention_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B30 estimation */
  /* B30 experiments (0103 §EX; F-P5-06's and F-P5-07's B30 pieces). EXACT rules — none is caught by an earlier PREFIX rule (`simulation.read`,
     `simulation.run`, `simulation.run.complete` and `simulation.reproduce` are not prefixes of `simulation.experiment.policy`,
     `simulation.adapter.quarantine`, `simulation.retirement.*`, `simulation.sweep.run`, `simulation.benchmark.validate` or
     `simulation.fabric.read`), and none is a prefix of another rule's. THE POLICY of an experiment at an unstable checkpoint — the declaring
     and operating roles (the port further requires the declarer, the starter, a twin owner or the administrator). THE QUARANTINE on demand —
     a method steward, human-gated (B29's reinstate idiom). THE RETIREMENT of a run or an experiment — a named human, human-gated (the port
     further requires the operator / declarer, the twin's owner, a twin owner or the administrator). THE SWEEP and THE BENCHMARK VALIDATION —
     analysis products requested by the people who run, own, steward or decide on a run (not gated: the model executes, nothing is decided).
     THE READ — consequential and audited: the simulation readers, the method steward, the decision owner and authority. No new role. */
  { actionPrefix: 'simulation.experiment.policy', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.adapter.quarantine', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'method_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.retirement.run', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.retirement.experiment', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.sweep.run', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.benchmark.validate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'simulation.fabric.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B30 experiments */
  /* B91 entitlements (0105 §EN; F-P7-F-01). EXACT rules — no earlier rule starts with `commercial` (grep), and none of these names is a prefix
     of another rule's. THE VENDOR'S ACTS — the capability catalogue, the offers, packages and SKUs, a tenant's licence version and its
     contract scope — are the commercial authority's (PLATFORM: availability only, never business authority), each human-gated (a named
     human at session assurance; an agent never assigns, raises or lifts an entitlement). THE READ — consequential and audited: the
     commercial authority (any tenant, PLATFORM), the tenant administrator and the auditor (TENANT), and the domain roles that read the
     explanation of an unavailable capability (DOMAIN). The availability GATE itself is not a rule: it runs in the pipeline after the
     PDP's allow (the PDP stays pure). */
  { actionPrefix: 'commercial.capability.declare', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.offer.declare', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.offer.package', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.offer.sku', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.licence.issue', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.contract.declare', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.read', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B91 entitlements */
  /* B91 grace (0105 §GR; F-P7-F-01 clauses 4–5: FEX-30, PR-66-005/006, AT-66, UX-67). EXACT rules — no earlier rule starts with `commercial`
     (checked) and none of these names is a prefix of another rule's. THE TRANSITIONS of a licence version's state (renew, suspend, reinstate),
     THE GRACE POLICY and THE OFFLINE TOKEN are the vendor's COMMERCIAL AUTHORITY's (PLATFORM; the prelude's role — availability only, never
     business authority), human-gated: an agent never renews, lifts or raises an entitlement (the tick's lapse runs under the attention agent's
     executive.attention.tick, which moves a licence only towards LESS availability and lifts nothing). THE READ — consequential and audited:
     the commercial authority (every tenant), the tenant administrator and the auditor (the tenant's standing), and the domain roles that read
     the simulation and decision workspaces (the entitlement explanation banner). The platform administrator is not named: technical access
     only. No new role. */
  { actionPrefix: 'commercial.licence.renew', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.licence.suspend', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.licence.reinstate', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.grace.set', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.offline_token.issue', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.grace.read', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' },
    { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' },
    { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B91 grace */
  /* B91 ledger (0105 §LE; F-P7-F-02: the cost ledger, budgets, reconciliation, optimisation). EXACT rules — no earlier rule starts with
     `commercial`, and none of these names is a prefix of another rule's (the other B91 parts' `commercial.*` actions are their own exact
     names). THE VENDOR'S RECORDS — the rate cards, a tenant's allocation key, the invoices (SYNTHETIC only here), their reconciliation and
     the optimisation decisions — are the commercial authority's (PLATFORM), human-gated; the port further requires a named, active human
     holding commercial_authority, and refuses an optimisation that touches a protected control. THE BUDGET — the tenant administrator
     declares it; a revision by the administrator or the budget's owner (the port decides which), so the owner's usual roles reach the
     port; human-gated (an agent never sets, lifts or raises a budget). THE READ — consequential and audited: the commercial authority, the
     tenant administrator, the auditor, the executive and the domain's budget-holding roles. No platform_admin row: cost governance is not
     technical access. No new role. */
  { actionPrefix: 'commercial.rate.set', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.allocation.set', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.invoice.import', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.invoice.reconcile', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.optimisation.record', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.budget.set', exact: true, requiredAnyRole: [{ role: 'tenant_admin', atScope: 'TENANT' }, { role: 'executive', atScope: 'DOMAIN' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.ledger.read', exact: true, requiredAnyRole: [{ role: 'commercial_authority', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
    { role: 'executive', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
    { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B91 ledger */
  /* B91 meters (0105 §ME; F-P7-F-02's meters and caps). EXACT rules — no earlier rule starts with `commercial` and neither name is a prefix of
     another rule's. THE READ of the meters and caps (commercial.usage.read) — consequential and audited: the tenant's administrator and
     auditor, the vendor's commercial authority (PLATFORM: the meters it reconciles; availability, never business authority), the domain's
     administrator and executive, and the people whose work a cap can stop (twin owner, simulation operator, strategy owner). THE CAP
     (commercial.cap.set) — the tenant's administrator only, human-gated (an agent never sets, raises or lifts a cap); the port further
     requires a named human tenant administrator acting at the tenant's own scope and bounds the cap by the licence's limit. */
  { actionPrefix: 'commercial.usage.read', exact: true, requiredAnyRole: [{ role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'commercial_authority', atScope: 'PLATFORM' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'commercial.cap.set', exact: true, requiredAnyRole: [{ role: 'tenant_admin', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B91 meters */
  /* B25 context (0108 §CX; F-P4-03, V03-T-196). EXACT rules — no prefix rule is a prefix of these names (`prediction.read`,
     `prediction.forecast.issue` and the other prediction prefixes read other words; `prediction.forecast.replay` does not start with
     `prediction.forecast.issue`). FREEZING an information set is the issuing roles' act (the forecast owner, the forecast agent — a job may
     ground what it issues — and the platform administrator): no human gate, the set is evidence of what was known, not a judgement. The
     grounded issue itself is `prediction.forecast.issue` (the existing prefix rule). REPLAYING a grounded forecast records a ledger row and
     an event: the forecast owner, the forecast agent, the domain's administrator and the platform administrator. READING sets, groundings
     and replays is consequential and audited: the prediction.read roles. */
  { actionPrefix: 'prediction.information_set.freeze', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'forecast_agent', atScope: 'DOMAIN' }],
    requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.forecast.replay', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'forecast_agent', atScope: 'DOMAIN' }],
    requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.information_set.read', exact: true, requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'forecast_agent', atScope: 'DOMAIN' },
      { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B25 context */
  /* B25 registry (0108 §MR; F-P4-01: L6-C03, V03-T-125, V03-T-320, MC-012/-013/-015). EXACT rules. Checked against every earlier rule a
     `prediction.` name could fall under: the prefix rules are prediction.read, .series.register, .forecast.issue, .backtest.record,
     .outcome.record, .scenario.declare, .indicator.define, .indicator.evaluate, .warning.raise, .warning.acknowledge — none is a prefix of
     a `prediction.registry.*` or `prediction.portfolio.issue` name (prediction.read is not a prefix of prediction.registry.read), so these
     rules are reached here, after the B91 blocks. THE READS (registry, plan) — consequential and audited: the forecasting and steering
     roles and the analysts. PROPOSE (an entry) and DECLARE (a target) — a forecast owner, a steward, an administrator, or the forecast
     AGENT (AI drafts and proposes); not gated. APPROVE an entry, RETIRE / QUARANTINE / REINSTATE one, APPROVE a target, PUBLISH a horizon
     policy and CONCUR with it — named humans only (human_gate): the method steward approves and reinstates entries and concurs with
     policies; a forecast owner or administrator approves targets and publishes policies; the ports add the named steward, the separation of
     duties and the acting principal. RECORD A VALIDATION — the forecast owner, the agent, the steward, an administrator. THE ROUTED ISSUE
     (prediction.portfolio.issue, NOT under the issue prefix) — the roles of prediction.forecast.issue (an agent may issue; the policy and
     the registry decide what it may claim). Every action is under the `foresight` capability prefix (B91's gate on a contracted tenant). */
  { actionPrefix: 'prediction.registry.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
    { role: 'forecast_agent', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' },
    { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.plan.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
    { role: 'forecast_agent', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' },
    { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.method.propose', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
    { role: 'forecast_agent', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.method.approve', exact: true, requiredAnyRole: [{ role: 'method_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.method.retire', exact: true, requiredAnyRole: [{ role: 'method_steward', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.method.quarantine', exact: true, requiredAnyRole: [{ role: 'method_steward', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.method.reinstate', exact: true, requiredAnyRole: [{ role: 'method_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.target.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
    { role: 'forecast_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.target.approve', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.policy.publish', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.policy.concur', exact: true, requiredAnyRole: [{ role: 'method_steward', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.registry.validation.record', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
    { role: 'forecast_agent', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.portfolio.issue', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'forecast_agent', atScope: 'DOMAIN' }],
    requiresPurpose: true, maxConsequence: 'C2' },
  /* end B25 registry */
  /* B25 ensembles (0108 §EN; F-P4-02: the Ensemble and Disagreement Manager, the judgement overlay). EXACT rules — no earlier rule is a
     prefix of these names (`prediction.forecast.issue` is a prefix rule but `prediction.ensemble.*` / `prediction.overlay.*` are not under
     it; `prediction.read` is the forecast readers' and is not a prefix of `prediction.ensemble.read`). THE ISSUE — the forecasters who issue
     forecasts (the owner, the forecast agent: AI may run an ensemble; the route's issuance step is ALSO authorized under
     prediction.forecast.issue, the prelude port's own action). THE READ — the forecast's readers, audited. THE OVERLAY — a named human
     forecast owner only, human-gated (an agent never authors a judgement); its WITHDRAWAL the owner or the domain's administrator,
     human-gated. The ports re-check the human and the role. */
  { actionPrefix: 'prediction.ensemble.issue', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'forecast_agent', atScope: 'DOMAIN' }],
    requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.ensemble.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
    { role: 'forecast_agent', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' },
    { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.overlay.add', exact: true, requiredAnyRole: [{ role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.overlay.withdraw', exact: true, requiredAnyRole: [{ role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* B25-F1 (0109): RECONCILE a finished run's route left `planned` before 0109 — a named human forecast owner or the domain's administrator,
     human-gated (an agent runs ensembles, it does not close their ledger); EXACT, under no prefix rule. The port re-checks the human and the role. */
  { actionPrefix: 'prediction.ensemble.route.reconcile', exact: true, requiredAnyRole: [{ role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B25 ensembles */
  /* B33 (0111 §0.10) — THE PARTS' BLOCKS, filled by each part with EXACT rules (first match wins at BUNDLE_V1.find). Grep every prefix rule a name
     falls under before placing it: `twin.read`, `twin.declare`, `twin.version.admit`, `twin.version`, `twin.ground`, `twin.proposal.draft` (exact),
     `agent.*`, `simulation.read`, `simulation.run`, `graph.read`, `graph.entity.create`, `graph.edge.assert` … — a rule placed here under such a
     prefix is NEVER reached: put an exact rule in a `B33 <part>` marked mini-block BEFORE that prefix line instead. No `domain.` rule exists
     before B33: §PK's and §CI's `domain.*` rules go in their blocks below. Every non-exempt `domain.*` write is gated by the `domain_package`
     capability on a contracted tenant (0111 §0.7); a human-gated rule (obligations: [{ type: 'human_gate' }]) is exempt. */
  /* B33 twin — no rule: §TW adds no action (it extends twin.branch.merge, twin.ground, twin.estimate.decide, twin.coupling.apply and
     simulation.run under their existing rules). */
  /* end B33 twin */
  /* B33 supply (0111 §SC) — supply-chain intelligence, every name EXACT under `twin.supply.` (no `twin.` prefix rule covers it: the prefixes are
     twin.read, twin.declare, twin.version.admit, twin.version, twin.ground). The READ (the workspace, the network's uncertainty, the inferences,
     disruptions, maps, alternatives) to the twin's readers, the risk and decision owners, the Supply Chain Agent (its scan) and the attention
     agent (the after-tick hook's pending check). The AGENT drafts inferences, proposes disruptions and re-maps them; a NAMED DOMAIN ANALYST
     validates (human-gated; the port re-checks the role, the human, the separation from the scan's requester); the twin's OWNER names record
     sources and applies (human-gated); a PERSON confirms, closes and maps a disruption and evaluates an option — never the agent (the ports). */
  { actionPrefix: 'twin.supply.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'supply_chain_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true },
  { actionPrefix: 'twin.supply.records.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.supply.inference.draft', exact: true, requiredAnyRole: [{ role: 'supply_chain_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.supply.inference.validate', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.supply.inference.apply', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.supply.disruption.open', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'supply_chain_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.supply.disruption.confirm', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.supply.disruption.close', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.supply.disruption.map', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'supply_chain_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'twin.supply.alternative.evaluate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B33 supply */
  /* B33 packages */
  /* B33 packages (0111 §PK; F-P4-15 ch.31/36, WS-10): EXACT rules — no `domain.` prefix rule exists, and none of these names is a prefix of
     §CI's `domain.competitor.*`. THE READ (domain.package.read: packages, facts, assessments, watchlists, alerts, the gate) is audited, open to
     the domain's readers, the Domain Intelligence Agent and the attention agent (the health hook). THE OWNER'S acts (declare, version) and the
     run of the suite (conformance — the agent's run is diagnostic, the port says so; acceptance), the health re-check (the attention agent's
     hook too). HUMAN-GATED (a named human; exempt from the entitlement gate by design): a section's approval, the certification and the
     re-enablement (domain_specialist only), the activation and retirement (the owner — the port re-checks), an assessment's approval and
     limitation, an event's confirmation, an alert's adjudication and resolution. The agent PROPOSES assessments and events; it never approves,
     certifies, confirms or adjudicates. Every non-exempt domain.* write is gated by the domain_package capability on a contracted tenant. */
  { actionPrefix: 'domain.package.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'method_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'domain_intelligence_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.declare', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.version', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.approve', exact: true, requiredAnyRole: [{ role: 'domain_specialist', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.certify', exact: true, requiredAnyRole: [{ role: 'domain_specialist', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.activate', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.retire', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.withdraw', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.conformance', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_intelligence_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.acceptance', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.health', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.package.enable', exact: true, requiredAnyRole: [{ role: 'domain_specialist', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.assessment.propose', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_intelligence_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.assessment.approve', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.assessment.limit', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.watchlist.declare', exact: true, requiredAnyRole: [{ role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.watchlist.retire', exact: true, requiredAnyRole: [{ role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.event.record', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_intelligence_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.event.confirm', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.alert.adjudicate', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.alert.resolve', exact: true, requiredAnyRole: [{ role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.link.declare', exact: true, requiredAnyRole: [{ role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.link.withdraw', exact: true, requiredAnyRole: [{ role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B33 packages */
  /* B33 competitor */
  /* B33 competitor (0111 §CI; F-P4-15 ch.29, JRN-10, CAP-FW-06). EXACT rules — no earlier rule is a prefix of `domain.competitor.*`
     (no `domain.` rule exists before B33; §PK's are exact too). THE READ (domain.competitor.read) — audited: the analysts, the strategy lead, the
     executives, the decision roles, the twin owners, the domain specialists, the Domain Intelligence Agent (its scan's one read) and the
     attention agent (the after-tick hook's pending check). DECLARE — an analyst, a strategy owner, the domain's administrator. PROPOSE —
     AI proposes: the agent (the port admits it only inside its own running domain_scan) and the analysts / strategy owners. THE MATERIAL
     ASSESSMENT APPROVAL — a NAMED ANALYST only, human-gated (the port re-checks the human, the role, the separation from the proposer and the
     digest; an agent holds no rule here and its attempt is refused and recorded on its run). REVALIDATE — an analyst or the agent. COMPARE —
     the analysts, strategy owners and the agent (AI may compare). WATCHLIST — a strategy owner or an analyst. CHALLENGE and its DECISION —
     named humans, human-gated (another analyst decides). DECISION USE — the decision roles, human-gated (the response is the decision
     layer's). THE TWIN (CI8) — the twin's owner binds and decides (the port re-checks ownership). Every non-exempt `domain.*` write is gated
     by `domain_package` on a contracted tenant (0111 §0.7); the human-gated rules and the read are exempt. */
  { actionPrefix: 'domain.competitor.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'domain_specialist', atScope: 'DOMAIN' }, { role: 'domain_intelligence_agent', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.declare', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.propose', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_intelligence_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.assessment.approve', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.revalidate', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'domain_intelligence_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.compare', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_intelligence_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.watchlist', exact: true, requiredAnyRole: [{ role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.challenge', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.challenge.decide', exact: true, requiredAnyRole: [{ role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.decision.cite', exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.twin.bind', exact: true, requiredAnyRole: [{ role: 'twin_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'domain.competitor.twin.decide', exact: true, requiredAnyRole: [{ role: 'twin_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B33 competitor */
  /* B92 §0 */
  /* B92 §0 (0113 §0.7–§0.9; F-P7-F-03). EXACT rules — no `analytics` prefix rule exists. THE READ (analytics.read: definitions, purposes,
     scopes, results with their records, the registry, comparisons, the experience workspace, the operating review) is consequential and
     audited: the analytics roles, the executives and the decision, strategy, risk and forecast owners an operating review serves, the data
     steward, the auditor and the attention agent. COMPUTE — an analyst, the owner, or the attention agent (AI may compute; it never approves).
     REPLAY — an analyst, the owner, the auditor. Every non-exempt `analytics.*` write is gated by `product_analytics` on a contracted tenant
     (0113 §0.4); the human-gated rules and the read are exempt. The parts' rules follow in their blocks. */
  { actionPrefix: 'analytics.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }, { role: 'privacy_officer', atScope: 'DOMAIN' }, { role: 'product_analyst', atScope: 'DOMAIN' },
    { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' },
    { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.metric.compute', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' },
    { role: 'attention_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.metric.replay', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' },
    { role: 'auditor', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B92 §0 */
  /* B92 definitions */
  /* B92 §MD (0113_b92_x_md; PR-70-002/-003, CAP-DL-11, V01-T-040, DP-44-005). EXACT rules. PROPOSALS (purpose, scope, definition) — a product analyst or
     the product analytics owner; the PORT also requires a named HUMAN (an agent holding the role is refused there: a definition is a human's proposal).
     DECISIONS and RETIREMENTS are human-gated: a purpose by the PRIVACY OFFICER (the privacy and minimisation review), a scope and a definition by the
     PRODUCT ANALYTICS OWNER — the port re-checks the role, the human and that the decider is not the proposer. USES — those who cite a result in a review,
     a package, a briefing, a publication, an export or a finding (the port re-checks; ES-40-008's qualification is the port's). products.metric.use —
     those who cite a B90 serving (DP-44-005; the readers of B90's serve rule who author packages, briefings and publications). */
  { actionPrefix: 'analytics.purpose.propose', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.purpose.decide', exact: true, requiredAnyRole: [{ role: 'privacy_officer', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.purpose.retire', exact: true, requiredAnyRole: [{ role: 'privacy_officer', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.scope.propose', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.scope.decide', exact: true, requiredAnyRole: [{ role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.scope.retire', exact: true, requiredAnyRole: [{ role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.definition.propose', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.definition.decide', exact: true, requiredAnyRole: [{ role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.definition.retire', exact: true, requiredAnyRole: [{ role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.use.record', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' },
    { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' },
    { role: 'forecast_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.metric.use', exact: true, requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
    { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' },
    { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }],
    requiresPurpose: true, maxConsequence: 'C2' },
  /* end B92 definitions */
  /* B92 computations-a */
  /* end B92 computations-a */
  /* B92 computations-b */
  /* B92 §MCB (0113_b92_x_mcb.sql §MCB.1–§MCB.2; MET-009, MET-014). EXACT rules — no `analytics` prefix rule exists. TEMPORAL DECLARE — the
     domain's product analytics owner declares which time fields a record of an object type must carry (MET-009's requirement): a named
     human, human-gated (the port re-checks the human and the role). SEARCH REVIEW — a product analyst or the owner reviews a recorded
     search's results (MET-014): a named human, human-gated; the port re-checks the human, the role and that the reviewer is NOT the
     searcher. An agent holds neither rule. Both are human-gated — exempt from the product_analytics entitlement gate (0113 §0.4). The reads
     are the prelude's analytics.read. */
  { actionPrefix: 'analytics.temporal.declare', exact: true, requiredAnyRole: [{ role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.search.review', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B92 computations-b */
  /* B92 comparability */
  /* B92 comparability (0113 §CO; PR-70-005, PR-70-006, AT-70, DP-44-001). EXACT rules — no `analytics` or `products` prefix rule exists. THE
     COMPARISON (analytics.comparison.run) — an analyst, the owner or the attention agent (AI may compute; the port records the comparison
     under the acting principal and decides comparability itself). THE COST RECONCILIATION (analytics.reconciliation.run) — an analyst or the
     owner. THE SEMANTIC OBJECTS (DP-44-001, B90's layer): DECLARE — a data steward or a product analyst, human-gated (an agent never declares
     semantics; the port re-checks the human and the role); CERTIFY — the object's OWNER (a product analytics owner), human-gated (the port
     re-checks the owner, the separation from the version's declarer, the digest and the expiry); WITHDRAW — the owner or a data steward,
     human-gated; READ (products.semantic.read) audited — B90's metric readers and the analytics roles. Every non-exempt `analytics.*` write
     is gated by `product_analytics` on a contracted tenant (0113 §0.4); the human-gated rules and the reads are exempt. */
  { actionPrefix: 'analytics.comparison.run', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' },
    { role: 'attention_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.reconciliation.run', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }],
    requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.semantic.declare', exact: true, requiredAnyRole: [{ role: 'data_steward', atScope: 'DOMAIN' }, { role: 'product_analyst', atScope: 'DOMAIN' }],
    obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.semantic.certify', exact: true, requiredAnyRole: [{ role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.semantic.withdraw', exact: true, requiredAnyRole: [{ role: 'product_analytics_owner', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }],
    obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'products.semantic.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }, { role: 'privacy_officer', atScope: 'DOMAIN' },
    { role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' },
    { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B92 comparability */
  /* B92 experience */
  /* B92 §UX (0113_b92_x_ux; UX-70-001..006, CAP-PD-09; D12–D14). EXACT rules. THE PERSON'S OWN acts — consent (grant, withdraw: human-gated,
     a named human's own act; withdrawal is never licence-gated: a `withdraw` segment), the self read (their consent and the instrumentation
     catalogue) and the assignment read (their arm, the control without consent), and the RECORDING of a telemetry event (NOT human-gated,
     licence-gated) — are open to every HUMAN role of the domain (the identity.self.read list less its agents and the external collaborator:
     an agent has no consent to give and no experience to measure; the ports re-check the human and the consent). DEFINE telemetry, journeys,
     segments, baselines, thresholds and experiments: the product analyst and the owner. THE PRIVACY OFFICER (human-gated): the privacy and
     minimisation review, hold, release, the purge; retirement also by the owner. THE OWNER (human-gated): thresholds' decision and
     retirement, an experiment's approval (with the privacy officer — two approvals, two people), its conclusion, the action a finding leads
     to, the export. FINDINGS are proposed by an analyst, the owner or the attention agent (AI may propose); an agent is refused deciding at
     the PEP (no rule) AND at the port. The workspace reads, the preview and the export download are `analytics.read` (the prelude's). */
  ...((): Rule[] => {
    const H = ['domain_admin', 'domain_analyst', 'collection_manager', 'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'extraction_manager', 'resolution_manager',
      'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator', 'knowledge_owner', 'record_authority', 'retention_steward', 'ontology_steward', 'risk_owner',
      'opportunity_sponsor', 'execution_authority', 'method_steward', 'constraint_steward', 'executive_operator', 'board_member', 'data_steward', 'domain_specialist',
      'product_analytics_owner', 'privacy_officer', 'product_analyst'].map((role) => ({ role, atScope: 'DOMAIN' as Scope }));
    const person = [{ role: 'tenant_admin', atScope: 'TENANT' as Scope }, { role: 'auditor', atScope: 'TENANT' as Scope }, { role: 'retention_authority', atScope: 'TENANT' as Scope }, ...H];
    const analyst = [{ role: 'product_analyst', atScope: 'DOMAIN' as Scope }, { role: 'product_analytics_owner', atScope: 'DOMAIN' as Scope }];
    const owner = [{ role: 'product_analytics_owner', atScope: 'DOMAIN' as Scope }];
    const privacy = [{ role: 'privacy_officer', atScope: 'DOMAIN' as Scope }];
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    return [
      r('analytics.consent.read', person, [{ type: 'audit_access' }]),
      r('analytics.consent.grant', person, gate),
      r('analytics.consent.withdraw', person, gate),
      r('analytics.telemetry.record', person),
      r('analytics.experiment.assignment.read', person, [{ type: 'audit_access' }]),
      r('analytics.telemetry.define', analyst),
      r('analytics.telemetry.review', privacy, gate),
      r('analytics.telemetry.hold', privacy, gate),
      r('analytics.telemetry.release', privacy, gate),
      r('analytics.telemetry.retire', [...privacy, ...owner], gate),
      r('analytics.telemetry.purge', privacy, gate),
      r('analytics.experience.journey.declare', analyst),
      r('analytics.experience.segment.declare', analyst),
      r('analytics.experience.baseline.record', analyst),
      r('analytics.experience.threshold.propose', analyst),
      r('analytics.experience.threshold.decide', owner, gate),
      r('analytics.experience.threshold.retire', owner, gate),
      r('analytics.experiment.propose', analyst),
      r('analytics.experiment.approve', [...owner, ...privacy], gate),
      r('analytics.experiment.analyse', analyst),
      r('analytics.experiment.conclude', owner, gate),
      r('analytics.experience.finding.propose', [...analyst, { role: 'attention_agent', atScope: 'DOMAIN' as Scope }]),
      r('analytics.experience.action.decide', owner, gate),
      r('analytics.export.create', owner, gate),
    ];
  })(),
  /* end B92 experience */
  /* B92 integration (0113 §I): exceptions and manual adjustments — proposed by an analyst or the owner; DECIDED by a named product analytics owner
     (human-gated; the port re-checks the role and that the decider is not the proposer). */
  { actionPrefix: 'analytics.exception.propose', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.exception.decide', exact: true, requiredAnyRole: [{ role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.adjustment.propose', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.adjustment.decide', exact: true, requiredAnyRole: [{ role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B92 integration */
  /* B92 review */
  /* B92 §OR (0113_b92_x_or; PR-70-001 — the operating review). EXACT rules — no `analytics` prefix rule exists. OPEN and ASSEMBLE — an
     analyst, the product analytics owner, an executive, a strategy owner (assembling CITES results; it computes nothing). NOTE — the review's
     participants by role (the analytics roles, the executives, the strategy, risk, decision and forecast owners, the decision authority); the
     port admits the chair or a holder of one of the review's participant roles, a named human. HOLD, DECIDE (the follow-through) and CLOSE (the
     signed, digest-bound close) — the chair roles (executive, strategy owner, product analytics owner), HUMAN-GATED; the port re-checks that the
     actor IS the review's chair and a human. No agent holds a rule here. The reads (the list, the review, the series) are analytics.read. On a
     contracted tenant open / assemble / note are gated by `product_analytics`; the human-gated acts and the reads are exempt. */
  { actionPrefix: 'analytics.review.open', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' },
    { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.review.assemble', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' },
    { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.review.note', exact: true, requiredAnyRole: [{ role: 'product_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' },
    { role: 'privacy_officer', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' },
    { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.review.hold', exact: true, requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
    { role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.review.decide', exact: true, requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
    { role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'analytics.review.close', exact: true, requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' },
    { role: 'product_analytics_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B92 review */
  /* B94 §0 */
  /* B94 §0 (0114; F-P7-F-04/-05/-06). EXACT rules — no `onboarding`, `implementation` or `service` prefix rule exists. THE READS are
     consequential and audited: onboarding.read (programmes, steps, baselines, waves, mappings, rehearsals, cutovers, acceptances),
     implementation.read (the programme, readiness and the gate, training and competence coverage — a person's own training and competence
     records are filtered to the subject, the assessor and the authorities by the PORT), service.read (cases, problems, bundles, matrices, the
     owner resolution, grants and the access log, the control center). TENANT roles read at the tenant; DOMAIN roles in their domain. A
     support engineer reads only through §SA's grant-checked routes (support.*), never these. The parts' rules follow in their blocks. */
  { actionPrefix: 'onboarding.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
    { role: 'customer_sponsor', atScope: 'TENANT' }, { role: 'onboarding_authority', atScope: 'TENANT' }, { role: 'implementation_lead', atScope: 'TENANT' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'implementation.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
    { role: 'customer_sponsor', atScope: 'TENANT' }, { role: 'onboarding_authority', atScope: 'TENANT' }, { role: 'implementation_lead', atScope: 'TENANT' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'enablement_assessor', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' },
    { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'product_analytics_owner', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'service.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' },
    { role: 'customer_sponsor', atScope: 'TENANT' }, { role: 'onboarding_authority', atScope: 'TENANT' }, { role: 'implementation_lead', atScope: 'TENANT' },
    { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'data_steward', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' },
    { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B94 §0 */
  /* B94 onboarding */
  /* B94 §ON (0114_b94_x_on; PR-67-001/-002, CAP-DL-04/-05, PER-21, JRN-01). EXACT rules (TENANT roles at TENANT — they also qualify on a
     DOMAIN route of the tenant). THE PROGRAMME: opened, revised and its steps planned / recorded / reverted by the IMPLEMENTATION LEAD or the
     tenant administrator; held (and resumed) by any accountable party (the lead, the tenant admin, the customer sponsor, the onboarding
     authority — the port keeps a hold placed by the sponsor or authority for the sponsor or authority to release); WITHDRAWN by the customer
     sponsor or the tenant admin (human-gated). THE SPONSOR INTENT: the CUSTOMER SPONSOR only (human-gated; the port refuses a lead and an
     agent). THE BASELINES: captured, promoted and proposed by the implementation lead; DECIDED by the ONBOARDING AUTHORITY (human-gated; the
     port re-checks the approver — never the proposer or capturer, never a lead, never an agent — and the signature); drift recorded by the
     attention agent (the after-tick hook `onboarding-drift`) or a person accountable for the domain. The draft domain (tenancy.domain.draft)
     is answered by the earlier `tenancy.domain.` PREFIX rule (platform admin or tenant admin — first match wins); its port refuses PLATFORM
     and requires the tenant administrator. The reads are §0's onboarding.read. */
  ...((): Rule[] => {
    const T = (role: string) => ({ role, atScope: 'TENANT' as Scope });
    const lead = [T('implementation_lead'), T('tenant_admin')];
    const accountable = [...lead, T('customer_sponsor'), T('onboarding_authority')];
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    return [
      r('onboarding.programme.open', lead),
      r('onboarding.programme.revise', lead),
      r('onboarding.programme.hold', accountable),
      r('onboarding.programme.resume', accountable),
      r('onboarding.programme.withdraw', [T('customer_sponsor'), T('tenant_admin')], gate),
      r('onboarding.intent.record', [T('customer_sponsor')], gate),
      r('onboarding.step.plan', lead),
      r('onboarding.step.record', lead),
      r('onboarding.step.hold', accountable),
      r('onboarding.step.revert', lead),
      r('onboarding.baseline.capture', [T('implementation_lead')]),
      r('onboarding.baseline.promote', [T('implementation_lead')]),
      r('onboarding.baseline.propose', [T('implementation_lead')]),
      r('onboarding.baseline.decide', [T('onboarding_authority')], gate),
      r('onboarding.baseline.drift', [{ role: 'attention_agent', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }, T('implementation_lead'), T('onboarding_authority'), T('tenant_admin')]),
    ];
  })(),
  /* end B94 onboarding */
  /* B94 migration */
  /* B94 §MG (0114 §MG; PR-67-003, UX-66-004, CAP-DL-06): EXACT rules. The implementation lead (TENANT) opens waves, proposes mappings,
     rehearses, requests and executes cutovers inside the approved plan and rehearses rollbacks — an AGENT holding the lead's role may rehearse
     and execute (no human gate: automation executes only what the authority approved, and the PORT reads the approved staging rows only);
     the onboarding authority (TENANT) approves mappings, cutovers, rollbacks and acceptance — HUMAN-GATED here and re-checked in the port
     (onboarding.assert_approver: never the proposer, never a lead, never an agent). The reads are onboarding.read (§0). Domain ACTIVATION is
     `tenancy.domain.activate`, governed by the earlier `tenancy.domain.` prefix rule (tenant_admin at TENANT, platform_admin) — the port
     refuses PLATFORM authority (onboarding.assert_tenant) and anything but a verified cutover. */
  { actionPrefix: 'onboarding.wave.open', exact: true, requiredAnyRole: [{ role: 'implementation_lead', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.wave.withdraw', exact: true, requiredAnyRole: [{ role: 'implementation_lead', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.mapping.propose', exact: true, requiredAnyRole: [{ role: 'implementation_lead', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.mapping.approve', exact: true, requiredAnyRole: [{ role: 'onboarding_authority', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.rehearsal.run', exact: true, requiredAnyRole: [{ role: 'implementation_lead', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.cutover.request', exact: true, requiredAnyRole: [{ role: 'implementation_lead', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.cutover.recheck', exact: true, requiredAnyRole: [{ role: 'implementation_lead', atScope: 'TENANT' }, { role: 'onboarding_authority', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.cutover.approve', exact: true, requiredAnyRole: [{ role: 'onboarding_authority', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.cutover.execute', exact: true, requiredAnyRole: [{ role: 'implementation_lead', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.cutover.reconcile', exact: true, requiredAnyRole: [{ role: 'implementation_lead', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.rollback.rehearse', exact: true, requiredAnyRole: [{ role: 'implementation_lead', atScope: 'TENANT' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.rollback.execute', exact: true, requiredAnyRole: [{ role: 'onboarding_authority', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'onboarding.acceptance.decide', exact: true, requiredAnyRole: [{ role: 'onboarding_authority', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B94 migration */
  /* B94 implementation */
  /* B94 §IM+§AD (0114 §IM; PR-68-001..006, CAP-DL-07/08, PER-21, WS-20). EXACT rules — no `implementation` prefix rule exists. TENANT acts
     (the programme, its parts, its changes) need TENANT roles at TENANT scope; DOMAIN acts (readiness, the gate, go-live, enablement, cohorts,
     shadow workflows) run on the programme's target domain, where a TENANT role matches too. APPROVING, ACCEPTING, ATTESTING, CONFIRMING and
     RECORDING COMPETENCE are HUMAN-GATED and never the lead's (PER-21: the implementation lead coordinates — it appears in no approving rule;
     the ports re-check with onboarding.assert_approver, which also refuses a lead holding an approving role). implementation.self.read: any
     role reads its OWN training and competence records (subject-visible; the route answers the caller's own rows only). No agent role appears
     in any act here except the gate's re-evaluation and the shadow finding (an attention agent may record what it observed). */
  ...(() => {
    const T = (role: string) => ({ role, atScope: 'TENANT' as Scope });
    const D = (role: string) => ({ role, atScope: 'DOMAIN' as Scope });
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    const leadOrAdmin = [T('implementation_lead'), T('tenant_admin')];
    const customer = [T('customer_sponsor'), T('onboarding_authority')];
    return [
      r('implementation.programme.open', leadOrAdmin),
      r('implementation.programme.revise', leadOrAdmin),
      r('implementation.programme.start', leadOrAdmin),
      r('implementation.programme.withdraw', leadOrAdmin, gate),
      r('implementation.programme.hold', [T('implementation_lead'), ...customer]),
      r('implementation.programme.resume', [T('implementation_lead'), ...customer]),
      r('implementation.item.record', [T('implementation_lead')]),
      r('implementation.change.propose', [T('implementation_lead')]),
      r('implementation.change.approve', customer, gate),
      r('implementation.readiness.declare', [T('implementation_lead'), T('onboarding_authority')]),
      r('implementation.readiness.retire', [T('onboarding_authority')], gate),
      r('implementation.readiness.confirm', [...customer, D('domain_admin'), D('data_steward'), D('executive'), D('risk_owner'), D('decision_owner'), D('enablement_assessor')], gate),
      r('implementation.readiness.accept_residual', [T('onboarding_authority')], gate),
      r('implementation.gate.evaluate', [T('implementation_lead'), ...customer, D('domain_admin'), D('attention_agent')]),
      r('implementation.golive.approve', customer, gate),
      r('implementation.training.path.declare', [T('implementation_lead'), D('domain_admin'), D('enablement_assessor')]),
      r('implementation.training.path.attest', [T('onboarding_authority'), D('domain_admin'), D('enablement_assessor')], gate),
      r('implementation.training.record', [T('implementation_lead'), D('enablement_assessor')]),
      r('implementation.competence.record', [D('enablement_assessor')], gate),
      r('implementation.cohort.declare', [T('implementation_lead')]),
      r('implementation.shadow.record', [T('implementation_lead'), D('domain_admin'), D('data_steward'), D('collection_manager'), D('attention_agent')]),
      r('implementation.shadow.resolve', [T('onboarding_authority'), D('domain_admin')], gate),
      r('implementation.shadow.review', [T('onboarding_authority'), D('domain_admin')], gate),
      r('implementation.self.read', [T('tenant_admin'), ...customer, T('implementation_lead'),
        ...['domain_admin', 'domain_analyst', 'collection_manager', 'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'risk_owner', 'strategy_owner',
            'forecast_owner', 'data_steward', 'enablement_assessor', 'executive_operator', 'board_member', 'product_analyst', 'product_analytics_owner', 'opportunity_sponsor',
            'knowledge_owner', 'domain_specialist', 'privacy_officer'].map(D)], [{ type: 'audit_access' }]),
    ];
  })(),
  /* end B94 implementation */
  /* B94 service */
  /* B94 §SV (0114_b94_x_sv; PR-69-001/002/005/006, CAP-DL-09/10, AT-69; carryover a). EXACT rules — no `service` prefix rule exists, and
     `service.*` is no capability's prefix (case opening is NEVER licence-gated). The ports re-check every rule here:
       OPEN, NOTE, REOPEN, WORKAROUND EXECUTE — the customer roles of the domain (and the tenant administrator); the port refuses a support
         engineer (403 actor) and a non-human. The workaround's execution is the customer's own act (never support's).
       TRIAGE, PROGRESS, WORKAROUND PROPOSE, KNOWN-ERROR REUSE, COMMITMENTS — the domain admin (the customer's service owner) or a support
         engineer; for the engineer the port checks `service.live_grant` FIRST and logs every attempt (refused AND logged without a grant).
       NOTE — also the support engineer (under a grant); BUNDLE — the domain admin, a data steward, or the engineer under a grant.
       THE SUPPORT READ (service.case.support_read) — the support engineer only, under a grant (customers read through service.read).
       CLOSE (the customer's confirmation), the SLA DRILL, the change DECISION and the value-review ACKNOWLEDGEMENT — HUMAN-GATED.
       PROBLEMS, KNOWN ERRORS, CHANGES — the domain admin; the change decision never by its proposer (port).
       THE SWEEP (the after-tick hook `service-sla`) — the attention agent only.
       VALUE REVIEW — recorded by a domain admin or an executive, acknowledged by another (port). */
  ...((): Rule[] => {
    const customer = ['domain_admin', 'collection_manager', 'data_steward', 'executive', 'risk_owner', 'decision_owner', 'domain_analyst', 'strategy_owner', 'product_analytics_owner']
      .map((role) => ({ role, atScope: 'DOMAIN' as Scope }))
      .concat(['tenant_admin', 'customer_sponsor', 'onboarding_authority'].map((role) => ({ role, atScope: 'TENANT' as Scope })));
    const admin = [{ role: 'domain_admin', atScope: 'DOMAIN' as Scope }];
    const engineer = [{ role: 'support_engineer', atScope: 'DOMAIN' as Scope }];
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    return [
      r('service.case.open', customer),
      r('service.case.note', [...customer, ...engineer]),
      r('service.case.triage', [...admin, ...engineer]),
      r('service.case.progress', [...admin, ...engineer]),
      r('service.case.workaround.propose', [...admin, ...engineer]),
      r('service.case.workaround.execute', customer),
      r('service.case.known_error.reuse', [...admin, ...engineer]),
      r('service.case.bundle', [...admin, { role: 'data_steward', atScope: 'DOMAIN' as Scope }, ...engineer]),
      r('service.case.close', customer, gate),
      r('service.case.reopen', customer),
      r('service.case.support_read', engineer, [{ type: 'audit_access' }]),
      r('service.commitment.record', [...admin, ...engineer]),
      r('service.commitment.settle', [...admin, ...engineer]),
      r('service.sla.drill', admin, gate),
      r('service.sla.sweep', [{ role: 'attention_agent', atScope: 'DOMAIN' as Scope }]),
      r('service.problem.open', admin),
      r('service.problem.link', admin),
      r('service.problem.known_error', admin),
      r('service.problem.close', admin),
      r('service.change.propose', admin),
      r('service.change.decide', admin, gate),
      r('service.change.record', admin),
      r('service.value_review.record', [...admin, { role: 'executive', atScope: 'DOMAIN' as Scope }]),
      r('service.value_review.acknowledge', [{ role: 'executive', atScope: 'DOMAIN' as Scope }, ...admin], gate),
    ];
  })(),
  /* end B94 service */
  /* B94 support */
  /* B94 §SA (0114_b94_x_sa; IA-04-001..006, PR-69-003, PER-20, CAP-TR-12). EXACT rules. THE MATRIX: proposed by the implementation lead
     (TENANT) or the domain admin; DECIDED by the onboarding authority (TENANT; human-gated, signed — the port re-checks the approver test).
     RECONCILE: the attention agent (the after-tick hook), the domain admin, the onboarding authority, the lead. SUPPORT ACCESS: REQUESTED and
     WITHDRAWN by the support engineer; DECIDED and REVOKED by the domain admin (human-gated; the port: the accountable owner of
     support.access, never the engineer). The lapse runs inside the attention tick (executive.attention.tick: the timer and the sweep step). The ENGINEER's only other rules are its four DIAGNOSTIC READS and the
     read of its OWN grants (support.*) — no write rule, no service.read: an engineer's write (observation.source.transition …) is refused by
     the PDP. DRILLS: the domain admin (human-gated). JOINT EXERCISES: the domain admin or the onboarding authority (human-gated). ADMISSION:
     assembled by the lead or the domain admin; signed by the onboarding authority (human-gated). The reads are §0's service.read. */
  ...(() => {
    const S = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'DOMAIN' });
    const T = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'TENANT' });
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    const engineer = [S('support_engineer')];
    return [
      r('service.matrix.propose', [T('implementation_lead'), S('domain_admin')]),
      r('service.matrix.decide', [T('onboarding_authority')], gate),
      r('service.responsibility.reconcile', [S('attention_agent'), S('domain_admin'), T('onboarding_authority'), T('implementation_lead')]),
      r('service.grant.request', engineer),
      r('service.grant.withdraw', engineer),
      r('service.grant.decide', [S('domain_admin')], gate),
      r('service.grant.revoke', [S('domain_admin')], gate),
      r('support.grant.read', engineer, [{ type: 'audit_access' }]),
      r('support.diagnose.source', engineer, [{ type: 'audit_access' }]),
      r('support.diagnose.runs', engineer, [{ type: 'audit_access' }]),
      r('support.diagnose.health', engineer, [{ type: 'audit_access' }]),
      r('support.diagnose.schedule', engineer, [{ type: 'audit_access' }]),
      r('service.drill.run', [S('domain_admin')], gate),
      r('service.exercise.record', [S('domain_admin'), T('onboarding_authority')], gate),
      r('service.admission.propose', [T('implementation_lead'), S('domain_admin')]),
      r('service.admission.decide', [T('onboarding_authority')], gate),
    ];
  })(),
  /* end B94 support */
  /* B107 §0 */
  /* B107 §0 (0115; F-R0-04, F-P7D-25, F-P7-E-17, F-P7-F-12). EXACT rules — no `governance` prefix rule exists. THE READ (governance.read:
     the registries, the trace and impact reads, manifests, release candidates, the workspace, acceptance records of a domain, the design
     baseline) is consequential and audited: the governance roles (PLATFORM), the platform admin and auditor, and — for a domain's own
     acceptance records — the tenant and domain administrators, the customer sponsor, executives and the attention agent. The parts' rules
     follow in their blocks. */
  { actionPrefix: 'governance.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'product_authority', atScope: 'PLATFORM' },
    { role: 'design_system_authority', atScope: 'PLATFORM' }, { role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'operations_authority', atScope: 'PLATFORM' },
    { role: 'conformance_steward', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'customer_sponsor', atScope: 'TENANT' },
    { role: 'onboarding_authority', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'attention_agent', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B107 §0 */
  /* B107 registries */
  /* B107 §RG (0115_b107_x_rg; F-P7D-25, F-P7-F-12: the registries, trace links, change impact, the verification record, the fixture registry).
     EXACT rules, PLATFORM roles only. THE CONFORMANCE STEWARD imports the repository's registers (read-only), registers normative artifacts,
     records and retires trace links, reconciles inheritance (holds), records change impacts, ingests verification records, registers and
     quarantines fixtures — it approves and accepts nothing. INDEPENDENT ASSURANCE reviews a verification record and approves a fixture
     (human-gated; the ports re-check the approver test: never the ingester, the runner or a builder, never an agent). A DOMAIN's
     administrator or executive declares its decision-active products citing the vendor's contracts (governance.trace.domain_cite). The
     reads are §0's governance.read. */
  ...(() => {
    const P = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'PLATFORM' });
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    const steward = [P('conformance_steward')];
    return [
      r('governance.registry.import', steward),
      r('governance.registry.register', steward),
      r('governance.trace.link', steward),
      r('governance.trace.check', steward),
      r('governance.impact.record', steward),
      r('governance.verification.ingest', steward),
      r('governance.verification.review', [P('independent_assurance')], gate),
      r('governance.fixture.register', steward),
      r('governance.fixture.quarantine', steward),
      r('governance.fixture.approve', [P('independent_assurance')], gate),
      // a DOMAIN's decision-active product (briefing, decision package, forecast) declared as citing the vendor's contracts
      r('governance.trace.domain_cite', [{ role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }]),
    ];
  })(),
  /* end B107 registries */
  /* B107 conformance */
  /* B107 §CM (0115_b107_x_cm; F-P7D-25: ES-01-005, ES-02-002, V03-T-479, IA-01-005/-006, DAT-GV-09). EXACT rules — no `governance` prefix rule
     exists. REGISTER the committed component manifest, ASSEMBLE / CHECK a release candidate (B65 SUBSTITUTED — not a release): the conformance
     steward (PLATFORM; it approves nothing). ATTEST a conformant candidate: independent assurance (PLATFORM; human-gated — the port re-checks
     the approver test: a named human, never the proposer, never a builder, never an agent). WITHDRAW: the steward or the product authority.
     THE MONITOR: the attention agent (DOMAIN — the after-tick hook `governance-conformance`, its own action) or the steward (PLATFORM). The
     reads are §0's governance.read. */
  ...((): Rule[] => {
    const P = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'PLATFORM' });
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    return [
      r('governance.conformance.manifest.register', [P('conformance_steward')]),
      r('governance.conformance.candidate.assemble', [P('conformance_steward')]),
      r('governance.conformance.candidate.check', [P('conformance_steward')]),
      r('governance.conformance.candidate.attest', [P('independent_assurance')], gate),
      r('governance.conformance.candidate.withdraw', [P('conformance_steward'), P('product_authority')]),
      r('governance.conformance.monitor', [P('conformance_steward'), { role: 'attention_agent', atScope: 'DOMAIN' }]),
    ];
  })(),
  /* end B107 conformance */
  /* B107 ownership */
  /* B107 §DR (0115_b107_x_dr; F-P7D-25 DP-01/-04/-55, DAT-GV-01..10, ES-04/-11, PER-19; the B90 residuals DP-49-005/-006, DP-41-005). EXACT
     rules — no `governance` prefix rule exists. THE READ governance.ownership.read (audited): the PLATFORM governance roles and the platform
     admin (the vendor's registries; a DOMAIN route still needs a DOMAIN/TENANT role — RLS keeps customer content from a PLATFORM context),
     the tenant's authorities, the domain's administrators, stewards, privacy officers, executives, analysts and the OWNER roles (a named owner
     reads what it accepts). DOMAIN acts: a STEWARD or the domain admin proposes authorities, reconciles, assembles evidence; the NAMED OWNER
     accepts and recertifies (any owner role — the port holds the "named owner" rule); a steward or the domain admin RATIFIES (human-gated; the
     port: never the proposer, never the owner); the domain or tenant admin proposes the domain entry, the customer sponsor or the tenant admin
     ratifies it; cases are opened by the domain's data roles and reviewed by stewards, the domain admin and the privacy officer (human-gated;
     the port's segregation); evidence is attested by the onboarding authority or the customer sponsor (TENANT; human-gated, signed). The
     lineage retirement (products.catalog.lineage.retire) mirrors products.catalog.lineage.declare. PLATFORM acts: the conformance steward
     declares, imports and reconciles; the named owner accepts (any PLATFORM governance role); the product or operations authority admits and
     ratifies transfers (human-gated, signed — never a party). The tick acts under executive.attention.tick (no rule here). */
  ...(() => {
    const D = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'DOMAIN' });
    const T = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'TENANT' });
    const P = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'PLATFORM' });
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    const govPlatform = ['product_authority', 'design_system_authority', 'independent_assurance', 'operations_authority', 'conformance_steward'].map(P);
    const owners = ['domain_admin', 'data_steward', 'executive', 'executive_operator', 'domain_analyst', 'forecast_owner', 'strategy_owner', 'knowledge_owner', 'twin_owner',
                    'risk_owner', 'decision_owner', 'privacy_officer', 'product_analytics_owner'].map(D);
    const steward = [D('data_steward'), D('domain_admin')];
    return [
      r('governance.ownership.read', [P('platform_admin'), ...govPlatform, T('tenant_admin'), T('auditor'), T('customer_sponsor'), T('onboarding_authority'), D('attention_agent'), ...owners],
        [{ type: 'audit_access' }]),
      r('governance.ownership.authority.propose', steward),
      r('governance.ownership.authority.accept', owners, gate),
      r('governance.ownership.authority.ratify', steward, gate),
      r('governance.ownership.authority.recertify', owners, gate),
      r('governance.ownership.domain.propose', [D('domain_admin'), T('tenant_admin')]),
      r('governance.ownership.domain.ratify', [T('customer_sponsor'), T('tenant_admin')], gate),
      r('governance.ownership.reconcile', steward),
      r('governance.ownership.gap.accept', [D('domain_admin'), T('tenant_admin')], gate),
      r('governance.ownership.case.open', owners),
      r('governance.ownership.case.review', [D('data_steward'), D('domain_admin'), D('privacy_officer')], gate),
      r('governance.ownership.case.close', owners),
      r('governance.ownership.case.withdraw', owners),
      r('governance.ownership.evidence.assemble', steward),
      r('governance.ownership.evidence.attest', [T('onboarding_authority'), T('customer_sponsor')], gate),
      r('products.catalog.lineage.retire', [P('platform_admin'), ...owners], gate),
      r('governance.ownership.capability.declare', [P('conformance_steward')]),
      r('governance.ownership.capability.reconcile', [P('conformance_steward')]),
      r('governance.ownership.capability.accept', govPlatform, gate),
      r('governance.ownership.capability.admit', [P('product_authority'), P('operations_authority')], gate),
      r('governance.ownership.component.propose', govPlatform),
      r('governance.ownership.component.accept', govPlatform, gate),
      r('governance.ownership.component.ratify', [P('product_authority'), P('operations_authority')], gate),
      r('governance.ownership.component.withdraw', govPlatform),
      r('governance.ownership.component.reconcile', [P('conformance_steward')]),
      r('governance.ownership.platform_gap.accept', [P('product_authority'), P('operations_authority')], gate),
    ];
  })(),
  /* end B107 ownership */
  /* B107 workspace */
  /* B107 §PG (0115_b107_x_pg; F-P7-F-12, F-P7D-25 — the product-governance workspace). EXACT rules — no `governance` prefix rule exists (§0) and
     none of these names is a prefix of another rule's. Every act is the vendor's (PLATFORM roles, `atScope: 'PLATFORM'`; a TENANT or DOMAIN role —
     a local team — reaches none of them: it cannot waive controlling meaning, PR-72-003). THE APPROVALS (owner assignment, baseline and rights
     decisions, exception decisions and closures, remediation reviews, conflict resolutions, change decisions, record decisions, reviews and
     closures) are HUMAN-GATED: AI and automation prepare evidence and proposals only (PR-01-003) — and every port re-checks it (the approver
     test: a named human, never the proposer, never a builder, never an agent; the exception's owner and the expanded component's owner never
     approve it). Proposals (exceptions, changes, records, conflicts raised) may be drafted by an agent holding the role; the sweep and the
     posture snapshot are the conformance steward's. The read is §0's governance.read. */
  { actionPrefix: 'governance.baseline.owner.assign', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.baseline.propose', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }, { role: 'conformance_steward', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.baseline.decide', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.rights.propose', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }, { role: 'conformance_steward', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.rights.decide', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.exception.propose', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }, { role: 'design_system_authority', atScope: 'PLATFORM' }, { role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'operations_authority', atScope: 'PLATFORM' }, { role: 'conformance_steward', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.exception.decide', exact: true, requiredAnyRole: [{ role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'product_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.exception.withdraw', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }, { role: 'design_system_authority', atScope: 'PLATFORM' }, { role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'operations_authority', atScope: 'PLATFORM' }, { role: 'conformance_steward', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.exception.close', exact: true, requiredAnyRole: [{ role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'product_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.exception.sweep', exact: true, requiredAnyRole: [{ role: 'conformance_steward', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.remediation.decide', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.conflict.raise', exact: true, requiredAnyRole: [{ role: 'conformance_steward', atScope: 'PLATFORM' }, { role: 'product_authority', atScope: 'PLATFORM' }, { role: 'independent_assurance', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.conflict.resolve', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.change.propose', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }, { role: 'design_system_authority', atScope: 'PLATFORM' }, { role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'operations_authority', atScope: 'PLATFORM' }, { role: 'conformance_steward', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.change.decide', exact: true, requiredAnyRole: [{ role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'product_authority', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.record.propose', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }, { role: 'design_system_authority', atScope: 'PLATFORM' }, { role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'operations_authority', atScope: 'PLATFORM' }, { role: 'conformance_steward', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.record.decide', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }, { role: 'design_system_authority', atScope: 'PLATFORM' }, { role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'operations_authority', atScope: 'PLATFORM' }, { role: 'conformance_steward', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.record.review', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }, { role: 'design_system_authority', atScope: 'PLATFORM' }, { role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'operations_authority', atScope: 'PLATFORM' }, { role: 'conformance_steward', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.record.close', exact: true, requiredAnyRole: [{ role: 'product_authority', atScope: 'PLATFORM' }, { role: 'design_system_authority', atScope: 'PLATFORM' }, { role: 'independent_assurance', atScope: 'PLATFORM' }, { role: 'operations_authority', atScope: 'PLATFORM' }, { role: 'conformance_steward', atScope: 'PLATFORM' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'governance.posture.record', exact: true, requiredAnyRole: [{ role: 'conformance_steward', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B107 workspace */
  /* B107 acceptance */
  /* B107 §AR (0115_b107_x_ar; F-R0-04, ES-71-*, IA/DP-71-*, PAT-48, OBJ-40, JRN-24). EXACT rules — no `governance` prefix rule exists. THE READ
     (governance.acceptance.read: the workspace, the accepted scope, OBJ-40's preview, the replay; audited) admits every role that takes part
     in an acceptance — the vendor's governance roles at PLATFORM, the customer's sponsor and authorities, and the domain's administrator,
     executive, privacy officer, data steward and attention agent. EVIDENCE is recorded by the steward, the operations authority, the
     domain admin, the lead or the onboarding authority (an agent may draft, never accept). A PROPOSAL by the product or operations authority,
     the steward, the domain admin, the lead or the onboarding authority. The customer's VERIFICATION, every ATTESTATION, a TRIGGER, a met
     CONDITION, a WITHDRAWAL and the ENFORCEMENT marking are HUMAN-GATED — the ports re-check the approver test (named human, the obligation's
     role, never the proposer, never a builder, one person per obligation). The SWEEP: the steward, the operations authority, the attention
     agent (the tick runs it under executive.attention.tick). */
  ...((): Rule[] => {
    const P = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'PLATFORM' });
    const T = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'TENANT' });
    const D = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'DOMAIN' });
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    return [
      r('governance.acceptance.read', [P('platform_admin'), P('product_authority'), P('design_system_authority'), P('independent_assurance'), P('operations_authority'), P('conformance_steward'),
        T('tenant_admin'), T('auditor'), T('customer_sponsor'), T('onboarding_authority'), T('implementation_lead'),
        D('domain_admin'), D('executive'), D('privacy_officer'), D('data_steward'), D('attention_agent')], [{ type: 'audit_access' }]),
      r('governance.acceptance.evidence.record', [P('conformance_steward'), P('operations_authority'), D('domain_admin'), T('implementation_lead'), T('onboarding_authority')]),
      r('governance.acceptance.propose', [P('product_authority'), P('operations_authority'), P('conformance_steward'), D('domain_admin'), T('implementation_lead'), T('onboarding_authority')]),
      r('governance.acceptance.verify', [T('customer_sponsor'), T('onboarding_authority')], gate),
      r('governance.acceptance.attest', [P('product_authority'), P('independent_assurance'), P('operations_authority'), P('design_system_authority'), T('customer_sponsor'),
        T('onboarding_authority'), D('privacy_officer'), D('data_steward'), D('executive')], gate),
      r('governance.acceptance.trigger', [P('product_authority'), P('operations_authority'), P('independent_assurance'), D('domain_admin')], gate),
      r('governance.acceptance.condition.close', [P('operations_authority'), P('independent_assurance'), P('product_authority')], gate),
      r('governance.acceptance.withdraw', [P('product_authority'), P('operations_authority'), P('conformance_steward'), T('customer_sponsor'), T('onboarding_authority'),
        T('implementation_lead'), D('domain_admin')], gate),
      r('governance.acceptance.sweep', [P('conformance_steward'), P('operations_authority'), D('attention_agent')]),
      r('governance.acceptance.enforce', [P('product_authority')], gate),
    ];
  })(),
  /* end B107 acceptance */
  /* B107 design */
  /* B107 §DG (0115_b107_x_dg; F-P7-E-17: UX-01/02/03/08/72, UX-ADR-001/002/023/024, REL-01/02/23/24). EXACT rules. PLATFORM (the vendor's
     design system): the BASELINE registered by the Design System Authority, the conformance steward or the product authority, DECIDED
     (attest | reject) by the Design System Authority (human-gated, signed — the port re-checks the approver test); the ASSET inventory by
     the steward or the authority, an asset APPROVED (its one accountable owner named) by the authority (human-gated); PRINCIPLES declared by
     the authority (human-gated); EVALUATIONS (the lint, a review) by the steward or the authority; design EXCEPTIONS requested by a
     contributor, DECIDED by the authority (human-gated; the port: never the requester, never the asset's owner); CONTRIBUTIONS proposed and
     amended by a contributor (the authority, the product authority, the steward, the operations authority), REVIEWED, PUBLISHED,
     DEPRECATED, RETIRED and CLOSED by the authority, ACCEPTED by the authority or — a constitutional amendment — the product authority, and
     REJECTED by either (all human-gated; the port re-checks: never the proposer, never a builder); ADOPTION, MEASUREMENT and MIGRATION
     recorded by the steward or the authority; trace LINKS by the steward or the authority. DOMAIN: the experience INTAKE by the product
     analytics owner, the domain admin or the authority (the tick's step serves it under executive.attention.tick); a design ACCEPTANCE
     proposed by the steward or the domain admin and ATTESTED per obligation by the Design System Authority, independent assurance or the
     customer sponsor (human-gated, signed); the conformance PACKAGE generated by the steward, independent assurance or the tenant's
     auditor (left unsigned — R2). The reads are §0's governance.read. */
  ...(() => {
    const P = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'PLATFORM' });
    const S = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'DOMAIN' });
    const T = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'TENANT' });
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    const dsa = [P('design_system_authority')];
    const keepers = [P('conformance_steward'), P('design_system_authority')];
    const contributors = [P('design_system_authority'), P('product_authority'), P('conformance_steward'), P('operations_authority')];
    return [
      r('governance.design.baseline.propose', [P('design_system_authority'), P('conformance_steward'), P('product_authority')]),
      r('governance.design.baseline.decide', dsa, gate),
      r('governance.design.asset.register', keepers),
      r('governance.design.asset.approve', dsa, gate),
      r('governance.design.principle.declare', dsa, gate),
      r('governance.design.evaluate', keepers),
      r('governance.design.exception.request', contributors),
      r('governance.design.exception.decide', dsa, gate),
      r('governance.design.contribution.propose', contributors),
      r('governance.design.contribution.amend', contributors),
      r('governance.design.contribution.review', dsa, gate),
      r('governance.design.contribution.accept', [P('design_system_authority'), P('product_authority')], gate),
      r('governance.design.contribution.reject', [P('design_system_authority'), P('product_authority')], gate),
      r('governance.design.contribution.publish', dsa, gate),
      r('governance.design.contribution.deprecate', dsa, gate),
      r('governance.design.contribution.adopt', keepers),
      r('governance.design.contribution.measure', keepers),
      r('governance.design.contribution.migrate', keepers),
      r('governance.design.contribution.retire', dsa, gate),
      r('governance.design.contribution.close', dsa, gate),
      r('governance.design.link.record', keepers),
      r('governance.design.intake', [S('product_analytics_owner'), S('domain_admin'), P('design_system_authority')]),
      r('governance.design.acceptance.propose', [P('conformance_steward'), S('domain_admin')]),
      r('governance.design.acceptance.attest', [P('design_system_authority'), P('independent_assurance'), T('customer_sponsor')], gate),
      r('governance.design.package.generate', [P('conformance_steward'), P('independent_assurance'), T('auditor')]),
    ];
  })(),
  /* end B107 design */
  /* B80 tk */
  /* B80 §TK (0118_b80_x_tk; F-P7-E-03: UX-68-001…005, UX-ADR-022, PAT-41, REL-16). EXACT rules. THE CUSTOMER THEME is the tenant's: the
     brand owner (branding_authority, TENANT) PROPOSES, ACTIVATES (a certified version only), ROLLS BACK and RETIRES (all human-gated; the
     ports re-check the human and the role); the Design System Authority (PLATFORM) CERTIFIES (human-gated, signed; the port re-checks the
     approver test — never the proposer, never an agent — and recomputes the contrast matrix from the stored mapping). The PREVIEW and the
     READ (the tenant's themes, certifications, activations; the PLATFORM certification queue) by the brand owner, the Design System
     Authority, the conformance steward and product authority (PLATFORM), and the tenant's administrator, auditor and customer sponsor. THE
     THEME IN FORCE (what ThemeScope applies, on a TENANT or a DOMAIN route) by every human role of the tenant and its domains (the B92
     list of domain roles, the tenant roles) and the Design System Authority — an agent renders no shell. The library lint (dg-lint-2) is
     B107's governance.design.evaluate. */
  ...(() => {
    const P = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'PLATFORM' });
    const T = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'TENANT' });
    const S = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'DOMAIN' });
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    const brand = [T('branding_authority')];
    const readers = [P('design_system_authority'), P('conformance_steward'), P('product_authority'), T('branding_authority'), T('tenant_admin'), T('auditor'), T('customer_sponsor')];
    const humans = [P('design_system_authority'), T('branding_authority'), T('tenant_admin'), T('auditor'), T('customer_sponsor'), T('onboarding_authority'), T('implementation_lead'),
      T('retention_authority'), ...['domain_admin', 'domain_analyst', 'collection_manager', 'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'extraction_manager',
        'resolution_manager', 'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator', 'knowledge_owner', 'record_authority', 'retention_steward', 'ontology_steward',
        'risk_owner', 'opportunity_sponsor', 'execution_authority', 'method_steward', 'constraint_steward', 'executive_operator', 'board_member', 'data_steward', 'domain_specialist',
        'product_analytics_owner', 'privacy_officer', 'product_analyst'].map(S)];
    return [
      r('governance.design.theme.read', readers),
      r('governance.design.theme.in_force.read', humans),
      r('governance.design.theme.preview', readers),
      r('governance.design.theme.propose', brand, gate),
      r('governance.design.theme.certify', [P('design_system_authority')], gate),
      r('governance.design.theme.activate', brand, gate),
      r('governance.design.theme.rollback', brand, gate),
      r('governance.design.theme.retire', brand, gate),
    ];
  })(),
  /* end B80 tk */
  /* B81 ct */
  /* B81 §CT (0119_b81_x_ct; F-P7-E-18: UX-69-001…006, UX-ADR-021, GLB-20, CNT-*). EXACT rules — no earlier rule's prefix is a prefix of
     `governance.design.term.` (B80's `governance.design.theme.*` and B107's design rules are exact). THE PRODUCT LANGUAGE is the vendor's
     (PLATFORM): a contributor of the design system (the Design System Authority, the product authority, the conformance steward, the
     operations authority) PROPOSES and CORRECTS; the Design System Authority or the conformance steward REVIEWS (never the proposer — the
     port re-checks); the Design System Authority APPROVES, PUBLISHES and RETIRES (the ports re-check the approver test: a named human, never
     the proposer, never an agent). Every act human-gated. THE REGISTRY READ (drafts, reviews, the ledger) by the same four. THE PUBLISHED
     CATALOGUE (what Term and HelpPanel render) by every human role of every context (B80's theme-in-force list, the PLATFORM authorities and
     administrator) — an agent renders no page. The content lint (dg-lint-3) is B107's governance.design.evaluate. */
  ...(() => {
    const P = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'PLATFORM' });
    const T = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'TENANT' });
    const S = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'DOMAIN' });
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, requiredAnyRole: Array<{ role: string; atScope: Scope }>, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    const dsa = [P('design_system_authority')];
    const contributors = [P('design_system_authority'), P('product_authority'), P('conformance_steward'), P('operations_authority')];
    const reviewers = [P('design_system_authority'), P('conformance_steward')];
    const readers = [...contributors, P('platform_admin'), T('branding_authority'), T('tenant_admin'), T('auditor'), T('customer_sponsor'), T('onboarding_authority'), T('implementation_lead'),
      T('retention_authority'), ...['domain_admin', 'domain_analyst', 'collection_manager', 'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'extraction_manager',
        'resolution_manager', 'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator', 'knowledge_owner', 'record_authority', 'retention_steward', 'ontology_steward',
        'risk_owner', 'opportunity_sponsor', 'execution_authority', 'method_steward', 'constraint_steward', 'executive_operator', 'board_member', 'data_steward', 'domain_specialist',
        'product_analytics_owner', 'privacy_officer', 'product_analyst'].map(S)];
    return [
      r('governance.design.term.read', contributors),
      r('governance.design.term.catalogue.read', readers),
      r('governance.design.term.propose', contributors, gate),
      r('governance.design.term.correct', contributors, gate),
      r('governance.design.term.review', reviewers, gate),
      r('governance.design.term.approve', dsa, gate),
      r('governance.design.term.publish', dsa, gate),
      r('governance.design.term.retire', dsa, gate),
    ];
  })(),
  /* end B81 ct */
  /* B80 clf */
  /* B80 §CL-F (0118_b80_x_clf; PAT-03, UX-21-002/-003). EXACT rules — no `shell` prefix rule exists. A FORM DRAFT is a person's own work in
     progress: every HUMAN role that authors anything may keep one (the identity.self.read list less the agents and the external
     collaborator — drafts never cross a grant boundary). SAVE and DISCARD are HUMAN-GATED (the PEP refuses an agent before any port; the
     port re-checks the named human and the acting principal); the READ (one draft, the list) is the principal's OWN rows only — the RLS
     policy and the guarded definer read decide that, not this rule. A draft is never a submission: these rules authorize nothing the form
     itself does. */
  ...((): Rule[] => {
    const P = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'PLATFORM' });
    const T = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'TENANT' });
    const D = (role: string): { role: string; atScope: Scope } => ({ role, atScope: 'DOMAIN' });
    const humans = [
      P('platform_admin'), T('tenant_admin'), T('auditor'), T('retention_authority'), T('customer_sponsor'), T('onboarding_authority'), T('implementation_lead'),
      T('branding_authority'),
      ...['domain_admin', 'domain_analyst', 'collection_manager', 'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'executive_operator',
        'board_member', 'extraction_manager', 'resolution_manager', 'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator', 'knowledge_owner',
        'record_authority', 'retention_steward', 'ontology_steward', 'risk_owner', 'opportunity_sponsor', 'execution_authority', 'method_steward',
        'constraint_steward', 'data_steward', 'domain_specialist', 'product_analytics_owner', 'privacy_officer', 'product_analyst', 'support_engineer',
        'enablement_assessor'].map(D),
    ];
    const gate: Obligation[] = [{ type: 'human_gate' }];
    const r = (actionPrefix: string, obligations?: Obligation[]): Rule =>
      ({ actionPrefix, exact: true, requiredAnyRole: humans, ...(obligations === undefined ? {} : { obligations }), requiresPurpose: true, maxConsequence: 'C2' });
    return [r('shell.draft.read'), r('shell.draft.save', gate), r('shell.draft.discard', gate)];
  })(),
  /* end B80 clf */
  /* B36 home */
  /* THE EXECUTIVE HOME, THE CADENCE, THE COMMAND VIEWS, THE SEARCH, THE METRICS (0094 §H; F-P6-11: WS-01, JRN-19, PER-03, CAP-EO-01/-02/-04).
     EXACT rules — no `executive` prefix rule exists and none of these names is a prefix of another rule's. THE READS (executive.home.read
     — the home, the switcher's choices, the cadence, the command views; executive.metrics.read) are consequential and audited: the
     executive, the executive operator, the board member, the decision and strategy roles, the analysts, the auditor and the administrators;
     the port composes under the reader's own RLS and clearance, and a command view of a role the reader does not hold is refused by the
     port (403). THE CONTEXT (§0's executive.context.set, this part's only route): executive, executive_operator, decision_owner,
     strategy_owner, decision_authority, domain_admin, platform_admin — human-gated. THE CADENCE (open / reset) and THE AGENDA / the
     ESCALATION of a gap: the executive and the executive operator (the administrators beside them), human-gated; the port refuses a reset
     over open board-class decisions unless the EXECUTIVE confirms it. A SUBJECT ROOM (a scenario room, an objective review): the executive,
     the operator, the decision and strategy owners, the authority; the port keeps the separation of duties. THE SEARCH is a governed act
     (its access ledger) of every reading role. THE EXECUTIVE OPERATOR (PER-03) appears in NO decision / approval / commitment / publication
     rule: approve, decide, commit and publish are refused at the PDP; it ROUTES work through the existing delegation and reassignment rows
     below (executive.attention.item.delegate, executive.task.reassign — the role added there, marked). No agent role appears here. */
  { actionPrefix: 'executive.home.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.metrics.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* B80 cb (0118 §CB) — B36's `executive.context.set` rule REPLACED here (it stood in this place with seven roles): WIDENED to every human DOMAIN
     role (DESIGN D3; B80_CONTEXT_SETTER_ROLES above), human-gated, presentation-only — a context switch never alters an approval and the port
     (executive.commit_context / 0094's set_context) re-checks the human and the role. NEW: `executive.context.read` — the operating context
     bar's read and the impact preview (executive.context_bar / context_impact), the same humans plus the TENANT-bound readers, audited. EXACT
     rules; no earlier rule's prefix is a prefix of `executive.context.` (the B36 rule stood here and matched first). */
  { actionPrefix: 'executive.context.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, ...B80_CONTEXT_SETTER_ROLES.map((role) => ({ role, atScope: 'DOMAIN' as const }))], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.context.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, ...B80_CONTEXT_TENANT_READERS.map((role) => ({ role, atScope: 'TENANT' as const })), ...B80_CONTEXT_SETTER_ROLES.map((role) => ({ role, atScope: 'DOMAIN' as const }))], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B80 cb */
  { actionPrefix: 'executive.cadence.open', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.cadence.reset', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.room.open', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.agenda.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.escalation.raise', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.escalation.answer', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.search', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B36 home */
  /* B32 (0089) exposures: RISK AND OPPORTUNITY INTELLIGENCE (F-P4-13; PR-27-003 "AI may estimate and recommend; accountable human risk owners
     accept assessments, appetite decisions, mitigation commitments, and residual risk"; PR-28-003 "AI may surface and model opportunities; humans
     choose sponsorship …"). EXACT rules — no earlier rule's prefix is a prefix of `prediction.exposure.*` (`prediction.read`, `prediction.series.register`,
     `prediction.forecast.*`, … are other names). READING the register is its own action (prediction.exposure.read — the prediction.read rule
     does not name the risk owner or the sponsor): the domain's foresight, decision and strategy roles, the auditors. Every ACT is a NAMED
     HUMAN's, human-gated: the taxonomy (the executive, a domain administrator), the appetite (the executive, a domain administrator, a risk
     owner), identifying and assessing (analysts, strategy and risk owners, sponsors), a challenge, a control, a hypothesis, a correlation
     declared, routing a breach, a response, a closure. ACCEPTANCE is the risk owner's alone (the port checks it is THE exposure's owner);
     SPONSORSHIP the opportunity sponsor's alone. The ESTIMATE is the Risk and Opportunity Agents' only action (no gate — the agent is a
     machine; the port checks its own open run); neither holds acceptance nor sponsorship, so their attempts are refused here and recorded on
     the run. The AGGREGATION is a recorded computation (the domain's analysts and owners; no gate). */
  { actionPrefix: 'prediction.exposure.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.taxonomy.publish', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.appetite.approve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.register', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.assess', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.estimate', exact: true, requiredAnyRole: [{ role: 'risk_agent', atScope: 'DOMAIN' }, { role: 'opportunity_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.contest', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.accept', exact: true, requiredAnyRole: [{ role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.control.add', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.route', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.hypothesis.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.sponsor', exact: true, requiredAnyRole: [{ role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.respond', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.close', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.correlation.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.aggregate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B32 exposures */
  /* B34 (0090) workflow: THE DURABLE WORKFLOW ENGINE, THE HUMAN TASKS AND COLLABORATION (F-P6-14; PR-46-003 "collaboration cannot broaden
     access or decision rights … eligible humans own approvals"; PER-22). EXACT rules — no earlier rule is a prefix of `executive.workflow.*`,
     `executive.task.*` or `executive.collab.*` (the executive rules above are all exact; `executive.request` is exact). Every ACT is a named
     human's, human-gated; the reads are consequential. THE EXTERNAL COLLABORATOR (role external_collaborator) holds exactly
     executive.collab.read, executive.collab.discuss, executive.collab.review, executive.task.complete and executive.collab.accept (the
     acceptance of its own invitation — stated: the invitee signs in with the invitation token and accepts) — no other rule names it, so it
     can neither approve, commit, join a room, read the workflow or the inbox, nor invite; every collaboration port checks its live grant
     (purpose, ceiling, expiry). The ports check the rest: the workspace's owner sets participants, invites and revokes; a task is
     reassigned by its assignee, an executive or a domain administrator; a gate.* or commitment.* task never completes here. */
  { actionPrefix: 'executive.workflow.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.workflow.define', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.workflow.start', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.workflow.advance', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.workflow.compensate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.workflow.drill', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.task.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'execution_authority', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.task.reassign', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, /* B36 home (0094 §H4): the executive operator routes work */ { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'execution_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.task.complete', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'execution_authority', atScope: 'DOMAIN' }, { role: 'external_collaborator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.collab.workspace.open', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.collab.participant.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.collab.invite', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.collab.grant.revoke', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.collab.review.request', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* B34-F1 (0091): PROVISIONING a requested invitation creates an identity principal, so it is the IDENTITY ADMINISTRATORS' act — exactly the
     roles the Phase 0 `identity.` rule admits for identity.principal.create (platform_admin, tenant_admin); a domain administrator, an
     executive, a decision owner — the workspace's owner — are refused here and again at identity.principal.create. The port refuses the
     requester (two acts, two people). */
  { actionPrefix: 'executive.collab.provision', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B34-F1 */
  { actionPrefix: 'executive.collab.accept', exact: true, requiredAnyRole: [{ role: 'external_collaborator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.collab.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'external_collaborator', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.collab.discuss', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'external_collaborator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.collab.review', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'external_collaborator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B34 workflow */
  /* B34 (0090) exposures — the remainder of F-P4-13. EXACT rules (no earlier prefix is a prefix of these names). The ACTIVATION of a
     published taxonomy is a second named member's act (the port refuses the publisher); the SCENARIO LINK an analyst's or an owner's; the
     OUTCOME REVIEW the exposure's owner's or sponsor's (the port checks which); the OWNER RESOLUTION a domain administrator's (the named
     resolver of an exposure whose owner is missing or inactive). Every one human-gated. */
  { actionPrefix: 'prediction.exposure.taxonomy.activate', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.scenario.link', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.outcome.review', exact: true, requiredAnyRole: [{ role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.owner.resolve', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B34 exposures */
  /* B34 (0090) attention: THE ACT TRANSITION (0090 §A4) — EXACT (no earlier prefix rule matches `executive.attention.item.act`: every
     executive.attention.* rule above is exact). HUMAN-GATED: an agent is refused here, before any port. The roles are the item-acting roles
     of the queue plus the owners of what an act launches (risk_owner, opportunity_sponsor); the port admits only a named, active member who
     may act on the ITEM, and the governed action it launches is checked by ITS OWN rule (prediction.exposure.sponsor, prediction.warning.acknowledge …). */
  { actionPrefix: 'executive.attention.item.act', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B34 attention */
  /* B34 (0090) commitments: THE COMMITMENT TRACKER AND THE GOVERNED EXECUTION HANDOFF (0090 §C; F-P6-05; V03-T-010 "a recommendation
     becomes an executable commitment only through an approved workflow owned by a named human authority", V03-T-366 "external execution
     requires a separately governed commitment and interface"). Every rule EXACT: no earlier rule's prefix is a prefix of these names —
     `decision.commit` is exact (it never matches `decision.commitment.*`), `decision.close` is a prefix of neither `decision.commitment.close`
     nor anything here, no rule names `decision.execution` or `graph.objective`. The WRITES are human-gated at ≤ C2 for the parties the ports
     check (the item's owner, its reviewer, the package owner, the compensation's owner — the port refuses anyone else); the ISSUE is the one
     C3 action: execution_authority only (the port: an active member, never the drafter nor the decision's committer). The targets are the
     domain administrator's (SYNTHETIC only — the port). The subscriber holds exactly its apply; the attention agent exactly the after-tick
     publication (it reads the events the tick recorded and enqueues CommitmentChanged — no human gate: it decides nothing). */
  { actionPrefix: 'decision.commitment.read', exact: true, requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' },
      { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'execution_authority', atScope: 'DOMAIN' }],
    obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  ...(['decision.commitment.item.declare', 'decision.commitment.item.accept', 'decision.commitment.item.complete', 'decision.commitment.exception.raise',
       'decision.commitment.exception.decide', 'decision.execution.draft', 'decision.execution.compensation.assign', 'decision.execution.compensation.cosign',
       'decision.execution.reconcile', 'decision.commitment.closure.propose', 'decision.commitment.close'] as const).map((actionPrefix): Rule => ({
    actionPrefix, exact: true, requiredAnyRole: [{ role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }],
    obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' })),
  { actionPrefix: 'decision.execution.issue', exact: true, requiredAnyRole: [{ role: 'execution_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, minConsequence: 'C3', maxConsequence: 'C3' },
  { actionPrefix: 'decision.execution.target.declare', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.execution.target.retire', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.commitment.subscription.apply', exact: true, requiredAnyRole: [{ role: 'commitment_subscriber', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.commitment.signal.publish', exact: true, requiredAnyRole: [{ role: 'attention_agent', atScope: 'DOMAIN' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'graph.objective.revise', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }],
    obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B34 commitments */
  /* B36 (0094 §A) attention: THE ATTENTION COMPLETION (F-P6-07) — every rule EXACT (every executive.attention.* rule above is exact; no rule
     names `executive.forum`). The reads are executive.attention.queue.read: the queue's read roles PLUS the executive operator and the board
     member (the prelude's roles; executive.attention.read above is exact and first-match, so a second rule for it would never be reached — the
     B36 routes read under their own action). The writes are HUMAN-GATED: an agent is refused here, before any port. The resume is the
     launcher's or the executive operator's (the port), among the act roles; accept-priority is the item's accountable person's (the port),
     among the item-acting roles; the release is the executive's (the port: executive, domain_admin, platform_admin); the recovery routes and
     the forum are the executive operator's, the executive's or an administrator's (the ports); the SYNTHETIC fixture is an administrator's or
     the executive operator's act, audited, closing nothing. */
  { actionPrefix: 'executive.attention.queue.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }, { role: 'auditor', atScope: 'TENANT' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'board_member', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.item.act.resume', exact: true, requiredAnyRole: [{ role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.item.accept_priority', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.queue.release', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.queue.recover', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.attention.fixture.arm', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.forum.convene', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B36 attention */
  /* B36 (0094) publishing — THE PUBLISHING AND DISTRIBUTION CENTER (F-P6-13; OBJ-39; TC-12). EXACT rules, every act human-gated and <= C2;
     no earlier prefix rule matches `executive.publication.*` or `executive.external_draft.*` (the `executive.request` rule is exact; the
     attention rules name their own actions). The ports re-judge the person: the approver's authority and its separation from the drafter,
     the deliverer's authority, the recipient's own acknowledgement, the external reviewer holding `executive` and not the drafter, the
     exporter's authority. The read admits every domain role a publication can reach (the board member among them): the service narrows a
     recipient to its own deliveries. */
  { actionPrefix: 'executive.publication.draft', exact: true, requiredAnyRole: [{ role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.publication.approve', exact: true, requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.publication.deliver', exact: true, requiredAnyRole: [{ role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.publication.acknowledge', exact: true, requiredAnyRole: [{ role: 'board_member', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.publication.correct', exact: true, requiredAnyRole: [{ role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.publication.withdraw', exact: true, requiredAnyRole: [{ role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.publication.archive', exact: true, requiredAnyRole: [{ role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.publication.export', exact: true, requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'retention_authority', atScope: 'TENANT' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.external_draft.review', exact: true, requiredAnyRole: [{ role: 'executive', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.publication.read', exact: true, requiredAnyRole: [{ role: 'board_member', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'retention_authority', atScope: 'TENANT' }, { role: 'platform_admin', atScope: 'PLATFORM' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B36 publishing */
  /* B36 collab (0094 §C): COLLABORATION COMPLETED AND THE CARRIED MECHANISMS (F-P6-14 (q)–(t), F-P6-05 (u), F-P4-13 (i)–(j)). EXACT rules —
     no earlier rule is a prefix of executive.task.dependency.*, executive.collab.mailbox.*, decision.execution.target.* or
     prediction.exposure.learn (the workflow, commitment and exposure rules above are all exact). The EXTERNAL COLLABORATOR gains nothing
     here: the pickup route is public (the mailbox's code is its authority — no PDP), and the external's bounded self read is
     identity.self.read (above) composed with executive.collab.read (B34's rule). A task dependency is declared by the task readers who
     act (the port: the holder, the opener, the workspace's owner, an executive or an administrator). The mailbox message is the identity
     administrators' read (the code inside is the invitee's). A REAL execution target is REGISTERED by the domain administrator (inactive),
     ACTIVATED by the execution authority (the port: not the registrar, with the owner's committed decision) and DEACTIVATED by either.
     The learn step is the exposure's owner's or sponsor's, as the outcome review is. */
  { actionPrefix: 'executive.task.dependency.declare', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }, { role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'execution_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'executive.collab.mailbox.read', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'tenant_admin', atScope: 'TENANT' }], obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.execution.target.register', exact: true, requiredAnyRole: [{ role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.execution.target.activate', exact: true, requiredAnyRole: [{ role: 'execution_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'decision.execution.target.deactivate', exact: true, requiredAnyRole: [{ role: 'execution_authority', atScope: 'DOMAIN' }, { role: 'domain_admin', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  { actionPrefix: 'prediction.exposure.learn', exact: true, requiredAnyRole: [{ role: 'risk_owner', atScope: 'DOMAIN' }, { role: 'opportunity_sponsor', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
  /* end B36 collab */
  /* B80 sh */
  /* B80 §SH (0118_b80_x_sh; F-P7-E-01: PR-05-002, UX-09-003, UX-11-002, UX-15-002, PAT-26). EXACT rules — no earlier rule is a prefix of
     shell.navigation.* (no `shell` prefix rule exists). A NAVIGATION STATE is the principal's OWN presentation state: saved and read by every
     HUMAN role of the Eye at its own scope — PLATFORM (the admin workspace: the platform and governance roles), TENANT (a tenant-homed
     principal working in a domain) and DOMAIN (every human domain role) — and by no agent, subscriber or external collaborator (none is
     listed; the port re-checks that the actor is the bound principal AND an active human, and refuses any other principal's state). Not
     human-gated: saving where one stands is presentation, not a consequential act (the port's human check is the boundary). The deep
     link's warning as-of read is `prediction.read` (the existing prefix rule — the warning readers); no rule is added for it. */
  ...((): Rule[] => {
    const platform = ['platform_admin', 'commercial_authority', 'product_authority', 'design_system_authority', 'independent_assurance', 'operations_authority', 'conformance_steward']
      .map((role) => ({ role, atScope: 'PLATFORM' as Scope }));
    const tenant = ['tenant_admin', 'auditor', 'retention_authority', 'branding_authority', 'customer_sponsor', 'implementation_lead', 'onboarding_authority']
      .map((role) => ({ role, atScope: 'TENANT' as Scope }));
    const domain = ['domain_admin', 'domain_analyst', 'collection_manager', 'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'executive_operator',
      'board_member', 'extraction_manager', 'resolution_manager', 'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator', 'knowledge_owner',
      'record_authority', 'retention_steward', 'ontology_steward', 'risk_owner', 'opportunity_sponsor', 'execution_authority', 'method_steward', 'constraint_steward',
      'data_steward', 'domain_specialist', 'product_analytics_owner', 'privacy_officer', 'product_analyst', 'enablement_assessor', 'support_engineer']
      .map((role) => ({ role, atScope: 'DOMAIN' as Scope }));
    const people = [...platform, ...tenant, ...domain];
    return [
      { actionPrefix: 'shell.navigation.save', exact: true, requiredAnyRole: people, requiresPurpose: true, maxConsequence: 'C2' },
      { actionPrefix: 'shell.navigation.read', exact: true, requiredAnyRole: people, obligations: [{ type: 'audit_access' }], requiresPurpose: true, maxConsequence: 'C2' },
    ];
  })(),
  /* end B80 sh */
];

/* B107 conformance */
/** B107 §CM: the DIGEST of the policy bundle this runtime enforces (bundle-v1's rules, canonicalised) — what a release candidate binds and the
 *  conformance monitor compares (a changed rule is a changed digest; `bundleVersion` alone does not move). */
export function policyBundleDigest(): string { return contentDigest(BUNDLE_V1 as unknown); }
/* end B107 conformance */

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

    const rule = BUNDLE_V1.find((r) => (r.exact === true ? input.action === r.actionPrefix : input.action.startsWith(r.actionPrefix)));
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
    if (rule.minConsequence !== undefined) {
      if (CONSEQ_ORDER.indexOf(input.consequenceClass) < CONSEQ_ORDER.indexOf(rule.minConsequence)) {
        return {
          ...base,
          decision: 'deny',
          obligations: [],
          reason: `consequence class ${input.consequenceClass} is below ${rule.minConsequence}; ${rule.actionPrefix} is a ${rule.minConsequence} action or nothing`,
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
