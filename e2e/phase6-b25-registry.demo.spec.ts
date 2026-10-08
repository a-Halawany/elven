/**
 * CP-6 B25 §MR — the forecasting portfolio (F-P4-01): the governed registry, the horizon policy, the plan by horizon and the routed issue,
 * exercised in a browser against the seeded DEMONSTRATION after the B25 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a
 * hosted gate case: what it reads is what the act left — N. Eriksen's corridor target "Bab el-Mandeb transit delay" (EYE_B25_TARGET_KEY),
 * its 30d EVENT forecast and its 5y REGIME forecast in scenario language (different methods per horizon), the active horizon policy concurred
 * by H. Petrović, the refused 3y QUANTITY horizon on the corridor's real transit series (EYE_B25_REFUSED_SERIES — the tracker's "Regensburg
 * line demand series" does not exist) naming the missing validation, and the EMPIRICAL rolling-origin validations at 3y and 5y on the real
 * ECB history (EYE_B25_ECB_SERIES) with the 5y outcome the act recorded (EYE_B25_ECB_5Y) — so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b25-registry-*.png).
 * Personas: the forecast owner N. Eriksen (EYE_B25_FORECASTER, default `n.eriksen`), the analyst A. Hoffmann (EYE_B25_ANALYST, default `a.hoffmann`).
 * Every figure is SYNTHETIC; no claim of empirical validation is made on screen unless the act validated on real history.
 *
 * B25 completion (the act's B25-F3b): regime_judgement@2 (EYE_B25_CONDITIONED_METHOD) — conditions on the frozen twin and graph features,
 * the declared options — approved beside @1, which the plan now lists SUPERSEDED; the Suez Canal target (EYE_B25_SUEZ_TARGET) and its 5y
 * route ISSUED by @2.
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
const FORECASTER = process.env['EYE_B25_FORECASTER'] ?? 'n.eriksen';
const ANALYST = process.env['EYE_B25_ANALYST'] ?? 'a.hoffmann';
const TARGET = process.env['EYE_B25_TARGET_KEY'] ?? 'corridor.bab-el-mandeb.transit-delay';
const EVENT_METHOD = process.env['EYE_B25_EVENT_METHOD'] ?? 'event_rate@1';
const REGIME_METHOD = process.env['EYE_B25_REGIME_METHOD'] ?? 'regime_judgement@1';
const REFUSED_SERIES = process.env['EYE_B25_REFUSED_SERIES'] ?? 'portwatch:chokepoint4:n_total';
const ECB_SERIES = process.env['EYE_B25_ECB_SERIES'] ?? 'ecb-eurusd-history';
/** The act's outcome of the 5y quantity forecast on the real ECB history: validated_retrospective (issued) or refused (the validation did not pass). */
const ECB_5Y = process.env['EYE_B25_ECB_5Y'] ?? '';
const CONDITIONED_METHOD = process.env['EYE_B25_CONDITIONED_METHOD'] ?? '';
const SUEZ_TARGET = process.env['EYE_B25_SUEZ_TARGET'] ?? '';
const ENSEMBLE_SERIES = process.env['EYE_B25_SERIES'] ?? 'portwatch:chokepoint4:n_total';
const REISSUED_RUN = process.env['EYE_B25_REISSUED_RUN'] ?? '';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openPortfolio(page: Page): Promise<void> {
  await page.goto('/prediction');
  await page.getByRole('link', { name: /Forecasting portfolio/ }).click();
  await expect(page.getByRole('heading', { name: 'Forecasting portfolio', level: 1 })).toBeVisible();
}
async function plan(page: Page, horizon: string): Promise<void> {
  await page.getByLabel('Target', { exact: true }).fill(TARGET);
  await page.getByRole('combobox', { name: /Horizon/ }).selectOption(horizon);
  await page.getByRole('button', { name: 'Plan' }).click();
  await expect(page.getByLabel('the plan')).toBeVisible();
}

