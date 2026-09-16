/**
 * The signed revocation notice's PURE rules on fixtures (CP-6 B17; D8, C7; revocation-notice.ts): the sign/verify round trip with an
 * Ed25519 pair generated here and bound under a reference of this process alone (the store reads the environment at the signing);
 * the unsigned notice and its reason; a key another party holds (key_mismatch); a notice altered after the signing (invalid); the
 * malformed blocks; the package's key signing although retired; the ACTIVE key's fallback with its statement inside the signed
 * bytes. No database, no disk: what the harness proves end to end (S2, S4, S5), this holds at the function boundary.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { contentDigest } from '@eye/contracts';
import { ExportSigningKeyStore, KEY_SIGNATURE_RE, keyIdOf } from '../../../src/retention/export-signing.js';
import { NOTICE_SIGNATURE_SCHEME, noticeDigestOf, signNotice, verifyNotice } from '../../../src/retention/revocation-notice.js';

type Row = Record<string, unknown>;

/** A pair as the product declares one: the public PEM the partner holds, the key id the records carry, the private key's PKCS8 as the environment value. */
function pair(): { keyId: string; pem: string; value: string; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    keyId: keyIdOf(publicKey.export({ type: 'spki', format: 'der' })),
    pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    value: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    privateKey,
  };
}

const PACKAGE_REF = 'EYE_EXPORT_SIGNING_KEY_B17_NOTICE_PACKAGE';
const ACTIVE_REF = 'EYE_EXPORT_SIGNING_KEY_B17_NOTICE_ACTIVE';
const UNBOUND_REF = 'EYE_EXPORT_SIGNING_KEY_B17_NOTICE_UNBOUND';
const packageKey = pair();
const activeKey = pair();
const foreignKey = pair();
const store = new ExportSigningKeyStore();

/** The notice as noticeOf builds it for an importer (export-delivery.service.ts): the members a recipient reads, no signature yet. */
function notice(): Row {
  return {
    notice: 'revocation', notice_id: '0190a1b2-c3d4-7000-8000-000000000001', attempt: 1, action_id: '0190a1b2-c3d4-7000-8000-000000000002',
    tenant_id: '0190a1b2-c3d4-7000-8000-000000000003', domain_id: '0190a1b2-c3d4-7000-8000-000000000004',
    destination_key: null, recipient: 'import:0190a1b2-c3d4-7000-8000-000000000003/0190a1b2-c3d4-7000-8000-000000000005/0190a1b2-c3d4-7000-8000-000000000006',
    delivery: { import_id: '0190a1b2-c3d4-7000-8000-000000000006', state: 'admitted', held: 'confirmed' },
    package_digest: 'a'.repeat(64), archive_digest: 'b'.repeat(64), signing_key_id: packageKey.keyId,
    revoked_at: '2026-09-16T10:00:00.000Z', reason: 'the origin revokes the package (unit)', notified_at: '2026-09-16T10:00:01.000Z',
    obligation: 'the package is revoked: destroy every copy of package.tar and of its contents held from this delivery, and confirm',
    statement: 'destroy every copy; answer with { notice_id, package_digest, copies_destroyed: true }',
  };
}

beforeAll(() => {
  process.env[PACKAGE_REF] = packageKey.value;
  process.env[ACTIVE_REF] = activeKey.value;
  delete process.env[UNBOUND_REF];
});
afterAll(() => {
  delete process.env[PACKAGE_REF];
  delete process.env[ACTIVE_REF];
});

