/**
 * Authoritative request pipeline — ADR-P0-08 + Gate-2 §1/§2/§4/§6.
 *
 * Authority separation (§1): the pipeline reads through the APP pool
 * (RLS-governed SELECT only) and writes through the COMMIT pool. The ordinary
 * application role cannot write anything authoritative, so the commit boundary
 * is a real, independently enforced trust boundary rather than a convention.
 *
 * Bound context (§2): every transaction establishes context through
 * ctx.issue(session, contextKey, scope, tenant, domain, purpose, ttl). The
 * context is bound to session + principal + tenant + domain + scope + assurance
 * + purpose + issued-at + expiry + single-use nonce + revocation epoch + the
 * issuing backend, and requires proof of possession of the session's context
 * key (carried only inside the verified access token). It dies on session
 * revocation, binding removal, credential rotation, expiry or replay.
 *
 * Unforgeable evidence (§4): POL and AUD are never submitted as caller JSON.
 * The pipeline calls policy.commit_decision / audit.commit_event, which DERIVE
 * scope, tenant, domain, actor, session and purpose from the validated context,
 * build the record inside the trusted boundary, canonicalize it with the
 * in-database RFC 8785 implementation and compute the chain hash there.
 *
 * Complete coverage + fail-closed (§6): scope/route/envelope mismatches, policy
 * denials, handler failures and consequential-read failures all record durable
 * sanitized evidence. If authoritative audit persistence is unavailable the
 * request FAILS CLOSED and the fact is recorded through the independent
 * degraded-audit journal, which also drives degraded health.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody, type ConsequenceClass, type Envelope, type Scope } from '@eye/contracts';
import { APP_DB, COMMIT_DB, IDENTITY_DB } from '../shared/shared.module.js';
import type { Db, Tx } from '../shared/db.js';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { envelopeScopeMatches, resolveScope, type ScopeContext } from '../shared/scope.js';
import { PdpService, type Obligation, type PolicyInput, type PolicyResult } from '../policy/pdp.service.js';
import { newId } from '../shared/ids.js';
import { degradedAudit } from '../shared/degraded-store.js';

export interface RouteInfo {
  scope: Scope;
  tenantId: string | null;
  domainId: string | null;
  action: string;
  objectType: string | null;
  objectId: string | null;
  consequenceClass?: ConsequenceClass;
  /**
   * Which authoritative writer executes this route (Gate-2 §1). 'commit' is the
   * default; identity-mutating routes MUST declare 'identity' so the commit role
   * never holds identity capability and vice versa. Both roles can write bound
   * POL/AUD evidence, so atomicity with the business effect is preserved.
   */
  authority?: 'commit' | 'identity';
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

/** Raised when authoritative audit persistence is unavailable (fail closed). */
export class AuditUnavailableError extends Error {
  constructor(readonly reason: unknown) {
    super('authoritative audit persistence unavailable');
  }
}

@Injectable()
export class PipelineService {
  constructor(
    @Inject(APP_DB) private readonly db: Db,
    @Inject(COMMIT_DB) private readonly commitDb: Db,
    @Inject(IDENTITY_DB) private readonly identityDb: Db,
    private readonly pdp: PdpService,
  ) {}

  /** The writer authority for a route — never broader than the route declares. */
  private writer(route: RouteInfo): Db {
    return route.authority === 'identity' ? this.identityDb : this.commitDb;
  }

