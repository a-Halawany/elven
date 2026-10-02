/**
 * CP-6 B34 browser walk — the Risk and Opportunity workspace's remainder (F-P4-13; UX-35, OBJ-22, PR-27-002) through the real interface:
 *
 *   the ACTIVE CONTEXT (tenant, domain, purpose, who is signed in) above the register → the TAXONOMY published by the domain
 *   administrator is PENDING, not in force: the publisher's own activation is refused in the page's words (separation, 403 by the port)
 *   → the executive, a second named member, ACTIVATES it: in force, the receipt → (seeded by the API: an RSK declared with its
 *   polarity, registered under the activated taxonomy, assessed) → the RISK OWNER previews and ACCEPTS the exact version: the
 *   acceptance's SIGNATURE rendered (the digest and the signer — "you") → the OWNER RESOLUTION route: the domain administrator reads
 *   "nothing to resolve" for an active owner and a re-owning attempt is refused verbatim (not_needed, 409).
 *
 * The seeding is the API's, in the Phase 1 idiom (the projections walk's): this suite makes its own tenant, ONE domain and three DOMAIN
 * principals with a per-run password. The RSK rests on a SYNTHETIC entity reference (this gate seeds no graph; the reference is labelled
 * so and nothing asserts on the entity). The rows, the refusals by status code, the outcome loop and the detections are the harness's
 * (apps/api/test/int/phase6-exposures-b34.test.ts). A refusal is read from role="status" in the page's words; a receipt inside the page.
 *
 * The selectors are the page's own (apps/web/app/prediction/exposures/page.tsx): the paragraph labelled "active context"; the section
 * `tax-h` ("Taxonomy") with #tax-reason and "Activate version N"; the exposure's title button; "Preview version N", #acc-why, "Accept
 * version N"; the definition "Acceptance signature"; the section `owner-h` ("Owner resolution") with #reown-owner, #reown-reason and
 * "Re-own the exposure".
 */
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3401';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be provided (generated .eye-local/env or caller environment)`);
  return v;
}
const BOOTSTRAP_PW = required('EYE_TEST_BOOTSTRAP_PASSWORD');
const ADMIN_PW = required('EYE_TEST_ADMIN_PASSWORD');
/** One per-run password for the principals this suite creates; it lives in the worker's memory only. */
const PW = `Xb34!${crypto.randomUUID()}`;
const run = Date.now().toString(36);

