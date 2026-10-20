/**
 * CP-6 B80 §CL-D — THE CATALOGUE WALK for the data and layer components (F-P7-E-05: UX-22-006, UX-23-006, CMP-001, CMP-003 and the CMP-049…056 /
 * PAT-18 / PAT-27 / PAT-28 states). A DEMO WALK, not a hosted gate case: it runs through playwright.demo.config.ts only. The catalogue page calls
 * no server and renders SYNTHETIC fixtures, so the walk reads the components' contracts through the ACCESSIBILITY TREE — names, roles, states,
 * focus — in light, dark, forced colours, print and at 200 % zoom. It is CONSTRUCTION evidence (the components behave as their contracts say);
 * it records no acceptance (H3, through B111's recording path).
 *
 * Sign-in: by default the act's Design System Authority persona (EYE_B80_CATALOGUE_USER, default l.haddad; password EYE_TEST_ADMIN_PASSWORD).
 * With EYE_B80_FIXTURE_SESSION=1 the walk instead places a SYNTHETIC session in sessionStorage (the admin shell only checks that one exists and
 * the catalogue reads nothing) — for a web server run without an API. Screenshots go to EYE_SHOTS (b80-cld-*.png).
 */
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const expect = baseExpect.configure({ timeout: 20_000 });
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `b80-cld-${name}.png`), fullPage: false });

