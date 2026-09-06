/**
 * PREDICTION CAPABILITIES — Phase 4 (L6–L7).
 *
 * The same shape as the graph capabilities: one implementation, narrow
 * interfaces, every write a SECURITY DEFINER port that asserts the caller's own
 * bound action. A forecasting job holds `forecast` and can issue a forecast; it
 * cannot declare a scenario or acknowledge a warning, because those are a
 * person's acts and the interfaces do not offer them.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

abstract class PredictionCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  protected async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
}

export interface EvidenceVersionRow {
  object_id: string; object_version: number; recorded_at: string; content_digest: string;
  lifecycle_state: string; is_fragment: boolean; source_key: string;
  /** The controls the evidence carries, inherited by whatever is derived from it. */
  synthetic_state: boolean; classification: string; rights_profile: string | null;
  residency_profile: string | null; retention_profile: string | null; access_policy_ref: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PredictionReads {
  readonly action: string;
  readSeries(): any;
  readForecasts(): any;
  readForecastEvents(): any;
  readBacktests(): any;
  readOutcomes(): any;
  readScenarios(): any;
  readScenarioEvents(): any;
  readBranches(): any;
  readIndicators(): any;
  readIndicatorEvaluations(): any;
  readWarnings(): any;
  readWarningEvents(): any;
  readStrategy(): any;
  /**
   * The evidence VERSIONS a series can read at an instant: for every evidence
   * object of the source, the highest version recorded at or before `knownAt`.
   * This is the known-at path (D2) — a version recorded later is not returned,
   * whatever it says.
   */
  evidenceVersionsKnownAt(a: { sourceKey: string; knownAt: string }): Promise<EvidenceVersionRow[]>;
  /** One exact evidence version with the controls it carries — the version a flip CITED, whatever superseded it since. */
  evidenceVersion(a: { objectId: string; version: number }): Promise<EvidenceVersionRow | undefined>;
  /** Flipped branches still owed a warning — the obligation a failed raise left behind. */
  owedFlips(): Promise<Array<{ branch_id: string; flip_event_id: string; observation_at: string; value: number;
                               evidence_object_id: string; evidence_version: number }>>;
  rebuildProjections(): Promise<Array<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface SeriesWrites extends PredictionReads {
  registerSeries(a: {
    tenantId: string; domainId: string; seriesKey: string; sourceKey: string; parserRef: string;
    valueField: string; selector: string | null; unit: string; seasonalityDays: number;
    subjectEntityId: string | null; attribution: string | null; description: string;
    /** The publisher's calendar as the registrar attests it, or null: no stand-in outcome is ever scored without one. */
    publicationCalendar: PublicationCalendar | null;
    actor: string; correlationId: string;
  }): Promise<void>;
}

export interface PublicationCalendar { rule: 'daily' | 'business-days'; closures: string[]; authority: string }

export interface ForecastWrites extends PredictionReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  issueForecast(a: {
    forecastId: string; tenantId: string; domainId: string; seriesKey: string; subjectEntityId: string | null;
    horizonCode: string; horizonDays: number; originAt: string; knownAt: string; targetAt: string;
    method: string; methodVersion: string; baselineMethod: string; quantiles: Record<string, number>;
    path: unknown[]; drivers: unknown[]; assumptions: string[]; evidenceRefs: unknown[];
    refreshCadence: string; validationState: string; validationNote: string; label: string;
    skill: unknown | null; statement: string; backtestId: string | null; controls: unknown;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

export interface BacktestWrites extends PredictionReads {
  recordBacktest(a: {
    backtestId: string; tenantId: string; domainId: string; seriesKey: string; horizonCode: string;
    horizonDays: number; method: string; methodVersion: string; baselineMethod: string;
    windowFrom: string; windowTo: string; origins: number; coverage: number | null; pinball: number | null;
    baselineCoverage: number | null; baselinePinball: number | null; skill: number | null;
    t1: boolean | null; t2: boolean | null; verdict: string; discipline: string; details: unknown;
    knownAt: string; observations: number; mode: 'retrospective' | 'historical';
    actor: string; correlationId: string;
  }): Promise<void>;
}

export interface OutcomeWrites extends PredictionReads {
  recordOutcome(a: {
    outcomeId: string; tenantId: string; domainId: string; forecastId: string; observed: number;
    evidenceObjectId: string; evidenceVersion: number; evidenceDigest: string; knownAt: string;
    observedOn: string; substitution: string;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

export interface ScenarioWrites extends PredictionReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  declareScenario(a: {
    scenarioId: string; tenantId: string; domainId: string; title: string; statement: string;
    forecastId: string | null; subjectEntityId: string | null; owner: string; reviewCadence: string;
    controls: unknown; actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
  addBranch(a: {
    branchId: string; tenantId: string; domainId: string; scenarioId: string; name: string; kind: string;
    statement: string; indicatorId: string | null; signpost: string | null; owner: string;
    reviewCadence: string; responseHours: number; consequence: string; decisionDeadline: string | null;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

export interface IndicatorWrites extends PredictionReads {
  defineIndicator(a: {
    indicatorId: string; tenantId: string; domainId: string; seriesKey: string; description: string;
    comparator: string; threshold: number; consecutiveDays: number; owner: string; actor: string;
    correlationId: string;
  }): Promise<void>;
}

export interface EvaluationWrites extends PredictionReads {
  evaluateIndicator(a: {
    evaluationId: string; tenantId: string; domainId: string; indicatorId: string; knownAt: string;
    observationAt: string; value: number; evidenceObjectId: string; evidenceVersion: number;
    actor: string; correlationId: string;
  }): Promise<Array<{ breached: boolean; streak: number; flipped_branch_id: string | null; flip_event_id: string | null }>>;
  /**
   * Live warnings expire on the audit clock. Replayed warnings expire only against the
   * REPLAY clock the caller supplies (`replayAsOf`); a live sweep leaves them alone.
   */
  expireWarnings(a: { tenantId: string; domainId: string; replayAsOf: string | null; actor: string; correlationId: string }): Promise<number>;
}

export interface WarningWrites extends PredictionReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  raiseWarning(a: {
    warningId: string; tenantId: string; domainId: string; branchId: string | null; indicatorId: string | null;
    forecastId: string | null; title: string; evidence: unknown[]; consequence: string; confidence: number;
    opensAt: string; closesAt: string; routedTo: string; flipEventId: string | null; raisedAsOf: string;
    timingMode: 'live' | 'replay'; decisionDeadline: string | null; timely: boolean | null; decisionMissed: boolean; controls: unknown;
    actor: string; eventId: string; correlationId: string;
  }): Promise<void>;
}

export interface AcknowledgeWrites extends PredictionReads {
  acknowledgeWarning(a: {
    warningId: string; tenantId: string; domainId: string; note: string;
    /** The replay instant the response is AS OF (required for a replayed warning); ignored for a live one. */
    asOf: string | null;
    actor: string; eventId: string; correlationId: string;
  }): Promise<string>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class PredictionCapabilityImpl extends PredictionCore
  implements SeriesWrites, ForecastWrites, BacktestWrites, OutcomeWrites, ScenarioWrites,
             IndicatorWrites, EvaluationWrites, WarningWrites, AcknowledgeWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  readSeries(): any { return this.from('prediction.series_registry'); }
  readForecasts(): any { return this.from('prediction.forecasts_current'); }
  readForecastEvents(): any { return this.from('prediction.forecast_events'); }
  readBacktests(): any { return this.from('prediction.backtests'); }
  readOutcomes(): any { return this.from('prediction.outcome_ledger'); }
  readScenarios(): any { return this.from('prediction.scenarios_current'); }
  readScenarioEvents(): any { return this.from('prediction.scenario_events'); }
  readBranches(): any { return this.from('prediction.branches_current'); }
  readIndicators(): any { return this.from('prediction.indicators_current'); }
  readIndicatorEvaluations(): any { return this.from('prediction.indicator_evaluations'); }
  readWarnings(): any { return this.from('prediction.warnings_current'); }
  readWarningEvents(): any { return this.from('prediction.warning_events'); }
  readStrategy(): any { return this.from('graph.strategy_current'); }

  async evidenceVersionsKnownAt(a: { sourceKey: string; knownAt: string }): Promise<EvidenceVersionRow[]> {
    return this.call<EvidenceVersionRow>(sql`
      with src as (
        select distinct source_id from observation.source_contracts_current where source_key = ${a.sourceKey}),
      versions as (
        select distinct on (e.object_id) e.object_id::text as object_id, e.object_version::int as object_version,
               e.recorded_at::text as recorded_at, e.payload ->> 'content_digest' as content_digest,
               e.lifecycle_state, (e.payload -> 'fragment') is not null and jsonb_typeof(e.payload -> 'fragment') = 'object' as is_fragment,
               e.synthetic_state, e.classification, e.rights_profile, e.residency_profile, e.retention_profile, e.access_policy_ref
          from objects.canonical_objects e
         where e.object_type = 'EVD'
           and exists (select 1 from src where e.provenance_ref like 'SRC:' || src.source_id::text || '@%')
           and e.recorded_at <= ${a.knownAt}::timestamptz
         order by e.object_id, e.object_version desc)
      select v.*, ${a.sourceKey} as source_key from versions v
       where v.lifecycle_state <> 'withdrawn'
       order by v.recorded_at, v.object_id`);
  }

  async evidenceVersion(a: { objectId: string; version: number }): Promise<EvidenceVersionRow | undefined> {
    const rows = await this.call<EvidenceVersionRow>(sql`
      select v.object_id::text, v.object_version::int, v.recorded_at::text, v.content_digest, v.lifecycle_state,
             coalesce((v.payload ->> 'is_fragment')::boolean, false) as is_fragment,
             coalesce(v.payload ->> 'source_key', '') as source_key,
             v.synthetic_state, v.classification, v.rights_profile, v.residency_profile, v.retention_profile, v.access_policy_ref
        from objects.canonical_objects v
       where v.object_type = 'EVD' and v.object_id = ${a.objectId}::uuid and v.object_version = ${a.version}::int`);
    return rows[0];
  }

  async owedFlips() {
    return this.call<{ branch_id: string; flip_event_id: string; observation_at: string; value: number;
                       evidence_object_id: string; evidence_version: number }>(sql`
      select b.branch_id::text, b.flip_event_id::text, (ev.details ->> 'observation_at') as observation_at,
             (ev.details ->> 'value')::numeric as value, (ev.details ->> 'evidence_object_id')::text as evidence_object_id,
             coalesce((ev.details ->> 'evidence_version')::int, 1) as evidence_version
        from prediction.branches_current b
        join prediction.scenario_events ev on ev.event_id = b.flip_event_id
       where b.state = 'flipped' and b.warning_state = 'owed'
       order by b.flipped_at`);
  }

  async rebuildProjections(): Promise<Array<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>> {
    return this.call(sql`select projection, live_rows::text, rebuilt_rows::text, mismatched::text
                           from prediction.rebuild_projections()`);
  }

  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(
      sql`select content_digest from objects.admit_version(
        ${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }

  async registerSeries(a: Parameters<SeriesWrites['registerSeries']>[0]): Promise<void> {
    await this.call(sql`select prediction.register_series(
      ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.seriesKey}, ${a.sourceKey}, ${a.parserRef},
      ${a.valueField}, ${a.selector}, ${a.unit}, ${a.seasonalityDays}, ${a.subjectEntityId}::uuid,
      ${a.attribution}, ${a.description}, ${a.publicationCalendar === null ? null : JSON.stringify(a.publicationCalendar)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }

  async issueForecast(a: Parameters<ForecastWrites['issueForecast']>[0]): Promise<void> {
    await this.call(sql`select prediction.issue_forecast(
      ${a.forecastId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.seriesKey}, ${a.subjectEntityId}::uuid,
      ${a.horizonCode}, ${a.horizonDays}, ${a.originAt}::date, ${a.knownAt}::timestamptz, ${a.targetAt}::date,
      ${a.method}, ${a.methodVersion}, ${a.baselineMethod}, ${JSON.stringify(a.quantiles)}::jsonb,
      ${JSON.stringify(a.path)}::jsonb, ${JSON.stringify(a.drivers)}::jsonb, ${a.assumptions}::uuid[],
      ${JSON.stringify(a.evidenceRefs)}::jsonb, ${a.refreshCadence}, ${a.validationState}, ${a.validationNote},
      ${a.label}, ${a.skill === null ? null : JSON.stringify(a.skill)}::jsonb, ${a.statement},
      ${a.backtestId}::uuid, ${JSON.stringify(a.controls ?? {})}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async recordBacktest(a: Parameters<BacktestWrites['recordBacktest']>[0]): Promise<void> {
    await this.call(sql`select prediction.record_backtest(
      ${a.backtestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.seriesKey}, ${a.horizonCode},
      ${a.horizonDays}, ${a.method}, ${a.methodVersion}, ${a.baselineMethod}, ${a.windowFrom}::date,
      ${a.windowTo}::date, ${a.origins}, ${a.coverage}, ${a.pinball}, ${a.baselineCoverage}, ${a.baselinePinball},
      ${a.skill}, ${a.t1}, ${a.t2}, ${a.verdict}, ${a.discipline}, ${JSON.stringify(a.details)}::jsonb,
      ${a.knownAt}::timestamptz, ${a.observations}, ${a.mode},
      ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }

  async recordOutcome(a: Parameters<OutcomeWrites['recordOutcome']>[0]): Promise<void> {
    await this.call(sql`select prediction.record_outcome(
      ${a.outcomeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.forecastId}::uuid, ${a.observed},
      ${a.evidenceObjectId}::uuid, ${a.evidenceVersion}, ${a.evidenceDigest}, ${a.knownAt}::timestamptz,
      ${a.observedOn}::date, ${a.substitution},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async declareScenario(a: Parameters<ScenarioWrites['declareScenario']>[0]): Promise<void> {
    await this.call(sql`select prediction.declare_scenario(
      ${a.scenarioId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.statement},
      ${a.forecastId}::uuid, ${a.subjectEntityId}::uuid, ${a.owner}::uuid, ${a.reviewCadence},
      ${JSON.stringify(a.controls ?? {})}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async addBranch(a: Parameters<ScenarioWrites['addBranch']>[0]): Promise<void> {
    await this.call(sql`select prediction.add_branch(
      ${a.branchId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.scenarioId}::uuid, ${a.name}, ${a.kind},
      ${a.statement}, ${a.indicatorId}::uuid, ${a.signpost}, ${a.owner}::uuid, ${a.reviewCadence},
      ${a.responseHours}, ${a.consequence}, ${a.decisionDeadline}::timestamptz,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async defineIndicator(a: Parameters<IndicatorWrites['defineIndicator']>[0]): Promise<void> {
    await this.call(sql`select prediction.define_indicator(
      ${a.indicatorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.seriesKey}, ${a.description},
      ${a.comparator}, ${a.threshold}, ${a.consecutiveDays}, ${a.owner}::uuid, ${a.actor}::uuid,
      ${a.correlationId}::uuid)`);
  }

  async evaluateIndicator(a: Parameters<EvaluationWrites['evaluateIndicator']>[0]) {
    return this.call<{ breached: boolean; streak: number; flipped_branch_id: string | null; flip_event_id: string | null }>(
      sql`select out_breached as breached, out_streak as streak, out_branch_id::text as flipped_branch_id,
                 out_flip_event_id::text as flip_event_id from prediction.evaluate_indicator(
        ${a.evaluationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.indicatorId}::uuid,
        ${a.knownAt}::timestamptz, ${a.observationAt}::date, ${a.value}, ${a.evidenceObjectId}::uuid,
        ${a.evidenceVersion}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }

  async expireWarnings(a: { tenantId: string; domainId: string; replayAsOf: string | null; actor: string; correlationId: string }): Promise<number> {
    const rows = await this.call<{ n: number }>(sql`select prediction.expire_warnings(
      ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.replayAsOf}::timestamptz, ${a.actor}::uuid, ${a.correlationId}::uuid) as n`);
    return Number(rows[0]?.n ?? 0);
  }

  async raiseWarning(a: Parameters<WarningWrites['raiseWarning']>[0]): Promise<void> {
    await this.call(sql`select prediction.raise_warning(
      ${a.warningId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}::uuid, ${a.indicatorId}::uuid,
      ${a.forecastId}::uuid, ${a.title}, ${JSON.stringify(a.evidence)}::jsonb, ${a.consequence}, ${a.confidence},
      ${a.opensAt}::timestamptz, ${a.closesAt}::timestamptz, ${a.routedTo}::uuid,
      ${a.flipEventId}::uuid, ${a.raisedAsOf}::timestamptz, ${a.timingMode}, ${a.decisionDeadline}::timestamptz,
      ${a.timely}, ${a.decisionMissed}, ${JSON.stringify(a.controls ?? {})}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async acknowledgeWarning(a: Parameters<AcknowledgeWrites['acknowledgeWarning']>[0]): Promise<string> {
    const rows = await this.call<{ s: string }>(sql`select prediction.acknowledge_warning(
      ${a.warningId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.asOf}::timestamptz, ${a.actor}::uuid,
      ${a.eventId}::uuid, ${a.correlationId}::uuid) as s`);
    return String(rows[0]?.s ?? 'acknowledged');
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const PredictionCapability = {
  read(tx: Tx, action: string): PredictionReads { return new PredictionCapabilityImpl(tx, action); },
  series(tx: Tx, action: string): SeriesWrites { return new PredictionCapabilityImpl(tx, action); },
  forecast(tx: Tx, action: string): ForecastWrites { return new PredictionCapabilityImpl(tx, action); },
  backtest(tx: Tx, action: string): BacktestWrites { return new PredictionCapabilityImpl(tx, action); },
  outcome(tx: Tx, action: string): OutcomeWrites { return new PredictionCapabilityImpl(tx, action); },
  scenario(tx: Tx, action: string): ScenarioWrites { return new PredictionCapabilityImpl(tx, action); },
  indicator(tx: Tx, action: string): IndicatorWrites { return new PredictionCapabilityImpl(tx, action); },
  evaluation(tx: Tx, action: string): EvaluationWrites { return new PredictionCapabilityImpl(tx, action); },
  warning(tx: Tx, action: string): WarningWrites { return new PredictionCapabilityImpl(tx, action); },
  acknowledge(tx: Tx, action: string): AcknowledgeWrites { return new PredictionCapabilityImpl(tx, action); },
};
