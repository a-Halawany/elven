#!/usr/bin/env node
/**
 * The CUSTOMER'S VERIFIER of an export package (CP-6 B11; migration 0070 §3; V03-T-047, DPD-19 — and, since B13 (migration 0073),
 * the package's ARCHIVE and its KEY-BASED signature: DP-47-006, LR-23, SC-24).
 *
 *   node scripts/retention/verify-export.mjs <package-dir>        [--expect-package-digest <hex>] [--public-key <pem-file>] [--json]
 *   node scripts/retention/verify-export.mjs --tar <package.tar>  [--expect-package-digest <hex>] [--public-key <pem-file>] [--json]
 *
 * Node 18 or later; no dependency, no network, no database — it reads the package alone. The package is what the product handed
 * over: `manifest.json`, one `<manifest_id>.bin` per exported object and (B15) `links.json` — the relationship closure the manifest
 * names — nothing else — as a DIRECTORY (the product's export namespace, or a directory the customer unpacked), or as the ONE FILE
 * the product serves and delivers: a POSIX ustar tar (`--tar`), SCANNED here block by block from its file (512-byte headers, the
 * name NUL-terminated in bytes 0..100, the size in octal at 124..136, the typeflag at 156, the magic 'ustar' at 257; every entry
 * hashed as it passes, only the manifest and the links file kept in memory — a package of any size the disk holds verifies in
 * constant memory, B15) — a malformed archive is a FAILED "archive readable" check, never a crash, and the archive's entry set is
 * held to the same completeness rule as a directory's entries. The checks, in order, each printed as PASS
 * or FAIL with its reason; the exit code is 0 only when every check passes:
 *
 *   0. (--tar) ARCHIVE READABLE: the file parses as a ustar archive — every header's magic and checksum, every entry's size
 *      within the file, the two-block end-of-archive trailer, no duplicate entry; sha256(the file) is the archive digest the
 *      product recorded at the build and names in a delivery's delivery.json;
 *   1. the manifest: present, parses, format eye-customer-export/1 or /2, signature scheme eye-digest-chain/1 (the digest chain
 *      alone) or eye-customer-export/2 (the digest chain SIGNED by the tenant's export signing key);
 *   2. INTEGRITY of the bytes: every listed file present, sha256(file) = bytes.content_digest, size = bytes.byte_length;
 *   3. RE-IMPORT: for every object payload.content_digest = bytes.content_digest (the record binds the bytes) and
 *      sha256(JCS({header, payload})) = content_digest (the canonical header and payload recompute to the recorded canonical
 *      digest — what an import checks before admitting the record); the header carries exactly 43 fields;
 *   4. COMPLETENESS: every listed file present and every file in the directory (every entry of the archive) listed — EVERY
 *      entry, a dot-file included (an unlisted file fails; the product's own verification counts the directory the same way);
 *      what was excluded and why is printed — an exclusion is not a failure, but `excluded` must be a list, since it enters
 *      the chain as listed; a listed file that cannot be read is a failed integrity check, never a crash;
 *   5. REDACTION: every exported header's classification is within gates.redaction.classification_ceiling (a package never
 *      states a ceiling one of its records exceeds);
 *   6. THE CHAIN: sha256(JCS(objects)) = signature.objects_digest; sha256(JCS({format, package, authorization, gates,
 *      objects_digest, excluded, bound_to, statement})) = signature.package_digest — the binding and the statement of the
 *      signature block are INSIDE the digest, so a tampered binding fails here; signature.bound_to restates the covered
 *      authorization (action_id = package.action_id, scope_digest = authorization.scope_digest, approval_id =
 *      authorization.approval_id); and, with --expect-package-digest, equality with the digest the product's record
 *      reports (the authenticity step: the same digest is recorded in the append-only retention ledger, bound to the
 *      approval on the resolved scope).
 *
 *   6b. THE SIGNATURE (scheme eye-customer-export/2): the block carries key_id, algorithm 'Ed25519' and `signature`, the base64
 *      of 64 bytes — Ed25519 over the ASCII hex of the package digest, which already covers everything above. With
 *      --public-key <pem-file> (the tenant's export signing PUBLIC key as SPKI PEM — the export read route serves it, with the
 *      key's id, purpose and state) the signature is verified here: a signature that does not verify is a FAILED check. Without
 *      the key, a /2 package's signature is reported "not verified here: pass --public-key" as a note, never a failure — the
 *      chain, integrity and completeness are still proven. A public key given for a package that carries no key-based
 *      signature, or that could not be checked through to its signature, is a FAILED check of its own (the verification the
 *      caller asked for did not run — the rule of 7). The verifier accepts only a PUBLIC key file; a private key handed to it
 *      by mistake is refused, never used.
 *
 *   7. THE VERDICT (B11-F2, the closure of Codex's finding on the B11 candidate): PACKAGE OK only when every check passed
 *      AND the validation ran through to the chain — a manifest that is not a JSON object (null, a list, a scalar), a
 *      manifest without its object list or signature block, or a package whose chain could not be computed is a FAILURE,
 *      never a success by absence; an expected digest that could not be compared is a failure of its own; the text
 *      verdict, the JSON `ok` and the exit status always agree.
 *
 * THE CLOSURE (B15; B16 — Codex B15-F1): a manifest whose package.links names links.json is held to three checks — the file's sha256
 * and size are the ones the manifest names (the block is inside the signed chain); the file is the closure the manifest counts
 * (format, claims, edges, entities, excluded; the same action; the detail names the closure's format); and the closure is CONSISTENT
 * with the package. Format eye-customer-export-links/2 carries every EXACT claim version an edge or a lineage row names, so the
 * consistency is checked by PAIR: every claim version's lineage row is the row of its own version (claim_version = object_version) and
 * names an exported record by (object_id, bytes digest); every edge names an included claim by (object_id, object_version) — an edge
 * asserted on C@1 is never satisfied by C@2 under the same id — included entities, and an exported record by (object_id, digest); a
 * pair listed twice fails. Format eye-customer-export-links/1 carries ONE version per claim, so the verifier checks it by id alone and
 * SAYS SO in the check's own name: which exact version an edge rests on is not validated for that format. The JSON output carries the
 * closure's format as `closure_format` (null when the package names no closure).
 *
 * A /1 package is "signed" by its digest chain, not by a key (D4 of the B11 record): integrity and completeness are proven
 * offline here; authenticity is proven by presenting the package digest to the product (the export read route, or the
 * retention record) and comparing. A /2 package is signed by the tenant's Ed25519 key over that same digest (D3 of the B13
 * record): its authenticity is proven offline by the public key. Which key signed, and whether it was a DEMONSTRATION or a
 * production key, is the product's statement (the read route, package.sig beside a delivered package) — the key id printed
 * here for the given public key (ed25519:<the first 16 hex of sha256(SPKI DER)>) is for the customer to compare with it.
 *
 * The JSON output (--json) carries `checks`, `summary`, `complete`, `failed`, `ok` as before, and `signature: { scheme, key_id,
 * verified }` — `verified` true when the /2 signature verified against --public-key, false when a signature check failed, null
 * when no key-based verification ran (a /1 package, or a /2 package without --public-key) — and `archive_digest` (--tar only).
 *
 * JCS (RFC 8785) is re-implemented here in the subset the manifest needs — members sorted by UTF-16 code units, strings
 * and numbers as JSON.stringify writes them, no whitespace; a non-finite number, an undefined value or a non-plain object
 * is refused rather than coerced — the same rules as packages/contracts/src/jcs.ts, which the product's harness holds to
 * agree with this file on the package it built.
 */
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readdirSync, readFileSync, readSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FORMATS = ['eye-customer-export/1', 'eye-customer-export/2'];
const SCHEME_CHAIN = 'eye-digest-chain/1';
const SCHEME_KEY = 'eye-customer-export/2';
const SCHEMES = [SCHEME_CHAIN, SCHEME_KEY];
/** B16 (Codex B15-F1): the closure's formats — /1 keyed by claim id (one version per claim), /2 keyed by the (object_id, object_version) PAIR. */
const LINKS_FORMAT_1 = 'eye-customer-export-links/1';
const LINKS_FORMAT_2 = 'eye-customer-export-links/2';
const HEADER_FIELDS = 43;
const HEX64 = /^[0-9a-f]{64}$/;
const BIN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$/;
const SIGNATURE_B64 = /^[A-Za-z0-9+/]{86}==$/; // the base64 of exactly 64 bytes (the SQL port holds the block to the same shape)
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
const rank = (c) => { const i = CLASSIFICATIONS.indexOf(String(c ?? '')); return i < 0 ? 3 : i; };
const USAGE = 'usage: node scripts/retention/verify-export.mjs <package-dir> | --tar <package.tar> [--expect-package-digest <hex>] [--public-key <pem-file>] [--json]';

