#!/usr/bin/env node
/**
 * THE DEMONSTRATION RECIPIENT of an HTTPS delivery (CP-6 B14; migration 0073 §3–§4 and 0074 §3; D6–D8 of B13, D1–D3 of B14;
 * DP-47-005 "require recipient acknowledgement before closure", ES-29-005 "revocation context", ES-53-004, CMP-102).
 *
 *   node scripts/retention/https-recipient.mjs --self-signed <hostname> [--listen <host>:<port>] [--bearer-env <NAME>]
 *        [--public-key <pem-file>] [--recipient <name>] [--store <dir>] [--plain]
 *   node scripts/retention/https-recipient.mjs --cert <pem> --key <pem> [...]
 *
 * THIS IS A DEMONSTRATION RECIPIENT, NOT A PRODUCT COMPONENT. An https destination is an endpoint the product POSTs a package to
 * (one deterministic tar, `application/x-tar`, the package's digests, the signature scheme and key id, the delivery and action ids in
 * headers, the destination's bearer credential on that one hop) and, after a revocation, POSTs a revocation notice to (`application/json`,
 * the header x-eye-notice: revocation). The party on the other side is the CUSTOMER — its own endpoint verifies the package and answers
 * a receipt. On the demonstration's isolated synthetic destination there is no such endpoint, so this script stands in for it: it does
 * what a recipient does, with the customer-side tools the product hands over (scripts/retention/verify-export.mjs), and nothing a
 * recipient could not do. It never talks to the product's database or modules — it serves TLS on the address it is given and answers
 * what it is sent. ISOLATED: it binds to 127.0.0.1 unless told otherwise, requires the bearer named by --bearer-env when one is named,
 * keeps what it received in memory and under --store (a private temporary directory by default), and forgets everything at exit.
 *
 * TLS: --self-signed <hostname> generates an EC P-256 key and a 2-day self-signed certificate for that hostname with openssl and prints
 * `certificate <path>` — the PEM the product's administrator declares as the destination's TRUST ANCHOR (B14 D2); --cert/--key serve a
 * certificate the operator already holds; --plain serves plain HTTP for a host that terminates TLS in front of the process (a hosted
 * demonstration recipient behind a platform's edge) — never for a destination the product reaches directly.
 *
 * What it does on a DELIVERY (`POST <any path>` with a tar body):
 *   1. checks the bearer (401 without it, when one is configured); reads the body (at most 256 MiB);
 *   2. computes sha256(body) — the archive digest of what it actually received — and compares it with x-eye-archive-digest;
 *   3. runs the customer's verifier on the archive (`verify-export.mjs --tar <received> --json`, with `--public-key` when a key was given
 *      and `--expect-package-digest` with the header's digest) — the checks, the verdict, the signature's state;
 *   4. answers a receipt: { receipt_id, delivery_id, attempt (both copied from the headers — C7: the product refuses a receipt naming
 *      another delivery), action_id, recipient, received_at, archive_digest (computed here), package_digest (the header's),
 *      verified: <the verifier's ok AND, when a public key was given, its signature verified>, verifier } — HTTP 200.
 * On a REVOCATION NOTICE (`POST` with x-eye-notice: revocation and a JSON body): the notice parsed, the copies of the named delivery
 * DESTROYED (the stored tar removed; the record marked revoked), the receipt answered: { receipt_id, notice_id, delivery_id, action_id,
 * package_digest, copies_destroyed: true, destroyed: [...], recipient, received_at }.
 *
 * THE CONTROL MODES (a harness's controls — the answers a real recipient could give, wrong or right; the product must classify each):
 *   POST /_control { "mode": "<mode>" } (the same bearer) — normal (the default) | stale (the receipt names the PREVIOUS delivery or
 *   notice received, as an endpoint that echoes its last receipt would — B13-F1's control) | wrong-digest (the archive digest with its
 *   first byte flipped) | deny (verified: false) | unverified (no `verified`, no digests — the recipient answered without verifying) |
 *   refuse (a notice answered with copies_destroyed: false) | not-json (a text body) | error (HTTP 500) | redirect (HTTP 302) |
 *   unauthorized (HTTP 401 whatever the bearer). GET /_received (the same bearer) lists what was received and what was revoked.
 * Nothing here prints a credential; the bearer's VALUE is compared and never logged.
 *
 * Node 18 or later; no dependency.
 */
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFIER = join(dirname(fileURLToPath(import.meta.url)), 'verify-export.mjs');
const VERIFIER_NAME = 'scripts/retention/verify-export.mjs (demonstration https recipient)';
const MODES = ['normal', 'stale', 'wrong-digest', 'deny', 'unverified', 'refuse', 'not-json', 'error', 'redirect', 'unauthorized'];
const MAX_BODY = 256 * 1024 * 1024;
const USAGE = 'usage: node scripts/retention/https-recipient.mjs (--self-signed <hostname> | --cert <pem> --key <pem> | --plain) [--listen <host>:<port>] [--bearer-env <NAME>] [--public-key <pem-file>] [--recipient <name>] [--store <dir>]';
const say = (line) => console.log(`[demonstration https recipient] ${line}`);
const fail = (line) => { console.error(`[demonstration https recipient] ${line}`); process.exit(2); };

