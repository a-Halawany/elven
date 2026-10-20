/**
 * CP-6 B40 §CR — THE EGRESS GATEWAY (IA-28-001, IA-28-003, IA-28-005, IA-47-001; F-P1-12).
 *
 * One gateway per cell run, on LOOPBACK (127.0.0.1, an ephemeral port), authenticated by a per-run random token handed to the cell in its
 * start frame. It is the cell's only INTENDED egress (D3: the permission model has no network switch — a direct socket is not prevented by
 * the OS here; network-level denial is B103 / B109, then R1). Every request the cell asks for is decided here, IN THIS ORDER, and every
 * decision leaves a TRANSFER RECEIPT:
 *   1. the cell token                    a caller without the run's token is refused (`cell_token`)
 *   2. the request                        GET only (a cell acquires; it never sends data out — `method`), https only (`scheme`), no userinfo
 *   3. the registered destination         the host is one the CONTRACT registers (its endpoints) AND the PACKAGE declares — else
 *                                         `unregistered_destination`: BLOCKING (the run fails closed, the contract is suspended, requalification)
 *   4. the purpose and the data class     each named by the package and (purpose) by the contract — else `purpose` / `data_class`
 *   5. the budget                         the run's budget meter (requests, then bytes) — `budget`
 *   6. the rate                           §AP's THROTTLE STAGE, through the lifecycle's hook (IntakeStages.throttle — never a second bucket)
 *   7. the transport                      replay: the frozen set's recorded answer; live: resolve EVERY address and vet it (B13/B14's rule:
 *                                         no private, loopback, link-local or reserved address), connect TLS to the PINNED address with the
 *                                         host's identity (SNI + certificate verification; a declared trust anchor narrows it), read the peer's
 *                                         SPKI and compare it with the pins BEFORE a single request byte is written — a changed identity is
 *                                         `destination_identity_changed`: BLOCKING (the exchange quarantined, the request preserved)
 *   8. the credential                     injected HERE, on this request only, in the header the binding names — never in the cell, never
 *                                         on a receipt (the receipt names the REFERENCE)
 * A redirect is never followed by the gateway: a 3xx goes back to the cell, whose next request is decided anew.
 * The answer the cell gets: the status, the retained headers and the body — nothing of the credential, the addresses or another run.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { lookup as dnsLookup } from 'node:dns/promises';
import { createHash, randomBytes, timingSafeEqual, X509Certificate } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { isIP } from 'node:net';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { isForbiddenAddress } from '../connectors/http-client.js';
import { redactUrl } from '../connectors/redaction.js';
import type { ReplayResponder } from '../connectors/replay.js';
import * as fault from '../fault-injection.js';

export const GATEWAY_PATH = '/v1/fetch';
export const GATEWAY_TOKEN_HEADER = 'x-eye-cell-token';
const RETAINED_HEADERS = ['content-type', 'content-length', 'etag', 'last-modified', 'date', 'retry-after', 'cache-control', 'location'];

/** The classes a receipt may carry (0123_b40_x_cr egress_receipts.refusal_class). BLOCKING ones fail the run and suspend the contract. */
export type RefusalClass =
  | 'cell_token' | 'request' | 'scheme' | 'method' | 'unregistered_destination' | 'purpose' | 'data_class' | 'budget' | 'throttle'
  | 'destination_identity_changed' | 'address_not_public' | 'dns_failure' | 'tls_failure' | 'timeout' | 'transport' | 'response_too_large'
  | 'replay_missing' | 'contract_test';
export const BLOCKING_CLASSES: ReadonlySet<RefusalClass> = new Set(['unregistered_destination', 'destination_identity_changed']);

/** Who the destination was: the resolved and pinned addresses and the TLS SPKI (live), or the replay set's recorded answer. */
export interface DestinationIdentity {
  mode: 'live' | 'replay' | 'none';
  addresses?: string[];
  pinned_address?: string;
  tls_spki_sha256?: string;
  /** first_use: no pin was recorded, this answer pins it · matched: the recorded pin · declared: a pin the contract declares · changed: neither */
  pin_state?: 'first_use' | 'matched' | 'declared' | 'changed';
  /** The pinned SPKI the presented one was compared with (a changed identity names both). */
  expected_spki_sha256?: string[];
  /** The address set moved while the SPKI held (a CDN's rotation is not an identity change; recorded, not blocked). */
  address_drift?: boolean;
  replay_set?: string;
  replay_entry_sha256?: string;
  replay_retrieved_at?: string;
}

