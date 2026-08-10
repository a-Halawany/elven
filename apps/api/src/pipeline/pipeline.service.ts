/**
 * Authoritative request pipeline — ADR-P0-08 + Gate-2 + Gate-2.1.
 *
 * Gate-2.1 changes:
 *  * The commit context is minted by ctx.issue_commit and BOUND to the action,
 *    target, correlation id, policy-decision id, bundle version, consequence
 *    class, session, principal, scope and purpose. The same context cannot
 *    authorize a different operation inside the transaction, and every port
 *    revalidates live authority (session, expiry, principal, epoch, binding) at
 *    the write boundary using wall-clock time.
 *  * Business handlers receive a BoundedCapability, never a transaction, so a
 *    handler cannot reach an unrelated port or issue raw SQL.
 *  * Denials are recorded through the capability-free evidence context, which is
 *    validated against the attempted route and can only record denial/failure.
 *  * Every authenticated validation failure goes through
 *    rejectAuthenticatedRequest, which produces durable sanitized evidence.
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
import { BoundedCapability } from '../shared/capabilities.js';

export interface RouteInfo {
  scope: Scope;
  tenantId: string | null;
  domainId: string | null;
  action: string;
  objectType: string | null;
  objectId: string | null;
  consequenceClass?: ConsequenceClass;
  /** Which authoritative writer executes this route (never broader). */
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

/**
 * Raised when the DATABASE refuses to mint the capability for this request
 * (Gate-2.1 §4/§7): the session lapsed, the authority epoch moved, the binding
 * disappeared, or the assurance is not sufficient. This is an AUTHORIZATION
 * outcome, not an internal error — it must leave durable sanitized evidence and
 * answer 403, never 500.
 */
export class CapabilityDeniedError extends Error {
  constructor(readonly denialClass: string) {
    super(`capability denied: ${denialClass}`);
  }
}

/**
 * Classify a boundary refusal WITHOUT echoing database text to the caller or into
 * evidence metadata. Anything unrecognized is reported as the generic class.
 */
function classifyDenial(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid session proof')) return 'session_proof_invalid';
  if (m.includes('no such session')) return 'session_unknown';
  if (m.includes('session not active')) return 'session_not_active';
  if (m.includes('bootstrap assurance')) return 'bootstrap_assurance_incomplete';
  if (m.includes('principal not active')) return 'principal_not_active';
  if (m.includes('epoch changed')) return 'authority_epoch_changed';
  if (m.includes('no qualifying binding')) return 'no_qualifying_binding';
  if (m.includes('session is not active')) return 'session_not_active';
  if (m.includes('session/principal mismatch')) return 'session_principal_mismatch';
  if (m.includes('bootstrap assurance cannot act')) return 'bootstrap_assurance_incomplete';
  if (m.includes('revocation epoch changed')) return 'authority_epoch_changed';
  if (m.includes('carries no subject')) return 'context_without_subject';
  if (m.includes('scope')) return 'scope_not_permitted';
  return 'capability_refused';
}

/** True for a PostgreSQL insufficient_privilege raised by a capability minter. */
function isCapabilityRefusal(e: unknown): e is Error {
  return (
    e instanceof Error &&
    (e as { code?: string }).code === '42501' &&
    /context denied|capability denied|capability refused|authority revoked|business write rejected/i.test(e.message)
  );
}

@Injectable()
export class PipelineService {
  constructor(
    @Inject(APP_DB) private readonly db: Db,
    @Inject(COMMIT_DB) private readonly commitDb: Db,
    @Inject(IDENTITY_DB) private readonly identityDb: Db,
    private readonly pdp: PdpService,
  ) {}

  private writer(route: RouteInfo): Db {
    return route.authority === 'identity' ? this.identityDb : this.commitDb;
  }

