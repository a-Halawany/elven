/**
 * Governed egress — PHASE1_PLAN §8.1, acceptance A10.
 *
 * Every network request a connector makes goes through this client, and every
 * control below is applied to EVERY hop of a redirect chain, not only the first.
 *
 * RESOLVE-THEN-CONNECT WITH A PINNED ADDRESS. The hostname is resolved here, all
 * resolved addresses are checked against the private/loopback/link-local/CGNAT/
 * cloud-metadata ranges, and the connection is then made TO THE PINNED ADDRESS
 * with the original hostname preserved for TLS SNI and certificate verification.
 * That closes the DNS-rebinding window: the address that was vetted is the
 * address that is connected to, because nothing re-resolves in between.
 *
 * COMPLETE-ORIGIN CREDENTIAL SEMANTICS. Credentials — Authorization, Cookie, and
 * URL userinfo — are stripped whenever ANY component of the origin triple
 * (scheme, host, port) changes across a redirect. A scheme downgrade alone, a
 * host change alone, and a port change alone each constitute a new origin. This
 * is stricter than the common "same host is same origin" reading, and
 * deliberately so: an https→http hop to the same host and port still moves the
 * credential onto the wire in the clear.
 */
import { Agent, request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import type { IncomingMessage } from 'node:http';
import { redactUrl } from './redaction.js';
import * as fault from '../fault-injection.js';

export interface EgressPolicy {
  /** Exact hosts the contract declares. A host not here is refused, not warned about. */
  hostAllowlist: string[];
  schemeAllowlist: string[];
  maxRedirects: number;
  timeoutMs: number;
  maxResponseBytes: number;
  maxDecompressedBytes: number;
}

export type EgressRefusalClass =
  | 'scheme_not_allowed'
  | 'host_not_allowed'
  | 'address_not_public'
  | 'dns_failure'
  | 'too_many_redirects'
  | 'redirect_target_refused'
  | 'response_too_large'
  | 'decompressed_too_large'
  | 'timeout'
  | 'tls_failure'
  | 'transport_failure';

export class EgressRefused extends Error {
  constructor(readonly refusalClass: EgressRefusalClass, message: string) {
    super(message);
  }
}

export interface EgressResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  /** The FINAL url after redirects, redacted for storage. */
  finalUrlRedacted: string;
  hops: Array<{ urlRedacted: string; status: number; credentialsCarried: boolean }>;
  tlsVerified: boolean;
  originAllowlisted: boolean;
  pinnedAddress: string;
  retryAfterSeconds: number | null;
}

/** Response headers worth preserving as transport evidence. Nothing else is kept. */
const RETAINED_HEADERS = [
  'content-type', 'content-length', 'content-encoding', 'etag', 'last-modified',
  'date', 'retry-after', 'cache-control',
];

/**
 * Address ranges that a governed connector must never reach. Written out rather
 * than delegated to a package so the exact set is reviewable here.
 */
export function isForbiddenAddress(addr: string): boolean {
  const v = isIP(addr);
  if (v === 4) {
    const p = addr.split('.').map(Number) as [number, number, number, number];
    const [a, b] = p;
    if (a === 0) return true;                                  // "this network"
    if (a === 10) return true;                                 // RFC1918
    if (a === 127) return true;                                // loopback
    if (a === 169 && b === 254) return true;                   // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;          // RFC1918
    if (a === 192 && b === 168) return true;                   // RFC1918
    if (a === 192 && b === 0) return true;                     // IETF protocol assignments (incl. 192.0.0.192)
    if (a === 100 && b >= 64 && b <= 127) return true;         // RFC6598 CGNAT
    if (a === 198 && (b === 18 || b === 19)) return true;       // benchmarking
    if (a >= 224) return true;                                 // multicast + reserved + broadcast
    return false;
  }
  if (v === 6) {
    const a = addr.toLowerCase();
    if (a === '::' || a === '::1') return true;                // unspecified, loopback
    if (a.startsWith('fe80') || a.startsWith('fec0')) return true; // link-local, site-local
    if (a.startsWith('fc') || a.startsWith('fd')) return true; // unique local
    if (a.startsWith('ff')) return true;                       // multicast
    if (a.startsWith('::ffff:')) return isForbiddenAddress(a.slice(7)); // IPv4-mapped
    if (a.startsWith('64:ff9b:')) return true;                 // NAT64
    return false;
  }
  return true; // not an address at all
}

