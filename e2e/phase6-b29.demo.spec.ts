/**
 * CP-6 B29 — twin composition, the supply network, the method fabric and the constraint engine, exercised in a browser against the
 * seeded DEMONSTRATION after scripts/phase6/act-b29.mjs ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate
 * case: what it reads is what the act left (the enterprise ← process ← corridor links with the corridor's 62 % coupled through, the
 * enterprise's capacity utilisation at 1.2903, the discrete-event study of the Regensburg line bound and run under the bearing shortage,
 * the warehouse capacity with the refused and the amended week-42 replenishment plan), so this file runs through playwright.demo.config.ts
 * only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. The discrete-event run is opened by the id the act
 * printed (EYE_B29_DES_RUN, "the discrete-event run the walk reads"); without it the walk opens the listed runs until one names
 * discrete-event@1. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b29-*.png).
 */
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const expect = baseExpect.configure({ timeout: 20_000 });

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** The twin titles the act declares (act-b29.mjs). */
const ENTERPRISE_TITLE = 'Enterprise twin — NORDWERK';
const PROCESS_TITLE = 'Regensburg plant — assembly line (process twin)';
const NETWORK_TITLE = 'Hub-module supply network — NORDWERK Regensburg (3 tiers)';
const DES_TITLE = 'Regensburg plant — line 1 and its bearing supply (discrete-event study)';