/* ── JCS, the subset the manifest needs (RFC 8785) ─────────────────────────── */
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
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digestOf = (value) => createHash('sha256').update(jcs(value), 'utf8').digest('hex');

/* ── ustar, parsed in memory (C4 of the B13 record) ────────────────────────── */
// A POSIX ustar archive: 512-byte headers, each followed by the entry's bytes padded to 512, two zero blocks at the end. Read
// here: the name (bytes 0..100, NUL-terminated; joined to the prefix at 345..500 when the version is '00' and a prefix is set),
// the size (octal at 124..136), the checksum (octal at 148..156, the field itself counted as spaces — the unsigned and the
// signed sum both accepted, as every tar does), the typeflag (156: '0' or NUL is a regular file) and the magic ('ustar' at 257).
// Anything the format does not allow — a block with no magic, a checksum that does not add up, a size that is not octal, an
// entry running past the end of the file, a lone zero block, bytes after the trailer, a name twice — is a malformed archive:
// one Error, reported by the "archive readable" check. The product's writer (apps/api/src/retention/export-archive.ts) emits a
// fixed subset of this (mode 0600, uid/gid 0, the manifest's built_at as every mtime, no prefix); the parser reads any valid
// ustar, so an archive re-packed by the customer's own tar verifies the same way.
const BLOCK = 512;
/** B15: an archive entry the verifier keeps in memory (the manifest, the links file); every other entry is hashed as it is read and never held whole. */
const KEEP_RE = /^(manifest\.json|links\.json)$/;
const KEEP_MAX = 64 * 1024 * 1024;
/** B15: a file's sha256 and size, streamed (a package of any size verifies in constant memory). */
function measureFile(path) {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size; const hash = createHash('sha256'); const buf = Buffer.alloc(4 * 1024 * 1024); let pos = 0;
    while (pos < size) { const n = readSync(fd, buf, 0, Math.min(buf.byteLength, size - pos), pos); if (n <= 0) throw new Error(`the file is truncated at offset ${pos}`); hash.update(buf.subarray(0, n)); pos += n; }
    return { digest: hash.digest('hex'), size };
  } finally { closeSync(fd); }
}

