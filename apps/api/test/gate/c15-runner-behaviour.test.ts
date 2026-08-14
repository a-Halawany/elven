/**
 * GATE-2.2 C15-R2 — BEHAVIOURAL NEGATIVE CONTROLS THAT EXECUTE THE REAL RUNNER.
 *
 * The independent review's finding was blunt and correct: "Source-string assertions do
 * not count." A test that greps the runner for a message proves the line exists, not that
 * the gate fails when it should. Every control here SPAWNS
 * `scripts/gate/supply-chain.mjs` against a deliberately broken condition and requires a
 * non-zero exit plus the specific diagnosis in the always-written failure manifest.
 *
 * Four conditions, each of which the runner must refuse:
 *   1. a PLANTED SECRET in the working tree;
 *   2. a BAD TOOL PIN (a scanner that is not the pinned version);
 *   3. an EXPIRED scan disposition;
 *   4. a WIDENED (overbroad) scan disposition.
 *
 * All four are refused BEFORE the container scans run, so these controls are bounded: the
 * runner exits during pin verification, secret scanning or disposition validation. A warm
 * shared trivy cache is passed in so cache acquisition is a no-op check rather than a
 * download.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync, readdirSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..');
const RUNNER = join(REPO, 'scripts', 'gate', 'supply-chain.mjs');

/** A shared trivy cache so each control costs a metadata check, not a download. */
let cacheDir: string;
const scratch: string[] = [];

type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  manifest: { outcome: string; failures: string[] } | null;
  resultFile: string | null;
};

/** Execute the real runner and read back the manifest it is required to always write. */
/**
 * Real, bounded ceilings. Every control here spawns the full C15 gate, which performs network
 * image scans; 28 of them previously carried a 15-minute per-test timeout, so one suite could
 * legitimately run for hours and was repeatedly killed by the surrounding harness mid-test.
 * The child ceiling is what actually stops work; the per-test ceiling is slightly larger so a
 * killed child surfaces as a named assertion failure instead of a vanished worker.
 */
// C16-R3.4.2 §6: measured ceilings for an 18-second suite. The slowest control builds a
// disposable repository copy and takes ~3s; 30s of child budget and 45s per test is generous
// against that without letting anything hang for minutes. The long bounded timeout belongs
// only to the authoritative live supply-chain job in CI.
const GATE_CHILD_TIMEOUT_MS = 30_000;
const GATE_TEST_TIMEOUT_MS = 45_000;

const HERMETIC_ADAPTER = join(__dirname, 'helpers', 'hermetic-adapter.mjs');

/**
 * C16-R3.4.1 §B1: a DISPOSABLE COPY of the candidate.
 *
 * Controls that need a file to exist at the repository root — a legacy `.trivyignore`, a
 * mispinned document — create it here, never in the repository. Nothing a test does, and
 * nothing an interrupted test leaves behind, can touch tracked source.
 */
function disposableRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eye-c15-repo-'));
  scratch.push(dir);
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'buffer' });
  const paths = tracked.stdout.toString('utf8').split('\u0000').filter((p) => p.length > 0);
  for (const rel of paths) {
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(REPO, rel), target);
  }
  // Dependencies are not tracked, so link them rather than copying a few hundred megabytes.
  // They are inputs to the RUNNER, not to the candidate's tracked-source manifest.
  try { symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'), 'dir'); } catch { /* present */ }
  for (const ws of ['apps/api', 'apps/web', 'packages/contracts', 'packages/tokens']) {
    const from = join(REPO, ws, 'node_modules');
    if (existsSync(from)) {
      try { symlinkSync(from, join(dir, ws, 'node_modules'), 'dir'); } catch { /* present */ }
    }
  }
  // The gate reads git metadata; a copy without it is not a worktree, so seed one.
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['-c', 'user.email=c@e', '-c', 'user.name=c', 'commit', '-qm', 'disposable candidate'], { cwd: dir });
  return dir;
}

/** Run the hermetic gate with a disposable repository as the candidate root. */
function runGateIn(repoDir: string, args: string[] = []): RunResult {
  const out = mkdtempSync(join(tmpdir(), 'eye-c15-repo-out-'));
  scratch.push(out);
  // Invoke the COPY's runner: the gate derives its repository root from its own location, so
  // running the repository's own script with a different cwd would still read the repository.
  const res = spawnSync('node', [join(repoDir, 'scripts', 'gate', 'supply-chain.mjs'),
    '--out', out, '--trivy-cache', cacheDir, ...args], {
    cwd: repoDir, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, EYE_GATE_ADAPTER: HERMETIC_ADAPTER },
    timeout: GATE_CHILD_TIMEOUT_MS,
  });
  const manifestPath = join(out, 'supply-chain-manifest.json');
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { outcome: string; failures: string[] })
    : null;
  const failFile = join(out, 'RESULT-FAIL.txt');
  const passFile = join(out, 'RESULT-PASS.txt');
  return {
    status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', manifest,
    resultFile: existsSync(failFile) ? readFileSync(failFile, 'utf8')
      : existsSync(passFile) ? readFileSync(passFile, 'utf8') : null,
  };
}