/** The origin triple. A change in ANY component is a different origin. */
export function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.hostname === b.hostname && effectivePort(a) === effectivePort(b);
}

function effectivePort(u: URL): string {
  if (u.port !== '') return u.port;
  return u.protocol === 'https:' ? '443' : u.protocol === 'http:' ? '80' : '';
}

function assertUrlPermitted(u: URL, policy: EgressPolicy): void {
  const scheme = u.protocol.replace(':', '');
  if (!policy.schemeAllowlist.includes(scheme)) {
    throw new EgressRefused('scheme_not_allowed', `scheme ${scheme} is not in the contract's scheme allowlist`);
  }
  if (!policy.hostAllowlist.includes(u.hostname.toLowerCase())) {
    throw new EgressRefused('host_not_allowed', `host ${u.hostname} is not in the contract's host allowlist`);
  }
}

/** Resolve every address and refuse if ANY of them is non-public. */
export async function resolveAndVet(hostname: string): Promise<string> {
  if (isIP(hostname) !== 0) {
    if (isForbiddenAddress(hostname)) {
      throw new EgressRefused('address_not_public', 'literal address is not publicly routable');
    }
    return hostname;
  }
  let addresses: LookupAddress[];
  try {
    addresses = await dnsLookup(hostname, { all: true });
  } catch {
    throw new EgressRefused('dns_failure', 'host could not be resolved');
  }
  if (addresses.length === 0) throw new EgressRefused('dns_failure', 'host resolved to no addresses');
  // EVERY resolved address is checked. A host that resolves to one public and one
  // private address is refused — the private one is the one an attacker controls.
  for (const a of addresses) {
    if (isForbiddenAddress(a.address)) {
      throw new EgressRefused('address_not_public', 'host resolves to a non-public address');
    }
  }
  return (addresses[0] as LookupAddress).address;
}

export interface EgressRequest {
  url: string;
  headers?: Record<string, string>;
  /** Credentials are passed separately so the redirect logic can drop them explicitly. */
  credentials?: { authorization?: string; cookie?: string };
  policy: EgressPolicy;
}

export async function egress(req: EgressRequest): Promise<EgressResult> {
  const policy = req.policy;
  let current = new URL(req.url);
  const initialOrigin = new URL(req.url);
  const hops: EgressResult['hops'] = [];
  let carryCredentials = true;
  let pinned = '';

  for (let hop = 0; hop <= policy.maxRedirects; hop += 1) {
    assertUrlPermitted(current, policy);
    // URL userinfo is a credential. It never travels, on any hop.
    if (current.username !== '' || current.password !== '') {
      current.username = '';
      current.password = '';
    }
    pinned = await resolveAndVet(current.hostname);

    const headers: Record<string, string> = {
      accept: '*/*',
      'accept-encoding': 'gzip, deflate, br',
      'user-agent': 'the-eye-observation/1.0 (+governed connector)',
      ...(req.headers ?? {}),
      host: current.host,
    };
    if (carryCredentials && req.credentials?.authorization !== undefined) {
      headers['authorization'] = req.credentials.authorization;
    }
    if (carryCredentials && req.credentials?.cookie !== undefined) {
      headers['cookie'] = req.credentials.cookie;
    }

    fault.at('f10.mid_acquisition');
    const res = await once(current, pinned, headers, policy);
    hops.push({ urlRedacted: redactUrl(current.toString()), status: res.status, credentialsCarried: carryCredentials });

    if (res.status >= 300 && res.status < 400 && typeof res.headers['location'] === 'string') {
      if (hop === policy.maxRedirects) {
        throw new EgressRefused('too_many_redirects', `redirect chain exceeded ${policy.maxRedirects} hops`);
      }
      let next: URL;
      try {
        next = new URL(res.headers['location'], current);
      } catch {
        throw new EgressRefused('redirect_target_refused', 'redirect target is not a valid URL');
      }
      // COMPLETE-ORIGIN SEMANTICS: scheme OR host OR port change ⇒ new origin
      // ⇒ credentials are dropped for this and every subsequent hop.
      if (!sameOrigin(initialOrigin, next)) carryCredentials = false;
      current = next;
      continue;
    }

    return {
      status: res.status,
      headers: res.headers,
      body: res.body,
      finalUrlRedacted: redactUrl(current.toString()),
      hops,
      tlsVerified: true, // rejectUnauthorized is never disabled; a TLS failure throws
      originAllowlisted: true,
      pinnedAddress: pinned,
      retryAfterSeconds: parseRetryAfter(res.headers['retry-after']),
    };
  }
  throw new EgressRefused('too_many_redirects', 'redirect chain exhausted');
}

