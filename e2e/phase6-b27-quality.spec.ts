/**
 * CP-6 B27 §Q browser walk (F-P4-09; AI-49-003/-004; FEX-12) — SCENARIO QUALITY AND A GOVERNED PROBABILITY through the real interface on
 * the gate's fresh database (the hosted form of e2e/phase6-b27-quality.demo.spec.ts, which reads the demonstration and is not run by this
 * gate):
 *
 *   SEEDED THROUGH THE ROUTES: a SYNTHETIC transits series and two indicators on it; the scenario "Bab el-Mandeb freight exposure" declared
 *   by its owner (a strategy owner) with a Baseline and the downside "Corridor collapse"; then, through the BranchScenario route, TWO
 *   branches that differ ONLY IN WORDING (the same indicator, divergence and assumption): the disruption "Strait closure" ("Strait closure:
 *   transits halt for seven days") and the user-defined "Strait shutdown" ("Strait closure — transits halted for seven days.") →
 *   1. the owner opens the quality page from the scenario page and EVALUATES from the page → FAILED, a new failure; the scenario reads
 *      NOT DECISION-ACTIVE with the server's reason; the finding "distinctiveness — branches differ only in wording" FAIL naming BOTH
 *      branches; coverage names the missing stress kind; the v1 coherence stays as it was (PASSED); the indicator freshness in words;
 *   2. the owner SETS a probability on "Corridor collapse" from the page by EXPERT ELICITATION (the named experts, the question, the
 *      instant, the record) → the band and the method with its basis shown; the live lows' sum;
 *   3. an analyst reads the verdict and the probability with its method, and is offered neither the evaluation nor the set / withdraw.
 *
 * HONEST LIMITS (what this gate does not reach): no observation is ingested (this gate runs no collection), so every indicator reads
 * AWAITING its first observation — a STALE indicator needs a superuser move on last_observation_at and a MISSING one the retirement
 * route; both are the harness's (apps/api/test/int/phase6-quality-b27.test.ts c) and the demonstration walk's; the tick's re-evaluation
 * (step scenario-quality, order 68) and the owner's attention item are the harness's (e) — the scheduler is off in this gate's API; the
 * frequency-map and model methods, the sum refusal and the withdrawal are the harness's (d). Nothing rendered here claims otherwise.
 *
 * The seeding is the API's, in the Phase 1 idiom (the B90 walks'): this suite makes its own tenant, ONE domain and three DOMAIN principals
 * with a per-run password — the scenario owner (a strategy owner), the forecast owner (the series), an analyst. Every figure is SYNTHETIC.
 * The selectors are the page's own (apps/web/app/prediction/scenarios/quality/page.tsx): the combobox "Scenario", the status line, the
 * regions "Findings", "Indicator freshness", "Branch probabilities", the button "Evaluate the quality now", the form "Set or withdraw a
 * probability" (#qp-branch, #qp-method, #qp-low, #qp-high, #qp-experts, #qp-question, #qp-at, #qp-record, "Set the probability").
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
const PW = `Qu27!${crypto.randomUUID()}`;
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
    object_type: 'SCN', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-b27q',
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
let admin: Ctx; let owner: Ctx; let forecaster: Ctx; let analyst: Ctx;
let T = ''; let D = ''; let S = '';
const TITLE = `Bab el-Mandeb freight exposure (e2e ${run}, SYNTHETIC)`;
const EXPERTS = 'N. Eriksen (SYNTHETIC), J. Weber (SYNTHETIC)';
const QUESTION = 'will transits stay below 40 for five days within the quarter? (e2e)';

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

/* ───────────────────────── the page's own selectors ───────────────────────── */
async function openQuality(page: Page, viaLink = false): Promise<void> {
  if (viaLink) {
    await page.goto('/prediction/scenarios');
    await expect(page.getByRole('heading', { name: 'Scenarios', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: `Quality, indicator freshness and probabilities of ${TITLE}` }).click();
    await expect(page).toHaveURL(/\/prediction\/scenarios\/quality\?scenario=[0-9a-f-]{36}/);
  } else {
    await page.goto('/prediction/scenarios/quality');
    const scenarios = page.getByRole('combobox', { name: 'Scenario', exact: true });
    // selectOption takes the option's exact label, read from the option itself
    const label = await scenarios.locator('option').filter({ hasText: TITLE }).first().textContent();
    await scenarios.selectOption({ label: label ?? '' });
  }
  await expect(page.getByRole('heading', { name: 'Scenario quality', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: TITLE, level: 2 })).toBeVisible();
}
const verdict = (page: Page): Locator => page.getByRole('status').filter({ hasText: /DECISION-ACTIVE/ }).first();
const probRow = (page: Page, name: string): Locator => page.getByRole('region', { name: 'Branch probabilities', exact: true }).getByRole('row').filter({ hasText: name });

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B27 §Q — scenario quality: two wording-only branches fail distinctiveness, NOT DECISION-ACTIVE; a probability set by expert elicitation shown with its method', () => {
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
      { name: `E2E B27 Quality ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`, { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `B27 Quality ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;
    owner = await person(`q27-owner-${run}`, 'strategy_owner');
    forecaster = await person(`q27-forecast-${run}`, 'forecast_owner');
    analyst = await person(`q27-analyst-${run}`, 'domain_analyst');
    // THE SIGNPOSTS: a SYNTHETIC series (no observation is ingested: this gate runs no collection) and two indicators on it
    const seriesKey = `e2e-b27q-transits-${run}`;
    ok(await as(forecaster, '/prediction/series/register', 'prediction.series.register', 'SER', null,
      { seriesKey, sourceKey: `e2e-b27q-source-${run}`, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 1,
        description: 'synthetic daily transits of the corridor (e2e, SYNTHETIC)' }), 'the series registered');
    const indicator = async (description: string, threshold: number) => ((ok(await as(owner, '/prediction/indicators/define', 'prediction.indicator.define', 'IND', null,
      { seriesKey, description, comparator: '<', threshold, consecutiveDays: 5, owner: owner.principalId }), `the indicator "${description}"`)) as { indicator: { indicatorId: string } }).indicator.indicatorId;
    const I1 = await indicator('corridor collapse: transits below 40 for five days (e2e, SYNTHETIC)', 40);
    const I2 = await indicator('strait closed: transits below 25 for five days (e2e, SYNTHETIC)', 25);
    // THE TREE: a Baseline and the downside "Corridor collapse"
    const s = ok(await as(owner, '/prediction/scenarios/declare', 'prediction.scenario.declare', 'SCN', null, {
      title: TITLE, statement: 'the Bab el-Mandeb corridor over the next quarter (e2e, SYNTHETIC)', owner: owner.principalId, reviewCadence: 'weekly', branches: [
        { name: 'Baseline', kind: 'baseline', statement: 'transits hold at the forecast level (e2e)', owner: owner.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
        { name: 'Corridor collapse', kind: 'downside', statement: 'transits fall below 40 for five days (e2e)', indicatorId: I1, owner: owner.principalId, consequence: 'rebook the open shipments now', responseWindowHours: 48 },
      ] }), 'the scenario declared');
    S = (s as { scenario: { scenarioId: string } }).scenario.scenarioId;
    // THE WORDING-ONLY PAIR through BranchScenario: the same indicator, divergence and assumption; the statements differ in wording only
    const common = { indicatorId: I2, divergence: 'the strait closes to merchant traffic (e2e, SYNTHETIC)', assumptions: [{ statement: 'naval activity halts transits' }], owner: owner.principalId,
      consequence: 'reroute every open booking via the Cape', responseWindowHours: 24 };
    ok(await as(owner, `/prediction/scenarios/${S}/branches`, 'prediction.scenario.branch', 'SCN', S,
      { expected_version: 1, idempotency_key: `e2e-b27q-closure-1-${run}`, branch: { name: 'Strait closure', kind: 'disruption', statement: 'Strait closure: transits halt for seven days', ...common } }), 'the disruption added');
    ok(await as(owner, `/prediction/scenarios/${S}/branches`, 'prediction.scenario.branch', 'SCN', S,
      { expected_version: 2, idempotency_key: `e2e-b27q-closure-2-${run}`, branch: { name: 'Strait shutdown', kind: 'user-defined', kindLabel: 'strait shutdown', statement: 'Strait closure — transits halted for seven days.', ...common } }), 'the user-defined branch added');
  });

  test('1. the owner opens the quality page from the scenario page and EVALUATES: FAILED — distinctiveness names both wording-only branches; NOT DECISION-ACTIVE with the server\'s reason; coverage names the missing stress kind', async ({ page }) => {
    await uiLogin(page, owner.username, PW);
    await openQuality(page, true);
    // before any evaluation: nothing recorded, the v1 coherence as the declaration and the branchings left it
    await expect(page.getByText('UNEVALUATED — no evaluation recorded yet')).toBeVisible();
    await expect(page.getByText('No evaluation is recorded; the measures below are as of now.')).toBeVisible();
    await page.getByRole('button', { name: 'Evaluate the quality now' }).click();
    await expect(page.getByText('Recorded: FAILED — a new failure; the owner is notified.')).toBeVisible();
    await expect(verdict(page)).toContainText(/^⚑ NOT DECISION-ACTIVE — .*indistinct_branches/);
    await expect(page.getByText(/FAILED — evaluated .* \(operator\) on version/)).toBeVisible();
    await expect(page.getByText('PASSED', { exact: true })).toBeVisible(); // the v1 coherence line: untouched by the quality rules
    const findings = page.getByRole('region', { name: 'Findings', exact: true });
    await expect(findings.getByText('The latest evaluation — FAILED under rule version 1:')).toBeVisible();
    const row = findings.getByRole('row').filter({ hasText: 'distinctiveness — branches differ only in wording' }).first();
    await expect(row).toContainText('FAIL');
    await expect(row).toContainText('Strait closure');
    await expect(row).toContainText('Strait shutdown');
    await expect(row).toContainText(/differ only in wording/);
    const coverage = findings.getByRole('row').filter({ hasText: /^.*coverage/ }).first();
    await expect(coverage).toContainText('NOTE');
    await expect(coverage).toContainText('stress');
    await expect(page.getByRole('region', { name: 'Measures', exact: true })).toContainText('missing stress');
    // the freshness in words: no observation is ingested on this gate — every signpost AWAITS its first observation (the honest state)
    const fresh = page.getByRole('region', { name: 'Indicator freshness', exact: true });
    await expect(fresh).toContainText('0 missing · 0 stale');
    await expect(fresh.getByRole('row').filter({ hasText: 'Strait shutdown' })).toContainText('AWAITING its first observation');
    await expect(page.getByRole('region', { name: 'Evaluations', exact: true })).toContainText(/FAILED \(operator, version 3\) — a new failure; the owner was notified/);
  });

  test('2. the owner SETS a probability on "Corridor collapse" by EXPERT ELICITATION from the page: the band, the method with the experts, the instant and the question', async ({ page }) => {
    await uiLogin(page, owner.username, PW);
    await openQuality(page);
    await expect(probRow(page, 'Corridor collapse')).toContainText('none set');
    const form = page.getByRole('form', { name: 'Set or withdraw a probability' });
    const branchLabel = await form.locator('#qp-branch option').filter({ hasText: 'Corridor collapse' }).first().textContent();
    await form.locator('#qp-branch').selectOption({ label: branchLabel ?? '' });
    await form.getByRole('combobox', { name: 'Method', exact: true }).selectOption('expert_elicitation');
    await form.locator('#qp-low').fill('0.2');
    await form.locator('#qp-high').fill('0.35');
    await form.locator('#qp-experts').fill(EXPERTS);
    await form.locator('#qp-question').fill(QUESTION);
    await form.locator('#qp-at').fill('2026-09-29T10:00');
    await form.locator('#qp-record').fill('two experts, independent estimates, reconciled in a recorded session (e2e, SYNTHETIC)');
    await form.getByRole('button', { name: 'Set the probability' }).click();
    const row = probRow(page, 'Corridor collapse');
    await expect(row).toContainText('20%–35%');
    await expect(row).toContainText(`expert elicitation of N. Eriksen (SYNTHETIC), J. Weber (SYNTHETIC) at`);
    await expect(row).toContainText(`on "${QUESTION}"`);
    await expect(row).toContainText(`${owner.principalId.slice(0, 8)}…`);
    await expect(page.getByRole('region', { name: 'Branch probabilities', exact: true })).toContainText(/lows sum to 20%/);
    await expect(probRow(page, 'Strait closure')).toContainText('none set');
    await expect(form.getByRole('button', { name: 'Withdraw the probability' })).toBeVisible();
  });

  test('3. an analyst reads the verdict and the probability with its method, and is offered neither the evaluation nor the set / withdraw', async ({ page }) => {
    await uiLogin(page, analyst.username, PW);
    await openQuality(page);
    await expect(verdict(page)).toContainText(/NOT DECISION-ACTIVE — .*indistinct_branches/);
    await expect(probRow(page, 'Corridor collapse')).toContainText('20%–35%');
    await expect(probRow(page, 'Corridor collapse')).toContainText(/expert elicitation of /);
    await expect(page.getByRole('region', { name: 'Branch probabilities', exact: true })).toContainText(/is set or withdrawn by the scenario's owner, the branch's owner or an administrator/);
    await expect(page.getByRole('button', { name: 'Set the probability' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Evaluate the quality now' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Declare the map' })).toHaveCount(0);
  });
});
