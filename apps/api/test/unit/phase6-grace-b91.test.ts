/**
 * CP-6 B91 part `grace` (0105 §GR) — the pure logic: the OFFLINE LICENCE TOKEN (the canonical payload, the digest, the Ed25519 signature,
 * the key store's refusals, the product's own verification and the offline verifier scripts/commercial/verify-licence.mjs run as a customer
 * would: pinned, unpinned, tampered, expired, the wrong tenant, a private key refused), the route validators, the tick step's name and
 * order, EVERY refusal text of the part through the observation-errors mapper (the B9 order: 403 actor/authority, 404 unknown_*, 409
 * state/stale/duplicate/indeterminate, 422 the rest) and the PDP's EXACT rules (the commercial authority's acts human-gated; no tenant role,
 * no agent and not the platform administrator renews, suspends, reinstates, sets a grace or issues a token; the reads). Every value is
 * SYNTHETIC; the key is generated here and never printed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { canonicalPayload, isCanonical, LicenceSigningKeyStore, sha256Hex, verifySignature, verifyToken, TOKEN_FORMAT, type OfflineToken, type TokenPayload } from '../../src/commercial/grace/licence-token.js';
import { ALWAYS_AVAILABLE, LICENCE_LAPSE_ORDER, LICENCE_LAPSE_STEP, validatePolicy, validateRenewal, validateToken, validateTransition } from '../../src/commercial/grace/grace.service.js';

const C = '00000000-0000-4000-8000-000000000001';
const T = '0193a3d0-0000-7000-8000-000000000001';
const T2 = '0193a3d0-0000-7000-8000-000000000009';
const L = '0193a3d0-0000-7000-8000-0000000000b1';
const REF = 'EYE_LICENCE_SIGNING_KEY_UNIT_B91';
const REF_RSA = 'EYE_LICENCE_SIGNING_KEY_UNIT_B91_RSA';
const VERIFIER = resolve(__dirname, '../../../../scripts/commercial/verify-licence.mjs');
const msg = (f: () => unknown): string => {
  try { f(); } catch (e) { if (e instanceof HttpException) return String((e.getResponse() as { message?: string }).message); throw e; }
  return '';
};

let dir = '';
let publicPem = '';
let otherPublicPem = '';
let privatePem = '';
const store = new LicenceSigningKeyStore();

beforeAll(() => {
  // the harness's own keys (SYNTHETIC): the signing key bound to the reference in this process only
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  process.env[REF] = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  publicPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
  privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  otherPublicPem = generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' }).toString();
  process.env[REF_RSA] = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  dir = mkdtempSync(join(tmpdir(), 'b91-grace-'));
});
afterAll(() => {
  delete process.env[REF]; delete process.env[REF_RSA];
  if (dir !== '') rmSync(dir, { recursive: true, force: true });
});

const basis = (over: Partial<TokenPayload['licence']> = {}): TokenPayload['licence'] => ({
  licence_id: L, version: 3, tenant_id: T, package_key: 'foresight-decision', capabilities: ['decision', 'foresight'], limits: { model_inference: 5000, simulation_compute: 0 },
  effective_from: '2026-09-01T00:00:00.000000Z', effective_to: '2027-09-01T00:00:00.000000Z', term_end: '2027-09-01T00:00:00.000000Z', state: 'active', grace_until: null,
  digest: 'a'.repeat(64), ...over,
});
function mint(over: Partial<TokenPayload> = {}): OfflineToken {
  const key = store.derivePublic(REF);
  if (!key.ok) throw new Error('the unit key is not bound');
  const payload: TokenPayload = { format: TOKEN_FORMAT, token_id: C, tenant_id: T, profile: 'disconnected', issued_at: '2026-10-04T10:00:00.000000Z', expires_at: '2027-01-01T00:00:00.000000Z',
    issuer: { principal_id: C, key_id: key.keyId }, licence: basis(), ...over };
  const text = canonicalPayload(payload);
  const digest = sha256Hex(text);
  return { format: TOKEN_FORMAT, payload: text, payload_digest: digest, algorithm: 'Ed25519', signature: store.sign(REF, digest) as string, key_id: key.keyId, public_key_pem: key.publicKeyPem };
}
const AT = new Date('2026-11-01T00:00:00Z');

describe('B91 grace · the offline licence token (canonical, digested, signed)', () => {
  it('the payload text is canonical (RFC 8785): the member order never changes the bytes; a re-ordered or spaced text is not canonical', () => {
    const p = JSON.parse(mint().payload) as TokenPayload;
    const reordered = Object.fromEntries(Object.entries(p).reverse()) as unknown as TokenPayload;
    expect(canonicalPayload(reordered)).toBe(canonicalPayload(p));
    expect(isCanonical(canonicalPayload(p))).toBe(true);
    expect(isCanonical(JSON.stringify(p, null, 1))).toBe(false);
    expect(isCanonical(JSON.stringify(reordered))).toBe(false);
    expect(isCanonical('not json')).toBe(false);
  });
  it('the key store: the public key and the key id derived from the reference; a malformed reference, an unbound one and a non-Ed25519 key refused; the value never returned', () => {
    const k = store.derivePublic(REF);
    expect(k.ok).toBe(true);
    if (k.ok) { expect(k.keyId).toMatch(/^ed25519:[0-9a-f]{16}$/); expect(k.publicKeyPem.replace(/\s/g, '')).toBe(publicPem.replace(/\s/g, '')); expect(JSON.stringify(k)).not.toContain(process.env[REF] as string); }
    expect(store.derivePublic('EYE_EXPORT_SIGNING_KEY_DEMO')).toEqual({ ok: false, reason: 'reference' });
    expect(store.derivePublic('EYE_LICENCE_SIGNING_KEY_NOT_BOUND_HERE')).toEqual({ ok: false, reason: 'unbound' });
    expect(store.derivePublic(REF_RSA)).toEqual({ ok: false, reason: 'not_ed25519' });
    expect(store.sign('EYE_LICENCE_SIGNING_KEY_NOT_BOUND_HERE', 'ab')).toBeNull();
    expect(store.sign(REF_RSA, 'ab')).toBeNull();
  });
  it('POSITIVE: a minted token verifies PINNED against the vendor key — format, canonical, digest, signature, key id, expiry, tenant', () => {
    const v = verifyToken(mint(), { at: AT, tenantId: T, publicKeyPem: publicPem });
    expect(v.checks.map((c) => [c.name, c.ok])).toEqual([['format', true], ['payload readable', true], ['canonical', true], ['digest', true], ['signature', true], ['key id', true], ['expiry', true], ['tenant', true]]);
    expect(v).toMatchObject({ ok: true, pinned: true });
    expect(verifySignature(publicPem, mint().payload_digest, mint().signature)).toBe(true);
  });
  it('REFUSAL: a tampered payload (the capabilities widened), a forged digest, another key, an expired token, another tenant — each its own failed check', () => {
    const t = mint();
    const widened = { ...t, payload: t.payload.replace('"decision","foresight"', '"decision","foresight","simulation"') };
    expect(verifyToken(widened, { at: AT, tenantId: T, publicKeyPem: publicPem }).checks.find((c) => c.name === 'digest')?.ok).toBe(false);
    const redigested = { ...widened, payload_digest: sha256Hex(widened.payload) };
    const rv = verifyToken(redigested, { at: AT, tenantId: T, publicKeyPem: publicPem });
    expect(rv.ok).toBe(false);
    expect(rv.checks.find((c) => c.name === 'signature')?.ok).toBe(false);
    expect(verifyToken(t, { at: AT, tenantId: T, publicKeyPem: otherPublicPem }).checks.find((c) => c.name === 'signature')?.ok).toBe(false);
    expect(verifyToken(t, { at: new Date('2027-02-01T00:00:00Z'), tenantId: T, publicKeyPem: publicPem }).checks.find((c) => c.name === 'expiry')?.ok).toBe(false);
    expect(verifyToken(t, { at: AT, tenantId: T2, publicKeyPem: publicPem }).checks.find((c) => c.name === 'tenant')?.ok).toBe(false);
    expect(verifyToken(null, { at: AT })).toMatchObject({ ok: false });
    expect(verifyToken({ ...t, signature: 'x' }, { at: AT, publicKeyPem: publicPem }).ok).toBe(false);
  });
  it('RECOVERY: unpinned, the token\'s own key verifies integrity and SAYS it is unpinned; a re-minted token for the new term verifies again', () => {
    const v = verifyToken(mint(), { at: AT, tenantId: T });
    expect(v).toMatchObject({ ok: true, pinned: false });
    expect(v.checks.find((c) => c.name === 'signature')?.detail).toMatch(/UNPINNED/);
    const renewed = mint({ expires_at: '2027-08-01T00:00:00.000000Z', licence: basis({ term_end: '2028-09-01T00:00:00.000000Z' }) });
    expect(verifyToken(renewed, { at: new Date('2027-03-01T00:00:00Z'), tenantId: T, publicKeyPem: publicPem }).ok).toBe(true);
  });
});

describe('B91 grace · the offline verifier (scripts/commercial/verify-licence.mjs), run as the customer runs it', () => {
  const run = (args: string[]): { status: number; out: string } => {
    try { return { status: 0, out: execFileSync(process.execPath, [VERIFIER, ...args], { encoding: 'utf8' }) }; }
    catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return { status: x.status ?? -1, out: `${x.stdout ?? ''}${x.stderr ?? ''}` }; }
  };
  it('POSITIVE: the issue route\'s answer (the whole response) verifies pinned: exit 0, TOKEN OK; --json agrees', () => {
    writeFileSync(join(dir, 'token.json'), JSON.stringify({ record: { token_id: C }, token: mint() }));
    writeFileSync(join(dir, 'vendor.pem'), publicPem);
    const r = run([join(dir, 'token.json'), '--public-key', join(dir, 'vendor.pem'), '--tenant', T, '--at', AT.toISOString()]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/TOKEN OK\n$/);
    expect(r.out.match(/^PASS/gm)?.length).toBe(8);
    const j = JSON.parse(run([join(dir, 'token.json'), '--public-key', join(dir, 'vendor.pem'), '--tenant', T, '--at', AT.toISOString(), '--json']).out) as { ok: boolean; pinned: boolean; licence: { capabilities: string[] } };
    expect(j).toMatchObject({ ok: true, pinned: true, licence: { capabilities: ['decision', 'foresight'] } });
  });
  it('REFUSAL: a widened payload, an expired token, the wrong tenant, another key — exit 1 with the failed check named; a PRIVATE key handed as --public-key refused', () => {
    const t = mint();
    writeFileSync(join(dir, 'widened.json'), JSON.stringify({ ...t, payload: t.payload.replace('"foresight"', '"foresight","simulation"') }));
    writeFileSync(join(dir, 'token.json'), JSON.stringify(t));
    writeFileSync(join(dir, 'other.pem'), otherPublicPem);
    writeFileSync(join(dir, 'private.pem'), privatePem);
    writeFileSync(join(dir, 'vendor.pem'), publicPem);
    const w = run([join(dir, 'widened.json'), '--public-key', join(dir, 'vendor.pem'), '--at', AT.toISOString()]);
    expect(w.status).toBe(1); expect(w.out).toMatch(/FAIL {2}digest/); expect(w.out).toMatch(/TOKEN FAILED/);
    const e = run([join(dir, 'token.json'), '--public-key', join(dir, 'vendor.pem'), '--at', '2027-06-01T00:00:00Z']);
    expect(e.status).toBe(1); expect(e.out).toMatch(/FAIL {2}expiry/);
    const tn = run([join(dir, 'token.json'), '--public-key', join(dir, 'vendor.pem'), '--tenant', T2, '--at', AT.toISOString()]);
    expect(tn.status).toBe(1); expect(tn.out).toMatch(/FAIL {2}tenant/);
    const k = run([join(dir, 'token.json'), '--public-key', join(dir, 'other.pem'), '--at', AT.toISOString()]);
    expect(k.status).toBe(1); expect(k.out).toMatch(/FAIL {2}signature/);
    const p = run([join(dir, 'token.json'), '--public-key', join(dir, 'private.pem'), '--at', AT.toISOString()]);
    expect(p.status).toBe(1); expect(p.out).toMatch(/PRIVATE key: refused, never used/);
    expect(p.out).not.toContain('BEGIN PRIVATE KEY');
  });
  it('RECOVERY: without the vendor key the verifier still proves integrity and says UNPINNED (exit 0); with it, TOKEN OK', () => {
    writeFileSync(join(dir, 'token.json'), JSON.stringify(mint()));
    const u = run([join(dir, 'token.json'), '--tenant', T, '--at', AT.toISOString()]);
    expect(u.status, u.out).toBe(0);
    expect(u.out).toMatch(/TOKEN OK \(UNPINNED/);
  });
});

describe('B91 grace · the route validators and the tick step', () => {
  it('a transition names its version and says why; evidence is an object', () => {
    expect(validateTransition({ version: 2, reason: 'payment overdue 60 days (SYNTHETIC)', evidence: { ticket: 'COM-1' } }, C)).toEqual({ version: 2, reason: 'payment overdue 60 days (SYNTHETIC)', evidence: { ticket: 'COM-1' } });
    expect(msg(() => validateTransition({ version: 0, reason: 'payment overdue' }, C))).toMatch(/version must name/);
    expect(msg(() => validateTransition({ version: 1, reason: 'short' }, C))).toMatch(/reason must say why/);
    expect(msg(() => validateTransition({ version: 1, reason: 'payment overdue', evidence: [] }, C))).toMatch(/evidence must be an object/);
    expect(validateRenewal({ version: 1, reason: 'renewed for 12 months', renewedUntil: '2027-10-01T00:00:00Z' }, C)).toMatchObject({ renewedUntil: '2027-10-01T00:00:00Z' });
    expect(msg(() => validateRenewal({ version: 1, reason: 'renewed for 12 months', renewedUntil: 'next year' }, C))).toMatch(/renewedUntil must be an instant/);
  });
  it('a grace policy: tenant, expected version, days, allows (deduplicated; the boundary is the PORT\'s recorded refusal), notice', () => {
    expect(validatePolicy({ tenantId: T, expectedVersion: 0, graceDays: 7, allows: ['read_and_preserve', 'read_and_preserve'], renewalNoticeDays: 30, reason: 'the standard grace for the tenant' }, C))
      .toEqual({ tenantId: T, expectedVersion: 0, graceDays: 7, allows: ['read_and_preserve'], renewalNoticeDays: 30, reason: 'the standard grace for the tenant' });
    expect(validatePolicy({ tenantId: T, expectedVersion: 0, graceDays: 7, allows: ['finish_running_work'], renewalNoticeDays: 30, reason: 'a grace without read and preserve' }, C).allows).toEqual(['finish_running_work']);
    expect(msg(() => validatePolicy({ tenantId: 'x', expectedVersion: 0, graceDays: 7, allows: ['read_and_preserve'], renewalNoticeDays: 30, reason: 'the standard grace' }, C))).toMatch(/tenantId/);
    expect(msg(() => validatePolicy({ tenantId: T, expectedVersion: 0, graceDays: 7, allows: [], renewalNoticeDays: 30, reason: 'the standard grace' }, C))).toMatch(/allows must list/);
    expect(msg(() => validatePolicy({ tenantId: T, expectedVersion: 0, graceDays: 1.5, allows: ['read_and_preserve'], renewalNoticeDays: 30, reason: 'the standard grace' }, C))).toMatch(/graceDays/);
  });
  it('a token: a profile of the two, an instant, an env REFERENCE (never a key value)', () => {
    expect(validateToken({ version: 1, expiresAt: '2027-01-01T00:00:00Z', keyRef: 'EYE_LICENCE_SIGNING_KEY_DEMO', reason: 'the field kit for the plant (SYNTHETIC)' }, C)).toMatchObject({ profile: 'disconnected' });
    expect(msg(() => validateToken({ version: 1, profile: 'local-dev', expiresAt: '2027-01-01T00:00:00Z', keyRef: 'EYE_LICENCE_SIGNING_KEY_DEMO', reason: 'the field kit for the plant' }, C))).toMatch(/profile is one of/);
    expect(msg(() => validateToken({ version: 1, expiresAt: '2027-01-01T00:00:00Z', keyRef: 'a-key-value-not-a-reference', reason: 'the field kit for the plant' }, C))).toMatch(/keyRef must be an env reference/);
  });
  it('the tick step: commercial-licence-lapse at 80; what stays available is named in every state', () => {
    expect([LICENCE_LAPSE_STEP, LICENCE_LAPSE_ORDER]).toEqual(['commercial-licence-lapse', 80]);
    expect(ALWAYS_AVAILABLE).toEqual(expect.arrayContaining(['the audit read and verification', 'warnings and their acknowledgement', 'corrections and withdrawals', 'export and the customer\'s own records']));
  });
});

describe('B91 grace · every refusal text through the mapper (the B9 order)', () => {
  const pg = (message: string, code: string) => Object.assign(new Error(message), { code });
  const status = (message: string, code: string) => asObservationRefusal(pg(message, code), C)?.getStatus() ?? null;
  it('403 actor/authority · 404 unknown_* · 409 state/stale/duplicate/indeterminate · 422 the rest', () => {
    const cases: Array<[string, string, number]> = [
      ['licence transition rejected (actor): recorded by the acting principal', '42501', 403],
      ['licence transition rejected (authority): a licence\'s state is the vendor\'s commercial authority\'s act', '42501', 403],
      ['grace policy rejected (authority): the acting principal is not an active human holding the commercial authority', '42501', 403],
      ['offline token rejected (actor): recorded by the acting principal', '42501', 403],
      ['licence transition rejected (unknown_licence): licence x has no version 2', '23503', 404],
      ['grace policy rejected (unknown_tenant): no tenant x', '23503', 404],
      ['offline token rejected (unknown_licence): licence x has no version 1', '23503', 404],
      ['licence transition rejected (state): licence x v1 is suspended', '2F002', 409],
      ['licence transition rejected (stale): licence x v1 is superseded', '2F002', 409],
      ['licence transition rejected (indeterminate): 2 live licence versions conflict', '2F002', 409],
      ['grace policy rejected (stale): the tenant\'s grace policy is at version 1', '2F002', 409],
      ['grace policy rejected (state): a grace policy version is never deleted', '2F002', 409],
      ['offline token rejected (state): licence x v1 is lapsed', '2F002', 409],
      ['offline token rejected (duplicate): token x is already issued', '23505', 409],
      ['licence transition rejected (reason): a transition says why', '22023', 422],
      ['licence transition rejected (term): a renewal runs to an instant later than now', '22023', 422],
      ['licence transition rejected (evidence): the evidence is an object', '22023', 422],
      ['grace policy rejected (boundary): read and preserve cannot be removed', '22023', 422],
      ['grace policy rejected (allows): grace allows read_and_preserve', '22023', 422],
      ['grace policy rejected (grace_days): a grace lasts 1 to 90 days', '22023', 422],
      ['grace policy rejected (notice): the renewal notice is 0 to 180 days', '22023', 422],
      ['offline token rejected (digest): the digest is not sha256 of the payload text', '22023', 422],
      ['offline token rejected (payload): the payload is not the token of licence x v1', '22023', 422],
      ['offline token rejected (expiry): a token expires at least an hour ahead', '22023', 422],
      ['offline token rejected (key): the key is named by its reference', '22023', 422],
      ['offline token rejected (signature): an Ed25519 signature is 64 bytes', '22023', 422],
      ['offline token rejected (profile): a token is for the disconnected or air-gapped profile', '22023', 422],
    ];
    for (const [m, code, s] of cases) expect(status(m, code), m).toBe(s);
  });
});

describe('B91 grace · the PDP: EXACT rules, the commercial authority\'s acts human-gated', () => {
  const D = '0193a3d0-0000-7000-8000-000000000002';
  const pdp = new PdpService();
  const at = (action: string, roles: Array<[string, 'PLATFORM' | 'TENANT' | 'DOMAIN']>, ctxScope: 'PLATFORM' | 'TENANT' | 'DOMAIN', consequenceClass: PolicyInput['consequenceClass'] = 'C2') => pdp.evaluate({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: 'human', assurance: 'password',
                 bindings: roles.map(([roleCode, scope]) => ({ roleCode, scope, tenantId: scope === 'PLATFORM' ? null : T, domainId: scope === 'DOMAIN' ? D : null })) as never },
    delegationId: null, action, objectType: 'LIC', objectId: null, purposeId: 'commercial',
    context: ctxScope === 'PLATFORM' ? { scope: 'PLATFORM', tenantId: null, domainId: null } : ctxScope === 'TENANT' ? { scope: 'TENANT', tenantId: T, domainId: null } : { scope: 'DOMAIN', tenantId: T, domainId: D },
    consequenceClass, environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  const allowed = (r: { decision: string }) => r.decision === 'allow' || r.decision === 'allow_with_obligations';
  const ACTS = ['commercial.licence.renew', 'commercial.licence.suspend', 'commercial.licence.reinstate', 'commercial.grace.set', 'commercial.offline_token.issue'];
  it('the commercial authority (PLATFORM) is allowed every act, each with the human gate', () => {
    for (const a of ACTS) {
      const r = at(a, [['commercial_authority', 'PLATFORM']], 'PLATFORM');
      expect(r.decision, a).toBe('allow_with_obligations');
      expect(r.obligations, a).toEqual([{ type: 'human_gate' }]);
    }
  });
  it('nobody else: the platform administrator, the tenant administrator, the domain roles, the agents — refused every act', () => {
    for (const a of ACTS) {
      expect(allowed(at(a, [['platform_admin', 'PLATFORM']], 'PLATFORM')), a).toBe(false);
      expect(allowed(at(a, [['tenant_admin', 'TENANT']], 'TENANT')), a).toBe(false);
      expect(allowed(at(a, [['domain_admin', 'DOMAIN'], ['executive', 'DOMAIN'], ['attention_agent', 'DOMAIN'], ['decision_agent', 'DOMAIN']], 'DOMAIN')), a).toBe(false);
    }
  });
  it('the read: the commercial authority, the tenant administrator and the auditor, the workspace roles in the domain — audited; an outsider and the platform administrator not', () => {
    expect(at('commercial.grace.read', [['commercial_authority', 'PLATFORM']], 'PLATFORM').obligations).toEqual([{ type: 'audit_access' }]);
    for (const r of ['tenant_admin', 'auditor']) expect(allowed(at('commercial.grace.read', [[r, 'TENANT']], 'TENANT')), r).toBe(true);
    for (const r of ['domain_admin', 'executive', 'twin_owner', 'simulation_operator', 'domain_analyst', 'decision_owner']) expect(allowed(at('commercial.grace.read', [[r, 'DOMAIN']], 'DOMAIN')), r).toBe(true);
    for (const r of ['collection_manager', 'attention_agent']) expect(allowed(at('commercial.grace.read', [[r, 'DOMAIN']], 'DOMAIN')), r).toBe(false);
    expect(allowed(at('commercial.grace.read', [['platform_admin', 'PLATFORM']], 'PLATFORM'))).toBe(false);
  });
  it('matches EXACTLY: neighbouring names inherit nothing; nothing reaches C3', () => {
    for (const a of ['commercial.licence', 'commercial.licence.renewed', 'commercial.grace', 'commercial.grace.sets', 'commercial.offline_token', 'commercial.licence.lift']) {
      expect(allowed(at(a, [['commercial_authority', 'PLATFORM']], 'PLATFORM')), a).toBe(false);
    }
    for (const a of ACTS) expect(allowed(at(a, [['commercial_authority', 'PLATFORM']], 'PLATFORM', 'C3')), a).toBe(false);
  });
});
