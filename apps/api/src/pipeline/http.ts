/**
 * HTTP request pipeline plumbing — steps 1–2 of ADR-P0-08 plus the failure path.
 *  - EnvelopeGuard: parse + minimally validate the envelope BEFORE any payload
 *    processing (ES-20-002); verify payload_digest; attach to the request.
 *  - AuthGuard: authenticate principal + delegation (before scope resolution).
 *  - EyeExceptionFilter: policy-safe error bodies; no stack traces, no internal
 *    topology, no cross-tenant signals (Vol 4 Ch.21).
 * Failures route to the bounded, rate-limited security-audit intake — sanitized
 * metadata only, never credentials/tokens/payload content/client-declared scope.
 */
import {
  CanActivate,
  Catch,
  ExecutionContext,
  HttpException,
  Injectable,
  SetMetadata,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { contentDigest, errorBody, validateEnvelope, type Envelope } from '@eye/contracts';
import { IdentityService } from '../identity/identity.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { newId } from '../shared/ids.js';
import { degradedAudit } from '../shared/degraded-store.js';

export const PUBLIC_ROUTE = 'eye:public';
/** Marks authentication endpoints + telemetry-only endpoints (documented classification). */
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);

export interface EyeRequest extends Request {
  eyeEnvelope?: Envelope;
  eyePrincipal?: AuthenticatedPrincipal;
  eyeCorrelationId?: string;
}

/**
 * Bounded intake with RESTART-DURABLE suppression accounting (Gate-2 §6).
 *
 * The in-process window bounds ledger writes; the DROP COUNT is persisted by
 * audit.accountIntake (audit.intake_suppression), so a restart cannot erase the
 * fact that failures were coalesced. Each admitted event carries the number of
 * drops recorded since the previous admitted write.
 */
class IntakeLimiter {
  private windowStart = Date.now();
  private count = 0;
  constructor(private readonly maxPerMinute = 120) {}
  admit(): boolean {
    const now = Date.now();
    if (now - this.windowStart > 60_000) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count += 1;
    return this.count <= this.maxPerMinute;
  }
}
const intakeLimiter = new IntakeLimiter();
const INTAKE_BUCKET = 'security-intake';

export async function recordSecurityFailure(
  audit: AuditService,
  req: Request,
  failureClass: 'envelope_invalid' | 'authentication_failed' | 'scope_invalid' | 'validation_failed',
  resultCode: string,
  correlationId: string,
  diagnostics: string[],
): Promise<void> {
  const allowed = intakeLimiter.admit();
  // Durable accounting happens for BOTH outcomes: a suppressed failure is
  // counted in the database, never dropped on the floor.
  const suppressedSinceLast = await audit.accountIntake(INTAKE_BUCKET, allowed);
  if (!allowed) return;
  try {
    await audit.securityIntake({
      failureClass,
      resultCode,
      correlationId,
      route: req.path,
      method: req.method,
      diagnostics,
      suppressedSinceLast,
    });
  } catch (e) {
    // Never mask the original rejection — but never silently swallow the lost
    // evidence either: it goes to the independent degraded journal, which marks
    // the process degraded and is surfaced by /readyz.
    degradedAudit.record({
      kind: 'evidence_write_failed',
      correlationId,
      route: req.path,
      failureClass,
      scope: null,
      detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      suppressedCarried: suppressedSinceLast,
    });
  }
}

@Injectable()
export class EnvelopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublicTelemetry = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<EyeRequest>();
    if (req.path === '/healthz' || req.path === '/readyz') return true; // telemetry-only classified

    const body = req.body as { envelope?: unknown; payload?: unknown } | undefined;
    const envelope = body?.envelope;
    const correlationId =
      typeof (envelope as { correlation_id?: unknown } | undefined)?.correlation_id === 'string'
        ? ((envelope as { correlation_id: string }).correlation_id)
        : newId();
    req.eyeCorrelationId = correlationId;

    const v = validateEnvelope(envelope);
    if (!v.ok) {
      await recordSecurityFailure(this.audit, req, 'envelope_invalid', 'EYE-REQ-001', correlationId, v.errors ?? []);
      throw new HttpException(errorBody('EYE_REQ_001', correlationId), 400);
    }
    const env = envelope as Envelope;
    const digest = contentDigest((body?.payload ?? {}) as Record<string, unknown>);
    if (digest !== env.payload_digest) {
      await recordSecurityFailure(this.audit, req, 'envelope_invalid', 'EYE-INT-001', correlationId, [
        'payload_digest mismatch',
      ]);
      throw new HttpException(errorBody('EYE_INT_001', correlationId, 'payload digest verification failed'), 400);
    }
    req.eyeEnvelope = env;
    // isPublicTelemetry only affects AuthGuard; envelope is validated for every non-health route.
    void isPublicTelemetry;
    return true;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly identity: IdentityService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic === true) return true;
    const req = ctx.switchToHttp().getRequest<EyeRequest>();
    if (req.path === '/healthz' || req.path === '/readyz') return true; // telemetry-only classified
    const correlationId = req.eyeCorrelationId ?? newId();

    const header = req.headers.authorization;
    if (header === undefined || !header.startsWith('Bearer ')) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-001', correlationId, [
        'no bearer credential',
      ]);
      throw new HttpException(errorBody('EYE_IDN_001', correlationId), 401);
    }
    const principal = await this.identity.verifyAccess(header.slice('Bearer '.length));
    if (principal === null) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-002', correlationId, [
        'credential verification failed',
      ]);
      throw new HttpException(errorBody('EYE_IDN_002', correlationId), 401);
    }
    // Envelope principal must match the authenticated principal (no impersonation via envelope).
    if (req.eyeEnvelope !== undefined && req.eyeEnvelope.principal_id !== `principal:${principal.principalId}`) {
      await recordSecurityFailure(this.audit, req, 'authentication_failed', 'EYE-IDN-002', correlationId, [
        'envelope principal does not match authenticated principal',
      ]);
      throw new HttpException(errorBody('EYE_IDN_002', correlationId, 'envelope principal mismatch'), 401);
    }
    req.eyePrincipal = principal;
    return true;
  }
}

@Catch()
export class EyeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<EyeRequest>();
    const correlationId = req.eyeCorrelationId ?? newId();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(typeof body === 'object' ? body : errorBody('EYE_REQ_001', correlationId));
      return;
    }
    // Unknown error: non-disclosing internal error; detail stays server-side.
    // eslint-disable-next-line no-console
    console.error(`[eye-api] internal error corr=${correlationId}:`, exception);
    res.status(500).json(errorBody('EYE_INT_001', correlationId, 'internal integrity or processing failure'));
  }
}
