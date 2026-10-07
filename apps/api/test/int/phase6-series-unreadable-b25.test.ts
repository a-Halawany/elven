/**
 * CP-6 B25 — act-found (the rehearsal of the B25 act on eye_demo_b25): A GOVERNED-DELETED FRAGMENT THAT A LATER VERSION SUPERSEDES ON ITS DAY
 * DOES NOT MAKE THE SERIES INCOMPLETE.
 *
 * The demonstration's PortWatch chokepoints source holds a 2024 replay-set FRAGMENT (one framed row, its day stated by its event time) whose
 * bytes a retention action tombstoned as superseded evidence; the live backfill recorded the same days LATER. The series assembly counted the
 * lost fragment against completeness, so every forecast on every PortWatch series — the whole corridor of the B25 scenes — was refused for
 * good ("a forecast on an incomplete history is refused"). The B30 act found the same for the twin's estimators. Reproduced here through the
 * real database, controllers and connector BEFORE the correction (the failures of S1 ARE the reproduction), kept as the regression after.
 *
 *   S1 · POSITIVE: two framed contract versions of one source serve the same days (the second recorded later, a composite key → new
 *        evidence objects); one FIRST-version fragment tombstoned → the series is COMPLETE, the lost fragment DISCLOSED as superseded on its
 *        day (served by the later version), and a forecast on it is ISSUED.
 *   S2 · REFUSAL (the guard kept): the LATER version's fragment for that day tombstoned too → nothing recorded after it serves the day: the series
 *        is INCOMPLETE (it is counted) and the forecast REFUSED.
 *   S3 · REFUSAL (the conservative branch): a tombstoned PARENT page (not a fragment; no single day) counts against completeness.
 *
 * The publisher is a transport double serving SYNTHETIC rows (no figure is PortWatch's). Two pieces of fixture setup have no governed route
 * and are written by the database superuser, labelled where they happen: the tombstones (the retention executor's effect) and the
 * corridor's subject entity. Every count is scoped to this file's tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { Phase4Harness, fakeEgress } from './phase4-helpers.js';
import { fixtureContract } from './phase1-helpers.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b25-unreadable-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
const ARC = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query';
const PAGE = 4; const DAYS = 12; const LOST_DAY = '2024-01-05';
let h: Phase4Harness; let eriksen: AuthenticatedPrincipal; let weber: AuthenticatedPrincipal;
let prediction: import('../../src/prediction/prediction.controller.js').PredictionController;
let SERIES = ''; let ASU = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId; const S = () => h.fx.sourceId;

const day = (n: number): string => { const d = new Date('2024-01-01T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** SYNTHETIC rows as the daily layer publishes them — one per (date, portid); `bump` changes the values of a re-publication. */
const rows = (bump: number) => Array.from({ length: DAYS }, (_, i) => ({ attributes: { date: day(i), portid: 'chokepoint1', n_total: 40 + (i % 7) + bump, capacity: 5000 } }));
const egressOf = (bump: number) => fakeEgress((url) => {
  const all = rows(bump); const offset = Number(new URL(url).searchParams.get('resultOffset') ?? 0);
  return JSON.stringify({ features: all.slice(offset, offset + PAGE), exceededTransferLimit: offset + PAGE < all.length });
});

