#!/usr/bin/env node
/**
 * THE OFFLINE VERIFIER of a licence token (CP-6 B91 §GR, migration 0105 §GR.3; F-P7-F-01 "offline licence token for disconnected
 * profiles"; PR-66-006 / AT-66 "offline licensing").
 *
 *   node scripts/commercial/verify-licence.mjs <token.json> [--public-key <pem-file>] [--tenant <uuid>] [--at <iso-instant>] [--json]
 *
 * Node 18 or later; no dependency, no network, no database — it reads the token alone. The token file is what the product handed over
 * (the issue route's `token`, or that whole response): `{ format: 'eye-licence-token/1', payload, payload_digest, algorithm: 'Ed25519',
 * signature, key_id, public_key_pem }`. The checks, in order, each printed PASS or FAIL with its reason; the exit code is 0 only when every
 * check ran and passed:
 *
 *   1. FORMAT       the token is a JSON object of format eye-licence-token/1, algorithm Ed25519;
 *   2. PAYLOAD      the payload text parses as a JSON object of the eight members (format, token_id, tenant_id, profile, issued_at, expires_at,
 *                   issuer, licence), its format and tenant restated by the licence basis;
 *   3. CANONICAL    the payload text is its own RFC 8785 (JCS) canonical form — the bytes digested are the canonical ones;
 *   4. DIGEST       sha256(payload text) = payload_digest;
 *   5. SIGNATURE    Ed25519 over the ASCII hex of the digest verifies — against the PUBLIC key given with --public-key (PINNED: the vendor's
 *                   key, obtained out of band), else against the token's own public_key_pem, reported UNPINNED (integrity only: anyone can
 *                   sign a token with a key of their own — the verdict says so and the JSON's `pinned` is false). A private key handed to
 *                   --public-key is refused, never used;
 *   6. KEY ID       the key verified is the one the token and its issuer name: ed25519:<first 16 hex of sha256(SPKI DER)>;
 *   7. EXPIRY       expires_at is after --at (default: now) — and issued_at is not after it;
 *   8. TENANT       with --tenant, the token is that tenant's (the payload's tenant and the licence basis's); without it, the two agree.
 *
 * The verdict: TOKEN OK only when every check passed (and, unpinned, "OK (UNPINNED)"); the text verdict, the JSON `ok` and the exit status
 * always agree. The DISCONNECTED PROFILE itself does not exist yet (P7-D / B106): this verifies the token, which closes the token clause only.
 */
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FORMAT = 'eye-licence-token/1';
const MEMBERS = ['expires_at', 'format', 'issued_at', 'issuer', 'licence', 'profile', 'tenant_id', 'token_id'];

function usage(msg) {
  if (msg) console.error(`verify-licence: ${msg}`);
  console.error('usage: node scripts/commercial/verify-licence.mjs <token.json> [--public-key <pem-file>] [--tenant <uuid>] [--at <iso-instant>] [--json]');
  process.exit(2);
}

const args = process.argv.slice(2);
let file = null; let keyFile = null; let tenant = null; let at = null; let json = false;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--public-key') keyFile = args[++i] ?? usage('--public-key needs a file');
  else if (a === '--tenant') tenant = args[++i] ?? usage('--tenant needs a tenant id');
  else if (a === '--at') at = args[++i] ?? usage('--at needs an instant');
  else if (a === '--json') json = true;
  else if (a.startsWith('--')) usage(`unknown option ${a}`);
  else if (file === null) file = a;
  else usage('one token file');
}
if (file === null) usage('no token file');
const atMs = at === null ? Date.now() : Date.parse(at);
if (!Number.isFinite(atMs)) usage('--at is not an instant');

