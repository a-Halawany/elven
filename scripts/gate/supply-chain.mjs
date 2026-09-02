/**
 * C15 — REPRODUCIBLE SUPPLY-CHAIN RUNNER.
 *
 * Executes the real scanners and captures, for EVERY execution: the exact argv, the tool
 * and its version, start/finish timestamps, the source SHA, the exit code and the
 * complete raw stdout/stderr. Nothing is summarised — the raw bytes are written to disk
 * and digested, so the evidence can be re-read rather than trusted.
 *
 * ── C16-R2 CORRECTIONS (hosted run 31532067899 was RED here) ─────────────────────
 *  1. ISOLATED TRIVY CACHE. Every trivy invocation, including the provenance probe, uses
 *     one explicit `--cache-dir`. Previously the probe read the DEFAULT cache while CI
 *     prefetched into it partially, so the gate described a cache that was not the one
 *     the scans used.
 *  2. BOTH ARTIFACTS ACQUIRED. trivy 0.73 has no `--download-check-only`; the
 *     misconfiguration checks bundle is fetched lazily by the first misconfig scan. The
 *     runner now acquires the vulnerability DB *and* the checks bundle up front, then
 *     runs every authoritative scan with `--skip-db-update --skip-check-update`, and
 *     proves the cache fingerprint is unchanged afterwards.
 *  3. GOVERNED DISPOSITIONS. Image scans run with NO suppression and are reconciled
 *     against machine-governed, target-specific records. The global `.trivyignore` is
 *     gone: a bare CVE id suppresses that advisory in every image and package.
 *  4. NORMALISED COVERAGE. A non-blocking step must be an alternate FORMAT of a blocking
 *     scan, so the JSON captures now carry identical severity, scanner, target, ignore
 *     and cache semantics. Previously the JSON filesystem scan silently added LOW/MEDIUM
 *     coverage that nothing enforced.
 *  5. AUDITABLE FAILURE. A failure manifest and raw diagnostics are ALWAYS written before
 *     exiting, so a red CI run is still inspectable.
 *
 * Usage:
 *   node scripts/gate/supply-chain.mjs [--out DIR] [--final] [--expected-sha SHA]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, copyFileSync, chmodSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveImageIndex, platformPinnedRef, scannerBinaries, classifyStepPolicies,
} from './lib/scanner-provenance.mjs';
import {
  acquire, capture, enforce, fingerprint, frozenCacheArgs, loadPins, cachePaths,
} from './lib/trivy-cache.mjs';
import {
  loadScannerExclusions, validateRecords, reconcileFindings, findingsFromTrivyJson,
} from './lib/scanner-exclusions.mjs';
import { loadAdapter, assertNoTestSeams, activeTestSeams } from './lib/execution-adapter.mjs';
import { candidateSourceManifest, manifestProblems } from './lib/candidate-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Recorded when the tree carries no git metadata (a source archive). */
const NOT_A_WORKTREE = '(not a git worktree)';

/**
 * git, but tolerant of a gitless export AND newline-normalised.
 *
 * `spawnSync().stdout` is verbatim, so `git rev-parse HEAD` ends with a newline. Comparing
 * that against an --expected-sha argument made the correct SHA compare UNEQUAL TO ITSELF,
 * so final mode could never succeed — a false FAIL that would have blocked every final
 * evidence run. Normalising at the single point where git output enters the program is the
 * fix; trimming at each call site is how one gets missed.
 */
function safeGit(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return res.status === 0 ? (res.stdout ?? '').replace(/\s+$/, '') : null;
}

/**
 * The platform the deployable target actually runs on (CI is ubuntu-latest; the C16
 * target descriptor resolves linux/x64/glibc). Container scans are pinned to the matching
 * index child so a scan is never silently host-dependent.
 */
const SCAN_PLATFORM = 'linux/amd64';

/** PINNED TOOLCHAIN. Update deliberately — never to make a run pass. */
const PINNED_TOOLS = {
  pnpm: { argv: ['pnpm', '--version'], extract: (s) => s.trim(), expect: '11.9.0' },
  node: { argv: ['node', '--version'], extract: (s) => s.trim(), expect: 'v24.11.1' },
  gitleaks: { argv: ['gitleaks', 'version'], extract: (s) => s.trim(), expect: '8.30.1' },
  trivy: {
    argv: ['trivy', '--version'],
    extract: (s) => (/Version:\s*([0-9.]+)/.exec(s)?.[1] ?? s).trim(),
    expect: '0.73.0',
  },
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** The pins key for the platform whose binaries this process will execute. */
function hostPlatform() {
  const key = `${process.platform}-${process.arch}`;
  const map = { 'linux-x64': 'linux-x64', 'linux-arm64': 'linux-arm64', 'darwin-arm64': 'darwin-arm64' };
  const resolved = map[key];
  if (resolved === undefined) {
    throw new UsageError(`unsupported host platform '${key}'; add it to scripts/gate/scanner-pins.json`);
  }
  return resolved;
}

/** A caller mistake, distinguished from an internal fault so the message can be precise. */
class UsageError extends Error {}

const FLAGS_WITH_VALUES = ['--out', '--trivy-cache', '--expected-sha'];
const BOOLEAN_FLAGS = ['--final'];

/**
 * VALIDATED argument parsing. `--trivy-cache` with no value previously reached
 * `resolve(undefined)`, which threw a TypeError deep inside main() before any output
 * directory existed — so the run produced NO manifest at all. Arguments are now validated
 * up front, and an unknown or valueless flag is a precise usage failure.
 */
export function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { out: 'evidence/supply-chain', trivyCache: null, expectedSha: null, final: false, raw: args };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (BOOLEAN_FLAGS.includes(a)) { out.final = true; continue; }
    if (FLAGS_WITH_VALUES.includes(a)) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) {
        throw new UsageError(`${a} requires a value`);
      }
      if (a === '--out') out.out = v;
      if (a === '--trivy-cache') out.trivyCache = v;
      if (a === '--expected-sha') out.expectedSha = v;
      i += 1;
      continue;
    }
    throw new UsageError(
      `unrecognised argument ${JSON.stringify(a)}. Supported: ${[...FLAGS_WITH_VALUES, ...BOOLEAN_FLAGS].join(' ')}`,
    );
  }
  if (out.expectedSha !== null && !/^[0-9a-f]{40}$/.test(out.expectedSha)) {
    throw new UsageError(`--expected-sha ${JSON.stringify(out.expectedSha)} is not a 40-character git object id`);
  }
  return out;
}

/**
 * Bind every file in the output directory by relative path, size and SHA-256 — gitleaks
 * reports, trivy reports, acquisition logs, cache manifests, image-resolution output and
 * the manifest's own siblings. The manifest itself is excluded (it is being written).
 */
