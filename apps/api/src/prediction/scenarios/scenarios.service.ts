/**
 * SCENARIOS, INDICATORS AND WARNINGS.
 *
 * A scenario tree is DECLARED by a person: a baseline and named branches, each
 * with an indicator that would flip it, a signpost, an owner, a review cadence
 * and a consequence. A branch flips when its indicator breaches — the flip is
 * an event with a receipt (D5) — and a WARNING follows: evidence, consequence,
 * confidence and a response window, routed to the branch's named owner (D6).
 *
 * The evaluator reads the indicator's series through the known-at path and
 * feeds each NEW observation to the port in order, so a run of consecutive
 * days is counted exactly as the publisher dated it.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { PredictionReads, ScenarioWrites, IndicatorWrites, EvaluationWrites, WarningWrites,
  AcknowledgeWrites } from '../prediction.capabilities.js';
import { SeriesService, dayOf, type Reader } from '../series/series.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BranchIntake {
  name: string; kind: 'baseline' | 'upside' | 'downside'; statement: string; indicatorId: string | null;
  signpost: string | null; owner: string; reviewCadence: string; responseWindowHours: number; consequence: string;
}

export interface ScenarioIntake {
  title: string; statement: string; forecastId: string | null; subjectEntityId: string | null;
  owner: string; reviewCadence: string; branches: BranchIntake[];
}

export function validateScenario(m: Partial<ScenarioIntake>, correlationId: string): ScenarioIntake {
  const bad = (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
  if (typeof m.title !== 'string' || m.title.trim().length < 2 || m.title.length > 256) bad('title must be between 2 and 256 characters');
  if (typeof m.statement !== 'string' || m.statement.trim().length < 2 || m.statement.length > 4096) bad('statement must be between 2 and 4096 characters');
  if (typeof m.owner !== 'string' || !UUID.test(m.owner)) bad('owner must be a principal id');
  if (typeof m.reviewCadence !== 'string' || m.reviewCadence.trim().length < 2) bad('review_cadence is required');
  if (m.forecastId != null && !UUID.test(m.forecastId)) bad('forecast_id must be a uuid');
  const branches = Array.isArray(m.branches) ? m.branches : [];
  if (branches.length === 0) bad('a scenario tree needs at least one branch');
  if (!branches.some((b) => b.kind === 'baseline')) bad('a scenario tree needs a baseline branch');
  for (const b of branches) {
    if (typeof b.name !== 'string' || b.name.trim().length < 2) bad('every branch needs a name');
    if (!['baseline', 'upside', 'downside'].includes(b.kind)) bad("branch kind must be 'baseline', 'upside' or 'downside'");
    if (typeof b.statement !== 'string' || b.statement.trim().length < 2) bad('every branch needs a statement');
    if (b.kind !== 'baseline' && (typeof b.indicatorId !== 'string' || !UUID.test(b.indicatorId))) {
      bad(`branch "${b.name}" can flip and must name the indicator that flips it`);
    }
    if (typeof b.owner !== 'string' || !UUID.test(b.owner)) bad(`branch "${b.name}" needs a named owner`);
    if (typeof b.consequence !== 'string' || b.consequence.trim().length < 8) bad(`branch "${b.name}" needs a consequence of at least 8 characters`);
    if (typeof b.responseWindowHours !== 'number' || b.responseWindowHours < 1) bad(`branch "${b.name}" needs a response window in hours`);
  }
  return {
    title: m.title as string, statement: m.statement as string, forecastId: m.forecastId ?? null,
    subjectEntityId: m.subjectEntityId ?? null, owner: m.owner as string, reviewCadence: m.reviewCadence as string,
    branches: branches.map((b) => ({
      name: b.name, kind: b.kind, statement: b.statement, indicatorId: b.indicatorId ?? null, signpost: b.signpost ?? null,
      owner: b.owner, reviewCadence: b.reviewCadence ?? (m.reviewCadence as string),
      responseWindowHours: b.responseWindowHours, consequence: b.consequence })),
  };
}

@Injectable()
export class ScenariosService {
  constructor(private readonly series: SeriesService) {}

  async declare(
    cap: ScenarioWrites, ctx: ScopeContext, intake: ScenarioIntake, actor: string, correlationId: string, purposeId: string,
    scenarioId: string = newId(),
  ): Promise<{ scenarioId: string; branches: Array<{ branchId: string; name: string; kind: string }> }> {
    const branches = intake.branches.map((b) => ({ ...b, branchId: newId() }));
    const now = new Date().toISOString();
    const payload = {
      title: intake.title, statement: intake.statement, forecast_id: intake.forecastId,
      subject_entity_id: intake.subjectEntityId, owner: `principal:${intake.owner}`, review_cadence: intake.reviewCadence,
      branches: branches.map((b) => ({
        branch_id: b.branchId, name: b.name, kind: b.kind, statement: b.statement,
        indicator: b.indicatorId === null ? null : { indicator_id: b.indicatorId }, signpost: b.signpost,
        owner: `principal:${b.owner}`, review_cadence: b.reviewCadence, response_window_hours: b.responseWindowHours,
        consequence: b.consequence })),
    };
    const header: CanonicalHeader = {
      object_id: scenarioId, object_type: 'SCN', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-PRD-01', accountable_owner: `principal:${intake.owner}`,
      source_object_ids: intake.forecastId === null ? [] : [`FCT:${intake.forecastId}@1`],
      event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now,
      time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'asserted', synthetic_state: false,
      confidence: null, uncertainty: null, evidence_refs: intake.forecastId === null ? [] : [`forecast:${intake.forecastId}`],
      provenance_ref: `principal:${intake.owner}`, method_ref: 'human-declaration@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${intake.owner}`], classification: 'internal',
      purpose_scope: purposeId, rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'SCN@v1', ontology_ref: null,
      correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `scenario header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.declareScenario({
      scenarioId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, title: intake.title,
      statement: intake.statement, forecastId: intake.forecastId, subjectEntityId: intake.subjectEntityId,
      owner: intake.owner, reviewCadence: intake.reviewCadence, actor, eventId: newId(), correlationId,
    });
    for (const b of branches) {
      await cap.addBranch({
        branchId: b.branchId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, scenarioId,
        name: b.name, kind: b.kind, statement: b.statement, indicatorId: b.indicatorId, signpost: b.signpost,
        owner: b.owner, reviewCadence: b.reviewCadence, responseHours: b.responseWindowHours, consequence: b.consequence,
        actor, eventId: newId(), correlationId,
      });
    }
    return { scenarioId, branches: branches.map((b) => ({ branchId: b.branchId, name: b.name, kind: b.kind })) };
  }

  async defineIndicator(
    cap: IndicatorWrites, ctx: ScopeContext,
    a: { seriesKey: string; description: string; comparator: string; threshold: number; consecutiveDays: number; owner: string },
    actor: string, correlationId: string,
  ): Promise<{ indicatorId: string }> {
    if (!['<', '<=', '>', '>='].includes(a.comparator)) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, "comparator must be one of '<', '<=', '>', '>='"), 422);
    }
    if (!Number.isFinite(a.threshold)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'threshold must be a number'), 422);
    if (!Number.isInteger(a.consecutiveDays) || a.consecutiveDays < 1) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'consecutive_days must be a positive integer'), 422);
    }
    const indicatorId = newId();
    await cap.defineIndicator({
      indicatorId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, seriesKey: a.seriesKey,
      description: a.description, comparator: a.comparator, threshold: a.threshold, consecutiveDays: a.consecutiveDays,
      owner: a.owner, actor, correlationId,
    });
    return { indicatorId };
  }

  /**
   * Evaluate one indicator against every observation NEWER than the last one it
   * saw, in date order, as known at `knownAt`. Returns every flip the port
   * recorded so the caller can raise the warnings that follow.
   */
  async evaluate(
    cap: EvaluationWrites, ctx: ScopeContext, reader: Reader, indicatorId: string, knownAt: string, actor: string, correlationId: string,
  ): Promise<{ evaluated: number; breached: boolean; streak: number; flips: Array<{ branchId: string; flipEventId: string; observationAt: string; value: number; evidenceObjectId: string; evidenceVersion: number }> }> {
    const ind = (await cap.readIndicators().selectAll()
      .where('indicator_id' as never, '=', indicatorId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (ind === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized indicator matches'), 404);
    const assembled = await this.series.assemble(reader, String(ind['series_key']), knownAt, null);
    const last = dayOf(ind['last_observation_at']);
    const fresh = assembled.points.filter((p) => last === null || p.date > last);
    const flips: Array<{ branchId: string; flipEventId: string; observationAt: string; value: number; evidenceObjectId: string; evidenceVersion: number }> = [];
    let breached = ind['breached'] === true; let streak = Number(ind['streak'] ?? 0);
    for (const p of fresh) {
      const rows = await cap.evaluateIndicator({
        evaluationId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, indicatorId, knownAt,
        observationAt: p.date, value: p.value, evidenceObjectId: p.evidence_object_id, evidenceVersion: p.evidence_version,
        actor, correlationId,
      });
      for (const r of rows) {
        breached = r.breached; streak = r.streak;
        if (r.flipped_branch_id !== null && r.flip_event_id !== null) {
          flips.push({ branchId: r.flipped_branch_id, flipEventId: r.flip_event_id, observationAt: p.date, value: p.value,
                       evidenceObjectId: p.evidence_object_id, evidenceVersion: p.evidence_version });
        }
      }
    }
    return { evaluated: fresh.length, breached, streak, flips };
  }

  /**
   * The warning that follows a flip: routed to the branch's owner, with the
   * branch's response window, citing the flip event and the evidence that
   * breached the indicator.
   */
  async warnForFlip(
    cap: WarningWrites, ctx: ScopeContext,
    flip: { branchId: string; flipEventId: string; observationAt: string; value: number; evidenceObjectId: string; evidenceVersion: number },
    confidence: number, actor: string, correlationId: string, purposeId: string, now = new Date(),
    warningId: string = newId(),
  ): Promise<{ warningId: string; routedTo: string; closesAt: string }> {
    const branch = (await cap.readBranches().selectAll()
      .where('branch_id' as never, '=', flip.branchId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (branch === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized branch matches'), 404);
    const scenario = (await cap.readScenarios().selectAll()
      .where('scenario_id' as never, '=', String(branch['scenario_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const indicator = (await cap.readIndicators().selectAll()
      .where('indicator_id' as never, '=', String(branch['indicator_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const hours = Number(branch['response_window_hours'] ?? 72);
    const opensAt = now.toISOString();
    const closesAt = new Date(now.getTime() + hours * 3_600_000).toISOString();
    const routedTo = String(branch['owner_principal_id']);
    const title = `${String(scenario?.['title'] ?? 'scenario')} — branch "${String(branch['name'])}" flipped`;
    const evidence = [{ kind: 'evidence', evidence_object_id: flip.evidenceObjectId, evidence_version: flip.evidenceVersion,
                        observation_at: flip.observationAt, value: flip.value },
                      { kind: 'flip_event', event_id: flip.flipEventId, branch_id: flip.branchId },
                      { kind: 'indicator', indicator_id: String(branch['indicator_id']),
                        rule: indicator === undefined ? null
                          : `${String(indicator['series_key'])} ${String(indicator['comparator'])} ${String(indicator['threshold'])} for ${String(indicator['consecutive_days'])} consecutive observation(s)` }];
    const payload = {
      title, branch_id: flip.branchId, indicator_id: String(branch['indicator_id']),
      forecast_id: scenario?.['forecast_id'] ?? null, flip_event_id: flip.flipEventId,
      evidence, consequence: String(branch['consequence']), confidence,
      response_window: { opens_at: opensAt, closes_at: closesAt }, routed_to: `principal:${routedTo}`,
    };
    const header: CanonicalHeader = {
      object_id: warningId, object_type: 'WRN', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-PRD-01', accountable_owner: `principal:${routedTo}`,
      source_object_ids: [`EVD:${flip.evidenceObjectId}@${flip.evidenceVersion}`],
      event_time: `${flip.observationAt}T00:00:00.000Z`, observation_time: opensAt, valid_from: opensAt, valid_to: closesAt,
      recorded_at: opensAt, time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'inferred',
      synthetic_state: false, confidence: { value: confidence }, uncertainty: null,
      evidence_refs: [`EVD:${flip.evidenceObjectId}@${flip.evidenceVersion}`, `flip:${flip.flipEventId}`],
      provenance_ref: `branch:${flip.branchId}`, method_ref: 'indicator-breach@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: purposeId,
      rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null, quality_profile: null,
      quality_state: null, freshness_state: null, schema_ref: 'WRN@v1', ontology_ref: null, correction_of: null,
      supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `warning header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.raiseWarning({
      warningId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, branchId: flip.branchId,
      indicatorId: String(branch['indicator_id']), forecastId: scenario?.['forecast_id'] === undefined ? null : (scenario['forecast_id'] as string | null),
      title, evidence, consequence: String(branch['consequence']), confidence, opensAt, closesAt, routedTo,
      actor, eventId: newId(), correlationId,
    });
    return { warningId, routedTo, closesAt };
  }

  async acknowledge(cap: AcknowledgeWrites, ctx: ScopeContext, warningId: string, note: string, actor: string, correlationId: string): Promise<string> {
    if (note.trim().length < 4) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'an acknowledgement needs a note'), 422);
    return cap.acknowledgeWarning({ warningId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, note, actor, eventId: newId(), correlationId });
  }

  async listScenarios(cap: PredictionReads): Promise<Array<Record<string, unknown>>> {
    const scenarios = (await cap.readScenarios().selectAll().orderBy('declared_at' as never, 'desc').execute()) as Array<Record<string, unknown>>;
    const branches = (await cap.readBranches().selectAll().execute()) as Array<Record<string, unknown>>;
    return scenarios.map((s) => ({ ...s, branches: branches.filter((b) => String(b['scenario_id']) === String(s['scenario_id'])) }));
  }

  async getScenario(cap: PredictionReads, scenarioId: string): Promise<Record<string, unknown> | undefined> {
    const s = (await cap.readScenarios().selectAll().where('scenario_id' as never, '=', scenarioId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (s === undefined) return undefined;
    const branches = (await cap.readBranches().selectAll().where('scenario_id' as never, '=', scenarioId as never).execute()) as Array<Record<string, unknown>>;
    const events = (await cap.readScenarioEvents().selectAll().where('scenario_id' as never, '=', scenarioId as never).orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
    const indicators = (await cap.readIndicators().selectAll().execute()) as Array<Record<string, unknown>>;
    return { ...s, branches: branches.map((b) => ({ ...b, indicator: indicators.find((i) => String(i['indicator_id']) === String(b['indicator_id'])) ?? null })), events };
  }

  async listIndicators(cap: PredictionReads): Promise<Array<Record<string, unknown>>> {
    return (await cap.readIndicators().selectAll().orderBy('defined_at' as never, 'desc').execute()) as Array<Record<string, unknown>>;
  }

  async listWarnings(cap: PredictionReads, limit = 100): Promise<Array<Record<string, unknown>>> {
    return (await cap.readWarnings().selectAll().orderBy('raised_at' as never, 'desc').limit(Math.min(limit, 500)).execute()) as Array<Record<string, unknown>>;
  }

  async getWarning(cap: PredictionReads, warningId: string): Promise<Record<string, unknown> | undefined> {
    const w = (await cap.readWarnings().selectAll().where('warning_id' as never, '=', warningId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (w === undefined) return undefined;
    const events = (await cap.readWarningEvents().selectAll().where('warning_id' as never, '=', warningId as never).orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
    return { ...w, events };
  }
}
