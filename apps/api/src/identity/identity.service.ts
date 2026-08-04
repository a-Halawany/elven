/**
 * Identity service — CP-IAM-01 (ADR-P0-04, EXC-P0-002).
 * Local credential IdP behind a federation-shaped surface: argon2id passwords,
 * short-lived HS256 access tokens (kid-rotatable), hashed refresh tokens bound
 * to revocable sessions. Authentication precedes scope resolution (ADR-P0-08).
 */
import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { sql } from 'kysely';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import { APP_DB } from '../shared/shared.module.js';
import type { Db } from '../shared/db.js';
import { newId } from '../shared/ids.js';
import type { Scope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';

export type { AuthenticatedPrincipal, RoleBinding } from '../shared/auth-types.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

@Injectable()
export class IdentityService {
  private readonly secret: Uint8Array;

  constructor(
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    @Inject(APP_DB) private readonly db: Db,
  ) {
    this.secret = new TextEncoder().encode(cfg['eye.identity.jwt_secret']);
  }

  /** Login — bounded auth lookup (SECURITY DEFINER); failures return null (caller routes to security intake). */
  async login(username: string, password: string): Promise<{ principalId: string; tokens: TokenPair } | null> {
    const rows = await sql<{
      principal_id: string; kind: string; scope: string; tenant_id: string | null;
      domain_id: string | null; status: string; credential_id: string; secret_hash: string;
    }>`select * from identity.auth_lookup(${username})`.execute(this.db);
    const row = rows.rows[0];
    if (!row) return null;
    const ok = await argon2.verify(row.secret_hash, password).catch(() => false);
    if (!ok) return null;

    const sessionId = newId();
    const refreshToken = newId() + '.' + newId();
    const expiresAt = new Date(Date.now() + this.cfg['eye.identity.refresh_ttl_seconds'] * 1000);
    await this.db
      .insertInto('identity.sessions')
      .values({
        id: sessionId,
        principal_id: row.principal_id,
        assurance: 'password',
        status: 'active',
        refresh_token_hash: sha256(refreshToken),
        expires_at: expiresAt,
      })
      .execute();

    const accessToken = await this.signAccess(row.principal_id, sessionId, 'password');
    return {
      principalId: row.principal_id,
      tokens: { accessToken, refreshToken, expiresInSeconds: this.cfg['eye.identity.access_ttl_seconds'] },
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair | null> {
    const hash = sha256(refreshToken);
    const session = await this.db
      .selectFrom('identity.sessions')
      .selectAll()
      .where('refresh_token_hash', '=', hash)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!session || new Date(session.expires_at) < new Date()) return null;
    const accessToken = await this.signAccess(session.principal_id, session.id, session.assurance);
    return { accessToken, refreshToken, expiresInSeconds: this.cfg['eye.identity.access_ttl_seconds'] };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db
      .updateTable('identity.sessions')
      .set({ status: 'revoked', revoked_at: new Date() })
      .where('id', '=', sessionId)
      .execute();
  }

  /**
   * Verify an access token → AuthenticatedPrincipal (ADR-P0-08 step 2).
   * Session revocation is re-checked on every request (continuous authorization).
   */
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

    const session = await this.db
      .selectFrom('identity.sessions')
      .select(['id', 'status', 'expires_at'])
      .where('id', '=', payload.sid)
      .executeTakeFirst();
    if (!session || session.status !== 'active' || new Date(session.expires_at) < new Date()) return null;

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
      assurance: (payload.asr as AuthenticatedPrincipal['assurance']) ?? 'password',
      bindings,
    };
  }

  private async signAccess(principalId: string, sessionId: string, assurance: string): Promise<string> {
    return new SignJWT({ sid: sessionId, asr: assurance })
      .setProtectedHeader({ alg: 'HS256', kid: this.cfg['eye.identity.jwt_kid'] })
      .setSubject(principalId)
      .setIssuer(this.cfg['eye.identity.jwt_issuer'])
      .setAudience(this.cfg['eye.identity.jwt_audience'])
      .setIssuedAt()
      .setExpirationTime(`${this.cfg['eye.identity.access_ttl_seconds']}s`)
      .sign(this.secret);
  }
}
