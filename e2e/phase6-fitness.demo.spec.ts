/**
 * CP-6 B21 — the fitness, coherence and challenge screens, exercised in a browser against the seeded DEMONSTRATION after
 * scripts/phase6/act-b21.mjs ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case (design-p3-api
 * D3.10; corrections-2 C21): seeding a twin version, a scored forecast family and a scenario through HTTP needs the extraction
 * fixture, a registered series with history and uploaded records, so the hosted browser count stays at 51 and this file runs
 * through playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts).
 *
 * What is asserted is what the act LEFT and the record says on screen — never a state derived here:
 *   · the twins page: the validated version's FIT flag (glyph + label), the recorded validation with its envelope check;
 *   · the simulations page: the control run PROMOTED "fit for the NORDWERK corridor routing decision" in the Fitness column, and the
 *     challenged intervention run's card carrying its DISMISSED challenge (found through the governed API, as the Phase 4 demo walk
 *     reads its seeds — the page shows no live challenge once one is decided);
 *   · the scenarios page: the duplicate-branch scenario FAILED (retired — admitted, not decision-active) beside its successor PASSED;
 *   · the forecasts page: the corridor forecast's verdict as the rule states it — INDETERMINATE on a thin ledger, or UNFIT
 *     (envelope_breach) when the daily cadence's expiry class holds (the act prints whichever the rule says; no scheduler re-issues);
 *   · the calibration page: the "Live fitness by family" table with at least one family assessed.
 *
 * Screenshots go to EYE_SHOTS (evidence/phase6-browser/b21-*.png).
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
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

/* ── the governed API, for READING what the act left (the Phase 4 demo walk's idiom) ── */
const jcs = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x as Record<string, unknown>).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
const digest = (v: unknown) => createHash('sha256').update(jcs(v ?? {}), 'utf8').digest('hex');
interface Session { token: string; principalId: string; tenantId: string; domainId: string }
async function post(path: string, envelope: Record<string, unknown>, payload: unknown, token: string) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ envelope: { message_id: crypto.randomUUID(), issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: crypto.randomUUID(), trace_id: 'e2e-b21', schema_version: 'v1', payload_digest: digest(payload ?? {}), ...envelope }, payload }) });
  return { status: r.status, body: (await r.json()) as Record<string, any> };
}
async function login(username: string, password: string): Promise<Session> {
  const r = await post('/v1/auth/login', { scope: 'PLATFORM', tenant_id: null, domain_id: null, principal_id: 'anonymous', purpose_id: 'authentication',
    action: 'identity.session.create', side_effect_class: 'reversible', consequence_class: 'C1', object_type: 'SES' }, { username, password }, '');
  if (r.status !== 200 && r.status !== 201) throw new Error(`login failed (${r.status})`);
  const b = (r.body.bindings ?? []).find((x: { tenantId: string | null; domainId: string | null }) => x.tenantId && x.domainId) ?? r.body.scope ?? {};
  return { token: r.body.tokens.accessToken, principalId: r.body.principalId, tenantId: b.tenantId, domainId: b.domainId };
}
/** The domain's challenges, newest first, as the list route serves them (simulation.read; the web client's own envelope). */
async function challenges(s: Session): Promise<Array<Record<string, any>>> {
  const r = await post(`/v1/tenants/${s.tenantId}/domains/${s.domainId}/twins/simulations/challenges/list`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, principal_id: `principal:${s.principalId}`, purpose_id: 'simulation',
    action: 'simulation.read', side_effect_class: 'none', consequence_class: 'C1', object_type: 'SIM', object_id: null }, {}, s.token);
  if (r.status >= 300) throw new Error(`the challenge list was refused (${r.status}) ${r.body.message ?? ''}`);
  return (r.body.challenges ?? []) as Array<Record<string, any>>;
}

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

