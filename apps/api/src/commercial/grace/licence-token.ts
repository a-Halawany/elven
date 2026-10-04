/**
 * THE OFFLINE LICENCE TOKEN — CP-6 B91 §GR (0105 §GR.3; F-P7-F-01 clause 4, "offline licence token for disconnected profiles"; PR-66-006,
 * AT-66 "offline licensing"). The scheme `eye-licence-token/1`, in the export-signing idiom (apps/api/src/retention/export-signing.ts):
 *
 *   THE PAYLOAD      a JSON object of exactly eight members — format, token_id, tenant_id, profile, issued_at, expires_at, issuer
 *                    { principal_id, key_id } and licence (the version's basis, commercial.cgr_token_basis: licence id and version, tenant,
 *                    package, capabilities sorted, limits, effective window, term end, state, grace end, the version's digest; every instant
 *                    as UTC with microseconds and 'Z'). Its TEXT is the RFC 8785 canonical form (JCS) — the bytes that are digested and signed.
 *   THE DIGEST       sha256(payload text), hex.
 *   THE SIGNATURE    Ed25519 over the ASCII hex of the digest, base64 (64 bytes); `key_id` = `ed25519:<first 16 hex of sha256(SPKI DER)>`.
 *   THE KEY          an env REFERENCE `EYE_LICENCE_SIGNING_KEY_<NAME>`: a one-line base64 of the PKCS8 DER of an Ed25519 private key, read from
 *                    the process environment at the moment of signing — never logged, recorded or returned. A harness generates its own.
 *
 * Offline, scripts/commercial/verify-licence.mjs checks: the token parses; the payload text is canonical; sha256(text) = the digest; the
 * signature verifies against the public key (the one given with --public-key, else the token's own, reported as UNPINNED); the expiry has not
 * passed (at --at, default now); the tenant is the one expected (--tenant). `verifyToken` below is the same check for the product's own use.
 *
 * The DISCONNECTED PROFILE itself does not exist yet (P7-D / B106): this token is the software's part of the clause, not the profile.
 */
import { Injectable } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { jcsCanonicalize } from '@eye/contracts';

export const TOKEN_FORMAT = 'eye-licence-token/1';
export const TOKEN_ALGORITHM = 'Ed25519';
export const LICENCE_KEY_REF = /^EYE_LICENCE_SIGNING_KEY_[A-Z0-9_]{1,64}$/;
export const TOKEN_PROFILES = ['disconnected', 'air-gapped'] as const;
export type TokenProfile = (typeof TOKEN_PROFILES)[number];
export const SIGNATURE_RE = /^[A-Za-z0-9+/]{86}==$/;

export interface LicenceBasis {
  licence_id: string; version: number; tenant_id: string; package_key: string; capabilities: string[]; limits: Record<string, unknown>;
  effective_from: string; effective_to: string | null; term_end: string | null; state: string; grace_until: string | null; digest: string;
}
export interface TokenPayload {
  format: typeof TOKEN_FORMAT; token_id: string; tenant_id: string; profile: TokenProfile; issued_at: string; expires_at: string;
  issuer: { principal_id: string; key_id: string }; licence: LicenceBasis;
}
/** The token as handed over: the exact payload text, its digest, the signature and the public key to check it with. */
export interface OfflineToken {
  format: typeof TOKEN_FORMAT; payload: string; payload_digest: string; algorithm: typeof TOKEN_ALGORITHM; signature: string; key_id: string; public_key_pem: string;
}

/** `ed25519:<first 16 hex of sha256(SPKI DER)>`. */
export function keyIdOf(spkiDer: Uint8Array): string {
  return `ed25519:${createHash('sha256').update(spkiDer).digest('hex').slice(0, 16)}`;
}
export const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/** The payload's canonical text (JCS) — a member order or whitespace never changes it. */
export function canonicalPayload(p: TokenPayload): string {
  return jcsCanonicalize(p);
}

/** Whether a text is already in its canonical form (the verifier's "canonical" check): parsed and re-canonicalised, the same bytes. */
export function isCanonical(text: string): boolean {
  try { return jcsCanonicalize(JSON.parse(text) as unknown) === text; } catch { return false; }
}

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

export type DerivedLicenceKey = { ok: true; keyId: string; publicKeyPem: string } | { ok: false; reason: 'unbound' | 'not_ed25519' | 'malformed' | 'reference' };

