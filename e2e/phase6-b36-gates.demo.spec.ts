/**
 * CP-6 B36 · part G — THE HUMAN GATE COMPLETED in a browser against the seeded DEMONSTRATION after scripts/phase6/act-b36.mjs (the
 * integrator's act; the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left —
 * the dual-sourcing decision (act-b34's package) with its approval SIGNED by S. Okafor and the decision SIGNED by C. Brenner after the
 * commitment and DISTRIBUTED to the room (in-app + the SYNTHETIC email sink); a recusal by one approver on a second package; a challenge
 * raised by the auditor and dismissed by the owner; a board-class package on the board page for a SYNTHETIC board member; a denied act by
 * K. Lange recorded and shown — so this file runs through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here: the ONE gate-state badge (ADR-003), the signature
 * lines with the server's VERIFIED, "RECUSED" beside the name, the challenge and its resolution, "denied: … tried …", the distribution
 * rows with their receipts (SYNTHETIC said), the condition builder, the authority banner, the distinct acts and the preview on a version
 * still at the gate. Personas and the packages' titles come from the environment so the integrator binds them to the act
 * (EYE_B36_PACKAGE_TITLE, EYE_B36_GATE_PACKAGE_TITLE, EYE_B36_BOARD_LOGIN, EYE_B36_AUDITOR_LOGIN). Screenshots go to EYE_SHOTS.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
/** The committed dual-sourcing decision (act-b34's mitigation case) and the second package the act left at the gate (recused, challenged). */
const COMMITTED = new RegExp(process.env['EYE_B36_PACKAGE_TITLE'] ?? 'dual-sourc|second (bearing )?source|mitigation', 'i');
const AT_GATE = new RegExp(process.env['EYE_B36_GATE_PACKAGE_TITLE'] ?? 'B36|recus|challenge', 'i');
const BOARD_LOGIN = process.env['EYE_B36_BOARD_LOGIN'] ?? 'r.vogel';
const AUDITOR_LOGIN = process.env['EYE_B36_AUDITOR_LOGIN'] ?? 'e.lindqvist';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openPackage(page: Page, title: RegExp): Promise<void> {
  await page.goto('/decisions');
  await expect(page.getByRole('heading', { name: 'Decisions', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: title }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible({ timeout: 20_000 });
}
/** The demonstration domain's id, read from a domain persona's own session (the server reported it at sign-in; nothing is inferred). */
async function demoDomainId(page: Page): Promise<string> {
  await uiLogin(page, 's.okafor', required('EYE_TEST_ADMIN_PASSWORD'));
  const id = await page.evaluate(() => (JSON.parse(sessionStorage.getItem('eye.session') ?? '{}') as { scope?: { domainId?: string | null } }).scope?.domainId ?? null);
  if (id === null) throw new Error('the demonstration domain id was not in the session');
  return id;
}
/** A TENANT-homed principal (the auditor) has no home domain: the Decisions shell offers the working-domain chooser first (B18) — the id is pasted. */
async function chooseWorkingDomain(page: Page, domainId: string): Promise<void> {
  await page.goto('/decisions');
  const chooser = page.getByRole('form', { name: 'Working domain' });
  await expect(chooser.or(page.getByRole('heading', { name: 'Decisions', level: 1 })).first()).toBeVisible({ timeout: 20_000 });
  if (await chooser.count() > 0) {
    await chooser.getByLabel(/^Domain id/).fill(domainId);
    await chooser.getByRole('button', { name: 'Open this domain' }).click();
  }
}

test.describe.serial('CP-6 B36 — the gate completed on the demonstration', () => {
  test('SIGNED and DISTRIBUTED: S. Okafor opens the committed dual-sourcing decision — the approval signed and VERIFIED, the decision signed by C. Brenner, the distribution rows with their receipts (email SYNTHETIC)', async ({ page }) => {
    await uiLogin(page, 's.okafor', required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page, COMMITTED);
    await expect(page.getByRole('heading', { name: /The gate's record/ })).toBeVisible({ timeout: 20_000 });
    // the ONE gate-state badge (ADR-003): a committed decision reads APPROVED
    await expect(page.getByTestId('gate-state').first()).toContainText('APPROVED');
    // the approval's signature, VERIFIED by the server, and the decision's
    const approvals = page.getByRole('list', { name: 'approval signatures' });
    await expect(approvals.getByText(/✓ VERIFIED — signed by/).first()).toBeVisible();
    await expect(page.getByLabel('decision signatures').getByText(/✓ VERIFIED — signed by/).first()).toBeVisible();
    await expect(page.getByText(/✕ NOT VERIFIED/)).toHaveCount(0);
    // the distribution: in_app delivered to the room, the email row SYNTHETIC with the sink's receipt
    const dist = page.getByRole('list', { name: 'distributions' });
    await expect(dist.getByText(/via in_app: DELIVERED/).first()).toBeVisible();
    await expect(dist.getByText(/via email \(SYNTHETIC — a local sink\): DELIVERED/).first()).toBeVisible();
    // the authority banner of the B34 panel stands beside it
    await expect(page.getByRole('heading', { name: /The gate on version/ })).toBeVisible();
    await shot(page, 'b36-01-signed-distributed');
  });

  test('RECUSED and CHALLENGED: C. Brenner opens the second package — "RECUSED" beside the approver, the auditor\'s challenge DISMISSED, the condition builder, the distinct acts and the preview for the authority', async ({ page }) => {
    await uiLogin(page, 'c.brenner', required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page, AT_GATE);
    await expect(page.getByRole('heading', { name: /The gate's record/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('list', { name: 'approval signatures' }).getByText('RECUSED').first()).toBeVisible();
    await expect(page.getByText(/Recusals:/)).toBeVisible();
    const challenges = page.getByRole('list', { name: 'challenges' });
    await expect(challenges.getByText(/CHALLENGE DISMISSED/).first()).toBeVisible();
    await expect(challenges.getByText(/\(auditor/).first()).toBeVisible();
    // the distinct acts the owner is offered (HX-12) and the gate's uniform state
    await expect(page.getByLabel('Gate act (each is its own recorded action)')).toBeVisible();
    await expect(page.getByTestId('gate-state').first()).toBeVisible();
    await shot(page, 'b36-02-recused-challenged');
    // the approver sees the condition builder on a version still at the gate; the authority sees the preview
    await uiLogin(page, 's.okafor', required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page, AT_GATE);
    await expect(page.getByText(/Approve only if…/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel('Condition kind')).toBeVisible();
    await shot(page, 'b36-03-condition-builder');
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page, AT_GATE);
    await expect(page.getByRole('button', { name: 'Preview the consequences' })).toBeVisible({ timeout: 20_000 });
    await shot(page, 'b36-04-preview');
  });

  test('DENIED: the denied act by K. Lange is shown on the record — "denied: … tried decision.… — …"', async ({ page }) => {
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page, AT_GATE);
    const denials = page.getByRole('list', { name: 'denials' });
    await expect(denials.getByText(/^denied: .* tried decision\./).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, 'b36-05-denied');
  });

  test('THE BOARD: the SYNTHETIC board member opens /decisions/board — the board-class package with its gate badge, the quorum, the approvals; the board act offered through the gate', async ({ page }) => {
    await uiLogin(page, BOARD_LOGIN, required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/board');
    await expect(page.getByRole('heading', { name: 'Board', level: 1 })).toBeVisible();
    const card = page.getByRole('region').filter({ hasText: /reserved for/ }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByTestId('gate-state')).toBeVisible();
    await expect(card.getByText(/quorum \d+ · \d+ live approval\(s\)/)).toBeVisible();
    await expect(card.getByRole('list', { name: 'board approvals' })).toBeVisible();
    await shot(page, 'b36-06-board');
  });

  test('THE AUDITOR reads the same gate badge on the committed decision and may raise a challenge (offered; not performed by the walk)', async ({ page }) => {
    const domainId = await demoDomainId(page);
    await uiLogin(page, AUDITOR_LOGIN, required('EYE_TEST_ADMIN_PASSWORD'));
    await chooseWorkingDomain(page, domainId); // the auditor is bound at the TENANT: the working domain is pasted
    await openPackage(page, COMMITTED);
    await expect(page.getByTestId('gate-state').first()).toContainText('APPROVED', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Challenge this decision' })).toBeVisible();
    await shot(page, 'b36-07-auditor');
  });
});
