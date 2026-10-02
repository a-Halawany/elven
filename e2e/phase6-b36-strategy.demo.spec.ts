/**
 * CP-6 B36 part `strategy` — the strategic health page completed and the strategy alignment page completed, exercised in a browser
 * against the seeded DEMONSTRATION after the B36 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case:
 * what it reads is what the act left — on /decisions/health the on-time measure's OWNER and the edit that restated its reading inside the
 * window before a favourable change (the owner-edit flag on the change), the exception approved for the customs component (in force), the
 * executive's acceptance of the snapshot with its Ed25519 signature, the active context named; on /graph/strategy/alignment the
 * dual-sourcing allocation REVOKED (the gap view's initiative_unresourced at once) and the stale-measure detection the SCHEDULE raised
 * and routed (the "Detections raised by the schedule" list — nobody read the page to make it). This file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * The personas: EYE_DEMO_EXECUTIVE (the executive who accepted the snapshot and approved the exception) and EYE_DEMO_STRATEGY_LEAD (the
 * planning lead who reads the alignment page) — the act's own; both default to the B32/B34 walks' administrator. What is asserted is what
 * the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b36-strategy-*.png).
 *
 * NARROWED on the demonstration (the B36 walk run): the input contract the page reads is the ACTIVE definition's (version 2, approved after
 * J. Weber's restatement of the on-time reading under version 1); its on_time_delivery input carries no edit ("never restated", the value
 * re-read from the graph) while version 1's input carries the edit (1 edit, 91 → 97, the owner's statement). The walk asserts the owner on
 * the contract and accepts either edit line; the OWNER-EDIT FLAG is asserted where the record carries it — on the changes of the snapshot
 * the restatement preceded. Whether a new definition version should carry the owner's restatement forward is reported, not decided here.
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
const EXECUTIVE = process.env['EYE_DEMO_EXECUTIVE'] ?? 'm.dvorak';
const LEAD = process.env['EYE_DEMO_STRATEGY_LEAD'] ?? 'm.dvorak';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('CP-6 B36 strategy — the score and the Strategy Graph completed on the demonstration', () => {
  test('STRATEGIC HEALTH: the owner and the flagged edit, the exception in force, the signed acceptance, the active context', async ({ page }) => {
    await uiLogin(page, EXECUTIVE, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/health');
    await expect(page.getByRole('heading', { name: 'Strategic health', level: 1 })).toBeVisible();
    // the active context named on the page (none set reads as the stated default)
    await expect(page.getByLabel('the active context')).toBeVisible();
    await expect(page.getByLabel('the active context')).toContainText(/horizon/);
    // the input contract: each component's owner and last edit — the on-time measure restated by its owner
    await expect(page.getByRole('heading', { name: 'The input contract — owners and edit history' })).toBeVisible();
    const contract = page.getByRole('region', { name: 'the health input contract' });
    await expect(contract.getByText(/owner [0-9a-f]{8}…/).first()).toBeVisible({ timeout: 20_000 });
    // the on-time measure's owner named; its edit line is version 1's (see the header): the active definition's input reads "never restated"
    const onTime = contract.getByRole('row').filter({ hasText: /^on_time_delivery/ }).first();
    await expect(onTime).toContainText(/owner [0-9a-f]{8}… \(the owner of MSR "On-time delivery rate"\) · (\d+ edit\(s\), last|never restated)/);
    // the exception for the customs component, approved and in force
    await expect(page.getByRole('heading', { name: 'Exceptions — recorded objects' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'health exceptions' }).getByText(/APPROVED — in force/).first()).toBeVisible();
    // the executive's acceptance of the current snapshot, signed — the key and the digest it binds are on the page
    await expect(page.getByRole('heading', { name: "The executive's acceptance of this snapshot" })).toBeVisible();
    await expect(page.getByLabel('approvals and signatures')).toContainText(/accepted by/);
    await expect(page.getByLabel('approvals and signatures')).toContainText(/signed Ed25519 with key ed25519:/);
    await shot(page, 'b36-strategy-01-health');
    // the change the restatement preceded carries the OWNER-EDIT FLAG (shown; it gates nothing): it was raised by the score A. Hoffmann computed
    // under definition version 1 right after the restatement — that snapshot is decomposed (the newest v1 row; the page opened the newest snapshot, version 2's — the accepted one, asserted above)
    const snaps = page.getByRole('region', { name: 'health score snapshots' });
    await snaps.getByRole('row').filter({ hasText: /v1 · / }).first().getByRole('button', { name: 'decompose' }).click();
    await expect(page.getByRole('heading', { name: 'Score changes raised by this snapshot' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/OWNER-EDIT FLAG/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/owner edit: .* restated .* inside the .*-day window/).first()).toBeVisible();
    await shot(page, 'b36-strategy-01b-owner-edit-flag');
  });

  test('ALIGNMENT: the revoked allocation seen at once in the gap view; the stale-measure detection the schedule raised and routed', async ({ page }) => {
    await uiLogin(page, LEAD, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/graph/strategy/alignment');
    await expect(page.getByRole('heading', { name: 'Strategy alignment', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gap matrix' })).toBeVisible();
    // the dual-sourcing allocation REVOKED: the act's standing says so, and the gap view's row reads initiative unresourced at once
    await expect(page.getByRole('heading', { name: 'Authority acts and their revocation' })).toBeVisible();
    await expect(page.getByText(/✕ REVOKED at/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/no allocation approved by a human authority resources an initiative/).first()).toBeVisible();
    // the detections the SCHEDULE raised and routed — beside the as-of read, and without anyone reading the page to make them
    await expect(page.getByRole('heading', { name: 'Detections raised by the schedule' })).toBeVisible();
    const raised = page.getByRole('list', { name: 'detections raised by the schedule' });
    await expect(raised.getByText(/stale measure/).first()).toBeVisible({ timeout: 20_000 });
    await expect(raised.getByText(/routed open to/).first()).toBeVisible();
    await expect(raised.getByText(/item [0-9a-f]{8}…/).first()).toBeVisible();
    await shot(page, 'b36-strategy-02-alignment');
  });
});
