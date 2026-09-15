#!/usr/bin/env node
/**
 * THE DEMONSTRATION RECIPIENT of a transfer-station delivery (CP-6 B13; migration 0073 §3–§4; D5–D7 and C7 of the batch record;
 * DP-47-005 "require recipient acknowledgement before closure", ES-53-004, NZ-20, CMP-102).
 *
 *   node scripts/retention/transfer-station-recipient.mjs <station-root> <tenant> <domain> <action_id> [--public-key <pem-file>] [--recipient <name>]
 *
 * THIS IS A DEMONSTRATION RECIPIENT, NOT A PRODUCT COMPONENT. A transfer station is a directory the product WRITES a delivery
 * into (`<station-root>/<tenant>/<domain>/<action_id>/` — package.tar, package.sig, delivery.json) and READS a receipt from
 * (`receipt.json` beside them, collected by the product's collect-receipt act). The party on the other side of that directory
 * is the CUSTOMER — its own systems verify the package and write the receipt. On the demonstration's isolated synthetic
 * destination there is no such system, so this script stands in for it: it does what a recipient does, with the customer-side
 * tools the product hands over, and nothing a recipient could not do. It never talks to the product — no network, no database,
 * no product module — it reads the station directory and writes one file into it.
 *
 * What it does, and prints:
 *   1. reads delivery.json (the exchange identity the product wrote: delivery_id, attempt, action_id, destination_key, recipient,
 *      purpose, package_digest, archive_digest, manifest_digest, the signature's scheme and key id, delivered_at, expires_at);
 *   2. computes sha256(package.tar) itself — the archive digest of what it actually received — and compares it with the note's;
 *   3. runs the customer's verifier on the archive (`scripts/retention/verify-export.mjs --tar package.tar --json`, with
 *      `--public-key <pem-file>` when a key was given, and `--expect-package-digest` with the digest the note names — the
 *      authenticity step against the delivery's own statement) — the checks, the verdict, the signature's state;
 *   4. writes receipt.json by temp + fsync + rename (an earlier attempt's receipt is replaced: a receipt names ITS delivery):
 *        { receipt_id (uuid), delivery_id, attempt (both copied from delivery.json — C7: the product refuses a receipt naming
 *          another delivery; a note without delivery_id is not answered, a note without attempt is answered with attempt null),
 *          recipient, received_at, archive_digest (computed here), package_digest (from delivery.json),
 *          verified: <the verifier's ok AND, when a public key was given, its signature verified>,
 *          verifier: 'scripts/retention/verify-export.mjs (demonstration recipient)', notes? (when the digests disagree) }
 *      and exits 0 when the receipt was written — a receipt saying `verified: false` is written and is the honest answer (the
 *      product records the exchange as MISMATCHED and keeps the request and the evidence); a station without a delivery to
 *      answer (no delivery.json, no package.tar, a note that is not a JSON object) exits 2 and writes nothing.
 *
 * Node 18 or later; no dependency.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFIER = join(dirname(fileURLToPath(import.meta.url)), 'verify-export.mjs');
const VERIFIER_NAME = 'scripts/retention/verify-export.mjs (demonstration recipient)';
const SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // the tenant, the domain and the action are uuids: one path segment each, never a walk
const HEX64 = /^[0-9a-f]{64}$/;
const USAGE = 'usage: node scripts/retention/transfer-station-recipient.mjs <station-root> <tenant> <domain> <action_id> [--public-key <pem-file>] [--recipient <name>]';
const say = (line) => console.log(`[demonstration recipient] ${line}`);
const fail = (line) => { console.error(`[demonstration recipient] ${line}`); process.exit(2); };

/* ── arguments ─────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const positional = []; let publicKeyPath = null; let recipientName = null;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--public-key') { publicKeyPath = String(args[i + 1] ?? ''); i += 1; }
  else if (a === '--recipient') { recipientName = String(args[i + 1] ?? ''); i += 1; }
  else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
  else positional.push(a);
}
if (positional.length !== 4 || publicKeyPath === '' || recipientName === '') fail(USAGE);
const [rootArg, tenant, domain, actionId] = positional;
for (const [what, v] of [['tenant', tenant], ['domain', domain], ['action_id', actionId]]) if (!SEGMENT.test(v)) fail(`${what} ${JSON.stringify(v)} is not a uuid`);
const root = resolve(rootArg);
if (!existsSync(root) || !statSync(root).isDirectory()) fail(`the station root ${root} is not an existing directory`);
if (publicKeyPath !== null) { publicKeyPath = resolve(publicKeyPath); if (!existsSync(publicKeyPath)) fail(`the public key file ${publicKeyPath} does not exist`); }
const dir = join(root, tenant, domain, actionId);
const tarPath = join(dir, 'package.tar'); const notePath = join(dir, 'delivery.json'); const receiptPath = join(dir, 'receipt.json');

/* ── 1. the delivery note ──────────────────────────────────────────────────── */
say('THIS IS THE DEMONSTRATION RECIPIENT: it stands in for the customer\'s own system on the demonstration\'s isolated transfer station');
say(`station directory ${dir}`);
if (!existsSync(notePath)) fail(`no delivery.json in ${dir}: nothing was delivered here, nothing to answer`);
let note;
try { note = JSON.parse(readFileSync(notePath, 'utf8')); } catch (e) { fail(`delivery.json does not parse: ${e.message}`); }
if (note === null || typeof note !== 'object' || Array.isArray(note)) fail('delivery.json is not a JSON object');
const noted = (k) => (typeof note[k] === 'string' || typeof note[k] === 'number' ? note[k] : null);
if (noted('delivery_id') === null) fail('delivery.json names no delivery_id; the receipt must name its delivery (C7)');
if (noted('attempt') === null) say('NOTE delivery.json names no attempt; the receipt names its delivery by delivery_id alone (attempt null)');
say(`delivery ${noted('delivery_id')} attempt ${noted('attempt')} of action ${noted('action_id') ?? '?'} to ${noted('destination_key') ?? '?'} for ${JSON.stringify(noted('recipient') ?? '?')}, delivered at ${noted('delivered_at') ?? '?'}${noted('expires_at') !== null ? `, the package expires at ${noted('expires_at')}` : ''}`);
if (noted('action_id') !== null && noted('action_id') !== actionId) say(`NOTE delivery.json names action ${noted('action_id')}, the directory is ${actionId}`);
const notedScheme = noted('signature_scheme') ?? note.signature?.scheme ?? null; const notedKeyId = noted('signature_key_id') ?? noted('key_id') ?? note.signature?.key_id ?? null;
say(`the note says: package digest ${noted('package_digest') ?? '?'}, archive digest ${noted('archive_digest') ?? '?'}, signature ${notedScheme ?? '?'}${notedKeyId !== null ? ` by ${notedKeyId}` : ''}`);

