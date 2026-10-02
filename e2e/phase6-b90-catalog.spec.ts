/**
 * CP-6 B90 browser walk (part K; F-P7-F-11; V7 ch49; DAT-TR-01) — THE METADATA CATALOG through the real interface on the gate's fresh
 * database (the hosted form of e2e/phase6-b90-catalog.demo.spec.ts, which reads the demonstration and is not run by this gate):
 *
 *   a data product REGISTERED, DECLARED, REVIEWED and RELEASED through the prelude's routes (the corridor transit forecasts, owned by an
 *   analyst); an EXTERNAL asset the same analyst catalogues as their own; the attention policy naming the class catalog.coverage published
 *   by the executive →
 *   /graph/data/catalog — THE STEWARD RUNS THE RECONCILIATION from the page: the registries walked (the schemas, the canonical fields, the
 *   product — its owner learnt from the registry), the coverage totals and the last-reconciliation line; DECLARES LINEAGE from the page
 *   (the external feed → feeds → the forecasts product) → the panel's downstream list; REGISTERS A STAGING ASSET WITHOUT AN OWNER from the
 *   page (unowned — coverage debt) → RUNS THE RECONCILIATION AGAIN → the staging asset flagged ORPHAN (no owner, no lineage) and
 *   UNDISCOVERABLE, its flags with their since-day and reason, the coverage debt per kind naming the orphan, the open coverage item →
 *   THE SEARCH: the external feed found with its OWNER and its LINEAGE on the hit and its trust marks; the orphan counted as hidden, never
 *   served.
 *
 * HONEST LIMITS (what this gate does not reach): the reconciliation BY THE TICK (the step catalog-reconcile, order 66) — the tick runs
 * under the scheduler, off in this gate's API, and on demand only in the test runtime; the continuity rule's stale and ownership-lapsed
 * flags rest on stated superuser moves of the database clock and are the harness's (apps/api/test/int/phase6-catalog-b90.test.ts c2), as
 * are the glossary, the clearance hiding and the trust read. The catalog DESCRIBES and INDEXES: nothing here mutates a source, a schema
 * or a product (DP-49-003) — the walk asserts what the record says.
 *
 * The seeding is the API's, in the Phase 1 idiom (the B36 walks'): this suite makes its own tenant, ONE domain and four DOMAIN principals
 * with a per-run password — the data steward, the owner (a domain analyst), the reviewer (an executive: reviews the product, publishes the
 * policy), a reader (a domain analyst). Every figure is SYNTHETIC. The selectors are the page's own (apps/web/app/graph/data/catalog/
 * page.tsx): "Search the catalog …", "Search", the labels "hidden line", "trust line", "asset trust line", "coverage totals"; the lists
 * "catalog hits", "lineage of <title>", "flags", "downstream", "upstream", "coverage debt"; the combobox "Asset"; "Run the reconciliation";
 * the lineage controls (#edge-kind, #edge-to, "Declare lineage"); the register form (#r-kind, #r-ref, #r-title, #r-owner, "Register asset").
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
const PW = `Ct90!${crypto.randomUUID()}`;
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
    principal_id: 'anonymous', purpose_id: 'executive',
    action: 'x', side_effect_class: 'reversible', consequence_class: 'C2',
    object_type: 'CAT', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-b90k',
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
type Row = Record<string, unknown>;
let admin: Ctx; let steward: Ctx; let owner: Ctx; let reviewer: Ctx; let reader: Ctx;
let T = ''; let D = ''; let P1 = '';
const PRODUCT_KEY = 'corridor-' + 'forecasts';
const PRODUCT_TITLE = `Corridor transit forecasts (e2e ${run}, SYNTHETIC)`;
const EXT_REF = 'partner:portwatch/chokepoints-' + run;
const EXT_TITLE = `Partner chokepoint feed (e2e ${run}, SYNTHETIC)`;
const STAGING_REF = 'ais_staging_2025w40';
const STAGING_TITLE = `AIS staging 2025 week 40 (e2e ${run}, SYNTHETIC)`;

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
const as = (who: Ctx, path: string, action: string, objectType: string, objectId: string | null, payload: unknown, purpose = 'executive') =>
  api(`/v1/tenants/${T}/domains/${D}${path}`, { action, scope: 'DOMAIN', tenant_id: T, domain_id: D, object_type: objectType, object_id: objectId, principal_id: `principal:${who.principalId}`, purpose_id: purpose }, payload, who.token);
const ok = (r: { status: number; body: Record<string, unknown> }, what: string, status = 201) => { expect(r.status, `${what}: ${JSON.stringify(r.body).slice(0, 400)}`).toBe(status); return r.body; };
/** A SYNTHETIC declaration (the prelude's shape). */
const DECL = (): Row => ({
  contract: { schema: [{ object_type: 'OBS', schema_version: 'v1' }] },
  serving_modes: ['api'],
  inputs: [{ kind: 'relation', ref: 'prediction.warning_events' }],
  outputs: [{ kind: 'object_type', ref: 'WRN', authority: true }],
  slo: { freshness_seconds: 3600 },
  policy: { purposes: ['executive'], data_classes: ['internal'] },
  cost: { basis: 'compute-minutes' },
  quality: { completeness: 'declared' },
});

