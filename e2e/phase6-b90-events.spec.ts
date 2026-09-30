/**
 * CP-6 B90 browser walk (part E; F-P7-F-09's event half; V7 ch43) — EVENT PRODUCTS AND SUBSCRIPTIONS through the real interface on the
 * gate's fresh database (the hosted form of e2e/phase6-b90-events.demo.spec.ts, which reads the demonstration and is not run by this gate):
 *
 *   the corridor warning stream (kind event) REGISTERED by the steward for its owner, EVENT-DECLARED by the owner over the platform's own
 *   ledger prediction.warning_events (a versioned schema of five fields, the subject kind, the ordering key, pull, the retention, the
 *   replay policy), DECLARED (the contract by WRN@v2; the policy purposes executive and procurement), REVIEWED by someone else and RELEASED
 *   — through the routes →
 *   /graph/data/events — THE CONSUMER (a procurement analyst) reads the product: the schema and its fields, the source ledger, the
 *   retention and its floor, the stream head; and REGISTERS ITS SUBSCRIPTION from the page under the authority boundary (the purpose, three
 *   of the five fields, the consequence class, the lag policy, the capabilities) → its state REGISTERED, its checkpoint and lag against
 *   the policy in words →
 *   THE OWNER reads the subscriptions with their state, checkpoint and lag; AUTHORIZES from the page → ACTIVE; PAUSES with a reason from the
 *   page → PAUSED (owner) with the pause note, Resume offered → the consumer sees the pause and is offered the conformance declaration.
 *
 * HONEST LIMITS (what this gate does not reach): the STREAM itself — the emitter is the tick step event-products (order 61), which runs
 * under the scheduler (off in this gate's API) and on demand only in the test runtime and on the demonstration: the head reads 0 here, the
 * lag 0 event(s) behind, and no event is served; the LAG PAUSE by the tick step subscription-lag (63) with the owner's attention item and
 * the lag SLO observation, the schema pause, the replay and the correction withholding are the harness's
 * (apps/api/test/int/phase6-events-b90.test.ts b, d–f) and the demonstration walk's. Nothing rendered here claims otherwise.
 *
 * The seeding is the API's, in the Phase 1 idiom (the B36 walks'): this suite makes its own tenant, ONE domain and four DOMAIN principals
 * with a per-run password — the data steward, the owner (a forecast owner), the reviewer (an executive), the consumer (a domain analyst).
 * Every figure is SYNTHETIC. The selectors are the page's own (apps/web/app/graph/data/events/page.tsx): the combobox "Event product", the
 * labels "product state", "schema line", "retention line", "stream head", "my subscription state", "my lag", "subscription state",
 * "subscription lag"; the form "register subscription" (#sub-purpose, the field checkboxes, "Register subscription"); the list
 * "subscriptions"; #owner-reason, "Authorize", "Pause", "Resume", "Revoke"; "Declare conformance", "Acknowledge".
 */
import { createHash } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';

