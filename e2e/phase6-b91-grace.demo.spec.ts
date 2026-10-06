/**
 * CP-6 B91 §GR — the entitlement surface and the licence's continuity (F-P7-F-01, second half of its demo scene: "a lapsed licence enters
 * grace mode with the last valid entitlement shown"; with §EN's first half on the simulation workspace: "NORDWERK's licence covers Foresight
 * and Decision but not Simulation: the simulation workspace explains the entitlement, the warning and audit controls stay available").
 * A DEMO WALK, not a hosted gate case — WRITTEN, NOT RUN by the part: it runs through playwright.demo.config.ts only (the hosted config ignores
 * *.demo.spec.ts), against the rehearsal copy first, then eye_demo, after the integrator's act scripts/phase6/act-b91.mjs has:
 *   · created the vendor's commercial persona (commercial_authority, PLATFORM) and a NORDWERK tenant administrator (tenant_admin) through the
 *     platform administrator's governed route;
 *   · licensed NORDWERK for Foresight and Decision (not Simulation) through §EN's issue port;
 *   · routed commercial.entitlement on the domain's PUBLISHED attention policy (to tenant_admin);
 *   · staged the grace scene: a licence version whose term has ended, moved to GRACE by the domain's attention tick (the last valid entitlement
 *     kept) — and printed the EYE_B91_* lines this walk reads.
 * What is asserted is what the record says on screen — never a state derived here; the walk WRITES NOTHING. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b91-grace-*.png). Every figure is SYNTHETIC.
 *
 *   EYE_B91_TENANT_ADMIN      the NORDWERK tenant administrator's login (required)
 *   EYE_B91_COMMERCIAL        the commercial authority's login (required)
 *   EYE_B91_READER            a domain reader of the simulation workspace (default t.richter — domain_admin)
 *   EYE_B91_LICENCE_VERSION   the licence version the act left current (required)
 *   EYE_B91_GRACE             '1' when the act staged the grace scene (the default), '0' when the licence was left ACTIVE
 *   EYE_B91_LICENSED          the licence's capability list exactly as the record holds it (the act's line: the package's ∪ core, sorted, ', ')
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
const READER = process.env['EYE_B91_READER'] ?? 't.richter';
const GRACE = (process.env['EYE_B91_GRACE'] ?? '1') === '1';
const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The licensed capability list the act printed (never a list of this walk's own). */
const licensed = () => esc(required('EYE_B91_LICENSED'));

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('CP-6 B91 §GR — the entitlement surface and grace on the demonstration', () => {
  test('THE SIMULATION WORKSPACE explains the entitlement: Simulation is not licensed (the server\'s reason, the licence version), and what stays available is named', async ({ page }) => {
    const version = required('EYE_B91_LICENCE_VERSION');
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations');
    const banner = page.getByRole('note', { name: 'entitlement' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('simulation is not available');
    await expect(banner).toContainText(`v${version}`);
    // the gate's reason verbatim: the capability, the state the act left, the licence version — and its tail, what stays available
    await expect(banner.getByTestId('entitlement-reason')).toContainText(/^capability unavailable \(entitlement\): simulation is not licensed for this tenant \((active|grace); licence v\d+\) — reads of existing records, corrections and withdrawals, export, audit, identity, warnings and their acknowledgement, and every human decision stay available$/);
    await expect(banner).toContainText('warnings and their acknowledgement');
    await expect(banner).toContainText('the audit read and verification');
    await shot(page, 'b91-grace-1-simulation-banner');
  });

  test('THE CONTROLS STAY AVAILABLE: the warnings and the audit read open for their readers whatever the licence says', async ({ page }) => {
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/warnings');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/capability unavailable \(entitlement\)/)).toHaveCount(0);
    await shot(page, 'b91-grace-2-warnings');
    await uiLogin(page, required('EYE_B91_TENANT_ADMIN'), required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/capability unavailable \(entitlement\)/)).toHaveCount(0);
    await shot(page, 'b91-grace-3-audit');
  });

  test('THE ENTITLEMENT SURFACE (UX-67-001), the tenant administrator: current, included, limits and usage, renewal and continuity, grace — in that order', async ({ page }) => {
    await uiLogin(page, required('EYE_B91_TENANT_ADMIN'), required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/admin');
    await page.getByRole('link', { name: 'Entitlement' }).click();
    await expect(page.getByRole('heading', { name: 'Entitlement and licence continuity', level: 1 })).toBeVisible();
    const headings = page.getByRole('heading', { level: 2 });
    await expect(headings).toHaveText(['Current entitlement', 'Included capabilities', 'Limits and usage', 'Renewal and continuity', 'Grace']);
    await expect(page.getByText(new RegExp(`^Licensed: ${licensed()} ·`))).toBeVisible();
    await expect(page.getByText(/Always available, in every state:/)).toContainText('warnings and their acknowledgement');
    await expect(page.getByRole('list', { name: 'licence transitions' })).toBeVisible();
    // the tenant administrator acts on nothing here: no act panel for a TENANT session
    await expect(page.getByRole('button', { name: 'Renew' })).toHaveCount(0);
    await shot(page, 'b91-grace-4-surface');
  });

  test('GRACE: the lapsed term entered GRACE with the LAST VALID entitlement shown — its version, capabilities, limits and term; running work may finish, no new work starts', async ({ page }) => {
    test.skip(!GRACE, 'the act left the licence ACTIVE (EYE_B91_GRACE=0): the grace scene is not staged');
    await uiLogin(page, required('EYE_B91_TENANT_ADMIN'), required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/admin/commercial');
    await expect(page.getByText('GRACE', { exact: true })).toBeVisible();
    await expect(page.getByTestId('standing-explanation')).toContainText(new RegExp(`^GRACE until .*: the last valid entitlement \\(${licensed()}\\) stays available as the grace policy allows — running work may finish, no new work starts; every record stays readable and exportable\\.`));
    await expect(page.getByTestId('last-valid')).toContainText(new RegExp(`^Last valid entitlement: licence v\\d+ · ${licensed()} · limits `));
    await expect(page.getByRole('list', { name: 'licence transitions' })).toContainText(/grace entered \(active → grace; term ended\) by the attention tick/);
    await shot(page, 'b91-grace-5-grace');
    // the simulation workspace says the same grace, from the server
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations');
    const banner = page.getByRole('note', { name: 'entitlement' });
    await expect(banner).toContainText('GRACE');
    await expect(banner).toContainText(new RegExp(`Last valid entitlement: licence v\\d+ · ${licensed()}`));
    await shot(page, 'b91-grace-6-banner-grace');
  });

  test('THE COMMERCIAL AUTHORITY sees the tenant\'s standing from the PLATFORM — the acts offered, none taken by this walk', async ({ page }) => {
    await uiLogin(page, required('EYE_B91_COMMERCIAL'), required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/admin/commercial');
    const tenant = page.getByRole('combobox', { name: 'Tenant' });
    await expect(tenant).toBeVisible();
    await tenant.selectOption({ index: 1 });
    await expect(page.getByRole('heading', { name: 'Current entitlement', level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Renew' })).toBeDisabled();   // a reason and a term are required first: a deliberate act
    await expect(page.getByRole('button', { name: 'Issue an offline token' })).toBeDisabled();
    await shot(page, 'b91-grace-7-commercial-authority');
  });
});
