/**
 * CP-6 B33 §TW — the twin pieces (F-P5-03 completes; F-P5-02 and F-P5-04 advance), exercised in a browser against the seeded DEMONSTRATION
 * after the B33 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left on
 * the "NORDWERK — Ningbo → Regensburg chain" twin (owner T. Nakamura):
 *   · a merge of `stress-75` INTO `blockade` (two non-actual branches), refused until its diverging key was reconciled, then MERGED;
 *   · an OPEN DRAFT on `blockade` (EYE_B33_DRAFT_BRANCH) the walk grounds a scenario element into THROUGH THE NEW WEB FORM — its one write
 *     scene: first refused in the server's words (the scenario alone on a material key), then grounded citing the SCN object and its branch;
 *   · the open 78.074 % estimate (the Reconciliation Agent's real-count proposal of 2026-10-08) DECIDED by T. Nakamura — its review item CLOSED,
 *     the approved element citing the estimate;
 *   · a new outside-envelope run's awaiting-admission item CLOSED by T. Nakamura's exploratory admission, the admission's item CLOSED by
 *     H. Petrović's concurrence (on the attention page);
 *   · open_run's envelope refusal in the new wording (a run outside the envelope with no acknowledgement — refused, nothing opened).
 * So this file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/
 * b33-twin-*.png). Personas: the twin owner T. Nakamura (EYE_B33_OWNER, default `t.nakamura`), the attention reader M. Dvořák
 * (EYE_B33_READER, default `m.dvorak`). The outside-envelope version: EYE_B33_OUTSIDE_VERSION on the branch EYE_B33_OUTSIDE_BRANCH (default `actual`). Every figure is SYNTHETIC except the PortWatch transit count the 78.074 % rests on (the real publisher's).
 */
