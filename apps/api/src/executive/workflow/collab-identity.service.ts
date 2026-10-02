/**
 * THE EXTERNAL COLLABORATOR'S IDENTITY, ON THE IDENTITY AUTHORITY — CP-6 B34-F1 (migration 0091; the owner's bounded B34 review of
 * 2026-09-29). 0090's collaboration ports wrote identity.principals, identity.role_bindings and identity.credentials from definer ports
 * reached under the COMMIT authority; 0091 removed every one of those writes. What they did is done here, through the identity ports only
 * (Gate-2 §1/§3: principals.service.ts; 0011 ctx.issue_identity_op — its declared operations, none added):
 *
 *   PROVISION (an identity administrator; never the requester) — four acts in order:
 *     1. executive.reserve_collaborator (commit, executive.collab.provision): the principal id and login about to be created, and the
 *        EXTERNAL marker recorded FIRST (the identity row never exists without it — a marker-less principal would be a member);
 *     2. identity.create_principal (IDENTITY authority, identity.principal.create — the Phase 0 principals route's own path): a DOMAIN
 *        human whose only role is external_collaborator, no credential;
 *     3. identity.credential_issue (IDENTITY_DB, ctx.issue_identity_op('identity.principal.create', <it>)): the one-time invitation
 *        credential (the token's argon2id hash) expiring with the invitation window — with its identity audit event;
 *     4. executive.activate_collaborator (commit, executive.collab.provision): the identity rows VERIFIED, the grant `invited`.
 *     A failure after 2 is COMPENSATED here (revokeAccess: every credential revoked, the sessions revoked, the epoch bumped) and the
 *     original refusal re-thrown; the grant stays `requested` (a retry reserves a fresh principal).
 *   ACCEPT (the invitee) — the acceptance recorded commit-side first (its checks: the token's hash, the invitee, the purpose, the
 *     window), then the invitation credential ROTATED to the invitee's password (ctx.issue_identity_op('identity.credential.rotate',
 *     <the invitee>): the token verified against the active credential, identity.credential_revoke, identity.credential_issue expiring
 *     WITH THE GRANT, identity.sessions_revoke_all_v2 — credential_rotate_v2's own steps, composed because it cannot carry the expiry).
 *   REVOKE / LAPSE — the grant ended commit-side first (the owner and the state are the port's to check; the tick's write is never
 *     nested around an identity write), then revokeAccess (ctx.issue_identity_op('identity.credential.revoke', <the external>)). What a
 *     failure leaves live, executive.collab_access_pending finds and the after-tick hook `collab-access-revocation` revokes.
 *
 * Every identity act commits ATOMICALLY with its identity audit event (audit.commit_identity_event), as the auth routes' acts do.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import * as argon2 from 'argon2';
import { errorBody, type Envelope } from '@eye/contracts';
import { IDENTITY_DB } from '../../shared/shared.module.js';
import type { Db, Tx } from '../../shared/db.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PrincipalsCapability } from '../../shared/capabilities.js';
import { newId } from '../../shared/ids.js';
import { PrincipalsService } from '../../identity/principals.service.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { WorkflowCapability } from './workflow.capabilities.js';
import { CollabService, EXTERNAL_ROLE } from './collab.service.js';

type Row = Record<string, unknown>;
/** Who an identity act is recorded against: the acting principal and, for a route, its session (a tick has none). */
export interface IdentityActor { principalId: string; sessionId: string | null }
export interface AccessRevocation { principal: string; credentials_revoked: number; sessions_revoked: number; epoch_bumped: true }

/** The login an invitee is created with (derived from its principal id: unique, never chosen by a person). */
export const inviteeLogin = (principalId: string): string => `ext-${principalId.replace(/-/g, '').slice(-12)}`;

@Injectable()
export class CollabIdentityService {
  constructor(@Inject(IDENTITY_DB) private readonly identityDb: Db, private readonly pipeline: PipelineService, private readonly principals: PrincipalsService,
              private readonly collab: CollabService) {}

