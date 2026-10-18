/**
 * CP-6 B81 §LY-M (migration 0119_b81_x_lym) — SESSION HANDOFFS AND PRESENTATION STATES (the multi-window command environment), on a real
 * database through the real pipeline, PDP, ports and controllers (F-P7-E-04: UX-16-001…005, PAT-45, PAT-46, BP-05; the harness evidence of
 * the acceptance row UX-16-006 — its non-demonstration recording path is B111, then H3).
 *
 * The fixture classes (UX-16-006's: multi-window consistency, presentation privacy, control transfer, display loss, classification):
 * POSITIVE (offer → claim from the same person's OTHER signed-in session → receipt, the review context restored; a display published,
 * superseded and ended; control moved by a claimed handoff), REFUSAL (the offering session itself; another person; a second claim — single
 * use; a revoked offer; an expired one; an unbounded expiry; a location carrying a command; a second window taking a display's control; a
 * future watermark; a display without its classification, or with a classification other than its context's), RECOVERY (the control
 * surface signed out → the person's NEW sign-in takes control: `reauthentication`), FAULT (two concurrent claims — exactly one wins; a
 * revoked claiming session), UNAUTHORIZED (an agent; a principal without a role; another principal — refused at the port and invisible under
 * RLS; cross-tenant at the PEP), NO AUTHORITY INHERITANCE (the offer carries no role; the claim re-reads the claiming session's own roles and
 * changes no binding), REPLAY (append-only, FORCE RLS, no write grants, the definer ports, the ledger, the audited path).
 *
 * Every tenant, persona, session, handoff and display is SYNTHETIC. This proves CONSTRUCTION; demonstrated operation is the act's handoff
 * scene; real acceptance (H3) is never claimed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { WindowsDomainController, WindowsPlatformController } from '../../src/shell/windows/windows.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let dc: WindowsDomainController; let pc: WindowsPlatformController;
let T = ''; let D = ''; let T2 = ''; let D2 = '';
const RUN = uuidv7().slice(-6);
/* L. Brandt-like persona (SYNTHETIC) on three of his own sessions: the desk, the tablet, the briefing wall */
let desk: AuthenticatedPrincipal; let tablet: AuthenticatedPrincipal; let wall: AuthenticatedPrincipal;
let other: AuthenticatedPrincipal; let capper: AuthenticatedPrincipal; let agent: AuthenticatedPrincipal; let nobody: AuthenticatedPrincipal;
let admin: AuthenticatedPrincipal; let admin2: AuthenticatedPrincipal;

function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'navigation', action,
    side_effect_class: action.endsWith('read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: 'HND', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b81-lym',
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

type Out = { handoff?: Row; handoffs?: Row; presentation?: Row; presentations?: Row; receipt: Row };
const call = (fn: 'offer' | 'claim' | 'revoke' | 'handoffs', action: string) => (as: AuthenticatedPrincipal, payload: Row = {}, t: string | null = T, d: string | null = D) =>
  (t === null ? pc[fn](rq(as, action, null, null), { payload }) : dc[fn](rq(as, action, t, d), t, d as string, { payload })) as unknown as Promise<Out>;
const offer = call('offer', 'shell.handoff.offer');
const claim = call('claim', 'shell.handoff.claim');
const revoke = call('revoke', 'shell.handoff.revoke');
const handoffs = call('handoffs', 'shell.handoff.read');
const publish = (as: AuthenticatedPrincipal, payload: Row, t: string = T, d: string = D) =>
  dc.publish(rq(as, 'shell.presentation.publish', t, d), t, d, { payload }) as unknown as Promise<Out>;
const presentations = (as: AuthenticatedPrincipal, payload: Row = {}, t: string = T, d: string = D) =>
  dc.presentations(rq(as, 'shell.presentation.read', t, d), t, d, { payload }) as unknown as Promise<Out>;
const listOf = (o: Out) => (o.handoffs!['handoffs'] as Row[]);
const displayOf = (o: Out, display: string) => (o.presentations!['displays'] as Array<{ display: string; current: Row; versions: number; history: Row[] }>).find((x) => x.display === display);

/** A raw call under the PIPELINE's established context of `as` (the commit role, its bound principal and session) — RLS seen as the runtime sees it. */
async function underContext<R>(as: AuthenticatedPrincipal, fn: (tx: Parameters<Parameters<typeof h.pipeline.consequentialRead>[3]>[0]) => Promise<R>): Promise<R> {
  const action = 'shell.handoff.read';
  const out = await h.pipeline.consequentialRead(env(as, action, 'DOMAIN', T, D), as, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'HND', objectId: null },
    (tx) => tx, async (tx) => fn(tx));
  return out.result;
}
async function person(label: string, kind: 'human' | 'agent', scope: Scope, t: string | null, d: string | null, roles: Array<{ role: string; scope: Scope }>): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b81-lym-${label}-${RUN} (SYNTHETIC)`}, ${`b81lym-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : t, domainId: r.scope === 'DOMAIN' ? d : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: scope, homeTenantId: t, homeDomainId: d, bindings });
}
const signOut = (p: AuthenticatedPrincipal) => sql`update identity.sessions set status = 'revoked', revoked_at = clock_timestamp() where id = ${p.sessionId}::uuid`.execute(h.su);

