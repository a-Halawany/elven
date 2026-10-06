/**
 * B25 (0108 §0) — THE SEAMS between the three parts, fixed by the prelude so the parts build in parallel.
 *
 *   §CX (context)   implements CONTEXT_FREEZER: assemble the grounded context of a forecast (graph entities/events as of the cut-off, the
 *                   twin snapshot, evidence, assumptions, policy) as features and FREEZE it as an information-set manifest; and the
 *                   ENVIRONMENT every forecast records (V03-T-196).
 *   §MR (registry)  implements METHOD_ROUTER: resolve a target + horizon (+ domain, risk policy) through the governed registry and the
 *                   horizon policy to a METHOD PLAN, or a governed refusal; and run a planned method.
 *   §EN (ensembles) consumes both: its members are planned by the router and grounded by the freezer.
 *
 * Each token has a NULL default registered by the prelude (nothing frozen; the legacy two methods), so a part is built and tested against
 * the others' absence; at integration the parts' providers replace the defaults (each part registers its own under its token, in its
 * marked block of prediction.module.ts). A part never imports another part's files — only this file.
 */
import { Injectable } from '@nestjs/common';

export const CONTEXT_FREEZER = Symbol('B25_CONTEXT_FREEZER');
export const METHOD_ROUTER = Symbol('B25_METHOD_ROUTER');

/** What a frozen information set answers the issuer (the forecast row stores the id; the FCT@v2 payload the summary). */
export interface FrozenInformationSet {
  informationSetId: string;
  manifestDigest: string;
  /** the graph revision pinned (the domain's revision head and the instant it was read as of) */
  graph: { revisionHead: number | null; knownAt: string };
  /** the twin snapshot pinned, when the subject has one */
  twin: { twinId: string; version: number; stateSetDigest: string } | null;
  /** the model inputs assembled (each with its source and digest) */
  features: Array<{ key: string; source: string; digest: string; value?: unknown }>;
  coverageGaps: string[];
  summary: Record<string, unknown>;
}

export interface FreezeRequest {
  tenantId: string; domainId: string; seriesKey: string; subjectEntityId: string | null; targetKey: string | null;
  knownAt: string; observedThrough: string | null; assumptions: string[]; actor: string; correlationId: string;
}

/** The environment a forecast was computed in (V03-T-196): digest + the facts it is made of. */
export interface ForecastEnvironment { digest: string; facts: Record<string, unknown> }

export interface ContextFreezer {
  /** null when grounding is not built (the prelude's default): the forecast is issued as before, ungrounded. */
  freeze(tx: unknown, req: FreezeRequest): Promise<FrozenInformationSet | null>;
  /** the environment of a forecast computed by method `methodRef` (implementation digest included); null in the default. */
  environment(methodRef: string): ForecastEnvironment | null;
}

/** One planned method: the registry entry it resolved to and what the policy allows it to claim at this horizon. */
export interface PlannedMethod {
  methodRef: string;            // key@version in the registry (or the legacy constant in the default)
  family: string;               // statistical | event | state | bayesian | causal | structural_judgmental | optimisation
  forecastKind: 'quantity' | 'event' | 'state' | 'regime';
  available: boolean;           // false: the method path is unavailable (retired, quarantined, failed) — §EN excludes and DISCLOSES it
  unavailableReason?: string;
  confidenceLanguage: string;   // the horizon policy's language for this horizon
}

export interface MethodPlan {
  targetKey: string | null; horizonCode: string;
  policy: { policyId: string | null; version: number | null; horizonRule: Record<string, unknown> | null };
  methods: PlannedMethod[];
}

export interface MethodRouter {
  /** the plan, or throws a governed refusal (`forecast rejected (horizon): …`) when the policy does not support the horizon */
  plan(tx: unknown, a: { tenantId: string; domainId: string; targetKey: string | null; seriesKey: string; horizonCode: string; correlationId: string }): Promise<MethodPlan>;
}

/** The prelude's defaults: nothing grounded, the legacy two quantity methods (seasonal naive, Holt-Winters) at every horizon. */
@Injectable()
export class NullContextFreezer implements ContextFreezer {
  async freeze(): Promise<FrozenInformationSet | null> { return null; }
  environment(): ForecastEnvironment | null { return null; }
}
@Injectable()
export class LegacyMethodRouter implements MethodRouter {
  async plan(_tx: unknown, a: { targetKey: string | null; horizonCode: string }): Promise<MethodPlan> {
    const m = (ref: string): PlannedMethod => ({ methodRef: ref, family: 'statistical', forecastKind: 'quantity', available: true, confidenceLanguage: 'distribution' });
    return { targetKey: a.targetKey, horizonCode: a.horizonCode, policy: { policyId: null, version: null, horizonRule: null }, methods: [m('seasonal_naive@1'), m('holt_winters@1')] };
  }
}
