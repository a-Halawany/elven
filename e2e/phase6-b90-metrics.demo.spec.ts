/**
 * CP-6 B90 §M — the semantic metrics page (/graph/data/metrics), exercised in a browser against the seeded DEMONSTRATION after the B90
 * act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the
 * metric "Corridor exposure (EUR at risk)" declared by the data steward over the demo's corridor measure (a Strategy Graph MSR in EUR;
 * SYNTHETIC readings), certified by its owner (M. Dvořák) with a 90-day expiry and served in the executive view; the uncertified draft
 * variant refused there and served marked in the analyst view; the Strategic Health Score registered as a certified metric (its owner the
 * executive) — so this file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b90-metrics-*.png).
 * Personas: the data steward's login is EYE_B90_STEWARD_LOGIN (Part R's SYNTHETIC persona; default `d.steward`), the owner's EYE_B90_EXECUTIVE_LOGIN (default `m.dvorak`).
 * Titles: EYE_B90_METRIC_TITLE (default /Corridor exposure/), EYE_B90_DRAFT_TITLE (default /draft/i), EYE_B90_HEALTH_TITLE (default /Strategic Health Score/).
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
const STEWARD = process.env['EYE_B90_STEWARD_LOGIN'] ?? 'd.steward';
const EXECUTIVE = process.env['EYE_B90_EXECUTIVE_LOGIN'] ?? 'm.dvorak';
const METRIC = new RegExp(process.env['EYE_B90_METRIC_TITLE'] ?? 'Corridor exposure');
const DRAFT = new RegExp(process.env['EYE_B90_DRAFT_TITLE'] ?? 'draft', 'i');
const HEALTH = new RegExp(process.env['EYE_B90_HEALTH_TITLE'] ?? 'Strategic Health Score');

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openMetric(page: Page, title: RegExp): Promise<void> {
  await page.goto('/graph/data/metrics');
  await expect(page.getByRole('heading', { name: 'Semantic metrics', level: 1 })).toBeVisible();
  // a wrapping <label> includes its option text: select by role; selectOption takes the option's exact label (a string), read from the option itself
  const select = page.getByRole('combobox', { name: 'Metric', exact: true });
  const label = await select.locator('option').filter({ hasText: title }).first().textContent();
  await select.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible();
}
async function serve(page: Page, view: 'executive' | 'analyst'): Promise<void> {
  await page.getByRole('radio', { name: view === 'executive' ? /Executive view/ : /Analyst view/ }).check();
  await page.getByRole('button', { name: 'Serve', exact: true }).click();
}

test.describe.serial('CP-6 B90 §M — the semantic metrics page on the demonstration', () => {
  test('THE CERTIFIED METRIC: the steward reads the corridor exposure metric — its declarative definition (measure, grain, unit), its state certified, the certification by its owner until its expiry, SIGNED (the key on screen)', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openMetric(page, METRIC);
    await expect(page.getByLabel('metric state')).toContainText(/certified — served in the executive view/);
    await expect(page.getByLabel('definition line')).toContainText(/measure_observations · grain (month|week|day|measure|objective)/);
    await expect(page.getByLabel('definition line')).toContainText(/unit EUR/);
    const cert = page.getByLabel('certification line');
    await expect(cert).toContainText(/certified by/);
    await expect(cert).toContainText(/signed by/);
    await expect(cert).toContainText(/ed25519:/);
    await expect(cert).not.toContainText(/UNSIGNED/);
    await shot(page, 'b90-metrics-01-certified');
  });

  test('THE EXECUTIVE VIEW: the metric served with its grain, its definition version and digest and the SOURCE REVISION; the values per grain key in EUR', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openMetric(page, METRIC);
    await serve(page, 'executive');
    await expect(page.getByRole('heading', { name: /^Served — executive view · grain/, level: 3 })).toBeVisible();
    await expect(page.getByLabel('serving standing')).toContainText(/● certified/);
    await expect(page.getByLabel('source revision')).toContainText(/graph\.measure_observations: [0-9a-f]{64} over \d+ row/);
    const values = page.getByRole('table', { name: 'served values' });
    await expect(values).toBeVisible();
    await expect(values.getByRole('cell', { name: /EUR$/ }).first()).toBeVisible();
    await shot(page, 'b90-metrics-02-executive-view');
  });

  test('THE ACCESS MODE RULE: the uncertified draft is REFUSED in the executive view (the server\'s refusal rendered as such) and served MARKED in the analyst view', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openMetric(page, DRAFT);
    await expect(page.getByLabel('metric state')).toContainText(/declared — uncertified|withdrawn|expired/);
    await serve(page, 'executive');
    const refusal = page.getByLabel('serve refusal');
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText(/metric rejected \(certification\)/);
    await expect(refusal).toContainText(/executive view serves certified metrics only/);
    await shot(page, 'b90-metrics-03-executive-refusal');
    await serve(page, 'analyst');
    await expect(page.getByRole('heading', { name: /^Served — analyst view/, level: 3 })).toBeVisible();
    await expect(page.getByLabel('serving standing')).toContainText(/UNCERTIFIED/);
    await expect(page.getByLabel('source revision')).toContainText(/[0-9a-f]{64}/);
    await shot(page, 'b90-metrics-04-analyst-marked');
  });

  test('THE OWNER\'S ACTS AND THE HEALTH SCORE: M. Dvořák reads the Strategic Health Score as a certified metric (grain component), sees the certify and withdraw controls as his own acts, and serves it in the executive view', async ({ page }) => {
    await uiLogin(page, EXECUTIVE, required('EYE_TEST_ADMIN_PASSWORD'));
    await openMetric(page, HEALTH);
    await expect(page.getByLabel('definition line')).toContainText(/health_score · grain (component|definition)/);
    await expect(page.getByLabel('metric state')).toContainText(/certified/);
    await expect(page.getByRole('button', { name: /^Certify v\d+ \(sign\)$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Withdraw certification' })).toBeVisible();
    await serve(page, 'executive');
    await expect(page.getByRole('heading', { name: /^Served — executive view · grain/, level: 3 })).toBeVisible();
    await expect(page.getByLabel('source revision')).toContainText(/executive\.health_score_snapshots/);
    const certs = page.getByRole('list', { name: 'certifications' });
    await expect(certs.getByText(/MET object v\d+/).first()).toBeVisible();
    await shot(page, 'b90-metrics-05-health-score-owner');
  });
});
