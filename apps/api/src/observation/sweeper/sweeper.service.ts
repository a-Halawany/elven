/**
 * Orphan reconciliation — PHASE1_PLAN §5.11, acceptance A4 (F34–F36).
 *
 * Three classes of orphan, three treatments, and one rule that governs all of
 * them: NOTHING IS EVER SILENTLY DELETED. An admitted-candidate blob with no
 * manifest row is quarantined for investigation, not removed; a quarantine case
 * past its TTL is expired with an event; an interrupted run is failed with a
 * stated reason. A sweeper that tidied evidence away would be the most dangerous
 * component in the system.
 *
 * EVERY OPERATION IS IDEMPOTENT. The sweeper can crash between classifying an
 * orphan and acting on it (F36), during one item (F34), or on a poison item
 * (F35), and the next sweep re-derives the classification and completes the work.
 * That is why classification is a pure function of stored state and never a
 * remembered decision.
 *
 * CP-6 B12 (D6): the walk covers BOTH blob roots — the evidence root and the
 * ARCHIVE root — and knows the names the tier moves leave behind. A move
 * (an archive, 0070; a restore, 0072) copies the bytes into the other root STAGED
 * under the execution attempt's own name, `<uuid>.staging-<attempt uuid>`, and
 * publishes the copy under the locator only after the commit that recorded the
 * move (0071); a process lost between its copy and its cleanup leaves the staged
 * file behind, and the B11 closure's follow-up asks the sweeper to dispose of it.
 * The classification is still a pure function of stored state and file age: a
 * `.tmp-` file older than a minute never had a locator and goes; a staged copy is
 * REDUNDANT — and removed — only when a copy under the locator VERIFIES against
 * the manifest's digest in the tier the ledger records (in the same root at
 * once; in the other root only once the file is older than the run timeout, an
 * execution may still be in flight); a staged copy that may be the only verified
 * copy is kept and recorded for a person; a plain name in the archive root with
 * no manifest is an orphan candidate like its evidence-root sibling, and one
 * whose manifest the ledger says is HOT is a stale archive copy (a restore whose
 * archive removal failed — the execute route's pending residual), recorded and
 * kept. Nothing with bytes the product may still need is removed.
 *
 * CP-6 B16 (C5): the QUARANTINE COPIES OF AN IMPORT have a lifecycle. A governed
 * import (0076 §4) stores every entry of an inbound package in the quarantine
 * root — inventoried by the IMPORT LEDGER (import_items.staged, the import's
 * manifest and links locators), never by blob_manifests, so neither step 3 (no
 * quarantine case) nor the walk of step 4 (the quarantine root is not walked)
 * sees them. An import that was QUARANTINED (its checks failed) or WITHDRAWN keeps
 * them as the evidence of what arrived until the withdraw act tombstones them or,
 * here, until they are older than the quarantine TTL — the same TTL that expires
 * a quarantine case (step 1). The read and the mark go through two definer ports
 * of 0076 (`retention.import_quarantine_expired`, `retention.mark_import_quarantine_swept`:
 * the sweeper's own, no authority assertion, granted to eye_app), because the
 * ledger is RLS-governed and the sweeping principal holds no retention authority;
 * the removal is the vault's idempotent tombstone; an import whose copies could
 * not all be removed is not marked and is found again next round.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Envelope } from '@eye/contracts';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { APP_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { ObservationCapability, tierOf, type ObservationReads } from '../observation.capabilities.js';
import { VaultService, sha256, type VaultName } from '../vault/vault.service.js';
import * as fault from '../fault-injection.js';

const EMPTY_PAYLOAD_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

/** The two blob roots the tier moves write to (the quarantine root holds no staged copy and is step 3's). */
type BlobRoot = 'evidence' | 'archive';
const BLOB_ROOTS: readonly BlobRoot[] = ['evidence', 'archive'];

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** A staged copy's name, EXACTLY (C17): the locator's own id and the creating attempt's — a temp of a staged copy carries `.tmp-` and is a temp. */
const STAGED_NAME_RE = new RegExp(`^(${UUID})\\.staging-(${UUID})$`);
/** A temp file of an interrupted write is gone after this long; it never had a locator, so nothing could ever have referenced it. */
const TEMP_FILE_MAX_AGE_MS = 60_000;

