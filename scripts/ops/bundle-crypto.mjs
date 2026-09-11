#!/usr/bin/env node
// The Eye — BUNDLE ENCRYPTION AT REST for the backup/restore path (CP-4/5).
//
// A backup bundle is the whole runtime state in one directory: the database dumps,
// the role verifiers in globals.sql, the vault bytes, the degraded journals and a
// byte copy of .eye-local/env. Unencrypted, the bundle is a second copy of every
// credential the deployment has. This module encrypts it at rest with a key that is
// RECOVERABLE by a documented procedure and is never written anywhere in plaintext.
//
// ── WHY NODE'S CRYPTO AND NOT `openssl enc`
// Checked on this machine on 2026-09-10:
//   * /opt/homebrew/bin/openssl is OpenSSL 3.6.4. `openssl enc -aes-256-gcm` refuses:
//       "enc: AEAD ciphers not supported" — `openssl enc` has never supported AEAD.
//   * `age` is not installed; `gpg`/`gpg2` are not installed.
// The documented fallback is `openssl enc -aes-256-cbc` plus a separate HMAC. That
// fallback is NOT used, for a reason specific to this script's constraint that no
// secret may ever be observable: with a per-bundle random key, `openssl enc` can only
// be given that key as `-K <hex>` on the COMMAND LINE, where it is visible to every
// process on the host in `ps`. Node is already a hard requirement of backup.sh and
// restore.sh (they refuse to run without it), its crypto is OpenSSL's own libcrypto,
// and it provides the AEAD that `openssl enc` will not — with the key material held
// only in process memory. So: AES-256-GCM through node:crypto.
//
// ── THE SCHEME
//   passphrase   EYE_BACKUP_PASSPHRASE, read from the ENVIRONMENT only. Never a flag,
//                never defaulted, never printed, never written into the bundle.
//   KEK          PBKDF2-HMAC-SHA512(passphrase, salt, 600000 iterations, 32 bytes).
//                The salt is 16 random bytes, generated per bundle and recorded.
//   verify tag   HMAC-SHA256(KEK, "eye-backup-bundle/2:verify:" + saltHex). Recorded.
//                A wrong passphrase is refused by this tag BEFORE any ciphertext is
//                touched, so a bad passphrase never becomes a confusing decrypt error.
//   DEK          32 random bytes, generated PER BUNDLE. It is the file-encryption key
//                and it exists in plaintext only in memory.
//   wrapped DEK  AES-256-GCM(KEK, iv, aad="eye-backup-bundle/2:dek") over the DEK.
//                Only the wrapped form is recorded. Whoever has the bundle and the
//                passphrase can unwrap it; whoever has only the bundle cannot.
//   files        AES-256-GCM(DEK, per-file iv, aad = the file's path inside the
//                bundle) — so a ciphertext cannot be moved to another path inside the
//                bundle without the tag failing. Recorded per file: iv, tag, the
//                sha256 of the ciphertext and of the plaintext, and the plaintext size.
//
// INTEGRITY BEFORE EXTRACTION: `open` verifies the passphrase tag, then decrypts each
// file to a temporary path, and only after GCM has authenticated the whole stream AND
// the plaintext sha256 matches the record does the plaintext move into place. A file
// whose tag does not verify never appears as a readable file at all.
//
// ── THE PATH IS PART OF WHAT IS AUTHENTICATED (format /2; reviewer's finding R2)
// Format /1 authenticated each payload under the AAD its record carried, but chose
// the source and OUTPUT path from the record's KEY in `files`. The two were not
// required to agree, so a manifest whose key was changed to `../../escaped.bin` while
// its `aad` kept the original path still authenticated — and `open --into <dir>`
// wrote the decrypted bytes OUTSIDE <dir>. Corrected here, in three layers, all
// checked BEFORE any payload or temporary file is written:
//   1. the file's identity is its CANONICAL relative path: `aad` must EQUAL the key,
//      the key must be a plain relative path (no absolute, no `.`/`..` segment, no
//      empty segment, no backslash, no control character);
//   2. the whole file MAP is authenticated: `files_tag_hex` is an HMAC-SHA256, under a
//      key derived from the KEK, over the canonical list of (path, iv, tag, digests,
//      sizes). A renamed, removed, added or re-pointed entry fails this tag before a
//      single ciphertext is read;
//   3. physical containment: the destination directory is created and resolved to
//      its physical path; every ancestor of every output path is created by this
//      process or verified to be a real directory (never a symlink) under it, the
//      output path itself must not be a symlink, and the resolved parent must lie
//      under the resolved destination. The same holds for the source ciphertext
//      inside the bundle directory.
// A bundle sealed under format /1 is REFUSED by `verify` and `open` (its file map
// cannot be authenticated) and must be re-taken with a current backup.sh.
//
// ── IF THE PASSPHRASE IS LOST
// There is no recovery. The DEK exists only wrapped under the passphrase-derived KEK;
// nothing else in the bundle or in the repository can produce it. See
// docs/ops/BACKUP_RESTORE.md §17.
import { createCipheriv, createDecipheriv, createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const FORMAT = 'eye-bundle-crypto/2';
const FORMAT_V1 = 'eye-bundle-crypto/1';
const KDF = { algorithm: 'PBKDF2-HMAC-SHA512', iterations: 600000, key_bytes: 32, salt_bytes: 16 };
const CIPHER = 'aes-256-gcm';
const DEK_AAD = 'eye-backup-bundle/2:dek';
const VERIFY_LABEL = 'eye-backup-bundle/2:verify:';
const FILES_LABEL = 'eye-backup-bundle/2:files';

const die = (m) => { process.stderr.write(`bundle-crypto: ${m}\n`); process.exit(2); };
const arg = (argv, name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback; };

/** The passphrase, from the environment only. Never echoed; only its length class is ever reported. */
function passphrase() {
  const p = process.env['EYE_BACKUP_PASSPHRASE'];
  if (p === undefined || p === '') {
    die('EYE_BACKUP_PASSPHRASE is not set in the environment.\n' +
        '  It is never defaulted and never accepted as a command-line flag.\n' +
        '  Supply it from the operator\'s password store, e.g.:\n' +
        '    EYE_BACKUP_PASSPHRASE="$(security find-generic-password -w -s eye-backup)" scripts/ops/backup.sh');
  }
  if (p.length < 12) die('EYE_BACKUP_PASSPHRASE is shorter than 12 characters; refusing to wrap a bundle key under it');
  return p;
}

const kek = (pass, salt) => pbkdf2Sync(pass, salt, KDF.iterations, KDF.key_bytes, 'sha512');
const verifyTag = (kekBuf, saltHex) => createHmac('sha256', kekBuf).update(`${VERIFY_LABEL}${saltHex}`).digest('hex');

// ── path identity and containment ──────────────────────────────────────────────
/** A canonical relative path inside the bundle, or the reason it is not one. */
function canonicalRel(rel) {
  if (typeof rel !== 'string' || rel === '') return 'empty path';
  if (/[\u0000-\u001f\u007f\\]/.test(rel)) return 'control character or backslash in path';
  if (isAbsolute(rel) || rel.startsWith('/')) return 'absolute path';
  const segs = rel.split('/');
  for (const seg of segs) {
    if (seg === '') return 'empty path segment';
    if (seg === '.' || seg === '..') return `'${seg}' segment`;
  }
  return null;
}
/** The canonical, order-independent text of the file map that `files_tag_hex` authenticates. */
function filesCanon(files) {
  const rels = Object.keys(files).sort();
  return rels.map((rel) => {
    const r = files[rel];
    return [rel, r.iv_hex, r.tag_hex, r.ciphertext_sha256, r.plaintext_sha256, String(r.plaintext_bytes), String(r.ciphertext_bytes)].join('\n');
  }).join('\n\n') + '\n';
}
const filesKey = (kekBuf) => createHmac('sha256', kekBuf).update(FILES_LABEL).digest();
const filesTag = (kekBuf, files) => createHmac('sha256', filesKey(kekBuf)).update(filesCanon(files)).digest('hex');
const isUnder = (child, parent) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r) && !r.split(sep).includes('..')); };
/**
 * Validate the whole file map BEFORE anything is read or written: every key canonical,
 * every record's aad equal to its key, and the map tag authenticating under the KEK.
 * Dies with the first problem; nothing was touched.
 */
