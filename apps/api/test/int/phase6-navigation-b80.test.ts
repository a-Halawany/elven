/**
 * CP-6 B80 §SH (migration 0118_b80_x_sh) — THE SHELL'S NAVIGATION STATE AND THE DEEP LINK'S AS-OF READ, on a real database through the real
 * pipeline, PDP, ports and controllers (F-P7-E-01: PR-05-002/003/005, UX-09-003, UX-11-002/005, UX-15-002/003/004/005, PAT-25, PAT-26;
 * the harness evidence of the acceptance rows PR-05-006, AT-05, UX-11-006, UX-15-006 — their non-demonstration recording path is B111, then H3).
 *
 * AT-05's fixture classes: POSITIVE (save → read → supersede; the PLATFORM state of the admin workspace; the as-of state between two
 * events), NEGATIVE (an unknown key, a route outside the workspace, a foreign return path, the admin workspace in a domain), STALE (a save
 * that read an older version → `(stale)`, nothing overwritten), UNAUTHORIZED (an agent; a principal without a role; another principal's
 * state — refused at the port and invisible under RLS), CROSS-TENANT (another tenant's warning answers exactly as a missing one),
 * CORRECTION (a new version supersedes, the old one stays), REPLAY (the version chain and the ledger reconstruct every save; the as-of
 * read replays the warning's own event history), and THE FAULT EXERCISE (an instant before the first event, a future instant, a malformed
 * link: each refused in its class, with no metadata).
 *
 * The warnings read here are PLANTED by the superuser as the prediction ports would have written them (warnings_current + its events at
 * chosen instants — stated; the raise path is phase 4's and is not under test). Every tenant, persona and record is SYNTHETIC. This proves
 * CONSTRUCTION; demonstrated operation is the act's deep-link scene; real acceptance (H3) is never claimed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { NavigationDomainController, NavigationPlatformController } from '../../src/shell/navigation/navigation.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let dc: NavigationDomainController; let pc: NavigationPlatformController;
let T = ''; let D = ''; let T2 = ''; let D2 = '';
const RUN = uuidv7().slice(-6);
let manager: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let agent: AuthenticatedPrincipal;
let nobody: AuthenticatedPrincipal; let platform: AuthenticatedPrincipal; let forecaster: AuthenticatedPrincipal;

function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'navigation', action,
    side_effect_class: action.endsWith('read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: 'NAV', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b80-sh',
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

type NavOut = { navigation: Row; receipt: Row };
const save = (as: AuthenticatedPrincipal, payload: Row, t: string | null = T, d: string | null = D) =>
  (t === null ? pc.save(rq(as, 'shell.navigation.save', null, null), { payload }) : dc.save(rq(as, 'shell.navigation.save', t, d), t, d as string, { payload })) as unknown as Promise<NavOut>;
const read = (as: AuthenticatedPrincipal, payload: Row = {}, t: string | null = T, d: string | null = D) =>
  (t === null ? pc.read(rq(as, 'shell.navigation.read', null, null), { payload }) : dc.read(rq(as, 'shell.navigation.read', t, d), t, d as string, { payload })) as unknown as Promise<NavOut>;
const asOf = (as: AuthenticatedPrincipal, warningId: string, at: unknown) =>
  dc.warningAsOf(rq(as, 'prediction.read'), T, D, warningId, { payload: { at } }) as unknown as Promise<{ warning: Row; receipt: Row }>;
type WorkspaceRead = { workspace: string; current: Row; versions: number; history: Row[] };
const workspacesOf = (o: NavOut) => (o.navigation['workspaces'] as WorkspaceRead[]);

/** A raw read under the PIPELINE's established context of `as` (the commit role, its bound principal) — RLS seen as the runtime sees it. */
async function underContext<T>(as: AuthenticatedPrincipal, fn: (tx: Parameters<Parameters<typeof h.pipeline.consequentialRead>[3]>[0]) => Promise<T>): Promise<T> {
  const action = 'shell.navigation.read';
  const out = await h.pipeline.consequentialRead(env(as, action, 'DOMAIN', T, D), as, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'NAV', objectId: null },
    (tx) => tx, async (tx) => fn(tx));
  return out.result;
}

async function person(label: string, kind: 'human' | 'agent', scope: Scope, t: string | null, d: string | null, roles: Array<{ role: string; scope: Scope }>): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b80-sh-${label}-${RUN} (SYNTHETIC)`}, ${`b80sh-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : t, domainId: r.scope === 'DOMAIN' ? d : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: scope, homeTenantId: t, homeDomainId: d, bindings });
}

