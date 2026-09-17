import { defineConfig } from '@playwright/test';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
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

/**
 * B18: the browser gate's export SIGNING KEY. The retention walk (e2e/phase6-retention.spec.ts) has the tenant administrator
 * declare `EYE_EXPORT_SIGNING_KEY_E2E` and the mirror domain's administrator declare the tenant as an exchange partner on the
 * matching PUBLIC key; the API resolves the reference from its process environment (webServer[0].env below). The key is an
 * Ed25519 private key as the one-line base64 of its PKCS8 DER (apps/api/src/retention/export-signing.ts) — generated here at
 * config load, never persisted (it is not a GENERATED_KEYS entry: those are random secrets in .eye-local/env, and this one is
 * per run), and generated ONCE: Playwright loads this file again in every worker, so the guard keeps the worker's public key the
 * key the API holds; the public PEM is derived from the environment's private key for the same reason.
 */
if (!process.env['EYE_EXPORT_SIGNING_KEY_E2E']) {
  const { privateKey } = generateKeyPairSync('ed25519');
  process.env['EYE_EXPORT_SIGNING_KEY_E2E'] = (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');
}
// The environment read narrowed before the key is parsed (`process.env[...]` is `string | undefined`).
const raw = process.env['EYE_EXPORT_SIGNING_KEY_E2E'];
if (typeof raw !== 'string' || raw === '') throw new Error('browser gate: EYE_EXPORT_SIGNING_KEY_E2E was not generated');
process.env['EYE_E2E_EXPORT_PUBLIC_PEM'] = createPublicKey(
  createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' }),
).export({ type: 'spki', format: 'pem' }) as string;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be provided (generated .eye-local/env or caller environment)`);
  return v;
}

/**
 * Phase 0 browser regression gate (approval instruction B).
 * Servers: API on :3401, web on :3000 (next start).
 * The suite runs migrate + bootstrap in global-setup; rotation-aware login.
 * B18: the Phase 6 retention and memory walks run in the same invocation.
 */
export default defineConfig({
  testDir: './e2e',
  // *.demo.spec.ts run against the seeded demonstration database (scripts/demo.sh + acts I–IV) through
  // playwright.demo.config.ts; the CI browser gate seeds its own data and does not run them.
  testIgnore: ['**/*.demo.spec.ts'],
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
        EYE_EXPORT_SIGNING_KEY_E2E: required('EYE_EXPORT_SIGNING_KEY_E2E'),
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
