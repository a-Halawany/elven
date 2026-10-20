/**
 * CP-6 B82 — THE VISUALIZATION WALK (F-P7-E-21; GLB-07, UX-ADR-015/016, REL-17): scene 3 of the B82 map §8 (the corridor map and its flows,
 * the probability band of transit delay, the scenario fan for the Regensburg line) and EVERY visual kind of the design catalogue, at 390 / 800 /
 * 1024 / 1440 / 1920 / 2560 px, at 200 % zoom and in forced colours. Each chart's TABLE ALTERNATIVE is read through the ACCESSIBILITY TREE
 * (its region by name, role table, the caption, the column headers) — the screen-reader check of DESIGN D2; testing with human assistive-
 * technology users stays B108's. A DEMO WALK, not a hosted gate case (playwright.demo.config.ts only).
 *
 * Run after scripts/phase6/act-b82.mjs, with its env lines (EYE_B82_*) and EYE_TEST_ADMIN_PASSWORD; screenshots go to EYE_SHOTS as
 * b82-viz-*.png. The walk WRITES NOTHING (the CSV export is a download of the displayed rows). Every figure is SYNTHETIC; the sankey and the
 * choropleth are catalogue specimens only (D13 / Q4), and say so. Demonstrated operation, never an acceptance.
 *
 * THE FLOW MAP: /graph/geo draws it only after the page has read each declared chokepoint's PortWatch transit series — a read that assembles
 * the whole series from its evidence (minutes on the demonstration; the act's rehearsal measured 511 s for one series). The walk waits up to
 * EYE_B82_FLOWMAP_WAIT_MS (default 30 minutes) for it. The flow map is read by N. Eriksen (a forecast owner reads the series; the data steward
 * who declares the register does not — her page states the refusal in the server's words, which the walk asserts).
 */
import { expect as baseExpect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const expect = baseExpect.configure({ timeout: 30_000 });
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: join(SHOTS, `b82-viz-${name}.png`), fullPage });
const env = (k: string, d: string) => process.env[k] ?? d;
function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required (the act's env line)`);
  return v;
}
const FLOWMAP_WAIT = Number(env('EYE_B82_FLOWMAP_WAIT_MS', String(30 * 60_000)));
const WIDTHS = [390, 800, 1024, 1440, 1920, 2560];
/** The 36 visual kinds of the library (lib/b82-seams.ts CHART_KINDS) — every one must be in the catalogue, drawn, with its alternative. */
const KINDS = ['time_series', 'event_timeline', 'probability_band', 'horizon_matrix', 'distribution', 'calibration_plot', 'waterfall', 'variance_bridge',
  'correlation_matrix', 'scatter', 'control_chart', 'scenario_fan', 'scenario_comparison', 'sensitivity_tornado', 'risk_matrix', 'opportunity_portfolio', 'health_decomposition',
  'run_comparison', 'twin_state_diff', 'option_matrix', 'evidence_coverage', 'status_board', 'alert_queue', 'audit_timeline', 'graph', 'knowledge_graph', 'strategy_graph',
  'dependency_network', 'provenance_graph', 'hierarchy_tree', 'treemap', 'sankey', 'map', 'geospatial_map', 'flow_map', 'choropleth'];

