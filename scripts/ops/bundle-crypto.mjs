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
// ── IF THE PASSPHRASE IS LOST
// There is no recovery. The DEK exists only wrapped under the passphrase-derived KEK;
// nothing else in the bundle or in the repository can produce it. See
// docs/ops/BACKUP_RESTORE.md §17.
import { createCipheriv, createDecipheriv, createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const FORMAT = 'eye-bundle-crypto/1';
const KDF = { algorithm: 'PBKDF2-HMAC-SHA512', iterations: 600000, key_bytes: 32, salt_bytes: 16 };
const CIPHER = 'aes-256-gcm';
const DEK_AAD = 'eye-backup-bundle/2:dek';
const VERIFY_LABEL = 'eye-backup-bundle/2:verify:';

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
  mkdirSync(dirname(dstPath), { recursive: true, mode: 0o700 });
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
  mkdirSync(dirname(dstPath), { recursive: true, mode: 0o700 });
  renameSync(tmp, dstPath);
  return { sha256: plain.sha256, bytes: plain.bytes };
}

/** Unwrap the DEK, having first refused a wrong passphrase by the verification tag. */
function openKey(crypto) {
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
  const w = crypto.wrapped_data_key;
  const d = createDecipheriv(CIPHER, k, Buffer.from(w.iv_hex, 'hex'));
  d.setAAD(Buffer.from(DEK_AAD, 'utf8'));
  d.setAuthTag(Buffer.from(w.tag_hex, 'hex'));
  let dek;
  try { dek = Buffer.concat([d.update(Buffer.from(w.ciphertext_hex, 'hex')), d.final()]); }
  catch { die('the wrapped bundle key does not authenticate under the passphrase-derived key — the manifest is corrupt'); }
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
  for (const rel of files) {
    const src = join(bundle, rel);
    if (!existsSync(src) || !lstatSync(src).isFile()) die(`${src} is not a file`);
    out.files[rel] = await encryptFile(dek, src, `${src}.enc`, rel);
    unlinkSync(src); // the plaintext must not survive next to its ciphertext
  }
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
  const report = { verdict: 'ok', files: {} };
  for (const [rel, rec] of Object.entries(crypto.files)) {
    const src = join(bundle, `${rel}${crypto.encrypted_suffix}`);
    if (!existsSync(src)) { report.verdict = 'bad'; report.files[rel] = 'missing'; continue; }
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
  const dek = openKey(crypto);
  mkdirSync(into, { recursive: true, mode: 0o700 });
  const report = { into, files: {} };
  for (const [rel, rec] of Object.entries(crypto.files)) {
    const src = join(bundle, `${rel}${crypto.encrypted_suffix}`);
    if (!existsSync(src)) { dek.fill(0); die(`${src} is missing — the bundle is incomplete`); }
    try {
      const r = await decryptFile(dek, src, join(into, rel), rec);
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
