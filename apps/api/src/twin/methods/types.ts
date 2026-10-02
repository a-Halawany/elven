/**
 * CP-6 B29 (0092 §0) — THE SHARED VOCABULARY of the method fabric (§C) and the constraint engine (§D). Frozen by the integrator's
 * prelude: the parts implement against these types and do not change them (a change is the integrator's, recorded in §I).
 *
 * A METHOD ADAPTER is one behaviour model (twin.behaviour_models.method_ref) of one method FAMILY. It is PURE over its input — no clock,
 * no I/O, randomness only from the declared seed — so a run is reproducible from its recorded input and the adapter's pinned
 * implementation digest (the supply-flow@1 precedent, twin/models/supply-flow.ts). Containment is the fabric's (§C), not the adapter's:
 * an adapter may be run out of process under time and memory bounds and is quarantined after repeated faults.
 *
 * The CONSTRAINT GATE checks a subject (a plan, a run's inputs, a run's outputs) against the domain's declared constraint sets (§D):
 * topology, conservation and business rules. Its outcome is satisfied, violated or indeterminate — an evaluation that did not finish is
 * INDETERMINATE and is never read as satisfied.
 */

export const METHOD_FAMILIES = ['flow', 'discrete-event', 'system-dynamics', 'agent-based', 'optimisation', 'war-gaming', 'counterfactual'] as const;
export type MethodFamily = (typeof METHOD_FAMILIES)[number];

/** One state element as a method reads it (the twin version's element, already resolved by the runtime). */
export interface MethodElement { key: string; value: unknown; unit: string | null }

export interface MethodInput {
  modelRef: string;
  /** The run's parameters as the operator gave them (validated by the adapter). */
  params: Record<string, unknown>;
  /** The twin version's elements the method reads (the runtime passes every element; the adapter reads what it declares it requires). */
  elements: MethodElement[];
  horizonDays: number;
  /** The seed of a seeded run; null for a deterministic one. */
  seed: number | null;
}

export interface MethodOutput {
  /** Per-step rows (a day, a tick, a turn) — canonicalised strings where a quantity is reported, as supply-flow@1 does. */
  series: Array<Record<string, string | number | boolean | null>>;
  /** The headline results (totals, the objective's value, the verdict of a war game …). */
  summary: Record<string, string | number | boolean | null>;
  /** Stock and flow quantities by key, for the conservation checks of §D (optional: a method without flows omits it). */
  balances?: Array<{ key: string; opening: number; inflow: number; outflow: number; closing: number }>;
}

export interface MethodAdapter {
  modelRef: string;
  family: MethodFamily;
  /** The sha256 of the implementation's bytes, pinned in twin.behaviour_models.implementation_digest. */
  digest: string;
  /** Element key prefixes the method requires of the twin version. */
  requiredInputs: readonly string[];
  /** Every problem with the input, in words; an empty list is a valid input. */
  validate(input: MethodInput): string[];
  run(input: MethodInput): MethodOutput;
}

export type ConstraintKind = 'topology' | 'conservation' | 'business_rule';
export type ConstraintOutcome = 'satisfied' | 'violated' | 'indeterminate';

export interface ConstraintViolation {
  constraintKey: string;
  kind: ConstraintKind;
  /** The bound the subject was checked against, in the constraint's unit (e.g. "≤ 1800 pallets"). */
  bound: string;
  /** What the subject has (e.g. "2350 pallets on 2026-10-14"). */
  observed: string;
  message: string;
}

export interface ConstraintVerdict {
  outcome: ConstraintOutcome;
  setId: string | null;
  setVersion: number | null;
  violations: ConstraintViolation[];
  /** Why the outcome is indeterminate (a timeout, a missing input), never set when it is not. */
  indeterminateReason?: string;
}

/** What is checked: a plan (quantities per key and day), a run's inputs or a run's outputs. */
export interface ConstraintSubject {
  kind: 'plan' | 'run_input' | 'run_output';
  /** The subject's own id (a plan's key, a run's id). */
  ref: string;
  /** Quantities by key and date (a plan's stock and flows, a run's balances). */
  quantities: Array<{ key: string; date: string | null; value: number; unit: string | null }>;
  /** Links between sites and routes for topology checks (from → to). */
  edges?: Array<{ from: string; to: string; kind: string }>;
}

/** The gate §C calls at run opening and completion, and §D's plan check route calls directly. */
export interface ConstraintGate {
  check(scope: { tenantId: string; domainId: string }, subject: ConstraintSubject, setKeys?: string[]): Promise<ConstraintVerdict>;
}
export const CONSTRAINT_GATE = Symbol('CONSTRAINT_GATE');