function jcs(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jcs).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort()
    .map((k) => `${JSON.stringify(k)}:${jcs(o[k])}`).join(',')}}`;
}
const digest = (v: unknown) => createHash('sha256').update(jcs(v ?? {}), 'utf8').digest('hex');

async function api(path: string, over: Record<string, unknown>, payload: unknown = {}, token?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const envelope = {
    message_id: crypto.randomUUID(),
    scope: 'PLATFORM', tenant_id: null, domain_id: null,
    principal_id: 'anonymous', purpose_id: 'prediction',
    action: 'x', side_effect_class: 'reversible', consequence_class: 'C2',
    object_type: 'RSK', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-x34',
    ...over,
    payload_digest: digest(payload),
  };
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token !== undefined ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ envelope, payload }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
async function loginApi(username: string, password: string) {
  return api('/v1/auth/login', { action: 'identity.session.create', object_type: 'SES', purpose_id: 'authentication' }, { username, password });
}
async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin/);
}

interface Ctx { token: string; principalId: string; username: string }
let admin: Ctx; let dadmin: Ctx; let executive: Ctx; let owner: Ctx;
let T = ''; let D = ''; let rsk = '';
const TITLE = `Corridor closure (e2e ${run})`;

async function person(login: string, roleCode: string): Promise<Ctx> {
  const p = await api(`/v1/tenants/${T}/principals`,
    { action: 'identity.principal.create', scope: 'TENANT', tenant_id: T, object_type: 'PRN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
    { kind: 'human', displayName: login, loginName: login, password: PW, roleCode, domainId: D }, admin.token);
  expect(p.status, `${login} (${roleCode}) created`).toBe(201);
  const l = await loginApi(login, PW);
  expect(l.status, `${login} signed in`).toBe(201);
  return { token: (l.body as { tokens: { accessToken: string } }).tokens.accessToken, principalId: (l.body as { principalId: string }).principalId, username: login };
}
/** A governed act of this suite's seeding, in the domain, as one of its people. */
const as = (who: Ctx, path: string, action: string, objectType: string, objectId: string | null, payload: unknown, purpose = 'prediction') =>
  api(`/v1/tenants/${T}/domains/${D}${path}`, { action, scope: 'DOMAIN', tenant_id: T, domain_id: D, object_type: objectType, object_id: objectId, principal_id: `principal:${who.principalId}`, purpose_id: purpose }, payload, who.token);

const section = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);
const status = (page: Page, re: RegExp) => page.getByRole('status').filter({ hasText: re });
async function openWorkspace(page: Page): Promise<void> {
  await page.goto('/prediction/exposures');
  await expect(page.getByRole('heading', { name: 'Risk and opportunity', level: 1 })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B34 — the risk and opportunity workspace: active context, taxonomy activation, the signature, the owner resolution', () => {
  test.beforeAll(async () => {
    // Rotation-aware admin sign-in (ADR-P0-17).
    let al = await loginApi('platform-admin', ADMIN_PW);
    if (al.status !== 201 || (al.body as { rotationRequired?: boolean }).rotationRequired === true) {
      const boot = await loginApi('platform-admin', BOOTSTRAP_PW);
      expect(boot.status).toBe(201);
      const bt = (boot.body as { tokens: { accessToken: string }; principalId: string });
      if ((boot.body as { rotationRequired?: boolean }).rotationRequired === true) {
        const rot = await api('/v1/auth/rotate', { action: 'identity.credential.rotate', object_type: 'CRD', principal_id: `principal:${bt.principalId}`, purpose_id: 'authentication' },
          { currentPassword: BOOTSTRAP_PW, newPassword: ADMIN_PW }, bt.tokens.accessToken);
        expect(rot.status).toBe(201);
      }
      al = await loginApi('platform-admin', ADMIN_PW);
    }
    expect(al.status).toBe(201);
    admin = { token: (al.body as { tokens: { accessToken: string } }).tokens.accessToken, principalId: (al.body as { principalId: string }).principalId, username: 'platform-admin' };
    const t = await api('/v1/platform/tenants', { action: 'tenancy.tenant.create', object_type: 'TEN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `E2E Exposures ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`, { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `Exposures ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;
    // THREE people: the publisher (domain administrator, also the named resolver), the second member who activates, the risk owner.
    dadmin = await person(`x34-dadmin-${run}`, 'domain_admin');
    executive = await person(`x34-exec-${run}`, 'executive');
    owner = await person(`x34-owner-${run}`, 'risk_owner');
    // The taxonomy PUBLISHED by the domain administrator — pending its activation.
    const pub = await as(dadmin, '/prediction/exposures/taxonomy/publish', 'prediction.exposure.taxonomy.publish', 'RSK', null,
      { expectedVersion: 0, categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'sourcing', label: 'Sourcing', polarity: 'opportunity' }], reason: 'the first taxonomy of the domain (e2e)' });
    expect(pub.status, JSON.stringify(pub.body)).toBe(201);
  });

  test('1. the active context; the taxonomy pending; the publisher\'s own activation refused in the page\'s words', async ({ page }) => {
    await uiLogin(page, dadmin.username, PW);
    await openWorkspace(page);
    const context = page.getByLabel('active context');
    await expect(context).toContainText(T);
    await expect(context).toContainText(D);
    await expect(context).toContainText('purpose prediction');
    await expect(context).toContainText(dadmin.principalId);
    const tax = section(page, 'tax-h');
    await expect(tax).toContainText('no taxonomy in force');
    await expect(tax).toContainText('version 1 is PUBLISHED and PENDING its activation');
    await page.locator('#tax-reason').fill('the publisher tries to activate their own version (e2e)');
    await tax.getByRole('button', { name: 'Activate version 1' }).click();
    await expect(status(page, /risk taxonomy activation rejected \(separation\)/)).toBeVisible();
    await expect(tax).toContainText('no taxonomy in force');
  });

  test('2. the executive — a second named member — activates version 1: in force', async ({ page }) => {
    await uiLogin(page, executive.username, PW);
    await openWorkspace(page);
    const tax = section(page, 'tax-h');
    await page.locator('#tax-reason').fill('reviewed against the risk policy (e2e)');
    await tax.getByRole('button', { name: 'Activate version 1' }).click();
    await expect(status(page, /taxonomy version 1 is in force/)).toBeVisible();
    await expect(tax).toContainText('in force: version 1');
    await expect(tax).not.toContainText('PENDING');
    await expect(page.getByText(/committed — POL/)).toBeVisible();
  });

  test('3. the risk owner previews and accepts the exact version: the SIGNATURE rendered (digest and signer)', async ({ page }) => {
    // Seeded by the API: the RSK declared with its polarity (resting on a SYNTHETIC entity reference — the gate seeds no graph),
    // registered under the activated taxonomy, assessed by the domain administrator.
    const decl = await as(dadmin, '/graph/strategy/declare', 'graph.strategy.declare', 'RSK', null,
      { objectType: 'RSK', title: TITLE, statement: 'A corridor closure stops the magnet supply (e2e)', polarity: 'risk',
        restsOn: [{ kind: 'entity', id: crypto.randomUUID(), rationale: 'SYNTHETIC entity reference (the browser gate seeds no graph)' }] }, 'graph');
    expect(decl.status, JSON.stringify(decl.body)).toBe(201);
    rsk = (decl.body as { strategy: { objectId: string } }).strategy.objectId;
    const reg = await as(dadmin, '/prediction/exposures/register', 'prediction.exposure.register', 'RSK', rsk,
      { strategyObjectId: rsk, polarity: 'risk', category: 'supply_chain', owner: owner.principalId, reviewEveryDays: 30 });
    expect(reg.status, JSON.stringify(reg.body)).toBe(201);
    expect((reg.body as { exposure: { polarity_source: string; taxonomy_version: number } }).exposure).toMatchObject({ polarity_source: 'canonical', taxonomy_version: 1 });
    const ass = await as(dadmin, `/prediction/exposures/${rsk}/assess`, 'prediction.exposure.assess', 'RSK', rsk,
      { expectedVersion: 0, assessment: { mechanism: 'A closure delays the magnet shipments beyond the buffer (e2e)', probability: { low: 0.3, high: 0.6 },
        impact: { low: 400000, high: 900000, unit: 'EUR' }, horizon: '2024-Q1', options: [{ key: 'reroute', label: 'Reroute via the Cape', kind: 'mitigate', class: 'no_regret' }] } });
    expect(ass.status, JSON.stringify(ass.body)).toBe(201);
    const digestOf = (ass.body as { assessment: { digest: string } }).assessment.digest;

    await uiLogin(page, owner.username, PW);
    await openWorkspace(page);
    await page.getByRole('button', { name: TITLE }).click();
    await expect(page.getByRole('heading', { name: new RegExp(TITLE.replace(/[()]/g, '.')) })).toBeVisible();
    await expect(page.getByText('not signed')).toBeVisible();
    await page.getByRole('button', { name: 'Preview version 1' }).click();
    const preview = page.getByRole('region', { name: 'consequence preview' });
    await expect(preview).toContainText(digestOf);
    await page.locator('#acc-why').fill('The bracket matches the carrier notices; accepted (e2e)');
    await preview.getByRole('button', { name: 'Accept version 1' }).click();
    await expect(status(page, /the assessment was accepted/)).toBeVisible();
    // THE SIGNATURE: the act, the version, the digest's first twelve characters, the signer (the owner reads "you")
    await expect(page.getByText(new RegExp(`✍ accepted version 1 · digest ${digestOf.slice(0, 12)}… · by you`))).toBeVisible();
  });

  test('4. the owner-resolution route: nothing to resolve for an active owner; the re-owning attempt refused verbatim', async ({ page }) => {
    await uiLogin(page, dadmin.username, PW);
    await openWorkspace(page);
    await page.getByRole('button', { name: TITLE }).click();
    const res = section(page, 'owner-h');
    await expect(res.getByRole('heading', { name: 'Owner resolution' })).toBeVisible();
    await expect(res).toContainText('nothing to resolve');
    await page.locator('#reown-owner').fill(dadmin.principalId);
    await page.locator('#reown-reason').fill('an attempt around an active owner (e2e)');
    await res.getByRole('button', { name: 'Re-own the exposure' }).click();
    await expect(status(page, /exposure owner resolution rejected \(not_needed\)/)).toBeVisible();
  });
});
