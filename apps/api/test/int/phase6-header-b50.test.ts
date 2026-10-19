/**
 * CP-6 B50 §HD (migration 0120 §HD; F-P3-01) — HEADER COMPLETENESS, IDENTITY AND TIME, through the product's own writers and routes:
 *   §L   the ten layers and their contracts (C-008, V01-T-045, V00-T-030) — objects.layer_contracts against B107's LAYERS
 *   §V   the governed time_precision vocabulary in its four places (ES-26-001)
 *   §P   the header profiles (ES-24-003, ES-25-002, V00-T-076) — the table against header-builder.ts, every registered type profiled
 *   §T   the upload intake's stated document time — "late August 2026", bounded, part_of_month, Europe/Berlin (ES-26-001/-004)
 *   §S   every version admitted here carries the side ledgers and the B50 statements (V03-T-051/-052, ES-05-001, ADR-0003)
 *   §H   the header half of the knowledge hook: a decision-active use refused naming the missing fields (ES-24-003)
 *   §I   identity declarations (ES-25-002); §R correction replay on the generic writer; §O the ledgers' RLS, grants, append-only
 *   §B   the backup manifest's per-tenant / per-domain facts (ES-25-003)
 * CONSTRUCTION evidence only; every row here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import { HEADER_TIME_PRECISIONS, type TimeValue } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { B50_STATED_FIELDS, HEADER_PROFILES, knownLimitations, profileRow } from '../../src/objects/header-builder.js';
import { USE_KINDS } from '../../src/objects/b50-seams.js';
import { Phase4Harness } from './phase4-helpers.js';
import { APP_DB } from '../../src/shared/shared.module.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let analyst: AuthenticatedPrincipal;
let objects: import('../../src/objects/objects.controller.js').ObjectsController;
let started: Date;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const REPO = join(__dirname, '../../../..');
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const one = async (q: ReturnType<typeof sql>) => ((await rows(q))[0] ?? {}) as Row;
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const rawError = async (p: Promise<unknown>): Promise<{ message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  return { message: e instanceof Error ? e.message : String(e) };
};
const LATE_AUGUST: TimeValue = { kind: 'bounded', earliest: '2026-08-21T00:00:00+02:00', latest: '2026-09-01T00:00:00+02:00', precision: 'part_of_month', zone: 'Europe/Berlin', source: 'publisher text' };

/** Upload one SYNTHETIC record through the upload route with the given document time; return its OBS and EVD canonical versions. */
async function uploadWithTime(name: string, documentTime: unknown): Promise<{ obs: Row; evd: Row }> {
  const sourceId = await h.uploadSource();
  const { UploadController } = await import('../../src/observation/sources/upload.controller.js');
  const text = `booking,eta\nSYN-BKG-${name},late August 2026\n`;
  await h.app.get(UploadController).upload(h.req(h.registrar, 'observation.run.trigger', 'RUN', null, 'observation'), T(), D(),
    { payload: { sourceId, contractVersion: 1, files: [{ filename: `${name}.csv`, mediaType: 'text/csv', base64: Buffer.from(text, 'utf8').toString('base64'), documentTime: documentTime as never }] } });
  const itemKey = `upload:${name}.csv@${createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').slice(0, 16)}`;
  const obs = await one(sql`select * from objects.canonical_objects where object_type = 'OBS' and tenant_id = ${T()}::uuid and payload ->> 'item_key' = ${itemKey} order by recorded_at desc limit 1`);
  const evd = await one(sql`select * from objects.canonical_objects where object_type = 'EVD' and tenant_id = ${T()}::uuid and source_object_ids @> ${JSON.stringify([`OBS:${String(obs['object_id'])}`])}::jsonb order by recorded_at desc limit 1`);
  return { obs, evd };
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  started = new Date();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  analyst = await h.humanWithSession(['domain_analyst'], 'b50-hd-analyst');
  const { ObjectsController } = await import('../../src/objects/objects.controller.js');
  objects = h.app.get(ObjectsController);
}, 600_000);
afterAll(async () => { await h?.close(); });