const API = 'http://localhost:3401';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be provided (generated .eye-local/env or caller environment)`);
  return v;
}
const BOOTSTRAP_PW = required('EYE_TEST_BOOTSTRAP_PASSWORD');
const ADMIN_PW = required('EYE_TEST_ADMIN_PASSWORD');
/** One per-run password for the principals this suite creates; it lives in the worker's memory only. */
const PW = `Ev90!${crypto.randomUUID()}`;
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
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-b90e',
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
let admin: Ctx; let steward: Ctx; let owner: Ctx; let reviewer: Ctx; let consumer: Ctx;
let T = ''; let D = ''; let P1 = '';
const KEY = 'corridor-' + 'warning-stream';
const TITLE = `Corridor warning stream (e2e ${run}, SYNTHETIC)`;
const PAUSE_REASON = 'the procurement ledger migrates this week; delivery held until it conforms (e2e, SYNTHETIC)';

async function person(login: string, roleCode: string): Promise<Ctx> {
  const p = await api(`/v1/tenants/${T}/principals`,
    { action: 'identity.principal.create', scope: 'TENANT', tenant_id: T, object_type: 'PRN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
    { kind: 'human', displayName: login, loginName: login, password: PW, roleCode, domainId: D }, admin.token);
  expect(p.status, `${login} (${roleCode}) created`).toBe(201);
  const l = await loginApi(login, PW);
  expect(l.status, `${login} signed in`).toBe(201);
  return { token: (l.body as { tokens: { accessToken: string } }).tokens.accessToken, principalId: (l.body as { principalId: string }).principalId, username: login };
}
/** A governed act of this suite's seeding, in the domain, as one of its people (the products routes: purpose executive). */
const as = (who: Ctx, path: string, action: string, objectId: string | null, payload: unknown, objectType = 'DPR') =>
  api(`/v1/tenants/${T}/domains/${D}${path}`, { action, scope: 'DOMAIN', tenant_id: T, domain_id: D, object_type: objectType, object_id: objectId, principal_id: `principal:${who.principalId}`, purpose_id: 'executive' }, payload, who.token);
const ok = (r: { status: number; body: Record<string, unknown> }, what: string, status = 201) => { expect(r.status, `${what}: ${JSON.stringify(r.body).slice(0, 400)}`).toBe(status); return r.body; };
/** The SYNTHETIC event declaration over the warning ledger (the events harness's): five declared fields, the subject kind, the ordering key, pull, the retention, the replay policy. */
const EVENT_DECL = (): Row => ({
  schema: { version: 'v1', fields: [{ name: 'title', type: 'string' }, { name: 'consequence_class', type: 'string' }, { name: 'confidence', type: 'number' }, { name: 'closes_at', type: 'instant' }, { name: 'routed_to', type: 'uuid' }] },
  subject_kind: 'warning', ordering_key: 'subject_id', delivery: 'pull', retention_days: 30, replay_policy: { allowed: true },
  source: { ledger: 'prediction.warning_events', kinds: ['warning.raised', 'warning.retracted'] },
});
/** The prelude's SYNTHETIC declaration: the contract by the WRN schema row; the purposes name the procurement consumer's. */
const DECL = (): Row => ({
  contract: { schema: [{ object_type: 'WRN', schema_version: 'v2' }] }, serving_modes: ['event'],
  inputs: [{ kind: 'relation', ref: 'prediction.warning_events' }], outputs: [{ kind: 'object_type', ref: 'WRN', authority: false }],
  slo: { lag_events: 2 }, policy: { purposes: ['executive', 'procurement'], data_classes: ['internal'] }, cost: { basis: 'compute-minutes' }, quality: { completeness: 'declared' },
});

/* ───────────────────────── the page's own selectors ───────────────────────── */
const short8 = (id: string) => `${id.slice(0, 8)}…`;
const LAG_LINE = 'checkpoint 0 of head 0 — 0 event(s) behind (policy 2 events / 86400 s)';
async function openStream(page: Page): Promise<void> {
  await page.goto('/graph/data/events');
  await expect(page.getByRole('heading', { name: 'Event products', level: 1 })).toBeVisible();
  // a wrapping <label> includes its option text: select by role; selectOption takes the option's exact label, read from the option itself
  const products = page.getByRole('combobox', { name: 'Event product', exact: true });
  const label = await products.locator('option').filter({ hasText: TITLE }).first().textContent();
  await products.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: TITLE, level: 2 })).toBeVisible();
}
/** The one subscription's item in the owner's list. */
const subItem = (page: Page): Locator => page.getByRole('list', { name: 'subscriptions' }).locator('li').filter({ hasText: `consumer ${short8(consumer.principalId)}` });

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B90 — event products and subscriptions: the stream released through the routes; the consumer registers from the page, the owner authorizes and pauses with a reason', () => {
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
      { name: `E2E B90 Events ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`, { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `B90 Events ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;
    // FOUR people: the data steward (registers for the owner), the owner (a forecast owner: event-declares, declares, releases, authorizes, pauses),
    // the reviewer (an executive — never the owner), the consumer (a domain analyst: NORDWERK procurement, SYNTHETIC).
    steward = await person(`e90-steward-${run}`, 'data_steward');
    owner = await person(`e90-owner-${run}`, 'forecast_owner');
    reviewer = await person(`e90-reviewer-${run}`, 'executive');
    consumer = await person(`e90-procurement-${run}`, 'domain_analyst');
    // THE EVENT PRODUCT through the routes: register → event-declare → declare → review → release
    const reg = ok(await as(steward, '/products/register', 'products.product.register', null,
      { key: KEY, title: TITLE, kind: 'event', purpose: 'the corridor early warnings as a subscribable event product (e2e, SYNTHETIC)', ownerPrincipalId: owner.principalId }), 'the product registered');
    P1 = String((reg as { product: { product_id: string } }).product.product_id);
    const ev = ok(await as(owner, `/products/events/${P1}/declare`, 'products.event_product.declare', P1, { declaration: EVENT_DECL() }), 'the event declaration');
    expect((ev as { event_product: Row }).event_product).toMatchObject({ declaration_version: 1, schema_version: 'v1', delivery: 'pull', retention_days: 30 });
    ok(await as(owner, `/products/${P1}/declare`, 'products.product.declare', P1, { declaration: DECL() }), 'v1 declared');
    ok(await as(reviewer, `/products/${P1}/reviews`, 'products.product.review', P1,
      { version: 1, kind: 'admission', outcome: 'accepted', notes: 'the event contract, its SLO and its purposes reviewed (e2e, SYNTHETIC)' }), 'the admission review recorded');
    const rel = ok(await as(owner, `/products/${P1}/release`, 'products.product.release', P1, { version: 1 }), 'v1 released');
    expect((rel as { product: { state: string; released_version: number } }).product).toMatchObject({ state: 'released', released_version: 1 });
  });

  test('1. the consumer reads the released stream (the schema and its fields, the source ledger, the retention, the head — 0: no tick on this gate) and REGISTERS its subscription from the page: REGISTERED, its checkpoint and lag in words', async ({ page }) => {
    await uiLogin(page, consumer.username, PW);
    await openStream(page);
    await expect(page.getByLabel('product state')).toHaveText('released v1');
    await expect(page.getByLabel('schema line')).toHaveText('v1 (additive) — fields closes_at, confidence, consequence_class, routed_to, title');
    await expect(page.getByText('prediction.warning_events')).toBeVisible();
    await expect(page.getByText('warning.raised, warning.retracted')).toBeVisible();
    await expect(page.getByText('carries corrections')).toBeVisible();
    await expect(page.getByText('warning · subject_id · pull')).toBeVisible();
    await expect(page.getByLabel('retention line')).toContainText(/^30 day\(s\) — rows before .* are not served$/);
    await expect(page.getByText('replay allowed')).toBeVisible();
    // the emitter is the tick's (order 61), which this gate does not run: the head is 0 and no row is streamed — the honest state, said
    await expect(page.getByLabel('stream head')).toHaveText('0');
    await expect(page.getByText('0 row(s) within retention of 0 · no rows yet')).toBeVisible();
    await expect(page.getByText('not yet observed')).toBeVisible();
    // no subscription yet on the product (the consumer sees no owner controls)
    await expect(page.getByText('No subscription on this product yet.')).toBeVisible();
    await expect(page.locator('#owner-reason')).toHaveCount(0);
    // THE REGISTRATION under the authority boundary: the purpose, three of the five fields, C2, the lag policy 2 / 86400, both capabilities
    const form = page.getByRole('form', { name: 'register subscription' });
    await form.locator('#sub-purpose').fill('procurement');
    for (const f of ['closes_at', 'confidence', 'consequence_class', 'routed_to', 'title']) await expect(form.getByRole('checkbox', { name: f, exact: true })).toBeChecked();
    await form.getByRole('checkbox', { name: 'confidence', exact: true }).uncheck();
    await form.getByRole('checkbox', { name: 'routed_to', exact: true }).uncheck();
    await expect(form.locator('#sub-consequence')).toHaveValue('C2');
    await expect(form.locator('#sub-lag-events')).toHaveValue('2');
    await expect(form.locator('#sub-lag-seconds')).toHaveValue('86400');
    await expect(form.getByRole('checkbox', { name: 'I can process corrections' })).toBeChecked();
    await expect(form.getByRole('checkbox', { name: 'I can process replays' })).toBeChecked();
    await form.getByRole('button', { name: 'Register subscription' }).click();
    // MY SUBSCRIPTION as the server records it: registered, the checkpoint against the head, the grant, the purpose
    const mine = page.locator('section[aria-labelledby="mine-h"]');
    await expect(mine.getByLabel('my subscription state')).toHaveText("◌ REGISTERED — awaiting the owner's authorization");
    await expect(mine.getByLabel('my lag')).toHaveText(LAG_LINE);
    await expect(mine.getByText('closes_at, consequence_class, title · consequence C2 · no time window', { exact: true })).toBeVisible();
    await expect(mine.getByText('procurement · v1', { exact: true })).toBeVisible();
    // the same subscription in the product's list (every reader sees the subscriptions; the owner's controls are the owner's)
    const listed = page.getByRole('list', { name: 'subscriptions' }).locator('li').filter({ hasText: `consumer ${short8(consumer.principalId)}` });
    await expect(listed.getByLabel('subscription state')).toHaveText("◌ REGISTERED — awaiting the owner's authorization");
    await expect(listed.getByRole('button', { name: 'Authorize' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Acknowledge', exact: true })).toBeDisabled();
    await expect(page.getByText(/committed — POL/).first()).toBeVisible();
  });

  test('2. the owner reads the subscription with its state, checkpoint and lag; AUTHORIZES from the page → ACTIVE; PAUSES with a reason → PAUSED (owner) with the note, Resume offered', async ({ page }) => {
    await uiLogin(page, owner.username, PW);
    await openStream(page);
    await expect(page.getByText(`${short8(owner.principalId)} (you)`)).toBeVisible();
    const item = subItem(page);
    await expect(item).toContainText(`consumer ${short8(consumer.principalId)} · procurement · schema v1`);
    await expect(item.getByLabel('subscription state')).toHaveText("◌ REGISTERED — awaiting the owner's authorization");
    await expect(item.getByLabel('subscription lag')).toHaveText(LAG_LINE);
    await expect(item).toContainText('closes_at, consequence_class, title · consequence C2 · no time window · corrections handled · replays handled');
    // THE AUTHORIZATION — the owner's own act (a non-owner is refused by the port: the harness)
    await item.getByRole('button', { name: 'Authorize' }).click();
    await expect(subItem(page).getByLabel('subscription state')).toHaveText('● ACTIVE — the consumer reads and acknowledges');
    await expect(subItem(page).getByRole('button', { name: 'Authorize' })).toHaveCount(0);
    await expect(subItem(page).getByRole('button', { name: 'Pause' })).toBeVisible();
    // THE PAUSE with a reason (8+ characters; the field is the owner's)
    await page.locator('#owner-reason').fill(PAUSE_REASON);
    await subItem(page).getByRole('button', { name: 'Pause' }).click();
    await expect(subItem(page).getByLabel('subscription state')).toHaveText('⏸ PAUSED (owner) — conform, then the owner resumes');
    await expect(subItem(page)).toContainText(`pause: ${PAUSE_REASON}`);
    await expect(subItem(page).getByLabel('subscription lag')).toHaveText(LAG_LINE);
    await expect(subItem(page).getByRole('button', { name: 'Pause' })).toHaveCount(0);
    await expect(subItem(page).getByRole('button', { name: 'Resume' })).toBeVisible();
    await expect(subItem(page).getByRole('button', { name: 'Revoke' })).toBeVisible();
    await expect(page.getByText(/committed — POL/).first()).toBeVisible();
  });

  test('3. the consumer sees the pause and its note; the conformance declaration is offered, the acknowledgement is not (the offset preserved at 0)', async ({ page }) => {
    await uiLogin(page, consumer.username, PW);
    await openStream(page);
    await expect(page.getByLabel('my subscription state')).toHaveText('⏸ PAUSED (owner) — conform, then the owner resumes');
    await expect(page.getByText(PAUSE_REASON)).toBeVisible();
    await expect(page.getByLabel('my lag')).toHaveText(LAG_LINE);
    await expect(page.getByRole('button', { name: 'Declare conformance' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acknowledge', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Replay', exact: true })).toHaveCount(0);
    // the consumer holds none of the owner's controls
    await expect(page.getByRole('button', { name: 'Resume' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
  });
});