export interface SweepReport {
  expiredCases: number;
  failedRuns: number;
  orphanCandidates: number;
  pendingTombstones: number;
  poisonItems: Array<{ kind: string; ref: string; reason: string }>;
  /** B12 (D6): plain names in the ARCHIVE root with no manifest row — recorded, kept, like the evidence root's. */
  archiveOrphanCandidates: number;
  /** B12 (D6): staged copies removed as redundant — a copy under the locator verifies in the tier's root. */
  stagedCopiesRemoved: number;
  /** B12 (D6): staged copies kept — an execution may be in flight, or the copy may be the only verified one (then also recorded under `poisonItems`). */
  stagedCopiesKept: number;
  /** B12 (D6): `.tmp-` files of interrupted writes, older than a minute, removed from either root. */
  tempFilesRemoved: number;
  /** B16 (C5): quarantine copies of quarantined or withdrawn imports older than the quarantine TTL, removed (one per locator). */
  importQuarantineTombstoned: number;
  /** B16 (C5): the imports whose copies were all removed this round and whose sweep was recorded (import.evidence_tombstoned). */
  importQuarantineSwept: number;
}

/** A manifest of the domain as the walk needs it: the id the tier ledger is keyed by and the digest a copy must verify against. */
interface KnownManifest {
  manifestId: string;
  digest: string;
}

/** What a file name in a blob root is (C17: a temp first, whatever precedes the `.tmp-`; then a staged copy; then a plain locator id). */
type NameClass =
  | { kind: 'temp' }
  | { kind: 'staged'; base: string; attemptId: string }
  | { kind: 'plain'; base: string };

@Injectable()
export class SweeperService {
  private readonly log = new Logger('observation.sweeper');

  constructor(
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    @Inject(APP_DB) private readonly db: Db,
    private readonly pipeline: PipelineService,
    private readonly vault: VaultService,
  ) {}