describe('§L · the ten layers publish their contracts (C-008, V01-T-045, V00-T-030)', () => {
  it('objects.layer_register is B107\'s LAYERS, layer by layer (a deliberate mapping onto the units and object types, not a rename)', async () => {
    const generator = '../../src/governance/conformance/generate-components-manifest.mjs';
    const { LAYERS } = await import(generator) as { LAYERS: Array<{ n: number; name: string; chapter: string; units: string[]; objects: string[]; reads: number[]; failure: string[]; affected: string }> };
    const reg = await rows(sql`select layer, name, chapter, units, objects, reads, failure, affected from objects.layer_register order by layer`);
    expect(reg.map((r) => ({ n: r['layer'], name: r['name'], chapter: r['chapter'], units: r['units'], objects: r['objects'], reads: r['reads'], failure: r['failure'], affected: r['affected'] })))
      .toEqual(LAYERS.map((l) => ({ n: l.n, name: l.name, chapter: l.chapter, units: l.units, objects: l.objects, reads: l.reads, failure: l.failure, affected: l.affected })));
  });
  it('the route serves each layer\'s object schemas, events, interfaces, header, quality and failure contract — and lists a missing kind, never omits it', async () => {
    const r = await objects.layerContracts(h.req(analyst, 'objects.read', 'OBJ', null, 'observation'), T(), D()) as { layers: Row[] };
    expect(r.layers).toHaveLength(10);
    for (const l of r.layers) {
      expect(Object.keys(l).sort(), String(l['name'])).toEqual(['chapter', 'events', 'failure', 'header', 'interfaces', 'layer', 'missing', 'name', 'objects', 'reads', 'units']);
      for (const o of l['objects'] as Row[]) {
        expect((o['schemas'] as string[]).length, `${String(l['name'])} ${String(o['type'])}`).toBeGreaterThanOrEqual(1);
        expect(o['quality_profile']).toBe(`quality:${String(o['type'])}@1`);
      }
      expect((l['header'] as Row)['registry_fields']).toBe(43);
      expect(Array.isArray(l['missing'])).toBe(true);
      expect((l['missing'] as string[]).every((m) => ['object_schema', 'quality_profile', 'subscribable_event', 'degraded_contract'].includes(m))).toBe(true);
    }
    // L1 publishes ObservationRecorded / SourceHealthChanged (0083); a layer with no subscribable event says so
    expect((r.layers[0]!['events'] as Row[]).map((e) => e['event_type'])).toEqual(expect.arrayContaining(['ObservationRecorded', 'SourceHealthChanged']));
    expect(r.layers.filter((l) => (l['events'] as Row[]).length === 0).every((l) => (l['missing'] as string[]).includes('subscribable_event'))).toBe(true);
  });
});

describe('§V · the governed time_precision vocabulary (ES-26-001)', () => {
  it('the table, the canonical CHECK, assert_header_semantics and HEADER_TIME_PRECISIONS name the same words', async () => {
    const table = (await rows(sql`select code from objects.time_precisions order by ordinal`)).map((r) => String(r['code']));
    expect([...table].sort()).toEqual([...HEADER_TIME_PRECISIONS].sort());
    const check = String((await one(sql`select pg_get_constraintdef(oid) d from pg_constraint where conname = 'canonical_time_precision'`))['d']);
    const sem = String((await one(sql`select pg_get_functiondef('objects.assert_header_semantics(jsonb)'::regprocedure) d`))['d']);
    for (const p of HEADER_TIME_PRECISIONS) { expect(check, p).toContain(`'${p}'`); expect(sem, p).toContain(`'${p}'`); }
    expect(sem).toContain('B50 hd');
  });
  it('a word outside the vocabulary is refused by the store itself', async () => {
    const r = await rawError(sql`insert into objects.canonical_objects (object_id, object_type, scope, tenant_id, domain_id, object_version, lifecycle_state, owning_component, accountable_owner, truth_state, classification, purpose_scope, schema_ref, audit_correlation_id, content_digest, method_ref, time_precision)
      values (${uuidv7()}::uuid, 'OBJ', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 1, 'active', 'fixture', 'fixture', 'asserted', 'internal', 'x', 'OBJ@v1', ${uuidv7()}::uuid, ${'0'.repeat(64)}, 'fixture@1', 'fortnight')`.execute(h.su));
    expect(r.message).toMatch(/canonical_time_precision/);
  });
});