describe('the signed revocation notice (B17; D8)', () => {
  it('signs with the package key and verifies against its public PEM; the digest excludes the signature', () => {
    const signed = signNotice(notice(), { keyId: packageKey.keyId, ref: PACKAGE_REF }, store);
    expect(signed['signature']).toEqual({ scheme: NOTICE_SIGNATURE_SCHEME, key_id: packageKey.keyId, algorithm: 'Ed25519', signature: expect.stringMatching(KEY_SIGNATURE_RE) });
    expect(signed['unsigned']).toBeUndefined();
    expect(signed['signed_with']).toBeUndefined();
    // The bytes the signature binds are the notice without its signature: the digest of the signed notice equals the unsigned one's.
    expect(noticeDigestOf(signed)).toBe(noticeDigestOf(notice()));
    expect(noticeDigestOf(signed)).toBe(contentDigest(notice()));
    expect(contentDigest(signed)).not.toBe(noticeDigestOf(signed));
    const v = verifyNotice(signed, packageKey.pem);
    expect(v).toEqual({ ok: true, keyId: packageKey.keyId, digest: noticeDigestOf(signed) });
  });

  it('re-signs a notice that already carries a signature or an unsigned reason — the stale members are dropped first', () => {
    const stale = { ...notice(), signature: { scheme: NOTICE_SIGNATURE_SCHEME, key_id: 'ed25519:0000000000000000', algorithm: 'Ed25519', signature: 'x'.repeat(86) + '==' }, unsigned: 'stale' };
    const signed = signNotice(stale, { keyId: packageKey.keyId, ref: PACKAGE_REF }, store);
    expect(signed['unsigned']).toBeUndefined();
    expect((signed['signature'] as Row)['key_id']).toBe(packageKey.keyId);
    expect(verifyNotice(signed, packageKey.pem).ok).toBe(true);
  });

  it('is unsigned, and says why, when the tenant declares no key', () => {
    const unsigned = signNotice(notice(), null, store);
    expect(unsigned['signature']).toBeNull();
    expect(unsigned['unsigned']).toBe('the tenant declares no active export signing key; the notice is unsigned');
    expect(verifyNotice(unsigned, packageKey.pem)).toEqual({ ok: false, reason: 'unsigned', detail: 'the notice carries no signature', keyId: null, digest: noticeDigestOf(unsigned) });
    // The reason lies outside the digest, as the signature does: an unsigned notice digests to the same bytes as the notice.
    expect(noticeDigestOf(unsigned)).toBe(noticeDigestOf(notice()));
  });

  it('is unsigned, naming the key and its reference, when the only key is not bound in this deployment', () => {
    const unsigned = signNotice(notice(), { keyId: packageKey.keyId, ref: UNBOUND_REF }, store);
    expect(unsigned['signature']).toBeNull();
    expect(unsigned['unsigned']).toBe(`the package's signing key ${packageKey.keyId} is not bound in this deployment (${UNBOUND_REF}) and the tenant declares no active export signing key; the notice is unsigned`);
    expect(verifyNotice(unsigned, packageKey.pem)).toMatchObject({ ok: false, reason: 'unsigned' });
  });

  it('refuses a notice another party signed (key_mismatch) — the detail names both keys', () => {
    const signed = signNotice(notice(), { keyId: packageKey.keyId, ref: PACKAGE_REF }, store);
    const v = verifyNotice(signed, foreignKey.pem);
    expect(v).toMatchObject({ ok: false, reason: 'key_mismatch', keyId: packageKey.keyId, detail: `the notice is signed by key ${packageKey.keyId}, not the partner's ${foreignKey.keyId}` });
  });

  it('refuses a notice altered after the signing (invalid) — the reason, the digest, the delivery block', () => {
    const signed = signNotice(notice(), { keyId: packageKey.keyId, ref: PACKAGE_REF }, store);
    for (const tampered of [
      { ...signed, reason: 'another reason' },
      { ...signed, package_digest: 'c'.repeat(64) },
      { ...signed, delivery: { ...(signed['delivery'] as Row), held: 'possible' } },
      { ...signed, extra: true },
    ]) {
      expect(verifyNotice(tampered, packageKey.pem)).toMatchObject({ ok: false, reason: 'invalid', keyId: packageKey.keyId, detail: `the signature does not verify against the partner's key ${packageKey.keyId}` });
    }
    // A signature block altered in its bytes fails the same way; one that is not the base64 of 64 bytes is malformed before any check.
    const sig = signed['signature'] as Row;
    const flipped = `${String(sig['signature']).slice(0, 10)}${String(sig['signature'])[10] === 'A' ? 'B' : 'A'}${String(sig['signature']).slice(11)}`;
    expect(verifyNotice({ ...signed, signature: { ...sig, signature: flipped } }, packageKey.pem)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(verifyNotice({ ...signed, signature: { ...sig, signature: 'not-a-signature' } }, packageKey.pem)).toMatchObject({ ok: false, reason: 'malformed', detail: 'the signature is not the base64 of 64 bytes' });
  });

  it('refuses a malformed signature block — not an object, another scheme, another algorithm, no key id — and a public key it cannot read', () => {
    const signed = signNotice(notice(), { keyId: packageKey.keyId, ref: PACKAGE_REF }, store);
    const sig = signed['signature'] as Row;
    expect(verifyNotice({ ...signed, signature: 'abc' }, packageKey.pem)).toMatchObject({ ok: false, reason: 'malformed', detail: 'the signature is not an object', keyId: null });
    expect(verifyNotice({ ...signed, signature: [sig] }, packageKey.pem)).toMatchObject({ ok: false, reason: 'malformed' });
    expect(verifyNotice({ ...signed, signature: { ...sig, scheme: 'eye-customer-export/2' } }, packageKey.pem)).toMatchObject({ ok: false, reason: 'malformed', detail: `the signature scheme is eye-customer-export/2, not ${NOTICE_SIGNATURE_SCHEME}`, keyId: packageKey.keyId });
    expect(verifyNotice({ ...signed, signature: { ...sig, algorithm: 'RSA' } }, packageKey.pem)).toMatchObject({ ok: false, reason: 'malformed', detail: 'the signature algorithm is RSA, not Ed25519' });
    const { key_id: _dropped, ...noKey } = sig;
    expect(verifyNotice({ ...signed, signature: noKey }, packageKey.pem)).toMatchObject({ ok: false, reason: 'malformed', detail: 'the signature names no key_id', keyId: null });
    expect(verifyNotice(signed, 'not a pem')).toMatchObject({ ok: false, reason: 'invalid', detail: "the partner's public key is not a PEM node parses", keyId: packageKey.keyId });
    // Every refusal answers the digest it judged, so the record can name the bytes.
    expect(verifyNotice({ ...signed, signature: 'abc' }, packageKey.pem).digest).toBe(noticeDigestOf(signed));
  });
});

describe('which key signs (B17; C7)', () => {
  it("signs with the PACKAGE's key when its reference is bound — retired in the ledger or not — even when another key is active", () => {
    // The ledger's retirement is a fact about the row; the store signs with whatever the reference binds. The active key is given and NOT used.
    const signed = signNotice(notice(), { keyId: packageKey.keyId, ref: PACKAGE_REF }, store, { keyId: activeKey.keyId, ref: ACTIVE_REF });
    expect((signed['signature'] as Row)['key_id']).toBe(packageKey.keyId);
    expect(signed['signed_with']).toBeUndefined();
    expect(signed['package_key_id']).toBeUndefined();
    expect(verifyNotice(signed, packageKey.pem).ok).toBe(true);
    expect(verifyNotice(signed, activeKey.pem)).toMatchObject({ ok: false, reason: 'key_mismatch' });
  });

  it("falls back to the ACTIVE key when the package's reference is not bound here, and states it INSIDE the signed bytes", () => {
    const signed = signNotice(notice(), { keyId: packageKey.keyId, ref: UNBOUND_REF }, store, { keyId: activeKey.keyId, ref: ACTIVE_REF });
    expect(signed['signature']).toMatchObject({ scheme: NOTICE_SIGNATURE_SCHEME, key_id: activeKey.keyId, algorithm: 'Ed25519' });
    expect(signed['signed_with']).toBe('active_key');
    expect(signed['package_key_id']).toBe(packageKey.keyId);
    expect(signed['unsigned']).toBeUndefined();
    // The statement is signed: a recipient holding the package's key sees a key_mismatch it can act on; the statement removed → invalid.
    expect(verifyNotice(signed, activeKey.pem)).toEqual({ ok: true, keyId: activeKey.keyId, digest: noticeDigestOf(signed) });
    expect(verifyNotice(signed, packageKey.pem)).toMatchObject({ ok: false, reason: 'key_mismatch', detail: `the notice is signed by key ${activeKey.keyId}, not the partner's ${packageKey.keyId}` });
    const { signed_with: _s, package_key_id: _p, ...stripped } = signed;
    expect(verifyNotice(stripped, activeKey.pem)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(noticeDigestOf(signed)).not.toBe(noticeDigestOf(notice()));
  });

  it('signs with the active key, stating a null package key, for a package that named no key (a /1 chain package)', () => {
    const signed = signNotice({ ...notice(), signing_key_id: null }, null, store, { keyId: activeKey.keyId, ref: ACTIVE_REF });
    expect((signed['signature'] as Row)['key_id']).toBe(activeKey.keyId);
    expect(signed['signed_with']).toBe('active_key');
    expect(signed['package_key_id']).toBeNull();
    expect(verifyNotice(signed, activeKey.pem).ok).toBe(true);
  });

  it('tries the same key once when the package key IS the active key, and is unsigned naming it when that reference is not bound', () => {
    const same = { keyId: packageKey.keyId, ref: UNBOUND_REF };
    const unsigned = signNotice(notice(), same, store, same);
    expect(unsigned['signature']).toBeNull();
    expect(unsigned['unsigned']).toBe(`the package's signing key ${packageKey.keyId} is not bound in this deployment (${UNBOUND_REF}); the notice is unsigned`);
    expect(unsigned['signed_with']).toBeUndefined();
  });

  it('is unsigned naming BOTH keys when neither reference is bound', () => {
    const unsigned = signNotice(notice(), { keyId: packageKey.keyId, ref: UNBOUND_REF }, store, { keyId: activeKey.keyId, ref: 'EYE_EXPORT_SIGNING_KEY_B17_NOTICE_UNBOUND_TOO' });
    expect(unsigned['signature']).toBeNull();
    expect(unsigned['unsigned']).toBe(`the package's signing key ${packageKey.keyId} is not bound in this deployment (${UNBOUND_REF}) and the tenant's active export signing key ${activeKey.keyId} is not bound in this deployment (EYE_EXPORT_SIGNING_KEY_B17_NOTICE_UNBOUND_TOO); the notice is unsigned`);
    expect(unsigned['signed_with']).toBeUndefined();
    expect(unsigned['package_key_id']).toBeUndefined();
  });

  it('is unsigned naming the active key when no package key was given and the active reference is not bound', () => {
    const unsigned = signNotice(notice(), null, store, { keyId: activeKey.keyId, ref: UNBOUND_REF });
    expect(unsigned['signature']).toBeNull();
    expect(unsigned['unsigned']).toBe(`the tenant's active export signing key ${activeKey.keyId} is not bound in this deployment (${UNBOUND_REF}); the notice is unsigned`);
  });
});
