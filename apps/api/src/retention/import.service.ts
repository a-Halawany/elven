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
 * What is NOT done here, and said so: no ObservationRecorded / GraphChanged is published for imported knowledge (subscribers do
 * not learn of it — the next batch, N5); imported claims carry the origin's run/method/call ids and no runs_current/methods_current
 * rows exist for them in this domain (they are not reviewable through the review path; imported evidence is not re-extracted);
 * `obs_object_id` stays the origin's (the OBS record is not carried by a package); no entity resolution beyond the authoritative
 * identifier; the origin's later revocation of an admitted package is the partner's notice, not a propagation.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader, type Envelope } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import type { AuthenticatedPrincipal } from '../shared/auth-types.js';
import { EYE_CONFIG } from '../config/config.module.js';
import type { EyeConfig } from '../config/config.js';
import { PipelineService, type RouteInfo } from '../pipeline/pipeline.service.js';
import { VaultService, VaultIntegrityError, type StoredBlob } from '../observation/vault/vault.service.js';
import { inspectContent } from '../observation/connectors/content-controls.js';
import { isInfrastructureFault } from '../observation/acquisition/lifecycle.service.js';
import { normalizeName } from '../graph/entities/resolver.service.js';
import { RetentionCapability, type RetentionReads, type RetentionWrites } from './retention.capabilities.js';
import { ExportDeliveryService, TransferStationRefused } from './export-delivery.service.js';
import { EXPORT_STREAM_MAX_BYTES, ExportArchiveError, IMPORT_INLINE_MAX_BYTES, LINKS_FILE, listedFilesOf, scanUstarStream } from './export-archive.js';
import { IMPORT_KEPT_MAX_BYTES, classificationRank, importFormOf, importedFromOf, importedHeaderOf, importedPayloadOf, manifestChecks, originOf, planOf, verifyStaged,
         type ImportCheck, type ImportItemKind, type PlanLookup, type StagedEntry, type StagedPackage, type VerificationContext } from './import-package.js';

export type { ImportCheck } from './import-package.js';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
type Actor = { actor: string; correlationId: string };

/** D4: the two intake forms — the tar inline (base64, with the sender's exchange statement when there is one) or at a declared transfer station. */
export type ImportIntake =
  | { kind: 'inline'; base64: string; exchange: Row | null }
  | { kind: 'station'; destinationKey: string; origin: { tenantId: string; domainId: string; actionId: string } };

/** A record batch (D2): at most 32 planned canonical ids per write — ctx.assert_bound_target's ceiling on a declared target set. */
const BATCH = 32;
/** The action every admission write runs under (0076 §5: the canonical-write action of the import). */
const ADMIT_ACTION = 'retention.import.admit';
/**
 * C3: a PORT'S REFUSAL of one item — objects.admit_version (admission rejected), the header trigger (header semantics), the target
 * binding (target binding denied / header binding) and the retention ports' own class-suffixed refusals — as opposed to an
 * infrastructure fault (lifecycle.service.ts isInfrastructureFault): the item is marked, the batch goes on.
 */
const PORT_REFUSAL = /^(admission rejected:|header semantics:|target binding denied:|header binding|retention import rejected)/;
const REFUSAL_CODES = /^(22|23|42)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const instantOf = (v: unknown): string | null => { if (v === null || v === undefined) return null; if (v instanceof Date) return v.toISOString(); const t = Date.parse(String(v)); return Number.isNaN(t) ? null : new Date(t).toISOString(); };
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** What the scan reads: a source opened as a stream (once for the scan, once more for the whole digest when the scan refused it). */
interface IntakeSource { open: () => Readable; size: number | null; intake: Row; exchange: Row | null; revocation: Row | null }
/** What the station opener answers (export-delivery.service.ts `openStationPackage`, C2c: `revocation` = revocation.json when present). */
interface OpenedStationPackage { directory: string; tar: { size: number; open: () => Readable }; deliveryJson: Row | null; signature: Row | null; revocation?: Row | null }

/** One item's settled outcome during an admission (this attempt's, or an earlier attempt's as recorded). */
interface Outcome { disposition: 'admitted' | 'reused' | 'excluded' | 'refused'; admitted: Row | null; gate: string | null; reason: string | null }
/** A record decided before its batch's write: what the write does with it (the candidate created for an admission). */
interface DecidedRecord { item: Row; object: Row | null; verdict: ReturnType<typeof inspectContent> | null; candidate: StoredBlob | null; outcome: Outcome | null }

@Injectable()
export class ImportService {
  /** The locators a withdrawal read inside its write, for the tombstoning after the commit (this process; the sweeper's TTL pass covers a process lost between). */
  readonly #pendingTombstones = new Map<string, string[]>();

