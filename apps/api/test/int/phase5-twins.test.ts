/**
 * PHASE 5 · P5-M1 — the twin registry, through the real database and controller.
 *
 * E1 (grounding under two cut-offs, materiality from the schema, refusal of
 * unsubstantiated material elements), the database half of E2 (kinds constrained,
 * derived truth states retained, synthetic state folded upward), the
 * draft/admission, immutability and branch-lineage half of E3, and every TWN
 * admission boundary (§3 of the plan). Nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import { PredictionCapability } from '../../src/prediction/prediction.capabilities.js';
import { TwinCapability } from '../../src/twin/twin.capabilities.js';
import type { TwinController } from '../../src/twin/twin.controller.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';

let h: Phase4Harness;
let twins: TwinController;
let prediction: PredictionController;
let owner: AuthenticatedPrincipal;
let operator: AuthenticatedPrincipal;
let ownerId = '';
let sourceKey = '';
let seriesKey = '';
let knownAfterBackfill = '';
let corridorEntity = '';
let plantEntity = '';
let realEvd: { id: string; version: number; digest: string };
let syntheticEvd: { id: string; version: number; digest: string };
let extractedClaim = '';
let twinId = '';

const entity = async (type: string, name: string): Promise<string> => {
  const id = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${type}, ${name}, ${name.toLowerCase()}, 'active', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
};

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { TwinController: T } = await import('../../src/twin/twin.controller.js');
  const { PredictionController: P } = await import('../../src/prediction/prediction.controller.js');
  twins = h.app.get(T); prediction = h.app.get(P);
  owner = await h.principalWith(['twin_owner', 'forecast_owner', 'strategy_owner'], 'twin-owner');
  operator = await h.principalWith(['simulation_operator'], 'sim-operator');
  ownerId = owner.principalId;
  // The corridor series: three real (non-synthetic) windows, then one SYNTHETIC restated window under a synthetic contract version.
  const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  sourceKey = v.sourceKey;
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  const evds = (await sql<{ id: string; version: number; digest: string; synthetic: boolean }>`select object_id::text id, object_version::int version, content_digest digest, synthetic_state synthetic
    from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by recorded_at`.execute(h.su)).rows;
  realEvd = evds[0] as typeof realEvd;
  const v2 = await h.newVersion({ from: '2023-12-01', to: SERIES_END, windowDays: 40, controls: { data_origin: 'synthetic', classification_ceiling: 'confidential', residency: 'EU-only' } });
  const r2 = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }), v2.version);
  expect(r2.state, r2.reason).toBe('finished');
  const syn = (await sql<{ id: string; version: number; digest: string }>`select object_id::text id, object_version::int version, content_digest digest
    from objects.canonical_objects where object_type = 'EVD' and provenance_ref = ${`SRC:${h.fx.sourceId}@${v2.version}`} order by recorded_at desc limit 1`.execute(h.su)).rows;
  syntheticEvd = syn[0] as typeof syntheticEvd;
  knownAfterBackfill = new Date().toISOString();
  seriesKey = `fixture:${sourceKey}:value`;
  await prediction.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), h.fx.tenantId, h.fx.domainId,
    { payload: { seriesKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                 seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode' } });
  corridorEntity = await entity('place', 'Bab el-Mandeb Strait');
  plantEntity = await entity('asset', 'Regensburg plant');
  // A derived claim in this domain (scaffolding: the minimal canonical row the adversarial suite uses).
  extractedClaim = uuidv7();
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component,
      accountable_owner, truth_state, classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest, evidence_refs)
    values (${extractedClaim}::uuid, 'CLM', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, 'DOMAIN', 1, 'admitted', 'CP-INT-01', 'principal:fixture',
      'extracted', 'internal', 'intelligence', 'CLM@v2', ${uuidv7()}::uuid, '{"subject":"SYN-PART-MAG","predicate":"weekly_consumption","object_value":"9200"}'::jsonb,
      ${'b'.repeat(64)}, '["EVD:fixture"]'::jsonb)`.execute(h.su);
}, 300_000);

afterAll(async () => { await h?.close(); });

const declare = (payload: Record<string, unknown>) => twins.declare(h.req(owner, 'twin.declare', 'TWN', null), h.fx.tenantId, h.fx.domainId, { payload }) as Promise<{ twin: { twinId: string } }>;
const open = (payload: Record<string, unknown>, as = owner) => twins.openVersion(h.req(as, 'twin.version', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, { payload }) as Promise<{ version: { version: number } }>;
const ground = (version: number, elements: unknown[], as = owner) => twins.ground(h.req(as, 'twin.ground', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(version), { payload: { elements } }) as Promise<{ grounded: Array<{ key: string; material: boolean; health: string; syntheticState: boolean }> }>;
const groundSeries = (version: number, key: string) => twins.groundSeries(h.req(owner, 'twin.ground', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(version), { payload: { seriesKey, key } }) as Promise<{ grounded: { material: boolean; health: string; points: number; knownAt: string; observedThrough: string | null; syntheticState: boolean } }>;
const admit = (version: number, allowIncomplete = false) => twins.admit(h.req(owner, 'twin.version.admit', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(version), { payload: { allowIncomplete } }) as Promise<{ admitted: { stateSetDigest: string; completeness: string; missingKeys: string[]; syntheticState: boolean } }>;
const evd = (e: { id: string; version: number }) => ({ kind: 'evidence', id: e.id, version: e.version });
const status = async (p: Promise<unknown>): Promise<number | string> => { try { await p; return 'ok'; } catch (e) { return e instanceof HttpException ? e.getStatus() : (e instanceof Error ? e.message : String(e)); } };

const REQUIRED: Array<[string, unknown, string | null]> = [
  ['inventory.on_hand:SYN-PART-MAG', 63400, 'sets'], ['inventory.safety_stock:SYN-PART-MAG', 40000, 'sets'], ['consumption.weekly:SYN-PART-MAG', 9200, 'sets/week'],
  ['shipment:SYN-SHIP-4471', { qty: 38400, eta_port: '2024-01-29', position: 'Approaching Bab el-Mandeb', status: 'at risk' }, null],
  ['route.inland_days', 14, 'days'], ['route.reroute_delay_days', 11, 'days'], ['terms.reroute_cost_per_container', 1850, 'EUR'],
  ['terms.units_per_container:SYN-PART-MAG', 1600, 'sets'], ['terms.air_cost_per_kg', 19.4, 'EUR'], ['terms.kg_per_unit:SYN-PART-MAG', 0.445652, 'kg'],
  ['terms.air_lead_days', 7, 'days'], ['terms.line_stop_cost_per_day:SYN-LINE-A1', 142000, 'EUR'], ['shock.corridor_delay_days', 14, 'days'],
  ['production.policy:SYN-PART-MAG', 'hold_safety_stock', null],
];
const assumed = (rows: typeof REQUIRED, cite: { id: string; version: number }) =>
  rows.map(([key, value, unit]) => ({ key, kind: key.startsWith('inventory') || key.startsWith('consumption') || key.startsWith('shipment') ? 'observed' : 'assumed', value, unit, citations: [evd(cite)] }));

/* ═════════ declare ═════════ */

