/**
 * CP-6 B27 §S browser walk (F-P4-08; ADR-012 "a missing stress branch is flagged before the recommendation is allowed"; CAP-DS-02) — THE
 * SCENARIO SET, ITS PLURALITY VERDICT, THE COMPARISON AND THE GATE ON THE PROPOSAL through the real interface on the gate's fresh database
 * (the hosted form of e2e/phase6-b27-sets.demo.spec.ts, which reads the demonstration and is not run by this gate):
 *
 *   SEEDED THROUGH THE ROUTES: a SYNTHETIC transits series and two indicators; the scenario "Bab el-Mandeb corridor" (a Baseline, a
 *   Disruption and the user-defined "Regional blockade" labelled "regional blockade") and the scenario "Corridor stress test" (a Baseline
 *   and the STRESS branch "Corridor stress"), both the strategy owner's; the strategy owner's SET with the plurality policy {require:
 *   baseline + stress, at least 3 live branches, at least 1 adverse}, the corridor scenario's three branches added as BRANCH members, the set
 *   ACTIVATED (its check fails: stress missing; the owner tasked); THE PACKAGE — the decision owner's draft on a decision (an objective and
 *   a decision declared through the graph's strategy route; two unsimulated options, the terms, the choice binding a twin reached by the
 *   product's own path: an upload contract, a record, a replayed extraction, the resolver, the twin — the B36 gates walk's seeding) →
 *   1. /prediction/scenarios → "Scenario sets" → the set: ACTIVE, the policy in words, the verdict NOT PLURAL naming the missing STRESS
 *      kind, the activation's check recorded (the owner tasked); the comparison lays the Baseline, the Disruption and the "regional
 *      blockade" side by side (kind, state, divergence, the indicator's freshness in words — never a percentage);
 *   2. the decision owner BINDS the set to the package from the page → the binding listed (draft); the package's PROPOSAL (the route) is
 *      REFUSED 409 `recommendation rejected (plurality)` naming the missing stress branch; the package stays a draft on the page;
 *   3. the strategy owner ADDS the stress scenario's "Corridor stress" branch from the page → the verdict PLURAL; the decision owner's
 *      proposal now goes through; the binding reads proposed;
 *   4. an analyst reads the verdict and the four branches side by side, and is offered no set control.
 *
 * HONEST LIMITS (what this gate does not reach): the PROPOSAL is a route act — the decisions page carries no propose control — so the
 * refusal is asserted on the route's answer (status and words) and the page shows its consequence (the package still a draft, then
 * proposed); no observation is ingested (every indicator reads MISSING in the comparator); the owner's scenario.set_gap attention item is
 * read only through the recorded check's "the owner was tasked" line; the portfolio review's robustness and regret, the relevance tick
 * (scenario-relevance, order 67), a suspended branch shown NOT COUNTED, and the proposals from a forecast shift or a weak signal are the
 * harness's (apps/api/test/int/phase6-sets-b27.test.ts c–f). Nothing rendered here claims otherwise.
 *
 * The seeding is the API's, in the Phase 1 idiom (the B36 walks'): this suite makes its own tenant, ONE domain and DOMAIN principals with a
 * per-run password — the strategy owner (the scenarios and the set), the forecast owner (the series), the decision owner (the package), an
 * approver (named by the terms), an analyst (the reader; also the extraction method's registrant), and the five who walk the product's path
 * to the twin a choice binds. Every figure is SYNTHETIC. The selectors are the page's own (apps/web/app/prediction/scenarios/sets/page.tsx):
 * the combobox "Scenario set", the labels "set state", "policy line", "plurality verdict", "missing kinds", the list "bindings", the table
 * "comparison" (its rows "branch <name>"), #bind-pkg with "Bind", #add-scn / #add-brn with "Add the member".
 */
import { createHash } from 'node:crypto';
import { expect as baseExpect, test, type Locator, type Page } from '@playwright/test';