test.describe.serial('CP-6 B21 — fitness, coherence and challenge on the demonstration', () => {
  test('TWINS: the validated version carries FIT with its recorded envelope check and calibration history', async ({ page }) => {
    await uiLogin(page, 't.nakamura', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins');
    await expect(page.getByRole('heading', { name: 'Twins' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: 'NORDWERK' }).first();
    await row.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="twn-h"]');
    await expect(detail).toBeVisible();
    // the flag is the server's state, rendered as glyph + label: the act's validation set ONE admitted version fit
    const fitButton = detail.getByRole('button').filter({ hasText: /● FIT/ }).first();
    await expect(fitButton).toBeVisible();
    await fitButton.click();
    await expect(detail.getByText(/fitness .*● FIT/).first()).toBeVisible();
    await expect(detail.getByRole('term').filter({ hasText: 'Validation' })).toBeVisible();
    await expect(detail.getByRole('term').filter({ hasText: 'Envelope check' })).toBeVisible();
    await expect(detail.getByText(/corridor_delay_days = /).first()).toBeVisible();
    await expect(detail.getByRole('term').filter({ hasText: 'Calibration history' })).toBeVisible();
    // the twin's own owner sees the panel and is refused by the server, never by the page (the SoD is the port's) — not exercised here
    await shot(page, 'b21-01-twins-fit');
  });

  test('SIMULATIONS: the promoted control run reads fit for its use; the challenged run carries its DISMISSED challenge', async ({ page }) => {
    const s = await login('t.nakamura', required('EYE_TEST_ADMIN_PASSWORD'));
    const dismissed = (await challenges(s)).find((c) => c['state'] === 'dismissed');
    expect(dismissed, 'the act left one dismissed challenge').toBeDefined();
    await uiLogin(page, 't.nakamura', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/twins/simulations');
    await expect(page.getByRole('heading', { name: 'Simulations' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Fitness' })).toBeVisible();
    // the promotion (OBJ-29): the Fitness column names the use the reviewer promoted the result for
    const promoted = page.getByRole('row').filter({ hasText: /fit for the NORDWERK corridor routing decision/ }).first();
    await expect(promoted).toBeVisible();
    // the dismissed challenge rides the run's card, not the table (no live challenge once decided)
    const runId = String(dismissed!['run_id']);
    await page.getByRole('button', { name: `${runId.slice(0, 8)}…` }).first().click();
    const detail = page.locator('section[aria-labelledby="run-d"]');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('term').filter({ hasText: 'Challenges' })).toBeVisible();
    await expect(detail.getByText('DISMISSED', { exact: true }).first()).toBeVisible();
    await expect(detail.getByText(String(dismissed!['statement'])).first()).toBeVisible();
    await expect(detail.getByText(/decided .* by/).first()).toBeVisible();
    // the run itself stands: never invalidated by the act
    await expect(detail.getByText(/INVALIDATED/)).toHaveCount(0);
    await expect(detail.getByRole('term').filter({ hasText: 'Twin fitness at opening' })).toBeVisible();
    await expect(detail.getByRole('term').filter({ hasText: 'Envelope' }).first()).toBeVisible();
    await shot(page, 'b21-02-simulations-challenge');
  });

  test('SCENARIOS: the duplicate-branch scenario reads FAILED (retired, not decision-active) beside its successor PASSED', async ({ page }) => {
    await uiLogin(page, 'n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/scenarios');
    await expect(page.getByRole('heading', { name: 'Scenarios' })).toBeVisible();
    const coherenceLines = page.locator('p').filter({ hasText: /^coherence/ });
    await expect(coherenceLines.first()).toBeVisible();
    const failed = coherenceLines.filter({ hasText: 'FAILED' }).first();
    await expect(failed).toBeVisible();
    await expect(failed.getByText(/admitted, not decision-active/)).toBeVisible();
    const failedCard = page.locator('section[aria-labelledby^="scn-"]').filter({ has: page.locator('p').filter({ hasText: /^coherence/ }).filter({ hasText: 'FAILED' }) }).first();
    await expect(failedCard.getByText('RETIRED', { exact: true }).first()).toBeVisible();
    await expect(coherenceLines.filter({ hasText: 'PASSED' }).first()).toBeVisible();
    // the recorded findings are the port's, read on request: the duplicate branch named as the rule found it
    await failedCard.getByRole('button', { name: 'Show the recorded check' }).click();
    await expect(failedCard.getByText(/duplicate_branch/).first()).toBeVisible({ timeout: 20_000 });
    await expect(failedCard.getByText(/do not cover distinct uncertainty/).first()).toBeVisible();
    await shot(page, 'b21-03-scenarios-coherence');
  });

  test('FORECASTS: the corridor forecast carries the rule\'s verdict — INDETERMINATE on a thin ledger or UNFIT with its class', async ({ page }) => {
    await uiLogin(page, 'n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/forecasts');
    await expect(page.getByRole('heading', { name: 'Forecasts' })).toBeVisible();
    const corridor = page.getByRole('row').filter({ hasText: 'portwatch:' }).filter({ hasText: /INDETERMINATE|UNFIT \(/ }).first();
    await expect(corridor).toBeVisible();
    await corridor.getByRole('button').first().click();
    const detail = page.locator('section[aria-labelledby="fct-h"]');
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('term').filter({ hasText: 'Fitness' })).toBeVisible();
    await expect(detail.getByText(/rule v1/).first()).toBeVisible();
    await expect(detail.getByText(/window .* of 10 outcome/).first()).toBeVisible();
    await shot(page, 'b21-04-forecasts-fitness');
  });

  test('CALIBRATION: live fitness by family lists the assessed family with its verdict and rule version', async ({ page }) => {
    await uiLogin(page, 'n.eriksen', required('EYE_TEST_ADMIN_PASSWORD'));
    await page.goto('/prediction/calibration');
    await expect(page.getByRole('heading', { name: /Live fitness by family/ })).toBeVisible();
    const section = page.locator('section[aria-labelledby="fit-h"]');
    await expect(section.getByRole('columnheader', { name: 'Fitness' })).toBeVisible();
    await expect(section.getByRole('row').filter({ hasText: /INDETERMINATE|UNFIT|FIT/ }).first()).toBeVisible();
    await expect(section.getByRole('cell', { name: 'v1', exact: true }).first()).toBeVisible();
    await shot(page, 'b21-05-calibration-fitness');
  });
});
