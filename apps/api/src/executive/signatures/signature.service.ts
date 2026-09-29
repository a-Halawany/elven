/**
 * CP-6 B36 §0 (0094): THE SIGNATURE BEYOND THE AUDIT CHAIN — one signer every B36 part calls (the gates' approval and decision, the
 * publication's approve-digest, the queue's accept-priority transition, the plan's baseline, a briefing edition, a health snapshot).
 * The discipline is B13's export signing (retention/export-signing.ts): Ed25519 by KEY REFERENCE — `EYE_EXECUTIVE_SIGNING_KEY_<NAME>`,
 * a one-line base64 of the PKCS8 DER of an Ed25519 private key, read from the process environment at the moment of signing and never
 * logged, recorded or returned; the signature is Ed25519 over the ASCII hex of the subject's digest, 64 bytes as base64; `key_id` is
 * `ed25519:<first 16 hex of sha256(SPKI DER)>`. The row is the port's (executive.record_signature), which asserts the CALLER's bound
 * action — the signer never decides who may sign what; verification recomputes over the subject digest with the recorded key.
 *
 * A deployment that binds no executive signing key signs nothing: the caller's act is REFUSED (`signature rejected (unbound)` 409),
 * never silently unsigned. The demonstration binds EYE_EXECUTIVE_SIGNING_KEY_DEMO in .eye-local/env; a harness generates its own pair
 * (generateKeyPairSync('ed25519')) and sets the variable in its process before booting.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { sql } from 'kysely';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';

export const EXECUTIVE_SIGNING_KEY_REF = /^EYE_EXECUTIVE_SIGNING_KEY_[A-Z0-9_]{1,64}$/;
export const DEFAULT_EXECUTIVE_SIGNING_KEY_REF = 'EYE_EXECUTIVE_SIGNING_KEY_DEMO';
export type SignatureSubjectKind = 'approval' | 'decision' | 'publication' | 'queue_transition' | 'plan_baseline' | 'briefing' | 'health_snapshot';
export interface SignatureRow {
  signature_id: string; signer: string; key_id: string; algorithm: string; signature: string; subject_digest: string; bound_action: string; signed_at: string;
}

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

/** The signing capability a part's transaction hands in: `call` runs one SQL statement under the pipeline's bound action (the port asserts it). */
export interface SignatureWrites { call<T>(q: ReturnType<typeof sql>): Promise<T[]> }

@Injectable()
export class SignatureService {
  /** The reference this deployment signs with (the default name; a deployment may bind another and name it in EYE_EXECUTIVE_SIGNING_KEY_REF). */
  ref(): string {
    const r = process.env['EYE_EXECUTIVE_SIGNING_KEY_REF'] ?? DEFAULT_EXECUTIVE_SIGNING_KEY_REF;
    return EXECUTIVE_SIGNING_KEY_REF.test(r) ? r : DEFAULT_EXECUTIVE_SIGNING_KEY_REF;
  }
  bound(): boolean { const v = process.env[this.ref()]; return typeof v === 'string' && v.length > 0; }
  /** The public key the bound reference derives — recorded on the signature row's key_id, served for offline verification. */
  publicKey(): { keyId: string; publicKeyPem: string } | null {
    const v = process.env[this.ref()]; if (typeof v !== 'string' || v.length === 0) return null;
    const priv = privateKeyOf(v); if (!priv.ok) return null;
    const pub = createPublicKey(priv.key);
    const spkiDer = pub.export({ format: 'der', type: 'spki' });
    return { keyId: keyIdOf(spkiDer), publicKeyPem: pub.export({ format: 'pem', type: 'spki' }).toString() };
  }
  /**
   * SIGN a subject and RECORD it through the port under the caller's bound action (the pipeline's transaction). Refuses when no key is
   * bound (409 `signature rejected (unbound)`) or the key is not Ed25519 (500 — a deployment defect, said as such).
   */
  async sign(cap: SignatureWrites, a: { tenantId: string; domainId: string; action: string; kind: SignatureSubjectKind; subjectId: string; subjectVersion: number; subjectDigest: string; actor: string; correlationId: string }): Promise<Record<string, unknown>> {
    const v = process.env[this.ref()];
    if (typeof v !== 'string' || v.length === 0) throw new HttpException(errorBody('EYE_STA_002', a.correlationId, `signature rejected (unbound): this deployment binds no executive signing key (${this.ref()})`), 409);
    const priv = privateKeyOf(v);
    if (!priv.ok) throw new HttpException(errorBody('EYE_DEP_001', a.correlationId, `signature rejected (key): the executive signing key is ${priv.reason}`), 500);
    if (!/^[0-9a-f]{64}$/.test(a.subjectDigest)) throw new HttpException(errorBody('EYE_REQ_001', a.correlationId, 'signature rejected (digest): a subject digest is 64 hex characters'), 422);
    const spkiDer = createPublicKey(priv.key).export({ format: 'der', type: 'spki' });
    const signature = cryptoSign(null, Buffer.from(a.subjectDigest, 'utf8'), priv.key).toString('base64');
    const rows = await cap.call<{ r: Record<string, unknown> }>(sql`select executive.record_signature(
      ${newId()}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.action}, ${a.kind}, ${a.subjectId}::uuid, ${a.subjectVersion}::int,
      ${a.subjectDigest}, ${keyIdOf(spkiDer)}, ${signature}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    return rows[0]?.r ?? {};
  }
  /** VERIFY a recorded signature against the bound key (by key_id) or a given public key PEM; a malformed input is false, never a throw. */
  verify(row: Pick<SignatureRow, 'key_id' | 'signature' | 'subject_digest'>, publicKeyPem?: string): boolean {
    try {
      const pem = publicKeyPem ?? (() => { const k = this.publicKey(); return k !== null && k.keyId === row.key_id ? k.publicKeyPem : null; })();
      if (pem === null || !/^[A-Za-z0-9+/]{86}==$/.test(row.signature)) return false;
      const pub = createPublicKey({ key: pem, format: 'pem' });
      if (pub.asymmetricKeyType !== 'ed25519') return false;
      return cryptoVerify(null, Buffer.from(row.subject_digest, 'utf8'), pub, Buffer.from(row.signature, 'base64'));
    } catch { return false; }
  }
}
