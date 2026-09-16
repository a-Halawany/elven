/**
 * THE DELIVERY EXECUTORS of a customer export (CP-6 B13; D5, D6, D8): what leaves the product once the governed delivery
 * act has passed its gates (retention.begin_export_delivery — the package verified, unrevoked, unexpired; the destination
 * active; the rights still confirmed; the signing-key gate of C8) and before the outcome is recorded
 * (retention.record_export_delivery). Two kinds of destination, one archive:
 *
 *   A TRANSFER STATION (ES-53-004, NZ-20: the disconnected / air-gap path) is a directory the product WRITES packages into
 *   and READS receipts from — `<endpoint>/<tenant>/<domain>/<action_id>/`: `package.tar` (the archive, content-addressed:
 *   an identical file already there is accepted, a differing one refused — the delivery `failed` with class `write_failed`,
 *   an integrity failure at the station, C7), `package.sig` (the signature block with, for /2, the key's public PEM and
 *   purpose — content-addressed likewise) and `delivery.json` (the exchange identity of THIS attempt — replaced per attempt;
 *   the recipient copies its delivery_id and attempt into the receipt, which binds the receipt to the attempt). Each file is
 *   written temp + fsync + rename + dirsync (the vault's discipline). The receipt is read back from `receipt.json` in the same
 *   directory by the collect act: containment re-checked, at most 64 KiB, a JSON object.
 *
 *   An HTTPS destination (the production kind) is delivered by the delivery egress (http-client.ts `deliver`): the archive
 *   POSTed once to the declared endpoint with the package's digests and signature in headers and the destination's credential
 *   — a value the deployment binds under the destination's reference, resolved at the moment of the delivery and never
 *   recorded — on that one hop; a 3xx is not followed. The receipt is the response body parsed as JSON. Fixed policy:
 *   30 s, a response of at most 1 MiB.
 *
 * Every outcome is a RECORDED fact ("preserve the request and evidence", DP-47-005): `delivered` (a station's receipt comes
 * later; an https answer that does not verify), `acknowledged` (the answer names both digests with verified: true),
 * `mismatched` (it names other digests, or verified: false — the exchange denied), `failed` with its class
 * (`credential_unbound` before any egress; `egress_refused` — the address not public, a redirect; `transport` — the host
 * unresolved, the connection, a non-2xx answer; `receipt_invalid` — a body that is not a JSON object; `write_failed` — the
 * station). The executors run INSIDE the governed write (C6): the controller removes the station paths an attempt created
 * when the commit fails after them.
 *
 * Nothing here logs, records or returns a credential VALUE: the receipt of a failed https delivery names the reference and
 * the egress class; the station files name the key id and carry the PUBLIC key only.
 *
 * CP-6 B16 (Codex B14-F1; C1, C4): a failure is recorded BY WHAT IS PROVEN, never by its class alone — an https failure carries
 * `request_sent` (the body flushed to the destination before the fault: the endpoint may hold the archive) and, for a delivery
 * answered with a redirect, the hop's `status`; a station `write_failed` carries `files_left` (what this attempt wrote and could
 * not remove). `retention.export_delivery_held` reads these to say whether a destination holds the package (`confirmed`), may hold
 * it (`possible`) or provably received nothing; the revocation notice carries that word (`held`). The station is now also READ as
 * the disconnected import path (`openStationPackage`: package.tar streamed, delivery.json / package.sig / revocation.json bounded),
 * and every station file the product reads for its content — the import's package, exchange identity, signature block and notice;
 * the collect acts' receipts — is opened as a REGULAR FILE and nothing else: `lstat` first (a symlink, a directory, a device is
 * refused before any byte), its `realpath` contained in the station's own realpath and outside every vault root (a symlinked
 * action directory cannot alias a tier), then `O_NOFOLLOW` on the open (a swap between the check and the open fails the open).
 *
 * CP-6 B17 (0077; D8, D13): the notice the executors deliver is SIGNED before they run (revocation-notice.ts; the service signs, the
 * executors take the signed `body` and write or POST it as it is — the station file and the https body are the signed JSON), and the
 * station is READ for a notice as it is read for a package (`openStationNotice`: `revocation.json` alone, the package need not still be
 * there — the origin removed its own copies after its commit) and WRITTEN for the importing domain's answer (`writeStationRevocationReceipt`:
 * `revocation-receipt.json` beside the notice, the file the demonstration recipient writes, in the same shape plus `import_id`, `refused`
 * and `verifier` — the origin's collect act reads it back unchanged). An importing domain of the same tenant is notified on the origin's
 * own ledger instead (`RevocationNotice.importer`; no file, no POST): the notice names the import as its delivery.
 */
