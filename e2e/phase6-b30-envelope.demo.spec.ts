/**
 * CP-6 B30 §EN (0103; F-P5-04) — the envelope on the DEMONSTRATION: "a 75-day corridor delay run falls outside the envelope; the behaviour
 * is disabled for decision use and only a twin owner can admit it as exploratory". A DEMO WALK, not a hosted gate case: what it reads is
 * what the B30 act left — on the "NORDWERK — Ningbo → Regensburg chain" twin, a version with shock.corridor_delay_days = 75 (outside
 * supply-flow@1's [0, 60]), T. Nakamura's acknowledged run on it, its decision use REFUSED (outside_envelope), the domain administrator's
 * admission refused 403 by the server (the act records it), T. Nakamura's exploratory admission — so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts). Written by part `envelope`; NOT run by it (the integrator
 * rehearses, then walks the demonstration).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b30-envelope-*.png).
 * Personas: the twin owner T. Nakamura (EYE_B30_TWIN_OWNER, default `t.nakamura`); the domain administrator (EYE_B30_DOMAIN_ADMIN — the
 * act's B30-9 prints it; required for the second case). Every figure is SYNTHETIC.
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
const OWNER = process.env['EYE_B30_TWIN_OWNER'] ?? 't.nakamura';
const TWIN = process.env['EYE_B30_TWIN_TITLE'] ?? 'NORDWERK — Ningbo → Regensburg chain';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
/** The newest run whose decision-use label names outside_envelope, opened from the Simulations table. */
async function openOutsideRun(page: Page): Promise<void> {
  await page.goto('/twins/simulations');
  await expect(page.getByRole('heading', { name: 'Simulations', level: 1 })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'outside_envelope' }).first();
  await row.getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Outside the operating envelope', level: 3 })).toBeVisible();
}

test.describe.serial('CP-6 B30 §EN — the envelope on the demonstration', () => {
  test('DISABLED FOR DECISION USE: the 75-day run lies outside supply-flow@1\'s envelope, its decision use is REFUSED, and T. Nakamura\'s admission makes it EXPLORATORY only', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openOutsideRun(page);
    const panel = page.getByRole('region', { name: 'Outside the operating envelope' });
    await expect(panel).toContainText('corridor_delay_days = 75 outside [0, 60]');
    await expect(panel).toContainText(/REFUSED for decision use: outside_envelope/);
    await expect(panel).toContainText(/EXPLORATORY — admitted by a twin owner/);
    await expect(panel.getByRole('button', { name: 'Admit as exploratory' })).toHaveCount(0);   // admitted once; the server would refuse a second
    await shot(page, 'b30-envelope-01-disabled-exploratory');
  });

  test('THE DOMAIN ADMINISTRATOR: sees the run disabled and is offered no admission (the server refused the administrator\'s admission — the act\'s 403)', async ({ page }) => {
    await uiLogin(page, required('EYE_B30_DOMAIN_ADMIN'), required('EYE_TEST_ADMIN_PASSWORD'));
    await openOutsideRun(page);
    const panel = page.getByRole('region', { name: 'Outside the operating envelope' });
    await expect(panel).toContainText(/REFUSED for decision use: outside_envelope/);
    await expect(panel.getByRole('button', { name: 'Admit as exploratory' })).toHaveCount(0);
    await shot(page, 'b30-envelope-02-domain-admin');
  });

  test('THE MODELS PAGE: supply-flow@1\'s envelope, the run outside it, and the AI context of the 75-day version reading OUTSIDE', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations');
    await page.getByRole('link', { name: 'Models' }).click();
    await expect(page.getByRole('heading', { name: 'Behaviour models', level: 1 })).toBeVisible();
    const card = page.getByRole('article', { name: 'behaviour model supply-flow@1' });
    await expect(card).toContainText('corridor_delay_days ∈ [0, 60]');
    const outside = page.getByRole('region', { name: 'Runs outside the envelope' });
    await expect(outside).toContainText('corridor_delay_days = 75 outside [0, 60]');
    await expect(outside).toContainText(/EXPLORATORY — admitted by a twin owner/);
    await page.getByLabel('Twin', { exact: true }).selectOption({ label: TWIN });
    await page.getByRole('button', { name: 'Read the AI context' }).click();
    await expect(page.getByRole('term').filter({ hasText: 'Envelope' })).toBeVisible();
    await expect(page.getByLabel('AI context')).toContainText(/Treat any behaviour outside the operating envelope as disabled for decision use/);
    await shot(page, 'b30-envelope-03-models');
  });
});
