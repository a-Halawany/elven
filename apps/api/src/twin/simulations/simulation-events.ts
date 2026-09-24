/**
 * THE RUN'S THREE ANNOUNCED TRANSITIONS (CP-6 B18, 0078; design §2.1 #2, #3, #9, §2.3; D6, D7, D9, D15, D20) — pure builders.
 *
 * SimulationStarted@v1 (L8-I02) is what the OPENING write of POST …/twins/simulations/run publishes: the resolved
 * artefacts the contract bound — the twin version and branch, the scenario version and branch state, the model and
 * its pinned implementation, the environment beyond its digest (node, platform, arch), the stochastic contract with its
 * seed, the initial-state and inputs digests, the two cut-offs, the execution identity — and state `opened`.
 *
 * SimulationCompleted@v1 (L8-I03) is ONE name with two states: `completed` from the completing write (the outputs
 * digest, the totals, the impacts against the control, the uncertainty, the sensitivity, the validation, the
 * reproducibility digests, the SIM object, the RESOURCE EVIDENCE measured around the execution — elapsed, samples,
 * process, memory — which the row carries too) and `failed` from the failing write (the failure named, the outputs
 * declared missing: `outputs: null, missing_outputs: 'all'` — a partial run is never returned as a result).
 *
 * SimulationInvalidated@v1 (L8-I05) is what the invalidate route publishes (a person's act, trigger `operator`) and
 * what the reproduce write publishes on an unreproducible verdict caused by a withdrawn or retired input (trigger
 * `reproduction`, the reproduction named): the result marked unfit with its reason, the SIM version admitted as
 * withdrawn, the run's identity as the port read it, and the dependants the port enumerated (packages, commitments,
 * decisions, twins, runs — each cut at 200) — beside GraphChanged/simulation.invalidated (change-events.ts).
 *
 * The 0066+ convention (read-events.md §5(1)b): `schema`, `schema_version`, stable ids and versions (never bodies), the
 * minimum transition data, `temporal.known_at`, `cause: {action, actor (the bare principal), target_type, target_id}`.
 * No read, no service import: the write hands the builder what it holds.
 *
 * CP-6 B21 (0081): SimulationStarted carries the run's `twin_fitness` (the version's state copied at opening), its OWN
 * `envelope` check, the `envelope_ack` recorded (a twin owner's or the domain administrator's) and the `challenge_id` a
 * re-run answers; SimulationInvalidated's trigger vocabulary gains `challenge` (an upheld challenge, under
 * simulation.challenge.decide, `trigger_ref` the challenge); and ChallengeSimulation@v1 (L8-I04) — ONE name, five states
 * (opened | rerun_requested | upheld | dismissed | withdrawn) — is built PURE from the challenge row as read back in the
 * write that changed it, with the run's identity beside it and, on an upheld decision, the invalidation it caused.
 */
import { LIFECYCLE_EVENT_LIST_MAX, type OutboxRow } from '../../graph/subscriptions/change-events.js';
import type { OpenedRun, Resource, ShockBasis } from '../simulation.capabilities.js';
import type { EnvelopeCheck } from '../twin.capabilities.js';

type Row = Record<string, unknown>;

/** The resource evidence of an execution (AU-TWN-0033): declared beside the port that stores it (simulation.capabilities.ts), re-exported here for the builders' callers. */
export type { Resource };

/** The method the withdrawn SIM version names (the operator's act and the reproduction's alike: one withdrawing method for a run). */
export const SIMULATION_INVALIDATE_METHOD_REF = 'simulation.run.invalidate@1.0.0';

const obj = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const nullable = (v: unknown): unknown => (v === undefined ? null : v);

/**
 * SimulationStarted@v1 — built in the opening write from the intake, the port's answer (`simulation.open_run`: the
 * snapshot digest, the cut-offs, the branch, the controls) and what the service resolved before the port ran (the
 * model, the environment, the stochastic contract, the shock's basis, the scenario binding). The operator is the cause.
 */
