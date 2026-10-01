/**
 * CP-6 B31 §V — simulation validity (F-P5-09), exercised in a browser against the seeded DEMONSTRATION after the B31 act ran (the
 * rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — T. Nakamura's corridor run
 * cited by L. Brandt's package (EYE_B31_VALIDITY_PACKAGE), CHALLENGED and the challenge UPHELD by another person, so the run is INVALIDATED;
 * the package's option citing it marked INPUT INVALIDATED (refused at its next derivation and at the commitment); a promoted run reading
 * DECISION-GRADE (EYE_B31_VALIDITY_PROMOTED_RUN) and an unpromoted one DIAGNOSTIC ONLY; the domain's decision-use policy — so this file runs
 * through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b31-validity-*.png).
 * Personas: the package owner L. Brandt (EYE_B31_VALIDITY_DECIDER, default `l.brandt`), the run operator T. Nakamura (EYE_B31_VALIDITY_OPERATOR, default `t.nakamura`).
 * Every figure is SYNTHETIC.
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
const DECIDER = process.env['EYE_B31_VALIDITY_DECIDER'] ?? 'l.brandt';
const OPERATOR = process.env['EYE_B31_VALIDITY_OPERATOR'] ?? 't.nakamura';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('CP-6 B31 §V — simulation validity on the demonstration', () => {
  test('THE PACKAGE: L. Brandt opens her package\'s inputs — the option citing the upheld-challenge run is marked INPUT INVALIDATED and refused at its next derivation; the run reads REFUSED FOR DECISION', async ({ page }) => {
    const pkg = required('EYE_B31_VALIDITY_PACKAGE');
    const run = required('EYE_B31_VALIDITY_RUN');
    await uiLogin(page, DECIDER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto(`/twins/simulations/validity?package=${pkg}`);
    await expect(page.getByRole('heading', { name: 'Simulation validity', level: 1 })).toBeVisible();
    const inputs = page.getByRole('region', { name: 'A package\'s inputs' });
    await expect(inputs.getByRole('status')).toContainText('INPUT INVALIDATED');
    await expect(inputs.getByRole('table').first()).toContainText(/INPUT INVALIDATED — a cited run was invalidated; the option is refused at its next derivation/);
    await expect(inputs.getByRole('table').first()).toContainText('REFUSED FOR DECISION');
    await shot(page, 'b31-validity-01-package');
    const runs = page.getByRole('region', { name: 'Runs and their decision use' });
    await runs.getByRole('button', { name: `open run ${run}` }).click();
    const detail = page.getByRole('region', { name: /^Run / });
    await expect(detail.getByRole('status')).toContainText('REFUSED FOR DECISION');
    await expect(detail).toContainText(/invalidated: invalidated at .*challenge/);
    await shot(page, 'b31-validity-02-invalidated-run');
  });

  test('THE DECISION USE: a promoted run reads DECISION-GRADE; an unpromoted one DIAGNOSTIC ONLY; comparing the two is diagnostic only', async ({ page }) => {
    const promoted = required('EYE_B31_VALIDITY_PROMOTED_RUN');
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations/validity');
    const runs = page.getByRole('region', { name: 'Runs and their decision use' });
    await expect(runs.getByRole('table')).toContainText('DECISION-GRADE');
    await expect(runs.getByRole('table')).toContainText('DIAGNOSTIC ONLY');
    await runs.getByRole('checkbox', { name: `compare run ${promoted.slice(0, 8)}…` }).check();
    // one unpromoted run beside it: the first row reading DIAGNOSTIC ONLY
    const diag = runs.getByRole('row').filter({ hasText: 'DIAGNOSTIC ONLY' }).first();
    await diag.getByRole('checkbox').check();
    await runs.getByRole('button', { name: 'Compare the selected runs' }).click();
    await expect(runs.getByRole('status').last()).toContainText(/^DIAGNOSTIC ONLY: 1 of 2/);
    await shot(page, 'b31-validity-03-compare');
  });

  test('THE POLICY: the domain\'s decision-use policy as the act set it — a decision-grade result required at proposal and commitment', async ({ page }) => {
    await uiLogin(page, DECIDER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations/validity');
    const policy = page.getByRole('region', { name: 'The domain\'s decision-use policy' });
    await expect(policy).toContainText(/A DECISION-GRADE result is required at proposal and commitment/);
    await shot(page, 'b31-validity-04-policy');
  });
});