function checkFileMap(crypto, kekBuf) {
  if (crypto.format === FORMAT_V1) {
    die(`this bundle was sealed under ${FORMAT_V1}, whose file map is not authenticated (a record's path could be changed while its aad was kept); ` +
        'it is refused rather than opened. Take a new backup with the current backup.sh.');
  }
  if (crypto.format !== FORMAT) die(`unknown bundle crypto format ${crypto.format ?? '(none)'}`);
  const files = crypto.files;
  if (files === null || typeof files !== 'object' || Array.isArray(files)) die('the manifest records no file map');
  for (const [rel, rec] of Object.entries(files)) {
    const why = canonicalRel(rel);
    if (why !== null) die(`file map entry ${JSON.stringify(rel)}: ${why} — refused before any read or write`);
    if (rec === null || typeof rec !== 'object') die(`file map entry ${JSON.stringify(rel)}: no record`);
    if (rec.aad !== rel) die(`file map entry ${JSON.stringify(rel)}: its authenticated identity (aad ${JSON.stringify(rec.aad)}) is not its path — the mapping was altered; refused before any read or write`);
    for (const k of ['iv_hex', 'tag_hex', 'ciphertext_sha256', 'plaintext_sha256']) {
      if (typeof rec[k] !== 'string' || !/^[0-9a-f]+$/.test(rec[k])) die(`file map entry ${JSON.stringify(rel)}: ${k} is not hex`);
    }
    if (!Number.isInteger(rec.plaintext_bytes) || !Number.isInteger(rec.ciphertext_bytes)) die(`file map entry ${JSON.stringify(rel)}: sizes are not integers`);
  }
  const want = Buffer.from(String(crypto.files_tag_hex ?? ''), 'hex');
  const got = Buffer.from(filesTag(kekBuf, files), 'hex');
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    die('the file map does not authenticate under the passphrase-derived key: an entry was renamed, removed, added or re-pointed. Refused before any read or write.');
  }
}
/**
 * The physical output path for `rel` under the (already resolved) destination root:
 * every ancestor is created by this process or verified to be a real directory under
 * the root; the leaf must not exist as a symlink; the resolved parent must be under
 * the root. Returns the path, or dies. Nothing is written except directories under
 * the root.
 */
