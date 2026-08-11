/**
 * C15 — REPRODUCIBLE SUPPLY-CHAIN RUNNER.
 *
 * Executes the real scanners and captures, for EVERY execution: the exact argv, the
 * tool and its version, start/finish timestamps, the source SHA, the exit code and
 * the complete raw stdout/stderr. Nothing here is summarised — the raw bytes are
 * written to disk and digested, so the evidence can be re-read rather than trusted.
 *
 * TOOLS ARE PINNED. Each tool's version is verified BEFORE any scan runs and the
 * whole gate fails closed on a mismatch: a scan from an unknown scanner version is
 * not evidence, because the finding set is version-dependent.
 *
 * Exit code is non-zero if any tool is mis-pinned, any required scan fails its
 * policy, or any expected artifact is missing.
 *
 * Usage:
 *   node scripts/gate/supply-chain.mjs [--out evidence/supply-chain]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveImageIndex, platformPinnedRef, scannerBinaries, trivyDatabase, classifyStepPolicies,
  enforceTrivyDatabase, MAX_VULN_DB_AGE_HOURS,
} from './lib/scanner-provenance.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The platform the deployable target actually runs on (CI is ubuntu-latest; the C16
 * target descriptor resolves linux/x64/glibc). Container scans are pinned to the
 * matching index child so the scan is not silently host-dependent.
 */
const SCAN_PLATFORM = 'linux/amd64';

/**
 * PINNED TOOLCHAIN. `probe` extracts the version; `expect` is the exact required
 * value. Update deliberately — never to make a run pass.
 */
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

