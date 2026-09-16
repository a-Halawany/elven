/**
 * GOVERNED RETENTION (0066 §4; ES-29-004): the durable workflow behind every retention act — scope resolution, holds,
 * approvals, execution with evidence, residual inventory and verification. Nothing here deletes on its own: each state
 * moves by one governed route, and the only destructive effect (superseded evidence bytes) happens inside an executing
 * action, through the observation port that refuses a held manifest, with the tombstone row as its record and the bytes
 * removed only after the transaction that recorded the execution committed.
 *
 * CP-6 B11 (0070): every kind executes. An ARCHIVE copies the bytes into the archive tier under the same locator, records
 * the move through the archive port and removes the hot copy after the commit (D3) — the manifests it moves locked for the
 * transaction, the copy STAGED under the execution attempt's own name until the commit and published under the locator after it, the
 * staged copies removed by name when the execution cannot stand (0071, Codex B11-F1); a CUSTOMER EXPORT writes the package
 * — manifest.json and one <manifest_id>.bin per object — under the export namespace, signs it by a digest chain bound to
 * the approval (D4) and records it through the package port; a refusal at execution rolls the whole execution back and
 * pauses the action with its failure class (D11).
 *
 * CP-6 B12 (0072): the cold tier's RETURN PATH and its MANAGER. A RESTORE is the archive executor mirrored (D1–D3): the archive
 * copy is copied into the HOT root under the same locator, STAGED under the attempt's own name, the move back recorded in the same
 * tier ledger (archive → hot) under the manifest's lock, the staged copy published after the commit and the archive copy removed
 * only once a published hot copy stands; a publish that fails keeps the archive copy and records a pending residual retried by the
 * execute route. The staging discipline therefore applies to BOTH blob roots. The cold-tier manager (D4) is the domain's policy —
 * a daily byte budget, the opens per evaluation, the attempts before escalation, the escalation age, the restore window — read by
 * the ports; here it surfaces as the execution refusals the controller classifies (budget_exhausted, attempts_exhausted) and as the
 * observable state (`tierState`: the port's state with the vault's inventory of both roots).
 *
 * CP-6 B13 (0073): the customer export's DELIVERY. The package's ARCHIVE is one deterministic ustar tar built in memory at the
 * build from the manifest and the files it lists, its digest recorded with the package and re-verified — the tar rebuilt from
 * the files on disk — before every download and every delivery (D2, C4, C12); the SIGNATURE is key-based (`eye-customer-export/2`)
 * when the tenant has declared an active signing key — the private key a credential BY REFERENCE resolved from the process
 * environment at the build, the public key recorded and served; an active key not bound in this deployment refuses the
 * execution before the state moves (D3, C14); a package EXPIRES after the action's selector's `expires_after` (D4, C3). A
 * DELIVERY is a governed, human-gated act on a verified, unrevoked, unexpired package to a declared destination — a transfer
 * station (a directory: the archive, the signature and the exchange identity written; the recipient's receipt read back by the
 * collect act) or an https endpoint (the archive POSTed once by the delivery egress) — every outcome recorded (D5, D6, D8); the
 * DOWNLOAD is a governed, audited read of the tar (D7). The schedule's RETIREMENT is its own governed act, its history kept (D1).
 *
 * Events: RetentionActionDue (L3-I04) when an action opens — by a person or by the schedule evaluation;
 * DeletionVerified (L3-I05) when a deletion or a log-floor move verifies, carrying the scope digest, the approvals, what
 * executed, what was held, and the residual inventory.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { canonicalHeaderDigest, contentDigest, errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { rebuildHeaderFromRow, type ObjectRow } from '../objects/objects.service.js';
import { VaultService, VaultIntegrityError, sha256, type VaultName } from '../observation/vault/vault.service.js';
import * as fault from '../observation/fault-injection.js';
import type { RetentionReads, RetentionWrites } from './retention.capabilities.js';
import { EXPORT_FORMAT, SIGNATURE_SCHEME, objectsDigestOf, packageDigestOf, type ExportManifestShape } from './export-package.js';
import { EXPORT_ARCHIVE_MAX_BYTES, EXPORT_STREAM_MAX_BYTES, LINKS_FILE, ExportArchiveError, archiveDigestOf, archiveOfPackage, listedFilesOf, ustarStream, type ArchiveEntry, type StreamEntry } from './export-archive.js';
import { Readable } from 'node:stream';
import { DestinationCredentialStore, ExportSigningKeyStore, KEY_SIGNATURE_SCHEME, SIGNING_ALGORITHM } from './export-signing.js';
import { ExportDeliveryService, TransferStationRefused, type DeliveryPackage, type RevocationNotice } from './export-delivery.service.js';
import { X509Certificate } from 'node:crypto';

/**
 * An execution that cannot stand (0067 §1, generalised by B11): a hold placed since the approval (`legal_hold`), the export's
 * rights withdrawn (`authority_disputed`), a tombstone or a live reference since the approval (`unresolved_dependency`), a copy or
 * a package build that failed or any fault after the state moved (`infrastructure`). The caller rolls the transaction back
 * whole, runs the cleanup of what left the transaction and pauses the action. B11-F1 (0071): the archive copies THIS attempt staged
 * under its own name are removed by `execute` before it throws (no other execution could have adopted them); `cleanup` — run by the
 * controller after the rollback — removes only what no other action can share: the export's package directory.
 */
export type ExecutionFailureClass = 'legal_hold' | 'unresolved_dependency' | 'authority_disputed' | 'infrastructure';
export class RetentionExecutionRolledBack extends Error {
  constructor(readonly actionId: string, readonly failureClass: ExecutionFailureClass, message: string, readonly cleanup: () => Promise<void> = async () => undefined) { super(message); }
}
/**
 * The class a port's refusal names in its own message (0070 §5): rights_changed, scope_changed, references_changed; the manager's
 * budget_exhausted (0072 §4: the domain's daily byte budget spent — a retry once the window frees) is infrastructure, as is anything
 * else after the state moved.
 */
export function failureClassOf(e: unknown): ExecutionFailureClass {
  const message = String((e as { message?: unknown })?.message ?? '');
  if (message.startsWith('retention execution rejected (rights_changed)')) return 'authority_disputed';
  if (message.startsWith('retention execution rejected (scope_changed)') || message.startsWith('retention execution rejected (references_changed)')) return 'unresolved_dependency';
  if (message.startsWith('retention execution rejected (budget_exhausted)')) return 'infrastructure';
  // B13 (C14): the tenant's active signing key is not bound in this deployment — a retry once it is (the key declared on another host).
  if (message.startsWith('retention execution rejected (signing_key_unbound)') || message.startsWith('retention execution rejected (signing_key_mismatch)')) return 'infrastructure';
  return 'infrastructure';
}

type Row = Record<string, unknown>;
export const RETENTION_KINDS = ['review', 'deletion', 'archive', 'log_floor', 'customer_export', 'restore'] as const;
export const RETENTION_TARGETS = ['evidence', 'log_partition'] as const;
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
/** The classification order the redaction gate uses (decision.classification_rank): an unknown level ranks as restricted. */
const classificationRank = (c: unknown): number => { const i = (CLASSIFICATIONS as readonly string[]).indexOf(String(c ?? '')); return i < 0 ? 3 : i; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * B13 (D4, C3): a customer export's `expiresAfter` — an interval spelled as a dueAfter, between 1 hour and 1 year, ONE floor in SQL
 * (open_action, declare_schedule) and here alike, no test-only branch. The comparison mirrors PostgreSQL's interval ordering, in which
 * a month is 30 days and a year 12 months (360 days): '12 months' is the ceiling, '365 days' lies above it.
 */
const EXPIRES_AFTER = /^(\d+) (seconds?|minutes?|hours?|days?|months?|years?)$/;
const EXPIRES_AFTER_UNIT_SECONDS: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, month: 30 * 86400, year: 360 * 86400 };
const EXPIRES_AFTER_FLOOR_SECONDS = 3600; const EXPIRES_AFTER_CEILING_SECONDS = 360 * 86400;
export function expiresAfterSeconds(value: string): number | null {
  const m = EXPIRES_AFTER.exec(value);
  if (m === null) return null;
  const unit = (m[2] as string).replace(/s$/, '');
  return Number(m[1]) * (EXPIRES_AFTER_UNIT_SECONDS[unit] as number);
}
/** The canonical row's `payload ->> 'manifest_id'` as a where-clause expression (the manifest an evidence version names). */
const sqlPayloadManifestId = sql`(payload ->> 'manifest_id')`;
/**
 * B15 (D1): the relationship closure's own format, named inside links.json and in the manifest's package.links. B16 (D8; Codex B15-F1):
 * `/2` — the closure BY EXACT VERSION: a claim entry per (object_id, object_version) a resolving lineage row or an included edge
 * names (an id may repeat with different versions), the evidence pair rule (a record by its id AND the digest of the bytes the
 * package carries), the identifier systems, and an excluded required version recorded with its dependent edges.
 */
