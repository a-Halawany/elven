/**
 * CP-6 B107 — governance registries, traceability and conformance manifests (F-P7D-25, F-P7-F-12), the product-governance workspace, design
 * governance (F-P7-E-17) and scope-specific acceptance records (F-R0-04), on the seeded DEMONSTRATION after the B107 act ran (the rehearsal copy
 * first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what scripts/phase6/act-b107.mjs left — the registers imported
 * read-only and EXC-P0-003 reported expired, the signed product baseline, the export-path exception renewed after its expiry held the release
 * candidate, the attested candidate (never a release), CAP-FW-07 accepted for the corridor domain only (constrained, then re-accepted), the
 * attested design baseline with B92's contribution published, the design acceptance and the UNSIGNED conformance packages, the corridor's
 * domain registry entry, data authority and stewardship case, the export component's ratified ownership. So this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * The vendor's pages are PLATFORM: they are opened by the PLATFORM personas the act created (the admin shell's scope is the session's own — a
 * PLATFORM-homed principal reads the vendor's registries; a tenant persona reads its domain's records). What is asserted is what the record
 * says on screen — status first, held or in force, `demonstration` where an approval or acceptance by a SYNTHETIC persona is shown, UNSIGNED
 * where a real independent authority's signature is needed (R2). Screenshots go to EYE_SHOTS (b107-*.png). Personas from the act's env lines
 * (EYE_B107_*), each defaulting to the act's login; the password is EYE_TEST_ADMIN_PASSWORD. Every person, record and figure is SYNTHETIC.
 */
import { expect as baseExpect, test, type Page } from '@playwright/test';
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
/** A full page where the page is short; the VIEWPORT (status first, or the section scrolled to) where the page lists hundreds of rows. */
const shot = async (page: Page, name: string, focus?: string) => {
  if (focus !== undefined) await page.getByText(focus, { exact: false }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: focus === undefined && !LONG.has(name) });
};
const LONG = new Set(['b107-01-workspace', 'b107-03-conformance']);
const env = (k: string, d: string) => process.env[k] ?? d;
const PRODUCT = env('EYE_B107_PRODUCT', 'e.lindgren');
const STEWARD = env('EYE_B107_STEWARD', 'p.castellano');
const ASSURANCE = env('EYE_B107_ASSURANCE', 'h.achterberg');
const DESIGN = env('EYE_B107_DESIGN', 'l.haddad');
const OPERATIONS = env('EYE_B107_OPERATIONS', 'k.mensah');
const DOMAIN_ADMIN = env('EYE_B107_DOMAIN_ADMIN', 't.richter');
const POLSKA_ADMIN = env('EYE_B107_POLSKA_ADMIN', 'k.nowak');

