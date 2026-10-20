/**
 * CP-6 B40 §0 (migration 0123 §0) — THE PRELUDE, on the real database through the real lifecycle:
 *   §0.1 the vocabularies widened in one place (every historic value kept; the new values admitted; an unknown one refused), the
 *        inspection-outcome domain (clean | detected | unavailable | failed | incomplete — D2), the markers' cause (health by default);
 *   §0.2 the use-refusal stubs are INERT (assert_usable passes an admitted EVD), declared as internal hooks; the dispatcher reaches both
 *        parts' stubs from objects._lineage_usable with BOTH rights sources (D4) and refuses an undeclared class — proven by replacing a
 *        stub inside a transaction that is rolled back;
 *   §0.3 SRC@v4 in the registry, agreeing with source-contract.ts; a v4 contract registers as SRC@v4 (the adapter kind admitted); a v1–v3
 *        contract registers exactly as before;
 *   the SEAM: with the pass-through stages a run behaves exactly as before (admitted, content authenticity unknown, nothing recorded); and
 *        each call site is live — authorize refuses before any request, throttle is asked before every request and can refuse it,
 *        inspect's quarantine uses its own class, authenticate's verified reaches the payload, both record hooks run in their transactions.
 * Every row here is SYNTHETIC fixture data.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { validateSourceContract, schemaRefOf, type SourceContractV1 } from '../../src/observation/sources/source-contract.js';
import { AuthorizeStageAp } from '../../src/observation/acquisition/stages/authorize-ap.js';
import { ThrottleStageAp } from '../../src/observation/acquisition/stages/throttle-ap.js';
import { InspectStageIn } from '../../src/observation/acquisition/stages/inspect-in.js';
import { AuthenticateStageVa } from '../../src/observation/acquisition/stages/authenticate-va.js';
import { INSPECTION_OUTCOMES, QUARANTINE_CLASS_OF_OUTCOME } from '../../src/observation/acquisition/intake-stages.js';
import type { Db } from '../../src/shared/db.js';
import { Phase4Harness, syntheticEgress } from './phase4-helpers.js';
import { adapterPackage, eicarTestBytes, fixtureBytes, publisherKeyPair, sha256, signedBulletin, srcV4Contract, tamperedCopy, verifyDetached, B40_FILES } from './phase6-b40-fixtures.js';

type Row = Record<string, unknown>;
let h: Phase4Harness;
const one = async (q: ReturnType<typeof sql>, db: Db = h.su) => ((await q.execute(db)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>, db: Db = h.su) => (await q.execute(db)).rows as Row[];
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  return { status: mapped === null ? null : mapped.getStatus(), message: e instanceof Error ? e.message : String(e) };
};
/** Run `fn` in a transaction that is ALWAYS rolled back (a stub replaced inside it never outlives the case). */
const rolledBack = async <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
  let out: T | undefined; const ROLLBACK = new Error('rollback');
  await h.su.transaction().execute(async (tx) => { out = await fn(tx as unknown as Db); throw ROLLBACK; }).catch((e: unknown) => { if (e !== ROLLBACK) throw e; });
  return out as T;
};
const constraint = (table: string, name: string) => one(sql`select pg_get_constraintdef(oid) d from pg_constraint where conrelid = ${table}::regclass and conname = ${name}`).then((r) => String(r['d']));
let window = 0;
/** A fresh contract version with its own backfill window, so each case's items are new evidence (never a no-op of an earlier case). */
const freshVersion = async () => { window += 1; const y = 2021 + Math.floor(window / 6); const m = String((window % 6) * 2 + 1).padStart(2, '0');
  return h.newVersion({ from: `${y}-${m}-01`, to: `${y}-${m}-20`, windowDays: 366 }); };

beforeAll(async () => { h = await Phase4Harness.boot(); }, 300_000);
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await h?.close(); });

