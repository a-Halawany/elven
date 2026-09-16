/**
 * The three lifecycle GraphChanged events at the function boundary (CP-6 B18; design §2.7; D3, D6–D8, D20): the PURE builders
 * pinned key by key on uuid fixtures — `twin.state_changed` (no identities, objects.twins the twin, objects.simulations the
 * SUPERSEDED version's runs, walked false, the typed twin block), `forecast.withdrawn` and `simulation.invalidated` (the one
 * object in objects, walked true because the PORT enumerated the dependants, carried in the typed block) — the 200 ceiling on
 * the runs (250 → 200 + `truncated`), what `touchedIds` makes of each (the twins / forecasts / runs sets; no changed entity),
 * the kinds in GRAPH_CHANGE_KINDS, and the two consumer identities that changed with their methods (twins, decisions — the B8
 * rule: a changed method is a new consumer, re-registered). No database: what the B18 harness proves on a live chain, this
 * holds on the builders.
 */
import { describe, expect, it } from 'vitest';
import { CONSUMER_KINDS, GRAPH_CHANGE_KINDS, consumerCodeDigest, type GraphChangedPayload } from '../../../src/graph/subscriptions/graph-change.js';
import { LIFECYCLE_EVENT_LIST_MAX, cutList, forecastWithdrawnGraphEvent, simulationInvalidatedGraphEvent, touchedIds, twinStateChangedGraphEvent } from '../../../src/graph/subscriptions/change-events.js';

