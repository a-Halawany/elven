/**
 * THE GOVERNED MODEL REGISTRY, ROUTING AND THE METHOD FAMILIES — CP-6 B25 part `registry` (0108 §MR; F-P4-01).
 *
 *   THE REGISTRY (L6-C03) — versioned method entries: proposed by a forecast owner or an agent (AI drafts and proposes), APPROVED by the named
 *   human method steward the entry names (never its proposer, never an agent), retired, quarantined (on demand, or automatically when a
 *   routed run of it fails or its pinned implementation digest is not this build's), reinstated by its steward. The two legacy methods are
 *   builtins, approved in every domain, so the legacy behaviour reads through the registry.
 *   THE TARGETS — what is forecast, governed: kind, unit, definition (an event's condition, a regime's categories), sources; approved by a
 *   named human who did not declare it. A target may change kind by horizon (an event at 30d, a regime at 5y).
 *   THE HORIZON POLICY (V00-T-051, V02-T-153, V03-T-125) — versioned per domain and risk class: per horizon the families allowed, and per
 *   kind the confidence language and the validation requirement; published by a forecast owner or administrator, ACTIVE on the concurrence
 *   of the named method steward (separation of duties). Without a policy the legacy rule stands (the statistical methods, quantity only).
 *   ROUTING (V03-T-320) — the plan is the database's (prediction.forecast_route_plan): the approved methods the policy allows for the
 *   target's kind at the horizon, each available or not WITH ITS REASON; or the GOVERNED REFUSAL naming what is missing — at 3y/5y the
 *   validation (`forecast rejected (horizon): … is unsupported — no passed quantity-rolling-origin validation …`), ledgered as
 *   forecast.horizon_refused. METHOD_ROUTER (the seam §EN plans its members with) is RegistryMethodRouter (method-router.ts).
 *   THE ROUTED ISSUE — plan → (freeze the context through CONTEXT_FREEZER; null by default) → run the chosen family on the known-at history
 *   → issue through prediction.issue_forecast with the B25 columns and the FCT@v2 sections → bind the route (forecast.routed). The
 *   statistical builtins issue through ForecastingService.issue unchanged (the leash and the legacy validation). A data refusal refuses the
 *   request and leaves the method approved; a failure quarantines it. Either way the refusal is LEDGERED: the write commits the route and the
 *   registry ledger, then the route answers the refusal.
 *   VALIDATION (per target/horizon) — the event backtest (Brier, log score, calibration-in-the-large) and the quantity rolling-origin backtest
 *   at the horizon itself (3y/5y included) on the known-at history, retrospective (one vintage) or historical (each origin's own recorded
 *   history), recorded with the prediction.backtests row a validation claim names. SYNTHETIC history is recorded as such: it proves the
 *   machinery (a synthetic demonstration), never an empirical validation.
 *
 * THREE CLAIMS, KEPT APART in every answer: software capability (the machinery runs), a synthetic demonstration (on SYNTHETIC history) and
 * empirical validation (a passed backtest on real, non-synthetic history).
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { canonicalDigest } from '../../shared/forecast-environment.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ForecastWrites } from '../prediction.capabilities.js';
import { SeriesService, type AssembledSeries, type Reader } from '../series/series.service.js';
import { ForecastingService, HORIZONS, MIN_HISTORY_FOR_BACKTEST } from '../forecasting/forecasting.service.js';
import { HOLT_WINTERS, SEASONAL_NAIVE } from '../models/models.js';
import { CONTEXT_FREEZER, type ContextFreezer } from '../portfolio/seams.js';
import { RegistryCapability, type RouteWrites, type ValidationWrites } from './registry.capabilities.js';
import {
  FAMILIES, FAMILY_IMPLEMENTATION, FamilyRefusal, HORIZON_CODES, checkDeclarations, codeDigestOf, eventConditionOf, runFamily,
  type Family, type FamilyResult, type ForecastKind, type PlannedEntry, type TargetRow,
} from './families.js';
import { eventBacktest, type BetaPrior } from './methods/event.js';
import { bayesActual, bayesClimatology, bayesForecast, type BayesDeclarations } from './methods/bayesian.js';
import { rollingOrigin } from './methods/validation.js';
import type { Point } from './methods/stats.js';

type Row = Record<string, unknown>;
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function refuse(noun: string, cls: string, message: string, correlationId: string, status = 422): never {
  throw new HttpException(errorBody(status === 403 ? 'EYE_AUT_001' : status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : 'EYE_REQ_001', correlationId,
    `${noun} rejected (${cls}): ${message}`), status);
}
/** The HTTP answer of a governed refusal text (the routed refusals carry their class; the mapper's classes). */
export function routedRefusalStatus(cls: string): number {
  if (cls === 'actor' || cls === 'authority' || cls === 'ownership') return 403;
  if (cls.startsWith('unknown_')) return 404;
  if (cls === 'state' || cls === 'stale' || cls === 'duplicate') return 409;
  return 422;
}

/* ───────────────────────── the request validators ───────────────────────── */

export interface MethodProposal { key: string; family: Family; kinds: ForecastKind[]; horizons: string[]; parameters: Row; declarations: Row; validation: Row; description: string; steward: string;
  implementationRef: string; implementationDigest: string }