function bindArtifacts(outDir) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(dir, e.name);
      const relPath = rel === '' ? e.name : `${rel}/${e.name}`;
      // The isolated trivy cache is fingerprinted separately and is far too large to
      // digest file-by-file here; its identity is already bound by the cache fingerprint.
      if (e.isDirectory()) {
        // Excluded by design and documented in evidence_binding_note.
        if (e.name === '.trivy-cache' || e.name === '.staged-scanners') continue;
        walk(full, relPath);
        continue;
      }
      if (relPath === 'supply-chain-manifest.json') continue;
      try {
        const buf = readFileSync(full);
        out.push({ path: relPath, bytes: buf.byteLength, sha256: sha256(buf) });
      } catch { /* unreadable artifacts are simply not bound */ }
    }
  };
  walk(outDir, '');
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}


/**
 * Resolve, AUTHENTICATE and STAGE each scanner before it is ever executed.
 *
 * Order matters and was previously wrong: the runner probed `--version` and warmed the
 * cache — both of which EXECUTE the binary — before digesting it. Code from an unverified
 * executable had therefore already run by the time the check happened.
 *
 * Staging closes the check-then-use window: the authenticated bytes are copied into a
 * private per-run directory and every later invocation uses that absolute path, so a PATH
 * change or an on-disk swap between verification and use cannot substitute a different
 * binary. The staged copy is re-digested AFTER all scanning as well, so tampering during
 * the run is also detected.
 */
function stageAuthenticatedTools(tools, pins, hostPlatformKey, outDir, failures) {
  const stageDir = join(outDir, '.staged-scanners');
  mkdirSync(stageDir, { recursive: true });
  const paths = {};
  const verified = {};
  const expected = {};

  for (const tool of tools) {
    const art = pins.tools?.[tool]?.artifacts?.[hostPlatformKey] ?? null;
    const want = art?.executable_sha256 ?? null;
    expected[tool] = want;

    // C16-R3.4.1 §B2: resolution AND authentication cross the execution boundary, so the
    // hermetic suite needs no real scanner binary on PATH. The production adapter still
    // resolves and digests the real executable; only a test adapter answers otherwise, and
    // --final refuses every seam before this point.
    const which = ADAPTER.whichTool(tool);
    const resolved = which.status === 0 ? which.stdout.trim() : null;

    let actual = null;
    let bytes = null;
    if (resolved !== null) {
      const authed = ADAPTER.authenticateTool === undefined
        ? null
        : ADAPTER.authenticateTool(tool, resolved);
      if (authed !== null && authed !== undefined) {
        actual = authed.sha256 ?? null;
        bytes = authed.bytes ?? null;
      } else {
        try {
          const buf = readFileSync(resolved);
          actual = sha256(buf);
          bytes = buf.byteLength;
        } catch { actual = null; }
      }
    }

    verified[tool] = {
      resolved_path: resolved,
      actual_sha256: actual,
      actual_bytes: bytes,
      expected_sha256: want,
      expected_bytes: art?.executable_bytes ?? null,
      match: want !== null && actual === want,
      staged_path: null,
      authenticated_before_first_execution: true,
    };

    if (resolved === null) {
      failures.push(`${tool} could not be resolved on PATH; it cannot be authenticated or executed`);
      continue;
    }
    if (want === null) {
      failures.push(
        `no tracked executable digest for ${tool} on host platform '${hostPlatformKey}'; add it ` +
        'to scripts/gate/scanner-pins.json before running the gate on this platform',
      );
      continue;
    }
    if (actual !== want) {
      failures.push(
        `${tool} EXECUTABLE at ${resolved} digests to ${actual ?? '(unreadable)'}, which does not ` +
        `match the tracked ${want}. A binary that merely reports the right version is not ` +
        'authenticated — install via scripts/gate/install-scanners.sh. Refused BEFORE any ' +
        'executable code from it ran.',
      );
      continue;
    }

    // Only an AUTHENTICATED binary is staged, and only the staged copy is executed.
    const target = join(stageDir, tool);
    // §B2: staging crosses the boundary too, so the hermetic replay needs no real binary.
    if (ADAPTER.stageTool !== undefined) ADAPTER.stageTool(resolved, target);
    else copyFileSync(resolved, target);
    chmodSync(target, 0o755);
    // The staged copy is re-digested across the same boundary, so a hermetic replay proves the
    // same invariant — the bytes that will execute are the authenticated ones — without a real
    // binary. The production adapter reads and hashes the actual staged file.
    const stagedAuth = ADAPTER.authenticateTool === undefined ? null : ADAPTER.authenticateTool(tool, target);
    const stagedDigest = stagedAuth?.sha256 ?? sha256(readFileSync(target));
    if (stagedDigest !== want) {
      failures.push(`${tool}: the staged copy digests to ${stagedDigest}, not ${want}`);
      continue;
    }
    paths[tool] = target;
    verified[tool].staged_path = target;
    verified[tool].staged_sha256 = stagedDigest;
  }

  return {
    paths,
    stageDir,
    record: {
      host_platform: hostPlatformKey,
      expected,
      verified,
      staged_dir: stageDir,
      note:
        'Each scanner was resolved, digested and compared against the tracked executable ' +
        'digest BEFORE its first invocation, then staged into a private per-run directory. ' +
        'Every scan executes the staged absolute path, and the staged bytes are re-verified ' +
        'after all scanning completes.',
    },
  };
}

/** Re-verify the staged binaries after all scanner activity. */
function reverifyStagedTools(staged, failures) {
  const after = {};
  for (const [tool, path] of Object.entries(staged.paths)) {
    let digest = null;
    try {
      // Same boundary as staging: the post-scan re-verification asks whether the bytes that
      // executed are still the authenticated ones, and a hermetic replay answers it the same way.
      digest = (ADAPTER.authenticateTool === undefined ? null : ADAPTER.authenticateTool(tool, path))?.sha256
        ?? sha256(readFileSync(path));
    } catch { /* recorded as null below */ }
    const want = staged.record.expected[tool];
    after[tool] = { staged_path: path, sha256_after: digest, expected: want, match: digest === want };
    if (digest !== want) {
      failures.push(
        `${tool}: the staged executable changed during the run (now ${digest ?? '(unreadable)'}, ` +
        `expected ${want})`,
      );
    }
  }
  return after;
}

/** Read tracked evidence bytes, or null when the path is unreadable. */
function readEvidenceBytes(relative) {
  try {
    return readFileSync(join(ROOT, relative));
  } catch {
    return null;
  }
}

/** Read a governed JSON document with a precise, catchable failure. */
/**
 * C16-R3.4 §1.1: an override may be ABSOLUTE.
 *
 * `join(ROOT, '/tmp/x')` yields `/repo/tmp/x`, so an absolute override silently resolved to a
 * path that does not exist and every disposition control reported USAGE-ERROR instead of the
 * refusal it was testing. An absolute path is now taken as given, canonicalized, and required
 * to be a real regular non-symlink file. Overrides remain refused outright in --final mode,
 * before any scanner runs.
 */
function resolveGovernedPath(pathish) {
  if (!isAbsolute(pathish)) return { abs: join(ROOT, pathish), display: pathish };
  const real = realpathSync(pathish);
  return { abs: real, display: real };
}

