/**
 * CP-6 B40 §0 — the confined-process launcher (apps/api/src/observation/sandbox/spawn-confined.ts; DESIGN D3). Each case runs a REAL child
 * under Node 24's permission model and asserts what it can and cannot do: read only what it was granted, never write, never spawn a process
 * or a worker, no code generation from strings, no inherited environment; killed at its wall-clock limit and at its output limit; a crash
 * or a heap exhaustion is `failed`. Network denial is NOT a property of this launcher (D3: B103 / B109) and nothing here claims it.
 * The probe scripts are written at run time into a temporary directory and removed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { confinedFlags, confinedSpawn, FORBIDDEN_CAPABILITY_FLAGS } from '../../src/observation/sandbox/spawn-confined.js';

let dir = '';
const script = (name: string, body: string): string => { const p = join(dir, name); writeFileSync(p, body); return p; };
const CANARY = 'EYE_B40_CANARY_NOT_INHERITED';

beforeAll(() => { dir = realpathSync(mkdtempSync(join(tmpdir(), 'b40-confined-'))); process.env[CANARY] = 'visible-to-the-parent-only'; });
afterAll(() => { delete process.env[CANARY]; if (dir !== '') rmSync(dir, { recursive: true, force: true }); });

describe('B40 §0 · the confined launcher — what the child may do', () => {
  it('runs the script, hands it stdin and returns its stdout: ok, exit 0, the flags recorded', async () => {
    const p = script('echo.mjs', `let b=[]; for await (const c of process.stdin) b.push(c);
      const { createHash } = await import('node:crypto'); process.stdout.write(createHash('sha256').update(Buffer.concat(b)).digest('hex'));`);
    const r = await confinedSpawn({ script: p, stdin: 'SYNTHETIC item bytes', timeoutMs: 10_000, maxHeapMb: 64, maxOutputBytes: 1024 });
    expect(r.status, r.stderr).toBe('ok');
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toBe(createHash('sha256').update('SYNTHETIC item bytes').digest('hex'));
    expect(r.flags).toEqual(['--permission', `--allow-fs-read=${p}`, '--disallow-code-generation-from-strings', '--max-old-space-size=64', '--no-warnings']);
  });
  it('reads exactly what it was granted (the item), and nothing else', async () => {
    const item = join(dir, 'item.bin'); writeFileSync(item, 'granted');
    const other = join(dir, 'other.bin'); writeFileSync(other, 'not granted');
    const p = script('read.mjs', `import { readFileSync } from 'node:fs';
      const out = {}; for (const [k, f] of [['item', process.argv[2]], ['other', process.argv[3]], ['hosts', '/etc/hosts']]) {
        try { out[k] = readFileSync(f, 'utf8'); } catch (e) { out[k] = e.code; } }
      process.stdout.write(JSON.stringify(out));`);
    const r = await confinedSpawn({ script: p, args: [item, other], readPaths: [item], timeoutMs: 10_000, maxHeapMb: 64, maxOutputBytes: 4096 });
    expect(r.status, r.stderr).toBe('ok');
    expect(JSON.parse(r.stdout.toString())).toEqual({ item: 'granted', other: 'ERR_ACCESS_DENIED', hosts: 'ERR_ACCESS_DENIED' });
  });
});

describe('B40 §0 · the confined launcher — what the child may NOT do', () => {
  it('never writes, never spawns a process or a worker, generates no code from strings, inherits no environment', async () => {
    const target = join(dir, 'escape.txt');
    const p = script('escape.mjs', `import { writeFileSync } from 'node:fs';
      const out = {};
      try { writeFileSync(process.argv[2], 'escaped'); out.write = 'allowed'; } catch (e) { out.write = e.code; }
      try { (await import('node:child_process')).execFileSync('/bin/echo', ['x']); out.spawn = 'allowed'; } catch (e) { out.spawn = e.code; }
      try { const { Worker } = await import('node:worker_threads'); new Worker('0', { eval: true }); out.worker = 'allowed'; } catch (e) { out.worker = e.code; }
      try { eval('1 + 1'); out.eval = 'allowed'; } catch (e) { out.eval = e.name; }
      try { new Function('return 1')(); out.fn = 'allowed'; } catch (e) { out.fn = e.name; }
      out.env = Object.keys(process.env);
      process.stdout.write(JSON.stringify(out));`);
    const r = await confinedSpawn({ script: p, args: [target], timeoutMs: 10_000, maxHeapMb: 64, maxOutputBytes: 4096 });
    expect(r.status, r.stderr).toBe('ok');
    const o = JSON.parse(r.stdout.toString()) as Record<string, unknown>;
    expect(o).toMatchObject({ write: 'ERR_ACCESS_DENIED', spawn: 'ERR_ACCESS_DENIED', worker: 'ERR_ACCESS_DENIED', eval: 'EvalError', fn: 'EvalError' });
    expect(existsSync(target)).toBe(false);
    const env = o['env'] as string[];
    expect(env).not.toContain(CANARY);
    // the parent's environment is not inherited (macOS may add its own text-encoding variable; nothing of the parent's)
    expect(env.filter((k) => k !== '__CF_USER_TEXT_ENCODING')).toEqual([]);
  });
  it('an explicit, non-secret value is the only environment the child sees', async () => {
    const p = script('env.mjs', `process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== '__CF_USER_TEXT_ENCODING'))));`);
    const r = await confinedSpawn({ script: p, env: { EYE_B40_ENGINE: 'content-inspector@1' }, timeoutMs: 10_000, maxHeapMb: 64, maxOutputBytes: 1024 });
    expect(JSON.parse(r.stdout.toString())).toEqual({ EYE_B40_ENGINE: 'content-inspector@1' });
  });
  it('none of the capability-granting flags is ever passed', () => {
    const f = confinedFlags({ script: '/x/inspector.mjs', readPaths: ['/x/item', '/x/pkg'], maxHeapMb: 128 });
    for (const forbidden of FORBIDDEN_CAPABILITY_FLAGS) expect(f.some((x) => x.startsWith(forbidden))).toBe(false);
    expect(f.filter((x) => x.startsWith('--allow-fs-read='))).toEqual(['--allow-fs-read=/x/inspector.mjs', '--allow-fs-read=/x/item', '--allow-fs-read=/x/pkg']);
  });
});

describe('B40 §0 · the confined launcher — every way it can end', () => {
  it('a child that runs past its wall-clock limit is KILLED: timeout', async () => {
    const p = script('spin.mjs', 'for (;;) {}');
    const t0 = Date.now();
    const r = await confinedSpawn({ script: p, timeoutMs: 500, maxHeapMb: 64, maxOutputBytes: 1024 });
    expect(r.status).toBe('timeout');
    expect(r.signal).toBe('SIGKILL');
    expect(Date.now() - t0).toBeLessThan(5_000);
  });
  it('a child that writes more than its output cap is KILLED: output_limit', async () => {
    const p = script('flood.mjs', `const b = Buffer.alloc(65536, 120); for (;;) { if (!process.stdout.write(b)) await new Promise((r) => process.stdout.once('drain', r)); }`);
    const r = await confinedSpawn({ script: p, timeoutMs: 10_000, maxHeapMb: 64, maxOutputBytes: 100_000 });
    expect(r.status).toBe('output_limit');
    expect(r.stdout.byteLength).toBeLessThanOrEqual(100_000);
  });
  it('a crash (non-zero exit) and a heap exhaustion are failed — the caller\'s unavailable', async () => {
    const crash = await confinedSpawn({ script: script('crash.mjs', 'throw new Error("SYNTHETIC crash")'), timeoutMs: 10_000, maxHeapMb: 64, maxOutputBytes: 1024 });
    expect(crash.status).toBe('failed');
    expect(crash.exitCode).not.toBe(0);
    expect(crash.stderr).toMatch(/SYNTHETIC crash/);
    const hog = await confinedSpawn({ script: script('hog.mjs', 'const a = []; for (;;) a.push(new Array(1e6).fill(1.5));'), timeoutMs: 30_000, maxHeapMb: 32, maxOutputBytes: 1024 });
    expect(hog.status).toBe('failed');
  }, 40_000);
  it('a malformed call is refused before anything is started (a relative path, a cap out of range)', () => {
    expect(() => confinedFlags({ script: 'relative.mjs', maxHeapMb: 64 })).toThrow(/must be absolute/);
    expect(() => confinedFlags({ script: '/x/a.mjs', readPaths: ['/x/a,b'], maxHeapMb: 64 })).toThrow(/comma/);
    expect(() => confinedFlags({ script: '/x/a.mjs', maxHeapMb: 8 })).toThrow(/maxHeapMb/);
    expect(() => confinedSpawn({ script: '/x/a.mjs', timeoutMs: 0, maxHeapMb: 64, maxOutputBytes: 1 })).toThrow(/timeoutMs/);
  });
});
