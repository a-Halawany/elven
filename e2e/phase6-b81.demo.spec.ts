/**
 * CP-6 B81 — THE ACT'S WALK on the seeded DEMONSTRATION after scripts/phase6/act-b81.mjs ran (the rehearsal copy first, then eye_demo):
 * search and intent (F-P7-E-02), layout and windows (F-P7-E-04), object pages (F-P7-E-06), content and terms (F-P7-E-18), degraded state
 * (F-P7-E-19), human authority (F-P7-E-20). A DEMO WALK, not a hosted gate case (playwright.demo.config.ts only — the hosted config ignores
 * *.demo.spec.ts). What it asserts is what the page says and exposes in the ACCESSIBILITY TREE:
 *
 *   1. THE PALETTE'S MODES — Go to · Search · Ask · Command, a typed prefix said as the switch it is, the reading shown before anything runs;
 *      the command "approve corridor reroute" handed to the package's Command Review (/decisions?package=&review=) — nothing preselected,
 *      nothing run.
 *   2. THE CLARIFICATION — A. Hoffmann's words on the search page: the bounded question, every alternative unchosen, the act disabled until she
 *      chooses; her saved search reopened exactly with the live re-run beside it.
 *   3. THE OBJECT HEADERS — the warning (the "Acted by" column of its recorded instants), N. Eriksen's forecast, T. Nakamura's twin snapshot
 *      and the reroute package (its versions with the actual approver).
 *   4. THE DEGRADED AND STALE DECLARATIONS — the contract in force and the stale source's watermark, age and refresh path on the warning page and
 *      the operations room; a refused link handed to the recovery panel.
 *   5. THE TYPED CONFIRMATION — the warning's Close (an irreversible act): the phrase to type; a wrong phrase keeps it disabled (never closed).
 *   6. THE TERM — ASSESSED's executive explanation on hover and keyboard focus (the published term, from the server's catalogue).
 *   7. THE OPERATIONS ROOM at 1920 (BP-05) and /present with NO control; the density in force for L. Brandt (strategic, set by the act).
 *
 * The walk WRITES NOTHING but personal records (an intent record when the hand-off to a review is opened — the palette's own). Personas from the
 * act's env lines (EYE_B81_*), each defaulting to the act's login; the password is EYE_TEST_ADMIN_PASSWORD. Screenshots go to EYE_SHOTS
 * (b81-*.png). Every person, record and figure is SYNTHETIC; demonstrated operation, never an acceptance (B111 → H3).
 */
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const expect = baseExpect.configure({ timeout: 20_000 });
function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required (the act's env line)`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: join(SHOTS, `b81-${name}.png`), fullPage });
const env = (k: string, d: string) => process.env[k] ?? d;
const AUTHORITY = env('EYE_B81_DECISION_AUTHORITY', 'l.brandt');
const ANALYST = env('EYE_B81_ANALYST', 'a.hoffmann');
const DSA = env('EYE_B81_DSA', 'l.haddad');
const WARNING_OWNER = env('EYE_B81_WARNING_OWNER', 'n.eriksen');
const PACKAGE_TITLE = 'Bab el-Mandeb corridor reroute (SYNTHETIC)';
const INPUT = env('EYE_B81_PALETTE_INPUT', 'Bab el-Mandeb exposure Regensburg');

async function signIn(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(required('EYE_TEST_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function signedIn(browser: Browser, username: string, viewport = { width: 1440, height: 900 }): Promise<Page> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await signIn(page, username);
  return page;
}

test.describe('CP-6 B81 — the act\'s walk: the palette, the clarification, the headers, the degraded state, the typed confirmation, the term, the room', () => {
  test('THE PALETTE (F-P7-E-02): four modes, a typed prefix said as the switch, the reading before anything; a command handed to its Command Review', async ({ browser }) => {
    const page = await signedIn(browser, ANALYST);
    await page.goto('/home');
    await page.getByRole('button', { name: /Go to or search/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Go to, search, ask or find a command' });
    await expect(dialog).toBeVisible();
    const tabs = dialog.getByRole('tablist', { name: 'Palette mode' });
    for (const m of ['Go to', 'Search', 'Ask', 'Command']) await expect(tabs.getByRole('tab', { name: m })).toBeVisible();
    const input = dialog.locator('#eye-palette-input');
    await input.fill(`?${INPUT}`);
    await expect(dialog.getByText('Switched to Ask (you typed “?”).')).toBeVisible();                    // the prefix is said as the switch it is
    await expect(tabs.getByRole('tab', { name: 'Ask' })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('.eye-palette-reading')).toContainText('The reading:');                    // the reading BEFORE any result
    await expect(dialog.locator('.eye-palette-reading')).toContainText('not yet checked');
    await shot(page, '01-palette-ask');
    await tabs.getByRole('tab', { name: 'Command' }).click();
    await input.fill('approve corridor reroute');
    const commands = dialog.getByRole('listbox', { name: /Commands — each opens its Command Review/ });
    const review = commands.getByRole('option', { name: /Review: Approve a decision package version/ });
    await expect(review).toBeVisible();
    await shot(page, '02-palette-command');
    await review.click();
    await page.waitForURL((u) => u.pathname === '/graph/search/all');
    await expect(page.getByRole('heading', { name: 'Search and intent', level: 1 })).toBeVisible();
    const open = page.getByRole('button', { name: new RegExp(`^Open the review: Approve a decision package version — ${PACKAGE_TITLE.replace(/[()]/g, '\\$&')}`) });
    await expect(open).toBeVisible();
    await open.click();
    await page.waitForURL((u) => u.pathname === '/decisions' && u.searchParams.get('review') === 'decision.approve');
    await expect(page.getByText(/You came from the palette to review/)).toBeVisible();
    await expect(page.getByText(/Nothing has been done/)).toBeVisible();                                   // handed off — never executed
    await expect(page.getByRole('heading', { name: PACKAGE_TITLE, level: 2 })).toBeVisible();
    await shot(page, '03-command-handoff');
    await page.context().close();
  });

  test('THE CLARIFICATION (F-P7-E-02): the bounded question, nothing preselected, the act held until she chooses; the saved search reopened exactly', async ({ browser }) => {
    const page = await signedIn(browser, ANALYST);
    await page.goto(`/graph/search/all?q=${encodeURIComponent(INPUT)}&mode=ask`);
    await expect(page.getByRole('heading', { name: 'The reading', level: 2 })).toBeVisible();
    const radios = page.locator('input[type="radio"][name="si-choice"]');
    await expect(radios.first()).toBeVisible();
    const n = await radios.count();
    expect(n).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < n; i += 1) await expect(radios.nth(i)).not.toBeChecked();                        // NOTHING preselected
    await expect(page.locator('fieldset legend').filter({ hasText: /^Which “/ })).toBeVisible();
    await expect(page.getByText(/unavailable: choose one — nothing is chosen for you/)).toBeVisible();
    await shot(page, '04-clarification');
    const saved = process.env['EYE_B81_SAVED_SEARCH'];
    if (saved !== undefined && saved !== '') {
      await page.goto(`/graph/search/all?saved=${saved}`);
      await expect(page.getByRole('heading', { name: 'Saved search', level: 2, exact: true })).toBeVisible();
      await expect(page.getByText('The saved result set (at the cutoff)')).toBeVisible();
      await expect(page.getByText('The live re-run, beside it')).toBeVisible();
      await shot(page, '05-saved-search');
    }
    await page.context().close();
  });

  test('THE OBJECT HEADERS (F-P7-E-06): the warning ("Acted by"), the forecast, the twin snapshot, the package (its actual approver)', async ({ browser }) => {
    const page = await signedIn(browser, AUTHORITY);
    const W = required('EYE_B81_WARNING');
    await page.goto(`/prediction/warnings/${W}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Bab el-Mandeb corridor collapse');
    const wid = page.getByRole('definition').first();
    await expect(page.locator('dl[aria-label="Warning identity"]')).toBeVisible();
    await expect(wid).toBeVisible();
    await expect(page.locator('#object-identity')).toContainText(`eye:WRN:${W}`);
    await expect(page.getByRole('columnheader', { name: 'Acted by' })).toBeVisible();                     // a warning carries no approval
    await expect(page.getByRole('columnheader', { name: /Approved by/ })).toHaveCount(0);
    await shot(page, '06-header-warning', true);
    const F = process.env['EYE_B81_FORECAST'];
    if (F) {
      await page.goto(`/prediction/forecasts/${F}`);
      await expect(page.locator('dl[aria-label="Forecast identity"]')).toBeVisible();
      await expect(page.locator('#object-identity')).toContainText(`eye:FCT:${F}`);
      await expect(page.locator('#object-identity')).toContainText('immutable record');
      await shot(page, '07-header-forecast');
    }
    const TW = process.env['EYE_B81_TWIN']; const TV = process.env['EYE_B81_TWIN_VERSION'];
    if (TW && TV) {
      await page.goto(`/twins/${TW}/versions/${TV}`);
      await expect(page.locator('dl[aria-label="Twin snapshot identity"]')).toBeVisible();
      await expect(page.locator('#object-identity')).toContainText(`eye:TWN:${TW}:v${TV}`);
      await shot(page, '08-header-twin');
    }
    const PKG = required('EYE_B81_PACKAGE');
    await page.goto(`/decisions/packages/${PKG}`);
    await expect(page.getByRole('heading', { name: PACKAGE_TITLE, level: 1 })).toBeVisible();
    await expect(page.locator('dl[aria-label="Decision package identity"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Versions', level: 2 })).toBeVisible();
    await expect(page.locator('#package-versions ~ * , #package-versions').getByText(/approve by/).first()).toBeVisible();   // the actual approver
    await shot(page, '09-header-package', true);
    await page.context().close();
  });

  test('THE DEGRADED STATE (F-P7-E-19): the contract in force and the stale source on the warning page and the room; a refused link handed to recovery', async ({ browser }) => {
    const page = await signedIn(browser, AUTHORITY, { width: 1920, height: 1080 });
    await page.goto(`/prediction/warnings/${required('EYE_B81_WARNING')}`);
    const dep = page.locator('[aria-label="Degraded dependencies"]');
    await expect(dep).toBeVisible();
    await expect(dep.getByRole('heading', { name: /DEGRADED — .*Source carrier-advisories is degraded/ })).toBeVisible();
    for (const t of ['What still works', 'What is unavailable until recovery is verified', 'Owner of the degraded mode', 'Maximum duration', 'Exit evidence that ends the degraded mode']) await expect(dep.getByText(t, { exact: true }).first()).toBeVisible();
    const stale = page.getByRole('status', { name: /Stale data — Source carrier-advisories/ });
    await expect(stale).toBeVisible();
    for (const t of ['Watermark', 'Age', 'Refresh path']) await expect(stale.getByText(t, { exact: true })).toBeVisible();
    await expect(stale).toContainText('◷ STALE');
    await shot(page, '10-degraded-warning');
    await page.goto('/home/operations-room');
    await expect(page.locator('[aria-label="Degraded dependencies"]')).toBeVisible();
    await expect(page.getByRole('status', { name: /Stale data — Source carrier-advisories/ })).toBeVisible();
    // a link the server refuses: the recovery panel says what happened, that nothing changed, and the safe next steps
    await page.goto('/prediction/warnings/00000000-0000-4000-8000-000000000000');
    const rec = page.getByRole('region', { name: 'Recovery' });
    await expect(rec).toBeVisible();
    await expect(rec).toContainText('Nothing was changed');
    await expect(rec.getByRole('navigation', { name: 'Safe next steps' })).toBeVisible();
    await shot(page, '11-recovery');
    await page.context().close();
  });

  test('THE TYPED CONFIRMATION (F-P7-E-20): the warning\'s Close — scope, irreversibility, the phrase; a wrong phrase keeps it disabled (never closed)', async ({ browser }) => {
    const page = await signedIn(browser, WARNING_OWNER);
    await page.goto('/prediction/warnings');
    await page.getByRole('button', { name: /Stream rule Bab el-Mandeb corridor collapse on event time/ }).first().click();
    const review = page.getByRole('region', { name: 'Command review: Close the warning' });
    await expect(review).toBeVisible();
    await expect(page.getByText(/Closing cannot be undone: a closed warning is not reopened/)).toBeVisible();
    const phrase = (await review.getByTestId('typed-phrase').textContent())?.trim() ?? '';
    expect(phrase).toMatch(/^[0-9a-f]{8}$/);
    await review.getByLabel('Why it is closed').fill('the corridor reopened (walk — never sent)');
    await review.getByLabel(/^Type .* to confirm/).fill('reroute');
    await expect(review.getByText(/what you typed is not/).first()).toBeVisible();
    await expect(review.getByRole('button', { name: 'Close the warning' })).toBeDisabled();             // refused in the client; nothing sent
    await shot(page, '12-typed-confirmation');
    await page.context().close();
  });

  test('THE TERM (F-P7-E-18): ASSESSED\'s executive explanation on hover and on keyboard focus', async ({ browser }) => {
    const page = await signedIn(browser, DSA);
    await page.goto('/admin/governance/terms');
    const term = page.locator('.eye-term[data-term="truth.assessed"]').first();
    await expect(term).toBeVisible();
    await term.hover();
    const tip = page.getByRole('tooltip').filter({ hasText: 'ASSESSED' }).first();
    await expect(tip).toBeVisible();
    await expect(tip).toContainText('For executives: ASSESSED means a reviewer has judged the evidence.');
    await page.mouse.move(0, 0);
    await term.focus();
    await expect(tip).toBeVisible();
    await shot(page, '13-term');
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await page.context().close();
  });

  test('THE ROOM (F-P7-E-04): the operations room at 1920 (BP-05), its regions; /present with no control; L. Brandt\'s density in force', async ({ browser }) => {
    const page = await signedIn(browser, AUTHORITY, { width: 1920, height: 1080 });
    await page.goto('/home/operations-room');
    await expect(page.getByRole('heading', { name: 'Operations room', level: 1 })).toBeVisible();
    const room = page.getByRole('group', { name: 'Operations room' });
    await expect(room).toHaveAttribute('data-layout-class', 'BP-05');
    for (const r of ['Context', 'Status', 'Authority', 'Primary task', 'Actions', 'Evidence', 'Inspector']) await expect(room.getByRole('region', { name: r, exact: true }).first()).toBeVisible();
    await expect(room).toContainText(/CONTROL SURFACE|MIRROR — not a control surface/);
    await expect(page.getByRole('combobox', { name: 'Display density' }).first()).toHaveValue('DEN-01');           // the act's strategic density
    await shot(page, '14-operations-room');
    await page.goto(`/present?display=${env('EYE_B81_DISPLAY', 'operations-room')}&tenant=${required('EYE_B81_TENANT')}&domain=${required('EYE_B81_DOMAIN')}`);
    await expect(page.getByRole('heading', { name: 'Presentation display', level: 1 })).toBeVisible();
    await expect(page.getByRole('note').filter({ hasText: 'PRESENTATION — not a control surface' })).toBeVisible();
    const surface = page.locator('[data-surface="presentation"]');
    await expect(surface).toBeVisible();
    await expect(surface.getByRole('button')).toHaveCount(0);                                              // it carries no control
    await expect(surface.locator('input, select, textarea')).toHaveCount(0);
    await shot(page, '15-present');
    await page.context().close();
  });
});
