/**
 * CP-6 B18 browser walk — the retention workspace, the TENANT acting through the working-domain chooser.
 *
 * The journey, end to end, through the real interface:
 *
 *   a customer export opened on two records and its scope resolved (the steward) →
 *   approved on the digest BY THE TENANT ADMINISTRATOR through the working-domain chooser (listed; B18 part 3) →
 *   executed and verified; the record shows the signed package →
 *   delivered to a transfer station (the origin's administrator) →
 *   imported by the tenant's SECOND domain from that station — the partner declared on the tenant's own public key →
 *   approved BY THE RETENTION AUTHORITY through the chooser (pasted) → admitted; the origin's record lists the importer →
 *   the package revoked at the origin: the importing domain notified, its revocation pending for its own steward →
 *   the copies destroyed by the importing steward (the B18 bytes line), the origin answered → the retry →
 *   the refusals in the page's own words → fail closed: a platform principal, a tenant principal without a choice, the
 *   choice is the principal's.
 *
 * The seeding is the API's, in the Phase 1 idiom: this suite makes its own tenant, TWO domains and nine principals with a
 * per-run password, and then drives the UI. The signing key is EYE_EXPORT_SIGNING_KEY_E2E, generated once by
 * playwright.config.ts and bound in the API's process (its public PEM reaches this file as EYE_E2E_EXPORT_PUBLIC_PEM). No
 * scheduler runs (no delivery of an outbox event is asserted). The transfer station is a temporary directory of this
 * host, outside the vault roots (the API's defaults). Nothing is asserted against a fixture the interface did not render;
 * a refusal is read from role="status" in the page's words; a receipt is asserted INSIDE the section of the act that
 * produced it (a page keeps the receipts of earlier acts).
 *
 * The selectors are the page's own (apps/web/app/graph/retention/page.tsx): the sections by their heading ids —
 * `open-h` (Open an action: #op-kind, #op-manifest-ids, #op-ceiling, "Open action", "select it"), `acts-h` (the actions
 * table, "select"), `rec-h` (the record: the export block's Signature / Digests / Importers, the region "the signing key's
 * public key", "importers of the package"), `resolve-h` ("Resolve scope"), `approve-h` ("Digest submitted:", #ap-why,
 * "Approve on this digest"), `exec-h` ("Execute the approved scope"), `verify-h` ("Verify"), `wd-h` (#wd-reason,
 * "Withdraw"), `xd-h` (Export delivery: the region "export signing keys", #ds-key/#ds-kind/#ds-endpoint/#ds-recipient/
 * #ds-purpose, "Declare destination"), `xp-h` (Exchange partners: #xp-key/#xp-party/#xp-purpose/#xp-source/#xp-version/
 * #xp-pem, "Declare partner", the region "the partner's public key as recorded"), `im-h` (Imports: #im-kind, #im-station,
 * #im-o-tenant/#im-o-domain/#im-o-action, "Open import", the record's definitions, the regions "import checks" / "import
 * items" / "import events", #im-rationale, "Approve the import", "Admit the import", #im-rv-kind, "Revoke the import"),
 * `dv-h` (#dv-dest, "Deliver to the destination", the region "export deliveries"), `rv-h` (#rv-reason, "Revoke the
 * package", the region "revocation notices"). The chooser's are implementer W's (components/working-domain.tsx): the
 * heading "Working domain", #wd-domain (a <select> when listed, an <input> when pasted), "Open this domain"; the header's
 * "working domain" mark and the button "Change the working domain".
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const API = 'http://localhost:3401';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be provided (generated .eye-local/env or caller environment)`);
  return v;
}
const BOOTSTRAP_PW = required('EYE_TEST_BOOTSTRAP_PASSWORD');
const ADMIN_PW = required('EYE_TEST_ADMIN_PASSWORD');
/** The public half of the key the API holds under EYE_EXPORT_SIGNING_KEY_E2E — derived in playwright.config.ts from the same private key. */
const PUBLIC_PEM = required('EYE_E2E_EXPORT_PUBLIC_PEM');
/** One per-run password for every principal this suite creates; it lives in the worker's memory only. */
const PW = `Rt6!${crypto.randomUUID()}`;
/** The transfer station: a directory of this host outside the vault roots, made by the worker in beforeAll and realpath'd as the API will realpath it. */
let STATION = '';
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
    principal_id: 'anonymous', purpose_id: 'retention',
    action: 'x', side_effect_class: 'reversible', consequence_class: 'C2',
    object_type: 'OBJ', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-p6r',
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
// The origin domain's people.
let steward1: Ctx; let admin1: Ctx; let manager1: Ctx;
// The mirror domain's people.
let steward2: Ctx; let admin2: Ctx; let manager2: Ctx;
// The TENANT-homed principals — one per chooser mode (a tenant administrator lists; a retention authority pastes).
let tadmin: Ctx; let authority: Ctx;
let tenantId = '';
let D1 = '';
let D2 = '';
let sourceId1 = '';
let intakeSourceId2 = '';
let manifestIds: string[] = [];
let actionId = '';
let importId = '';
let packageDigest = '';

