/**
 * THE SIGNED REVOCATION NOTICE (CP-6 B17; D8, C7) — the scheme `eye-revocation-notice/1`: what a recipient of a revoked package
 * — a declared destination (B14) or, from B17 on, an importing domain of the tenant — can CHECK before it obeys. A notice today
 * carries no signature; a foreign origin's revocation can only be trusted on one the importer verifies against the key it
 * already holds for that origin — the exchange partner's (0076 §3: a partner IS a public key). So every notice the origin sends
 * is signed the way its packages are (export-signing.ts): Ed25519 over the ASCII hex of `sha256(JCS(notice without its
 * `signature` and `unsigned` members))`, the 64 bytes as base64, `key_id` the key's own name (`ed25519:<16 hex of sha256(SPKI)>`),
 * through the same store and primitive (`ExportSigningKeyStore.sign`, `verifySignature`).
 *
 * WHICH KEY (C7): the PACKAGE's — the key the manifest names (`export_packages.signing_key_id`), retired since or not, because that
 * is the key the recipient holds; when that key's reference is not bound in this deployment (declared on another host, or the
 * binding removed), the tenant's ACTIVE key signs instead and the notice SAYS so — `signed_with: 'active_key'`, `package_key_id:
 * <the package's>` — inside the signed bytes, so the statement cannot be added or removed unsigned. When neither key can sign the
 * notice carries `signature: null` and `unsigned: <why>`: an unsigned notice is a fact the recipient sees, never a silent
 * downgrade. The verifier admits the same party's rotated key on the importer's side (import.service.ts: a `key_mismatch` here is
 * retried against every other partner of the same party); a notice signed by a partner of ANOTHER party stays refused.
 *
 * Pure over its arguments except for the store's read of the process environment at the moment of signing; nothing here logs,
 * records or returns a private key.
 */
import { createPublicKey } from 'node:crypto';
import { contentDigest } from '@eye/contracts';
import { ExportSigningKeyStore, KEY_SIGNATURE_RE, keyIdOf, verifySignature } from './export-signing.js';

type Row = Record<string, unknown>;

export const NOTICE_SIGNATURE_SCHEME = 'eye-revocation-notice/1';
export interface NoticeSignature { scheme: typeof NOTICE_SIGNATURE_SCHEME; key_id: string; algorithm: 'Ed25519'; signature: string }

/** The key a notice is signed with: the id the records carry and the reference's NAME (the value is the store's, read at the signing). */
export interface NoticeSigningKey { keyId: string; ref: string }

/** The block as recorded on a signed notice. */
function signatureBlockOf(keyId: string, signature: string): NoticeSignature {
  return { scheme: NOTICE_SIGNATURE_SCHEME, key_id: keyId, algorithm: 'Ed25519', signature };
}

/** The members the signature binds — every member but the two the signing itself adds. */
function unsignedOf(notice: Row): Row {
  const { signature: _signature, unsigned: _unsigned, ...rest } = notice;
  return rest;
}

/** sha256 over the JCS of the notice WITHOUT its signature and unsigned members — the bytes the signature binds. */
export function noticeDigestOf(notice: Row): string {
  return contentDigest(unsignedOf(notice));
}

/**
 * The notice signed — with the package's key when it is bound here; else with the active key and the statement (C7); else unsigned
 * with the reason. `key` is the package's key (null for a /1 package that named none), `fallback` the tenant's active key (null when
 * it declares none); the same key given twice is tried once.
 */
