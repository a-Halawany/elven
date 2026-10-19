/**
 * CP-6 B82 §EV (0121_b82_x_ev) — THE EVIDENCE SEGMENT AND THE RIGHTS TERMS: a further controller on the observation base path (inside the
 * existing api.observation unit, beside ObservationController's evidence routes), so ObservationController is untouched.
 *
 *   POST …/observation/evidence/:evdId/segment   {version?, byteStart, byteEnd, context?}   THE CITED SPAN, under the EXISTING
 *        `observation.evidence.retrieve` authority (DESIGN D9: the roles that read evidence bytes today, and no other — no new action, no PDP
 *        widening; a decision role is refused by the PDP in the server's words and keeps the citation's resolution, short of the bytes).
 *        The SAME retrieval path as the download (evidence.service.retrieve): the manifest resolved, the FULL digest re-verified on this read,
 *        the custody entry written (`custody.retrieved`, its details naming the span and the purpose), POL and AUD durable with it; then ONLY
 *        [byteStart − context, byteEnd + context) leaves — at most 64 KiB cited, 1 KiB of context either side — with the cited span's offsets
 *        in it. An integrity failure answers A7's one 409 (EYE-INT-001) after its custody row commits; an unreachable tier answers the
 *        declared degraded block (EYE-DEG-001) with no bytes; a span outside the bytes is refused (422) after the verified read is in custody.
 *   POST …/observation/rights/:sourceId/read     {}                                          the rights terms of a source (observation.read.rights —
 *        the existing observation.read prefix rule's readers)
 *   POST …/observation/rights/declare            {sourceId, contractVersion, expectedVersion, expiresAt, purposes, prohibitedUses, attribution,
 *                                                  reason, requestId?}                         observation.rights.declare (human-gated)
 *   POST …/observation/rights/:termsId/withdraw  {expectedVersion, reason, requestId?}       observation.rights.withdraw (human-gated)
 *
 * CONSTRUCTION only; the answers are the ports' and the vault's, with the receipt.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ObservationCapability } from '../observation.capabilities.js';
import { EvidenceService, type RetrievalResult } from '../vault/evidence.service.js';
import { RightsCapability } from './rights.capabilities.js';
import { segmentIntake, segmentWindow, type SegmentWindow } from './segment.js';

type Row = Record<string, unknown>;
type Body_ = { payload?: Row } | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
const strings = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);

type SegmentResult = RetrievalResult & { window: SegmentWindow | null };

@Controller('/v1/tenants/:tenantId/domains/:domainId/observation')
export class EvidenceB82Controller {
  constructor(private readonly pipeline: PipelineService, private readonly evidence: EvidenceService) {}

  @Post('/evidence/:evdId/segment')
  async segment(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('evdId') evdIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const evdId = pathId(evdIdRaw, 'evidence', envelope.correlation_id);
    const r = segmentIntake(body?.payload ?? {});
    if ('problem' in r) unprocessable(envelope.correlation_id, r.problem);
    const s = r as Exclude<typeof r, { problem: string }>;
    const out = await this.pipeline.consequentialReadEvidenced(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.evidence.retrieve', objectType: 'EVD', objectId: evdId },
      ObservationCapability.acquisition,
      async (cap, scope): Promise<SegmentResult> => {
        // the custody entry names what was read and why (it cannot change what is verified, served or refused — evidence.service.retrieve)
        const context: Record<string, string> = { purpose: 'evidence_segment', segment: `${s.byteStart}-${s.byteEnd}`, context_bytes: String(s.context),
          ...(s.version === null ? {} : { expected_version: String(s.version) }) };
        const got = await this.evidence.retrieve(cap, scope, `principal:${principal.principalId}`, evdId, envelope.correlation_id, context, s.version);
        return { ...got, window: got.integrity === 'verified' ? segmentWindow(s, got.byteLength) : null };
      },
      (x) => x.integrity === 'verified'
        ? { outcome: 'success', resultCode: x.window === null ? 'EYE-REQ-001' : 'OK',
            metadata: { integrity: 'verified', digest_verified: true, byte_length: x.byteLength, segment: { start: s.byteStart, end: s.byteEnd }, served: x.window?.served ?? null, span_in_range: x.window !== null } }
        : x.integrity === 'unavailable'
          ? { outcome: 'success', resultCode: 'EYE-DEG-001', metadata: { integrity: 'unavailable', digest_verified: null, tier: x.tier, root_unreachable: x.degraded.root, segment: { start: s.byteStart, end: s.byteEnd } } }
          : { outcome: 'success', resultCode: 'EYE-INT-001', metadata: { integrity: 'failed', digest_verified: false, segment: { start: s.byteStart, end: s.byteEnd } } });
    const x = out.result;
    if (x.integrity === 'failed') throw new HttpException(errorBody('EYE_INT_001', envelope.correlation_id, x.refusal.message), 409);
    if (x.integrity === 'verified' && x.window === null) {
      unprocessable(envelope.correlation_id, `evidence segment rejected (span): the cited span ${s.byteStart}–${s.byteEnd} does not lie within the ${x.byteLength} bytes of this evidence version; the bytes were read and verified (custody recorded), nothing was served`);
    }
    const base = { evdId, version: x.objectVersion, cited: { start: s.byteStart, end: s.byteEnd } };
    if (x.integrity === 'unavailable') {
      return { segment: { ...base, contentDigest: x.contentDigest, byteLength: x.byteLength, integrity: x.integrity, tier: x.tier, availability: x.availability, served: null, highlight: null, base64: null, degraded: x.degraded }, receipt: receipt(out) };
    }
    const v = x as Extract<SegmentResult, { integrity: 'verified' }>;
    const w = v.window!;
    const bytes = Buffer.from(v.base64, 'base64').subarray(w.served.start, w.served.end);
    return {
      segment: { ...base, contentDigest: v.contentDigest, byteLength: v.byteLength, integrity: v.integrity, tier: v.tier, availability: v.availability,
        served: w.served, highlight: w.highlight, base64: bytes.toString('base64'), degraded: null },
      receipt: receipt(out),
    };
  }

  // ───────────────────────── the rights terms ─────────────────────────
  @Post('/rights/:sourceId/read')
  async readRights(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const sourceId = pathId(sourceIdRaw, 'source', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.read.rights', objectType: 'SRC', objectId: sourceId },
      RightsCapability.read, async (cap) => cap.read({ tenantId, domainId, sourceId }));
    return { rights: out.result, receipt: receipt(out) };
  }

  @Post('/rights/declare')
  async declareRights(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const corr = envelope.correlation_id;
    const sourceId = typeof p['sourceId'] === 'string' && UUID_RE.test(p['sourceId']) ? (p['sourceId'] as string).toLowerCase() : unprocessable(corr, 'rights terms rejected (request): sourceId is the source (a uuid)');
    const contractVersion = Number.isSafeInteger(p['contractVersion']) && (p['contractVersion'] as number) >= 1 ? p['contractVersion'] as number : unprocessable(corr, 'rights terms rejected (request): contractVersion is the source contract version the terms govern (an integer of 1 or more)');
    const expectedVersion = Number.isSafeInteger(p['expectedVersion']) && (p['expectedVersion'] as number) >= 0 ? p['expectedVersion'] as number : unprocessable(corr, 'rights terms rejected (request): expectedVersion is the version of the terms you read (0 when none is declared)');
    const expiresRaw = p['expiresAt'] ?? null;
    const expiresAt = expiresRaw === null ? null : typeof expiresRaw === 'string' && Number.isFinite(Date.parse(expiresRaw)) ? new Date(expiresRaw).toISOString() : unprocessable(corr, 'rights terms rejected (expiry): expiresAt is an ISO instant, or null for "no expiry declared"');
    const purposes = strings(p['purposes']) ?? unprocessable(corr, 'rights terms rejected (purposes): purposes is a list of what the evidence may be used for');
    const prohibitedUses = strings(p['prohibitedUses'] ?? []) ?? unprocessable(corr, 'rights terms rejected (prohibited_uses): prohibitedUses is a list');
    const attribution = p['attribution'] === undefined || p['attribution'] === null || p['attribution'] === '' ? null : typeof p['attribution'] === 'string' ? p['attribution'] : unprocessable(corr, 'rights terms rejected (attribution): attribution is text or null');
    const reason = typeof p['reason'] === 'string' ? p['reason'] : unprocessable(corr, 'rights terms rejected (reason): a reason says where the terms come from');
    const requestId = typeof p['requestId'] === 'string' && UUID_RE.test(p['requestId']) ? (p['requestId'] as string).toLowerCase() : newId();
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.rights.declare', objectType: 'SRC', objectId: sourceId },
      RightsCapability.declare,
      async (cap) => {
        const r = await cap.declare({ requestId, tenantId, domainId, sourceId, contractVersion, expectedVersion, expiresAt, purposes, prohibitedUses, attribution, reason,
          actor: principal.principalId, correlationId: corr });
        return { result: r, targetType: 'RTT', targetId: String(r['terms_id'] ?? sourceId), targetVersion: r['version'] === undefined ? null : String(r['version']), outboxEvent: null };
      });
    return { terms: out.result, receipt: receipt(out) };
  }

  @Post('/rights/:termsId/withdraw')
  async withdrawRights(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('termsId') termsIdRaw: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    const termsId = pathId(termsIdRaw, 'rights terms', corr);
    const p = body?.payload ?? {};
    const expectedVersion = Number.isSafeInteger(p['expectedVersion']) && (p['expectedVersion'] as number) >= 1 ? p['expectedVersion'] as number : unprocessable(corr, 'rights terms rejected (request): expectedVersion is the version of the terms you read');
    const reason = typeof p['reason'] === 'string' ? p['reason'] : unprocessable(corr, 'rights terms rejected (reason): a withdrawal states its reason');
    const requestId = typeof p['requestId'] === 'string' && UUID_RE.test(p['requestId']) ? (p['requestId'] as string).toLowerCase() : newId();
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.rights.withdraw', objectType: 'RTT', objectId: termsId },
      RightsCapability.withdraw,
      async (cap) => {
        const r = await cap.withdraw({ requestId, tenantId, domainId, termsId, expectedVersion, reason, actor: principal.principalId, correlationId: corr });
        return { result: r, targetType: 'RTT', targetId: termsId, targetVersion: r['version'] === undefined ? null : String(r['version']), outboxEvent: null };
      });
    return { terms: out.result, receipt: receipt(out) };
  }
}
