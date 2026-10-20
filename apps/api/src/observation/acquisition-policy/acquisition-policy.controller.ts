/**
 * CP-6 B40 §AP (F-P1-04) — THE ACQUISITION POLICY of a source, read: a further controller on the observation base path (inside the existing
 * api.observation unit; ObservationController untouched — the B82 idiom).
 *
 *   POST …/observation/acquisition/:sourceId/read   {}   observation.acquisition.read (pdp.service.ts B40 ap — the collection, coverage and
 *        decision readers of observation.coverage_remediation.read; never the collection agent): per contract version the declared policy (or
 *        "not declared before SRC@v4"), the runs' acquisition authorizations, the robots cache, the RATE-LIMITED INTERVALS with the contract's
 *        backoff and their resolution, the stream form's explicit incomplete ranges — the acquisition page and the coverage panel the source
 *        page mounts. METADATA ONLY (D9): no evidence content, no credential value, no robots text.
 *
 * Refusals are the port's, in its words (`acquisition policy rejected (unknown_source)` — the noun to be mapped centrally at the fold).
 * CONSTRUCTION only.
 */
import { Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { AcquisitionPolicyCapability } from './acquisition-policy.capabilities.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('/v1/tenants/:tenantId/domains/:domainId/observation')
export class AcquisitionPolicyController {
  constructor(private readonly pipeline: PipelineService) {}

  @Post('/acquisition/:sourceId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('sourceId') sourceIdRaw: string) {
    const envelope = req.eyeEnvelope;
    const principal = req.eyePrincipal;
    if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
    if (!UUID_RE.test(sourceIdRaw)) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `source ${sourceIdRaw} is not an id of this domain`), 404);
    const sourceId = sourceIdRaw.toLowerCase();
    const out = await this.pipeline.consequentialRead(envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action: 'observation.acquisition.read', objectType: 'SRC', objectId: sourceId },
      AcquisitionPolicyCapability.read, async (cap) => cap.read({ tenantId, domainId, sourceId }));
    return { acquisition: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }
}
