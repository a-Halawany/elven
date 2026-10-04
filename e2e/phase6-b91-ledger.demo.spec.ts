/**
 * CP-6 B91 §LE — the cost and resource ledger: NORDWERK's metered compute and inference priced against the tenant budget, the variance and
 * the run-rate forecast, the thresholds raised to the budget's owner, the energy ESTIMATE, a SYNTHETIC invoice reconciled, and the
 * optimisation boundary — exercised in a browser against the seeded DEMONSTRATION after the B91 act ran (the rehearsal copy first, then
 * eye_demo). A DEMO WALK, not a hosted gate case (written; run by the integrator after the act — never by the part): what it reads is what
 * the act left — the commercial authority's rate cards (EYE_B91_RATE_KEY), NORDWERK's budget (EYE_B91_BUDGET_LABEL, declared by the
 * tenant administrator, owned by a named executive), the corridor sweep's usage priced by the attention agent's ticks, the SYNTHETIC
 * invoice (EYE_B91_INVOICE_REF) and its reconciliation — so this file runs through playwright.demo.config.ts only (the hosted config
 * ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. The ONLY write attempted is a REFUSED one: an
 * optimisation that would change the tenant's residency (`optimisation rejected (boundary)`). Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b91-ledger-*.png). Personas: the NORDWERK tenant administrator (EYE_B91_TENANT_ADMIN) and the vendor's
 * commercial authority (EYE_B91_VENDOR), both created by the act. Every figure is SYNTHETIC; the invoice is SYNTHETIC — a real billing
 * account is the external prerequisite and only it closes reconciliation to actual cost.
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
const TENANT_ADMIN = process.env['EYE_B91_TENANT_ADMIN'] ?? 'n.vogel';
const VENDOR = process.env['EYE_B91_VENDOR'] ?? 'c.vendor';
const TENANT_NAME = process.env['EYE_B91_TENANT_NAME'] ?? 'NORDWERK ANTRIEBSTECHNIK GmbH (SYNTHETIC)';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openLedger(page: Page): Promise<void> {
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Cost ledger' }).click();
  await expect(page.getByRole('heading', { name: 'Cost and resource ledger', level: 1 })).toBeVisible();
}
const section = (page: Page, heading: RegExp) => page.locator('section', { has: page.getByRole('heading', { name: heading, level: 2 }) });

test.describe.serial('CP-6 B91 §LE — the cost and resource ledger on the demonstration', () => {
  test('THE BUDGET: the tenant administrator reads NORDWERK\'s budget — spent of amount, the run-rate forecast, the thresholds raised to its owner — and the energy ESTIMATE', async ({ page }) => {
    const label = required('EYE_B91_BUDGET_LABEL');
    await uiLogin(page, TENANT_ADMIN, required('EYE_TEST_ADMIN_PASSWORD'));
    await openLedger(page);
    await expect(page.getByText(/TENANT scope · as of .* \(the database's instant\)/)).toBeVisible();
    const budgets = section(page, /^Budgets/);
    const row = budgets.getByRole('row', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    await expect(row).toContainText(/\d+(\.\d+)? of \d+(\.\d+)? EUR \(\d+(\.\d+)?%\) · \d{4}-\d{2}-\d{2} → \d{4}-\d{2}-\d{2} — (forecast [\d.]+ EUR by period end|no forecast yet)/);
    await expect(row).toContainText('threshold reached — raised to the owner');
    const spend = section(page, /^Spend, unit data cost and the energy ESTIMATE/);
    await expect(spend.getByRole('table').first()).toContainText('simulation_compute');
    await expect(spend).toContainText(/simulation_compute · ([\d.]+ kWh \(ESTIMATE\)|not estimated)/);
    await expect(spend.getByRole('heading', { name: /^Unit data cost \(DQM-040/ })).toBeVisible();
    await shot(page, 'b91-ledger-01-budget');
  });

  test('THE VENDOR\'S RECORDS: the commercial authority reads the rate card in force (with its ESTIMATE coefficient) and NORDWERK\'s SYNTHETIC invoice with its reconciliation', async ({ page }) => {
    const rateKey = required('EYE_B91_RATE_KEY');
    const invoiceRef = required('EYE_B91_INVOICE_REF');
    await uiLogin(page, VENDOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await openLedger(page);
    await page.getByRole('combobox', { name: /Tenant ledger/ }).selectOption({ label: TENANT_NAME });
    const cards = section(page, /^Rate cards/);
    await expect(cards.getByRole('row', { name: new RegExp(rateKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toContainText(/v\d+: [\d.]+ EUR per unit since .*\(SYNTHETIC\)/);
    const invoices = section(page, /^Invoices and reconciliation/);
    await expect(invoices).toContainText(new RegExp(`${invoiceRef}.*SYNTHETIC`));
    await expect(invoices).toContainText(/reconciliation v\d+ \(.*\): (matched|differences)/);
    await shot(page, 'b91-ledger-02-vendor');
  });

  test('THE BOUNDARY (the only write, REFUSED): an optimisation that would move NORDWERK\'s residency is refused by the server — nothing recorded', async ({ page }) => {
    await uiLogin(page, VENDOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await openLedger(page);
    await page.getByRole('combobox', { name: /Tenant ledger/ }).selectOption({ label: TENANT_NAME });
    const opt = section(page, /^Optimisation decisions/);
    const before = await opt.getByRole('listitem').count();
    await opt.getByLabel('Title').fill('Cheaper storage abroad (walk)');
    await opt.getByLabel('Control').fill('residency');
    await opt.getByLabel('From').fill('local-dev');
    await opt.getByLabel('To').fill('cheapest-region');
    await opt.getByLabel(/^Trade-off/).fill('cost: about 20 % less storage spend');
    await opt.getByLabel('Rationale').fill('the demo walk proves the boundary refusal');
    await opt.getByRole('button', { name: 'Record the decision' }).click();
    await page.getByRole('dialog', { name: 'review' }).getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('alert')).toContainText(/optimisation rejected \(boundary\): .* would change residency — economic optimisation never weakens residency, isolation, retention or recovery/);
    await expect(opt.getByRole('listitem')).toHaveCount(before);
    await shot(page, 'b91-ledger-03-boundary-refused');
  });
});