describe('§P · the header profiles (ES-24-003, ES-25-002, V00-T-076)', () => {
  it('one active profile per registered type, equal to header-builder.ts HEADER_PROFILES, with the trust envelope', async () => {
    const types = (await rows(sql`select distinct object_type from objects.schema_registry order by 1`)).map((r) => String(r['object_type']));
    expect(types.sort()).toEqual(Object.keys(HEADER_PROFILES).sort());
    const table = await rows(sql`select object_type, profile_version, issuing_authority, issued_through, quality_profile, mandatory, value_required, absence, envelope from objects.header_profiles where state = 'active' order by object_type`);
    expect(table.map((r) => ({ ...r }))).toEqual(types.map((t) => profileRow(t)));
  });
  it('readable through the route under objects.read; no runtime role can write a profile', async () => {
    const r = await objects.headerProfiles(h.req(analyst, 'objects.read', 'OBJ', null, 'observation'), T(), D()) as { profiles: Row[] };
    expect(r.profiles.map((p) => p['object_type'])).toContain('FCT');
    const g = await one(sql`select has_table_privilege('eye_app', 'objects.header_profiles', 'INSERT') ai, has_table_privilege('eye_commit', 'objects.header_profiles', 'INSERT') ci, has_table_privilege('eye_app', 'objects.header_profiles', 'SELECT') sel`);
    expect(g).toEqual({ ai: false, ci: false, sel: true });
  });
});

