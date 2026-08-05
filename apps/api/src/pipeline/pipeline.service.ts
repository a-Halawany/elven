/**
 * Authoritative request pipeline — ADR-P0-08 + invariant remediation R1/R3.
 *
 * Context: established ONLY via public.eye_set_context(session, scope, tenant,
 * domain) — a SECURITY DEFINER function that validates the ACTIVE session and
 * the principal's bindings before signing the context. eye_app cannot mint
 * context by setting GUCs (signature-verified accessors).
 *
 * Complete audit-on-commit (R3):
 *  - scope/route/envelope mismatches record durable sanitized denial evidence
 *    (system partition, eye_system) BEFORE the request throws;
 *  - allowed-path handler failures roll the business tx back, then record a
 *    separate sanitized failure event (POL context + AUD) in a new tx;
 *  - denied/indeterminate keep their atomic POL+AUD path.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody, type ConsequenceClass, type Envelope, type Scope, type AuditEventBody } from '@eye/contracts';
import { APP_DB, SYSTEM_DB } from '../shared/shared.module.js';
import type { Db, Tx } from '../shared/db.js';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { envelopeScopeMatches, resolveScope, type ScopeContext } from '../shared/scope.js';
import { PdpService, type Obligation, type PolicyInput, type PolicyResult } from '../policy/pdp.service.js';
import { appendPolicyDecision } from '../policy/internal/policy-append.port.js';
import { appendAuditEvent } from '../audit/internal/audit-append.port.js';
import { newId } from '../shared/ids.js';

export interface RouteInfo {
  scope: Scope;
  tenantId: string | null; // from trusted route params only
  domainId: string | null;
  action: string;
  objectType: string | null;
  objectId: string | null;
}

export interface PipelineOutcome<T> {
  result: T;
  policyDecisionId: string;
  auditSeq: number;
  obligations: Obligation[];
}

export interface WriteEffect<T> {
  result: T;
  targetType: string | null;
  targetId: string | null;
  targetVersion: string | null;
  outboxEvent?: { eventType: string; payload: Record<string, unknown> } | null;
}

function deny(code: 'EYE_AUT_001' | 'EYE_AUT_002' | 'EYE_TEN_001', correlationId: string, message?: string): HttpException {
  return new HttpException(errorBody(code, correlationId, message), 403);
}

@Injectable()
export class PipelineService {
  constructor(
    @Inject(APP_DB) private readonly db: Db,
    @Inject(SYSTEM_DB) private readonly systemDb: Db,
    private readonly pdp: PdpService,
  ) {}

  /** Allowed command/write path — one atomic transaction, ack after commit. */
  async write<T>(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    handler: (tx: Tx, ctx: ScopeContext) => Promise<WriteEffect<T>>,
  ): Promise<PipelineOutcome<T>> {
    const { ctx, policyInput, policyResult } = await this.resolveAndEvaluate(envelope, principal, route);

    if (policyResult.decision === 'deny' || policyResult.decision === 'indeterminate') {
      await this.recordDenial(envelope, principal, route, ctx, policyInput, policyResult);
      throw deny(policyResult.decision === 'deny' ? 'EYE_AUT_001' : 'EYE_AUT_002', envelope.correlation_id, policyResult.reason);
    }

    try {
      return await this.db.transaction().execute(async (tx) => {
        await this.applyScopeContext(tx, principal, ctx);
        const effect = await handler(tx, ctx);
        const pol = await appendPolicyDecision(tx, policyInput, policyResult, envelope.correlation_id);
        const aud = await appendAuditEvent(tx, this.auditEvent(envelope, principal, ctx, route, {
          outcome: 'success',
          resultCode: 'OK',
          policyDecisionId: pol.policyDecisionId,
          policyVersion: policyResult.bundleVersion,
          target: { type: effect.targetType, id: effect.targetId, version: effect.targetVersion },
        }));
        if (effect.outboxEvent != null) {
          await tx
            .insertInto('objects.object_outbox')
            .values({
              id: newId(),
              scope: ctx.scope,
              tenant_id: ctx.tenantId,
              domain_id: ctx.domainId,
              event_type: effect.outboxEvent.eventType,
              payload: JSON.stringify(effect.outboxEvent.payload),
              correlation_id: envelope.correlation_id,
              causation_id: envelope.message_id,
              status: 'pending',
            })
            .execute();
        }
        return {
          result: effect.result,
          policyDecisionId: pol.policyDecisionId,
          auditSeq: aud.auditSeq,
          obligations: policyResult.obligations,
        };
      });
    } catch (e) {
      // R3: the business tx rolled back — durable sanitized failure evidence.
      await this.recordHandlerFailure(envelope, principal, ctx, route, policyInput, policyResult, e);
      throw e;
    }
  }

  /** Allowed consequential read — POL+AUD durable before data leaves; no outbox. */
  async consequentialRead<T>(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    handler: (tx: Tx, ctx: ScopeContext, obligations: Obligation[]) => Promise<T>,
  ): Promise<PipelineOutcome<T>> {
    const { ctx, policyInput, policyResult } = await this.resolveAndEvaluate(envelope, principal, route);

    if (policyResult.decision === 'deny' || policyResult.decision === 'indeterminate') {
      await this.recordDenial(envelope, principal, route, ctx, policyInput, policyResult);
      throw deny(policyResult.decision === 'deny' ? 'EYE_AUT_001' : 'EYE_AUT_002', envelope.correlation_id, policyResult.reason);
    }

    try {
      return await this.db.transaction().execute(async (tx) => {
        await this.applyScopeContext(tx, principal, ctx);
        const pol = await appendPolicyDecision(tx, policyInput, policyResult, envelope.correlation_id);
        const aud = await appendAuditEvent(tx, this.auditEvent(envelope, principal, ctx, route, {
          outcome: 'success',
          resultCode: 'OK',
          policyDecisionId: pol.policyDecisionId,
          policyVersion: policyResult.bundleVersion,
          target: { type: route.objectType, id: route.objectId, version: null },
        }));
        const result = await handler(tx, ctx, policyResult.obligations);
        return { result, policyDecisionId: pol.policyDecisionId, auditSeq: aud.auditSeq, obligations: policyResult.obligations };
      });
    } catch (e) {
      // R3: the read failure rolled back the evidence — re-record it durably.
      await this.recordHandlerFailure(envelope, principal, ctx, route, policyInput, policyResult, e);
      throw e;
    }
  }

  // ===== internals =====

  private async resolveAndEvaluate(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
  ): Promise<{ ctx: ScopeContext; policyInput: PolicyInput; policyResult: PolicyResult }> {
    // Step 3 — scope from authenticated principal + trusted routing (fail closed).
    const res = resolveScope(principal, route.scope, route.tenantId, route.domainId);
    if (!res.ok) {
      await this.recordScopeDenial(envelope, principal, route, `scope resolution failed: ${res.reason}`);
      throw deny('EYE_TEN_001', envelope.correlation_id, res.reason);
    }
    if (!envelopeScopeMatches(envelope, res.context)) {
      await this.recordScopeDenial(envelope, principal, route, 'envelope scope does not match resolved scope');
      throw deny('EYE_TEN_001', envelope.correlation_id, 'envelope scope does not match resolved scope');
    }
    if (envelope.action !== route.action) {
      await this.recordScopeDenial(envelope, principal, route, 'envelope action does not match route action');
      throw deny('EYE_TEN_001', envelope.correlation_id, 'envelope action does not match route action');
    }

    const policyInput: PolicyInput = {
      principal: {
        principalId: principal.principalId,
        kind: principal.kind,
        assurance: principal.assurance,
        bindings: principal.bindings,
      },
      delegationId: envelope.delegation_id ?? null,
      action: route.action,
      objectType: route.objectType,
      objectId: route.objectId,
      purposeId: envelope.purpose_id ?? null,
      context: res.context,
      consequenceClass: envelope.consequence_class as ConsequenceClass,
      environment: { deployment: 'local-dev', clockQuality: envelope.clock_quality },
    };
    const policyResult = this.pdp.evaluate(policyInput);
    return { ctx: res.context, policyInput, policyResult };
  }

  /** Denied/indeterminate policy path: POL + AUD atomically; no object, no outbox. */
  private async recordDenial(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    ctx: ScopeContext,
    policyInput: PolicyInput,
    policyResult: PolicyResult,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await this.applyScopeContext(tx, principal, ctx);
      const pol = await appendPolicyDecision(tx, policyInput, policyResult, envelope.correlation_id);
      await appendAuditEvent(tx, this.auditEvent(envelope, principal, ctx, route, {
        outcome: policyResult.decision === 'deny' ? 'denied' : 'indeterminate',
        resultCode: policyResult.decision === 'deny' ? 'EYE-AUT-001' : 'EYE-AUT-002',
        policyDecisionId: pol.policyDecisionId,
        policyVersion: policyResult.bundleVersion,
        target: { type: route.objectType, id: route.objectId, version: null },
      }));
    });
  }

  /**
   * R3: scope/route/envelope mismatches happen BEFORE a context for the
   * requested scope can exist — durable sanitized denial evidence is written
   * on the platform partition under the system role (never payload content).
   */
  private async recordScopeDenial(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    reason: string,
  ): Promise<void> {
    const event: AuditEventBody = {
      event_type: 'request.scope_denied',
      outcome: 'denied',
      scope: 'PLATFORM',
      tenant_id: null,
      domain_id: null,
      actor: `principal:${principal.principalId}`,
      delegation_id: envelope.delegation_id ?? null,
      action: route.action,
      target_type: route.objectType,
      target_id: route.objectId,
      target_version: null,
      purpose_id: envelope.purpose_id ?? null,
      policy_decision_id: null,
      policy_version: null,
      result_code: 'EYE-TEN-001',
      occurred_at: new Date().toISOString(),
      clock_quality: envelope.clock_quality,
      correlation_id: envelope.correlation_id,
      causation_id: envelope.causation_id ?? null,
      trace_id: envelope.trace_id,
      request_digest: envelope.payload_digest,
      metadata: {
        reason: reason.slice(0, 200),
        route_scope: route.scope,
        envelope_scope: envelope.scope,
      },
    };
    try {
      await this.systemDb.transaction().execute(async (tx) => {
        await sql`select public.eye_set_system_context('scope-denial evidence')`.execute(tx);
        await appendAuditEvent(tx, event);
      });
    } catch {
      // Evidence-path failure must not mask the denial; the request still fails closed.
    }
  }

  /** R3: sanitized failure evidence after a rolled-back allowed-path handler. */
  private async recordHandlerFailure(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    ctx: ScopeContext,
    route: RouteInfo,
    policyInput: PolicyInput,
    policyResult: PolicyResult,
    error: unknown,
  ): Promise<void> {
    const code =
      error instanceof HttpException && typeof (error.getResponse() as { code?: string }).code === 'string'
        ? (error.getResponse() as { code: string }).code
        : 'EYE-INT-001';
    try {
      await this.db.transaction().execute(async (tx) => {
        await this.applyScopeContext(tx, principal, ctx);
        const pol = await appendPolicyDecision(tx, policyInput, policyResult, envelope.correlation_id);
        await appendAuditEvent(tx, this.auditEvent(envelope, principal, ctx, route, {
          outcome: 'failure',
          resultCode: code,
          policyDecisionId: pol.policyDecisionId,
          policyVersion: policyResult.bundleVersion,
          target: { type: route.objectType, id: route.objectId, version: null },
        }));
      });
    } catch {
      // Never mask the original failure with an evidence-path failure.
    }
  }

  /** Signed, session-derived context (R1a) — replaces raw set_config. */
  private async applyScopeContext(tx: Tx, principal: AuthenticatedPrincipal, ctx: ScopeContext): Promise<void> {
    await sql`select public.eye_set_context(
      ${principal.sessionId}::uuid, ${ctx.scope}, ${ctx.tenantId}::uuid, ${ctx.domainId}::uuid
    )`.execute(tx);
  }

  private auditEvent(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    ctx: ScopeContext,
    route: RouteInfo,
    o: {
      outcome: 'success' | 'denied' | 'indeterminate' | 'failure';
      resultCode: string;
      policyDecisionId: string | null;
      policyVersion: string | null;
      target: { type: string | null; id: string | null; version: string | null };
    },
  ): AuditEventBody {
    return {
      event_type: 'api.request',
      outcome: o.outcome,
      scope: ctx.scope,
      tenant_id: ctx.tenantId,
      domain_id: ctx.domainId,
      actor: `principal:${principal.principalId}`,
      delegation_id: envelope.delegation_id ?? null,
      action: route.action,
      target_type: o.target.type,
      target_id: o.target.id,
      target_version: o.target.version,
      purpose_id: envelope.purpose_id ?? null,
      policy_decision_id: o.policyDecisionId,
      policy_version: o.policyVersion,
      result_code: o.resultCode,
      occurred_at: new Date().toISOString(),
      clock_quality: envelope.clock_quality,
      correlation_id: envelope.correlation_id,
      causation_id: envelope.causation_id ?? null,
      trace_id: envelope.trace_id,
      request_digest: envelope.payload_digest,
      metadata: { session: principal.sessionId, assurance: principal.assurance },
    };
  }
}
