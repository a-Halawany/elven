/**
 * CP-6 B36 browser walk (part C; STAGES.csv B36 conditions (s) and (i)) — COLLABORATION COMPLETED and the carried outcome loop through the
 * real interface on the gate's fresh database (the hosted form of e2e/phase6-b36-collab.demo.spec.ts, which reads the demonstration and is
 * not run by this gate):
 *
 *   (s) /decisions/workspaces — THE GRANT SURFACE: the workspace the case owner opened on a decision package, its participants, the
 *   external collaborator's invitation the owner requested and the TENANT ADMINISTRATOR provisioned through the identity authority — the
 *   grant line with its DELIVERY to the SYNTHETIC mailbox (no e-mail is sent); the administrator, through the working-domain chooser, reads
 *   the mailbox: the one-time pickup code inside, the token nowhere;
 *   /decisions/tasks — a task that WAITS ON another (PR-46-002): the holder declares from the page that B waits on A; B's card says so and
 *   offers no Complete until A closes; A completed from the page → B released → Complete offered;
 *   /decisions/workflow — a definition whose transition declares depends_on, published by the chief of staff and listed with its reason;
 *   the instance started on it in the table.
 *   (i) /prediction/exposures — the outcome → learn panel: the corridor risk registered, assessed and accepted by its owner, its MITIGATION
 *   response opened (a decision package) → the "responses monitored" list reads the response's monitor state and what is OWED (the
 *   response's decision is committed first) — the honest state this walk reaches: an outcome rests on a twin's observed element (a record
 *   uploaded and grounded on an admitted twin version), beyond the gate's routes (the review of the outcome and the learn step are the
 *   harness's, apps/api/test/int/phase6-collab-b36.test.ts I1/J1, and the demonstration walk's).
 *
 * The seeding is the API's, in the Phase 1 idiom: this suite makes its own tenant, ONE domain, eight DOMAIN principals and one TENANT
 * principal with a per-run password. The pickup and the external's own surface (q, t) are the login page's flow, walked on the demonstration
 * (the code is read by a person from the mailbox); here the mailbox is read and the code's presence asserted, the token's absence too.
 *
 * The selectors are the pages' own (apps/web/app/decisions/workspaces/page.tsx, tasks/page.tsx, workflow/page.tsx,
 * apps/web/app/prediction/exposures/page.tsx): "Purpose (every request here is made under it)", "Read", the workspace's title button, the
 * region "The selected workspace", the label "delivery of <grant>", "Read the synthetic mailbox", the region "synthetic mailbox message";
 * the task cards (their level-2 headings), "waits on <task>", #dep-<task>, "Declare", the Complete fieldset (#out-, #note-, "Complete");
 * the workflow page's "Definitions" list and "Instances" table; the exposures page's title button and the list "responses monitored".
 * The chooser's are components/working-domain.tsx's (#wd-domain, "Open this domain").
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
const PW = `Cb36!${crypto.randomUUID()}`;
const run = Date.now().toString(36);
const PURPOSE = `collaboration.b36-e2e-review-${run}`;

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
    object_type: 'CWS', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-b36c',
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
let admin: Ctx; let tadmin: Ctx; let dadmin: Ctx; let executive: Ctx; let chief: Ctx; let caseOwner: Ctx; let analyst: Ctx; let riskOwner: Ctx;
let T = ''; let D = ''; let WS = ''; let GRANT = ''; let TASK_A = ''; let TASK_B = ''; let RSK = '';
const WS_TITLE = `Dual-sourcing review — customs and bearings (e2e ${run})`;
const TASK_A_TITLE = `A · the customs brief (e2e ${run})`;
const TASK_B_TITLE = `B · the route summary after the brief (e2e ${run})`;
const DEF_KEY = `b36-deps-${run}`;
const RSK_TITLE = `Corridor closure — Regensburg line (e2e ${run})`;

async function person(login: string, roleCode: string, scope: 'DOMAIN' | 'TENANT' = 'DOMAIN'): Promise<Ctx> {
  const p = await api(`/v1/tenants/${T}/principals`,
    { action: 'identity.principal.create', scope: 'TENANT', tenant_id: T, object_type: 'PRN', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
    { kind: 'human', displayName: login, loginName: login, password: PW, roleCode, ...(scope === 'DOMAIN' ? { domainId: D } : {}) }, admin.token);
  expect(p.status, `${login} (${roleCode}) created`).toBe(201);
  const l = await loginApi(login, PW);
  expect(l.status, `${login} signed in`).toBe(201);
  return { token: (l.body as { tokens: { accessToken: string } }).tokens.accessToken, principalId: (l.body as { principalId: string }).principalId, username: login };
}
/** A governed act of this suite's seeding, in the domain, as one of its people. */
const as = (who: Ctx, path: string, action: string, objectType: string, objectId: string | null, payload: unknown, purpose: string, over: Record<string, unknown> = {}) =>
  api(`/v1/tenants/${T}/domains/${D}${path}`, { action, scope: 'DOMAIN', tenant_id: T, domain_id: D, object_type: objectType, object_id: objectId, principal_id: `principal:${who.principalId}`, purpose_id: purpose, ...over }, payload, who.token);
