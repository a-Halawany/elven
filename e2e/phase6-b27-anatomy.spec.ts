/**
 * CP-6 B27 §A browser walk (F-P4-07) — SCENARIO ANATOMY AND THE SUSPENSION through the real interface on the gate's fresh database (the
 * hosted form of e2e/phase6-b27-anatomy.demo.spec.ts, which reads the demonstration and is not run by this gate):
 *
 *   SEEDED THROUGH THE ROUTES: a SYNTHETIC transits series registered and an indicator defined on it; the scenario "Bab el-Mandeb closure"
 *   declared by the strategy owner (a Baseline, and the disruption "Insurer withdrawal" owned by the forecast owner, on the indicator);
 *   its ELEMENTS declared through the anatomy route — the scenario-wide exogenous driver "Houthi activity", the actor "Carriers" (agency
 *   high), the branch's endogenous driver "Insurer withdrawal" and its mechanism "War-risk premium → rerouting" resting on both drivers;
 *   the ASU "Insurers keep war-risk cover" declared through the graph's strategy route and LINKED CRITICAL to the disruption branch →
 *   1. /prediction/scenarios → the anatomy link → the page shows the elements BY KIND (Drivers, Actors, Mechanisms; the scenario's and the
 *      branch's), the mechanism's cause → effect, and the register row CRITICAL · assumption unverified with its condition;
 *   2. the strategy owner INVALIDATES the ASU through the graph route (graph.assumption.verify) → the branch owner reads the branch
 *      SUSPENDED — the banner with the cause (the critical assumption named), who suspended it, NOT decision-active, the owner tasked (the
 *      open item) — and the reinstatement typed from the page is REFUSED by the server while the ASU is still invalidated (its words shown);
 *   3. the ASU re-verified through the graph route → the branch owner REINSTATES from the page with a note → OPEN — live, decision-active,
 *      the reinstatement line with the note;
 *   4. an analyst reads the register and the branches and is offered no write control.
 *
 * HONEST LIMITS (what this gate does not reach): the invalidation itself is a graph ROUTE call, not a page act (the anatomy page links and
 * shows ASUs; the verification is the Knowledge Graph's); the attention item the suspension routes to the owner is read only through the
 * banner's "The owner is tasked" line (the attention page is not walked); the flip skipping a suspended branch and the run refusal
 * (`run rejected (branch_suspended)`) need an indicator evaluation over observations and a twin run — the harness's
 * (apps/api/test/int/phase6-anatomy-b27.test.ts D2, D4), not this gate's; claim and indicator conditions, the intervention → impact map
 * and the records are the harness's too. Nothing rendered here claims otherwise.
 *
 * The seeding is the API's, in the Phase 1 idiom (the B90 walks'): this suite makes its own tenant, ONE domain and four DOMAIN principals
 * with a per-run password — the strategy owner (the scenario's owner; declares and invalidates the ASU), the forecast owner (the series;
 * the disruption branch's owner), an analyst (the reader). Every figure is SYNTHETIC. The selectors are the page's own
 * (apps/web/app/prediction/scenarios/anatomy/page.tsx): the heading "Anatomy: <title>", the regions "Branch: <name>" and "Assumption
 * register", the alert "suspension of <name>", the field "Reinstatement note …", the button `Reinstate "<name>"`.
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
const PW = `An27!${crypto.randomUUID()}`;
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
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-b27a',
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
let admin: Ctx; let strategist: Ctx; let forecaster: Ctx; let analyst: Ctx;
let T = ''; let D = ''; let S = ''; let DISRUPT = ''; let ASU = '';
const TITLE = `Bab el-Mandeb closure (e2e ${run}, SYNTHETIC)`;
const BRANCH = 'Insurer withdrawal';
const ASU_TITLE = 'Insurers keep war-risk cover';
const INVALIDATION = 'the war-risk underwriters withdrew cover for the corridor this week (e2e, SYNTHETIC)';
const NOTE = 'cover is written again after the escort began; the branch holds as declared (e2e)';

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
const ANATOMY = '/prediction/scenarios/anatomy';
/** The strategy owner verifies or invalidates the ASU through the graph's route (0090 §I, graph.assumption.verify). */
const verify = (state: 'verified' | 'invalidated', reason: string) =>
  as(strategist, `/graph/strategy/${ASU}/assumption/verify`, 'graph.assumption.verify', 'ASU', ASU, { state, reason }, 'graph');

