/**
 * CP-6 B18 browser walk — the Enterprise Memory workspace (AU-MEM-0065's statement, through the page).
 *
 * The journey, end to end, through the real interface:
 *
 *   the knowledge owner records a memory item → retrieves it under the purpose it was admitted for (the access
 *   recorded) and is refused under a purpose outside its audience, in the page's words → the record authority
 *   supersedes from the served version → an as-of retrieval serves version 1, replayed → the owner's withdrawal is
 *   refused → the record authority withdraws; a current retrieval is refused, the versions stay replayable → keyboard,
 *   landmarks and names.
 *
 * The seeding is the API's, in the Phase 1 idiom: this suite makes its own tenant, ONE domain and three DOMAIN principals
 * with a per-run password, and then drives the UI. No scheduler runs. Nothing is asserted against a fixture the interface
 * did not render; a refusal is read from role="status" in the page's words; a receipt is asserted INSIDE the section of
 * the act that produced it (a page keeps the receipts of earlier acts — after a supersession the retrieval's receipt is
 * still on the page beside the supersession's).
 *
 * The selectors are the page's own (apps/web/app/graph/memory/page.tsx): the sections by their heading ids — `list-h`
 * (the items table, "select", the region "memory items"), `retrieve-h` (#purpose, #asof, "Retrieve under purpose", the
 * served version's definitions), `record-h` (the regions "memory item events" and "memory item access history"), `sup-h`
 * (the fields #sup-*, #sup-reason, "Supersede"), `wd-h` (#wd-reason, "Withdraw"), `new-h` (the fields #new-*, "Record").
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
/** One per-run password for the three principals this suite creates; it lives in the worker's memory only. */
const PW = `Mm6!${crypto.randomUUID()}`;
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
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-p6m',
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
let owner: Ctx;
let authority: Ctx;
let reader: Ctx;
let T = '';
let D = '';
let itemId = '';
const TITLE = `E2E memory item ${run}`;
const STATEMENT = 'The E2E tenant keeps one institutional record here (synthetic; recorded through the workspace).';
const CORRECTION = ' Corrected by the record authority.';

const IN = (who: Ctx, over: Record<string, unknown>) =>
  ({ scope: 'DOMAIN', tenant_id: T, domain_id: D, principal_id: `principal:${who.principalId}`, ...over });

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

/**
 * The instant version 1 was recorded, from the item's own record (the memory.recorded event), read by API — the as-of
 * instant of a replay is derived from it, never guessed from the clock.
 */
async function recordedInstant(): Promise<string> {
  const r = await api(`/v1/tenants/${T}/domains/${D}/graph/memory/${itemId}/get`,
    IN(owner, { action: 'graph.read', object_type: 'MEM', object_id: itemId, side_effect_class: 'none', purpose_id: 'graph' }),
    {}, owner.token);
  expect(r.status).toBe(201);
  const ev = ((r.body as { events: Array<{ event: string; occurred_at: string }> }).events).find((e) => e.event === 'memory.recorded');
  expect(ev, 'the memory.recorded event').toBeDefined();
  return ev?.occurred_at ?? '';
}
/**
 * A datetime-local value WITH seconds, in this machine's zone (the browser's is the same machine's): the page parses it
 * with `new Date(local)`. Chrome keeps the seconds only when they are not `:00` — a `:00` is normalised away and the fill
 * would be refused as malformed — so an instant landing on `:00` is moved one second on.
 */
