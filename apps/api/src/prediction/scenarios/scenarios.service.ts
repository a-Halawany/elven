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
 *
 * CONTROLS ARE INHERITED, never declared: a scenario carries the controls of
 * the forecast it rests on; a warning folds the scenario's with those of the
 * evidence that breached. A flip's warning is an OBLIGATION recorded with the
 * flip (`warning_state = 'owed'`) and discharged exactly once per flip.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { PredictionReads, ScenarioWrites, IndicatorWrites, EvaluationWrites, WarningWrites,
  AcknowledgeWrites } from '../prediction.capabilities.js';
import { SeriesService, dayOf, type AssembledSeries, type Reader } from '../series/series.service.js';
import { foldControls, controlsOf, type Controls } from '../controls.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SCENARIO KIND VOCABULARY v1 (migration 0058; Volume 0 ch. 14, C-022). A branch records the
 * version it was declared under; a later change to this set is a new version, never a rewrite.
 */
export const SCENARIO_KINDS_V1 = ['baseline', 'upside', 'downside', 'disruption', 'stress', 'adversarial', 'counterfactual', 'user-defined'] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS_V1)[number];
export const SCENARIO_KIND_VOCABULARY_VERSION = 1;

/**
 * WARNING LEVELS (migration 0061; register R-4 (1)). Four levels derived by a VERSIONED rule from
 * the C0–C4 class of the consequence a branch's flip reaches — the derivation lives in the
 * database (prediction.derive_warning_level) and is not copied here; these are the vocabularies a
 * reader may rely on. Confidence stays the numeric it is, and the C0–C4 class of the raise
 * OPERATION is recorded beside the label and never read by the derivation: a label never changes
 * decision authority.
 */
export const CONSEQUENCE_CLASSES_V1 = ['C0', 'C1', 'C2', 'C3', 'C4'] as const;
export type ConsequenceClass = (typeof CONSEQUENCE_CLASSES_V1)[number];
export const WARNING_LEVELS_V1 = ['low', 'normal', 'high', 'critical'] as const;
export const WARNING_URGENCIES_V1 = ['routine', 'prompt', 'urgent', 'immediate'] as const;
export const WARNING_RESPONSES_V1 = ['acknowledge', 'acknowledge-and-act', 'act'] as const;

export interface BranchAssumption { statement: string; basis?: string | null }

export interface BranchIntake {
  name: string; kind: ScenarioKind; statement: string; indicatorId: string | null;
  /** The name a user-defined kind gives itself (required for, and only for, `user-defined`). */
  kindLabel?: string | null;
  /** How this branch diverges from the baseline — required for the five kinds 0058 adds; upside and downside diverge by their flip indicator. */
  divergence?: string | null;
  /** The branch's own assumption set. */
  assumptions?: BranchAssumption[];
  signpost: string | null; owner: string; reviewCadence: string; responseWindowHours: number; consequence: string;
  /** B2 (0061): the C0–C4 class of the consequence the flip reaches (Volume 5 ch. 58), declared by the declarer; null = not stated (assumed C2 at raise time, and said so). */
  consequenceClass?: ConsequenceClass | null;
  /**
   * The instant by which the decision the warning serves must be taken — set by
   * the declarer from the decision, not from the clock. Without it, timeliness
   * (T3) cannot be measured and is recorded as unmeasured.
   */
  decisionDeadline: string | null;
}

