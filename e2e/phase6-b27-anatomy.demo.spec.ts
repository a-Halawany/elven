/**
 * CP-6 B27 §A — SCENARIO ANATOMY (F-P4-07), exercised in a browser against the seeded DEMONSTRATION after the B27 act ran (the rehearsal
 * copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the "Bab el-Mandeb closure"
 * scenario with its drivers ("Houthi activity", "insurer withdrawal"), its actor ("carriers"), its mechanism ("war-risk premium →
 * rerouting"), the assumption "insurers keep war-risk cover" linked CRITICAL to the disruption branch and INVALIDATED by the strategy owner,
 * the disruption branch SUSPENDED and its owner tasked — so this file runs through playwright.demo.config.ts only (the hosted config ignores
 * *.demo.spec.ts). Every figure is SYNTHETIC.
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b27-anatomy-*.png).
 * Personas: the strategy owner's login is EYE_B27_ANATOMY_STRATEGY (default `j.weber`); the disruption branch's owner EYE_B27_ANATOMY_BRANCH_OWNER
 * (default `n.eriksen`); an analyst EYE_B27_ANATOMY_READER (default `a.hoffmann`). The scenario's title EYE_B27_ANATOMY_SCENARIO; the stage the act
 * left EYE_B27_ANATOMY_STAGE = suspended (default) | reinstated.
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
const STRATEGY = process.env['EYE_B27_ANATOMY_STRATEGY'] ?? 'j.weber';
const BRANCH_OWNER = process.env['EYE_B27_ANATOMY_BRANCH_OWNER'] ?? 'n.eriksen';
const READER = process.env['EYE_B27_ANATOMY_READER'] ?? 'a.hoffmann';
const SCENARIO = process.env['EYE_B27_ANATOMY_SCENARIO'] ?? 'Bab el-Mandeb closure';
const BRANCH = process.env['EYE_B27_ANATOMY_BRANCH'] ?? 'Insurer withdrawal';
const STAGE = process.env['EYE_B27_ANATOMY_STAGE'] ?? 'suspended';
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
/** From the scenario page, the anatomy link of the named scenario (the B27 anatomy line). */
async function openAnatomy(page: Page): Promise<void> {
  await page.goto('/prediction/scenarios');
  await expect(page.getByRole('heading', { name: 'Scenarios', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(`^Anatomy of “${escape(SCENARIO)}`) }).first().click();
  await expect(page.getByRole('heading', { name: new RegExp(`^Anatomy: ${escape(SCENARIO)}`), level: 1 })).toBeVisible();
}

test.describe.serial('CP-6 B27 §A — scenario anatomy on the demonstration', () => {
  test('THE ANATOMY: the strategy owner reads the drivers, the actor and the mechanism, the intervention map, and the assumption register with the critical link and the ASU\'s state', async ({ page }) => {
    await uiLogin(page, STRATEGY, required('EYE_TEST_ADMIN_PASSWORD'));
    await openAnatomy(page);
    await expect(page.getByRole('cell', { name: /Houthi activity/i }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /insurer withdrawal/i }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /carriers/i }).first()).toBeVisible();
    await expect(page.getByText(/war-risk premium/i).first()).toBeVisible();
    await expect(page.getByText(/exogenous \(a shock from outside\)/).first()).toBeVisible();
    const register = page.getByRole('region', { name: 'Assumption register' });
    await expect(register.getByText(/insurers keep war-risk cover/i).first()).toBeVisible();
    await expect(register.getByText(/^CRITICAL · assumption (invalidated|verified|unverified)/).first()).toBeVisible();
    await shot(page, 'b27-anatomy-01-anatomy');
  });

  test('THE SUSPENSION: the branch owner reads the suspended branch — the banner with the cause, when and by whom, NOT decision-active — and holds the reinstate control (the stage the act left)', async ({ page }) => {
    await uiLogin(page, BRANCH_OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openAnatomy(page);
    const branch = page.getByRole('region', { name: `Branch: ${BRANCH}` });
    if (STAGE === 'suspended') {
      const banner = branch.getByRole('alert', { name: `suspension of ${BRANCH}` });
      await expect(banner).toContainText(/This branch is suspended\./);
      await expect(banner).toContainText(/the critical assumption "Insurers keep war-risk cover" was invalidated/i);
      await expect(banner).toContainText(/A reinstatement returns it to (open|flipped)/);
      await expect(branch).toContainText(/SUSPENDED — not live/);
      await expect(branch).toContainText(/NOT decision-active/);
      await expect(branch.getByRole('button', { name: `Reinstate "${BRANCH}"` })).toBeDisabled(); // enabled once a 16-character note is typed
    } else {
      await expect(branch).toContainText(/Reinstated .* by /);
      await expect(branch).toContainText(/decision-active/);
    }
    await shot(page, 'b27-anatomy-02-suspension');
  });

  test('THE RECORDS AND THE READER: an analyst reads the narrative, implication and option records and the register, and is offered no write control', async ({ page }) => {
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openAnatomy(page);
    await expect(page.getByRole('heading', { name: 'Narrative, implications and options', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Declare an element' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Suspend "/ })).toHaveCount(0);
    await shot(page, 'b27-anatomy-03-reader');
  });
});
