/**
 * CP-6 B94 — customer onboarding and governed migration (F-P7-F-04), the implementation programme and the go-live gate (F-P7-F-05), the
 * service portal with governed support access (F-P7-F-06) and the customer control center, on the seeded DEMONSTRATION after the B94 act ran
 * (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what scripts/phase6/act-b94.mjs left — the
 * accepted onboarding programme of "NORDWERK Polska — Supplier Risk (SYNTHETIC)", its wave (mapping v2, two rehearsals, the activated
 * cutover, the acceptance withheld then accepted), the accepted implementation programme (the gate released, go-live signed), the closed
 * premium-routed case on the corridor feed, the grants (live, lapsed, revoked by the customer's drill) and the matrices. So this file runs
 * through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — status first, the held or released state, the digests, the customer's authority by
 * name, `demonstration` where an approval or acceptance by a SYNTHETIC persona is shown. Screenshots go to EYE_SHOTS (b94-*.png). Personas
 * from the act's env lines (EYE_B94_*), each defaulting to the act's login; the password is EYE_TEST_ADMIN_PASSWORD. Every NORDWERK person,
 * record and figure is SYNTHETIC; real customer acceptance (AT-67/68/69) is R2 and is never shown as given.
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
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const env = (k: string, d: string) => process.env[k] ?? d;
const AUTHORITY = env('EYE_B94_AUTHORITY', 'j.hartmann');
const SPONSOR = env('EYE_B94_SPONSOR', 'w.zielinska');
const SUB_ADMIN = env('EYE_B94_SUB_ADMIN', 'k.nowak');
const DOMAIN_ADMIN = env('EYE_B94_DOMAIN_ADMIN', 't.richter');
const COLLECTION_MANAGER = env('EYE_B94_COLLECTION_MANAGER', 'm.dvorak');
const PROGRAMME = env('EYE_B94_PROGRAMME', 'nordwerk-polska-supplier-risk');
const WAVE = env('EYE_B94_WAVE', 'polska-supplier-register');
const SUBSIDIARY = env('EYE_B94_SUBSIDIARY', 'NORDWERK Polska — Supplier Risk (SYNTHETIC)');
const CASE = env('EYE_B94_CASE', 'CASE-0001');

async function uiLogin(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(required('EYE_TEST_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function selectContaining(page: Page, label: string, text: string): Promise<void> {
  const select = page.getByLabel(label).first();
  await expect(select.locator('option').filter({ hasText: text }).first()).toBeAttached();
  const option = (await select.locator('option').allTextContents()).find((o) => o.includes(text));
  await select.selectOption({ label: option! });
}

test.describe.serial('CP-6 B94 — onboarding, migration, implementation, the service portal and the control center on the demonstration', () => {
  test('ONBOARDING (the customer\'s onboarding authority): the programme ACCEPTED, its steps done with their compensating acts, the sponsor\'s own intent, the draft-then-active domain and the SIGNED baseline', async ({ page }) => {
    await uiLogin(page, AUTHORITY);
    await page.goto('/admin/onboarding');
    await expect(page.getByRole('heading', { name: 'Customer onboarding', level: 1 })).toBeVisible();
    await expect(page.locator('main')).toContainText('demonstrates the software — real customer acceptance is R2');
    await selectContaining(page, 'programme', PROGRAMME);
    const main = page.locator('main');
    await expect(main).toContainText(/ACCEPTED \(by the customer authority\)/);                // status first
    const steps = page.getByRole('table', { name: 'step graph' });
    for (const k of ['intent', 'domain', 'responsibility', 'baseline', 'mapping', 'cutover']) await expect(steps).toContainText(k);
    await expect(steps).toContainText('onboarding.rollback.execute');                            // each step names the act that reverses it
    await expect(main).toContainText(/By W\. Zielińska — customer sponsor/);                      // the sponsor's own record
    await expect(main).toContainText(new RegExp(`Domain «${SUBSIDIARY.replace(/[()]/g, '\\$&')}» — ACTIVE`));
    await expect(page.getByRole('table', { name: 'baselines' })).toContainText(/APPROVED and SIGNED/);
    await shot(page, 'b94-01-onboarding');
  });

  test('MIGRATION (the onboarding authority): the wave ACCEPTED (demonstration), mapping v2 approved by J. Hartmann on its digest, rehearsal 2 CLEAN, the cutover ACTIVATED, the rehearsal diff, the rollback proof, the acceptance withheld then accepted', async ({ page }) => {
    await uiLogin(page, AUTHORITY);
    await page.goto('/admin/onboarding/migration');
    await expect(page.getByRole('heading', { name: 'Governed migration', level: 1 })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: WAVE });
    await expect(row).toContainText('ACCEPTED (demonstration)');
    await row.getByRole('button', { name: /^(Open|Selected)$/ }).click();
    const main = page.locator('main');
    await expect(main).toContainText(`Status — wave ${WAVE}`);
    await expect(main).toContainText('Accountable owner of data.migration: RESOLVED');
    await expect(main).toContainText(/APPROVED by the customer authority mapping v2 · digest [0-9a-f]{64} · approved by J\. Hartmann — onboarding authority/);
    await expect(main).toContainText('Buyer Note');                                               // declared ignored in v2
    await expect(main).toContainText(/Latest rehearsal #\d+ \(mapping v2, approved\).*CLEAN/);
    await expect(main).toContainText(/ACTIVATED · requested by R\. Costa — implementation lead.*approved by J\. Hartmann/);
    await expect(main).toContainText(/formula_cell: Supplier Name/);                              // rehearsal 1's diff: recorded, never evaluated
    await expect(main).toContainText(/missing_key/);
    await expect(main).toContainText(/Rehearsed plan digest [0-9a-f]{64}/);
    await expect(main).toContainText(/ACCEPTED \(demonstration\) by J\. Hartmann — onboarding authority.*claim demonstration/);
    await expect(main).toContainText(/withheld by J\. Hartmann/);
    await expect(main).toContainText(/Replay \(from the ledger alone\):.*agrees with the recorded state/);
    await shot(page, 'b94-02-migration');
  });

  test('IMPLEMENTATION (the customer sponsor): the gate released — no blocking item — and go-live APPROVED and SIGNED by W. Zielińska (claim demonstration); every readiness item satisfied live; training and competence as counts per role; the cohort below k', async ({ page }) => {
    await uiLogin(page, SPONSOR);
    await page.goto('/admin/implementation');
    await expect(page.getByRole('heading', { name: 'Implementation, readiness and go-live', level: 1 })).toBeVisible();
    await selectContaining(page, 'Implementation programme', 'NORDWERK Polska');
    const main = page.locator('main');
    await expect(main).toContainText('ACCEPTED — go-live approved and signed (a demonstration on SYNTHETIC records; customer acceptance is R2)');   // status first
    await expect(main).toContainText(/gate digest [0-9a-f]{64}/);
    await expect(main).toContainText('No blocking item stands.');
    await expect(main).toContainText(/APPROVE by W\. Zielińska — customer sponsor.*claim demonstration · signed ed25519:/);
    for (const [t, kind] of [['A risk owner holds the subsidiary', 'role_filled'], ['Risk ownership resolves', 'owner_resolved'], ['Decision owners trained', 'training_coverage'],
      ['The decision-owner path is accessible', 'accessibility_attested'], ['Decision owners competent in the supplier-risk review', 'competence_coverage']]) {
      await expect(page.getByRole('row').filter({ hasText: t }).filter({ hasText: kind })).toContainText('satisfied (live)');
    }
    await expect(main).toContainText(/decision_owner: 2 of 2 complete/);                          // counts per role — never a name
    await expect(main).toContainText(/decision_owner × wave-1/);
    await shot(page, 'b94-03-implementation');
  });

  test(`THE SERVICE PORTAL (the collection manager): ${CASE} CLOSED by the customer's confirmation, routed PREMIUM from the live licence, both objectives met; the case's SLA, its support access and its ledger`, async ({ page }) => {
    await uiLogin(page, COLLECTION_MANAGER);
    await page.goto('/admin/service');
    await expect(page.getByRole('heading', { name: 'Service portal', level: 1 })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: CASE });
    await expect(row).toContainText('closed — the customer confirmed');                           // status first
    await expect(row).toContainText('premium');
    await expect(page.locator('main')).toContainText(/PREMIUM · S2: response 30 min, resolution 8 h 0 min · named support: .*read from licence v\d+ \(active\)/);
    await expect(page.locator('main')).toContainText('opening a case is never licence-gated');
    await row.getByRole('button', { name: CASE }).click();
    const main = page.locator('main');
    await expect(main.getByRole('list', { name: 'SLA objectives' })).toBeVisible();
    await expect(main).toContainText('Support access (read only — the control center approves and revokes)');
    await expect(main).toContainText(/case\.closed/);
    await shot(page, 'b94-04-service');
  });

  test('CUSTOMER SUCCESS (the domain administrator): premium routing now, the licence as recorded, adoption INDETERMINATE below k, realized value UNSUPPORTED (MET-040 → B76)', async ({ page }) => {
    await uiLogin(page, DOMAIN_ADMIN);
    await page.goto('/admin/customer-success');
    await expect(page.getByRole('heading', { name: 'Customer success', level: 1 })).toBeVisible();
    const main = page.locator('main');
    await expect(main).toContainText(/Support routing now \(S2\): PREMIUM/);
    await expect(main).toContainText('no renewal-risk score is inferred');
    await expect(main).toContainText(/ADP-001 v\d+ · indeterminate/);
    await expect(main).toContainText(/realized value UNSUPPORTED/);
    await expect(main).toContainText('carrier B76');
    await expect(main).toContainText('joint value-review acceptance is R2');
    await shot(page, 'b94-05-customer-success');
  });

  test('THE CONTROL CENTER (the corridor\'s domain administrator): the support.access owner resolved, the 4-hour grant live (or lapsed by itself), the drilled grant REVOKED and the short grant LAPSED, the signed matrix, both drills PASSED, the access log with allowed and refused reads', async ({ page }) => {
    await uiLogin(page, DOMAIN_ADMIN);
    await page.goto('/admin/control-center');
    await expect(page.getByRole('heading', { name: 'Customer control center', level: 1 })).toBeVisible();
    const main = page.locator('main');
    await expect(main).toContainText(/Accountable owner of support access: ● resolved/);           // status first
    const text = await main.innerText();
    if (/LIVE until/.test(text)) await expect(main).toContainText(/LIVE until .*every read is logged.*D\. Brooks — vendor support engineer/);
    else await expect(main).toContainText(/LAPSED — the grant expired/);                          // the 4-hour grant lapsed by itself
    await expect(main).toContainText(/LAPSED — the grant expired \(support_access\.expiry timer\)|LAPSED — the grant expired \(sweep\)/);
    await expect(main).toContainText(/REVOKED — customer-control drill/);
    await expect(main).toContainText(/APPROVED and SIGNED — in force since .*signed by J\. Hartmann — onboarding authority/);
    await expect(main).toContainText(/revoke_live_grant · PASSED/);
    await expect(main).toContainText(/expired_grant_refused · PASSED/);
    await expect(page.getByRole('row').filter({ hasText: 'support.diagnose.source' }).filter({ hasText: /allowed/ }).first()).toBeVisible();   // logged with its grant
    await expect(main).toContainText(/refused — grant .* expired at/);
    await expect(main).toContainText('Admission record (production admission itself is R1)');
    await shot(page, 'b94-06-control-center');
  });

  test('THE CONTROL CENTER of the subsidiary (its administrator): its signed matrix — data.migration owned by J. Hartmann, risk.ownership RESOLVED since B. Lewandowski was created, support.access owned by K. Nowak', async ({ page }) => {
    await uiLogin(page, SUB_ADMIN);
    await page.goto('/admin/control-center');
    await expect(page.getByRole('heading', { name: 'Customer control center', level: 1 })).toBeVisible();
    const main = page.locator('main');
    await expect(main).toContainText(/Accountable owner of support access: ● resolved/);
    await expect(main).toContainText(/APPROVED and SIGNED — in force since .*signed by J\. Hartmann/);
    for (const k of ['data.migration', 'risk.ownership', 'support.access']) await expect(page.getByRole('row').filter({ hasText: k })).toContainText('resolved');
    await shot(page, 'b94-07-control-center-subsidiary');
  });
});