const PKG = uuidv7();
const REVIEW = { route: `/decisions/packages/${PKG}`, section: 'review', view: 'compare', object: { kind: 'decision_package', id: PKG, version: 2 },
                 selection: [{ kind: 'decision_package', id: PKG, version: 2 }], title: 'Corridor reroute (SYNTHETIC)' };
const CTX = { classification: 'internal', horizon: '90d', purpose: 'navigation' };
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  dc = h.app.get(WindowsDomainController); pc = h.app.get(WindowsPlatformController);
  desk = await h.humanWithSession(['decision_authority', 'decision_owner'], 'lym-brandt');
  tablet = await h.openSession(desk);
  wall = await h.openSession(desk);
  other = await h.humanWithSession(['decision_approver', 'executive'], 'lym-okafor');
  capper = await h.humanWithSession(['domain_analyst'], 'lym-capper');
  nobody = await h.humanWithSession([], 'lym-nobody');
  agent = await person('agent', 'agent', 'DOMAIN', T, D, [{ role: 'domain_analyst', scope: 'DOMAIN' }]);
  admin = await person('platform', 'human', 'PLATFORM', null, null, [{ role: 'platform_admin', scope: 'PLATFORM' }]);
  admin2 = await h.openSession(admin);
  T2 = uuidv7(); D2 = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${T2}::uuid, ${'b81-lym-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T2}::uuid, ${'b81-lym-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
}, 600_000);
afterAll(async () => { await h?.close(); });

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe('§LYM.3/4 · PAT-45 — offer → claim by the same person\'s OTHER signed-in session → receipt; the review context moves', () => {
  let offered: Row;
  it('POSITIVE: the desk offers the package review (route, version, selection, context-bar dimensions) for ten minutes', async () => {
    const out = await offer(desk, { workspace: 'decisions', location: REVIEW, viewContext: CTX, targetDevice: 'tablet', expiresInSeconds: 600 });
    offered = out.handoff!;
    expect(offered).toMatchObject({ status: 'open', scope: 'DOMAIN', tenant_id: T, domain_id: D, workspace: 'decisions', location: REVIEW, view_context: CTX,
      target_device: 'tablet', display: null, offered_here: true, contract: 'b81-lym-windows-1' });
    expect(Date.parse(String(offered['expires_at'])) - Date.parse(String(offered['offered_at']))).toBe(600_000);
    expect(String(offered['claim'])).toMatch(/carries no role and no grant/);
    expect(out.receipt['auditSeq']).toBeTypeOf('number');
  });

  it('THE OFFER CARRIES NO AUTHORITY: the row has no role, grant or token column; a location naming a command or a role is refused', async () => {
    const cols = (await rows(sql`select column_name from information_schema.columns where table_schema = 'shell' and table_name = 'session_handoffs' order by ordinal_position`)).map((r) => r['column_name']);
    expect(cols.filter((c) => /role|grant|token|authority|binding|key/.test(String(c)))).toEqual([]);
    await refused(offer(desk, { workspace: 'decisions', location: { ...REVIEW, command: 'decision.package.approve' } }), /^session handoff rejected \(location\): the location carries no key command/);
    await refused(offer(desk, { workspace: 'decisions', location: REVIEW, viewContext: { role: 'decision_approver' } }), /^session handoff rejected \(context\): the view context carries no key role/);
  });

  it('READ: the desk sees it OFFERED HERE; the tablet (the same person, another session) sees it open and not offered here', async () => {
    const d = listOf(await handoffs(desk)).find((x) => x['handoff_id'] === offered['handoff_id'])!;
    expect(d).toMatchObject({ status: 'open', offered_here: true, receipt: null });
    const t = listOf(await handoffs(tablet)).find((x) => x['handoff_id'] === offered['handoff_id'])!;
    expect(t).toMatchObject({ status: 'open', offered_here: false });
  });

  it('REFUSAL: the offering session cannot claim its own offer `(state)`; another PERSON cannot claim it `(actor)` — nothing moved', async () => {
    await refused(claim(desk, { handoffId: offered['handoff_id'] }), /^session handoff rejected \(state\): this is the session that offered the handoff/);
    await refused(claim(other, { handoffId: offered['handoff_id'] }), /^session handoff rejected \(actor\): a handoff is claimed only by the person who offered it — control never passes to another person/);
    expect(await one(sql`select count(*)::int n from shell.session_handoff_receipts where handoff_id = ${offered['handoff_id'] as string}::uuid`)).toEqual({ n: 0 });
  });

  it('POSITIVE: the TABLET claims it — the receipt, the same review context, authority NOT inherited (its own roles re-read), nothing executed', async () => {
    const bindingsBefore = await one(sql`select count(*)::int n from identity.role_bindings where principal_id = ${desk.principalId}::uuid`);
    const out = (await claim(tablet, { handoffId: offered['handoff_id'] })).handoff!;
    expect(out).toMatchObject({ handoff_id: offered['handoff_id'], status: 'claimed', workspace: 'decisions', location: REVIEW, view_context: CTX, presentation: null,
      receipt: { outcome: 'claimed', claimed_here: true } });
    expect(out['authority']).toMatchObject({ inherited: false, roles: ['decision_authority', 'decision_owner'] });
    expect(String((out['authority'] as Row)['basis'])).toMatch(/re-read at the claim — nothing of the offering session's authority passes/);
    expect(String(out['claim'])).toMatch(/nothing was executed/);
    const r = await one(sql`select outcome, acting_session::text a, claiming_session::text c, roles_at_claim from shell.session_handoff_receipts where handoff_id = ${offered['handoff_id'] as string}::uuid`);
    expect(r).toEqual({ outcome: 'claimed', a: tablet.sessionId, c: tablet.sessionId, roles_at_claim: ['decision_authority', 'decision_owner'] });
    expect(await one(sql`select count(*)::int n from identity.role_bindings where principal_id = ${desk.principalId}::uuid`)).toEqual(bindingsBefore);
    // the desk now reads it claimed — and not by itself (the original surface is no longer the control surface for this review)
    const d = listOf(await handoffs(desk)).find((x) => x['handoff_id'] === offered['handoff_id'])!;
    expect(d).toMatchObject({ status: 'claimed', offered_here: true, receipt: { outcome: 'claimed', claimed_here: false } });
  });

  it('SINGLE USE: a second claim is refused `(duplicate)`; revoking a claimed offer is refused `(state)` — one receipt stays', async () => {
    await refused(claim(wall, { handoffId: offered['handoff_id'] }), /^session handoff rejected \(duplicate\): the handoff was claimed at .* a handoff is single use/);
    await refused(revoke(desk, { handoffId: offered['handoff_id'] }), /^session handoff rejected \(state\): the handoff was claimed at .* control already moved/);
    expect(await one(sql`select count(*)::int n from shell.session_handoff_receipts where handoff_id = ${offered['handoff_id'] as string}::uuid`)).toEqual({ n: 1 });
  });

  it('an unknown handoff is refused `(unknown_handoff)`; a malformed reference at the route (422)', async () => {
    await refused(claim(tablet, { handoffId: uuidv7() }), /^session handoff rejected \(unknown_handoff\): no handoff/);
    const r = await refused(claim(tablet, { handoffId: 'not-an-id' }), /^session handoff rejected \(handoff\): name the handoff by its id/);
    expect(r.status).toBe(422);
  });
});

describe('§LYM.5 · revoke, expiry and the bounded lifetime', () => {
  it('REVOKE: an open offer is revoked with a reason — it can no longer be claimed; a second revoke is `(duplicate)`', async () => {
    const o = (await offer(desk, { workspace: 'decisions', location: REVIEW, expiresInSeconds: 120 })).handoff!;
    const r = (await revoke(desk, { handoffId: o['handoff_id'], reason: 'offered to the wrong device' })).handoff!;
    expect(r).toMatchObject({ status: 'revoked', receipt: { outcome: 'revoked', reason: 'offered to the wrong device' } });
    expect(String(r['claim'])).toMatch(/stay recorded/);
    await refused(claim(tablet, { handoffId: o['handoff_id'] }), /^session handoff rejected \(state\): the handoff was revoked at .* nothing moved/);
    await refused(revoke(tablet, { handoffId: o['handoff_id'] }), /^session handoff rejected \(duplicate\): the handoff was already revoked/);
    expect(listOf(await handoffs(desk)).find((x) => x['handoff_id'] === o['handoff_id'])).toMatchObject({ status: 'revoked' });
  });
  it('EXPIRY: an offer past its expiry reads `expired` and is refused `(expired)` to a claim and to a revocation — nothing moved', async () => {
    const id = uuidv7();
    // SYNTHETIC fixture: an offer made twenty minutes ago with a ten-minute life (the clock is never moved)
    await sql`insert into shell.session_handoffs (handoff_id, principal_id, scope, tenant_id, domain_id, workspace, location, view_context, offering_session, offered_at, expires_at, contract, digest, correlation_id)
              values (${id}::uuid, ${desk.principalId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'decisions', ${JSON.stringify(REVIEW)}::jsonb, '{}'::jsonb, ${desk.sessionId}::uuid,
                      clock_timestamp() - interval '20 minutes', clock_timestamp() - interval '10 minutes', 'b81-lym-windows-1', ${'0'.repeat(64)}, ${uuidv7()}::uuid)`.execute(h.su);
    expect(listOf(await handoffs(tablet)).find((x) => x['handoff_id'] === id)).toMatchObject({ status: 'expired', receipt: null });
    await refused(claim(tablet, { handoffId: id }), /^session handoff rejected \(expired\): the handoff expired at .* nothing moved/);
    await refused(revoke(desk, { handoffId: id }), /^session handoff rejected \(expired\)/);
    expect(await one(sql`select count(*)::int n from shell.session_handoff_receipts where handoff_id = ${id}::uuid`)).toEqual({ n: 0 });
  });
  it('the lifetime is bounded 60–1800 s — never open-ended (the port refuses; the table refuses even the superuser)', async () => {
    await refused(offer(desk, { workspace: 'decisions', location: REVIEW, expiresInSeconds: 30 }), /^session handoff rejected \(expiry\): a handoff lives 60 to 1800 seconds/);
    await refused(offer(desk, { workspace: 'decisions', location: REVIEW, expiresInSeconds: 86_400 }), /^session handoff rejected \(expiry\)/);
    await expect(sql`insert into shell.session_handoffs (handoff_id, principal_id, scope, tenant_id, domain_id, workspace, location, offering_session, expires_at, contract, digest, correlation_id)
      values (${uuidv7()}::uuid, ${desk.principalId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'decisions', ${JSON.stringify(REVIEW)}::jsonb, ${desk.sessionId}::uuid,
              clock_timestamp() + interval '2 hours', 'b81-lym-windows-1', ${'0'.repeat(64)}, ${uuidv7()}::uuid)`.execute(h.su)).rejects.toThrow(/check constraint/i);
  });
  it('a workspace mismatch and an admin location in a domain are refused; at most five offers are open at once `(state)`', async () => {
    await refused(offer(desk, { workspace: 'decisions', location: { route: '/prediction/warnings' } }), /^session handoff rejected \(location\): \/prediction\/warnings is not a location of the decisions workspace/);
    await refused(offer(desk, { workspace: 'admin', location: { route: '/admin' } }), /^session handoff rejected \(workspace\): the admin workspace is the PLATFORM's/);
    for (let i = 0; i < 5; i += 1) await offer(capper, { workspace: 'home', location: { route: '/home' } });
    await refused(offer(capper, { workspace: 'home', location: { route: '/home' } }), /^session handoff rejected \(state\): you have 5 open handoffs/);
  });
});

describe('§LYM.4 · FAULT — concurrent claims and a signed-out claiming session', () => {
  it('two sessions claim the same offer at once: exactly ONE receipt (single use under concurrency)', async () => {
    const o = (await offer(desk, { workspace: 'decisions', location: REVIEW })).handoff!;
    const results = await Promise.allSettled([claim(tablet, { handoffId: o['handoff_id'] }), claim(wall, { handoffId: o['handoff_id'] })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String((lost.reason as Error).message)).toMatch(/^session handoff rejected \(duplicate\)/);
    expect(await one(sql`select count(*)::int n from shell.session_handoff_receipts where handoff_id = ${o['handoff_id'] as string}::uuid`)).toEqual({ n: 1 });
  });
  it('a claiming session that is no longer signed in claims nothing (refused before or at the port)', async () => {
    const gone = await h.openSession(desk);
    const o = (await offer(desk, { workspace: 'decisions', location: REVIEW })).handoff!;
    await signOut(gone);
    const r = await refusal(claim(gone, { handoffId: o['handoff_id'] }));
    expect(r.message).toMatch(/authority insufficient|session|revoked|authentic|rejected/i);   // the PEP refuses the signed-out session before any port runs
    expect(await one(sql`select count(*)::int n from shell.session_handoff_receipts where handoff_id = ${o['handoff_id'] as string}::uuid`)).toEqual({ n: 0 });
    await revoke(desk, { handoffId: o['handoff_id'] });
  });
});

describe('§LYM.7/8 · PAT-46 — a display: what it shows, the data watermark, the classification, ONE control surface', () => {
  const ROOM = { route: '/home/operations-room', view: 'command', selection: [{ kind: 'warning', id: uuidv7(), version: 3 }], title: 'Operations room (SYNTHETIC)' };
  const show = (over: Row = {}) => ({ display: 'operations-room', expectedVersion: 0, status: 'presenting', location: ROOM, viewContext: CTX, watermark: ago(60_000),
                                      classification: 'internal', audience: 'operations_centre', ...over });
  it('POSITIVE: the desk publishes v1 — it is the control surface; the tablet reads the same state and is NOT', async () => {
    const p = (await publish(desk, show())).presentation!;
    expect(p).toMatchObject({ display: 'operations-room', version: 1, status: 'presenting', location: ROOM, classification: 'internal', audience: 'operations_centre',
      control_session_here: true, control_available: true, transfer: null, unchanged: false, contract: 'b81-lym-windows-1' });
    const t = displayOf(await presentations(tablet, { display: 'operations-room' }), 'operations-room')!;
    expect(t.current).toMatchObject({ version: 1, control_session_here: false, control_available: true });
    expect(String((await presentations(tablet)).presentations!['claim'])).toMatch(/a display commands nothing/);
  });
  it('UNCHANGED: the same state again answers `unchanged` — no version', async () => {
    const p = (await publish(desk, show({ expectedVersion: 1 }))).presentation!;
    expect(p['version']).toBe(2);   // a new watermark is a new state (the data moved)
    const again = (await publish(desk, { ...show({ expectedVersion: 2 }), watermark: p['watermark'] })).presentation!;
    expect(again).toMatchObject({ version: 2, unchanged: true });
  });
  it('REFUSAL: a SECOND WINDOW (the tablet, signed in) never takes control silently `(state)`; a stale publication `(stale)`', async () => {
    await refused(publish(tablet, show({ expectedVersion: 2 })), /^presentation state rejected \(state\): the display operations-room is controlled by another of your signed-in sessions .* a second window never takes control silently/);
    await refused(publish(desk, show({ expectedVersion: 1 })), /^presentation state rejected \(stale\): the display operations-room is at version 2; this publication read version 1/);
  });
  it('REFUSAL: a future watermark, a missing or contradicting classification, an unknown audience, an ended display that shows something, an admin location', async () => {
    await refused(publish(desk, show({ expectedVersion: 2, watermark: new Date(Date.now() + 3_600_000).toISOString() })), /^presentation state rejected \(watermark\): .* never in the future/);
    await refused(publish(desk, show({ expectedVersion: 2, classification: null })), /^presentation state rejected \(classification\): a display carries its classification context/);
    await refused(publish(desk, show({ expectedVersion: 2, classification: 'restricted' })), /^presentation state rejected \(classification\): the display's classification \(restricted\) differs from the context it was read under \(internal\)/);
    const a = await refused(publish(desk, show({ expectedVersion: 2, audience: 'everyone' })), /^presentation state rejected \(audience\)/);
    expect(a.status).toBe(422);
    await refused(publish(desk, { display: 'operations-room', expectedVersion: 2, status: 'ended', location: ROOM }), /^presentation state rejected \(status\): an ended display shows nothing/);
    await refused(publish(desk, show({ expectedVersion: 2, location: { route: '/admin/tenants' } })), /^presentation state rejected \(location\): \/admin\/tenants is not a location of a domain workspace/);
    await refused(publish(desk, { display: 'never-shown', expectedVersion: 0, status: 'ended' }), /^presentation state rejected \(state\): nothing is presented on the display never-shown/);
    expect(displayOf(await presentations(desk), 'operations-room')!.versions).toBe(2);
  });
  it('the table refuses a presenting state without a watermark or classification, and an ended one that names a location — even to the superuser', async () => {
    await expect(sql`insert into shell.presentation_states (state_id, principal_id, scope, tenant_id, domain_id, display, version, status, location, control_session, contract, digest, correlation_id)
      values (${uuidv7()}::uuid, ${desk.principalId}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, 'planted', 1, 'presenting', ${JSON.stringify(ROOM)}::jsonb, ${desk.sessionId}::uuid, 'b81-lym-windows-1', ${'0'.repeat(64)}, ${uuidv7()}::uuid)`.execute(h.su))
      .rejects.toThrow(/check constraint/i);
  });

  it('CONTROL TRANSFER by handoff: only the control surface hands a display off; the tablet claims it → a new version controlled by the tablet', async () => {
    await refused(offer(tablet, { workspace: 'home', location: ROOM, display: 'operations-room' }), /^session handoff rejected \(state\): the display operations-room is controlled by another of your sessions/);
    await refused(offer(desk, { workspace: 'home', location: ROOM, display: 'briefing-wall' }), /^session handoff rejected \(unknown_display\): you present nothing on the display briefing-wall/);
    const o = (await offer(desk, { workspace: 'home', location: ROOM, display: 'operations-room', targetDevice: 'tablet' })).handoff!;
    const c = (await claim(tablet, { handoffId: o['handoff_id'] })).handoff!;
    expect(c['presentation']).toMatchObject({ display: 'operations-room', version: 3, transfer: 'handoff', handoff_id: o['handoff_id'], control_session_here: true, location: ROOM });
    expect(displayOf(await presentations(desk, { display: 'operations-room' }), 'operations-room')!.current).toMatchObject({ version: 3, control_session_here: false, control_available: true });
    // the ORIGINAL surface is non-authoritative now: its publication is refused while the tablet is signed in
    await refused(publish(desk, show({ expectedVersion: 3 })), /^presentation state rejected \(state\): the display operations-room is controlled by another of your signed-in sessions/);
    const p = (await publish(tablet, show({ expectedVersion: 3 }))).presentation!;
    expect(p).toMatchObject({ version: 4, control_session_here: true, transfer: null });
  });

  it('RECOVERY (display loss / control unavailable): the tablet signs out → the read says control is UNAVAILABLE → the person signs in on the wall and takes control: `reauthentication`', async () => {
    await signOut(tablet);
    expect(displayOf(await presentations(desk, { display: 'operations-room' }), 'operations-room')!.current).toMatchObject({ version: 4, control_available: false, control_session_here: false });
    const p = (await publish(wall, show({ expectedVersion: 4 }))).presentation!;
    expect(p).toMatchObject({ version: 5, control_session_here: true, transfer: 'reauthentication' });
    const hist = displayOf(await presentations(wall, { display: 'operations-room', history: 10 }), 'operations-room')!.history.map((x) => [x['version'], x['transfer']]);
    expect(hist).toEqual([[5, 'reauthentication'], [4, null], [3, 'handoff'], [2, null], [1, null]]);
  });

  it('PRESENTATION PRIVACY: ending the display withdraws what it shows (no location, watermark or classification); the history stays', async () => {
    const e = (await publish(wall, { display: 'operations-room', expectedVersion: 5, status: 'ended' })).presentation!;
    expect(e).toMatchObject({ version: 6, status: 'ended', location: null, watermark: null, classification: null, audience: null });
    expect(displayOf(await presentations(desk), 'operations-room')!.versions).toBe(6);
  });
});

describe('UNAUTHORIZED — another principal never reads or claims it; an agent hands nothing off', () => {
  it('another principal\'s reads list none of the person\'s handoffs or displays; the ports refuse reading them `(actor)`; RLS shows the runtime none', async () => {
    expect(listOf(await handoffs(other))).toEqual([]);
    expect(displayOf(await presentations(other), 'operations-room')).toBeUndefined();
    const msgs = await underContext(other, async (tx) => {
      const out: string[] = [];
      for (const q of [sql`select shell.handoffs_of(${desk.principalId}::uuid, ${T}::uuid, ${D}::uuid, 5)`, sql`select shell.presentation_of(${desk.principalId}::uuid, ${T}::uuid, ${D}::uuid, null, 5)`]) {
        await sql`savepoint other_principal`.execute(tx);
        out.push(await q.execute(tx).then(() => 'no error', async (e: unknown) => { await sql`rollback to savepoint other_principal`.execute(tx); return e instanceof Error ? e.message : String(e); }));
      }
      return out;
    });
    expect(msgs[0]).toMatch(/^session handoff rejected \(actor\): a principal reads only its own handoffs/);
    expect(msgs[1]).toMatch(/^presentation state rejected \(actor\): a principal reads only its own displays/);
    const seen = await underContext(other, async (tx) => (await sql<Row>`select
      (select count(*)::int from shell.session_handoffs where principal_id = ${desk.principalId}::uuid) as h,
      (select count(*)::int from shell.session_handoff_receipts where principal_id = ${desk.principalId}::uuid) as r,
      (select count(*)::int from shell.presentation_states where principal_id = ${desk.principalId}::uuid) as p,
      (select count(*)::int from shell.events where principal_id = ${desk.principalId}::uuid and subject_kind in ('session_handoff', 'presentation_state')) as e`.execute(tx)).rows[0]!);
    expect(seen).toEqual({ h: 0, r: 0, p: 0, e: 0 });
    const own = await underContext(desk, async (tx) => (await sql<Row>`select (select count(*)::int from shell.presentation_states where principal_id = ${desk.principalId}::uuid) as p`.execute(tx)).rows[0]!);
    expect(own).toEqual({ p: 6 });
  });
  it('the ports refuse acting ON ANOTHER\'S BEHALF `(actor)` (the actor is the bound principal)', async () => {
    const action = 'shell.handoff.offer';
    const msg = await h.pipeline.write(env(other, action, 'DOMAIN', T, D), other, { scope: 'DOMAIN', tenantId: T, domainId: D, action, objectType: 'HND', objectId: null }, (tx) => tx,
      async (tx) => { await sql`select shell.offer_handoff(${uuidv7()}::uuid, ${T}::uuid, ${D}::uuid, 'home', '{"route":"/home"}'::jsonb, '{}'::jsonb, null, null, 600, ${desk.principalId}::uuid, ${uuidv7()}::uuid)`.execute(tx);
        return { result: {}, targetType: 'HND', targetId: null, targetVersion: null, outboxEvent: null }; })
      .then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));
    expect(msg).toMatch(/^session handoff rejected \(actor\): a handoff is offered by its own principal, never on another's behalf/);
  });
  it('an AGENT is stopped by the HUMAN GATE at the PEP for a handoff; its publication passes the PDP and is refused by the port `(actor)`; no role → 403', async () => {
    const g = await refusal(offer(agent, { workspace: 'home', location: { route: '/home' } }));
    expect(g.status).toBe(403);
    expect(g.message).toMatch(/human gate: shell\.handoff\.offer requires a named human principal/);
    await refused(publish(agent, { display: 'agent-wall', expectedVersion: 0, status: 'presenting', location: { route: '/home' }, watermark: ago(1000), classification: 'internal', audience: 'kiosk' }),
      /^presentation state rejected \(actor\): a display is a named, active human's own/);
    for (const p of [() => offer(nobody, { workspace: 'home', location: { route: '/home' } }), () => handoffs(nobody), () => presentations(nobody),
                     () => publish(nobody, { display: 'x-wall', expectedVersion: 0, status: 'ended' })]) expect((await refusal(p())).status).toBe(403);
    expect(await one(sql`select (select count(*)::int from shell.session_handoffs where principal_id in (${agent.principalId}::uuid, ${nobody.principalId}::uuid))
      + (select count(*)::int from shell.presentation_states where principal_id in (${agent.principalId}::uuid, ${nobody.principalId}::uuid)) as n`)).toEqual({ n: 0 });
  });
  it('CROSS-TENANT and CROSS-SCOPE: another tenant\'s domain and the PLATFORM scope are denied at the PEP for a domain principal', async () => {
    expect((await refusal(offer(desk, { workspace: 'home', location: { route: '/home' } }, T2, D2))).status).toBe(403);
    expect((await refusal(presentations(wall, {}, T2, D2))).status).toBe(403);
    expect((await refusal(offer(desk, { workspace: 'admin', location: { route: '/admin' } }, null, null))).status).toBe(403);
  });
  it('PLATFORM: the admin workspace hands off between the platform person\'s own two sessions (no tenant, no domain)', async () => {
    const o = (await offer(admin, { workspace: 'admin', location: { route: '/admin/governance' } }, null, null)).handoff!;
    expect(o).toMatchObject({ scope: 'PLATFORM', tenant_id: null, domain_id: null, status: 'open' });
    const c = (await claim(admin2, { handoffId: o['handoff_id'] }, null, null)).handoff!;
    expect(c).toMatchObject({ status: 'claimed', authority: { inherited: false, roles: ['platform_admin'] } });
    expect(listOf(await handoffs(admin2, {}, null, null)).map((x) => x['status'])).toEqual(['claimed']);
  });
});

describe('REPLAY — the tables are append-only, the ports are the definer\'s, the ledger records every act, the path is audited', () => {
  it('no handoff, receipt or presentation state is ever updated or deleted; FORCE RLS; no write grant; the write ports are eye_commit\'s alone', async () => {
    for (const t of ['session_handoffs', 'session_handoff_receipts', 'presentation_states']) {
      await expect(sql`update ${sql.raw(`shell.${t}`)} set principal_id = principal_id where principal_id = ${desk.principalId}::uuid`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
      await expect(sql`delete from ${sql.raw(`shell.${t}`)} where principal_id = ${desk.principalId}::uuid`.execute(h.su)).rejects.toThrow(/append-only|not permitted|immutable/i);
      const r = await one(sql`select c.relrowsecurity as rls, c.relforcerowsecurity as force, has_table_privilege('eye_app', ${`shell.${t}`}, 'INSERT') as app_ins,
        has_table_privilege('eye_commit', ${`shell.${t}`}, 'INSERT') as cmt_ins, has_table_privilege('eye_commit', ${`shell.${t}`}, 'UPDATE') as cmt_upd,
        has_table_privilege('eye_app', ${`shell.${t}`}, 'SELECT') as app_sel
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'shell' and c.relname = ${t}`);
      expect(r).toEqual({ rls: true, force: true, app_ins: false, cmt_ins: false, cmt_upd: false, app_sel: true });
    }
    const fns = await one(sql`select
      has_function_privilege('eye_app', 'shell.offer_handoff(uuid, uuid, uuid, text, jsonb, jsonb, text, text, int, uuid, uuid)', 'EXECUTE') as app_offer,
      has_function_privilege('eye_commit', 'shell.offer_handoff(uuid, uuid, uuid, text, jsonb, jsonb, text, text, int, uuid, uuid)', 'EXECUTE') as cmt_offer,
      has_function_privilege('public', 'shell.claim_handoff(uuid, uuid, uuid, uuid)', 'EXECUTE') as pub_claim,
      has_function_privilege('eye_commit', 'shell.claim_handoff(uuid, uuid, uuid, uuid)', 'EXECUTE') as cmt_claim,
      has_function_privilege('eye_app', 'shell.revoke_handoff(uuid, uuid, text, uuid, uuid)', 'EXECUTE') as app_revoke,
      has_function_privilege('eye_app', 'shell.publish_presentation(uuid, uuid, uuid, text, int, text, jsonb, jsonb, timestamptz, text, text, uuid, uuid)', 'EXECUTE') as app_publish,
      has_function_privilege('eye_commit', 'shell.publish_presentation(uuid, uuid, uuid, text, int, text, jsonb, jsonb, timestamptz, text, text, uuid, uuid)', 'EXECUTE') as cmt_publish,
      has_function_privilege('eye_app', 'shell.handoffs_of(uuid, uuid, uuid, int)', 'EXECUTE') as app_read_h,
      has_function_privilege('eye_app', 'shell.presentation_of(uuid, uuid, uuid, text, int)', 'EXECUTE') as app_read_p,
      has_function_privilege('eye_app', 'shell.own_live_session(uuid, boolean)', 'EXECUTE') as app_session,
      has_function_privilege('eye_commit', 'shell.session_live(uuid)', 'EXECUTE') as cmt_live`);
    expect(fns).toEqual({ app_offer: false, cmt_offer: true, pub_claim: false, cmt_claim: true, app_revoke: false, app_publish: false, cmt_publish: true,
      app_read_h: true, app_read_p: true, app_session: false, cmt_live: false });
    const definer = await rows(sql`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'shell' and p.proname in ('offer_handoff', 'claim_handoff', 'revoke_handoff', 'handoffs_of', 'publish_presentation', 'presentation_of') order by p.proname`);
    expect(definer).toHaveLength(6);
    for (const d of definer) { expect(d['prosecdef']).toBe(true); expect(String(d['proconfig'])).toMatch(/search_path=.*pg_catalog, pg_temp/); }
  });
  it('the ledger: offered / claimed / revoked per handoff, published / control_moved per display version — each naming what it moved', async () => {
    const ev = await rows(sql`select event, count(*)::int n from shell.events where principal_id = ${desk.principalId}::uuid and subject_kind in ('session_handoff', 'presentation_state') group by event order by event`);
    const by = Object.fromEntries(ev.map((x) => [x['event'], x['n']]));
    expect(by['shell.presentation.published']).toBe(5);   // v1, v2 (desk), v4 (tablet), v5 (wall), v6 ended — v3 is the claim's control_moved; an unchanged publication writes none
    expect(by['shell.presentation.control_moved']).toBe(1);
    expect(by['shell.handoff.claimed']).toBe(3);
    expect(by['shell.handoff.revoked']).toBe(2);
    const claimed = await one(sql`select details -> 'roles_at_claim' as roles from shell.events where principal_id = ${desk.principalId}::uuid and event = 'shell.handoff.claimed' order by occurred_at limit 1`);
    expect(claimed['roles']).toEqual(['decision_authority', 'decision_owner']);
  });
  it('the governed path: every act is an audited write of its own action; every read an audited read', async () => {
    const a = await rows(sql`select action from audit.audit_events where action like 'shell.handoff.%' or action like 'shell.presentation.%' group by action order by action`);
    expect(a.map((x) => x['action'])).toEqual(['shell.handoff.claim', 'shell.handoff.offer', 'shell.handoff.read', 'shell.handoff.revoke', 'shell.presentation.publish', 'shell.presentation.read']);
  });
});
