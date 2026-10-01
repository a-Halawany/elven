/**
 * CP-6 B35 part `explanation` (0101 §E; F-P6-03) — the unified explanation surface, exercised in a browser against the seeded
 * DEMONSTRATION after the B35 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what
 * the act left — J. Weber contested the corridor forecast's SOURCE (a case with a deadline), the bench assigned an adjudicator, the case
 * was adjudicated (partly upheld, the correction through the observation layer) and closed, and the forecast's explanation was generated
 * again: it shows the contested source and the outcome. So this file runs through playwright.demo.config.ts only (the hosted config
 * ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b35-explanation-*.png). Personas: the appellant J. Weber (EYE_B35_APPELLANT, default `j.weber`), the decision
 * owner L. Brandt (EYE_B35_READER, default `l.brandt`). The forecast the act explained: EYE_B35_EXPLANATION_FORECAST (the act prints it).
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
const APPELLANT = process.env['EYE_B35_APPELLANT'] ?? 'j.weber';
const READER = process.env['EYE_B35_READER'] ?? 'l.brandt';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openForecast(page: Page): Promise<void> {
  await page.goto(`/decisions/explanations?kind=forecast&id=${required('EYE_B35_EXPLANATION_FORECAST')}`);
  await expect(page.getByRole('heading', { name: 'Explanations', level: 1 })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Kind', exact: true })).toHaveValue('forecast');
  await page.getByRole('button', { name: 'Read the explanation' }).click();
  await expect(page.getByRole('heading', { name: /^Explanation v\d+ — Forecast /, level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B35 §E — the explanation surface on the demonstration', () => {
  test('THE EXPLANATION: L. Brandt reads the corridor forecast\'s explanation — the server\'s, separated by category, the uncertainty questions apart, the App. L contract', async ({ page }) => {
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openForecast(page);
    await expect(page.getByText(/^CURRENT · faithfulness /)).toBeVisible();
    for (const c of ['Source evidence', 'Deterministic transformation', 'Model inference', 'Agent judgment', 'Human assessment']) await expect(page.getByRole('region', { name: c, exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Source evidence', exact: true })).toContainText(/Source ".*" \(.*\): .* authority/);
    const u = page.getByRole('region', { name: 'uncertainty, the questions kept apart' });
    await expect(u).toContainText('Likelihood');
    await expect(u).toContainText('forecast probability');
    await expect(u).toContainText('Evidence quality');
    await page.getByText('The App. L contract, field by field').click();
    await expect(page.getByText(/^integrity digest:/)).toBeVisible();
    await shot(page, 'b35-explanation-01-forecast');
  });

  test('THE CONTESTED SOURCE: the explanation\'s counter-evidence shows J. Weber\'s appeal on the forecast\'s source with its outcome; the case lists its deadline, adjudication, effect and closure', async ({ page }) => {
    await uiLogin(page, APPELLANT, required('EYE_TEST_ADMIN_PASSWORD'));
    await openForecast(page);
    const counter = page.getByRole('region', { name: 'counter-evidence' });
    await expect(counter).toContainText(/Appeal on the forecast's source \(source\): .* — (partly_upheld|upheld|dismissed)/);
    const cases = page.getByRole('region', { name: /^Cases on this subject/ });
    const sourceCase = cases.getByRole('listitem', { name: /^case / }).filter({ hasText: /^source — / }).first();
    await expect(sourceCase).toContainText(/closed \(resolved\) — (partly upheld|upheld|dismissed)/);
    await expect(sourceCase).toContainText(/correction required through the observation layer|dismissed — the subject stands/);
    await expect(sourceCase).toContainText('(role:strategy_owner)');
    await shot(page, 'b35-explanation-02-contested-source');
  });

  test('THE FAITHFULNESS PREVIEW: an uncited sentence previews UNFAITHFUL before anything is sent (the server decides on record)', async ({ page }) => {
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openForecast(page);
    await page.getByLabel(/^Sentences — one per line/).fill('The corridor will certainly reopen.');
    await expect(page.getByText(/^Preview: UNFAITHFUL — sentence 1 unsupported; sentence 1 false_certainty/)).toBeVisible();
    await shot(page, 'b35-explanation-03-preview');
  });
});
