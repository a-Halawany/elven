/**
 * Authoritative request pipeline — ADR-P0-08.
 *
 * Order (corrected per approval): (1) envelope parsed/min-validated by the
 * guard, (2) principal authenticated by the guard, then here:
 * (3) resolve scope from AUTHENTICATED principal + TRUSTED ROUTING,
 * (4) evaluate policy, (5) full validation + the applicable path:
 *
 *   write:              object + POL + AUD + outbox in ONE atomic transaction
 *   consequential read: POL + AUD durable BEFORE protected data returns
 *   denied/indeterminate: POL + AUD atomically; no object, no outbox
 *   failure:            sanitized security intake (handled by guards/filter)
 *   health:             telemetry-only classified (never enters this pipeline)
 *
 * POL/AUD appends use the bounded internal ports under the system workload
 * principal, preserving correlation/causation — no recursion into the public
 * pipeline. Acknowledgement happens only after COMMIT.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody, type ConsequenceClass, type Envelope, type Scope, type AuditEventBody } from '@eye/contracts';
import { APP_DB } from '../shared/shared.module.js';
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
  /** Optional outbox event to insert atomically (published after commit). */
  outboxEvent?: { eventType: string; payload: Record<string, unknown> } | null;
}

function deny(code: 'EYE_AUT_001' | 'EYE_AUT_002' | 'EYE_TEN_001', correlationId: string, message?: string): HttpException {
  const body = errorBody(code, correlationId, message);
  const status = code === 'EYE_AUT_002' ? 403 : code === 'EYE_TEN_001' ? 403 : 403;
  return new HttpException(body, status);
}

@Injectable()
export class PipelineService {
  constructor(
    @Inject(APP_DB) private readonly db: Db,
    private readonly pdp: PdpService,
  ) {}

  /** Allowed command/write path — one atomic transaction, ack after commit. */
  async write<T>(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    handler: (tx: Tx, ctx: ScopeContext) => Promise<WriteEffect<T>>,
  ): Promise<PipelineOutcome<T>> {
    const { ctx, policyInput, policyResult } = this.resolveAndEvaluate(envelope, principal, route);

    if (policyResult.decision === 'deny' || policyResult.decision === 'indeterminate') {
      await this.recordDenial(envelope, principal, route, ctx, policyInput, policyResult);
      throw deny(policyResult.decision === 'deny' ? 'EYE_AUT_001' : 'EYE_AUT_002', envelope.correlation_id, policyResult.reason);
    }

    return this.db.transaction().execute(async (tx) => {
      await this.applyScopeContext(tx, ctx);
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
      // COMMIT happens when this callback returns; the caller acks after that.
      return {
        result: effect.result,
        policyDecisionId: pol.policyDecisionId,
        auditSeq: aud.auditSeq,
        obligations: policyResult.obligations,
      };
    });
  }

  /** Allowed consequential read — POL+AUD durable BEFORE data is returned; no outbox. */
  async consequentialRead<T>(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    handler: (tx: Tx, ctx: ScopeContext, obligations: Obligation[]) => Promise<T>,
  ): Promise<PipelineOutcome<T>> {
    const { ctx, policyInput, policyResult } = this.resolveAndEvaluate(envelope, principal, route);

    if (policyResult.decision === 'deny' || policyResult.decision === 'indeterminate') {
      await this.recordDenial(envelope, principal, route, ctx, policyInput, policyResult);
      throw deny(policyResult.decision === 'deny' ? 'EYE_AUT_001' : 'EYE_AUT_002', envelope.correlation_id, policyResult.reason);
    }

    return this.db.transaction().execute(async (tx) => {
      await this.applyScopeContext(tx, ctx);
      // Evidence first (durable in this transaction), then the read runs in the
      // same transaction — data leaves only after COMMIT succeeds.
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
  }

  // ===== internals =====

  private resolveAndEvaluate(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
  ): { ctx: ScopeContext; policyInput: PolicyInput; policyResult: PolicyResult } {
    // Step 3 — scope from authenticated principal + trusted routing (fail closed).
    const res = resolveScope(principal, route.scope, route.tenantId, route.domainId);
    if (!res.ok) throw deny('EYE_TEN_001', envelope.correlation_id, res.reason);
    // Client-declared envelope scope must MATCH the resolved scope.
    if (!envelopeScopeMatches(envelope, res.context)) {
      throw deny('EYE_TEN_001', envelope.correlation_id, 'envelope scope does not match resolved scope');
    }
    // Envelope action must match the route-declared action (no smuggled intent).
    if (envelope.action !== route.action) {
      throw deny('EYE_TEN_001', envelope.correlation_id, 'envelope action does not match route action');
    }

    // Step 4 — policy.
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

  /** Denied/indeterminate path: POL + AUD atomically; no domain object, no outbox. */
  private async recordDenial(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    ctx: ScopeContext,
    policyInput: PolicyInput,
    policyResult: PolicyResult,
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await this.applyScopeContext(tx, ctx);
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

  private async applyScopeContext(tx: Tx, ctx: ScopeContext): Promise<void> {
    await sql`select set_config('eye.scope', ${ctx.scope}, true)`.execute(tx);
    await sql`select set_config('eye.tenant_id', ${ctx.tenantId ?? ''}, true)`.execute(tx);
    await sql`select set_config('eye.domain_id', ${ctx.domainId ?? ''}, true)`.execute(tx);
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
