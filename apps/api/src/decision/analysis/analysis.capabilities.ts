/**
 * ANALYSIS CAPABILITIES — CP-6 B35 part `analysis` (migration 0101 §A; F-P6-01, F-P5-07's adversarial-response sensitivity, F-P4-08's
 * reversibility and option value across futures).
 *
 * The B90 idiom (events.capabilities.ts): one class, two views. Each write is a thin binding to a SECURITY DEFINER port that asserts the
 * route's own action (decision.analysis.{criteria,assess,obligation,evaluate,generate,assemble,adversarial}), the scope and the acting
 * principal; each read is an INVOKER read under the caller's RLS (decision.package_analysis, the domain's packages, the actors of the
 * scenarios a package rests on). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class AnalysisCore {
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

export interface AnalysisReads {
  readonly action: string;
  now(): Promise<string>;
  /** decision.package_analysis: the whole analysis of a version (the current one when null), or null when the package is not visible. */
  analysis(packageId: string, version: number | null): Promise<Row | null>;
  /** The domain's packages with their current version and its newest criteria version, newest first, bounded. */
  packages(limit: number): Promise<Row[]>;
  /** The active ACTORS (with their agency) of the scenarios the package version rests on, with why the scenario is the package's. */
  actors(packageId: string, version: number): Promise<Row[]>;
}

export interface AnalysisWrites extends AnalysisReads {
  setCriteria(a: { tenantId: string; domainId: string; packageId: string; version: number; criteria: unknown[]; valueOwner: string; rationale: string; expectedVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
  assess(a: { assessmentId: string; tenantId: string; domainId: string; packageId: string; version: number; option: string; criterion: string; value: number | null; cited: Row | null; basis: string | null; actor: string; correlationId: string }): Promise<Row>;
  declareObligation(a: { obligationId: string; tenantId: string; domainId: string; packageId: string; key: string; kind: string; stakeholder: string | null; stakeholderRef: string | null; statement: string; test: Row;
    owner: string; actor: string; correlationId: string }): Promise<Row>;
  evaluate(a: { evaluationId: string; tenantId: string; domainId: string; packageId: string; version: number; judgments: unknown[]; actor: string; correlationId: string }): Promise<Row>;
  generate(a: { generationId: string; tenantId: string; domainId: string; packageId: string; version: number; actor: string; correlationId: string }): Promise<Row>;
  assemble(a: { assemblyId: string; tenantId: string; domainId: string; packageId: string; version: number; actor: string; correlationId: string }): Promise<Row>;
  adversarial(a: { assessmentId: string; tenantId: string; domainId: string; packageId: string; version: number; option: string; actorElementId: string; response: string; effects: unknown[]; basis: string;
    actor: string; correlationId: string }): Promise<Row>;
}

class AnalysisCapabilityImpl extends AnalysisCore implements AnalysisWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async analysis(packageId: string, version: number | null): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select decision.package_analysis(${packageId}::uuid, ${version}::int) as r`);
    return rows[0]?.r ?? null;
  }
  async packages(limit: number): Promise<Row[]> {
    return this.call<Row>(sql`select p.package_id, p.title, p.state, p.current_version, p.owner_principal_id as owner, p.declared_at,
        (select max(c.criteria_version) from decision.analysis_criteria c where c.package_id = p.package_id and c.version = p.current_version) as criteria_version,
        (select count(*)::int from decision.options o where o.package_id = p.package_id and o.version = p.current_version) as options
      from decision.packages_current p order by p.declared_at desc limit ${limit}`);
  }
  async actors(packageId: string, version: number): Promise<Row[]> {
    return this.call<Row>(sql`select e.element_id, e.name, e.description, e.attributes ->> 'agency' as agency, e.version, e.scenario_id, s.title as scenario_title, ps.why
      from decision.dsa_package_scenarios(${packageId}::uuid, ${version}::int) ps
      join prediction.scenario_elements e on e.scenario_id = ps.scenario_id and e.kind = 'actor' and e.state = 'active'
      join prediction.scenarios_current s on s.scenario_id = e.scenario_id
      order by s.title, e.name`);
  }
  async setCriteria(a: Parameters<AnalysisWrites['setCriteria']>[0]): Promise<Row> {
    return this.one(sql`select decision.set_criteria(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${JSON.stringify(a.criteria)}::jsonb, ${a.valueOwner}::uuid,
      ${a.rationale}, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_criteria');
  }
  async assess(a: Parameters<AnalysisWrites['assess']>[0]): Promise<Row> {
    return this.one(sql`select decision.assess_option(${a.assessmentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.option}, ${a.criterion},
      ${a.value}::numeric, ${a.cited === null ? null : JSON.stringify(a.cited)}::jsonb, ${a.basis}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'assess_option');
  }
  async declareObligation(a: Parameters<AnalysisWrites['declareObligation']>[0]): Promise<Row> {
    return this.one(sql`select decision.declare_obligation(${a.obligationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.key}, ${a.kind}, ${a.stakeholder}, ${a.stakeholderRef}::uuid,
      ${a.statement}, ${JSON.stringify(a.test)}::jsonb, ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_obligation');
  }
  async evaluate(a: Parameters<AnalysisWrites['evaluate']>[0]): Promise<Row> {
    return this.one(sql`select decision.evaluate_obligations(${a.evaluationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${JSON.stringify(a.judgments)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'evaluate_obligations');
  }
  async generate(a: Parameters<AnalysisWrites['generate']>[0]): Promise<Row> {
    return this.one(sql`select decision.generate_options(${a.generationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'generate_options');
  }
  async assemble(a: Parameters<AnalysisWrites['assemble']>[0]): Promise<Row> {
    return this.one(sql`select decision.assemble_package(${a.assemblyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'assemble_package');
  }
  async adversarial(a: Parameters<AnalysisWrites['adversarial']>[0]): Promise<Row> {
    return this.one(sql`select decision.assess_adversarial_response(${a.assessmentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.option}, ${a.actorElementId}::uuid,
      ${a.response}, ${JSON.stringify(a.effects)}::jsonb, ${a.basis}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'assess_adversarial_response');
  }
}

export const AnalysisCapability = {
  read(tx: Tx, action: string): AnalysisReads { return new AnalysisCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): AnalysisWrites { return new AnalysisCapabilityImpl(tx, action); },
};
