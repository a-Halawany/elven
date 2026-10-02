/**
 * CP-6 B28 — the stream processing, weak-signal and warning pages, exercised in a browser against the seeded DEMONSTRATION after
 * scripts/phase6/act-b28.mjs ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the
 * act left (the corridor rule's processor with its late and partial windows, the insurer-withdrawal weak signal under monitor, the
 * deduplicated Bab el-Mandeb warning with its members and lifecycle, the warning evaluation), so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts) and the hosted browser count stays at 51.
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b28-*.png).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('CP-6 B28 — streams, weak signals and the warning lifecycle on the demonstration', () => {
  test('STREAMS: the corridor rule\'s processor — windows fired on event time, the late window labelled LATE, the gap window PARTIAL', async ({ page }) => {
    await uiLogin(page, 'n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/streams');
    await expect(page.getByRole('heading', { name: 'Streams — event time', level: 1 })).toBeVisible();
    await expect(page.getByText(/^\d+ processor\(s\)$/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('row').nth(1).getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="spr-h"]');
    await expect(detail).toBeVisible({ timeout: 20_000 });
    await expect(detail.getByRole('heading', { name: 'Windows' })).toBeVisible();
    await expect(detail.getByText(/LATE/).first()).toBeVisible();
    await expect(detail.getByText(/PARTIAL/).first()).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Late inputs' })).toBeVisible();
    await shot(page, 'b28-01-streams');
  });

  test('WEAK SIGNALS: the insurer-withdrawal cluster under monitor, its evidence pattern and independence verdict', async ({ page }) => {
    await uiLogin(page, 'a.hoffmann', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/signals');
    await expect(page.getByRole('heading', { name: 'Weak signals', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The queue' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: /insurer/i }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="sig-h"]');
    await expect(detail).toBeVisible({ timeout: 20_000 });
    await expect(detail.getByRole('heading', { name: 'The evidence pattern' })).toBeVisible();
    await expect(page.getByText(/monitor/i).first()).toBeVisible();
    await shot(page, 'b28-02-signals');
  });

  test('WARNINGS: the deduplicated Bab el-Mandeb warning — its origin, cluster and lifecycle (contradicting evidence, the Regensburg objective, the playbook, the feedback)', async ({ page }) => {
    await uiLogin(page, 'j.weber', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/warnings');
    await expect(page.getByRole('heading', { name: 'Warnings', level: 1 })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: /Bab el-Mandeb/i }).filter({ hasText: /clustered/ }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="wrn-h"]');
    await expect(detail).toBeVisible({ timeout: 20_000 });
    await expect(detail.getByRole('heading', { name: 'Lifecycle' })).toBeVisible();
    await expect(detail.getByText(/contradicting/i).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'b28-03-warning-lifecycle');
  });

  test('WARNING EVALUATION: the executive\'s evaluation with T3 and the late feedback', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/warnings/evaluations');
    await expect(page.getByRole('heading', { name: 'Warning evaluation', level: 1 })).toBeVisible();
    await expect(page.locator('section[aria-label^="evaluation "]').first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'b28-04-warning-evaluation');
  });
});