describe('§0.1 · the vocabularies, widened in one place', () => {
  it('every historic value is kept and the new ones are admitted (the CHECK definitions)', async () => {
    const kind = await constraint('observation.source_contracts_current', 'source_contracts_current_connector_kind_check');
    for (const k of ['upload', 'rss', 'rest', 'adapter']) expect(kind).toContain(`'${k}'`);
    const ev = await constraint('observation.source_contract_events', 'source_contract_events_event_check');
    for (const e of ['contract.registered', 'contract.rejected', 'contract.rights_changed', 'contract.evaluated', 'contract.stewardship_changed',
      'contract.customer_approved', 'contract.requalification_required', 'contract.requalified', 'contract.credential_rotated']) expect(ev).toContain(`'${e}'`);
    const ir = await constraint('observation.acquisition_incomplete_ranges', 'acquisition_incomplete_ranges_reason_class_check');
    for (const c of ['publisher_gap', 'quarantined', 'interrupted', 'budget', 'refused', 'rate_limited', 'window_closed', 'robots_disallowed', 'residency_refused']) expect(ir).toContain(`'${c}'`);
    const q = await constraint('observation.quarantine_current', 'q_current_reason_class');
    for (const c of ['path_traversal', 'expansion_limit', 'entry_limit', 'compression_ratio', 'malformed_archive', 'type_mismatch', 'oversize', 'schema_drift',
      ...Object.values(QUARANTINE_CLASS_OF_OUTCOME).filter((x): x is string => x !== null), 'active_content', 'macro', 'embedded_file', 'hidden_instruction',
      'duplicate', 'quality', 'rights', 'policy_prohibited', 'residency_conflict', 'destination_identity_changed', 'unknown_signer', 'response_anomaly']) expect(q).toContain(`'${c}'`);
    const cu = await constraint('observation.custody_events', 'custody_events_event_check');
    for (const e of ['custody.acquired', 'custody.retrieval_degraded', 'custody.inspected', 'custody.authenticity_recorded']) expect(cu).toContain(`'${e}'`);
  });
  it('the inspection outcome is a domain of exactly clean | detected | unavailable | failed | incomplete (D2), matching the seam', async () => {
    for (const v of INSPECTION_OUTCOMES) expect(await one(sql`select ${v}::observation.inspection_outcome as v`)).toEqual({ v });
    expect((await refusal(sql`select 'suspicious'::observation.inspection_outcome`.execute(h.su))).message).toMatch(/violates check constraint/);
    expect(QUARANTINE_CLASS_OF_OUTCOME.clean).toBeNull();
  });
  it('an unknown quarantine class and an unknown incomplete-range class are refused by the stream writer (stream_incomplete re-declared whole)', async () => {
    const src = await one(sql`select pg_get_functiondef('observation.stream_incomplete(observation.acquisition_streams, uuid, text, text, text, text, int, uuid)'::regprocedure) d`);
    expect(String(src['d'])).toMatch(/'rate_limited', 'window_closed', 'robots_disallowed', 'residency_refused'\)/);
    expect(String(src['d'])).toMatch(/SECURITY DEFINER/);
  });
  it('the impact markers carry a cause: health by default (every existing row), rights admitted, anything else refused', async () => {
    const c = await one(sql`select column_default d, is_nullable n from information_schema.columns where table_schema = 'observation' and table_name = 'source_impact_markers' and column_name = 'cause'`);
    expect(c).toEqual({ d: "'health'::text", n: 'NO' });
    expect(await constraint('observation.source_impact_markers', 'sim_cause')).toBe("CHECK ((cause = ANY (ARRAY['health'::text, 'rights'::text])))");
  });
});

