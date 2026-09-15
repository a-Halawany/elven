/**
 * Evidence vault — PHASE1_PLAN §9, acceptance A2/A7.
 *
 * TWO SEPARATE ROOTS, NEVER ONE WITH TWO FOLDERS. Quarantined bytes and admitted
 * bytes live in different volumes (`eye-quarantine` / `eye-evidence`; EXC-P1-002
 * records that this is the LOCAL profile, not the production storage
 * architecture). The service refuses to start if the two roots are equal or if
 * either contains the other, because "separate" that is only separate by
 * convention is not separate.
 *
 * CP-6 B11 (0070 §2, §3) adds two more roots under the same discipline: the
 * ARCHIVE tier — a second root of blob tiers, the bytes keeping their opaque scoped
 * locator so every check below applies unchanged (D2) — and the EXPORT namespace,
 * where a customer export package lives as `<tenant>/<domain>/<action_id>/` with
 * `manifest.json` and one `<manifest_id>.bin` per object (D5). All four roots must
 * be separate and non-nested.
 *
 * CP-6 B12: the staging discipline applies to both blob roots — a restore stages
 * its hot copy under the attempt's name in the evidence root and publishes it
 * after the commit that recorded the move. The generic forms (`stagedCopiesIn`,
 * `publishCopy`, `removeStagedIn`, `removeAllStagedIn`, `readTiered`) take the
 * root; the archive-named forms of B11 keep their contracts and delegate.
 *
 * THE LOCATOR IS OPAQUE AND SCOPED: `<tenant>/<domain>/<random-uuid>`. It is NOT
 * the digest. A digest-named path would create a global content namespace in
 * which one tenant could probe for another tenant's bytes by asking for a hash
 * it already knows — so digest lookups are scoped per domain (the manifest
 * index), and the same bytes seen in two domains are two blobs.
 *
 * EVERY operation validates the requester's resolved scope against the locator's
 * own scope segments, independently of RLS and of any database check. Two
 * boundaries that must both agree, not one boundary consulted twice.
 *
 * The digest is verified BEFORE storage, AFTER storage, and again ON EVERY READ.
 * A read whose bytes no longer hash to the manifest's digest fails closed with an
 * integrity error and never returns bytes.
 */
