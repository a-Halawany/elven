/**
 * CP-6 B25 §MR — the forecasting portfolio (F-P4-01): the governed registry, the horizon policy, the plan by horizon and the routed issue,
 * exercised in a browser against the seeded DEMONSTRATION after the B25 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a
 * hosted gate case: what it reads is what the act left — N. Eriksen's corridor target "Bab el-Mandeb transit delay" (EYE_B25_TARGET_KEY),
 * its 30d EVENT forecast and its 5y REGIME forecast in scenario language (different methods per horizon), the active horizon policy concurred
 * by H. Petrović, and the refused 3y horizon on the (SYNTHETIC) line-demand series naming the missing validation — so this file runs
 * through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts). WRITTEN, NOT YET RUN: the integrator's act stages it.
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b25-registry-*.png).
 * Personas: the forecast owner N. Eriksen (EYE_B25_FORECASTER, default `n.eriksen`), the analyst A. Hoffmann (EYE_B25_ANALYST, default `a.hoffmann`).
 * Every figure is SYNTHETIC; no claim of empirical validation is made on screen unless the act validated on real history.
 */
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// expect.configure returns a NEW instance: rebind it (the B29 rule).
const expect = baseExpect.configure({ timeout: 20_000 });

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const FORECASTER = process.env['EYE_B25_FORECASTER'] ?? 'n.eriksen';
const ANALYST = process.env['EYE_B25_ANALYST'] ?? 'a.hoffmann';
const TARGET = process.env['EYE_B25_TARGET_KEY'] ?? 'corridor.bab-el-mandeb.transit-delay';
const EVENT_METHOD = process.env['EYE_B25_EVENT_METHOD'] ?? 'event_rate@1';
const REGIME_METHOD = process.env['EYE_B25_REGIME_METHOD'] ?? 'regime_judgement@1';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openPortfolio(page: Page): Promise<void> {
  await page.goto('/prediction');
  await page.getByRole('link', { name: /Forecasting portfolio/ }).click();
  await expect(page.getByRole('heading', { name: 'Forecasting portfolio', level: 1 })).toBeVisible();
}
async function plan(page: Page, horizon: string): Promise<void> {
  await page.getByLabel('Target', { exact: true }).fill(TARGET);
  await page.getByRole('combobox', { name: /Horizon/ }).selectOption(horizon);
  await page.getByRole('button', { name: 'Plan' }).click();
  await expect(page.getByLabel('the plan')).toBeVisible();
}

test.describe.serial('CP-6 B25 §MR — the forecasting portfolio on the demonstration', () => {
  test('THE REGISTRY: the legacy methods are approved builtins beside the act\'s governed entries; the horizon policy names a language and a validation bar per horizon', async ({ page }) => {
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPortfolio(page);
    const registry = page.getByRole('table', { name: 'registry' });
    await expect(registry).toContainText('seasonal_naive@1 (builtin)');
    await expect(registry).toContainText('holt_winters@1 (builtin)');
    await expect(registry.getByRole('row', { name: new RegExp(EVENT_METHOD) })).toContainText('approved');
    await expect(registry.getByRole('row', { name: new RegExp(REGIME_METHOD) })).toContainText('approved');
    const policy = page.getByRole('table', { name: 'horizon policy' });
    await expect(policy.getByRole('row', { name: /^5y/ })).toContainText('scenario_language');
    await expect(policy.getByRole('row', { name: /^3y/ })).toContainText(/requires quantity_rolling_origin ≥ \d+ origins/);
    await shot(page, 'b25-registry-01-registry-policy');
  });

  test('THE PLAN BY HORIZON: the corridor target is an EVENT at 30d (a probability) and a REGIME at 5y (scenario language) — different methods', async ({ page }) => {
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPortfolio(page);
    await plan(page, '30d');
    await expect(page.getByLabel('the plan')).toContainText('Kind event');
    await expect(page.getByLabel('the plan')).toContainText(new RegExp(`${EVENT_METHOD} \\(event\\) — available, a probability within the window`));
    await plan(page, '5y');
    await expect(page.getByLabel('the plan')).toContainText('Kind regime');
    await expect(page.getByLabel('the plan')).toContainText(new RegExp(`${REGIME_METHOD} \\(structural_judgmental\\) — available, scenario / regime language — never presented as validated`));
    await shot(page, 'b25-registry-02-plan-by-horizon');
  });

  test('THE ROUTES: the 30d event and the 5y regime ISSUED by their methods; the 3y horizon on the line-demand series REFUSED naming the missing validation', async ({ page }) => {
    await uiLogin(page, ANALYST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPortfolio(page);
    const routes = page.getByRole('list', { name: 'routes' });
    await expect(routes).toContainText(new RegExp(`${TARGET} at 30d — issued by ${EVENT_METHOD}`));
    await expect(routes).toContainText(new RegExp(`${TARGET} at 5y — issued by ${REGIME_METHOD}`));
    await expect(routes).toContainText(/at 3y — refused: forecast rejected \(horizon\): .* at 3y is unsupported — no passed quantity-rolling-origin validation/);
    // the analyst reads; the issue control is a forecast owner's
    await expect(page.getByRole('button', { name: 'Issue through the portfolio' })).toHaveCount(0);
    await shot(page, 'b25-registry-03-routes');
  });
});