export function validateProposal(p: Row, correlationId: string): MethodProposal {
  const key = str(p['methodKey']);
  if (key === null || !/^[a-z][a-z0-9_]{1,62}$/.test(key)) refuse('forecast method', 'key', 'payload.methodKey is a lower-case key (letters, digits, underscores; 2–63)', correlationId);
  const family = p['family'];
  if (typeof family !== 'string' || !(FAMILIES as readonly string[]).includes(family)) refuse('forecast method', 'family', `payload.family is one of ${FAMILIES.join(', ')}`, correlationId);
  const fam = family as Family;
  const kinds = Array.isArray(p['forecastKinds']) ? (p['forecastKinds'] as unknown[]).filter((k): k is ForecastKind => typeof k === 'string') : [...FAMILY_IMPLEMENTATION[fam].kinds];
  if (kinds.length === 0 || kinds.some((k) => !['quantity', 'event', 'state', 'regime'].includes(k))) refuse('forecast method', 'kinds', 'payload.forecastKinds are quantity, event, state or regime', correlationId);
  const horizons = Array.isArray(p['horizons']) ? (p['horizons'] as unknown[]).filter((h): h is string => typeof h === 'string') : [];
  if (horizons.length === 0 || horizons.some((h) => !(HORIZON_CODES as readonly string[]).includes(h))) refuse('forecast method', 'horizons', `payload.horizons are among ${HORIZON_CODES.join(', ')} (at least one)`, correlationId);
  const description = str(p['description']);
  if (description === null || description.length < 8) refuse('forecast method', 'description', 'payload.description says what the method computes (at least 8 characters)', correlationId);
  const steward = str(p['steward']);
  if (steward === null || !UUID.test(steward)) refuse('forecast method', 'steward', 'payload.steward names the method steward who will decide the entry (a principal id)', correlationId);
  const parameters = rec(p['parameters']); const declarations = rec(p['declarations']); const validation = rec(p['validationRequirement']);
  try { checkDeclarations(fam, kinds, declarations, parameters); } catch (e) {
    if (e instanceof FamilyRefusal) throw new HttpException(errorBody('EYE_REQ_001', correlationId, e.message), 422);
    throw e;
  }
  const implementationRef = FAMILY_IMPLEMENTATION[fam].ref;
  const implementationDigest = codeDigestOf(implementationRef);
  if (implementationDigest === undefined) refuse('forecast method', 'implementation', `this build carries no implementation ${implementationRef}`, correlationId);
  return { key: key as string, family: fam, kinds, horizons, parameters, declarations, validation, description: description as string, steward: steward as string,
           implementationRef, implementationDigest: implementationDigest as string };
}

export function validateDecision(p: Row, allowed: readonly string[], noun: string, correlationId: string): { decision: string; note: string } {
  const decision = str(p['decision']);
  if (decision === null || !allowed.includes(decision)) refuse(noun, 'decision', `payload.decision is ${allowed.join(' or ')}`, correlationId);
  const note = str(p['note']);
  if (note === null || note.length < 8) refuse(noun, 'note', 'payload.note states the reason (at least 8 characters)', correlationId);
  return { decision: decision as string, note: note as string };
}

export function validateMethodAct(p: Row, field: 'reason' | 'note', correlationId: string): { methodRef: string; text: string } {
  const methodRef = str(p['methodRef']);
  if (methodRef === null || !/^[a-z][a-z0-9_]{1,62}@[0-9]+$/.test(methodRef)) refuse('forecast method', 'method', 'payload.methodRef names an entry as key@version', correlationId);
  const text = str(p[field]);
  if (text === null || text.length < 8) refuse('forecast method', field, `payload.${field} is stated (at least 8 characters)`, correlationId);
  return { methodRef: methodRef as string, text: text as string };
}

export interface TargetDeclaration { key: string; kind: ForecastKind; unit: string; title: string; definition: Row; sources: Row; subject: string | null; riskClass: string }
export function validateTarget(p: Row, correlationId: string): TargetDeclaration {
  const key = str(p['targetKey']);
  if (key === null || !/^[a-z][a-z0-9_.:-]{1,126}$/.test(key)) refuse('forecast target', 'key', 'payload.targetKey is a lower-case key (letters, digits, . : _ -)', correlationId);
  const kind = p['kind'];
  if (kind !== 'quantity' && kind !== 'event' && kind !== 'state' && kind !== 'regime') refuse('forecast target', 'kind', 'payload.kind is quantity, event, state or regime', correlationId);
  const unit = str(p['unit']); const title = str(p['title']);
  if (unit === null) refuse('forecast target', 'unit', 'payload.unit is stated', correlationId);
  if (title === null || title.length < 8) refuse('forecast target', 'title', 'payload.title names the target in words (at least 8 characters)', correlationId);
  const definition = rec(p['definition']);
  if (str(definition['series_key']) === null) refuse('forecast target', 'definition', 'payload.definition.series_key names the series the target is read from', correlationId);
  const subject = str(p['subjectEntityId']);
  if (subject !== null && !UUID.test(subject)) refuse('forecast target', 'subject', 'payload.subjectEntityId is an entity id', correlationId);
  const riskClass = str(p['riskClass']) ?? 'standard';
  return { key: key as string, kind: kind as ForecastKind, unit: unit as string, title: title as string, definition, sources: rec(p['sources']), subject, riskClass };
}

export function validatePolicy(p: Row, correlationId: string): { riskClass: string; rules: Row; statement: string; steward: string } {
  const rules = rec(p['rules']);
  if (Object.keys(rules).length === 0) refuse('horizon policy', 'rules', 'payload.rules has a rule per horizon (30d … 5y)', correlationId);
  const statement = str(p['statement']);
  if (statement === null || statement.length < 8) refuse('horizon policy', 'statement', 'payload.statement says what the policy decides (at least 8 characters)', correlationId);
  const steward = str(p['steward']);
  if (steward === null || !UUID.test(steward)) refuse('horizon policy', 'steward', 'payload.steward names the method steward who must concur (a principal id)', correlationId);
  return { riskClass: str(p['riskClass']) ?? 'standard', rules, statement: statement as string, steward: steward as string };
}

function instantOf(v: unknown, field: string, noun: string, correlationId: string): string {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) refuse(noun, 'request', `payload.${field} is an instant`, correlationId);
  return new Date(v as string).toISOString();
}
function dayOrNull(v: unknown, field: string, noun: string, correlationId: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !DAY.test(v)) refuse(noun, 'request', `payload.${field} is a day (YYYY-MM-DD)`, correlationId);
  return v as string;
}