describe('§T · the upload intake states the document time (ES-26-001 / ES-26-004)', () => {
  it('"late August 2026": the header carries its lower bound and part_of_month; the qualifier carries the bounds, zone and source — declared', async () => {
    const { obs, evd } = await uploadWithTime(`b50-eta-${uuidv7().slice(-6)}`, LATE_AUGUST);
    for (const o of [obs, evd]) {
      expect((o['event_time'] as Date).toISOString()).toBe('2026-08-20T22:00:00.000Z');
      expect(o['time_precision']).toBe('part_of_month');
      const q = await one(sql`select kind, instant, earliest, latest, time_precision, zone, source, declared from objects.time_qualifiers where object_id = ${String(o['object_id'])}::uuid and object_version = ${Number(o['object_version'])} and axis = 'event'`);
      expect({ ...q, earliest: (q['earliest'] as Date).toISOString(), latest: (q['latest'] as Date).toISOString() })
        .toEqual({ kind: 'bounded', instant: null, earliest: '2026-08-20T22:00:00.000Z', latest: '2026-08-31T22:00:00.000Z', time_precision: 'part_of_month', zone: 'Europe/Berlin', source: 'publisher text', declared: true });
      const axes = (await rows(sql`select axis, declared from objects.time_qualifiers where object_id = ${String(o['object_id'])}::uuid order by axis`)).map((r) => `${String(r['axis'])}:${String(r['declared'])}`);
      expect(axes).toEqual(['event:true', 'observation:false', 'recorded:false']);
    }
    // the header's inherited controls name their source: the contract (EU residency, the licence, its retention)
    const basis = (await one(sql`select header_basis from objects.version_operations where object_id = ${String(evd['object_id'])}::uuid`))['header_basis'] as Row;
    expect((basis['controls'] as Row)['residency_profile']).toMatchObject({ value: 'EU', from: 'source_contract' });
    expect((basis['controls'] as Row)['rights_profile']).toMatchObject({ value: 'internal', from: 'source_contract' });
  });
  it('an exact document time is derived as before (exact, not declared); a day-precision header instant is the day\'s bounds', async () => {
    const { evd } = await uploadWithTime(`b50-exact-${uuidv7().slice(-6)}`, '2024-01-14T00:00:00Z');
    expect(evd['time_precision']).toBe('exact');
    expect(await one(sql`select kind, declared, zone from objects.time_qualifiers where object_id = ${String(evd['object_id'])}::uuid and axis = 'event'`)).toEqual({ kind: 'exact', declared: false, zone: null });
    const day = await rows(sql`select q.kind, q.earliest, q.latest from objects.time_qualifiers q join objects.canonical_objects o using (object_id, object_version)
                                where o.time_precision = 'day' and q.axis = 'valid_from' and o.tenant_id = ${T()}::uuid limit 1`);
    for (const d of day) expect(((d['latest'] as Date).getTime() - (d['earliest'] as Date).getTime()) / 86_400_000).toBe(1);
  });
  it('an unknown time places no instant; a malformed time value is refused at the intake with its problems — never coerced', async () => {
    const { evd } = await uploadWithTime(`b50-unknown-${uuidv7().slice(-6)}`, { kind: 'unknown', precision: 'unknown', zone: null, source: 'operator' });
    expect(evd['event_time']).toBeNull();
    expect(await one(sql`select kind, declared from objects.time_qualifiers where object_id = ${String(evd['object_id'])}::uuid and axis = 'event'`)).toEqual({ kind: 'unknown', declared: true });
    const r = await refusal(uploadWithTime(`b50-bad-${uuidv7().slice(-6)}`, { kind: 'bounded', earliest: '2026-09-01T00:00:00Z', latest: '2026-08-21T00:00:00Z', precision: 'exact', zone: 'Europe/Berlin', source: 'publisher text' }));
    expect(r.status).toBe(400);
    expect(r.message).toMatch(/not a valid time value: a bounded time's latest is after its earliest; a bounded time is not of exact precision/);
  });
  it('the SQL validator mirrors the contract (defence in depth at the admission)', async () => {
    const p = await one(sql`select objects._time_value_problems(${JSON.stringify({ kind: 'conflicting', precision: 'day', zone: null, source: 'two publishers', conflicts: [{ ref: 'a', value: 'x' }] })}::jsonb) p`);
    expect(p['p']).toEqual(['a conflicting time names at least two disagreeing sources']);
    expect((await one(sql`select objects._time_value_problems(${JSON.stringify({ ...LATE_AUGUST, axis: 'event' })}::jsonb) p`))['p']).toEqual([]);
  });
});

describe('§S · every version admitted after 0120 carries its side ledgers and the B50 statements (V03-T-051/-052, ES-05-001)', () => {
  it('every canonical version this harness wrote through the product has an operation row; none states a bare null where B50 states', async () => {
    const missing = await rows(sql`select o.object_type, count(*)::int n from objects.canonical_objects o
      where o.recorded_at >= ${started} and o.tenant_id = ${T()}::uuid and not exists (select 1 from objects.version_operations v where v.object_id = o.object_id and v.object_version = o.object_version)
      group by 1 order by 1`);
    expect(missing).toEqual([]);
    const types = (await rows(sql`select distinct object_type from objects.canonical_objects where recorded_at >= ${started} and tenant_id = ${T()}::uuid order by 1`)).map((r) => String(r['object_type']));
    expect(types.length).toBeGreaterThanOrEqual(10);
    for (const f of B50_STATED_FIELDS) {
      const n = await one(sql`select count(*)::int n from objects.canonical_objects o where o.recorded_at >= ${started} and o.tenant_id = ${T()}::uuid
        and (${sql.ref(`o.${f}`)} is null or ${sql.ref(`o.${f}`)}::text = 'null')`);
      expect(n['n'], f).toBe(0);
    }
  });
  it('the operation row: the authority context\'s single-use nonce as the idempotency key, the correlation as the trace id, the bound action', async () => {
    const r = await one(sql`select v.idempotency_key, v.idempotency_basis, v.trace_id, v.trace_source, v.bound_action, v.operation_id is not null has_op, o.audit_correlation_id::text corr
      from objects.version_operations v join objects.canonical_objects o using (object_id, object_version) where o.object_id = ${w.evd.id}::uuid and o.object_version = ${w.evd.version}`);
    expect(r).toMatchObject({ idempotency_basis: 'authority_context', trace_source: 'correlation', has_op: true });
    expect(String(r['idempotency_key'])).toMatch(/^ctx:[0-9a-f-]{36}$/);
    const pol = await one(sql`select policy_bundle, policy_decision_id is not null has_decision, header_basis -> 'limitations' lim from objects.version_operations where object_id = ${w.evd.id}::uuid`);
    expect(pol['has_decision']).toBe(true);
    expect(String(pol['policy_bundle']).length).toBeGreaterThan(0);
    const evd = await one(sql`select synthetic_state, source_clock_quality, time_precision, event_time, truth_state from objects.canonical_objects where object_id = ${w.evd.id}::uuid and object_version = ${w.evd.version}`);
    expect(pol['lim']).toEqual(knownLimitations({ synthetic_state: evd['synthetic_state'] as boolean, source_clock_quality: evd['source_clock_quality'] as 'trusted',
      time_precision: String(evd['time_precision']), event_time: evd['event_time'] === null ? null : (evd['event_time'] as Date).toISOString(), truth_state: String(evd['truth_state']) }));
    expect(r['trace_id']).toBe(r['corr']);
  });
  it('a null control profile is the writer\'s statement: the basis names the domain profile that governs it (the header stays null — B36\'s residency gate reads it)', async () => {
    const r = await one(sql`select v.header_basis b from objects.version_operations v join objects.canonical_objects o using (object_id, object_version)
      where o.object_type = 'DEC' and o.tenant_id = ${T()}::uuid and o.residency_profile is null limit 1`);
    expect(((r['b'] as Row)['controls'] as Row)['residency_profile']).toMatchObject({ value: null, from: 'none', domain_profile: 'local-dev' });
    expect(((r['b'] as Row)['ontology'] as Row)['header']).toBe('ontology:none');
  });
  it('the forecast\'s header shows its uncertainty, and for confidence the declared absence in words (the corridor forecast scene)', async () => {
    const f = await one(sql`select confidence, uncertainty, quality_state, freshness_state from objects.canonical_objects where object_id = ${w.forecastId}::uuid order by object_version desc limit 1`);
    expect(Object.keys(f['uncertainty'] as Row)).toEqual(expect.arrayContaining(['q10', 'q50', 'q90']));
    expect(f['confidence']).toEqual({ state: 'not_applicable', reason: 'a quantile forecast states its uncertainty (q10 / q50 / q90), not a confidence' });
    expect(f['quality_state']).toMatchObject({ validation: expect.any(String) });
  });
});

describe('§H · a decision-active use checks the header first (ES-24-003)', () => {
  let fct: { id: string; version: number; digest: string };
  beforeAll(async () => {
    // A forecast version recorded WITHOUT the side ledger — as every version recorded before 0120 is — that lacks its uncertainty (SYNTHETIC).
    const id = uuidv7(); const digest = createHash('sha256').update(id).digest('hex');
    await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, truth_state, synthetic_state, classification, purpose_scope, schema_ref, audit_correlation_id, content_digest, method_ref, recorded_at, time_precision, source_clock_quality, source_object_ids, payload)
      values (${id}::uuid, 'FCT', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-PRD-01', 'principal:fixture', 'inferred', true, 'internal', 'prediction', 'FCT@v1', ${uuidv7()}::uuid, ${digest}, 'fixture-forecast@1', clock_timestamp() - interval '1 hour', 'exact', 'trusted', '["EVD:x"]'::jsonb, '{}'::jsonb)`.execute(h.su);
    fct = { id, version: 1, digest };
  });
  it('the profile\'s fields for each use are checked; a version recorded before B50 is told so', async () => {
    for (const use of USE_KINDS) {
      const r = await refusal(sql`select objects.assert_usable('FCT', ${fct.id}::uuid, 1, ${use})`.execute(h.su));
      expect(r.status, use).toBe(409);
      expect(r.message).toBe(`object use rejected (incomplete_header): FCT ${fct.id} v1 lacks uncertainty, valid_from, valid_to for ${use} (header profile FCT@1); the version was recorded before B50 — the fields B50 states are not populated on it`);
    }
  });
  it('a package option citing it is refused in the server\'s words, naming the fields (409); the forecast the product issued is usable', async () => {
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'B50 header-hook package (SYNTHETIC)', statement: 'the header is checked before an option cites', owner: w.owner.principalId });
    const v = (await c.open(d.package.packageId)).version.version;
    const r = await refusal(c.option(d.package.packageId, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention',
      consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'forecast', id: fct.id, version: fct.version, digest: fct.digest }] }));
    expect(r.status).toBe(409);
    expect(r.message).toMatch(/^object use rejected \(incomplete_header\): FCT .* lacks uncertainty, valid_from, valid_to for decision_option \(header profile FCT@1\)/);
    const issued = await one(sql`select object_version::int v from objects.canonical_objects where object_id = ${w.forecastId}::uuid order by object_version desc limit 1`);
    await sql`select objects.assert_usable('FCT', ${w.forecastId}::uuid, ${Number(issued['v'])}, 'decision_option')`.execute(h.su);
  });
  it('a declared absence does not satisfy a field the profile requires as a value (a generic claim with no confidence)', async () => {
    const created = await objects.create(h.req(analyst, 'objects.create', 'CLM', null, 'observation'), T(), D(), { payload: {
      objectType: 'CLM', truthState: 'asserted', classification: 'internal', purposeScope: 'observation', humanRefs: [`principal:${analyst.principalId}`],
      payload: { subject: 'SYN-BKG-1', predicate: 'eta', object_value: 'late August 2026' } } }) as { object: Row };
    const r = await refusal(sql`select objects.assert_usable('CLM', ${String(created.object['object_id'])}::uuid, 1, 'gate')`.execute(h.su));
    expect(r.status).toBe(409);
    expect(r.message).toMatch(/lacks confidence \(declared not_assessed: CP-OBJ-01 does not assess confidence for CLM\), method_ref for gate \(header profile CLM@1\)$/);
  });
  it('an unknown object is the caller\'s refusal (the hook does not look); a use outside the vocabulary is §0\'s (422)', async () => {
    await sql`select objects.assert_usable('FCT', gen_random_uuid(), 1, 'gate')`.execute(h.su);
    expect((await refusal(sql`select objects.assert_usable('FCT', ${fct.id}::uuid, 1, 'briefing')`.execute(h.su))).status).toBe(422);
  });
  it('the hook stays STABLE, invoker, read-only and ungranted (§0\'s contract)', async () => {
    const r = await one(sql`select p.provolatile v, p.prosecdef d, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt
      from pg_proc p where p.oid = 'objects._header_usable(text, uuid, integer, text)'::regprocedure`);
    expect(r).toEqual({ v: 's', d: false, app: false, cmt: false });
  });
});

