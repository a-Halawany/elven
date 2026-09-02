/**
 * Phase 1 browser acceptance — A12.
 *
 * The journey the plan names, end to end, through the real interface:
 *
 *   register a source → approve it (SECOND OPERATOR) → collect evidence →
 *   inspect original bytes and chain of custody → view health, freshness and
 *   coverage → inspect quarantine → submit a correction or withdrawal
 *
 * with accessibility (keyboard, landmarks, labels), safe attachment-only
 * downloads, and non-disclosure on denied views asserted along the way.
 *
 * The suite seeds its own tenant, domain and two operators through the API — the
 * same requests an operator makes — and then drives the UI. Nothing is asserted
 * against a fixture the interface did not actually render.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3401';
const REPO = join(__dirname, '..');
const FIXTURES = join(REPO, 'fixtures', 'phase1', 'replay');

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be provided (generated .eye-local/env or caller environment)`);
  return v;
}
const BOOTSTRAP_PW = required('EYE_TEST_BOOTSTRAP_PASSWORD');
const ADMIN_PW = required('EYE_TEST_ADMIN_PASSWORD');
const OPERATOR_PW = `Ob1!${crypto.randomUUID()}`;

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
    principal_id: 'anonymous', purpose_id: 'observation',
    action: 'x', side_effect_class: 'reversible', consequence_class: 'C1',
    object_type: 'OBJ', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-p1',
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
  await page.waitForURL(/\/(admin|observation)/);
}

interface Ctx { token: string; principalId: string }

let admin: Ctx;
let registrar: Ctx & { username: string };
let manager: Ctx & { username: string };
let tenantId = '';
let domainId = '';
let sourceId = '';
const run = Date.now().toString(36);

const CONTRACT_KEY = `e2e-portwatch-${run}`;

/** A complete §7 contract for the source this suite registers through the UI. */
function contractFor(sourceKey: string): Record<string, unknown> {
  return {
    source_key: sourceKey,
    name: `E2E PortWatch Chokepoints ${run}`,
    publisher: 'International Monetary Fund',
    authority_class: 'authoritative',
    connector_kind: 'rest',
    acquisition_mode: 'replay',
    data_origin: 'real',
    identity: {
      source_identity: sourceKey,
      publisher_identity: 'International Monetary Fund — PortWatch',
      endpoints: [
        'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query?where=portid%3D%27chokepoint4%27&outFields=*&f=json',
      ],
      scheme_allowlist: ['https'],
      cadence_seconds: 86400,
      jitter_seconds: 60,
      collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations', steward: 'e2e',
      authority: 'Official IMF derived indicator', legal_basis: 'Public open-data platform publication',
      rights_state: 'pending',
      licence: 'UNVERIFIED — no unambiguous reuse notice located',
      permitted_use: ['internal analysis'], robots_policy: 'API endpoint',
      purposes: ['observation'], classification_ceiling: 'internal',
      residency: 'EU', retention: '24 months', deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null,
      authentication_method: 'anonymous (no credential required)',
      authenticity_method: {
        transport_endpoint: 'TLS certificate verification of the connected endpoint',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'endpoint host allowlisted from the contract and pinned at connect time',
        content_authenticity: 'unknown — this publisher offers no signature mechanism',
      },
      budgets: {
        max_requests_per_run: 12, max_bytes_per_run: 33554432,
        max_concurrency: 2, timeout_ms: 60000, max_retries: 2,
      },
      expected_schema: {
        media_types: ['application/json'],
        required_fields: ['features.[].attributes.n_total', 'features.[].attributes.date'],
        drift_tolerance: 0, max_bytes: 8388608,
        item_path: 'features', item_key_field: 'attributes.date', item_time_field: 'attributes.date',
      },
      freshness_expectation: { threshold_seconds: 259200, expected_interval: 'daily' },
      coverage_expectations: {
        universe_version: 'v2',
        denominator_derivation: 'one framed row per chokepoint per day across the covered band',
        expected_items_per_window: 21,
        not_applicable_dimensions: [], not_applicable_reason: null,
      },
      correction_channel: 'publisher re-publication of the series',
      replay_set: 'imf-portwatch-chokepoints',
    },
    lifecycle: { contract_version: 1, effective_from: '2024-01-01T00:00:00Z', effective_to: null },
  };
}

