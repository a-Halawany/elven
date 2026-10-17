/**
 * B107 §PG (0115_b107_x_pg §PG.1) — THE SHARED PLATFORM SIGNER: a named human's Ed25519 signature over a vendor-side (PLATFORM) subject's
 * digest, recorded in the prelude's `governance.signatures` through the port `governance.record_platform_signature` under the CALLER's bound
 * action. Every B107 part may import it after the fold (the baseline decision, the decision rights, an exception approval, a change approval,
 * a conflict resolution, a release acceptance, a design acceptance, a manifest attestation, an ownership transfer).
 *
 * THE SAME KEY PATH as B36's SignatureService (src/executive/signatures/signature.service.ts — untouched): the key by REFERENCE
 * `EYE_EXECUTIVE_SIGNING_KEY_<NAME>` (the reference named by EYE_EXECUTIVE_SIGNING_KEY_REF, default …_DEMO), a one-line base64 PKCS8 DER
 * read from the process environment at the moment of signing and never logged, recorded or returned; Ed25519 over the ASCII hex of the
 * subject digest, 64 bytes as base64; `key_id` = `ed25519:<first 16 hex of sha256(SPKI DER)>`. A deployment that binds no key signs nothing:
 * the act is REFUSED (`signature rejected (unbound)` 409), never silently unsigned. The port decides nothing about WHO may sign WHAT beyond
 * "a named human holding the stated role at PLATFORM": the deciding port verifies the row (subject, version, digest, signer, action) and runs
 * the approver test itself.
 *
 * THREE CLAIMS: a signature here is CONSTRUCTION / DEMONSTRATED OPERATION evidence by a SYNTHETIC persona's key — never a real executive or
 * independent authority's attestation (H3 / R2).
 */
import { HttpException } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { SignatureService, type SignatureRow, type SignatureWrites } from '../../executive/signatures/signature.service.js';

/** The prelude's closed list (governance.signature_kinds()). */
export type PlatformSignatureKind = 'baseline_decision' | 'decision_rights' | 'exception_approval' | 'release_acceptance' | 'design_acceptance' | 'design_contribution'
  | 'manifest_attestation' | 'change_approval' | 'conflict_resolution' | 'ownership_transfer' | 'acceptance_attestation';
export const PLATFORM_SIGNATURE_KINDS: readonly PlatformSignatureKind[] = ['baseline_decision', 'decision_rights', 'exception_approval', 'release_acceptance', 'design_acceptance',
  'design_contribution', 'manifest_attestation', 'change_approval', 'conflict_resolution', 'ownership_transfer', 'acceptance_attestation'];

const keyIdOf = (spkiDer: Uint8Array): string => `ed25519:${createHash('sha256').update(spkiDer).digest('hex').slice(0, 16)}`;
function privateKeyOf(value: string): { ok: true; key: KeyObject } | { ok: false; reason: 'not_ed25519' | 'malformed' } {
  let key: KeyObject;
  try {
    const der = Buffer.from(value.trim(), 'base64');
    if (der.byteLength === 0) return { ok: false, reason: 'malformed' };
    key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  } catch { return { ok: false, reason: 'malformed' }; }
  if (key.asymmetricKeyType !== 'ed25519') return { ok: false, reason: 'not_ed25519' };
  return { ok: true, key };
}

export class PlatformSigner {
  /** B36's signer: the reference, the public key and verification (one algorithm, one key path). */
  readonly base = new SignatureService();
  ref(): string { return this.base.ref(); }
  bound(): boolean { return this.base.bound(); }
  publicKey(): { keyId: string; publicKeyPem: string } | null { return this.base.publicKey(); }
  verify(row: Pick<SignatureRow, 'key_id' | 'signature' | 'subject_digest'>, publicKeyPem?: string): boolean { return this.base.verify(row, publicKeyPem); }

  /** SIGN a PLATFORM subject and RECORD it under the caller's bound action (the pipeline's PLATFORM transaction). */
  async sign(cap: SignatureWrites, a: { action: string; kind: PlatformSignatureKind; subjectId: string; subjectVersion: number; subjectDigest: string; signerRole: string;
                                         actor: string; correlationId: string }): Promise<Record<string, unknown>> {
    const v = process.env[this.ref()];
    if (typeof v !== 'string' || v.length === 0) throw new HttpException(errorBody('EYE_STA_002', a.correlationId, `signature rejected (unbound): this deployment binds no executive signing key (${this.ref()})`), 409);
    const priv = privateKeyOf(v);
    if (!priv.ok) throw new HttpException(errorBody('EYE_DEP_001', a.correlationId, `signature rejected (key): the executive signing key is ${priv.reason}`), 500);
    if (!/^[0-9a-f]{64}$/.test(a.subjectDigest)) throw new HttpException(errorBody('EYE_REQ_001', a.correlationId, 'signature rejected (digest): a subject digest is 64 hex characters'), 422);
    const spkiDer = createPublicKey(priv.key).export({ format: 'der', type: 'spki' });
    const signature = cryptoSign(null, Buffer.from(a.subjectDigest, 'utf8'), priv.key).toString('base64');
    const rows = await cap.call<{ r: Record<string, unknown> }>(sql`select governance.record_platform_signature(${newId()}::uuid, ${a.action}, ${a.kind}, ${a.subjectId}::uuid,
      ${a.subjectVersion}::int, ${a.subjectDigest}, ${keyIdOf(spkiDer)}, ${signature}, ${a.signerRole}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
}