  /** Allowed write path — business effect + POL + AUD + outbox in ONE transaction. */
  async write<T>(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    handler: (cap: BoundedCapability, ctx: ScopeContext) => Promise<WriteEffect<T>>,
  ): Promise<PipelineOutcome<T>> {
    const { ctx, policyInput, policyResult } = await this.resolveAndEvaluate(envelope, principal, route);

    if (policyResult.decision === 'deny' || policyResult.decision === 'indeterminate') {
      await this.recordDenial(envelope, principal, route, ctx, policyInput, policyResult);
      throw deny(policyResult.decision === 'deny' ? 'EYE_AUT_001' : 'EYE_AUT_002', envelope.correlation_id, policyResult.reason);
    }

    const polId = newId();
    try {
      return await this.writer(route).transaction().execute(async (tx) => {
        await this.establishCommitContext(tx, principal, ctx, envelope, route, polId, policyResult);
        const cap = BoundedCapability.forPipeline(tx, route.action);
        const effect = await handler(cap, ctx);
        await this.commitPolicy(tx, envelope, route, policyInput, policyResult, polId);
        const aud = await this.commitAudit(tx, envelope, route, {
          outcome: 'success',
          resultCode: 'OK',
          policyDecisionId: polId,
          policyVersion: policyResult.bundleVersion,
          target: { type: effect.targetType, id: effect.targetId, version: effect.targetVersion },
          metadata: { assurance: principal.assurance },
        });
        if (effect.outboxEvent != null) {
          await cap.enqueueOutbox(
            newId(), effect.outboxEvent.eventType, effect.outboxEvent.payload,
            envelope.correlation_id, envelope.message_id,
          );
        }
        return { result: effect.result, policyDecisionId: polId, auditSeq: aud.auditSeq, obligations: policyResult.obligations };
      });
    } catch (e) {
      if (e instanceof AuditUnavailableError) throw this.failClosed(envelope, route, e);
      if (e instanceof CapabilityDeniedError) throw await this.denyCapability(envelope, principal, route, e);
      await this.recordHandlerFailure(envelope, principal, ctx, route, policyInput, policyResult, e);
      throw e;
    }
  }

  /** Allowed consequential read — POL+AUD durable before data leaves; no outbox. */
  async consequentialRead<T>(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    handler: (cap: BoundedCapability, ctx: ScopeContext, obligations: Obligation[]) => Promise<T>,
  ): Promise<PipelineOutcome<T>> {
    const { ctx, policyInput, policyResult } = await this.resolveAndEvaluate(envelope, principal, route);

    if (policyResult.decision === 'deny' || policyResult.decision === 'indeterminate') {
      await this.recordDenial(envelope, principal, route, ctx, policyInput, policyResult);
      throw deny(policyResult.decision === 'deny' ? 'EYE_AUT_001' : 'EYE_AUT_002', envelope.correlation_id, policyResult.reason);
    }

    const polId = newId();
    try {
      return await this.writer(route).transaction().execute(async (tx) => {
        await this.establishCommitContext(tx, principal, ctx, envelope, route, polId, policyResult);
        const cap = BoundedCapability.forPipeline(tx, route.action);
        await this.commitPolicy(tx, envelope, route, policyInput, policyResult, polId);
        const aud = await this.commitAudit(tx, envelope, route, {
          outcome: 'success',
          resultCode: 'OK',
          policyDecisionId: polId,
          policyVersion: policyResult.bundleVersion,
          target: { type: route.objectType, id: route.objectId, version: null },
          metadata: { assurance: principal.assurance },
        });
        const result = await handler(cap, ctx, policyResult.obligations);
        return { result, policyDecisionId: polId, auditSeq: aud.auditSeq, obligations: policyResult.obligations };
      });
    } catch (e) {
      if (e instanceof AuditUnavailableError) throw this.failClosed(envelope, route, e);
      if (e instanceof CapabilityDeniedError) throw await this.denyCapability(envelope, principal, route, e);
      await this.recordHandlerFailure(envelope, principal, ctx, route, policyInput, policyResult, e);
      throw e;
    }
  }

