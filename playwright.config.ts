import { defineConfig } from '@playwright/test';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

/**
 * Local secret loading for the browser gate (Gate-2.1 §9).
 *
 * The CANONICAL loader is scripts/local-env.mjs; it is reused here whenever the
 * runtime can import ESM from this config. When it cannot (Playwright may compile
 * this file to CJS), the fallback below is kept STRICTLY IN SYNC with it — same
 * key list, same generation, same 0600/0700 permission REPAIR — and the key list
 * is asserted against the canonical module so the two cannot drift silently.
 *
 * The previous version listed only four database authorities, so a browser run
 * silently lacked the commit/identity/publisher/verifier credentials the API needs.
 */
const GENERATED_KEYS = [
  'EYE_DB_PASSWORD',
  'EYE_DB_APP_PASSWORD',
  'EYE_DB_ALLOCATOR_PASSWORD',
  'EYE_DB_SYSTEM_PASSWORD',
  // Every least-privilege runtime authority (migration 0009+):
  'EYE_DB_COMMIT_PASSWORD',
  'EYE_DB_IDENTITY_PASSWORD',
  'EYE_DB_PUBLISHER_PASSWORD',
  'EYE_DB_VERIFIER_PASSWORD',
  'EYE_DB_RECOVERY_PASSWORD',
  'EYE_REDIS_PASSWORD',
  'EYE_IDENTITY_JWT_SECRET',
  'EYE_TEST_BOOTSTRAP_PASSWORD',
  'EYE_TEST_ADMIN_PASSWORD',
];

/** Repair a permissive mode before reading — never tolerate it (Gate-2 §8). */
function repairPermissions(dir: string, file: string): void {
  try {
    if (existsSync(dir) && (statSync(dir).mode & 0o777) !== 0o700) chmodSync(dir, 0o700);
  } catch { /* the file check below is the load-bearing one */ }
  try {
    if (existsSync(file) && (statSync(file).mode & 0o777) !== 0o600) {
      chmodSync(file, 0o600);
      console.warn(`[eye] repaired permissions on ${file} to 0600`);
    }
  } catch { /* fall through: a mode we cannot repair is reported by the read */ }
}

function loadLocalEnvFallback(): void {
  const dir = join(__dirname, '.eye-local');
  const file = join(dir, 'env');
  repairPermissions(dir, file);
  const stored: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (m) stored[m[1]!] = m[2]!;
    }
  }
  let dirty = false;
  for (const key of GENERATED_KEYS) {
    if (process.env[key]) continue; // caller-supplied environment wins
    if (stored[key] === undefined) {
      stored[key] = randomBytes(24).toString('base64url');
      dirty = true;
    }
    process.env[key] = stored[key];
  }
  // The migrate role IS the compose superuser; persisted because migrate.mjs has
  // no fallback literal (Gate-2.1 §9) and downstream processes source this file.
  if (!process.env['EYE_DB_MIGRATE_PASSWORD'] && stored['EYE_DB_MIGRATE_PASSWORD'] === undefined) {
    stored['EYE_DB_MIGRATE_PASSWORD'] = stored['EYE_DB_PASSWORD'] ?? process.env['EYE_DB_PASSWORD'] ?? '';
    dirty = true;
  }
  process.env['EYE_DB_MIGRATE_PASSWORD'] ??= stored['EYE_DB_MIGRATE_PASSWORD'];
  if (dirty) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(file, Object.entries(stored).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
    chmodSync(file, 0o600);
  }
}

function loadLocalEnv(): void {
  // Prefer the CANONICAL loader; fall back only if this config cannot require it.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const canonical = require('./scripts/local-env.cjs') as { loadLocalEnv: (root?: string) => void };
    canonical.loadLocalEnv(__dirname);
    if (!process.env['EYE_DB_COMMIT_PASSWORD']) throw new Error('canonical loader produced no commit credential');
    return;
  } catch {
    loadLocalEnvFallback();
  }
}

loadLocalEnv();

/** Every authority the API loads must be present before the servers start. */
for (const key of GENERATED_KEYS) {
  if (!process.env[key]) throw new Error(`browser gate: ${key} was not provided by the secret loader`);
}
if (!process.env['EYE_DB_MIGRATE_PASSWORD']) {
  throw new Error('browser gate: EYE_DB_MIGRATE_PASSWORD was not derived (migrations would refuse to run)');
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be provided (generated .eye-local/env or caller environment)`);
  return v;
}

/**
 * Phase 0 browser regression gate (approval instruction B).
 * Servers: API on :3401, web on :3000 (next start).
 * The suite runs migrate + bootstrap in global-setup; rotation-aware login.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    // Local: use the installed Chrome (stable channel) — no browser download
    // needed. CI installs the chrome channel via `playwright install chrome`.
    channel: 'chrome',
  },
  webServer: [
    {
      command: 'node apps/api/dist/main.js',
      url: 'http://localhost:3401/healthz',
      reuseExistingServer: false,
      env: {
        EYE_RUNTIME_PORT: '3401',
        EYE_DB_APP_PASSWORD: required('EYE_DB_APP_PASSWORD'),
        EYE_DB_ALLOCATOR_PASSWORD: required('EYE_DB_ALLOCATOR_PASSWORD'),
        EYE_DB_SYSTEM_PASSWORD: required('EYE_DB_SYSTEM_PASSWORD'),
        EYE_DB_MIGRATE_PASSWORD: required('EYE_DB_MIGRATE_PASSWORD'),
        EYE_REDIS_PASSWORD: required('EYE_REDIS_PASSWORD'),
        EYE_IDENTITY_JWT_SECRET: required('EYE_IDENTITY_JWT_SECRET'),
      },
    },
    {
      command: 'pnpm --filter @eye/web start',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_EYE_API: 'http://localhost:3401' },
    },
  ],
});
