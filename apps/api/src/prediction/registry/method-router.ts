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
import { planOf, routedRefusalStatus, type Plan, type PlanMethod } from './registry.service.js';
/* integration (B25 fold): the router RUNS a planned quantity family for §EN's ensemble members */
import { runFamily, type TargetRow } from './families.js';
import { addDays } from './methods/stats.js';
import { HORIZONS } from '../forecasting/forecasting.service.js';
import type { ForecastOutput, Point } from '../models/models.js';

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
    for (const m of plan.methods) this.planned.set(RegistryMethodRouter.key(a.tenantId, a.domainId, m.method_ref), { entry: m, target: plan.target });
    return methodPlanOf(plan);
  }

  /* integration (B25 fold): RUN one planned QUANTITY member for §EN's ensemble manager — the registry entry and target of the domain's
     latest plan IN THIS PROCESS (each plan records its entries); the same runFamily the routed issue uses, so a Bayesian member is the
     registry's Bayesian computation. A member with no plan cached (a run resumed in another process) FAILS with that reason, never runs blind. */
  private readonly planned = new Map<string, { entry: PlanMethod; target: TargetRow | null }>();
  private static key(t: string, d: string, ref: string): string { return `${t}:${d}:${ref}`; }
  run(a: { methodRef: string; points: Point[]; steps: number; season: number; tenantId?: string; domainId?: string; horizonCode?: string; seriesKey?: string;
            /* B25 completion (G1, G4): the ensemble's frozen features and the series' subject */ features?: Array<{ key: string; source: string; digest: string; value?: unknown }> | null; subjectEntityId?: string | null }): ForecastOutput {
    const c = a.tenantId === undefined || a.domainId === undefined ? undefined : this.planned.get(RegistryMethodRouter.key(a.tenantId, a.domainId, a.methodRef));
    if (c === undefined) throw new Error(`${a.methodRef}: no plan of this domain in this process carries its registry entry; the member is not run blind`);
    const horizonDays = HORIZONS[a.horizonCode ?? ''];
    const origin = a.points[a.points.length - 1]?.date;
    if (horizonDays === undefined || origin === undefined) throw new Error(`${a.methodRef}: the horizon or the history's origin is unknown`);
    const r = runFamily(c.entry, { points: a.points, seriesKey: a.seriesKey ?? '', seriesUnit: c.target?.unit ?? '', seasonality: a.season, horizonCode: a.horizonCode as string,
      horizonDays, originAt: origin, targetAt: addDays(origin, horizonDays), kind: 'quantity', target: c.target, features: a.features ?? null, subjectEntityId: a.subjectEntityId ?? null });
    if (r.kind !== 'quantity' || !('q50' in r.quantiles)) throw new Error(`${a.methodRef} produced a ${r.kind} result; a quantity ensemble combines quantity distributions only`);
    const q = r.quantiles as { q10: number; q50: number; q90: number };
    return { method: c.entry.method_ref, version: String(c.entry.version), quantiles: { q10: q.q10, q50: q.q50, q90: q.q90 }, path: [], parameters: {}, errorsUsed: 0 };
  }
}
