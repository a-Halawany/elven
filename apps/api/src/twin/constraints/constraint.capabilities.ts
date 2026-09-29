/**
 * CP-6 B29 §D (0092) — THE CONSTRAINT CAPABILITIES: the twin capability's shape (one implementation, narrow interfaces, every write a
 * SECURITY DEFINER port that asserts the caller's own bound action). Reads go through the tables' row security (this domain's sets,
 * versions, events and checks).
 *
 *   simulation.constraint.declare → simulation.declare_constraint_set   (a constraint steward, or a domain administrator naming one)
 *   simulation.constraint.version → simulation.version_constraint_set   (the set's steward, or a domain administrator)
 *   simulation.constraint.retire  → simulation.retire_constraint_set    (the set's steward, or a domain administrator)
 *   simulation.plan.check         → simulation.record_plan_check  (the acting principal; a plan)
 *   the GATE (no route, no principal — §C's frozen ConstraintGate.check(scope, …)) → simulation.issue_constraint_gate_capability, then
 *                                   simulation.record_plan_check under that machine capability (checked_by NULL)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ConstraintReads {
  readonly action: string;
  readSets(): any;
  readVersions(): any;
  readEvents(): any;
  readChecks(): any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Ids { tenantId: string; domainId: string; actor: string; eventId: string; correlationId: string }
export interface SetWrites extends ConstraintReads {
  declareSet(a: Ids & { setId: string; setKey: string; title: string; steward: string | null; constraints: unknown[]; note: string }): Promise<Record<string, unknown>>;
  versionSet(a: Ids & { setId: string; expectedVersion: number; constraints: unknown[]; note: string }): Promise<Record<string, unknown>>;
  retireSet(a: Ids & { setId: string; reason: string }): Promise<Record<string, unknown>>;
}
export interface CheckRecord {
  checkId: string; tenantId: string; domainId: string; subjectKind: string; subjectRef: string; subject: Record<string, unknown>;
  sets: Array<{ set_id: string; set_key: string; version: number; digest: string }>; outcome: string; violations: unknown[]; reason: string | null;
  budgetMs: number; elapsedMs: number; actor: string | null; correlationId: string;
}
export interface CheckWrites extends ConstraintReads {
  recordCheck(a: CheckRecord): Promise<Record<string, unknown>>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class ConstraintCapabilityImpl implements SetWrites, CheckWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async one(q: ReturnType<typeof sql>): Promise<Record<string, unknown>> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Record<string, unknown> } | undefined)?.r) ?? {};
  }

  readSets(): any { return this.from('simulation.constraint_sets'); }
  readVersions(): any { return this.from('simulation.constraint_set_versions'); }
  readEvents(): any { return this.from('simulation.constraint_set_events'); }
  readChecks(): any { return this.from('simulation.plan_checks'); }

  async declareSet(a: Parameters<SetWrites['declareSet']>[0]) {
    return this.one(sql`select simulation.declare_constraint_set(${a.setId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.setKey}, ${a.title}, ${a.steward}::uuid,
      ${JSON.stringify(a.constraints)}::jsonb, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async versionSet(a: Parameters<SetWrites['versionSet']>[0]) {
    return this.one(sql`select simulation.version_constraint_set(${a.setId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int,
      ${JSON.stringify(a.constraints)}::jsonb, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async retireSet(a: Parameters<SetWrites['retireSet']>[0]) {
    return this.one(sql`select simulation.retire_constraint_set(${a.setId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async recordCheck(a: CheckRecord) {
    return this.one(sql`select simulation.record_plan_check(${a.checkId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.subjectKind}, ${a.subjectRef},
      ${JSON.stringify(a.subject)}::jsonb, ${JSON.stringify(a.sets)}::jsonb, ${a.outcome}, ${JSON.stringify(a.violations)}::jsonb, ${a.reason}, ${a.budgetMs}::int,
      ${a.elapsedMs}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const ConstraintCapability = {
  read(tx: Tx, action: string): ConstraintReads { return new ConstraintCapabilityImpl(tx, action); },
  set(tx: Tx, action: string): SetWrites { return new ConstraintCapabilityImpl(tx, action); },
  check(tx: Tx, action: string): CheckWrites { return new ConstraintCapabilityImpl(tx, action); },
  /**
   * THE GATE: mints the transaction's DOMAIN-scoped machine capability bound to simulation.constraint.gate (0092 §D.4) and answers the
   * one capability that serves it. Only ConstraintService.check calls this, on its own transaction.
   */
  async gate(tx: Tx, scope: { tenantId: string; domainId: string }, reason: string): Promise<CheckWrites> {
    await sql`select simulation.issue_constraint_gate_capability(${scope.tenantId}::uuid, ${scope.domainId}::uuid, ${reason}, 30)`.execute(tx);
    return new ConstraintCapabilityImpl(tx, 'simulation.constraint.gate');
  },
};