describe('§0.2 · the use-refusal stubs', () => {
  it('the three functions are internal hooks (STABLE, invoker, fixed search path, no PUBLIC / runtime EXECUTE) with the documented signatures', async () => {
    const fns = await rows(sql`select p.oid::regprocedure::text f, p.provolatile v, p.prosecdef d, array_to_string(p.proconfig, ',') cfg,
        has_function_privilege('public', p.oid, 'EXECUTE') pub, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, pg_get_function_result(p.oid) res
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'observation' and p.proname in ('_b40_use_refusal', '_rg_use_refusal', '_va_use_refusal') order by 1`);
    expect(fns.map((f) => f['f'])).toEqual([
      'observation._b40_use_refusal(uuid,uuid,uuid,integer,jsonb)',
      'observation._rg_use_refusal(uuid,uuid,uuid,integer,uuid,integer,text,text)',
      'observation._va_use_refusal(uuid,uuid,uuid,integer)',
    ]);
    for (const f of fns) expect(f).toMatchObject({ v: 's', d: false, cfg: 'search_path=observation, pg_catalog, pg_temp', pub: false, app: false, res: 'jsonb' });
    const lu = await one(sql`select p.provolatile v, p.prosecdef d, array_to_string(p.proconfig, ',') cfg, pg_get_functiondef(p.oid) src from pg_proc p where p.oid = 'objects._lineage_usable(text, uuid, int, text)'::regprocedure`);
    expect(lu).toMatchObject({ v: 's', d: false, cfg: 'search_path=objects, pg_catalog, pg_temp' });
    expect(String(lu['src'])).toMatch(/observation\._b40_use_refusal\(o\.tenant_id, o\.domain_id, ev\.id, ev\.version::int, st\)/);
    expect(String(lu['src'])).toMatch(/rights_expired/);   // B82's checks kept, before the B40 call
  });
  it('the stubs answer NULL for any evidence (they never look) — §RG\'s stub REPLACED (0123_b40_x_rg, D4): it answers NULL for rights in force and rights_withdrawn when either rights source is withdrawn', async () => {
    const id = uuidv7();
    /* B40 rg: §RG replaced its stub — this case asserted the stub's inertness; it now asserts §RG's answer on the same inputs */
    expect(await one(sql`select observation._rg_use_refusal(${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${id}::uuid, 1, ${id}::uuid, 1, 'confirmed', 'in_force') r`)).toEqual({ r: null });
    expect((await one(sql`select observation._rg_use_refusal(${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${id}::uuid, 1, ${id}::uuid, 1, 'withdrawn', 'withdrawn') r`))['r']).toMatchObject({ class: 'rights_withdrawn' });
    /* end B40 rg */
    expect(await one(sql`select observation._va_use_refusal(${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${id}::uuid, 1) r`)).toEqual({ r: null });
    expect(await one(sql`select observation._b40_use_refusal(${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${id}::uuid, 1, '{}'::jsonb) r`)).toEqual({ r: null });
  });

  let evd: { id: string; version: number } = { id: '', version: 0 };
  it('INERT: an admitted EVD passes every decision-active use with the stubs in place', async () => {
    const v = await freshVersion();
    const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }), v.version);
    expect(r.state, r.reason).toBe('finished');
    const e = await one(sql`select object_id::text id, object_version::int version from objects.canonical_objects where object_type = 'EVD' and tenant_id = ${h.fx.tenantId}::uuid
      and payload ->> 'manifest_id' in (select manifest_id::text from observation.blob_manifests where run_id = ${r.runId}::uuid) order by recorded_at desc limit 1`);
    evd = { id: String(e['id']), version: Number(e['version']) };
    expect(evd.id).not.toBe('');
    for (const use of ['decision_option', 'publication', 'export', 'gate']) {
      await sql`select objects.assert_usable('EVD', ${evd.id}::uuid, ${evd.version}, ${use})`.execute(h.su);
    }
  }, 120_000);
  it('WIRED (D4): _lineage_usable hands §RG\'s stub BOTH rights sources — the contract version\'s rights and the rights terms\' state — and raises its class (409)', async () => {
    const r = await rolledBack(async (tx) => {
      await sql.raw(`CREATE OR REPLACE FUNCTION observation._rg_use_refusal(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int, p_source uuid, p_contract_version int,
        p_contract_rights_state text, p_terms_rights_state text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = observation, pg_catalog, pg_temp AS $f$
        BEGIN RETURN jsonb_build_object('class', 'rights_withdrawn', 'detail', format('probe: source %s v%s, contract rights %s, terms %s', p_source, p_contract_version,
          coalesce(p_contract_rights_state, '<null>'), coalesce(p_terms_rights_state, '<null>'))); END $f$`).execute(tx);
      return refusal(sql`select objects.assert_usable('EVD', ${evd.id}::uuid, ${evd.version}, 'export')`.execute(tx));
    });
    expect(r.message).toMatch(new RegExp(`^object use rejected \\(rights_withdrawn\\): EVD ${evd.id} v${evd.version} rests on EVD ${evd.id} v${evd.version}, probe: source ${h.fx.sourceId} v\\d+, contract rights confirmed, terms <null>; it is not used for export`));
    expect(r.status).toBe(409);
    // rolled back: the stub is inert again
    await sql`select objects.assert_usable('EVD', ${evd.id}::uuid, ${evd.version}, 'export')`.execute(h.su);
  });
  it('WIRED (D6): §VA\'s stub is reached when §RG\'s answers NULL, and its class is raised (409); an undeclared class is refused by the dispatcher', async () => {
    const va = await rolledBack(async (tx) => {
      await sql.raw(`CREATE OR REPLACE FUNCTION observation._va_use_refusal(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int) RETURNS jsonb
        LANGUAGE plpgsql STABLE SET search_path = observation, pg_catalog, pg_temp AS $f$ BEGIN RETURN '{"class": "authenticity_failed", "detail": "probe: the signature did not verify"}'::jsonb; END $f$`).execute(tx);
      return refusal(sql`select objects.assert_usable('EVD', ${evd.id}::uuid, ${evd.version}, 'gate')`.execute(tx));
    });
    expect(va.message).toMatch(/^object use rejected \(authenticity_failed\): .*probe: the signature did not verify; it is not used for gate/);
    expect(va.status).toBe(409);
    const bogus = await rolledBack(async (tx) => {
      await sql.raw(`CREATE OR REPLACE FUNCTION observation._va_use_refusal(p_tenant uuid, p_domain uuid, p_evd uuid, p_version int) RETURNS jsonb
        LANGUAGE plpgsql STABLE SET search_path = observation, pg_catalog, pg_temp AS $f$ BEGIN RETURN '{"class": "suspicious", "detail": "x"}'::jsonb; END $f$`).execute(tx);
      return refusal(sql`select objects.assert_usable('EVD', ${evd.id}::uuid, ${evd.version}, 'gate')`.execute(tx));
    });
    expect(bogus.message).toMatch(/^B40 use refusal: suspicious is not a declared refusal class/);
  });
});

