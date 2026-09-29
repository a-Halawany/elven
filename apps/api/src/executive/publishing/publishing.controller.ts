/**
 * CP-6 B36 §D (0094) — THE PUBLISHING ROUTES (F-P6-13), under the executive module: same envelope, same capabilities, same receipts. Every
 * act is its own governed write with its own PDP action (human-gated); the reads are consequential reads under executive.publication.read.
 *
 *   POST /publications/draft                                  executive.publication.draft
 *   POST /publications/list · /publications/:id/get · /publications/:id/versions/:v/bytes/get   executive.publication.read
 *   POST /publications/:id/versions/:v/approve                executive.publication.approve   (the digest confirmed byte-for-byte; signed)
 *   POST /publications/:id/versions/:v/deliver                executive.publication.deliver   (in_app + the SYNTHETIC channels; receipts)
 *   POST /publications/deliveries/:deliveryId/acknowledge     executive.publication.acknowledge (the recipient's own act)
 *   POST /publications/:id/correct · /withdraw · /archive     executive.publication.correct · .withdraw · .archive
 *   POST /publications/:id/export/get                         executive.publication.export    (the gates: legal hold, residency)
 *   POST /publications/external-drafts/list                   executive.publication.read
 *   POST /publications/external-drafts/:draftId/review        executive.external_draft.review (an executive, not the drafter; signed)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { PublishingCapability } from './publishing.capabilities.js';
import { PublishingService } from './publishing.service.js';
import { validateDigest, validateDraft } from './publishing.render.js';

type Row = Record<string, unknown>;
function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const versionOf = (v: string, correlationId: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'the version is a positive integer'), 422);
  return n;
};
const reasonOf = (v: unknown, what: string, correlationId: string): string => {
  const r = typeof v === 'string' ? v.trim() : '';
  if (r.length < 8) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${what} names its reason (8+ characters)`), 422);
  return r;
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/publications')
export class PublishingController {
  constructor(private readonly pipeline: PipelineService, private readonly publishing: PublishingService) {}
  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private scope(tenantId: string, domainId: string) { return { tenantId, domainId }; }

  @Post('/draft')
  async draft(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateDraft(body.payload ?? {});
    if (typeof intake === 'string') throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `publication rejected (intake): ${intake}`), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.publication.draft', 'PUB', null), PublishingCapability.write,
      async (cap) => {
        const r = await this.publishing.draft(cap, this.scope(tenantId, domainId), principal, envelope.purpose_id ?? 'decision', intake, envelope.correlation_id);
        return { result: r, targetType: 'PUB', targetId: String(r['publication_id']), targetVersion: '1', outboxEvent: null };
      });
    return { publication: out.result, receipt: receipt(out) };
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.publication.read', 'PUB', null), PublishingCapability.read,
      async (cap) => this.publishing.list(cap, this.scope(tenantId, domainId), principal));
    return { publications: out.result, receipt: receipt(out) };
  }

  @Post('/:publicationId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('publicationId') publicationId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.publication.read', 'PUB', publicationId), PublishingCapability.read,
      async (cap) => this.publishing.get(cap, this.scope(tenantId, domainId), principal, publicationId, envelope.correlation_id));
    return { publication: out.result, receipt: receipt(out) };
  }

  @Post('/:publicationId/versions/:version/bytes/get')
  async bytes(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('publicationId') publicationId: string, @Param('version') version: string) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.publication.read', 'PUB', publicationId), PublishingCapability.read,
      async (cap) => this.publishing.bytes(cap, this.scope(tenantId, domainId), principal, publicationId, v, envelope.correlation_id));
    return { bytes: out.result, receipt: receipt(out) };
  }

  @Post('/:publicationId/versions/:version/approve')
  async approve(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('publicationId') publicationId: string, @Param('version') version: string, @Body() body: { payload?: { digest?: string } }) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const digest = validateDigest(body.payload?.digest);
    if (digest === null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'publication rejected (digest): the approval confirms the bytes\' sha256 (64 hex characters) as presented'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.publication.approve', 'PUB', publicationId), PublishingCapability.write,
      async (cap) => {
        const r = await this.publishing.approve(cap, this.scope(tenantId, domainId), principal, envelope.purpose_id ?? 'decision', publicationId, v, digest, envelope.correlation_id);
        return { result: r, targetType: 'PUB', targetId: publicationId, targetVersion: String(v), outboxEvent: null };
      });
    return { approval: out.result, receipt: receipt(out) };
  }

  @Post('/:publicationId/versions/:version/deliver')
  async deliver(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('publicationId') publicationId: string, @Param('version') version: string) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.publication.deliver', 'PUB', publicationId), PublishingCapability.write,
      async (cap) => {
        const r = await this.publishing.deliver(cap, this.scope(tenantId, domainId), principal, publicationId, v, envelope.correlation_id);
        return { result: r, targetType: 'PUB', targetId: publicationId, targetVersion: String(v), outboxEvent: null };
      });
    return { delivery: out.result, receipt: receipt(out) };
  }

  @Post('/deliveries/:deliveryId/acknowledge')
  async acknowledge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('deliveryId') deliveryId: string, @Body() body: { payload?: { note?: string } }) {
    const { envelope, principal } = ctx(req);
    const note = typeof body.payload?.note === 'string' ? body.payload.note.slice(0, 1000) : null;
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.publication.acknowledge', 'PUB', deliveryId), PublishingCapability.write,
      async (cap) => {
        const r = await this.publishing.acknowledge(cap, this.scope(tenantId, domainId), principal, deliveryId, note, envelope.correlation_id);
        return { result: r, targetType: 'PUB', targetId: String(r['publication_id'] ?? deliveryId), targetVersion: String(r['version'] ?? '1'), outboxEvent: null };
      });
    return { acknowledgement: out.result, receipt: receipt(out) };
  }

  @Post('/:publicationId/correct')
  async correct(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('publicationId') publicationId: string, @Body() body: { payload?: { reason?: string; sourceId?: string; sourceVersion?: number; sourceDigest?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = reasonOf(body.payload?.reason, 'a correction', envelope.correlation_id);
    const sourceDigest = validateDigest(body.payload?.sourceDigest);
    if (sourceDigest === null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'publication rejected (intake): a correction presents the corrected snapshot\'s content digest (sourceDigest, 64 hex characters)'), 422);
    const sv = body.payload?.sourceVersion;
    const sourceVersion = sv === undefined || sv === null ? null : Number(sv);
    if (sourceVersion !== null && (!Number.isInteger(sourceVersion) || sourceVersion < 1)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'sourceVersion is a positive integer'), 422);
    const sourceId = typeof body.payload?.sourceId === 'string' && body.payload.sourceId !== '' ? body.payload.sourceId.toLowerCase() : null;
    if (sourceId !== null && !/^[0-9a-f-]{36}$/.test(sourceId)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'sourceId is the corrected edition\'s briefing id (a uuid)'), 422);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.publication.correct', 'PUB', publicationId), PublishingCapability.write,
      async (cap) => {
        const r = await this.publishing.correct(cap, this.scope(tenantId, domainId), principal, envelope.purpose_id ?? 'decision', publicationId, { reason, sourceId, sourceVersion, sourceDigest }, envelope.correlation_id);
        return { result: r, targetType: 'PUB', targetId: publicationId, targetVersion: String(r['version'] ?? ''), outboxEvent: null };
      });
    return { correction: out.result, receipt: receipt(out) };
  }

  @Post('/:publicationId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('publicationId') publicationId: string, @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const reason = reasonOf(body.payload?.reason, 'a withdrawal', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.publication.withdraw', 'PUB', publicationId), PublishingCapability.write,
      async (cap) => {
        const r = await this.publishing.withdraw(cap, this.scope(tenantId, domainId), principal, envelope.purpose_id ?? 'decision', publicationId, reason, envelope.correlation_id);
        return { result: r, targetType: 'PUB', targetId: publicationId, targetVersion: String(r['version'] ?? ''), outboxEvent: null };
      });
    return { withdrawal: out.result, receipt: receipt(out) };
  }

  @Post('/:publicationId/archive')
  async archive(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('publicationId') publicationId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.publication.archive', 'PUB', publicationId), PublishingCapability.write,
      async (cap) => {
        const r = await this.publishing.archive(cap, this.scope(tenantId, domainId), principal, envelope.purpose_id ?? 'decision', publicationId, envelope.correlation_id);
        return { result: r, targetType: 'PUB', targetId: publicationId, targetVersion: null, outboxEvent: null };
      });
    return { archive: out.result, receipt: receipt(out) };
  }

  @Post('/:publicationId/export/get')
  async exportGet(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('publicationId') publicationId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.publication.export', 'PUB', publicationId), PublishingCapability.write,
      async (cap) => {
        const r = await this.publishing.exportGet(cap, this.scope(tenantId, domainId), principal, publicationId, envelope.correlation_id);
        return { result: r, targetType: 'PUB', targetId: publicationId, targetVersion: null, outboxEvent: null };
      });
    return { export: out.result, receipt: receipt(out) };
  }

  @Post('/external-drafts/list')
  async externalDrafts(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'executive.publication.read', 'PUB', null), PublishingCapability.read,
      async (cap) => (await cap.readExternalDrafts().selectAll().where('tenant_id' as never, '=', tenantId as never).where('domain_id' as never, '=', domainId as never).orderBy('requested_at' as never, 'desc').limit(200).execute()) as Row[]);
    return { external_drafts: out.result, receipt: receipt(out) };
  }

  @Post('/external-drafts/:draftId/review')
  async review(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('draftId') draftId: string, @Body() body: { payload?: { verdict?: string; note?: string; digest?: string } }) {
    const { envelope, principal } = ctx(req);
    const verdict = String(body.payload?.verdict ?? '');
    if (!['approved', 'rejected', 'information_requested'].includes(verdict)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'external draft rejected (verdict): the verdict is approved, rejected or information_requested'), 422);
    const digest = validateDigest(body.payload?.digest);
    if (digest === null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'external draft rejected (digest): the review confirms the bytes\' sha256 (64 hex characters) as presented'), 422);
    const note = typeof body.payload?.note === 'string' ? body.payload.note.slice(0, 2000) : null;
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'executive.external_draft.review', 'PUB', draftId), PublishingCapability.write,
      async (cap) => {
        const r = await this.publishing.reviewExternalDraft(cap, this.scope(tenantId, domainId), principal, draftId, { verdict, note, digest }, envelope.correlation_id);
        return { result: r, targetType: 'PUB', targetId: String(r['publication_id'] ?? draftId), targetVersion: String(r['version'] ?? '1'), outboxEvent: null };
      });
    return { review: out.result, receipt: receipt(out) };
  }
}
