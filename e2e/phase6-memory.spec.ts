/**
 * CP-6 B18 browser walk — the Enterprise Memory workspace (AU-MEM-0065's statement, through the page); B19 (0079) adds the
 * SOURCE-DERIVED record (tests 8–9); B20 (0080) adds ONE assertion to test 2 — the retrieval's projection condition.
 *
 * B20: every graph and memory read carries the state of the projection it was served from, and the page says it beside the
 * version served (`projection <condition> · index <projected | stale>`). This gate runs the API WITHOUT the scheduler and the
 * domain registers no retrieval subscription, so no watermark is verified here: the honest condition is `unverified`, with
 * the server's label ("no live retrieval subscription verifies this domain's projections; the projection watermark is
 * unknown"), and that is what test 2 pins. The `current` condition — a live subscription whose check applied — is pinned by
 * the harness (apps/api/test/int/phase6-graph-projections-b20.test.ts P1) and printed by the demonstration; the withdrawn
 * state through the page is the projections walk's (e2e/phase6-projections.spec.ts).
 *
 * The journey, end to end, through the real interface:
 *
 *   the knowledge owner records a memory item → retrieves it under the purpose it was admitted for (the access
 *   recorded) and is refused under a purpose outside its audience, in the page's words → the record authority
 *   supersedes from the served version → an as-of retrieval serves version 1, replayed → the owner's withdrawal is
 *   refused → the record authority withdraws; a current retrieval is refused, the versions stay replayable → keyboard,
 *   landmarks and names → (B19) a basis claim is reached BY API on this run's own database — an upload contract, one CSV
 *   record, a replay method registered by the reader and approved, activated, recorded and extracted by the extraction
 *   manager (two claims in one recorded response: one derivable, one queued for review) — and the knowledge owner DERIVES a
 *   document record from the extracted claim through the form: the lift said (declared public, inherited internal, applied
 *   internal), the synthetic state and the retention profile inherited, the statement computed by memory-derive@1.0.0, the
 *   listing naming the basis, the retrieval serving the derivation block with the basis's state → the refusals in the
 *   page's words (the queued claim at the review gate, the telemetry rule without a registered series, the reader without
 *   the role); the record form records human records only.
 *
 * The seeding is the API's, in the Phase 1 idiom: this suite makes its own tenant, ONE domain and five DOMAIN principals
 * with a per-run password, and then drives the UI. No scheduler runs. Nothing is asserted against a fixture the interface
 * did not render; a refusal is read from role="status" in the page's words; a receipt is asserted INSIDE the section of
 * the act that produced it (a page keeps the receipts of earlier acts — after a supersession the retrieval's receipt is
 * still on the page beside the supersession's). The B19 date assertions read the ISO statement and the "(basis)" source
 * word, never a zone-rendered day (a runner's zone is not the record's).
 *
 * The selectors are the page's own (apps/web/app/graph/memory/page.tsx): the sections by their heading ids — `list-h`
 * (the items table, "select", the region "memory items"), `retrieve-h` (#purpose, #asof, "Retrieve under purpose", the
 * served version's definitions), `record-h` (the regions "memory item events" and "memory item access history"), `sup-h`
 * (the fields #sup-*, #sup-reason, "Supersede"), `wd-h` (#wd-reason, "Withdraw"), `new-h` (the fields #new-*, "Record"),
 * `derive-h` (the fields #derive-* — #derive-bkind, #derive-bid, #derive-bver, #derive-skind, #derive-title, #derive-cls,
 * #derive-purp, #derive-vfrom, #derive-rprof — and "Derive"; the definitions "Derived statement", "Statement digest",
 * "Source", "Evidence"; the retrieval's "Derivation" definition).
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
/** B19: sha256 of a text's UTF-8 (the model weights pin of the e2e method; the bytes digest an upload is admitted under). */
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

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
// B19: the collection manager who uploads the record and the extraction manager who approves, activates, records and runs the method.
let collector: Ctx;
let xmanager: Ctx;
let T = '';
let D = '';
let itemId = '';
const TITLE = `E2E memory item ${run}`;
const STATEMENT = 'The E2E tenant keeps one institutional record here (synthetic; recorded through the workspace).';
const CORRECTION = ' Corrected by the record authority.';
// B19: the derived record's title, the upload's key, and the two claims test 8 extracts (the basis and the queued one) — test 9 reads them.
const DERIVED_TITLE = `E2E derived record ${run}`;
const SOURCE_KEY = `e2e-memory-uploads-${run}`;
const CSV = 'component_id,shipment_id,vessel\nC-4471,S-2024-0117,MV Nordlicht\n';
let evtId = '';
let queuedId = '';