const ok = (r: { status: number; body: Record<string, unknown> }, what: string, status = 201) => { expect(r.status, `${what}: ${JSON.stringify(r.body).slice(0, 400)}`).toBe(status); return r.body; };
const col = (who: Ctx, path: string, action: string, objectType: string, objectId: string | null, payload: unknown) => as(who, `/executive/collab/${path}`, action, objectType, objectId, payload, PURPOSE);

/* ───────────────────────── the pages' own selectors ───────────────────────── */
const short8 = (id: string) => `${id.slice(0, 8)}…`;
async function openWorkspaces(page: Page): Promise<void> {
  await page.goto('/decisions/workspaces');
  await expect(page.getByRole('heading', { name: 'Workspaces', level: 1 })).toBeVisible();
  await page.getByLabel('Purpose (every request here is made under it)').fill(PURPOSE);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await page.getByRole('button', { name: WS_TITLE, exact: true }).click();
  await expect(page.getByRole('region', { name: 'The selected workspace' }).getByRole('heading', { name: WS_TITLE, level: 2 })).toBeVisible();
}
const taskCard = (page: Page, taskId: string): Locator => page.locator(`section[aria-labelledby="task-${taskId}"]`);
async function openTasks(page: Page): Promise<void> {
  await page.goto('/decisions/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B36 — collaboration completed: the grant surface, a task that waits on another, a definition with depends_on; the exposure\'s response monitored', () => {
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
      { name: `E2E B36 Collab ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`, { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `B36 Collab ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;
    // THE PEOPLE: the tenant administrator (provisions the invitation, reads the mailbox — the identity authority's), the domain administrator
    // (declares the strategy objects, activates the taxonomy), the executive (publishes the taxonomy), the chief of staff (the reviewer, the
    // task holder, the workflow's owner), the case owner (opens the workspace and the tasks), an analyst (registers and assesses the risk),
    // the risk owner (accepts the assessment, opens the response).
    tadmin = await person(`c36-tadmin-${run}`, 'tenant_admin', 'TENANT');
    dadmin = await person(`c36-dadmin-${run}`, 'domain_admin');
    executive = await person(`c36-exec-${run}`, 'executive');
    chief = await person(`c36-chief-${run}`, 'executive');
    caseOwner = await person(`c36-owner-${run}`, 'decision_owner');
    analyst = await person(`c36-analyst-${run}`, 'domain_analyst');
    riskOwner = await person(`c36-riskowner-${run}`, 'risk_owner');
    // THE WORKSPACE on a decision package (the DEC on a SYNTHETIC entity reference — the gate seeds no graph)
    const declare = async (who: Ctx, objectType: string, title: string, restsOn: unknown[]) => {
      const r = ok(await as(who, '/graph/strategy/declare', 'graph.strategy.declare', objectType, null, { objectType, title, statement: `${title} (e2e, SYNTHETIC)`, restsOn }, 'graph'), `${objectType} declared`);
      return (r as { strategy: { objectId: string } }).strategy.objectId;
    };
    const DECID = await declare(dadmin, 'DEC', `Routing of SYN-SHIP-4472 (e2e ${run})`, [{ kind: 'entity', id: crypto.randomUUID(), rationale: 'SYNTHETIC entity reference (the browser gate seeds no graph)' }]);
    const pkg = ok(await as(caseOwner, '/decisions/declare', 'decision.package.declare', 'DPK', null,
      { decisionObjectId: DECID, title: `Dual-sourcing review — partner review (e2e ${run}, SYNTHETIC)`, statement: 'whether to take the partner\'s customs review (e2e)', owner: caseOwner.principalId }, 'decision'), 'the package declared');
    const pkgId = (pkg as { package: { packageId: string } }).package.packageId;
    const ws = ok(await col(caseOwner, 'workspaces/open', 'executive.collab.workspace.open', 'CWS', null,
      { title: WS_TITLE, subject: { kind: 'decision_package', id: pkgId }, purpose: PURPOSE, classification_ceiling: 'internal' }), 'the workspace opened');
    WS = (ws as { workspace: { workspace_id: string } }).workspace.workspace_id;
    ok(await col(caseOwner, `workspaces/${WS}/participants`, 'executive.collab.participant.set', 'CWS', WS, { op: 'add', principal: chief.principalId, role: 'reviewer' }), 'the chief a reviewer');
    // THE TWO REVIEW TASKS for the chief of staff (the dependency is declared from the tasks page)
    const task = async (title: string, key: string) => {
      const r = ok(await col(caseOwner, `workspaces/${WS}/review-requests`, 'executive.collab.review.request', 'HTK', null, { reviewer: chief.principalId, title, escalation: { max_escalations: 0 }, request_key: key }), `the task "${title}"`);
      return (r as { task: { task_id: string } }).task.task_id;
    };
    TASK_A = await task(TASK_A_TITLE, `b36-dep-a-${run}`);
    TASK_B = await task(TASK_B_TITLE, `b36-dep-b-${run}`);
    // THE INVITATION (B34-F1, 0091): the owner REQUESTS it; the tenant administrator PROVISIONS it through the identity authority — the
    // invitation delivered to the SYNTHETIC mailbox (B36 §C3), the token in no answer.
    const inv = ok(await col(caseOwner, `workspaces/${WS}/invitations`, 'executive.collab.invite', 'CGR', null,
      { display_name: 'R. Haddad — customs broker, partner firm (SYNTHETIC)', contact_label: 'customs-broker@partner.example (SYNTHETIC)', audience_ceiling: 'internal', expires_in_days: 14 }), 'the invitation requested');
    GRANT = (inv as { grant: { grant_id: string } }).grant.grant_id;
    const prov = ok(await col(tadmin, `grants/${GRANT}/provision`, 'executive.collab.provision', 'CGR', GRANT, {}), 'the invitation provisioned');
    expect((prov as { grant: { state: string; delivery: { channel: string; synthetic: boolean } } }).grant).toMatchObject({ state: 'invited', delivery: { channel: 'demo-mailbox', synthetic: true } });
    expect(JSON.stringify(prov), 'the provisioning answer carries no token').not.toMatch(/token/i);
    // THE WORKFLOW DEFINITION whose transition declares depends_on, and an instance on it (the chief of staff)
    const spec = { states: ['drafted', 'review', 'approved'], initial: 'drafted', terminal: ['approved'],
      transitions: [{ from: 'drafted', event: 'submit', to: 'review' }, { from: 'review', event: 'approve', to: 'approved', depends_on: ['review'] }] };
    ok(await as(chief, '/executive/workflow/definitions/publish', 'executive.workflow.define', 'WFD', null,
      { def_key: DEF_KEY, spec, owner: chief.principalId, escalation: dadmin.principalId, reason: 'the B36 dependency definition: approve depends_on the review step\'s tasks (e2e, SYNTHETIC)' }, 'executive'), 'the definition published');
    ok(await as(chief, '/executive/workflow/instances/start', 'executive.workflow.start', 'WFI', null,
      { def_key: DEF_KEY, subject: { kind: 'decision_package', id: pkgId }, start_key: `b36-deps-1-${run}` }, 'executive'), 'the instance started');
    // THE EXPOSURE (F-P4-13): the taxonomy published and activated by two people; the corridor risk declared, registered, assessed and
    // ACCEPTED by its owner; its MITIGATION response opened — a decision package (left at its opening: a choice binds a twin, which this
    // walk does not seed — the gates walk does; the outcome itself rests on a twin element beyond every gate route).
    ok(await as(executive, '/prediction/exposures/taxonomy/publish', 'prediction.exposure.taxonomy.publish', 'RSK', null,
      { expectedVersion: 0, categories: [{ key: 'supply_chain', label: 'Supply chain', polarity: 'risk' }, { key: 'sourcing', label: 'Sourcing', polarity: 'opportunity' }], reason: 'the first taxonomy of the domain (e2e)' }, 'prediction'), 'the taxonomy published');
    ok(await as(dadmin, '/prediction/exposures/taxonomy/activate', 'prediction.exposure.taxonomy.activate', 'RSK', null, { version: 1, reason: 'reviewed against the risk policy (e2e)' }, 'prediction'), 'the taxonomy activated');
    RSK = await declare(dadmin, 'RSK', RSK_TITLE, [{ kind: 'entity', id: crypto.randomUUID(), rationale: 'SYNTHETIC entity reference (the browser gate seeds no graph)' }]);
    ok(await as(analyst, '/prediction/exposures/register', 'prediction.exposure.register', 'RSK', RSK,
      { strategyObjectId: RSK, polarity: 'risk', category: 'supply_chain', owner: riskOwner.principalId, reviewEveryDays: 30 }, 'prediction'), 'the exposure registered');
    const ass = ok(await as(analyst, `/prediction/exposures/${RSK}/assess`, 'prediction.exposure.assess', 'RSK', RSK,
      { expectedVersion: 0, assessment: { mechanism: 'A closure delays the magnet shipments beyond the buffer (e2e)', probability: { low: 0.3, high: 0.6 },
        impact: { low: 400000, high: 900000, unit: 'EUR' }, horizon: '2024-Q1', options: [{ key: 'reroute', label: 'Reroute via the Cape', kind: 'mitigate', class: 'no_regret' }] } }, 'prediction'), 'the exposure assessed');
    const assDigest = (ass as { assessment: { digest: string } }).assessment.digest;
    ok(await as(riskOwner, `/prediction/exposures/${RSK}/versions/1/accept`, 'prediction.exposure.accept', 'RSK', RSK, { digest: assDigest, rationale: 'The bracket matches the carrier notices; accepted (e2e)' }, 'prediction'), 'the assessment accepted');
    // the response's DEC and package are declared by those who hold their acts (the route otherwise chains graph.strategy.declare and
    // decision.package.declare as the responder — a risk owner holds neither; the governed principal route binds one role); the owner links them
    const RDEC = await declare(dadmin, 'DEC', `Mitigate the corridor closure (e2e ${run})`, [{ kind: 'strategy', id: RSK, rationale: 'the response decides on this exposure' }]);
    const rpkg = ok(await as(caseOwner, '/decisions/declare', 'decision.package.declare', 'DPK', null,
      { decisionObjectId: RDEC, title: `Mitigate the corridor closure (e2e ${run})`, statement: 'reroute the magnet shipments via the Cape (e2e)', owner: caseOwner.principalId }, 'decision'), 'the response package declared');
    const resp = ok(await as(riskOwner, `/prediction/exposures/${RSK}/decisions/open`, 'prediction.exposure.respond', 'RSK', RSK,
      { kind: 'mitigate', decision: { decisionObjectId: RDEC, packageId: (rpkg as { package: { packageId: string } }).package.packageId } }, 'prediction'), 'the response opened');
    expect((resp as { response: { package_id: string } }).response.package_id, 'the response linked the decision package').toBe((rpkg as { package: { packageId: string } }).package.packageId);
  });

  test('1. /decisions/workspaces — the grant surface: the workspace, its participants, the invitation delivered to the SYNTHETIC mailbox; the tenant administrator reads the mailbox through the chooser (the code inside, never the token)', async ({ page }) => {
    // the case owner: the workspace, the reviewer, the grant line with its delivery state
    await uiLogin(page, caseOwner.username, PW);
    await openWorkspaces(page);
    const ws = page.getByRole('region', { name: 'The selected workspace' });
    await expect(ws).toContainText(`purpose ${PURPOSE} · ceiling internal`);
    await expect(ws).toContainText('you: member (reading at internal)');
    await expect(ws).toContainText(`${short8(chief.principalId)}`);
    await expect(ws).toContainText('R. Haddad — customs broker, partner firm (SYNTHETIC)');
    const delivery = ws.getByLabel(`delivery of ${GRANT}`);
    await expect(delivery).toContainText('delivered to the SYNTHETIC mailbox · code expires in');
    await expect(ws.getByRole('button', { name: 'Read the synthetic mailbox' })).toHaveCount(0); // not an identity administrator
    await expect(ws).toContainText(`invited · expires in`);
    // THE TENANT ADMINISTRATOR (no home domain): the working-domain chooser, then the mailbox — the identity authority's read (audited)
    await uiLogin(page, tadmin.username, PW);
    await page.goto('/decisions/workspaces');
    await expect(page.getByRole('heading', { name: 'Working domain' })).toBeVisible();
    await page.locator('#wd-domain').selectOption(D);
    await page.getByRole('button', { name: 'Open this domain' }).click();
    await openWorkspaces(page);
    const wsA = page.getByRole('region', { name: 'The selected workspace' });
    await wsA.getByRole('button', { name: 'Read the synthetic mailbox' }).click();
    const message = page.getByRole('region', { name: 'synthetic mailbox message' });
    await expect(message).toBeVisible();
    await expect(message).toContainText('SYNTHETIC mailbox');
    await expect(message).toContainText(/one-time pickup code/);
    await expect(message).toContainText(GRANT);
    await expect(message).toContainText(/[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/);
    await expect(message).toContainText(`/login?invitation=${GRANT}`);
    expect((await message.textContent()) ?? '', 'the token is never in the mailbox').not.toMatch(/invitation token|eyJ/i);
  });

  test('2. /decisions/tasks — the holder declares that B waits on A; B offers no Complete until A closes; A completed from the page releases B', async ({ page }) => {
    await uiLogin(page, chief.username, PW);
    await openTasks(page);
    const a = taskCard(page, TASK_A); const b = taskCard(page, TASK_B);
    await expect(a.getByRole('heading', { name: TASK_A_TITLE, level: 2 })).toBeVisible();
    await expect(b.getByRole('heading', { name: TASK_B_TITLE, level: 2 })).toBeVisible();
    await expect(b.getByLabel(`waits on ${TASK_B}`)).toHaveText('This task waits on nothing');
    // THE DECLARATION (PR-46-002; the holder declares): B waits on A — finish-to-start
    await b.locator(`#dep-${TASK_B}`).fill(TASK_A);
    await b.getByRole('button', { name: 'Declare', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: `waits on ${short8(TASK_A)} — released when it closes` })).toBeVisible();
    await expect(b.getByLabel(`waits on ${TASK_B}`)).toHaveText(`This task waits on "${TASK_A_TITLE}" (open) — completed when they are`);
    await expect(b.getByText('Complete is offered when what this task waits on has closed (the server refuses it until then: task rejected (dependency)).')).toBeVisible();
    await expect(b.getByRole('button', { name: 'Complete', exact: true })).toHaveCount(0);
    await expect(a.getByLabel(`waits on ${TASK_A}`)).toHaveText('This task waits on nothing');
    await expect(a.getByRole('button', { name: 'Complete', exact: true })).toBeVisible();
    // THE RELEASE: A completed from the page → B released (its waits-on met) → Complete offered on B
    await a.locator(`#note-${TASK_A}`).fill('the customs brief reviewed (e2e, SYNTHETIC)');
    await a.getByRole('button', { name: 'Complete', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'completed' })).toBeVisible();
    await page.getByLabel('include closed tasks').check();
    await expect(taskCard(page, TASK_A)).toContainText('COMPLETED');
    const bAfter = taskCard(page, TASK_B);
    await expect(bAfter.getByLabel(`waits on ${TASK_B}`)).toHaveText('This task waits on nothing'); // the unmet prerequisites: none since A closed
    await expect(bAfter.getByRole('button', { name: 'Complete', exact: true })).toBeVisible();
    await expect(page.getByText(/committed — POL/).first()).toBeVisible();
  });

  test('3. /decisions/workflow — the definition whose transition declares depends_on, listed with its reason; the instance started on it', async ({ page }) => {
    await uiLogin(page, chief.username, PW);
    await page.goto('/decisions/workflow');
    await expect(page.getByRole('heading', { name: 'Workflow', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Definitions' })).toBeVisible();
    const def = page.locator('li').filter({ hasText: DEF_KEY });
    await expect(def).toContainText(`${DEF_KEY} v1 ·`);
    await expect(def).toContainText('pins 1 running of 1');
    await expect(def).toContainText('approve depends_on the review step\'s tasks (e2e, SYNTHETIC)');
    await expect(page.getByText(/depends_on/).first()).toBeVisible();
    const instance = page.getByRole('row').filter({ hasText: `${DEF_KEY} v1` });
    await expect(instance).toContainText('drafted');
    await expect(instance).toContainText('free');
  });

  test('4. /prediction/exposures — the outcome → learn panel: the mitigation response monitored, its decision committed, what is owed said; no outcome is faked', async ({ page }) => {
    await uiLogin(page, riskOwner.username, PW);
    await page.goto('/prediction/exposures');
    await expect(page.getByRole('heading', { name: 'Risk and opportunity', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: RSK_TITLE, exact: true }).click();
    await expect(page.getByRole('heading', { name: new RegExp(RSK_TITLE.replace(/[()]/g, '.')) })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Responses — the decisions and their outcomes' })).toBeVisible();
    await expect(page.getByText(/^mitigate — decision .* package .* · no outcome recorded yet$/)).toBeVisible();
    const monitored = page.getByRole('list', { name: 'responses monitored' });
    await expect(monitored).toBeVisible();
    await expect(monitored).toContainText('mitigate · monitor: decision_open — owed: the response\'s decision is committed first');
    // the review and the learn step follow an outcome, which rests on a twin's observed element: not reached on this gate (the file's header) — nothing rendered claims otherwise
    await expect(monitored.getByRole('button', { name: 'Review the outcome' })).toHaveCount(0);
    await expect(monitored.getByLabel('learn step')).toHaveCount(0);
    await expect(monitored.getByLabel('learning')).toHaveCount(0);
  });
});
