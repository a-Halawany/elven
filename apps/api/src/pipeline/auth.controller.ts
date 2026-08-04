/**
 * Authentication endpoints — the act of authenticating (ADR-P0-08 step 2).
 * Public (no bearer yet); envelope still validated by the EnvelopeGuard.
 * Policy does not gate authentication itself (no protected resource is
 * accessed); successful logins are audited via the identity audit event in its
 * own transaction; failures go to the sanitized security intake.
 */
import { Body, Controller, HttpException, Post, Req } from '@nestjs/common';
import { errorBody, type AuditEventBody } from '@eye/contracts';
import { IdentityService, type TokenPair } from '../identity/identity.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Public, recordSecurityFailure, type EyeRequest } from './http.js';
import { APP_DB } from '../shared/shared.module.js';
import { Inject } from '@nestjs/common';
import type { Db } from '../shared/db.js';
import { appendAuditEvent } from '../audit/internal/audit-append.port.js';

interface LoginPayload {
  username?: string;
  password?: string;
}

@Controller('/v1/auth')
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
    @Inject(APP_DB) private readonly db: Db,
  ) {}

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
      await recordSecurityFailure(this.audit, req, 'validation_failed', 'EYE-REQ-001', correlationId, [
        'login payload malformed',
      ]);
      throw new HttpException(errorBody('EYE_REQ_001', correlationId), 400);
    }
    const result = await this.identity.login(username, password);
    if (result === null) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-002', correlationId, [
        'login rejected',
      ]);
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    // Audit the successful authentication (durable before ack).
    const event: AuditEventBody = {
      event_type: 'identity.login',
      outcome: 'success',
      scope: 'PLATFORM',
      tenant_id: null,
      domain_id: null,
      actor: `principal:${result.principalId}`,
      delegation_id: null,
      action: 'identity.session.create',
      target_type: 'SES',
      target_id: null,
      target_version: null,
      purpose_id: 'authentication',
      policy_decision_id: null,
      policy_version: null,
      result_code: 'OK',
      occurred_at: new Date().toISOString(),
      clock_quality: 'trusted',
      correlation_id: correlationId,
      causation_id: null,
      trace_id: req.eyeEnvelope?.trace_id ?? null,
      request_digest: null,
      metadata: { username_present: true },
    };
    await this.db.transaction().execute(async (tx) => appendAuditEvent(tx, event));
    return result;
  }

  /**
   * Credential rotation — the ONLY operation a bootstrap_rotation session may
   * perform (ADR-P0-17). Authenticated; audited; revokes all sessions on
   * success so the caller must log in again with the new secret.
   */
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
    const ok = await this.identity.rotateCredential(principal.principalId, current, next);
    if (!ok) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-002', correlationId, ['rotation rejected']);
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    const event: AuditEventBody = {
      event_type: 'identity.credential_rotated',
      outcome: 'success',
      scope: 'PLATFORM',
      tenant_id: null,
      domain_id: null,
      actor: `principal:${principal.principalId}`,
      delegation_id: null,
      action: 'identity.credential.rotate',
      target_type: 'PRN',
      target_id: principal.principalId,
      target_version: null,
      purpose_id: 'authentication',
      policy_decision_id: null,
      policy_version: null,
      result_code: 'OK',
      occurred_at: new Date().toISOString(),
      clock_quality: 'trusted',
      correlation_id: correlationId,
      causation_id: null,
      trace_id: req.eyeEnvelope?.trace_id ?? null,
      request_digest: null,
      metadata: { forced: principal.assurance === 'bootstrap_rotation' },
    };
    await this.db.transaction().execute(async (tx) => appendAuditEvent(tx, event));
    return { rotated: true };
  }

  @Public()
  @Post('/refresh')
  async refresh(@Req() req: EyeRequest, @Body() body: { payload?: { refreshToken?: string } }): Promise<TokenPair> {
    const correlationId = req.eyeCorrelationId ?? 'unknown';
    const token = body.payload?.refreshToken;
    if (typeof token !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId), 400);
    }
    const pair = await this.identity.refresh(token);
    if (pair === null) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-002', correlationId, [
        'refresh rejected',
      ]);
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    return pair;
  }
}