  /** Allowed write path — business effect + POL + AUD + outbox in ONE transaction. */
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
      return await this.writer(route).transaction().execute(async (tx) => {
        await this.establishContext(tx, principal, ctx, envelope);
        const effect = await handler(tx, ctx);
        const polId = await this.commitPolicy(tx, envelope, route, policyInput, policyResult);
        const aud = await this.commitAudit(tx, envelope, route, {
          eventType: 'api.request',
          outcome: 'success',
          resultCode: 'OK',
          policyDecisionId: polId,
          policyVersion: policyResult.bundleVersion,
          target: { type: effect.targetType, id: effect.targetId, version: effect.targetVersion },
          metadata: { assurance: principal.assurance },
        });
        if (effect.outboxEvent != null) {
          await sql`select objects.enqueue_event(
            ${newId()}::uuid, ${effect.outboxEvent.eventType},
            ${JSON.stringify(effect.outboxEvent.payload)}::jsonb,
            ${envelope.correlation_id}::uuid, ${envelope.message_id}::uuid
          )`.execute(tx);
        }
        return {
          result: effect.result,
          policyDecisionId: polId,
          auditSeq: aud.auditSeq,
          obligations: policyResult.obligations,
        };
      });
    } catch (e) {
      if (e instanceof AuditUnavailableError) throw this.failClosed(envelope, route, e);
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
      return await this.writer(route).transaction().execute(async (tx) => {
        await this.establishContext(tx, principal, ctx, envelope);
        const polId = await this.commitPolicy(tx, envelope, route, policyInput, policyResult);
        const aud = await this.commitAudit(tx, envelope, route, {
          eventType: 'api.request',
          outcome: 'success',
          resultCode: 'OK',
          policyDecisionId: polId,
          policyVersion: policyResult.bundleVersion,
          target: { type: route.objectType, id: route.objectId, version: null },
          metadata: { assurance: principal.assurance },
        });
        const result = await handler(tx, ctx, policyResult.obligations);
        return { result, policyDecisionId: polId, auditSeq: aud.auditSeq, obligations: policyResult.obligations };
      });
    } catch (e) {
      if (e instanceof AuditUnavailableError) throw this.failClosed(envelope, route, e);
      await this.recordHandlerFailure(envelope, principal, ctx, route, policyInput, policyResult, e);
      throw e;
    }
  }

  /**
   * Centralized durable rejection path (§6) for failures detected BEFORE the
   * governed pipeline runs — malformed bodies, missing parameters, unusable
   * payloads on an authenticated request. Records sanitized evidence, then
   * raises. Never silently swallows.
   */
  async rejectAuthenticatedRequest(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    resultCode: string,
    reason: string,
    status = 400,
  ): Promise<never> {
    await this.recordPreHandlerRejection(envelope, principal, route, resultCode, reason);
    throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, reason), status);
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
      consequenceClass: route.consequenceClass ?? (envelope.consequence_class as ConsequenceClass),
      environment: { deployment: 'local-dev', clockQuality: envelope.clock_quality },
    };
    const policyResult = this.pdp.evaluate(policyInput);
    return { ctx: res.context, policyInput, policyResult };
  }

  /** Gate-2 §2 — the ONLY way a transaction acquires authority. */
  private async establishContext(
    tx: Tx,
    principal: AuthenticatedPrincipal,
    ctx: ScopeContext,
    envelope: Envelope,
  ): Promise<void> {
    await sql`select ctx.issue(
      ${principal.sessionId}::uuid, ${principal.contextKey}, ${ctx.scope},
      ${ctx.tenantId}::uuid, ${ctx.domainId}::uuid, ${envelope.purpose_id ?? null}, 60
    )`.execute(tx);
  }

  /**
   * Evidence-only context: required when the DENIAL REASON is the principal's
   * own assurance or missing binding — an authority context is (correctly)
   * unobtainable then, but the denial must still be recorded against the real
   * authenticated principal. Carries no capability: eye_row_writable() is false
   * in this mode, so it can write evidence and nothing else.
   */
  private async establishEvidenceContext(
    tx: Tx,
    principal: AuthenticatedPrincipal,
    ctx: ScopeContext,
    envelope: Envelope,
  ): Promise<void> {
    await sql`select ctx.issue_evidence(
      ${principal.sessionId}::uuid, ${principal.contextKey}, ${ctx.scope},
      ${ctx.tenantId}::uuid, ${ctx.domainId}::uuid, ${envelope.purpose_id ?? null}, 60
    )`.execute(tx);
  }

  /** POL through the bound port: authority fields are derived, not supplied. */
  private async commitPolicy(
    tx: Tx,
    envelope: Envelope,
    route: RouteInfo,
    input: PolicyInput,
    result: PolicyResult,
  ): Promise<string> {
    const id = newId();
    await sql`select policy.commit_decision(
      ${id}::uuid, ${route.action}, ${route.objectType}, ${route.objectId}::uuid,
      ${input.consequenceClass}, ${result.decision}, ${JSON.stringify(result.obligations)}::jsonb,
      ${result.inputDigest}, ${result.bundleVersion}, ${result.exceptionRef},
      ${result.expiresAt}, ${result.revocationState}, ${result.reason},
      ${envelope.correlation_id}::uuid, ${envelope.delegation_id ?? null},
      ${JSON.stringify(input.environment)}::jsonb
    )`.execute(tx);
    return id;
  }

  /** AUD through the bound port; an unavailable ledger fails closed. */
  private async commitAudit(
    tx: Tx,
    envelope: Envelope,
    route: RouteInfo,
    o: {
      eventType: string;
      outcome: 'success' | 'denied' | 'failure' | 'indeterminate';
      resultCode: string;
      policyDecisionId: string | null;
      policyVersion: string | null;
      target: { type: string | null; id: string | null; version: string | null };
      metadata: Record<string, unknown>;
    },
  ): Promise<{ auditSeq: number }> {
    try {
      const r = (
        await sql<{ audit_seq: string }>`select audit_seq from audit.commit_event(
          ${o.eventType}, ${route.action}, ${o.outcome}, ${o.resultCode},
          ${o.target.type}, ${o.target.id}, ${o.target.version},
          ${o.policyDecisionId}::uuid, ${o.policyVersion},
          ${envelope.correlation_id}::uuid, ${envelope.causation_id ?? null}::uuid,
          ${envelope.trace_id}, ${envelope.payload_digest},
          ${envelope.delegation_id ?? null}, ${JSON.stringify(o.metadata)}::jsonb
        )`.execute(tx)
      ).rows[0];
      if (r === undefined) throw new Error('audit port returned no sequence');
      return { auditSeq: Number(r.audit_seq) };
    } catch (e) {
      throw new AuditUnavailableError(e);
    }
  }

  /**
   * Fail-closed conversion: durable degraded-state evidence through the
   * independent journal, then a non-disclosing 503. The failure is never
   * swallowed and never downgraded to a success.
   */
  private failClosed(envelope: Envelope, route: RouteInfo, e: AuditUnavailableError): HttpException {
    degradedAudit.record({
      kind: 'audit_unavailable',
      correlationId: envelope.correlation_id,
      route: route.action,
      failureClass: 'audit_unavailable',
      scope: route.scope,
      detail: e.reason instanceof Error ? e.reason.message.slice(0, 300) : String(e.reason).slice(0, 300),
      suppressedCarried: 0,
    });
    // Best-effort durable in-database incident as well (may itself be down).
    void this.commitDb
      .transaction()
      .execute(async (tx) => {
        await sql`select ctx.issue_system('audit availability incident')`.execute(tx);
        await sql`select audit.record_availability_incident(
          ${newId()}::uuid, 'audit_unavailable', ${route.scope}, ${envelope.correlation_id}::uuid,
          ${JSON.stringify({ action: route.action })}::jsonb
        )`.execute(tx);
      })
      .catch(() => undefined);
    return new HttpException(
      errorBody('EYE_INT_001', envelope.correlation_id, 'authoritative audit unavailable — request refused'),
      503,
    );
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
    await this.writer(route).transaction().execute(async (tx) => {
      await this.establishEvidenceContext(tx, principal, ctx, envelope);
      const polId = await this.commitPolicy(tx, envelope, route, policyInput, policyResult);
      await this.commitAudit(tx, envelope, route, {
        eventType: 'api.request',
        outcome: policyResult.decision === 'deny' ? 'denied' : 'indeterminate',
        resultCode: policyResult.decision === 'deny' ? 'EYE-AUT-001' : 'EYE-AUT-002',
        policyDecisionId: polId,
        policyVersion: policyResult.bundleVersion,
        target: { type: route.objectType, id: route.objectId, version: null },
        metadata: { assurance: principal.assurance, reason: (policyResult.reason ?? '').slice(0, 200) },
      });
    });
  }

  /**
   * Scope/route/envelope mismatches happen BEFORE any context for the requested
   * scope can exist — durable sanitized denial evidence goes to the platform
   * partition under system context. Evidence-path failure is NOT swallowed: it
   * degrades the process and fails the request closed.
   */
  private async recordScopeDenial(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    reason: string,
  ): Promise<void> {
    try {
      await this.commitDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_system('scope-denial evidence')`.execute(tx);
        await sql`select audit.commit_event(
          'request.scope_denied', ${route.action}, 'denied', 'EYE-TEN-001',
          ${route.objectType}, ${route.objectId}, null, null::uuid, null,
          ${envelope.correlation_id}::uuid, ${envelope.causation_id ?? null}::uuid,
          ${envelope.trace_id}, ${envelope.payload_digest},
          ${envelope.delegation_id ?? null},
          ${JSON.stringify({
            reason: reason.slice(0, 200),
            route_scope: route.scope,
            envelope_scope: envelope.scope,
            subject: `principal:${principal.principalId}`,
          })}::jsonb
        )`.execute(tx);
      });
    } catch (e) {
      this.recordEvidenceFailure(envelope, route, 'scope_denial_evidence', e);
      throw new HttpException(
        errorBody('EYE_INT_001', envelope.correlation_id, 'authoritative audit unavailable — request refused'),
        503,
      );
    }
  }

  /** Pre-handler rejection evidence (§6) for authenticated malformed requests. */
  private async recordPreHandlerRejection(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    resultCode: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.commitDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_system('pre-handler rejection evidence')`.execute(tx);
        await sql`select audit.commit_event(
          'request.rejected', ${route.action}, 'failure', ${resultCode},
          ${route.objectType}, ${route.objectId}, null, null::uuid, null,
          ${envelope.correlation_id}::uuid, ${envelope.causation_id ?? null}::uuid,
          ${envelope.trace_id}, ${envelope.payload_digest},
          ${envelope.delegation_id ?? null},
          ${JSON.stringify({
            reason: reason.slice(0, 200),
            stage: 'pre-handler validation',
            subject: `principal:${principal.principalId}`,
          })}::jsonb
        )`.execute(tx);
      });
    } catch (e) {
      this.recordEvidenceFailure(envelope, route, 'pre_handler_rejection_evidence', e);
      throw new HttpException(
        errorBody('EYE_INT_001', envelope.correlation_id, 'authoritative audit unavailable — request refused'),
        503,
      );
    }
  }

  /** Sanitized failure evidence after a rolled-back handler. */
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
      await this.writer(route).transaction().execute(async (tx) => {
        await this.establishContext(tx, principal, ctx, envelope);
        const polId = await this.commitPolicy(tx, envelope, route, policyInput, policyResult);
        await this.commitAudit(tx, envelope, route, {
          eventType: 'api.request',
          outcome: 'failure',
          resultCode: code,
          policyDecisionId: polId,
          policyVersion: policyResult.bundleVersion,
          target: { type: route.objectType, id: route.objectId, version: null },
          metadata: { assurance: principal.assurance, stage: 'handler' },
        });
      });
    } catch (e) {
      // The original failure still propagates, but the LOST EVIDENCE is durable
      // and the process is marked degraded — never a silent swallow.
      this.recordEvidenceFailure(envelope, route, 'handler_failure_evidence', e);
    }
  }

  private recordEvidenceFailure(envelope: Envelope, route: RouteInfo, stage: string, e: unknown): void {
    degradedAudit.record({
      kind: 'evidence_write_failed',
      correlationId: envelope.correlation_id,
      route: route.action,
      failureClass: stage,
      scope: route.scope,
      detail: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      suppressedCarried: 0,
    });
  }
}
