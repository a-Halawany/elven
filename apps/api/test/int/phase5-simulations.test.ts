/**
 * PHASE 5 · P5-M3 — simulation runs, through the real database and controller.
 *
 * E4 (reproducibility from the stored contract, including a COLD process and the
 * unreproducible verdict), E5 (the experiment contract is complete or refused;
 * control case shape and compatibility; immutability), the comparison half of E6,
 * the database half of E2 for SIM (synthetic), and the SIM admission boundaries.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import { TwinCapability } from '../../src/twin/twin.capabilities.js';
import { SimulationCapability } from '../../src/twin/simulation.capabilities.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../../src/twin/models/supply-flow.digest.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import { RECORD_FILES, completeElements } from './phase5-fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let h: Phase4Harness;
let twins: TwinController;
let owner: AuthenticatedPrincipal;
let operator: AuthenticatedPrincipal;
let ownerId = '';
let twinId = '';
let v1 = 0;
let evd: { id: string; version: number };
let entityId = '';
let controlId = '';
let rerouteId = '';

let records: { inv: { id: string; version: number }; ship: { id: string; version: number }; terms: { id: string; version: number } };
const ELEMENTS = (_cite?: unknown) => completeElements(records);

const status = async (p: Promise<unknown>): Promise<number | string> => { try { await p; return 'ok'; } catch (e) { return e instanceof HttpException ? e.getStatus() : (e instanceof Error ? e.message : String(e)); } };
const message = async (p: Promise<unknown>): Promise<string> => { try { await p; return ''; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? '') : (e instanceof Error ? e.message : String(e)); } };
const run = (payload: Record<string, unknown>, as = operator) => twins.run(h.req(as, 'simulation.run', 'SIM', null), h.fx.tenantId, h.fx.domainId, { payload }) as Promise<{ run: { runId: string; outputsDigest: string; totals: Record<string, unknown>; sensitivity: Record<string, unknown>; state: string } }>;
const base = (over: Record<string, unknown> = {}) => ({ twinId, twinVersion: v1, runKind: 'control', controlRunId: null, shock: true, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' }, ...over });
const runRow = async (id: string) => (await sql<Record<string, unknown>>`select * from simulation.runs_current where run_id = ${id}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;

async function admitTwin(elements: unknown[], branch: string): Promise<number> {
  const o = await twins.openVersion(h.req(owner, 'twin.version', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, { payload: { branchId: branch, knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
  await twins.ground(h.req(owner, 'twin.ground', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(o.version.version), { payload: { elements } });
  await twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(o.version.version), { payload: {} });
  return o.version.version;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { TwinController: T } = await import('../../src/twin/twin.controller.js');
  twins = h.app.get(T);
  owner = await h.principalWith(['twin_owner', 'forecast_owner'], 'twin-owner');
  operator = await h.principalWith(['simulation_operator'], 'sim-operator');
  ownerId = owner.principalId;
  await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  const e = (await sql<{ id: string; version: number }>`select object_id::text id, object_version::int version from objects.canonical_objects
    where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at limit 1`.execute(h.su)).rows[0] as { id: string; version: number };
  evd = e;
  const up = await h.upload(RECORD_FILES());
  records = { inv: up[0] as { id: string; version: number }, ship: up[1] as { id: string; version: number }, terms: up[2] as { id: string; version: number } };
  entityId = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entityId}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, 'place', 'Bab el-Mandeb Strait', 'bab el-mandeb strait', 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  const d = await twins.declare(h.req(owner, 'twin.declare', 'TWN', null), h.fx.tenantId, h.fx.domainId, { payload: { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet chain',
    boundary: [entityId], owner: ownerId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } } }) as { twin: { twinId: string } };
  twinId = d.twin.twinId;
  v1 = await admitTwin(ELEMENTS(evd), 'actual');
}, 300_000);

afterAll(async () => { await h?.close(); });

describe('P5-M3 · E5 — the contract is complete or the run is refused; the control case', () => {
  it('refuses a control that references a control, an intervention without one, an unseeded stochastic run, and an empty intervention list', async () => {
    expect(await status(run(base({ controlRunId: uuidv7() })))).toBe(422);
    expect(await status(run(base({ runKind: 'intervention', controlRunId: null, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] })))).toBe(422);
    expect(await status(run(base({ stochastic: { mode: 'random' } })))).toBe(422);
    expect(await status(run(base({ interventions: [] })))).toBe(422);
    expect(await status(run(base({ horizonDays: 400 })))).toBe(422);
    expect((await sql<{ n: string }>`select count(*)::text n from simulation.runs_current where twin_id = ${twinId}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
  });

  it('a CONTROL run completes: outputs bound, digests recorded, the SIM object SYNTHETIC, the §6b anchor reproduced', async () => {
    const r = await run(base());
    controlId = r.run.runId;
    expect(r.run.state).toBe('completed');
    expect(r.run.totals['line_stop_days']).toBe(29);
    expect((r.run.totals['cost'] as Record<string, string>)['total']).toBe('4118000.00');
    const row = await runRow(controlId);
    expect(row['run_kind']).toBe('control');
    expect(row['control_run_id']).toBeNull();
    expect(row['state']).toBe('completed');
    expect(String(row['outputs_digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect(String(row['initial_state_digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect(row['implementation_digest']).toBe(SUPPLY_FLOW_IMPLEMENTATION_DIGEST);
    expect((row['initial_state'] as unknown[]).length).toBe(16);
    expect(String(row['known_at'])).toBeTruthy();
    const obj = (await sql<{ truth_state: string; synthetic_state: boolean; schema_ref: string }>`select truth_state, synthetic_state, schema_ref from objects.canonical_objects where object_id = ${controlId}::uuid`.execute(h.su)).rows[0];
    expect(obj?.truth_state).toBe('synthetic');
    expect(obj?.synthetic_state).toBe(true);
    expect(obj?.schema_ref).toBe('SIM@v2');
    const deps = (await sql<{ k: string }>`select depends_on_kind k from graph.dependencies where dependent_object_id = ${controlId}::uuid and dependent_type = 'SIM'`.execute(h.su)).rows.map((d) => d.k);
    expect(deps).toEqual(['twin']);
    const sens = row['sensitivity'] as { factors: Array<{ key: string }>; outside_envelope: boolean };
    expect(sens.factors.map((f) => f.key)).toContain('shock.corridor_delay_days');
    expect(sens.outside_envelope).toBe(false);
  }, 120_000);

  it('an INTERVENTION run references the completed control; incompatible controls and comparisons are refused', async () => {
    const r = await run(base({ runKind: 'intervention', controlRunId: controlId, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] }));
    rerouteId = r.run.runId;
    expect((r.run.totals['cost'] as Record<string, string>)['reroute']).toBe('48100.00');
    const deps = (await sql<{ k: string }>`select depends_on_kind k from graph.dependencies where dependent_object_id = ${rerouteId}::uuid order by 1`.execute(h.su)).rows.map((d) => d.k);
    expect(deps).toEqual(['run', 'twin']);
    // an intervention referencing another intervention as its control
    expect(await message(run(base({ runKind: 'intervention', controlRunId: rerouteId, interventions: [{ type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-01-11', to: '2024-04-09' }] })))).toMatch(/not a control run/);
    // a control on the same twin but without the shock is a different initial contract: not compatible
    const noShock = await run(base({ shock: false }));
    expect(await message(run(base({ runKind: 'intervention', controlRunId: noShock.run.runId, shock: false, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] })))).toBe('');
    expect(await message(run(base({ runKind: 'intervention', controlRunId: noShock.run.runId, shock: true, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] })))).toMatch(/not compatible/);
    // a run on another twin version cannot use this control
    const v2 = await admitTwin(ELEMENTS(evd).map((e) => (e.key === 'shock.corridor_delay_days' ? { ...e, value: 30 } : e)), 'alt-long-delay');
    expect(await message(run(base({ twinVersion: v2, runKind: 'intervention', controlRunId: controlId, interventions: [{ type: 'reroute', shipment: 'SYN-SHIP-4472' }] })))).toMatch(/not compatible/);
    const c2 = await run(base({ twinVersion: v2 }));
    expect(c2.run.totals['line_stop_days']).toBe(45);
    const cmpBad = twins.compareRuns(h.req(operator, 'simulation.read', 'SIM', null), h.fx.tenantId, h.fx.domainId, { payload: { runIds: [controlId, c2.run.runId] } });
    expect(await status(cmpBad)).toBe(422);
    const air = await run(base({ runKind: 'intervention', controlRunId: controlId, interventions: [{ type: 'air_bridge', component: 'SYN-PART-MAG', weeks: 1, decision_date: '2024-01-17' }] }));
    const draw = await run(base({ runKind: 'intervention', controlRunId: controlId, interventions: [{ type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-01-11', to: '2024-04-09' }] }));
    const cmp = await twins.compareRuns(h.req(operator, 'simulation.read', 'SIM', null), h.fx.tenantId, h.fx.domainId, { payload: { runIds: [controlId, rerouteId, air.run.runId, draw.run.runId] } }) as { comparison: { runs: Array<{ totals: { line_stop_days: number; cost: { total: string } } }>; synthetic: boolean } };
    expect(cmp.comparison.synthetic).toBe(true);
    expect(cmp.comparison.runs.map((x) => x.totals.line_stop_days)).toEqual([29, 29, 22, 0]);
    expect(cmp.comparison.runs[2]?.totals.cost.total).toBe('3203540.00');
  }, 180_000);

  it('a completed run is immutable; a run on an incomplete twin version is refused; a failed completion is visible', async () => {
    await expect(sql`update simulation.runs_current set outputs = '{}'::jsonb where run_id = ${controlId}::uuid`.execute(h.su)).rejects.toThrow(/immutable/);
    await expect(sql`delete from simulation.runs_current where run_id = ${controlId}::uuid`.execute(h.su)).rejects.toThrow(/append-only/);
    const o = await twins.openVersion(h.req(owner, 'twin.version', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, { payload: { branchId: 'incomplete', knownAt: new Date().toISOString(), observedThrough: '2024-01-17' } }) as { version: { version: number } };
    await twins.ground(h.req(owner, 'twin.ground', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(o.version.version), { payload: { elements: ELEMENTS(evd).slice(0, 4) } });
    await twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(o.version.version), { payload: { allowIncomplete: true } });
    expect(await message(run(base({ twinVersion: o.version.version })))).toMatch(/incomplete/);
    expect(await status(run(base(), owner))).toBe('ok');
  }, 120_000);
});

describe('P5-M3 · E4 — reproducibility from the stored contract', () => {
  it('the same process reproduces the digest; a reproduction row records it; a seeded run reproduces too', async () => {
    const r = await twins.reproduce(h.req(operator, 'simulation.reproduce', 'SIM', controlId), h.fx.tenantId, h.fx.domainId, controlId, { payload: {} }) as { reproduction: { verdict: string; expected: string; actual: string; environmentMatches: boolean } };
    expect(r.reproduction.verdict).toBe('reproduced');
    expect(r.reproduction.actual).toBe(r.reproduction.expected);
    expect(r.reproduction.environmentMatches).toBe(true);
    const rows = (await sql<{ verdict: string; cold_process: boolean }>`select verdict, cold_process from simulation.reproductions where run_id = ${controlId}::uuid`.execute(h.su)).rows;
    expect(rows.map((x) => x.verdict)).toEqual(['reproduced']);
    expect(rows.map((x) => x.cold_process), 'the product executes every reproduction in a separate process').toEqual([true]);
    const seeded = await run(base({ stochastic: { mode: 'seeded', seed: 42, samples: 50, jitter: { '-2': 0.1, '0': 0.6, '2': 0.2, '5': 0.1 } } }));
    const row = await runRow(seeded.run.runId);
    expect(row['rng']).toBe('xoshiro128**@1');
    expect(Number(row['seed'])).toBe(42);
    expect(Number(row['samples'])).toBe(50);
    const rs = await twins.reproduce(h.req(operator, 'simulation.reproduce', 'SIM', seeded.run.runId), h.fx.tenantId, h.fx.domainId, seeded.run.runId, { payload: {} }) as { reproduction: { verdict: string } };
    expect(rs.reproduction.verdict).toBe('reproduced');
  }, 120_000);

  it('a COLD process re-executes the stored contract with the pinned implementation and reaches the same digest', async () => {
    const row = await runRow(controlId);
    const script = `
      import { contractOf } from ${JSON.stringify(join(HERE, '..', '..', 'dist', 'twin', 'simulations', 'simulation.service.js'))};
      import { simulateSupplyFlow } from ${JSON.stringify(join(HERE, '..', '..', 'dist', 'twin', 'models', 'supply-flow.js'))};
      import { jcsCanonicalize } from '@eye/contracts';
      import { createHash } from 'node:crypto';
      const stored = JSON.parse(await new Promise((res) => { let d = ''; process.stdin.on('data', (c) => { d += c; }); process.stdin.on('end', () => res(d)); }));
      const c = contractOf(stored);
      const out = simulateSupplyFlow(c.params, c.options, c.interventions);
      process.stdout.write(createHash('sha256').update(jcsCanonicalize(out)).digest('hex'));
    `;
    const stored = { ...row, known_at: String(row['known_at']), observed_through: row['observed_through'] === null ? null : String(row['observed_through']) };
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { input: JSON.stringify(stored), encoding: 'utf8', cwd: join(HERE, '..', '..'), timeout: 60_000 });
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout.trim()).toBe(String(row['outputs_digest']));
    // The product's own reproduction: a separate process it spawns, whatever the request says.
    const r = await twins.reproduce(h.req(operator, 'simulation.reproduce', 'SIM', controlId), h.fx.tenantId, h.fx.domainId, controlId, { payload: { cold: false } }) as { reproduction: { verdict: string; reason: string } };
    expect(r.reproduction.verdict).toBe('reproduced');
    expect(r.reproduction.reason).toMatch(/separate process \(pid \d+/);
    const cold = (await sql<{ n: string }>`select count(*)::text n from simulation.reproductions where run_id = ${controlId}::uuid and cold_process`.execute(h.su)).rows[0]?.n;
    expect(Number(cold)).toBe(2);
  }, 120_000);

  it('when the pinned implementation is no longer the one the run recorded, the verdict is UNREPRODUCIBLE, never a substituted result', async () => {
    await sql`update twin.behaviour_models set implementation_digest = ${'d'.repeat(64)} where method_ref = 'supply-flow@1'`.execute(h.su);
    try {
      const r = await twins.reproduce(h.req(operator, 'simulation.reproduce', 'SIM', controlId), h.fx.tenantId, h.fx.domainId, controlId, { payload: {} }) as { reproduction: { verdict: string; actual: string | null; reason: string } };
      expect(r.reproduction.verdict).toBe('unreproducible');
      expect(r.reproduction.actual).toBeNull();
      expect(r.reproduction.reason).toMatch(/no longer the one the run recorded/);
      // and no NEW run can be opened against a model whose pinned implementation is not this process's
      expect(await message(run(base()))).toMatch(/not the pinned implementation/);
    } finally {
      await sql`update twin.behaviour_models set implementation_digest = ${SUPPLY_FLOW_IMPLEMENTATION_DIGEST} where method_ref = 'supply-flow@1'`.execute(h.su);
    }
    const rows = (await sql<{ verdict: string }>`select verdict from simulation.reproductions where run_id = ${controlId}::uuid order by reproduced_at`.execute(h.su)).rows.map((x) => x.verdict);
    expect(rows).toEqual(['reproduced', 'reproduced', 'unreproducible']);
    // reproducing an opened or failed run is refused
    expect(await status(twins.reproduce(h.req(operator, 'simulation.reproduce', 'SIM', uuidv7()), h.fx.tenantId, h.fx.domainId, uuidv7(), { payload: {} }))).toBe(404);
  }, 120_000);
});

describe('P5-M3 · a run read back names its days', () => {
  it('get and list return observed_through as the day the contract named — never a local-midnight instant printed in UTC', async () => {
    const got = (await twins.getRun(h.req(operator, 'simulation.read', 'SIM', controlId, 'simulation'), h.fx.tenantId, h.fx.domainId, controlId)) as { run: Record<string, unknown> };
    expect(got.run['observed_through']).toBe('2024-01-17');
    const listed = (await twins.listRuns(h.req(operator, 'simulation.read', 'SIM', null, 'simulation'), h.fx.tenantId, h.fx.domainId, { payload: {} })) as { runs: Array<Record<string, unknown>> };
    expect(listed.runs.find((r) => r['run_id'] === controlId)?.['observed_through']).toBe('2024-01-17');
  });
});

describe('P5-M3 · SIM admission boundaries and projections', () => {
  it('simulation.run.complete cannot admit a TWN; twin.version.admit cannot admit a SIM; an operator cannot ground', async () => {
    const { canonicalHeaderDigest } = await import('@eye/contracts');
    const header = (objectType: string, id: string) => ({
      object_id: id, object_type: objectType, tenant_id: h.fx.tenantId, domain_id: h.fx.domainId, scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active',
      owning_component: 'CP-X', accountable_owner: `principal:${ownerId}`, source_object_ids: [], event_time: null, observation_time: null, valid_from: null, valid_to: null,
      recorded_at: new Date().toISOString(), time_precision: 'exact', source_clock_quality: 'trusted', truth_state: objectType === 'SIM' ? 'synthetic' : 'asserted',
      synthetic_state: objectType === 'SIM', confidence: null, uncertainty: null, evidence_refs: ['EVD:x@1'], provenance_ref: 'principal:x', method_ref: 'x@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${ownerId}`], classification: 'internal', purpose_scope: 'simulation', rights_profile: null,
      residency_profile: null, retention_profile: null, access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${objectType}@v1`,
      ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null });
    const a = uuidv7(); const b = uuidv7();
    await expect(h.pipeline.write(h.env(operator, 'simulation.run.complete', 'SIM', a), operator,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'simulation.run.complete', objectType: 'SIM', objectId: a }, SimulationCapability.complete,
      async (cap) => { const hd = header('TWN', a); await cap.admitObject(hd, {}, canonicalHeaderDigest(hd as never, {})); return { result: {}, targetType: 'SIM', targetId: a, targetVersion: '1', outboxEvent: null }; }))
      .rejects.toThrow(/admission rejected|not permitted|object type/i);
    await expect(h.pipeline.write(h.env(owner, 'twin.version.admit', 'TWN', b), owner,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'twin.version.admit', objectType: 'TWN', objectId: b }, TwinCapability.admit,
      async (cap) => { const hd = header('SIM', b); await cap.admitObject(hd, {}, canonicalHeaderDigest(hd as never, {})); return { result: {}, targetType: 'TWN', targetId: b, targetVersion: '1', outboxEvent: null }; }))
      .rejects.toThrow(/admission rejected|not permitted|object type/i);
    expect((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_id in (${a}::uuid, ${b}::uuid)`.execute(h.su)).rows[0]?.n).toBe('0');
    const rebuilt = await h.pipeline.consequentialRead(h.env(operator, 'simulation.read', 'SIM', null), operator,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'simulation.read', objectType: 'SIM', objectId: null },
      SimulationCapability.read, async (cap) => cap.rebuildProjections());
    expect(rebuilt.result.every((p) => p.mismatched === '0'), JSON.stringify(rebuilt.result)).toBe(true);
  });
});