/** The licence signing key store: a REFERENCE in, a public key or a signature out; the value never leaves this class. */
@Injectable()
export class LicenceSigningKeyStore {
  has(ref: string): boolean {
    if (!LICENCE_KEY_REF.test(ref)) return false;
    const v = process.env[ref];
    return typeof v === 'string' && v.length > 0;
  }
  private value(ref: string): string | null { return this.has(ref) ? (process.env[ref] as string) : null; }
  derivePublic(ref: string): DerivedLicenceKey {
    if (!LICENCE_KEY_REF.test(ref)) return { ok: false, reason: 'reference' };
    const v = this.value(ref);
    if (v === null) return { ok: false, reason: 'unbound' };
    const priv = privateKeyOf(v);
    if (!priv.ok) return { ok: false, reason: priv.reason };
    const pub = createPublicKey(priv.key);
    return { ok: true, keyId: keyIdOf(pub.export({ format: 'der', type: 'spki' })), publicKeyPem: pub.export({ format: 'pem', type: 'spki' }).toString() };
  }
  /** Ed25519 over the ASCII hex of the payload digest, base64; null when the reference binds no Ed25519 key. */
  sign(ref: string, payloadDigestHex: string): string | null {
    const v = this.value(ref);
    if (v === null) return null;
    const priv = privateKeyOf(v);
    if (!priv.ok) return null;
    return cryptoSign(null, Buffer.from(payloadDigestHex, 'utf8'), priv.key).toString('base64');
  }
}

/** The signature check alone: false on any malformed input, never a throw. */
export function verifySignature(publicKeyPem: string, payloadDigestHex: string, signatureB64: string): boolean {
  try {
    if (!SIGNATURE_RE.test(signatureB64)) return false;
    const pub = createPublicKey({ key: publicKeyPem, format: 'pem' });
    if (pub.asymmetricKeyType !== 'ed25519') return false;
    return cryptoVerify(null, Buffer.from(payloadDigestHex, 'utf8'), pub, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

export interface TokenCheck { name: string; ok: boolean; detail: string }
export interface TokenVerdict { ok: boolean; checks: TokenCheck[]; pinned: boolean; payload: TokenPayload | null }

/**
 * THE OFFLINE CHECK (the product's copy of scripts/commercial/verify-licence.mjs): format, canonical payload, digest, signature (against
 * `publicKeyPem` when given — PINNED — else the token's own key, reported unpinned), key id, expiry at `at`, tenant. ok only when every
 * check ran and passed.
 */
export function verifyToken(token: unknown, opts: { at: Date; tenantId?: string | null; publicKeyPem?: string | null }): TokenVerdict {
  const checks: TokenCheck[] = [];
  const add = (name: string, ok: boolean, detail: string) => { checks.push({ name, ok, detail }); return ok; };
  const t = token as Partial<OfflineToken> | null;
  if (t === null || typeof t !== 'object' || Array.isArray(t)) {
    add('token readable', false, 'the token is not a JSON object');
    return { ok: false, checks, pinned: false, payload: null };
  }
  add('format', t.format === TOKEN_FORMAT && t.algorithm === TOKEN_ALGORITHM, `format ${String(t.format)}, algorithm ${String(t.algorithm)}`);
  const text = typeof t.payload === 'string' ? t.payload : null;
  let payload: TokenPayload | null = null;
  if (text === null) add('payload readable', false, 'the token carries no payload text');
  else {
    try { payload = JSON.parse(text) as TokenPayload; add('payload readable', typeof payload === 'object' && payload !== null && !Array.isArray(payload), 'the payload parses'); }
    catch { add('payload readable', false, 'the payload text is not JSON'); }
    add('canonical', isCanonical(text), 'the payload text is its own RFC 8785 canonical form');
    add('digest', typeof t.payload_digest === 'string' && sha256Hex(text) === t.payload_digest, 'sha256(payload text) = payload_digest');
  }
  const pinned = typeof opts.publicKeyPem === 'string' && opts.publicKeyPem.length > 0;
  const keyPem = pinned ? (opts.publicKeyPem as string) : (typeof t.public_key_pem === 'string' ? t.public_key_pem : '');
  add('signature', typeof t.payload_digest === 'string' && typeof t.signature === 'string' && verifySignature(keyPem, t.payload_digest, t.signature),
      pinned ? 'Ed25519 over the digest, against the given public key' : 'Ed25519 over the digest, against the token\'s OWN key (UNPINNED: pass the vendor\'s public key)');
  let keyId = '';
  try { keyId = keyIdOf(createPublicKey({ key: keyPem, format: 'pem' }).export({ format: 'der', type: 'spki' })); } catch { keyId = ''; }
  add('key id', keyId !== '' && keyId === t.key_id && payload?.issuer?.key_id === t.key_id, `the key verified is ${keyId || 'unreadable'}; the token names ${String(t.key_id)}`);
  if (payload !== null && typeof payload === 'object') {
    const exp = typeof payload.expires_at === 'string' ? Date.parse(payload.expires_at) : NaN;
    add('expiry', Number.isFinite(exp) && exp > opts.at.getTime(), `expires ${String(payload.expires_at)}; checked at ${opts.at.toISOString()}`);
    if (opts.tenantId !== undefined && opts.tenantId !== null) {
      add('tenant', payload.tenant_id === opts.tenantId && payload.licence?.tenant_id === opts.tenantId, `the token is for tenant ${String(payload.tenant_id)}; expected ${opts.tenantId}`);
    } else {
      add('tenant', typeof payload.tenant_id === 'string' && payload.tenant_id === payload.licence?.tenant_id, `the token names tenant ${String(payload.tenant_id)} (no tenant expected was given)`);
    }
  }
  return { ok: checks.length > 0 && checks.every((c) => c.ok), checks, pinned, payload };
}
