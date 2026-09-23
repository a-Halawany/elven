/**
 * CP-6 B20 browser walk — the index tier through the Subscriptions page (AU-MEM-0068 / AU-MEM-0083 through the workspace).
 *
 * The journey, end to end, through the real interface:
 *
 *   the domain administrator opens the Projections table: the six partitions of the domain, every one `unverified`
 *   (this gate runs the API without the scheduler and the domain registers no retrieval subscription, so no watermark is
 *   verified — the honest condition here; `current` is pinned by the harness and printed by the demonstration), the
 *   representation at its constant → the administrator WITHDRAWS `entities_current` with a reason: the answer verbatim,
 *   the receipt, the row `withdrawn` → the SEARCH page (a query on the empty domain) renders the withdrawal label from the
 *   flag — the answer is derived from the event log, the last valid state — and still says nothing matched → the REBUILD:
 *   `restored` (nothing to write on an empty domain — updated 0, inserted 0, removed 0), the representation recorded, the
 *   row `unverified` again, the label gone from the search page → the refusals in the page's words (a rebuild of a
 *   serving partition, 409; the analyst's withdrawal, 403 — the analyst reads the page, fills the reason and is refused by
 *   the policy, never by the page) → landmarks.
 *
 * The seeding is the API's, in the Phase 1 idiom (copied from the memory walk): this suite makes its own tenant, ONE
 * domain and two DOMAIN principals with a per-run password, and then drives the UI. No graph is seeded: the walk is the
 * partition's STATE, not its rows (the rows, the drift, the poison and the constrained walk are the harness's,
 * apps/api/test/int/phase6-graph-projections-b20.test.ts). Nothing is asserted against a fixture the interface did not
 * render; a refusal is read from role="status" in the page's words; a receipt is asserted INSIDE the section of the act
 * that produced it.
 *
 * The selectors are the page's own (apps/web/app/graph/subscriptions/page.tsx): the section by its heading id
 * `projections-h` (the heading "Projections (the index tier)", the region "projections" — one table, a header row and six
 * rows, the cells Projection · Condition · State · Revision / verified through / lag · Withdrawn since · Reason ·
 * Representation · Last rebuild · Last check · Act — the buttons "Withdraw" and "Rebuild" per row, the input #preason, the
 * status lines `withdrawn … since …: …` / `rebuild of …: … — updated …, inserted …, removed …; representation …`, the
 * refusals `not withdrawn — HTTP …` / `not rebuilt — HTTP …`); the search page's (apps/web/app/graph/search/page.tsx) #q,
 * "Search", the notes "Projection withdrawn." / "Projection unverified." with the server's label as the wording.
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
/** One per-run password for the two principals this suite creates; it lives in the worker's memory only. */
const PW = `Pj6!${crypto.randomUUID()}`;
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

async function api(
  path: string,
  over: Record<string, unknown>,
  payload: unknown = {},
  token?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const envelope = {
    message_id: crypto.randomUUID(),
    scope: 'PLATFORM', tenant_id: null, domain_id: null,
    principal_id: 'anonymous', purpose_id: 'graph',
    action: 'x', side_effect_class: 'reversible', consequence_class: 'C2',
    object_type: 'OBJ', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-p6p',
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
  return api('/v1/auth/login', { action: 'identity.session.create', object_type: 'SES', purpose_id: 'authentication' },
    { username, password });
}

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/admin/);
}

interface Ctx { token: string; principalId: string; username: string }

let admin: Ctx;
let dadmin: Ctx;
let analyst: Ctx;
let T = '';
let D = '';

/** A principal of this domain with the per-run password, signed in by API. */
async function person(login: string, roleCode: string): Promise<Ctx> {
  const p = await api(`/v1/tenants/${T}/principals`,
    { action: 'identity.principal.create', scope: 'TENANT', tenant_id: T, object_type: 'PRN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
    { kind: 'human', displayName: login, loginName: login, password: PW, roleCode, domainId: D }, admin.token);
  expect(p.status, `${login} (${roleCode}) created`).toBe(201);
  const l = await loginApi(login, PW);
  expect(l.status, `${login} signed in`).toBe(201);
  return {
    token: (l.body as { tokens: { accessToken: string } }).tokens.accessToken,
    principalId: (l.body as { principalId: string }).principalId,
    username: login,
  };
}

/* ───────────────────────── the page's own selectors ───────────────────────── */

const PROJECTIONS = ['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current'];
const WITHDRAW_REASON = 'representation review before the ontology proposal (e2e)';
const REBUILD_REASON = 'the review is complete (e2e)';

const section = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);
const status = (page: Page, re: RegExp) => page.getByRole('status').filter({ hasText: re });
/** A receipt is asserted inside the section of the act that produced it: a page keeps the receipts of earlier acts. */
const receiptIn = (page: Page, id: string) => section(page, id).getByText(/committed — POL/);