function readGovernedJson(relative) {
  const resolved = resolveGovernedPath(relative);
  const abs = resolved.abs;
  if (isAbsolute(relative)) {
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      throw new UsageError(`${relative} does not exist`);
    }
    if (st.isSymbolicLink()) throw new UsageError(`${relative} is a SYMLINK; a governed input must be a real file`);
    if (st.isDirectory()) throw new UsageError(`${relative} is a directory, not a governed document`);
    if (!st.isFile()) throw new UsageError(`${relative} is not a regular file`);
  }
  let raw;
  try {
    raw = readFileSync(abs, 'utf8');
  } catch (e) {
    throw new UsageError(`${relative} could not be read: ${e instanceof Error ? e.message.slice(0, 160) : e}`);
  }
  try {
    return { doc: JSON.parse(raw), raw };
  } catch (e) {
    throw new UsageError(
      `${relative} is not valid JSON: ${e instanceof Error ? e.message.slice(0, 200) : e}`,
    );
  }
}

function toolVersions(stagedPaths = {}) {
  const out = {};
  const mismatches = [];
  for (const [name, spec] of Object.entries(PINNED_TOOLS)) {
    let actual = '(not installed)';
    // Execute the AUTHENTICATED staged binary when one exists for this tool.
    const exe = stagedPaths[name] ?? spec.argv[0];
    try {
      // §B2: the version probe is an EXECUTION, so it crosses the boundary like every other.
      const res = ADAPTER.execute([exe, ...spec.argv.slice(1)], { id: `version:${name}` });
      if (res.status !== 0) throw new Error(`exit ${res.status}`);
      actual = spec.extract(res.stdout);
    } catch (e) {
      actual = `(failed: ${e instanceof Error ? e.message.slice(0, 60) : String(e)})`;
    }
    out[name] = { expected: spec.expect, actual, pinned_ok: actual === spec.expect };
    if (actual !== spec.expect) mismatches.push(`${name}: expected ${spec.expect}, found ${actual}`);
  }
  return { versions: out, mismatches };
}

/** Digest-pinned images, read from docker-compose.yml — never re-typed here. */
function pinnedImages() {
  const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
  return [...compose.matchAll(/image:\s*(\S+@sha256:[a-f0-9]{64})/g)].map((m) => m[1]);
}

/**
 * Is a path tracked? In a gitless export there is no index to consult, so tracking cannot
 * be established and is not asserted — the path's existence is still required.
 */
const gitAvailable = () => safeGit(['rev-parse', '--git-dir']) !== null;
const isTracked = (rel) => {
  if (!gitAvailable()) return true;
  return spawnSync('git', ['ls-files', '--error-unmatch', rel], { cwd: ROOT, encoding: 'utf8' }).status === 0;
};

/**
 * The execution adapter for this run. Production unless a test seam replaced it — and a test
 * seam is refused outright in --final mode, before any scanning, by `assertNoTestSeams()`.
 */
let ADAPTER = null;

function run(steps, outDir, sourceSha, id, argv, opts = {}) {
  const started = new Date().toISOString();
  const t0 = Date.now();
  // Every scanner execution crosses the external-effect boundary here, and nowhere else.
  const res = ADAPTER.execute(argv, { cwd: opts.cwd ?? ROOT, env: opts.env ?? {}, id });
  const finished = new Date().toISOString();
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  writeFileSync(join(outDir, `${id}.stdout.txt`), stdout);
  writeFileSync(join(outDir, `${id}.stderr.txt`), stderr);

  const record = {
    id,
    description: opts.description ?? id,
    command: argv.join(' '),
    argv,
    cwd: opts.cwd ?? '<repo root>',
    tool: opts.tool ?? argv[0],
    tool_version: opts.toolVersion ?? null,
    coverage: opts.coverage ?? null,
    source_sha: sourceSha,
    started_at: started,
    finished_at: finished,
    duration_ms: Date.now() - t0,
    exit_code: res.status,
    signal: res.signal ?? null,
    stdout_bytes: Buffer.byteLength(stdout),
    stderr_bytes: Buffer.byteLength(stderr),
    stdout_sha256: sha256(stdout),
    stderr_sha256: sha256(stderr),
    stdout_file: `${id}.stdout.txt`,
    stderr_file: `${id}.stderr.txt`,
    policy: opts.policy ?? 'informational',
    failed: opts.policy === 'blocking' ? res.status !== 0 : false,
  };
  steps.push(record);
  const verdict = record.failed ? 'FAIL' : record.exit_code === 0 ? 'ok' : `exit ${record.exit_code} (non-blocking)`;
  console.log(`  [${verdict}] ${id}`);
  return record;
}

