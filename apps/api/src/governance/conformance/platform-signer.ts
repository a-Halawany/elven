/**
 * B107 §CM — THE PLATFORM SIGNER (a COPY of the B36 SignatureService idiom, apps/api/src/executive/signatures/signature.service.ts, for the
 * PLATFORM sibling table governance.signatures — §0: "§PG owns a small shared TS helper for PLATFORM signing; if you need it before the fold,
 * copy the idiom inside your part and say so"). Ed25519 by KEY REFERENCE (`EYE_EXECUTIVE_SIGNING_KEY_<NAME>`, read from the environment at the
 * moment of signing, never logged, recorded or returned); the signature is over the ASCII hex of the subject's digest; key_id is
 * `ed25519:<first 16 hex of sha256(SPKI DER)>`. This class only SIGNS and VERIFIES: the ROW is written by the definer port that first runs the
 * approver test (governance.cm_attest_candidate). A deployment binding no key signs nothing: the act is refused (409), never left unsigned.
 * At the fold the integrator may replace this with §PG's `workspace/platform-signing.ts`.
 */
import { HttpException } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { retiredVerifyKeyPem } from '../../executive/signatures/retired-verify-keys.js';
import { errorBody } from '@eye/contracts';
import { DEFAULT_EXECUTIVE_SIGNING_KEY_REF, EXECUTIVE_SIGNING_KEY_REF } from '../../executive/signatures/signature.service.js';

const keyIdOf = (spkiDer: Uint8Array): string => `ed25519:${createHash('sha256').update(spkiDer).digest('hex').slice(0, 16)}`;

function privateKey(value: string): KeyObject | null {
  try {
    const der = Buffer.from(value.trim(), 'base64');
    if (der.byteLength === 0) return null;
    const key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    return key.asymmetricKeyType === 'ed25519' ? key : null;
  } catch { return null; }
}

export class PlatformSigner {
  ref(): string {
    const r = process.env['EYE_EXECUTIVE_SIGNING_KEY_REF'] ?? DEFAULT_EXECUTIVE_SIGNING_KEY_REF;
    return EXECUTIVE_SIGNING_KEY_REF.test(r) ? r : DEFAULT_EXECUTIVE_SIGNING_KEY_REF;
  }
  bound(): boolean { const v = process.env[this.ref()]; return typeof v === 'string' && v.length > 0; }
  publicKey(): { keyId: string; publicKeyPem: string } | null {
    const v = process.env[this.ref()]; if (typeof v !== 'string' || v.length === 0) return null;
    const k = privateKey(v); if (k === null) return null;
    const pub = createPublicKey(k);
    return { keyId: keyIdOf(pub.export({ format: 'der', type: 'spki' })), publicKeyPem: pub.export({ format: 'pem', type: 'spki' }).toString() };
  }
  /** Sign a subject digest; refused when no key is bound (409 unbound) or the key is not Ed25519 (500 — a deployment defect). */
  sign(subjectDigest: string, correlationId: string): { keyId: string; signature: string } {
    const v = process.env[this.ref()];
    if (typeof v !== 'string' || v.length === 0) throw new HttpException(errorBody('EYE_STA_002', correlationId, `signature rejected (unbound): this deployment binds no executive signing key (${this.ref()})`), 409);
    const k = privateKey(v);
    if (k === null) throw new HttpException(errorBody('EYE_DEP_001', correlationId, 'signature rejected (key): the executive signing key is not an Ed25519 PKCS8 key'), 500);
    if (!/^[0-9a-f]{64}$/.test(subjectDigest)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'signature rejected (digest): a subject digest is 64 hex characters'), 422);
    return { keyId: keyIdOf(createPublicKey(k).export({ format: 'der', type: 'spki' })), signature: cryptoSign(null, Buffer.from(subjectDigest, 'utf8'), k).toString('base64') };
  }
  /** Verify a recorded signature against the bound key (by key_id); a malformed input is false, never a throw. */
  verify(row: { key_id: string; signature: string; subject_digest: string }): boolean {
    try {
      const k = this.publicKey();
      // The bound key when the row names it; otherwise a RETIRED key kept for verification only (rotation-safe; signing is unchanged).
      const pem = k !== null && k.keyId === row.key_id ? k.publicKeyPem : retiredVerifyKeyPem(String(row.key_id));
      if (pem === null || !/^[A-Za-z0-9+/]{86}==$/.test(row.signature)) return false;
      return cryptoVerify(null, Buffer.from(row.subject_digest, 'utf8'), createPublicKey({ key: pem, format: 'pem' }), Buffer.from(row.signature, 'base64'));
    } catch { return false; }
  }
}
