/**
 * CP-6 B25 §EN — ENSEMBLES, DISAGREEMENT AND THE JUDGEMENT OVERLAY (F-P4-02) — exercised in a browser against the seeded DEMONSTRATION after
 * the B25 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left —
 * N. Eriksen's ensemble on the corridor series (EYE_B25_SERIES, default the Bab el-Mandeb transit count) at 30 days, its two members
 * (seasonal naive, Holt-Winters) each tied to its assumption, the ensemble under linear_pool@1, the disagreement the server measured with
 * the assumption that splits them, and N. Eriksen's labelled JUDGEMENT overlay — so this file runs through playwright.demo.config.ts only
 * (the hosted config ignores *.demo.spec.ts). Written; NOT run by the part (the integrator stages the act and runs the walk).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b25-ensembles-*.png).
 * Personas: the forecast owner N. Eriksen (EYE_B25_FORECASTER, default `n.eriksen`), the analyst A. Hoffmann (EYE_B25_ANALYST, default `a.hoffmann`).
 * Every figure is SYNTHETIC or the public series as collected; the overlay's evidence is the act's.
 *
 * B25-F (0109; the act's B25-F2b): the scene's run (EYE_B25_ENSEMBLE_RUN) finished before 0109 — its route, left planned, is RECONCILED
 * (refused `unbound`, the reason on screen) and its ensemble SUPERSEDED by the re-issue (EYE_B25_REISSUED_RUN): the same question on the
 * corrected build, its route ISSUED, its members' output semantics and pins on screen, nothing incompatible combined, its replay REPRODUCED
 * (the grounding page of EYE_B25_REISSUED_ENSEMBLE).
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
const SERIES = process.env['EYE_B25_SERIES'] ?? 'portwatch:chokepoint4:n_total';
const HORIZON = process.env['EYE_B25_HORIZON'] ?? '30d';
const SCENE_RUN = process.env['EYE_B25_ENSEMBLE_RUN'] ?? '';
const REISSUED_RUN = process.env['EYE_B25_REISSUED_RUN'] ?? '';
const REISSUED_ENSEMBLE = process.env['EYE_B25_REISSUED_ENSEMBLE'] ?? '';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
/** From the prediction shell, through its nav (the one line the part adds there), to a COMPLETED run of the question — the act's run by
 *  its id when the act recorded it (the scene's, or the re-issue), else the newest completed one. */
