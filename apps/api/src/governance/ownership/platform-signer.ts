/**
 * B107 §DR — THE PLATFORM SIGNER (a part-local copy of the idiom; §PG owns the shared `src/governance/workspace/platform-signing.ts` after
 * the fold — the integrator may replace this file by it). The SAME key-reference path as SignatureService (B36 / B13): Ed25519 by REFERENCE —
 * the private key read from the process environment at the moment of signing under the reference SignatureService.ref() names, never
 * logged, recorded or returned; the signature over the ASCII hex of the subject's digest, base64; `key_id` = `ed25519:<first 16 hex of
 * sha256(SPKI DER)>`. The row is written into governance.signatures (the PLATFORM sibling of executive.signatures) by this part's definer
 * port, which asserts the caller's bound action and the signer's PLATFORM role. A deployment that binds no key signs nothing: the act is
 * REFUSED (409 `signature rejected (unbound)`), never silently unsigned. Verification is SignatureService.verify (pure).
 */
import { HttpException } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign } from 'node:crypto';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { SignatureService, type SignatureWrites } from '../../executive/signatures/signature.service.js';

export type PlatformSignatureKind = 'ownership_transfer';

export class PlatformSigner {
  readonly #exec = new SignatureService();
  /** SIGN a PLATFORM subject and RECORD it through governance.dr_record_platform_signature under the caller's bound action. */
  async sign(cap: SignatureWrites, a: { action: string; kind: PlatformSignatureKind; subjectId: string; subjectVersion: number; subjectDigest: string; actor: string; correlationId: string }): Promise<Record<string, unknown>> {
    const ref = this.#exec.ref();
    const v = process.env[ref];
    if (typeof v !== 'string' || v.length === 0) throw new HttpException(errorBody('EYE_STA_002', a.correlationId, `signature rejected (unbound): this deployment binds no executive signing key (${ref})`), 409);
    let key;
    try { key = createPrivateKey({ key: Buffer.from(v.trim(), 'base64'), format: 'der', type: 'pkcs8' }); } catch {
      throw new HttpException(errorBody('EYE_DEP_001', a.correlationId, 'signature rejected (key): the executive signing key is malformed'), 500);
    }
    if (key.asymmetricKeyType !== 'ed25519') throw new HttpException(errorBody('EYE_DEP_001', a.correlationId, 'signature rejected (key): the executive signing key is not_ed25519'), 500);
    if (!/^[0-9a-f]{64}$/.test(a.subjectDigest)) throw new HttpException(errorBody('EYE_REQ_001', a.correlationId, 'signature rejected (digest): a subject digest is 64 hex characters'), 422);
    const spki = createPublicKey(key).export({ format: 'der', type: 'spki' });
    const keyId = `ed25519:${createHash('sha256').update(spki).digest('hex').slice(0, 16)}`;
    const signature = cryptoSign(null, Buffer.from(a.subjectDigest, 'utf8'), key).toString('base64');
    const rows = await cap.call<{ r: Record<string, unknown> }>(sql`select governance.dr_record_platform_signature(${newId()}::uuid, ${a.action}, ${a.kind}, ${a.subjectId}::uuid,
      ${a.subjectVersion}::int, ${a.subjectDigest}, ${keyId}, ${signature}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  verify(row: { key_id: string; signature: string; subject_digest: string }): boolean { return this.#exec.verify(row); }
  publicKeyId(): string | null { return this.#exec.publicKey()?.keyId ?? null; }
}
