/**
 * CP-6 B34-F1 (migration 0091; the owner's bounded B34 review of 2026-09-29) — THE COLLABORATION PORTS' IDENTITY MUTATIONS THROUGH THE
 * IDENTITY AUTHORITY. On a real database, the world of `bootDecisionWorld`, humans with sessions of their own, an ACTIVE ATTENTION AGENT
 * whose ticks (tickNow) run the lapse and the after-tick revocation, and the real sign-in route for the externals.
 *
 *   P1 · POSITIVE, END TO END: the owner REQUESTS (the grant `requested`; no identity row); the tenant administrator PROVISIONS — the
 *   principal created on the IDENTITY authority (identity.principal.create's own POL/AUD; the binding's grantor is the administrator, derived
 *   by identity.create_principal from the bound context — 0090's direct INSERT left it NULL), the invitation credential issued by the identity
 *   ports expiring with the invitation window (its identity audit event), the grant `invited`; the external SIGNS IN with the invitation
 *   credential and ACCEPTS — the credential ROTATED by the identity authority (the old one revoked, the new one expiring WITH THE GRANT, the
 *   invitation session revoked, the epoch bumped, its identity audit event); signed in with the password it WORKS inside the grant (reads,
 *   posts, reviews its task); the owner REVOKES — its credentials and sessions revoked and its epoch bumped at once (the old session and the
 *   sign-in refused), its task reassigned access_lost; a second external's grant EXPIRES — a real tick lapses it and the after-tick hook
 *   collab-access-revocation revokes its access the same way.
 *   P2 · THE COMPENSATION: the activation fails after the identity writes committed (a fault injected at the activation, stated) — the
 *   provisioning refused, the reserved principal's credential REVOKED (identity.collab_provision_compensated), the principal still marked
 *   external (never a member), the grant still `requested`; the retry provisions a FRESH principal; the abandoned one cannot sign in.
 *   R1 · REFUSAL (a): the workspace owner cannot provision (403 at executive.collab.provision) and cannot create the principal at the
 *   identity route either (identity.principal.create on the identity authority, 403) — nor can a domain administrator; the requester is
 *   refused as provisioner by the port (two acts, two people); a provisioned grant cannot be provisioned again (409).
 *   R2 · REFUSAL (b): from the catalog — no function outside the identity schema that writes identity.* is executable by the commit or the
 *   application role, none lives in the executive schema, and each one there is (the three pre-B34 agent-session extensions, 0057/0060/
 *   0063/0086) is gated on the identity-operation mode and executable by eye_identity alone; eye_commit holds no INSERT/UPDATE/DELETE on
 *   identity.principals, credentials or role_bindings, and a direct INSERT under the commit role is REFUSED (42501).
 *   R3 · REFUSAL (c): the 0090 bypass is gone — executive.invite_collaborator and the 7-argument accept_collaboration no longer exist, and
 *   no executive function's body names an identity write.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { PrincipalsCapability } from '../../src/shared/capabilities.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { WorkflowController } from '../../src/executive/workflow/workflow.controller.js';
import { CollabService } from '../../src/executive/workflow/collab.service.js';
import { CollabIdentityService } from '../../src/executive/workflow/collab-identity.service.js';
import { AuthController } from '../../src/pipeline/auth.controller.js';
import { IdentityService } from '../../src/identity/identity.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let wf: WorkflowController; let timer: AttentionTimerService; let collab: CollabService; let collabIdentity: CollabIdentityService;
let auth: AuthController; let identity: IdentityService;
let tenantAdmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let chief: AuthenticatedPrincipal; let caseOwner: AuthenticatedPrincipal;
let agentId = ''; let ws = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const PURPOSE = 'collaboration.b34f-identity-review';
const PASSWORD = ['partner', 'reviewer', 'b34f', 'synthetic'].join('-');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
const evidence = (caseName: string, e: Row): void => console.log(`B34-F1 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the routes (in process) ───────────── */
const r = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null, purpose = PURPOSE) => h.req(as, action, type, id, purpose);
const openWs = (payload: Row, as = caseOwner) => wf.openWorkspace(r(as, 'executive.collab.workspace.open', 'CWS', null), T(), D(), { payload }) as Promise<{ workspace: Row }>;
const getWs = (id: string, as: AuthenticatedPrincipal) => wf.getWorkspace(r(as, 'executive.collab.read', 'CWS', id), T(), D(), id) as unknown as Promise<Row & { grants: Row[]; tasks: Row[] }>;
const post = (id: string, payload: Row, as: AuthenticatedPrincipal) => wf.postMessage(r(as, 'executive.collab.discuss', 'CWS', id), T(), D(), id, { payload }) as Promise<{ message: Row }>;
const requestReview = (id: string, payload: Row, as = caseOwner) => wf.requestReview(r(as, 'executive.collab.review.request', 'HTK', null), T(), D(), id, { payload }) as Promise<{ task: Row }>;
const request = (id: string, payload: Row, as = caseOwner) => wf.invite(r(as, 'executive.collab.invite', 'CGR', null), T(), D(), id, { payload }) as Promise<{ grant: Row }>;
const provision = (grantId: string, as = tenantAdmin) => wf.provisionInvitation(r(as, 'executive.collab.provision', 'CGR', grantId), T(), D(), grantId) as Promise<{ grant: Row }>;
const accept = (grantId: string, payload: Row, as: AuthenticatedPrincipal) => wf.acceptInvitation(r(as, 'executive.collab.accept', 'CGR', grantId), T(), D(), grantId, { payload }) as Promise<{ grant: Row }>;
const revoke = (grantId: string, reason: string, as = caseOwner) => wf.revokeGrant(r(as, 'executive.collab.grant.revoke', 'CGR', grantId), T(), D(), grantId, { payload: { reason } }) as Promise<{ grant: Row }>;
const invitee = (label: string, seconds?: number): Row => ({ display_name: `${label} (partner firm, SYNTHETIC)`, contact_label: `${label.toLowerCase().replace(/\s+/g, '.')}@partner.example (SYNTHETIC)`,
  audience_ceiling: 'internal', ...(seconds === undefined ? { expires_in_days: 14 } : { expires_at: new Date(Date.now() + seconds * 1000).toISOString() }) });

