/**
 * CP-6 B36 browser walk (part A; STAGES.csv B36 condition (p)) — THE ATTENTION COMPLETION through the real interface on the gate's fresh
 * database (the hosted form of e2e/phase6-b36-attention.demo.spec.ts, which reads the demonstration and is not run by this gate):
 *
 *   the EXECUTIVE publishes the attention policy with its governance fields (the fairness floor, the staleness ceiling) — seeded by the API —
 *   and opens the queue: THE CONTEXT STRIP (UX-44-002) names the context in force (the default: the whole domain, 90 days, effective now),
 *   the POLICY LINE names the version and its governance, the FILTERED LINE counts what the context filtered (nothing: nothing is in the
 *   queue), no hold banner; the executive publishes the NEXT policy version from the page → the strip names version 2 →
 *   the CHIEF OF STAFF (executive_operator) opens THE RECOVERY ROUTES PAGE (UX-44-005): the five degraded states, each with its meaning and
 *   its route, DEGRADED or nominal as the server detects them from its ledgers; RUNS the re-tick route → the run recorded with the state
 *   before and after; the executive runs the re-evaluate route → recorded; the SYNTHETIC settle-fault fixture is offered (not armed here) →
 *   THE FORUMS section stands beside the strip → the B24 panels (the evaluation, the governance, the markers, the deprioritized view).
 *
 * A PRODUCT DEFECT this walk found and does not paper over (reported, not fixed here): every forum request of the attention page —
 * the list, the convene, a forum's queue (apps/web/lib/attention-b36.ts: `p(..., 'ROOM')`) — carries object_type 'ROOM', which the envelope
 * contract refuses before any route runs (packages/contracts/src/envelope.ts: object_type `^[A-Z]{3}$|^[a-z][a-z0-9_-]{1,63}$`): the page
 * reads "not listed — HTTP 400 EYE-REQ-001 — Request cannot be interpreted under declared contract" and a convene from the page answers the
 * same. The forums (V01-T-028) are the harness's F1 (in-process, where no envelope contract is checked); this walk asserts the section only.
 *
 * What this gate CANNOT reach, said here rather than faked: an attention ITEM. Items enter the queue only through the subscription
 * dispatcher's consumers (apps/api/src/executive/attention/attention.consumers.ts — the ONLY callers of the item writer), which run when
 * the scheduler is enabled (eye.scheduler.enabled, off in this gate's API: the honest condition the projections walk pins), or through the
 * tick's strategy detections, ticked on demand only in the test runtime (attention-b36.service.ts recover → timer.tickNow under
 * eye.runtime.env = test; this gate runs 'local'). So the ACT PANEL (launch, settle, resume), ACCEPT-PRIORITY with its signature and the
 * HOLD BANNER with its release — each needing an item — are the harness's (apps/api/test/int/phase6-attention-b36.test.ts) and the
 * demonstration walk's; the panels' headings and their honest empty states are asserted here.
 *
 * The seeding is the API's, in the Phase 1 idiom: this suite makes its own tenant, ONE domain and three DOMAIN principals with a per-run
 * password; the attention agent is registered by the platform administrator (its identity is the runtime's timer's — the method text
 * copied from apps/api/src/executive/attention/timer-identity.ts, because the browser gate cannot import the API's source). No sink runs:
 * every class notifies in_app.
 *
 * The selectors are the pages' own (apps/web/app/decisions/attention/page.tsx, context-strip.tsx, recovery/page.tsx, forums-panel.tsx):
 * the heading "The queue's context", data-testid="context-line" / "policy-line" / "filtered-line" / "hold-banner"; the heading
 * "Queue (N in the domain)"; the section `policy-h` with #pub-reason and "Publish the version"; the recovery page's heading "Attention
 * recovery", "Degraded states — N of 5 active", data-testid="state-<state>", the buttons "Run <route>", the status "<route>: …", the
 * "Route runs" table's data-testid="route-run", the heading "Synthetic fixture: a settle fault"; the forums section `forums-h` (Title,
 * Members, Cadence, "Convene the forum", data-testid="forum-row" / "forum-queue").
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
const PW = `At36!${crypto.randomUUID()}`;
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

/**
 * THE ATTENTION TIMER'S IDENTITY (apps/api/src/executive/attention/timer-identity.ts, copied: the browser gate cannot import the API's
 * source): the agent is registered with the version and the code digest of the runtime's timer; a registration naming another digest is a
 * DRIFTED agent whose tick is refused. Kept in sync with the source by hand — a drift here shows on the recovery page's tick_stalled detail.
 */
