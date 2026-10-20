/**
 * CP-6 B50 — THE ACT'S WALK on the seeded DEMONSTRATION after scripts/phase6/act-b50.mjs ran (the rehearsal copy first, then eye_demo): the
 * knowledge core — the header and its absences (F-P3-01), the lifecycle history (F-P3-02), the explanation, the revision diff, the unfit mark
 * and the contest path (F-P3-03), the impact classes (F-P3-03/-05), the closure and the frozen marker (F-P3-05), the timeline and the trace
 * (F-P3-04). A DEMO WALK, not a hosted gate case (playwright.demo.config.ts only). It asserts what each page says and exposes in the
 * ACCESSIBILITY TREE, and ONE <h1> per page.
 *
 * THE FROZEN MARKER is live only while the case is stalled: the act runs this file's "FROZEN" test at that moment when EYE_B50_FROZEN_WALK
 * names the command (EYE_B50_FROZEN=1 then); after the act the same test reads the closed case — every freeze lifted at the closure, kept in
 * the record.
 *
 * The walk WRITES NOTHING. Personas from the act's env lines (EYE_B50_*), each defaulting to the act's login; the password is
 * EYE_TEST_ADMIN_PASSWORD. Screenshots go to EYE_SHOTS (b50-*.png). Every person, record and figure is SYNTHETIC; demonstrated operation,
 * never an acceptance (B111 → R2).
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
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: join(SHOTS, `b50-${name}.png`), fullPage });
const env = (k: string, d: string) => process.env[k] ?? d;
const ANALYST = env('EYE_B50_ANALYST', 'a.hoffmann');
const AUTHOR = env('EYE_B50_AUTHOR', 'd.ivanova');
const KNOWLEDGE_OWNER = env('EYE_B50_KNOWLEDGE_OWNER', 'k.mueller');
const CORRECTION_AUTHORITY = env('EYE_B50_CORRECTION_AUTHORITY', 'm.dvorak');
const EXECUTIVE = env('EYE_B50_EXECUTIVE', 's.okafor');
const FROZEN = process.env['EYE_B50_FROZEN'] === '1';
const ASM_TITLE = 'Red Sea corridor assessment — Bab el-Mandeb, January 2024 (SYNTHETIC)';

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
/** ONE h1 per page (REG-03): asserted once the page has read its record. */
const oneH1 = async (page: Page) => { await expect(page.locator('h1')).toHaveCount(1); };

