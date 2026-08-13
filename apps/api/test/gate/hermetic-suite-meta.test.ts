/**
 * C16-R3.4.3 §E — the WHOLE behavioural suite, under armed shims for all seven tools.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────────────
 * R3.4.2 shipped a control that ran ONE representative gate invocation under shims for curl,
 * wget, docker, skopeo and crane — trivy and gitleaks were not poisoned at all — and a separate
 * control that spawned the suite under that same partial set. Neither established the claim
 * that was made for them: that the entire 44-test behavioural suite passes with every external
 * tool, scanners included, replaced by a refusing stub.
 *
 * This control makes exactly that claim and proves it by execution:
 *   1. it runs `c15-runner-behaviour.test.ts` in a child vitest whose PATH is poisoned for
 *      curl, wget, docker, skopeo, crane, trivy AND gitleaks;
 *   2. it asserts the child reports 44 passed and 0 failed — not "at least", exactly, so a
 *      suite that silently shrinks fails here;
 *   3. it asserts the marker log is EMPTY, so nothing in those 44 tests reached a live tool;
 *   4. it invokes each of the seven shims separately, proving every one is armed and exits 97 —
 *      without which "the log is empty" would be indistinguishable from "the stubs do nothing".
 *
 * The count is deliberately literal. If the behavioural suite gains or loses a test, this
 * control fails until someone updates the number on purpose.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = join(__dirname, '..', '..');
const SUITE = 'test/gate/c15-runner-behaviour.test.ts';

/** Every external tool the gate could possibly reach for. */
const POISONED_TOOLS = ['curl', 'wget', 'docker', 'skopeo', 'crane', 'trivy', 'gitleaks'] as const;

/** The behavioural suite's exact size, asserted rather than bounded. */
const EXPECTED_TESTS = 44;

describe('C16-R3.4.3 §E — the entire behavioural suite runs with every external tool poisoned', () => {
  let markers: string;
  let poison: string;
  let log: string;
  let child: { status: number | null; stdout: string; stderr: string };

  beforeAll(() => {
    markers = mkdtempSync(join(tmpdir(), 'eye-meta-markers-'));
    poison = mkdtempSync(join(tmpdir(), 'eye-meta-poison-'));
    log = join(markers, 'live-calls.log');
    for (const tool of POISONED_TOOLS) {
      const p = join(poison, tool);
      writeFileSync(p, '#!/bin/sh\n'
        + `echo "$(basename "$0") $*" >> ${JSON.stringify(log)}\n`
        + `echo "POISON: live '${tool}' invocation during the hermetic suite" >&2\n`
        + 'exit 97\n');
      chmodSync(p, 0o755);
    }

    child = spawnSync('npx', ['vitest', 'run', SUITE], {
      cwd: API, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60_000,
      env: {
        ...process.env,
        // The poison directory FIRST: any live invocation, from the suite or from anything it
        // spawns, finds a refusing stub before it finds a real binary.
        PATH: `${poison}:${process.env.PATH ?? ''}`,
        CI: '1',
        // The summary is PARSED, so it must not arrive wrapped in colour escapes. A hosted
        // runner colourises by default and a local terminal may not, which is exactly the kind
        // of difference that makes a control pass locally and fail in CI.
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    });
  }, 16 * 60_000);

  afterAll(() => {
    for (const d of [markers, poison]) rmSync(d, { recursive: true, force: true });
  });

  it(`the child suite reports exactly ${EXPECTED_TESTS} passed and 0 failed`, () => {
    // Belt and braces: `NO_COLOR` is honoured by vitest, but the surrounding runner can still
    // inject escapes, so strip them before parsing rather than trusting the child's settings.
    // eslint-disable-next-line no-control-regex
    const output = `${child.stdout}${child.stderr}`.replace(/\[[0-9;]*m/g, '');
    expect(child.status, `child vitest exited ${child.status}:\n${output.slice(-4000)}`).toBe(0);
    // vitest prints `Tests  44 passed (44)`; a run with failures prints a `failed` term too.
    const summary = /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed\s+\((\d+)\)/.exec(output);
    expect(summary, `no test summary in child output:\n${output.slice(-4000)}`).not.toBeNull();
    const [, failed, passed, total] = summary as RegExpExecArray;
    expect(Number(failed ?? 0), 'a poisoned run must not fail any test').toBe(0);
    expect(Number(passed)).toBe(EXPECTED_TESTS);
    expect(Number(total)).toBe(EXPECTED_TESTS);
  });

  it('and made ZERO live calls to any of the seven tools', () => {
    const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
    expect(calls, `live tool invocations recorded: ${calls.join(' | ')}`).toHaveLength(0);
  });

  it.each(POISONED_TOOLS.map((t) => [t]))(
    'the %s shim is ARMED — it refuses, exits 97 and records the attempt',
    (tool) => {
      // Proven per tool, because a single armed shim says nothing about the other six, and an
      // empty marker log under inert stubs would be a vacuous pass.
      const res = spawnSync(tool, ['--version'], {
        encoding: 'utf8', env: { ...process.env, PATH: `${poison}:${process.env.PATH ?? ''}` },
      });
      expect(res.status, `the ${tool} shim must refuse`).toBe(97);
      expect(res.stderr).toMatch(new RegExp(`POISON: live '${tool}' invocation`));
      expect(readFileSync(log, 'utf8')).toMatch(new RegExp(`^${tool} --version$`, 'm'));
      // Reset so this control's own invocations never contaminate the zero-call assertion.
      writeFileSync(log, '');
    },
  );
});
