/**
 * TWIN EVENTS — CP-6 B18 (0078, L5-I04): TwinStateChanged@v1, built PURE and published from the transaction that
 * makes the transition (ES-19-001), at the twin module's two sites:
 *
 *   version.admitted     the admit route (twin.version.admit) — the announcement carries the version, the branch and
 *                        what it supersedes, the VARIABLES THAT CHANGED against the superseded version (added, removed,
 *                        a value, unit or validity that differs), the confidence each carries, the freshness (both
 *                        cut-offs, the completeness, the missing keys) and the DEPENDENCY IMPACTS: the runs that rest
 *                        on the superseded version, named and left as they are (a run is immutable; its invalidation is
 *                        a reproduction's or the operator's act, D6);
 *   version.unverified   the twins consumer's applyItem, in the item's own transaction, when a cited object or a
 *                        boundary entity changed and twin.apply_subscription_mark marked the version — `caused_by`
 *                        names the GraphChanged that did it. `version.reverified` is vocabulary only: no port writes it
 *                        (D4), and the walk's own unverification is announced by its GraphChanged/invalidation.assessed.
 *
 * The event names ids, versions and digests — never the elements' bodies; every list that can grow is cut at
 * LIFECYCLE_EVENT_LIST_MAX with `truncated` said (D20). No read happens here: the write hands the builder what it
 * holds, so the harness proves the announcement on a live admission and the unit test proves the builder key by key.
 *
 * CP-6 B21 (0081, L5-I05): ValidateTwin@v1 — the register's own name — built PURE from the validate port's answer
 * (`twin.validate_version`: the verdict, what stood before, the ENVELOPE CHECK and the CALIBRATION summary the port
 * computed, the runs resting on the version, the version's digest and cut-offs) in the validating write; no GraphChanged
 * follows (a validation changes no fact; no consumer selects by it — the ReviewRequested precedent).
 */
import { LIFECYCLE_EVENT_LIST_MAX, cutList, type OutboxRow } from '../../graph/subscriptions/change-events.js';
import type { EnvelopeCheck } from '../twin.capabilities.js';

type Row = Record<string, unknown>;

/** A state element as the announcement compares it: the row's key, kind, value, unit, validity, confidence, health and citations. */
export interface ElementRow { key: string; kind: string; value: unknown; unit: string | null; valid_from: string | null; confidence: number | null; health: string; citations: unknown[] }

/** What a variable was, or is: the value, its unit and the day it holds from. */
export interface VariableState { value: unknown; unit: string | null; valid_from: string | null }

export interface ChangedVariable {
  key: string; kind: string; change: 'added' | 'removed' | 'changed';
  from: VariableState | null; to: VariableState | null;
  /** The confidence the element carries now (the prior's for a removed one). */
  confidence: number | null;
  /** How many citations the element carries now (the prior's for a removed one). */
  citations: number;
}

const stateOf = (e: ElementRow): VariableState => ({ value: e.value, unit: e.unit, valid_from: e.valid_from });
const same = (a: VariableState, b: VariableState): boolean => JSON.stringify(a.value) === JSON.stringify(b.value) && a.unit === b.unit && a.valid_from === b.valid_from;
const cut = <T>(xs: T[]): T[] => xs.slice(0, LIFECYCLE_EVENT_LIST_MAX);

/**
 * The variables that changed between two element sets: keys added, removed, or whose value, unit or valid_from
 * differ — in key order. A first version (no prior) adds every element; a carried element whose semantics are
 * unchanged is not listed (the carry copies it as it was).
 */
export function changedVariablesOf(prior: ElementRow[] | null, next: ElementRow[]): ChangedVariable[] {
  const before = new Map<string, ElementRow>((prior ?? []).map((e) => [e.key, e]));
  const after = new Map<string, ElementRow>(next.map((e) => [e.key, e]));
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const out: ChangedVariable[] = [];
  for (const key of keys) {
    const a = before.get(key); const b = after.get(key);
    if (a === undefined && b !== undefined) { out.push({ key, kind: b.kind, change: 'added', from: null, to: stateOf(b), confidence: b.confidence, citations: b.citations.length }); continue; }
    if (a !== undefined && b === undefined) { out.push({ key, kind: a.kind, change: 'removed', from: stateOf(a), to: null, confidence: a.confidence, citations: a.citations.length }); continue; }
    if (a === undefined || b === undefined) continue;
    if (same(stateOf(a), stateOf(b))) continue;
    out.push({ key, kind: b.kind, change: 'changed', from: stateOf(a), to: stateOf(b), confidence: b.confidence, citations: b.citations.length });
  }
  return out;
}

