/**
 * CP-6 B33 §PK — the Domain Intelligence workspace (WS-10) on the seeded DEMONSTRATION after the B33 act ran (the rehearsal copy first, then
 * eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the GEOPOLITICAL package "Red Sea security situation"
 * (EYE_B33_GEO_TITLE) declared by J. Weber, its five sections approved by the synthetic domain specialist (EYE_B33_SPECIALIST, "D. Ivanova —
 * geopolitical domain specialist (SYNTHETIC)"), the namespace's ontology decided by O. Steiner, the conformance suite passed, certified,
 * activated, its acceptance focus measured (the indicator set on the REAL PortWatch chokepoint4 counts, the REAL EU sanctions and GDELT
 * feeds, the SYNTHETIC AIS positions — a public-feed demonstration; a licensed geopolitical source is external). So this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (b33-packages-*.png).
 * Personas: the owner J. Weber (EYE_B33_PKG_OWNER, default `j.weber`), the specialist (EYE_B33_SPECIALIST, default `d.ivanova`). Every figure is
 * SYNTHETIC unless its source contract says real.
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
// EYE_B33_PKG_OWNER, not EYE_B33_OWNER: the twin and supply walks read EYE_B33_OWNER as the twin owner (t.nakamura) — one env file serves all four
const OWNER = process.env['EYE_B33_PKG_OWNER'] ?? 'j.weber';
const SPECIALIST = process.env['EYE_B33_SPECIALIST'] ?? 'd.ivanova';
const TITLE = process.env['EYE_B33_GEO_TITLE'] ?? 'Geopolitical intelligence — Red Sea security situation';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openPackage(page: Page): Promise<void> {
  // through the prediction section's navigation (the prelude's "Domains" entry)
  await page.goto('/prediction');
  await page.getByRole('link', { name: /Domains/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Domains', level: 1 })).toBeVisible();
  const picker = page.getByRole('combobox', { name: 'Package' });
  const value = await picker.locator('option', { hasText: TITLE }).first().getAttribute('value');
  await picker.selectOption(value ?? '');
  await expect(page.getByRole('heading', { name: TITLE, level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B33 §PK — the Domain Intelligence workspace on the demonstration', () => {
  test('THE PACKAGE: the Red Sea security situation is ACTIVE — scope explicit (purpose, geography, horizon, classification, effective time, provenance), its inputs stated real, SYNTHETIC and licensed-for-acceptance', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    const scope = page.getByRole('region', { name: TITLE });
    await expect(scope.getByRole('status')).toContainText(/ACTIVE — package geopolitical-red-sea v\d+ \(\d+\.\d+\.\d+\) is active/);
    await expect(scope).toContainText('Red Sea, Bab el-Mandeb, Gulf of Aden');
    await expect(scope).toContainText(/internal ceiling/);
    await expect(scope).toContainText(/active since/);
    await expect(scope).toContainText(/DPG object v\d+ · certified by/);
    await expect(scope).toContainText(/real public feeds: imf-portwatch-chokepoints, eu-sanctions-rss, gdelt-discovery · SYNTHETIC: red-sea-ais-positions · a real-provider acceptance needs: ACLED/);
    await shot(page, 'b33-packages-01-scope');
  });

  test('THE PORTFOLIO: every section approved by the named specialist, the certification run passed, the acceptance focus MEASURED — the indicator set fresh on the real PortWatch counts', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    const portfolio = page.getByRole('region', { name: /Portfolio/ });
    await expect(portfolio.getByRole('region', { name: 'Versions' })).toContainText('ACTIVE');
    await expect(portfolio).toContainText(/Acceptance focus \(measured\)/);
    await expect(portfolio).toContainText(/ACCEPTANCE (PASSED|FAILED)/);
    await expect(portfolio).toContainText(/indicator set \(blocking\)/);
    await expect(portfolio).toContainText(/authority \(blocking\)/);
    await shot(page, 'b33-packages-02-portfolio');
  });

  test('THE GATE AND THE COMMANDS: each function answered by the gate (a disabled one would be shown DISABLED with its reason); the eight commands each lead to their governed route', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    const commands = page.getByRole('region', { name: 'Commands' });
    for (const name of ['Resolve', 'Map', 'Compare', 'Assess', 'Forecast', 'Alert', 'Update', 'Replay']) await expect(commands.getByRole('link', { name })).toBeVisible();
    await expect(commands).toContainText(/assess: (● ACTIVE|⊘ DISABLED|⚑ CONFLICTED)/);
    await expect(page.getByRole('link', { name: /Competitor intelligence/ })).toBeVisible();
    await shot(page, 'b33-packages-03-commands');
  });

  test('THE KEYBOARD WALK: the package is chosen from the keyboard; the replay form is reachable and labelled (a datetime-local instant)', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/domains');
    const picker = page.getByRole('combobox', { name: 'Package' });
    await picker.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.getByLabel('As of')).toHaveAttribute('type', 'datetime-local');
    await page.getByLabel('Reason (stated with every decision, 8+ characters)').focus();
    await expect(page.getByLabel('Reason (stated with every decision, 8+ characters)')).toBeFocused();
  });

  test('THE ROLE WALK: the specialist is offered no activation (the owner\'s act); the owner is offered no section approval (the specialist\'s)', async ({ page }) => {
    await uiLogin(page, SPECIALIST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    await expect(page.getByRole('button', { name: /^Activate v/ })).toHaveCount(0);
    await page.goto('/login');
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    await expect(page.getByRole('button', { name: /^Approve (ontology|methodology|assessment|escalation|use_boundary)/ })).toHaveCount(0);
    await shot(page, 'b33-packages-04-roles');
  });
});
