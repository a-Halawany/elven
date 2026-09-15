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
 *
 * CP-6 B13 (0073): the schedule's retirement and its ledger (§1), the export's key-based signing — the tenant's signing keys and
 * their ports, the active key (§2) — the package's archive digest, expiry and key on the 14-argument record port (C5), the
 * download event's port (C18: a SECURITY DEFINER port with its own authority check that calls retention.event — never a direct
 * call from here), the destinations (§3) and the deliveries (§4: the gates before anything leaves, the record of every outcome,
 * the acknowledgement).
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
  /** B13 (0073 §1): the schedule ledger — schedule.declared / schedule.retired, each with its actor and reason. */
  readScheduleEvents(): any;
  /** B13 (0073 §2): the tenant's export signing keys (RLS by tenant; the credential REFERENCE and the public key, never a value). */
  readExportSigningKeys(): any;
  /** B13 (0073 §3): the domain's declared exchange parties — transfer stations and https endpoints (the credential reference's NAME only). */
  readExportDestinations(): any;
  /** B13 (0073 §4): the deliveries of the domain's export packages, every outcome a row. */
  readExportDeliveries(): any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  outboxPartitionTelemetry(): Promise<Row[]>;
  /** B11: a manifest's tier as the ledger says — 'hot' when it never moved. */
  tierOf(manifestId: string): Promise<{ tier: 'hot' | 'archive'; archivedAt: string | null }>;
  /** B12 (0072 §1; D4 "observable state"): the cold-tier manager's state of the domain — the policy in force or the defaults, the tiers, the moves of the last 24 h, the budget, the actions by state, the schedules (retention.tier_state). */
  tierState(a: { tenantId: string; domainId: string }): Promise<Row>;
  /** B13 (0073 §2; D3): the tenant's ACTIVE signing key — its latest non-retired key's id — or null when it has declared none (the /1 digest chain then). */
  activeExportSigningKey(tenantId: string): Promise<string | null>;
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
  /**
   * B11 (0070 §3): the export package recorded after its files were written — the digests and the signature block bound to the action, its
   * scope digest and the live approval. B13 (0073 §2; C4, C5): the ARCHIVE DIGEST (the deterministic tar built in memory before this call) and
   * the SIGNING KEY the /2 block names (null for the /1 chain); the port computes the expiry from the action's selector and returns it with both.
   */
  recordExportPackage(a: { actionId: string; tenantId: string; domainId: string; approvalId: string; manifestDigest: string; packageDigest: string; signature: Row; objectCount: number; excludedCount: number; byteTotal: number; archiveDigest: string; signingKeyId: string | null; actor: string; correlationId: string }): Promise<Row>;
  /** B13 (0073 §1; D1): the schedule retired by its own governed act — state active → retired once, the row and its history kept, the event schedule.retired; the row as recorded. */
  retireSchedule(a: { scheduleId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  /** B13 (0073 §2; D3, C1): the tenant's signing key declared — the PUBLIC key the server derived from the reference's value, the reference's NAME, the purpose; the route's domain asserted, the row the tenant's. */
  declareExportSigningKey(a: { keyId: string; tenantId: string; domainId: string; algorithm: string; publicKeyPem: string; credentialRef: string; purpose: string; actor: string; correlationId: string }): Promise<Row>;
  /** B13 (0073 §2): the key retired with a reason; the row kept (a package signed by it still verifies against the recorded public key). */
  retireExportSigningKey(a: { keyId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  /** B13 (0073 §3; D5): a destination declared — the key, the kind, the endpoint (a directory for a transfer station, an https URL), the credential reference's NAME (https only), the recipient, the purpose. */
  declareExportDestination(a: { destinationId: string; tenantId: string; domainId: string; destinationKey: string; kind: string; endpoint: string; credentialRef: string | null; recipient: string; purpose: string; actor: string; correlationId: string }): Promise<Row>;
  /** B13 (0073 §3): the destination retired with a reason; its deliveries stay recorded. */
  retireExportDestination(a: { destinationId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  /**
   * B13 (0073 §4; D6, C6, C8): the gates BEFORE anything leaves — the action a verified customer export, its package present, unrevoked and
   * unexpired, the destination active, the rights of every exported source still confirmed, the signing-key gate — under the action's lock; the
   * delivery id allocated and the attempt numbered; returns {delivery_id, attempt, package, destination, signing_key} for the executor.
   */
  beginExportDelivery(a: { actionId: string; tenantId: string; domainId: string; destinationId: string; actor: string; correlationId: string }): Promise<Row>;
  /** B13 (0073 §4; D6, D9): the delivery's outcome recorded — the row, the action event (export.delivered | export.delivery_failed | export.acknowledged | export.mismatched), the custody rows for a delivered outcome. */
  recordExportDelivery(a: { deliveryId: string; actionId: string; tenantId: string; domainId: string; destinationId: string; attempt: number; state: string; archiveDigest: string; packageDigest: string; signingKeyId: string | null; receipt: Row | null; receiptDigest: string | null; failureClass: string | null; actor: string; correlationId: string }): Promise<Row>;
  /** B13 (0073 §4; D6, C7): a delivered row moves to acknowledged (the receipt names both digests and verified: true) or mismatched (other digests, or verified: false); a receipt naming another delivery is refused; the row as recorded. */
  acknowledgeExportDelivery(a: { deliveryId: string; tenantId: string; domainId: string; receipt: Row; receiptDigest: string; actor: string; correlationId: string }): Promise<Row>;
  /** B13 (0073 §2; D7, C18): the event export.downloaded on the action with the reader and the archive digest — a port with its own authority check (retention.export.download). */
  recordExportDownload(a: { actionId: string; tenantId: string; domainId: string; archiveDigest: string; actor: string; correlationId: string }): Promise<void>;
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
  readScheduleEvents(): any { return this.from('retention.schedule_events'); }
  readExportSigningKeys(): any { return this.from('retention.export_signing_keys'); }
  readExportDestinations(): any { return this.from('retention.export_destinations'); }
  readExportDeliveries(): any { return this.from('retention.export_deliveries'); }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  async outboxPartitionTelemetry(): Promise<Row[]> { return this.call<Row>(sql`select * from objects.outbox_partition_telemetry()`); }
  async tierOf(manifestId: string): Promise<{ tier: 'hot' | 'archive'; archivedAt: string | null }> { return tierOf(this, manifestId); }
  async tierState(a: Parameters<RetentionReads['tierState']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.tier_state(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async activeExportSigningKey(tenantId: string): Promise<string | null> {
    const rows = await this.call<{ k: string | null }>(sql`select retention.active_export_signing_key(${tenantId}::uuid) as k`);
    return rows[0]?.k ?? null;
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
    // The 14-argument form (0073; C5): the archive digest and the signing key id after the byte total; the expiry is the port's, from the action's selector.
    const rows = await this.call<{ r: Row }>(sql`select retention.record_export_package(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.approvalId}::uuid, ${a.manifestDigest}, ${a.packageDigest}, ${JSON.stringify(a.signature)}::jsonb, ${a.objectCount}::int, ${a.excludedCount}::int, ${a.byteTotal}::bigint, ${a.archiveDigest}::text, ${a.signingKeyId}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async retireSchedule(a: Parameters<RetentionWrites['retireSchedule']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.retire_schedule(${a.scheduleId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async declareExportSigningKey(a: Parameters<RetentionWrites['declareExportSigningKey']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.declare_export_signing_key(${a.keyId}::text, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.algorithm}::text, ${a.publicKeyPem}::text, ${a.credentialRef}::text, ${a.purpose}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async retireExportSigningKey(a: Parameters<RetentionWrites['retireExportSigningKey']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.retire_export_signing_key(${a.keyId}::text, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async declareExportDestination(a: Parameters<RetentionWrites['declareExportDestination']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.declare_export_destination(${a.destinationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.destinationKey}::text, ${a.kind}::text, ${a.endpoint}::text, ${a.credentialRef}::text, ${a.recipient}::text, ${a.purpose}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async retireExportDestination(a: Parameters<RetentionWrites['retireExportDestination']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.retire_export_destination(${a.destinationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async beginExportDelivery(a: Parameters<RetentionWrites['beginExportDelivery']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.begin_export_delivery(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.destinationId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async recordExportDelivery(a: Parameters<RetentionWrites['recordExportDelivery']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.record_export_delivery(${a.deliveryId}::uuid, ${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.destinationId}::uuid, ${a.attempt}::int, ${a.state}::text, ${a.archiveDigest}::text, ${a.packageDigest}::text, ${a.signingKeyId}::text, ${a.receipt === null ? null : JSON.stringify(a.receipt)}::jsonb, ${a.receiptDigest}::text, ${a.failureClass}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async acknowledgeExportDelivery(a: Parameters<RetentionWrites['acknowledgeExportDelivery']>[0]): Promise<Row> {
    const rows = await this.call<{ r: Row }>(sql`select retention.acknowledge_export_delivery(${a.deliveryId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.receipt)}::jsonb, ${a.receiptDigest}::text, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  async recordExportDownload(a: Parameters<RetentionWrites['recordExportDownload']>[0]): Promise<void> {
    await this.call(sql`select retention.record_export_download(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.archiveDigest}::text, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
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
