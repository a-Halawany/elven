/**
 * CP-6 B82 §GM (migration 0121_b82_x_gm) — THE GOVERNED GEOGRAPHIC-REFERENCE REGISTER the map canvases draw (F-P7-E-21: CMP-064, VIZ-16,
 * VIZ-17, VIZ-18; DESIGN D4) on a real database through the real pipeline, the PDP, the ports and the controller. CONSTRUCTION evidence:
 * every persona, coordinate and statement here is SYNTHETIC; a reference declared here demonstrates the software only.
 *
 *   GM1 · DECLARE AND READ: a named data steward types the corridor (a chokepoint keyed to PortWatch, a port linked to a recorded object,
 *         a route line) in EPSG:4326 with source, licence and positional uncertainty; the layer reads them back (kind then key), with the
 *         bounds, the counts and the statement of what the map is NOT; the request id replayed answers the recorded version (no second one);
 *         a revision is version 2 (the version read), its history read back whole.
 *   GM2 · RETIRE: another steward retires a mistyped point (the next version, `retired`, its retirer and instant); the layer draws it no more
 *         (listed only on request, marked); retiring or revising it again is refused (state); its key is free for a new reference.
 *   GM3 · THE PORT'S RULES (in the class form, the port's words): another CRS (never converted), a bad geometry, a kind drawn as the wrong
 *         geometry, a missing statement or uncertainty, a stale version, an unknown reference, a key held by another active reference, a
 *         request id reused by another person, an unknown linked object, a malformed layer scope.
 *   GM4 · WHO: a domain analyst (not a data steward) refused by the PDP; an AGENT holding data_steward refused (the PEP's human gate); the
 *         port called outside the pipeline refused (no bound action); the port's own role re-check (a session claiming a role the database
 *         does not bind).
 *   GM5 · THE READ'S GUARD, RLS, GRANTS, THE LEDGER: an unbound runtime role and another tenant's domain refused; no write grant; append-only;
 *         the ports eye_commit's only, the read eye_app's and eye_commit's; every act in graph.geo_reference_events.
 *   GM6 · THE GEOMETRY CHECK equals the web mirror: the shared cases (apps/web/lib/canvas-b82.fixtures.json) answered alike by SQL here and by
 *         lib/canvas-b82.ts geometryProblem in canvas-b82.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { GeoController } from '../../src/graph/geo/geo.controller.js';
import { asGeoRefusal } from '../../src/graph/geo/geo.service.js';
import { B82_READS, GEO_CRS, type GeoReferenceRow } from '../../src/graph/b82-seams.js';
import { APP_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness } from './phase4-helpers.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b82-gm-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let gc: GeoController;
let T = ''; let D = ''; let T2 = ''; let D2 = '';
const RUN = uuidv7().slice(-6);
let steward: AuthenticatedPrincipal;    // data_steward — F. Aydın's role in the act (here a SYNTHETIC fixture person)
let steward2: AuthenticatedPrincipal;   // another data_steward — retires the mistyped point
let analyst: AuthenticatedPrincipal;    // domain_analyst — reads, never declares
let agent: AuthenticatedPrincipal;      // an AGENT holding data_steward (the PEP's human gate refuses it)
let LINKED: { type: string; id: string } = { type: 'EVD', id: '' };

function env(p: AuthenticatedPrincipal, action: string, t: string, d: string): Envelope {
  return {
    message_id: uuidv7(), scope: 'DOMAIN', tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'graph', action,
    side_effect_class: action.endsWith('read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: 'GEO', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b82-gm',
  } as unknown as Envelope;
}
const rq = (p: AuthenticatedPrincipal, action: string, t = T, d = D) => ({ eyeEnvelope: env(p, action, t, d), eyePrincipal: p }) as never;
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  const m1 = asGeoRefusal(e, 'harness');
  const m = m1 instanceof HttpException ? m1 : asObservationRefusal(e, 'harness');
  if (m instanceof HttpException) return { status: m.getStatus(), message: String((m.getResponse() as Row)['message'] ?? m.message) };
  return { status: null, message: e instanceof Error ? e.message : String(e) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>, db: Db = h.su) => ((await q.execute(db)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

type RefOut = { reference: GeoReferenceRow & { kind: string; uncertainty_m: string | number; replayed: boolean; reason: string; supersedes: number | null }; receipt: Row };
type LayerOut = { layer: { crs: string; references: Array<GeoReferenceRow & { kind: string }>; history: Array<GeoReferenceRow> | null; bounds: number[] | null; counts: Row; rule_version: string; as_of: string; statement: string }; receipt: Row };
const declare = (as: AuthenticatedPrincipal, payload: Row, t = T, d = D) => gc.declare(rq(as, 'graph.geo.declare', t, d), t, d, { payload }) as unknown as Promise<RefOut>;
const revise = (as: AuthenticatedPrincipal, id: string, payload: Row) => gc.revise(rq(as, 'graph.geo.declare'), T, D, id, { payload }) as unknown as Promise<RefOut>;
const retire = (as: AuthenticatedPrincipal, id: string, payload: Row) => gc.retire(rq(as, 'graph.geo.retire'), T, D, id, { payload }) as unknown as Promise<RefOut>;
const layer = (as: AuthenticatedPrincipal, payload: Row = {}, t = T, d = D) => gc.layer(rq(as, 'graph.geo.read', t, d), t, d, { payload }) as unknown as Promise<LayerOut>;

const BAB = (over: Row = {}): Row => ({
  requestId: uuidv7(), expectedVersion: 0, key: `chokepoint.bab-el-mandeb-${RUN}`, label: 'Bab el-Mandeb (SYNTHETIC harness)', kind: 'chokepoint',
  geometry: { type: 'Point', coordinates: [43.33, 12.58] }, crs: GEO_CRS, uncertaintyM: 25_000,
  sourceStatement: 'Typed by the steward from a public nautical gazetteer entry (SYNTHETIC harness)', licenceStatement: 'Facts of geography; no licence restriction stated (SYNTHETIC harness)',
  chokepointKey: 'portwatch:chokepoint4', reason: 'the corridor map draws the chokepoint the transits are counted at (SYNTHETIC harness)', ...over,
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  gc = h.app.get(GeoController);
  steward = await h.humanWithSession(['data_steward'], 'b82gm-steward');
  steward2 = await h.humanWithSession(['data_steward'], 'b82gm-steward2');
  analyst = await h.humanWithSession(['domain_analyst'], 'b82gm-analyst');
  const agentId = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentId}::uuid, 'agent', 'DOMAIN', ${T}::uuid, ${D}::uuid, ${`b82-gm-agent-${RUN} (SYNTHETIC)`}, ${`b82gm-agent-${agentId.slice(-8)}`}, 'active')`.execute(h.su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${agentId}::uuid, 'data_steward', 'DOMAIN', ${T}::uuid, ${D}::uuid)`.execute(h.su);
  agent = await h.openSession({ ...h.manager, principalId: agentId, kind: 'agent', homeScope: 'DOMAIN', homeTenantId: T, homeDomainId: D,
    bindings: [{ roleCode: 'data_steward', scope: 'DOMAIN', tenantId: T, domainId: D }] } as AuthenticatedPrincipal);
  // A RECORDED OBJECT of the domain to link (the governed upload path — one SYNTHETIC evidence item)
  const [evd] = await h.upload([{ filename: `b82-gm-port-${RUN}.csv`, text: `port,unlocode\nRotterdam (SYNTHETIC),NLRTM-${RUN}\n` }]);
  LINKED = { type: 'EVD', id: evd!.id };
  T2 = uuidv7(); D2 = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${T2}::uuid, ${'b82-gm-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T2}::uuid, ${'b82-gm-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
}, 600_000);
afterAll(async () => { await h?.close(); });

let BAB_ID = ''; let PORT_ID = ''; let ROUTE_ID = ''; let MISTYPED_ID = '';
describe('GM1 · declare and read', () => {
  it('a named data steward declares a chokepoint keyed to PortWatch: version 1, EPSG:4326, the statements and the uncertainty kept', async () => {
    const payload = BAB();
    const r = await declare(steward, payload);
    expect(r.reference).toMatchObject({ version: 1, key: payload['key'], kind: 'chokepoint', crs: 'EPSG:4326', state: 'active', chokepoint_key: 'portwatch:chokepoint4',
      declared_by: steward.principalId, linked: null, retired_by: null, retired_at: null, supersedes: null, replayed: false });
    expect(r.reference.geometry).toEqual({ type: 'Point', coordinates: [43.33, 12.58] });
    expect(Number(r.reference.uncertainty_m)).toBe(25_000);
    expect(r.receipt['policyDecisionId']).toEqual(expect.any(String));
    BAB_ID = r.reference.reference_id;
    // THE RETRY (PAT-20): the same request id answers the recorded version — no second version
    const again = await declare(steward, payload);
    expect(again.reference).toMatchObject({ reference_id: BAB_ID, version: 1, replayed: true });
    expect((await one(sql`select count(*)::int n from graph.geo_references where reference_id = ${BAB_ID}::uuid`))['n']).toBe(1);
  });
  it('a port linked to a recorded object of the domain, and a route LINE; the layer reads all three — kind then key, the bounds, the statement', async () => {
    const port = await declare(steward, BAB({ key: `port.rotterdam-${RUN}`, label: 'Rotterdam (SYNTHETIC harness)', kind: 'port', geometry: { type: 'Point', coordinates: [4.05, 51.95] },
      uncertaintyM: 5_000, chokepointKey: null, linked: LINKED }));
    expect(port.reference.linked).toEqual(LINKED);
    PORT_ID = port.reference.reference_id;
    const route = await declare(steward, BAB({ key: `route.suez-${RUN}`, label: 'Suez route (SYNTHETIC harness)', kind: 'route', chokepointKey: null, uncertaintyM: 50_000,
      geometry: { type: 'LineString', coordinates: [[121.9, 29.9], [43.33, 12.58], [32.35, 30.6], [4.05, 51.95]] } }));
    ROUTE_ID = route.reference.reference_id;
    const l = (await layer(analyst, { keys: [`chokepoint.bab-el-mandeb-${RUN}`, `port.rotterdam-${RUN}`, `route.suez-${RUN}`] })).layer;
    expect(l.crs).toBe('EPSG:4326');
    expect(l.references.map((x) => x.kind)).toEqual(['chokepoint', 'port', 'route']);
    expect(l.bounds).toEqual([4.05, 12.58, 121.9, 51.95]);
    expect(l.counts).toEqual({ returned: 3, active: 3, retired: 0 });
    expect(l.statement).toMatch(/No basemap, no tiles, no coastline or boundary dataset, no network/);
    expect(l.rule_version).toBe('b82-gm-geo-1');
    expect(l.history).toBeNull();
    expect(Number.isFinite(Date.parse(l.as_of))).toBe(true);
  });
  it('a revision is version 2 at the version read; the history of the reference is read back whole', async () => {
    const r = await revise(steward, BAB_ID, BAB({ key: `chokepoint.bab-el-mandeb-${RUN}`, expectedVersion: 1, geometry: { type: 'Point', coordinates: [43.32, 12.6] }, uncertaintyM: 10_000,
      reason: 'the strait\'s centreline re-typed from a second gazetteer (SYNTHETIC harness)' }));
    expect(r.reference).toMatchObject({ reference_id: BAB_ID, version: 2, supersedes: 1, state: 'active' });
    const l = (await layer(analyst, { referenceId: BAB_ID })).layer;
    expect(l.references).toHaveLength(1);
    expect(l.references[0]!.version).toBe(2);
    expect(l.history!.map((x) => x.version)).toEqual([1, 2]);
    expect(l.history![0]!.geometry).toEqual({ type: 'Point', coordinates: [43.33, 12.58] });
  });
});

describe('GM2 · retire', () => {
  it('another steward retires a mistyped point: the next version, retired, with its retirer; the layer draws it no more', async () => {
    const m = await declare(steward, BAB({ key: `site.mistyped-${RUN}`, label: 'Regensburg site — mistyped (SYNTHETIC harness)', kind: 'site', chokepointKey: null, geometry: { type: 'Point', coordinates: [49.01, 12.1] } }));
    MISTYPED_ID = m.reference.reference_id;
    const req = uuidv7();
    const r = await retire(steward2, MISTYPED_ID, { requestId: req, expectedVersion: 1, reason: 'latitude and longitude were typed in the wrong order (SYNTHETIC harness)' });
    expect(r.reference).toMatchObject({ reference_id: MISTYPED_ID, version: 2, state: 'retired', retired_by: steward2.principalId, supersedes: 1, replayed: false });
    expect(r.reference.retired_at).toEqual(expect.any(String));
    expect(r.reference.geometry).toEqual({ type: 'Point', coordinates: [49.01, 12.1] });   // what was drawn until then is kept
    expect((await retire(steward2, MISTYPED_ID, { requestId: req, expectedVersion: 1, reason: 'latitude and longitude were typed in the wrong order (SYNTHETIC harness)' })).reference.replayed).toBe(true);
    const drawn = (await layer(analyst, { keys: [`site.mistyped-${RUN}`] })).layer;
    expect(drawn.references).toEqual([]);
    expect(drawn.bounds).toBeNull();
    const listed = (await layer(analyst, { keys: [`site.mistyped-${RUN}`], includeRetired: true })).layer;
    expect(listed.references).toHaveLength(1);
    expect(listed.references[0]).toMatchObject({ state: 'retired', retired_by: steward2.principalId });
    expect(listed.counts).toEqual({ returned: 1, active: 0, retired: 1 });
  });
  it('retiring it again or revising it is refused (state); its key is free for a new reference', async () => {
    await refused(retire(steward, MISTYPED_ID, { requestId: uuidv7(), expectedVersion: 2, reason: 'a second retirement (SYNTHETIC harness)' }), /^geographic reference rejected \(state\): .* is already retired/, 409);
    await refused(revise(steward, MISTYPED_ID, BAB({ key: `site.mistyped-${RUN}`, kind: 'site', chokepointKey: null, expectedVersion: 2 })), /^geographic reference rejected \(state\): .* was retired at version 2/, 409);
    const fresh = await declare(steward, BAB({ key: `site.mistyped-${RUN}`, label: 'Regensburg site (SYNTHETIC harness)', kind: 'site', chokepointKey: null, geometry: { type: 'Point', coordinates: [12.1, 49.01] } }));
    expect(fresh.reference.reference_id).not.toBe(MISTYPED_ID);
    expect(fresh.reference.version).toBe(1);
  });
});

describe('GM3 · the port\'s rules, in its words', () => {
  it('another CRS is refused, never converted; a bad geometry; a kind drawn as the wrong geometry', async () => {
    await refused(declare(steward, BAB({ key: `x.crs-${RUN}`, crs: 'EPSG:3857' })), /^geographic reference rejected \(crs\): the register holds EPSG:4326 .* EPSG:3857 is not converted here/, 422);
    await refused(declare(steward, BAB({ key: `x.geom-${RUN}`, geometry: { type: 'Point', coordinates: [12.58, 143.33] } })), /^geographic reference rejected \(geometry\): the point has latitude 143.33, outside -90 to 90 degrees/, 422);
    await refused(declare(steward, BAB({ key: `x.kind-${RUN}`, kind: 'route' })), /^geographic reference rejected \(geometry\): a route is drawn as a LineString, not a Point/, 422);
    await refused(declare(steward, BAB({ key: `x.kind2-${RUN}`, kind: 'harbour' })), /^geographic reference rejected \(kind\): the kind is one of chokepoint, port, site, route, area/, 422);
  });
  it('the statements, the uncertainty, the key and the reason are required in their bounds', async () => {
    await refused(declare(steward, BAB({ key: `x.src-${RUN}`, sourceStatement: 'gazette' })), /^geographic reference rejected \(source\)/, 422);
    await refused(declare(steward, BAB({ key: `x.lic-${RUN}`, licenceStatement: '' })), /^geographic reference rejected \(licence\)/, 422);
    await refused(declare(steward, BAB({ key: `x.unc-${RUN}`, uncertaintyM: -1 })), /^geographic reference rejected \(uncertainty\)/, 422);
    await refused(declare(steward, BAB({ key: 'Bad Key' })), /^geographic reference rejected \(key\)/, 422);
    await refused(declare(steward, BAB({ key: `x.reason-${RUN}`, reason: 'why' })), /^geographic reference rejected \(reason\)/, 422);
    await refused(declare(steward, BAB({ key: `x.cp-${RUN}`, chokepointKey: 'Chokepoint 4' })), /^geographic reference rejected \(chokepoint\)/, 422);
  });
  it('a stale version, an unknown reference, a key held by another active reference, a request id reused by another person', async () => {
    await refused(revise(steward, BAB_ID, BAB({ key: `chokepoint.bab-el-mandeb-${RUN}`, expectedVersion: 1 })), /^geographic reference rejected \(stale\): .* is at version 2; this revision read 1/, 409);
    await refused(declare(steward, BAB({ key: `x.stale-${RUN}`, expectedVersion: 1 })), /^geographic reference rejected \(stale\): a new reference is declared from version 0; this declaration read 1/, 409);
    await refused(revise(steward, uuidv7(), BAB({ expectedVersion: 1 })), /^geographic reference rejected \(unknown_reference\): no reference .* in this domain/, 404);
    await refused(retire(steward, uuidv7(), { requestId: uuidv7(), expectedVersion: 1, reason: 'an unknown reference (SYNTHETIC harness)' }), /^geographic reference rejected \(unknown_reference\)/, 404);
    await refused(declare(steward, BAB({ key: `port.rotterdam-${RUN}`, kind: 'port', chokepointKey: null })), /^geographic reference rejected \(duplicate\): the key port\.rotterdam-.* is held by another active reference/, 409);
    const payload = BAB({ key: `x.dup-${RUN}` });
    await declare(steward, payload);
    await refused(declare(steward2, payload), /^geographic reference rejected \(duplicate\): request .* already recorded another act/, 409);
  });
  it('an unknown linked object; a malformed layer scope; an unknown reference asked of the layer', async () => {
    await refused(declare(steward, BAB({ key: `x.linked-${RUN}`, linked: { type: 'ENT', id: uuidv7() } })), /^geographic reference rejected \(unknown_linked\): no ENT .* is recorded in this domain/, 404);
    await refused(layer(analyst, { kinds: ['harbour'] }), /^geographic reference rejected \(layer_scope\): kinds is a list of chokepoint, port, site, route, area/, 422);
    await refused(layer(analyst, { bbox: [0, 0, 1, 1] }), /^geographic reference rejected \(layer_scope\): a layer is asked by keys, kinds, referenceId and includeRetired only/, 422);
    await refused(layer(analyst, { referenceId: uuidv7() }), /^geographic reference rejected \(unknown_reference\)/, 404);
  });
});

describe('GM4 · who', () => {
  it('a domain analyst (not a data steward) is refused by the PDP; an AGENT holding data_steward is refused (the human gate)', async () => {
    const a = await refusal(declare(analyst, BAB({ key: `x.analyst-${RUN}` })));
    expect(a.status).toBe(403);
    const g = await refusal(declare(agent, BAB({ key: `x.agent-${RUN}` })));
    expect(g.status).toBe(403);
    const n = await one(sql`select count(*)::int n from graph.geo_references where reference_key in (${`x.analyst-${RUN}`}, ${`x.agent-${RUN}`})`);
    expect(n['n']).toBe(0);
  });
  it('the ports called outside the pipeline are refused (no action is bound to the context)', async () => {
    const r = await refusal(sql`select graph.declare_geo_reference(${uuidv7()}::uuid, ${T}::uuid, ${D}::uuid, null, 0, 'x.direct', 'Direct', 'site',
      '{"type":"Point","coordinates":[1,2]}'::jsonb, 'EPSG:4326', 1, 'a direct call (SYNTHETIC)', 'a direct call (SYNTHETIC)', null, null, null, 'a direct call (SYNTHETIC)', ${steward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su));
    expect(r.message).toMatch(/context is bound to action <none>, which this port does not serve/);
    const x = await refusal(sql`select graph.retire_geo_reference(${uuidv7()}::uuid, ${T}::uuid, ${D}::uuid, ${BAB_ID}::uuid, 2, 'a direct call (SYNTHETIC)', ${steward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su));
    expect(x.message).toMatch(/context is bound to action <none>/);
  });
  it('the port re-checks the role itself: a session that CLAIMS data_steward while the database binds only domain_analyst is refused', async () => {
    const claimant = { ...analyst, bindings: [...analyst.bindings, { roleCode: 'data_steward', scope: 'DOMAIN', tenantId: T, domainId: D }] } as AuthenticatedPrincipal;
    const r = await refusal(declare(claimant, BAB({ key: `x.claim-${RUN}` })));
    expect(r.status).toBe(403);
    expect(r.message).toMatch(/^geographic reference rejected \(authority\): declaring or revising a geographic reference is the act of a data_steward/);
  });
});

describe('GM5 · the read\'s guard, RLS, grants, the ledger', () => {
  it('the runtime role with no bound scope is refused the layer; another tenant\'s domain is refused at the route', async () => {
    const app = h.app.get<Db>(APP_DB);
    const r = await refusal(sql`select graph.geo_layer(${T}::uuid, ${D}::uuid, '{}'::jsonb)`.execute(app));
    expect(r.message).toMatch(/^read rejected \(scope\): the geographic reference layer is read only within the caller's bound tenant and domain/);
    const o = await refusal(layer(analyst, {}, T2, D2));
    expect(o.status).toBe(403);
    const rows0 = await app.selectFrom('graph.geo_references' as never).selectAll().execute().catch(() => []);
    expect(rows0).toEqual([]);   // RLS: nothing is visible to an unbound runtime role
  });
  it('no write grant; append-only; the ports eye_commit\'s alone; the read eye_app\'s and eye_commit\'s; never PUBLIC', async () => {
    for (const t of ['geo_references', 'geo_reference_events']) {
      const g = await one(sql`select has_table_privilege('eye_app', ${'graph.' + t}, 'INSERT') ai, has_table_privilege('eye_commit', ${'graph.' + t}, 'INSERT') ci,
        has_table_privilege('eye_commit', ${'graph.' + t}, 'UPDATE') cu, has_table_privilege('eye_app', ${'graph.' + t}, 'SELECT') asel,
        (select relforcerowsecurity from pg_class where oid = ${'graph.' + t}::regclass) forced`);
      expect(g).toEqual({ ai: false, ci: false, cu: false, asel: true, forced: true });
    }
    await expect(sql`update graph.geo_references set label = 'changed' where reference_id = ${BAB_ID}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
    await expect(sql`delete from graph.geo_reference_events where reference_id = ${BAB_ID}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
    const fns = [['graph.declare_geo_reference(uuid, uuid, uuid, uuid, int, text, text, text, jsonb, text, numeric, text, text, text, uuid, text, text, uuid, uuid)', false],
                 ['graph.retire_geo_reference(uuid, uuid, uuid, uuid, int, text, uuid, uuid)', false], [B82_READS.geoLayer.fn, true]] as const;
    for (const [fn, read] of fns) {
      const g = await one(sql`select p.prosecdef d, p.provolatile v, has_function_privilege('public', p.oid, 'EXECUTE') pub, has_function_privilege('eye_app', p.oid, 'EXECUTE') app,
        has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt from pg_proc p where p.oid = ${fn}::regprocedure`);
      expect(g, fn).toMatchObject({ d: true, pub: false, app: read, cmt: true, v: read ? 's' : 'v' });
    }
  });
  it('every act is in the ledger: declared, revised, retired — with its actor', async () => {
    const ev = await rows(sql`select event, version, actor_principal_id from graph.geo_reference_events where reference_id in (${BAB_ID}::uuid, ${MISTYPED_ID}::uuid) order by occurred_at`);
    expect(ev.map((e) => `${String(e['event'])}@${String(e['version'])}`)).toEqual(['geo.declared@1', 'geo.revised@2', 'geo.declared@1', 'geo.retired@2']);
    expect(ev[3]!['actor_principal_id']).toBe(steward2.principalId);
    expect(PORT_ID).not.toBe(''); expect(ROUTE_ID).not.toBe('');
  });
});

describe('GM6 · the geometry check equals the web mirror (the shared cases)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const fx = JSON.parse(readFileSync(join(here, '../../../web/lib/canvas-b82.fixtures.json'), 'utf8')) as { cases: Array<{ name: string; geometry: unknown; problem: string | null }> };
  it('every case answers alike (valid → null; invalid → the problem in the same words)', async () => {
    expect(fx.cases.length).toBeGreaterThanOrEqual(15);
    for (const c of fx.cases) {
      const r = await one(sql`select graph.geo_geometry_problem(${JSON.stringify(c.geometry)}::jsonb) as p`);
      if (c.problem === null) expect(r['p'], c.name).toBeNull();
      else expect(String(r['p']), c.name).toContain(c.problem);
    }
  });
});