export function signNotice(notice: Row, key: NoticeSigningKey | null, store: ExportSigningKeyStore, fallback: NoticeSigningKey | null = null): Row {
  const body = unsignedOf(notice);
  // A reference is USABLE for a key row only when the value bound under it DERIVES that row's key id — a binding that holds another
  // private key would label its signature with a key id no public key verifies (the build refuses the same case as signing_key_mismatch;
  // a rehearsal copy that binds its own key under the demonstration's reference is where it shows). Such a reference counts as unbound here.
  const usable = (k: NoticeSigningKey): boolean => { const d = store.derivePublic(k.ref); return d.ok && d.keyId === k.keyId; };
  if (key !== null && usable(key)) {
    const signature = store.sign(key.ref, noticeDigestOf(body));
    if (signature !== null) return { ...body, signature: signatureBlockOf(key.keyId, signature) };
  }
  const packageKeyUnbound = key === null ? null : `the package's signing key ${key.keyId} is not bound in this deployment (${key.ref}${key.ref.length > 0 && store.has(key.ref) ? ' derives another key' : ''})`;
  if (fallback !== null && (key === null || fallback.keyId !== key.keyId)) {
    // The fallback's statement lies INSIDE the signed bytes: a recipient holding the package's key learns, under the active key's signature, which key it must fetch.
    const stated: Row = { ...body, signed_with: 'active_key', package_key_id: key === null ? null : key.keyId };
    const signature = usable(fallback) ? store.sign(fallback.ref, noticeDigestOf(stated)) : null;
    if (signature !== null) return { ...stated, signature: signatureBlockOf(fallback.keyId, signature) };
    const activeUnbound = `the tenant's active export signing key ${fallback.keyId} is not bound in this deployment (${fallback.ref}${fallback.ref.length > 0 && store.has(fallback.ref) ? ' derives another key' : ''})`;
    return { ...body, signature: null, unsigned: `${packageKeyUnbound === null ? activeUnbound : `${packageKeyUnbound} and ${activeUnbound}`}; the notice is unsigned` };
  }
  if (packageKeyUnbound !== null) {
    return { ...body, signature: null, unsigned: `${packageKeyUnbound}${fallback === null ? ' and the tenant declares no active export signing key' : ''}; the notice is unsigned` };
  }
  return { ...body, signature: null, unsigned: 'the tenant declares no active export signing key; the notice is unsigned' };
}

export type NoticeVerification =
  | { ok: true; keyId: string; digest: string }
  | { ok: false; reason: 'unsigned' | 'malformed' | 'key_mismatch' | 'invalid'; detail: string; keyId: string | null; digest: string };

/**
 * The recipient's check: the signature block well-formed, its key the partner's (by id), the signature verifying over the digest of
 * the notice without its signature. A malformed input is a typed refusal, never a throw — the digest is answered in every case so the
 * refusal can be recorded against the bytes it judged.
 */
export function verifyNotice(notice: Row, publicKeyPem: string): NoticeVerification {
  const digest = noticeDigestOf(notice);
  const block = notice['signature'];
  if (block === null || block === undefined) return { ok: false, reason: 'unsigned', detail: 'the notice carries no signature', keyId: null, digest };
  if (typeof block !== 'object' || Array.isArray(block)) return { ok: false, reason: 'malformed', detail: 'the signature is not an object', keyId: null, digest };
  const sig = block as Row;
  const keyId = typeof sig['key_id'] === 'string' ? (sig['key_id'] as string) : null;
  if (sig['scheme'] !== NOTICE_SIGNATURE_SCHEME) return { ok: false, reason: 'malformed', detail: `the signature scheme is ${String(sig['scheme'] ?? '<none>')}, not ${NOTICE_SIGNATURE_SCHEME}`, keyId, digest };
  if (sig['algorithm'] !== 'Ed25519') return { ok: false, reason: 'malformed', detail: `the signature algorithm is ${String(sig['algorithm'] ?? '<none>')}, not Ed25519`, keyId, digest };
  if (keyId === null) return { ok: false, reason: 'malformed', detail: 'the signature names no key_id', keyId, digest };
  if (typeof sig['signature'] !== 'string' || !KEY_SIGNATURE_RE.test(sig['signature'])) return { ok: false, reason: 'malformed', detail: 'the signature is not the base64 of 64 bytes', keyId, digest };
  let partnerKeyId: string;
  try {
    const pub = createPublicKey({ key: publicKeyPem, format: 'pem' });
    if (pub.asymmetricKeyType !== 'ed25519') return { ok: false, reason: 'invalid', detail: "the partner's public key is not an Ed25519 key", keyId, digest };
    partnerKeyId = keyIdOf(pub.export({ format: 'der', type: 'spki' }));
  } catch {
    return { ok: false, reason: 'invalid', detail: "the partner's public key is not a PEM node parses", keyId, digest };
  }
  if (keyId !== partnerKeyId) return { ok: false, reason: 'key_mismatch', detail: `the notice is signed by key ${keyId}, not the partner's ${partnerKeyId}`, keyId, digest };
  if (!verifySignature(publicKeyPem, digest, sig['signature'])) return { ok: false, reason: 'invalid', detail: `the signature does not verify against the partner's key ${partnerKeyId}`, keyId, digest };
  return { ok: true, keyId, digest };
}
