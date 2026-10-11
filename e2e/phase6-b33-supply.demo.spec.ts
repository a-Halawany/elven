/**
 * CP-6 B33 §SC — the supply network workspace (/twins/supply), exercised in a browser against the seeded DEMONSTRATION after the B33 act ran
 * (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case — it reads what the act left (scene F-P4-14, verbatim: "a
 * tier-2 bearing supplier in Shenzhen is inferred behind a tier-1 vendor; the analyst validates it and the corridor disruption is mapped to the
 * Regensburg line with two alternatives"):
 *   · the supply network "Hub-module supply network — NORDWERK Regensburg (3 tiers)" carrying Nordbearing AB (tier 1, SE) and — after the act —
 *     the Shenzhen bearing-blank maker as a VALIDATED tier-2 site (A. Hoffmann validated, T. Nakamura applied);
 *   · the disruption opened by C. Brenner (EYE_B33_DISRUPTION_TITLE) mapped to line SYN-LINE-A1 through E. Kovács' link;
 *   · two FEASIBLE options (the Cape reroute, the dual source) and one INFEASIBLE (the safety-stock draw-down) on their alt-<key> branches.
 * This file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts). What is asserted is what the record says on
 * screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b33-supply-*.png). Every figure is SYNTHETIC.
 * Personas: the analyst A. Hoffmann (EYE_B33_ANALYST, default `a.hoffmann`), the twin owner T. Nakamura (EYE_B33_OWNER, default `t.nakamura`),
 * the supply risk owner C. Brenner (EYE_B33_RISK_OWNER, default `c.brenner`).
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
const OWNER = process.env['EYE_B33_OWNER'] ?? 't.nakamura';
const RISK = process.env['EYE_B33_RISK_OWNER'] ?? 'c.brenner';
const NETWORK = process.env['EYE_B33_NETWORK_TITLE'] ?? 'Hub-module supply network — NORDWERK Regensburg (3 tiers)';
const DISRUPTION = process.env['EYE_B33_DISRUPTION_TITLE'] ?? 'Red Sea corridor disruption (Bab el-Mandeb)';
const LINE = process.env['EYE_B33_LINE'] ?? 'SYN-LINE-A1';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openWorkspace(page: Page): Promise<void> {
  await page.goto('/twins');
  await page.getByRole('link', { name: /Supply network/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Supply network', level: 1 })).toBeVisible();
  // the select is named by its <label for> (select by role); its option carries the network's title
  const pick = page.getByRole('combobox', { name: 'Supply network' });
  const value = await pick.locator('option', { hasText: NETWORK }).first().getAttribute('value');
  await pick.selectOption(value ?? '');
  await expect(page.getByLabel('network version')).toBeVisible();
}

test.describe.serial('CP-6 B33 §SC — the supply network workspace on the demonstration (scene F-P4-14)', () => {
  test('THE NETWORK: Nordbearing AB at tier 1 and the Shenzhen maker VALIDATED at tier 2 — the coverage and the unknowns stated, never imputed', async ({ page }) => {
    await uiLogin(page, ANALYST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openWorkspace(page);
    await expect(page.getByLabel('coverage')).toContainText(/supplier sites: \d+ declared \(.*\), 1 validated, 0 inferred/);
    await expect(page.getByLabel('coverage')).not.toContainText('UNSOURCED: nordbearing');
    const sites = page.getByRole('table', { name: 'sites' });
    await expect(sites).toContainText('Nordbearing AB');
    await expect(sites).toContainText(/Shenzhen precision bearing maker \(SYNTHETIC\) \(shenzhen-[a-z-]+, tier 2\) — Shenzhen, CN/);
    await expect(page.getByLabel(/^provenance of shenzhen-/)).toContainText('validated by a named analyst');
    await expect(page.getByRole('list', { name: 'tiers' })).toContainText(/tier 2: \d+ sites \(\d+ declared, 1 validated, 0 inferred\)/);
    await shot(page, 'b33-supply-01-network');
  });

  test('THE INFERENCE: proposed by the Supply Chain Agent, VALIDATED by A. Hoffmann (reason, digest, expiry), APPLIED by T. Nakamura — the ledger in order', async ({ page }) => {
    await uiLogin(page, ANALYST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openWorkspace(page);
    const list = page.getByRole('table', { name: 'inferences' });
    await list.getByRole('button', { name: /Shenzhen precision bearing maker/ }).first().click();
    await expect(page.getByLabel('inference state')).toContainText('APPLIED to the network');
    const ledger = page.getByRole('list', { name: 'inference ledger' });
    await expect(ledger).toContainText('drafted by the agent');
    await expect(ledger).toContainText(/validated until .* — “/);
    await expect(ledger).toContainText(/applied in version \d+/);
    await expect(list).toContainText(/SENSITIVE \(a named counterparty\)/);   // the inferences table's line names the sensitivity (the detail panel asks for the reason)
    await shot(page, 'b33-supply-02-inference');
  });

  test('THE MAP: the corridor disruption reaches line SYN-LINE-A1 — its run rate, its cover, the routes derated (Ningbo and Shenzhen); the replay identical', async ({ page }) => {
    await uiLogin(page, RISK, required('EYE_TEST_ADMIN_PASSWORD'));
    await openWorkspace(page);
    await page.getByRole('list', { name: 'disruptions' }).getByRole('button', { name: new RegExp(DISRUPTION) }).first().click();
    await expect(page.getByRole('heading', { name: new RegExp(DISRUPTION), level: 2 })).toBeVisible();
    await expect(page.getByLabel('disruption state')).toContainText('MAPPED');
    await expect(page.getByLabel('map freshness')).toContainText('the inputs are current by their freshness policies');
    await expect(page.getByLabel('line impact').first()).toContainText(new RegExp(`${LINE} .* runs at [\\d.]+ of [\\d.]+ per day — [\\d.]+ day\\(s\\) of cover`));
    const routes = page.getByRole('list', { name: new RegExp(`^affected routes of ${NETWORK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });   // the title carries "(3 tiers)": escaped
    await expect(routes).toContainText(/via bab-el-mandeb/);
    await expect(routes).toContainText(/shenzhen-/);
    await page.getByRole('button', { name: 'Replay the map on its pinned versions' }).click();
    await expect(page.getByRole('status').filter({ hasText: /replayed: identical/ })).toBeVisible();
    await shot(page, 'b33-supply-03-map');
  });

  test('THE ALTERNATIVES: two FEASIBLE (the Cape reroute, the dual source) and the safety-stock draw-down INFEASIBLE — with coverage limits; the decision is the decision layer\'s', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openWorkspace(page);
    await page.getByRole('list', { name: 'disruptions' }).getByRole('button', { name: new RegExp(DISRUPTION) }).first().click();
    const alts = page.getByRole('table', { name: 'alternatives' });
    await expect(alts.getByLabel(/^verdict of /).filter({ hasText: /^✓ FEASIBLE$/ })).toHaveCount(2);
    await expect(alts.getByLabel(/^verdict of /).filter({ hasText: 'INFEASIBLE — constrained, never recommended' })).toHaveCount(1);
    await expect(alts).toContainText(/routing on alt-[a-z0-9-]+ v\d+ · restores [\d.]+ % of the run rate · effect after 11 day\(s\)/);
    await expect(alts).toContainText(/the stock covers [\d.]+ day\(s\) of a \d+-day disruption: the line stops before it ends/);
    await expect(page.getByRole('link', { name: 'decision packages' })).toBeVisible();
    await shot(page, 'b33-supply-04-alternatives');
  });
});
