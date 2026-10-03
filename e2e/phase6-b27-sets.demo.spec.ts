/**
 * CP-6 B27 §S — scenario sets, the side-by-side comparison, the plurality verdict and the portfolio review, exercised in a browser against
 * the seeded DEMONSTRATION after the B27 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it
 * reads is what the act left — J. Weber's set for the Regensburg supply decision (EYE_B27_SETS_TITLE) over the corridor scenarios (the
 * baseline, the disruption and the user-defined "regional blockade"), its policy requiring baseline + stress, the missing stress branch
 * flagged, L. Brandt's package bound to it and its proposal REFUSED until a stress branch joined — so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b27-sets-*.png).
 * Personas: the decision owner L. Brandt (EYE_B27_SETS_DECIDER, default `l.brandt`), the set owner J. Weber (EYE_B27_SETS_OWNER, default `j.weber`).
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
const DECIDER = process.env['EYE_B27_SETS_DECIDER'] ?? 'l.brandt';
const OWNER = process.env['EYE_B27_SETS_OWNER'] ?? 'j.weber';
const TITLE = process.env['EYE_B27_SETS_TITLE'] ?? 'Regensburg supply';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openSet(page: Page): Promise<void> {
  // the sets page directly: a decision owner or authority holds no prediction.read, so the scenario page (which links here) refuses them
  await page.goto('/prediction/scenarios/sets');
  await expect(page.getByRole('heading', { name: 'Scenario sets', level: 1 })).toBeVisible();
  // a wrapping <label> includes its option text: select by role; selectOption takes the option's exact label, read from the option itself
  const chooser = page.getByRole('combobox', { name: 'Scenario set', exact: true });
  const label = await chooser.locator('option').filter({ hasText: new RegExp(TITLE) }).first().textContent();
  await chooser.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: new RegExp(`^${TITLE}`), level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B27 §S — scenario sets on the demonstration', () => {
  test('THE COMPARISON: L. Brandt compares the baseline, the disruption and the user-defined "regional blockade" side by side — kind, state, divergence, the indicator\'s freshness, the consequence class', async ({ page }) => {
    await uiLogin(page, DECIDER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openSet(page);
    const table = page.getByRole('table', { name: 'comparison' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('row', { name: /branch Baseline/ }).first()).toBeVisible();
    await expect(table).toContainText('disruption');
    await expect(table).toContainText('“regional blockade”');
    // freshness is the server's word (fresh, STALE or MISSING) — never a percentage
    await expect(table).toContainText(/fresh|STALE|MISSING/);
    await expect(table).not.toContainText(/%/);
    await shot(page, 'b27-sets-01-comparison');
  });

  test('THE PLURALITY: the policy requires baseline + stress; the verdict and the recorded checks say what the act left — the missing stress branch was FLAGGED (the owner tasked) before it joined', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openSet(page);
    await expect(page.getByLabel('policy line')).toContainText(/requires .*baseline.*stress/);
    const verdict = page.getByLabel('plurality verdict');
    await expect(verdict).toContainText(/^(PLURAL|NOT PLURAL)/);
    // whatever stage the act left: a NOT PLURAL verdict names the missing kind; a PLURAL one follows the stress branch's arrival
    const text = (await verdict.textContent()) ?? '';
    if (/^NOT PLURAL/.test(text)) await expect(page.getByLabel('missing kinds')).toContainText('stress');
    await expect(page.getByRole('list', { name: 'bindings' })).toContainText(/proposed|under_review|approved|draft/);
    await shot(page, 'b27-sets-02-plurality');
  });

  test('THE PORTFOLIO REVIEW: the latest review\'s payoff matrix with robustness and regret as the server computed them; the proposals listed with their state', async ({ page }) => {
    await uiLogin(page, DECIDER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openSet(page);
    await expect(page.getByRole('heading', { name: 'Portfolio review', level: 3 })).toBeVisible();
    const matrix = page.getByRole('table', { name: 'payoff matrix' });
    if (await matrix.count() > 0) {
      await expect(matrix).toContainText(/Robustness/);
      await expect(page.getByLabel('review verdict')).toContainText(/most robust: .* · least regret: /);
    }
    await expect(page.getByRole('heading', { name: 'Scenario proposals', level: 2 })).toBeVisible();
    await shot(page, 'b27-sets-03-review');
  });
});
