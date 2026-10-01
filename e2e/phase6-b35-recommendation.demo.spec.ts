/**
 * CP-6 B35 §R — the RECOMMENDATION rationale view, exercised in a browser against the seeded DEMONSTRATION after the B35 act ran (the
 * rehearsal copy first, then eye_demo). A DEMO WALK, not a hosted gate case: what it reads is what the act left — the Decision Agent's
 * "dual-source via Morocco" recommendation on L. Brandt's "second source for bearings" package, ACCEPTED FOR CONSIDERATION by a named
 * reviewer, beside the owner's own recommendation, both saying what could make them wrong — so this file runs through
 * playwright.demo.config.ts only (the hosted config ignores *.demo.spec.ts). Every figure on the demonstration is SYNTHETIC.
 *
 * What is asserted is what the record says on screen — never a state derived here. Screenshots go to EYE_SHOTS (evidence/phase6-browser/b35-recommendation-*.png).
 * Personas: the decision owner L. Brandt (EYE_B35_REC_OWNER, default `l.brandt`), the reviewer (EYE_B35_REC_REVIEWER, default `s.okafor`).
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
const OWNER = process.env['EYE_B35_REC_OWNER'] ?? 'l.brandt';
const REVIEWER = process.env['EYE_B35_REC_REVIEWER'] ?? 's.okafor';
const TITLE = process.env['EYE_B35_REC_TITLE'] ?? 'Second source for bearings';

async function uiLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
async function openPackage(page: Page): Promise<void> {
  await page.goto('/decisions/recommendations');
  await expect(page.getByRole('heading', { name: 'Recommendations', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
  await expect(page.getByRole('heading', { name: new RegExp(`^${TITLE}`), level: 2 })).toBeVisible();
}

test.describe.serial('CP-6 B35 §R — recommendations on the demonstration', () => {
  test('SIDE BY SIDE: the Decision Agent\'s "dual-source via Morocco" beside the owner\'s own recommendation — the AI named as such, each saying what could make it wrong, the four components separated', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    await expect(page.getByRole('heading', { name: /^Side by side/, level: 3 })).toBeVisible();
    const ai = page.getByRole('region', { name: 'the Decision Agent\'s recommendations' });
    const humans = page.getByRole('region', { name: 'the named humans\' recommendations' });
    await expect(ai.getByRole('article').first()).toContainText('DECISION AGENT (AI) — drafted, never decides');
    await expect(ai.getByRole('article').first()).toContainText(/Morocco/i);
    await expect(humans.getByRole('article').first()).toContainText('NAMED HUMAN');
    for (const card of [ai.getByRole('article').first(), humans.getByRole('article').first()]) {
      await expect(card.getByRole('heading', { name: 'What could make it wrong', level: 4 })).toBeVisible();
      for (const c of ['Value judgments', 'Policy constraints', 'Analytical assumptions', 'Model outputs']) await expect(card.getByRole('region', { name: c })).toBeVisible();
    }
    await shot(page, 'b35-recommendation-01-side-by-side');
  });

  test('ACCEPTED FOR CONSIDERATION: the reviewer\'s verdict is on the agent\'s card — not a decision; the review compared the owner\'s', async ({ page }) => {
    await uiLogin(page, REVIEWER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    const ai = page.getByRole('region', { name: 'the Decision Agent\'s recommendations' }).getByRole('article').first();
    await expect(ai).toContainText('ACCEPTED FOR CONSIDERATION — not a decision');
    await expect(ai).toContainText(/accept for consideration by .* compared with [1-9]\d* other recommendation\(s\)/);
    await expect(ai).toContainText(/DECISION COVERAGE/);
    await shot(page, 'b35-recommendation-02-accepted');
  });

  test('THE COMPLETENESS: the current version\'s completeness is the server\'s word (complete, human-led or its gaps)', async ({ page }) => {
    await uiLogin(page, OWNER, required('EYE_TEST_ADMIN_PASSWORD'));
    await openPackage(page);
    await expect(page.getByRole('heading', { name: /^Completeness of version/, level: 3 })).toBeVisible();
    await expect(page.getByRole('region', { name: /^Completeness of version/ })).toContainText(/COMPLETE|HUMAN-LED|INCOMPLETE/);
    await shot(page, 'b35-recommendation-03-completeness');
  });
});