function containedOutput(rootPhys, rel) {
  const segs = rel.split('/');
  let dir = rootPhys;
  for (const seg of segs.slice(0, -1)) {
    const next = join(dir, seg);
    let st = null;
    try { st = lstatSync(next); } catch { st = null; }
    if (st === null) mkdirSync(next, { mode: 0o700 });
    else if (st.isSymbolicLink()) die(`${rel}: ancestor ${next} is a symlink; refused (no write outside the destination)`);
    else if (!st.isDirectory()) die(`${rel}: ancestor ${next} is not a directory; refused`);
    dir = next;
    if (!isUnder(realpathSync(dir), rootPhys)) die(`${rel}: ancestor ${dir} resolves outside the destination ${rootPhys}; refused`);
  }
  const leaf = join(dir, segs[segs.length - 1]);
  for (const p of [leaf, `${leaf}.decrypting`]) {
    let st = null;
    try { st = lstatSync(p); } catch { st = null; }
    if (st !== null && st.isSymbolicLink()) die(`${rel}: ${p} exists as a symlink; refused (no write through a link)`);
    if (st !== null && !st.isFile()) die(`${rel}: ${p} exists and is not a regular file; refused`);
  }
  if (!isUnder(realpathSync(dir), rootPhys) || !isUnder(leaf, rootPhys)) die(`${rel}: output ${leaf} is outside the destination ${rootPhys}; refused`);
  return leaf;
}
/** The ciphertext for `rel` inside the (resolved) bundle: a regular file, not a symlink, under the bundle. */
function containedSource(bundlePhys, rel, suffix) {
  const src = join(bundlePhys, `${rel}${suffix}`);
  if (!isUnder(src, bundlePhys)) die(`${rel}: source ${src} is outside the bundle; refused`);
  let st = null;
  try { st = lstatSync(src); } catch { st = null; }
  if (st === null) return { src, missing: true };
  if (st.isSymbolicLink()) die(`${rel}: ${src} is a symlink; a bundle payload must be a regular file`);
  if (!st.isFile()) die(`${rel}: ${src} is not a regular file`);
  const parent = realpathSync(dirname(src));
  if (!isUnder(parent, bundlePhys)) die(`${rel}: ${src} resolves outside the bundle; refused`);
  return { src, missing: false };
}
/** A directory that is not a symlink, resolved to its physical path (created when `create`). */
function physicalDir(label, path, create) {
  let st = null;
  try { st = lstatSync(path); } catch { st = null; }
  if (st === null) {
    if (!create) die(`${label} ${path} does not exist`);
    mkdirSync(path, { recursive: true, mode: 0o700 });
  } else if (st.isSymbolicLink()) die(`${label} ${path} is a symlink; refused`);
  else if (!st.isDirectory()) die(`${label} ${path} is not a directory`);
  return realpathSync(path);
}