test.describe('CP-6 B50 — the act\'s walk: the header, the lifecycle, the explanation, the impact classes, the closure, the timeline and the trace', () => {
  test('THE HEADER AND ITS ABSENCES (F-P3-01): the uploaded booking\'s stated header — its "late August" time, the controls\' basis, the declared absences; a version recorded before B50 says so', async ({ browser }) => {
    test.skip(FROZEN, 'the frozen step only');
    const page = await signedIn(browser, ANALYST);
    await page.goto(`/graph/header/EVD/${required('EYE_B50_UPLOAD_EVD')}`);
    await expect(page.getByRole('heading', { name: /Every version's header \(1\)/, level: 2 })).toBeVisible();
    await oneH1(page);
    const v1 = page.locator('li[data-header="stated"]').first();
    await expect(v1).toContainText('header stated');
    await expect(v1).toContainText('between 21 Aug 2026 and 31 Aug 2026 (bounded, part of a month; Europe/Berlin; stated by publisher text');   // the publisher's words, bounded
    await expect(v1.getByLabel('The controls of version 1')).toContainText('Residency: EU — from source_contract');
    await expect(v1.getByLabel('The limitations of version 1')).toContainText('the source clock is unknown');
    await expect(v1.locator('[data-absence="not_applicable"]').first()).toContainText(/^Not applicable — /);                                      // an absence in words, never blank
    await shot(page, '01-header-stated', true);
    await page.goto(`/graph/header/EVD/${required('EYE_B50_PRE_B50_EVD')}`);
    await expect(page.getByRole('heading', { name: /Every version's header/, level: 2 })).toBeVisible();
    await oneH1(page);
    const pre = page.locator('li[data-header="pre_b50"]').first();
    await expect(pre).toContainText('recorded before B50 — not populated');                                                                       // nothing back-filled
    await expect(pre.locator('[data-absence="pre_b50"]').first()).toBeVisible();
    await shot(page, '02-header-pre-b50', true);
    await page.context().close();
  });

  test('THE LIFECYCLE HISTORY (F-P3-02): every version and every attempt — the refused ones KEPT; the proposal declined; the replay at the published instant', async ({ browser }) => {
    test.skip(FROZEN, 'the frozen step only');
    const ASM = required('EYE_B50_ASSESSMENT');
    const page = await signedIn(browser, KNOWLEDGE_OWNER);
    await page.goto(`/graph/lifecycle/ASM/${ASM}`);
    await expect(page.getByRole('heading', { name: `Lifecycle of ${ASM_TITLE}`, level: 1 })).toBeVisible();
    await oneH1(page);
    const history = page.getByRole('region', { name: 'Lifecycle history' });
    await expect(history.getByRole('link', { name: /^Open the state at v/ })).toHaveCount(5);                                                    // draft, reviewed, approved, published, retired
    expect(await history.locator('tr[data-outcome="rejected"]').count()).toBeGreaterThanOrEqual(3);                                              // the refused attempts kept
    await expect(history.locator('tr[data-outcome="rejected"]').filter({ hasText: /stale/ }).first()).toBeVisible();                            // the second tab
    await expect(page.getByRole('table').filter({ hasText: 'Proposed transitions' }).getByText(/^declined: /)).toBeVisible();
    await shot(page, '03-lifecycle-history', true);
    await page.goto(`/graph/lifecycle/ASM/${ASM}?asOf=${encodeURIComponent(required('EYE_B50_ASSESSMENT_PUBLISHED_AT'))}`);
    await expect(page.getByRole('status').filter({ hasText: /stood at version 4, published/ })).toBeVisible();
    await shot(page, '04-lifecycle-replay');
    await page.context().close();
    const own = await signedIn(browser, AUTHOR);
    await own.goto(`/intelligence/assessments/${ASM}`);
    await expect(own.getByRole('heading', { name: ASM_TITLE, level: 1 })).toBeVisible();
    await oneH1(own);
    await expect(own.getByRole('heading', { name: 'Lifecycle acts', level: 2 })).toBeVisible();
    await shot(own, '05-assessment');
    await own.context().close();
  });

  test('THE EXPLANATION AND THE DIFF (F-P3-03): the corrected evidence compared with v1; the forecast\'s backward path with its denied node; the unfit claim and its upheld challenge', async ({ browser }) => {
    test.skip(FROZEN, 'the frozen step only');
    const page = await signedIn(browser, KNOWLEDGE_OWNER);
    const E = required('EYE_B50_CORRECTED_EVD'); const EV = required('EYE_B50_CORRECTED_EVD_VERSION');
    await page.goto(`/graph/explain/EVD/${E}?version=${EV}`);
    await expect(page.getByRole('heading', { name: `Explanation of EVD v${EV}`, level: 1 })).toBeVisible();
    await oneH1(page);
    await expect(page.getByRole('heading', { name: `Compared with version ${Number(EV) - 1}`, level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The correction chain' })).toBeVisible();
    await shot(page, '06-explain-diff', true);
    await page.goto(`/graph/explain/FCT/${required('EYE_B50_WALKED_FORECAST')}?version=${env('EYE_B50_WALKED_FORECAST_VERSION', '1')}`);
    await expect(page.getByRole('heading', { name: 'The backward path', level: 2 })).toBeVisible();
    await oneH1(page);
    await expect(page.getByLabel('The explanation path, from the product backward').getByText(/\[DENIED\]/).first()).toBeVisible();
    await shot(page, '07-explain-forecast');
    await page.goto(`/graph/explain/CLM/${required('EYE_B50_CLAIM')}?version=${env('EYE_B50_CLAIM_VERSION', '1')}`);
    await expect(page.getByRole('heading', { name: 'Fitness', level: 2 })).toBeVisible();
    await expect(page.getByText(/MARKED UNFIT \(unsupported.claim\)/)).toBeVisible();
    await shot(page, '08-claim-unfit');
    await page.goto(`/graph/challenges?subject=${required('EYE_B50_CLAIM')}`);
    await expect(page.getByRole('heading', { name: 'Knowledge challenges', level: 1 })).toBeVisible();
    await oneH1(page);
    await page.getByRole('combobox', { name: 'Show' }).selectOption({ label: 'upheld' });                                                       // decided: not in the live view
    await expect(page.getByRole('heading', { name: /: UPHELD/, level: 2 })).toBeVisible();
    await shot(page, '09-challenge-upheld');
    await page.context().close();
  });

  test('THE IMPACT CLASSES (F-P3-03/-05): the case\'s assessment read class by class — packages, publications, evaluation datasets; the trigger walked by the agent', async ({ browser }) => {
    test.skip(FROZEN, 'the frozen step only');
    const page = await signedIn(browser, KNOWLEDGE_OWNER);
    await page.goto('/graph/impact');
    await expect(page.getByRole('heading', { name: 'Impact', level: 1 })).toBeVisible();
    await oneH1(page);
    const row = page.getByRole('row').filter({ hasText: required('EYE_B50_CASE').slice(0, 12) }).first();
    await row.getByRole('button', { name: 'Read the classes' }).click();
    await expect(page.getByRole('heading', { name: /^Classed products of assessment/, level: 2 })).toBeVisible();
    const list = page.locator('.eye-impact-products');
    for (const c of [/^Decision packages \(\d+\)$/, /^Publications \(\d+\)$/, /^Evaluation datasets \(\d+\)$/, /^Forecasts \(\d+\)$/]) await expect(list.locator('caption').filter({ hasText: c }).first()).toBeVisible();
    for (const k of ['recompute', 'human_review', 'stale']) await expect(list.getByLabel('Products per class').locator(`[data-class="${k}"]`)).toBeVisible();
    await shot(page, '10-impact-classes', true);
    await expect(page.getByRole('heading', { name: /^Recorded triggers \(\d+\)$/ })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: /data.quality/i }).filter({ hasText: /walked by the agent/ }).first()).toBeVisible();
    await page.context().close();
  });

  test('THE CLOSURE AND THE FROZEN MARKER (F-P3-05): the case page — frozen while stalled; closed with its record, every freeze lifted at the closure, the impact notice', async ({ browser }) => {
    const CASE = required('EYE_B50_CASE');
    const page = await signedIn(browser, CORRECTION_AUTHORITY);
    await page.goto(`/observation/corrections/${CASE}`);
    await expect(page.getByRole('heading', { name: new RegExp(`^Correction case ${CASE.slice(0, 8)}`), level: 1 })).toBeVisible();
    await oneH1(page);
    await expect(page.getByRole('heading', { name: 'The consumers', level: 2 })).toBeVisible();
    if (FROZEN) {
      await expect(page.getByText(/STALLED/).first()).toBeVisible();
      const marker = page.locator('.eye-closure-freeze[data-frozen="true"]').first();
      await expect(marker).toBeVisible();
      await expect(marker).toContainText(`FROZEN by correction case ${CASE.slice(0, 8)}`);                                                      // never hidden: the product stays listed, marked
      await expect(page.getByRole('heading', { name: /^The freezes \(\d+ live\)$/, level: 2 })).toBeVisible();
      await shot(page, '11-case-frozen', true);
    } else {
      const rec = page.getByRole('region', { name: 'The closure record' });
      await expect(rec.getByRole('status')).toContainText(/^Closed at /);
      await expect(rec.getByText('Residual exposure', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'The freezes (0 live)', level: 2 })).toBeVisible();
      await expect(page.getByText(/\(closure\)/).first()).toBeVisible();                                                                         // each freeze lifted at the closure, kept
      await expect(page.locator('.eye-closure-freeze[data-frozen="true"]')).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'The correction impact notice', level: 2 })).toBeVisible();
      await shot(page, '12-case-closed', true);
    }
    await page.context().close();
  });

  test('THE TIMELINE AND THE TRACE (F-P3-04): the scope as known on the decision\'s day with its disclosures; the restated day corrected later; the decision\'s trace; the upload\'s unknown clock stated', async ({ browser }) => {
    test.skip(FROZEN, 'the frozen step only');
    const AS_OF = required('EYE_B50_AS_OF');
    const page = await signedIn(browser, EXECUTIVE);
    await page.goto(`/graph/timeline?scope=${env('EYE_B50_SCOPE', 'red-sea-corridor')}&axis=record&asOf=${encodeURIComponent(AS_OF)}`);
    await expect(page.getByRole('heading', { name: 'Timeline and as-of explorer', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^As known at 2026-09-25/, level: 2 })).toBeVisible();
    await oneH1(page);
    const disc = page.getByRole('list', { name: 'The disclosures of this read' });
    for (const k of ['missing', 'withheld', 'clock']) await expect(disc.locator(`li[data-disclosure="${k}"]`)).toBeVisible();
    await shot(page, '13-timeline-scope', true);
    await page.goto(`/graph/timeline?type=EVD&id=${required('EYE_B50_TIMELINE_SUBJECT')}&axis=record&asOf=${encodeURIComponent(AS_OF)}`);
    await expect(page.getByRole('heading', { name: /^As known at 2026-09-25/, level: 2 })).toBeVisible();
    await expect(page.getByText(/corrected on .* — not yet known at the instant/).first()).toBeVisible();                                     // today's restatement, never folded into the past
    await shot(page, '14-timeline-corrected-later', true);
    await page.goto(`/graph/trace/DPK/${required('EYE_B50_DECISION_PACKAGE')}?version=${env('EYE_B50_DECISION_PACKAGE_VERSION', '1')}`);
    // The trace read costs ~11 s on the demonstration (measured 2026-10-20 on the pre-pass build cd3e8d91 and the integration pass's build alike,
    // 10.5–11.8 s, scheduler off); with the live scheduler's ticks serialised behind the audit chain head (a pre-existing behaviour, CP6 §B82.8)
    // it exceeded the default 20 s in two of four runs. The wait for the trace heading is 45 s; what the page must show is unchanged.
    await expect(page.getByRole('heading', { name: 'From the sources to the product', level: 2 })).toBeVisible({ timeout: 45_000 });
    await oneH1(page);
    for (const h of [/^Sources \(\d+\)$/, /^Evidence \(\d+\)$/, /^Products \(\d+\)$/, /^Decisions \(\d+\)$/]) await expect(page.getByRole('heading', { name: h, level: 3 })).toBeVisible();
    await shot(page, '15-trace-decision', true);
    await page.goto(`/graph/trace/EVD/${required('EYE_B50_UPLOAD_EVD')}?version=1`);
    await expect(page.getByRole('heading', { name: 'From the sources to the product', level: 2 })).toBeVisible({ timeout: 45_000 });
    await oneH1(page);
    await expect(page.getByRole('list', { name: 'Limitations the sources state' })).toBeVisible();                                           // D20: stated, not a reason it is incomplete
    await expect(page.getByRole('status').filter({ hasText: /^Complete/ }).first()).toBeVisible();
    await shot(page, '16-trace-upload-limitation', true);
    await page.context().close();
  });
});
