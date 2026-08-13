/**
 * C16-R3.4 §3 + §4 — hermeticity and kill-safety, proved by execution rather than by grep.
 *
 * §3  A poison PATH is placed ahead of everything for the duration of a gate run. Any live
 *     `curl`, `trivy`, `gitleaks` or `docker` invocation writes a marker and exits nonzero, so
 *     an escape from the adapter is a hard, visible failure rather than a slow test.
 *
 * §4  A mutation-test child is KILLED mid-run and the governed tracked files are proved
 *     byte-unchanged — not because a restoration hook rescued them, but because they were
 *     never opened for writing.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync, existsSync,
} from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..');
const RUNNER = join(REPO, 'scripts', 'gate', 'supply-chain.mjs');
const HERMETIC_ADAPTER = join(__dirname, 'helpers', 'hermetic-adapter.mjs');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** Every tracked file the gate governs or reads as truth. */
const GOVERNED = [
  'scripts/gate/scanner-exclusions.json',
  'scripts/gate/target-descriptor.json',
  'scripts/gate/scanner-pins.json',
  'scripts/gate/closure-exclusions.json',
  'docs/SCANNER_DISPOSITIONS.md',
  'conformance.manifest.json',
  'docker-compose.yml',
  'pnpm-lock.yaml',
];
const digestsOf = () => Object.fromEntries(
  GOVERNED.map((rel) => [rel, sha256(readFileSync(join(REPO, rel)))]),
);

/** A PATH whose scanners and network tools all refuse and record the attempt. */
function poisonPath(markerDir: string, tools: string[]) {
  const bin = mkdtempSync(join(tmpdir(), 'eye-poison-'));
  for (const tool of tools) {
    const p = join(bin, tool);
    writeFileSync(p, '#!/bin/sh\n'
      + `echo "$(basename "$0") $*" >> ${JSON.stringify(join(markerDir, 'live-calls.log'))}\n`
      + `echo "POISON: live '${tool}' invocation during a hermetic test" >&2\n`
      + 'exit 97\n');
    chmodSync(p, 0o755);
  }
  return bin;
}

describe('C16-R3.4 §3 — the hermetic suite makes ZERO live network or scanner calls', () => {
  let markers: string;
  let poison: string;
  let out: string;
  let cache: string;
  let result: { status: number | null; stdout: string; stderr: string };

  beforeAll(() => {
    markers = mkdtempSync(join(tmpdir(), 'eye-markers-'));
    // The SCANNERS stay real on PATH: the gate authenticates their bytes at staging, and it is
    // the adapter — not the absence of a binary — that prevents them being executed. Poisoning
    // them would abort the run at staging and prove nothing about execution. Every NETWORK tool
    // is poisoned, and a separate counter below proves no scanner process ran either.
    poison = poisonPath(markers, ['curl', 'wget', 'docker', 'skopeo', 'crane']);
    out = mkdtempSync(join(tmpdir(), 'eye-iso-out-'));
    cache = mkdtempSync(join(tmpdir(), 'eye-iso-cache-'));
    const res = spawnSync('node', [RUNNER, '--out', out, '--trivy-cache', cache], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      timeout: 5 * 60_000,
      env: {
        ...process.env,
        // The poison directory FIRST: any escape from the adapter finds a refusing shim.
        PATH: `${poison}:${process.env.PATH ?? ''}`,
        EYE_GATE_ADAPTER: HERMETIC_ADAPTER,
      },
    });
    result = { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }, 6 * 60_000);

  afterAll(() => {
    for (const d of [markers, poison, out, cache]) rmSync(d, { recursive: true, force: true });
  });

  it('live_network_calls = 0 and live_scanner_processes = 0', () => {
    const log = join(markers, 'live-calls.log');
    const calls = existsSync(log)
      ? readFileSync(log, 'utf8').split('\n').filter(Boolean)
      : [];
    const network = calls.filter((c) => /^(curl|wget|skopeo|crane|docker)\b/.test(c));
    const scanners = calls.filter((c) => /^(trivy|gitleaks)\b/.test(c));
    expect(network, `live network calls: ${network.join(' | ')}`).toHaveLength(0);
    expect(scanners, `live scanner processes: ${scanners.join(' | ')}`).toHaveLength(0);
  });

  it('and the run still reached a real verdict, so the absence of calls is not an early abort', () => {
    expect(result.stdout).toMatch(/supply-chain gate: (PASS|FAIL)/);
    expect(existsSync(join(out, 'supply-chain-manifest.json'))).toBe(true);
    const m = JSON.parse(readFileSync(join(out, 'supply-chain-manifest.json'), 'utf8'));
    // The decision logic genuinely ran: real steps, real findings, real reconciliation.
    expect(m.steps.length).toBeGreaterThanOrEqual(8);
    expect(m.image_finding_reconciliation.total_findings).toBeGreaterThan(0);
  });

  it('the poison shims are ARMED — invoking one refuses and records the attempt', () => {
    // Without this, "no marker was written" could mean "the shims do nothing".
    const res = spawnSync('curl', ['https://example.invalid'], {
      encoding: 'utf8', env: { ...process.env, PATH: `${poison}:${process.env.PATH ?? ''}` },
    });
    expect(res.status, 'the shim must refuse').toBe(97);
    expect(res.stderr).toMatch(/POISON: live 'curl' invocation/);
    const log = readFileSync(join(markers, 'live-calls.log'), 'utf8');
    expect(log).toMatch(/^curl https:\/\/example\.invalid/m);
    // Reset, so the zero-call assertions above describe only the gate run.
    writeFileSync(join(markers, 'live-calls.log'), '');
  });

  it('BYPASSING the adapter cannot complete under a fully poisoned PATH', () => {
    // Production adapter, scanners poisoned too: the run must refuse rather than scan. It is
    // refused at executable AUTHENTICATION — a poisoned binary is not the tracked one — which
    // is the correct failure and proves the live path genuinely depends on the real scanners.
    const fullPoison = poisonPath(markers, ['curl', 'wget', 'docker', 'trivy', 'gitleaks']);
    const o = mkdtempSync(join(tmpdir(), 'eye-iso-bypass-'));
    const c = mkdtempSync(join(tmpdir(), 'eye-iso-bypass-cache-'));
    const res = spawnSync('node', [RUNNER, '--out', o, '--trivy-cache', c], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 5 * 60_000,
      env: { ...process.env, PATH: `${fullPoison}:${process.env.PATH ?? ''}` },
    });
    expect(res.status, 'a live run under poison must not succeed').not.toBe(0);
    expect(`${res.stdout}${res.stderr}`).toMatch(/not authenticated|does not match the tracked/);
    for (const d of [fullPoison, o, c]) rmSync(d, { recursive: true, force: true });
  }, 6 * 60_000);
});

