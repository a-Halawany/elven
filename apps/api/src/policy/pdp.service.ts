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
    ],
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
    // Propagation REPORTS; it decides nothing. It is held by the people who own
    // what it reports on — including the collection_manager, because a Phase 1
    // correction is what most often triggers it.
    actionPrefix: 'graph.impact.propagate',
    requiredAnyRole: [
      { role: 'platform_admin', atScope: 'PLATFORM' },
      { role: 'domain_admin', atScope: 'DOMAIN' },
      { role: 'strategy_owner', atScope: 'DOMAIN' },
      { role: 'resolution_manager', atScope: 'DOMAIN' },
      { role: 'collection_manager', atScope: 'DOMAIN' },
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
