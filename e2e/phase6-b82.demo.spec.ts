/**
 * CP-6 B82 — THE ACT'S WALK on the seeded DEMONSTRATION after scripts/phase6/act-b82.mjs ran (the rehearsal copy eye_demo_b82 first, then
 * eye_demo): the trust, evidence, provenance and explanation experience (F-P7-E-07) — scenes 1, 2, 4 and 5 of the B82 map §8; scene 3 (the
 * corridor map, the band, the fan) and the library's kinds are phase6-b82-viz.demo.spec.ts. A DEMO WALK, not a hosted gate case
 * (playwright.demo.config.ts only). It asserts what each page says and exposes in the ACCESSIBILITY TREE, and ONE h1 per page.
 *
 * The walk WRITES NOTHING beyond what opening a governed page records (each read is audited; reading the cited bytes and verifying them again
 * are consequential READS — custody is written, nothing is changed). Personas from the act's env lines (EYE_B82_*), each defaulting to the
 * act's login; the password is EYE_TEST_ADMIN_PASSWORD. Screenshots go to EYE_SHOTS as b82-*.png. Every person, record and figure is
 * SYNTHETIC; demonstrated operation, never an acceptance (B111's shared recording path, then H3).
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
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: join(SHOTS, `b82-${name}.png`), fullPage });
const env = (k: string, d: string) => process.env[k] ?? d;
const OWNER = env('EYE_B82_OWNER', 'l.brandt');
const ANALYST = env('EYE_B82_ANALYST', 'a.hoffmann');
const KNOWLEDGE_OWNER = env('EYE_B82_KNOWLEDGE_OWNER', 'k.mueller');
const AUDITOR = env('EYE_B82_AUDITOR', 'e.lindqvist');

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
/** A TENANT-homed principal (the auditor) has no home domain: the workspace offers the working-domain chooser first — the id is pasted. */
async function chooseWorkingDomain(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const chooser = page.getByRole('form', { name: 'Working domain' });
  await expect(chooser.or(page.locator('h1').filter({ hasNotText: /^Graph$/ })).first()).toBeVisible();
  if (await chooser.count() > 0) {
    await chooser.getByLabel(/^Domain id/).fill(required('EYE_B82_DOMAIN'));
    await chooser.getByRole('button', { name: 'Open this domain' }).click();
  }
}
/** ONE h1 per page (REG-03): asserted once the page has read its record. */
const oneH1 = async (page: Page) => { await expect(page.locator('h1')).toHaveCount(1); };

