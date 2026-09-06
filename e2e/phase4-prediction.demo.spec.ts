/**
 * PHASE 4 — the Prediction screens, exercised in a browser against the seeded
 * demonstration (acts I–IV on a fresh database).
 *
 * What is asserted is what the correction pass changed on screen: the
 * validation badge that says RETROSPECTIVE when that is all the record can say;
 * the inherited controls; the backtest knowledge MODE; the branch's decision
 * deadline; and a replayed warning whose window is dated in the replay, with the
 * audit clock beside it and its timeliness against the deadline.
 *
 * Runs through playwright.demo.config.ts only. Screenshots go to EYE_SHOTS.
 */
import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const API = process.env['EYE_API_BASE'] ?? 'http://localhost:3401';

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase4-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

/* ── the governed API, for SEEDING the states the screens must then show ── */
const jcs = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x as Record<string, unknown>).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
const digest = (v: unknown) => createHash('sha256').update(jcs(v ?? {}), 'utf8').digest('hex');
interface Session { token: string; principalId: string; tenantId: string; domainId: string }
async function post(path: string, envelope: Record<string, unknown>, payload: unknown, token: string) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ envelope: { message_id: crypto.randomUUID(), issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: crypto.randomUUID(), trace_id: 'e2e', schema_version: 'v1', payload_digest: digest(payload ?? {}), ...envelope }, payload }) });
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}
async function login(username: string, password: string): Promise<Session> {
  const r = await post('/v1/auth/login', { scope: 'PLATFORM', tenant_id: null, domain_id: null, principal_id: 'anonymous', purpose_id: 'authentication',
    action: 'identity.session.create', side_effect_class: 'reversible', consequence_class: 'C1', object_type: 'SES' }, { username, password }, '');
  if (r.status !== 200 && r.status !== 201) throw new Error(`login failed (${r.status})`);
  const b = (r.body.bindings ?? []).find((x: { tenantId: string | null; domainId: string | null }) => x.tenantId && x.domainId) ?? r.body.scope ?? {};
  return { token: r.body.tokens.accessToken, principalId: r.body.principalId, tenantId: b.tenantId, domainId: b.domainId };
}
const P = (s: Session) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction`;
const fo = (s: Session, action: string, objectType: string, objectId: string | null = null) => ({
  scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, principal_id: `principal:${s.principalId}`, purpose_id: 'prediction',
  action, side_effect_class: 'reversible', consequence_class: 'C2', object_type: objectType, object_id: objectId });

/** A fresh downside branch on the corridor, flipped in REPLAY; returns its warning id. */
async function seedReplayWarning(s: Session, title: string, over: Record<string, unknown> = {}): Promise<{ warningId: string; indicatorId: string }> {
  const series = 'portwatch:chokepoint4:n_total';
  const ind = await post(`${P(s)}/indicators/define`, fo(s, 'prediction.indicator.define', 'IND'),
    { seriesKey: series, description: `${title}: transits below 41 for five consecutive published observations`, comparator: '<', threshold: 41, consecutiveDays: 5, owner: s.principalId }, s.token);
  if (ind.status >= 300) throw new Error(`indicator refused (${ind.status}) ${ind.body.message ?? ''}`);
  const indicatorId = ind.body.indicator.indicatorId as string;
  const scn = await post(`${P(s)}/scenarios/declare`, fo(s, 'prediction.scenario.declare', 'SCN'), {
    title, statement: 'seeded by the browser check', forecastId: null, owner: s.principalId, reviewCadence: 'weekly',
    branches: [
      { name: 'Baseline', kind: 'baseline', statement: 'as booked', owner: s.principalId, consequence: 'keep the booked routing', responseWindowHours: 72 },
      { name: 'Corridor collapse', kind: 'downside', statement: 'transits stay below 41/day', indicatorId, owner: s.principalId, responseWindowHours: 48,
        consequence: 'rebook shipment SYN-SHIP-4468 via the Cape before the booking deadline closes', decisionDeadline: '2024-01-22T00:00:00Z', ...over },
    ] }, s.token);
  if (scn.status >= 300) throw new Error(`scenario refused (${scn.status}) ${scn.body.message ?? ''}`);
  const ev = await post(`${P(s)}/indicators/${indicatorId}/evaluate`, fo(s, 'prediction.indicator.evaluate', 'IND', indicatorId), { confidence: 0.85, timing: 'replay' }, s.token);
  if (ev.status >= 300) throw new Error(`evaluation refused (${ev.status}) ${ev.body.message ?? ''}`);
  const warningId = ev.body.warnings?.[0]?.warningId as string | undefined;
  if (warningId === undefined) throw new Error(`the seeded branch did not flip (${JSON.stringify(ev.body.evaluation)})`);
  return { warningId, indicatorId };
}

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('Phase 4 — Prediction screens as the forecast owner', () => {
  test.beforeEach(async ({ page }) => {
    await uiLogin(page, 'n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
  });

  test('overview counts validated forecasts by both modes', async ({ page }) => {
    await page.goto('/prediction');
    await expect(page.getByRole('heading', { name: 'Prediction' })).toBeVisible();
    await expect(page.getByText(/validated \(historical or retrospective\)/)).toBeVisible();
    await expect(page.getByText(/1 validated retrospective/)).toBeVisible();
    await shot(page, '01-overview');
  });

  test('a forecast shows VALIDATED RETROSPECTIVELY, never VALIDATED, and the controls it inherited', async ({ page }) => {
    await page.goto('/prediction/forecasts');
    const ecb = page.getByRole('row').filter({ hasText: 'ecb-eurusd' }).first();
    await expect(ecb).toBeVisible();
    await expect(ecb.getByText('VALIDATED RETROSPECTIVELY', { exact: false })).toBeVisible();
    await ecb.getByRole('button', { name: 'ecb-eurusd' }).click();
    const detail = page.locator('section[aria-labelledby="fct-h"]');
    await expect(detail).toBeVisible();
    await expect(detail.getByText(/not historical-knowledge validation/).first()).toBeVisible();
    await expect(detail.getByText(/RETROSPECTIVE: one evidence vintage/).first()).toBeVisible();
    await expect(detail.getByText(/classification/).first()).toBeVisible();
    await expect(detail.getByText(/applicable backtest \(retrospective\)/)).toBeVisible();
    // The corridor forecast cannot be validated and is a replay demonstration.
    const corridor = page.getByRole('row').filter({ hasText: 'portwatch:' }).first();
    await expect(corridor.getByText('CANNOT BE VALIDATED', { exact: false })).toBeVisible();
    await expect(corridor.getByText('REPLAY DEMONSTRATION')).toBeVisible();
    await shot(page, '02-forecasts');
  });

  test('the calibration screen labels every backtest with its knowledge mode', async ({ page }) => {
    await page.goto('/prediction/calibration');
    await expect(page.getByRole('columnheader', { name: 'Mode', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'historical', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'retrospective', exact: true }).first()).toBeVisible();
    await expect(page.getByText(/CANNOT VALIDATE \(historical\): 0 of 40 origin/)).toBeVisible();
    await shot(page, '03-calibration');
  });

  test('the scenario tree shows the flipped branch with its decision deadline', async ({ page }) => {
    await page.goto('/prediction/scenarios');
    await expect(page.getByRole('columnheader', { name: 'Window · deadline' }).first()).toBeVisible();
    const flipped = page.getByRole('row').filter({ hasText: 'FLIPPED' }).first();
    await expect(flipped).toBeVisible();
    await expect(flipped.getByText(/by .*2024/)).toBeVisible();
    // The baseline branch declared no deadline: T3 is unmeasured for it, and the screen says so.
    await expect(page.getByText('no deadline · T3 unmeasured').first()).toBeVisible();
    await shot(page, '04-scenarios');
  });

  test('a replayed warning is dated in the replay, audited now, and timely against its deadline', async ({ page }) => {
    await page.goto('/prediction/warnings');
    await expect(page.getByRole('columnheader', { name: 'Raised as of' })).toBeVisible();
    // Act IV's own warning, not one of the branches the action-path checks below seed on reruns.
    const row = page.getByRole('row').filter({ hasText: 'Bab el-Mandeb Strait over the next 30 days' }).filter({ hasText: 'REPLAY' }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText('● issued in time')).toBeVisible();
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="wrn-h"]');
    await expect(detail.getByText(/REPLAY · raised as of .*2024/).first()).toBeVisible();
    await expect(detail.getByText(/\(recorded .*2026/).first()).toBeVisible();
    await expect(detail.getByText(/before the decision deadline/).first()).toBeVisible();
    await expect(detail.getByText(/one warning per flip/)).toBeVisible();
    await expect(detail.getByText(/classification/).first()).toBeVisible();
    await shot(page, '05-warnings');
  });

  test('the API is HEALTHY behind the banner-free shell: /readyz is inspected, not assumed', async ({ page }) => {
    const r = await fetch(`${API}/readyz`);
    const body = await r.json() as Record<string, unknown>;
    expect(r.status, JSON.stringify(body)).toBe(200);
    expect(body['status']).toBe('ok');
    expect(body['audit']).not.toBe('degraded');
    await page.goto('/prediction/warnings');
    await expect(page.getByText(/DEGRADED/)).toHaveCount(0);
  });

  test('ACTION: a replayed warning is acknowledged AS OF a replay instant inside its window — recorded in time', async ({ page }) => {
    const s = await login('n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
    const title = `Browser check · in time · ${Date.now().toString(36)}`;
    await seedReplayWarning(s, title);
    await page.goto('/prediction/warnings');
    await page.getByRole('button', { name: new RegExp(title) }).click();
    const detail = page.locator('section[aria-labelledby="wrn-h"]');
    await expect(detail.getByText(/open in the replay/)).toBeVisible();
    await detail.getByLabel('What you did about it').fill('rebooked SYN-SHIP-4468 via the Cape');
    await detail.getByLabel(/Answered as of/).fill('2024-01-18T09:00:00Z');
    await detail.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(page.getByText(/^acknowledged — /)).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: title }).first();
    await expect(row.getByText(/acknowledged in time — as of 2024-01-18/)).toBeVisible();
    await expect(row.getByText(/recorded 2026/)).toBeVisible();
    await expect(row.getByText('● issued in time')).toBeVisible();
    await shot(page, '06-acknowledged-in-time');
  });

  test('ACTION: a response AFTER the window is recorded as LATE — issuance stays timely', async ({ page }) => {
    const s = await login('n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
    const title = `Browser check · late · ${Date.now().toString(36)}`;
    await seedReplayWarning(s, title);
    await page.goto('/prediction/warnings');
    await page.getByRole('button', { name: new RegExp(title) }).click();
    const detail = page.locator('section[aria-labelledby="wrn-h"]');
    await detail.getByLabel('What you did about it').fill('rebooked, but only on the 25th');
    await detail.getByLabel(/Answered as of/).fill('2024-01-25T09:00:00Z');
    await detail.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(page.getByText(/^acknowledged late — /)).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: title }).first();
    await expect(row.getByText(/acknowledged LATE — as of 2024-01-25/)).toBeVisible();
    await expect(row.getByText('● issued in time')).toBeVisible();
    await shot(page, '07-acknowledged-late');
  });

  test('STATE: a replayed window nobody answered is EXPIRED by the replay clock, and cannot be acknowledged', async ({ page }) => {
    const s = await login('n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
    const title = `Browser check · expired · ${Date.now().toString(36)}`;
    // A six-hour window: the replay's newest observation is 2024-01-17, so its clock (end of that day) closes it.
    const { indicatorId } = await seedReplayWarning(s, title, { responseWindowHours: 6 });
    // The next replay evaluation carries the replay clock (the newest observation, 2024-01-17) past the window.
    const ev = await post(`${P(s)}/indicators/${indicatorId}/evaluate`, fo(s, 'prediction.indicator.evaluate', 'IND', indicatorId), { timing: 'replay' }, s.token);
    expect(ev.status, JSON.stringify(ev.body)).toBeLessThan(300);
    expect(ev.body.evaluation.expiredWarnings).toBeGreaterThanOrEqual(1);
    await page.goto('/prediction/warnings');
    const row = page.getByRole('row').filter({ hasText: title }).first();
    await expect(row.getByText(/window closed unanswered — expired as of 2024-01-17/)).toBeVisible();
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="wrn-h"]');
    await expect(detail.getByText(/This window closed without an answer/)).toBeVisible();
    await expect(detail.getByRole('button', { name: 'Acknowledge' })).toHaveCount(0);
    await shot(page, '08-expired');
  });

  test('STATE: a warning issued after its decision deadline is a MISSED DECISION with a valid window', async ({ page }) => {
    const s = await login('n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
    const title = `Browser check · missed · ${Date.now().toString(36)}`;
    await seedReplayWarning(s, title, { decisionDeadline: '2024-01-10T00:00:00Z' });
    await page.goto('/prediction/warnings');
    const row = page.getByRole('row').filter({ hasText: title }).first();
    await expect(row.getByText('✕ decision missed')).toBeVisible();
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="wrn-h"]');
    await expect(detail.getByText(/DECISION MISSED — issued at or after the deadline/)).toBeVisible();
    await expect(detail.getByText(/2024-01-17 00:00:00Z → 2024-01-19 00:00:00Z|2024-01-17.*→.*2024-01-19/)).toBeVisible();
    await shot(page, '09-decision-missed');
  });

  /* ── Phase 5 · the Twins workspace and the Simulations action paths (Act V) ── */

  test('TWINS: the NORDWERK twin shows its synthetic world, two cut-offs, element kinds and health', async ({ page }) => {
    await uiLogin(page, 't.nakamura', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins');
    await expect(page.getByRole('heading', { name: 'Twins' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'NORDWERK' }).first();
    await expect(row.getByText('SYNTHETIC').first()).toBeVisible();
    await expect(row.getByText(/unvalidated \(synthetic grounding\)/)).toBeVisible();
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="twn-h"]');
    await expect(detail.getByText(/SYNTHETIC WORLD/).first()).toBeVisible();
    await expect(detail.getByText(/observations through 2024-01-17, read at record time 2026/)).toBeVisible();
    await expect(detail.getByText('● OBSERVED').first()).toBeVisible();
    await expect(detail.getByText('◍ ASSUMED').first()).toBeVisible();
    await expect(detail.getByText(/complete/).first()).toBeVisible();
    // The corrected corridor evidence: the version cited it and is UNVERIFIED after the walk.
    await expect(detail.getByText(/UNVERIFIED — a cited input was corrected/).first()).toBeVisible();
    await shot(page, '10-twins');
  });

  test('SIMULATIONS: control and interventions compared on one baseline, every value SYNTHETIC; a reproduction from the stored contract', async ({ page }) => {
    await uiLogin(page, 't.nakamura', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations');
    await expect(page.getByRole('heading', { name: 'Simulations' })).toBeVisible();
    await expect(page.getByText(/Every number on this screen is SYNTHETIC/)).toBeVisible();
    const rows = page.getByRole('row').filter({ hasText: 'completed' });
    await expect(rows.first()).toBeVisible();
    // select ONE control and the interventions that reference it — read from the rows, since the list is newest-first
    // and the newest control is the alternative branch's, which shares no baseline with anything.
    const firstIntervention = page.getByRole('row').filter({ hasText: 'intervention' }).filter({ hasText: 'completed' }).first();
    const ctl = (await firstIntervention.getByRole('cell').nth(2).innerText()).match(/→ ([0-9a-f]{8})…/)?.[1];
    expect(ctl, 'an intervention row names its control').toBeTruthy();
    // Ids are time-ordered, so an 8-character prefix is shared by every run of one pass: the control is the row that
    // IS a control (kind cell says so, on the actual branch) and carries that prefix — not the first row carrying it.
    const controlRow = page.getByRole('row').filter({ hasText: 'completed' }).filter({ hasText: '· actual' })
      .filter({ has: page.getByRole('cell', { name: 'control', exact: true }) })
      .filter({ has: page.getByRole('button', { name: `${ctl}…` }) }).first();
    await controlRow.getByRole('checkbox').check();
    const onThatControl = page.getByRole('row').filter({ hasText: `→ ${ctl}…` });
    const n = Math.min(await onThatControl.count(), 4);
    for (let i = 0; i < n; i += 1) await onThatControl.nth(i).getByRole('checkbox').check();
    await page.getByRole('button', { name: /Compare/ }).click();
    const cmp = page.locator('section[aria-labelledby="cmp-h"]');
    await expect(cmp).toBeVisible();
    await expect(cmp.getByText(/SYNTHETIC/)).toBeVisible();
    await expect(cmp.getByRole('row').filter({ hasText: 'control' })).toBeVisible();
    // open that control run and reproduce it
    await controlRow.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="run-d"]');
    await expect(detail.getByText(/Assumptions carrying the result/)).toBeVisible();
    await expect(detail.getByText(/observations through 2024-01-17, read at record time 2026/)).toBeVisible();
    await expect(detail.getByText(/shock.corridor_delay_days/).first()).toBeVisible();
    await detail.getByRole('button', { name: /Reproduce from the stored contract/ }).click();
    await expect(page.getByText(/reproduction REPRODUCED/)).toBeVisible();
    await expect(detail.getByText(/REPRODUCED/).first()).toBeVisible();
    await shot(page, '11-simulations');
  });
});
