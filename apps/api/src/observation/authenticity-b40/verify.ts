/**
 * CP-6 B40 §VA (F-P1-02: L1-C06, AI-39-003; DESIGN D6) — THE PUBLISHER-SIGNATURE CHECK, pure: given the contract's declared scheme, the item's
 * bytes, the signature the item was presented with and the publisher keys IN FORCE, answer one of
 *
 *   verified        a key in force verified the signature over these exact bytes (the key named)
 *   failed          a signature was presented and keys are in force, and none verifies it — ADMITTED MARKED (D6), refused at decision-active use
 *   unknown_signer  a signature was presented and no key in force can be its signer (none declared / all retired / outside validity, or a JWS
 *                   `kid` naming no key in force) — QUARANTINED (D6, the B16 rule)
 *   unsigned        the contract declares a scheme and the item carried no signature (or the scheme is `none`)
 *
 * (`unavailable` — the check could not be made — is the stage's answer when this function or the key read throws.) No new dependency:
 * Ed25519 through node:crypto, JWS (EdDSA) through the existing `jose`. Nothing here reads content beyond the bytes it verifies; no key
 * literal exists in this file or its tests (keys are generated at run time).
 */
import { createHash, createPublicKey, verify as cryptoVerify, type KeyObject } from 'node:crypto';

export type SignatureScheme = 'none' | 'ed25519_detached' | 'jws';
export interface IntakeKey {
  key_id: string; key_ref: string; kind: 'signing_key' | 'tls_spki_pin'; algorithm: string; fingerprint: string; public_key_pem: string | null;
  valid_from: string | null; valid_to: string | null;
}
export type CheckOutcome =
  | { outcome: 'verified'; key: IntakeKey; tried: number; statement: string }
  | { outcome: 'failed'; tried: number; statement: string }
  | { outcome: 'unknown_signer'; tried: number; statement: string }
  | { outcome: 'unsigned'; tried: 0; statement: string };

/** The header a detached signature travels in (an operator upload carries the one the operator supplied; a replayed response its recorded header). */
export const SIGNATURE_HEADER = 'x-publisher-signature';
const MAX_SIGNATURE = 8192;

/** The keys IN FORCE at the instant: signing keys, valid at `at`, and — when the contract names key references — one of those. */
export function keysInForce(keys: IntakeKey[], at: Date, keyRefs: string[]): IntakeKey[] {
  const t = at.getTime();
  return keys.filter((k) => k.kind === 'signing_key' && k.public_key_pem !== null
    && (k.valid_from === null || Date.parse(k.valid_from) <= t) && (k.valid_to === null || Date.parse(k.valid_to) > t)
    && (keyRefs.length === 0 || keyRefs.includes(k.key_ref)));
}

/** The signature the item was presented with, by scheme: the detached header, or (jws) an attached compact JWS body. Null: none. */
export function presentedSignature(scheme: SignatureScheme, bytes: Uint8Array, headers: Record<string, string>): string | null {
  const h = Object.entries(headers).find(([k]) => k.toLowerCase() === SIGNATURE_HEADER)?.[1]?.trim() ?? '';
  if (h !== '') return h.length > MAX_SIGNATURE ? h.slice(0, MAX_SIGNATURE) : h;
  if (scheme === 'jws' && bytes.byteLength <= 4 * 1024 * 1024) {
    const body = Buffer.from(bytes).toString('utf8').trim();
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body)) return body;
  }
  return null;
}

/** sha256 (hex) of a presented signature — what the ledger and the custody entry name besides the signature itself. */
export const signatureDigest = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

function b64url(b: Uint8Array): string { return Buffer.from(b).toString('base64url'); }
const pub = (k: IntakeKey): KeyObject => createPublicKey(k.public_key_pem as string);

