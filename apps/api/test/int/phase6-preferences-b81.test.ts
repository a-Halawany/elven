/**
 * CP-6 B81 §LY-G (migration 0119_b81_x_lyg) — THE PERSON'S OWN LAYOUT PREFERENCES (density, the saved layout per composition), on a real
 * database through the real pipeline, PDP, ports and controllers (F-P7-E-04: UX-14-002, UX-14-004, DEN-01…03, UX-ADR-013; the harness
 * evidence of the acceptance rows UX-14-006 / UX-19-006 — their non-demonstration recording path is B111, then H3).
 *
 * The fixture classes: POSITIVE (save → read → supersede; one series per composition; the PLATFORM preference of the admin workspace; a
 * reset to the default), UNCHANGED (the same content answers `unchanged`, no version), NEGATIVE (an unknown key, a non-approved grid, an
 * unknown region, a span outside 1–12, a clipping overflow, an unknown density, a malformed composition), THE BOUNDARY (UX-14-004: a saved
 * layout never hides context, primary, evidence, action, status or authority — only the inspector collapses), STALE (a save that read an
 * older version → `(stale)`, nothing overwritten), UNAUTHORIZED (an agent; a principal without a role; another principal's preference —
 * refused at the port and invisible under RLS; saving on another's behalf), CROSS-TENANT (another tenant's scope is denied at the PEP),
 * PRESENTATION ONLY (a save changes no role binding and writes nothing but its own row and its ledger event), REPLAY (append-only, the
 * version chain, the ledger, the audited path) and RECONCILE (every version records its layout contract; the read says whether it is the
 * current one).
 *
 * Every tenant, persona and preference is SYNTHETIC. This proves CONSTRUCTION; demonstrated operation is the act's density scene; real
 * acceptance (H3) is never claimed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { PreferencesDomainController, PreferencesPlatformController } from '../../src/shell/preferences/preferences.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let dc: PreferencesDomainController; let pc: PreferencesPlatformController;
let T = ''; let D = ''; let T2 = ''; let D2 = '';
const RUN = uuidv7().slice(-6);
let executive: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let agent: AuthenticatedPrincipal;
let nobody: AuthenticatedPrincipal; let platform: AuthenticatedPrincipal;

function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'navigation', action,
    side_effect_class: action.endsWith('read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: 'PRF', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b81-lyg',
  } as unknown as Envelope;
}
const rq = (p: AuthenticatedPrincipal, action: string, t: string | null = T, d: string | null = D) =>
  ({ eyeEnvelope: env(p, action, t === null ? 'PLATFORM' : 'DOMAIN', t, d), eyePrincipal: p }) as never;
type Refusal = { status: number | null; message: string; code: string | null };
const refusal = async (p: Promise<unknown>): Promise<Refusal> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as Row)['message'] ?? e.message), code: null };
  return { status: null, message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code ?? null };
};
const refused = async (p: Promise<unknown>, re: RegExp) => { const r = await refusal(p); expect(r.message).toMatch(re); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

type SaveOut = { preference: Row; receipt: Row };
type ReadOut = { preferences: Row; receipt: Row };
const save = (as: AuthenticatedPrincipal, payload: Row, t: string | null = T, d: string | null = D) =>
  (t === null ? pc.save(rq(as, 'shell.preferences.save', null, null), { payload }) : dc.save(rq(as, 'shell.preferences.save', t, d), t, d as string, { payload })) as unknown as Promise<SaveOut>;
const read = (as: AuthenticatedPrincipal, payload: Row = {}, t: string | null = T, d: string | null = D) =>
  (t === null ? pc.read(rq(as, 'shell.preferences.read', null, null), { payload }) : dc.read(rq(as, 'shell.preferences.read', t, d), t, d as string, { payload })) as unknown as Promise<ReadOut>;
type CompositionRead = { composition: string; current: Row; versions: number; history: Row[] };
const compositionsOf = (o: ReadOut) => (o.preferences['compositions'] as CompositionRead[]);
const countOf = async (p: AuthenticatedPrincipal) => (await one(sql`select count(*)::int n from shell.preferences where principal_id = ${p.principalId}::uuid`))['n'] as number;

/** A raw read under the PIPELINE's established context of `as` (the commit role, its bound principal) — RLS seen as the runtime sees it. */
async function underContext<R>(as: AuthenticatedPrincipal, fn: (tx: Parameters<Parameters<typeof h.pipeline.consequentialRead>[3]>[0]) => Promise<R>): Promise<R> {
  const action = 'shell.preferences.read';
  const out = await h.pipeline.consequentialRead(env(as, action, 'DOMAIN', T, D), as, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'PRF', objectId: null },
    (tx) => tx, async (tx) => fn(tx));
  return out.result;
}