async function uiLogin(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(required('EYE_TEST_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function open(page: Page, path: string, heading: string): Promise<ReturnType<Page['locator']>> {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  const main = page.locator('main');
  await expect(main).not.toContainText('Loading…', { timeout: 20_000 });
  return main;
}

test.describe.serial('CP-6 B107 — governance registries, the product-governance workspace, conformance, acceptance, design governance and ownership on the demonstration', () => {
  test('THE WORKSPACE (a product authority, PLATFORM): the posture, the SIGNED product baseline (demonstration — H3), the export-path exception RENEWED after its expiry, EXC-P0-003 REPORTED expired, the release candidate NOT a release, the change approved', async ({ page }) => {
    await uiLogin(page, PRODUCT);
    const main = await open(page, '/admin/governance', 'Product governance');
    await expect(main).toContainText('baseline: CONFORMANT');                                                      // status first
    await expect(main).toContainText('decision rights: CONFORMANT');
    await expect(main).toContainText(/UNKNOWN — nothing declared \(never inferred conformant\)/);                    // never inferred
    await expect(main).toContainText(/PBL-\d+ v\d+ · SIGNED — the controlled baseline \(demonstration; the real executive attestation is H3\)/);
    await expect(main).toContainText(/signed by R\. Moreau/);
    await expect(main).toContainText(/PDR-\d+ v1 · APPROVED and SIGNED — in force/);
    await expect(main).toContainText(/GEX-\d+ v2 · IN FORCE until/);                                                // the renewal
    await expect(main).toContainText(/GEX-\d+ v1 · SUPERSEDED by a renewal/);
    await expect(main).toContainText(/EXC-P0-003 — EXPIRED 2026-09-30 .* REPORTED; the owner renews or closes it in EXCEPTIONS\.md/);
    await expect(main).toContainText(/Release candidate \(not a release — B65 substituted\)/i);
    await expect(main).toContainText('Nothing is held.');                                                         // the renewal lifted the hold
    await expect(main).toContainText(/GCP-\d+ v2 · APPROVED \(every required role signed\)/);
    await shot(page, 'b107-01-workspace');
  });

  test('REGISTRIES (the conformance steward): the build identity, every source IN SYNC, the orphans LISTED (never hidden), EXC-P0-003 reported, the forecast tests\' verification record reviewed by independent assurance', async ({ page }) => {
    await uiLogin(page, STEWARD);
    const main = await open(page, '/admin/governance/registries', 'Registries & traceability');
    await expect(main).toContainText(/Head SHA: [0-9a-f]{40} \(EYE_BUILD_SHA\)/);
    await expect(main).toContainText('Requirement snapshot: 6264 current');
    const sources = page.getByRole('table', { name: 'sources' });
    await expect(sources).toContainText('IN SYNC');
    await expect(sources).not.toContainText(/DRIFTED|never imported/i);
    await expect(main).toContainText(/Orphans — \d+ listed, never hidden/);
    await expect(main).toContainText(/EXCEPTIONS\.md:EXC-P0-003 — EXPIRED on 2026-09-30 \(status open\) — reported, not closed/);
    await expect(page.getByRole('table', { name: 'verification records' })).toContainText(/The forecast contract tests .*PASSED · reviewed: accepted by H\. Achterberg/);
    await shot(page, 'b107-02-registries');
  });

  test('CONFORMANCE (independent assurance): the committed manifest is the registered one, no open finding, the release candidate ATTESTED (signed, verified) — still NOT a release, not production admission', async ({ page }) => {
    await uiLogin(page, ASSURANCE);
    const main = await open(page, '/admin/governance/conformance', 'Conformance');
    await expect(main).toContainText('Manifest: the committed manifest is the registered one');
    await expect(main).toContainText('0 open conformance finding(s)');
    const rc = page.getByRole('table', { name: 'release candidates' });
    await expect(rc).toContainText(/NORDWERK corridor release candidate 2026-10 \(SYNTHETIC — a local release-candidate record, B65 substituted: NOT a release\)/);
    await expect(rc).toContainText('ATTESTED by independent assurance (signed) — still not a release (B65), not production admission (R1)');
    await expect(rc).toContainText('signed independent_assurance ✓ verified');
    for (const family of ['contract:', 'trust:', 'human_authority:']) await expect(rc).toContainText(family);
    await shot(page, 'b107-03-conformance');
  });

  test('ACCEPTANCE in the corridor (its domain administrator): CAP-FW-07 ACCEPTED here for its exact scope (demonstration), every obligation signed, the expired journey evidence RENEWED, the evidence_expired constraint LIFTED by the re-acceptance', async ({ page }) => {
    await uiLogin(page, DOMAIN_ADMIN);
    const main = await open(page, '/admin/governance/acceptance', 'Acceptance records');
    await expect(main).toContainText('CAP-FW-07: accepted here');
    await expect(main).toContainText(/CAP-FW-07 · v2: ACCEPTED for its exact scope since .* \(claim: demonstration\)/);
    await expect(main).toContainText(/Scope: journeys JRN-11, JRN-24 · roles domain_analyst, executive · profile local-dev · class ≤ C2/);
    await expect(main).toContainText('Obligations: customer ✓, independent_assurance ✓, product ✓');
    await expect(main).toContainText('RENEWED by a later item');                                                    // the short-lived item
    await expect(main).toContainText(/evidence_expired → review/);
    await expect(main).toContainText(/lifted .* \(re-accepted: version 2 accepted over renewed evidence by every obligation\)/);
    await shot(page, 'b107-04-acceptance-corridor');
  });

  test('ACCEPTANCE in NORDWERK Polska (its administrator): NOTHING accepted — no acceptance is inferred from another domain', async ({ page }) => {
    await uiLogin(page, POLSKA_ADMIN);
    const main = await open(page, '/admin/governance/acceptance', 'Acceptance records');
    await expect(main).toContainText('nothing here is accepted');
    await expect(main).not.toContainText('CAP-FW-07: accepted here');
    await shot(page, 'b107-05-acceptance-polska');
  });

  test('DESIGN GOVERNANCE (the Design System Authority): the design baseline v2 ATTESTED and SIGNED, conformance WITHHELD with its reasons stated, B92\'s finding PUBLISHED as a contribution; in the corridor the design acceptance ACCEPTED and the conformance packages UNSIGNED', async ({ page }) => {
    await uiLogin(page, DESIGN);
    const main = await open(page, '/admin/governance/design', 'Design governance');
    await expect(main).toContainText(/v2 — ATTESTED and SIGNED — the controlling design baseline since/);
    await expect(main).toContainText(/CONFORMANCE WITHHELD — \d+ reasons/);                                         // never inferred from the absence of findings
    const queue = page.getByRole('table', { name: 'contributions' });
    await expect(queue).toContainText(/pattern_change · experience_learning/);
    await expect(queue).toContainText('PUBLISHED — the next version is approved; adoption is recorded next');
    await page.getByLabel('Tenant id').fill(required('EYE_B107_TENANT'));
    await page.getByLabel('Domain id').fill(required('EYE_B107_DOMAIN'));
    await page.getByRole('button', { name: 'Read the domain' }).click();
    await expect(main).toContainText(/CAP-FW-07 · JRN-11 · v\d+/);
    await expect(main).toContainText(/Accessibility: UNSUPPORTED \(MET-034/);
    const pk = page.getByRole('table', { name: 'packages' });
    await expect(pk).toContainText('UX-70-006');
    await expect(pk).toContainText(/UNSIGNED — /);
    await shot(page, 'b107-06-design');
  });

  test('OWNERSHIP in the corridor (its domain administrator): the domain registry entry RATIFIED (observed), the corridor warning stream\'s authority RATIFIED, the stewardship case CLOSED, the open no-owner gaps LISTED', async ({ page }) => {
    await uiLogin(page, DOMAIN_ADMIN);
    const main = await open(page, '/admin/governance/ownership', 'Data governance and ownership');
    await expect(main).toContainText('governance mode observed (a missing authority is listed, not held)');
    await expect(main).toContainText(/0 ownership gap\(s\) HOLDING an asset · \d+ open in all/);
    await expect(main).toContainText(/v\d+ · RATIFIED · leader S\. Okafor/);
    await expect(main).toContainText(/Corridor warning stream \(SYNTHETIC\)\s*RATIFIED — in force\s*N\. Eriksen/);
    await expect(main).toContainText(/STW-\d+ · C2\s*quality\s*product Corridor warning stream \(SYNTHETIC\)/);
    await expect(main).toContainText(/CLOSED\s*N\. Eriksen/);
    await shot(page, 'b107-07-ownership-corridor', 'Stewardship cases (DAT-GV-07)');
  });

  test('OWNERSHIP of the platform (the operations authority, PLATFORM): L3-C05 owned by the export and retention team (ratified), the owned-contract lint LISTING every unowned route', async ({ page }) => {
    await uiLogin(page, OPERATIONS);
    const main = await open(page, '/admin/governance/ownership', 'Data governance and ownership');
    await expect(main).toContainText(/L3-C05 · Retention, Legal Hold, and Deletion Service\s*Export and retention team \(SYNTHETIC\) v1 \(K\. Mensah/);
    await expect(main).toContainText(/\d+ routes · \d+ covered · \d+ UNOWNED/);
    await shot(page, 'b107-08-ownership-platform', 'L3-C05 · Retention');
  });
});
