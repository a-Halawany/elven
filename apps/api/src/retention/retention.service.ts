/**
 * GOVERNED RETENTION (0066 §4; ES-29-004): the durable workflow behind every retention act — scope resolution, holds,
 * approvals, execution with evidence, residual inventory and verification. Nothing here deletes on its own: each state
 * moves by one governed route, and the only destructive effect (superseded evidence bytes) happens inside an executing
 * action, through the observation port that refuses a held manifest, with the tombstone row as its record and the bytes
 * removed only after the transaction that recorded the execution committed.
 *
 * CP-6 B11 (0070): every kind executes. An ARCHIVE copies the bytes into the archive tier under the same locator, records
 * the move through the archive port and removes the hot copy after the commit (D3); a CUSTOMER EXPORT writes the package
 * — manifest.json and one <manifest_id>.bin per object — under the export namespace, signs it by a digest chain bound to
 * the approval (D4) and records it through the package port; a refusal at execution rolls the whole execution back and
 * pauses the action with its failure class (D11).
 *
 * Events: RetentionActionDue (L3-I04) when an action opens — by a person or by the schedule evaluation;
 * DeletionVerified (L3-I05) when a deletion or a log-floor move verifies, carrying the scope digest, the approvals, what
 * executed, what was held, and the residual inventory.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { canonicalHeaderDigest, errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { rebuildHeaderFromRow, type ObjectRow } from '../objects/objects.service.js';
import { VaultService, VaultIntegrityError, sha256, type VaultName } from '../observation/vault/vault.service.js';
import type { RetentionReads, RetentionWrites } from './retention.capabilities.js';
import { EXPORT_FORMAT, SIGNATURE_SCHEME, objectsDigestOf, packageDigestOf, type ExportManifestShape } from './export-package.js';

/**
 * An execution that cannot stand (0067 §1, generalised by B11): a hold placed since the approval (`legal_hold`), the export's
 * rights withdrawn (`authority_disputed`), a tombstone or a live reference since the approval (`unresolved_dependency`), a copy or
 * a package build that failed or any fault after the state moved (`infrastructure`). The caller rolls the transaction back
 * whole, runs the cleanup of what left the transaction (the copies THIS execution created, the package directory) and pauses the action.
 */
export type ExecutionFailureClass = 'legal_hold' | 'unresolved_dependency' | 'authority_disputed' | 'infrastructure';
export class RetentionExecutionRolledBack extends Error {
  constructor(readonly actionId: string, readonly failureClass: ExecutionFailureClass, message: string, readonly cleanup: () => Promise<void> = async () => undefined) { super(message); }
}
/** The class a port's refusal names in its own message (0070 §5): rights_changed, scope_changed, references_changed; anything else after the state moved is infrastructure. */
export function failureClassOf(e: unknown): ExecutionFailureClass {
  const message = String((e as { message?: unknown })?.message ?? '');
  if (message.startsWith('retention execution rejected (rights_changed)')) return 'authority_disputed';
  if (message.startsWith('retention execution rejected (scope_changed)') || message.startsWith('retention execution rejected (references_changed)')) return 'unresolved_dependency';
  return 'infrastructure';
}

type Row = Record<string, unknown>;
export const RETENTION_KINDS = ['review', 'deletion', 'archive', 'log_floor', 'customer_export'] as const;
export const RETENTION_TARGETS = ['evidence', 'log_partition'] as const;
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
/** The classification order the redaction gate uses (decision.classification_rank): an unknown level ranks as restricted. */
const classificationRank = (c: unknown): number => { const i = (CLASSIFICATIONS as readonly string[]).indexOf(String(c ?? '')); return i < 0 ? 3 : i; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The canonical row's `payload ->> 'manifest_id'` as a where-clause expression (the manifest an evidence version names). */
const sqlPayloadManifestId = sql`(payload ->> 'manifest_id')`;
const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };

