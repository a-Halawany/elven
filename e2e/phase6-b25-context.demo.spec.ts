/**
 * CP-6 B25 §CX — GROUNDED CONTEXT on the demonstration (F-P4-03's scene: "a corridor forecast pins the twin snapshot and graph revision it
 * used; a later graph change leaves the replayed package unchanged") — exercised in a browser against the seeded DEMONSTRATION after the
 * B25 act ran (the rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — N.
 * Eriksen's grounded corridor forecast on the corridor series that names a subject (EYE_B25_GROUNDED_SERIES, default
 * `portwatch:chokepoint1:n_total` — the Suez Canal, the corridor twin's boundary place: the demonstration's graph holds no Bab el-Mandeb
 * Strait entity) pinned to its frozen information set (the subject, the NORDWERK corridor twin's served version, the graph revision at the
 * freeze), the act's two REPLAYS — before and after K. Müller's later change set on that subject — so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts). The walk READS the replays the act recorded: a replay re-reads
 * the pinned PortWatch evidence (~8,900 governed retrievals, minutes), so the walk does not press the button; it asserts it is offered.
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b25-context-*.png).
 * Personas: the forecaster N. Eriksen (EYE_B25_FORECASTER, default `n.eriksen`), the reader A. Hoffmann (EYE_B25_READER, default `a.hoffmann`).
 * Every figure is SYNTHETIC.
 *
 * B25 completion (the act's B25-F3b): the ROUTED, GROUNDED 5y regime on the Suez Canal series by regime_judgement@2 (EYE_B25_CONDITIONED_SET)
 * — the twin's and the graph's frozen features it USED (value, digest, held), the path-dependent view, the declared options' value and
 * resilience, the target version and the evaluation profile it pins, its replay REPRODUCED by the registry's replayer — and the F1 30d EVENT
 * forecast's replay REPRODUCED the same way (EYE_B25_EVENT_SET). THE LIMITS ON SCREEN: scenario language, never validated; the options
 * DECLARED, not measured. Each set is opened by its id (the act's env lines): a series carries several sets.
 */
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// expect.configure returns a NEW instance: rebind it (the B29 rule).
const expect = baseExpect.configure({ timeout: 20_000 });

function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const FORECASTER = process.env['EYE_B25_FORECASTER'] ?? 'n.eriksen';
const READER = process.env['EYE_B25_READER'] ?? 'a.hoffmann';
const SERIES = process.env['EYE_B25_GROUNDED_SERIES'] ?? 'portwatch:chokepoint1:n_total';
const GROUNDED_SET = process.env['EYE_B25_GROUNDED_SET'] ?? '';
const CONDITIONED_SET = process.env['EYE_B25_CONDITIONED_SET'] ?? '';
const CONDITIONED_METHOD = process.env['EYE_B25_CONDITIONED_METHOD'] ?? 'regime_judgement@2';
const SUEZ_TARGET = process.env['EYE_B25_SUEZ_TARGET'] ?? 'corridor.suez-canal.transit-regime';
const EVENT_SET = process.env['EYE_B25_EVENT_SET'] ?? '';
const EVENT_SERIES = process.env['EYE_B25_SERIES'] ?? 'portwatch:chokepoint4:n_total';
const esc = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
/** From the prediction nav to a set (by the id the act recorded; else the newest set of the series), then to the grounding of the forecast
 *  that pins it — the link named by its horizon (and method). */
async function openGrounding(page: Page, o: { setId?: string; series?: string; horizon?: string; link?: RegExp } = {}): Promise<void> {
  const series = o.series ?? SERIES; const horizon = o.horizon ?? '30d'; const setId = o.setId ?? GROUNDED_SET;
  await page.goto('/prediction');
  await page.getByRole('navigation', { name: 'Prediction' }).getByRole('link', { name: /Information sets/ }).click();
  await expect(page.getByRole('heading', { name: 'Information sets', level: 1 })).toBeVisible();
  const sets = page.getByRole('table', { name: 'Information sets' });
  if (setId !== '') await sets.getByRole('button', { name: `Open ${setId.slice(0, 8)}…` }).click();
  else await sets.getByRole('row').filter({ hasText: series }).first().getByRole('button', { name: /^Open / }).click();
  await page.getByRole('link', { name: o.link ?? new RegExp(`^${horizon} · `) }).first().click();
  await expect(page.getByRole('heading', { name: `Grounding — ${series} · ${horizon}`, level: 1 })).toBeVisible();
}

