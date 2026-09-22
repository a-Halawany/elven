/**
 * THE GOVERNED IMPORT (CP-6 B16; D1–D7, §3.3): an inbound customer-export package — another domain's, or another installation's —
 * quarantined, verified, approved and ADMITTED into this domain as records of this domain, under ids this installation mints, with
 * the origin's identity carried as digest-bound provenance and the whole crossing recorded in the import ledger
 * (retention.imports / import_items / import_events, 0076 §4). Four governed acts, three people:
 *
 *   OPEN (retention.import.open; a steward) — ONE governed write. The package arrives INLINE (base64 in the governed payload, at most
 *   IMPORT_INLINE_MAX_BYTES decoded) or from a TRANSFER STATION declared in this domain (the disconnected tier, DZ-17: `package.tar`
 *   with `delivery.json`, `package.sig` and — when the origin revoked it — `revocation.json` beside it). The archive is scanned ONCE,
 *   entry by entry, in constant memory (scanUstarStream: the customer verifier's rules). manifest.json must come FIRST — the product
 *   writes it first — and is stored and checked before any further entry is stored: the manifest checks (the format, the ORIGIN not
 *   this domain, the chain, the key-signed scheme, the PARTNER holding the key, the signature over the recomputed digest); when one
 *   fails the remaining entries are DRAINED — hashed and counted, nothing stored (C5: no disk for a package no partner signed; the
 *   station package stays where it is for "declare the partner and open again"). Otherwise every entry the manifest LISTS is stored
 *   through `vault.store('quarantine', …)` — manifest.json and links.json too, kept in memory as well up to 64 MiB — one entry at a
 *   time, released before the next, each inventoried by its item or by the row's manifest/links locators (an unlisted entry is
 *   drained: completeness fails on it, and no blob lies in the quarantine root that no row names); an entry above the vault's blob
 *   ceiling is hashed and dropped (refused at admission, gate oversize).
 *   Then the ordered checks (import-package.ts, §3.4), the PLAN (every id minted here, the map fixed at the open; reuse by origin
 *   object id, N3; entity reuse by authoritative identifier, N4) and the row: `verified` or `quarantined`, its items, its events. A
 *   throw after blobs were stored — the port's refusal, the commit — is the controller's cleanup of `created` (nothing stays on disk
 *   that no row inventories). A quarantined import keeps every blob it stored: the request and the evidence (DP-47-005).
 *
 *   APPROVE (retention.import.approve; the retention authority, human-gated, never the opener) — on the PACKAGE DIGEST it read.
 *
 *   ADMIT (retention.import.admit; a steward, human-gated, never the approver) — the orchestrating loop (the extraction's idiom,
 *   intelligence/extraction/orchestrator.service.ts): write #0 begins the admission (the partner and the intake contract re-checked
 *   NOW: contract_changed refuses); then the RECORDS in batches of at most 32 — before each batch, one record at a time (N8): the
 *   quarantine bytes read, INSPECTED (content-controls.ts: the same bounded checks every upload passes; a failing verdict excludes
 *   the record, gate content) and COPIED into the evidence vault as an admitted candidate (the lifecycle's own 8a discipline), the
 *   bytes released before the next — then the batch's write, its bound target set the batch's planned canonical ids: the manifest
 *   under the intake contract with its custody.imported row, the imported header and payload (import-package.ts: identity, owner,
 *   record time, correlation and provenance reference this domain's; everything else verbatim), objects.admit_version under
 *   retention.import.admit; then the CLAIM VERSIONS in batches (their lineage rows naming the record's NEW id under the bytes
 *   digest); then ONE graph write (identifier systems, entities, identifiers, edges — a superseding edge before the edge it
 *   supersedes) and the finish. EVERY item runs under its own savepoint (C3): a port's refusal — objects.admit_version's, the
 *   header trigger's, a retention port's class-suffixed refusal — marks THAT item refused with its gate and the port's own words;
 *   the batch goes on; only an infrastructure fault propagates, and then the import stays ADMITTING with its staged items and the
 *   same act resumes it (the batch's candidates removed by name first). After the finishing commit the quarantine copies of the
 *   ADMITTED records are tombstoned — manifest.json, links.json and the refused or excluded copies stay: the evidence — and the
 *   finalisation recorded. Admitting an already-admitted import re-runs that step alone (N7).
 *
 *   WITHDRAW (retention.import.withdraw) — quarantined, verified, approved or admitting → withdrawn once (already-admitted rows
 *   stand: append-only); after the commit the import's quarantine copies go (`tombstoneQuarantine`) and the tombstoning is
 *   recorded by a write after (`recordEvidenceTombstoned`; C5). The sweeper's TTL pass is the other way quarantined bytes go.
 *
 *   REVOKE (retention.import.revoke; CP-6 B17, 0077 §7 — the tenant's retention authority acting across the tenant from the
 *   origin's revoke act (D7), or the importing domain's steward for the manual and the foreign path; human-gated) — the origin's
 *   revocation EXECUTED where the copies are: the recipient obligation the product holds itself to. Write #0 begins it: the SOURCE
 *   established — `origin` (this installation's own record of the package, read by the port across the tenant's domains) or
 *   `station` (the origin's SIGNED revocation.json at a transfer station declared here, verified against the import's PARTNER key
 *   before the port and, on a key mismatch, against every other partner of the SAME PARTY — the rotated key, C7; a retired partner's
 *   key still verifies a notice dated before its retirement; an unsigned or unverifiable notice is REFUSED with the refusal recorded,
 *   import.revocation_refused, nothing destroyed) — the state moved to revoking, the attempt counted. Then, in dependency order
 *   REVERSED and every item under its own savepoint (C3): ONE graph write — the edges this import created retracted, the entities it
 *   created retired (their identifiers stay: facts of a retired entity, D10), the identifiers, the identifier systems and every
 *   REUSED row left (the item map is the reference count, D5); the CLAIMS in batches of at most 32 object ids — the object's latest
 *   version withdrawn by a new version (lifecycle and truth state withdrawn: import-package.ts importWithdrawalHeaderOf; its lineage
 *   rows carried onto the withdrawn version, D12) under retention.import.revoke; the RECORDS in batches — the withdrawn version,
 *   observation.tombstone_blob and custody.tombstoned in the write, the bytes (both roots, the staged copies too) after the commit;
 *   a LEGAL HOLD refuses the WHOLE record step (rolled back to the item's savepoint — the hold keeps the record whole), outcome
 *   refused with the hold named; then the FINISH — state revoked when nothing is refused, else revoking with import.revocation_held
 *   (the steward retries the route when the hold is lifted) — and the ONE GraphChanged/import.revoked of the attempt (C4: built from
 *   the ITEM MAP, every item settled since the attempt before, so an attempt resumed after a fault announces what the earlier one
 *   destroyed too; the walk from every tombstoned record and from every withdrawn claim no seeded record reaches, the first 32
 *   seeds, C6); then the RECEIPT write — import.copies_destroyed or import.copies_refused, the origin's notice answered when the
 *   origin is a domain of this tenant (answer_import_notice inside the port), revocation-receipt.json written beside a station
 *   notice first. A COPY ANOTHER LIVE IMPORT HOLDS is left and the receipt says so (C9: copies_destroyed false with the holders
 *   named — the honest answer, mismatched at the origin; the copy falls with that import's revocation, which finds its source no
 *   longer live). A REVOKED import revoked again is a RETRY (C5): the bytes still present removed, and a fresh receipt recorded when
 *   anything moved, no receipt event stands for the latest attempt, or a notice is pending on the origin ledger; else nothing beyond
 *   write #0. Two attempts serialise on the import's advisory lock (C14): an item another attempt settled is skipped, never refused;
 *   an infrastructure fault propagates and the import stays REVOKING for the same route to resume (import.revocation_failed).
 *   B18 (Codex B17-F1): the CLEANUP and the RECEIPT of a finish are built from the ITEM MAP, never from one attempt's tally — a resumed
 *   attempt removes the bytes of every record any attempt tombstoned (the crashed attempt's as `residual`), the removal is VERIFIED
 *   against both roots before the receipt says copies_destroyed (a locator still present is `remaining`, the receipt copies_refused
 *   with the locators named, the origin's notice mismatched; the next revoke — the retry branch — owes them), and the receipt's counts,
 *   refused items and holders are what the map records; a redelivery of a completed revocation adds no event (the retry's rule).
 *
 * THE SUBSCRIBERS (CP-6 B17; D1, D20): the admission publishes through the pipeline's `outboxEvents` — ONE ObservationRecorded per
 * admitted record from each record batch's write (acquisition_mode import, run_id null, the intake contract's source and authority
 * class, the bytes digest, the origin named under `imported`) and ONE GraphChanged/import.admitted from the graph write that moves
 * the import to admitted (the created entities `created`, the reused ones `reached` AS THEY STAND — a retired one included, C2 —
 * the edges this import recorded, the admitted claims and records; reused claims, records and edges are not announced, nothing
 * changed for them, C13; no walk: nothing of the domain rests on the new ids yet). The revocation's event is the one above.
 *
 * What is NOT done here, and said so: imported claims carry the origin's run/method/call ids and no runs_current/methods_current
 * rows exist for them in this domain (they are not reviewable — intelligence.request_review refuses an imported claim, 0077 §8;
 * imported evidence is not re-extracted); `obs_object_id` stays the origin's (the OBS record is not carried by a package); no
 * entity resolution beyond the authoritative identifier; a DESTROYED copy is never reused (C2: the reuse lookup skips revoked
 * items — a later package carrying the same objects admits them afresh under new ids; the same package digest stays refused as a
 * duplicate), while the identifier path may find a RETIRED entity holding the authoritative identifier and reuses it as it is,
 * retired (the memory-mappings proposal the revocation raised is where a person decides); the propagation reaches the tenant's
 * own domains — a foreign installation is the station path.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { sql } from 'kysely';
import { canonicalHeaderDigest, contentDigest, errorBody, validateHeader, type CanonicalHeader, type Envelope } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import { PipelineService, type RouteInfo } from '../pipeline/pipeline.service.js';
import { VaultService, VaultIntegrityError, type StoredBlob, type VaultName } from '../observation/vault/vault.service.js';
import { inspectContent } from '../observation/connectors/content-controls.js';
import { isInfrastructureFault } from '../observation/acquisition/lifecycle.service.js';
import { normalizeName } from '../graph/entities/resolver.service.js';
import { ImpactService } from '../graph/strategy/impact.service.js';
import { importAdmittedEvent, importRevokedEvent, type ImportChangeFacts, type ImportWalkSeed } from '../graph/subscriptions/change-events.js';
import { RetentionCapability, type RetentionReads, type RetentionWrites } from './retention.capabilities.js';
import { RetentionService } from './retention.service.js';
import { ExportDeliveryService, TransferStationRefused } from './export-delivery.service.js';
import { verifyNotice } from './revocation-notice.js';
import { EXPORT_STREAM_MAX_BYTES, ExportArchiveError, IMPORT_INLINE_MAX_BYTES, LINKS_FILE, listedFilesOf, scanUstarStream } from './export-archive.js';
import { IMPORT_KEPT_MAX_BYTES, classificationRank, importFormOf, importWithdrawalHeaderOf, importedFromOf, importedHeaderOf, importedPayloadOf, manifestChecks, originOf, planOf, verifyStaged,
         type ImportCheck, type ImportItemKind, type ImportRevocationRef, type PlanLookup, type StagedEntry, type StagedPackage, type VerificationContext } from './import-package.js';

export type { ImportCheck } from './import-package.js';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
type Actor = { actor: string; correlationId: string };
/** What the governed loops need of the request: the envelope and principal every write is made under, and the controller's route builder. */
type WriteArgs = { envelope: Envelope; principal: AuthenticatedPrincipal; route: (action: string, objectType: string, objectId: string, writableTargets?: string[]) => RouteInfo };
/** D1: what a write's handler answers — its result and the events the committed transition announces (the pipeline enqueues them in the same transaction). */
type Written<T> = { result: T; outboxEvents?: Array<{ eventType: string; payload: Record<string, unknown> }> };

/** D4: the two intake forms — the tar inline (base64, with the sender's exchange statement when there is one) or at a declared transfer station. */
export type ImportIntake =
  | { kind: 'inline'; base64: string; exchange: Row | null }
  | { kind: 'station'; destinationKey: string; origin: { tenantId: string; domainId: string; actionId: string } };

/** A record batch (D2): at most 32 planned canonical ids per write — ctx.assert_bound_target's ceiling on a declared target set. */
const BATCH = 32;
/** B18: the receipt's byte lists are cut here (the station receipt file is read under a 64 KiB ceiling); the ledger event keeps the whole lists. */
const RECEIPT_LIST_MAX = 200;
/** The action every admission write runs under (0076 §5: the canonical-write action of the import). */
const ADMIT_ACTION = 'retention.import.admit';
/** B17 (0077 §8): the action every revocation write runs under — the canonical-write action of the withdrawn versions. */
const REVOKE_ACTION = 'retention.import.revoke';
/**
 * C3: a PORT'S REFUSAL of one item — objects.admit_version (admission rejected), the header trigger (header semantics), the target
 * binding (target binding denied / header binding) and the retention ports' own class-suffixed refusals — as opposed to an
 * infrastructure fault (lifecycle.service.ts isInfrastructureFault): the item is marked, the batch goes on.
 */