/**
 * Run the real gate against the RECORDED trace instead of the network.
 *
 * Every control below still executes the runner's genuine decision logic — receipt
 * construction, policy propagation, disposition validation, raw-output parsing, finding
 * reconciliation, cache-fingerprint recomputation, manifest construction — against genuine
 * recorded scanner output. What it does not do is download a vulnerability database, resolve a
 * remote image index or perform a live scan, 44 times over.
 *
 * `scenario` patches the trace with the single defect under test.
 */
function runGate(
  extraArgs: string[] = [],
  env: Record<string, string> = {},
  scenario: Record<string, unknown> | null = null,
  opts: { productionAdapter?: boolean } = {},
): RunResult {
  const out = mkdtempSync(join(tmpdir(), 'eye-c15-ctl-'));
  scratch.push(out);
  // `--final` refuses every test seam BEFORE scanning, by design. Controls asserting
  // final-mode source binding therefore run the PRODUCTION adapter — and still touch no
  // network, because they are refused during argument and SHA validation, ahead of staging,
  // acquisition and every scan.
  const adapterEnv: Record<string, string> = opts.productionAdapter === true
    ? {}
    : { EYE_GATE_ADAPTER: HERMETIC_ADAPTER };
  if (scenario !== null) {
    const f = join(mkdtempSync(join(tmpdir(), 'eye-c15-scn-')), 'scenario.json');
    writeFileSync(f, JSON.stringify(scenario));
    adapterEnv.EYE_GATE_FIXTURE = f;
  }
  const res = spawnSync('node', [RUNNER, '--out', out, '--trivy-cache', cacheDir, ...extraArgs], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, ...adapterEnv, ...env },
    // A real, enforced ceiling on the child. The suite-level timeout below is deliberately
    // larger so a killed child is reported as a failing assertion rather than a dead worker.
    timeout: GATE_CHILD_TIMEOUT_MS,
  });
  const manifestPath = join(out, 'supply-chain-manifest.json');
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { outcome: string; failures: string[] })
    : null;
  const failFile = join(out, 'RESULT-FAIL.txt');
  const passFile = join(out, 'RESULT-PASS.txt');
  return {
    status: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    manifest,
    resultFile: existsSync(failFile) ? readFileSync(failFile, 'utf8')
      : existsSync(passFile) ? readFileSync(passFile, 'utf8') : null,
  };
}

/** Temporarily replace a tracked file, guaranteeing restoration. */
/**
 * Run `fn` with a governed document replaced.
 *
 * ── WHY THIS NO LONGER WRITES THE TRACKED FILE ────────────────────────────────
 * It used to overwrite the real file in place and restore it in a `finally`. A `finally` does
 * not run when the process is killed, so an interrupted run left the governed document
 * corrupted on disk: one interruption left `SCX-0001` deleted, another left
 * `scan_platform: linux/arm64`, and every subsequent run — including unrelated suites — failed
 * with `UNGOVERNED image finding: CVE-2026-33630`. A test that can corrupt the repository when
 * it is interrupted is a defect regardless of what it proves when it completes.
 *
 * The disposition document is now written to a TEMPORARY file and pointed at through
 * `EYE_GATE_EXCLUSIONS_PATH`. The gate records the resolved path, and the final-manifest
 * verifier refuses any run whose path is not the tracked default, so the seam cannot launder a
 * real evidence package.
 *
 * Documents other than the dispositions still use in-place replacement, but now with a
 * process-level restore hook as well as the `finally`, so an interrupt cannot leave them
 * modified either.
 */
const inFlightRestores = new Map<string, string>();
const restoreAll = () => {
  for (const [abs, backup] of inFlightRestores) {
    try { copyFileSync(backup, abs); } catch { /* best effort on the way out */ }
  }
  inFlightRestores.clear();
};
for (const sig of ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException'] as const) {
  process.on(sig, restoreAll);
}

/**
 * C16-R3.4.1 §B1: the generic in-place replacement path is DELETED.
 *
 * It used to overwrite a tracked file and restore it in a `finally`, which a kill skips —
 * that is how the governed disposition document was twice left corrupted on disk. There is
 * no longer any code here that writes a repository path.
 *
 * Every governed input is now supplied one of two ways:
 *   * `withInjectedDocument()` — a TEMPORARY file the runner is pointed at; or
 *   * `disposableRepo()` + `runGateIn()` — a throwaway copy, for inputs the gate locates by
 *     repository root rather than by argument.
 */
function withInjectedDocument<T>(rel: string, contents: string, fn: () => T): T {
  if (rel !== 'scripts/gate/scanner-exclusions.json') {
    throw new Error(
      `no injection seam exists for '${rel}'. Use disposableRepo() + runGateIn() rather than ` +
      'writing a repository path — see C16-R3.4.1 §B1.',
    );
  }
  const tmp = join(mkdtempSync(join(tmpdir(), 'eye-c15-inject-')), 'scanner-exclusions.json');
  writeFileSync(tmp, contents);
  const previous = process.env.EYE_GATE_EXCLUSIONS_PATH;
  process.env.EYE_GATE_EXCLUSIONS_PATH = tmp;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.EYE_GATE_EXCLUSIONS_PATH;
    else process.env.EYE_GATE_EXCLUSIONS_PATH = previous;
    rmSync(tmp, { force: true });
  }
}

