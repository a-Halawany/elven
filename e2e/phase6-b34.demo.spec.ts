/**
 * CP-6 B34 — the human tasks, the collaboration workspaces, the commitment tracker, the gated decision and the attention queue's act,
 * exercised in a browser against the seeded DEMONSTRATION after scripts/phase6/act-b34.mjs ran (the rehearsal copy first, then eye_demo).
 * A DEMO WALK, not a hosted gate case: what it reads is what the act left (the customs expert's review escalated to M. Dvořák and completed,
 * the dual-sourcing workspace with its external invitation, the mitigation case committed after its held commitment and the deferral, the
 * tracker with the purchase-request handoff and the customs deliverable, the breach item acted on), so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b34-*.png).
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

test.describe.serial('CP-6 B34 — tasks, workspaces, commitments, the gate and the act on the demonstration', () => {
  test('TASKS: the chief of staff\'s inbox — the customs expert\'s review, escalated and completed', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
    // the review is COMPLETED (M. Dvořák reviewed it after the escalation): the inbox shows it with its closed tasks
    await page.getByLabel('include closed tasks').check();
    await expect(page.getByText(/customs brief/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/escalat/i).first()).toBeVisible();
    await shot(page, 'b34-01-tasks');
  });

  test('WORKSPACES: the dual-sourcing review — the partner firm\'s expert invited (external, 14 days)', async ({ page }) => {
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/workspaces');
    await expect(page.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
    await expect(page.getByText(/Dual-sourcing review/).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'b34-02-workspaces');
    // B34-F1 (0091): the grants — the invitation provisioned through the identity authority (invited) and the 0090-era grant revoked
    await page.getByRole('button', { name: /Dual-sourcing review/ }).first().click();
    await expect(page.getByText(/R\. Haddad/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/invited/).first()).toBeVisible();
    await expect(page.getByText(/revoked/).first()).toBeVisible();
    await shot(page, 'b34-05-grants');
  });

  test('COMMITMENTS: the tracker — the purchase-request handoff and the customs deliverable', async ({ page }) => {
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/commitments');
    await expect(page.getByRole('heading', { name: 'Commitments', level: 1 })).toBeVisible();
    await expect(page.getByText(/Purchase request: second bearing source/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Customs pre-clearance filed/).first()).toBeVisible();
    await shot(page, 'b34-03-commitments');
  });

  test('EXECUTION (B34-F2): the purchase request through the synthetic ERP — the receipt, the partial effect, the residual reissued, reconciled', async ({ page }) => {
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/commitments');
    await expect(page.getByRole('heading', { name: 'Commitments', level: 1 })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: /Purchase request: second bearing source/ }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: /^open commitment / }).click();
    // what the record says of each attempt: the refused one (production egress) and the ones the synthetic loopback path carried
    const attempts = page.getByRole('list', { name: 'attempts' });
    await expect(attempts.getByText(/via the SYNTHETIC loopback path/).first()).toBeVisible({ timeout: 20_000 });
    // the refused attempts were recorded before 0091 (no path recorded): their outcome is the transport refusal
    await expect(attempts.getByText(/^attempt \d+.*: transport/).first()).toBeVisible();
    await expect(page.getByText(/reconciled/i).first()).toBeVisible();
    await expect(page.getByText(/by undefined/)).toHaveCount(0); // every residual names its compensation owner
    await shot(page, 'b34-04-execution');
  });
});
