/**
 * B92 §I (0113 §I) — THE EXCEPTIONS AND MANUAL ADJUSTMENTS (PR-70-002 `exception`; App M Audit "manual adjustments, exceptions, approvals and uses
 * remain replayable"). Base `/v1/tenants/:t/domains/:d/analytics`.
 *
 *   exceptions/propose            analytics.exception.propose — {metricKey, kind: threshold_exemption, period, scopeKey?, cohort?, reason, expiresAt}
 *   exceptions/:id/decide         analytics.exception.decide (human-gated; a named owner, never the proposer) — {decision: approve|reject|revoke, digest, reason}
 *   exceptions/list               analytics.read — {metricKey?}
 *   adjustments/propose           analytics.adjustment.propose — {resultId, value, reason, evidence[]}: shown BESIDE the result, never replacing it
 *   adjustments/:id/decide        analytics.adjustment.decide (human-gated; a named owner, never the proposer) — {decision: approve|reject, digest, reason}
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { sql } from 'kysely';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { newId } from '../../shared/ids.js';
import { AnalyticsComputeService } from '../compute/compute.service.js';
import { PERIOD_RE, refuseAnalytics } from '../seams.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const j = (v: unknown) => JSON.stringify(v ?? null);
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' && String(p[k]).trim() !== '' ? String(p[k]).trim() : null);
function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const one = async (tx: unknown, q: ReturnType<typeof sql>): Promise<Row> => {
  const r = ((await q.execute(tx as never)).rows as Array<{ r: Row | null }>)[0]?.r;
  if (r === undefined || r === null) throw new Error('the port returned no row');
  return r;
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/analytics')
export class AnalyticsExceptionsController {
  constructor(private readonly svc: AnalyticsComputeService) {}

  @Post('/exceptions/propose')
  async proposeException(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const metricKey = str(p, 'metricKey'); const period = str(p, 'period'); const expiresAt = str(p, 'expiresAt');
    if (metricKey === null) throw refuseAnalytics('metric definition', 'request', 'payload.metricKey names a metric', cid);
    if (period === null || !PERIOD_RE.test(period)) throw refuseAnalytics('metric definition', 'period', 'payload.period is 2026-Q3, 2026-09 or R90@2026-10-12', cid);
    if (expiresAt === null || Number.isNaN(Date.parse(expiresAt))) throw refuseAnalytics('metric definition', 'expiry', 'payload.expiresAt is an instant', cid);
    const exceptionId = newId();
    const out = await this.svc.write(envelope, principal, t, d, 'analytics.exception.propose', 'AMD', null, async (cap) => ({
      result: await one(cap.tx, sql`select analytics.propose_metric_exception(${exceptionId}::uuid, ${t}::uuid, ${d}::uuid, ${metricKey}, ${str(p, 'kind') ?? 'threshold_exemption'}, ${period},
        ${str(p, 'scopeKey')}, ${j(p['cohort'] ?? {})}::jsonb, ${str(p, 'reason') ?? ''}, ${expiresAt}::timestamptz, ${principal.principalId}::uuid, ${cid}::uuid) as r`), targetId: exceptionId,
    }));
    return { exception: out.result, receipt: AnalyticsComputeService.receipt(out) };
  }

  @Post('/exceptions/:exceptionId/decide')
  async decideException(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('exceptionId') exceptionId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    if (!UUID.test(exceptionId)) throw refuseAnalytics('metric definition', 'request', 'the exception is an id', cid);
    const out = await this.svc.write(envelope, principal, t, d, 'analytics.exception.decide', 'AMD', exceptionId, async (cap) => ({
      result: await one(cap.tx, sql`select analytics.decide_metric_exception(${exceptionId}::uuid, ${t}::uuid, ${d}::uuid, ${str(p, 'decision') ?? ''}, ${str(p, 'digest')}, ${str(p, 'reason') ?? ''},
        ${principal.principalId}::uuid, ${cid}::uuid) as r`),
    }));
    return { exception: out.result, receipt: AnalyticsComputeService.receipt(out) };
  }

  @Post('/exceptions/list')
  async listExceptions(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const metricKey = str(p, 'metricKey');
    const out = await this.svc.read(envelope, principal, t, d, 'AMD', null, async (cap) => ({
      exceptions: (await sql<Row>`select e.* from analytics.metric_exceptions e where (${metricKey}::text is null or e.metric_key = ${metricKey}) order by e.proposed_at desc limit 200`.execute(cap.tx)).rows,
    }));
    return { ...out.result, receipt: AnalyticsComputeService.receipt(out) };
  }

  @Post('/adjustments/propose')
  async proposeAdjustment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const resultId = str(p, 'resultId');
    if (resultId === null || !UUID.test(resultId)) throw refuseAnalytics('metric computation', 'request', 'payload.resultId is a result id', cid);
    if (typeof p['value'] !== 'number' || !Number.isFinite(p['value'])) throw refuseAnalytics('metric computation', 'adjustment', 'payload.value is a number', cid);
    const adjustmentId = newId();
    const out = await this.svc.write(envelope, principal, t, d, 'analytics.adjustment.propose', 'AMR', resultId, async (cap) => ({
      result: await one(cap.tx, sql`select analytics.propose_result_adjustment(${adjustmentId}::uuid, ${t}::uuid, ${d}::uuid, ${resultId}::uuid, ${p['value'] as number}::numeric, ${str(p, 'reason') ?? ''},
        ${j(p['evidence'] ?? [])}::jsonb, ${principal.principalId}::uuid, ${cid}::uuid) as r`), targetId: adjustmentId,
    }));
    return { adjustment: out.result, receipt: AnalyticsComputeService.receipt(out) };
  }

  @Post('/adjustments/:adjustmentId/decide')
  async decideAdjustment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('adjustmentId') adjustmentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    if (!UUID.test(adjustmentId)) throw refuseAnalytics('metric computation', 'request', 'the adjustment is an id', cid);
    const out = await this.svc.write(envelope, principal, t, d, 'analytics.adjustment.decide', 'AMR', adjustmentId, async (cap) => ({
      result: await one(cap.tx, sql`select analytics.decide_result_adjustment(${adjustmentId}::uuid, ${t}::uuid, ${d}::uuid, ${str(p, 'decision') ?? ''}, ${str(p, 'digest')}, ${str(p, 'reason') ?? ''},
        ${principal.principalId}::uuid, ${cid}::uuid) as r`),
    }));
    return { adjustment: out.result, receipt: AnalyticsComputeService.receipt(out) };
  }
}