const ATTENTION_TIMER_VERSION = '1.0.0';
const METHOD_TEXT = 'one tick per domain on the cadence (exec:{t}:{d}:attention) under the attention agent\'s own session; the governed write executive.attention.tick runs the '
  + 'registered steps in order (escalate 10 → executive.escalate_attention_due; rebalance 20; deliveries 30 → plan the deliveries of the routed, escalated and unrouted '
  + 'items over the channels of the item\'s own policy version, then drain the due attempts through the channel adapters — in_app and the SYNTHETIC demo-mailbox); '
  + 'executive.attention_ticks keeps one tick per (tenant, domain, floor(epoch of the scheduled instant / cadence)); a duplicate answers repeated';
const ATTENTION_TIMER_DIGEST = createHash('sha256').update(`executive.attention.timer@${ATTENTION_TIMER_VERSION}:${METHOD_TEXT}`, 'utf8').digest('hex');

async function api(path: string, over: Record<string, unknown>, payload: unknown = {}, token?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const envelope = {
    message_id: crypto.randomUUID(),
    scope: 'PLATFORM', tenant_id: null, domain_id: null,
    principal_id: 'anonymous', purpose_id: 'executive',
    action: 'x', side_effect_class: 'reversible', consequence_class: 'C2',
    object_type: 'ATP', object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(), trace_id: 'e2e-b36a',
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
let admin: Ctx; let executive: Ctx; let dadmin: Ctx; let operator: Ctx;
let T = ''; let D = '';

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
const as = (who: Ctx, path: string, action: string, objectType: string, objectId: string | null, payload: unknown, purpose = 'executive') =>
  api(`/v1/tenants/${T}/domains/${D}${path}`, { action, scope: 'DOMAIN', tenant_id: T, domain_id: D, object_type: objectType, object_id: objectId, principal_id: `principal:${who.principalId}`, purpose_id: purpose }, payload, who.token);
const ok = (r: { status: number; body: Record<string, unknown> }, what: string, status = 201) => { expect(r.status, `${what}: ${JSON.stringify(r.body).slice(0, 400)}`).toBe(status); return r.body; };

/** The policy (the B36 harness's classes, every one notified in_app — no sink runs on this gate) with the governance fields. */
const RULES = (governance: Record<string, unknown>) => ({
  classes: {
    'warning.raised': { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 60, escalate_to_roles: ['executive'], max_escalations: 1, notify: 'in_app' },
    'opportunity.raised': { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['opportunity_sponsor', 'strategy_owner'], ack_within_minutes: 1440, escalate_to_roles: ['executive'], max_escalations: 1, notify: 'in_app' },
    'source.coverage_loss': { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['domain_analyst'], ack_within_minutes: 1440, notify: 'in_app' },
    'proposal.review': { materiality: { min_consequence: 'C1', min_confidence: 0.3 }, route_roles: ['domain_analyst'], ack_within_minutes: 1440, notify: 'in_app' },
    'queue.governance': { materiality: { min_consequence: 'C3', min_confidence: 0.5 }, route_roles: ['executive'], ack_within_minutes: 1440, notify: 'in_app' },
  },
  governance,
});

/* ───────────────────────── the page's own selectors ───────────────────────── */
const section = (page: Page, id: string): Locator => page.locator(`section[aria-labelledby="${id}"]`);
const status = (page: Page, re: RegExp) => page.getByRole('status').filter({ hasText: re });
async function openAttention(page: Page): Promise<void> {
  await page.goto('/decisions/attention');
  await expect(page.getByRole('heading', { name: 'Attention', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The queue\'s context' })).toBeVisible();
}
async function openRecovery(page: Page): Promise<void> {
  await page.goto('/decisions/attention/recovery');
  await expect(page.getByRole('heading', { name: 'Attention recovery', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Degraded states — \d of 5 active/ })).toBeVisible();
}
const STATES = ['delivery_sink_down', 'tick_stalled', 'policy_invalid', 'evaluation_stale', 'hold'] as const;

test.describe.configure({ mode: 'serial' });

test.describe('CP-6 B36 — the attention completion: the context strip, the policy in force, the recovery routes, a forum, the B24 panels', () => {
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
      { name: `E2E B36 Attention ${run}`, residencyProfile: 'EU' }, admin.token);
    expect(t.status).toBe(201);
    T = (t.body as { tenant: { id: string } }).tenant.id;
    const d = await api(`/v1/tenants/${T}/domains`, { action: 'tenancy.domain.create', scope: 'TENANT', tenant_id: T, object_type: 'CID', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { name: `B36 Attention ${run}` }, admin.token);
    expect(d.status).toBe(201);
    D = (d.body as { domain: { id: string } }).domain.id;
    // THREE people: the executive (publishes the policy, releases a hold, re-evaluates), the domain administrator (the agent's escalation),
    // the chief of staff (executive_operator: runs the recovery routes, convenes the forums).
    executive = await person(`a36-exec-${run}`, 'executive');
    dadmin = await person(`a36-dadmin-${run}`, 'domain_admin');
    operator = await person(`a36-chief-${run}`, 'executive_operator');
    // THE ATTENTION AGENT (the tick's host), registered by the platform administrator with the runtime timer's identity — it ticks only under
    // the scheduler, which this gate does not run: tick_stalled is the honest state the recovery page reads.
    ok(await api(`/v1/tenants/${T}/domains/${D}/agents/decision/register`,
      { action: 'agent.register', scope: 'DOMAIN', tenant_id: T, domain_id: D, object_type: 'AGT', principal_id: `principal:${admin.principalId}`, purpose_id: 'platform.administration' },
      { kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId,
        budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 3600 } }, admin.token), 'the attention agent registered');
    // THE POLICY v1 with its governance fields (PR-44-005): the fairness floor and the staleness ceiling the strip names.
    ok(await as(executive, '/executive/attention/policy/publish', 'executive.attention.policy.publish', 'ATP', null,
      { rules: RULES({ fairness_floor: 0.7, staleness_ceiling_hours: 168 }), reason: 'the B36 classes with the governance floor and ceiling (e2e)' }), 'the policy published');
  });

  test('1. the context strip: the context in force, the policy line with its governance, what the context filtered (nothing to filter), no hold; the next version published from the page', async ({ page }) => {
    await uiLogin(page, executive.username, PW);
    await openAttention(page);
    const context = page.getByTestId('context-line');
    await expect(context).toContainText('Context: the whole domain · horizon 90d · no scenario');
    await expect(context).toContainText('effective now · the default (no context set)');
    await expect(page.getByTestId('policy-line')).toContainText(/Policy: policy version 1 \([0-9a-f]{12}…\) — fairness floor 0\.7, staleness ceiling 168 h/);
    await expect(page.getByTestId('filtered-line')).toContainText('0 item(s) served; none filtered by the context. Ranked under context digest none (the default context).');
    await expect(page.getByTestId('hold-banner')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Queue (0 in the domain)' })).toBeVisible();
    // the policy section names the same version; the executive publishes the next one from the page (the rules as seeded, a reason)
    const policy = section(page, 'policy-h');
    await expect(policy.getByRole('heading', { name: /^Policy — version 1$/ })).toBeVisible();
    // a version records a CHANGE (the server refuses unchanged rules): the staleness ceiling raised to 200 h in the rules as seeded
    const rules = JSON.parse(await page.locator('#pub-rules').inputValue()) as { governance: Record<string, unknown> };
    expect(rules.governance).toMatchObject({ fairness_floor: 0.7, staleness_ceiling_hours: 168 });
    rules.governance['staleness_ceiling_hours'] = 200;
    await page.locator('#pub-rules').fill(JSON.stringify(rules, null, 2));
    await page.locator('#pub-reason').fill('the staleness ceiling raised to 200 h from the attention page (e2e)');
    await policy.getByRole('button', { name: 'Publish the version' }).click();
    await expect(page.getByText(/committed — POL/).first()).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('policy-line')).toContainText(/Policy: policy version 2 \([0-9a-f]{12}…\) — fairness floor 0\.7, staleness ceiling 200 h/);
    await expect(section(page, 'policy-h').getByRole('heading', { name: /^Policy — version 2$/ })).toBeVisible();
  });

  test('2. the recovery routes page: the five degraded states as the server detects them; the chief of staff runs re-tick, the executive re-evaluate — each run recorded; the fixture offered', async ({ page }) => {
    await uiLogin(page, operator.username, PW);
    await openRecovery(page);
    for (const s of STATES) {
      const row = page.getByTestId(`state-${s}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(/DEGRADED|nominal/);
    }
    // no tick has run on this gate (no scheduler): tick_stalled is DEGRADED and names the agent; the hold is nominal and its route is the release
    await expect(page.getByTestId('state-tick_stalled')).toContainText('DEGRADED');
    await expect(page.getByTestId('state-tick_stalled')).toContainText('re-tick');
    await expect(page.getByTestId('state-hold')).toContainText('nominal');
    await expect(page.getByTestId('state-hold')).toContainText('released on the attention page by the executive');
    await expect(page.getByRole('heading', { name: 'Route runs' })).toBeVisible();
    await expect(page.getByText('No route has been run in this domain.')).toBeVisible();
    // RE-TICK by the chief of staff: the run recorded — the state before and after, the outcome in the server's words (no tick on demand outside the test runtime)
    await page.getByLabel('Note for the run (optional)').fill('the timer has not ticked on this gate (e2e)');
    await page.getByTestId('state-tick_stalled').getByRole('button', { name: 'Run re-tick' }).click();
    await expect(status(page, /^re-tick: /)).toBeVisible();
    const runs = page.getByTestId('route-run');
    await expect(runs).toHaveCount(1);
    await expect(runs.first()).toContainText('tick_stalled');
    await expect(runs.first()).toContainText('re-tick');
    await expect(runs.first()).toContainText(`${operator.principalId.slice(0, 8)}…`);
    await expect(runs.first()).toContainText('“the timer has not ticked on this gate (e2e)”');
    await expect(page.getByTestId('state-tick_stalled')).toContainText(`by ${operator.principalId.slice(0, 8)}…`);
    await expect(page.getByText(/committed — POL/)).toBeVisible();
    // RE-EVALUATE by the executive (the operator is refused at the evaluation's own PDP — the harness pins it): the queue evaluated, the run recorded
    await uiLogin(page, executive.username, PW);
    await openRecovery(page);
    await expect(page.getByTestId('route-run')).toHaveCount(1);
    await page.getByTestId('state-evaluation_stale').getByRole('button', { name: 'Run re-evaluate' }).click();
    await expect(status(page, /^re-evaluate: /)).toBeVisible();
    await expect(page.getByTestId('route-run')).toHaveCount(2);
    await expect(page.getByTestId('route-run').filter({ hasText: 'evaluation_stale' })).toContainText(`${executive.principalId.slice(0, 8)}…`);
    // THE SYNTHETIC FIXTURE is offered — a one-shot fault in the API process; not armed here (no act follows on this gate)
    await expect(page.getByRole('heading', { name: 'Synthetic fixture: a settle fault' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Arm the settle fault (synthetic)' })).toBeVisible();
  });

  test('3. the forums section stands beside the strip; the B24 panels on the gate\'s empty queue', async ({ page }) => {
    await uiLogin(page, operator.username, PW);
    await openAttention(page);
    const forums = section(page, 'forums-h');
    await expect(forums.getByRole('heading', { name: 'Forums' })).toBeVisible();
    await expect(forums.getByRole('heading', { name: 'Convene a forum' })).toBeVisible();
    await expect(forums.getByRole('button', { name: 'Convene the forum' })).toBeVisible();
    // The forums' requests of the page are refused by the envelope contract before any route runs (see the file's header); the convening and
    // the forum's queue are the harness's F1 — nothing is asserted here that the page cannot honestly show.
    // THE B24 PANELS on the gate's empty queue: the evaluation, the governance, the markers, the deprioritized view
    await uiLogin(page, executive.username, PW);
    await openAttention(page);
    await expect(section(page, 'evaluation-h').getByRole('heading', { name: 'Queue evaluation' })).toBeVisible();
    const gov = section(page, 'governance-h');
    await expect(gov.getByRole('heading', { name: 'Suppression requests' })).toBeVisible();
    await expect(gov.getByRole('heading', { name: 'Delegations' })).toBeVisible();
    await expect(section(page, 'markers-h').getByRole('heading', { name: 'Source-impact markers' })).toBeVisible();
    await expect(section(page, 'deprioritized-h').getByRole('heading', { name: 'Deprioritized — and why' })).toBeVisible();
    // THE ACT PANEL and ACCEPT-PRIORITY open from an item; the queue holds none on this gate (see the file's header) — nothing is faked
    await expect(page.getByRole('heading', { name: 'Act on this item' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Accept the priority' })).toHaveCount(0);
  });
});