async function main(parsed) {
  const opts = parsed;

  // ── THE SEAM IS PROHIBITED IN FINAL MODE, BEFORE ANYTHING ELSE ─────────────────
  // Refused here, ahead of staging, acquisition and every scan, so a seeded run cannot get
  // far enough to write anything that could be mistaken for evidence.
  const seamProblems = assertNoTestSeams(parsed.final);
  if (seamProblems.length > 0) {
    for (const p of seamProblems) console.error(`::error::${p}`);
    process.exit(2);
  }
  ADAPTER = await loadAdapter();
  if (ADAPTER.kind !== 'production') {
    console.log(`  NOTE: execution adapter '${ADAPTER.kind}' is active (seams: ${activeTestSeams().join(', ')}). This run is NOT evidence.`);
  }
  // An ABSOLUTE --out must not be re-rooted under the repo (join('/repo','/tmp/x') yields
  // '/repo/tmp/x', which silently wrote gate output INTO the working tree).
  const outDir = isAbsolute(opts.out) ? resolve(opts.out) : join(ROOT, opts.out);
  mkdirSync(outDir, { recursive: true });

  const finalMode = opts.final;
  const expectedSha = opts.expectedSha;
  const cacheDir = opts.trivyCache !== null
    ? resolve(opts.trivyCache)
    : join(outDir, '.trivy-cache');

  const startedAt = new Date().toISOString();
  const runDate = startedAt.slice(0, 10);
  const steps = [];
  const failures = [];
  /** Everything known so far, so a failure manifest is always writable. */
  const state = {
    artifact: 'C15 supply-chain gate — raw execution evidence',
    started_at: startedAt,
    mode: finalMode ? 'final' : 'preliminary',
    outcome: 'INCOMPLETE',
    scan_platform: SCAN_PLATFORM,
    trivy_cache_dir: cacheDir,
    steps,
    failures,
  };

  /** ALWAYS write the manifest, then exit. A red run must remain auditable. */
  const finish = (code, extra = {}) => {
    Object.assign(state, extra);
    state.finished_at = new Date().toISOString();
    state.outcome = code === 0 ? 'PASS' : 'FAIL';
    state.summary = {
      total_steps: steps.length,
      blocking_steps: steps.filter((s) => s.policy === 'blocking').length,
      failed_steps: steps.filter((s) => s.failed).length,
      failed_ids: steps.filter((s) => s.failed).map((s) => s.id),
      blocking_problems: failures.length,
    };
    // ORDER MATTERS. The result receipt is written FIRST, then the artifact inventory is
    // calculated, then the manifest is written. Binding before writing the receipt meant
    // RESULT-PASS/FAIL.txt was never itself bound — the one file a reviewer opens first.
    writeFileSync(
      join(outDir, code === 0 ? 'RESULT-PASS.txt' : 'RESULT-FAIL.txt'),
      [
        `outcome: ${state.outcome}`,
        `source_sha: ${state.source_sha ?? '(unknown)'}`,
        `mode: ${state.mode}`,
        `steps: ${steps.length}`,
        '',
        ...failures.map((f) => `PROBLEM: ${f}`),
        '',
        ...steps.map((s) => `${s.failed ? 'FAIL' : 'ok  '} ${s.id} (exit ${s.exit_code}) ${s.command}`),
        '',
      ].join('\n'),
    );
    // EVERY raw output AND the result receipt, bound by path, size and SHA-256. The root
    // manifest is the ONE unavoidable self-exclusion: it cannot contain its own digest,
    // because writing the digest changes the bytes being digested. That exclusion is
    // explicit here and asserted by a control, so it can never quietly widen.
    state.evidence_artifacts = bindArtifacts(outDir);
    state.evidence_binding_note =
      'Every file in the output directory is bound by path, size and SHA-256, EXCEPT ' +
      'supply-chain-manifest.json itself: a manifest cannot contain its own digest. The ' +
      'isolated trivy cache and the private staged-scanner directory are also excluded — ' +
      'the cache is bound by its byte-level fingerprint and the staged binaries by their ' +
      'authenticated digests.';
    const text = `${JSON.stringify(state, null, 2)}\n`;
    writeFileSync(join(outDir, 'supply-chain-manifest.json'), text);
    if (code !== 0) {
      console.error('\n=== SUPPLY-CHAIN GATE FAILED ===');
      for (const f of failures) console.error(`  ${f}`);
      console.error(`  failure manifest: ${join(outDir, 'supply-chain-manifest.json')}`);
      console.error(`  raw diagnostics:  ${outDir}`);
    }
    process.exit(code);
  };

  // A source ARCHIVE has no .git. That is a legitimate preliminary-equivalence input, so
  // it must not crash the runner — and above all must not crash it BEFORE the failure
  // manifest is written, which is what an unguarded `git rev-parse` did.
  const sourceSha = safeGit(['rev-parse', 'HEAD']) ?? NOT_A_WORKTREE;
  const dirty = safeGit(['status', '--porcelain']);
  const haveGit = dirty !== null;
  state.source_sha = sourceSha;
  state.is_git_worktree = haveGit;
  state.tree_clean_at_run = dirty === null ? null : dirty.trim() === '';

  console.log('=== C15 SUPPLY-CHAIN GATE ===');
  console.log(`mode:        ${finalMode ? 'FINAL' : 'preliminary'}`);
  console.log(`source SHA:  ${sourceSha}`);
  console.log(`tree clean:  ${state.tree_clean_at_run}`);
  console.log(`trivy cache: ${cacheDir}`);

  // ── final-source binding ───────────────────────────────────────────────────────
  // FINAL-SOURCE BINDING. A gitless export names no commit, so it is preliminary
  // equivalence evidence only — never final source binding.
  if (finalMode) {
    if (expectedSha === null || expectedSha === undefined) {
      failures.push('--final requires --expected-sha <SHA>: final evidence must name the source it describes');
    }
    if (sourceSha === NOT_A_WORKTREE) {
      failures.push(
        'this tree is not a git worktree, so no commit can be bound; a gitless export is ' +
        'preliminary equivalence evidence only',
      );
    } else if (expectedSha !== null && expectedSha !== sourceSha) {
      failures.push(`--expected-sha ${expectedSha} does not match HEAD ${sourceSha}`);
    }
    if (dirty === null) {
      failures.push('git status could not be read; a clean worktree cannot be established');
    } else if (dirty.trim() !== '') {
      const paths = dirty.trim().split('\n');
      failures.push(`--final requires a clean worktree; ${paths.length} path(s) are dirty`);
      state.dirty_paths = paths.slice(0, 40);
    }
    if (failures.length > 0) finish(1);
  }

  // ── EXECUTED-BINARY AUTHENTICATION, BEFORE THE FIRST INVOCATION ────────────────
  // Previously the runner ran `trivy --version` and the cache acquisition BEFORE
  // authenticating the bytes, so code from an unverified binary had already executed by
  // the time the digest was checked. Now: resolve, digest, compare, STAGE a private copy,
  // and from then on execute that staged absolute path — so a later PATH change or a
  // swapped file on disk cannot substitute a different binary between check and use.
  const pinsRead = readGovernedJson('scripts/gate/scanner-pins.json');
  const pins = pinsRead.doc;
  state.scanner_pins = { file: 'scripts/gate/scanner-pins.json', sha256: sha256(pinsRead.raw) };

  const hostPlatformKey = hostPlatform();
  state.host_platform_key = hostPlatformKey;
  const staged = stageAuthenticatedTools(['trivy', 'gitleaks'], pins, hostPlatformKey, outDir, failures);
  state.executed_binary_authentication = staged.record;
  if (failures.length > 0) finish(1);

  // ── pinned toolchain, using the AUTHENTICATED staged binaries ──────────────────
  const { versions, mismatches } = toolVersions(staged.paths);
  state.pinned_toolchain = versions;
  for (const [n, v] of Object.entries(versions)) {
    console.log(`  ${v.pinned_ok ? 'pinned' : 'MISPINNED'}  ${n} = ${v.actual} (expected ${v.expected})`);
  }
  if (mismatches.length > 0) {
    for (const m of mismatches) failures.push(`toolchain not pinned — ${m}`);
    failures.push('A scan from an unknown scanner version is not evidence.');
    finish(1);
  }
  state.scanner_binaries = scannerBinaries(['pnpm', 'node', 'docker']);
  state.staged_scanner_binaries = staged.record.verified;

  // ── trivy cache: acquire BOTH artifacts, then capture and enforce provenance ────
  const TRIVY_FOR_CACHE = staged.paths.trivy;
  console.log('\n-- trivy cache acquisition (vulnerability DB + checks bundle) --');
  const acquisition = ADAPTER.acquireCache({ cacheDir, log: (m) => console.log(m), outDir, trivyPath: TRIVY_FOR_CACHE, toolVersion: versions.trivy.actual });
  state.trivy_cache_acquisition = acquisition;
  // A failed refresh must not be papered over by an older cache that happens to exist.
  for (const p of acquisition.problems ?? []) failures.push(`trivy cache acquisition — ${p}`);
  if (failures.length > 0) finish(1);

  const provenance = ADAPTER.captureProvenance({
    cacheDir, nowIso: new Date().toISOString(), platform: SCAN_PLATFORM, pins,
    trivyPath: TRIVY_FOR_CACHE,
  });
  state.trivy_provenance = provenance;
  const provProblems = enforce(provenance, {
    expectedVersion: PINNED_TOOLS.trivy.expect,
    expectedBinarySha256: staged.record.expected.trivy,
  });
  state.trivy_provenance_problems = provProblems;

  if (provenance.vulnerability_db.metadata_present) {
    console.log(`  vuln DB      built ${provenance.vulnerability_db.built_at}, ` +
      `${provenance.vulnerability_db.age_hours_at_scan}h old (limit ${provenance.freshness_window_hours}h)`);
  }
  if (provenance.checks_bundle.metadata_present) {
    console.log(`  checks       ${provenance.checks_bundle.oci_digest} (major ${provenance.checks_bundle.major_version})`);
  }
  if (provProblems.length > 0) {
    for (const p of provProblems) failures.push(`trivy provenance — ${p}`);
    finish(1);
  }

  const fpBefore = ADAPTER.cacheFingerprint(cacheDir);
  state.trivy_cache_fingerprint_before = fpBefore;
  console.log(`  cache digest ${fpBefore.digest}`);

  const FROZEN = frozenCacheArgs(cacheDir);
  const trivyEnv = { TRIVY_CACHE_DIR: cacheDir };
  /** The authenticated staged executables. Never a bare name, never a PATH lookup. */
  const TRIVY = staged.paths.trivy;
  const GITLEAKS = staged.paths.gitleaks;

  // ── governed dispositions: validate BEFORE scanning ────────────────────────────
  // ── TEST SEAM, RECORDED AND FENCED ────────────────────────────────────────────
  // The behavioural controls need to run this gate against a DEFECTIVE disposition document.
  // They previously did that by overwriting the tracked file in place and restoring it in a
  // `finally`. When a run was killed mid-test the restore never ran, and the governed document
  // was left corrupted on disk — which is exactly what happened here: one interrupted run left
  // `SCX-0001` deleted, another left `scan_platform: linux/arm64`, and every later run failed
  // with `UNGOVERNED image finding` for reasons that had nothing to do with the change under
  // test.
  //
  // The override exists so no test ever writes the tracked file. It is not a governance hole:
  // the resolved path is RECORDED in the manifest, and the final-manifest verifier requires it
  // to be exactly the tracked default — so a run that used an override can never be accepted as
  // final evidence.
  const GOVERNED_EXCLUSIONS = 'scripts/gate/scanner-exclusions.json';
  const exclusionPath = process.env.EYE_GATE_EXCLUSIONS_PATH ?? GOVERNED_EXCLUSIONS;
  const exclusionRead = readGovernedJson(exclusionPath);
  const exclusionDoc = exclusionRead.doc;
  const exclusionRaw = exclusionRead.raw;
  state.scanner_exclusions = {
    file: exclusionPath,
    canonical_path: resolveGovernedPath(exclusionPath).display,
    is_governed_default: exclusionPath === GOVERNED_EXCLUSIONS,
    sha256: sha256(exclusionRaw),
    schema_version: exclusionDoc.schema_version,
    declared: (exclusionDoc.records ?? []).length,
  };
  if (exclusionPath !== GOVERNED_EXCLUSIONS) {
    console.log(`  NOTE: dispositions read from ${exclusionPath} (override). This run is NOT final evidence.`);
  }
  const recordValidation = validateRecords(exclusionDoc, {
    runDate, root: ROOT, isTracked, readEvidence: (rel) => readEvidenceBytes(rel),
  });
  const recordProblems = recordValidation.problems;
  state.scanner_exclusion_problems = recordProblems;
  state.scanner_exclusion_fatal_indices = recordValidation.fatalIndices;
  console.log(`\n-- governed scan dispositions: ${state.scanner_exclusions.declared} records, ${recordProblems.length} rejected --`);
  if (recordProblems.length > 0) {
    for (const p of recordProblems) failures.push(`scan disposition — ${p}`);
    finish(1);
  }
  // The legacy global ignore file must not exist: a bare CVE id is unscoped suppression.
  if (existsSync(join(ROOT, '.trivyignore'))) {
    failures.push(
      '.trivyignore still exists. A bare CVE id suppresses that advisory in EVERY image and ' +
      'package; dispositions must live in scripts/gate/scanner-exclusions.json.',
    );
    finish(1);
  }

  // ── dependency vulnerabilities ────────────────────────────────────────────────
  // Identical audit level in both steps, so the JSON capture is an alternate FORMAT of
  // the blocking scan rather than extra unenforced coverage.
  // ── §A3: BIND THE SCANNED CANDIDATE ────────────────────────────────────────────
  // Computed before the first scan and recomputed after the last, so the evidence names WHICH
  // source was scanned rather than merely that something was.
  const candidateBefore = candidateSourceManifest(ROOT);
  state.candidate_source = {
    ...candidateBefore,
    expected_sha: expectedSha ?? null,
    note: 'scanners run with source-owned relative arguments from this candidate root; no '
      + 'absolute repository path appears in any argv',
  };
  if (candidateBefore.ok !== true) {
    failures.push(`candidate source — ${candidateBefore.error}`);
    finish(1);
  }
  console.log(`  candidate source ${candidateBefore.file_count} tracked files, ${candidateBefore.digest.slice(0, 16)}…`);

  console.log('\n-- dependency vulnerabilities --');
  const AUDIT_LEVEL = ['--audit-level', 'high'];
  run(steps, outDir, sourceSha, 'pnpm-audit-human', ['pnpm', 'audit', ...AUDIT_LEVEL], {
    description: 'pnpm audit, human-readable, blocking at high/critical',
    tool: 'pnpm', toolVersion: versions.pnpm.actual, policy: 'blocking',
    coverage: { audit_level: 'high' },
  });
  run(steps, outDir, sourceSha, 'pnpm-audit-json', ['pnpm', 'audit', '--json', ...AUDIT_LEVEL], {
    description: 'pnpm audit, machine-readable, SAME audit level as the blocking step',
    tool: 'pnpm', toolVersion: versions.pnpm.actual, policy: 'informational',
    coverage: { audit_level: 'high' },
  });

  // ── secret scanning ───────────────────────────────────────────────────────────
  console.log('\n-- secret scanning --');
  const gitleaksConfig = join(ROOT, '.gitleaks.toml');
  run(steps, outDir, sourceSha, 'gitleaks-worktree', [
    GITLEAKS, 'detect', '--source', '.', '--no-git', '--redact', '--config', '.gitleaks.toml',
    '--report-format', 'json', '--report-path', join(outDir, 'gitleaks-worktree.json'),
  ], {
    description: 'gitleaks over the WORKING TREE (files as they exist)',
    tool: 'gitleaks', toolVersion: versions.gitleaks.actual, policy: 'blocking',
  });
  if (haveGit) run(steps, outDir, sourceSha, 'gitleaks-history', [
    GITLEAKS, 'detect', '--source', '.', '--redact', '--config', '.gitleaks.toml',
    '--log-opts', '--all --full-history',
    '--report-format', 'json', '--report-path', join(outDir, 'gitleaks-history.json'),
  ], {
    description: 'gitleaks over the COMPLETE git history (all refs, full history)',
    tool: 'gitleaks', toolVersion: versions.gitleaks.actual, policy: 'blocking',
  });
  else console.log('  [skip] gitleaks-history — no git metadata in this tree (preliminary export)');
  state.history_scan_performed = haveGit;

  const EXCLUDED_PATHS = ['.eye-local', 'apps/web/.next'];
  const exclusionProofs = EXCLUDED_PATHS.map((p) => {
    if (!haveGit) {
      // Stated honestly: a gitless export cannot prove tracked/ignored status. The
      // allowlist proof is a git-worktree assertion and is skipped, not faked.
      console.log(`  allowlisted path ${p}: NOT PROVABLE (no git metadata in this tree)`);
      return { path: p, tracked: null, ignored: null, governed: null, reason: 'no git metadata' };
    }
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', p], { cwd: ROOT, encoding: 'utf8' });
    // The trailing slash matters. Both rules are DIRECTORY patterns (`.eye-local/`,
    // `.next/`), so `git check-ignore` cannot match them for a path that does not
    // currently exist unless it is told the path is a directory. Without it this proof
    // failed in any fresh checkout where the directories had not been created yet —
    // which is exactly the state of CI's supply-chain job.
    const ignored = spawnSync('git', ['check-ignore', '-q', `${p}/`], { cwd: ROOT, encoding: 'utf8' });
    const ok = tracked.status !== 0 && ignored.status === 0;
    console.log(`  allowlisted path ${p}: tracked=${tracked.status === 0} ignored=${ignored.status === 0} ${ok ? 'GOVERNED' : 'UNGOVERNED'}`);
    return { path: p, tracked: tracked.status === 0, ignored: ignored.status === 0, governed: ok };
  });
  state.governed_exclusions = {
    scanner: 'gitleaks',
    config: '.gitleaks.toml (extends upstream defaults; disables no rule)',
    path_exclusions: exclusionProofs,
    match_exclusions: [{
      scope: 'apps/api/migrations/*.sql',
      match: 'context_key_hash',
      reason: 'SQL COLUMN NAME in SELECT lists, not a credential; the stored value is a SHA-256 hash of a context key',
      condition: 'AND (file must be a migration AND match must be that identifier)',
    }, {
      scope: 'GATE2_2_FINAL_CLOSURE_PLAN.md @ 6d702d28252ee749b23c862f264fede060fed5df',
      match: 'replacement/reuse/invalidation',
      reason: 'ENGLISH PROSE naming three nullable columns, not a credential; the working tree was reworded, so this covers one historical commit only',
      condition: 'AND (commit AND file AND match)',
    }, {
      scope: 'repository-wide, one exact literal',
      match: 'token=dG9rZW4tMjAxNw',
      reason: 'PUBLISHED URL PARAMETER of the anonymous EU Financial Sanctions Files open-data endpoint, printed in the EU Open Data Portal metadata and the public RSS feed; it authenticates nobody and decodes to the ASCII string "token-2017". PHASE1_PLAN §8.1 URL-query redaction strips it from logs, events and audit metadata regardless of this exclusion',
      condition: 'match must be that exact literal; every other token= value and every other rule stay in scope',
    }],
  };
  const ungoverned = exclusionProofs.filter((p) => p.governed === false);
  if (ungoverned.length > 0) {
    for (const p of ungoverned) {
      failures.push(`${p.path} is allowlisted for secret scanning but is TRACKED or NOT IGNORED`);
    }
    finish(1);
  }

  // ── filesystem vulnerabilities ────────────────────────────────────────────────
  // Both steps share severity, scanners, target, ignore semantics and cache; only
  // --format differs, so the JSON capture adds no unenforced coverage.
  console.log('\n-- filesystem vulnerabilities --');
  const FS_COVERAGE = {
    scanners: 'vuln,secret,misconfig', severity: 'HIGH,CRITICAL',
    target: '<repo root>', ignorefile: 'none', cache: 'captured',
  };
  const FS_ARGS = [
    'fs', '--scanners', 'vuln,secret,misconfig', '--severity', 'HIGH,CRITICAL',
    '--ignorefile', '/dev/null', ...FROZEN, '--no-progress',
  ];
  run(steps, outDir, sourceSha, 'trivy-fs', [TRIVY, ...FS_ARGS, '--exit-code', '1', '--format', 'table', '.'], {
    description: 'trivy filesystem scan, blocking at HIGH/CRITICAL',
    tool: 'trivy', toolVersion: versions.trivy.actual, policy: 'blocking',
    coverage: FS_COVERAGE, env: trivyEnv,
  });
  run(steps, outDir, sourceSha, 'trivy-fs-json', [TRIVY, ...FS_ARGS, '--format', 'json', '.'], {
    description: 'trivy filesystem scan, machine-readable, IDENTICAL coverage to the blocking step',
    tool: 'trivy', toolVersion: versions.trivy.actual, policy: 'informational',
    coverage: FS_COVERAGE, env: trivyEnv,
  });

  // ── pinned image vulnerabilities, reconciled against governed dispositions ─────
  console.log('\n-- pinned image vulnerabilities --');
  const images = pinnedImages();
  if (images.length === 0) {
    failures.push('no digest-pinned images found in docker-compose.yml');
    finish(1);
  }

  const imageResolutions = images.map((image, index) => {
    const resolution = ADAPTER.resolveImage(image, SCAN_PLATFORM);
    // C16-R3.4.1 §A1: WRITE AND BIND THE RAW INDEX BYTES. Without them a verifier can only
    // re-read the producer's own summary of the index, so replacing the child digest, the
    // scan reference and the argv together was self-consistent and accepted. With the bytes
    // shipped, the child is derived independently and the summary is checked against it.
    const indexFile = `oci-index-${index}.json`;
    if (typeof resolution.index_raw_bytes === 'string') {
      writeFileSync(join(outDir, indexFile), resolution.index_raw_bytes);
    }
    const scanRef = platformPinnedRef(image, resolution);
    console.log(`  ${image}`);
    if (!resolution.resolved) console.log(`    UNRESOLVED: ${resolution.error}`);
    else if (resolution.kind === 'index') {
      console.log(`    index with ${resolution.child_count} children (${resolution.runnable_platform_count} runnable)`);
      console.log(`    ${SCAN_PLATFORM} child: ${resolution.target_digest ?? 'ABSENT'}`);
    } else console.log('    single-platform manifest; the pinned digest is the image');
    // The raw index bytes must hash to the digest in the configured reference. Without
    // this, a substituted index could hand us any child digest and the gate would scan
    // whatever it was given while still claiming to have scanned the pinned reference.
    const pinnedDigest = image.slice(image.indexOf('@') + 1);
    const rawMatches = resolution.index_raw_sha256 !== undefined &&
      `sha256:${resolution.index_raw_sha256}` === pinnedDigest;
    if (resolution.resolved) {
      console.log(`    raw index digest ${rawMatches ? 'MATCHES' : 'DOES NOT MATCH'} the pinned reference`);
    }
    return {
      pinned_ref: image,
      scan_ref: scanRef,
      pinned_digest: pinnedDigest,
      raw_index_file: indexFile,
      raw_index_digest: resolution.index_raw_sha256 === undefined ? null : `sha256:${resolution.index_raw_sha256}`,
      raw_index_digest_matches_reference: rawMatches,
      resolution: { ...resolution, index_raw_bytes: undefined },
    };
  });
  state.image_platform_resolution = imageResolutions;
  state.digest_pinned_images = images;

  for (const r of imageResolutions) {
    if (r.resolution.resolved && !r.raw_index_digest_matches_reference) {
      failures.push(
        `${r.pinned_ref}: the raw index manifest hashes to ${r.raw_index_digest}, which does not ` +
        `equal the digest in the configured reference (${r.pinned_digest}). No child digest from ` +
        'this response can be trusted.',
      );
    }
  }
  if (failures.length > 0) finish(1);

  const unresolvable = imageResolutions.filter((r) => r.scan_ref === null);
  if (unresolvable.length > 0) {
    for (const r of unresolvable) {
      failures.push(
        `${r.pinned_ref}: cannot resolve a ${SCAN_PLATFORM} child manifest ` +
        `(${r.resolution.error ?? 'platform absent from the index'})`,
      );
    }
    failures.push('A scan that cannot name the manifest it examined is not evidence.');
    finish(1);
  }

  const allFindings = [];
  imageResolutions.forEach((r, i) => {
    // UNSUPPRESSED scan: the complete finding set, reconciled below against governed
    // records. Trivy's own ignore mechanism is never relied upon.
    const rec = run(steps, outDir, sourceSha, `trivy-image-${i}`, [
      // R3.4.4: the scanner set is DECLARED rather than left to the tool's default, so the
      // argv contract and the stderr receipt can both be checked against it.
      TRIVY, 'image', '--platform', SCAN_PLATFORM, '--scanners', 'vuln,secret',
      '--severity', 'HIGH,CRITICAL',
      '--ignorefile', '/dev/null', ...FROZEN, '--no-progress', '--format', 'json', r.scan_ref,
    ], {
      description:
        `trivy scan of the ${SCAN_PLATFORM} child manifest ${r.resolution.target_digest} ` +
        `resolved from digest-pinned index ${r.pinned_ref}, with NO suppression`,
      tool: 'trivy', toolVersion: versions.trivy.actual, policy: 'blocking',
      coverage: {
        severity: 'HIGH,CRITICAL', ignorefile: 'none', cache: 'captured',
        platform: SCAN_PLATFORM, scanners: 'vuln,secret',
      },
      env: trivyEnv,
    });
    // A NONZERO EXIT ALWAYS BLOCKS. The image command deliberately omits `--exit-code`,
    // so findings alone return zero; any nonzero status is therefore a SCANNER FAILURE, not
    // a finding. The previous `rec.failed = false` discarded that unconditionally, so a
    // crashed or partially-written scan could look like a clean pass as long as its stdout
    // happened to parse. Parseable output is not evidence that the scan completed.
    rec.policy_note =
      'the image command omits --exit-code, so findings return zero; any nonzero exit is a ' +
      'scanner failure and always blocks, regardless of whether stdout parses';
    if (rec.exit_code !== 0) {
      failures.push(
        `${rec.id}: trivy exited ${rec.exit_code}. The image command uses no --exit-code, so a ` +
        `nonzero status is a scanner failure, not a finding. Raw output preserved in ` +
        `${rec.stdout_file} (sha256 ${rec.stdout_sha256}) and ${rec.stderr_file} ` +
        `(sha256 ${rec.stderr_sha256}).`,
      );
      return;   // do not ingest findings from a run that did not complete
    }
    try {
      const text = readFileSync(join(outDir, `${rec.id}.stdout.txt`), 'utf8');
      allFindings.push(...findingsFromTrivyJson(text, r.pinned_ref));
    } catch (e) {
      failures.push(`${rec.id}: could not parse the trivy JSON report (${e instanceof Error ? e.message.slice(0, 120) : e})`);
    }
  });
  if (failures.length > 0) finish(1);

  const disposition = reconcileFindings(exclusionDoc, allFindings, {
    scanPlatform: SCAN_PLATFORM, fatalIndices: recordValidation.fatalIndices,
  });
  state.image_finding_reconciliation = disposition;
  writeFileSync(join(outDir, 'image-findings.json'), `${JSON.stringify(allFindings, null, 2)}\n`);
  console.log(`  findings ${disposition.total_findings}, governed ${disposition.matched.length} record(s), ` +
    `unmatched ${disposition.unmatched.length}, unused ${disposition.unused_records.length}`);

  for (const f of disposition.unmatched) {
    failures.push(`UNGOVERNED image finding: ${f}`);
  }
  for (const id of disposition.unused_records) {
    failures.push(`UNUSED scan disposition '${id}': it matched no finding, so it is stale`);
  }
  for (const s of disposition.stale_advisory_ids) {
    failures.push(`STALE advisory id in a disposition (matched nothing): ${s}`);
  }
  // Near misses are recorded so a reviewer can see WHY a record failed to govern a
  // finding — platform, severity, target or installed version — rather than only that it did.
  for (const d of disposition.near_miss_detail ?? []) {
    console.log(`  near-miss: ${d}`);
  }

  // ── cache equality: the authoritative scans updated nothing ────────────────────
  const fpAfter = ADAPTER.cacheFingerprint(cacheDir);
  state.trivy_cache_fingerprint_after = fpAfter;
  state.trivy_cache_unchanged = fpAfter.digest === fpBefore.digest;
  console.log(`\ntrivy cache after scans: ${fpAfter.digest} (${state.trivy_cache_unchanged ? 'UNCHANGED' : 'CHANGED'})`);
  if (!state.trivy_cache_unchanged) {
    failures.push(
      `trivy cache changed during the authoritative scans (${fpBefore.digest} -> ${fpAfter.digest}); ` +
      'the scans must run with --skip-db-update --skip-check-update against the captured cache',
    );
  }

  // ── post-scan integrity: staged binaries unchanged, worktree still clean ───────
  state.staged_tools_after_scanning = reverifyStagedTools(staged, failures);
  // The scanners must not MODIFY the source they examine, so the comparison is a DELTA
  // against the state recorded before scanning — not absolute cleanliness. In preliminary
  // mode the tree may legitimately start dirty (uncommitted work); what must not happen is
  // that scanning changes it, because then the evidence would not describe the tree that
  // was scanned. Final mode separately requires the tree to start clean.
  const dirtyAfter = safeGit(['status', '--porcelain']);
  const beforeSet = (dirty ?? '').trim();
  const afterSet = (dirtyAfter ?? '').trim();
  state.tree_clean_after_scanning = dirtyAfter === null ? null : afterSet === '';
  state.worktree_unchanged_by_scanning = dirtyAfter === null ? null : afterSet === beforeSet;

  // §A3: recompute the candidate manifest and require exact equality. A worktree that is
  // "clean" by git's account can still have had tracked bytes swapped and swapped back, or
  // swapped by something git does not report; this compares the bytes themselves.
  const candidateAfter = candidateSourceManifest(ROOT);
  state.candidate_source_after = candidateAfter;
  const candidateProblems = manifestProblems(candidateBefore, candidateAfter);
  for (const p of candidateProblems) failures.push(`candidate source — ${p}`);
  if (haveGit && dirtyAfter !== null && afterSet !== beforeSet) {
    const before = new Set(beforeSet === '' ? [] : beforeSet.split('\n'));
    const appeared = (afterSet === '' ? [] : afterSet.split('\n')).filter((l) => !before.has(l));
    state.paths_changed_by_scanning = appeared.slice(0, 40);
    failures.push(
      `scanning CHANGED the worktree (${appeared.length} path(s) appeared or changed, e.g. ` +
      `${appeared.slice(0, 3).join(' | ')}); the evidence would not describe the source that ` +
      'was scanned',
    );
  }

  // ── step-policy audit ─────────────────────────────────────────────────────────
  const policyAudit = classifyStepPolicies(steps);
  state.step_policy_audit = {
    ...policyAudit,
    note:
      'The two non-blocking steps are alternate-FORMAT captures of scans that already ran ' +
      'under a blocking policy with the same pinned tool AND identical severity, scanner, ' +
      'target, ignore and cache semantics. They add no coverage that is not also enforced.',
  };
  if (!policyAudit.every_informational_step_duplicates_a_blocking_step) {
    for (const p of policyAudit.unblocked_coverage_problems) failures.push(`step policy — ${p}`);
  }
  // Coverage equivalence must be literal, not asserted.
  for (const c of policyAudit.informational_classification) {
    const a = steps.find((s) => s.id === c.id);
    const b = steps.find((s) => s.id === c.duplicates_blocking_step);
    if (a?.coverage !== null && b?.coverage !== null &&
        JSON.stringify(a?.coverage) !== JSON.stringify(b?.coverage)) {
      failures.push(
        `step '${c.id}' claims to duplicate '${c.duplicates_blocking_step}' but their coverage ` +
        `differs: ${JSON.stringify(a?.coverage)} vs ${JSON.stringify(b?.coverage)}`,
      );
    }
  }

  const failedSteps = steps.filter((s) => s.failed);
  for (const s of failedSteps) {
    failures.push(`${s.id} exited ${s.exit_code} — see ${s.stdout_file} / ${s.stderr_file}`);
  }

  console.log(`\nsteps: ${steps.length} (blocking: ${steps.filter((s) => s.policy === 'blocking').length}, ` +
    `non-blocking: ${policyAudit.informational_steps} — each an alternate output format with identical coverage)`);
  console.log(`raw outputs + manifest: ${outDir}`);

  if (failures.length > 0) finish(1);
  console.log('\nsupply-chain gate: PASS');
  finish(0);
}

