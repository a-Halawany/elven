/**
 * CP-6 B21 (0081) · the fitness, coherence and challenge announcements at the function boundary — the PURE builders pinned
 * key by key on uuid fixtures, no database: ValidateTwin@v1 (twin-events.ts), ForecastFitnessChanged@v1 and its
 * trigger→action map (forecast-events.ts), GraphChanged/forecast.fitness_changed with its typed `forecast_fitness` block
 * (change-events.ts — the map duplicated as a literal there, the graph importing nothing from prediction),
 * ScenarioCoherenceFailed@v1 with `routed_to` the review roles (scenario-events.ts), ChallengeSimulation@v1 in its five
 * states (simulation-events.ts), the four keys SimulationStarted gains, the `challenge` trigger of the two invalidation
 * builders, the kind in GRAPH_CHANGE_KINDS, and the consumer identities C4 says change (forecasts, scenarios, decisions)
 * against the digests recorded at 13ed40c — the four others byte for byte as they were. What the B21 harness proves on live
 * writes (T1–T5), this holds on the builders.
 */
import { describe, expect, it } from 'vitest';
import { LIFECYCLE_EVENT_LIST_MAX, forecastFitnessChangedGraphEvent, simulationInvalidatedGraphEvent } from '../../src/graph/subscriptions/change-events.js';
import { CONSUMER_KINDS, GRAPH_CHANGE_KINDS, consumerCodeDigest, type GraphChangedPayload } from '../../src/graph/subscriptions/graph-change.js';
import { validateTwinEvent } from '../../src/twin/twins/twin-events.js';
import { FORECAST_FITNESS_TRIGGER_ACTION, forecastFitnessChangedEvent } from '../../src/prediction/forecasting/forecast-events.js';
import { SCENARIO_COHERENCE_TRIGGER_ACTION, SCENARIO_REVIEW_ROLES, scenarioCoherenceFailedEvent } from '../../src/prediction/scenarios/scenario-events.js';
import { challengeSimulationEvent, simulationInvalidatedEvent, simulationStartedEvent } from '../../src/twin/simulations/simulation-events.js';
import type { EnvelopeCheck } from '../../src/twin/twin.capabilities.js';
import type { OpenedRun } from '../../src/twin/simulation.capabilities.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

