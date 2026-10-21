/**
 * CP-6 B40 alongside (R1) — THE IMPACT TRIGGER UI, walked on a REHEARSAL copy (never live): "Record the trigger" and "Close the challenge"
 * on /graph/impact, by the people the PDP and the ports admit.
 *
 * The finding: the page passed `digest={null}` to both Command Reviews, and the review gate (lib/authority-b81 digestFreeze) refuses a
 * missing digest, so both acts stayed DISABLED for an eligible person with valid inputs. Neither command's server contract binds a version
 * or a digest (…/impact/triggers/:kind/record takes {objectType, objectId, reason, basis}; …/impact/triggers/:triggerId/close takes
 * {reason} and the port checks the challenge is still OPEN, the closer's role and that the closer did not open it). Each control is
 * therefore bound by a CLIENT-SIDE PAYLOAD REVIEW: the person reviews the exact payload, and any change to it after the review voids the
 * review. It is said as such on the page — it is not a server-enforced version binding.
 *
 *   W1 · the analyst (a.hoffmann, domain_analyst: a human challenge's recorder) fills a challenge, reviews the exact payload, CHANGES the
 *        reason (the review is void, the act disabled with the reason), reviews again and records it — the server's receipt and walk.
 *   W2 · the knowledge owner (k.mueller: a challenge's closer, not its opener) opens the closure, reviews it, changes the reason (void),
 *        reviews again, types the confirmation and closes it — the challenge leaves the open list.
 *
 * Target: EYE_ACT_TARGET=rehearsal, EYE_DB_NAME=<the copy>, EYE_API, EYE_WEB_BASE (playwright.demo.config.ts refuses anything else).
 * EYE_B40RES_CLAIM names a claim of the rehearsal domain. Password: EYE_TEST_ADMIN_PASSWORD. Screenshots: EYE_SHOTS (b40res-*.png).
 * WRITES on the rehearsal copy only (one challenge recorded, walked and closed). Every person and record is SYNTHETIC.
 */
import { expect as baseExpect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const expect = baseExpect.configure({ timeout: 30_000 });
function required(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') throw new Error(`${name} is required`);
  return v;
}
if (process.env['EYE_ACT_TARGET'] !== 'rehearsal') throw new Error('this walk WRITES: it runs on a rehearsal copy only (EYE_ACT_TARGET=rehearsal)');
const SHOTS = process.env['EYE_SHOTS'] ?? join(process.cwd(), 'evidence', 'phase6-browser');
mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `b40res-${name}.png`), fullPage: true });
const RECORDER = process.env['EYE_B40RES_RECORDER'] ?? 'a.hoffmann';
const CLOSER = process.env['EYE_B40RES_CLOSER'] ?? 'k.mueller';
const RUN = Date.now().toString(36);
// EYE_B40RES_REASON: W2 alone on a challenge recorded elsewhere (the before-fix observation of the close control)
const REASON = process.env['EYE_B40RES_REASON'] ?? `B40 res walk ${RUN}: the claim's source was restated (SYNTHETIC)`;

