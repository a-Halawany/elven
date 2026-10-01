/**
 * CP-6 B31 §O — the simulation center: a 5,000-path corridor experiment run in the background under an approved budget, checkpointed
 * halfway, paused and resumed, completed with its manifest — exercised in a browser against the seeded DEMONSTRATION after the B31 act ran
 * (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — T. Nakamura's
 * experiment (EYE_B31_EXPERIMENT_TITLE) on the "NORDWERK — Ningbo → Regensburg chain" twin, declared by him, its budget approved by
 * J. Weber, started, paused at the fifth of ten checkpoints and resumed, completed by the domain's attention agent after its ticks — so this
 * file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b31-orchestration-*.png).
 * Personas: the run operator T. Nakamura (EYE_B31_OPERATOR, default `t.nakamura`), the budget approver J. Weber (EYE_B31_APPROVER, default `j.weber`).
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
const OPERATOR = process.env['EYE_B31_OPERATOR'] ?? 't.nakamura';
const APPROVER = process.env['EYE_B31_APPROVER'] ?? 'j.weber';
const TITLE = process.env['EYE_B31_EXPERIMENT_TITLE'] ?? 'Corridor closure — 5,000 paths';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openExperiment(page: Page): Promise<void> {
  // from the simulations page, through its link (the one line the center adds there)
  await page.goto('/twins/simulations');
  await page.getByRole('link', { name: /Simulation center/ }).click();
  await expect(page.getByRole('heading', { name: 'Simulation center', level: 1 })).toBeVisible();
  const list = page.getByRole('table', { name: 'experiments' });
  await list.getByRole('button', { name: new RegExp(TITLE) }).first().click();
  await expect(page.getByRole('heading', { name: new RegExp(`^${TITLE}`), level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B31 §O — the simulation center on the demonstration', () => {
  test('THE EXPERIMENT: T. Nakamura\'s 5,000-path corridor experiment COMPLETED under its approved budget — every chunk done, ten chained checkpoints, the run completed', async ({ page }) => {
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await openExperiment(page);
    await expect(page.getByLabel('experiment state').first()).toContainText('COMPLETED');
    await expect(page.getByLabel('budget use')).toContainText(/^paths 5000\/5000 \(approved ≤ \d+\) · wall [\d.]+ s of \d+ s · chunk executions \d+ of \d+/);
    await expect(page.getByLabel('admission')).toContainText(/^ADMITTED — deterministic \(10 chunks\)/);
    await expect(page.getByLabel('produced run')).toContainText(/COMPLETED — 5000 paths, outputs [0-9a-f]{12}…/);
    const checkpoints = page.getByRole('table', { name: 'checkpoints' });
    await expect(checkpoints.getByRole('row')).toHaveCount(11);   // the header and ten checkpoints
    await expect(page.getByRole('table', { name: 'chunks' })).not.toContainText(/queued|running|failed/);
    await expect(page.getByLabel('indicators')).toContainText(/total_cost: (STABLE|UNSTABLE) — mean/);
    await shot(page, 'b31-orchestration-01-completed');
  });

  test('THE PAUSE AND THE RESUMPTION: the ledger shows the fifth checkpoint (halfway), the pause with its reason, the resumption, and the completion; the manifest binds every chunk', async ({ page }) => {
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await openExperiment(page);
    const ledger = page.getByRole('list', { name: 'ledger' });
    await expect(ledger).toContainText('checkpoint 5 — chunk 4, 2500/5000 paths');
    await expect(ledger).toContainText(/paused — /);
    await expect(ledger).toContainText(/resumed/);
    await expect(ledger).toContainText(/completed/);
    const manifest = page.getByRole('group', { name: 'manifest' });
    await manifest.locator('summary').click();
    await expect(manifest).toContainText('"checkpoint_head"');
    await expect(manifest).toContainText('"first_path": 4500');
    await shot(page, 'b31-orchestration-02-ledger-manifest');
  });

  test('THE APPROVAL: J. Weber\'s approval of the budget is on the record (a named human other than the declarer)', async ({ page }) => {
    await uiLogin(page, APPROVER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openExperiment(page);
    await expect(page.getByLabel('approval')).toContainText(/approved by .* — .{8,}/);
    await expect(page.getByRole('list', { name: 'ledger' })).toContainText(/approved/);
    await shot(page, 'b31-orchestration-03-approval');
  });
});
