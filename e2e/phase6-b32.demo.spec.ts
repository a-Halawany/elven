/**
 * CP-6 B32 — the strategy alignment, risk and opportunity, and strategic health pages, exercised in a browser against the seeded
 * DEMONSTRATION after scripts/phase6/act-b32.mjs ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it
 * reads is what the act left ("On-time delivery 95%" with the Regensburg assembly capability under-evidenced and the measure stale; the
 * corridor closure accepted outside appetite with its mitigation decision; the Morocco opportunity sponsored; the health definition with
 * supply resilience fallen between two snapshots), so this file runs through playwright.demo.config.ts only (the hosted config ignores
 * *.demo.spec.ts) and the hosted browser count is unchanged.
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b32-*.png).
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

test.describe.serial('CP-6 B32 — alignment, risk and opportunity, strategic health on the demonstration', () => {
  test('ALIGNMENT: "On-time delivery 95%" × "Regensburg assembly" in the gap matrix — under-evidenced; the stale measure detected', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/graph/strategy/alignment');
    await expect(page.getByRole('heading', { name: 'Strategy alignment', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gap matrix' })).toBeVisible();
    await expect(page.getByText(/On-time delivery 95%/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Regensburg assembly/).first()).toBeVisible();
    await expect(page.getByText(/under[-_ ]evidenced/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Detections' })).toBeVisible();
    await expect(page.getByText(/stale/i).first()).toBeVisible();
    await shot(page, 'b32-01-alignment');
  });

  test('RISK AND OPPORTUNITY: the corridor closure outside appetite and the Morocco opportunity sponsored', async ({ page }) => {
    await uiLogin(page, 'c.brenner', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/exposures');
    await expect(page.getByRole('heading', { name: 'Risk and opportunity', level: 1 })).toBeVisible();
    await expect(page.getByText(/Corridor closure — Regensburg line/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Alternative supplier in Morocco/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Priority — decomposed, never a score/ })).toBeVisible();
    await shot(page, 'b32-02-exposures');
  });

  test('STRATEGIC HEALTH: the snapshot decomposed — supply resilience, the corridor risk component, the stale measure declared', async ({ page }) => {
    await uiLogin(page, 'c.brenner', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/health');
    await expect(page.getByRole('heading', { name: 'Strategic health', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Snapshots' })).toBeVisible();
    await expect(page.getByText(/Supply resilience/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Corridor closure — residual exposure/).first()).toBeVisible();
    await expect(page.getByText(/stale/i).first()).toBeVisible();
    await shot(page, 'b32-03-health');
  });
});