/** One transfer receipt, as the port records it (never bytes: digests and counts). */
export interface EgressReceipt {
  receipt_id: string;
  seq: number;
  package_id: string | null;
  package_digest: string | null;
  requested_at: string;
  method: string;
  url_redacted: string;
  host: string;
  purpose: string | null;
  data_class: string | null;
  decision: 'allowed' | 'refused' | 'blocked';
  refusal_class: RefusalClass | null;
  reason: string | null;
  request_digest: string;
  request_bytes: number;
  response_status: number | null;
  response_digest: string | null;
  response_bytes: number | null;
  destination: DestinationIdentity;
  credential_injected: boolean;
  credential_ref: string | null;
}

export class TransportRefusal extends Error {
  constructor(readonly refusalClass: RefusalClass, message: string, readonly destination: DestinationIdentity = { mode: 'none' }) {
    super(message);
  }
}

export interface TransportRequest {
  url: URL;
  accept: string | null;
  credential: { header: string; value: string } | null;
  maxResponseBytes: number;
  timeoutMs: number;
}
export interface TransportAnswer { status: number; headers: Record<string, string>; body: Buffer; destination: DestinationIdentity }
export interface Transport {
  readonly mode: 'live' | 'replay' | 'none';
  fetch(req: TransportRequest): Promise<TransportAnswer>;
}

/* ── the transports ───────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** The frozen set's recorded answer (the replay responder verifies each fixture's digest on every read). */
export class ReplayTransport implements Transport {
  readonly mode = 'replay' as const;
  constructor(private readonly responder: ReplayResponder, private readonly set: string) {}
  async fetch(req: TransportRequest): Promise<TransportAnswer> {
    const got = await this.responder.fetch(this.set, req.url.toString());
    const destination: DestinationIdentity = { mode: 'replay', replay_set: this.set };
    if (got === null) throw new TransportRefusal('replay_missing', `the replay set ${this.set} holds no recorded answer for this request`, destination);
    if (got.body.byteLength > req.maxResponseBytes) throw new TransportRefusal('response_too_large', 'the recorded answer exceeds the contract byte budget', destination);
    return { status: got.entry.status, headers: { ...got.entry.retained_headers }, body: got.body,
      destination: { ...destination, replay_entry_sha256: got.entry.sha256, replay_retrieved_at: got.entry.retrieved_at } };
  }
}

/** A contract-test cell with no recorded set answers nothing: every request is refused `contract_test` (and recorded). */
export class NoEgressTransport implements Transport {
  readonly mode = 'none' as const;
  async fetch(): Promise<TransportAnswer> {
    throw new TransportRefusal('contract_test', 'a contract test makes no live request: the destination check is the test');
  }
}

/** The pins a live transport compares the presented identity with. */
export interface PinSet {
  /** Pins the contract DECLARES (SRC@v4 authenticity.tls_spki_pins; base64 sha256 of the SPKI): when present, the only identities accepted. */
  declared: string[];
  /** Pins recorded by earlier runs, per host (first use). */
  recorded: Map<string, { spki: string; addresses: string[] }>;
}

/** Resolve EVERY address of a host and refuse if any is non-public (B13/B14's vetting rule — http-client.ts isForbiddenAddress). */
export async function resolveAllVetted(hostname: string): Promise<string[]> {
  if (isIP(hostname) !== 0) {
    if (isForbiddenAddress(hostname)) throw new TransportRefusal('address_not_public', 'literal address is not publicly routable');
    return [hostname];
  }
  let addresses: Array<{ address: string }>;
  try { addresses = await dnsLookup(hostname, { all: true }); } catch { throw new TransportRefusal('dns_failure', 'host could not be resolved'); }
  if (addresses.length === 0) throw new TransportRefusal('dns_failure', 'host resolved to no addresses');
  for (const a of addresses) if (isForbiddenAddress(a.address)) throw new TransportRefusal('address_not_public', 'host resolves to a non-public address');
  return addresses.map((a) => a.address);
}

/** The SPKI of a certificate as a pin: base64 of sha256 over the DER SubjectPublicKeyInfo (the HPKP form SRC@v4 declares). */
export function spkiPinOf(der: Buffer): string {
  const spki = new X509Certificate(der).publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(spki).digest('base64');
}

