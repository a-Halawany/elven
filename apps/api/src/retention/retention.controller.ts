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
 *   POST …/retention/actions/:id/export/revoke  retention.export.revoke  (B11; the retention authority, human-gated) — the package revoked once, its bytes removed after the commit;
 *                                               B17 (0077): the admitted IMPORTS of the package in the tenant's domains notified (a signed importer notice each, answered under importers[].notice — never in notices[], which stays the destinations') and,
 *                                               after the commit, the revocation EXECUTED in each importing domain by the same principal (retention.import.revoke; a failure leaves the notice notified and the importer `pending`)
 *   POST …/retention/tier/declare           retention.tier.declare       (domain admin; B12, 0072 §1) — the cold-tier manager's policy, declared as the domain's next version
 *   POST …/retention/tier/state             retention.read               (B12) — the cold tier's observable state with the vault's inventory of both blob roots
 *   POST …/retention/schedules/:id/retire   retention.schedule.retire    (B13, 0073 §1; the schedule declare's holders: platform admin, tenant admin, domain admin) — active → retired once, its history kept
 *   POST …/retention/signing-keys/declare   retention.signing_key.declare (B13, 0073 §2; platform admin, tenant admin; human-gated) — the tenant's export signing key from its reference; the PUBLIC key recorded
 *   POST …/retention/signing-keys/:keyId/retire  retention.signing_key.retire (B13; the same holders) — the key retired with a reason; its packages still verify
 *   POST …/retention/signing-keys/list      retention.read               (B13) — the keys, the reference's NAME and readiness, never a value
 *   POST …/retention/destinations/declare   retention.destination.declare (B13, 0073 §3; the schedule declare's holders) — a transfer station (a directory outside the vault) or an https endpoint
 *   POST …/retention/destinations/:id/retire  retention.destination.retire (B13; the same holders)
 *   POST …/retention/destinations/list      retention.read               (B13) — each with its readiness (active / retired / blocked-credential)
 *   POST …/retention/actions/:id/export/download  retention.export.download (B13, D7; steward, retention authority, domain admin, tenant admin, auditor; audited) — the archive, its digest verified against the record; the event export.downloaded
 *   POST …/retention/actions/:id/export/deliver   retention.export.deliver  (B13, D6; retention authority, tenant admin, domain admin; human-gated) — the verified package to a declared destination; every outcome recorded
 *   POST …/retention/actions/:id/export/deliveries/list  retention.read  (B13)
 *   POST …/retention/actions/:id/export/deliveries/:deliveryId/collect-receipt  retention.export.acknowledge (B13; the deliver's holders; human-gated) — the transfer station's receipt.json → acknowledged | mismatched
 *   POST …/retention/actions/:id/export/deliveries/:deliveryId/acknowledge      retention.export.acknowledge (B13) — the recipient's receipt presented out of band
 *   POST …/retention/actions/:id/export/revocation-notices          retention.export.notify   (B14, 0074 §3; the deliver's holders; human-gated) — a further revocation notice to one destination that received the package;
 *                                                                   B17: or to one IMPORTER ({ importer: { domainId, importId } }) — the signed notice recorded, then the revocation executed in that domain (answered under `importer`)
 *   POST …/retention/actions/:id/export/revocation-notices/list     retention.read            (B14)
 *   POST …/retention/actions/:id/export/revocation-notices/:noticeId/collect-receipt  retention.export.acknowledge (B14) — the station's revocation-receipt.json → acknowledged | mismatched
 *   POST …/retention/actions/:id/export/revocation-notices/:noticeId/acknowledge      retention.export.acknowledge (B14) — the recipient's receipt presented out of band
 *   POST …/retention/actions/:id/export/stream       retention.export.download (B15, D2; the download's holders; audited) — the archive served RAW as application/x-tar with the digests and the signature in headers
 *   POST …/retention/partners/declare       retention.partner.declare   (B16, 0076 §3; the schedule declare's holders; human-gated) — an EXCHANGE PARTNER: the Ed25519 key whose packages this domain admits, bound to an intake source contract
 *   POST …/retention/partners/:id/retire    retention.partner.retire    (B16; the same holders; human-gated) — retired with a reason; its imports stay recorded; its key no longer resolves a package
 *   POST …/retention/partners/list          retention.read              (B16) — the partners with their intake contract's key, lifecycle and rights, and their state
 *   POST …/retention/imports/open           retention.import.open       (B16, 0076 §4; steward) — the package (inline base64, or read from a transfer station) QUARANTINED as vault blobs, checked, recorded verified | quarantined with its ordered checks and its plan of minted ids
 *   POST …/retention/imports/:id/approve    retention.import.approve    (B16; retention authority, human-gated, on the package digest; never the opener)
 *   POST …/retention/imports/:id/admit      retention.import.admit      (B16; steward, human-gated; never the approver) — the records, claims, entities, identifiers and edges admitted under NEW ids in batches; the quarantine copies of admitted records tombstoned after the commit
 *   POST …/retention/imports/:id/withdraw   retention.import.withdraw   (B16; steward) — quarantined | verified | approved | admitting → withdrawn; the quarantine copies tombstoned after the commit (C5)
 *   POST …/retention/imports/:id/revoke     retention.import.revoke     (B17, 0077 §7; the tenant's authority and admin, the domain's steward and admin; human-gated) — the ORIGIN'S REVOCATION executed here:
 *                                           source origin (the origin package's record on this installation) or station (the origin's SIGNED revocation.json, verified against the partner's key);
 *                                           edges retracted, entities retired, versions withdrawn, bytes tombstoned in batches; GraphChanged/import.revoked; the receipt recorded and the origin's notice answered
 *   POST …/retention/imports/:id/get, /imports/list   retention.read     (B16) — the import with its partner, items, events, checks and the import receipt
 *   POST …/retention/actions/:id/get, /actions/list, /schedules/list   retention.read
 */
import { Body, Controller, HttpException, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createPublicKey } from 'node:crypto';
import { resolve as resolvePath } from 'node:path';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { RetentionCapability, type RetentionReads } from './retention.capabilities.js';
import { RetentionExecutionRolledBack, RetentionService, failureClassOf, validateOpenAction, type ExecutionFailureClass } from './retention.service.js';
import { DESTINATION_CREDENTIAL_REF, SIGNING_ALGORITHM, SIGNING_KEY_REF, keyIdOf } from './export-signing.js';
import { RECEIPT_MAX_BYTES } from './export-delivery.service.js';
import { IMPORT_INLINE_MAX_BYTES } from './export-archive.js';
import { ImportService, type ImportIntake, type RevocationSource } from './import.service.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
type Row = Record<string, unknown>;
/** An interval as a schedule's dueAfter and the tier policy's ages are spelled: a count and a unit, such as "90 days". */
const INTERVAL = /^\d+ (seconds?|minutes?|hours?|days?|months?|years?)$/;
/**
 * begin_execution's refusals BEFORE the state moves (0070 §5; 0072 §4): the class in the message names what the controller does with them.
 * B13 (C14): the service's own refusal before begin_execution — the tenant's active signing key not bound in this deployment — joins them (a
 * pause for retry, infrastructure, no attempt counted).
 */
const ADMISSION_REFUSAL = /^retention execution rejected \((rights_changed|scope_changed|references_changed|budget_exhausted|attempts_exhausted|signing_key_unbound|signing_key_mismatch)\)/;
/** D5: a destination's key — unique per domain among the active destinations. B16: an exchange partner's key is spelled the same way. */
const DESTINATION_KEY = /^[a-z0-9][a-z0-9-]{1,63}$/;
const SIGNING_KEY_PURPOSES = ['demonstration', 'production'] as const;
const DESTINATION_KINDS = ['transfer_station', 'https'] as const;
/** B16: the ids an intake names (an intake source, an origin tenant/domain/action) are opaque identifiers, checked for shape before any read. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** B16 (D4): an inline package travels as standard base64 (whitespace tolerated as node tolerates it); its DECODED size is checked against the inline ceiling before anything is decoded. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
function base64DecodedLength(clean: string): number | null {
  if (!BASE64.test(clean) || clean.length % 4 !== 0) return null;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return (clean.length / 4) * 3 - padding;
}
/**
 * B16 (0076 §3; D6): an exchange partner's public key as the declaration presents it — parsed by node from whatever PEM the party
 * handed over, refused unless it is Ed25519, and NORMALISED to node's own SubjectPublicKeyInfo PEM (the port's regex is that
 * form) with the key id derived from the SPKI DER exactly as the export's own signing key derives it (export-signing.ts).
 */
type PartnerKey = { keyId: string; publicKeyPem: string };
function partnerKeyOf(pem: string): PartnerKey | null {
  try {
    const pub = createPublicKey({ key: pem, format: 'pem' });
    if (pub.asymmetricKeyType !== 'ed25519') return null;
    const spkiDer = pub.export({ format: 'der', type: 'spki' });
    return { keyId: keyIdOf(spkiDer), publicKeyPem: pub.export({ format: 'pem', type: 'spki' }).toString() };
  } catch {
    return null;
  }
}
/** The partner as an act's answer (the declaration's, the retirement's, the list's rows): the row with its state. */
function partnerAnswer(row: Row): Row {
  return { ...row, state: row['retired_at'] == null ? 'active' : 'retired' };
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/retention')
export class RetentionController {
  constructor(private readonly pipeline: PipelineService, private readonly retention: RetentionService, private readonly imports: ImportService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  @Post('/schedules/declare')
  async declareSchedule(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const scheduleId = newId();
    const dueAfter = String(p['dueAfter'] ?? '');
    if (!INTERVAL.test(dueAfter)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'dueAfter is an interval such as "90 days"'), 422);
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

  /**
   * The schedule evaluation: every object past its schedule raises an action and its event; nothing is deleted (AU-MEM-0059). B12
   * (0072 §6, §1; D4): the opens are oldest-due first and bounded by the policy per schedule — the rest DEFERRED to the next evaluation
   * and counted on the schedule — and the cold-tier manager's pass follows in the same act: every action paused for retry longer than
   * the policy's escalate_after is ESCALATED for human review, named in the answer.
   */
  @Post('/schedules/evaluate')
  async evaluateSchedules(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.schedule.evaluate', 'RTS', null), RetentionCapability.write,
      async (cap) => {
        const opened = await cap.evaluateSchedules({ tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id });
        const events = opened.map((o) => this.retention.dueEvent({ actionId: String(o['action_id']), tenantId, domainId, kind: String(o['kind']), targetKind: String(o['target_kind']), selector: (o['selector'] ?? {}) as Row,
          retentionProfile: o['retention_profile'] === undefined ? null : (o['retention_profile'] as string | null), scheduleId: (o['schedule_id'] as string | null) ?? null, dueFrom: String(o['due_from']), openedBy: principal.principalId, action: 'retention.schedule.evaluate' }));
        const tier = await cap.evaluateTier({ tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: { opened, escalated: (tier['escalated'] as Row[] | undefined) ?? [], deferred: Number(tier['deferred'] ?? 0) }, targetType: 'RTS', targetId: null, targetVersion: null, outboxEvent: null, ...(events.length > 0 ? { outboxEvents: events } : {}) };
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
   * whole execution back, removes what left the transaction (an archive's or a restore's copies, an export's files) and pauses the
   * action with its failure class for re-resolution — a tombstone or a live reference since the approval likewise
   * (unresolved_dependency); the bytes go after the commit (a deletion's, from both roots; an archive's hot copy; a restore's archive
   * copy, B12) and a removal the vault refuses is recorded as a pending residual on the action; an executed action with pending bytes
   * residuals is retried by the same route. B12 (0072 §4; D4, C2): the cold-tier manager's admission — the domain's daily byte budget
   * exhausted pauses the action for a retry (no attempt counted: the state never moved); the attempts the policy allows spent ESCALATES
   * it for human review; an attempt that failed after the state moved is counted where its pause is recorded.
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
    // The pause is its own write; `attempted` (0072; C2) counts the attempt where its failure is durably recorded — true when the state had
    // moved (begin_execution's own increment rolled back with the execution), false for a refusal before it moved.
    const pause = async (failureClass: ExecutionFailureClass, reason: string, attempted: boolean) => {
      await this.pipeline.write({ ...envelope, message_id: newId() } as typeof envelope, principal, this.route(tenantId, domainId, 'retention.action.execute', 'RTA', actionId), RetentionCapability.write,
        async (cap) => { await cap.pauseAction({ actionId, tenantId, domainId, failureClass, reason, attempted, actor: principal.principalId, correlationId: envelope.correlation_id }); return { result: null, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null }; });
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
        // executed it meanwhile (0071): this attempt's verdict is still answered, with the refusal named, never a bare error. The state had
        // moved: the attempt is counted with the pause (C2).
        try { await pause(rolled.failureClass, reason, true); }
        catch (p) { reason = `${reason}; the pause could not be recorded: ${String((p as { message?: unknown })?.message ?? 'unknown').slice(0, 200)}`; }
        throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `the execution was rolled back and the action paused: ${reason}`), 409);
      }
      // The locks could not be taken at the start (0071 §1): a deadlock PostgreSQL detected (40P01) or a lock it could not grant (55P03) —
      // nothing moved, the action is still approved; it pauses for a retry by its normal route (no attempt counted).
      const code = (e as { code?: unknown })?.code;
      if (code === '40P01' || code === '55P03') {
        const why = `the execution could not take its locks (${String(code)}): ${String((e as { message?: unknown })?.message ?? '').slice(0, 300)}; retried by the same route`;
        await pause('infrastructure', why, false);
        throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `the execution was rolled back and the action paused: ${why}`), 409);
      }
      // The handler returned but the transaction failed after it (the policy or audit commit, the outbox, the COMMIT itself): the record did not
      // commit — or its acknowledgement was lost — and the attempt's staged copies are removed by name from the root each was staged in (0071;
      // B12); were the commit real after all, the retry route copies the kept source copy again. The action stays approved; the error is answered as it is.
      if (verdict.outcome !== null && verdict.outcome.copiesToPublish.length > 0) {
        for (const c of verdict.outcome.copiesToPublish) await this.retention.removeStagedCopy({ tenantId, domainId }, c.locator, c.attemptId, c.vault).catch(() => undefined);
      }
      // begin_execution's re-checks (B11, 0070 §5; B12, 0072 §4) raised BEFORE the state moved, so the action is still approved (no attempt
      // counted) and pauses with the class the refusal names: the export's rights withdrawn (authority_disputed), a tombstone or a live reference
      // since the approval (unresolved_dependency → human review), the domain's daily byte budget exhausted (infrastructure → a retry once the
      // window frees, after a re-resolution) — or, the attempts the policy allows spent, is ESCALATED for human review (D4 "retries"): its own
      // write revokes the approvals and records action.escalated; a person's re-resolution restarts the count.
      const message = (e as { message?: unknown })?.message;
      if (typeof message === 'string' && ADMISSION_REFUSAL.test(message)) {
        if (message.startsWith('retention execution rejected (attempts_exhausted)')) {
          await this.pipeline.write({ ...envelope, message_id: newId() } as typeof envelope, principal, this.route(tenantId, domainId, 'retention.action.execute', 'RTA', actionId), RetentionCapability.write,
            async (cap) => { await cap.escalateAction({ actionId, tenantId, domainId, reason: message, actor: principal.principalId, correlationId: envelope.correlation_id }); return { result: null, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null }; });
          throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `the execution was refused and the action escalated: ${message}`), 409);
        }
        await pause(failureClassOf(e), message, false);
        throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `the execution was rolled back and the action paused: ${message}`), 409);
      }
      throw e;
    }
    // After the commit (0071; B12): the staged copies are PUBLISHED under their locators first — an archive's in the archive root, a restore's in
    // the hot root; then the bytes go, each from its tier — the SOURCE copy of a locator whose publish failed stays, in either direction (the
    // hot copy for an archive, the archive copy for a restore; C4), and both a failed publish and a removal the vault refuses are recorded on
    // the action as a pending residual (retried by this route, which publishes before it removes; closed by verification).
    const publish = await this.retention.publishCopies({ tenantId, domainId }, out.result.copiesToPublish);
    const unpublished = new Set(publish.failed.map((f) => f.locator));
    const bytes = await this.retention.removeBytes({ tenantId, domainId }, out.result.locatorsToRemove.filter((l) => !unpublished.has(l.locator)));
    if (bytes.failed.length > 0 || publish.failed.length > 0) {
      await this.pipeline.write({ ...envelope, message_id: newId() } as typeof envelope, principal, this.route(tenantId, domainId, 'retention.action.execute', 'RTA', actionId), RetentionCapability.write,
        async (cap) => {
          const noted = new Set<string>();
          for (const l of out.result.locatorsToRemove.filter((x) => bytes.failed.includes(x.locator))) {
            if (noted.has(l.locator)) continue; noted.add(l.locator);
            await cap.recordBytesResidual({ actionId, tenantId, domainId, manifestRef: l.ref, locator: l.locator, error: 'the vault refused the removal after the record committed', actor: principal.principalId, correlationId: envelope.correlation_id });
          }
          for (const f of publish.failed) {
            await cap.recordBytesResidual({ actionId, tenantId, domainId, manifestRef: f.ref, locator: f.locator, error: `the ${f.vault === 'evidence' ? 'hot' : 'archive'} copy is staged but could not be published after the commit: ${f.error}`, actor: principal.principalId, correlationId: envelope.correlation_id });
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
   *
   * B17 (0077 §5–§6; D6, D7, D14; C15): the importing domains of the tenant are RECIPIENTS. Inside the same write, after the destination
   * notices, ONE signed importer notice per admitted import of the package (retention.imports_of_package finds them across the tenant's
   * domains; the notice recorded on the origin's ledger with `importer` set, and import.revocation_notified on the importer's); AFTER the
   * commit and the bytes, the SAME acting principal executes the revocation in each importing domain (executeImporterRevocation). The
   * answer keeps `notices[]` for the DESTINATION notices (the B14/B16 readers key it by destination_key); the importer notices are
   * answered under `importers[].notice`, each with the execution's outcome (`revocation.state`: revoked | held | retried | pending).
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
    // B14 (0074 §3–§4; D3): the first REVOCATION NOTICE to every destination that received the package, inside the same write, after the
    // revocation is recorded — every outcome recorded (a failed notice is a fact; the revocation stands); the station paths this write
    // created removed when the commit fails after them (C6); the product's package.tar and package.sig at each station removed after
    // the commit, as the vault's bytes are.
    const created: string[] = [];
    type RevokeAnswer = { revocation: Row; notices: Row[]; importerNotices: Row[]; retried: boolean };
    let out: Awaited<ReturnType<PipelineService['write']>> & { result: RevokeAnswer };
    try {
      out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.revoke', 'RTA', actionId), RetentionCapability.write,
        async (cap): Promise<{ result: RevokeAnswer; targetType: string; targetId: string; targetVersion: null; outboxEvent: null }> => {
          const existing = await this.retention.exportPackage(cap, scope, actionId);
          if (existing !== null && existing.package['revoked_at'] !== null && existing.package['revoked_at'] !== undefined && existing.files.length > 0) {
            return { result: { revocation: { action_id: actionId, package_digest: existing.package['package_digest'], locator_prefix: existing.package['locator_prefix'], revoked_at: existing.package['revoked_at'], retried: true }, notices: [], importerNotices: [], retried: true }, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null };
          }
          const revocation = await cap.revokeExport({ actionId, tenantId, domainId, reason, actor: principal.principalId, correlationId: envelope.correlation_id });
          const notices: Row[] = [];
          for (const r of ((revocation['recipients'] ?? []) as Row[])) {
            notices.push(await this.retention.notifyRevocation(cap, scope, actionId, String(r['destination_id']), { actor: principal.principalId, correlationId: envelope.correlation_id }, created));
          }
          // B17: the importer notices — the admitted imports of this package in the tenant's domains, each notified on the origin's ledger (signed, D8).
          const importerNotices: Row[] = [];
          for (const im of ((revocation['importers'] ?? []) as Row[])) {
            importerNotices.push(await this.retention.notifyImporter(cap, scope, actionId, String(im['import_id']), { actor: principal.principalId, correlationId: envelope.correlation_id }));
          }
          return { result: { revocation, notices, importerNotices, retried: false }, targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null };
        });
    } catch (e) {
      if (created.length > 0) await this.retention.removeCreatedStationFiles(created).catch(() => undefined);
      throw e;
    }
    // The bytes go after the record committed: the vault's package directory, and the product's copies at every transfer station notified.
    const bytes = await remove();
    const stations = out.result.retried ? [] : await this.retention.removeStationPackages(scope, actionId,
      out.result.notices.filter((n) => String((n['destination'] as Row | undefined)?.['kind']) === 'transfer_station' && (n['station'] as Row | null) !== null && typeof (n['station'] as Row)['directory'] === 'string')
        .map((n) => ({ destination_key: String((n['destination'] as Row)['destination_key']), endpoint: String((n['destination'] as Row)['endpoint'] ?? '') }))
        .filter((st) => st.endpoint !== ''));
    // B17 (D7): the revocation executed in each importing domain, after the origin's commit, one governed act per importer — never inside
    // the origin's write, never failing it. The retried branch notified nobody and executes nothing (`importers: []`).
    const importers: Row[] = [];
    for (const im of out.result.importerNotices) importers.push(await this.executeImporterRevocation(envelope, principal, im));
    return { revocation: out.result.revocation, notices: out.result.notices, importers, bytes, stations, receipt: receipt(out) };
  }

  /**
   * B17 (D7; C15): the origin's revocation EXECUTED in one importing domain of the tenant, after the origin's commit — the SAME acting
   * principal under a DOMAIN envelope of that domain (a tenant-wide binding permits any domain route of the tenant; the human gate is met
   * by the same human at session assurance), through the governed act retention.import.revoke with `source: { kind: 'origin' }`. The
   * envelope is rebuilt per importing domain (scope DOMAIN, the importing tenant and domain, a fresh message id, the SAME correlation);
   * the service builds its own writes from it. A failure here NEVER fails the revocation: the origin's notice stays `notified` and the
   * importer is answered `pending` with the reason — a principal without authority in the importing domain (a domain administrator of
   * the origin: the error body's EYE_TEN_001 / EYE_AUT_001) is told the importing domain's steward completes it by the route; any other
   * failure carries its message. The notice is carried under `importers[].notice` (never in `notices[]`).
   */
  private async executeImporterRevocation(envelope: Envelope, principal: AuthenticatedPrincipal, im: Row): Promise<Row> {
    const importer = ((im['importer'] ?? {}) as Row);
    const importing = { tenantId: String(importer['tenant_id'] ?? ''), domainId: String(importer['domain_id'] ?? '') };
    const importId = String(importer['import_id'] ?? '');
    try {
      const r = await this.imports.revokeImport({
        envelope: { ...envelope, scope: 'DOMAIN', tenant_id: importing.tenantId, domain_id: importing.domainId, message_id: newId(), purpose_id: envelope.purpose_id ?? 'retention' },
        principal, scope: importing, importId, source: { kind: 'origin' },
        route: (action: string, objectType: string, objectId: string, writableTargets?: string[]) => ({ ...this.route(importing.tenantId, importing.domainId, action, objectType, objectId), ...(writableTargets === undefined ? {} : { writableTargets }) }),
      });
      return { ...importer, notice: im, revocation: { state: r.kind, ...r.revocation } };
    } catch (e) {
      const response = e instanceof HttpException ? e.getResponse() : null;
      // The body's `code` is the catalogue's dashed spelling (EYE-TEN-001: the principal holds no binding for the importing domain; EYE-AUT-001: the policy denies it there).
      const code = response !== null && typeof response === 'object' ? String((response as Row)['code'] ?? '').replace(/-/g, '_') : '';
      const reason = code === 'EYE_TEN_001' || code === 'EYE_AUT_001'
        ? 'the acting principal holds no authority in the importing domain; its steward completes the revocation by the route'
        : String((e as { message?: unknown })?.message ?? e).slice(0, 300);
      return { ...importer, notice: im, revocation: { state: 'pending', reason } };
    }
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

  /**
   * B12 (0072 §1; D4): the cold-tier manager's POLICY, declared by a domain admin as the domain's next version — a daily byte budget
   * (null: unbounded), the opens per schedule evaluation (1–200), the attempts before escalation (1–10), the age at which an action
   * paused for retry is escalated, the window a restored manifest stays hot before the archive schedule takes it back. A field not
   * named takes the default (null / 200 / 3 / "7 days" / "30 days"); the port validates the same bounds and records the row as returned.
   */
  @Post('/tier/declare')
  async declareTierPolicy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const bad = (message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, message), 422); };
    const budget = p['budgetBytesPerDay'] === undefined || p['budgetBytesPerDay'] === null ? null : Number(p['budgetBytesPerDay']);
    if (budget !== null && (!Number.isInteger(budget) || budget < 1)) bad('budgetBytesPerDay is a whole number of bytes (1 or more), or null for an unbounded budget');
    const integer = (key: string, fallback: number, min: number, max: number): number => {
      const v = p[key] === undefined ? fallback : Number(p[key]);
      if (!Number.isInteger(v) || v < min || v > max) bad(`${key} is an integer from ${min} to ${max}`);
      return v;
    };
    const interval = (key: string, fallback: string): string => {
      const v = p[key] === undefined ? fallback : String(p[key]);
      if (!INTERVAL.test(v)) bad(`${key} is an interval such as "${fallback}"`);
      return v;
    };
    const maxOpensPerEvaluation = integer('maxOpensPerEvaluation', 200, 1, 200); const maxAttempts = integer('maxAttempts', 3, 1, 10);
    const escalateAfter = interval('escalateAfter', '7 days'); const restoreHotFor = interval('restoreHotFor', '30 days');
    const policyId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.tier.declare', 'RTP', policyId), RetentionCapability.write,
      async (cap) => ({ result: await cap.declareTierPolicy({ policyId, tenantId, domainId, budgetBytesPerDay: budget, maxOpensPerEvaluation, maxAttempts, escalateAfter, restoreHotFor, actor: principal.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'RTP', targetId: policyId, targetVersion: null, outboxEvent: null }));
    return { policy: out.result, receipt: receipt(out) };
  }

  /** B12 (0072 §1; D4 "observable state"): the cold tier's state — the port's (the policy in force, the tiers, the moves, the budget, the actions by state, the schedules) with the vault's inventory of both blob roots; an audited read. */
  @Post('/tier/state')
  async tierState(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RTP', null), RetentionCapability.read, async (cap) => this.retention.tierState(cap, { tenantId, domainId }));
    return { state: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── B13 (0073): the schedule's retirement; the export's signing, destinations and delivery ─────────────────────────

  /**
   * B13 (0073 §1; D1): a schedule RETIRED by its own governed act, with a reason — state active → retired once; the row, its last
   * evaluation, the actions it opened and their events stay untouched (a retired schedule opens nothing); the event schedule.retired on the
   * schedule ledger. The port refuses a second retirement and an unknown schedule.
   */
  @Post('/schedules/:scheduleId/retire')
  async retireSchedule(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('scheduleId') scheduleId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = String(body.payload?.reason ?? '').trim();
    if (reason.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reason is at least 8 characters'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.schedule.retire', 'RTS', scheduleId), RetentionCapability.write,
      async (cap) => ({ result: await cap.retireSchedule({ scheduleId, tenantId, domainId, reason, actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RTS', targetId: scheduleId, targetVersion: null, outboxEvent: null }));
    return { schedule: out.result, receipt: receipt(out) };
  }

  /**
   * B13 (0073 §2; D3, C1): the tenant's export SIGNING KEY declared from a credential REFERENCE — the deployment variable
   * EYE_EXPORT_SIGNING_KEY_<NAME>, whose value (the base64 PKCS8 DER of an Ed25519 private key) the server resolves here to derive the
   * PUBLIC key it records, and never logs, records or returns. An unbound reference, or a value that is not an Ed25519 private key, is
   * refused before any write. The purpose (demonstration | production) is declared and shown wherever the signature is shown. The key is
   * the TENANT's, declared under the route's domain (the port asserts the domain; the row is the tenant's): the route's policy object is
   * the kind alone — a key id is not a uuid — and the audit target is the key id.
   */
  @Post('/signing-keys/declare')
  async declareSigningKey(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { credentialRef?: string; purpose?: string } }) {
    const { envelope, principal } = ctx(req);
    const bad = (message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, message), 422); };
    const credentialRef = String(body.payload?.credentialRef ?? '');
    const purpose = String(body.payload?.purpose ?? '');
    if (!SIGNING_KEY_REF.test(credentialRef)) bad('credentialRef is the deployment variable EYE_EXPORT_SIGNING_KEY_<NAME> (A–Z, 0–9 and _, 1 to 64 characters after the prefix)');
    if (!(SIGNING_KEY_PURPOSES as readonly string[]).includes(purpose)) bad(`purpose is one of ${SIGNING_KEY_PURPOSES.join(', ')}`);
    const derived = this.retention.deriveSigningKey(credentialRef);
    if (!derived.ok) {
      bad(derived.reason === 'unbound' ? `export signing key rejected: the deployment binds no export signing key under ${credentialRef}`
        : derived.reason === 'not_ed25519' ? `export signing key rejected: the value bound under ${credentialRef} is not an Ed25519 private key`
        : `export signing key rejected: the value bound under ${credentialRef} is not the base64 of a PKCS8 DER private key`);
    }
    const key = derived as Extract<typeof derived, { ok: true }>;
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.signing_key.declare', 'RSK', null), RetentionCapability.write,
      async (cap) => ({ result: this.retention.signingKeyAnswer(await cap.declareExportSigningKey({ keyId: key.keyId, tenantId, domainId, algorithm: SIGNING_ALGORITHM, publicKeyPem: key.publicKeyPem, credentialRef, purpose, actor: principal.principalId, correlationId: envelope.correlation_id })),
                        targetType: 'RSK', targetId: key.keyId, targetVersion: null, outboxEvent: null }));
    return { key: out.result, receipt: receipt(out) };
  }

  /** B13 (0073 §2): the key retired with a reason; the row kept — a package it signed still verifies against the recorded public key, and the read route says the key is retired. */
  @Post('/signing-keys/:keyId/retire')
  async retireSigningKey(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('keyId') keyId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = String(body.payload?.reason ?? '').trim();
    if (reason.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reason is at least 8 characters'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.signing_key.retire', 'RSK', null), RetentionCapability.write,
      async (cap) => ({ result: this.retention.signingKeyAnswer(await cap.retireExportSigningKey({ keyId, tenantId, domainId, reason, actor: principal.principalId, correlationId: envelope.correlation_id })), targetType: 'RSK', targetId: keyId, targetVersion: null, outboxEvent: null }));
    return { key: out.result, receipt: receipt(out) };
  }

  /** B13 (C19): the tenant's keys — the reference's NAME and its readiness (bound | blocked-credential, from the store now), the state, which is active; never a value. */
  @Post('/signing-keys/list')
  async listSigningKeys(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RSK', null), RetentionCapability.read, async (cap) => this.retention.signingKeys(cap, tenantId));
    return { keys: out.result, receipt: receipt(out) };
  }

  /**
   * B13 (0073 §3; D5, C13): a DESTINATION declared — a TRANSFER STATION (the disconnected path: an absolute directory that exists, realpath'd,
   * outside every vault root — neither a root, nor inside one, nor containing one; no credential) or an HTTPS endpoint (the production kind:
   * an https:// URL without userinfo; an optional credential REFERENCE EYE_DST_<NAME> whose value the delivery carries as a bearer and never
   * records) — with the recipient (the exchange identity: who receives) and the purpose. The port validates the same shapes and the key's
   * uniqueness among the domain's active destinations.
   */
  @Post('/destinations/declare')
  async declareDestination(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const bad = (message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, message), 422); };
    const destinationKey = String(p['destinationKey'] ?? '');
    if (!DESTINATION_KEY.test(destinationKey)) bad('destinationKey is 2 to 64 characters of a–z, 0–9 and -, starting with a letter or a digit');
    const kind = String(p['kind'] ?? '');
    if (!(DESTINATION_KINDS as readonly string[]).includes(kind)) bad(`kind is one of ${DESTINATION_KINDS.join(', ')}`);
    let endpoint = String(p['endpoint'] ?? '').trim();
    const credentialRef = p['credentialRef'] === undefined || p['credentialRef'] === null || p['credentialRef'] === '' ? null : String(p['credentialRef']);
    let trustAnchorPem = p['trustAnchorPem'] === undefined || p['trustAnchorPem'] === null || String(p['trustAnchorPem']).trim() === '' ? null : String(p['trustAnchorPem']);
    const recipient = String(p['recipient'] ?? '').trim(); const purpose = String(p['purpose'] ?? '').trim();
    if (recipient.length < 1 || recipient.length > 200) bad('recipient names who receives (1 to 200 characters)');
    if (purpose.length < 1 || purpose.length > 500) bad('purpose says what the destination receives the export for (1 to 500 characters)');
    if (kind === 'https') {
      let u: URL | null = null;
      try { u = new URL(endpoint); } catch { u = null; }
      if (u === null || u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.hostname === '') bad('an https destination\'s endpoint is an https:// URL without userinfo');
      if (credentialRef !== null && !DESTINATION_CREDENTIAL_REF.test(credentialRef)) bad('credentialRef is the deployment variable EYE_DST_<NAME> (A–Z, 0–9 and _, 1 to 64 characters after the prefix)');
      // B14 (D2): the trust anchor — one or more PEM certificates node parses; stored normalised; shown by fingerprint.
      if (trustAnchorPem !== null) {
        const anchor = this.retention.checkTrustAnchor(trustAnchorPem);
        if (!anchor.ok) bad(anchor.message);
        else trustAnchorPem = anchor.pem;
      }
    } else {
      if (credentialRef !== null) bad('a transfer station names no credential reference (a credential is the https kind\'s)');
      if (trustAnchorPem !== null) bad('a transfer station names no trust anchor (an anchor is the https kind\'s)');
      const check = await this.retention.checkTransferStation(endpoint);
      if (!check.ok) bad(check.message);
      // Stored as declared (normalised), not as its realpath: the endpoint is realpath'd again before every write and every read (C13).
      endpoint = resolvePath(endpoint);
    }
    const destinationId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.destination.declare', 'RDS', destinationId), RetentionCapability.write,
      async (cap) => ({ result: this.retention.destinationAnswer(await cap.declareExportDestination({ destinationId, tenantId, domainId, destinationKey, kind, endpoint, credentialRef, recipient, purpose, trustAnchorPem, actor: principal.principalId, correlationId: envelope.correlation_id })),
                        targetType: 'RDS', targetId: destinationId, targetVersion: null, outboxEvent: null }));
    return { destination: out.result, receipt: receipt(out) };
  }

  /** B13 (0073 §3): the destination retired with a reason; its deliveries stay recorded; a delivery to it is refused by the port. */
  @Post('/destinations/:destinationId/retire')
  async retireDestination(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('destinationId') destinationId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = String(body.payload?.reason ?? '').trim();
    if (reason.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reason is at least 8 characters'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.destination.retire', 'RDS', destinationId), RetentionCapability.write,
      async (cap) => ({ result: this.retention.destinationAnswer(await cap.retireExportDestination({ destinationId, tenantId, domainId, reason, actor: principal.principalId, correlationId: envelope.correlation_id })), targetType: 'RDS', targetId: destinationId, targetVersion: null, outboxEvent: null }));
    return { destination: out.result, receipt: receipt(out) };
  }

  /** B13 (D5, C19): the domain's destinations, each with its readiness — active / retired; blocked-credential for an https destination whose reference is not bound here. */
  @Post('/destinations/list')
  async listDestinations(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RDS', null), RetentionCapability.read, async (cap) => this.retention.destinations(cap));
    return { destinations: out.result, receipt: receipt(out) };
  }

  /**
   * B13 (D7, C12): the DOWNLOAD — a governed, audited read of the package's archive: the package present (404), unrevoked and unexpired
   * (409), under the archive ceiling, the tar rebuilt from the files and its digest compared with the record before it is served (a
   * mismatch: 409, custody untouched); the event export.downloaded on the action, with the reader and the digest, is a WRITE — so the
   * download is one, the bytes returned in the same answer as base64 (the product's idiom for bytes over the governed pipeline).
   */
  @Post('/actions/:actionId/export/download')
  async downloadExport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.download', 'RTA', actionId), RetentionCapability.write,
      async (cap) => ({ result: await this.retention.downloadExport(cap, { tenantId, domainId }, actionId, { actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null }));
    const d = out.result;
    return { download: { filename: d.filename, contentType: 'application/x-tar', contentDisposition: 'attachment', byteLength: d.bytes.byteLength, archiveDigest: d.archiveDigest, packageDigest: d.packageDigest, manifestDigest: d.manifestDigest, signature: d.signature, expiresAt: d.expiresAt, base64: d.bytes.toString('base64') },
             receipt: receipt(out) };
  }

  /**
   * B15 (D2): THE STREAMED DOWNLOAD — the same governed, audited act as the JSON download (`retention.export.download`; export.downloaded
   * on the action), the archive verified by a disk pass BEFORE the write commits, then served RAW as `application/x-tar` with its length,
   * the digests and the signature in headers (`x-eye-archive-digest`, `x-eye-package-digest`, `x-eye-manifest-digest`,
   * `x-eye-signature-scheme`, `x-eye-key-id`, `x-eye-signature`, `x-eye-policy-decision-id`, `x-eye-audit-seq`) — for packages of any
   * size under the streamed ceiling (64 GiB): the customer's tool saves it to disk and verifies it offline. A source that changes under
   * the stream ends it with the socket destroyed (the client sees a truncated tar; the verifier fails it).
   */
  @Post('/actions/:actionId/export/stream')
  async streamExport(@Req() req: EyeRequest, @Res() res: Response, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string) {
    const { envelope, principal } = ctx(req);
    // A refusal before the first byte is answered as every route's is (the exception filters; nothing has been written to the answer yet).
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.download', 'RTA', actionId), RetentionCapability.write,
      async (cap) => ({ result: await this.retention.downloadExportStream(cap, { tenantId, domainId }, actionId, { actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RTA', targetId: actionId, targetVersion: null, outboxEvent: null }));
    const d = out.result;
    const sig = d.signature;
    const headers: Record<string, string> = {
      'content-type': 'application/x-tar', 'content-length': String(d.size), 'content-disposition': `attachment; filename="${d.filename}"`,
      'x-eye-archive-digest': d.archiveDigest, 'x-eye-package-digest': d.packageDigest, 'x-eye-manifest-digest': d.manifestDigest,
      'x-eye-signature-scheme': String(sig['scheme'] ?? ''), 'x-eye-policy-decision-id': out.policyDecisionId, 'x-eye-audit-seq': String(out.auditSeq),
      ...(typeof sig['key_id'] === 'string' ? { 'x-eye-key-id': String(sig['key_id']) } : {}), ...(typeof sig['signature'] === 'string' ? { 'x-eye-signature': String(sig['signature']) } : {}),
      ...(d.expiresAt === null ? {} : { 'x-eye-expires-at': d.expiresAt }),
    };
    res.writeHead(200, headers);
    const built = await d.open();
    built.stream.on('error', () => res.destroy());
    built.stream.pipe(res);
    await new Promise<void>((resolve) => { res.on('finish', () => resolve()); res.on('close', () => resolve()); });
    // The digest the stream produced is compared with the record once more: a source that changed under the stream is not an archive the record vouches for.
    try { if ((await built.digest()) !== d.archiveDigest) res.destroy(); } catch { res.destroy(); }
  }

  /**
   * B13 (D6, C6): the DELIVERY — a governed, human-gated act on a VERIFIED, unrevoked, unexpired package to a declared destination, named by
   * its key. ONE write: the port's gates (begin_export_delivery — under the action's lock, the attempt numbered), the archive rebuilt and
   * verified, the executor INSIDE the transaction (the station's files, or the https egress), the outcome recorded whatever it is — a
   * FAILED delivery is a recorded fact, not a rolled-back one. When the transaction does not commit — the handler refused after the station
   * write, or the commit itself failed after the handler returned — the station paths THIS attempt created are removed by name (never a
   * pre-existing identical package.tar/package.sig). An https delivery that left the process before a commit that then failed is a network
   * side effect the ledger did not record: visible by the next attempt's number and by a receipt naming a delivery id the ledger never
   * recorded (the honest residual, as B11's archive publish).
   */
  @Post('/actions/:actionId/export/deliver')
  async deliverExport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string, @Body() body: { payload?: { destinationKey?: string } }) {
    const { envelope, principal } = ctx(req);
    const destinationKey = String(body.payload?.destinationKey ?? '');
    if (!DESTINATION_KEY.test(destinationKey)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'destinationKey names a declared destination of this domain (2 to 64 characters of a–z, 0–9 and -)'), 422);
    const created: string[] = [];
    let out: Awaited<ReturnType<PipelineService['write']>> & { result: Awaited<ReturnType<RetentionService['deliverExport']>> };
    try {
      out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.deliver', 'RTA', actionId), RetentionCapability.write,
        async (cap) => {
          const destination = await this.retention.destinationByKey(cap, destinationKey);
          if (destination === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `retention delivery rejected: no such destination ${destinationKey} in this domain`), 404);
          const result = await this.retention.deliverExport(cap, { tenantId, domainId }, actionId, String(destination['destination_id']), { actor: principal.principalId, correlationId: envelope.correlation_id }, created);
          return { result, targetType: 'RDL', targetId: String(result['delivery_id']), targetVersion: null, outboxEvent: null };
        });
    } catch (e) {
      if (created.length > 0) await this.retention.removeCreatedStationFiles(created).catch(() => undefined);
      throw e;
    }
    return { delivery: out.result, receipt: receipt(out) };
  }

  /** B13 (D6): the deliveries of an action, each with its destination, oldest first — CMP-102's "Content and Export Delivery Receipt" in the page's voice. */
  @Post('/actions/:actionId/export/deliveries/list')
  async listDeliveries(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RTA', actionId), RetentionCapability.read, async (cap) => this.retention.deliveries(cap, actionId));
    return { deliveries: out.result, receipt: receipt(out) };
  }

  /**
   * B13 (D6, C7): the COLLECT act — the transfer station's receipt.json read from the delivery's directory (the endpoint re-checked, the
   * file bounded, a JSON object naming its delivery_id) and presented to the acknowledgement port: acknowledged when it names both digests
   * and verified: true, mismatched when it names other digests or verified: false (the exchange denied, the evidence kept); no receipt
   * yet, a receipt naming another delivery, a row not in state delivered — a conflict.
   */
  @Post('/actions/:actionId/export/deliveries/:deliveryId/collect-receipt')
  async collectReceipt(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string, @Param('deliveryId') deliveryId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.acknowledge', 'RDL', deliveryId), RetentionCapability.write,
      async (cap) => ({ result: await this.retention.collectReceipt(cap, { tenantId, domainId }, actionId, deliveryId, { actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RDL', targetId: deliveryId, targetVersion: null, outboxEvent: null }));
    return { delivery: out.result, receipt: receipt(out) };
  }

  /** B13 (D6): the ACKNOWLEDGE act — the recipient's receipt presented out of band (an https destination that answered without verifying; a station's receipt carried by hand): a JSON object under the receipt ceiling, to the same port. */
  @Post('/actions/:actionId/export/deliveries/:deliveryId/acknowledge')
  async acknowledgeDelivery(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string, @Param('deliveryId') deliveryId: string, @Body() body: { payload?: { receipt?: unknown } }) {
    const { envelope, principal } = ctx(req);
    const r = body.payload?.receipt;
    if (r === null || r === undefined || typeof r !== 'object' || Array.isArray(r)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'receipt is the recipient\'s receipt, a JSON object'), 422);
    if (Buffer.byteLength(JSON.stringify(r), 'utf8') > RECEIPT_MAX_BYTES) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `receipt is at most ${RECEIPT_MAX_BYTES} bytes`), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.acknowledge', 'RDL', deliveryId), RetentionCapability.write,
      async (cap) => ({ result: await this.retention.acknowledgeDelivery(cap, { tenantId, domainId }, actionId, deliveryId, r as Row, { actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RDL', targetId: deliveryId, targetVersion: null, outboxEvent: null }));
    return { delivery: out.result, receipt: receipt(out) };
  }

  /**
   * B14 (0074 §3; D3): a FURTHER revocation notice to one destination that received the package (the revoke act sent the first; this act
   * is the retry of a failed one, or a second attempt after a mismatched answer) — human-gated; the package must be revoked, the
   * destination one that received it (a retired destination is still notified — it holds the package). The station path this attempt
   * created is removed when the commit fails after it; the product's copies at the station were removed by the revoke act.
   *
   * B17 (0077 §6; D6, D7; C15): the IMPORTER form — `{ importer: { domainId, importId } }` names an admitted import of this package in a
   * domain of the tenant: a further importer notice recorded on the origin's ledger (signed; the port refuses an import that holds no
   * admitted copy), then the revocation executed in that domain after the commit exactly as the revoke act does it, answered under
   * `importer` (its `revocation.state`: revoked | held | retried | pending). An import held by another domain than the one named is
   * refused inside the write (409), so nothing is recorded under a wrong name.
   */
  @Post('/actions/:actionId/export/revocation-notices')
  async notifyRevocation(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string, @Body() body: { payload?: { destinationKey?: string; importer?: { domainId?: string; importId?: string } | null } }) {
    const { envelope, principal } = ctx(req);
    const importerArg = body.payload?.importer;
    if (importerArg !== undefined && importerArg !== null) {
      if (typeof importerArg !== 'object' || Array.isArray(importerArg)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'importer names an admitted import of this package by its domainId and importId'), 422);
      const importingDomainId = String(importerArg.domainId ?? '').toLowerCase(); const importId = String(importerArg.importId ?? '').toLowerCase();
      if (!UUID.test(importingDomainId) || !UUID.test(importId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'importer names an admitted import of this package in a domain of this tenant by its domainId and importId'), 422);
      const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.notify', 'RTA', actionId), RetentionCapability.write,
        async (cap) => {
          const result = await this.retention.notifyImporter(cap, { tenantId, domainId }, actionId, importId, { actor: principal.principalId, correlationId: envelope.correlation_id });
          const held = String(((result['importer'] ?? {}) as Row)['domain_id'] ?? '');
          if (held !== importingDomainId) throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `retention notice rejected: import ${importId} is held by domain ${held}, not ${importingDomainId}`), 409);
          return { result, targetType: 'RXN', targetId: String(result['notice_id']), targetVersion: null, outboxEvent: null };
        });
      const importer = await this.executeImporterRevocation(envelope, principal, out.result);
      return { notice: out.result, importer, receipt: receipt(out) };
    }
    const destinationKey = String(body.payload?.destinationKey ?? '');
    if (!DESTINATION_KEY.test(destinationKey)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'destinationKey names a declared destination of this domain (2 to 64 characters of a–z, 0–9 and -), or importer names an admitted import of this package ({ domainId, importId })'), 422);
    const created: string[] = [];
    let out: Awaited<ReturnType<PipelineService['write']>> & { result: Row };
    try {
      out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.notify', 'RTA', actionId), RetentionCapability.write,
        async (cap) => {
          const destination = await this.retention.destinationByKey(cap, destinationKey);
          if (destination === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `retention notice rejected: no such destination ${destinationKey} in this domain`), 404);
          const result = await this.retention.notifyRevocation(cap, { tenantId, domainId }, actionId, String(destination['destination_id']), { actor: principal.principalId, correlationId: envelope.correlation_id }, created);
          return { result, targetType: 'RXN', targetId: String(result['notice_id']), targetVersion: null, outboxEvent: null };
        });
    } catch (e) {
      if (created.length > 0) await this.retention.removeCreatedStationFiles(created).catch(() => undefined);
      throw e;
    }
    return { notice: out.result, receipt: receipt(out) };
  }

  /** B14 (D3): the revocation notices of an action, each with its destination, oldest first. */
  @Post('/actions/:actionId/export/revocation-notices/list')
  async listRevocationNotices(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RTA', actionId), RetentionCapability.read, async (cap) => this.retention.revocationNotices(cap, actionId));
    return { notices: out.result, receipt: receipt(out) };
  }

  /** B14 (D3): the COLLECT act of a notice — the transfer station's revocation-receipt.json read from the action's directory (bounded, a JSON object naming its notice_id) and presented to the acknowledgement port. */
  @Post('/actions/:actionId/export/revocation-notices/:noticeId/collect-receipt')
  async collectRevocationReceipt(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string, @Param('noticeId') noticeId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.acknowledge', 'RXN', noticeId), RetentionCapability.write,
      async (cap) => ({ result: await this.retention.collectRevocationReceipt(cap, { tenantId, domainId }, actionId, noticeId, { actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RXN', targetId: noticeId, targetVersion: null, outboxEvent: null }));
    return { notice: out.result, receipt: receipt(out) };
  }

  /** B14 (D3): the ACKNOWLEDGE act of a notice — the recipient's receipt presented out of band (a JSON object under the receipt ceiling) to the same port. */
  @Post('/actions/:actionId/export/revocation-notices/:noticeId/acknowledge')
  async acknowledgeRevocationNotice(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('actionId') actionId: string, @Param('noticeId') noticeId: string, @Body() body: { payload?: { receipt?: unknown } }) {
    const { envelope, principal } = ctx(req);
    const r = body.payload?.receipt;
    if (r === null || r === undefined || typeof r !== 'object' || Array.isArray(r)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'receipt is the recipient\'s receipt, a JSON object'), 422);
    if (Buffer.byteLength(JSON.stringify(r), 'utf8') > RECEIPT_MAX_BYTES) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `receipt is at most ${RECEIPT_MAX_BYTES} bytes`), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.export.acknowledge', 'RXN', noticeId), RetentionCapability.write,
      async (cap) => ({ result: await this.retention.acknowledgeRevocationNotice(cap, { tenantId, domainId }, actionId, noticeId, r as Row, { actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RXN', targetId: noticeId, targetVersion: null, outboxEvent: null }));
    return { notice: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── B16 (0076): the exchange partner; the governed import ─────────────────────────

  /**
   * B16 (0076 §3; D6, D7): an EXCHANGE PARTNER declared — the party whose key-signed packages (`eye-customer-export/2`) this domain
   * admits: its Ed25519 PUBLIC key (a SubjectPublicKeyInfo PEM, parsed and normalised here; the key id `ed25519:<first 16 hex of
   * sha256(SPKI DER)>` computed here and re-derived by the port), the party and the purpose, and the INTAKE SOURCE CONTRACT of this
   * domain the imported records are held under — an active upload contract with confirmed rights, whose ceiling is the import's policy
   * gate. The port validates the same shapes and the key's and the partner key's uniqueness among the domain's active partners.
   */
  @Post('/partners/declare')
  async declarePartner(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const bad = (message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, message), 422); };
    const partnerKey = String(p['partnerKey'] ?? '');
    if (!DESTINATION_KEY.test(partnerKey)) bad('partnerKey is 2 to 64 characters of a–z, 0–9 and -, starting with a letter or a digit');
    const party = String(p['party'] ?? '').trim(); const purpose = String(p['purpose'] ?? '').trim();
    if (party.length < 1 || party.length > 200) bad('party names who signs the packages this domain admits (1 to 200 characters)');
    if (purpose.length < 1 || purpose.length > 500) bad('purpose says why this domain accepts the party\'s packages (1 to 500 characters)');
    const pem = String(p['publicKeyPem'] ?? '');
    if (!pem.includes('-----BEGIN PUBLIC KEY-----')) bad('publicKeyPem is the partner\'s Ed25519 public key as a SubjectPublicKeyInfo PEM (-----BEGIN PUBLIC KEY-----)');
    const key = partnerKeyOf(pem);
    if (key === null) bad('publicKeyPem is an Ed25519 public key node parses (a SubjectPublicKeyInfo PEM; the 44-byte SPKI whose algorithm is Ed25519)');
    const intakeSourceId = String(p['intakeSourceId'] ?? '');
    if (!UUID.test(intakeSourceId)) bad('intakeSourceId is the id of an active upload source contract of this domain with confirmed rights');
    const intakeContractVersion = Number(p['intakeContractVersion']);
    if (!Number.isInteger(intakeContractVersion) || intakeContractVersion < 1) bad('intakeContractVersion is a whole number, 1 or more');
    const partnerId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.partner.declare', 'RXP', partnerId), RetentionCapability.write,
      async (cap) => ({ result: partnerAnswer(await cap.declareExchangePartner({ partnerId, tenantId, domainId, partnerKey, party, purpose, keyId: (key as PartnerKey).keyId, algorithm: SIGNING_ALGORITHM, publicKeyPem: (key as PartnerKey).publicKeyPem, intakeSourceId, intakeContractVersion, actor: principal.principalId, correlationId: envelope.correlation_id })),
                        targetType: 'RXP', targetId: partnerId, targetVersion: null, outboxEvent: null }));
    return { partner: out.result, receipt: receipt(out) };
  }

  /** B16 (0076 §3): the partner retired with a reason; the row kept — its imports stay recorded, its key no longer resolves a package (a package it signed is quarantined until a partner holds the key again). */
  @Post('/partners/:partnerId/retire')
  async retirePartner(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('partnerId') partnerId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = String(body.payload?.reason ?? '').trim();
    if (reason.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reason is at least 8 characters'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.partner.retire', 'RXP', partnerId), RetentionCapability.write,
      async (cap) => ({ result: partnerAnswer(await cap.retireExchangePartner({ partnerId, tenantId, domainId, reason, actor: principal.principalId, correlationId: envelope.correlation_id })), targetType: 'RXP', targetId: partnerId, targetVersion: null, outboxEvent: null }));
    return { partner: out.result, receipt: receipt(out) };
  }

  /** B16: the domain's exchange partners, oldest first, each with its state (active / retired) and its intake contract as it stands now — the source key, the lifecycle, the rights, the ceiling (a contract no longer active with confirmed rights is what the admission refuses as contract_changed). */
  @Post('/partners/list')
  async listPartners(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RXP', null), RetentionCapability.read, async (cap) => this.partners(cap));
    return { partners: out.result, receipt: receipt(out) };
  }
  private async partners(cap: RetentionReads): Promise<Row[]> {
    const rows = (await cap.readExchangePartners().selectAll().orderBy('declared_at' as never).execute()) as Row[];
    if (rows.length === 0) return [];
    const sourceIds = Array.from(new Set(rows.map((r) => String(r['intake_source_id']))));
    const contracts = (await cap.readSourceContracts().select(['source_id' as never, 'contract_version' as never, 'source_key' as never, 'connector_kind' as never, 'lifecycle_state' as never, 'rights_state' as never, 'classification_ceiling' as never, 'residency' as never]).where('source_id' as never, 'in', sourceIds as never).execute()) as Row[];
    const byRef = new Map(contracts.map((c) => [`${String(c['source_id'])}@${Number(c['contract_version'])}`, c]));
    return rows.map((r) => {
      const c = byRef.get(`${String(r['intake_source_id'])}@${Number(r['intake_contract_version'])}`) ?? null;
      return { ...partnerAnswer(r), intake: c === null ? null : { source_id: c['source_id'], contract_version: c['contract_version'], source_key: c['source_key'], connector_kind: c['connector_kind'], lifecycle_state: c['lifecycle_state'], rights_state: c['rights_state'], classification_ceiling: c['classification_ceiling'], residency: c['residency'] } };
    });
  }

  /**
   * B16 (0076 §4; D1, D4, D5): the OPEN act — one governed write in which the package is QUARANTINED as vault blobs (every tar entry
   * stored under the quarantine root: manifest.json and links.json too; an entry above the vault's ceiling drained and named), the
   * checks run on what was stored (the archive, the manifest, the integrity of every file, the re-import compatibility of every object,
   * the chain, the key-based signature against a declared partner's key, the closure by pair, the intake contract's policy, a live
   * duplicate, the origin's revocation and expiry as far as they are provable here) and the row recorded VERIFIED — with its plan of
   * ids this installation mints (D3: never the origin's) — or QUARANTINED with the failed checks named; a quarantined import keeps
   * every blob (DP-47-005: the request and the evidence preserved). Two intakes: `inline` (the tar as base64 in the payload, at most
   * 64 MiB decoded — the JSON body limit of the listener bounds it first) and `station` (the package read entry by entry from a
   * transfer station declared in this domain, at the origin's `<tenant>/<domain>/<action>` — with delivery.json and package.sig as the
   * exchange). A throw after blobs were stored — the port's refusal, the commit itself — removes the blobs THIS call stored (never a
   * pre-existing locator): nothing is left on disk that no row inventories.
   */
  @Post('/imports/open')
  async openImport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const bad = (message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, message), 422); };
    const source = (p['source'] !== null && typeof p['source'] === 'object' && !Array.isArray(p['source']) ? p['source'] : {}) as Row;
    const kind = String(source['kind'] ?? '');
    let intake: ImportIntake;
    if (kind === 'inline') {
      const raw = source['base64'];
      if (typeof raw !== 'string' || raw.trim() === '') bad('an inline source carries the package tar as base64 (source.base64)');
      const base64 = String(raw).replace(/\s+/g, '');
      const decoded = base64DecodedLength(base64);
      if (decoded === null) bad('source.base64 is standard base64 (A–Z, a–z, 0–9, + and /, with = padding)');
      if ((decoded as number) > IMPORT_INLINE_MAX_BYTES) bad(`an inline package is at most ${IMPORT_INLINE_MAX_BYTES} bytes decoded (this one is ${decoded}); deliver a larger package to a transfer station declared in this domain and open the import from it (source.kind station)`);
      const x = source['exchange'];
      let exchange: Row | null = null;
      if (x !== undefined && x !== null) {
        if (typeof x !== 'object' || Array.isArray(x)) bad('source.exchange is the sender\'s exchange statement (delivery.json, or the stream\'s headers), a JSON object');
        if (Buffer.byteLength(JSON.stringify(x), 'utf8') > RECEIPT_MAX_BYTES) bad(`source.exchange is at most ${RECEIPT_MAX_BYTES} bytes`);
        exchange = x as Row;
      }
      intake = { kind: 'inline', base64, exchange };
    } else if (kind === 'station') {
      const destinationKey = String(source['destinationKey'] ?? '');
      if (!DESTINATION_KEY.test(destinationKey)) bad('source.destinationKey names a transfer station declared in this domain (2 to 64 characters of a–z, 0–9 and -)');
      const origin = (source['origin'] !== null && typeof source['origin'] === 'object' && !Array.isArray(source['origin']) ? source['origin'] : {}) as Row;
      const originTenantId = String(origin['tenantId'] ?? ''); const originDomainId = String(origin['domainId'] ?? ''); const originActionId = String(origin['actionId'] ?? '');
      if (!UUID.test(originTenantId) || !UUID.test(originDomainId) || !UUID.test(originActionId)) bad('source.origin names the package at the station by the origin\'s tenantId, domainId and actionId (the station path <endpoint>/<tenant>/<domain>/<action>/package.tar)');
      intake = { kind: 'station', destinationKey, origin: { tenantId: originTenantId.toLowerCase(), domainId: originDomainId.toLowerCase(), actionId: originActionId.toLowerCase() } };
    } else {
      return bad('source.kind is inline (the package tar as base64) or station (a transfer station declared in this domain and the origin\'s tenantId, domainId and actionId)');
    }
    const importId = newId();
    const scope = { tenantId, domainId };
    // The quarantine locators this call stores (the service pushes each as it is written): removed when the write does not commit.
    const created: string[] = [];
    let out: Awaited<ReturnType<PipelineService['write']>> & { result: Awaited<ReturnType<ImportService['openImport']>> };
    try {
      out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.import.open', 'RIM', importId), RetentionCapability.write,
        async (cap) => ({ result: await this.imports.openImport(cap, scope, importId, intake, { actor: principal.principalId, correlationId: envelope.correlation_id }, created), targetType: 'RIM', targetId: importId, targetVersion: null, outboxEvent: null }));
    } catch (e) {
      if (created.length > 0) await this.retention.removeBytes(scope, created.map((locator) => ({ locator, vault: 'quarantine' as const }))).catch(() => undefined);
      throw e;
    }
    const r = out.result;
    return { import: r.import, checks: r.checks, items: r.items, verified: r.verified, importReceipt: r.receipt, receipt: receipt(out) };
  }

  /** B16 (D1): the APPROVAL — the retention authority, on the PACKAGE DIGEST it read (never the opener; the port refuses), with a rationale; a verified import only. */
  @Post('/imports/:importId/approve')
  async approveImport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('importId') importId: string, @Body() body: { payload?: { packageDigest?: string; rationale?: string } }) {
    const { envelope, principal } = ctx(req);
    const packageDigest = String(body.payload?.packageDigest ?? '').toLowerCase(); const rationale = String(body.payload?.rationale ?? '').trim();
    if (!/^[0-9a-f]{64}$/.test(packageDigest)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'packageDigest is the package digest the approver read on the verified import'), 422);
    if (rationale.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'rationale is at least 8 characters'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.import.approve', 'RIM', importId), RetentionCapability.write,
      async (cap) => ({ result: await this.imports.approveImport(cap, { tenantId, domainId }, importId, packageDigest, rationale, { actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RIM', targetId: importId, targetVersion: null, outboxEvent: null }));
    return { import: out.result, receipt: receipt(out) };
  }

  /**
   * B16 (D2, D3; C3): the ADMISSION — the steward's human-gated act (never the approver; the port refuses). The service orchestrates its
   * own writes under retention.import.admit (the extraction's idiom): the admission begun under the import's lock (the partner and the
   * intake contract re-checked: contract_changed pauses nothing — it refuses), then the records in batches of at most 32 — each batch's
   * planned canonical ids its write's bound target set — then the claim versions, then one graph write (identifier systems, entities,
   * identifiers, edges — each under a savepoint, a port's refusal marking the item, never the batch), then the finish; after the commit
   * the quarantine copies of the ADMITTED records are tombstoned (manifest.json, links.json and the refused or excluded copies stay:
   * the evidence) and the finalisation recorded. A throw leaves the import ADMITTING with its staged items; the same act resumes it.
   */
  @Post('/imports/:importId/admit')
  async admitImport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('importId') importId: string) {
    const { envelope, principal } = ctx(req);
    const r = await this.imports.admitImport({
      envelope, principal, scope: { tenantId, domainId }, importId,
      route: (action: string, objectType: string, objectId: string, writableTargets?: string[]) => ({ ...this.route(tenantId, domainId, action, objectType, objectId), ...(writableTargets === undefined ? {} : { writableTargets }) }),
    });
    return { import: r.import, batches: r.batches, receipt: r.receipt };
  }

  /**
   * B16 (C5): the WITHDRAWAL — quarantined | verified | approved | admitting → withdrawn once, with a reason (already-admitted canonical
   * rows stand: append-only); after the commit the import's quarantine copies are tombstoned and the tombstoning recorded (the
   * service's step: the blobs are inventoried by the import ledger, not by the manifests, so the sweeper's TTL pass is the only other
   * way they go). A removal that fails after the commit is answered as it is — the withdrawal stands; the sweeper retries by age.
   */
  @Post('/imports/:importId/withdraw')
  async withdrawImport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('importId') importId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = String(body.payload?.reason ?? '').trim();
    if (reason.length < 8) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reason is at least 8 characters'), 422);
    const scope = { tenantId, domainId };
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.import.withdraw', 'RIM', importId), RetentionCapability.write,
      async (cap) => ({ result: await this.imports.withdrawImport(cap, scope, importId, reason, { actor: principal.principalId, correlationId: envelope.correlation_id }), targetType: 'RIM', targetId: importId, targetVersion: null, outboxEvent: null }));
    // The bytes go after the record committed (the export revocation's discipline): the quarantine copies of the import's items and its manifest and links.
    let tombstoned: { locators: number; tombstoned: number; failed: string[] } | null = null; let error: string | null = null;
    try { tombstoned = await this.imports.tombstoneQuarantine(scope, importId); }
    catch (e) { error = String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 200); }
    // C5: the tombstoning RECORDED — import.evidence_tombstoned {locators, tombstoned, failed} — a write after the withdrawal's own, under the
    // same authority (the port admits the event on a withdrawn import). A tombstoning that threw is not recorded: the sweeper's TTL pass retries.
    if (tombstoned !== null) {
      const outcome = tombstoned;
      try {
        await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'retention.import.withdraw', 'RIM', importId), RetentionCapability.write,
          async (cap) => { await this.imports.recordEvidenceTombstoned(cap, scope, importId, outcome, { actor: principal.principalId, correlationId: envelope.correlation_id }); return { result: { ok: true }, targetType: 'RIM', targetId: importId, targetVersion: null, outboxEvent: null }; });
      } catch (e) { error = `evidence tombstoned but not recorded: ${String((e as { message?: unknown })?.message ?? 'unknown')}`.slice(0, 200); }
    }
    return { import: out.result, quarantine: { tombstoned, error }, receipt: receipt(out) };
  }

  /**
   * B17 (0077 §7; D4, D7, D8, D12, D13, D19): the REVOCATION of an admitted import — the origin's revocation executed where the copies
   * are, by this domain's steward or administrators (the tenant's authority reaches it through the origin's revoke act). The SOURCE:
   * `origin` — the origin package's own record on this installation, revoked (the port reads it across the tenant's domains under the
   * import's digest; no signature needed; another tenant's origin is refused: present its notice from a station) — or `station` — the
   * origin's SIGNED revocation.json at a transfer station declared here, at the import's origin path, verified against the import's
   * partner key (a retired partner's key still verifies a notice dated before its retirement; a rotated key of the same party too). The
   * service orchestrates its own writes under retention.import.revoke (the admission's idiom): begun under the import's lock (state
   * revoking, the attempt counted; a revoked import answers `retried` — the bytes retried, nothing else), ONE graph write (the created
   * edges retracted, the created entities retired, reused rows and identifiers left), the claim versions withdrawn in batches of at most
   * 32 with their lineage carried, the records withdrawn, tombstoned and their custody recorded in batches (a LEGAL HOLD refuses the whole
   * record step — the hold keeps the record whole — and is answered `refused` with the hold named), then the finish: `revoked` when every
   * copy is destroyed or accounted for, `held` (state revoking, import.revocation_held) when a hold refused one — the same route
   * retries when it is lifted — with the ONE GraphChanged/import.revoked from the finish write; after the commit the bytes go and, for a
   * station source, revocation-receipt.json is written beside the notice; the receipt recorded (import.copies_destroyed |
   * import.copies_refused) and the origin's notice answered when the origin is here. A notice that does NOT verify (unsigned, another
   * key, invalid, dated after the partner's retirement) is REFUSED with nothing destroyed: the refusal IS the record — the write that
   * recorded import.revocation_refused committed (its audit row a success of recording it) before this route answers 409.
   */
  @Post('/imports/:importId/revoke')
  async revokeImport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('importId') importId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const bad = (message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, message), 422); };
    const s = (p['source'] !== null && typeof p['source'] === 'object' && !Array.isArray(p['source']) ? p['source'] : {}) as Row;
    const kind = String(s['kind'] ?? '');
    let source: RevocationSource;
    if (kind === 'origin') {
      source = { kind: 'origin' };
    } else if (kind === 'station') {
      const destinationKey = String(s['destinationKey'] ?? '');
      if (!DESTINATION_KEY.test(destinationKey)) bad('source.destinationKey names a transfer station declared in this domain (2 to 64 characters of a–z, 0–9 and -)');
      source = { kind: 'station', destinationKey };
    } else {
      return bad('source.kind is origin (the origin package\'s record on this installation) or station (the origin\'s signed revocation notice at a transfer station declared in this domain: source.destinationKey)');
    }
    const r = await this.imports.revokeImport({
      envelope, principal, scope: { tenantId, domainId }, importId, source,
      route: (action: string, objectType: string, objectId: string, writableTargets?: string[]) => ({ ...this.route(tenantId, domainId, action, objectType, objectId), ...(writableTargets === undefined ? {} : { writableTargets }) }),
    });
    // The refusal of a notice that does not verify was RECORDED by a committed write (import.revocation_refused); the answer says so as a conflict of the record.
    if (r.kind === 'refused') throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, `retention import rejected (notice): ${String(r.revocation.reason ?? 'the notice is not verified against the import\'s partner')}`), 409);
    return { import: r.import, revocation: { state: r.kind, ...r.revocation }, batches: r.batches, receipt: r.receipt };
  }

  /**
   * B16: the import with its partner, its items (the map: origin ref → the id minted here, each with its disposition and gate), its
   * events, its ordered checks and the IMPORT RECEIPT (the importer's own record of the exchange, ES-08-004). The receipt answered
   * here IS the import's (`importReceipt` carries it again, as the open act answers it), with this read's own policy decision and
   * audit sequence beside its fields.
   */
  @Post('/imports/:importId/get')
  async getImport(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('importId') importId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RIM', importId), RetentionCapability.read, async (cap) => this.imports.importOf(cap, importId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized import matches'), 404);
    const r = out.result;
    return { import: r.import, partner: r.partner, items: r.items, events: r.events, checks: (r.import['checks'] as Row[] | undefined) ?? [], importReceipt: r.receipt, receipt: { ...r.receipt, ...receipt(out) } };
  }
  /** B16: the domain's imports, each with its state, its origin, its counts and its partner id. */
  @Post('/imports/list')
  async listImports(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'retention.read', 'RIM', null), RetentionCapability.read, async (cap) => this.imports.imports(cap));
    return { imports: out.result, receipt: receipt(out) };
  }
}