export function simulationStartedEvent(a: {
  runId: string; opened: OpenedRun;
  intake: { twinId: string; twinVersion: number; runKind: 'control' | 'intervention'; controlRunId: string | null; correctsRunId: string | null; shock: boolean; component: string;
            stochastic: { mode: 'deterministic' } | { mode: 'seeded'; seed: number; samples: number; jitter: Record<string, number> } };
  scenario: { scenario_id: string; version: number; branch_id: string; branch_state: string; flip_event_id: string | null } | null;
  shockBasis: ShockBasis; modelRef: string; implementationDigest: string; environmentDigest: string;
  environment: { node: string; platform: string; arch: string }; inputsDigest: string; rng: string | null;
  /** B21 (0081): the twin version's fitness at opening, the run's OWN envelope check, the acknowledgement recorded (or null), the challenge answered (or null). */
  twinFitness: string; envelope: EnvelopeCheck; envelopeAck: Record<string, unknown> | null; challengeId: string | null;
  operator: string; occurredAt: string;
}): OutboxRow {
  const st = a.intake.stochastic;
  return { eventType: 'SimulationStarted', payload: {
    schema: 'SimulationStarted', schema_version: 'v1',
    run_id: a.runId,
    twin: { twin_id: a.intake.twinId, version: a.intake.twinVersion, branch_id: a.opened.branch_id },
    run_kind: a.intake.runKind, control_run_id: a.intake.controlRunId, corrects_run_id: a.intake.correctsRunId,
    scenario: a.scenario === null ? null : { scenario_id: a.scenario.scenario_id, version: a.scenario.version, branch_id: a.scenario.branch_id, branch_state: a.scenario.branch_state, flip_event_id: a.scenario.flip_event_id },
    shock: a.intake.shock, shock_basis: a.shockBasis, component: a.intake.component,
    model: { ref: a.modelRef, implementation_digest: a.implementationDigest },
    environment: { digest: a.environmentDigest, node: a.environment.node, platform: a.environment.platform, arch: a.environment.arch },
    stochastic: st.mode === 'seeded' ? { mode: 'seeded', rng: a.rng, seed: st.seed, samples: st.samples, jitter: st.jitter } : { mode: 'deterministic' },
    initial_state_digest: a.opened.initial_state_digest, inputs_digest: a.inputsDigest,
    cutoffs: { known_at: a.opened.known_at, observed_through: a.opened.observed_through },
    execution_identity: { operator: a.operator, synthetic_state: a.opened.synthetic_state, verification_state: a.opened.verification_state },
    // 0081 (B21): the fitness and envelope contract bound at opening
    twin_fitness: a.twinFitness,
    envelope: { state: a.envelope.state, model: a.envelope.model, keys: a.envelope.keys },
    envelope_ack: a.envelopeAck, challenge_id: a.challengeId,
    state: 'opened',
    temporal: { known_at: a.occurredAt },
    cause: { action: 'simulation.run', actor: a.operator, target_type: 'SIM', target_id: a.runId },
  } };
}

/**
 * SimulationCompleted@v1 — `completed` from the completing write (the row as read at completion, the outputs digest,
 * the totals, the impacts against the control, the sensitivity, the validation, the resource evidence, the SIM object)
 * or `failed` from the failing write (the failure; `outputs_digest`, `totals`, `sim_object` null; `missing_outputs: 'all'`).
 * The deltas of an intervention run are this run's totals minus the control's (`line_stop_days`, `total_cost`); a
 * control run compares to nothing (`deltas: null`).
 */
