/**
 * CP-6 B82 §EV — the PURE rules of the evidence segment (the request's shape, the window served around the cited span) and the signature
 * verifier's THREE outcomes (CMP-032: a verification that cannot be made is UNAVAILABLE, never FAILED), with `verify()`'s boolean unchanged
 * for every caller. Keys are generated here (SYNTHETIC); nothing is read from the deployment.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { SEGMENT_MAX_BYTES, segmentIntake, segmentWindow } from '../../src/observation/evidence-b82/segment.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';

describe('the evidence segment (pure)', () => {
  it('the request: a span [start, end), at most 64 KiB, context 0–1024, an optional version — refusals in the class form', () => {
    expect(segmentIntake({ byteStart: 2, byteEnd: 9 })).toEqual({ version: null, byteStart: 2, byteEnd: 9, context: 0 });
    expect(segmentIntake({ byteStart: 0, byteEnd: SEGMENT_MAX_BYTES, context: 1024, version: 3 })).toEqual({ version: 3, byteStart: 0, byteEnd: SEGMENT_MAX_BYTES, context: 1024 });
    const p = (x: Record<string, unknown>) => (segmentIntake(x) as { problem?: string }).problem ?? '';
    expect(p({ byteStart: 5, byteEnd: 5 })).toMatch(/^evidence segment rejected \(span\)/);
    expect(p({ byteStart: -1, byteEnd: 5 })).toMatch(/^evidence segment rejected \(span\)/);
    expect(p({ byteStart: '0', byteEnd: 5 })).toMatch(/^evidence segment rejected \(span\)/);
    expect(p({ byteStart: 0, byteEnd: SEGMENT_MAX_BYTES + 1 })).toMatch(/^evidence segment rejected \(oversize\)/);
    expect(p({ byteStart: 0, byteEnd: 4, context: 1025 })).toMatch(/^evidence segment rejected \(context\)/);
    expect(p({ byteStart: 0, byteEnd: 4, version: 0 })).toMatch(/^evidence segment rejected \(version\)/);
  });
  it('the window: context clipped to the bytes, the cited span\'s offsets inside it; a span leaving the bytes is no window', () => {
    expect(segmentWindow({ version: null, byteStart: 2, byteEnd: 9, context: 4 }, 100)).toEqual({ cited: { start: 2, end: 9 }, served: { start: 0, end: 13 }, highlight: { start: 2, end: 9 } });
    expect(segmentWindow({ version: null, byteStart: 90, byteEnd: 100, context: 8 }, 100)).toEqual({ cited: { start: 90, end: 100 }, served: { start: 82, end: 100 }, highlight: { start: 8, end: 18 } });
    expect(segmentWindow({ version: null, byteStart: 90, byteEnd: 101, context: 0 }, 100)).toBeNull();
  });
});

describe('the signature verifier: VERIFIED / FAILED / UNAVAILABLE; verify() keeps its meaning', () => {
  const REF = 'EYE_EXECUTIVE_SIGNING_KEY_B82UNIT';
  afterEach(() => { delete process.env[REF]; delete process.env['EYE_EXECUTIVE_SIGNING_KEY_REF']; });
  const pair = () => generateKeyPairSync('ed25519');
  const digest = 'a'.repeat(64);
  it('a signature over the digest with a key given or on file is VERIFIED; a changed digest is FAILED; malformed bytes are FAILED', () => {
    const k = pair(); const s = new SignatureService();
    const signature = sign(null, Buffer.from(digest, 'utf8'), k.privateKey).toString('base64');
    const pem = k.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    const row = { key_id: 'ed25519:0123456789abcdef', signature, subject_digest: digest };
    expect(s.verifyOutcome(row, pem).outcome).toBe('verified');
    expect(s.verify(row, pem)).toBe(true);
    expect(s.verifyOutcome({ ...row, subject_digest: 'b'.repeat(64) }, pem)).toMatchObject({ outcome: 'failed', reason: expect.stringMatching(/does not verify/) });
    expect(s.verify({ ...row, subject_digest: 'b'.repeat(64) }, pem)).toBe(false);
    expect(s.verifyOutcome({ ...row, signature: 'not-a-signature' }, pem).outcome).toBe('failed');
    // the bound key, by key id
    process.env['EYE_EXECUTIVE_SIGNING_KEY_REF'] = REF;
    process.env[REF] = k.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    const onFile = s.publicKey()!;
    expect(s.verifyOutcome({ ...row, key_id: onFile.keyId }).outcome).toBe('verified');
  });
  it('NO KEY ON FILE for the row\'s key id (another deployment\'s, a rotated one) is UNAVAILABLE — never FAILED; verify() stays false', () => {
    const k = pair(); const other = pair(); const s = new SignatureService();
    process.env['EYE_EXECUTIVE_SIGNING_KEY_REF'] = REF;
    process.env[REF] = other.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    const row = { key_id: 'ed25519:feedfacefeedface', signature: sign(null, Buffer.from(digest, 'utf8'), k.privateKey).toString('base64'), subject_digest: digest };
    expect(s.verifyOutcome(row)).toMatchObject({ outcome: 'unavailable', reason: expect.stringMatching(/no key is on file for ed25519:feedfacefeedface/) });
    expect(s.verify(row)).toBe(false);
    delete process.env[REF];
    expect(s.verifyOutcome(row).outcome).toBe('unavailable');
    expect(s.verifyOutcome(row, 'not a pem').outcome).toBe('unavailable');
  });
});