/* ───────────────────────── the page's own selectors ───────────────────────── */
async function openCatalog(page: Page): Promise<void> {
  await page.goto('/graph/data/catalog');
  await expect(page.getByRole('heading', { name: 'Metadata Catalog', level: 1 })).toBeVisible();
  await expect(page.getByLabel('coverage totals')).toBeVisible();
}
/** The entry chosen from the entries list (a wrapping label includes its option text: select by role; the option's exact label is read from the option itself). */
async function chooseAsset(page: Page, title: string): Promise<void> {
  const assets = page.getByRole('combobox', { name: 'Asset', exact: true });
  const label = await assets.locator('option').filter({ hasText: title }).first().textContent();
  await assets.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible();
}
async function searchFor(page: Page, q: string): Promise<void> {
  await page.getByLabel(/^Search the catalog/).fill(q);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('hidden line')).toBeVisible();
}
const reconcile = async (page: Page) => {
  await page.getByRole('button', { name: 'Run the reconciliation' }).click();
  await expect(page.getByText(/committed — POL/).first()).toBeVisible();
};

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B90 — the metadata catalog: the reconciliation, the lineage, an unowned staging asset flagged orphan by the next run, the search with owner and lineage, the coverage debt', () => {
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
      { name: `E2E B90 Catalog ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`, { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `B90 Catalog ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;
    // FOUR people: the data steward (reconciles, declares lineage, registers the staging asset), the owner (a domain analyst: the product's and the external asset's),
    // the reviewer (an executive: the admission review, the attention policy), a reader (a domain analyst: searches).
    steward = await person(`k90-steward-${run}`, 'data_steward');
    owner = await person(`k90-owner-${run}`, 'domain_analyst');
    reviewer = await person(`k90-reviewer-${run}`, 'executive');
    reader = await person(`k90-reader-${run}`, 'domain_analyst');
    // THE ATTENTION POLICY names the class: catalog.coverage routes to the data steward role when no owner is a human
    ok(await as(reviewer, '/executive/attention/policy/publish', 'executive.attention.policy.publish', 'ATP', null,
      { rules: { classes: { 'catalog.coverage': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['data_steward'], ack_within_minutes: 240, notify: 'in_app' } } },
        reason: 'the catalog coverage class for the B90 catalog walk (e2e)' }), 'the attention policy published');
    // THE PRODUCT through the prelude's routes: register → declare → review → release (its catalog entry is the reconciliation's, its owner learnt from the registry)
    const reg = ok(await as(steward, '/products/register', 'products.product.register', 'DPR', null,
      { key: PRODUCT_KEY, title: PRODUCT_TITLE, kind: 'forecast', purpose: 'the corridor transit forecasts served to the executive view (e2e, SYNTHETIC)', ownerPrincipalId: owner.principalId }), 'the product registered');
    P1 = String((reg as { product: { product_id: string } }).product.product_id);
    ok(await as(owner, `/products/${P1}/declare`, 'products.product.declare', 'DPR', P1, { declaration: DECL() }), 'v1 declared');
    ok(await as(reviewer, `/products/${P1}/reviews`, 'products.product.review', 'DPR', P1, { version: 1, kind: 'admission', outcome: 'accepted', notes: 'the forecast product reviewed for the domain (e2e, SYNTHETIC)' }), 'the admission review');
    ok(await as(owner, `/products/${P1}/release`, 'products.product.release', 'DPR', P1, { version: 1 }), 'v1 released');
    // THE EXTERNAL ASSET the owner catalogues as their own (accepted as declared: no registry behind it)
    const ext = ok(await as(owner, '/products/catalog/assets/register', 'products.catalog.asset.register', 'CAT', null,
      { kind: 'external', ref: EXT_REF, title: EXT_TITLE, description: 'a partner feed of chokepoint transits (e2e, SYNTHETIC)', ownerPrincipalId: owner.principalId, classification: 'internal' }), 'the external asset catalogued');
    expect((ext as { asset: Row }).asset).toMatchObject({ kind: 'external', owner_principal_id: owner.principalId, flags: [], trusted: true, discoverable: true });
  });

  test('1. the steward runs the reconciliation from the page — the registries walked, the product\'s entry with its owner; declares lineage from the page: the external feed → feeds → the forecasts', async ({ page }) => {
    await uiLogin(page, steward.username, PW);
    await openCatalog(page);
    await expect(page.getByText('No reconciliation has run in this domain.')).toBeVisible();
    await expect(page.getByLabel('coverage totals')).toContainText('1 entries · 0 unowned');
    await reconcile(page);
    await expect(page.getByText(/^Last reconciliation .* \(steward\): \d+ seen · \d+ created · 0 cleared · 0 attention item\(s\) · staleness 7 days · recertification 180 days$/)).toBeVisible();
    const totals = await page.getByLabel('coverage totals').textContent();
    expect(Number(/^(\d+) entries/.exec(totals ?? '')?.[1] ?? 0), totals ?? '').toBeGreaterThan(40); // the schemas and the canonical fields, the product, the external asset
    await expect(page.getByLabel('coverage totals')).toContainText('0 undiscoverable');
    // THE PRODUCT'S ENTRY: its owner learnt from the registry, released v1, the lineage-missing flag a released product without an edge carries
    await chooseAsset(page, PRODUCT_TITLE);
    await expect(page.getByText(`data product · ${P1}`)).toBeVisible();
    await expect(page.getByText(owner.username, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(`${PRODUCT_KEY} · released · released v1`)).toBeVisible();
    await expect(page.getByRole('list', { name: 'flags' })).toContainText('⋯ lineage missing — a released product with no lineage edge');
    await expect(page.getByLabel('asset trust line')).toHaveText('✓ trusted · ◎ discoverable');
    // THE LINEAGE from the external feed's panel: this asset — feeds → the forecasts (the steward's act; an owner declares on their own assets)
    await chooseAsset(page, EXT_TITLE);
    await expect(page.getByText('No downstream lineage is declared.')).toBeVisible();
    await page.locator('#edge-kind').selectOption('feeds');
    const target = page.locator('#edge-to');
    const targetLabel = await target.locator('option').filter({ hasText: PRODUCT_TITLE }).first().textContent();
    await target.selectOption({ label: targetLabel ?? '' });
    await page.getByRole('button', { name: 'Declare lineage' }).click();
    await expect(page.getByRole('list', { name: 'downstream' })).toContainText(`this asset — feeds → ${PRODUCT_TITLE} (data product)`);
    await expect(page.getByRole('list', { name: 'downstream' })).toContainText('· declared');
    // the product's side: the edge upstream, the lineage-missing flag cleared by the read
    await page.getByRole('list', { name: 'downstream' }).getByRole('button', { name: new RegExp(PRODUCT_TITLE.replace(/[()]/g, '\\$&')) }).click();
    await expect(page.getByRole('heading', { name: PRODUCT_TITLE, level: 2 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'upstream' })).toContainText(`${EXT_TITLE} (external asset) — feeds → this asset`);
    await expect(page.getByText('No flag stands on this asset.')).toBeVisible();
  });

  test('2. the steward registers a staging asset WITHOUT an owner from the page (unowned — coverage debt); the next reconciliation flags it ORPHAN and undiscoverable — its flags, the coverage debt per kind, the open item', async ({ page }) => {
    await uiLogin(page, steward.username, PW);
    await openCatalog(page);
    await page.locator('#r-kind').selectOption('staging');
    await page.locator('#r-ref').fill(STAGING_REF);
    await page.locator('#r-title').fill(STAGING_TITLE);
    await page.locator('#r-desc').fill('an intermediate extract of AIS positions before admission (e2e, SYNTHETIC)');
    await expect(page.locator('#r-owner')).toHaveValue('');
    await page.locator('#r-class').selectOption('internal');
    await page.getByRole('button', { name: 'Register asset' }).click();
    await expect(page.getByText(/committed — POL/).first()).toBeVisible();
    await chooseAsset(page, STAGING_TITLE);
    await expect(page.getByText(`staging asset · ${STAGING_REF}`)).toBeVisible();
    await expect(page.getByText('— none (coverage debt)')).toBeVisible();
    const flags = page.getByRole('list', { name: 'flags' });
    await expect(flags).toContainText('⚑ unowned — coverage debt: no named owner · since');
    await expect(flags).not.toContainText('orphan');
    await expect(page.getByLabel('asset trust line')).toHaveText('✓ trusted · ◎ discoverable');
    await expect(page.getByText('no registry observation (declared as is)')).toBeVisible();
    // THE SECOND RECONCILIATION: a staging asset with no owner and no lineage is an orphan — undiscoverable; the coverage item raised once
    await reconcile(page);
    await expect(page.getByText(/^Last reconciliation .* \(steward\): \d+ seen · 0 created · \d+ cleared · 1 attention item\(s\)/)).toBeVisible();
    await expect(page.getByLabel('coverage totals')).toContainText('1 undiscoverable');
    await expect(page.getByLabel('coverage totals')).toContainText('1 open coverage item(s)');
    await expect(page.getByRole('list', { name: 'coverage debt' })).toContainText('staging asset: 1 total · 0 owned · 1 trusted · 0 discoverable · 0 with lineage · flags: orphan 1, unowned 1');
    await expect(page.getByRole('list', { name: 'coverage debt' })).toContainText('data product: 1 total · 1 owned · 1 trusted · 1 discoverable · 1 with lineage');
    await chooseAsset(page, STAGING_TITLE);
    const after = page.getByRole('list', { name: 'flags' });
    await expect(after).toContainText(/⊘ orphan — no registry row, or a staging asset with no owner and no lineage \(undiscoverable\) · since \d{4}-\d{2}-\d{2} — /);
    await expect(after).toContainText(/⚑ unowned — coverage debt: no named owner · since \d{4}-\d{2}-\d{2} — /);
    await expect(page.getByLabel('asset trust line')).toHaveText('✓ trusted · ⊘ undiscoverable (orphan)');
    await expect(page.getByRole('button', { name: 'Set owner' })).toBeVisible();
  });

  test('3. the search (a reader): the external feed found with its owner, its lineage to the forecasts and its trust marks on the hit; the orphan is counted as hidden, never served; a reader holds none of the steward\'s acts', async ({ page }) => {
    await uiLogin(page, reader.username, PW);
    await openCatalog(page);
    await expect(page.getByRole('button', { name: 'Run the reconciliation' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Register an asset' })).toHaveCount(0);
    await expect(page.getByText(/data steward's acts/)).toBeVisible();
    await searchFor(page, 'Partner chokepoint feed');
    await expect(page.getByLabel('hidden line')).toHaveText('1 match(es), nothing hidden');
    await expect(page.getByText('your clearance is internal')).toBeVisible();
    const hit = page.getByRole('list', { name: 'catalog hits' }).locator('li').filter({ hasText: EXT_TITLE }).first();
    await expect(hit).toBeVisible();
    await expect(hit).toContainText(`external asset ${EXT_REF} · owner ${owner.username}`);
    await expect(hit.getByLabel('trust line')).toHaveText('✓ trusted · ◎ discoverable');
    await expect(hit.getByRole('list', { name: `lineage of ${EXT_TITLE}` })).toContainText(`this asset — feeds → ${PRODUCT_TITLE} (data product)`);
    // the hit opens the panel: the owner and the recertification day, the downstream edge
    await hit.getByRole('button', { name: EXT_TITLE, exact: true }).click();
    await expect(page.getByRole('heading', { name: EXT_TITLE, level: 2 })).toBeVisible();
    await expect(page.getByText(/recertify by \d{4}-\d{2}-\d{2}/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'downstream' })).toContainText(`this asset — feeds → ${PRODUCT_TITLE} (data product)`);
    await expect(page.getByRole('button', { name: 'Set owner' })).toHaveCount(0);
    // THE ORPHAN: counted as hidden, never served
    await searchFor(page, STAGING_REF);
    await expect(page.getByLabel('hidden line')).toHaveText('1 match(es) · 1 hidden: 1 undiscoverable, 0 above your clearance');
    await expect(page.getByText('No discoverable entry matches.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'catalog hits' })).toHaveCount(0);
    // the coverage debt a reader sees is the same record
    await expect(page.getByLabel('coverage totals')).toContainText('1 undiscoverable');
    await expect(page.getByRole('list', { name: 'coverage debt' })).toContainText('flags: orphan 1, unowned 1');
  });
});
