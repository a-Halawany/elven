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
 *
 * B25-F1 (the review's finding: the router CACHED each planned entry and target in process memory under tenant:domain:method_ref — a later
 * plan of the domain overwrote what an earlier admitted run executed, and a restart lost it). The router holds NO state now: the plan it
 * answers carries, per method, the registry entry AS PLANNED (`pin`: method ref, implementation reference and digest, parameters,
 * declarations, the validation found and the evaluation profile) and the TARGET VERSION planned (the row with its definition digest); the
 * caller PERSISTS them with its run and hands them back to `run`, which executes only what was pinned — the implementation digest must be
 * this build's and the target definition must still digest as planned, or the member fails with that reason (never runs blind). The route
 * the plan was recorded as is CLOSED by `closeRoute` when the caller finishes (issued: bound to the ensemble forecast; refused: the run failed).
 * B25-F2: `run` answers the family's OUTPUT SEMANTICS (meaning, temporal aggregation, unit, uncertainty) beside its numbers.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { Tx } from '../../shared/db.js';
import { canonicalDigest } from '../../shared/forecast-environment.js';
import type { MethodPlan, MethodRouter, OutputSemantics, PlannedMethod } from '../portfolio/seams.js';
import { RegistryCapability } from './registry.capabilities.js';
import { evaluationProfileOf, planOf, routedRefusalStatus, type Plan, type PlanMethod } from './registry.service.js';
/* integration (B25 fold): the router RUNS a planned quantity family for §EN's ensemble members */
import { codeDigestOf, runFamily, type Family, type PlannedEntry, type TargetRow } from './families.js';
import { addDays } from './methods/stats.js';
import { HORIZONS } from '../forecasting/forecasting.service.js';
import type { ForecastOutput, Point } from '../models/models.js';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});

