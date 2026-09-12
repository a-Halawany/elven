/**
 * The retention module's capabilities (0066 §4): what a governed retention act may read and write — the retention
 * ledgers, the observation manifests/holds/tombstones it acts on, the log's floor. One capability per transaction, bound
 * to the route's action; every port asserts that action itself.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

type Row = Record<string, unknown>;

export interface RetentionReads {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  readSchedules(): any;
  readActions(): any;
  readActionEvents(): any;
  readScopeItems(): any;
  readApprovals(): any;
  readExecutions(): any;
  readResiduals(): any;
  readVerifications(): any;
  readManifests(): any;
  readTombstones(): any;
  readLegalHolds(): any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  outboxPartitionTelemetry(): Promise<Row[]>;
}

export interface RetentionWrites extends RetentionReads {
  declareSchedule(a: { scheduleId: string; tenantId: string; domainId: string; retentionProfile: string; targetKind: string; actionKind: string; dueAfter: string; selector: Row; owner: string | null; actor: string; correlationId: string }): Promise<void>;
  openAction(a: { actionId: string; tenantId: string; domainId: string; kind: string; targetKind: string; selector: Row; retentionProfile: string | null; scheduleId: string | null; actor: string; correlationId: string }): Promise<void>;
  evaluateSchedules(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row[]>;
  resolveScope(a: { actionId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  recordApproval(a: { approvalId: string; actionId: string; tenantId: string; domainId: string; scopeDigest: string; rationale: string; actor: string; correlationId: string }): Promise<void>;
  beginExecution(a: { actionId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row[]>;
  recordExecution(a: { executionId: string; actionId: string; tenantId: string; domainId: string; itemId: string | null; port: string; outcome: 'done' | 'refused' | 'skipped'; evidence: Row; actor: string; correlationId: string }): Promise<void>;
  finishExecution(a: { actionId: string; tenantId: string; domainId: string; outcome: 'executed' | 'failed'; reason: string | null; actor: string; correlationId: string }): Promise<void>;
  verifyAction(a: { actionId: string; tenantId: string; domainId: string; observed: Row; actor: string; correlationId: string }): Promise<Row>;
  withdrawAction(a: { actionId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<void>;
  /** 0067 §1: an execution rolled back because the scope changed — the action paused for re-resolution, its approvals revoked. */
  pauseAction(a: { actionId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<void>;
  /** 0067 §1: the vault refused a removal after the record committed — a pending bytes residual on the executed action. */
  recordBytesResidual(a: { actionId: string; tenantId: string; domainId: string; manifestRef: string; locator: string; error: string; actor: string; correlationId: string }): Promise<void>;
  /** The observation port: refuses a held manifest (0066 §4); idempotent. */
  tombstoneManifest(a: { tombstoneId: string; tenantId: string; domainId: string; manifestId: string; reason: string; correlationId: string }): Promise<boolean>;
  /** The outbox port: the floor moved by this executing action only. */
  declareFloor(a: { partitionKey: string; toSeq: number; actionId: string }): Promise<Row>;
  /** A refused port call must not abort the recording transaction: the call runs under a savepoint. */
  savepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
}

class RetentionCapabilityImpl implements RetentionWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async call<T>(fragment: { execute: (tx: Tx) => Promise<{ rows: T[] }> }): Promise<T[]> { return (await fragment.execute(this.#tx)).rows; }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  readSchedules(): any { return this.from('retention.schedules'); }
  readActions(): any { return this.from('retention.actions_current'); }
  readActionEvents(): any { return this.from('retention.action_events'); }
  readScopeItems(): any { return this.from('retention.scope_items'); }
  readApprovals(): any { return this.from('retention.approvals'); }
  readExecutions(): any { return this.from('retention.executions'); }
  readResiduals(): any { return this.from('retention.residual_inventory'); }
  readVerifications(): any { return this.from('retention.verifications'); }
  readManifests(): any { return this.from('observation.blob_manifests'); }
  readTombstones(): any { return this.from('observation.blob_tombstones'); }
  readLegalHolds(): any { return this.from('observation.legal_holds'); }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  async outboxPartitionTelemetry(): Promise<Row[]> { return this.call<Row>(sql`select * from objects.outbox_partition_telemetry()`); }

  async declareSchedule(a: Parameters<RetentionWrites['declareSchedule']>[0]): Promise<void> {
    await this.call(sql`select retention.declare_schedule(${a.scheduleId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.retentionProfile}, ${a.targetKind}, ${a.actionKind}, ${a.dueAfter}::interval, ${JSON.stringify(a.selector)}::jsonb, ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async openAction(a: Parameters<RetentionWrites['openAction']>[0]): Promise<void> {
    await this.call(sql`select retention.open_action(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.targetKind}, ${JSON.stringify(a.selector)}::jsonb, ${a.retentionProfile}, ${a.scheduleId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async evaluateSchedules(a: Parameters<RetentionWrites['evaluateSchedules']>[0]): Promise<Row[]> {
    const rows = await this.call<{ r: Row[] }>(sql`select retention.evaluate_schedules(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? [];
  }
  async resolveScope(a: Parameters<RetentionWrites['resolveScope']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.resolve_scope(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async recordApproval(a: Parameters<RetentionWrites['recordApproval']>[0]): Promise<void> {
    await this.call(sql`select retention.record_approval(${a.approvalId}::uuid, ${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.scopeDigest}, ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async beginExecution(a: Parameters<RetentionWrites['beginExecution']>[0]): Promise<Row[]> {
    const rows = await this.call<{ r: Row[] }>(sql`select retention.begin_execution(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? [];
  }
  async recordExecution(a: Parameters<RetentionWrites['recordExecution']>[0]): Promise<void> {
    await this.call(sql`select retention.record_execution(${a.executionId}::uuid, ${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.itemId}::uuid, ${a.port}, ${a.outcome}, ${JSON.stringify(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async finishExecution(a: Parameters<RetentionWrites['finishExecution']>[0]): Promise<void> {
    await this.call(sql`select retention.finish_execution(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async verifyAction(a: Parameters<RetentionWrites['verifyAction']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.verify_action(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.observed)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async withdrawAction(a: Parameters<RetentionWrites['withdrawAction']>[0]): Promise<void> {
    await this.call(sql`select retention.withdraw_action(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async pauseAction(a: Parameters<RetentionWrites['pauseAction']>[0]): Promise<void> {
    await this.call(sql`select retention.pause_action(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async recordBytesResidual(a: Parameters<RetentionWrites['recordBytesResidual']>[0]): Promise<void> {
    await this.call(sql`select retention.record_bytes_residual(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.manifestRef}, ${a.locator}, ${a.error}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async tombstoneManifest(a: Parameters<RetentionWrites['tombstoneManifest']>[0]): Promise<boolean> {
    const rows = await this.call<{ ok: boolean }>(sql`select observation.tombstone_blob(${a.tombstoneId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.manifestId}::uuid, ${a.reason}, ${a.correlationId}::uuid) as ok`);
    return rows[0]?.ok ?? false;
  }
  async savepoint(name: string): Promise<void> { await this.call(sql.raw(`savepoint ${name.replace(/[^a-z0-9_]/gi, '')}`)); }
  async rollbackToSavepoint(name: string): Promise<void> { await this.call(sql.raw(`rollback to savepoint ${name.replace(/[^a-z0-9_]/gi, '')}`)); }
  async releaseSavepoint(name: string): Promise<void> { await this.call(sql.raw(`release savepoint ${name.replace(/[^a-z0-9_]/gi, '')}`)); }
  async declareFloor(a: Parameters<RetentionWrites['declareFloor']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select objects.outbox_declare_floor(${a.partitionKey}, ${a.toSeq}, ${a.actionId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
}

export const RetentionCapability = {
  read(tx: Tx, action: string): RetentionReads { return new RetentionCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): RetentionWrites { return new RetentionCapabilityImpl(tx, action); },
};