test.describe('CP-6 B82 — the act\'s walk: the drill, CORRECTED and its notice, trust, the AI notice and the layers', () => {
  test('B82-0 THE CAST AND THE STATE: the B31 package, its versions and citations; no AIS evidence recorded, stated', async ({ browser }) => {
    const page = await signedIn(browser, OWNER);
    await page.goto(`/decisions/packages/${required('EYE_B82_PACKAGE')}`);
    await expect(page.getByRole('heading', { name: /^Regensburg routing — reroute the magnets via the Cape/, level: 1 })).toBeVisible();
    await oneH1(page);
    await expect(page.getByRole('region', { name: /^Citations of v\d+$/ })).toContainText('Reroute the open magnet bookings via the Cape');
    await shot(page, '01-package', true);
    await page.context().close();
    const analyst = await signedIn(browser, ANALYST);                                                                    // a decision owner reads no source page (D9)
    await analyst.goto(`/observation/sources/${required('EYE_B82_AIS_SOURCE')}`);
    await oneH1(analyst);
    await expect(analyst.getByText(/Red Sea AIS positions/).first()).toBeVisible();
    await shot(analyst, '02-ais-source', true);
    await analyst.context().close();
  });

  test('B82-1 THE DRILL (L. Brandt): the recommendation RECOMMENDED and advisory → the run (INDETERMINATE, withdrawn since) → the evidence (CORRECTED, linked); the layers; trust facets at each hop', async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const page = await signedIn(browser, OWNER);
    await page.goto(`/decisions/recommendations?package=${required('EYE_B82_PACKAGE')}`);
    await expect(page.getByRole('heading', { name: 'Recommendations', level: 1 })).toBeVisible();
    const rec = page.getByRole('article', { name: `recommendation ${required('EYE_B82_RECOMMENDATION')}` });
    await expect(rec).toContainText('NAMED HUMAN');
    await expect(rec).toContainText(/RECOMMENDED/);
    await expect(rec).toContainText(/advisory, not a decision/);
    await expect(rec).not.toContainText(/DECIDED/);
    await expect(rec.getByRole('note', { name: 'AI notice' })).toHaveCount(0);                                          // a person's recommendation owes no AI notice
    const layers = rec.getByRole('region', { name: 'This recommendation in three layers' });
    for (const l of [/^Executive/, /^Analyst/, /^Auditor/]) await expect(layers.getByRole('group').filter({ hasText: l }).first()).toBeAttached();
    await expect(rec).toContainText('REFUSED for decision use: invalidated');                                           // the run it rests on, stated
    await expect(rec.getByRole('heading', { name: 'Missing evidence', level: 4 })).toBeVisible();
    await expect(rec).toContainText(/no AIS positions recorded/);
    await shot(page, '03-recommendation', true);
    // the run: INDETERMINATE for decision use — withdrawn since
    await page.goto(`/graph/explain/SIM/${required('EYE_B82_RUN')}?version=${env('EYE_B82_RUN_VERSION', '1')}`);
    await expect(page.getByRole('heading', { name: `Explanation of SIM v${env('EYE_B82_RUN_VERSION', '1')}`, level: 1 })).toBeVisible();
    await oneH1(page);
    await expect(page.getByRole('region', { name: /^Provenance trail — SIM v\d+$/ })).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/INDETERMINATE|WITHDRAWN|withdrawn/).first()).toBeVisible();
    await shot(page, '04-run', true);
    // the evidence: CORRECTED, linked to its preserved original; its provenance graph DRAWN (the repeated node merged)
    const E = required('EYE_B82_EVD'); const EV = env('EYE_B82_EVD_VERSION', '2');
    await page.goto(`/graph/explain/EVD/${E}?version=${EV}`);
    await expect(page.getByRole('heading', { name: `Explanation of EVD v${EV}`, level: 1 })).toBeVisible();
    await oneH1(page);
    await expect(page.getByText(/\(corrected, observed\)/).first()).toBeVisible();
    const trail = page.getByRole('region', { name: `Provenance trail — EVD v${EV}` });
    await expect(trail).toContainText(/Provenance strength: ● STRONG/);
    await expect(trail.locator('figure[data-chart-kind="provenance_graph"][data-chart-state="ready"]')).toBeVisible();
    await expect(trail.getByRole('note', { name: /not drawn/ })).toHaveCount(0);
    await shot(page, '05-evidence-explain', true);
    // the trust facets of the evidence — facets, never a score
    await page.goto(`/graph/trust?type=EVD&id=${E}&version=${EV}`);
    await expect(page.getByRole('heading', { name: 'Trust and Governance', level: 1 })).toBeVisible();
    await oneH1(page);
    await expect(page.getByText(/custody/i).first()).toBeVisible();
    await expect(page.getByText(/score/i).filter({ hasText: /never a (trust )?score/i }).first()).toBeVisible();
    await shot(page, '06-evidence-trust', true);
    await page.context().close();
  });

  test('B82-1 THE EVIDENCE HOP UNDER D9: no new permission — L. Brandt sees the server\'s refusal; A. Hoffmann (who reads evidence today) opens the cited span and verifies it', async ({ browser }) => {
    const E = required('EYE_B82_EVD');
    const owner = await signedIn(browser, OWNER);
    await owner.goto(`/observation/evidence/${E}`);
    await expect(owner.getByRole('heading', { name: 'Evidence', level: 1 })).toBeVisible();
    const refusal = owner.getByRole('alert').filter({ hasText: 'EYE-AUT-001' }).first();
    await expect(refusal).toContainText('no qualifying role binding for action in resolved scope');                       // the server's words
    await shot(owner, '07-evidence-refused');
    await owner.context().close();
    const page = await signedIn(browser, ANALYST);
    await page.goto(`/observation/evidence/${E}`);
    await expect(page.getByRole('heading', { name: /^Evidence 01a0/, level: 1 })).toBeVisible();
    await oneH1(page);
    const cited = page.getByRole('region', { name: 'The cited bytes, their verification and their rights' });
    await expect(cited).toContainText('Decision-ready evidence');
    await expect(cited).toContainText(/a fragment of evidence .* bytes 471–854/);                                          // the transformation
    const mine = cited.getByRole('region', { name: 'This version’s bytes' });
    await expect(mine).toContainText(/Cited: bytes 0–\d+ of evidence/);
    await mine.getByRole('button', { name: 'Read the cited bytes' }).click();
    await expect(mine.getByText(/chokepoint4/).first()).toBeVisible();                                                     // the cited bytes, served
    await cited.getByRole('button', { name: 'Verify the bytes again' }).click();
    await expect(cited.getByRole('region', { name: 'Verification checks' })).toContainText(/VERIFIED/);
    await expect(cited.getByRole('region', { name: 'Verification checks' })).toContainText('◌ UNAVAILABLE');               // the publisher offers no signature — never FAILED
    await expect(page.getByRole('region', { name: 'Chain of custody', exact: true })).toBeVisible();
    await shot(page, '08-evidence-span', true);
    await page.context().close();
  });

  test('B82-2 CORRECTED AND THE NOTICE: the correction linked to its preserved original; the original\'s citation CORRECTED SINCE; L. Brandt\'s paragraph cites the correction', async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const C = required('EYE_B82_CLAIM'); const CV = required('EYE_B82_CLAIM_CORRECTED_VERSION');
    const km = await signedIn(browser, KNOWLEDGE_OWNER);
    await km.goto(`/graph/explain/CLM/${C}?version=${CV}`);
    await expect(km.getByRole('heading', { name: `Explanation of CLM v${CV}`, level: 1 })).toBeVisible();
    await oneH1(km);
    await expect(km.getByText(/\(corrected, asserted\)/).first()).toBeVisible();
    await shot(km, '09-claim-correction', true);
    await km.context().close();
    const page = await signedIn(browser, OWNER);
    await page.goto('/decisions/briefings');
    await page.getByRole('button', { name: 'January corridor collapse — Regensburg line' }).click();
    // L. Brandt's edition composed after the correction (the latest edition by a person): the correction WITHHELD under the room's policy, declared
    await page.getByRole('button', { name: /· human( · DEGRADED)? · v3$/ }).last().click();
    await expect(page.getByRole('heading', { name: /^Briefing .* — composed by a person$/, level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Omissions — \d+ omissions? declared$/, level: 4 })).toBeVisible();
    await expect(page.getByText(new RegExp(`withheld under policy — claim:${C}@${CV}: withheld under briefing policy v\\d+ \\(claim\\): 1 independent source\\(s\\), the policy asks 2`))).toBeVisible();
    await shot(page, '10-briefing-withheld', true);
    // the room's FIRST edition listed the ORIGINAL claim as an item: that item now resolves CORRECTED SINCE through the resolver
    await page.getByRole('button', { name: /^2026-09-09 07:01:22/ }).first().click();
    await expect(page.getByRole('heading', { name: /composed by the briefing agent \(agent-produced\)/, level: 3 })).toBeVisible();
    const claimRow = page.getByRole('row').filter({ has: page.getByRole('button', { name: new RegExp(`^Open the citation claim ${C.slice(0, 8)}… v1$`) }) }).first();
    await expect(claimRow).toContainText('CORRECTED SINCE', { timeout: 120_000 });
    await shot(page, '11-old-briefing-notice', true);
    await page.context().close();
  });

  test('B82-4 TRUST (E. Lindqvist): /graph/trust — the overview, facets never a score; VERIFIED and UNAVAILABLE, never FAILED for a missing signature; her attestation; the investigation', async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    const page = await signedIn(browser, AUDITOR);
    await chooseWorkingDomain(page, '/graph/trust');
    await expect(page.getByRole('heading', { name: 'Trust and Governance', level: 1 })).toBeVisible();
    await oneH1(page);
    await expect(page.getByText('reading the trust overview…')).toHaveCount(0, { timeout: 120_000 });
    await expect(page.getByText(/never a trust score/).first()).toBeVisible();
    await shot(page, '12-trust-overview', true);
    await page.goto(`/graph/trust?type=${env('EYE_B82_TRUST_SUBJECT_TYPE', 'DPK')}&id=${required('EYE_B82_TRUST_SUBJECT')}&version=${env('EYE_B82_TRUST_SUBJECT_VERSION', '1')}`);
    await expect(page.getByRole('heading', { name: 'Trust and Governance', level: 1 })).toBeVisible();
    await expect(page.getByText(/UNAVAILABLE/).first()).toBeVisible({ timeout: 120_000 });                              // no signature on this version: unavailable, never failed
    await expect(page.getByText(/I inspected the backward path of this package version/).first()).toBeVisible();          // her attestation, a person's statement
    await expect(page.getByText(/attest/i).first()).toBeVisible();
    await shot(page, '13-trust-envelope', true);
    await page.context().close();
  });

  test('B82-4 RIGHTS (declared by F. Aydın; read by A. Hoffmann — a data steward holds no evidence read): the carrier advisories\' rights terms in force with their expiry', async ({ browser }) => {
    const page = await signedIn(browser, ANALYST);
    await page.goto(`/observation/evidence/${required('EYE_B82_ADVISORY_EVD')}`);
    await oneH1(page);
    const rights = page.getByRole('region', { name: 'Rights', exact: true }).filter({ hasText: /in force/i }).first();
    await expect(rights).toContainText(/IN FORCE|in force/);
    await expect(rights).toContainText(/expires|expiry/i);
    await expect(rights).toContainText('redistribution outside NORDWERK');
    await shot(page, '14-rights', true);
    await page.context().close();
  });

  test('B82-5 AI NON-AUTHORITY AND THE LAYERS: the agent-authored recommendation carries the AI notice naming the agent; the layers; an agent-composed briefing carries it too', async ({ browser }) => {
    const page = await signedIn(browser, OWNER);
    await page.goto(`/decisions/recommendations?package=${required('EYE_B82_AGENT_PACKAGE')}`);
    const rec = page.getByRole('article', { name: `recommendation ${required('EYE_B82_AGENT_RECOMMENDATION')}` });
    await expect(rec).toContainText(/DECISION AGENT \(AI\) — RECOMMENDED — by the agent Decision Agent; not a decision/);
    const notice = rec.getByRole('note', { name: 'AI notice' });
    await expect(notice).toContainText('AI recommends, forecasts, simulates, reasons and explains; it does not decide.');
    await expect(notice).toContainText('Decision Agent');
    await expect(rec.getByRole('region', { name: 'This recommendation in three layers' })).toBeAttached();
    await expect(rec).toContainText(/RECOMMENDED/);
    await shot(page, '15-agent-recommendation', true);
    // an agent-composed edition carries the AI notice too
    await page.goto('/decisions/briefings');
    await page.getByRole('button', { name: 'January corridor collapse — Regensburg line' }).click();
    await page.getByRole('button', { name: /· agent( · DEGRADED)? · v3$/ }).last().click();
    await expect(page.getByRole('heading', { name: /composed by the briefing agent \(agent-produced\)/, level: 3 })).toBeVisible();
    await expect(page.getByRole('note', { name: 'AI notice' }).first()).toBeVisible();
    await shot(page, '16-agent-briefing', true);
    await page.context().close();
  });
});
