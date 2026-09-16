#!/usr/bin/env node
/**
 * THE DEMONSTRATION RECIPIENT of a transfer-station delivery (CP-6 B13; migration 0073 §3–§4; D5–D7 and C7 of the batch record;
 * DP-47-005 "require recipient acknowledgement before closure", ES-53-004, NZ-20, CMP-102).
 *
 *   node scripts/retention/transfer-station-recipient.mjs <station-root> <tenant> <domain> <action_id> [--public-key <pem-file>] [--recipient <name>] [--wrong-digest | --deny]
 *   node scripts/retention/transfer-station-recipient.mjs <station-root> <tenant> <domain> <action_id> --revocation [--public-key <pem-file>] [--refuse] [--recipient <name>]
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
 *          verifier: 'scripts/retention/verify-export.mjs (demonstration recipient)', notes? (when the digests disagree),
 *          control_mode? (B16: 'wrong-digest' | 'deny' when a control mode wrote the receipt) }
 *      and exits 0 when the receipt was written — a receipt saying `verified: false` is written and is the honest answer (the
 *      product records the exchange as MISMATCHED and keeps the request and the evidence); a station without a delivery to
 *      answer (no delivery.json, no package.tar, a note that is not a JSON object) exits 2 and writes nothing.
 *
 * THE REVOCATION (CP-6 B14; migration 0074 §3; ES-29-005 "revocation context", DP-47-005): with --revocation the script does what a
 * recipient does when the product tells it the package is revoked — it reads revocation.json (the notice the product wrote beside
 * delivery.json: notice_id, the delivery it concerns, the package digest, the instant and the reason, the OBLIGATION), checks that the
 * notice concerns the delivery it holds, DESTROYS its copies (package.tar and package.sig in the station directory — the product removes
 * the ones it placed there after its own commit; whichever is still here is removed by the recipient) and writes revocation-receipt.json
 * by temp + fsync + rename: { receipt_id, notice_id, delivery_id, action_id, package_digest, copies_destroyed: true, destroyed: [...],
 * recipient, received_at }. With --refuse it writes copies_destroyed: false (the honest answer of a recipient that keeps its copies —
 * the product records the exchange as MISMATCHED). Exits 0 when the receipt was written; 2 when there is no notice to answer.
 *
 * THE SIGNED NOTICE (CP-6 B17; migration 0077; D8 and C7 of the batch record): from B17 on the product SIGNS every revocation notice the
 * way it signs its packages — `signature: { scheme: 'eye-revocation-notice/1', key_id, algorithm: 'Ed25519', signature }`, Ed25519 over
 * the ASCII hex of sha256(JCS(the notice WITHOUT its `signature` and `unsigned` members)), `key_id` = ed25519:<the first 16 hex of
 * sha256(SPKI DER)> — by the PACKAGE's key, or (when that key is not bound where the origin runs) by the tenant's active key with
 * `signed_with: 'active_key'` and `package_key_id` stated INSIDE the signed bytes; a notice the origin could not sign carries
 * `signature: null` and `unsigned: <why>`. With --public-key <pem-file> (the origin's export signing PUBLIC key — the same file the
 * delivery receipt's verification takes) the recipient VERIFIES the notice before it obeys it: the block's shape, the key id against the
 * key given, the signature over the digest recomputed here — printed as `notice signature: VERIFIED by key <id>`, `NOT VERIFIED: <reason>`
 * (unsigned, malformed, another key, a signature that does not verify). A notice that does not verify is NOT OBEYED: the copies are KEPT
 * and the receipt says `copies_destroyed: false` with `signature: { verified: false, key_id, reason }` and `notes` — the honest answer
 * (the product records the exchange as MISMATCHED and the origin sees what its notice lacked). Without --public-key the behaviour is
 * B14's — the notice is obeyed on its digest match with the held delivery — and the receipt gains `signature: { verified: null, key_id }`
 * so that the record says the check did not run here. --refuse is unchanged (the copies kept whatever the signature says; the
 * signature still verified and reported). The JCS subset and the digest are COPIED VERBATIM from scripts/retention/verify-export.mjs
 * (jcs, digestOf): that file is a CLI module that runs on import, so it cannot be imported from here; the two copies are held to agree.
 *
 * THE CONTROL MODES of the delivery receipt (CP-6 B16; the answers a real recipient could give, wrong or right — the product must classify
 * each; the https recipient has carried the same modes since B14): --wrong-digest writes the receipt with the archive digest's FIRST BYTE
 * FLIPPED (a recipient that received other bytes, or mis-hashed them: the product records the exchange MISMATCHED and, at a revocation,
 * still counts the station among the destinations that HOLD the package — Codex B14-F1: a mismatched receipt proves the package reached
 * it); --deny writes `verified: false` whatever the verifier said (a recipient that refuses the exchange: MISMATCHED likewise). The
 * verifier still runs and its verdict is printed; the receipt says which control mode wrote it (`control_mode`) so that the record is
 * never mistaken for a real disagreement. The two modes exclude each other and neither applies to --revocation.
 *
 * Node 18 or later; no dependency.
 */