  /**
   * Every read here is a CONSEQUENTIAL READ under the sweeping principal's
   * authority. Reading through the ordinary application pool returns nothing —
   * row-level security has no tenant to compare against outside a governed
   * context — and a sweeper that saw no manifests would classify every blob in
   * the volume as an orphan, which is precisely the wrong answer to be confident
   * about.
   */
  private async read<T>(
    principal: AuthenticatedPrincipal, tenantId: string, domainId: string,
    correlationId: string, purposeId: string, objectType: string,
    fn: (cap: ObservationReads) => Promise<T>,
  ): Promise<T> {
    const envelope: Envelope = {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId,
      principal_id: `principal:${principal.principalId}`, purpose_id: purposeId,
      action: 'observation.read.sweeper', side_effect_class: 'none', consequence_class: 'C1',
      object_type: objectType, object_id: null, schema_version: 'v1',
      issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: `sweep-${correlationId.slice(0, 8)}`,
      payload_digest: EMPTY_PAYLOAD_DIGEST,
    };
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      {
        scope: 'DOMAIN', tenantId, domainId,
        action: 'observation.read.sweeper', objectType, objectId: null,
      },
      ObservationCapability.read, async (cap) => fn(cap));
    return out.result;
  }

  async sweep(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    domainId: string,
    correlationId: string,
    purposeId: string,
  ): Promise<SweepReport> {
    const report: SweepReport = {
      expiredCases: 0, failedRuns: 0, orphanCandidates: 0,
      pendingTombstones: 0, poisonItems: [],
      archiveOrphanCandidates: 0, stagedCopiesRemoved: 0, stagedCopiesKept: 0, tempFilesRemoved: 0,
      importQuarantineTombstoned: 0, importQuarantineSwept: 0,
    };

    // ── 1. Quarantine cases past their TTL without a terminal state ──────────
    const staleCases = await this.read(principal, tenantId, domainId, correlationId, purposeId, 'QAR',
      async (cap) => (await cap
        .readQuarantine().selectAll()
        .where('state' as never, '=', 'open' as never)
        .where('expires_at' as never, '<', new Date() as never)
        .limit(200)
        .execute()) as Array<{ case_id: string }>);

    for (const c of staleCases) {
      fault.at('f36.sweeper_between_classify_and_act');
      try {
        fault.at('f34.during_sweeper_item');
        await this.governed(principal, tenantId, domainId, correlationId, purposeId,
          'observation.sweeper.reconcile', 'QAR', c.case_id, async (cap) => {
            await cap.closeQuarantineCase({
              caseId: c.case_id, tenantId, domainId, outcome: 'expired',
              reason: null, eventId: newId(), correlationId,
            });
          });
        report.expiredCases += 1;
      } catch (e) {
        // A poison item does not stop the sweep; it is recorded and retried next
        // round, so one bad row cannot stall reconciliation for everything else.
        fault.at('f35.sweeper_poison_item');
        report.poisonItems.push({ kind: 'quarantine_case', ref: c.case_id, reason: describe(e) });
      }
    }

    // ── 2. Runs started but never terminated, past the run timeout ───────────
    const cutoff = new Date(Date.now() - this.cfg['eye.sweeper.run_timeout_seconds'] * 1000);
    const stuckRuns = await this.read(principal, tenantId, domainId, correlationId, purposeId, 'RUN',
      async (cap) => (await cap
        .readRuns().selectAll()
        .where('state' as never, '=', 'started' as never)
        .where('last_event_at' as never, '<', cutoff as never)
        .limit(200)
        .execute()) as Array<{
        run_id: string; source_id: string; contract_version: number;
        agent_principal_id: string; agent_version: string; code_digest: string;
        connector: string; connector_version: string; acquisition_mode: string;
      }>);

    for (const r of stuckRuns) {
      try {
        await this.governed(principal, tenantId, domainId, correlationId, purposeId,
          'observation.sweeper.reconcile', 'RUN', r.run_id, async (cap) => {
            await cap.appendRunEvent({
              eventId: newId(), tenantId, domainId, runId: r.run_id,
              sourceId: r.source_id, contractVersion: r.contract_version,
              agentPrincipalId: r.agent_principal_id, agentVersion: r.agent_version,
              codeDigest: r.code_digest, connector: r.connector,
              connectorVersion: r.connector_version, acquisitionMode: r.acquisition_mode,
              event: 'run.failed',
              details: { reason: 'interrupted', reconciled_by: 'sweeper' },
              correlationId,
            });
            /* B23 (0084) stream: a stream the reconciled run was driving is recorded INTERRUPTED at its cursor, in the same
               transaction — a resume then continues from there. A command run drives no stream and this finds nothing. */
            const driven = (await cap.readAcquisitionStreams().select(['stream_id' as never])
              .where('current_run_id' as never, '=', r.run_id as never).execute()) as Array<{ stream_id: string }>;
            for (const s of driven) {
              await cap.interruptStream({
                streamId: s.stream_id, tenantId, domainId, runId: r.run_id, reasonClass: 'sweeper',
                reason: 'the run driving the stream stopped reporting and was reconciled failed by the sweeper',
                inFlight: [], rangeClass: null, correlationId,
              });
            }
            /* end B23 stream */
          });
        report.failedRuns += 1;
      } catch (e) {
        report.poisonItems.push({ kind: 'run', ref: r.run_id, reason: describe(e) });
      }
    }

    // ── 3. Quarantine blobs whose case closed as admitted but whose tombstone
    //       never completed. The tombstone is idempotent, so re-running it is
    //       always safe and always finishes the job (F26/F27). ────────────────
    const admittedCases = await this.read(principal, tenantId, domainId, correlationId, purposeId, 'QAR',
      async (cap) => (await cap
        .readQuarantine().selectAll()
        .where('state' as never, '=', 'admitted' as never)
        .limit(200)
        .execute()) as Array<{ case_id: string; manifest_id: string | null }>);
    for (const c of admittedCases) {
      if (c.manifest_id === null) continue;
      const m = await this.read(principal, tenantId, domainId, correlationId, purposeId, 'EVD',
        async (cap) => (await cap
          .readManifests().selectAll()
          .where('manifest_id' as never, '=', c.manifest_id as never)
          .executeTakeFirst()) as { locator: string; vault: string } | undefined);
      if (m === undefined || m.vault !== 'quarantine') continue;
      if (!(await this.vault.exists('quarantine', { tenantId, domainId }, m.locator))) continue;
      try {
        await this.governed(principal, tenantId, domainId, correlationId, purposeId,
          'observation.sweeper.reconcile', 'QAR', c.case_id, async (cap) => {
            await cap.tombstoneBlob({
              tombstoneId: newId(), tenantId, domainId, manifestId: c.manifest_id as string,
              reason: 'quarantine copy retired after admission (sweeper completion)',
              correlationId,
            });
          });
        await this.vault.tombstone('quarantine', { tenantId, domainId }, m.locator);
        report.pendingTombstones += 1;
      } catch (e) {
        report.poisonItems.push({ kind: 'tombstone', ref: c.case_id, reason: describe(e) });
      }
    }

    // ── 3b. B16 (C5): the quarantine copies of QUARANTINED or WITHDRAWN imports
    //       older than the quarantine TTL — inventoried by the import ledger,
    //       not by the manifests; removed through the vault, the sweep recorded
    //       on the import. Nothing of a verified, approved, admitting or
    //       admitted import is touched: its copies go with its own admission. ──
    await this.reconcileImportQuarantine(tenantId, domainId, report);

    // ── 4. The blob roots: admitted-candidate blobs with NO manifest row, and
    //       (B12, D6) the names a tier move leaves behind ─────────────────────
    // The plain orphans are the 8g orphans. They are ALREADY unreachable
    // (retrieval resolves through the manifest), and they are QUARANTINED FOR
    // INVESTIGATION rather than deleted: bytes that reached the evidence volume
    // without a record are exactly the thing a reviewer will want to see. The
    // same rule holds in the archive root. Temp files and REDUNDANT staged copies
    // are the only names the walk removes, each through the vault by its own name.
    await this.reconcileRoots(principal, tenantId, domainId, correlationId, purposeId, report);

    return report;
  }

  /**
   * Walk BOTH blob roots for this domain and compare against the manifests and
   * the tier ledger. Filesystem-first, deliberately: an orphan is by definition
   * something the database does not know about, so a database-first sweep could
   * never find one. The stored state is read ONCE before the walk (the manifests
   * by locator; the tier of every manifest a staged or an archive-root name points
   * at), so the classification of every name is a function of one snapshot and
   * the file's age, never of a read interleaved with a removal.
   */
  private async reconcileRoots(
    principal: AuthenticatedPrincipal, tenantId: string, domainId: string,
    correlationId: string, purposeId: string, report: SweepReport,
  ): Promise<void> {
    const scope = { tenantId, domainId };

    // The listings first: a root that cannot be listed is recorded and left alone
    // — nothing of it is classified, so nothing of it is removed (fail closed).
    const listed: Array<{ root: BlobRoot; names: string[] }> = [];
    for (const root of BLOB_ROOTS) {
      try {
        listed.push({ root, names: await this.vault.listDomain(root, scope) });
      } catch (e) {
        report.poisonItems.push({ kind: 'vault_root', ref: `${root}/${tenantId}/${domainId}`, reason: `the ${root} root cannot be listed for this domain; nothing of it was classified or removed: ${describe(e)}` });
      }
    }
    if (listed.every((l) => l.names.length === 0)) return; // nothing stored for this domain yet

    // The manifests of the domain, by locator. Only evidence-vault manifests have
    // bytes in these two roots (a manifest's vault is its admission-time vault; the
    // tier ledger says which root holds the bytes now).
    const known = new Map<string, KnownManifest>();
    for (const r of await this.read(principal, tenantId, domainId, correlationId, purposeId, 'EVD',
      async (cap) => (await cap
        .readManifests().select(['manifest_id' as never, 'locator' as never, 'content_digest' as never])
        .where('vault' as never, '=', 'evidence' as never)
        .limit(20000)
        .execute()) as Array<{ manifest_id: string; locator: string; content_digest: string }>)) {
      known.set(r.locator, { manifestId: r.manifest_id, digest: r.content_digest });
    }

    // The tier of every manifest whose bytes the walk must place: the manifest a
    // staged copy names (in either root) and the manifest a plain archive-root
    // name names. One governed read; a read that fails leaves every tier unknown,
    // and a staged copy whose tier is unknown is kept.
    const wanted = new Set<string>();
    for (const { root, names } of listed) {
      for (const name of names) {
        const c = classifyName(name);
        if (c.kind === 'temp') continue;
        const m = known.get(`${tenantId}/${domainId}/${c.base}`);
        if (m === undefined) continue;
        if (c.kind === 'staged' || root === 'archive') wanted.add(m.manifestId);
      }
    }
    const tiers = new Map<string, 'hot' | 'archive'>();
    if (wanted.size > 0) {
      try {
        await this.read(principal, tenantId, domainId, correlationId, purposeId, 'EVD', async (cap) => {
          for (const manifestId of wanted) tiers.set(manifestId, (await tierOf(cap, manifestId)).tier);
        });
      } catch (e) {
        tiers.clear();
        report.poisonItems.push({ kind: 'blob_tier', ref: `${tenantId}/${domainId}`, reason: `the tier ledger could not be read; every staged copy of the domain is kept this round: ${describe(e)}` });
      }
    }

    const timeoutMs = this.cfg['eye.sweeper.run_timeout_seconds'] * 1000;
    for (const { root, names } of listed) {
      const dir = join(this.vault.rootFor(root), tenantId, domainId);
      let orphans = 0;
      for (const name of names) {
        const c = classifyName(name);

        // A temp file from an interrupted write is a different orphan class and is
        // removed: it never had a locator, so nothing could ever have referenced it.
        // A temp of a STAGED copy (`<uuid>.staging-<attempt>.tmp-<uuid>`, C17) is
        // the same class — the `.tmp-` decides, whatever precedes it.
        if (c.kind === 'temp') {
          const info = await stat(join(dir, name)).catch(() => null);
          if (info === null || Date.now() - info.mtimeMs <= TEMP_FILE_MAX_AGE_MS) continue;
          try {
            await this.vault.removeTempFile(root, scope, name);
            report.tempFilesRemoved += 1;
          } catch (e) {
            report.poisonItems.push({ kind: 'temp_file', ref: `${root}/${tenantId}/${domainId}/${name}`, reason: describe(e) });
          }
          continue;
        }

        const locator = `${tenantId}/${domainId}/${c.base}`;
        const m = known.get(locator);

        // No manifest with this locator: an ORPHAN CANDIDATE, staged or plain,
        // in either root. Recorded, NOT removed: the bytes stay where they are for
        // investigation. A BOUNDED SAMPLE is carried in the report — a list that
        // repeats one sentence two hundred times tells an operator less than a
        // count and five examples, not more.
        if (m === undefined) {
          orphans += 1;
          if (orphans <= 5) {
            report.poisonItems.push({
              kind: 'orphan_candidate',
              ref: root === 'evidence' ? locator : `${root}/${locator}`,
              reason: root === 'evidence'
                ? 'evidence-volume bytes with no manifest row: an admission transaction that did not commit. Retained for investigation, unreachable through every retrieval path.'
                : 'archive-tier bytes with no manifest row: a move whose manifest the ledger does not know. Retained for investigation, unreachable through every retrieval path.',
            });
          }
          continue;
        }

        if (c.kind === 'staged') {
          await this.reconcileStagedCopy(root, dir, name, locator, c.attemptId, m, tiers.get(m.manifestId), timeoutMs, report);
          continue;
        }

        // A plain name with a manifest: known in the evidence root, nothing to do.
        // In the ARCHIVE root the tier decides: 'archive' is the copy the ledger
        // expects; 'hot' is a STALE ARCHIVE COPY — a restore whose archive removal
        // did not complete, the pending residual the execute route retries —
        // recorded and kept: the retry is a governed act, not the sweeper's.
        if (root === 'archive' && tiers.get(m.manifestId) === 'hot') {
          report.poisonItems.push({
            kind: 'stale_archive_copy',
            ref: `${root}/${locator}`,
            reason: 'an archive-tier copy of a manifest the tier ledger records as HOT: a restore whose archive removal did not complete (a pending residual the execute route on the restore action retries). Retained; the hot copy serves.',
          });
        }
      }
      if (root === 'evidence') report.orphanCandidates = orphans;
      else report.archiveOrphanCandidates = orphans;
    }
  }

  /**
   * One staged copy (D6, C17, C18). "Verifies" means the vault reads the copy under
   * the locator against the manifest's digest. Removed only when it is REDUNDANT:
   * a verified copy stands under the locator in the tier's root — at once when the
   * staged copy is in that root (a publish already happened, or another attempt's
   * did), only after the run timeout when it is in the other root (a move that
   * never committed; younger, an execution may still be in flight). Kept in every
   * other case, and RECORDED for a person when it may be the only verified copy —
   * unless it is young and in the tier's root, the ordinary instant between a
   * commit and its publish (C18). Recovery from a verified copy (DP-28-005) is a
   * governed act, never the sweeper's.
   */
  private async reconcileStagedCopy(
    root: BlobRoot, dir: string, name: string, locator: string, attemptId: string,
    m: KnownManifest, tier: 'hot' | 'archive' | undefined, timeoutMs: number, report: SweepReport,
  ): Promise<void> {
    const scope = { tenantId: locator.split('/')[0] as string, domainId: locator.split('/')[1] as string };
    const ref = `${root}/${locator}.staging-${attemptId}`;
    if (tier === undefined) { report.stagedCopiesKept += 1; return; } // the tier is unknown this round (recorded once above): kept
    const tierRoot: BlobRoot = tier === 'archive' ? 'archive' : 'evidence';
    const verifies = (v: VaultName): Promise<boolean> => this.vault.read(v, scope, locator, m.digest).then(() => true, () => false);
    const info = await stat(join(dir, name)).catch(() => null);
    if (info === null) return; // gone between the listing and now: a publish or a cleanup raced the walk
    const stale = Date.now() - info.mtimeMs > timeoutMs;

    const remove = async (why: string): Promise<void> => {
      try {
        await this.vault.removeStagedIn(root, scope, locator, attemptId);
        report.stagedCopiesRemoved += 1;
      } catch (e) {
        report.stagedCopiesKept += 1;
        report.poisonItems.push({ kind: 'staged_copy', ref, reason: `${why}, but the removal failed: ${describe(e)}` });
      }
    };

    if (root === tierRoot) {
      if (await verifies(root)) { await remove('redundant: the copy under the locator verifies in the tier\'s root'); return; }
      // The published copy does not verify (absent or corrupt). The staged copy may
      // be the only verified one — an integrity incident for a person, never a
      // removal — unless the file is young: the instant between a commit and its
      // publish is ordinary and passes.
      report.stagedCopiesKept += 1;
      const stagedOk = await readFile(join(dir, name)).then((b) => sha256(b) === m.digest, () => false);
      if (stale || !stagedOk) {
        report.poisonItems.push({
          kind: 'staged_copy_kept',
          ref,
          reason: stagedOk
            ? `the ${tierRoot} copy under the locator does not verify against the manifest's digest while this staged copy does, and the file is older than the run timeout: it may be the only verified copy. Retained for a person; recovery from a verified copy is a governed act.`
            : `neither the ${tierRoot} copy under the locator nor this staged copy verifies against the manifest's digest. Retained for a person as an integrity incident.`,
        });
      }
      return;
    }

    // A staged copy in the root the tier does NOT record: a move that has not
    // committed — still in flight while the file is young, abandoned once it is
    // older than the run timeout. Abandoned and the tier's copy verified: removed;
    // abandoned and the tier's copy not verifying: kept and recorded.
    if (!stale) { report.stagedCopiesKept += 1; return; }
    if (await verifies(tierRoot)) { await remove(`abandoned by a move that never committed; the copy under the locator verifies in the ${tierRoot} root`); return; }
    report.stagedCopiesKept += 1;
    report.poisonItems.push({
      kind: 'staged_copy_kept',
      ref,
      reason: `left by a move that never committed, older than the run timeout, and the ${tierRoot} copy under the locator — the tier the ledger records — does not verify against the manifest's digest: this may be the only verified copy. Retained for a person; recovery from a verified copy is a governed act.`,
    });
  }

  /**
   * B16 (C5): the imports of THIS domain in state quarantined or withdrawn whose opened_at / withdrawn_at is older than the
   * quarantine TTL, with their quarantine locators — the definer's read across the ledger (the function answers every domain;
   * the sweep is per domain, so it filters to its own). Each locator tombstoned through the vault, idempotently; the import marked
   * swept (import.evidence_tombstoned) only once every copy is gone — a removal that failed is a poison item and the import is
   * found again next round. A ledger that cannot be read removes nothing (fail closed, recorded once).
   */
  private async reconcileImportQuarantine(tenantId: string, domainId: string, report: SweepReport): Promise<void> {
    const scope = { tenantId, domainId };
    const olderThan = `${this.cfg['eye.quarantine.ttl_seconds']} seconds`;
    let expired: Array<{ import_id: string; locators: unknown }>;
    try {
      expired = (await sql<{ import_id: string; locators: unknown }>`
        select import_id, locators from retention.import_quarantine_expired(${olderThan}::interval)
         where tenant_id = ${tenantId}::uuid and domain_id = ${domainId}::uuid
         limit 200`.execute(this.db)).rows;
    } catch (e) {
      report.poisonItems.push({ kind: 'import_quarantine', ref: `${tenantId}/${domainId}`, reason: `the import ledger's expired quarantines could not be read; nothing of them was removed this round: ${describe(e)}` });
      return;
    }
    for (const row of expired) {
      const locators = Array.isArray(row.locators) ? (row.locators as unknown[]).filter((l): l is string => typeof l === 'string') : [];
      let failed = 0;
      for (const locator of locators) {
        try {
          await this.vault.tombstone('quarantine', scope, locator);
          report.importQuarantineTombstoned += 1;
        } catch (e) {
          failed += 1;
          report.poisonItems.push({ kind: 'import_quarantine', ref: `${row.import_id}:${locator}`, reason: `the quarantine copy of an expired import could not be removed: ${describe(e)}` });
        }
      }
      if (failed > 0) continue; // not marked: the next sweep finds the import again
      try {
        await sql`select retention.mark_import_quarantine_swept(${row.import_id}::uuid)`.execute(this.db);
        report.importQuarantineSwept += 1;
      } catch (e) {
        report.poisonItems.push({ kind: 'import_quarantine', ref: row.import_id, reason: `the copies were removed but the sweep could not be recorded on the import: ${describe(e)}` });
      }
    }
  }

  private async governed(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    domainId: string,
    correlationId: string,
    purposeId: string,
    action: string,
    objectType: string,
    objectId: string,
    body: (cap: ReturnType<typeof ObservationCapability.acquisition>) => Promise<void>,
  ): Promise<void> {
    const envelope: Envelope = {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId,
      principal_id: `principal:${principal.principalId}`, purpose_id: purposeId,
      action, side_effect_class: 'reversible', consequence_class: 'C1',
      object_type: objectType, object_id: objectId, schema_version: 'v1',
      issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: `sweep-${correlationId.slice(0, 8)}`,
      payload_digest: EMPTY_PAYLOAD_DIGEST,
    };
    await this.pipeline.write(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action, objectType, objectId },
      ObservationCapability.acquisition,
      async (cap) => {
        await body(cap);
        return { result: {}, targetType: objectType, targetId: objectId, targetVersion: '1', outboxEvent: null };
      },
    );
  }
}

/** C17: a `.tmp-` anywhere makes a temp, whatever precedes it; then the exact staged shape; anything else is a plain name (a locator's id, or junk the orphan rule reports). */
function classifyName(name: string): NameClass {
  if (name.includes('.tmp-')) return { kind: 'temp' };
  const staged = STAGED_NAME_RE.exec(name);
  if (staged !== null) return { kind: 'staged', base: staged[1] as string, attemptId: staged[2] as string };
  return { kind: 'plain', base: name };
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 300) : 'unknown failure';
}