/** The real sign-in route (in process): the principal the session verifies to, or the refusal. */
const signIn = async (username: string, password: string): Promise<AuthenticatedPrincipal> => {
  const out = await auth.login({ eyeCorrelationId: uuidv7(), path: '/v1/auth/login', method: 'POST', headers: {} } as never, { payload: { username, password } });
  const p = await identity.verifyAccess(out.tokens.accessToken);
  if (p === null) throw new Error('the fresh session did not verify');
  return p;
};
let slot = 0;
const tick = async (): Promise<{ steps: Record<string, Row>; after: Record<string, Row> }> => {
  const o = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, 1) + (slot++) * 60_000) });
  expect(o.outcome, JSON.stringify(o.run?.outputs ?? o.stopReason).slice(0, 600)).toBe('finished');
  return { steps: (o.run?.outputs['steps'] ?? {}) as Record<string, Row>, after: (o.run?.outputs['after'] ?? {}) as Record<string, Row> };
};

/* ───────────── the identity rows, read by the superuser ───────────── */
const principalRow = async (id: string) => (await sql<{ kind: string; scope: string; status: string; epoch: string; login: string | null; affiliation: string }>`
  select kind, scope, status, revocation_epoch::text epoch, login_name login, executive.principal_affiliation(id) affiliation from identity.principals where id = ${id}::uuid`.execute(su)).rows[0];
const bindingRows = async (id: string) => (await sql<{ role: string; scope: string; granted_by: string | null; revoked: boolean }>`
  select role_code role, scope, granted_by_principal::text granted_by, revoked_at is not null revoked from identity.role_bindings where principal_id = ${id}::uuid`.execute(su)).rows;
const credentialRows = async (id: string) => (await sql<{ status: string; expires_at: Date | null }>`
  select status, expires_at from identity.credentials where principal_id = ${id}::uuid order by created_at`.execute(su)).rows;
const liveSessions = async (id: string) => Number((await sql<{ n: number }>`select count(*)::int n from identity.sessions where principal_id = ${id}::uuid and status = 'active'`.execute(su)).rows[0]!.n);
/** The identity audit events (partition platform) about a subject: their types, in order. */
const identityEvents = async (subject: string) => (await sql<{ t: string; action: string }>`
  select event_jcs::jsonb ->> 'event_type' t, event_jcs::jsonb ->> 'action' action from audit.audit_events
   where partition_id = 'platform' and event_jcs::jsonb -> 'metadata' ->> 'subject' = ${subject} order by audit_seq`.execute(su)).rows;
