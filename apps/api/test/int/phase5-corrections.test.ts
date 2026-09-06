/**
 * PHASE 5 · one consolidated correction pass against the Codex review of f66a958d.
 *
 * Six groups, each reproduced through the real database and controller harness
 * before the fix and kept as the regression after it:
 *
 *   F1  grounding under both cut-offs; values established from the cited record;
 *       the selected component's inputs; a run needs a world-time cut-off;
 *       carry-forward re-evaluates health under the new cut-offs
 *   F2  a predicted element carries its forecast's validation state into the run;
 *       a claim-derived element without a truth state fails the CHECK closed
 *   F3  a run binds the exact scenario version and branch, inherits its controls,
 *       registers the dependency; a shock without a scenario is a HYPOTHETICAL
 *   F4  reproduction is executed by the product in a separate process, and
 *       establishes that every cited artefact is still available to this reader
 *   F5  every citation route reaches the twin; pending work through a forecast
 *   F6  as-of verification, comparison of material semantics, reconciliation
 *
 * Uploaded records go through the real upload route; nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import { TwinCapability } from '../../src/twin/twin.capabilities.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';

import { INVENTORY_CSV, TERMS_CSV, RECORD_FILES, cite, observedInventory as inventoryOf, observedShipments as shipmentsOf, assumedTerms as termsOf } from './phase5-fixtures.js';

type Evd = { id: string; version: number; digest: string; recordedAt: string };

let h: Phase4Harness;
let twins: TwinController; let prediction: PredictionController; let graph: GraphController; let observation: ObservationController;
let owner: AuthenticatedPrincipal; let operator: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal;
let ownerId = ''; let seriesKey = ''; let knownNow = '';
let seriesEvd: Evd; let invEvd: Evd; let shipEvd: Evd; let termsEvd: Evd; let uploadSourceId = '';
let derivedClaim = ''; let impossibleForecast = ''; let scenarioId = ''; let flippedBranch = ''; let baselineBranch = '';
let entityId = ''; let twinId = '';

const status = async (p: Promise<unknown>): Promise<number | string> => { try { await p; return 'ok'; } catch (e) { return e instanceof HttpException ? e.getStatus() : (e instanceof Error ? e.message : String(e)); } };
const message = async (p: Promise<unknown>): Promise<string> => { try { await p; return ''; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? '') : (e instanceof Error ? e.message : String(e)); } };
const cite = (e: { id: string; version: number }) => ({ kind: 'evidence', id: e.id, version: e.version });

const open = (payload: Record<string, unknown>) => twins.openVersion(h.req(owner, 'twin.version', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, { payload }) as Promise<{ version: { version: number } }>;
const ground = (version: number, elements: unknown[]) => twins.ground(h.req(owner, 'twin.ground', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(version), { payload: { elements } }) as Promise<{ grounded: Array<{ key: string; material: boolean; health: string }> }>;
const admit = (version: number, allowIncomplete = false) => twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(version), { payload: { allowIncomplete } }) as Promise<{ admitted: { completeness: string; missingKeys: string[] } }>;
const getTwin = () => twins.get(h.req(owner, 'twin.read', 'TWN', twinId, 'twin'), h.fx.tenantId, h.fx.domainId, twinId) as Promise<{ twin: Record<string, unknown> & { versions: Array<Record<string, unknown>>; propagation_pending: Array<{ case_id: string }> } }>;
const run = (payload: Record<string, unknown>, as = operator) => twins.run(h.req(as, 'simulation.run', 'SIM', null, 'simulation'), h.fx.tenantId, h.fx.domainId, { payload }) as Promise<{ run: { runId: string; outputsDigest: string; totals: Record<string, unknown>; state: string } }>;
const reproduce = (runId: string, payload: Record<string, unknown> = {}) => twins.reproduce(h.req(operator, 'simulation.reproduce', 'SIM', runId, 'simulation'), h.fx.tenantId, h.fx.domainId, runId, { payload }) as Promise<{ reproduction: { verdict: string; reason: string; actual: string | null } }>;
const runRow = async (id: string) => (await sql<Record<string, unknown>>`select * from simulation.runs_current where run_id = ${id}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
const elementRow = async (version: number, key: string) => (await sql<Record<string, unknown>>`select * from twin.state_elements where twin_id = ${twinId}::uuid and version = ${version} and key = ${key}`.execute(h.su)).rows[0] as Record<string, unknown> | undefined;
const baseRun = (over: Record<string, unknown> = {}) => ({ twinId, runKind: 'control', controlRunId: null, shock: false, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...over });

const observedInventory = (evd: Evd = invEvd) => inventoryOf(evd);
const observedShipments = () => shipmentsOf(shipEvd, '2024-01-11', ['SYN-SHIP-4471', 'SYN-SHIP-4472']);
const assumedTerms = (evd: Evd = termsEvd) => termsOf(evd);
const complete = () => [...observedInventory(), ...observedShipments(), ...assumedTerms()];

async function admitted(branch: string, elements: unknown[], over: Record<string, unknown> = {}): Promise<number> {
  const o = await open({ branchId: branch, knownAt: new Date().toISOString(), observedThrough: '2024-01-17', ...over });
  await ground(o.version.version, elements);
  await admit(o.version.version);
  return o.version.version;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { TwinController: T } = await import('../../src/twin/twin.controller.js');
  const { PredictionController: P } = await import('../../src/prediction/prediction.controller.js');
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  twins = h.app.get(T); prediction = h.app.get(P); graph = h.app.get(G); observation = h.app.get(O);
  owner = await h.principalWith(['twin_owner', 'forecast_owner', 'strategy_owner', 'simulation_operator'], 'twin-owner');
  operator = await h.principalWith(['simulation_operator'], 'sim-operator');
  manager = await h.principalWith(['collection_manager'], 'collection-manager');
  ownerId = owner.principalId;
  // The corridor series (real, replayed), then the uploaded records (synthetic).
  const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  const evds = (await sql<Evd & { recordedAt: string }>`select object_id::text id, object_version::int version, content_digest digest, recorded_at::text "recordedAt"
    from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at`.execute(h.su)).rows;
  seriesEvd = evds[0] as Evd;
  const uploaded = await h.upload(RECORD_FILES());
  [invEvd, shipEvd, termsEvd] = uploaded as [Evd, Evd, Evd];
  uploadSourceId = await h.uploadSource();
  knownNow = new Date().toISOString();
  seriesKey = `fixture:${v.sourceKey}:value`;
  await prediction.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), h.fx.tenantId, h.fx.domainId,
    { payload: { seriesKey, sourceKey: v.sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                 seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode' } });
  const assumptionId = uuidv7();
  await sql`insert into graph.strategy_current (strategy_object_id, scope, tenant_id, domain_id, object_type, object_version, title, statement, status, verification_state, owner_principal_id, correlation_id)
    values (${assumptionId}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, 'ASU', 1, 'The corridor stays open', 'transits continue at their seasonal level', 'active', 'verified', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  // A forecast on a history too short to backtest: validation_impossible, by the product's own rule.
  const f = await prediction.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
    { payload: { seriesKey, horizon: '30d', knownAt: knownNow, observedThrough: '2021-02-15', assumptions: [assumptionId], label: 'short history' } }) as { forecast: { forecastId: string; validationState: string } };
  expect(f.forecast.validationState).toBe('validation_impossible');
  impossibleForecast = f.forecast.forecastId;
  // A scenario tree with a downside branch on an indicator the replayed collapse breaches.
  const ind = await prediction.defineIndicator(h.req(owner, 'prediction.indicator.define', 'IND', null), h.fx.tenantId, h.fx.domainId,
    { payload: { seriesKey, description: 'corridor collapse: transits below 40 for five days', comparator: '<', threshold: 40, consecutiveDays: 5, owner: ownerId } }) as { indicator: { indicatorId: string } };
  const scn = await prediction.declareScenario(h.req(owner, 'prediction.scenario.declare', 'SCN', null), h.fx.tenantId, h.fx.domainId,
    { payload: { title: 'Bab el-Mandeb over the next 30 days', statement: 'the corridor stays open, or collapses', forecastId: impossibleForecast, owner: ownerId, reviewCadence: 'weekly',
                 branches: [
                   { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: ownerId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                   { name: 'Corridor collapse', kind: 'downside', statement: 'below 40 for five days', indicatorId: ind.indicator.indicatorId, owner: ownerId, consequence: 'rebook the shipment now', responseWindowHours: 48 },
                 ] } }) as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } };
  scenarioId = scn.scenario.scenarioId;
  flippedBranch = scn.scenario.branches.find((b) => b.kind === 'downside')?.branchId as string;
  baselineBranch = scn.scenario.branches.find((b) => b.kind === 'baseline')?.branchId as string;
  await prediction.evaluateIndicator(h.req(owner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), h.fx.tenantId, h.fx.domainId,
    ind.indicator.indicatorId, { payload: { knownAt: new Date().toISOString() } });
  const flipped = (await sql<{ state: string }>`select state from prediction.branches_current where branch_id = ${flippedBranch}::uuid`.execute(h.su)).rows[0];
  expect(flipped?.state).toBe('flipped');
  // A derived claim with lineage from the uploaded terms document (scaffolding: the minimal rows the intelligence ports would write).
  derivedClaim = uuidv7();
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component,
      accountable_owner, truth_state, classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest, evidence_refs)
    values (${derivedClaim}::uuid, 'CLM', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, 'DOMAIN', 1, 'admitted', 'CP-INT-01', 'principal:fixture',
      'extracted', 'internal', 'intelligence', 'CLM@v2', ${uuidv7()}::uuid, '{"subject":"SYN-ROUTE-ASIA-EU-01","predicate":"inland_days","object_value":"14"}'::jsonb,
      ${'c'.repeat(64)}, ${JSON.stringify([`EVD:${termsEvd.id}@${termsEvd.version}`])}::jsonb)`.execute(h.su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode,
      evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${derivedClaim}::uuid, 1, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, 'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay',
      ${termsEvd.id}::uuid, ${termsEvd.digest}, 0, 10, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  entityId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(owner, 'twin.declare', 'TWN', null), h.fx.tenantId, h.fx.domainId, { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet chain',
    boundary: [entityId], owner: ownerId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
}, 300_000);

afterAll(async () => { await h?.close(); });

/* ═════════ F1 · grounding and cut-offs ═════════ */

