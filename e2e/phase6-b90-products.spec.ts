/**
 * CP-6 B90 browser walk (part R; F-P7-F-09) — THE DATA PRODUCT REGISTRY through the real interface on the gate's fresh database (the hosted
 * form of e2e/phase6-b90-products.demo.spec.ts, which reads the demonstration and is not run by this gate):
 *
 *   the product REGISTERED by the steward for a named owner, DECLARED by its owner, REVIEWED for admission by someone else and RELEASED by
 *   its owner — through the routes; ONE SLO observation recorded through the route →
 *   /graph/data/products — THE LIST: the released product with its state in words, its owner, its released version and the honest
 *   scorecard cell (none yet: the schedule computes one per tick); the state filter (a labelled select) narrows to the states present →
 *   /graph/data/products/<id> — THE PRODUCT PAGE: the state, the authority banner naming the next acts and who holds each, the versions
 *   (v1 RELEASED by its owner), the admission review by its reviewer with its notes, the SLO observation as recorded, the events ledger;
 *   the owner COMPUTES A SCORECARD NOW (the verdict, the attainment against the declared floor, the measure row) →
 *   THE OWNER DEGRADES from the page with a reason → the state DEGRADED with the reason and the instant, product.degraded in the ledger →
 *   THE REVIEWER RECORDS AN ACCEPTED DOMAIN REVIEW from the page (the restoration's evidence; the owner cannot review their own product) →
 *   THE OWNER RESTORES from the page → the state RELEASED again, product.restored in the ledger, the banner's next acts.
 *
 * HONEST LIMITS (what this gate does not reach): the scorecard BY THE TICK (the step product-scorecards, order 64) and the degradation the
 * tick pronounces after grace_ticks consecutive below-floor scorecards, with the consumers' product.degradation items — the tick runs under
 * the scheduler, off in this gate's API, and on demand only in the test runtime (apps/api/test/int/phase6-products-b90.test.ts c.) and on
 * the demonstration; the consumers' acceptance and contract tests, the cost, the withdrawal and the retirement are the harness's and the
 * demonstration walk's. Nothing rendered here claims otherwise: the list's scorecard cell reads its honest "no scorecard yet" until the
 * owner computes one on demand.
 *
 * The seeding is the API's, in the Phase 1 idiom (the B36 walks'): this suite makes its own tenant, ONE domain and three DOMAIN principals
 * with a per-run password — the data steward, the owner (a domain analyst), the reviewer (an executive). Every figure is SYNTHETIC. The
 * selectors are the pages' own (apps/web/app/graph/data/products/page.tsx, [productId]/page.tsx): the table "data products", the combobox
 * "State", the labels "product state", "scorecard verdict", "authority banner", "attainment line", "degradation"; the lists "versions",
 * "reviews", "product events"; the tables "slo observations", "slo measures"; #reason, "Degrade", "Restore", "Compute scorecard now";
 * the review form (#review-version, #review-kind, #review-outcome, #review-notes, "Record review").
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
const PW = `Pr90!${crypto.randomUUID()}`;
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
    object_type: 'DPR', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-b90r',
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
let admin: Ctx; let steward: Ctx; let owner: Ctx; let reviewer: Ctx;
let T = ''; let D = ''; let P1 = '';
const KEY = 'corridor-' + 'warning-stream';
const TITLE = `Corridor warning stream (e2e ${run}, SYNTHETIC)`;
const DEGRADE_REASON = 'the corridor feed lags behind its publisher; served from the last edition (e2e, SYNTHETIC)';
const RESTORE_NOTE = 'restored after the domain review of the corridor stream (e2e, SYNTHETIC)';
const DOMAIN_REVIEW_NOTES = 'the corridor stream reviewed for the domain after its degradation: the feed recovered (e2e, SYNTHETIC)';

async function person(login: string, roleCode: string): Promise<Ctx> {
  const p = await api(`/v1/tenants/${T}/principals`,
    { action: 'identity.principal.create', scope: 'TENANT', tenant_id: T, object_type: 'PRN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
    { kind: 'human', displayName: login, loginName: login, password: PW, roleCode, domainId: D }, admin.token);
  expect(p.status, `${login} (${roleCode}) created`).toBe(201);
  const l = await loginApi(login, PW);
  expect(l.status, `${login} signed in`).toBe(201);
  return { token: (l.body as { tokens: { accessToken: string } }).tokens.accessToken, principalId: (l.body as { principalId: string }).principalId, username: login };
}
/** A governed act of this suite's seeding, in the domain, as one of its people (the products routes: object type DPR, purpose executive). */
const as = (who: Ctx, path: string, action: string, objectId: string | null, payload: unknown, objectType = 'DPR') =>
  api(`/v1/tenants/${T}/domains/${D}${path}`, { action, scope: 'DOMAIN', tenant_id: T, domain_id: D, object_type: objectType, object_id: objectId, principal_id: `principal:${who.principalId}`, purpose_id: 'executive' }, payload, who.token);
