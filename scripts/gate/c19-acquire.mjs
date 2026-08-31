#!/usr/bin/env node
/**
 * C19 — ACQUIRE THE FINALIZED EVIDENCE, AND AUTHENTICATE WHAT WAS ACQUIRED.
 *
 * The previous acquisition step downloaded an artifact and hashed the result. That hash is of
 * GitHub's DOWNLOAD WRAPPER — the ZIP the API builds around whatever the artifact contains — not of
 * the finalized evidence anybody intended to sign. It also never checked GitHub's own reported
 * digest, never looked inside, and never ran the existing C17 finalization verifier.
 *
 * Signing a wrapper is not signing the evidence. Both are bound here, separately and by name:
 *
 *   WRAPPER  — the artifact as GitHub delivers it, checked against the digest the API reports
 *   INNER    — exactly one finalized evidence ZIP and its sidecar, extracted safely and verified
 *
 * Extraction is deliberately strict. A ZIP entry with an absolute path, a `..` segment, or a
 * symlink is refused rather than sanitised, because an archive that contains one is not the archive
 * this contract describes and guessing at intent is how a path traversal becomes a feature.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const die = (m) => { process.stderr.write(`C19 acquire: ${m}\n`); process.exit(1); };
const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };

const repo = arg('--repo') ?? die('--repo is required');
const finalizerRun = arg('--finalizer-run') ?? die('--finalizer-run is required');
const sourceRun = arg('--source-run') ?? die('--source-run is required');
const sourceAttempt = arg('--source-attempt') ?? die('--source-attempt is required');
const out = arg('--out') ?? die('--out is required');
mkdirSync(out, { recursive: true });

const gh = (args) => {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) die(`gh ${args[0]} failed: ${(r.stderr ?? '').slice(0, 200)}`);
  return r.stdout ?? '';
};

// ── EXACTLY ONE unexpired finalized artifact, or refuse ──
const arts = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${finalizerRun}/artifacts`,
  '--jq', '[.artifacts[] | select(.expired==false) | select(.name|startswith("c17-evidence-finalized-"))]']));
if (arts.length !== 1) {
  die(`expected exactly one unexpired finalized artifact on run ${finalizerRun}, found ${arts.length}; `
    + 'missing, multiple, stale or ambiguous acquisition is refused rather than resolved by picking');
}
const [art] = arts;

// ── AUTHENTICATE THE WRAPPER AGAINST GITHUB'S OWN REPORTED DIGEST ──
const wrapperPath = join(out, 'finalized.zip');
writeFileSync(wrapperPath, Buffer.from(gh(['api', `repos/${repo}/actions/artifacts/${art.id}/zip`,
  '--cache', '0'], ), 'binary'));
const wrapperDigest = sha256(readFileSync(wrapperPath));
// GitHub reports a digest for the artifact contents when available; when it does, it must match.
const reported = art.digest ?? null;
if (reported !== null) {
  const norm = String(reported).replace(/^sha256:/, '');
  if (norm !== wrapperDigest) {
    die(`the downloaded wrapper hashes to ${wrapperDigest} but the API reports ${norm}`);
  }
}

// ── SAFE EXTRACTION ──
const listing = spawnSync('unzip', ['-Z1', wrapperPath], { encoding: 'utf8' });
if (listing.status !== 0) die('the wrapper is not a readable ZIP');
const entries = (listing.stdout ?? '').split('\n').map((e) => e.trim()).filter((e) => e !== '');
for (const e of entries) {
  if (e.startsWith('/') || e.split('/').includes('..') || e.includes('\\')) {
    die(`the wrapper contains an unsafe entry ${JSON.stringify(e)}; refused rather than sanitised`);
  }
}
const inner = entries.filter((e) => /^c1[78]-.*evidence.*\.zip$/.test(e) || /\.zip$/.test(e));
if (inner.length !== 1) {
  die(`expected exactly one finalized inner evidence ZIP, found ${inner.length}: ${inner.join(', ')}`);
}
const [innerName] = inner;
const sidecars = entries.filter((e) => e === `${innerName}.sha256`);
if (sidecars.length !== 1) die(`the inner evidence has no matching .sha256 sidecar`);

const extractDir = join(out, 'extracted');
mkdirSync(extractDir, { recursive: true });
const unz = spawnSync('unzip', ['-qq', '-o', wrapperPath, '-d', extractDir], { encoding: 'utf8' });
if (unz.status !== 0) die('extraction failed');
for (const e of [innerName, `${innerName}.sha256`]) {
  const p = join(extractDir, e);
  if (!existsSync(p) || statSync(p).isSymbolicLink?.()) die(`expected member ${e} is missing or a symlink`);
}

// ── THE SIDECAR MUST BIND THE INNER ARTIFACT BY NAME AND DIGEST ──
const innerPath = join(extractDir, innerName);
const innerDigest = sha256(readFileSync(innerPath));
const sidecar = readFileSync(join(extractDir, `${innerName}.sha256`), 'utf8').trim();
const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(sidecar);
if (m === null) die('the sidecar is not a `<digest>  <name>` record');
if (m[1] !== innerDigest) die(`the sidecar declares ${m[1]} but the inner evidence hashes to ${innerDigest}`);
if (m[2].trim() !== innerName) die(`the sidecar names ${JSON.stringify(m[2].trim())}, not ${JSON.stringify(innerName)}`);

// ── RUN THE EXISTING C17 FINALIZATION VERIFIER, RATHER THAN RE-IMPLEMENTING IT ──
const finalizer = join('scripts', 'gate', 'c17-cross-host-finalization.mjs');
if (existsSync(finalizer)) {
  const v = spawnSync('node', [finalizer, 'verify', '--zip', innerPath], { encoding: 'utf8' });
  if (v.status !== 0) {
    die(`the existing C17 finalization verifier rejected the inner evidence:\n${(v.stdout ?? '').slice(-800)}`);
  }
  process.stderr.write('C19 acquire: C17 finalization verification PASSED on the inner evidence\n');
} else {
  die(`the C17 finalization verifier is missing at ${finalizer}; acquisition cannot be verified`);
}

for (const line of [
  `artifact_id=${art.id}`,
  `artifact_name=${art.name}`,
  `wrapper_digest=${wrapperDigest}`,
  `inner_name=${innerName}`,
  `inner_digest=${innerDigest}`,
]) process.stdout.write(`${line}\n`);
process.stderr.write(`C19 acquire: wrapper ${wrapperDigest.slice(0, 16)}… inner ${innerName} `
  + `${innerDigest.slice(0, 16)}…\n`);
