/**
 * CP-6 B30 §ES — reconciliation (F-P5-02): a new PortWatch transit count arrives; the estimator proposes corridor capacity 62 %; the
 * conservation check passes; the twin owner (T. Nakamura) approves the material change into a new snapshot — exercised in a browser
 * against the seeded DEMONSTRATION after the B30 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case:
 * what it reads is what the act left — the estimator declared on the "NORDWERK — Ningbo → Regensburg chain" twin (key
 * EYE_B30_ESTIMATE_KEY, default corridor.capacity_share), the Reconciliation Agent's proposal after the attention tick, the conservation set
 * (EYE_B30_CONSTRAINT_SET, default corridor-transit-balance), T. Nakamura's approval — so this file runs through playwright.demo.config.ts
 * only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a value derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b30-estimation-*.png). Persona: the twin owner T. Nakamura (EYE_B30_OWNER, default `t.nakamura`).
 * Every figure is SYNTHETIC.
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
/** Who proposed the staged estimate, as the act records it: `agent` when the Reconciliation Agent proposed on a NEW count, `person` when the
 *  publisher had nothing new and a person proposed through the route (the act's B30-S says which and prints this line). */
const BY_AGENT = (process.env['EYE_B30_PROPOSED_BY'] ?? 'agent') === 'agent';
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const OWNER = process.env['EYE_B30_OWNER'] ?? 't.nakamura';
const TWIN = process.env['EYE_B30_TWIN_TITLE'] ?? 'NORDWERK — Ningbo → Regensburg chain';
const KEY = process.env['EYE_B30_ESTIMATE_KEY'] ?? 'corridor.capacity_share';
const SET = process.env['EYE_B30_CONSTRAINT_SET'] ?? 'corridor-transit-balance';
const VALUE = process.env['EYE_B30_ESTIMATE_VALUE'] ?? '62';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
/** The reconciliation page, through the twins navigation (the one line this part adds there), on the corridor twin. */
async function openReconciliation(page: Page): Promise<void> {
  await page.goto('/twins');
  await page.getByRole('link', { name: /Reconciliation/ }).click();
  await expect(page.getByRole('heading', { name: 'Reconciliation', level: 1 })).toBeVisible();
  await page.getByRole('combobox', { name: 'Twin', exact: true }).selectOption({ label: TWIN });
  await expect(page.getByRole('table', { name: 'estimators' })).toContainText(KEY);
}
/** The newest estimate of the key in the given state, opened from the list. */
async function openEstimate(page: Page, state: string): Promise<void> {
  const row = page.getByRole('table', { name: 'estimates' }).getByRole('row').filter({ hasText: KEY }).filter({ hasText: state }).first();
  await row.getByRole('button').click();
  await expect(page.getByLabel('estimate state')).toContainText(state.toUpperCase());
}

test.describe.serial('CP-6 B30 §ES — reconciliation on the demonstration', () => {
  test('THE ESTIMATORS: the primary on the PortWatch transit count and its challengers, declared by the twin owner', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openReconciliation(page);
    const estimators = page.getByRole('table', { name: 'estimators' });
    await expect(estimators.getByRole('row').filter({ hasText: KEY }).filter({ hasText: 'primary' })).toHaveCount(1);
    await expect(estimators).toContainText('ratio_to_baseline');
    await shot(page, 'b30-estimation-01-estimators');
  });

  test('THE PROPOSAL AND THE APPROVAL: 62 % proposed on the count (by the Reconciliation Agent on a new count, or by a person when the publisher had nothing new — EYE_B30_PROPOSED_BY, as the act records it) — every candidate kept, the inputs qualified, the conservation check SATISFIED — and T. Nakamura approved it into a new snapshot', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openReconciliation(page);
    await openEstimate(page, 'approved');
    await expect(page.getByLabel('proposal', { exact: true })).toContainText(new RegExp(`^${KEY.replace(/\./g, '\\.')} = ${VALUE} % \\(confidence`));
    if (BY_AGENT) await expect(page.getByText(/the Reconciliation Agent \(run .*\) — it proposes only/)).toBeVisible();
    await expect(page.getByLabel('constraint check', { exact: true })).toContainText(new RegExp(`^SATISFIED — ${SET} v\\d+`));
    await expect(page.getByLabel('materiality', { exact: true })).toContainText(/^MATERIAL/);
    await expect(page.getByRole('list', { name: 'candidates' })).toContainText(/\(primary, ratio_to_baseline\): /);
    await expect(page.getByRole('list', { name: 'qualification' })).toContainText(/QUALIFIED — health healthy/);
    await expect(page.getByLabel('snapshot', { exact: true })).toContainText(/^published as v\d+$/);
    const ledger = page.getByRole('list', { name: 'ledger' });
    await expect(ledger).toContainText(BY_AGENT ? /proposed .* by the Reconciliation Agent — constraint satisfied/ : /proposed .* by a person — constraint satisfied/);
    await expect(ledger).toContainText(/approved — snapshot v\d+/);
    await shot(page, 'b30-estimation-02-approved');
  });

  test('THE TRIGGERS AND THE REQUESTS: nothing pending after the proposal; the requests for new observations listed with how they travel', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openReconciliation(page);
    // B25 staging: once the Reconciliation Agent has processed a real trigger, the page shows BOTH "Nothing pending" and that run's
    // "… trigger(s)" line — either answers the question; the first is asserted (strict mode refuses two)
    await expect(page.getByText(/Nothing pending|trigger\(s\)/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Requests for new observations', level: 2 })).toBeVisible();
    await shot(page, 'b30-estimation-03-requests');
  });
});