const IN = (who: Ctx, over: Record<string, unknown>) =>
  ({ scope: 'DOMAIN', tenant_id: T, domain_id: D, principal_id: `principal:${who.principalId}`, ...over });
/** B19 (copied from the retention walk): the platform administrator acting in a domain of this tenant. */
const DOMAIN_ADMIN = (domainId: string, over: Record<string, unknown>) =>
  ({ scope: 'DOMAIN', tenant_id: T, domain_id: domainId, principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration', ...over });

/**
 * B19 (copied from the retention walk, which copied the B16 harness's uploadContract — the browser gate cannot import a test
 * helper of apps/api): an upload connector under replay, synthetic data, rights CONFIRMED, ceiling INTERNAL, CSV, retention
 * "24 months", licence internal — the controls the extracted claim and then the derived record inherit.
 */
function uploadContract(sourceKey: string): Record<string, unknown> {
  return {
    source_key: sourceKey,
    name: 'E2E uploaded records (SYNTHETIC)',
    publisher: 'E2E plant (synthetic)',
    authority_class: 'authoritative',
    connector_kind: 'upload',
    acquisition_mode: 'replay',
    data_origin: 'synthetic',
    identity: { source_identity: sourceKey, publisher_identity: 'e2e (synthetic entity; does not exist)', endpoints: [], scheme_allowlist: ['https'],
                cadence_seconds: 86_400, jitter_seconds: 0, collection_window: null },
    authority_and_rights: {
      owner: 'observation.operations', steward: 'e2e', authority: 'Internal records (synthetic)', legal_basis: 'Internal synthetic data created for the browser gate',
      rights_state: 'confirmed', licence: 'internal', permitted_use: ['internal analysis'], robots_policy: 'not applicable', purposes: ['observation'],
      classification_ceiling: 'internal', residency: 'EU', retention: '24 months', deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'operator upload under an authenticated session',
      authenticity_method: {
        transport_endpoint: 'not applicable — no transport was performed by this system',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'operator attestation only',
        content_authenticity: 'not applicable — the records are synthetic and marked as such at object level',
      },
      budgets: { max_requests_per_run: 25, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
      expected_schema: { media_types: ['text/csv'], required_fields: [], drift_tolerance: 0, max_bytes: 16_777_216 },
      freshness_expectation: { threshold_seconds: 604_800, expected_interval: 'weekly' },
      coverage_expectations: {
        universe_version: 'v1', denominator_derivation: 'one upload set per reporting period', expected_items_per_window: null,
        not_applicable_dimensions: ['latency', 'correction_lag', 'authenticity'],
        not_applicable_reason: 'the records are synthetic internal data supplied by an operator: there is no publisher to lag behind, no corrections channel, and no external origin to authenticate',
      },
      correction_channel: 'a corrected upload supplied by the operator',
      replay_set: 'e2e-uploads',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  };
}

/**
 * B19 (copied from the retention walk): an upload contract registered by the ADMIN (a registrar never approves its own
 * contract), approved and activated by the domain's collection manager — the same three governed requests an operator makes.
 */
async function activeUploadSource(domainId: string, manager: Ctx, sourceKey: string): Promise<string> {
  const reg = await api(`/v1/tenants/${T}/domains/${domainId}/observation/sources/register`,
    DOMAIN_ADMIN(domainId, { action: 'observation.source.register', object_type: 'SRC', purpose_id: 'observation' }),
    { contract: uploadContract(sourceKey) }, admin.token);
  expect(reg.status, `${sourceKey} registered`).toBe(201);
  const sourceId = (reg.body as { source: { sourceId: string } }).source.sourceId;
  const ap = await api(`/v1/tenants/${T}/domains/${domainId}/observation/sources/${sourceId}/approve`,
    IN(manager, { action: 'observation.source.approve', object_type: 'SRC', object_id: sourceId, purpose_id: 'observation' }),
    { contractVersion: 1, decision: 'approve', reason: 'the e2e upload contract reviewed' }, manager.token);
  expect(ap.status, `${sourceKey} approved`).toBe(201);
  const tr = await api(`/v1/tenants/${T}/domains/${domainId}/observation/sources/${sourceId}/transition`,
    IN(manager, { action: 'observation.source.transition', object_type: 'SRC', object_id: sourceId, purpose_id: 'observation' }),
    { contractVersion: 1, target: 'active', reason: 'the e2e upload contract: active' }, manager.token);
  expect(tr.status, `${sourceKey} active`).toBe(201);
  return sourceId;
}

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
async function selectItem(page: Page, title = TITLE): Promise<void> {
  await page.locator('section[aria-labelledby="list-h"]').getByRole('row').filter({ hasText: title })
    .getByRole('button', { name: /^select(ed)?$/ }).click();
  await expect(page.getByRole('heading', { name: `Retrieve — ${title}` })).toBeVisible();
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
    // B19: two more — the collection manager (the upload) and the extraction manager (the method's approval, activation, the
    // recorded response and the run); the reader (a domain analyst) registers the method, because a registrar never approves its own.
    collector = await person(`p6m-collector-${run}`, 'collection_manager');
    xmanager = await person(`p6m-xmanager-${run}`, 'extraction_manager');
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
    // B20 (0080): the retrieval says the memory projection's condition beside the version served. This gate runs the API without the
    // scheduler and the domain registers no retrieval subscription, so no watermark is verified: `unverified` is the honest condition
    // here, with the server's label as the wording (`current` is pinned by the harness and printed by the demonstration).
    await expect(served).toContainText(/projection unverified · index projected/);
    await expect(served).toContainText(/no live retrieval subscription verifies this domain's projections; the projection watermark is unknown/);
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

  /**
   * B19 (D12): the POSITIVE derivation. A basis claim is reachable by API on this run's own database: an upload contract with its
   * agent and ONE CSV record (the retention walk's idiom), a replay method registered by the reader and approved, activated by the
   * extraction manager, its response RECORDED under the request digest the gateway computes (the spec's jcs/sha256 are the
   * gateway's jcsCanonicalize/sha256; `input.evidence` the CSV text, `item_key` the evidence's locator, `source_key` the METHOD
   * key), the extraction run — two claims: 0.9 → not_required (derivable), 0.5 → queued (the review gate's refusal of test 9).
   */
  test('8. a basis claim reached by API; the knowledge owner derives a document record through the form', async ({ page }) => {
    test.setTimeout(180_000);
    const X = `/v1/tenants/${T}/domains/${D}`;

    // THE EVIDENCE: the upload contract, its agent (an identity operation — the admin's), one CSV uploaded by the collector.
    const sourceId = await activeUploadSource(D, collector, SOURCE_KEY);
    const ag = await api(`${X}/observation/agents/register`,
      DOMAIN_ADMIN(D, { action: 'observation.agent.register', object_type: 'AGT', purpose_id: 'observation' }),
      { sourceId, connector: 'upload', ownerPrincipalId: collector.principalId }, admin.token);
    expect(ag.status).toBe(201);
    const up = await api(`${X}/observation/upload`,
      IN(collector, { action: 'observation.run.trigger', object_type: 'RUN', purpose_id: 'observation' }),
      { sourceId, contractVersion: 1, files: [
        { filename: 'e2e-memory.csv', mediaType: 'text/csv', base64: Buffer.from(CSV, 'utf8').toString('base64'), documentTime: '2024-01-14T00:00:00Z' },
      ] }, collector.token);
    expect(up.status).toBe(201);
    const runOut = (up.body as { run: { state: string; admitted: number; reason?: string } }).run;
    expect(runOut.state, `the upload run: ${JSON.stringify(runOut)}`).toBe('finished');
    expect(runOut.admitted).toBe(1);
    const ev = await api(`${X}/observation/evidence/list`,
      IN(collector, { action: 'observation.read.evidence', object_type: 'EVD', side_effect_class: 'none', purpose_id: 'observation' }),
      { sourceId, limit: 5 }, collector.token);
    expect(ev.status).toBe(201);
    const evidence = (ev.body as { evidence: Array<{ object_id: string; payload: { locator: string; content_digest: string } }> }).evidence;
    expect(evidence, 'one admitted record').toHaveLength(1);
    const evd = evidence[0]!;
    expect(evd.payload.content_digest, 'the evidence is admitted under the digest of the bytes uploaded').toBe(sha256(CSV));

    // THE METHOD: registered by the reader (a domain analyst); approved and activated by the extraction manager.
    const methodKey = `e2e-memory-claims-${run}`;
    const weightsDigest = sha256('e2e-weights');
    const decoding = { temperature: 0, top_p: 1, seed: 1, num_predict: 128 };
    const reg = await api(`${X}/intelligence/methods/register`,
      IN(reader, { action: 'intelligence.method.register', object_type: 'MTH', purpose_id: 'intelligence' }),
      { methodKey, name: 'E2E memory claims', sourceId, targetTypes: ['EVT', 'CLM'], gatewayMode: 'replay', modelId: 'e2e-fixture-model',
        modelWeightsDigest: weightsDigest, runtimeVersion: 'fixture/1', promptRef: 'extract/e2e-memory', promptVersion: 'v1',
        promptText: 'Return JSON claims for the e2e record.', decoding, confidenceFloor: 0.35, reviewBelow: 0.75, budgetCalls: 5, budgetSeconds: 60 }, reader.token);
    expect(reg.status, `the method registered: ${JSON.stringify(reg.body)}`).toBe(201);
    const method = (reg.body as { method: { methodId: string; promptDigest: string; decodingDigest: string } }).method;
    const ap = await api(`${X}/intelligence/methods/${method.methodId}/approve`,
      IN(xmanager, { action: 'intelligence.method.approve', object_type: 'MTH', object_id: method.methodId, purpose_id: 'intelligence' }),
      { reason: 'the e2e method reviewed for the memory walk' }, xmanager.token);
    expect(ap.status, `the method approved: ${JSON.stringify(ap.body)}`).toBe(201);
    const act = await api(`${X}/intelligence/methods/${method.methodId}/transition`,
      IN(xmanager, { action: 'intelligence.method.activate', object_type: 'MTH', object_id: method.methodId, purpose_id: 'intelligence' }),
      { target: 'active', reason: 'the e2e method: active for the memory walk' }, xmanager.token);
    expect(act.status, `the method activated: ${JSON.stringify(act.body)}`).toBe(201);

    // THE RECORDED RESPONSE, keyed by the request digest the gateway computes (never recomputing the prompt or decoding digests: the
    // register route answered them). Two claims: the event at 0.9 (above reviewBelow → not_required) and the claim at 0.5 (queued).
    const requestDigest = digest({
      prompt_ref: 'extract/e2e-memory', prompt_version: 'v1', prompt_digest: method.promptDigest,
      model_id: 'e2e-fixture-model', weights_digest: weightsDigest, runtime_version: 'fixture/1', decoding_digest: method.decodingDigest,
      input: { instruction: 'extract/e2e-memory', target_types: ['EVT', 'CLM'], source_key: methodKey, item_key: evd.payload.locator, evidence_digest: evd.payload.content_digest, evidence: CSV },
    });
    const rec = await api(`${X}/intelligence/gateway/record`,
      IN(xmanager, { action: 'intelligence.gateway.call', object_type: 'GWC', purpose_id: 'intelligence' }),
      { recordings: [{ requestDigest, response: { claims: [
        { claim_kind: 'event', subject: 'E2E plant', predicate: 'shipment_count', object_value: '1 on 2024-01-14', confidence: 0.9, byte_start: 0, byte_end: 12 },
        { claim_kind: 'claim', subject: 'E2E plant', predicate: 'stock_days', object_value: '9', confidence: 0.5, byte_start: 0, byte_end: 12 },
      ] }, modelId: 'e2e-fixture-model', runtimeVersion: 'fixture/1' }] }, xmanager.token);
    expect(rec.status, `the response recorded: ${JSON.stringify(rec.body)}`).toBe(201);
    expect((rec.body as { recordings: { stored: number } }).recordings.stored).toBe(1);

    // THE EXTRACTION: replayed from the recording; the claims listed at their current version.
    const ex = await api(`${X}/intelligence/extract`,
      IN(xmanager, { action: 'intelligence.claim.admit', object_type: 'CLM', purpose_id: 'intelligence' }),
      { methodId: method.methodId, limit: 5 }, xmanager.token);
    expect(ex.status, `the extraction: ${JSON.stringify(ex.body)}`).toBe(201);
    const extraction = (ex.body as { extraction: { state: string; mode: string; claimsAdmitted: number; queuedForReview: number; failure: string | null } }).extraction;
    expect(extraction, `the extraction ran from the recording: ${JSON.stringify(extraction)}`).toMatchObject({ state: 'completed', mode: 'replay', claimsAdmitted: 2, queuedForReview: 1 });
    const cl = await api(`${X}/intelligence/claims/list`,
      IN(xmanager, { action: 'intelligence.read', object_type: 'CLM', side_effect_class: 'none', purpose_id: 'intelligence' }),
      { limit: 50 }, xmanager.token);
    expect(cl.status).toBe(201);
    const claims = (cl.body as { claims: Array<{ object_id: string; object_type: string; truth_state: string; payload: { predicate: string; review?: { state: string } } }> }).claims;
    const evt = claims.find((c) => c.payload.predicate === 'shipment_count');
    const queued = claims.find((c) => c.payload.predicate === 'stock_days');
    expect(evt, 'the event claim').toBeDefined();
    expect(queued, 'the queued claim').toBeDefined();
    expect(evt).toMatchObject({ object_type: 'EVT', truth_state: 'extracted', payload: { review: { state: 'not_required' } } });
    expect(queued).toMatchObject({ object_type: 'CLM', payload: { review: { state: 'queued' } } });
    evtId = evt!.object_id;
    queuedId = queued!.object_id;

    // THE FORM: the knowledge owner names the basis and declares the record; the server computes the rest. The declared classification
    // is PUBLIC so the lift to the contract's ceiling (internal) is shown; the validity and the retention are left EMPTY so the basis's
    // event time (the upload's documentTime, copied onto the claim) and the basis's retention profile (the contract's, carried by the
    // extracted claim) stand in. The page renders every instant in UTC (fmtInstant), so the day asserted is the record's, not the runner's.
    await uiLogin(page, owner.username, PW);
    await openMemory(page);
    await expect(page.locator('#derive-bkind')).toHaveValue('claim');
    await page.locator('#derive-bid').fill(evtId);
    await expect(page.locator('#derive-bver')).toHaveValue('');
    await page.locator('#derive-skind').selectOption('document');
    await page.locator('#derive-title').fill(DERIVED_TITLE);
    await page.locator('#derive-cls').selectOption('public');
    await page.locator('#derive-purp').fill('memory');
    await expect(page.locator('#derive-vfrom')).toHaveValue('');
    await expect(page.locator('#derive-rprof')).toHaveValue('');
    await page.getByRole('button', { name: 'Derive', exact: true }).click();
    const derived = section(page, 'derive-h').locator('p').filter({ hasText: /^derived item [0-9a-f-]{36} version 1 from EVT:[0-9a-f-]{36}@1 \(extracted, review not_required\); 2 cite\(s\); classification declared public, inherited internal, applied internal; synthetic true; retention 24 months \(basis\); holds from 2024-01-14 00:00:00Z \(basis\); digest [0-9a-f]{64}/ });
    await expect(derived).toBeVisible();
    await expect(receiptIn(page, 'derive-h')).toBeVisible();
    // The statement is the method's, byte for byte: subject, predicate, object value and the basis's event time as ISO (the zone plays no part).
    const statement = section(page, 'derive-h').getByRole('definition').filter({ hasText: 'E2E plant shipment_count 1 on 2024-01-14 — as of 2024-01-14T00:00:00.000Z' });
    await expect(statement).toBeVisible();
    await expect(statement).toHaveText('E2E plant shipment_count 1 on 2024-01-14 — as of 2024-01-14T00:00:00.000Z');
    await expect(section(page, 'derive-h')).toContainText(/Statement digest\s*[0-9a-f]{64}/);
    await expect(section(page, 'derive-h')).toContainText(new RegExp(`${SOURCE_KEY}@1 · upload · text/csv · authoritative · synthetic`));
    await expect(section(page, 'derive-h')).toContainText(new RegExp(`EVD ${evd.object_id}@1 · bytes ${evd.payload.content_digest} · span 0–12`));
    const derivedId = /derived item ([0-9a-f-]{36})/.exec((await derived.textContent()) ?? '')?.[1] ?? '';
    expect(derivedId).toMatch(/^[0-9a-f-]{36}$/);
    expect(derivedId).not.toBe(itemId);

    // The listing names the basis beside the kind, and shows the inherited classification and retention — no content.
    const row = section(page, 'list-h').getByRole('row').filter({ hasText: DERIVED_TITLE });
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell', { name: /^document ← EVT:[0-9a-f]{8}…@1$/ })).toBeVisible();
    await expect(row.getByRole('cell', { name: 'internal', exact: true })).toBeVisible();
    await expect(row.getByRole('cell', { name: '24 months', exact: true })).toBeVisible();
    await expect(row).not.toContainText('E2E plant shipment_count');

    // THE RETRIEVAL under memory: the served version carries the derivation block; the availability says the basis's state.
    await selectItem(page, DERIVED_TITLE);
    await retrieve(page, 'memory');
    const served = section(page, 'retrieve-h');
    await expect(served).toContainText(/version 1 of 1 is current; you were served version 1 \(the current one\)/);
    await expect(served).toContainText(/· basis current/);
    await expect(served).toContainText(/truth extracted · synthetic true/);
    await expect(served).toContainText('E2E plant shipment_count 1 on 2024-01-14 — as of 2024-01-14T00:00:00.000Z');
    const derivation = served.getByRole('definition').filter({ hasText: 'method memory-derive@1.0.0' });
    await expect(derivation).toBeVisible();
    await expect(derivation).toContainText(`basis EVT:${evtId}@1`);
    await expect(derivation).toContainText('(extracted, review not_required)');
    await expect(derivation).toContainText(`source ${SOURCE_KEY}@1 (upload, text/csv, authoritative, synthetic)`);
    await expect(derivation).toContainText(`EVD ${evd.object_id}@1`);
    await expect(derivation).toContainText(/statement digest [0-9a-f]{64}/);
    await expect(served.getByRole('definition').filter({ hasText: /^document · / })).toBeVisible();
    await expect(receiptIn(page, 'retrieve-h')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Access history (1)' })).toBeVisible();
  });

  test('9. the refusals in the page\'s words; the record form records human records only', async ({ page }) => {
    test.skip(evtId === '' || queuedId === '', 'test 8 seeds the basis claims (run the file whole)');
    await uiLogin(page, owner.username, PW);
    await openMemory(page);

    // The review gate: a claim a person has not decided (queued below the method's review threshold) grounds no memory record.
    await page.locator('#derive-bid').fill(queuedId);
    await page.locator('#derive-skind').selectOption('document');
    await page.locator('#derive-title').fill(`E2E queued basis ${run}`);
    await page.locator('#derive-purp').fill('memory');
    await page.getByRole('button', { name: 'Derive', exact: true }).click();
    await expect(status(page, /not derived — HTTP 409 EYE-STA-002 — CLM [0-9a-f-]{36}@1 is queued for review \(confidence below the method review threshold\); a claim a person has not decided does not ground a memory record/)).toBeVisible();

    // The kind's one verifiable rule: telemetry names a source with a registered series; the upload source has none.
    await page.locator('#derive-bid').fill(evtId);
    await page.locator('#derive-skind').selectOption('telemetry');
    await page.locator('#derive-title').fill(`E2E telemetry without a series ${run}`);
    await page.getByRole('button', { name: 'Derive', exact: true }).click();
    await expect(status(page, new RegExp(`not derived — HTTP 422 EYE-REQ-001 — telemetry names a source with a registered series; ${SOURCE_KEY} has none`))).toBeVisible();

    // The record form records a person's own record only: the source kind lists human and nothing else.
    await expect(page.locator('#new-skind')).toHaveValue('human');
    await expect(page.locator('#new-skind option')).toHaveCount(1);

    // The reader (a domain analyst) is not a holder of memory.item.derive: the policy's refusal, verbatim.
    await uiLogin(page, reader.username, PW);
    await openMemory(page);
    await page.locator('#derive-bid').fill(evtId);
    await page.locator('#derive-skind').selectOption('document');
    await page.locator('#derive-title').fill(`E2E reader derivation ${run}`);
    await page.locator('#derive-purp').fill('memory');
    await page.getByRole('button', { name: 'Derive', exact: true }).click();
    await expect(status(page, /not derived — HTTP 403 EYE-AUT-001 — no qualifying role binding for action in resolved scope/)).toBeVisible();
  });
});