/* ── arguments ─────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
let selfSigned = null; let certPath = null; let keyPath = null; let plain = false; let listen = '127.0.0.1:0'; let bearerEnv = null; let publicKeyPath = null; let recipientName = null; let store = null;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]; const v = () => { i += 1; return String(args[i] ?? ''); };
  if (a === '--self-signed') selfSigned = v();
  else if (a === '--cert') certPath = v();
  else if (a === '--key') keyPath = v();
  else if (a === '--plain') plain = true;
  else if (a === '--listen') listen = v();
  else if (a === '--bearer-env') bearerEnv = v();
  else if (a === '--public-key') publicKeyPath = v();
  else if (a === '--recipient') recipientName = v();
  else if (a === '--store') store = v();
  else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
  else fail(`unknown argument ${a}\n${USAGE}`);
}
if (!plain && selfSigned === null && (certPath === null || keyPath === null)) fail(USAGE);
if (bearerEnv !== null && !/^[A-Z][A-Z0-9_]{0,63}$/.test(bearerEnv)) fail('--bearer-env names an environment variable (A-Z, 0-9, _)');
const bearer = bearerEnv === null ? null : (process.env[bearerEnv] ?? '');
if (bearerEnv !== null && bearer === '') fail(`--bearer-env ${bearerEnv} is not set in the environment; the recipient refuses to run without the credential it was told to require`);
if (publicKeyPath !== null) { publicKeyPath = resolve(publicKeyPath); if (!existsSync(publicKeyPath)) fail(`the public key file ${publicKeyPath} does not exist`); }
const m = /^(.*):(\d{1,5})$/.exec(listen);
if (m === null) fail('--listen is <host>:<port>');
const host = m[1]; const port = Number(m[2]);
const storeDir = store === null ? mkdtempSync(join(tmpdir(), 'eye-https-recipient-')) : resolve(store);
mkdirSync(storeDir, { recursive: true, mode: 0o700 });
const recipient = recipientName ?? 'demonstration https recipient';

/* ── the certificate ───────────────────────────────────────────────────────── */
let tlsOptions = null;
if (!plain) {
  if (selfSigned !== null) {
    certPath = join(storeDir, 'recipient-cert.pem'); keyPath = join(storeDir, 'recipient-key.pem');
    const san = /^\d+\.\d+\.\d+\.\d+$/.test(selfSigned) || selfSigned.includes(':') ? `IP:${selfSigned}` : `DNS:${selfSigned}`;
    const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '2', '-subj', `/CN=${selfSigned}`, '-addext', `subjectAltName=${san}`], { encoding: 'utf8' });
    if (r.status !== 0) fail(`openssl could not generate the self-signed certificate: ${String(r.stderr).trim().slice(0, 300)}`);
    say(`self-signed certificate generated for ${selfSigned} (EC P-256, 2 days): the trust anchor the product's administrator declares`);
    console.log(`certificate ${certPath}`);
  }
  tlsOptions = { cert: readFileSync(certPath), key: readFileSync(keyPath), minVersion: 'TLSv1.2' };
}

