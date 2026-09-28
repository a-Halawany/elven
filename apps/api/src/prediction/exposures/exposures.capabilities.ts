/**
 * THE RISK AND OPPORTUNITY CAPABILITIES — CP-6 B32 (0089 §R; F-P4-13 risk and opportunity intelligence).
 *
 * The prediction capabilities' shape: one implementation, narrow interfaces, every write a SECURITY DEFINER port that asserts the
 * caller's own bound action (prediction.exposure.*). Who holds which is the PDP's and the port's to say; the interfaces keep a handler
 * from reaching a port its route was not authorised for:
 *
 *   ExposureReads            the register, its versions, events, drivers, controls, residuals, correlations, aggregations, hypotheses,
 *                            responses (with the decision's package and outcomes), the taxonomy, the appetites; the consequence preview,
 *                            the priority dimensions, the health branch — reads under the reader's RLS
 *   TaxonomyWrites           prediction.publish_risk_taxonomy            (prediction.exposure.taxonomy.publish)
 *   AppetiteWrites           prediction.approve_risk_appetite            (prediction.exposure.appetite.approve)
 *   RegisterWrites           prediction.register_exposure                (prediction.exposure.register)
 *   AssessWrites             prediction.assess_exposure                  (prediction.exposure.assess — a named human)
 *   EstimateWrites           prediction.estimate_exposures               (prediction.exposure.estimate — the Risk / Opportunity Agent's ONLY write)
 *   ContestWrites            prediction.contest_exposure_assessment      (prediction.exposure.contest)
 *   AcceptWrites             prediction.accept_exposure_assessment       (prediction.exposure.accept — the owner, human-gated)
 *   ControlWrites            prediction.add_exposure_control             (prediction.exposure.control.add)
 *   RouteWrites              prediction.route_exposure                   (prediction.exposure.route — the warning intake, origin `exposure`)
 *   HypothesisWrites         prediction.declare_opportunity_hypothesis   (prediction.exposure.hypothesis.declare)
 *   SponsorWrites            prediction.sponsor_opportunity              (prediction.exposure.sponsor — an opportunity sponsor, human-gated)
 *   RespondWrites            prediction.record_exposure_response         (prediction.exposure.respond)
 *   CloseWrites              prediction.close_exposure                   (prediction.exposure.close)
 *   CorrelationWrites        prediction.declare_exposure_correlation     (prediction.exposure.correlation.declare — a named human)
 *   AggregateWrites          prediction.aggregate_exposures              (prediction.exposure.aggregate)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class ExposuresCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  protected async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows[0] as { r?: Row } | undefined)?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ExposureReads {
  readonly action: string;
  readExposures(): any;
  readVersions(): any;
  readEvents(): any;
  readDrivers(): any;
  readControls(): any;
  readResiduals(): any;
  readCorrelations(): any;
  readAggregations(): any;
  readHypotheses(): any;
  readResponses(): any;
  readTaxonomy(): any;
  readAppetites(): any;
  readStrategy(): any;
  readPackages(): any;
  readOutcomes(): any;
  readCandidates(): any;
  readWarnings(): any;
  /** prediction.preview_exposure_acceptance: what accepting the version would do now — nothing written. */
  preview(exposureId: string, version: number): Promise<Row | null>;
  /** prediction.exposure_dimensions + prediction.exposure_priority for every exposure of the domain (the lexicographic key and its words). */
  priorities(): Promise<Array<{ exposure_id: string; dims: Row; priority: Row }>>;
  /** prediction.exposure_objectives: the objectives the RSK rests on. */
  objectives(exposureId: string): Promise<string[]>;
  /** prediction.health_inputs (0089 §0's contract, this part's branch). */
  healthInputs(tenantId: string, domainId: string, at: string): Promise<Row[]>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface TaxonomyWrites extends ExposureReads {
  publishTaxonomy(a: { taxonomyId: string; tenantId: string; domainId: string; expectedVersion: number; categories: unknown[]; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface AppetiteWrites extends ExposureReads {
  approveAppetite(a: { appetiteId: string; tenantId: string; domainId: string; category: string; expectedVersion: number; threshold: number; unit: string; statement: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface RegisterWrites extends ExposureReads {
  register(a: { exposureId: string; tenantId: string; domainId: string; polarity: string; category: string; owner: string; reviewEveryDays: number | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface AssessWrites extends ExposureReads {
  assess(a: { exposureId: string; tenantId: string; domainId: string; expectedVersion: number; assessment: Row; actor: string; correlationId: string }): Promise<Row>;
}
export interface EstimateWrites extends ExposureReads {
  estimate(a: { tenantId: string; domainId: string; polarity: 'risk' | 'opportunity'; runId: string; maxItems: number | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface ContestWrites extends ExposureReads {
  contest(a: { exposureId: string; tenantId: string; domainId: string; version: number; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface AcceptWrites extends ExposureReads {
  accept(a: { exposureId: string; tenantId: string; domainId: string; version: number; digest: string; rationale: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface ControlWrites extends ExposureReads {
  addControl(a: { controlId: string; exposureId: string; tenantId: string; domainId: string; title: string; kind: string; effectivenessLow: number; effectivenessHigh: number; owner: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface RouteWrites extends ExposureReads {
  route(a: { exposureId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface HypothesisWrites extends ExposureReads {
  declareHypothesis(a: { hypothesisId: string; exposureId: string; tenantId: string; domainId: string; statement: string; falsifier: string; value: Row; timing: Row; options: unknown[]; capabilities: string[]; actor: string; correlationId: string }): Promise<Row>;
}
export interface SponsorWrites extends ExposureReads {
  sponsor(a: { exposureId: string; tenantId: string; domainId: string; version: number; digest: string; terms: Row; actor: string; correlationId: string }): Promise<Row>;
}
export interface RespondWrites extends ExposureReads {
  respond(a: { responseId: string; exposureId: string; tenantId: string; domainId: string; kind: string; decisionObjectId: string; packageId: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface CloseWrites extends ExposureReads {
  close(a: { exposureId: string; tenantId: string; domainId: string; criterion: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface CorrelationWrites extends ExposureReads {
  declareCorrelation(a: { rowId: string; tenantId: string; domainId: string; a: string; b: string; relation: string; coefficient: number | null; basis: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface AggregateWrites extends ExposureReads {
  aggregate(a: { aggregationId: string; tenantId: string; domainId: string; members: string[]; actor: string; correlationId: string }): Promise<Row>;
}

class ExposuresImpl extends ExposuresCore implements TaxonomyWrites, AppetiteWrites, RegisterWrites, AssessWrites, EstimateWrites, ContestWrites, AcceptWrites, ControlWrites, RouteWrites,
  HypothesisWrites, SponsorWrites, RespondWrites, CloseWrites, CorrelationWrites, AggregateWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  readExposures(): any { return this.from('prediction.exposure_current'); }
  readVersions(): any { return this.from('prediction.exposure_versions'); }
  readEvents(): any { return this.from('prediction.exposure_events'); }
  readDrivers(): any { return this.from('prediction.exposure_drivers'); }
  readControls(): any { return this.from('prediction.exposure_controls'); }
  readResiduals(): any { return this.from('prediction.exposure_residuals'); }
  readCorrelations(): any { return this.from('prediction.exposure_correlations'); }
  readAggregations(): any { return this.from('prediction.exposure_aggregations'); }
  readHypotheses(): any { return this.from('prediction.opportunity_hypotheses'); }
  readResponses(): any { return this.from('prediction.exposure_responses'); }
  readTaxonomy(): any { return this.from('prediction.risk_taxonomy'); }
  readAppetites(): any { return this.from('prediction.risk_appetites'); }
  readStrategy(): any { return this.from('graph.strategy_current'); }
  readPackages(): any { return this.from('decision.packages_current'); }
  readOutcomes(): any { return this.from('decision.outcomes'); }
  readCandidates(): any { return this.from('prediction.warning_candidates'); }
  readWarnings(): any { return this.from('prediction.warnings_current'); }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  async preview(exposureId: string, version: number): Promise<Row | null> {
    const r = await this.rows<{ r: Row | null }>(sql`select prediction.preview_exposure_acceptance(${exposureId}::uuid, ${version}::int) as r`);
    return r[0]?.r ?? null;
  }
  async priorities(): Promise<Array<{ exposure_id: string; dims: Row; priority: Row }>> {
    return this.rows(sql`select x.exposure_id::text, d.dims, prediction.exposure_priority(d.dims) as priority
                           from prediction.exposure_current x cross join lateral (select prediction.exposure_dimensions(x.exposure_id) as dims) d`);
  }
  async objectives(exposureId: string): Promise<string[]> {
    const r = await this.rows<{ o: string[] }>(sql`select prediction.exposure_objectives(${exposureId}::uuid)::text[] as o`);
    return r[0]?.o ?? [];
  }
  async healthInputs(tenantId: string, domainId: string, at: string): Promise<Row[]> {
    return this.rows(sql`select * from prediction.health_inputs(${tenantId}::uuid, ${domainId}::uuid, ${at}::timestamptz)`);
  }

  async publishTaxonomy(a: Parameters<TaxonomyWrites['publishTaxonomy']>[0]): Promise<Row> {
    return this.one(sql`select prediction.publish_risk_taxonomy(${a.taxonomyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${JSON.stringify(a.categories)}::jsonb,
      ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'publish_risk_taxonomy');
  }
  async approveAppetite(a: Parameters<AppetiteWrites['approveAppetite']>[0]): Promise<Row> {
    return this.one(sql`select prediction.approve_risk_appetite(${a.appetiteId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.category}, ${a.expectedVersion}::int, ${a.threshold}::numeric,
      ${a.unit}, ${a.statement}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'approve_risk_appetite');
  }
  async register(a: Parameters<RegisterWrites['register']>[0]): Promise<Row> {
    return this.one(sql`select prediction.register_exposure(${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.polarity}, ${a.category}, ${a.owner}::uuid, ${a.reviewEveryDays}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'register_exposure');
  }
  async assess(a: Parameters<AssessWrites['assess']>[0]): Promise<Row> {
    return this.one(sql`select prediction.assess_exposure(${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${JSON.stringify(a.assessment)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'assess_exposure');
  }
  async estimate(a: Parameters<EstimateWrites['estimate']>[0]): Promise<Row> {
    return this.one(sql`select prediction.estimate_exposures(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.polarity}, ${a.runId}::uuid, ${a.maxItems}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'estimate_exposures');
  }
  async contest(a: Parameters<ContestWrites['contest']>[0]): Promise<Row> {
    return this.one(sql`select prediction.contest_exposure_assessment(${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'contest_exposure_assessment');
  }
  async accept(a: Parameters<AcceptWrites['accept']>[0]): Promise<Row> {
    return this.one(sql`select prediction.accept_exposure_assessment(${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.digest}, ${a.rationale},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'accept_exposure_assessment');
  }
  async addControl(a: Parameters<ControlWrites['addControl']>[0]): Promise<Row> {
    return this.one(sql`select prediction.add_exposure_control(${a.controlId}::uuid, ${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.kind}, ${a.effectivenessLow}::numeric,
      ${a.effectivenessHigh}::numeric, ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'add_exposure_control');
  }
  async route(a: Parameters<RouteWrites['route']>[0]): Promise<Row> {
    return this.one(sql`select prediction.route_exposure(${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'route_exposure');
  }
  async declareHypothesis(a: Parameters<HypothesisWrites['declareHypothesis']>[0]): Promise<Row> {
    return this.one(sql`select prediction.declare_opportunity_hypothesis(${a.hypothesisId}::uuid, ${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.statement}, ${a.falsifier},
      ${JSON.stringify(a.value)}::jsonb, ${JSON.stringify(a.timing)}::jsonb, ${JSON.stringify(a.options)}::jsonb, ${a.capabilities}::uuid[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_opportunity_hypothesis');
  }
  async sponsor(a: Parameters<SponsorWrites['sponsor']>[0]): Promise<Row> {
    return this.one(sql`select prediction.sponsor_opportunity(${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.digest}, ${JSON.stringify(a.terms)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'sponsor_opportunity');
  }
  async respond(a: Parameters<RespondWrites['respond']>[0]): Promise<Row> {
    return this.one(sql`select prediction.record_exposure_response(${a.responseId}::uuid, ${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.decisionObjectId}::uuid,
      ${a.packageId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_exposure_response');
  }
  async close(a: Parameters<CloseWrites['close']>[0]): Promise<Row> {
    return this.one(sql`select prediction.close_exposure(${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.criterion}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'close_exposure');
  }
  async declareCorrelation(a: Parameters<CorrelationWrites['declareCorrelation']>[0]): Promise<Row> {
    return this.one(sql`select prediction.declare_exposure_correlation(${a.rowId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.a}::uuid, ${a.b}::uuid, ${a.relation}, ${a.coefficient}::numeric,
      ${a.basis}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_exposure_correlation');
  }
  async aggregate(a: Parameters<AggregateWrites['aggregate']>[0]): Promise<Row> {
    return this.one(sql`select prediction.aggregate_exposures(${a.aggregationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.members}::uuid[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'aggregate_exposures');
  }
}

export const ExposuresCapability = {
  read(tx: Tx, action: string): ExposureReads { return new ExposuresImpl(tx, action); },
  taxonomy(tx: Tx, action: string): TaxonomyWrites { return new ExposuresImpl(tx, action); },
  appetite(tx: Tx, action: string): AppetiteWrites { return new ExposuresImpl(tx, action); },
  register(tx: Tx, action: string): RegisterWrites { return new ExposuresImpl(tx, action); },
  assess(tx: Tx, action: string): AssessWrites { return new ExposuresImpl(tx, action); },
  estimate(tx: Tx, action: string): EstimateWrites { return new ExposuresImpl(tx, action); },
  contest(tx: Tx, action: string): ContestWrites { return new ExposuresImpl(tx, action); },
  accept(tx: Tx, action: string): AcceptWrites { return new ExposuresImpl(tx, action); },
  control(tx: Tx, action: string): ControlWrites { return new ExposuresImpl(tx, action); },
  route(tx: Tx, action: string): RouteWrites { return new ExposuresImpl(tx, action); },
  hypothesis(tx: Tx, action: string): HypothesisWrites { return new ExposuresImpl(tx, action); },
  sponsor(tx: Tx, action: string): SponsorWrites { return new ExposuresImpl(tx, action); },
  respond(tx: Tx, action: string): RespondWrites { return new ExposuresImpl(tx, action); },
  close(tx: Tx, action: string): CloseWrites { return new ExposuresImpl(tx, action); },
  correlation(tx: Tx, action: string): CorrelationWrites { return new ExposuresImpl(tx, action); },
  aggregate(tx: Tx, action: string): AggregateWrites { return new ExposuresImpl(tx, action); },
};
