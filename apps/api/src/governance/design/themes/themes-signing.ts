/**
 * B80 §TK — THE THEME CERTIFIER'S SIGNATURE: a named human's Ed25519 signature, by KEY REFERENCE, over a theme version's CERTIFICATION
 * DIGEST (the theme's digest, the rules, the recomputed matrix's digest and the outcome), recorded in governance.signatures (kind
 * 'theme_certification', TENANT scope) through governance.theme_record_signature under the certify act. The SAME key-reference path as
 * B36's SignatureService and B107's design-signing.ts (copied, not shared: their PLATFORM port serves other kinds): the key is read from
 * `EYE_EXECUTIVE_SIGNING_KEY_<NAME>` at the moment of signing and never logged, recorded or returned; Ed25519 over the ASCII hex of the
 * digest; key_id `ed25519:<first 16 hex of sha256(SPKI DER)>`. A deployment that binds no key certifies nothing: refused (409 `unbound`).
 */
import { HttpException } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign } from 'node:crypto';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { newId } from '../../../shared/ids.js';
import { SignatureService } from '../../../executive/signatures/signature.service.js';

export interface ThemeSignatureWrites { call<T>(q: ReturnType<typeof sql>): Promise<T[]> }
const ref = new SignatureService();

export async function signCertification(cap: ThemeSignatureWrites, a: { themeId: string; version: number; digest: string; actor: string; correlationId: string }): Promise<string> {
  const v = process.env[ref.ref()];
  if (typeof v !== 'string' || v.length === 0) {
    throw new HttpException(errorBody('EYE_STA_002', a.correlationId, `design theme rejected (unbound): this deployment binds no signing key (${ref.ref()}) — a certification is never left unsigned`), 409);
  }
  let key;
  try { key = createPrivateKey({ key: Buffer.from(v.trim(), 'base64'), format: 'der', type: 'pkcs8' }); } catch { key = null; }
  if (key === null || key.asymmetricKeyType !== 'ed25519') throw new HttpException(errorBody('EYE_DEP_001', a.correlationId, 'design theme rejected (key): the signing key is not an Ed25519 PKCS8 key'), 500);
  const spki = createPublicKey(key).export({ format: 'der', type: 'spki' });
  const keyId = `ed25519:${createHash('sha256').update(spki).digest('hex').slice(0, 16)}`;
  const signature = cryptoSign(null, Buffer.from(a.digest, 'utf8'), key).toString('base64');
  const id = newId();
  await cap.call(sql`select governance.theme_record_signature(${id}::uuid, ${a.themeId}::uuid, ${a.version}::int, ${a.digest}, ${keyId}, ${signature}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  return id;
}

/** VERIFY a recorded signature against the bound key (the page shows it); a malformed input is false, never a throw. */
export const verifyCertification = (row: { key_id: string; signature: string; subject_digest: string }): boolean => ref.verify(row);
