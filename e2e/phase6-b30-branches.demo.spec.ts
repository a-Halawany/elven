/**
 * CP-6 B30 §BR — the twin state and branch explorer (F-P5-03): "the corridor twin is branched for a blockade; merging the branch back is
 * refused until reconciliation; the explorer shows the snapshot 5 days stale with a freshness banner" — exercised in a browser against the
 * seeded DEMONSTRATION after the B30 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is
 * what the act left — on the "NORDWERK — Ningbo → Regensburg chain" twin (owner T. Nakamura): a freshness SLO of 2 days and an actual head
 * observed through the database's day minus 5; a `blockade` branch forked from actual with the corridor shock as a SCENARIO element; an OPEN
 * merge of `blockade` into actual with its diverging keys unresolved. So this file runs through playwright.demo.config.ts only (the hosted
 * config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. The one write the walk attempts is the merge's
 * completion, which the server REFUSES (nothing changes; the refusal is the scene). Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b30-branches-*.png). Persona: the twin owner T. Nakamura (EYE_B30_OWNER, default `t.nakamura`). Every figure is SYNTHETIC.
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
const OWNER = process.env['EYE_B30_OWNER'] ?? 't.nakamura';
const TWIN = process.env['EYE_B30_TWIN_TITLE'] ?? 'NORDWERK — Ningbo → Regensburg chain';
const BRANCH = process.env['EYE_B30_BRANCH'] ?? 'blockade';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openExplorer(page: Page): Promise<void> {
  await page.goto('/twins');
  await page.getByRole('link', { name: /Explorer/ }).click();
  await expect(page.getByRole('heading', { name: 'Twin state and branch explorer', level: 1 })).toBeVisible();
  await page.getByLabel('Twin', { exact: true }).selectOption({ label: TWIN });
  await expect(page.getByRole('heading', { name: TWIN, level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B30 §BR — the twin state and branch explorer on the demonstration', () => {
  test('THE FRESHNESS BANNER: the served snapshot is 5 days stale against the owner\'s 2-day SLO', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openExplorer(page);
    const banner = page.getByRole('alert', { name: 'freshness' });
    await expect(banner).toContainText(/STALE — the served snapshot v\d+ is 5 days stale: its state is observed through \d{4}-\d{2}-\d{2}; the freshness SLO is 2 days \(v\d+\), exceeded by 3 days/);
    await expect(page.getByLabel('served state', { exact: true })).toContainText(/the head v\d+ of actual is served/);
    await shot(page, 'b30-branches-01-freshness-banner');
  });

  test('THE BRANCH: the corridor twin branched for a blockade — forked from actual, its head admitted', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openExplorer(page);
    const tree = page.getByRole('table', { name: 'branch tree' });
    await expect(tree.getByRole('row', { name: /^actual/ })).toBeVisible();
    await expect(tree.getByRole('row', { name: new RegExp(`^${BRANCH} v\\d+ v\\d+`) })).toBeVisible();
    await shot(page, 'b30-branches-02-branch-tree');
  });

  test('THE MERGE: merging the blockade back is refused until reconciliation — the diverging keys unresolved, the completion refused by the server', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openExplorer(page);
    const merge = page.getByRole('article', { name: `merge of ${BRANCH}` }).first();
    await expect(merge.getByLabel('merge state')).toContainText(/OPEN — merging back is refused until reconciliation: \d+ of \d+ diverging key\(s\) unresolved/);
    await expect(merge.getByRole('list', { name: 'diverging keys' })).toContainText(/shock\.corridor_delay_days: branch \d+ days \(scenario\) · actual \d+ days \(assumed\)/);
    await expect(merge.getByRole('list', { name: 'diverging keys' })).toContainText('UNRESOLVED');
    await merge.getByRole('button', { name: 'Merge the branch back into actual' }).click();
    await expect(page.getByText(/HTTP 409 EYE-STA-002 — branch merge rejected \(unreconciled\): merging branch blockade back into actual is refused until reconciliation/)).toBeVisible();
    await shot(page, 'b30-branches-03-merge-refused');
  });

  test('TIME TRAVEL: actual as it stood before the stale head, through the existing as-of route, with its diff against the head', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openExplorer(page);
    await page.getByLabel('Branch', { exact: true }).selectOption('actual');
    await page.getByLabel('As of (your local time)').fill(process.env['EYE_B30_AS_OF'] ?? '2026-09-01T12:00');
    await page.getByRole('button', { name: 'Show the state as of then' }).click();
    await expect(page.getByLabel('state as of')).toContainText(/actual stood at v\d+/);
    await expect(page.getByRole('table', { name: 'diff against actual' }).or(page.getByText('No key differs.'))).toBeVisible();
    await shot(page, 'b30-branches-04-time-travel');
  });
});
