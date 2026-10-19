/**
 * B82 §TS (0121_b82_x_ts) — THE DISPLAY-TRUTH CAPABILITY: one thin binding over the pipeline's transaction to the guarded definer read
 * objects.display_truth (the caller's scope asserted IN the read; nothing here decides a rule the read decides).
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import type { TruthRef } from './display-truth-logic.js';

type Row = Record<string, unknown>;
export interface DisplayTruthReads { displayTruth(a: { tenantId: string; domainId: string; refs: TruthRef[] }): Promise<Row[]> }

class DisplayTruthCapabilityImpl implements DisplayTruthReads {
  readonly #tx: Tx; readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async displayTruth(a: { tenantId: string; domainId: string; refs: TruthRef[] }): Promise<Row[]> {
    const r = ((await sql`select objects.display_truth(${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.refs)}::jsonb) as r`.execute(this.#tx)).rows as Array<{ r: Row[] | null }>)[0]?.r;
    if (r === undefined) throw new Error('display_truth returned no row');
    return r ?? [];
  }
}

export const DisplayTruthCapability = {
  read(tx: Tx, action: string): DisplayTruthReads { return new DisplayTruthCapabilityImpl(tx, action); },
};
