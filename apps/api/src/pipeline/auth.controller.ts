/**
 * Authentication endpoints (remediation R3/R4): every token/session/credential
 * state mutation commits ATOMICALLY with its audit evidence in one SYSTEM-pool
 * transaction (eye_system + eye_set_system_context). If the audit append
 * fails, the mutation rolls back — no session, rotation, or refresh succeeds
 * without evidence. Failures route to the sanitized security intake.
 */
import { Body, Controller, HttpException, Inject, Post, Req } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody, type AuditEventBody } from '@eye/contracts';
import { IdentityService, type TokenPair } from '../identity/identity.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Public, recordSecurityFailure, type EyeRequest } from './http.js';
import { SYSTEM_DB } from '../shared/shared.module.js';
import type { Db, Tx } from '../shared/db.js';
import { appendAuditEvent } from '../audit/internal/audit-append.port.js';

interface LoginPayload {
  username?: string;
  password?: string;
}

function authEvent(
  type: string,
  action: string,
  outcome: 'success' | 'denied' | 'failure',
  actor: string,
  correlationId: string,
  resultCode: string,
  metadata: Record<string, unknown>,
): AuditEventBody {
  return {
    event_type: type,
    outcome,
    scope: 'PLATFORM',
    tenant_id: null,
    domain_id: null,
    actor,
    delegation_id: null,
    action,
    target_type: 'SES',
    target_id: null,
    target_version: null,
    purpose_id: 'authentication',
    policy_decision_id: null,
    policy_version: null,
    result_code: resultCode,
    occurred_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: correlationId,
    causation_id: null,
    trace_id: null,
    request_digest: null,
    metadata,
  };
}

@Controller('/v1/auth')
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
    @Inject(SYSTEM_DB) private readonly systemDb: Db,
  ) {}

  private async inAuthTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.systemDb.transaction().execute(async (tx) => {
      await sql`select public.eye_set_system_context('authentication flow')`.execute(tx);
      return fn(tx);
    });
  }

  @Public()
  @Post('/login')
  async login(
    @Req() req: EyeRequest,
    @Body() body: { payload?: LoginPayload },
  ): Promise<{ principalId: string; tokens: TokenPair; rotationRequired: boolean }> {
    const correlationId = req.eyeCorrelationId ?? 'unknown';
    const username = body.payload?.username;
    const password = body.payload?.password;
    if (typeof username !== 'string' || typeof password !== 'string') {
      await recordSecurityFailure(this.audit, req, 'validation_failed', 'EYE-REQ-001', correlationId, ['login payload malformed']);
      throw new HttpException(errorBody('EYE_REQ_001', correlationId), 400);
    }

    const result = await this.inAuthTx(async (tx) => {
      const cred = await this.identity.verifyPassword(tx, username, password);
      if (cred === null) return null;
      if (cred.expiredUnused) {
        // One-time secret expired unused: permanently disable — with evidence.
        await this.identity.revokeCredential(tx, cred.credentialId);
        await appendAuditEvent(tx, authEvent('identity.bootstrap_expired', 'identity.credential.revoke',
          'denied', `principal:${cred.principalId}`, correlationId, 'EYE-IDN-002',
          { reason: 'one-time bootstrap secret expired unused' }));
        return null;
      }
      const assurance = cred.mustRotate ? ('bootstrap_rotation' as const) : ('password' as const);
      const session = await this.identity.createSession(tx, cred.principalId, assurance);
      await appendAuditEvent(tx, authEvent('identity.login', 'identity.session.create',
        'success', `principal:${cred.principalId}`, correlationId, 'OK',
        { session: session.sessionId, assurance, rotation_required: cred.mustRotate }));
      return { cred, session, assurance };
    });

    if (result === null) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-002', correlationId, ['login rejected']);
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    const accessToken = await this.identity.signAccess(result.cred.principalId, result.session.sessionId, result.assurance);
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
  ): Promise<{ rotated: boolean }> {
    const correlationId = req.eyeCorrelationId ?? 'unknown';
    const principal = req.eyePrincipal;
    if (principal === undefined) throw new HttpException(errorBody('EYE_IDN_001', correlationId), 401);
    const current = body.payload?.currentPassword;
    const next = body.payload?.newPassword;
    if (typeof current !== 'string' || typeof next !== 'string' || next.length < 12) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'currentPassword + newPassword (>=12) required'), 400);
    }

    const ok = await this.inAuthTx(async (tx) => {
      const rotated = await this.identity.rotateCredential(tx, principal.principalId, current, next);
      if (!rotated) return false;
      await appendAuditEvent(tx, authEvent('identity.credential_rotated', 'identity.credential.rotate',
        'success', `principal:${principal.principalId}`, correlationId, 'OK',
        { forced: principal.assurance === 'bootstrap_rotation' }));
      return true;
    });

    if (!ok) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-002', correlationId, ['rotation rejected']);
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    return { rotated: true };
  }

  /** R4: refresh WITH rotation — new refresh token every time; reuse detection revokes the session. */
  @Public()
  @Post('/refresh')
  async refresh(@Req() req: EyeRequest, @Body() body: { payload?: { refreshToken?: string } }): Promise<TokenPair> {
    const correlationId = req.eyeCorrelationId ?? 'unknown';
    const token = body.payload?.refreshToken;
    if (typeof token !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId), 400);
    }

    const result = await this.inAuthTx(async (tx) => {
      const r = await this.identity.rotateRefreshToken(tx, token);
      if (r.outcome === 'rotated') {
        await appendAuditEvent(tx, authEvent('identity.refresh_rotated', 'identity.session.refresh',
          'success', `principal:${r.principalId}`, correlationId, 'OK', { session: r.sessionId }));
      } else if (r.outcome === 'reuse') {
        await appendAuditEvent(tx, authEvent('identity.refresh_reuse_detected', 'identity.session.refresh',
          'denied', `principal:${r.principalId}`, correlationId, 'EYE-IDN-002',
          { session: r.sessionId, response: 'session revoked' }));
      } else {
        await appendAuditEvent(tx, authEvent('identity.refresh_rejected', 'identity.session.refresh',
          'denied', 'anonymous', correlationId, 'EYE-IDN-002', {}));
      }
      return r;
    });

    if (result.outcome !== 'rotated') {
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    const accessToken = await this.identity.signAccess(result.principalId, result.sessionId, result.assurance);
    return { accessToken, refreshToken: result.newRefreshToken, expiresInSeconds: this.identity.accessTtlSeconds };
  }
}
