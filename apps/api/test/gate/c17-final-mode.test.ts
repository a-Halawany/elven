/**
 * C17.2 B — final mode is an observed source/output posture, not a claimed boolean.
 *
 * These controls execute the real gate. They target error and filesystem paths that do not need
 * a successful network call, and use only temporary files outside the repository.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO = join(__dirname, '..', '..', '..', '..');
const GATE = join(REPO, 'scripts', 'gate', 'licence-obligations.mjs');
const TIMEOUT = 600_000;
const cleanup: string[] = [];

const tmp = (prefix: string) => {
  const p = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(p);
  return p;
};

afterEach(() => {
  for (const p of cleanup.splice(0)) rmSync(p, { recursive: true, force: true });
});

describe('C17.2 B — final source and output posture', () => {
  it('fails closed when git status fails with empty stdout', () => {
    const bin = tmp('eye-c17-git-shim-');
    const out = tmp('eye-c17-final-out-');
    const git = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    const shim = join(bin, 'git');
    writeFileSync(shim, `#!/bin/sh\nif [ "$1" = status ]; then exit 73; fi\nexec "${git}" "$@"\n`);
    chmodSync(shim, 0o755);
    const sha = spawnSync(git, ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();

    const r = spawnSync(process.execPath, [
      GATE, '--out', out, '--as-of', '2026-08-15', '--final', '--expected-sha', sha,
    ], {
      cwd: REPO,
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` },
      encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 128 * 1024 * 1024,
    });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/git status.*failed.*73/i);
  }, TIMEOUT);

  it('refuses a preplanted artifact symlink without following or overwriting it', () => {
    const out = tmp('eye-c17-symlink-out-');
    const targetDir = tmp('eye-c17-symlink-target-');
    const target = join(targetDir, 'sentinel.txt');
    writeFileSync(target, 'DO NOT OVERWRITE\n');
    symlinkSync(target, join(out, 'license-inventory.json'));

    const r = spawnSync(process.execPath, [GATE, '--out', out, '--as-of', '2026-08-15'], {
      cwd: REPO, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 128 * 1024 * 1024,
    });
    expect(r.status).not.toBe(0);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/output directory.*empty|symlink/i);
    expect(readFileSync(target, 'utf8')).toBe('DO NOT OVERWRITE\n');
  }, TIMEOUT);
});
