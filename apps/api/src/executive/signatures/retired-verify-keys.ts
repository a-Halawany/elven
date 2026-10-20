/**
 * Retired executive signing keys, kept for VERIFICATION ONLY (the B80–B82 integration pass's credential-rotation plan, 2026-10-21).
 *
 * The executive verifier resolves the key a signature names by its `key_id`. Before this file it knew only the key CURRENTLY bound in the
 * environment, so rotating the bound key would leave every historical signature `unavailable` — neither verified nor refuted. This reads
 * the PUBLIC keys of retired signing keys from the file `EYE_EXECUTIVE_VERIFY_KEYS_FILE` names (one or more PEM SPKI blocks) and answers
 * the PEM for a key id it holds.
 *
 * What it never does: sign (signing still uses only the bound key); accept a private key (a file holding one is refused whole — nothing is
 * read from it); accept a non-Ed25519 key (skipped); fail open (an unreadable or malformed file answers nothing, so the signature stays
 * `unavailable`, never `verified`). Reading is at call time (the file is small), so adding a retired key needs no restart.
 */
import { readFileSync } from 'node:fs';
import { createHash, createPublicKey } from 'node:crypto';

export const EXECUTIVE_VERIFY_KEYS_FILE_ENV = 'EYE_EXECUTIVE_VERIFY_KEYS_FILE';

const PEM_BLOCK = /-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/g;
const keyIdOf = (spkiDer: Uint8Array): string => `ed25519:${createHash('sha256').update(spkiDer).digest('hex').slice(0, 16)}`;

/** Every retired Ed25519 public key on file, by key id. Empty when the variable is unset, the file is unreadable, or it holds a private key. */
export function retiredVerifyKeys(env: NodeJS.ProcessEnv = process.env): Map<string, string> {
  const out = new Map<string, string>();
  const path = env[EXECUTIVE_VERIFY_KEYS_FILE_ENV];
  if (path === undefined || path.trim() === '') return out;
  let text: string;
  try { text = readFileSync(path, 'utf8'); } catch { return out; }
  if (/PRIVATE KEY-----/.test(text)) return out;                       // refused whole: a verify-keys file never carries a private key
  for (const block of text.match(PEM_BLOCK) ?? []) {
    try {
      const pub = createPublicKey({ key: block, format: 'pem' });
      if (pub.asymmetricKeyType !== 'ed25519') continue;
      const der = pub.export({ format: 'der', type: 'spki' });
      out.set(keyIdOf(der), pub.export({ format: 'pem', type: 'spki' }).toString());
    } catch { /* a malformed block is skipped; it can verify nothing */ }
  }
  return out;
}

/** The retired public key PEM for `keyId`, or null. */
export function retiredVerifyKeyPem(keyId: string, env: NodeJS.ProcessEnv = process.env): string | null {
  return retiredVerifyKeys(env).get(keyId) ?? null;
}