/** The governed write that created the principal (the identity authority's POL/AUD): its action and outcome. */
const creationEvidence = async (principal: string) => (await sql<{ action: string; outcome: string }>`
  select event_jcs::jsonb ->> 'action' action, event_jcs::jsonb ->> 'outcome' outcome from audit.audit_events
   where event_jcs::jsonb ->> 'target_id' = ${principal} and event_jcs::jsonb ->> 'action' = 'identity.principal.create'`.execute(su)).rows;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  w = await bootDecisionWorld(h);
  wf = h.app.get(WorkflowController); timer = h.app.get(AttentionTimerService); collab = h.app.get(CollabService); collabIdentity = h.app.get(CollabIdentityService);
  auth = h.app.get(AuthController); identity = h.app.get(IdentityService);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b34f-tenant-admin', 'TENANT');
  dadmin = await h.humanWithSession(['domain_admin'], 'b34f-domain-admin');
  chief = await h.humanWithSession(['executive'], 'b34f-chief-of-staff');
  caseOwner = await h.humanWithSession(['decision_owner'], 'b34f-case-owner');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const a = await h.app.get(Ec).registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: {
    kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: chief.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } } }) as { agent: { agentId: string } };
  agentId = a.agent.agentId;
  const pkg = (await decisionCalls(h, w).declare({ decisionObjectId: w.decisionId, title: 'Partner review of the corridor case (B34-F1 harness)', statement: 'whether to take a partner\'s review', owner: w.owner.principalId })).package.packageId;
  ws = String((await openWs({ title: 'Corridor case — partner review (B34-F1)', subject: { kind: 'decision_package', id: pkg }, purpose: PURPOSE, classification_ceiling: 'confidential' })).workspace['workspace_id']);
}, 600_000);

afterAll(async () => {
  vi.restoreAllMocks();
  try {
    const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
    if (agentId !== '') await h.app.get(Ec).revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason: 'the B34-F1 harness is done' } });
  } catch { /* already revoked */ }
  await h?.close();
}, 120_000);

