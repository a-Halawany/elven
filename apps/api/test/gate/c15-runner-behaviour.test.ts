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
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
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
function runGate(extraArgs: string[] = [], env: Record<string, string> = {}): RunResult {
  const out = mkdtempSync(join(tmpdir(), 'eye-c15-ctl-'));
  scratch.push(out);
  const res = spawnSync('node', [RUNNER, '--out', out, '--trivy-cache', cacheDir, ...extraArgs], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, ...env },
    timeout: 15 * 60_000,
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
function withReplacedFile<T>(rel: string, contents: string, fn: () => T): T {
  const abs = join(REPO, rel);
  const backup = join(mkdtempSync(join(tmpdir(), 'eye-c15-bak-')), 'backup');
  copyFileSync(abs, backup);
  try {
    writeFileSync(abs, contents);
    return fn();
  } finally {
    copyFileSync(backup, abs);
    rmSync(backup, { force: true });
  }
}

beforeAll(() => {
  // DECLARED PRECONDITION, stated rather than skipped: these controls execute the real
  // runner, so the pinned scanners must be present. A skip here would make the whole
  // suite vacuous exactly where it matters most.
  // The gate now AUTHENTICATES the executable bytes, so presence is not enough: the
  // resolved binary must be the tracked upstream release build. A distribution rebuild
  // (Homebrew, apt) reports the same version with different bytes and is correctly
  // rejected — so state that precisely instead of letting every control fail at the
  // authentication step for a reason that looks unrelated.
  const pins = JSON.parse(
    readFileSync(join(REPO, 'scripts/gate/scanner-pins.json'), 'utf8'),
  ) as { tools: Record<string, { artifacts: Record<string, { executable_sha256: string }> }> };
  const hostKey = `${process.platform}-${process.arch}`;
  for (const [tool, args] of [
    ['gitleaks', ['version']],
    ['trivy', ['--version']],
  ] as Array<[string, string[]]>) {
    const probe = spawnSync(tool, args, { encoding: 'utf8' });
    const which = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' });
    const resolved = which.status === 0 ? which.stdout.trim() : null;
    const want = pins.tools[tool]?.artifacts?.[hostKey]?.executable_sha256 ?? null;
    const actual = resolved === null ? null
      : createHash('sha256').update(readFileSync(resolved)).digest('hex');
    const how =
      'Install the authenticated upstream builds and put them first on PATH:\n' +
      '  DEST=/tmp/eye-gatebin bash scripts/gate/install-scanners.sh gitleaks trivy\n' +
      '  PATH=/tmp/eye-gatebin:$PATH pnpm --filter @eye/api test\n' +
      'These controls are not skippable — they are the only proof the gate refuses a bad input.';
    if (probe.error !== undefined || probe.status !== 0 || resolved === null) {
      throw new Error(`${tool} is not on PATH, so the C15 behavioural controls cannot run.\n${how}`);
    }
    if (want === null) {
      throw new Error(`no tracked executable digest for ${tool} on '${hostKey}'.\n${how}`);
    }
    if (actual !== want) {
      throw new Error(
        `${tool} at ${resolved} digests to ${actual}, not the tracked upstream release build ` +
        `${want}. The gate authenticates executable BYTES, not version strings, so this run ` +
        `would fail authentication rather than exercising the controls.\n${how}`,
      );
    }
  }

  // Warm one cache up front by asking trivy to populate it exactly as the runner does.
  cacheDir = mkdtempSync(join(tmpdir(), 'eye-c15-cache-'));
  scratch.push(cacheDir);
  spawnSync('trivy', ['--cache-dir', cacheDir, '--timeout', '15m', 'image', '--download-db-only', '--no-progress'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60_000 });
  const probe = mkdtempSync(join(tmpdir(), 'eye-c15-probe-'));
  scratch.push(probe);
  spawnSync('trivy', ['--cache-dir', cacheDir, 'fs', '--scanners', 'misconfig', '--no-progress', '--format', 'json', probe],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60_000 });
}, 20 * 60_000);

afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