test.describe.serial('CP-6 B25 §CX — grounded context and the replay on the demonstration', () => {
  test('THE PINS: the corridor forecast names the graph revision and cut-off, the strait, the corridor twin\'s snapshot, its features and its environment', async ({ page }) => {
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openGrounding(page);
    const pins = page.getByRole('region', { name: 'The frozen information set' });
    await expect(pins).toContainText(/Graph revision\s*revision \d+ at the freeze; read as of/);
    await expect(pins).toContainText(/Subject\s*[0-9a-f-]{36} · place · active/);
    await expect(pins).toContainText(/Twin snapshot\s*[0-9a-f]{8}… v\d+ \(actual; served as (head|frozen)\) · state set [0-9a-f]{12}…/);
    await expect(pins).toContainText(/Manifest\s*digest [0-9a-f]{64} · assembler@1/);
    await expect(page.getByRole('table', { name: 'Twin snapshot' })).toContainText('twin.shock.corridor_delay_days');
    await expect(page.getByRole('table', { name: 'Graph (as of the cut-off)' })).toContainText('graph.edges');
    await expect(page.getByRole('region', { name: 'Environment' })).toContainText(/seasonal-naive@1 · implementation [0-9a-f]{12}… · assembler@1/);
    await shot(page, 'b25-context-01-pins');
  });

  test('THE REPLAY after the later graph change: the act\'s replays are REPRODUCED from the frozen set, the environment the same, while a grounding now would differ', async ({ page }) => {
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openGrounding(page);
    await expect(page.getByRole('button', { name: 'Replay from the frozen set' })).toBeVisible();   // offered to the forecast owner (not pressed: minutes)
    const replays = page.getByRole('table', { name: 'Replays' });
    await expect(replays.getByRole('row').filter({ hasText: 'REPRODUCED' })).toHaveCount(2);
    await expect(replays).not.toContainText('DIVERGED');
    await expect(replays).toContainText('nothing diverged');
    await expect(replays).toContainText(/a grounding now would differ \(revision \d+ against the pinned \d+\): graph\.revision_head/);
    await shot(page, 'b25-context-02-replay');
  });

  test('THE READER: A. Hoffmann reads the grounding and its replays; the replay is the forecast owner\'s act', async ({ page }) => {
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openGrounding(page);
    await expect(page.getByRole('button', { name: 'Replay from the frozen set' })).toHaveCount(0);
    await expect(page.getByText('a replay is recorded by the forecast owner')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Replays' })).toContainText('REPRODUCED');
    await shot(page, 'b25-context-03-reader');
  });

  test('B25 COMPLETION — THE ROUTED REGIME: the twin\'s and the graph\'s frozen features it used, the path-dependent view, the declared options, the pins; its replay REPRODUCED by the registry\'s replayer; scenario language, never validated', async ({ page }) => {
    test.skip(CONDITIONED_SET === '', 'EYE_B25_CONDITIONED_SET is not set (the act\'s B25-F3b did not run)');
    await uiLogin(page, FORECASTER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openGrounding(page, { setId: CONDITIONED_SET, horizon: '5y', link: new RegExp(`^5y · ${esc(CONDITIONED_METHOD)}`) });
    const routed = page.getByRole('region', { name: 'The routed model' });
    await expect(routed).toContainText(/twin\.shock\.corridor_delay_days = \d+ · digest [0-9a-f]{12}… · condition HELD/);
    await expect(routed).toContainText(/graph\.edges = \d+ · digest [0-9a-f]{12}… · condition (HELD|did not hold)/);
    await expect(routed).toContainText('THE PATH-DEPENDENT VIEW (scenario language, not a validated forecast)');
    await expect(routed).toContainText(/option value of flexibility [\d.]+ · best single commitment \w+ · most resilient \w+/);
    await expect(routed).toContainText(new RegExp(`target ${esc(SUEZ_TARGET)} v\\d+ · definition [0-9a-f]{12}…`));
    await expect(routed).toContainText(/evaluation profile · horizon policy standard v\d+ · no validation required/);
    // the twin feature the condition read is the pinned twin version's own
    await expect(page.getByRole('table', { name: 'Twin snapshot' })).toContainText('twin.shock.corridor_delay_days');
    // THE LIMITS on screen: scenario language, never validated; the options declared, not measured
    await expect(page.getByText(/^SCENARIO LANGUAGE, NOT A VALIDATED FORECAST/)).toBeVisible();
    await expect(page.getByText(/DECLARED with the entry \(approved by its steward\), not measured/)).toBeVisible();
    const replays = page.getByRole('table', { name: 'Replays' });
    await expect(replays.getByRole('row').filter({ hasText: 'REPRODUCED' }).filter({ hasText: 'registry-family@1' })).toHaveCount(1);
    await expect(replays).not.toContainText('DIVERGED');
    await shot(page, 'b25-context-04-routed-regime');
  });

  test('B25 COMPLETION — THE F1 30d EVENT\'s replay: REPRODUCED by the registry\'s replayer from its frozen set', async ({ page }) => {
    test.skip(EVENT_SET === '', 'EYE_B25_EVENT_SET is not set');
    await uiLogin(page, READER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openGrounding(page, { setId: EVENT_SET, series: EVENT_SERIES, horizon: '30d', link: /^30d · event_rate@1/ });
    const replays = page.getByRole('table', { name: 'Replays' });
    await expect(replays.getByRole('row').filter({ hasText: 'REPRODUCED' }).filter({ hasText: 'registry-family@1' })).toHaveCount(1);
    await expect(replays).toContainText('nothing diverged');
    await shot(page, 'b25-context-05-event-replay');
  });
});
