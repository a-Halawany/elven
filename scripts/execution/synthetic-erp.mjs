#!/usr/bin/env node
/**
 * THE SYNTHETIC ERP — the execution target of a governed handoff (CP-6 B34 part C; migration 0090 §C5; F-P6-05). Forked from
 * scripts/retention/https-recipient.mjs (B14): the same TLS, bearer and control discipline.
 *
 *   node scripts/execution/synthetic-erp.mjs --self-signed <hostname> [--listen 127.0.0.1:<port>] [--bearer-env <NAME>] [--name <label>]
 *
 * THIS IS A SYNTHETIC TARGET, NOT AN ERP AND NOT A PRODUCT COMPONENT. A real ERP or ticketing system is an owner decision (the D6
 * precedent): nothing this script answers closes a real-ERP clause. It stands in for the purchasing system a commitment's handoff is sent
 * to, on the demonstration's and the harness's isolated loopback address: it never talks to the product's database or modules — it serves
 * TLS on the loopback address it is given, answers what it is sent, keeps everything in memory and forgets it at exit. It REFUSES to bind
 * anything but a loopback address.
 *
 * TLS: --self-signed <hostname> generates an EC P-256 key and a 2-day self-signed certificate for that hostname with openssl (in a private
 * temporary directory) and prints `certificate <path>` — the PEM the product's administrator declares as the target's TRUST ANCHOR.
 *
 * What it does on a HANDOFF (`POST <any path>`, a JSON purchase request: { kind: 'purchase_request', handoff_id, attempt, payload_digest,
 * commitment_id, item_id, lines: [{ line_key, description, quantity, unit }], … }):
 *   1. checks the bearer (401 without it, when one is configured);
 *   2. IDEMPOTENT ON THE HANDOFF ID: a handoff already effected here answers the SAME effects again (a retry never orders twice), echoing
 *      the attempt it was sent with;
 *   3. otherwise effects the lines as the mode says and answers the receipt — HTTP 200: { receipt_id, handoff_id, attempt, payload_digest
 *      (all three ECHOED from the request — the product refuses to call any other answer an effect), status accepted | partial | rejected,
 *      erp_reference, lines: [{ line_key, status effected | partial | rejected, effected_quantity, erp_reference }], synthetic: true }.
 *
 * THE CONTROL MODES (POST /_control { "mode": … }, the same bearer): normal (every line effected in full) | partial (every line HALF
 * effected: floor(quantity / 2)) | reject-line (the first line rejected, the others effected) | stale (the receipt names the PREVIOUS
 * handoff or attempt received — an ERP that echoes its last receipt; nothing is effected) | deny (HTTP 403: the ERP refuses the requester)
 * | error (HTTP 500, nothing effected — the harness's transport fault for the retries). GET /_received lists what was received and effected.
 * Nothing here prints a credential; the bearer's VALUE is compared and never logged.
 *
 * Node 18 or later; no dependency.
 */
import { createServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODES = ['normal', 'partial', 'reject-line', 'stale', 'deny', 'error'];
const MAX_BODY = 1024 * 1024;
const USAGE = 'usage: node scripts/execution/synthetic-erp.mjs --self-signed <hostname> [--listen 127.0.0.1:<port>] [--bearer-env <NAME>] [--name <label>]';
const say = (line) => console.log(`[synthetic ERP] ${line}`);
const fail = (line) => { console.error(`[synthetic ERP] ${line}`); process.exit(2); };

const args = process.argv.slice(2);
let selfSigned = null; let listen = '127.0.0.1:0'; let bearerEnv = null; let name = 'SYNTHETIC ERP';
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]; const v = () => { i += 1; return String(args[i] ?? ''); };
  if (a === '--self-signed') selfSigned = v();
  else if (a === '--listen') listen = v();
  else if (a === '--bearer-env') bearerEnv = v();
  else if (a === '--name') name = v();
  else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
  else fail(`unknown argument ${a}\n${USAGE}`);
}
if (selfSigned === null) fail(USAGE);
if (bearerEnv !== null && !/^[A-Z][A-Z0-9_]{0,63}$/.test(bearerEnv)) fail('--bearer-env names an environment variable (A-Z, 0-9, _)');
const bearer = bearerEnv === null ? null : (process.env[bearerEnv] ?? '');
if (bearerEnv !== null && bearer === '') fail(`--bearer-env ${bearerEnv} is not set; the ERP refuses to run without the credential it was told to require`);
const m = /^(.*):(\d{1,5})$/.exec(listen);
if (m === null) fail('--listen is <host>:<port>');
const host = m[1]; const port = Number(m[2]);
if (!['127.0.0.1', '::1', 'localhost'].includes(host)) fail(`the synthetic ERP binds a loopback address only (127.0.0.1, ::1), never ${host}`);

const dir = mkdtempSync(join(tmpdir(), 'eye-synthetic-erp-'));
const certPath = join(dir, 'erp-cert.pem'); const keyPath = join(dir, 'erp-key.pem');
const san = /^\d+\.\d+\.\d+\.\d+$/.test(selfSigned) || selfSigned.includes(':') ? `IP:${selfSigned}` : `DNS:${selfSigned}`;
const gen = spawnSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '2', '-subj', `/CN=${selfSigned}`, '-addext', `subjectAltName=${san}`], { encoding: 'utf8' });
if (gen.status !== 0) fail(`openssl could not generate the self-signed certificate: ${String(gen.stderr).trim().slice(0, 300)}`);
say(`self-signed certificate generated for ${selfSigned} (EC P-256, 2 days): the trust anchor the product's administrator declares`);
console.log(`certificate ${certPath}`);

let mode = 'normal';
const received = []; // { handoff_id, attempt, payload_digest, lines, received_at, answered }
const effected = new Map(); // handoff_id → { status, erp_reference, lines }