export interface PlanRequest { targetKey: string | null; seriesKey: string | null; horizonCode: string; knownAt: string | null; observedThrough: string | null }
export function validatePlanRequest(p: Row, correlationId: string): PlanRequest {
  const targetKey = str(p['targetKey']); const seriesKey = str(p['seriesKey']);
  if (targetKey === null && seriesKey === null) refuse('forecast', 'request', 'payload names a targetKey or a seriesKey', correlationId);
  const horizonCode = str(p['horizon']);
  if (horizonCode === null || HORIZONS[horizonCode] === undefined) refuse('forecast', 'horizon', `payload.horizon is one of ${Object.keys(HORIZONS).join(', ')}`, correlationId);
  return { targetKey, seriesKey, horizonCode: horizonCode as string, knownAt: p['knownAt'] === undefined || p['knownAt'] === null ? null : instantOf(p['knownAt'], 'knownAt', 'forecast', correlationId),
           observedThrough: dayOrNull(p['observedThrough'], 'observedThrough', 'forecast', correlationId) };
}

export interface RoutedIssueRequest extends PlanRequest { assumptions: string[]; label: 'replay demonstration' | 'live'; refreshCadence: string; methodRef: string | null }
export function validateRoutedIssue(p: Row, correlationId: string): RoutedIssueRequest {
  const base = validatePlanRequest(p, correlationId);
  const assumptions = Array.isArray(p['assumptions']) ? (p['assumptions'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  if (assumptions.length === 0 || assumptions.some((a) => !UUID.test(a))) {
    refuse('forecast', 'assumptions', 'a forecast names at least one assumption (ASU) it rests on; one that rests on nothing can never be reached by a correction', correlationId);
  }
  const methodRef = str(p['methodRef']);
  if (methodRef !== null && !/^[a-z][a-z0-9_]{1,62}@[0-9]+$/.test(methodRef)) refuse('forecast', 'method', 'payload.methodRef names a registry entry as key@version', correlationId);
  return { ...base, assumptions, methodRef, label: p['label'] === 'live' ? 'live' : 'replay demonstration', refreshCadence: str(p['refreshCadence']) ?? 'weekly' };
}

export interface ValidationRequest { methodRef: string; targetKey: string | null; seriesKey: string | null; horizonCode: string; knownAt: string | null; observedThrough: string | null;
  origins: number; stride: number | null; minTrainDays: number | null; minOrigins: number; mode: 'retrospective' | 'historical' }
export function validateValidationRun(p: Row, correlationId: string): ValidationRequest {
  const base = validatePlanRequest(p, correlationId);
  const methodRef = str(p['methodRef']);
  if (methodRef === null || !/^[a-z][a-z0-9_]{1,62}@[0-9]+$/.test(methodRef)) refuse('forecast method', 'method', 'payload.methodRef names the entry to validate (key@version)', correlationId);
  const intOr = (v: unknown, d: number | null, lo: number, hi: number, f: string): number | null => {
    if (v === undefined || v === null) return d;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) refuse('forecast method', 'validation', `payload.${f} is an integer in [${lo}, ${hi}]`, correlationId);
    return v as number;
  };
  const mode = p['mode'] === 'historical' ? 'historical' : 'retrospective';
  return { ...base, methodRef: methodRef as string, origins: intOr(p['origins'], 40, 1, 200, 'origins') as number, stride: intOr(p['stride'], null, 1, 3650, 'stride'),
           minTrainDays: intOr(p['minTrainDays'], null, 28, 7300, 'minTrainDays'), minOrigins: intOr(p['minOrigins'], 20, 1, 200, 'minOrigins') as number, mode };
}

/* ───────────────────────── the plan as the routed issue reads it ───────────────────────── */

export interface PlanMethod extends PlannedEntry {
  available: boolean; unavailable_reason: string | null; forecast_kind: ForecastKind;
  validation: { required: boolean; validation_id?: string; backtest_id?: string; mode?: string; origins?: number; passed?: boolean; synthetic?: boolean; verdict?: string; window_to?: string };
}
export interface Plan {
  route_id?: string; target_key: string | null; target: TargetRow | null; series_key: string; forecast_kind: ForecastKind; horizon: string;
  policy: { policy_id: string | null; version: number | null; risk_class: string; rule: Row | null; kind_rule: Row | null; legacy?: boolean };
  confidence_language: string; treatment: string | null; validation_required: boolean; methods: PlanMethod[]; refusal: string | null; refusal_class: string | null;
}
export const planOf = (r: Row): Plan => r as unknown as Plan;

/** B25 act-found: what a routed issue or a validation read BEFORE its write opened — the cut-off instant and the series (null: nothing to read). */
export interface PreAssembly { knownAt: string; assembled: AssembledSeries | null }

/** The issue's capability: the forecast writes (admission, the issue port), the route's ports, and the transaction the seams are handed. */
export interface PortfolioIssueCap { forecast: ForecastWrites; route: RouteWrites; seamTx: unknown }

@Injectable()
export class RegistryService {
  constructor(
    private readonly series: SeriesService,
    private readonly forecasting: ForecastingService,
    @Inject(CONTEXT_FREEZER) private readonly freezer: ContextFreezer,
  ) {}

  /**
   * B25 act-found: BEFORE THE WRITE OPENS — the cut-off and the series the routed issue (or the validation) will read, assembled outside the
   * write. A governed write's commit capability lives 60 s; the corridor's real PortWatch history (~8,900 evidence versions, each a governed
   * retrieval) takes minutes to assemble, and inside the write it lapsed the capability (the route answered 500 after the history was read).
   * The plan is READ first (prediction.registry.plan.read): a refused plan assembles nothing. The write uses the assembly only when it
   * matches exactly (series, known-at, observed-through); otherwise it assembles itself, as before.
   */
  async preAssembleRouted(reader: Reader, a: RoutedIssueRequest): Promise<PreAssembly> {
    const r = await this.series.readAs(reader, 'prediction.registry.plan.read', 'FMR', null, RegistryCapability.read, async (cap) => {
      const knownAt = a.knownAt ?? await cap.now();
      return { knownAt, plan: planOf(await cap.plan({ tenantId: reader.tenantId, domainId: reader.domainId, targetKey: a.targetKey, seriesKey: a.seriesKey, horizonCode: a.horizonCode, knownAt, cutoff: a.observedThrough })) };
    });
    if (r.plan.refusal !== null || !r.plan.methods.some((m) => m.available)) return { knownAt: r.knownAt, assembled: null };
    return { knownAt: r.knownAt, assembled: await this.series.assemble(reader, r.plan.series_key, r.knownAt, a.observedThrough) };
  }
  async preAssembleValidation(reader: Reader, a: ValidationRequest): Promise<PreAssembly> {
    const r = await this.series.readAs(reader, 'prediction.registry.read', 'FMR', null, RegistryCapability.read, async (cap) => {
      const knownAt = a.knownAt ?? await cap.now();
      let seriesKey = a.seriesKey;
      if (seriesKey === null && a.targetKey !== null) {
        const t = (await cap.targets()).filter((x) => x['target_key'] === a.targetKey && x['state'] === 'approved').sort((x, y) => Number(y['version']) - Number(x['version']))[0];
        seriesKey = str(rec(t?.['definition'])['series_key']);
      }
      return { knownAt, seriesKey };
    });
    if (r.seriesKey === null) return { knownAt: r.knownAt, assembled: null };
    return { knownAt: r.knownAt, assembled: await this.series.assemble(reader, r.seriesKey, r.knownAt, a.observedThrough) };
  }
  private preFor(pre: PreAssembly | null, seriesKey: string, knownAt: string, observedThrough: string | null): AssembledSeries | undefined {
    const x = pre?.assembled ?? null;
    return x !== null && x.series.series_key === seriesKey && x.knownAt === knownAt && x.observedThrough === observedThrough ? x : undefined;
  }

  /**
   * THE ROUTED ISSUE. Answers the issued forecast, or `refused` (the route and the ledger committed by the caller's write, the refusal then
   * answered). Never issues a method the plan did not make available, never at a horizon the policy does not support.
   */
  async issueRouted(cap: PortfolioIssueCap, ctx: ScopeContext, reader: Reader, a: RoutedIssueRequest, actor: string, correlationId: string, purposeId: string, forecastId: string,
    pre: PreAssembly | null = null):
    Promise<{ refused: { route_id: string; refusal: string; refusal_class: string; quarantined: string | null; plan: Plan } | null; forecast: Row | null; plan: Plan }> {
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const knownAt = a.knownAt ?? pre?.knownAt ?? await cap.route.now();   // B25 act-found: the instant the pre-assembly read at
    const routeId = newId();
    const plan = planOf(await cap.route.recordRoute({ routeId, tenantId, domainId, targetKey: a.targetKey, seriesKey: a.seriesKey, horizonCode: a.horizonCode, knownAt, cutoff: a.observedThrough,
      forecastId, actor, correlationId }));
    if (plan.refusal !== null) return { refused: { route_id: routeId, refusal: plan.refusal, refusal_class: plan.refusal_class ?? 'horizon', quarantined: null, plan }, forecast: null, plan };
    const chosen = a.methodRef === null ? plan.methods.find((m) => m.available) : plan.methods.find((m) => m.method_ref === a.methodRef);
    if (chosen === undefined || !chosen.available) {
      refuse('forecast', 'method', a.methodRef === null ? 'the plan has no available method' : `${a.methodRef} is ${chosen === undefined ? 'not in the plan' : `unavailable in the plan — ${chosen.unavailable_reason ?? ''}`} for ${plan.target_key ?? plan.series_key} at ${a.horizonCode}; the plan offers ${plan.methods.filter((m) => m.available).map((m) => m.method_ref).join(', ') || 'nothing available'}`, correlationId);
    }
    const entry = chosen as PlanMethod;
    const refusedAfter = (refusal: string, cls: string, quarantined: string | null) => ({ refused: { route_id: routeId, refusal, refusal_class: cls, quarantined, plan }, forecast: null, plan });
    // THE PINNED IMPLEMENTATION: an entry approved for other bytes is not run by this build — quarantined until a steward approves a version for it.
    const code = codeDigestOf(entry.implementation_ref);
    if (code === undefined || code !== entry.implementation_digest) {
      const reason = `implementation digest mismatch: ${entry.method_ref} was approved for ${entry.implementation_ref} ${entry.implementation_digest.slice(0, 12)}…, this build carries ${code === undefined ? 'no such implementation' : `${code.slice(0, 12)}…`}`;
      await cap.route.quarantine({ tenantId, domainId, methodRef: entry.method_ref, reason, actor, correlationId });
      const refusal = `forecast rejected (method): ${entry.method_ref} is quarantined — ${reason}; a steward approves a version for this build`;
      await this.refuseRoute(cap, routeId, tenantId, domainId, refusal, 'method', actor, correlationId);
      return refusedAfter(refusal, 'method', entry.method_ref);
    }

    // THE CONTEXT (§CX's seam; the prelude's null default leaves the forecast ungrounded) and THE ENVIRONMENT (V03-T-196; null by default).
    const frozen = await this.freezer.freeze(cap.seamTx, { tenantId, domainId, seriesKey: plan.series_key, subjectEntityId: plan.target?.subject_entity_id ?? null, targetKey: plan.target_key,
      knownAt, observedThrough: a.observedThrough, assumptions: a.assumptions, actor, correlationId });
    const environment = this.freezer.environment(entry.method_ref);
    /* B25 completion (G7, AI-48-002): the EVALUATION PROFILE the forecast is issued under (the policy and version, the horizon, the validation
       requirement of the policy's kind rule, the applicable validation record the plan found) and the TARGET VERSION with its definition's
       digest — pinned on the row (horizon_policy, outcome_spec) and in the FCT@v2 package (horizon_policy, outcome). */
    const evaluationProfile = evaluationProfileOf(plan, entry, a.horizonCode);
    const targetPin = targetPinOf(plan.target);
    const horizonPolicy = { policy_id: plan.policy.policy_id, version: plan.policy.version, risk_class: plan.policy.risk_class, horizon: a.horizonCode,
      confidence_language: plan.confidence_language, treatment: plan.treatment, legacy: plan.policy.legacy === true, route_id: routeId, evaluation_profile: evaluationProfile };
    const columns: Row = { forecast_kind: plan.forecast_kind, target_key: plan.target_key, method_ref: entry.method_ref, horizon_policy: horizonPolicy,
      ...(frozen === null ? {} : { information_set_id: frozen.informationSetId }), ...(environment === null ? {} : { environment: { digest: environment.digest, ...environment.facts } }) };
    const planned = plan.methods.map((m) => ({ method_ref: m.method_ref, family: m.family, available: m.available, reason: m.unavailable_reason }));
    const sections: Row = { forecast_kind: plan.forecast_kind, target_key: plan.target_key, method_ref: entry.method_ref, horizon_policy: { ...horizonPolicy, planned },
      ...(frozen === null ? {} : { information_set: { id: frozen.informationSetId, manifest_digest: frozen.manifestDigest, graph: frozen.graph, twin: frozen.twin,
        feature_keys: frozen.features.map((f) => f.key), coverage_gaps: frozen.coverageGaps } }),
      ...(environment === null ? {} : { environment: { digest: environment.digest, ...environment.facts } }) };

    if (entry.family === 'statistical') {
      // THE LEGACY PATH, UNCHANGED: ForecastingService.issue with its leash and its validation; the B25 columns and sections ride along.
      const method = entry.method_key === 'holt_winters' ? HOLT_WINTERS : SEASONAL_NAIVE;
      const outcomeSpec = { type: 'quantity', series_key: plan.series_key, aggregation: 'value', target_key: plan.target_key, target: targetPin };
      const assembledPre = this.preFor(pre, plan.series_key, knownAt, a.observedThrough);
      const r = await this.forecasting.issue(cap.forecast, ctx, reader, { seriesKey: plan.series_key, horizonCode: a.horizonCode, knownAt, observedThrough: a.observedThrough,
        assumptions: a.assumptions, refreshCadence: a.refreshCadence, label: a.label, method, ...(assembledPre === undefined ? {} : { assembled: assembledPre }),
        b25: { columns: { ...columns, outcome_spec: outcomeSpec }, payload: { ...sections, outcome: { ...outcomeSpec, family: 'statistical', language: plan.confidence_language } } } },
        actor, correlationId, purposeId, forecastId);
      const bound = await cap.route.bindRoute({ routeId, tenantId, domainId, actor, correlationId });
      return { refused: null, plan, forecast: { forecastId, method_ref: entry.method_ref, family: entry.family, forecast_kind: plan.forecast_kind, validation_state: r.validationState,
        validation_note: r.validationNote, backtest_id: r.backtestId, statement: r.statement, quantiles: r.quantiles, target_at: r.targetAt, origin_at: r.originAt, route: bound,
        information_set_id: frozen?.informationSetId ?? null, environment_digest: environment?.digest ?? null,
        /* integration (B25 fold): what ForecastIssued@v2 announces (a QUANTITY forecast; built from the issue's own answer) */
        announce: { seriesKey: plan.series_key, subjectEntityId: r.subjectEntityId, horizon: a.horizonCode, horizonDays: r.horizonDays, method: r.method, methodVersion: r.methodVersion,
                    baselineMethod: r.baselineMethod, validationState: r.validationState, validationNote: r.validationNote, backtestId: r.backtestId, skill: r.skill, label: a.label,
                    originAt: r.originAt, knownAt, targetAt: r.targetAt, observedThrough: r.observedThrough, issuedAt: r.issuedAt, refreshCadence: a.refreshCadence,
                    quantiles: r.quantiles, unit: r.unit, drivers: r.drivers, assumptions: r.assumptions, evidenceRefs: r.evidenceRefs,
                    controls: { synthetic_state: r.controls.synthetic_state, classification: r.controls.classification } } } };
    }

    const series = await cap.route.series(plan.series_key);
    if (series === null) refuse('forecast', 'unknown_series', `${plan.series_key} is not a series registered in this domain`, correlationId, 404);
    const assembled = this.preFor(pre, plan.series_key, knownAt, a.observedThrough) ?? await this.series.assemble(reader, plan.series_key, knownAt, a.observedThrough);   // B25 act-found
    if (!assembled.complete) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId, `${assembled.unreadable.length} evidence version(s) of ${plan.series_key} could not be read by this reader; a forecast on an incomplete history is refused`), 409);
    }
    if (assembled.points.length < 8) refuse('forecast', 'history', `${plan.series_key} has ${assembled.points.length} observation(s) known at ${knownAt}; a forecast needs at least 8`, correlationId);
    const points: Point[] = assembled.points.map((p) => ({ date: p.date, value: p.value }));
    const originAt = points[points.length - 1]!.date;
    const horizonDays = HORIZONS[a.horizonCode] as number;
    const targetAt = addDays(originAt, horizonDays);
    let result: FamilyResult;
    try {
      result = runFamily(entry, { points, seriesKey: plan.series_key, seriesUnit: assembled.series.unit, seasonality: assembled.series.seasonality_days, horizonCode: a.horizonCode,
        horizonDays, originAt, targetAt, kind: plan.forecast_kind, target: plan.target,
        features: frozen?.features ?? null, subjectEntityId: assembled.series.subject_entity_id });   // B25 completion (G1, G4): the frozen features; the series' subject
    } catch (e) {
      if (e instanceof FamilyRefusal) {
        await this.refuseRoute(cap, routeId, tenantId, domainId, e.message, e.refusalClass, actor, correlationId);
        return refusedAfter(e.message, e.refusalClass, null);
      }
      // A FAILURE of the method: quarantined until its steward reinstates it.
      const reason = `the routed run failed: ${(e as Error).message}`.slice(0, 600);
      await cap.route.quarantine({ tenantId, domainId, methodRef: entry.method_ref, reason, actor, correlationId });
      const refusal = `forecast rejected (method): ${entry.method_ref} failed on ${plan.series_key} at ${a.horizonCode} and is quarantined — ${(e as Error).message}`.slice(0, 900);
      await this.refuseRoute(cap, routeId, tenantId, domainId, refusal, 'method', actor, correlationId);
      return refusedAfter(refusal, 'method', entry.method_ref);
    }

    // VALIDATION STATE — from the plan's applicable record and the policy's language, nothing else.
    const synthetic = assembled.controls.synthetic_state === true;
    let validationState: string; let validationNote: string; let backtestId: string | null = null;
    const v = entry.validation;
    if (result.scenarioLanguage || plan.confidence_language === 'scenario_language') {
      validationState = 'scenario_language';
      validationNote = `SCENARIO LANGUAGE: at ${a.horizonCode} the horizon policy ${plan.policy.policy_id === null ? '(the legacy rule)' : `${plan.policy.risk_class} v${plan.policy.version}`} speaks of ${plan.forecast_kind}s, `
        + 'paths and option value in scenario language; NO empirical validation is claimed and none is implied. The probabilities are a declared judgement and counted evidence, shown with their weights.';
    } else if (v.backtest_id !== undefined && v.passed === true) {
      validationState = v.mode === 'historical' ? 'validated' : 'validated_retrospective';
      backtestId = v.backtest_id;
      validationNote = `${v.verdict ?? 'validated'} (${v.mode}, ${v.origins} origins, history to ${v.window_to}).`
        + (v.mode === 'historical' ? '' : ' RETROSPECTIVE: one evidence vintage cut by date at each origin — retrospective analysis, not historical-knowledge validation.')
        + (v.synthetic === true ? ' The validation history is SYNTHETIC: a SYNTHETIC DEMONSTRATION of the validation machinery — not empirical validation.' : ' The validation history is not synthetic: an empirical validation on this series.');
    } else if (points.length < MIN_HISTORY_FOR_BACKTEST) {
      validationState = 'validation_impossible';
      validationNote = `${points.length} observation(s) are known for ${plan.series_key} at this cut-off; a backtest needs at least ${MIN_HISTORY_FOR_BACKTEST}. Forecast quality CANNOT be established on this history and no accuracy is claimed.`;
    } else {
      validationState = 'unvalidated';
      validationNote = `no passed validation of ${entry.method_ref} at ${a.horizonCode} on ${plan.series_key} applies to this cut-off; the numbers are unscored.`;
    }

    const evidence = assembled.evidence.map((e) => ({ evidence_object_id: e.evidence_object_id, evidence_version: e.evidence_version, evidence_digest: e.evidence_digest }));
    const last = assembled.points[assembled.points.length - 1]!;
    const drivers = [{ series_key: plan.series_key, role: `the series, read by ${entry.method_ref} (${entry.family})`, share: null,
      evidence_object_id: last.evidence_object_id, evidence_version: last.evidence_version, evidence_digest: last.evidence_digest, attribution: assembled.attribution }];
    const statement = `${result.claim}; ${validationState.replace(/_/g, ' ')}.`
      + (a.label === 'replay demonstration' ? ' REPLAY DEMONSTRATION — not a live forecast.' : '')
      + (synthetic ? ' SYNTHETIC: at least one evidence version it rests on is synthetic.' : '');
    const outcomeSpec = { ...result.outcome, target_key: plan.target_key, family: entry.family, language: plan.confidence_language, target: targetPin };
    const quantiles = result.quantiles as Row;
    const hasBand = typeof quantiles['q50'] === 'number';
    const now = new Date().toISOString();
    const payload: Row = {
      series_key: plan.series_key, subject_entity_id: assembled.series.subject_entity_id, horizon: { code: a.horizonCode, days: horizonDays },
      origin_at: originAt, known_at: knownAt, target_at: targetAt,
      method: { name: entry.method_key, version: String(entry.version), parameters: result.parameters }, baseline_method: result.baselineMethod,
      distribution: result.distribution, drivers, assumptions: a.assumptions, evidence, refresh_cadence: a.refreshCadence,
      validation: { state: validationState, note: validationNote, backtest_id: backtestId, skill: null },
      label: a.label, statement, narrative: null, controls: assembled.controls, outcome: outcomeSpec, ...sections,
    };
    const header: CanonicalHeader = {
      object_id: forecastId, object_type: 'FCT', tenant_id: tenantId, domain_id: domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-PRD-01', accountable_owner: `principal:${actor}`,
      source_object_ids: evidence.slice(0, 64).map((e) => `EVD:${e.evidence_object_id}@${e.evidence_version}`),
      event_time: `${targetAt}T00:00:00.000Z`, observation_time: now, valid_from: `${originAt}T00:00:00.000Z`, valid_to: `${targetAt}T00:00:00.000Z`, recorded_at: now,
      time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'inferred', synthetic_state: synthetic, confidence: null,
      uncertainty: hasBand ? { q10: quantiles['q10'], q50: quantiles['q50'], q90: quantiles['q90'] } : { categories: (result.distribution['categories'] ?? []) as unknown },
      evidence_refs: evidence.slice(0, 64).map((e) => `EVD:${e.evidence_object_id}@${e.evidence_version}`),
      provenance_ref: `series:${plan.series_key}`, method_ref: entry.method_ref, contradiction_refs: [], corroboration_refs: [], human_refs: [],
      classification: assembled.controls.classification, purpose_scope: purposeId, rights_profile: assembled.controls.rights_profile ?? assembled.attribution,
      residency_profile: assembled.controls.residency_profile, retention_profile: assembled.controls.retention_profile, access_policy_ref: assembled.controls.access_policy_ref,
      quality_profile: null, quality_state: { validation: validationState }, freshness_state: { freshest_evidence_recorded_at: assembled.freshestRecordedAt, origin_at: originAt },
      schema_ref: 'FCT@v2', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const hv = validateHeader(header);
    if (!hv.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `forecast header invalid: ${(hv.errors ?? []).join('; ')}`), 422);
    await cap.forecast.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.forecast.issueForecast({
      forecastId, tenantId, domainId, seriesKey: plan.series_key, subjectEntityId: assembled.series.subject_entity_id, horizonCode: a.horizonCode, horizonDays,
      originAt, knownAt, targetAt, method: entry.method_key, methodVersion: entry.method_ref, baselineMethod: result.baselineMethod, quantiles: quantiles as Record<string, number>, path: [], drivers,
      assumptions: a.assumptions, evidenceRefs: evidence, refreshCadence: a.refreshCadence, validationState, validationNote, label: a.label, skill: null, statement,
      backtestId, controls: assembled.controls, actor, eventId: newId(), correlationId, extras: { ...columns, outcome_spec: outcomeSpec },
    });
    const bound = await cap.route.bindRoute({ routeId, tenantId, domainId, actor, correlationId });
    return { refused: null, plan, forecast: { forecastId, method_ref: entry.method_ref, family: entry.family, forecast_kind: plan.forecast_kind, validation_state: validationState,
      validation_note: validationNote, backtest_id: backtestId, statement, quantiles, distribution: result.distribution, outcome: outcomeSpec, target_at: targetAt, origin_at: originAt,
      confidence_language: plan.confidence_language, horizon_policy: horizonPolicy, route: bound, synthetic, information_set_id: frozen?.informationSetId ?? null,
      environment_digest: environment?.digest ?? null,
      /* integration (B25 fold): ForecastIssued@v2 carries a quantity distribution — announced for a QUANTITY forecast only; an event's probability
         or a state/regime's categories never travel as one (the interface's consumers compare quantiles with series thresholds) */
      ...(plan.forecast_kind !== 'quantity' ? {} : { announce: { seriesKey: plan.series_key, subjectEntityId: assembled.series.subject_entity_id, horizon: a.horizonCode, horizonDays,
        method: entry.method_key, methodVersion: entry.method_ref, baselineMethod: result.baselineMethod, validationState, validationNote, backtestId, skill: null, label: a.label,
        originAt, knownAt, targetAt, observedThrough: a.observedThrough, issuedAt: new Date().toISOString(), refreshCadence: a.refreshCadence,
        quantiles: quantiles as Record<string, number>, unit: assembled.series.unit, drivers, assumptions: a.assumptions, evidenceRefs: evidence,
        controls: { synthetic_state: assembled.controls.synthetic_state, classification: assembled.controls.classification } } }) } };
  }

  private async refuseRoute(cap: PortfolioIssueCap, routeId: string, tenantId: string, domainId: string, refusal: string, cls: string, actor: string, correlationId: string): Promise<void> {
    await cap.route.refuseRoute({ routeId, tenantId, domainId, refusal, refusalClass: cls, actor, correlationId });
  }

  /**
   * RUN AND RECORD A VALIDATION of one entry at one horizon on one series (and target): the event backtest for an event entry, the quantity
   * rolling-origin backtest for a bayesian one. The causal, optimisation and structural families are not validated by backtest (their
   * checks are the identification, feasibility and scenario-language disclosures each forecast carries); the statistical builtins by the
   * legacy backtest route.
   */
  async runValidation(cap: ValidationWrites, ctx: ScopeContext, reader: Reader, a: ValidationRequest, actor: string, correlationId: string, pre: PreAssembly | null = null): Promise<Row> {
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const knownAt = a.knownAt ?? pre?.knownAt ?? await cap.now();   // B25 act-found: the instant the pre-assembly read at
    const entry = (await cap.effective(tenantId, domainId)).find((m) => m['method_ref'] === a.methodRef);
    if (entry === undefined) refuse('forecast method', 'unknown_method', `${a.methodRef} is not a method of this domain's registry`, correlationId, 404);
    const e = entry as Row;
    const family = String(e['family']) as Family;
    if (family !== 'event' && family !== 'bayesian') {
      refuse('forecast method', 'validation', family === 'statistical'
        ? `${a.methodRef} is a legacy builtin: it is validated by the legacy rolling-origin backtest (POST …/prediction/backtests/run) and its leash`
        : `the ${family} family is not validated by backtest — its forecasts carry their own checks (${family === 'causal' ? 'identification, placebo, balance, sensitivity' : family === 'optimisation' ? 'feasibility and the optimality gap' : 'scenario language, the judgement and its sensitivity'})`, correlationId);
    }
    let target: TargetRow | null = null;
    if (a.targetKey !== null) {
      const t = (await cap.targets()).filter((x) => x['target_key'] === a.targetKey && x['state'] === 'approved').sort((x, y) => Number(y['version']) - Number(x['version']))[0];
      if (t === undefined) refuse('forecast method', 'unknown_target', `${a.targetKey} has no approved version in this domain`, correlationId, 404);
      target = t as unknown as TargetRow;
    }
    const seriesKey = a.seriesKey ?? str(rec(target?.definition)['series_key']);
    if (seriesKey === null) refuse('forecast method', 'request', 'a validation names a series or a target', correlationId);
    const horizonDays = HORIZONS[a.horizonCode] as number;
    const assembled = this.preFor(pre, seriesKey as string, knownAt, a.observedThrough) ?? await this.series.assemble(reader, seriesKey as string, knownAt, a.observedThrough);   // B25 act-found
    if (!assembled.complete) throw new HttpException(errorBody('EYE_STA_001', correlationId, `${assembled.unreadable.length} evidence version(s) could not be read; a validation on an incomplete history is refused`), 409);
    const points: Point[] = assembled.points.map((p) => ({ date: p.date, value: p.value }));
    if (points.length < 2) refuse('forecast method', 'history', `${seriesKey} has ${points.length} observation(s) known at ${knownAt}`, correlationId);
    const synthetic = assembled.controls.synthetic_state === true;
    const historyAt = a.mode === 'historical'
      ? async (origin: string): Promise<Point[] | null> => {
          const then = await this.series.assemble(reader, seriesKey as string, `${origin}T23:59:59.999Z`, origin);
          return then.complete ? then.points.map((p) => ({ date: p.date, value: p.value })) : null;
        }
      : undefined;
    let kind: 'event_backtest' | 'quantity_rolling_origin'; let origins: number; let passed: boolean; let verdict: string; let metrics: Row; let windowFrom: string | null; let windowTo: string | null; let details: Row;
    if (family === 'event') {
      const condition = eventConditionOf(target);
      const prior = rec(rec(e['declarations'])['prior']) as unknown as BetaPrior;
      const minWindows = Number(rec(e['parameters'])['min_windows'] ?? 6);
      if (a.mode === 'historical') {
        refuse('forecast method', 'validation', 'the event backtest runs retrospectively (one vintage, cut by date at each origin); the historical-knowledge mode is the quantity backtest\'s', correlationId);
      }
      const bt = eventBacktest(points, horizonDays, condition, prior, { origins: a.origins, stride: a.stride ?? horizonDays, minWindows, minOrigins: a.minOrigins });
      kind = 'event_backtest'; origins = bt.origins; passed = bt.passed; verdict = bt.verdict;
      metrics = { brier: bt.brier, log_score: bt.logScore, reference_brier: bt.referenceBrier, brier_skill: bt.brierSkill, mean_probability: bt.meanProbability,
                  observed_frequency: bt.observedFrequency, calibration_gap: bt.calibrationGap, reliability: bt.reliability };
      windowFrom = bt.windowFrom; windowTo = bt.windowTo; details = { rows: bt.rows.slice(-40), condition, prior, window_days: horizonDays };
    } else {
      const decl = rec(e['declarations']) as unknown as BayesDeclarations;
      const minTrainDays = a.minTrainDays ?? 730;
      const stride = a.stride ?? Math.max(30, Math.round(horizonDays / 24));
      const r = await rollingOrigin(points, {
        horizonDays, origins: a.origins, stride, minTrainDays, minOrigins: a.minOrigins,
        forecast: (train, _o, t) => bayesForecast(train, { ...decl, alternatives: [] }, t).band,
        actual: (all, t) => bayesActual(all, decl.prior, t),
        reference: (train) => bayesClimatology(train, decl.prior),
        ...(historyAt === undefined ? {} : { historyAt }),
      });
      kind = 'quantity_rolling_origin'; origins = r.origins; passed = r.passed; verdict = r.verdict;
      metrics = { coverage: r.coverage, pinball: r.pinball, reference_coverage: r.referenceCoverage, reference_pinball: r.referencePinball, skill: r.skill, t1: r.t1,
                  unknowable: r.unknowable, unfitted: r.unfitted };
      windowFrom = r.windowFrom; windowTo = r.windowTo; details = { rows: r.rows.slice(-40), stride, min_train_days: minTrainDays, needed: r.needed, model: decl.prior.model };
    }
    // a validation that scored nothing still records the history it looked at (from < to)
    const from = windowFrom ?? points[0]!.date; const to = windowTo !== null && windowTo > from ? windowTo : addDays(from, 1);
    const claim = synthetic ? 'SYNTHETIC DEMONSTRATION — the history is synthetic: this proves the validation machinery, not the method on real data'
      : (passed ? 'EMPIRICAL VALIDATION on this series\' recorded history' : 'not passed: no validation is claimed');
    const discipline = a.mode === 'historical'
      ? 'HISTORICAL KNOWLEDGE: every origin read only evidence recorded by the end of its own day; an origin with no such history is unknowable, not fitted.'
      : `RETROSPECTIVE: one evidence vintage known at ${knownAt}, cut by date at each origin — retrospective analysis, not historical-knowledge validation.`;
    const validationId = newId(); const backtestId = newId();
    const recorded = await cap.record({ validationId, backtestId, tenantId, domainId, methodRef: a.methodRef, targetKey: a.targetKey, seriesKey: seriesKey as string, horizonCode: a.horizonCode,
      horizonDays, kind, mode: a.mode, origins, minOrigins: a.minOrigins, metrics, passed, verdict: `${verdict} ${claim}.`, windowFrom: from, windowTo: to, knownAt,
      observations: points.length, synthetic, discipline, details, actor, correlationId });
    return { ...recorded, claim, discipline };
  }
}

