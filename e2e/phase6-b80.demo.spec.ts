/**
 * CP-6 B80 — shell and foundations on the seeded DEMONSTRATION after the B80 act ran (the rehearsal copy first, then eye_demo): the NORDWERK
 * theme in force (F-P7-E-03), the shared forms and the bulk selection (F-P7-E-05), the context bar's switch and the deep link (F-P7-E-01).
 * A DEMO WALK, not a hosted gate case: what it reads is what scripts/phase6/act-b80.mjs left, so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the page says and exposes in the ACCESSIBILITY TREE (semantic parity, never pixels): the same warning's text,
 * labels, symbols and order in light, dark and print under the activated theme; the two forms' shared Field, validation, Error Summary and
 * draft control; the BulkSelection panel's included / excluded / hidden counts BEFORE any action; the context switch's impact preview BEFORE its
 * commit (the walk switches the horizon and back, so the act's end state stands); the deep link opened in a NEW browser context. The walk
 * writes nothing except those two context commits (each through the governed route). Personas from the act's env lines (EYE_B80_*), each
 * defaulting to the act's login; the password is EYE_TEST_ADMIN_PASSWORD. Screenshots go to EYE_SHOTS (b80-*.png). Every person, record and
 * figure is SYNTHETIC; this is demonstrated operation, never an acceptance (B111 → H3).
 */
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
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
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: join(SHOTS, `b80-${name}.png`), fullPage });
const env = (k: string, d: string) => process.env[k] ?? d;
const OWNER = env('EYE_B80_DECISION_OWNER', 'l.brandt');
const COLLECTOR = env('EYE_B80_COLLECTOR', 'm.dvorak');
const WARNING = env('EYE_B80_WARNING', '01a0df00-48f5-7131-9232-4a61a20296d4');
const AS_OF = env('EYE_B80_AS_OF', '2026-09-27T18:35:33Z');
const BEFORE = env('EYE_B80_BEFORE', '2026-09-26T17:35:32Z');
const SCENARIO = env('EYE_B80_SCENARIO', 'Bab el-Mandeb closure — Houthi activity and insurer withdrawal (SYNTHETIC)');
const STALE = env('EYE_B80_STALE_SCENARIO', 'B21 — the corridor with a duplicated collapse branch (2026-09-24)');
const link = (at: string) => `/prediction/warnings/as-of?warning=${WARNING}&at=${encodeURIComponent(at)}`;

