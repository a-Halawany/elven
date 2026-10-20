/**
 * B81 §DG (0119_b81_x_dg; HX-16, REL-12, UX-ADR-018) — THE DEGRADED-CONTRACT CAPABILITY: one class over the pipeline's transaction. Each write
 * is a thin binding to a SECURITY DEFINER port of shell.* that asserts the route's own action, the scope of the established context and the
 * acting principal (a named human, re-checked in the port); the reads are the guarded definer reads. Nothing here decides a rule a port
 * decides — the state is evaluated in the database from the real signals, by the database clock.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

/** The API process's audit journal as /readyz reports it — passed to the evaluator, which can only ADD degradation from it. */
export interface JournalState { degraded: boolean; incidents: number; since: string | null }
export interface DegradedStateRead { tenantId: string | null; domainId: string | null; journal: JournalState; kind: string | null; key: string | null }
export interface FunctionEntry { action: string; label: string }
export interface DeclareIntake {
  requestId: string; tenantId: string | null; domainId: string | null; kind: string; key: string; expectedVersion: number;
  available: FunctionEntry[]; unavailable: FunctionEntry[]; limitations: string[]; maxDurationSeconds: number; ownerPrincipalId: string;
  exitEvidence: string; reason: string; actor: string; correlationId: string;
}
export interface ExitIntake {
  requestId: string; tenantId: string | null; domainId: string | null; contractId: string; contractVersion: number; evidence: string; evidenceRefs: string[];
  journal: JournalState; actor: string; correlationId: string;
}
export interface DegradedReads {
  state(a: DegradedStateRead): Promise<Row>;
  history(a: { tenantId: string | null; domainId: string | null; contractId: string }): Promise<Row>;
}
export interface DegradedWrites { declare(a: DeclareIntake): Promise<Row>; exit(a: ExitIntake): Promise<Row> }

class DegradedCapabilityImpl implements DegradedReads, DegradedWrites {
  readonly #tx: Tx; readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }

  async state(a: DegradedStateRead): Promise<Row> {
    return this.one(sql`select shell.degraded_state(${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.journal)}::jsonb, ${a.kind}, ${a.key}) as r`, 'degraded_state');
  }
  async history(a: { tenantId: string | null; domainId: string | null; contractId: string }): Promise<Row> {
    return this.one(sql`select shell.degraded_contract_history(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.contractId}::uuid) as r`, 'degraded_contract_history');
  }
  async declare(a: DeclareIntake): Promise<Row> {
    return this.one(sql`select shell.degraded_contract_declare(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.key}, ${a.expectedVersion}::int,
      ${JSON.stringify(a.available)}::jsonb, ${JSON.stringify(a.unavailable)}::jsonb, ${JSON.stringify(a.limitations)}::jsonb, ${a.maxDurationSeconds}::int,
      ${a.ownerPrincipalId}::uuid, ${a.exitEvidence}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'degraded_contract_declare');
  }
  async exit(a: ExitIntake): Promise<Row> {
    return this.one(sql`select shell.degraded_exit(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.contractId}::uuid, ${a.contractVersion}::int, ${a.evidence},
      ${JSON.stringify(a.evidenceRefs)}::jsonb, ${JSON.stringify(a.journal)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'degraded_exit');
  }
}

export const DegradedCapability = {
  read(tx: Tx, action: string): DegradedReads { return new DegradedCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): DegradedWrites { return new DegradedCapabilityImpl(tx, action); },
};