async function signIn(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(required('EYE_TEST_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function signedIn(browser: Browser, username: string, viewport = { width: 1440, height: 900 }, deviceScaleFactor = 1): Promise<Page> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await ctx.newPage();
  await signIn(page, username);
  return page;
}
const oneH1 = async (page: Page) => { await expect(page.locator('h1')).toHaveCount(1); };
/** No sideways PAGE scroll (UX-19-003): wide regions and canvases own their horizontal scroll. */
const noSidewaysScroll = async (page: Page, where: string) => {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, `${where}: the page scrolls sideways (${sw} > ${cw})`).toBeLessThanOrEqual(cw + 1);
};
/** A figure's TABLE ALTERNATIVE read through the accessibility tree: the region by name, the table by name, its caption, its column headers. */
async function readAlternative(figure: Locator): Promise<{ title: string; columns: number; rows: number }> {
  const table = figure.getByRole('table', { name: /^Table alternative: / }).first();
  await expect(table).toBeAttached();
  const name = (await table.getAttribute('aria-label')) ?? (await table.locator('caption').first().textContent()) ?? '';
  const title = name.replace(/^Table alternative: /, '');
  await expect(figure.getByRole('region', { name: `Table alternative: ${title}` }).first()).toBeAttached();
  await expect(table.locator('caption').first()).toHaveText(`Table alternative: ${title}`);
  const columns = await table.getByRole('columnheader').count();
  expect(columns, `${title}: column headers`).toBeGreaterThan(0);
  const rows = await table.getByRole('row').count();
  return { title, columns, rows };
}
const figureOf = (page: Page, kind: string) => page.locator(`figure[data-chart-kind="${kind}"][data-chart-state="ready"]`);

test.describe('CP-6 B82 — the visualization walk: the corridor map, the band, the fan, and every kind in the catalogue', () => {
  test('B82-3 THE CORRIDOR MAP (/graph/geo): the declared references on a graticule, EPSG:4326 stated, no tiles; the flow map\'s width legend, period and source; each table alternative read by role', async ({ browser }) => {
    test.setTimeout(FLOWMAP_WAIT + 180_000);
    const page = await signedIn(browser, env('EYE_B82_STEWARD', 'f.aydin'));
    const tiles: string[] = [];
    page.on('request', (r) => { if (/tile|basemap|openstreetmap|mapbox|arcgisonline/i.test(r.url())) tiles.push(r.url()); });
    await page.goto('/graph/geo');
    await expect(page.getByRole('heading', { name: 'Geographic references', level: 1 })).toBeVisible();
    await oneH1(page);
    await expect(page.getByText(/typed by a named data steward in EPSG:4326/).first()).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /\d+ active and \d+ retired reference\(s\) listed/ })).toBeVisible();
    const map = figureOf(page, 'geospatial_map').first();
    await expect(map).toBeVisible();
    await expect(map.locator('figcaption')).toContainText('Corridor map — declared references');
    const alt = await readAlternative(map);
    expect(alt.rows).toBeGreaterThanOrEqual(1 + 8);                                                                     // the header row + the 8 declared references
    await expect(map.getByRole('table').first()).toContainText('Bab el-Mandeb');
    await expect(map.getByRole('table').first()).not.toContainText('mistyped');                                         // the retired site is never drawn
    await expect(page.getByRole('region', { name: 'The register' })).toContainText('Regensburg site (NORDWERK)');
    await expect(page.getByRole('alert').filter({ hasText: /The transit series could not be listed: HTTP 403 EYE-AUT-001/ })).toBeVisible();   // the steward reads no series: said
    await shot(page, '01-corridor-map', true);
    await page.context().close();
    // THE FLOW MAP — drawn once the page has read the chokepoints' transit series (the slow read, waited for), by a reader of the series
    const reader = await signedIn(browser, env('EYE_B82_FORECASTER', 'n.eriksen'));
    reader.on('request', (r) => { if (/tile|basemap|openstreetmap|mapbox|arcgisonline/i.test(r.url())) tiles.push(r.url()); });
    await reader.goto('/graph/geo');
    await expect(figureOf(reader, 'geospatial_map').first()).toBeVisible();
    const flow = figureOf(reader, 'flow_map').first();
    await expect(flow).toBeVisible({ timeout: FLOWMAP_WAIT });
    await expect(flow.locator('figcaption')).toContainText('Corridor flows — transits by route');
    await expect(flow).toContainText(/the daily points .* to .* \(the last 30 of each series read\)/);                  // the period
    await expect(flow).toContainText(/portwatch:chokepoint\d:n_total/);                                                 // the source
    await expect(flow.getByRole('list', { name: /legend/ }).first()).toBeVisible();                                     // the width legend
    const falt = await readAlternative(flow);
    expect(falt.rows).toBeGreaterThanOrEqual(1 + 2);                                                                    // the two routes
    expect(tiles, 'no tile or basemap request').toEqual([]);
    await shot(reader, '02-flow-map', true);
    await reader.context().close();
  });

  test('B82-3 THE PROBABILITY BAND: the transit forecast\'s band with its validation state stated and its cutoff; the alternative read by role; the CSV downloads the displayed rows', async ({ browser }) => {
    const page = await signedIn(browser, env('EYE_B82_FORECASTER', 'n.eriksen'));
    await page.goto(`/prediction/forecasts/${required('EYE_B82_FORECAST')}`);
    await oneH1(page);
    const band = figureOf(page, 'probability_band').first();
    await expect(band).toBeVisible();
    await expect(band).toContainText(/UNVALIDATED/);                                                                    // the validation state, stated
    await expect(band).toContainText(/cutoff/i);
    const alt = await readAlternative(band);
    expect(alt.rows).toBeGreaterThan(1);
    const exportButton = band.getByRole('button', { name: /^Export the \d+ displayed .* \(CSV\)$/ }).first();
    const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
    const csv = readFileSync((await download.path())!, 'utf8');
    expect(csv.split('\r\n')[0]).toBe(`# ${alt.title}`);                                                                  // the export names the chart
    expect(csv).toMatch(/# rows: \d+ \(the rows displayed to this principal/);
    await shot(page, '03-probability-band', true);
    await page.context().close();
  });

  test('B82-3 THE SCENARIO FAN: the every-kind branches with their spread, no single highlighted destiny, the branch states marked; the alternative read by role', async ({ browser }) => {
    const page = await signedIn(browser, env('EYE_B82_FORECASTER', 'n.eriksen'));
    await page.goto(`/prediction/scenarios/anatomy?scenario=${required('EYE_B82_SCENARIO')}`);
    await oneH1(page);
    await expect(page.getByRole('heading', { name: 'The branches fanned', level: 2 })).toBeVisible();
    const fan = figureOf(page, 'scenario_fan').first();
    await expect(fan).toBeVisible();
    const alt = await readAlternative(fan);
    expect(alt.rows).toBeGreaterThanOrEqual(1 + 8);                                                                     // every kind: 8 branches
    for (const k of ['Baseline', 'Upside', 'Downside', 'Disruption', 'Stress', 'Adversarial', 'Counterfactual', 'Blockade']) await expect(fan.getByRole('table').first()).toContainText(k);
    await expect(fan).not.toContainText(/most likely path/i);                                                           // no single destiny
    await shot(page, '04-scenario-fan', true);
    await page.context().close();
  });

  test('B82-6 THE CATALOGUE: every visual kind in a ChartFrame with its declarations, its legend and its table alternative; a spec missing a declaration is refused, not drawn', async ({ browser }) => {
    const page = await signedIn(browser, env('EYE_B82_DSA', 'l.haddad'));
    await page.goto('/admin/governance/design/catalogue');
    await expect(page.getByRole('heading', { name: 'Component catalogue', level: 1 })).toBeVisible();
    await oneH1(page);
    const missing: string[] = [];
    for (const kind of KINDS) {
      const f = figureOf(page, kind).first();
      if (await f.count() === 0) { missing.push(kind); continue; }
      await expect(f.getByRole('definition').first()).toBeAttached();                                                    // the declarations (basis, time, units, sources, uncertainty)
      await expect(f.getByRole('term', { name: 'Basis' }).or(f.getByText('Basis', { exact: true })).first()).toBeAttached();
      await readAlternative(f);
    }
    expect(missing, 'kinds absent from the catalogue').toEqual([]);
    for (const s of ['sankey', 'choropleth']) await expect(figureOf(page, s).first().locator('figcaption')).toContainText('SYNTHETIC specimen');
    const refused = page.locator('figure.eye-cf--refused');
    expect(await refused.count()).toBeGreaterThanOrEqual(1);
    await expect(refused.first().getByRole('note')).toContainText(/not drawn/i);
    await expect(refused.first().locator('[role="img"]')).toHaveCount(0);                                               // refused: nothing drawn
    await shot(page, '05-catalogue');
    await page.context().close();
  });

  test('THE VIEWPORT MATRIX: 390 / 800 / 1024 / 1440 / 1920 / 2560 px — no sideways page scroll; every alternative reachable by keyboard', async ({ browser }) => {
    test.setTimeout(8 * 60_000);
    for (const w of WIDTHS) {
      const page = await signedIn(browser, env('EYE_B82_DSA', 'l.haddad'), { width: w, height: 900 });
      await page.goto('/admin/governance/design/catalogue');
      await expect(page.getByRole('heading', { name: 'Component catalogue', level: 1 })).toBeVisible();
      await expect(figureOf(page, 'flow_map').first()).toBeVisible();
      await noSidewaysScroll(page, `the catalogue at ${w} px`);
      // an alternative's scroll region takes the keyboard (tabindex 0) — reachable without a pointer
      const region = figureOf(page, 'probability_band').first().getByRole('region', { name: /^Table alternative: / }).last();
      await region.focus();
      await expect(region).toBeFocused();
      await shot(page, `06-catalogue-${w}`);
      await page.context().close();
      const geo = await signedIn(browser, env('EYE_B82_STEWARD', 'f.aydin'), { width: w, height: 900 });
      await geo.goto('/graph/geo');
      await expect(figureOf(geo, 'geospatial_map').first()).toBeVisible();
      await noSidewaysScroll(geo, `/graph/geo at ${w} px`);
      await shot(geo, `07-geo-${w}`);
      await geo.context().close();
    }
  });

  test('200 % ZOOM AND FORCED COLOURS: the declarations wrap, series stay told apart by dash and marker (no colour alone), the alternatives stay readable', async ({ browser }) => {
    test.setTimeout(4 * 60_000);
    // 200 % zoom of a 1440-px window: the layout viewport is 720 CSS px at device scale 2
    const zoom = await signedIn(browser, env('EYE_B82_DSA', 'l.haddad'), { width: 720, height: 450 }, 2);
    await zoom.goto('/admin/governance/design/catalogue');
    await expect(zoom.getByRole('heading', { name: 'Component catalogue', level: 1 })).toBeVisible();
    await noSidewaysScroll(zoom, 'the catalogue at 200 %');
    const band = figureOf(zoom, 'probability_band').first();
    await readAlternative(band);
    await shot(zoom, '08-zoom-200');
    await zoom.context().close();
    const fc = await signedIn(browser, env('EYE_B82_DSA', 'l.haddad'));
    await fc.emulateMedia({ forcedColors: 'active' });
    await fc.goto('/admin/governance/design/catalogue');
    await expect(fc.getByRole('heading', { name: 'Component catalogue', level: 1 })).toBeVisible();
    // every legend entry names its dash pattern (and marker): a series is told apart without colour; entries of one legend are pairwise distinct
    const legends = fc.locator('ul.eye-cf-legend');
    const n = await legends.count();
    expect(n).toBeGreaterThan(5);
    for (let i = 0; i < n; i += 1) {
      const items = legends.nth(i).locator('li');
      const keys = await items.evaluateAll((els) => els.map((e) => `${e.getAttribute('data-dash')}|${e.getAttribute('data-marker')}|${e.textContent ?? ''}`));
      for (const k of keys) expect(k.split('|')[0], 'a legend entry without a dash pattern').not.toBe('null');
      expect(new Set(keys).size).toBe(keys.length);
    }
    await readAlternative(figureOf(fc, 'scenario_fan').first());
    await shot(fc, '09-forced-colours');
    await fc.context().close();
  });
});