export function simulationCompletedEvent(a: {
  runId: string; state: 'completed' | 'failed'; run: Row;
  outputsDigest: string | null; totals: unknown;
  impacts: { control_run_id: string | null; deltas: { line_stop_days: number; total_cost: string } | null };
  sensitivity: { relative: number; outside_envelope: boolean; factors: unknown[] } | null;
  validation: { validation_status: string | null; inherited_validation: unknown[]; outside_envelope: boolean };
  resource: Resource;
  simObject: { object_id: string; version: 1; header_digest: string } | null;
  failure: string | null; actor: string; occurredAt: string;
}): OutboxRow {
  const r = a.run;
  const seeded = r['stochastic_mode'] === 'seeded';
  return { eventType: 'SimulationCompleted', payload: {
    schema: 'SimulationCompleted', schema_version: 'v1',
    run_id: a.runId, state: a.state,
    twin: { twin_id: nullable(r['twin_id']), version: r['twin_version'] === undefined || r['twin_version'] === null ? null : Number(r['twin_version']), branch_id: nullable(r['branch_id']) },
    run_kind: nullable(r['run_kind']), control_run_id: nullable(r['control_run_id']), component: nullable(r['component']),
    outputs_digest: a.state === 'completed' ? a.outputsDigest : null,
    totals: a.state === 'completed' ? a.totals : null,
    impacts: { compared_to: a.impacts.control_run_id, deltas: a.state === 'completed' ? a.impacts.deltas : null },
    uncertainty: {
      stochastic: seeded ? { mode: 'seeded', samples: r['samples'] === null || r['samples'] === undefined ? null : Number(r['samples']), jitter: nullable(r['jitter']) } : { mode: 'deterministic' },
      validation_status: a.validation.validation_status,
    },
    sensitivity: a.sensitivity === null ? null : { relative: a.sensitivity.relative, outside_envelope: a.sensitivity.outside_envelope, factors: a.sensitivity.factors.length },
    validation: { validation_status: a.validation.validation_status, inherited_validation: a.validation.inherited_validation, outside_envelope: a.validation.outside_envelope },
    reproducibility: { implementation_digest: nullable(r['implementation_digest']), environment_digest: nullable(r['environment_digest']),
                       inputs_digest: nullable(r['inputs_digest']), initial_state_digest: nullable(r['initial_state_digest']) },
    resource_evidence: { elapsed_ms: a.resource.elapsed_ms, samples_run: a.resource.samples_run, process: { ...a.resource.process }, memory_rss_bytes: a.resource.memory_rss_bytes },
    sim_object: a.state === 'completed' ? a.simObject : null,
    failure: a.state === 'failed' ? a.failure : null,
    missing_outputs: a.state === 'failed' ? 'all' : null,
    temporal: { known_at: a.occurredAt },
    cause: { action: 'simulation.run.complete', actor: a.actor, target_type: 'SIM', target_id: a.runId },
  } };
}

/**
 * SimulationInvalidated@v1 — built in the invalidating write from the port's answer (`simulation.invalidate_run`: the
 * instant, the trigger and its reference, the run's identity as read, the dependants enumerated and cut) and the
 * write's own facts (the reason, the SIM version admitted as withdrawn, the actor, the bound action — a person's
 * `simulation.run.invalidate`, the reproduction's `simulation.reproduce`, or — 0081 — the upheld challenge's
 * `simulation.challenge.decide`, trigger `challenge`).
 */
export function simulationInvalidatedEvent(a: {
  invalidated: Row; withdrawnVersion: number; trigger: 'operator' | 'reproduction' | 'challenge'; reason: string; actor: string; occurredAt: string;
  action: 'simulation.run.invalidate' | 'simulation.reproduce' | 'simulation.challenge.decide';
}): OutboxRow {
  const v = a.invalidated;
  const run = obj(v['run']);
  const dependants = obj(v['dependants']);
  const runId = String(v['run_id']);
  return { eventType: 'SimulationInvalidated', payload: {
    schema: 'SimulationInvalidated', schema_version: 'v1',
    run_id: runId, reason: a.reason, trigger: a.trigger, trigger_ref: nullable(v['trigger_ref']), invalidated_at: nullable(v['invalidated_at']),
    withdrawn_version: a.withdrawnVersion,
    run: { twin_id: nullable(run['twin_id']), twin_version: nullable(run['twin_version']), branch_id: nullable(run['branch_id']), run_kind: nullable(run['run_kind']),
           control_run_id: nullable(run['control_run_id']), scenario_id: nullable(run['scenario_id']), scenario_version: nullable(run['scenario_version']),
           outputs_digest: nullable(run['outputs_digest']), inputs_digest: nullable(run['inputs_digest']), header_digest: nullable(run['header_digest']),
           completed_at: nullable(run['completed_at']), operator_principal_id: nullable(run['operator_principal_id']), validation_status: nullable(run['validation_status']) },
    dependants: { packages: dependants['packages'] ?? [], commitments: dependants['commitments'] ?? [], decisions: dependants['decisions'] ?? [],
                  twins: dependants['twins'] ?? [], simulations: dependants['simulations'] ?? [] },
    temporal: { known_at: a.occurredAt },
    cause: { action: a.action, actor: a.actor, target_type: 'SIM', target_id: runId },
  } };
}