const DOMAIN_ADMIN = (domainId: string, over: Record<string, unknown>) =>
  ({ scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration', ...over });
const IN = (domainId: string, who: Ctx, over: Record<string, unknown>) =>
  ({ scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${who.principalId}`, ...over });

/** Two distinct synthetic CSV records (header + two rows each): distinct bytes, so two evidence objects are admitted. */
const CSV_A = ['synthetic,record_id,kind,value,note', 'true,e2e-a-1,term,14,inland days', 'true,e2e-a-2,term,11,reroute delay days'].join('\n') + '\n';
const CSV_B = ['synthetic,record_id,kind,value,note', 'true,e2e-b-1,terms,1850,reroute cost per container', 'true,e2e-b-2,terms,1600,units per container'].join('\n') + '\n';

/**
 * The upload contract of an exchange party (the B16 harness shape, apps/api/test/int/phase4-helpers.ts uploadContract —
 * copied here because the browser gate cannot import a test helper of apps/api): an upload connector under replay, synthetic
 * data, rights CONFIRMED (the intake's gate), ceiling internal, CSV.
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

/** A principal of this tenant with the per-run password, signed in by API; no domainId makes a TENANT-homed principal. */
async function person(login: string, roleCode: string, domainId?: string): Promise<Ctx> {
  const p = await api(`/v1/tenants/${tenantId}/principals`,
    { action: 'identity.principal.create', scope: 'TENANT', tenant_id: tenantId, object_type: 'PRN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
    { kind: 'human', displayName: login, loginName: login, password: PW, roleCode, ...(domainId === undefined ? {} : { domainId }) }, admin.token);
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
 * An upload contract registered by the ADMIN (a registrar never approves its own contract), approved and activated by the
 * domain's collection manager — the same three governed requests an operator makes.
 */
async function activeUploadSource(domainId: string, manager: Ctx, sourceKey: string): Promise<string> {
  const reg = await api(`/v1/tenants/${tenantId}/domains/${domainId}/observation/sources/register`,
    DOMAIN_ADMIN(domainId, { action: 'observation.source.register', object_type: 'SRC', purpose_id: 'observation' }),
    { contract: uploadContract(sourceKey) }, admin.token);
  expect(reg.status, `${sourceKey} registered`).toBe(201);
  const sourceId = (reg.body as { source: { sourceId: string } }).source.sourceId;
  const ap = await api(`/v1/tenants/${tenantId}/domains/${domainId}/observation/sources/${sourceId}/approve`,
    IN(domainId, manager, { action: 'observation.source.approve', object_type: 'SRC', object_id: sourceId, purpose_id: 'observation' }),
    { contractVersion: 1, decision: 'approve', reason: 'the e2e upload contract reviewed' }, manager.token);
  expect(ap.status, `${sourceKey} approved`).toBe(201);
  const tr = await api(`/v1/tenants/${tenantId}/domains/${domainId}/observation/sources/${sourceId}/transition`,
    IN(domainId, manager, { action: 'observation.source.transition', object_type: 'SRC', object_id: sourceId, purpose_id: 'observation' }),
    { contractVersion: 1, target: 'active', reason: 'the e2e upload contract: active' }, manager.token);
  expect(tr.status, `${sourceKey} active`).toBe(201);
  return sourceId;
}

/* ───────────────────────── the page's own selectors ───────────────────────── */

/** The chooser in its LISTED mode (a tenant administrator): the domain picked from the tenant's list, then opened. */
async function chooseListed(page: Page, domainId: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Working domain' })).toBeVisible();
  await page.locator('#wd-domain').selectOption(domainId);
  await page.getByRole('button', { name: 'Open this domain' }).click();
}
/** The chooser in its PASTED mode (every other TENANT role): the domain id typed, then opened. */
async function choosePasted(page: Page, domainId: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Working domain' })).toBeVisible();
  await page.locator('#wd-domain').fill(domainId);
  await page.getByRole('button', { name: 'Open this domain' }).click();
}
/** The header shows the working domain exactly as a home domain is shown, marked as the working one, with the change control. */
async function expectWorking(page: Page, domainId: string): Promise<void> {
  const banner = page.getByRole('banner');
  await expect(banner).toContainText(`domain ${domainId.slice(0, 8)}…`);
  await expect(banner).toContainText('working domain');
  await expect(banner.getByRole('button', { name: 'Change the working domain' })).toBeVisible();
}
async function openRetention(page: Page): Promise<void> {
  await page.goto('/graph/retention');
  await expect(page.getByRole('heading', { name: 'Retention', level: 1 })).toBeVisible();
}
/** The customer export selected from the Actions table — the way a person reaches its record. */
async function selectAction(page: Page): Promise<void> {
  await page.locator('section[aria-labelledby="acts-h"]').getByRole('row').filter({ hasText: 'customer_export' })
    .getByRole('button', { name: /^select(ed)?$/ }).click();
  await expect(page.getByRole('heading', { name: /^The action's record — customer_export on evidence/ })).toBeVisible();
}
/** The import selected from the Imports table by its short id — the way a person reaches its record. */
async function selectImport(page: Page): Promise<void> {
  await page.locator('section[aria-labelledby="im-h"]').getByRole('button', { name: `${importId.slice(0, 8)}…` }).click();
  await expect(page.getByRole('heading', { name: `The import's record — ${importId.slice(0, 8)}…` })).toBeVisible();
}
const section = (page: Page, id: string) => page.locator(`section[aria-labelledby="${id}"]`);
const status = (page: Page, re: RegExp) => page.getByRole('status').filter({ hasText: re });
/** A receipt is asserted inside the section of the act that produced it: a page keeps the receipts of earlier acts. */
const receiptIn = (page: Page, id: string) => section(page, id).getByText(/committed — POL/);

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B18 — Retention (the TENANT acts through the working-domain chooser)', () => {
  test.beforeAll(async () => {
    // About thirty governed requests (two tenancy, eight principals and their sign-ins, two contracts three acts each, the
    // agent, a two-file upload under the content controls, the evidence list, the key): the hook's own budget, not the test's.
    test.setTimeout(120_000);
    STATION = realpathSync(mkdtempSync(join(tmpdir(), 'eye-e2e-station-')));

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

    // The tenant and its TWO domains: the origin and the mirror of the exchange.
    const t = await api('/v1/platform/tenants',
      { action: 'tenancy.tenant.create', object_type: 'TEN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `E2E Retention ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    tenantId = (t.body as { tenant: { id: string } }).tenant.id;
    for (const [name, set] of [[`Origin ${run}`, (id: string) => { D1 = id; }], [`Mirror ${run}`, (id: string) => { D2 = id; }]] as const) {
      const d = await api(`/v1/tenants/${tenantId}/domains`,
        { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: tenantId, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
        { name }, admin.token);
      expect(d.status).toBe(201);
      set((d.body as { domain: { id: string } }).domain.id);
    }

    // The people: three per domain, and the two TENANT-homed principals (no domainId) — one per chooser mode.
    steward1 = await person(`p6r-steward1-${run}`, 'retention_steward', D1);
    admin1 = await person(`p6r-admin1-${run}`, 'domain_admin', D1);
    manager1 = await person(`p6r-manager1-${run}`, 'collection_manager', D1);
    steward2 = await person(`p6r-steward2-${run}`, 'retention_steward', D2);
    admin2 = await person(`p6r-admin2-${run}`, 'domain_admin', D2);
    manager2 = await person(`p6r-manager2-${run}`, 'collection_manager', D2);
    tadmin = await person(`p6r-tadmin-${run}`, 'tenant_admin');
    authority = await person(`p6r-authority-${run}`, 'retention_authority');

    // THE ORIGIN'S RECORDS: an upload contract, its agent (its principal is an identity operation — the admin's), two files uploaded
    // by the manager through the same intake path a polled response takes.
    sourceId1 = await activeUploadSource(D1, manager1, `e2e-uploads-${run}`);
    const ag = await api(`/v1/tenants/${tenantId}/domains/${D1}/observation/agents/register`,
      DOMAIN_ADMIN(D1, { action: 'observation.agent.register', object_type: 'AGT', purpose_id: 'observation' }),
      { sourceId: sourceId1, connector: 'upload', ownerPrincipalId: manager1.principalId }, admin.token);
    expect(ag.status).toBe(201);
    const up = await api(`/v1/tenants/${tenantId}/domains/${D1}/observation/upload`,
      IN(D1, manager1, { action: 'observation.run.trigger', object_type: 'RUN', purpose_id: 'observation' }),
      { sourceId: sourceId1, contractVersion: 1, files: [
        { filename: 'e2e-records-a.csv', mediaType: 'text/csv', base64: Buffer.from(CSV_A, 'utf8').toString('base64'), documentTime: '2024-01-14T00:00:00Z' },
        { filename: 'e2e-records-b.csv', mediaType: 'text/csv', base64: Buffer.from(CSV_B, 'utf8').toString('base64'), documentTime: '2024-01-14T00:00:00Z' },
      ] }, manager1.token);
    expect(up.status).toBe(201);
    const runOut = (up.body as { run: { state: string; admitted: number; reason?: string } }).run;
    expect(runOut.state, `the upload run: ${JSON.stringify(runOut)}`).toBe('finished');
    expect(runOut.admitted).toBe(2);
    const ev = await api(`/v1/tenants/${tenantId}/domains/${D1}/observation/evidence/list`,
      IN(D1, manager1, { action: 'observation.read.evidence', object_type: 'EVD', side_effect_class: 'none', purpose_id: 'observation' }),
      { sourceId: sourceId1, limit: 10 }, manager1.token);
    expect(ev.status).toBe(201);
    manifestIds = ((ev.body as { evidence: Array<{ payload: { manifest_id: string } }> }).evidence).map((e) => e.payload.manifest_id);
    expect(manifestIds, 'two admitted records, two manifests').toHaveLength(2);

    // THE MIRROR'S INTAKE CONTRACT: the contract the imported records are held under (no agent, no upload — the B17 idiom).
    intakeSourceId2 = await activeUploadSource(D2, manager2, `e2e-intake-${run}`);

    // THE SIGNING KEY, by the tenant administrator: a TENANT binding on a DOMAIN envelope of its own tenant (the B16 approve-in-D2
    // idiom); the reference is bound in the API's process, so the key answers `bound`, and its public key is the one this worker holds.
    const key = await api(`/v1/tenants/${tenantId}/domains/${D1}/retention/signing-keys/declare`,
      IN(D1, tadmin, { action: 'retention.signing_key.declare', object_type: 'RSK', purpose_id: 'retention', consequence_class: 'C2' }),
      { credentialRef: 'EYE_EXPORT_SIGNING_KEY_E2E', purpose: 'demonstration' }, tadmin.token);
    expect(key.status, `the key declared: ${JSON.stringify(key.body)}`).toBe(201);
    const k = (key.body as { key: { key_id: string; readiness: string; public_key_pem: string } }).key;
    expect(k.key_id).toMatch(/^ed25519:[0-9a-f]{16}$/);
    expect(k.readiness).toBe('bound');
    // The same key on both sides: the config generated it once, the API holds it, this worker derived its public half from it.
    expect(k.public_key_pem.trim()).toBe(PUBLIC_PEM.trim());
  });

  test.afterAll(() => {
    if (STATION !== '') rmSync(STATION, { recursive: true, force: true });
  });

  /**
   * Later tests need the action, the import and the package digest. Tests 1, 3 and 6 capture them from the page they
   * rendered, which is the point of those tests; this resolves them from the API when a single test is run in isolation,
   * so the suite is debuggable one test at a time rather than only as a whole.
   */
  test.beforeEach(async () => {
    if (actionId === '') {
      const r = await api(`/v1/tenants/${tenantId}/domains/${D1}/retention/actions/list`,
        IN(D1, steward1, { action: 'retention.read', object_type: 'RTA', side_effect_class: 'none', purpose_id: 'retention' }),
        { limit: 50 }, steward1.token);
      const found = ((r.body as { actions?: Array<{ action_id: string; kind: string }> }).actions ?? []).find((a) => a.kind === 'customer_export');
      if (found !== undefined) actionId = found.action_id;
    }
    if (importId === '') {
      const r = await api(`/v1/tenants/${tenantId}/domains/${D2}/retention/imports/list`,
        IN(D2, steward2, { action: 'retention.read', object_type: 'RIM', side_effect_class: 'none', purpose_id: 'retention' }),
        {}, steward2.token);
      const first = ((r.body as { imports?: Array<{ import_id: string; package_digest: string }> }).imports ?? [])[0];
      if (first !== undefined) {
        importId = first.import_id;
        if (packageDigest === '') packageDigest = first.package_digest;
      }
    }
    if (packageDigest === '' && actionId !== '') {
      // The export read answers 409 once the package is revoked (after test 9): expected, and the digest then comes from the import.
      const r = await api(`/v1/tenants/${tenantId}/domains/${D1}/retention/actions/${actionId}/export/get`,
        IN(D1, steward1, { action: 'retention.read', object_type: 'RTA', object_id: actionId, side_effect_class: 'none', purpose_id: 'retention' }),
        {}, steward1.token);
      const pd = (r.body as { package?: { package_digest?: string } }).package?.package_digest;
      if (r.status === 201 && typeof pd === 'string') packageDigest = pd;
    }
  });

  test('1. the steward opens a customer export on the two records and resolves its scope', async ({ page }) => {
    await uiLogin(page, steward1.username, PW);
    await openRetention(page);
    // The tenant's key is on the page: active, its reference bound where the server runs — never its value.
    const keyRow = page.getByRole('region', { name: 'export signing keys' }).getByRole('row').filter({ hasText: 'EYE_EXPORT_SIGNING_KEY_E2E' });
    await expect(keyRow).toContainText('active');
    await expect(keyRow).toContainText('bound');

    // Open an action: a customer export on the chosen object set (the two manifests), ceiling internal.
    await page.locator('#op-kind').selectOption('customer_export');
    await expect(page.locator('#op-target')).toHaveValue('evidence');
    await page.locator('#op-manifest-ids').fill(manifestIds.join('\n'));
    await expect(page.locator('#op-ceiling')).toHaveValue('internal');
    await page.getByRole('button', { name: 'Open action', exact: true }).click();
    const opened = section(page, 'open-h').locator('p').filter({ hasText: /opened action [0-9a-f-]{36} — customer_export on evidence, state/ });
    await expect(opened).toBeVisible();
    await expect(opened).toContainText(/state\s*opened/);
    await expect(receiptIn(page, 'open-h')).toBeVisible();
    const id = /opened action ([0-9a-f-]{36})/.exec((await opened.textContent()) ?? '')?.[1] ?? '';
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    actionId = id;
    await section(page, 'open-h').getByRole('button', { name: 'select it' }).click();
    await expect(page.getByRole('heading', { name: /^The action's record — customer_export on evidence/ })).toBeVisible();

    // Resolve the scope: the two records, both to execute, and the digest the approval will be given on.
    await page.getByRole('button', { name: 'Resolve scope' }).click();
    await expect(section(page, 'resolve-h')).toContainText(/the scope resolved to .* 2 item\(s\): 2 execute, 0 held, 0 blocking/);
    await expect(receiptIn(page, 'resolve-h')).toBeVisible();
    await expect(section(page, 'approve-h')).toContainText(/Digest submitted: [0-9a-f]{64}/);
  });

  test('2. the tenant administrator chooses the origin domain from the list and approves on the digest (the chooser, listed)', async ({ page }) => {
    await uiLogin(page, tadmin.username, PW);
    await page.goto('/graph/retention');
    // A TENANT-homed principal has no home domain: the shell asks which domain to work in, from the tenant's own list.
    await chooseListed(page, D1);
    await expectWorking(page, D1);
    await expect(page.getByRole('heading', { name: 'Retention', level: 1 })).toBeVisible();

    await selectAction(page);
    await expect(section(page, 'approve-h')).toContainText(/Digest submitted: [0-9a-f]{64}/);
    await page.locator('#ap-why').fill('the scope as resolved, read by the tenant administrator (e2e)');
    await page.getByRole('button', { name: 'Approve on this digest' }).click();
    await expect(section(page, 'approve-h')).toContainText(/approval [0-9a-f-]{36} recorded; the action is now\s*approved/);
    await expect(receiptIn(page, 'approve-h')).toBeVisible();

    // The choice survives a reload within the tab: no chooser, the same working domain.
    await page.reload();
    await expectWorking(page, D1);
    await expect(page.getByRole('heading', { name: 'Working domain' })).toHaveCount(0);

    // The change control unmounts the page and asks again; the mirror is empty — the choice really re-scoped every call.
    await page.getByRole('button', { name: 'Change the working domain' }).click();
    await chooseListed(page, D2);
    await expectWorking(page, D2);
    await expect(section(page, 'acts-h')).toContainText('No retention action has been opened in this domain.');
  });

  test('3. the steward executes and verifies; the record shows the signed package', async ({ page }) => {
    await uiLogin(page, steward1.username, PW);
    await openRetention(page);
    await selectAction(page);

    await page.getByRole('button', { name: 'Execute the approved scope' }).click();
    await expect(section(page, 'exec-h')).toContainText(/executed 2, held 0, refused 0/);
    await expect(receiptIn(page, 'exec-h')).toBeVisible();

    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    // The verdict paragraph — its <strong> and its <Mono> each read "verified" on their own, so the paragraph is what is asserted.
    const verdict = section(page, 'verify-h').locator('p').filter({ hasText: /^verified · the action is now/ });
    await expect(verdict).toContainText(/verified · the action is now\s*verified/);
    await expect(receiptIn(page, 'verify-h')).toBeVisible();

    // The export block, from the server's read of the package: a key-based signature by the tenant's active key, its public key shown.
    const record = section(page, 'rec-h');
    await expect(record).toContainText(/scheme eye-customer-export\/2/);
    await expect(record).toContainText(/key ed25519:[0-9a-f]{16}/);
    await expect(record).toContainText(/the key is\s*active/);
    const pem = page.getByRole('region', { name: "the signing key's public key" });
    await expect(pem).toBeVisible();
    await expect(pem.locator('pre')).toContainText('-----BEGIN PUBLIC KEY-----');
    const digests = record.getByRole('definition').filter({ hasText: /^package [0-9a-f]{64} · manifest\.json/ });
    await expect(digests).toBeVisible();
    const pd = /^package ([0-9a-f]{64})/.exec(((await digests.textContent()) ?? '').trim())?.[1] ?? '';
    expect(pd).toMatch(/^[0-9a-f]{64}$/);
    packageDigest = pd;
  });

  test("4. the origin's administrator declares a transfer station and delivers the package", async ({ page }) => {
    await uiLogin(page, admin1.username, PW);
    await openRetention(page);

    await page.locator('#ds-key').fill('e2e-station-d1');
    await expect(page.locator('#ds-kind')).toHaveValue('transfer_station');
    await page.locator('#ds-endpoint').fill(STATION);
    await page.locator('#ds-recipient').fill('the mirror domain (e2e)');
    await page.locator('#ds-purpose').fill('the disconnected exchange (e2e)');
    await page.getByRole('button', { name: 'Declare destination', exact: true }).click();
    await expect(section(page, 'xd-h')).toContainText(/declared destination e2e-station-d1 .* transfer_station at .* readiness\s*active/);
    await expect(receiptIn(page, 'xd-h')).toBeVisible();

    await selectAction(page);
    await page.locator('#dv-dest').selectOption('e2e-station-d1');
    await page.getByRole('button', { name: 'Deliver to the destination' }).click();
    await expect(section(page, 'dv-h')).toContainText(/delivery [0-9a-f-]{36} attempt 1 is\s*delivered/);
    await expect(receiptIn(page, 'dv-h')).toBeVisible();
    const row = page.getByRole('region', { name: 'export deliveries' }).getByRole('row').filter({ hasText: 'e2e-station-d1 (transfer_station)' });
    await expect(row).toContainText('delivered');
    // The disconnected path is real: the package is at the station, under <tenant>/<origin domain>/<action>.
    expect(existsSync(join(STATION, tenantId, D1, actionId, 'package.tar'))).toBe(true);
  });

  test("5. the mirror's administrator declares the partner on the tenant's public key, and a station of its own at the same directory", async ({ page }) => {
    await uiLogin(page, admin2.username, PW);
    await openRetention(page);

    await page.locator('#xp-key').fill('e2e-origin');
    await page.locator('#xp-party').fill('the origin domain of this tenant (e2e)');
    await page.locator('#xp-purpose').fill("the exchange of the origin's records into the mirror (e2e)");
    await page.locator('#xp-source').fill(intakeSourceId2);
    await page.locator('#xp-version').fill('1');
    await page.locator('#xp-pem').fill(PUBLIC_PEM);
    await page.getByRole('button', { name: 'Declare partner', exact: true }).click();
    await expect(section(page, 'xp-h')).toContainText(/declared partner e2e-origin .* key ed25519:[0-9a-f]{16}/);
    await expect(page.getByRole('region', { name: "the partner's public key as recorded" })).toBeVisible();
    await expect(receiptIn(page, 'xp-h')).toBeVisible();

    await page.locator('#ds-key').fill('e2e-station-d2');
    await page.locator('#ds-endpoint').fill(STATION);
    await page.locator('#ds-recipient').fill('the mirror reads the station (e2e)');
    await page.locator('#ds-purpose').fill('the disconnected import path (e2e)');
    await page.getByRole('button', { name: 'Declare destination', exact: true }).click();
    await expect(section(page, 'xd-h')).toContainText(/declared destination e2e-station-d2/);
    await expect(receiptIn(page, 'xd-h')).toBeVisible();
  });

  test("6. the mirror's steward opens the import from the station: verified, with the checks table", async ({ page }) => {
    await uiLogin(page, steward2.username, PW);
    await openRetention(page);

    await page.locator('#im-kind').selectOption('station');
    await page.locator('#im-station').selectOption('e2e-station-d2');
    await page.locator('#im-o-tenant').fill(tenantId);
    await page.locator('#im-o-domain').fill(D1);
    await page.locator('#im-o-action').fill(actionId);
    await page.getByRole('button', { name: 'Open import', exact: true }).click();
    const opened = section(page, 'im-h').locator('p').filter({ hasText: /^import [0-9a-f-]{36} — verified · 0 check\(s\) failed/ });
    await expect(opened).toBeVisible();
    await expect(receiptIn(page, 'im-h')).toBeVisible();
    const id = /^import ([0-9a-f-]{36})/.exec(((await opened.textContent()) ?? '').trim())?.[1] ?? '';
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    importId = id;
    await section(page, 'im-h').getByRole('button', { name: 'select it' }).click();
    await expect(page.getByRole('heading', { name: `The import's record — ${importId.slice(0, 8)}…` })).toBeVisible();

    // The record: verified at the open, every check passed or a note (a fact the product cannot establish here, said as such).
    const imports = section(page, 'im-h');
    await expect(imports).toContainText(/state\s*verified · verified at the open/);
    const checks = page.getByRole('region', { name: 'import checks' });
    await expect(checks).toBeVisible();
    expect(await checks.locator('tbody tr').count()).toBeGreaterThan(0);
    expect(await checks.getByText('FAILED', { exact: true }).count()).toBe(0);
    await expect(checks.getByText('passed', { exact: true }).first()).toBeVisible();
    const items = page.getByRole('region', { name: 'import items' });
    expect(await items.locator('tbody tr').filter({ has: page.getByRole('cell', { name: 'record', exact: true }) }).count()).toBeGreaterThanOrEqual(2);
    await expect(imports).toContainText('e2e-origin');
    await expect(imports).toContainText(`package ${packageDigest}`);
  });

  test('7. the retention authority pastes the mirror as its working domain and approves the import on its digest (the chooser, pasted)', async ({ page }) => {
    await uiLogin(page, authority.username, PW);
    await page.goto('/graph/retention');
    // A retention authority holds no listing right: the id is pasted, and the control stays closed until it is a domain id.
    await expect(page.getByLabel(/Domain id \(a domain of this tenant/)).toBeVisible();
    await expect(page.locator('select#wd-domain')).toHaveCount(0);
    await page.locator('#wd-domain').fill('not-a-uuid');
    await expect(page.getByRole('button', { name: 'Open this domain' })).toBeDisabled();
    await choosePasted(page, D2);
    await expectWorking(page, D2);
    await expect(page.getByRole('heading', { name: 'Retention', level: 1 })).toBeVisible();

    await selectImport(page);
    await page.locator('#im-rationale').fill('the package as verified, read by the retention authority (e2e)');
    await page.getByRole('button', { name: 'Approve the import' }).click();
    await expect(section(page, 'im-h')).toContainText(/import [0-9a-f]{8}… is now\s*approved/);
    await expect(receiptIn(page, 'im-h')).toBeVisible();
  });

  test("8. the mirror's steward admits the import; the origin's record lists the importer", async ({ page }) => {
    await uiLogin(page, steward2.username, PW);
    await openRetention(page);
    await selectImport(page);
    await page.getByRole('button', { name: 'Admit the import' }).click();
    const imports = section(page, 'im-h');
    await expect(imports).toContainText(/is now\s*admitted/);
    await expect(imports).toContainText(/batch\(es\):/);
    await expect(receiptIn(page, 'im-h')).toBeVisible();
    await expect(imports).toContainText('none — the copies stand');

    // The origin's record now names the importer — the recipient the revocation will reach on the origin's own ledger.
    await uiLogin(page, steward1.username, PW);
    await openRetention(page);
    await selectAction(page);
    await expect(page.getByRole('heading', { name: 'Importers (1)' })).toBeVisible();
    const row = page.getByRole('region', { name: 'importers of the package' }).getByRole('row').filter({ hasText: importId.slice(0, 8) });
    await expect(row).toContainText(D2.slice(0, 8));
    await expect(row).toContainText('admitted');
    await expect(row).toContainText('e2e-origin');
  });

  test("9. the origin's administrator revokes the package: the importing domain is notified and its revocation is pending for its own steward", async ({ page }) => {
    await uiLogin(page, admin1.username, PW);
    await openRetention(page);
    await selectAction(page);
    await page.locator('#rv-reason').fill('the package is withdrawn from exchange (e2e)');
    await page.getByRole('button', { name: 'Revoke the package' }).click();
    const revoke = section(page, 'rv-h');
    await expect(revoke).toContainText(/package [0-9a-f]{64} revoked at .*; bytes removed: yes/);
    // The origin's administrator holds nothing in the mirror: the notice is recorded, the destruction is the mirror's steward's.
    await expect(revoke).toContainText(/importing domains: import [0-9a-f]{8}… in domain [0-9a-f]{8}…: notice notified \(attempt 1\) → revocation pending — the acting principal holds no authority in the importing domain; its steward completes the revocation by the route/);
    await expect(receiptIn(page, 'rv-h')).toBeVisible();
    const notice = page.getByRole('region', { name: 'revocation notices' }).getByRole('row').filter({ hasText: '(importer)' });
    await expect(notice).toContainText('notified');
    // The export read answers 409 once the package is revoked; the page keeps the server's words.
    await expect(section(page, 'rec-h')).toContainText(/not read — HTTP 409 EYE-STA-002/);
    // The station was told by revocation.json beside the package, and the product's own copies there are gone.
    expect(existsSync(join(STATION, tenantId, D1, actionId, 'revocation.json'))).toBe(true);
    expect(existsSync(join(STATION, tenantId, D1, actionId, 'package.tar'))).toBe(false);
  });

  test("10. the mirror's steward executes the revocation from the origin's record: the copies destroyed, the bytes removed, the origin answered (the B18 bytes line)", async ({ page }) => {
    await uiLogin(page, steward2.username, PW);
    await openRetention(page);
    await selectImport(page);
    await expect(page.getByRole('region', { name: 'import events' })).toContainText('import.revocation_notified');
    await expect(page.locator('#im-rv-kind')).toHaveValue('origin');
    await page.getByRole('button', { name: 'Revoke the import' }).click();
    const imports = section(page, 'im-h');
    await expect(imports).toContainText(/is now\s*revoked · the attempt answered\s*revoked\s*\(attempt 1; source origin\)/);
    await expect(imports).toContainText(/· left 0 · refused 0/);
    // B18 (Codex B17-F1): the bytes as the cleanup found and VERIFIED them — two records, two locators, nothing residual, nothing remaining.
    await expect(imports.locator('p').filter({ hasText: /^bytes: removed/ })).toHaveText(/^bytes: removed 2 · failed 0$/);
    await expect(imports).toContainText(/receipt: copies destroyed\s*yes · the origin answered:\s*acknowledged\s*\(notice attempt 1\)/);
    await expect(imports).toContainText(/\d+ write\(s\):/);
    await expect(receiptIn(page, 'im-h')).toBeVisible();
    const events = page.getByRole('region', { name: 'import events' });
    await expect(events).toContainText('import.revoked');
    await expect(events).toContainText('import.copies_destroyed');
  });

  test("11. a second revoke answers retried with nothing to remove; the origin's notice is acknowledged", async ({ page }) => {
    await uiLogin(page, steward2.username, PW);
    await openRetention(page);
    await selectImport(page);
    const imports = section(page, 'im-h');
    await expect(imports).toContainText(/state\s*revoked · 1 attempt\(s\)/);
    await page.getByRole('button', { name: 'Revoke the import' }).click();
    await expect(imports).toContainText(/the attempt answered\s*retried/);
    await expect(imports.locator('p').filter({ hasText: /^bytes: removed/ })).toHaveText(/^bytes: removed 0 · failed 0$/);
    await expect(receiptIn(page, 'im-h')).toBeVisible();
    await expect(imports).toContainText(/is now\s*revoked/);

    // The receipt answered the origin's ledger: the importer notice is acknowledged there.
    await uiLogin(page, steward1.username, PW);
    await openRetention(page);
    await selectAction(page);
    const notice = page.getByRole('region', { name: 'revocation notices' }).getByRole('row').filter({ hasText: '(importer)' });
    await expect(notice).toContainText('acknowledged');
  });

  test("12. refusals in the page's own words", async ({ page }) => {
    await uiLogin(page, steward1.username, PW);
    await openRetention(page);
    await selectAction(page);
    // A steward is not the retention authority: the policy refuses, and the page shows the server's reason with its code.
    await page.locator('#ap-why').fill('a steward may not approve (e2e)');
    await page.getByRole('button', { name: 'Approve on this digest' }).click();
    await expect(status(page, /not approved — HTTP 403 EYE-AUT-001 — no qualifying role binding for action in resolved scope/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve on this digest' })).toBeVisible();
    // A reason under eight characters keeps the withdrawal closed before any request.
    await page.locator('#wd-reason').fill('too few');
    await expect(page.getByRole('button', { name: 'Withdraw', exact: true })).toBeDisabled();
    // A refusal is a status line, never an alert — the page's convention (the shell's route announcer outside <main> is Next.js's own alert region).
    expect(await page.locator('main').getByRole('alert').count()).toBe(0);
  });

  test("13. fail closed: a platform principal still has no domain to open; a tenant principal without a choice sees the chooser, and the choice is the principal's", async ({ page }) => {
    await uiLogin(page, 'platform-admin', ADMIN_PW);
    await page.goto('/graph/retention');
    const alert = page.locator('main').getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText(/This workspace operates inside one Intelligence Domain\. The signed-in principal is bound at PLATFORM scope and has no home domain, so there is no domain to open\./);
    await expect(page.getByRole('heading', { name: 'Working domain' })).toHaveCount(0);

    // The same tab, another principal: no choice is stored for it — the chooser; the choice it makes is its own.
    await uiLogin(page, authority.username, PW);
    await page.goto('/graph/retention');
    await choosePasted(page, D2);
    await expectWorking(page, D2);

    // The same tab again, a third principal: the stored choice is another principal's and is ignored — the chooser, in the LIST mode this time.
    await uiLogin(page, tadmin.username, PW);
    await page.goto('/graph/retention');
    await expect(page.getByRole('heading', { name: 'Working domain' })).toBeVisible();
    await expect(page.locator('select#wd-domain')).toBeVisible();
  });
});