import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsc } from 'node:fs';
import { access, lstat, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createReadStream, createWriteStream, openSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { VaultService, sha256 } from '../observation/vault/vault.service.js';
import { deliver, EgressRefused, type DeliveryRequest, type EgressPolicy, type EgressResult } from '../observation/connectors/http-client.js';
import { DestinationCredentialStore, KEY_SIGNATURE_SCHEME } from './export-signing.js';

type Row = Record<string, unknown>;

/**
 * B14: the delivery egress as a provider — the production transport is http-client.ts `deliver` (the scheme and host allowlist, the
 * address resolved and vetted, then the pinned POST). A harness that drives a synthetic recipient on a loopback address — one the vetting
 * refuses, and is proven to refuse — substitutes this provider with the client's own `deliverPinned` and nothing else: the transport,
 * the TLS verification against the declared anchor, the headers, the credential and the answer's handling are the product's.
 */
@Injectable()
export class DeliveryEgress {
  deliver(req: DeliveryRequest): Promise<EgressResult> { return deliver(req); }
}
export type DeliveryState = 'delivered' | 'acknowledged' | 'failed' | 'mismatched';
/** B14 (D3): what came of a revocation notice — the delivery's states with `notified` in place of `delivered`. */
export type NoticeState = 'notified' | 'acknowledged' | 'failed' | 'mismatched';
export type DeliveryFailureClass = 'destination_retired' | 'credential_unbound' | 'egress_refused' | 'transport' | 'receipt_invalid' | 'write_failed';

/** D6: a receipt collected from a station or presented out of band is at most this (Nest's own body limit, 100 kB, lies above it). */
export const RECEIPT_MAX_BYTES = 64 * 1024;
/** D8: the delivery egress's fixed policy — no redirect, 30 s, a response of at most 1 MiB (the host allowlist is the destination's own). */
const DELIVERY_POLICY: Omit<EgressPolicy, 'hostAllowlist'> = { schemeAllowlist: ['https'], maxRedirects: 0, timeoutMs: 30_000, maxResponseBytes: 1024 * 1024, maxDecompressedBytes: 1024 * 1024 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** B16 (C4): a station file is opened as itself, never through a symlink at its final component — where the platform has the flag (POSIX; 0 elsewhere). */
const O_NOFOLLOW: number = (fsc as { O_NOFOLLOW?: number }).O_NOFOLLOW ?? 0;
/** The station's JSON files the product reads (the exchange identity, the signature block, the notice, the receipts) are bounded as a receipt is. */
const STATION_JSON_MAX_BYTES = RECEIPT_MAX_BYTES;
/** The verifier's invocation the delivery names for the recipient — with the public key for a key-signed package. */
const VERIFY_STATEMENT = 'verify with scripts/retention/verify-export.mjs --tar package.tar [--public-key <the PEM in package.sig>]; write receipt.json beside it, naming this delivery_id and attempt';

/** What the executors deliver: the archive and the facts about it that the destination is told and the receipt must restate. */
export interface DeliveryPackage {
  tenantId: string; domainId: string; actionId: string;
  deliveryId: string; attempt: number;
  destinationKey: string; recipient: string; purpose: string;
  /** B15 (D2): the archive as a stream source of known size — opened per write; the digest below is the recorded one, verified before the open. */
  archive: { open: () => Promise<{ stream: Readable; digest: () => Promise<string> }>; size: number };
  archiveDigest: string; packageDigest: string; manifestDigest: string;
  /** The manifest's signature block as written (scheme /1 or /2). */
  signature: Row;
  /** For a /2 package: the key as recorded, with its state NOW (a key retired since the build still verifies; the recipient is told). */
  signingKey: { key_id: string; algorithm: string; purpose: string; public_key_pem: string; state: 'active' | 'retired'; retired_at: string | null } | null;
  expiresAt: string | null;
  deliveredAt: string;
}

export interface DeliveryOutcome {
  state: DeliveryState;
  /** The recipient's receipt as received, or the failure; null for a station delivery (the recipient answers later). */
  receipt: Row | null;
  failureClass: DeliveryFailureClass | null;
}

/** A transfer-station refusal the collect act — and, B16, the station import — answers as a conflict (409); the reason names which (`no_package`: no package.tar at the station for the origin action). */
export class TransferStationRefused extends Error {
  constructor(readonly reason: 'outside_roots' | 'not_directory' | 'containment' | 'no_receipt' | 'receipt_invalid' | 'no_package', message: string) { super(message); }
}

/** A station write that cannot stand — the delivery is recorded `failed` with class `write_failed`; the message names the file and the difference. */
class StationWriteFailed extends Error {}

@Injectable()
export class ExportDeliveryService {
  constructor(private readonly vault: VaultService, private readonly credentials: DestinationCredentialStore, private readonly egress: DeliveryEgress) {}

  /**
   * The station's directory for an action: the endpoint `realpath`'d NOW (C13 — a symlink turned into a vault root since the
   * declaration is refused here), a directory, outside every vault root; `<real>/<tenant>/<domain>/<action_id>` contained in it.
   * Returns the station's realpath beside the action's directory: every file read from the directory is contained in the FORMER
   * by its own realpath (B16, C4), so a symlinked segment under the station cannot lead outside it.
   */
  private async stationDir(endpoint: string, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ root: string; dir: string }> {
    if (!isAbsolute(endpoint)) throw new TransferStationRefused('not_directory', `the transfer station ${endpoint} is not an absolute path`);
    let real: string;
    try { real = await realpath(endpoint); } catch { throw new TransferStationRefused('not_directory', `the transfer station ${endpoint} is not an existing directory`); }
    if (!(await stat(real)).isDirectory()) throw new TransferStationRefused('not_directory', `the transfer station ${endpoint} is not a directory`);
    if (!this.vault.isOutsideRoots(real)) throw new TransferStationRefused('outside_roots', `the transfer station ${endpoint} lies within a vault root, or contains one; nothing is written to it or read from it`);
    if (!UUID_RE.test(scope.tenantId) || !UUID_RE.test(scope.domainId) || !UUID_RE.test(actionId)) throw new TransferStationRefused('containment', 'the station segments are not opaque identifiers');
    const dir = resolve(real, scope.tenantId, scope.domainId, actionId);
    if (!contains(real, dir) || dir === real) throw new TransferStationRefused('containment', 'the resolved station path escapes the transfer station');
    return { root: real, dir };
  }

  /**
   * B16 (C4): a station file the product is about to READ, vetted as a regular file at its place — the name resolved inside the action's
   * directory; `lstat` (a symlink, a directory, a socket or a device is refused: `containment`, before any byte); its `realpath` contained
   * in the station's realpath and outside every vault root (a symlinked tenant, domain or action directory under the station is caught
   * here — the file's own last component was already refused as a link). Absent → null. The open itself adds O_NOFOLLOW.
   */
  private async stationFile(station: { root: string; dir: string }, name: string): Promise<{ full: string; size: number } | null> {
    const full = resolve(station.dir, name);
    if (!contains(station.dir, full) || full === station.dir) throw new TransferStationRefused('containment', `the resolved path of ${name} escapes the station directory`);
    let st: Awaited<ReturnType<typeof lstat>>;
    try { st = await lstat(full); } catch { return null; }
    if (!st.isFile()) throw new TransferStationRefused('containment', `the station file ${name} is not a regular file`);
    let real: string;
    try { real = await realpath(full); } catch { throw new TransferStationRefused('containment', `the station file ${name} does not resolve to a path`); }
    if (!contains(station.root, real) || real === station.root) throw new TransferStationRefused('containment', `the station file ${name} resolves outside the transfer station`);
    if (!this.vault.isOutsideRoots(real)) throw new TransferStationRefused('containment', `the station file ${name} resolves into a vault root; nothing is read from it`);
    return { full, size: st.size };
  }

  /** B16 (C4): a bounded JSON OBJECT read from a vetted station file (O_NOFOLLOW; the size taken from the opened descriptor, not from the vet). */
  private async readStationObject(file: { full: string }, name: string, what: string): Promise<{ value: Row; byteLength: number }> {
    const refuse = (message: string): never => { throw new TransferStationRefused('receipt_invalid', message); };
    let handle: Awaited<ReturnType<typeof open>>;
    try { handle = await open(file.full, fsc.O_RDONLY | O_NOFOLLOW); }
    catch { throw new TransferStationRefused('containment', `the station file ${name} could not be opened as a regular file`); }
    let bytes: Buffer;
    try {
      const size = (await handle.stat()).size;
      if (size > STATION_JSON_MAX_BYTES) refuse(`the ${what} at ${file.full} is ${size} bytes, above the ceiling of ${STATION_JSON_MAX_BYTES}`);
      bytes = await handle.readFile();
    } finally { await handle.close().catch(() => undefined); }
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch { refuse(`the ${what} at ${file.full} is not JSON`); }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) refuse(`the ${what} at ${file.full} is not a JSON object`);
    return { value: parsed as Row, byteLength: bytes.byteLength };
  }

  /**
   * B16 (D4; C2c, C4): THE STATION AS THE IMPORT'S INTAKE — the package a partner's product wrote (or a courier placed) under
   * `<endpoint>/<originTenant>/<originDomain>/<originAction>/`: `package.tar` as a stream source of known size (opened per call, as a
   * regular file, O_NOFOLLOW; never read into memory here), `delivery.json` (the exchange identity the origin's delivery wrote — the
   * expiry the revocation check reads), `package.sig` (the signature block with the public key) and `revocation.json` (the origin's
   * notice, when its delivery was revoked at the station: the import's revocation check fails on it) — each bounded and a JSON object
   * when present, null when absent. No package.tar → `no_package`.
   */
  async openStationPackage(endpoint: string, origin: { tenantId: string; domainId: string; actionId: string }): Promise<{ directory: string; tar: { size: number; open: () => Readable }; deliveryJson: Row | null; signature: Row | null; revocation: Row | null }> {
    const station = await this.stationDir(endpoint, { tenantId: origin.tenantId, domainId: origin.domainId }, origin.actionId);
    const tar = await this.stationFile(station, 'package.tar');
    if (tar === null) throw new TransferStationRefused('no_package', `no package.tar at ${resolve(station.dir, 'package.tar')} for the origin action ${origin.actionId}`);
    const optional = async (name: string, what: string): Promise<Row | null> => {
      const f = await this.stationFile(station, name);
      return f === null ? null : (await this.readStationObject(f, name, what)).value;
    };
    const deliveryJson = await optional('delivery.json', 'exchange identity');
    const signature = await optional('package.sig', 'signature block');
    const revocation = await optional('revocation.json', 'revocation notice');
    const full = tar.full;
    return {
      directory: station.dir,
      tar: {
        size: tar.size,
        // The descriptor is opened here, as a regular file (O_NOFOLLOW: a link swapped in since the vet fails the open), and owned by the
        // stream — consumed to its end or destroyed, either closes it.
        open: () => createReadStream(full, { fd: openSync(full, fsc.O_RDONLY | O_NOFOLLOW), autoClose: true, highWaterMark: 1024 * 1024 }),
      },
      deliveryJson, signature, revocation,
    };
  }

  /**
   * D5, C13 — at the DECLARATION: the endpoint an absolute path, `realpath`'d, an existing directory, outside every vault root; the
   * refusal's message in the port's voice (the route answers it as 422).
   */
  async checkTransferStation(endpoint: string): Promise<{ ok: true; real: string } | { ok: false; message: string }> {
    if (!isAbsolute(endpoint)) return { ok: false, message: `export destination rejected: the transfer station ${endpoint} is not an absolute path` };
    let real: string;
    try { real = await realpath(endpoint); } catch { return { ok: false, message: `export destination rejected: the transfer station ${endpoint} is not an existing directory` }; }
    try { if (!(await stat(real)).isDirectory()) return { ok: false, message: `export destination rejected: the transfer station ${endpoint} is not a directory` }; }
    catch { return { ok: false, message: `export destination rejected: the transfer station ${endpoint} is not an existing directory` }; }
    if (!this.vault.isOutsideRoots(real)) return { ok: false, message: `export destination rejected: the transfer station ${endpoint} lies within a vault root, or contains one` };
    return { ok: true, real };
  }

  /** C6: the station paths an attempt CREATED, removed when its transaction did not commit — by name, nothing else; the failures named. */
  async removeCreated(paths: string[]): Promise<string[]> {
    const failed: string[] = [];
    for (const p of paths) {
      try { await rm(p, { force: true }); await syncDir(dirname(p)).catch(() => undefined); }
      catch { failed.push(p); }
    }
    return failed;
  }

  /**
   * D5, C7: `package.tar` and `package.sig` content-addressed (identical accepted, differing refused), `delivery.json` per attempt.
   * `created` receives the paths THIS attempt newly wrote — the controller's cleanup after a commit that failed (C6) — never a
   * pre-existing identical file. Returns the outcome to record; the files' paths for the answer.
   */
  async deliverToTransferStation(a: { endpoint: string; pkg: DeliveryPackage; created: string[] }): Promise<DeliveryOutcome & { directory: string | null; files: Record<string, string> | null; deliveryJson: Row | null }> {
    const { pkg } = a;
    const scope = { tenantId: pkg.tenantId, domainId: pkg.domainId };
    // B16 (C1): `files_left` names what this attempt wrote and could not remove — a station holding them MAY hold the package (export_delivery_held: possible).
    const failed = (message: string, filesLeft: string[] = []): DeliveryOutcome & { directory: string | null; files: null; deliveryJson: null } =>
      ({ state: 'failed', failureClass: 'write_failed', receipt: { failure: { class: 'write_failed', message: message.slice(0, 600), files_left: filesLeft } }, directory: null, files: null, deliveryJson: null });
    let dir: string;
    try { dir = (await this.stationDir(a.endpoint, scope, pkg.actionId)).dir; }
    catch (e) { return failed((e as Error).message); }
    const sig = this.signatureFile(pkg);
    const deliveryJson = this.deliveryJsonOf(pkg);
    const files = { package: resolve(dir, 'package.tar'), signature: resolve(dir, 'package.sig'), delivery: resolve(dir, 'delivery.json') };
    // The paths this attempt writes, kept apart until the three stand: a write that fails removes what it wrote (a station directory holding
    // the archive without its signature would invite the recipient to verify half a delivery), and the recorded failure names the rest.
    const mine: string[] = [];
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await this.writeContentAddressedStream(files.package, pkg.archive, pkg.archiveDigest, mine);
      await this.writeContentAddressed(files.signature, sig, mine);
      await this.writeReplacing(files.delivery, Buffer.from(`${JSON.stringify(deliveryJson, null, 2)}\n`, 'utf8'), mine);
    } catch (e) {
      let message = e instanceof StationWriteFailed ? e.message : `the station write failed: ${String((e as { message?: unknown })?.message ?? 'unknown')}`;
      const left = await this.removeCreated(mine);
      if (left.length > 0) message = `${message}; ${left.length} file(s) this attempt wrote could not be removed: ${left.join(', ')}`;
      return { ...failed(message, left), directory: dir };
    }
    a.created.push(...mine);
    return { state: 'delivered', receipt: null, failureClass: null, directory: dir, files: { package: 'package.tar', signature: 'package.sig', delivery: 'delivery.json' }, deliveryJson };
  }

  /** `package.sig`: the signature block and, for /2, the key's public PEM, purpose and algorithm — the stable facts, so the file is the same on every attempt. */
  private signatureFile(pkg: DeliveryPackage): Buffer {
    const body: Row = { signature: pkg.signature };
    if (pkg.signingKey !== null) body['key'] = { key_id: pkg.signingKey.key_id, algorithm: pkg.signingKey.algorithm, purpose: pkg.signingKey.purpose, public_key_pem: pkg.signingKey.public_key_pem };
    return Buffer.from(`${JSON.stringify(body, null, 2)}\n`, 'utf8');
  }

  /** `delivery.json`: the exchange identity of this attempt (DP-47-002) — and the key's state NOW, which the recipient is told (C8). */
  private deliveryJsonOf(pkg: DeliveryPackage): Row {
    const scheme = String(pkg.signature['scheme'] ?? '');
    return {
      delivery_id: pkg.deliveryId, attempt: pkg.attempt, action_id: pkg.actionId, tenant_id: pkg.tenantId, domain_id: pkg.domainId,
      destination_key: pkg.destinationKey, recipient: pkg.recipient, purpose: pkg.purpose,
      package_digest: pkg.packageDigest, archive_digest: pkg.archiveDigest, manifest_digest: pkg.manifestDigest,
      signature: { scheme, key_id: scheme === KEY_SIGNATURE_SCHEME ? (pkg.signature['key_id'] ?? null) : null, algorithm: scheme === KEY_SIGNATURE_SCHEME ? (pkg.signature['algorithm'] ?? null) : null },
      signing_key: pkg.signingKey === null ? null : { key_id: pkg.signingKey.key_id, purpose: pkg.signingKey.purpose, state: pkg.signingKey.state, retired_at: pkg.signingKey.retired_at },
      delivered_at: pkg.deliveredAt, expires_at: pkg.expiresAt,
      files: { package: 'package.tar', signature: 'package.sig' },
      statement: VERIFY_STATEMENT,
    };
  }

  /** Temp (`wx`, 0600) + write + fsync + rename + dirsync; an existing file is read and compared — identical accepted, differing refused. */
  private async writeContentAddressed(full: string, bytes: Buffer, created: string[]): Promise<void> {
    let existing: Buffer | null = null;
    try { existing = await readFile(full); } catch { existing = null; }
    if (existing !== null) {
      const have = sha256(existing); const want = sha256(bytes);
      if (have !== want || existing.byteLength !== bytes.byteLength) throw new StationWriteFailed(`${full} is already at the station and differs from this package (sha256 ${have} at the station, ${want} here); the delivery is refused, nothing overwritten`);
      return;
    }
    if (await this.writeTemp(full, bytes, 'wx')) created.push(full);
  }

  /**
   * B15 (D2): `package.tar` streamed to its temp name (never in memory), fsync'd, renamed; content-addressed by DIGEST — an existing file
   * is hashed by streaming and compared with the recorded archive digest (identical accepted, differing refused); the stream's own
   * digest, known when it ends, is compared with the recorded one before the rename (a source that changed under the stream is refused).
   */
  private async writeContentAddressedStream(full: string, archive: DeliveryPackage['archive'], recordedDigest: string, created: string[]): Promise<void> {
    let existing: string | null = null;
    try { await access(full, fsc.F_OK); existing = await digestOfFile(full); } catch { existing = null; }
    if (existing !== null) {
      if (existing !== recordedDigest) throw new StationWriteFailed(`${full} is already at the station and differs from this package (sha256 ${existing} at the station, ${recordedDigest} here); the delivery is refused, nothing overwritten`);
      return;
    }
    const tmp = `${full}.tmp-${randomUUID()}`;
    const built = await archive.open();
    const handle = await open(tmp, 'wx', 0o600);
    try {
      await pipeline(built.stream, createWriteStream(tmp, { fd: handle.fd, autoClose: false }));
      await handle.sync();
    } catch (e) {
      await handle.close().catch(() => undefined);
      await rm(tmp, { force: true }).catch(() => undefined);
      throw e;
    }
    await handle.close();
    const streamed = await built.digest();
    if (streamed !== recordedDigest) { await rm(tmp, { force: true }).catch(() => undefined); throw new StationWriteFailed(`the archive streamed to the station digests to ${streamed}, not the recorded ${recordedDigest}; nothing written`); }
    try {
      await access(full, fsc.F_OK);
      // A file appeared meanwhile (a concurrent attempt): compared, never overwritten.
      await rm(tmp, { force: true });
      const have = await digestOfFile(full);
      if (have !== recordedDigest) throw new StationWriteFailed(`${full} appeared at the station during this write and differs from this package`);
      return;
    } catch (e) {
      if (e instanceof StationWriteFailed) throw e;
      // ENOENT is the expected case — continue.
    }
    await rename(tmp, full);
    await syncDir(dirname(full));
    created.push(full);
  }

  /** Temp + fsync + rename over whatever is there (the previous attempt's file); counted as created only when nothing was there. */
  private async writeReplacing(full: string, bytes: Buffer, created: string[]): Promise<void> {
    let existed = true;
    try { await access(full, fsc.F_OK); } catch { existed = false; }
    await this.writeTemp(full, bytes, 'replace');
    if (!existed) created.push(full);
  }

  /** True when the bytes were written under the name; false when an identical file appeared meanwhile and was kept. */
  private async writeTemp(full: string, bytes: Buffer, mode: 'wx' | 'replace'): Promise<boolean> {
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
    if (mode === 'wx') {
      // Create-if-absent: a file that appeared meanwhile (a concurrent attempt) is compared, not overwritten.
      try {
        await access(full, fsc.F_OK);
        await rm(tmp, { force: true });
        const existing = await readFile(full);
        if (sha256(existing) !== sha256(bytes)) throw new StationWriteFailed(`${full} appeared at the station during this write and differs from this package`);
        return false;
      } catch (e) {
        if (e instanceof StationWriteFailed) throw e;
        // ENOENT is the expected case — continue.
      }
    }
    await rename(tmp, full);
    await syncDir(dirname(full));
    return true;
  }

  /**
   * D6: the recipient's `receipt.json` from the station's directory of the action — the endpoint realpath'd and re-checked,
   * the path contained, the file at most 64 KiB and a JSON object. No file yet → `no_receipt`.
   */
  async collectReceipt(endpoint: string, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ receipt: Row; path: string; byteLength: number }> {
    return this.readStationJson(endpoint, scope, actionId, 'receipt.json');
  }

  /**
   * D8: the archive POSTed once to the https destination. The credential gate comes first and leaves nothing on the wire;
   * then the egress's own refusals (the address not public, a redirect, the host unresolved, TLS, the timeout) each become a
   * recorded failure with the egress class named; a 2xx answer's body is the receipt (a JSON object) and decides the state.
   */
  async deliverToHttps(a: { endpoint: string; credentialRef: string | null; trustAnchorPem: string | null; pkg: DeliveryPackage }): Promise<DeliveryOutcome & { egress: Row | null }> {
    const { pkg } = a;
    const failure = (cls: DeliveryFailureClass, detail: Row): DeliveryOutcome & { egress: Row | null } =>
      ({ state: 'failed', failureClass: cls, receipt: { failure: { class: cls, ...detail } }, egress: null });
    if (a.credentialRef !== null && !this.credentials.has(a.credentialRef)) {
      return failure('credential_unbound', { credential: a.credentialRef, message: `the destination names credential ${a.credentialRef}, and this deployment binds no destination credential under that name; nothing left the process` });
    }
    let url: URL;
    try { url = new URL(a.endpoint); } catch { return failure('egress_refused', { egress: 'scheme_not_allowed', message: 'the endpoint is not a URL' }); }
    const scheme = String(pkg.signature['scheme'] ?? '');
    const headers: Record<string, string> = {
      'x-eye-package-digest': pkg.packageDigest, 'x-eye-archive-digest': pkg.archiveDigest, 'x-eye-manifest-digest': pkg.manifestDigest,
      'x-eye-signature-scheme': scheme, 'x-eye-delivery-id': pkg.deliveryId, 'x-eye-action-id': pkg.actionId, 'x-eye-attempt': String(pkg.attempt),
    };
    if (scheme === KEY_SIGNATURE_SCHEME) { headers['x-eye-key-id'] = String(pkg.signature['key_id'] ?? ''); headers['x-eye-signature'] = String(pkg.signature['signature'] ?? ''); }
    const credential = a.credentialRef === null ? null : this.credentials.resolve(a.credentialRef);
    let res: EgressResult;
    try {
      const built = await pkg.archive.open();
      res = await this.egress.deliver({ url: url.toString(), body: { stream: built.stream, length: pkg.archive.size }, headers, ...(credential === null ? {} : { credentials: { authorization: `Bearer ${credential}` } }), policy: this.policyFor(url, a.trustAnchorPem) });
    } catch (e) {
      const f = egressFailureOf(e);
      return failure(f.cls, f.detail);
    }
    const egress: Row = { status: res.status, pinned_address: res.pinnedAddress, tls_verified: res.tlsVerified, hops: res.hops, headers: res.headers, body_digest: sha256(res.body), body_length: res.body.byteLength, request_sent: res.requestSent };
    if (res.status < 200 || res.status >= 300) {
      return { ...failure('transport', { egress: null, message: `the destination answered ${res.status}`, status: res.status, request_sent: res.requestSent, body_digest: sha256(res.body), body_length: res.body.byteLength }), egress };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(res.body.toString('utf8')); } catch { parsed = undefined; }
    if (parsed === undefined || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...failure('receipt_invalid', { egress: null, message: 'the destination answered with a body that is not a JSON object', status: res.status, request_sent: res.requestSent, body_digest: sha256(res.body), body_length: res.body.byteLength }), egress };
    }
    const receipt = parsed as Row;
    return { state: receiptState(receipt, pkg.archiveDigest, pkg.packageDigest, pkg.deliveryId), receipt, failureClass: null, egress };
  }

  /** D8, B14 (D2): the delivery egress's policy for one destination — the fixed limits, the host its own, the declared anchor when there is one. */
  private policyFor(url: URL, trustAnchorPem: string | null): EgressPolicy {
    return { ...DELIVERY_POLICY, hostAllowlist: [url.hostname.toLowerCase()], ...(trustAnchorPem === null ? {} : { trustAnchorPem }) };
  }

  // ───────────────────────── B14 (D3): the revocation notice ─────────────────────────

  /**
   * The notice as sent to a destination: the exchange identity of THIS notice and the delivery the recipient holds — with `held`, what
   * that delivery proves (B16) — the package's digests, the revocation (its instant and reason) and the OBLIGATION the recipient
   * acknowledges — every copy destroyed and confirmed by a receipt naming this notice, the package digest and copies_destroyed: true.
   */
  noticeOf(n: RevocationNotice): Row {
    // B17 (D6): an IMPORTING DOMAIN is a recipient without a destination — the import is the delivery it holds (an admitted copy is `confirmed`).
    const importer = n.importer ?? null;
    return {
      notice: 'revocation', notice_id: n.noticeId, attempt: n.attempt, action_id: n.actionId, tenant_id: n.tenantId, domain_id: n.domainId,
      destination_key: importer === null ? n.destinationKey : null, recipient: n.recipient,
      delivery: importer === null
        ? { delivery_id: n.deliveryId, attempt: n.deliveryAttempt, state: n.deliveryState, held: n.held }
        : { import_id: importer.import_id, state: importer.state === 'revoked' ? 'revoked' : 'admitted', held: 'confirmed' },
      package_digest: n.packageDigest, archive_digest: n.archiveDigest, signing_key_id: n.signingKeyId,
      revoked_at: n.revokedAt, reason: n.reason, notified_at: n.notifiedAt,
      obligation: 'the package is revoked: destroy every copy of package.tar and of its contents held from this delivery, and confirm',
      statement: NOTICE_STATEMENT,
    };
  }

  /**
   * A transfer station is told by `revocation.json` in the action's directory (replaced per attempt, as delivery.json is); the product's
   * own package.tar and package.sig there are removed AFTER the commit by `removeStationPackage`. `created` receives the path when this
   * attempt newly wrote it (C6). B17 (D8): `body` is the SIGNED notice the service built (signNotice over `noticeOf`); it is written as it is.
   */
  async notifyTransferStation(a: { endpoint: string; notice: RevocationNotice; body: Row; created: string[] }): Promise<NoticeOutcome & { directory: string | null; file: string | null }> {
    const scope = { tenantId: a.notice.tenantId, domainId: a.notice.domainId };
    const failed = (message: string, filesLeft: string[] = []): NoticeOutcome & { directory: string | null; file: null } =>
      ({ state: 'failed', failureClass: 'write_failed', receipt: { failure: { class: 'write_failed', message: message.slice(0, 600), files_left: filesLeft } }, directory: null, file: null });
    let dir: string;
    try { dir = (await this.stationDir(a.endpoint, scope, a.notice.actionId)).dir; }
    catch (e) { return failed((e as Error).message); }
    const file = resolve(dir, 'revocation.json');
    const mine: string[] = [];
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await this.writeReplacing(file, Buffer.from(`${JSON.stringify(a.body, null, 2)}\n`, 'utf8'), mine);
    } catch (e) {
      const left = await this.removeCreated(mine);
      let message = `the station write failed: ${String((e as { message?: unknown })?.message ?? 'unknown')}`;
      if (left.length > 0) message = `${message}; ${left.length} file(s) this attempt wrote could not be removed: ${left.join(', ')}`;
      return { ...failed(message, left), directory: dir };
    }
    a.created.push(...mine);
    return { state: 'notified', receipt: null, failureClass: null, directory: dir, file: 'revocation.json' };
  }

  /**
   * B17 (D8, D19): THE STATION AS THE REVOCATION'S INTAKE — the origin's `revocation.json` under `<endpoint>/<originTenant>/<originDomain>/
   * <originAction>/`, vetted and bounded as every station file the product reads (C4), a JSON object; null when absent. `package.tar` is
   * NOT required: the origin removed its own copies after its revocation committed, and the notice is the fact the importer acts on
   * (verified against the import's partner by the service before the port sees it).
   */
  async openStationNotice(endpoint: string, origin: { tenantId: string; domainId: string; actionId: string }): Promise<{ directory: string; path: string; notice: Row } | null> {
    const station = await this.stationDir(endpoint, { tenantId: origin.tenantId, domainId: origin.domainId }, origin.actionId);
    const file = await this.stationFile(station, 'revocation.json');
    if (file === null) return null;
    const read = await this.readStationObject(file, 'revocation.json', 'revocation notice');
    return { directory: station.dir, path: file.full, notice: read.value };
  }

  /**
   * B17 (D13): THE IMPORTING DOMAIN'S ANSWER at the station — `revocation-receipt.json` beside the origin's notice, the file the
   * demonstration recipient writes (transfer-station-recipient.mjs) in the same shape plus `import_id`, `refused` and `verifier`, so
   * the origin's collect act reads it back as any recipient's. Temp + fsync + rename over the previous attempt's file (the receipt of
   * THIS attempt is the one that stands). The action's directory must exist — the origin's notice lies in it; nothing is created for
   * an origin that never wrote there (`no_receipt`). Returns the path written.
   */
  async writeStationRevocationReceipt(endpoint: string, origin: { tenantId: string; domainId: string; actionId: string }, receipt: Row): Promise<string> {
    const station = await this.stationDir(endpoint, { tenantId: origin.tenantId, domainId: origin.domainId }, origin.actionId);
    let real: string | null = null;
    try { real = (await stat(station.dir)).isDirectory() ? await realpath(station.dir) : null; } catch { real = null; }
    if (real === null) throw new TransferStationRefused('no_receipt', `no station directory for the origin action ${origin.actionId} at ${station.dir}; the receipt has nowhere to stand`);
    // The C4 discipline on the write as on the reads: a symlinked tenant, domain or action directory under the station cannot lead the receipt outside it, or into a vault root.
    if (!contains(station.root, real) || real === station.root || !this.vault.isOutsideRoots(real)) throw new TransferStationRefused('containment', `the station directory of the origin action ${origin.actionId} resolves outside the transfer station; nothing is written`);
    const full = resolve(station.dir, 'revocation-receipt.json');
    await this.writeReplacing(full, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8'), []);
    return full;
  }

  /**
   * After the revocation committed: the bytes the PRODUCT placed at the station — package.tar and package.sig of the action's directory —
   * removed by name (the recipient's copies are the recipient's obligation; delivery.json, revocation.json and the receipts stay as the
   * record). Idempotent; what was removed and what was not there is named.
   */
  async removeStationPackage(endpoint: string, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ removed: string[]; absent: string[]; failed: string[] }> {
    const out = { removed: [] as string[], absent: [] as string[], failed: [] as string[] };
    let dir: string;
    try { dir = (await this.stationDir(endpoint, scope, actionId)).dir; } catch { return { ...out, failed: ['package.tar', 'package.sig'] }; }
    for (const name of ['package.tar', 'package.sig']) {
      const full = resolve(dir, name);
      try { await access(full, fsc.F_OK); } catch { out.absent.push(name); continue; }
      try { await rm(full, { force: true }); await syncDir(dir).catch(() => undefined); out.removed.push(name); } catch { out.failed.push(name); }
    }
    return out;
  }

  /** The recipient's `revocation-receipt.json` from the station's directory of the action (the receipt discipline of D6). */
  async collectRevocationReceipt(endpoint: string, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ receipt: Row; path: string; byteLength: number }> {
    return this.readStationJson(endpoint, scope, actionId, 'revocation-receipt.json');
  }

  /**
   * An https destination is told by ONE JSON POST to its endpoint — the same egress, credential and anchor rules as the delivery, the
   * header x-eye-notice naming the kind — and its answer is the receipt. The failures are the delivery's, recorded the same way.
   * B17 (D8): `body` is the SIGNED notice the service built; it is POSTed as it is.
   */
  async notifyHttps(a: { endpoint: string; credentialRef: string | null; trustAnchorPem: string | null; notice: RevocationNotice; body: Row }): Promise<NoticeOutcome & { egress: Row | null }> {
    const n = a.notice;
    const failure = (cls: DeliveryFailureClass, detail: Row): NoticeOutcome & { egress: Row | null } =>
      ({ state: 'failed', failureClass: cls, receipt: { failure: { class: cls, ...detail } }, egress: null });
    if (a.credentialRef !== null && !this.credentials.has(a.credentialRef)) {
      return failure('credential_unbound', { credential: a.credentialRef, message: `the destination names credential ${a.credentialRef}, and this deployment binds no destination credential under that name; nothing left the process` });
    }
    let url: URL;
    try { url = new URL(a.endpoint); } catch { return failure('egress_refused', { egress: 'scheme_not_allowed', message: 'the endpoint is not a URL' }); }
    const body = Buffer.from(JSON.stringify(a.body), 'utf8');
    const headers: Record<string, string> = {
      'x-eye-notice': 'revocation', 'x-eye-notice-id': n.noticeId, 'x-eye-attempt': String(n.attempt), 'x-eye-delivery-id': n.deliveryId, 'x-eye-action-id': n.actionId,
      'x-eye-package-digest': n.packageDigest, 'x-eye-archive-digest': n.archiveDigest,
    };
    const credential = a.credentialRef === null ? null : this.credentials.resolve(a.credentialRef);
    let res: EgressResult;
    try {
      res = await this.egress.deliver({ url: url.toString(), body, headers, contentType: 'application/json', ...(credential === null ? {} : { credentials: { authorization: `Bearer ${credential}` } }), policy: this.policyFor(url, a.trustAnchorPem) });
    } catch (e) {
      const f = egressFailureOf(e);
      return failure(f.cls, f.detail);
    }
    const egress: Row = { status: res.status, pinned_address: res.pinnedAddress, tls_verified: res.tlsVerified, hops: res.hops, headers: res.headers, body_digest: sha256(res.body), body_length: res.body.byteLength, request_sent: res.requestSent };
    if (res.status < 200 || res.status >= 300) {
      return { ...failure('transport', { egress: null, message: `the destination answered ${res.status}`, status: res.status, request_sent: res.requestSent, body_digest: sha256(res.body), body_length: res.body.byteLength }), egress };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(res.body.toString('utf8')); } catch { parsed = undefined; }
    if (parsed === undefined || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...failure('receipt_invalid', { egress: null, message: 'the destination answered with a body that is not a JSON object', status: res.status, request_sent: res.requestSent, body_digest: sha256(res.body), body_length: res.body.byteLength }), egress };
    }
    const receipt = parsed as Row;
    return { state: noticeReceiptState(receipt, n.packageDigest, n.noticeId), receipt, failureClass: null, egress };
  }

  /**
   * A bounded JSON object read from the station's directory of the action (receipt.json, revocation-receipt.json): the D6 discipline —
   * B16 (C4): the file vetted as a regular file at its place and opened O_NOFOLLOW, as every station file the product reads.
   */
  private async readStationJson(endpoint: string, scope: { tenantId: string; domainId: string }, actionId: string, name: string): Promise<{ receipt: Row; path: string; byteLength: number }> {
    const station = await this.stationDir(endpoint, scope, actionId);
    const file = await this.stationFile(station, name);
    if (file === null) throw new TransferStationRefused('no_receipt', `no receipt yet at ${resolve(station.dir, name)}`);
    const read = await this.readStationObject(file, name, 'receipt');
    return { receipt: read.value, path: file.full, byteLength: read.byteLength };
  }
}

