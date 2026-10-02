/**
 * CP-6 B90 §K — the Metadata Catalog (DAT-TR-01), exercised in a browser against the seeded DEMONSTRATION after the B90 act ran (the
 * rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the data steward's
 * reconciliation (the demonstration's registries as catalog entries), the owners set, the lineage "Red Sea AIS" source → the corridor
 * forecasts product → the corridor warning stream, the staging asset `ais_staging_2025w40` registered without an owner and flagged ORPHAN
 * by the next reconciliation (the catalog.coverage item in the steward's queue) — so this file runs through playwright.demo.config.ts only
 * (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b90-catalog-*.png).
 * Personas: the data steward's login is EYE_B90_STEWARD (the act's SYNTHETIC persona; default `f.aydin`); an internal-cleared reader is
 * EYE_B90_READER (default `a.novak`, the B36 strategy lead). The searched source's title is EYE_B90_AIS_TITLE (default `Red Sea AIS`).
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
const STEWARD = process.env['EYE_B90_STEWARD'] ?? 'f.aydin';
const READER = process.env['EYE_B90_READER'] ?? 'a.novak';
const AIS = process.env['EYE_B90_AIS_TITLE'] ?? 'Red Sea AIS';
const STAGING = 'ais_staging_2025w40';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openCatalog(page: Page): Promise<void> {
  await page.goto('/graph/data/catalog');
  await expect(page.getByRole('heading', { name: 'Metadata Catalog', level: 1 })).toBeVisible();
  await expect(page.getByLabel('coverage totals')).toBeVisible();
}
async function searchFor(page: Page, q: string): Promise<void> {
  await page.getByLabel(/^Search the catalog/).fill(q);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('hidden line')).toBeVisible();
}

test.describe.serial('CP-6 B90 §K — the metadata catalog on the demonstration', () => {
  test('THE SEARCH: the steward searches the AIS source and sees its owner, its lineage to the corridor forecasts and the warning stream, and the trust marks on the hit', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCatalog(page);
    await searchFor(page, AIS);
    const hits = page.getByRole('list', { name: 'catalog hits' });
    const hit = hits.locator('li').filter({ hasText: AIS }).first();
    await expect(hit).toBeVisible();
    await expect(hit).toContainText(/owner (?!— none)/);            // an owner was set by the steward
    await expect(hit.getByLabel('trust line')).toContainText(/trusted/);
    const lineage = hit.getByRole('list', { name: /^lineage of / });
    await expect(lineage.getByText(/feeds → Corridor .*forecast/i).first()).toBeVisible();
    await shot(page, 'b90-catalog-01-search');
  });

  test('THE ASSET PANEL: the source opened from the hit — identity, owner and recertification date, the lineage downstream to the forecasts and, through them, the warning stream; the flags list', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCatalog(page);
    await searchFor(page, AIS);
    await page.getByRole('list', { name: 'catalog hits' }).getByRole('button', { name: new RegExp(AIS) }).first().click();
    await expect(page.getByRole('heading', { name: new RegExp(AIS), level: 2 })).toBeVisible();
    await expect(page.getByLabel('asset trust line')).toContainText(/trusted/);
    await expect(page.getByText(/recertify by \d{4}-\d{2}-\d{2}/)).toBeVisible();
    const downstream = page.getByRole('list', { name: 'downstream' });
    await expect(downstream.getByText(/feeds → Corridor .*forecast/i).first()).toBeVisible();
    // the forecasts' own panel: the warning stream downstream
    await downstream.getByRole('button', { name: /Corridor .*forecast/i }).first().click();
    await expect(page.getByRole('heading', { name: /Corridor .*forecast/i, level: 2 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'downstream' }).getByText(/warning stream/i).first()).toBeVisible();
    await shot(page, 'b90-catalog-02-asset-lineage');
  });

  test('THE COVERAGE DEBT: the orphaned staging asset ais_staging_2025w40 — registered without an owner, flagged ORPHAN by the reconciliation (undiscoverable, hidden from the search) — and the debt per kind', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCatalog(page);
    const debt = page.getByRole('list', { name: 'coverage debt' });
    await expect(debt.getByText(/^staging asset: /).first()).toBeVisible();
    await expect(debt.getByText(/staging asset: .* orphan \d/).first()).toBeVisible();
    await expect(page.getByLabel('coverage totals')).toContainText(/\d+ undiscoverable/);
    await expect(page.getByText(/Last reconciliation \d{4}-\d{2}-\d{2}/)).toBeVisible();
    // the search counts the orphan as hidden, never serves it
    await searchFor(page, STAGING);
    await expect(page.getByLabel('hidden line')).toContainText(/1 hidden: 1 undiscoverable/);
    // the entry itself, chosen from the entries list: the orphan flag with its since and reason
    const assets = page.getByRole('combobox', { name: 'Asset', exact: true });
    // the entries list names an entry by its TITLE (the ref is the search's): the staging asset's title is "AIS staging 2025 week 40 (SYNTHETIC)"
    const label = await assets.locator('option').filter({ hasText: /AIS staging 2025 week 40/ }).first().textContent();
    await assets.selectOption({ label: label ?? '' });
    await expect(page.getByRole('heading', { name: /AIS staging/i, level: 2 })).toBeVisible();
    const flags = page.getByRole('list', { name: 'flags' });
    await expect(flags.getByText(/orphan .* since \d{4}-\d{2}-\d{2} — a staging asset with no owner and no lineage/).first()).toBeVisible();
    await expect(flags.getByText(/unowned .* coverage debt/).first()).toBeVisible();
    await expect(page.getByLabel('asset trust line')).toContainText(/undiscoverable \(orphan\)/);
    // the steward's own acts are offered on the panel
    await expect(page.getByRole('button', { name: 'Set owner' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run the reconciliation' })).toBeVisible();
    await shot(page, 'b90-catalog-03-orphan-coverage');
  });

  test('THE GLOSSARY AND THE READER: the glossary lists the steward\'s terms; an internal-cleared reader searches without the steward\'s controls and sees the hidden count', async ({ page }) => {
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCatalog(page);
    await expect(page.getByRole('button', { name: 'Run the reconciliation' })).toHaveCount(0);
    await expect(page.getByText(/data steward's acts/)).toBeVisible();
    await searchFor(page, AIS);
    // the hidden count is the labelled span; the reader's clearance is printed beside it in the same status line
    await expect(page.getByLabel('hidden line')).toContainText(/match\(es\)/);
    await expect(page.getByText(/your clearance is (internal|confidential|restricted)/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'catalog hits' }).locator('li').filter({ hasText: AIS }).first()).toBeVisible();
    await shot(page, 'b90-catalog-04-reader');
  });
});