async function signedIn(browser: Browser, username: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(required('EYE_TEST_ADMIN_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  return page;
}
/** the reasons a Command Review lists while its act is disabled (empty when enabled) */
const reasonsOf = async (review: ReturnType<Page['getByRole']>) => {
  const list = review.getByRole('list', { name: 'Why the action is not available' });
  return (await list.count()) === 0 ? [] : list.getByRole('listitem').allInnerTexts();
};

test.describe.serial('B40 res R1 — the impact trigger and the challenge closure, through their governed routes', () => {
  test('W1 · the recorder reviews the exact payload, a changed input voids the review, the trigger is recorded', async ({ browser }) => {
    const page = await signedIn(browser, RECORDER);
    await page.goto('/graph/impact');
    await expect(page.getByRole('heading', { name: 'Impact triggers', level: 2 })).toBeVisible();
    await page.locator('#tkind').selectOption('human_challenge');
    await page.locator('#ttype').selectOption('CLM');
    await page.locator('#tid').fill(required('EYE_B40RES_CLAIM'));
    await page.locator('#treason').fill(REASON);
    await page.locator('#tb-statement').fill('the claim rests on a restated figure (SYNTHETIC)');
    const review = page.getByRole('region', { name: 'Command review: Record the trigger' });
    const record = review.getByRole('button', { name: 'Record the trigger' });
    console.log(`W1 reasons before any review: ${JSON.stringify(await reasonsOf(review))}`);
    await shot(page, 'w1-01-filled');
    // the payload review (absent before B40 res: then the act stays disabled — the reproduction)
    const reviewPayload = review.getByRole('button', { name: 'Review the exact payload' });
    if (await reviewPayload.count() === 0) {
      console.log('W1: no payload review control on this page');
      await expect(record, `the eligible recorder's act is disabled: ${JSON.stringify(await reasonsOf(review))}`).toBeEnabled({ timeout: 5_000 });
    }
    await expect(review).toContainText('client-side payload review');
    await expect(record).toBeDisabled();
    await reviewPayload.click();
    await expect(review.getByLabel('The reviewed payload')).toContainText(REASON);
    await expect(record).toBeEnabled();
    // a changed input after the review VOIDS it
    await page.locator('#treason').fill(`${REASON} — amended`);
    await expect(record).toBeDisabled();
    const voided = await reasonsOf(review);
    console.log(`W1 reasons after the change: ${JSON.stringify(voided)}`);
    expect(voided.join(' ')).toMatch(/the payload changed after you reviewed it/);
    await shot(page, 'w1-02-voided');
    await page.locator('#treason').fill(REASON);
    await expect(record, 'the exact reviewed payload again: the review holds (byte-identical)').toBeEnabled();
    await page.locator('#tb-statement').fill('the claim rests on a restated figure — the second source differs (SYNTHETIC)');
    await expect(record).toBeDisabled();
    await reviewPayload.click();
    await expect(review.getByLabel('The reviewed payload')).toContainText('the second source differs');
    await expect(record).toBeEnabled();
    await record.click();
    await expect(review).toContainText('✓ committed — POL');
    await expect(page.getByText(/Walked by the domain's propagation agent|Recorded; the agent's walk failed|Already walked/)).toBeVisible();
    await expect(record, 'a recorded payload needs a new review before another act').toBeDisabled();
    const row = page.getByRole('row').filter({ hasText: REASON });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('challenge open');
    console.log(`W1 recorded: ${(await row.innerText()).replace(/\s+/g, ' ')}`);
    await shot(page, 'w1-03-recorded');
    await page.context().close();
  });

  test('W2 · the closer reviews the closure, a changed reason voids it, the challenge is closed', async ({ browser }) => {
    const page = await signedIn(browser, CLOSER);
    await page.goto('/graph/impact');
    const row = page.getByRole('row').filter({ hasText: REASON });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Review the challenge closure' }).click();
    const review = page.getByRole('region', { name: 'Command review: Close the challenge' });
    const close = review.getByRole('button', { name: 'Close the challenge' });
    await review.getByLabel('Why the challenge is closed').fill('the restated figure was checked against both sources (SYNTHETIC)');
    console.log(`W2 reasons before any review: ${JSON.stringify(await reasonsOf(review))}`);
    const reviewPayload = review.getByRole('button', { name: 'Review the exact payload' });
    if (await reviewPayload.count() === 0) {
      console.log('W2: no payload review control on this page');
      await expect(close, `the eligible closer's act is disabled: ${JSON.stringify(await reasonsOf(review))}`).toBeEnabled({ timeout: 5_000 });
    }
    await expect(review).toContainText('client-side payload review');
    await reviewPayload.click();
    await expect(review.getByLabel('The reviewed payload')).toContainText('checked against both sources');
    const phrase = (await review.getByTestId('typed-phrase').innerText()).trim();
    await review.getByLabel(/^Type .* to confirm/).fill(phrase);
    await expect(close).toBeEnabled();
    await review.getByLabel('Why the challenge is closed').fill('the restated figure was checked against both sources and the registry (SYNTHETIC)');
    await expect(close).toBeDisabled();
    const voided = await reasonsOf(review);
    console.log(`W2 reasons after the change: ${JSON.stringify(voided)}`);
    expect(voided.join(' ')).toMatch(/the payload changed after you reviewed it/);
    await shot(page, 'w2-01-voided');
    await reviewPayload.click();
    await expect(review.getByLabel('The reviewed payload')).toContainText('and the registry');
    await expect(close).toBeEnabled();
    await close.click();
    await expect(review).toHaveCount(0);   // the closure returned: the review is closed and the triggers re-read
    await expect(row).toContainText('challenge closed');
    await expect(row.getByRole('button', { name: 'Review the challenge closure' })).toHaveCount(0);
    console.log(`W2 closed: ${(await row.innerText()).replace(/\s+/g, ' ')}`);
    await shot(page, 'w2-02-closed');
    await page.context().close();
  });
});