/**
 * B16 (Codex B14-F1; C1): what an egress failure PROVES, recorded beside its class — `request_sent` (the client's word: the body was
 * flushed to the destination before the fault, so the endpoint may hold the archive; null when the client did not say), the hop's
 * `status` when the destination answered with a redirect (it received the body: `possible`), and the refusal class itself. The held
 * classification (retention.export_delivery_held) reads these, never the class alone. The class families are B13's: the vetting's and
 * the redirect's refusals are `egress_refused`; the name, the connection, the handshake, the timeout and the answer's size are `transport`.
 */
const EGRESS_REFUSED_CLASSES: readonly string[] = ['address_not_public', 'host_not_allowed', 'scheme_not_allowed', 'redirect_not_followed', 'too_many_redirects', 'redirect_target_refused'];
function egressFailureOf(e: unknown): { cls: DeliveryFailureClass; detail: Row } {
  if (e instanceof EgressRefused) {
    const cls: DeliveryFailureClass = EGRESS_REFUSED_CLASSES.includes(e.refusalClass) ? 'egress_refused' : 'transport';
    return { cls, detail: { egress: e.refusalClass, message: e.message.slice(0, 300), status: e.status ?? null, request_sent: e.requestSent ?? null, body_digest: null } };
  }
  return { cls: 'transport', detail: { egress: null, message: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 300), status: null, request_sent: null, body_digest: null } };
}

