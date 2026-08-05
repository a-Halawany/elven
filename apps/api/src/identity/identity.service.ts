/**
 * Identity service — CP-IAM-01 (ADR-P0-04/17, remediation R3/R4/R6).
 *
 * All credential/session state is reached ONLY through narrow SECURITY DEFINER
 * ports (direct table privileges are revoked). Authentication uses the unique
 * `login_name` (display_name is display-only). Auth flows that mutate state
 * (login/rotate/refresh) are executed by the AuthController inside ONE
 * transaction together with their audit evidence on the SYSTEM pool — this
 * service exposes tx-scoped primitives for that.
 */
import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
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

export const MIN_PASSWORD_LENGTH = 12;

@Injectable()
export class IdentityService {
  private readonly secret: Uint8Array;

  constructor(
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    @Inject(APP_DB) private readonly db: Db,
  ) {
    this.secret = new TextEncoder().encode(cfg['eye.identity.jwt_secret']);
  }

  // ===== verification primitives (no state mutation) =====

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

  // ===== session primitives (tx-scoped; caller owns atomicity with audit) =====

  async createSession(
    tx: Tx,
    principalId: string,
    assurance: 'password' | 'break_glass' | 'bootstrap_rotation',
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const sessionId = newId();
    const refreshToken = newId() + '.' + newId();
    const expiresAt = new Date(Date.now() + this.cfg['eye.identity.refresh_ttl_seconds'] * 1000);
    await sql`select identity.session_create(
      ${sessionId}::uuid, ${principalId}::uuid, ${assurance}, ${sha256(refreshToken)}, ${expiresAt}
    )`.execute(tx);
    return { sessionId, refreshToken };
  }

  /**
   * R4: refresh rotation. Atomically replaces the refresh token; detects reuse
   * of the invalidated previous token and revokes the session on reuse.
   */
  async rotateRefreshToken(
    tx: Tx,
    presentedToken: string,
  ): Promise<
    | { outcome: 'rotated'; sessionId: string; principalId: string; assurance: string; newRefreshToken: string }
    | { outcome: 'reuse'; sessionId: string; principalId: string }
    | { outcome: 'invalid' }
  > {
    const newRefreshToken = newId() + '.' + newId();
    const r = (
      await sql<{ outcome: string; session_id: string | null; principal_id: string | null; assurance: string | null }>`
        select * from identity.refresh_rotate(${sha256(presentedToken)}, ${sha256(newRefreshToken)})`.execute(tx)
    ).rows[0];
    if (!r || r.outcome === 'invalid') return { outcome: 'invalid' };
    if (r.outcome === 'reuse') {
      return { outcome: 'reuse', sessionId: r.session_id as string, principalId: r.principal_id as string };
    }
    return {
      outcome: 'rotated',
      sessionId: r.session_id as string,
      principalId: r.principal_id as string,
      assurance: r.assurance as string,
      newRefreshToken,
    };
  }

  /** Credential rotation (forced on first bootstrap use). Tx-scoped; revokes all sessions. */
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
    await sql`select identity.credential_rotate(
      ${principalId}::uuid, ${cred.id}::uuid, ${newId()}::uuid, ${newHash}
    )`.execute(tx);
    return true;
  }

  // ===== access-token verification (read-only; app pool) =====

  async verifyAccess(token: string): Promise<AuthenticatedPrincipal | null> {
    let payload: { sub?: string; sid?: string; asr?: string };
    try {
      const r = await jwtVerify(token, this.secret, {
        issuer: this.cfg['eye.identity.jwt_issuer'],
        audience: this.cfg['eye.identity.jwt_audience'],
      });
      payload = r.payload as typeof payload;
    } catch {
      return null;
    }
    if (!payload.sub || !payload.sid) return null;

    const session = (
      await sql<{ id: string; principal_id: string; assurance: string }>`
        select * from identity.session_get_active(${payload.sid}::uuid)`.execute(this.db)
    ).rows[0];
    if (!session || session.principal_id !== payload.sub) return null;

    const p = (
      await sql<{
        principal_id: string; kind: string; scope: string;
        tenant_id: string | null; domain_id: string | null; status: string;
      }>`select * from identity.auth_principal(${payload.sub}::uuid)`.execute(this.db)
    ).rows[0];
    if (!p || p.status !== 'active') return null;

    const bindings = (
      await sql<{ role_code: string; scope: string; tenant_id: string | null; domain_id: string | null }>`
        select * from identity.auth_bindings(${payload.sub}::uuid)`.execute(this.db)
    ).rows.map((b) => ({
      roleCode: b.role_code,
      scope: b.scope as Scope,
      tenantId: b.tenant_id,
      domainId: b.domain_id,
    }));

    return {
      principalId: p.principal_id,
      sessionId: session.id,
      kind: p.kind as AuthenticatedPrincipal['kind'],
      homeScope: p.scope as Scope,
      homeTenantId: p.tenant_id,
      homeDomainId: p.domain_id,
      assurance: (session.assurance as AuthenticatedPrincipal['assurance']) ?? 'password',
      bindings,
    };
  }

  async signAccess(principalId: string, sessionId: string, assurance: string): Promise<string> {
    return new SignJWT({ sid: sessionId, asr: assurance })
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
