/**
 * F6 (API) — an outcome is scored from a stand-in ONLY on the publisher's attested
 * calendar. A weekday the publisher did not publish is not a holiday; mean
 * cadence plus a later observation establishes nothing.
 *
 * The fixture publishes on business days and once skipped a Thursday
 * (2023-06-15). Every assertion FAILED at aec404c1 unless marked as a control.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress, WEEKDAYS_MINUS_ONE_THURSDAY } from './phase4-helpers.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';

let h: Phase4Harness;
let controller: PredictionController;
let owner: AuthenticatedPrincipal;
let ownerId = '';
let sourceKey = '';
let assumptionId = '';
const CAL = { rule: 'business-days', closures: [] as string[], authority: 'Fixture statistics are published on business days only' };

const register = (key: string, publicationCalendar: unknown) =>
  controller.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), h.fx.tenantId, h.fx.domainId,
    { payload: { seriesKey: key, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                 seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic business-day transits', publicationCalendar } });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { PredictionController: C } = await import('../../src/prediction/prediction.controller.js');
  controller = h.app.get(C);
  owner = await h.principalWith(['forecast_owner', 'strategy_owner'], 'forecast-owner');
  ownerId = owner.principalId;
  const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  sourceKey = v.sourceKey;
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress(null, WEEKDAYS_MINUS_ONE_THURSDAY).egress }));
  expect(r.state, r.reason).toBe('finished');
  assumptionId = uuidv7();
  await sql`insert into graph.strategy_current (
      strategy_object_id, scope, tenant_id, domain_id, object_type, object_version,
      title, statement, status, verification_state, owner_principal_id, correlation_id)
    values (${assumptionId}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid,
      'ASU', 1, 'The corridor stays open', 'transits continue at their seasonal level', 'active', 'verified',
      ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await register(`fixture:${sourceKey}:cal`, CAL);
  await register(`fixture:${sourceKey}:nocal`, null);
  await register(`fixture:${sourceKey}:closure`, { ...CAL, closures: ['2023-06-15'] });
}, 300_000);

afterAll(async () => { await h?.close(); });

const forecast = async (key: string, observedThrough: string) => (await controller.issueForecast(
  h.req(owner, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
  { payload: { seriesKey: key, horizon: '30d', knownAt: new Date().toISOString(), observedThrough, assumptions: [assumptionId], label: 'replay demonstration' } },
) as { forecast: { forecastId: string; targetAt: string } }).forecast;

const score = (forecastId: string) => controller.recordOutcome(h.req(owner, 'prediction.outcome.record', 'OUT', forecastId), h.fx.tenantId, h.fx.domainId,
  { payload: { forecastId, knownAt: new Date().toISOString() } }) as Promise<{ outcome: { observedOn: string; substitution: string } }>;

const refused = async (p: Promise<unknown>): Promise<string> => {
  try { await p; } catch (e) {
    if (e instanceof HttpException && e.getStatus() === 409) return String((e.getResponse() as { message?: string }).message ?? '');
    throw e;
  }
  return '';
};

describe('F6 (API) — the publication calendar decides, never the cadence', () => {
  it('the series has weekday gaps: no Tuesdays are missing except the skipped Thursday, and no weekends exist', async () => {
    const pts = await controller.seriesPoints(h.req(owner, 'prediction.read', 'SER', null), h.fx.tenantId, h.fx.domainId, `fixture:${sourceKey}:cal`,
      { payload: { knownAt: new Date().toISOString(), limit: 5000 } }) as { points: Array<{ date: string }>; complete: boolean };
    expect(pts.complete).toBe(true);
    const dates = new Set(pts.points.map((p) => p.date));
    expect(dates.has('2023-06-14')).toBe(true);
    expect(dates.has('2023-06-15')).toBe(false);
    expect(dates.has('2023-06-16')).toBe(true);
    expect(dates.has('2023-06-17')).toBe(false);
  });

  it('a missing WEEKDAY (Thursday 2023-06-15) is NOT scored from Wednesday: a missing publication is not a holiday', async () => {
    const f = await forecast(`fixture:${sourceKey}:cal`, '2023-05-16');
    expect(f.targetAt).toBe('2023-06-15');
    const msg = await refused(score(f.forecastId));
    expect(msg, 'the weekday gap was scored from a stand-in').toMatch(/missing publication is not a holiday/);
    const rows = (await sql<{ n: string }>`select count(*)::text n from prediction.outcome_ledger where forecast_id = ${f.forecastId}::uuid`.execute(h.su)).rows[0]?.n;
    expect(Number(rows)).toBe(0);
  }, 120_000);

  it('a WEEKEND target under an attested business-days calendar is scored from Friday, citing the calendar', async () => {
    const f = await forecast(`fixture:${sourceKey}:cal`, '2023-05-18');
    expect(f.targetAt).toBe('2023-06-17');
    const r = await score(f.forecastId);
    expect(r.outcome.observedOn).toBe('2023-06-16');
    expect(r.outcome.substitution).toMatch(/a weekend day under the attested publication calendar/);
    const row = (await sql<{ observed_on: string; substitution: string }>`select observed_on::text, substitution from prediction.outcome_ledger
      where forecast_id = ${f.forecastId}::uuid`.execute(h.su)).rows[0];
    expect(row?.observed_on).toBe('2023-06-16');
    expect(row?.substitution).toMatch(/Fixture statistics are published on business days only/);
  }, 120_000);

  it('the same weekend target on a series WITHOUT an attested calendar stays unscored', async () => {
    const f = await forecast(`fixture:${sourceKey}:nocal`, '2023-05-18');
    expect(f.targetAt).toBe('2023-06-17');
    const msg = await refused(score(f.forecastId));
    expect(msg, 'a stand-in was justified by cadence alone').toMatch(/attests no publication calendar/);
  }, 120_000);

  it('a LISTED closure is the other admissible ground: the skipped Thursday, attested as a closure, is scored from Wednesday', async () => {
    const f = await forecast(`fixture:${sourceKey}:closure`, '2023-05-16');
    const r = await score(f.forecastId);
    expect(r.outcome.observedOn).toBe('2023-06-14');
    expect(r.outcome.substitution).toMatch(/a listed closure/);
  }, 120_000);

  it('positive control, preserved: nothing is scored before the target day has passed', async () => {
    const f = await forecast(`fixture:${sourceKey}:cal`, '2023-12-01');
    await expect(controller.recordOutcome(h.req(owner, 'prediction.outcome.record', 'OUT', f.forecastId), h.fx.tenantId, h.fx.domainId,
      { payload: { forecastId: f.forecastId, knownAt: '2023-12-20T00:00:00Z' } })).rejects.toThrow(/has not passed/);
  }, 120_000);
});