/**
 * OUTERMOST EXCEPTION BOUNDARY.
 *
 * `finish()` handles every EXPECTED failure. This handles the unexpected ones — a malformed
 * argument, an unreadable governed document, an internal fault — and always attempts to
 * leave auditable artifacts behind. Without it, `--trivy-cache` with no value threw a
 * TypeError before any output directory existed and the run produced NOTHING: a red gate
 * with no evidence of why.
 *
 * Nothing here can throw on the failure path: every step is individually guarded, so a
 * secondary fault cannot destroy the primary diagnosis.
 */
function emergencyManifest(outArg, parsedOrNull, error) {
  const kind = error instanceof UsageError ? 'USAGE' : 'INTERNAL';
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  let sourceSha = '(unavailable)';
  try {
    sourceSha = safeGit(['rev-parse', 'HEAD']) ?? NOT_A_WORKTREE;
  } catch { /* recorded as unavailable */ }

  let outDir = null;
  try {
    const candidate = outArg ?? 'evidence/supply-chain';
    outDir = isAbsolute(candidate) ? resolve(candidate) : join(ROOT, candidate);
    mkdirSync(outDir, { recursive: true });
  } catch {
    outDir = null;
  }

  const record = {
    artifact: 'C15 supply-chain gate — raw execution evidence',
    outcome: kind === 'USAGE' ? 'USAGE-ERROR' : 'CRASH',
    evidence_binding_note:
      'Every file present in the output directory is bound, EXCEPT ' +
      'supply-chain-manifest.json itself (a manifest cannot contain its own digest).',
    exception: { type: kind, name: error?.constructor?.name ?? 'Error', message: message.slice(0, 800) },
    source_sha: sourceSha,
    arguments: process.argv.slice(2),
    parsed_arguments: parsedOrNull,
    finished_at: new Date().toISOString(),
    failures: [`${kind.toLowerCase()} error: ${message.slice(0, 400)}`],
    evidence_artifacts: [],
  };
  if (outDir !== null) {
    // Receipt FIRST, then bind, so the receipt itself is inventoried even on the crash path.
    try {
      writeFileSync(join(outDir, 'RESULT-FAIL.txt'), [
        `outcome: ${record.outcome}`,
        `exception: ${kind} ${record.exception.name}`,
        `message: ${message}`,
        `source_sha: ${sourceSha}`,
        `arguments: ${process.argv.slice(2).join(' ')}`,
        `timestamp: ${record.finished_at}`,
        '',
        stack,
        '',
      ].join('\n'));
    } catch { /* nothing further can be recorded */ }
    try { record.evidence_artifacts = bindArtifacts(outDir); } catch { /* best effort */ }
    try {
      writeFileSync(join(outDir, 'supply-chain-manifest.json'), `${JSON.stringify(record, null, 2)}\n`);
    } catch { /* nothing further can be recorded */ }
  }
  console.error(`\n=== SUPPLY-CHAIN GATE ${record.outcome} ===`);
  console.error(`  ${kind}: ${message}`);
  if (outDir !== null) console.error(`  failure manifest: ${join(outDir, 'supply-chain-manifest.json')}`);
  else console.error('  no output directory could be created; nothing could be written');
}

let parsedArgs = null;
try {
  parsedArgs = parseArgs(process.argv);
  await main(parsedArgs);
} catch (e) {
  // Recover the --out value even when parsing itself failed, so the diagnosis still lands
  // where the caller expects it.
  const i = process.argv.indexOf('--out');
  const outArg = i !== -1 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : null;
  emergencyManifest(outArg, parsedArgs, e);
  process.exit(1);
}
