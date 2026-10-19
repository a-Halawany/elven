/**
 * B80 integration pass (2026-10-19) — THE ACT TARGET IS DECIDED BEFORE ANYTHING IS CONTACTED.
 *
 * The B82 act builder's probe logged two principals into the LIVE demonstration (:3401) during what was meant to be a
 * rehearsal: scripts/phase4/governed.mjs defaulted EYE_API to the live address and the act authenticated before it
 * looked at its target. These controls run the REAL entry points as child processes against a recording HTTP server
 * on loopback and prove that every refusal happens with ZERO requests to it — no login, so no session — while a
 * consistent declaration does reach it (non-vacuity: the first request an act makes is the login).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveActTarget } from '../../../../scripts/act-target.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
/** The current stages' act and release-candidate entry points, as far as they exist on this branch. */
const ENTRY_POINTS = ['act-b80', 'act-b80-candidate', 'act-b81', 'act-b81-candidate', 'act-b50', 'act-b50-candidate',
  'act-b82', 'act-b82-candidate']
  .map((n) => join(REPO, 'scripts', 'phase6', `${n}.mjs`))
  .filter((p) => existsSync(p));

let server: Server;
let port = 0;
const seen: string[] = [];
let root = '';

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'eye-act-target-'));
  server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'EYE-AUT-000', message: 'recording server: no session is ever issued' }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(root, { recursive: true, force: true });
});

/** Run an entry point with exactly the given declaration (nothing inherited that names a target). */
function run(script: string, decl: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || /^EYE_(API|API_BASE|ACT_TARGET|DB_NAME|WEB_BASE|LIVE_API|LIVE_WEB)$/.test(k)) continue;
    env[k] = v;
  }
  // The env file the script would read lives in a throwaway root, so nothing real is read or written.
  Object.assign(env, { EYE_ROOT: root, EYE_DB_PORT: '1' }, decl);
  return new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { out += b; });
    const t = setTimeout(() => child.kill('SIGKILL'), 60_000);
    child.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
  });
}

const fake = () => `http://127.0.0.1:${port}`;
const REFUSALS: Array<[string, () => Record<string, string>, RegExp]> = [
  ['no declaration at all', () => ({}), /EYE_ACT_TARGET is not set/],
  ['a rehearsal that names no API', () => ({ EYE_ACT_TARGET: 'rehearsal', EYE_DB_NAME: 'eye_demo_rehearsal' }), /EYE_API is not set/],
  ['a rehearsal whose API is the live one (another loopback spelling)', () => ({
    EYE_ACT_TARGET: 'rehearsal', EYE_DB_NAME: 'eye_demo_rehearsal', EYE_API: `http://localhost:${port}`, EYE_LIVE_API: fake(),
  }), /is the LIVE demonstration's API/],
  ['a rehearsal that reads eye_demo', () => ({ EYE_ACT_TARGET: 'rehearsal', EYE_DB_NAME: 'eye_demo', EYE_API: fake() }), /a rehearsal never reads eye_demo/],
  ['a live run on a copy', () => ({ EYE_ACT_TARGET: 'live', EYE_DB_NAME: 'eye_demo_rehearsal', EYE_API: fake(), EYE_LIVE_API: fake() }), /a live run reads eye_demo/],
  ['a live run that names another API', () => ({ EYE_ACT_TARGET: 'live', EYE_DB_NAME: 'eye_demo', EYE_API: fake() }), /a live run talks to the live API/],
  ['an undeclared mode', () => ({ EYE_ACT_TARGET: 'demo', EYE_DB_NAME: 'eye_demo_rehearsal', EYE_API: fake() }), /must be 'rehearsal' or 'live'/],
];

describe('B80 integration pass — the act target (scripts/act-target.mjs)', () => {
  it('the entry points under test exist on this branch', () => {
    expect(ENTRY_POINTS.length).toBeGreaterThanOrEqual(2);
  });

  it.each(REFUSALS)('resolveActTarget refuses %s', (_l, decl, re) => {
    expect(() => resolveActTarget(decl(), { needs: ['api'] })).toThrow(re);
  });

  it('a consistent declaration resolves (rehearsal on its own rig; live on the live API)', () => {
    expect(resolveActTarget({ EYE_ACT_TARGET: 'rehearsal', EYE_DB_NAME: 'eye_demo_b82', EYE_API: 'http://localhost:3411' }))
      .toMatchObject({ mode: 'rehearsal', rehearsal: true, db: 'eye_demo_b82', api: 'http://localhost:3411' });
    expect(resolveActTarget({ EYE_ACT_TARGET: 'live', EYE_DB_NAME: 'eye_demo', EYE_API: 'http://127.0.0.1:3401' }))
      .toMatchObject({ mode: 'live', rehearsal: false, api: 'http://127.0.0.1:3401' });
  });

  for (const script of ENTRY_POINTS) {
    const name = script.split('/').pop();
    it.each(REFUSALS)(`${name}: %s → REFUSED with no request (no login, no session)`, async (_l, decl, re) => {
      const before = seen.length;
      const r = await run(script, decl());
      expect(r.code, r.out).toBe(2);
      expect(r.out).toMatch(/REFUSED \(act target\)/);
      expect(r.out).toMatch(re);
      expect(seen.slice(before), 'requests that reached the recording server').toEqual([]);
    }, 90_000);

    it(`${name}: NON-VACUITY — a consistent rehearsal declaration reaches the server, and its first request is the login`, async () => {
      const before = seen.length;
      const r = await run(script, { EYE_ACT_TARGET: 'rehearsal', EYE_DB_NAME: 'eye_demo_rehearsal', EYE_API: fake() });
      expect(r.code, r.out).not.toBe(0);
      expect(r.out).not.toMatch(/REFUSED \(act target\)/);
      expect(seen.slice(before)[0]).toBe('POST /v1/auth/login');
    }, 90_000);
  }

  it('governed.mjs has no default target: without EYE_API a login is refused before fetch', async () => {
    const before = seen.length;
    const probe = `const g = await import(${JSON.stringify(join(REPO, 'scripts', 'phase4', 'governed.mjs'))});
      try { await g.login('platform-admin', 'x'); console.log('SENT'); } catch (e) { console.log('REFUSED: ' + e.message); }`;
    const r = await new Promise<{ code: number | null; out: string }>((resolve) => {
      const env = { ...process.env };
      delete env['EYE_API'];
      const c = spawn(process.execPath, ['--input-type=module', '-e', probe], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = ''; c.stdout.on('data', (b) => { out += b; }); c.stderr.on('data', (b) => { out += b; });
      c.on('close', (code) => resolve({ code, out }));
    });
    expect(r.out).toMatch(/REFUSED: EYE_API is not set/);
    expect(r.out).not.toMatch(/SENT/);
    expect(seen.slice(before)).toEqual([]);
  });
});