describe('§0.3 · SRC@v4', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schemaOf = async (v: string) => (await one(sql`select json_schema s, compatibility c from objects.schema_registry where object_type = 'SRC' and schema_version = ${v}`));
  const pkg = adapterPackage('1.0.0');
  const samples = {
    rss: srcV4Contract({ sourceKey: 'b40-prelude-notices', kind: 'rss', endpoints: ['https://notices.red-sea.synthetic.example/navarea-ix/rss'], mediaTypes: ['application/rss+xml'] }),
    upload: srcV4Contract({ sourceKey: 'b40-prelude-uploads', kind: 'upload', mediaTypes: ['application/pdf'] }),
    adapter: srcV4Contract({ sourceKey: 'b40-prelude-adapter', kind: 'adapter', endpoints: ['https://consignments.partner-logistics.synthetic.example/v1/consignments?page=1'],
                             adapter: { package_id: uuidv7(), version: '1.0.0', digest: pkg.packageDigest } }),
  };
  it('the registry row is additive and the schema and source-contract.ts agree on the samples', async () => {
    const v4 = await schemaOf('v4');
    expect(v4['c']).toBe('additive');
    const validate = ajv.compile(v4['s'] as object);
    for (const [k, c] of Object.entries(samples)) {
      expect(validate(c), `${k}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(validateSourceContract(c), k).toEqual({ ok: true, errors: [] });
      expect(schemaRefOf(c as unknown as SourceContractV1)).toBe('SRC@v4');
    }
  });
  it('a v4 contract missing a block, an adapter without its package and a package on another kind are refused by both', async () => {
    const validate = ajv.compile((await schemaOf('v4'))['s'] as object);
    const { economics: _drop, ...noEconomics } = samples.rss;
    const { adapter: _a, ...noPackage } = samples.adapter;
    const strayPackage = { ...samples.rss, adapter: samples.adapter['adapter'] };
    const opaqueNoReason = { ...samples.upload, content_policy: { ...(samples.upload['content_policy'] as Row), macros: 'admit_opaque' } };
    for (const [c, ts] of [[noEconomics, /economics is required on an SRC@v4 contract/], [noPackage, /adapter is required for a contract of kind adapter/],
                           [strayPackage, /adapter is declared only by a contract of kind adapter/], [opaqueNoReason, /admit_opaque_reason is required/]] as const) {
      expect(validateSourceContract(c).errors.join('; ')).toMatch(ts);
      if (c !== opaqueNoReason) expect(validate(c)).toBe(false);
    }
    // a v3 contract cannot name the adapter kind (it is a v4 kind): the v3 schema refuses it, and the validator demands the v4 blocks
    const v3 = ajv.compile((await schemaOf('v3'))['s'] as object);
    const { acquisition_policy: _1, authenticity: _2, content_policy: _3, economics: _4, stewardship: _5, evidence_attributes: _6, ...asV3 } = samples.rss;
    expect(v3(asV3)).toBe(true);
    expect(v3({ ...asV3, connector_kind: 'adapter' })).toBe(false);
    expect(validateSourceContract({ ...asV3, connector_kind: 'adapter' }).ok).toBe(false);
  });
  it('a v4 contract registers through the real route as SRC@v4 — the adapter kind admitted by the widened CHECK; a v1–v3 contract keeps its schema', async () => {
    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const controller = h.app.get(ObservationController);
    for (const c of [samples.upload, samples.adapter]) {
      const key = `${String(c['source_key'])}-${uuidv7().slice(-8)}`;
      const r = await controller.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), h.fx.tenantId, h.fx.domainId,
        { payload: { contract: { ...c, source_key: key, identity: { ...(c['identity'] as Row), source_identity: key } } } }) as { source: { sourceId: string } };
      const row = await one(sql`select s.connector_kind k, s.lifecycle_state l, o.schema_ref r from observation.source_contracts_current s
        join objects.canonical_objects o on o.object_type = 'SRC' and o.object_id = s.source_id and o.object_version = s.contract_version where s.source_id = ${r.source.sourceId}::uuid`);
      expect(row).toEqual({ k: c['connector_kind'], l: 'draft', r: 'SRC@v4' });
    }
    const v = await freshVersion();   // the harness's v2 contract (a backfill and an attribution): unchanged
    expect(await one(sql`select schema_ref r from objects.canonical_objects where object_type = 'SRC' and object_id = ${h.fx.sourceId}::uuid and object_version = ${v.version}`)).toEqual({ r: 'SRC@v2' });
  }, 120_000);
});

describe('the intake seam', () => {
  const stage = <T>(cls: new (...a: never[]) => T): T => h.app.get(cls as never) as T;
  const evdOf = (runId: string) => rows(sql`select o.payload -> 'authenticity' ->> 'content_authenticity' ca from objects.canonical_objects o
    where o.object_type = 'EVD' and o.payload ->> 'manifest_id' in (select manifest_id::text from observation.blob_manifests where run_id = ${runId}::uuid and vault = 'evidence')`);

  it('PASS-THROUGH: a run behaves exactly as before — finished, admitted, content authenticity unknown, nothing quarantined; every stage asked', async () => {
    const throttle = vi.spyOn(stage(ThrottleStageAp), 'throttle'); const authorize = vi.spyOn(stage(AuthorizeStageAp), 'authorize');
    const inspect = vi.spyOn(stage(InspectStageIn), 'inspect'); const authn = vi.spyOn(stage(AuthenticateStageVa), 'authenticate');
    const record = vi.spyOn(stage(InspectStageIn), 'record');
    const v = await freshVersion();
    const { egress, seen } = syntheticEgress();
    const r = await h.runOnce(new RestConnector({ egress }), v.version);
    expect(r.state, r.reason).toBe('finished');
    expect(r.quarantined).toBe(0);
    expect(r.admitted).toBeGreaterThan(0);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(authorize.mock.calls[0]![0]).toMatchObject({ form: 'command', sourceId: h.fx.sourceId, contractVersion: v.version, runId: r.runId, v4: false });
    expect(throttle).toHaveBeenCalledTimes(seen.length);   // before EVERY request
    expect(throttle.mock.calls.map((c) => c[1].endpoint)).toEqual(seen);
    expect(inspect).toHaveBeenCalledTimes(r.admitted); expect(authn).toHaveBeenCalledTimes(r.admitted);
    expect(record.mock.calls.every((c) => c[2].kind === 'admitted')).toBe(true);
    expect((await evdOf(r.runId)).map((e) => e['ca'])).toEqual(Array(r.admitted).fill('unknown'));
  }, 120_000);
  it('authorize: a refusal cancels the run BEFORE any request, with its class on run.cancelled', async () => {
    vi.spyOn(stage(AuthorizeStageAp), 'authorize').mockResolvedValue({ kind: 'refuse', reasonClass: 'window_closed', reason: 'probe: outside the collection window', authorizationId: null });
    const v = await freshVersion();
    const { egress, seen } = syntheticEgress();
    const r = await h.runOnce(new RestConnector({ egress }), v.version);
    expect(r).toMatchObject({ state: 'cancelled', admitted: 0, reason: 'acquisition not authorized (window_closed): probe: outside the collection window' });
    expect(seen).toHaveLength(0);
    const ev = await rows(sql`select event, details ->> 'reason_class' c from observation.collection_run_events where run_id = ${r.runId}::uuid order by occurred_at`);
    expect(ev).toEqual([{ event: 'run.started', c: null }, { event: 'run.cancelled', c: 'window_closed' }]);
  }, 120_000);
  it('throttle: a refusal stops the request — the run fails closed with the class', async () => {
    vi.spyOn(stage(ThrottleStageAp), 'throttle').mockResolvedValue({ kind: 'refuse', reasonClass: 'rate_limited', reason: 'probe: the bucket is empty', retryAfterSeconds: 60 });
    const v = await freshVersion();
    const { egress, seen } = syntheticEgress();
    const r = await h.runOnce(new RestConnector({ egress }), v.version);
    expect(r.state).toBe('failed');
    expect(r.reason).toBe('throttle refused (rate_limited): probe: the bucket is empty');
    expect(seen).toHaveLength(0);
  }, 120_000);
  it('inspect: a quarantine decision quarantines with the stage\'s own class (the new CHECK admits it); the record hook runs in the quarantine transaction', async () => {
    vi.spyOn(stage(InspectStageIn), 'inspect').mockResolvedValue({ kind: 'quarantine', reasonClass: 'hidden_instruction', reason: 'probe: an instruction in invisible text', verdicts: [] });
    const record = vi.spyOn(stage(InspectStageIn), 'record');
    const authn = vi.spyOn(stage(AuthenticateStageVa), 'authenticate');
    const v = await freshVersion();
    const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }), v.version);
    expect(r.state, r.reason).toBe('finished');
    expect(r.admitted).toBe(0); expect(r.quarantined).toBeGreaterThan(0);
    expect(authn).not.toHaveBeenCalled();   // authenticate only after inspection passes
    const cases = await rows(sql`select reason_class, reason from observation.quarantine_current where run_id = ${r.runId}::uuid`);
    expect(cases.every((c) => c['reason_class'] === 'hidden_instruction' && c['reason'] === 'probe: an instruction in invisible text')).toBe(true);
    expect(record.mock.calls.map((c) => c[2].kind)).toEqual(Array(r.quarantined).fill('quarantined'));
  }, 120_000);
  it('authenticate: a verified outcome reaches the EVD payload (verified) and the record hook runs in the admission transaction; unknown_signer quarantines', async () => {
    vi.spyOn(stage(AuthenticateStageVa), 'authenticate').mockResolvedValue({ kind: 'admit', outcome: 'verified', payloadContentAuthenticity: 'verified', detail: { probe: true } });
    const record = vi.spyOn(stage(AuthenticateStageVa), 'record');
    const v = await freshVersion();
    const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }), v.version);
    expect(r.state, r.reason).toBe('finished');
    expect((await evdOf(r.runId)).map((e) => e['ca'])).toEqual(Array(r.admitted).fill('verified'));
    expect(record.mock.calls.map((c) => [c[2].kind, c[3].kind])).toEqual(Array(r.admitted).fill(['admitted', 'admit']));
    vi.restoreAllMocks();
    vi.spyOn(stage(AuthenticateStageVa), 'authenticate').mockResolvedValue({ kind: 'quarantine', reasonClass: 'unknown_signer', reason: 'probe: no anchor in force', detail: {} });
    const v2 = await freshVersion();
    const r2 = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }), v2.version);
    expect(r2.admitted).toBe(0);
    expect((await rows(sql`select distinct reason_class from observation.quarantine_current where run_id = ${r2.runId}::uuid`)).map((c) => c['reason_class'])).toEqual(['unknown_signer']);
  }, 180_000);
});

describe('the fixtures (run-time keys, no committed key, the harmless detection string assembled)', () => {
  it('the bulletin is signed with a fresh key; the tampered copy fails the original signature; two runs never share a key', () => {
    const s = signedBulletin();
    expect(verifyDetached(s.bytes, s.signature, s.key.publicKey)).toBe(true);
    const t = tamperedCopy(s.bytes);
    expect(t.equals(s.bytes)).toBe(false);
    expect(verifyDetached(t, s.signature, s.key.publicKey)).toBe(false);
    expect(publisherKeyPair().fingerprint).not.toBe(s.key.fingerprint);
  });
  it('the committed uploads carry their planted markers; the EICAR string is assembled, never a committed file', () => {
    const supplier = fixtureBytes(B40_FILES.supplierPdf).toString('latin1');
    for (const marker of [/\/OpenAction 6 0 R/, /\/S \/JavaScript \/JS \(app\.alert/, /1 1 1 rg BT \/F1 1 Tf/, /ignore previous instructions/, /200B/]) expect(supplier).toMatch(marker);
    expect(fixtureBytes(B40_FILES.cleanPdf).toString('latin1')).not.toMatch(/\/JavaScript|\/OpenAction|\/AA/);
    expect(fixtureBytes(B40_FILES.macroDocm).includes(Buffer.from('word/vbaProject.bin'))).toBe(true);
    const e = eicarTestBytes();
    expect(e.byteLength).toBe(68);
    expect(sha256(e)).toBe('275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f');
  });
});
