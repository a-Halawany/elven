/**
 * CP-6 B30 §EX — the method-fabric experiments: one fabric experiment executed in chunks (each path one seeded execution of the adapter,
 * out of process) and a superseded run RETIRED with its reason and its reach — exercised in a browser against the seeded DEMONSTRATION
 * after the B30 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left —
 * the fabric experiment (EYE_B30_FABRIC_TITLE) on a twin bound to discrete-event@1, declared by its operator, its budget approved, started
 * and completed by the domain's attention agent; the retired run (EYE_B30_RETIRED_RUN, its reason EYE_B30_RETIRED_REASON) — so this file
 * runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b30-experiments-*.png). Personas: the run operator (EYE_B30_OPERATOR, default `t.nakamura`), the method steward
 * (EYE_B30_STEWARD, default `h.petrovic`). Every figure is SYNTHETIC.
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
const OPERATOR = process.env['EYE_B30_OPERATOR'] ?? 't.nakamura';
const STEWARD = process.env['EYE_B30_STEWARD'] ?? 'h.petrovic';
const TITLE = process.env['EYE_B30_FABRIC_TITLE'] ?? 'Regensburg line — bearing shortage';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openFabric(page: Page): Promise<void> {
  // through the twins workspace's navigation line (the one line this part adds there)
  await page.goto('/twins');
  await page.getByRole('link', { name: /Fabric experiments/ }).click();
  await expect(page.getByRole('heading', { name: 'Method-fabric experiments', level: 1 })).toBeVisible();
}

test.describe.serial('CP-6 B30 §EX — the method-fabric experiments on the demonstration', () => {
  test('THE CHUNKABLE METHODS: the seeded fabric methods beside supply-flow@1, each adapter\'s health worded', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openFabric(page);
    const methods = page.getByRole('table', { name: 'chunkable methods' });
    for (const m of ['discrete-event@1', 'counterfactual@1', 'war-gaming@1', 'supply-flow@1']) await expect(methods).toContainText(m);
    await expect(methods.getByRole('row').filter({ hasText: 'supply-flow@1' })).toContainText('IN PROCESS — not contained; never quarantined');
    await expect(methods.getByRole('row').filter({ hasText: 'discrete-event@1' })).toContainText(/HEALTHY|QUARANTINED/);
    await shot(page, 'b30-experiments-01-methods');
  });

  test('THE FABRIC EXPERIMENT: executed in chunks and COMPLETED; its checkpoint policy stated', async ({ page }) => {
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await openFabric(page);
    const list = page.getByRole('list', { name: 'experiments' });
    const row = list.getByRole('listitem').filter({ hasText: TITLE }).first();
    await expect(row).toContainText('discrete-event@1');
    await expect(row).toContainText(/COMPLETED|RETIRED/);
    await expect(row).toContainText(/On an unstable checkpoint: (STOP|PAUSE|NONE) —/);
    await shot(page, 'b30-experiments-02-fabric-experiment');
    // the experiment's chunks, checkpoints and run through the simulation center (B31's panel)
    await page.getByRole('link', { name: /Simulation center/ }).click();
    await page.getByRole('table', { name: 'experiments' }).getByRole('button', { name: new RegExp(TITLE) }).first().click();
    await expect(page.getByRole('region', { name: new RegExp(`^${TITLE}`) }).getByLabel('produced run', { exact: true })).toContainText(/COMPLETED — \d+ paths/);
    await shot(page, 'b30-experiments-03-chunks');
  });

  test('THE RETIREMENT: the superseded run RETIRED with its reason, its superseding run and its reach', async ({ page }) => {
    const runId = required('EYE_B30_RETIRED_RUN');
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await openFabric(page);
    await expect(page.getByRole('list', { name: 'retirements' })).toContainText(/retired — “.+” · superseded by run/);
    await page.getByLabel('Run id').fill(runId);
    await page.getByRole('button', { name: 'Read the run' }).click();
    await expect(page.getByLabel('retired', { exact: true })).toContainText(/RETIRED .* — “/);
    if (process.env['EYE_B30_RETIRED_REASON']) await expect(page.getByLabel('retired', { exact: true })).toContainText(process.env['EYE_B30_RETIRED_REASON']);
    await expect(page.getByLabel('reach', { exact: true })).toContainText(/package\(s\) citing it · \d+ analysis record\(s\) resting on it · \d+ run\(s\) comparing against it or correcting it/);
    await shot(page, 'b30-experiments-04-retired-run');
  });
});
