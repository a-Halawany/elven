/**
 * PHASE 6 — the Decisions and Briefings screens, exercised in a browser against the
 * seeded demonstration (acts I–VI on the demonstration database).
 *
 * What is asserted is what the record says on screen: the package's state in words,
 * SYNTHETIC on every simulated consequence, the choice and its outcome criterion, the
 * dissent, the approvals and the C3 commitment, the replay's five layers with their
 * cut-offs, the room's members and cadence, and a briefing whose sources are marked
 * live / replayed / operator upload and whose windows are ordered by time left.
 *
 * Runs through playwright.demo.config.ts only. Screenshots go to EYE_SHOTS.
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

test.describe.serial('Phase 6 — Decisions and Briefings screens', () => {
  test('DECISIONS: the committed package shows its state, SYNTHETIC consequences, the choice, dissent, approvals and the C3 commitment', async ({ page }) => {
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions');
    await expect(page.getByRole('heading', { name: 'Decisions' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'January corridor collapse' }).first();
    await expect(row.getByText(/COMMITTED|MONITORING|CLOSED/)).toBeVisible();
    await expect(row.getByText('SYNTHETIC').first()).toBeVisible();
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="dpk-h"]');
    await expect(detail.getByText(/SYNTHETIC DECISION/).first()).toBeVisible();
    await expect(detail.getByText('■ CHOSEN')).toBeVisible();
    await expect(detail.getByText(/Options on one baseline/)).toBeVisible();
    await expect(detail.getByText('SYNTHETIC').first()).toBeVisible();
    await expect(detail.getByText(/status quo \(do nothing\)/)).toBeVisible();
    await expect(detail.getByText(/UNSIMULATED/).first()).toBeVisible();
    await expect(detail.getByText(/38 days below safety stock/)).toBeVisible();
    await expect(detail.getByText(/■ COMMITTED/)).toBeVisible();
    await expect(detail.getByText(/decision\.commit/)).toBeVisible();
    await expect(detail.getByText(/OUTCOME NOT MET|OUTCOME MET/)).toBeVisible();
    await shot(page, '13-decisions');
  });

  test('REPLAY: five layers under their cut-offs; nothing observed appears in the earlier layers', async ({ page }) => {
    await uiLogin(page, 's.okafor', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions');
    const row = page.getByRole('row').filter({ hasText: 'January corridor collapse' }).first();
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="dpk-h"]');
    await detail.getByRole('button', { name: 'Replay what we knew' }).click();
    const replay = page.locator('section[aria-labelledby="rpl-h"]');
    await expect(replay).toBeVisible();
    await expect(replay.getByText(/known \/ believed: recorded at or before/)).toBeVisible();
    await expect(replay.getByText(/observed through 2024-01-17/)).toBeVisible();
    await expect(replay.getByText(/evidence version\(s\)/)).toBeVisible();
    await expect(replay.getByText(/assumption .* was/)).toBeVisible();
    await expect(replay.getByText(/commitment at class C3/)).toBeVisible();
    await expect(replay.getByText(/outcomes: 1/)).toBeVisible();
    await shot(page, '14-replay');
  });

  test('BRIEFINGS: the room, its members and cadence; a briefing with source states and windows ordered by time left', async ({ page }) => {
    await uiLogin(page, 's.okafor', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/briefings');
    await expect(page.getByRole('heading', { name: 'Briefings' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'January corridor collapse' }).first();
    await expect(row.getByText(/every 7 day\(s\)/)).toBeVisible();
    await row.getByRole('button').first().click();
    const room = page.locator('section[aria-labelledby="room-h"]');
    await expect(room.getByText(/Members/)).toBeVisible();
    await expect(room.getByText(/\(owner\)/)).toBeVisible();
    await expect(room.getByText(/\(approver\)/)).toBeVisible();
    await room.locator('button', { hasText: /agent/ }).first().click();
    const brf = page.locator('section[aria-labelledby="brf-h"]');
    await expect(brf.getByText(/composed by/)).toBeVisible();
    await expect(brf.getByText(/agent-produced/)).toBeVisible();
    await expect(brf.getByText(/◍ REPLAYED/).first()).toBeVisible();
    await expect(brf.getByText(/● live/).first()).toBeVisible();
    await expect(brf.getByText(/Which window is closing/)).toBeVisible();
    await expect(brf.getByText(/next review of/)).toBeVisible();
    await shot(page, '15-briefings');
  });
});
