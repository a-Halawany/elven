/**
 * THE PICKUP CODE AND THE SEALED ACCEPTANCE MATERIAL — CP-6 B36 part `collab` (0094 §C3; F-P6-14 (t), the B34 review's condition).
 *
 * The invitation token (0091 §F1's acceptance material — the invitee signs in with it and the port compares its hash) used to live only
 * in the API process's synthetic sink. Now the invitee's SYNTHETIC mailbox carries a ONE-TIME PICKUP CODE instead, and the token is SEALED
 * under that code: AES-256-GCM with a key derived from the code and the grant id (scrypt), the sealed bytes stored at rest by
 * executive.deliver_invitation; the code itself stored only as its hash (sha256 over the grant id and the code). The pickup route opens
 * the seal with the code the addressed person presents and answers the material ONCE. Nothing here logs, and the token is a value these
 * functions return, never print.
 *
 * Pure: unit-tested in test/unit/invitation-sealing.test.ts.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

/** Crockford base32 without the confusable letters: 12 symbols in three groups — ~60 bits; five failures lock the invitation. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PICKUP_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
export const PICKUP_FAILURES_TO_LOCK = 5;

export function newPickupCode(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    out += ALPHABET[(bytes[i] as number) % 32];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

/** The code as a person types it: upper-cased, dashes and spaces tolerated, the confusable letters mapped (O→0, I/L→1). */
export function normalizePickupCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (raw.length !== 12 || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** The hash at rest: sha256 over the grant id and the code — never the code. */
export function pickupCodeHash(grantId: string, code: string): string {
  return createHash('sha256').update(`${grantId}:${code}`, 'utf8').digest('hex');
}

function keyOf(grantId: string, code: string): Buffer {
  return scryptSync(code, `eye-invitation:${grantId}`, 32, { N: 1 << 14, r: 8, p: 1 });
}

export interface SealedMaterial { login: string; token: string }

/** AES-256-GCM under the code's key: iv (12) | tag (16) | ciphertext, base64 — the shape executive.invitation_deliveries.sealed_material checks. */
export function sealMaterial(grantId: string, code: string, material: SealedMaterial): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(grantId, code), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(material), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Opens the seal with the code; null when the code is not the one it was sealed under (the tag does not verify) or the bytes are not a seal. */
export function openMaterial(grantId: string, code: string, sealed: string): SealedMaterial | null {
  let buf: Buffer;
  try { buf = Buffer.from(sealed, 'base64'); } catch { return null; }
  if (buf.byteLength < 12 + 16 + 2) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyOf(grantId, code), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plain) as Partial<SealedMaterial>;
    if (typeof parsed.login !== 'string' || typeof parsed.token !== 'string') return null;
    return { login: parsed.login, token: parsed.token };
  } catch {
    return null;
  }
}

/** Every line of a message with the token blanked — the log discipline of the delivery service (a defensive scrub, never the only one). */
export function scrubToken(text: string, token: string): string {
  return token === '' ? text : text.split(token).join('[token]');
}