const authorized = (req) => {
  if (bearer === null) return true;
  const h = String(req.headers['authorization'] ?? '');
  if (!h.startsWith('Bearer ')) return false;
  const given = Buffer.from(h.slice(7), 'utf8'); const want = Buffer.from(bearer, 'utf8');
  return given.byteLength === want.byteLength && timingSafeEqual(given, want);
};
const answer = (res, status, body) => {
  const bytes = Buffer.from(JSON.stringify(body, null, 2), 'utf8');
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(bytes.byteLength) });
  res.end(bytes);
};
const readJson = (req) => new Promise((resolve, reject) => {
  const chunks = []; let total = 0;
  req.on('data', (c) => { total += c.length; if (total > MAX_BODY) { reject(new Error('body above 1 MiB')); req.destroy(); return; } chunks.push(c); });
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
  req.on('error', reject);
});

const effect = (lines) => lines.map((l, i) => {
  const q = Number(l.quantity);
  const qty = mode === 'partial' ? Math.floor(q / 2) : mode === 'reject-line' && i === 0 ? 0 : q;
  return { line_key: l.line_key, status: qty >= q ? 'effected' : qty > 0 ? 'partial' : 'rejected', effected_quantity: qty, erp_reference: qty > 0 ? `SYN-PO-${randomUUID().slice(0, 8).toUpperCase()}` : null };
});

const onHandoff = async (req, res) => {
  const p = await readJson(req);
  if (p === null || typeof p !== 'object' || typeof p.handoff_id !== 'string' || !Array.isArray(p.lines)) { answer(res, 400, { error: 'a purchase request is a JSON object with handoff_id and lines' }); return; }
  const record = { handoff_id: p.handoff_id, attempt: p.attempt ?? null, payload_digest: p.payload_digest ?? null, lines: p.lines.length, received_at: new Date().toISOString(), answered: null };
  const prior = received.length > 0 ? received[received.length - 1] : null;
  received.push(record);
  say(`HANDOFF ${p.handoff_id} attempt ${p.attempt ?? '?'}: ${p.lines.length} line(s), payload ${p.payload_digest ?? '?'}; mode ${mode}; authorization ${req.headers['authorization'] === undefined ? 'none' : 'bearer (value not logged)'}`);
  if (mode === 'deny') { record.answered = 'denied'; answer(res, 403, { error: 'the synthetic ERP refuses this requester (mode deny)', synthetic: true }); return; }
  if (mode === 'error') { record.answered = 'error'; answer(res, 500, { error: 'the synthetic ERP failed (mode error)', synthetic: true }); return; }
  if (mode === 'stale') {
    record.answered = 'stale';
    const named = prior ?? { handoff_id: randomUUID(), attempt: 0, payload_digest: p.payload_digest };
    say(`mode stale: the receipt names handoff ${named.handoff_id} attempt ${named.attempt} (the previous one received)`);
    answer(res, 200, { receipt_id: randomUUID(), handoff_id: named.handoff_id, attempt: named.attempt === p.attempt && named.handoff_id === p.handoff_id ? Number(p.attempt) - 1 : named.attempt,
                       payload_digest: named.payload_digest, status: 'accepted', erp_reference: null, lines: [], synthetic: true });
    return;
  }
  let done = effected.get(p.handoff_id);
  if (done === undefined) {
    const lines = effect(p.lines);
    const full = lines.every((l) => l.status === 'effected'); const none = lines.every((l) => l.effected_quantity === 0);
    done = { status: full ? 'accepted' : none ? 'rejected' : 'partial', erp_reference: `SYN-PR-${randomUUID().slice(0, 8).toUpperCase()}`, lines };
    effected.set(p.handoff_id, done);
  } else say(`handoff ${p.handoff_id} already effected here: the same effects answered (idempotent on the handoff id)`);
  record.answered = done.status;
  answer(res, 200, { receipt_id: randomUUID(), handoff_id: p.handoff_id, attempt: p.attempt, payload_digest: p.payload_digest, status: done.status, erp_reference: done.erp_reference, lines: done.lines, synthetic: true });
};

const handle = async (req, res) => {
  try {
    if (!authorized(req)) { req.resume(); answer(res, 401, { error: 'unauthorized' }); return; }
    if (req.method === 'POST' && req.url === '/_control') {
      const p = await readJson(req);
      const next = p && typeof p === 'object' ? String(p.mode ?? '') : '';
      if (!MODES.includes(next)) { answer(res, 422, { error: `mode is one of ${MODES.join(', ')}` }); return; }
      mode = next; say(`control: mode ${mode}`); answer(res, 200, { mode }); return;
    }
    if (req.method === 'GET' && req.url === '/_received') { answer(res, 200, { mode, received, effected: Object.fromEntries(effected) }); return; }
    if (req.method !== 'POST') { answer(res, 405, { error: 'POST a purchase request' }); return; }
    await onHandoff(req, res);
  } catch (e) {
    say(`${req.url}: failed — ${e.message}`);
    try { answer(res, 500, { error: e.message }); } catch { /* the socket is gone */ }
  }
};

const server = createServer({ cert: readFileSync(certPath), key: readFileSync(keyPath), minVersion: 'TLSv1.2' }, handle);
server.listen(port, host, () => {
  const a = server.address();
  say(`THIS IS A SYNTHETIC ERP (${name}): it stands in for a purchasing system on an isolated loopback address; it closes no real-ERP clause`);
  say(`bearer ${bearerEnv === null ? 'not required' : `required (${bearerEnv}; value never logged)`}`);
  console.log(`listening https://${a.address.includes(':') ? `[${a.address}]` : a.address}:${a.port}`);
});
const stop = () => { server.close(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ours */ } process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
