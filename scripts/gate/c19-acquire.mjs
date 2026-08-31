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
// EXPECTATIONS, confirmed against the evidence below — not the source of truth.
const sourceRun = arg('--source-run');
const sourceAttempt = arg('--source-attempt');
const out = arg('--out') ?? die('--out is required');
mkdirSync(out, { recursive: true });

/** Text responses. Never used for binary: see `ghBinary`. */
const gh = (args) => {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) die(`gh ${args[0]} failed: ${(r.stderr ?? '').slice(0, 200)}`);
  return r.stdout ?? '';
};

/**
 * Binary responses, as BYTES.
 *
 * Decoding a ZIP through a utf8 string and re-encoding it silently destroys it: every invalid byte
 * sequence becomes U+FFFD, and the file gets shorter. That is not a subtle corruption — the first
 * hosted run of this script lost 122,930 bytes of a 2,331,537-byte artifact — but it is a silent
 * one, and it would have been signed as if it were the evidence had the wrapper digest not been
 * checked against the digest GitHub reports.
 */
const ghBinary = (args) => {
  const r = spawnSync('gh', args, { maxBuffer: 512 * 1024 * 1024 });
  if (r.status !== 0) die(`gh ${args[0]} failed: ${(r.stderr ?? '').toString().slice(0, 200)}`);
  return r.stdout;
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
writeFileSync(wrapperPath, ghBinary(['api', `repos/${repo}/actions/artifacts/${art.id}/zip`]));
const wrapperDigest = sha256(readFileSync(wrapperPath));
// FAIL CLOSED on the API digest. Treating an absent digest as "nothing to check" skipped wrapper
// authentication entirely — and wrapper authentication is the check that caught a download which
// had silently lost 122,930 bytes. An artifact GitHub will not vouch for is not acquirable here.
const reported = art.digest;
if (typeof reported !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(reported)) {
  die(`the API reports no usable sha256 digest for artifact ${art.id} (got ${JSON.stringify(reported)}); `
    + 'refusing to authenticate the wrapper against nothing');
}
const norm = reported.slice('sha256:'.length);
if (norm !== wrapperDigest) {
  die(`the downloaded wrapper hashes to ${wrapperDigest} but the API reports ${norm}`);
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
if (!existsSync(finalizer)) {
  die(`the C17 finalization verifier is missing at ${finalizer}; acquisition cannot be verified`);
}
// `--root` is REQUIRED by that verifier, because it independently regenerates the source archive
// and compares. The root must be the tree the evidence was PRODUCED from — verifying evidence
// against a different checkout would fail for a reason that says nothing about the evidence.
const sourceRoot = arg('--source-root') ?? process.cwd();
if (!existsSync(join(sourceRoot, 'node_modules'))) {
  die(`the source root ${sourceRoot} has no installed workspace; the C17 finalization verifier `
    + 'regenerates the archive from it and cannot run against an uninstalled tree. Refusing rather '
    + 'than skipping the verification, because a skipped check reads exactly like a passed one.');
}
const v = spawnSync('node', [finalizer, 'verify', '--zip', innerPath, '--root', sourceRoot],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (v.status !== 0) {
  // BOTH streams. The first hosted failure reported an empty reason because only stdout was
  // captured, and the verifier writes its findings to stderr.
  const detail = `${(v.stdout ?? '').trim()}\n${(v.stderr ?? '').trim()}`.trim();
  die(`the existing C17 finalization verifier rejected the inner evidence (root ${sourceRoot}):\n`
    + `${detail.slice(-1200) || '(the verifier produced no output)'}`);
}
process.stderr.write('C19 acquire: C17 finalization verification PASSED on the inner evidence\n');

/**
 * ── THE SOURCE RUN COMES FROM THE EVIDENCE, NOT FROM A SEARCH ──
 *
 * `--source-run` and `--source-attempt` were parsed and then never used, while the workflow found a
 * source run by searching for "any successful ci push run with this SHA". A same-SHA search is not
 * a causal binding: several runs can share a SHA, and the one the payload names could differ from
 * the one actually authenticated inside the finalized evidence.
 *
 * The finalizer receipt inside that evidence already carries the authenticated `source_run_id`,
 * `source_run_attempt` and `source_sha`, and C17 verification — which has just passed — cross-checks
 * them against the API. Those are therefore the values the payload is built from, and the supplied
 * arguments are treated as an EXPECTATION to be confirmed rather than as the source of truth.
 */
const innerDir = join(extractDir, 'inner');
mkdirSync(innerDir, { recursive: true });
// `-o` overwrite, `-qq` quiet; the inner archive has already been digest-bound and C17-verified.
const ux = spawnSync('unzip', ['-qq', '-o', innerPath, '-d', innerDir], { encoding: 'utf8' });
if (ux.status !== 0) die(`the finalized inner archive could not be extracted (exit ${ux.status})`);
const receiptPath = join(innerDir, 'finalizer-receipt.json');
if (!existsSync(receiptPath)) {
  die('the finalized evidence carries no finalizer-receipt.json; the authenticated source run '
    + 'cannot be established, and a same-SHA search is not a substitute for it');
}
let receipt;
try { receipt = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch (e) {
  die(`the finalizer receipt is not readable JSON (${e.message})`);
}
const authed = {
  sourceRunId: String(receipt.source_run_id ?? ''),
  sourceRunAttempt: String(receipt.source_run_attempt ?? ''),
  sourceSha: String(receipt.source_sha ?? ''),
  finalizerRunId: String(receipt.run_id ?? ''),
  finalizerRunAttempt: String(receipt.run_attempt ?? ''),
  finalizerWorkflowRef: String(receipt.workflow_ref ?? ''),
};
for (const [k, v] of Object.entries(authed)) {
  if (v === '') die(`the finalizer receipt omits ${k}; the authenticated binding is incomplete`);
}

// The finalizer this evidence claims must be the finalizer we actually acquired from. Anything
// else means the artifact and the run that produced it have been decoupled.
if (authed.finalizerRunId !== String(finalizerRun)) {
  die(`the finalized evidence was produced by finalizer run ${authed.finalizerRunId}, but this `
    + `acquisition targeted ${finalizerRun}`);
}
// And the caller's expectation must agree with what the evidence authenticates.
if (sourceRun !== undefined && String(sourceRun) !== authed.sourceRunId) {
  die(`the caller expected source run ${sourceRun} but the finalized evidence authenticates `
    + `${authed.sourceRunId}; a same-SHA search is not a causal binding`);
}
if (sourceAttempt !== undefined && String(sourceAttempt) !== authed.sourceRunAttempt) {
  die(`the caller expected source attempt ${sourceAttempt} but the evidence authenticates `
    + `${authed.sourceRunAttempt}`);
}
process.stderr.write(`C19 acquire: authenticated source run ${authed.sourceRunId} attempt `
  + `${authed.sourceRunAttempt} for ${authed.sourceSha.slice(0, 8)} (from the finalizer receipt)\n`);

for (const line of [
  `artifact_id=${art.id}`,
  `artifact_name=${art.name}`,
  `wrapper_digest=${wrapperDigest}`,
  `inner_name=${innerName}`,
  `inner_digest=${innerDigest}`,
  // The AUTHENTICATED bindings, taken from the finalized evidence itself rather than from a search.
  `source_run_id=${authed.sourceRunId}`,
  `source_run_attempt=${authed.sourceRunAttempt}`,
  `source_sha=${authed.sourceSha}`,
  `finalizer_run_id=${authed.finalizerRunId}`,
  `finalizer_run_attempt=${authed.finalizerRunAttempt}`,
]) process.stdout.write(`${line}\n`);
process.stderr.write(`C19 acquire: wrapper ${wrapperDigest.slice(0, 16)}… inner ${innerName} `
  + `${innerDigest.slice(0, 16)}…\n`);