// ───────────────────────── 0081 (B21): the challenge ─────────────────────────

/** The five states ChallengeSimulation@v1 announces — one name, the write says which. */
export type ChallengeState = 'opened' | 'rerun_requested' | 'upheld' | 'dismissed' | 'withdrawn';
/** The bound action of the write that changed the challenge. */
export type ChallengeAction = 'simulation.challenge.open' | 'simulation.challenge.rerun' | 'simulation.challenge.decide' | 'simulation.challenge.withdraw';

/** A timestamptz as the driver returns it (a Date) keeps its instant; anything else passes as it is (null for absent). */
const inst = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : nullable(v));

/**
 * ChallengeSimulation@v1 — built in the write that changed the challenge from the challenge ROW as read back (the id, the
 * run, the kind, the statement, the disputed keys cut at the ceiling, who opened it and when, the re-run link, the
 * decision, the withdrawal) with the run's identity beside it (`run`: as the row stands after the write — an upheld
 * decision reads `validity invalidated`, `fitness_state unfit`) and, on an upheld decision, the invalidation it caused or
 * why it was withheld (`already_invalidated`). The cause is the act on the RUN (SIM) — the route is bound to the run (C6).
 */
export function challengeSimulationEvent(a: {
  challenge: Row; state: ChallengeState; action: ChallengeAction;
  invalidation: { invalidated_at: unknown; withdrawn_version: number } | null; invalidationWithheld: 'already_invalidated' | null;
  actor: string; occurredAt: string;
}): OutboxRow {
  const c = a.challenge;
  const run = obj(c['run']);
  const runId = String(c['run_id']);
  const disputed = Array.isArray(c['disputed']) ? (c['disputed'] as unknown[]) : [];
  return { eventType: 'ChallengeSimulation', payload: {
    schema: 'ChallengeSimulation', schema_version: 'v1',
    challenge_id: String(c['challenge_id']), run_id: runId, state: a.state,
    kind: nullable(c['kind']), statement: nullable(c['statement']),
    disputed: disputed.slice(0, LIFECYCLE_EVENT_LIST_MAX), truncated: disputed.length > LIFECYCLE_EVENT_LIST_MAX,
    opened_by: nullable(c['opened_by']), opened_at: inst(c['opened_at']),
    rerun_run_id: nullable(c['rerun_run_id']), rerun_requested_at: inst(c['rerun_requested_at']),
    decided_by: nullable(c['decided_by']), decided_at: inst(c['decided_at']), decision_note: nullable(c['decision_note']),
    withdrawal_reason: nullable(c['withdrawal_reason']),
    run: { twin_id: nullable(run['twin_id']), twin_version: nullable(run['twin_version']), run_kind: nullable(run['run_kind']), control_run_id: nullable(run['control_run_id']),
           operator_principal_id: nullable(run['operator_principal_id']), validity: nullable(run['validity']), fitness_state: nullable(run['fitness_state']), promoted_for: nullable(run['promoted_for']) },
    invalidation: a.invalidation, invalidation_withheld: a.invalidationWithheld,
    temporal: { known_at: a.occurredAt },
    cause: { action: a.action, actor: a.actor, target_type: 'SIM', target_id: runId },
  } };
}
