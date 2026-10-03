/**
 * SCENARIO ANATOMY CAPABILITIES — CP-6 B27 part `anatomy` (migration 0097 §A; F-P4-07).
 *
 * The events.capabilities.ts idiom: one class, a view per port group. Each write is a thin binding to a SECURITY DEFINER port that asserts
 * the route's own action (prediction.scenario.anatomy.{element,retire,assumption,record,suspend,reinstate}), the scope and the acting
 * principal; the read is the invoker read prediction.scenario_anatomy under the caller's RLS. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../../shared/db.js';

type Row = Record<string, unknown>;

abstract class AnatomyCore {
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
  /** The database's clock (every "as of now" answer states it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface AnatomyReads {
  readonly action: string;
  now(): Promise<string>;
  /** prediction.scenario_anatomy: the scenario, its branches (suspension, reinstatement, open items), elements, register and records; null when not visible. */
  anatomy(scenarioId: string): Promise<Row | null>;
}

type Base = { tenantId: string; domainId: string; actor: string; correlationId: string };

/** prediction.scenario.anatomy.element / .retire */
export interface ElementWrites extends AnatomyReads {
  declareElement(a: Base & { elementId: string; scenarioId: string; branchId: string | null; kind: string; name: string; description: string; attributes: Row; graphRefs: Row[];
    expectedVersion: number | null; eventId: string }): Promise<Row>;
  retireElement(a: Base & { elementId: string; reason: string; eventId: string }): Promise<Row>;
}
/** prediction.scenario.anatomy.assumption */
export interface AssumptionWrites extends AnatomyReads {
  linkAssumption(a: Base & { linkId: string; scenarioId: string; branchId: string | null; assumptionId: string; critical: boolean; condition: Row; rationale: string;
    expectedVersion: number | null; eventId: string }): Promise<Row>;
  unlinkAssumption(a: Base & { linkId: string; reason: string; eventId: string }): Promise<Row>;
}
/** prediction.scenario.anatomy.record */
export interface RecordWrites extends AnatomyReads {
  addRecord(a: Base & { recordId: string; scenarioId: string; branchId: string | null; kind: string; title: string; body: string; cites: Array<{ kind: string; id: string }>;
    supersedes: string | null; eventId: string }): Promise<Row>;
}
/** prediction.scenario.anatomy.suspend / .reinstate */
export interface SuspensionWrites extends AnatomyReads {
  suspendBranch(a: Base & { branchId: string; reason: string; elementId: string | null }): Promise<Row>;
  applyInvalidation(a: Base & { assumptionId: string }): Promise<Row>;
  reinstateBranch(a: Base & { branchId: string; note: string; eventId: string }): Promise<Row>;
}

class AnatomyCapabilityImpl extends AnatomyCore implements ElementWrites, AssumptionWrites, RecordWrites, SuspensionWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async anatomy(scenarioId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select prediction.scenario_anatomy(${scenarioId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async declareElement(a: Parameters<ElementWrites['declareElement']>[0]): Promise<Row> {
    return this.one(sql`select prediction.declare_scenario_element(${a.elementId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.scenarioId}::uuid, ${a.branchId}::uuid, ${a.kind},
      ${a.name}, ${a.description}, ${JSON.stringify(a.attributes)}::jsonb, ${JSON.stringify(a.graphRefs)}::jsonb, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'declare_scenario_element');
  }
  async retireElement(a: Parameters<ElementWrites['retireElement']>[0]): Promise<Row> {
    return this.one(sql`select prediction.retire_scenario_element(${a.elementId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'retire_scenario_element');
  }
  async linkAssumption(a: Parameters<AssumptionWrites['linkAssumption']>[0]): Promise<Row> {
    return this.one(sql`select prediction.link_scenario_assumption(${a.linkId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.scenarioId}::uuid, ${a.branchId}::uuid, ${a.assumptionId}::uuid,
      ${a.critical}, ${JSON.stringify(a.condition)}::jsonb, ${a.rationale}, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'link_scenario_assumption');
  }
  async unlinkAssumption(a: Parameters<AssumptionWrites['unlinkAssumption']>[0]): Promise<Row> {
    return this.one(sql`select prediction.unlink_scenario_assumption(${a.linkId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'unlink_scenario_assumption');
  }
  async addRecord(a: Parameters<RecordWrites['addRecord']>[0]): Promise<Row> {
    return this.one(sql`select prediction.add_scenario_record(${a.recordId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.scenarioId}::uuid, ${a.branchId}::uuid, ${a.kind}, ${a.title}, ${a.body},
      ${JSON.stringify(a.cites)}::jsonb, ${a.supersedes}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'add_scenario_record');
  }
  async suspendBranch(a: Parameters<SuspensionWrites['suspendBranch']>[0]): Promise<Row> {
    return this.one(sql`select prediction.suspend_branch(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}::uuid, ${a.reason}, ${a.elementId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'suspend_branch');
  }
  async applyInvalidation(a: Parameters<SuspensionWrites['applyInvalidation']>[0]): Promise<Row> {
    return this.one(sql`select prediction.apply_assumption_invalidation(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.assumptionId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'apply_assumption_invalidation');
  }
  async reinstateBranch(a: Parameters<SuspensionWrites['reinstateBranch']>[0]): Promise<Row> {
    return this.one(sql`select prediction.reinstate_branch(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'reinstate_branch');
  }
}

export const AnatomyCapability = {
  read(tx: Tx, action: string): AnatomyReads { return new AnatomyCapabilityImpl(tx, action); },
  elements(tx: Tx, action: string): ElementWrites { return new AnatomyCapabilityImpl(tx, action); },
  assumptions(tx: Tx, action: string): AssumptionWrites { return new AnatomyCapabilityImpl(tx, action); },
  records(tx: Tx, action: string): RecordWrites { return new AnatomyCapabilityImpl(tx, action); },
  suspension(tx: Tx, action: string): SuspensionWrites { return new AnatomyCapabilityImpl(tx, action); },
};