describe('§I · identity declarations (ES-25-002, ES-25-001)', () => {
  it('issuing authority, namespace, creation time, status, aliases, merges / splits and the supersession chain', async () => {
    const r = await objects.header(h.req(analyst, 'objects.read', 'EVD', w.evd.id, 'observation'), T(), D(), w.evd.id) as { header: Row };
    const id = r.header['identity'] as Row;
    expect(id['issuing_authority']).toMatchObject({ profile: 'CP-OBS-01', owning_component: 'CP-OBS-01', consistent: true, profile_version: 1 });
    expect(id['namespace']).toMatchObject({ scope: 'DOMAIN', tenant_id: T(), domain_id: D(), object_type: 'EVD' });
    expect(String((id['namespace'] as Row)['identifier_scheme'])).toMatch(/UUIDv7/);
    expect(id).toMatchObject({ status: 'admitted', aliases: [], merges: [], splits: {} });
    expect((id['supersession'] as Row[])[0]).toMatchObject({ version: 1, header: 'stated' });
    expect((r.header['versions'] as Row[])[0]).toMatchObject({ version: 1, header: 'stated' });
  });
  it('an unknown object — or one outside the caller\'s tenant and domain — is refused alike in the class form (no existence oracle)', async () => {
    const unknown = await refusal(sql`select objects.identity_declaration('ENT', ${uuidv7()}::uuid)`.execute(h.su));
    expect(unknown.message).toMatch(/^identity rejected \(unknown_object\): no ENT .* is recorded in the caller's tenant and domain/);
    // the runtime role with no bound context (the operator login bypasses RLS by design — read_scope_ok — so the probe uses the app's own pool)
    const appDb = h.app.get<import('../../src/shared/db.js').Db>(APP_DB);
    const unbound = await rawError(sql`select objects.identity_declaration('EVD', ${w.evd.id}::uuid)`.execute(appDb));
    expect(unbound.message).toMatch(/^identity rejected \(unknown_object\): no EVD /);
  });
});

describe('§R · correction replay on the generic writer (V03-T-067, ADR-0003)', () => {
  it('create → correct: both versions stated, v2 corrects v1, the as-of read before v2 returns v1, the history reads both', async () => {
    const created = await objects.create(h.req(analyst, 'objects.create', 'CLM', null, 'observation'), T(), D(), { payload: {
      objectType: 'CLM', truthState: 'asserted', classification: 'internal', purposeScope: 'observation', humanRefs: [`principal:${analyst.principalId}`],
      time: { event: LATE_AUGUST }, payload: { subject: 'SYN-BKG-2', predicate: 'eta', object_value: 'late August 2026' } } }) as { object: Row };
    const id = String(created.object['object_id']);
    const between = new Date().toISOString();
    expect((created.object['event_time'] as Date).toISOString()).toBe('2026-08-20T22:00:00.000Z');
    const corrected = await objects.correct(h.req(analyst, 'objects.correct', 'CLM', id, 'observation'), T(), D(), id, { payload: { expectedVersion: 1, correction: {
      objectType: 'CLM', truthState: 'asserted', classification: 'internal', purposeScope: 'observation', humanRefs: [`principal:${analyst.principalId}`],
      eventTime: '2026-08-28T00:00:00Z', timePrecision: 'day', payload: { subject: 'SYN-BKG-2', predicate: 'eta', object_value: '28 August 2026' } } } }) as { object: Row };
    expect(corrected.object).toMatchObject({ correction_of: `${id}@1`, lifecycle_state: 'corrected' });
    const asOf = await objects.get(h.req(analyst, 'objects.read', 'CLM', id, 'observation'), T(), D(), id, { payload: { knownAt: between } }) as unknown as { object: Row };
    expect(Number(asOf.object['object_version'])).toBe(1);
    const hd = await objects.header(h.req(analyst, 'objects.read', 'CLM', id, 'observation'), T(), D(), id) as { header: Row };
    const vs = hd.header['versions'] as Row[];
    expect(vs.map((v) => v['header'])).toEqual(['stated', 'stated']);
    expect((vs[0]!['time'] as Row[]).find((t) => t['axis'] === 'event')).toMatchObject({ kind: 'bounded', declared: true, zone: 'Europe/Berlin' });
    expect((vs[1]!['time'] as Row[]).find((t) => t['axis'] === 'event')).toMatchObject({ kind: 'bounded', declared: false, precision: 'day' });
  });
  it('a version recorded before B50 reads "recorded before B50 — not populated"', async () => {
    const id = uuidv7();
    await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, truth_state, synthetic_state, classification, purpose_scope, schema_ref, audit_correlation_id, content_digest, method_ref)
      values (${id}::uuid, 'OBJ', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'fixture', 'principal:fixture', 'asserted', true, 'internal', 'graph', 'OBJ@v1', ${uuidv7()}::uuid, ${'1'.repeat(64)}, 'fixture@1')`.execute(h.su);
    const hd = await objects.header(h.req(analyst, 'objects.read', 'OBJ', id, 'observation'), T(), D(), id) as { header: Row };
    expect((hd.header['versions'] as Row[])[0]).toMatchObject({ header: 'recorded before B50 — not populated', operation: null, time: [] });
    expect(((hd.header['identity'] as Row)['supersession'] as Row[])[0]).toMatchObject({ header: 'recorded before B50' });
  });
});

describe('§O · the side ledgers: RLS, grants, append-only', () => {
  it('FORCE RLS with the canonical row\'s visibility rule; SELECT only for the runtime roles; no write grant; append-only', async () => {
    for (const t of ['version_operations', 'time_qualifiers']) {
      const r = await one(sql`select c.relrowsecurity rls, c.relforcerowsecurity force,
          has_table_privilege('eye_app', ${`objects.${t}`}, 'SELECT') app_sel, has_table_privilege('eye_app', ${`objects.${t}`}, 'INSERT') app_ins,
          has_table_privilege('eye_commit', ${`objects.${t}`}, 'INSERT') cmt_ins, has_table_privilege('eye_commit', ${`objects.${t}`}, 'UPDATE') cmt_upd,
          (select qual from pg_policies p where p.schemaname = 'objects' and p.tablename = ${t}) qual
        from pg_class c where c.oid = ${`objects.${t}`}::regclass`);
      expect(r, t).toMatchObject({ rls: true, force: true, app_sel: true, app_ins: false, cmt_ins: false, cmt_upd: false });
      expect(String(r['qual'])).toMatch(/eye_row_visible\(tenant_id, domain_id\)/);
    }
    const u = await refusal(sql`update objects.version_operations set trace_id = 'tampered-trace' where object_id = ${w.evd.id}::uuid`.execute(h.su));
    expect(u.message).toMatch(/append-only/i);
  });
  it('the admission is the only writer: both admit forms are SECURITY DEFINER, eye_commit only; the internals ungranted', async () => {
    for (const fn of ['objects.admit_version(jsonb, jsonb, text)', 'objects.admit_version(jsonb, jsonb, text, jsonb)']) {
      expect(await one(sql`select p.prosecdef d, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('public', p.oid, 'EXECUTE') pub
        from pg_proc p where p.oid = ${fn}::regprocedure`), fn).toEqual({ d: true, cmt: true, app: false, pub: false });
    }
    for (const fn of ['objects._record_admission(jsonb, jsonb)', 'objects._header_basis(jsonb)']) {
      expect(await one(sql`select has_function_privilege('eye_commit', ${fn}::regprocedure, 'EXECUTE') cmt, has_function_privilege('eye_app', ${fn}::regprocedure, 'EXECUTE') app`), fn).toEqual({ cmt: false, app: false });
    }
    const def = String((await one(sql`select pg_get_functiondef('objects.admit_version(jsonb, jsonb, text)'::regprocedure) d`))['d']);
    expect(def.match(/objects\._record_admission\(/g)?.length).toBe(1);
    expect(def).toContain('B50 hd');
  });
});

describe('§B · the backup manifest is explicit per tenant and domain (ES-25-003)', () => {
  it('scope-facts.sql: per (tenant, domain) the canonical objects, audit events, blob manifests and audit heads — equal to the store\'s own counts', async () => {
    const q = readFileSync(join(REPO, 'scripts/ops/lib/scope-facts.sql'), 'utf8');
    const facts = (await one(sql`select ${sql.raw(q)}::jsonb f`))['f'] as Row[];
    const mine = facts.find((f) => f['tenant_id'] === T() && f['domain_id'] === D()) as Row;
    expect(mine).toBeDefined();
    const n = await one(sql`select (select count(*)::int from objects.canonical_objects where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) c,
      (select count(*)::int from audit.audit_events where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) a,
      (select count(*)::int from observation.blob_manifests where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid) m`);
    expect({ c: mine['canonical_objects'], a: mine['audit_events'], m: mine['blob_manifests'] }).toEqual(n);
    const heads = mine['audit_heads'] as Record<string, number>;
    expect(Object.keys(heads).length).toBeGreaterThanOrEqual(1);
    for (const [p, s] of Object.entries(heads)) {
      expect((await one(sql`select max(audit_seq)::int m from audit.audit_events where partition_id = ${p} and tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid`))['m']).toBe(Number(s));
    }
  });
  it('tenant and domain are explicit in the other stores the row names: the outbox, telemetry, the search and projection ledgers, audit', async () => {
    const t = ['objects.object_outbox', 'analytics.telemetry_events', 'executive.search_events', 'graph.projection_partitions', 'graph.projection_events',
               'audit.audit_events', 'objects.canonical_objects', 'objects.version_operations', 'objects.time_qualifiers', 'observation.blob_manifests'];
    const got = await rows(sql`select table_schema || '.' || table_name t, count(*)::int n from information_schema.columns
      where table_schema || '.' || table_name = any (${t}::text[]) and column_name in ('tenant_id', 'domain_id') group by 1 order by 1`);
    expect(got).toEqual([...t].sort().map((x) => ({ t: x, n: 2 })));
  });
  it('backup.sh records it in the manifest and restore.sh verifies every scope against the capture window', () => {
    const backup = readFileSync(join(REPO, 'scripts/ops/backup.sh'), 'utf8'); const restore = readFileSync(join(REPO, 'scripts/ops/restore.sh'), 'utf8');
    expect(backup).toMatch(/SCOPE_FACTS_SQL="\$\(cat "\$REPO\/scripts\/ops\/lib\/scope-facts\.sql"\)"/);
    expect(backup).toMatch(/'scopes',\s+\$SCOPE_FACTS_SQL,/);
    expect(restore).toMatch(/scope \$sk\.\$key = \$g \(window \[\$b, \$a\]\)/);
    expect(restore).toMatch(/audit head \$part reaches/);
  });
});
