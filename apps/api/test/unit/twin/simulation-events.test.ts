/**
 * The run's three announced transitions at the function boundary (CP-6 B18; design §2.1 #2, #3, #9, §2.3; D6, D9, D15,
 * D20): the PURE builders pinned key by key on uuid fixtures — SimulationStarted@v1 from the intake, the port's answer and
 * the resolved artefacts (deterministic and seeded, with and without a scenario); SimulationCompleted@v1 in its two states
 * (`completed` with the totals, the impacts against the control, the resource evidence and the SIM object; `failed` with
 * the outputs declared missing — the state the harness cannot provoke deterministically is pinned HERE); and
 * SimulationInvalidated@v1 from the port's answer under the two triggers and their bound actions. No database: what the
 * B18 harness proves on live runs (S1(2)(3), S2(b)(c)), this holds on the builders.
 */
import { describe, expect, it } from 'vitest';
import type { OpenedRun } from '../../../src/twin/simulation.capabilities.js';
import { SIMULATION_INVALIDATE_METHOD_REF, simulationCompletedEvent, simulationInvalidatedEvent, simulationStartedEvent, type Resource } from '../../../src/twin/simulations/simulation-events.js';

type Row = Record<string, unknown>;
let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190e1f2-a3b4-7000-8000-${h}`; };
const RUN = uid(); const TWIN = uid(); const CONTROL = uid(); const OPERATOR = uid(); const SCN = uid(); const BRANCH = uid(); const FLIP = uid();
const AT = '2026-09-17T12:00:00.000Z';
const DIGEST = 'd'.repeat(64);

const opened: OpenedRun = { initial_state: [], initial_state_digest: '1'.repeat(64), known_at: '2026-09-17T11:59:00.000Z', observed_through: '2024-01-17', branch_id: 'actual',
                            synthetic_state: false, controls: { classification: 'internal' }, verification_state: 'verified', scenario_flip_event: null,
                            // B21 (0081): the fitness and envelope contract the port binds at opening (pinned in phase6-fitness-events-b21.test.ts; here the B18 keys are the pins)
                            twin_fitness: 'none', envelope: { state: 'inside', model: 'supply-flow@1', keys: {} }, envelope_ack: null, challenge_id: null };
const intake = (over: Row = {}) => ({
  twinId: TWIN, twinVersion: 2, runKind: 'control' as const, controlRunId: null, correctsRunId: null, shock: false, component: 'magnet-assembly',
  stochastic: { mode: 'deterministic' as const }, ...over,
} as Parameters<typeof simulationStartedEvent>[0]['intake']);
const environment = { node: process.version, platform: process.platform, arch: process.arch };
const started = (over: Partial<Parameters<typeof simulationStartedEvent>[0]> = {}) => simulationStartedEvent({
  runId: RUN, opened, intake: intake(), scenario: null, shockBasis: 'none', modelRef: 'supply-flow@1', implementationDigest: DIGEST, environmentDigest: 'e'.repeat(64),
  environment, inputsDigest: 'f'.repeat(64), rng: null, twinFitness: opened.twin_fitness, envelope: opened.envelope, envelopeAck: opened.envelope_ack, challengeId: opened.challenge_id,
  operator: OPERATOR, occurredAt: AT, ...over,
});

describe('B18 · simulationStartedEvent — SimulationStarted@v1 from the opening write', () => {
  it('a deterministic control run pinned key by key: the resolved artefacts, the environment beyond its digest, the cut-offs, the execution identity, state opened', () => {
    const row = started();
    expect(row.eventType).toBe('SimulationStarted');
    const p = row.payload;
    expect(p['schema']).toBe('SimulationStarted'); expect(p['schema_version']).toBe('v1');
    expect(p['run_id']).toBe(RUN);
    expect(p['twin']).toEqual({ twin_id: TWIN, version: 2, branch_id: 'actual' });
    expect(p['run_kind']).toBe('control'); expect(p['control_run_id']).toBeNull(); expect(p['corrects_run_id']).toBeNull();
    expect(p['scenario']).toBeNull(); expect(p['shock']).toBe(false); expect(p['shock_basis']).toBe('none'); expect(p['component']).toBe('magnet-assembly');
    expect(p['model']).toEqual({ ref: 'supply-flow@1', implementation_digest: DIGEST });
    expect(p['environment']).toEqual({ digest: 'e'.repeat(64), node: process.version, platform: process.platform, arch: process.arch });
    expect(p['stochastic']).toEqual({ mode: 'deterministic' });
    expect(p['initial_state_digest']).toBe('1'.repeat(64)); expect(p['inputs_digest']).toBe('f'.repeat(64));
    expect(p['cutoffs']).toEqual({ known_at: '2026-09-17T11:59:00.000Z', observed_through: '2024-01-17' });
    expect(p['execution_identity']).toEqual({ operator: OPERATOR, synthetic_state: false, verification_state: 'verified' });
    expect(p['state']).toBe('opened');
    expect(p['temporal']).toEqual({ known_at: AT });
    expect(p['cause']).toEqual({ action: 'simulation.run', actor: OPERATOR, target_type: 'SIM', target_id: RUN });
    // nothing of the body: no snapshot, no parameters
    for (const k of ['initial_state', 'params', 'interventions']) expect(p).not.toHaveProperty(k);
  });
  it('a seeded intervention run on a flipped scenario branch carries the stochastic contract with its seed and rng, the control, the scenario binding and the shock\'s basis', () => {
    const p = started({
      intake: intake({ runKind: 'intervention', controlRunId: CONTROL, correctsRunId: uid(), shock: true, stochastic: { mode: 'seeded', seed: 42, samples: 16, jitter: { '0': 0.5, '1': 0.5 } } }),
      scenario: { scenario_id: SCN, version: 1, branch_id: BRANCH, branch_state: 'flipped', flip_event_id: FLIP }, shockBasis: 'scenario-branch-flipped', rng: 'xoshiro128**',
    }).payload;
    expect(p['run_kind']).toBe('intervention'); expect(p['control_run_id']).toBe(CONTROL); expect(typeof p['corrects_run_id']).toBe('string');
    expect(p['shock']).toBe(true); expect(p['shock_basis']).toBe('scenario-branch-flipped');
    expect(p['scenario']).toEqual({ scenario_id: SCN, version: 1, branch_id: BRANCH, branch_state: 'flipped', flip_event_id: FLIP });
    expect(p['stochastic']).toEqual({ mode: 'seeded', rng: 'xoshiro128**', seed: 42, samples: 16, jitter: { '0': 0.5, '1': 0.5 } });
  });
});

/** The row as read at completion: what the builder reads of it. */
const runRow = (over: Row = {}): Row => ({
  run_id: RUN, twin_id: TWIN, twin_version: 2, branch_id: 'actual', run_kind: 'intervention', control_run_id: CONTROL, component: 'magnet-assembly',
  stochastic_mode: 'deterministic', samples: null, jitter: null, implementation_digest: DIGEST, environment_digest: 'e'.repeat(64), inputs_digest: 'f'.repeat(64),
  initial_state_digest: '1'.repeat(64), validation_status: 'validated; outputs are SYNTHETIC', ...over,
});
const resource: Resource = { elapsed_ms: 17, samples_run: 1, process: environment, memory_rss_bytes: 123_456_789 };
const totals = { line_stop_days: 3, days_below_safety_stock: 5, min_on_hand: '120.000', first_line_stop_date: '2024-01-20', cost: { reroute: '4000.00', air: '0.00', line_stop: '150000.00', total: '154000.00' } };

describe('B18 · simulationCompletedEvent — SimulationCompleted@v1, one name with two states', () => {
  it('completed: the outputs digest, the totals, the impacts against the control, the uncertainty, the sensitivity, the validation, the reproducibility digests, the resource evidence, the SIM object; nothing missing', () => {
    const row = simulationCompletedEvent({
      runId: RUN, state: 'completed', run: runRow(), outputsDigest: 'o'.repeat(64), totals,
      impacts: { control_run_id: CONTROL, deltas: { line_stop_days: -4, total_cost: '-96000.00' } },
      sensitivity: { relative: 0.2, outside_envelope: false, factors: [{ key: 'route.inland_days' }, { key: 'consumption.weekly' }] },
      validation: { validation_status: 'validated; outputs are SYNTHETIC', inherited_validation: [{ key: 'context.transits_forecast', forecast: 'FCT:x@1', state: 'validation_impossible' }], outside_envelope: false },
      resource, simObject: { object_id: RUN, version: 1, header_digest: 'h'.repeat(64) }, failure: null, actor: OPERATOR, occurredAt: AT,
    });
    expect(row.eventType).toBe('SimulationCompleted');
    const p = row.payload;
    expect(p['schema']).toBe('SimulationCompleted'); expect(p['schema_version']).toBe('v1');
    expect(p['run_id']).toBe(RUN); expect(p['state']).toBe('completed');
    expect(p['twin']).toEqual({ twin_id: TWIN, version: 2, branch_id: 'actual' });
    expect(p['run_kind']).toBe('intervention'); expect(p['control_run_id']).toBe(CONTROL); expect(p['component']).toBe('magnet-assembly');
    expect(p['outputs_digest']).toBe('o'.repeat(64)); expect(p['totals']).toEqual(totals);
    expect(p['impacts']).toEqual({ compared_to: CONTROL, deltas: { line_stop_days: -4, total_cost: '-96000.00' } });
    expect(p['uncertainty']).toEqual({ stochastic: { mode: 'deterministic' }, validation_status: 'validated; outputs are SYNTHETIC' });
    expect(p['sensitivity']).toEqual({ relative: 0.2, outside_envelope: false, factors: 2 });
    expect(p['validation']).toEqual({ validation_status: 'validated; outputs are SYNTHETIC', inherited_validation: [{ key: 'context.transits_forecast', forecast: 'FCT:x@1', state: 'validation_impossible' }], outside_envelope: false });
    expect(p['reproducibility']).toEqual({ implementation_digest: DIGEST, environment_digest: 'e'.repeat(64), inputs_digest: 'f'.repeat(64), initial_state_digest: '1'.repeat(64) });
    expect(p['resource_evidence']).toEqual(resource);
    expect(p['sim_object']).toEqual({ object_id: RUN, version: 1, header_digest: 'h'.repeat(64) });
    expect(p['failure']).toBeNull(); expect(p['missing_outputs']).toBeNull();
    expect(p['temporal']).toEqual({ known_at: AT });
    expect(p['cause']).toEqual({ action: 'simulation.run.complete', actor: OPERATOR, target_type: 'SIM', target_id: RUN });
    // the outputs themselves never ride the event
    for (const k of ['outputs', 'days', 'arrivals']) expect(p).not.toHaveProperty(k);
  });
  it('a seeded completion carries the samples and jitter under uncertainty; the samples run are the resource\'s', () => {
    const p = simulationCompletedEvent({
      runId: RUN, state: 'completed', run: runRow({ stochastic_mode: 'seeded', samples: '16', jitter: { '0': 1 }, run_kind: 'control', control_run_id: null }), outputsDigest: 'o'.repeat(64), totals,
      impacts: { control_run_id: null, deltas: null }, sensitivity: { relative: 0.2, outside_envelope: true, factors: [] },
      validation: { validation_status: 'validated', inherited_validation: [], outside_envelope: true },
      resource: { ...resource, samples_run: 16 }, simObject: { object_id: RUN, version: 1, header_digest: 'h'.repeat(64) }, failure: null, actor: OPERATOR, occurredAt: AT,
    }).payload;
    expect(p['uncertainty']).toEqual({ stochastic: { mode: 'seeded', samples: 16, jitter: { '0': 1 } }, validation_status: 'validated' });
    expect(p['impacts']).toEqual({ compared_to: null, deltas: null });
    expect((p['resource_evidence'] as Row)['samples_run']).toBe(16);
    expect((p['sensitivity'] as Row)['outside_envelope']).toBe(true);
  });
  it('failed: the failure named, the outputs declared missing (`missing_outputs: all`), no digest, no totals, no SIM object; the resource evidence is what the failure took', () => {
    const p = simulationCompletedEvent({
      runId: RUN, state: 'failed', run: runRow(), outputsDigest: 'ignored'.padEnd(64, '0'), totals: { would: 'be ignored' },
      impacts: { control_run_id: CONTROL, deltas: { line_stop_days: 1, total_cost: '1.00' } }, sensitivity: null,
      validation: { validation_status: null, inherited_validation: [], outside_envelope: false },
      resource: { elapsed_ms: 9, samples_run: 0, process: environment, memory_rss_bytes: 1 }, simObject: { object_id: RUN, version: 1, header_digest: 'x' },
      failure: 'the twin does not hold what the model needs for magnet-assembly: inventory.on_hand:magnet-assembly is stale', actor: OPERATOR, occurredAt: AT,
    }).payload;
    expect(p['state']).toBe('failed');
    expect(p['outputs_digest']).toBeNull(); expect(p['totals']).toBeNull(); expect(p['sim_object']).toBeNull(); expect(p['sensitivity']).toBeNull();
    expect(p['impacts']).toEqual({ compared_to: CONTROL, deltas: null });
    expect(p['failure']).toMatch(/^the twin does not hold/); expect(p['missing_outputs']).toBe('all');
    expect(p['resource_evidence']).toEqual({ elapsed_ms: 9, samples_run: 0, process: environment, memory_rss_bytes: 1 });
    expect(p['validation']).toEqual({ validation_status: null, inherited_validation: [], outside_envelope: false });
    expect(p['cause']).toEqual({ action: 'simulation.run.complete', actor: OPERATOR, target_type: 'SIM', target_id: RUN });
  });
  it('a sparse row (the failing write before the port read it) yields nulls, never a throw', () => {
    const p = simulationCompletedEvent({
      runId: RUN, state: 'failed', run: {}, outputsDigest: null, totals: null, impacts: { control_run_id: null, deltas: null }, sensitivity: null,
      validation: { validation_status: null, inherited_validation: [], outside_envelope: false }, resource: { elapsed_ms: 1, samples_run: 0, process: environment, memory_rss_bytes: 0 },
      simObject: null, failure: 'x', actor: OPERATOR, occurredAt: AT,
    }).payload;
    expect(p['twin']).toEqual({ twin_id: null, version: null, branch_id: null });
    expect(p['reproducibility']).toEqual({ implementation_digest: null, environment_digest: null, inputs_digest: null, initial_state_digest: null });
    expect(p['uncertainty']).toEqual({ stochastic: { mode: 'deterministic' }, validation_status: null });
  });
});

describe('B18 · simulationInvalidatedEvent — SimulationInvalidated@v1 from the port\'s answer', () => {
  /** The port's answer (simulation.invalidate_run RETURNS jsonb), as the design pins it. */
  const answer = (over: Row = {}): Row => ({
    run_id: RUN, invalidated_at: '2026-09-17T12:30:00.123456+00:00', trigger: 'reproduction', trigger_ref: uid(),
    dependants: { packages: [{ package_id: uid(), version: 1, state: 'committed', committed: true, option_keys: ['reroute'] }], commitments: [uid()], decisions: [], twins: [], simulations: [{ run_id: uid(), via: 'control', state: 'completed', validity: 'valid' }] },
    run: { twin_id: TWIN, twin_version: 2, branch_id: 'actual', run_kind: 'intervention', control_run_id: CONTROL, scenario_id: null, scenario_version: null,
           outputs_digest: 'o'.repeat(64), inputs_digest: 'f'.repeat(64), header_digest: 'h'.repeat(64), completed_at: '2026-09-17T12:01:00+00:00', operator_principal_id: OPERATOR, validation_status: 'validated; outputs are SYNTHETIC' },
    ...over,
  });
  it('the method the withdrawn SIM version names', () => { expect(SIMULATION_INVALIDATE_METHOD_REF).toBe('simulation.run.invalidate@1.0.0'); });
  it('a reproduction\'s invalidation pinned key by key: the trigger and its reference, the version admitted, the run as read, the dependants as the port cut them, the cause under simulation.reproduce', () => {
    const invalidated = answer();
    const row = simulationInvalidatedEvent({ invalidated, withdrawnVersion: 2, trigger: 'reproduction', reason: 'unreproducible: an artefact the run rests on is no longer available: forecast x@1 (context.transits_forecast): withdrawn at version 2',
                                             actor: OPERATOR, occurredAt: AT, action: 'simulation.reproduce' });
    expect(row.eventType).toBe('SimulationInvalidated');
    const p = row.payload;
    expect(p['schema']).toBe('SimulationInvalidated'); expect(p['schema_version']).toBe('v1');
    expect(p['run_id']).toBe(RUN); expect(p['reason']).toMatch(/^unreproducible: /); expect(p['trigger']).toBe('reproduction'); expect(p['trigger_ref']).toBe(invalidated['trigger_ref']);
    expect(p['invalidated_at']).toBe('2026-09-17T12:30:00.123456+00:00'); expect(p['withdrawn_version']).toBe(2);
    expect(p['run']).toEqual(invalidated['run']);
    expect(p['dependants']).toEqual(invalidated['dependants']);
    expect(p['temporal']).toEqual({ known_at: AT });
    expect(p['cause']).toEqual({ action: 'simulation.reproduce', actor: OPERATOR, target_type: 'SIM', target_id: RUN });
  });
  it('a person\'s invalidation: trigger operator with no reference, the cause under simulation.run.invalidate; a sparse answer yields nulls and empty lists', () => {
    const p = simulationInvalidatedEvent({ invalidated: answer({ trigger: 'operator', trigger_ref: null }), withdrawnVersion: 2, trigger: 'operator', reason: 'the control was run on a misgrounded version', actor: OPERATOR, occurredAt: AT, action: 'simulation.run.invalidate' }).payload;
    expect(p['trigger']).toBe('operator'); expect(p['trigger_ref']).toBeNull();
    expect(p['cause']).toEqual({ action: 'simulation.run.invalidate', actor: OPERATOR, target_type: 'SIM', target_id: RUN });
    const sparse = simulationInvalidatedEvent({ invalidated: { run_id: RUN }, withdrawnVersion: 2, trigger: 'operator', reason: 'r'.repeat(8), actor: OPERATOR, occurredAt: AT, action: 'simulation.run.invalidate' }).payload;
    expect(sparse['invalidated_at']).toBeNull(); expect(sparse['trigger_ref']).toBeNull();
    expect(sparse['run']).toEqual({ twin_id: null, twin_version: null, branch_id: null, run_kind: null, control_run_id: null, scenario_id: null, scenario_version: null, outputs_digest: null, inputs_digest: null, header_digest: null, completed_at: null, operator_principal_id: null, validation_status: null });
    expect(sparse['dependants']).toEqual({ packages: [], commitments: [], decisions: [], twins: [], simulations: [] });
  });
});
