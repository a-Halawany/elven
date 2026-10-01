/**
 * CP-6 B31 §I — impact analysis exercised in a browser against the seeded DEMONSTRATION after the B31 act ran (the rehearsal copy first,
 * then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — T. Nakamura's sensitivity analysis of the
 * corridor closure run (the run the act names in EYE_B31_IMPACT_RUN: the control on the "Bab el-Mandeb…" scenario's flipped downside
 * branch, seeded), its second-order derivation over the corridor → Regensburg plant → enterprise links (act-b29's), and L. Brandt's
 * value-of-information assessment on the Regensburg package ("one more week of transit data" — WAIT) — so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a figure derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b31-impact-*.png).
 * Personas: the run operator T. Nakamura (EYE_B31_IMPACT_OPERATOR, default `t.nakamura`), the decision owner L. Brandt (EYE_B31_IMPACT_DECIDER,
 * default `l.brandt`). Every figure is SYNTHETIC.
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
const OPERATOR = process.env['EYE_B31_IMPACT_OPERATOR'] ?? 't.nakamura';
const DECIDER = process.env['EYE_B31_IMPACT_DECIDER'] ?? 'l.brandt';
const DOWNSTREAM = process.env['EYE_B31_IMPACT_DOWNSTREAM'] ?? 'Regensburg plant';
const INFORMATION = process.env['EYE_B31_IMPACT_INFORMATION'] ?? 'one more week of transit data';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openRun(page: Page, runId: string): Promise<void> {
  await page.goto('/twins/simulations/impact');
  await expect(page.getByRole('heading', { name: 'Impact analysis', level: 1 })).toBeVisible();
  // a wrapping <label> includes its option text: select by role; selectOption takes the option's exact label, read from the option itself
  const chooser = page.getByRole('combobox', { name: /^Completed run/ });
  await chooser.selectOption(runId);   // by the run's id (the option's value) — a prefix is shared by runs opened together
  await expect(page.getByRole('heading', { name: 'Sensitivity and robustness', level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B31 §I — impact analysis on the demonstration', () => {
  test('THE TORNADO: T. Nakamura opens the corridor closure run — its sensitivity analysis ranked by swing, the robustness verdict across the seeds', async ({ page }) => {
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await openRun(page, required('EYE_B31_IMPACT_RUN'));
    await expect(page.getByRole('figure', { name: /^tornado chart of / })).toBeVisible();
    const factors = page.getByRole('table', { name: 'sensitivity factors' });
    await expect(factors.getByRole('row')).not.toHaveCount(1);
    // the ranks are the server's: the first row is rank 1
    await expect(factors.getByRole('row').nth(1)).toContainText(/^1/);
    await expect(page.getByLabel('robustness verdict')).toContainText(/ROBUST|NOT ROBUST/);
    await shot(page, 'b31-impact-01-tornado');
  });

  test('THE SECOND-ORDER EFFECT: the same run carries its delivery-date shift to the Regensburg plant over the twin link, per percentile, with its timing', async ({ page }) => {
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await openRun(page, required('EYE_B31_IMPACT_RUN'));
    const effects = page.getByRole('table', { name: 'second-order effects' });
    await expect(effects).toBeVisible();
    await expect(effects).toContainText('production days lost');
    await expect(effects.getByRole('row', { name: new RegExp(DOWNSTREAM) }).first()).toContainText('delivery dates shift');
    await expect(effects).toContainText(/first affected \d{4}-\d{2}-\d{2}/);
    await shot(page, 'b31-impact-02-second-order');
  });

  test('THE VALUE OF INFORMATION: L. Brandt reads the assessment on the Regensburg package — WAIT for one more week of transit data, the EVSI against the delay cost, the futures weighed by their governed probabilities', async ({ page }) => {
    await uiLogin(page, DECIDER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations/impact');
    await expect(page.getByRole('heading', { name: 'Value of information', level: 2 })).toBeVisible();
    const list = page.getByRole('list', { name: 'value of information assessments' });
    await expect(list).toContainText(new RegExp(`WAIT for "${INFORMATION}"`));
    await expect(list).toContainText(/\(EVSI\) against a delay cost of/);
    await expect(list).toContainText(/expert_elicitation|frequency_map|model/);
    await shot(page, 'b31-impact-03-voi');
  });
});
