/**
 * IMPACT CAPABILITIES — CP-6 B31 part `impact` (migration 0099 §I; F-P5-07, F-P4-08's comparator sensitivity).
 *
 * The B90 idiom (events.capabilities.ts): one class, two views. Each write is a thin binding to a SECURITY DEFINER port that asserts the
 * route's own action (simulation.impact.{sensitivity,second_order,voi,probability}), the scope and the acting principal; each read is an
 * INVOKER read under the caller's RLS (the run with its contract and outputs, the behaviour model's envelope and containment, the live
 * twin links and the linked twins' admitted elements, the run's impact, the assessments). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../../shared/db.js';

type Row = Record<string, unknown>;

abstract class ImpactCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  /** The database's clock (every "as of now" read compares against it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface ImpactReads {
  readonly action: string;
  now(): Promise<string>;
  /** The run row (its stored contract and outputs) under the caller's RLS, or null. */
  run(runId: string): Promise<Row | null>;
  /** The behaviour model row of a method (operating envelope, containment, family). */
  model(modelRef: string): Promise<Row | null>;
  /** The twin's title. */
  twinTitle(twinId: string): Promise<string | null>;
  /** The live twin links reachable from a twin (depth ≤ 4), as rows {link_id, upstream_twin_id, downstream_twin_id, mapping}. */
  reach(twinId: string): Promise<Row[]>;
  /** A twin's title and its newest admitted version's numeric-capable elements {key, value}. */
  twinElements(twinId: string): Promise<{ title: string; version: number | null; elements: Array<{ key: string; value: unknown }> } | null>;
  /** simulation.run_impact: the run, its analyses, its newest second-order derivation, its probability statements. */
  impact(runId: string): Promise<Row | null>;
  /** The newest analyses of the domain (with their run's twin, branch and validity), bounded. */
  analyses(limit: number): Promise<Row[]>;
  /** The value-of-information assessments, newest first, by package and/or scenario. */
  assessments(a: { packageId: string | null; scenarioId: string | null; limit: number }): Promise<Row[]>;
}

export interface ImpactWrites extends ImpactReads {
  analyseSensitivity(a: { analysisId: string; tenantId: string; domainId: string; runId: string; outputsDigest: string; metric: string; relative: number; base: number; factors: unknown[];
    seeds: number[] | null; robustness: Row; timingShiftDays: number | null; digest: string; actor: string; correlationId: string }): Promise<Row>;
  deriveSecondOrder(a: { derivationId: string; tenantId: string; domainId: string; runId: string; outputsDigest: string; effects: unknown[]; actor: string; correlationId: string }): Promise<Row>;
  assessVoi(a: { assessmentId: string; tenantId: string; domainId: string; packageId: string | null; scenarioId: string; branchIds: string[] | null; reviewId: string | null;
    options: unknown[] | null; payoffs: Row | null; unit: string | null; payoffBasis: string | null; information: Row; actor: string; correlationId: string }): Promise<Row>;
  stateProbability(a: { statementId: string; tenantId: string; domainId: string; runId: string; mapId: string | null; event: Row; actor: string; correlationId: string }): Promise<Row>;
}

