/**
 * CP-6 B81 §LY-G — THE LAYOUT WALK (F-P7-E-04: GLB-23 the device matrix, REL-15 the compositions, BP-01…05, UX-14-003/004/005,
 * UX-ADR-013, REG-01…08, DEN-01…03, UX-19-003/005). A DEMO WALK, not a hosted gate case: it runs through playwright.demo.config.ts only,
 * over the layout catalogue (/admin/governance/design/layout — SYNTHETIC fixtures), reading the contract through the ACCESSIBILITY TREE and
 * the boxes: at 390 / 800 / 1024 / 1440 / 1920 / 2560, at 200 % zoom (a 1440 px screen at device scale 2 = 720 CSS px), in portrait and
 * landscape, under forced colours — nothing protected hidden, one reading order, the inspector behind its named opener where it does not
 * fit, no sideways page scroll, the consequential control 44 px at every density. CONSTRUCTION evidence; it records no acceptance (H3,
 * through B111's recording path).
 *
 * Sign-in: by default the act's Design System Authority persona (EYE_B81_LAYOUT_USER, default l.haddad; password EYE_TEST_ADMIN_PASSWORD).
 * With EYE_B80_FIXTURE_SESSION=1 the walk places a SYNTHETIC session in sessionStorage (the admin shell only checks that one exists); the
 * density switch's read is then refused by the API (or the API is unreachable) and the walk asserts the refusal path instead: the default
 * applies and the switch is disabled with the server's words. Screenshots go to EYE_SHOTS (b81-lyg-*.png).
 */
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const expect = baseExpect.configure({ timeout: 20_000 });
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `b81-lyg-${name}.png`), fullPage: false });
const FIXTURE = process.env['EYE_B80_FIXTURE_SESSION'] === '1';
const READING_ORDER = ['context', 'status', 'authority', 'primary', 'action', 'evidence', 'inspector'];
const OPENER = /^Open the inspector — Bab el-Mandeb corridor reroute \(SYNTHETIC\) selected · version 2$/;

async function signIn(page: Page): Promise<void> {
  if (FIXTURE) {
    await page.goto('/login');
    await page.evaluate(() => sessionStorage.setItem('eye.session', JSON.stringify({ principalId: 'synthetic-catalogue-walker', accessToken: 'synthetic-not-a-token', scope: { scope: 'PLATFORM', tenantId: null, domainId: null } })));
    return;
  }
  const pw = process.env['EYE_TEST_ADMIN_PASSWORD'];
  if (pw === undefined || pw === '') throw new Error('EYE_TEST_ADMIN_PASSWORD is required (or EYE_B80_FIXTURE_SESSION=1)');
  await page.goto('/login');
  await page.getByLabel('Username').fill(process.env['EYE_B81_LAYOUT_USER'] ?? 'l.haddad');
  await page.getByLabel('Password').fill(pw);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function open(page: Page): Promise<void> {
  await page.goto('/admin/governance/design/layout');
  await expect(page.getByRole('heading', { name: 'Layout, density and regions', level: 1 })).toBeVisible();
}
const composition = (page: Page) => page.getByRole('group', { name: 'Specimen composition: the corridor reroute package (SYNTHETIC)' });
const overflowsSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
async function regionOrder(page: Page): Promise<string[]> {
  return composition(page).evaluate((el) => [...el.querySelectorAll('[data-region], .eye-region-deferred')].map((e) => (e as HTMLElement).dataset['region'] ?? 'deferred:inspector'));
}
async function signedInPage(browser: Browser, viewport: { width: number; height: number }, deviceScaleFactor = 1): Promise<Page> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await ctx.newPage();
  await signIn(page);
  await open(page);
  return page;
}

/** The device matrix (GLB-23, REL-15): width → the class the composition must lay out in, and whether the inspector fits. */
const MATRIX: Array<{ name: string; viewport: { width: number; height: number }; scale?: number; cls: string; inspector: 'opener' | 'shown' }> = [
  { name: '390-portrait', viewport: { width: 390, height: 844 }, cls: 'BP-01', inspector: 'opener' },
  { name: '844-landscape', viewport: { width: 844, height: 390 }, cls: 'BP-02', inspector: 'opener' },
  { name: '800', viewport: { width: 800, height: 900 }, cls: 'BP-02', inspector: 'opener' },
  { name: '1024', viewport: { width: 1024, height: 900 }, cls: 'BP-03', inspector: 'shown' },
  { name: '1440', viewport: { width: 1440, height: 900 }, cls: 'BP-04', inspector: 'shown' },
  { name: '1440-zoom-200', viewport: { width: 720, height: 450 }, scale: 2, cls: 'BP-02', inspector: 'opener' },
  { name: '1920', viewport: { width: 1920, height: 1080 }, cls: 'BP-05', inspector: 'shown' },
  { name: '2560', viewport: { width: 2560, height: 1440 }, cls: 'BP-05', inspector: 'shown' },
];