describe('F1 · every input is grounded under both cut-offs and established from its record', () => {
  it('RECORD time: a citation recorded after known_at is refused; the same citation under a later known_at is accepted', async () => {
    const early = await open({ branchId: 'f1-record-time', knownAt: '2026-01-01T00:00:00Z', observedThrough: '2024-01-17' });
    const m = await message(ground(early.version.version, [{ key: 'route.inland_days', kind: 'assumed', value: 14, unit: 'days', citations: [cite(termsEvd)] }]));
    expect(m, 'a record recorded after the version\'s known_at was accepted as known').toMatch(/known at record time|recorded after/i);
    expect(await status(ground(early.version.version, [{ key: 'route.inland_days', kind: 'assumed', value: 14, unit: 'days', citations: [cite(termsEvd)] }]))).toBe(422);
    const later = await open({ branchId: 'f1-record-time-ok', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' });
    const g = await ground(later.version.version, [{ key: 'route.inland_days', kind: 'assumed', value: 14, unit: 'days', citations: [cite(termsEvd)] }]);
    expect(g.grounded[0]?.health).toBe('complete');
  }, 120_000);

  it('an OBSERVED value is established from the cited record and field, not taken from the caller', async () => {
    // a record dated after the world cut-off (uploaded BEFORE the draft's known_at, so only the world cut-off can refuse it)
    const late = (await h.upload([{ filename: 'inventory-2024Q2.csv', text: INVENTORY_CSV.replace('SYN-INV-001', 'SYN-INV-101'), documentTime: '2024-03-01T00:00:00Z' }]))[0] as Evd;
    const v = (await open({ branchId: 'f1-substantiation', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' })).version.version;
    const el = observedInventory()[0] as Record<string, unknown>;
    // the caller's number is not what the record says
    expect(await message(ground(v, [{ ...el, value: 999999 }]))).toMatch(/not what record|not established|record SYN-INV-001/i);
    // no record named at all
    const { record: _r, ...noRecord } = el;
    expect(await message(ground(v, [noRecord]))).toMatch(/record/i);
    // a series window is not a record: observations from a series are grounded through ground-series
    expect(await message(ground(v, [{ ...el, citations: [cite(seriesEvd)] }]))).toMatch(/series/i);
    // a value observed AFTER the world cut-off cannot be in a version whose world ends 2024-01-17
    expect(await message(ground(v, [{ ...el, validFrom: '2024-02-01' }]))).toMatch(/world cut-off|after observed_through|observed after/i);
    // and the record itself may not be dated after the world cut-off
    expect(await message(ground(v, [{ ...el, key: 'inventory.on_hand:SYN-PART-LATE', citations: [cite(late)], record: { locator: 'SYN-INV-101', field: 'on_hand' } }]))).toMatch(/world cut-off|observed after|dated after/i);
    // the honest one: the record establishes the value
    const g = await ground(v, [el]);
    expect(g.grounded[0]?.health).toBe('complete');
    const row = await elementRow(v, 'inventory.on_hand:SYN-PART-MAG');
    expect(Number(row?.['value'])).toBe(63400);
    // a shipment: an object established from the row's columns
    const s = await ground(v, [observedShipments()[0]]);
    expect(s.grounded[0]?.health).toBe('complete');
    const ship = await elementRow(v, 'shipment:SYN-SHIP-4471');
    expect((ship?.['value'] as Record<string, unknown>)['eta_port']).toBe('2024-01-29');
  }, 120_000);

  it('the SELECTED component\'s stale input is not masked by another component\'s healthy one', async () => {
    const stale = observedInventory().map((e) => (e.key === 'inventory.on_hand:SYN-PART-MAG' ? { ...e, validFrom: '2024-01-01', validTo: '2024-01-10' } : e));
    const other = { key: 'inventory.on_hand:SYN-PART-PWR', kind: 'observed', value: 21800, unit: 'sets', validFrom: '2024-01-11', citations: [cite(invEvd)], record: { locator: 'SYN-INV-002', field: 'on_hand' } };
    const v = await admitted('f1-masking', [...stale, other, ...observedShipments(), ...assumedTerms()]);
    const el = await elementRow(v, 'inventory.on_hand:SYN-PART-MAG');
    expect(el?.['health']).toBe('stale');
    const m = await message(run(baseRun({ twinVersion: v })));
    expect(m, 'a run consumed a stale on-hand value because another component\'s on-hand was healthy').toMatch(/stale|unusable|not usable/i);
    expect((await sql<{ n: string }>`select count(*)::text n from simulation.runs_current where twin_id = ${twinId}::uuid and twin_version = ${v}`.execute(h.su)).rows[0]?.n).toBe('0');
  }, 120_000);

  it('a run needs a WORLD-time cut-off: a version without observed_through cannot be run', async () => {
    const v = await admitted('f1-no-world-cutoff', complete(), { observedThrough: null });
    const m = await message(run(baseRun({ twinVersion: v })));
    expect(m, 'a run was opened on a version with no world-time cut-off').toMatch(/world-time cut-off|observed_through/i);
  }, 120_000);

  it('CARRY-FORWARD re-evaluates health under the new cut-offs: not known yet, or not yet observed, is not complete', async () => {
    const v1 = await admitted('f1-carry', complete());
    // A new version that claims to have known these records before they were recorded.
    const early = (await open({ branchId: 'f1-carry-early', forkedFromVersion: v1, carryFrom: v1, knownAt: '2026-01-01T00:00:00Z', observedThrough: '2024-01-17' })).version.version;
    const healths = (await sql<{ health: string; n: string }>`select health, count(*)::text n from twin.state_elements where twin_id = ${twinId}::uuid and version = ${early} group by 1`.execute(h.su)).rows;
    expect(healths.map((x) => x.health), 'elements citing records recorded after the new known_at were carried as complete').toEqual(['incomplete']);
    expect(await status(admit(early))).toBe(409);
    // A new version whose world ends before the inventory was observed (valid from 2024-01-11).
    const before = (await open({ branchId: 'f1-carry-before', forkedFromVersion: v1, carryFrom: v1, knownAt: new Date().toISOString(), observedThrough: '2024-01-05' })).version.version;
    const inv = await elementRow(before, 'inventory.on_hand:SYN-PART-MAG');
    expect(inv?.['health'], 'an observation dated after the new observed_through was carried as complete').toBe('incomplete');
    const terms = await elementRow(before, 'route.inland_days');
    expect(terms?.['health']).toBe('complete');
  }, 120_000);
});

/* ═════════ F2 · kinds and forecast validation ═════════ */

describe('F2 · a predicted element carries its forecast\'s validation state; a claim basis is never NULL', () => {
  it('a predicted element records validation_impossible, the twin payload shows it, and the run says so in its own status', async () => {
    const predicted = { key: 'context.transits_forecast', kind: 'predicted', value: { horizon: '30d' }, citations: [{ kind: 'forecast', id: impossibleForecast }] };
    const v = await admitted('f2-predicted', [...complete(), predicted]);
    const el = await elementRow(v, 'context.transits_forecast');
    expect(el?.['inherited_validation'], 'the forecast\'s validation state was not bound to the element').toBe('validation_impossible');
    const payload = (await sql<{ p: { elements: Array<Record<string, unknown>> } }>`select payload p from objects.canonical_objects where object_id = ${twinId}::uuid and object_version = ${v}`.execute(h.su)).rows[0]?.p;
    expect(payload?.elements.find((e) => e['key'] === 'context.transits_forecast')?.['inherited_validation']).toBe('validation_impossible');
    const r = await run(baseRun({ twinVersion: v }));
    const row = await runRow(r.run.runId);
    expect(String(row['validation_status'])).toMatch(/validation_impossible/);
    expect(String(row['validation_status'])).toMatch(/context\.transits_forecast/);
    const sim = (await sql<{ p: { validation_status: string } }>`select payload p from objects.canonical_objects where object_id = ${r.run.runId}::uuid`.execute(h.su)).rows[0]?.p;
    expect(sim?.validation_status).toMatch(/validation_impossible/);
  }, 180_000);

  it('DATABASE: an observed or estimated element citing a claim without a truth state fails closed, at the CHECK and at the port', async () => {
    const v = (await open({ branchId: 'f2-null-basis', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' })).version.version;
    const citation = JSON.stringify([{ kind: 'claim', id: derivedClaim, version: 1, digest: 'c'.repeat(64) }]);
    await expect(sql`insert into twin.state_elements (element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, basis_truth_state, value, material, citations, health, grounded_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${twinId}::uuid, ${v}, 'probe.null-basis', 'observed', null, '1'::jsonb, false, ${citation}::jsonb, 'complete', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su))
      .rejects.toThrow(/violates check constraint/);
    await expect(h.pipeline.write(h.env(owner, 'twin.ground', 'TWN', twinId), owner,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'twin.ground', objectType: 'TWN', objectId: twinId }, TwinCapability.ground,
      async (cap) => {
        await cap.groundElement({ elementId: uuidv7(), tenantId: h.fx.tenantId, domainId: h.fx.domainId, twinId, version: v, key: 'probe.port-null-basis', kind: 'estimated', basisTruthState: null,
          value: 1, unit: null, citations: [{ kind: 'claim', id: derivedClaim, version: 1, digest: 'c'.repeat(64) }], health: 'complete', validFrom: null, validTo: null, confidence: null, syntheticState: false, controls: {},
          actor: ownerId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'TWN', targetId: twinId, targetVersion: String(v), outboxEvent: null };
      })).rejects.toThrow(/truth state|check constraint/i);
  }, 120_000);
});

/* ═════════ F3 · scenario binding ═════════ */

describe('F3 · a run binds the exact scenario version and branch; a shock without a scenario is hypothetical', () => {
  let v = 0;
  it('a shock on a FLIPPED branch is bound: scenario version, branch state, controls, dependency, digest', async () => {
    v = await admitted('f3-scenario', complete());
    const r = await run(baseRun({ twinVersion: v, shock: true, scenarioId, scenarioBranchId: flippedBranch }));
    const row = await runRow(r.run.runId);
    expect(row['scenario_id']).toBe(scenarioId);
    expect(Number(row['scenario_version'])).toBe(1);
    expect(row['scenario_branch_state']).toBe('flipped');
    expect(row['shock_basis']).toBe('scenario-branch-flipped');
    // the scenario's controls fold into the run and its SIM header (the scenario rests on a synthetic, restricted forecast)
    const scn = (await sql<{ classification: string }>`select classification from objects.canonical_objects where object_id = ${scenarioId}::uuid`.execute(h.su)).rows[0];
    const sim = (await sql<{ classification: string; p: Record<string, unknown> }>`select classification, payload p from objects.canonical_objects where object_id = ${r.run.runId}::uuid`.execute(h.su)).rows[0];
    expect(sim?.classification).toBe(scn?.classification);
    expect((sim?.p['scenario'] as Record<string, unknown>)['version']).toBe(1);
    expect((sim?.p['scenario'] as Record<string, unknown>)['branch_state']).toBe('flipped');
    expect(sim?.p['shock_basis']).toBe('scenario-branch-flipped');
    const deps = (await sql<{ k: string; id: string }>`select depends_on_kind k, depends_on_id::text id from graph.dependencies where dependent_object_id = ${r.run.runId}::uuid order by 1`.execute(h.su)).rows;
    expect(deps.some((d) => d.k === 'strategy' && d.id === scenarioId), 'the run does not depend on the scenario it applied').toBe(true);
    // a different scenario binding is a different experiment: the baseline branch, no shock
    const b = await run(baseRun({ twinVersion: v, shock: false, scenarioId, scenarioBranchId: baselineBranch }));
    const rowB = await runRow(b.run.runId);
    expect(rowB['shock_basis']).toBe('none');
    expect(rowB['inputs_digest']).not.toBe(row['inputs_digest']);
  }, 180_000);

  it('an unresolved scenario, a branch of another tree, or a shock the branch state contradicts is refused', async () => {
    expect(await message(run(baseRun({ twinVersion: v, shock: true, scenarioId: uuidv7(), scenarioBranchId: flippedBranch })))).toMatch(/scenario/i);
    expect(await message(run(baseRun({ twinVersion: v, shock: true, scenarioId, scenarioBranchId: uuidv7() })))).toMatch(/branch/i);
    expect(await message(run(baseRun({ twinVersion: v, shock: true, scenarioId, scenarioBranchId: baselineBranch })))).toMatch(/not flipped|open|contradict/i);
    expect(await message(run(baseRun({ twinVersion: v, shock: false, scenarioId, scenarioBranchId: flippedBranch })))).toMatch(/flipped|contradict/i);
    expect(await message(run(baseRun({ twinVersion: v, shock: true, scenarioId: null, scenarioBranchId: flippedBranch })))).toMatch(/scenario/i);
  }, 120_000);

  it('a shock with NO scenario is recorded as a HYPOTHETICAL, never as an observed branch flip', async () => {
    const r = await run(baseRun({ twinVersion: v, shock: true }));
    const row = await runRow(r.run.runId);
    expect(row['shock_basis']).toBe('hypothetical');
    expect(row['scenario_id']).toBeNull();
    const sim = (await sql<{ p: Record<string, unknown> }>`select payload p from objects.canonical_objects where object_id = ${r.run.runId}::uuid`.execute(h.su)).rows[0];
    expect(sim?.p['shock_basis']).toBe('hypothetical');
    expect(sim?.p['scenario']).toBeNull();
  }, 120_000);
});

/* ═════════ F4 · reproduction ═════════ */

describe('F4 · the product executes the reproduction in a separate process and establishes availability itself', () => {
  let v = 0; let controlId = '';
  it('a reproduction is executed in a separate process by the product — the caller cannot attest it', async () => {
    v = await admitted('f4-repro', complete());
    controlId = (await run(baseRun({ twinVersion: v }))).run.runId;
    const r = await reproduce(controlId, { cold: false });
    expect(r.reproduction.verdict).toBe('reproduced');
    expect(r.reproduction.reason, 'the reproduction did not say which separate process executed it').toMatch(/separate process|cold process/i);
    const pid = Number(/pid (\d+)/.exec(r.reproduction.reason)?.[1] ?? 0);
    expect(pid).toBeGreaterThan(0);
    expect(pid).not.toBe(process.pid);
    const rows = (await sql<{ cold_process: boolean }>`select cold_process from simulation.reproductions where run_id = ${controlId}::uuid`.execute(h.su)).rows;
    expect(rows.map((x) => x.cold_process)).toEqual([true]);
  }, 120_000);

  it('when a cited artefact is withdrawn (governed), the run is UNREPRODUCIBLE for this reader — never reassembled from newer evidence', async () => {
    // A second twin version citing a terms document that will then be withdrawn.
    const terms2 = (await h.upload([{ filename: 'routes-and-terms-2024Q1-b.csv', text: TERMS_CSV.replace('door-to-door', 'door-to-door (restated)'), documentTime: '2024-01-11T00:00:00Z' }]))[0] as Evd;
    const v2 = await admitted('f4-withdrawn', [...observedInventory(), ...observedShipments(), ...assumedTerms(terms2)]);
    const c = (await run(baseRun({ twinVersion: v2 }))).run.runId;
    expect((await reproduce(c)).reproduction.verdict).toBe('reproduced');
    const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), h.fx.tenantId, h.fx.domainId,
      { payload: { sourceId: uploadSourceId, kind: 'withdrawal', channel: 'operator', publisherRef: 'terms document withdrawn', reason: 'the restated terms document was withdrawn by its author', affectedEvdIds: [terms2.id] } }) as { correction: { caseId: string } };
    await observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', opened.correction.caseId, 'observation'), h.fx.tenantId, h.fx.domainId, opened.correction.caseId,
      { payload: { decision: 'apply', affectedEvdIds: [terms2.id], reason: 'withdrawal verified' } });
    const r = await reproduce(c);
    expect(r.reproduction.verdict, 'a run whose cited document was withdrawn was reported reproduced').toBe('unreproducible');
    expect(r.reproduction.reason).toMatch(/withdrawn|no longer available|not available/i);
    expect(r.reproduction.actual).toBeNull();
    // the earlier run, whose documents are intact, still reproduces
    expect((await reproduce(controlId)).reproduction.verdict).toBe('reproduced');
  }, 180_000);
});

/* ═════════ F5 · propagation routes and pending work ═════════ */

describe('F5 · every citation route reaches the twin; pending work is seen through a forecast', () => {
  it('a version citing the evidence directly and a version citing a claim derived from it are BOTH marked; an unrelated version is not', async () => {
    const direct = await admitted('f5-direct', complete());
    const viaClaim = await admitted('f5-via-claim', [...observedInventory(), ...observedShipments(),
      ...assumedTerms(invEvd).filter((e) => e.key !== 'route.inland_days'),
      { key: 'route.inland_days', kind: 'estimated', value: 14, unit: 'days', citations: [{ kind: 'claim', id: derivedClaim }] }]);
    const unrelated = await admitted('f5-unrelated', [...observedInventory(), ...observedShipments(), ...assumedTerms(invEvd)]);
    const out = await graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', termsEvd.id, 'graph'), h.fx.tenantId, h.fx.domainId,
      { payload: { triggerKind: 'evidence_correction', triggerObjectId: termsEvd.id } }) as { impact: { twins: Array<{ strategy_object_id: string; via_id?: string; via_ids?: string[] }>; truncated: boolean } };
    const t = out.impact.twins.find((x) => x.strategy_object_id === twinId);
    expect(t?.via_ids ?? [t?.via_id], 'the walk kept only one citation route to the twin').toEqual(expect.arrayContaining([termsEvd.id, derivedClaim]));
    const states = Object.fromEntries((await sql<{ version: number; s: string }>`select version, verification_state s from twin.twin_versions where twin_id = ${twinId}::uuid and version in (${direct}, ${viaClaim}, ${unrelated})`.execute(h.su)).rows.map((r) => [r.version, r.s]));
    expect(states[direct]).toBe('unverified');
    expect(states[viaClaim], 'the version citing the derived claim stayed verified').toBe('unverified');
    expect(states[unrelated]).toBe('verified');
  }, 180_000);

  it('a correction to evidence a cited FORECAST read shows on the twin as PROPAGATION PENDING before any walk', async () => {
    const v = await admitted('f5-via-forecast', [...complete(), { key: 'context.transits_forecast', kind: 'predicted', value: { horizon: '30d' }, citations: [{ kind: 'forecast', id: impossibleForecast }] }]);
    const forecastEvd = (await sql<{ id: string }>`select depends_on_id::text id from graph.dependencies where dependent_object_id = ${impossibleForecast}::uuid and depends_on_kind = 'evidence' limit 1`.execute(h.su)).rows[0]?.id as string;
    expect(forecastEvd).toBeTruthy();
    const cited = (await sql<{ n: string }>`select count(*)::text n from twin.state_elements where twin_id = ${twinId}::uuid and version = ${v} and citations::text like ${`%${forecastEvd}%`}`.execute(h.su)).rows[0]?.n;
    expect(cited, 'the fixture cites the forecast\'s evidence directly; the probe would prove nothing').toBe('0');
    const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), h.fx.tenantId, h.fx.domainId,
      { payload: { sourceId: h.fx.sourceId, kind: 'correction', channel: 'publisher re-publication', publisherRef: 'restated window', reason: 'the publisher restated a window the forecast read', affectedEvdIds: [forecastEvd] } }) as { correction: { caseId: string } };
    await observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', opened.correction.caseId, 'observation'), h.fx.tenantId, h.fx.domainId, opened.correction.caseId,
      { payload: { decision: 'apply', affectedEvdIds: [forecastEvd], reason: 'restatement verified' } });
    const t = await getTwin();
    expect(t.twin.propagation_pending.map((p) => p.case_id), 'a correction behind the cited forecast is not shown as pending').toContain(opened.correction.caseId);
  }, 180_000);
});

/* ═════════ F6 · version semantics ═════════ */

describe('F6 · as-of verification, comparison of material semantics, reconciliation inputs', () => {
  it('AS-OF reconstructs the verification state at the instant asked, and says what it is now', async () => {
    const v = await admitted('f6-asof', complete());
    const between = new Date(Date.now() + 5).toISOString();
    await new Promise((r) => setTimeout(r, 20));
    await h.pipeline.write(h.env(owner, 'twin.version.admit', 'TWN', twinId), owner,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'twin.version.admit', objectType: 'TWN', objectId: twinId }, TwinCapability.admit,
      async (cap) => {
        await cap.markUnverified({ twinId, tenantId: h.fx.tenantId, domainId: h.fx.domainId, version: v, reason: 'probe: a cited input was corrected', invalidationId: null, actor: ownerId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'TWN', targetId: twinId, targetVersion: String(v), outboxEvent: null };
      });
    const asOf = await twins.asOf(h.req(owner, 'twin.read', 'TWN', twinId, 'twin'), h.fx.tenantId, h.fx.domainId, twinId, { payload: { branchId: 'f6-asof', instant: between } }) as { version: Record<string, unknown> | null };
    expect(asOf.version?.['version']).toBe(v);
    expect(asOf.version?.['verification_state_as_of'], 'an as-of read returned the verification state of a later event').toBe('verified');
    expect(asOf.version?.['verification_state_now']).toBe('unverified');
  }, 120_000);

  it('COMPARISON detects a changed unit and validity with the same number', async () => {
    const a = await admitted('f6-cmp-a', complete());
    const b = await admitted('f6-cmp-b', complete().map((e) => (e.key === 'terms.kg_per_unit:SYN-PART-MAG' ? { ...e, unit: 'g' } : e)));
    const c = await twins.compare(h.req(owner, 'twin.read', 'TWN', twinId, 'twin'), h.fx.tenantId, h.fx.domainId, twinId, { payload: { a, b } }) as { comparison: { differing: Array<{ key: string; a: Record<string, unknown>; b: Record<string, unknown> }> } };
    expect(c.comparison.differing.map((d) => d.key), 'a unit change was reported as the same element').toEqual(['terms.kg_per_unit:SYN-PART-MAG']);
    expect(c.comparison.differing[0]?.a['unit']).toBe('kg');
    expect(c.comparison.differing[0]?.b['unit']).toBe('g');
  }, 120_000);

  it('RECONCILIATION needs admitted inputs, compatible units, the same target, and an observation recorded AFTER the simulated value', async () => {
    const v = await admitted('f6-recon-base', complete());
    const controlId = (await run(baseRun({ twinVersion: v, shock: true }))).run.runId;
    const simKey = 'inventory.on_hand-2024-02-26:SYN-PART-MAG';
    const simVersion = await admitted('f6-recon-sim', [...complete(), { key: simKey, kind: 'simulated', value: 2942.857, unit: 'sets', validFrom: '2024-02-26', citations: [{ kind: 'run', id: controlId }] }]);
    const reconcile = (payload: Record<string, unknown>) => twins.reconcile(h.req(owner, 'twin.ground', 'TWN', twinId, 'twin'), h.fx.tenantId, h.fx.domainId, twinId, { payload }) as Promise<{ reconciliation: { difference: { numeric: string } } }>;
    // an observation citing a record recorded BEFORE the run completed is not a later observation
    const earlier = await admitted('f6-recon-earlier', [...complete(), { key: simKey, kind: 'observed', value: 63400, unit: 'sets', validFrom: '2024-02-26', citations: [cite(invEvd)], record: { locator: 'SYN-INV-001', field: 'on_hand' } }], { observedThrough: '2024-02-26' });
    expect(await message(reconcile({ key: simKey, fromVersion: simVersion, againstVersion: earlier, note: 'an earlier count' }))).toMatch(/recorded before|earlier|not later|not after/i);
    // a later record: the plant count, uploaded after the run completed
    const count = (await h.upload([{ filename: 'plant-count-2024-02-26.csv', text: 'synthetic,record_id,component_id,on_hand\ntrue,SYN-CNT-001,SYN-PART-MAG,3100\n', documentTime: '2024-02-26T00:00:00Z' }]))[0] as Evd;
    const later = await admitted('f6-recon-later', [...complete(), { key: simKey, kind: 'observed', value: 3100, unit: 'sets', validFrom: '2024-02-26', citations: [cite(count)], record: { locator: 'SYN-CNT-001', field: 'on_hand' } }], { observedThrough: '2024-02-26' });
    // a draft simulated source is refused; incompatible units are refused; a different target day is refused
    const draft = (await open({ branchId: 'f6-recon-draft', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' })).version.version;
    await ground(draft, [{ key: simKey, kind: 'simulated', value: 2942.857, unit: 'sets', validFrom: '2024-02-26', citations: [{ kind: 'run', id: controlId }] }]);
    expect(await message(reconcile({ key: simKey, fromVersion: draft, againstVersion: later, note: 'from a draft' }))).toMatch(/admitted|draft/i);
    const tonnes = await admitted('f6-recon-tonnes', [...complete(), { key: simKey, kind: 'simulated', value: 2.9, unit: 'tonnes', validFrom: '2024-02-26', citations: [{ kind: 'run', id: controlId }] }]);
    expect(await message(reconcile({ key: simKey, fromVersion: tonnes, againstVersion: later, note: 'tonnes against sets' }))).toMatch(/unit/i);
    const otherDay = await admitted('f6-recon-other-day', [...complete(), { key: simKey, kind: 'simulated', value: 2942.857, unit: 'sets', validFrom: '2024-02-27', citations: [{ kind: 'run', id: controlId }] }]);
    expect(await message(reconcile({ key: simKey, fromVersion: otherDay, againstVersion: later, note: 'another day' }))).toMatch(/target|same day|valid_from/i);
    // the honest one
    const r = await reconcile({ key: simKey, fromVersion: simVersion, againstVersion: later, note: 'the plant count on 26 February came in' });
    expect(Number(r.reconciliation.difference.numeric)).toBeCloseTo(157.143, 2);
  }, 300_000);
});
