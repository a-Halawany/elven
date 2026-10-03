/**
 * CP-6 B90 §R — the data products pages (/graph/data/products and a product's page), exercised in a browser against the seeded
 * DEMONSTRATION after the B90 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what
 * the act left — the platform's own products registered by scripts/phase6/b90-platform-products.mjs (the typed object API, the observation
 * evidence, the graph query, the twin snapshot, the forecast package, the scenario portfolio, the simulation run, the decision package, the
 * briefing — each with an owner and an SLO, released by its owner after the steward's admission review), Part E's corridor warning stream
 * with its scorecard and its accepted consumer, the steward's degradation with a reason and the consumer's product.degradation item, the
 * owner's restoration after a domain review — so this file runs through playwright.demo.config.ts only (the hosted config ignores
 * *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b90-products-*.png).
 * Personas: the data steward EYE_B90_STEWARD (the act's SYNTHETIC persona; default `f.aydin`), an owner EYE_B90_PRODUCTS_OWNER (default
 * `n.eriksen`, the forecast package's owner), the consumer EYE_B90_CONSUMER (Part E's consumer persona; default `a.hoffmann`).
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
const OWNER = process.env['EYE_B90_PRODUCTS_OWNER'] ?? 'n.eriksen';
const CONSUMER = process.env['EYE_B90_CONSUMER'] ?? 'a.hoffmann';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openList(page: Page): Promise<void> {
  await page.goto('/graph/data/products');
  await expect(page.getByRole('heading', { name: 'Data products', level: 1 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'data products' })).toBeVisible();
}
/** Opens a product's page from the list by the link's text (the title the act registered). */
async function openProduct(page: Page, title: RegExp): Promise<void> {
  await openList(page);
  await page.getByRole('table', { name: 'data products' }).getByRole('link', { name: title }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test.describe.serial('CP-6 B90 §R — the data products pages on the demonstration', () => {
  test('THE LIST: the steward reads the registry — the platform\'s own products with their state, owner, released version and the scorecard\'s verdict', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openList(page);
    const table = page.getByRole('table', { name: 'data products' });
    // the nine platform products the act registered, each released with a verdict (the schedule computed a scorecard on each released product)
    for (const key of ['platform.object-api', 'platform.observation-evidence', 'platform.forecast-package', 'platform.briefing']) {
      await expect(table.getByText(key, { exact: true })).toBeVisible();
    }
    await expect(table.getByLabel('product state').filter({ hasText: /released|degraded/ }).first()).toBeVisible();
    await expect(table.getByLabel('scorecard verdict').filter({ hasText: /ok|degraded|failing/ }).first()).toBeVisible();
    // the state filter is a labelled select (a wrapping label includes its option text: select by role)
    await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('released');
    await expect(table.getByLabel('product state').filter({ hasText: /registered|withdrawn|retired/ })).toHaveCount(0);
    await shot(page, 'b90-products-01-list');
  });

  test('THE PRODUCT PAGE: the corridor warning stream — its scorecard with the SLO attainment against the floor, the lag measure, the accepted consumer, the versions, the reviews, the events', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openProduct(page, /Corridor warning stream/);
    await expect(page.getByLabel('product state')).toBeVisible();
    await expect(page.getByLabel('authority banner')).toContainText(/^Next: /);
    await expect(page.getByLabel('scorecard verdict')).toBeVisible();
    await expect(page.getByLabel('attainment line')).toContainText(/attainment|no SLO observation/);
    await expect(page.getByRole('table', { name: 'slo measures' }).getByText(/lag_/).first()).toBeVisible();
    const consumersTable = page.getByRole('table', { name: 'consumers' });
    await expect(consumersTable.getByLabel('consumer state').filter({ hasText: /accepted/ }).first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'versions' }).getByText(/RELEASED by/).first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'reviews' }).getByText(/admission review of v\d+: accepted/).first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'product events' }).getByText(/product\.released/).first()).toBeVisible();
    await shot(page, 'b90-products-02-product');
  });

  test('THE DEGRADATION AND THE RESTORATION ON THE RECORD: the product page shows the degradation event with its reason and the restoration; the consumer\'s attention queue shows the product.degradation item', async ({ page }) => {
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openProduct(page, /Corridor warning stream/);
    const eventsList = page.getByRole('list', { name: 'product events' });
    await expect(eventsList.getByText(/product\.degraded/).first()).toBeVisible();
    await expect(eventsList.getByText(/product\.restored/).first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'scorecard history' })).toBeVisible();
    await shot(page, 'b90-products-03-degradation-record');
    await uiLogin(page, CONSUMER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention');
    await expect(page.getByText(/Product corridor-warning-stream DEGRADED/).first()).toBeVisible();
    await shot(page, 'b90-products-04-consumer-queue');
  });

  test('THE OWNER\'S ACTS: the forecast package\'s owner sees the lifecycle controls as their own acts (release / degrade / withdraw / retire with a reason) and the cost form; the steward sees the review form on a product they do not own', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openProduct(page, /forecast package/i);
    await expect(page.getByRole('heading', { name: 'Your acts as the owner', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Release version' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Withdraw|Restore/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retire' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Attribute cost' })).toBeVisible();
    // the reason field gates the acts that say why (a disabled button until 8 characters)
    await expect(page.getByRole('button', { name: /^(Degrade|Withdraw|Restore)$/ }).first()).toBeDisabled();
    await page.getByLabel(/^Reason/).fill('a reason of eight characters or more');
    await expect(page.getByRole('button', { name: /^(Degrade|Withdraw|Restore)$/ }).first()).toBeEnabled();
    await shot(page, 'b90-products-05-owner-acts');
    await uiLogin(page, STEWARD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openProduct(page, /forecast package/i);
    await expect(page.getByRole('heading', { name: /Record a review/, level: 2 })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Kind', exact: true })).toBeVisible();
    await shot(page, 'b90-products-06-steward-review');
  });

  test('THE CONSUMER\'S OWN ACT: the consumer sees its registration on the corridor stream as accepted (the acceptance is nobody else\'s) with the contract test and migration controls', async ({ page }) => {
    await uiLogin(page, CONSUMER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openProduct(page, /Corridor warning stream/);
    await expect(page.getByRole('heading', { name: 'Your registration', level: 3 })).toBeVisible();
    await expect(page.getByText(/^You accepted v\d+\./).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record contract test' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'consumers' }).getByText(/\(you\)/).first()).toBeVisible();
    await shot(page, 'b90-products-07-consumer');
  });
});