describe('P5-M1 · declaration', () => {
  it('a twin without a boundary entity is refused; a boundary entry that is not a resolved entity is refused', async () => {
    const base = { kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet supply chain through Bab el-Mandeb',
      owner: ownerId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['no working-day calendar'] } };
    expect(await status(declare({ ...base, boundary: [] }))).toBe(422);
    await expect(declare({ ...base, boundary: [uuidv7()] })).rejects.toThrow(/not a resolved entity/);
    expect(await status(declare({ ...base, boundary: [corridorEntity], behaviourModelRef: 'no-such-model@1' }))).toBe(422);
  });

  it('declares the twin, asserted by a person, with its boundary, model and limitations', async () => {
    const r = await declare({ kind: 'supply-chain', title: 'NORDWERK — Ningbo → Regensburg chain', statement: 'the magnet supply chain through Bab el-Mandeb',
      boundary: [corridorEntity, plantEntity], owner: ownerId, behaviourModelRef: 'supply-flow@1',
      intendedDecisions: ['book SYN-SHIP-4475 via the Cape or not'], validation: { status: 'unvalidated (synthetic grounding)', limitations: ['no working-day calendar', 'liquidated damages not modelled'] } });
    twinId = r.twin.twinId;
    const row = (await sql<{ kind: string; synthetic_state: boolean }>`select kind, synthetic_state from twin.twins_current where twin_id = ${twinId}::uuid`.execute(h.su)).rows[0];
    expect(row?.kind).toBe('supply-chain');
    expect(row?.synthetic_state).toBe(false);
    // A simulation operator cannot open a version.
    expect(await status(open({ branchId: 'actual', knownAt: knownAfterBackfill, observedThrough: '2023-11-20' }, operator))).toBe(403);
  });
});

