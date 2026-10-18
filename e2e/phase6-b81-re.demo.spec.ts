/**
 * CP-6 B81 §RE — THE WALK for B80's residues carried here. A DEMO WALK (playwright.demo.config.ts only — the hosted browser gate never runs a
 * *.demo.spec.ts). It reads the product through the accessibility tree and the URL:
 *
 *   1. THE SIGN-IN / DEEP-LINK RETURN (UX-11-005; B80's act found it): a SIGNED-OUT as-of deep link → the shell sends the person to
 *      `/login?next=<the link>` → the login page states the return (data-return="honoured", the exact path) → after sign-in the URL IS the
 *      link (path and query, the instant kept) and the page shows that as-of state. A return the rule refuses (`//host`, a scheme, a
 *      backslash) is stated and the landing is as before (`/admin`).
 *   2. THE CATALOGUE (CMP-010 and the residues): every context-bar state; the governed control HELD by a frozen region (disabled, the
 *      reason beside it, never run); TruthBadge on the symbol set; the Button's enforcement (an icon-only C3 control held with its reason,
 *      the labelled one the 44px consequential control); the elevation uses; the Field's control slot; FileIntake in upload mode.
 *
 * Personas from the act's env lines (EYE_B81_RE_*), each defaulting to the act's login; the password is EYE_TEST_ADMIN_PASSWORD. Every person
 * and record SYNTHETIC. CONSTRUCTION + DEMONSTRATED OPERATION evidence only; real acceptance is H3 (B111's recording path) — never claimed.
 */
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const expect = baseExpect.configure({ timeout: 20_000 });
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `b81-re-${name}.png`), fullPage: false });
const env = (k: string, d: string) => process.env[k] ?? d;
function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const OWNER = env('EYE_B81_RE_OWNER', 'l.brandt');
const DSA = env('EYE_B81_RE_CATALOGUE_USER', 'l.haddad');
const WARNING = env('EYE_B81_RE_WARNING', '01a0df00-48f5-7131-9232-4a61a20296d4');
const AS_OF = env('EYE_B81_RE_AS_OF', '2026-09-27T18:35:33Z');
const LINK = `/prediction/warnings/as-of?warning=${WARNING}&at=${encodeURIComponent(AS_OF)}`;

