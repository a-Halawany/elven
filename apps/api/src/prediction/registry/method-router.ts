/**
 * METHOD_ROUTER — CP-6 B25 §MR's implementation of the prelude's seam (portfolio/seams.ts), REPLACING the LegacyMethodRouter default in
 * prediction.module.ts's B25 seams block. A caller (§EN's ensemble issue, under `prediction.ensemble.issue`) hands its transaction; the
 * route is RECORDED through prediction.record_forecast_route (the plan recomputed by the port: the governed registry, the target's kind
 * at the horizon, the active horizon policy and its validation requirement) and answered as a MethodPlan — every method with `available`
 * and, when false, its reason (retired, quarantined, proposed, superseded, the policy's validation missing), which §EN excludes and
 * DISCLOSES. A refused plan THROWS RoutedRefusal (`forecast rejected (<class>): …`, the class's HTTP status): the route row and the
 * forecast.horizon_refused event are written in the caller's transaction, so a caller that wants the ledgered refusal to stand catches it,
 * commits its write and answers the refusal after (the routed issue's own route does exactly that).
 *
 * The seam's arguments carry no instant, actor or forecast id: the acting principal is the database's (public.eye_principal()), the cut-off
 * the database's clock, the would-be forecast a fresh id — unless the caller passes `knownAt`, `observedThrough` or `forecastId` beside
 * them (read when present).
 */
import { HttpException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { Tx } from '../../shared/db.js';
import type { MethodPlan, MethodRouter, PlannedMethod } from '../portfolio/seams.js';
import { RegistryCapability } from './registry.capabilities.js';
import { planOf, routedRefusalStatus, type Plan } from './registry.service.js';

export class RoutedRefusal extends HttpException {
  constructor(readonly plan: Plan, correlationId: string) {
    const status = routedRefusalStatus(plan.refusal_class ?? 'horizon');
    super(errorBody(status === 403 ? 'EYE_AUT_001' : status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001', correlationId, plan.refusal ?? 'forecast rejected (horizon): unsupported'), status);
  }
}

/** The seam's MethodPlan of a recorded plan. */
export function methodPlanOf(plan: Plan): MethodPlan {
  return {
    targetKey: plan.target_key, horizonCode: plan.horizon,
    policy: { policyId: plan.policy.policy_id, version: plan.policy.version, horizonRule: plan.policy.rule === null ? null : { ...plan.policy.rule, kind_rule: plan.policy.kind_rule, confidence_language: plan.confidence_language } },
    methods: plan.methods.map((m): PlannedMethod => ({ methodRef: m.method_ref, family: m.family, forecastKind: m.forecast_kind, available: m.available,
      ...(m.available ? {} : { unavailableReason: m.unavailable_reason ?? 'unavailable' }), confidenceLanguage: m.confidence_language })),
  };
}

@Injectable()
export class RegistryMethodRouter implements MethodRouter {
  async plan(tx: unknown, a: { tenantId: string; domainId: string; targetKey: string | null; seriesKey: string; horizonCode: string; correlationId: string }): Promise<MethodPlan> {
    const t = tx as Tx;
    const extra = a as typeof a & { knownAt?: string; observedThrough?: string | null; forecastId?: string };
    const actor = (await sql<{ p: string | null }>`select public.eye_principal()::text as p`.execute(t)).rows[0]?.p ?? null;
    if (actor === null) throw new HttpException(errorBody('EYE_AUT_001', a.correlationId, 'forecast rejected (actor): no acting principal is bound to this transaction'), 403);
    const cap = RegistryCapability.route(t, 'prediction.ensemble.issue');
    const knownAt = extra.knownAt ?? await cap.now();
    const plan = planOf(await cap.recordRoute({ routeId: newId(), tenantId: a.tenantId, domainId: a.domainId, targetKey: a.targetKey, seriesKey: a.targetKey === null ? a.seriesKey : (a.seriesKey || null),
      horizonCode: a.horizonCode, knownAt, cutoff: extra.observedThrough ?? null, forecastId: extra.forecastId ?? newId(), actor, correlationId: a.correlationId }));
    if (plan.refusal !== null) throw new RoutedRefusal(plan, a.correlationId);
    return methodPlanOf(plan);
  }
}
