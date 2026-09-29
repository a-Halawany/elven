/**
 * PLANNING CAPABILITIES — CP-6 B36 part `planning` (migration 0094 §P; F-P6-10).
 *
 * One class per port group, each a thin binding to a SECURITY DEFINER port that asserts the route's own action, the scope and the acting
 * principal (the executive capabilities' idiom): the plan writes (declare, authority, review, baseline), the initiative transitions
 * (propose … close), the planning edits (milestone, dependency, measure, run, breach acknowledgement, citation), the tick step's detection,
 * and the reads (the workspace view, the replay, the sensitivity, the lists — invokers under the caller's RLS). Nothing here decides a
 * rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class PlanningCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  /** One SQL statement under the pipeline's bound action (the §0 signer's SignatureWrites shape). */
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

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PlanningReads {
  readonly action: string;
  call<T>(q: ReturnType<typeof sql>): Promise<T[]>;
  now(): Promise<string>;
  readPlans(): any;
  readInitiatives(): any;
  readBreaches(): any;
  readVariances(): any;
  /** The workspace's composed read (executive.plan_view): NULL when the plan is not of this caller's domain. */
  planView(planId: string): Promise<Row | null>;
  /** THE REPLAY (executive.plan_as_of): the plan as it stood at an instant. */
  planAsOf(planId: string, at: string): Promise<Row | null>;
  /** THE SCENARIO SENSITIVITY (executive.plan_sensitivity): a run's outputs on the plan's milestones; `available false` with a reason otherwise. */
  planSensitivity(planId: string, runId: string): Promise<Row>;
  /** The latest canonical version of a strategy object (the INI whose next version an approval admits). */
  latestObjectVersion(objectId: string): Promise<{ header: Row; payload: Row; version: number } | null>;
}
export interface PlanWrites extends PlanningReads {
  declarePlan(a: { planId: string; tenantId: string; domainId: string; title: string; statement: string; horizon: string; objectiveIds: string[]; currency: string; budgetTotal: string; budgetAuthority: string;
                   classification: string | null; reviewCadenceDays: number | null; actor: string; correlationId: string }): Promise<Row>;
  setPlanAuthority(a: { planId: string; tenantId: string; domainId: string; authority: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  reviewPlan(a: { planId: string; tenantId: string; domainId: string; note: string; actor: string; correlationId: string }): Promise<Row>;
  baselinePlan(a: { versionId: string; planId: string; tenantId: string; domainId: string; note: string | null; actor: string; correlationId: string }): Promise<Row>;
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
}
export interface InitiativeWrites extends PlanningReads {
  proposeInitiative(a: { initiativeId: string; tenantId: string; domainId: string; planId: string; objectiveId: string; sponsor: string; owner: string; budgetShare: string; rationale: string; actor: string; correlationId: string }): Promise<Row>;
  alignInitiative(a: { initiativeId: string; tenantId: string; domainId: string; objectiveIds: string[]; rationale: string; actor: string; correlationId: string }): Promise<Row>;
  prioritiseInitiative(a: { initiativeId: string; tenantId: string; domainId: string; priority: number; rationale: string; actor: string; correlationId: string }): Promise<Row>;
  fundInitiative(a: { initiativeId: string; tenantId: string; domainId: string; amount: string; rationale: string; actor: string; correlationId: string }): Promise<Row>;
  approveInitiative(a: { initiativeId: string; tenantId: string; domainId: string; rationale: string; actor: string; correlationId: string }): Promise<Row>;
  recordInitiativeObjectVersion(a: { initiativeId: string; tenantId: string; domainId: string; version: number; actor: string }): Promise<void>;
  pauseInitiative(a: { initiativeId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  closeInitiative(a: { initiativeId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
}
export interface PlanningEditWrites extends PlanningReads {
  setMilestone(a: { milestoneId: string; tenantId: string; domainId: string; initiativeId: string; name: string; dueDate: string; measureId: string; targetValue: string; actor: string; correlationId: string }): Promise<Row>;
  declareDependency(a: { dependencyId: string; tenantId: string; domainId: string; from: string; to: string; kind: string; rationale: string; actor: string; correlationId: string }): Promise<Row>;
  bindMeasure(a: { planId: string; tenantId: string; domainId: string; measureId: string; quantityKey: string | null; actor: string; correlationId: string }): Promise<Row>;
  attachRun(a: { planId: string; tenantId: string; domainId: string; runId: string; actor: string; correlationId: string }): Promise<Row>;
  acknowledgeBreach(a: { breachId: string; tenantId: string; domainId: string; authorization: string; actor: string; correlationId: string }): Promise<Row>;
  citeInitiative(a: { packageId: string; tenantId: string; domainId: string; initiativeId: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface PlanningTickWrites extends PlanningReads {
  /** The tick step `plan-variance` (order 55): variances raised and routed, breaches opened and resolved — under executive.attention.tick. */
  detectPlanVariance(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

class PlanningCapabilityImpl extends PlanningCore implements PlanWrites, InitiativeWrites, PlanningEditWrites, PlanningTickWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  readPlans() { return this.from('executive.plans'); }
  readInitiatives() { return this.from('executive.initiatives'); }
  readBreaches() { return this.from('executive.plan_breaches'); }
  readVariances() { return this.from('executive.plan_variances'); }
  async planView(planId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select executive.plan_view(${planId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async planAsOf(planId: string, at: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select executive.plan_as_of(${planId}::uuid, ${at}::timestamptz) as r`);
    return rows[0]?.r ?? null;
  }
  async planSensitivity(planId: string, runId: string): Promise<Row> {
    const rows = await this.call<{ r: Row | null }>(sql`select executive.plan_sensitivity(${planId}::uuid, ${runId}::uuid) as r`);
    return rows[0]?.r ?? { available: false, reason: 'no answer' };
  }
  async latestObjectVersion(objectId: string): Promise<{ header: Row; payload: Row; version: number } | null> {
    const rows = await this.call<{ header: Row; payload: Row; version: number }>(sql`
      select (to_jsonb(o) - 'payload' - 'content_digest') as header, o.payload, o.object_version::int as version
        from objects.canonical_objects o where o.object_id = ${objectId}::uuid order by o.object_version desc limit 1`);
    return rows[0] ?? null;
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0]; if (r === undefined) throw new Error('admission returned no row'); return { contentDigest: r.content_digest };
  }

  declarePlan(a: Parameters<PlanWrites['declarePlan']>[0]) {
    return this.one(sql`select executive.declare_plan(${a.planId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.statement}, ${a.horizon}, ${sql`array[${sql.join(a.objectiveIds.map((o) => sql`${o}::uuid`))}]::uuid[]`},
      ${a.currency}, ${a.budgetTotal}::numeric, ${a.budgetAuthority}::numeric, ${a.classification}, ${a.reviewCadenceDays}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_plan');
  }
  setPlanAuthority(a: Parameters<PlanWrites['setPlanAuthority']>[0]) {
    return this.one(sql`select executive.set_plan_authority(${a.planId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.authority}::numeric, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_plan_authority');
  }
  reviewPlan(a: Parameters<PlanWrites['reviewPlan']>[0]) {
    return this.one(sql`select executive.review_plan(${a.planId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'review_plan');
  }
  baselinePlan(a: Parameters<PlanWrites['baselinePlan']>[0]) {
    return this.one(sql`select executive.baseline_plan(${a.versionId}::uuid, ${a.planId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'baseline_plan');
  }

  proposeInitiative(a: Parameters<InitiativeWrites['proposeInitiative']>[0]) {
    return this.one(sql`select executive.propose_initiative(${a.initiativeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.planId}::uuid, ${a.objectiveId}::uuid, ${a.sponsor}::uuid, ${a.owner}::uuid,
      ${a.budgetShare}::numeric, ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_initiative');
  }
  alignInitiative(a: Parameters<InitiativeWrites['alignInitiative']>[0]) {
    const objs = a.objectiveIds.length === 0 ? sql`'{}'::uuid[]` : sql`array[${sql.join(a.objectiveIds.map((o) => sql`${o}::uuid`))}]::uuid[]`;
    return this.one(sql`select executive.align_initiative(${a.initiativeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${objs}, ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'align_initiative');
  }
  prioritiseInitiative(a: Parameters<InitiativeWrites['prioritiseInitiative']>[0]) {
    return this.one(sql`select executive.prioritise_initiative(${a.initiativeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.priority}::int, ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'prioritise_initiative');
  }
  fundInitiative(a: Parameters<InitiativeWrites['fundInitiative']>[0]) {
    return this.one(sql`select executive.fund_initiative(${a.initiativeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.amount}::numeric, ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'fund_initiative');
  }
  approveInitiative(a: Parameters<InitiativeWrites['approveInitiative']>[0]) {
    return this.one(sql`select executive.approve_initiative(${a.initiativeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'approve_initiative');
  }
  async recordInitiativeObjectVersion(a: Parameters<InitiativeWrites['recordInitiativeObjectVersion']>[0]): Promise<void> {
    await this.call(sql`select executive.record_initiative_object_version(${a.initiativeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::bigint, ${a.actor}::uuid)`);
  }
  pauseInitiative(a: Parameters<InitiativeWrites['pauseInitiative']>[0]) {
    return this.one(sql`select executive.pause_initiative(${a.initiativeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'pause_initiative');
  }
  closeInitiative(a: Parameters<InitiativeWrites['closeInitiative']>[0]) {
    return this.one(sql`select executive.close_initiative(${a.initiativeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'close_initiative');
  }

  setMilestone(a: Parameters<PlanningEditWrites['setMilestone']>[0]) {
    return this.one(sql`select executive.set_milestone(${a.milestoneId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.initiativeId}::uuid, ${a.name}, ${a.dueDate}::date, ${a.measureId}::uuid, ${a.targetValue}::numeric, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_milestone');
  }
  declareDependency(a: Parameters<PlanningEditWrites['declareDependency']>[0]) {
    return this.one(sql`select executive.declare_initiative_dependency(${a.dependencyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.from}::uuid, ${a.to}::uuid, ${a.kind}, ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_initiative_dependency');
  }
  bindMeasure(a: Parameters<PlanningEditWrites['bindMeasure']>[0]) {
    return this.one(sql`select executive.bind_plan_measure(${a.planId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.measureId}::uuid, ${a.quantityKey}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'bind_plan_measure');
  }
  attachRun(a: Parameters<PlanningEditWrites['attachRun']>[0]) {
    return this.one(sql`select executive.attach_plan_run(${a.planId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.runId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'attach_plan_run');
  }
  acknowledgeBreach(a: Parameters<PlanningEditWrites['acknowledgeBreach']>[0]) {
    return this.one(sql`select executive.acknowledge_plan_breach(${a.breachId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.authorization}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'acknowledge_plan_breach');
  }
  citeInitiative(a: Parameters<PlanningEditWrites['citeInitiative']>[0]) {
    return this.one(sql`select executive.cite_initiative(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.initiativeId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'cite_initiative');
  }
  detectPlanVariance(a: Parameters<PlanningTickWrites['detectPlanVariance']>[0]) {
    return this.one(sql`select executive.detect_plan_variance(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'detect_plan_variance');
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const PlanningCapability = {
  read(tx: Tx, action: string): PlanningReads { return new PlanningCapabilityImpl(tx, action); },
  plan(tx: Tx, action: string): PlanWrites { return new PlanningCapabilityImpl(tx, action); },
  initiative(tx: Tx, action: string): InitiativeWrites { return new PlanningCapabilityImpl(tx, action); },
  edit(tx: Tx, action: string): PlanningEditWrites { return new PlanningCapabilityImpl(tx, action); },
  /** The attention tick's step (55): built from the tick's own transaction (bound to executive.attention.tick). */
  tick(tx: Tx, action: string): PlanningTickWrites { return new PlanningCapabilityImpl(tx, action); },
};
