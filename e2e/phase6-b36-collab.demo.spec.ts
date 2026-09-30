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
 * of staff — the task holder), the tenant administrator (EYE_TEST_ADMIN_LOGIN — reads the SYNTHETIC mailbox on screen), k.lange
 * (execution authority), and the customs expert R. Haddad signed in FROM THE INVITATION (EYE_B36_INVITATION_ID: the grant id the scene
 * printed; the code is read from the mailbox on screen by the administrator).
 *
 * NARROWED on the demonstration (the B36 walk run): eye_demo casts NO tenant administrator — its only identity administrator is the
 * PLATFORM administrator (EYE_BOOTSTRAP_ADMIN, default platform-admin; the act's own mailbox reader), and the Decisions shell renders no
 * domain for a PLATFORM-homed principal ("no domain to open"), so the mailbox cannot be read on screen here. When EYE_TEST_ADMIN_LOGIN is
 * unset, §workspaces reads the grant line on screen as the workspace's owner (the delivery's state — never the code) and reads the message
 * through the governed mailbox route (executive.collab.mailbox.read) as the platform administrator — a READ of what the act left, not a
 * seed — so the pickup and the acceptance still happen on the login page. With EYE_TEST_ADMIN_LOGIN set, the administrator reads it on screen.
 * §workflow is narrowed to what the engine's page renders for the scene: it published no workflow definition and started no instance (the
 * task dependency is the Tasks page's, proven in §tasks); the page shows the timers it holds — the review tasks' deadlines and the grant's expiry.
 */
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
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
/** A TENANT administrator who reads the mailbox on screen; none is cast on the demonstration (see the header). */
const ADMIN_LOGIN = process.env['EYE_TEST_ADMIN_LOGIN'] ?? null;
const PLATFORM_ADMIN = process.env['EYE_BOOTSTRAP_ADMIN'] ?? 'platform-admin';
const API_BASE = process.env['NEXT_PUBLIC_EYE_API'] ?? process.env['EYE_API'] ?? 'http://localhost:3401';
const PURPOSE = 'collaboration.dual-sourcing-review';