async function openEnsemble(page: Page, runId = SCENE_RUN): Promise<void> {
  await page.goto('/prediction');
  await page.getByRole('link', { name: 'Ensembles' }).click();
  await expect(page.getByRole('heading', { name: 'Ensembles', level: 1 })).toBeVisible();
  const run = page.getByRole('combobox', { name: 'Run' });
  const option = run.locator('option', { hasText: new RegExp(`^${SERIES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · ${HORIZON} · completed`) }).first();
  await run.selectOption({ value: runId !== '' ? runId : ((await option.getAttribute('value')) ?? '') });
  await expect(page.getByRole('heading', { name: `${SERIES} at ${HORIZON}`, level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B25 §EN — ensembles on the demonstration', () => {
  test('THE PACKAGE: both members\' distributions, the ensemble (MODEL OUTPUT), the disagreement and the assumption that splits them', async ({ page }) => {
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openEnsemble(page);
    await expect(page.getByRole('region', { name: SERIES + ' at ' + HORIZON }).getByRole('status')).toContainText('COMPLETED');
    const members = page.getByRole('table', { name: /the ensemble's members/ });
    await expect(members).toContainText('seasonal_naive@1');
    await expect(members).toContainText('holt_winters@1');
    await expect(members.getByRole('row')).toHaveCount(3);   // the header and the two members
    await expect(members).toContainText(/median [\d.]+ .*\(10–90: [\d.]+–[\d.]+\)/);
    const ensemble = page.getByRole('region', { name: /The ensemble — MODEL OUTPUT/ });
    await expect(ensemble).toContainText(/ENSEMBLE of 2 member\(s\) \(seasonal_naive@1, holt_winters@1\) under linear_pool@1/);
    const disagreement = page.getByRole('region', { name: 'Disagreement' });
    await expect(disagreement.getByRole('status')).toContainText(/(MATERIAL|NOTABLE) DISAGREEMENT — max gap ratio [\d.]+/);
    await expect(disagreement).toContainText(/What splits them.*\(held by seasonal_naive@1\) vs .*\(held by holt_winters@1\)/);
    await expect(page.getByRole('region', { name: 'Excluded method paths' })).toBeVisible();
    // B25-F (0109): the scene's route is never left planned — reconciled (refused `unbound`, the reason disclosed) or issued with its run
    const route = page.getByRole('region', { name: 'The route' });
    await expect(route.getByRole('list', { name: 'the run\'s routes' })).toContainText(/ROUTE (REFUSED \(unbound\): forecast rejected \(unbound\): route of ensemble run .* recorded before 0109 against an unissued forecast id .*; the run completed as ensemble forecast|ISSUED — bound to the ensemble forecast)/);
    await expect(route).not.toContainText('LEFT PLANNED');
    await shot(page, 'b25-ensembles-01-package');
  });

  test('THE JUDGEMENT: N. Eriksen\'s overlay is labelled JUDGEMENT, versioned, beside the model\'s unchanged distribution', async ({ page }) => {
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openEnsemble(page);
    const judgement = page.getByRole('region', { name: 'Judgement overlay' });
    await expect(judgement).toContainText(/The model's own distribution, unchanged by any judgement: median .*\(MODEL OUTPUT\)/);
    await expect(judgement.getByRole('list', { name: 'the judgement overlays' })).toContainText(/JUDGEMENT v\d+ \(active\): median/);
    await shot(page, 'b25-ensembles-02-judgement');
  });

  test('THE READER: A. Hoffmann reads the package; no judgement and no issue form is offered (the server refuses her anyway)', async ({ page }) => {
    await uiLogin(page, ANALYST, required('EYE_TEST_ADMIN_PASSWORD'));
    await openEnsemble(page);
    await expect(page.getByRole('table', { name: /the ensemble's members/ })).toContainText('holt_winters@1');
    await expect(page.getByRole('region', { name: 'Judgement overlay' })).toContainText(/an agent never authors one/);
    await expect(page.getByRole('button', { name: 'Issue the ensemble' })).toHaveCount(0);
    await shot(page, 'b25-ensembles-03-reader');
  });

  test('B25-F THE RE-ISSUE on the corrected build: the prior ensemble superseded by lineage, the route ISSUED, the members\' meaning and pins, nothing incompatible combined', async ({ page }) => {
    test.skip(REISSUED_RUN === '', 'EYE_B25_REISSUED_RUN is not set (the act\'s B25-F2b did not run)');
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    // the scene's ensemble: SUPERSEDED by the re-issue
    await openEnsemble(page, SCENE_RUN);
    await expect(page.getByRole('region', { name: /The ensemble — MODEL OUTPUT/ })).toContainText(new RegExp(`superseded · .* — superseded by ${REISSUED_ENSEMBLE.slice(0, 8)}…`));
    // the re-issue
    await openEnsemble(page, REISSUED_RUN);
    await expect(page.getByRole('region', { name: SERIES + ' at ' + HORIZON }).getByRole('status')).toContainText('COMPLETED');
    await expect(page.getByRole('region', { name: 'The route' }).getByRole('list', { name: 'the run\'s routes' }))
      .toContainText(new RegExp(`ROUTE ISSUED — bound to the ensemble forecast ${REISSUED_ENSEMBLE.slice(0, 8)}… \\(ensemble:linear_pool@1\\)`));
    const members = page.getByRole('table', { name: /the ensemble's members/ });
    for (const ref of ['seasonal_naive@1', 'holt_winters@1']) {
      const row = members.getByRole('row').filter({ hasText: ref });
      await expect(row).toContainText(/future_level · value · \S+ · predictive_distribution/);
      await expect(row).toContainText(new RegExp(`method ${ref.replace('.', '\\.')} \\(implementation [0-9a-f]{12}…\\) · evaluation profile ${HORIZON}`));
    }
    await expect(members).not.toContainText(/effect_interval|scenario_band|objective_value/);
    await expect(page.getByRole('region', { name: 'Excluded method paths' })).toBeVisible();
    await shot(page, 'b25-ensembles-04-reissue');
    // its replay: REPRODUCED by the ensemble's combination replayer
    await page.goto(`/prediction/forecasts/${REISSUED_ENSEMBLE}/grounding`);
    const replays = page.getByRole('table', { name: 'Replays' });
    await expect(replays.getByRole('row').filter({ hasText: 'REPRODUCED' }).filter({ hasText: 'ensemble-combination@1' })).toHaveCount(1);
    await expect(replays).not.toContainText('DIVERGED');
    await shot(page, 'b25-ensembles-05-reissue-replay');
  });
});