  constructor(
    private readonly vault: VaultService,
    private readonly delivery: ExportDeliveryService,
    private readonly pipeline: PipelineService,
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
  ) {}

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
    const destination = (await cap.readExportDestinations().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
      .where('destination_key' as never, '=', intake.destinationKey as never).where('retired_at' as never, 'is', null as never).executeTakeFirst()) as Row | undefined;
    if (destination === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `retention import rejected: no such transfer station ${intake.destinationKey} in this domain`), 404);
    if (String(destination['kind']) !== 'transfer_station') throw new HttpException(errorBody('EYE_STA_002', correlationId, `retention import rejected: destination ${intake.destinationKey} is ${String(destination['kind'])}, not a transfer station; an import reads a station's directory`), 409);
    const endpoint = String(destination['endpoint'] ?? '');
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

  /** N3, N4: what the plan looks up — the domain's earlier import items for the package's origin ids and refs, and the authoritative identifiers of its entities. */
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
        .orderBy('admitted_at' as never, 'desc').execute()) as Row[];
      for (const r of rows) {
        const k = `${String(r['kind'])}:${String(r['origin_object_id'])}`; if (!byObject.has(k)) byObject.set(k, r);
        const rk = `${String(r['kind'])}:${String(r['origin_ref'])}`; if (!byRef.has(rk)) byRef.set(rk, r);
      }
    }
    if (refs.size > 0) {
      const rows = (await cap.readImportItems().selectAll().where('tenant_id' as never, '=', scope.tenantId as never).where('domain_id' as never, '=', scope.domainId as never)
        .where('kind' as never, 'in', ['entity', 'edge'] as never).where('origin_ref' as never, 'in', [...refs] as never).where('disposition' as never, 'in', ['admitted', 'reused'] as never)
        .orderBy('admitted_at' as never, 'desc').execute()) as Row[];
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

  // ───────────────────────── ADMIT (D2, D3; C3, N5, N8) ─────────────────────────

  async admitImport(a: { envelope: Envelope; principal: AuthenticatedPrincipal; scope: Scope; importId: string; route: (action: string, objectType: string, objectId: string, writableTargets?: string[]) => RouteInfo }): Promise<{ import: Row; batches: Row[]; receipt: { policyDecisionId: string; auditSeq: number } }> {
    const { scope, importId } = a;
    const actor = a.principal.principalId; const correlationId = a.envelope.correlation_id;
    const batches: Row[] = [];
    const write = async <T>(objectType: string, objectId: string, writableTargets: string[] | undefined, handler: (cap: RetentionWrites) => Promise<T>) =>
      this.pipeline.write<T, RetentionWrites>({ ...a.envelope, message_id: newId(), action: ADMIT_ACTION, object_type: objectType, object_id: objectId }, a.principal,
        a.route(ADMIT_ACTION, objectType, objectId, writableTargets), RetentionCapability.write,
        async (cap) => ({ result: await handler(cap), targetType: 'RIM', targetId: importId, targetVersion: null, outboxEvent: null }));

    // Write #0: the admission begun (or an admitted import found: the finalisation alone, N7), the items and the facts the loop needs.
    const begun = await write('RIM', importId, undefined, async (cap) => {
      const row = (await cap.readImports().selectAll().where('import_id' as never, '=', importId as never).executeTakeFirst()) as Row | undefined;
      if (row === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `retention import rejected: no such import ${importId} in this domain`), 404);
      const items = (await cap.readImportItems().selectAll().where('import_id' as never, '=', importId as never).orderBy('dependency_order' as never).execute()) as Row[];
      if (String(row['state']) === 'admitted') return { kind: 'finalize' as const, import: row, items, partner: null as Row | null, contract: null as Row | null };
      const b = await cap.beginImportAdmission({ importId, tenantId: scope.tenantId, domainId: scope.domainId, actor, correlationId });
      const partner = isObject(b['partner']) ? (b['partner'] as Row) : null;
      const contractFacts = isObject(b['contract']) ? (b['contract'] as Row) : {};
      const contractRow = partner === null ? undefined : ((await cap.readSourceContracts().selectAll().where('source_id' as never, '=', String(partner['intake_source_id']) as never).where('contract_version' as never, '=', Number(partner['intake_contract_version']) as never).executeTakeFirst()) as Row | undefined);
      const importRow = isObject(b['import']) ? (b['import'] as Row) : row;
      return { kind: 'admit' as const, import: importRow, items, partner, contract: { ...(contractRow ?? {}), ...contractFacts } as Row };
    });
    let receipt = { policyDecisionId: begun.policyDecisionId, auditSeq: begun.auditSeq };
    let importRow = begun.result.import;
    const allItems = begun.result.items;

    if (begun.result.kind === 'admit') {
      const partner = begun.result.partner; const contract = begun.result.contract;
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
          partnerKey: String(partner['partner_key'] ?? ''), archiveDigest: String(importRow['archive_digest'] ?? ''),
          ceiling: String(contract['classification_ceiling'] ?? ''), sourceId: String(contract['source_id'] ?? partner['intake_source_id']), contractVersion: Number(contract['contract_version'] ?? partner['intake_contract_version']),
          provenanceRef: `SRC:${String(contract['source_id'] ?? partner['intake_source_id'])}@${String(contract['contract_version'] ?? partner['intake_contract_version'])}`,
          residency: String(contract['residency'] ?? ''), retentionProfile: String(contract['retention_profile'] ?? contract['retention'] ?? 'default'), acquisitionMode: contract['acquisition_mode'] === 'replay' ? 'replay' : 'live',
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
            const out = await write('RIM', importId, decided.filter((d) => d.outcome === null).map((d) => String((d.item['planned'] as Row)['object_id'])), async (cap) => {
              let n = 0; const tally = { admitted: 0, reused: 0, excluded: 0, refused: 0 };
              for (const d of decided) {
                const outcome = d.outcome ?? await this.admitRecord(cap, d, facts, n);
                n += 1;
                await this.mark(cap, d.item, outcome, facts);
                tally[outcome.disposition] += 1;
              }
              await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.batch_admitted', details: { kind: 'record', batch: Math.floor(i / BATCH) + 1, count: decided.length, ...tally }, actor, correlationId });
              return tally;
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
          const out = await write('RIM', importId, targets, async (cap) => {
            let n = 0; const tally = { admitted: 0, reused: 0, excluded: 0, refused: 0 };
            for (const item of batch) {
              const outcome = await this.admitClaim(cap, item, closureClaims.get(String(item['origin_ref'])) ?? null, facts, n);
              n += 1;
              await this.mark(cap, item, outcome, facts);
              tally[outcome.disposition] += 1;
            }
            await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.batch_admitted', details: { kind: 'claim', batch: Math.floor(i / BATCH) + 1, count: batch.length, ...tally }, actor, correlationId });
            return tally;
          });
          receipt = { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq };
          batches.push({ kind: 'claim', count: batch.length, ...out.result, policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq });
        }

        // (4) ONE graph write — identifier systems, entities, identifiers, edges — and (5) the finish.
        const graph = staged.filter((it) => ['identifier_system', 'entity', 'identifier', 'edge'].includes(String(it['kind'])));
        const out = await write('RIM', importId, undefined, async (cap) => {
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
          return { tally, finished };
        });
        receipt = { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq };
        if (graph.length > 0) batches.push({ kind: 'graph', count: graph.length, ...out.result.tally, policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq });
        importRow = isObject(out.result.finished) && Object.keys(out.result.finished).length > 0 ? out.result.finished : { ...importRow, state: 'admitted' };
        for (const it of allItems) { const o = facts.outcomes.get(String(it['item_id'])); if (o !== undefined) { it['disposition'] = o.disposition; it['admitted'] = o.admitted; it['gate'] = o.gate; it['reason'] = o.reason; } }
      } catch (e) {
        // The fault recorded on the import — best effort: the same fault may refuse this write too, and then the audit's own
        // handler-failure row is the record — and propagated: the import stays ADMITTING with its staged items; the same act resumes it.
        if (!(e instanceof HttpException)) {
          await write('RIM', importId, undefined, async (cap) => cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.failed', details: { attempt: Number(importRow['attempts'] ?? 0), reason: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 300), infrastructure: isInfrastructureFault(e) }, actor, correlationId })).catch(() => undefined);
        }
        throw e;
      }
    }

    // (6) After the commit: the ADMITTED records' quarantine copies go (manifest.json, links.json and the refused or excluded copies stay: the evidence); recorded.
    const locators = allItems.filter((it) => String(it['kind']) === 'record' && String(it['disposition']) === 'admitted').map((it) => (isObject(it['staged']) ? (it['staged'] as Row)['quarantine_locator'] : null)).filter((l): l is string => typeof l === 'string');
    const tomb = await this.tombstoneLocators(scope, locators);
    const fin = await write('RIM', importId, undefined, async (cap) => {
      await cap.recordImportEvent({ importId, tenantId: scope.tenantId, domainId: scope.domainId, event: 'import.finalized', details: { tombstoned: tomb.tombstoned, locators: tomb.locators, failed: tomb.failed, resumed: begun.result.kind === 'finalize' }, actor, correlationId });
      return { ok: true };
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
  origin: Row; partner: Row; contract: Row; partnerKey: string; archiveDigest: string;
  ceiling: string; sourceId: string; contractVersion: number; provenanceRef: string; residency: string; retentionProfile: string; acquisitionMode: string;
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
  const m = /^retention import rejected \((dependency|ontology|identifier|contract_changed|duplicate)\)/.exec(message);
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