/** B25 completion (G7): the target version a forecast is OF, with the digest of the definition it was computed against (null: no target). */
export function targetPinOf(t: TargetRow | null): Row | null {
  return t === null ? null : { target_key: t.target_key, version: Number(t.version), kind: t.kind, unit: t.unit, definition_digest: canonicalDigest(t.definition ?? {}) };
}
/** B25 completion (G7): the evaluation profile — the horizon policy and its version, the validation requirement, the applicable record. */
export function evaluationProfileOf(plan: Plan, entry: PlanMethod, horizon: string): Row {
  const v = entry.validation;
  return {
    policy: { policy_id: plan.policy.policy_id, version: plan.policy.version, risk_class: plan.policy.risk_class, legacy: plan.policy.legacy === true },
    horizon, forecast_kind: plan.forecast_kind, confidence_language: plan.confidence_language,
    validation_requirement: rec(plan.policy.kind_rule)['validation'] ?? { required: false },
    validation_ref: v.validation_id === undefined && v.backtest_id === undefined ? null
      : { validation_id: v.validation_id ?? null, backtest_id: v.backtest_id ?? null, mode: v.mode ?? null, origins: v.origins ?? null, passed: v.passed ?? null, synthetic: v.synthetic ?? null, window_to: v.window_to ?? null },
    statement: v.validation_id === undefined && v.backtest_id === undefined
      ? `no validation record applies to ${entry.method_ref} at ${horizon}; the forecast's validation state says what is (not) claimed`
      : `${entry.method_ref} at ${horizon} is evaluated against validation ${v.validation_id ?? v.backtest_id} (${v.mode ?? 'retrospective'}, ${v.origins ?? '?'} origins, ${v.passed === true ? 'passed' : 'not passed'})`,
  };
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