async function uiLogin(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(required('EYE_TEST_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openAsOf(page: Page, at: string): Promise<void> {
  await page.goto(link(at));
  await expect(page.getByRole('heading', { name: 'Warning as of an instant', level: 1 })).toBeVisible();
}

test.describe.serial('CP-6 B80 — the theme, the forms, the bulk selection, the context bar and the deep link on the demonstration', () => {
  test('THE THEME (F-P7-E-03): the B28 warning under the activated NORDWERK theme — the same text, labels, symbols and order in light, dark and print', async ({ page }) => {
    await uiLogin(page, OWNER);
    await openAsOf(page, AS_OF);
    const scopeEl = page.locator('[data-eye-theme-state]').first();
    await expect(scopeEl).toHaveAttribute('data-eye-theme-state', 'customer');                     // the certified customer theme, as the server says
    const main = page.locator('main');
    await expect(main).toContainText('RAISED');
    const snapshots: Record<string, string> = {};
    for (const mode of ['light', 'dark', 'print'] as const) {
      await page.emulateMedia(mode === 'print' ? { media: 'print', colorScheme: 'light' } : { media: 'screen', colorScheme: mode });
      snapshots[mode] = await main.ariaSnapshot();
      await shot(page, `01-theme-${mode}`, true);
    }
    await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
    expect(snapshots['dark']).toBe(snapshots['light']);                                             // semantic parity: only the palette changes
    // print drops some controls (the shell's History button) — the warning's text, labels, symbols and order are the same
    const content = (snap: string) => snap.split('\n').filter((l) => !/^\s*- button "/.test(l)).join('\n');
    expect(content(snapshots['print']!)).toBe(content(snapshots['light']!));
    expect(snapshots['light']).toContain('RAISED');
  });

  test('THE FORMS (F-P7-E-05): the source registration and the decision-package form share the Field, the validation, the Error Summary and the draft control', async ({ page, browser }) => {
    const check = async (p: Page, path: string, heading: string, field: RegExp, savedValue: string) => {
      await p.goto(path);
      await expect(p.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      const draft = p.getByRole('region', { name: 'Your draft of this form' });
      await expect(draft.getByRole('status').first()).toContainText(/draft v\d+ saved .* a draft is not sent to anyone/);  // the act's draft, offered back
      const box = p.getByRole('textbox', { name: field });
      await box.fill('');
      await p.getByRole('button', { name: 'Continue' }).click();
      const summary = p.getByRole('alert').filter({ has: p.getByRole('heading', { name: /There (is|are) \d+ problems? to resolve before this can be submitted/ }) });
      await expect(summary).toBeVisible();
      await expect(box).toHaveAttribute('aria-invalid', 'true');
      await draft.getByRole('button', { name: 'More actions' }).click();
      await p.getByRole('menuitem', { name: /^Resume draft v\d+/ }).click();
      await expect(draft).toContainText(/Draft v\d+ restored into the form\./);
      // the draft brings back its STEP too (the act saved it past the first step): step back to the field
      for (let i = 0; i < 3 && !(await box.isVisible()); i += 1) await p.getByRole('button', { name: 'Back' }).click();
      await expect(box).toHaveValue(savedValue);
      return summary;
    };
    await uiLogin(page, COLLECTOR);
    await check(page, '/observation/sources/new', 'Register a source', /^Name/, 'Bab el-Mandeb insurer notices (SYNTHETIC)');
    await shot(page, '02-form-source', true);
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await uiLogin(p2, OWNER);
    await check(p2, '/decisions/packages/new', 'Declare a decision package', /^Package title/, 'Bab el-Mandeb corridor reroute (SYNTHETIC)');
    await shot(p2, '03-form-package', true);
    await ctx.close();
  });

  test('THE BULK SELECTION (F-P7-E-05): the Red Sea sources — included, excluded with the reason, hidden by the filter — stated BEFORE any action', async ({ page }) => {
    await uiLogin(page, COLLECTOR);
    await page.goto('/observation/sources');
    await expect(page.getByRole('heading', { name: 'Sources', level: 1 })).toBeVisible();
    const filter = page.getByLabel('Filter Registered sources');
    await filter.fill('Red Sea');
    await page.getByRole('checkbox', { name: /^Select the \d+ rows shown \(only these rows/ }).check();
    await filter.fill('IMF PortWatch');
    await page.getByRole('checkbox', { name: /^Select the \d+ rows shown \(only these rows/ }).check();
    await filter.fill('');
    const bulk = page.getByRole('region', { name: 'Bulk selection — source contracts' });
    const counts = bulk.getByRole('status').first();
    await expect(counts).toHaveText(/^\d+ selected · [1-9]\d* included · [1-9]\d* excluded · 0 hidden by the filter · 0 changed since selection$/);
    await expect(bulk).toContainText('live-mode contract — its lifecycle also moves its collection schedule; act on it alone from its own page');
    await expect(bulk.getByRole('button', { name: /^Review the suspension of \d+ contracts?$/ })).toBeDisabled();       // no reason yet
    await expect(bulk.getByRole('list', { name: 'Why the action is not available' })).toBeVisible();
    await filter.fill('Red Sea');
    await expect(counts).toHaveText(/^\d+ selected · [1-9]\d* included · \d+ excluded · [1-9]\d* hidden by the filter · 0 changed since selection$/);
    await shot(page, '04-bulk-selection');
    await bulk.getByRole('button', { name: 'Clear the selection' }).click();                         // nothing was sent
  });

  test('THE CONTEXT BAR (F-P7-E-01): the scenario in force; a stale choice offered disabled; the switch previewed BEFORE its commit (and switched back)', async ({ page }) => {
    await uiLogin(page, OWNER);
    await page.goto('/decisions');
    const bar = page.getByRole('region', { name: 'Operating context' });
    await expect(bar).toContainText(SCENARIO);
    const switchTo = async (horizon: string, screenshot: string | null) => {
      await bar.getByRole('button', { name: 'Switch context…' }).click();
      const dlg = page.getByRole('dialog', { name: 'Switch the operating context' });
      await expect(dlg).toBeVisible();
      // the stale (retired) scenario is offered DISABLED with its reason in words
      await expect(dlg.getByRole('combobox', { name: 'scenario' }).locator('option', { hasText: STALE })).toHaveAttribute('disabled', '');
      await expect(dlg.getByRole('combobox', { name: 'scenario' }).locator('option', { hasText: STALE })).toHaveText(/\(stale: retired\)$/);
      await dlg.getByRole('combobox', { name: 'horizon' }).selectOption(horizon);
      const set = dlg.getByRole('button', { name: 'Set the context' });
      await expect(set).toBeDisabled();                                                             // never a commit without its preview
      await dlg.getByRole('button', { name: 'Preview the switch' }).click();
      const impact = dlg.getByRole('region', { name: 'the impact preview' });
      await expect(impact.getByRole('heading', { name: 'Before you commit — the impact' })).toBeVisible();
      await expect(impact.getByRole('list', { name: 'changed dimensions' })).toContainText(/horizon/i);
      await expect(impact.getByRole('list', { name: 'affected work' })).toContainText(/draft/);
      await expect(set).toBeEnabled();
      if (screenshot !== null) await shot(page, screenshot, true);
      await set.click();
      await expect(dlg).toContainText(/POL [0-9a-f-]{8,}|policy decision/i);                    // the receipt, after the server's answer
      await dlg.getByRole('button', { name: 'Close', exact: true }).first().click();
      await expect(bar.locator('[data-dimension="horizon"] dd')).toHaveText(horizon);
    };
    const now = (await bar.locator('[data-dimension="horizon"] dd').innerText()).trim();
    await switchTo(now === '12m' ? '36m' : '12m', '05-context-preview');
    await switchTo('90d', null);                                                                    // back to the act's end state (horizon 90d)
    await shot(page, '06-context-bar');
  });

  test('THE DEEP LINK (F-P7-E-01): opened in a NEW browser context — the exact as-of state and its variance; an instant before the history refused', async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(link(AS_OF));
    await page.waitForURL((u) => u.pathname.startsWith('/login'));                                  // no session in a new context
    await uiLogin(page, OWNER);
    await openAsOf(page, AS_OF);
    const main = page.locator('main');
    await expect(main).toContainText('Opened.');
    await expect(main).toContainText('This is the state recorded as of the link\'s instant. Later events exist');
    await expect(main).toContainText(`as of ${AS_OF}`);
    await expect(main).toContainText('RAISED');
    const variance = page.getByRole('table', { name: /fields that differ between the instant and the current declared state/ });
    await expect(variance.getByRole('row', { name: /state raised expired/ })).toBeVisible();
    await shot(page, '07-deep-link', true);
    await openAsOf(page, BEFORE);
    await expect(main).toContainText('Not opened.');
    await expect(main).toContainText('before this record\'s history begins');
    await expect(main).toContainText('warning as-of rejected (not_replayable)');
    await shot(page, '08-deep-link-before');
    await ctx.close();
  });
});
