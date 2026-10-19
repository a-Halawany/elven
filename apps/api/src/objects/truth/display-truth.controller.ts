/**
 * B82 §TS (0121_b82_x_ts; TS-06, TS-08, TS-10, HX-02, UX-06-004/-005/-006) — THE DISPLAY-TRUTH READ, inside the existing `api.objects` unit
 * (no new unit):
 *
 *   POST /v1/tenants/:t/domains/:d/display-truth   objects.display_truth.read   { refs: [{ type, id, version }] } → one row per ref, in order
 *
 * RECOMMENDED / CORRECTED / INDETERMINATE are DERIVED by objects.display_truth (rule b82-ts-display-1) — never stored; the stored truth
 * state rides beside the display one, with the basis, the reasons and the constrained use. An audited consequential read (the pipeline
 * records the access); the action is granted EXACTLY to graph.provenance.read's readers (they already read every object's truth and
 * lifecycle through graph.explain — no role gains a read it did not hold; DESIGN D9). Refusals in the server's words: `display truth
 * rejected (<class>): …`; `read rejected (scope)` from the read itself.
 */
import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { EyeRequest } from '../../pipeline/http.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { newId } from '../../shared/ids.js';
import { requestOf } from '../lifecycle/lifecycle.service.js';
import { DisplayTruthCapability } from './display-truth.capabilities.js';
import { DISPLAY_TRUTH_ACTION, asDisplayTruthRefusal, refsIntake } from './display-truth-logic.js';

type Row = Record<string, unknown>;

@Controller('/v1/tenants/:tenantId/domains/:domainId/display-truth')
export class DisplayTruthController {
  constructor(private readonly pipeline: PipelineService) {}

  @Post()
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Row }) {
    const cid = requireCorrelation(req);
    const { envelope, principal } = requestOf(req, cid);
    const refs = refsIntake(body?.payload ?? {}, cid);
    const first = refs[0]!;
    const route: RouteInfo = { scope: 'DOMAIN', tenantId, domainId, action: DISPLAY_TRUTH_ACTION, objectType: refs.length === 1 ? first.type : null, objectId: refs.length === 1 ? first.id : null };
    const env = { ...envelope, action: DISPLAY_TRUTH_ACTION, object_type: route.objectType ?? 'OBJ', object_id: route.objectId, side_effect_class: 'none', message_id: newId() } as Envelope;
    try {
      const out = await this.pipeline.consequentialRead(env, principal, route, DisplayTruthCapability.read, (cap) => cap.displayTruth({ tenantId, domainId, refs }));
      return { truth: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
    } catch (e) { throw asDisplayTruthRefusal(e, cid); }
  }
}
