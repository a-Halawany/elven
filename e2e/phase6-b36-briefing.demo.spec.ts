/**
 * CP-6 B36 part `briefing` — the live briefing studio v2 completed (BRF@v3), exercised in a browser against the seeded DEMONSTRATION after
 * the integrator's act (scripts/phase6/act-b36.mjs, the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it
 * reads is what the act left — the weekly NORDWERK briefing (act-b34's room) recomposed as BRF@v3 by the briefing agent and then by a
 * person under the executive + board audience with a purpose and an expiry, the corridor closure with its confidence band, the twin
 * snapshot declared unavailable (an omission), a stale single-source item suppressed and declared, the challenged dual-sourcing package
 * as a disputed item, a B28 warning as an indicator, and — after the synthetic outage — the urgent corridor item RETAINED with its
 * earlier as-of. This file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b36-briefing-*.png). Every figure on the demonstration is SYNTHETIC.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

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

/** The NORDWERK room and its NEWEST v3 edition opened in the studio (the room is act-b34's; the edition is the act's last, a person's). */
async function openNewestEdition(page: Page): Promise<void> {
  await page.goto('/decisions/briefings');
  await expect(page.getByRole('heading', { name: 'Briefings', level: 1 })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: /corridor/i }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole('button').first().click();
  const room = page.locator('section[aria-labelledby="room-h"]');
  await expect(room.getByText(/Members/)).toBeVisible();
  await room.locator('button', { hasText: /v3/ }).last().click(); // the room lists its editions oldest first (composed_at ascending): the NEWEST is the last
  await expect(page.locator('section[aria-labelledby="brf-h"]').getByText(/composed by/)).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('CP-6 B36 — the briefing studio v2 completed (BRF@v3) on the demonstration', () => {
  test('STUDIO: the executive sees the suppression policy in force and the contract the next edition is composed under', async ({ page }) => {
    await uiLogin(page, 's.okafor', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/briefings');
    await expect(page.getByRole('heading', { name: 'Briefings', level: 1 })).toBeVisible();
    // the policy the act published (prefer silence over false certainty): a version and its default line
    const pol = page.locator('section[aria-labelledby="pol-h"]');
    await expect(pol.getByText(/^v\d+ · default: ≥ \d+ source\(s\)/)).toBeVisible({ timeout: 20_000 });
    const row = page.getByRole('row').filter({ hasText: /corridor/i }).first();
    await row.getByRole('button').first().click();
    // the studio: the audience roles (a wrapping label includes its option text — selected by role), the expiry as datetime-local, the purpose
    const studio = page.locator('section[aria-labelledby="studio-h"]');
    await expect(studio.getByRole('checkbox', { name: 'executive' })).toBeChecked();
    await expect(studio.getByRole('checkbox', { name: 'board_member' })).toBeVisible();
    await expect(studio.getByLabel('Expires at')).toHaveAttribute('type', 'datetime-local');
    await expect(studio.getByLabel(/Purpose/)).toBeVisible();
    await shot(page, 'b36-briefing-01-studio');
  });

  test('EDITION: the person\'s BRF@v3 — audience, purpose, expiry; the omissions declared with their count; the suppressed item; the band beside every conclusion', async ({ page }) => {
    await uiLogin(page, 's.okafor', required('EYE_TEST_ADMIN_PASSWORD'));
    await openNewestEdition(page);
    const brf = page.locator('section[aria-labelledby="brf-h"]');
    await expect(brf.getByText(/BRF@v3/)).toBeVisible();
    await expect(brf.getByText(/Audience/).first()).toBeVisible();
    await expect(brf.getByText(/board_member/).first()).toBeVisible();
    await expect(brf.getByText(/Purpose/).first()).toBeVisible();
    await expect(brf.getByText(/expires /).first()).toBeVisible();
    // the omissions: the count named, the twin snapshot unavailable / the source degraded among them
    await expect(brf.getByRole('heading', { name: /Omissions — \d+ omissions? declared/ })).toBeVisible();
    // the suppressed item: withheld under policy, the rule and the measure in words
    await expect(brf.getByRole('heading', { name: /Suppressed under policy — \d+ item\(s\) not rendered/ })).toBeVisible();
    await expect(brf.getByText(/withheld under policy v\d+/).first()).toBeVisible();
    // the band beside every conclusion: the Uncertainty column, a band mark on the corridor item
    await expect(brf.getByRole('columnheader', { name: 'Uncertainty' })).toBeVisible();
    await expect(brf.getByText(/^[●◐○?] (HIGH|MEDIUM|LOW|UNKNOWN)$/).first()).toBeVisible();
    await shot(page, 'b36-briefing-02-edition');
  });

  test('SECTIONS: the challenged dual-sourcing package as a disputed item with its as-of; the B28 warning as an indicator', async ({ page }) => {
    await uiLogin(page, 's.okafor', required('EYE_TEST_ADMIN_PASSWORD'));
    await openNewestEdition(page);
    const brf = page.locator('section[aria-labelledby="brf-h"]');
    await expect(brf.getByRole('heading', { name: 'Disputed assessments' })).toBeVisible();
    await expect(brf.getByText(/^(challenge|dissent|contradiction)( on .*)? as of /).first()).toBeVisible();
    await expect(brf.getByRole('heading', { name: 'Emerging indicators' })).toBeVisible();
    await expect(brf.getByText(/(weak signal|stream rule fired)/).first()).toBeVisible();
    await shot(page, 'b36-briefing-03-sections');
  });

  test('OUTAGE: the edition composed under the synthetic outage retains the urgent corridor item with its earlier as-of, the outage declared', async ({ page }) => {
    await uiLogin(page, 's.okafor', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/briefings');
    const row = page.getByRole('row').filter({ hasText: /corridor/i }).first();
    await row.getByRole('button').first().click();
    const room = page.locator('section[aria-labelledby="room-h"]');
    // the act's outage edition is marked DEGRADED among the room's editions
    await room.locator('button', { hasText: /DEGRADED/ }).last().click(); // the newest degraded edition — the outage edition the act composes last
    const brf = page.locator('section[aria-labelledby="brf-h"]');
    await expect(brf.getByText(/DEGRADED OR BLOCKED SOURCES INSIDE/)).toBeVisible({ timeout: 20_000 });
    await expect(brf.getByText(/^RETAINED$/).first()).toBeVisible();
    await expect(brf.getByText(/from the prior edition, as of/).first()).toBeVisible();
    await expect(brf.getByText(/outage — urgent items retained/).first()).toBeVisible();
    await shot(page, 'b36-briefing-04-outage');
  });
});
