/**
 * CP-6 B40 §IN (0123 §IN; F-P1-03) — THE INTAKE REVIEW QUEUE, THE CASE'S WHY, THE VERDICTS, THE UPLOAD APPROVAL: a further controller on the
 * observation base path (inside the existing api.observation unit — the B82 idiom), so ObservationController is untouched.
 *
 *   POST …/observation/intake/queue                     {state?, limit?}    the queue (observation.inspection.read — metadata only, D9): every
 *        case with its reason and review reason, the verdicts in brief, the duplicate state and quality ("not recorded before B40" for earlier
 *        cases), the manual-upload facts (`you_uploaded`), the held upload, the consumer notice, the expiry (`past_expiry`: D16)
 *   POST …/observation/intake/cases/:caseId/read         {}                 the case's WHY: the verdicts with their engine identity and findings
 *        (codes, offsets — never content), the assessment, the approval and its events, the case's events, the custody of its bytes
 *   POST …/observation/intake/cases/:caseId/excerpt      {offset, length?}  THE EXCERPT around a finding — a read of the quarantined bytes under
 *        the EXISTING `observation.evidence.retrieve` (D9: only a role that already reads evidence bytes; no widening): the manifest resolved,
 *        the digest re-verified on this read, `custody.retrieved` written, then at most 2 KiB leaves (the finding's span and 256 bytes either
 *        side) — an integrity failure answers 409 with nothing served
 *   POST …/observation/evidence/:evdId/inspection        {version?}         an evidence version's verdicts (the evidence page's list)
 *   POST …/observation/intake/uploads/:approvalId/decide {decision, reason}  a SECOND PERSON decides a held upload (observation.upload.approve,
 *        human-gated; the port refuses the uploader, an agent, a role not held); then the case is released (approve) or rejected (decline)
 *        through the EXISTING quarantine review — its own governed write, its own receipt (a release the review refuses is answered as such,
 *        the approval standing)
 *
 * CONSTRUCTION only; every answer is the port's, with the receipt.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ObservationCapability } from '../observation.capabilities.js';
import { VaultService, VaultIntegrityError } from '../vault/vault.service.js';
import { CollectionOrchestrator } from '../acquisition/orchestrator.service.js';
import { asObservationRefusal } from '../observation-errors.js';
import { IntakeCapability } from './intake.capabilities.js';

type Row = Record<string, unknown>;
type Body_ = { payload?: Row } | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The excerpt's bounds: the finding's span (at most 1 KiB of it) and 256 bytes of context either side — never more than 2 KiB. */
export const EXCERPT_CONTEXT = 256;
export const EXCERPT_MAX_SPAN = 1024;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const unprocessable = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const pathId = (v: string, what: string, correlationId: string): string => {
  if (!UUID_RE.test(v)) throw new HttpException(errorBody('EYE_STA_001', correlationId, `${what} ${v} is not an id of this domain`), 404);
  return v.toLowerCase();
};

/** The excerpt window: [start, end) around the cited span, clamped to the bytes; null when the offset lies outside them. */
export function excerptWindow(byteLength: number, offset: number, length: number): { served: { start: number; end: number }; highlight: { start: number; end: number } } | null {
  if (!Number.isInteger(offset) || offset < 0 || offset >= byteLength) return null;
  const span = Math.max(0, Math.min(Number.isInteger(length) && length > 0 ? length : 1, EXCERPT_MAX_SPAN, byteLength - offset));
  const highlight = { start: offset, end: offset + Math.max(span, 1) };
  return { served: { start: Math.max(0, offset - EXCERPT_CONTEXT), end: Math.min(byteLength, highlight.end + EXCERPT_CONTEXT) }, highlight };
}

type ExcerptResult =
  | { integrity: 'verified'; caseId: string; byteLength: number; contentDigest: string; window: ReturnType<typeof excerptWindow>; base64: string | null }
  | { integrity: 'failed'; caseId: string; message: string };

@Controller('/v1/tenants/:tenantId/domains/:domainId/observation')
export class IntakeB40Controller {
  constructor(private readonly pipeline: PipelineService, private readonly vault: VaultService, private readonly orchestrator: CollectionOrchestrator) {}