import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, randomUUID, verify as cryptoVerify } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFIER = join(dirname(fileURLToPath(import.meta.url)), 'verify-export.mjs');
const VERIFIER_NAME = 'scripts/retention/verify-export.mjs (demonstration recipient)';
const SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // the tenant, the domain and the action are uuids: one path segment each, never a walk
const HEX64 = /^[0-9a-f]{64}$/;
/** B17: the notice's signature scheme and the shape of its signature (the base64 of exactly 64 bytes — the product's own rule). */
const NOTICE_SCHEME = 'eye-revocation-notice/1';
const SIGNATURE_B64 = /^[A-Za-z0-9+/]{86}==$/;
const USAGE = 'usage: node scripts/retention/transfer-station-recipient.mjs <station-root> <tenant> <domain> <action_id> [--public-key <pem-file>] [--recipient <name>] [--wrong-digest | --deny] | … --revocation [--public-key <pem-file>] [--refuse]';

/* ── JCS, the subset the notice needs (RFC 8785) — COPIED VERBATIM from scripts/retention/verify-export.mjs (a CLI module that runs on import; not importable) ── */
function jcs(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number cannot be canonicalized');
    return JSON.stringify(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') throw new Error(`${t} cannot be canonicalized`);
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, i) || value[i] === undefined) throw new Error(`array element ${i} is absent or undefined`);
      parts.push(jcs(value[i]));
    }
    return `[${parts.join(',')}]`;
  }
  if (t === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error('non-plain object cannot be canonicalized');
    const keys = Object.keys(value).sort();
    const members = [];
    for (const k of keys) {
      if (value[k] === undefined) throw new Error(`undefined member value at key "${k}"`);
      members.push(`${JSON.stringify(k)}:${jcs(value[k])}`);
    }
    return `{${members.join(',')}}`;
  }
  throw new Error(`unsupported type: ${t}`);
}
const digestOf = (value) => createHash('sha256').update(jcs(value), 'utf8').digest('hex');

/**
 * B17: the notice's signature checked against the public key file given — the same reading the verifier gives a key (a PUBLIC key
 * only; a private key file is refused before it is parsed) and the same arithmetic the product signs with: the digest over the notice
 * WITHOUT `signature` and `unsigned`, the key id derived from the SPKI DER, Ed25519 over the ASCII hex of the digest. Answers
 * { verified: true, key_id, digest } or { verified: false, key_id, reason, detail, digest } — a malformed input is a typed refusal,
 * never a crash: the recipient's answer is a receipt, whatever the notice was.
 */