test.describe.serial('CP-6 B25 §MR — the forecasting portfolio on the demonstration', () => {
  test('THE REGISTRY: the legacy methods are approved builtins beside the act\'s governed entries; the horizon policy names a language and a validation bar per horizon', async ({ page }) => {
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPortfolio(page);
    const registry = page.getByRole('table', { name: 'registry' });
    await expect(registry).toContainText('seasonal_naive@1 (builtin)');
    await expect(registry).toContainText('holt_winters@1 (builtin)');
    await expect(registry.getByRole('row', { name: new RegExp(EVENT_METHOD) })).toContainText('approved');
    await expect(registry.getByRole('row', { name: new RegExp(REGIME_METHOD) })).toContainText('approved');
    if (CONDITIONED_METHOD !== '') await expect(registry.getByRole('row', { name: new RegExp(CONDITIONED_METHOD) })).toContainText('approved');   // B25 completion
    const policy = page.getByRole('table', { name: 'horizon policy' });
    await expect(policy.getByRole('row', { name: /^5y/ })).toContainText('scenario_language');
    await expect(policy.getByRole('row', { name: /^3y/ })).toContainText(/requires quantity_rolling_origin ≥ \d+ origins/);
    await shot(page, 'b25-registry-01-registry-policy');
  });

  test('THE PLAN BY HORIZON: the corridor target is an EVENT at 30d (a probability) and a REGIME at 5y (scenario language) — different methods', async ({ page }) => {
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPortfolio(page);
    await plan(page, '30d');
    await expect(page.getByLabel('the plan')).toContainText('Kind event');
    await expect(page.getByLabel('the plan')).toContainText(new RegExp(`${EVENT_METHOD} \\(event\\) — available, a probability within the window`));
    await plan(page, '5y');
    await expect(page.getByLabel('the plan')).toContainText('Kind regime');
    if (CONDITIONED_METHOD === '') {
      await expect(page.getByLabel('the plan')).toContainText(new RegExp(`${REGIME_METHOD} \\(structural_judgmental\\) — available, scenario / regime language — never presented as validated`));
    } else {   // B25 completion: the later approved version is the one the plan offers; the earlier is listed, unavailable, with its reason
      await expect(page.getByLabel('the plan')).toContainText(new RegExp(`${CONDITIONED_METHOD} \\(structural_judgmental\\) — available, scenario / regime language — never presented as validated`));
      await expect(page.getByLabel('the plan')).toContainText(new RegExp(`${REGIME_METHOD} \\(structural_judgmental\\) — UNAVAILABLE: superseded by a later approved version of regime_judgement`));
    }
    await shot(page, 'b25-registry-02-plan-by-horizon');
  });

  test('THE ROUTES: the 30d event and the 5y regime ISSUED by their methods; the 3y horizon on the line-demand series REFUSED naming the missing validation', async ({ page }) => {
    await uiLogin(page, ANALYST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPortfolio(page);
    const routes = page.getByRole('list', { name: 'routes' });
    await expect(routes).toContainText(new RegExp(`${TARGET} at 30d — issued by ${EVENT_METHOD}`));
    await expect(routes).toContainText(new RegExp(`${TARGET} at 5y — issued by ${REGIME_METHOD}`));
    if (SUEZ_TARGET !== '') await expect(routes).toContainText(`${SUEZ_TARGET} at 5y — issued by ${CONDITIONED_METHOD}`);   // B25 completion: the grounded, twin-conditioned regime
    await expect(routes).toContainText(new RegExp(`${REFUSED_SERIES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} at 3y — refused: forecast rejected \\(horizon\\): .* at 3y is unsupported — no passed quantity-rolling-origin validation`));
    // B25-F (0109): the ensembles' routes are never left planned — the scene's (finished before 0109) REFUSED `unbound` by the governed
    // reconciliation, the re-issue's ISSUED by its combination rule
    if (REISSUED_RUN !== '') {
      const esc = ENSEMBLE_SERIES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await expect(routes).toContainText(new RegExp(`${esc} at 30d — refused: forecast rejected \\(unbound\\): route of ensemble run .* recorded before 0109 against an unissued forecast id`));
      await expect(routes).toContainText(`${ENSEMBLE_SERIES} at 30d — issued by ensemble:linear_pool@1`);
      await expect(routes.getByRole('listitem').filter({ hasText: /— planned/ })).toHaveCount(0);
    }
    // the EMPIRICAL validations on the real ECB history: both horizons recorded, the claim as the record states it
    const validations = page.getByRole('table', { name: 'validations' });
    for (const h of ['3y', '5y']) await expect(validations.getByRole('row').filter({ hasText: ECB_SERIES }).filter({ hasText: h })).toHaveCount(1);
    if (ECB_5Y === 'validated_retrospective') {
      await expect(validations.getByRole('row').filter({ hasText: ECB_SERIES }).filter({ hasText: '5y' })).toContainText(/PASSED\s*empirical validation/);
      await expect(routes).toContainText(`${ECB_SERIES} at 5y — issued by bayes_level@1`);
    } else if (ECB_5Y === 'refused') {
      await expect(validations.getByRole('row').filter({ hasText: ECB_SERIES }).filter({ hasText: '5y' })).toContainText('not passed');
      await expect(routes).toContainText(new RegExp(`${ECB_SERIES} at 5y — refused: forecast rejected \\(horizon\\)`));
    }
    // the analyst reads; the issue control is a forecast owner's
    await expect(page.getByRole('button', { name: 'Issue through the portfolio' })).toHaveCount(0);
    await shot(page, 'b25-registry-03-routes');
  });
});