/** The canonical (JCS) form of a plain JSON payload — sorted keys, no whitespace — as the web client digests it. */
function jcs(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jcs).join(',')}]`;
  if (v !== null && typeof v === 'object') return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${jcs((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
/** One governed call through the REAL HTTP path (the envelope the web client builds), for the platform administrator's mailbox READ only. */
async function governed(path: string, over: Record<string, unknown>, payload: Record<string, unknown>, token: string | null): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const envelope = {
    message_id: randomUUID(), scope: over['scope'], tenant_id: over['tenant_id'] ?? null, domain_id: over['domain_id'] ?? null,
    principal_id: over['principal_id'] ?? 'anonymous', purpose_id: over['purpose_id'] ?? 'platform.administration', action: over['action'],
    side_effect_class: over['side_effect_class'] ?? 'none', consequence_class: over['consequence_class'] ?? 'C1', object_type: over['object_type'], object_id: over['object_id'] ?? null,
    schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: randomUUID(), trace_id: 'b36-walk',
    payload_digest: createHash('sha256').update(jcs(payload), 'utf8').digest('hex'),
  };
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers['authorization'] = `Bearer ${token}`;
  const r = await fetch(API_BASE + path, { method: 'POST', headers, body: JSON.stringify({ envelope, payload }) });
  return { ok: r.ok, status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}
/** The platform administrator's read of the SYNTHETIC mailbox (the act's own reader): the message's subject and body — never printed. */
async function mailboxAsPlatformAdmin(scope: { tenantId: string; domainId: string }, grantId: string): Promise<string> {
  const login = await governed('/v1/auth/login', { scope: 'PLATFORM', action: 'identity.session.create', object_type: 'SES', purpose_id: 'authentication', side_effect_class: 'reversible' },
    { username: PLATFORM_ADMIN, password: required('EYE_TEST_ADMIN_PASSWORD') }, null);
  if (!login.ok) throw new Error(`the platform administrator could not sign in (HTTP ${login.status})`);
  const tokens = login.body['tokens'] as { accessToken: string };
  const r = await governed(`/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/executive/collab/grants/${grantId}/mailbox`,
    { scope: 'DOMAIN', tenant_id: scope.tenantId, domain_id: scope.domainId, principal_id: `principal:${String(login.body['principalId'])}`, purpose_id: PURPOSE,
      action: 'executive.collab.mailbox.read', object_type: 'CGR', object_id: grantId, consequence_class: 'C2', side_effect_class: 'reversible' }, {}, tokens.accessToken);
  if (!r.ok) throw new Error(`the mailbox read was refused (HTTP ${r.status}: ${String((r.body as { message?: string })['message'] ?? '')})`);
  const message = r.body['message'] as { subject: string; body: string } | null;
  if (message === null) throw new Error('the message is not held by this process');
  return `${message.subject}\n${message.body}`;
}
/** The session's scope (the server reported it at sign-in; nothing is inferred) — read from the signed-in tab. */
async function sessionScope(page: Page): Promise<{ tenantId: string; domainId: string }> {
  const s = await page.evaluate(() => (JSON.parse(sessionStorage.getItem('eye.session') ?? '{}') as { scope?: { tenantId?: string | null; domainId?: string | null } }).scope ?? null);
  if (s === null || s.tenantId === null || s.tenantId === undefined || s.domainId === null || s.domainId === undefined) throw new Error('the session names no domain');
  return { tenantId: s.tenantId, domainId: s.domainId };
}
const CODE = /([0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4})/;
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
    // the tenant administrator reads on screen; without one (the demonstration), the workspace's owner reads the grant line and the platform administrator the message (see the header)
    await uiLogin(page, ADMIN_LOGIN ?? 'l.brandt', required('EYE_TEST_ADMIN_PASSWORD'));
    const scope = await sessionScope(page);
    await openDualSourcing(page);
    await expect(page.getByText(/R\. Haddad/).first()).toBeVisible();
    // the delivery's state on THE B36 GRANT's line (EYE_B36_INVITATION_ID — act-b34's revoked grant is listed above it): delivered, or picked up on a second run
    const delivery = page.getByLabel(`delivery of ${required('EYE_B36_INVITATION_ID')}`);
    await expect(delivery).toBeVisible();
    await expect(delivery).toHaveText(/delivered to the SYNTHETIC mailbox|picked up/);
    await shot(page, 'b36-collab-01-workspace-delivery');
    if ((await delivery.textContent())?.includes('delivered to the SYNTHETIC mailbox')) {
      let body: string;
      if (ADMIN_LOGIN !== null) {
        await page.getByRole('button', { name: 'Read the synthetic mailbox' }).first().click();
        const message = page.getByLabel('synthetic mailbox message');
        await expect(message).toBeVisible();
        body = (await message.textContent()) ?? '';
        await shot(page, 'b36-collab-02-mailbox');
      } else {
        test.info().annotations.push({ type: 'narrowed', description: 'no tenant administrator is cast on the demonstration: the message is read through the governed mailbox route as the platform administrator (a read, not a seed)' });
        const grantId = (await delivery.getAttribute('aria-label'))?.replace(/^delivery of /, '') ?? required('EYE_B36_INVITATION_ID');
        body = await mailboxAsPlatformAdmin(scope, grantId);
      }
      expect(body).toMatch(/one-time pickup code/);
      expect(body).not.toMatch(/invitation token/i);
      const code = CODE.exec(body)?.[1] ?? null;
      expect(code, 'the message carries the pickup code').not.toBeNull();
      pickupCode = code;
      expertLogin = /\b(ext-[a-z0-9]{12})\b/.exec(body)?.[1] ?? null;
    }
  });

  test('§pickup · THE LOGIN PAGE: the customs expert picks the invitation up with the code, accepts it and lands on its ONE surface (q, t)', async ({ page }) => {
    const invitationId = required('EYE_B36_INVITATION_ID');
    if (pickupCode === null) {
      // a second run: the material was picked up already — the expert signs in with the password set on the first run
      test.skip(expertLogin === null && process.env['EYE_B36_EXPERT_LOGIN'] === undefined, 'the invitation is picked up and no expert login is known (set EYE_B36_EXPERT_LOGIN)');
      await page.goto('/login');
      await page.getByLabel('Username').fill(process.env['EYE_B36_EXPERT_LOGIN'] ?? String(expertLogin));
      await page.getByLabel('Password').fill(EXPERT_PASSWORD);
      await page.getByRole('button', { name: 'Sign in' }).click();
      const refusal = page.getByRole('alert').filter({ hasText: /EYE-/ });
      await expect(refusal.or(page.getByLabel('your grant')).first()).toBeVisible();
      if (await refusal.count() > 0) {
        // the material was answered once to a browser that never accepted (no password stands): the state is the refusal — nothing more can be shown
        test.info().annotations.push({ type: 'state', description: `the expert's sign-in is refused: ${(await refusal.first().textContent()) ?? ''} — the invitation was picked up without an acceptance` });
        await expect(refusal.first()).toContainText(/EYE-IDN-002/);
        await shot(page, 'b36-collab-03-picked-up-not-accepted');
        return;
      }
    } else {
      await page.goto(`/login?invitation=${invitationId}`);
      await expect(page.getByRole('form', { name: 'Invitation pickup' })).toBeVisible();
      await page.getByLabel('Pickup code').fill(pickupCode);
      // FROM HERE TO "Accept and sign in" nothing may fail: the pickup answers the material ONCE, to this page's memory
      await page.getByRole('button', { name: 'Pick up the invitation' }).click();
      const accept = page.getByRole('form', { name: 'Accept the invitation' });
      await expect(accept).toBeVisible();
      await accept.getByLabel(/Your new password/).fill(EXPERT_PASSWORD);
      await shot(page, 'b36-collab-03-pickup');
      await accept.getByRole('button', { name: 'Accept and sign in' }).click();
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
    await expect(page.getByRole('alert').filter({ hasText: /HTTP 403/ })).toContainText(/403 EYE-AUT-001/); // Next's empty route announcer is an alert too
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
    // NARROWED (see the header): the scene published no definition and started no instance — the engine's page shows the orchestration state it
    // holds for the scene's objects: the two review tasks' deadline timers and the B36 grant's expiry timer (the task dependency is the Tasks page's, §tasks)
    await expect(page.getByRole('heading', { name: 'Instances', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Definitions', level: 2 })).toBeVisible();
    const timers = page.getByRole('row').filter({ hasText: /task\.deadline/ });
    await expect(timers.first()).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: new RegExp(`grant\\.expiry\\s*grant ${required('EYE_B36_INVITATION_ID').slice(0, 8)}…`) }).first()).toBeVisible();
    await shot(page, 'b36-collab-07-workflow');
  });

  test('§target · COMMITMENTS: the synthetic ERP beside the REAL target — inactive, then activated by K. Lange with the owner\'s decision, refused by the production egress; nothing real reached (u)', async ({ page }) => {
    await uiLogin(page, 'k.lange', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/decisions/commitments');
    await expect(page.getByRole('heading', { name: 'Commitments', level: 1 })).toBeVisible();
    const targets = page.getByRole('list', { name: 'targets' });
    await expect(targets).toBeVisible();
    // the SYNTHETIC ERP is act-b34's target (its key on the demonstration: nordwerk-purchasing-demo); the REAL one is the scene's nordwerk-erp-real
    await expect(targets.getByRole('listitem').filter({ hasText: /the SYNTHETIC ERP/ }).first()).toContainText(/SYNTHETIC — no activation to make/);
    await expect(targets.getByRole('listitem').filter({ hasText: /nordwerk-erp-real/ }).first()).toContainText(/ACTIVE — authorized by decision|INACTIVE — deactivated/);
    await shot(page, 'b36-collab-08-targets');
    // the handoff to the real target after its activation: carried nowhere — the production egress refused the loopback (the B14 rule)
    const row = page.getByRole('row').filter({ hasText: /nordwerk-erp-real|real ERP/ }).first();
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
