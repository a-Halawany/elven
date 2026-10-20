/**
 * CP-6 B40 §AP — THE ACQUISITION POLICY READ's capability (observation.acquisition_policy_read: the bound action observation.acquisition.read
 * and the caller's read scope asserted by the port). One narrow interface (the Phase 1 discipline). Metadata only (D9). CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface AcquisitionPolicyReads {
  read(a: { tenantId: string; domainId: string; sourceId: string }): Promise<Row>;
}

class AcquisitionPolicyReadsImpl implements AcquisitionPolicyReads {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async read(a: { tenantId: string; domainId: string; sourceId: string }): Promise<Row> {
    return ((await sql<{ r: Row }>`select observation.acquisition_policy_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid) as r`
      .execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
}

export const AcquisitionPolicyCapability = {
  read(tx: Tx, action: string): AcquisitionPolicyReads { return new AcquisitionPolicyReadsImpl(tx, action); },
};