/** A pass-through that hashes what flows through it. */
function hashing(sink) {
  const h = createHash('sha256');
  let bytes = 0;
  const t = new Transform({ transform(chunk, _enc, cb) { h.update(chunk); bytes += chunk.length; cb(null, chunk); } });
  t.on('end', () => undefined);
  return { stream: t, done: () => { sink.sha256 = h.digest('hex'); sink.bytes = bytes; } };
}

async function encryptFile(dek, srcPath, dstPath, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, dek, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const plain = {}, cipherOut = {};
  const hp = hashing(plain), hc = hashing(cipherOut);
  await pipeline(createReadStream(srcPath), hp.stream, cipher, hc.stream, createWriteStream(dstPath, { mode: 0o600 }));
  hp.done(); hc.done();
  return {
    iv_hex: iv.toString('hex'),
    tag_hex: cipher.getAuthTag().toString('hex'),
    aad,
    plaintext_sha256: plain.sha256,
    plaintext_bytes: plain.bytes,
    ciphertext_sha256: cipherOut.sha256,
    ciphertext_bytes: cipherOut.bytes,
  };
}

async function decryptFile(dek, srcPath, dstPath, rec) {
  const decipher = createDecipheriv(CIPHER, dek, Buffer.from(rec.iv_hex, 'hex'));
  decipher.setAAD(Buffer.from(rec.aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(rec.tag_hex, 'hex'));
  const plain = {}, cipherIn = {};
  const hp = hashing(plain), hc = hashing(cipherIn);
  // dstPath was produced by containedOutput: its directory exists under the physical
  // destination and neither it nor the temporary path is a symlink.
  const tmp = `${dstPath}.decrypting`;
  try {
    // GCM authenticates at end-of-stream: pipeline REJECTS on a bad tag, so a
    // tampered file never reaches its final path.
    await pipeline(createReadStream(srcPath), hc.stream, decipher, hp.stream, createWriteStream(tmp, { mode: 0o600 }));
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* the temporary file is best-effort */ }
    throw new Error(`${rec.aad}: authentication FAILED (${e instanceof Error ? e.message : String(e)}) — the bundle is corrupt or was tampered with`);
  }
  hp.done(); hc.done();
  if (hc.stream && cipherIn.sha256 !== rec.ciphertext_sha256) { rmSync(tmp, { force: true }); throw new Error(`${rec.aad}: ciphertext sha256 does not match the manifest`); }
  if (plain.sha256 !== rec.plaintext_sha256) { rmSync(tmp, { force: true }); throw new Error(`${rec.aad}: decrypted sha256 does not match the manifest`); }
  if (plain.bytes !== rec.plaintext_bytes) { rmSync(tmp, { force: true }); throw new Error(`${rec.aad}: decrypted size does not match the manifest`); }
  renameSync(tmp, dstPath);
  return { sha256: plain.sha256, bytes: plain.bytes };
}

/** Unwrap the DEK, having first refused a wrong passphrase by the verification tag. */
function openKey(crypto) {
  if (crypto?.format === FORMAT_V1) checkFileMap(crypto, null); // refused by format, before the passphrase is read
  if (crypto?.format !== FORMAT) die(`unknown bundle crypto format ${crypto?.format ?? '(none)'}`);
  const pass = passphrase();
  const salt = Buffer.from(crypto.kdf.salt_hex, 'hex');
  const k = pbkdf2Sync(pass, salt, crypto.kdf.iterations, crypto.kdf.key_bytes, 'sha512');
  const want = Buffer.from(crypto.verification_tag_hex, 'hex');
  const got = Buffer.from(verifyTag(k, crypto.kdf.salt_hex), 'hex');
  if (want.length !== got.length || !timingSafeEqual(want, got)) {
    die('the passphrase in EYE_BACKUP_PASSPHRASE does not open this bundle (its verification tag does not match).\n' +
        '  No ciphertext was touched. Supply the passphrase this bundle was sealed with.');
  }
  // The file map is authenticated BEFORE the data key is unwrapped and before any
  // ciphertext is read: an altered mapping is refused with nothing touched.
  checkFileMap(crypto, k);
  const w = crypto.wrapped_data_key;
  const d = createDecipheriv(CIPHER, k, Buffer.from(w.iv_hex, 'hex'));
  d.setAAD(Buffer.from(DEK_AAD, 'utf8'));
  d.setAuthTag(Buffer.from(w.tag_hex, 'hex'));
  let dek;
  try { dek = Buffer.concat([d.update(Buffer.from(w.ciphertext_hex, 'hex')), d.final()]); }
  catch { die('the wrapped bundle key does not authenticate under the passphrase-derived key — the manifest is corrupt'); }
  k.fill(0);
  return dek;
}

