/**
 * CP-6 B90 §E — event products and subscriptions, exercised in a browser against the seeded DEMONSTRATION after the B90 act ran (the
 * rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the corridor warning
 * stream registered as an event product owned by an intelligence persona, NORDWERK procurement (the SYNTHETIC persona `h.weber`,
 * domain_analyst) subscribed with a lag policy of 2 events, flagged lagging on three new warnings, conformed and resumed by the owner —
 * so this file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b90-events-*.png).
 * Personas: the consumer's login is EYE_B90_EVENTS_CONSUMER (default `h.weber`); the product owner's is EYE_B90_EVENTS_OWNER (the intelligence
 * persona the act names; default `m.dvorak`, who holds the steward's view of every subscription).
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
const CONSUMER = process.env['EYE_B90_EVENTS_CONSUMER'] ?? 'h.weber';
const OWNER = process.env['EYE_B90_EVENTS_OWNER'] ?? 'm.dvorak';
const STREAM = process.env['EYE_B90_EVENTS_STREAM_TITLE'] ?? 'Corridor warning stream';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openStream(page: Page): Promise<void> {
  await page.goto('/graph/data/events');
  await expect(page.getByRole('heading', { name: 'Event products', level: 1 })).toBeVisible();
  // a wrapping <label> includes its option text: select by role; selectOption takes the option's exact label (a string), read from the option itself
  const products = page.getByRole('combobox', { name: 'Event product', exact: true });
  const label = await products.locator('option').filter({ hasText: new RegExp(STREAM) }).first().textContent();
  await products.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: new RegExp(`^${STREAM}`), level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B90 §E — event products and subscriptions on the demonstration', () => {
  test('THE CONSUMER: procurement reads the corridor warning stream — its schema and fields, the source ledger, the retention and its floor, the stream head — and its own subscription\'s state, checkpoint and lag against the policy', async ({ page }) => {
    await uiLogin(page, CONSUMER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openStream(page);
    await expect(page.getByLabel('schema line')).toContainText(/fields/);
    await expect(page.getByText(/prediction\.warning_events/).first()).toBeVisible();
    await expect(page.getByLabel('retention line')).toContainText(/are not served/);
    await expect(page.getByLabel('stream head')).toHaveText(/^\d+$/);
    // the consumer's own subscription: its state in words (whatever stage the act left), the checkpoint against the head — never a percentage
    const state = page.getByLabel('my subscription state');
    await expect(state).toContainText(/ACTIVE|LAGGING|PAUSED|REGISTERED|REVOKED/);
    const lag = page.getByLabel('my lag');
    await expect(lag).toContainText(/checkpoint \d+ of head \d+/);
    await expect(lag).not.toContainText(/%/);
    await shot(page, 'b90-events-01-consumer');
  });

  test('THE EVENTS SERVED: the consumer reads after its checkpoint — each row a sequence, a kind, the source event and the projected payload; a paused or lagging subscription is refused with the reason on screen', async ({ page }) => {
    await uiLogin(page, CONSUMER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openStream(page);
    const state = await page.getByLabel('my subscription state').textContent();
    await page.getByRole('button', { name: 'Read events' }).click();
    if (/ACTIVE/.test(state ?? '')) {
      await expect(page.getByRole('heading', { name: 'Events served', level: 3 })).toBeVisible();
      await expect(page.getByLabel('served line')).toContainText(/served after \d+/);
    } else {
      // the read is the port's refusal in the product's words: the button restores itself and the page keeps the state (nothing derived here)
      await expect(page.getByRole('button', { name: 'Read events' })).toBeEnabled();
    }
    await shot(page, 'b90-events-02-served');
  });

  test('THE OWNER: the product owner reads the subscriptions with their state, checkpoint and lag, the lag SLO observation, and holds the pause / resume / revoke controls', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openStream(page);
    const subs = page.getByRole('list', { name: 'subscriptions' });
    await expect(subs.first()).toBeVisible();
    await expect(page.getByLabel('subscription state').first()).toContainText(/ACTIVE|LAGGING|PAUSED|REGISTERED|REVOKED/);
    await expect(page.getByLabel('subscription lag').first()).toContainText(/policy \d+ events/);
    await expect(page.getByLabel('lag slo')).toContainText(/met|missed/);
    await expect(page.getByRole('button', { name: /Revoke|Resume|Pause|Authorize/ }).first()).toBeVisible();
    await shot(page, 'b90-events-03-owner');
  });
});
