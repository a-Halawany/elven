/**
 * B80 §CB (0118 §CB) — THE OPERATING CONTEXT BAR's capabilities: one narrow shape per port, every read a SECURITY DEFINER read guarded by
 * observation.assert_read_scope and the acting principal, the write the deliberate commit port asserting the caller's own bound action.
 *
 *   read    executive.context_bar (the current context in the domain, its version, the unresolved dimensions, may-set, the choices) and
 *           executive.context_impact (the impact preview of a proposed switch) — `executive.context.read`;
 *   write   executive.commit_context (the previewed switch committed: the human, the role, the staleness, the basis and the impact digest
 *           re-checked in the port, then 0094's set_context and the shell ledger) — `executive.context.set`.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface ProposedContext { objectiveId: string | null; horizon: string; scenarioId: string | null; classification: string; effectiveAt: string | null }

export interface ContextReads {
  readonly action: string;
  bar(a: { tenantId: string; domainId: string; principalId: string }): Promise<Row>;
  impact(a: { tenantId: string; domainId: string; principalId: string; proposed: ProposedContext }): Promise<Row>;
}
export interface ContextWrites extends ContextReads {
  commit(a: { contextId: string; tenantId: string; domainId: string; proposed: ProposedContext; basisContextId: string | null; impactDigest: string;
              invalidated: string[]; actor: string; correlationId: string }): Promise<Row>;
}

class ContextCapabilityImpl implements ContextWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  bar(a: { tenantId: string; domainId: string; principalId: string }): Promise<Row> {
    return this.one(sql`select executive.context_bar(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid) as r`, 'context_bar');
  }
  impact(a: { tenantId: string; domainId: string; principalId: string; proposed: ProposedContext }): Promise<Row> {
    const p = a.proposed;
    return this.one(sql`select executive.context_impact(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid, ${p.objectiveId}::uuid, ${p.horizon},
                          ${p.scenarioId}::uuid, ${p.classification}, ${p.effectiveAt}::timestamptz) as r`, 'context_impact');
  }
  commit(a: Parameters<ContextWrites['commit']>[0]): Promise<Row> {
    const p = a.proposed;
    return this.one(sql`select executive.commit_context(${a.contextId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${p.objectiveId}::uuid, ${p.horizon}, ${p.scenarioId}::uuid,
                          ${p.classification}, ${p.effectiveAt}::timestamptz, ${a.basisContextId}::uuid, ${a.impactDigest}, ${JSON.stringify(a.invalidated)}::jsonb,
                          ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'commit_context');
  }
}

export const ContextCapability = {
  read(tx: Tx, action: string): ContextReads { return new ContextCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ContextWrites { return new ContextCapabilityImpl(tx, action); },
};
