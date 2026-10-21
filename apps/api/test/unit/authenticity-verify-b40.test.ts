/**
 * CP-6 B40 §VA — the publisher-signature check (authenticity-b40/verify.ts) and the coverage dimension, pure. Keys are generated at run time
 * (never a key literal). Outcomes: verified | failed | unknown_signer | unsigned (DESIGN D6).
 */
import { describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { CompactSign } from 'jose';
import { checkSignature, keysInForce, presentedSignature, SIGNATURE_HEADER, type IntakeKey } from '../../src/observation/authenticity-b40/verify.js';
import { authenticityDimension } from '../../src/observation/authenticity-b40/coverage-dimension.js';

const pair = () => generateKeyPairSync('ed25519');
const keyOf = (k: ReturnType<typeof pair>, ref: string, over: Partial<IntakeKey> = {}): IntakeKey => {
  const der = k.publicKey.export({ type: 'spki', format: 'der' });
  return { key_id: `id-${ref}`, key_ref: ref, kind: 'signing_key', algorithm: 'Ed25519', fingerprint: `ed25519:${createHash('sha256').update(der).digest('hex').slice(0, 16)}`,
    public_key_pem: k.publicKey.export({ type: 'spki', format: 'pem' }).toString(), valid_from: null, valid_to: null, ...over };
};
const bytes = Buffer.from('{"bulletin":"DJ-CUS (SYNTHETIC)","status":"cleared"}', 'utf8');

describe('the detached Ed25519 check', () => {
  const k = pair(); const K = keyOf(k, 'customs-2026');
  const sig = sign(null, bytes, k.privateKey).toString('base64');
  it('verified with the key in force; the same signature over changed bytes fails; another key in force fails too (a detached signature names no key)', async () => {
    expect(await checkSignature({ scheme: 'ed25519_detached', bytes, signature: sig, keys: [K] })).toMatchObject({ outcome: 'verified', key: { key_ref: 'customs-2026' }, tried: 1 });
    expect(await checkSignature({ scheme: 'ed25519_detached', bytes: Buffer.from(bytes.toString().replace('cleared', 'held')), signature: sig, keys: [K] })).toMatchObject({ outcome: 'failed', tried: 1 });
    expect(await checkSignature({ scheme: 'ed25519_detached', bytes, signature: sign(null, bytes, pair().privateKey).toString('base64'), keys: [K] })).toMatchObject({ outcome: 'failed' });
  });
  it('no key in force → unknown_signer; no signature → unsigned; a malformed signature → failed; scheme none → unsigned', async () => {
    expect(await checkSignature({ scheme: 'ed25519_detached', bytes, signature: sig, keys: [] })).toMatchObject({ outcome: 'unknown_signer' });
    expect(await checkSignature({ scheme: 'ed25519_detached', bytes, signature: null, keys: [K] })).toMatchObject({ outcome: 'unsigned' });
    expect(await checkSignature({ scheme: 'ed25519_detached', bytes, signature: 'bm90LWEtc2lnbmF0dXJl', keys: [K] })).toMatchObject({ outcome: 'failed', statement: expect.stringMatching(/not a 64-byte Ed25519 signature/) });
    expect(await checkSignature({ scheme: 'none', bytes, signature: sig, keys: [K] })).toMatchObject({ outcome: 'unsigned' });
  });
});

describe('the JWS (EdDSA) check', () => {
  const k = pair(); const K = keyOf(k, 'jws-2026');
  const jws = (b: Uint8Array, kid?: string, alg = 'EdDSA') => new CompactSign(b).setProtectedHeader(kid === undefined ? { alg } : { alg, kid }).sign(k.privateKey);
  it('detached (header..signature) and attached forms verify; kid naming no key in force → unknown_signer; another payload → failed', async () => {
    const [h, , s] = (await jws(bytes, 'jws-2026')).split('.');
    expect(await checkSignature({ scheme: 'jws', bytes, signature: `${h}..${s}`, keys: [K] })).toMatchObject({ outcome: 'verified', statement: expect.stringMatching(/detached JWS/) });
    const attached = await jws(bytes, K.fingerprint);
    expect(await checkSignature({ scheme: 'jws', bytes: Buffer.from(attached), signature: presentedSignature('jws', Buffer.from(attached), {}), keys: [K] })).toMatchObject({ outcome: 'verified', statement: expect.stringMatching(/attached JWS/) });
    expect(await checkSignature({ scheme: 'jws', bytes, signature: `${h}..${s}`, keys: [keyOf(pair(), 'other')] })).toMatchObject({ outcome: 'unknown_signer' });
    const [h2, , s2] = (await jws(Buffer.from('other bytes'), 'jws-2026')).split('.');
    expect(await checkSignature({ scheme: 'jws', bytes, signature: `${h2}..${s2}`, keys: [K] })).toMatchObject({ outcome: 'failed' });
  });
  it('only EdDSA is accepted; a non-compact value fails', async () => {
    const bogusHeader = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    expect(await checkSignature({ scheme: 'jws', bytes, signature: `${bogusHeader}..`, keys: [K] })).toMatchObject({ outcome: 'failed', statement: expect.stringMatching(/only EdDSA/) });
    expect(await checkSignature({ scheme: 'jws', bytes, signature: 'not.a-jws', keys: [K] })).toMatchObject({ outcome: 'failed' });
  });
});

describe('keys in force and the presented signature', () => {
  it('validity, kind and the contract\'s key references filter the keys; the header is read case-insensitively', () => {
    const now = new Date('2026-10-21T00:00:00Z');
    const k = pair();
    const keys = [keyOf(k, 'a'), keyOf(k, 'b', { valid_to: '2026-10-20T00:00:00Z' }), keyOf(k, 'c', { valid_from: '2026-11-01T00:00:00Z' }),
      { ...keyOf(k, 'd'), kind: 'tls_spki_pin' as const, public_key_pem: null }];
    expect(keysInForce(keys, now, []).map((x) => x.key_ref)).toEqual(['a']);
    expect(keysInForce(keys, now, ['z'])).toEqual([]);
    expect(presentedSignature('ed25519_detached', bytes, { [SIGNATURE_HEADER.toUpperCase()]: ' abc ' })).toBe('abc');
    expect(presentedSignature('ed25519_detached', bytes, {})).toBeNull();
  });
});

describe('the coverage dimension (L1-C06)', () => {
  it('nothing recorded → null (the caller keeps unknown); recorded → measured, a failure named first', () => {
    expect(authenticityDimension(null)).toBeNull();
    expect(authenticityDimension({ recorded: 0, verified: 0, failed: 0, unsigned: 0, unavailable: 0, schemes: [], last_recorded_at: null })).toBeNull();
    expect(authenticityDimension({ recorded: 4, verified: 2, failed: 1, unsigned: 1, unavailable: 0, schemes: ['ed25519_detached'], last_recorded_at: null }))
      .toMatchObject({ dimension: 'authenticity', state: 'measured', valueNumeric: 50, denominator: 4, errorClass: 'authenticity_failed',
        valueText: expect.stringMatching(/^content authenticity of 4 admitted version\(s\) in the window \(publisher signature, ed25519_detached\): 1 FAILED/) });
  });
});
