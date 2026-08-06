/**
 * Authentication endpoints — Gate-2 §1/§2/§3/§6/§7.
 *
 * Runs on the dedicated IDENTITY authority (eye_identity): the ordinary
 * application role holds no identity-mutation capability at all, so it cannot
 * create a session for another principal, issue/rotate/revoke credentials, or
 * mint another principal's context.
 *
 * Every token/session/credential mutation commits ATOMICALLY with its audit
 * evidence in one identity-pool transaction through audit.commit_identity_event
 * (actor derived from a verified principal row, canonical bytes and chain hash
 * computed inside the trusted boundary). If the audit append fails, the mutation
 * rolls back and the request fails closed.
 *
 * Access tokens carry the session's CONTEXT KEY (`ctxk`), the proof of
 * possession that ctx.issue() requires — so establishing authority in the
 * database always presupposes a live token for that exact session.
 */
import { Body, Controller, HttpException, Inject, Post, Req } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { IdentityService, type TokenPair } from '../identity/identity.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Public, recordSecurityFailure, type EyeRequest } from './http.js';
import { IDENTITY_DB } from '../shared/shared.module.js';
import type { Db, Tx } from '../shared/db.js';
import { degradedAudit } from '../shared/degraded-store.js';

interface LoginPayload {
  username?: string;
  password?: string;
}