export interface TwinStateChangedArgs {
  twinId: string; version: number; branchId: string; supersedes: number | null; forkedFromVersion: number | null;
  change: 'version.admitted' | 'version.unverified';
  stateSetDigest: string | null; headerDigest: string | null; completeness: string | null; missingKeys: string[]; syntheticState: boolean;
  knownAt: string; observedThrough: string | null;
  verificationState: 'verified' | 'unverified';
  changedVariables: ChangedVariable[];
  /** The runs resting on the SUPERSEDED version (an admission); null where the change names none (the consumer's mark). */
  dependencyImpacts: { runs: Array<{ run_id: string; state: string; validity: string }>; truncated: boolean } | null;
  /** The mark's reason (the consumer's site); null on an admission. */
  reason: string | null;
  /** The GraphChanged that caused the mark; null on an admission. */
  causedBy: { outbox_event_id: string; change_kind: string } | null;
  action: string; actor: string; occurredAt: string;
}

/** TwinStateChanged@v1 — one builder for both changes; the write says which. */
export function twinStateChangedEvent(a: TwinStateChangedArgs): OutboxRow {
  const changed = cut(a.changedVariables);
  return {
    eventType: 'TwinStateChanged',
    payload: {
      schema: 'TwinStateChanged', schema_version: 'v1',
      twin_id: a.twinId, version: a.version, branch_id: a.branchId, supersedes: a.supersedes, forked_from_version: a.forkedFromVersion,
      change: a.change, state_set_digest: a.stateSetDigest, header_digest: a.headerDigest, verification_state: a.verificationState,
      changed_variables: changed,
      confidence: changed.filter((v) => v.confidence !== null).map(({ key, confidence }) => ({ key, confidence })),
      freshness: { known_at: a.knownAt, observed_through: a.observedThrough, completeness: a.completeness, missing_keys: a.missingKeys },
      dependency_impacts: a.dependencyImpacts,
      reason: a.reason,
      caused_by: a.causedBy,
      truncated: a.changedVariables.length > LIFECYCLE_EVENT_LIST_MAX,
      temporal: { known_at: a.occurredAt },
      cause: { action: a.action, actor: a.actor, target_type: 'TWN', target_id: a.twinId },
    },
  };
}

// ───────────────────────── 0081 (B21): the validation ─────────────────────────

export interface ValidateTwinArgs {
  twinId: string; version: number; branchId: string | null; validationId: string;
  verdict: string; priorState: string;
  /** The port's check — the version's numeric elements against the model's declared ranges (horizon_days unchecked here: a run parameter). */
  envelope: EnvelopeCheck;
  /** The port's summary of twin.reconciliations since the previous validation (count 0 is said). */
  calibration: Row;
  limitations: string[];
  /** The runs resting on this version, as the port named them (uncut; the builder cuts and says so). */
  runs: Row[];
  stateSetDigest: string | null; knownAt: string | null; observedThrough: string | null;
  actor: string; occurredAt: string;
}

/**
 * ValidateTwin@v1 — the person's verdict on an admitted version, from the validating write (twin.version.validate): the
 * envelope check and the calibration history AS THE PORT COMPUTED THEM, the limitations, the runs resting on the version
 * (named, never altered — a run is immutable; an unfit version refuses NEW runs only), the version's digest and cut-offs.
 */
export function validateTwinEvent(a: ValidateTwinArgs): OutboxRow {
  const limitations = cutList(a.limitations);
  const runs = cutList(a.runs);
  return {
    eventType: 'ValidateTwin',
    payload: {
      schema: 'ValidateTwin', schema_version: 'v1',
      twin_id: a.twinId, version: a.version, branch_id: a.branchId, validation_id: a.validationId,
      verdict: a.verdict, prior_state: a.priorState,
      envelope: { state: a.envelope.state, model: a.envelope.model, keys: a.envelope.keys },
      calibration: a.calibration,
      limitations: limitations.list,
      dependency_impacts: { runs: runs.list, truncated: runs.truncated },
      state_set_digest: a.stateSetDigest,
      freshness: { known_at: a.knownAt, observed_through: a.observedThrough },
      truncated: limitations.truncated,
      temporal: { known_at: a.occurredAt },
      cause: { action: 'twin.version.validate', actor: a.actor, target_type: 'TWN', target_id: a.twinId },
    },
  };
}
