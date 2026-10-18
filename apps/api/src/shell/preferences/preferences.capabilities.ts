/**
 * B81 §LY-G (0119_b81_x_lyg) — THE PREFERENCE CAPABILITIES: one narrow shape per port group.
 *
 *   read    shell.preferences_of (the principal's OWN preferences: current per composition + its version history — the port refuses any
 *           other principal `(actor)` and a scope the caller is not bound to `(access)`)
 *   write   shell.save_preferences (`shell.preferences.save`: append-only versions, the stale check, the human re-check, the region
 *           boundary — a saved layout never hides context, primary task, evidence, action, status or authority — the ledger)
 *
 * The capability decides nothing: the ports do. THREE CLAIMS: construction (this code and phase6-preferences-b81), demonstrated operation
 * (the act, SYNTHETIC), real acceptance (H3) — never claimed.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface PreferenceReads {
  readonly action: string;
  preferencesOf(a: { principalId: string; tenantId: string | null; domainId: string | null; composition: string | null; history: number }): Promise<Row>;
}
export interface PreferenceWrites extends PreferenceReads {
  save(a: { preferenceId: string; tenantId: string | null; domainId: string | null; composition: string; expectedVersion: number; density: string | null;
            layout: Row; actor: string; correlationId: string }): Promise<Row>;
}

class PreferenceCapabilityImpl implements PreferenceWrites {
  readonly #tx: Tx;
  readonly action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.action = action; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  preferencesOf(a: Parameters<PreferenceReads['preferencesOf']>[0]) {
    return this.one(sql`select shell.preferences_of(${a.principalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.composition}, ${a.history}::int) as r`, 'preferences_of');
  }
  save(a: Parameters<PreferenceWrites['save']>[0]) {
    return this.one(sql`select shell.save_preferences(${a.preferenceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.composition}, ${a.expectedVersion}::int,
      ${a.density}, ${JSON.stringify(a.layout)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'save_preferences');
  }
}

export const PreferenceCapability = {
  read(tx: Tx, action: string): PreferenceReads { return new PreferenceCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): PreferenceWrites { return new PreferenceCapabilityImpl(tx, action); },
};
