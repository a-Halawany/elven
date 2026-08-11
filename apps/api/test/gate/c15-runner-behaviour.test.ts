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
    doc.records.push({
      ...(doc.records[0] as Record<string, unknown>),
      id: 'SCX-UNUSED',
      advisory_id: 'CVE-2019-00001',
      advisory_ids: undefined,
      package_name: 'left-pad',
      package_purl_prefix: 'pkg:apk/alpine/left-pad@1.0.0',
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