function scanUstarFile(path) {
  const fd = openSync(path, 'r');
  try {
    const total = fstatSync(fd).size;
    if (total === 0) throw new Error('the archive is empty');
    const whole = createHash('sha256');
    const CHUNK = 4 * 1024 * 1024;
    const buf = Buffer.alloc(CHUNK);
    let off = 0;
    const readAt = (position, length, into) => { const n = readSync(fd, into, 0, length, position); if (n !== length) throw new Error(`the archive is truncated at offset ${position} (${n} of ${length} byte(s) read)`); whole.update(into.subarray(0, n)); return into.subarray(0, n); };
    const header = Buffer.alloc(BLOCK);
    const isZero = (b) => { for (let i = 0; i < b.byteLength; i += 1) if (b[i] !== 0) return false; return true; };
    const field = (b, o, n) => { const end = b.indexOf(0, o); const stop = end < 0 || end > o + n ? o + n : end; return b.toString('utf8', o, stop); };
    const octal = (b, o, n, what) => { const t = field(b, o, n).replace(/[\s\0]+$/, '').trimStart(); if (!/^[0-7]+$/.test(t)) throw new Error(`${what} at offset ${off + o} is not octal (${JSON.stringify(t)})`); return parseInt(t, 8); };
    const entries = []; const names = new Set();
    while (off + BLOCK <= total) {
      const h = Buffer.from(readAt(off, BLOCK, header));
      if (isZero(h)) {
        if (off + 2 * BLOCK > total) throw new Error(`a single zero block at offset ${off} is not the two-block end-of-archive trailer`);
        const h2 = readAt(off + BLOCK, BLOCK, header);
        if (!isZero(h2)) throw new Error(`a single zero block at offset ${off} is not the two-block end-of-archive trailer`);
        let pos = off + 2 * BLOCK;
        while (pos < total) { const n = Math.min(CHUNK, total - pos); const rest = readAt(pos, n, buf); if (!isZero(rest)) throw new Error(`${total - off - 2 * BLOCK} byte(s) after the end-of-archive trailer at offset ${off} are not zero padding`); pos += n; }
        return { entries, archiveDigest: whole.digest('hex'), byteLength: total };
      }
      if (h.toString('latin1', 257, 262) !== 'ustar') throw new Error(`no ustar magic in the header at offset ${off}`);
      const recorded = octal(h, 148, 8, 'the header checksum');
      let unsigned = 0; let signed = 0;
      for (let i = 0; i < BLOCK; i += 1) { const b = i >= 148 && i < 156 ? 0x20 : h[i]; unsigned += b; signed += b > 127 ? b - 256 : b; }
      if (recorded !== unsigned && recorded !== signed) throw new Error(`the header checksum at offset ${off} does not add up (recorded ${recorded}, computed ${unsigned})`);
      const version = h.toString('latin1', 263, 265);
      const prefix = version === '00' ? field(h, 345, 155) : '';
      const name = prefix.length > 0 ? `${prefix}/${field(h, 0, 100)}` : field(h, 0, 100);
      const size = octal(h, 124, 12, `the size of ${JSON.stringify(name)}`);
      const typeflag = h[156];
      const start = off + BLOCK; const end = start + size;
      if (end > total) throw new Error(`the entry ${JSON.stringify(name)} at offset ${off} needs ${size} byte(s); ${total - start} remain — the archive is truncated`);
      if (names.has(name)) throw new Error(`the entry ${JSON.stringify(name)} appears twice`);
      names.add(name);
      const regular = typeflag === 0x30 || typeflag === 0;
      const keep = regular && KEEP_RE.test(name) && size <= KEEP_MAX;
      const entryHash = createHash('sha256'); const kept = keep ? [] : null;
      let pos = start;
      while (pos < end) { const n = Math.min(CHUNK, end - pos); const chunk = readAt(pos, n, buf); entryHash.update(chunk); if (kept !== null) kept.push(Buffer.from(chunk)); pos += n; }
      const padded = start + Math.ceil(size / BLOCK) * BLOCK;
      if (padded > end) readAt(end, padded - end, buf);
      entries.push({ name, size, typeflag: typeflag === 0 ? '\\0' : String.fromCharCode(typeflag), regular, digest: entryHash.digest('hex'), bytes: kept === null ? null : Buffer.concat(kept) });
      off = padded;
    }
    throw new Error(`the archive ends at ${total} byte(s) without the two-block end-of-archive trailer`);
  } finally { closeSync(fd); }
}

/* ── arguments ─────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
let dir = null; let tarPath = null; let expected = null; let publicKeyPath = null; let asJson = false;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--expect-package-digest') { expected = String(args[i + 1] ?? '').toLowerCase(); i += 1; }
  else if (a === '--tar') { tarPath = String(args[i + 1] ?? ''); i += 1; }
  else if (a === '--public-key') { publicKeyPath = String(args[i + 1] ?? ''); i += 1; }
  else if (a === '--json') asJson = true;
  else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
  else if (dir === null) dir = a;
  else { console.error(`unexpected argument: ${a}`); process.exit(2); }
}
if ((dir === null) === (tarPath === null) || tarPath === '' || publicKeyPath === '') { console.error(USAGE); process.exit(2); }
if (dir !== null) dir = resolve(dir);
if (tarPath !== null) tarPath = resolve(tarPath);
if (publicKeyPath !== null) publicKeyPath = resolve(publicKeyPath);
const target = dir ?? tarPath;

/* ── the checks ────────────────────────────────────────────────────────────── */
const results = [];
let summary = null;
const check = (name, ok, detail) => { results.push({ name, ok: ok === true, detail: detail ?? null }); return ok === true; };
const note = (text) => results.push({ name: text, ok: null, detail: null });

