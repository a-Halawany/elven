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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

  console.log('=== C15 SUPPLY-CHAIN GATE ===');
  console.log(`source SHA:  ${sourceSha}`);
  console.log(`tree clean:  ${treeClean}`);

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
  images.forEach((image, i) => {
    R(`trivy-image-${i}`, [
      'trivy', 'image', '--severity', 'HIGH,CRITICAL', '--exit-code', '1',
      '--no-progress', '--format', 'table', image,
    ], {
      description: `trivy scan of DIGEST-PINNED image ${image}`,
      tool: 'trivy', toolVersion: versions.trivy.actual, policy: 'blocking',
    });
  });

  const failed = steps.filter((s) => s.failed);
  const manifest = {
    artifact: 'C15 supply-chain gate — raw execution evidence',
    source_sha: sourceSha,
    tree_clean_at_run: treeClean,
    generated_at: new Date().toISOString(),
    host: { platform: process.platform, arch: process.arch, node: process.version },
    pinned_toolchain: versions,
    digest_pinned_images: images,
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

  console.log(`\nsteps: ${steps.length} (blocking: ${manifest.summary.blocking_steps})`);
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