/* ───────────────────────── the page's own selectors ───────────────────────── */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function openAnatomy(page: Page): Promise<void> {
  await page.goto('/prediction/scenarios');
  await expect(page.getByRole('heading', { name: 'Scenarios', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(`^Anatomy of “${esc(TITLE)}”`) }).click();
  await expect(page.getByRole('heading', { name: `Anatomy: ${TITLE}`, level: 1 })).toBeVisible();
}
const branch = (page: Page): Locator => page.getByRole('region', { name: `Branch: ${BRANCH}`, exact: true });
const register = (page: Page): Locator => page.getByRole('region', { name: 'Assumption register', exact: true });

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B27 §A — scenario anatomy: elements by kind, the critical assumption, the suspension with its cause, the refused and the admitted reinstatement', () => {
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
      { name: `E2E B27 Anatomy ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`, { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `B27 Anatomy ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;
    strategist = await person(`a27-strategy-${run}`, 'strategy_owner');
    forecaster = await person(`a27-forecast-${run}`, 'forecast_owner');
    analyst = await person(`a27-analyst-${run}`, 'domain_analyst');
    // THE SIGNPOST: a SYNTHETIC series (no observation is ingested: this gate runs no collection) and an indicator on it
    const seriesKey = `e2e-b27a-transits-${run}`;
    ok(await as(forecaster, '/prediction/series/register', 'prediction.series.register', 'SER', null,
      { seriesKey, sourceKey: `e2e-b27a-source-${run}`, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7,
        description: 'synthetic daily transits of the corridor (e2e, SYNTHETIC)' }), 'the series registered');
    const ind = ok(await as(strategist, '/prediction/indicators/define', 'prediction.indicator.define', 'IND', null,
      { seriesKey, description: 'corridor collapse: transits below 40 for five days (e2e, SYNTHETIC)', comparator: '<', threshold: 40, consecutiveDays: 5, owner: strategist.principalId }), 'the indicator defined');
    const indicatorId = (ind as { indicator: { indicatorId: string } }).indicator.indicatorId;
    // THE SCENARIO: the strategy owner's; the disruption branch the forecast owner's
    const s = ok(await as(strategist, '/prediction/scenarios/declare', 'prediction.scenario.declare', 'SCN', null, {
      title: TITLE, statement: 'the corridor stays open, or insurers withdraw and carriers reroute (e2e, SYNTHETIC)', owner: strategist.principalId, reviewCadence: 'weekly', branches: [
        { name: 'Baseline', kind: 'baseline', statement: 'transits hold at the seasonal level (e2e)', owner: strategist.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
        { name: BRANCH, kind: 'disruption', statement: 'war-risk cover is withdrawn and sailings stop (e2e)', divergence: 'insurers withdraw war-risk cover, so carriers stop sailing whatever the transits say',
          indicatorId, owner: forecaster.principalId, consequence: 'reroute every open booking via the Cape', consequenceClass: 'C3', responseWindowHours: 24 },
      ] }), 'the scenario declared');
    const sc = (s as { scenario: { scenarioId: string; branches: Array<{ branchId: string; kind: string }> } }).scenario;
    S = sc.scenarioId;
    DISRUPT = sc.branches.find((b) => b.kind === 'disruption')!.branchId;
    // THE ELEMENTS through the anatomy route (SYNTHETIC)
    const el = async (who: Ctx, payload: Row) => String(((ok(await as(who, `${ANATOMY}/${S}/elements/declare`, 'prediction.scenario.anatomy.element', 'SCN', S, payload), `the ${String(payload['kind'])} "${String(payload['name'])}"`)) as { element: { element_id: string } }).element.element_id);
    const houthi = await el(strategist, { kind: 'driver', name: 'Houthi activity', description: 'attacks on shipping in the southern Red Sea (e2e, SYNTHETIC)', attributes: { exogenous: true } });
    await el(strategist, { kind: 'actor', name: 'Carriers', description: 'the container lines that route through the corridor (e2e)', attributes: { agency: 'high' } });
    const insurer = await el(forecaster, { kind: 'driver', name: 'Insurer withdrawal', branchId: DISRUPT, description: 'war-risk underwriters withdraw cover for the corridor (e2e)', attributes: { exogenous: false } });
    await el(forecaster, { kind: 'mechanism', name: 'War-risk premium → rerouting', branchId: DISRUPT, description: 'the premium makes the corridor uneconomic, so carriers reroute (e2e)',
      attributes: { cause: 'war-risk premium rises', effect: 'carriers reroute via the Cape', dependencies: [houthi, insurer] } });
    // THE ASSUMPTION through the graph's strategy route (declared unverified), LINKED CRITICAL to the disruption branch
    const a = ok(await as(strategist, '/graph/strategy/declare', 'graph.strategy.declare', 'ASU', null,
      { objectType: 'ASU', title: ASU_TITLE, statement: 'hull and cargo insurers keep writing war-risk cover for the corridor (e2e, SYNTHETIC)',
        restsOn: [{ kind: 'entity', id: crypto.randomUUID(), rationale: 'SYNTHETIC entity reference (the browser gate seeds no graph)' }] }, 'graph'), 'the ASU declared');
    ASU = (a as { strategy: { objectId: string } }).strategy.objectId;
    const l = ok(await as(forecaster, `${ANATOMY}/${S}/assumptions/link`, 'prediction.scenario.anatomy.assumption', 'SCN', S,
      { assumptionId: ASU, branchId: DISRUPT, critical: true, condition: { kind: 'state', text: 'the war-risk cover assumption is invalidated' }, rationale: 'the disruption branch exists because cover may go' }), 'the critical link');
    expect((l as { link: Row }).link).toMatchObject({ critical: true, version: 1, state: 'linked' });
  });

  test('1. the strategy owner opens the anatomy from the scenario page: the elements BY KIND (the whole scenario\'s and the branch\'s), the mechanism\'s cause → effect, the register\'s CRITICAL link with its condition', async ({ page }) => {
    await uiLogin(page, strategist.username, PW);
    await openAnatomy(page);
    const whole = page.getByRole('region', { name: 'The whole scenario', exact: true });
    const wideRow = (name: string) => whole.getByRole('row').filter({ hasText: name });
    await expect(wideRow('Houthi activity')).toContainText('Drivers');
    await expect(wideRow('Houthi activity')).toContainText('exogenous (a shock from outside)');
    await expect(wideRow('Carriers')).toContainText('Actors');
    await expect(wideRow('Carriers')).toContainText('agency high');
    const b = branch(page);
    await expect(b).toContainText('OPEN — live');
    await expect(b).toContainText('decision-active');
    await expect(b.getByRole('row').filter({ hasText: 'Insurer withdrawal' })).toContainText('endogenous');
    const mech = b.getByRole('row').filter({ hasText: 'War-risk premium → rerouting' });
    await expect(mech).toContainText('Mechanisms');
    await expect(mech).toContainText('war-risk premium rises → carriers reroute via the Cape');
    const reg = register(page).getByRole('row').filter({ hasText: ASU_TITLE });
    await expect(reg).toContainText(BRANCH);
    await expect(reg).toContainText('CRITICAL · assumption unverified');
    await expect(reg).toContainText('the assumption is invalidated in the Knowledge Graph — “the war-risk cover assumption is invalidated”');
    await expect(b.getByRole('alert')).toHaveCount(0);
  });

  test('2. the ASU INVALIDATED through the graph route → the branch owner reads the branch SUSPENDED with its cause, NOT decision-active, tasked; the reinstatement typed from the page is REFUSED while the ASU stays invalidated', async ({ page }) => {
    ok(await verify('invalidated', INVALIDATION), 'the ASU invalidated');
    await uiLogin(page, forecaster.username, PW);
    await openAnatomy(page);
    const b = branch(page);
    await expect(b).toContainText('SUSPENDED — not live: no flip, no simulation, not decision-active');
    await expect(b).toContainText('NOT decision-active');
    const banner = b.getByRole('alert', { name: `suspension of ${BRANCH}` });
    await expect(banner).toContainText('This branch is suspended.');
    await expect(banner).toContainText(`by ${strategist.username} — the critical assumption "${ASU_TITLE}" was invalidated.`);
    await expect(banner).toContainText(INVALIDATION);
    await expect(banner).toContainText('A reinstatement returns it to open.');
    await expect(banner).toContainText(/The owner is tasked: open item due/);
    const reg = register(page).getByRole('row').filter({ hasText: ASU_TITLE });
    await expect(reg).toContainText('CRITICAL · assumption invalidated · condition MET');
    // the owner's reinstatement, typed on the page: the button waits for a 16-character note; the server refuses while the ASU is invalidated
    const button = b.getByRole('button', { name: `Reinstate "${BRANCH}"` });
    await expect(button).toBeDisabled();
    await b.getByLabel(/^Reinstatement note/).fill(NOTE);
    await button.click();
    await expect(page.getByText(new RegExp(`branch suspension rejected \\(invalidated\\): the critical assumption "${esc(ASU_TITLE)}" is still invalidated`)).first()).toBeVisible();
    await expect(branch(page)).toContainText('SUSPENDED — not live');
  });

  test('3. the ASU re-verified through the graph route → the branch owner REINSTATES from the page with a note → OPEN — live, decision-active, the reinstatement recorded with its note', async ({ page }) => {
    ok(await verify('verified', 'underwriters reinstated war-risk cover after the escort began (e2e, SYNTHETIC)'), 'the ASU verified again');
    await uiLogin(page, forecaster.username, PW);
    await openAnatomy(page);
    const b = branch(page);
    // verification alone does not reinstate: the owner's word does
    await expect(b).toContainText('SUSPENDED — not live');
    await b.getByLabel(/^Reinstatement note/).fill(NOTE);
    await b.getByRole('button', { name: `Reinstate "${BRANCH}"` }).click();
    await expect(page.getByText(`"${BRANCH}" reinstated to open`)).toBeVisible();
    await expect(branch(page)).toContainText('OPEN — live');
    await expect(branch(page)).not.toContainText('NOT decision-active');
    await expect(branch(page)).toContainText('decision-active');
    await expect(branch(page).getByRole('alert')).toHaveCount(0);
    await expect(branch(page)).toContainText(new RegExp(`Reinstated .* by ${esc(forecaster.username)}: ${esc(NOTE)}`));
    await expect(register(page).getByRole('row').filter({ hasText: ASU_TITLE })).toContainText('CRITICAL · assumption verified');
  });

  test('4. an analyst reads the elements, the register and the branch, and is offered no write control', async ({ page }) => {
    await uiLogin(page, analyst.username, PW);
    await openAnatomy(page);
    await expect(register(page).getByRole('row').filter({ hasText: ASU_TITLE })).toContainText('CRITICAL · assumption verified');
    await expect(branch(page)).toContainText('OPEN — live');
    await expect(page.getByRole('heading', { name: 'Declare an element' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Suspend "/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Unlink "/ })).toHaveCount(0);
    await expect(page.getByText('Link an assumption of the Knowledge Graph')).toHaveCount(0);
  });
});
