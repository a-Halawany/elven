/**
 * CP-6 B40 §CR (0123_b40_x_cr) — THE CONNECTOR CELL'S CAPABILITIES: one narrow interface per action class (the Phase 1 discipline), each
 * a call of one port that re-checks the bound action, the scope, the acting principal and the person / role / separation of duties:
 *   register / decide   observation.register_adapter_package · decide_adapter_package       (a collection manager · a second person)
 *   load                observation.connector_cell_binding                                  (the run's read; read scope asserted)
 *   receipts            observation.record_egress_receipts                                  (the source's agent, under the run's lease)
 *   suspend             observation.connector_suspend_for_requalification                   (the source's agent, under the run's lease)
 *   submit / decideReq  observation.submit_requalification · decide_requalification          (a collection manager · a second person)
 *   rotate              observation.rotate_connector_credential                              (a collection manager)
 *   register / receipts reads  observation.connector_register_read · egress_receipts_read   (read scope asserted)
 * CONSTRUCTION only.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface AdapterRegisterWrites {
  register(a: { requestId: string; tenantId: string; domainId: string; manifest: Row; files: Row[]; packageDigest: string; protocol: string; sdkVersion: string;
                actor: string; correlationId: string }): Promise<Row>;
}
export interface AdapterDecideWrites {
  decide(a: { requestId: string; tenantId: string; domainId: string; packageId: string; decision: 'approve' | 'reject'; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface CellBindingReads {
  binding(a: { tenantId: string; domainId: string; sourceId: string; contractVersion: number }): Promise<Row>;
}
export interface EgressReceiptWrites {
  record(a: { tenantId: string; domainId: string; sourceId: string; contractVersion: number; runId: string; receipts: Row[]; correlationId: string }): Promise<Row>;
}
export interface ConnectorSuspendWrites {
  suspend(a: { tenantId: string; domainId: string; sourceId: string; contractVersion: number; runId: string; cause: string; detail: string; receiptId: string | null;
               digest: string | null; correlationId: string }): Promise<Row>;
}
export interface RequalificationSubmitWrites {
  submit(a: { requestId: string; tenantId: string; domainId: string; requalificationId: string; packageId: string | null; contractTests: Row; reason: string; actor: string;
              correlationId: string }): Promise<Row>;
}
export interface RequalificationDecideWrites {
  decide(a: { requestId: string; tenantId: string; domainId: string; requalificationId: string; decision: 'approve' | 'reject'; reason: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface CredentialRotateWrites {
  rotate(a: { requestId: string; tenantId: string; domainId: string; sourceId: string; contractVersion: number; ref: string; header: string; reason: string; actor: string;
              correlationId: string }): Promise<Row>;
}
export interface ConnectorRegisterReads {
  register(a: { tenantId: string; domainId: string }): Promise<Row>;
}
export interface EgressReceiptReads {
  receipts(a: { tenantId: string; domainId: string; sourceId: string | null; runId: string | null; limit: number }): Promise<Row>;
}

class CellCapabilityImpl implements AdapterRegisterWrites, AdapterDecideWrites, CellBindingReads, EgressReceiptWrites, ConnectorSuspendWrites,
  RequalificationSubmitWrites, CredentialRotateWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private async one(q: ReturnType<typeof sql<{ r: Row }>>): Promise<Row> {
    return ((await q.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
  register(a: Parameters<AdapterRegisterWrites['register']>[0]): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.register_adapter_package(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.manifest)}::jsonb,
      ${JSON.stringify(a.files)}::jsonb, ${a.packageDigest}, ${a.protocol}, ${a.sdkVersion}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  decide(a: Parameters<AdapterDecideWrites['decide']>[0]): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.decide_adapter_package(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid,
      ${a.decision}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  binding(a: Parameters<CellBindingReads['binding']>[0]): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.connector_cell_binding(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion}::int) as r`);
  }
  record(a: Parameters<EgressReceiptWrites['record']>[0]): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.record_egress_receipts(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion}::int,
      ${a.runId}::uuid, ${JSON.stringify(a.receipts)}::jsonb, ${a.correlationId}::uuid) as r`);
  }
  suspend(a: Parameters<ConnectorSuspendWrites['suspend']>[0]): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.connector_suspend_for_requalification(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.contractVersion}::int, ${a.runId}::uuid, ${a.cause}, ${a.detail}, ${a.receiptId}::uuid, ${a.digest}, ${a.correlationId}::uuid) as r`);
  }
  submit(a: Parameters<RequalificationSubmitWrites['submit']>[0]): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.submit_requalification(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.requalificationId}::uuid,
      ${a.packageId}::uuid, ${JSON.stringify(a.contractTests)}::jsonb, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  rotate(a: Parameters<CredentialRotateWrites['rotate']>[0]): Promise<Row> {
    return this.one(sql<{ r: Row }>`select observation.rotate_connector_credential(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid,
      ${a.contractVersion}::int, ${a.ref}, ${a.header}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}

class CellReadsImpl implements ConnectorRegisterReads, EgressReceiptReads {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async register(a: { tenantId: string; domainId: string }): Promise<Row> {
    return ((await sql<{ r: Row }>`select observation.connector_register_read(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
  async receipts(a: { tenantId: string; domainId: string; sourceId: string | null; runId: string | null; limit: number }): Promise<Row> {
    return ((await sql<{ r: Row }>`select observation.egress_receipts_read(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.runId}::uuid, ${a.limit}::int) as r`
      .execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
}

/** The requalification decision: its own capability (the adapter-package decision above is another port). */
class RequalificationDecideImpl implements RequalificationDecideWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async decide(a: Parameters<RequalificationDecideWrites['decide']>[0]): Promise<Row> {
    return ((await sql<{ r: Row }>`select observation.decide_requalification(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.requalificationId}::uuid,
      ${a.decision}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`.execute(this.#tx)).rows[0]?.r ?? {}) as Row;
  }
}

export const CellCapability = {
  register(tx: Tx, action: string): AdapterRegisterWrites { return new CellCapabilityImpl(tx, action); },
  decide(tx: Tx, action: string): AdapterDecideWrites { return new CellCapabilityImpl(tx, action); },
  load(tx: Tx, action: string): CellBindingReads { return new CellCapabilityImpl(tx, action); },
  receipts(tx: Tx, action: string): EgressReceiptWrites { return new CellCapabilityImpl(tx, action); },
  suspend(tx: Tx, action: string): ConnectorSuspendWrites { return new CellCapabilityImpl(tx, action); },
  submit(tx: Tx, action: string): RequalificationSubmitWrites { return new CellCapabilityImpl(tx, action); },
  decideRequalification(tx: Tx, action: string): RequalificationDecideWrites { return new RequalificationDecideImpl(tx, action); },
  rotate(tx: Tx, action: string): CredentialRotateWrites { return new CellCapabilityImpl(tx, action); },
  registerRead(tx: Tx, action: string): ConnectorRegisterReads { return new CellReadsImpl(tx, action); },
  receiptsRead(tx: Tx, action: string): EgressReceiptReads { return new CellReadsImpl(tx, action); },
};
