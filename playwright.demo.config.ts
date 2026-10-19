import { defineConfig } from '@playwright/test';
import { actTargetOrExit } from './scripts/act-target.mjs';

/**
 * Browser verification against the DEMONSTRATION servers already running from
 * scripts/demo.sh and acts I–IV (API on :3401, web on :3000). No webServer block:
 * the point is to look at the seeded record, not to seed one. Credentials come
 * from the environment exactly as playwright.config.ts loads them.
 */
// B80 integration pass (2026-10-19): a demonstration walk logs a persona in through the web, so it names its target
// like an act does — EYE_ACT_TARGET (rehearsal | live), EYE_DB_NAME, EYE_WEB_BASE and EYE_API — and a rehearsal can
// never fall through to the live web (:3000) or API (:3401). Refused here, before any browser starts.
const TARGET = actTargetOrExit(process.env, { needs: ['web', 'api'] });
// Walks that call the API directly read EYE_API_BASE; it is the declared API, never a separate default.
if (process.env['EYE_API_BASE'] !== undefined && new URL(process.env['EYE_API_BASE']).origin !== TARGET.api) {
  console.error(`REFUSED (act target): EYE_API_BASE ${process.env['EYE_API_BASE']} differs from the declared EYE_API ${TARGET.api}. Nothing was contacted.`);
  process.exit(2);
}
process.env['EYE_API_BASE'] = TARGET.api!;

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.demo.spec.ts'],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: TARGET.web!,
    // The installed Google Chrome: no browser download is needed to look at the record.
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
