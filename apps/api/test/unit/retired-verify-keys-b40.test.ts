/**
 * Rotation-safe executive verification (the credential-rotation plan's minimum software work, 2026-10-21): after the bound executive signing
 * key is rotated, a signature made with the RETIRED key still verifies — only through its public key on file (EYE_EXECUTIVE_VERIFY_KEYS_FILE) —
 * while signing uses only the new bound key. Keys are generated at run time; nothing here is a key literal.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { PlatformSigner } from '../../src/governance/conformance/platform-signer.js';
import { EXECUTIVE_VERIFY_KEYS_FILE_ENV, retiredVerifyKeys } from '../../src/executive/signatures/retired-verify-keys.js';

const REF = 'EYE_EXECUTIVE_SIGNING_KEY_B40ROT';
const pair = () => generateKeyPairSync('ed25519');
const pkcs8b64 = (k: ReturnType<typeof pair>) => k.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const spkiPem = (k: ReturnType<typeof pair>) => k.publicKey.export({ format: 'pem', type: 'spki' }).toString();

describe('rotation-safe executive verification (retired public keys, verify only)', () => {
  let dir = '';
  const saved: Record<string, string | undefined> = {};
  const setEnv = (k: string, v: string | undefined) => { if (!(k in saved)) saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'eye-rot-')); setEnv('EYE_EXECUTIVE_SIGNING_KEY_REF', REF); });
  afterEach(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } for (const k of Object.keys(saved)) delete saved[k]; rmSync(dir, { recursive: true, force: true }); });

  it('a signature by the RETIRED key: unavailable without the file, VERIFIED with its public key on file; a tampered one FAILS; signing uses the new key', () => {
    const svc = new SignatureService();
    const signer = new PlatformSigner();
    const old = pair(); const neu = pair();
    setEnv(REF, pkcs8b64(old));
    const signedOld = signer.sign('a'.repeat(64), '00000000-0000-4000-8000-000000000000');
    const oldRow = { key_id: signedOld.keyId, signature: signedOld.signature, subject_digest: 'a'.repeat(64) };
    expect(svc.verifyOutcome(oldRow).outcome).toBe('verified');                         // before the rotation: the bound key

    setEnv(REF, pkcs8b64(neu));                                                             // ROTATED: the bound key is the new one
    setEnv(EXECUTIVE_VERIFY_KEYS_FILE_ENV, undefined);
    expect(svc.verifyOutcome(oldRow).outcome).toBe('unavailable');                       // the hazard the plan found
    expect(signer.verify(oldRow)).toBe(false);

    const file = join(dir, 'retired.pem'); writeFileSync(file, spkiPem(old));
    setEnv(EXECUTIVE_VERIFY_KEYS_FILE_ENV, file);
    expect(svc.verifyOutcome(oldRow).outcome).toBe('verified');                          // historical signatures stay verifiable
    expect(signer.verify(oldRow)).toBe(true);
    expect(svc.verifyOutcome({ ...oldRow, subject_digest: 'b'.repeat(64) }).outcome).toBe('failed');

    const signedNew = signer.sign('c'.repeat(64), '00000000-0000-4000-8000-000000000001');
    expect(signedNew.keyId).not.toBe(signedOld.keyId);                                     // new signing uses ONLY the bound (new) key
    expect(svc.verifyOutcome({ key_id: signedNew.keyId, signature: signedNew.signature, subject_digest: 'c'.repeat(64) }).outcome).toBe('verified');
  });

  it('a verify-keys file holding a PRIVATE key is refused whole; an unknown key id stays unavailable; non-Ed25519 blocks are skipped', () => {
    const svc = new SignatureService();
    const old = pair();
    const file = join(dir, 'bad.pem');
    writeFileSync(file, `${spkiPem(old)}\n${old.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()}`);
    setEnv(EXECUTIVE_VERIFY_KEYS_FILE_ENV, file);
    expect(retiredVerifyKeys().size).toBe(0);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'pem', type: 'spki' }).toString();
    writeFileSync(file, `${rsa}\n${spkiPem(old)}`);
    expect(retiredVerifyKeys().size).toBe(1);
    expect(svc.verifyOutcome({ key_id: 'ed25519:0000000000000000', signature: 'A'.repeat(86) + '==', subject_digest: 'a'.repeat(64) }).outcome).toBe('unavailable');
    setEnv(EXECUTIVE_VERIFY_KEYS_FILE_ENV, join(dir, 'missing.pem'));
    expect(retiredVerifyKeys().size).toBe(0);
  });
});