/** A warning AS THE PREDICTION PORTS WOULD HAVE WRITTEN IT (planted by the superuser — stated): its current row and its events at chosen instants. */
async function plantWarning(t: string, d: string, owner: string, title: string, events: Array<{ event: string; at: string; details?: Row }>, current: { state: string; contextVersion: number; level: string }): Promise<string> {
  const wid = uuidv7();
  await sql`insert into prediction.warnings_current (
      warning_id, scope, tenant_id, domain_id, title, evidence, consequence, confidence,
      response_window_opens_at, response_window_closes_at, routed_to, raised_by, state, correlation_id, raised_as_of, timing_mode,
      consequence_class, consequence_class_source, level, level_version, urgency, op_class)
    values (${wid}::uuid, 'DOMAIN', ${t}::uuid, ${d}::uuid, ${title}, '[{"kind":"fixture"}]'::jsonb, 'rebook the corridor shipments before the window closes (SYNTHETIC)', 0.7,
      ${events[0]!.at}::timestamptz, now() + interval '2 days', ${owner}::uuid, ${owner}::uuid, 'raised', ${uuidv7()}::uuid, ${events[0]!.at}::timestamptz, 'live',
      'C2', 'assumed', ${current.level}, 1, 'prompt', 'C2')`.execute(h.su);   // the level is derived at the raise and never rewritten (0061)
  for (const e of events) {
    await sql`insert into prediction.warning_events (event_id, scope, tenant_id, domain_id, warning_id, event, occurred_at, actor_principal_id, details, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${t}::uuid, ${d}::uuid, ${wid}::uuid, ${e.event}, ${e.at}::timestamptz, ${owner}::uuid, ${JSON.stringify(e.details ?? {})}::jsonb, ${uuidv7()}::uuid)`.execute(h.su);
  }
  await sql`update prediction.warnings_current set state = ${current.state}, context_version = ${current.contextVersion},
              acknowledged_at = case when ${current.state} = 'acknowledged' then now() end, acknowledged_by = case when ${current.state} = 'acknowledged' then ${owner}::uuid end
             where warning_id = ${wid}::uuid`.execute(h.su);
  return wid;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  dc = h.app.get(NavigationDomainController); pc = h.app.get(NavigationPlatformController);
  manager = h.manager;
  analyst = await h.humanWithSession(['domain_analyst'], 'sh-analyst');
  forecaster = await h.humanWithSession(['forecast_owner'], 'sh-forecaster');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'sh-tadmin', 'TENANT');
  nobody = await h.humanWithSession([], 'sh-nobody');
  agent = await person('agent', 'agent', 'DOMAIN', T, D, [{ role: 'collection_manager', scope: 'DOMAIN' }]);
  platform = await person('platform', 'human', 'PLATFORM', null, null, [{ role: 'platform_admin', scope: 'PLATFORM' }]);
  T2 = uuidv7(); D2 = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${T2}::uuid, ${'b80-sh-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T2}::uuid, ${'b80-sh-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
}, 600_000);
afterAll(async () => { await h?.close(); });

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('§SH.1 · save → read → supersede (PR-05-002, UX-11-002, UX-09-003): append-only versions, the principal\'s own', () => {
  const loc = (route: string, extra: Row = {}) => ({ route, title: 'Sources (SYNTHETIC)', section: 'sources', query: 'mode=replay', filters: { mode: 'replay' }, view: 'table', ...extra });
  let v1: Row; let v2: Row;

  it('POSITIVE: v1 saved from version 0 — the location, the selection, the work object (kind, id, version, as-of), the return path and its focus, recents', async () => {
    const out = await save(manager, { workspace: 'observation', expectedVersion: 0,
      location: loc('/observation/sources', { selection: [{ kind: 'source', id: h.fx.sourceId }], object: { kind: 'source', id: h.fx.sourceId, version: 1, as_of: '2026-10-17T09:00:00Z' } }),
      returnPath: '/decisions/attention?item=b80', focus: 'eye-main', recent: [{ route: '/observation/evidence', title: 'Evidence' }], favorites: [{ route: '/observation/sources', title: 'Sources' }] });
    v1 = out.navigation;
    expect(v1).toMatchObject({ workspace: 'observation', version: 1, supersedes: null, scope: 'DOMAIN', tenant_id: T, domain_id: D, return_path: '/decisions/attention?item=b80', focus_target: 'eye-main' });
    expect(String(v1['digest'])).toMatch(/^[0-9a-f]{64}$/);
    expect(out.receipt['auditSeq']).toBeTypeOf('number');
  });

  it('CORRECTION: v2 supersedes v1 (the save names the version it read); v1 stays — nothing is overwritten', async () => {
    v2 = (await save(manager, { workspace: 'observation', expectedVersion: 1, location: loc('/observation/evidence', { section: 'evidence' }), returnPath: null })).navigation;
    expect(v2).toMatchObject({ version: 2, supersedes: v1['state_id'] });
    const chain = await rows(sql`select version, supersedes::text, location ->> 'route' as route from shell.navigation_states where principal_id = ${manager.principalId}::uuid and workspace = 'observation' order by version`);
    expect(chain).toEqual([{ version: 1, supersedes: null, route: '/observation/sources' }, { version: 2, supersedes: v1['state_id'], route: '/observation/evidence' }]);
  });

  it('READ: the current state per workspace, its version count and its history (newest first)', async () => {
    const out = await read(manager, { workspace: 'observation', history: 5 });
    const ws = workspacesOf(out);
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ workspace: 'observation', versions: 2 });
    expect(ws[0]!.current).toMatchObject({ state_id: v2['state_id'], version: 2 });
    expect(ws[0]!.history.map((x) => x['version'])).toEqual([2, 1]);
    expect(String(out.navigation['claim'])).toMatch(/never a command/);
  });

  it('STALE: a save that read version 1 after v2 exists is refused `(stale)` — and nothing was written', async () => {
    await refused(save(manager, { workspace: 'observation', expectedVersion: 1, location: loc('/observation/quarantine') }), /^navigation state rejected \(stale\): the saved observation state is at version 2; this save read version 1/);
    expect(await one(sql`select count(*)::int n from shell.navigation_states where principal_id = ${manager.principalId}::uuid and workspace = 'observation'`)).toEqual({ n: 2 });
  });

  it('a second workspace keeps its own chain; a TENANT-homed principal saves in the domain it works in', async () => {
    const g = (await save(manager, { workspace: 'graph', expectedVersion: 0, location: { route: '/graph/memory' } })).navigation;
    expect(g).toMatchObject({ workspace: 'graph', version: 1 });
    const t = (await save(tenantAdmin, { workspace: 'decisions', expectedVersion: 0, location: { route: '/decisions/attention' } })).navigation;
    expect(t).toMatchObject({ workspace: 'decisions', version: 1, scope: 'DOMAIN', domain_id: D });
    const all = workspacesOf(await read(manager));
    expect(all.map((w) => w.workspace)).toEqual(['graph', 'observation']);
  });

  it('PLATFORM: the admin workspace\'s state is the platform principal\'s, with no tenant and no domain', async () => {
    const a = (await save(platform, { workspace: 'admin', expectedVersion: 0, location: { route: '/admin/audit', title: 'Audit Ledger' } }, null, null)).navigation;
    expect(a).toMatchObject({ workspace: 'admin', version: 1, scope: 'PLATFORM', tenant_id: null, domain_id: null });
    const r = workspacesOf(await read(platform, {}, null, null));
    expect(r.map((w) => [w.workspace, w.current['version']])).toEqual([['admin', 1]]);
  });
});

