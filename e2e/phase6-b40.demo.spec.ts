/**
 * CP-6 B40 — THE SOURCE PLATFORM, THE ACT'S WALK (MAP §8, scenes B40-1 … B40-5) on the DEMONSTRATION after scripts/phase6/act-b40.mjs ran
 * (its rehearsal copy first, then eye_demo): the pages the act's people use, read as each of them, asserting what each page RENDERS and
 * exposes in the accessibility tree, ONE h1 per page, and no sideways page scroll at 1280 and 375 px.
 *
 *   B40-1 FEED      the discovery register (the candidate promoted — no longer offered for registration), the feed's source page (its registry
 *                   record: SRC@v4, the rights lifecycle, the coverage panel), and the revocation impact of the corridor stream
 *                   (red-sea-corridor-stream-late: the resting products with their owners, the withdrawal standing or not, the preview heading)
 *   B40-2 CUSTOMS   the publisher-key register (the customs key in force) and BOTH evidence pages (the signed bulletin VERIFIED; the tampered copy
 *                   AUTHENTICITY FAILED — admitted, readable, shown weak, refused at every decision-active use)
 *   B40-3 SUPPLIER  the intake review queue and the supplier PDF's case (the why: the engine's identity and the findings by code and byte offset —
 *                   never the content; the uploader told a second person reviews it) and the .docm's case (Office macros)
 *   B40-4 PORT      the port authority's acquisition policy (the 429 interval as a stated coverage gap; the authorizations)
 *   B40-5 ADAPTER   the connectors (the cell's boundary stated, the package and the requalified package approved, the requalification) and the
 *                   egress receipts (the unregistered host's request blocked on a receipt)
 *
 * A DEMO WALK, not a hosted gate case: playwright.demo.config.ts only, and this module itself resolves the act target (scripts/act-target.mjs)
 * BEFORE any login — a walk that names no target, or a rehearsal pointed at the live addresses, is refused before a browser starts.
 * READ-ONLY: the walk writes nothing beyond what opening a governed page records (each read is audited).
 *
 * It is WRITTEN AGAINST THE ACT'S PRINTED ENV LINES (EYE_B40_<SCENE>_<THING>; the act, scripts/phase6/act-b40.mjs, is built in parallel) and
 * CANNOT BE RUN until the act prints them: every id below is required. Personas default to the act's logins; the password is
 * EYE_TEST_ADMIN_PASSWORD; screenshots go to EYE_SHOTS as b40-*.png. Every person, record and figure is SYNTHETIC. This is demonstrated
 * operation at best — never an acceptance (B111, then H3/R2).
 */
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveActTarget } from '../scripts/act-target.mjs';

// The act-target rule (CP6 7012, 7125): resolved here, before any login — beside playwright.demo.config.ts's own check.
const TARGET = resolveActTarget(process.env, { needs: ['web', 'api'] });

const expect = baseExpect.configure({ timeout: 45_000 });
function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required (the act's env line — run scripts/phase6/act-b40.mjs first)`);
  return v;
}
const env = (k: string, d: string) => process.env[k] ?? d;
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string, fullPage = true) => page.screenshot({ path: join(SHOTS, `b40-${name}.png`), fullPage });

/* ── the personas (the act's logins) ─────────────────────────────────────────────────────────────────────────────────────────────── */
const FEED_ANALYST = env('EYE_B40_FEED_ANALYST', 'a.hoffmann');
const FEED_MANAGER = env('EYE_B40_FEED_MANAGER', 'm.dvorak');
const STREAM_OWNER = env('EYE_B40_STREAM_OWNER', 'n.eriksen');
const CUSTOMS_STEWARD = env('EYE_B40_CUSTOMS_STEWARD', 'f.aydin');
const CUSTOMS_AUDITOR = env('EYE_B40_CUSTOMS_AUDITOR', 'e.lindqvist');
const SUPPLIER_UPLOADER = env('EYE_B40_SUPPLIER_UPLOADER', 'h.weber');
const SUPPLIER_REVIEWER = env('EYE_B40_SUPPLIER_REVIEWER', 'a.hoffmann');
const PORT_MANAGER = env('EYE_B40_PORT_MANAGER', 'm.dvorak');
const ADAPTER_ADMIN = env('EYE_B40_ADAPTER_ADMIN', 't.richter');
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
/** Each width in its own signed-in context, closed after. */
async function atEachWidth(browser: Browser, who: string, walk: (page: Page, vp: { width: number; height: number }) => Promise<void>): Promise<void> {
  for (const vp of WIDTHS) {
    const page = await signedIn(browser, who, vp);
    try { await walk(page, vp); } finally { await page.context().close(); }
  }
}

