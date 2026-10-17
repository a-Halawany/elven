/**
 * CP-6 B80 §CL-F (migration 0118_b80_x_clf) — THE FORM DRAFT (PAT-03 "persist versioned work without implying submission; never label as
 * approval"; UX-21-002/-003) on a real database through the real pipeline, the PDP, the ports and the controller. CONSTRUCTION evidence:
 * every persona and draft here is SYNTHETIC; a draft saved here demonstrates the software only.
 *
 *   DR1 · SAVE AND READ: version 1; the live payload read back with its digest; the ledger; the list.
 *   DR2 · SUPERSEDE: version 2 supersedes the version the form read; the same content answered `unchanged` (no version 3); a save that read
 *         an older version refused (stale).
 *   DR3 · EXPIRE: on the database clock — the content WITHHELD from the read (state expired), a save naming the expired version refused
 *         (expired), a new draft started instead.
 *   DR4 · DISCARD: a tombstone version; the content no longer offered; a second discard refused (state); a stale discard refused; a new
 *         draft after it.
 *   DR5 · ANOTHER PRINCIPAL NEVER READS A DRAFT: not by form, not by id, not in the list; its discard of another's draft answered unknown.
 *   DR6 · WHO MAY DRAFT: an agent refused by the PEP's human gate; a machine whose session claims a human refused by the PORT (actor); a
 *         principal holding no human role refused by the PDP; the caller's own malformed requests (422).
 *   DR7 · RLS AND GRANTS: FORCE RLS, the policy names the principal and the bound domain; an unbound runtime role reads nothing; no write
 *         grant; append-only; the ports are eye_commit's, the read guarded.
 *   DR8 · THE LEDGER AND "NEVER A SUBMISSION": every save and discard in shell.events in order, digests agreeing; nothing the draft's form
 *         would have created exists; no submission or approval state on the record.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { DraftsController } from '../../src/shell/drafts/drafts.controller.js';
import { asDraftRefusal } from '../../src/shell/drafts/drafts.service.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let dc: DraftsController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const FORM = 'observation.source.register';
const DEC_FORM = 'decision.package.declare';

let registrar: AuthenticatedPrincipal;   // collection_manager — the SYNTHETIC registrar drafting a source registration
let other: AuthenticatedPrincipal;       // domain_analyst — another person in the same domain
let agent: AuthenticatedPrincipal;       // an AGENT holding collection_manager (the PEP's human gate refuses it)
let machine: AuthenticatedPrincipal;     // an AGENT holding collection_manager whose session claims a human (the PEP passes; the PORT refuses)
let agentRoleOnly: AuthenticatedPrincipal; // a human holding only collection_agent (no human role: the PDP refuses)

const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; code: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = asDraftRefusal(e, 'harness');
  if (mapped instanceof HttpException) {
    const r = mapped.getResponse() as Row;
    return { status: mapped.getStatus(), message: String(r['message'] ?? ''), code: String(r['code'] ?? '') };
  }
  return { status: null, message: e instanceof Error ? e.message : String(e), code: '' };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };

const rq = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'SDR', id, 'observation');
type Draft = { draft_id: string; version: number; supersedes: number | null; payload_digest: string; unchanged: boolean; expires_at: string; submission: boolean };
const save = (as: AuthenticatedPrincipal, payload: Row) =>
  dc.save(rq(as, 'shell.draft.save'), T(), D(), { payload: { formKey: FORM, subjectKey: '-', schemaVersion: 'SRC-REG@v1', ...payload } }) as Promise<{ draft: Draft; receipt: Row }>;
const read = (as: AuthenticatedPrincipal, payload: Row) =>
  dc.read(rq(as, 'shell.draft.read'), T(), D(), { payload: { formKey: FORM, ...payload } }) as Promise<{ draft: { state: string; draft: (Row & { payload: Row | null; version: number }) | null; versions: Row[] } }>;
const list = (as: AuthenticatedPrincipal, formKey: string | null = null) =>
  dc.list(rq(as, 'shell.draft.read'), T(), D(), { payload: formKey === null ? {} : { formKey } }) as Promise<{ drafts: Row[] }>;
const discard = (as: AuthenticatedPrincipal, id: string, expectedVersion: number | null) =>
  dc.discard(rq(as, 'shell.draft.discard', id), T(), D(), id, { payload: { expectedVersion, reason: 'no longer needed (SYNTHETIC)' } }) as Promise<{ draft: Row }>;
const ledger = async (subject: string) => rows(sql`select event, version, details from shell.events where subject_id = ${subject}::uuid order by occurred_at, event_id`);

async function principal(kind: 'human' | 'agent', roles: string[], label: string, claim: 'human' | 'agent', assurance: 'password' | 'agent_grant'): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`b80clf-${label}-${id.slice(-8)} (SYNTHETIC)`}, ${`b80clf-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: claim, assurance, homeScope: 'DOMAIN', homeDomainId: D(), bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN', tenantId: T(), domainId: D() })) } as AuthenticatedPrincipal);
}

const CONTRACT = (name: string) => ({ step: 1, values: { source_key: `b80-clf-${RUN}`, name, publisher: 'International Monetary Fund (SYNTHETIC draft)' }, provenance: { name: 'typed' } });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  dc = h.app.get(DraftsController);
  registrar = await h.humanWithSession(['collection_manager'], 'b80clf-registrar');
  other = await h.humanWithSession(['domain_analyst'], 'b80clf-other');
  agent = await principal('agent', ['collection_manager'], 'agent', 'agent', 'agent_grant');
  machine = await principal('agent', ['collection_manager'], 'machine', 'human', 'password');
  agentRoleOnly = await principal('human', ['collection_agent'], 'agent-role', 'human', 'password');
}, 300_000);
afterAll(async () => { await h?.close(); });

let DRAFT = '';
describe('DR1 · save and read', () => {
  it('a first save is version 1 with its payload digest and expiry; nothing about it is a submission', async () => {
    const r = await save(registrar, { payload: CONTRACT('PortWatch chokepoints (draft 1)'), summary: 'PortWatch chokepoints', step: 0, expectedVersion: null });
    expect(r.draft).toMatchObject({ version: 1, supersedes: null, unchanged: false, submission: false, form_key: FORM, subject_key: '-' });
    expect(r.draft.payload_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(r.receipt['policyDecisionId']).toEqual(expect.any(String));
    DRAFT = r.draft.draft_id;
    const stored = await one(sql`select payload_digest, shell.draft_digest(payload) as recomputed, kind, expires_at > saved_at + interval '6 days' as week from shell.drafts where draft_id = ${DRAFT}::uuid and version = 1`);
    expect(stored).toMatchObject({ payload_digest: r.draft.payload_digest, recomputed: r.draft.payload_digest, kind: 'saved', week: true });
  });
  it('the read returns the LIVE draft with its payload, and the list names it (no payload in the list)', async () => {
    const r = await read(registrar, {});
    expect(r.draft.state).toBe('live');
    expect(r.draft.draft).toMatchObject({ draft_id: DRAFT, version: 1, summary: 'PortWatch chokepoints', step: 0, submission: false });
    expect((r.draft.draft!.payload as Row)['values']).toMatchObject({ name: 'PortWatch chokepoints (draft 1)' });
    const l = await list(registrar);
    const mine = l.drafts.find((x) => x['draft_id'] === DRAFT)!;
    expect(mine).toMatchObject({ version: 1, form_key: FORM, state: 'live' });
    expect(mine).not.toHaveProperty('payload');
  });
});

describe('DR2 · supersede', () => {
  it('a save that read version 1 writes version 2, superseding it; the read follows; the history keeps both digests', async () => {
    const r = await save(registrar, { payload: CONTRACT('PortWatch chokepoints (draft 2)'), summary: 'PortWatch chokepoints', step: 1, expectedVersion: 1 });
    expect(r.draft).toMatchObject({ draft_id: DRAFT, version: 2, supersedes: 1, unchanged: false });
    const back = await read(registrar, {});
    expect(back.draft.draft).toMatchObject({ version: 2, step: 1 });
    expect((back.draft.draft!.payload as Row)['values']).toMatchObject({ name: 'PortWatch chokepoints (draft 2)' });
    expect(back.draft.versions.map((v) => [v['version'], v['kind']])).toEqual([[1, 'saved'], [2, 'saved']]);
    expect(back.draft.versions.every((v) => !('payload' in v))).toBe(true);
  });
  it('the same content again is answered unchanged — no version 3', async () => {
    const r = await save(registrar, { payload: CONTRACT('PortWatch chokepoints (draft 2)'), summary: 'PortWatch chokepoints', step: 1, expectedVersion: 2 });
    expect(r.draft).toMatchObject({ version: 2, unchanged: true });
    expect(await one(sql`select max(version) as v from shell.drafts where draft_id = ${DRAFT}::uuid`)).toEqual({ v: 2 });
  });
  it('a save that read version 1 (another tab, an older read) is refused STALE — the newer work is never overwritten', async () => {
    await refused(save(registrar, { payload: CONTRACT('an older tab'), expectedVersion: 1 }), /^form draft rejected \(stale\): your draft of observation\.source\.register is at version 2/, 409);
    await refused(save(registrar, { payload: CONTRACT('a blind save'), expectedVersion: null }), /^form draft rejected \(stale\)/, 409);
  });
});

describe('DR3 · expire', () => {
  let short = '';
  it('a draft past its expiry (the database clock) is WITHHELD: state expired, no payload; the list says expired', async () => {
    const r = await dc.save(rq(registrar, 'shell.draft.save'), T(), D(), { payload: { formKey: DEC_FORM, subjectKey: '-', payload: { title: 'Bab el-Mandeb reroute (SYNTHETIC)' }, ttlSeconds: 1, expectedVersion: null } }) as { draft: Draft };
    short = r.draft.draft_id;
    await new Promise((res) => setTimeout(res, 1600));
    const back = await read(registrar, { formKey: DEC_FORM });
    expect(back.draft.state).toBe('expired');
    expect(back.draft.draft).toMatchObject({ draft_id: short, version: 1, payload: null });
    expect((await list(registrar, DEC_FORM)).drafts.find((x) => x['draft_id'] === short)).toMatchObject({ state: 'expired' });
  });
  it('a save naming the expired version is refused (expired); without an expected version a NEW draft starts', async () => {
    await refused(dc.save(rq(registrar, 'shell.draft.save'), T(), D(), { payload: { formKey: DEC_FORM, payload: { title: 'resumed' }, expectedVersion: 1 } }),
      /^form draft rejected \(expired\): version 1 of your draft of decision\.package\.declare expired at/, 409);
    const fresh = await dc.save(rq(registrar, 'shell.draft.save'), T(), D(), { payload: { formKey: DEC_FORM, payload: { title: 'started again' }, expectedVersion: null } }) as { draft: Draft };
    expect(fresh.draft.draft_id).not.toBe(short);
    expect(fresh.draft.version).toBe(1);
    expect((await read(registrar, { formKey: DEC_FORM })).draft.state).toBe('live');
  });
});

describe('DR4 · discard', () => {
  it('a stale discard is refused; the discard of the version read writes a tombstone and the content is no longer offered', async () => {
    await refused(discard(registrar, DRAFT, 1), /^form draft rejected \(stale\): draft .* is at version 2/, 409);
    const r = await discard(registrar, DRAFT, 2);
    expect(r.draft).toMatchObject({ draft_id: DRAFT, version: 3, discarded_version: 2, state: 'discarded' });
    const back = await read(registrar, {});
    expect(back.draft.state).toBe('discarded');
    expect(back.draft.draft!['payload']).toBeNull();
    expect((await list(registrar, FORM)).drafts.find((x) => x['draft_id'] === DRAFT)).toBeUndefined();
    const tomb = await one(sql`select kind, payload, payload_digest, supersedes, reason from shell.drafts where draft_id = ${DRAFT}::uuid and version = 3`);
    expect(tomb).toEqual({ kind: 'discarded', payload: null, payload_digest: null, supersedes: 2, reason: 'no longer needed (SYNTHETIC)' });
  });
  it('a second discard is refused (state); a new draft after a discard starts at version 1 under a new id', async () => {
    await refused(discard(registrar, DRAFT, 3), /^form draft rejected \(state\): draft .* was discarded/, 409);
    const r = await save(registrar, { payload: CONTRACT('after the discard'), expectedVersion: null });
    expect(r.draft.draft_id).not.toBe(DRAFT);
    expect(r.draft.version).toBe(1);
  });
});

describe('DR5 · another principal never reads a draft', () => {
  it('not by form, not by id, not in the list; its discard of the registrar\'s draft is answered unknown (existence is personal too)', async () => {
    const theirs = await read(registrar, {});
    const id = String(theirs.draft.draft!['draft_id']);
    expect((await read(other, {})).draft).toMatchObject({ state: 'none', draft: null, versions: [] });
    expect((await read(other, { draftId: id })).draft).toMatchObject({ state: 'none', draft: null });
    expect((await list(other)).drafts).toEqual([]);
    await refused(discard(other, id, 1), /^form draft rejected \(unknown_draft\): no draft .* of yours in this domain/, 404);
    // the registrar's draft is untouched by the attempt
    expect((await read(registrar, {})).draft).toMatchObject({ state: 'live', draft: { draft_id: id, version: 1 } });
  });
  it('the other person keeps an independent draft of the same form', async () => {
    const mine = await save(other, { payload: CONTRACT('the analyst\'s own draft'), expectedVersion: null });
    expect(mine.draft.version).toBe(1);
    const reg = await read(registrar, {});
    expect(reg.draft.draft!['draft_id']).not.toBe(mine.draft.draft_id);
    expect((await list(other)).drafts.map((x) => x['draft_id'])).toEqual([mine.draft.draft_id]);
  });
});

describe('DR6 · who may draft, and the caller\'s own request', () => {
  it('an agent is refused by the PEP\'s human gate before any port', async () => {
    const r = await refusal(save(agent, { payload: CONTRACT('agent'), expectedVersion: null }));
    expect(r.status).toBe(403);
    expect(r.message).toMatch(/human gate: shell\.draft\.save requires a named human principal/);
  });
  it('a machine whose session claims a human is refused by the PORT (actor)', async () => {
    await refused(save(machine, { payload: CONTRACT('machine'), expectedVersion: null }), /^form draft rejected \(actor\): a draft is a named person's own work in progress; an agent or a system never drafts/, 403);
  });
  it('a principal holding no human role is refused by the PDP', async () => {
    const r = await refusal(save(agentRoleOnly, { payload: CONTRACT('agent role'), expectedVersion: null }));
    expect(r.status).toBe(403);
    expect(r.message).toMatch(/no qualifying role binding/);
  });
  it('malformed requests are refused in the class form (422): the form key, the payload, the ttl, the size, the step', async () => {
    await refused(dc.save(rq(registrar, 'shell.draft.save'), T(), D(), { payload: { formKey: 'X', payload: {} } }), /^form draft rejected \(form_key\)/, 422);
    await refused(dc.save(rq(registrar, 'shell.draft.save'), T(), D(), { payload: { formKey: FORM, payload: [1] } }), /^form draft rejected \(payload\)/, 422);
    await refused(dc.save(rq(registrar, 'shell.draft.save'), T(), D(), { payload: { formKey: 'shell.test-ttl', payload: {}, ttlSeconds: 2592001 } }), /^form draft rejected \(ttl\)/, 422);
    await refused(dc.save(rq(registrar, 'shell.draft.save'), T(), D(), { payload: { formKey: 'shell.test-size', payload: { blob: 'x'.repeat(270000) } } }), /^form draft rejected \(payload\): a draft is at most 256 KiB/, 422);
    await refused(dc.save(rq(registrar, 'shell.draft.save'), T(), D(), { payload: { formKey: 'shell.test-step', payload: {}, step: 99 } }), /^form draft rejected \(step\)/, 422);
    await refused(dc.save(rq(registrar, 'shell.draft.save'), T(), D(), { payload: { formKey: 'shell.test-step', payload: {}, expectedVersion: 'one' } }), /^form draft rejected \(expectedVersion\)/, 422);
    await refused(dc.read(rq(registrar, 'shell.draft.read'), T(), D(), { payload: {} }), /^form draft rejected \(request\): name the form/, 422);
    await refused(dc.discard(rq(registrar, 'shell.draft.discard'), T(), D(), 'not-an-id', { payload: {} }), /^form draft rejected \(request\)/, 422);
  });
});

describe('DR7 · RLS and grants', () => {
  it('FORCE RLS; the policy names the principal and the bound tenant and domain; no write grant to the runtime roles', async () => {
    const r = await one(sql`select c.relrowsecurity as rls, c.relforcerowsecurity as force,
      has_table_privilege('eye_app', 'shell.drafts', 'SELECT') as app_sel, has_table_privilege('eye_app', 'shell.drafts', 'INSERT') as app_ins,
      has_table_privilege('eye_commit', 'shell.drafts', 'INSERT') as cmt_ins, has_table_privilege('eye_commit', 'shell.drafts', 'UPDATE') as cmt_upd,
      has_table_privilege('eye_commit', 'shell.drafts', 'DELETE') as cmt_del
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'shell' and c.relname = 'drafts'`);
    expect(r).toEqual({ rls: true, force: true, app_sel: true, app_ins: false, cmt_ins: false, cmt_upd: false, cmt_del: false });
    const pol = String((await one(sql`select qual from pg_policies where schemaname = 'shell' and tablename = 'drafts' and policyname = 'shdr_own'`))['qual']);
    expect(pol).toMatch(/eye_principal\(\)/); expect(pol).toMatch(/eye_tenant\(\)/); expect(pol).toMatch(/eye_domain\(\)/);
  });
  it('an unbound runtime role reads NO draft although drafts exist', async () => {
    expect(Number((await one(sql`select count(*)::int as n from shell.drafts`))['n'])).toBeGreaterThan(3);
    for (const role of ['eye_app', 'eye_commit']) {
      const n = await h.su.transaction().execute(async (tx) => { await sql.raw(`set local role ${role}`).execute(tx); return (await sql<{ n: number }>`select count(*)::int as n from shell.drafts`.execute(tx)).rows[0]?.n; });
      expect(n, role).toBe(0);
    }
  });
  it('append-only: a draft version is never updated or deleted', async () => {
    await expect(sql`update shell.drafts set summary = 'rewritten' where draft_id = ${DRAFT}::uuid`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
    await expect(sql`delete from shell.drafts where draft_id = ${DRAFT}::uuid`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
  });
  it('the write ports are eye_commit\'s alone; the read is the runtime roles\'; nothing is PUBLIC', async () => {
    const g = await one(sql`select
      has_function_privilege('eye_app', 'shell.draft_save(uuid, uuid, text, text, text, jsonb, text, int, int, int, uuid)', 'EXECUTE') as app_save,
      has_function_privilege('eye_commit', 'shell.draft_save(uuid, uuid, text, text, text, jsonb, text, int, int, int, uuid)', 'EXECUTE') as cmt_save,
      has_function_privilege('eye_app', 'shell.draft_discard(uuid, uuid, uuid, int, text, uuid)', 'EXECUTE') as app_discard,
      has_function_privilege('eye_app', 'shell.draft_read(uuid, uuid, text, text, uuid)', 'EXECUTE') as app_read,
      has_function_privilege('public', 'shell.draft_save(uuid, uuid, text, text, text, jsonb, text, int, int, int, uuid)', 'EXECUTE') as pub_save,
      has_function_privilege('public', 'shell.draft_read(uuid, uuid, text, text, uuid)', 'EXECUTE') as pub_read`);
    expect(g).toEqual({ app_save: false, cmt_save: true, app_discard: false, app_read: true, pub_save: false, pub_read: false });
  });
  it('a write port outside its bound action, and the read outside the caller\'s scope, are refused', async () => {
    await expect(sql`select shell.draft_save(${T()}::uuid, ${D()}::uuid, ${FORM}, '-', null, '{}'::jsonb, null, null, null, null, ${uuidv7()}::uuid)`.execute(h.su))
      .rejects.toThrow(/context is bound to action <none>/);
    const n = await h.su.transaction().execute(async (tx) => {
      await sql.raw('set local role eye_app').execute(tx);
      return sql`select shell.draft_read(${T()}::uuid, ${D()}::uuid, ${FORM}, '-', null)`.execute(tx).then(() => 'read', (e: Error) => e.message);
    });
    // the harness's session is the migration superuser, which observation.read_scope_ok admits by its own bypass (0102 §1: narrowing it
    // protects nothing); the read then refuses for want of a bound principal — a draft is only ever read as its owner
    expect(n).toMatch(/^form draft rejected \(actor\): no principal is bound to this context|read rejected \(scope\): a form draft is read only within/);
  });
});

describe('DR8 · the ledger, and never a submission', () => {
  it('every save and discard of a draft is in the principal\'s ledger, in order, the digests agreeing with the versions', async () => {
    const ev = await ledger(DRAFT);
    expect(ev.map((e) => [e['event'], e['version']])).toEqual([['shell.draft.saved', 1], ['shell.draft.saved', 2], ['shell.draft.discarded', 3]]);
    const digests = await rows(sql`select version, payload_digest from shell.drafts where draft_id = ${DRAFT}::uuid and kind = 'saved' order by version`);
    expect(ev.slice(0, 2).map((e) => (e['details'] as Row)['payload_digest'])).toEqual(digests.map((d) => d['payload_digest']));
    expect(ev.every((e) => (e['details'] as Row)['submission'] !== true)).toBe(true);
    const who = await rows(sql`select distinct principal_id::text as p from shell.events where subject_id = ${DRAFT}::uuid`);
    expect(who).toEqual([{ p: registrar.principalId }]);
  });
  it('the draft created nothing its form would: no source carries the drafted key; the record has no submission or approval state', async () => {
    expect(await one(sql`select count(*)::int as n from observation.source_contracts_current where source_key = ${`b80-clf-${RUN}`}`)).toEqual({ n: 0 });
    const cols = (await rows(sql`select column_name from information_schema.columns where table_schema = 'shell' and table_name = 'drafts'`)).map((c) => String(c['column_name']));
    expect(cols).not.toEqual(expect.arrayContaining(['submitted_at']));
    expect(cols.some((c) => /submit|approv|accept|certif/.test(c))).toBe(false);
    expect(String((await one(sql`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'shdr_shape'`))['d'])).toMatch(/saved.*discarded/);
  });
});
