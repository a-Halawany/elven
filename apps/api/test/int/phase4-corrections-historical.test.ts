/**
 * F2 (API) — the HISTORICAL backtest loop, exercised on a history every origin can
 * see, and refused on one it cannot read completely.
 *
 * The fixture is dated AFTER its own recording (2026-10 → 2029-06), so an origin's
 * end-of-day cut-off lies after the day the evidence was recorded and the loop
 * fits and scores — which the earlier probe (12 origins, below the minimum of 20,
 * on a history recorded after every origin) never reached.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, syntheticEgress } from './phase4-helpers.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';

let h: Phase4Harness;
let controller: PredictionController;
let owner: AuthenticatedPrincipal;
let seriesKey = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { PredictionController: C } = await import('../../src/prediction/prediction.controller.js');
  controller = h.app.get(C);
  owner = await h.principalWith(['forecast_owner', 'strategy_owner'], 'forecast-owner');
  const v = await h.newVersion({ from: '2026-10-01', to: '2029-06-01', windowDays: 366 });
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  expect(r.admitted).toBe(3);
  seriesKey = `fixture:${v.sourceKey}:future`;
  await controller.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), h.fx.tenantId, h.fx.domainId,
    { payload: { seriesKey, sourceKey: v.sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                 seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits dated after their recording' } });
}, 300_000);

afterAll(async () => { await h?.close(); });

const backtest = (extra: Record<string, unknown> = {}) => controller.runBacktest(h.req(owner, 'prediction.backtest.record', 'BKT', null), h.fx.tenantId, h.fx.domainId,
  { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), origins: 24, stride: 14, mode: 'historical', ...extra } }) as Promise<{ backtest: Record<string, unknown> }>;

describe('F2 (API) — historical origins are fitted only on complete history, and the usable-origin minimum holds', () => {
  it('on a history every origin can see completely, the loop fits and scores at least 20 origins', async () => {
    const r = await backtest();
    const b = r.backtest;
    expect(b['mode']).toBe('historical');
    expect(Number(b['origins'])).toBeGreaterThanOrEqual(20);
    expect(b['unknowable']).toBe(0);
    expect(b['incomplete']).toBe(0);
    expect(typeof b['t1_met']).toBe('boolean');
    expect(typeof b['t2_met']).toBe('boolean');
    expect(String(b['verdict'])).toMatch(/origins \(historical\)/);
    const row = (await sql<{ mode: string; origins: number; details: Record<string, unknown> }>`select mode, origins, details from prediction.backtests
      where backtest_id = ${String(b['backtestId'])}::uuid`.execute(h.su)).rows[0];
    expect(row?.mode).toBe('historical');
    expect(Number(row?.origins)).toBeGreaterThanOrEqual(20);
    expect(row?.details['incomplete']).toBe(0);
  }, 300_000);

  it('after one evidence version is governed-deleted, no origin is fitted: the backtest is refused and nothing is recorded', async () => {
    const before = (await sql<{ n: string }>`select count(*)::text n from prediction.backtests where series_key = ${seriesKey}`.execute(h.su)).rows[0]?.n;
    const manifest = (await sql<{ m: string }>`select (e.payload ->> 'manifest_id') m from objects.canonical_objects e
      where e.object_type = 'EVD' and e.provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by e.recorded_at asc limit 1`.execute(h.su)).rows[0]?.m as string;
    await sql`insert into observation.blob_tombstones (tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, actor_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${manifest}::uuid, 'F2 probe: governed deletion', ${owner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    let status: number | null = null; let msg = '';
    try { await backtest(); } catch (e) {
      if (e instanceof HttpException) { status = e.getStatus(); msg = String((e.getResponse() as { message?: string }).message ?? ''); }
    }
    expect(status, 'a historical backtest was fitted on an incomplete history').toBe(409);
    expect(msg).toMatch(/could not be read by this reader/);
    const after = (await sql<{ n: string }>`select count(*)::text n from prediction.backtests where series_key = ${seriesKey}`.execute(h.su)).rows[0]?.n;
    expect(after).toBe(before);
  }, 300_000);
});
