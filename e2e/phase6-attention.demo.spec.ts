/**
 * CP-6 B24 — the attention page, exercised in a browser against the seeded DEMONSTRATION after scripts/phase6/act-b24.mjs ran
 * (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: the queue it reads is what the act left (an
 * escalated material change with its deliveries, an item elevated from the overload hold, an approved suppression, a delegation, a
 * queue evaluation), so this file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts) and the
 * hosted browser count stays at 51.
 *
 * What is asserted is what the record says on screen — never a state derived here:
 *   · the queue with its counts by state, the deprioritized view with the elevation explanation, the queue evaluation's verdict, the
 *     suppression requests and delegations, the source-impact markers panel (M. Dvořák, the executive);
 *   · an item's deliveries beside its acknowledgement, the demo-mailbox marked SYNTHETIC (L. Brandt, the owner of the escalated item).
 *
 * Screenshots go to EYE_SHOTS (evidence/phase6-browser/b24-*.png).
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

test.describe.serial('CP-6 B24 — the attention completion on the demonstration', () => {
  test('THE QUEUE AND ITS GOVERNANCE: the counts by state, why an item was elevated, the evaluation, suppression approval, delegation, markers', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention');
    await expect(page.getByRole('heading', { name: 'Attention', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Queue \(\d+ in the domain\)$/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('group', { name: 'items by state' })).toBeVisible();
    // the deprioritized view (§M6): the act's rebalance elevated J. Weber's held item, with the explanation in words
    const dep = page.locator('section[aria-labelledby="deprioritized-h"]');
    await expect(dep.getByRole('heading', { name: /^Why elevated — the latest elevations \([1-9]\d*\)$/ })).toBeVisible({ timeout: 20_000 });
    // the queue evaluation (§G4): M. Dvořák's evaluation, its verdict as the record states it
    const ev = page.locator('section[aria-labelledby="evaluation-h"]');
    await expect(ev.getByRole('heading', { name: 'Evaluations' })).toBeVisible();
    await expect(ev.getByRole('row').filter({ hasText: /PARTIAL|MEASURED|ABSTAINED/ }).first()).toBeVisible({ timeout: 20_000 });
    // suppression approval and delegation (§G1–G2): the approved request and the standing delegation the act recorded
    const gov = page.locator('section[aria-labelledby="governance-h"]');
    await expect(gov.getByRole('heading', { name: 'Suppression requests' })).toBeVisible();
    await gov.getByRole('combobox', { name: 'State' }).selectOption('approved');
    await expect(gov.getByText('No suppression request in this state.')).toHaveCount(0, { timeout: 20_000 });
    await expect(gov.getByRole('heading', { name: 'Delegations' })).toBeVisible();
    await expect(gov.getByRole('region', { name: 'item delegations' }).getByRole('row').filter({ hasText: 'ACTIVE' }).first()).toBeVisible();
    // the source-impact markers panel (§K)
    await expect(page.locator('section[aria-labelledby="markers-h"]').getByRole('heading', { name: 'Source-impact markers' })).toBeVisible();
    await shot(page, 'b24-01-attention-governance');
  });

  test('DELIVERIES: the escalated material change carries its receipts beside the acknowledgement; the demo mailbox is SYNTHETIC', async ({ page }) => {
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention');
    await expect(page.getByRole('heading', { name: /^Queue \(\d+ in the domain\)$/ })).toBeVisible({ timeout: 20_000 });
    const row = page.getByRole('row').filter({ hasText: 'decision.material_change' }).filter({ hasText: 'January corridor collapse' }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'expand' }).click();
    const item = page.locator('section[aria-labelledby="item-h"]');
    await expect(item).toBeVisible();
    await expect(item.getByRole('heading', { name: /^Deliveries and receipts \([1-9]\d*\)$/ })).toBeVisible({ timeout: 20_000 });
    await expect(item.getByText('⬡ SYNTHETIC').first()).toBeVisible();
    await expect(item.getByText(/receipt of the item, not agreement|a delivery's receipt is not an acknowledgement/).first()).toBeVisible();
    await shot(page, 'b24-02-attention-deliveries');
  });
});