/** The next live ArcGIS contract version (framed: the item path `features`, the row's day its time field), through the real routes. */
async function newArcgisVersion(itemKeyField: string | string[]): Promise<number> {
  const sourceKey = String((await sql<{ source_key: string }>`select source_key from observation.source_contracts_current where source_id = ${S()}::uuid limit 1`.execute(h.su)).rows[0]?.source_key);
  const version = h.version + 1;
  const c = fixtureContract(sourceKey) as Row; const so = { ...(c['security_and_operations'] as Row) }; delete so['replay_set'];
  const where = "portid='chokepoint1'";
  const contract = { ...c, acquisition_mode: 'live', data_origin: 'synthetic',
    identity: { ...(c['identity'] as Row), endpoints: [`${ARC}?where=${encodeURIComponent(where)}&outFields=*&f=json`] },
    authority_and_rights: { ...(c['authority_and_rights'] as Row), rights_state: 'confirmed' },
    security_and_operations: { ...so,
      expected_schema: { media_types: ['application/json'], required_fields: ['features.[].attributes.date'], drift_tolerance: 0, item_path: 'features', item_key_field: itemKeyField, item_time_field: 'attributes.date' },
      budgets: { max_requests_per_run: 12, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
      backfill: { strategy: 'arcgis-offset', endpoint: `${ARC}?where=${encodeURIComponent(where)}`, from: day(0), to: day(DAYS), page_size: PAGE, order_by: 'date,portid', time_field: 'date', where } },
    lifecycle: { contract_version: version, effective_from: '2026-09-05T00:00:00Z', supersedes_version: h.version } };
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  await h.app.get(ObservationController).registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', S(), 'observation'), T(), D(), { payload: { contract, sourceId: S() } });
  await h.pipeline.write(h.env(h.manager, 'observation.source.approve', 'SRC', S()), h.manager,
    { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'observation.source.approve', objectType: 'SRC', objectId: S() }, ObservationCapability.registry,
    async (cap) => {
      await cap.approveSource({ sourceId: S(), contractVersion: version, tenantId: T(), domainId: D(), decision: 'approve', reason: 'B25 act-found harness', eventId: uuidv7(), correlationId: uuidv7() });
      return { result: {}, targetType: 'SRC', targetId: S(), targetVersion: String(version), outboxEvent: null };
    });
  await h.transition(h.version, 'superseded');
  await h.transition(version, 'active');
  h.version = version;
  return version;
}

/** The fragment of a contract version that states `d` as its day (its latest object version), and that version's parents. */
const fragmentOf = async (version: number, d: string): Promise<Row> => (await sql<Row>`select distinct on (e.object_id) e.object_id::text, e.object_version, e.payload ->> 'manifest_id' manifest_id
  from objects.canonical_objects e where e.object_type = 'EVD' and e.provenance_ref = ${`SRC:${S()}@${version}`} and (e.payload -> 'fragment') is not null
   and to_char(e.event_time at time zone 'UTC', 'YYYY-MM-DD') = ${d} order by e.object_id, e.object_version desc`.execute(h.su)).rows[0] ?? {};
const parentsOf = async (version: number): Promise<Row[]> => (await sql<Row>`select distinct on (e.object_id) e.object_id::text, e.payload ->> 'manifest_id' manifest_id
  from objects.canonical_objects e where e.object_type = 'EVD' and e.provenance_ref = ${`SRC:${S()}@${version}`} and coalesce(jsonb_typeof(e.payload -> 'fragment'), 'null') <> 'object'
  order by e.object_id, e.object_version desc`.execute(h.su)).rows;
/** FIXTURE (the retention executor's effect, no governed route here): a tombstone on a manifest — its bytes are no longer served. */
const tombstone = (manifestId: unknown) => sql`insert into observation.blob_tombstones (tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, actor_principal_id, correlation_id)
  values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${String(manifestId)}::uuid, 'B25 act-found probe: superseded evidence past its retention', ${eriksen.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
const points = () => prediction.seriesPoints(h.req(eriksen, 'prediction.read', 'SER', null), T(), D(), SERIES, { payload: { knownAt: new Date().toISOString() } }) as unknown as Promise<Row & { complete: boolean; total: number; unreadable: Row[]; supersededUnreadable: Row[] }>;
const issue = (horizon: string) => prediction.issueForecast(h.req(eriksen, 'prediction.forecast.issue', 'FCT', null), T(), D(), { payload: { seriesKey: SERIES, horizon, assumptions: [ASU], label: 'replay demonstration' } } as never) as Promise<{ forecast: Row }>;
async function refusalOf(p: Promise<unknown>): Promise<{ status: number; message: string }> {
  try { await p; } catch (e) {
    const m = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
    if (m !== null) return { status: m.getStatus(), message: String((m.getResponse() as Row)['message'] ?? '') };
    return { status: 500, message: e instanceof Error ? e.message : String(e) };
  }
  throw new Error('the call should have been refused');
}

let A = 0; let B = 0;
beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { PredictionController: Pc } = await import('../../src/prediction/prediction.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  prediction = h.app.get(Pc); const graph = h.app.get(Gc);
  eriksen = await h.humanWithSession(['forecast_owner'], 'b25u-n-eriksen');
  weber = await h.humanWithSession(['strategy_owner'], 'b25u-j-weber');
  // version A (a single-path key) and version B (a composite key: NEW evidence objects for the same days, recorded later, re-published values)
  A = await newArcgisVersion('attributes.date');
  const ra = await h.runOnce(new RestConnector({ egress: egressOf(0).egress as never }));
  expect(ra.state, ra.reason).toBe('finished');
  B = await newArcgisVersion(['attributes.date', 'attributes.portid']);
  const rb = await h.runOnce(new RestConnector({ egress: egressOf(1).egress as never }));
  expect(rb.state, rb.reason).toBe('finished');
  const sourceKey = String((await sql<{ source_key: string }>`select source_key from observation.source_contracts_current where source_id = ${S()}::uuid limit 1`.execute(h.su)).rows[0]?.source_key);
  SERIES = `b25u:${sourceKey}:chokepoint1`;
  await prediction.registerSeries(h.req(eriksen, 'prediction.series.register', 'SER', null), T(), D(), { payload: { seriesKey: SERIES, sourceKey, parserRef: 'arcgis-feature-attribute@1',
    valueField: 'n_total', selector: 'chokepoint1', unit: 'transits/day', seasonalityDays: 7, attribution: 'SYNTHETIC rows (a transport double).', description: 'B25 act-found: SYNTHETIC framed daily transits' } } as never);
  // FIXTURE: the subject entity the assumption rests on (no route creates a bare place here)
  const entity = uuidv7(); const ec = uuidv7();
  await sql`insert into graph.entities_current (entity_id, scope, tenant_id, domain_id, entity_type, canonical_name, normalized_name, lifecycle_state, created_by, correlation_id)
    values (${entity}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'place', 'Suez Canal', 'suez canal', 'active', ${weber.principalId}::uuid, ${ec}::uuid)`.execute(h.su);
  await sql`insert into graph.entity_events (event_id, scope, tenant_id, domain_id, entity_id, event, actor_principal_id, details, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${entity}::uuid, 'entity.created', ${weber.principalId}::uuid, ${JSON.stringify({ entity_type: 'place', canonical_name: 'Suez Canal', normalized_name: 'suez canal', split_from: null })}::jsonb, ${ec}::uuid)`.execute(h.su);
  ASU = ((await graph.declare(h.req(weber, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(), { payload: { objectType: 'ASU', title: 'The canal stays open (SYNTHETIC)',
    statement: 'transits continue at their recent level', restsOn: [{ kind: 'entity', id: entity, rationale: 'the assumption is about this canal' }] } } as never)) as { strategy: { objectId: string } }).strategy.objectId;
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B25 act-found · a governed-deleted fragment a later version supersedes on its day does not make the series incomplete', () => {
  it('S1 · POSITIVE: version A\'s fragment for the day tombstoned — the series is COMPLETE, the lost fragment DISCLOSED as superseded by version B, a forecast ISSUED', async () => {
    const before = await points();
    expect(before).toMatchObject({ complete: true, total: DAYS });
    const lostA = await fragmentOf(A, LOST_DAY); const servingB = await fragmentOf(B, LOST_DAY);
    expect(lostA['object_id'], 'version A framed a fragment for the day').toBeDefined();
    expect(servingB['object_id'], 'version B framed its own fragment (a new object) for the day').toBeDefined();
    expect(servingB['object_id']).not.toBe(lostA['object_id']);
    await tombstone(lostA['manifest_id']);
    const after = await points();
    expect(after.complete, JSON.stringify(after.unreadable)).toBe(true);
    expect(after.unreadable).toEqual([]);
    expect(after.supersededUnreadable.map((u) => [u['evidence_object_id'], u['day']])).toEqual([[lostA['object_id'], LOST_DAY]]);
    // served by a version-B evidence (its fragment, or the parent page it was cut from — both recorded after A's)
    const bIds = (await sql<{ id: string }>`select distinct object_id::text id from objects.canonical_objects where object_type = 'EVD' and provenance_ref = ${`SRC:${S()}@${B}`}`.execute(h.su)).rows.map((x) => x.id);
    expect(bIds).toContain(String(after.supersededUnreadable[0]!['served_by']).split('@')[0]);
    expect(after.total).toBe(DAYS);
    const f = await issue('30d');
    expect(f.forecast['forecastId']).toBeDefined();
    console.log(`B25 act-found EVIDENCE · S1 · A ${String(lostA['object_id']).slice(0, 8)} tombstoned, served by B ${String(servingB['object_id']).slice(0, 8)} on ${LOST_DAY}: complete, forecast ${String(f.forecast['forecastId'])} issued`);
  }, 300_000);

  it('S2 · REFUSAL: version B\'s fragment for the same day tombstoned too — nothing recorded after it serves the day: INCOMPLETE, the forecast REFUSED', async () => {
    const lostB = await fragmentOf(B, LOST_DAY);
    await tombstone(lostB['manifest_id']);
    const p = await points();
    expect(p.complete).toBe(false);
    expect(p.unreadable.map((u) => u['evidence_object_id'])).toContain(lostB['object_id']);
    const r = await refusalOf(issue('90d'));
    expect(r.status).toBe(409);
    expect(r.message).toMatch(/could not be read by this reader|incomplete/);
  }, 300_000);

  it('S3 · REFUSAL (conservative): a tombstoned PARENT page states no single day — it counts against completeness', async () => {
    const parents = await parentsOf(B);
    expect(parents.length).toBeGreaterThan(0);
    await tombstone(parents[0]!['manifest_id']);
    const p = await points();
    expect(p.complete).toBe(false);
    expect(p.unreadable.map((u) => u['evidence_object_id'])).toContain(parents[0]!['object_id']);
  }, 300_000);
});