class ImpactCapabilityImpl extends ImpactCore implements ImpactWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async run(runId: string): Promise<Row | null> {
    const rows = await this.call<Row>(sql`select r.*, r.constraints ->> 'horizon_days' as horizon_days from simulation.runs_current r where r.run_id = ${runId}::uuid`);
    return rows[0] ?? null;
  }
  async model(modelRef: string): Promise<Row | null> {
    const rows = await this.call<Row>(sql`select method_ref, family, operating_envelope, containment, implementation_digest from twin.behaviour_models where method_ref = ${modelRef}`);
    return rows[0] ?? null;
  }
  async twinTitle(twinId: string): Promise<string | null> {
    const rows = await this.call<{ title: string }>(sql`select title from twin.twins_current where twin_id = ${twinId}::uuid`);
    return rows[0]?.title ?? null;
  }
  async reach(twinId: string): Promise<Row[]> {
    return this.call<Row>(sql`with recursive reach(link_id, upstream_twin_id, downstream_twin_id, mapping, depth) as (
        select l.link_id, l.upstream_twin_id, l.downstream_twin_id, l.mapping, 1 from twin.twin_links l where l.upstream_twin_id = ${twinId}::uuid and l.state = 'live'
        union
        select l.link_id, l.upstream_twin_id, l.downstream_twin_id, l.mapping, r.depth + 1 from twin.twin_links l join reach r on l.upstream_twin_id = r.downstream_twin_id
         where l.state = 'live' and r.depth < 4)
      select distinct on (link_id) link_id::text, upstream_twin_id::text, downstream_twin_id::text, mapping from reach order by link_id, depth`);
  }
  async twinElements(twinId: string): Promise<{ title: string; version: number | null; elements: Array<{ key: string; value: unknown }> } | null> {
    const t = await this.call<{ title: string; version: number | null }>(sql`select t.title,
        (select max(v.version) from twin.twin_versions v where v.twin_id = t.twin_id and v.state = 'admitted')::int as version
      from twin.twins_current t where t.twin_id = ${twinId}::uuid`);
    const row = t[0];
    if (row === undefined) return null;
    const elements = row.version === null ? [] : await this.call<{ key: string; value: unknown }>(sql`select key, value from twin.state_elements
      where twin_id = ${twinId}::uuid and version = ${row.version} and health = 'complete' order by key`);
    return { title: row.title, version: row.version, elements };
  }
  async impact(runId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select simulation.run_impact(${runId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async analyses(limit: number): Promise<Row[]> {
    return this.call<Row>(sql`select a.analysis_id, a.run_id, a.metric, a.relative, a.base_value, a.robustness_verdict, a.analysed_at, a.requested_by, jsonb_array_length(a.factors) as factor_count,
        (select f ->> 'key' from jsonb_array_elements(a.factors) f where (f ->> 'rank')::int = 1) as widest,
        r.twin_id, r.run_kind, r.validity, r.scenario_id, r.scenario_branch_id, t.title as twin_title
      from simulation.sensitivity_analyses a join simulation.runs_current r on r.run_id = a.run_id left join twin.twins_current t on t.twin_id = r.twin_id
      order by a.analysed_at desc limit ${limit}`);
  }
  async assessments(a: { packageId: string | null; scenarioId: string | null; limit: number }): Promise<Row[]> {
    return this.call<Row>(sql`select v.*, p.title as package_title, s.title as scenario_title from simulation.voi_assessments v
        left join decision.packages_current p on p.package_id = v.package_id left join prediction.scenarios_current s on s.scenario_id = v.scenario_id
      where (${a.packageId}::uuid is null or v.package_id = ${a.packageId}::uuid) and (${a.scenarioId}::uuid is null or v.scenario_id = ${a.scenarioId}::uuid)
      order by v.recorded_at desc limit ${a.limit}`);
  }
  async analyseSensitivity(a: Parameters<ImpactWrites['analyseSensitivity']>[0]): Promise<Row> {
    return this.one(sql`select simulation.analyse_sensitivity(${a.analysisId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.outputsDigest}, ${a.metric}, ${a.relative}::numeric, ${a.base}::numeric,
      ${JSON.stringify(a.factors)}::jsonb, ${a.seeds}::int[], ${JSON.stringify(a.robustness)}::jsonb, ${a.timingShiftDays}::int, ${a.digest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'analyse_sensitivity');
  }
  async deriveSecondOrder(a: Parameters<ImpactWrites['deriveSecondOrder']>[0]): Promise<Row> {
    return this.one(sql`select simulation.derive_second_order_effects(${a.derivationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.outputsDigest}, ${JSON.stringify(a.effects)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'derive_second_order_effects');
  }
  async assessVoi(a: Parameters<ImpactWrites['assessVoi']>[0]): Promise<Row> {
    return this.one(sql`select simulation.assess_value_of_information(${a.assessmentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.scenarioId}::uuid, ${a.branchIds}::uuid[],
      ${a.reviewId}::uuid, ${a.options === null ? null : JSON.stringify(a.options)}::jsonb, ${a.payoffs === null ? null : JSON.stringify(a.payoffs)}::jsonb, ${a.unit}, ${a.payoffBasis},
      ${JSON.stringify(a.information)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'assess_value_of_information');
  }
  async stateProbability(a: Parameters<ImpactWrites['stateProbability']>[0]): Promise<Row> {
    return this.one(sql`select simulation.state_run_probability(${a.statementId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.mapId}::uuid, ${JSON.stringify(a.event)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'state_run_probability');
  }
}

export const ImpactCapability = {
  read(tx: Tx, action: string): ImpactReads { return new ImpactCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ImpactWrites { return new ImpactCapabilityImpl(tx, action); },
};