export interface OpenActionIntake { kind: (typeof RETENTION_KINDS)[number]; targetKind: (typeof RETENTION_TARGETS)[number]; selector: Row; retentionProfile: string | null }
export function validateOpenAction(p: Row, correlationId: string): OpenActionIntake {
  const kind = String(p['kind'] ?? '');
  if (!(RETENTION_KINDS as readonly string[]).includes(kind)) bad(correlationId, `kind is one of ${RETENTION_KINDS.join(', ')}`);
  const targetKind = String(p['targetKind'] ?? '');
  if (!(RETENTION_TARGETS as readonly string[]).includes(targetKind)) bad(correlationId, `targetKind is one of ${RETENTION_TARGETS.join(', ')}`);
  const sel = (p['selector'] ?? {}) as Row;
  if (typeof sel !== 'object' || Array.isArray(sel)) bad(correlationId, 'selector is an object');
  const retentionProfile = p['retentionProfile'] == null ? null : String(p['retentionProfile']);
  if (targetKind === 'evidence') {
    const manifestId = sel['manifestId'] === undefined ? null : String(sel['manifestId']);
    const sourceId = sel['sourceId'] === undefined ? null : String(sel['sourceId']);
    // B11 (D7): a CHOSEN OBJECT SET is what an archive and a customer export take (1–200 ids, unique); a deletion and a review keep manifestId | sourceId.
    const manifestIds = sel['manifestIds'] === undefined ? null : sel['manifestIds'];
    if (manifestIds !== null && kind !== 'archive' && kind !== 'customer_export') bad(correlationId, 'manifestIds is an archive\'s or a customer export\'s selector (a deletion or a review names a manifestId or a sourceId)');
    if (manifestIds !== null && (!Array.isArray(manifestIds) || manifestIds.length < 1 || manifestIds.length > 200)) bad(correlationId, 'selector.manifestIds is an array of 1 to 200 ids');
    if (manifestIds !== null && !(manifestIds as unknown[]).every((m) => typeof m === 'string' && UUID.test(m))) bad(correlationId, 'selector.manifestIds are ids');
    if (manifestIds !== null && new Set(manifestIds as string[]).size !== (manifestIds as string[]).length) bad(correlationId, 'selector.manifestIds names each id once');
    if (manifestId === null && sourceId === null && manifestIds === null) bad(correlationId, 'an evidence selector names a manifestId, a sourceId (superseded versions of that source) or manifestIds (an archive or a customer export)');
    if (manifestId !== null && !UUID.test(manifestId)) bad(correlationId, 'selector.manifestId is an id');
    if (sourceId !== null && !UUID.test(sourceId)) bad(correlationId, 'selector.sourceId is an id');
    // B11 (D7): a customer export names its classification ceiling (the redaction gate) and binds the export namespace as its destination.
    const exportKeys: Row = {};
    if (kind === 'customer_export') {
      const ceiling = sel['classificationCeiling'] === undefined ? '' : String(sel['classificationCeiling']);
      if (!(CLASSIFICATIONS as readonly string[]).includes(ceiling)) bad(correlationId, `selector.classificationCeiling is one of ${CLASSIFICATIONS.join(', ')} (a customer export names its ceiling)`);
      if (sel['destination'] !== undefined && String(sel['destination']) !== 'export') bad(correlationId, 'selector.destination is export (the export namespace of the vault is the only destination this release binds)');
      exportKeys['classification_ceiling'] = ceiling; exportKeys['destination'] = 'export';
    }
    return { kind: kind as OpenActionIntake['kind'], targetKind: 'evidence',
             // The ids are stored lower-cased: every comparison downstream (the resolution's chosen object set, the safe scope's citations) is on the uuid, not on its spelling.
             selector: { ...(manifestId === null ? {} : { manifest_id: manifestId.toLowerCase() }), ...(sourceId === null ? {} : { source_id: sourceId.toLowerCase() }), ...(manifestIds === null ? {} : { manifest_ids: (manifestIds as string[]).map((m) => m.toLowerCase()) }), ...exportKeys },
             retentionProfile };
  }
  const partitionKey = String(sel['partitionKey'] ?? '');
  const toSeq = Number(sel['toSeq']);
  if (!/^tenant:[0-9a-f-]{36}$/i.test(partitionKey)) bad(correlationId, 'selector.partitionKey is tenant:<tenant id>');
  if (!Number.isInteger(toSeq) || toSeq < 2) bad(correlationId, 'selector.toSeq is the sequence the floor moves to (2 or more)');
  if (kind !== 'log_floor') bad(correlationId, 'the log partition takes the log_floor action');
  return { kind: 'log_floor', targetKind: 'log_partition', selector: { partition_key: partitionKey, to_seq: toSeq }, retentionProfile };
}

/** What an execution leaves for the controller: the counts, the bytes to remove after the commit (each in its tier), the floor moved, the package built. */
export interface ExecutionOutcome { executed: number; held: number; refused: number; locatorsToRemove: Array<{ ref: string; locator: string; vault: VaultName }>; floor: Row | null; package: Row | null }

@Injectable()
export class RetentionService {
  constructor(private readonly vault: VaultService) {}

  /** RetentionActionDue@v1 — the event an opened action announces (stable references, no replicas). */
  dueEvent(a: { actionId: string; tenantId: string; domainId: string; kind: string; targetKind: string; selector: Row; retentionProfile: string | null; scheduleId: string | null; dueFrom: string; openedBy: string; action: string }): { eventType: string; payload: Row } {
    return { eventType: 'RetentionActionDue', payload: {
      schema: 'RetentionActionDue', schema_version: 'v1', action_id: a.actionId, kind: a.kind, target_kind: a.targetKind, selector: a.selector,
      retention_profile: a.retentionProfile, schedule_id: a.scheduleId, due_from: a.dueFrom, opened_by: a.openedBy,
      temporal: { known_at: new Date().toISOString() }, cause: { action: a.action, actor: a.openedBy, target_type: 'RTA', target_id: a.actionId },
    } };
  }

