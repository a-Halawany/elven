/**
 * PHASE 5 · P5-M5 — corrections reach twins and runs through the OPERATOR-INITIATED
 * walk (E7), and simulated state is reconciled against later observation (E3).
 *
 * Nothing here is automatic: a Phase 1 correction case is applied, the twin shows
 * the case as `propagation pending`, a strategy owner runs the dependency walk,
 * and the impact record marks the citing twin version unverified by event and
 * surfaces the runs built on it. Through the real database and controllers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';

let h: Phase4Harness;
let twins: TwinController; let graph: GraphController; let observation: ObservationController;
let owner: AuthenticatedPrincipal; let manager: AuthenticatedPrincipal;
let ownerId = ''; let twinId = ''; let v1 = 0; let controlId = ''; let rerouteId = '';
let evdA: { id: string; version: number }; let evdB: { id: string; version: number };

const elements = (cite: { id: string; version: number }, shock: { id: string; version: number }) => [
  { key: 'inventory.on_hand:SYN-PART-MAG', kind: 'observed', value: 63400, unit: 'sets', validFrom: '2024-01-11', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'inventory.safety_stock:SYN-PART-MAG', kind: 'observed', value: 40000, unit: 'sets', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'consumption.weekly:SYN-PART-MAG', kind: 'observed', value: 9200, unit: 'sets/week', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'shipment:SYN-SHIP-4471', kind: 'observed', value: { qty: 38400, eta_port: '2024-01-29', position: 'Approaching Bab el-Mandeb', status: 'at risk', component: 'SYN-PART-MAG' }, citations: [{ kind: 'evidence', ...cite }] },
  { key: 'shipment:SYN-SHIP-4472', kind: 'observed', value: { qty: 41000, eta_port: '2024-02-08', position: 'Malacca Strait', status: 'reroutable', component: 'SYN-PART-MAG' }, citations: [{ kind: 'evidence', ...cite }] },
  { key: 'route.inland_days', kind: 'assumed', value: 14, unit: 'days', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'route.reroute_delay_days', kind: 'assumed', value: 11, unit: 'days', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'terms.reroute_cost_per_container', kind: 'assumed', value: 1850, unit: 'EUR', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'terms.units_per_container:SYN-PART-MAG', kind: 'assumed', value: 1600, unit: 'sets', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'terms.air_cost_per_kg', kind: 'assumed', value: 19.4, unit: 'EUR', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'terms.kg_per_unit:SYN-PART-MAG', kind: 'assumed', value: 4100 / 9200, unit: 'kg', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'terms.air_lead_days', kind: 'assumed', value: 7, unit: 'days', citations: [{ kind: 'evidence', ...cite }] },
  { key: 'terms.line_stop_cost_per_day:SYN-LINE-A1', kind: 'assumed', value: 142000, unit: 'EUR', citations: [{ kind: 'evidence', ...cite }] },
  // The corridor-delay assumption cites a DIFFERENT evidence object: the one the publisher will correct.
  { key: 'shock.corridor_delay_days', kind: 'assumed', value: 14, unit: 'days', citations: [{ kind: 'evidence', ...shock }] },
  { key: 'production.policy:SYN-PART-MAG', kind: 'assumed', value: 'hold_safety_stock', citations: [{ kind: 'evidence', ...cite }] },
];

async function admitTwin(els: unknown[], branch: string): Promise<number> {
  const o = await twins.openVersion(h.req(owner, 'twin.version', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, { payload: { branchId: branch, knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(owner, 'twin.ground', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(o.version.version), { payload: { elements: els } });
  await twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(o.version.version), { payload: {} });
  return o.version.version;
}
const run = (payload: Record<string, unknown>) => twins.run(h.req(owner, 'simulation.run', 'SIM', null), h.fx.tenantId, h.fx.domainId, { payload }) as Promise<{ run: { runId: string; totals: Record<string, unknown> } }>;
const getTwin = () => twins.get(h.req(owner, 'twin.read', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId) as Promise<{ twin: Record<string, unknown> }>;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { TwinController: T } = await import('../../src/twin/twin.controller.js');
  const { GraphController: G } = await import('../../src/graph/graph.controller.js');
  const { ObservationController: O } = await import('../../src/observation/observation.controller.js');
  twins = h.app.get(T); graph = h.app.get(G); observation = h.app.get(O);
  owner = await h.principalWith(['twin_owner', 'strategy_owner', 'forecast_owner', 'simulation_operator'], 'twin-owner');
  manager = await h.principalWith(['collection_manager'], 'collection-manager');
  ownerId = owner.principalId;
  await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  const evds = (await sql<{ id: string; version: number }>`select object_id::text id, object_version::int version from objects.canonical_objects
    where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at`.execute(h.su)).rows;
  evdA = evds[0] as typeof evdA; evdB = evds[2] as typeof evdB;
  const entityId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(owner, 'twin.declare', 'TWN', null), h.fx.tenantId, h.fx.domainId, { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet chain',
    boundary: [entityId], owner: ownerId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
  v1 = await admitTwin(elements(evdA, evdB), 'actual');
  const c = await run({ twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } });
  controlId = c.run.runId;
  const i = await run({ twinId, twinVersion: v1, runKind: 'intervention', controlRunId: controlId, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }], horizonDays: 90, stochastic: { mode: 'deterministic' } });
  rerouteId = i.run.runId;
}, 300_000);

afterAll(async () => { await h?.close(); });

describe('P5-M5 · E7 — the operator-initiated walk reaches twin versions and runs', () => {
  let caseId = '';
  it('a correction case applied to cited evidence shows on the twin as PROPAGATION PENDING before any walk', async () => {
    const opened = await observation.submitCorrection(h.req(manager, 'observation.correction.receive', 'COR', null, 'observation'), h.fx.tenantId, h.fx.domainId,
      { payload: { sourceId: h.fx.sourceId, kind: 'correction', channel: 'publisher re-publication', publisherRef: 'fixture restated 2023', reason: 'the publisher restated the window the corridor-delay assumption cites', affectedEvdIds: [evdB.id] } }) as { correction: { caseId: string } };
    caseId = opened.correction.caseId;
    const applied = await observation.applyCorrection(h.req(manager, 'observation.correction.apply', 'COR', caseId, 'observation'), h.fx.tenantId, h.fx.domainId, caseId,
      { payload: { decision: 'apply', affectedEvdIds: [evdB.id], reason: 'restatement verified against the publisher' } }) as { correction: Record<string, unknown> };
    expect(applied.correction).toBeTruthy();
    const t = await getTwin();
    const pending = t.twin['propagation_pending'] as Array<{ case_id: string; propagation: string }>;
    expect(pending.map((p) => p.case_id), 'an applied case affecting cited evidence is not shown as pending').toContain(caseId);
    expect(pending[0]?.propagation).toMatch(/pending/);
    const before = (await sql<{ verification_state: string }>`select verification_state from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v1}`.execute(h.su)).rows[0];
    expect(before?.verification_state, 'the twin was marked before any operator ran the walk').toBe('verified');
  }, 120_000);

  it('the strategy owner runs the walk: the citing version goes UNVERIFIED by event, the runs are surfaced, the impact record names both', async () => {
    const out = await graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', evdB.id), h.fx.tenantId, h.fx.domainId,
      { payload: { triggerKind: 'evidence_correction', triggerObjectId: evdB.id, correctionCaseId: caseId } }) as {
        impact: { twins: Array<{ strategy_object_id: string; object_type: string; via_id?: string }>; simulations: Array<{ strategy_object_id: string }>; statement: string; invalidationId: string } };
    expect(out.impact.twins.map((t) => t.strategy_object_id)).toContain(twinId);
    expect(out.impact.simulations.map((s) => s.strategy_object_id).sort()).toEqual([controlId, rerouteId].sort());
    expect(out.impact.statement).toMatch(/1 twin\(s\) whose citing versions are marked unverified and 2 simulation run\(s\) surfaced/);
    const v = (await sql<{ verification_state: string; state_set_digest: string }>`select verification_state, state_set_digest from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v1}`.execute(h.su)).rows[0];
    expect(v?.verification_state).toBe('unverified');
    const ev = (await sql<{ details: Record<string, unknown> }>`select details from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified'`.execute(h.su)).rows;
    expect(ev.length).toBe(1);
    expect(String(ev[0]?.details['invalidation_id'])).toBe(out.impact.invalidationId);
    const inv = (await sql<{ t: unknown[]; s: unknown[] }>`select affected_twins t, affected_simulations s from graph.invalidations_current where invalidation_id = ${out.impact.invalidationId}::uuid`.execute(h.su)).rows[0];
    expect((inv?.t as Array<{ twin_id: string }>).map((x) => x.twin_id)).toEqual([twinId]);
    expect((inv?.s as unknown[]).length).toBe(2);
    const runEv = (await sql<{ n: string }>`select count(*)::text n from simulation.run_events where event = 'run.unverified' and run_id in (${controlId}::uuid, ${rerouteId}::uuid)`.execute(h.su)).rows[0]?.n;
    expect(Number(runEv)).toBe(2);
    // The runs themselves are untouched: immutable, digests intact.
    const runs = (await sql<{ state: string; outputs_digest: string }>`select state, outputs_digest from simulation.runs_current where run_id in (${controlId}::uuid, ${rerouteId}::uuid)`.execute(h.su)).rows;
    expect(runs.every((r) => r.state === 'completed' && /^[0-9a-f]{64}$/.test(r.outputs_digest))).toBe(true);
    // A new run on the unverified version says so in its validation status.
    const later = await run({ twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: false, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 30, stochastic: { mode: 'deterministic' } });
    const status = (await sql<{ s: string }>`select validation_status s from simulation.runs_current where run_id = ${later.run.runId}::uuid`.execute(h.su)).rows[0];
    expect(status?.s).toMatch(/UNVERIFIED/);
    // The twin no longer shows the case as pending once its walk is recorded.
    const t = await getTwin();
    const pending = t.twin['propagation_pending'] as Array<{ case_id: string }>;
    expect(pending.map((p) => p.case_id)).not.toContain(caseId);
  }, 180_000);

  it('a version that does NOT cite the corrected object is left verified', async () => {
    const v2 = await admitTwin(elements(evdA, evdA), 'alt-uncited');
    const out = await graph.propagate(h.req(owner, 'graph.impact.propagate', 'INV', evdB.id), h.fx.tenantId, h.fx.domainId,
      { payload: { triggerKind: 'evidence_correction', triggerObjectId: evdB.id } }) as { impact: { twins: unknown[] } };
    expect(out.impact.twins.length).toBe(1);
    const v = (await sql<{ verification_state: string }>`select verification_state from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v2}`.execute(h.su)).rows[0];
    expect(v?.verification_state).toBe('verified');
  }, 120_000);
});

describe('P5-M5 · E3 — reconciliation records the difference and changes nothing', () => {
  it('a simulated element citing a run is reconciled against a later observation of the same key', async () => {
    const simVersion = await admitTwin([...elements(evdA, evdA), { key: 'inventory.on_hand-2024-02-26:SYN-PART-MAG', kind: 'simulated', value: 2942.857, unit: 'sets', citations: [{ kind: 'run', id: controlId }] }], 'sim-branch');
    const el = (await sql<{ kind: string; synthetic_state: boolean }>`select kind, synthetic_state from twin.state_elements where twin_id = ${twinId}::uuid and version = ${simVersion} and key = 'inventory.on_hand-2024-02-26:SYN-PART-MAG'`.execute(h.su)).rows[0];
    expect(el?.kind).toBe('simulated');
    expect(el?.synthetic_state).toBe(true);
    const obsVersion = await admitTwin([...elements(evdA, evdA), { key: 'inventory.on_hand-2024-02-26:SYN-PART-MAG', kind: 'observed', value: 3100, unit: 'sets', validFrom: '2024-02-26', citations: [{ kind: 'evidence', ...evdA }] }], 'obs-branch');
    const r = await twins.reconcile(h.req(owner, 'twin.ground', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId,
      { payload: { key: 'inventory.on_hand-2024-02-26:SYN-PART-MAG', fromVersion: simVersion, againstVersion: obsVersion, note: 'the plant count on 26 February came in' } }) as { reconciliation: { difference: { numeric: string } } };
    expect(Number(r.reconciliation.difference.numeric)).toBeCloseTo(157.143, 2);
    const row = (await sql<{ from_kind: string; from_value: unknown; against_value: unknown }>`select from_kind, from_value, against_value from twin.reconciliations where twin_id = ${twinId}::uuid`.execute(h.su)).rows[0];
    expect(row?.from_kind).toBe('simulated');
    expect(Number(row?.from_value)).toBeCloseTo(2942.857, 3);
    expect(Number(row?.against_value)).toBe(3100);
    // neither element changed
    const after = (await sql<{ v: unknown }>`select value v from twin.state_elements where twin_id = ${twinId}::uuid and version = ${simVersion} and key = 'inventory.on_hand-2024-02-26:SYN-PART-MAG'`.execute(h.su)).rows[0];
    expect(Number(after?.v)).toBeCloseTo(2942.857, 3);
    // an observed element cannot be "reconciled" as if it were simulated
    await expect(twins.reconcile(h.req(owner, 'twin.ground', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId,
      { payload: { key: 'inventory.on_hand:SYN-PART-MAG', fromVersion: obsVersion, againstVersion: obsVersion, note: 'wrong way round' } })).rejects.toThrow(/not simulated or predicted/);
  }, 180_000);
});