async function signIn(page: Page): Promise<void> {
  if (process.env['EYE_B80_FIXTURE_SESSION'] === '1') {
    await page.goto('/login');
    await page.evaluate(() => sessionStorage.setItem('eye.session', JSON.stringify({ principalId: 'synthetic-catalogue-walker', accessToken: 'synthetic-not-a-token', scope: { scope: 'PLATFORM', tenantId: null, domainId: null } })));
    return;
  }
  const pw = process.env['EYE_TEST_ADMIN_PASSWORD'];
  if (pw === undefined || pw === '') throw new Error('EYE_TEST_ADMIN_PASSWORD is required (or EYE_B80_FIXTURE_SESSION=1)');
  await page.goto('/login');
  await page.getByLabel('Username').fill(process.env['EYE_B80_CATALOGUE_USER'] ?? 'l.haddad');
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openCatalogue(page: Page): Promise<void> {
  await page.goto('/admin/governance/design/catalogue');
  await expect(page.getByRole('heading', { name: 'Component catalogue', level: 1 })).toBeVisible();
}

test.describe('B80 §CL-D — the catalogue walk (data, layers, foundation)', () => {
  test.beforeEach(async ({ page }) => { await signIn(page); await openCatalogue(page); });

  test('DataTable: exact counts, sort with aria-sort, filter, group, density, selection, the labelled export', async ({ page }) => {
    const region = page.getByRole('region', { name: 'Catalogue fixture table' });
    await expect(page.getByRole('status').filter({ hasText: '60 of 60 fixture rows shown' })).toBeVisible();
    const head = region.getByRole('columnheader', { name: /Evidence objects/ });
    await expect(head).toHaveAttribute('aria-sort', 'none');
    await head.getByRole('button').click();
    await expect(head).toHaveAttribute('aria-sort', 'ascending');
    await head.getByRole('button').click();
    await expect(head).toHaveAttribute('aria-sort', 'descending');
    // unknown sorts LAST in both directions
    await expect(region.getByRole('row').last()).toContainText('unknown');
    await page.getByLabel('Filter Catalogue fixture table').fill('Red Sea');
    await expect(page.getByRole('status').filter({ hasText: '12 of 60 fixture rows shown · 48 hidden by the filter' })).toBeVisible();
    // select exactly the rows shown — the label says only these rows
    await region.getByRole('checkbox', { name: /Select the 12 rows shown \(only these rows/ }).check();
    await expect(page.getByRole('status').filter({ hasText: /^12 selected · \d+ included · \d+ excluded · 0 hidden by the filter · 0 changed since selection$/ })).toBeVisible();
    await page.getByLabel('Filter Catalogue fixture table').fill('');
    await expect(page.getByRole('status').filter({ hasText: '60 of 60 fixture rows shown · 12 selected' })).toBeVisible();
    // the export: the displayed rows, labelled (scope, classification ceiling, as-of, count)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export the 60 displayed fixture rows (CSV)' }).click()]);
    const text = await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8');
    expect(text.split('\r\n').slice(0, 5)).toEqual([
      '# Catalogue fixture table', '# scope: catalogue fixture (no tenant, no domain)', '# classification ceiling: none — SYNTHETIC fixture rows',
      '# as of: 2026-10-17T00:00:00.000Z', '# rows: 60 (the rows displayed to this principal under the current filter — authorized by the read, nothing more)',
    ]);
    await page.getByRole('combobox', { name: 'Group by' }).first().selectOption('corridor');
    await expect(region.getByRole('rowheader').or(region.getByRole('columnheader', { name: /Corridor: Red Sea — 12 fixture rows/ })).first()).toBeVisible();
    await page.getByRole('main').getByRole('combobox', { name: 'Density', exact: true }).first().selectOption('compact');   // B81: the table's own (the shell carries "Display density")
    await shot(page, '01-table');
  });

  test('the windowed keyboard grid: 100,000 rows, a bounded DOM, arrows move focus, the row count is the whole set', async ({ page }) => {
    const grid = page.getByRole('grid', { name: /Windowed fixture grid/ });
    await expect(grid).toHaveAttribute('aria-rowcount', '100001');
    expect(await grid.getByRole('row').count()).toBeLessThan(80);
    await grid.locator('[data-pos="0:0"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(grid.locator('[data-pos="1:0"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(grid.locator('[data-pos="1:1"]')).toBeFocused();
    await page.keyboard.press('PageDown');
    await page.keyboard.press('PageDown');
    await expect(page.locator(':focus')).toHaveAttribute('data-pos', /^1[5-9]:1$|^2\d:1$/);
    await page.keyboard.press('Control+End');
    await expect(page.locator(':focus')).toHaveAttribute('data-pos', '100000:5');
    await expect(page.locator(':focus')).toBeVisible();
    await shot(page, '02-grid');
  });

  test('the empty states never imply a zero world (PAT-28)', async ({ page }) => {
    await expect(page.getByRole('note', { name: 'Empty fixture table: nothing shown' })).toContainText('absence of records is not absence of events');
    await expect(page.getByRole('note', { name: 'Filtered fixture table: nothing shown' })).toContainText('the current filter hides 6 of them');
  });

  test('BulkSelection states included / excluded with reasons / hidden / changed / missing BEFORE the action; outcomes never success by inference', async ({ page }) => {
    const bulk = page.getByRole('region', { name: 'Bulk selection — fixture contracts' });
    await expect(bulk.getByRole('status').first()).toHaveText('5 selected · 1 included · 2 excluded · 1 hidden by the filter · 1 changed since selection · 1 no longer in this read');
    await expect(bulk).toContainText('live-mode contract — act on it alone');
    await expect(bulk.getByRole('button', { name: 'Review the fixture suspension' })).toBeDisabled();
    await expect(bulk.getByRole('list', { name: 'Why the action is not available' })).toContainText('changed since selection');
    await expect(bulk).toContainText('UNKNOWN — re-read before acting again');
    await expect(bulk).not.toContainText('COMMITTED');
  });

  test('Dialog: deterministic focus, Escape is not consent and focus returns; one modal at a time; the digest gate', async ({ page }) => {
    const opener = page.getByRole('button', { name: 'Open a plain dialog' });
    await opener.click();
    const dlg = page.getByRole('dialog', { name: 'A plain fixture dialog' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByRole('heading', { name: 'A plain fixture dialog' })).toBeFocused();
    await dlg.getByRole('button', { name: 'Try to open a second dialog' }).click();
    await expect(dlg.getByRole('status')).toContainText('is open — finish or close it first (one blocking dialog at a time)');
    await expect(page.getByRole('dialog', { name: 'A second fixture dialog' })).toHaveCount(0);
    // Tab stays inside the modal
    for (let i = 0; i < 6; i += 1) { await page.keyboard.press('Tab'); expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.getByText('Last close: escape · consent false')).toBeVisible();

    await page.getByRole('button', { name: 'Open a consequential dialog' }).click();
    const c = page.getByRole('dialog', { name: 'A consequential fixture dialog' });
    const act = c.getByRole('button', { name: 'Run the fixture action' });
    await expect(act).toBeDisabled();
    await expect(c.getByRole('list', { name: 'Why the action is not available' })).toContainText('acknowledge the digest above');
    await c.getByRole('checkbox', { name: /I have reviewed this digest/ }).check();
    await expect(act).toBeEnabled();
    await c.getByRole('button', { name: 'Change the digest (fixture)' }).click();
    await expect(act).toBeDisabled();
    await expect(c.getByRole('list', { name: 'Why the action is not available' })).toContainText('the digest changed while this dialog was open');
    await c.getByRole('checkbox', { name: /I have reviewed this digest/ }).check();
    await act.click();
    await expect(c.getByRole('status')).toContainText('REFUSED — a SYNTHETIC catalogue refusal; no server was called');
    await shot(page, '03-consequential');
    await c.getByRole('button', { name: 'Cancel — do nothing' }).click();
    await expect(page.getByText('Last close: cancel · consent false')).toBeVisible();
  });

  test('a draft survives a dismissal and is offered back; a discard clears it', async ({ page }) => {
    await page.getByRole('button', { name: 'Open a dialog with a draft' }).click();
    const d = page.getByRole('dialog', { name: 'A fixture dialog with a draft' });
    await d.getByLabel('Fixture note').fill('half-typed SYNTHETIC note');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Last close: escape · consent false · draft kept')).toBeVisible();
    await page.getByRole('button', { name: 'Open a dialog with a draft' }).click();
    await expect(d.getByLabel('Fixture note')).toHaveValue('half-typed SYNTHETIC note');
    await d.getByRole('button', { name: 'Discard the draft' }).click();
    await page.getByRole('button', { name: 'Open a dialog with a draft' }).click();
    await expect(d.getByLabel('Fixture note')).toHaveValue('');
    await page.keyboard.press('Escape');
  });

  test('drawer, popover and disclosure: supporting layers, focus returned, authority and uncertainty never folded away', async ({ page }) => {
    const opener = page.getByRole('button', { name: 'Open a drawer' });
    await opener.click();
    const drawer = page.getByRole('dialog', { name: 'A fixture drawer' });
    await expect(drawer.getByRole('heading', { name: 'A fixture drawer' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
    const trig = page.getByRole('button', { name: 'Open a popover' });
    await trig.click();
    await expect(trig).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('dialog', { name: 'Fixture popover' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trig).toBeFocused();
    await expect(trig).toHaveAttribute('aria-expanded', 'false');
    const closed = page.locator('details').filter({ hasText: 'A disclosure with its authority and uncertainty' });
    await expect(closed.locator('summary')).toContainText('Authority: Observational — a SYNTHETIC publisher');
    await expect(closed.locator('summary')).toContainText('Uncertainty: ±12 % (80 % interval, fixture)');
    await expect(page.locator('details').filter({ hasText: 'A disclosure missing both' }).locator('summary')).toContainText('Authority: not stated');
  });

  test('inspection: tree grid keys, metric states, summary limits, common-basis ranking, aligned diff', async ({ page }) => {
    const tree = page.getByRole('treegrid', { name: 'Corridor tree (SYNTHETIC)' });
    const red = tree.getByRole('row', { name: /Red Sea/ });
    await expect(red).toHaveAttribute('aria-expanded', 'true');
    await red.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(red).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(tree.getByRole('row', { name: /Bab el-Mandeb/ })).toBeFocused();
    await expect(page.getByRole('figure', { name: /Port dwell \(fixture\): UNKNOWN/ })).toBeVisible();
    await expect(page.getByRole('figure', { name: /Contract value \(fixture\): WITHHELD/ })).toBeVisible();
    await expect(page.getByRole('list', { name: /A single sample \(SYNTHETIC\): what the summary does not compute/ })).toContainText('spread not computed (n < 2)');
    const matrix = page.getByRole('region', { name: 'Reroute options (SYNTHETIC)' });
    await expect(matrix.getByRole('row', { name: /Cost/ })).toContainText('★ BEST (lower is better)');
    await expect(matrix.getByRole('row', { name: /Delay/ })).toContainText('NOT ON A COMMON BASIS');
    await expect(matrix.getByRole('row', { name: /Delay/ })).not.toContainText('★ BEST');
    await expect(matrix).toContainText('⚑ DISSENT');
    const diff = page.getByRole('region', { name: 'Option v1 → v2 (SYNTHETIC)' });
    await expect(diff.getByRole('row', { name: /Title/ })).toContainText('± CHANGED');
    await expect(page.getByText('1 changed · 1 added · 1 removed · 2 unchanged (hidden)')).toBeVisible();
  });

  test('foundation: the focus ring and keyboard scroll area under forced colours and at 200 % zoom (CMP-001, CMP-003); print keeps the content', async ({ page }) => {
    const button = page.getByRole('button', { name: 'A focusable button' });
    await button.focus();
    expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    const scroll = page.getByRole('region', { name: 'Keyboard-scrollable wide fixture' });
    await scroll.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await page.emulateMedia({ forcedColors: 'active' });
    await button.focus();
    expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await expect(page.getByRole('region', { name: 'Surface raised critical' })).toContainText('CRITICAL');
    await shot(page, '04-forced-colors');
    await page.emulateMedia({ forcedColors: 'none' });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await button.focus();
    await expect(button).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await shot(page, '05-zoom-200');
    await page.evaluate(() => { document.documentElement.style.zoom = ''; });
    expect(overflow, 'the page itself scrolls sideways at 200 % zoom').toBeLessThanOrEqual(1);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: /Export the 60 displayed/ })).toBeHidden();
    await expect(page.getByRole('region', { name: 'Catalogue fixture table' })).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
  });
});
