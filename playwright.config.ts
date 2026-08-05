import { defineConfig } from '@playwright/test';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

/**
 * R7: every credential is generated per environment (0600 .eye-local/env
 * handoff) or caller-supplied — no fixed reusable literals. CJS-compatible
 * inline equivalent of scripts/local-env.mjs (Playwright compiles this config
 * to CJS, so the shared ESM module cannot be imported here).
 */
function loadLocalEnv(): void {
  const KEYS = [
    'EYE_DB_PASSWORD', 'EYE_DB_APP_PASSWORD', 'EYE_DB_ALLOCATOR_PASSWORD',
    'EYE_DB_SYSTEM_PASSWORD', 'EYE_REDIS_PASSWORD', 'EYE_IDENTITY_JWT_SECRET',
    'EYE_TEST_BOOTSTRAP_PASSWORD', 'EYE_TEST_ADMIN_PASSWORD',
  ];
  const dir = join(__dirname, '.eye-local');
  const file = join(dir, 'env');
  const stored: Record<string, string> = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (m) stored[m[1]!] = m[2]!;
    }
  }
  let dirty = false;
  for (const key of KEYS) {
    if (process.env[key]) continue; // caller-supplied environment wins
    if (stored[key] === undefined) {
      stored[key] = randomBytes(24).toString('base64url');
      dirty = true;
    }
    process.env[key] = stored[key];
  }
  if (dirty) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(file, Object.entries(stored).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  process.env['EYE_DB_MIGRATE_PASSWORD'] ??= process.env['EYE_DB_PASSWORD'];
}

loadLocalEnv();

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