/* ── the state ─────────────────────────────────────────────────────────────── */
let mode = 'normal';
const received = []; // { delivery_id, attempt, action_id, archive_digest, package_digest, verified, received_at, byte_length, path, revoked_at }
const notices = []; // { notice_id, delivery_id, action_id, package_digest, received_at, copies_destroyed }
const previous = (list) => (list.length >= 2 ? list[list.length - 2] : list[0] ?? null);

const authorized = (req) => {
  if (bearer === null) return true;
  const h = String(req.headers['authorization'] ?? '');
  if (!h.startsWith('Bearer ')) return false;
  const given = Buffer.from(h.slice(7), 'utf8'); const want = Buffer.from(bearer, 'utf8');
  return given.byteLength === want.byteLength && timingSafeEqual(given, want);
};
const answer = (res, status, body, type = 'application/json') => {
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : Buffer.from(JSON.stringify(body, null, 2), 'utf8');
  res.writeHead(status, { 'content-type': type, 'content-length': String(bytes.byteLength) });
  res.end(bytes);
};
const readBody = (req) => new Promise((resolvePromise, reject) => {
  const chunks = []; let total = 0;
  req.on('data', (c) => { total += c.length; if (total > MAX_BODY) { reject(new Error('body above 256 MiB')); req.destroy(); return; } chunks.push(c); });
  req.on('end', () => resolvePromise(Buffer.concat(chunks)));
  req.on('error', reject);
});
const flip = (hex) => `${(parseInt(hex.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0')}${hex.slice(2)}`;
const hdr = (req, name) => { const v = req.headers[name]; return typeof v === 'string' ? v : null; };

/* ── the handlers ──────────────────────────────────────────────────────────── */
const onControl = async (req, res) => {
  const body = await readBody(req);
  let p = null;
  try { p = JSON.parse(body.toString('utf8')); } catch { p = null; }
  const next = p && typeof p === 'object' ? String(p.mode ?? '') : '';
  if (!MODES.includes(next)) { answer(res, 422, { error: `mode is one of ${MODES.join(', ')}` }); return; }
  mode = next;
  say(`control: mode ${mode}`);
  answer(res, 200, { mode });
};

