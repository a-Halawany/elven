/**
 * B92 §MCA — THE CONTRACTS OF COMPUTATIONS A, served for proposal. Base `/v1/tenants/:t/domains/:d/analytics`.
 *
 *   computations-a/contracts      analytics.read — the 29 contracts of definitions-a.ts (23 computed, 6 V01-T-046 measures unsupported with their
 *                                 carriers), each with its registration (computation version, body digest, dimensions, scope rule) read from
 *                                 analytics.computation_registry, and the contract's own shape problems (none expected).
 *
 * A contract is DATA an analyst proposes through §MD's definition port and a named product analytics owner approves; this route only serves
 * it (the act and §MD's catalog read it). Computing is the prelude's port (analytics.metric.compute); this part adds no write.
 */
import { Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { AnalyticsComputeService } from '../compute/compute.service.js';
import { contractProblems, definitionsA, SCENE_METRICS_A } from './definitions-a.js';

type Row = Record<string, unknown>;

@Controller('/v1/tenants/:tenantId/domains/:domainId/analytics')
export class AnalyticsComputationsAController {
  constructor(private readonly svc: AnalyticsComputeService) {}

  @Post('/computations-a/contracts')
  async contracts(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
    if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
    const out = await this.svc.read(envelope, principal, t, d, 'AMR', null, async (cap) => ({ registry: await cap.registry(), read_at: await cap.now() }));
    const byKey = new Map(out.result.registry.map((r: Row) => [String(r['computation_key']), r]));
    return {
      contracts: definitionsA.map((c) => {
        const reg = c.computationKey === null ? null : byKey.get(c.computationKey) ?? null;
        return { ...c, registration: reg === null ? null : { version: reg['version'], body_digest: reg['body_digest'], dimensions: reg['dimensions'], scope_rule: reg['scope_rule'], kind: reg['kind'] },
                 registered: c.computationKey === null ? null : reg !== null, problems: contractProblems(c) };
      }),
      scene: SCENE_METRICS_A,
      claims: 'software capability; the harness proves it on SYNTHETIC planted records and the act on NORDWERK\'s SYNTHETIC demonstration records — neither is real-provider or signed acceptance (R2)',
      read_at: out.result.read_at,
      receipt: AnalyticsComputeService.receipt(out),
    };
  }
}