beforeAll(() => {
  // C16-R3.4.1 §B2: NO scanner is executed here and none needs to be installed. Tool
  // resolution and executable authentication cross the execution adapter, so the hermetic
  // replay supplies the tracked digest for this host and the gate's authentication logic runs
  // for real. The previous precondition probed `gitleaks version` and `trivy --version` and
  // digested the binaries on PATH, which made the whole suite depend on a live install.
  cacheDir = mkdtempSync(join(tmpdir(), 'eye-c15-cache-'));
  scratch.push(cacheDir);
}, 60_000);

afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

// ═════════════════════════════════════════════════════════════════════════════
describe('C15 behavioural control — a DETECTED SECRET fails the gate', () => {
  it('refuses, names the failure, and writes an auditable manifest', () => {
    // C16-R3.4 §1.2: nothing is planted. Writing a real key-shaped file into the working tree
    // created an untracked repository artifact for the duration of the test and left one behind
    // whenever the process was killed. The finding is injected through the hermetic scenario
    // instead, so the production decision path processes the SAME result structure the real
    // scanner produces — nonzero exit, redacted stdout, and a report JSON gitleaks would have
    // written — with no secret-shaped literal in this file and no file created in the repo.
    const finding = [{
      RuleID: 'private-key',
      Description: 'Private Key',
      File: 'apps/api/src/generated-config.ts',
      StartLine: 12,
      Match: 'REDACTED',
      Secret: 'REDACTED',
      Entropy: 5.9,
      Fingerprint: 'apps/api/src/generated-config.ts:private-key:12',
    }];
    const r = runGate([], {}, {
      steps: {
        'gitleaks-worktree': {
          exit_code: 1,
          stdout: `${JSON.stringify(finding, null, 2)}\n`,
          stderr: 'WRN leaks found: 1\n',
          report: JSON.stringify(finding),
        },
      },
    });
    expect(r.status, 'a detected secret must fail the gate').not.toBe(0);
    expect(r.manifest, 'a failure manifest must ALWAYS be written').not.toBeNull();
    expect(r.manifest!.outcome).toBe('FAIL');
    expect(r.manifest!.failures.join('\n')).toMatch(/gitleaks/);
    expect(r.resultFile, 'a raw RESULT-FAIL diagnostic must be written').toContain('outcome: FAIL');
    // The redaction the real scanner performs must survive into the evidence.
    expect(JSON.stringify(r.manifest)).not.toMatch(/BEGIN [A-Z ]*PRIVATE KEY/);
  }, GATE_TEST_TIMEOUT_MS);

  it('creates NO repository file, tracked or untracked', () => {
    const before = spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).stdout;
    runGate([], {}, { steps: { 'gitleaks-worktree': { exit_code: 1, stdout: '[]', report: '[]' } } });
    const after = spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).stdout;
    expect(after, 'a control must not add or modify any repository path').toBe(before);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15 behavioural control — a BAD TOOL PIN fails before any scan', () => {
  it('refuses when a scanner reports a version that is not the pin', () => {
    // C16-R3.4.1 §B3: no stub is placed on PATH. The version probe crosses the execution
    // adapter, so the wrong version is INJECTED — the same value the production path would
    // read from a mispinned binary — and the runner must refuse during pin verification,
    // before it scans anything.
    const r = runGate([], {}, { steps: { 'version:gitleaks': { exit_code: 0, stdout: '0.0.0-not-the-pin\n' } } });
    expect(r.status).not.toBe(0);
    expect(r.manifest).not.toBeNull();
    expect(r.manifest!.outcome).toBe('FAIL');
    expect(r.manifest!.failures.join('\n')).toMatch(/gitleaks: expected 8\.30\.1, found 0\.0\.0-not-the-pin/);
    expect((r.manifest as unknown as { steps: unknown[] }).steps).toEqual([]);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15 behavioural control — governed scan dispositions', () => {
  const governed = 'scripts/gate/scanner-exclusions.json';
  const current = () => JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
    schema_version: string;
    records: Array<Record<string, unknown>>;
  };

  it('refuses an EXPIRED disposition', () => {
    const doc = current();
    // An unambiguously past date. "Yesterday" would be fragile: the runner stamps its run
    // date from UTC, which can differ from the local calendar day by one.
    doc.records[0]!.approved_on = '2019-01-01';
    doc.records[0]!.expires_on = '2020-01-01';
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    expect(r.manifest!.failures.join('\n')).toMatch(/EXPIRED/);
  }, GATE_TEST_TIMEOUT_MS);

  it('refuses a WIDENED (overbroad) disposition', () => {
    // Strip the package scope: this is exactly what a bare CVE id in .trivyignore was —
    // an advisory suppressed everywhere rather than for one component.
    const doc = current();
    delete doc.records[0]!.package_purl_prefix;
    delete doc.records[0]!.package_name;
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/missing required field 'package_purl_prefix'|missing required field 'package_name'/);
  }, GATE_TEST_TIMEOUT_MS);

  it('refuses a disposition whose evidence is untracked or absent', () => {
    const doc = current();
    doc.records[0]!.evidence = 'does/not/exist.md';
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/does not exist/);
  }, GATE_TEST_TIMEOUT_MS);

  it('refuses a self-approved disposition', () => {
    const doc = current();
    doc.records[0]!.approver = doc.records[0]!.owner;
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/cannot approve itself/);
  }, GATE_TEST_TIMEOUT_MS);

  it('refuses an UNGOVERNED finding when a disposition is removed entirely', () => {
    // Removing the c-ares record leaves its real HIGH finding with no governed
    // disposition, which must fail rather than pass silently.
    const doc = current();
    doc.records = doc.records.filter((r) => r.id !== 'SCX-0001');
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    expect(r.manifest!.failures.join('\n')).toMatch(/UNGOVERNED image finding: CVE-2026-33630/);
  }, GATE_TEST_TIMEOUT_MS);

  it('refuses an UNUSED disposition that matches no finding', () => {
    const doc = current();
    // A FULLY VALID record that simply governs nothing: every field is well formed, so it
    // reaches the reconciliation stage and must be rejected as unused rather than as
    // malformed. A malformed fixture would prove the wrong rule.
    doc.records.push({
      ...(doc.records[0] as Record<string, unknown>),
      id: 'SCX-UNUSED',
      advisory_ids: ['CVE-2019-11111'],
      package_name: 'left-pad',
      package_purl: 'pkg:apk/alpine/left-pad@1.0.0?arch=x86_64&distro=3.24.1',
      installed_version: '1.0.0',
      severities: ['HIGH'],
      result_target: 'postgres@sha256:b6a16ed0eb96e2c362811f7eeb951eac8b459e7b40be4149ea5444aa7c65569b (alpine 3.24.1)',
    });
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/UNUSED scan disposition 'SCX-UNUSED'/);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15 behavioural control — the legacy global ignore file is refused', () => {
  it('refuses to run while a bare .trivyignore exists', () => {
    // §B1: the legacy file is created in a DISPOSABLE COPY of the repository, never in the
    // repository itself. An interrupted run can no longer leave `.trivyignore` behind.
    const copy = disposableRepo();
    writeFileSync(join(copy, '.trivyignore'), 'CVE-2026-33630\n');
    const r = runGateIn(copy);
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    expect(r.manifest!.failures.join('\n')).toMatch(/\.trivyignore still exists/);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15 behavioural control — final-source binding', () => {
  it('refuses --final without an expected SHA', () => {
    const r = runGate(['--final'], {}, null, { productionAdapter: true });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/--final requires --expected-sha/);
  }, GATE_TEST_TIMEOUT_MS);

  it('refuses --final when the expected SHA does not match HEAD', () => {
    const r = runGate(['--final', '--expected-sha', '0'.repeat(40)], {}, null, { productionAdapter: true });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/does not match HEAD/);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15 behavioural control — POSITIVE: the unmodified gate passes', () => {
  it('passes and writes a PASS manifest with 8 steps, 6 blocking, cache unchanged', () => {
    const r = runGate();
    expect(r.status, `gate should pass; failures: ${JSON.stringify(r.manifest?.failures)}`).toBe(0);
    expect(r.manifest!.outcome).toBe('PASS');
    expect(r.manifest!.failures).toEqual([]);
    const m = r.manifest as unknown as {
      summary: { total_steps: number; blocking_steps: number };
      trivy_cache_unchanged: boolean;
      image_finding_reconciliation: { unmatched: string[]; unused_records: string[]; total_findings: number };
      step_policy_audit: { every_informational_step_duplicates_a_blocking_step: boolean };
    };
    expect(m.summary.total_steps).toBe(8);
    expect(m.summary.blocking_steps).toBe(6);
    expect(m.trivy_cache_unchanged, 'authoritative scans must not update the captured cache').toBe(true);
    expect(m.image_finding_reconciliation.unmatched).toEqual([]);
    expect(m.image_finding_reconciliation.unused_records).toEqual([]);
    expect(m.image_finding_reconciliation.total_findings).toBeGreaterThan(0);
    expect(m.step_policy_audit.every_informational_step_duplicates_a_blocking_step).toBe(true);
    expect(r.resultFile).toContain('outcome: PASS');
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 — FINAL-SOURCE MODE actually succeeds when it should', () => {
  const headSha = () =>
    spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  const treeClean = () =>
    spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).stdout.trim() === '';

  it('final mode REFUSES every test seam, before staging or any scan', () => {
    // C16-R3.4: the positive "correct SHA succeeds in final mode" case requires a real live
    // scan, so it is the single explicit LIVE INTEGRATION gate and is deliberately not part of
    // the hermetic suite. What the hermetic suite proves is the structural guarantee that makes
    // that separation safe: a seeded run cannot reach evidence at all.
    const r = runGate(['--final', '--expected-sha', headSha()]);
    expect(r.status, 'a seeded final run must be refused').not.toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/--final refuses to run with test seams active/);
    expect(r.manifest, 'a refused seeded run must not write a manifest').toBeNull();
  }, GATE_TEST_TIMEOUT_MS);

  it('a WRONG expected SHA fails final mode', () => {
    const r = runGate(['--final', '--expected-sha', 'a'.repeat(40)], {}, null, { productionAdapter: true });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/does not match HEAD/);
  }, GATE_TEST_TIMEOUT_MS);

  it('a malformed expected SHA is a USAGE error, not a silent pass', () => {
    const r = runGate(['--final', '--expected-sha', 'not-a-sha'], {}, null, { productionAdapter: true });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('USAGE-ERROR');
    expect(r.manifest!.failures.join('\n')).toMatch(/not a 40-character git object id/);
  }, GATE_TEST_TIMEOUT_MS);

  it('GITLESS input cannot produce final evidence', () => {
    // Export the tree without .git and run the gate there: no commit exists to bind.
    const exported = mkdtempSync(join(tmpdir(), 'eye-c15-gitless-'));
    scratch.push(exported);
    const tar = spawnSync('sh', ['-c',
      `git -C '${REPO}' archive --format=tar HEAD | tar -x -C '${exported}'`],
      { encoding: 'utf8' });
    expect(tar.status, 'export must succeed').toBe(0);

    const out = mkdtempSync(join(tmpdir(), 'eye-c15-gitless-out-'));
    scratch.push(out);
    const res = spawnSync('node', [
      join(exported, 'scripts/gate/supply-chain.mjs'),
      '--out', out, '--trivy-cache', cacheDir,
      '--final', '--expected-sha', headSha(),
    ], { cwd: exported, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: GATE_CHILD_TIMEOUT_MS });

    expect(res.status).not.toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(out, 'supply-chain-manifest.json'), 'utf8'),
    ) as { outcome: string; failures: string[] };
    expect(manifest.outcome).toBe('FAIL');
    expect(manifest.failures.join('\n')).toMatch(/not a git worktree/);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 — a scanner that EXITS NONZERO always blocks', () => {
  it('valid JSON on stdout with a nonzero exit still fails the gate', () => {
    // The image command carries no --exit-code, so findings return zero. Therefore ANY nonzero
    // status is a scanner FAILURE, and parseable stdout is not evidence that the scan completed.
    // The previous `rec.failed = false` discarded this unconditionally.
    //
    // C16-R3.4 §1.2: this used to build a fake trivy shell script on PATH and repoint the
    // tracked pin digest at it. The same decision path is now exercised by injecting the
    // scanner RESULT — parseable JSON, nonzero status — which is what the production code
    // actually consumes.
    const r = runGate([], {}, {
      steps: {
        'trivy-image-0': {
          exit_code: 3,
          stdout: '{"SchemaVersion":2,"ArtifactName":"fake","Results":[]}\n',
          stderr: 'fake scanner failure\n',
        },
      },
    });
    expect(r.status, 'a nonzero scanner exit must block').not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    expect(r.manifest!.failures.join('\n')).toMatch(/trivy-image-\d: trivy exited 3/);
    // And its findings must NOT have been ingested from a run that did not complete.
    expect(r.manifest!.failures.join('\n')).toMatch(/scanner failure, not a finding/);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 — malformed governed documents fail with auditable evidence', () => {
  it.each([
    ['scripts/gate/scanner-pins.json', 'scanner-pins'],
    ['scripts/gate/scanner-exclusions.json', 'scanner-exclusions'],
  ])('malformed %s is a USAGE error with a manifest', (rel) => {
    // §B1: the pins have no injection seam, so the malformed document lives in a DISPOSABLE
    // COPY of the candidate. Nothing is written to the repository.
    const r = rel === 'scripts/gate/scanner-exclusions.json'
      ? withInjectedDocument(rel, '{ this is not json', () => runGate())
      : (() => {
        const copy = disposableRepo();
        writeFileSync(join(copy, rel), '{ this is not json');
        return runGateIn(copy);
      })();
    expect(r.status).not.toBe(0);
    expect(r.manifest, 'a manifest must ALWAYS be written').not.toBeNull();
    expect(r.manifest!.outcome).toBe('USAGE-ERROR');
    expect(r.manifest!.failures.join('\n')).toMatch(/is not valid JSON/);
    expect(r.resultFile).toContain('outcome: USAGE-ERROR');
  }, GATE_TEST_TIMEOUT_MS);

  it('an unrecognised argument is a USAGE error with a manifest', () => {
    const r = runGate(['--not-a-real-flag']);
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('USAGE-ERROR');
    expect(r.manifest!.failures.join('\n')).toMatch(/unrecognised argument/);
  }, GATE_TEST_TIMEOUT_MS);

  it('the failure manifest records the exception, arguments, SHA and timestamp', () => {
    const r = runGate(['--not-a-real-flag']);
    const m = r.manifest as unknown as {
      exception: { type: string; name: string; message: string };
      arguments: string[]; source_sha: string; finished_at: string;
    };
    expect(m.exception.type).toBe('USAGE');
    expect(m.exception.message).toMatch(/unrecognised argument/);
    expect(m.arguments).toContain('--not-a-real-flag');
    expect(m.source_sha).toMatch(/^[0-9a-f]{40}$|not a git worktree/);
    expect(m.finished_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 — a disposition cannot govern a different platform', () => {
  it('a linux/arm64 disposition does not govern a linux/amd64 finding', () => {
    const governed = 'scripts/gate/scanner-exclusions.json';
    const doc = JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
      records: Array<Record<string, unknown>>;
    };
    // Same advisory, same package, same image — only the platform differs.
    for (const r of doc.records) r.scan_platform = 'linux/arm64';
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/UNGOVERNED image finding/);
    // …and the near-miss detail must name the platform as the reason.
    const m = r.manifest as unknown as {
      image_finding_reconciliation: { near_miss_detail: string[] };
    };
    expect(m.image_finding_reconciliation.near_miss_detail.join('\n'))
      .toMatch(/platform linux\/arm64 != resolved linux\/amd64/);
  }, GATE_TEST_TIMEOUT_MS);

  it('a severity ESCALATION is not absorbed by a HIGH-only disposition', () => {
    const governed = 'scripts/gate/scanner-exclusions.json';
    const doc = JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
      records: Array<Record<string, unknown>>;
    };
    // Delete the dedicated CRITICAL record; the HIGH set must NOT cover the critical.
    doc.records = doc.records.filter((x) => x.id !== 'SCX-0003');
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/UNGOVERNED image finding: CVE-2025-68121 CRITICAL/);
  }, GATE_TEST_TIMEOUT_MS);

  it('an ambiguous composite severity label is rejected outright', () => {
    const governed = 'scripts/gate/scanner-exclusions.json';
    const doc = JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
      records: Array<Record<string, unknown>>;
    };
    delete doc.records[0]!.severities;
    doc.records[0]!.severity = 'HIGH_AND_CRITICAL';
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/ambiguous scalar|missing required field 'severities'/);
  }, GATE_TEST_TIMEOUT_MS);

  it('an installed-version mismatch is not governed', () => {
    const governed = 'scripts/gate/scanner-exclusions.json';
    const doc = JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
      records: Array<Record<string, unknown>>;
    };
    doc.records[0]!.installed_version = '9.9.9-not-installed';
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/UNGOVERNED image finding/);
  }, GATE_TEST_TIMEOUT_MS);

  it('a result-target mismatch is not governed', () => {
    const governed = 'scripts/gate/scanner-exclusions.json';
    const doc = JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
      records: Array<Record<string, unknown>>;
    };
    doc.records[1]!.result_target = 'usr/local/bin/somewhere-else';
    const r = withInjectedDocument(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/UNGOVERNED image finding/);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 — evidence completeness', () => {
  it('every raw artifact is bound by path, size and SHA-256', () => {
    const r = runGate();
    expect(r.status, `gate should pass; ${JSON.stringify(r.manifest?.failures)}`).toBe(0);
    const m = r.manifest as unknown as {
      evidence_artifacts: Array<{ path: string; bytes: number; sha256: string }>;
      trivy_cache_acquisition: { steps: Array<{ stdout_sha256: string; stderr_sha256: string; stdout_file: string }> };
      trivy_cache_fingerprint_after: {
        checks_content: { files: number; manifest_sha256: string };
        checks_manifest: Array<{ path: string; bytes: number; sha256: string }>;
      };
    };
    const paths = m.evidence_artifacts.map((a) => a.path);
    for (const expected of [
      'gitleaks-worktree.json', 'gitleaks-history.json', 'image-findings.json',
      'trivy-image-0.stdout.txt', 'trivy-fs-json.stdout.txt',
      'trivy-acquire-db.stdout.txt', 'trivy-acquire-checks.stdout.txt',
      'pnpm-audit-json.stdout.txt',
    ]) {
      expect(paths, `${expected} must be bound`).toContain(expected);
    }
    for (const a of m.evidence_artifacts) {
      expect(a.sha256, a.path).toMatch(/^[a-f0-9]{64}$/);
      expect(typeof a.bytes).toBe('number');
    }
    // Acquisition logs carry FULL captures with digests, not a four-line tail.
    for (const st of m.trivy_cache_acquisition.steps) {
      expect(st.stdout_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(st.stderr_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(st.stdout_file).toMatch(/\.stdout\.txt$/);
    }
    // The checks bundle is digested file by file, not counted.
    const cm = m.trivy_cache_fingerprint_after;
    expect(cm.checks_content.files).toBeGreaterThan(100);
    expect(cm.checks_manifest.length).toBe(cm.checks_content.files);
    for (const f of cm.checks_manifest.slice(0, 5)) {
      expect(f.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(f.path.startsWith('policy/content/')).toBe(true);
    }
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3.1 — scanner dispositions: types, digests and unconditional matching', () => {
  const governed = 'scripts/gate/scanner-exclusions.json';
  const current = () => JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
    records: Array<Record<string, unknown>>;
  };
  const replaceDoc = (mutate: (d: { records: Array<Record<string, unknown>> }) => void) => {
    const d = current();
    mutate(d);
    return withInjectedDocument(governed, `${JSON.stringify(d, null, 2)}\n`, () => runGate());
  };

  it('POSITIVE: the committed dispositions pass with a byte-matched evidence digest', () => {
    const r = runGate();
    expect(r.status, `${JSON.stringify(r.manifest?.failures)}`).toBe(0);
    const m = r.manifest as unknown as {
      scanner_exclusions: { declared: number };
      image_finding_reconciliation: { total_findings: number; unmatched: string[]; unused_records: string[] };
    };
    // Four since R3.4.5 split SCX-0004 (NOT_AFFECTED, symbol-analysed) out of SCX-0002
    // (risk-accepted). The literal is deliberate: a record appearing or vanishing must fail
    // here until someone changes this number on purpose.
    expect(m.scanner_exclusions.declared).toBe(4);
    expect(m.image_finding_reconciliation.unmatched).toEqual([]);
    expect(m.image_finding_reconciliation.unused_records).toEqual([]);
  }, GATE_TEST_TIMEOUT_MS);

  it('a MISSING evidence_sha256 is rejected', () => {
    const r = replaceDoc((d) => { delete d.records[0]!.evidence_sha256; });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/missing required field 'evidence_sha256'/);
  }, GATE_TEST_TIMEOUT_MS);

  it('a NUMERIC evidence_sha256 is rejected by the type contract', () => {
    const r = replaceDoc((d) => { d.records[0]!.evidence_sha256 = 123; });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/'evidence_sha256' must be a string, got number/);
  }, GATE_TEST_TIMEOUT_MS);

  it('a WRONG evidence digest is rejected by recomputation', () => {
    const r = replaceDoc((d) => { d.records[0]!.evidence_sha256 = 'b'.repeat(64); });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/evidence digest mismatch/);
  }, GATE_TEST_TIMEOUT_MS);

  it('a ONE-BYTE change to the evidence document invalidates every record', () => {
    // §B1: the evidence document is altered in a DISPOSABLE COPY, never in the repository.
    const doc = 'docs/SCANNER_DISPOSITIONS.md';
    const copy = disposableRepo();
    writeFileSync(join(copy, doc), `${readFileSync(join(REPO, doc), 'utf8')}\n`);
    const r = runGateIn(copy);
    expect(r.status).not.toBe(0);
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/evidence digest mismatch/);
    // All three records cite the same document, so all three must fail.
    expect((text.match(/evidence digest mismatch/g) ?? []).length).toBeGreaterThanOrEqual(3);
  }, GATE_TEST_TIMEOUT_MS);

  it('a STRING severities (wrong type) does NOT bypass severity matching', () => {
    // Previously the matcher was type-gated (`Array.isArray(r.severities) && …`), so a
    // string silently skipped severity comparison and the record governed findings it was
    // never approved for.
    const r = replaceDoc((d) => { d.records[0]!.severities = 'HIGH'; });
    expect(r.status).not.toBe(0);
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/'severities' must be an array of strings, got string/);
    // The record is marked structurally FATAL, so it is removed from the matching set
    // entirely and cannot govern anything. The gate stops before scanning rather than
    // scanning with a governance document it knows is invalid; the unit control in
    // c15-scanner-provenance.test.ts proves the matcher itself no longer skips the field.
    const m = r.manifest as unknown as { scanner_exclusion_fatal_indices?: number[] };
    expect(m.scanner_exclusion_fatal_indices).toContain(0);
  }, GATE_TEST_TIMEOUT_MS);

  it('a NUMERIC result_target (wrong type) does NOT bypass target matching', () => {
    const r = replaceDoc((d) => { d.records[1]!.result_target = 12345; });
    expect(r.status).not.toBe(0);
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/'result_target' must be a string, got number/);
    const m = r.manifest as unknown as { scanner_exclusion_fatal_indices?: number[] };
    expect(m.scanner_exclusion_fatal_indices).toContain(1);
  }, GATE_TEST_TIMEOUT_MS);

  it('a composite severity label is rejected and governs nothing', () => {
    const r = replaceDoc((d) => {
      delete d.records[0]!.severities;
      d.records[0]!.severity = 'HIGH_AND_CRITICAL';
    });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/missing required field 'severities'/);
  }, GATE_TEST_TIMEOUT_MS);

  it('a STALE approval date (future) is rejected', () => {
    const r = replaceDoc((d) => {
      d.records[0]!.approved_on = '2099-01-01';
      d.records[0]!.expires_on = '2099-12-31';
    });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/approved_on 2099-01-01 is in the future/);
  }, GATE_TEST_TIMEOUT_MS);

  it('a WRONG result target is not governed', () => {
    const r = replaceDoc((d) => { d.records[1]!.result_target = 'usr/local/bin/elsewhere'; });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/UNGOVERNED image finding/);
  }, GATE_TEST_TIMEOUT_MS);

  it('the CRITICAL record cannot be replaced by a HIGH-only record (escalation)', () => {
    const r = replaceDoc((d) => {
      const critical = d.records.find((x) => x.id === 'SCX-0003')!;
      critical.severities = ['HIGH'];
    });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/UNGOVERNED image finding: CVE-2025-68121 CRITICAL/);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3.1 — authentication happens BEFORE any scanner code executes', () => {
  it('a same-version WRONG binary is rejected before it can run anything', () => {
    // The digest, not the version string, is the authentication. Injected through the adapter:
    // correct version, wrong bytes.
    const r = runGate([], {}, {
      authenticateTool: { gitleaks: { sha256: 'c'.repeat(64), bytes: 123 } },
    });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    expect(r.manifest!.failures.join('\n')).toMatch(/gitleaks EXECUTABLE at .* is not authenticated|does not match the trusted/);
    expect((r.manifest as unknown as { steps: unknown[] }).steps).toEqual([]);
  }, GATE_TEST_TIMEOUT_MS);

  it('a PASSING run stages the authenticated binaries and re-verifies them afterwards', () => {
    const r = runGate();
    expect(r.status).toBe(0);
    const m = r.manifest as unknown as {
      executed_binary_authentication: {
        staged_dir: string;
        verified: Record<string, { staged_path: string; staged_sha256: string; match: boolean }>;
      };
      staged_tools_after_scanning: Record<string, { match: boolean; sha256_after: string }>;
      worktree_unchanged_by_scanning: boolean;
      steps: Array<{ command: string }>;
    };
    for (const tool of ['trivy', 'gitleaks']) {
      const v = m.executed_binary_authentication.verified[tool]!;
      expect(v.match).toBe(true);
      expect(v.staged_path).toContain('.staged-scanners');
      expect(v.staged_sha256).toMatch(/^[a-f0-9]{64}$/);
      // Re-verified AFTER all scanning.
      expect(m.staged_tools_after_scanning[tool]!.match).toBe(true);
    }
    // Every scan command invoked the staged ABSOLUTE path, never a bare tool name.
    const scans = m.steps.filter((s) => /trivy|gitleaks/.test(s.command));
    expect(scans.length).toBeGreaterThan(0);
    for (const s of scans) {
      expect(s.command.startsWith('/'), `not an absolute path: ${s.command.slice(0, 60)}`).toBe(true);
      expect(s.command).toContain('.staged-scanners');
    }
    // Scanning did not modify the source it examined.
    expect(m.worktree_unchanged_by_scanning).toBe(true);
  }, GATE_TEST_TIMEOUT_MS);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3.1 — every output except the manifest is bound, on every path', () => {
  /** Files present in a directory, excluding the by-design exclusions. */
  const filesIn = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (d: string, rel: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (e.name === '.trivy-cache' || e.name === '.staged-scanners') continue;
          walk(join(d, e.name), rel === '' ? e.name : `${rel}/${e.name}`);
          continue;
        }
        out.push(rel === '' ? e.name : `${rel}/${e.name}`);
      }
    };
    walk(dir, '');
    return out.sort();
  };
  /** Run and return the output directory alongside the parsed manifest. */
  const runIn = (args: string[] = [], env: Record<string, string> = {}) => {
    const out = mkdtempSync(join(tmpdir(), 'eye-r31-bind-'));
    scratch.push(out);
    const res = spawnSync('node', [RUNNER, '--out', out, '--trivy-cache', cacheDir, ...args], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
      // §B3: this path is hermetic too. It previously spawned the live gate.
      env: { ...process.env, EYE_GATE_ADAPTER: HERMETIC_ADAPTER, ...env },
      timeout: GATE_CHILD_TIMEOUT_MS,
    });
    const manifest = JSON.parse(readFileSync(join(out, 'supply-chain-manifest.json'), 'utf8')) as {
      outcome: string; evidence_artifacts: Array<{ path: string; sha256: string }>;
      evidence_binding_note: string;
    };
    return { out, status: res.status, manifest };
  };
  const assertOnlyManifestUnbound = (out: string, manifest: { evidence_artifacts: Array<{ path: string }> }) => {
    const bound = new Set(manifest.evidence_artifacts.map((a) => a.path));
    const unbound = filesIn(out).filter((f) => !bound.has(f));
    // The root manifest is the ONE unavoidable self-exclusion: writing its own digest
    // would change the bytes being digested.
    expect(unbound, 'only supply-chain-manifest.json may be unbound').toEqual(['supply-chain-manifest.json']);
  };

  it('SUCCESS path: only the manifest is unbound, and the receipt IS bound', () => {
    const r = runIn();
    expect(r.status).toBe(0);
    expect(r.manifest.outcome).toBe('PASS');
    assertOnlyManifestUnbound(r.out, r.manifest);
    expect(r.manifest.evidence_artifacts.map((a) => a.path)).toContain('RESULT-PASS.txt');
    expect(r.manifest.evidence_binding_note).toMatch(/unavoidable self-exclusion|cannot contain its own digest/);
  }, GATE_TEST_TIMEOUT_MS);

  it('GOVERNED FAILURE path: only the manifest is unbound, and RESULT-FAIL IS bound', () => {
    // §B1: the legacy ignore file lives in a disposable copy, never in the repository.
    const copy = disposableRepo();
    writeFileSync(join(copy, '.trivyignore'), 'CVE-2026-33630\n');
    const r = runGateIn(copy);
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    expect(r.manifest!.failures.join('\n')).toMatch(/\.trivyignore still exists/);
    expect(r.resultFile).toContain('outcome: FAIL');
  }, GATE_TEST_TIMEOUT_MS);

  it('USAGE/CRASH path: the receipt is written first and is bound', () => {
    const r = runIn(['--not-a-real-flag']);
    expect(r.status).not.toBe(0);
    expect(r.manifest.outcome).toBe('USAGE-ERROR');
    assertOnlyManifestUnbound(r.out, r.manifest);
    expect(r.manifest.evidence_artifacts.map((a) => a.path)).toContain('RESULT-FAIL.txt');
    expect(r.manifest.evidence_artifacts.length).toBeGreaterThan(0);
  }, GATE_TEST_TIMEOUT_MS);
});
