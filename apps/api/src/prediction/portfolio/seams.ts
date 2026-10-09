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
  /** B25-F1: the registry entry AS PLANNED — {method_ref, family, implementation_ref, implementation_digest, parameters, declarations,
   *  validation, evaluation_profile, …}. A caller that executes later PERSISTS it with its run and executes from it (never from a process
   *  cache); absent in the prelude's default (the legacy methods need no entry). Opaque to every part but the router's. */
  pin?: Record<string, unknown>;
}

export interface MethodPlan {
  targetKey: string | null; horizonCode: string;
  policy: { policyId: string | null; version: number | null; horizonRule: Record<string, unknown> | null };
  methods: PlannedMethod[];
  /** B25-F1: the route the plan was recorded as (null in the default: nothing recorded) — closed by closeRoute when the caller finishes */
  routeId?: string | null;
  /** B25-F1: the TARGET VERSION planned — the target row (definition included) and its definition_digest (null: no target) */
  target?: Record<string, unknown> | null;
}

/** B25-F2: what a member's output MEANS — carried through the router so an ensemble never combines outputs that only look alike. */
export interface OutputSemantics {
  /** future_level (the series' value or window mean ahead) | effect (a causal effect) | objective_value (an optimisation's objective) |
   *  event_probability | state_probabilities | regime_probabilities */
  meaning: string;
  /** the temporal aggregation: `value` (the series' value on the target day), `window_mean:<n>d`, `effect:<n>d`, `objective`, `window:<n>d`, `categorical` */
  aggregation: string;
  unit: string;
  /** predictive_distribution | effect_interval | scenario_band | credible_band | categorical */
  uncertainty: string;
  /** the quantity in words (e.g. "the 60-day mean ending at the target day") */
  statement: string;
}

export interface MethodRouter {
  /** the plan, or throws a governed refusal (`forecast rejected (horizon): …`) when the policy does not support the horizon */
  plan(tx: unknown, a: { tenantId: string; domainId: string; targetKey: string | null; seriesKey: string; horizonCode: string; correlationId: string }): Promise<MethodPlan>;
  /** B25-F1: close the plan's ROUTE when the caller is done with it — `issued` (bound to the forecast it issued) or `refused` (with the
   *  governed refusal text) — in the caller's transaction. A route already closed is left as it is. Absent in the default (no routes). */
  closeRoute?(tx: unknown, a: { routeId: string; tenantId: string; domainId: string; outcome: 'issued' | 'refused'; refusal?: string; refusalClass?: string; correlationId: string }): Promise<Record<string, unknown> | null>;
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
