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
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
const GATE_CHILD_TIMEOUT_MS = 6 * 60_000;
const GATE_TEST_TIMEOUT_MS = 7 * 60_000;

const HERMETIC_ADAPTER = join(__dirname, 'helpers', 'hermetic-adapter.mjs');

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

function withReplacedFile<T>(rel: string, contents: string, fn: () => T): T {
  // The dispositions have a first-class override, so never touch the tracked copy.
  if (rel === 'scripts/gate/scanner-exclusions.json') {
    const tmp = join(mkdtempSync(join(tmpdir(), 'eye-c15-excl-')), 'scanner-exclusions.json');
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
  const abs = join(REPO, rel);
  const backup = join(mkdtempSync(join(tmpdir(), 'eye-c15-bak-')), 'backup');
  copyFileSync(abs, backup);
  inFlightRestores.set(abs, backup);
  try {
    writeFileSync(abs, contents);
    return fn();
  } finally {
    copyFileSync(backup, abs);
    inFlightRestores.delete(abs);
    rmSync(backup, { force: true });
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
  it('refuses when a scanner on PATH is not the pinned version', () => {
    // Shadow `gitleaks` with a stub reporting a different version. The runner must refuse
    // during pin verification, before it scans anything.
    const binDir = mkdtempSync(join(tmpdir(), 'eye-c15-badpin-'));
    scratch.push(binDir);
    const stub = join(binDir, 'gitleaks');
    writeFileSync(stub, '#!/bin/sh\necho "0.0.0-not-the-pin"\n');
    spawnSync('chmod', ['+x', stub]);

    const r = runGate([], { PATH: `${binDir}:${process.env.PATH ?? ''}` });
    expect(r.status).not.toBe(0);
    expect(r.manifest).not.toBeNull();
    expect(r.manifest!.outcome).toBe('FAIL');
    const text = r.manifest!.failures.join('\n');
    // Since C16-R3.1 the EXECUTABLE DIGEST is checked before the version is ever probed,
    // so a wrong binary is refused by its bytes rather than by its self-reported version.
    // That ordering is the point: no code from an unauthenticated binary runs first.
    expect(text).toMatch(/gitleaks EXECUTABLE at/);
    expect(text).toMatch(/is not authenticated/);
    // Nothing may have been scanned: the refusal precedes every step.
    expect(r.stdout).not.toContain('pnpm-audit-human');
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
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
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
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/missing required field 'package_purl_prefix'|missing required field 'package_name'/);
  }, GATE_TEST_TIMEOUT_MS);

  it('refuses a disposition whose evidence is untracked or absent', () => {
    const doc = current();
    doc.records[0]!.evidence = 'does/not/exist.md';
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/does not exist/);
  }, GATE_TEST_TIMEOUT_MS);

  it('refuses a self-approved disposition', () => {
    const doc = current();
    doc.records[0]!.approver = doc.records[0]!.owner;
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/cannot approve itself/);
  }, GATE_TEST_TIMEOUT_MS);

  it('refuses an UNGOVERNED finding when a disposition is removed entirely', () => {
    // Removing the c-ares record leaves its real HIGH finding with no governed
    // disposition, which must fail rather than pass silently.
    const doc = current();
    doc.records = doc.records.filter((r) => r.id !== 'SCX-0001');
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    expect(r.manifest!.failures.join('\n')).toMatch(/UNGOVERNED image finding: CVE-2026-33630/);
  }, 20 * 60_000);

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
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/UNUSED scan disposition 'SCX-UNUSED'/);
  }, 20 * 60_000);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15 behavioural control — the legacy global ignore file is refused', () => {
  it('refuses to run while a bare .trivyignore exists', () => {
    const legacy = join(REPO, '.trivyignore');
    writeFileSync(legacy, 'CVE-2026-33630\n');
    try {
      const r = runGate();
      expect(r.status).not.toBe(0);
      expect(r.manifest!.failures.join('\n')).toMatch(/\.trivyignore still exists/);
    } finally {
      rmSync(legacy, { force: true });
    }
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
  }, 25 * 60_000);
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
  }, 20 * 60_000);
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
    const r = withReplacedFile(rel, '{ this is not json', () => runGate());
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
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
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
  }, 25 * 60_000);

  it('a severity ESCALATION is not absorbed by a HIGH-only disposition', () => {
    const governed = 'scripts/gate/scanner-exclusions.json';
    const doc = JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
      records: Array<Record<string, unknown>>;
    };
    // Delete the dedicated CRITICAL record; the HIGH set must NOT cover the critical.
    doc.records = doc.records.filter((x) => x.id !== 'SCX-0003');
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/UNGOVERNED image finding: CVE-2025-68121 CRITICAL/);
  }, 25 * 60_000);

  it('an ambiguous composite severity label is rejected outright', () => {
    const governed = 'scripts/gate/scanner-exclusions.json';
    const doc = JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
      records: Array<Record<string, unknown>>;
    };
    delete doc.records[0]!.severities;
    doc.records[0]!.severity = 'HIGH_AND_CRITICAL';
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/ambiguous scalar|missing required field 'severities'/);
  }, GATE_TEST_TIMEOUT_MS);

  it('an installed-version mismatch is not governed', () => {
    const governed = 'scripts/gate/scanner-exclusions.json';
    const doc = JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
      records: Array<Record<string, unknown>>;
    };
    doc.records[0]!.installed_version = '9.9.9-not-installed';
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/UNGOVERNED image finding/);
  }, 25 * 60_000);

  it('a result-target mismatch is not governed', () => {
    const governed = 'scripts/gate/scanner-exclusions.json';
    const doc = JSON.parse(readFileSync(join(REPO, governed), 'utf8')) as {
      records: Array<Record<string, unknown>>;
    };
    doc.records[1]!.result_target = 'usr/local/bin/somewhere-else';
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/UNGOVERNED image finding/);
  }, 25 * 60_000);
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
  }, 25 * 60_000);
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
    return withReplacedFile(governed, `${JSON.stringify(d, null, 2)}\n`, () => runGate());
  };

  it('POSITIVE: the committed dispositions pass with a byte-matched evidence digest', () => {
    const r = runGate();
    expect(r.status, `${JSON.stringify(r.manifest?.failures)}`).toBe(0);
    const m = r.manifest as unknown as {
      scanner_exclusions: { declared: number };
      image_finding_reconciliation: { total_findings: number; unmatched: string[]; unused_records: string[] };
    };
    expect(m.scanner_exclusions.declared).toBe(3);
    expect(m.image_finding_reconciliation.unmatched).toEqual([]);
    expect(m.image_finding_reconciliation.unused_records).toEqual([]);
  }, 25 * 60_000);

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
    const doc = 'docs/SCANNER_DISPOSITIONS.md';
    const original = readFileSync(join(REPO, doc), 'utf8');
    // Append a single byte; the tracked digests no longer match.
    const r = withReplacedFile(doc, `${original}\n`, () => runGate());
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
  }, 25 * 60_000);

  it('a NUMERIC result_target (wrong type) does NOT bypass target matching', () => {
    const r = replaceDoc((d) => { d.records[1]!.result_target = 12345; });
    expect(r.status).not.toBe(0);
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/'result_target' must be a string, got number/);
    const m = r.manifest as unknown as { scanner_exclusion_fatal_indices?: number[] };
    expect(m.scanner_exclusion_fatal_indices).toContain(1);
  }, 25 * 60_000);

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
  }, 25 * 60_000);

  it('the CRITICAL record cannot be replaced by a HIGH-only record (escalation)', () => {
    const r = replaceDoc((d) => {
      const critical = d.records.find((x) => x.id === 'SCX-0003')!;
      critical.severities = ['HIGH'];
    });
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/UNGOVERNED image finding: CVE-2025-68121 CRITICAL/);
  }, 25 * 60_000);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3.1 — authentication happens BEFORE any scanner code executes', () => {
  it('a same-version WRONG binary is rejected before it can run anything', () => {
    // A stub that reports the correct version and, if ever executed for real work, would
    // write a marker file. The marker must NOT exist: the gate must reject on digest
    // before invoking it for anything beyond the (pre-authentication) resolution.
    const binDir = mkdtempSync(join(tmpdir(), 'eye-r31-wrongbin-'));
    scratch.push(binDir);
    const marker = join(binDir, 'EXECUTED');
    const stub = join(binDir, 'trivy');
    writeFileSync(stub, [
      '#!/bin/sh',
      `printf '' >> ${JSON.stringify(marker)}`,
      'case "$1" in',
      '  --version|version) echo "Version: 0.73.0" ;;',
      '  *) echo "{}" ;;',
      'esac',
      '',
    ].join('\n'));
    spawnSync('chmod', ['+x', stub]);

    const r = runGate([], { PATH: `${binDir}:${process.env.PATH ?? ''}` });
    expect(r.status).not.toBe(0);
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/trivy EXECUTABLE at/);
    expect(text).toMatch(/Refused BEFORE any executable code from it ran/);
    // The decisive assertion: the stub never ran.
    expect(existsSync(marker), 'the wrong binary must not have been executed').toBe(false);
    // And the run recorded that authentication preceded execution.
    const m = r.manifest as unknown as {
      executed_binary_authentication: { verified: Record<string, { authenticated_before_first_execution: boolean; match: boolean }> };
      steps: unknown[];
    };
    expect(m.executed_binary_authentication.verified.trivy.match).toBe(false);
    expect(m.executed_binary_authentication.verified.trivy.authenticated_before_first_execution).toBe(true);
    expect(m.steps, 'no scan step may have run').toEqual([]);
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
  }, 25 * 60_000);
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
      env: { ...process.env, ...env }, timeout: 25 * 60_000,
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
  }, 25 * 60_000);

  it('GOVERNED FAILURE path: only the manifest is unbound, and RESULT-FAIL IS bound', () => {
    const legacy = join(REPO, '.trivyignore');
    writeFileSync(legacy, 'CVE-2026-33630\n');
    try {
      const r = runIn();
      expect(r.status).not.toBe(0);
      expect(r.manifest.outcome).toBe('FAIL');
      assertOnlyManifestUnbound(r.out, r.manifest);
      expect(r.manifest.evidence_artifacts.map((a) => a.path)).toContain('RESULT-FAIL.txt');
    } finally {
      rmSync(legacy, { force: true });
    }
  }, 25 * 60_000);

  it('USAGE/CRASH path: the receipt is written first and is bound', () => {
    const r = runIn(['--not-a-real-flag']);
    expect(r.status).not.toBe(0);
    expect(r.manifest.outcome).toBe('USAGE-ERROR');
    assertOnlyManifestUnbound(r.out, r.manifest);
    expect(r.manifest.evidence_artifacts.map((a) => a.path)).toContain('RESULT-FAIL.txt');
    expect(r.manifest.evidence_artifacts.length).toBeGreaterThan(0);
  }, GATE_TEST_TIMEOUT_MS);
});
