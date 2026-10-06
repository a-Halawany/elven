/**
 * CP-6 B91 §ME — usage meters and caps (F-P7-F-02's scene): the NORDWERK corridor simulation sweep shows its metered compute and model
 * inference against the tenant's cap; exceeding the cap stops the work with a recorded, explained breach — exercised in a browser against
 * the seeded DEMONSTRATION after the B91 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it
 * reads is what the act left — the NORDWERK tenant administrator's caps (a simulation_compute STOP cap reached, a model_inference WARN cap),
 * the corridor experiment the attention agent stopped PARTIAL at the cap (EYE_B91_EXPERIMENT_TITLE), the refused sweep's breach — so this
 * file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. The only write attempted is a REFUSED one (a cap above
 * the licence's limit). Screenshots go to EYE_SHOTS (evidence/phase6-browser/b91-meters-*.png).
 * Personas: the NORDWERK tenant administrator the act creates (EYE_B91_TENANT_ADMIN), the run operator T. Nakamura (EYE_B91_OPERATOR,
 * default `t.nakamura`). Every figure is SYNTHETIC.
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
const OPERATOR = process.env['EYE_B91_OPERATOR'] ?? 't.nakamura';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openUsage(page: Page): Promise<void> {
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Usage & Caps' }).click();   // the one navigation line the part adds
  await expect(page.getByRole('heading', { name: 'Usage meters and caps', level: 1 })).toBeVisible();
}

test.describe.serial('CP-6 B91 §ME — usage meters and caps on the demonstration', () => {
  test('THE METERS: the tenant administrator reads NORDWERK\'s meters — simulation compute and model inference metered (inference in calls: no tokens exist), the licence that bounds the caps', async ({ page }) => {
    await uiLogin(page, required('EYE_B91_TENANT_ADMIN'), required('EYE_TEST_ADMIN_PASSWORD'));
    await openUsage(page);
    await expect(page.getByTestId('licence-line')).toContainText(/^Licence v\d+ \(.+\) — caps are set within its limits$/);
    const meters = page.getByRole('table', { name: 'Meters' });
    await expect(meters).toContainText('Simulation compute');
    await expect(meters).toContainText('Model inference');
    await expect(meters.getByRole('row', { name: /Model inference/ })).toContainText('calls');
    await expect(page.getByRole('list', { name: 'Not metered' })).toContainText('TOKENS: the gateway records none');
    await shot(page, 'b91-meters-01-meters');
  });

  test('THE CAP AND ITS BREACH: the simulation compute STOP cap REACHED; the breach says new work stopped and nothing was deleted; the inference cap warns only', async ({ page }) => {
    await uiLogin(page, required('EYE_B91_TENANT_ADMIN'), required('EYE_TEST_ADMIN_PASSWORD'));
    await openUsage(page);
    const caps = page.getByRole('list', { name: 'Caps' });
    await expect(caps).toContainText(/Simulation compute · .+ per (day|month) · stops new work at admission — .+ used since .+ UTC · REACHED/);
    await expect(caps).toContainText(/Model inference · .+ calls per (day|month) · warns only/);
    const breaches = page.getByRole('list', { name: 'Breaches' });
    await expect(breaches).toContainText(/Simulation compute stop cap v\d+: new work stopped \(experiment [0-9a-f]{8}\) — nothing was deleted/);
    await expect(breaches).toContainText(/Simulation compute stop cap v\d+: new work stopped \(envelope sweep\) — nothing was deleted/);
    await shot(page, 'b91-meters-02-cap-breach');
  });

  test('THE REFUSED WRITE: a cap above the licence\'s limit is refused by the server, explained; model inference offers no stop', async ({ page }) => {
    await uiLogin(page, required('EYE_B91_TENANT_ADMIN'), required('EYE_TEST_ADMIN_PASSWORD'));
    await openUsage(page);
    const limit = Number(required('EYE_B91_LICENCE_COMPUTE_LIMIT_MS'));
    await page.getByRole('combobox', { name: 'Dimension' }).selectOption('model_inference');
    await expect(page.getByRole('combobox', { name: 'Action' }).getByRole('option')).toHaveText(['warn only']);
    await page.getByRole('combobox', { name: 'Dimension' }).selectOption('simulation_compute');
    await page.getByRole('spinbutton', { name: 'Limit' }).fill(String(limit + 1));
    await page.getByRole('textbox', { name: 'Reason' }).fill('above the licence on purpose — the demo walk (SYNTHETIC)');
    await page.getByRole('button', { name: 'Review the cap' }).click();
    await page.getByRole('button', { name: 'Confirm the cap' }).click();
    await expect(page.getByText(/usage cap rejected \(licence\): the cap .+ exceeds the licence v\d+ limit/)).toBeVisible();
    await shot(page, 'b91-meters-03-refused-above-licence');
  });

  test('THE STOPPED EXPERIMENT: in the simulation center the corridor experiment is PARTIAL — stopped at the tenant cap, its completed chunks kept', async ({ page }) => {
    const title = required('EYE_B91_EXPERIMENT_TITLE');
    await uiLogin(page, OPERATOR, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations');
    await page.getByRole('link', { name: /Simulation center/ }).click();
    const t = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');   // the title is literal text — '(SYNTHETIC)' is not a regex group
    await page.getByRole('table', { name: 'experiments' }).getByRole('button', { name: new RegExp(t) }).first().click();
    const panel = page.getByRole('region', { name: new RegExp(`^${t}`) });
    await expect(panel.getByLabel('experiment state')).toContainText('PARTIAL');
    await expect(page.getByRole('list', { name: 'ledger' })).toContainText(/budget/i);
    // the experiment's ledger as the page renders it (event names, not their details): the stop and the partial end. The reason
    // `tenant_cap` lives in the events' details, which this page does not render — the act asserts it on the record, and the cap's
    // breach (experiment …) is read on the usage page above.
    await expect(page.getByRole('list', { name: 'ledger' })).toContainText(/budget exceeded — the experiment stops/);
    await expect(page.getByRole('list', { name: 'ledger' })).toContainText(/partial/);
    await shot(page, 'b91-meters-04-experiment-partial');
  });
});