const onNotice = async (req, res, body) => {
  let notice = null;
  try { notice = JSON.parse(body.toString('utf8')); } catch { notice = null; }
  if (notice === null || typeof notice !== 'object' || Array.isArray(notice)) { answer(res, 400, { error: 'the notice is a JSON object' }); return; }
  const noticeId = typeof notice.notice_id === 'string' ? notice.notice_id : hdr(req, 'x-eye-notice-id');
  const concerns = notice.delivery && typeof notice.delivery === 'object' ? notice.delivery.delivery_id ?? null : hdr(req, 'x-eye-delivery-id');
  const packageDigest = typeof notice.package_digest === 'string' ? notice.package_digest : hdr(req, 'x-eye-package-digest');
  say(`REVOCATION NOTICE ${noticeId} attempt ${notice.attempt ?? '?'}: the package ${packageDigest ?? '?'} of action ${notice.action_id ?? '?'} revoked at ${notice.revoked_at ?? '?'}${notice.reason ? ` — ${JSON.stringify(notice.reason)}` : ''}; it concerns delivery ${concerns ?? '?'}`);
  say(`the obligation: ${notice.obligation ?? '(none stated)'}`);
  const destroyed = [];
  const refuse = mode === 'refuse';
  if (!refuse) {
    for (const r of received) {
      if (r.package_digest === packageDigest && r.revoked_at === null) {
        try { rmSync(r.path, { force: true }); } catch { /* the store is ours */ }
        r.revoked_at = new Date().toISOString(); destroyed.push(`${r.delivery_id} (attempt ${r.attempt})`);
      }
    }
    say(`copies destroyed: ${destroyed.length > 0 ? destroyed.join(', ') : 'none held for that package'}`);
  } else say('mode refuse: the copies are KEPT; the receipt says copies_destroyed: false');
  const record = { notice_id: noticeId, delivery_id: concerns, action_id: notice.action_id ?? null, package_digest: packageDigest, received_at: new Date().toISOString(), copies_destroyed: !refuse };
  notices.push(record);
  const named = mode === 'stale' ? previous(notices) : record;
  const receipt = {
    receipt_id: randomUUID(),
    notice_id: named.notice_id,
    delivery_id: named.delivery_id,
    action_id: record.action_id,
    package_digest: mode === 'wrong-digest' && packageDigest !== null ? flip(packageDigest) : packageDigest,
    copies_destroyed: !refuse,
    destroyed,
    recipient,
    received_at: record.received_at,
  };
  if (mode === 'stale') say(`mode stale: the receipt names notice ${named.notice_id} (the previous one), not ${noticeId}`);
  answer(res, 200, receipt);
};