// ═════════════════════════════════════════════════════════════════════════════
describe('C15 behavioural control — a PLANTED SECRET fails the gate', () => {
  it('refuses, names the failure, and writes an auditable manifest', () => {
    const planted = join(REPO, 'eye-c15-planted-secret.pem');
    // A real-shaped RSA private key, ASSEMBLED AT RUNTIME. An AWS doc-example key would
    // be allowlisted by gitleaks defaults, which is how a previous control was vacuous —
    // but embedding a literal PEM here would plant a permanent secret in tracked source,
    // and the gate correctly flags exactly that. So the fixture is synthesised instead:
    // no secret-shaped literal exists in this file, and the bytes handed to gitleaks are
    // still a genuine private-key shape.
    const pemBody = Buffer.from(
      createHash('sha512').update('eye-c15-negative-control').digest('hex')
      + createHash('sha512').update('eye-c15-negative-control-2').digest('hex'),
    ).toString('base64');
    const marker = (kind: string) => `${'-'.repeat(5)}${kind} RSA PRIVATE KEY${'-'.repeat(5)}`;
    const body = [
      marker('BEGIN'),
      ...(pemBody.match(/.{1,64}/g) ?? []),
      marker('END'),
      '',
    ].join('\n');
    writeFileSync(planted, body);
    try {
      const r = runGate();
      expect(r.status, 'a planted secret must fail the gate').not.toBe(0);
      expect(r.manifest, 'a failure manifest must ALWAYS be written').not.toBeNull();
      expect(r.manifest!.outcome).toBe('FAIL');
      // The gitleaks step must be the failing one.
      expect(r.manifest!.failures.join('\n')).toMatch(/gitleaks/);
      expect(r.resultFile, 'a raw RESULT-FAIL diagnostic must be written').toContain('outcome: FAIL');
    } finally {
      rmSync(planted, { force: true });
    }
  }, 15 * 60_000);
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
    expect(text).toMatch(/toolchain not pinned/);
    expect(text).toMatch(/gitleaks: expected 8\.30\.1, found 0\.0\.0-not-the-pin/);
    // Nothing may have been scanned: the refusal precedes every step.
    expect(r.stdout).not.toContain('pnpm-audit-human');
    expect((r.manifest as unknown as { steps: unknown[] }).steps).toEqual([]);
  }, 15 * 60_000);
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
  }, 15 * 60_000);

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
  }, 15 * 60_000);

  it('refuses a disposition whose evidence is untracked or absent', () => {
    const doc = current();
    doc.records[0]!.evidence = 'does/not/exist.md';
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/does not exist/);
  }, 15 * 60_000);

  it('refuses a self-approved disposition', () => {
    const doc = current();
    doc.records[0]!.approver = doc.records[0]!.owner;
    const r = withReplacedFile(governed, `${JSON.stringify(doc, null, 2)}\n`, () => runGate());
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/cannot approve itself/);
  }, 15 * 60_000);

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
  }, 15 * 60_000);
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C15 behavioural control — final-source binding', () => {
  it('refuses --final without an expected SHA', () => {
    const r = runGate(['--final']);
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/--final requires --expected-sha/);
  }, 15 * 60_000);

  it('refuses --final when the expected SHA does not match HEAD', () => {
    const r = runGate(['--final', '--expected-sha', '0'.repeat(40)]);
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/does not match HEAD/);
  }, 15 * 60_000);
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

  it('the CORRECT head SHA succeeds in final mode (the newline defect)', () => {
    // `spawnSync().stdout` keeps its trailing newline, so the recorded SHA used to differ
    // from the argument by exactly that byte — the correct SHA compared unequal to itself
    // and final mode could never succeed. This is the control that proves it now can.
    if (!treeClean()) {
      // The gate is correct to refuse a dirty tree, so the positive half of this control
      // is only meaningful on a clean one. State it rather than skip silently.
      const r = runGate(['--final', '--expected-sha', headSha()]);
      expect(r.status, 'a dirty tree must still be refused').not.toBe(0);
      expect(r.manifest!.failures.join('\n')).toMatch(/clean worktree/);
      expect(r.manifest!.failures.join('\n'), 'the SHA itself must NOT be the complaint')
        .not.toMatch(/does not match HEAD/);
      return;
    }
    const r = runGate(['--final', '--expected-sha', headSha()]);
    expect(r.status, `final mode should pass; failures: ${JSON.stringify(r.manifest?.failures)}`).toBe(0);
    expect(r.manifest!.outcome).toBe('PASS');
    expect((r.manifest as unknown as { mode: string }).mode).toBe('final');
    expect((r.manifest as unknown as { source_sha: string }).source_sha).toBe(headSha());
  }, 25 * 60_000);

  it('a MISSING expected SHA fails final mode', () => {
    const r = runGate(['--final']);
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/--final requires --expected-sha/);
  }, 15 * 60_000);

  it('a WRONG expected SHA fails final mode', () => {
    const r = runGate(['--final', '--expected-sha', 'a'.repeat(40)]);
    expect(r.status).not.toBe(0);
    expect(r.manifest!.failures.join('\n')).toMatch(/does not match HEAD/);
  }, 15 * 60_000);

  it('a malformed expected SHA is a USAGE error, not a silent pass', () => {
    const r = runGate(['--final', '--expected-sha', 'not-a-sha']);
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('USAGE-ERROR');
    expect(r.manifest!.failures.join('\n')).toMatch(/not a 40-character git object id/);
  }, 15 * 60_000);

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
    ], { cwd: exported, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60_000 });

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
  it('a fake trivy with the right version and valid JSON but a nonzero exit fails the gate', () => {
    // The image command carries no --exit-code, so findings return zero. Therefore ANY
    // nonzero status is a scanner failure — and parseable stdout is not evidence that the
    // scan completed. The previous `rec.failed = false` discarded this unconditionally.
    const binDir = mkdtempSync(join(tmpdir(), 'eye-c15-fake-trivy-'));
    scratch.push(binDir);
    const realTrivy = spawnSync('sh', ['-c', 'command -v trivy'], { encoding: 'utf8' }).stdout.trim();
    const fake = join(binDir, 'trivy');
    // Correct version, valid JSON on stdout, deliberate nonzero exit for `image` only.
    // Everything else delegates to the real binary so the run reaches the image step.
    writeFileSync(fake, [
      '#!/bin/sh',
      'for a in "$@"; do',
      '  if [ "$a" = "image" ]; then',
      '    for b in "$@"; do',
      '      if [ "$b" = "--download-db-only" ]; then exec ' + JSON.stringify(realTrivy) + ' "$@"; fi',
      '    done',
      '    echo \'{"SchemaVersion":2,"ArtifactName":"fake","Results":[]}\'',
      '    echo "fake scanner failure" >&2',
      '    exit 3',
      '  fi',
      'done',
      'exec ' + JSON.stringify(realTrivy) + ' "$@"',
      '',
    ].join('\n'));
    spawnSync('chmod', ['+x', fake]);

    // The fake must satisfy the pin AND the executable-digest check, so point the digest
    // expectation at the fake by shadowing the pins for this run only.
    const pinsPath = 'scripts/gate/scanner-pins.json';
    const pins = JSON.parse(readFileSync(join(REPO, pinsPath), 'utf8')) as {
      tools: Record<string, { artifacts: Record<string, { executable_sha256: string; executable_bytes: number }> }>;
    };
    const hostKey = `${process.platform}-${process.arch}`;
    const fakeBytes = readFileSync(fake);
    pins.tools.trivy.artifacts[hostKey]!.executable_sha256 =
      createHash('sha256').update(fakeBytes).digest('hex');
    pins.tools.trivy.artifacts[hostKey]!.executable_bytes = fakeBytes.byteLength;

    const r = withReplacedFile(pinsPath, `${JSON.stringify(pins, null, 2)}\n`, () =>
      runGate([], { PATH: `${binDir}:${process.env.PATH ?? ''}` }));

    expect(r.status, 'a nonzero scanner exit must block').not.toBe(0);
    expect(r.manifest!.outcome).toBe('FAIL');
    const text = r.manifest!.failures.join('\n');
    expect(text).toMatch(/trivy-image-\d: trivy exited 3/);
    expect(text).toMatch(/nonzero status is a scanner failure, not a finding/);

    // Raw stdout, stderr and exit status must all be preserved.
    const m = r.manifest as unknown as {
      steps: Array<{ id: string; exit_code: number; stdout_sha256: string; stderr_sha256: string }>;
      evidence_artifacts: Array<{ path: string }>;
    };
    const imageStep = m.steps.find((s) => s.id.startsWith('trivy-image-'))!;
    expect(imageStep.exit_code).toBe(3);
    expect(imageStep.stdout_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(imageStep.stderr_sha256).toMatch(/^[a-f0-9]{64}$/);
    const bound = m.evidence_artifacts.map((a) => a.path);
    expect(bound).toContain(`${imageStep.id}.stdout.txt`);
    expect(bound).toContain(`${imageStep.id}.stderr.txt`);
  }, 25 * 60_000);
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
  }, 15 * 60_000);

  it('an unrecognised argument is a USAGE error with a manifest', () => {
    const r = runGate(['--not-a-real-flag']);
    expect(r.status).not.toBe(0);
    expect(r.manifest!.outcome).toBe('USAGE-ERROR');
    expect(r.manifest!.failures.join('\n')).toMatch(/unrecognised argument/);
  }, 15 * 60_000);

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
  }, 15 * 60_000);
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
  }, 15 * 60_000);

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
