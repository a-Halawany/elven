/**
 * CP-6 B36 §D — THE PUBLISHING AND DISTRIBUTION CENTER (F-P6-13) in a browser against the seeded DEMONSTRATION after the B36 act ran
 * (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the board pack
 * drafted by the executive operator, approved by digest and signed by M. Dvořák, delivered to three board members (SYNTHETIC personas;
 * in-app + the email sink) with receipts; the correction to the corridor figure versioning it and notifying the three; the external draft
 * to the partner firm reviewed before its approval; the archive with the export controls — so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b36-publishing-*.png). The board pack's title is the act's (EYE_B36_PUBLICATION_TITLE; default "Board pack").
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
const TITLE = process.env['EYE_B36_PUBLICATION_TITLE'] ?? 'Board pack';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('CP-6 B36 — the publishing and distribution center on the demonstration', () => {
  test('PUBLICATIONS: the executive reads the board pack — the exact bytes by digest, the signed approval, the receipts beside the acknowledgements', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/publications');
    await expect(page.getByRole('heading', { name: 'Publications', level: 1 })).toBeVisible();
    await expect(page.getByText(/SYNTHETIC: delivered to a local sink/).first()).toBeVisible();
    await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
    await expect(page.getByRole('heading', { name: new RegExp(TITLE), level: 2 })).toBeVisible({ timeout: 20_000 });
    // the versions table: the exact bytes (sha256), the approval by digest with its PUB version, the signature's key id
    await expect(page.getByRole('heading', { name: 'Versions — the exact bytes', level: 3 })).toBeVisible();
    await expect(page.getByText(/digest confirmed/).first()).toBeVisible();
    await expect(page.getByText(/ed25519:/).first()).toBeVisible();
    // the deliveries: the in-app placement and the email sink's receipt, SYNTHETIC said, beside the acknowledgement column
    await expect(page.getByRole('heading', { name: 'Deliveries — receipts and acknowledgements', level: 3 })).toBeVisible();
    await expect(page.getByText(/email \(SYNTHETIC sink\): the publication — ● placed/).first()).toBeVisible();
    await expect(page.getByText(/in_app: the publication — ● placed/).first()).toBeVisible();
    await expect(page.getByText(/a receipt is the channel's machine proof of placement/i).first()).toBeVisible();
    await shot(page, 'b36-publishing-01-board-pack');
  });

  test('CORRECTION: the prior version reads corrected, the correction notices stand beside the deliveries', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/publications');
    await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
    await expect(page.getByText(/CORRECTED — corrected by version 2/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/a CORRECTION notice/).first()).toBeVisible();
    await shot(page, 'b36-publishing-02-correction');
  });

  test('EXTERNAL DRAFT: the partner letter reviewed before its approval (TC-12), the external delivery SYNTHETIC', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/publications');
    await page.getByRole('button', { name: /Partner/ }).first().click();
    await expect(page.getByRole('heading', { name: 'External communication review (TC-12)', level: 3 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/partner: .* — APPROVED by/).first()).toBeVisible();
    await expect(page.getByText(/EXTERNAL partner: .* \(SYNTHETIC delivery\)/).first()).toBeVisible();
    await shot(page, 'b36-publishing-03-external');
  });

  test('ARCHIVE: the withdrawn or delivered publication archived under the source\'s controls — the controls and holds on the record', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/publications');
    await expect(page.getByText(/▣ ARCHIVED — versions, receipts and signatures carried/).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'b36-publishing-04-archive');
  });

  test('THE BOARD MEMBER: a recipient reads its own deliveries and acknowledges (receipt, not agreement)', async ({ page }) => {
    const login = process.env['EYE_B36_BOARD_LOGIN'];
    test.skip(login === undefined || login === '', 'EYE_B36_BOARD_LOGIN names the act\'s board-member persona');
    await uiLogin(page, login as string, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/publications');
    await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
    await expect(page.getByRole('heading', { name: 'Deliveries — receipts and acknowledgements', level: 3 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/acknowledged/).first()).toBeVisible();
    await shot(page, 'b36-publishing-05-board-member');
  });
});