  /**
   * EXECUTE: the approved scope, item by item, in dependency order; the record of each; the bytes after the commit. A refusal
   * before the state moves (begin_execution: no live approval, the rights re-check, a tombstone or a reference since the approval)
   * propagates as the port's own refusal; anything that fails AFTER the state moved is an execution that cannot stand — the
   * transaction is rolled back whole, what left it is removed, the action pauses with its failure class (never a bare 500 that
   * leaves the action approved with orphan files).
   */
  async execute(cap: RetentionWrites, a: { actionId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<ExecutionOutcome> {
    const action = ((await cap.readActions().selectAll().where('action_id' as never, '=', a.actionId as never).execute()) as Row[])[0] ?? null;
    if (action === null) throw new HttpException(errorBody('EYE_STA_001', a.correlationId, 'no authorized retention action matches'), 404);
    const kind = String(action['kind']);
    const scope = { tenantId: a.tenantId, domainId: a.domainId };
    const items = await cap.beginExecution({ actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, actor: a.actor, correlationId: a.correlationId });
    // The archive's copies THIS execution created (copyBlob says which — an identical copy already present is another action's, or a
    // committed earlier record's, and is never this execution's to remove): removed by the cleanup when the execution is rolled back (D3).
    const copiesMade: string[] = [];
    const cleanup = async (): Promise<void> => {
      if (kind === 'archive') for (const l of copiesMade) await this.vault.tombstone('archive', scope, l);
      if (kind === 'customer_export') await this.vault.removePackage(scope, a.actionId);
    };
    try {
      return await this.executeItems(cap, scope, action, items, a, copiesMade, cleanup);
    } catch (e) {
      if (e instanceof RetentionExecutionRolledBack) throw e;
      // After the state moved: a port refusal that names its class (the record of the package re-checked the tombstones and the rights), a
      // vault or database fault, a defect of the record — the transaction rolls back and the action pauses; the cleanup runs after the rollback.
      throw new RetentionExecutionRolledBack(a.actionId, failureClassOf(e), `the execution failed after it began: ${String((e as { message?: unknown })?.message ?? 'unknown failure').slice(0, 600)}; the scope is resolved again`, cleanup);
    }
  }

  private async executeItems(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, action: Row, items: Row[], a: { actionId: string; tenantId: string; domainId: string; actor: string; correlationId: string }, copiesMade: string[], cleanup: () => Promise<void>): Promise<ExecutionOutcome> {
    const kind = String(action['kind']);
    let executed = 0; let held = 0; let refused = 0; const locators: ExecutionOutcome['locatorsToRemove'] = []; let floor: Row | null = null; const refusals: string[] = [];
    for (const item of items) {
      const itemKind = String(item['item_kind']); const disposition = String(item['disposition']); const ref = String(item['ref']); const itemId = String(item['item_id']);
      const details = (item['details'] ?? {}) as Row;
      if (disposition === 'held') {
        // The hold is honoured by NOT calling the port; the record says so (and the port itself would refuse).
        held += 1;
        await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'none', outcome: 'skipped', evidence: { reason: 'held by a legal hold', hold_id: item['hold_id'] ?? null }, actor: a.actor, correlationId: a.correlationId });
        continue;
      }
      if (disposition !== 'execute') continue;
      // The action's KIND decides what executing an item means (B9 review): a REVIEW records that the item was reviewed and
      // touches no bytes; a DELETION tombstones; the LOG FLOOR moves the floor; an ARCHIVE copies then records the move (B11);
      // a CUSTOMER EXPORT builds its package once, after the loop (B11).
      if (kind === 'review') {
        await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'none', outcome: 'done', evidence: { reviewed: true, note: 'a review action records the review of the item; nothing is removed' }, actor: a.actor, correlationId: a.correlationId });
        executed += 1;
        continue;
      }
      if (itemKind === 'manifest' && kind === 'deletion') {
        const tombstoneId = newId();
        await cap.savepoint('retention_item');
        try {
          const inserted = await cap.tombstoneManifest({ tombstoneId, tenantId: a.tenantId, domainId: a.domainId, manifestId: ref, reason: `retention action ${a.actionId}: superseded evidence past its retention`, correlationId: a.correlationId });
          await cap.releaseSavepoint('retention_item');
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.tombstone_blob', outcome: 'done',
                                      evidence: { tombstone_id: inserted ? tombstoneId : null, already_tombstoned: !inserted, locator: details['locator'] ?? null, byte_length_before: details['byte_length'] ?? null, tier: (await cap.tierOf(ref)).tier }, actor: a.actor, correlationId: a.correlationId });
          executed += 1;
          // A deletion retires the bytes from BOTH roots (B11): the manifest's current tier says where they are, and a hot copy an archive
          // could not remove after its commit, or an archive copy left by an interrupted move, must not survive the tombstone in either.
          if (typeof details['locator'] === 'string') { locators.push({ ref, locator: details['locator'], vault: 'evidence' }); locators.push({ ref, locator: details['locator'], vault: 'archive' }); }
        } catch (e) {
          // A hold placed since the scope was resolved: the port refuses; the refusal is the record, the action fails closed.
          await cap.rollbackToSavepoint('retention_item');
          const message = (e as Error).message.slice(0, 300);
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.tombstone_blob', outcome: 'refused', evidence: { reason: message }, actor: a.actor, correlationId: a.correlationId });
          refused += 1; refusals.push(`${ref}: ${message}`);
        }
      } else if (itemKind === 'manifest' && kind === 'archive') {
        // ARCHIVE (0070 §2; D3): copy first — into the archive root under the SAME locator, verified on the copy — then the port
        // records the move; the hot copy goes after the commit. A hold does not stop an archive (it preserves): the hold is recorded.
        const locator = String(details['locator'] ?? ''); const digest = String(details['content_digest'] ?? '');
        const hold = ((await cap.readLegalHolds().select(['hold_id' as never]).where('manifest_id' as never, '=', ref as never).where('lifted_at' as never, 'is', null as never).orderBy('placed_at' as never).limit(1).executeTakeFirst()) as { hold_id: string } | undefined)?.hold_id ?? null;
        let copy: { contentDigest: string; byteLength: number; created: boolean };
        try {
          copy = await this.vault.copyBlob('evidence', 'archive', scope, locator, digest);
        } catch (e) {
          // The copy failed (the source unreadable or corrupt, the target occupied by other bytes, a fault): an infrastructure refusal; nothing of this execution stands.
          const message = (e as Error).message.slice(0, 300);
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'vault.copy', outcome: 'refused', evidence: { reason: message, failure: e instanceof VaultIntegrityError ? e.reason : 'unknown' }, actor: a.actor, correlationId: a.correlationId });
          refused += 1; refusals.push(`${ref}: ${message}`);
          continue;
        }
        // Only a copy THIS execution created is its own to remove on a rollback: an identical copy already present belongs to a committed record (another action's, or a crash between an earlier copy and its record).
        if (copy.created) copiesMade.push(locator);
        const recordId = newId();
        await cap.savepoint('retention_item');
        try {
          const moved = await cap.archiveManifest({ recordId, tenantId: a.tenantId, domainId: a.domainId, manifestId: ref, actionId: a.actionId, contentDigest: copy.contentDigest, actor: a.actor, correlationId: a.correlationId });
          await cap.releaseSavepoint('retention_item');
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.archive_blob', outcome: 'done',
                                      evidence: { tier_record_id: moved ? recordId : null, already_archived: !moved, locator, archive_locator: locator, digest_verified: true, copy_created: copy.created, byte_length: copy.byteLength, hold_id: hold }, actor: a.actor, correlationId: a.correlationId });
          executed += 1;
          locators.push({ ref, locator, vault: 'evidence' });
        } catch (e) {
          // The port refused (tombstoned meanwhile, the digest not the manifest's): rolled back to the savepoint, recorded, the execution fails closed.
          await cap.rollbackToSavepoint('retention_item');
          const message = (e as Error).message.slice(0, 300);
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.archive_blob', outcome: 'refused', evidence: { reason: message }, actor: a.actor, correlationId: a.correlationId });
          refused += 1; refusals.push(`${ref}: ${message}`);
        }
      } else if (itemKind === 'outbox_range' && kind === 'log_floor') {
        const partitionKey = ref.split(':').slice(0, 2).join(':'); // the ref is <partition_key>:<from>-<to-1>
        const r = await cap.declareFloor({ partitionKey, toSeq: Number(details['to_seq']), actionId: a.actionId });
        await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'objects.outbox_declare_floor', outcome: 'done', evidence: r, actor: a.actor, correlationId: a.correlationId });
        executed += 1; floor = r;
      }
    }
    let pkg: Row | null = null; let exportClass: ExecutionFailureClass = 'infrastructure';
    if (kind === 'customer_export') {
      // CUSTOMER EXPORT (0070 §3): the package built from the executable items as one, then recorded; nothing is removed. A build refused only by
      // the redaction gate (a record re-versioned above the ceiling since the resolution) is the scope changing under the approval, not a fault.
      const built = await this.buildExportPackage(cap, scope, action, items, a);
      executed += built.executed; refused += built.refused; refusals.push(...built.refusals); pkg = built.package;
      if (built.refused > 0 && built.refused === built.redactionRefused) exportClass = 'unresolved_dependency';
    }
    // A refusal at execution means the execution cannot stand — a hold placed since the approval (a deletion), a copy that failed
    // (an archive), a package that did not build (an export): NOTHING of it stands. The transaction is rolled back whole by the
    // throw, the controller runs the cleanup of what left the transaction, records the pause with the class, the scope is resolved again (0067 §1; D11).
    if (refused > 0) {
      const summary = `${refused} item(s) refused at execution: ${refusals.join('; ').slice(0, 800)}; the scope is resolved again`;
      if (kind === 'deletion') throw new RetentionExecutionRolledBack(a.actionId, 'legal_hold', `${refused} item(s) refused at execution — a hold placed since the scope was resolved: ${refusals.join('; ').slice(0, 800)}; the scope is resolved again`);
      throw new RetentionExecutionRolledBack(a.actionId, kind === 'customer_export' ? exportClass : 'infrastructure', summary, cleanup);
    }
    await cap.finishExecution({ actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, outcome: 'executed', reason: null, actor: a.actor, correlationId: a.correlationId });
    return { executed, held, refused, locatorsToRemove: locators, floor, package: pkg };
  }

  /**
   * THE EXPORT PACKAGE (0070 §3; D4, D5, D6): for each executable manifest the latest canonical EVD row naming it — the stored
   * row must round-trip to its content digest (what an import checks before admitting the record) — and its bytes read from the
   * tier they are in, written as <manifest_id>.bin; then manifest.json with the package's authorization (the live approval on the
   * resolved scope), its gates, the objects (the 43-field header and the payload as stored), what was excluded and why, and the
   * signature block: the digest chain bound to the action, the scope digest and the approval. The port records the same digests.
   */
  private async buildExportPackage(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, action: Row, items: Row[], a: { actionId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<{ executed: number; refused: number; redactionRefused: number; refusals: string[]; package: Row | null }> {
    const scopeDigest = String(action['scope_digest']);
    const approval = ((await cap.readApprovals().selectAll().where('action_id' as never, '=', a.actionId as never).where('scope_digest' as never, '=', scopeDigest as never).where('revoked_at' as never, 'is', null as never)
      .where('expires_at' as never, '>', new Date() as never).orderBy('recorded_at' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined);
    // begin_execution guaranteed a live approval; its absence here is a defect of the record, not a business refusal.
    if (approval === undefined) throw new HttpException(errorBody('EYE_STA_002', a.correlationId, 'no live approval on the resolved scope at the package build'), 409);
    const approvalId = String(approval['approval_id']);
    const scopeItems = (await cap.readScopeItems().selectAll().where('action_id' as never, '=', a.actionId as never).orderBy('dependency_order' as never).execute()) as Row[];
    const ceiling = String(((action['selector'] ?? {}) as Row)['classification_ceiling'] ?? '');
    // A package is built once, under one action, and nothing recorded can exist without its row (the port inserts it once, after the files;
    // begin_execution admits an approved action only). Whatever a build interrupted before its commit left under this action's directory —
    // a crash after a file's rename, a write fault, a failed cleanup — is therefore an orphan of a build that did not stand: cleared before
    // the first write, so a leftover never wedges the retry.
    await this.vault.removePackage(scope, a.actionId);
    let executed = 0; let refused = 0; let redactionRefused = 0; const refusals: string[] = []; let byteTotal = 0;
    const objects: Row[] = [];
    for (const item of items) {
      if (String(item['item_kind']) !== 'manifest' || String(item['disposition']) !== 'execute') continue;
      const ref = String(item['ref']); const itemId = String(item['item_id']); const details = (item['details'] ?? {}) as Row;
      const locator = String(details['locator'] ?? ''); const digest = String(details['content_digest'] ?? '');
      const hold = ((await cap.readLegalHolds().select(['hold_id' as never]).where('manifest_id' as never, '=', ref as never).where('lifted_at' as never, 'is', null as never).orderBy('placed_at' as never).limit(1).executeTakeFirst()) as { hold_id: string } | undefined)?.hold_id ?? null;
      const refuse = async (reason: string, extra: Row = {}) => {
        await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'vault.export', outcome: 'refused', evidence: { reason, ...extra }, actor: a.actor, correlationId: a.correlationId });
        refused += 1; refusals.push(`${ref}: ${reason}`);
      };
      // A tombstoned manifest never enters a package: begin_execution refused it before the state moved; a tombstone committed since is refused here and again at the record.
      if (((await cap.readTombstones().select(['manifest_id' as never]).where('manifest_id' as never, '=', ref as never).executeTakeFirst()) as Row | undefined) !== undefined) { await refuse('the manifest was tombstoned since the approval; there are no bytes to package'); continue; }
      // The RECORD: the latest canonical EVD version naming the manifest, rebuilt and re-digested — the re-import check, done here first.
      const row = (await cap.readCanonicalObjects().selectAll().where('tenant_id' as never, '=', a.tenantId as never).where('domain_id' as never, '=', a.domainId as never).where('object_type' as never, '=', 'EVD' as never)
        .where(sqlPayloadManifestId as never, '=', ref as never).orderBy('object_version' as never, 'desc').limit(1).executeTakeFirst()) as (ObjectRow & { payload: Row }) | undefined;
      if (row === undefined) { await refuse('no canonical evidence version names this manifest'); continue; }
      const header = rebuildHeaderFromRow(row);
      if (canonicalHeaderDigest(header, row.payload) !== row.content_digest) { await refuse('the stored canonical row does not round-trip to its content digest', { object_id: row.object_id, object_version: Number(row.object_version) }); continue; }
      // The REDACTION gate, on the record the package carries: the resolution gated on the stricter of the manifest's and the record's classification; a
      // record re-versioned above the ceiling since the resolution is refused here — a package never states a ceiling one of its headers exceeds.
      if (classificationRank((header as unknown as Row)['classification']) > classificationRank(ceiling)) { redactionRefused += 1; await refuse(`the exported record's classification ${String((header as unknown as Row)['classification'])} is above the export ceiling ${ceiling} (redaction gate)`, { object_id: row.object_id, object_version: Number(row.object_version), gate: 'redaction' }); continue; }
      // The BYTES: read from the tier they are in, verified against the manifest's digest, written into the package under the manifest's id.
      let bytes: Buffer;
      try {
        bytes = (await this.vault.read((await cap.tierOf(ref)).tier === 'archive' ? 'archive' : 'evidence', scope, locator, digest)).bytes;
      } catch (e) {
        await refuse(`the bytes were not read: ${(e as Error).message.slice(0, 200)}`, { failure: e instanceof VaultIntegrityError ? e.reason : 'unknown' }); continue;
      }
      const file = `${ref}.bin`;
      const written = await this.vault.writePackageFile(scope, a.actionId, file, bytes);
      const manifest = ((await cap.readManifests().selectAll().where('manifest_id' as never, '=', ref as never).executeTakeFirst()) as Row | undefined) ?? {};
      const contract = ((await cap.readSourceContracts().select(['source_key' as never, 'rights_state' as never]).where('source_id' as never, '=', String(manifest['source_id']) as never).where('contract_version' as never, '=', Number(manifest['contract_version']) as never).executeTakeFirst()) as Row | undefined) ?? {};
      objects.push({
        object_id: String(row.object_id), object_version: Number(row.object_version), content_digest: row.content_digest, header: header as unknown as Row, payload: row.payload, manifest_id: ref,
        bytes: { file, content_digest: written.contentDigest, byte_length: written.byteLength, media_type_declared: (manifest['media_type_declared'] as string | null) ?? null },
        source: { source_id: String(manifest['source_id']), source_key: (contract['source_key'] as string | null) ?? null, contract_version: Number(manifest['contract_version']), rights_state: (contract['rights_state'] as string | null) ?? null },
      });
      await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'vault.export', outcome: 'done',
                                  evidence: { file, content_digest: written.contentDigest, byte_length: written.byteLength, object_id: String(row.object_id), object_version: Number(row.object_version), hold_id: hold }, actor: a.actor, correlationId: a.correlationId });
      executed += 1; byteTotal += written.byteLength;
    }
    // Nothing is recorded for a package that did not build whole: the caller rolls back and removes the files.
    if (refused > 0) return { executed, refused, redactionRefused, refusals, package: null };
    const excluded = scopeItems.filter((i) => String(i['item_kind']) === 'manifest' && String(i['disposition']) === 'excluded').map((i) => {
      const d = (i['details'] ?? {}) as Row;
      return { manifest_id: String(i['ref']), object_id: (d['evd_object_id'] as string | null) ?? null, object_version: d['evd_version'] == null ? null : Number(d['evd_version']), gate: (d['gate'] as string | null) ?? null, reason: (i['reason'] as string | null) ?? null };
    });
    const locatorPrefix = `${a.tenantId}/${a.domainId}/${a.actionId}/`;
    const body: ExportManifestShape = {
      format: EXPORT_FORMAT,
      package: { action_id: a.actionId, tenant_id: a.tenantId, domain_id: a.domainId, destination: 'export', locator_prefix: locatorPrefix, built_at: new Date().toISOString(), built_by: `principal:${a.actor}` },
      authorization: { scope_digest: scopeDigest, approval_id: approvalId, approver: `principal:${String(approval['approver_principal_id'])}`, approved_at: new Date(approval['recorded_at'] as string | Date).toISOString(), rationale: String(approval['rationale'] ?? ''), opened_by: `principal:${String(action['opened_by'])}` },
      gates: {
        approval: 'live approval on the resolved scope digest', redaction: { classification_ceiling: ceiling }, format: 'json-manifest+raw-bytes', destination: 'export',
        data_rights: 'confirmed rights only (source contract rights_state)', audit: 'retention.action_events / retention.executions / observation.custody_events custody.exported (action_id)',
        revocation: 'retention.export.revoke tombstones the package',
      },
      objects, excluded,
    };
    // The signature block: the binding (bound_to) and the statement are INSIDE the package digest (the digest is computed over them, then
    // placed beside them), so a tampered binding fails the chain offline; the port asserts the same binding against the action.
    const boundTo = { action_id: a.actionId, scope_digest: scopeDigest, approval_id: approvalId };
    const statement = 'the package digest is bound to the approval on the resolved scope and recorded in the append-only retention ledger; verify offline with scripts/retention/verify-export.mjs and authenticate the digest against the product record';
    const packageDigest = packageDigestOf({ ...body, signature: { bound_to: boundTo, statement } });
    const signature: Row = { scheme: SIGNATURE_SCHEME, objects_digest: objectsDigestOf(objects), package_digest: packageDigest, bound_to: boundTo, statement };
    const fileBytes = Buffer.from(`${JSON.stringify({ ...body, signature }, null, 2)}\n`, 'utf8');
    const manifestFile = await this.vault.writePackageFile(scope, a.actionId, 'manifest.json', fileBytes);
    const pkg = await cap.recordExportPackage({ actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, approvalId, manifestDigest: manifestFile.contentDigest, packageDigest, signature, objectCount: executed, excludedCount: excluded.length, byteTotal, actor: a.actor, correlationId: a.correlationId });
    await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId: null, port: 'retention.record_export_package', outcome: 'done', evidence: pkg, actor: a.actor, correlationId: a.correlationId });
    return { executed, refused, redactionRefused, refusals, package: pkg };
  }

  /** The bytes of an executed action whose removal the vault refused after the commit (a pending bytes residual): tried again; verification closes what is gone. */
  async retryBytes(cap: RetentionReads, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ removed: string[]; failed: string[]; pending: number }> {
    const action = ((await cap.readActions().select(['kind' as never]).where('action_id' as never, '=', actionId as never).executeTakeFirst()) as { kind: string } | undefined);
    const pending = (await cap.readResiduals().selectAll().where('action_id' as never, '=', actionId as never).where('kind' as never, '=', 'bytes_present' as never).where('status' as never, '=', 'pending' as never).execute()) as Row[];
    const items = (await cap.readScopeItems().selectAll().where('action_id' as never, '=', actionId as never).where('item_kind' as never, '=', 'manifest' as never).execute()) as Row[];
    const entries: Array<{ locator: string; vault: VaultName }> = [];
    for (const r of pending) {
      const it = items.find((i) => String(i['ref']) === String(r['ref']));
      const locator = ((it?.['details'] ?? {}) as Row)['locator'];
      if (typeof locator !== 'string') continue;
      // The pending bytes of an ARCHIVE are its hot copy (B11) — removed only while the archive copy is present and verifies (never the last copy of a
      // live manifest); of a DELETION, the bytes in either root.
      if (action?.kind === 'archive') {
        const digest = String(((it?.['details'] ?? {}) as Row)['content_digest'] ?? '');
        const archived = await this.vault.read('archive', scope, locator, digest).then(() => true, () => false);
        if (archived) entries.push({ locator, vault: 'evidence' });
      } else {
        entries.push({ locator, vault: 'evidence' }); entries.push({ locator, vault: 'archive' });
      }
    }
    const r = await this.removeBytes(scope, entries);
    return { ...r, pending: pending.length };
  }

  /**
   * The bytes go after the record committed (the sweeper's discipline), each from its tier: a failure here leaves the record true and the
   * bytes for the retry route. Reported per LOCATOR: removed when every root named for it is clear, failed when any removal was refused.
   */
  async removeBytes(scope: { tenantId: string; domainId: string }, entries: Array<{ locator: string; vault: VaultName }>): Promise<{ removed: string[]; failed: string[] }> {
    const failedSet = new Set<string>(); const seen: string[] = [];
    for (const e of entries) {
      if (!seen.includes(e.locator)) seen.push(e.locator);
      try { await this.vault.tombstone(e.vault, scope, e.locator); } catch { failedSet.add(e.locator); }
    }
    return { removed: seen.filter((l) => !failedSet.has(l)), failed: seen.filter((l) => failedSet.has(l)) };
  }

  /**
   * VERIFY: what the vault observes per manifest in scope, handed to the port with the record's own checks. `bytes_present` is the
   * HOT tier for an archive action and EITHER ROOT for every other kind (a deletion is not verified, and DeletionVerified not published,
   * while a copy remains in any root); an archive adds the archive-tier facts, an export adds the package file's facts and the package as
   * a whole (B11).
   */
  async observeForVerification(cap: RetentionReads, scope: { tenantId: string; domainId: string }, actionId: string): Promise<Row> {
    const action = ((await cap.readActions().select(['kind' as never]).where('action_id' as never, '=', actionId as never).executeTakeFirst()) as { kind: string } | undefined);
    const kind = action?.kind ?? '';
    const items = (await cap.readScopeItems().selectAll().where('action_id' as never, '=', actionId as never).execute()) as Row[];
    const observed: Row = {};
    for (const i of items) {
      if (String(i['item_kind']) !== 'manifest') continue;
      const ref = String(i['ref']); const details = (i['details'] ?? {}) as Row;
      const locator = details['locator']; const digest = String(details['content_digest'] ?? '');
      if (typeof locator !== 'string') { observed[ref] = { bytes_present: null }; continue; }
      const inEvidence = await this.vault.exists('evidence', scope, locator); const inArchive = await this.vault.exists('archive', scope, locator);
      if (kind === 'archive') {
        observed[ref] = { bytes_present: inEvidence, archive_present: inArchive, archive_digest_ok: await this.vault.read('archive', scope, locator, digest).then(() => true, () => false) };
      } else if (kind === 'customer_export') {
        const file = await this.vault.readPackageFile(scope, actionId, `${ref}.bin`).then((b) => b, () => null);
        observed[ref] = { bytes_present: inEvidence || inArchive, export_present: file !== null, export_digest_ok: file !== null && sha256(file) === digest };
      } else {
        observed[ref] = { bytes_present: inEvidence || inArchive, tiers_present: [...(inEvidence ? ['evidence'] : []), ...(inArchive ? ['archive'] : [])] };
      }
    }
    if (kind === 'customer_export') {
      // The PACKAGE as a whole: manifest.json present, its file digest, the package digest recomputed by the builder's own rule, what it lists, what the directory holds (every entry, dot-files included).
      const files = await this.vault.listPackage(scope, actionId);
      const manifestBytes = await this.vault.readPackageFile(scope, actionId, 'manifest.json').then((b) => b, () => null);
      let parsed: ExportManifestShape | null = null;
      try { parsed = manifestBytes === null ? null : (JSON.parse(manifestBytes.toString('utf8')) as ExportManifestShape); } catch { parsed = null; }
      let recomputed: string | null = null;
      try { recomputed = parsed === null ? null : packageDigestOf(parsed); } catch { recomputed = null; }
      observed['__package__'] = { manifest_present: manifestBytes !== null, manifest_digest: manifestBytes === null ? null : sha256(manifestBytes), package_digest: recomputed,
                                  objects_listed: parsed === null || !Array.isArray(parsed.objects) ? null : parsed.objects.length, files_present: files.length };
    }
    return observed;
  }

  deletionVerifiedEvent(a: { actionId: string; tenantId: string; domainId: string; verdict: Row; actor: string }): { eventType: string; payload: Row } {
    return { eventType: 'DeletionVerified', payload: {
      schema: 'DeletionVerified', schema_version: 'v1', action_id: a.actionId, kind: a.verdict['kind'], target_kind: a.verdict['target_kind'], selector: a.verdict['selector'],
      scope_digest: a.verdict['scope_digest'], authorized_by: a.verdict['authorized_by'], executed: a.verdict['executed'], held: a.verdict['held'], excluded: a.verdict['excluded'], residual: a.verdict['residual'],
      state: a.verdict['state'], checks: a.verdict['checks'], verified_at: new Date().toISOString(), verified_by: a.actor,
      temporal: { known_at: new Date().toISOString() }, cause: { action: 'retention.action.verify', actor: a.actor, target_type: 'RTA', target_id: a.actionId },
    } };
  }

  async action(cap: RetentionReads, actionId: string): Promise<Row | null> {
    const a = ((await cap.readActions().selectAll().where('action_id' as never, '=', actionId as never).execute()) as Row[])[0];
    if (a === undefined) return null;
    const [events, items, approvals, executions, residuals, verifications] = await Promise.all([
      cap.readActionEvents().selectAll().where('action_id' as never, '=', actionId as never).orderBy('occurred_at' as never).execute(),
      cap.readScopeItems().selectAll().where('action_id' as never, '=', actionId as never).orderBy('dependency_order' as never).execute(),
      cap.readApprovals().selectAll().where('action_id' as never, '=', actionId as never).execute(),
      cap.readExecutions().selectAll().where('action_id' as never, '=', actionId as never).orderBy('executed_at' as never).execute(),
      cap.readResiduals().selectAll().where('action_id' as never, '=', actionId as never).execute(),
      cap.readVerifications().selectAll().where('action_id' as never, '=', actionId as never).orderBy('verified_at' as never).execute(),
    ]) as [Row[], Row[], Row[], Row[], Row[], Row[]];
    return { action: a, events, items, approvals, executions, residuals, verifications };
  }
  async list(cap: RetentionReads, limit = 200): Promise<Row[]> {
    return (await cap.readActions().selectAll().orderBy('opened_at' as never, 'desc').limit(limit).execute()) as Row[];
  }
  async schedules(cap: RetentionReads): Promise<Row[]> {
    return (await cap.readSchedules().selectAll().orderBy('declared_at' as never).execute()) as Row[];
  }

  /** B11 (0070 §3): the export package's record with its manifest as written and the files the package directory holds (the read route). */
  async exportPackage(cap: RetentionReads, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ package: Row; manifest: Row | null; files: string[] } | null> {
    const row = ((await cap.readExportPackages().selectAll().where('action_id' as never, '=', actionId as never).executeTakeFirst()) as Row | undefined);
    if (row === undefined) return null;
    const bytes = await this.vault.readPackageFile(scope, actionId, 'manifest.json').then((b) => b, () => null);
    let manifest: Row | null = null;
    try { manifest = bytes === null ? null : (JSON.parse(bytes.toString('utf8')) as Row); } catch { manifest = null; }
    return { package: row, manifest, files: await this.vault.listPackage(scope, actionId) };
  }
  /** B11: the package directory removed after the revocation committed (or retried when a removal failed); idempotent. */
  async removePackage(scope: { tenantId: string; domainId: string }, actionId: string): Promise<void> {
    await this.vault.removePackage(scope, actionId);
  }
}