// ─────────────────────────────────────────────────────────────────────── seal
// seal --bundle <dir> --files a,b,c  → prints the crypto descriptor as JSON
async function cmdSeal(argv) {
  const bundle = resolve(arg(argv, '--bundle') ?? die('--bundle is required'));
  const files = (arg(argv, '--files') ?? die('--files is required')).split(',').map((s) => s.trim()).filter((s) => s !== '');
  const pass = passphrase();
  const salt = randomBytes(KDF.salt_bytes);
  const k = kek(pass, salt);
  const dek = randomBytes(32);
  const wrapIv = randomBytes(12);
  const wrap = createCipheriv(CIPHER, k, wrapIv);
  wrap.setAAD(Buffer.from(DEK_AAD, 'utf8'));
  const wrapped = Buffer.concat([wrap.update(dek), wrap.final()]);

  const out = {
    format: FORMAT,
    cipher: CIPHER,
    sealed_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    kdf: { ...KDF, salt_hex: salt.toString('hex'), passphrase_env: 'EYE_BACKUP_PASSPHRASE' },
    verification_tag_hex: verifyTag(k, salt.toString('hex')),
    wrapped_data_key: {
      cipher: CIPHER, aad: DEK_AAD,
      iv_hex: wrapIv.toString('hex'), ciphertext_hex: wrapped.toString('hex'), tag_hex: wrap.getAuthTag().toString('hex'),
    },
    encrypted_suffix: '.enc',
    files: {},
    note: 'The data key exists in plaintext only in memory. Only its wrapped form is recorded. ' +
          'Losing EYE_BACKUP_PASSPHRASE loses the bundle: see docs/ops/BACKUP_RESTORE.md §17.',
  };
  const bundlePhys = physicalDir('bundle', bundle, false);
  for (const rel of files) {
    const why = canonicalRel(rel);
    if (why !== null) die(`--files entry ${JSON.stringify(rel)}: ${why}`);
    if (out.files[rel] !== undefined) die(`--files names ${JSON.stringify(rel)} twice`);
    const src = join(bundlePhys, rel);
    if (!isUnder(src, bundlePhys)) die(`${rel} is outside the bundle`);
    if (!existsSync(src) || !lstatSync(src).isFile()) die(`${src} is not a file`);
    out.files[rel] = await encryptFile(dek, src, `${src}.enc`, rel);
    unlinkSync(src); // the plaintext must not survive next to its ciphertext
  }
  // The whole map, authenticated: path, iv, tag, digests and sizes of every entry.
  out.files_tag_hex = filesTag(k, out.files);
  out.files_tag = 'HMAC-SHA256 under HMAC-SHA256(KEK, "eye-backup-bundle/2:files") over the sorted canonical file map (path, iv, tag, ciphertext sha256, plaintext sha256, plaintext bytes, ciphertext bytes)';
  dek.fill(0); k.fill(0);
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

// ───────────────────────────────────────────────────────────────────── verify
// verify --bundle <dir> --manifest <MANIFEST.json>   (no plaintext is written)
async function cmdVerify(argv) {
  const bundle = resolve(arg(argv, '--bundle') ?? die('--bundle is required'));
  const manifest = JSON.parse(readFileSync(arg(argv, '--manifest') ?? join(bundle, 'MANIFEST.json'), 'utf8'));
  const crypto = manifest.encryption ?? die('this bundle records no .encryption (it is not an encrypted bundle)');
  const dek = openKey(crypto);
  const bundlePhys = physicalDir('bundle', bundle, false);
  const report = { verdict: 'ok', file_map: 'authenticated', files: {} };
  for (const [rel, rec] of Object.entries(crypto.files)) {
    const { src, missing } = containedSource(bundlePhys, rel, crypto.encrypted_suffix);
    if (missing) { report.verdict = 'bad'; report.files[rel] = 'missing'; continue; }
    const d = createDecipheriv(CIPHER, dek, Buffer.from(rec.iv_hex, 'hex'));
    d.setAAD(Buffer.from(rec.aad, 'utf8'));
    d.setAuthTag(Buffer.from(rec.tag_hex, 'hex'));
    const plain = {}, cipherIn = {};
    const hp = hashing(plain), hc = hashing(cipherIn);
    try {
      await pipeline(createReadStream(src), hc.stream, d, hp.stream, new Transform({ transform(_c, _e, cb) { cb(); } }));
      hp.done(); hc.done();
      const ok = plain.sha256 === rec.plaintext_sha256 && cipherIn.sha256 === rec.ciphertext_sha256;
      if (!ok) report.verdict = 'bad';
      report.files[rel] = ok ? 'authenticated' : 'digest mismatch';
    } catch (e) {
      report.verdict = 'bad';
      report.files[rel] = `authentication FAILED: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`;
    }
  }
  dek.fill(0);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.verdict === 'ok' ? 0 : 1);
}

