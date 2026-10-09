/**
 * CP-6 B33 §CI — COMPETITOR INTELLIGENCE (F-P4-15 ch.29; JRN-10) — exercised in a browser against the seeded DEMONSTRATION after the B33 act
 * ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: it reads what the act left for the scene
 * "a competitor gear-motor maker opens a Moroccan plant; the competitor profile updates and an alert reaches the strategy lead" —
 *   Atlas Getriebemotoren AG (SYNTHETIC) bound to its graph organization; profile v1 (approved by A. Hoffmann); the Domain Intelligence
 *   Agent's proposal from the press release and the trade report (both cited, two independent publishers); A. Hoffmann's approval → the
 *   new profile version effective 2026-10-01 with the Tangier plant (a DATE as the day it names); the `domain.alert` routed under the
 *   published policy to strategy_owner, its named owner the strategy lead (EYE_B33_STRATEGY_LEAD, default j.weber); the replay.
 * So this file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts). Written; NOT run by the part (the
 * integrator stages the act and runs the walk). Screenshots go to EYE_SHOTS (b33-competitor-*.png). Every figure is SYNTHETIC; the fictional
 * competitor never appears in a real feed (GDELT is discovery only) — a real-provider acceptance needs licensed registries and newswires.
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
const ANALYST = process.env['EYE_B33_ANALYST'] ?? 'a.hoffmann';
const LEAD = process.env['EYE_B33_STRATEGY_LEAD'] ?? 'j.weber';
const COMPETITOR = process.env['EYE_B33_COMPETITOR'] ?? 'Atlas Getriebemotoren AG (SYNTHETIC)';
const PLANT_DAY = process.env['EYE_B33_PLANT_DAY'] ?? '2026-10-01';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openCompetitor(page: Page): Promise<void> {
  await page.goto('/prediction/domains/competitors');
  await expect(page.getByRole('heading', { name: 'Competitor intelligence', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: COMPETITOR }).click();
  await expect(page.getByRole('heading', { name: COMPETITOR, level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B33 §CI — the Moroccan plant scene on the demonstration', () => {
  test('RESOLVE + UPDATE: the competitor on its graph organization; the profile updated with the Tangier plant, effective on the day it names; shown CURRENT', async ({ page }) => {
    await uiLogin(page, ANALYST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCompetitor(page);
    const profile = page.getByRole('region', { name: COMPETITOR });
    await expect(profile.getByRole('status')).toContainText('CURRENT');
    await expect(profile).toContainText(/graph organization/);
    await expect(profile.getByRole('list', { name: 'Facts' })).toContainText(/facility:tangier/);
    await expect(profile.getByRole('list', { name: 'Events' })).toContainText(new RegExp(`plant_opened · effective ${esc(PLANT_DAY)}`));
    await expect(profile.getByRole('list', { name: 'Profile versions' })).toContainText(new RegExp(`effective from ${esc(PLANT_DAY)} · APPROVED · by approval`));
    await shot(page, 'b33-competitor-01-profile');
  });

  test('COLLECT + ASSESS: the agent\'s proposal APPROVED by the named analyst — both sources cited (two independent publishers), its identity resolved through the graph', async ({ page }) => {
    await uiLogin(page, ANALYST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCompetitor(page);
    const proposals = page.getByRole('region', { name: 'Collect and assess: proposals' });
    const agent = proposals.getByRole('article').filter({ hasText: 'proposed by the Domain Intelligence Agent' }).filter({ hasText: 'plant_opened' }).first();
    await expect(agent).toContainText('APPROVED');
    await expect(agent).toContainText(/MATERIAL/);
    await expect(agent).toContainText(/2 independent publisher\(s\)/);
    await expect(agent).toContainText(/^.*RESOLVED — \d+ resolved through the graph, 0 mistaken, 0 unresolved/);
    await shot(page, 'b33-competitor-02-proposal');
  });

  test('ALERT: the routed domain.alert on the competitor, under the published policy to the strategy owner; the strategy lead sees it on the attention queue', async ({ page }) => {
    await uiLogin(page, ANALYST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCompetitor(page);
    const alerts = page.getByRole('region', { name: 'Alerts and revalidations' });
    await expect(alerts.getByRole('list', { name: 'Routed items' })).toContainText(new RegExp(`${esc(COMPETITOR)}: .* — profile v\\d+ · routed to strategy_owner under policy v\\d+`));
    await shot(page, 'b33-competitor-03-alert');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await uiLogin(page, LEAD, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/attention');
    await expect(page.getByText(new RegExp(`${esc(COMPETITOR)}: .*Tangier`)).first()).toBeVisible();
    await shot(page, 'b33-competitor-04-attention');
  });

  test('REPLAY: on the day before the plant, the profile held no Tangier plant; the response is linked to the decision layer, never decided here', async ({ page }) => {
    await uiLogin(page, ANALYST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCompetitor(page);
    await page.getByLabel('Held on (day)').fill('2026-09-30');
    await page.getByRole('button', { name: 'Replay' }).click();
    const result = page.getByRole('region', { name: 'Replay result' });
    await expect(result).toContainText('Held');
    await expect(result).not.toContainText(`plant_opened ${PLANT_DAY}`);
    await expect(page.getByRole('link', { name: 'decision layer' })).toHaveAttribute('href', '/decisions');
    await shot(page, 'b33-competitor-05-replay');
  });

  test('a refusal is shown in the server\'s words: the strategy lead\'s attempt to approve a proposal (not the analyst)', async ({ page }) => {
    await uiLogin(page, LEAD, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCompetitor(page);
    const open = page.getByRole('region', { name: 'Collect and assess: proposals' }).getByRole('button', { name: 'Approve the assessment' });
    test.skip((await open.count()) === 0, 'no open proposal is left on the demonstration (the act decided them all)');
    await open.first().click();
    await expect(page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: /no qualifying role binding|human gate/ }).first()).toBeVisible();
  });
});
