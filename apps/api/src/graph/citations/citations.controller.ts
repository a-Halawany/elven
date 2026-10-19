/**
 * CP-6 B82 §EV (0121_b82_x_ev) — THE CITATION ROUTES: a further controller on the graph's base path (inside the existing api.graph unit, as
 * B50's ProvenanceController), so no other controller changes. Both are READS under the EXISTING `graph.provenance.read` action (its roles
 * include the decision roles, the executive and the tenant auditor — DESIGN D9: no new permission; the decision roles resolve a citation
 * SHORT OF THE BYTES, and the bytes stay behind observation.evidence.retrieve, the segment route of the observation unit).
 *
 *   POST …/graph/citations/resolve      {refs: [{kind, id, version, digest}], depth?}   graph.resolve_citation — each citation to its exact
 *                                                                                        evidence leaves, digest / custody / rights / tier /
 *                                                                                        correction per leaf, the outcome (UX-26-001/003, REL-08)
 *   POST …/graph/citations/signatures   {subjectKind, subjectId, subjectVersion}         the subject's recorded signatures, each VERIFIED /
 *                                                                                        FAILED / UNAVAILABLE with its reason (CMP-032)
 *
 * Every answer is the port's (or the verifier's) with the receipt. Nothing here infers an outcome. CONSTRUCTION only.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { SignatureService } from '../../executive/signatures/signature.service.js';
import { CITATION_KIND_TYPES, type CitationKind, type CitationRefRow } from '../b82-seams.js';
import { CitationCapability } from './citations.capabilities.js';

type Row = Record<string, unknown>;
type Body_ = { payload?: Row } | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const KINDS = Object.keys(CITATION_KIND_TYPES) as CitationKind[];
const SIGNATURE_KINDS = ['approval', 'decision', 'publication', 'queue_transition', 'plan_baseline', 'briefing', 'health_snapshot', 'product_release', 'metric_certification',
  'config_baseline', 'responsibility_matrix', 'mapping', 'cutover', 'readiness', 'acceptance', 'admission_record', 'acceptance_attestation', 'design_acceptance'];

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const refused = (correlationId: string, cls: string, message: string): never => {
  throw new HttpException(errorBody('EYE_REQ_001', correlationId, `citation resolution rejected (${cls}): ${message}`), 422);
};

/** The request's own shape, before anything is read (the port re-checks every citation). */
export function citationIntake(p: Row, correlationId: string): { refs: CitationRefRow[]; depth: number } {
  const refs = p['refs'];
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 50) refused(correlationId, 'citations', 'refs names 1 to 50 citations, each {kind, id, version, digest}');
  const out: CitationRefRow[] = [];
  for (const r of refs as unknown[]) {
    const c = (r ?? {}) as Row;
    const kind = c['kind']; const id = c['id']; const version = c['version']; const digest = c['digest'] ?? null;
    if (typeof kind !== 'string' || !KINDS.includes(kind as CitationKind) || typeof id !== 'string' || !UUID_RE.test(id)
        || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1 || (digest !== null && (typeof digest !== 'string' || !DIGEST_RE.test(digest)))) {
      refused(correlationId, 'citation', `${JSON.stringify(c).slice(0, 160)} is not a citation — {kind (${KINDS.join(', ')}), id, version ≥ 1, digest (64 hex) or null}`);
    }
    out.push({ kind: kind as CitationKind, id: (id as string).toLowerCase(), version: version as number, digest: digest as string | null });
  }
  const depth = p['depth'] === undefined || p['depth'] === null ? 4 : p['depth'];
  if (typeof depth !== 'number' || !Number.isSafeInteger(depth) || depth < 1 || depth > 8) refused(correlationId, 'depth', 'depth is how many lineage steps are descended, 1 to 8');
  return { refs: out, depth: depth as number };
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/graph')
export class CitationsController {
  constructor(private readonly pipeline: PipelineService, private readonly signatures: SignatureService) {}

  @Post('/citations/resolve')
  async resolve(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const a = citationIntake(body?.payload ?? {}, envelope.correlation_id);
    const first = a.refs.length === 1 ? a.refs[0]! : null;
    const objectType = first === null ? 'CIT' : (CITATION_KIND_TYPES[first.kind] ?? 'CIT');
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'graph.provenance.read', objectType, objectId: first?.id ?? null },
      CitationCapability.read,
      async (cap) => cap.resolve({ tenantId, domainId, refs: a.refs, depth: a.depth }));
    return { resolutions: out.result, receipt: receipt(out) };
  }

  @Post('/citations/signatures')
  async signaturesOf(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Body_) {
    const { envelope, principal } = ctx(req);
    const p = body?.payload ?? {};
    const kind = p['subjectKind']; const id = p['subjectId']; const version = p['subjectVersion'];
    if (typeof kind !== 'string' || !SIGNATURE_KINDS.includes(kind)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `subjectKind is one of ${SIGNATURE_KINDS.join(', ')}`), 422);
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'subjectId is the signed subject\'s id (a uuid)'), 422);
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'subjectVersion is an integer of 1 or more'), 422);
    const key = this.signatures.publicKey();
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'graph.provenance.read', objectType: 'SIG', objectId: id.toLowerCase() },
      CitationCapability.read,
      async (cap) => (await cap.signaturesOf({ subjectKind: kind, subjectId: id.toLowerCase(), subjectVersion: version })).map((s) => ({
        ...s,
        // the verifier's answer for THIS read (never stored here; §PX records a "verify again" in graph.trust_verifications)
        verification: this.signatures.verifyOutcome({ key_id: String(s['key_id'] ?? ''), signature: String(s['signature'] ?? ''), subject_digest: String(s['subject_digest'] ?? '') }),
      })));
    return {
      signatures: out.result,
      verifier: { keyOnFile: key === null ? null : key.keyId, checkedAt: new Date().toISOString(), rule: 'unavailable when no key is on file for the row\'s key id; failed only when a key on file does not verify it' },
      receipt: receipt(out),
    };
  }
}
