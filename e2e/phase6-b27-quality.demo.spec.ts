/**
 * CP-6 B27 §Q — scenario quality, indicator freshness and governed branch probabilities, exercised in a browser against the seeded
 * DEMONSTRATION after the B27 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what
 * the act left — a corridor scenario owned by J. Weber (strategy_owner) to which two branches that differ only in WORDING were added
 * through the BranchScenario route (the quality evaluation FAILS `indistinct_branches` naming both), whose freight-rate signpost is
 * MISSING (the SYNTHETIC freight-rate indicator retired through the governed route) and which carries a frequency-to-probability map and a
 * governed probability set by J. Weber — so this file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b27-quality-*.png).
 * Personas: the scenario owner's login is EYE_B27_QUALITY_OWNER (default `j.weber`); a reader outside the owners is EYE_B27_QUALITY_READER
 * (default `a.hoffmann`, domain_analyst). The scenario's title is EYE_B27_QUALITY_SCENARIO_TITLE (the act names it).
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
const OWNER = process.env['EYE_B27_QUALITY_OWNER'] ?? 'j.weber';
const READER = process.env['EYE_B27_QUALITY_READER'] ?? 'a.hoffmann';
const TITLE = process.env['EYE_B27_QUALITY_SCENARIO_TITLE'] ?? 'Bab el-Mandeb freight exposure';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openQuality(page: Page): Promise<void> {
  await page.goto('/prediction/scenarios/quality');
  await expect(page.getByRole('heading', { name: 'Scenario quality', level: 1 })).toBeVisible();
  // selectOption takes the option's exact label (a string), read from the option itself
  const scenarios = page.getByRole('combobox', { name: 'Scenario', exact: true });
  const label = await scenarios.locator('option').filter({ hasText: new RegExp(esc(TITLE)) }).first().textContent();
  await scenarios.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: new RegExp(`^${esc(TITLE)}`), level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B27 §Q — scenario quality on the demonstration', () => {
  test('THE LINK: the scenario page links each scenario to its quality page', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/scenarios');
    const link = page.getByRole('link', { name: new RegExp(`^Quality, indicator freshness and probabilities of ${esc(TITLE)}`) }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/prediction\/scenarios\/quality\?scenario=[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: 'Scenario quality', level: 1 })).toBeVisible();
    await shot(page, 'b27-quality-01-link');
  });

  test('THE FINDINGS: the two wording-only branches FAIL distinctiveness, named; the scenario reads NOT DECISION-ACTIVE with the server\'s reason', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openQuality(page);
    await expect(page.getByRole('status').filter({ hasText: /DECISION-ACTIVE/ }).first()).toContainText(/NOT DECISION-ACTIVE — .*failed: .*indistinct_branches/);
    const findings = page.getByRole('region', { name: 'Findings', exact: true });
    const row = findings.getByRole('row').filter({ hasText: /distinctiveness — branches differ only in wording/ }).first();
    await expect(row).toContainText('FAIL');
    await expect(row).toContainText(/differ only in wording/);
    await shot(page, 'b27-quality-02-findings');
  });

  test('THE FRESHNESS: the freight-rate signpost is named MISSING (or STALE) with its reason; the other signposts carry their state in words', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openQuality(page);
    const fresh = page.getByRole('region', { name: 'Indicator freshness', exact: true });
    await expect(fresh).toContainText(/\d+ missing · \d+ stale/);
    const freight = fresh.getByRole('row').filter({ hasText: /[Ff]reight/ }).first();
    await expect(freight).toContainText(/MISSING|STALE/);
    await expect(freight).toContainText(/retired|days ago|never been observed|expired/);
    await shot(page, 'b27-quality-03-freshness');
  });

  test('THE PROBABILITIES: each governed band with its method and basis, the live lows\' sum, the map with its bands; the owner holds set / withdraw', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openQuality(page);
    const probs = page.getByRole('region', { name: 'Branch probabilities', exact: true });
    await expect(probs).toContainText(/lows sum to \d+(\.\d+)?%/);
    await expect(probs.getByRole('row').filter({ hasText: /frequency map|expert elicitation|model — simulation run/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set the probability' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Method', exact: true })).toBeVisible();
    const maps = page.getByRole('region', { name: 'Frequency-to-probability maps', exact: true });
    await expect(maps).toContainText(/version \d+/);
    await shot(page, 'b27-quality-04-probabilities');
  });

  test('THE READER: an analyst reads the quality and the probabilities but is offered no set or withdraw (the server would refuse it anyway)', async ({ page }) => {
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openQuality(page);
    await expect(page.getByRole('region', { name: 'Branch probabilities', exact: true })).toContainText(/is set or withdrawn by the scenario's owner, the branch's owner or an administrator/);
    await expect(page.getByRole('button', { name: 'Set the probability' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Evaluate the quality now' })).toHaveCount(0);
    await shot(page, 'b27-quality-05-reader');
  });
});