/**
 * THE LIVE TRANSPORT: resolve and vet every address, connect TLS to the pinned one with the host's identity, compare the SPKI with the pins
 * BEFORE the request is written, then one GET with the credential (this request only), bounded by size and time; no redirect followed.
 * `resolve` is the vetting resolver; a harness substitutes it (loopback) ONLY in the test runtime — B14's one transport substitution.
 */
export class LiveTransport implements Transport {
  readonly mode = 'live' as const;
  constructor(private readonly pins: PinSet, private readonly opts: { resolve?: (host: string) => Promise<string[]>; trustAnchorPem?: string } = {}) {}

  async fetch(req: TransportRequest): Promise<TransportAnswer> {
    const host = req.url.hostname.toLowerCase();
    const addresses = await (this.opts.resolve ?? resolveAllVetted)(host);
    const pinned = addresses[0] as string;
    const port = req.url.port === '' ? 443 : Number(req.url.port);
    const socket = await new Promise<TLSSocket>((resolveSocket, reject) => {
      const s = tlsConnect({ host: pinned, port, servername: host, rejectUnauthorized: true, ...(this.opts.trustAnchorPem === undefined ? {} : { ca: this.opts.trustAnchorPem }) });
      const timer = setTimeout(() => { s.destroy(); reject(new TransportRefusal('timeout', 'the TLS handshake exceeded the contract timeout', { mode: 'live', addresses, pinned_address: pinned })); }, req.timeoutMs);
      s.once('secureConnect', () => { clearTimeout(timer); resolveSocket(s); });
      s.once('error', (e: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        const tls = typeof e.code === 'string' && (e.code.startsWith('ERR_TLS') || e.code.startsWith('CERT_') || e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || e.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || e.code === 'SELF_SIGNED_CERT_IN_CHAIN');
        reject(new TransportRefusal(tls ? 'tls_failure' : 'transport', tls ? 'TLS certificate verification failed' : 'the destination could not be reached', { mode: 'live', addresses, pinned_address: pinned }));
      });
    });
    const raw = socket.getPeerCertificate(false)?.raw;
    if (raw === undefined) { socket.destroy(); throw new TransportRefusal('tls_failure', 'the destination presented no certificate', { mode: 'live', addresses, pinned_address: pinned }); }
    const spki = spkiPinOf(raw);
    const recorded = this.pins.recorded.get(host);
    let pinState: DestinationIdentity['pin_state'];
    let expected: string[] = [];
    if (this.pins.declared.length > 0) { expected = this.pins.declared; pinState = this.pins.declared.includes(spki) ? 'declared' : 'changed'; }
    else if (recorded !== undefined) { expected = [recorded.spki]; pinState = recorded.spki === spki ? 'matched' : 'changed'; }
    else pinState = 'first_use';
    const destination: DestinationIdentity = {
      mode: 'live', addresses, pinned_address: pinned, tls_spki_sha256: spki, pin_state: pinState,
      ...(expected.length > 0 ? { expected_spki_sha256: expected } : {}),
      ...(recorded !== undefined && pinState === 'matched' ? { address_drift: !addresses.some((a) => recorded.addresses.includes(a)) } : {}),
    };
    if (pinState === 'changed') {
      socket.destroy();   // not one request byte was written to the changed destination
      throw new TransportRefusal('destination_identity_changed',
        `the destination ${host} presented TLS identity ${spki}, not the pinned ${expected.join(' / ')}; the request was not sent`, destination);
    }
    const headers: Record<string, string> = {
      accept: req.accept ?? '*/*', 'accept-encoding': 'gzip, deflate, br', 'user-agent': 'the-eye-connector-cell/1.0 (+egress gateway)', host: req.url.host,
    };
    if (req.credential !== null) headers[req.credential.header.toLowerCase()] = req.credential.value;
    return new Promise<TransportAnswer>((done, reject) => {
      // the HTTP exchange is written onto the TLS socket ALREADY verified and pinned above (no second resolution, no second handshake)
      const r = httpRequest({
        host, port, path: `${req.url.pathname}${req.url.search}`, method: 'GET', headers,
        createConnection: () => socket, timeout: req.timeoutMs,
      }, (res) => {
        const kept: Record<string, string> = {};
        for (const h of RETAINED_HEADERS) { const v = res.headers[h]; if (typeof v === 'string') kept[h] = v; }
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const decoder = enc === 'gzip' ? createGunzip() : enc === 'deflate' ? createInflate() : enc === 'br' ? createBrotliDecompress() : null;
        const chunks: Buffer[] = []; let n = 0;
        const fail = (e: TransportRefusal) => { res.destroy(); reject(e); };
        const take = (c: Buffer) => { n += c.byteLength; if (n > req.maxResponseBytes) { fail(new TransportRefusal('response_too_large', 'the answer exceeded the contract byte budget', destination)); return; } chunks.push(c); };
        if (decoder === null) { res.on('data', take); res.on('end', () => done({ status: res.statusCode ?? 0, headers: kept, body: Buffer.concat(chunks), destination })); }
        else {
          res.pipe(decoder); decoder.on('data', take);
          decoder.on('error', () => fail(new TransportRefusal('transport', 'the answer could not be decoded', destination)));
          decoder.on('end', () => done({ status: res.statusCode ?? 0, headers: kept, body: Buffer.concat(chunks), destination }));
        }
        res.on('error', () => fail(new TransportRefusal('transport', 'the answer stream failed', destination)));
      });
      r.on('timeout', () => { r.destroy(); reject(new TransportRefusal('timeout', 'the request exceeded the contract timeout', destination)); });
      r.on('error', () => reject(new TransportRefusal('transport', 'transport failure', destination)));
      r.on('close', () => socket.destroy());
      r.end();
    });
  }
}