describe('B34-F1 · the external collaborator\'s identity through the identity authority (0091)', () => {
  it('P1 · request → provision (identity authority) → sign in → accept (rotation) → work inside the grant → revocation and expiry lapse the credential, the sessions and the tasks', async () => {
    // THE REQUEST: the owner's act — the grant `requested`, no principal, no identity row
    const req1 = (await request(ws, invitee('Partner reviewer'))).grant;
    expect(req1).toMatchObject({ state: 'requested', purpose: PURPOSE, audience_ceiling: 'internal', requested_by: caseOwner.principalId });
    expect(JSON.stringify(req1)).not.toMatch(/principal_id|login_name|token/);
    const grantId = String(req1['grant_id']);
    expect((await sql<{ principal_id: string | null; state: string }>`select principal_id::text, state from executive.collab_grants where grant_id = ${grantId}::uuid`.execute(su)).rows[0])
      .toEqual({ principal_id: null, state: 'requested' });
    // THE PROVISIONING: the tenant administrator, through the identity authority
    const g = (await provision(grantId)).grant;
    const extId = String(g['principal_id']); const login = String(g['login_name']);
    expect(g).toMatchObject({ state: 'invited', requested_by: caseOwner.principalId, provisioned_by: tenantAdmin.principalId, mail: { channel: 'demo-mailbox', synthetic: true } });
    expect(JSON.stringify(g)).not.toMatch(/token/i);
    expect(await principalRow(extId)).toMatchObject({ kind: 'human', scope: 'DOMAIN', status: 'active', login, affiliation: 'external' });
    // the binding's grantor is the administrator: identity.create_principal derived it from the bound context (0090's INSERT left it NULL)
    expect(await bindingRows(extId)).toEqual([{ role: 'external_collaborator', scope: 'DOMAIN', granted_by: tenantAdmin.principalId, revoked: false }]);
    const inviteCred = await credentialRows(extId);
    expect(inviteCred.map((c) => c.status)).toEqual(['active']);
    expect(inviteCred[0]!.expires_at?.toISOString()).toBe(new Date(String(g['invitation_expires_at'])).toISOString());
    expect(await creationEvidence(extId), 'the identity authority\'s own governed write created the principal').toEqual([{ action: 'identity.principal.create', outcome: 'success' }]);
    expect((await identityEvents(extId)).map((e) => `${e.t}|${e.action}`)).toEqual(['identity.collab_invitation_credential_issued|identity.principal.create']);
    expect((await sql<{ ok: boolean }>`select decision.is_active_human(${extId}::uuid, ${T()}::uuid) ok`.execute(su)).rows[0]!.ok, 'an external is never a member').toBe(false);
    // SIGNED IN WITH THE INVITATION CREDENTIAL; ACCEPTED — the rotation by the identity authority
    const mail = collab.syntheticInvitation(grantId)!;
    const withToken = await signIn(login, mail.token);
    const epochBefore = (await principalRow(extId))!.epoch;
    const acc = (await accept(grantId, { token: mail.token, password: PASSWORD }, withToken)).grant;
    expect(acc).toMatchObject({ state: 'accepted', repeated: false, credential: 'rotated by the identity authority', credential_expires_at: g['expires_at'] });
    const rotated = await credentialRows(extId);
    expect(rotated.map((c) => c.status)).toEqual(['revoked', 'active']);
    expect(rotated[1]!.expires_at?.toISOString(), 'the password expires WITH THE GRANT').toBe(new Date(String(g['expires_at'])).toISOString());
    expect(await liveSessions(extId), 'the invitation session revoked').toBe(0);
    expect(BigInt((await principalRow(extId))!.epoch)).toBeGreaterThan(BigInt(epochBefore));
    expect((await identityEvents(extId)).map((e) => e.t)).toEqual(['identity.collab_invitation_credential_issued']);
    const rotation = (await sql<{ t: string }>`select event_jcs::jsonb ->> 'event_type' t from audit.audit_events where partition_id = 'platform'
      and event_jcs::jsonb ->> 'actor' = ${`principal:${extId}`} and event_jcs::jsonb ->> 'action' = 'identity.credential.rotate'`.execute(su)).rows;
    expect(rotation.map((x) => x.t)).toEqual(['identity.credential_rotated']);
    await refused(signIn(login, mail.token), /./, 401);
    // a repeated acceptance with the same token: the port answers repeated, the rotation refuses (the token no longer matches) — it ran once
    const ext = await signIn(login, PASSWORD);
    await refused(accept(grantId, { token: mail.token, password: PASSWORD }, ext), /^collaboration grant rejected \(credential\)/, 403, 'EYE-AUT-001');
    expect((await credentialRows(extId)).map((c) => c.status)).toEqual(['revoked', 'active']);
    // WORKS INSIDE THE GRANT
    const seen = await getWs(ws, ext);
    expect(seen['viewer']).toMatchObject({ affiliation: 'external', ceiling: 'internal' });
    expect((await post(ws, { thread_title: 'Classification opinion', body: 'The housings classify under the aluminium heading (partner firm, SYNTHETIC).' }, ext)).message).toMatchObject({ affiliation: 'external' });
    const task = String((await requestReview(ws, { reviewer: extId, title: 'Review the route summary', escalation: { principal: chief.principalId, max_escalations: 0 }, request_key: 'b34f-partner-review' })).task['task_id']);
    // REVOKED by the owner: the grant ended, then the identity authority revokes at once
    const rv = (await revoke(grantId, 'the engagement ended (B34-F1 harness)')).grant;
    expect(rv).toMatchObject({ state: 'revoked', principal: extId, access: { principal: extId, credentials_revoked: 1, sessions_revoked: 1, epoch_bumped: true } });
    expect((await credentialRows(extId)).map((c) => c.status)).toEqual(['revoked', 'revoked']);
    expect(await liveSessions(extId)).toBe(0);
    expect((await identityEvents(extId)).map((e) => `${e.t}|${e.action}`).at(-1)).toBe('identity.collab_access_revoked|identity.credential.revoke');
    await refused(getWs(ws, ext), /./, 403);
    await refused(signIn(login, PASSWORD), /./, 401);
    const moved = (await sql<{ assignee: string; reason: string }>`select t.assignee_principal_id::text assignee, a.reason from executive.human_tasks t
      join executive.human_task_assignments a on a.task_id = t.task_id where t.task_id = ${task}::uuid order by a.at desc limit 1`.execute(su)).rows[0];
    expect(moved).toEqual({ assignee: chief.principalId, reason: 'access_lost' });
    // EXPIRY: a second external, a short grant — a real tick lapses it; the after-tick hook revokes its access through the identity authority
    const g2 = (await provision(String((await request(ws, invitee('Short-grant reviewer', 12))).grant['grant_id']))).grant;
    const m2 = collab.syntheticInvitation(String(g2['grant_id']))!;
    await accept(String(g2['grant_id']), { token: m2.token, password: PASSWORD }, await signIn(String(g2['login_name']), m2.token));
    const ext2 = await signIn(String(g2['login_name']), PASSWORD);
    expect(await liveSessions(String(g2['principal_id']))).toBe(1);
    const wait = new Date(String(g2['expires_at'])).getTime() - Date.now() + 700;
    if (wait > 0) await sleep(wait);
    const { steps, after } = await tick();
    const lapsedBy = [...(((steps['workflow-timers']?.['timers'] as Row[]) ?? []).filter((t) => t['kind'] === 'grant.expiry').map((t) => (t['result'] as Row)['grant_id'])),
                      ...(((steps['collab-grant-expiry']?.['lapsed'] as Row[]) ?? []).map((x) => x['grant_id']))];
    expect(lapsedBy).toEqual([g2['grant_id']]);
    expect(((steps['collab-grant-expiry']?.['access_pending'] as Row[]) ?? []).map((x) => x['principal'])).toEqual([g2['principal_id']]);
    expect(after['collab-access-revocation']).toMatchObject({ pending: 1, failed: [], revoked: [{ principal: g2['principal_id'], credentials_revoked: 1, sessions_revoked: 1, epoch_bumped: true, grant_state: 'lapsed' }] });
    expect((await credentialRows(String(g2['principal_id']))).map((c) => c.status)).toEqual(['revoked', 'revoked']);
    await refused(getWs(ws, ext2), /./, 403);
    await refused(signIn(String(g2['login_name']), PASSWORD), /./, 401);
    // the next tick finds nothing left to revoke
    expect((await tick()).after['collab-access-revocation']).toMatchObject({ pending: 0 });
    evidence('P1', { grant: grantId, principal: extId, binding_granted_by: tenantAdmin.principalId, credentials: ['invitation → revoked', 'password (grant expiry) → revoked'],
      identity_events: (await identityEvents(extId)).map((e) => e.t), lapsed: g2['grant_id'], after_tick: after['collab-access-revocation'] });
  }, 240_000);

  it('P2 · THE COMPENSATION: the activation fails after the identity writes committed — the credential revoked, the grant still requested, the retry provisions a fresh principal', async () => {
    const grantId = String((await request(ws, invitee('Compensated reviewer'))).grant['grant_id']);
    const spy = vi.spyOn(collabIdentity, 'activate').mockRejectedValueOnce(new Error('injected activation failure (B34-F1 harness)'));
    const e = await provision(grantId).then(() => null, (err: unknown) => err as Error & { compensation?: Row });
    expect(e?.message).toBe('injected activation failure (B34-F1 harness)');
    expect(spy).toHaveBeenCalledTimes(1);
    const first = (await sql<{ principal_id: string; state: string }>`select principal_id::text, state from executive.collab_grants where grant_id = ${grantId}::uuid`.execute(su)).rows[0]!;
    expect(first.state, 'the grant stays requested').toBe('requested');
    expect(e?.compensation).toMatchObject({ principal: first.principal_id, credentials_revoked: 1, epoch_bumped: true });
    expect((await credentialRows(first.principal_id)).map((c) => c.status)).toEqual(['revoked']);
    expect(await principalRow(first.principal_id)).toMatchObject({ affiliation: 'external' });
    expect((await identityEvents(first.principal_id)).map((x) => x.t)).toEqual(['identity.collab_invitation_credential_issued', 'identity.collab_provision_compensated']);
    const mail = collab.syntheticInvitation(grantId);
    expect(mail, 'nothing was placed in the mailbox').toBeNull();
    // the retry: a fresh principal; the abandoned one cannot sign in and is not a member
    const g = (await provision(grantId)).grant;
    expect(g).toMatchObject({ state: 'invited' });
    expect(g['principal_id']).not.toBe(first.principal_id);
    const abandonedLogin = (await principalRow(first.principal_id))!.login!;
    await refused(signIn(abandonedLogin, 'x'.repeat(24)), /./, 401);
    expect((await sql<{ ok: boolean }>`select decision.is_active_human(${first.principal_id}::uuid, ${T()}::uuid) ok`.execute(su)).rows[0]!.ok).toBe(false);
    expect((await sql<{ e: string }>`select event e from executive.collab_events where details ->> 'grant_id' = ${grantId} order by at`.execute(su)).rows.map((x) => x.e))
      .toEqual(['grant.requested', 'grant.provisioning', 'grant.provisioning', 'grant.invited']);
    evidence('P2', { grant: grantId, abandoned: first.principal_id, compensation: e?.compensation, retried_with: g['principal_id'] });
  }, 120_000);

  it('R1 · (a) the workspace owner cannot provision — 403 at executive.collab.provision and at the identity route; a domain administrator neither; the requester is refused by the port; a provisioned grant is not provisioned twice', async () => {
    const grantId = String((await request(ws, invitee('Refusal reviewer'))).grant['grant_id']);
    await refused(provision(grantId, caseOwner), /./, 403, 'EYE-AUT-001');
    await refused(provision(grantId, dadmin), /./, 403, 'EYE-AUT-001');
    await refused(provision(grantId, chief), /./, 403, 'EYE-AUT-001');
    // the identity route itself (identity.principal.create on the IDENTITY authority — the path the provisioning takes): the owner refused
    for (const who of [caseOwner, dadmin]) {
      const pid = uuidv7();
      await refused(h.pipeline.write({ ...h.env(who, 'identity.principal.create', 'PRN', pid, PURPOSE) }, who,
        { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'identity.principal.create', objectType: 'PRN', objectId: pid, authority: 'identity' }, PrincipalsCapability.write,
        async (cap) => { await cap.createPrincipal({ id: pid, kind: 'human', scope: 'DOMAIN', tenantId: T(), domainId: D(), displayName: 'a self-made external', loginName: `ext-self${pid.slice(-8)}`, secretHash: null, roleCode: 'external_collaborator' });
                         return { result: null, targetType: 'PRN', targetId: pid, targetVersion: '1', outboxEvent: null }; }), /./, 403, 'EYE-AUT-001');
      expect((await sql<{ n: number }>`select count(*)::int n from identity.principals where id = ${pid}::uuid`.execute(su)).rows[0]!.n).toBe(0);
    }
    expect((await sql<{ principal_id: string | null; state: string }>`select principal_id::text, state from executive.collab_grants where grant_id = ${grantId}::uuid`.execute(su)).rows[0])
      .toEqual({ principal_id: null, state: 'requested' });
    // the port: the requester never provisions its own request (a tenant administrator that owns a workspace — planted as its owner, stated)
    const own = uuidv7();
    await sql`insert into executive.collab_grants (grant_id, scope, tenant_id, domain_id, workspace_id, principal_id, purpose, audience_ceiling, expires_at, contact_label, state, display_name, invited_by, correlation_id)
              values (${own}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${ws}::uuid, null, ${PURPOSE}, 'internal', clock_timestamp() + interval '3 days', 'self (SYNTHETIC)', 'requested', 'Self-requested reviewer', ${tenantAdmin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await refused(provision(own), /^collaboration grant rejected \(separation\)/, 403, 'EYE-AUT-001');
    // provisioned once; never twice
    await provision(grantId);
    await refused(provision(grantId), /^collaboration grant rejected \(state\)/, 409, 'EYE-STA-002');
    evidence('R1', { refused_provision: ['decision_owner 403', 'domain_admin 403', 'executive 403'], refused_identity_route: ['decision_owner 403', 'domain_admin 403'], separation: '403', twice: '409' });
  }, 120_000);

  it('R2 · (b) no function outside the identity schema that writes identity.* is reachable from the commit or the application role; the commit role cannot INSERT into the identity tables', async () => {
    const writers = (await sql<{ fn: string; schema: string; definer: boolean; gated: boolean; commit: boolean; app: boolean; identity: boolean }>`
      select n.nspname || '.' || p.proname fn, n.nspname schema, p.prosecdef definer, p.prosrc ~ 'identity_op' gated,
             has_function_privilege('eye_commit', p.oid, 'EXECUTE') commit, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_identity', p.oid, 'EXECUTE') identity
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname not in ('identity', 'pg_catalog', 'information_schema') and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+identity\\.'
       order by 1`.execute(su)).rows;
    // stated: the three agent-session extensions of 0057/0060/0063 (0086 re-declared the extraction one) — identity-operation ports by construction
    expect(writers.map((x) => x.fn)).toEqual(['graph.propagation_agent_session_extend', 'graph.subscription_session_extend', 'intelligence.extraction_agent_session_extend']);
    for (const x of writers) expect(x, x.fn).toMatchObject({ definer: true, gated: true, commit: false, app: false, identity: true });
    expect(writers.filter((x) => x.schema === 'executive')).toEqual([]);
    // the commit role holds no write privilege on the identity tables, and a direct attempt is refused
    const privs = (await sql<{ t: string; ins: boolean; upd: boolean; del: boolean }>`
      select t, has_table_privilege('eye_commit', t, 'INSERT') ins, has_table_privilege('eye_commit', t, 'UPDATE') upd, has_table_privilege('eye_commit', t, 'DELETE') del
        from unnest(array['identity.principals', 'identity.credentials', 'identity.role_bindings', 'identity.sessions']) t`.execute(su)).rows;
    expect(privs.every((x) => !x.ins && !x.upd && !x.del), JSON.stringify(privs)).toBe(true);
    const attempts: Row = {};
    for (const [table, stmt] of [
      ['identity.principals', sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status) values (${uuidv7()}::uuid, 'human', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'forged', 'ext-forged-b34f', 'active')`],
      ['identity.role_bindings', sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${caseOwner.principalId}::uuid, 'external_collaborator', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`],
      ['identity.credentials', sql`insert into identity.credentials (id, principal_id, type, secret_hash, status) values (${uuidv7()}::uuid, ${caseOwner.principalId}::uuid, 'password', 'x', 'active')`],
    ] as const) {
      const out = await su.transaction().execute(async (tx) => {
        await sql`set local role eye_commit`.execute(tx);
        return stmt.execute(tx).then(() => 'written', (err: { code?: string }) => err.code ?? 'error');
      }).catch((err: { code?: string }) => err.code ?? 'error');
      attempts[table] = out;
    }
    expect(attempts).toEqual({ 'identity.principals': '42501', 'identity.role_bindings': '42501', 'identity.credentials': '42501' });
    evidence('R2', { non_identity_writers: writers, commit_privileges: privs, commit_attempts: attempts });
  }, 60_000);

  it('R3 · (c) the 0090 bypass is gone: invite_collaborator and the 7-argument accept_collaboration dropped; no executive function names an identity write', async () => {
    const gone = (await sql<{ invite: string | null; accept7: string | null; accept6: string | null }>`
      select to_regprocedure('executive.invite_collaborator(uuid, uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, text, text, timestamptz, text, text, uuid, uuid)')::text invite,
             to_regprocedure('executive.accept_collaboration(uuid, uuid, uuid, text, text, uuid, uuid)')::text accept7,
             to_regprocedure('executive.accept_collaboration(uuid, uuid, uuid, text, uuid, uuid)')::text accept6`.execute(su)).rows[0]!;
    expect(gone.invite).toBeNull(); expect(gone.accept7).toBeNull(); expect(gone.accept6).not.toBeNull();
    const executiveWriters = (await sql<{ fn: string }>`select p.proname fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'executive' and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+identity\\.'`.execute(su)).rows;
    expect(executiveWriters).toEqual([]);
    // the old call shape, as the commit role would have made it: no such function
    const old = await su.transaction().execute(async (tx) => {
      await sql`set local role eye_commit`.execute(tx);
      return sql`select executive.invite_collaborator(${uuidv7()}::uuid, ${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${ws}::uuid, 'forged', 'ext-forged-0090', 'forged', 'internal',
                 clock_timestamp() + interval '1 day', ${'a'.repeat(64)}, ${'$argon2id$x'}, clock_timestamp() + interval '1 hour', 'forged', ${'b'.repeat(64)}, ${caseOwner.principalId}::uuid, ${uuidv7()}::uuid)`
        .execute(tx).then(() => 'reached', (err: { code?: string }) => err.code ?? 'error');
    }).catch((err: { code?: string }) => err.code ?? 'error');
    expect(old, 'undefined_function').toBe('42883');
    evidence('R3', { dropped: ['executive.invite_collaborator/17', 'executive.accept_collaboration/7'], executive_identity_writers: executiveWriters, old_call: old });
  }, 60_000);
});