describe('§SH.1 · NEGATIVE — the port validates key by key; a location names a place, never a command', () => {
  it('an unknown key in the location (a would-be command) is refused, never stored', async () => {
    await refused(save(analyst, { workspace: 'observation', expectedVersion: 0, location: { route: '/observation', command: 'observation.source.transition' } }), /^navigation state rejected \(location\): the location carries no key command/);
  });
  it('a route outside the workspace, a foreign or traversing route, a scheme in the return path — refused in their classes', async () => {
    await refused(save(analyst, { workspace: 'observation', expectedVersion: 0, location: { route: '/graph/memory' } }), /^navigation state rejected \(location\): \/graph\/memory is not a location of the observation workspace/);
    await refused(save(analyst, { workspace: 'observation', expectedVersion: 0, location: { route: '//evil.example/observation' } }), /^navigation state rejected \(location\): the route is an absolute in-app path/);
    await refused(save(analyst, { workspace: 'observation', expectedVersion: 0, location: { route: '/observation/../admin' } }), /^navigation state rejected \(location\)/);
    await refused(save(analyst, { workspace: 'observation', expectedVersion: 0, location: { route: '/observation' }, returnPath: 'https://evil.example/' }), /^navigation state rejected \(return_path\)/);
    await refused(save(analyst, { workspace: 'observation', expectedVersion: 0, location: { route: '/observation', object: { kind: 'source', id: 'not-an-id' } } }), /^navigation state rejected \(location\): the work object names its id/);
  });
  it('the admin workspace is the PLATFORM\'s: saving it in a domain is refused; an unknown workspace is refused at the route', async () => {
    await refused(save(analyst, { workspace: 'admin', expectedVersion: 0, location: { route: '/admin' } }), /^navigation state rejected \(workspace\): the admin workspace is the PLATFORM's/);
    const r = await refused(save(analyst, { workspace: 'chat', expectedVersion: 0, location: { route: '/chat' } }), /^navigation state rejected \(workspace\)/);
    expect(r.status).toBe(422);
  });
});

describe('§SH.1 · UNAUTHORIZED — another principal never reads it; an agent keeps none (PR-05-003)', () => {
  it('another principal\'s read lists only its OWN states (none of the manager\'s)', async () => {
    const ws = workspacesOf(await read(analyst));
    expect(ws).toEqual([]);
  });
  it('the port refuses a read of another principal\'s state `(actor)` even inside the same domain; RLS shows the runtime none of its rows', async () => {
    const msg = await underContext(analyst, async (tx) => {
      await sql`savepoint other_principal`.execute(tx);   // the refusal aborts only its savepoint; the read's own evidence completes
      return sql`select shell.navigation_states_of(${manager.principalId}::uuid, ${T}::uuid, ${D}::uuid, null, 5) as r`.execute(tx).then(() => 'no error',
        async (e: unknown) => { await sql`rollback to savepoint other_principal`.execute(tx); return e instanceof Error ? e.message : String(e); });
    });
    expect(msg).toMatch(/^navigation state rejected \(actor\): a principal reads only its own navigation state/);
    const seen = await underContext(analyst, async (tx) => (await sql<{ n: number }>`select count(*)::int n from shell.navigation_states where principal_id = ${manager.principalId}::uuid`.execute(tx)).rows[0]!.n);
    expect(seen).toBe(0);
    const own = await underContext(manager, async (tx) => (await sql<{ n: number }>`select count(*)::int n from shell.navigation_states where principal_id = ${manager.principalId}::uuid`.execute(tx)).rows[0]!.n);
    expect(own).toBe(3);
    const ev = await underContext(analyst, async (tx) => (await sql<{ n: number }>`select count(*)::int n from shell.events where principal_id = ${manager.principalId}::uuid`.execute(tx)).rows[0]!.n);
    expect(ev).toBe(0);
  });
  it('the port refuses saving ON ANOTHER\'S BEHALF `(actor)` (the actor is the bound principal)', async () => {
    const action = 'shell.navigation.save';
    const msg = await h.pipeline.write(env(analyst, action, 'DOMAIN', T, D), analyst, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'NAV', objectId: null }, (tx) => tx,
      async (tx) => { await sql`select shell.save_navigation_state(${uuidv7()}::uuid, ${T}::uuid, ${D}::uuid, 'observation', 0, '{"route":"/observation"}'::jsonb, null, null, '[]'::jsonb, '[]'::jsonb, ${manager.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
        return { result: {}, targetType: 'NAV', targetId: null, targetVersion: null, outboxEvent: null }; })
      .then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(msg).toMatch(/^navigation state rejected \(actor\): a navigation state is saved by its own principal/);
  });
  it('an AGENT holding a domain role passes the PDP but the port refuses it `(actor)`; a principal with no role is denied at the PEP', async () => {
    await refused(save(agent, { workspace: 'observation', expectedVersion: 0, location: { route: '/observation' } }), /^navigation state rejected \(actor\): a navigation state is a named, active human's own/);
    const r = await refusal(save(nobody, { workspace: 'observation', expectedVersion: 0, location: { route: '/observation' } }));
    expect(r.status).toBe(403);
    expect(await one(sql`select count(*)::int n from shell.navigation_states where principal_id in (${agent.principalId}::uuid, ${nobody.principalId}::uuid)`)).toEqual({ n: 0 });
  });
  it('a domain principal cannot save a PLATFORM state (no platform binding — denied at the PEP)', async () => {
    const r = await refusal(save(analyst, { workspace: 'admin', expectedVersion: 0, location: { route: '/admin' } }, null, null));
    expect(r.status).toBe(403);
  });
});

describe('§SH.1 · REPLAY — the table is append-only and the ledger records every save', () => {
  it('a navigation state is never updated or deleted; FORCE RLS; no write grant; the port is eye_commit\'s alone', async () => {
    const id = (await one(sql`select state_id::text id from shell.navigation_states where principal_id = ${manager.principalId}::uuid limit 1`))['id'] as string;
    await expect(sql`update shell.navigation_states set focus_target = 'x' where state_id = ${id}::uuid`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
    await expect(sql`delete from shell.navigation_states where state_id = ${id}::uuid`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
    const r = await one(sql`select c.relrowsecurity as rls, c.relforcerowsecurity as force, has_table_privilege('eye_app', 'shell.navigation_states', 'INSERT') as app_ins,
      has_table_privilege('eye_commit', 'shell.navigation_states', 'INSERT') as cmt_ins,
      has_function_privilege('eye_app', 'shell.save_navigation_state(uuid, uuid, uuid, text, int, jsonb, text, text, jsonb, jsonb, uuid, uuid)', 'EXECUTE') as app_save,
      has_function_privilege('eye_commit', 'shell.save_navigation_state(uuid, uuid, uuid, text, int, jsonb, text, text, jsonb, jsonb, uuid, uuid)', 'EXECUTE') as cmt_save,
      has_function_privilege('eye_app', 'prediction.warning_as_of(uuid, timestamptz)', 'EXECUTE') as app_asof
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'shell' and c.relname = 'navigation_states'`);
    expect(r).toEqual({ rls: true, force: true, app_ins: false, cmt_ins: false, app_save: false, cmt_save: true, app_asof: true });
  });
  it('the ledger: one `shell.navigation.saved` per version, naming the version it supersedes and the digest', async () => {
    const ev = await rows(sql`select e.version, e.details ->> 'workspace' as ws, e.details ->> 'route' as route, e.details ->> 'supersedes' as sup, e.details ->> 'digest' = s.digest as digest_ok
      from shell.events e join shell.navigation_states s on s.state_id = e.subject_id
      where e.principal_id = ${manager.principalId}::uuid and e.event = 'shell.navigation.saved' and e.subject_kind = 'navigation_state' order by e.occurred_at`);
    expect(ev.map((x) => [x['ws'], x['version'], x['route'], x['digest_ok']])).toEqual([['observation', 1, '/observation/sources', true], ['observation', 2, '/observation/evidence', true], ['graph', 1, '/graph/memory', true]]);
    expect(ev[1]!['sup']).not.toBeNull();
    expect(ev[0]!['sup']).toBeNull();
  });
  it('the governed path: each save is an audited write of shell.navigation.save; each read an audited read', async () => {
    const a = await rows(sql`select action, count(*)::int n from audit.audit_events where action in ('shell.navigation.save', 'shell.navigation.read') and tenant_id = ${T}::uuid group by action order by action`);
    expect(a.map((x) => x['action'])).toEqual(['shell.navigation.read', 'shell.navigation.save']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('§SH.3 · the deep link\'s warning AS OF an instant (PAT-25, UX-15-003/004/005)', () => {
  const t0 = new Date(Date.now() - 3 * 3600_000).toISOString();     // raised
  const t1 = new Date(Date.now() - 2 * 3600_000).toISOString();     // its context set (version 1)
  const t2 = new Date(Date.now() - 1 * 3600_000).toISOString();     // acknowledged
  const between = new Date(Date.now() - 2.5 * 3600_000).toISOString();
  const afterAll_ = new Date(Date.now() - 30 * 60_000).toISOString();
  let W = ''; let W2 = '';

  beforeAll(async () => {
    W = await plantWarning(T, D, forecaster.principalId, 'Bab el-Mandeb corridor collapse on event time (SYNTHETIC)', [
      { event: 'warning.raised', at: t0, details: { title: 'Bab el-Mandeb corridor collapse on event time (SYNTHETIC)', level: 'high', urgency: 'prompt', confidence: 0.7, routed_to: forecaster.principalId } },
      { event: 'warning.context_set', at: t1, details: { context_version: 1 } },
      { event: 'warning.acknowledged', at: t2, details: { note: 'rebooking the third shipment (SYNTHETIC)' } },
    ], { state: 'acknowledged', contextVersion: 1, level: 'critical' });
    W2 = await plantWarning(T2, D2, forecaster.principalId, 'another tenant\'s warning (SYNTHETIC)', [{ event: 'warning.raised', at: t0, details: { title: 'another tenant\'s warning (SYNTHETIC)' } }], { state: 'raised', contextVersion: 0, level: 'normal' });
  });

  it('POSITIVE (exact version between two events): RAISED as of the instant, the events up to it, and the variance against the current declared state', async () => {
    const before = await one(sql`select (select count(*)::int from prediction.warning_events where warning_id = ${W}::uuid) as n, (select row_to_json(w)::text from prediction.warnings_current w where warning_id = ${W}::uuid) as cur`);
    const out = await asOf(analyst, W, between);
    const w = out.warning;
    expect(w['warning_id']).toBe(W);
    expect(w['as_of']).toMatchObject({ state: 'raised', level: 'high', context_version: 0, event_count: 1, title: 'Bab el-Mandeb corridor collapse on event time (SYNTHETIC)' });
    expect(((w['as_of'] as Row)['events'] as Row[]).map((e) => e['event'])).toEqual(['warning.raised']);
    expect(w['current']).toMatchObject({ state: 'acknowledged', level: 'critical', context_version: 1, event_count: 3 });
    const v = w['variance'] as Row;
    expect(v).toMatchObject({ exact: false, events_since: 2 });
    expect((v['changed'] as Row[]).map((c) => c['field']).sort()).toEqual(['context_version', 'level', 'state']);
    expect(String(v['statement'])).toMatch(/2 event\(s\) were recorded after this instant; 3 field\(s\) differ/);
    expect(String(w['claim'])).toMatch(/acknowledges, approves and changes nothing/);
    // OPENING THE LINK WRITES NOTHING: the warning's events and current row are unchanged; the only evidence is the read's own (prediction.read)
    const after = await one(sql`select (select count(*)::int from prediction.warning_events where warning_id = ${W}::uuid) as n, (select row_to_json(w)::text from prediction.warnings_current w where warning_id = ${W}::uuid) as cur`);
    expect(after).toEqual(before);
    const aud = await rows(sql`select action from audit.audit_events where audit_seq = ${out.receipt['auditSeq'] as number} and tenant_id = ${T}::uuid`);
    expect(aud.map((x) => x['action'])).toEqual(['prediction.read']);
  });

  it('the as-of state moves with the instant (after the context was set: version 1, still raised); after the last event the link is exact', async () => {
    const mid = (await asOf(analyst, W, new Date(Date.parse(t1) + 60_000).toISOString())).warning;
    expect(mid['as_of']).toMatchObject({ state: 'raised', context_version: 1, event_count: 2 });
    const late = (await asOf(analyst, W, afterAll_)).warning;
    expect(late['as_of']).toMatchObject({ state: 'acknowledged', context_version: 1, event_count: 3 });
    expect(late['variance']).toMatchObject({ exact: true, events_since: 0 });
    expect(((late['variance'] as Row)['changed'] as Row[]).map((c) => c['field'])).toEqual(['level']);   // the level as raised vs the current declared level
  });

  it('FAULT: before the first recorded event the state is NOT replayable — refused, naming where the history begins', async () => {
    const r = await refused(asOf(analyst, W, new Date(Date.parse(t0) - 3600_000).toISOString()), /^warning as-of rejected \(not_replayable\): the warning has no recorded state at .*; its history begins at /);
    expect(r.code).toBe('22023');
  });
  it('FAULT: a future instant is refused `(future)`; a malformed instant `(instant)` at the route', async () => {
    await refused(asOf(analyst, W, new Date(Date.now() + 86_400_000).toISOString()), /^warning as-of rejected \(future\)/);
    const r = await refused(asOf(analyst, W, '2026-10-17 09:00'), /^warning as-of rejected \(instant\): the link names an ISO instant with its zone/);
    expect(r.status).toBe(422);
  });
  it('DENIAL PRIVACY (CROSS-TENANT): another tenant\'s warning, a missing one and a malformed id answer the SAME words — no tenant, domain or existence', async () => {
    const other = await refusal(asOf(analyst, W2, afterAll_));
    const missing = await refusal(asOf(analyst, uuidv7(), afterAll_));
    const malformed = await refusal(asOf(analyst, 'not-a-warning', afterAll_));
    for (const r of [other, missing, malformed]) {
      expect(r.message).toMatch(/^warning as-of rejected \(unknown_warning\): no authorized warning matches this link$/);
      expect(r.message).not.toMatch(/tenant|domain|exists|elsewhere|other/i);
    }
    expect(other.message).toBe(missing.message);
  });
  it('UNAUTHORIZED: a principal without a warning-reading role is denied at the PEP (the read is prediction.read\'s)', async () => {
    const r = await refusal(asOf(nobody, W, afterAll_));
    expect(r.status).toBe(403);
  });
});
