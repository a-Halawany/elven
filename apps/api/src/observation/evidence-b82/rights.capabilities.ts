/**
 * CP-6 B82 §EV (0121_b82_x_ev) — THE RIGHTS-TERMS CAPABILITIES: the read (observation.rights_terms_read — the caller's read scope asserted by
 * the port) and the two acts (observation.declare_rights_terms / withdraw_rights_terms — the ports re-check the bound action, the scope, the
 * acting principal, the person and the role). One narrow interface per action class (the Phase 1 discipline). CONSTRUCTION only.
 * B82-F rt (0122_b82f_x_rt): the declarers' read (observation.rights_terms_register — the bound action, the scope and the acting principal's
 * declarer role re-checked by the port), its own interface: the domain's sources with their rights METADATA only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface RightsReads {
  read(a: { tenantId: string; domainId: string; sourceId: string }): Promise<Row>;
}
export interface RightsDeclareWrites extends RightsReads {
  declare(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number; expectedVersion: number; expiresAt: string | null;
               purposes: string[]; prohibitedUses: string[]; attribution: string | null; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface RightsWithdrawWrites extends RightsReads {
  withdraw(a: { requestId: string; tenantId: string; domainId: string; termsId: string; expectedVersion: number; reason: string; actor: string; correlationId: string }): Promise<Row>;
}

/* B82-F rt */
export interface RightsTermsRegisterReads {
  register(a: { tenantId: string; domainId: string }): Promise<Row>;
}
class RightsTermsRegisterImpl implements RightsTermsRegisterReads {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async register(a: { tenantId: string; domainId: string }): Promise<Row> {
    return ((await sql<{ r: Row }>`select observation.rights_terms_register(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
}
/* end B82-F rt */

class RightsCapabilityImpl implements RightsDeclareWrites, RightsWithdrawWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql<{ r: Row }>>): Promise<Row> {
    return ((await q.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
  read(a: { tenantId: string; domainId: string; sourceId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.rights_terms_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid) as r`);
  }
  declare(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number; expectedVersion: number; expiresAt: string | null;
               purposes: string[]; prohibitedUses: string[]; attribution: string | null; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.declare_rights_terms(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion}::int,
      ${a.expectedVersion}::int, ${a.expiresAt}::timestamptz, ${JSON.stringify(a.purposes)}::jsonb, ${JSON.stringify(a.prohibitedUses)}::jsonb, ${a.attribution}::text, ${a.reason},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  withdraw(a: { requestId: string; tenantId: string; domainId: string; termsId: string; expectedVersion: number; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.withdraw_rights_terms(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.termsId}::uuid, ${a.expectedVersion}::int,
      ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

export const RightsCapability = {
  read(tx: Tx, action: string): RightsReads { return new RightsCapabilityImpl(tx, action); },
  declare(tx: Tx, action: string): RightsDeclareWrites { return new RightsCapabilityImpl(tx, action); },
  withdraw(tx: Tx, action: string): RightsWithdrawWrites { return new RightsCapabilityImpl(tx, action); },
  /* B82-F rt */ terms(tx: Tx, action: string): RightsTermsRegisterReads { return new RightsTermsRegisterImpl(tx, action); }, /* end B82-F rt */
};