// The public key, when given: a readable SPKI PEM of an Ed25519 PUBLIC key — a private key file is refused before it is parsed (the
// verifier must never hold private material; the operator's own key is never handed to a customer-side tool).
let publicKey = null; let publicKeyId = null;
if (publicKeyPath !== null) {
  try {
    const pem = readFileSync(publicKeyPath, 'utf8');
    if (/PRIVATE KEY/.test(pem)) throw new Error('the file holds a PRIVATE key; the verifier takes the PUBLIC key only');
    if (!/-----BEGIN PUBLIC KEY-----/.test(pem)) throw new Error('the file is not a PEM public key (no "-----BEGIN PUBLIC KEY-----")');
    const key = createPublicKey({ key: pem, format: 'pem' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error(`the key is ${key.asymmetricKeyType ?? 'unknown'}, not ed25519`);
    publicKey = key; publicKeyId = `ed25519:${sha256(key.export({ type: 'spki', format: 'der' })).slice(0, 16)}`;
    check('public key: --public-key is a readable Ed25519 public key (SPKI PEM)', true, `${publicKeyPath}; key id ${publicKeyId}`);
  } catch (e) {
    check('public key: --public-key is a readable Ed25519 public key (SPKI PEM)', false, `${publicKeyPath}: ${e.message}`);
  }
}

// THE SOURCE of the package's files: the directory on disk, or the archive's entries parsed in memory. Both answer the same three
// questions — is a name present, what are its bytes, what names are there — so every check below reads a package the same way.
let source = null; let archiveDigest = null;
if (tarPath !== null) {
  try {
    const scanned = scanUstarFile(tarPath);
    const entries = scanned.entries;
    archiveDigest = scanned.archiveDigest;
    const byName = new Map(entries.map((e) => [e.name, e]));
    source = {
      kind: 'archive',
      exists: (name) => byName.has(name),
      read: (name) => { const e = byName.get(name); if (e === undefined) throw new Error('no such entry'); if (!e.regular) throw new Error(`the entry is not a regular file (typeflag '${e.typeflag}')`); if (e.bytes === null) throw new Error('the entry is not held in memory (only the manifest and the links file are)'); return e.bytes; },
      // B15: an entry's digest and size as scanned — the archive is never held whole.
      measure: (name) => { const e = byName.get(name); if (e === undefined) throw new Error('no such entry'); if (!e.regular) throw new Error(`the entry is not a regular file (typeflag '${e.typeflag}')`); return { digest: e.digest, size: e.size }; },
      list: () => entries.map((e) => e.name),
    };
    check('archive readable: the file parses as a ustar archive', true, `${scanned.byteLength} bytes, ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, archive digest ${archiveDigest}`);
  } catch (e) {
    check('archive readable: the file parses as a ustar archive', false, `${tarPath}: ${e.message}`);
  }
} else {
  source = { kind: 'directory', exists: (name) => existsSync(join(dir, name)), read: (name) => readFileSync(join(dir, name)), measure: (name) => measureFile(join(dir, name)), list: () => readdirSync(dir) };
}

let manifest = null; let parsed = false; let sig = null; let signatureVerified = null; let closureFormat = null;
if (source !== null) {
  if (!source.exists('manifest.json')) {
    const seen = source.kind === 'archive' ? source.list() : [];
    check('manifest.json present', false, `no manifest.json ${source.kind === 'archive' ? 'in' : 'under'} ${target}${seen.length > 0 ? ` (the archive's entries: ${seen.slice(0, 6).join(', ')}${seen.length > 6 ? `, … ${seen.length} in all` : ''} — a package archive names its files plainly, without a directory prefix)` : ''}`);
  } else {
    try {
      const raw = source.read('manifest.json');
      manifest = JSON.parse(raw.toString('utf8')); parsed = true;
      check('manifest.json present and parses', true, `${raw.byteLength} bytes, file digest ${sha256(raw)}`);
    } catch (e) {
      check('manifest.json present and parses', false, `manifest.json does not parse or cannot be read: ${e.message}`);
    }
  }
}
// The manifest is a JSON OBJECT (B11-F2): `null`, a list or a scalar parses, and is not a package — a failed check, so that
// no branch below is skipped silently and the verdict is a failure.
const isObject = manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest);
if (parsed) check('manifest.json is a JSON object', isObject, isObject ? 'an object' : `manifest.json is ${manifest === null ? 'null' : Array.isArray(manifest) ? 'an array' : `a ${typeof manifest}`}, not a package manifest`);
if (isObject) {
  check(`format is ${FORMATS.join(' or ')}`, FORMATS.includes(manifest.format), `format ${JSON.stringify(manifest.format)}`);
  sig = manifest.signature !== null && typeof manifest.signature === 'object' && !Array.isArray(manifest.signature) ? manifest.signature : null;
  check(`signature scheme is ${SCHEMES.join(' or ')}`, sig !== null && SCHEMES.includes(sig.scheme), `scheme ${JSON.stringify(sig?.scheme)}`);
  const objects = Array.isArray(manifest.objects) ? manifest.objects : null;
  check('objects is a list', objects !== null, objects === null ? 'objects is not an array' : `${objects.length} object(s)`);
  const listed = new Set();
  let integrityOk = 0; let reimportOk = 0; let bytesTotal = 0;
  if (objects !== null) {
    for (let i = 0; i < objects.length; i += 1) {
      const o = objects[i];
      const label = `objects[${i}] ${o?.object_id ?? '?'}@${o?.object_version ?? '?'}`;
      const file = o?.bytes?.file;
      // 2. integrity of the bytes
      if (typeof file !== 'string' || !BIN_RE.test(file)) { check(`integrity ${label}: bytes.file`, false, `bytes.file ${JSON.stringify(file)} is not <manifest id>.bin`); continue; }
      listed.add(file);
      if (!source.exists(file)) { check(`integrity ${label}: ${file} present`, false, 'the listed file is absent'); continue; }
      let measured;
      try { measured = source.measure(file); } catch (e) { check(`integrity ${label}: ${file} readable`, false, `the listed file cannot be read as a file: ${e.message}`); continue; }
      const d = measured.digest;
      const okDigest = d === o.bytes.content_digest;
      const okSize = measured.size === o.bytes.byte_length;
      if (check(`integrity ${label}: ${file} sha256 and size`, okDigest && okSize, okDigest ? (okSize ? `${measured.size} bytes, ${d}` : `size ${measured.size} is not ${o.bytes.byte_length}`) : `digest mismatch: file ${d}, listed ${o.bytes.content_digest}`)) { integrityOk += 1; bytesTotal += measured.size; }
      // 3. re-import: the record binds the bytes; the header and payload recompute to the canonical digest
      const payloadBinds = o?.payload?.content_digest === o.bytes.content_digest;
      const headerKeys = o?.header !== null && typeof o?.header === 'object' ? Object.keys(o.header).length : -1;
      let recomputed = null; let recomputeError = null;
      try { recomputed = digestOf({ header: o.header, payload: o.payload }); } catch (e) { recomputeError = e.message; }
      const okReimport = payloadBinds && headerKeys === HEADER_FIELDS && recomputed === o.content_digest;
      if (check(`re-import ${label}: payload binds the bytes, ${HEADER_FIELDS}-field header and payload recompute to the canonical digest`, okReimport,
        !payloadBinds ? `payload.content_digest ${JSON.stringify(o?.payload?.content_digest)} is not bytes.content_digest ${o.bytes.content_digest}`
          : headerKeys !== HEADER_FIELDS ? `the header carries ${headerKeys} field(s), not ${HEADER_FIELDS}`
            : recomputed !== o.content_digest ? `the header and payload recompute to ${recomputed ?? `nothing (${recomputeError})`}, the record says ${o.content_digest}` : `canonical digest ${o.content_digest}`)) reimportOk += 1;
    }
    note(`integrity ${integrityOk}/${objects.length}; re-import ${reimportOk}/${objects.length}`);
  }
  // 4. completeness: the directory (the archive) holds the manifest and the listed files, nothing else — every entry counts, a dot-file
  //    included (the product's verification counts the directory the same way; the product never writes a dot-file into a package,
  //    and its archive carries exactly manifest.json and the listed files, in that order)
  // B15: THE RELATIONSHIP CLOSURE — a manifest whose package.links names links.json must have it, with the digest and size it names; its
  // format and counts are read; a /1 package without a links block is verified as before (no links check).
  const linksBlock = isObject && manifest.package !== null && typeof manifest.package === 'object' && manifest.package.links !== undefined && manifest.package.links !== null ? manifest.package.links : null;
  if (linksBlock !== null) {
    const lfile = linksBlock.file;
    if (lfile !== 'links.json') check('links: package.links.file names links.json', false, `package.links.file is ${JSON.stringify(lfile)}`);
    else {
      listed.add('links.json');
      if (!source.exists('links.json')) check('links: links.json present', false, 'the manifest names a links file that is absent');
      else {
        let lm = null; let lraw = null;
        try { lm = source.measure('links.json'); lraw = source.read('links.json'); } catch (e) { check('links: links.json readable', false, e.message); }
        if (lm !== null) {
          const okD = lm.digest === linksBlock.links_digest; const okS = lm.size === linksBlock.byte_length;
          check('links: links.json sha256 and size are the ones the manifest names', okD && okS, okD ? (okS ? `${lm.size} bytes, ${lm.digest}` : `size ${lm.size} is not ${linksBlock.byte_length}`) : `digest mismatch: file ${lm.digest}, listed ${linksBlock.links_digest}`);
          let lj = null; try { lj = JSON.parse(lraw.toString('utf8')); } catch (e) { lj = null; }
          const lok = lj !== null && typeof lj === 'object' && !Array.isArray(lj) && lj.format === linksBlock.format && Array.isArray(lj.claims) && Array.isArray(lj.edges) && Array.isArray(lj.entities) && Array.isArray(lj.excluded)
            && lj.claims.length === linksBlock.claims && lj.edges.length === linksBlock.edges && lj.entities.length === linksBlock.entities && lj.excluded.length === linksBlock.excluded && lj.package?.action_id === manifest.package?.action_id;
          if (lj !== null && typeof lj === 'object' && !Array.isArray(lj) && typeof lj.format === 'string') closureFormat = lj.format;
          check('links: links.json is the closure the manifest counts (format, claims, edges, entities, excluded; the same action)', lok, lok ? `${lj.claims.length} claim(s), ${lj.edges.length} edge(s), ${lj.entities.length} entit${lj.entities.length === 1 ? 'y' : 'ies'}, ${lj.excluded.length} excluded; closure format ${lj.format}` : lj === null ? 'links.json does not parse as a JSON object' : `counts or format differ from the manifest's package.links (${JSON.stringify({ format: lj.format, claims: lj.claims?.length, edges: lj.edges?.length, entities: lj.entities?.length, excluded: lj.excluded?.length })})`);
          if (lok && lj.format === LINKS_FORMAT_2) {
            // B16 (Codex B15-F1): THE PAIR RULE. A /2 closure carries every EXACT claim version an edge or a lineage row names, so membership is
            // checked by the (object_id, object_version) pair — an edge asserted on C@1 is satisfied by C@1 alone, never by C@2 under the same
            // id — and a record by the (object_id, bytes digest) pair its lineage row and its edges name. A pair listed twice is a malformed
            // closure (the product writes each version once); a lineage row is the one of ITS version (claim_version = object_version).
            const exportedDigests = new Map((manifest.objects ?? []).map((o) => [o?.object_id, o?.bytes?.content_digest]));
            const recordPair = (id, digest) => exportedDigests.has(id) && exportedDigests.get(id) === digest;
            const pairKey = (c) => `${c?.object_id}@${c?.object_version}`;
            const pairs = new Set(); const duplicates = [];
            for (const c of lj.claims) { const k = pairKey(c); if (pairs.has(k)) duplicates.push(k); else pairs.add(k); }
            const entityIds = new Set(lj.entities.map((e) => e?.entity_id));
            const claimFault = (c) => {
              if (!Number.isInteger(c?.object_version)) return `${pairKey(c)}: object_version is not an integer`;
              if (!Array.isArray(c?.lineage) || c.lineage.length === 0) return `${pairKey(c)}: no lineage row`;
              const wrongVersion = c.lineage.find((l) => l?.claim_version !== c.object_version);
              if (wrongVersion !== undefined) return `${pairKey(c)}: a lineage row of version ${wrongVersion?.claim_version}, not its own`;
              const unresolved = c.lineage.find((l) => !recordPair(l?.evidence_object_id, l?.evidence_digest));
              if (unresolved !== undefined) return `${pairKey(c)}: its lineage names ${unresolved?.evidence_object_id ?? '?'} with digest ${String(unresolved?.evidence_digest ?? '?').slice(0, 12)}…, ${exportedDigests.has(unresolved?.evidence_object_id) ? 'not the bytes the package carries' : 'a record the package does not carry'}`;
              return null;
            };
            const edgeFault = (e) => {
              const named = `${e?.claim?.object_id}@${e?.claim?.object_version}`;
              if (!pairs.has(named)) { const carried = lj.claims.filter((c) => c?.object_id === e?.claim?.object_id).map((c) => c.object_version); return `edge ${e?.edge_id ?? '?'} names ${named}, ${carried.length > 0 ? `which the closure does not carry (it carries version${carried.length === 1 ? '' : 's'} ${carried.join(', ')} of that claim — an edge is never rebased onto another version)` : 'a claim the closure does not carry'}`; }
              if (!entityIds.has(e?.subject_entity_id) || !entityIds.has(e?.object_entity_id)) return `edge ${e?.edge_id ?? '?'} names an entity the closure does not carry`;
              if (!recordPair(e?.evidence?.object_id, e?.evidence?.digest)) return `edge ${e?.edge_id ?? '?'} names record ${e?.evidence?.object_id ?? '?'} with a digest the package does not carry`;
              return null;
            };
            const claimFaults = lj.claims.map(claimFault).filter((f) => f !== null);
            const edgeFaults = lj.edges.map(edgeFault).filter((f) => f !== null);
            const three = (xs) => `${xs.slice(0, 3).join('; ')}${xs.length > 3 ? `; … ${xs.length} in all` : ''}`;
            check('links: every claim version\'s lineage names an exported record by (object_id, bytes digest); every edge names an included claim by (object_id, object_version), included entities and an exported record by (object_id, digest)',
              duplicates.length === 0 && claimFaults.length === 0 && edgeFaults.length === 0,
              duplicates.length > 0 ? `${duplicates.length} claim version(s) listed twice: ${three(duplicates)}`
                : claimFaults.length > 0 ? `${claimFaults.length} claim version(s) whose lineage does not resolve by pair: ${three(claimFaults)}`
                  : edgeFaults.length > 0 ? `${edgeFaults.length} edge(s) naming what the closure does not carry: ${three(edgeFaults)}`
                    : `the closure is consistent by (object_id, object_version) and (object_id, bytes digest): ${pairs.size} claim version(s), ${lj.edges.length} edge(s), ${entityIds.size} entit${entityIds.size === 1 ? 'y' : 'ies'}`);
          } else if (lok && lj.format === LINKS_FORMAT_1) {
            // A /1 closure (B15) carries ONE version per claim — the latest — so an edge's claim is matched by object_id alone here, and the
            // verifier SAYS so: which exact version an edge rests on is not validated by this format (Codex B15-F1; the /2 closure carries the pair).
            const exported = new Set((manifest.objects ?? []).map((o) => o?.object_id));
            const claimIds = new Set(lj.claims.map((c) => c?.object_id)); const entityIds = new Set(lj.entities.map((e) => e?.entity_id));
            const badClaims = lj.claims.filter((c) => !Array.isArray(c?.lineage) || c.lineage.length === 0 || !c.lineage.every((l) => exported.has(l?.evidence_object_id)));
            const badEdges = lj.edges.filter((e) => !claimIds.has(e?.claim?.object_id) || !entityIds.has(e?.subject_entity_id) || !entityIds.has(e?.object_entity_id) || !exported.has(e?.evidence?.object_id));
            check('links: (closure format 1) every claim\'s lineage names exported records; every edge names an included claim by object_id alone — a /1 closure carries one version per claim, so version references are not validated here (B15-F1)', badClaims.length === 0 && badEdges.length === 0, badClaims.length > 0 ? `${badClaims.length} claim(s) with lineage outside the export` : badEdges.length > 0 ? `${badEdges.length} edge(s) naming an excluded claim, an absent entity or an unexported record` : 'the closure is consistent by id; versions unvalidated');
          } else if (lok) {
            check(`links: the closure format is ${LINKS_FORMAT_1} or ${LINKS_FORMAT_2}`, false, `format ${JSON.stringify(lj.format)} is not a closure format this verifier reads; its references were not validated`);
          }
        }
      }
    }
  }
  let present = null;
  try { present = source.list(); } catch (e) { check('completeness: the package directory can be listed', false, `the directory cannot be listed: ${e.message}`); }
  if (present !== null) {
    const unlisted = present.filter((n) => n !== 'manifest.json' && !listed.has(n));
    const missing = [...listed].filter((n) => !present.includes(n));
    check('completeness: every listed file present and every file listed', unlisted.length === 0 && missing.length === 0,
      unlisted.length > 0 ? `unlisted file(s) in the package: ${unlisted.join(', ')}` : missing.length > 0 ? `listed file(s) absent: ${missing.join(', ')}` : `${present.length} entr${present.length === 1 ? 'y' : 'ies'} in the ${source.kind}: manifest.json + ${listed.size} listed file(s)`);
  }
  // `excluded` enters the chain AS LISTED (the product digests the value it wrote; a substitute would let an edited member verify):
  // a member that is not a list is a failed check and stops the chain.
  const excluded = Array.isArray(manifest.excluded) ? manifest.excluded : null;
  check('excluded is a list', excluded !== null, excluded === null ? `excluded is ${manifest.excluded === undefined ? 'absent' : JSON.stringify(manifest.excluded).slice(0, 60)}, not a list` : `${excluded.length} entr${excluded.length === 1 ? 'y' : 'ies'}`);
  if (excluded !== null) note(`excluded ${excluded.length}: ${excluded.length === 0 ? 'nothing was withheld' : excluded.map((x) => `${x?.manifest_id ?? '?'} (${x?.gate ?? '?'}: ${x?.reason ?? ''})`).join('; ')}`);
  // 5. redaction: no exported record classified above the package's stated ceiling
  if (objects !== null) {
    const ceiling = manifest.gates?.redaction?.classification_ceiling;
    const above = objects.filter((o) => rank(o?.header?.classification) > rank(ceiling)).map((o) => `${o?.object_id ?? '?'}@${o?.object_version ?? '?'} (${o?.header?.classification ?? '?'})`);
    check(`redaction: every exported record's classification is within the ceiling ${JSON.stringify(ceiling)}`, CLASSIFICATIONS.includes(ceiling) && above.length === 0,
      !CLASSIFICATIONS.includes(ceiling) ? `gates.redaction.classification_ceiling ${JSON.stringify(ceiling)} is not a classification` : above.length > 0 ? `record(s) above the ceiling: ${above.join(', ')}` : `${objects.length} record(s) at or below ${ceiling}`);
  }
  // 6. the chain
  if (objects !== null && excluded !== null && sig !== null) {
    let objectsDigest = null; let packageDigest = null; let chainError = null;
    try {
      objectsDigest = digestOf(objects);
      packageDigest = digestOf({ format: manifest.format, package: manifest.package, authorization: manifest.authorization, gates: manifest.gates, objects_digest: objectsDigest, excluded, bound_to: sig.bound_to ?? null, statement: sig.statement ?? null });
    } catch (e) { chainError = e.message; }
    check('chain: sha256(JCS(objects)) = signature.objects_digest', objectsDigest !== null && objectsDigest === sig.objects_digest, chainError ?? `${objectsDigest} ${objectsDigest === sig.objects_digest ? '=' : '≠'} ${sig.objects_digest}`);
    check('chain: sha256(JCS({format, package, authorization, gates, objects_digest, excluded, bound_to, statement})) = signature.package_digest', packageDigest !== null && packageDigest === sig.package_digest, chainError ?? `${packageDigest} ${packageDigest === sig.package_digest ? '=' : '≠'} ${sig.package_digest}`);
    const auth = manifest.authorization ?? {};
    const boundOk = sig.bound_to !== null && typeof sig.bound_to === 'object' && sig.bound_to.action_id !== undefined && sig.bound_to.action_id === manifest.package?.action_id
      && sig.bound_to.scope_digest === auth.scope_digest && sig.bound_to.approval_id === auth.approval_id;
    check('chain: signature.bound_to restates the covered authorization (action_id = package.action_id, scope_digest = authorization.scope_digest, approval_id = authorization.approval_id)', boundOk,
      boundOk ? `bound to action ${manifest.package?.action_id}, scope digest ${auth.scope_digest}, approval ${auth.approval_id}`
        : `bound_to {action ${sig.bound_to?.action_id}, scope digest ${sig.bound_to?.scope_digest}, approval ${sig.bound_to?.approval_id}} does not restate {action ${manifest.package?.action_id}, scope digest ${auth.scope_digest}, approval ${auth.approval_id}}`);
    // 6b. the key-based signature (scheme eye-customer-export/2): the block's shape, then — with --public-key — Ed25519 over the ASCII
    //     hex of the package digest RECOMPUTED here (the content the customer holds). A signature that verifies over the STATED
    //     package_digest but not over the recomputed one is a package altered after signing; the detail says which.
    if (sig.scheme === SCHEME_KEY) {
      const sigBytes = typeof sig.signature === 'string' && SIGNATURE_B64.test(sig.signature) ? Buffer.from(sig.signature, 'base64') : null;
      const keyIdOk = typeof sig.key_id === 'string' && sig.key_id.length > 0;
      const shapeOk = keyIdOk && sig.algorithm === 'Ed25519' && sigBytes !== null && sigBytes.byteLength === 64;
      check(`signature: key_id, algorithm Ed25519 and a 64-byte base64 signature are present (scheme ${SCHEME_KEY})`, shapeOk,
        !keyIdOk ? `key_id ${JSON.stringify(sig.key_id)} is not a key id` : sig.algorithm !== 'Ed25519' ? `algorithm ${JSON.stringify(sig.algorithm)} is not Ed25519` : sigBytes === null || sigBytes.byteLength !== 64 ? 'signature is not the base64 of 64 bytes' : `key id ${sig.key_id}, Ed25519, 64-byte signature`);
      if (publicKeyPath === null) {
        note(`signature: not verified here: pass --public-key <pem-file> with the public key of ${keyIdOk ? sig.key_id : 'the signing key'} (the export read route serves it, with the key's purpose and state)`);
      } else if (publicKey === null) {
        signatureVerified = check('signature: the Ed25519 signature over the package digest verifies against --public-key', false, 'the public key could not be loaded (see the public key check)');
      } else if (!shapeOk || packageDigest === null) {
        signatureVerified = check('signature: the Ed25519 signature over the package digest verifies against --public-key', false, !shapeOk ? 'no well-formed signature to verify' : `no package digest to verify against (${chainError})`);
      } else {
        let verified = false; let verifyError = null; let overStated = false;
        try {
          verified = cryptoVerify(null, Buffer.from(packageDigest, 'utf8'), publicKey, sigBytes);
          if (!verified && typeof sig.package_digest === 'string' && HEX64.test(sig.package_digest) && sig.package_digest !== packageDigest) overStated = cryptoVerify(null, Buffer.from(sig.package_digest, 'utf8'), publicKey, sigBytes);
        } catch (e) { verifyError = e.message; }
        signatureVerified = check('signature: the Ed25519 signature over the package digest verifies against --public-key', verified,
          verified ? `verified over ${packageDigest} with ${publicKeyId}${publicKeyId === sig.key_id ? ' (the manifest names this key)' : ` (the manifest names ${sig.key_id})`}`
            : verifyError !== null ? `the signature could not be checked: ${verifyError}`
              : overStated ? `the signature verifies over the stated package_digest ${sig.package_digest}, not over the package's recomputed digest ${packageDigest}: the content was altered after signing`
                : `the signature does not verify over ${packageDigest} with ${publicKeyId}${publicKeyId === sig.key_id ? '' : ` (the manifest names ${sig.key_id}; is this its public key?)`}`);
      }
    }
    if (expected !== null) {
      check('authenticity: the package digest equals the digest the product recorded (--expect-package-digest)', HEX64.test(expected) && packageDigest === expected,
        !HEX64.test(expected) ? `the expected package digest is not sha-256 hex: ${expected}` : packageDigest === expected ? `recorded ${expected}` : `expected package digest ${expected}, the package computes ${packageDigest}`);
    } else {
      note('authenticity: pass --expect-package-digest <hex> with the digest the product recorded (the export read route, or the retention record) to compare');
    }
    summary = { objects: objects.length, bytes: bytesTotal, package_digest: packageDigest };
  }
}

/* ── the verdict (B11-F2) ──────────────────────────────────────────────────── */
// COMPLETE means the validation reached the chain and computed the package digest: a package is verified only by a completed
// validation. Anything that stopped short — no manifest, not an object, no object list, no signature block, a chain that could not
// be computed — is recorded as a failed check of its own, so `failed` counts it and the three outcomes (text, JSON, exit) agree.
const complete = summary !== null && typeof summary.package_digest === 'string' && HEX64.test(summary.package_digest);
if (!complete) check('validation complete: the package was checked through to its digest chain', false, 'the validation did not reach the chain (no manifest object, no object list, no signature block, or the chain could not be computed); the package is NOT verified');
// An expected digest is never skipped silently: when no authenticity comparison ran, the comparison the caller asked for failed.
if (expected !== null && !results.some((r) => r.ok !== null && r.name.startsWith('authenticity:'))) {
  check('authenticity: the package digest equals the digest the product recorded (--expect-package-digest)', false, `no package digest was computed, so the expected digest ${expected} could not be compared`);
}
// A public key is never skipped silently either: when no signature verification ran — a package with the digest chain alone, or one
// that never reached its signature block — the verification the caller asked for failed.
if (publicKeyPath !== null && signatureVerified === null) {
  signatureVerified = check('signature: the Ed25519 signature over the package digest verifies against --public-key', false,
    sig !== null && sig.scheme === SCHEME_CHAIN ? `the package carries the digest chain alone (scheme ${SCHEME_CHAIN}), no key-based signature to verify` : 'the validation did not reach a key-based signature block; nothing was verified against the public key');
}
const failed = results.filter((r) => r.ok === false).length;
const ok = failed === 0 && complete;
const signature = { scheme: sig?.scheme ?? null, key_id: sig?.scheme === SCHEME_KEY && typeof sig?.key_id === 'string' ? sig.key_id : null, verified: signatureVerified };
if (asJson) {
  console.log(JSON.stringify({ package: target, mode: source?.kind ?? 'archive', archive_digest: archiveDigest, checks: results, summary, signature, closure_format: closureFormat, complete, failed, ok }, null, 2));
} else {
  console.log(`export package: ${target}${tarPath !== null ? ' (ustar archive)' : ''}`);
  for (const r of results) console.log(r.ok === null ? `  ${r.name}` : `  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail !== null ? ` — ${r.detail}` : ''}`);
  const signed = signature.scheme === SCHEME_KEY ? `; signature ${signatureVerified === true ? `verified (${signature.key_id})` : `not verified here (${signature.key_id}; pass --public-key)`}` : '';
  console.log(ok ? `PACKAGE OK: ${summary.objects} objects, ${summary.bytes} bytes, package digest ${summary.package_digest}${signed}` : `PACKAGE FAILED: ${failed} check(s) failed${complete ? '' : '; the validation did not complete'}`);
}
process.exit(ok ? 0 : 1);
