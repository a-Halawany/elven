/**
 * C19 — ACQUISITION, AS A FUNCTION.
 *
 * This was a standalone script the workflow shelled out to, which meant the harness and production
 * ran it through different YAML and no control could exercise it directly. It is now a function on
 * the one pipeline, and the workflows supply inputs rather than steps.
 *
 * ── WHAT ACQUISITION MUST ESTABLISH ──
 *
 * That the bytes we are about to sign are the exact finalized evidence GitHub says the finalizer
 * produced, and that the run bindings inside them are the ones we resolved. Every check below
 * exists because its absence would let a different artifact, or the same artifact from a different
 * run, be signed with a perfectly valid signature.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const j = (v) => JSON.stringify(v);

/** The names this gate expects inside a finalized wrapper. Anything else is refused. */
export const WRAPPER_INNER_RE = /^c17-cross-host-finalized-[0-9a-f]{40}\.zip$/;

/**
 * ZIP members must be plain files with safe names. A member that escapes the extraction directory,
 * or that is a symlink, turns "extract the evidence" into "write anywhere the runner can".
 */
export function checkMemberNames(entries) {
  const problems = [];
  for (const e of entries) {
    if (e.startsWith('/') || e.includes('..') || e.includes('\\')) {
      problems.push(`c19-acquire: wrapper member ${j(e)} is not a safe relative name`);
    }
  }
  return problems;
}