const onDelivery = async (req, res, body) => {
  const deliveryId = hdr(req, 'x-eye-delivery-id'); const attempt = hdr(req, 'x-eye-attempt'); const actionId = hdr(req, 'x-eye-action-id');
  const notedArchive = hdr(req, 'x-eye-archive-digest'); const notedPackage = hdr(req, 'x-eye-package-digest');
  const scheme = hdr(req, 'x-eye-signature-scheme'); const keyId = hdr(req, 'x-eye-key-id');
  const archiveDigest = createHash('sha256').update(body).digest('hex');
  say(`DELIVERY ${deliveryId ?? '?'} attempt ${attempt ?? '?'} of action ${actionId ?? '?'}: ${body.byteLength} bytes ${req.headers['content-type'] ?? ''}, sha256 ${archiveDigest} — ${notedArchive === null ? 'no archive digest in the headers' : notedArchive === archiveDigest ? 'the archive digest the headers name' : `NOT the archive digest the headers name (${notedArchive})`}; signature ${scheme ?? '?'}${keyId ? ` by ${keyId}` : ''}; authorization ${req.headers['authorization'] === undefined ? 'none' : 'bearer (value not logged)'}`);
  const path = join(storeDir, `${deliveryId ?? randomUUID()}-${attempt ?? '0'}.tar`);
  writeFileSync(path, body, { mode: 0o600 });
  const verifierArgs = [VERIFIER, '--tar', path, '--json', ...(publicKeyPath !== null ? ['--public-key', publicKeyPath] : []), ...(notedPackage !== null && /^[0-9a-f]{64}$/.test(notedPackage) ? ['--expect-package-digest', notedPackage] : [])];
  const run = spawnSync(process.execPath, verifierArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let verdict = null;
  try { verdict = JSON.parse(run.stdout); } catch { verdict = null; }
  const verifierOk = verdict !== null && verdict.ok === true;
  const signatureVerified = verdict !== null && verdict.signature?.verified === true;
  if (verdict !== null) for (const c of (Array.isArray(verdict.checks) ? verdict.checks : [])) if (c.ok === false) say(`  FAIL  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  say(`verifier verdict: ${verifierOk ? 'PACKAGE OK' : 'PACKAGE FAILED'} (exit ${run.status}); signature ${verdict?.signature?.scheme ?? '?'}: ${signatureVerified ? 'VERIFIED against the public key' : verdict?.signature?.verified === false ? 'FAILED' : publicKeyPath === null ? 'not verified here (no --public-key given)' : 'not verified'}`);
  const verified = verifierOk && (publicKeyPath === null || signatureVerified) && notedArchive === archiveDigest;
  const record = { delivery_id: deliveryId, attempt: attempt === null ? null : Number(attempt), action_id: actionId, archive_digest: archiveDigest, package_digest: notedPackage, verified, received_at: new Date().toISOString(), byte_length: body.byteLength, path, revoked_at: null };
  received.push(record);
  const named = mode === 'stale' ? previous(received) : record;
  const receipt = {
    receipt_id: randomUUID(),
    delivery_id: named.delivery_id,
    attempt: named.attempt,
    action_id: actionId,
    recipient,
    received_at: record.received_at,
    archive_digest: mode === 'wrong-digest' ? flip(archiveDigest) : archiveDigest,
    package_digest: notedPackage,
    verified: mode === 'deny' ? false : verified,
    verifier: VERIFIER_NAME,
  };
  if (mode === 'unverified') { delete receipt.verified; delete receipt.archive_digest; delete receipt.package_digest; }
  if (mode === 'stale') say(`mode stale: the receipt names delivery ${named.delivery_id} attempt ${named.attempt} (the previous one), not ${deliveryId}`);
  say(`receipt ${receipt.receipt_id} answered — verified ${receipt.verified ?? '(absent)'}`);
  answer(res, 200, receipt);
};

const handle = async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/_control') { if (!authorized(req)) { answer(res, 401, { error: 'unauthorized' }); return; } await onControl(req, res); return; }
    if (req.method === 'GET' && req.url === '/_received') { if (!authorized(req)) { answer(res, 401, { error: 'unauthorized' }); return; } answer(res, 200, { mode, received: received.map(({ path, ...r }) => r), notices }); return; }
    if (req.method !== 'POST') { answer(res, 405, { error: 'POST a package or a notice' }); return; }
    if (mode === 'unauthorized' || !authorized(req)) { say(`${req.url}: 401 (${mode === 'unauthorized' ? 'mode unauthorized' : 'the bearer is missing or wrong'})`); answer(res, 401, { error: 'unauthorized' }); return; }
    const body = await readBody(req);
    if (mode === 'error') { say(`${req.url}: mode error → 500`); answer(res, 500, { error: 'the recipient failed (mode error)' }); return; }
    if (mode === 'redirect') { say(`${req.url}: mode redirect → 302`); res.writeHead(302, { location: 'https://elsewhere.invalid/receive' }); res.end(); return; }
    if (mode === 'not-json') { say(`${req.url}: mode not-json → a text body`); answer(res, 200, 'received, thanks', 'text/plain'); return; }
    if (hdr(req, 'x-eye-notice') === 'revocation') await onNotice(req, res, body);
    else await onDelivery(req, res, body);
  } catch (e) {
    say(`${req.url}: failed — ${e.message}`);
    try { answer(res, 500, { error: e.message }); } catch { /* the socket is gone */ }
  }
};

const server = plain ? createHttpServer(handle) : createHttpsServer(tlsOptions, handle);
server.listen(port, host, () => {
  const a = server.address();
  say(`THIS IS THE DEMONSTRATION HTTPS RECIPIENT: it stands in for the customer's endpoint on the demonstration's isolated synthetic destination`);
  say(`store ${storeDir}; bearer ${bearerEnv === null ? 'not required' : `required (${bearerEnv}; value never logged)`}; public key ${publicKeyPath ?? 'none (signatures not verified here)'}; recipient ${JSON.stringify(recipient)}`);
  console.log(`listening ${plain ? 'http' : 'https'}://${a.address.includes(':') ? `[${a.address}]` : a.address}:${a.port}`);
});
process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT', () => { server.close(); process.exit(0); });
