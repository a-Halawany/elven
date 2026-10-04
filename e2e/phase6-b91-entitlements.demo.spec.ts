/**
 * CP-6 B91 §EN — F-P7-F-01 (first half): NORDWERK's licence covers Foresight and Decision, NOT Simulation. Exercised in a browser against the
 * seeded DEMONSTRATION after the B91 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is
 * what the act left — the commercial authority (EYE_B91_VENDOR) issued NORDWERK a licence of the Foresight-and-Decision package through
 * the governed route — so this file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 *   1 · THE MATRIX: the vendor's catalogue shows NORDWERK licensed for foresight and decision, simulation NOT licensed, core always.
 *   2 · THE REFUSAL, EXPLAINED: in the simulation workspace, T. Nakamura reads a completed corridor run (a read of an existing record:
 *       available) and asks for an envelope sweep (a new simulation computation): refused — the server's explanation on screen names the
 *       capability, the licence version and what stays available. The ONLY write this walk attempts is that refused one.
 *   3 · THE CONTROLS STAY: the warnings workspace and the audit ledger open and answer for NORDWERK's people; nothing there is refused for
 *       entitlement.
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b91-entitlements-*.png). Personas: the vendor (EYE_B91_VENDOR — created by the act as the commercial authority),
 * the run operator T. Nakamura (EYE_B91_OPERATOR, default `t.nakamura`), the executive M. Dvořák (EYE_B91_EXECUTIVE, default `m.dvorak`).
 * The corridor run: EYE_B91_CORRIDOR_RUN (a completed run id the act prints). Every figure is SYNTHETIC.
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
const OPERATOR = process.env['EYE_B91_OPERATOR'] ?? 't.nakamura';
const EXECUTIVE = process.env['EYE_B91_EXECUTIVE'] ?? 'm.dvorak';
const TENANT = process.env['EYE_B91_TENANT_NAME'] ?? 'NORDWERK ANTRIEBSTECHNIK GmbH (SYNTHETIC)';
const REFUSAL = /capability unavailable \(entitlement\): simulation is not licensed for this tenant \(active; licence v\d+\)/;

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('CP-6 B91 §EN — the entitlement on the demonstration', () => {
  test('THE MATRIX: the vendor\'s catalogue — NORDWERK licensed for foresight and decision, simulation not licensed, core always', async ({ page }) => {
    await uiLogin(page, required('EYE_B91_VENDOR'), required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/admin/commercial/catalog');
    await expect(page.getByRole('heading', { name: 'Commercial catalogue', level: 1 })).toBeVisible();
    const matrix = page.getByRole('table', { name: 'entitlement matrix' });
    await expect(matrix.getByLabel(`${TENANT} foresight`)).toHaveText('● licensed');
    await expect(matrix.getByLabel(`${TENANT} decision`)).toHaveText('● licensed');
    await expect(matrix.getByLabel(`${TENANT} simulation`)).toHaveText('○ not licensed');
    await expect(matrix.getByLabel(`${TENANT} core`)).toHaveText('● core — cannot be removed');
    await expect(matrix.getByLabel(`${TENANT} attention_controls`)).toHaveText('● core — cannot be removed');
    await shot(page, 'b91-entitlements-01-matrix');
  });

  test('THE REFUSAL, EXPLAINED: the corridor run reads; its envelope sweep is refused — the capability, the licence version and what stays available', async ({ page }) => {
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations/fabric');
    await expect(page.getByRole('heading', { name: 'Method-fabric experiments', level: 1 })).toBeVisible();
    await page.getByLabel('Run id').fill(required('EYE_B91_CORRIDOR_RUN'));
    await page.getByRole('button', { name: 'Read the run' }).click();
    await expect(page.getByText(/^Run$/).first()).toBeVisible();   // the run's definition row: the read of an existing record answers
    await page.getByRole('button', { name: 'Sweep the envelope' }).click();
    await expect(page.getByText(REFUSAL)).toBeVisible();
    await expect(page.getByText(/reads of existing records, corrections and withdrawals, export, audit, identity, warnings and their acknowledgement, and every human decision stay available/)).toBeVisible();
    await shot(page, 'b91-entitlements-02-refused-explained');
  });

  test('THE CONTROLS STAY: the warnings workspace and the audit ledger answer — nothing refused for entitlement', async ({ page }) => {
    await uiLogin(page, EXECUTIVE, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/warnings');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/capability unavailable \(entitlement\)/)).toHaveCount(0);
    await shot(page, 'b91-entitlements-03-warnings-available');
    await page.goto('/admin/audit');
    await expect(page.getByText(/capability unavailable \(entitlement\)/)).toHaveCount(0);
    await shot(page, 'b91-entitlements-04-audit-available');
  });
});