/* ── 2. the archive as received ────────────────────────────────────────────── */
if (!existsSync(tarPath)) fail(`no package.tar in ${dir}: the note names a delivery whose package is not here`);
const tarBytes = readFileSync(tarPath);
const archiveDigest = createHash('sha256').update(tarBytes).digest('hex');
const notedArchive = typeof note.archive_digest === 'string' ? note.archive_digest.toLowerCase() : null;
const archiveAgrees = notedArchive !== null && notedArchive === archiveDigest;
say(`package.tar: ${tarBytes.byteLength} bytes, sha256 ${archiveDigest} — ${notedArchive === null ? 'the note names no archive digest' : archiveAgrees ? 'the archive digest the note names' : `NOT the archive digest the note names (${notedArchive})`}`);

/* ── 3. the customer's verifier on the archive ─────────────────────────────── */
const notedPackage = typeof note.package_digest === 'string' && HEX64.test(note.package_digest.toLowerCase()) ? note.package_digest.toLowerCase() : null;
const verifierArgs = [VERIFIER, '--tar', tarPath, '--json', ...(publicKeyPath !== null ? ['--public-key', publicKeyPath] : []), ...(notedPackage !== null ? ['--expect-package-digest', notedPackage] : [])];
const run = spawnSync(process.execPath, verifierArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let verdict = null;
try { verdict = JSON.parse(run.stdout); } catch { verdict = null; }
if (verdict === null || typeof verdict !== 'object') fail(`the verifier answered nothing usable (exit ${run.status ?? run.signal}): ${String(run.stderr ?? '').trim().slice(0, 500)}`);
const checks = Array.isArray(verdict.checks) ? verdict.checks : [];
say(`verifier: node ${verifierArgs.map((a) => (a === VERIFIER ? 'scripts/retention/verify-export.mjs' : a)).join(' ')}`);
for (const c of checks) if (c.ok === false) say(`  FAIL  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
const verifierOk = verdict.ok === true;
const signatureVerified = verdict.signature?.verified === true;
say(`verifier verdict: ${verifierOk ? 'PACKAGE OK' : 'PACKAGE FAILED'} (exit ${run.status}; ${Number(verdict.failed ?? 0)} failed; complete ${verdict.complete === true}); signature ${verdict.signature?.scheme ?? '?'}${verdict.signature?.key_id ? ` ${verdict.signature.key_id}` : ''}: ${verdict.signature?.verified === true ? 'VERIFIED against the public key' : verdict.signature?.verified === false ? 'FAILED' : publicKeyPath === null ? 'not verified here (no --public-key given)' : 'not verified'}`);
const packageDigest = notedPackage ?? (typeof verdict.summary?.package_digest === 'string' ? verdict.summary.package_digest : null);
const verified = verifierOk && (publicKeyPath === null || signatureVerified);

/* ── 4. the receipt, by temp + fsync + rename ──────────────────────────────── */
const notes = [];
if (notedArchive !== null && !archiveAgrees) notes.push(`the archive received digests to ${archiveDigest}, the delivery note names ${notedArchive}`);
if (notedPackage !== null && typeof verdict.summary?.package_digest === 'string' && verdict.summary.package_digest !== notedPackage) notes.push(`the package computes to ${verdict.summary.package_digest}, the delivery note names ${notedPackage}`);
if (publicKeyPath !== null && !signatureVerified) notes.push('the signature did not verify against the public key given to the recipient');
const receipt = {
  receipt_id: randomUUID(),
  delivery_id: note.delivery_id,
  attempt: noted('attempt'),
  recipient: recipientName ?? (typeof note.recipient === 'string' && note.recipient.length > 0 ? note.recipient : 'demonstration recipient'),
  received_at: new Date().toISOString(),
  archive_digest: archiveDigest,
  package_digest: packageDigest,
  verified,
  verifier: VERIFIER_NAME,
  ...(notes.length > 0 ? { notes: notes.join('; ') } : {}),
};
const replaced = existsSync(receiptPath);
const tmp = `${receiptPath}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
try {
  const fd = openSync(tmp, 'wx', 0o644);
  try { writeSync(fd, `${JSON.stringify(receipt, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, receiptPath);
} catch (e) {
  try { rmSync(tmp, { force: true }); } catch { /* the temp name is ours; nothing else is touched */ }
  fail(`receipt.json could not be written: ${e.message}`);
}
say(`receipt.json written${replaced ? ' (an earlier attempt\'s receipt replaced)' : ''}: receipt ${receipt.receipt_id} for delivery ${receipt.delivery_id} attempt ${receipt.attempt} — verified ${verified}${notes.length > 0 ? `; notes: ${receipt.notes}` : ''}`);
say('the product collects it with the collect-receipt act (the exchange closes ACKNOWLEDGED when the digests agree and verified is true; MISMATCHED otherwise)');
process.exit(0);
