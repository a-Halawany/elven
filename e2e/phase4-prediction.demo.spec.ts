/**
 * PHASE 4 — the Prediction screens, exercised in a browser against the seeded
 * demonstration (acts I–IV on a fresh database).
 *
 * What is asserted is what the correction pass changed on screen: the
 * validation badge that says RETROSPECTIVE when that is all the record can say;
 * the inherited controls; the backtest knowledge MODE; the branch's decision
 * deadline; and a replayed warning whose window is dated in the replay, with the
 * audit clock beside it and its timeliness against the deadline.
 *
 * Runs through playwright.demo.config.ts only. Screenshots go to EYE_SHOTS.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase4-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('Phase 4 — Prediction screens as the forecast owner', () => {
  test.beforeEach(async ({ page }) => {
    await uiLogin(page, 'n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
  });

  test('overview counts validated forecasts by both modes', async ({ page }) => {
    await page.goto('/prediction');
    await expect(page.getByRole('heading', { name: 'Prediction' })).toBeVisible();
    await expect(page.getByText(/validated \(historical or retrospective\)/)).toBeVisible();
    await expect(page.getByText(/1 validated retrospective/)).toBeVisible();
    await shot(page, '01-overview');
  });

  test('a forecast shows VALIDATED RETROSPECTIVELY, never VALIDATED, and the controls it inherited', async ({ page }) => {
    await page.goto('/prediction/forecasts');
    const ecb = page.getByRole('row').filter({ hasText: 'ecb-eurusd' }).first();
    await expect(ecb).toBeVisible();
    await expect(ecb.getByText('VALIDATED RETROSPECTIVELY', { exact: false })).toBeVisible();
    await ecb.getByRole('button', { name: 'ecb-eurusd' }).click();
    const detail = page.locator('section[aria-labelledby="fct-h"]');
    await expect(detail).toBeVisible();
    await expect(detail.getByText(/not historical-knowledge validation/).first()).toBeVisible();
    await expect(detail.getByText(/RETROSPECTIVE: one evidence vintage/).first()).toBeVisible();
    await expect(detail.getByText(/classification/).first()).toBeVisible();
    await expect(detail.getByText(/applicable backtest \(retrospective\)/)).toBeVisible();
    // The corridor forecast cannot be validated and is a replay demonstration.
    const corridor = page.getByRole('row').filter({ hasText: 'portwatch:' }).first();
    await expect(corridor.getByText('CANNOT BE VALIDATED', { exact: false })).toBeVisible();
    await expect(corridor.getByText('REPLAY DEMONSTRATION')).toBeVisible();
    await shot(page, '02-forecasts');
  });

  test('the calibration screen labels every backtest with its knowledge mode', async ({ page }) => {
    await page.goto('/prediction/calibration');
    await expect(page.getByRole('columnheader', { name: 'Mode', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'historical', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'retrospective', exact: true }).first()).toBeVisible();
    await expect(page.getByText(/CANNOT VALIDATE \(historical\): 0 of 40 origin/)).toBeVisible();
    await shot(page, '03-calibration');
  });

  test('the scenario tree shows the flipped branch with its decision deadline', async ({ page }) => {
    await page.goto('/prediction/scenarios');
    await expect(page.getByRole('columnheader', { name: 'Window · deadline' })).toBeVisible();
    const flipped = page.getByRole('row').filter({ hasText: 'FLIPPED' }).first();
    await expect(flipped).toBeVisible();
    await expect(flipped.getByText(/by .*2024/)).toBeVisible();
    // The baseline branch declared no deadline: T3 is unmeasured for it, and the screen says so.
    await expect(page.getByText('no deadline · T3 unmeasured').first()).toBeVisible();
    await shot(page, '04-scenarios');
  });

  test('a replayed warning is dated in the replay, audited now, and timely against its deadline', async ({ page }) => {
    await page.goto('/prediction/warnings');
    await expect(page.getByRole('columnheader', { name: 'Raised as of' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'REPLAY' }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText('● timely')).toBeVisible();
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="wrn-h"]');
    await expect(detail.getByText(/REPLAY · raised as of .*2024/).first()).toBeVisible();
    await expect(detail.getByText(/\(recorded .*2026/)).toBeVisible();
    await expect(detail.getByText(/before the decision deadline/).first()).toBeVisible();
    await expect(detail.getByText(/one warning per flip/)).toBeVisible();
    await expect(detail.getByText(/classification/).first()).toBeVisible();
    await shot(page, '05-warnings');
  });
});