  @Post('/intake/queue')
  async queue(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const state = p['state'] === undefined || p['state'] === null ? null : typeof p['state'] === 'string' ? p['state'] : unprocessable(envelope.correlation_id, 'intake review rejected (state): state is open | admitted | rejected | expired | all');
    const limit = p['limit'] === undefined ? 100 : Number.isInteger(p['limit']) ? (p['limit'] as number) : unprocessable(envelope.correlation_id, 'intake review rejected (limit): limit is an integer');
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.inspection.read', objectType: 'QAR', objectId: null },
      IntakeCapability.read, async (cap) => cap.queue({ tenantId, domainId, state, limit }));
    return { queue: out.result, receipt: receipt(out) };
  }

  @Post('/intake/cases/:caseId/read')
  async readCase(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const caseId = pathId(caseIdRaw, 'quarantine case', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.inspection.read', objectType: 'QAR', objectId: caseId },
      IntakeCapability.read, async (cap) => cap.caseRead({ tenantId, domainId, caseId }));
    return { intake: out.result, receipt: receipt(out) };
  }

  @Post('/evidence/:evdId/inspection')
  async verdicts(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('evdId') evdIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const evdId = pathId(evdIdRaw, 'evidence', envelope.correlation_id);
    const v = body?.payload?.['version'];
    const version = v === undefined || v === null ? null : Number.isInteger(v) && (v as number) >= 1 ? (v as number) : unprocessable(envelope.correlation_id, 'inspection verdict rejected (version): version is an evidence version (an integer of 1 or more)');
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.inspection.read', objectType: 'EVD', objectId: evdId },
      IntakeCapability.read, async (cap) => cap.verdicts({ tenantId, domainId, evdId, version }));
    return { inspection: out.result, receipt: receipt(out) };
  }

  @Post('/intake/cases/:caseId/excerpt')
  async excerpt(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('caseId') caseIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const caseId = pathId(caseIdRaw, 'quarantine case', envelope.correlation_id);
    const p = body?.payload ?? {};
    const offset = Number.isInteger(p['offset']) && (p['offset'] as number) >= 0 ? (p['offset'] as number) : unprocessable(envelope.correlation_id, 'intake excerpt rejected (offset): offset is the finding\'s byte offset (an integer of 0 or more)');
    const length = p['length'] === undefined || p['length'] === null ? 1 : Number.isInteger(p['length']) && (p['length'] as number) >= 0 ? (p['length'] as number) : unprocessable(envelope.correlation_id, 'intake excerpt rejected (length): length is the finding\'s byte length');
    const out = await this.pipeline.consequentialReadEvidenced(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.evidence.retrieve', objectType: 'QAR', objectId: caseId },
      ObservationCapability.acquisition,
      async (cap, scope): Promise<ExcerptResult> => {
        const c = (await cap.readQuarantine().selectAll().where('case_id' as never, '=', caseId as never).executeTakeFirst()) as Row | undefined;
        if (c === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized quarantine case matches'), 404);
        const m = (await cap.readManifests().selectAll().where('manifest_id' as never, '=', c['manifest_id'] as never).executeTakeFirst()) as Row | undefined;
        if (m === undefined || typeof c['content_digest'] !== 'string') throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'the quarantined bytes of this case are not recorded'), 404);
        let bytes: Buffer;
        try {
          bytes = (await this.vault.read('quarantine', { tenantId: scope.tenantId as string, domainId: scope.domainId as string }, String(m['locator']), c['content_digest'])).bytes;
        } catch (e) {
          if (e instanceof VaultIntegrityError) {
            await cap.appendCustody({ eventId: newId(), tenantId, domainId, manifestId: String(m['manifest_id']), obsObjectId: null, evdObjectId: null, sourceId: String(c['source_id']),
              contractVersion: Number(c['contract_version']), runId: (c['run_id'] as string | null) ?? null, event: 'custody.integrity_failed', actor: `principal:${principal.principalId}`,
              agentPrincipalId: null, agentVersion: null, codeDigest: null, connector: null, connectorVersion: null, methodRef: 'intake-excerpt@1.0.0',
              contentDigest: c['content_digest'], digestVerified: false, details: { purpose: 'intake_case_excerpt', case_id: caseId, reason: e.reason }, correlationId: envelope.correlation_id });
            return { integrity: 'failed', caseId, message: `the quarantined bytes of case ${caseId} failed verification (${e.reason}); nothing was served` };
          }
          throw e;
        }
        const window = excerptWindow(bytes.byteLength, offset, length);
        await cap.appendCustody({ eventId: newId(), tenantId, domainId, manifestId: String(m['manifest_id']), obsObjectId: null, evdObjectId: null, sourceId: String(c['source_id']),
          contractVersion: Number(c['contract_version']), runId: (c['run_id'] as string | null) ?? null, event: 'custody.retrieved', actor: `principal:${principal.principalId}`,
          agentPrincipalId: null, agentVersion: null, codeDigest: null, connector: null, connectorVersion: null, methodRef: 'intake-excerpt@1.0.0',
          contentDigest: c['content_digest'], digestVerified: true,
          details: { purpose: 'intake_case_excerpt', vault: 'quarantine', case_id: caseId, finding_offset: offset, served: window?.served ?? null }, correlationId: envelope.correlation_id });
        return { integrity: 'verified', caseId, byteLength: bytes.byteLength, contentDigest: c['content_digest'], window,
                 base64: window === null ? null : bytes.subarray(window.served.start, window.served.end).toString('base64') };
      },
      (x) => x.integrity === 'verified'
        ? { outcome: 'success', resultCode: x.window === null ? 'EYE-REQ-001' : 'OK', metadata: { integrity: 'verified', digest_verified: true, vault: 'quarantine', served: x.window?.served ?? null } }
        : { outcome: 'success', resultCode: 'EYE-INT-001', metadata: { integrity: 'failed', digest_verified: false, vault: 'quarantine' } });
    const x = out.result;
    if (x.integrity === 'failed') throw new HttpException(errorBody('EYE_INT_001', envelope.correlation_id, x.message), 409);
    if (x.window === null) unprocessable(envelope.correlation_id, `intake excerpt rejected (offset): offset ${offset} does not lie within the ${x.byteLength} bytes of this case; the bytes were read and verified (custody recorded), nothing was served`);
    return { excerpt: { caseId, contentDigest: x.contentDigest, byteLength: x.byteLength, served: x.window?.served, highlight: x.window?.highlight, base64: x.base64 }, receipt: receipt(out) };
  }

  @Post('/intake/uploads/:approvalId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('approvalId') approvalIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const approvalId = pathId(approvalIdRaw, 'upload approval', envelope.correlation_id);
    const p = body?.payload ?? {};
    const decision = p['decision'] === 'approve' || p['decision'] === 'decline' ? p['decision'] : unprocessable(envelope.correlation_id, 'upload approval rejected (decision): the decision is approve | decline');
    const reason = typeof p['reason'] === 'string' && p['reason'].trim().length >= 8 ? p['reason'] : unprocessable(envelope.correlation_id, 'upload approval rejected (reason): a decision carries a reason of at least 8 characters');
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.upload.approve', objectType: 'QAR', objectId: approvalId },
      IntakeCapability.approve,
      async (cap) => {
        const r = await cap.decide({ approvalId, tenantId, domainId, decision, reason, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        return { result: r, targetType: 'QAR', targetId: String(r['case_id'] ?? approvalId), targetVersion: '1', outboxEvent: null };
      });
    const approval = out.result;
    // THE RELEASE / REJECTION — the existing quarantine review, its own governed write (close_quarantine_case requires the approval to release)
    try {
      const review = await this.orchestrator.reviewQuarantine({
        envelope: { ...envelope, message_id: newId(), action: 'observation.quarantine.review' } as typeof envelope, principal, tenantId, domainId,
        caseId: String(approval['case_id']), decision: decision === 'approve' ? 'release' : 'discard', reason,
      });
      return { approval, review, receipt: receipt(out) };
    } catch (e) {
      const mapped = asObservationRefusal(e, envelope.correlation_id);
      if (mapped === null) throw e;
      const r = mapped.getResponse() as Row;
      return { approval, review: null, review_refused: { status: mapped.getStatus(), message: String((r['error'] as Row | undefined)?.['message'] ?? r['message'] ?? 'refused') }, receipt: receipt(out) };
    }
  }
}
