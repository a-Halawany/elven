/**
 * CP-6 B35 §P — the decision review (reopen, re-versioning, outcome assessment, metrics, set review cadence), exercised in a browser against
 * the seeded DEMONSTRATION after the B35 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads
 * is what the act left — L. Brandt's committed dual-sourcing decision (EYE_B35_REOPEN_TITLE) REOPENED when the corridor reopens (a change of
 * conditions recorded with its evidence), the corridor scenario's owner asked to re-version it and the request marked re-versioned, the
 * outcome assessment separating the observed savings from the inferred contribution, the counterfactual and the changed conditions — so this
 * file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b35-reopen-*.png).
 * Personas: the decision owner L. Brandt (EYE_B35_REOPEN_DECIDER, default `l.brandt`), the scenario owner (EYE_B35_REOPEN_OWNER, default `j.weber`).
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
const DECIDER = process.env['EYE_B35_REOPEN_DECIDER'] ?? 'l.brandt';
const OWNER = process.env['EYE_B35_REOPEN_OWNER'] ?? 'j.weber';
const TITLE = process.env['EYE_B35_REOPEN_TITLE'] ?? 'dual-source';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openReview(page: Page): Promise<void> {
  await page.goto('/decisions/review');
  await expect(page.getByRole('heading', { name: 'Decision review', level: 1 })).toBeVisible();
  // a wrapping <label> includes its option text: select by role; selectOption takes the option's exact label, read from the option itself
  const chooser = page.getByRole('combobox', { name: /^Package/ });
  const label = await chooser.locator('option').filter({ hasText: new RegExp(TITLE, 'i') }).first().textContent();
  await chooser.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: 'Decision metrics', level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B35 §P — the decision review on the demonstration', () => {
  test('THE REOPEN: the committed dual-sourcing decision was reopened because the conditions changed ("the corridor reopens"), the change recorded with its evidence', async ({ page }) => {
    await uiLogin(page, DECIDER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openReview(page);
    await expect(page.getByText(/Last reopened because the conditions changed/)).toBeVisible();
    const change = page.getByRole('region', { name: 'Changes of conditions and the reopen' });
    await expect(change).toContainText(/corridor reopens/i);
    await expect(change).toContainText(/evidence/);
    await shot(page, 'b35-reopen-01-reopened');
  });

  test('THE RE-VERSIONING: the corridor scenario its owner was asked to re-version — the request RE-VERSIONED at a later version', async ({ page }) => {
    await uiLogin(page, DECIDER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openReview(page);
    const table = page.getByRole('region', { name: 'Scenarios to re-version' });
    await expect(table).toContainText(/RE-VERSIONED|RE-VERSION REQUESTED/);
    await expect(table).toContainText(/v\d+ → v\d+/);
    await shot(page, 'b35-reopen-02-reversion');
  });

  test('THE OUTCOME: the observed savings, the inferred contribution, the counterfactual and the changed conditions — four separate fields, never merged', async ({ page }) => {
    await uiLogin(page, DECIDER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openReview(page);
    const outcome = page.getByRole('region', { name: 'Outcome assessment — four separate fields' });
    for (const h of ['Observed result', 'Inferred contribution', 'Counterfactual claim', 'Changed conditions']) {
      await expect(outcome.getByRole('heading', { name: h, level: 3 })).toBeVisible();
    }
    await expect(outcome).toContainText(/method .*; confidence /);
    await shot(page, 'b35-reopen-03-outcome');
  });

  test('THE METRICS and THE CADENCE: completeness, evidence coverage, time-to-decision, reversibility, outcome linkage; the scenario owner sees the sets with their review due', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openReview(page);
    const metrics = page.getByRole('region', { name: 'Decision metrics' });
    for (const t of ['Completeness', 'Evidence coverage', 'Time to decision', 'Reversibility', 'Outcome linkage']) await expect(metrics).toContainText(t);
    await expect(page.getByRole('list', { name: 'completeness criteria' })).toContainText(/met|NOT MET/);
    await expect(page.getByRole('region', { name: 'Scenario sets — review cadence' })).toBeVisible();
    await shot(page, 'b35-reopen-04-metrics');
  });
});
