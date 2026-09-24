/**
 * Phase 5 client — twins and simulations. Every read and write goes through the
 * governed envelope; the screens show what the record says, never a state
 * derived on the client. Simulated values are SYNTHETIC and are shown as such.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };

export interface Citation { kind: 'evidence' | 'claim' | 'entity' | 'forecast' | 'assumption' | 'run'; id: string; version: number; digest: string }
export interface Element {
  element_id: string; key: string; kind: 'observed' | 'estimated' | 'assumed' | 'predicted' | 'simulated'; basis_truth_state: string | null;
  value: unknown; unit: string | null; material: boolean; citations: Citation[]; health: 'complete' | 'incomplete' | 'unreadable' | 'stale';
  valid_from: string | null; valid_to: string | null; confidence: number | null; synthetic_state: boolean; version: number;
  /** A PREDICTED element carries its forecast's validation state, exactly. */
  inherited_validation?: string | null;
}
/**
 * CP-6 B21 (0081): the behaviour model's operating envelope checked by the PORT (twin.envelope_check) — one rule for a validation
 * (the version's numeric elements) and for a run (its own parameters first). Recorded with the act; never re-computed on read.
 */
export interface EnvelopeCheck {
  state: 'inside' | 'outside' | 'unchecked'; model: string | null;
  keys: Record<string, { range: [number, number]; value: number | null; source: string | null; verdict: 'inside' | 'outside' | 'unchecked' }>;
  rule?: string; note?: string;
}
/** B21: a version's fitness as the get serves it — the verdict of the latest twin.validate_version with the check and the calibration it recorded, or `none`. */
export interface TwinFitness {
  state: 'none' | 'fit' | 'unfit' | 'indeterminate'; validation_id: string | null; validated_at?: string | null; validated_by?: string | null; verdict?: string | null;
  envelope_state?: string | null; envelope?: EnvelopeCheck | null; calibration?: Record<string, unknown> | null; limitations?: string[]; reason?: string | null;
}
export interface TwinVersion {
  version: number; branch_id: string; forked_from_version: number | null; supersedes: number | null; state: 'draft' | 'admitted';
  known_at: string; observed_through: string | null; state_set_digest: string | null; element_count: number; completeness: 'complete' | 'incomplete';
  missing_keys: string[]; synthetic_state: boolean; verification_state: 'verified' | 'unverified'; admitted_at: string | null; elements?: Element[];
  /** B21 (0081, L5-I05 ValidateTwin): set only by a recorded validation; an `unfit` version opens no run. Absent from a server before 0081. */
  fitness?: TwinFitness;
}
/** B21: the validation as the port recorded it — the person's verdict over the envelope check and the calibration history the port computed. */
export interface Validation {
  validation_id: string; twin_id: string; version: number; verdict: 'fit' | 'unfit' | 'indeterminate'; prior_state: string;
  envelope: EnvelopeCheck; calibration: Record<string, unknown>; limitations: string[]; validated_at: string;
  branch_id: string; known_at: string; observed_through: string | null; state_set_digest: string | null;
  /** The runs resting on this version, NAMED and left as they are (a run is immutable; an unfit version refuses NEW runs only). */
  runs: Array<{ run_id: string; state: string; validity: string; fitness_state: string }>;
}
export type ChallengeKind = 'assumptions' | 'model' | 'constraints' | 'interpretation';
export type ChallengeState = 'open' | 'rerun_requested' | 'upheld' | 'dismissed' | 'withdrawn';
/** B21 (0081, L8-I04 ChallengeSimulation): a person's typed dispute of a completed valid run, decided by someone else (neither the opener nor the run's operator). */
export interface Challenge {
  challenge_id: string; run_id: string; kind: ChallengeKind; statement: string; disputed: string[]; state: ChallengeState;
  opened_by: string; opened_at: string; rerun_requested_by: string | null; rerun_requested_at: string | null; rerun_run_id: string | null;
  decided_by: string | null; decided_at: string | null; decision_note: string | null; withdrawn_at: string | null; withdrawal_reason: string | null;
  events?: Array<Record<string, unknown>>;
}
/** B21 (OBJ-29): the reviewer's promotion of a result as fit for a stated use — the validation, sensitivity and limitations RESTATED from the row, once. */
export interface Promotion {
  promotion_id: string; run_id: string; promoted_for: string; validation: Record<string, unknown>; sensitivity: unknown; limitations: string[];
  note: string; promoted_by: string; promoted_at: string;
}
export interface Twin {
  twin_id: string; kind: string; title: string; statement: string; boundary: string[]; owner_principal_id: string; behaviour_model_ref: string;
  validation: { status: string; envelope?: Record<string, unknown>; limitations: string[] }; synthetic_state: boolean; declared_at: string;
  versions: TwinVersion[]; events?: Array<Record<string, unknown>>; reconciliations?: Array<Record<string, unknown>>;
  propagation_pending?: Array<{ case_id: string; kind: string; state: string; propagation_state: string; propagation: string; reached_via?: string }>;
}
export interface Run {
  run_id: string; twin_id: string; twin_version: number; branch_id: string; run_kind: 'control' | 'intervention'; control_run_id: string | null;
  shock: boolean; component: string; known_at: string; observed_through: string | null; initial_state_digest: string; model_ref: string;
  /** The scenario binding the run applied — the exact SCN version and the branch's state at opening — and what the shock rests on. */
  scenario_id: string | null; scenario_branch_id: string | null; scenario_version: number | null; scenario_branch_state: 'open' | 'flipped' | 'closed' | null;
  shock_basis: 'none' | 'hypothetical' | 'scenario-branch-flipped' | 'unrecorded';
  implementation_digest: string; environment_digest: string; stochastic_mode: 'deterministic' | 'seeded'; rng: string | null; seed: number | null; samples: number | null;
  interventions: Array<Record<string, unknown>>; inputs_digest: string; outputs: { totals?: Totals; days?: Array<Record<string, unknown>> } | null;
  outputs_digest: string | null; sensitivity: { factors?: Array<{ key: string; cost_spread: string }>; outside_envelope?: boolean } | null;
  validation_status: string; outside_envelope: boolean; state: 'opened' | 'completed' | 'failed'; failure: string | null; opened_at: string; completed_at: string | null;
  events?: Array<Record<string, unknown>>; reproductions?: Array<{ verdict: string; reason: string; cold_process: boolean; environment_matches: boolean; reproduced_at: string }>;
  /** B18 (0078): the run's validity and, once invalidated, the trigger (`operator | reproduction | challenge` since B21) and its reference. */
  operator_principal_id?: string; validity?: 'valid' | 'invalidated'; invalidated_at?: string | null;
  invalidation?: { trigger?: string; trigger_ref?: string | null; reason?: string } | null; corrects_run_id?: string | null;
  /**
   * B21 (0081): the run's fitness (`fit` by a reviewer's promotion, `unfit` by an invalidation — never measured), the twin version's
   * fitness COPIED at opening, the run's OWN contract against the envelope (`unrecorded` = opened before 0081) with the acknowledgement
   * an `outside` run was admitted under, and the challenge this run is the re-run of. `challenges`/`promotion` ride the get; `live_challenges` the list.
   */
  fitness_state?: 'none' | 'fit' | 'unfit'; promoted_for?: string | null; promotion_id?: string | null;
  twin_fitness?: 'none' | 'fit' | 'unfit' | 'indeterminate';
  envelope_state?: 'inside' | 'outside' | 'unchecked' | 'unrecorded'; envelope_check?: EnvelopeCheck | null;
  envelope_ack?: { acknowledged_by: string; acknowledged_at: string; reason: string; keys: string } | null;
  challenge_id?: string | null; challenges?: Challenge[]; promotion?: Promotion | null; live_challenges?: number;
}
export interface Totals { line_stop_days: number; days_below_safety_stock: number; min_on_hand: string; first_line_stop_date: string | null; cost: { reroute: string; air: string; line_stop: string; total: string } }

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/twins`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: objectType === 'SIM' ? 'simulation' : 'twin', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const twins = {
  list: (s: Scope) => p<{ twins: Twin[]; receipt: Receipt }>(s, '/list', 'twin.read', 'TWN'),
  get: (s: Scope, id: string) => p<{ twin: Twin; receipt: Receipt }>(s, `/${id}/get`, 'twin.read', 'TWN', {}, id),
  compare: (s: Scope, id: string, a: number, b: number) => p<{ comparison: Record<string, unknown>; receipt: Receipt }>(s, `/${id}/compare`, 'twin.read', 'TWN', { a, b }, id),
  behaviourModels: (s: Scope) => p<{ models: Array<Record<string, unknown>>; kinds: Array<Record<string, unknown>>; receipt: Receipt }>(s, '/behaviour-models/list', 'twin.read', 'TWN'),
  runs: (s: Scope, twinId: string | null) => p<{ runs: Run[]; receipt: Receipt }>(s, '/simulations/list', 'simulation.read', 'SIM', twinId ? { twinId } : {}),
  run: (s: Scope, id: string) => p<{ run: Run; receipt: Receipt }>(s, `/simulations/${id}/get`, 'simulation.read', 'SIM', {}, id),
  /**
   * B21: the intake may carry `envelope: { acknowledge: true, reason }` (a run whose own contract lies outside the envelope is admitted
   * only under a twin owner's or the domain administrator's acknowledgement — the server refuses the rest) and `challengeId` beside
   * `correctsRunId` (a re-run answering a challenge). The answer names the twin's fitness at opening, the envelope check and the acknowledgement.
   */
  simulate: (s: Scope, payload: Record<string, unknown>) => p<{ run: { runId: string; outputsDigest: string; totals: Totals; state: string; twinFitness?: string; envelope?: EnvelopeCheck; envelopeAck?: Record<string, unknown> | null; challengeId?: string | null }; receipt: Receipt }>(s, '/simulations/run', 'simulation.run', 'SIM', payload),
  /**
   * B21 (0081, L5-I05 ValidateTwin; human-gated, C2): a person's verdict on an ADMITTED version — fit, unfit or indeterminate — over the
   * envelope check and the calibration history the port computes. The server refuses the twin's own owner (separation of duties), a
   * draft, and `fit` outside the envelope; the refusal is shown as it states it. Published as ValidateTwin@v1; no GraphChanged.
   */
  validate: (s: Scope, twinId: string, version: number, payload: { verdict: 'fit' | 'unfit' | 'indeterminate'; reason: string; limitations?: string[] }) =>
    p<{ validation: Validation; receipt: Receipt }>(s, `/${twinId}/versions/${version}/validate`, 'twin.version.validate', 'TWN', payload, twinId),
  /** B21 (L8-I04): open a typed challenge on a completed valid run (one live challenge per run per opener). */
  challenge: (s: Scope, runId: string, payload: { kind: ChallengeKind; statement: string; disputed: string[] }) =>
    p<{ challenge: Challenge; receipt: Receipt }>(s, `/simulations/${runId}/challenge`, 'simulation.challenge.open', 'SIM', payload, runId),
  /** The domain's challenges, newest first; `runId` narrows to one run. */
  challenges: (s: Scope, runId: string | null) =>
    p<{ challenges: Challenge[]; receipt?: Receipt }>(s, '/simulations/challenges/list', 'simulation.read', 'SIM', runId === null ? {} : { runId }),
  /** C6: the three acts are bound to the RUN (`…/simulations/:runId/challenges/:challengeId/…`); the port refuses a challenge that is not the run's. */
  rerunChallenge: (s: Scope, runId: string, challengeId: string, note: string) =>
    p<{ challenge: Challenge; receipt: Receipt }>(s, `/simulations/${runId}/challenges/${challengeId}/rerun`, 'simulation.challenge.rerun', 'SIM', { note }, runId),
  /**
   * Human-gated: neither the opener nor the run's operator decides. UPHELD invalidates the run in the same write (trigger `challenge`,
   * the withdrawn SIM version named in `invalidation`), or says `invalidation_withheld` when the run was invalidated already.
   */
  decideChallenge: (s: Scope, runId: string, challengeId: string, payload: { decision: 'upheld' | 'dismissed'; note: string }) =>
    p<{ challenge: Challenge; invalidation?: { withdrawnVersion?: number; changed?: unknown; event?: unknown } | null; invalidation_withheld?: string | null; receipt: Receipt }>(
      s, `/simulations/${runId}/challenges/${challengeId}/decide`, 'simulation.challenge.decide', 'SIM', payload, runId),
  withdrawChallenge: (s: Scope, runId: string, challengeId: string, reason: string) =>
    p<{ challenge: Challenge; receipt: Receipt }>(s, `/simulations/${runId}/challenges/${challengeId}/withdraw`, 'simulation.challenge.withdraw', 'SIM', { reason }, runId),
  /** B21 (OBJ-29; human-gated): a reviewer other than the operator promotes a completed, valid, undisputed result as fit for a stated use — once. No outbox event. */
  promote: (s: Scope, runId: string, payload: { promotedFor: string; limitations?: string[]; note: string }) =>
    p<{ promotion: Promotion; receipt: Receipt }>(s, `/simulations/${runId}/promote`, 'simulation.result.promote', 'SIM', payload, runId),
  /** No attestation travels with the request: the product establishes availability and executes the stored contract in a separate process itself. */
  reproduce: (s: Scope, id: string) => p<{ reproduction: { verdict: string; expected: string; actual: string | null; reason: string; environmentMatches: boolean; coldProcess: boolean; unavailable: string[] }; receipt: Receipt }>(s, `/simulations/${id}/reproduce`, 'simulation.reproduce', 'SIM', {}, id),
  compareRuns: (s: Scope, runIds: string[]) => p<{ comparison: { control_run_id: string; runs: Array<{ run_id: string; run_kind: string; interventions: Array<Record<string, unknown>>; totals: Totals; carrying: string[] }>; synthetic: boolean }; receipt: Receipt }>(s, '/simulations/compare', 'simulation.read', 'SIM', { runIds }),
};