  /** One declared identity operation bound to its subject (0011, 0017): nothing else can run in this transaction. */
  private async inIdentityOp<T>(operation: string, subject: string, correlationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.identityDb.transaction().execute(async (tx) => {
      await sql`select ctx.issue_identity_op(${operation}, ${subject}::uuid, ${correlationId}::uuid, 60)`.execute(tx);
      return fn(tx);
    });
  }
  private async identityEvent(tx: Tx, actor: IdentityActor, eventType: string, action: string, correlationId: string, metadata: Row): Promise<void> {
    await sql`select audit.commit_identity_event(${actor.principalId}::uuid, ${actor.sessionId}::uuid, ${eventType}, ${action}, 'success', 'OK', ${correlationId}::uuid,
      ${JSON.stringify(metadata)}::jsonb)`.execute(tx);
  }
  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── provisioning ─────────────────────────
  /**
   * PROVISION a requested invitation (the identity administrator's act; the route's PDP rule executive.collab.provision and the Phase 0
   * identity.principal.create rule admit the same roles). The response never carries the token: it is placed in the SYNTHETIC mailbox
   * once the activation committed.
   */
  async provision(envelope: Envelope, admin: AuthenticatedPrincipal, tenantId: string, domainId: string, grantId: string): Promise<{ grant: Row; receipt: { policyDecisionId: string; auditSeq: number } }> {
    const correlationId = envelope.correlation_id;
    const principalId = newId(); const loginName = inviteeLogin(principalId);
    // 1. the reservation (commit): the marker first
    const reserved = (await this.pipeline.write(envelope, admin, this.route(tenantId, domainId, 'executive.collab.provision', 'CGR', grantId), WorkflowCapability.collab,
      async (cap) => ({ result: await cap.reserveInvitee({ grantId, principalId, tenantId, domainId, loginName, actor: admin.principalId, correlationId }), targetType: 'CGR', targetId: grantId,
                        targetVersion: null, outboxEvent: null }))).result;
    // 2. the principal (IDENTITY authority): a DOMAIN human, its only role external_collaborator, no credential yet
    await this.pipeline.write({ ...envelope, action: 'identity.principal.create', message_id: newId() }, admin,
      { ...this.route(tenantId, domainId, 'identity.principal.create', 'PRN', principalId), authority: 'identity' }, PrincipalsCapability.write,
      async (cap) => {
        await this.principals.createPrincipal(cap, { principalId, correlationId, kind: 'human', scope: 'DOMAIN', tenantId, domainId, displayName: String(reserved['display_name']), loginName,
          roleCode: EXTERNAL_ROLE });
        return { result: { principalId }, targetType: 'PRN', targetId: principalId, targetVersion: '1', outboxEvent: null };
      });
    try {
      // 3. the invitation credential (IDENTITY_DB): the token's hash, expiring with the invitation window
      const inv = await this.collab.buildInvitation({ grantId, principalId, workspaceTitle: String(reserved['workspace_title'] ?? 'the workspace'), purpose: String(reserved['purpose'] ?? ''),
        expiresAt: new Date(String(reserved['expires_at'])).toISOString(), nowMs: Date.now(), inviterLabel: `principal ${String(reserved['requested_by'])}` });
      await this.issueInvitationCredential({ principalId, credentialHash: inv.credentialHash, expiresAt: inv.invitationExpiresAt, actor: { principalId: admin.principalId, sessionId: admin.sessionId },
        grantId, correlationId });
      // 4. the activation (commit): what 2 and 3 wrote verified; the timer, the participant, the mailbox record; the grant `invited`
      const out = await this.activate(envelope, admin, tenantId, domainId, grantId, inv);
      this.collab.place(inv);
      return { grant: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
    } catch (e) {
      // THE COMPENSATION: the identity side committed (2, perhaps 3) and the provisioning did not complete — nothing it wrote may sign in
      const compensation = await this.revokeAccess({ principalId, actor: { principalId: admin.principalId, sessionId: admin.sessionId }, grantId,
        reason: 'the provisioning did not complete (compensation)', correlationId, eventType: 'identity.collab_provision_compensated' })
        .then((r) => r as unknown as Row, (err: unknown) => ({ failed: String((err as Error)?.message ?? err).slice(0, 300) }) as Row);
      if (e instanceof Error) (e as Error & { compensation?: Row }).compensation = compensation;
      throw e;
    }
  }

  /** Step 4 (a method of its own: the harness injects a failure here to prove the compensation). */
  async activate(envelope: Envelope, admin: AuthenticatedPrincipal, tenantId: string, domainId: string, grantId: string,
                 inv: { tokenHash: string; invitationExpiresAt: string; mail: { subject: string; bodyDigest: string } }) {
    return this.pipeline.write({ ...envelope, message_id: newId() }, admin, this.route(tenantId, domainId, 'executive.collab.provision', 'CGR', grantId), WorkflowCapability.collab,
      async (cap) => ({ result: await cap.activateInvite({ grantId, tenantId, domainId, tokenHash: inv.tokenHash, invitationExpiresAt: inv.invitationExpiresAt, mailSubject: inv.mail.subject,
                                                           mailBodyDigest: inv.mail.bodyDigest, actor: admin.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'CGR', targetId: grantId, targetVersion: '1', outboxEvent: null }));
  }

  /** The invitation credential: identity.credential_issue under the principal-creation operation bound to the new principal. */
  async issueInvitationCredential(a: { principalId: string; credentialHash: string; expiresAt: string; actor: IdentityActor; grantId: string; correlationId: string }): Promise<void> {
    await this.inIdentityOp('identity.principal.create', a.principalId, a.correlationId, async (tx) => {
      await sql`select identity.credential_issue(${newId()}::uuid, ${a.principalId}::uuid, ${a.credentialHash}, 'active', ${a.expiresAt}::timestamptz)`.execute(tx);
      await this.identityEvent(tx, a.actor, 'identity.collab_invitation_credential_issued', 'identity.principal.create', a.correlationId,
        { subject: a.principalId, grant_id: a.grantId, credential_expires_at: a.expiresAt, kind: 'one-time invitation credential' });
    });
  }

  // ───────────────────────── acceptance ─────────────────────────
  /**
   * The invitee's own rotation: the invitation token verified against its ACTIVE credential (argon2id), that credential revoked, the
   * invitee's password issued EXPIRING WITH THE GRANT, every session revoked and the epoch bumped (the invitee signs in again with the
   * password). False when the token matches no active credential — the rotation already ran, or the token is wrong.
   */
  async rotateOnAcceptance(a: { principalId: string; sessionId: string; token: string; newPassword: string; expiresAt: string; grantId: string; correlationId: string }): Promise<boolean> {
    const newHash = await argon2.hash(a.newPassword, { type: argon2.argon2id });
    return this.inIdentityOp('identity.credential.rotate', a.principalId, a.correlationId, async (tx) => {
      const creds = (await sql<{ id: string; secret_hash: string }>`select id, secret_hash from identity.credential_get_active(${a.principalId}::uuid)`.execute(tx)).rows;
      let matched = false;
      for (const c of creds) if (await argon2.verify(c.secret_hash, a.token).catch(() => false)) matched = true;
      if (!matched) return false;
      for (const c of creds) await sql`select identity.credential_revoke(${c.id}::uuid)`.execute(tx);
      await sql`select identity.credential_issue(${newId()}::uuid, ${a.principalId}::uuid, ${newHash}, 'active', ${a.expiresAt}::timestamptz)`.execute(tx);
      await sql`select identity.sessions_revoke_all_v2(${a.principalId}::uuid)`.execute(tx);
      await this.identityEvent(tx, { principalId: a.principalId, sessionId: a.sessionId }, 'identity.credential_rotated', 'identity.credential.rotate', a.correlationId,
        { via: 'collaboration invitation acceptance', grant_id: a.grantId, credential_expires_at: a.expiresAt, revoked: creds.length });
      return true;
    });
  }

  /**
   * ACCEPT — the acceptance recorded (commit), then the rotation (identity). A rotation refused after a recorded acceptance answers 403 and
   * leaves the grant accepted: the invitee retries with the same token (the port answers `repeated`), and the rotation runs once.
   */
  async accept(envelope: Envelope, invitee: AuthenticatedPrincipal, tenantId: string, domainId: string, grantId: string, token: string, password: string, tokenHash: string) {
    const out = await this.pipeline.write(envelope, invitee, this.route(tenantId, domainId, 'executive.collab.accept', 'CGR', grantId), WorkflowCapability.collab,
      async (cap) => ({ result: await cap.accept({ grantId, tenantId, domainId, tokenHash, actor: invitee.principalId, correlationId: envelope.correlation_id }), targetType: 'CGR', targetId: grantId,
                        targetVersion: '2', outboxEvent: null }));
    const rotated = await this.rotateOnAcceptance({ principalId: invitee.principalId, sessionId: invitee.sessionId, token, newPassword: password,
      expiresAt: new Date(String(out.result['credential_expires_at'])).toISOString(), grantId, correlationId: envelope.correlation_id });
    if (!rotated) {
      throw new HttpException(errorBody('EYE_AUT_001', envelope.correlation_id, 'collaboration grant rejected (credential): the invitation token no longer matches an active credential — the invitation credential was already rotated'), 403);
    }
    return { grant: { ...out.result, credential: 'rotated by the identity authority', sessions: 'revoked — sign in with the new password' },
             receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  // ───────────────────────── the end of access ─────────────────────────
  /** Every credential of the external revoked, every session revoked, the epoch bumped — one identity operation bound to it. */
  async revokeAccess(a: { principalId: string; actor: IdentityActor; grantId: string | null; reason: string; correlationId: string; eventType?: string }): Promise<AccessRevocation> {
    return this.inIdentityOp('identity.credential.revoke', a.principalId, a.correlationId, async (tx) => {
      const creds = (await sql<{ id: string }>`select id from identity.credential_get_active(${a.principalId}::uuid)`.execute(tx)).rows;
      for (const c of creds) await sql`select identity.credential_revoke(${c.id}::uuid)`.execute(tx);
      const n = Number((await sql<{ n: number }>`select identity.sessions_revoke_all_v2(${a.principalId}::uuid) as n`.execute(tx)).rows[0]?.n ?? 0);
      await this.identityEvent(tx, a.actor, a.eventType ?? 'identity.collab_access_revoked', 'identity.credential.revoke', a.correlationId,
        { subject: a.principalId, grant_id: a.grantId, reason: a.reason, credentials_revoked: creds.length, sessions_revoked: n });
      return { principal: a.principalId, credentials_revoked: creds.length, sessions_revoked: n, epoch_bumped: true as const };
    });
  }

  /**
   * REVOKE a grant — ended commit-side (the port checks the owner, the state), then the external's access revoked here. A failure of the
   * identity half is answered (access `pending`) and closed by the next tick's collab-access-revocation.
   */
  async revokeGrant(envelope: Envelope, owner: AuthenticatedPrincipal, tenantId: string, domainId: string, grantId: string, reason: string) {
    const out = await this.pipeline.write(envelope, owner, this.route(tenantId, domainId, 'executive.collab.grant.revoke', 'CGR', grantId), WorkflowCapability.collab,
      async (cap) => ({ result: await cap.revokeGrant({ grantId, tenantId, domainId, reason, actor: owner.principalId, correlationId: envelope.correlation_id }), targetType: 'CGR', targetId: grantId,
                        targetVersion: null, outboxEvent: null }));
    const principal = out.result['principal'];
    const access: Row = typeof principal !== 'string' ? { pending: false, note: 'the grant named no principal' }
      : await this.revokeAccess({ principalId: principal, actor: { principalId: owner.principalId, sessionId: owner.sessionId }, grantId, reason, correlationId: envelope.correlation_id })
          .then((r) => r as unknown as Row, (e: unknown) => ({ pending: true, error: String((e as Error)?.message ?? e).slice(0, 300), closed_by: 'the next tick (collab-access-revocation)' }));
    return { grant: { ...out.result, access }, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** The after-tick hook's body: every principal the tick's step 22 found still live, revoked (each its own identity operation). */
  async revokePending(pending: Row[], actor: IdentityActor, correlationId: string): Promise<Row> {
    const revoked: Row[] = []; const failed: Row[] = [];
    for (const p of pending) {
      const principalId = String(p['principal']);
      try {
        revoked.push({ ...(await this.revokeAccess({ principalId, actor, grantId: typeof p['grant_id'] === 'string' ? p['grant_id'] : null,
          reason: `the grant is ${String(p['grant_state'])} (tick)`, correlationId })), grant_id: p['grant_id'] ?? null, grant_state: p['grant_state'] ?? null });
      } catch (e) {
        failed.push({ principal: principalId, error: String((e as Error)?.message ?? e).slice(0, 300) });
      }
    }
    return { pending: pending.length, revoked, failed };
  }
}