/* ── the gateway ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface GatewayPolicy {
  /** The hosts the CONTRACT registers (its endpoints' hosts). */
  contractHosts: string[];
  /** The hosts the PACKAGE declares (its manifest's declared_destinations). A request goes out only to a host in both. */
  packageHosts: string[];
  /** The purposes a request may name: the package's that the contract also names. The first is the default. */
  purposes: string[];
  /** The package's data classes. The first is the default. */
  dataClasses: string[];
  schemes: string[];
  maxResponseBytes: number;
  timeoutMs: number;
  package: { id: string; digest: string } | null;
  /** The credential the gateway injects (the binding in force); its VALUE never leaves the gateway — the receipt names the reference. */
  credential: { ref: string; header: string; value: string } | null;
}
export interface GatewayHooks {
  /** The run's budget meter: spend a request before it goes, bytes after they arrive; throws to refuse. */
  spendRequest?: () => void;
  spendBytes?: (n: number) => void;
  /** §AP's throttle stage through the lifecycle (AcquisitionContext.throttle); throws to refuse. */
  throttle?: (request: { endpoint: string }) => Promise<void>;
}

export class EgressGateway {
  readonly receipts: EgressReceipt[] = [];
  /** The first BLOCKING refusal (an unregistered destination, a changed identity): the run fails closed and the contract is suspended for it. */
  blocking: { refusalClass: RefusalClass; receiptId: string; detail: string; host: string } | null = null;
  /** The first refusal raised by the RUN's own controls (the budget, the throttle): rethrown as is, so the run records it as the lifecycle does. */
  runError: unknown = null;
  /** The exchange a changed identity blocked: preserved (the request and both identities) for its quarantine case. */
  blockedExchange: { receipt: EgressReceipt; request: Record<string, unknown> } | null = null;
  private server: Server | null = null;
  private readonly token = randomBytes(32).toString('base64url');
  private seq = 0;
  private bytesIn = 0;

  constructor(private readonly policy: GatewayPolicy, private readonly transport: Transport, private readonly hooks: GatewayHooks = {}) {}

  get destinations(): string[] {
    const pkg = new Set(this.policy.packageHosts.map((h) => h.toLowerCase()));
    return [...new Set(this.policy.contractHosts.map((h) => h.toLowerCase()))].filter((h) => pkg.has(h)).sort();
  }
  get bytesTransferred(): number { return this.bytesIn; }
  get requestsMade(): number { return this.receipts.filter((r) => r.decision === 'allowed').length; }

  /** Listen on loopback (an ephemeral port). F54: a gateway that cannot start runs no cell — the run fails closed before any request. */
  async start(): Promise<{ url: string; token: string }> {
    fault.at('f54.gateway_down');
    const server = createServer((req, res) => { void this.handle(req, res); });
    await new Promise<void>((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', () => ok()); });
    this.server = server;
    const port = (server.address() as AddressInfo).port;
    return { url: `http://127.0.0.1:${port}/`, token: this.token };
  }
  async stop(): Promise<void> {
    const s = this.server;
    this.server = null;
    if (s !== null) await new Promise<void>((ok) => { s.close(() => ok()); s.closeAllConnections?.(); });
  }

  private reply(res: ServerResponse, status: number, body: Record<string, unknown>): void {
    const b = Buffer.from(JSON.stringify(body), 'utf8');
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(b.byteLength) });
    res.end(b);
  }