export class RoutedRefusal extends HttpException {
  constructor(readonly plan: Plan, correlationId: string) {
    const status = routedRefusalStatus(plan.refusal_class ?? 'horizon');
    super(errorBody(status === 403 ? 'EYE_AUT_001' : status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001', correlationId, plan.refusal ?? 'forecast rejected (horizon): unsupported'), status);
  }
}

/** B25-F1: the registry entry as planned — what an admitted run persists and later executes (and what its members pin). */
export function entryPinOf(plan: Plan, m: PlanMethod): Row {
  return { method_ref: m.method_ref, method_key: m.method_key, version: m.version, family: m.family, builtin: m.builtin === true, implementation_ref: m.implementation_ref,
           implementation_digest: m.implementation_digest, parameters: m.parameters ?? {}, declarations: m.declarations ?? {}, confidence_language: m.confidence_language,
           validation: m.validation ?? null, evaluation_profile: evaluationProfileOf(plan, m, plan.horizon) };
}
/** B25-F1: the target version as planned — the row (definition included, so a run executes against it) and its definition digest. */
export function targetPlanPinOf(t: TargetRow | null): Row | null {
  return t === null ? null : { ...t, version: Number(t.version), definition_digest: canonicalDigest(t.definition ?? {}) };
}

/** The seam's MethodPlan of a recorded plan (B25-F1: with the route, the target version and each method's entry pinned). */
export function methodPlanOf(plan: Plan): MethodPlan {
  return {
    targetKey: plan.target_key, horizonCode: plan.horizon,
    policy: { policyId: plan.policy.policy_id, version: plan.policy.version, horizonRule: plan.policy.rule === null ? null : { ...plan.policy.rule, kind_rule: plan.policy.kind_rule, confidence_language: plan.confidence_language } },
    methods: plan.methods.map((m): PlannedMethod => ({ methodRef: m.method_ref, family: m.family, forecastKind: m.forecast_kind, available: m.available,
      ...(m.available ? {} : { unavailableReason: m.unavailable_reason ?? 'unavailable' }), confidenceLanguage: m.confidence_language, pin: entryPinOf(plan, m) })),
    routeId: plan.route_id ?? null, target: targetPlanPinOf(plan.target),
  };
}

/** B25-F1: what `run` is handed — the member's request and the run's PERSISTED pins (never a cache). */
export interface RegistryMemberRun {
  methodRef: string; points: Point[]; steps: number; season: number; tenantId?: string; domainId?: string; horizonCode?: string; seriesKey?: string; seriesUnit?: string;
  /* B25 completion (G1, G4): the ensemble's frozen features and the series' subject */ features?: Array<{ key: string; source: string; digest: string; value?: unknown }> | null; subjectEntityId?: string | null;
  /** the registry entry as the run's plan pinned it */ pin?: Row | null;
  /** the target version as the run's plan pinned it (null: no target) */ target?: Row | null;
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
    return methodPlanOf(plan);   // B25-F1: nothing kept here — the caller persists the pins with its run
  }

  /** B25-F1: close the plan's route — bound to the ensemble forecast its run issued, or refused with the run's failure. Idempotent. */
  async closeRoute(tx: unknown, a: { routeId: string; tenantId: string; domainId: string; outcome: 'issued' | 'refused'; refusal?: string; refusalClass?: string; correlationId: string }): Promise<Row | null> {
    const t = tx as Tx;
    const state = (await sql<{ outcome: string }>`select outcome from prediction.forecast_routes where route_id = ${a.routeId}::uuid`.execute(t)).rows[0]?.outcome ?? null;
    if (state !== 'planned') return null;   // already closed (or not this caller's to read): left as it is
    const actor = (await sql<{ p: string | null }>`select public.eye_principal()::text as p`.execute(t)).rows[0]?.p ?? null;
    if (actor === null) throw new HttpException(errorBody('EYE_AUT_001', a.correlationId, 'forecast rejected (actor): no acting principal is bound to this transaction'), 403);
    const cap = RegistryCapability.route(t, 'prediction.ensemble.issue');
    return a.outcome === 'issued'
      ? cap.bindRoute({ routeId: a.routeId, tenantId: a.tenantId, domainId: a.domainId, actor, correlationId: a.correlationId })
      : cap.refuseRoute({ routeId: a.routeId, tenantId: a.tenantId, domainId: a.domainId, refusal: (a.refusal ?? 'forecast rejected (ensemble): the run failed').slice(0, 2000),
                          refusalClass: a.refusalClass ?? 'ensemble', actor, correlationId: a.correlationId });
  }

  /* integration (B25 fold): RUN one planned QUANTITY member for §EN's ensemble manager — the same runFamily the routed issue uses, so a
     Bayesian member is the registry's Bayesian computation. B25-F1: from the run's PERSISTED pins only (the entry and the target version its
     plan pinned); a member with no pin FAILS with that reason, never runs blind. B25-F2: the output carries its semantics. */
  run(a: RegistryMemberRun): ForecastOutput & { semantics: OutputSemantics } {
    const pin = a.pin ?? null;
    if (pin === null || pin['method_ref'] !== a.methodRef) {
      throw new Error(`${a.methodRef}: the run's persisted plan pins no registry entry for it; the member is not run blind`);
    }
    const entry: PlannedEntry = { method_ref: String(pin['method_ref']), method_key: String(pin['method_key']), version: Number(pin['version']), family: String(pin['family']) as Family,
      implementation_ref: String(pin['implementation_ref']), implementation_digest: String(pin['implementation_digest']), parameters: rec(pin['parameters']), declarations: rec(pin['declarations']),
      confidence_language: String(pin['confidence_language'] ?? '') };
    const code = codeDigestOf(entry.implementation_ref);
    if (code === undefined || code !== entry.implementation_digest) {
      throw new Error(`${a.methodRef}: implementation digest mismatch — the run's plan pinned ${entry.implementation_ref} ${entry.implementation_digest.slice(0, 12)}…, this build carries ${code === undefined ? 'no such implementation' : `${code.slice(0, 12)}…`}; not run`);
    }
    const tp = a.target ?? null;
    let target: TargetRow | null = null;
    if (tp !== null) {
      const digest = canonicalDigest(rec(tp['definition']));
      if (digest !== tp['definition_digest']) throw new Error(`${a.methodRef}: the pinned target ${String(tp['target_key'])} v${String(tp['version'])} no longer digests as planned (target.definition); not run`);
      target = { target_key: String(tp['target_key']), version: Number(tp['version']), kind: tp['kind'] as TargetRow['kind'], unit: String(tp['unit']), title: String(tp['title'] ?? ''),
                 definition: rec(tp['definition']), sources: rec(tp['sources']), subject_entity_id: (tp['subject_entity_id'] as string | null | undefined) ?? null, risk_class: String(tp['risk_class'] ?? 'standard') };
    }
    const horizonDays = HORIZONS[a.horizonCode ?? ''];
    const origin = a.points[a.points.length - 1]?.date;
    if (horizonDays === undefined || origin === undefined) throw new Error(`${a.methodRef}: the horizon or the history's origin is unknown`);
    const r = runFamily(entry, { points: a.points, seriesKey: a.seriesKey ?? '', seriesUnit: a.seriesUnit ?? '', seasonality: a.season, horizonCode: a.horizonCode as string,
      horizonDays, originAt: origin, targetAt: addDays(origin, horizonDays), kind: 'quantity', target, features: a.features ?? null, subjectEntityId: a.subjectEntityId ?? null });
    if (r.kind !== 'quantity' || !('q50' in r.quantiles)) throw new Error(`${a.methodRef} produced a ${r.kind} result; a quantity ensemble combines quantity distributions only`);
    const q = r.quantiles as { q10: number; q50: number; q90: number };
    return { method: entry.method_ref, version: String(entry.version), quantiles: { q10: q.q10, q50: q.q50, q90: q.q90 }, path: [], parameters: {}, errorsUsed: 0, semantics: r.semantics };
  }
}
