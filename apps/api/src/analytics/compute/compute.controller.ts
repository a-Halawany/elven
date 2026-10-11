/**
 * B92 §0 (0113 §0.7–§0.9) — THE COMPUTE SURFACE. Base `/v1/tenants/:t/domains/:d/analytics`.
 *
 *   metrics/compute               analytics.metric.compute — {metricKey, period (2026-Q3 | 2026-09 | R90@2026-10-12), scopeKey?, cohort?, asOf?, preview?}
 *   results/list                  analytics.read — {metricKey?, period?, scopeKey?, limit?}
 *   results/:resultId/read        analytics.read — the result with its definition, scope, records (recordsLimit ≤ 20000), uses and replays
 *   results/:resultId/replay      analytics.metric.replay — recomputed at its own as-of: reproduced | mismatch
 *   computations/list             analytics.read — the computation registry (key, function, version, body digest, reads, scope rule)
 *
 * Refusals in the server's words: `metric computation rejected (<class>): …`.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { AnalyticsComputeService } from './compute.service.js';
import { PERIOD_RE, PERSON_DIMENSIONS, refuseAnalytics } from '../seams.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Z][A-Z0-9]{1,9}-[A-Za-z0-9.-]{1,40}$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const optStr = (p: Row, k: string): string | null => (typeof p[k] === 'string' && String(p[k]).trim() !== '' ? String(p[k]).trim() : null);

@Controller('/v1/tenants/:tenantId/domains/:domainId/analytics')
export class AnalyticsComputeController {
  constructor(private readonly svc: AnalyticsComputeService) {}

  @Post('/metrics/compute')
  async compute(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const metricKey = optStr(p, 'metricKey'); const period = optStr(p, 'period');
    if (metricKey === null || !KEY.test(metricKey)) throw refuseAnalytics('metric computation', 'request', 'payload.metricKey names a metric (e.g. MET-001)', cid);
    if (period === null || !PERIOD_RE.test(period)) throw refuseAnalytics('metric computation', 'period', 'payload.period is 2026-Q3, 2026-09 or R90@2026-10-12', cid);
    const cohort = (p['cohort'] ?? {}) as Row;
    if (typeof cohort !== 'object' || cohort === null || Array.isArray(cohort)) throw refuseAnalytics('metric computation', 'request', 'payload.cohort is an object {dimension: value}', cid);
    const person = Object.keys(cohort).filter((k) => (PERSON_DIMENSIONS as readonly string[]).includes(k));
    if (person.length > 0) throw refuseAnalytics('metric computation', 'person', `a product metric is never grouped by a person (${person.join(', ')}): no employee-performance inference`, cid, 403);
    const asOf = optStr(p, 'asOf');
    if (asOf !== null && Number.isNaN(Date.parse(asOf))) throw refuseAnalytics('metric computation', 'as_of', 'payload.asOf is an instant', cid);
    return this.svc.compute(envelope, principal, t, d, { metricKey, period, scopeKey: optStr(p, 'scopeKey'), cohort, asOf, preview: p['preview'] === true });
  }

  @Post('/results/list')
  async results(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const limit = typeof p['limit'] === 'number' && Number.isInteger(p['limit']) ? Number(p['limit']) : 100;
    return this.svc.results(envelope, principal, t, d, { metricKey: optStr(p, 'metricKey'), period: optStr(p, 'period'), scopeKey: optStr(p, 'scopeKey'), limit });
  }

  @Post('/results/:resultId/read')
  async result(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('resultId') resultId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    if (!UUID.test(resultId)) throw refuseAnalytics('metric computation', 'request', 'the result is an id', envelope.correlation_id);
    const limit = typeof p['recordsLimit'] === 'number' && Number.isInteger(p['recordsLimit']) ? Number(p['recordsLimit']) : 500;
    const out = await this.svc.result(envelope, principal, t, d, resultId, limit);
    if (out.result === null) throw refuseAnalytics('metric computation', 'unknown_result', `${resultId} is not a result of this domain`, envelope.correlation_id, 404);
    return out;
  }

  @Post('/results/:resultId/replay')
  async replay(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('resultId') resultId: string) {
    const { envelope, principal } = ctx(req);
    if (!UUID.test(resultId)) throw refuseAnalytics('metric computation', 'request', 'the result is an id', envelope.correlation_id);
    return this.svc.replay(envelope, principal, t, d, resultId);
  }

  @Post('/computations/list')
  async registry(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.registry(envelope, principal, t, d);
  }
}
