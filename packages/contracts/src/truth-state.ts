/**
 * Truth-state model. (ADR-P0-06)
 *
 * Canonical stored enum: Volume 7 Appendix E — nine values.
 * Lifecycle state, correction state, and decision/display state are SEPARATE
 * dimensions and are never collapsed into truth_state (Vol 9 STATE SEPARATION).
 */

export const TRUTH_STATES = [
  'observed',
  'asserted',
  'extracted',
  'inferred',
  'assessed',
  'synthetic',
  'decided',
  'disputed',
  'withdrawn',
] as const;
export type TruthState = (typeof TRUTH_STATES)[number];

/** Lifecycle states (Vol 7 Appendix E `lifecycle_state`). */
export const LIFECYCLE_STATES = [
  'proposed',
  'admitted',
  'active',
  'disputed',
  'corrected',
  'withdrawn',
  'superseded',
  'archived',
  'deleted',
] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/**
 * Cross-volume compatibility mappings — documented and fixture-tested.
 * Key: source vocabulary term. Value: canonical treatment.
 */
export const TRUTH_STATE_COMPAT: Record<
  string,
  { canonical: TruthState } | { dimension: 'lifecycle' | 'correction' | 'display'; note: string }
> = {
  // Volume 3 Ch.20 / Volume 4 Ch.27
  claimed: { canonical: 'asserted' },
  superseded: {
    dimension: 'lifecycle',
    note: 'lifecycle_state=superseded plus `supersedes` header link; not a truth state',
  },
  // Volume 7 Ch.22
  simulated: { canonical: 'synthetic' },
  corrected: {
    dimension: 'correction',
    note: 'new version linked via `correction_of`; display state derived from linkage',
  },
  // Volume 8 / Volume 9 display vocabularies
  recommended: {
    dimension: 'display',
    note: 'derived from object type (Recommendation) + truth state; never stored in truth_state',
  },
  indeterminate: {
    dimension: 'display',
    note: 'shown when required truth state is unresolvable; storage keeps object non-decision-active',
  },
  unknown: {
    dimension: 'display',
    note: 'PRD glossary synonym of indeterminate; same treatment',
  },
} as const;

export function isTruthState(v: string): v is TruthState {
  return (TRUTH_STATES as readonly string[]).includes(v);
}

export function isLifecycleState(v: string): v is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(v);
}

/**
 * Consistency rule (ADR-P0-06): truth_state='synthetic' requires the
 * synthetic_state marker to be true. (The marker may also be true for
 * synthetic-derived content whose truth_state was governed upward.)
 */
export function syntheticConsistencyOk(truthState: TruthState, syntheticState: boolean): boolean {
  return truthState !== 'synthetic' || syntheticState === true;
}

/** Scope model (ADR-P0-04). */
export const SCOPES = ['PLATFORM', 'TENANT', 'DOMAIN'] as const;
export type Scope = (typeof SCOPES)[number];

/** Consequence classes (Vol 5 Ch.58). */
export const CONSEQUENCE_CLASSES = ['C0', 'C1', 'C2', 'C3', 'C4'] as const;
export type ConsequenceClass = (typeof CONSEQUENCE_CLASSES)[number];
