/**
 * CP-6 B50 §0 (migration 0120 §0) — THE PRELUDE of the knowledge core: the knowledge hooks exist and are INERT (objects.assert_usable →
 * objects._header_usable / objects._lineage_usable return without refusing; objects.publication_frozen answers frozen = false), and the five
 * shared ports re-declared in §0 (decision.derive_option, executive.approve_publication / deliver_publication, retention.record_export_package,
 * decision.gate_act) call them ONCE each, with their grants, security, search path and signature exactly as before. The positive paths of
 * derive_option and the gate's 'ready' act run here through the product's own services; a temporarily refusing hook proves the calls are
 * live; the publication and export ports' positive paths are their own harnesses' (phase6-publishing-b36, phase6-retention-b11/b13), run on
 * the same database. Every row here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { HOOKED_PORTS, HOOKS, USE_KINDS } from '../../src/objects/b50-seams.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let analyst: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const gate = (as: AuthenticatedPrincipal, pkg: string, v: number, act: string, payload: Row = {}) =>
  w.decisions.gateAct(h.req(as, `decision.gate.${act}`, 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), act, { payload }) as Promise<{ gate: Row }>;
const infoDigest = async (pkg: string, v: number) =>
  String(((await w.decisions.gateStatus(h.req(w.executive, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v))) as { gate: Row }).gate['information_package_digest']);

/** Runs `body` with one hook temporarily replaced by a refusing probe, then restores the hook's own definition (fileParallelism is off). */
async function withProbe(hook: '_header_usable' | '_lineage_usable', cls: 'incomplete_header' | 'unfit', body: () => Promise<void>): Promise<void> {
  const sig = `objects.${hook}(text, uuid, integer, text)`;
  const def = String((await one(sql`select pg_get_functiondef(${sig}::regprocedure) as d`))['d']);
  await sql.raw(`CREATE OR REPLACE FUNCTION objects.${hook}(p_type text, p_id uuid, p_version int, p_use text) RETURNS void
    LANGUAGE plpgsql STABLE SET search_path = objects, pg_catalog, pg_temp AS $$
    BEGIN RAISE EXCEPTION 'object use rejected (${cls}): probe % % v% for %', p_type, p_id, p_version, p_use USING ERRCODE = '22023'; END $$`).execute(h.su);
  try { await body(); } finally { await sql.raw(def).execute(h.su); }
  expect(String((await one(sql`select pg_get_functiondef(${sig}::regprocedure) as d`))['d'])).toBe(def);
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  analyst = await h.humanWithSession(['domain_analyst'], 'b50-analyst');
}, 600_000);
afterAll(async () => { await h?.close(); });

describe('§0.1 · the hooks exist and are inert', () => {
  it('four internal STABLE functions: invoker, a fixed search path, no EXECUTE for PUBLIC or a runtime role', async () => {
    for (const k of Object.values(HOOKS)) {
      const r = await one(sql`select p.provolatile v, p.prosecdef d, array_to_string(p.proconfig, ',') cfg, pg_get_function_result(p.oid) res,
        has_function_privilege('public', p.oid, 'EXECUTE') pub, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt
        from pg_proc p where p.oid = ${k.fn}::regprocedure`);
      expect(r, k.fn).toMatchObject({ v: 's', d: false, cfg: 'search_path=objects, pg_catalog, pg_temp', pub: false, app: false, cmt: false });
      expect(String(r['res']), k.fn).toBe(k.fn.startsWith('objects.publication_frozen') ? 'record' : 'void');
    }
  });
  it('assert_usable answers every decision-active use without refusing; publication_frozen answers not frozen', async () => {
    for (const use of USE_KINDS) await sql`select objects.assert_usable('EVD', ${w.evd.id}::uuid, ${w.evd.version}::int, ${use})`.execute(h.su);
    await sql`select objects.assert_usable('FCT', gen_random_uuid(), 1, 'gate')`.execute(h.su);   // an unknown object: the stubs never look
    expect(await one(sql`select f.frozen, f.case_id from objects.publication_frozen('BRF', gen_random_uuid(), 1) f`)).toEqual({ frozen: false, case_id: null });
  });
  it('a use outside the vocabulary is refused in the class form (422)', async () => {
    const r = await refusal(sql`select objects.assert_usable('EVD', gen_random_uuid(), 1, 'briefing')`.execute(h.su));
    expect(r.message).toMatch(/^object use rejected \(use\): briefing is not a decision-active use/);
    expect(r.status).toBe(422);
  });
  it('the refusal nouns are mapped centrally (B50 §0 rows at the head of B9_REFUSALS)', () => {
    const s = (m: string, code: string) => asObservationRefusal(Object.assign(new Error(m), { code }), 'harness')?.getStatus() ?? null;
    expect(s('object use rejected (unknown_object): EVD x v1 is not recorded in this domain', '23503')).toBe(404);
    expect(s('object use rejected (incomplete_header): FCT x v1 lacks confidence for decision_option', '22023')).toBe(409);
    expect(s('object use rejected (unfit): FCT x v2 rests on incomplete lineage', '22023')).toBe(409);
    expect(s('object use rejected (use): x is not a decision-active use', '22023')).toBe(422);
    expect(s('publication rejected (held): its source briefing x v1 is frozen by correction case y; it is approved once the case closes', '22023')).toBe(409);
    expect(s('export rejected (held): evidence x v1 in the approved scope is frozen by correction case y', '22023')).toBe(409);
    // the rows they sit beside keep their answers
    expect(s('publication rejected (state): version 1 is drafted; only an approved version is delivered', '22023')).toBe(409);
    expect(s('export rejected: the archive digest is sha-256 hex', '22023')).toBe(422);
  });
});

