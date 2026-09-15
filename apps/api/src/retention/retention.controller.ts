/**
 * The retention routes (0066 §4): one governed act per state transition of a retention action; reads apart.
 *   POST …/retention/schedules/declare      retention.schedule.declare   (domain admin)
 *   POST …/retention/schedules/evaluate     retention.schedule.evaluate  (steward) — opens the actions that fell due; RetentionActionDue each
 *   POST …/retention/actions/open           retention.action.open        (steward) — RetentionActionDue
 *   POST …/retention/actions/:id/resolve    retention.action.resolve     (steward)
 *   POST …/retention/actions/:id/approve    retention.action.approve     (retention authority, human-gated, on the scope digest)
 *   POST …/retention/actions/:id/execute    retention.action.execute     (steward, human-gated; never an approver)
 *   POST …/retention/actions/:id/verify     retention.action.verify      (steward) — DeletionVerified (a deletion or a log-floor move; never an archive, an export or a review)
 *   POST …/retention/actions/:id/withdraw   retention.action.withdraw
 *   POST …/retention/actions/:id/export/get     retention.read           (B11, 0070 §3) — the export package's record, its manifest.json and the files it holds; 409 once revoked
 *   POST …/retention/actions/:id/export/revoke  retention.export.revoke  (B11; the retention authority, human-gated) — the package revoked once, its bytes removed after the commit
 *   POST …/retention/actions/:id/get, /actions/list, /schedules/list   retention.read
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { RetentionCapability } from './retention.capabilities.js';
import { RetentionExecutionRolledBack, RetentionService, failureClassOf, validateOpenAction, type ExecutionFailureClass } from './retention.service.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
type Row = Record<string, unknown>;

@Controller('/v1/tenants/:tenantId/domains/:domainId/retention')
export class RetentionController {
  constructor(private readonly pipeline: PipelineService, private readonly retention: RetentionService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  @Post('/schedules/declare')
  async declareSchedule(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const scheduleId = newId();
    const dueAfter = String(p['dueAfter'] ?? '');
    if (!/^\d+ (seconds?|minutes?|hours?|days?|months?|years?)$/.test(dueAfter)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'dueAfter is an interval such as "90 days"'), 422);
    // The schedule's selector keys as the actions it opens carry them (0070 §7): the open-action intake's spellings are mapped to the stored ones, so a schedule declared as an action is declared cannot be accepted with a key nothing reads.
    const rawSelector = (p['selector'] ?? {}) as Row;
    const selector: Row = { ...rawSelector };
    for (const [from, to] of [['sourceId', 'source_id'], ['classificationCeiling', 'classification_ceiling'], ['manifestId', 'manifest_id'], ['manifestIds', 'manifest_ids']] as const) {
      if (rawSelector[from] !== undefined) { selector[to] = rawSelector[from]; delete selector[from]; }
    }
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.schedule.declare', 'RTS', scheduleId), RetentionCapability.write,
      async (cap) => {
        await cap.declareSchedule({ scheduleId, tenantId, domainId, retentionProfile: String(p['retentionProfile'] ?? ''), targetKind: String(p['targetKind'] ?? 'evidence'), actionKind: String(p['actionKind'] ?? 'review'), dueAfter,
                                    selector, owner: p['ownerPrincipalId'] === undefined ? null : String(p['ownerPrincipalId']), actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { scheduleId }, targetType: 'RTS', targetId: scheduleId, targetVersion: null, outboxEvent: null };
      });
    return { schedule: out.result, receipt: receipt(out) };
  }

  /** The schedule evaluation: every object past its schedule raises an action and its event; nothing is deleted (AU-MEM-0059). */
  @Post('/schedules/evaluate')
  async evaluateSchedules(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.schedule.evaluate', 'RTS', null), RetentionCapability.write,
      async (cap) => {
        const opened = await cap.evaluateSchedules({ tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id });
        const events = opened.map((o) => this.retention.dueEvent({ actionId: String(o['action_id']), tenantId, domainId, kind: String(o['kind']), targetKind: String(o['target_kind']), selector: (o['selector'] ?? {}) as Row,
          retentionProfile: o['retention_profile'] === undefined ? null : (o['retention_profile'] as string | null), scheduleId: (o['schedule_id'] as string | null) ?? null, dueFrom: String(o['due_from']), openedBy: principal.principalId, action: 'retention.schedule.evaluate' }));
        return { result: { opened }, targetType: 'RTS', targetId: null, targetVersion: null, outboxEvent: null, ...(events.length > 0 ? { outboxEvents: events } : {}) };
      });
    return { evaluation: out.result, receipt: receipt(out) };
  }

  @Post('/actions/open')
  async openAction(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateOpenAction(body.payload ?? {}, envelope.correlation_id);
    const actionId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.action.open', 'RTA', actionId), RetentionCapability.write,
      async (cap) => {
        await cap.openAction({ actionId, tenantId, domainId, kind: intake.kind, targetKind: intake.targetKind, selector: intake.selector, retentionProfile: intake.retentionProfile, scheduleId: null, actor: principal.principalId, correlationId: envelope.correlation_id });
        const due = this.retention.dueEvent({ actionId, tenantId, domainId, kind: intake.kind, targetKind: intake.targetKind, selector: intake.selector, retentionProfile: intake.retentionProfile, scheduleId: null, dueFrom: new Date().toISOString(), openedBy: principal.principalId, action: 'retention.action.open' });
        return { result: { actionId, kind: intake.kind, targetKind: intake.targetKind, state: 'opened' }, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: due };
      });
    return { action: out.result, receipt: receipt(out) };
  }

  @Post('/actions/:actionId/resolve')
  async resolveScope(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.action.resolve', 'RTA', actionId), RetentionCapability.write,
      async (cap) => ({ result: await cap.resolveScope({ actionId, tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null }));
    return { scope: out.result, receipt: receipt(out) };
  }

  @Post('/actions/:actionId/approve')
  async approve(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string, @Body() body: { payload?: { scopeDigest?: string; rationale?: string } }) {
    const { envelope, principal } = ctx(req);
    const scopeDigest = String(body.payload?.scopeDigest ?? ''); const rationale = String(body.payload?.rationale ?? '').trim();
    if (!/^[0-9a-f]{64}$/.test(scopeDigest)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'scopeDigest is the resolved scope\'s digest the approver read'), 422);
    if (rationale.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'rationale is at least 8 characters'), 422);
    const approvalId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.action.approve', 'RTA', actionId), RetentionCapability.write,
      async (cap) => {
        await cap.recordApproval({ approvalId, actionId, tenantId, domainId, scopeDigest, rationale, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { approvalId, actionId, state: 'approved' }, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null };
      });
    return { approval: out.result, receipt: receipt(out) };
  }

  /**
   * EXECUTE (0066 §4, corrected by 0067 §1, generalised by B11 / 0070 §5): the approved scope in one transaction; a refusal at
   * execution — a hold placed since the approval, the export's rights withdrawn, a copy or a package build that failed — rolls the
   * whole execution back, removes what left the transaction (an archive's copies, an export's files) and pauses the action with its
   * failure class for re-resolution — a tombstone or a live reference since the approval likewise (unresolved_dependency); the bytes go
   * after the commit (a deletion's, from both roots; an archive's hot copy)
   * and a removal the vault refuses is recorded as a pending residual on the action; an executed action with pending bytes
   * residuals is retried by the same route.
   */
  @Post('/actions/:actionId/execute')
  async execute(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string) {
    const { envelope, principal } = ctx(req);
    const state = await this.pipeline.consequentialRead({ ...envelope, action: 'retention.read', object_type: 'RTA', object_id: actionId, message_id: newId(), side_effect_class: 'none', consequence_class: 'C1' } as typeof envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RTA', actionId), RetentionCapability.read,
      async (cap) => ((await cap.readActions().select(['state' as never]).where('action_id' as never, '=', actionId as never).executeTakeFirst()) as { state: string } | undefined)?.state ?? null);
    if (state.result === 'executed') {
      const retry = await this.pipeline.consequentialRead({ ...envelope, action: 'retention.action.execute', object_type: 'RTA', object_id: actionId, message_id: newId() } as typeof envelope, principal, this.route(tenantId, domainId, 'retention.action.execute', 'RTA', actionId), RetentionCapability.read,
        async (cap) => this.retention.retryBytes(cap, { tenantId, domainId }, actionId));
      return { execution: { retried: true, pending: retry.result.pending, bytes: { removed: retry.result.removed, failed: retry.result.failed } }, receipt: receipt(retry) };
    }
    const pause = async (failureClass: ExecutionFailureClass, reason: string) => {
      await this.pipeline.write({ ...envelope, message_id: newId() } as typeof envelope, principal, this.route(tenantId, domainId, 'retention.action.execute', 'RTA', actionId), RetentionCapability.write,
        async (cap) => { await cap.pauseAction({ actionId, tenantId, domainId, failureClass, reason, actor: principal.principalId, correlationId: envelope.correlation_id }); return { result: null, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null }; });
    };
    let out: Awaited<ReturnType<PipelineService['write']>> & { result: Awaited<ReturnType<RetentionService['execute']>> };
    // The executor's verdict is kept beside the transaction (0071): when the ROLLBACK itself fails — the connection lost after the state
    // moved — the rollback's error would otherwise replace the rolled-back execution's class and reason, and the action would stay approved
    // with no pause on record; the pause below is its own write on a fresh connection.
    const verdict: { rolled: RetentionExecutionRolledBack | null; outcome: Awaited<ReturnType<RetentionService['execute']>> | null } = { rolled: null, outcome: null };
    try {
      out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.action.execute', 'RTA', actionId), RetentionCapability.write,
        async (cap) => {
          try { const result = await this.retention.execute(cap, { actionId, tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id }); verdict.outcome = result; return { result, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null }; }
          catch (e) { if (e instanceof RetentionExecutionRolledBack) verdict.rolled = e; throw e; }
        });
    } catch (e) {
      const rolled = verdict.rolled ?? (e instanceof RetentionExecutionRolledBack ? e : null);
      if (rolled !== null) {
        // What left the transaction is removed first (best effort: a failure is part of the pause reason), then the pause is its own write.
        let reason = rolled.message;
        if (!(e instanceof RetentionExecutionRolledBack)) reason = `${reason}; the transaction's own rollback failed (${String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 160)}) — the server rolled it back with the connection`;
        try { await rolled.cleanup(); } catch (c) { reason = `${reason}; the cleanup after the rollback failed: ${(c as Error).message.slice(0, 200)}`; }
        // The pause is refused when the action is no longer approved — a second attempt, admitted after this one's backend was lost, has
        // executed it meanwhile (0071): this attempt's verdict is still answered, with the refusal named, never a bare error.
        try { await pause(rolled.failureClass, reason); }
        catch (p) { reason = `${reason}; the pause could not be recorded: ${String((p as { message?: unknown })?.message ?? 'unknown').slice(0, 200)}`; }
        throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `the execution was rolled back and the action paused: ${reason}`), 409);
      }
      // The locks could not be taken at the start (0071 §1): a deadlock PostgreSQL detected (40P01) or a lock it could not grant (55P03) —
      // nothing moved, the action is still approved; it pauses for a retry by its normal route.
      const code = (e as { code?: unknown })?.code;
      if (code === '40P01' || code === '55P03') {
        const why = `the execution could not take its locks (${String(code)}): ${String((e as { message?: unknown })?.message ?? '').slice(0, 300)}; retried by the same route`;
        await pause('infrastructure', why);
        throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `the execution was rolled back and the action paused: ${why}`), 409);
      }
      // The handler returned but the transaction failed after it (the policy or audit commit, the outbox, the COMMIT itself): the record did not
      // commit — or its acknowledgement was lost — and the attempt's staged copies are removed by name (0071); were the commit real after all,
      // the retry route copies the kept hot copy again. The action stays approved; the error is answered as it is.
      if (verdict.outcome !== null && verdict.outcome.copiesToPublish.length > 0) {
        for (const c of verdict.outcome.copiesToPublish) await this.retention.removeStagedCopy({ tenantId, domainId }, c.locator, c.attemptId).catch(() => undefined);
      }
      // begin_execution's re-checks (B11, 0070 §5) raised BEFORE the state moved, so the action is still approved and pauses with the class the
      // refusal names: the export's rights withdrawn (authority_disputed), a tombstone or a live reference since the approval (unresolved_dependency → human review).
      const message = (e as { message?: unknown })?.message;
      if (typeof message === 'string' && /^retention execution rejected \((rights_changed|scope_changed|references_changed)\)/.test(message)) {
        await pause(failureClassOf(e), message);
        throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `the execution was rolled back and the action paused: ${message}`), 409);
      }
      throw e;
    }
    // After the commit (0071): an archive's staged copies are PUBLISHED under their locators first; then the bytes go, each from its tier —
    // a hot copy whose archive copy could not be published stays, and both a failed publish and a removal the vault refuses are recorded on
    // the action as a pending residual (retried by this route, which publishes before it removes; closed by verification).
    const publish = await this.retention.publishCopies({ tenantId, domainId }, out.result.copiesToPublish);
    const unpublished = new Set(publish.failed.map((f) => f.locator));
    const bytes = await this.retention.removeBytes({ tenantId, domainId }, out.result.locatorsToRemove.filter((l) => !(l.vault === 'evidence' && unpublished.has(l.locator))));
    if (bytes.failed.length > 0 || publish.failed.length > 0) {
      await this.pipeline.write({ ...envelope, message_id: newId() } as typeof envelope, principal, this.route(tenantId, domainId, 'retention.action.execute', 'RTA', actionId), RetentionCapability.write,
        async (cap) => {
          const noted = new Set<string>();
          for (const l of out.result.locatorsToRemove.filter((x) => bytes.failed.includes(x.locator))) {
            if (noted.has(l.locator)) continue; noted.add(l.locator);
            await cap.recordBytesResidual({ actionId, tenantId, domainId, manifestRef: l.ref, locator: l.locator, error: 'the vault refused the removal after the record committed', actor: principal.principalId, correlationId: envelope.correlation_id });
          }
          for (const f of publish.failed) {
            await cap.recordBytesResidual({ actionId, tenantId, domainId, manifestRef: f.ref, locator: f.locator, error: `the archive copy is staged but could not be published after the commit: ${f.error}`, actor: principal.principalId, correlationId: envelope.correlation_id });
          }
          return { result: null, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null };
        });
    }
    const failedAll = [...bytes.failed, ...publish.failed.map((f) => f.locator).filter((l) => !bytes.failed.includes(l))];
    return { execution: { executed: out.result.executed, held: out.result.held, refused: out.result.refused, floor: out.result.floor, package: out.result.package, bytes: { removed: bytes.removed, failed: failedAll }, published: publish.published.length }, receipt: receipt(out) };
  }

  @Post('/actions/:actionId/verify')
  async verify(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.action.verify', 'RTA', actionId), RetentionCapability.write,
      async (cap) => {
        const observed = await this.retention.observeForVerification(cap, { tenantId, domainId }, actionId);
        const verdict = await cap.verifyAction({ actionId, tenantId, domainId, observed, actor: principal.principalId, correlationId: envelope.correlation_id });
        const verified = verdict['verified'] === true;
        // DeletionVerified (L3-I05) is a DELETION's proof (a deletion or a log-floor move); a review's, an archive's or an export's verification is its own record, not that event (B9-F3; D10).
        const deletion = verified && ['deletion', 'log_floor'].includes(String(verdict['kind']));
        return { result: verdict, targetType: 'RTA', targetId: actionId, targetVersion: null,
                 outboxEvent: deletion ? this.retention.deletionVerifiedEvent({ actionId, tenantId, domainId, verdict, actor: principal.principalId }) : null };
      });
    return { verification: out.result, receipt: receipt(out) };
  }

  @Post('/actions/:actionId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = String(body.payload?.reason ?? '').trim();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.action.withdraw', 'RTA', actionId), RetentionCapability.write,
      async (cap) => { await cap.withdrawAction({ actionId, tenantId, domainId, reason, actor: principal.principalId, correlationId: envelope.correlation_id }); return { result: { actionId, state: 'withdrawn' }, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null }; });
    return { action: out.result, receipt: receipt(out) };
  }

  /** B11 (0070 §3): the export package's record, its manifest.json as written and the files the package holds; a revoked package is refused (its bytes are gone). */
  @Post('/actions/:actionId/export/get')
  async getExport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RTA', actionId), RetentionCapability.read, async (cap) => this.retention.exportPackage(cap, { tenantId, domainId }, actionId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized export package matches'), 404);
    const revokedAt = out.result.package['revoked_at'];
    if (revokedAt !== null && revokedAt !== undefined) throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `the export package of ${actionId} was revoked at ${new Date(revokedAt as string | Date).toISOString()}; its bytes are gone`), 409);
    return { ...out.result, receipt: receipt(out) };
  }

  /**
   * B11 (0070 §3; V03-T-047 "revocation where supported"): the retention authority revokes the package once, with a reason; the
   * bytes are removed after the commit. A package already revoked whose directory is still there (a removal that failed) only has
   * its removal retried — the port is not called again; one revoked and absent is refused by the port's own rule.
   */
  @Post('/actions/:actionId/export/revoke')
  async revokeExport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = String(body.payload?.reason ?? '').trim();
    if (reason.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reason is at least 8 characters'), 422);
    const scope = { tenantId, domainId };
    const remove = async (): Promise<{ removed: boolean; error?: string }> => {
      try { await this.retention.removePackage(scope, actionId); return { removed: true }; } catch (e) { return { removed: false, error: (e as Error).message.slice(0, 200) }; }
    };
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.revoke', 'RTA', actionId), RetentionCapability.write,
      async (cap) => {
        const existing = await this.retention.exportPackage(cap, scope, actionId);
        if (existing !== null && existing.package['revoked_at'] !== null && existing.package['revoked_at'] !== undefined && existing.files.length > 0) {
          return { result: { revocation: { action_id: actionId, package_digest: existing.package['package_digest'], locator_prefix: existing.package['locator_prefix'], revoked_at: existing.package['revoked_at'], retried: true } }, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null };
        }
        const revocation = await cap.revokeExport({ actionId, tenantId, domainId, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { revocation }, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null };
      });
    // The bytes go after the record committed.
    const bytes = await remove();
    return { revocation: out.result.revocation, bytes, receipt: receipt(out) };
  }

  @Post('/actions/:actionId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RTA', actionId), RetentionCapability.read, async (cap) => this.retention.action(cap, actionId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized retention action matches'), 404);
    return { ...out.result, receipt: receipt(out) };
  }
  @Post('/actions/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { limit?: number } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RTA', null), RetentionCapability.read, async (cap) => ({ actions: await this.retention.list(cap, body.payload?.limit ?? 200), partitions: await cap.outboxPartitionTelemetry() }));
    return { ...out.result, receipt: receipt(out) };
  }
  @Post('/schedules/list')
  async listSchedules(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RTS', null), RetentionCapability.read, async (cap) => this.retention.schedules(cap));
    return { schedules: out.result, receipt: receipt(out) };
  }
}
