import { defineConfig } from '@playwright/test';

/**
 * Phase 0 browser regression gate (approval instruction B).
 * Servers: API on :3402 (test instance), web on :3000 (next start).
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
        EYE_DB_APP_PASSWORD: process.env.EYE_DB_APP_PASSWORD ?? 'eye_app_local_dev',
        EYE_DB_ALLOCATOR_PASSWORD: process.env.EYE_DB_ALLOCATOR_PASSWORD ?? 'eye_allocator_local_dev',
        EYE_DB_MIGRATE_PASSWORD: process.env.EYE_DB_MIGRATE_PASSWORD ?? 'eye_local_dev',
        EYE_IDENTITY_JWT_SECRET: process.env.EYE_IDENTITY_JWT_SECRET ?? 'e2e-secret-not-production-000000000000',
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
