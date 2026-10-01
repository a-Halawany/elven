/**
 * CP-6 B35 §A — decision option analysis, exercised in a browser against the seeded DEMONSTRATION after the B35 act ran (the rehearsal copy
 * first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — L. Brandt's "second source for bearings"
 * package (EYE_B35_ANALYSIS_TITLE) scoring three options against the delivery-reliability objective and the customs obligation, the weights
 * shown with their owner, the weight at which the lead changes, the change of weight the act made and the ranking it moved — so this file
 * runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b35-analysis-*.png).
 * Persona: the decision owner L. Brandt (EYE_B35_ANALYSIS_OWNER, default `l.brandt`). Every figure is SYNTHETIC.
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
const OWNER = process.env['EYE_B35_ANALYSIS_OWNER'] ?? 'l.brandt';
const TITLE = process.env['EYE_B35_ANALYSIS_TITLE'] ?? 'Second source for bearings';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openPackage(page: Page): Promise<void> {
  await page.goto('/decisions/analysis');
  await expect(page.getByRole('heading', { name: 'Decision analysis', level: 1 })).toBeVisible();
  // a wrapping <label> includes its option text: select by role; selectOption takes the option's exact label, read from the option itself
  const chooser = page.getByRole('combobox', { name: 'Package', exact: true });
  const label = await chooser.locator('option').filter({ hasText: new RegExp(TITLE) }).first().textContent();
  await chooser.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: new RegExp(`^${TITLE}`), level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B35 §A — decision analysis on the demonstration', () => {
  test('THE SCORES: three options ranked against the criteria — each weight shown, the value judgment\'s owner named, each value\'s basis (computed or entered)', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    const table = page.getByRole('table', { name: /^Criteria set v\d+ — weights are a value judgment owned by/ });
    await expect(table).toBeVisible();
    await expect(table).toContainText(/weight \d/);
    await expect(table).toContainText(/computed|entered/);
    await expect(table.getByRole('row')).toHaveCount(4);
    await shot(page, 'b35-analysis-01-scores');
  });

  test('THE SENSITIVITY: the weight at which another option takes the lead; the weights\' history keeps the change the act made', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    await expect(page.getByRole('heading', { name: 'Weight sensitivity', level: 2 })).toBeVisible();
    await expect(page.getByText(/^Leader: /)).toBeVisible();
    await expect(page.getByText(/takes the lead/).first()).toBeVisible();
    await page.getByText(/^History of the weights/).click();
    await expect(page.getByText(/^v1 · /)).toBeVisible();
    await expect(page.getByText(/^v2 · /)).toBeVisible();
    await shot(page, 'b35-analysis-02-sensitivity');
  });

  test('THE OBLIGATIONS: the customs obligation evaluated per option, with a glyph and a word for each result', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    await expect(page.getByRole('heading', { name: 'Constraints and stakeholder obligations', level: 2 })).toBeVisible();
    await expect(page.getByText(/Owed to .*customs|Hauptzollamt/i).first()).toBeVisible();
    await expect(page.getByText(/satisfied|violated|unknown/).first()).toBeVisible();
    await shot(page, 'b35-analysis-03-obligations');
  });

  test('THE FUTURES AND THE TRADE-OFFS: robustness and regret per option, the value of waiting, what the leader gives up', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    await expect(page.getByRole('heading', { name: 'Trade-offs', level: 2 })).toBeVisible();
    await expect(page.getByText(/^Not dominated: /)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Futures, reversibility and the value of information', level: 2 })).toBeVisible();
    await expect(page.getByText(/Option value|No value-of-information assessment/).first()).toBeVisible();
    await shot(page, 'b35-analysis-04-futures');
  });
});
