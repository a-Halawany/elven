/**
 * CP-6 B36 · part H — THE EXECUTIVE HOME in a browser against the seeded DEMONSTRATION after scripts/phase6/act-b36.mjs (the integrator's
 * act; the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the Monday
 * cadence opened, the ranked corridor item on the queue, the decision room with its gate state, the tracker's commitments, a SYNTHETIC
 * warning inside its window, the agenda the chief of staff curated, a gap escalated — so this file runs through playwright.demo.config.ts
 * only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the server composed and the page renders — never a state derived here: the seven sections with their count,
 * as-of and limitations, the context line with its digest, the loop RESET as the executive's act (the next cycle opened), the context
 * SWITCHED by the chief of staff to the Regensburg objective (every section re-read under it), the command view of the operator's role,
 * the SEARCH for "Regensburg" with each hit's explanation, the METRICS read. Personas come from the environment so the integrator binds
 * them to the act (EYE_B36_EXECUTIVE_LOGIN — M. Dvořák; EYE_B36_OPERATOR_LOGIN — the SYNTHETIC chief of staff, an executive_operator;
 * EYE_B36_OBJECTIVE_TITLE — the Regensburg objective's title). Screenshots go to EYE_SHOTS.
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
const EXECUTIVE_LOGIN = process.env['EYE_B36_EXECUTIVE_LOGIN'] ?? 'm.dvorak';
const OPERATOR_LOGIN = process.env['EYE_B36_OPERATOR_LOGIN'] ?? 'chief.of.staff';
const OBJECTIVE = new RegExp(process.env['EYE_B36_OBJECTIVE_TITLE'] ?? 'Regensburg', 'i');
const SECTIONS = ['priorities', 'intelligence', 'warnings', 'decisions', 'commitments', 'outcomes', 'cadence'] as const;

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openHome(page: Page): Promise<void> {
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Executive home', level: 1 })).toBeVisible();
  await expect(page.getByTestId('home-section-cadence')).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('CP-6 B36 — the executive home on the demonstration', () => {
  test('THE MONDAY CADENCE: M. Dvořák opens the home — the seven sections with their as-of, count and limitations, the context line, the ranked corridor item, the decision room with its gate state, the tracker; a search for "Regensburg" explains its hits; the loop RESET as the executive\'s act', async ({ page }) => {
    await uiLogin(page, EXECUTIVE_LOGIN, required('EYE_TEST_ADMIN_PASSWORD'));
    await openHome(page);
    // the seven sections, each stating its as-of and its limitations (the server's words)
    for (const s of SECTIONS) {
      const card = page.getByTestId(`home-section-${s}`);
      await expect(card).toBeVisible();
      await expect(card.getByLabel(`${s} as-of`)).toContainText(/as of \d{4}-/);
      await expect(card.getByLabel(`${s} limitations`)).toContainText('Limitations:');
    }
    await expect(page.getByLabel("the home's context")).toContainText(/Context:/);
    // the decisions: a decision room with the ONE gate-state badge (ADR-003) from the gates part's read
    await expect(page.getByTestId('home-gate-state').first()).toBeVisible();
    // the priorities: the ranked corridor item the act left on the queue
    await expect(page.getByTestId('home-section-priorities').getByRole('list', { name: 'priorities items' })).toBeVisible();
    await shot(page, 'b36-home-01-monday');
    // the SEARCH with explanation: a governed act, each hit worded with the field, the terms, the as-of and the context filter
    await page.getByLabel('search query').fill('Regensburg');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByLabel('search summary')).toContainText(/hit\(s\) for "Regensburg"/, { timeout: 20_000 });
    await expect(page.getByRole('list', { name: 'search hits' }).getByText(/matched in (title|statement|body|question|details|narrative\/items|consequence)/).first()).toBeVisible();
    await shot(page, 'b36-home-02-search');
    // THE LOOP RESET: the executive's act — the open cycle closed with its record, the next opened (a confirmation reason when board-class decisions stand)
    const cadence = page.getByTestId('home-section-cadence');
    const before = await cadence.getByLabel('the cadence').textContent();
    const reason = page.getByLabel('Confirmation reason (8+ characters)');
    if (await reason.count()) await reason.fill('The board decides the second source on Thursday; the weekly loop closes now.');
    await cadence.getByRole('button', { name: /Reset the loop/ }).click();
    await expect(cadence.getByLabel('the cadence')).not.toHaveText(before ?? '', { timeout: 20_000 });
    await expect(cadence.getByLabel('the cadence')).toContainText(/cycle #\d+ open since/);
    await expect(cadence.getByText(/The last reset closed:/)).toBeVisible();
    await shot(page, 'b36-home-03-reset');
  });

  test('THE CHIEF OF STAFF (SYNTHETIC, executive_operator): switches the context to the Regensburg objective — every section re-read under it and naming its digest; the operator\'s command view; the agenda the act curated; the metrics read', async ({ page }) => {
    await uiLogin(page, OPERATOR_LOGIN, required('EYE_TEST_ADMIN_PASSWORD'));
    await openHome(page);
    const switcher = page.getByTestId('context-switcher');
    await expect(switcher.getByLabel('the active context')).toBeVisible();
    await switcher.getByLabel('objective').selectOption({ label: await switcher.getByLabel('objective').locator('option').filter({ hasText: OBJECTIVE }).first().textContent() ?? '' });
    await switcher.getByLabel('horizon').selectOption('30d');
    await switcher.getByRole('button', { name: 'Set the context' }).click();
    await expect(page.getByLabel("the home's context")).toContainText(/objective [0-9a-f]{8}… · horizon 30d/, { timeout: 20_000 });
    await expect(page.getByLabel("the home's context")).toContainText(/digest [0-9a-f]{12}…/);
    // every section names the same context (the digest) it was read under
    await expect(page.getByTestId('home-section-commitments').getByLabel('commitments limitations')).toContainText(/horizon 30d/);
    await shot(page, 'b36-home-04-context-switched');
    // the operator's command view: cadence, priorities, decisions, commitments — and the safe actions it offers; the executive's view is not offered
    const views = page.getByTestId('command-views');
    await expect(views.getByRole('list', { name: 'command views' })).toBeVisible({ timeout: 20_000 });
    await expect(views.getByRole('button', { name: /Cadence preparation/ })).toBeVisible();
    await expect(views.getByRole('button', { name: /morning/ })).toHaveCount(0);
    await views.getByRole('button', { name: /Cadence preparation/ }).click();
    const open = page.getByTestId('command-view-open');
    await expect(open).toBeVisible({ timeout: 20_000 });
    // the safe actions line: its <strong> label and the words after it are one paragraph (getByText would resolve the <strong> alone)
    await expect(open.locator('p').filter({ hasText: 'Safe actions offered:' })).toContainText('Curate the agenda');
    await expect(open.getByTestId('home-section-cadence')).toBeVisible();
    await expect(open.getByTestId('home-section-warnings')).toHaveCount(0);
    // the agenda the act curated was cycle #1's; the act's RESET closed that cycle and opened #2, whose agenda is none — the cadence section
    // names the open cycle, the last reset's closing record, and the agenda either way (the operator's tooling on the cadence section)
    const cadence = page.getByTestId('home-section-cadence').first(); // the home's own; the open command view renders the section a second time
    await expect(cadence.getByLabel('the cadence')).toContainText(/cycle #\d+ open since .* · the previous \(#\d+\) closed/);
    await expect(cadence.getByText(/^Agenda:/)).toBeVisible();
    await expect(cadence.getByRole('list', { name: 'agenda' }).or(cadence.getByText(/^Agenda: none set$/)).first()).toBeVisible();
    await shot(page, 'b36-home-05-operator-view');
    // the metrics computed on read: three lines, each with its population and as-of; nothing stored
    await page.getByRole('button', { name: 'Read the metrics' }).click();
    const metrics = page.getByRole('list', { name: 'metrics' });
    await expect(metrics).toBeVisible({ timeout: 20_000 });
    await expect(metrics.getByText(/^time_to_understanding:/)).toBeVisible();
    await expect(metrics.getByText(/^decision_latency:/)).toBeVisible();
    await expect(metrics.getByText(/^review_completion:/)).toBeVisible();
    await expect(metrics.getByText(/stored: no \(computed on read\)/)).toBeVisible();
    await shot(page, 'b36-home-06-metrics');
  });
});