/**
 * B14 (D3): what the notice executors deliver and record. B16 (Codex B14-F1): `held` — what the delivery PROVES about the recipient's
 * copy: `confirmed` (delivered, acknowledged, or mismatched: it answered about the package) or `possible` (a failure after the body
 * left, or a receipt that did not parse); a destination that provably received nothing is never notified. B17 (D6): `importer` — an
 * importing domain of the tenant as the recipient: no destination, no delivery; the import (admitted, revoking or revoked) is what it
 * holds, and the notice's `delivery` block names it (`recipient` is `import:<tenant>/<domain>/<import_id>`).
 */
export interface RevocationNotice {
  tenantId: string; domainId: string; actionId: string;
  noticeId: string; attempt: number;
  destinationKey: string; recipient: string;
  deliveryId: string; deliveryAttempt: number; deliveryState: string; held: 'confirmed' | 'possible';
  packageDigest: string; archiveDigest: string; signingKeyId: string | null;
  revokedAt: string | null; reason: string | null; notifiedAt: string;
  importer?: { tenant_id: string; domain_id: string; import_id: string; state: string; admitted_at: string | null } | null;
}
export interface NoticeOutcome {
  state: NoticeState;
  receipt: Row | null;
  failureClass: DeliveryFailureClass | null;
}
/** The recipient's obligation, in the notice's own words. */
const NOTICE_STATEMENT = 'destroy every copy; write revocation-receipt.json beside delivery.json (a transfer station) or answer this POST (https) with { notice_id, delivery_id, package_digest, copies_destroyed: true, recipient, receipt_id }';