test.describe('B81 §LY-G — the layout walk (device matrix, regions, density, compact navigation)', () => {
  for (const m of MATRIX) {
    test(`${m.name}: ${m.cls}; nothing protected hidden; one reading order; no sideways page scroll`, async ({ browser }) => {
      const page = await signedInPage(browser, m.viewport, m.scale ?? 1);
      const comp = composition(page);
      await expect(comp).toHaveAttribute('data-layout-class', m.cls);
      for (const name of ['Context', 'Status', 'Authority', 'Primary task', 'Actions', 'Evidence']) await expect(comp.getByRole('region', { name, exact: true })).toBeVisible();
      if (m.inspector === 'opener') {
        await expect(comp.getByRole('region', { name: 'Inspector', exact: true })).toHaveCount(0);
        await expect(comp.getByRole('button', { name: OPENER })).toBeVisible();
      } else {
        await expect(comp.getByRole('region', { name: 'Inspector', exact: true })).toBeVisible();
      }
      const order = await regionOrder(page);
      expect(order.map((r) => r.replace('deferred:', ''))).toEqual(READING_ORDER);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      expect(await overflowsSideways(page), `the page scrolls sideways at ${m.name}`).toBe(false);
      await shot(page, m.name);
      await page.context().close();
    });
  }

  test('BP-01: the inspector opens in a dialog named with its selection and version; Escape returns the focus to its opener', async ({ browser }) => {
    const page = await signedInPage(browser, { width: 390, height: 844 });
    const opener = composition(page).getByRole('button', { name: OPENER });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: /^Inspector — Bab el-Mandeb corridor reroute \(SYNTHETIC\) selected · version 2$/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Inspector \(specimen\): Bab el-Mandeb corridor reroute \(SYNTHETIC\) · version 2 · proposed/)).toBeVisible();
    await shot(page, 'inspector-dialog');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await page.context().close();
  });

  test('REFLOW (UX-14-003/005): wide → compact announces the change in words; the selection is still named', async ({ browser }) => {
    const page = await signedInPage(browser, { width: 1440, height: 900 });
    await expect(composition(page)).toHaveAttribute('data-layout-class', 'BP-04');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(composition(page)).toHaveAttribute('data-layout-class', 'BP-01');
    await expect(composition(page).getByRole('status').filter({ hasText: /^Layout wide \(BP-04\) → compact \(BP-01\) · moved behind a named opener: inspector · Bab el-Mandeb corridor reroute \(SYNTHETIC\) selected · version 2$/ })).toHaveCount(1);
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(composition(page).getByRole('status').filter({ hasText: /shown again: inspector/ })).toHaveCount(1);
    await page.context().close();
  });

  test('DEN-01…03: ordinary controls follow the density (44 / 36 / 28 px); the consequential control is 44 px at every density (LAY-003)', async ({ browser }) => {
    const page = await signedInPage(browser, { width: 1440, height: 900 });
    for (const [name, px] of [['Strategic', 44], ['Operational', 36], ['Inspection', 28]] as const) {
      const spec = page.getByRole('region', { name: `${name} density specimen` });
      const ordinary = await spec.getByRole('button', { name: `Filter (${name.toLowerCase()})` }).boundingBox();
      const consequential = await spec.getByRole('button', { name: /^Approve specimen/ }).boundingBox();
      expect(Math.round(ordinary!.height), `${name} ordinary control`).toBe(px);
      expect(Math.round(consequential!.height), `${name} consequential control`).toBe(44);
    }
    await shot(page, 'densities');
    await page.context().close();
  });

  test('the density switch: the server\'s value until it answers; a refused read says so and the default applies', async ({ browser }) => {
    const page = await signedInPage(browser, { width: 1440, height: 900 });
    // the page's own switch (in the main region) — the shell header carries a compact one of its own, named the same
    const main = page.locator('#eye-main');
    const select = main.getByRole('combobox', { name: 'Density' });
    await expect(select).toBeVisible();
    if (FIXTURE) {
      await expect(main.getByText(/your saved choice could not be read — the default applies/).first()).toBeVisible();
      await expect(select).toBeDisabled();
    } else {
      await expect(main.getByText(/in force: (strategic|operational|inspection) \(/).first()).toBeVisible();
      await expect(select).toBeEnabled();
    }
    await page.context().close();
  });

  test('BP-01 compact navigation (specimen): the current place is visible and current; More lists the rest; Escape closes it', async ({ browser }) => {
    const page = await signedInPage(browser, { width: 390, height: 844 });
    const nav = page.getByRole('navigation', { name: 'Specimen places' });
    await expect(nav.getByRole('link', { name: 'Exports (specimen)' })).toHaveAttribute('aria-current', 'page');
    const more = nav.getByRole('button', { name: 'More (4)' });
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await more.click();
    await expect(nav.getByRole('list', { name: 'More places' }).getByRole('link')).toHaveCount(4);
    await page.keyboard.press('Escape');
    await expect(more).toHaveAttribute('aria-expanded', 'false');
    await expect(more).toBeFocused();
    // the shell's own navigation is never lost: exactly ONE navigation named "workspace" is exposed — the rail, or (once the shell renders
    // the compact navigation) the bottom navigation in its place
    await expect(page.getByRole('navigation', { name: 'workspace', exact: true })).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'workspace', exact: true })).toBeVisible();
    await page.emulateMedia({ forcedColors: 'active' });
    await shot(page, 'compact-forced-colours');
    await page.context().close();
  });
});