/** RFC 8785 in the subset a token needs: members sorted by UTF-16 code units, primitives as JSON.stringify writes them. */
function jcs(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('not I-JSON'); return JSON.stringify(v); }
  if (Array.isArray(v)) return `[${v.map(jcs).join(',')}]`;
  if (typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`;
  throw new Error('not I-JSON');
}
const sha256 = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const keyIdOf = (pub) => `ed25519:${createHash('sha256').update(pub.export({ format: 'der', type: 'spki' })).digest('hex').slice(0, 16)}`;

const checks = [];
const add = (name, ok, detail) => { checks.push({ name, ok: Boolean(ok), detail }); return Boolean(ok); };

let token = null;
try {
  token = JSON.parse(readFileSync(file, 'utf8'));
  if (token !== null && typeof token === 'object' && !Array.isArray(token) && token.token && typeof token.token === 'object') token = token.token;
} catch (e) { token = null; add('token readable', false, `the file does not parse as JSON (${String(e.message ?? e).slice(0, 120)})`); }

let pinned = false; let payload = null; let verifiedKeyId = null;
if (token !== null && typeof token === 'object' && !Array.isArray(token)) {
  add('format', token.format === FORMAT && token.algorithm === 'Ed25519', `format ${token.format}, algorithm ${token.algorithm}`);
  const text = typeof token.payload === 'string' ? token.payload : null;
  if (text === null) add('payload', false, 'the token carries no payload text');
  else {
    try { payload = JSON.parse(text); } catch { payload = null; }
    const keys = payload !== null && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload).sort() : [];
    add('payload', keys.length === MEMBERS.length && keys.every((k, i) => k === MEMBERS[i]) && payload.format === FORMAT && payload.licence && typeof payload.licence === 'object',
        `the payload is a token of the eight members (${keys.join(', ') || 'unreadable'})`);
    let canonical = false; try { canonical = payload !== null && jcs(payload) === text; } catch { canonical = false; }
    add('canonical', canonical, 'the payload text is its own RFC 8785 canonical form');
    add('digest', typeof token.payload_digest === 'string' && sha256(text) === token.payload_digest, `sha256(payload text) ${sha256(text).slice(0, 16)}… = payload_digest ${String(token.payload_digest).slice(0, 16)}…`);
  }
  let pub = null;
  if (keyFile !== null) {
    const pem = readFileSync(keyFile, 'utf8');
    if (/PRIVATE KEY/.test(pem)) { add('signature', false, 'the file given as --public-key holds a PRIVATE key: refused, never used — pass the vendor\'s public key'); }
    else { try { pub = createPublicKey({ key: pem, format: 'pem' }); pinned = true; } catch { add('signature', false, 'the --public-key file is not a PEM public key'); } }
  } else if (typeof token.public_key_pem === 'string') {
    try { pub = createPublicKey({ key: token.public_key_pem, format: 'pem' }); } catch { pub = null; }
  }
  if (pub !== null) {
    let ok = false;
    try {
      ok = pub.asymmetricKeyType === 'ed25519' && /^[A-Za-z0-9+/]{86}==$/.test(String(token.signature)) && typeof token.payload_digest === 'string'
        && cryptoVerify(null, Buffer.from(token.payload_digest, 'utf8'), pub, Buffer.from(token.signature, 'base64'));
    } catch { ok = false; }
    add('signature', ok, pinned ? 'Ed25519 over the digest, against the given public key (PINNED)' : 'Ed25519 over the digest, against the token\'s OWN key (UNPINNED — integrity only; pass --public-key with the vendor\'s key)');
    verifiedKeyId = keyIdOf(pub);
    add('key id', verifiedKeyId === token.key_id && payload?.issuer?.key_id === token.key_id, `the key verified is ${verifiedKeyId}; the token names ${token.key_id}, its issuer ${payload?.issuer?.key_id}`);
  } else if (!checks.some((c) => c.name === 'signature')) {
    add('signature', false, 'no public key to verify with (the token carries none and --public-key was not given)');
  }
  if (payload !== null && typeof payload === 'object') {
    const exp = Date.parse(String(payload.expires_at)); const iss = Date.parse(String(payload.issued_at));
    add('expiry', Number.isFinite(exp) && exp > atMs && Number.isFinite(iss) && iss <= atMs, `issued ${payload.issued_at}, expires ${payload.expires_at}; checked at ${new Date(atMs).toISOString()}`);
    if (tenant !== null) add('tenant', payload.tenant_id === tenant && payload.licence?.tenant_id === tenant, `the token is for tenant ${payload.tenant_id}; expected ${tenant}`);
    else add('tenant', typeof payload.tenant_id === 'string' && payload.tenant_id === payload.licence?.tenant_id, `the token names tenant ${payload.tenant_id} (no --tenant given: only the two statements' agreement is checked)`);
  }
} else if (checks.length === 0) {
  add('token readable', false, 'the token is not a JSON object');
}

const ok = checks.length >= 8 && checks.every((c) => c.ok);
const licence = payload?.licence ?? null;
const summary = {
  ok, pinned, checks, key_id: verifiedKeyId,
  token: payload === null ? null : { token_id: payload.token_id, tenant_id: payload.tenant_id, profile: payload.profile, issued_at: payload.issued_at, expires_at: payload.expires_at },
  licence: licence === null ? null : { licence_id: licence.licence_id, version: licence.version, package_key: licence.package_key, capabilities: licence.capabilities, state: licence.state, term_end: licence.term_end, grace_until: licence.grace_until },
  note: 'the disconnected profile itself does not exist yet (P7-D / B106): the token is verified, not a profile',
};
if (json) console.log(JSON.stringify(summary, null, 2));
else {
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(10)} ${c.detail}`);
  if (licence !== null) console.log(`licence ${licence.licence_id} v${licence.version} · ${licence.package_key} · ${(licence.capabilities ?? []).join(', ')} · ${licence.state}${licence.grace_until ? ` (grace until ${licence.grace_until})` : ''}`);
  console.log(ok ? (pinned ? 'TOKEN OK' : 'TOKEN OK (UNPINNED — the signature was checked against the token\'s own key)') : `TOKEN FAILED (${checks.filter((c) => !c.ok).length} check(s))`);
}
process.exit(ok ? 0 : 1);