function localWithSeconds(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
/**
 * The first whole second strictly after an instant (the field carries seconds at best): with the supersession held at least
 * 2.5 s after the recording (test 3), this instant is strictly between the two versions whatever the tests' pace.
 */
function asOfAfter(iso: string): Date {
  const d = new Date(Date.parse(iso) + 1000);
  d.setMilliseconds(0);
  if (d.getSeconds() === 0) d.setSeconds(1);
  return d;
}
/** Test 3 supersedes no earlier than 2.5 s after the recording, so the as-of instant of tests 4 and 6 falls between the versions. */
async function heldSinceRecording(page: Page, ms = 2500): Promise<void> {
  const wait = Date.parse(await recordedInstant()) + ms - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
}

/* ───────────────────────── the page's own selectors ───────────────────────── */

async function openMemory(page: Page): Promise<void> {
  await page.goto('/graph/memory');
  await expect(page.getByRole('heading', { name: 'Memory', level: 1 })).toBeVisible();
}
/** The item selected from the Items table — the way a person reaches it. */
async function selectItem(page: Page): Promise<void> {
  await page.locator('section[aria-labelledby="list-h"]').getByRole('row').filter({ hasText: TITLE })
    .getByRole('button', { name: /^select(ed)?$/ }).click();
  await expect(page.getByRole('heading', { name: `Retrieve — ${TITLE}` })).toBeVisible();
}
async function retrieve(page: Page, purpose: string): Promise<void> {
  await page.locator('#purpose').selectOption(purpose);
  await page.getByRole('button', { name: 'Retrieve under purpose' }).click();
}
const section = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);
const itemRow = (page: Page) => section(page, 'list-h').getByRole('row').filter({ hasText: TITLE });
const status = (page: Page, re: RegExp) => page.getByRole('status').filter({ hasText: re });
/** A receipt is asserted inside the section of the act that produced it: a page keeps the receipts of earlier acts. */
const receiptIn = (page: Page, id: string) => section(page, id).getByText(/committed — POL/);

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B18 — Enterprise Memory (AU-MEM-0065 through the workspace)', () => {
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
      { name: `E2E Memory ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`,
      { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `Memory ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;

    // THREE people, because who may record, who may supersede and withdraw, and who may only read are claims this suite must show.
    owner = await person(`p6m-owner-${run}`, 'knowledge_owner');
    authority = await person(`p6m-authority-${run}`, 'record_authority');
    reader = await person(`p6m-reader-${run}`, 'domain_analyst');
  });

  /**
   * Later tests need the item id. Test 1 captures it from the page it rendered, which is the point of that test; this
   * resolves it from the API when a single test is run in isolation, so the suite is debuggable one test at a time.
   */
  test.beforeEach(async () => {
    if (itemId !== '') return;
    const r = await api(`/v1/tenants/${T}/domains/${D}/graph/memory/list`,
      IN(owner, { action: 'graph.read', object_type: 'MEM', side_effect_class: 'none', purpose_id: 'graph' }),
      { limit: 200 }, owner.token);
    const found = ((r.body as { memory?: Array<{ item_id: string; title: string }> }).memory ?? []).find((x) => x.title === TITLE);
    if (found !== undefined) itemId = found.item_id;
  });

  test('1. the knowledge owner records a memory item through the form', async ({ page }) => {
    await uiLogin(page, owner.username, PW);
    await openMemory(page);
    await expect(section(page, 'list-h')).toContainText('No memory item is recorded in this domain.');

    // The record form: an institutional record from a human source, internal, for any role with clearance, under two purposes.
    await expect(page.locator('#new-class')).toHaveValue('institutional');
    await page.locator('#new-title').fill(TITLE);
    await page.locator('#new-stmt').fill(STATEMENT);
    await expect(page.locator('#new-skind')).toHaveValue('human');
    await expect(page.locator('#new-cls')).toHaveValue('internal');
    await expect(page.locator('#new-roles')).toHaveValue('');
    await page.locator('#new-purp').fill('memory, graph');
    await page.locator('#new-vfrom').fill('2026-01-01T00:00');
    await page.locator('#new-rprof').fill('e2e-memory');
    await page.getByRole('button', { name: 'Record', exact: true }).click();
    const recorded = section(page, 'new-h').locator('p').filter({ hasText: /^recorded item [0-9a-f-]{36} version 1; 0 cite\(s\); digest [0-9a-f]{64}/ });
    await expect(recorded).toBeVisible();
    await expect(receiptIn(page, 'new-h')).toBeVisible();
    const id = /recorded item ([0-9a-f-]{36})/.exec((await recorded.textContent()) ?? '')?.[1] ?? '';
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    itemId = id;

    // The listing shows the record without its content.
    const row = itemRow(page);
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell', { name: 'institutional', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: '1', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'internal', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'memory, graph', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'active', exact: true })).toBeVisible();
    await expect(row).not.toContainText(STATEMENT);
  });

  test('2. the owner retrieves under the admitted purpose (the access recorded), and is refused under a purpose outside the audience', async ({ page }) => {
    await uiLogin(page, owner.username, PW);
    await openMemory(page);
    await selectItem(page);
    await retrieve(page, 'memory');
    const served = section(page, 'retrieve-h');
    await expect(served).toContainText(/version 1 of 1 is current; you were served version 1 \(the current one\)/);
    await expect(served).toContainText(STATEMENT);
    await expect(served.getByRole('definition').filter({ hasText: /^memory$/ })).toBeVisible();
    await expect(receiptIn(page, 'retrieve-h')).toBeVisible();
    // The access is on the item's record: who read which version, under which purpose, as of when.
    await expect(page.getByRole('heading', { name: 'Access history (1)' })).toBeVisible();
    const access = page.getByRole('region', { name: 'memory item access history' }).getByRole('row').filter({ hasText: 'memory' });
    await expect(access).toContainText('now (at access)');
    await expect(access.getByRole('cell', { name: '1', exact: true })).toBeVisible();

    // A purpose the item is not admitted for and does not declare: the server's refusal, verbatim, with its code.
    await retrieve(page, 'prediction');
    await expect(status(page, /not served — HTTP 403 EYE-AUT-001 — a memory item is read under the purpose it was admitted for \(memory\) or one it declares for its audience \(memory, graph\); this read states prediction/)).toBeVisible();

    // A reader outside the owner's role is served under a declared audience purpose: the audience roles are empty, any role with clearance.
    await uiLogin(page, reader.username, PW);
    await openMemory(page);
    await selectItem(page);
    await retrieve(page, 'graph');
    await expect(section(page, 'retrieve-h')).toContainText(/you were served version 1 \(the current one\)/);
  });

  test('3. the record authority supersedes from the served version', async ({ page }) => {
    await uiLogin(page, authority.username, PW);
    await openMemory(page);
    await selectItem(page);
    // The supersede form is prefilled FROM THE SERVED PAYLOAD, never from a guess: a retrieval first.
    await retrieve(page, 'memory');
    await expect(section(page, 'retrieve-h')).toContainText(/you were served version 1 \(the current one\)/);
    await expect(page.locator('#sup-title')).toHaveValue(TITLE);
    await expect(page.locator('#sup-stmt')).toHaveValue(STATEMENT);
    await expect(page.locator('#sup-rprof')).toHaveValue('e2e-memory');

    await page.locator('#sup-stmt').fill(STATEMENT + CORRECTION);
    await page.locator('#sup-reason').fill('the statement corrected on review (e2e)');
    await heldSinceRecording(page);
    await page.getByRole('button', { name: 'Supersede', exact: true }).click();
    await expect(section(page, 'sup-h')).toContainText(/recorded version 2 of [0-9a-f-]{36}, superseding version 1; 0 cite\(s\)/);
    // The retrieval's receipt is still on the page: the supersession's is asserted in its own section.
    await expect(receiptIn(page, 'sup-h')).toBeVisible();
    await expect(itemRow(page).getByRole('cell', { name: '2 (1 superseded)', exact: true })).toBeVisible();
  });

  test('4. an as-of retrieval serves version 1, replayed', async ({ page }) => {
    const asOf = localWithSeconds(asOfAfter(await recordedInstant()));
    await uiLogin(page, owner.username, PW);
    await openMemory(page);
    await selectItem(page);
    await page.locator('#asof').fill(asOf);
    await retrieve(page, 'memory');
    const served = section(page, 'retrieve-h');
    await expect(served, `as of ${asOf}`).toContainText(/version 2 of 2 is current; you were served version 1 \(a superseded version, replayed\)/);
    // The served version's OWN content: the original statement, not the corrected one.
    const statement = served.getByRole('definition').filter({ hasText: STATEMENT });
    await expect(statement).toBeVisible();
    await expect(statement).not.toContainText(CORRECTION.trim());
    await expect(served).toContainText(/· as of \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}Z ·/);
    await expect(served).not.toContainText('as of now');

    // Without an instant, the current version — with the corrected statement.
    await page.locator('#asof').fill('');
    await retrieve(page, 'memory');
    await expect(served).toContainText(/version 2 of 2 is current; you were served version 2 \(the current one\)/);
    await expect(served).toContainText(STATEMENT + CORRECTION);
    await expect(served).toContainText('as of now');
  });

  test("5. the knowledge owner's withdrawal is refused", async ({ page }) => {
    await uiLogin(page, owner.username, PW);
    await openMemory(page);
    await selectItem(page);
    await page.locator('#wd-reason').fill('the owner tries to withdraw (e2e)');
    await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(status(page, /not withdrawn — HTTP 403 EYE-AUT-001 — no qualifying role binding for action in resolved scope/)).toBeVisible();
    await expect(itemRow(page).getByRole('cell', { name: 'active', exact: true })).toBeVisible();
  });

  test('6. the record authority withdraws; a current retrieval is refused in the page\'s words; the versions stay replayable', async ({ page }) => {
    const asOf = localWithSeconds(asOfAfter(await recordedInstant()));
    await uiLogin(page, authority.username, PW);
    await openMemory(page);
    await selectItem(page);
    await page.locator('#wd-reason').fill('the record has left circulation (e2e)');
    await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
    await expect(section(page, 'wd-h')).toContainText(/item [0-9a-f-]{36} is now withdrawn/);
    await expect(receiptIn(page, 'wd-h')).toBeVisible();
    await expect(itemRow(page).getByRole('cell', { name: 'withdrawn', exact: true })).toBeVisible();

    // The current reading is refused with the withdrawal named ...
    await retrieve(page, 'memory');
    await expect(status(page, /not served — HTTP 409 EYE-STA-003 — memory item [0-9a-f-]{36} was withdrawn and is out of circulation; its versions stay replayable as of an instant \(payload\.asOf\)/)).toBeVisible();
    // ... and every version it ever had stays replayable as of an instant.
    await page.locator('#asof').fill(asOf);
    await retrieve(page, 'memory');
    const served = section(page, 'retrieve-h');
    await expect(served, `as of ${asOf}`).toContainText(/you were served version 1 \(a superseded version, replayed\)/);
    await expect(served).toContainText('· item withdrawn');
  });

  test('7. keyboard operation, landmarks and names', async ({ page }) => {
    await uiLogin(page, owner.username, PW);
    await openMemory(page);
    await expect(page.getByRole('region', { name: 'memory items' })).toBeVisible();

    // Landmarks with accessible names, and exactly one h1.
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Graph' })).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    expect(await page.locator('h1').count()).toBe(1);

    // Every table is a real table with a header row; each sits in a named region (the workspace's tables carry no caption).
    const tables = page.locator('table.eye-table');
    const count = await tables.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      expect(await tables.nth(i).locator('thead th').count()).toBeGreaterThan(0);
    }

    // The rail is reachable by keyboard and shows a visible focus ring.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineWidth);
    expect(outline).not.toBe('0px');

    // No control is left without an accessible name.
    const unnamed = await page.evaluate(() => {
      const els = [...document.querySelectorAll('button, a[href], input, select, textarea')];
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