export interface Flip {
  branchId: string; flipEventId: string; observationAt: string; value: number; evidenceObjectId: string; evidenceVersion: number;
  /** The controls of the breaching evidence version, when the evaluator could see it; null means fold fail-closed. */
  evidenceControls: Controls | null;
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
    if (!(SCENARIO_KINDS_V1 as readonly string[]).includes(b.kind)) bad(`branch kind must be one of scenario kind vocabulary v${SCENARIO_KIND_VOCABULARY_VERSION}: ${SCENARIO_KINDS_V1.join(', ')}`);
    if (b.kind === 'user-defined' && (typeof b.kindLabel !== 'string' || b.kindLabel.trim().length < 2 || b.kindLabel.length > 64)) {
      bad(`branch "${b.name}" is user-defined and must name its kind (kindLabel, 2-64 characters)`);
    }
    if (b.kind !== 'user-defined' && b.kindLabel != null) bad(`branch "${b.name}": kindLabel belongs to a user-defined kind only`);
    // Upside and downside diverge by the indicator that flips them (0029's rule, below); the
    // five kinds added by 0058 state their divergence from the baseline in prose.
    const prose = !['baseline', 'upside', 'downside'].includes(b.kind);
    if (prose && (typeof b.divergence !== 'string' || b.divergence.trim().length < 8)) {
      bad(`branch "${b.name}" (${b.kind}) must say how it diverges from the baseline (divergence, at least 8 characters)`);
    }
    if (b.divergence != null && (typeof b.divergence !== 'string' || b.divergence.trim().length < 8)) bad(`branch "${b.name}": divergence, when given, is at least 8 characters`);
    const assumptions = b.assumptions ?? [];
    if (!Array.isArray(assumptions)) bad(`branch "${b.name}": assumptions must be a list`);
    for (const a of assumptions) {
      if (a === null || typeof a !== 'object' || typeof (a as BranchAssumption).statement !== 'string' || (a as BranchAssumption).statement.trim().length < 2) {
        bad(`branch "${b.name}": every assumption is an object with a statement of at least 2 characters`);
      }
    }
    if (typeof b.statement !== 'string' || b.statement.trim().length < 2) bad('every branch needs a statement');
    if (b.kind !== 'baseline' && (typeof b.indicatorId !== 'string' || !UUID.test(b.indicatorId))) {
      bad(`branch "${b.name}" can flip and must name the indicator that flips it`);
    }
    if (typeof b.owner !== 'string' || !UUID.test(b.owner)) bad(`branch "${b.name}" needs a named owner`);
    if (typeof b.consequence !== 'string' || b.consequence.trim().length < 8) bad(`branch "${b.name}" needs a consequence of at least 8 characters`);
    if (b.consequenceClass != null && !(CONSEQUENCE_CLASSES_V1 as readonly string[]).includes(b.consequenceClass as string)) {
      bad(`branch "${b.name}": consequenceClass must be one of C0–C4 (Volume 5 ch. 58) or omitted`);
    }
    if (typeof b.responseWindowHours !== 'number' || b.responseWindowHours < 1) bad(`branch "${b.name}" needs a response window in hours`);
    if (b.decisionDeadline != null && (typeof b.decisionDeadline !== 'string' || Number.isNaN(Date.parse(b.decisionDeadline)))) {
      bad(`branch "${b.name}": decisionDeadline must be an instant`);
    }
  }
  return {
    title: m.title as string, statement: m.statement as string, forecastId: m.forecastId ?? null,
    subjectEntityId: m.subjectEntityId ?? null, owner: m.owner as string, reviewCadence: m.reviewCadence as string,
    branches: branches.map((b) => ({
      name: b.name, kind: b.kind, statement: b.statement, indicatorId: b.indicatorId ?? null, signpost: b.signpost ?? null,
      kindLabel: b.kind === 'user-defined' ? (b.kindLabel as string).trim() : null,
      divergence: b.divergence == null ? null : b.divergence,
      assumptions: (b.assumptions ?? []).map((a) => ({ statement: a.statement, basis: a.basis ?? null })),
      owner: b.owner, reviewCadence: b.reviewCadence ?? (m.reviewCadence as string),
      responseWindowHours: b.responseWindowHours, consequence: b.consequence,
      consequenceClass: b.consequenceClass == null ? null : b.consequenceClass,
      decisionDeadline: b.decisionDeadline == null ? null : new Date(b.decisionDeadline).toISOString() })),
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
    // INHERITED: the scenario carries the forecast's controls. A tree declared
    // on no forecast rests on the declarer's own assertion, which is not
    // synthetic and not more open than internal.
    let controls: Controls;
    if (intake.forecastId === null) {
      controls = foldControls([{ synthetic_state: false, classification: 'internal' }]);
    } else {
      const f = (await cap.readForecasts().selectAll()
        .where('forecast_id' as never, '=', intake.forecastId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      if (f === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized forecast matches forecast_id'), 404);
      controls = foldControls([controlsOf(f['controls']) ?? {}]);
    }
    const payload = {
      title: intake.title, statement: intake.statement, forecast_id: intake.forecastId,
      subject_entity_id: intake.subjectEntityId, owner: `principal:${intake.owner}`, review_cadence: intake.reviewCadence,
      kind_vocabulary_version: SCENARIO_KIND_VOCABULARY_VERSION,
      branches: branches.map((b) => ({
        branch_id: b.branchId, name: b.name, kind: b.kind, kind_label: b.kindLabel ?? null, divergence: b.divergence ?? null,
        assumptions: b.assumptions ?? [], statement: b.statement,
        indicator: b.indicatorId === null ? null : { indicator_id: b.indicatorId }, signpost: b.signpost,
        owner: `principal:${b.owner}`, review_cadence: b.reviewCadence, response_window_hours: b.responseWindowHours,
        consequence: b.consequence, consequence_class: b.consequenceClass ?? null, decision_deadline: b.decisionDeadline })),
      controls,
    };
    const header: CanonicalHeader = {
      object_id: scenarioId, object_type: 'SCN', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-PRD-01', accountable_owner: `principal:${intake.owner}`,
      source_object_ids: intake.forecastId === null ? [] : [`FCT:${intake.forecastId}@1`],
      event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now,
      time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'asserted', synthetic_state: controls.synthetic_state,
      confidence: null, uncertainty: null, evidence_refs: intake.forecastId === null ? [] : [`forecast:${intake.forecastId}`],
      provenance_ref: `principal:${intake.owner}`, method_ref: 'human-declaration@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${intake.owner}`], classification: controls.classification,
      purpose_scope: purposeId, rights_profile: controls.rights_profile, residency_profile: controls.residency_profile,
      retention_profile: controls.retention_profile, access_policy_ref: controls.access_policy_ref,
      quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'SCN@v3', ontology_ref: null,
      correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `scenario header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.declareScenario({
      scenarioId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, title: intake.title,
      statement: intake.statement, forecastId: intake.forecastId, subjectEntityId: intake.subjectEntityId,
      owner: intake.owner, reviewCadence: intake.reviewCadence, controls, actor, eventId: newId(), correlationId,
    });
    for (const b of branches) {
      await cap.addBranch({
        branchId: b.branchId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, scenarioId,
        name: b.name, kind: b.kind, statement: b.statement, indicatorId: b.indicatorId, signpost: b.signpost,
        owner: b.owner, reviewCadence: b.reviewCadence, responseHours: b.responseWindowHours, consequence: b.consequence,
        consequenceClass: b.consequenceClass ?? null,
        decisionDeadline: b.decisionDeadline, kindLabel: b.kindLabel ?? null, divergence: b.divergence ?? null, assumptions: b.assumptions ?? [],
        actor, eventId: newId(), correlationId,
      });
    }
    return { scenarioId, branches: branches.map((b) => ({ branchId: b.branchId, name: b.name, kind: b.kind })) };
  }

  async defineIndicator(
    cap: IndicatorWrites, ctx: ScopeContext,
    a: { seriesKey: string; description: string; comparator: string; threshold: number; consecutiveDays: number; owner: string; observesFrom?: string | null },
    actor: string, correlationId: string,
  ): Promise<{ indicatorId: string }> {
    if (!['<', '<=', '>', '>='].includes(a.comparator)) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, "comparator must be one of '<', '<=', '>', '>='"), 422);
    }
    // The first observation day the indicator watches (0059). A recovery is "above a level AFTER
    // the collapse": without a bound, pre-collapse observations satisfy the level and the branch
    // flips before the event it follows.
    const observesFrom = a.observesFrom == null ? null : String(a.observesFrom);
    if (observesFrom !== null && !/^\d{4}-\d{2}-\d{2}$/.test(observesFrom)) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'observesFrom must be a calendar day (YYYY-MM-DD)'), 422);
    }
    if (!Number.isFinite(a.threshold)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'threshold must be a number'), 422);
    if (!Number.isInteger(a.consecutiveDays) || a.consecutiveDays < 1) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'consecutive_days must be a positive integer'), 422);
    }
    const indicatorId = newId();
    await cap.defineIndicator({
      indicatorId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, seriesKey: a.seriesKey,
      description: a.description, comparator: a.comparator, threshold: a.threshold, consecutiveDays: a.consecutiveDays,
      owner: a.owner, observesFrom, actor, correlationId,
    });
    return { indicatorId };
  }

  /**
   * Evaluate one indicator against every observation NEWER than the last one it
   * saw, in date order, as known at `knownAt`. Returns every flip the port
   * recorded in this evaluation PLUS every earlier flip still owed a warning,
   * so the caller discharges the obligation a failed raise left behind. An
   * incomplete history (evidence this reader could not read) is refused: a
   * streak counted on a partial series is not the publisher's streak.
   */
  /**
   * THE SERIES IS ASSEMBLED BEFORE THE WRITE. Assembling a long series is one governed
   * retrieval per evidence version — minutes on the demonstration's PortWatch record — and a
   * write's bound capability expires on a 60-second wall clock (0011). On 2026-09-11 the first
   * evaluation of a bounded indicator on the demonstration assembled 8,645 versions inside the
   * write and the first port call was refused (`context is bound to action <none>`): the same
   * class of finding the outbox publisher met on 2026-09-10. So the reads happen first, under the
   * reader's own consequential reads, and the write holds only the port calls.
   */
  async seriesKeyOf(cap: PredictionReads, indicatorId: string, correlationId: string): Promise<string> {
    const ind = (await cap.readIndicators().selectAll()
      .where('indicator_id' as never, '=', indicatorId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (ind === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized indicator matches'), 404);
    return String(ind['series_key']);
  }

  /** The series' own governed reads run here, in no enclosing transaction: a read nested in a read would wait on the audit chain it holds. */
  async assembleForEvaluation(reader: Reader, seriesKey: string, knownAt: string, correlationId: string): Promise<AssembledSeries> {
    const assembled = await this.series.assemble(reader, seriesKey, knownAt, null);
    if (!assembled.complete) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `${assembled.unreadable.length} evidence version(s) of ${seriesKey} could not be read by this reader; the indicator is not evaluated on an incomplete history`), 409);
    }
    return assembled;
  }

  async evaluate(
    cap: EvaluationWrites, ctx: ScopeContext, assembled: AssembledSeries, indicatorId: string, knownAt: string, actor: string, correlationId: string,
  ): Promise<{ evaluated: number; breached: boolean; streak: number; flips: Flip[]; owed: Flip[]; replayAsOf: string | null }> {
    const ind = (await cap.readIndicators().selectAll()
      .where('indicator_id' as never, '=', indicatorId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (ind === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized indicator matches'), 404);
    if (assembled.series.series_key !== String(ind['series_key'])) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'the assembled series is not the indicator\'s'), 409);
    }
    // The controls of the EXACT version a flip cites — from this assembly when it
    // contributed the point, otherwise read by object and version, so a later
    // revision of the same evidence does not stand in for the one that breached.
    const controlsFor = async (objectId: string, version: number): Promise<Controls | null> => {
      const row = assembled.evidenceRows.find((r) => r.object_id === objectId && r.object_version === version)
        ?? await cap.evidenceVersion({ objectId, version });
      return row === undefined ? null : foldControls([row]);
    };
    const last = dayOf(ind['last_observation_at']);
    // Only observations the indicator watches (0059): on or after its declared first day, and newer than the last seen.
    const from = dayOf(ind['observes_from']);
    const fresh = assembled.points.filter((p) => (last === null || p.date > last) && (from === null || p.date >= from));
    const flips: Flip[] = [];
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
                       evidenceObjectId: p.evidence_object_id, evidenceVersion: p.evidence_version,
                       evidenceControls: await controlsFor(p.evidence_object_id, p.evidence_version) });
        }
      }
    }
    // Every flip still owed a warning, from any earlier evaluation, minus the ones just made.
    const fresh_ids = new Set(flips.map((f) => f.flipEventId));
    const owed: Flip[] = [];
    for (const o of (await cap.owedFlips()).filter((x) => !fresh_ids.has(x.flip_event_id))) {
      owed.push({ branchId: o.branch_id, flipEventId: o.flip_event_id, observationAt: dayOf(o.observation_at) ?? String(o.observation_at),
                  value: Number(o.value), evidenceObjectId: o.evidence_object_id, evidenceVersion: Number(o.evidence_version),
                  evidenceControls: await controlsFor(o.evidence_object_id, Number(o.evidence_version)) });
    }
    // The REPLAY CLOCK of this evaluation: the end of the newest observation day it can see.
    const newest = assembled.points[assembled.points.length - 1]?.date ?? null;
    return { evaluated: fresh.length, breached, streak, flips, owed, replayAsOf: newest === null ? null : `${newest}T23:59:59Z` };
  }

  /**
   * The warning that follows a flip: routed to the branch's owner, with the
   * branch's response window, citing the flip event and the evidence that
   * breached the indicator.
   *
   * TIMING. `raisedAsOf` is the instant the warning is raised AS OF: the audit
   * clock in live mode, the breaching observation's date in replay mode — a
   * replay of January 2024 is not given a window that opens in 2026. The
   * response window opens at that instant and closes at the earlier of the
   * branch's window and its decision deadline. `timely` compares raisedAsOf to
   * the deadline the declarer set; with no deadline it is null: T3 unmeasured.
   * Raised AT OR AFTER the deadline, the decision it served can no longer be
   * taken: that is recorded as a MISSED DECISION, `timely` false, and the
   * window still opens — for the branch's own duration, since a report must
   * still be answered — rather than closing before it opens. `recorded_at`
   * stays the audit clock either way.
   *
   * The controls come from the EXACT evidence version the flip cites. When they
   * cannot be resolved the warning is not admitted at all: it stays owed on the
   * branch, visibly, until they can be.
   */
  /**
   * The level a warning from this class carries (0061). A separate method so the harness can
   * make the canonical object disagree with the derivation and watch the port refuse it.
   */
  async levelFor(cap: WarningWrites, consequenceClass: string): Promise<{ version: number; level: string; urgency: string; response: string; impact: string }> {
    return cap.deriveWarningLevel(consequenceClass);
  }

  async warnForFlip(
    cap: WarningWrites, ctx: ScopeContext, flip: Flip, confidence: number, actor: string, correlationId: string, purposeId: string,
    timing: 'live' | 'replay', now = new Date(), warningId: string = newId(),
    /** The C0–C4 class of the AUTHORITY CONTEXT this raise runs under (the envelope's), recorded beside the label. */
    opClass = 'C1',
  ): Promise<{ warningId: string; routedTo: string; raisedAsOf: string; closesAt: string; timely: boolean | null; decisionMissed: boolean; timingMode: 'live' | 'replay';
               level: string; levelVersion: number; urgency: string; response: string; consequenceClass: string; consequenceClassSource: 'declared' | 'assumed'; opClass: string }> {
    const branch = (await cap.readBranches().selectAll()
      .where('branch_id' as never, '=', flip.branchId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (branch === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized branch matches'), 404);
    const scenario = (await cap.readScenarios().selectAll()
      .where('scenario_id' as never, '=', String(branch['scenario_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const indicator = (await cap.readIndicators().selectAll()
      .where('indicator_id' as never, '=', String(branch['indicator_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (flip.evidenceControls === null) {
      throw new HttpException(errorBody('EYE_STA_001', correlationId,
        `the controls of the cited evidence version ${flip.evidenceObjectId}@${flip.evidenceVersion} could not be resolved; `
        + 'the warning is not admitted and stays owed on the branch'), 409);
    }
    const hours = Number(branch['response_window_hours'] ?? 72);
    const recordedAt = now.toISOString();
    const raisedAsOf = timing === 'replay' ? `${flip.observationAt}T00:00:00.000Z` : recordedAt;
    const deadlineRaw = branch['decision_deadline'];
    const decisionDeadline = deadlineRaw == null ? null : new Date(String(deadlineRaw instanceof Date ? deadlineRaw.toISOString() : deadlineRaw)).toISOString();
    const decisionMissed = decisionDeadline !== null && raisedAsOf >= decisionDeadline;
    const windowEnd = new Date(new Date(raisedAsOf).getTime() + hours * 3_600_000).toISOString();
    const closesAt = decisionDeadline !== null && !decisionMissed && decisionDeadline < windowEnd ? decisionDeadline : windowEnd;
    const timely = decisionDeadline === null ? null : !decisionMissed;
    const routedTo = String(branch['owner_principal_id']);
    const title = `${String(scenario?.['title'] ?? 'scenario')} — branch "${String(branch['name'])}" flipped`;
    // INHERITED: the scenario's controls folded with the breaching evidence's.
    // Evidence the evaluator could not see folds fail-closed.
    const controls = foldControls([
      controlsOf(scenario?.['controls']) ?? {},
      flip.evidenceControls,
    ]);
    // THE CLASS IS THE BRANCH'S DECLARATION, OR ASSUMED BY THE DERIVATION'S RULE (0061); the level is the
    // database's derivation — the port derives it again and refuses an object that disagrees.
    const declared = branch['consequence_class'];
    const consequenceClass = typeof declared === 'string' ? declared : 'C2';
    const consequenceClassSource: 'declared' | 'assumed' = typeof declared === 'string' ? 'declared' : 'assumed';
    const lvl = await this.levelFor(cap, consequenceClass);
    const evidence = [{ kind: 'evidence', evidence_object_id: flip.evidenceObjectId, evidence_version: flip.evidenceVersion,
                        observation_at: flip.observationAt, value: flip.value },
                      { kind: 'flip_event', event_id: flip.flipEventId, branch_id: flip.branchId },
                      { kind: 'indicator', indicator_id: String(branch['indicator_id']),
                        rule: indicator === undefined ? null
                          : `${String(indicator['series_key'])} ${String(indicator['comparator'])} ${String(indicator['threshold'])} for ${String(indicator['consecutive_days'])} consecutive observation(s)` }];
    const payload = {
      title, branch_id: flip.branchId, indicator_id: String(branch['indicator_id']),
      forecast_id: scenario?.['forecast_id'] ?? null, flip_event_id: flip.flipEventId,
      evidence, consequence: String(branch['consequence']), consequence_class: consequenceClass, consequence_class_source: consequenceClassSource, confidence,
      timing: { mode: timing, raised_as_of: raisedAsOf, recorded_at: recordedAt, decision_deadline: decisionDeadline, timely, decision_missed: decisionMissed },
      response_window: { opens_at: raisedAsOf, closes_at: closesAt }, routed_to: `principal:${routedTo}`,
      controls,
      level: { value: lvl.level, version: lvl.version, urgency: lvl.urgency, response: lvl.response, impact: lvl.impact },
      authority: { op_class: opClass },
    };
    const header: CanonicalHeader = {
      object_id: warningId, object_type: 'WRN', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: '1', lifecycle_state: 'active', owning_component: 'CP-PRD-01', accountable_owner: `principal:${routedTo}`,
      source_object_ids: [`EVD:${flip.evidenceObjectId}@${flip.evidenceVersion}`, `SCN:${String(branch['scenario_id'])}@1`],
      event_time: `${flip.observationAt}T00:00:00.000Z`, observation_time: raisedAsOf, valid_from: raisedAsOf, valid_to: closesAt,
      recorded_at: recordedAt, time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'inferred',
      synthetic_state: controls.synthetic_state, confidence: { value: confidence }, uncertainty: null,
      evidence_refs: [`EVD:${flip.evidenceObjectId}@${flip.evidenceVersion}`, `flip:${flip.flipEventId}`],
      provenance_ref: `branch:${flip.branchId}`, method_ref: 'indicator-breach@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: controls.classification, purpose_scope: purposeId,
      rights_profile: controls.rights_profile, residency_profile: controls.residency_profile, retention_profile: controls.retention_profile,
      access_policy_ref: controls.access_policy_ref, quality_profile: null,
      quality_state: null, freshness_state: null, schema_ref: 'WRN@v2', ontology_ref: null, correction_of: null,
      supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `warning header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.raiseWarning({
      warningId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, branchId: flip.branchId,
      indicatorId: String(branch['indicator_id']), forecastId: scenario?.['forecast_id'] === undefined ? null : (scenario['forecast_id'] as string | null),
      title, evidence, consequence: String(branch['consequence']), confidence, opensAt: raisedAsOf, closesAt, routedTo,
      flipEventId: flip.flipEventId, raisedAsOf, timingMode: timing, decisionDeadline, timely, decisionMissed, controls,
      consequenceClass, consequenceClassSource, level: lvl.level, levelVersion: lvl.version, urgency: lvl.urgency, opClass,
      actor, eventId: newId(), correlationId,
    });
    return { warningId, routedTo, raisedAsOf, closesAt, timely, decisionMissed, timingMode: timing,
             level: lvl.level, levelVersion: lvl.version, urgency: lvl.urgency, response: lvl.response, consequenceClass, consequenceClassSource, opClass };
  }

  /**
   * The response is AS OF an instant on the warning's own clock: the audit clock
   * for a live warning, the replay instant the responder states for a replayed
   * one. The port records whether it came before the window closed.
   */
  async acknowledge(cap: AcknowledgeWrites, ctx: ScopeContext, warningId: string, note: string, asOf: string | null, actor: string, correlationId: string): Promise<string> {
    if (note.trim().length < 4) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'an acknowledgement needs a note'), 422);
    if (asOf !== null && Number.isNaN(Date.parse(asOf))) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'asOf must be an instant'), 422);
    return cap.acknowledgeWarning({ warningId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, note,
      asOf: asOf === null ? null : new Date(asOf).toISOString(), actor, eventId: newId(), correlationId });
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
    const indicators = ((await cap.readIndicators().selectAll().execute()) as Array<Record<string, unknown>>).map(withIndicatorDays);
    return { ...s, branches: branches.map((b) => ({ ...b, indicator: indicators.find((i) => String(i['indicator_id']) === String(b['indicator_id'])) ?? null })), events };
  }

  async listIndicators(cap: PredictionReads): Promise<Array<Record<string, unknown>>> {
    return ((await cap.readIndicators().selectAll().orderBy('defined_at' as never, 'desc').execute()) as Array<Record<string, unknown>>).map(withIndicatorDays);
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

/*
 * A DATE column names a day, not an instant. The driver hands it back as a Date at LOCAL
 * midnight, which JSON would then print in UTC — a day west of Greenwich — so an indicator's
 * day-valued columns are rendered as the day they name before they leave (the twin precedent).
 */
function withIndicatorDays(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const c of ['observes_from', 'last_observation_at']) if (c in out) out[c] = dayOf(out[c]);
  return out;
}