function verifyNoticeSignature(notice, pemPath) {
  const { signature: _signature, unsigned: _unsigned, ...body } = notice;
  let digest = null;
  try { digest = digestOf(body); } catch (e) { return { verified: false, key_id: null, reason: 'malformed', detail: `the notice cannot be canonicalized: ${e.message}`, digest: null }; }
  let publicKey; let publicKeyId;
  try {
    const pem = readFileSync(pemPath, 'utf8');
    if (/PRIVATE KEY/.test(pem)) throw new Error('the file holds a PRIVATE key; the recipient takes the PUBLIC key only');
    if (!/-----BEGIN PUBLIC KEY-----/.test(pem)) throw new Error('the file is not a PEM public key (no "-----BEGIN PUBLIC KEY-----")');
    publicKey = createPublicKey({ key: pem, format: 'pem' });
    if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error(`the key is ${publicKey.asymmetricKeyType ?? 'unknown'}, not ed25519`);
    publicKeyId = `ed25519:${createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16)}`;
  } catch (e) {
    return { verified: false, key_id: null, reason: 'key_unreadable', detail: `the public key ${pemPath} could not be used: ${e.message}`, digest };
  }
  const sig = notice.signature;
  if (sig === null || sig === undefined) return { verified: false, key_id: null, reason: 'unsigned', detail: `the notice carries no signature${typeof notice.unsigned === 'string' ? ` (the origin says: ${notice.unsigned})` : ''}`, digest };
  if (typeof sig !== 'object' || Array.isArray(sig)) return { verified: false, key_id: null, reason: 'malformed', detail: 'the signature is not an object', digest };
  const keyId = typeof sig.key_id === 'string' ? sig.key_id : null;
  if (sig.scheme !== NOTICE_SCHEME) return { verified: false, key_id: keyId, reason: 'malformed', detail: `the signature scheme is ${JSON.stringify(sig.scheme ?? null)}, not ${NOTICE_SCHEME}`, digest };
  if (sig.algorithm !== 'Ed25519') return { verified: false, key_id: keyId, reason: 'malformed', detail: `the signature algorithm is ${JSON.stringify(sig.algorithm ?? null)}, not Ed25519`, digest };
  if (keyId === null) return { verified: false, key_id: null, reason: 'malformed', detail: 'the signature names no key_id', digest };
  if (typeof sig.signature !== 'string' || !SIGNATURE_B64.test(sig.signature)) return { verified: false, key_id: keyId, reason: 'malformed', detail: 'the signature is not the base64 of 64 bytes', digest };
  if (keyId !== publicKeyId) return { verified: false, key_id: keyId, reason: 'key_mismatch', detail: `the notice is signed by key ${keyId}, not the key given (${publicKeyId})${notice.signed_with === 'active_key' ? `; the origin says it signed with its ACTIVE key, the package's key being ${notice.package_key_id ?? '?'}` : ''}`, digest };
  let ok = false;
  try { ok = cryptoVerify(null, Buffer.from(digest, 'utf8'), publicKey, Buffer.from(sig.signature, 'base64')); } catch (e) { return { verified: false, key_id: keyId, reason: 'invalid', detail: `the signature could not be checked: ${e.message}`, digest }; }
  if (!ok) return { verified: false, key_id: keyId, reason: 'invalid', detail: `the signature does not verify over ${digest} with key ${publicKeyId}`, digest };
  return { verified: true, key_id: keyId, digest };
}
const say = (line) => console.log(`[demonstration recipient] ${line}`);
const fail = (line) => { console.error(`[demonstration recipient] ${line}`); process.exit(2); };

/* ── arguments ─────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const positional = []; let publicKeyPath = null; let recipientName = null; let revocationMode = false; let refuse = false; let wrongDigest = false; let deny = false;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--public-key') { publicKeyPath = String(args[i + 1] ?? ''); i += 1; }
  else if (a === '--recipient') { recipientName = String(args[i + 1] ?? ''); i += 1; }
  else if (a === '--revocation') revocationMode = true;
  else if (a === '--refuse') refuse = true;
  else if (a === '--wrong-digest') wrongDigest = true;
  else if (a === '--deny') deny = true;
  else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
  else positional.push(a);
}
if (positional.length !== 4 || publicKeyPath === '' || recipientName === '') fail(USAGE);
if (wrongDigest && deny) fail('--wrong-digest and --deny exclude each other: one wrong answer per receipt');
if ((wrongDigest || deny) && revocationMode) fail('--wrong-digest and --deny are the delivery receipt\'s control modes; the revocation receipt has --refuse');
if (refuse && !revocationMode) fail('--refuse is the revocation receipt\'s control mode (--revocation)');
const [rootArg, tenant, domain, actionId] = positional;
for (const [what, v] of [['tenant', tenant], ['domain', domain], ['action_id', actionId]]) if (!SEGMENT.test(v)) fail(`${what} ${JSON.stringify(v)} is not a uuid`);
const root = resolve(rootArg);
if (!existsSync(root) || !statSync(root).isDirectory()) fail(`the station root ${root} is not an existing directory`);
if (publicKeyPath !== null) { publicKeyPath = resolve(publicKeyPath); if (!existsSync(publicKeyPath)) fail(`the public key file ${publicKeyPath} does not exist`); }
const dir = join(root, tenant, domain, actionId);
const tarPath = join(dir, 'package.tar'); const notePath = join(dir, 'delivery.json'); const receiptPath = join(dir, 'receipt.json');

/** A JSON object written by temp + fsync + rename; the failure exits 2 (the temp name is ours; nothing else is touched). */
const writeJson = (path, value) => {
  const tmp = `${path}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
  try {
    const fd = openSync(tmp, 'wx', 0o644);
    try { writeSync(fd, `${JSON.stringify(value, null, 2)}\n`); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, path);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* ours */ }
    fail(`${path} could not be written: ${e.message}`);
  }
};

/* ── the REVOCATION (B14; B17: the signed notice verified before it is obeyed): the notice read, the copies destroyed, the receipt written ── */
if (revocationMode) {
  const revocationPath = join(dir, 'revocation.json'); const revocationReceiptPath = join(dir, 'revocation-receipt.json');
  say('THIS IS THE DEMONSTRATION RECIPIENT answering a REVOCATION NOTICE: it stands in for the customer\'s own system on the demonstration\'s isolated transfer station');
  say(`station directory ${dir}`);
  if (!existsSync(revocationPath)) fail(`no revocation.json in ${dir}: nothing was revoked here, nothing to answer`);
  let notice;
  try { notice = JSON.parse(readFileSync(revocationPath, 'utf8')); } catch (e) { fail(`revocation.json does not parse: ${e.message}`); }
  if (notice === null || typeof notice !== 'object' || Array.isArray(notice)) fail('revocation.json is not a JSON object');
  if (typeof notice.notice_id !== 'string') fail('revocation.json names no notice_id; the receipt must name its notice');
  const heldDeliveryId = existsSync(notePath) ? (() => { try { return JSON.parse(readFileSync(notePath, 'utf8')).delivery_id ?? null; } catch { return null; } })() : null;
  const concerns = notice.delivery && typeof notice.delivery === 'object' ? notice.delivery.delivery_id ?? null : null;
  say(`notice ${notice.notice_id} attempt ${notice.attempt ?? '?'}: the package ${notice.package_digest ?? '?'} of action ${notice.action_id ?? '?'} was REVOKED at ${notice.revoked_at ?? '?'}${notice.reason ? ` — ${JSON.stringify(notice.reason)}` : ''}; it concerns delivery ${concerns ?? '?'}${heldDeliveryId !== null ? (heldDeliveryId === concerns ? ' (the delivery this station holds)' : ` (this station holds delivery ${heldDeliveryId})`) : ' (no delivery.json here)'}`);
  say(`the obligation: ${notice.obligation ?? '(none stated)'}`);
  // B17: THE SIGNATURE — verified against the public key given, and obeyed only when it verifies; reported (not verified here) when no key was given.
  const sigBlock = notice.signature !== null && typeof notice.signature === 'object' && !Array.isArray(notice.signature) ? notice.signature : null;
  const notedKeyId = sigBlock !== null && typeof sigBlock.key_id === 'string' ? sigBlock.key_id : null;
  let signature;
  if (publicKeyPath === null) {
    signature = { verified: null, key_id: notedKeyId };
    if (sigBlock === null) say(`notice signature: unsigned${typeof notice.unsigned === 'string' ? ` — the origin says: ${notice.unsigned}` : ''}`);
    else say(`notice signature: ${sigBlock.scheme ?? '?'} by ${notedKeyId ?? '?'} — not verified here (no --public-key given); the notice is obeyed on its digest match with the delivery this station holds, as B14's recipient did`);
  } else {
    const v = verifyNoticeSignature(notice, publicKeyPath);
    if (v.verified) {
      signature = { verified: true, key_id: v.key_id };
      say(`notice signature: VERIFIED by key ${v.key_id}`);
      say(`  Ed25519 over the ASCII hex of sha256(JCS(notice without signature/unsigned)) = ${v.digest}${notice.signed_with === 'active_key' ? `; the origin signed with its ACTIVE key (the package's key was ${notice.package_key_id ?? '?'}) — the statement is inside the signed bytes` : ''}`);
    } else {
      signature = { verified: false, key_id: v.key_id, reason: v.reason };
      say(`notice signature: NOT VERIFIED: ${v.detail}`);
      say('the notice is NOT OBEYED: the copies are KEPT; the receipt says copies_destroyed: false with the reason (the product records the exchange as MISMATCHED and the origin sees what its notice lacked)');
    }
  }
  const obeyed = !refuse && signature.verified !== false;
  const destroyed = []; const alreadyGone = [];
  if (refuse) say('--refuse: the copies are KEPT; the receipt says copies_destroyed: false (the product records the exchange as MISMATCHED)');
  else if (obeyed) {
    for (const name of ['package.tar', 'package.sig']) {
      const full = join(dir, name);
      if (existsSync(full)) { rmSync(full, { force: true }); destroyed.push(name); } else alreadyGone.push(name);
    }
    say(`copies destroyed: ${destroyed.length > 0 ? destroyed.join(', ') : 'none here'}${alreadyGone.length > 0 ? ` (${alreadyGone.join(', ')} already gone — the product removed what it placed here)` : ''}`);
  } else {
    const kept = ['package.tar', 'package.sig'].filter((name) => existsSync(join(dir, name)));
    say(`copies kept: ${kept.length > 0 ? kept.join(', ') : 'none here (the product removed what it placed here; nothing of ours to keep)'}`);
  }
  const notes = [];
  if (signature.verified === false) notes.push(`the notice's signature did not verify against the public key given to the recipient (${signature.reason}); the notice was not obeyed`);
  const receipt = {
    receipt_id: randomUUID(),
    notice_id: notice.notice_id,
    delivery_id: concerns,
    action_id: typeof notice.action_id === 'string' ? notice.action_id : actionId,
    package_digest: typeof notice.package_digest === 'string' ? notice.package_digest : null,
    copies_destroyed: obeyed,
    destroyed,
    recipient: recipientName ?? (typeof notice.recipient === 'string' && notice.recipient.length > 0 ? notice.recipient : 'demonstration recipient'),
    received_at: new Date().toISOString(),
    signature,
    ...(notes.length > 0 ? { notes: notes.join('; ') } : {}),
  };
  const replaced = existsSync(revocationReceiptPath);
  writeJson(revocationReceiptPath, receipt);
  say(`revocation-receipt.json written${replaced ? ' (an earlier notice\'s receipt replaced)' : ''}: receipt ${receipt.receipt_id} for notice ${receipt.notice_id} — copies_destroyed ${receipt.copies_destroyed}; signature verified ${signature.verified === null ? 'null (not checked here)' : signature.verified}${signature.key_id !== null ? ` (key ${signature.key_id})` : ''}${notes.length > 0 ? `; notes: ${receipt.notes}` : ''}`);
  say('the product collects it with the collect-receipt act of the notice (ACKNOWLEDGED when it names the package digest and copies_destroyed is true; MISMATCHED otherwise)');
  process.exit(0);
}

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
/** B16: the first byte of a hex digest flipped — the https recipient's `wrong-digest` control, the same arithmetic. */
const flip = (hex) => `${(parseInt(hex.slice(0, 2), 16) ^ 0xff).toString(16).padStart(2, '0')}${hex.slice(2)}`;
const controlMode = wrongDigest ? 'wrong-digest' : deny ? 'deny' : null;
if (wrongDigest) say(`--wrong-digest: the receipt names the archive digest with its first byte flipped (${flip(archiveDigest).slice(0, 16)}… for ${archiveDigest.slice(0, 16)}…) — the product records the exchange as MISMATCHED; the station still HOLDS the package`);
if (deny) say(`--deny: the receipt says verified: false whatever the verifier found (it found ${verified ? 'PACKAGE OK' : 'PACKAGE FAILED'}) — the product records the exchange as MISMATCHED; the station still HOLDS the package`);

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
  archive_digest: wrongDigest ? flip(archiveDigest) : archiveDigest,
  package_digest: packageDigest,
  verified: deny ? false : verified,
  verifier: VERIFIER_NAME,
  ...(controlMode !== null ? { control_mode: controlMode } : {}),
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
say(`receipt.json written${replaced ? ' (an earlier attempt\'s receipt replaced)' : ''}: receipt ${receipt.receipt_id} for delivery ${receipt.delivery_id} attempt ${receipt.attempt} — verified ${receipt.verified}${controlMode !== null ? ` (control mode ${controlMode})` : ''}${notes.length > 0 ? `; notes: ${receipt.notes}` : ''}`);
say('the product collects it with the collect-receipt act (the exchange closes ACKNOWLEDGED when the digests agree and verified is true; MISMATCHED otherwise)');
process.exit(0);