/* ═════════ E1 · two cut-offs, materiality, substantiation ═════════ */

describe('P5-M1 · E1 — grounding under two cut-offs; materiality from the schema; substantiation', () => {
  it('RECORD time: a known_at before the evidence was recorded yields no observations, whatever observed_through says', async () => {
    const v = await open({ branchId: 'probe-record-time', knownAt: '2020-01-01T00:00:00Z', observedThrough: '2023-11-20' });
    const g = await groundSeries(v.version.version, 'series.transits');
    expect(g.grounded.points, 'replay evidence recorded in 2026 was read as known in 2020').toBe(0);
    expect(g.grounded.health).toBe('incomplete');
    expect(g.grounded.knownAt).toBe('2020-01-01T00:00:00.000Z');
    expect(g.grounded.observedThrough).toBe('2023-11-20');
  });

  it('WORLD time: after the record time, observed_through cuts the observations and a later version is invisible', async () => {
    const v = await open({ branchId: 'actual', knownAt: knownAfterBackfill, observedThrough: '2023-11-20' });
    expect(v.version.version).toBeGreaterThanOrEqual(2);
    const g = await groundSeries(v.version.version, 'series.transits');
    expect(g.grounded.points).toBeGreaterThan(1000);
    expect(g.grounded.health).toBe('complete');
    expect(g.grounded.observedThrough).toBe('2023-11-20');
    // The synthetic restated window (December 2023) was recorded before knownAt, but its observations lie after observed_through: not contributing.
    const el = (await sql<{ value: Record<string, unknown>; citations: unknown[]; synthetic_state: boolean; material: boolean }>`select value, citations, synthetic_state, material from twin.state_elements
      where twin_id = ${twinId}::uuid and version = ${v.version.version} and key = 'series.transits'`.execute(h.su)).rows[0];
    expect(String((el?.value['latest'] as Record<string, unknown>)['date'])).toBe('2023-11-20');
    expect(el?.synthetic_state, 'the synthetic restatement lies after observed_through and must not fold in').toBe(false);
    expect(el?.material, 'series.transits is context, not a material key of a supply-chain twin').toBe(false);
    expect((el?.citations as unknown[]).length).toBe(3);
    // A version recorded AFTER known_at: restate the December window again under the synthetic version and read the draft again.
    const before = (await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`}`.execute(h.su)).rows[0]?.n;
    const v3 = await h.newVersion({ from: '2023-12-01', to: SERIES_END, windowDays: 40, controls: { data_origin: 'synthetic', classification_ceiling: 'confidential', residency: 'EU-only' } });
    const r3 = await h.runOnce(new RestConnector({ egress: syntheticEgress(() => (_d, x) => Number((x + 1).toFixed(3))).egress }), v3.version);
    expect(r3.state, r3.reason).toBe('finished');
    const after = (await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${h.fx.sourceId}@%`}`.execute(h.su)).rows[0]?.n;
    expect(Number(after)).toBeGreaterThan(Number(before));
    const v2 = await open({ branchId: 'probe-later-version', knownAt: knownAfterBackfill, observedThrough: '2023-12-20' });
    const g2 = await groundSeries(v2.version.version, 'series.transits');
    const el2 = (await sql<{ citations: Array<{ version: number }> }>`select citations from twin.state_elements
      where twin_id = ${twinId}::uuid and version = ${v2.version.version} and key = 'series.transits'`.execute(h.su)).rows[0];
    expect(g2.grounded.points).toBeGreaterThan(0);
    expect(el2?.citations.every((c) => c.version === 1), 'a revision recorded after known_at reached the twin').toBe(true);
  }, 120_000);

  it('a MATERIAL key substantiated only by an entity is refused, even if the caller says material: false', async () => {
    const v = (await sql<{ version: number }>`select version from twin.twin_versions where twin_id = ${twinId}::uuid and branch_id = 'actual' and state = 'draft'`.execute(h.su)).rows[0]?.version as number;
    await expect(ground(v, [{ key: 'inventory.on_hand:SYN-PART-MAG', kind: 'assumed', value: 63400, citations: [{ kind: 'entity', id: plantEntity }] }]))
      .rejects.toThrow(/substantiated by nothing but an entity/);
    await expect(ground(v, [{ key: 'inventory.on_hand:SYN-PART-MAG', kind: 'assumed', value: 63400, material: false, citations: [{ kind: 'entity', id: plantEntity }] }]))
      .rejects.toThrow(/substantiated by nothing but an entity/);
    // An immaterial context key may be entity-only: it names a subject.
    const g = await ground(v, [{ key: 'context.plant', kind: 'assumed', value: 'Regensburg', citations: [{ kind: 'entity', id: plantEntity }, evd(realEvd)] }]);
    expect(g.grounded[0]?.material).toBe(false);
  });

  it('E2 · an EXTRACTED claim cannot ground an OBSERVED element; grounded as estimated it keeps its truth state', async () => {
    const v = (await sql<{ version: number }>`select version from twin.twin_versions where twin_id = ${twinId}::uuid and branch_id = 'actual' and state = 'draft'`.execute(h.su)).rows[0]?.version as number;
    expect(await status(ground(v, [{ key: 'consumption.weekly:SYN-PART-MAG', kind: 'observed', value: 9200, citations: [{ kind: 'claim', id: extractedClaim }] }]))).toBe(422);
    const g = await ground(v, [{ key: 'consumption.weekly:SYN-PART-MAG', kind: 'estimated', value: 9200, unit: 'sets/week', citations: [{ kind: 'claim', id: extractedClaim }] }]);
    expect(g.grounded[0]?.material).toBe(true);
    const el = (await sql<{ kind: string; basis_truth_state: string }>`select kind, basis_truth_state from twin.state_elements
      where twin_id = ${twinId}::uuid and version = ${v} and key = 'consumption.weekly:SYN-PART-MAG'`.execute(h.su)).rows[0];
    expect(el?.kind).toBe('estimated');
    expect(el?.basis_truth_state).toBe('extracted');
    // The database refuses the laundering directly too.
    await expect(sql`update twin.state_elements set kind = 'observed' where twin_id = ${twinId}::uuid and version = ${v} and key = 'consumption.weekly:SYN-PART-MAG'`.execute(h.su))
      .rejects.toThrow(/append-only/);
  });

  it('E2 · synthetic state folds UPWARD: a version citing a synthetic upload is synthetic though the twin is asserted', async () => {
    const v = (await sql<{ version: number }>`select version from twin.twin_versions where twin_id = ${twinId}::uuid and branch_id = 'actual' and state = 'draft'`.execute(h.su)).rows[0]?.version as number;
    const rest = REQUIRED.filter(([k]) => k !== 'consumption.weekly:SYN-PART-MAG');
    const g = await ground(v, assumed(rest, syntheticEvd));
    expect(g.grounded.every((x) => x.material && x.syntheticState && x.health === 'complete')).toBe(true);
    // Admission refuses while a required key is missing? All present now — admit.
    const a = await admit(v);
    expect(a.admitted.completeness).toBe('complete');
    expect(a.admitted.stateSetDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(a.admitted.syntheticState).toBe(true);
    const obj = (await sql<{ truth_state: string; synthetic_state: boolean; schema_ref: string; classification: string; residency_profile: string | null }>`
      select truth_state, synthetic_state, schema_ref, classification, residency_profile from objects.canonical_objects where object_id = ${twinId}::uuid and object_version = ${v}`.execute(h.su)).rows[0];
    expect(obj?.truth_state).toBe('asserted');
    expect(obj?.synthetic_state, 'the twin of a synthetic world was admitted as non-synthetic').toBe(true);
    expect(obj?.schema_ref).toBe('TWN@v1');
    expect(obj?.classification).toBe('confidential');
    expect(obj?.residency_profile).toContain('EU-only');
    const t = (await sql<{ synthetic_state: boolean }>`select synthetic_state from twin.twins_current where twin_id = ${twinId}::uuid`.execute(h.su)).rows[0];
    expect(t?.synthetic_state).toBe(true);
    const deps = (await sql<{ k: string; n: string }>`select depends_on_kind k, count(*)::text n from graph.dependencies
      where dependent_object_id = ${twinId}::uuid and dependent_type = 'TWN' group by 1 order by 1`.execute(h.su)).rows;
    expect(deps.map((d) => d.k)).toEqual(['claim', 'entity', 'evidence']);
  }, 120_000);

  it('a required key that is MISSING keeps a version incomplete: admission is refused unless explicit, and an explicitly incomplete version is marked', async () => {
    const v = await open({ branchId: 'probe-incomplete', knownAt: knownAfterBackfill, observedThrough: '2023-11-20' });
    await ground(v.version.version, assumed(REQUIRED.slice(0, 3), realEvd));
    expect(await status(admit(v.version.version))).toBe(409);
    const a = await admit(v.version.version, true);
    expect(a.admitted.completeness).toBe('incomplete');
    expect(a.admitted.missingKeys).toContain('shock.corridor_delay_days');
    expect(a.admitted.missingKeys.length).toBeGreaterThanOrEqual(9);
  }, 120_000);
});

/* ═════════ E3 · immutability, branches, verification by event ═════════ */

describe('P5-M1 · E3 — admitted is immutable; change is a new version; branches coexist', () => {
  let v1 = 0; let v2 = 0; let alt = 0;
  it('grounding into an admitted version is refused; the state set digest is bound and the row cannot be edited', async () => {
    v1 = (await sql<{ version: number }>`select version from twin.twin_versions where twin_id = ${twinId}::uuid and branch_id = 'actual' and state = 'admitted' order by version desc limit 1`.execute(h.su)).rows[0]?.version as number;
    expect(await status(ground(v1, [{ key: 'shock.corridor_delay_days', kind: 'assumed', value: 30, citations: [evd(realEvd)] }]))).toBe(409);
    await expect(sql`update twin.twin_versions set state_set_digest = ${'c'.repeat(64)} where twin_id = ${twinId}::uuid and version = ${v1}`.execute(h.su)).rejects.toThrow(/immutable/);
    await expect(sql`delete from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v1}`.execute(h.su)).rejects.toThrow(/append-only/);
  });

  it('a change is a NEW version that supersedes, carrying the rest forward; the digest differs', async () => {
    const o = await open({ branchId: 'actual', knownAt: knownAfterBackfill, observedThrough: '2023-11-20', carryFrom: v1, except: ['shock.corridor_delay_days'] });
    v2 = o.version.version;
    await ground(v2, [{ key: 'shock.corridor_delay_days', kind: 'assumed', value: 30, unit: 'days', citations: [evd(realEvd)] }]);
    const a = await admit(v2);
    const rows = (await sql<{ version: number; supersedes: number | null; state_set_digest: string; element_count: number }>`select version, supersedes, state_set_digest, element_count
      from twin.twin_versions where twin_id = ${twinId}::uuid and version in (${v1}, ${v2}) order by version`.execute(h.su)).rows;
    expect(rows[1]?.supersedes).toBe(v1);
    expect(rows[1]?.state_set_digest).toBe(a.admitted.stateSetDigest);
    expect(rows[1]?.state_set_digest).not.toBe(rows[0]?.state_set_digest);
    expect(rows[1]?.element_count).toBe(rows[0]?.element_count);
    const sup = (await sql<{ supersedes: string | null }>`select supersedes from objects.canonical_objects where object_id = ${twinId}::uuid and object_version = ${v2}`.execute(h.su)).rows[0];
    expect(sup?.supersedes).toBe(`TWN:${twinId}@${v1}`);
  }, 120_000);

  it('an ALTERNATIVE branch forked from v1 coexists with the actual branch; comparison lists the difference and changes neither', async () => {
    const o = await open({ branchId: 'alt-no-shock', forkedFromVersion: v1, knownAt: knownAfterBackfill, observedThrough: '2023-11-20', carryFrom: v1, except: ['shock.corridor_delay_days'] });
    alt = o.version.version;
    await ground(alt, [{ key: 'shock.corridor_delay_days', kind: 'assumed', value: 0, unit: 'days', citations: [evd(realEvd)] }]);
    await admit(alt);
    const before = (await sql<{ d: string }>`select state_set_digest d from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v2}`.execute(h.su)).rows[0]?.d;
    const c = await twins.compare(h.req(owner, 'twin.read', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, { payload: { a: v2, b: alt } }) as { comparison: Record<string, unknown> };
    const diff = c.comparison['differing'] as Array<{ key: string }>;
    expect(diff.map((d) => d.key)).toEqual(['shock.corridor_delay_days']);
    expect(c.comparison['only_in_a']).toEqual([]);
    expect((c.comparison['b'] as Record<string, unknown>)['forked_from_version']).toBe(v1);
    expect((c.comparison['b'] as Record<string, unknown>)['branch_id']).toBe('alt-no-shock');
    const after = (await sql<{ d: string }>`select state_set_digest d from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v2}`.execute(h.su)).rows[0]?.d;
    expect(after).toBe(before);
    // As-of on each branch returns its own latest admitted version.
    const a1 = await twins.asOf(h.req(owner, 'twin.read', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, { payload: { branchId: 'actual' } }) as { version: { version: number } | null };
    const a2 = await twins.asOf(h.req(owner, 'twin.read', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, { payload: { branchId: 'alt-no-shock' } }) as { version: { version: number } | null };
    expect(a1.version?.version).toBe(v2);
    expect(a2.version?.version).toBe(alt);
    // As-of before anything was admitted: nothing.
    const a0 = await twins.asOf(h.req(owner, 'twin.read', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, { payload: { branchId: 'actual', instant: '2020-01-01T00:00:00Z' } }) as { version: unknown };
    expect(a0.version).toBeNull();
  }, 120_000);

  it('verification changes by EVENT: the projection reflects it and the version row is otherwise unchanged', async () => {
    const before = (await sql<Record<string, unknown>>`select state_set_digest, header_digest, element_count, admitted_at::text from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v2}`.execute(h.su)).rows[0];
    await h.pipeline.write(h.env(owner, 'twin.version.admit', 'TWN', twinId), owner,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'twin.version.admit', objectType: 'TWN', objectId: twinId },
      TwinCapability.admit,
      async (cap) => {
        await cap.markUnverified({ twinId, tenantId: h.fx.tenantId, domainId: h.fx.domainId, version: v2, reason: 'probe: the cited evidence was corrected', invalidationId: null,
          actor: ownerId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'TWN', targetId: twinId, targetVersion: String(v2), outboxEvent: null };
      });
    const row = (await sql<Record<string, unknown>>`select verification_state, state_set_digest, header_digest, element_count, admitted_at::text from twin.twin_versions where twin_id = ${twinId}::uuid and version = ${v2}`.execute(h.su)).rows[0];
    expect(row?.['verification_state']).toBe('unverified');
    expect(row?.['state_set_digest']).toBe(before?.['state_set_digest']);
    expect(row?.['admitted_at']).toBe(before?.['admitted_at']);
    const ev = (await sql<{ n: string }>`select count(*)::text n from twin.twin_events where twin_id = ${twinId}::uuid and event = 'version.unverified'`.execute(h.su)).rows[0]?.n;
    expect(Number(ev)).toBe(1);
    const rebuilt = await h.pipeline.consequentialRead(h.env(owner, 'twin.read', 'TWN', null), owner,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'twin.read', objectType: 'TWN', objectId: null },
      TwinCapability.read, async (cap) => cap.rebuildProjections());
    expect(rebuilt.result.every((p) => p.mismatched === '0'), JSON.stringify(rebuilt.result)).toBe(true);
  });
});

/* ═════════ admission boundaries ═════════ */

describe('P5-M1 · every TWN admission boundary refuses another object type, and JSON checks fail closed', () => {
  it('a forecast-issuing write cannot admit a TWN; a twin-admitting write cannot admit a FCT', async () => {
    const header = (objectType: string, id: string) => ({
      object_id: id, object_type: objectType, tenant_id: h.fx.tenantId, domain_id: h.fx.domainId, scope: 'DOMAIN', object_version: '1',
      lifecycle_state: 'active', owning_component: 'CP-X', accountable_owner: `principal:${ownerId}`, source_object_ids: [], event_time: null,
      observation_time: null, valid_from: null, valid_to: null, recorded_at: new Date().toISOString(), time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: ['EVD:x@1'], provenance_ref: 'principal:x',
      method_ref: 'x@1.0.0', contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${ownerId}`], classification: 'internal',
      purpose_scope: 'twin', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null, quality_profile: null,
      quality_state: null, freshness_state: null, schema_ref: `${objectType}@v1`, ontology_ref: null, correction_of: null, supersedes: null,
      withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null });
    const { canonicalHeaderDigest } = await import('@eye/contracts');
    const twnId = uuidv7();
    const asForecast = h.pipeline.write(h.env(owner, 'prediction.forecast.issue', 'FCT', twnId), owner,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'prediction.forecast.issue', objectType: 'FCT', objectId: twnId },
      PredictionCapability.forecast,
      async (cap) => { const hd = header('TWN', twnId); await cap.admitObject(hd, {}, canonicalHeaderDigest(hd as never, {})); return { result: {}, targetType: 'FCT', targetId: twnId, targetVersion: '1', outboxEvent: null }; });
    await expect(asForecast).rejects.toThrow(/admission rejected|not permitted|object type/i);
    const fctId = uuidv7();
    const asTwin = h.pipeline.write(h.env(owner, 'twin.version.admit', 'TWN', fctId), owner,
      { scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId, action: 'twin.version.admit', objectType: 'TWN', objectId: fctId },
      TwinCapability.admit,
      async (cap) => { const hd = header('FCT', fctId); await cap.admitObject(hd, {}, canonicalHeaderDigest(hd as never, {})); return { result: {}, targetType: 'TWN', targetId: fctId, targetVersion: '1', outboxEvent: null }; });
    await expect(asTwin).rejects.toThrow(/admission rejected|not permitted|object type/i);
    expect((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_id in (${twnId}::uuid, ${fctId}::uuid)`.execute(h.su)).rows[0]?.n).toBe('0');
  });

  it('a simulation operator cannot declare, version, ground or admit', async () => {
    expect(await status(twins.declare(h.req(operator, 'twin.declare', 'TWN', null), h.fx.tenantId, h.fx.domainId, { payload: { kind: 'supply-chain', title: 'Operator probe', statement: 'an operator cannot declare', boundary: [corridorEntity], owner: ownerId, behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: [] } } }))).toBe(403);
    const v = (await sql<{ version: number }>`select version from twin.twin_versions where twin_id = ${twinId}::uuid and state = 'draft' order by version limit 1`.execute(h.su)).rows[0]?.version as number;
    expect(await status(ground(v, [{ key: 'context.x', kind: 'assumed', value: 1, citations: [evd(realEvd)] }], operator))).toBe(403);
    expect(await status(twins.admit(h.req(operator, 'twin.version.admit', 'TWN', twinId), h.fx.tenantId, h.fx.domainId, twinId, String(v), { payload: {} }))).toBe(403);
  });

  it('a null digest, a malformed citation, or a non-array citations field fails the CHECK closed', async () => {
    const v = (await sql<{ version: number }>`select version from twin.twin_versions where twin_id = ${twinId}::uuid and state = 'draft' order by version limit 1`.execute(h.su)).rows[0]?.version as number;
    const insert = (citations: string, key: string) => sql`insert into twin.state_elements (element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, value, material, citations, health, grounded_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${twinId}::uuid, ${v}, ${key}, 'assumed', '1'::jsonb, false, ${citations}::jsonb, 'complete', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    // Every malformed shape violates a CHECK (the typed-citations check, or a basis check that counts nothing for it).
    await expect(insert(`[{"kind":"evidence","id":"${realEvd.id}","version":1,"digest":null}]`, 'probe.null-digest')).rejects.toThrow(/violates check constraint/);
    await expect(insert(`[{"kind":"evidence","id":"${realEvd.id}","version":"1","digest":"${realEvd.digest}"}]`, 'probe.string-version')).rejects.toThrow(/violates check constraint/);
    await expect(insert(`[{"kind":"document","id":"${realEvd.id}","version":1,"digest":"${realEvd.digest}"}]`, 'probe.unknown-kind')).rejects.toThrow(/violates check constraint/);
    await expect(insert(`{"kind":"evidence"}`, 'probe.not-array')).rejects.toThrow(/violates check constraint/);
    await expect(insert(`null`, 'probe.null')).rejects.toThrow(/violates check constraint|null value/);
    const typed = (await sql<{ ok: boolean }>`select twin.citations_ok('[{"kind":"evidence","id":"${sql.raw(realEvd.id)}","version":1,"digest":null}]'::jsonb) ok`.execute(h.su)).rows[0];
    expect(typed?.ok).toBe(false);
    // and a well-formed one passes the CHECK (the row is grounded as immaterial context).
    await insert(`[{"kind":"evidence","id":"${realEvd.id}","version":1,"digest":"${realEvd.digest}"}]`, 'probe.well-formed');
  });
});