import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test';
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
const OWNER = process.env['EYE_B33_OWNER'] ?? 't.nakamura';
const READER = process.env['EYE_B33_READER'] ?? 'm.dvorak';
const TWIN = process.env['EYE_B33_TWIN_TITLE'] ?? 'NORDWERK — Ningbo → Regensburg chain';
const SOURCE = process.env['EYE_B33_MERGE_SOURCE'] ?? 'stress-75';
const TARGET = process.env['EYE_B33_MERGE_TARGET'] ?? 'blockade';
const DRAFT_BRANCH = process.env['EYE_B33_DRAFT_BRANCH'] ?? 'blockade';
const SCENARIO = process.env['EYE_B33_SCENARIO_TITLE'] ?? 'Bab el-Mandeb';
const SCENARIO_BRANCH = process.env['EYE_B33_SCENARIO_BRANCH'] ?? 'Corridor collapse';
const KEY = 'corridor.capacity_share';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
/** A select's option chosen by its visible text (the server's words — a version number or a draft the act made). */
async function selectByText(select: Locator, re: RegExp): Promise<void> {
  const option = select.locator('option').filter({ hasText: re }).first();
  await expect(option).toHaveCount(1);
  await select.selectOption((await option.getAttribute('value')) as string);
}
async function openExplorer(page: Page): Promise<void> {
  await page.goto('/twins');
  await page.getByRole('link', { name: /Explorer/ }).click();
  await expect(page.getByRole('heading', { name: 'Twin state and branch explorer', level: 1 })).toBeVisible();
  await page.getByLabel('Twin', { exact: true }).selectOption({ label: TWIN });
  await expect(page.getByRole('heading', { name: TWIN, level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B33 §TW — the twin pieces on the demonstration', () => {
  test('THE MERGE BETWEEN TWO NON-ACTUAL BRANCHES: stress-75 merged into blockade — the target named, the base their common version, merged on the target', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openExplorer(page);
    const merge = page.getByRole('article', { name: `merge of ${SOURCE} into ${TARGET}` }).first();
    await expect(merge).toContainText(new RegExp(`${SOURCE} v\\d+ → ${TARGET} v\\d+`));
    await expect(merge.getByLabel('merge state')).toContainText(new RegExp(`MERGED — admitted on ${TARGET} as v\\d+`));
    await expect(merge.getByRole('list', { name: 'diverging keys' })).toContainText(new RegExp(`source .* · ${TARGET} `));
    await expect(page.getByRole('list', { name: 'branch ledger' })).toContainText(new RegExp(`merge of ${SOURCE} v\\d+ into ${TARGET} v\\d+ opened`));
    // the merge form offers the other branches as targets
    await page.getByLabel('Branch to merge back').selectOption(SOURCE);
    await expect(page.getByLabel('Merge into').locator('option', { hasText: TARGET })).toHaveCount(1);
    await shot(page, 'b33-twin-01-merge-between-branches');
  });

  test('THE SCENARIO-ELEMENT FORM: refused in the server\'s words (the scenario alone on a material key), then grounded citing the scenario and its branch', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openExplorer(page);
    const form = page.locator('section[aria-labelledby="se-h"]');
    await expect(form.getByRole('heading', { name: 'Scenario elements', level: 2 })).toBeVisible();
    await selectByText(form.getByLabel('Open draft (non-actual branch)'), new RegExp(`^${DRAFT_BRANCH} · draft v\\d+$`));
    await selectByText(form.getByLabel('Scenario', { exact: true }), new RegExp(SCENARIO));
    await selectByText(form.getByLabel('Scenario branch'), new RegExp(`^${SCENARIO_BRANCH} ·`));
    await form.getByLabel('Basis').selectOption('scenario');
    // REFUSED: the scenario citation alone on a MATERIAL key — the server's own words
    await form.getByLabel('Element key').fill('shock.corridor_delay_days');
    await form.getByLabel('Scenario value').fill('60');
    await form.getByLabel('Unit').fill('days');
    await form.getByRole('button', { name: 'Ground the scenario element' }).click();
    await expect(page.getByText(/HTTP 422 EYE-REQ-001 — scenario element rejected \(basis\): shock\.corridor_delay_days is material for this twin/)).toBeVisible();
    await shot(page, 'b33-twin-02-scenario-form-refused');
    // GROUNDED: a non-material key, the scenario basis, the days it holds (a DATE as the day it names)
    await form.getByLabel('Element key').fill('corridor.closure_share');
    await form.getByLabel('Scenario value').fill('100');
    await form.getByLabel('Unit').fill('%');
    await form.getByLabel('Valid from (a day)').fill('2026-10-09');
    await form.getByLabel('Valid to (a day)').fill('2026-11-23');
    await form.getByRole('button', { name: 'Ground the scenario element' }).click();
    await expect(form.getByLabel('scenario element grounded')).toContainText(/^corridor\.closure_share grounded as a SCENARIO element citing scenario [0-9a-f]{8}… v\d+ \(branch [0-9a-f]{8}…\)/);
    await shot(page, 'b33-twin-03-scenario-form-grounded');
  });

  test('THE ESTIMATE DECIDED: the 78.074 % estimate approved by T. Nakamura — its review item CLOSED; the snapshot published', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins');
    await page.getByRole('link', { name: /Reconciliation/ }).click();
    await expect(page.getByRole('heading', { name: 'Reconciliation', level: 1 })).toBeVisible();
    await page.getByRole('combobox', { name: 'Twin', exact: true }).selectOption({ label: TWIN });
    const row = page.getByRole('table', { name: 'estimates' }).getByRole('row').filter({ hasText: KEY }).filter({ hasText: /78\.074/ }).filter({ hasText: /approved/ }).first();   // the DECIDED one (the Reconciliation Agent may propose again on the new head)
    await row.getByRole('button').click();
    await expect(page.getByLabel('estimate state')).toContainText('APPROVED');
    await expect(page.getByLabel('snapshot', { exact: true })).toContainText(/^published as v\d+$/);
    await expect(page.getByText(/twin\.reconciliation — closed/)).toBeVisible();
    await shot(page, 'b33-twin-04-estimate-item-closed');
  });

  test('THE OUTSIDE RUN\'S ITEMS: the awaiting-admission item and the admission\'s item, each CLOSED by the decision (the attention queue)', async ({ page }) => {
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention');
    await expect(page.getByRole('heading', { name: /^Queue \(\d+ in the domain\)$/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('region', { name: /^Queue \(/ }).getByLabel('State', { exact: true }).selectOption('closed');   // the queue's filter (the reviews and suppression panels carry a State too)
    const awaiting = page.getByRole('row').filter({ hasText: 'twin.envelope' }).filter({ hasText: /awaiting a twin owner's exploratory admission/ }).first();
    await expect(awaiting).toBeVisible({ timeout: 20_000 });
    await expect(awaiting).toContainText(/closed/i);   // the queue renders the state as a mark: "■ CLOSED"
    const admitted = page.getByRole('row').filter({ hasText: 'twin.envelope' }).filter({ hasText: /admitted as exploratory — awaiting a method steward's concurrence/ }).first();
    await expect(admitted).toBeVisible();
    await shot(page, 'b33-twin-05-outside-run-items-closed');
  });

  test('open_run\'S WORDING: a run outside the envelope with no acknowledgement is refused — "needs a twin owner\'s acknowledgement"; nothing opened', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations');
    await expect(page.getByRole('heading', { name: 'Simulations', level: 1 })).toBeVisible();
    const run = page.locator('section[aria-labelledby="run-h"]');
    await run.getByRole('combobox', { name: /^Twin/ }).selectOption({ label: TWIN });
    // the 75-day state lives on the BRANCH stress-75 on the demonstration (B30 never put it on actual's head): the act names the version and its branch
    await selectByText(run.getByRole('combobox', { name: /^Admitted, complete version/ }), new RegExp(`^v${required('EYE_B33_OUTSIDE_VERSION')} · ${process.env['EYE_B33_OUTSIDE_BRANCH'] ?? 'actual'}`));
    await run.getByRole('button', { name: 'Run control' }).click();
    await expect(page.getByText(/run rejected \(envelope\): outside the operating envelope of supply-flow@1 .* needs a twin owner's acknowledgement \(envelope\.acknowledge true with a reason of 8\+ characters\)/)).toBeVisible();
    await expect(page.getByText(/domain administrator's acknowledgement/)).toHaveCount(0);
    await shot(page, 'b33-twin-06-open-run-wording');
  });
});