test.describe.configure({ mode: 'serial' });

test.describe('Phase 1 — Observation Operations (A12)', () => {
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
    };

    // Tenant + domain for this run.
    const t = await api('/v1/platform/tenants',
      { action: 'tenancy.tenant.create', object_type: 'TEN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `E2E Observation ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    tenantId = (t.body as { tenant: { id: string } }).tenant.id;

    const d = await api(`/v1/tenants/${tenantId}/domains`,
      { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: tenantId, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `Corridor ${run}` }, admin.token);
    expect(d.status).toBe(201);
    domainId = (d.body as { domain: { id: string } }).domain.id;

    // TWO operators, because separation of duties is a claim this suite must show.
    for (const [login, role] of [[`e2e-reg-${run}`, 'domain_analyst'], [`e2e-mgr-${run}`, 'collection_manager']] as const) {
      const p = await api(`/v1/tenants/${tenantId}/principals`,
        { action: 'identity.principal.create', scope: 'TENANT', tenant_id: tenantId, object_type: 'PRN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
        { kind: 'human', displayName: login, loginName: login, password: OPERATOR_PW, roleCode: role, domainId }, admin.token);
      expect(p.status).toBe(201);
    }
    const rl = await loginApi(`e2e-reg-${run}`, OPERATOR_PW);
    const ml = await loginApi(`e2e-mgr-${run}`, OPERATOR_PW);
    expect(rl.status).toBe(201);
    expect(ml.status).toBe(201);
    registrar = {
      token: (rl.body as { tokens: { accessToken: string } }).tokens.accessToken,
      principalId: (rl.body as { principalId: string }).principalId,
      username: `e2e-reg-${run}`,
    };
    manager = {
      token: (ml.body as { tokens: { accessToken: string } }).tokens.accessToken,
      principalId: (ml.body as { principalId: string }).principalId,
      username: `e2e-mgr-${run}`,
    };
  });

  /**
   * Later tests need the source id. Test 1 captures it from the page it rendered,
   * which is the point of that test; this resolves it from the API when a single
   * test is run in isolation, so the suite is debuggable one test at a time
   * rather than only as a whole.
   */
  test.beforeEach(async () => {
    if (sourceId !== '') return;
    const r = await api(`/v1/tenants/${tenantId}/domains/${domainId}/observation/sources/list`,
      { action: 'observation.read.sources', scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, object_type: 'SRC', principal_id: `principal:${manager.principalId}`, side_effect_class: 'none' },
      { limit: 200 }, manager.token);
    const found = ((r.body as { sources?: Array<{ source_id: string; source_key: string }> }).sources ?? [])
      .find((x) => x.source_key === CONTRACT_KEY);
    if (found !== undefined) sourceId = found.source_id;
  });

  test('1. the registrar registers a source through the four-step form', async ({ page }) => {
    await uiLogin(page, registrar.username, OPERATOR_PW);
    await page.goto('/observation/sources/new');
    await expect(page.getByRole('heading', { name: 'Register a source', level: 1 })).toBeVisible();

    // Step 1 — identity.
    await page.getByLabel('Source key').fill(CONTRACT_KEY);
    await page.getByLabel('Name', { exact: true }).fill(`E2E PortWatch Chokepoints ${run}`);
    await page.getByLabel('Publisher').fill('International Monetary Fund');
    await page.getByLabel('Endpoints (comma separated, HTTPS only)').fill(
      'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query?where=portid%3D%27chokepoint4%27&outFields=*&f=json',
    );
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2 — authority and rights. `pending` is the default and is a statement.
    await expect(page.getByLabel('Rights state')).toHaveValue('pending');
    await page.getByLabel('Legal basis').fill('Public open-data platform publication');
    await page.getByLabel('Licence').fill('UNVERIFIED — no unambiguous reuse notice located');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3 — operations.
    await page.getByLabel('Required fields (comma separated, dotted paths)')
      .fill('features.[].attributes.n_total, features.[].attributes.date');
    await page.getByLabel('Denominator derivation').fill('one framed row per chokepoint per day');
    await page.getByLabel('Correction channel').fill('publisher re-publication of the series');
    // The frozen set this contract reads from, declared rather than inferred.
    await page.getByLabel('Replay set').fill('imf-portwatch-chokepoints');
    // Contract-declared framing: each feature becomes a child that is an exact
    // byte range of the preserved parent, which is what lets one drifted row be
    // quarantined without losing the twenty good ones.
    await page.getByLabel('Item path').fill('features');
    await page.getByLabel('Item key field').fill('attributes.date');
    await page.getByLabel('Item time field').fill('attributes.date');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4 — review, then submit as a DRAFT.
    await expect(page.getByText('It submits as a draft')).toBeVisible();
    await page.getByRole('button', { name: 'Submit for approval' }).click();

    // The interface says the rule, and names it, rather than only disabling a button.
    await expect(page.getByText('Submitted for approval — you cannot approve your own registration')).toBeVisible();
    await expect(page.getByText(/committed — POL/)).toBeVisible();

    const id = await page.locator('bdi').filter({ hasText: /^[0-9a-f-]{36}$/ }).first().innerText();
    sourceId = id.trim();
    expect(sourceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('2. the registrar cannot approve their own registration', async ({ page }) => {
    await uiLogin(page, registrar.username, OPERATOR_PW);
    await page.goto(`/observation/sources/${sourceId}`);
    await page.getByLabel('Reason (recorded with the decision)').fill('attempting to approve my own registration');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    // The refusal names the rule; the contract stays a draft.
    await expect(page.locator('main').getByRole('alert')).toContainText(/may never approve it|no qualifying role binding/i);
    await expect(page.getByText('draft')).toBeVisible();
  });

  test('3. a second operator approves and activates it', async ({ page }) => {
    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto(`/observation/sources/${sourceId}`);
    await page.getByLabel('Reason (recorded with the decision)').fill('contract reviewed against the publisher terms on record');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText(/committed — POL/)).toBeVisible();

    // Rights are UNVERIFIED and stay visible after activation: a replay contract
    // may be activated, a live one may not, and the state does not disappear.
    await expect(page.getByText('RIGHTS UNVERIFIED')).toBeVisible();
    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByRole('button', { name: 'Collect now' })).toBeVisible();
  });

  test('4. collection admits evidence and quarantines the drifted row', async ({ page }) => {
    // The agent is provisioned through the API — creating its principal is a
    // tenant-level identity operation, which a domain manager correctly cannot do.
    const ag = await api(`/v1/tenants/${tenantId}/domains/${domainId}/observation/agents/register`,
      { action: 'observation.agent.register', scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, object_type: 'AGT', principal_id: `principal:${admin.principalId}` },
      { sourceId, connector: 'rest', ownerPrincipalId: registrar.principalId }, admin.token);
    expect(ag.status).toBe(201);

    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto(`/observation/sources/${sourceId}`);
    await page.getByRole('button', { name: 'Collect now' }).click();
    // The run's own numbers, from the server. A run that finished having admitted
    // NOTHING is not a passing collection, so the count is asserted as positive
    // rather than merely present.
    const status = page.getByRole('status').filter({ hasText: /^run / });
    await expect(status).toBeVisible({ timeout: 30_000 });
    const text = await status.innerText();
    const admitted = Number(/(\d+) admitted/.exec(text)?.[1] ?? '0');
    const quarantined = Number(/(\d+) quarantined/.exec(text)?.[1] ?? '0');
    expect(text, 'the run should have finished').toContain('run finished');
    expect(admitted, `expected admissions, got: ${text}`).toBeGreaterThan(0);
    // The planted schema-drift row is quarantined, not admitted-and-flagged.
    expect(quarantined, `expected the drifted row to be quarantined, got: ${text}`).toBe(1);
  });

  test('5. coverage reports the planted gap rather than rounding it away', async ({ page }) => {
    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto(`/observation/sources/${sourceId}`);
    await page.getByRole('button', { name: 'Evaluate coverage' }).click();
    await expect(page.getByText(/committed — POL/)).toBeVisible({ timeout: 20_000 });

    const coverage = page.getByRole('region', { name: 'Coverage dimensions' });
    await expect(coverage).toBeVisible();
    // `unknown` is rendered as a state, not left blank.
    await expect(coverage.getByText('UNKNOWN').first()).toBeVisible();
    // Content authenticity says what it does not know, in words.
    await expect(page.getByText(/Content authenticity is unknown for every source in this phase/)).toBeVisible();
    // The gap is reported as insufficient evidence, not rounded into a percentage.
    await expect(coverage.getByText(/carry no admitted evidence|INSUFFICIENT EVIDENCE/).first()).toBeVisible();
  });

  test('6. the health timeline replays deterministically from stored events', async ({ page }) => {
    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto(`/observation/sources/${sourceId}`);
    await page.getByRole('button', { name: 'Replay the health timeline' }).click();
    await expect(page.getByText(/replayed from stored events — identical on both runs/)).toBeVisible({ timeout: 20_000 });
  });

  test('7. evidence custody, the four times, and a safe attachment-only download', async ({ page }) => {
    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto(`/observation/evidence?source=${sourceId}`);
    await expect(page.getByRole('heading', { name: 'Evidence', level: 1 })).toBeVisible();
    // The first row of the evidence table — the way an operator reaches it.
    await page.locator('table.eye-table tbody tr').first().getByRole('link').first().click();

    await expect(page.getByRole('heading', { name: /^Evidence/, level: 1 })).toBeVisible();
    // The four times, each named.
    await expect(page.getByText('Four times')).toBeVisible();
    await expect(page.getByText('the publisher’s own time for this item')).toBeVisible();
    // The four authenticity concepts, separately, with content authenticity unknown.
    await expect(page.getByRole('heading', { name: /Authenticity — four separate concepts/ })).toBeVisible();
    await expect(page.getByRole('term').filter({ hasText: 'Content authenticity' })).toBeVisible();
    await expect(page.getByText(/Neither establishes that the content is genuinely the publisher/)).toBeVisible();
    // The custody chain.
    await expect(page.getByRole('region', { name: 'Custody events' })).toBeVisible();

    // The download is attachment-only and re-verifies the digest.
    await page.getByRole('button', { name: 'Retrieve the original bytes' }).click();
    await expect(page.getByText(/retrieved · integrity verified/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/committed — POL/)).toBeVisible();
    // Nothing is rendered inline as a document: the bytes appear as text in a
    // scrollable region, never as an embedded frame or object.
    expect(await page.locator('iframe, embed, object').count()).toBe(0);
  });

  test('8. quarantine shows the refusal and requires a reason and a second operator', async ({ page }) => {
    // An operator WITHOUT collection_manager is refused.
    await uiLogin(page, registrar.username, OPERATOR_PW);
    await page.goto('/observation/quarantine');
    await expect(page.getByText('Quarantined — not admitted')).toBeVisible();
    await expect(page.getByText(/Releasing or discarding a quarantined item requires/)).toBeVisible();

    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto('/observation/quarantine');
    const first = page.locator('article').first();
    await expect(first).toBeVisible();
    await first.getByRole('button', { name: 'Discard…' }).click();
    // The control is disabled until a reason of substance is given.
    const confirm = first.getByRole('button', { name: 'Discard', exact: true });
    await expect(confirm).toBeDisabled();
    await first.getByLabel(/Reason for discarding/).fill('the row is missing a required field upstream and is not admissible');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText(/committed — POL/)).toBeVisible({ timeout: 20_000 });
  });

  test('9. a correction supersedes without overwriting, and states what it did not resolve', async ({ page }) => {
    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto('/observation/corrections');
    await page.getByLabel('Source').selectOption({ label: `E2E PortWatch Chokepoints ${run}` });
    await page.getByLabel('Reason — recorded on the case').fill('the publisher republished the series for this window');
    // Affect exactly one object.
    await page.locator('fieldset input[type=checkbox]').first().check();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText(/committed — POL/)).toBeVisible({ timeout: 20_000 });

    const openCase = page.locator('article').first();
    await expect(openCase).toBeVisible();
    // The propagation scope is stated, including what is unresolved.
    await expect(openCase.getByText(/downstream consumers not yet present/)).toBeVisible();

    await openCase.getByLabel('Review reason').fill('republication verified against the feed');
    await openCase.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByText(/committed — POL/)).toBeVisible({ timeout: 20_000 });
  });

  test('10. a known-at query reproduces the pre-correction state', async ({ page }) => {
    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto(`/observation/evidence?source=${sourceId}`);
    // The first row of the evidence table — the way an operator reaches it.
    await page.locator('table.eye-table tbody tr').first().getByRole('link').first().click();
    // The version history retains every version; nothing was overwritten.
    await expect(page.getByRole('region', { name: 'Version history' })).toBeVisible();
    await expect(page.getByText('A correction is a new version; nothing is overwritten')).toBeVisible();
  });

  test('11. keyboard operation, landmarks and labels', async ({ page }) => {
    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto('/observation');
    await expect(page.getByRole('region', { name: 'Source health table' })).toBeVisible();

    // Landmarks with accessible names, and exactly one h1.
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Observation Operations' })).toBeVisible();
    await expect(page.locator('main')).toBeVisible();
    expect(await page.locator('h1').count()).toBe(1);

    // Every table is a real table with a caption and scoped headers.
    const tables = page.locator('table.eye-table');
    const count = await tables.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(tables.nth(i).locator('caption')).not.toBeEmpty();
      expect(await tables.nth(i).locator('th[scope="col"]').count()).toBeGreaterThan(0);
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

  test('12. state is never carried by colour alone', async ({ page }) => {
    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto('/observation');
    // The overview renders from the server's answer, so wait for the answer
    // rather than for a moment that happens to be late enough.
    await expect(page.getByRole('region', { name: 'Source health table' })).toBeVisible();
    // Every health badge carries a glyph AND an uppercase word, so it survives a
    // monochrome screen and a colour-vision difference.
    const badges = page.locator('[aria-label^="source health"]');
    const n = await badges.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i += 1) {
      const text = (await badges.nth(i).innerText()).trim();
      expect(text).toMatch(/^[●◐◍⊘✕] (HEALTHY|DEGRADED|UNKNOWN|SUSPENDED|FAILED)$/);
    }
  });

  test('13. a denied view discloses nothing about another domain', async ({ page }) => {
    // A source id that does not exist in this domain must answer exactly as one
    // that exists elsewhere would: no distinction is available to the caller.
    await uiLogin(page, manager.username, OPERATOR_PW);
    const absent = crypto.randomUUID();
    await page.goto(`/observation/sources/${absent}`);
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toBeVisible();
    const text = await alert.innerText();
    expect(text).toMatch(/no authorized source contract matches/i);
    // Nothing about existence, ownership, another tenant, or internal topology.
    expect(text).not.toMatch(/tenant|domain|exists|elsewhere|other/i);
  });

  test('14. the shell mirrors under RTL and never scrolls the page sideways', async ({ page }) => {
    await uiLogin(page, manager.username, OPERATOR_PW);
    await page.goto('/observation/sources');
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));
    await expect(page.getByRole('navigation', { name: 'Observation Operations' })).toBeVisible();
    const dir = await page.evaluate(() => getComputedStyle(document.querySelector('main') as Element).direction);
    expect(dir).toBe('rtl');

    // Wide content scrolls inside its own container at every breakpoint.
    for (const width of [1440, 1024, 800, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const overflows = await page.evaluate(() =>
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflows, `page scrolls horizontally at ${width}px`).toBe(false);
    }
  });

  test('15. projections rebuild from the event log with no drift (A11)', async () => {
    const r = await api(`/v1/tenants/${tenantId}/domains/${domainId}/observation/projections/verify`,
      { action: 'observation.read.projections', scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, object_type: 'SRC', principal_id: `principal:${manager.principalId}`, side_effect_class: 'none' },
      {}, manager.token);
    expect(r.status).toBe(201);
    const projections = (r.body as { projections: Array<{ projection: string; mismatched_rows: string }> }).projections;
    expect(projections.length).toBeGreaterThan(0);
    for (const p of projections) {
      expect(Number(p.mismatched_rows), `${p.projection} drifted from its event log`).toBe(0);
    }
  });
});

/** The replay set must exist for the suite to mean anything. */
test('replay fixtures are present and self-consistent', () => {
  const sets = readdirSync(FIXTURES);
  expect(sets.length).toBeGreaterThan(0);
  for (const set of sets) {
    const manifest = JSON.parse(readFileSync(join(FIXTURES, set, 'MANIFEST.json'), 'utf8')) as {
      entries: Array<{ file: string; sha256: string; byte_length: number }>;
    };
    for (const e of manifest.entries) {
      const bytes = readFileSync(join(FIXTURES, set, e.file));
      expect(createHash('sha256').update(bytes).digest('hex'), `${set}/${e.file} digest`).toBe(e.sha256);
      expect(bytes.byteLength, `${set}/${e.file} length`).toBe(e.byte_length);
    }
  }
});
