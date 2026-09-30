/**
 * THE EXECUTION TARGET ACTIVATION CAPABILITY — CP-6 B36 part `collab` (0094 §C4; F-P6-05 (u)). One class for the port group of a real
 * target's life: decision.register_execution_target (decision.execution.target.register), decision.activate_execution_target
 * (decision.execution.target.activate), decision.deactivate_execution_target (decision.execution.target.deactivate). The commitment
 * capability's discipline (commitment.capabilities.ts): a route receives exactly the capability its action names.
 *
 * NOTHING REAL IS ACTIVATED BY ANY HARNESS OR ACT: a "real" target in the harness is a loopback literal recorded non-synthetic, refused by
 * the production egress (the B14 rule). The mechanism is what is proven.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface ExecutionActivationWrites {
  readonly action: string;
  register(a: { targetId: string; tenantId: string; domainId: string; targetKey: string; label: string; endpoint: string; trustAnchorPem: string; credentialRef: string | null; actor: string; correlationId: string }): Promise<Row>;
  activate(a: { tenantId: string; domainId: string; targetKey: string; decisionPackageId: string; actor: string; correlationId: string }): Promise<Row>;
  deactivate(a: { tenantId: string; domainId: string; targetKey: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
}

class ExecutionActivationImpl implements ExecutionActivationWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql>): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error('the port returned no row');
    return row;
  }
  register(a: Parameters<ExecutionActivationWrites['register']>[0]): Promise<Row> {
    return this.one(sql`select decision.register_execution_target(${a.targetId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.targetKey}, ${a.label}, ${a.endpoint}, ${a.trustAnchorPem}::text,
      ${a.credentialRef}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  activate(a: Parameters<ExecutionActivationWrites['activate']>[0]): Promise<Row> {
    return this.one(sql`select decision.activate_execution_target(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.targetKey}, ${a.decisionPackageId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  deactivate(a: Parameters<ExecutionActivationWrites['deactivate']>[0]): Promise<Row> {
    return this.one(sql`select decision.deactivate_execution_target(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.targetKey}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const ExecutionActivationCapability = {
  target(tx: Tx, action: string): ExecutionActivationWrites { return new ExecutionActivationImpl(tx, action); },
};