// expect.configure returns a NEW instance: rebind it (the B29 rule).
const expect = baseExpect.configure({ timeout: 15_000 });
const API = 'http://localhost:3401';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be provided (generated .eye-local/env or caller environment)`);
  return v;
}
const BOOTSTRAP_PW = required('EYE_TEST_BOOTSTRAP_PASSWORD');
const ADMIN_PW = required('EYE_TEST_ADMIN_PASSWORD');
/** One per-run password for the principals this suite creates; it lives in the worker's memory only. */
const PW = `St27!${crypto.randomUUID()}`;
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
    object_type: 'SCS', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-b27s',
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
let admin: Ctx; let strategist: Ctx; let forecaster: Ctx; let decider: Ctx; let approver: Ctx;
let collector: Ctx; let xmanager: Ctx; let reader: Ctx; let resolver: Ctx; let twinOwner: Ctx;
let T = ''; let D = ''; let OBJ = ''; let DEC = ''; let ENTITY = ''; let TWIN = ''; let SET = ''; let PKG = ''; let PKG_V = 0;
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const CSV = 'strait,transits\nBab el-Mandeb Strait,41\n';
const MENTION = 'Bab el-Mandeb Strait';
const SET_TITLE = `Regensburg supply — corridor set (e2e ${run}, SYNTHETIC)`;
const SCN_A = `Bab el-Mandeb corridor (e2e ${run}, SYNTHETIC)`;
const SCN_C = `Corridor stress test (e2e ${run}, SYNTHETIC)`;
const PKG_TITLE = `Dual-source the Regensburg bearings (e2e ${run})`;

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
const ok = (r: { status: number; body: Record<string, unknown> }, what: string, status = 201) => { expect(r.status, `${what}: ${JSON.stringify(r.body).slice(0, 400)}`).toBe(status); return r.body; };
/** The platform administrator acting in the domain (copied from the memory walk). */
const DOMAIN_ADMIN = (over: Record<string, unknown>) => ({ scope: 'DOMAIN', tenant_id: T, domain_id: D, principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration', ...over });
const SETS = '/prediction/scenarios/sets';

/**
 * Copied from the memory walk (which copied the retention walk, which copied the B16 harness's uploadContract — the browser gate cannot
 * import a test helper of apps/api): an upload connector under replay, synthetic data, rights CONFIRMED, ceiling INTERNAL, CSV.
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
 * THE ENTITY AND THE TWIN a choice binds (0049: an outcome is observed on a twin the choice names; 0032: a twin's boundary names a
 * resolved graph entity) — the product's own path, every step a governed request: the upload contract registered by the administrator,
 * approved and activated by the collection manager; one CSV record uploaded; the extraction method (replay) registered by the reader,
 * approved and activated by the extraction manager; the ENTITY claim recorded and extracted from the record; the resolver run by the
 * domain administrator — the unmatched mention creates the entity, proposed; the resolution accepted by the resolution manager (never the
 * proposer); the twin declared on that entity by its owner.
 */
async function seedTwin(): Promise<void> {
  const X = `/v1/tenants/${T}/domains/${D}`;
  const IN = (who: Ctx, over: Record<string, unknown>) => ({ scope: 'DOMAIN', tenant_id: T, domain_id: D, principal_id: `principal:${who.principalId}`, ...over });
  const sourceKey = `e2e-b27-sets-uploads-${run}`;
  const reg = ok(await api(`${X}/observation/sources/register`, DOMAIN_ADMIN({ action: 'observation.source.register', object_type: 'SRC', purpose_id: 'observation' }), { contract: uploadContract(sourceKey) }, admin.token), 'the upload contract registered');
  const sourceId = (reg as { source: { sourceId: string } }).source.sourceId;
  ok(await api(`${X}/observation/sources/${sourceId}/approve`, IN(collector, { action: 'observation.source.approve', object_type: 'SRC', object_id: sourceId, purpose_id: 'observation' }),
    { contractVersion: 1, decision: 'approve', reason: 'the e2e upload contract reviewed' }, collector.token), 'the upload contract approved');
  ok(await api(`${X}/observation/sources/${sourceId}/transition`, IN(collector, { action: 'observation.source.transition', object_type: 'SRC', object_id: sourceId, purpose_id: 'observation' }),
    { contractVersion: 1, target: 'active', reason: 'the e2e upload contract: active' }, collector.token), 'the upload contract active');
  ok(await api(`${X}/observation/agents/register`, DOMAIN_ADMIN({ action: 'observation.agent.register', object_type: 'AGT', purpose_id: 'observation' }), { sourceId, connector: 'upload', ownerPrincipalId: collector.principalId }, admin.token), 'the upload agent registered');
  const up = ok(await api(`${X}/observation/upload`, IN(collector, { action: 'observation.run.trigger', object_type: 'RUN', purpose_id: 'observation' }),
    { sourceId, contractVersion: 1, files: [{ filename: 'e2e-b27-sets.csv', mediaType: 'text/csv', base64: Buffer.from(CSV, 'utf8').toString('base64'), documentTime: '2024-01-14T00:00:00Z' }] }, collector.token), 'the record uploaded');
  expect((up as { run: { state: string; admitted: number } }).run, 'the upload run').toMatchObject({ state: 'finished', admitted: 1 });
  const ev = ok(await api(`${X}/observation/evidence/list`, IN(collector, { action: 'observation.read.evidence', object_type: 'EVD', side_effect_class: 'none', purpose_id: 'observation' }), { sourceId, limit: 5 }, collector.token), 'the evidence listed');
  const evd = (ev as { evidence: Array<{ object_id: string; payload: { locator: string; content_digest: string } }> }).evidence[0];
  expect(evd, 'one admitted record').toBeDefined();
  // THE METHOD (replay) and the recorded ENTITY claim: the strait named in the record, a place
  const methodKey = `e2e-b27-sets-entities-${run}`;
  const weightsDigest = sha256('e2e-weights');
  const decoding = { temperature: 0, top_p: 1, seed: 1, num_predict: 128 };
  const mreg = ok(await api(`${X}/intelligence/methods/register`, IN(reader, { action: 'intelligence.method.register', object_type: 'MTH', purpose_id: 'intelligence' }),
    { methodKey, name: 'E2E B27 entity mentions', sourceId, targetTypes: ['ENT'], gatewayMode: 'replay', modelId: 'e2e-fixture-model', modelWeightsDigest: weightsDigest, runtimeVersion: 'fixture/1',
      promptRef: 'extract/e2e-b27-entities', promptVersion: 'v1', promptText: 'Return the entity mentions of the e2e record as JSON claims.', decoding, confidenceFloor: 0.35, reviewBelow: 0.75, budgetCalls: 5, budgetSeconds: 60 }, reader.token), 'the method registered');
  const method = (mreg as { method: { methodId: string; promptDigest: string; decodingDigest: string } }).method;
  ok(await api(`${X}/intelligence/methods/${method.methodId}/approve`, IN(xmanager, { action: 'intelligence.method.approve', object_type: 'MTH', object_id: method.methodId, purpose_id: 'intelligence' }), { reason: 'the e2e method reviewed for the B27 sets walk' }, xmanager.token), 'the method approved');
  ok(await api(`${X}/intelligence/methods/${method.methodId}/transition`, IN(xmanager, { action: 'intelligence.method.activate', object_type: 'MTH', object_id: method.methodId, purpose_id: 'intelligence' }), { target: 'active', reason: 'the e2e method: active for the B27 sets walk' }, xmanager.token), 'the method activated');
  const requestDigest = digest({
    prompt_ref: 'extract/e2e-b27-entities', prompt_version: 'v1', prompt_digest: method.promptDigest,
    model_id: 'e2e-fixture-model', weights_digest: weightsDigest, runtime_version: 'fixture/1', decoding_digest: method.decodingDigest,
    input: { instruction: 'extract/e2e-b27-entities', target_types: ['ENT'], source_key: methodKey, item_key: evd!.payload.locator, evidence_digest: evd!.payload.content_digest, evidence: CSV },
  });
  const start = CSV.indexOf(MENTION);
  ok(await api(`${X}/intelligence/gateway/record`, IN(xmanager, { action: 'intelligence.gateway.call', object_type: 'GWC', purpose_id: 'intelligence' }),
    { recordings: [{ requestDigest, response: { claims: [{ claim_kind: 'entity', subject: MENTION, predicate: 'is_a', object_value: 'strait', confidence: 0.9, byte_start: start, byte_end: start + MENTION.length, qualifiers: { entity_type: 'place' } }] },
      modelId: 'e2e-fixture-model', runtimeVersion: 'fixture/1' }] }, xmanager.token), 'the response recorded');
  const ex = ok(await api(`${X}/intelligence/extract`, IN(xmanager, { action: 'intelligence.claim.admit', object_type: 'CLM', purpose_id: 'intelligence' }), { methodId: method.methodId, limit: 5 }, xmanager.token), 'the extraction');
  expect((ex as { extraction: { state: string; claimsAdmitted: number } }).extraction, 'the entity claim admitted from the recording').toMatchObject({ state: 'completed', claimsAdmitted: 1 });
  // THE RESOLVER (the domain administrator proposes): the unmatched mention creates the entity; THE DECISION (the resolution manager accepts)
  const rs = ok(await api(`${X}/graph/entities/resolve`, IN(admin, { action: 'graph.resolution.propose', object_type: 'RES', purpose_id: 'graph' }), { limit: 50, methodId: null }, admin.token), 'the resolver run');
  expect((rs as { resolution: { entitiesCreated: number } }).resolution.entitiesCreated, 'the mention created an entity').toBe(1);
  const queue = ok(await api(`${X}/graph/resolutions/queue`, IN(resolver, { action: 'graph.read', object_type: 'RES', side_effect_class: 'none', consequence_class: 'C1', purpose_id: 'graph' }), { limit: 50 }, resolver.token), 'the resolution queue read');
  const pending = ((queue as { queue: Array<Record<string, unknown>> }).queue ?? []).find((r) => r['mention_text'] === MENTION);
  expect(pending, `the proposed resolution of "${MENTION}": ${JSON.stringify(queue).slice(0, 300)}`).toBeDefined();
  ENTITY = String(pending!['entity_id']);
  ok(await api(`${X}/graph/resolutions/${String(pending!['resolution_id'])}/decide`, IN(resolver, { action: 'graph.resolution.decide', object_type: 'RES', object_id: String(pending!['resolution_id']), purpose_id: 'graph' }),
    { decision: 'accept', reason: 'the strait named in the uploaded record is the entity proposed (e2e)' }, resolver.token), 'the resolution accepted');
  // THE TWIN on that entity (the outcome of every choice below is observed on it; no version is opened: this gate runs no simulation)
  const tw = ok(await api(`${X}/twins/declare`, IN(twinOwner, { action: 'twin.declare', object_type: 'TWN', purpose_id: 'twin' }),
    { kind: 'supply-chain', title: `NORDWERK — Ningbo → Regensburg chain (e2e ${run})`, statement: 'the magnet chain (e2e, SYNTHETIC)', boundary: [ENTITY], owner: twinOwner.principalId,
      behaviourModelRef: 'supply-flow@1', validation: { status: 'unvalidated (synthetic grounding)', limitations: ['calendar days'] } }, twinOwner.token), 'the twin declared');
  TWIN = (tw as { twin: { twinId: string } }).twin.twinId;
}

/** THE PACKAGE: the decision owner's draft on the decision — two UNSIMULATED options (the gate runs no simulation), the terms, the choice (the B36 gates walk's). Not proposed here. */
async function draftPackage(): Promise<void> {
  const d = ok(await as(decider, '/decisions/declare', 'decision.package.declare', 'DPK', null,
    { decisionObjectId: DEC, title: PKG_TITLE, statement: 'whether to dual-source the bearings now (e2e, SYNTHETIC)', owner: decider.principalId }, 'decision'), 'the package declared');
  PKG = (d as { package: { packageId: string } }).package.packageId;
  const o = ok(await as(decider, `/decisions/${PKG}/versions/open`, 'decision.package.version', 'DPK', PKG, { knownAt: new Date().toISOString(), observedThrough: '2024-01-17' }, 'decision'), 'the version opened');
  PKG_V = (o as { version: { version: number } }).version.version;
  ok(await as(decider, `/decisions/${PKG}/versions/${PKG_V}/options`, 'decision.package.option', 'DPK', PKG,
    { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [], unsimulatedReason: 'the browser gate seeds no twin version and no run: doing nothing is not simulated here (e2e)', risks: [], opportunities: [] }, 'decision'), 'the status quo option');
  ok(await as(decider, `/decisions/${PKG}/versions/${PKG_V}/options`, 'decision.package.option', 'DPK', PKG,
    { key: 'dual-source', title: 'Dual-source the bearings', kind: 'intervention', consequences: [], unsimulatedReason: 'the browser gate seeds no twin version and no run: the second source is not simulated here (e2e)', risks: ['+9% unit cost'], opportunities: [] }, 'decision'), 'the intervention option');
  ok(await as(decider, `/decisions/${PKG}/versions/${PKG_V}/terms`, 'decision.package.terms', 'DPK', PKG,
    { objectives: [OBJ], constraints: ['no air freight above 60 t/week'], approverPolicy: { quorum: 1, principals: [approver.principalId], expires_after_days: 14 },
      monitoringConditions: [{ kind: 'review', every_days: 7, owner: decider.principalId }], reversibility: 'reversible within one quarter', informationValue: 'a week of observation would not change the ranking' }, 'decision'), 'the terms');
  ok(await as(decider, `/decisions/${PKG}/versions/${PKG_V}/choice`, 'decision.package.choice', 'DPK', PKG,
    { option_key: 'dual-source', rationale: 'A second bearing source removes the single point of failure the corridor exposes (e2e).', decision_deadline: '2030-01-19',
      accepted_trade_offs: ['+9% unit cost'], action_owner: decider.principalId,
      outcome_criteria: [{ key: 'line_stop_days', quantity: 'line stop days over the horizon', unit: 'days', target: 0, comparator: '<=', by: '2030-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: TWIN, period: { from: '2030-01-11', to: '2030-04-10' } }] }, 'decision'), 'the choice');
}
const propose = () => as(decider, `/decisions/${PKG}/versions/${PKG_V}/propose`, 'decision.package.propose', 'DPK', PKG, {}, 'decision');

/* ───────────────────────── the page's own selectors ───────────────────────── */
/** From the scenario page's link (a reader of the scenarios), or straight to the sets page — a decision owner holds no prediction.read, so the
 *  scenario page refuses its list ("no qualifying role binding"); the sets page is the set.read's, which the decision owner holds. */
async function openSet(page: Page, viaScenarioPage = false): Promise<void> {
  if (viaScenarioPage) {
    await page.goto('/prediction/scenarios');
    await expect(page.getByRole('heading', { name: 'Scenarios', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /^Scenario sets/ }).click();
  } else {
    await page.goto('/prediction/scenarios/sets');
  }
  await expect(page.getByRole('heading', { name: 'Scenario sets', level: 1 })).toBeVisible();
  // a wrapping <label> includes its option text: select by role; selectOption takes the option's exact label, read from the option itself
  const chooser = page.getByRole('combobox', { name: 'Scenario set', exact: true });
  const label = await chooser.locator('option').filter({ hasText: SET_TITLE }).first().textContent();
  await chooser.selectOption({ label: label ?? '' });
  await expect(page.getByRole('heading', { name: SET_TITLE, level: 2 })).toBeVisible();
}
const table = (page: Page): Locator => page.getByRole('table', { name: 'comparison' });
const cmpRow = (page: Page, name: string): Locator => table(page).getByRole('row', { name: `branch ${name}`, exact: true });

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B27 §S — scenario sets: the plurality verdict naming the missing stress kind, the side-by-side comparison, the proposal refused until a stress branch joins', () => {
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
      { name: `E2E B27 Sets ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`, { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `B27 Sets ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;
    strategist = await person(`s27-strategy-${run}`, 'strategy_owner');
    forecaster = await person(`s27-forecast-${run}`, 'forecast_owner');
    decider = await person(`s27-decider-${run}`, 'decision_owner');
    approver = await person(`s27-approver-${run}`, 'decision_approver');
    reader = await person(`s27-analyst-${run}`, 'domain_analyst');
    collector = await person(`s27-collector-${run}`, 'collection_manager');
    xmanager = await person(`s27-xmanager-${run}`, 'extraction_manager');
    resolver = await person(`s27-resolver-${run}`, 'resolution_manager');
    twinOwner = await person(`s27-twin-owner-${run}`, 'twin_owner');
    await seedTwin();
    // THE STRATEGY OBJECTS the package rests on — on a SYNTHETIC entity reference
    const declare = async (objectType: string, title: string, restsOn: unknown[]) => {
      const r = ok(await as(strategist, '/graph/strategy/declare', 'graph.strategy.declare', objectType, null,
        { objectType, title, statement: `${title} (e2e, SYNTHETIC)`, restsOn }, 'graph'), `${objectType} declared`);
      return (r as { strategy: { objectId: string } }).strategy.objectId;
    };
    OBJ = await declare('OBJ', `Keep the Regensburg line running through Q1 (e2e ${run})`, [{ kind: 'entity', id: crypto.randomUUID(), rationale: 'SYNTHETIC entity reference (the browser gate seeds no graph)' }]);
    DEC = await declare('DEC', `Sourcing of the Regensburg bearings (e2e ${run})`, [{ kind: 'strategy', id: OBJ, rationale: 'the decision serves the objective' }]);
    await draftPackage();
    // THE SIGNPOSTS: a SYNTHETIC series (no observation is ingested) and two indicators on it
    const seriesKey = `e2e-b27s-transits-${run}`;
    ok(await as(forecaster, '/prediction/series/register', 'prediction.series.register', 'SER', null,
      { seriesKey, sourceKey: `e2e-b27s-source-${run}`, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 1,
        description: 'synthetic daily transits of the corridor (e2e, SYNTHETIC)' }), 'the series registered');
    const indicator = async (description: string, threshold: number) => ((ok(await as(strategist, '/prediction/indicators/define', 'prediction.indicator.define', 'IND', null,
      { seriesKey, description, comparator: '<', threshold, consecutiveDays: 5, owner: strategist.principalId }), `the indicator "${description}"`)) as { indicator: { indicatorId: string } }).indicator.indicatorId;
    const I40 = await indicator('corridor disruption: transits below 40 for five days (e2e, SYNTHETIC)', 40);
    const I20 = await indicator('regional blockade: transits below 20 for five days (e2e, SYNTHETIC)', 20);
    const baseline = (): Row => ({ name: 'Baseline', kind: 'baseline', statement: 'transits stay at their seasonal level (e2e)', owner: strategist.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 });
    const scenario = async (title: string, statement: string, branches: Row[]) => (ok(await as(strategist, '/prediction/scenarios/declare', 'prediction.scenario.declare', 'SCN', null,
      { title, statement, owner: strategist.principalId, reviewCadence: 'weekly', branches: [baseline(), ...branches] }), `the scenario "${title}"`) as { scenario: { scenarioId: string; branches: Array<{ branchId: string; name: string; kind: string }> } }).scenario;
    const a = await scenario(SCN_A, 'the corridor stays open, is disrupted, or is blockaded (e2e, SYNTHETIC)', [
      { name: 'Disruption', kind: 'disruption', statement: 'transits fall below 40 for five days (e2e)', divergence: 'a security incident closes the strait for a week', indicatorId: I40,
        owner: strategist.principalId, consequence: 'rebook the open consignments via the Cape', consequenceClass: 'C3', responseWindowHours: 48 },
      { name: 'Regional blockade', kind: 'user-defined', kindLabel: 'regional blockade', statement: 'naval activity halts transits for a quarter (e2e)', divergence: 'a regional blockade halts every transit whatever the season',
        indicatorId: I20, owner: strategist.principalId, consequence: 'dual-source the bearings now', consequenceClass: 'C4', responseWindowHours: 24,
        assumptions: [{ statement: 'naval activity halts transits' }, { statement: 'insurers withdraw cover' }] },
    ]);
    await scenario(SCN_C, 'transits hold, or halve for a quarter (e2e, SYNTHETIC)', [
      { name: 'Corridor stress', kind: 'stress', statement: 'transits at half their level for ninety days (e2e)', divergence: 'a sustained stress: half the transits for a full quarter', indicatorId: I40,
        owner: strategist.principalId, consequence: 'draw the safety stock down to its floor', consequenceClass: 'C3', responseWindowHours: 48 },
    ]);
    // THE SET: the policy requires baseline + stress; the corridor's three branches as BRANCH members; activated → the check fails (stress missing)
    const s = ok(await as(strategist, `${SETS}/declare`, 'prediction.scenario.set.declare', 'SCS', null,
      { title: SET_TITLE, purpose: 'the scenarios the Regensburg supply decision is weighed against (e2e, SYNTHETIC)', policy: { require: ['baseline', 'stress'], min_branches: 3, min_adverse: 1 } }), 'the set declared');
    SET = String((s as { set: Row }).set['set_id']);
    for (const b of a.branches) ok(await as(strategist, `${SETS}/${SET}/members/add`, 'prediction.scenario.set.member', 'SCS', SET, { scenarioId: a.scenarioId, branchId: b.branchId }), `the member "${b.name}"`);
    const act = ok(await as(strategist, `${SETS}/${SET}/activate`, 'prediction.scenario.set.activate', 'SCS', SET, {}), 'the set activated');
    expect((act as { transition: { check: Row } }).transition.check).toMatchObject({ trigger: 'activate', outcome: 'failed', missing_kinds: ['stress'], new_gap: true, live_branches: 3 });
  });

  test('1. the strategy owner opens the set from the scenario page: ACTIVE, the policy, the verdict NOT PLURAL naming the missing STRESS kind, the owner tasked; the Baseline, the Disruption and the "regional blockade" side by side', async ({ page }) => {
    await uiLogin(page, strategist.username, PW);
    await openSet(page, true);
    await expect(page.getByLabel('set state')).toHaveText('● ACTIVE — checked for plurality; it can gate a recommendation');
    await expect(page.getByLabel('policy line')).toHaveText('requires baseline, stress · at least 3 live branch(es) · at least 1 adverse');
    await expect(page.getByLabel('plurality verdict')).toHaveText(/^NOT PLURAL — missing stress.* \(3 live branch\(es\) counted\)$/);
    await expect(page.getByLabel('missing kinds')).toContainText('stress');
    await expect(page.getByText(/last recorded check .* \(activate\) — failed · the owner was tasked \(item/)).toBeVisible();
    await expect(page.getByText('none — the set gates no recommendation yet')).toBeVisible();
    // THE COMPARISON: kind, state, divergence, the indicator's freshness in words (no observation on this gate: MISSING) — never a percentage
    await expect(table(page).getByRole('row')).toHaveCount(4); // the header and three branches
    await expect(cmpRow(page, 'Baseline')).toContainText('baseline');
    await expect(cmpRow(page, 'Baseline')).toContainText('no indicator (a baseline)');
    await expect(cmpRow(page, 'Disruption')).toContainText('disruption');
    await expect(cmpRow(page, 'Disruption')).toContainText('a security incident closes the strait for a week');
    await expect(cmpRow(page, 'Regional blockade')).toContainText('“regional blockade”');
    await expect(cmpRow(page, 'Regional blockade')).toContainText('naval activity halts transits');
    await expect(cmpRow(page, 'Regional blockade')).toContainText('class C4');
    await expect(cmpRow(page, 'Regional blockade')).toContainText(/OPEN — counted/);
    await expect(cmpRow(page, 'Regional blockade')).toContainText(/MISSING — e2e-b27s-transits-.* has no observation/);
    await expect(table(page)).not.toContainText('%');
  });

  test('2. the decision owner BINDS the set to the package from the page; the package\'s proposal is REFUSED — 409 recommendation rejected (plurality) naming the missing stress branch — and it stays a draft', async ({ page }) => {
    await uiLogin(page, decider.username, PW);
    await openSet(page);
    await page.locator('#bind-pkg').fill(PKG);
    await page.getByRole('button', { name: 'Bind', exact: true }).click();
    await expect(page.getByText('the binding — recorded')).toBeVisible();
    const bindings = page.getByRole('list', { name: 'bindings' });
    await expect(bindings).toContainText(`${PKG_TITLE} · draft · v${PKG_V}`);
    await expect(page.getByText(/last recorded check .* \(bind\) — failed/)).toBeVisible();
    // THE GATE (ADR-012): the proposal is the route's act (the decisions page carries no propose control) — refused, in the server's words
    const refused = await propose();
    expect(refused.status, JSON.stringify(refused.body).slice(0, 400)).toBe(409);
    expect(JSON.stringify(refused.body)).toMatch(/recommendation rejected \(plurality\): package .* is bound to the scenario set .*no live stress branch/);
    await page.reload();
    const chooser = page.getByRole('combobox', { name: 'Scenario set', exact: true });
    const label = await chooser.locator('option').filter({ hasText: SET_TITLE }).first().textContent();
    await chooser.selectOption({ label: label ?? '' });
    await expect(page.getByRole('list', { name: 'bindings' })).toContainText(`${PKG_TITLE} · draft · v${PKG_V}`);
    await expect(page.getByLabel('plurality verdict')).toHaveText(/^NOT PLURAL — missing stress/);
  });

  test('3. the strategy owner ADDS the stress scenario\'s "Corridor stress" branch from the page → PLURAL; the decision owner\'s proposal now goes through — the binding reads proposed', async ({ page }) => {
    await uiLogin(page, strategist.username, PW);
    await openSet(page);
    const scn = await page.locator('#add-scn option').filter({ hasText: SCN_C }).first().textContent();
    await page.locator('#add-scn').selectOption({ label: scn ?? '' });
    await page.locator('#add-brn').selectOption({ label: 'Corridor stress · stress' });
    await page.getByRole('button', { name: 'Add the member' }).click();
    await expect(page.getByText('the member — recorded')).toBeVisible();
    await expect(page.getByLabel('plurality verdict')).toHaveText(/^PLURAL — 4 live branch\(es\), \d+ adverse$/);
    await expect(page.getByLabel('missing kinds')).toHaveCount(0);
    await expect(page.getByText(/last recorded check .* \(member\) — passed/)).toBeVisible();
    await expect(cmpRow(page, 'Corridor stress')).toContainText('stress');
    // the proposal, on the route: now admitted
    const pr = ok(await propose(), 'the proposal after the stress branch joined');
    expect((pr as { proposal: { versionDigest: string } }).proposal.versionDigest).toMatch(/^[0-9a-f]{64}$/);
    await page.reload();
    const chooser = page.getByRole('combobox', { name: 'Scenario set', exact: true });
    const label = await chooser.locator('option').filter({ hasText: SET_TITLE }).first().textContent();
    await chooser.selectOption({ label: label ?? '' });
    await expect(page.getByRole('list', { name: 'bindings' })).toContainText(`${PKG_TITLE} · proposed · v${PKG_V}`);
  });

  test('4. an analyst reads the verdict and the four branches side by side, and is offered no set control', async ({ page }) => {
    await uiLogin(page, reader.username, PW);
    await openSet(page);
    await expect(page.getByLabel('plurality verdict')).toHaveText(/^PLURAL — 4 live branch\(es\)/);
    await expect(table(page).getByRole('row')).toHaveCount(5);
    for (const name of ['Baseline', 'Disruption', 'Regional blockade', 'Corridor stress']) await expect(cmpRow(page, name).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bind', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add the member' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retire the set' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Declare a scenario set' })).toHaveCount(0);
  });
});
