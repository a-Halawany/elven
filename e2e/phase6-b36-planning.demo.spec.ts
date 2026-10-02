/**
 * CP-6 B36 §P — the Strategy and Planning workspace (WS-16), exercised in a browser against the seeded DEMONSTRATION after the B36 act
 * ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the 2027
 * dual-sourcing plan proposed by the strategy lead (a new SYNTHETIC persona) under the corridor objective with two milestones and a budget,
 * funded and approved by M. Dvořák within authority, the baseline signed, the corridor run's Q2 reading at risk (the variance raised and
 * routed to the initiative's owner), the authority ceiling lowered below the funded sum (the continuity breach shown and a commitment held)
 * — so this file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b36-planning-*.png).
 * Personas: the strategy lead's login is EYE_B36_PLANNING_LEAD (the act's SYNTHETIC persona; default `a.novak`), M. Dvořák (`m.dvorak`).
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
const LEAD = process.env['EYE_B36_PLANNING_LEAD'] ?? 'a.novak';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openPlan(page: Page): Promise<void> {
  await page.goto('/graph/strategy/planning');
  await expect(page.getByRole('heading', { name: 'Strategy and Planning', level: 1 })).toBeVisible();
  // a wrapping <label> includes its option text: select by role; selectOption takes the option's exact label (a string), read from the option itself
  const plans = page.getByRole('combobox', { name: 'Plan', exact: true }); // "Objective (of the plan's set)" also contains the word
  const label = await plans.locator('option').filter({ hasText: /Dual-sourcing 2027/ }).first().textContent();
  await plans.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: /^Dual-sourcing 2027$/, level: 2 })).toBeVisible(); // the plan's own heading, not "Propose an initiative into …"
}

test.describe.serial('CP-6 B36 §P — the planning workspace on the demonstration', () => {
  test('THE PLAN: the strategy lead reads the 2027 dual-sourcing plan — its objectives, the budget against the authority, the signed baseline, the initiatives with their milestones and the authority banner', async ({ page }) => {
    await uiLogin(page, LEAD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPlan(page);
    // the budget line names the funded sum, the planned budget and the authority ceiling in the plan's currency — never a percentage
    const budget = page.getByLabel('budget line');
    await expect(budget).toBeVisible();
    await expect(budget).toContainText(/EUR funded/);
    await expect(budget).not.toContainText(/%/);
    // the baseline is a SIGNED version: the signer, the key and the instant on screen
    const baselines = page.getByRole('list', { name: 'baselines' });
    await expect(baselines.getByText(/signed by/).first()).toBeVisible();
    await expect(baselines.getByText(/ed25519:/).first()).toBeVisible();
    await expect(baselines.getByText(/UNSIGNED/)).toHaveCount(0);
    // the initiative: its state in words with a glyph, the two milestones, the authority banner naming who acts next
    await expect(page.getByRole('heading', { name: /second NdFeB source|dual-sourcing/i, level: 3 }).first()).toBeVisible();
    await expect(page.getByLabel('initiative state').first()).toContainText(/approved|paused|closed|funded/);
    await expect(page.getByLabel('authority banner').first()).toContainText(/^Next: /);
    await expect(page.locator('li').filter({ hasText: /Q2 2024 magnet stock floor/ }).first()).toBeVisible(); // the milestone row (a hidden <pre> of the breach's forecast impact also says Q2)
    await shot(page, 'b36-planning-01-plan');
  });

  test('THE VARIANCE AND THE BREACH: the corridor run\'s Q2 reading is at risk (the variance raised by the schedule and routed to the owner); the authority lowered below the funded sum is a continuity breach shown with its forecast impact — and a commitment on the initiative is held', async ({ page }) => {
    await uiLogin(page, LEAD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPlan(page);
    const variances = page.getByRole('list', { name: 'variances' });
    await expect(variances.getByText(/from a scenario run/).first()).toBeVisible();
    await expect(variances.getByText(/routed to/).first()).toBeVisible();
    await expect(variances.getByText(/run outputs/).first()).toBeVisible();
    const breaches = page.getByRole('list', { name: 'breaches' });
    await expect(breaches.getByText(/budget over authority/).first()).toBeVisible();
    await expect(breaches.getByText(/never silently accepted/).first()).toBeVisible();
    await expect(breaches.getByText(/OPEN|ACKNOWLEDGED/).first()).toBeVisible();
    await expect(breaches.getByText(/a commitment on this plan's initiatives is HELD|acknowledged by/).first()).toBeVisible();
    await shot(page, 'b36-planning-02-variance-breach');
  });

  test('THE SENSITIVITY: the plan under the corridor run — the milestone at risk under that scenario, the run\'s outputs digest named; a read, nothing recorded', async ({ page }) => {
    await uiLogin(page, LEAD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPlan(page);
    await page.getByRole('combobox', { name: 'Run' }).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Read sensitivity' }).click();
    await expect(page.getByRole('heading', { name: /Under run/, level: 3 })).toBeVisible();
    await expect(page.getByText(/outputs digest/).first()).toBeVisible();
    const sens = page.getByRole('list', { name: 'sensitivity' });
    await expect(sens.getByText(/at risk under this scenario/).first()).toBeVisible();
    await expect(page.getByText(/\d+ at risk · \d+ on track · \d+ unmapped/)).toBeVisible();
    await shot(page, 'b36-planning-03-sensitivity');
  });

  test('THE REPLAY AND THE EXECUTIVE\'S ACTS: M. Dvořák reads the plan as of an instant before the funding (the initiative stood prioritised) and sees the authority and baseline controls as his own acts', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await openPlan(page);
    await expect(page.getByRole('button', { name: 'Set authority' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Baseline \(sign this version\)/ })).toBeVisible();
    // datetime-local for the instant: a day before today (the plan was declared and funded by the act earlier today or before)
    const yesterday = new Date(Date.now() - 86_400_000);
    const local = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}T00:00`;
    await page.getByLabel('As of').fill(local);
    await page.getByRole('button', { name: 'Read as of' }).click();
    await expect(page.getByRole('heading', { name: /^As of /, level: 3 })).toBeVisible();
    await shot(page, 'b36-planning-04-replay');
  });

  test('THE STRATEGY PAGE\'S PLAN PANEL: the corridor objective lists its initiatives with their planning state', async ({ page }) => {
    await uiLogin(page, LEAD, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/graph/strategy');
    await expect(page.getByRole('heading', { name: 'Strategy Graph', level: 1 })).toBeVisible();
    // the plan is on the Regensburg objective (EYE_B36_OBJECTIVE_TITLE): its own button, not another "corridor" object's (a plan panel renders for an OBJ or INI only)
    await page.getByRole('button', { name: process.env['EYE_B36_OBJECTIVE_TITLE'] ?? 'Keep the Regensburg line supplied through Q1', exact: true }).first().click();
    const links = page.getByRole('list', { name: 'plan links' });
    await expect(links.first()).toBeVisible();
    await expect(page.getByText(/open the planning workspace/)).toBeVisible();
    await shot(page, 'b36-planning-05-plan-panel');
  });
});
