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
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Recorded when the tree carries no git metadata (a source archive). */
const NOT_A_WORKTREE = '(not a git worktree)';

/** git, but tolerant of a gitless export: returns null instead of throwing. */
function safeGit(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return res.status === 0 ? res.stdout : null;
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

function toolVersions() {
  const out = {};
  const mismatches = [];
  for (const [name, spec] of Object.entries(PINNED_TOOLS)) {
    let actual = '(not installed)';
    try {
      actual = spec.extract(execFileSync(spec.argv[0], spec.argv.slice(1), { encoding: 'utf8' }));
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

function run(steps, outDir, sourceSha, id, argv, opts = {}) {
  const started = new Date().toISOString();
  const t0 = Date.now();
  const res = spawnSync(argv[0], argv.slice(1), {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
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

function main() {
  const argv = process.argv;
  const outIdx = argv.indexOf('--out');
  // An ABSOLUTE --out must not be re-rooted under the repo (join('/repo','/tmp/x') yields
  // '/repo/tmp/x', which silently wrote gate output INTO the working tree).
  const outArg = outIdx !== -1 ? argv[outIdx + 1] : 'evidence/supply-chain';
  const outDir = isAbsolute(outArg) ? resolve(outArg) : join(ROOT, outArg);
  mkdirSync(outDir, { recursive: true });

  const finalMode = argv.includes('--final');
  const shaIdx = argv.indexOf('--expected-sha');
  const expectedSha = shaIdx !== -1 ? argv[shaIdx + 1] : null;
  const cacheIdx = argv.indexOf('--trivy-cache');
  const cacheDir = cacheIdx !== -1
    ? resolve(argv[cacheIdx + 1])
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
    const text = `${JSON.stringify(state, null, 2)}\n`;
    writeFileSync(join(outDir, 'supply-chain-manifest.json'), text);
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
  state.tree_clean_at_run = dirty === null ? null : dirty === '';

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
    } else if (dirty !== '') {
      failures.push(`--final requires a clean worktree; ${dirty.split('\n').length} path(s) are dirty`);
      state.dirty_paths = dirty.split('\n').slice(0, 40);
    }
    if (failures.length > 0) finish(1);
  }

  // ── pinned toolchain, before any scan ──────────────────────────────────────────
  const { versions, mismatches } = toolVersions();
  state.pinned_toolchain = versions;
  for (const [n, v] of Object.entries(versions)) {
    console.log(`  ${v.pinned_ok ? 'pinned' : 'MISPINNED'}  ${n} = ${v.actual} (expected ${v.expected})`);
  }
  if (mismatches.length > 0) {
    for (const m of mismatches) failures.push(`toolchain not pinned — ${m}`);
    failures.push('A scan from an unknown scanner version is not evidence.');
    finish(1);
  }
  state.scanner_binaries = scannerBinaries(['pnpm', 'node', 'gitleaks', 'trivy', 'docker']);

  // ── trivy cache: acquire BOTH artifacts, then capture and enforce provenance ────
  const pins = loadPins(ROOT);
  state.scanner_pins = { file: 'scripts/gate/scanner-pins.json', sha256: sha256(readFileSync(join(ROOT, 'scripts/gate/scanner-pins.json'))) };

  console.log('\n-- trivy cache acquisition (vulnerability DB + checks bundle) --');
  const acquisition = acquire({ cacheDir, log: (m) => console.log(m) });
  state.trivy_cache_acquisition = acquisition;

  const provenance = capture({
    cacheDir, nowIso: new Date().toISOString(), platform: SCAN_PLATFORM, pins,
  });
  state.trivy_provenance = provenance;
  const provProblems = enforce(provenance, { expectedVersion: PINNED_TOOLS.trivy.expect });
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

  const fpBefore = fingerprint(cacheDir);
  state.trivy_cache_fingerprint_before = fpBefore;
  console.log(`  cache digest ${fpBefore.digest}`);

  const FROZEN = frozenCacheArgs(cacheDir);
  const trivyEnv = { TRIVY_CACHE_DIR: cacheDir };

  // ── governed dispositions: validate BEFORE scanning ────────────────────────────
  const { doc: exclusionDoc, raw: exclusionRaw, path: exclusionPath } = loadScannerExclusions(ROOT);
  state.scanner_exclusions = {
    file: exclusionPath,
    sha256: sha256(exclusionRaw),
    schema_version: exclusionDoc.schema_version,
    declared: (exclusionDoc.records ?? []).length,
  };
  const recordProblems = validateRecords(exclusionDoc, { runDate, root: ROOT, isTracked });
  state.scanner_exclusion_problems = recordProblems;
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
    'gitleaks', 'detect', '--source', ROOT, '--no-git', '--redact', '--config', gitleaksConfig,
    '--report-format', 'json', '--report-path', join(outDir, 'gitleaks-worktree.json'),
  ], {
    description: 'gitleaks over the WORKING TREE (files as they exist)',
    tool: 'gitleaks', toolVersion: versions.gitleaks.actual, policy: 'blocking',
  });
  if (haveGit) run(steps, outDir, sourceSha, 'gitleaks-history', [
    'gitleaks', 'detect', '--source', ROOT, '--redact', '--config', gitleaksConfig,
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
    const ignored = spawnSync('git', ['check-ignore', '-q', p], { cwd: ROOT, encoding: 'utf8' });
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
  run(steps, outDir, sourceSha, 'trivy-fs', ['trivy', ...FS_ARGS, '--exit-code', '1', '--format', 'table', ROOT], {
    description: 'trivy filesystem scan, blocking at HIGH/CRITICAL',
    tool: 'trivy', toolVersion: versions.trivy.actual, policy: 'blocking',
    coverage: FS_COVERAGE, env: trivyEnv,
  });
  run(steps, outDir, sourceSha, 'trivy-fs-json', ['trivy', ...FS_ARGS, '--format', 'json', ROOT], {
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

  const imageResolutions = images.map((image) => {
    const resolution = resolveImageIndex(image, SCAN_PLATFORM);
    const scanRef = platformPinnedRef(image, resolution);
    console.log(`  ${image}`);
    if (!resolution.resolved) console.log(`    UNRESOLVED: ${resolution.error}`);
    else if (resolution.kind === 'index') {
      console.log(`    index with ${resolution.child_count} children (${resolution.runnable_platform_count} runnable)`);
      console.log(`    ${SCAN_PLATFORM} child: ${resolution.target_digest ?? 'ABSENT'}`);
    } else console.log('    single-platform manifest; the pinned digest is the image');
    return { pinned_ref: image, scan_ref: scanRef, resolution };
  });
  state.image_platform_resolution = imageResolutions;
  state.digest_pinned_images = images;

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
      'trivy', 'image', '--platform', SCAN_PLATFORM, '--severity', 'HIGH,CRITICAL',
      '--ignorefile', '/dev/null', ...FROZEN, '--no-progress', '--format', 'json', r.scan_ref,
    ], {
      description:
        `trivy scan of the ${SCAN_PLATFORM} child manifest ${r.resolution.target_digest} ` +
        `resolved from digest-pinned index ${r.pinned_ref}, with NO suppression`,
      tool: 'trivy', toolVersion: versions.trivy.actual, policy: 'blocking',
      coverage: { severity: 'HIGH,CRITICAL', ignorefile: 'none', cache: 'captured', platform: SCAN_PLATFORM },
      env: trivyEnv,
    });
    // Exit code is not the verdict here: findings are expected and governed. Only a
    // scanner ERROR is a step failure.
    rec.failed = false;
    rec.policy_note = 'findings are reconciled against governed dispositions, not suppressed';
    try {
      const text = readFileSync(join(outDir, `${rec.id}.stdout.txt`), 'utf8');
      allFindings.push(...findingsFromTrivyJson(text, r.pinned_ref));
    } catch (e) {
      failures.push(`${rec.id}: could not parse the trivy JSON report (${e instanceof Error ? e.message.slice(0, 120) : e})`);
    }
  });
  if (failures.length > 0) finish(1);

  const disposition = reconcileFindings(exclusionDoc, allFindings);
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

  // ── cache equality: the authoritative scans updated nothing ────────────────────
  const fpAfter = fingerprint(cacheDir);
  state.trivy_cache_fingerprint_after = fpAfter;
  state.trivy_cache_unchanged = fpAfter.digest === fpBefore.digest;
  console.log(`\ntrivy cache after scans: ${fpAfter.digest} (${state.trivy_cache_unchanged ? 'UNCHANGED' : 'CHANGED'})`);
  if (!state.trivy_cache_unchanged) {
    failures.push(
      `trivy cache changed during the authoritative scans (${fpBefore.digest} -> ${fpAfter.digest}); ` +
      'the scans must run with --skip-db-update --skip-check-update against the captured cache',
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

main();