  private receipt(base: Omit<EgressReceipt, 'receipt_id' | 'seq' | 'package_id' | 'package_digest' | 'credential_injected' | 'credential_ref'> & { credentialInjected?: boolean }): EgressReceipt {
    this.seq += 1;
    const { credentialInjected, ...rest } = base;
    const r: EgressReceipt = {
      receipt_id: cryptoUuid(), seq: this.seq, package_id: this.policy.package?.id ?? null, package_digest: this.policy.package?.digest ?? null,
      ...rest, credential_injected: credentialInjected === true, credential_ref: credentialInjected === true ? this.policy.credential?.ref ?? null : null,
    };
    this.receipts.push(r);
    return r;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestedAt = new Date().toISOString();
    const refuse = (cls: RefusalClass, reason: string, fields: Partial<EgressReceipt> & { url_redacted: string; host: string; request_digest: string; request_bytes: number },
                   destination: DestinationIdentity = { mode: 'none' }, status = 403): EgressReceipt => {
      const r = this.receipt({ requested_at: requestedAt, method: fields.method ?? 'GET', url_redacted: fields.url_redacted, host: fields.host,
        purpose: fields.purpose ?? null, data_class: fields.data_class ?? null, decision: BLOCKING_CLASSES.has(cls) ? 'blocked' : 'refused', refusal_class: cls,
        reason: reason.slice(0, 1000), request_digest: fields.request_digest, request_bytes: fields.request_bytes, response_status: null, response_digest: null,
        response_bytes: null, destination });
      if (BLOCKING_CLASSES.has(cls) && this.blocking === null) this.blocking = { refusalClass: cls, receiptId: r.receipt_id, detail: reason, host: fields.host };
      this.reply(res, status, { ok: false, class: cls, reason });
      return r;
    };
    const empty = sha256Hex('');
    // 1. the cell token (constant-time)
    const presented = Buffer.from(String(req.headers[GATEWAY_TOKEN_HEADER] ?? ''), 'utf8');
    const expected = Buffer.from(this.token, 'utf8');
    if (req.method !== 'POST' || req.url !== GATEWAY_PATH || presented.byteLength !== expected.byteLength || !timingSafeEqual(presented, expected)) {
      req.resume();
      refuse('cell_token', 'the gateway serves only the cell of this run (its token)', { url_redacted: '(unauthenticated)', host: '-', request_digest: empty, request_bytes: 0 }, { mode: 'none' }, 401);
      return;
    }
    // 2. the request
    let body: Record<string, unknown>;
    try { body = JSON.parse((await readBounded(req, 64 * 1024)).toString('utf8')) as Record<string, unknown>; }
    catch { refuse('request', 'the request is a JSON object of at most 64 KiB', { url_redacted: '(unreadable)', host: '-', request_digest: empty, request_bytes: 0 }); return; }
    const method = typeof body['method'] === 'string' ? (body['method'] as string).toUpperCase().slice(0, 16) : 'GET';
    let url: URL;
    try { url = new URL(String(body['url'] ?? '')); } catch { refuse('request', 'the request names no valid URL', { url_redacted: '(invalid)', host: '-', request_digest: empty, request_bytes: 0, method }); return; }
    if (url.username !== '' || url.password !== '') { url.username = ''; url.password = ''; }
    const accept = typeof body['accept'] === 'string' ? (body['accept'] as string).slice(0, 200) : null;
    const descriptor = { method, url: url.toString(), accept };
    const reqBytes = Buffer.byteLength(JSON.stringify(descriptor), 'utf8');
    // what the request says it is for (recorded on every receipt from here on; checked at step 4)
    const purpose = typeof body['purpose'] === 'string' ? (body['purpose'] as string).slice(0, 200) : this.policy.purposes[0] ?? null;
    const dataClass = typeof body['data_class'] === 'string' ? (body['data_class'] as string).slice(0, 200) : this.policy.dataClasses[0] ?? null;
    const f = { url_redacted: redactUrl(url.toString()).slice(0, 2048), host: url.hostname.toLowerCase().slice(0, 255) || '-', request_digest: sha256Hex(JSON.stringify(descriptor)), request_bytes: reqBytes, method,
      purpose, data_class: dataClass };
    if (method !== 'GET') { refuse('method', 'a cell acquires: only GET leaves through the gateway, never a body', f); return; }
    if (!this.policy.schemes.includes(url.protocol.replace(':', ''))) { refuse('scheme', `scheme ${url.protocol.replace(':', '')} is not in the contract's scheme allowlist`, f); return; }
    // 3. the registered destination
    const host = url.hostname.toLowerCase();
    if (!this.destinations.includes(host)) {
      const why = !this.policy.contractHosts.map((h) => h.toLowerCase()).includes(host)
        ? `host ${host} is not a destination the contract registers (${this.policy.contractHosts.join(', ') || 'none'})`
        : `host ${host} is not a destination the package declares (${this.policy.packageHosts.join(', ') || 'none'})`;
      refuse('unregistered_destination', why, f);
      return;
    }
    // 4. the purpose and the data class
    const g = f;
    if (purpose === null || !this.policy.purposes.includes(purpose)) {
      refuse('purpose', `purpose ${JSON.stringify(purpose)} is not one the package and the contract both name (${this.policy.purposes.join('; ') || 'none'})`, g); return;
    }
    if (dataClass === null || !this.policy.dataClasses.includes(dataClass)) {
      refuse('data_class', `data class ${JSON.stringify(dataClass)} is not one the package declares (${this.policy.dataClasses.join('; ') || 'none'})`, g); return;
    }
    // 5. the budget, 6. the rate (§AP's stage) — a refusal here is the RUN's: kept and rethrown by the cell connector
    try { this.hooks.spendRequest?.(); }
    catch (e) { if (this.runError === null) this.runError = e; refuse('budget', e instanceof Error ? e.message : 'the run budget is spent', g); return; }
    try { await this.hooks.throttle?.({ endpoint: url.toString() }); }
    catch (e) { if (this.runError === null) this.runError = e; refuse('throttle', e instanceof Error ? e.message : 'the rate stage refused the request', g); return; }
    // 7. the transport, 8. the credential (injected here; never in the cell)
    let answer: TransportAnswer;
    try {
      answer = await this.transport.fetch({ url, accept, credential: this.policy.credential === null ? null : { header: this.policy.credential.header, value: this.policy.credential.value },
        maxResponseBytes: this.policy.maxResponseBytes, timeoutMs: this.policy.timeoutMs });
    } catch (e) {
      if (e instanceof TransportRefusal) {
        const r = refuse(e.refusalClass, e.message, g, e.destination);
        if (e.refusalClass === 'destination_identity_changed' && this.blockedExchange === null) {
          this.blockedExchange = { receipt: r, request: { ...descriptor, url: f.url_redacted, purpose, data_class: dataClass,
            credential: this.policy.credential === null ? null : { ref: this.policy.credential.ref, header: this.policy.credential.header, injected: false } } };
        }
        return;
      }
      if (this.runError === null) this.runError = e;   // a replay fixture that fails its digest, an unexpected fault: the run's error
      refuse('transport', e instanceof Error ? e.message.slice(0, 300) : 'transport failure', g);
      return;
    }
    try { this.hooks.spendBytes?.(answer.body.byteLength); }
    catch (e) { if (this.runError === null) this.runError = e; refuse('budget', e instanceof Error ? e.message : 'the run byte budget is spent', g, answer.destination); return; }
    this.bytesIn += answer.body.byteLength;
    this.receipt({ requested_at: requestedAt, method, url_redacted: f.url_redacted, host: f.host, purpose, data_class: dataClass, decision: 'allowed', refusal_class: null,
      reason: null, request_digest: f.request_digest, request_bytes: reqBytes, response_status: answer.status, response_digest: sha256Hex(answer.body),
      response_bytes: answer.body.byteLength, destination: answer.destination, credentialInjected: this.policy.credential !== null && this.transport.mode === 'live' });
    this.reply(res, 200, { ok: true, status: answer.status, headers: answer.headers, body_b64: answer.body.toString('base64') });
  }
}

function sha256Hex(b: Uint8Array | string): string { return createHash('sha256').update(b).digest('hex'); }
function cryptoUuid(): string { return globalThis.crypto.randomUUID(); }
function readBounded(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((done, reject) => {
    const chunks: Buffer[] = []; let n = 0;
    req.on('data', (c: Buffer) => { n += c.byteLength; if (n > max) { req.destroy(); reject(new Error('too large')); return; } chunks.push(c); });
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
