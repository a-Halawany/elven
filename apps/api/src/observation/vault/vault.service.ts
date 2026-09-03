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
import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import * as fault from '../fault-injection.js';

export type VaultName = 'quarantine' | 'evidence';

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
    readonly reason: 'missing' | 'corrupt' | 'scope' | 'oversize' | 'exists',
    message: string,
  ) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

@Injectable()
export class VaultService {
  private readonly roots: Record<VaultName, string>;
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
    this.roots = { quarantine, evidence };
    this.maxBytes = cfg['eye.vault.max_blob_bytes'];
  }

  /** Create both roots. Called once at module init; idempotent. */
  async ensureRoots(): Promise<void> {
    await mkdir(this.roots.quarantine, { recursive: true, mode: 0o700 });
    await mkdir(this.roots.evidence, { recursive: true, mode: 0o700 });
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

  rootFor(vault: VaultName): string {
    return this.roots[vault];
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