describe('§0.2 · the shared ports call the hooks once, everything else as before', () => {
  it('each port: one definition, SECURITY DEFINER, its search path, its grants — and exactly one call of each hook it uses, marked B50 §0', async () => {
    const before: Record<string, { cfg: string; app: boolean; v: string }> = {
      'decision.derive_option': { cfg: 'search_path=decision, simulation, twin, prediction, objects, pg_catalog, pg_temp', app: true, v: 's' },
      'executive.approve_publication': { cfg: 'search_path=executive, identity, objects, observation, ctx, public, pg_catalog, pg_temp', app: false, v: 'v' },
      'executive.deliver_publication': { cfg: 'search_path=executive, identity, observation, ctx, public, pg_catalog, pg_temp', app: false, v: 'v' },
      'retention.record_export_package': { cfg: 'search_path=retention, observation, objects, ctx, public, pg_catalog, pg_temp', app: false, v: 'v' },
      'decision.gate_act': { cfg: 'search_path=decision, executive, observation, ctx, public, pg_catalog, pg_temp', app: false, v: 'v' },
    };
    for (const port of HOOKED_PORTS) {
      const name = port.fn.slice(0, port.fn.indexOf('('));
      const n = await one(sql`select count(*)::int n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname || '.' || p.proname = ${name}`);
      expect(n['n'], name).toBe(1);
      const r = await one(sql`select pg_get_functiondef(p.oid) def, p.prosecdef d, p.provolatile v, array_to_string(p.proconfig, ',') cfg,
        has_function_privilege('public', p.oid, 'EXECUTE') pub, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt
        from pg_proc p where p.oid = ${port.fn}::regprocedure`);
      expect({ d: r['d'], v: r['v'], cfg: r['cfg'], pub: r['pub'], app: r['app'], cmt: r['cmt'] }, name)
        .toEqual({ d: true, v: before[name]!.v, cfg: before[name]!.cfg, pub: false, app: before[name]!.app, cmt: true });
      const def = String(r['def']);
      expect(def.match(/objects\.assert_usable\(/g)?.length, `${name}: assert_usable`).toBe(1);
      expect(def.match(/objects\.publication_frozen\(/g)?.length ?? 0, `${name}: publication_frozen`).toBe(port.frozen ? 1 : 0);
      expect(def, `${name}: the use`).toContain(`'${port.use}'`);
      expect(def, `${name}: marked`).toContain('B50 §0');
    }
  });
});

describe('§0.2 · the positive paths through the product, and the calls live', () => {
  it('derive_option: options set and the version proposed through the decision service (each citation passes the inert hook)', async () => {
    const { pkg, v } = await c.fullDraft();
    const p = await c.propose(pkg, v);
    expect(p.proposal.versionDigest).toMatch(/^[0-9a-f]{64}$/);
    const opts = (await c.get(pkg)).package.versions.find((x) => x['version'] === v)!.options;
    expect(opts.map((o) => o['key']).sort()).toEqual(['reroute', 'status-quo']);
  });
  it('gate_act: an independent reviewer marks a proposed version decision-ready (the citations pass the inert hook)', async () => {
    const P = await c.proposed();
    const ok = (await gate(analyst, P.pkg, P.v, 'ready', { rationale: 'Complete: options and citations read (B50 prelude harness)', informationPackageDigest: await infoDigest(P.pkg, P.v) })).gate;
    expect(ok).toMatchObject({ action: 'ready', event: 'version.ready' });
  });
  it('a refusing §HD hook refuses an option with its own words (409); restored, the option is set', async () => {
    const { pkg, v } = await (async () => { const d = await c.declare({ decisionObjectId: w.decisionId, title: 'B50 prelude probe package', statement: 'the hook is called at set_option', owner: w.owner.principalId });
      return { pkg: d.package.packageId, v: (await c.open(d.package.packageId)).version.version }; })();
    const payload = { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: w.evd.id, version: w.evd.version }] };
    await withProbe('_header_usable', 'incomplete_header', async () => {
      const r = await refusal(c.option(pkg, v, payload));
      expect(r.message).toMatch(/object use rejected \(incomplete_header\): probe SIM .* for decision_option/);
      expect(r.status).toBe(409);
    });
    expect((await c.option(pkg, v, payload)).option.optionId).toBeTruthy();
  });
  it('a refusing §PV hook refuses decision-ready with its own words (409); the other gate acts never ask; restored, ready is marked', async () => {
    const P = await c.proposed();
    await withProbe('_lineage_usable', 'unfit', async () => {
      const r = await refusal(gate(analyst, P.pkg, P.v, 'ready', { rationale: 'Probe: the citations are asked (B50 prelude harness)', informationPackageDigest: await infoDigest(P.pkg, P.v) }));
      expect(r.message).toMatch(/object use rejected \(unfit\): probe (SIM|EVD) .* for gate/);
      expect(r.status).toBe(409);
      expect((await gate(analyst, P.pkg, P.v, 'review', { rationale: 'A reading is recorded whatever the package cites (B50 prelude)' })).gate).toMatchObject({ action: 'review' });
    });
    const ok = (await gate(analyst, P.pkg, P.v, 'ready', { rationale: 'Complete after the probe (B50 prelude harness)', informationPackageDigest: await infoDigest(P.pkg, P.v) })).gate;
    expect(ok).toMatchObject({ action: 'ready', event: 'version.ready' });
  });
});
