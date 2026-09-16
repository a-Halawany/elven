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
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { constants as fsc } from 'node:fs';
import { access, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
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
/** The verifier's invocation the delivery names for the recipient — with the public key for a key-signed package. */
const VERIFY_STATEMENT = 'verify with scripts/retention/verify-export.mjs --tar package.tar [--public-key <the PEM in package.sig>]; write receipt.json beside it, naming this delivery_id and attempt';

/** What the executors deliver: the archive and the facts about it that the destination is told and the receipt must restate. */
export interface DeliveryPackage {
  tenantId: string; domainId: string; actionId: string;
  deliveryId: string; attempt: number;
  destinationKey: string; recipient: string; purpose: string;
  tar: Buffer; archiveDigest: string; packageDigest: string; manifestDigest: string;
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

/** A transfer-station refusal the collect act answers as a conflict (409); the reason names which. */
export class TransferStationRefused extends Error {
  constructor(readonly reason: 'outside_roots' | 'not_directory' | 'containment' | 'no_receipt' | 'receipt_invalid', message: string) { super(message); }
}

/** A station write that cannot stand — the delivery is recorded `failed` with class `write_failed`; the message names the file and the difference. */
class StationWriteFailed extends Error {}

@Injectable()
export class ExportDeliveryService {
  constructor(private readonly vault: VaultService, private readonly credentials: DestinationCredentialStore, private readonly egress: DeliveryEgress) {}

  /**
   * The station's directory for an action: the endpoint `realpath`'d NOW (C13 — a symlink turned into a vault root since the
   * declaration is refused here), a directory, outside every vault root; `<real>/<tenant>/<domain>/<action_id>` contained in it.
   */
  private async stationDir(endpoint: string, scope: { tenantId: string; domainId: string }, actionId: string): Promise<string> {
    if (!isAbsolute(endpoint)) throw new TransferStationRefused('not_directory', `the transfer station ${endpoint} is not an absolute path`);
    let real: string;
    try { real = await realpath(endpoint); } catch { throw new TransferStationRefused('not_directory', `the transfer station ${endpoint} is not an existing directory`); }
    if (!(await stat(real)).isDirectory()) throw new TransferStationRefused('not_directory', `the transfer station ${endpoint} is not a directory`);
    if (!this.vault.isOutsideRoots(real)) throw new TransferStationRefused('outside_roots', `the transfer station ${endpoint} lies within a vault root, or contains one; nothing is written to it or read from it`);
    if (!UUID_RE.test(scope.tenantId) || !UUID_RE.test(scope.domainId) || !UUID_RE.test(actionId)) throw new TransferStationRefused('containment', 'the station segments are not opaque identifiers');
    const dir = resolve(real, scope.tenantId, scope.domainId, actionId);
    if (!contains(real, dir) || dir === real) throw new TransferStationRefused('containment', 'the resolved station path escapes the transfer station');
    return dir;
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
    const failed = (message: string): DeliveryOutcome & { directory: string | null; files: null; deliveryJson: null } =>
      ({ state: 'failed', failureClass: 'write_failed', receipt: { failure: { class: 'write_failed', message: message.slice(0, 600) } }, directory: null, files: null, deliveryJson: null });
    let dir: string;
    try { dir = await this.stationDir(a.endpoint, scope, pkg.actionId); }
    catch (e) { return failed((e as Error).message); }
    const sig = this.signatureFile(pkg);
    const deliveryJson = this.deliveryJsonOf(pkg);
    const files = { package: resolve(dir, 'package.tar'), signature: resolve(dir, 'package.sig'), delivery: resolve(dir, 'delivery.json') };
    // The paths this attempt writes, kept apart until the three stand: a write that fails removes what it wrote (a station directory holding
    // the archive without its signature would invite the recipient to verify half a delivery), and the recorded failure names the rest.
    const mine: string[] = [];
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await this.writeContentAddressed(files.package, pkg.tar, mine);
      await this.writeContentAddressed(files.signature, sig, mine);
      await this.writeReplacing(files.delivery, Buffer.from(`${JSON.stringify(deliveryJson, null, 2)}\n`, 'utf8'), mine);
    } catch (e) {
      let message = e instanceof StationWriteFailed ? e.message : `the station write failed: ${String((e as { message?: unknown })?.message ?? 'unknown')}`;
      const left = await this.removeCreated(mine);
      if (left.length > 0) message = `${message}; ${left.length} file(s) this attempt wrote could not be removed: ${left.join(', ')}`;
      return { ...failed(message), directory: dir };
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
      res = await this.egress.deliver({ url: url.toString(), body: pkg.tar, headers, ...(credential === null ? {} : { credentials: { authorization: `Bearer ${credential}` } }), policy: this.policyFor(url, a.trustAnchorPem) });
    } catch (e) {
      if (e instanceof EgressRefused) {
        const cls: DeliveryFailureClass = ['address_not_public', 'host_not_allowed', 'scheme_not_allowed', 'redirect_not_followed', 'too_many_redirects', 'redirect_target_refused'].includes(e.refusalClass) ? 'egress_refused' : 'transport';
        return failure(cls, { egress: e.refusalClass, message: e.message.slice(0, 300), status: null, body_digest: null });
      }
      return failure('transport', { egress: null, message: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 300), status: null, body_digest: null });
    }
    const egress: Row = { status: res.status, pinned_address: res.pinnedAddress, tls_verified: res.tlsVerified, hops: res.hops, headers: res.headers, body_digest: sha256(res.body), body_length: res.body.byteLength };
    if (res.status < 200 || res.status >= 300) {
      return { ...failure('transport', { egress: null, message: `the destination answered ${res.status}`, status: res.status, body_digest: sha256(res.body), body_length: res.body.byteLength }), egress };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(res.body.toString('utf8')); } catch { parsed = undefined; }
    if (parsed === undefined || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...failure('receipt_invalid', { egress: null, message: 'the destination answered with a body that is not a JSON object', status: res.status, body_digest: sha256(res.body), body_length: res.body.byteLength }), egress };
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
   * The notice as sent to a destination: the exchange identity of THIS notice and the delivery the recipient holds, the package's
   * digests, the revocation (its instant and reason) and the OBLIGATION the recipient acknowledges — every copy destroyed and confirmed
   * by a receipt naming this notice, the package digest and copies_destroyed: true.
   */
  noticeOf(n: RevocationNotice): Row {
    return {
      notice: 'revocation', notice_id: n.noticeId, attempt: n.attempt, action_id: n.actionId, tenant_id: n.tenantId, domain_id: n.domainId,
      destination_key: n.destinationKey, recipient: n.recipient, delivery: { delivery_id: n.deliveryId, attempt: n.deliveryAttempt, state: n.deliveryState },
      package_digest: n.packageDigest, archive_digest: n.archiveDigest, signing_key_id: n.signingKeyId,
      revoked_at: n.revokedAt, reason: n.reason, notified_at: n.notifiedAt,
      obligation: 'the package is revoked: destroy every copy of package.tar and of its contents held from this delivery, and confirm',
      statement: NOTICE_STATEMENT,
    };
  }

  /**
   * A transfer station is told by `revocation.json` in the action's directory (replaced per attempt, as delivery.json is); the product's
   * own package.tar and package.sig there are removed AFTER the commit by `removeStationPackage`. `created` receives the path when this
   * attempt newly wrote it (C6).
   */
  async notifyTransferStation(a: { endpoint: string; notice: RevocationNotice; created: string[] }): Promise<NoticeOutcome & { directory: string | null; file: string | null }> {
    const scope = { tenantId: a.notice.tenantId, domainId: a.notice.domainId };
    const failed = (message: string): NoticeOutcome & { directory: string | null; file: null } =>
      ({ state: 'failed', failureClass: 'write_failed', receipt: { failure: { class: 'write_failed', message: message.slice(0, 600) } }, directory: null, file: null });
    let dir: string;
    try { dir = await this.stationDir(a.endpoint, scope, a.notice.actionId); }
    catch (e) { return failed((e as Error).message); }
    const file = resolve(dir, 'revocation.json');
    const mine: string[] = [];
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await this.writeReplacing(file, Buffer.from(`${JSON.stringify(this.noticeOf(a.notice), null, 2)}\n`, 'utf8'), mine);
    } catch (e) {
      const left = await this.removeCreated(mine);
      let message = `the station write failed: ${String((e as { message?: unknown })?.message ?? 'unknown')}`;
      if (left.length > 0) message = `${message}; ${left.length} file(s) this attempt wrote could not be removed: ${left.join(', ')}`;
      return { ...failed(message), directory: dir };
    }
    a.created.push(...mine);
    return { state: 'notified', receipt: null, failureClass: null, directory: dir, file: 'revocation.json' };
  }

  /**
   * After the revocation committed: the bytes the PRODUCT placed at the station — package.tar and package.sig of the action's directory —
   * removed by name (the recipient's copies are the recipient's obligation; delivery.json, revocation.json and the receipts stay as the
   * record). Idempotent; what was removed and what was not there is named.
   */
  async removeStationPackage(endpoint: string, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ removed: string[]; absent: string[]; failed: string[] }> {
    const out = { removed: [] as string[], absent: [] as string[], failed: [] as string[] };
    let dir: string;
    try { dir = await this.stationDir(endpoint, scope, actionId); } catch { return { ...out, failed: ['package.tar', 'package.sig'] }; }
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
   */
  async notifyHttps(a: { endpoint: string; credentialRef: string | null; trustAnchorPem: string | null; notice: RevocationNotice }): Promise<NoticeOutcome & { egress: Row | null }> {
    const n = a.notice;
    const failure = (cls: DeliveryFailureClass, detail: Row): NoticeOutcome & { egress: Row | null } =>
      ({ state: 'failed', failureClass: cls, receipt: { failure: { class: cls, ...detail } }, egress: null });
    if (a.credentialRef !== null && !this.credentials.has(a.credentialRef)) {
      return failure('credential_unbound', { credential: a.credentialRef, message: `the destination names credential ${a.credentialRef}, and this deployment binds no destination credential under that name; nothing left the process` });
    }
    let url: URL;
    try { url = new URL(a.endpoint); } catch { return failure('egress_refused', { egress: 'scheme_not_allowed', message: 'the endpoint is not a URL' }); }
    const body = Buffer.from(JSON.stringify(this.noticeOf(n)), 'utf8');
    const headers: Record<string, string> = {
      'x-eye-notice': 'revocation', 'x-eye-notice-id': n.noticeId, 'x-eye-attempt': String(n.attempt), 'x-eye-delivery-id': n.deliveryId, 'x-eye-action-id': n.actionId,
      'x-eye-package-digest': n.packageDigest, 'x-eye-archive-digest': n.archiveDigest,
    };
    const credential = a.credentialRef === null ? null : this.credentials.resolve(a.credentialRef);
    let res: EgressResult;
    try {
      res = await this.egress.deliver({ url: url.toString(), body, headers, contentType: 'application/json', ...(credential === null ? {} : { credentials: { authorization: `Bearer ${credential}` } }), policy: this.policyFor(url, a.trustAnchorPem) });
    } catch (e) {
      if (e instanceof EgressRefused) {
        const cls: DeliveryFailureClass = ['address_not_public', 'host_not_allowed', 'scheme_not_allowed', 'redirect_not_followed', 'too_many_redirects', 'redirect_target_refused'].includes(e.refusalClass) ? 'egress_refused' : 'transport';
        return failure(cls, { egress: e.refusalClass, message: e.message.slice(0, 300), status: null, body_digest: null });
      }
      return failure('transport', { egress: null, message: String((e as { message?: unknown })?.message ?? 'unknown').slice(0, 300), status: null, body_digest: null });
    }
    const egress: Row = { status: res.status, pinned_address: res.pinnedAddress, tls_verified: res.tlsVerified, hops: res.hops, headers: res.headers, body_digest: sha256(res.body), body_length: res.body.byteLength };
    if (res.status < 200 || res.status >= 300) {
      return { ...failure('transport', { egress: null, message: `the destination answered ${res.status}`, status: res.status, body_digest: sha256(res.body), body_length: res.body.byteLength }), egress };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(res.body.toString('utf8')); } catch { parsed = undefined; }
    if (parsed === undefined || parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...failure('receipt_invalid', { egress: null, message: 'the destination answered with a body that is not a JSON object', status: res.status, body_digest: sha256(res.body), body_length: res.body.byteLength }), egress };
    }
    const receipt = parsed as Row;
    return { state: noticeReceiptState(receipt, n.packageDigest, n.noticeId), receipt, failureClass: null, egress };
  }

  /** A bounded JSON object read from the station's directory of the action (receipt.json, revocation-receipt.json): the D6 discipline. */
  private async readStationJson(endpoint: string, scope: { tenantId: string; domainId: string }, actionId: string, name: string): Promise<{ receipt: Row; path: string; byteLength: number }> {
    const dir = await this.stationDir(endpoint, scope, actionId);
    const full = resolve(dir, name);
    if (!contains(dir, full) || full === dir) throw new TransferStationRefused('containment', 'the resolved receipt path escapes the station directory');
    let size: number;
    try { size = (await stat(full)).size; } catch { throw new TransferStationRefused('no_receipt', `no receipt yet at ${full}`); }
    if (size > RECEIPT_MAX_BYTES) throw new TransferStationRefused('receipt_invalid', `the receipt at ${full} is ${size} bytes, above the ceiling of ${RECEIPT_MAX_BYTES}`);
    const bytes = await readFile(full);
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new TransferStationRefused('receipt_invalid', `the receipt at ${full} is not JSON`); }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TransferStationRefused('receipt_invalid', `the receipt at ${full} is not a JSON object`);
    return { receipt: parsed as Row, path: full, byteLength: bytes.byteLength };
  }
}

/** B14 (D3): what the notice executors deliver and record. */
export interface RevocationNotice {
  tenantId: string; domainId: string; actionId: string;
  noticeId: string; attempt: number;
  destinationKey: string; recipient: string;
  deliveryId: string; deliveryAttempt: number; deliveryState: string;
  packageDigest: string; archiveDigest: string; signingKeyId: string | null;
  revokedAt: string | null; reason: string | null; notifiedAt: string;
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
