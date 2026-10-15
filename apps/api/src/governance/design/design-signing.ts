/**
 * B107 §DG — THE PLATFORM SIGNER of design governance: a named human's Ed25519 signature, by KEY REFERENCE, over a vendor-side subject's
 * digest (a design baseline attestation `baseline_decision`, a contribution's acceptance `design_contribution`, a design exception's approval
 * `exception_approval`), recorded in governance.signatures through governance.dg_record_signature under the caller's bound action.
 *
 * The SAME key-reference path as B36's SignatureService (apps/api/src/executive/signatures/signature.service.ts): the key is read from
 * `EYE_EXECUTIVE_SIGNING_KEY_<NAME>` (the reference SignatureService.ref() names) at the moment of signing and never logged, recorded or
 * returned; the signature is Ed25519 over the ASCII hex of the digest; key_id `ed25519:<first 16 hex of sha256(SPKI DER)>`. §PG owns the
 * shared PLATFORM-signing helper (src/governance/workspace/platform-signing.ts) — absent from this branch, the idiom is copied here and the
 * integrator may fold this onto it. A deployment that binds no key signs nothing: the act is refused (409 `unbound`), never left unsigned.
 */
import { HttpException } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign } from 'node:crypto';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { SignatureService } from '../../executive/signatures/signature.service.js';

export type PlatformSignatureKind = 'baseline_decision' | 'design_contribution' | 'exception_approval';
export interface PlatformSignatureWrites { call<T>(q: ReturnType<typeof sql>): Promise<T[]> }

const ref = new SignatureService();

export async function signPlatform(cap: PlatformSignatureWrites, a: { action: string; kind: PlatformSignatureKind; subjectId: string; subjectVersion: number; subjectDigest: string;
                                                                       role: string; actor: string; correlationId: string; noun: string }): Promise<string> {
  const v = process.env[ref.ref()];
  if (typeof v !== 'string' || v.length === 0) throw new HttpException(errorBody('EYE_STA_002', a.correlationId, `${a.noun} rejected (unbound): this deployment binds no signing key (${ref.ref()}) — the act is never left unsigned`), 409);
  let key;
  try { key = createPrivateKey({ key: Buffer.from(v.trim(), 'base64'), format: 'der', type: 'pkcs8' }); } catch { key = null; }
  if (key === null || key.asymmetricKeyType !== 'ed25519') throw new HttpException(errorBody('EYE_DEP_001', a.correlationId, `${a.noun} rejected (key): the signing key is not an Ed25519 PKCS8 key`), 500);
  const spki = createPublicKey(key).export({ format: 'der', type: 'spki' });
  const keyId = `ed25519:${createHash('sha256').update(spki).digest('hex').slice(0, 16)}`;
  const signature = cryptoSign(null, Buffer.from(a.subjectDigest, 'utf8'), key).toString('base64');
  const id = newId();
  await cap.call(sql`select governance.dg_record_signature(${id}::uuid, ${a.action}, ${a.kind}, ${a.subjectId}::uuid, ${a.subjectVersion}::int, ${a.subjectDigest}, ${a.role},
    ${keyId}, ${signature}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  return id;
}

/** VERIFY a recorded PLATFORM signature against the bound key (the page shows it); a malformed input is false, never a throw. */
export const verifyPlatform = (row: { key_id: string; signature: string; subject_digest: string }): boolean => ref.verify(row);
