/**
 * CP-6 B92 — product analytics, the metric catalog and UX telemetry (F-P7-F-03) on the seeded DEMONSTRATION after the B92 act ran (the
 * rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the catalog of approved
 * definitions (the owner M. Okonkwo, SYNTHETIC), the scene's results for 2026-Q3 in the red-sea-corridor scope, the CLOSED operating review
 * chaired by S. Okafor, and the experience workflow (the journeys, the privacy-reviewed event definitions, the personas' own consent). So this
 * file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here: an indeterminate result is shown INDETERMINATE with its
 * reasons, sparse history is shown NO HISTORY, never a zero. Screenshots go to EYE_SHOTS (b92-*.png). Personas from the act's env lines:
 * EYE_B92_OWNER (default m.okonkwo), EYE_B92_CHAIR (s.okafor), EYE_B92_PRIVACY (l.haas); EYE_B92_REVIEW_TITLE names the review. Every
 * NORDWERK figure is SYNTHETIC.
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
const OWNER = process.env['EYE_B92_OWNER'] ?? 'm.okonkwo';
const CHAIR = process.env['EYE_B92_CHAIR'] ?? 's.okafor';
const PRIVACY = process.env['EYE_B92_PRIVACY'] ?? 'l.haas';
const REVIEW_TITLE = process.env['EYE_B92_REVIEW_TITLE'] ?? 'NORDWERK corridor operating review — 2026-Q3 (SYNTHETIC)';
const SCOPE_KEY = process.env['EYE_B92_SCOPE'] ?? 'red-sea-corridor';
const PERIOD = process.env['EYE_B92_PERIOD'] ?? '2026-Q3';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openCatalogMetric(page: Page, metricKey: string): Promise<void> {
  await page.goto('/graph/data/analytics');
  await expect(page.getByRole('heading', { name: 'Product analytics — the metric catalog', level: 1 })).toBeVisible();
  const list = page.getByRole('region', { name: 'Definitions', exact: true });
  await list.getByRole('button', { name: metricKey, exact: true }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`^${metricKey} — `), level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B92 — the metric catalog, the operating review and experience quality on the demonstration', () => {
  test('THE CATALOG: the approved definitions with their owner; MET-024\'s contract card — every field, the approved band, the window and clock, the purpose and the digest', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/graph/data/analytics');
    await expect(page.getByRole('heading', { name: 'Product analytics — the metric catalog', level: 1 })).toBeVisible();
    const list = page.getByRole('region', { name: 'Definitions', exact: true });
    for (const k of ['MET-001', 'MET-022', 'MET-024', 'MET-034']) await expect(list.getByRole('button', { name: k, exact: true })).toBeVisible();
    await expect(list).toContainText('UNSUPPORTED');   // MET-034 (accessibility → B107/H3) is served unsupported, never silently missing
    await expect(list).toContainText(/M\. Okonkwo — product analytics owner \(SYNTHETIC\)/);
    await openCatalogMetric(page, 'MET-024');
    const card = page.getByRole('region', { name: /^MET-024 — Forecast calibration/ });
    await expect(card).toContainText(/APPROVED|Approved/i);
    await expect(card).toContainText('mission-outcomes');
    await expect(card).toContainText(/calendar_quarter/);
    await expect(card).toContainText(/0\.75/);
    await expect(card).toContainText(/met024_forecast_calibration/);
    await expect(card).toContainText(/backtest/);   // the exclusion: a backtest is a different definition, never live calibration
    await expect(card.getByRole('heading', { name: 'Results by period' })).toBeVisible();
    await shot(page, 'b92-01-catalog-contract');
  });

  test('THE DRILL-DOWN from the catalog: MET-001 definition → its 2026-Q3 corridor result → the records with their link vectors', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openCatalogMetric(page, 'MET-001');
    const results = page.getByRole('region', { name: 'Results by period' });
    const row = results.getByRole('row').filter({ hasText: PERIOD }).filter({ hasText: SCOPE_KEY }).first();
    await row.getByRole('button', { name: 'Drill down' }).click();
    const dd = page.getByRole('region', { name: `Result MET-001 ${PERIOD}` });
    await expect(dd.getByRole('heading', { name: 'The definition' })).toBeVisible();
    await expect(dd.getByRole('heading', { name: 'The result' })).toBeVisible();
    await expect(dd.getByRole('heading', { name: 'The records' })).toBeVisible();
    await expect(dd).toContainText(/clock record/);
    await expect(dd).toContainText(/Source revision/);
    await expect(dd.getByRole('button', { name: /^denominator: \d+/ })).toBeVisible();
    await expect(dd.getByRole('region', { name: 'Result records' })).toContainText('decision_package');
    await expect(dd.getByRole('region', { name: 'Result records' })).toContainText('"missing"');
    await expect(dd).toContainText(/REPRODUCED/);   // the act's replay at its own as-of
    await shot(page, 'b92-02-catalog-drilldown');
  });

  test('THE OPERATING REVIEW: the closed review — each metric with its state (an indeterminate one explained), the series with sparse history named, MET-023 not computed, the chair\'s signature', async ({ page }) => {
    await uiLogin(page, CHAIR, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/graph/data/analytics/review');
    await expect(page.getByRole('heading', { name: 'Operating review', level: 1 })).toBeVisible();
    const list = page.getByRole('region', { name: 'Reviews', exact: true });
    await list.getByRole('button', { name: REVIEW_TITLE }).click();
    const head = page.getByRole('region', { name: REVIEW_TITLE });
    await expect(head).toContainText('CLOSED (signed by the chair; immutable)');
    await expect(head).toContainText(/S\. Okafor/);
    await expect(head).toContainText(SCOPE_KEY);
    const m22 = page.getByRole('region', { name: /^Warning acknowledgment latency/ });
    await expect(m22).toContainText('INDETERMINATE');
    await expect(m22.getByRole('region', { name: 'The series of MET-022' })).toContainText('NO HISTORY');
    await expect(m22.getByRole('region', { name: 'The series of MET-022' })).toContainText(/no history: the deployment holds no records before \d{4}-\d{2}-\d{2}/);
    const m24 = page.getByRole('region', { name: /^Forecast calibration/ });
    await expect(m24).toContainText('INDETERMINATE');
    await expect(m24).toContainText(/n = 0 is below the floor 8/);
    const m23 = page.getByRole('region', { name: /^Warning action closure/ });
    await expect(m23).toContainText('NOT COMPUTED');
    await expect(page.getByRole('region', { name: 'Follow-through', exact: true })).toContainText(/N\. Eriksen/);
    await expect(page.getByRole('region', { name: 'The chair\'s close', exact: true })).toContainText(/verified|VERIFIED/);
    await shot(page, 'b92-03-review-closed');
  });

  test('THE REVIEW\'S DRILL-DOWN: MET-001 cited → definition → result → records, from the operating review', async ({ page }) => {
    await uiLogin(page, CHAIR, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/graph/data/analytics/review');
    await page.getByRole('region', { name: 'Reviews', exact: true }).getByRole('button', { name: REVIEW_TITLE }).click();
    const m01 = page.getByRole('region', { name: /^Strategic loop closure rate/ });
    await expect(m01).toContainText(/DETERMINATE|INDETERMINATE/);
    await expect(m01.getByRole('region', { name: 'The series of MET-001' })).toContainText('NO HISTORY');
    await m01.getByRole('button', { name: 'Drill down: definition → result → records' }).click();
    const dd = m01.getByRole('region', { name: `Result MET-001 ${PERIOD}` });
    await expect(dd.getByRole('heading', { name: 'The records' })).toBeVisible();
    await expect(dd.getByRole('region', { name: 'Result records' })).toContainText('decision_package');
    await expect(dd).toContainText(/operating review/);   // the use: cited by this review
    await shot(page, 'b92-04-review-drilldown');
  });

  test('EXPERIENCE QUALITY: the four-part anatomy of the operating-review journey; the owner\'s own consent CONSENTED; the event definitions privacy-reviewed', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/graph/data/analytics/experience');
    await expect(page.getByRole('heading', { name: 'Experience quality', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Your consent' }).locator('div').filter({ hasText: /experience-telemetry v\d+/ })).toContainText(/CONSENTED to version \d+/);
    const pick = page.locator('#ux-journey-pick');
    const value = await pick.locator('option', { hasText: '(operating-review v' }).first().getAttribute('value');
    await pick.selectOption(value ?? 'operating-review');
    for (const h of ['1 · Quality objective', '2 · Metrics and lineage', '3 · Segments and uncertainty', '4 · Decisions and follow-through']) {
      await expect(page.getByRole('heading', { name: h, level: 2 })).toBeVisible();
    }
    await expect(page.getByRole('region', { name: '2 · Metrics and lineage' })).toContainText(/task_success_rate/);
    // two consenting people: the baseline is suppressed below k = 5 with its reasons — never a value
    await expect(page.getByRole('region', { name: '2 · Metrics and lineage' })).toContainText(/SUPPRESSED \(below k\)|INDETERMINATE/);
    await expect(page.getByRole('region', { name: '2 · Metrics and lineage' })).toContainText(/below the journey's floor 5/);
    await expect(page.getByRole('region', { name: '4 · Decisions and follow-through' })).toContainText(/research_request|research request/);
    await expect(page.getByRole('region', { name: 'Telemetry definitions', exact: true }).first()).toContainText('operating-review.drill_down');
    await expect(page.getByRole('region', { name: 'Telemetry definitions', exact: true }).first()).toContainText(/COLLECTING under consent/);
    await shot(page, 'b92-05-experience-anatomy');
  });

  test('CONSENT IS THE PERSON\'S OWN: the privacy officer, who never consented, reads NOT CONSENTED and is offered only her own consent', async ({ page }) => {
    await uiLogin(page, PRIVACY, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/graph/data/analytics/experience');
    const consent = page.getByRole('region', { name: 'Your consent' });
    const telemetry = consent.locator('div').filter({ hasText: /experience-telemetry v\d+/ });   // the experience-telemetry purpose's own block
    await expect(telemetry).toContainText(/NOT CONSENTED — nothing of yours is collected/);
    await expect(telemetry.getByRole('button', { name: 'Give my consent' })).toBeVisible();
    await expect(telemetry.getByRole('button', { name: 'Withdraw my consent' })).toHaveCount(0);
    await shot(page, 'b92-06-experience-consent');
  });
});
