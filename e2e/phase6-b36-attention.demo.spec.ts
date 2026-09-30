/**
 * CP-6 B36 — the attention completion (F-P6-07) exercised in a browser against the seeded DEMONSTRATION after the B36 attention scene ran
 * (act-b24 and act-b34 first, then the B36 scene: the corridor item's act resumed after a SYNTHETIC settle fault, L. Brandt's accepted
 * priority signed, the Regensburg objective on her context, a fairness hold RAISED by a synthetic skew and left for the executive to
 * release here, a forum convened by the chief of staff — a new SYNTHETIC persona). A DEMO WALK, not a hosted gate case: what it reads is
 * what the scene left; the one act it performs is the executive's release of the hold. This file runs through playwright.demo.config.ts
 * only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b36-attention-*.png). The personas: l.brandt (the corridor item's owner), m.dvorak (the executive),
 * EYE_B36_OPERATOR_LOGIN (the chief of staff, SYNTHETIC; default chief.of.staff — a.novak is the planning lead).
 */
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Playwright's expect.configure returns a NEW instance: rebind it (the B21 rule).
const expect = baseExpect.configure({ timeout: 20_000 });

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const OPERATOR = process.env['EYE_B36_OPERATOR_LOGIN'] ?? 'chief.of.staff';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
/** The corridor item opened from the queue (its row's title button). */
async function openCorridorItem(page: Page): Promise<void> {
  await page.goto('/decisions/attention');
  await expect(page.getByRole('heading', { name: 'Attention', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Queue \(\d+ in the domain\)$/ })).toBeVisible();
  await page.getByRole('button', { name: /corridor/i }).first().click();
}