const PORT_REFUSAL = /^(admission rejected:|header semantics:|target binding denied:|header binding|retention import rejected)/;
const REFUSAL_CODES = /^(22|23|42)/;
/** B17 (C14): an item ANOTHER attempt settled while this one waited on the import's lock — skipped, never refused (import_item_revocable's words). */
const SETTLED_BY_ANOTHER_ATTEMPT = /^retention import rejected: item .* was revoked at/;
/** B17 (D12): the legal hold's refusal of a tombstone (observation.tombstone_blob, P0R01) — the hold id in its words; the one refusal that is not a port's class. */
const HOLD_REFUSAL = /^tombstone refused: manifest .* is under a legal hold \(hold ([0-9a-f-]{36})\)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const instantOf = (v: unknown): string | null => { if (v === null || v === undefined) return null; if (v instanceof Date) return v.toISOString(); const t = Date.parse(String(v)); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** What the scan reads: a source opened as a stream (once for the scan, once more for the whole digest when the scan refused it). */
interface IntakeSource { open: () => Readable; size: number | null; intake: Row; exchange: Row | null; revocation: Row | null }
/** What the station opener answers (export-delivery.service.ts `openStationPackage`, C2c: `revocation` = revocation.json when present). */
interface OpenedStationPackage { directory: string; tar: { size: number; open: () => Readable }; deliveryJson: Row | null; signature: Row | null; revocation?: Row | null }

/** One item's settled outcome during an admission (this attempt's, or an earlier attempt's as recorded). */
interface Outcome { disposition: 'admitted' | 'reused' | 'excluded' | 'refused'; admitted: Row | null; gate: string | null; reason: string | null }
/** A record decided before its batch's write: what the write does with it (the candidate created for an admission). */
interface DecidedRecord { item: Row; object: Row | null; verdict: ReturnType<typeof inspectContent> | null; candidate: StoredBlob | null; outcome: Outcome | null }

/** B17 (D19): where a revocation's authority comes from — this installation's own record of the origin package, or the origin's signed notice at a station declared here. */
export type RevocationSource = { kind: 'origin' } | { kind: 'station'; destinationKey: string };
/** B17 (D12): a refused item of a revocation — a legal hold's, or a port's refusal — as the finish, the receipt (`ref`) and the answer name it. */
export interface RefusedRevocationItem { item_id: string; kind: string; origin_ref: string; ref: string; reason: string; hold_id: string | null; manifest_id: string | null }
/**
 * B17 (D19): what the revoke act answers — `revoked` (every copy destroyed or accounted for), `held` (a legal hold refused some; the
 * import stays revoking), `retried` (a revoked import: the bytes and the receipt retried, nothing else moved), `refused` (a station
 * notice that did not verify: the refusal recorded, nothing destroyed — the controller answers 409 with `reason`).
 */
export interface RevokeImportAnswer {
  import: Row; kind: 'revoked' | 'held' | 'retried' | 'refused';
  revocation: {
    attempt: number; source: Row | null; notice: Row | null;
    /** What THIS attempt settled (a retry: what every attempt settled — nothing moves at a retry). */
    destroyed: RevocationCounts; left: number;
    /** B18 (B17-F1): what EVERY attempt of this revocation settled, as the item map records it — the numbers the receipt carries. */
    cumulative?: RevocationCounts;
    refused: RefusedRevocationItem[];
    bytes: RevocationBytes | null; receipt: Row | null; answered: Row | null; station_receipt: { path: string } | { error: string } | null;
    reason?: string;
  };
  batches: Row[]; receipt: { policyDecisionId: string; auditSeq: number };
}
export interface RevocationCounts { records: number; claims: number; entities: number; edges: number }
/**
 * B18 (B17-F1): the bytes of a revocation attempt — `removed` the locators whose copies went in this attempt, `failed` the locators a
 * removal refused OR that were still present in a root when the cleanup was verified after it, `residual` the locators an EARLIER
 * attempt tombstoned whose bytes this attempt found still present (owed by the item map, not by this attempt's own tally), `remaining`
 * the locators verified still present in either root after the removal (a subset of `failed`; the next revoke of the import owes them),
 * `roots_unreachable` the blob roots whose marker could not be read during the cleanup (every owed locator is then `remaining`).
 */
export interface RevocationBytes { removed: string[]; failed: string[]; residual: string[]; remaining: string[]; roots_unreachable: VaultName[] }
/**
 * B17 (C4) / B18 (B17-F1): the test-only fault a harness arms on the revocation loop — an infrastructure fault thrown after the graph
 * write committed, or after the FIRST record batch committed (its records tombstoned on the ledger, their bytes not yet removed).
 */
export type RevocationFault = 'after_graph_write' | 'after_record_batch';
/** B18 (B17-F1): the revocation as the ITEM MAP records it — every attempt's settled items reduced to what the cleanup and the receipt owe. */
interface DurableRevocation {
  destroyed: RevocationCounts; refused: RefusedRevocationItem[]; left: number;
  /** The imports named `held_by` on the items left (C9) — whether each still stands is `liveHoldersOf`'s. */
  heldIds: string[];
  /** Every tombstoned record's locator, distinct — the bytes owed in both roots, whichever attempt tombstoned the record. */
  locators: string[];
}

@Injectable()
export class ImportService {
  /** The locators a withdrawal read inside its write, for the tombstoning after the commit (this process; the sweeper's TTL pass covers a process lost between). */
  readonly #pendingTombstones = new Map<string, string[]>();
  /** C4: the armed fault of the revocation loop (test runtime only; fires once). */
  #revocationFault: RevocationFault | null = null;

  constructor(
    private readonly vault: VaultService,
    private readonly delivery: ExportDeliveryService,
    private readonly pipeline: PipelineService,
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    private readonly impact: ImpactService,
    private readonly retention: RetentionService,
  ) {}

  /** Test runtime only (C4): the next revocation throws an infrastructure fault at the armed point — the import stays revoking, the same route resumes it. */
  armRevocationFaultForTests(kind: RevocationFault | null): void {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('armRevocationFaultForTests is available only in the test runtime');
    this.#revocationFault = kind;
  }

  /**
   * D1: every governed write of an import loop — the envelope re-stamped with a fresh message id and the action, the route bound to
   * the import (and to the batch's canonical ids when a write admits versions), the retention capability; the handler answers its
   * result and the events the committed transition announces, enqueued by the pipeline in the same transaction (never here).
   */
  private writerOf(a: WriteArgs, importId: string) {
    return <T>(action: string, objectType: string, objectId: string, writableTargets: string[] | undefined, handler: (cap: RetentionWrites) => Promise<Written<T>>) =>
      this.pipeline.write<T, RetentionWrites>({ ...a.envelope, message_id: newId(), action, object_type: objectType, object_id: objectId }, a.principal,
        a.route(action, objectType, objectId, writableTargets), RetentionCapability.write,
        async (cap) => { const w = await handler(cap); return { result: w.result, targetType: 'RIM', targetId: importId, targetVersion: null, outboxEvent: null, outboxEvents: w.outboxEvents ?? [] }; });
  }

  // ───────────────────────── OPEN (D4, D5; C5) ─────────────────────────

  async openImport(cap: RetentionWrites, scope: Scope, importId: string, intake: ImportIntake, a: Actor, created: string[]): Promise<{ import: Row; checks: ImportCheck[]; items: Row[]; verified: boolean; receipt: Row }> {
    const source = await this.sourceOf(cap, scope, intake, a.correlationId);
    const { staged, context } = await this.stage(cap, scope, source, created);
    const verdict = verifyStaged(staged, context);
    const plan = planOf(staged, context, newId, await this.planLookup(cap, scope, staged));
    const origin = originOf(staged);
    const manifestEntry = staged.entries.find((e) => e.name === 'manifest.json') ?? null;
    const linksEntry = staged.entries.find((e) => e.name === LINKS_FILE) ?? null;
    const items: Row[] = plan.items.map((it) => ({ item_id: it.item_id, kind: it.kind, origin_ref: it.origin_ref, origin_object_id: it.origin_object_id, origin: it.origin, staged: it.staged, planned: it.planned, disposition: it.disposition, gate: it.gate, reason: it.reason, dependency_order: it.dependency_order }));
    const row = await cap.recordImport({
      importId, tenantId: scope.tenantId, domainId: scope.domainId,
      partnerId: context.partner === null ? null : String(context.partner['partner_id']),
      intake: source.intake, origin, exchange: staged.exchange,
      archiveDigest: staged.archiveDigest, archiveSize: staged.archiveSize, packageDigest: verdict.packageDigest,
      manifestLocator: manifestEntry?.quarantineLocator ?? null, linksLocator: linksEntry?.quarantineLocator ?? null,
      verified: verdict.verified, checks: verdict.checks as unknown as Row[], counts: { ...plan.counts, entries: staged.entries.length, stored: staged.entries.filter((e) => e.held === 'quarantine').length },
      items, actor: a.actor, correlationId: a.correlationId,
    });
    return { import: row, checks: verdict.checks, items, verified: verdict.verified, receipt: this.receiptOf(row) };
  }

  /** The source: the inline tar decoded (bounded), or the station's package opened (the delivery service's containment rules; the exchange files beside it). */
  private async sourceOf(cap: RetentionWrites, scope: Scope, intake: ImportIntake, correlationId: string): Promise<IntakeSource> {
    if (intake.kind === 'inline') {
      const bytes = Buffer.from(intake.base64, 'base64');
      if (bytes.byteLength > IMPORT_INLINE_MAX_BYTES) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `an inline package is at most ${IMPORT_INLINE_MAX_BYTES} bytes decoded (this one is ${bytes.byteLength}); deliver a larger package to a transfer station declared in this domain and open the import from it`), 422);
      return { open: () => Readable.from([bytes]), size: bytes.byteLength, intake: { kind: 'inline', byte_length: bytes.byteLength, exchange_presented: intake.exchange !== null }, exchange: intake.exchange, revocation: null };
    }
    const { destination, endpoint } = await this.stationOf(cap, scope, intake.destinationKey, correlationId);
    let opened: OpenedStationPackage;
    try { opened = await this.delivery.openStationPackage(endpoint, intake.origin); }
    catch (e) {
      if (e instanceof TransferStationRefused) throw new HttpException(errorBody(e.reason === 'no_package' ? 'EYE_STA_001' : 'EYE_STA_002', correlationId, `retention import rejected (${e.reason}): ${e.message}`), e.reason === 'no_package' ? 404 : 409);
      throw e;
    }
    if (opened.tar.size > EXPORT_STREAM_MAX_BYTES) throw new HttpException(errorBody('EYE_STA_002', correlationId, `retention import rejected: the station package is ${opened.tar.size} bytes, above the streamed archive ceiling of ${EXPORT_STREAM_MAX_BYTES} bytes`), 409);
    return {
      open: opened.tar.open, size: opened.tar.size,
      intake: { kind: 'station', destination_id: String(destination['destination_id']), destination_key: intake.destinationKey, endpoint, path: opened.directory, origin: { tenant_id: intake.origin.tenantId, domain_id: intake.origin.domainId, action_id: intake.origin.actionId }, files: { package: 'package.tar', delivery: opened.deliveryJson !== null, signature: opened.signature !== null, revocation: (opened.revocation ?? null) !== null } },
      exchange: opened.deliveryJson, revocation: opened.revocation ?? null,
    };
  }

  /** A transfer station declared in this domain, by key — active, of the kind (404 / 409 in the import's words); the open and the revocation read the same directory. */
  private async stationOf(cap: RetentionReads, scope: Scope, destinationKey: string, correlationId: string): Promise<{ destination: Row; endpoint: string }> {
    const destination = (await cap.readExportDestinations().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
      .where('destination_key' as never, '=', destinationKey as never).where('retired_at' as never, 'is', null as never).executeTakeFirst()) as Row | undefined;
    if (destination === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `retention import rejected: no such transfer station ${destinationKey} in this domain`), 404);
    if (String(destination['kind']) !== 'transfer_station') throw new HttpException(errorBody('EYE_STA_002', correlationId, `retention import rejected: destination ${destinationKey} is ${String(destination['kind'])}, not a transfer station; an import reads a station's directory`), 409);
    return { destination, endpoint: String(destination['endpoint'] ?? '') };
  }

  /**
   * THE SCAN (C5): one pass; manifest.json first, stored and checked before anything else is stored; the rest stored one at a time
   * or drained. The context (the partner by the manifest's key, its contract, the origin's state, a live duplicate) is read as soon as
   * the manifest is parsed, because the manifest checks need it — and it is the context the full verification uses afterwards.
   */
  private async stage(cap: RetentionWrites, scope: Scope, source: IntakeSource, created: string[]): Promise<{ staged: StagedPackage; context: VerificationContext }> {
    const vaultMax = this.cfg['eye.vault.max_blob_bytes'];
    const entries: StagedEntry[] = [];
    let firstEntry: string | null = null;
    let manifestBytes: Buffer | null = null; let manifest: Row | null = null; let manifestError: string | null = null;
    let linksBytes: Buffer | null = null; let links: Row | null = null; let linksError: string | null = null;
    let context: VerificationContext | null = null;
    let store = false;
    // Only the files the manifest LISTS are stored (each inventoried by its item, or by the manifest/links locators); an entry
    // outside the listing is drained — completeness fails on it, and no blob ever lies in the quarantine root that no row names.
    let listed: Set<string> = new Set();
    let archiveError: string | null = null; let archiveDigest = ''; let archiveSize = 0;
    const scanner = scanUstarStream(source.open());
    const partial: Pick<StagedPackage, 'manifest' | 'manifestBytes' | 'manifestError'> = { manifest: null, manifestBytes: null, manifestError: null };
    try {
      for await (const e of scanner.entries) {
        if (firstEntry === null) {
          firstEntry = e.name;
          if (e.name === 'manifest.json' && e.regular) {
            const read = await readEntry(e.body, IMPORT_KEPT_MAX_BYTES);
            if (read.bytes === null) {
              manifestError = `manifest.json is ${read.size} bytes, above the ${IMPORT_KEPT_MAX_BYTES} bytes an import keeps in memory`;
              entries.push({ name: e.name, size: read.size, digest: read.digest, regular: true, quarantineLocator: null, held: 'drained' });
            } else {
              manifestBytes = read.bytes;
              const parsed = parseObject(manifestBytes);
              if (parsed.ok) manifest = parsed.value; else manifestError = `manifest.json ${parsed.error}`;
              // The manifest is ALWAYS stored: it is the request, and a quarantined import preserves it (DP-47-005).
              const stored = await this.vault.store('quarantine', scope, manifestBytes, read.digest);
              created.push(stored.locator);
              entries.push({ name: e.name, size: read.size, digest: read.digest, regular: true, quarantineLocator: stored.locator, held: 'quarantine' });
            }
            partial.manifest = manifest; partial.manifestBytes = manifestBytes; partial.manifestError = manifestError;
            context = await this.contextOf(cap, scope, partial);
            store = manifestChecks(partial, context).store;
            if (store) {
              try { listed = new Set(listedFilesOf(manifest?.['objects'], manifest as { package?: { links?: unknown } })); }
              catch { store = false; }
            }
          } else {
            // C5: manifest.json is not first — nothing of this package is stored; the rest is drained for the record of what arrived.
            const read = await readEntry(e.body, 0);
            entries.push({ name: e.name, size: read.size, digest: read.digest, regular: e.regular, quarantineLocator: null, held: 'drained' });
            manifestError = `manifest.json is not the first entry (${JSON.stringify(e.name)} is); nothing was read as the manifest`;
            store = false;
          }
          continue;
        }
        if (!store || !e.regular || !listed.has(e.name)) {
          const read = await readEntry(e.body, 0);
          entries.push({ name: e.name, size: read.size, digest: read.digest, regular: e.regular, quarantineLocator: null, held: 'drained' });
          continue;
        }
        if (e.name === LINKS_FILE) {
          const read = await readEntry(e.body, IMPORT_KEPT_MAX_BYTES);
          if (read.bytes === null) {
            linksError = `${LINKS_FILE} is ${read.size} bytes, above the ${IMPORT_KEPT_MAX_BYTES} bytes an import keeps in memory`;
            entries.push({ name: e.name, size: read.size, digest: read.digest, regular: true, quarantineLocator: null, held: 'drained' });
          } else {
            linksBytes = read.bytes;
            const parsed = parseObject(linksBytes);
            if (parsed.ok) links = parsed.value; else linksError = `${LINKS_FILE} ${parsed.error}`;
            const stored = await this.vault.store('quarantine', scope, linksBytes, read.digest);
            created.push(stored.locator);
            entries.push({ name: e.name, size: read.size, digest: read.digest, regular: true, quarantineLocator: stored.locator, held: 'quarantine' });
          }
          continue;
        }
        if (e.size > vaultMax) {
          const read = await readEntry(e.body, 0);
          entries.push({ name: e.name, size: read.size, digest: read.digest, regular: true, quarantineLocator: null, held: 'oversize' });
          continue;
        }
        // One record at a time: read whole (its size is known and under the ceiling), stored, released before the next.
        const read = await readEntry(e.body, vaultMax);
        if (read.bytes === null) { entries.push({ name: e.name, size: read.size, digest: read.digest, regular: true, quarantineLocator: null, held: 'oversize' }); continue; }
        const stored = await this.vault.store('quarantine', scope, read.bytes, read.digest);
        created.push(stored.locator);
        entries.push({ name: e.name, size: read.size, digest: read.digest, regular: true, quarantineLocator: stored.locator, held: 'quarantine' });
      }
      archiveDigest = await scanner.digest(); archiveSize = await scanner.size();
    } catch (e) {
      if (!(e instanceof ExportArchiveError)) throw e;
      // A malformed archive: the scan stopped where the rule broke; the WHOLE source is digested in a second pass, so the row names the bytes that arrived.
      archiveError = e.message;
      const whole = await digestOfStream(source.open());
      archiveDigest = whole.digest; archiveSize = whole.size;
    }
    if (context === null) context = await this.contextOf(cap, scope, { manifest, manifestBytes, manifestError: manifestError ?? 'the archive holds no entry' });
    const staged: StagedPackage = { archiveDigest, archiveSize, archiveError, firstEntry, manifestBytes, manifest, manifestError, linksBytes, links, linksError, entries, exchange: source.exchange, revocation: source.revocation };
    return { staged, context };
  }

  /** The facts the checks need beyond the package: the active partner holding the manifest's key, its intake contract, the origin's state of the package, a live import of the same digest. */
  private async contextOf(cap: RetentionWrites, scope: Scope, s: Pick<StagedPackage, 'manifest' | 'manifestBytes' | 'manifestError'>): Promise<VerificationContext> {
    const sig = isObject(s.manifest) && isObject(s.manifest['signature']) ? (s.manifest['signature'] as Row) : null;
    const keyId = sig !== null && typeof sig['key_id'] === 'string' ? (sig['key_id'] as string) : null;
    let partner: Row | null = null; let contract: Row | null = null;
    if (keyId !== null) {
      partner = ((await cap.readExchangePartners().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
        .where('key_id' as never, '=', keyId as never).where('retired_at' as never, 'is', null as never).orderBy('declared_at' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined) ?? null;
      if (partner !== null) {
        contract = ((await cap.readSourceContracts().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
          .where('source_id' as never, '=', String(partner['intake_source_id']) as never).where('contract_version' as never, '=', Number(partner['intake_contract_version']) as never).executeTakeFirst()) as Row | undefined) ?? null;
      }
    }
    const origin = originOf(s);
    let originState: Row = { known: false };
    let liveImport: Row | null = null;
    const packageDigest = typeof origin['package_digest'] === 'string' ? (origin['package_digest'] as string) : null;
    if (packageDigest !== null) {
      const ot = String(origin['tenant_id'] ?? ''); const od = String(origin['domain_id'] ?? ''); const oa = String(origin['action_id'] ?? '');
      if (UUID.test(ot) && UUID.test(od) && UUID.test(oa)) {
        try { originState = await cap.importOriginState({ tenantId: scope.tenantId, domainId: scope.domainId, originTenantId: ot, originDomainId: od, actionId: oa, packageDigest }); }
        catch (e) { if (isInfrastructureFault(e)) throw e; originState = { known: false, error: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 200) }; }
      }
      liveImport = ((await cap.readImports().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
        .where('package_digest' as never, '=', packageDigest as never).where('state' as never, 'not in', ['quarantined', 'withdrawn'] as never).orderBy('opened_at' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined) ?? null;
    }
    return { partner, contract, origin: isObject(originState) ? originState : { known: false }, liveImport, importingDomain: scope, now: new Date(), vaultMaxBytes: this.cfg['eye.vault.max_blob_bytes'] };
  }

  /**
   * N3, N4: what the plan looks up — the domain's earlier import items for the package's origin ids and refs, and the authoritative
   * identifiers of its entities. B17 (C2): a DESTROYED copy is never reused — only an item not revoked is a prior (0077 §3's live
   * indexes); a later package carrying the objects of a revoked import admits them afresh under new ids. The identifier path is not
   * filtered: a RETIRED entity still holding the authoritative identifier is reused as it is (the event says `reached`, retired).
   */
  private async planLookup(cap: RetentionWrites, scope: Scope, s: StagedPackage): Promise<PlanLookup> {
    const m = isObject(s.manifest) ? s.manifest : null; const l = isObject(s.links) ? s.links : null;
    const objectIds = new Set<string>(); const refs = new Set<string>(); const pairs: Array<{ system_key: string; value: string }> = [];
    for (const o of Array.isArray(m?.['objects']) ? (m?.['objects'] as Row[]) : []) if (isObject(o) && typeof o['object_id'] === 'string') objectIds.add(o['object_id']);
    for (const c of Array.isArray(l?.['claims']) ? (l?.['claims'] as Row[]) : []) if (isObject(c) && typeof c['object_id'] === 'string') objectIds.add(c['object_id']);
    for (const en of Array.isArray(l?.['entities']) ? (l?.['entities'] as Row[]) : []) {
      if (!isObject(en)) continue;
      refs.add(`entity:${String(en['entity_id'])}`);
      for (const idf of Array.isArray(en['identifiers']) ? (en['identifiers'] as Row[]) : []) if (isObject(idf)) pairs.push({ system_key: String(idf['system_key']), value: String(idf['value']) });
    }
    for (const e of Array.isArray(l?.['edges']) ? (l?.['edges'] as Row[]) : []) if (isObject(e)) refs.add(`edge:${String(e['edge_id'])}`);
    const byObject = new Map<string, Row>(); const byRef = new Map<string, Row>();
    if (objectIds.size > 0) {
      const rows = (await cap.readImportItems().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
        .where('kind' as never, 'in', ['record', 'claim'] as never).where('origin_object_id' as never, 'in', [...objectIds] as never).where('disposition' as never, 'in', ['admitted', 'reused'] as never)
        .where('revoked_at' as never, 'is', null as never).orderBy('admitted_at' as never, 'desc').execute()) as Row[];
      for (const r of rows) {
        const k = `${String(r['kind'])}:${String(r['origin_object_id'])}`; if (!byObject.has(k)) byObject.set(k, r);
        const rk = `${String(r['kind'])}:${String(r['origin_ref'])}`; if (!byRef.has(rk)) byRef.set(rk, r);
      }
    }
    if (refs.size > 0) {
      const rows = (await cap.readImportItems().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
        .where('kind' as never, 'in', ['entity', 'edge'] as never).where('origin_ref' as never, 'in', [...refs] as never).where('disposition' as never, 'in', ['admitted', 'reused'] as never)
        .where('revoked_at' as never, 'is', null as never).orderBy('admitted_at' as never, 'desc').execute()) as Row[];
      for (const r of rows) { const rk = `${String(r['kind'])}:${String(r['origin_ref'])}`; if (!byRef.has(rk)) byRef.set(rk, r); }
    }
    const identified = new Map<string, string>();
    if (pairs.length > 0) {
      const systems = (await cap.readIdentifierSystems().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
        .where('is_authoritative' as never, '=', true as never).execute()) as Row[];
      const authoritative = new Set(systems.map((x) => String(x['system_key'])));
      const wanted = pairs.filter((p) => authoritative.has(p.system_key));
      if (wanted.length > 0) {
        const rows = (await cap.readEntityIdentifiers().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
          .where('system_key' as never, 'in', [...new Set(wanted.map((p) => p.system_key))] as never).where('identifier_value' as never, 'in', [...new Set(wanted.map((p) => p.value))] as never).execute()) as Row[];
        for (const r of rows) identified.set(`${String(r['system_key'])}\0${String(r['identifier_value'])}`, String(r['entity_id']));
      }
    }
    return {
      priorByObject: (kind, originObjectId) => byObject.get(`${kind}:${originObjectId}`) ?? null,
      priorByRef: (kind, originRef) => byRef.get(`${kind}:${originRef}`) ?? null,
      entityByIdentifier: (systemKey, value) => identified.get(`${systemKey}\0${value}`) ?? null,
    };
  }

  // ───────────────────────── APPROVE ─────────────────────────

  async approveImport(cap: RetentionWrites, scope: Scope, importId: string, packageDigest: string, rationale: string, a: Actor): Promise<Row> {
    return cap.approveImport({ importId, tenantId: scope.tenantId, domainId: scope.domainId, packageDigest, rationale, actor: a.actor, correlationId: a.correlationId });
  }

  // ───────────────────────── ADMIT (D2, D3; C3, N5, N8; B17 D1, D20) ─────────────────────────

  async admitImport(a: WriteArgs & { scope: Scope; importId: string }): Promise<{ import: Row; batches: Row[]; receipt: { policyDecisionId: string; auditSeq: number } }> {
    const { scope, importId } = a;
    const actor = a.principal.principalId; const correlationId = a.envelope.correlation_id;
    const batches: Row[] = [];
    const write = this.writerOf(a, importId);

    // Write #0: the admission begun (or an admitted import found: the finalisation alone, N7), the items and the facts the loop needs.
    const begun = await write<AdmissionBegun>(ADMIT_ACTION, 'RIM', importId, undefined, async (cap) => {
      const row = (await cap.readImports().selectAll().where('import_id' as never, '=', importId as never).executeTakeFirst()) as Row | undefined;
      if (row === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `retention import rejected: no such import ${importId} in this domain`), 404);
      const items = (await cap.readImportItems().selectAll().where('import_id' as never, '=', importId as never).orderBy('dependency_order' as never).execute()) as Row[];
      if (String(row['state']) === 'admitted') return { result: { kind: 'finalize', import: row, items, partner: null, contract: null } };
      const b = await cap.beginImportAdmission({ importId, tenantId: scope.tenantId, domainId: scope.domainId, actor, correlationId });
      const partner = isObject(b['partner']) ? (b['partner'] as Row) : null;
      const contractFacts = isObject(b['contract']) ? (b['contract'] as Row) : {};
      const contractRow = partner === null ? undefined : ((await cap.readSourceContracts().selectAll().where('source_id' as never, '=', String(partner['intake_source_id']) as never).where('contract_version' as never, '=', Number(partner['intake_contract_version']) as never).executeTakeFirst()) as Row | undefined);
      const importRow = isObject(b['import']) ? (b['import'] as Row) : row;
      return { result: { kind: 'admit', import: importRow, items, partner, contract: { ...(contractRow ?? {}), ...contractFacts } as Row } };
    });
    let receipt = { policyDecisionId: begun.policyDecisionId, auditSeq: begun.auditSeq };
    let importRow = begun.result.import;
    const allItems = begun.result.items;

    if (begun.result.kind === 'admit') {
      const partner = begun.result.partner; const contract = begun.result.contract ?? {};
      if (partner === null) throw new HttpException(errorBody('EYE_STA_002', correlationId, `retention import rejected: import ${importId} names no partner; only a verified import is admitted`), 409);
      try {
        const origin = isObject(importRow['origin']) ? (importRow['origin'] as Row) : {};
        const { manifest, links } = await this.reopenPackage(scope, importRow, correlationId);
        const map = mapOf(allItems);
        const outcomes = new Map<string, Outcome>();
        for (const it of allItems) if (String(it['disposition']) !== 'staged') outcomes.set(String(it['item_id']), { disposition: String(it['disposition']) as Outcome['disposition'], admitted: isObject(it['admitted']) ? (it['admitted'] as Row) : null, gate: (it['gate'] as string | null) ?? null, reason: (it['reason'] as string | null) ?? null });
        const staged = allItems.filter((it) => String(it['disposition']) === 'staged');
        const itemsByRef = new Map<string, Row>(); const recordsByObject = new Map<string, Row[]>();
        for (const it of allItems) {
          itemsByRef.set(`${String(it['kind'])}:${String(it['origin_ref'])}`, it);
          if (String(it['kind']) === 'record' && typeof it['origin_object_id'] === 'string') recordsByObject.set(it['origin_object_id'], [...(recordsByObject.get(it['origin_object_id']) ?? []), it]);
        }
        const facts: AdmissionFacts = {
          importId, scope, actor, correlationId, map, outcomes, itemsByRef, recordsByObject, origin, partner, contract,
          partnerKey: String(partner['partner_key'] ?? ''), archiveDigest: String(importRow['archive_digest'] ?? ''), packageDigest: String(importRow['package_digest'] ?? origin['package_digest'] ?? ''),
          ceiling: String(contract['classification_ceiling'] ?? ''), sourceId: String(contract['source_id'] ?? partner['intake_source_id']), contractVersion: Number(contract['contract_version'] ?? partner['intake_contract_version']),
          provenanceRef: `SRC:${String(contract['source_id'] ?? partner['intake_source_id'])}@${String(contract['contract_version'] ?? partner['intake_contract_version'])}`,
          residency: String(contract['residency'] ?? ''), retentionProfile: String(contract['retention_profile'] ?? contract['retention'] ?? 'default'), acquisitionMode: contract['acquisition_mode'] === 'replay' ? 'replay' : 'live',
          // D20 / C10: the intake contract's authority class (begin_import_admission names it beside the contract's other facts).
          authorityClass: String(contract['authority_class'] ?? 'observational'),
        };
        const manifestObjects = new Map<string, Row>();
        for (const o of Array.isArray(manifest['objects']) ? (manifest['objects'] as Row[]) : []) if (isObject(o)) manifestObjects.set(`${String(o['object_id'])}@${String(o['object_version'])}`, o);
        const closureClaims = new Map<string, Row>();
        for (const c of Array.isArray(links?.['claims']) ? (links?.['claims'] as Row[]) : []) if (isObject(c)) closureClaims.set(`${String(c['object_id'])}@${String(c['object_version'])}`, c);

        // (2) THE RECORDS in batches: decided one at a time before the write (inspect, copy, release), admitted inside it.
        const records = staged.filter((it) => String(it['kind']) === 'record');
        for (let i = 0; i < records.length; i += BATCH) {
          const batch = records.slice(i, i + BATCH);
          const decided: DecidedRecord[] = [];
          for (const item of batch) decided.push(await this.decideRecord(item, manifestObjects.get(String(item['origin_ref'])) ?? null, facts));
          try {
            const out = await write(ADMIT_ACTION, 'RIM', importId, decided.filter((d) => d.outcome === null).map((d) => String((d.item['planned'] as Row)['object_id'])), async (cap) => {
              let n = 0; const tally = { admitted: 0, reused: 0, excluded: 0, refused: 0 };
              for (const d of decided) {
                const outcome = d.outcome ?? await this.admitRecord(cap, d, facts, n);
                n += 1;
                await this.mark(cap, d.item, outcome, facts);
                tally[outcome.disposition] += 1;
              }
              // D20: ONE ObservationRecorded per record this batch ADMITTED — the lifecycle's announcement of an immutable evidence reference, in the batch's own transaction.
              const events = decided.filter((d) => facts.outcomes.get(String(d.item['item_id']))?.disposition === 'admitted').map((d) => observationRecordedOf(d, facts));
              await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.batch_admitted', details: { kind: 'record', batch: Math.floor(i / BATCH) + 1, count: decided.length, ...tally, published: events.length }, actor, correlationId });
              return { result: tally, outboxEvents: events };
            });
            receipt = { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq };
            batches.push({ kind: 'record', count: decided.length, ...out.result, policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq });
            // A refused or excluded record's candidate (created before the write, never recorded) goes now; the write that did not commit is the catch below.
            for (const d of decided) { const o = facts.outcomes.get(String(d.item['item_id'])); if (d.candidate !== null && o !== undefined && o.disposition !== 'admitted') await this.vault.tombstone('evidence', scope, d.candidate.locator).catch(() => undefined); }
          } catch (e) {
            for (const d of decided) if (d.candidate !== null) await this.vault.tombstone('evidence', scope, d.candidate.locator).catch(() => undefined);
            throw e;
          }
        }

        // (3) THE CLAIM VERSIONS in batches, ordered (origin id, version); the bound set is the batch's distinct planned ids.
        const claims = staged.filter((it) => String(it['kind']) === 'claim').sort((x, y) => { const a1 = String(x['origin_ref']); const b1 = String(y['origin_ref']); const [ia, va] = a1.split('@'); const [ib, vb] = b1.split('@'); return ia === ib ? Number(va) - Number(vb) : (String(ia) < String(ib) ? -1 : 1); });
        for (let i = 0; i < claims.length; i += BATCH) {
          const batch = claims.slice(i, i + BATCH);
          const targets = [...new Set(batch.map((it) => String((it['planned'] as Row)['object_id'])))];
          const out = await write(ADMIT_ACTION, 'RIM', importId, targets, async (cap) => {
            let n = 0; const tally = { admitted: 0, reused: 0, excluded: 0, refused: 0 };
            for (const item of batch) {
              const outcome = await this.admitClaim(cap, item, closureClaims.get(String(item['origin_ref'])) ?? null, facts, n);
              n += 1;
              await this.mark(cap, item, outcome, facts);
              tally[outcome.disposition] += 1;
            }
            await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.batch_admitted', details: { kind: 'claim', batch: Math.floor(i / BATCH) + 1, count: batch.length, ...tally }, actor, correlationId });
            return { result: tally };
          });
          receipt = { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq };
          batches.push({ kind: 'claim', count: batch.length, ...out.result, policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq });
        }

        // (4) ONE graph write — identifier systems, entities, identifiers, edges — and (5) the finish, with the ONE GraphChanged/import.admitted (D1).
        const graph = staged.filter((it) => ['identifier_system', 'entity', 'identifier', 'edge'].includes(String(it['kind'])));
        const out = await write(ADMIT_ACTION, 'RIM', importId, undefined, async (cap) => {
          let n = 0; const tally = { admitted: 0, reused: 0, excluded: 0, refused: 0 };
          for (const item of graph) {
            const kind = String(item['kind']) as ImportItemKind;
            const outcome = kind === 'identifier_system' ? await this.admitIdentifierSystem(cap, item, facts, n)
              : kind === 'entity' ? await this.admitEntity(cap, item, facts, n)
                : kind === 'identifier' ? await this.admitIdentifier(cap, item, facts, n)
                  : await this.admitEdge(cap, item, facts, n);
            n += 1;
            await this.mark(cap, item, outcome, facts);
            tally[outcome.disposition] += 1;
          }
          if (graph.length > 0) await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.batch_admitted', details: { kind: 'graph', count: graph.length, ...tally }, actor, correlationId });
          // Every item is settled now, the origin's exclusions among them (C9); the finish refuses otherwise.
          const finished = await cap.finishImportAdmission({ importId, tenantId: scope.tenantId, domainId: scope.domainId, counts: countsOf(allItems, facts.outcomes), actor, correlationId });
          // D1: the ONE event of the admission — from the item map and this attempt's outcomes, in the transaction that moved the import to admitted
          // (an import whose graph write has nothing to do still announces it: the claims and records are the change).
          const changed = importAdmittedEvent({ ...(await this.admittedFactsOf(cap, allItems, facts)), subscriptions: await cap.subscriptionsMatching({ tenantId: scope.tenantId, domainId: scope.domainId, eventType: 'GraphChanged', changeKind: 'import.admitted' }) });
          return { result: { tally, finished }, outboxEvents: [changed] };
        });
        receipt = { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq };
        if (graph.length > 0) batches.push({ kind: 'graph', count: graph.length, ...out.result.tally, policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq });
        importRow = isObject(out.result.finished) && Object.keys(out.result.finished).length > 0 ? out.result.finished : { ...importRow, state: 'admitted' };
        for (const it of allItems) { const o = facts.outcomes.get(String(it['item_id'])); if (o !== undefined) { it['disposition'] = o.disposition; it['admitted'] = o.admitted; it['gate'] = o.gate; it['reason'] = o.reason; } }
      } catch (e) {
        // The fault recorded on the import — best effort: the same fault may refuse this write too, and then the audit's own
        // handler-failure row is the record — and propagated: the import stays ADMITTING with its staged items; the same act resumes it.
        if (!(e instanceof HttpException)) {
          await write(ADMIT_ACTION, 'RIM', importId, undefined, async (cap) => ({ result: await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.failed', details: { attempt: Number(importRow['attempts'] ?? 0), reason: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 300), infrastructure: isInfrastructureFault(e) }, actor, correlationId }) })).catch(() => undefined);
        }
        throw e;
      }
    }

    // (6) After the commit: the ADMITTED records' quarantine copies go (manifest.json, links.json and the refused or excluded copies stay: the evidence); recorded.
    const locators = allItems.filter((it) => String(it['kind']) === 'record' && String(it['disposition']) === 'admitted').map((it) => (isObject(it['staged']) ? (it['staged'] as Row)['quarantine_locator'] : null)).filter((l): l is string => typeof l === 'string');
    const tomb = await this.tombstoneLocators(scope, locators);
    const fin = await write(ADMIT_ACTION, 'RIM', importId, undefined, async (cap) => {
      await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.finalized', details: { tombstoned: tomb.tombstoned, locators: tomb.locators, failed: tomb.failed, resumed: begun.result.kind === 'finalize' }, actor, correlationId });
      return { result: { ok: true } };
    });
    receipt = { policyDecisionId: fin.policyDecisionId, auditSeq: fin.auditSeq };
    batches.push({ kind: 'finalize', count: tomb.locators, tombstoned: tomb.tombstoned, failed: tomb.failed, policyDecisionId: fin.policyDecisionId, auditSeq: fin.auditSeq });
    return { import: importRow, batches, receipt };
  }

  /** The quarantined manifest and closure read back under the digests the row recorded (a copy that no longer verifies is a conflict, never read partially). */
  private async reopenPackage(scope: Scope, importRow: Row, correlationId: string): Promise<{ manifest: Row; links: Row | null }> {
    const conflict = (message: string): never => { throw new HttpException(errorBody('EYE_STA_002', correlationId, `retention import rejected: ${message}`), 409); };
    const origin = isObject(importRow['origin']) ? (importRow['origin'] as Row) : {};
    const manifestLocator = importRow['manifest_locator']; const manifestDigest = origin['manifest_digest'];
    if (typeof manifestLocator !== 'string' || typeof manifestDigest !== 'string' || !HEX64.test(manifestDigest)) return conflict(`import ${String(importRow['import_id'])} records no quarantined manifest to admit from`);
    let manifest: Row;
    try {
      const read = await this.vault.read('quarantine', scope, manifestLocator, manifestDigest);
      const parsed = parseObject(read.bytes);
      if (!parsed.ok) return conflict(`the quarantined manifest.json ${parsed.error}`);
      manifest = parsed.value;
    } catch (e) {
      if (e instanceof VaultIntegrityError) return conflict(`the quarantined manifest.json is not readable (${e.reason}); nothing is admitted from a package whose request cannot be re-read`);
      throw e;
    }
    let links: Row | null = null;
    const linksLocator = importRow['links_locator']; const linksBlock = isObject(origin['links']) ? (origin['links'] as Row) : null;
    if (typeof linksLocator === 'string' && linksBlock !== null && typeof linksBlock['links_digest'] === 'string') {
      try {
        const read = await this.vault.read('quarantine', scope, linksLocator, linksBlock['links_digest']);
        const parsed = parseObject(read.bytes);
        if (!parsed.ok) return conflict(`the quarantined ${LINKS_FILE} ${parsed.error}`);
        links = parsed.value;
      } catch (e) {
        if (e instanceof VaultIntegrityError) return conflict(`the quarantined ${LINKS_FILE} is not readable (${e.reason})`);
        throw e;
      }
    }
    return { manifest, links };
  }

  /**
   * One record BEFORE its batch's write (N8): the plan's own verdicts first (a reuse, a planned refusal), the intake ceiling, the import
   * form; then the quarantine bytes read against their digest, INSPECTED and COPIED into the evidence vault as the admitted candidate,
   * and released. What the write does with the record is decided here; the write only records it.
   */
  private async decideRecord(item: Row, object: Row | null, f: AdmissionFacts): Promise<DecidedRecord> {
    const planned = isObject(item['planned']) ? (item['planned'] as Row) : {};
    const origin = isObject(item['origin']) ? (item['origin'] as Row) : {};
    const stagedAt = isObject(item['staged']) ? (item['staged'] as Row) : null;
    const settle = (outcome: Outcome): DecidedRecord => ({ item, object, verdict: null, candidate: null, outcome });
    if (isObject(planned['refusal'])) return settle({ disposition: 'refused', admitted: null, gate: String((planned['refusal'] as Row)['gate'] ?? 'record'), reason: String((planned['refusal'] as Row)['reason'] ?? '') });
    if (isObject(planned['reuse'])) return settle({ disposition: 'reused', admitted: reusedOf(planned, { object_id: planned['object_id'], object_version: origin['object_version'], content_digest: origin['content_digest'], manifest_id: planned['manifest_id'] }), gate: null, reason: `admitted earlier into this domain by import ${String((planned['reuse'] as Row)['import_id'] ?? '?')}` });
    if (object === null) return settle({ disposition: 'refused', admitted: null, gate: 'record', reason: `the quarantined manifest lists no object ${String(item['origin_ref'])}` });
    const header = isObject(object['header']) ? (object['header'] as Row) : null;
    if (header === null) return settle({ disposition: 'refused', admitted: null, gate: 'header', reason: 'the object carries no header' });
    if (importFormOf(header['schema_ref']) === null) return settle({ disposition: 'refused', admitted: null, gate: 'schema', reason: `schema ${String(header['schema_ref'])} has no import form (${Object.keys(IMPORT_FORMS_HINT).join(', ')})` });
    if (classificationRank(header['classification']) > classificationRank(f.ceiling)) return settle({ disposition: 'excluded', admitted: null, gate: 'ceiling', reason: `the record's classification ${String(header['classification'])} is above the intake contract's ceiling ${f.ceiling}` });
    if (stagedAt === null || typeof stagedAt['quarantine_locator'] !== 'string' || typeof stagedAt['digest'] !== 'string') return settle({ disposition: 'refused', admitted: null, gate: 'evidence', reason: 'no quarantine copy of the bytes was stored at the open' });
    const locator = stagedAt['quarantine_locator']; const digest = stagedAt['digest'];
    let verdict: ReturnType<typeof inspectContent>; let candidate: StoredBlob;
    try {
      const read = await this.vault.read('quarantine', f.scope, locator, digest);
      verdict = inspectContent(read.bytes, { declaredType: typeof origin['media_type_declared'] === 'string' ? (origin['media_type_declared'] as string) : null, filename: String(origin['file'] ?? `${String(origin['manifest_id'] ?? 'record')}.bin`) });
      if (!verdict.ok) return { item, object, verdict, candidate: null, outcome: { disposition: 'excluded', admitted: null, gate: 'content', reason: `${verdict.class}: ${verdict.reason}`.slice(0, 600) } };
      candidate = await this.vault.createAdmittedCandidate(f.scope, locator, digest);
    } catch (e) {
      if (e instanceof VaultIntegrityError) return settle({ disposition: 'refused', admitted: null, gate: 'evidence', reason: `the quarantine copy could not be admitted (${e.reason}): ${e.message}` });
      throw e;
    }
    return { item, object, verdict, candidate, outcome: null };
  }

  /** Inside the batch's write: the manifest with its custody row, the imported header and payload, objects.admit_version — under the item's savepoint (C3). */
  private async admitRecord(cap: RetentionWrites, d: DecidedRecord, f: AdmissionFacts, n: number): Promise<Outcome> {
    const item = d.item; const object = d.object as Row; const candidate = d.candidate as StoredBlob; const verdict = d.verdict as ReturnType<typeof inspectContent>;
    const planned = item['planned'] as Row; const origin = item['origin'] as Row;
    const originHeader = object['header'] as unknown as CanonicalHeader; const originPayload = isObject(object['payload']) ? (object['payload'] as Row) : {};
    const manifestId = String(planned['manifest_id']); const newObjectId = String(planned['object_id']);
    const version = Number(origin['object_version']);
    const recordedAt = new Date().toISOString();
    const contentRef = `vault:evidence/${candidate.locator}`;
    const header = importedHeaderOf(originHeader, { map: f.map, importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, actor: f.actor, correlationId: f.correlationId, contentRef, recordedAt, provenanceRef: f.provenanceRef });
    const valid = validateHeader(header);
    if (!valid.ok) return { disposition: 'refused', admitted: null, gate: 'header', reason: `the imported header does not validate: ${(valid.errors ?? []).join('; ')}`.slice(0, 600) };
    const provenance = importedFromOf({ importId: f.importId, partnerKey: f.partnerKey, importedAt: recordedAt, origin: f.origin, archiveDigest: f.archiveDigest,
      object: { object_id: String(origin['object_id']), object_version: version, object_type: String(object['object_type'] ?? originHeader.object_type), schema_ref: String(originHeader.schema_ref), content_digest: String(object['content_digest']) }, header: originHeader as unknown as Row, payload: originPayload });
    const payload = importedPayloadOf(originPayload, { map: f.map, provenance, overrides: { manifest_id: manifestId, locator: candidate.locator, content_digest: candidate.contentDigest, byte_length: candidate.byteLength, vault: 'evidence' } });
    const sp = `imp_${n}`;
    await cap.savepoint(sp);
    try {
      await cap.recordImportedManifest({
        manifestId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, importId: f.importId, itemId: String(item['item_id']),
        locator: candidate.locator, contentDigest: candidate.contentDigest, byteLength: candidate.byteLength,
        mediaTypeDeclared: typeof origin['media_type_declared'] === 'string' ? (origin['media_type_declared'] as string) : null, mediaTypeSniffed: verdict.sniffedType, activeContentRisk: verdict.activeContentRisk,
        classification: String(header.classification), residency: f.residency, retentionProfile: f.retentionProfile, sourceId: f.sourceId, contractVersion: f.contractVersion, acquisitionMode: f.acquisitionMode,
        origin: { tenant_id: f.origin['tenant_id'] ?? null, domain_id: f.origin['domain_id'] ?? null, action_id: f.origin['action_id'] ?? null, package_digest: f.origin['package_digest'] ?? null, object_id: origin['object_id'] ?? null, object_version: version, manifest_id: origin['manifest_id'] ?? null, new_object_id: newObjectId, file: origin['file'] ?? null },
        actor: f.actor, correlationId: f.correlationId,
      });
      const admitted = await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
      await cap.releaseSavepoint(sp);
      return { disposition: 'admitted', admitted: { object_id: newObjectId, object_version: version, content_digest: admitted.contentDigest, manifest_id: manifestId, locator: candidate.locator }, gate: null, reason: null };
    } catch (e) {
      const refusal = refusalOf(e);
      if (refusal === null) throw e;
      await cap.rollbackToSavepoint(sp);
      return { disposition: 'refused', admitted: null, gate: refusal.gate, reason: refusal.reason };
    }
  }

  /** A claim version: its evidence pair admitted or reused here, the import form, the ceiling; then objects.admit_version and its lineage row under the savepoint. */
  private async admitClaim(cap: RetentionWrites, item: Row, entry: Row | null, f: AdmissionFacts, n: number): Promise<Outcome> {
    const planned = isObject(item['planned']) ? (item['planned'] as Row) : {}; const origin = isObject(item['origin']) ? (item['origin'] as Row) : {};
    const version = Number(origin['object_version']); const newObjectId = String(planned['object_id']);
    if (isObject(planned['refusal'])) return { disposition: 'refused', admitted: null, gate: String((planned['refusal'] as Row)['gate'] ?? 'record'), reason: String((planned['refusal'] as Row)['reason'] ?? '') };
    if (isObject(planned['reuse'])) return { disposition: 'reused', admitted: reusedOf(planned, { object_id: newObjectId, object_version: version, content_digest: origin['content_digest'] }), gate: null, reason: `admitted earlier into this domain by import ${String((planned['reuse'] as Row)['import_id'] ?? '?')}` };
    if (entry === null) return { disposition: 'refused', admitted: null, gate: 'record', reason: `the quarantined closure carries no claim ${String(item['origin_ref'])}` };
    const header = isObject(entry['header']) ? (entry['header'] as Row) : null; const payload = isObject(entry['payload']) ? (entry['payload'] as Row) : {};
    if (header === null) return { disposition: 'refused', admitted: null, gate: 'header', reason: 'the claim carries no header' };
    if (importFormOf(header['schema_ref']) === null) return { disposition: 'refused', admitted: null, gate: 'schema', reason: `schema ${String(header['schema_ref'])} has no import form` };
    if (classificationRank(header['classification']) > classificationRank(f.ceiling)) return { disposition: 'excluded', admitted: null, gate: 'ceiling', reason: `the claim's classification ${String(header['classification'])} is above the intake contract's ceiling ${f.ceiling}` };
    const lineage = isObject(origin['lineage']) ? (origin['lineage'] as Row) : null;
    const evidence = isObject(origin['evidence']) ? (origin['evidence'] as Row) : null;
    if (lineage === null || evidence === null) return { disposition: 'refused', admitted: null, gate: 'record', reason: `the closure carries no lineage row for version ${version} of claim ${String(origin['object_id'])}` };
    const record = this.recordOutcomeFor(String(evidence['object_id']), String(evidence['digest']), f);
    if (record.kind !== 'ok') return { disposition: 'refused', admitted: null, gate: 'dependency', reason: `its evidence ${String(evidence['object_id'])} (bytes ${String(evidence['digest']).slice(0, 12)}…) ${record.reason}` };
    const recordedAt = new Date().toISOString();
    const imported = importedHeaderOf(header as unknown as CanonicalHeader, { map: f.map, importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, actor: f.actor, correlationId: f.correlationId, contentRef: null, recordedAt, provenanceRef: f.provenanceRef });
    const valid = validateHeader(imported);
    if (!valid.ok) return { disposition: 'refused', admitted: null, gate: 'header', reason: `the imported header does not validate: ${(valid.errors ?? []).join('; ')}`.slice(0, 600) };
    const provenance = importedFromOf({ importId: f.importId, partnerKey: f.partnerKey, importedAt: recordedAt, origin: f.origin, archiveDigest: f.archiveDigest,
      object: { object_id: String(origin['object_id']), object_version: version, object_type: String(entry['object_type'] ?? header['object_type']), schema_ref: String(header['schema_ref']), content_digest: String(entry['content_digest']) }, header, payload });
    const importedPayload = importedPayloadOf(payload, { map: f.map, provenance, overrides: {} });
    const sp = `imp_${n}`;
    await cap.savepoint(sp);
    try {
      const admitted = await cap.admitObject(imported, importedPayload, canonicalHeaderDigest(imported, importedPayload));
      await cap.recordImportedLineage({
        claimObjectId: newObjectId, claimVersion: version, tenantId: f.scope.tenantId, domainId: f.scope.domainId, claimType: String(entry['object_type'] ?? header['object_type']),
        runId: String(lineage['run_id']), methodId: String(lineage['method_id']), callId: typeof lineage['call_id'] === 'string' ? (lineage['call_id'] as string) : null, mode: String(lineage['mode']),
        evidenceObjectId: record.newId, evidenceDigest: String(evidence['digest']), byteStart: Number(lineage['byte_start'] ?? 0), byteEnd: Number(lineage['byte_end'] ?? 0), confidence: Number(lineage['confidence'] ?? 0),
        retrievalDecisionId: typeof lineage['retrieval_decision_id'] === 'string' ? (lineage['retrieval_decision_id'] as string) : null, retrievalAuditSeq: lineage['retrieval_audit_seq'] === undefined || lineage['retrieval_audit_seq'] === null ? null : Number(lineage['retrieval_audit_seq']),
        importId: f.importId, correlationId: f.correlationId,
      });
      await cap.releaseSavepoint(sp);
      return { disposition: 'admitted', admitted: { object_id: newObjectId, object_version: version, content_digest: admitted.contentDigest, evidence_object_id: record.newId }, gate: null, reason: null };
    } catch (e) {
      const refusal = refusalOf(e);
      if (refusal === null) throw e;
      await cap.rollbackToSavepoint(sp);
      return { disposition: 'refused', admitted: null, gate: refusal.gate, reason: refusal.reason };
    }
  }

  private async admitIdentifierSystem(cap: RetentionWrites, item: Row, f: AdmissionFacts, n: number): Promise<Outcome> {
    const origin = isObject(item['origin']) ? (item['origin'] as Row) : {};
    const sp = `imp_${n}`;
    await cap.savepoint(sp);
    try {
      const r = await cap.recordImportedIdentifierSystem({ tenantId: f.scope.tenantId, domainId: f.scope.domainId, importId: f.importId, systemKey: String(origin['system_key']), authority: String(origin['authority'] ?? ''), description: typeof origin['description'] === 'string' ? (origin['description'] as string) : null, isAuthoritative: origin['is_authoritative'] === true, actor: f.actor, correlationId: f.correlationId });
      await cap.releaseSavepoint(sp);
      return r === 'registered' ? { disposition: 'admitted', admitted: { system_key: origin['system_key'], outcome: r }, gate: null, reason: null } : { disposition: 'reused', admitted: { system_key: origin['system_key'], outcome: r }, gate: null, reason: "the domain's own declaration of the system stands" };
    } catch (e) {
      const refusal = refusalOf(e);
      if (refusal === null) throw e;
      await cap.rollbackToSavepoint(sp);
      return { disposition: 'refused', admitted: null, gate: refusal.gate === 'header' ? 'identifier' : refusal.gate, reason: refusal.reason };
    }
  }

  private async admitEntity(cap: RetentionWrites, item: Row, f: AdmissionFacts, n: number): Promise<Outcome> {
    const planned = isObject(item['planned']) ? (item['planned'] as Row) : {}; const origin = isObject(item['origin']) ? (item['origin'] as Row) : {};
    const entityId = String(planned['entity_id']);
    if (isObject(planned['reuse'])) {
      const r = planned['reuse'] as Row;
      return { disposition: 'reused', admitted: { entity_id: entityId }, gate: null, reason: r['by'] === 'identifier' ? `identified by the authoritative identifier ${String(r['system_key'])} ${String(r['value'])} as an entity of this domain` : `admitted earlier into this domain by import ${String(r['import_id'] ?? '?')}` };
    }
    const lifecycle = String(origin['lifecycle_state'] ?? 'active');
    // N5: a successor or a split origin is carried into the row only as an admitted (or reused) entity of this domain; a superseded
    // entity whose successor is not that is refused; a split origin that is not that becomes NULL, the origin id kept in the event's origin.
    const related = (key: 'superseded_by' | 'split_from'): { id: string | null; reason: string | null } => {
      const ref = typeof origin[key] === 'string' ? (origin[key] as string) : null;
      if (ref === null) return { id: null, reason: null };
      const o = this.itemOutcomeFor('entity', `entity:${ref}`, f);
      return o.kind === 'ok' ? { id: o.newId, reason: null } : { id: null, reason: o.kind === 'absent' ? 'is not carried' : o.reason };
    };
    const successor = related('superseded_by');
    if (lifecycle === 'superseded' && successor.id === null) return { disposition: 'refused', admitted: null, gate: 'dependency', reason: `its successor ${String(origin['superseded_by'] ?? '(unnamed)')} ${successor.reason ?? 'is not carried'}` };
    const mappedSuccessor = successor.id; const splitFrom = related('split_from').id;
    const canonicalName = String(origin['canonical_name'] ?? '');
    const sp = `imp_${n}`;
    await cap.savepoint(sp);
    try {
      await cap.recordImportedEntity({
        entityId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, importId: f.importId, itemId: String(item['item_id']),
        entityType: String(origin['entity_type'] ?? 'other'), canonicalName, normalizedName: typeof origin['normalized_name'] === 'string' && (origin['normalized_name'] as string).length > 0 ? (origin['normalized_name'] as string) : normalizeName(canonicalName) || canonicalName.toLowerCase(),
        lifecycleState: lifecycle, splitFrom, supersededBy: mappedSuccessor,
        origin: { tenant_id: f.origin['tenant_id'] ?? null, domain_id: f.origin['domain_id'] ?? null, action_id: f.origin['action_id'] ?? null, package_digest: f.origin['package_digest'] ?? null, entity_id: origin['entity_id'] ?? null, split_from: origin['split_from'] ?? null, superseded_by: origin['superseded_by'] ?? null },
        actor: f.actor, correlationId: f.correlationId,
      });
      await cap.releaseSavepoint(sp);
      return { disposition: 'admitted', admitted: { entity_id: entityId }, gate: null, reason: null };
    } catch (e) {
      const refusal = refusalOf(e);
      if (refusal === null) throw e;
      await cap.rollbackToSavepoint(sp);
      return { disposition: 'refused', admitted: null, gate: refusal.gate === 'header' ? 'record' : refusal.gate, reason: refusal.reason };
    }
  }

  private async admitIdentifier(cap: RetentionWrites, item: Row, f: AdmissionFacts, n: number): Promise<Outcome> {
    const planned = isObject(item['planned']) ? (item['planned'] as Row) : {}; const origin = isObject(item['origin']) ? (item['origin'] as Row) : {};
    const originEntity = String(origin['entity_id'] ?? '');
    const entity = this.itemOutcomeFor('entity', `entity:${originEntity}`, f);
    if (entity.kind !== 'ok') return { disposition: 'refused', admitted: null, gate: 'dependency', reason: `its entity ${originEntity} ${entity.reason}` };
    const entityId = String(planned['entity_id'] ?? f.map.get(originEntity) ?? '');
    const sp = `imp_${n}`;
    await cap.savepoint(sp);
    try {
      const r = await cap.recordImportedIdentifier({
        identifierId: String(planned['identifier_id']), tenantId: f.scope.tenantId, domainId: f.scope.domainId, importId: f.importId, itemId: String(item['item_id']),
        entityId, systemKey: String(origin['system_key']), value: String(origin['value']),
        claimObjectId: mapped(f.map, origin['source_claim_object_id']), evidenceObjectId: mapped(f.map, origin['source_evidence_object_id']),
        origin: { tenant_id: f.origin['tenant_id'] ?? null, domain_id: f.origin['domain_id'] ?? null, action_id: f.origin['action_id'] ?? null, package_digest: f.origin['package_digest'] ?? null, entity_id: originEntity, source_claim_object_id: origin['source_claim_object_id'] ?? null, source_evidence_object_id: origin['source_evidence_object_id'] ?? null },
        actor: f.actor, correlationId: f.correlationId,
      });
      await cap.releaseSavepoint(sp);
      return r === 'identified' ? { disposition: 'admitted', admitted: { identifier_id: planned['identifier_id'], entity_id: entityId, outcome: r }, gate: null, reason: null } : { disposition: 'reused', admitted: { entity_id: entityId, outcome: r }, gate: null, reason: 'the entity already holds this identifier' };
    } catch (e) {
      const refusal = refusalOf(e);
      if (refusal === null) throw e;
      await cap.rollbackToSavepoint(sp);
      return { disposition: 'refused', admitted: null, gate: refusal.gate === 'header' ? 'identifier' : refusal.gate, reason: refusal.reason };
    }
  }

  /** An edge AS RECORDED at the origin (D8, N5): its ends, its claim PAIR and its evidence pair admitted or reused here, its successor carried; the port's ontology and dependency refusals are the item's gates. */
  private async admitEdge(cap: RetentionWrites, item: Row, f: AdmissionFacts, n: number): Promise<Outcome> {
    const planned = isObject(item['planned']) ? (item['planned'] as Row) : {}; const e = isObject(item['origin']) ? (item['origin'] as Row) : {};
    const edgeId = String(planned['edge_id']);
    if (isObject(planned['reuse'])) return { disposition: 'reused', admitted: { edge_id: edgeId }, gate: null, reason: `admitted earlier into this domain by import ${String((planned['reuse'] as Row)['import_id'] ?? '?')}` };
    const dependency = (reason: string): Outcome => ({ disposition: 'refused', admitted: null, gate: 'dependency', reason });
    const subject = this.itemOutcomeFor('entity', `entity:${String(e['subject_entity_id'])}`, f);
    if (subject.kind !== 'ok') return dependency(`its subject entity ${String(e['subject_entity_id'])} ${subject.reason}`);
    const object = this.itemOutcomeFor('entity', `entity:${String(e['object_entity_id'])}`, f);
    if (object.kind !== 'ok') return dependency(`its object entity ${String(e['object_entity_id'])} ${object.reason}`);
    const claim = isObject(e['claim']) ? (e['claim'] as Row) : {}; const pair = `${String(claim['object_id'])}@${String(claim['object_version'])}`;
    const claimOutcome = this.itemOutcomeFor('claim', pair, f);
    if (claimOutcome.kind !== 'ok') return dependency(`its claim ${pair} ${claimOutcome.reason}; an edge is never rebased onto another version`);
    const evidence = isObject(e['evidence']) ? (e['evidence'] as Row) : {};
    const record = this.recordOutcomeFor(String(evidence['object_id']), String(evidence['digest']), f);
    if (record.kind !== 'ok') return dependency(`its evidence ${String(evidence['object_id'])} ${record.reason}`);
    const successor = typeof e['superseded_by'] === 'string' ? (e['superseded_by'] as string) : null;
    let supersededBy: string | null = null;
    if (successor !== null) {
      const s = this.itemOutcomeFor('edge', `edge:${successor}`, f);
      if (s.kind !== 'ok') return dependency(`its successor ${successor} ${s.kind === 'absent' ? 'is not carried' : s.reason}`);
      supersededBy = f.map.get(successor) ?? null;
      if (supersededBy === null) return dependency(`its successor ${successor} is not carried`);
    }
    const validFrom = instantOf(e['valid_from']); const assertedAt = instantOf(e['asserted_at']);
    if (validFrom === null || assertedAt === null) return { disposition: 'refused', admitted: null, gate: 'record', reason: `the edge names no valid_from or asserted_at instant (${String(e['valid_from'])}, ${String(e['asserted_at'])})` };
    const sp = `imp_${n}`;
    await cap.savepoint(sp);
    try {
      await cap.recordImportedEdge({
        edgeId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, importId: f.importId, itemId: String(item['item_id']),
        subject: String(f.map.get(String(e['subject_entity_id'])) ?? e['subject_entity_id']), predicate: String(e['predicate'] ?? ''), object: String(f.map.get(String(e['object_entity_id'])) ?? e['object_entity_id']),
        validFrom, validTo: instantOf(e['valid_to']), assertedAt, retractedAt: instantOf(e['retracted_at']), supersededAt: instantOf(e['superseded_at']), state: String(e['state'] ?? 'asserted'),
        claimObjectId: claimOutcome.newId, claimVersion: Number(claim['object_version']), evidenceObjectId: record.newId, evidenceDigest: String(evidence['digest']),
        methodId: typeof e['method_id'] === 'string' ? (e['method_id'] as string) : null, runId: typeof e['run_id'] === 'string' ? (e['run_id'] as string) : null, mode: String(e['mode'] ?? 'local-live'), confidence: Number(e['confidence'] ?? 0),
        supersededBy, retractionReason: typeof e['retraction_reason'] === 'string' ? (e['retraction_reason'] as string) : null,
        origin: { tenant_id: f.origin['tenant_id'] ?? null, domain_id: f.origin['domain_id'] ?? null, action_id: f.origin['action_id'] ?? null, package_digest: f.origin['package_digest'] ?? null, edge_id: e['edge_id'] ?? null, subject_entity_id: e['subject_entity_id'] ?? null, object_entity_id: e['object_entity_id'] ?? null, claim, evidence, superseded_by: e['superseded_by'] ?? null, asserted_by: e['asserted_by'] ?? null, retracted_by: e['retracted_by'] ?? null },
        actor: f.actor, correlationId: f.correlationId,
      });
      await cap.releaseSavepoint(sp);
      return { disposition: 'admitted', admitted: { edge_id: edgeId, claim: { object_id: claimOutcome.newId, object_version: Number(claim['object_version']) } }, gate: null, reason: null };
    } catch (err) {
      const refusal = refusalOf(err);
      if (refusal === null) throw err;
      await cap.rollbackToSavepoint(sp);
      return { disposition: 'refused', admitted: null, gate: refusal.gate === 'header' ? 'record' : refusal.gate, reason: refusal.reason };
    }
  }

  /** The item's outcome as settled in this admission (this attempt's or an earlier one's), by kind and origin ref. */
  private itemOutcomeFor(kind: ImportItemKind, originRef: string, f: AdmissionFacts): { kind: 'ok'; newId: string } | { kind: 'absent'; reason: string } | { kind: 'not_admitted'; reason: string } {
    const item = f.itemsByRef.get(`${kind}:${originRef}`);
    if (item === undefined) return { kind: 'absent', reason: 'is not carried by the package' };
    const o = f.outcomes.get(String(item['item_id']));
    if (o === undefined) return { kind: 'not_admitted', reason: 'is not settled yet' };
    if (o.disposition !== 'admitted' && o.disposition !== 'reused') return { kind: 'not_admitted', reason: `was ${o.disposition}${o.gate === null ? '' : ` (${o.gate})`}` };
    const planned = isObject(item['planned']) ? (item['planned'] as Row) : {};
    const key = kind === 'entity' ? 'entity_id' : kind === 'edge' ? 'edge_id' : 'object_id';
    return { kind: 'ok', newId: String(planned[key] ?? '') };
  }
  /** The record an evidence pair (origin object id, bytes digest) names, admitted or reused here — the pair rule of D8. */
  private recordOutcomeFor(originObjectId: string, digest: string, f: AdmissionFacts): { kind: 'ok'; newId: string } | { kind: 'absent'; reason: string } | { kind: 'not_admitted'; reason: string } {
    const candidates = f.recordsByObject.get(originObjectId) ?? [];
    if (candidates.length === 0) return { kind: 'absent', reason: 'is not carried by the package' };
    const byDigest = candidates.find((it) => (isObject(it['origin']) ? (it['origin'] as Row)['bytes_digest'] : null) === digest) ?? null;
    if (byDigest === null) return { kind: 'not_admitted', reason: 'is carried under another bytes digest' };
    return this.itemOutcomeFor('record', String(byDigest['origin_ref']), f);
  }

  private async mark(cap: RetentionWrites, item: Row, outcome: Outcome, f: AdmissionFacts): Promise<void> {
    await cap.markImportItem({ itemId: String(item['item_id']), importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, disposition: outcome.disposition, gate: outcome.gate, reason: outcome.reason, admitted: outcome.admitted, actor: f.actor, correlationId: f.correlationId });
    f.outcomes.set(String(item['item_id']), outcome);
  }

  /**
   * D1, D2, C2, C13: the facts of the ONE import.admitted event, from the item map with this attempt's outcomes applied — the entities
   * this import CREATED (`created`, as the origin recorded them: the row is the origin's state) and the ones it REUSED (`reached`, as
   * they stand in this domain — read back, so a retired entity found by its authoritative identifier is announced retired, C2); the
   * edges this import recorded (a reused edge is not announced: nothing changed for it); the distinct claim ids and the record ids it
   * admitted (reused ones not announced, C13 — `counts.reused` says how many); the ledger's counts.
   */
  private async admittedFactsOf(cap: RetentionReads, items: Row[], f: AdmissionFacts): Promise<ImportChangeFacts> {
    const outcomeOf = (it: Row): Outcome | undefined => f.outcomes.get(String(it['item_id']));
    const identities: ImportChangeFacts['identities'] = []; const edges: ImportChangeFacts['edges'] = []; const claims = new Set<string>(); const evidence: string[] = [];
    const reused: Array<{ entity_id: string }> = [];
    for (const it of items) {
      const o = outcomeOf(it); if (o === undefined || o.admitted === null) continue;
      const kind = String(it['kind']); const origin = isObject(it['origin']) ? (it['origin'] as Row) : {}; const admitted = o.admitted;
      if (kind === 'entity') {
        const entityId = str(admitted['entity_id']); if (entityId === null) continue;
        if (o.disposition === 'admitted') identities.push({ entity_id: entityId, role: 'created', canonical_name: str(origin['canonical_name']), lifecycle_state: str(origin['lifecycle_state']) ?? 'active' });
        else if (o.disposition === 'reused') reused.push({ entity_id: entityId });
      } else if (kind === 'edge' && o.disposition === 'admitted') {
        const edgeId = str(admitted['edge_id']); if (edgeId === null) continue;
        const claim = isObject(admitted['claim']) ? (admitted['claim'] as Row) : {};
        edges.push({ edge_id: edgeId, state: str(origin['state']) ?? 'asserted', predicate: String(origin['predicate'] ?? ''), subject_entity_id: mapped(f.map, origin['subject_entity_id']), object_entity_id: mapped(f.map, origin['object_entity_id']),
                     valid_from: instantOf(origin['valid_from']), valid_to: instantOf(origin['valid_to']), asserted_at: instantOf(origin['asserted_at']), retracted_at: instantOf(origin['retracted_at']), claim_object_id: str(claim['object_id']) });
      } else if (kind === 'claim' && o.disposition === 'admitted') { const id = str(admitted['object_id']); if (id !== null) claims.add(id); }
      else if (kind === 'record' && o.disposition === 'admitted') { const id = str(admitted['object_id']); if (id !== null && !evidence.includes(id)) evidence.push(id); }
    }
    if (reused.length > 0) {
      const ids = [...new Set(reused.map((r) => r.entity_id))].filter((id) => !identities.some((i) => i.entity_id === id));
      const rows = ids.length === 0 ? [] : ((await cap.readEntities().selectAll().where('entity_id' as never, 'in', ids as never).execute()) as Row[]);
      const byId = new Map(rows.map((r) => [String(r['entity_id']), r]));
      for (const id of ids) { const r = byId.get(id); identities.push({ entity_id: id, role: 'reached', canonical_name: r === undefined ? null : str(r['canonical_name']), lifecycle_state: r === undefined ? null : str(r['lifecycle_state']) }); }
    }
    return {
      tenantId: f.scope.tenantId, domainId: f.scope.domainId, importId: f.importId, partnerKey: f.partnerKey,
      origin: { tenant_id: String(f.origin['tenant_id'] ?? ''), domain_id: String(f.origin['domain_id'] ?? ''), action_id: String(f.origin['action_id'] ?? ''), package_digest: f.packageDigest },
      counts: countsOf(items, f.outcomes), identities, edges, claims: [...claims], evidence, actor: f.actor,
    };
  }

  // ───────────────────────── WITHDRAW (C5) ─────────────────────────

  /** The import withdrawn; the quarantine locators of its items, its manifest and its closure read in the same write and returned (`quarantine_locators`) for the tombstoning after the commit. */
  async withdrawImport(cap: RetentionWrites, scope: Scope, importId: string, reason: string, a: Actor): Promise<Row> {
    const row = await cap.withdrawImport({ importId, tenantId: scope.tenantId, domainId: scope.domainId, reason, actor: a.actor, correlationId: a.correlationId });
    const items = (await cap.readImportItems().select(['staged' as never]).where('import_id' as never, '=', importId as never).execute()) as Row[];
    const locators = new Set<string>();
    for (const it of items) { const l = isObject(it['staged']) ? (it['staged'] as Row)['quarantine_locator'] : null; if (typeof l === 'string') locators.add(l); }
    for (const k of ['manifest_locator', 'links_locator']) { const l = row[k]; if (typeof l === 'string') locators.add(l); }
    this.#pendingTombstones.set(importId, [...locators]);
    return { ...row, quarantine_locators: [...locators] };
  }

  /**
   * After the withdrawal committed: the import's quarantine copies removed (idempotent; the locators the withdrawal read, or the ones given).
   * The bytes are inventoried by the import ledger, not by blob_manifests: this and the sweeper's TTL pass are the only ways they go.
   */
  async tombstoneQuarantine(scope: Scope, importId: string, locators?: string[]): Promise<{ locators: number; tombstoned: number; failed: string[] }> {
    const list = locators ?? this.#pendingTombstones.get(importId) ?? [];
    const out = await this.tombstoneLocators(scope, list);
    this.#pendingTombstones.delete(importId);
    return out;
  }
  /** The tombstoning recorded — import.evidence_tombstoned {locators, tombstoned, failed} — a write after the withdrawal's own. */
  async recordEvidenceTombstoned(cap: RetentionWrites, scope: Scope, importId: string, outcome: { locators: number; tombstoned: number; failed: string[] }, a: Actor): Promise<void> {
    await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.evidence_tombstoned', details: { locators: outcome.locators, tombstoned: outcome.tombstoned, failed: outcome.failed }, actor: a.actor, correlationId: a.correlationId });
  }
  private async tombstoneLocators(scope: Scope, locators: string[]): Promise<{ locators: number; tombstoned: number; failed: string[] }> {
    const failed: string[] = []; let tombstoned = 0;
    for (const l of locators) {
      try { await this.vault.tombstone('quarantine', scope, l); tombstoned += 1; }
      catch { failed.push(l); }
    }
    return { locators: locators.length, tombstoned, failed };
  }

  // ───────────────────────── REVOKE (B17; D4, D5, D7, D12, D13, D19; C2, C4, C5, C6, C7, C9, C14) ─────────────────────────

  /**
   * The origin's revocation executed in THIS domain (the module comment's REVOKE): W0 the beginning (the source verified and recorded,
   * the state revoking) → W1 the graph write → W2… the claim batches → W3… the record batches → Wf the finish with the ONE event →
   * after the commit the bytes and, for a station source, revocation-receipt.json → Wr the receipt write (the origin's notice answered
   * inside it). A revoked import takes the RETRY branch (C5); a station notice that does not verify is REFUSED after W0 committed the
   * refusal (`kind: 'refused'` — the controller answers 409 with the reason; the write that recorded it is a success of recording).
   */
  async revokeImport(a: WriteArgs & { scope: Scope; importId: string; source: RevocationSource }): Promise<RevokeImportAnswer> {
    const { scope, importId, source } = a;
    const actor = a.principal.principalId; const correlationId = a.envelope.correlation_id; const purposeId = String(a.envelope.purpose_id ?? 'retention');
    const batches: Row[] = [];
    const write = this.writerOf(a, importId);
    const zero = { records: 0, claims: 0, entities: 0, edges: 0 };

    // W0: the import, its items and its partner; the source verified (a station notice against the partner's key, C7) and the revocation begun.
    const begun = await write<RevocationBegun>(REVOKE_ACTION, 'RIM', importId, undefined, async (cap) => {
      const row = (await cap.readImports().selectAll().where('import_id' as never, '=', importId as never).executeTakeFirst()) as Row | undefined;
      if (row === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `retention import rejected: no such import ${importId} in this domain`), 404);
      const items = (await cap.readImportItems().selectAll().where('import_id' as never, '=', importId as never).orderBy('dependency_order' as never).execute()) as Row[];
      const partner = typeof row['partner_id'] === 'string' ? (((await cap.readExchangePartners().selectAll().where('partner_id' as never, '=', row['partner_id'] as never).executeTakeFirst()) as Row | undefined) ?? null) : null;
      const station = source.kind === 'station' ? await this.stationOf(cap, scope, source.destinationKey, correlationId) : null;
      const originRow = isObject(row['origin']) ? (row['origin'] as Row) : {};
      const origin = { tenantId: String(originRow['tenant_id'] ?? ''), domainId: String(originRow['domain_id'] ?? ''), actionId: String(originRow['action_id'] ?? '') };
      const base = { row, items, partner, station, origin, holders: [] as Array<{ import_id: string; origin_action_id: string | null }>, opened: null as { directory: string; path: string; notice: Row } | null };
      if (String(row['state']) === 'revoked') {
        // C5: the port answers `retried` before any source check — with the facts the retry decides on (the pending notice, the latest receipt event);
        // C9 at the retry: a copy left under another import is still held only while that import is admitted — read here, in the same write.
        const b = await cap.beginImportRevocation({ importId, tenantId: scope.tenantId, domainId: scope.domainId, source: source.kind === 'station' ? { kind: 'station', destination_key: source.destinationKey } : { kind: 'origin' }, actor, correlationId });
        const heldIds = new Set<string>();
        for (const it of items) { const r = isObject(it['revocation']) ? (it['revocation'] as Row) : {}; if (r['outcome'] === 'left' && Array.isArray(r['held_by'])) for (const h of r['held_by'] as unknown[]) if (typeof h === 'string') heldIds.add(h); }
        const lastReceipt = (await cap.readImportEvents().select(['event' as never]).where('import_id' as never, '=', importId as never).where('event' as never, 'in', ['import.copies_destroyed', 'import.copies_refused'] as never).orderBy('occurred_at' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined;
        return { result: { ...base, kind: 'retried', holders: await this.liveHoldersOf(cap, scope, [...heldIds]), begun: b, lastReceiptEvent: lastReceipt === undefined ? null : str(lastReceipt['event']) } };
      }
      let pSource: Row = { kind: 'origin' };
      let opened: { directory: string; path: string; notice: Row } | null = null;
      if (source.kind === 'station' && station !== null) {
        // The origin's signed notice at the station — revocation.json alone (the package need not still be there: the origin removed its copies after its commit).
        try { opened = await this.delivery.openStationNotice(station.endpoint, origin); }
        catch (e) {
          if (e instanceof TransferStationRefused) throw new HttpException(errorBody('EYE_STA_002', correlationId, `retention import rejected (${e.reason}): ${e.message}`), 409);
          throw e;
        }
        const refuse = async (reason: string, keyId: string | null, file: string | null): Promise<Written<RevocationBegun>> => {
          await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.revocation_refused', details: { source: { kind: 'station', destination_key: source.destinationKey, file }, reason, key_id: keyId, partner_key: partner === null ? null : str(partner['partner_key']) }, actor, correlationId });
          return { result: { ...base, kind: 'refused', opened, reason } };
        };
        if (opened === null) return refuse(`no revocation.json at the station ${source.destinationKey} (${station.endpoint}) for the origin action ${origin.actionId}`, null, null);
        if (partner === null) return refuse('the import names no exchange partner; there is no key to verify the notice against', null, opened.path);
        const v = await this.verifyStationNotice(cap, scope, opened.notice, partner);
        if (!v.verified) return refuse(v.reason, v.keyId, opened.path);
        pSource = { kind: 'station', destination_key: source.destinationKey, path: opened.path, notice: opened.notice,
                    verification: { verified: true, key_id: v.keyId, digest: v.digest, partner_id: v.partnerId, partner_key: v.partnerKey, rotated_from: v.rotatedFrom } };
      }
      const b = await cap.beginImportRevocation({ importId, tenantId: scope.tenantId, domainId: scope.domainId, source: pSource, actor, correlationId });
      if (String(b['kind']) === 'retried') return { result: { ...base, kind: 'retried', begun: b, opened } };
      const src = isObject(b['source']) ? (b['source'] as Row) : {};
      const { notice, ...revocation } = src;
      return { result: { ...base, kind: 'begin', row: isObject(b['import']) ? (b['import'] as Row) : row, begun: b, opened, revocation, notice: isObject(notice) ? notice : null } };
    });
    let receipt = { policyDecisionId: begun.policyDecisionId, auditSeq: begun.auditSeq };
    const r0 = begun.result;
    if (r0.kind === 'refused') {
      return { import: r0.row, kind: 'refused', revocation: { attempt: Number(r0.row['revocation_attempts'] ?? 0), source: { kind: 'station', destination_key: source.kind === 'station' ? source.destinationKey : null, path: r0.opened?.path ?? null }, notice: r0.opened?.notice ?? null, destroyed: zero, left: 0, refused: [], bytes: null, receipt: null, answered: null, station_receipt: null, reason: r0.reason }, batches, receipt };
    }
    if (r0.kind === 'retried') return this.retryRevocation({ scope, importId, actor, correlationId, write, row: isObject(r0.begun['import']) ? (r0.begun['import'] as Row) : r0.row, items: r0.items, begun: r0.begun, station: r0.station, origin: r0.origin, holders: r0.holders, lastReceiptEvent: r0.lastReceiptEvent ?? null, receipt });

    const partnerKey = r0.partner === null ? '' : String(r0.partner['partner_key'] ?? '');
    const attempt = Number(r0.row['revocation_attempts'] ?? 0);
    const f: RevocationFacts = {
      importId, scope, actor, correlationId, purposeId, revocation: r0.revocation, ref: revocationRefOf(r0.revocation), partnerKey,
      imports: new Map(), tally: { retracted: [], retired: [], withdrawn: [], tombstoned: [], left: 0, skipped: 0, refused: [], held: new Map(), locators: [] },
    };
    let fin: Row = {};
    let durable: DurableRevocation = { destroyed: zero, refused: [], left: 0, heldIds: [], locators: [] };
    let holders: Array<{ import_id: string; origin_action_id: string | null }> = [];
    try {
      // THE PLAN (in memory): every admitted or reused item not yet settled by a revocation — or refused by one (a hold since lifted) — by kind.
      const pending = r0.items.filter(isPendingRevocation);
      const graphItems = pending.filter((it) => ['edge', 'entity', 'identifier', 'identifier_system'].includes(String(it['kind'])));
      const claimItems = pending.filter((it) => String(it['kind']) === 'claim');
      const recordItems = pending.filter((it) => String(it['kind']) === 'record');

      // W1: ONE graph write — edges, entities, identifiers, identifier systems, in reversed dependency order (not target-bound: the ports write the graph tables).
      if (graphItems.length > 0) {
        const out = await write(REVOKE_ACTION, 'RIM', importId, undefined, async (cap) => ({ result: await this.revokeGraphItems(cap, graphItems, f) }));
        receipt = { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq };
        batches.push({ ...out.result, policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq });
      }
      if (this.#revocationFault === 'after_graph_write') { this.#revocationFault = null; throw Object.assign(new Error('injected infrastructure fault after the graph write (test)'), { code: '57P01' }); }

      // W2…: the CLAIMS by object id, in batches of at most 32 objects (the bound set: the batch's object ids — objects.admit_version binds the withdrawn version to it).
      const groups = new Map<string, Row[]>();
      for (const it of claimItems) { const id = String((isObject(it['planned']) ? (it['planned'] as Row) : {})['object_id'] ?? (isObject(it['admitted']) ? (it['admitted'] as Row)['object_id'] : '')); groups.set(id, [...(groups.get(id) ?? []), it]); }
      // B18: the objects in ONE order across revocations (the copy lock is taken per object inside the batch; two batches locking in the same order never deadlock).
      const groupList = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      for (let i = 0; i < groupList.length; i += BATCH) {
        const batch = groupList.slice(i, i + BATCH);
        const out = await write(REVOKE_ACTION, 'RIM', importId, batch.map(([id]) => id).filter((id) => UUID.test(id)), async (cap) => {
          const tally = { withdrawn: 0, left: 0, refused: 0, skipped: 0 }; let n = 0;
          for (const [objectId, group] of batch) { tally[await this.withdrawClaimGroup(cap, objectId, group, f, n)] += 1; n += 1; }
          await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.batch_revoked', details: { kind: 'claim', batch: Math.floor(i / BATCH) + 1, count: batch.length, items: batch.reduce((s, [, g]) => s + g.length, 0), ...tally }, actor, correlationId });
          return { result: { kind: 'claim', count: batch.length, ...tally } };
        });
        receipt = { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq };
        batches.push({ ...out.result, policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq });
      }

      // W3…: the RECORDS in batches of at most 32 (the bound set: their object ids) — the withdrawn version, the tombstone and the custody row per record.
      const withdrawnObjects = new Set<string>();
      const recordObjectOf = (it: Row): string => String((isObject(it['admitted']) ? (it['admitted'] as Row) : {})['object_id'] ?? '');
      const recordList = [...recordItems].sort((a, b) => { const x = recordObjectOf(a); const y = recordObjectOf(b); return x < y ? -1 : x > y ? 1 : 0; });
      for (let i = 0; i < recordList.length; i += BATCH) {
        const batch = recordList.slice(i, i + BATCH);
        const targets = [...new Set(batch.map((it) => String((isObject(it['admitted']) ? (it['admitted'] as Row) : {})['object_id'] ?? '')).filter((id) => UUID.test(id)))];
        const out = await write(REVOKE_ACTION, 'RIM', importId, targets, async (cap) => {
          const tally = { tombstoned: 0, left: 0, refused: 0, skipped: 0 }; let n = 0;
          for (const item of batch) { tally[await this.tombstoneRecord(cap, item, f, n, withdrawnObjects)] += 1; n += 1; }
          await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.batch_revoked', details: { kind: 'record', batch: Math.floor(i / BATCH) + 1, count: batch.length, ...tally }, actor, correlationId });
          return { result: { kind: 'record', count: batch.length, ...tally } };
        });
        receipt = { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq };
        batches.push({ ...out.result, policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq });
        // B18 (B17-F1): the batch's records are tombstoned on the ledger and their bytes still in the vault — the state Codex reproduced.
        if (this.#revocationFault === 'after_record_batch') { this.#revocationFault = null; throw Object.assign(new Error('injected infrastructure fault after a record batch committed (test)'), { code: '57P01' }); }
      }

      // Wf: the FINISH — the state moved (or held) — and the ONE GraphChanged/import.revoked of the attempt, built from the ITEM MAP (C4) before the
      // finish records its own event, so "settled since the attempt before" is read against the previous finish, never this one.
      const out = await write(REVOKE_ACTION, 'RIM', importId, undefined, async (cap) => {
        const changed = await this.revokedFactsOf(cap, scope, importId);
        // B18 (B17-F1): the cleanup and the receipt owe what the ITEM MAP settled — every attempt's tombstoned records, refused items and
        // holders — never this attempt's tally alone (a resumed attempt skips the items a crashed one settled; their bytes are still owed).
        const durable = durableRevocationOf(changed.items);
        const holders = await this.liveHoldersOf(cap, scope, durable.heldIds);
        // The ledger's own counts by outcome are the port's (the item map); the service adds only what the map cannot say (C14's skipped items).
        const finished = await cap.finishImportRevocation({ importId, tenantId: scope.tenantId, domainId: scope.domainId, revocation: f.revocation, counts: f.tally.skipped > 0 ? { skipped: f.tally.skipped } : {}, refused: f.tally.refused.map((x) => ({ ...x })), actor, correlationId });
        const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
        if (changed.count > 0) {
          const originRow = r0.origin;
          events.push(await importRevokedEvent(cap, this.impact, {
            tenantId: scope.tenantId, domainId: scope.domainId, importId, partnerKey,
            origin: { tenant_id: originRow.tenantId, domain_id: originRow.domainId, action_id: originRow.actionId, package_digest: f.ref.package_digest },
            counts: isObject(finished['counts']) ? (finished['counts'] as Row) : {}, identities: changed.identities, edges: changed.edges, claims: changed.claims, evidence: changed.evidence, walkSeeds: changed.walkSeeds, actor,
            notice: { notice_id: f.ref.notice_id, source: source.kind, revoked_at: f.ref.revoked_at, reason: f.ref.reason },
          }));
        }
        return { result: { finished, durable, holders }, outboxEvents: events };
      });
      receipt = { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq };
      fin = out.result.finished; durable = out.result.durable; holders = out.result.holders;
      batches.push({ kind: 'finish', complete: fin['complete'] === true, counts: fin['counts'] ?? {}, policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq });
    } catch (e) {
      // The fault recorded on the import — best effort, as the admission's — and propagated: the import stays REVOKING; the same route resumes it (begin counts the attempt).
      if (!(e instanceof HttpException)) {
        await write(REVOKE_ACTION, 'RIM', importId, undefined, async (cap) => ({ result: await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.revocation_failed', details: { attempt, reason: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 300), infrastructure: isInfrastructureFault(e) }, actor, correlationId }) })).catch(() => undefined);
      }
      throw e;
    }

    // After the commit (B18, B17-F1): the bytes of EVERY tombstoned record of the item map go from both roots (the staged copies too) —
    // this attempt's, and the residual of an attempt that crashed between its record batch and the cleanup — and the cleanup is VERIFIED
    // against the vault before the receipt says copies_destroyed; the receipt's counts, refused items and holders are the item map's.
    const bytes = await this.removeRevokedBytes(scope, durable.locators, f.tally.locators.map((l) => l.locator));
    const complete = fin['complete'] === true;
    const held = holders;
    const receiptBody = this.receiptBodyOf({
      importId, scope, ref: f.ref, notice: r0.notice, destroyed: { ...durable.destroyed, bytes: Math.max(0, durable.locators.length - bytes.remaining.length) }, refused: durable.refused, bytes, held,
      copiesDestroyed: complete && bytes.failed.length === 0 && bytes.remaining.length === 0 && held.length === 0, retried: false,
    });
    const stationReceipt = r0.station === null ? null : await this.delivery.writeStationRevocationReceipt(r0.station.endpoint, r0.origin, receiptBody).then((p) => ({ path: p }), (e: unknown) => ({ error: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 200) }));

    // Wr: the receipt recorded — import.copies_destroyed | import.copies_refused — and the origin's notice answered when the origin is here.
    const wr = await write(REVOKE_ACTION, 'RIM', importId, undefined, async (cap) => ({ result: await cap.recordImportRevocationReceipt({ importId, tenantId: scope.tenantId, domainId: scope.domainId, receipt: receiptBody, receiptDigest: contentDigest(receiptBody), bytes: { ...bytes }, station: stationReceipt, actor, correlationId }) }));
    receipt = { policyDecisionId: wr.policyDecisionId, auditSeq: wr.auditSeq };
    return {
      import: isObject(fin['import']) ? (fin['import'] as Row) : r0.row, kind: complete ? 'revoked' : 'held',
      revocation: { attempt, source: f.revocation, notice: r0.notice, destroyed: this.destroyedOf(f.tally), cumulative: durable.destroyed, left: f.tally.left, refused: f.tally.refused, bytes, receipt: receiptBody, answered: isObject(wr.result['answered']) ? (wr.result['answered'] as Row) : null, station_receipt: stationReceipt },
      batches, receipt,
    };
  }

  /**
   * B18 (B17-F1): the bytes a revocation OWES — every tombstoned record's locator of the item map (`owed`), in both roots, the staged
   * copies too — removed and then VERIFIED: a locator with any bytes left in either root after the removal (the published copy or a
   * staged one; a directory that cannot be listed counts as bytes present) is `remaining` (and `failed`), never reported destroyed. A
   * root whose marker cannot be read (`rootReachable`: an unmounted cold tier is an empty mount point) proves nothing: it is named in
   * `roots_unreachable`, NOTHING is removed in any root this attempt (a half-removal would leave no list exact), and every owed locator is
   * `remaining` until a later revoke — with every root reachable — removes and verifies it (the ledger's tombstone stands meanwhile). This attempt's
   * own locators (`own`) are removed in a reachable root whether or not it holds them (the removal is idempotent); a locator an earlier
   * attempt tombstoned is removed where its bytes are found and named `residual`. Nothing of the ledger moves here: the receipt write
   * that follows records what this found.
   */
  private async removeRevokedBytes(scope: Scope, owed: string[], own: string[]): Promise<RevocationBytes> {
    const ownSet = new Set(own);
    const all = [...new Set([...owed, ...own])];
    const reachable: Array<'evidence' | 'archive'> = []; const unreachable: Array<'evidence' | 'archive'> = [];
    for (const vault of REVOCATION_ROOTS) (await this.vault.rootReachable(vault) ? reachable : unreachable).push(vault);
    const entries: Array<{ locator: string; vault: VaultName; stagedToo?: boolean }> = [];
    const residual: string[] = [];
    for (const locator of all) {
      let present = false;
      for (const vault of reachable) if (await this.vault.anyBytesIn(vault, scope, locator)) present = true;
      if (unreachable.length === 0 && (present || ownSet.has(locator))) for (const vault of reachable) entries.push({ locator, vault, stagedToo: true });
      if (present && !ownSet.has(locator)) residual.push(locator);
    }
    const removal = entries.length === 0 ? { removed: [] as string[], failed: [] as string[] } : await this.retention.removeBytes(scope, entries);
    const remaining: string[] = [];
    for (const locator of all) {
      if (unreachable.length > 0) { remaining.push(locator); continue; }
      for (const vault of reachable) if (await this.vault.anyBytesIn(vault, scope, locator)) { remaining.push(locator); break; }
    }
    const remainingSet = new Set(remaining);
    return { removed: removal.removed.filter((l) => !remainingSet.has(l)), failed: [...new Set([...removal.failed, ...remaining])], residual, remaining, roots_unreachable: unreachable };
  }

  /**
   * THE RETRY (C5): a revoked import revoked again — nothing of the ledger moves; the tombstoned records' bytes still present in either
   * root go (B18: found by the item map's locators and verified gone after — `residual`/`remaining`), and a fresh receipt is recorded (a
   * new notice attempt on the origin ledger, D6) when any byte was removed or failed, when no receipt event stands for the latest attempt,
   * or when a notice is pending on the origin ledger; else nothing beyond write #0 — a redelivery of a completed revocation adds no event.
   */
  private async retryRevocation(a: { scope: Scope; importId: string; actor: string; correlationId: string; write: ReturnType<ImportService['writerOf']>; row: Row; items: Row[]; begun: Row; station: { destination: Row; endpoint: string } | null; origin: { tenantId: string; domainId: string; actionId: string }; holders: Array<{ import_id: string; origin_action_id: string | null }>; lastReceiptEvent: string | null; receipt: { policyDecisionId: string; auditSeq: number } }): Promise<RevokeImportAnswer> {
    const { scope, importId, actor, correlationId, row, items, holders: held } = a;
    const recorded = isObject(row['revocation']) ? (row['revocation'] as Row) : {};
    const ref = revocationRefOf(recorded);
    const attempt = Number(row['revocation_attempts'] ?? 0);
    // B18 (B17-F1): the same reducer as the finish's — the bytes owed by the item map removed where still present and VERIFIED after.
    const durable = durableRevocationOf(items);
    const bytes = await this.removeRevokedBytes(scope, durable.locators, []);
    const pendingNoticeId = str(a.begun['pending_notice_id']);
    const { destroyed, refused, left } = durable;
    const answerOf = (rest: Partial<RevokeImportAnswer['revocation']>, receipt: RevokeImportAnswer['receipt']): RevokeImportAnswer =>
      ({ import: row, kind: 'retried', revocation: { attempt, source: recorded, notice: null, destroyed, cumulative: destroyed, left, refused, bytes, receipt: null, answered: null, station_receipt: null, ...rest }, batches: [], receipt });
    // B18: a `copies_refused` last word for BYTES (nothing refused, nothing held) is corrected once the residue is verified gone — one
    // `copies_destroyed` receipt answering the mismatched notice by a new acknowledged attempt; the redelivery after it stays silent.
    const nothingOwed = bytes.failed.length === 0 && bytes.remaining.length === 0 && refused.length === 0 && held.length === 0;
    const lastWordRefusedBytes = a.lastReceiptEvent === 'import.copies_refused' && nothingOwed;
    const needReceipt = bytes.removed.length > 0 || bytes.failed.length > 0 || a.begun['last_receipt_event'] === false || pendingNoticeId !== null || lastWordRefusedBytes;
    if (!needReceipt) return answerOf({}, a.receipt);
    const receiptBody = this.receiptBodyOf({
      importId, scope, ref: { ...ref, notice_id: pendingNoticeId ?? ref.notice_id }, notice: null, destroyed: { ...destroyed, bytes: Math.max(0, durable.locators.length - bytes.remaining.length) }, refused, bytes, held,
      copiesDestroyed: bytes.failed.length === 0 && bytes.remaining.length === 0 && refused.length === 0 && held.length === 0, retried: true,
    });
    const stationReceipt = a.station === null ? null : await this.delivery.writeStationRevocationReceipt(a.station.endpoint, a.origin, receiptBody).then((p) => ({ path: p }), (e: unknown) => ({ error: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 200) }));
    const wr = await a.write(REVOKE_ACTION, 'RIM', importId, undefined, async (cap) => ({ result: await cap.recordImportRevocationReceipt({ importId, tenantId: scope.tenantId, domainId: scope.domainId, receipt: receiptBody, receiptDigest: contentDigest(receiptBody), bytes: { ...bytes }, station: stationReceipt, actor, correlationId }) }));
    return answerOf({ receipt: receiptBody, answered: isObject(wr.result['answered']) ? (wr.result['answered'] as Row) : null, station_receipt: stationReceipt }, { policyDecisionId: wr.policyDecisionId, auditSeq: wr.auditSeq });
  }

  /**
   * C7: the station notice against the import's PARTNER key first; on a key mismatch, against every other partner of this domain
   * declared for the SAME PARTY that holds the notice's key (the origin's rotated key, declared by this domain's administrators) —
   * which partner verified is recorded (`partnerId`, `rotatedFrom`). A retired partner's key still verifies a notice dated at or before
   * its retirement (D8); a notice signed by a partner of another party stays refused with the primary check's words.
   */
  private async verifyStationNotice(cap: RetentionReads, scope: Scope, notice: Row, partner: Row): Promise<{ verified: true; keyId: string; digest: string; partnerId: string; partnerKey: string; rotatedFrom: string | null } | { verified: false; reason: string; keyId: string | null; digest: string }> {
    const notifiedAt = instantOf(notice['notified_at']);
    const within = (p: Row): boolean => { const retiredAt = instantOf(p['retired_at']); return retiredAt === null || (notifiedAt !== null && Date.parse(notifiedAt) <= Date.parse(retiredAt)); };
    const v = verifyNotice(notice, String(partner['public_key_pem'] ?? ''));
    if (v.ok) {
      if (within(partner)) return { verified: true, keyId: v.keyId, digest: v.digest, partnerId: String(partner['partner_id']), partnerKey: String(partner['partner_key'] ?? ''), rotatedFrom: null };
      return { verified: false, reason: `the notice is dated ${notifiedAt ?? 'without an instant'}, after the partner ${String(partner['partner_key'] ?? '')}'s retirement at ${instantOf(partner['retired_at']) ?? '?'}`, keyId: v.keyId, digest: v.digest };
    }
    if (v.reason === 'key_mismatch' && v.keyId !== null) {
      const others = (await cap.readExchangePartners().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
        .where('party' as never, '=', String(partner['party'] ?? '') as never).where('key_id' as never, '=', v.keyId as never).where('partner_id' as never, '!=', String(partner['partner_id']) as never)
        .orderBy('declared_at' as never, 'desc').execute()) as Row[];
      for (const o of others) {
        const w = verifyNotice(notice, String(o['public_key_pem'] ?? ''));
        if (w.ok && within(o)) return { verified: true, keyId: w.keyId, digest: w.digest, partnerId: String(o['partner_id']), partnerKey: String(o['partner_key'] ?? ''), rotatedFrom: String(partner['partner_id']) };
      }
    }
    return { verified: false, reason: v.detail, keyId: v.keyId, digest: v.digest };
  }

  /**
   * W1 (D19, D5): the graph items in REVERSED dependency order — edges, entities, identifiers, identifier systems — each under its own
   * savepoint: an edge this import created retracted, an entity it created retired (the ports leave one the origin recorded retracted,
   * superseded or retired, and one another live import holds, C9 — `held_by` collected); a reused edge or entity, an identifier and an
   * identifier system left (facts of the domain). A port's refusal marks the item refused; an item another attempt settled is skipped (C14).
   */
  private async revokeGraphItems(cap: RetentionWrites, items: Row[], f: RevocationFacts): Promise<Row> {
    const order: Record<string, number> = { edge: 0, entity: 1, identifier: 2, identifier_system: 3 };
    const graph = [...items].sort((x, y) => ((order[String(x['kind'])] ?? 9) - (order[String(y['kind'])] ?? 9)) || (Number(y['dependency_order']) - Number(x['dependency_order'])));
    const tally = { retracted: 0, retired: 0, left: 0, refused: 0, skipped: 0 };
    let n = 0;
    for (const item of graph) {
      const kind = String(item['kind']); const disposition = String(item['disposition']); const itemId = String(item['item_id']);
      const sp = `imr_${n}`; n += 1;
      await cap.savepoint(sp);
      try {
        if (disposition === 'admitted' && (kind === 'edge' || kind === 'entity')) {
          const args = { itemId, importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, revocation: f.revocation, actor: f.actor, correlationId: f.correlationId };
          const r = kind === 'edge' ? await cap.retractImportedEdge(args) : await cap.retireImportedEntity(args);
          const outcome = String(r['outcome']);
          if (outcome === 'retracted') { f.tally.retracted.push(r); tally.retracted += 1; }
          else if (outcome === 'retired') { f.tally.retired.push(r); tally.retired += 1; }
          else { await this.noteHeld(cap, f, r['held_by'], itemId); tally.left += 1; f.tally.left += 1; }
        } else {
          await cap.markImportItemRevoked({ itemId, importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, outcome: 'left', details: { kind, reason: leftReasonOf(item) }, actor: f.actor, correlationId: f.correlationId });
          tally.left += 1; f.tally.left += 1;
        }
        await cap.releaseSavepoint(sp);
      } catch (e) {
        const c = revocationRefusalOf(e);
        if (c === null) throw e;
        await cap.rollbackToSavepoint(sp);
        if (c.kind === 'skipped') { tally.skipped += 1; f.tally.skipped += 1; continue; }
        if (await this.markRefused(cap, item, f, { reason: c.reason, gate: c.gate, hold_id: null, manifest_id: null, locator: null })) tally.refused += 1; else { tally.skipped += 1; f.tally.skipped += 1; }
      }
    }
    await cap.recordImportEvent({ importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, event: 'import.batch_revoked', details: { kind: 'graph', count: graph.length, ...tally }, actor: f.actor, correlationId: f.correlationId });
    return { kind: 'graph', count: graph.length, ...tally };
  }

  /**
   * W2 (D12): ONE claim OBJECT of the import — its items at every version — withdrawn by a new version of the object's LATEST row (read
   * from objects.canonical_objects, never from an item), its lineage carried onto the withdrawn version, every item of the group marked
   * withdrawn. The group is LEFT when a live import holds the object (C9: a reused item whose source import is admitted or revoking, an
   * admitted item another admitted import reuses, or a latest version another live import admitted) — held_by recorded; an object already
   * withdrawn takes no further version (the items marked withdrawn as already so).
   */
  private async withdrawClaimGroup(cap: RetentionWrites, objectId: string, group: Row[], f: RevocationFacts, n: number): Promise<'withdrawn' | 'left' | 'refused' | 'skipped'> {
    if (UUID.test(objectId)) await cap.lockRevocationCopy(objectId);
    const held = await this.holdersOfGroup(cap, f, group);
    const sp = `imr_${n}`;
    await cap.savepoint(sp);
    try {
      if (held.length > 0) { for (const item of group) await this.markLeft(cap, item, f, held); await cap.releaseSavepoint(sp); return 'left'; }
      const prior = UUID.test(objectId) ? await this.latestRowOf(cap, f.scope, objectId) : null;
      if (prior === null) { await cap.releaseSavepoint(sp); for (const item of group) await this.markRefused(cap, item, f, { reason: `no canonical row of ${objectId} in this domain to withdraw`, gate: 'record', hold_id: null, manifest_id: null, locator: null }); return 'refused'; }
      const owner = await this.liveOwnerOf(cap, f, prior);
      if (owner.length > 0) { for (const item of group) await this.markLeft(cap, item, f, owner); await cap.releaseSavepoint(sp); return 'left'; }
      const from = Number(prior['object_version']); let to: number | null = null; let lineageRows = 0;
      if (String(prior['lifecycle_state']) !== 'withdrawn') {
        const header = importWithdrawalHeaderOf(prior, { actor: f.actor, correlationId: f.correlationId, purposeId: f.purposeId, recordedAt: new Date().toISOString(), revocation: f.ref, importId: f.importId });
        const payload = isObject(prior['payload']) ? (prior['payload'] as Row) : {};
        await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
        to = from + 1;
        lineageRows = await cap.recordImportWithdrawalLineage({ claimObjectId: objectId, fromVersion: from, toVersion: to, tenantId: f.scope.tenantId, domainId: f.scope.domainId, importId: f.importId, correlationId: f.correlationId });
      }
      for (const item of group) {
        await cap.markImportItemRevoked({ itemId: String(item['item_id']), importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, outcome: 'withdrawn', details: { object_id: objectId, from_version: from, to_version: to, lineage_rows: lineageRows, already_withdrawn: to === null, notice_id: f.ref.notice_id }, actor: f.actor, correlationId: f.correlationId });
      }
      await cap.releaseSavepoint(sp);
      f.tally.withdrawn.push(objectId);
      return 'withdrawn';
    } catch (e) {
      const c = revocationRefusalOf(e);
      if (c === null) throw e;
      await cap.rollbackToSavepoint(sp);
      if (c.kind === 'skipped') { f.tally.skipped += 1; return 'skipped'; }
      let marked = false;
      for (const item of group) marked = (await this.markRefused(cap, item, f, { reason: c.reason, gate: c.gate, hold_id: null, manifest_id: null, locator: null })) || marked;
      if (!marked) f.tally.skipped += 1;
      return marked ? 'refused' : 'skipped';
    }
  }

  /**
   * W3 (D12): one imported RECORD — (i) the latest row, (ii) its withdrawn version (once per object when a record has several items),
   * (iii) observation.tombstone_blob under retention.import.revoke — a LEGAL HOLD (P0R01) rolls the WHOLE step back to the item's
   * savepoint (the withdrawn version with it: the hold keeps the record whole) and marks the item refused with the hold —, (iv) the
   * custody.tombstoned row, (v) the item marked tombstoned and its locator queued for the bytes after the commit. Left when a live import
   * holds it (C9).
   */
  private async tombstoneRecord(cap: RetentionWrites, item: Row, f: RevocationFacts, n: number, withdrawnObjects: Set<string>): Promise<'tombstoned' | 'left' | 'refused' | 'skipped'> {
    const admitted = isObject(item['admitted']) ? (item['admitted'] as Row) : {};
    const objectId = str(admitted['object_id']); const manifestId = str(admitted['manifest_id']); const locator = str(admitted['locator']);
    if (objectId !== null && UUID.test(objectId)) await cap.lockRevocationCopy(objectId);
    const held = await this.holdersOfGroup(cap, f, [item]);
    const sp = `imr_${n}`;
    await cap.savepoint(sp);
    try {
      if (held.length > 0) { await this.markLeft(cap, item, f, held); await cap.releaseSavepoint(sp); return 'left'; }
      if (objectId === null || manifestId === null || !UUID.test(objectId) || !UUID.test(manifestId)) { await cap.releaseSavepoint(sp); return (await this.markRefused(cap, item, f, { reason: 'the item records no admitted object and manifest to withdraw', gate: 'record', hold_id: null, manifest_id: manifestId, locator })) ? 'refused' : 'skipped'; }
      const prior = await this.latestRowOf(cap, f.scope, objectId);
      if (prior === null) { await cap.releaseSavepoint(sp); return (await this.markRefused(cap, item, f, { reason: `no canonical row of ${objectId} in this domain to withdraw`, gate: 'record', hold_id: null, manifest_id: manifestId, locator })) ? 'refused' : 'skipped'; }
      const owner = await this.liveOwnerOf(cap, f, prior);
      if (owner.length > 0) { await this.markLeft(cap, item, f, owner); await cap.releaseSavepoint(sp); return 'left'; }
      const from = Number(prior['object_version']); let to: number | null = null;
      if (String(prior['lifecycle_state']) !== 'withdrawn' && !withdrawnObjects.has(objectId)) {
        const header = importWithdrawalHeaderOf(prior, { actor: f.actor, correlationId: f.correlationId, purposeId: f.purposeId, recordedAt: new Date().toISOString(), revocation: f.ref, importId: f.importId });
        const payload = isObject(prior['payload']) ? (prior['payload'] as Row) : {};
        await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
        to = from + 1;
      }
      const tombstoneId = newId();
      const inserted = await cap.tombstoneManifest({ tombstoneId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, manifestId, correlationId: f.correlationId,
        reason: `the origin revoked the package this record was imported from (import ${f.importId}; action ${f.ref.action_id}; notice ${f.ref.notice_id ?? 'none recorded'}): ${f.ref.reason ?? 'no reason stated'}` });
      const details = { action_id: f.ref.action_id, notice_id: f.ref.notice_id, package_digest: f.ref.package_digest, revoked_at: f.ref.revoked_at, reason: f.ref.reason, from_version: from, to_version: to, tombstone_id: inserted ? tombstoneId : null, already_tombstoned: !inserted };
      await cap.recordImportRevocationCustody({ manifestId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, importId: f.importId, itemId: String(item['item_id']), evdObjectId: objectId, details, actor: f.actor, correlationId: f.correlationId });
      await cap.markImportItemRevoked({ itemId: String(item['item_id']), importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, outcome: 'tombstoned', details: { object_id: objectId, from_version: from, to_version: to, manifest_id: manifestId, locator, tombstone_id: inserted ? tombstoneId : null, already_tombstoned: !inserted, notice_id: f.ref.notice_id }, actor: f.actor, correlationId: f.correlationId });
      await cap.releaseSavepoint(sp);
      withdrawnObjects.add(objectId);
      f.tally.tombstoned.push(objectId);
      if (locator !== null) f.tally.locators.push({ locator, vault: 'evidence', stagedToo: true }, { locator, vault: 'archive', stagedToo: true });
      return 'tombstoned';
    } catch (e) {
      const message = String((e as { message?: unknown })?.message ?? '');
      const hold = HOLD_REFUSAL.exec(message);
      if (hold !== null) {
        // D12: the hold takes precedence — the record stays whole (the version rolled back with the tombstone); refused with the hold named, retried when lifted.
        await cap.rollbackToSavepoint(sp);
        return (await this.markRefused(cap, item, f, { reason: message.slice(0, 600), gate: 'legal_hold', hold_id: hold[1] ?? null, manifest_id: manifestId, locator })) ? 'refused' : 'skipped';
      }
      const c = revocationRefusalOf(e);
      if (c === null) throw e;
      await cap.rollbackToSavepoint(sp);
      if (c.kind === 'skipped') { f.tally.skipped += 1; return 'skipped'; }
      return (await this.markRefused(cap, item, f, { reason: c.reason, gate: c.gate, hold_id: null, manifest_id: manifestId, locator })) ? 'refused' : 'skipped';
    }
  }

  /**
   * C4, C6: the facts of the ONE import.revoked event from the ITEM MAP — every item retracted, retired, withdrawn or tombstoned SINCE
   * the latest finish of an earlier attempt (none → all of them): the retired entities read back (name, state), the retracted edges read
   * back, the distinct withdrawn claim ids, the tombstoned record ids; the walk seeds — every tombstoned record, then every withdrawn
   * claim no seeded record's lineage reaches (`claim_withdrawal`). Read BEFORE the finish records its own event.
   */
  private async revokedFactsOf(cap: RetentionReads, scope: Scope, importId: string): Promise<{ count: number; identities: ImportChangeFacts['identities']; edges: ImportChangeFacts['edges']; claims: string[]; evidence: string[]; walkSeeds: ImportWalkSeed[]; items: Row[] }> {
    const items = (await cap.readImportItems().selectAll().where('import_id' as never, '=', importId as never).where('disposition' as never, 'in', ['admitted', 'reused'] as never).where('revoked_at' as never, 'is not', null as never).orderBy('dependency_order' as never).execute()) as Row[];
    const lastFinish = (await cap.readImportEvents().select(['occurred_at' as never]).where('import_id' as never, '=', importId as never).where('event' as never, 'in', ['import.revoked', 'import.revocation_held'] as never).orderBy('occurred_at' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined;
    const since = lastFinish === undefined ? null : Date.parse(instantOf(lastFinish['occurred_at']) ?? '');
    const fresh = items.filter((it) => {
      const outcome = String((isObject(it['revocation']) ? (it['revocation'] as Row) : {})['outcome'] ?? '');
      if (!['retracted', 'retired', 'withdrawn', 'tombstoned'].includes(outcome)) return false;
      const at = Date.parse(instantOf(it['revoked_at']) ?? '');
      return since === null || Number.isNaN(since) || (Number.isFinite(at) && at > since);
    });
    const revocationOf = (it: Row): Row => (isObject(it['revocation']) ? (it['revocation'] as Row) : {});
    const retiredIds = [...new Set(fresh.filter((it) => revocationOf(it)['outcome'] === 'retired').map((it) => str(revocationOf(it)['entity_id'])).filter((x): x is string => x !== null))];
    const retractedIds = [...new Set(fresh.filter((it) => revocationOf(it)['outcome'] === 'retracted').map((it) => str(revocationOf(it)['edge_id'])).filter((x): x is string => x !== null))];
    const claims = [...new Set(fresh.filter((it) => revocationOf(it)['outcome'] === 'withdrawn').map((it) => str(revocationOf(it)['object_id']) ?? str((isObject(it['admitted']) ? (it['admitted'] as Row) : {})['object_id'])).filter((x): x is string => x !== null))];
    const evidence = [...new Set(fresh.filter((it) => revocationOf(it)['outcome'] === 'tombstoned').map((it) => str(revocationOf(it)['object_id']) ?? str((isObject(it['admitted']) ? (it['admitted'] as Row) : {})['object_id'])).filter((x): x is string => x !== null))];
    const entityRows = retiredIds.length === 0 ? [] : ((await cap.readEntities().selectAll().where('entity_id' as never, 'in', retiredIds as never).execute()) as Row[]);
    const entityById = new Map(entityRows.map((r) => [String(r['entity_id']), r]));
    const identities: ImportChangeFacts['identities'] = retiredIds.map((id) => { const r = entityById.get(id); return { entity_id: id, role: 'retired', canonical_name: r === undefined ? null : str(r['canonical_name']), lifecycle_state: r === undefined ? 'retired' : (str(r['lifecycle_state']) ?? 'retired') }; });
    const edgeRows = retractedIds.length === 0 ? [] : ((await cap.readEdges().selectAll().where('edge_id' as never, 'in', retractedIds as never).execute()) as Row[]);
    const edgeById = new Map(edgeRows.map((r) => [String(r['edge_id']), r]));
    const edges: ImportChangeFacts['edges'] = retractedIds.map((id) => {
      const r = edgeById.get(id) ?? {};
      const e: ImportChangeFacts['edges'][number] = { edge_id: id, state: str(r['state']) ?? 'retracted', valid_from: instantOf(r['valid_from']), valid_to: instantOf(r['valid_to']), asserted_at: instantOf(r['asserted_at']), retracted_at: instantOf(r['retracted_at']), claim_object_id: str(r['claim_object_id']) };
      const predicate = str(r['predicate']); const subject = str(r['subject_entity_id']); const object = str(r['object_entity_id']);
      if (predicate !== null) e.predicate = predicate;
      if (subject !== null) e.subject_entity_id = subject;
      if (object !== null) e.object_entity_id = object;
      return e;
    });
    // C6: the seeds — the tombstoned records first; a withdrawn claim no seeded record's lineage reaches is seeded on its own.
    const reached = new Set<string>();
    if (evidence.length > 0 && claims.length > 0) {
      const lineage = (await cap.readClaimLineage().select(['claim_object_id' as never]).where('evidence_object_id' as never, 'in', evidence as never).execute()) as Row[];
      for (const l of lineage) reached.add(String(l['claim_object_id']));
    }
    const walkSeeds: ImportWalkSeed[] = [...evidence.map((id) => ({ kind: 'evidence' as const, id })), ...claims.filter((id) => !reached.has(id)).map((id) => ({ kind: 'claim' as const, id }))];
    return { count: fresh.length, identities, edges, claims, evidence, walkSeeds, items };
  }

  /** The latest version of a canonical object of this domain, or null when the domain holds none. */
  private async latestRowOf(cap: RetentionReads, scope: Scope, objectId: string): Promise<Row | null> {
    return ((await cap.readCanonicalObjects().selectAll().where('object_id' as never, '=', objectId as never).where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
      .orderBy('object_version' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined) ?? null;
  }

  /** The state of an import of this domain (and the origin action its copies came from), cached per revocation ('' when unknown). */
  private async importStateOf(cap: RetentionReads, f: RevocationFacts, importId: string): Promise<string> {
    const cached = f.imports.get(importId);
    if (cached !== undefined) return cached.state;
    const r = UUID.test(importId) ? ((await cap.readImports().select(['state' as never, 'origin' as never]).where('import_id' as never, '=', importId as never).executeTakeFirst()) as Row | undefined) : undefined;
    const known = { state: r === undefined ? '' : String(r['state'] ?? ''), originActionId: r === undefined ? null : str((isObject(r['origin']) ? (r['origin'] as Row) : {})['action_id']) };
    f.imports.set(importId, known);
    return known.state;
  }

  /**
   * C9: the LIVE imports holding a group's copy — for an ADMITTED item, every admitted import whose reused item points at it; for a
   * REUSED item, its source import while that import is admitted or revoking (the copy is the source's to destroy), else the other
   * admitted imports reusing the same source item. Empty when nothing live holds it: this revocation destroys the copy.
   */
  private async holdersOfGroup(cap: RetentionReads, f: RevocationFacts, group: Row[]): Promise<string[]> {
    const holders = new Set<string>();
    for (const item of group) {
      const planned = isObject(item['planned']) ? (item['planned'] as Row) : {}; const reuse = isObject(planned['reuse']) ? (planned['reuse'] as Row) : null;
      if (String(item['disposition']) === 'reused') {
        const sourceImport = reuse === null ? null : str(reuse['import_id']); const sourceItem = reuse === null ? null : str(reuse['item_id']);
        if (sourceImport === null || sourceItem === null) { holders.add(sourceImport ?? 'unknown'); continue; }
        // B18 (C9 completed): a REVOKING source still holds the copy only while its own item is pending — one it settled `left` (it found
        // this import admitted then) is a hand-off: the copy is ours to destroy, else both revocations leave it to each other and it stays.
        if (await this.importStillOwes(cap, f, sourceImport, { itemId: sourceItem })) { holders.add(sourceImport); continue; }
        for (const h of await this.reusersOf(cap, f, sourceItem)) holders.add(h);
      } else {
        for (const h of await this.reusersOf(cap, f, String(item['item_id']))) holders.add(h);
      }
    }
    return [...holders];
  }
  /**
   * B18: whether another import of this domain still OWES the copy — admitted (its revocation not begun), or revoking with the named item
   * (by item id, or any item of the object) not yet settled by its revocation (`isPendingRevocation`); revoked, withdrawn or unknown → no.
   */
  private async importStillOwes(cap: RetentionReads, f: RevocationFacts, importId: string, by: { itemId: string } | { objectId: string }): Promise<boolean> {
    const state = await this.importStateOf(cap, f, importId);
    if (state === 'admitted') return true;
    if (state !== 'revoking') return false;
    let q = cap.readImportItems().selectAll().where('import_id' as never, '=', importId as never);
    q = 'itemId' in by ? q.where('item_id' as never, '=', by.itemId as never) : q.where(sql`coalesce(admitted ->> 'object_id', planned ->> 'object_id')` as never, '=', by.objectId as never);
    const rows = (await q.execute()) as Row[];
    return rows.some(isPendingRevocation);
  }
  /** The ADMITTED imports of this domain — other than this one — holding a reused item that points at the item given. */
  private async reusersOf(cap: RetentionReads, f: RevocationFacts, itemId: string): Promise<string[]> {
    const rows = (await cap.readImportItems().select(['import_id' as never]).where('disposition' as never, '=', 'reused' as never).where('import_id' as never, '!=', f.importId as never)
      .where(sql`(planned -> 'reuse' ->> 'item_id')` as never, '=', itemId as never).execute()) as Row[];
    const out: string[] = [];
    for (const id of new Set(rows.map((r) => String(r['import_id'])))) if ((await this.importStateOf(cap, f, id)) === 'admitted') out.push(id);
    return out;
  }
  /** A latest version another LIVE import admitted (its payload's `imported_from.import_id`): the object is that import's to withdraw. */
  private async liveOwnerOf(cap: RetentionReads, f: RevocationFacts, prior: Row): Promise<string[]> {
    const payload = isObject(prior['payload']) ? (prior['payload'] as Row) : {}; const from = isObject(payload['imported_from']) ? (payload['imported_from'] as Row) : null;
    const owner = from === null ? null : str(from['import_id']);
    if (owner === null || owner === f.importId) return [];
    const objectId = str(prior['object_id']);
    return (await this.importStillOwes(cap, f, owner, objectId === null ? { itemId: '' } : { objectId })) ? [owner] : [];
  }
  /** The holders a port or the service answered for an item, noted for the receipt (each holder's origin action cached on first sight). */
  private async noteHeld(cap: RetentionReads, f: RevocationFacts, heldBy: unknown, itemId: string): Promise<void> {
    for (const h of Array.isArray(heldBy) ? heldBy : []) {
      if (typeof h !== 'string') continue;
      f.tally.held.set(h, [...(f.tally.held.get(h) ?? []), itemId]);
      await this.importStateOf(cap, f, h);
    }
  }
  private async markLeft(cap: RetentionWrites, item: Row, f: RevocationFacts, heldBy: string[]): Promise<void> {
    await cap.markImportItemRevoked({ itemId: String(item['item_id']), importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, outcome: 'left', details: { kind: String(item['kind']), reason: `held under import ${heldBy.join(', ')} (admitted, not revoked)`, held_by: heldBy }, actor: f.actor, correlationId: f.correlationId });
    await this.noteHeld(cap, f, heldBy, String(item['item_id']));
    f.tally.left += 1;
  }
  /** The item marked refused with the reason (a hold's, a port's) — false when another attempt settled it meanwhile (C14: skipped). */
  private async markRefused(cap: RetentionWrites, item: Row, f: RevocationFacts, r: { reason: string; gate: string; hold_id: string | null; manifest_id: string | null; locator: string | null }): Promise<boolean> {
    try {
      await cap.markImportItemRevoked({ itemId: String(item['item_id']), importId: f.importId, tenantId: f.scope.tenantId, domainId: f.scope.domainId, outcome: 'refused', details: { reason: r.reason, gate: r.gate, hold_id: r.hold_id, manifest_id: r.manifest_id, locator: r.locator, notice_id: f.ref.notice_id }, actor: f.actor, correlationId: f.correlationId });
    } catch (e) {
      if (SETTLED_BY_ANOTHER_ATTEMPT.test(String((e as { message?: unknown })?.message ?? ''))) return false;
      throw e;
    }
    f.tally.refused.push({ item_id: String(item['item_id']), kind: String(item['kind']), origin_ref: String(item['origin_ref']), ref: String(item['origin_ref']), reason: r.reason, hold_id: r.hold_id, manifest_id: r.manifest_id });
    return true;
  }
  private destroyedOf(t: RevocationTally): { records: number; claims: number; entities: number; edges: number } {
    return { records: t.tombstoned.length, claims: t.withdrawn.length, entities: t.retired.length, edges: t.retracted.length };
  }
  /**
   * C9 at the finish and at the retry (B18): which of the holders the item map names still STAND — admitted, or revoking (a copy is
   * released only by `revoked`: the liveness `holdersOfGroup` and `liveOwnerOf` left the items under) — with their origin actions; a
   * holder id that is not an import id of this domain is carried as it stands (never dropped into a "destroyed"). Read inside a write.
   */
  private async liveHoldersOf(cap: RetentionReads, scope: Scope, ids: string[]): Promise<Array<{ import_id: string; origin_action_id: string | null }>> {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return [];
    const uuids = wanted.filter((x) => UUID.test(x));
    const rows = uuids.length === 0 ? [] : ((await cap.readImports().select(['import_id' as never, 'state' as never, 'origin' as never]).where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never).where('import_id' as never, 'in', uuids as never).execute()) as Row[]);
    const live = rows.filter((r) => ['admitted', 'revoking'].includes(String(r['state']))).map((r) => ({ import_id: String(r['import_id']), origin_action_id: str((isObject(r['origin']) ? (r['origin'] as Row) : {})['action_id']) }));
    const foreign = wanted.filter((x) => !UUID.test(x)).map((x) => ({ import_id: x, origin_action_id: null }));
    return [...live, ...foreign];
  }
  /**
   * D13: the receipt — the recipient's answer in the station script's shape (transfer-station-recipient.mjs) plus `import_id`, `refused`,
   * `verifier`; `copies_destroyed` true only when every copy of this delivery went (nothing refused, no byte failed or remaining, every
   * root verified, nothing held by another import — C9's `held_by` and statement otherwise: the honest answer, mismatched at the origin).
   * B18: `destroyed` counts the WHOLE revocation as the item map records it (`destroyed.bytes` = the tombstoned records whose bytes are
   * verified gone); `bytes_failed` / `bytes_residual` / `bytes_remaining` name the locators (cut at RECEIPT_LIST_MAX, `bytes_truncated` said).
   */
  private receiptBodyOf(a: { importId: string; scope: Scope; ref: ImportRevocationRef; notice: Row | null; destroyed: Row; refused: RefusedRevocationItem[]; bytes: RevocationBytes; held: Array<{ import_id: string; origin_action_id: string | null }>; copiesDestroyed: boolean; retried: boolean }): Row {
    const delivery = a.notice !== null && isObject(a.notice['delivery']) ? (a.notice['delivery'] as Row) : {};
    const statements: string[] = [];
    if (a.held.length > 0) statements.push(`the copies remain under import(s) ${a.held.map((h) => h.import_id).join(', ')} of this domain, admitted from the origin's other package(s); revoking those packages destroys them`);
    // B18 (B17-F1): bytes verified still present after the removal are said, never reported destroyed; the next revoke of this import owes them.
    if (a.bytes.roots_unreachable.length > 0) statements.push(`the ${a.bytes.roots_unreachable.join(' and ')} root(s) of the vault could not be reached during the cleanup: nothing was removed and ${a.bytes.remaining.length} tombstoned record(s) could not be verified gone; the ledger's revocation stands and the next revoke of this import removes and verifies them`);
    else if (a.bytes.remaining.length > 0) statements.push(`the bytes of ${a.bytes.remaining.length} tombstoned record(s) remain in the vault after the removal; the ledger's revocation stands and the next revoke of this import removes them`);
    // The receipt travels (a station file is read under a 64 KiB ceiling): each list cut at RECEIPT_LIST_MAX with the cut said; the ledger event carries the whole lists.
    const cut = (l: string[]): string[] => l.slice(0, RECEIPT_LIST_MAX);
    const truncated = Object.fromEntries((['failed', 'residual', 'remaining'] as const).filter((k) => a.bytes[k].length > RECEIPT_LIST_MAX).map((k) => [k, a.bytes[k].length]));
    return {
      receipt_id: newId(), notice_id: a.ref.notice_id, delivery_id: str(delivery['delivery_id']), action_id: a.ref.action_id, package_digest: a.ref.package_digest,
      copies_destroyed: a.copiesDestroyed, destroyed: a.destroyed,
      refused: a.refused.map((x) => ({ manifest_id: x.manifest_id, ref: x.ref, reason: x.reason, hold_id: x.hold_id })),
      bytes_failed: cut(a.bytes.failed), bytes_residual: cut(a.bytes.residual), bytes_remaining: cut(a.bytes.remaining),
      ...(Object.keys(truncated).length === 0 ? {} : { bytes_truncated: truncated }),
      ...(a.bytes.roots_unreachable.length === 0 ? {} : { roots_unreachable: a.bytes.roots_unreachable }),
      ...(a.held.length === 0 ? {} : { held_by: a.held }),
      ...(statements.length === 0 ? {} : { statement: statements.join('; ') }),
      ...(a.retried ? { retried: true } : {}),
      recipient: `import:${a.scope.tenantId}/${a.scope.domainId}/${a.importId}`, import_id: a.importId, received_at: new Date().toISOString(), verifier: 'the product (retention.import.revoke)',
    };
  }

  // ───────────────────────── the reads ─────────────────────────

  async importOf(cap: RetentionReads, importId: string): Promise<{ import: Row; partner: Row | null; items: Row[]; events: Row[]; receipt: Row } | null> {
    const row = (await cap.readImports().selectAll().where('import_id' as never, '=', importId as never).executeTakeFirst()) as Row | undefined;
    if (row === undefined) return null;
    const partner = typeof row['partner_id'] === 'string' ? (((await cap.readExchangePartners().selectAll().where('partner_id' as never, '=', row['partner_id'] as never).executeTakeFirst()) as Row | undefined) ?? null) : null;
    const items = (await cap.readImportItems().selectAll().where('import_id' as never, '=', importId as never).orderBy('dependency_order' as never).execute()) as Row[];
    const events = (await cap.readImportEvents().selectAll().where('import_id' as never, '=', importId as never).orderBy('occurred_at' as never).execute()) as Row[];
    return { import: row, partner, items, events, receipt: this.receiptOf(row) };
  }

  async imports(cap: RetentionReads): Promise<Row[]> {
    return (await cap.readImports().selectAll().orderBy('opened_at' as never, 'desc').limit(500).execute()) as Row[];
  }

  /** ES-08-004: the IMPORT RECEIPT — the importer's own record of the exchange, in the shape a recipient's receipt takes, with the import's state and counts. */
  receiptOf(row: Row): Row {
    const origin = isObject(row['origin']) ? (row['origin'] as Row) : {}; const exchange = isObject(row['exchange']) ? (row['exchange'] as Row) : null;
    const state = String(row['state'] ?? '');
    return {
      receipt_id: row['import_id'] ?? null,
      ...(exchange !== null && exchange['delivery_id'] !== undefined ? { delivery_id: exchange['delivery_id'], attempt: exchange['attempt'] ?? null } : {}),
      action_id: origin['action_id'] ?? null,
      recipient: `import:${String(row['tenant_id'])}/${String(row['domain_id'])}`,
      received_at: instantOf(row['opened_at']),
      archive_digest: row['archive_digest'] ?? null, package_digest: row['package_digest'] ?? null,
      verified: state !== 'quarantined' && state !== 'withdrawn' && state !== '',
      verifier: 'the product (retention.import; the eye-customer-export/2 checks in process)',
      import_id: row['import_id'] ?? null, state, counts: row['counts'] ?? {},
    };
  }
}

/** The facts an admission carries from write #0 into every batch. */
interface AdmissionFacts {
  importId: string; scope: Scope; actor: string; correlationId: string;
  map: Map<string, string>; outcomes: Map<string, Outcome>;
  itemsByRef: Map<string, Row>; recordsByObject: Map<string, Row[]>;
  origin: Row; partner: Row; contract: Row; partnerKey: string; archiveDigest: string; packageDigest: string;
  ceiling: string; sourceId: string; contractVersion: number; provenanceRef: string; residency: string; retentionProfile: string; acquisitionMode: string;
  /** D20: the intake contract's authority class — what the ObservationRecorded rows announce. */
  authorityClass: string;
}
/**
 * D20: ONE ObservationRecorded for a record the batch ADMITTED — the lifecycle's shape (lifecycle.service.ts) with `obs_object_id` null
 * (no OBS of this domain: the origin's is inside `imported_from`), `run_id` null, acquisition_mode `import`, the intake contract's source
 * and authority class, the BYTES digest (the candidate's, as the lifecycle names it), and the origin under `imported`. Published, not
 * consumed (L1-I03 stays partial).
 */
function observationRecordedOf(d: DecidedRecord, f: AdmissionFacts): { eventType: string; payload: Record<string, unknown> } {
  const admitted = f.outcomes.get(String(d.item['item_id']))?.admitted ?? {};
  const staged = isObject(d.item['staged']) ? (d.item['staged'] as Row) : {};
  return {
    eventType: 'ObservationRecorded',
    payload: {
      schema_version: 'v1', obs_object_id: null, evd_object_id: String(admitted['object_id'] ?? ''), evd_version: Number(admitted['object_version'] ?? 1), revision: false,
      source_id: f.sourceId, contract_version: f.contractVersion, run_id: null, acquisition_mode: 'import', authority_class: f.authorityClass,
      content_digest: d.candidate?.contentDigest ?? String(staged['digest'] ?? ''),
      imported: { import_id: f.importId, partner_key: f.partnerKey, origin: { tenant_id: f.origin['tenant_id'] ?? null, domain_id: f.origin['domain_id'] ?? null, action_id: f.origin['action_id'] ?? null, package_digest: f.packageDigest } },
    },
  };
}

/** What the admission's write #0 answers: an admitted import found (the finalisation alone, N7) or the admission begun with its facts. */
type AdmissionBegun = { kind: 'finalize' | 'admit'; import: Row; items: Row[]; partner: Row | null; contract: Row | null };
/** What the revocation's write #0 answers: the revocation begun (its source recorded), a revoked import to retry (C5), or a station notice refused. */
type RevocationBegun = {
  row: Row; items: Row[]; partner: Row | null; station: { destination: Row; endpoint: string } | null; origin: { tenantId: string; domainId: string; actionId: string };
  holders: Array<{ import_id: string; origin_action_id: string | null }>; opened: { directory: string; path: string; notice: Row } | null;
} & ({ kind: 'begin'; begun: Row; revocation: Row; notice: Row | null } | { kind: 'retried'; begun: Row; lastReceiptEvent?: string | null } | { kind: 'refused'; reason: string });
/** B17: the facts a revocation carries from write #0 into every batch — and its running tally. */
interface RevocationFacts {
  importId: string; scope: Scope; actor: string; correlationId: string; purposeId: string;
  /** The block every port takes as p_revocation: the source as begin_import_revocation recorded it, minus the notice itself. */
  revocation: Row; ref: ImportRevocationRef; partnerKey: string;
  /** C9: the imports this revocation asked about (state, the origin action of their copies), read once each. */
  imports: Map<string, { state: string; originActionId: string | null }>;
  tally: RevocationTally;
}
interface RevocationTally {
  /** The ports' answers for the edges retracted and the entities retired by THIS attempt; the object ids withdrawn and tombstoned by it. */
  retracted: Row[]; retired: Row[]; withdrawn: string[]; tombstoned: string[];
  left: number; skipped: number; refused: RefusedRevocationItem[];
  /** C9: holder import id → the items it holds. */
  held: Map<string, string[]>;
  /** The tombstoned records' locators, for the bytes after the commit (both roots, the staged copies too). */
  locators: Array<{ locator: string; vault: VaultName; stagedToo?: boolean }>;
}
/** The roots a tombstoned record's bytes may sit in — both are owed by a revocation (the staged copies under each too). */
const REVOCATION_ROOTS: ReadonlyArray<'evidence' | 'archive'> = ['evidence', 'archive'];
/**
 * B18 (B17-F1): the revocation as the ITEM MAP records it, reduced from the import's items — every admitted or reused item settled by ANY
 * attempt: the counts by outcome (a claim once per object), the refused items, the left count, the holders named `held_by` (C9), and every
 * tombstoned record's locator, distinct. The cleanup and the receipt of a finish — resumed or not — and of a retry are built from this,
 * never from one attempt's tally: a resumed attempt skips what a crashed one settled, and the crashed one's bytes are still owed.
 */
function durableRevocationOf(items: Row[]): DurableRevocation {
  const revocationOf = (it: Row): Row => (isObject(it['revocation']) ? (it['revocation'] as Row) : {});
  const settled = items.filter((it) => ['admitted', 'reused'].includes(String(it['disposition'])) && it['revoked_at'] !== null && it['revoked_at'] !== undefined);
  const objectIdOf = (it: Row): string => String(revocationOf(it)['object_id'] ?? (isObject(it['admitted']) ? (it['admitted'] as Row)['object_id'] : ''));
  const destroyed: RevocationCounts = {
    records: settled.filter((it) => String(it['kind']) === 'record' && revocationOf(it)['outcome'] === 'tombstoned').length,
    claims: new Set(settled.filter((it) => String(it['kind']) === 'claim' && revocationOf(it)['outcome'] === 'withdrawn').map(objectIdOf)).size,
    entities: settled.filter((it) => revocationOf(it)['outcome'] === 'retired').length,
    edges: settled.filter((it) => revocationOf(it)['outcome'] === 'retracted').length,
  };
  const refused: RefusedRevocationItem[] = settled.filter((it) => revocationOf(it)['outcome'] === 'refused').map((it) => { const r = revocationOf(it); return { item_id: String(it['item_id']), kind: String(it['kind']), origin_ref: String(it['origin_ref']), ref: String(it['origin_ref']), reason: String(r['reason'] ?? ''), hold_id: str(r['hold_id']), manifest_id: str(r['manifest_id']) }; });
  const left = settled.filter((it) => revocationOf(it)['outcome'] === 'left').length;
  const heldIds = new Set<string>();
  for (const it of settled) { const r = revocationOf(it); if (r['outcome'] === 'left' && Array.isArray(r['held_by'])) for (const h of r['held_by'] as unknown[]) if (typeof h === 'string') heldIds.add(h); }
  const locators = new Set<string>();
  for (const it of settled) { const r = revocationOf(it); if (String(it['kind']) === 'record' && r['outcome'] === 'tombstoned') { const l = str(r['locator']); if (l !== null) locators.add(l); } }
  return { destroyed, refused, left, heldIds: [...heldIds], locators: [...locators] };
}
/** An item a revocation still has to settle: admitted or reused, not yet revoked — or revoked with the outcome refused (a hold since lifted). */
function isPendingRevocation(it: Row): boolean {
  const d = String(it['disposition']);
  if (d !== 'admitted' && d !== 'reused') return false;
  if (it['revoked_at'] === null || it['revoked_at'] === undefined) return true;
  return (isObject(it['revocation']) ? (it['revocation'] as Row) : {})['outcome'] === 'refused';
}
/** The revocation block reduced to what a header, a reason and a receipt name. */
function revocationRefOf(block: Row): ImportRevocationRef {
  return { action_id: str(block['action_id']) ?? '', package_digest: str(block['package_digest']) ?? '', revoked_at: instantOf(block['revoked_at']), reason: str(block['reason']), notice_id: str(block['notice_id']) };
}
/** Why a graph item is LEFT by a revocation (D5): a reused row is another import's; an identifier and an identifier system are facts of the domain. */
function leftReasonOf(item: Row): string {
  const kind = String(item['kind']); const planned = isObject(item['planned']) ? (item['planned'] as Row) : {}; const reuse = isObject(planned['reuse']) ? (planned['reuse'] as Row) : null;
  if (reuse !== null) return reuse['by'] === 'identifier' ? `identified by the authoritative identifier ${String(reuse['system_key'])} ${String(reuse['value'])} as an entity of this domain; it is the domain's, not this import's` : `admitted earlier into this domain by import ${String(reuse['import_id'] ?? '?')}; the copy is that import's`;
  if (kind === 'identifier') return 'an identifier is a fact of the domain and stays — of a retired entity when this import created the entity (the memory-mappings subscriber proposes what to do with it)';
  if (kind === 'identifier_system') return 'an identifier system is a declaration of the domain and stays';
  return 'left as it stands';
}
/** C3 / C14: a port's refusal of a revocation item — `skipped` when another attempt settled it meanwhile, `refused` with its gate otherwise; null propagates. */
function revocationRefusalOf(e: unknown): { kind: 'skipped'; reason: string } | { kind: 'refused'; gate: string; reason: string } | null {
  const message = String((e as { message?: unknown })?.message ?? '');
  if (!isInfrastructureFault(e) && !(e instanceof HttpException) && SETTLED_BY_ANOTHER_ATTEMPT.test(message)) return { kind: 'skipped', reason: message.slice(0, 600) };
  const r = refusalOf(e);
  return r === null ? null : { kind: 'refused', gate: r.gate, reason: r.reason };
}
/** A hint for the schema refusal's reason: the forms an import admits. */
const IMPORT_FORMS_HINT: Readonly<Record<string, string>> = { EVD: 'EVD@v1|v2', ENT: 'ENT@v1|v2', EVT: 'EVT@v1|v2', REL: 'REL@v1|v2', ASM: 'ASM@v1|v2', CLM: 'CLM@v2|v3' };

/** D3: the map fixed at the open — every origin id an item names to the id planned for it (records and claims: object and manifest ids; entities; edges). */
function mapOf(items: Row[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const it of items) {
    const kind = String(it['kind']); const origin = isObject(it['origin']) ? (it['origin'] as Row) : {}; const planned = isObject(it['planned']) ? (it['planned'] as Row) : {};
    const set = (from: unknown, to: unknown) => { if (typeof from === 'string' && UUID.test(from) && typeof to === 'string' && UUID.test(to)) map.set(from, to); };
    if (kind === 'record') { set(origin['object_id'], planned['object_id']); set(origin['manifest_id'], planned['manifest_id']); }
    else if (kind === 'claim') set(origin['object_id'], planned['object_id']);
    else if (kind === 'entity') set(origin['entity_id'], planned['entity_id']);
    else if (kind === 'edge') set(origin['edge_id'], planned['edge_id']);
  }
  return map;
}
const mapped = (map: Map<string, string>, v: unknown): string => (typeof v === 'string' ? (map.get(v) ?? v) : '');
const reusedOf = (planned: Row, fallback: Row): Row => { const r = planned['reuse'] as Row; return isObject(r['admitted']) ? (r['admitted'] as Row) : fallback; };

/** C3: a port's refusal classified into the item's gate — or null for an infrastructure fault (and for anything that is not a port's answer), which propagates. */
function refusalOf(e: unknown): { gate: string; reason: string } | null {
  if (isInfrastructureFault(e)) return null;
  if (e instanceof HttpException) return null;
  const code = String((e as { code?: unknown })?.code ?? ''); const message = String((e as { message?: unknown })?.message ?? '');
  if (!PORT_REFUSAL.test(message) && !REFUSAL_CODES.test(code)) return null;
  const reason = message.slice(0, 600);
  const m = /^retention import rejected \((dependency|ontology|identifier|contract_changed|duplicate|notice)\)/.exec(message);
  if (m !== null) return { gate: m[1] === 'contract_changed' || m[1] === 'duplicate' ? 'record' : (m[1] as string), reason };
  if (message.startsWith('retention import rejected')) return { gate: 'record', reason };
  if (/schema_ref|unregistered field|missing required field/.test(message)) return { gate: 'schema', reason };
  return { gate: 'header', reason };
}

/** The counts the finish records: every item of the import by disposition and by kind, the outcomes of this attempt applied. */
function countsOf(items: Row[], outcomes: Map<string, Outcome>): Row {
  const byDisposition: Record<string, number> = { admitted: 0, reused: 0, excluded: 0, refused: 0, staged: 0 };
  const byKind: Record<string, Record<string, number>> = {};
  for (const it of items) {
    const d = outcomes.get(String(it['item_id']))?.disposition ?? String(it['disposition']);
    byDisposition[d] = (byDisposition[d] ?? 0) + 1;
    const k = String(it['kind']);
    byKind[k] = byKind[k] ?? {}; (byKind[k] as Record<string, number>)[d] = ((byKind[k] as Record<string, number>)[d] ?? 0) + 1;
  }
  return { ...byDisposition, by_kind: byKind, items: items.length };
}

/** An entry's body read whole up to `keep` bytes (null beyond it: drained), its sha256 and size accumulated as the chunks pass. */
async function readEntry(body: AsyncIterable<Buffer>, keep: number): Promise<{ bytes: Buffer | null; digest: string; size: number }> {
  const hash = createHash('sha256'); let size = 0; let kept: Buffer[] | null = keep > 0 ? [] : null;
  for await (const chunk of body) {
    hash.update(chunk); size += chunk.byteLength;
    if (kept !== null) { if (size > keep) kept = null; else kept.push(chunk); }
  }
  return { bytes: kept === null ? null : Buffer.concat(kept), digest: hash.digest('hex'), size };
}
/** The whole source's sha256 and size — the second pass of a malformed archive. */
async function digestOfStream(source: Readable): Promise<{ digest: string; size: number }> {
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of source) { const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array); hash.update(b); size += b.byteLength; }
  return { digest: hash.digest('hex'), size };
}
function parseObject(bytes: Buffer): { ok: true; value: Row } | { ok: false; error: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch (e) { return { ok: false, error: `does not parse as JSON: ${String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 120)}` }; }
  if (!isObject(parsed)) return { ok: false, error: `is ${parsed === null ? 'null' : Array.isArray(parsed) ? 'an array' : `a ${typeof parsed}`}, not a JSON object` };
  return { ok: true, value: parsed };
}