  /**
   * A consequential read whose EVIDENCE DEPENDS ON ITS RESULT (Gate-2.1 §7).
   *
   * The ordinary consequentialRead writes its AUD before the handler runs, which
   * is right when the handler cannot change the request's outcome. It is wrong for
   * audit.verify: an unknown or damaged partition would then be recorded as a
   * successful request merely because the HTTP handler completed. Here the handler
   * runs first and the evidence — outcome, result code and detail — is derived
   * from what it actually found. Everything is still ONE transaction, so nothing
   * has left the boundary before its evidence is durable.
   */
  async consequentialReadEvidenced<T>(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    handler: (cap: BoundedCapability, ctx: ScopeContext, obligations: Obligation[]) => Promise<T>,
    evidenceOf: (result: T) => {
      outcome: 'success' | 'failure' | 'indeterminate';
      resultCode: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<PipelineOutcome<T>> {
    const { ctx, policyInput, policyResult } = await this.resolveAndEvaluate(envelope, principal, route);

    if (policyResult.decision === 'deny' || policyResult.decision === 'indeterminate') {
      await this.recordDenial(envelope, principal, route, ctx, policyInput, policyResult);
      throw deny(policyResult.decision === 'deny' ? 'EYE_AUT_001' : 'EYE_AUT_002', envelope.correlation_id, policyResult.reason);
    }

    const polId = newId();
    try {
      return await this.writer(route).transaction().execute(async (tx) => {
        await this.establishCommitContext(tx, principal, ctx, envelope, route, polId, policyResult);
        const cap = BoundedCapability.forPipeline(tx, route.action);
        const result = await handler(cap, ctx, policyResult.obligations);
        const ev = evidenceOf(result);
        await this.commitPolicy(tx, envelope, route, policyInput, policyResult, polId);
        const aud = await this.commitAudit(tx, envelope, route, {
          outcome: ev.outcome,
          resultCode: ev.resultCode,
          // A non-success outcome must not claim the allow decision authorized it.
          policyDecisionId: ev.outcome === 'success' ? polId : null,
          policyVersion: policyResult.bundleVersion,
          target: { type: route.objectType, id: route.objectId, version: null },
          metadata: { assurance: principal.assurance, decision: policyResult.decision, ...ev.metadata },
        });
        return { result, policyDecisionId: polId, auditSeq: aud.auditSeq, obligations: policyResult.obligations };
      });
    } catch (e) {
      if (e instanceof AuditUnavailableError) throw this.failClosed(envelope, route, e);
      if (e instanceof CapabilityDeniedError) throw await this.denyCapability(envelope, principal, route, e);
      await this.recordHandlerFailure(envelope, principal, ctx, route, policyInput, policyResult, e);
      throw e;
    }
  }

  /**
   * Centralized durable rejection path (Gate-2.1 §7). EVERY authenticated
   * validation failure goes through here, so no controller edge can reject a
   * request without leaving sanitized evidence.
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

  /** Gate-2.1 §2 — a commit capability bound to this request AND its PDP result. */
  private async establishCommitContext(
    tx: Tx,
    principal: AuthenticatedPrincipal,
    ctx: ScopeContext,
    envelope: Envelope,
    route: RouteInfo,
    policyDecisionId: string,
    policyResult: PolicyResult,
  ): Promise<void> {
    try {
      await sql`select ctx.issue_commit(
        ${principal.sessionId}::uuid, ${principal.contextKey}, ${ctx.scope},
        ${ctx.tenantId}::uuid, ${ctx.domainId}::uuid, ${envelope.purpose_id ?? null},
        ${route.action}, ${route.objectId}, ${envelope.correlation_id}::uuid,
        ${policyDecisionId}::uuid, ${policyResult.bundleVersion},
        ${route.consequenceClass ?? envelope.consequence_class}, 60
      )`.execute(tx);
      // Gate-2.2 C6: bind the request's CAUSATION to the open operation. The C1
      // closure trigger then requires the closing audit event to carry exactly
      // this causation, so an effect cannot be closed under a different chain.
      if (envelope.causation_id != null) {
        await sql`select ctx.bind_operation_causation(${envelope.causation_id}::uuid)`.execute(tx);
      }
    } catch (e) {
      if (isCapabilityRefusal(e)) throw new CapabilityDeniedError(classifyDenial(e.message));
      throw e;
    }
  }

  /** Capability-free evidence context, validated against the attempted route. */
  private async establishEvidenceContext(
    tx: Tx,
    principal: AuthenticatedPrincipal,
    ctx: ScopeContext,
    envelope: Envelope,
    route: RouteInfo,
  ): Promise<void> {
    try {
      await sql`select ctx.issue_evidence(
        ${principal.sessionId}::uuid, ${principal.contextKey}, ${ctx.scope},
        ${ctx.tenantId}::uuid, ${ctx.domainId}::uuid, ${envelope.purpose_id ?? null},
        ${route.action}, ${route.scope}, ${route.tenantId}::uuid, ${route.domainId}::uuid,
        ${envelope.correlation_id}::uuid, 60
      )`.execute(tx);
    } catch (e) {
      if (isCapabilityRefusal(e)) throw new CapabilityDeniedError(classifyDenial(e.message));
      throw e;
    }
  }

  private async commitPolicy(
    tx: Tx,
    envelope: Envelope,
    route: RouteInfo,
    input: PolicyInput,
    result: PolicyResult,
    id: string,
  ): Promise<string> {
    try {
      await sql`select policy.commit_decision(
        ${id}::uuid, ${route.action}, ${route.objectType}, ${route.objectId}::uuid,
        ${input.consequenceClass}, ${result.decision}, ${JSON.stringify(result.obligations)}::jsonb,
        ${result.inputDigest}, ${result.bundleVersion}, ${result.exceptionRef},
        ${result.expiresAt}, ${result.revocationState}, ${result.reason},
        ${envelope.correlation_id}::uuid, ${envelope.delegation_id ?? null},
        ${JSON.stringify(input.environment)}::jsonb
      )`.execute(tx);
    } catch (e) {
      if (isCapabilityRefusal(e)) throw new CapabilityDeniedError(classifyDenial(e.message));
      throw e;
    }
    return id;
  }

  private async commitAudit(
    tx: Tx,
    envelope: Envelope,
    route: RouteInfo,
    o: {
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
          'api.request', ${route.action}, ${o.outcome}, ${o.resultCode},
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
      // An authority refusal is NOT an availability problem. Classifying it as
      // one would answer 503 ("try again later") to a request that must never
      // succeed, and would file an availability incident for a denial.
      if (isCapabilityRefusal(e)) throw new CapabilityDeniedError(classifyDenial(e.message));
      throw new AuditUnavailableError(e);
    }
  }

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
    void this.commitDb
      .transaction()
      .execute(async (tx) => {
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

  /** Denied/indeterminate: POL + AUD under the evidence capability. */
  private async recordDenial(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    ctx: ScopeContext,
    policyInput: PolicyInput,
    policyResult: PolicyResult,
  ): Promise<void> {
    const polId = newId();
    try {
      await this.writer(route).transaction().execute(async (tx) => {
        await this.establishEvidenceContext(tx, principal, ctx, envelope, route);
        await this.commitPolicy(tx, envelope, route, policyInput, policyResult, polId);
        await this.commitAudit(tx, envelope, route, {
          outcome: policyResult.decision === 'deny' ? 'denied' : 'indeterminate',
          resultCode: policyResult.decision === 'deny' ? 'EYE-AUT-001' : 'EYE-AUT-002',
          policyDecisionId: polId,
          policyVersion: policyResult.bundleVersion,
          target: { type: route.objectType, id: route.objectId, version: null },
          metadata: { assurance: principal.assurance, reason: (policyResult.reason ?? '').slice(0, 200) },
        });
      });
    } catch (e) {
      // If the caller's own authority is too weak even to carry its denial (a
      // lapsed or bootstrap-assurance session), the denial is still recorded —
      // under the identity capability, on the platform partition. A refused
      // request never leaves the system without evidence.
      if (e instanceof CapabilityDeniedError) {
        throw await this.denyCapability(envelope, principal, route, e);
      }
      throw e;
    }
  }

  /**
   * Scope/route/envelope mismatch: no context for the requested scope can exist,
   * so the denial is recorded under the identity capability on the platform
   * partition. Evidence-path failure fails the request closed.
   */
  private async recordScopeDenial(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    reason: string,
  ): Promise<void> {
    try {
      await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.security.intake', ${principal.principalId}::uuid,
          ${envelope.correlation_id}::uuid, 60)`.execute(tx);
        await sql`select audit.commit_intake_event(
          'request.scope_denied', 'request.scope_denied', 'EYE-TEN-001',
          ${envelope.correlation_id}::uuid, ${principal.principalId}::uuid,
          ${JSON.stringify({
            failure_class: 'scope_invalid',
            reason: reason.slice(0, 200),
            route_action: route.action,
            route_scope: route.scope,
            envelope_scope: envelope.scope,
            subject: `principal:${principal.principalId}`,
          })}::jsonb)`.execute(tx);
      });
    } catch (e) {
      this.recordEvidenceFailure(envelope, route, 'scope_denial_evidence', e);
      throw new HttpException(
        errorBody('EYE_INT_001', envelope.correlation_id, 'authoritative audit unavailable — request refused'),
        503,
      );
    }
  }

  /**
   * A capability refusal at the write boundary (Gate-2.1 §4/§7). The session that
   * authenticated is no longer sufficient, so no session-bound context can be
   * minted for the evidence either — the denial is recorded under the IDENTITY
   * capability on the platform partition, exactly like a scope denial, and the
   * caller receives 403 with no database text in it.
   */
  private async denyCapability(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    e: CapabilityDeniedError,
  ): Promise<HttpException> {
    try {
      await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.security.intake', ${principal.principalId}::uuid,
          ${envelope.correlation_id}::uuid, 60)`.execute(tx);
        await sql`select audit.commit_intake_event(
          'request.capability_denied', 'request.capability_denied', 'EYE-AUT-001',
          ${envelope.correlation_id}::uuid, ${principal.principalId}::uuid,
          ${JSON.stringify({
            failure_class: 'capability_denied',
            denial_class: e.denialClass,
            stage: 'write boundary',
            route_action: route.action,
            route_scope: route.scope,
            subject: `principal:${principal.principalId}`,
          })}::jsonb)`.execute(tx);
      });
    } catch (evidenceError) {
      this.recordEvidenceFailure(envelope, route, 'capability_denial_evidence', evidenceError);
      return new HttpException(
        errorBody('EYE_INT_001', envelope.correlation_id, 'authoritative audit unavailable — request refused'),
        503,
      );
    }
    return deny('EYE_AUT_001', envelope.correlation_id, 'authority insufficient for this operation');
  }

  private async recordPreHandlerRejection(
    envelope: Envelope,
    principal: AuthenticatedPrincipal,
    route: RouteInfo,
    resultCode: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.security.intake', ${principal.principalId}::uuid,
          ${envelope.correlation_id}::uuid, 60)`.execute(tx);
        await sql`select audit.commit_intake_event(
          'request.rejected', 'request.rejected', ${resultCode},
          ${envelope.correlation_id}::uuid, ${principal.principalId}::uuid,
          ${JSON.stringify({
            failure_class: 'validation_failed',
            stage: 'pre-handler validation',
            reason: reason.slice(0, 200),
            route_action: route.action,
            subject: `principal:${principal.principalId}`,
          })}::jsonb)`.execute(tx);
      });
    } catch (e) {
      this.recordEvidenceFailure(envelope, route, 'pre_handler_rejection_evidence', e);
      throw new HttpException(
        errorBody('EYE_INT_001', envelope.correlation_id, 'authoritative audit unavailable — request refused'),
        503,
      );
    }
  }

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
        await this.establishEvidenceContext(tx, principal, ctx, envelope, route);
        // The rolled-back transaction took its POL with it, so the decision the
        // request was allowed under is re-recorded here — marked evidence_only by
        // the port, and therefore permanently unusable to authorize a success.
        const polId = newId();
        await this.commitPolicy(tx, envelope, route, policyInput, policyResult, polId);
        await this.commitAudit(tx, envelope, route, {
          outcome: 'failure',
          resultCode: code,
          policyDecisionId: polId,
          policyVersion: policyResult.bundleVersion,
          target: { type: route.objectType, id: route.objectId, version: null },
          metadata: { assurance: principal.assurance, stage: 'handler' },
        });
      });
    } catch (e) {
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
