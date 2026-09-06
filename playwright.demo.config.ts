import { defineConfig } from '@playwright/test';

/**
 * Browser verification against the DEMONSTRATION servers already running from
 * scripts/demo.sh and acts I–IV (API on :3401, web on :3000). No webServer block:
 * the point is to look at the seeded record, not to seed one. Credentials come
 * from the environment exactly as playwright.config.ts loads them.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.demo.spec.ts'],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env['EYE_WEB_BASE'] ?? 'http://localhost:3000',
    // The installed Google Chrome: no browser download is needed to look at the record.
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