let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190b1c2-d3e4-7000-8000-${h}`; };
const ACTOR = uid();
const AT = '2026-09-17T09:00:00.000Z';
const EMPTY_REACH_KEYS = { claims: [], assumptions: [], objectives: [], decisions: [], commitments: [], forecasts: [], scenarios: [], warnings: [], twins: [], simulations: [], evidence: [], briefings: [], memoryItems: [] };
const payloadOf = (row: { payload: Record<string, unknown> }): GraphChangedPayload => row.payload as unknown as GraphChangedPayload;

describe('B18 · the kinds, the ceiling and the consumer identities', () => {
  it('GRAPH_CHANGE_KINDS carries twin.state_changed, forecast.withdrawn and simulation.invalidated', () => {
    expect(GRAPH_CHANGE_KINDS).toContain('twin.state_changed');
    expect(GRAPH_CHANGE_KINDS).toContain('forecast.withdrawn');
    expect(GRAPH_CHANGE_KINDS).toContain('simulation.invalidated');
  });
  it('the ceiling is 200 and cutList says when it cut', () => {
    expect(LIFECYCLE_EVENT_LIST_MAX).toBe(200);
    const xs = Array.from({ length: 201 }, (_, i) => i);
    expect(cutList(xs)).toEqual({ list: xs.slice(0, 200), truncated: true });
    expect(cutList(xs.slice(0, 200))).toEqual({ list: xs.slice(0, 200), truncated: false });
    expect(cutList([])).toEqual({ list: [], truncated: false });
  });
  it('the twins and decisions consumers changed their methods (D3/D4, D16/C13): 64-hex digests, each distinct from every other kind\'s', () => {
    for (const kind of ['twins', 'decisions'] as const) expect(consumerCodeDigest(kind)).toMatch(/^[0-9a-f]{64}$/);
    // The B8 precedent: a changed method is a new consumer identity — the live subscriptions are re-registered. Pinned so a silent revert is caught.
    const digests = CONSUMER_KINDS.map((k) => consumerCodeDigest(k));
    expect(new Set(digests).size).toBe(CONSUMER_KINDS.length);
  });
});

describe('B18 · twinStateChangedGraphEvent (D3)', () => {
  it('a twin version admitted, pinned key by key: no identities, objects.twins the twin, objects.simulations the superseded version\'s runs, walked false, the twin block, the admit act as the cause', () => {
    const twin = uid(); const r1 = uid(); const r2 = uid();
    const subscriptions = [{ subscription_id: uid(), consumer_kind: 'twins' }, { subscription_id: uid(), consumer_kind: 'decisions' }];
    const row = twinStateChangedGraphEvent({ twinId: twin, version: 2, supersedes: 1, branchId: 'actual', changedVariables: 3, runs: [r1, r2], subscriptions, actor: ACTOR, occurredAt: AT });
    expect(row.eventType).toBe('GraphChanged');
    expect(payloadOf(row)).toEqual({
      schema: 'GraphChanged', schema_version: 'v1',
      change: { kind: 'twin.state_changed', occurred_at: AT, graph_event_id: null, invalidation_id: null, correction_case_id: null },
      identities: [],
      relationships: { edges: [], resolutions: [], dependencies: [] },
      objects: { ...EMPTY_REACH_KEYS, twins: [twin], simulations: [r1, r2], truncated: false, walked: false },
      temporal: { known_at: AT },
      subscriptions,
      cause: { action: 'twin.version.admit', actor: ACTOR, target_type: 'TWN', target_id: twin },
      twin: { twin_id: twin, version: 2, supersedes: 1, branch_id: 'actual', change: 'version.admitted', changed_variables: 3, runs_of_superseded: 2 },
    });
  });
  it('a first version supersedes nothing and names no runs; the instant defaults to now when not given', () => {
    const twin = uid();
    const before = Date.now();
    const p = payloadOf(twinStateChangedGraphEvent({ twinId: twin, version: 1, supersedes: null, branchId: 'actual', changedVariables: 12, runs: [], subscriptions: [], actor: ACTOR }));
    expect(p.objects.simulations).toEqual([]);
    expect(p.objects.truncated).toBe(false);
    expect(p.twin).toEqual({ twin_id: twin, version: 1, supersedes: null, branch_id: 'actual', change: 'version.admitted', changed_variables: 12, runs_of_superseded: 0 });
    expect(Date.parse(p.change.occurred_at)).toBeGreaterThanOrEqual(before);
    expect(p.temporal.known_at).toBe(p.change.occurred_at);
  });
  it('the ceiling: 250 runs of the superseded version are cut to 200 with objects.truncated true, walked stays false, and the block counts the whole 250', () => {
    const runs = Array.from({ length: 250 }, () => uid());
    const p = payloadOf(twinStateChangedGraphEvent({ twinId: uid(), version: 3, supersedes: 2, branchId: 'actual', changedVariables: 0, runs, subscriptions: [], actor: ACTOR, occurredAt: AT }));
    expect(p.objects.simulations.length).toBe(200);
    expect(p.objects.simulations).toEqual(runs.slice(0, 200));
    expect(p.objects.truncated).toBe(true);
    expect(p.objects.walked).toBe(false);
    expect(p.twin?.runs_of_superseded).toBe(250);
    const whole = payloadOf(twinStateChangedGraphEvent({ twinId: uid(), version: 3, supersedes: 2, branchId: 'actual', changedVariables: 0, runs: runs.slice(0, 200), subscriptions: [], actor: ACTOR, occurredAt: AT }));
    expect(whole.objects.truncated).toBe(false);
  });
  it('touchedIds: the twin in twins, the superseded version\'s runs in runs, no entity changed, unwalked', () => {
    const twin = uid(); const r1 = uid();
    const p = payloadOf(twinStateChangedGraphEvent({ twinId: twin, version: 2, supersedes: 1, branchId: 'actual', changedVariables: 1, runs: [r1], subscriptions: [], actor: ACTOR, occurredAt: AT }));
    const t = touchedIds({ event_type: 'GraphChanged', payload: p });
    expect(t.twins).toEqual(new Set([twin]));
    expect(t.runs).toEqual(new Set([r1]));
    expect(t.changedEntities.size).toBe(0); expect(t.entities.size).toBe(0);
    expect(t.forecasts.size).toBe(0); expect(t.claims.size).toBe(0); expect(t.strategy.size).toBe(0);
    expect(t.walked).toBe(false); expect(t.truncated).toBe(false);
  });
});

describe('B18 · forecastWithdrawnGraphEvent (D8, D17)', () => {
  const dependants = { scenarios: [uid()], warnings: [uid(), uid()], twins: [uid()], simulations: [uid()], packages: [{ package_id: uid(), version: 1, state: 'committed' }], truncated: false };
  it('an issued forecast withdrawn as unfit, pinned key by key: the forecastSupersededEvent shape (objects.forecasts the forecast, walked true), the forecast block with the reason, the unfit class, the instant and the port\'s dependants, the withdraw act as the cause', () => {
    const forecast = uid(); const subject = uid();
    const subscriptions = [{ subscription_id: uid(), consumer_kind: 'scenarios' }];
    const row = forecastWithdrawnGraphEvent({ forecastId: forecast, seriesKey: 'ecb-eurusd', horizon: '90d', subjectEntityId: subject, reason: 'the calibration failed on the September backtest', unfitClass: 'calibration_failure', withdrawnAt: AT, dependants, subscriptions, actor: ACTOR, occurredAt: AT });
    expect(row.eventType).toBe('GraphChanged');
    expect(payloadOf(row)).toEqual({
      schema: 'GraphChanged', schema_version: 'v1',
      change: { kind: 'forecast.withdrawn', occurred_at: AT, graph_event_id: null, invalidation_id: null, correction_case_id: null },
      identities: [],
      relationships: { edges: [], resolutions: [], dependencies: [] },
      objects: { ...EMPTY_REACH_KEYS, forecasts: [forecast], truncated: false, walked: true },
      temporal: { known_at: AT },
      subscriptions,
      cause: { action: 'prediction.forecast.withdraw', actor: ACTOR, target_type: 'FCT', target_id: forecast },
      forecast: { forecast_id: forecast, series_key: 'ecb-eurusd', horizon: '90d', reason: 'the calibration failed on the September backtest', unfit_class: 'calibration_failure', withdrawn_at: AT, dependants },
    });
  });
  it('the dependants are carried as the port built them (never re-shaped) and a subject-less forecast is admitted; touchedIds puts the forecast in forecasts alone', () => {
    const forecast = uid();
    const cut = { ...dependants, simulations: Array.from({ length: 200 }, () => uid()), truncated: true };
    const p = payloadOf(forecastWithdrawnGraphEvent({ forecastId: forecast, seriesKey: 's', horizon: '30d', subjectEntityId: null, reason: 'owner judgement', unfitClass: 'owner_judgement', withdrawnAt: AT, dependants: cut, subscriptions: [], actor: ACTOR, occurredAt: AT }));
    expect(p.forecast?.dependants).toBe(cut);
    expect(p.objects.forecasts).toEqual([forecast]);
    expect(p.objects.simulations).toEqual([]);
    const t = touchedIds({ event_type: 'GraphChanged', payload: p });
    expect(t.forecasts).toEqual(new Set([forecast]));
    expect(t.runs.size).toBe(0); expect(t.twins.size).toBe(0); expect(t.scenarios.size).toBe(0); expect(t.changedEntities.size).toBe(0);
    expect(t.walked).toBe(true);
  });
});

describe('B18 · simulationInvalidatedGraphEvent (D6, D7)', () => {
  const dependants = { packages: [{ package_id: uid(), version: 2, state: 'reopened', committed: true, option_keys: ['reroute'] }], commitments: [uid()], decisions: [uid()], twins: [], simulations: [uid()] };
  it('a completed run invalidated by a person, pinned key by key: objects.simulations the run, walked true, the simulation block with the operator trigger and no reference, the invalidate act as the cause', () => {
    const run = uid();
    const subscriptions = [{ subscription_id: uid(), consumer_kind: 'decisions' }, { subscription_id: uid(), consumer_kind: 'retrieval' }];
    const row = simulationInvalidatedGraphEvent({ runId: run, reason: 'the shock basis was misread', trigger: 'operator', triggerRef: null, invalidatedAt: AT, dependants, subscriptions, actor: ACTOR, action: 'simulation.run.invalidate', occurredAt: AT });
    expect(row.eventType).toBe('GraphChanged');
    expect(payloadOf(row)).toEqual({
      schema: 'GraphChanged', schema_version: 'v1',
      change: { kind: 'simulation.invalidated', occurred_at: AT, graph_event_id: null, invalidation_id: null, correction_case_id: null },
      identities: [],
      relationships: { edges: [], resolutions: [], dependencies: [] },
      objects: { ...EMPTY_REACH_KEYS, simulations: [run], truncated: false, walked: true },
      temporal: { known_at: AT },
      subscriptions,
      cause: { action: 'simulation.run.invalidate', actor: ACTOR, target_type: 'SIM', target_id: run },
      simulation: { run_id: run, reason: 'the shock basis was misread', trigger: 'operator', trigger_ref: null, invalidated_at: AT, dependants },
    });
  });
  it('a reproduction\'s unreproducible verdict invalidates under simulation.reproduce with the reproduction as the reference; touchedIds puts the run in runs alone', () => {
    const run = uid(); const reproduction = uid();
    const p = payloadOf(simulationInvalidatedGraphEvent({ runId: run, reason: 'unreproducible: forecast x@1 withdrawn at version 2', trigger: 'reproduction', triggerRef: reproduction, invalidatedAt: AT, dependants, subscriptions: [], actor: ACTOR, action: 'simulation.reproduce', occurredAt: AT }));
    expect(p.cause).toEqual({ action: 'simulation.reproduce', actor: ACTOR, target_type: 'SIM', target_id: run });
    expect(p.simulation).toEqual({ run_id: run, reason: 'unreproducible: forecast x@1 withdrawn at version 2', trigger: 'reproduction', trigger_ref: reproduction, invalidated_at: AT, dependants });
    const t = touchedIds({ event_type: 'GraphChanged', payload: p });
    expect(t.runs).toEqual(new Set([run]));
    expect(t.forecasts.size).toBe(0); expect(t.twins.size).toBe(0); expect(t.strategy.size).toBe(0); expect(t.changedEntities.size).toBe(0);
    expect(t.walked).toBe(true); expect(t.truncated).toBe(false);
  });
  it('the three typed blocks never coexist: each kind carries its own and no other', () => {
    const twin = payloadOf(twinStateChangedGraphEvent({ twinId: uid(), version: 2, supersedes: 1, branchId: 'actual', changedVariables: 0, runs: [], subscriptions: [], actor: ACTOR, occurredAt: AT }));
    const forecast = payloadOf(forecastWithdrawnGraphEvent({ forecastId: uid(), seriesKey: 's', horizon: '30d', subjectEntityId: null, reason: 'drift', unfitClass: 'drift', withdrawnAt: AT, dependants: {}, subscriptions: [], actor: ACTOR, occurredAt: AT }));
    const run = payloadOf(simulationInvalidatedGraphEvent({ runId: uid(), reason: 'misread', trigger: 'operator', triggerRef: null, invalidatedAt: AT, dependants: {}, subscriptions: [], actor: ACTOR, action: 'simulation.run.invalidate', occurredAt: AT }));
    expect(Object.keys(twin)).not.toContain('forecast'); expect(Object.keys(twin)).not.toContain('simulation'); expect(Object.keys(twin)).not.toContain('import');
    expect(Object.keys(forecast)).not.toContain('twin'); expect(Object.keys(forecast)).not.toContain('simulation');
    expect(Object.keys(run)).not.toContain('twin'); expect(Object.keys(run)).not.toContain('forecast');
  });
});