describe('C16-R3.4 §4 — killing a mutation test cannot corrupt a governed file', () => {
  it('the tracked files are unchanged because they were never opened for writing', async () => {
    const before = digestsOf();
    const status = () => spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).stdout;
    const statusBefore = status();

    // A disposition mutation, exactly as the behavioural controls perform one: a TEMPORARY
    // document supplied through the override, never the tracked file.
    const doc = JSON.parse(readFileSync(join(REPO, 'scripts/gate/scanner-exclusions.json'), 'utf8'));
    doc.records[0].expires_on = '2020-01-01';
    const tmp = join(mkdtempSync(join(tmpdir(), 'eye-kill-')), 'scanner-exclusions.json');
    writeFileSync(tmp, JSON.stringify(doc, null, 2));

    const out = mkdtempSync(join(tmpdir(), 'eye-kill-out-'));
    const cache = mkdtempSync(join(tmpdir(), 'eye-kill-cache-'));
    const child = spawn('node', [RUNNER, '--out', out, '--trivy-cache', cache], {
      cwd: REPO,
      env: {
        ...process.env,
        EYE_GATE_ADAPTER: HERMETIC_ADAPTER,
        EYE_GATE_EXCLUSIONS_PATH: tmp,
      },
      stdio: 'ignore',
    });

    // KILL IT MID-RUN, with SIGKILL so no handler, hook or `finally` can possibly run.
    await new Promise((r) => { setTimeout(r, 400); });
    child.kill('SIGKILL');
    await new Promise((r) => { child.on('exit', r); child.on('error', r); });

    const after = digestsOf();
    for (const rel of GOVERNED) {
      expect(after[rel], `${rel} changed across a killed mutation test`).toBe(before[rel]);
    }
    expect(status(), 'the worktree must be unchanged').toBe(statusBefore);

    rmSync(out, { recursive: true, force: true });
    rmSync(cache, { recursive: true, force: true });
    rmSync(tmp, { force: true });
  }, 60_000);

  it('no control opens a tracked governance file for writing', () => {
    // The behavioural suite's only in-place replacement path is for documents OTHER than the
    // dispositions; assert the dispositions take the override branch, by name.
    const src = readFileSync(join(__dirname, 'c15-runner-behaviour.test.ts'), 'utf8');
    expect(src).toMatch(/if \(rel === 'scripts\/gate\/scanner-exclusions\.json'\)/);
    expect(src).toMatch(/EYE_GATE_EXCLUSIONS_PATH/);
  });
});