test.describe.serial('CP-6 B36 — the attention completion on the demonstration', () => {
  test('THE CONTEXT STRIP: L. Brandt\'s queue names the Regensburg objective, the horizon and the policy in force; what the context filtered is counted', async ({ page }) => {
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention');
    await expect(page.getByRole('heading', { name: 'The queue\'s context' })).toBeVisible();
    const context = page.getByTestId('context-line');
    await expect(context).toContainText(/objective [0-9a-f]{8}…/);
    await expect(context).toContainText(/horizon (30d|90d|12m|36m)/);
    await expect(context).toContainText(/your executive context/);
    await expect(page.getByTestId('policy-line')).toContainText(/policy version \d+ .* — fairness floor [0-9.]+, staleness ceiling \d+ h/);
    await expect(page.getByTestId('filtered-line')).toContainText(/\d+ item\(s\) served; (none filtered by the context|\d+ filtered by the context)/);
    await shot(page, 'b36-attention-01-context-strip');
  });

  test('THE ACT PANEL: the corridor item\'s act — acted, RESUMED after the synthetic settle fault, its digest and consequence preview beside the accepted priority', async ({ page }) => {
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await openCorridorItem(page);
    await expect(page.getByRole('heading', { name: 'Act on this item' })).toBeVisible();
    // the act's history: acted through the resume (the scene armed the SYNTHETIC settle fault, then the chief of staff resumed it)
    await expect(page.getByRole('table', { name: 'acts of this item' }).getByText(/acted → WRN:.*\(resumed\)/).first()).toBeVisible();
    await expect(page.getByTestId('resumption-row').first()).toContainText(/not re-executed/);
    // accept-priority: accepted by L. Brandt, the digest of the evaluation, the consequence preview, the SIGNATURE verified against the bound key
    await expect(page.getByRole('heading', { name: 'Accept the priority' })).toBeVisible();
    const acceptance = page.getByTestId('acceptance');
    await expect(acceptance).toContainText(/Accepted by [0-9a-f]{8}… at .* — evaluation digest [0-9a-f]{16}…/);
    await expect(acceptance.getByRole('list', { name: 'the consequence accepted' })).toContainText(/Response window: due/);
    await expect(acceptance.getByRole('list', { name: 'the consequence accepted' })).toContainText(/Escalation:/);
    await expect(page.getByTestId('acceptance-signature').first()).toContainText(/Ed25519 key ed25519:[0-9a-f]{16}/);
    await expect(page.getByTestId('acceptance-signature').first()).toContainText(/verified against the bound key/);
    await shot(page, 'b36-attention-02-act-and-acceptance');
  });

  test('THE HOLD BANNER AND THE RELEASE: the fairness hold the scene raised is on the queue; M. Dvořák releases it with a reason', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention');
    const banner = page.getByTestId('hold-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/The queue is HELD since .*: the ranking fairness [0-9.]+ fell below the floor [0-9.]+\. Its items are served read-only/);
    await shot(page, 'b36-attention-03-hold-banner');
    // the release: the reason, the governed button, the server's answer
    await banner.getByLabel('Release reason').fill('the skew was the rehearsal\'s synthetic fixture; the ranking reviewed (B36 walk)');
    await banner.getByRole('button', { name: 'Release the hold' }).click();
    await expect(page.getByRole('status').filter({ hasText: /^released:/ })).toBeVisible();
    await expect(page.getByTestId('hold-banner')).toHaveCount(0);
    await shot(page, 'b36-attention-04-hold-released');
  });

  test('THE RECOVERY ROUTES PAGE: the five degraded states with their meaning, route and last outcome; the hold\'s release recorded; the synthetic fixture', async ({ page }) => {
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention/recovery');
    await expect(page.getByRole('heading', { name: 'Attention recovery', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Degraded states — \d of 5 active/ })).toBeVisible();
    for (const s of ['delivery_sink_down', 'tick_stalled', 'policy_invalid', 'evaluation_stale', 'hold']) {
      const row = page.getByTestId(`state-${s}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(/DEGRADED|nominal/);
    }
    await expect(page.getByTestId('state-hold')).toContainText(/recovered — the state is nominal after the route/);
    await expect(page.getByTestId('route-run').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Synthetic fixture: a settle fault' })).toBeVisible();
    await shot(page, 'b36-attention-05-recovery');
  });

  test('THE FORUM: the chief of staff\'s forum reads the same items — the corridor item with L. Brandt\'s acceptance', async ({ page }) => {
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention');
    const forums = page.locator('section[aria-labelledby="forums-h"]');
    await expect(forums.getByRole('heading', { name: 'Forums' })).toBeVisible();
    await expect(page.getByTestId('forum-row').first()).toBeVisible();
    await page.getByTestId('forum-row').first().getByRole('button', { name: 'read' }).click();
    const q = page.getByTestId('forum-queue');
    await expect(q.getByRole('heading', { name: 'The forum\'s queue' })).toBeVisible();
    await expect(q.getByText(/under the forum's context/)).toBeVisible();
    const corridor = q.getByTestId('forum-item').filter({ hasText: /corridor/i }).first();
    await expect(corridor).toBeVisible();
    await expect(corridor).toContainText(/by [0-9a-f]{8}… at/);
    await shot(page, 'b36-attention-06-forum');
  });

  test('THE B24 PANELS on the demonstration\'s data: the queue evaluation with the governance answer\'s place, suppression approval, delegation, the markers, the deprioritized view', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention');
    const ev = page.locator('section[aria-labelledby="evaluation-h"]');
    await expect(ev.getByRole('heading', { name: 'Queue evaluation' })).toBeVisible();
    await expect(ev.getByRole('table', { name: 'queue evaluations' }).getByRole('row')).not.toHaveCount(1);
    const gov = page.locator('section[aria-labelledby="governance-h"]');
    await expect(gov.getByRole('heading', { name: 'Suppression requests' })).toBeVisible();
    await expect(gov.getByRole('heading', { name: 'Delegations' })).toBeVisible();
    await expect(page.locator('section[aria-labelledby="markers-h"]').getByRole('heading', { name: 'Source-impact markers' })).toBeVisible();
    const dep = page.locator('section[aria-labelledby="deprioritized-h"]');
    await expect(dep.getByRole('heading', { name: 'Deprioritized — and why' })).toBeVisible();
    await expect(dep.getByRole('heading', { name: /^Why elevated — the latest elevations \(\d+\)$/ })).toBeVisible();
    await shot(page, 'b36-attention-07-b24-panels');
  });
});
