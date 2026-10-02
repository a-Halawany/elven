/**
 * THE LEARN STEP ROUTE — CP-6 B36 part `collab` (0094 §C5; F-P4-13 (j): JRN-09 learn, PR-28-001/-002, CAP-FW-05), under the prediction
 * module beside exposures.controller.ts's outcome review (0090 §X5, JRN-08). After the owner (or the sponsor) reviewed a response's outcome
 * against the exposure, the LEARNING goes on the lineage: what was EXPECTED (the accepted assessment's bracket — the port reads it), what
 * HAPPENED (the review's outcomes — the port reads them; the owner's words beside), what CHANGES in the estimate's basis. One learning per
 * review; exposure.learning_recorded on the exposure's events.
 *
 *   POST …/prediction/exposures/:exposureId/learnings/record   {reviewId, expected, observed, basisChange}
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { ExposureLearningCapability } from './exposure-learning.capabilities.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const bad = (c: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', c, m), 422); };
const str = (v: unknown, k: string, c: string, min: number, max: number): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) bad(c, `${k} is ${min}..${max} characters`);
  return s;
};

/** The intake of a learning (pure; unit-tested): the review it follows, what was expected and what happened in words, what changes in the basis. */
export function validateLearning(p: Row, c: string): { reviewId: string; expectedNote: string; observedNote: string; basisChange: string } {
  const reviewId = typeof p['reviewId'] === 'string' && UUID.test(p['reviewId']) ? p['reviewId'].toLowerCase() : bad(c, 'reviewId is the outcome review this learning follows (a uuid)');
  return { reviewId, expectedNote: str(p['expected'], 'expected', c, 8, 2000), observedNote: str(p['observed'], 'observed', c, 8, 2000), basisChange: str(p['basisChange'], 'basisChange', c, 16, 4000) };
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/prediction')
export class ExposureLearningController {
  constructor(private readonly pipeline: PipelineService) {}

  @Post('/exposures/:exposureId/learnings/record')
  async record(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('exposureId') exposureId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(exposureId)) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no such exposure in this domain'), 404);
    const id = exposureId.toLowerCase();
    const intake = validateLearning(body.payload ?? {}, envelope.correlation_id);
    const learningId = newId();
    const out = await this.pipeline.write(envelope, principal, { scope: 'DOMAIN', tenantId, domainId, action: 'prediction.exposure.learn', objectType: 'RSK', objectId: id }, ExposureLearningCapability.learn,
      async (cap, scope) => ({ result: await cap.recordLearning({ learningId, exposureId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...intake, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'RSK', targetId: id, targetVersion: null, outboxEvent: null }));
    return { learning: out.result, receipt: receipt(out) };
  }
}
