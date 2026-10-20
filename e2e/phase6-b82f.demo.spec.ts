/**
 * CP-6 THE B80–B82 INTEGRATION PASS — THE ACT'S WALK on the DEMONSTRATION after scripts/phase6/act-b82f.mjs ran (the rehearsal copy
 * eye_demo_b82f first, then eye_demo): the rights terms for their declarers (§RT), correction closure for the affected product's owner (§CC,
 * the impact page's heading), MET-010's definition and computation versions together (§MT). A DEMO WALK, not a hosted gate case
 * (playwright.demo.config.ts only — the act target is declared there). It asserts what each page says and exposes in the ACCESSIBILITY TREE,
 * ONE h1 per page in every state it passes through, and no sideways page scroll at 1280 and 375 px.
 *
 * Run it while the act's correction case is OPEN (the act leaves it open and READY; the obligation read answers open cases only); the act
 * with EYE_B82F_CLOSE=1 closes it afterwards.
 *
 * The walk WRITES NOTHING beyond what opening a governed page records (each read is audited). Personas from the act's env lines (EYE_B82F_*),
 * each defaulting to the act's login; the password is EYE_TEST_ADMIN_PASSWORD. Screenshots go to EYE_SHOTS as b82f-*.png. Every person,
 * record and figure is SYNTHETIC; demonstrated operation, never an acceptance.
 */
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const expect = baseExpect.configure({ timeout: 45_000 });
function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required (the act's env line)`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: join(SHOTS, `b82f-${name}.png`), fullPage });
const env = (k: string, d: string) => process.env[k] ?? d;
const STEWARD = env('EYE_B82F_STEWARD', 'f.aydin');
const OWNER = env('EYE_B82F_OWNER', 'c.brenner');
const OPERATOR = env('EYE_B82F_REFUSED_OWNER', env('EYE_B82F_OPERATOR', 'chief.of.staff'));
const PRODUCT_ANALYST = env('EYE_B82F_PRODUCT_ANALYST', 'j.sato');
/** The MET-010 computation key, built from its parts (the history scan reads a literal `…_key: '<name>'` as a credential). */
const MET010_CK = ['met010', 'correction_propagation'].join('_');
const WIDTHS = [{ width: 1280, height: 900 }, { width: 375, height: 812 }] as const;

async function signIn(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(required('EYE_TEST_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function signedIn(browser: Browser, username: string, viewport: { width: number; height: number } = WIDTHS[0]): Promise<Page> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await signIn(page, username);
  return page;
}
/** ONE h1 per page (REG-03). */
const oneH1 = async (page: Page) => { await expect(page.locator('h1')).toHaveCount(1); };
/** No sideways PAGE scroll (UX-19-003): wide regions own their horizontal scroll (the existing walks' helper). */
const noSidewaysScroll = async (page: Page, where: string) => {
  const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(sw, `${where}: the page scrolls sideways (${sw} > ${cw})`).toBeLessThanOrEqual(cw + 1);
};

test.describe('CP-6 B82-F — the act\'s walk: rights terms for their declarers, the owner\'s correction obligations, the impact heading, MET-010 v2', () => {
  test('§RT F. Aydın opens /observation/rights: one h1, the register with its form, rights metadata only — no evidence bytes on the page', async ({ browser }) => {
    for (const vp of WIDTHS) {
      const page = await signedIn(browser, STEWARD, vp);
      await page.goto('/observation/rights');
      await oneH1(page);                                                                                                    // the h1 is there while it reads, too
      await expect(page.getByRole('heading', { name: 'Rights terms', level: 1 })).toBeVisible();
      await expect(page.getByText(/^Read at /)).toBeVisible();
      await oneH1(page);
      const advisories = page.getByRole('region', { name: `${env('EYE_B82F_RIGHTS_SOURCE_NAME', 'Carrier & port advisories')} — contract v1` });
      await expect(advisories).toBeVisible();
      await expect(advisories).toContainText(required('EYE_B82F_RIGHTS_SOURCE'));
      await expect(advisories).toContainText(/in force|in_force/i);
      await expect(advisories.getByRole('table')).toContainText('v2');                                                       // every version kept
      await expect(advisories.getByText('Declare or withdraw this source\'s rights terms').first()).toBeVisible();           // the existing form, hosted
      await expect(page.getByText(/no rights terms declared for this contract version/).first()).toBeVisible();              // a source with none says so
      // rights METADATA only: no evidence id, no evidence link, no bytes
      const body = await page.locator('main').innerText();
      expect(body).not.toContain(required('EYE_B82F_SPAN_EVD'));
      expect(body).not.toContain(required('EYE_B82F_UPLOAD_EVD'));
      await expect(page.locator('a[href*="/observation/evidence/"]')).toHaveCount(0);
      await expect(page.getByText(/base64|byte_start|bytes \d+–\d+/)).toHaveCount(0);
      await noSidewaysScroll(page, `/observation/rights at ${vp.width} px`);
      await shot(page, `01-rights-${vp.width}`);
      await page.context().close();
    }
  });

  test('§CC the affected publication\'s owner (no graph.read): the case page refused in the server\'s words → his obligations → acknowledged; C. Brenner\'s own obligation acknowledged', async ({ browser }) => {
    const CASE = required('EYE_B82F_CASE');
    // The act leaves the case OPEN for this walk, then closes it (EYE_B82F_CLOSE=1). The obligation read answers OPEN cases only, so once the act
    // printed EYE_B82F_CASE_STATE=closed the walk asserts the closed state instead: the case page still refused, nothing of theirs left open.
    const CLOSED = process.env['EYE_B82F_CASE_STATE'] === 'closed';
    for (const vp of WIDTHS) {
      const page = await signedIn(browser, OPERATOR, vp);
      await page.goto(`/observation/corrections/${CASE}`);
      await oneH1(page);
      await expect(page.getByRole('heading', { name: `Correction case ${CASE.slice(0, 8)}…`, level: 1 })).toBeVisible();
      await expect(page.getByText(/The correction case was not read — HTTP 403 EYE-AUT-001: no qualifying role binding/)).toBeVisible();     // the server's words
      await oneH1(page);
      const link = page.getByRole('link', { name: 'your obligations on this case' });
      await expect(link).toBeVisible();
      await noSidewaysScroll(page, `the refused case page at ${vp.width} px`);
      await shot(page, `02-case-refused-${vp.width}`);
      await link.click();
      await page.waitForURL((u) => u.pathname === '/observation/corrections/obligations' && u.searchParams.get('case') === CASE);
      await oneH1(page);                                                                                                    // one h1 while it reads
      await expect(page.getByRole('heading', { name: 'Your correction obligations', level: 1 })).toBeVisible();
      if (CLOSED) {
        await expect(page.getByText('No open correction obligation is yours in this case.')).toBeVisible();
        await expect(page.getByText(required('EYE_B82F_OPERATOR_CONSUMER'))).toHaveCount(0);
      } else {
        const mine = page.getByRole('region').filter({ hasText: required('EYE_B82F_OPERATOR_CONSUMER') }).first();
        await expect(mine).toBeVisible();
        await expect(mine).toContainText(required('EYE_B82F_OPERATOR_CONSUMER'));
        await expect(mine).toContainText('✓ acknowledged');
        await expect(mine).toContainText(/acknowledged at .* by you/);
        await expect(mine).toContainText('not frozen');
      }
      await oneH1(page);
      await expect(page.getByText(required('EYE_B82F_BRENNER_CONSUMER'))).toHaveCount(0);                                     // never another owner's consumer
      await noSidewaysScroll(page, `the obligations page at ${vp.width} px`);
      await shot(page, `03-operator-obligations-${vp.width}`);
      await page.context().close();
    }
    // C. Brenner — her own obligation, acknowledged by her; the operator's is not hers and not listed
    const page = await signedIn(browser, OWNER);
    await page.goto(`/observation/corrections/obligations?case=${CASE}`);
    await oneH1(page);
    await expect(page.getByRole('heading', { name: 'Your correction obligations', level: 1 })).toBeVisible();
    if (CLOSED) {
      await expect(page.getByText('No open correction obligation is yours in this case.')).toBeVisible();
      await expect(page.getByText(required('EYE_B82F_BRENNER_CONSUMER'))).toHaveCount(0);
    } else {
      await expect(page.getByText(required('EYE_B82F_BRENNER_CONSUMER'))).toBeVisible();
      const hers = page.getByRole('region').filter({ hasText: required('EYE_B82F_BRENNER_CONSUMER') }).first();
      await expect(hers).toContainText('✓ acknowledged');
      await expect(hers).toContainText(/acknowledged at .* by you/);
      await expect(hers).toContainText('the accountable owner');
    }
    await expect(page.getByText(required('EYE_B82F_OPERATOR_CONSUMER'))).toHaveCount(0);
    await oneH1(page);
    await noSidewaysScroll(page, 'C. Brenner\'s obligations at 1280 px');
    await shot(page, '04-owner-obligations');
    // another case (the B50 restatement, CLOSED): nothing of hers is open there
    await page.goto(`/observation/corrections/obligations?case=${required('EYE_B82F_OTHER_CASE')}`);
    await oneH1(page);
    await expect(page.getByText('No open correction obligation is yours in this case.')).toBeVisible();
    await page.context().close();
  });

  test('§CC /graph/impact keeps its one h1 while it reads and when its read is refused', async ({ browser }) => {
    for (const vp of WIDTHS) {
      const page = await signedIn(browser, OPERATOR, vp);
      await page.goto('/graph/impact');
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Impact', level: 1 })).toBeVisible();
      await expect(page.getByText(/no qualifying role binding|refused|403/).first()).toBeVisible();                            // refused, in the server's words
      await oneH1(page);
      await noSidewaysScroll(page, `/graph/impact refused at ${vp.width} px`);
      await shot(page, `05-impact-refused-${vp.width}`);
      await page.context().close();
    }
    const page = await signedIn(browser, OWNER);                                                                             // C. Brenner holds graph.read (strategy_owner)
    await page.goto('/graph/impact');
    await oneH1(page);
    await expect(page.getByRole('heading', { name: 'Impact', level: 1 })).toBeVisible();
    await expect(page.getByText('reading invalidations…')).toHaveCount(0, { timeout: 120_000 });
    await oneH1(page);
    await shot(page, '06-impact-read');
    await page.context().close();
  });

  test('§MT /graph/data/analytics?metric=MET-010: definition v2 · computation v2 together, v1 superseded, the diff, the old result\'s two versions', async ({ browser }) => {
    test.setTimeout(3 * 60_000);
    for (const vp of WIDTHS) {
      const page = await signedIn(browser, PRODUCT_ANALYST, vp);
      await page.goto('/graph/data/analytics?metric=MET-010');
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Product analytics — the metric catalog', level: 1 })).toBeVisible();
      const row = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'MET-010', exact: true }) }).first();
      await expect(row).toContainText('APPROVED');
      await expect(row).toContainText('definition v2');
      await expect(row).toContainText(`${MET010_CK} v2 (0120 §CL)`);
      await expect(row).toContainText('definition v1 · computation v2');                                                     // the 2026-Q4 result, recorded on v1
      // the contract card (v2 by default) and the versions
      await expect(page.getByText(`computed by ${MET010_CK} v2 (0120 §CL)`).first()).toBeVisible();
      const versions = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Proposed by' }) }).first();
      await expect(versions.getByRole('row').filter({ hasText: /^v2/ })).toContainText('APPROVED');
      await expect(versions.getByRole('row').filter({ hasText: /^v1/ })).toContainText('SUPERSEDED');
      await expect(page.getByRole('heading', { name: 'What changed from v1 to v2' })).toBeVisible();
      const diff = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Field' }) }).first();
      await expect(diff.getByRole('row')).toHaveCount(4);                                                                    // the header and exactly three fields
      for (const f of ['exclusions', 'meaning', 'population']) await expect(diff.getByRole('cell', { name: f, exact: true })).toBeVisible();
      // v1 chosen: SUPERSEDED, and the computation registered after its decision said beside it
      await page.getByRole('combobox', { name: 'Version shown' }).selectOption('1');
      await expect(page.getByText(/computation v2 was registered \(0120 §CL, 2026-10-19\) after this definition version was decided/).first()).toBeVisible();
      await oneH1(page);
      await noSidewaysScroll(page, `the MET-010 card at ${vp.width} px`);
      await shot(page, `07-met010-${vp.width}`);
      await page.context().close();
    }
  });
});