/** Every member of a wrapper, from ZIP metadata rather than from a directory walk after extraction. */
export function listZipMembers(zipPath, run = spawnSync) {
  const r = run('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`c19-acquire: ${zipPath} is not a readable ZIP`);
  return (r.stdout ?? '').split('\n').map((e) => e.trim()).filter((e) => e !== '');
}

/**
 * Acquire and authenticate the finalized evidence for one canonical publication.
 *
 * `gh` is the shared GitHub layer, so pagination, fail-closed reads and attempt scoping behave
 * identically here and everywhere else.
 */
export function acquire({
  gh, finalizerRunId, finalizerAttempt, out, sourceRoot, token,
  run = spawnSync, expect = {},
}) {
  mkdirSync(out, { recursive: true });

  // ── 5 · the exact ATTEMPT-SCOPED artifact ────────────────────────────────
  //
  // Run-scoped listing returns artifacts from EVERY attempt, so a rerun's artifact could otherwise
  // be acquired for a publication identity that names the earlier attempt. GitHub offers no
  // attempt-scoped endpoint, so the attempt comes from this repository's own artifact naming
  // contract, which encodes it — and the artifact's `workflow_run.id` is checked too, so a name
  // alone cannot carry an artifact in from a different run.
  const prefix = `c17-evidence-finalized-a${finalizerAttempt}-`;
  const all = gh.artifacts(finalizerRunId);
  const candidates = all.filter((a) => a.expired === false
    && String(a.name).startsWith(prefix)
    && String(a.workflow_run?.id ?? finalizerRunId) === String(finalizerRunId));
  if (candidates.length !== 1) {
    throw new Error(`c19-acquire: expected exactly one unexpired artifact named ${j(prefix)}* on `
      + `run ${finalizerRunId}, found ${candidates.length} (of ${all.length} on the run); missing, `
      + 'duplicated or ambiguous results are refused rather than resolved by picking');
  }
  const [art] = candidates;

  // ── 6 · GitHub's own digest is REQUIRED ──────────────────────────────────
  const reported = art.digest;
  if (typeof reported !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(reported)) {
    throw new Error(`c19-acquire: the API reports no usable sha256 digest for artifact ${art.id} `
      + `(got ${j(reported)}); refusing to authenticate the wrapper against nothing`);
  }
  const wrapperPath = join(out, 'finalized-wrapper.zip');
  writeFileSync(wrapperPath, gh.artifactZip(art.id));
  const wrapperDigest = sha256(readFileSync(wrapperPath));
  if (reported.slice('sha256:'.length) !== wrapperDigest) {
    throw new Error(`c19-acquire: the downloaded wrapper hashes to ${wrapperDigest} but the API `
      + `reports ${reported.slice(7)}`);
  }

  // ── 7 · exact inventory, canonical names, safe extraction, real file types ─
  const members = listZipMembers(wrapperPath, run);
  const nameProblems = checkMemberNames(members);
  if (nameProblems.length > 0) throw new Error(nameProblems[0]);
  const inners = members.filter((m) => WRAPPER_INNER_RE.test(m));
  const sidecars = members.filter((m) => m.endsWith('.sha256'));
  if (inners.length !== 1) {
    throw new Error(`c19-acquire: the wrapper holds ${inners.length} finalized inner archives; `
      + 'exactly one is required');
  }
  const [innerName] = inners;
  if (sidecars.length !== 1 || sidecars[0] !== `${innerName}.sha256`) {
    throw new Error(`c19-acquire: the wrapper's sidecar set ${j(sidecars)} is not exactly `
      + `[${j(`${innerName}.sha256`)}]`);
  }
  if (members.length !== 2) {
    throw new Error(`c19-acquire: the wrapper holds ${members.length} members ${j(members)}; the `
      + 'inventory is exactly the inner archive and its sidecar, and an extra member is refused');
  }

  const extractDir = join(out, 'extracted');
  mkdirSync(extractDir, { recursive: true });
  if (run('unzip', ['-qq', '-o', wrapperPath, '-d', extractDir], { encoding: 'utf8' }).status !== 0) {
    throw new Error('c19-acquire: the wrapper could not be extracted');
  }
  // lstat, not stat: a symlink that points at a regular file passes `stat` and is still a symlink.
  for (const name of [innerName, `${innerName}.sha256`]) {
    const p = join(extractDir, name);
    if (!existsSync(p)) throw new Error(`c19-acquire: ${name} did not extract`);
    const st = lstatSync(p);
    if (!st.isFile()) throw new Error(`c19-acquire: extracted ${name} is not a regular file`);
  }

  const innerPath = join(extractDir, innerName);
  const innerDigest = sha256(readFileSync(innerPath));
  const sidecarText = readFileSync(join(extractDir, `${innerName}.sha256`), 'utf8').trim();
  const sm = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(sidecarText);
  if (sm === null) throw new Error('c19-acquire: the sidecar is not a `<digest>  <name>` record');
  if (sm[1] !== innerDigest) {
    throw new Error(`c19-acquire: the sidecar declares ${sm[1]} but the inner evidence hashes to ${innerDigest}`);
  }
  if (sm[2].trim() !== innerName) {
    throw new Error(`c19-acquire: the sidecar names ${j(sm[2].trim())}, not ${j(innerName)}`);
  }

  // ── 8 · C17 verification, ONLINE, with the token it needs ────────────────
  const finalizer = join('scripts', 'gate', 'c17-cross-host-finalization.mjs');
  if (!existsSync(finalizer)) {
    throw new Error(`c19-acquire: the C17 finalization verifier is missing at ${finalizer}`);
  }
  if (sourceRoot === undefined || !existsSync(join(sourceRoot, 'node_modules'))) {
    throw new Error(`c19-acquire: the source root ${j(sourceRoot)} has no installed workspace; the `
      + 'C17 verifier regenerates the archive from it and cannot run against an uninstalled tree. '
      + 'Refusing rather than skipping: a skipped check reads exactly like a passed one.');
  }
  const v = run('node', [finalizer, 'verify', '--zip', innerPath, '--root', sourceRoot, '--online'], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...(token === undefined ? {} : { GITHUB_TOKEN: token }) },
  });
  if (v.status !== 0) {
    const detail = `${(v.stdout ?? '').trim()}\n${(v.stderr ?? '').trim()}`.trim();
    throw new Error('c19-acquire: the C17 finalization verifier rejected the inner evidence:\n'
      + (detail.slice(-1200) || '(the verifier produced no output)'));
  }

  // ── 9 · the AUTHENTICATED bindings, from the verified evidence ───────────
  const innerDir = join(extractDir, 'inner');
  mkdirSync(innerDir, { recursive: true });
  if (run('unzip', ['-qq', '-o', innerPath, '-d', innerDir], { encoding: 'utf8' }).status !== 0) {
    throw new Error('c19-acquire: the finalized inner archive could not be extracted');
  }
  const receiptPath = join(innerDir, 'finalizer-receipt.json');
  if (!existsSync(receiptPath)) {
    throw new Error('c19-acquire: the finalized evidence carries no finalizer-receipt.json; the '
      + 'authenticated source run cannot be established, and a same-SHA search is not a substitute');
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const authed = {
    sourceRunId: String(receipt.source_run_id ?? ''),
    sourceRunAttempt: String(receipt.source_run_attempt ?? ''),
    sourceSha: String(receipt.source_sha ?? ''),
    finalizerRunId: String(receipt.run_id ?? ''),
    finalizerRunAttempt: String(receipt.run_attempt ?? ''),
  };
  for (const [k, val] of Object.entries(authed)) {
    if (val === '') throw new Error(`c19-acquire: the finalizer receipt omits ${k}`);
  }
  // What we resolved and what the evidence authenticates must be the same publication.
  for (const [field, want] of Object.entries(expect)) {
    if (want === undefined) continue;
    if (String(authed[field]) !== String(want)) {
      throw new Error(`c19-acquire: resolution expected ${field}=${j(want)} but the finalized `
        + `evidence authenticates ${j(authed[field])}; a same-SHA match is not a causal binding`);
    }
  }
  return {
    artifactId: String(art.id), artifactName: art.name,
    wrapperPath, wrapperDigest, innerPath, innerName, innerDigest,
    innerDir, receipt, authed,
  };
}