function parseRetryAfter(v: string | undefined): number | null {
  if (v === undefined) return null;
  const seconds = Number(v);
  if (Number.isFinite(seconds)) return Math.max(0, Math.floor(seconds));
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

function once(url: URL, pinnedAddress: string, headers: Record<string, string>, policy: EgressPolicy): Promise<RawResponse> {
  return new Promise<RawResponse>((resolvePromise, reject) => {
    // The AGENT connects to the PINNED address; `servername` keeps SNI and
    // certificate verification bound to the real hostname, so pinning the address
    // does not weaken TLS identity in the slightest.
    const agent = new Agent({
      lookup: (_host, opts, cb) => {
        const family = isIP(pinnedAddress) === 6 ? 6 : 4;
        if ((opts as { all?: boolean }).all === true) {
          (cb as unknown as (e: null, a: LookupAddress[]) => void)(null, [{ address: pinnedAddress, family }]);
        } else {
          (cb as unknown as (e: null, a: string, f: number) => void)(null, pinnedAddress, family);
        }
      },
      keepAlive: false,
    });

    const r = httpsRequest(
      {
        protocol: url.protocol,
        host: url.hostname,
        servername: url.hostname,
        port: url.port === '' ? 443 : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers,
        agent,
        rejectUnauthorized: true, // never disabled
        timeout: policy.timeoutMs,
      },
      (res: IncomingMessage) => {
        const kept: Record<string, string> = {};
        for (const h of RETAINED_HEADERS) {
          const v = res.headers[h];
          if (typeof v === 'string') kept[h] = v;
        }
        const declared = Number(res.headers['content-length'] ?? NaN);
        if (Number.isFinite(declared) && declared > policy.maxResponseBytes) {
          res.destroy();
          reject(new EgressRefused('response_too_large', 'declared response length exceeds the contract budget'));
          return;
        }

        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const decoder =
          encoding === 'gzip' ? createGunzip()
          : encoding === 'deflate' ? createInflate()
          : encoding === 'br' ? createBrotliDecompress()
          : null;

        const chunks: Buffer[] = [];
        let raw = 0;
        let decoded = 0;
        const fail = (e: Error): void => { res.destroy(); reject(e); };

        res.on('data', (c: Buffer) => {
          raw += c.length;
          // The WIRE budget is enforced whether or not a length was declared.
          if (raw > policy.maxResponseBytes) {
            fail(new EgressRefused('response_too_large', 'response exceeded the contract byte budget'));
            return;
          }
          if (decoder === null) { chunks.push(c); decoded = raw; }
        });
        if (decoder !== null) {
          res.pipe(decoder);
          decoder.on('data', (c: Buffer) => {
            decoded += c.length;
            // The DECOMPRESSED budget is separate: a small compressed body that
            // expands past the ceiling is a compression bomb, not a large download.
            if (decoded > policy.maxDecompressedBytes) {
              decoder.destroy();
              fail(new EgressRefused('decompressed_too_large', 'decompressed response exceeded the contract budget'));
              return;
            }
            chunks.push(c);
          });
          decoder.on('error', () => fail(new EgressRefused('transport_failure', 'response could not be decoded')));
          decoder.on('end', () => resolvePromise({ status: res.statusCode ?? 0, headers: kept, body: Buffer.concat(chunks) }));
        } else {
          res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, headers: kept, body: Buffer.concat(chunks) }));
        }
        res.on('error', () => fail(new EgressRefused('transport_failure', 'response stream failed')));
      },
    );
    r.on('timeout', () => { r.destroy(); reject(new EgressRefused('timeout', 'request exceeded the contract timeout')); });
    r.on('error', (e: NodeJS.ErrnoException) => {
      const tls = typeof e.code === 'string' && (e.code.startsWith('ERR_TLS') || e.code.startsWith('CERT_') || e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || e.code === 'DEPTH_ZERO_SELF_SIGNED_CERT');
      reject(new EgressRefused(tls ? 'tls_failure' : 'transport_failure', tls ? 'TLS certificate verification failed' : 'transport failure'));
    });
    r.end();
  });
}
