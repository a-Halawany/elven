/**
 * Phase 0 browser regression gate — approval instruction B (10 scenarios).
 * Serial suite: API :3401 + web :3000 started by playwright.config webServer.
 * Setup is rotation-aware (one-time bootstrap secret, ADR-P0-17) and seeds a
 * tenant/domain/object via the API; UI assertions then run against real state.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3401';
const REPO = join(__dirname, '..');
const INITIAL_PW = process.env['EYE_TEST_BOOTSTRAP_PASSWORD'] ?? 'accept-initial-secret-000000';
const ROTATED_PW = process.env['EYE_TEST_ADMIN_PASSWORD'] ?? 'accept-rotated-secret-000000';
const TENANT_ADMIN_PW = 'e2e-tenant-admin-passw0rd!';

// Minimal JCS (objects here are flat/sorted-safe) + digest for envelope building.
function jcs(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + jcs(o[k])).join(',') + '}';
}
const digest = (v: unknown) => createHash('sha256').update(jcs(v), 'utf8').digest('hex');

interface Ctx { token: string; principalId: string }
let admin: Ctx;
let tenantAdmin: Ctx & { username: string };
let tenantId = '';
let domainId = '';
let objectId = '';
let tAfterV1 = '';
const run = Date.now().toString(36);

function envelope(over: Record<string, unknown>, payload: unknown): Record<string, unknown> {
  return {
    message_id: crypto.randomUUID(),
    scope: 'PLATFORM', tenant_id: null, domain_id: null,
    principal_id: 'anonymous', purpose_id: 'platform.administration',
    action: 'x', side_effect_class: 'reversible', consequence_class: 'C1',
    object_type: 'TEN', schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e',
    payload_digest: digest(payload ?? {}),
    ...over,
  };
}

async function api(path: string, over: Record<string, unknown>, payload: unknown = {}, token = admin?.token ?? '') {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== '') headers['authorization'] = `Bearer ${token}`;
  const r = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify({ envelope: envelope(over, payload), payload }) });
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}

async function loginApi(username: string, password: string) {
  return api('/v1/auth/login', {
    action: 'identity.session.create', object_type: 'SES', purpose_id: 'authentication',
  }, { username, password }, '');
}

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin/);
}

test.describe.serial('Phase 0 browser regression', () => {
  test.beforeAll(async () => {
    execFileSync('node', [join(REPO, 'apps/api/scripts/migrate.mjs')], {
      env: { ...process.env, EYE_DB_MIGRATE_PASSWORD: process.env['EYE_DB_MIGRATE_PASSWORD'] ?? 'eye_local_dev' },
    });
    try {
      execFileSync('node', [join(REPO, 'apps/api/dist/bootstrap/run-bootstrap.js')], {
        env: {
          ...process.env,
          EYE_DB_APP_PASSWORD: process.env['EYE_DB_APP_PASSWORD'] ?? 'eye_app_local_dev',
          EYE_IDENTITY_JWT_SECRET: process.env['EYE_IDENTITY_JWT_SECRET'] ?? 'e2e-secret-not-production-000000000000',
          EYE_BOOTSTRAP_ADMIN: 'platform-admin',
          EYE_BOOTSTRAP_PASSWORD: INITIAL_PW,
        },
        stdio: 'pipe',
      });
    } catch { /* already bootstrapped */ }

    // Rotation-aware admin login (same protocol as the acceptance suite).
    let r = await loginApi('platform-admin', ROTATED_PW);
    if (r.status !== 201) {
      r = await loginApi('platform-admin', INITIAL_PW);
      expect(r.status).toBe(201);
      expect(r.body.rotationRequired).toBe(true);
      const rot = await api('/v1/auth/rotate', {
        action: 'identity.credential.rotate', object_type: 'PRN', purpose_id: 'authentication',
        principal_id: `principal:${r.body.principalId}`,
      }, { currentPassword: INITIAL_PW, newPassword: ROTATED_PW }, r.body.tokens.accessToken);
      expect(rot.status).toBe(201);
      r = await loginApi('platform-admin', ROTATED_PW);
      expect(r.status).toBe(201);
    }
    admin = { token: r.body.tokens.accessToken, principalId: r.body.principalId };
    const pid = `principal:${admin.principalId}`;

    // Seed tenant + domain + object v1 + correction v2.
    const t = await api('/v1/platform/tenants', { action: 'tenancy.tenant.create', principal_id: pid }, { name: `e2e-${run}` });
    expect(t.status).toBe(201);
    tenantId = t.body.tenant.id;
    const d = await api(`/v1/tenants/${tenantId}/domains`, {
      action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: tenantId, object_type: 'CID', principal_id: pid,
    }, { name: 'e2e-domain' });
    expect(d.status).toBe(201);
    domainId = d.body.domain.id;

    const mk = (v: string) => ({
      objectType: 'CLM', truthState: 'asserted', evidenceRefs: ['evd:e2e'],
      observationTime: new Date().toISOString(), classification: 'internal', purposeScope: 'analysis',
      payload: { subject: 'E2E Corp', predicate: 'acquired', object_value: v },
    });
    const objOver = (action: string, extra: Record<string, unknown> = {}) => ({
      action, scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId,
      object_type: 'CLM', purpose_id: 'analysis', principal_id: pid, ...extra,
    });
    const c = await api(`/v1/tenants/${tenantId}/domains/${domainId}/objects`, objOver('objects.create'), mk('WidgetCo'));
    expect(c.status).toBe(201);
    objectId = c.body.object.object_id;
    tAfterV1 = new Date().toISOString();
    await new Promise((res) => setTimeout(res, 1500));
    const fix = await api(`/v1/tenants/${tenantId}/domains/${domainId}/objects/${objectId}/correct`,
      objOver('objects.correct'), { expectedVersion: 1, correction: mk('WidgetCo Inc. (corrected)') });
    expect(fix.status).toBe(201);

    // Tenant admin for cross-tenant + denial scenarios.
    const p = await api(`/v1/tenants/${tenantId}/principals`, {
      action: 'identity.principal.create', scope: 'TENANT', tenant_id: tenantId, object_type: 'PRN', principal_id: pid,
    }, { kind: 'human', displayName: `e2e-admin-${run}`, password: TENANT_ADMIN_PW, roleCode: 'tenant_admin' });
    expect(p.status).toBe(201);
    const tl = await loginApi(`e2e-admin-${run}`, TENANT_ADMIN_PW);
    expect(tl.status).toBe(201);
    tenantAdmin = { token: tl.body.tokens.accessToken, principalId: tl.body.principalId, username: `e2e-admin-${run}` };
  });

  test('1. platform administrator login (UI)', async ({ page }) => {
    await uiLogin(page, 'platform-admin', ROTATED_PW);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Scope: PLATFORM')).toBeVisible();
  });

  test('2. governed tenant and domain creation with review step (UI)', async ({ page }) => {
    await uiLogin(page, 'platform-admin', ROTATED_PW);
    await page.getByRole('link', { name: 'Tenants & Domains' }).click();
    const name = `e2e-ui-${run}`;
    await page.getByPlaceholder('Tenant name').fill(name);
    await page.getByRole('button', { name: 'Create tenant' }).click();
    // Deliberate action: explicit review before commit (no default approval).
    await expect(page.getByText('Review: this creates an active tenant')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm create tenant' }).click();
    await expect(page.getByText(/committed — POL/)).toBeVisible(); // authoritative receipt
    await expect(page.getByRole('cell', { name })).toBeVisible();
  });

  test('3. ambiguous scope fails closed (EYE-TEN-001)', async () => {
    // Envelope claims TENANT scope on a platform route — client scope is never trusted.
    const r = await api('/v1/platform/tenants/list', {
      action: 'tenancy.tenant.list', scope: 'TENANT', tenant_id: tenantId,
      side_effect_class: 'none', principal_id: `principal:${admin.principalId}`,
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EYE-TEN-001');
  });

  test('4. cross-tenant access denied without metadata leakage', async () => {
    const otherTenant = crypto.randomUUID();
    const r = await api(`/v1/tenants/${otherTenant}/domains/list`, {
      action: 'tenancy.domain.list', scope: 'TENANT', tenant_id: otherTenant, object_type: 'CID',
      side_effect_class: 'none', principal_id: `principal:${tenantAdmin.principalId}`,
    }, {}, tenantAdmin.token);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('EYE-TEN-001');
    const s = JSON.stringify(r.body);
    expect(s).not.toContain(otherTenant);
    expect(s).not.toContain('e2e-');
  });

  test('5. canonical object v1 → v2 correction visible in UI history', async ({ page }) => {
    await uiLogin(page, 'platform-admin', ROTATED_PW);
    await page.getByRole('link', { name: 'Canonical Objects' }).click();
    await page.locator('select').first().selectOption({ label: `e2e-${run}` });
    await page.locator('select').nth(1).selectOption({ label: 'e2e-domain' });
    await expect(page.getByText('Objects (current view)')).toBeVisible();
    await page.getByRole('cell', { name: /truth state asserted/ }).first().click();
    await expect(page.getByText(/Version history/)).toBeVisible();
    const history = page.locator('section', { hasText: 'Version history' });
    await expect(history.getByRole('cell', { name: '1', exact: true })).toBeVisible();
    await expect(history.getByRole('cell', { name: '2', exact: true })).toBeVisible();
    await expect(history.getByRole('cell', { name: `${objectId}@1` })).toBeVisible(); // correction_of ref
  });

  test('6. known-at query returns the pre-correction state (UI)', async ({ page }) => {
    await uiLogin(page, 'platform-admin', ROTATED_PW);
    await page.getByRole('link', { name: 'Canonical Objects' }).click();
    await page.locator('select').first().selectOption({ label: `e2e-${run}` });
    await page.locator('select').nth(1).selectOption({ label: 'e2e-domain' });
    await page.getByRole('cell', { name: /truth state asserted/ }).first().click();
    await expect(page.getByText(/Version history/)).toBeVisible();
    const dt = new Date(new Date(tAfterV1).getTime() + 1000); // datetime-local floors to seconds
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    await page.locator('input[type="datetime-local"]').fill(local);
    await page.getByRole('button', { name: 'Query' }).click();
    await expect(page.getByText(/→ version/)).toBeVisible();
    await expect(page.locator('text=/→ version\\s*1/')).toBeVisible();
    // Pre-correction payload confirmed by version=1; UI truncates JSON, so assert
    // the corrected marker is absent from the as-of result line.
    await expect(page.getByText(/→ version/)).not.toContainText('(corrected)');
  });

  test('7. policy denial in UI + obligation evidence on audit view', async ({ page }) => {
    // Tenant admin signing into the UI: platform tenant list is denied — visible, policy-safe error.
    await uiLogin(page, tenantAdmin.username, TENANT_ADMIN_PW);
    await page.getByRole('link', { name: 'Tenants & Domains' }).click();
    const alert = page.getByRole('alert').filter({ hasText: /EYE-/ });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/EYE-(TEN|AUT)-00[12]/);

    // Platform admin: audit view declares the enforced obligations.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await uiLogin(page, 'platform-admin', ROTATED_PW);
    await page.getByRole('link', { name: 'Audit Ledger' }).click();
    await expect(page.getByText('Obligations enforced on this view: audit_access, mask_secret_metadata')).toBeVisible();
  });

  test('8. audit viewer shows events and chain-integrity status (UI)', async ({ page }) => {
    await uiLogin(page, 'platform-admin', ROTATED_PW);
    await page.getByRole('link', { name: 'Audit Ledger' }).click();
    await expect(page.getByText('Events (sanitized projection)')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'SUCCESS' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Verify chain' }).click();
    await expect(page.getByText(/chain intact — \d+ events, head matches/)).toBeVisible();
  });

  test('9. keyboard navigation and basic accessibility', async ({ page }) => {
    await page.goto('/login');
    // Labels are programmatically associated; form completes keyboard-only.
    await page.keyboard.press('Tab');
    await page.keyboard.type('platform-admin');
    await page.keyboard.press('Tab');
    await page.keyboard.type(ROTATED_PW);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/admin$/);
    // Landmarks: navigation with accessible name + main content region.
    await expect(page.getByRole('navigation', { name: 'workspace' })).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    // Focus ring token applied on keyboard focus.
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineWidth);
    expect(outline).not.toBe('0px');
  });

  test('10. light/dark presentation and RTL-layout smoke', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await uiLogin(page, 'platform-admin', ROTATED_PW);
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(darkBg).not.toBe(lightBg); // token-driven theming responds to scheme

    // RTL smoke: logical properties keep the shell intact under dir=rtl.
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await expect(page.getByRole('navigation', { name: 'workspace' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    const dir = await page.evaluate(() => getComputedStyle(document.querySelector('main') as Element).direction);
    expect(dir).toBe('rtl');
  });
});
