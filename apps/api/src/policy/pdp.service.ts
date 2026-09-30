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
      /* B90 browser (0095 §0): the data steward resolves its own scope (a PURE steward opens the shell — found by the B90 browser gate: the
         /graph/data pages answered "no qualifying role binding for action in resolved scope" to a principal holding data_steward alone) */
      { role: 'data_steward', atScope: 'DOMAIN' },
      /* end B90 browser */
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
  { actionPrefix: 'executive.attention.item.acknowledge', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }, { role: 'decision_approver', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'forecast_owner', atScope: 'DOMAIN' }, { role: 'twin_owner', atScope: 'DOMAIN' }, { role: 'simulation_operator', atScope: 'DOMAIN' }, { role: 'collection_manager', atScope: 'DOMAIN' }, { role: 'extraction_manager', atScope: 'DOMAIN' }, { role: 'knowledge_owner', atScope: 'DOMAIN' }, { role: 'resolution_manager', atScope: 'DOMAIN' }, { role: 'record_authority', atScope: 'DOMAIN' }, { role: 'retention_steward', atScope: 'DOMAIN' }, { role: 'ontology_steward', atScope: 'DOMAIN' }, { role: 'domain_analyst', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
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
  { actionPrefix: 'executive.context.set', exact: true, requiredAnyRole: [{ role: 'platform_admin', atScope: 'PLATFORM' }, { role: 'domain_admin', atScope: 'DOMAIN' }, { role: 'executive', atScope: 'DOMAIN' }, { role: 'executive_operator', atScope: 'DOMAIN' }, { role: 'decision_owner', atScope: 'DOMAIN' }, { role: 'strategy_owner', atScope: 'DOMAIN' }, { role: 'decision_authority', atScope: 'DOMAIN' }], obligations: [{ type: 'human_gate' }], requiresPurpose: true, maxConsequence: 'C2' },
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