/**
 * B14 (D3): what a recipient's receipt makes of a notice — `acknowledged` when it names the package digest and copies_destroyed: true;
 * `mismatched` when it names another package or copies_destroyed: false (the obligation refused); a receipt naming ANOTHER notice is not
 * this notice's (the binding of D1) — `notified`, the evidence kept; otherwise `notified` (the recipient answered without confirming).
 */
export function noticeReceiptState(receipt: Row, packageDigest: string, noticeId: string): NoticeState {
  const named = receipt['notice_id'];
  if (named !== undefined && named !== noticeId) return 'notified';
  const p = receipt['package_digest']; const c = receipt['copies_destroyed'];
  if (c === true && p === packageDigest) return 'acknowledged';
  if ((p !== undefined && p !== packageDigest) || c === false) return 'mismatched';
  return 'notified';
}

/**
 * D6: what a recipient's receipt makes of a delivery — `acknowledged` when it names both digests and verified: true;
 * `mismatched` when it names another digest or verified: false (the exchange denied); otherwise `delivered` (the recipient
 * answered without verifying; the acknowledgement is presented later). B14 (D1; Codex B13-F1): a receipt that names a `delivery_id`
 * other than this delivery's is NOT this delivery's receipt — whatever its digests say, it neither acknowledges nor denies this
 * exchange: `delivered`, the answer kept as evidence, the acknowledgement presented later (the acknowledge port's binding, applied
 * here as well). A receipt without a delivery_id is classified by its digests and `verified`, as before.
 */
export function receiptState(receipt: Row, archiveDigest: string, packageDigest: string, deliveryId: string): DeliveryState {
  const named = receipt['delivery_id'];
  if (named !== undefined && named !== deliveryId) return 'delivered';
  const a = receipt['archive_digest']; const p = receipt['package_digest']; const v = receipt['verified'];
  if (v === true && a === archiveDigest && p === packageDigest) return 'acknowledged';
  if ((a !== undefined && a !== archiveDigest) || (p !== undefined && p !== packageDigest) || v === false) return 'mismatched';
  return 'delivered';
}

/** The sha256 of a file, streamed. */
async function digestOfFile(full: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(full, { highWaterMark: 1024 * 1024 })) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** True when `child` is `parent` or lies inside it (the vault's own rule, restated for the station). */
function contains(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  if (rel === '') return true;
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