const ok = (r: { status: number; body: Record<string, unknown> }, what: string, status = 201) => { expect(r.status, `${what}: ${JSON.stringify(r.body).slice(0, 400)}`).toBe(status); return r.body; };
/** A SYNTHETIC declaration (the prelude harness's shape): a contract by registered schema, two serving modes, one input relation, one authoritative output, an SLO with its floor, a policy, a cost, a quality. */
const DECL = (): Row => ({
  contract: { schema: [{ object_type: 'OBS', schema_version: 'v1' }] },
  serving_modes: ['event', 'api'],
  inputs: [{ kind: 'relation', ref: 'prediction.warning_events' }],
  outputs: [{ kind: 'object_type', ref: 'WRN', authority: true }],
  slo: { availability_pct: 99, lag_events: 2, attainment_floor_pct: 95, grace_ticks: 2 },
  policy: { purposes: ['executive'], data_classes: ['internal'] },
  cost: { basis: 'compute-minutes', monthly_estimate: 12 },
  quality: { completeness: 'declared' },
});

/* ───────────────────────── the pages' own selectors ───────────────────────── */
const short8 = (id: string) => `${id.slice(0, 8)}…`;
async function openList(page: Page): Promise<void> {
  await page.goto('/graph/data/products');
  await expect(page.getByRole('heading', { name: 'Data products', level: 1 })).toBeVisible();
}
async function openProduct(page: Page): Promise<void> {
  await page.goto(`/graph/data/products/${P1}`);
  await expect(page.getByRole('heading', { name: TITLE, level: 1 })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B90 — the data product registry: register → declare → review → release through the routes; the list, the product page, the owner\'s degradation and restoration from the page', () => {
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
      { name: `E2E B90 Products ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`, { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `B90 Products ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;
    // THREE people: the data steward (registers for the owner, observes the SLO), the owner (declares, releases, degrades, restores), the reviewer (an executive — never the owner).
    steward = await person(`r90-steward-${run}`, 'data_steward');
    owner = await person(`r90-owner-${run}`, 'domain_analyst');
    reviewer = await person(`r90-reviewer-${run}`, 'executive');
    // THE REGISTRY CORE through the routes (0095 §0): register → declare → review → release; the DPR admitted in the release
    const reg = ok(await as(steward, '/products/register', 'products.product.register', null,
      { key: KEY, title: TITLE, kind: 'event', purpose: 'the early warnings of the corridor as a subscribable event product (e2e, SYNTHETIC)', ownerPrincipalId: owner.principalId }), 'the product registered');
    P1 = String((reg as { product: { product_id: string } }).product.product_id);
    const v1 = ok(await as(owner, `/products/${P1}/declare`, 'products.product.declare', P1, { declaration: DECL() }), 'v1 declared');
    expect((v1 as { product: { version: number; state: string } }).product).toMatchObject({ version: 1, state: 'registered' });
    ok(await as(reviewer, `/products/${P1}/reviews`, 'products.product.review', P1,
      { version: 1, kind: 'admission', outcome: 'accepted', notes: 'the contract, the SLO and the policy reviewed for the domain (e2e, SYNTHETIC)' }), 'the admission review recorded');
    const rel = ok(await as(owner, `/products/${P1}/release`, 'products.product.release', P1, { version: 1 }), 'v1 released');
    expect((rel as { product: { state: string; released_version: number; dpr: { schema_ref: string } } }).product).toMatchObject({ state: 'released', released_version: 1, dpr: { schema_ref: 'DPR@v1' } });
    // ONE SLO OBSERVATION in the one ledger (SYNTHETIC): the availability probe met its threshold
    ok(await as(steward, `/products/${P1}/slo`, 'products.slo.observe', P1,
      { measure: 'availability_pct', value: 99.9, threshold: 99.5, met: true, source: 'synthetic availability probe (e2e)' }), 'the SLO observed');
  });

  test('1. /graph/data/products — the list: the released product with its state in words, its owner, its released version, the honest scorecard cell; the state filter narrows', async ({ page }) => {
    await uiLogin(page, steward.username, PW);
    await openList(page);
    const table = page.getByRole('table', { name: 'data products' });
    const row = table.getByRole('row').filter({ has: page.getByRole('link', { name: TITLE, exact: true }) });
    await expect(row).toBeVisible();
    await expect(row).toContainText(KEY);
    await expect(row).toContainText('event');
    await expect(row.getByLabel('product state')).toHaveText('● released — the contract is served');
    await expect(row).toContainText(short8(owner.principalId));
    await expect(row).toContainText('v1');
    // no scorecard yet: the schedule computes one per tick on a released product — said, not faked
    await expect(row.getByLabel('scorecard verdict')).toHaveText('no scorecard yet — the schedule computes one per tick on a released product');
    // THE STATE FILTER (a wrapping label includes its option text: select by role)
    await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('registered');
    await expect(page.getByText('No data product is registered in this domain in the state registered.')).toBeVisible();
    await page.getByRole('combobox', { name: 'State', exact: true }).selectOption('released');
    await expect(page.getByRole('table', { name: 'data products' }).getByRole('link', { name: TITLE, exact: true })).toBeVisible();
    // the steward may register a product for a named owner: the form is offered
    await expect(page.getByRole('heading', { name: 'Register a product', level: 2 })).toBeVisible();
  });

  test('2. the product page: the state, the authority banner, the versions (v1 RELEASED by its owner), the admission review, the SLO observation; the owner computes a scorecard now — the verdict, the attainment against the floor', async ({ page }) => {
    await uiLogin(page, owner.username, PW);
    await openProduct(page);
    await expect(page.getByLabel('product state')).toHaveText('● released — the contract is served');
    await expect(page.getByLabel('authority banner')).toContainText('Next: release (the owner — a newer reviewed version); degrade (the owner or the data steward — with a reason; every accepted consumer is notified); withdraw (the owner — with a reason; the released version stays the last valid one); retire (the owner — no accepted consumer, an accepted retirement review).');
    await expect(page.getByText(`${short8(owner.principalId)} (you)`)).toBeVisible();
    await expect(page.getByText('v1 released', { exact: false }).first()).toBeVisible();
    // THE VERSIONS AND THE REVIEWS as the record says them
    const versions = page.getByRole('list', { name: 'versions' });
    await expect(versions).toContainText(`v1 — digest`);
    await expect(versions).toContainText(`declared by ${short8(owner.principalId)}`);
    await expect(versions).toContainText(`RELEASED by ${short8(owner.principalId)} at`);
    const reviews = page.getByRole('list', { name: 'reviews' });
    await expect(reviews).toContainText(`admission review of v1: accepted by ${short8(reviewer.principalId)} at`);
    await expect(reviews).toContainText('the contract, the SLO and the policy reviewed for the domain (e2e, SYNTHETIC)');
    // THE SLO OBSERVATION as recorded (the one ledger)
    const obs = page.getByRole('table', { name: 'slo observations' }).getByRole('row').filter({ hasText: 'availability_pct' });
    await expect(obs).toContainText('99.9');
    await expect(obs).toContainText('99.5');
    await expect(obs).toContainText('met');
    await expect(obs).toContainText('synthetic availability probe (e2e)');
    // THE LEDGER so far
    const events = page.getByRole('list', { name: 'product events' });
    for (const e of ['product.registered', 'product.declared', 'product.reviewed', 'product.released', 'slo.observed']) await expect(events).toContainText(e);
    // no scorecard yet (the schedule's), said; THE OWNER COMPUTES ONE NOW — the verdict and the attainment are the server's
    await expect(page.getByText('No scorecard yet — the schedule computes one per tick on a released product; the owner or the steward may compute one now.')).toBeVisible();
    await page.getByRole('button', { name: 'Compute scorecard now' }).click();
    await expect(page.getByLabel('scorecard verdict')).toHaveText('✓ ok — the levels held, the reviews stand, lineage and policy closed');
    await expect(page.getByLabel('attainment line')).toHaveText(/^attainment 100(\.00)?% vs floor 95(\.00)?% over 30 day\(s\)$/);
    await expect(page.getByText(`by ${short8(owner.principalId)} · window 30 day(s) · the product stood released`)).toBeVisible();
    const measure = page.getByRole('table', { name: 'slo measures' }).getByRole('row').filter({ hasText: 'availability_pct' });
    await expect(measure).toContainText('99.9');
    await expect(page.getByText(/committed — POL/).first()).toBeVisible();
  });

  test('3. the owner DEGRADES from the page with a reason — DEGRADED with the reason and the instant; the reviewer records an accepted DOMAIN review from the page; the owner RESTORES — RELEASED again, both acts in the ledger', async ({ page }) => {
    await uiLogin(page, owner.username, PW);
    await openProduct(page);
    // the reason gates the act (8 characters or more); the degradation is the owner's own act
    await expect(page.getByRole('button', { name: 'Degrade', exact: true })).toBeDisabled();
    await page.locator('#reason').fill(DEGRADE_REASON);
    await page.getByRole('button', { name: 'Degrade', exact: true }).click();
    await expect(page.getByLabel('product state')).toHaveText('◐ degraded — served, its levels missed; the consumers were notified');
    await expect(page.getByLabel('degradation')).toContainText(`${DEGRADE_REASON} — at`);
    await expect(page.getByLabel('authority banner')).toContainText('Next: restore (the owner — through a scorecard that reads ok or a domain review newer than the degradation)');
    await expect(page.getByRole('list', { name: 'product events' })).toContainText(`product.degraded`);
    await expect(page.getByRole('list', { name: 'product events' })).toContainText(`— ${DEGRADE_REASON}`);
    await expect(page.getByRole('button', { name: 'Degrade', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
    // THE REVIEWER (never the owner) records the DOMAIN review from the page — the evidence a restoration rests on
    await uiLogin(page, reviewer.username, PW);
    await openProduct(page);
    await expect(page.getByRole('heading', { name: 'Record a review (you are not the owner)', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Your acts as/ })).toHaveCount(0);
    await page.locator('#review-version').selectOption('1');
    await page.locator('#review-kind').selectOption('domain');
    await page.locator('#review-outcome').selectOption('accepted');
    await page.locator('#review-notes').fill(DOMAIN_REVIEW_NOTES);
    await page.getByRole('button', { name: 'Record review' }).click();
    const reviews = page.getByRole('list', { name: 'reviews' });
    await expect(reviews).toContainText(`domain review of v1: accepted by ${short8(reviewer.principalId)} at`);
    await expect(reviews).toContainText(DOMAIN_REVIEW_NOTES);
    // THE OWNER RESTORES from the page (the note is the reason field)
    await uiLogin(page, owner.username, PW);
    await openProduct(page);
    await expect(page.getByLabel('product state')).toHaveText('◐ degraded — served, its levels missed; the consumers were notified');
    await page.locator('#reason').fill(RESTORE_NOTE);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByLabel('product state')).toHaveText('● released — the contract is served');
    await expect(page.getByLabel('degradation')).toHaveCount(0);
    await expect(page.getByLabel('authority banner')).toContainText('Next: release (the owner — a newer reviewed version); degrade');
    const events = page.getByRole('list', { name: 'product events' });
    await expect(events).toContainText('product.restored');
    await expect(events.getByText(/product\.degraded/)).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(0);
    await expect(page.getByText(/committed — POL/).first()).toBeVisible();
  });
});