import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsc } from 'node:fs';
import { access, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import * as fault from '../fault-injection.js';

/** The blob tiers: three-segment locators under three separate roots. */
export type VaultName = 'quarantine' | 'evidence' | 'archive';
/** The package namespace: `<tenant>/<domain>/<action_id>/<name>` under its own root (0070 §3). */
export type PackageVault = 'export';

export interface VaultScope {
  tenantId: string;
  domainId: string;
}

export interface StoredBlob {
  locator: string;
  contentDigest: string;
  byteLength: number;
}

/** A vault failure that must never disclose whether some other blob exists. */
export class VaultIntegrityError extends Error {
  constructor(
    readonly reason: 'missing' | 'corrupt' | 'scope' | 'oversize' | 'exists' | 'unavailable',
    message: string,
  ) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A package file: the manifest, or one object's bytes named by its manifest id. Nothing else is ever written or read under a package. */
const PACKAGE_FILE_RE = /^(manifest\.json|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin)$/;
/**
 * B12 (C17): the temp name of an interrupted write — `<uuid>.tmp-<uuid>` for a store, `<uuid>.staging-<attempt>.tmp-<uuid>` for a staged
 * copy (the temp lives beside the file it was to become). The sweeper removes these and nothing else by name.
 */
const TEMP_FILE_RE = /^[0-9a-f-]{36}(\.staging-[0-9a-f-]{36})?\.tmp-[0-9a-f-]{36}$/;

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

@Injectable()
export class VaultService {
  private readonly roots: Record<VaultName | PackageVault, string>;
  private readonly maxBytes: number;

  constructor(@Inject(EYE_CONFIG) cfg: EyeConfig) {
    const quarantine = resolve(cfg['eye.vault.quarantine_root']);
    const evidence = resolve(cfg['eye.vault.evidence_root']);
    if (quarantine === evidence || contains(quarantine, evidence) || contains(evidence, quarantine)) {
      // Fail at construction, not at the first admission. A shared or nested root
      // would mean quarantined bytes and admitted bytes share a volume, which is
      // the one thing §9 forbids.
      throw new Error(
        'vault configuration invalid: the quarantine and evidence roots must be two separate, non-nested locations',
      );
    }
    const archive = resolve(cfg['eye.vault.archive_root']);
    const exportRoot = resolve(cfg['eye.vault.export_root']);
    // B11: the archive tier and the export namespace are separate from each other and from the two blob roots above — the
    // same rule, pairwise over all four (the quarantine/evidence pair keeps its own message above).
    const all: Array<[string, string]> = [['quarantine', quarantine], ['evidence', evidence], ['archive', archive], ['export', exportRoot]];
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i]![1]; const b = all[j]![1];
        if (a === b || contains(a, b) || contains(b, a)) {
          throw new Error(
            'vault configuration invalid: the archive and export roots must be separate, non-nested locations, apart from each other and from the quarantine and evidence roots',
          );
        }
      }
    }
    this.roots = { quarantine, evidence, archive, export: exportRoot };
    this.maxBytes = cfg['eye.vault.max_blob_bytes'];
  }

  /** Create the four roots. Called once at module init; idempotent. */
  async ensureRoots(): Promise<void> {
    await mkdir(this.roots.quarantine, { recursive: true, mode: 0o700 });
    await mkdir(this.roots.evidence, { recursive: true, mode: 0o700 });
    await mkdir(this.roots.archive, { recursive: true, mode: 0o700 });
    await mkdir(this.roots.export, { recursive: true, mode: 0o700 });
  }

  newLocator(scope: VaultScope): string {
    return `${scope.tenantId}/${scope.domainId}/${randomUUID()}`;
  }

  /**
   * Resolve a locator to an absolute path, refusing anything whose scope segments
   * are not exactly this requester's scope. This is the check that makes a
   * foreign-scope locator useless even to a caller that obtained one.
   */
  private pathFor(vault: VaultName, locator: string, scope: VaultScope): string {
    const parts = locator.split('/');
    if (parts.length !== 3) throw new VaultIntegrityError('scope', 'locator is not a three-segment vault path');
    const [tenant, domain, id] = parts as [string, string, string];
    if (tenant !== scope.tenantId || domain !== scope.domainId) {
      throw new VaultIntegrityError('scope', 'locator scope does not match the requester scope');
    }
    if (!UUID_RE.test(tenant) || !UUID_RE.test(domain) || !UUID_RE.test(id)) {
      throw new VaultIntegrityError('scope', 'locator segments are not opaque identifiers');
    }
    const root = this.roots[vault];
    const full = resolve(root, tenant, domain, id);
    // Defence in depth behind the UUID check: a resolved path that escapes the
    // root is refused rather than trusted because the segments "looked fine".
    if (!contains(root, full)) {
      throw new VaultIntegrityError('scope', 'resolved path escapes the vault root');
    }
    return full;
  }

  /**
   * B12: the domain's directory under a blob root, `<root>/<tenant>/<domain>` — the requester's own scope segments, opaque
   * identifiers, containment re-checked; the sweeper's walk and the inventory list it, and never anything above it.
   */
  private domainDir(vault: VaultName, scope: VaultScope): string {
    if (!UUID_RE.test(scope.tenantId) || !UUID_RE.test(scope.domainId)) {
      throw new VaultIntegrityError('scope', 'scope segments are not opaque identifiers');
    }
    const root = this.roots[vault];
    const dir = resolve(root, scope.tenantId, scope.domainId);
    if (!contains(root, dir) || dir === root) throw new VaultIntegrityError('scope', 'resolved domain directory escapes the vault root');
    return dir;
  }

  /**
   * B11: the package directory of an action under the export root, `<export_root>/<tenant>/<domain>/<action_id>`, with the
   * same scope discipline as a locator: the requester's own scope segments, opaque identifiers, containment re-checked.
   */
  private packageDir(scope: VaultScope, actionId: string): string {
    if (!UUID_RE.test(scope.tenantId) || !UUID_RE.test(scope.domainId) || !UUID_RE.test(actionId)) {
      throw new VaultIntegrityError('scope', 'package segments are not opaque identifiers');
    }
    const root = this.roots.export;
    const dir = resolve(root, scope.tenantId, scope.domainId, actionId);
    if (!contains(resolve(root, scope.tenantId, scope.domainId), dir) || dir === resolve(root, scope.tenantId, scope.domainId)) {
      throw new VaultIntegrityError('scope', 'resolved package path escapes the export root');
    }
    return dir;
  }

  /** A file of a package: `manifest.json` or `<manifest_id>.bin`, contained in the package directory. */
  private pathForPackage(scope: VaultScope, actionId: string, name: string): string {
    if (!PACKAGE_FILE_RE.test(name)) throw new VaultIntegrityError('scope', 'a package file is manifest.json or <manifest id>.bin');
    const dir = this.packageDir(scope, actionId);
    const full = resolve(dir, name);
    if (!contains(dir, full) || full === dir) throw new VaultIntegrityError('scope', 'resolved path escapes the package directory');
    return full;
  }

  /**
   * §5 steps 5–6: store exact original bytes, fsync, RE-READ, and compare the
   * digest. Atomic create-if-absent via a temp file plus rename, so a partially
   * written blob is never reachable under its locator (F12/F13).
   */
  async store(
    vault: VaultName,
    scope: VaultScope,
    bytes: Uint8Array,
    expectedDigest?: string,
  ): Promise<StoredBlob> {
    if (bytes.byteLength > this.maxBytes) {
      throw new VaultIntegrityError('oversize', 'payload exceeds the configured vault blob ceiling');
    }
    // Verified BEFORE storage: bytes we are about to store must be the bytes we
    // were handed.
    const digest = sha256(bytes);
    if (expectedDigest !== undefined && expectedDigest !== digest) {
      throw new VaultIntegrityError('corrupt', 'supplied digest does not describe the supplied bytes');
    }

    const locator = this.newLocator(scope);
    const full = this.pathFor(vault, locator, scope);
    await mkdir(dirname(full), { recursive: true, mode: 0o700 });
    const tmp = `${full}.tmp-${randomUUID()}`;

    const handle = await open(tmp, 'wx', 0o600);
    try {
      fault.at('f12.quarantine_write_partial');
      fault.at('f17.candidate_write_partial');
      await handle.write(bytes);
      await handle.sync(); // fsync BEFORE the rename — a durable temp, then a durable name
    } finally {
      await handle.close();
    }
    fault.at('f13.after_write_before_rename');
    fault.at('f14.after_fsync_before_reread');
    fault.at('f18.after_candidate_fsync_before_reread');

    // create-if-absent: the locator is a fresh random uuid, so an existing target
    // is a defect, not a collision to overwrite.
    try {
      await access(full, fsc.F_OK);
      await rm(tmp, { force: true });
      throw new VaultIntegrityError('exists', 'vault locator already occupied');
    } catch (e) {
      if (e instanceof VaultIntegrityError) throw e;
      // ENOENT is the expected case — continue.
    }
    await rename(tmp, full);
    await syncDir(dirname(full));

    // Verified AFTER storage, by re-reading what is actually on disk.
    const readBack = await readFile(full);
    const storedDigest = sha256(readBack);
    if (storedDigest !== digest || readBack.byteLength !== bytes.byteLength) {
      await rm(full, { force: true });
      throw new VaultIntegrityError('corrupt', 'stored bytes do not match the bytes presented for storage');
    }
    fault.at('f15.digest_mismatch');
    fault.at('f19.candidate_digest_mismatch');
    return { locator, contentDigest: digest, byteLength: bytes.byteLength };
  }

  /**
   * §5 step 8a/8b: create the admitted candidate in the EVIDENCE vault as a copy
   * of the quarantine original, fsync it, re-read it, and verify its digest
   * against the original. Deliberately a copy and not a move: the quarantine
   * original stays until the admission transaction has committed (8f), so a
   * failure at any point between here and commit loses nothing.
   */
  async createAdmittedCandidate(
    scope: VaultScope,
    quarantineLocator: string,
    expectedDigest: string,
  ): Promise<StoredBlob> {
    const source = this.pathFor('quarantine', quarantineLocator, scope);
    let bytes: Buffer;
    try {
      bytes = await readFile(source);
    } catch {
      throw new VaultIntegrityError('missing', 'quarantine original is not retrievable');
    }
    if (sha256(bytes) !== expectedDigest) {
      throw new VaultIntegrityError('corrupt', 'quarantine original no longer matches its recorded digest');
    }
    return this.store('evidence', scope, bytes, expectedDigest);
  }

  /**
   * B11 (0070 §2; D3): copy a blob from one tier to another UNDER THE SAME LOCATOR — the admission's own discipline
   * (read the source, verify its digest, temp file, write, fsync, rename, fsync the directory, re-read, compare). The
   * source is untouched: the caller removes it only after the transaction that recorded the move has committed. A
   * target already present with the same digest is returned as it is with `created: false` (a retry after a crash between
   * the copy and the record — or another action's committed copy, which is NOT this caller's to remove); one with a
   * different digest is a defect and refused. A copy THIS call created is `created: true`, and a failure at any point
   * after the rename (the directory fsync, the re-read, an injected fault) removes it again: a file this call put there
   * never survives the call's failure.
   */
  async copyBlob(
    from: VaultName,
    to: VaultName,
    scope: VaultScope,
    locator: string,
    expectedDigest: string,
    staging?: { attemptId: string },
  ): Promise<StoredBlob & { created: boolean }> {
    const source = this.pathFor(from, locator, scope);
    const published = this.pathFor(to, locator, scope);
    // B11 closure (0071): an archive copy is STAGED under the creating execution ATTEMPT's own name and published under the locator only
    // after the commit that recorded the move — so a copy whose record did not commit is never adoptable by another execution, and a
    // rollback removes only the file bearing its own attempt's name (a second attempt of the same action, admitted after the first's
    // backend was lost, has its own). The published locator is still the idempotent target: a copy already there under the digest wins.
    // B12: the staged file lives in the `to` root — the archive root for an archive, the evidence root for a restore (D2).
    const full = staging !== undefined ? this.stagingPathFor(to, locator, scope, staging.attemptId) : published;
    let bytes: Buffer;
    try {
      bytes = await readFile(source);
    } catch {
      throw new VaultIntegrityError('missing', `${from} bytes are not retrievable`);
    }
    if (sha256(bytes) !== expectedDigest) {
      throw new VaultIntegrityError('corrupt', `${from} bytes no longer match their recorded digest`);
    }
    // An existing published target: idempotent when it is the same bytes (not created by this call), a defect otherwise.
    try {
      const present = await readFile(published);
      if (sha256(present) === expectedDigest && present.byteLength === bytes.byteLength) {
        return { locator, contentDigest: expectedDigest, byteLength: present.byteLength, created: false };
      }
      throw new VaultIntegrityError('exists', `the ${to} locator is occupied by different bytes`);
    } catch (e) {
      if (e instanceof VaultIntegrityError) throw e;
      // ENOENT is the expected case — continue.
    }
    await mkdir(dirname(full), { recursive: true, mode: 0o700 });
    const tmp = `${full}.tmp-${randomUUID()}`;
    const handle = await open(tmp, 'wx', 0o600);
    try {
      // The B11 fault points keep their names and fire for a restore's copy too (B12): the boundary is the same — before the write, and
      // after the rename before the port records the move — whichever root the copy is going to.
      fault.at('b11.archive_copy_partial');
      await handle.write(bytes);
      await handle.sync();
    } catch (e) {
      await handle.close();
      await rm(tmp, { force: true });
      throw e;
    }
    await handle.close();
    await rename(tmp, full);
    // From here the copy exists under its locator: whatever fails before the call returns removes it again (the idempotent
    // early return above precedes the write, so the file is this call's own).
    try {
      await syncDir(dirname(full));
      fault.at('b11.archive_after_copy_before_record');
      await fault.pause('b11.archive_after_copy_before_record'); // the hold of the B11-F1 interleaving: the copy exists, the move not yet recorded
      const readBack = await readFile(full);
      if (sha256(readBack) !== expectedDigest || readBack.byteLength !== bytes.byteLength) {
        throw new VaultIntegrityError('corrupt', `the ${to} copy does not match the bytes copied`);
      }
    } catch (e) {
      await rm(full, { force: true }).catch(() => undefined);
      throw e;
    }
    return { locator, contentDigest: expectedDigest, byteLength: bytes.byteLength, created: true };
  }

  /**
   * Every retrieval re-verifies the digest. A missing blob and a corrupt blob
   * both fail closed with an audited integrity error and identical externally
   * visible shape — a denied or absent read must not disclose which it was (A7).
   */
  async read(
    vault: VaultName,
    scope: VaultScope,
    locator: string,
    expectedDigest: string,
  ): Promise<{ bytes: Buffer; contentDigest: string }> {
    const full = this.pathFor(vault, locator, scope);
    let bytes: Buffer;
    try {
      bytes = await readFile(full);
    } catch {
      throw new VaultIntegrityError('missing', 'evidence bytes are not retrievable');
    }
    const digest = sha256(bytes);
    if (digest !== expectedDigest) {
      throw new VaultIntegrityError('corrupt', 'stored bytes do not match the recorded content digest');
    }
    return { bytes, contentDigest: digest };
  }

  /**
   * The staging name of a copy (0071; both roots since B12): the locator's own path in the root the copy is going to, with the creating
   * execution attempt's id — adoptable by no other execution, removed by no other attempt.
   */
  private stagingPathFor(vault: VaultName, locator: string, scope: VaultScope, attemptId: string): string {
    if (!UUID_RE.test(attemptId)) throw new VaultIntegrityError('scope', 'the staging owner is not an opaque identifier');
    return `${this.pathFor(vault, locator, scope)}.staging-${attemptId}`;
  }

  /** The names that are staged copies of a locator, and nothing else (C17): `<id>.staging-<attempt>` EXACTLY — a staged copy's own temp file (`….staging-<attempt>.tmp-<uuid>`) is a temp, never a staged copy. */
  private stagedNamesOf(full: string, names: string[]): string[] {
    const re = new RegExp(`^${basename(full)}\\.staging-[0-9a-f-]{36}$`);
    return names.filter((n) => re.test(n)).sort();
  }

  /**
   * The staged copies of a locator in a root (the file names), whatever attempt staged them. A directory that is not there holds none; a
   * directory that cannot be LISTED is an error ('unavailable'), never an empty answer — a deletion's cleanup and its verification must not
   * conclude "nothing staged" from a listing that failed.
   */
  async stagedCopiesIn(vault: VaultName, scope: VaultScope, locator: string): Promise<string[]> {
    const full = this.pathFor(vault, locator, scope);
    let names: string[];
    try { names = await readdir(dirname(full)); }
    catch (e) {
      if ((e as { code?: unknown })?.code === 'ENOENT') return [];
      throw new VaultIntegrityError('unavailable', `the ${vault} directory of the locator cannot be listed`);
    }
    return this.stagedNamesOf(full, names);
  }

  /** The staged copies of a locator in the ARCHIVE root (B11's form). */
  async stagedCopies(scope: VaultScope, locator: string): Promise<string[]> {
    return this.stagedCopiesIn('archive', scope, locator);
  }

  /**
   * PUBLISH a staged copy under its locator in a root (0071; both roots since B12) — after the commit that recorded the move: a rename in
   * the same directory, the directory synced, the digest re-read. With an attempt id, that attempt's own file; without one (the retry
   * route), any staged copy of the locator whose bytes carry the manifest's digest. Idempotent: a copy already published under the digest
   * wins ('already'); a locator occupied by different bytes is a defect; no staged copy to publish is 'missing'. Once published, every other
   * staged copy of the locator in that root is redundant and removed (an attempt still running removes its own by name anyway, and finds
   * the locator published).
   */
  async publishCopy(vault: VaultName, scope: VaultScope, locator: string, expectedDigest: string, attemptId: string | null): Promise<'published' | 'already'> {
    const tier = vault === 'archive' ? 'archive' : 'hot';
    const full = this.pathFor(vault, locator, scope);
    const already = await readFile(full).then((present) => sha256(present) === expectedDigest ? true : null, () => false);
    if (already === null) throw new VaultIntegrityError('exists', `the ${vault} locator is occupied by different bytes`);
    if (already) { await this.removeAllStagedIn(vault, scope, locator); return 'already'; }
    let staged: string | null = null;
    if (attemptId !== null) staged = this.stagingPathFor(vault, locator, scope, attemptId);
    else {
      for (const name of await this.stagedCopiesIn(vault, scope, locator)) {
        const candidate = join(dirname(full), name);
        const ok = await readFile(candidate).then((b) => sha256(b) === expectedDigest, () => false);
        if (ok) { staged = candidate; break; }
      }
    }
    if (staged === null) throw new VaultIntegrityError('missing', `the staged ${tier} copy is not present`);
    let bytes: Buffer;
    try { bytes = await readFile(staged); } catch { throw new VaultIntegrityError('missing', `the staged ${tier} copy is not present`); }
    if (sha256(bytes) !== expectedDigest) throw new VaultIntegrityError('corrupt', `the staged ${tier} copy does not match the manifest digest`);
    // B12 (C15): the hot publish of a restore after the commit — the fault fires once, so the retry route's publish succeeds.
    if (vault === 'evidence') fault.at('b12.restore_publish_fail');
    await rename(staged, full);
    await syncDir(dirname(full));
    const readBack = await readFile(full);
    if (sha256(readBack) !== expectedDigest) throw new VaultIntegrityError('corrupt', `the published ${tier} copy does not match the manifest digest`);
    await this.removeAllStagedIn(vault, scope, locator);
    return 'published';
  }

  /** PUBLISH a staged ARCHIVE copy under its locator (B11's form). */
  async publishArchiveCopy(scope: VaultScope, locator: string, expectedDigest: string, attemptId: string | null): Promise<'published' | 'already'> {
    return this.publishCopy('archive', scope, locator, expectedDigest, attemptId);
  }

  /** Remove the staged copy of ONE execution attempt in a root (its own file; nothing another execution could have adopted, nothing another attempt owns). */
  async removeStagedIn(vault: VaultName, scope: VaultScope, locator: string, attemptId: string): Promise<void> {
    const staged = this.stagingPathFor(vault, locator, scope, attemptId);
    await rm(staged, { force: true });
    await syncDir(dirname(staged)).catch(() => undefined);
  }

  /** Remove ONE attempt's staged copy in the ARCHIVE root (B11's form). */
  async removeStaged(scope: VaultScope, locator: string, attemptId: string): Promise<void> {
    await this.removeStagedIn('archive', scope, locator, attemptId);
  }

  /** The staged copies of a locator in a root retired, whatever attempt staged them (a deletion retires them with the bytes; a publish retires the rest). A directory that cannot be listed is an error, never "none removed". */
  async removeAllStagedIn(vault: VaultName, scope: VaultScope, locator: string): Promise<number> {
    const full = this.pathFor(vault, locator, scope);
    const names = await this.stagedCopiesIn(vault, scope, locator);
    let n = 0;
    for (const name of names) { await rm(join(dirname(full), name), { force: true }); n += 1; }
    if (n > 0) await syncDir(dirname(full)).catch(() => undefined);
    return n;
  }

  /** The staged copies of a locator in the ARCHIVE root retired (B11's form). */
  async removeAllStaged(scope: VaultScope, locator: string): Promise<number> {
    return this.removeAllStagedIn('archive', scope, locator);
  }

  /**
   * A read from a blob TIER that also finds a copy recorded but not yet published (the instant between the commit and the publish, or a
   * publish that failed and awaits its retry): the locator first; then any staged copy of the locator in that root whose bytes match the
   * manifest's digest — the digest is the authority, not the name; then the locator once more (the publish may have happened between the
   * two reads); and last the OTHER blob root's published copy (`fallback`: the hot copy an archive keeps until its publish succeeds, the
   * archive copy a restore keeps likewise — the retry route copies it again) — served under the digest, the tier ledger's record standing.
   * Each step falls through on 'missing' ONLY (C16): a corrupt published copy propagates as the integrity failure it is.
   */
  async readTiered(vault: 'evidence' | 'archive', scope: VaultScope, locator: string, expectedDigest: string): Promise<{ bytes: Buffer; contentDigest: string; source: 'published' | 'staged' | 'fallback' }> {
    const other: 'evidence' | 'archive' = vault === 'archive' ? 'evidence' : 'archive';
    try { return { ...(await this.read(vault, scope, locator, expectedDigest)), source: 'published' }; }
    catch (e) { if (!(e instanceof VaultIntegrityError) || e.reason !== 'missing') throw e; }
    const full = this.pathFor(vault, locator, scope);
    let names: string[] = [];
    try { names = await readdir(dirname(full)); } catch { names = []; }
    for (const name of this.stagedNamesOf(full, names)) {
      try {
        const bytes = await readFile(join(dirname(full), name));
        if (sha256(bytes) === expectedDigest) return { bytes, contentDigest: expectedDigest, source: 'staged' };
      } catch { /* the publish may have moved it meanwhile */ }
    }
    try { return { ...(await this.read(vault, scope, locator, expectedDigest)), source: 'published' }; }
    catch (e) { if (!(e instanceof VaultIntegrityError) || e.reason !== 'missing') throw e; }
    return { ...(await this.read(other, scope, locator, expectedDigest)), source: 'fallback' };
  }

  /** A read from the ARCHIVE tier (B11's form): `readTiered('archive', …)`, the hot fallback named as such. */
  async readArchived(scope: VaultScope, locator: string, expectedDigest: string): Promise<{ bytes: Buffer; contentDigest: string; source: 'published' | 'staged' | 'hot' }> {
    const r = await this.readTiered('archive', scope, locator, expectedDigest);
    return { bytes: r.bytes, contentDigest: r.contentDigest, source: r.source === 'fallback' ? 'hot' : r.source };
  }

  /**
   * B12: the domain's inventory in a blob root, by name class — blobs under their locators, staged copies, temp files of interrupted
   * writes — from one listing of `<root>/<tenant>/<domain>`. A name containing `.tmp-` is a temp whatever precedes it (C17); one containing
   * `.staging-` is a staged copy; anything else is a blob. A directory that is not there holds nothing; one that cannot be listed is an
   * error ('unavailable'), never zeros.
   */
  async domainInventory(vault: VaultName, scope: VaultScope): Promise<{ blobs: number; staged: number; temp: number }> {
    const names = await this.listDomain(vault, scope);
    const out = { blobs: 0, staged: 0, temp: 0 };
    for (const n of names) {
      if (n.includes('.tmp-')) out.temp += 1;
      else if (n.includes('.staging-')) out.staged += 1;
      else out.blobs += 1;
    }
    return out;
  }

  /** B12: the raw names in the domain's directory of a blob root (the sweeper's walk); `[]` when the directory is not there, 'unavailable' when it cannot be listed. */
  async listDomain(vault: VaultName, scope: VaultScope): Promise<string[]> {
    const dir = this.domainDir(vault, scope);
    try { return await readdir(dir); }
    catch (e) {
      if ((e as { code?: unknown })?.code === 'ENOENT') return [];
      throw new VaultIntegrityError('unavailable', `the ${vault} directory of the domain cannot be listed`);
    }
  }

  /**
   * B12 (D6): remove a TEMP file of an interrupted write by its name — `<uuid>.tmp-<uuid>`, or a staged copy's own `<uuid>.staging-<attempt>.tmp-<uuid>`
   * — in the domain's directory of a blob root; nothing else is removable by name (a temp never had a locator, so nothing could have
   * referenced it). The name is matched exactly and the resolved path re-checked for containment; idempotent.
   */
  async removeTempFile(vault: VaultName, scope: VaultScope, name: string): Promise<void> {
    if (!TEMP_FILE_RE.test(name)) throw new VaultIntegrityError('scope', 'a temp file is <uuid>.tmp-<uuid> or <uuid>.staging-<attempt>.tmp-<uuid>');
    const dir = this.domainDir(vault, scope);
    const full = resolve(dir, name);
    if (!contains(dir, full) || full === dir || dirname(full) !== dir) throw new VaultIntegrityError('scope', 'resolved path escapes the domain directory');
    await rm(full, { force: true });
    await syncDir(dir).catch(() => undefined);
  }

  /**
   * Governed deletion (§9): the BYTES go, the manifest and its tombstone stay.
   * Idempotent by construction so the sweeper can complete an interrupted
   * tombstone (F26/F27) without ever double-deleting or reporting a failure.
   */
  async tombstone(vault: VaultName, scope: VaultScope, locator: string): Promise<void> {
    const full = this.pathFor(vault, locator, scope);
    fault.at('f27.during_quarantine_tombstone');
    await rm(full, { force: true });
    await syncDir(dirname(full)).catch(() => undefined);
  }

  /** Orphan detection input for the sweeper: does this locator still have bytes? */
  async exists(vault: VaultName, scope: VaultScope, locator: string): Promise<boolean> {
    try {
      await stat(this.pathFor(vault, locator, scope));
      return true;
    } catch {
      return false;
    }
  }

  /** Test-only corruption hook used by the A7 corrupt-blob case. */
  async overwriteForIntegrityTest(vault: VaultName, scope: VaultScope, locator: string, bytes: Uint8Array): Promise<void> {
    await writeFile(this.pathFor(vault, locator, scope), bytes);
  }

  rootFor(vault: VaultName | PackageVault): string {
    return this.roots[vault];
  }

  /**
   * B13 (D5, C13): whether a path lies OUTSIDE every one of the four roots — neither a root, nor inside one, nor containing
   * one (the constructor's pairwise rule, applied to a fifth location). A transfer station — a directory the product writes
   * export packages into and reads receipts from — must lie outside the vault entirely, so a station can never alias a tier.
   * The caller passes an absolute path it has `realpath`'d (at the declaration, and again before every write and read: a
   * symlink turned into a vault root since is refused then); the roots are compared as configured.
   */
  isOutsideRoots(path: string): boolean {
    const p = resolve(path);
    return !Object.values(this.roots).some((r) => r === p || contains(r, p) || contains(p, r));
  }

  // ───────────────────────── B11: the export namespace (0070 §3; D5) ─────────────────────────

  /**
   * Write one file of a package with the store discipline (temp `wx` 0o600, write, fsync, rename, fsync the directory,
   * re-read, compare). A file already present is a defect: a package is built once, under one action — the builder
   * clears the package directory of an interrupted earlier build (`removePackage`) before its first write, so an
   * `exists` here is a concurrent build of the same action, never a leftover. A write that fails leaves no temp file.
   */
  async writePackageFile(scope: VaultScope, actionId: string, name: string, bytes: Uint8Array): Promise<{ contentDigest: string; byteLength: number }> {
    const full = this.pathForPackage(scope, actionId, name);
    await mkdir(dirname(full), { recursive: true, mode: 0o700 });
    try {
      await access(full, fsc.F_OK);
      throw new VaultIntegrityError('exists', 'the package file is already present');
    } catch (e) {
      if (e instanceof VaultIntegrityError) throw e;
      // ENOENT is the expected case — continue.
    }
    const digest = sha256(bytes);
    const tmp = `${full}.tmp-${randomUUID()}`;
    const handle = await open(tmp, 'wx', 0o600);
    try {
      await handle.write(bytes);
      await handle.sync();
    } catch (e) {
      await handle.close();
      await rm(tmp, { force: true }).catch(() => undefined);
      throw e;
    }
    await handle.close();
    await rename(tmp, full);
    try {
      await syncDir(dirname(full));
      const readBack = await readFile(full);
      if (sha256(readBack) !== digest || readBack.byteLength !== bytes.byteLength) {
        throw new VaultIntegrityError('corrupt', 'the package file written does not match the bytes presented');
      }
    } catch (e) {
      await rm(full, { force: true }).catch(() => undefined);
      throw e;
    }
    return { contentDigest: digest, byteLength: bytes.byteLength };
  }

  /** One file of a package, as stored; `missing` when it is not there. */
  async readPackageFile(scope: VaultScope, actionId: string, name: string): Promise<Buffer> {
    const full = this.pathForPackage(scope, actionId, name);
    try {
      return await readFile(full);
    } catch {
      throw new VaultIntegrityError('missing', 'the package file is not retrievable');
    }
  }

  /** The names in a package directory (everything there, listed or not — the verifier is what says which is which); `[]` when absent. */
  async listPackage(scope: VaultScope, actionId: string): Promise<string[]> {
    try {
      return (await readdir(this.packageDir(scope, actionId))).sort();
    } catch {
      return [];
    }
  }

  async packageExists(scope: VaultScope, actionId: string): Promise<boolean> {
    try {
      await stat(this.packageDir(scope, actionId));
      return true;
    } catch {
      return false;
    }
  }

  /** Remove a package directory whole (after the revocation committed, or to clean up a rolled-back build); idempotent. */
  async removePackage(scope: VaultScope, actionId: string): Promise<void> {
    const dir = this.packageDir(scope, actionId);
    await rm(dir, { recursive: true, force: true });
    await syncDir(dirname(dir)).catch(() => undefined);
  }
}

/**
 * True when `child` is `parent` or lies inside it. Used both to reject a
 * quarantine/evidence root that contains the other and to reject a resolved blob
 * path that escapes its root.
 */
function contains(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  if (rel === '') return true;
  // An absolute relative path means the two share no common root at all; a `..`
  // first segment means the child climbs out of the parent.
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}

/** fsync the directory so the RENAME itself is durable, not only the file. */
async function syncDir(dir: string): Promise<void> {
  const handle = await open(dir, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export { join as joinVaultPath };