async function openProjections(page: Page): Promise<void> {
  await page.goto('/graph/subscriptions');
  await expect(page.getByRole('heading', { name: 'Projections (the index tier)' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'projections', exact: true })).toBeVisible();
}
/** The row of one partition — matched on its Projection cell exactly (a reason or a check may name another partition). */
const rowOf = (page: Page, projection: string): Locator =>
  section(page, 'projections-h').getByRole('row').filter({ has: page.getByRole('cell', { name: projection, exact: true }) });
/** The Condition cell is the second column (the State cell, the third, reads `withdrawn` too while a partition is withdrawn). */
const conditionOf = (row: Locator): Locator => row.locator('td').nth(1);
async function searchFor(page: Page, query: string): Promise<void> {
  await page.goto('/graph/search');
  await page.locator('#q').fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Nothing you may see matched this query.')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B20 — the index tier (AU-MEM-0068 / AU-MEM-0083 through the Subscriptions page)', () => {
  test.beforeAll(async () => {
    // Rotation-aware admin sign-in (ADR-P0-17).
    let al = await loginApi('platform-admin', ADMIN_PW);
    if (al.status !== 201 || (al.body as { rotationRequired?: boolean }).rotationRequired === true) {
      const boot = await loginApi('platform-admin', BOOTSTRAP_PW);
      expect(boot.status).toBe(201);
      const bt = (boot.body as { tokens: { accessToken: string }; principalId: string });
      if ((boot.body as { rotationRequired?: boolean }).rotationRequired === true) {
        const rot = await api('/v1/auth/rotate',
          { action: 'identity.credential.rotate', object_type: 'CRD', principal_id: `principal:${bt.principalId}`, purpose_id: 'authentication' },
          { currentPassword: BOOTSTRAP_PW, newPassword: ADMIN_PW }, bt.tokens.accessToken);
        expect(rot.status).toBe(201);
      }
      al = await loginApi('platform-admin', ADMIN_PW);
    }
    expect(al.status).toBe(201);
    admin = {
      token: (al.body as { tokens: { accessToken: string } }).tokens.accessToken,
      principalId: (al.body as { principalId: string }).principalId,
      username: 'platform-admin',
    };

    // The tenant and its one domain.
    const t = await api('/v1/platform/tenants',
      { action: 'tenancy.tenant.create', object_type: 'TEN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `E2E Projections ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`,
      { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `Projections ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;

    // TWO people, because who may withdraw and rebuild a partition, and who may only read the table, are claims this suite must show.
    dadmin = await person(`p6p-dadmin-${run}`, 'domain_admin');
    analyst = await person(`p6p-analyst-${run}`, 'domain_analyst');
  });

  test('1. the Projections table reads six partitions, unverified, representation 1', async ({ page }) => {
    await uiLogin(page, dadmin.username, PW);
    await openProjections(page);
    const table = section(page, 'projections-h');
    await expect(table).toContainText("The six derived projections a domain’s reads serve from.");
    // One table: a header row and the six partitions, in the fixed order.
    await expect(table.getByRole('row')).toHaveCount(7);
    for (const name of PROJECTIONS) await expect(table.getByRole('cell', { name, exact: true })).toBeVisible();
    // No retrieval subscription verifies this domain on the gate (no scheduler): every partition is `unverified`, none `current`, and the page says so.
    await expect(table.getByRole('cell', { name: 'unverified', exact: true })).toHaveCount(6);
    await expect(table.getByRole('cell', { name: 'current', exact: true })).toHaveCount(0);
    await expect(table.getByRole('cell', { name: 'serving', exact: true })).toHaveCount(6);
    // The representation of every partition is the derivation rule's constant.
    await expect(table.getByRole('cell', { name: '1', exact: true })).toHaveCount(6);
    await expect(table).toContainText(/retrieval subscription none/);
    await expect(table).toContainText(/No withdrawal, rebuild, restoration or refused rebuild has been recorded in this domain\./);
  });

  test('2. the domain administrator withdraws entities_current; the search page shows the label; the rebuild restores it', async ({ page }) => {
    await uiLogin(page, dadmin.username, PW);
    await openProjections(page);
    const row = rowOf(page, 'entities_current');
    await expect(conditionOf(row)).toHaveText('unverified');

    // THE WITHDRAWAL, with its reason: the answer verbatim (the state changed, since when, the reason), the receipt, the row withdrawn.
    await page.locator('#preason').fill(WITHDRAW_REASON);
    await row.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(status(page, /withdrawn entities_current \(the state changed\) since .*: representation review before the ontology proposal \(e2e\)/)).toBeVisible();
    await expect(receiptIn(page, 'projections-h')).toBeVisible();
    await expect(conditionOf(row)).toHaveText('withdrawn');
    await expect(row.getByRole('cell', { name: WITHDRAW_REASON, exact: true })).toBeVisible();
    // The ledger names the operator's withdrawal.
    await expect(section(page, 'projections-h')).toContainText(/projection\.withdrawn entities_current .* — representation review before the ontology proposal \(e2e\) \(operator\)/);

    // THE SEARCH PAGE: the entity leg is served from the event log — the last valid state — and the answer is LABELLED, from the flag,
    // in the server's words; on the empty domain nothing matches, and that is still what the page says.
    await searchFor(page, 'nothing here');
    await expect(page.getByText(/Projection withdrawn\./)).toBeVisible();
    await expect(page.getByText(/the entities_current projection of this domain is withdrawn since .* \(representation review before the ontology proposal \(e2e\)\); this answer is derived from the event log/)).toBeVisible();
    await expect(page.getByText(/code EYE-DEG-001/)).toBeVisible();

    // THE REBUILD: nothing to write on an empty domain — a restoration, said honestly; the representation recorded; the row serving again.
    await openProjections(page);
    await page.locator('#preason').fill(REBUILD_REASON);
    await rowOf(page, 'entities_current').getByRole('button', { name: 'Rebuild', exact: true }).click();
    await expect(status(page, /rebuild of entities_current: restored — updated 0, inserted 0, removed 0; representation 1/)).toBeVisible();
    await expect(receiptIn(page, 'projections-h')).toBeVisible();
    await expect(conditionOf(rowOf(page, 'entities_current'))).toHaveText('unverified');
    await expect(section(page, 'projections-h')).toContainText(/projection\.restored entities_current .* — the review is complete \(e2e\)/);

    // The search page no longer carries the withdrawal; the honest condition on this gate is said instead.
    await searchFor(page, 'nothing here');
    await expect(page.getByText(/Projection withdrawn\./)).toHaveCount(0);
    await expect(page.getByText(/the entities_current projection of this domain is withdrawn/)).toHaveCount(0);
    await expect(page.getByText(/Projection unverified\./)).toBeVisible();
    await expect(page.getByText(/no live retrieval subscription verifies this domain's projections; the projection watermark is unknown/)).toBeVisible();
  });

  test('3. the refusals in the page\'s words; landmarks', async ({ page }) => {
    // A rebuild of a SERVING partition is refused by the port: the record's state, 409, in its own words.
    await uiLogin(page, dadmin.username, PW);
    await openProjections(page);
    await expect(conditionOf(rowOf(page, 'edges_current'))).toHaveText('unverified');
    await page.locator('#preason').fill('a rebuild of a serving partition (e2e)');
    await rowOf(page, 'edges_current').getByRole('button', { name: 'Rebuild', exact: true }).click();
    await expect(status(page, /not rebuilt — HTTP 409 EYE-STA-002 — projection rebuild rejected: the edges_current partition of this domain is serving; withdraw it first \(graph\.projection\.withdraw\) or let the retrieval check withdraw it/)).toBeVisible();
    await expect(conditionOf(rowOf(page, 'edges_current'))).toHaveText('unverified');

    // The analyst (a graph.read holder) reads the table, and MUST fill the reason before the button is enabled (C23): the page gates the
    // shape only; the refusal is the policy's, verbatim — no qualifying role binding for graph.projection.withdraw.
    await uiLogin(page, analyst.username, PW);
    await openProjections(page);
    await expect(section(page, 'projections-h').getByRole('row')).toHaveCount(7);
    await expect(rowOf(page, 'edges_current').getByRole('button', { name: 'Withdraw', exact: true })).toBeDisabled();
    await page.locator('#preason').fill('not mine to do (e2e)');
    await expect(rowOf(page, 'edges_current').getByRole('button', { name: 'Withdraw', exact: true })).toBeEnabled();
    await rowOf(page, 'edges_current').getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(status(page, /not withdrawn — HTTP 403 EYE-AUT-001 — no qualifying role binding for action in resolved scope/)).toBeVisible();
    await expect(conditionOf(rowOf(page, 'edges_current'))).toHaveText('unverified');

    // Landmarks and names: the section's heading, the reason input's label and the table's region are reachable by role.
    await expect(page.getByRole('heading', { name: 'Projections (the index tier)', level: 2 })).toBeVisible();
    await expect(page.getByLabel('Reason for a withdrawal or a rebuild (at least 8 characters)')).toBeVisible();
    await expect(page.getByRole('region', { name: 'projections', exact: true })).toBeVisible();
    expect(await page.locator('h1').count()).toBe(1);
    // No control of the section is left without an accessible name.
    const unnamed = await section(page, 'projections-h').evaluate((el) => {
      const els = [...el.querySelectorAll('button, a[href], input, select, textarea')];
      return els.filter((e) => {
        const label = (e.getAttribute('aria-label') ?? '').trim();
        const text = (e.textContent ?? '').trim();
        const id = e.getAttribute('id');
        const hasLabel = id !== null && document.querySelector(`label[for="${id}"]`) !== null;
        return label === '' && text === '' && !hasLabel;
      }).length;
    });
    expect(unnamed).toBe(0);
  });
});