const LINKS_FORMAT = 'eye-customer-export-links/2';
/** B15 (D2): a stream consumed for its digest alone (the build's archive digest; the stream route's pre-pass). */
async function drainForDigest(built: { stream: Readable; digest: () => Promise<string> }): Promise<string> {
  for await (const _chunk of built.stream) { /* the hash accumulates inside the stream */ }
  return built.digest();
}
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
    // B11 (D7), B12 (D5): a CHOSEN OBJECT SET is what an archive, a customer export and a restore take (1–200 ids, unique); a deletion and a review keep manifestId | sourceId.
    const manifestIds = sel['manifestIds'] === undefined ? null : sel['manifestIds'];
    if (manifestIds !== null && kind !== 'archive' && kind !== 'customer_export' && kind !== 'restore') bad(correlationId, 'manifestIds is an archive\'s or a customer export\'s selector, or a restore\'s (a deletion or a review names a manifestId or a sourceId)');
    if (manifestIds !== null && (!Array.isArray(manifestIds) || manifestIds.length < 1 || manifestIds.length > 200)) bad(correlationId, 'selector.manifestIds is an array of 1 to 200 ids');
    if (manifestIds !== null && !(manifestIds as unknown[]).every((m) => typeof m === 'string' && UUID.test(m))) bad(correlationId, 'selector.manifestIds are ids');
    if (manifestIds !== null && new Set(manifestIds as string[]).size !== (manifestIds as string[]).length) bad(correlationId, 'selector.manifestIds names each id once');
    if (manifestId === null && sourceId === null && manifestIds === null) bad(correlationId, 'an evidence selector names a manifestId, a sourceId (superseded versions of that source) or manifestIds (an archive, a customer export or a restore)');
    if (manifestId !== null && !UUID.test(manifestId)) bad(correlationId, 'selector.manifestId is an id');
    if (sourceId !== null && !UUID.test(sourceId)) bad(correlationId, 'selector.sourceId is an id');
    // B11 (D7): a customer export names its classification ceiling (the redaction gate) and binds the export namespace as its destination.
    // B13 (D4, C3): and its expiry — `expiresAfter`, an interval between 1 hour and 1 year, stored as `expires_after`; absent, the port's 30 days.
    const exportKeys: Row = {};
    if (kind === 'customer_export') {
      const ceiling = sel['classificationCeiling'] === undefined ? '' : String(sel['classificationCeiling']);
      if (!(CLASSIFICATIONS as readonly string[]).includes(ceiling)) bad(correlationId, `selector.classificationCeiling is one of ${CLASSIFICATIONS.join(', ')} (a customer export names its ceiling)`);
      if (sel['destination'] !== undefined && String(sel['destination']) !== 'export') bad(correlationId, 'selector.destination is export (the export namespace of the vault is the only destination this release binds)');
      exportKeys['classification_ceiling'] = ceiling; exportKeys['destination'] = 'export';
      if (sel['expiresAfter'] !== undefined && sel['expiresAfter'] !== null) {
        const expiresAfter = String(sel['expiresAfter']);
        const seconds = expiresAfterSeconds(expiresAfter);
        if (seconds === null) bad(correlationId, 'selector.expiresAfter is an interval such as "30 days"');
        if ((seconds as number) < EXPIRES_AFTER_FLOOR_SECONDS || (seconds as number) > EXPIRES_AFTER_CEILING_SECONDS) bad(correlationId, 'selector.expiresAfter is between 1 hour and 1 year');
        exportKeys['expires_after'] = expiresAfter;
      }
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

/** What an execution leaves for the controller: the counts, the bytes to remove after the commit (each in its tier), the copies to publish (each in the root it is staged in — the archive root for an archive, the hot root for a restore), the floor moved, the package built. */
export interface ExecutionOutcome { executed: number; held: number; refused: number; locatorsToRemove: Array<{ ref: string; locator: string; vault: VaultName; stagedToo?: boolean }>; copiesToPublish: Array<{ ref: string; locator: string; digest: string; vault: VaultName; attemptId: string }>; floor: Row | null; package: Row | null }

@Injectable()
export class RetentionService {
  constructor(private readonly vault: VaultService, private readonly signing: ExportSigningKeyStore, private readonly credentials: DestinationCredentialStore, private readonly delivery: ExportDeliveryService) {}

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
   * before the state moves (begin_execution: no live approval, the rights re-check, a tombstone or a reference since the approval;
   * the manager's admission — the attempts spent or the daily byte budget exhausted, B12) propagates as the port's own refusal
   * (the controller classifies it); anything that fails AFTER the state moved is an execution that cannot stand — the
   * transaction is rolled back whole, what left it is removed, the action pauses with its failure class (never a bare 500 that
   * leaves the action approved with orphan files).
   */
  async execute(cap: RetentionWrites, a: { actionId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<ExecutionOutcome> {
    const action = ((await cap.readActions().selectAll().where('action_id' as never, '=', a.actionId as never).execute()) as Row[])[0] ?? null;
    if (action === null) throw new HttpException(errorBody('EYE_STA_001', a.correlationId, 'no authorized retention action matches'), 404);
    const kind = String(action['kind']);
    const scope = { tenantId: a.tenantId, domainId: a.domainId };
    // B13 (D3, C14): a customer export whose tenant has an ACTIVE signing key is built only where that key's reference is bound — refused here,
    // BEFORE the state moves (the controller pauses the action for a retry, no attempt counted; the key declared on another host is bound on
    // this one, or retired). A package is never silently downgraded to the digest chain once a key is declared.
    if (kind === 'customer_export') {
      const active = await this.activeSigningKey(cap, a.tenantId);
      if (active !== null && !this.signing.has(String(active['credential_ref'] ?? ''))) {
        throw new Error(`retention execution rejected (signing_key_unbound): the tenant's active export signing key ${String(active['key_id'])} is not bound in this deployment (${String(active['credential_ref'])}); the package was not built`);
      }
      // B16: the reference must derive the DECLARED key — a binding that holds another private key would sign a package the recorded public
      // key (and an importing partner's declaration of it) cannot verify. Refused before the state moves, like an unbound reference.
      if (active !== null) {
        const derived = this.signing.derivePublic(String(active['credential_ref'] ?? ''));
        const declared = String(active['key_id']);
        if (!derived.ok || derived.keyId !== declared) {
          throw new Error(`retention execution rejected (signing_key_mismatch): the reference ${String(active['credential_ref'])} bound in this deployment ${derived.ok ? `derives ${derived.keyId}, not` : 'does not derive an Ed25519 key for'} the tenant's active export signing key ${declared}; the package was not built`);
        }
      }
    }
    // begin_execution (0070 §5; 0071 §1) re-checks what the approval assumed and LOCKS, for this transaction, every manifest the action will
    // move or remove — an execution naming a manifest another execution holds waits here, with nothing copied and nothing recorded.
    const items = await cap.beginExecution({ actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, actor: a.actor, correlationId: a.correlationId });
    // The copies THIS execution created — an archive's in the archive root, a restore's in the hot root (B12) — (copyBlob says which: an
    // identical copy already present is another action's, or a committed earlier record's, and is never this execution's to remove):
    // removed when the execution is rolled back (D3).
    const copiesMade: Array<{ ref: string; locator: string; digest: string; vault: VaultName }> = [];
    // THE ATTEMPT (0071): every execution of an action is its own attempt, and a copy is staged under the ATTEMPT's name — a second
    // attempt of the same action, admitted after the first's backend was lost (the server rolled the first back to approved), owns its own
    // staged files, and the first's late cleanup cannot touch them.
    const attemptId = newId();
    // THE EXECUTION RUNS IN A SUBTRANSACTION (0071, b): a savepoint taken after the locks. PostgreSQL releases a transaction's locks at the
    // abort itself — not at the client's ROLLBACK — so a top-level SQL error after a copy (a statement cancelled or timed out, a deadlock, a
    // fault in a record) aborts only the subtransaction: rolled back to it, the transaction is usable again for the record of the failure.
    await cap.savepoint('retention_execution');
    try {
      const outcome = await this.executeItems(cap, scope, action, items, a, copiesMade, attemptId);
      await cap.releaseSavepoint('retention_execution');
      return outcome;
    } catch (e) {
      // After the state moved: a refusal at execution, a port refusal that names its class (the record of the package re-checked the tombstones
      // and the rights), a vault or database fault, a defect of the record — the transaction rolls back whole and the action pauses.
      const rolled = e instanceof RetentionExecutionRolledBack ? e
        : new RetentionExecutionRolledBack(a.actionId, failureClassOf(e), `the execution failed after it began: ${String((e as { message?: unknown })?.message ?? 'unknown failure').slice(0, 600)}; the scope is resolved again`);
      let message = rolled.message;
      // B11-F1 (0071): the copies this execution created are STAGED under this ATTEMPT's own name (never published under the locator before the
      // commit that records the move), so no other execution — and no other attempt of this action — can have adopted them, whatever became of
      // this transaction's locks, its backend or its connection meanwhile. They are removed here by name; a removal that fails is part of the
      // pause reason (a staged file left behind is retired with the bytes by a deletion, or by the publish of another attempt's copy). The
      // subtransaction is rolled back first so the transaction is usable again for the record of the failure. B12: the same point for a
      // restore, whose copies are staged in the HOT root (the fault point keeps its B11 name — it is the same boundary for both kinds); an
      // archive's copy goes through the archive-named form (the B11 harness observes that removal by name), a restore's through the root-named one.
      if ((kind === 'archive' || kind === 'restore') && copiesMade.length > 0) {
        await fault.pause('b11.archive_cleanup_before_remove');
        await cap.rollbackToSavepoint('retention_execution').catch(() => undefined);
        const failed: string[] = [];
        for (const c of copiesMade) {
          try { await (c.vault === 'archive' ? this.vault.removeStaged(scope, c.locator, attemptId) : this.vault.removeStagedIn(c.vault, scope, c.locator, attemptId)); }
          catch (e) { failed.push(`${c.locator}: ${String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 120)}`); }
        }
        if (failed.length > 0) message = `${message}; the removal of ${failed.length} staged ${kind === 'restore' ? 'hot' : 'archive'} cop${failed.length === 1 ? 'y' : 'ies'} this execution created failed: ${failed.join('; ').slice(0, 300)}`;
      }
      // What goes AFTER the rollback (the controller runs it): the export's package directory — this action's own namespace, shared with no other action.
      const cleanup = async (): Promise<void> => { if (kind === 'customer_export') await this.vault.removePackage(scope, a.actionId); };
      throw new RetentionExecutionRolledBack(a.actionId, rolled.failureClass, message, cleanup);
    }
  }

  private async executeItems(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, action: Row, items: Row[], a: { actionId: string; tenantId: string; domainId: string; actor: string; correlationId: string }, copiesMade: Array<{ ref: string; locator: string; digest: string; vault: VaultName }>, attemptId: string): Promise<ExecutionOutcome> {
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
      // a RESTORE copies back then records the move back (B12); a CUSTOMER EXPORT builds its package once, after the loop (B11).
      if (kind === 'review') {
        await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'none', outcome: 'done', evidence: { reviewed: true, note: 'a review action records the review of the item; nothing is removed' }, actor: a.actor, correlationId: a.correlationId });
        executed += 1;
        continue;
      }
      if (itemKind === 'manifest' && kind === 'deletion') {
        const tombstoneId = newId();
        await cap.savepoint('retention_item');
        let released = false;
        try {
          const inserted = await cap.tombstoneManifest({ tombstoneId, tenantId: a.tenantId, domainId: a.domainId, manifestId: ref, reason: `retention action ${a.actionId}: superseded evidence past its retention`, correlationId: a.correlationId });
          await cap.releaseSavepoint('retention_item'); released = true;
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.tombstone_blob', outcome: 'done',
                                      evidence: { tombstone_id: inserted ? tombstoneId : null, already_tombstoned: !inserted, locator: details['locator'] ?? null, byte_length_before: details['byte_length'] ?? null, tier: (await cap.tierOf(ref)).tier }, actor: a.actor, correlationId: a.correlationId });
          executed += 1;
          // A deletion retires the bytes from BOTH roots (B11): the manifest's current tier says where they are, and a hot copy an archive
          // could not remove after its commit, an archive copy left by an interrupted move, or a copy still staged in either root (0071; a
          // restore's staged hot copy, B12) must not survive the tombstone in either.
          if (typeof details['locator'] === 'string') { locators.push({ ref, locator: details['locator'], vault: 'evidence', stagedToo: true }); locators.push({ ref, locator: details['locator'], vault: 'archive', stagedToo: true }); }
        } catch (e) {
          // A hold placed since the scope was resolved: the port refuses; the refusal is the record, the action fails closed. A failure AFTER the
          // port answered (the record itself — a statement cancelled, a fault) is the execution's own: it propagates as such (the item savepoint is gone).
          if (released) throw e;
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
        // ALREADY ARCHIVED (0071; Codex B11-F1): the manifest's lock, taken by begin_execution, makes any other execution's move of it committed and
        // complete before this one began — so a tier read here is definitive: another approved action archived it between this scope's resolution
        // and this execution (and removed the hot copy after its commit, or left that to its retry). Nothing is copied from a hot copy that may be
        // gone: the archive copy is verified under the manifest's digest and the port answers "already archived" for the record.
        const tierNow = await cap.tierOf(ref);
        let hotRemovable = true;
        if (tierNow.tier === 'archive') {
          try {
            const present = await this.vault.readArchived(scope, locator, digest);
            // The recording action's copy may still be STAGED (its publish pending or failed): published here, under this execution's lock,
            // by a rename; the hot copy is scheduled for removal only once a published copy stands (0071, e — never on the strength of a staged one).
            const publishedHere = present.source === 'published' ? false : await this.vault.publishArchiveCopy(scope, locator, digest, null).then(() => true, () => false);
            hotRemovable = present.source === 'published' || publishedHere;
            copy = { contentDigest: present.contentDigest, byteLength: present.bytes.byteLength, created: false };
          } catch (e) {
            const message = (e as Error).message.slice(0, 300);
            await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'vault.read', outcome: 'refused', evidence: { reason: `the manifest is in the archive tier but its archive copy does not verify: ${message}`, failure: e instanceof VaultIntegrityError ? e.reason : 'unknown', tier: 'archive' }, actor: a.actor, correlationId: a.correlationId });
            refused += 1; refusals.push(`${ref}: ${message}`);
            continue;
          }
        } else {
          try {
            // STAGED under this attempt's name (0071): published under the locator by the controller after the commit that records the move.
            copy = await this.vault.copyBlob('evidence', 'archive', scope, locator, digest, { attemptId });
          } catch (e) {
            // The copy failed (the source unreadable or corrupt, the target occupied by other bytes, a fault): an infrastructure refusal; nothing of this execution stands.
            const message = (e as Error).message.slice(0, 300);
            await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'vault.copy', outcome: 'refused', evidence: { reason: message, failure: e instanceof VaultIntegrityError ? e.reason : 'unknown' }, actor: a.actor, correlationId: a.correlationId });
            refused += 1; refusals.push(`${ref}: ${message}`);
            continue;
          }
        }
        // Only a copy THIS execution created is its own to remove on a rollback: an identical copy already present belongs to a committed record (another action's, or a crash between an earlier copy and its record).
        if (copy.created) copiesMade.push({ ref, locator, digest, vault: 'archive' });
        const recordId = newId();
        await cap.savepoint('retention_item');
        let released = false;
        try {
          const moved = await cap.archiveManifest({ recordId, tenantId: a.tenantId, domainId: a.domainId, manifestId: ref, actionId: a.actionId, contentDigest: copy.contentDigest, actor: a.actor, correlationId: a.correlationId });
          await cap.releaseSavepoint('retention_item'); released = true;
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.archive_blob', outcome: 'done',
                                      evidence: { tier_record_id: moved ? recordId : null, already_archived: !moved, locator, archive_locator: locator, digest_verified: true, copy_created: copy.created, staged: copy.created, attempt_id: attemptId, byte_length: copy.byteLength, hold_id: hold }, actor: a.actor, correlationId: a.correlationId });
          executed += 1;
          if (hotRemovable) locators.push({ ref, locator, vault: 'evidence' });
        } catch (e) {
          // The port refused (tombstoned meanwhile, the digest not the manifest's): rolled back to the savepoint, recorded, the execution fails closed.
          // A failure AFTER the port answered (the record itself — a statement cancelled, a fault) is the execution's own: it propagates as such.
          if (released) throw e;
          await cap.rollbackToSavepoint('retention_item');
          const message = (e as Error).message.slice(0, 300);
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.archive_blob', outcome: 'refused', evidence: { reason: message }, actor: a.actor, correlationId: a.correlationId });
          refused += 1; refusals.push(`${ref}: ${message}`);
        }
      } else if (itemKind === 'manifest' && kind === 'restore') {
        // RESTORE (0072 §2; D1, D2) — the archive executor MIRRORED: copy first — from the archive root into the HOT root under the SAME
        // locator, STAGED under this attempt's name and verified on the copy — then the port records the move back in the same ledger
        // (archive → hot); the archive copy goes after the commit, once the hot copy is published. A hold does not stop a restore (it
        // preserves): the hold is recorded.
        const locator = String(details['locator'] ?? ''); const digest = String(details['content_digest'] ?? '');
        const hold = ((await cap.readLegalHolds().select(['hold_id' as never]).where('manifest_id' as never, '=', ref as never).where('lifted_at' as never, 'is', null as never).orderBy('placed_at' as never).limit(1).executeTakeFirst()) as { hold_id: string } | undefined)?.hold_id ?? null;
        let copy: { contentDigest: string; byteLength: number; created: boolean };
        // ALREADY RESTORED (the finder path; R5): the manifest's lock, taken by begin_execution, makes any other execution's move of it committed and
        // complete before this one began — so a tier read here is definitive: another approved restore moved it back between this scope's resolution
        // and this execution (and removed the archive copy after its commit, or left that to its retry). Nothing is copied from an archive copy
        // that may be gone: the hot copy is verified under the manifest's digest — the locator, else a copy recorded but still staged, else the
        // archive copy kept for exactly that case — and the port answers "already in the hot tier" for the record.
        const tierNow = await cap.tierOf(ref);
        let archiveRemovable = true;
        if (tierNow.tier === 'hot') {
          try {
            const present = await this.vault.readTiered('evidence', scope, locator, digest);
            // The recording action's copy may still be STAGED (its publish pending or failed): published here, under this execution's lock,
            // by a rename; the archive copy is scheduled for removal only once a published hot copy stands (never on the strength of a staged
            // one, nor of the archive copy itself served as the fallback).
            const publishedHere = present.source === 'published' ? false : await this.vault.publishCopy('evidence', scope, locator, digest, null).then(() => true, () => false);
            archiveRemovable = present.source === 'published' || publishedHere;
            copy = { contentDigest: present.contentDigest, byteLength: present.bytes.byteLength, created: false };
          } catch (e) {
            const message = (e as Error).message.slice(0, 300);
            await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'vault.read', outcome: 'refused', evidence: { reason: `the manifest is in the hot tier but its hot copy does not verify: ${message}`, failure: e instanceof VaultIntegrityError ? e.reason : 'unknown', tier: 'hot' }, actor: a.actor, correlationId: a.correlationId });
            refused += 1; refusals.push(`${ref}: ${message}`);
            continue;
          }
        } else {
          try {
            // STAGED under this attempt's name in the HOT root: published under the locator by the controller after the commit that records the move back.
            copy = await this.vault.copyBlob('archive', 'evidence', scope, locator, digest, { attemptId });
          } catch (e) {
            // The copy failed (the archive copy unreadable or corrupt, the hot locator occupied by other bytes, a fault): an infrastructure refusal; nothing of this execution stands.
            const message = (e as Error).message.slice(0, 300);
            await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'vault.copy', outcome: 'refused', evidence: { reason: message, failure: e instanceof VaultIntegrityError ? e.reason : 'unknown' }, actor: a.actor, correlationId: a.correlationId });
            refused += 1; refusals.push(`${ref}: ${message}`);
            continue;
          }
        }
        // Only a copy THIS execution created is its own to remove on a rollback (as the archive's).
        if (copy.created) copiesMade.push({ ref, locator, digest, vault: 'evidence' });
        const recordId = newId();
        await cap.savepoint('retention_item');
        let released = false;
        try {
          const moved = await cap.restoreManifest({ recordId, tenantId: a.tenantId, domainId: a.domainId, manifestId: ref, actionId: a.actionId, contentDigest: copy.contentDigest, actor: a.actor, correlationId: a.correlationId });
          await cap.releaseSavepoint('retention_item'); released = true;
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.restore_blob', outcome: 'done',
                                      evidence: { tier_record_id: moved ? recordId : null, already_restored: !moved, locator, hot_locator: locator, digest_verified: true, copy_created: copy.created, staged: copy.created, attempt_id: attemptId, byte_length: copy.byteLength, hold_id: hold }, actor: a.actor, correlationId: a.correlationId });
          executed += 1;
          // The archive copy — and any staged copy left in the archive root — goes after the commit, once a published hot copy stands (D3: one tier holds the served bytes).
          if (archiveRemovable) locators.push({ ref, locator, vault: 'archive', stagedToo: true });
        } catch (e) {
          // The port refused (tombstoned meanwhile, the digest not the manifest's): rolled back to the savepoint, recorded, the execution fails closed.
          // A failure AFTER the port answered (the record itself — a statement cancelled, a fault) is the execution's own: it propagates as such.
          if (released) throw e;
          await cap.rollbackToSavepoint('retention_item');
          const message = (e as Error).message.slice(0, 300);
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.restore_blob', outcome: 'refused', evidence: { reason: message }, actor: a.actor, correlationId: a.correlationId });
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
    // (an archive or a restore: infrastructure), a package that did not build (an export): NOTHING of it stands. The transaction is
    // rolled back whole by the throw (`execute` removes the copies this execution created before the rollback, the controller the
    // package directory after it), the pause is recorded with the class, the scope is resolved again (0067 §1; D11; 0071).
    if (refused > 0) {
      const summary = `${refused} item(s) refused at execution: ${refusals.join('; ').slice(0, 800)}; the scope is resolved again`;
      if (kind === 'deletion') throw new RetentionExecutionRolledBack(a.actionId, 'legal_hold', `${refused} item(s) refused at execution — a hold placed since the scope was resolved: ${refusals.join('; ').slice(0, 800)}; the scope is resolved again`);
      throw new RetentionExecutionRolledBack(a.actionId, kind === 'customer_export' ? exportClass : 'infrastructure', summary);
    }
    await cap.finishExecution({ actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, outcome: 'executed', reason: null, actor: a.actor, correlationId: a.correlationId });
    return { executed, held, refused, locatorsToRemove: locators, copiesToPublish: copiesMade.map((c) => ({ ref: c.ref, locator: c.locator, digest: c.digest, vault: c.vault, attemptId })), floor, package: pkg };
  }

  /**
   * THE EXPORT PACKAGE (0070 §3; D4, D5, D6): for each executable manifest the latest canonical EVD row naming it — the stored
   * row must round-trip to its content digest (what an import checks before admitting the record) — and its bytes read from the
   * tier they are in, written as <manifest_id>.bin; then manifest.json with the package's authorization (the live approval on the
   * resolved scope), its gates, the objects (the 43-field header and the payload as stored), what was excluded and why, and the
   * signature block: the digest chain bound to the action, the scope digest and the approval. The port records the same digests.
   *
   * B13 (D2, D3; C4, C5): with an ACTIVE signing key the block is key-based (`eye-customer-export/2`: the key id, the algorithm and
   * the Ed25519 signature over the ASCII hex of the package digest, the private key resolved by reference at this instant and never
   * recorded); the ARCHIVE — the deterministic tar of manifest.json and the files the manifest lists, at the manifest's own built_at —
   * is built from the in-memory file set before the port is called (never written into the package directory: B11's B4/B5 pin the
   * directory's files and the execution rows) and its digest travels to the port with the key id; the port's answer (the archive
   * digest, the key, the expiry) is the record_export_package execution row's evidence.
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
    // B15 (D2): the archive's digest is taken by STREAMING over the files as written (never an in-memory file set): the build's memory
    // high-water mark is one object, not the package.
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
      // The BYTES: read from the tier they are in, verified against the manifest's digest, written into the package under the manifest's id — a
      // hot read through the tiered form (B12, C13): a restored copy whose publish is pending is found under the digest, as retrieval finds it.
      let bytes: Buffer;
      try {
        bytes = ((await cap.tierOf(ref)).tier === 'archive' ? await this.vault.readArchived(scope, locator, digest) : await this.vault.readTiered('evidence', scope, locator, digest)).bytes;
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
    // B15 (D1): THE RELATIONSHIP CLOSURE — the knowledge derived from the exported records (the claims whose lineage names them, the graph's
    // edges asserted on them and the entities those edges connect), under the same ceiling, written as links.json and named by the manifest's
    // package.links (inside the digest chain: `package` is covered by the package digest).
    const links = await this.linksOf(cap, a, objects, ceiling);
    const linksBytes = Buffer.from(`${JSON.stringify(links.body, null, 2)}\n`, 'utf8');
    const linksFile = await this.vault.writePackageFile(scope, a.actionId, LINKS_FILE, linksBytes);
    await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId: null, port: 'retention.export_links', outcome: 'done',
                                evidence: { file: LINKS_FILE, links_digest: linksFile.contentDigest, byte_length: linksFile.byteLength, format: LINKS_FORMAT, ...links.counts }, actor: a.actor, correlationId: a.correlationId });
    const body: ExportManifestShape = {
      format: EXPORT_FORMAT,
      package: { action_id: a.actionId, tenant_id: a.tenantId, domain_id: a.domainId, destination: 'export', locator_prefix: locatorPrefix, built_at: new Date().toISOString(), built_by: `principal:${a.actor}`,
                 links: { file: LINKS_FILE, links_digest: linksFile.contentDigest, byte_length: linksFile.byteLength, format: LINKS_FORMAT, ...links.counts } },
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
    // B13 (D3): with an active signing key the statement names the key and the scheme is /2 — the key's reference resolved NOW (the
    // pre-check in `execute` refused an unbound key before the state moved; a binding removed since is the same refusal, after it).
    const active = await this.activeSigningKey(cap, a.tenantId);
    const boundTo = { action_id: a.actionId, scope_digest: scopeDigest, approval_id: approvalId };
    const statement = active === null
      ? 'the package digest is bound to the approval on the resolved scope and recorded in the append-only retention ledger; verify offline with scripts/retention/verify-export.mjs and authenticate the digest against the product record'
      : `the package digest is bound to the approval on the resolved scope, recorded in the append-only retention ledger and signed (Ed25519) by the tenant's export signing key ${String(active['key_id'])}; verify offline with scripts/retention/verify-export.mjs --public-key <the key's PEM, served by the export read route> and authenticate the digest against the product record`;
    const packageDigest = packageDigestOf({ ...body, signature: { bound_to: boundTo, statement } });
    let signature: Row = { scheme: SIGNATURE_SCHEME, objects_digest: objectsDigestOf(objects), package_digest: packageDigest, bound_to: boundTo, statement };
    let signingKeyId: string | null = null;
    if (active !== null) {
      const keyId = String(active['key_id']); const ref = String(active['credential_ref'] ?? '');
      const signed = this.signing.sign(ref, packageDigest);
      if (signed === null) throw new RetentionExecutionRolledBack(a.actionId, 'infrastructure', `the tenant's active export signing key ${keyId} is not bound in this deployment (${ref}); the package was not built`);
      signature = { ...signature, scheme: KEY_SIGNATURE_SCHEME, key_id: keyId, algorithm: SIGNING_ALGORITHM, signature: signed };
      signingKeyId = keyId;
    }
    const fileBytes = Buffer.from(`${JSON.stringify({ ...body, signature }, null, 2)}\n`, 'utf8');
    const manifestFile = await this.vault.writePackageFile(scope, a.actionId, 'manifest.json', fileBytes);
    // THE ARCHIVE (D2, C4; B15): its digest taken by streaming over the manifest's bytes and the files it lists AS WRITTEN, at the manifest's own
    // built_at (the same bytes the in-memory builder produces — the harness holds the two equal); recorded with the package.
    let archiveDigest: string;
    try {
      const built = await this.archiveStreamOf(scope, a.actionId, fileBytes, { ...body, signature });
      archiveDigest = await drainForDigest(built);
    } catch (e) { throw new RetentionExecutionRolledBack(a.actionId, 'infrastructure', `the package's archive did not build: ${String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 300)}`); }
    const pkg = await cap.recordExportPackage({ actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, approvalId, manifestDigest: manifestFile.contentDigest, packageDigest, signature, objectCount: executed, excludedCount: excluded.length, byteTotal, archiveDigest, signingKeyId, actor: a.actor, correlationId: a.correlationId });
    await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId: null, port: 'retention.record_export_package', outcome: 'done', evidence: pkg, actor: a.actor, correlationId: a.correlationId });
    return { executed, refused, redactionRefused, refusals, package: pkg };
  }

  /** B13 (D3): the tenant's active signing key row (the latest non-retired, as the port says), or null; the row carries the reference's NAME and the public key, never a value. */
  private async activeSigningKey(cap: RetentionReads, tenantId: string): Promise<Row | null> {
    const keyId = await cap.activeExportSigningKey(tenantId);
    if (keyId === null) return null;
    return ((await cap.readExportSigningKeys().selectAll().where('tenant_id' as never, '=', tenantId as never).where('key_id' as never, '=', keyId as never).executeTakeFirst()) as Row | undefined) ?? null;
  }

  /**
   * THE RETRY of an executed action's bytes (0071): from the EXECUTED ITEMS themselves — not from the residual rows alone, which the same
   * process writes after the commit and which a crash between the commit and that write never leaves behind. An ARCHIVE's item: any
   * staged copy of the locator under the manifest's digest is published (a publish that failed, or a process gone between the commit
   * and the publish); when none publishes, the hot copy kept for exactly that case is copied again and published; the hot copy goes only
   * once the published copy verifies; a manifest tombstoned since is left to the deletion that tombstoned it. A RESTORE's item (B12, D2):
   * the mirror — any staged copy in the HOT root under the digest is published; when none publishes, the archive copy kept for that case
   * is copied again and published; the archive copy (and any staged copy in the archive root) goes only once the published hot copy
   * verifies. A DELETION's item: the bytes in either root and every staged copy, idempotently. `pending` counts the residual rows;
   * `failed` names what could not be published.
   */
  async retryBytes(cap: RetentionReads, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ removed: string[]; failed: string[]; pending: number }> {
    const action = ((await cap.readActions().select(['kind' as never]).where('action_id' as never, '=', actionId as never).executeTakeFirst()) as { kind: string } | undefined);
    const pending = (await cap.readResiduals().selectAll().where('action_id' as never, '=', actionId as never).where('kind' as never, '=', 'bytes_present' as never).where('status' as never, '=', 'pending' as never).execute()) as Row[];
    const items = (await cap.readScopeItems().selectAll().where('action_id' as never, '=', actionId as never).where('item_kind' as never, '=', 'manifest' as never).where('disposition' as never, '=', 'execute' as never).execute()) as Row[];
    const entries: Array<{ locator: string; vault: VaultName; stagedToo?: boolean }> = []; const unpublished: string[] = [];
    for (const it of items) {
      const details = (it['details'] ?? {}) as Row; const locator = details['locator']; const ref = String(it['ref']);
      if (typeof locator !== 'string') continue;
      if (action?.kind === 'archive') {
        const digest = String(details['content_digest'] ?? '');
        const tombstoned = ((await cap.readTombstones().select(['manifest_id' as never]).where('manifest_id' as never, '=', ref as never).executeTakeFirst()) as Row | undefined) !== undefined;
        if (tombstoned) continue;
        await this.vault.publishArchiveCopy(scope, locator, digest, null).catch(() => undefined);
        let archived = await this.vault.read('archive', scope, locator, digest).then(() => true, () => false);
        if (!archived) {
          const attemptId = newId();
          archived = await this.vault.copyBlob('evidence', 'archive', scope, locator, digest, { attemptId })
            .then(() => this.vault.publishArchiveCopy(scope, locator, digest, attemptId)).then(() => true, () => false);
        }
        if (!archived) { unpublished.push(locator); continue; }
        if (await this.vault.exists('evidence', scope, locator)) entries.push({ locator, vault: 'evidence' });
      } else if (action?.kind === 'restore') {
        const digest = String(details['content_digest'] ?? '');
        // A manifest tombstoned since is left to the deletion that tombstoned it (C9) — its copies in both roots retire with the tombstone.
        const tombstoned = ((await cap.readTombstones().select(['manifest_id' as never]).where('manifest_id' as never, '=', ref as never).executeTakeFirst()) as Row | undefined) !== undefined;
        if (tombstoned) continue;
        await this.vault.publishCopy('evidence', scope, locator, digest, null).catch(() => undefined);
        let hot = await this.vault.read('evidence', scope, locator, digest).then(() => true, () => false);
        if (!hot) {
          const attemptId = newId();
          hot = await this.vault.copyBlob('archive', 'evidence', scope, locator, digest, { attemptId })
            .then(() => this.vault.publishCopy('evidence', scope, locator, digest, attemptId)).then(() => true, () => false);
        }
        if (!hot) { unpublished.push(locator); continue; }
        if (await this.vault.exists('archive', scope, locator)) entries.push({ locator, vault: 'archive', stagedToo: true });
      } else if (action?.kind === 'deletion') {
        entries.push({ locator, vault: 'evidence', stagedToo: true }); entries.push({ locator, vault: 'archive', stagedToo: true });
      }
    }
    const r = await this.removeBytes(scope, entries);
    return { removed: r.removed, failed: [...r.failed, ...unpublished.filter((l) => !r.failed.includes(l))], pending: pending.length };
  }

  /** The controller's cleanup of an attempt's staged copy when the transaction failed after the handler returned (0071): in the root the copy was staged in (B12, C6). */
  async removeStagedCopy(scope: { tenantId: string; domainId: string }, locator: string, attemptId: string, vault: VaultName): Promise<void> { await this.vault.removeStagedIn(vault, scope, locator, attemptId); }

  /**
   * The bytes go after the record committed (the sweeper's discipline), each from its tier — with every staged copy of the locator in that
   * root when the entry says so: a failure here leaves the record true and the bytes for the retry route. Reported per LOCATOR: removed
   * when every root named for it is clear, failed when any removal was refused.
   */
  async removeBytes(scope: { tenantId: string; domainId: string }, entries: Array<{ locator: string; vault: VaultName; stagedToo?: boolean }>): Promise<{ removed: string[]; failed: string[] }> {
    const failedSet = new Set<string>(); const seen: string[] = [];
    for (const e of entries) {
      if (!seen.includes(e.locator)) seen.push(e.locator);
      try { await this.vault.tombstone(e.vault, scope, e.locator); if (e.stagedToo === true) await this.vault.removeAllStagedIn(e.vault, scope, e.locator); } catch { failedSet.add(e.locator); }
    }
    return { removed: seen.filter((l) => !failedSet.has(l)), failed: seen.filter((l) => failedSet.has(l)) };
  }

  /**
   * PUBLISH the staged copies of an executed archive or restore after its commit (0071; B12): each renamed under its locator in the root
   * it was staged in; a copy that cannot be published keeps its source copy in place — the hot copy for an archive, the archive copy for a
   * restore (recorded as a pending residual by the controller; the retry route publishes it first). A failed entry names its root.
   */
  async publishCopies(scope: { tenantId: string; domainId: string }, copies: ExecutionOutcome['copiesToPublish']): Promise<{ published: string[]; failed: Array<{ ref: string; locator: string; vault: VaultName; error: string }> }> {
    const published: string[] = []; const failed: Array<{ ref: string; locator: string; vault: VaultName; error: string }> = [];
    for (const c of copies) {
      try { await this.vault.publishCopy(c.vault, scope, c.locator, c.digest, c.attemptId); published.push(c.locator); }
      catch (e) { failed.push({ ref: c.ref, locator: c.locator, vault: c.vault, error: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 200) }); }
    }
    return { published, failed };
  }

  /**
   * VERIFY: what the vault observes per manifest in scope, handed to the port with the record's own checks. `bytes_present` is the
   * HOT tier for an archive action and for a restore (B12), and EITHER ROOT for every other kind (a deletion is not verified, and
   * DeletionVerified not published, while a copy remains in any root); an archive adds the archive-tier facts, a restore the hot copy's
   * digest and the archive copy's presence (its contract, 0072 §5: the archive copy gone, no staged copy in either root), an export adds
   * the package file's facts and the package as a whole (B11).
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
      // A staged copy (0071; in either root since B12) is bytes in that root too: a deletion is not verified while one remains; an archive's and
      // a restore's own contracts need the PUBLISHED copy. A listing that fails counts as bytes PRESENT — the observer never concludes "nothing
      // staged" from an answer it did not get.
      const stagedArchive = await this.vault.stagedCopiesIn('archive', scope, locator).then((n) => n.length > 0, () => true);
      const stagedEvidence = await this.vault.stagedCopiesIn('evidence', scope, locator).then((n) => n.length > 0, () => true);
      const staged = stagedArchive || stagedEvidence;
      if (kind === 'archive') {
        observed[ref] = { bytes_present: inEvidence, archive_present: inArchive, archive_digest_ok: await this.vault.read('archive', scope, locator, digest).then(() => true, () => false), staged_copies: staged };
      } else if (kind === 'restore') {
        observed[ref] = { bytes_present: inEvidence, hot_digest_ok: await this.vault.read('evidence', scope, locator, digest).then(() => true, () => false), archive_present: inArchive, staged_copies: staged };
      } else if (kind === 'customer_export') {
        const file = await this.vault.readPackageFile(scope, actionId, `${ref}.bin`).then((b) => b, () => null);
        observed[ref] = { bytes_present: inEvidence || inArchive || staged, export_present: file !== null, export_digest_ok: file !== null && sha256(file) === digest };
      } else {
        observed[ref] = { bytes_present: inEvidence || inArchive || staged, tiers_present: [...(inEvidence ? ['evidence'] : []), ...(inArchive ? ['archive'] : []), ...(stagedArchive ? ['archive-staged'] : []), ...(stagedEvidence ? ['evidence-staged'] : [])] };
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
      // B15 (D1): the relationship closure the manifest names — present, and digesting to what the manifest names (the file's sha256 and size).
      const linksBlock = parsed === null ? null : (((parsed.package as Row | undefined)?.['links'] ?? null) as Row | null);
      const linksNamed = linksBlock !== null && typeof linksBlock === 'object';
      const linksBytes = linksNamed ? await this.vault.readPackageFile(scope, actionId, LINKS_FILE).then((b) => b, () => null) : null;
      observed['__package__'] = { manifest_present: manifestBytes !== null, manifest_digest: manifestBytes === null ? null : sha256(manifestBytes), package_digest: recomputed,
                                  objects_listed: parsed === null || !Array.isArray(parsed.objects) ? null : parsed.objects.length, files_present: files.length,
                                  links_named: linksNamed, links_present: linksBytes !== null, links_digest_ok: linksBytes !== null && linksNamed && sha256(linksBytes) === String(linksBlock['links_digest']) && linksBytes.byteLength === Number(linksBlock['byte_length']) };
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

  /**
   * B12 (0072 §1; D4 "observable state"): the cold-tier manager's state of the domain as the port reports it — the policy in force or the
   * defaults, the tiers, the moves of the last 24 h, the budget, the actions by state, the schedules — with the vault's inventory of BOTH
   * blob roots (blobs, staged copies and temp files by name, one listing each). A root that cannot be listed is reported as such (nulls
   * and the error) beside the rest: a state read never throws for a directory it could not list.
   */
  async tierState(cap: RetentionReads, scope: { tenantId: string; domainId: string }): Promise<Row> {
    const inventory = (vault: 'evidence' | 'archive'): Promise<Row> =>
      this.vault.domainInventory(vault, scope).then((i) => ({ ...i }), (e: unknown) => ({ blobs: null, staged: null, temp: null, error: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 200) }));
    return { ...(await cap.tierState(scope)), vault: { evidence: await inventory('evidence'), archive: await inventory('archive') } };
  }

  /**
   * B11 (0070 §3): the export package's record with its manifest as written and the files the package directory holds (the read route).
   * B13 (D3, D4, D6): the signing key the package names — its public PEM, purpose and state NOW, so a customer can fetch the key and
   * verify offline — the expiry and whether it has passed, the archive digest, and the deliveries recorded on the action.
   */
  async exportPackage(cap: RetentionReads, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ package: Row; manifest: Row | null; files: string[]; signing_key: Row | null; expires_at: string | null; expired: boolean; archive_digest: string | null; deliveries: Row[]; revocation_notices: Row[] } | null> {
    const row = ((await cap.readExportPackages().selectAll().where('action_id' as never, '=', actionId as never).executeTakeFirst()) as Row | undefined);
    if (row === undefined) return null;
    const bytes = await this.vault.readPackageFile(scope, actionId, 'manifest.json').then((b) => b, () => null);
    let manifest: Row | null = null;
    try { manifest = bytes === null ? null : (JSON.parse(bytes.toString('utf8')) as Row); } catch { manifest = null; }
    const expiresAt = instantOf(row['expires_at']);
    return { package: row, manifest, files: await this.vault.listPackage(scope, actionId),
             signing_key: await this.signingKeyOf(cap, scope.tenantId, row), expires_at: expiresAt, expired: expiresAt !== null && Date.parse(expiresAt) <= Date.now(),
             archive_digest: (row['archive_digest'] as string | null) ?? null, deliveries: await this.deliveries(cap, actionId), revocation_notices: await this.revocationNotices(cap, actionId) };
  }
  /** B11: the package directory removed after the revocation committed (or retried when a removal failed); idempotent. */
  async removePackage(scope: { tenantId: string; domainId: string }, actionId: string): Promise<void> {
    await this.vault.removePackage(scope, actionId);
  }

  // ───────────────────────── B13: the export's delivery (0073; D2–D8) ─────────────────────────

  /** The key a package names (`signing_key_id`), as served: the id, algorithm, purpose, public PEM and its state NOW — or null for a /1 package. */
  private async signingKeyOf(cap: RetentionReads, tenantId: string, pkg: Row): Promise<Row | null> {
    const keyId = pkg['signing_key_id'];
    if (typeof keyId !== 'string') return null;
    const key = ((await cap.readExportSigningKeys().selectAll().where('tenant_id' as never, '=', tenantId as never).where('key_id' as never, '=', keyId as never).executeTakeFirst()) as Row | undefined);
    if (key === undefined) return { key_id: keyId, algorithm: SIGNING_ALGORITHM, purpose: null, public_key_pem: null, state: 'unknown', retired_at: null };
    return { key_id: keyId, algorithm: String(key['algorithm'] ?? SIGNING_ALGORITHM), purpose: key['purpose'] ?? null, public_key_pem: key['public_key_pem'] ?? null, state: key['retired_at'] == null ? 'active' : 'retired', retired_at: instantOf(key['retired_at']) };
  }

  /**
   * C19: the tenant's signing keys as the read route serves them — the reference's NAME and its readiness (`bound` | `blocked-credential`,
   * computed from the store at this instant, never a value), the state, which one is active (the latest non-retired, the port's rule).
   */
  async signingKeys(cap: RetentionReads, tenantId: string): Promise<Row[]> {
    const rows = (await cap.readExportSigningKeys().selectAll().where('tenant_id' as never, '=', tenantId as never).orderBy('declared_at' as never).execute()) as Row[];
    const activeId = await cap.activeExportSigningKey(tenantId);
    return rows.map((k) => ({ ...k, state: k['retired_at'] == null ? 'active' : 'retired', active: k['key_id'] === activeId, readiness: this.signing.has(String(k['credential_ref'] ?? '')) ? 'bound' : 'blocked-credential' }));
  }
  /** The signing key as an act's answer (the declaration's, the retirement's): the row with its state and readiness. */
  signingKeyAnswer(row: Row): Row {
    return { ...row, state: row['retired_at'] == null ? 'active' : 'retired', readiness: this.signing.has(String(row['credential_ref'] ?? '')) ? 'bound' : 'blocked-credential' };
  }

  /** D5, C19: the domain's destinations with their readiness — `active` / `retired`; for https, `blocked-credential` when the reference is not bound in this process. */
  async destinations(cap: RetentionReads): Promise<Row[]> {
    const rows = (await cap.readExportDestinations().selectAll().orderBy('declared_at' as never).execute()) as Row[];
    return rows.map((d) => this.destinationAnswer(d));
  }
  destinationAnswer(row: Row): Row {
    const ref = typeof row['credential_ref'] === 'string' ? (row['credential_ref'] as string) : null;
    const bound = ref === null ? null : this.credentials.has(ref);
    const readiness = row['retired_at'] != null ? 'retired' : ref !== null && bound === false ? 'blocked-credential' : 'active';
    return { ...row, readiness, credential: ref === null ? 'none required' : `reference ${ref} (${bound === true ? 'bound in this deployment; a delivery carries it' : 'not bound in this deployment'})`,
             trust_anchor: trustAnchorSummary(typeof row['trust_anchor_pem'] === 'string' ? (row['trust_anchor_pem'] as string) : null) };
  }

  /**
   * B14 (D2): a declared trust anchor checked at the declaration — one or more PEM certificates node parses, at most 64 KiB; the refusal
   * in the port's voice (the route answers it as 422). Returns the anchor normalised (each block as parsed, joined by newlines).
   */
  checkTrustAnchor(pem: string): { ok: true; pem: string; certificates: Row[] } | { ok: false; message: string } {
    const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
    if (blocks.length === 0) return { ok: false, message: 'export destination rejected: the trust anchor is one or more PEM certificates (-----BEGIN CERTIFICATE-----)' };
    if (Buffer.byteLength(pem, 'utf8') > 65536) return { ok: false, message: 'export destination rejected: the trust anchor is at most 64 KiB' };
    const certificates: Row[] = [];
    for (const block of blocks) {
      try { const c = new X509Certificate(block); certificates.push({ subject: c.subject, issuer: c.issuer, fingerprint256: c.fingerprint256, valid_from: c.validFrom, valid_to: c.validTo, ca: c.ca }); }
      catch (e) { return { ok: false, message: `export destination rejected: the trust anchor holds a certificate node cannot parse (${String((e as Error).message).slice(0, 120)})` }; }
    }
    return { ok: true, pem: `${blocks.map((b) => b.trim()).join('\n')}\n`, certificates };
  }

  /** D6: the deliveries of an action, each with its destination's key and kind, oldest first. */
  async deliveries(cap: RetentionReads, actionId: string): Promise<Row[]> {
    const rows = (await cap.readExportDeliveries().selectAll().where('action_id' as never, '=', actionId as never).orderBy('delivered_at' as never).execute()) as Row[];
    if (rows.length === 0) return [];
    const destinations = (await cap.readExportDestinations().select(['destination_id' as never, 'destination_key' as never, 'kind' as never, 'recipient' as never]).execute()) as Row[];
    const byId = new Map(destinations.map((d) => [String(d['destination_id']), d]));
    return rows.map((r) => { const d = byId.get(String(r['destination_id'])); return { ...r, destination_key: d?.['destination_key'] ?? null, kind: d?.['kind'] ?? null, recipient: d?.['recipient'] ?? null }; });
  }

  /** D3: the public key a signing-key reference's value derives (the declaration records it), or the typed refusal; the value never leaves the store. */
  deriveSigningKey(credentialRef: string): ReturnType<ExportSigningKeyStore['derivePublic']> { return this.signing.derivePublic(credentialRef); }
  /** D5, C13: a transfer station's endpoint checked at the declaration — absolute, existing, a directory, outside the vault roots. */
  async checkTransferStation(endpoint: string): Promise<{ ok: true; real: string } | { ok: false; message: string }> { return this.delivery.checkTransferStation(endpoint); }
  /** C6: the controller's cleanup of the station paths an attempt created when its transaction did not commit. */
  async removeCreatedStationFiles(paths: string[]): Promise<string[]> { return this.delivery.removeCreated(paths); }

  /** A delivery row of this action, as the collect and acknowledge acts find it, with its destination — or null. */
  async deliveryOf(cap: RetentionReads, actionId: string, deliveryId: string): Promise<{ delivery: Row; destination: Row | null } | null> {
    const delivery = ((await cap.readExportDeliveries().selectAll().where('action_id' as never, '=', actionId as never).where('delivery_id' as never, '=', deliveryId as never).executeTakeFirst()) as Row | undefined);
    if (delivery === undefined) return null;
    const destination = ((await cap.readExportDestinations().selectAll().where('destination_id' as never, '=', String(delivery['destination_id']) as never).executeTakeFirst()) as Row | undefined) ?? null;
    return { delivery, destination };
  }
  /** The destination a delivery names by key: the active one, else the latest retired one (the port refuses it as retired), else null. */
  async destinationByKey(cap: RetentionReads, destinationKey: string): Promise<Row | null> {
    const rows = (await cap.readExportDestinations().selectAll().where('destination_key' as never, '=', destinationKey as never).orderBy('declared_at' as never, 'desc').execute()) as Row[];
    return rows.find((d) => d['retired_at'] == null) ?? rows[0] ?? null;
  }

  /**
   * THE REBUILD (D2, C4, C12): the package's archive from the files on disk — refused before any file is read when the row's byte total
   * lies above the ceiling, and again once the manifest's size is known; the manifest read, the files it lists read (a listed file absent,
   * a name outside the package's rule, or a rebuilt digest other than the recorded one → the integrity refusal, 409, nothing served).
   */
  private async rebuildArchive(scope: { tenantId: string; domainId: string }, actionId: string, pkg: Row, correlationId: string): Promise<{ tar: Buffer; manifest: ExportManifestShape; manifestBytes: Buffer; archiveDigest: string }> {
    const conflict = (message: string): never => { throw new HttpException(errorBody('EYE_STA_002', correlationId, message), 409); };
    const recorded = pkg['archive_digest'];
    if (typeof recorded !== 'string') conflict(`the export package of ${actionId} was built before its archive digest was recorded (B13); build the export again to download or deliver it`);
    const byteTotal = Number(pkg['byte_total'] ?? 0);
    if (byteTotal > EXPORT_ARCHIVE_MAX_BYTES) conflict(`the package is ${byteTotal} bytes, above the archive ceiling of ${EXPORT_ARCHIVE_MAX_BYTES}; deliver a smaller export`);
    let manifestBytes: Buffer;
    try { manifestBytes = await this.vault.readPackageFile(scope, actionId, 'manifest.json'); }
    catch { return conflict(`the package's archive does not rebuild to its recorded digest: manifest.json is not readable`); }
    if (byteTotal + manifestBytes.byteLength > EXPORT_ARCHIVE_MAX_BYTES) conflict(`the package is ${byteTotal + manifestBytes.byteLength} bytes, above the archive ceiling of ${EXPORT_ARCHIVE_MAX_BYTES}; deliver a smaller export`);
    let manifest: ExportManifestShape;
    try { manifest = JSON.parse(manifestBytes.toString('utf8')) as ExportManifestShape; } catch { return conflict(`the package's archive does not rebuild to its recorded digest: manifest.json does not parse`); }
    const files: ArchiveEntry[] = [];
    let tar: Buffer;
    try {
      for (const name of listedFilesOf(manifest.objects, manifest as { package?: { links?: unknown } })) {
        let bytes: Buffer;
        try { bytes = await this.vault.readPackageFile(scope, actionId, name); } catch { return conflict(`the package's archive does not rebuild to its recorded digest: the manifest lists ${name}, which is not present`); }
        files.push({ name, bytes });
      }
      tar = archiveOfPackage(manifestBytes, files);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      return conflict(`the package's archive does not rebuild to its recorded digest: ${e instanceof ExportArchiveError ? e.message : String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 200)}`);
    }
    const digest = archiveDigestOf(tar);
    if (digest !== recorded) conflict(`the package's archive does not rebuild to its recorded digest (rebuilt ${digest}, recorded ${String(recorded)}); nothing is served`);
    return { tar, manifest, manifestBytes, archiveDigest: digest };
  }

  /**
   * B15 (D1), B16 (D8; Codex B15-F1): THE RELATIONSHIP CLOSURE of the exported records, BY EXACT VERSION — the knowledge derived from
   * the records the package carries, each piece at the version that was actually derived, never rebased:
   *
   *   THE EVIDENCE PAIR RULE. A lineage row (intelligence.claim_lineage) or an edge (graph.edges_current) RESOLVES to an exported record
   *   iff it names the record's id AND the digest of the BYTES the package carries for it (`objects[].bytes.content_digest` — the
   *   extraction recorded the bytes' sha256 as evidence_digest); a row under another digest of the same record is excluded (gate
   *   `evidence`): it was derived from bytes this package does not carry.
   *
   *   THE REQUIRED PAIRS. Every resolving lineage row requires its exact (claim_object_id, claim_version); every resolving edge requires
   *   the pair it was asserted on. A required pair is carried as its own claim entry — an id may repeat with different versions (C@1 and
   *   C@2 both present when an edge rests on the first and the lineage names the second) — with the ONE lineage row that resolves it and
   *   what references it. A pair is excluded when its exact canonical row is not recorded (`record`), when it is required by an edge
   *   alone and its own lineage row is absent (`record`) or names other bytes (`evidence`), or when its header classification lies above
   *   the export ceiling (`redaction`) — the same ceiling as the records; the edges and entities carry no classification of their own.
   *
   *   THE EDGES AND THEIR ENDS. An edge is included iff its pair is included and both ends are recorded entities, every state as
   *   recorded (temporal truth: asserted, retracted, superseded — with the instants and the principals); otherwise it is excluded with
   *   the gate `dependency` and the reason (its excluded claim version, its unrecorded end — the end listed as an excluded entity too).
   *   The entities are the included edges' ends with their identifiers; the identifier SYSTEMS those identifiers are under travel with
   *   them (the importing domain registers what it lacks). Nothing here is a write.
   */
  private async linksOf(cap: RetentionReads, a: { tenantId: string; domainId: string; actionId: string }, objects: Row[], ceiling: string): Promise<{ body: Row; counts: { claims: number; edges: number; entities: number; excluded: number } }> {
    const claims: Row[] = []; const edges: Row[] = []; const entities: Row[] = []; const identifierSystems: Row[] = []; const excluded: Row[] = [];
    // 1. The exported records, id → the digest of the bytes the package carries (the manifest's objects[].bytes).
    const exported = new Map<string, string>();
    for (const o of objects) exported.set(String(o['object_id']), String(((o['bytes'] ?? {}) as Row)['content_digest'] ?? ''));
    const evdObjectIds = [...exported.keys()];
    const pairKey = (objectId: string, version: number): string => `${objectId}@${version}`;
    const resolves = (evidenceId: unknown, digest: unknown): boolean => exported.get(String(evidenceId)) === String(digest);
    const evidenceOf = (r: Row): Row => ({ object_id: String(r['evidence_object_id']), digest: String(r['evidence_digest']) });
    if (evdObjectIds.length > 0) {
      type Required = { objectId: string; version: number; lineage: Row | null };
      const required = new Map<string, Required>();
      const exclusionOf = new Map<string, string>();
      const require = (objectId: string, version: number): Required => {
        const k = pairKey(objectId, version);
        let r = required.get(k);
        if (r === undefined) { r = { objectId, version, lineage: null }; required.set(k, r); }
        return r;
      };
      const excludeClaim = (objectId: string, version: number, gate: string, reason: string, extra: Row = {}): void => {
        excluded.push({ kind: 'claim', object_id: objectId, object_version: version, gate, reason, ...extra });
        exclusionOf.set(pairKey(objectId, version), gate);
      };
      // 2. The lineage rows naming exported records: a resolving row requires its exact version; one under other bytes is excluded (evidence).
      const lineage = (await cap.readClaimLineage().selectAll().where('evidence_object_id' as never, 'in', evdObjectIds as never).orderBy('claim_object_id' as never).orderBy('claim_version' as never).execute()) as Row[];
      for (const l of lineage) {
        const objectId = String(l['claim_object_id']); const version = Number(l['claim_version']);
        if (!resolves(l['evidence_object_id'], l['evidence_digest'])) {
          excludeClaim(objectId, version, 'evidence', `its lineage names record ${String(l['evidence_object_id'])} under digest ${String(l['evidence_digest'])}, not the bytes this package carries (${String(exported.get(String(l['evidence_object_id'])))})`, { evidence: evidenceOf(l) });
          continue;
        }
        require(objectId, version).lineage = l;
      }
      // 3. The edges asserted on exported records: a resolving edge requires the pair it rests on; one under other bytes is excluded (evidence).
      const edgeRows = (await cap.readEdges().selectAll().where('evidence_object_id' as never, 'in', evdObjectIds as never).orderBy('edge_id' as never).execute()) as Row[];
      const claimOf = (e: Row): Row => ({ object_id: String(e['claim_object_id']), object_version: Number(e['claim_version']) });
      const candidates: Row[] = [];
      for (const e of edgeRows) {
        if (!resolves(e['evidence_object_id'], e['evidence_digest'])) {
          excluded.push({ kind: 'edge', edge_id: String(e['edge_id']), claim: claimOf(e), evidence: evidenceOf(e), gate: 'evidence', reason: `it names record ${String(e['evidence_object_id'])} under digest ${String(e['evidence_digest'])}, not the bytes this package carries (${String(exported.get(String(e['evidence_object_id'])))})` });
          continue;
        }
        require(String(e['claim_object_id']), Number(e['claim_version']));
        candidates.push(e);
      }
      // 4. Every required pair, in order: the EXACT canonical row; a version required by an edge alone must have its own resolving lineage row.
      // The included pairs, each with its `referenced_by` (the edges counted below are the ones the closure CARRIES, so a reader can check the count).
      const included = new Map<string, Row>();
      const sorted = [...required.values()].sort((x, y) => (x.objectId < y.objectId ? -1 : x.objectId > y.objectId ? 1 : x.version - y.version));
      for (const r of sorted) {
        const key = pairKey(r.objectId, r.version);
        if (exclusionOf.has(key)) continue;
        const row = (await cap.readCanonicalObjects().selectAll().where('tenant_id' as never, '=', a.tenantId as never).where('domain_id' as never, '=', a.domainId as never)
          .where('object_id' as never, '=', r.objectId as never).where('object_version' as never, '=', r.version as never).executeTakeFirst()) as (ObjectRow & { payload: Row }) | undefined;
        if (row === undefined) { excludeClaim(r.objectId, r.version, 'record', `no canonical version ${r.version} of the claim is recorded`); continue; }
        const header = rebuildHeaderFromRow(row) as unknown as Row;
        if (classificationRank(header['classification']) > classificationRank(ceiling)) { excludeClaim(r.objectId, r.version, 'redaction', `classification ${String(header['classification'])} above the ceiling ${ceiling}`); continue; }
        if (r.lineage === null) {
          const own = (await cap.readClaimLineage().selectAll().where('claim_object_id' as never, '=', r.objectId as never).where('claim_version' as never, '=', r.version as never).executeTakeFirst()) as Row | undefined;
          if (own === undefined) { excludeClaim(r.objectId, r.version, 'record', `an edge rests on version ${r.version}, whose lineage is not recorded`); continue; }
          excludeClaim(r.objectId, r.version, 'evidence', `an edge rests on version ${r.version}, whose lineage names record ${String(own['evidence_object_id'])} under digest ${String(own['evidence_digest'])}, which this package does not carry`, { evidence: evidenceOf(own) });
          continue;
        }
        const l = r.lineage;
        const referencedBy: Row = { lineage: true, edges: 0 };
        claims.push({
          object_id: r.objectId, object_version: r.version, object_type: String(row.object_type), schema_ref: String(row['schema_ref']), content_digest: row.content_digest, header, payload: row.payload,
          lineage: [{ claim_version: Number(l['claim_version']), evidence_object_id: String(l['evidence_object_id']), evidence_digest: String(l['evidence_digest']), byte_start: Number(l['byte_start']), byte_end: Number(l['byte_end']),
                      run_id: String(l['run_id']), method_id: String(l['method_id']), call_id: (l['call_id'] as string | null) ?? null, mode: String(l['mode']), confidence: Number(l['confidence']),
                      retrieval_decision_id: String(l['retrieval_decision_id']), retrieval_audit_seq: Number(l['retrieval_audit_seq']) }],
          referenced_by: referencedBy,
        });
        included.set(key, referencedBy);
      }
      // 5. The candidate edges' ends first; an edge is included iff its pair is included and both ends are recorded — else excluded (dependency).
      const endIds = new Set<string>();
      for (const e of candidates) { endIds.add(String(e['subject_entity_id'])); endIds.add(String(e['object_entity_id'])); }
      const endRows = endIds.size > 0 ? ((await cap.readEntities().selectAll().where('entity_id' as never, 'in', [...endIds].sort() as never).orderBy('entity_id' as never).execute()) as Row[]) : [];
      const recorded = new Map(endRows.map((en) => [String(en['entity_id']), en]));
      const includedEntityIds = new Set<string>(); const unrecorded = new Set<string>();
      for (const e of candidates) {
        const claim = claimOf(e); const key = pairKey(String(claim['object_id']), Number(claim['object_version']));
        const subject = String(e['subject_entity_id']); const object = String(e['object_entity_id']);
        if (!included.has(key)) { excluded.push({ kind: 'edge', edge_id: String(e['edge_id']), claim, gate: 'dependency', reason: `its claim ${String(claim['object_id'])}@${String(claim['object_version'])} is excluded (${exclusionOf.get(key) ?? 'record'})` }); continue; }
        const missing = (['subject', 'object'] as const).filter((end) => !recorded.has(end === 'subject' ? subject : object));
        if (missing.length > 0) {
          for (const end of missing) unrecorded.add(end === 'subject' ? subject : object);
          excluded.push({ kind: 'edge', edge_id: String(e['edge_id']), claim, gate: 'dependency', reason: missing.map((end) => `its ${end} entity ${end === 'subject' ? subject : object} is not recorded`).join('; ') });
          continue;
        }
        includedEntityIds.add(subject); includedEntityIds.add(object);
        const referencedBy = included.get(key) as Row; referencedBy['edges'] = Number(referencedBy['edges']) + 1;
        edges.push({
          edge_id: String(e['edge_id']), predicate: String(e['predicate']), subject_entity_id: subject, object_entity_id: object,
          valid_from: instantOf(e['valid_from']), valid_to: instantOf(e['valid_to']), asserted_at: instantOf(e['asserted_at']), retracted_at: instantOf(e['retracted_at']), superseded_at: instantOf(e['superseded_at']), state: String(e['state']),
          claim, evidence: evidenceOf(e), run_id: (e['run_id'] as string | null) ?? null, method_id: (e['method_id'] as string | null) ?? null,
          confidence: Number(e['confidence']), mode: String(e['mode']), asserted_by: String(e['asserted_by']), retracted_by: (e['retracted_by'] as string | null) ?? null,
          superseded_by: (e['superseded_by'] as string | null) ?? null, retraction_reason: (e['retraction_reason'] as string | null) ?? null,
        });
      }
      for (const id of [...unrecorded].sort()) excluded.push({ kind: 'entity', entity_id: id, gate: 'record', reason: 'the entity an edge names is not recorded in this domain' });
      // 6. The included edges' ends with their identifiers, and the identifier systems those identifiers are under.
      if (includedEntityIds.size > 0) {
        const ids = [...includedEntityIds].sort();
        const identifiers = (await cap.readEntityIdentifiers().selectAll().where('entity_id' as never, 'in', ids as never).orderBy('entity_id' as never).orderBy('system_key' as never).orderBy('identifier_value' as never).execute()) as Row[];
        for (const id of ids) {
          const en = recorded.get(id) as Row;
          entities.push({
            entity_id: id, entity_type: String(en['entity_type']), canonical_name: String(en['canonical_name']), lifecycle_state: String(en['lifecycle_state']), split_from: (en['split_from'] as string | null) ?? null, superseded_by: (en['superseded_by'] as string | null) ?? null,
            identifiers: identifiers.filter((i) => String(i['entity_id']) === id).map((i) => ({ system_key: String(i['system_key']), value: String(i['identifier_value']), source_claim_object_id: String(i['source_claim_object_id']), source_evidence_object_id: String(i['source_evidence_object_id']) })),
          });
        }
        const systemKeys = [...new Set(identifiers.map((i) => String(i['system_key'])))].sort();
        if (systemKeys.length > 0) {
          const systems = (await cap.readIdentifierSystems().selectAll().where('tenant_id' as never, '=', a.tenantId as never).where('domain_id' as never, '=', a.domainId as never).where('system_key' as never, 'in', systemKeys as never).orderBy('system_key' as never).execute()) as Row[];
          for (const sys of systems) identifierSystems.push({ system_key: String(sys['system_key']), authority: String(sys['authority']), description: String(sys['description']), is_authoritative: Boolean(sys['is_authoritative']) });
        }
      }
    }
    const counts = { claims: claims.length, edges: edges.length, entities: entities.length, excluded: excluded.length };
    return { body: { format: LINKS_FORMAT, package: { action_id: a.actionId, tenant_id: a.tenantId, domain_id: a.domainId }, evidence: evdObjectIds, claims, edges, entities, identifier_systems: identifierSystems, excluded, counts }, counts };
  }

  /**
   * B15 (D2): the package's archive as a STREAM from the files on disk — the manifest's bytes first, then the files the manifest lists
   * (sorted; each opened as the stream reaches it), at the manifest's own built_at; the size known ahead; the digest when the stream ends.
   * A listed file absent, a name outside the package's rule or a size above the stream ceiling is refused before the first byte.
   */
  private async archiveStreamOf(scope: { tenantId: string; domainId: string }, actionId: string, manifestBytes: Buffer, manifest: ExportManifestShape): Promise<{ stream: Readable; size: number; digest: () => Promise<string> }> {
    const builtAt = Date.parse(String((manifest.package as Row)['built_at'] ?? ''));
    if (Number.isNaN(builtAt)) throw new ExportArchiveError('manifest', 'the manifest names no package.built_at');
    const entries: StreamEntry[] = [{ name: 'manifest.json', size: manifestBytes.byteLength, open: () => Readable.from([manifestBytes]) }];
    let total = manifestBytes.byteLength;
    for (const name of listedFilesOf(manifest.objects, manifest as { package?: { links?: unknown } })) {
      let source: { size: number; open: () => Readable };
      try { source = await this.vault.openPackageFile(scope, actionId, name); } catch { throw new ExportArchiveError('file_missing', `the manifest lists ${name}, which is not present`); }
      total += source.size;
      if (total > EXPORT_STREAM_MAX_BYTES) throw new ExportArchiveError('size', `the package is above the streamed archive ceiling of ${EXPORT_STREAM_MAX_BYTES} bytes`);
      entries.push({ name, size: source.size, open: source.open });
    }
    return ustarStream(entries, Math.floor(builtAt / 1000));
  }

  /**
   * B15 (D2): THE STREAMED REBUILD for the stream route, the station write and the https delivery — the manifest read, the archive
   * assembled from the files on disk and, FIRST, consumed once for its digest alone (a disk pass, no memory): a digest other than the
   * recorded one is the integrity refusal (409) before any byte leaves; then a second, identical stream is returned for the consumer,
   * with the size the headers announce. The in-memory rebuild (`rebuildArchive`) stays for the JSON download under its own ceiling.
   */
  async rebuildArchiveStream(scope: { tenantId: string; domainId: string }, actionId: string, pkg: Row, correlationId: string): Promise<{ open: () => Promise<{ stream: Readable; digest: () => Promise<string> }>; size: number; manifest: ExportManifestShape; manifestBytes: Buffer; archiveDigest: string }> {
    const conflict = (message: string): never => { throw new HttpException(errorBody('EYE_STA_002', correlationId, message), 409); };
    const recorded = pkg['archive_digest'];
    if (typeof recorded !== 'string') conflict(`the export package of ${actionId} was built before its archive digest was recorded (B13); build the export again to download or deliver it`);
    let manifestBytes: Buffer;
    try { manifestBytes = await this.vault.readPackageFile(scope, actionId, 'manifest.json'); }
    catch { return conflict(`the package's archive does not rebuild to its recorded digest: manifest.json is not readable`); }
    let manifest: ExportManifestShape;
    try { manifest = JSON.parse(manifestBytes.toString('utf8')) as ExportManifestShape; } catch { return conflict(`the package's archive does not rebuild to its recorded digest: manifest.json does not parse`); }
    const build = async () => {
      try { return await this.archiveStreamOf(scope, actionId, manifestBytes, manifest); }
      catch (e) { return conflict(`the package's archive does not rebuild to its recorded digest: ${e instanceof ExportArchiveError ? e.message : String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 200)}`); }
    };
    const first = await build();
    let digest: string;
    try { digest = await drainForDigest(first); }
    catch (e) { return conflict(`the package's archive does not rebuild to its recorded digest: ${String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 200)}`); }
    if (digest !== recorded) conflict(`the package's archive does not rebuild to its recorded digest (rebuilt ${digest}, recorded ${String(recorded)}); nothing is served`);
    return { open: build, size: first.size, manifest, manifestBytes, archiveDigest: digest };
  }

  /** The package row of an action for a download or a delivery: present (404 otherwise), not revoked, not expired (409, the messages the mapper routes). */
  private async servablePackage(cap: RetentionReads, actionId: string, correlationId: string): Promise<Row> {
    const pkg = ((await cap.readExportPackages().selectAll().where('action_id' as never, '=', actionId as never).executeTakeFirst()) as Row | undefined);
    if (pkg === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `retention delivery rejected: ${actionId} has no export package in this domain`), 404);
    const revokedAt = instantOf(pkg['revoked_at']);
    if (revokedAt !== null) throw new HttpException(errorBody('EYE_STA_002', correlationId, `retention delivery rejected: the export package of ${actionId} was revoked at ${revokedAt}; its bytes are gone`), 409);
    const expiresAt = instantOf(pkg['expires_at']);
    if (expiresAt !== null && Date.parse(expiresAt) <= Date.now()) throw new HttpException(errorBody('EYE_STA_002', correlationId, `retention delivery rejected: the export package of ${actionId} expired at ${expiresAt}`), 409);
    return pkg;
  }

  /**
   * THE DOWNLOAD (D7): a governed, audited read of the tar — the package present, unrevoked, unexpired; the archive rebuilt from the files
   * and compared with the record before it is served; the event export.downloaded recorded through the port with the reader and the digest
   * (the caller's write). The signature block is served with the public key and the key's purpose and state for a /2 package.
   */
  async downloadExport(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, actionId: string, a: { actor: string; correlationId: string }): Promise<{ filename: string; bytes: Buffer; archiveDigest: string; packageDigest: string; manifestDigest: string; signature: Row; expiresAt: string | null }> {
    const pkg = await this.servablePackage(cap, actionId, a.correlationId);
    const rebuilt = await this.rebuildArchive(scope, actionId, pkg, a.correlationId);
    const key = await this.signingKeyOf(cap, scope.tenantId, pkg);
    await cap.recordExportDownload({ actionId, tenantId: scope.tenantId, domainId: scope.domainId, archiveDigest: rebuilt.archiveDigest, actor: a.actor, correlationId: a.correlationId });
    return { filename: `${actionId}.tar`, bytes: rebuilt.tar, archiveDigest: rebuilt.archiveDigest, packageDigest: String(pkg['package_digest']), manifestDigest: String(pkg['manifest_digest']),
             signature: { ...((rebuilt.manifest.signature ?? {}) as Row), ...(key === null ? {} : { key }) }, expiresAt: instantOf(pkg['expires_at']) };
  }

  /**
   * B15 (D2): THE STREAMED DOWNLOAD — the same gates and the same event as the JSON download (export.downloaded, with served_as stream),
   * the archive verified by a disk pass before the write commits; what is returned opens the stream the route pipes to the answer after
   * the commit, with the size the headers announce. No memory ceiling: the streamed archive's own (64 GiB).
   */
  async downloadExportStream(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, actionId: string, a: { actor: string; correlationId: string }): Promise<{ filename: string; open: () => Promise<{ stream: Readable; digest: () => Promise<string> }>; size: number; archiveDigest: string; packageDigest: string; manifestDigest: string; signature: Row; expiresAt: string | null }> {
    const pkg = await this.servablePackage(cap, actionId, a.correlationId);
    const rebuilt = await this.rebuildArchiveStream(scope, actionId, pkg, a.correlationId);
    const key = await this.signingKeyOf(cap, scope.tenantId, pkg);
    await cap.recordExportDownload({ actionId, tenantId: scope.tenantId, domainId: scope.domainId, archiveDigest: rebuilt.archiveDigest, actor: a.actor, correlationId: a.correlationId });
    return { filename: `${actionId}.tar`, open: rebuilt.open, size: rebuilt.size, archiveDigest: rebuilt.archiveDigest, packageDigest: String(pkg['package_digest']), manifestDigest: String(pkg['manifest_digest']),
             signature: { ...((rebuilt.manifest.signature ?? {}) as Row), ...(key === null ? {} : { key }) }, expiresAt: instantOf(pkg['expires_at']) };
  }

  /**
   * THE DELIVERY (D6, C6, C8): inside the governed write — the port's gates (begin_export_delivery: the action a verified customer export, the
   * package present, unrevoked, unexpired, the destination active, the rights still confirmed, the signing-key gate; the delivery id and the
   * attempt under the action's lock), the archive rebuilt and compared with the record (a mismatch: 409, nothing recorded), the executor by
   * the destination's kind, the outcome recorded whatever it is — delivered, acknowledged, mismatched, failed with its class. `created`
   * receives the station paths this attempt newly wrote, for the controller's cleanup after a commit that failed.
   */
  async deliverExport(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, actionId: string, destinationId: string, a: { actor: string; correlationId: string }, created: string[]): Promise<Row> {
    const begun = await cap.beginExportDelivery({ actionId, tenantId: scope.tenantId, domainId: scope.domainId, destinationId, actor: a.actor, correlationId: a.correlationId });
    const deliveryId = String(begun['delivery_id']); const attempt = Number(begun['attempt']);
    // The port answered with the package and the destination it gated; the rows are read again here under the same transaction (the executor
    // reads every column by name — the archive digest, the byte total, the endpoint — whatever the port chose to return).
    const pkg: Row = { ...((begun['package'] ?? {}) as Row), ...(((await cap.readExportPackages().selectAll().where('action_id' as never, '=', actionId as never).executeTakeFirst()) as Row | undefined) ?? {}) };
    const destination: Row = { ...((begun['destination'] ?? {}) as Row), ...(((await cap.readExportDestinations().selectAll().where('destination_id' as never, '=', destinationId as never).executeTakeFirst()) as Row | undefined) ?? {}) };
    const rebuilt = await this.rebuildArchiveStream(scope, actionId, pkg, a.correlationId);
    const key = await this.signingKeyOf(cap, scope.tenantId, pkg);
    const signingKey: DeliveryPackage['signingKey'] = key === null ? null
      : { key_id: String(key['key_id']), algorithm: String(key['algorithm'] ?? SIGNING_ALGORITHM), purpose: String(key['purpose'] ?? ''), public_key_pem: String(key['public_key_pem'] ?? ''), state: key['state'] === 'retired' ? 'retired' : 'active', retired_at: (key['retired_at'] as string | null) ?? null };
    const deliveredAt = new Date().toISOString();
    const deliveryPackage: DeliveryPackage = {
      tenantId: scope.tenantId, domainId: scope.domainId, actionId, deliveryId, attempt,
      destinationKey: String(destination['destination_key'] ?? ''), recipient: String(destination['recipient'] ?? ''), purpose: String(destination['purpose'] ?? ''),
      archive: { open: rebuilt.open, size: rebuilt.size }, archiveDigest: rebuilt.archiveDigest, packageDigest: String(pkg['package_digest']), manifestDigest: String(pkg['manifest_digest']),
      signature: (rebuilt.manifest.signature ?? {}) as Row, signingKey, expiresAt: instantOf(pkg['expires_at']), deliveredAt,
    };
    const kind = String(destination['kind'] ?? '');
    const endpoint = String(destination['endpoint'] ?? '');
    let outcome: Awaited<ReturnType<ExportDeliveryService['deliverToTransferStation']>> | Awaited<ReturnType<ExportDeliveryService['deliverToHttps']>>;
    if (kind === 'transfer_station') outcome = await this.delivery.deliverToTransferStation({ endpoint, pkg: deliveryPackage, created });
    else if (kind === 'https') outcome = await this.delivery.deliverToHttps({ endpoint, credentialRef: typeof destination['credential_ref'] === 'string' ? (destination['credential_ref'] as string) : null, trustAnchorPem: typeof destination['trust_anchor_pem'] === 'string' ? (destination['trust_anchor_pem'] as string) : null, pkg: deliveryPackage });
    else throw new HttpException(errorBody('EYE_STA_002', a.correlationId, `retention delivery rejected: the destination's kind ${kind} has no executor`), 409);
    // What the destination answered — the recipient's receipt, or the failure — is recorded with the sha256 of its canonical JSON (the port's rule: a receipt and its digest together, or neither).
    const receiptDigest = outcome.receipt === null ? null : contentDigest(outcome.receipt);
    const recorded = await cap.recordExportDelivery({ deliveryId, actionId, tenantId: scope.tenantId, domainId: scope.domainId, destinationId, attempt, state: outcome.state, archiveDigest: rebuilt.archiveDigest, packageDigest: String(pkg['package_digest']),
                                                       signingKeyId: signingKey === null ? null : signingKey.key_id, receipt: outcome.receipt, receiptDigest, failureClass: outcome.failureClass, actor: a.actor, correlationId: a.correlationId });
    const station = 'directory' in outcome ? { directory: outcome.directory, files: outcome.files, delivery_json: outcome.deliveryJson } : null;
    const egress = 'egress' in outcome ? outcome.egress : null;
    return { ...recorded, delivery_id: deliveryId, attempt, state: outcome.state, failure_class: outcome.failureClass, receipt: outcome.receipt, receipt_digest: receiptDigest,
             destination: { destination_id: destinationId, destination_key: deliveryPackage.destinationKey, kind, recipient: deliveryPackage.recipient }, signing_key: signingKey, station, egress };
  }

  /**
   * THE COLLECT ACT (D6, C7): the recipient's `receipt.json` read from the transfer station's directory of the action — the endpoint re-checked,
   * the file bounded and a JSON object, naming its delivery_id (a receipt without one is presented through the acknowledge route) — then the
   * acknowledgement port. The row must be a transfer-station delivery in state delivered; a missing file is a conflict ("no receipt yet").
   */
  async collectReceipt(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, actionId: string, deliveryId: string, a: { actor: string; correlationId: string }): Promise<Row> {
    const conflict = (message: string): never => { throw new HttpException(errorBody('EYE_STA_002', a.correlationId, message), 409); };
    const found = await this.deliveryOf(cap, actionId, deliveryId);
    if (found === null) throw new HttpException(errorBody('EYE_STA_001', a.correlationId, `retention delivery rejected: no such delivery ${deliveryId} of ${actionId}`), 404);
    if (found.destination === null || String(found.destination['kind']) !== 'transfer_station') conflict(`retention delivery rejected: delivery ${deliveryId} is not a transfer-station delivery; its receipt is presented through the acknowledge route`);
    if (String(found.delivery['state']) !== 'delivered') conflict(`retention delivery rejected: delivery ${deliveryId} is not delivered (it is ${String(found.delivery['state'])})`);
    let collected: { receipt: Row; path: string; byteLength: number };
    try { collected = await this.delivery.collectReceipt(String(found.destination?.['endpoint'] ?? ''), scope, actionId); }
    catch (e) {
      if (e instanceof TransferStationRefused) return conflict(e.reason === 'no_receipt' ? `retention delivery rejected: ${e.message}` : `retention delivery rejected (${e.reason}): ${e.message}`);
      throw e;
    }
    if (typeof collected.receipt['delivery_id'] !== 'string') conflict(`retention delivery rejected (receipt_invalid): the receipt at ${collected.path} names no delivery_id; a receipt without one is presented through the acknowledge route`);
    const row = await cap.acknowledgeExportDelivery({ deliveryId, tenantId: scope.tenantId, domainId: scope.domainId, receipt: collected.receipt, receiptDigest: contentDigest(collected.receipt), actor: a.actor, correlationId: a.correlationId });
    return { ...row, collected_from: collected.path, receipt_bytes: collected.byteLength };
  }

  /** THE ACKNOWLEDGE ACT (D6): the recipient's receipt presented out of band — a JSON object under the receipt ceiling — to the same port. */
  async acknowledgeDelivery(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, actionId: string, deliveryId: string, receipt: Row, a: { actor: string; correlationId: string }): Promise<Row> {
    const found = await this.deliveryOf(cap, actionId, deliveryId);
    if (found === null) throw new HttpException(errorBody('EYE_STA_001', a.correlationId, `retention delivery rejected: no such delivery ${deliveryId} of ${actionId}`), 404);
    return cap.acknowledgeExportDelivery({ deliveryId, tenantId: scope.tenantId, domainId: scope.domainId, receipt, receiptDigest: contentDigest(receipt), actor: a.actor, correlationId: a.correlationId });
  }

  // ───────────────────────── B14 (0074 §3; D3): the revocation notice ─────────────────────────

  /**
   * THE NOTICE to one destination, inside a governed write (the revoke act's own, or the notify act's): the port's gates
   * (begin_revocation_notice — the package revoked, the destination one that received it, the attempt under the action's delivery lock),
   * the notice built from the package row, the executor by the destination's kind (revocation.json at a transfer station — `created`
   * receives the path when newly written, for the controller's cleanup after a commit that failed; a JSON POST to an https endpoint),
   * the outcome recorded whatever it is. A retired destination is still notified: it holds the package. B16 (Codex B14-F1): the port's
   * gate is `retention.export_delivery_held` — the destination holds the package (`confirmed`) or may hold it (`possible`: a failure after
   * the body left, a receipt that did not parse); the notice and its record carry that word; a destination that provably received
   * nothing is the port's refusal.
   */
  async notifyRevocation(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, actionId: string, destinationId: string, a: { actor: string; correlationId: string }, created: string[]): Promise<Row> {
    const begun = await cap.beginRevocationNotice({ actionId, tenantId: scope.tenantId, domainId: scope.domainId, destinationId, actor: a.actor, correlationId: a.correlationId });
    const noticeId = String(begun['notice_id']); const attempt = Number(begun['attempt']);
    const pkg = (begun['package'] ?? {}) as Row; const destination = (begun['destination'] ?? {}) as Row; const delivery = (begun['delivery'] ?? {}) as Row;
    const notice: RevocationNotice = {
      tenantId: scope.tenantId, domainId: scope.domainId, actionId, noticeId, attempt,
      destinationKey: String(destination['destination_key'] ?? ''), recipient: String(destination['recipient'] ?? ''),
      deliveryId: String(delivery['delivery_id'] ?? ''), deliveryAttempt: Number(delivery['attempt'] ?? 0), deliveryState: String(delivery['state'] ?? ''),
      held: delivery['held'] === 'possible' ? 'possible' : 'confirmed',
      packageDigest: String(pkg['package_digest'] ?? ''), archiveDigest: String(pkg['archive_digest'] ?? ''), signingKeyId: typeof pkg['signing_key_id'] === 'string' ? (pkg['signing_key_id'] as string) : null,
      revokedAt: instantOf(pkg['revoked_at']), reason: typeof pkg['revoke_reason'] === 'string' ? (pkg['revoke_reason'] as string) : null, notifiedAt: new Date().toISOString(),
    };
    const kind = String(destination['kind'] ?? ''); const endpoint = String(destination['endpoint'] ?? '');
    let outcome: Awaited<ReturnType<ExportDeliveryService['notifyTransferStation']>> | Awaited<ReturnType<ExportDeliveryService['notifyHttps']>>;
    if (kind === 'transfer_station') outcome = await this.delivery.notifyTransferStation({ endpoint, notice, created });
    else if (kind === 'https') outcome = await this.delivery.notifyHttps({ endpoint, credentialRef: typeof destination['credential_ref'] === 'string' ? (destination['credential_ref'] as string) : null, trustAnchorPem: typeof destination['trust_anchor_pem'] === 'string' ? (destination['trust_anchor_pem'] as string) : null, notice });
    else throw new HttpException(errorBody('EYE_STA_002', a.correlationId, `retention notice rejected: the destination's kind ${kind} has no executor`), 409);
    const sent = this.delivery.noticeOf(notice);
    const receiptDigest = outcome.receipt === null ? null : contentDigest(outcome.receipt);
    const recorded = await cap.recordRevocationNotice({ noticeId, actionId, tenantId: scope.tenantId, domainId: scope.domainId, destinationId, deliveryId: notice.deliveryId, attempt, state: outcome.state,
                                                         notice: sent, noticeDigest: contentDigest(sent), receipt: outcome.receipt, receiptDigest, failureClass: outcome.failureClass, actor: a.actor, correlationId: a.correlationId });
    const station = 'directory' in outcome ? { directory: outcome.directory, file: outcome.file } : null;
    const egress = 'egress' in outcome ? outcome.egress : null;
    return { ...recorded, notice_id: noticeId, attempt, state: outcome.state, failure_class: outcome.failureClass, receipt: outcome.receipt, receipt_digest: receiptDigest, notice: sent,
             destination: { destination_id: destinationId, destination_key: notice.destinationKey, kind, endpoint, recipient: notice.recipient, retired_at: instantOf(destination['retired_at']) }, delivery, station, egress };
  }

  /** After the revocation committed: the product's package.tar and package.sig removed from every transfer station that received the package (what was removed, absent, failed — per destination). */
  async removeStationPackages(scope: { tenantId: string; domainId: string }, actionId: string, stations: Array<{ destination_key: string; endpoint: string }>): Promise<Row[]> {
    const out: Row[] = [];
    for (const st of stations) out.push({ destination_key: st.destination_key, ...(await this.delivery.removeStationPackage(st.endpoint, scope, actionId)) });
    return out;
  }

  /** D3: the notices of an action, each with its destination's key and kind, oldest first. */
  async revocationNotices(cap: RetentionReads, actionId: string): Promise<Row[]> {
    const rows = (await cap.readExportRevocationNotices().selectAll().where('action_id' as never, '=', actionId as never).orderBy('notified_at' as never).execute()) as Row[];
    if (rows.length === 0) return [];
    const destinations = (await cap.readExportDestinations().select(['destination_id' as never, 'destination_key' as never, 'kind' as never, 'recipient' as never]).execute()) as Row[];
    const byId = new Map(destinations.map((d) => [String(d['destination_id']), d]));
    return rows.map((r) => { const d = byId.get(String(r['destination_id'])); return { ...r, destination_key: d?.['destination_key'] ?? null, kind: d?.['kind'] ?? null, recipient: d?.['recipient'] ?? null }; });
  }

  /** A notice row of this action, as the collect and acknowledge acts find it, with its destination — or null. */
  async noticeOf(cap: RetentionReads, actionId: string, noticeId: string): Promise<{ notice: Row; destination: Row | null } | null> {
    const notice = ((await cap.readExportRevocationNotices().selectAll().where('action_id' as never, '=', actionId as never).where('notice_id' as never, '=', noticeId as never).executeTakeFirst()) as Row | undefined);
    if (notice === undefined) return null;
    const destination = ((await cap.readExportDestinations().selectAll().where('destination_id' as never, '=', String(notice['destination_id']) as never).executeTakeFirst()) as Row | undefined) ?? null;
    return { notice, destination };
  }

  /** THE COLLECT ACT of a notice: the recipient's revocation-receipt.json read from the transfer station's directory of the action, naming its notice_id, to the acknowledgement port. */
  async collectRevocationReceipt(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, actionId: string, noticeId: string, a: { actor: string; correlationId: string }): Promise<Row> {
    const conflict = (message: string): never => { throw new HttpException(errorBody('EYE_STA_002', a.correlationId, message), 409); };
    const found = await this.noticeOf(cap, actionId, noticeId);
    if (found === null) throw new HttpException(errorBody('EYE_STA_001', a.correlationId, `retention notice rejected: no such notice ${noticeId} of ${actionId}`), 404);
    if (found.destination === null || String(found.destination['kind']) !== 'transfer_station') conflict(`retention notice rejected: notice ${noticeId} is not a transfer-station notice; its receipt is presented through the acknowledge route`);
    if (String(found.notice['state']) !== 'notified') conflict(`retention notice rejected: notice ${noticeId} is not notified (it is ${String(found.notice['state'])})`);
    let collected: { receipt: Row; path: string; byteLength: number };
    try { collected = await this.delivery.collectRevocationReceipt(String(found.destination?.['endpoint'] ?? ''), scope, actionId); }
    catch (e) {
      if (e instanceof TransferStationRefused) return conflict(e.reason === 'no_receipt' ? `retention notice rejected: ${e.message}` : `retention notice rejected (${e.reason}): ${e.message}`);
      throw e;
    }
    if (typeof collected.receipt['notice_id'] !== 'string') conflict(`retention notice rejected (receipt_invalid): the receipt at ${collected.path} names no notice_id; a receipt without one is presented through the acknowledge route`);
    const row = await cap.acknowledgeRevocationNotice({ noticeId, tenantId: scope.tenantId, domainId: scope.domainId, receipt: collected.receipt, receiptDigest: contentDigest(collected.receipt), actor: a.actor, correlationId: a.correlationId });
    return { ...row, collected_from: collected.path, receipt_bytes: collected.byteLength };
  }

  /** THE ACKNOWLEDGE ACT of a notice: the recipient's receipt presented out of band, to the same port. */
  async acknowledgeRevocationNotice(cap: RetentionWrites, scope: { tenantId: string; domainId: string }, actionId: string, noticeId: string, receipt: Row, a: { actor: string; correlationId: string }): Promise<Row> {
    const found = await this.noticeOf(cap, actionId, noticeId);
    if (found === null) throw new HttpException(errorBody('EYE_STA_001', a.correlationId, `retention notice rejected: no such notice ${noticeId} of ${actionId}`), 404);
    return cap.acknowledgeRevocationNotice({ noticeId, tenantId: scope.tenantId, domainId: scope.domainId, receipt, receiptDigest: contentDigest(receipt), actor: a.actor, correlationId: a.correlationId });
  }
}

/** B14 (D2): the anchor as the answers show it — never the PEM twice: the certificates by subject and fingerprint. */
function trustAnchorSummary(pem: string | null): Row | null {
  if (pem === null) return null;
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  const certificates: Row[] = [];
  for (const block of blocks) {
    try { const c = new X509Certificate(block); certificates.push({ subject: c.subject, fingerprint256: c.fingerprint256, valid_to: c.validTo, ca: c.ca }); }
    catch { certificates.push({ subject: null, fingerprint256: null, valid_to: null, ca: null, unparsed: true }); }
  }
  return { declared: true, certificates };
}

/** A timestamptz column as the driver hands it (a Date) or a jsonb instant (a string), as an ISO string; null when absent. */
function instantOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
