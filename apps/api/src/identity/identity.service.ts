/**
 * Identity service — CP-IAM-01 (ADR-P0-04/17; Gate-2 §1/§2/§7).
 *
 * All credential/session state is reached ONLY through narrow SECURITY DEFINER
 * ports executed on the dedicated IDENTITY pool (eye_identity). The ordinary
 * application role holds no identity-mutation capability at all.
 *
 * Context proof-of-possession (Gate-2 §2): every session carries a random
 * CONTEXT KEY whose hash is stored on the session row. The plaintext travels
 * only inside the signed access token (`ctxk` claim), so establishing an
 * authoritative database context requires possession of a live token for that
 * exact session — holding the application credential is not enough.
 *
 * Refresh tokens live in an append-only FAMILY LEDGER: replay of ANY previously
 * invalidated generation (n-1, n-2, n-10, …) is theft evidence and revokes the
 * whole family. Only hashes are ever stored.
 */
import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { sql } from 'kysely';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import { APP_DB } from '../shared/shared.module.js';
import type { Db, Tx } from '../shared/db.js';
import { newId } from '../shared/ids.js';
import type { Scope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';

export type { AuthenticatedPrincipal, RoleBinding } from '../shared/auth-types.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface VerifiedCredential {
  principalId: string;
  credentialId: string;
  mustRotate: boolean;
  expiredUnused: boolean;
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const freshKey = (): string => randomBytes(32).toString('base64url');

export const MIN_PASSWORD_LENGTH = 12;

@Injectable()
export class IdentityService {
  private readonly secret: Uint8Array;

  constructor(
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    // Read-only pool: used ONLY for the per-request session/binding re-check.
    @Inject(APP_DB) private readonly db: Db,
  ) {
    this.secret = new TextEncoder().encode(cfg['eye.identity.jwt_secret']);
  }

  // ===== verification primitives (no state mutation; identity tx) =====

  /** Verify login_name + password. Never logs or stores the password. */
  async verifyPassword(tx: Tx, loginName: string, password: string): Promise<VerifiedCredential | null> {
    const rows = await sql<{
      principal_id: string; credential_id: string; secret_hash: string;
      credential_status: string; credential_expires_at: Date | null;
    }>`select principal_id, credential_id, secret_hash, credential_status, credential_expires_at
       from identity.auth_lookup(${loginName})`.execute(tx);
    const row = rows.rows[0];
    if (!row) return null;
    const ok = await argon2.verify(row.secret_hash, password).catch(() => false);
    if (!ok) return null;
    const mustRotate = row.credential_status === 'must_rotate';
    const expiredUnused =
      mustRotate && row.credential_expires_at !== null && new Date(row.credential_expires_at) < new Date();
    return { principalId: row.principal_id, credentialId: row.credential_id, mustRotate, expiredUnused };
  }

  async revokeCredential(tx: Tx, credentialId: string): Promise<void> {
    await sql`select identity.credential_revoke(${credentialId}::uuid)`.execute(tx);
  }

  // ===== session primitives (identity pool; caller owns atomicity with audit) =====

  /**
   * Open a session: generates the refresh token AND the context key, stores
   * only their hashes, and starts a new token family.
   */
  async openSession(
    tx: Tx,
    principalId: string,
    assurance: 'password' | 'break_glass' | 'bootstrap_rotation',
  ): Promise<{ sessionId: string; refreshToken: string; contextKey: string }> {
    const sessionId = newId();
    const familyId = newId();
    const refreshToken = `${newId()}.${randomBytes(24).toString('base64url')}`;
    const contextKey = freshKey();
    const expiresAt = new Date(Date.now() + this.cfg['eye.identity.refresh_ttl_seconds'] * 1000);
    await sql`select identity.session_open(
      ${sessionId}::uuid, ${principalId}::uuid, ${assurance}, ${sha256(refreshToken)},
      ${sha256(contextKey)}, ${expiresAt}, ${familyId}::uuid
    )`.execute(tx);
    return { sessionId, refreshToken, contextKey };
  }

  /**
   * Refresh rotation over the append-only family ledger. Any invalidated
   * generation presented again is reuse: the family is revoked and the
   * principal's revocation epoch is bumped, which also kills every outstanding
   * database context.
   */
  async rotateRefreshToken(
    tx: Tx,
    presentedToken: string,
  ): Promise<
    | { outcome: 'rotated'; sessionId: string; principalId: string; assurance: string;
        newRefreshToken: string; newContextKey: string; generation: number }
    | { outcome: 'reuse'; sessionId: string; principalId: string; generation: number }
    | { outcome: 'invalid' }
  > {
    const newRefreshToken = `${newId()}.${randomBytes(24).toString('base64url')}`;
    const newContextKey = freshKey();
    const r = (
      await sql<{
        outcome: string; session_id: string | null; principal_id: string | null;
        assurance: string | null; generation: number | null;
      }>`select * from identity.refresh_rotate_family(
           ${sha256(presentedToken)}, ${sha256(newRefreshToken)}, ${sha256(newContextKey)})`.execute(tx)
    ).rows[0];
    if (!r || r.outcome === 'invalid') return { outcome: 'invalid' };
    if (r.outcome === 'reuse') {
      return {
        outcome: 'reuse',
        sessionId: r.session_id as string,
        principalId: r.principal_id as string,
        generation: Number(r.generation ?? 0),
      };
    }
    return {
      outcome: 'rotated',
      sessionId: r.session_id as string,
      principalId: r.principal_id as string,
      assurance: r.assurance as string,
      newRefreshToken,
      newContextKey,
      generation: Number(r.generation ?? 0),
    };
  }

  /** Credential rotation (forced on first bootstrap use). Bumps the epoch. */
  async rotateCredential(tx: Tx, principalId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    if (newPassword.length < MIN_PASSWORD_LENGTH) return false;
    const cred = (
      await sql<{ id: string; secret_hash: string }>`
        select id, secret_hash from identity.credential_get_active(${principalId}::uuid)`.execute(tx)
    ).rows[0];
    if (!cred) return false;
    const ok = await argon2.verify(cred.secret_hash, currentPassword).catch(() => false);
    if (!ok) return false;
    const newHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await sql`select identity.credential_rotate_v2(
      ${principalId}::uuid, ${cred.id}::uuid, ${newId()}::uuid, ${newHash}
    )`.execute(tx);
    return true;
  }

  // ===== access-token verification (read-only; app pool) =====

  async verifyAccess(token: string): Promise<AuthenticatedPrincipal | null> {
    let payload: { sub?: string; sid?: string; asr?: string; ctxk?: string };
    try {
      const r = await jwtVerify(token, this.secret, {
        issuer: this.cfg['eye.identity.jwt_issuer'],
        audience: this.cfg['eye.identity.jwt_audience'],
      });
      payload = r.payload as typeof payload;
    } catch {
      return null;
    }
    if (!payload.sub || !payload.sid || !payload.ctxk) return null;

    // Gate-2.1 §5: CALLER-BOUND lookups. The application role can resolve only
    // the subject of the session whose context key it presents — it can no longer
    // probe an arbitrary principal, binding or session UUID across tenants.
    const subject = (
      await sql<{
        session_id: string; principal_id: string; assurance: string; kind: string;
        scope: string; tenant_id: string | null; domain_id: string | null; status: string;
      }>`select * from identity.session_subject(${payload.sid}::uuid, ${payload.ctxk})`.execute(this.db)
    ).rows[0];
    if (!subject || subject.principal_id !== payload.sub) return null;

    const bindings = (
      await sql<{ role_code: string; scope: string; tenant_id: string | null; domain_id: string | null }>`
        select * from identity.session_bindings(${payload.sid}::uuid, ${payload.ctxk})`.execute(this.db)
    ).rows.map((b) => ({
      roleCode: b.role_code,
      scope: b.scope as Scope,
      tenantId: b.tenant_id,
      domainId: b.domain_id,
    }));

    return {
      principalId: subject.principal_id,
      sessionId: subject.session_id,
      contextKey: payload.ctxk,
      kind: subject.kind as AuthenticatedPrincipal['kind'],
      homeScope: subject.scope as Scope,
      homeTenantId: subject.tenant_id,
      homeDomainId: subject.domain_id,
      assurance: (subject.assurance as AuthenticatedPrincipal['assurance']) ?? 'password',
      bindings,
    };
  }

  async signAccess(principalId: string, sessionId: string, assurance: string, contextKey: string): Promise<string> {
    return new SignJWT({ sid: sessionId, asr: assurance, ctxk: contextKey })
      .setProtectedHeader({ alg: 'HS256', kid: this.cfg['eye.identity.jwt_kid'] })
      .setSubject(principalId)
      .setIssuer(this.cfg['eye.identity.jwt_issuer'])
      .setAudience(this.cfg['eye.identity.jwt_audience'])
      .setIssuedAt()
      .setExpirationTime(`${this.cfg['eye.identity.access_ttl_seconds']}s`)
      .sign(this.secret);
  }

  get accessTtlSeconds(): number {
    return this.cfg['eye.identity.access_ttl_seconds'];
  }
}