type Row = Record<string, unknown>;
let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190f1a2-b3c4-7000-8000-${h}`; };
const TWIN = uid(); const VAL = uid(); const ACTOR = uid(); const RUN = uid(); const RUN_B = uid(); const FCT = uid(); const ENTITY = uid(); const ASSESS = uid();
const SCN = uid(); const CHK = uid(); const OWNER = uid(); const B1 = uid(); const B2 = uid(); const CHALLENGE = uid(); const OPERATOR = uid(); const OPENER = uid(); const DECIDER = uid();
const CONTROL = uid(); const SUB = uid();
const AT = '2026-09-24T12:00:00.000Z';
const payloadOf = (row: { payload: Record<string, unknown> }): GraphChangedPayload => row.payload as unknown as GraphChangedPayload;

/** The seven consumer digests at 13ed40c (graph-change.ts untouched), recorded before the B21 METHOD_REF edit landed (C4). */
const DIGESTS_13ED40C = {
  twins: '13996dd05ee7715210160f2d57d396ae45ce80b97878a92fcd5d5ebfb4fd8f7f',
  forecasts: 'cbcde85317c85a836103d2d59c7c496f520b59515d0c43c67c74d4a6eecadeb5',
  scenarios: 'd2be51c5792f35b90a27c11235eeeca3a14c97404d17cbe89f4cce7d8336ee90',
  decisions: '49416a3289babb4640dd5eec2dddf29dfc8e1ca9ee65aa5dd815910cdde340e2',
  retrieval: 'cff991a74015de762e30ea084ffe64116bc0baaea197ca780b9f5b96d59482c3',
  'memory-mappings': '2e0ad122d8d03b9cc5cfcc90a71dbb0d1017f7d6eda5c43cba70b077207f67a2',
  relationships: 'fe16ee21985684b1fe4d96f7f228d58e0347939ed7c20f96de45312f53700716',
} as const;

const ENVELOPE: EnvelopeCheck = {
  state: 'inside', model: 'supply-flow@1',
  keys: { horizon_days: { range: [1, 365], value: null, source: null, verdict: 'unchecked' },
          corridor_delay_days: { range: [0, 60], value: 14, source: 'shock.corridor_delay_days', verdict: 'inside' },
          'consumption.weekly': { range: [0, 5000], value: 420, source: 'consumption.weekly:SYN-PART-MAG', verdict: 'inside' } },
  rule: 'a key matches the run parameter of the same name, else the version\'s first numeric element named K, K:<suffix>, shock.K or shock.K:<suffix>; a key with no numeric value is unchecked',
};
const CALIBRATION = { since: null, count: 0, keys: [], numeric: { n: 0, mean_relative: null, max_abs_relative: null }, latest_observed_recorded_at: null,
                      note: 'no reconciliation recorded since the previous validation: the calibration history is empty' };

describe('B21 · validateTwinEvent — ValidateTwin@v1 from the validating write', () => {
  const base = () => ({
    twinId: TWIN, version: 1, branchId: 'actual', validationId: VAL, verdict: 'fit', priorState: 'none', envelope: ENVELOPE, calibration: CALIBRATION,
    limitations: ['calendar days'], runs: [{ run_id: RUN, state: 'completed', validity: 'valid', fitness_state: 'none' }, { run_id: RUN_B, state: 'completed', validity: 'invalidated', fitness_state: 'unfit' }],
    stateSetDigest: 'a'.repeat(64), knownAt: '2024-01-17T12:00:00+00:00', observedThrough: '2024-01-17', actor: ACTOR, occurredAt: AT,
  });
  it('pinned key by key: the verdict and what stood before, the envelope check WITHOUT its rule sentence, the calibration summary, the limitations, the runs named as dependency impacts, the digest and cut-offs, the cause on the twin; no GraphChanged material', () => {
    const row = validateTwinEvent(base());
    expect(row.eventType).toBe('ValidateTwin');
    expect(row.payload).toEqual({
      schema: 'ValidateTwin', schema_version: 'v1',
      twin_id: TWIN, version: 1, branch_id: 'actual', validation_id: VAL, verdict: 'fit', prior_state: 'none',
      envelope: { state: 'inside', model: 'supply-flow@1', keys: ENVELOPE.keys },
      calibration: CALIBRATION, limitations: ['calendar days'],
      dependency_impacts: { runs: [{ run_id: RUN, state: 'completed', validity: 'valid', fitness_state: 'none' }, { run_id: RUN_B, state: 'completed', validity: 'invalidated', fitness_state: 'unfit' }], truncated: false },
      state_set_digest: 'a'.repeat(64), freshness: { known_at: '2024-01-17T12:00:00+00:00', observed_through: '2024-01-17' },
      truncated: false, temporal: { known_at: AT },
      cause: { action: 'twin.version.validate', actor: ACTOR, target_type: 'TWN', target_id: TWIN },
    });
    expect(row.payload['envelope']).not.toHaveProperty('rule');
    for (const k of ['identities', 'objects', 'elements', 'reason']) expect(row.payload).not.toHaveProperty(k);
  });
  it('indeterminate outside the envelope: the verdict and the state ride as handed; the ceiling: 250 runs → 200 with truncated said, 250 limitations → 200 with the top-level truncated', () => {
    const outside: EnvelopeCheck = { ...ENVELOPE, state: 'outside', keys: { ...ENVELOPE.keys, corridor_delay_days: { range: [0, 60], value: 75, source: 'shock.corridor_delay_days', verdict: 'outside' } } };
    const runs = Array.from({ length: 250 }, () => ({ run_id: uid(), state: 'completed', validity: 'valid', fitness_state: 'none' }));
    const limitations = Array.from({ length: 250 }, (_, i) => `limitation ${i}`);
    const p = validateTwinEvent({ ...base(), verdict: 'indeterminate', priorState: 'fit', envelope: outside, runs, limitations }).payload;
    expect(LIFECYCLE_EVENT_LIST_MAX).toBe(200);
    expect(p['verdict']).toBe('indeterminate'); expect(p['prior_state']).toBe('fit');
    expect((p['envelope'] as Row)['state']).toBe('outside');
    expect((p['dependency_impacts'] as Row)['runs']).toHaveLength(200); expect((p['dependency_impacts'] as Row)['truncated']).toBe(true);
    expect(p['limitations']).toHaveLength(200); expect(p['truncated']).toBe(true);
  });
});

/** The port's answer (prediction.assess_forecast_fitness RETURNS jsonb), as the design pins it. */
const assessment = (over: Row = {}): Row => ({
  assessment_id: ASSESS, forecast_id: FCT, series_key: 'imf-portwatch-transits', horizon: '30d', method: 'seasonal-naive', subject_entity_id: ENTITY, state: 'resolved',
  verdict: 'unfit', class: 'calibration_failure', classes: ['calibration_failure'], prior_state: 'none', prior_class: null, changed: true,
  measures: { rule_version: '1', window: { series_key: 'imf-portwatch-transits', horizon: '30d', method: 'seasonal-naive', outcomes: 10, required: 10 },
              coverage: { observed: 0.7, floor: 0.75, checked: true }, pinball: { observed: 3.2, backtest: null, backtest_id: null, factor: 1.5, checked: false },
              attention_state: 'none', expiry: { expires_at: '2023-11-25T00:00:00+00:00', cadence: 'daily', checked: true }, classes: ['calibration_failure'],
              note: 'no applicable backtest: the drift rule is not applied' },
  assessed_at: '2026-09-24T10:00:00.123456+00:00', ...over,
});

describe('B21 · forecastFitnessChangedEvent — ForecastFitnessChanged@v1 from the assessment port\'s answer', () => {
  it('the trigger→action map is the three bound actions', () => {
    expect(FORECAST_FITNESS_TRIGGER_ACTION).toEqual({ outcome: 'prediction.outcome.record', subscription: 'prediction.forecast.subscription.apply', operator: 'prediction.forecast.assess' });
  });
  it('pinned key by key: the family, what stood before and what stands now, the classes, the measures whole, the rule version, the trigger, the assessment row, the cause on the FCT', () => {
    const a = assessment();
    const row = forecastFitnessChangedEvent({ assessment: a, trigger: 'outcome', actor: ACTOR, occurredAt: AT });
    expect(row.eventType).toBe('ForecastFitnessChanged');
    expect(row.payload).toEqual({
      schema: 'ForecastFitnessChanged', schema_version: 'v1',
      forecast_id: FCT, series_key: 'imf-portwatch-transits', horizon: '30d', method: 'seasonal-naive', subject_entity_id: ENTITY, forecast_state: 'resolved',
      from: { state: 'none', class: null }, to: { state: 'unfit', class: 'calibration_failure' }, classes: ['calibration_failure'],
      measures: a['measures'], rule_version: '1', trigger: 'outcome', assessment_id: ASSESS, assessed_at: '2026-09-24T10:00:00.123456+00:00',
      temporal: { known_at: AT },
      cause: { action: 'prediction.outcome.record', actor: ACTOR, target_type: 'FCT', target_id: FCT },
    });
  });
  it('each trigger names its bound action; an indeterminate verdict and a sparse answer ride as handed (nulls, never a throw)', () => {
    expect((forecastFitnessChangedEvent({ assessment: assessment(), trigger: 'subscription', actor: ACTOR, occurredAt: AT }).payload['cause'] as Row)['action']).toBe('prediction.forecast.subscription.apply');
    expect((forecastFitnessChangedEvent({ assessment: assessment(), trigger: 'operator', actor: ACTOR, occurredAt: AT }).payload['cause'] as Row)['action']).toBe('prediction.forecast.assess');
    const p = forecastFitnessChangedEvent({ assessment: { forecast_id: FCT, verdict: 'indeterminate', class: null, changed: true }, trigger: 'operator', actor: ACTOR, occurredAt: AT }).payload;
    expect(p['to']).toEqual({ state: 'indeterminate', class: null }); expect(p['from']).toEqual({ state: null, class: null });
    expect(p['classes']).toEqual([]); expect(p['measures']).toBeNull(); expect(p['rule_version']).toBeNull(); expect(p['series_key']).toBeNull();
  });
});

describe('B21 · forecastFitnessChangedGraphEvent — GraphChanged/forecast.fitness_changed with the typed block', () => {
  it('the kind is in GRAPH_CHANGE_KINDS, last, and every earlier kind stays (eighteen kinds)', () => {
    expect(GRAPH_CHANGE_KINDS).toContain('forecast.fitness_changed');
    expect(GRAPH_CHANGE_KINDS[GRAPH_CHANGE_KINDS.length - 1]).toBe('forecast.fitness_changed');
    expect(GRAPH_CHANGE_KINDS).toHaveLength(18);
    for (const k of ['entity.created', 'edge.asserted', 'forecast.superseded', 'import.admitted', 'import.revoked', 'twin.state_changed', 'forecast.withdrawn', 'simulation.invalidated', 'projection.rebuilt']) expect(GRAPH_CHANGE_KINDS).toContain(k);
  });
  it('the forecastWithdrawnGraphEvent shape: no identities, objects.forecasts the forecast, walked true, the cause per trigger (the literal map), the block with the class, what stood before and the measures', () => {
    const subscriptions = [{ subscription_id: SUB, consumer_kind: 'scenarios' }];
    const p = payloadOf(forecastFitnessChangedGraphEvent({ assessment: assessment(), trigger: 'outcome', subscriptions, actor: ACTOR, occurredAt: AT }));
    expect(p.schema).toBe('GraphChanged'); expect(p.schema_version).toBe('v1');
    expect(p.change).toEqual({ kind: 'forecast.fitness_changed', occurred_at: AT, graph_event_id: null, invalidation_id: null, correction_case_id: null });
    expect(p.identities).toEqual([]); expect(p.relationships).toEqual({ edges: [], resolutions: [], dependencies: [] });
    expect(p.objects.forecasts).toEqual([FCT]); expect(p.objects.walked).toBe(true); expect(p.objects.truncated).toBe(false);
    for (const k of ['claims', 'assumptions', 'decisions', 'scenarios', 'twins', 'simulations', 'evidence'] as const) expect(p.objects[k]).toEqual([]);
    expect(p.temporal).toEqual({ known_at: AT }); expect(p.subscriptions).toEqual(subscriptions);
    expect(p.cause).toEqual({ action: 'prediction.outcome.record', actor: ACTOR, target_type: 'FCT', target_id: FCT });
    expect(p.forecast_fitness).toEqual({
      forecast_id: FCT, series_key: 'imf-portwatch-transits', horizon: '30d', method: 'seasonal-naive', state: 'unfit', class: 'calibration_failure', prior_state: 'none', prior_class: null,
      assessment_id: ASSESS, rule_version: '1', trigger: 'outcome',
      measures: { outcomes: 10, required: 10, coverage: { observed: 0.7, floor: 0.75, checked: true }, pinball: { observed: 3.2, backtest: null, backtest_id: null, factor: 1.5, checked: false },
                  expiry: { expires_at: '2023-11-25T00:00:00+00:00', cadence: 'daily', checked: true } },
    });
    for (const k of ['forecast', 'simulation', 'twin', 'projection', 'import']) expect(p).not.toHaveProperty(k);
    expect(payloadOf(forecastFitnessChangedGraphEvent({ assessment: assessment(), trigger: 'subscription', subscriptions: [], actor: ACTOR })).cause.action).toBe('prediction.forecast.subscription.apply');
    expect(payloadOf(forecastFitnessChangedGraphEvent({ assessment: assessment(), trigger: 'operator', subscriptions: [], actor: ACTOR })).cause.action).toBe('prediction.forecast.assess');
  });
  it('a class change while unfit carries the prior class; a sparse answer yields zero outcomes and null measures, never a throw', () => {
    const p = payloadOf(forecastFitnessChangedGraphEvent({ assessment: assessment({ class: 'data_shift', prior_state: 'unfit', prior_class: 'calibration_failure', measures: null }), trigger: 'subscription', subscriptions: [], actor: ACTOR, occurredAt: AT }));
    expect(p.forecast_fitness).toMatchObject({ state: 'unfit', class: 'data_shift', prior_state: 'unfit', prior_class: 'calibration_failure', rule_version: '', measures: { outcomes: 0, required: 0, coverage: null, pinball: null, expiry: null } });
  });
});

describe('B21 · scenarioCoherenceFailedEvent — ScenarioCoherenceFailed@v1 from the check port\'s answer', () => {
  const check = (over: Row = {}): Row => ({
    check_id: CHK, scenario_id: SCN, scenario_version: 1, title: 'Corridor closure', owner: OWNER, forecast_id: FCT, outcome: 'failed', prior_state: 'unchecked', changed: true,
    findings: [{ rule: 'duplicate_branch', severity: 'fail', branch_id: B1, other_branch_id: B2, detail: 'branches "closure" and "closure-2" are both downside and share the same indicator; they do not cover distinct uncertainty' },
               { rule: 'coverage', severity: 'note', detail: '2 live branch(es) of 1 kind(s) beside the baseline; the portfolio may not cover the material uncertainty — the review judges it' }],
    rule_version: '1', checked_at: '2026-09-24T10:30:00.123456+00:00', ...over,
  });
  it('the trigger→action map and the review roles are the register\'s', () => {
    expect(SCENARIO_COHERENCE_TRIGGER_ACTION).toEqual({ declare: 'prediction.scenario.declare', review: 'prediction.scenario.review', subscription: 'prediction.scenario.subscription.apply', operator: 'prediction.scenario.check' });
    expect([...SCENARIO_REVIEW_ROLES]).toEqual(['platform_admin', 'domain_admin', 'strategy_owner', 'forecast_owner']);
  });
  it('pinned key by key: the scenario, the check, what stood before, outcome failed, the findings in rule order, the rule version, the trigger, routed_to the review roles, the cause on the SCN', () => {
    const c = check();
    const row = scenarioCoherenceFailedEvent({ check: c, trigger: 'declare', actor: ACTOR, occurredAt: AT });
    expect(row.eventType).toBe('ScenarioCoherenceFailed');
    expect(row.payload).toEqual({
      schema: 'ScenarioCoherenceFailed', schema_version: 'v1',
      scenario_id: SCN, scenario_version: 1, title: 'Corridor closure', forecast_id: FCT, owner: OWNER, check_id: CHK, prior_state: 'unchecked', outcome: 'failed',
      findings: c['findings'], truncated: false, rule_version: '1', trigger: 'declare', routed_to: ['platform_admin', 'domain_admin', 'strategy_owner', 'forecast_owner'],
      temporal: { known_at: AT },
      cause: { action: 'prediction.scenario.declare', actor: ACTOR, target_type: 'SCN', target_id: SCN },
    });
  });
  it('each trigger names its bound action; the findings are cut at the ceiling with truncated said', () => {
    for (const [trigger, action] of [['review', 'prediction.scenario.review'], ['subscription', 'prediction.scenario.subscription.apply'], ['operator', 'prediction.scenario.check']] as const) {
      expect((scenarioCoherenceFailedEvent({ check: check(), trigger, actor: ACTOR, occurredAt: AT }).payload['cause'] as Row)['action']).toBe(action);
    }
    const findings = Array.from({ length: 250 }, (_, i) => ({ rule: 'assumption_invalid', severity: 'fail', branch_id: B1, detail: `basis ${i}` }));
    const p = scenarioCoherenceFailedEvent({ check: check({ findings }), trigger: 'operator', actor: ACTOR, occurredAt: AT }).payload;
    expect(p['findings']).toHaveLength(200); expect(p['truncated']).toBe(true);
  });
});

/** The challenge ROW as the service reads it back (timestamptz columns come back as Dates), with the run's identity beside it. */
const challengeRow = (over: Row = {}): Row => ({
  challenge_id: CHALLENGE, scope: 'DOMAIN', tenant_id: uid(), domain_id: uid(), run_id: RUN, kind: 'interpretation',
  statement: 'the reroute saving assumes the Cape leg is bookable', disputed: ['route.reroute_delay_days'], state: 'open',
  opened_by: OPENER, opened_at: new Date('2026-09-24T09:00:00.000Z'), rerun_requested_by: null, rerun_requested_at: null, rerun_run_id: null,
  decided_by: null, decided_at: null, decision_note: null, withdrawn_at: null, withdrawal_reason: null, correlation_id: uid(),
  run: { twin_id: TWIN, twin_version: 1, run_kind: 'intervention', control_run_id: CONTROL, operator_principal_id: OPERATOR, validity: 'valid', fitness_state: 'none', promoted_for: null },
  ...over,
});

describe('B21 · challengeSimulationEvent — ChallengeSimulation@v1, one name, five states', () => {
  it('opened: pinned key by key from the row — the dispute, who opened it, the instants as ISO, the run beside it, no invalidation, the cause on the RUN under simulation.challenge.open', () => {
    const row = challengeSimulationEvent({ challenge: challengeRow(), state: 'opened', action: 'simulation.challenge.open', invalidation: null, invalidationWithheld: null, actor: OPENER, occurredAt: AT });
    expect(row.eventType).toBe('ChallengeSimulation');
    expect(row.payload).toEqual({
      schema: 'ChallengeSimulation', schema_version: 'v1',
      challenge_id: CHALLENGE, run_id: RUN, state: 'opened', kind: 'interpretation', statement: 'the reroute saving assumes the Cape leg is bookable',
      disputed: ['route.reroute_delay_days'], truncated: false,
      opened_by: OPENER, opened_at: '2026-09-24T09:00:00.000Z', rerun_run_id: null, rerun_requested_at: null,
      decided_by: null, decided_at: null, decision_note: null, withdrawal_reason: null,
      run: { twin_id: TWIN, twin_version: 1, run_kind: 'intervention', control_run_id: CONTROL, operator_principal_id: OPERATOR, validity: 'valid', fitness_state: 'none', promoted_for: null },
      invalidation: null, invalidation_withheld: null,
      temporal: { known_at: AT },
      cause: { action: 'simulation.challenge.open', actor: OPENER, target_type: 'SIM', target_id: RUN },
    });
    // the row's scope, tenancy and correlation never ride the event
    for (const k of ['scope', 'tenant_id', 'domain_id', 'correlation_id', 'rerun_requested_by', 'withdrawn_at']) expect(row.payload).not.toHaveProperty(k);
  });
  it('rerun_requested and withdrawn: the state the write says, the re-run link and the reason from the row, the cause per action', () => {
    const rerun = challengeSimulationEvent({ challenge: challengeRow({ state: 'rerun_requested', rerun_requested_by: DECIDER, rerun_requested_at: new Date('2026-09-24T09:30:00.000Z'), rerun_run_id: RUN_B }),
                                             state: 'rerun_requested', action: 'simulation.challenge.rerun', invalidation: null, invalidationWithheld: null, actor: DECIDER, occurredAt: AT }).payload;
    expect(rerun).toMatchObject({ state: 'rerun_requested', rerun_run_id: RUN_B, rerun_requested_at: '2026-09-24T09:30:00.000Z', cause: { action: 'simulation.challenge.rerun', actor: DECIDER, target_type: 'SIM', target_id: RUN } });
    const withdrawn = challengeSimulationEvent({ challenge: challengeRow({ state: 'withdrawn', withdrawn_at: new Date(AT), withdrawal_reason: 'opened on the wrong run' }),
                                                 state: 'withdrawn', action: 'simulation.challenge.withdraw', invalidation: null, invalidationWithheld: null, actor: OPENER, occurredAt: AT }).payload;
    expect(withdrawn).toMatchObject({ state: 'withdrawn', withdrawal_reason: 'opened on the wrong run', cause: { action: 'simulation.challenge.withdraw' } });
  });
  it('upheld with the invalidation it caused (the run reads invalidated and unfit); upheld with the invalidation WITHHELD (already invalidated); dismissed', () => {
    const decided = { state: 'upheld', decided_by: DECIDER, decided_at: new Date('2026-09-24T11:00:00.000Z'), decision_note: 'the Cape leg was not bookable on the record',
                      run: { twin_id: TWIN, twin_version: 1, run_kind: 'intervention', control_run_id: CONTROL, operator_principal_id: OPERATOR, validity: 'invalidated', fitness_state: 'unfit', promoted_for: null } };
    const upheld = challengeSimulationEvent({ challenge: challengeRow(decided), state: 'upheld', action: 'simulation.challenge.decide',
                                              invalidation: { invalidated_at: '2026-09-24T11:00:00.123456+00:00', withdrawn_version: 2 }, invalidationWithheld: null, actor: DECIDER, occurredAt: AT }).payload;
    expect(upheld).toMatchObject({ state: 'upheld', decided_by: DECIDER, decided_at: '2026-09-24T11:00:00.000Z', decision_note: 'the Cape leg was not bookable on the record',
                                   run: { validity: 'invalidated', fitness_state: 'unfit' }, invalidation: { invalidated_at: '2026-09-24T11:00:00.123456+00:00', withdrawn_version: 2 }, invalidation_withheld: null,
                                   cause: { action: 'simulation.challenge.decide', actor: DECIDER, target_type: 'SIM', target_id: RUN } });
    const withheld = challengeSimulationEvent({ challenge: challengeRow(decided), state: 'upheld', action: 'simulation.challenge.decide', invalidation: null, invalidationWithheld: 'already_invalidated', actor: DECIDER, occurredAt: AT }).payload;
    expect(withheld['invalidation']).toBeNull(); expect(withheld['invalidation_withheld']).toBe('already_invalidated');
    const dismissed = challengeSimulationEvent({ challenge: challengeRow({ ...decided, state: 'dismissed', decision_note: 'the Cape leg was bookable on the record' }), state: 'dismissed', action: 'simulation.challenge.decide', invalidation: null, invalidationWithheld: null, actor: DECIDER, occurredAt: AT }).payload;
    expect(dismissed).toMatchObject({ state: 'dismissed', invalidation: null, invalidation_withheld: null });
  });
  it('the disputed keys are cut at the ceiling with truncated said; a sparse row yields nulls and an empty run block, never a throw', () => {
    const disputed = Array.from({ length: 250 }, (_, i) => `key.${i}`);
    const p = challengeSimulationEvent({ challenge: challengeRow({ disputed }), state: 'opened', action: 'simulation.challenge.open', invalidation: null, invalidationWithheld: null, actor: OPENER, occurredAt: AT }).payload;
    expect(p['disputed']).toHaveLength(200); expect(p['truncated']).toBe(true);
    const sparse = challengeSimulationEvent({ challenge: { challenge_id: CHALLENGE, run_id: RUN }, state: 'opened', action: 'simulation.challenge.open', invalidation: null, invalidationWithheld: null, actor: OPENER, occurredAt: AT }).payload;
    expect(sparse['kind']).toBeNull(); expect(sparse['disputed']).toEqual([]); expect(sparse['opened_at']).toBeNull();
    expect(sparse['run']).toEqual({ twin_id: null, twin_version: null, run_kind: null, control_run_id: null, operator_principal_id: null, validity: null, fitness_state: null, promoted_for: null });
  });
});

describe('B21 · SimulationStarted gains the fitness and envelope contract; the invalidation builders gain the challenge trigger', () => {
  const opened: OpenedRun = { initial_state: [], initial_state_digest: '1'.repeat(64), known_at: '2026-09-17T11:59:00.000Z', observed_through: '2024-01-17', branch_id: 'actual',
                              synthetic_state: false, controls: { classification: 'internal' }, verification_state: 'verified', scenario_flip_event: null,
                              twin_fitness: 'indeterminate', envelope: { ...ENVELOPE, state: 'outside' }, envelope_ack: { acknowledged_by: OPERATOR, reason: 'the 75-day delay is the stress case' }, challenge_id: CHALLENGE };
  const environment = { node: process.version, platform: process.platform, arch: process.arch };
  const intake = { twinId: TWIN, twinVersion: 2, runKind: 'intervention' as const, controlRunId: CONTROL, correctsRunId: RUN, shock: false, component: 'magnet-assembly', stochastic: { mode: 'deterministic' as const } };
  it('SimulationStarted carries twin_fitness, the envelope check without its rule sentence, the acknowledgement and the challenge answered; the B18 keys stand', () => {
    const p = simulationStartedEvent({
      runId: RUN_B, opened, intake, scenario: null, shockBasis: 'none', modelRef: 'supply-flow@1', implementationDigest: 'd'.repeat(64), environmentDigest: 'e'.repeat(64), environment,
      inputsDigest: 'f'.repeat(64), rng: null, twinFitness: opened.twin_fitness, envelope: opened.envelope, envelopeAck: opened.envelope_ack, challengeId: opened.challenge_id, operator: OPERATOR, occurredAt: AT,
    }).payload;
    expect(p['twin_fitness']).toBe('indeterminate');
    expect(p['envelope']).toEqual({ state: 'outside', model: 'supply-flow@1', keys: ENVELOPE.keys });
    expect(p['envelope']).not.toHaveProperty('rule');
    expect(p['envelope_ack']).toEqual({ acknowledged_by: OPERATOR, reason: 'the 75-day delay is the stress case' });
    expect(p['challenge_id']).toBe(CHALLENGE); expect(p['corrects_run_id']).toBe(RUN);
    expect(p['state']).toBe('opened'); expect(p['cause']).toEqual({ action: 'simulation.run', actor: OPERATOR, target_type: 'SIM', target_id: RUN_B });
    const plain = simulationStartedEvent({
      runId: RUN_B, opened: { ...opened, twin_fitness: 'fit', envelope: ENVELOPE, envelope_ack: null, challenge_id: null }, intake: { ...intake, correctsRunId: null }, scenario: null, shockBasis: 'none',
      modelRef: 'supply-flow@1', implementationDigest: 'd'.repeat(64), environmentDigest: 'e'.repeat(64), environment, inputsDigest: 'f'.repeat(64), rng: null,
      twinFitness: 'fit', envelope: ENVELOPE, envelopeAck: null, challengeId: null, operator: OPERATOR, occurredAt: AT,
    }).payload;
    expect(plain).toMatchObject({ twin_fitness: 'fit', envelope: { state: 'inside' }, envelope_ack: null, challenge_id: null });
  });
  it('SimulationInvalidated and GraphChanged/simulation.invalidated under trigger challenge: the challenge as the reference, the cause under simulation.challenge.decide', () => {
    const invalidated: Row = { run_id: RUN, invalidated_at: '2026-09-24T11:00:00.123456+00:00', trigger: 'challenge', trigger_ref: CHALLENGE, dependants: { packages: [], commitments: [], decisions: [], twins: [], simulations: [] },
                               run: { twin_id: TWIN, twin_version: 1, branch_id: 'actual', run_kind: 'intervention', control_run_id: CONTROL, scenario_id: null, scenario_version: null, outputs_digest: 'o'.repeat(64),
                                      inputs_digest: 'f'.repeat(64), header_digest: 'h'.repeat(64), completed_at: '2026-09-24T09:00:00+00:00', operator_principal_id: OPERATOR, validation_status: 'validated; outputs are SYNTHETIC' } };
    const p = simulationInvalidatedEvent({ invalidated, withdrawnVersion: 2, trigger: 'challenge', reason: `challenge ${CHALLENGE} upheld: the Cape leg was not bookable on the record`, actor: DECIDER, occurredAt: AT, action: 'simulation.challenge.decide' }).payload;
    expect(p['trigger']).toBe('challenge'); expect(p['trigger_ref']).toBe(CHALLENGE); expect(p['withdrawn_version']).toBe(2);
    expect(p['cause']).toEqual({ action: 'simulation.challenge.decide', actor: DECIDER, target_type: 'SIM', target_id: RUN });
    const g = payloadOf(simulationInvalidatedGraphEvent({ runId: RUN, reason: 'challenge upheld', trigger: 'challenge', triggerRef: CHALLENGE, invalidatedAt: AT, dependants: {}, subscriptions: [], actor: DECIDER, action: 'simulation.challenge.decide', occurredAt: AT }));
    expect(g.change.kind).toBe('simulation.invalidated');
    expect(g.simulation).toEqual({ run_id: RUN, reason: 'challenge upheld', trigger: 'challenge', trigger_ref: CHALLENGE, invalidated_at: AT, dependants: {} });
    expect(g.cause).toEqual({ action: 'simulation.challenge.decide', actor: DECIDER, target_type: 'SIM', target_id: RUN });
    expect(g.objects.simulations).toEqual([RUN]);
  });
});

describe('B21 · the consumer identities (C4): the forecasts, scenarios and decisions methods changed, the four others did not', () => {
  it('the digests of twins, retrieval, memory-mappings and relationships are the ones recorded at 13ed40c; forecasts, scenarios and decisions differ', () => {
    for (const k of ['twins', 'retrieval', 'memory-mappings', 'relationships'] as const) expect(consumerCodeDigest(k), k).toBe(DIGESTS_13ED40C[k]);
    for (const k of ['forecasts', 'scenarios', 'decisions'] as const) expect(consumerCodeDigest(k), k).not.toBe(DIGESTS_13ED40C[k]);
    expect([...CONSUMER_KINDS]).toEqual(['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships']);
    expect(new Set(CONSUMER_KINDS.map((k) => consumerCodeDigest(k))).size).toBe(7);
  });
});

/*
 * D3.7: the seven policy rows — exact rules, placed before the prefix rules that would otherwise match first (`twin.version`,
 * `simulation.run`); the human gates on the validation, the decision and the promotion; C2 the ceiling. The ports' own
 * separation of duties (the twin's owner, the challenge's opener, the run's operator) is not the PDP's to see.
 */
describe('B21 · the seven PDP rows (D3.7)', () => {
  const T = '0193a3d0-0000-7000-8000-000000000001'; const D = '0193a3d0-0000-7000-8000-000000000002';
  const at = (action: string, roles: string[], consequenceClass: PolicyInput['consequenceClass'] = 'C2'): PolicyInput => ({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: 'human', assurance: 'password',
                 bindings: roles.map((roleCode) => (roleCode === 'platform_admin'
                   ? { roleCode, scope: 'PLATFORM' as const, tenantId: null, domainId: null }
                   : { roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
    delegationId: null, action, objectType: 'SIM', objectId: null, purposeId: 'twin',
    context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass,
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  const pdp = new PdpService();
  const GATE = [{ type: 'human_gate' }];
  it('twin.version.validate: a twin owner (a peer — the port refuses the twin\'s own), the domain administrator, the platform administrator; human-gated; C2; matched by its own rule, not by `twin.version`', () => {
    for (const role of ['twin_owner', 'domain_admin', 'platform_admin']) {
      const r = pdp.evaluate(at('twin.version.validate', [role]));
      expect(r.decision, role).toBe('allow_with_obligations'); expect(r.obligations, role).toEqual(GATE);
    }
    for (const role of ['simulation_operator', 'strategy_owner', 'domain_analyst', 'forecast_owner']) expect(pdp.evaluate(at('twin.version.validate', [role])).decision, role).toBe('deny');
    expect(pdp.evaluate(at('twin.version.validate', ['twin_owner'], 'C3')).decision).toBe('deny');
    // the prefix rule admits no domain_admin and carries no gate: a neighbour of the exact action falls to it
    expect(pdp.evaluate(at('twin.version.validated', ['domain_admin'])).decision).toBe('deny');
    expect(pdp.evaluate(at('twin.version.validated', ['twin_owner'])).obligations).toEqual([]);
  });
  it('prediction.forecast.assess: the owner or the administrator, no gate; a forecast_agent never assesses by hand; exact', () => {
    for (const role of ['forecast_owner', 'domain_admin', 'platform_admin']) {
      const r = pdp.evaluate(at('prediction.forecast.assess', [role]));
      expect(r.decision, role).toBe('allow'); expect(r.obligations, role).toEqual([]);
    }
    for (const role of ['forecast_agent', 'strategy_owner', 'domain_analyst', 'twin_owner']) expect(pdp.evaluate(at('prediction.forecast.assess', [role])).decision, role).toBe('deny');
    expect(pdp.evaluate(at('prediction.forecast.assessed', ['forecast_owner'])).decision).toBe('indeterminate');
  });
  it('prediction.scenario.check: the four review roles, no gate; an analyst and an agent denied; exact', () => {
    for (const role of ['strategy_owner', 'forecast_owner', 'domain_admin', 'platform_admin']) {
      const r = pdp.evaluate(at('prediction.scenario.check', [role]));
      expect(r.decision, role).toBe('allow'); expect(r.obligations, role).toEqual([]);
    }
    for (const role of ['domain_analyst', 'forecast_agent', 'twin_owner', 'decision_owner']) expect(pdp.evaluate(at('prediction.scenario.check', [role])).decision, role).toBe('deny');
    expect(pdp.evaluate(at('prediction.scenario.checked', ['strategy_owner'])).decision).toBe('indeterminate');
  });
  it('the challenge: open, rerun and withdraw by the six; decide and promote by the four, human-gated; an operator neither decides nor promotes; an analyst and an auditor open nothing; C3 denied everywhere', () => {
    const six = ['platform_admin', 'domain_admin', 'twin_owner', 'simulation_operator', 'strategy_owner', 'decision_owner'];
    const four = ['platform_admin', 'domain_admin', 'twin_owner', 'strategy_owner'];
    for (const action of ['simulation.challenge.open', 'simulation.challenge.rerun', 'simulation.challenge.withdraw']) {
      for (const role of six) { const r = pdp.evaluate(at(action, [role])); expect(r.decision, `${action} by ${role}`).toBe('allow'); expect(r.obligations).toEqual([]); }
      for (const role of ['domain_analyst', 'auditor', 'forecast_owner', 'decision_approver']) expect(pdp.evaluate(at(action, [role])).decision, `${action} by ${role}`).toBe('deny');
      expect(pdp.evaluate(at(action, ['twin_owner'], 'C3')).decision, action).toBe('deny');
    }
    for (const action of ['simulation.challenge.decide', 'simulation.result.promote']) {
      for (const role of four) { const r = pdp.evaluate(at(action, [role])); expect(r.decision, `${action} by ${role}`).toBe('allow_with_obligations'); expect(r.obligations, `${action} by ${role}`).toEqual(GATE); }
      for (const role of ['simulation_operator', 'decision_owner', 'domain_analyst', 'forecast_owner']) expect(pdp.evaluate(at(action, [role])).decision, `${action} by ${role}`).toBe('deny');
      expect(pdp.evaluate(at(action, ['strategy_owner'], 'C3')).decision, action).toBe('deny');
    }
    // exact: a neighbour inherits nothing (no `simulation.challenge` prefix exists; `simulation.result.promoted` reaches no rule)
    for (const action of ['simulation.challenge', 'simulation.challenge.opened', 'simulation.result.promoted']) expect(pdp.evaluate(at(action, six)).decision, action).toBe('indeterminate');
  });
});
