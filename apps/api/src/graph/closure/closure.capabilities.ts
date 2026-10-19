/**
 * CP-6 B50 §CL (0120_b50_x_cl) — THE CLOSURE CAPABILITIES: one per action class, the Phase 1 discipline (the relation is never a parameter,
 * the transaction unreachable, a handler receives a narrow interface). The reads get the reads; each act gets its own port and nothing else;
 * the attention tick's step gets the sweep. The ports re-check everything (the bound action, the scope, the acting principal, the human, the
 * role, the ownership, the separation of the correction authority). CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class ClosureCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  protected async one(fragment: { execute: (tx: Tx) => Promise<{ rows: Array<{ r: unknown }> }> }): Promise<Row> {
    const rows = (await fragment.execute(this.#tx)).rows;
    return (rows[0]?.r ?? {}) as Row;
  }
  protected async many(fragment: { execute: (tx: Tx) => Promise<{ rows: Array<{ r: unknown }> }> }): Promise<Row[]> {
    const rows = (await fragment.execute(this.#tx)).rows;
    const v = rows[0]?.r;
    return Array.isArray(v) ? (v as Row[]) : [];
  }
}

export interface Scope2 { tenantId: string; domainId: string }

/** The reads (graph.read): the cases with their closure state, one case whole, the adoptable cases, the contract. */
export interface ClosureReads {
  list(a: Scope2 & { limit: number }): Promise<Row[]>;
  read(a: Scope2 & { caseId: string; check: boolean }): Promise<Row>;
  adoptable(a: Scope2): Promise<Row[]>;
  contract(a: Scope2): Promise<Row>;
}
/** graph.closure.contract.declare */
export interface ContractWrites { declare(a: Scope2 & { contractId: string; windows: Record<string, number>; exceptionMaxDays: number; synthetic: boolean; statement: string; actor: string; correlationId: string }): Promise<Row> }
/** graph.closure.acknowledge */
export interface AcknowledgeWrites { acknowledge(a: Scope2 & { ackId: string; caseId: string; consumerRef: string; state: 'acknowledged' | 'recomputed'; note: string; recomputeRef: string | null; actor: string; correlationId: string }): Promise<Row> }
/** graph.closure.except */
export interface ExceptWrites { except(a: Scope2 & { ackId: string; caseId: string; consumerRef: string; reason: string; expiresAt: string; owner: string; actor: string; correlationId: string }): Promise<Row> }
/** graph.closure.freeze */
export interface FreezeWrites { freeze(a: Scope2 & { caseId: string; consumerRef: string; reason: string; actor: string; correlationId: string }): Promise<Row> }
/** graph.closure.freeze.lift */
export interface LiftWrites { lift(a: Scope2 & { freezeId: string; reason: string; actor: string; correlationId: string }): Promise<Row> }
/** graph.closure.close */
export interface CloseWrites { close(a: Scope2 & { caseId: string; statement: string; actor: string; correlationId: string }): Promise<Row> }
/** graph.closure.adopt */
export interface AdoptWrites { adopt(a: Scope2 & { caseId: string; reason: string; actor: string; correlationId: string }): Promise<Row> }
/** graph.closure.sweep (a person's route) and executive.attention.tick (the attention agent's step) — the same port. */
export interface SweepWrites { sweep(a: Scope2 & { actor: string; correlationId: string }): Promise<Row> }

class ClosureCapabilityImpl extends ClosureCore implements ClosureReads, ContractWrites, AcknowledgeWrites, ExceptWrites, FreezeWrites, LiftWrites, CloseWrites, AdoptWrites, SweepWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  list(a: Scope2 & { limit: number }): Promise<Row[]> {
    return this.many(sql<{ r: unknown }>`select graph.correction_closures_list(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.limit}::int) as r`);
  }
  read(a: Scope2 & { caseId: string; check: boolean }): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.correction_closure_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid, ${a.check}::boolean) as r`);
  }
  adoptable(a: Scope2): Promise<Row[]> {
    return this.many(sql<{ r: unknown }>`select graph.adoptable_correction_cases(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`);
  }
  contract(a: Scope2): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.closure_contract_read(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`);
  }
  declare(a: Scope2 & { contractId: string; windows: Record<string, number>; exceptionMaxDays: number; synthetic: boolean; statement: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.declare_closure_contract(${a.contractId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.windows)}::jsonb, ${a.exceptionMaxDays}::int,
      ${a.synthetic}::boolean, ${a.statement}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  acknowledge(a: Scope2 & { ackId: string; caseId: string; consumerRef: string; state: 'acknowledged' | 'recomputed'; note: string; recomputeRef: string | null; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.acknowledge_consumer(${a.ackId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid, ${a.consumerRef}, ${a.state}, ${a.note},
      ${a.recomputeRef}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  except(a: Scope2 & { ackId: string; caseId: string; consumerRef: string; reason: string; expiresAt: string; owner: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.except_consumer(${a.ackId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid, ${a.consumerRef}, ${a.reason},
      ${a.expiresAt}::timestamptz, ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  freeze(a: Scope2 & { caseId: string; consumerRef: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.freeze_consumer_product(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid, ${a.consumerRef}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  lift(a: Scope2 & { freezeId: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.lift_publication_freeze(${a.freezeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  close(a: Scope2 & { caseId: string; statement: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.close_correction_case(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid, ${a.statement}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  adopt(a: Scope2 & { caseId: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.adopt_correction_case(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  sweep(a: Scope2 & { actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: unknown }>`select graph.sweep_correction_closures(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const ClosureCapability = {
  read(tx: Tx, action: string): ClosureReads { return new ClosureCapabilityImpl(tx, action); },
  contract(tx: Tx, action: string): ContractWrites { return new ClosureCapabilityImpl(tx, action); },
  acknowledge(tx: Tx, action: string): AcknowledgeWrites { return new ClosureCapabilityImpl(tx, action); },
  except(tx: Tx, action: string): ExceptWrites { return new ClosureCapabilityImpl(tx, action); },
  freeze(tx: Tx, action: string): FreezeWrites { return new ClosureCapabilityImpl(tx, action); },
  lift(tx: Tx, action: string): LiftWrites { return new ClosureCapabilityImpl(tx, action); },
  close(tx: Tx, action: string): CloseWrites { return new ClosureCapabilityImpl(tx, action); },
  adopt(tx: Tx, action: string): AdoptWrites { return new ClosureCapabilityImpl(tx, action); },
  sweep(tx: Tx, action: string): SweepWrites { return new ClosureCapabilityImpl(tx, action); },
};
