/**
 * B80 §SH (0118_b80_x_sh) — THE NAVIGATION CAPABILITIES: one narrow shape per port group.
 *
 *   read    shell.navigation_states_of (the principal's OWN states: current per workspace + its version history — the port refuses any
 *           other principal `(actor)` and a scope the caller is not bound to `(access)`); prediction.warning_as_of (the deep-link scene's
 *           read: the warning's state AS OF an instant from its own event history, and the variance against the current declared state)
 *   write   shell.save_navigation_state (`shell.navigation.save`: append-only versions, the stale check, the human re-check, the ledger)
 *
 * The capability decides nothing: the ports do. THREE CLAIMS: construction (this code and phase6-navigation-b80), demonstrated operation
 * (the act's deep-link scene, SYNTHETIC), real acceptance (H3) — never claimed.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface NavigationReads {
  readonly action: string;
  statesOf(a: { principalId: string; tenantId: string | null; domainId: string | null; workspace: string | null; history: number }): Promise<Row>;
  warningAsOf(a: { warningId: string; at: string }): Promise<Row>;
}
export interface NavigationWrites extends NavigationReads {
  save(a: { stateId: string; tenantId: string | null; domainId: string | null; workspace: string; expectedVersion: number; location: Row; returnPath: string | null;
            focus: string | null; recent: Row[]; favorites: Row[]; actor: string; correlationId: string }): Promise<Row>;
}

class NavigationCapabilityImpl implements NavigationWrites {
  readonly #tx: Tx;
  readonly action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.action = action; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  statesOf(a: Parameters<NavigationReads['statesOf']>[0]) {
    return this.one(sql`select shell.navigation_states_of(${a.principalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.workspace}, ${a.history}::int) as r`, 'navigation_states_of');
  }
  warningAsOf(a: Parameters<NavigationReads['warningAsOf']>[0]) {
    return this.one(sql`select prediction.warning_as_of(${a.warningId}::uuid, ${a.at}::timestamptz) as r`, 'warning_as_of');
  }
  save(a: Parameters<NavigationWrites['save']>[0]) {
    return this.one(sql`select shell.save_navigation_state(${a.stateId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.workspace}, ${a.expectedVersion}::int,
      ${JSON.stringify(a.location)}::jsonb, ${a.returnPath}, ${a.focus}, ${JSON.stringify(a.recent)}::jsonb, ${JSON.stringify(a.favorites)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'save_navigation_state');
  }
}

export const NavigationCapability = {
  read(tx: Tx, action: string): NavigationReads { return new NavigationCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): NavigationWrites { return new NavigationCapabilityImpl(tx, action); },
};