@Controller('/v1/auth')
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
    @Inject(IDENTITY_DB) private readonly identityDb: Db,
  ) {}

  private async inAuthTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.identityDb.transaction().execute(async (tx) => {
      await sql`select ctx.issue_system('authentication flow')`.execute(tx);
      return fn(tx);
    });
  }

  /** Fail closed when authoritative audit persistence is unavailable. */
  private auditUnavailable(correlationId: string, e: unknown): HttpException {
    degradedAudit.record({
      kind: 'audit_unavailable',
      correlationId,
      route: 'identity.auth',
      failureClass: 'audit_unavailable',
      scope: 'PLATFORM',
      detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      suppressedCarried: 0,
    });
    return new HttpException(
      errorBody('EYE_INT_001', correlationId, 'authoritative audit unavailable — request refused'),
      503,
    );
  }

  @Public()
  @Post('/login')
  async login(
    @Req() req: EyeRequest,
    @Body() body: { payload?: LoginPayload },
  ): Promise<{ principalId: string; tokens: TokenPair; rotationRequired: boolean }> {
    const correlationId = req.eyeCorrelationId ?? req.eyeEnvelope?.correlation_id ?? 'unknown';
    const username = body.payload?.username;
    const password = body.payload?.password;
    if (typeof username !== 'string' || typeof password !== 'string') {
      await recordSecurityFailure(this.audit, req, 'validation_failed', 'EYE-REQ-001', correlationId, ['login payload malformed']);
      throw new HttpException(errorBody('EYE_REQ_001', correlationId), 400);
    }

    let result;
    try {
      result = await this.inAuthTx(async (tx) => {
        const cred = await this.identity.verifyPassword(tx, username, password);
        if (cred === null) return null;
        if (cred.expiredUnused) {
          await this.identity.revokeCredential(tx, cred.credentialId);
          await sql`select audit.commit_identity_event(
            ${cred.principalId}::uuid, null::uuid, 'identity.bootstrap_expired',
            'identity.credential.revoke', 'denied', 'EYE-IDN-002', ${correlationId}::uuid,
            ${JSON.stringify({ reason: 'one-time bootstrap secret expired unused' })}::jsonb
          )`.execute(tx);
          return null;
        }
        const assurance = cred.mustRotate ? ('bootstrap_rotation' as const) : ('password' as const);
        const session = await this.identity.openSession(tx, cred.principalId, assurance);
        await sql`select audit.commit_identity_event(
          ${cred.principalId}::uuid, ${session.sessionId}::uuid, 'identity.login',
          'identity.session.create', 'success', 'OK', ${correlationId}::uuid,
          ${JSON.stringify({ assurance, rotation_required: cred.mustRotate })}::jsonb
        )`.execute(tx);
        return { cred, session, assurance };
      });
    } catch (e) {
      throw this.auditUnavailable(correlationId, e);
    }

    if (result === null) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-002', correlationId, ['login rejected']);
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    const accessToken = await this.identity.signAccess(
      result.cred.principalId, result.session.sessionId, result.assurance, result.session.contextKey,
    );
    return {
      principalId: result.cred.principalId,
      tokens: {
        accessToken,
        refreshToken: result.session.refreshToken,
        expiresInSeconds: this.identity.accessTtlSeconds,
      },
      rotationRequired: result.cred.mustRotate,
    };
  }

  /** Credential rotation — the only operation a bootstrap_rotation session may perform. */
  @Post('/rotate')
  async rotate(
    @Req() req: EyeRequest,
    @Body() body: { payload?: { currentPassword?: string; newPassword?: string } },
  ): Promise<{ rotated: true }> {
    const correlationId = req.eyeCorrelationId ?? 'unknown';
    const principal = req.eyePrincipal;
    if (principal === undefined) throw new HttpException(errorBody('EYE_IDN_001', correlationId), 401);
    const current = body.payload?.currentPassword;
    const next = body.payload?.newPassword;
    if (typeof current !== 'string' || typeof next !== 'string' || next.length < 12) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'currentPassword + newPassword (>=12) required'), 400);
    }

    let ok: boolean;
    try {
      ok = await this.inAuthTx(async (tx) => {
        const rotated = await this.identity.rotateCredential(tx, principal.principalId, current, next);
        if (!rotated) return false;
        await sql`select audit.commit_identity_event(
          ${principal.principalId}::uuid, ${principal.sessionId}::uuid,
          'identity.credential_rotated', 'identity.credential.rotate', 'success', 'OK',
          ${correlationId}::uuid,
          ${JSON.stringify({ forced: principal.assurance === 'bootstrap_rotation' })}::jsonb
        )`.execute(tx);
        return true;
      });
    } catch (e) {
      throw this.auditUnavailable(correlationId, e);
    }

    if (!ok) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-002', correlationId, ['rotation rejected']);
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    return { rotated: true };
  }

  /**
   * Refresh WITH family rotation: a new refresh token every time, and replay of
   * ANY previously invalidated generation (n-1, n-2, n-10, …) revokes the whole
   * family and bumps the revocation epoch — which also invalidates every
   * outstanding database context for that principal.
   */
  @Public()
  @Post('/refresh')
  async refresh(@Req() req: EyeRequest, @Body() body: { payload?: { refreshToken?: string } }): Promise<TokenPair> {
    const correlationId = req.eyeCorrelationId ?? 'unknown';
    const token = body.payload?.refreshToken;
    if (typeof token !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId), 400);
    }

    let result;
    try {
      result = await this.inAuthTx(async (tx) => {
        const r = await this.identity.rotateRefreshToken(tx, token);
        if (r.outcome === 'rotated') {
          await sql`select audit.commit_identity_event(
            ${r.principalId}::uuid, ${r.sessionId}::uuid, 'identity.refresh_rotated',
            'identity.session.refresh', 'success', 'OK', ${correlationId}::uuid,
            ${JSON.stringify({ generation: r.generation })}::jsonb
          )`.execute(tx);
        } else if (r.outcome === 'reuse') {
          await sql`select audit.commit_identity_event(
            ${r.principalId}::uuid, ${r.sessionId}::uuid, 'identity.refresh_reuse_detected',
            'identity.session.refresh', 'denied', 'EYE-IDN-002', ${correlationId}::uuid,
            ${JSON.stringify({
              response: 'token family revoked',
              replayed_generation: r.generation,
            })}::jsonb
          )`.execute(tx);
        } else {
          await sql`select audit.commit_identity_event(
            null::uuid, null::uuid, 'identity.refresh_rejected',
            'identity.session.refresh', 'denied', 'EYE-IDN-002', ${correlationId}::uuid,
            '{}'::jsonb
          )`.execute(tx);
        }
        return r;
      });
    } catch (e) {
      throw this.auditUnavailable(correlationId, e);
    }

    if (result.outcome !== 'rotated') {
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    const accessToken = await this.identity.signAccess(
      result.principalId, result.sessionId, result.assurance, result.newContextKey,
    );
    return {
      accessToken,
      refreshToken: result.newRefreshToken,
      expiresInSeconds: this.identity.accessTtlSeconds,
    };
  }
}