async function person(label: string, kind: 'human' | 'agent', scope: Scope, t: string | null, d: string | null, roles: Array<{ role: string; scope: Scope }>): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b81-lyg-${label}-${RUN} (SYNTHETIC)`}, ${`b81lyg-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : t, domainId: r.scope === 'DOMAIN' ? d : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: scope, homeTenantId: t, homeDomainId: d, bindings });
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  dc = h.app.get(PreferencesDomainController); pc = h.app.get(PreferencesPlatformController);
  executive = await h.humanWithSession(['executive', 'decision_authority'], 'lyg-exec');
  analyst = await h.humanWithSession(['domain_analyst'], 'lyg-analyst');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'lyg-tadmin', 'TENANT');
  nobody = await h.humanWithSession([], 'lyg-nobody');
  agent = await person('agent', 'agent', 'DOMAIN', T, D, [{ role: 'domain_analyst', scope: 'DOMAIN' }]);
  platform = await person('platform', 'human', 'PLATFORM', null, null, [{ role: 'platform_admin', scope: 'PLATFORM' }]);
  T2 = uuidv7(); D2 = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${T2}::uuid, ${'b81-lyg-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T2}::uuid, ${'b81-lyg-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
}, 600_000);
afterAll(async () => { await h?.close(); });

const LAYOUT = { viewport_class: 'BP-04', grid: { columns: 12 }, regions: { primary: { span: 8 }, evidence: { span: 4, state: 'open' }, inspector: { state: 'collapsed' } },
                 panel: 'evidence', rail: 'expanded', focus_region: 'primary', overflow: 'reflow' };

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('§LY.2/3 · save → read → supersede (UX-14-002, DEN-01…03): append-only versions, the person\'s own', () => {
  let v1: Row; let v2: Row;

  it('POSITIVE: v1 — the person chooses STRATEGIC density for the default composition (from version 0)', async () => {
    const out = await save(executive, { composition: 'default', expectedVersion: 0, density: 'DEN-01' });
    v1 = out.preference;
    expect(v1).toMatchObject({ composition: 'default', version: 1, supersedes: null, density: 'DEN-01', layout: {}, scope: 'DOMAIN', tenant_id: T, domain_id: D,
      contract: 'b81-lyg-layout-1', unchanged: false });
    expect(String(v1['digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect(out.receipt['auditSeq']).toBeTypeOf('number');
  });

  it('CORRECTION: v2 supersedes v1 with a saved layout (viewport class, grid, spans, panel, rail, focus region, overflow); v1 stays', async () => {
    v2 = (await save(executive, { composition: 'default', expectedVersion: 1, density: 'DEN-01', layout: LAYOUT })).preference;
    expect(v2).toMatchObject({ version: 2, supersedes: v1['preference_id'], density: 'DEN-01', layout: LAYOUT });
    const chain = await rows(sql`select version, supersedes::text, density, layout ->> 'panel' as panel from shell.preferences where principal_id = ${executive.principalId}::uuid and composition = 'default' order by version`);
    expect(chain).toEqual([{ version: 1, supersedes: null, density: 'DEN-01', panel: null }, { version: 2, supersedes: v1['preference_id'], density: 'DEN-01', panel: 'evidence' }]);
  });

  it('UNCHANGED: the same content again answers `unchanged` with the current version — no new version', async () => {
    const again = (await save(executive, { composition: 'default', expectedVersion: 2, density: 'DEN-01', layout: LAYOUT })).preference;
    expect(again).toMatchObject({ version: 2, unchanged: true, preference_id: v2['preference_id'] });
    expect(await countOf(executive)).toBe(2);
  });

  it('READ: the current preference per composition, its version count, its history (newest first), and the contract it was saved under', async () => {
    const out = await read(executive, { composition: 'default', history: 5 });
    const cs = compositionsOf(out);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ composition: 'default', versions: 2 });
    expect(cs[0]!.current).toMatchObject({ preference_id: v2['preference_id'], version: 2, density: 'DEN-01', contract: 'b81-lyg-layout-1', current_contract: true });
    expect(cs[0]!.history.map((x) => x['version'])).toEqual([2, 1]);
    expect(out.preferences['contract']).toBe('b81-lyg-layout-1');
    expect(String(out.preferences['claim'])).toMatch(/never what they mean, who may act or what an act does/);
  });

  it('STALE: a save that read version 1 after v2 exists is refused `(stale)` — and nothing was written', async () => {
    await refused(save(executive, { composition: 'default', expectedVersion: 1, density: 'DEN-03' }), /^layout preference rejected \(stale\): your default preference is at version 2; this save read version 1/);
    expect(await countOf(executive)).toBe(2);
  });

  it('one series per composition: an operations-room composition at INSPECTION density keeps its own chain; a reset to the default is a new version', async () => {
    const room = (await save(executive, { composition: 'home.operations-room', expectedVersion: 0, density: 'DEN-03', layout: { viewport_class: 'BP-05', panel: 'inspector' } })).preference;
    expect(room).toMatchObject({ composition: 'home.operations-room', version: 1, density: 'DEN-03' });
    const reset = (await save(executive, { composition: 'home.operations-room', expectedVersion: 1, density: null, layout: {} })).preference;
    expect(reset).toMatchObject({ version: 2, density: null, layout: {}, supersedes: room['preference_id'] });
    expect(compositionsOf(await read(executive)).map((c) => [c.composition, c.current['version'], c.current['density']])).toEqual([['default', 2, 'DEN-01'], ['home.operations-room', 2, null]]);
  });

  it('a TENANT-homed principal saves in the domain it works in; PLATFORM: the admin workspace\'s preference has no tenant and no domain', async () => {
    const t = (await save(tenantAdmin, { composition: 'default', expectedVersion: 0, density: 'DEN-02' })).preference;
    expect(t).toMatchObject({ version: 1, scope: 'DOMAIN', tenant_id: T, domain_id: D, density: 'DEN-02' });
    const a = (await save(platform, { composition: 'default', expectedVersion: 0, density: 'DEN-03' }, null, null)).preference;
    expect(a).toMatchObject({ version: 1, scope: 'PLATFORM', tenant_id: null, domain_id: null, density: 'DEN-03' });
    expect(compositionsOf(await read(platform, {}, null, null)).map((c) => [c.composition, c.current['density']])).toEqual([['default', 'DEN-03']]);
  });
});

describe('§LY.2 · NEGATIVE — the port validates key by key; a layout names presentation, never a command', () => {
  const at = (layout: Row) => save(analyst, { composition: 'default', expectedVersion: 0, layout });
  it('an unknown key (a would-be command or role) is refused, never stored', async () => {
    await refused(at({ command: 'decision.package.approve' }), /^layout preference rejected \(layout\): the layout carries no key command/);
    await refused(at({ regions: { authority: { span: 4, role: 'decision_approver' } } }), /^layout preference rejected \(layout\): the authority region carries no key role/);
  });
  it('a grid other than the approved 12 columns, an unknown region, a span outside 1–12, an unknown class, a clipping overflow', async () => {
    await refused(at({ grid: { columns: 10 } }), /^layout preference rejected \(layout\): the grid is the approved 12-column grid/);
    await refused(at({ grid: { columns: '12' } }), /^layout preference rejected \(layout\): the grid is the approved 12-column grid/);
    await refused(at({ regions: { sidebar: { span: 3 } } }), /^layout preference rejected \(layout\): sidebar is not a region/);
    await refused(at({ regions: { primary: { span: 13 } } }), /^layout preference rejected \(layout\): the primary region spans 1–12 columns/);
    await refused(at({ viewport_class: 'BP-06' }), /^layout preference rejected \(layout\): the viewport class is one of BP-01…BP-05/);
    await refused(at({ overflow: 'clip' }), /^layout preference rejected \(layout\): the overflow policy is reflow or scroll_region \(content is never clipped\)/);
    await refused(at({ panel: 'history' }), /^layout preference rejected \(layout\): the supporting panel is evidence or inspector/);
  });
  it('an unknown density and a malformed composition are refused at the route (422); the port refuses an unknown density too', async () => {
    const r = await refused(save(analyst, { composition: 'default', expectedVersion: 0, density: 'compact' }), /^layout preference rejected \(density\)/);
    expect(r.status).toBe(422);
    const c = await refused(save(analyst, { composition: 'Default Page', expectedVersion: 0 }), /^layout preference rejected \(composition\)/);
    expect(c.status).toBe(422);
    const v = await refused(save(analyst, { composition: 'default', expectedVersion: -1 }), /^layout preference rejected \(version\)/);
    expect(v.status).toBe(422);
    const action = 'shell.preferences.save';
    const msg = await h.pipeline.write(env(analyst, action, 'DOMAIN', T, D), analyst, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'PRF', objectId: null }, (tx) => tx,
      async (tx) => { await sql`select shell.save_preferences(${uuidv7()}::uuid, ${T}::uuid, ${D}::uuid, 'default', 0, 'DEN-04', '{}'::jsonb, ${analyst.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
        return { result: {}, targetType: 'PRF', targetId: null, targetVersion: null, outboxEvent: null }; })
      .then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(msg).toMatch(/^layout preference rejected \(density\): DEN-04 is not a density/);
    expect(await countOf(analyst)).toBe(0);
  });
});

describe('§LY.2 · THE BOUNDARY (UX-14-004, UX-ADR-013): adaptation may defer secondary detail, never authority, state or evidence', () => {
  for (const region of ['authority', 'status', 'context', 'primary', 'action', 'evidence']) {
    it(`collapsing the ${region} region is refused \`(region)\` — nothing stored`, async () => {
      await refused(save(analyst, { composition: 'decisions.packages', expectedVersion: 0, layout: { regions: { [region]: { state: 'collapsed' } } } }),
        new RegExp(`^layout preference rejected \\(region\\): a saved layout never hides the ${region} region — only the inspector may be collapsed`));
    });
  }
  it('the inspector (secondary detail) may be saved collapsed; the table refuses a hidden protected region even to the superuser', async () => {
    const ok = (await save(analyst, { composition: 'decisions.packages', expectedVersion: 0, layout: { regions: { inspector: { state: 'collapsed' }, authority: { state: 'open' } } } })).preference;
    expect(ok).toMatchObject({ version: 1, layout: { regions: { inspector: { state: 'collapsed' }, authority: { state: 'open' } } } });
    await expect(sql`insert into shell.preferences (preference_id, principal_id, scope, tenant_id, domain_id, composition, version, density, layout, contract, digest, correlation_id)
      values (${uuidv7()}::uuid, ${analyst.principalId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'planted', 1, null, '{"regions":{"authority":{"state":"collapsed"}}}'::jsonb, 'b81-lyg-layout-1', ${'0'.repeat(64)}, ${uuidv7()}::uuid)`.execute(h.su))
      .rejects.toThrow(/check constraint/i);
  });
});

describe('§LY.2/3 · UNAUTHORIZED — another principal never reads it; an agent keeps none', () => {
  it('another principal\'s read lists only its OWN preferences (none of the executive\'s)', async () => {
    const cs = compositionsOf(await read(analyst));
    expect(cs.map((c) => c.composition)).toEqual(['decisions.packages']);
  });
  it('the port refuses a read of another principal\'s preferences `(actor)` even inside the same domain; RLS shows the runtime none of its rows', async () => {
    const msg = await underContext(analyst, async (tx) => {
      await sql`savepoint other_principal`.execute(tx);
      return sql`select shell.preferences_of(${executive.principalId}::uuid, ${T}::uuid, ${D}::uuid, null, 5) as r`.execute(tx).then(() => 'no error',
        async (e: unknown) => { await sql`rollback to savepoint other_principal`.execute(tx); return e instanceof Error ? e.message : String(e); });
    });
    expect(msg).toMatch(/^layout preference rejected \(actor\): a principal reads only its own layout preferences/);
    const seen = await underContext(analyst, async (tx) => (await sql<{ n: number }>`select count(*)::int n from shell.preferences where principal_id = ${executive.principalId}::uuid`.execute(tx)).rows[0]!.n);
    expect(seen).toBe(0);
    const own = await underContext(executive, async (tx) => (await sql<{ n: number }>`select count(*)::int n from shell.preferences where principal_id = ${executive.principalId}::uuid`.execute(tx)).rows[0]!.n);
    expect(own).toBe(4);
    const ev = await underContext(analyst, async (tx) => (await sql<{ n: number }>`select count(*)::int n from shell.events where principal_id = ${executive.principalId}::uuid and subject_kind = 'layout_preference'`.execute(tx)).rows[0]!.n);
    expect(ev).toBe(0);
  });
  it('the port refuses saving ON ANOTHER\'S BEHALF `(actor)` (the actor is the bound principal)', async () => {
    const action = 'shell.preferences.save';
    const msg = await h.pipeline.write(env(analyst, action, 'DOMAIN', T, D), analyst, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'PRF', objectId: null }, (tx) => tx,
      async (tx) => { await sql`select shell.save_preferences(${uuidv7()}::uuid, ${T}::uuid, ${D}::uuid, 'default', 2, 'DEN-03', '{}'::jsonb, ${executive.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
        return { result: {}, targetType: 'PRF', targetId: null, targetVersion: null, outboxEvent: null }; })
      .then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(msg).toMatch(/^layout preference rejected \(actor\): a preference is saved by its own principal/);
    expect(await countOf(executive)).toBe(4);
  });
  it('an AGENT holding a domain role passes the PDP but the port refuses it `(actor)`; a principal with no role is denied at the PEP', async () => {
    await refused(save(agent, { composition: 'default', expectedVersion: 0, density: 'DEN-03' }), /^layout preference rejected \(actor\): a layout preference is a named, active human's own/);
    const r = await refusal(save(nobody, { composition: 'default', expectedVersion: 0, density: 'DEN-03' }));
    expect(r.status).toBe(403);
    const rr = await refusal(read(nobody));
    expect(rr.status).toBe(403);
    expect(await one(sql`select count(*)::int n from shell.preferences where principal_id in (${agent.principalId}::uuid, ${nobody.principalId}::uuid)`)).toEqual({ n: 0 });
  });
  it('CROSS-TENANT and CROSS-SCOPE: another tenant\'s domain and the PLATFORM scope are denied at the PEP for a domain principal', async () => {
    expect((await refusal(save(analyst, { composition: 'default', expectedVersion: 0 }, T2, D2))).status).toBe(403);
    expect((await refusal(read(analyst, {}, T2, D2))).status).toBe(403);
    expect((await refusal(save(analyst, { composition: 'default', expectedVersion: 0 }, null, null))).status).toBe(403);
  });
});

describe('§LY.2 · PRESENTATION ONLY — a preference changes how things are shown, never who may act', () => {
  it('a save changes no role binding and writes only its own row and its ledger event (plus the audited path)', async () => {
    const before = await one(sql`select (select count(*)::int from identity.role_bindings where principal_id = ${analyst.principalId}::uuid) as b,
      (select count(*)::int from shell.events where principal_id = ${analyst.principalId}::uuid) as e, (select count(*)::int from shell.preferences where principal_id = ${analyst.principalId}::uuid) as p`);
    const out = await save(analyst, { composition: 'default', expectedVersion: 0, density: 'DEN-03' });
    const after = await one(sql`select (select count(*)::int from identity.role_bindings where principal_id = ${analyst.principalId}::uuid) as b,
      (select count(*)::int from shell.events where principal_id = ${analyst.principalId}::uuid) as e, (select count(*)::int from shell.preferences where principal_id = ${analyst.principalId}::uuid) as p`);
    expect(after).toEqual({ b: before['b'], e: (before['e'] as number) + 1, p: (before['p'] as number) + 1 });
    const aud = await rows(sql`select action from audit.audit_events where audit_seq = ${out.receipt['auditSeq'] as number} and tenant_id = ${T}::uuid`);
    expect(aud.map((x) => x['action'])).toEqual(['shell.preferences.save']);
  });
});

describe('§LY.1 · REPLAY — the table is append-only and the ledger records every save', () => {
  it('a preference is never updated or deleted; FORCE RLS; no write grant; the port is eye_commit\'s alone', async () => {
    const id = (await one(sql`select preference_id::text id from shell.preferences where principal_id = ${executive.principalId}::uuid limit 1`))['id'] as string;
    await expect(sql`update shell.preferences set density = 'DEN-03' where preference_id = ${id}::uuid`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
    await expect(sql`delete from shell.preferences where preference_id = ${id}::uuid`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
    const r = await one(sql`select c.relrowsecurity as rls, c.relforcerowsecurity as force, has_table_privilege('eye_app', 'shell.preferences', 'INSERT') as app_ins,
      has_table_privilege('eye_commit', 'shell.preferences', 'INSERT') as cmt_ins, has_table_privilege('eye_commit', 'shell.preferences', 'UPDATE') as cmt_upd,
      has_function_privilege('eye_app', 'shell.save_preferences(uuid, uuid, uuid, text, int, text, jsonb, uuid, uuid)', 'EXECUTE') as app_save,
      has_function_privilege('eye_commit', 'shell.save_preferences(uuid, uuid, uuid, text, int, text, jsonb, uuid, uuid)', 'EXECUTE') as cmt_save,
      has_function_privilege('public', 'shell.save_preferences(uuid, uuid, uuid, text, int, text, jsonb, uuid, uuid)', 'EXECUTE') as pub_save,
      has_function_privilege('eye_app', 'shell.preferences_of(uuid, uuid, uuid, text, int)', 'EXECUTE') as app_read
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'shell' and c.relname = 'preferences'`);
    expect(r).toEqual({ rls: true, force: true, app_ins: false, cmt_ins: false, cmt_upd: false, app_save: false, cmt_save: true, pub_save: false, app_read: true });
    const definer = await rows(sql`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'shell' and p.proname in ('save_preferences', 'preferences_of') order by p.proname`);
    for (const d of definer) { expect(d['prosecdef']).toBe(true); expect(String(d['proconfig'])).toMatch(/search_path=.*pg_catalog, pg_temp/); }
  });
  it('the ledger: one `shell.preferences.saved` per version (none for an unchanged save), naming the version it supersedes, the digest and the contract', async () => {
    const ev = await rows(sql`select e.version, e.details ->> 'composition' as c, e.details ->> 'density' as d, e.details ->> 'supersedes' as sup, e.details ->> 'digest' = s.digest as digest_ok, e.details ->> 'contract' as contract
      from shell.events e join shell.preferences s on s.preference_id = e.subject_id
      where e.principal_id = ${executive.principalId}::uuid and e.event = 'shell.preferences.saved' and e.subject_kind = 'layout_preference' order by e.occurred_at`);
    expect(ev.map((x) => [x['c'], x['version'], x['d'], x['digest_ok'], x['contract']])).toEqual([
      ['default', 1, 'DEN-01', true, 'b81-lyg-layout-1'], ['default', 2, 'DEN-01', true, 'b81-lyg-layout-1'],
      ['home.operations-room', 1, 'DEN-03', true, 'b81-lyg-layout-1'], ['home.operations-room', 2, null, true, 'b81-lyg-layout-1']]);
    expect(ev[0]!['sup']).toBeNull();
    expect(ev[1]!['sup']).not.toBeNull();
  });
  it('the governed path: each save is an audited write of shell.preferences.save; each read an audited read', async () => {
    const a = await rows(sql`select action from audit.audit_events where action in ('shell.preferences.save', 'shell.preferences.read') and tenant_id = ${T}::uuid group by action order by action`);
    expect(a.map((x) => x['action'])).toEqual(['shell.preferences.read', 'shell.preferences.save']);
  });
});