// ─────────────────────────────────────────────────────────────────────── open
// open --bundle <dir> --into <dir> [--manifest <MANIFEST.json>]
async function cmdOpen(argv) {
  const bundle = resolve(arg(argv, '--bundle') ?? die('--bundle is required'));
  const into = resolve(arg(argv, '--into') ?? die('--into is required'));
  const manifest = JSON.parse(readFileSync(arg(argv, '--manifest') ?? join(bundle, 'MANIFEST.json'), 'utf8'));
  const crypto = manifest.encryption ?? die('this bundle records no .encryption (it is not an encrypted bundle)');
  const dek = openKey(crypto); // the file map is authenticated in here, before anything else
  const bundlePhys = physicalDir('bundle', bundle, false);
  // The destination: created by this process (or an existing real directory), then
  // resolved to its PHYSICAL path; every output is contained under that.
  const intoPhys = physicalDir('destination', into, true);
  // Every source present and every output path contained — checked for the WHOLE
  // map before the first byte is written.
  const plan = [];
  for (const [rel, rec] of Object.entries(crypto.files)) {
    const { src, missing } = containedSource(bundlePhys, rel, crypto.encrypted_suffix);
    if (missing) { dek.fill(0); die(`${src} is missing — the bundle is incomplete`); }
    plan.push({ rel, rec, src, dst: containedOutput(intoPhys, rel) });
  }
  const report = { into: intoPhys, file_map: 'authenticated', files: {} };
  for (const { rel, rec, src, dst } of plan) {
    try {
      const r = await decryptFile(dek, src, dst, rec);
      report.files[rel] = { sha256: r.sha256, bytes: r.bytes };
    } catch (e) { dek.fill(0); die(e instanceof Error ? e.message : String(e)); }
  }
  dek.fill(0);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

const argv = process.argv.slice(2);
const cmd = argv[0];
if (cmd === 'seal') await cmdSeal(argv);
else if (cmd === 'verify') await cmdVerify(argv);
else if (cmd === 'open') await cmdOpen(argv);
else if (cmd === 'capabilities') {
  // What this host can actually do, for the runbook and the drill record.
  process.stdout.write(`${JSON.stringify({
    format: FORMAT, cipher: CIPHER, kdf: KDF, node: process.version,
    openssl: process.versions.openssl ?? null,
    aead_via_node_crypto: true,
  })}\n`);
} else {
  process.stderr.write(
    'usage (EYE_BACKUP_PASSPHRASE must be in the environment):\n' +
    '  bundle-crypto.mjs seal   --bundle <dir> --files <rel,rel,...>\n' +
    '  bundle-crypto.mjs verify --bundle <dir> [--manifest <MANIFEST.json>]\n' +
    '  bundle-crypto.mjs open   --bundle <dir> --into <dir> [--manifest <MANIFEST.json>]\n' +
    '  bundle-crypto.mjs capabilities\n');
  process.exit(2);
}