async function fillSignIn(page: Page, username: string): Promise<void> {
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(required('EYE_TEST_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('CP-6 B81 §RE — the sign-in return and B80\'s residues', () => {
  test('THE RETURN: a signed-out as-of deep link → sign-in → exactly that as-of state', async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(LINK);
    await page.waitForURL((u) => u.pathname === '/login');
    expect(new URL(page.url()).searchParams.get('next')).toBe(LINK);                                 // the shell carried the exact place
    const notice = page.locator('#eye-signin-return');
    await expect(notice).toHaveAttribute('data-return', 'honoured');
    await expect(notice).toHaveAttribute('data-next', LINK);
    await expect(notice).toContainText(`After you sign in, you return to ${LINK}`);
    await shot(page, '01-login-return');
    await fillSignIn(page, OWNER);
    const u = new URL(page.url());
    expect(`${u.pathname}${u.search}`).toBe(LINK);                                                   // landed on the link itself, not /admin
    await expect(page.getByRole('heading', { name: 'Warning as of an instant', level: 1 })).toBeVisible();
    const main = page.locator('main');
    await expect(main).toContainText('Opened.');
    await expect(main).toContainText(`as of ${AS_OF}`);
    await shot(page, '02-returned-as-of');
    await ctx.close();
  });

  test('a return the rule refuses is STATED, and the landing is as before', async ({ browser }: { browser: Browser }) => {
    for (const bad of ['//evil.example/x', 'https://evil.example/', '/\\evil.example']) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto(`/login?next=${encodeURIComponent(bad)}`);
      const notice = page.locator('#eye-signin-return');
      await expect(notice).toHaveAttribute('data-return', 'refused');
      await expect(notice).toContainText('The requested return was not honoured');
      await fillSignIn(page, OWNER);
      expect(new URL(page.url()).host).not.toContain('evil');
      expect(new URL(page.url()).pathname).toBe('/admin');
      await ctx.close();
    }
  });

  test('THE CATALOGUE: every context-bar state; the held control; truth glyphs; the Button\'s enforcement; elevation; the Field slot; upload intake', async ({ page }) => {
    await page.goto('/login');
    await fillSignIn(page, DSA);
    await page.goto('/admin/governance/design/catalogue');
    await expect(page.getByRole('heading', { name: 'Component catalogue', level: 1 })).toBeVisible();
    // CMP-010: each fixture's bar is in the state it names (the bar's own data-state), and the held ones say so in words
    for (const [key, state] of [['platform', 'platform'], ['loading', 'loading'], ['default', 'ready'], ['set', 'ready'], ['not-applied', 'ready'],
      ['unresolved', 'degraded'], ['unavailable', 'unavailable'], ['error', 'error']] as const) {
      const region = page.getByRole('region', { name: `Context bar fixture: ${key}` });
      await expect(region.getByTestId('global-context-bar'), key).toHaveAttribute('data-state', state);
    }
    await expect(page.getByRole('region', { name: 'Context bar fixture: unresolved' }).getByTestId('context-held')).toContainText('unresolved');
    await expect(page.getByRole('region', { name: 'Context bar fixture: error' }).getByTestId('context-held')).toContainText('the last valid context is kept');
    await expect(page.getByRole('region', { name: 'Context bar fixture: not-applied' }).locator('[data-dimension="effective_time"]')).toHaveAttribute('data-state', 'not_applied');
    await expect(page.getByRole('region', { name: 'Context bar fixture: default' }).locator('[data-dimension="horizon"]')).toHaveAttribute('data-state', 'default');
    await shot(page, '03-bar-states');
    // PR-05-005 / UX-09-005: held by a frozen region — disabled, the reason beside it, never run
    const held = page.getByRole('button', { name: 'Approve the fixture package' });
    await expect(held).toBeDisabled();
    await expect(held).toHaveAttribute('data-held', 'true');
    await expect(page.getByText(/held — this fixture region is frozen \(SYNTHETIC\)/)).toBeVisible();
    await expect(page.getByText('Last fixture activation: none')).toBeVisible();
    // UX-20-001: the symbol set's glyphs, the name kept
    for (const s of ['observed', 'assessed', 'decided', 'withdrawn', 'rumoured']) await expect(page.getByLabel(`truth state ${s}`)).toBeVisible();
    await expect(page.getByLabel('truth state assessed')).toHaveAttribute('data-symbol', 'TS-04');
    await expect(page.getByLabel('truth state rumoured')).toHaveAttribute('data-symbol', 'GEN-00');
    // UX-20-004 / LAY-003: an icon-only C3 control is held with its reason; the labelled one is the 44px control and runs
    const enforce = page.getByRole('region', { name: 'The Button\'s enforcement', exact: true });
    const icons = enforce.getByRole('button', { name: '✕' });
    await expect(icons.nth(1)).toHaveAttribute('aria-disabled', 'true');
    await expect(enforce).toContainText('a C3 control names its consequence in text');
    const labelled = enforce.getByRole('button', { name: 'Withdraw the fixture warning' });
    expect((await labelled.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await labelled.click();
    await expect(page.getByText('Last fixture activation: C3 labelled control ran (SYNTHETIC — no server called)')).toBeVisible();
    // LAY-009 / -010: the elevation uses
    await expect(page.getByRole('region', { name: 'Elevation raised (LAY-009)' })).toHaveAttribute('data-elevation', 'raised');
    await expect(page.getByRole('region', { name: 'Elevation overlay (LAY-010)' })).toHaveAttribute('data-elevation', 'overlay');
    // UX-ADR-011: the Field's control slot — the page's native select in the library's frame, selected by its label
    await page.getByLabel('Fixture kind').selectOption('csv');
    await expect(page.getByLabel('Fixture kind')).toHaveValue('csv');
    // CMP-040: upload mode — the disclosure before anything is sent
    await expect(page.getByText(/QUARANTINED if it does not conform/).first()).toBeVisible();
    await shot(page, '04-residues');
  });
});