test.describe('CP-6 B40 — the act\'s walk: discovery, rights impact, authenticity, intake, acquisition policy, the connector cell', () => {
  test.beforeAll(() => {
    // the walk never starts against an undeclared target (resolved above) — said once in the run's output
    console.log(`[phase6-b40 walk] target ${TARGET.mode} · db ${TARGET.db} · web ${TARGET.web} · api ${TARGET.api}`);
  });

  /* ───────────────────────── B40-1 FEED ───────────────────────── */
  test('B40-1 the analyst opens discovery: the feed\'s candidate PROMOTED, registered as its source — no longer offered for registration', async ({ browser }) => {
    const NAME = env('EYE_B40_FEED_NAME', 'Red Sea shipping notices (SYNTHETIC)');
    const CANDIDATE = required('EYE_B40_FEED_CANDIDATE');
    await atEachWidth(browser, FEED_ANALYST, async (page, vp) => {
      await page.goto('/observation/sources/discovery');
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Source discovery', level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Proposed sources', level: 2 })).toBeVisible();
      const table = page.getByRole('region', { name: 'Source candidates' });
      await expect(table).toBeVisible();
      const row = table.getByRole('row').filter({ hasText: NAME }).filter({ hasText: 'promoted' }).first();
      await expect(row).toBeVisible();
      await expect(row).toContainText(/registered as .* v\d+/);
      await expect(page.locator(`a[href="/observation/sources/new?candidate=${CANDIDATE}"]`)).toHaveCount(0);   // promoted: no longer offered
      await expect(page.getByRole('heading', { name: 'Propose a source', level: 2 })).toBeVisible();
      await oneH1(page);
      await noSidewaysScroll(page, `/observation/sources/discovery at ${vp.width} px`);
      await shot(page, `01-discovery-${vp.width}`);
    });
  });

  test('B40-1 the feed\'s source page: its registry record (SRC@v4 under its evaluation gate, discovered as the candidate), the rights lifecycle, the coverage panel', async ({ browser }) => {
    const FEED = required('EYE_B40_FEED_SOURCE');
    const NAME = env('EYE_B40_FEED_NAME', 'Red Sea shipping notices (SYNTHETIC)');
    await atEachWidth(browser, FEED_ANALYST, async (page, vp) => {
      await page.goto(`/observation/sources/${FEED}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(NAME);
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Registry, stewardship and rights', level: 2 })).toBeVisible();
      const versions = page.getByRole('region', { name: 'Contract versions in the registry' });
      await expect(versions).toContainText('SRC@v4');
      await expect(versions).toContainText('SRC@v4: approved only on its latest evaluation recommending approval');
      await expect(page.getByText(/proposed by /).first()).toBeVisible();                                                    // "Discovered as" — the candidate
      await expect(page.getByRole('link', { name: 'Read what rests on this source' })).toHaveAttribute('href', `/observation/sources/${FEED}/impact`);
      await expect(page.getByRole('heading', { name: 'The rights lifecycle', level: 3 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Acquisition policy and authenticity', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Coverage gaps — rate-limited and incomplete intervals', level: 3 })).toBeVisible();
      await oneH1(page);
      await noSidewaysScroll(page, `the feed's source page at ${vp.width} px`);
      await shot(page, `02-feed-source-${vp.width}`);
    });
  });

  test('B40-1 the corridor stream\'s REVOCATION IMPACT for its forecast owner: the resting products with their owners, the withdrawal standing (or none), the server\'s preview', async ({ browser }) => {
    const STREAM = required('EYE_B40_STREAM_SOURCE');
    const WITHDRAWN = env('EYE_B40_STREAM_STATE', 'restored') === 'withdrawn';
    await atEachWidth(browser, STREAM_OWNER, async (page, vp) => {
      await page.goto(`/observation/sources/${STREAM}/impact`);
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Revocation impact', level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'What rests on this source', level: 2 })).toBeVisible();
      const resting = page.getByRole('region', { name: 'Resting products and their owners' });
      await expect(resting).toBeVisible();
      for (const kind of ['Forecast', 'Warning', 'Scenario']) await expect(resting.getByRole('cell', { name: kind, exact: true }).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'The withdrawal standing', level: 2 })).toBeVisible();
      if (WITHDRAWN) {
        await expect(page.getByText('Withdrawn by', { exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'If the rights were restored now', level: 2 })).toBeVisible();
      } else {
        await expect(page.getByText('No withdrawal of the rights lifecycle stands on this source.')).toBeVisible();          // restored: none stands
        await expect(page.getByRole('heading', { name: 'If the rights were withdrawn now', level: 2 })).toBeVisible();
      }
      // references and owners only — never evidence content (D9)
      await expect(page.locator('a[href*="/observation/evidence/"]')).toHaveCount(0);
      await oneH1(page);
      await noSidewaysScroll(page, `the stream's impact page at ${vp.width} px`);
      await shot(page, `03-stream-impact-${vp.width}`);
    });
    // the collection manager reads the same impact (the act's actor)
    const page = await signedIn(browser, FEED_MANAGER);
    await page.goto(`/observation/sources/${STREAM}/impact`);
    await expect(page.getByRole('heading', { name: 'Revocation impact', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Resting products and their owners' })).toBeVisible();
    await oneH1(page);
    await page.context().close();
  });

  /* ───────────────────────── B40-2 CUSTOMS ───────────────────────── */
  test('B40-2 the data steward\'s publisher-key register: the customs source\'s key in force (key metadata only)', async ({ browser }) => {
    const KEY = required('EYE_B40_CUSTOMS_KEY');
    required('EYE_B40_CUSTOMS_SOURCE');
    await atEachWidth(browser, CUSTOMS_STEWARD, async (page, vp) => {
      await page.goto('/observation/authenticity');
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Publisher keys and content authenticity', level: 1 })).toBeVisible();
      // the key ledger names the key by its id's head; its row reads "in force" as a signing key
      const ledger = page.getByRole('list', { name: /^The key ledger of / }).filter({ hasText: KEY.slice(0, 8) }).first();
      await expect(ledger).toBeVisible();
      await expect(ledger).toContainText('key.declared');
      const keys = page.getByRole('region', { name: /^Publisher keys of / }).filter({ hasText: '● in force' }).first();
      await expect(keys).toBeVisible();
      await expect(keys).toContainText('signing key (Ed25519)');
      await expect(page.locator('a[href*="/observation/evidence/"]')).toHaveCount(0);                                           // key metadata only
      await oneH1(page);
      await noSidewaysScroll(page, `/observation/authenticity at ${vp.width} px`);
      await shot(page, `04-authenticity-${vp.width}`);
    });
  });

  test('B40-2 the auditor opens BOTH bulletins: the signed one VERIFIED; the tampered copy AUTHENTICITY FAILED — admitted, readable, shown weak, refused at decision-active use', async ({ browser }) => {
    const SIGNED = required('EYE_B40_CUSTOMS_SIGNED_EVD');
    const TAMPERED = required('EYE_B40_CUSTOMS_TAMPERED_EVD');
    await atEachWidth(browser, CUSTOMS_AUDITOR, async (page, vp) => {
      await page.goto(`/observation/evidence/${SIGNED}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(`Evidence ${SIGNED.slice(0, 8)}…`);
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Authenticity — four separate concepts', level: 2 })).toBeVisible();
      await expect(page.getByText(/^VERIFIED: /).first()).toBeVisible();
      await expect(page.getByText('✓ the content is established as the publisher’s').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Inspection', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Chain of custody', level: 2 })).toBeVisible();
      await oneH1(page);
      await noSidewaysScroll(page, `the signed bulletin at ${vp.width} px`);
      await shot(page, `05-bulletin-signed-${vp.width}`);

      await page.goto(`/observation/evidence/${TAMPERED}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(`Evidence ${TAMPERED.slice(0, 8)}…`);
      await oneH1(page);
      await expect(page.getByText(/^AUTHENTICITY FAILED: /).first()).toBeVisible();
      await expect(page.getByText(/it is shown weak and refused at every decision-active use/).first()).toBeVisible();
      await expect(page.getByText('✕ refused (authenticity failed) — the evidence stays admitted and readable').first()).toBeVisible();
      await expect(page.getByText('This evidence has been withdrawn.')).toHaveCount(0);                                         // admitted, not withdrawn
      await oneH1(page);
      await noSidewaysScroll(page, `the tampered bulletin at ${vp.width} px`);
      await shot(page, `06-bulletin-tampered-${vp.width}`);
    });
  });

  /* ───────────────────────── B40-3 SUPPLIER ───────────────────────── */
  test('B40-3 the reviewer opens the intake review queue: the scan rule (only clean admits), the reviewer separation said', async ({ browser }) => {
    required('EYE_B40_SUPPLIER_SOURCE');
    await atEachWidth(browser, SUPPLIER_REVIEWER, async (page, vp) => {
      await page.goto('/observation/quarantine');
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Quarantine', level: 1 })).toBeVisible();
      const frame = page.getByRole('region', { name: 'Intake review' });
      await expect(frame).toContainText('Only a clean scan admits; an unavailable, failed or incomplete scan is never clean.');
      await expect(frame).toContainText('A manual upload is never reviewed by the person who uploaded it');
      await expect(page.getByLabel('Cases shown')).toBeVisible();
      await oneH1(page);
      await noSidewaysScroll(page, `/observation/quarantine at ${vp.width} px`);
      await shot(page, `07-quarantine-${vp.width}`);
    });
  });

  test('B40-3 the supplier PDF\'s case — WHY: active content and a hidden instruction cited by code and byte offset (never the text), the engine\'s identity, custody; the .docm\'s macro case', async ({ browser }) => {
    const PDF_CASE = required('EYE_B40_SUPPLIER_PDF_CASE');
    const DOCM_CASE = required('EYE_B40_SUPPLIER_DOCM_CASE');
    await atEachWidth(browser, SUPPLIER_REVIEWER, async (page, vp) => {
      await page.goto(`/observation/quarantine/${PDF_CASE}`);
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Intake case', level: 1 })).toBeVisible();
      const theCase = page.getByRole('region', { name: 'The case' });
      await expect(theCase.getByRole('heading', { level: 2 })).toHaveText('Active content (scripts, actions)');
      await expect(theCase).toContainText('uploaded by another person — you may review it if you hold collection_manager');
      await expect(page.getByRole('heading', { name: 'Why: every engine\'s verdict', level: 3 })).toBeVisible();
      const findings = page.getByRole('list', { name: 'content-inspector findings' });
      await expect(findings).toContainText(/pdf\.open_action · active content · byte \d+/);
      await expect(findings).toContainText(/pdf\.hidden_text_instruction · hidden instruction · byte \d+/);
      await expect(page.getByText(/^content-inspector 1\.0\.0 · rule set [0-9a-f]{12}…/).first()).toBeVisible();              // the engine's identity
      const custody = page.getByRole('list', { name: 'Custody of the bytes' });
      await expect(custody).toContainText('custody.quarantined');
      await expect(custody).toContainText('custody.inspected');
      // D9: the hidden instruction is cited, never quoted, until a role that reads evidence bytes asks for the bytes
      await expect(page.locator('main')).not.toContainText(/ignore previous instructions/i);
      await oneH1(page);
      await noSidewaysScroll(page, `the supplier PDF's case at ${vp.width} px`);
      await shot(page, `08-case-pdf-${vp.width}`);

      await page.goto(`/observation/quarantine/${DOCM_CASE}`);
      await oneH1(page);
      await expect(page.getByRole('region', { name: 'The case' }).getByRole('heading', { level: 2 })).toHaveText('Office macros');
      await oneH1(page);
      await noSidewaysScroll(page, `the .docm's case at ${vp.width} px`);
      await shot(page, `09-case-docm-${vp.width}`);
    });
    // the uploader opens her own case: told a second person reviews it (D9b)
    const page = await signedIn(browser, SUPPLIER_UPLOADER);
    await page.goto(`/observation/quarantine/${PDF_CASE}`);
    await expect(page.getByRole('heading', { name: 'Intake case', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'The case' })).toContainText('uploaded by you — a second person reviews it (D9b)');
    await oneH1(page);
    await shot(page, '10-case-pdf-uploader');
    await page.context().close();
  });

  /* ───────────────────────── B40-4 PORT ───────────────────────── */
  test('B40-4 the port authority\'s acquisition policy: the publisher\'s 429 as a STATED coverage gap with the contract\'s backoff; the authorizations', async ({ browser }) => {
    const PORT = required('EYE_B40_PORT_SOURCE');
    await atEachWidth(browser, PORT_MANAGER, async (page, vp) => {
      await page.goto(`/observation/sources/${PORT}/acquisition`);
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Acquisition policy', level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Coverage gaps', level: 2 })).toBeVisible();
      const gaps = page.getByRole('region', { name: 'The coverage gaps of this source' });
      await expect(gaps).toContainText('the publisher answered 429 Too Many Requests (HTTP 429)');
      await expect(gaps).toContainText(/attempt \d+ of \d+ · schedule /);
      await expect(page.getByText(/recorded gap\(s\): .* Each is an explicit interval, never a silent gap\./)).toBeVisible();
      await expect(page.getByRole('heading', { name: 'The declared policy, per contract version', level: 2 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Acquisition authorizations', level: 2 })).toBeVisible();
      await expect(page.getByRole('list', { name: 'The acquisition authorizations, newest first' })).toContainText('Authorized');
      await expect(page.getByRole('heading', { name: 'robots.txt', level: 2 })).toBeVisible();
      await oneH1(page);
      await noSidewaysScroll(page, `the port's acquisition page at ${vp.width} px`);
      await shot(page, `11-port-acquisition-${vp.width}`);
    });
  });

  /* ───────────────────────── B40-5 ADAPTER ───────────────────────── */
  test('B40-5 the domain admin\'s connectors: the cell\'s boundary stated, the package and the requalified package approved, the requalification', async ({ browser }) => {
    const SRC = required('EYE_B40_ADAPTER_SOURCE');
    const PKG = required('EYE_B40_ADAPTER_PACKAGE');
    const PKG2 = required('EYE_B40_ADAPTER_REQUALIFIED_PACKAGE');
    await atEachWidth(browser, ADAPTER_ADMIN, async (page, vp) => {
      await page.goto('/observation/connectors');
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Connectors', level: 1 })).toBeVisible();
      const boundary = page.getByRole('complementary', { name: 'What the connector cell isolates, and what it does not' });
      await expect(boundary).toContainText('network-level isolation is a later stage (B103, B109)');                            // D3 stated, never claimed
      await expect(page.getByRole('heading', { name: 'Adapter contracts', level: 2 })).toBeVisible();
      await expect(page.getByRole('region', { name: 'The adapter contracts' }).locator(`a[href="/observation/sources/${SRC}"]`).first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Adapter packages', level: 2 })).toBeVisible();
      await expect(page.locator(`[id="pkg-${PKG}"]`)).toContainText(/ — approved$/);
      await expect(page.locator(`[id="pkg-${PKG2}"]`)).toContainText(/ — approved$/);
      await expect(page.getByRole('heading', { name: 'Requalifications', level: 2 })).toBeVisible();
      const rq = page.getByRole('heading', { level: 3, name: /^Requalification of .* — approved$/ }).first();
      await expect(rq).toBeVisible();
      await expect(page.getByText(/Cause: the cell asked for a host the contract never registered\./).first()).toBeVisible();
      await oneH1(page);
      await noSidewaysScroll(page, `/observation/connectors at ${vp.width} px`);
      await shot(page, `12-connectors-${vp.width}`);
    });
  });

  test('B40-5 the egress receipts of the adapter source: the unregistered host\'s request BLOCKED on a receipt (digests and sizes, never content)', async ({ browser }) => {
    const SRC = required('EYE_B40_ADAPTER_SOURCE');
    await atEachWidth(browser, ADAPTER_ADMIN, async (page, vp) => {
      await page.goto(`/observation/egress?source=${SRC}`);
      await oneH1(page);
      await expect(page.getByRole('heading', { name: 'Egress receipts', level: 1 })).toBeVisible();
      const counts = page.getByRole('list', { name: 'The receipts by decision' });
      await expect(counts).toContainText(/\d+ allowed/);
      await expect(counts).toContainText(/\d+ (blocked|refused) — a host the contract does not register/);
      await expect(page.getByRole('link', { name: 'Show every source' })).toBeVisible();
      await expect(page.getByText(/Read at .* · at most \d+ receipts are listed\./)).toBeVisible();
      await oneH1(page);
      await noSidewaysScroll(page, `/observation/egress at ${vp.width} px`);
      await shot(page, `13-egress-${vp.width}`);
    });
  });
});
