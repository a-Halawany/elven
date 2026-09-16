/**
 * KEY-BASED SIGNING of the customer export (CP-6 B13; D3) — the scheme `eye-customer-export/2` — and the two credential
 * stores the delivery capabilities read, each the source credential store's discipline (B11, source-credentials.ts) under its
 * own prefix:
 *
 *   ExportSigningKeyStore    `EYE_EXPORT_SIGNING_KEY_<NAME>` — a one-line base64 of the PKCS8 DER of an Ed25519 private key.
 *                            The reference is what the records carry (retention.export_signing_keys.credential_ref); the value
 *                            is read from the process environment at the moment it is needed — to derive the PUBLIC key at the
 *                            declaration (recorded, served to the customer) and to sign a package digest at the build — and is
 *                            never logged, never recorded, never returned.
 *   DestinationCredentialStore `EYE_DST_<NAME>` — an https destination's bearer value, carried as `authorization: Bearer <value>`
 *                            on the delivery's first hop only, never written: not on the delivery row, not in the receipt, not in
 *                            the audit.
 *
 * The signature is Ed25519 over the ASCII hex of the package digest (which already covers everything in the manifest), the
 * 64 bytes as base64; `key_id` is `ed25519:<first 16 hex of sha256(SPKI DER)>`, so a customer holding the public key PEM can
 * verify offline (scripts/retention/verify-export.mjs --public-key) and name the key it verified against.
 */
import { Injectable } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';

export const KEY_SIGNATURE_SCHEME = 'eye-customer-export/2';
export const SIGNING_ALGORITHM = 'Ed25519';
export const SIGNING_KEY_REF = /^EYE_EXPORT_SIGNING_KEY_[A-Z0-9_]{1,64}$/;
export const DESTINATION_CREDENTIAL_REF = /^EYE_DST_[A-Z0-9_]{1,64}$/;
/** A key-based signature as recorded: the base64 of 64 bytes (the port checks the same shape first, then the decoded length). */
export const KEY_SIGNATURE_RE = /^[A-Za-z0-9+/]{86}==$/;

export type DerivedPublicKey =
  | { ok: true; keyId: string; publicKeyPem: string; spkiDer: Buffer }
  | { ok: false; reason: 'unbound' | 'not_ed25519' | 'malformed' };

/** `ed25519:<first 16 hex of sha256(SPKI DER)>` — the key's name in every record and every signature block. */
export function keyIdOf(spkiDer: Uint8Array): string {
  return `ed25519:${createHash('sha256').update(spkiDer).digest('hex').slice(0, 16)}`;
}

/** The private key an environment value holds, or the reason it does not (the value itself never leaves this function). */
function privateKeyOf(value: string): { ok: true; key: KeyObject } | { ok: false; reason: 'not_ed25519' | 'malformed' } {
  let key: KeyObject;
  try {
    const der = Buffer.from(value.trim(), 'base64');
    if (der.byteLength === 0) return { ok: false, reason: 'malformed' };
    key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (key.asymmetricKeyType !== 'ed25519') return { ok: false, reason: 'not_ed25519' };
  return { ok: true, key };
}

@Injectable()
export class ExportSigningKeyStore {
  /** Whether this deployment binds the reference (a non-empty value under that name). */
  has(ref: string): boolean {
    if (!SIGNING_KEY_REF.test(ref)) return false;
    const v = process.env[ref];
    return typeof v === 'string' && v.length > 0;
  }
  /** The value for a signing, or null when the deployment binds none. Callers never log it. */
  resolve(ref: string): string | null {
    if (!this.has(ref)) return null;
    return process.env[ref] as string;
  }
  /** The PUBLIC key the reference's value derives — what the declaration records — or a typed refusal. */
  derivePublic(ref: string): DerivedPublicKey {
    const value = this.resolve(ref);
    if (value === null) return { ok: false, reason: 'unbound' };
    const priv = privateKeyOf(value);
    if (!priv.ok) return { ok: false, reason: priv.reason };
    const pub = createPublicKey(priv.key);
    const spkiDer = pub.export({ format: 'der', type: 'spki' });
    return { ok: true, keyId: keyIdOf(spkiDer), publicKeyPem: pub.export({ format: 'pem', type: 'spki' }).toString(), spkiDer };
  }
  /** Ed25519 over the ASCII hex of the package digest, as base64; null when the reference is not bound or holds no Ed25519 key. */
  sign(ref: string, packageDigestHex: string): string | null {
    const value = this.resolve(ref);
    if (value === null) return null;
    const priv = privateKeyOf(value);
    if (!priv.ok) return null;
    return cryptoSign(null, Buffer.from(packageDigestHex, 'utf8'), priv.key).toString('base64');
  }
}

@Injectable()
export class DestinationCredentialStore {
  /** Whether this deployment binds the reference (a non-empty value under that name). */
  has(ref: string): boolean {
    if (!DESTINATION_CREDENTIAL_REF.test(ref)) return false;
    const v = process.env[ref];
    return typeof v === 'string' && v.length > 0;
  }
  /** The value for a delivery's first hop, or null when the deployment binds none. Callers never log it. */
  resolve(ref: string): string | null {
    if (!this.has(ref)) return null;
    return process.env[ref] as string;
  }
}

/** The customer's check, here for the product's own use: the /2 signature against the recorded public key. A malformed input is false, never a throw. */
export function verifySignature(publicKeyPem: string, packageDigestHex: string, signatureB64: string): boolean {
  try {
    if (!KEY_SIGNATURE_RE.test(signatureB64)) return false;
    const pub = createPublicKey({ key: publicKeyPem, format: 'pem' });
    if (pub.asymmetricKeyType !== 'ed25519') return false;
    return cryptoVerify(null, Buffer.from(packageDigestHex, 'utf8'), pub, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
