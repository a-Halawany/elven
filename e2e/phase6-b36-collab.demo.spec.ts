/**
 * CP-6 B36 — collaboration completed and the carried mechanisms (F-P6-14 (q)–(t), F-P6-05 (u), F-P4-13 (i)–(j)) exercised in a browser
 * against the seeded DEMONSTRATION after act-b34 and the B36 collab scene ran (R. Haddad's — the customs broker, SYNTHETIC — invitation
 * delivered to the demo mailbox with a one-time pickup code; a task that waits on another; the synthetic ERP target beside a NEW non-synthetic
 * target registered inactive (a loopback literal, SYNTHETIC record), refused as inactive, ACTIVATED by K. Lange with the owner's committed
 * decision and refused again by the production egress; the corridor mitigation's outcome reviewed; the Morocco opportunity's learn step).
 * A DEMO WALK, not a hosted gate case: what it reads is what the scene left; the acts it performs are the customs expert's PICKUP and
 * ACCEPTANCE from the login page (§pickup — once: a second run finds the invitation picked up and reads the record instead) and the
 * learning the owner records if the scene left it owed (§outcome). This file runs through playwright.demo.config.ts only (the hosted config
 * ignores *.demo.spec.ts).
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS
 * (evidence/phase6-browser/b36-collab-*.png). The personas: l.brandt (the workspace's owner, the exposure's owner), m.dvorak (the chief
 * of staff — the task holder), the tenant administrator (EYE_TEST_ADMIN_LOGIN, default admin — reads the SYNTHETIC mailbox), k.lange
 * (execution authority), and the customs expert R. Haddad signed in FROM THE INVITATION (EYE_B36_INVITATION_ID: the grant id the scene
 * printed; the code is read from the mailbox on screen by the administrator).
 */
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Playwright's expect.configure returns a NEW instance: rebind it (the B21 rule).
const expect = baseExpect.configure({ timeout: 20_000 });

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const ADMIN_LOGIN = process.env['EYE_TEST_ADMIN_LOGIN'] ?? 'admin';
const PURPOSE = 'collaboration.dual-sourcing-review';
/** The customs expert's password for the acceptance (set here once; SYNTHETIC) — the scene's second run signs in with it. */
const EXPERT_PASSWORD = process.env['EYE_B36_EXPERT_PASSWORD'] ?? ['customs', 'broker', 'b36', 'synthetic'].join('-');

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
/** The dual-sourcing workspace opened on the Workspaces page (its title button). */
async function openDualSourcing(page: Page): Promise<void> {
  await page.goto('/decisions/workspaces');
  await expect(page.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
  await page.getByLabel('Purpose (every request here is made under it)').fill(PURPOSE);
  await page.getByRole('button', { name: 'Read' }).click();
  await page.getByRole('button', { name: /Dual-sourcing review/ }).first().click();
  await expect(page.getByRole('heading', { name: /Dual-sourcing review/, level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B36 — collaboration completed on the demonstration', () => {
  let pickupCode: string | null = null;
  let expertLogin: string | null = null;

  test('§workspaces · WORKSPACES: the grant delivered to the SYNTHETIC mailbox — the administrator reads the message (the code inside, never the token)', async ({ page }) => {
    await uiLogin(page, ADMIN_LOGIN, required('EYE_TEST_ADMIN_PASSWORD'));
    await openDualSourcing(page);
    await expect(page.getByText(/R\. Haddad/).first()).toBeVisible();
    // the delivery's state on the grant line (B36 §C3): delivered, or picked up on a second run
    const delivery = page.getByLabel(/^delivery of /).first();
    await expect(delivery).toBeVisible();
    await expect(delivery).toHaveText(/delivered to the SYNTHETIC mailbox|picked up/);
    await shot(page, 'b36-collab-01-workspace-delivery');
    if ((await delivery.textContent())?.includes('delivered to the SYNTHETIC mailbox')) {
      await page.getByRole('button', { name: 'Read the synthetic mailbox' }).first().click();
      const message = page.getByLabel('synthetic mailbox message');
      await expect(message).toBeVisible();
      const body = (await message.textContent()) ?? '';
      expect(body).toMatch(/one-time pickup code/);
      expect(body).not.toMatch(/invitation token/i);
      const code = /([0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4})/.exec(body)?.[1] ?? null;
      expect(code, 'the message carries the pickup code').not.toBeNull();
      pickupCode = code;
      expertLogin = /\b(ext-[a-z0-9]{12})\b/.exec(body)?.[1] ?? null;
      await shot(page, 'b36-collab-02-mailbox');
    }
  });

  test('§pickup · THE LOGIN PAGE: the customs expert picks the invitation up with the code, accepts it and lands on its ONE surface (q, t)', async ({ page }) => {
    const invitationId = required('EYE_B36_INVITATION_ID');
    if (pickupCode === null) {
      // a second run: the material was picked up already — the expert signs in with the password set on the first run
      test.skip(expertLogin === null && process.env['EYE_B36_EXPERT_LOGIN'] === undefined, 'the invitation is picked up and no expert login is known (set EYE_B36_EXPERT_LOGIN)');
      await uiLogin(page, process.env['EYE_B36_EXPERT_LOGIN'] ?? String(expertLogin), EXPERT_PASSWORD);
    } else {
      await page.goto(`/login?invitation=${invitationId}`);
      await expect(page.getByRole('form', { name: 'Invitation pickup' })).toBeVisible();
      await page.getByLabel('Pickup code').fill(pickupCode);
      await page.getByRole('button', { name: 'Pick up the invitation' }).click();
      await expect(page.getByRole('form', { name: 'Accept the invitation' })).toBeVisible();
      await expect(page.getByText(/Dual-sourcing review/)).toBeVisible();
      await shot(page, 'b36-collab-03-pickup');
      await page.getByLabel(/Your new password/).fill(EXPERT_PASSWORD);
      await page.getByRole('button', { name: 'Accept and sign in' }).click();
      await page.waitForURL((u) => u.pathname.startsWith('/decisions/workspaces'));
    }
    // THE ONE SURFACE: the banner names the grant; the nav offers Workspaces only; the workspace is the dual-sourcing one, read at the grant's ceiling
    await expect(page.getByLabel('your grant')).toContainText(/external collaborator .* Dual-sourcing review .* audience internal/);
    await expect(page.getByRole('navigation', { name: 'Decisions' }).getByRole('link')).toHaveCount(1);
    await expect(page.getByLabel('your surface')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Dual-sourcing review/, level: 2 })).toBeVisible();
    await expect(page.getByText(/you: external \(reading at internal\)/)).toBeVisible();
    await shot(page, 'b36-collab-04-external-surface');
    // every other route answers 403 at the policy decision point: the tasks page shows the server's refusal
    await page.goto('/decisions/tasks');
    await expect(page.getByRole('alert')).toContainText(/403/);
    await shot(page, 'b36-collab-05-external-refused');
  });

  test('§tasks · TASKS: the chief of staff\'s inbox — a task that WAITS ON another (r)', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
    await page.getByLabel('include closed tasks').check();
    const waits = page.getByLabel(/^waits on /).filter({ hasText: /waits on "/ }).first();
    await expect(waits).toBeVisible();
    await expect(waits).toContainText(/completed when they are/);
    await expect(page.getByText(/Complete is offered when what this task waits on has closed/).first()).toBeVisible();
    await shot(page, 'b36-collab-06-tasks-waits-on');
  });

  test('§workflow · WORKFLOW: the definitions and the instances the scene left (s)', async ({ page }) => {
    await uiLogin(page, 'm.dvorak', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/workflow');
    await expect(page.getByRole('heading', { name: 'Workflow', level: 1 })).toBeVisible();
    await expect(page.getByText(/depends_on/).first()).toBeVisible();
    await shot(page, 'b36-collab-07-workflow');
  });

  test('§target · COMMITMENTS: the synthetic ERP beside the REAL target — inactive, then activated by K. Lange with the owner\'s decision, refused by the production egress; nothing real reached (u)', async ({ page }) => {
    await uiLogin(page, 'k.lange', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/commitments');
    await expect(page.getByRole('heading', { name: 'Commitments', level: 1 })).toBeVisible();
    const targets = page.getByRole('list', { name: 'targets' });
    await expect(targets).toBeVisible();
    await expect(targets.getByLabel(/^activation of nordwerk-erp$/).first()).toContainText(/SYNTHETIC — no activation to make/);
    await expect(targets.getByLabel(/^activation of nordwerk-erp-real/).first()).toContainText(/ACTIVE — authorized by decision|INACTIVE — deactivated/);
    await shot(page, 'b36-collab-08-targets');
    // the handoff to the real target after its activation: carried nowhere — the production egress refused the loopback (the B14 rule)
    const row = page.getByRole('row').filter({ hasText: /real ERP/ }).first();
    if (await row.isVisible()) {
      await row.getByRole('button', { name: /^open commitment / }).click();
      const attempts = page.getByRole('list', { name: 'attempts' });
      await expect(attempts.getByText(/transport/).first()).toBeVisible();
      await shot(page, 'b36-collab-09-real-target-refused');
    }
  });

  test('§outcome · EXPOSURES: the corridor mitigation\'s outcome reviewed against the exposure (i) and the Morocco opportunity\'s learn step (j)', async ({ page }) => {
    await uiLogin(page, 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/exposures');
    await expect(page.getByRole('heading', { name: /Risk and opportunity/i, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /Corridor closure/ }).first().click();
    const monitored = page.getByRole('list', { name: 'responses monitored' });
    await expect(monitored).toBeVisible();
    await expect(monitored.getByText(/reviewed: partly effective|reviewed: effective|reviewed: ineffective|reviewed: inconclusive/).first()).toBeVisible();
    await shot(page, 'b36-collab-10-outcome-reviewed');
    // THE LEARN STEP: recorded by the scene, or owed — then the owner records it here
    const owed = monitored.getByLabel('learn step');
    if (await owed.isVisible()) {
      await owed.getByLabel('what was expected').fill('a two-week line stop costing EUR 400–900k (SYNTHETIC)');
      await owed.getByLabel('what happened').fill('three days of line stop; the buffer held (SYNTHETIC)');
      await owed.getByLabel('what changes in the basis').fill('the buffer, not the route, is the binding constraint: the next bracket rests on buffer days');
      await owed.getByRole('button', { name: 'Record the learning' }).click();
    }
    await expect(monitored.getByLabel('learning').first()).toContainText(/expected \(v\d+.*→ happened .*→ basis changes:/);
    await shot(page, 'b36-collab-11-learned');
    await page.getByRole('button', { name: /Morocco/ }).first().click();
    await expect(page.getByRole('list', { name: 'responses monitored' }).getByLabel('learning').first()).toContainText(/basis changes:/);
    await shot(page, 'b36-collab-12-morocco-learned');
  });
});
