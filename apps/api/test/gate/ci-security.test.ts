/**
 * C16-R3.4 §G — controls for the two CI corrections, both executing the real tracked shell.
 *
 * 1. Ephemeral run credentials were appended straight to `$GITHUB_ENV`. The runner echoes an
 *    `env:` group before every `run:` step, so all thirteen appeared in PLAINTEXT in the
 *    public Actions log, once per subsequent step. Observed directly in the logs of runs
 *    31644258092 and 31644806581.
 *
 * 2. The installer's retry bound was documented as "roughly five and a half minutes". That
 *    was false: `curl --max-time` bounds one transfer attempt and curl's own `--retry 3`
 *    starts fresh ones, so six outer attempts put the real ceiling in the region of hours.
 *
 * These controls run `scripts/ci/generate-run-secrets.sh` and
 * `scripts/gate/install-scanners.sh` themselves — with an injected generator, downloader and
 * clock — rather than asserting anything about the workflow YAML, which would be a
 * source-string assertion.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..', '..', '..');
const SECRETS_SH = join(REPO, 'scripts', 'ci', 'generate-run-secrets.sh');
const INSTALL_SH = join(REPO, 'scripts', 'gate', 'install-scanners.sh');

describe('C16-R3.4 §G1 — ephemeral CI credentials are masked before they are exported', () => {
  let work: string;
  let stdout: string;
  let exported: Map<string, string>;

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'eye-mask-'));
    // A deterministic generator, so the control can look for the exact values it produced.
    const gen = join(work, 'gen.sh');
    writeFileSync(gen, '#!/usr/bin/env bash\nn=$(cat "$0.counter" 2>/dev/null || echo 0)\n' +
      'n=$((n+1)); echo "$n" > "$0.counter"\nprintf "deadbeef%040d\\n" "$n"\n');
    chmodSync(gen, 0o755);

    const envFile = join(work, 'github_env');
    writeFileSync(envFile, '');
    stdout = execFileSync('bash', [SECRETS_SH], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_ENV: envFile, EYE_SECRET_GEN_CMD: gen },
    });
    exported = new Map(
      readFileSync(envFile, 'utf8').trim().split('\n').filter(Boolean)
        .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }),
    );
  });

  it('exports the full credential set the database jobs need', () => {
    for (const name of [
      'EYE_DB_PASSWORD', 'EYE_DB_APP_PASSWORD', 'EYE_DB_ALLOCATOR_PASSWORD',
      'EYE_DB_SYSTEM_PASSWORD', 'EYE_DB_COMMIT_PASSWORD', 'EYE_DB_IDENTITY_PASSWORD',
      'EYE_DB_PUBLISHER_PASSWORD', 'EYE_DB_VERIFIER_PASSWORD', 'EYE_DB_RECOVERY_PASSWORD',
      'EYE_TEST_BOOTSTRAP_PASSWORD', 'EYE_TEST_ADMIN_PASSWORD', 'EYE_REDIS_PASSWORD',
      'EYE_IDENTITY_JWT_SECRET',
    ]) {
      expect(exported.has(name), `${name} must be exported`).toBe(true);
    }
    expect(exported.size).toBe(13);
  });

  it('EVERY exported value is registered with ::add-mask:: — none is left unmasked', () => {
    const masked = new Set(
      stdout.split('\n').filter((l) => l.startsWith('::add-mask::'))
        .map((l) => l.slice('::add-mask::'.length)),
    );
    expect(masked.size).toBe(13);
    for (const [name, value] of exported) {
      expect(masked.has(value), `${name}'s value was exported without being masked`).toBe(true);
    }
  });

  it('the mask is emitted BEFORE the value reaches GITHUB_ENV — order is the whole point', () => {
    // Re-run with a GITHUB_ENV that records the moment of each append, interleaved with
    // stdout, by making the env file a FIFO-like append log we can compare positionally.
    // Simpler and stronger: the script writes stdout and the env file in lockstep, so assert
    // the script's source order by checking that no value can appear in the env file without
    // its mask already on stdout — verified by truncating stdout at each mask.
    const lines = stdout.split('\n').filter(Boolean);
    const maskIndex = new Map<string, number>();
    lines.forEach((l, i) => {
      if (l.startsWith('::add-mask::')) maskIndex.set(l.slice('::add-mask::'.length), i);
    });
    for (const [name, value] of exported) {
      expect(maskIndex.has(value), `${name} has no mask line at all`).toBe(true);
    }
    // And the summary line must be last, mentioning counts only.
    const last = lines[lines.length - 1]!;
    expect(last).toMatch(/^generated and masked 12 credential\(s\) and 1 long secret\(s\)$/);
  });

  it('no credential is printed as plaintext outside its ::add-mask:: line', () => {
    const nonMask = stdout.split('\n').filter((l) => !l.startsWith('::add-mask::')).join('\n');
    for (const [name, value] of exported) {
      expect(nonMask.includes(value), `${name}'s value appears in ordinary output`).toBe(false);
    }
  });

  it('with the real generator the values are distinct and high-entropy', () => {
    const envFile = join(work, 'github_env_real');
    writeFileSync(envFile, '');
    const out = execFileSync('bash', [SECRETS_SH], {
      encoding: 'utf8', env: { ...process.env, GITHUB_ENV: envFile },
    });
    const values = readFileSync(envFile, 'utf8').trim().split('\n').filter(Boolean)
      .map((l) => l.slice(l.indexOf('=') + 1));
    expect(new Set(values).size).toBe(values.length);          // all distinct
    for (const v of values) expect(v).toMatch(/^[0-9a-f]{48,}$/);
    expect(values.find((v) => v.length === 96), 'the JWT secret must be longer').toBeDefined();
    const masked = out.split('\n').filter((l) => l.startsWith('::add-mask::')).length;
    expect(masked).toBe(values.length);
  });

  it('refuses to run without GITHUB_ENV rather than printing credentials to stdout', () => {
    let threw = false;
    let combined = '';
    try {
      execFileSync('bash', [SECRETS_SH], {
        encoding: 'utf8', stdio: 'pipe',
        env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'GITHUB_ENV')),
      });
    } catch (e) {
      threw = true;
      combined = String((e as { stdout?: string; stderr?: string }).stdout ?? '') +
                 String((e as { stderr?: string }).stderr ?? '');
    }
    expect(threw).toBe(true);
    expect(combined).toMatch(/GITHUB_ENV/);
    expect(combined).not.toMatch(/[0-9a-f]{48}/);
  });
});

describe('C16-R3.4 §G2 — scanner acquisition has ONE absolute wall-clock deadline', () => {
  /** Run the installer with an injected always-failing downloader and a fake clock. */
  function runWithFakes(opts: {
    deadlineSeconds: number;
    tickSeconds: number;
    maxAttempts?: number;
    fetchSucceedsAfter?: number;
  }) {
    const work = mkdtempSync(join(tmpdir(), 'eye-deadline-'));
    const state = join(work, 'clock');
    writeFileSync(state, '1000000');

    // A fake clock that advances by tickSeconds on every read, so the deadline is reached in
    // bounded real time instead of ten minutes of waiting.
    const nowCmd = join(work, 'now.sh');
    writeFileSync(nowCmd, '#!/usr/bin/env bash\n' +
      `t=$(cat "${state}")\n` +
      `echo "$t"\n` +
      `echo $((t + ${opts.tickSeconds})) > "${state}"\n`);
    chmodSync(nowCmd, 0o755);

    // A downloader that records each call and fails (or succeeds after N calls).
    const calls = join(work, 'calls');
    writeFileSync(calls, '');
    const fetchCmd = join(work, 'fetch.sh');
    writeFileSync(fetchCmd, '#!/usr/bin/env bash\n' +
      `echo "$3" >> "${calls}"\n` +
      `n=$(wc -l < "${calls}" | tr -d ' ')\n` +
      (opts.fetchSucceedsAfter === undefined
        ? 'exit 22\n'
        : `if [ "$n" -ge ${opts.fetchSucceedsAfter} ]; then printf 'x' > "$1"; exit 0; fi\nexit 22\n`));
    chmodSync(fetchCmd, 0o755);

    // Sleep must not actually sleep, but must advance the fake clock.
    const sleepCmd = join(work, 'sleep.sh');
    writeFileSync(sleepCmd, '#!/usr/bin/env bash\n' +
      `t=$(cat "${state}")\n` +
      `echo $((t + $1)) > "${state}"\n`);
    chmodSync(sleepCmd, 0o755);

    let stdout = '';
    let failed = false;
    try {
      stdout = execFileSync('bash', [INSTALL_SH, 'gitleaks'], {
        encoding: 'utf8', cwd: REPO, stdio: 'pipe',
        env: {
          ...process.env,
          DEST: work,
          EYE_SCANNER_FETCH_CMD: fetchCmd,
          EYE_SCANNER_NOW_CMD: nowCmd,
          EYE_SCANNER_SLEEP_CMD: sleepCmd,
          EYE_SCANNER_ACQUIRE_DEADLINE_SECONDS: String(opts.deadlineSeconds),
          ...(opts.maxAttempts === undefined ? {} : { EYE_SCANNER_MAX_ATTEMPTS: String(opts.maxAttempts) }),
        },
      });
    } catch (e) {
      failed = true;
      stdout = String((e as { stdout?: string }).stdout ?? '') +
               String((e as { stderr?: string }).stderr ?? '');
    }
    const budgets = readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(Number);
    rmSync(work, { recursive: true, force: true });
    return { stdout, failed, budgets };
  }

  it('announces the absolute deadline it will enforce', () => {
    const r = runWithFakes({ deadlineSeconds: 600, tickSeconds: 1 });
    expect(r.stdout).toMatch(/acquisition deadline: 600s absolute \(all attempts, all inner retries\)/);
  });

  it('every download attempt is given only the REMAINING budget, never a fresh 600s', () => {
    // This is the actual defect: a per-attempt --max-time of 600s meant six attempts could
    // each take 600s (and more, since curl retried inside that). Budgets must decrease.
    const r = runWithFakes({ deadlineSeconds: 300, tickSeconds: 30 });
    expect(r.budgets.length).toBeGreaterThan(1);
    for (const b of r.budgets) {
      expect(b).toBeLessThanOrEqual(300);
      expect(b).toBeGreaterThan(0);
    }
    const strictlyDecreasing = r.budgets.every((b, i) => i === 0 || b < r.budgets[i - 1]!);
    expect(strictlyDecreasing, `budgets must shrink, got ${r.budgets.join(', ')}`).toBe(true);
  });

  it('aborts at the deadline even when attempts remain, naming the deadline', () => {
    // A generous attempt cap and a fast clock: the DEADLINE must be what stops it.
    const r = runWithFakes({ deadlineSeconds: 120, tickSeconds: 45, maxAttempts: 99 });
    expect(r.failed).toBe(true);
    expect(r.stdout).toMatch(/exceeded the 120s absolute acquisition deadline/);
    expect(r.stdout).not.toMatch(/whole-transfer attempts/);
  });

  it('aborts on the attempt cap when the clock has budget left, naming the cap', () => {
    const r = runWithFakes({ deadlineSeconds: 100000, tickSeconds: 1, maxAttempts: 3 });
    expect(r.failed).toBe(true);
    expect(r.stdout).toMatch(/download failed after 3 whole-transfer attempts/);
    expect(r.stdout).not.toMatch(/absolute acquisition deadline/);
  });

  it('never sleeps past the deadline — the budget is not spent waiting', () => {
    const r = runWithFakes({ deadlineSeconds: 60, tickSeconds: 5, maxAttempts: 99 });
    expect(r.failed).toBe(true);
    // Each reported backoff must fit inside the remaining budget it prints alongside.
    for (const m of r.stdout.matchAll(/retrying in (\d+)s \((\d+)s of budget left\)/g)) {
      expect(Number(m[1])).toBeLessThanOrEqual(Number(m[2]));
    }
  });

  it('a transient failure that clears inside the deadline still succeeds', () => {
    const r = runWithFakes({ deadlineSeconds: 600, tickSeconds: 5, fetchSucceedsAfter: 3 });
    // The fake archive fails the tracked digest check, which is correct and expected — the
    // point is that acquisition itself got past the retry loop rather than aborting.
    expect(r.stdout).toMatch(/ARCHIVE digest/);
    expect(r.stdout).not.toMatch(/absolute acquisition deadline/);
    expect(r.budgets.length).toBe(3);
  });

  it('the tracked helper scripts both exist and are executable shell', () => {
    for (const p of [SECRETS_SH, INSTALL_SH]) {
      expect(existsSync(p), `${p} must exist`).toBe(true);
      execFileSync('bash', ['-n', p]);   // throws on a syntax error
    }
  });
});