function run(steps, outDir, sourceSha, id, argv, opts = {}) {
  const started = new Date().toISOString();
  const t0 = Date.now();
  const res = spawnSync(argv[0], argv.slice(1), {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  const finished = new Date().toISOString();
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  const outFile = join(outDir, `${id}.stdout.txt`);
  const errFile = join(outDir, `${id}.stderr.txt`);
  writeFileSync(outFile, stdout);
  writeFileSync(errFile, stderr);

  const record = {
    id,
    description: opts.description ?? id,
    command: argv.join(' '),
    argv,
    cwd: opts.cwd ?? '<repo root>',
    tool: opts.tool ?? argv[0],
    tool_version: opts.toolVersion ?? null,
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
    // A step is a gate FAILURE only when its policy says the exit code matters.
    failed: opts.policy === 'blocking' ? res.status !== 0 : false,
  };
  steps.push(record);
  const verdict = record.failed ? 'FAIL' : record.exit_code === 0 ? 'ok' : `exit ${record.exit_code} (non-blocking)`;
  console.log(`  [${verdict}] ${id} — ${record.command}`);
  return record;
}

function main() {
  const outIdx = process.argv.indexOf('--out');
  // An ABSOLUTE --out must not be re-rooted under the repo (join('/repo','/tmp/x')
  // yields '/repo/tmp/x', which silently wrote gate output INTO the working tree).
  const outArg = outIdx !== -1 ? process.argv[outIdx + 1] : 'evidence/supply-chain';
  const outDir = isAbsolute(outArg) ? outArg : join(ROOT, outArg);
  mkdirSync(outDir, { recursive: true });

  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const treeClean =
    execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() === '';

  const finalMode = process.argv.includes('--final');

  console.log('=== C15 SUPPLY-CHAIN GATE ===');
  console.log(`mode:        ${finalMode ? 'FINAL (clean worktree required)' : 'preliminary'}`);
  console.log(`source SHA:  ${sourceSha}`);
  console.log(`tree clean:  ${treeClean}`);

  // Final evidence must be reproducible from a committed SHA. A scan of uncommitted
  // source cannot be re-run by a reviewer, so it is not evidence.
  if (finalMode && !treeClean) {
    console.error('\n=== SUPPLY-CHAIN GATE FAILED: --final requires a clean worktree ===');
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
    for (const line of dirty.split('\n').slice(0, 20)) console.error(`  ${line}`);
    process.exit(1);
  }

  const { versions, mismatches } = toolVersions();
  for (const [n, v] of Object.entries(versions)) {
    console.log(`  ${v.pinned_ok ? 'pinned' : 'MISPINNED'}  ${n} = ${v.actual} (expected ${v.expected})`);
  }
  if (mismatches.length > 0) {
    console.error('\n=== SUPPLY-CHAIN GATE FAILED: toolchain is not pinned ===');
    for (const m of mismatches) console.error(`  ${m}`);
    console.error('A scan from an unknown scanner version is not evidence.');
    process.exit(1);
  }

  // ENFORCE the vulnerability-database contract BEFORE scanning. Recording DB identity
  // without acting on it means a scan against an absent or stale database still reports
  // "ok" -- it simply finds nothing.
  const scanStartedAt = new Date().toISOString();
  const vulnDb = trivyDatabase(scanStartedAt);
  const dbProblems = enforceTrivyDatabase(vulnDb, MAX_VULN_DB_AGE_HOURS);
  if (vulnDb.available) {
    console.log(`  vuln DB     built ${vulnDb.vulnerability_db.built_at}, ` +
      `${vulnDb.vulnerability_db.age_hours_at_scan}h old (limit ${MAX_VULN_DB_AGE_HOURS}h), ` +
      `past-due=${vulnDb.vulnerability_db.past_next_update_at_scan}`);
  }
  if (dbProblems.length > 0) {
    console.error('\n=== SUPPLY-CHAIN GATE FAILED: vulnerability database rejected ===');
    for (const p of dbProblems) console.error(`  ${p}`);
    console.error('  Run `trivy image --download-db-only` and re-run the gate.');
    process.exit(1);
  }

  const steps = [];
  const R = (id, argv, opts) => run(steps, outDir, sourceSha, id, argv, opts);

  console.log('\n-- dependency vulnerabilities --');
  R('pnpm-audit-human', ['pnpm', 'audit', '--audit-level', 'high'], {
    description: 'pnpm audit, human-readable, blocking at high/critical',
    tool: 'pnpm', toolVersion: versions.pnpm.actual, policy: 'blocking',
  });
  R('pnpm-audit-json', ['pnpm', 'audit', '--json'], {
    description: 'pnpm audit, machine-readable full advisory set',
    tool: 'pnpm', toolVersion: versions.pnpm.actual, policy: 'informational',
  });

  console.log('\n-- secret scanning --');
  // The governed config NARROWS scope (see .gitleaks.toml); it disables no rule.
  const gitleaksConfig = join(ROOT, '.gitleaks.toml');
  R('gitleaks-worktree', [
    'gitleaks', 'detect', '--source', ROOT, '--no-git', '--redact', '--config', gitleaksConfig,
    '--report-format', 'json', '--report-path', join(outDir, 'gitleaks-worktree.json'),
  ], {
    description: 'gitleaks over the WORKING TREE (files as they exist)',
    tool: 'gitleaks', toolVersion: versions.gitleaks.actual, policy: 'blocking',
  });
  R('gitleaks-history', [
    'gitleaks', 'detect', '--source', ROOT, '--redact', '--config', gitleaksConfig,
    '--log-opts', '--all --full-history',
    '--report-format', 'json', '--report-path', join(outDir, 'gitleaks-history.json'),
  ], {
    description: 'gitleaks over the COMPLETE git history (all refs, full history)',
    tool: 'gitleaks', toolVersion: versions.gitleaks.actual, policy: 'blocking',
  });

  // A path may only be allowlisted if git genuinely cannot carry it. Proven here,
  // so the exclusion can never conceal a COMMITTED secret.
  const EXCLUDED_PATHS = ['.eye-local', 'apps/web/.next'];
  const exclusionProofs = EXCLUDED_PATHS.map((p) => {
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', p], { cwd: ROOT, encoding: 'utf8' });
    const ignored = spawnSync('git', ['check-ignore', '-q', p], { cwd: ROOT, encoding: 'utf8' });
    const ok = tracked.status !== 0 && ignored.status === 0;
    console.log(`  allowlisted path ${p}: tracked=${tracked.status === 0} ignored=${ignored.status === 0} ${ok ? 'GOVERNED' : 'UNGOVERNED'}`);
    return { path: p, tracked: tracked.status === 0, ignored: ignored.status === 0, governed: ok };
  });
  const ungoverned = exclusionProofs.filter((p) => !p.governed);
  if (ungoverned.length > 0) {
    console.error('\n=== SUPPLY-CHAIN GATE FAILED ===');
    for (const p of ungoverned) {
      console.error(`  ${p.path} is allowlisted for secret scanning but is TRACKED or NOT IGNORED.`);
    }
    console.error('  A path allowlist may only cover a path git cannot carry.');
    process.exit(1);
  }

  console.log('\n-- filesystem vulnerabilities --');
  R('trivy-fs', [
    'trivy', 'fs', '--scanners', 'vuln,secret,misconfig', '--severity', 'HIGH,CRITICAL',
    '--exit-code', '1', '--no-progress', '--format', 'table', ROOT,
  ], {
    description: 'trivy filesystem scan, blocking at HIGH/CRITICAL',
    tool: 'trivy', toolVersion: versions.trivy.actual, policy: 'blocking',
  });
  R('trivy-fs-json', [
    'trivy', 'fs', '--scanners', 'vuln,secret,misconfig', '--no-progress',
    '--format', 'json', ROOT,
  ], {
    description: 'trivy filesystem scan, complete machine-readable findings',
    tool: 'trivy', toolVersion: versions.trivy.actual, policy: 'informational',
  });

  console.log('\n-- pinned image vulnerabilities --');
  const images = pinnedImages();
  if (images.length === 0) {
    console.error('no digest-pinned images found in docker-compose.yml');
    process.exit(1);
  }

  // The compose pins are OCI image INDEXES. Resolve each to the exact child manifest
  // for the deployment platform, and scan THAT digest — otherwise the scan silently
  // follows the host architecture and the evidence cannot say what it examined.
  const imageResolutions = images.map((image) => {
    const resolution = resolveImageIndex(image, SCAN_PLATFORM);
    const scanRef = platformPinnedRef(image, resolution);
    console.log(`  ${image}`);
    if (!resolution.resolved) {
      console.log(`    UNRESOLVED: ${resolution.error}`);
    } else if (resolution.kind === 'index') {
      console.log(`    index with ${resolution.child_count} children (${resolution.runnable_platform_count} runnable platforms)`);
      console.log(`    ${SCAN_PLATFORM} child: ${resolution.target_digest ?? 'ABSENT'}`);
    } else {
      console.log(`    single-platform manifest; the pinned digest is the image`);
    }
    return { pinned_ref: image, scan_ref: scanRef, resolution };
  });

  const unresolvable = imageResolutions.filter((r) => r.scan_ref === null);
  if (unresolvable.length > 0) {
    console.error('\n=== SUPPLY-CHAIN GATE FAILED ===');
    for (const r of unresolvable) {
      console.error(
        `  ${r.pinned_ref}: cannot resolve a ${SCAN_PLATFORM} child manifest ` +
        `(${r.resolution.error ?? 'platform absent from the index'}).`,
      );
    }
    console.error(`  A scan that cannot name the manifest it examined is not evidence.`);
    process.exit(1);
  }

  imageResolutions.forEach((r, i) => {
    R(`trivy-image-${i}`, [
      'trivy', 'image', '--platform', SCAN_PLATFORM, '--severity', 'HIGH,CRITICAL',
      '--exit-code', '1', '--no-progress', '--format', 'table', r.scan_ref,
    ], {
      description:
        `trivy scan of the ${SCAN_PLATFORM} child manifest ${r.resolution.target_digest} ` +
        `resolved from digest-pinned index ${r.pinned_ref}`,
      tool: 'trivy', toolVersion: versions.trivy.actual, policy: 'blocking',
    });
  });

  const failed = steps.filter((s) => s.failed);
  const generatedAt = new Date().toISOString();
  const policyAudit = classifyStepPolicies(steps);
  if (!policyAudit.every_informational_step_duplicates_a_blocking_step) {
    console.error('\n=== SUPPLY-CHAIN GATE FAILED: unenforced scan coverage ===');
    for (const p of policyAudit.unblocked_coverage_problems) console.error(`  ${p}`);
    process.exit(1);
  }

  const manifest = {
    artifact: 'C15 supply-chain gate — raw execution evidence',
    source_sha: sourceSha,
    tree_clean_at_run: treeClean,
    final_mode: finalMode,
    generated_at: generatedAt,
    host: { platform: process.platform, arch: process.arch, node: process.version },
    pinned_toolchain: versions,
    // C15 carry-forward: identity of the binaries that produced the findings, and the
    // vulnerability database they were matched against.
    scanner_binaries: scannerBinaries(['pnpm', 'node', 'gitleaks', 'trivy', 'docker']),
    trivy_database: vulnDb,
    trivy_database_enforcement: {
      max_age_hours: MAX_VULN_DB_AGE_HOURS,
      probed_at: scanStartedAt,
      problems: dbProblems,
      enforced_before_first_scan: true,
    },
    // C15 carry-forward: what "eight steps, six blocking" actually means.
    step_policy_audit: {
      ...policyAudit,
      note:
        'The two non-blocking steps are alternate-format captures (JSON) of scans that ' +
        'already ran under a blocking policy with the same pinned tool. They exist so the ' +
        'complete machine-readable finding set is preserved below the blocking severity ' +
        'threshold; they add no coverage that is not also enforced. No scan is permitted ' +
        'to fail.',
    },
    // C15 carry-forward: the compose pins are indexes; these are the exact child
    // manifests that were scanned, and every sibling platform is enumerated.
    scan_platform: SCAN_PLATFORM,
    digest_pinned_images: images,
    image_platform_resolution: imageResolutions,
    governed_exclusions: {
      scanner: 'gitleaks',
      config: '.gitleaks.toml (extends upstream defaults; disables no rule)',
      path_exclusions: exclusionProofs,
      match_exclusions: [{
        scope: 'apps/api/migrations/*.sql',
        match: 'context_key_hash',
        reason: 'SQL COLUMN NAME in SELECT lists, not a credential; the stored value is a SHA-256 hash of a context key',
        condition: 'AND (file must be a migration AND match must be that identifier)',
      }],
    },
    steps,
    summary: {
      total_steps: steps.length,
      blocking_steps: steps.filter((s) => s.policy === 'blocking').length,
      failed_steps: failed.length,
      failed_ids: failed.map((s) => s.id),
    },
  };
  const manifestPath = join(outDir, 'supply-chain-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\nsteps: ${steps.length} (blocking: ${manifest.summary.blocking_steps}, ` +
    `non-blocking: ${policyAudit.informational_steps} — each an alternate output format of a blocking scan)`);
  const db = manifest.trivy_database;
  if (db.available) {
    console.log(`trivy vuln DB: built ${db.vulnerability_db.built_at} ` +
      `(${db.vulnerability_db.age_hours_at_scan}h old at scan, past-due=${db.vulnerability_db.past_next_update_at_scan})`);
  }
  console.log(`raw outputs + manifest: ${outDir}`);

  if (failed.length > 0) {
    console.error('\n=== SUPPLY-CHAIN GATE FAILED ===');
    for (const s of failed) {
      console.error(`  ${s.id} exited ${s.exit_code} — see ${s.stdout_file} / ${s.stderr_file}`);
    }
    process.exit(1);
  }
  console.log('\nsupply-chain gate: PASS');
}

main();
