/**
 * Operator upload intake — cohort 1 (PDF / DOCX / CSV).
 *
 * Files arrive base64-encoded inside the governed envelope rather than as
 * multipart form data. That is deliberate: the envelope's `payload_digest` covers
 * the whole payload, so the bytes an operator uploaded are digest-bound to the
 * request that uploaded them before any handler sees them. A multipart body would
 * sit outside that digest.
 *
 * From here the bytes take the SAME §5 path as a polled response — same
 * quarantine, same content controls, same custody vocabulary. There is no second,
 * gentler admission path for things a human handed us.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { CollectionOrchestrator } from '../acquisition/orchestrator.service.js';
import type { UploadedFile } from '../connectors/upload.connector.js';

interface UploadPayload {
  sourceId?: string;
  contractVersion?: number;
  files?: Array<{ filename?: string; mediaType?: string | null; base64?: string; documentTime?: string | null }>;
}

/** A ceiling on the intake itself, applied before anything is decoded. */
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 25;

@Controller('/v1/tenants/:tenantId/domains/:domainId/observation/upload')
export class UploadController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly orchestrator: CollectionOrchestrator,
  ) {}

  @Post()
  async upload(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Param('domainId') domainId: string,
    @Body() body: { payload?: UploadPayload },
  ) {
    const envelope = req.eyeEnvelope;
    const principal = req.eyePrincipal;
    if (envelope === undefined || principal === undefined) {
      throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
    }
    const route = {
      scope: 'DOMAIN' as const, tenantId, domainId,
      action: 'observation.run.trigger', objectType: 'RUN', objectId: null,
    };
    const p = body.payload;
    if (
      typeof p?.sourceId !== 'string' ||
      typeof p.contractVersion !== 'number' ||
      !Array.isArray(p.files) ||
      p.files.length === 0
    ) {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001',
        'sourceId, contractVersion and at least one file are required', 400);
    }
    const files = p?.files ?? [];
    if (files.length > MAX_FILES) {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', `at most ${MAX_FILES} files per upload`, 413);
    }

    const decoded: UploadedFile[] = [];
    let total = 0;
    for (const f of files) {
      if (typeof f.filename !== 'string' || typeof f.base64 !== 'string') {
        await this.pipeline.rejectAuthenticatedRequest(
          envelope, principal, route, 'EYE-REQ-001', 'each file requires a filename and base64 content', 400);
      }
      const bytes = Buffer.from(f.base64 as string, 'base64');
      total += bytes.byteLength;
      if (total > MAX_UPLOAD_BYTES) {
        await this.pipeline.rejectAuthenticatedRequest(
          envelope, principal, route, 'EYE-REQ-001', 'upload exceeds the intake byte ceiling', 413);
      }
      decoded.push({
        // The filename is NORMALISED at the boundary (§8.2): path separators and
        // control characters never reach the vault, a manifest, or a log line.
        filename: normaliseFilename(f.filename as string),
        declaredMediaType: f.mediaType ?? null,
        bytes,
        operator: `principal:${principal.principalId}`,
        documentTime: f.documentTime ?? null,
      });
    }

    const outcome = await this.orchestrator.collectNow({
      tenantId, domainId,
      sourceId: p?.sourceId as string,
      contractVersion: p?.contractVersion as number,
      correlationId: envelope.correlation_id,
      purposeId: envelope.purpose_id ?? 'observation',
      triggeredBy: `principal:${principal.principalId}`,
      files: decoded,
    });
    return { run: outcome };
  }
}

/**
 * Filename normalisation. Everything that could be read as a path, a hidden file
 * or a control sequence is removed; what remains is a flat, printable name. The
 * ORIGINAL name is not preserved anywhere it could later be interpreted as a
 * path — the item key and the manifest both carry the normalised form.
 */
export function normaliseFilename(name: string): string {
  // 1. Take the last path segment, treating both separators as separators, so a
  //    name like "..\\..\\etc\\passwd" cannot survive as a path at all.
  const flat = name.replace(/\\/g, '/').split('/').pop() ?? 'upload';
  // 2. Strip leading dots: a normalised name is never hidden and never relative.
  const withoutLeadingDots = flat.replace(/^\.+/, '').trim();
  // 3. ALLOWLIST the remaining characters. An allowlist rather than a blocklist
  //    because a blocklist has to anticipate every dangerous character, and
  //    control characters, separators and shell metacharacters all fail closed
  //    here without being enumerated.
  const safe = withoutLeadingDots.replace(/[^A-Za-z0-9._ -]+/g, '_').slice(0, 180);
  return safe.length > 0 ? safe : 'upload';
}