async function openTwin(page: Page, title: string): Promise<void> {
  await page.goto('/twins');
  await expect(page.getByRole('heading', { name: 'Twins', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Composition', level: 3 })).toBeVisible({ timeout: 20_000 });
}

// the panels load their reads after the page (a freshly restarted server answers the first reads slowly): 20 s per assertion
test.describe.configure({ timeout: 120_000 });

test.describe.serial('CP-6 B29 — composition, the supply network, the methods and the constraints on the demonstration', () => {
  test('COMPOSITION: the enterprise twin — its links, dependency completeness, the coupled capacity and the utilisation that moved', async ({ page }) => {
    await uiLogin(page, 'r.aydin', required('EYE_TEST_ADMIN_PASSWORD'));
    await openTwin(page, ENTERPRISE_TITLE);
    const panel = page.getByRole('region', { name: 'Composition' });
    await expect(panel.getByText('Dependency completeness').first()).toBeVisible();
    await expect(panel.getByText(/2 of 3 required families linked — missing market/)).toBeVisible();
    // the family measure the coupling moved: 800 units/day of demand on the corridor's 620 units/day
    await expect(panel.getByText(/capacity_utilisation: 1\.2903 \(129%\)/).first()).toBeVisible();
    // the live link, declared by this (downstream) twin's owner, and its mapping
    await expect(panel.getByText(/supply\.capacity_per_day → process\.supply_capacity_per_day:regensburg/)).toBeVisible();
    // a coupling APPLIED: the decided proposals name the version each was applied into
    await panel.getByText(/^Decided proposals \(\d+\)$/).click();
    await expect(panel.getByText(/applied/).first()).toBeVisible();
    await shot(page, 'b29-01-composition-enterprise');
  });

  test('COMPOSITION: the process twin — coupled from the corridor, depended on by the enterprise; throughput bounded by supply', async ({ page }) => {
    await uiLogin(page, 'e.kovacs', required('EYE_TEST_ADMIN_PASSWORD'));
    await openTwin(page, PROCESS_TITLE);
    const panel = page.getByRole('region', { name: 'Composition' });
    await expect(panel.getByText(/complete — 1 of 1 required families linked/)).toBeVisible();
    await expect(panel.getByText(/supply\.capacity_per_day → supply\.capacity_per_day/)).toBeVisible();
    await expect(panel.getByText(/throughput_per_day: 620$/).first()).toBeVisible();
    await expect(panel.getByText(/bottleneck: supply$/).first()).toBeVisible();
    await expect(panel.getByText(/approved methods: discrete-event, flow/)).toBeVisible();
    await shot(page, 'b29-02-composition-process');
  });

  test('SUPPLY NETWORK: the 3-tier network — the tier-2 bearing maker is the bottleneck', async ({ page }) => {
    await uiLogin(page, 't.nakamura', required('EYE_TEST_ADMIN_PASSWORD'));
    await openTwin(page, NETWORK_TITLE);
    const panel = page.getByRole('region', { name: 'Composition' });
    await expect(panel.getByText(/bottleneck: bearing-maker\.bearing$/).first()).toBeVisible({ timeout: 20_000 });
    await expect(panel.getByText(/throughput_per_day: 450$/).first()).toBeVisible();
    await shot(page, 'b29-03-supply-network');
  });

  test('METHODS: the portfolio, the discrete-event binding on the study twin, and its run under the bearing shortage', async ({ page }) => {
    await uiLogin(page, 'e.kovacs', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations');
    await expect(page.getByRole('heading', { name: 'Simulations', level: 1 })).toBeVisible();
    const methods = page.getByRole('region', { name: 'Methods' });
    await expect(methods).toBeVisible({ timeout: 20_000 });
    const des = methods.getByRole('row').filter({ hasText: 'discrete-event@1' }).first();
    await expect(des).toBeVisible();
    await expect(des.getByText(/healthy/)).toBeVisible();
    await expect(methods.getByText(/no external solver is connected/)).toBeVisible();
    await methods.getByRole('combobox', { name: 'Twin', exact: true }).selectOption({ label: DES_TITLE });
    const binding = methods.getByRole('row').filter({ hasText: 'discrete-event@1' }).filter({ hasText: 'active' }).first();
    await expect(binding).toBeVisible({ timeout: 20_000 });
    await expect(binding.getByText(/the Regensburg line study/)).toBeVisible();
    await shot(page, 'b29-04-methods');

    // the run: by the id the act printed, else the listed runs opened until one is bound to discrete-event@1
    const detail = page.locator('section[aria-labelledby="run-d"]');
    const runs = page.locator('table').filter({ has: page.getByText(/run\(s\) — SYNTHETIC/) });
    const given = process.env['EYE_B29_DES_RUN'];
    let found = false;
    if (given !== undefined && given !== '') {
      await runs.getByRole('button', { name: new RegExp(`^${given.slice(0, 8)}`) }).first().click();
      await expect(detail.getByText('discrete-event@1').first()).toBeVisible({ timeout: 20_000 });
      found = true;
    } else {
      const buttons = runs.getByRole('row').getByRole('button');
      const n = Math.min(await buttons.count(), 60);
      for (let i = 0; i < n && !found; i += 1) {
        await buttons.nth(i).click();
        await expect(detail).toBeVisible({ timeout: 20_000 });
        found = (await detail.getByText('discrete-event@1').count()) > 0;
      }
    }
    expect(found, 'a discrete-event@1 run is listed').toBe(true);
    await expect(detail.getByText(/seeded/).first()).toBeVisible();
    // the method's own headline results (the run page shows them since the B29 walk found only supply-flow's totals rendered)
    await expect(detail.getByText(/line stop days 18/)).toBeVisible();
    await expect(detail.getByText(/final backlog 7480/)).toBeVisible();
    await expect(detail.getByRole('heading', { name: /— SYNTHETIC/ })).toBeVisible();
    await shot(page, 'b29-05-discrete-event-run');
  });

  test('CONSTRAINTS: the warehouse capacity, the refused week-42 plan and the amended plan that passed', async ({ page }) => {
    await uiLogin(page, 's.lindqvist', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/constraints');
    await expect(page.getByRole('heading', { name: 'Constraints', level: 1 })).toBeVisible();
    await expect(page.getByRole('article', { name: 'constraint set regensburg-warehouse-capacity' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Recorded plan checks', level: 2 })).toBeVisible();
    const rows = page.getByRole('row').filter({ hasText: 'regensburg-replenishment-w42' });
    await expect(rows.filter({ hasText: /REFUSED — 1 violation: regensburg-pallets \(bound ≤ 1800 pallets per day, observed 2350 pallets on 2026-10-14\)/ }).first()).toBeVisible({ timeout: 20_000 });
    await expect(rows.filter({ hasText: /satisfied — the plan is within every constraint checked/ }).first()).toBeVisible();
    await shot(page, 'b29-06-constraints');
  });
});
