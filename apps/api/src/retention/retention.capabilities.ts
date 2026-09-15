/**
 * The retention module's capabilities (0066 §4): what a governed retention act may read and write — the retention
 * ledgers, the observation manifests/holds/tombstones it acts on, the log's floor. One capability per transaction, bound
 * to the route's action; every port asserts that action itself.
 *
 * CP-6 B11 (0070 §2, §3): the tier ledger and the archive port (an executing archive action moves bytes to the archive
 * tier), the export package ledger with its record and revoke ports, the source contracts and canonical rows the export
 * packages, and the pause with its failure class.
 *
 * CP-6 B12 (0072): the restore port (an executing restore action moves bytes back to the hot tier, §2), the cold-tier manager's
 * policy and its ports (§1: the declaration, the escalation, the evaluation by age, the observable state), and the pause that
 * counts a failed attempt (C2).
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';
import { tierOf } from '../observation/observation.capabilities.js';

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
  /** B11 (0070 §3): the export packages, one row per customer-export action (revoked once, never deleted). */
  readExportPackages(): any;
  /** B11 (0070 §2): the tier ledger (a manifest's tier is its latest row). */
  readBlobTiers(): any;
  /** B11: the source contracts (the export's data-rights gate) and the canonical rows (the export's records). */
  readSourceContracts(): any;
  readCanonicalObjects(): any;
  /** B12 (0072 §1): the domain's cold-tier policies, one row per version (append-only; the latest is in force). */
  readTierPolicies(): any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  outboxPartitionTelemetry(): Promise<Row[]>;
  /** B11: a manifest's tier as the ledger says — 'hot' when it never moved. */
  tierOf(manifestId: string): Promise<{ tier: 'hot' | 'archive'; archivedAt: string | null }>;
  /** B12 (0072 §1; D4 "observable state"): the cold-tier manager's state of the domain — the policy in force or the defaults, the tiers, the moves of the last 24 h, the budget, the actions by state, the schedules (retention.tier_state). */
  tierState(a: { tenantId: string; domainId: string }): Promise<Row>;
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
  /**
   * 0067 §1 / 0070 §5: an execution rolled back — the action paused for re-resolution with its failure class (`legal_hold` when
   * omitted: a hold placed since the approval; `authority_disputed`: the export's rights withdrawn; `unresolved_dependency`: a
   * tombstone or a live reference since the approval; `infrastructure`: a copy or a package build failed — disposition retry), its
   * approvals revoked in every case. B12 (0072; C2): `attempted` counts the attempt where its failure is durably recorded — true when
   * the state had moved (begin_execution's own increment rolled back with the execution), false for a refusal before it moved.
   */
  pauseAction(a: { actionId: string; tenantId: string; domainId: string; reason: string; failureClass?: 'legal_hold' | 'unresolved_dependency' | 'authority_disputed' | 'infrastructure'; attempted?: boolean; actor: string; correlationId: string }): Promise<void>;
  /** 0067 §1: the vault refused a removal after the record committed — a pending bytes residual on the executed action. */
  recordBytesResidual(a: { actionId: string; tenantId: string; domainId: string; manifestRef: string; locator: string; error: string; actor: string; correlationId: string }): Promise<void>;
  /** The observation port: refuses a held manifest (0066 §4); idempotent. */
  tombstoneManifest(a: { tombstoneId: string; tenantId: string; domainId: string; manifestId: string; reason: string; correlationId: string }): Promise<boolean>;
  /** B11 (0070 §2): the archive port — the move to the archive tier recorded, only for an executing archive action's item, under the manifest's own digest; false when already archived. */
  archiveManifest(a: { recordId: string; tenantId: string; domainId: string; manifestId: string; actionId: string; contentDigest: string; actor: string; correlationId: string }): Promise<boolean>;
  /** B12 (0072 §2): the restore port — the move back to the hot tier recorded in the same ledger (D1), only for an executing restore action's item, under the manifest's own digest and its lock; false when already in the hot tier. */
  restoreManifest(a: { recordId: string; tenantId: string; domainId: string; manifestId: string; actionId: string; contentDigest: string; actor: string; correlationId: string }): Promise<boolean>;
  /** B12 (0072 §1): the domain's cold-tier policy declared as its next version (retention.tier.declare) — a null budget is unbounded; the intervals as text such as "7 days"; the row as recorded. */
  declareTierPolicy(a: { policyId: string; tenantId: string; domainId: string; budgetBytesPerDay: number | null; maxOpensPerEvaluation: number; maxAttempts: number; escalateAfter: string; restoreHotFor: string; actor: string; correlationId: string }): Promise<Row>;
  /** B12 (0072 §1; D4 "escalation by age"): every action paused for retry longer than the policy's escalate_after is escalated; returns {escalated, deferred, policy}. */
  evaluateTier(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  /** B12 (0072 §1; D4 "retries"): the action escalated for human review — state paused, disposition human_review, its approvals revoked, event action.escalated (the execute route on attempts_exhausted; the evaluation by age). */
  escalateAction(a: { actionId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<void>;
  /** B11 (0070 §3): the export package recorded after its files were written — the digests and the signature block bound to the action, its scope digest and the live approval. */
  recordExportPackage(a: { actionId: string; tenantId: string; domainId: string; approvalId: string; manifestDigest: string; packageDigest: string; signature: Row; objectCount: number; excludedCount: number; byteTotal: number; actor: string; correlationId: string }): Promise<Row>;
  /** B11 (0070 §3): the package revoked once by the retention authority (retention.export.revoke); the bytes go after the commit. */
  revokeExport(a: { actionId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
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
  readExportPackages(): any { return this.from('retention.export_packages'); }
  readBlobTiers(): any { return this.from('observation.blob_tier_records'); }
  readSourceContracts(): any { return this.from('observation.source_contracts_current'); }
  readCanonicalObjects(): any { return this.from('objects.canonical_objects'); }
  readTierPolicies(): any { return this.from('retention.tier_policies'); }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  async outboxPartitionTelemetry(): Promise<Row[]> { return this.call<Row>(sql`select * from objects.outbox_partition_telemetry()`); }
  async tierOf(manifestId: string): Promise<{ tier: 'hot' | 'archive'; archivedAt: string | null }> { return tierOf(this, manifestId); }
  async tierState(a: Parameters<RetentionReads['tierState']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.tier_state(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }

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
    // The 8-argument form (0072; C2): the attempt counted in the same UPDATE as the pause when the state had moved.
    await this.call(sql`select retention.pause_action(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.failureClass ?? 'legal_hold'}::text, ${a.reason}::text, ${a.attempted === true}::boolean, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async recordBytesResidual(a: Parameters<RetentionWrites['recordBytesResidual']>[0]): Promise<void> {
    await this.call(sql`select retention.record_bytes_residual(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.manifestRef}, ${a.locator}, ${a.error}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async tombstoneManifest(a: Parameters<RetentionWrites['tombstoneManifest']>[0]): Promise<boolean> {
    const rows = await this.call<{ ok: boolean }>(sql`select observation.tombstone_blob(${a.tombstoneId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.manifestId}::uuid, ${a.reason}, ${a.correlationId}::uuid) as ok`);
    return rows[0]?.ok ?? false;
  }
  async archiveManifest(a: Parameters<RetentionWrites['archiveManifest']>[0]): Promise<boolean> {
    const rows = await this.call<{ ok: boolean }>(sql`select observation.archive_blob(${a.recordId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.manifestId}::uuid, ${a.actionId}::uuid, ${a.contentDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as ok`);
    return rows[0]?.ok ?? false;
  }
  async restoreManifest(a: Parameters<RetentionWrites['restoreManifest']>[0]): Promise<boolean> {
    const rows = await this.call<{ ok: boolean }>(sql`select observation.restore_blob(${a.recordId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.manifestId}::uuid, ${a.actionId}::uuid, ${a.contentDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as ok`);
    return rows[0]?.ok ?? false;
  }
  async declareTierPolicy(a: Parameters<RetentionWrites['declareTierPolicy']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.declare_tier_policy(${a.policyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.budgetBytesPerDay}::bigint, ${a.maxOpensPerEvaluation}::int, ${a.maxAttempts}::int, ${a.escalateAfter}::interval, ${a.restoreHotFor}::interval, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async evaluateTier(a: Parameters<RetentionWrites['evaluateTier']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.evaluate_tier(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async escalateAction(a: Parameters<RetentionWrites['escalateAction']>[0]): Promise<void> {
    await this.call(sql`select retention.escalate_action(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}::text, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async recordExportPackage(a: Parameters<RetentionWrites['recordExportPackage']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.record_export_package(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.approvalId}::uuid, ${a.manifestDigest}, ${a.packageDigest}, ${JSON.stringify(a.signature)}::jsonb, ${a.objectCount}::int, ${a.excludedCount}::int, ${a.byteTotal}::bigint, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async revokeExport(a: Parameters<RetentionWrites['revokeExport']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.revoke_export(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
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