/** THE CHECK. Throws only on a fault of its own (the stage records that as `unavailable`, never as verified). */
export async function checkSignature(a: { scheme: SignatureScheme; bytes: Uint8Array; signature: string | null; keys: IntakeKey[] }): Promise<CheckOutcome> {
  if (a.scheme === 'none') return { outcome: 'unsigned', tried: 0, statement: 'the source contract declares no publisher signature scheme — content authenticity unknown' };
  if (a.signature === null || a.signature === '') {
    return { outcome: 'unsigned', tried: 0, statement: `the source contract declares ${a.scheme}, and this item carried no signature — content authenticity unknown (it is not verified)` };
  }
  if (a.scheme === 'ed25519_detached') {
    if (a.keys.length === 0) {
      return { outcome: 'unknown_signer', tried: 0, statement: 'a detached Ed25519 signature was presented and no publisher key of this source is in force — the signer is unknown' };
    }
    const sig = /^[A-Za-z0-9+/]+={0,2}$/.test(a.signature) ? Buffer.from(a.signature, 'base64') : Buffer.alloc(0);
    if (sig.byteLength !== 64) {
      return { outcome: 'failed', tried: 0, statement: 'the presented signature is not a 64-byte Ed25519 signature (base64) — it cannot be the publisher\'s' };
    }
    let tried = 0;
    for (const k of a.keys) {
      tried += 1;
      if (cryptoVerify(null, a.bytes, pub(k), sig)) {
        return { outcome: 'verified', key: k, tried, statement: `the detached Ed25519 signature verified with the publisher key ${k.fingerprint} (${k.key_ref}) over these exact bytes` };
      }
    }
    return { outcome: 'failed', tried, statement: `the detached Ed25519 signature did not verify with any of the ${tried} publisher key(s) in force — these bytes are not what the publisher signed` };
  }
  // JWS (EdDSA): an attached compact JWS (the body), or a detached one (header..signature) over the item's bytes
  const parts = a.signature.split('.');
  if (parts.length !== 3) return { outcome: 'failed', tried: 0, statement: 'the presented JWS is not a compact serialization (three dot-separated parts)' };
  let header: { alg?: unknown; kid?: unknown; b64?: unknown; crit?: unknown };
  try { header = JSON.parse(Buffer.from(parts[0] as string, 'base64url').toString('utf8')) as typeof header; }
  catch { return { outcome: 'failed', tried: 0, statement: 'the presented JWS header does not decode' }; }
  if (header.alg !== 'EdDSA') return { outcome: 'failed', tried: 0, statement: `the presented JWS uses ${String(header.alg)}; only EdDSA (Ed25519) is accepted` };
  if (header.b64 !== undefined || header.crit !== undefined) return { outcome: 'failed', tried: 0, statement: 'the presented JWS carries b64 / crit header parameters, which are not accepted' };
  const candidates = typeof header.kid === 'string' ? a.keys.filter((k) => k.key_ref === header.kid || k.fingerprint === header.kid) : a.keys;
  if (candidates.length === 0) {
    return { outcome: 'unknown_signer', tried: 0,
      statement: typeof header.kid === 'string' ? `the JWS names key ${header.kid}, which is not a publisher key of this source in force — the signer is unknown`
        : 'a JWS was presented and no publisher key of this source is in force — the signer is unknown' };
  }
  const compact = parts[1] === '' ? `${parts[0]}.${b64url(a.bytes)}.${parts[2]}` : a.signature;
  const { compactVerify } = await import('jose');
  let tried = 0;
  for (const k of candidates) {
    tried += 1;
    try {
      await compactVerify(compact, pub(k), { algorithms: ['EdDSA'] });
      return { outcome: 'verified', key: k, tried, statement: `the ${parts[1] === '' ? 'detached' : 'attached'} JWS (EdDSA) verified with the publisher key ${k.fingerprint} (${k.key_ref})` };
    } catch { /* the next key */ }
  }
  return { outcome: 'failed', tried, statement: `the JWS (EdDSA) did not verify with ${tried === 1 ? 'the publisher key it names' : `any of the ${tried} publisher key(s) in force`} — these bytes are not what the publisher signed` };
}
