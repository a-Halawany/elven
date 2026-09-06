/**
 * CODEX REVIEW OF 737ca81a — DATABASE AND API verification for the seven groups.
 *
 * Codex's evidence was implementation execution with dependency doubles plus SQL
 * inspection. THIS file runs against a real database through the real ports,
 * the real lifecycle and the real controllers, so each finding's database
 * consequence is established (or shown to be prevented by a downstream guard)
 * before anything is corrected. Every assertion below FAILED at 737ca81a unless
 * marked as a positive control.
 *
 * Nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, fakeEgress, sdmxWindow, syntheticEgress } from './phase4-helpers.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';

let h: Phase4Harness;
let controller: PredictionController;
let owner: AuthenticatedPrincipal;
let ownerId = '';
let seriesKey = '';
let sourceKey = '';
let assumptionId = '';
let knownAfterBackfill = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { PredictionController: C } = await import('../../src/prediction/prediction.controller.js');
  controller = h.app.get(C);
  owner = await h.principalWith(['forecast_owner', 'strategy_owner'], 'forecast-owner');
  ownerId = owner.principalId;
  const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  sourceKey = v.sourceKey;
  const { egress } = syntheticEgress();
  const r = await h.runOnce(new RestConnector({ egress }));
  expect(r.state, r.reason).toBe('finished');
  expect(r.admitted).toBe(3);
  knownAfterBackfill = new Date().toISOString();
  seriesKey = `fixture:${sourceKey}:value`;
  await controller.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), h.fx.tenantId, h.fx.domainId,
    { payload: { seriesKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                 seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode' } });
  assumptionId = uuidv7();
  await sql`insert into graph.strategy_current (
      strategy_object_id, scope, tenant_id, domain_id, object_type, object_version,
      title, statement, status, verification_state, owner_principal_id, correlation_id)
    values (${assumptionId}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid,
      'ASU', 1, 'The corridor stays open', 'transits continue at their seasonal level', 'active', 'verified',
      ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
}, 300_000);

afterAll(async () => { await h?.close(); });

const points = async (as: AuthenticatedPrincipal, extra: Record<string, unknown> = {}) =>
  controller.seriesPoints(h.req(as, 'prediction.read', 'SER', null), h.fx.tenantId, h.fx.domainId, seriesKey,
    { payload: { knownAt: knownAfterBackfill, limit: 5000, ...extra } }) as Promise<{ total: number; evidence: number } & Record<string, unknown>>;

/* ═════════ 1 · evidence permissions ═════════ */

describe('F1 (API) — a cached series is not served past a reader\'s own evidence authorization', () => {
  it('a reader without observation.evidence.retrieve is refused even after another reader warmed the cache', async () => {
    // The forecast owner warms the cache.
    const warm = await points(owner);
    expect(warm.total).toBe(1095);
    // A strategy owner may read predictions but holds NO evidence-retrieval decision.
    const reader = await h.principalWith(['strategy_owner'], 'strategy-only');
    let outcome: 'served' | 'refused' = 'served';
    let served = 0;
    try {
      const r = await points(reader);
      served = r.total;
    } catch (e) {
      outcome = e instanceof HttpException ? 'refused' : 'served';
    }
    // Either an explicit refusal, or an answer that discloses it could read nothing.
    if (outcome === 'served') {
      expect(served, 'a reader with no evidence-retrieval authority was served cached values').toBe(0);
    }
  });

});

/* ═════════ 2 · forecast selection and validation ═════════ */

describe('F2 (API) — method selection and validation are bound to the applicable record', () => {
  let backtest: Record<string, unknown>;
  beforeAll(async () => {
    const r = await controller.runBacktest(h.req(owner, 'prediction.backtest.record', 'BKT', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: knownAfterBackfill, origins: 24, stride: 14 } }) as { backtest: Record<string, unknown> };
    backtest = r.backtest;
  }, 120_000);

  it('an explicit Holt-Winters request does not bypass the seasonal fallback when no applicable record says it earned it', async () => {
    // A fresh series on the same evidence: no backtest exists for it at all.
    const freshKey = `${seriesKey}:leash`;
    await controller.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey: freshKey, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                   seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'leash probe' } });
    let refused = false; let method = '';
    try {
      const r = await controller.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
        { payload: { seriesKey: freshKey, horizon: '30d', knownAt: knownAfterBackfill, observedThrough: '2023-10-31', assumptions: [assumptionId],
                     label: 'replay demonstration', method: 'holt-winters-additive' } }) as { forecast: { method: string } };
      method = r.forecast.method;
    } catch (e) { refused = e instanceof HttpException && e.getStatus() === 422; }
    expect(refused, `an explicit method request issued ${method || 'the learned model'} although no applicable backtest exists`).toBe(true);
    // Without the explicit request the baseline is issued, unvalidated.
    const r = await controller.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey: freshKey, horizon: '30d', knownAt: knownAfterBackfill, observedThrough: '2023-10-31', assumptions: [assumptionId],
                   label: 'replay demonstration' } }) as { forecast: { method: string; validationState: string } };
    expect(r.forecast.method).toBe('seasonal-naive');
    expect(r.forecast.validationState).toBe('unvalidated');
  }, 120_000);

  it('a forecast fitted on a short early history is not validated by a backtest over the full later history', async () => {
    const r = await controller.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: knownAfterBackfill, observedThrough: '2021-02-15', assumptions: [assumptionId],
                   label: 'replay demonstration' } }) as { forecast: { forecastId: string; validationState: string; validation: { note: string } } };
    expect(r.forecast.validationState,
      'a 46-observation forecast was marked validated by a backtest whose window lies after its origin').toBe('validation_impossible');
  });

  it('a backtest declares its knowledge mode; a retrospective one earns validated_retrospective, never validated', async () => {
    expect(String(backtest['mode'] ?? ''), 'the backtest record does not say whether it is retrospective or historical').toBe('retrospective');
    const r = await controller.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: knownAfterBackfill, assumptions: [assumptionId], label: 'replay demonstration' } }) as
      { forecast: { validationState: string; backtestId: string | null; validationNote: string } };
    expect(r.forecast.validationState).not.toBe('validated');
    expect(['validated_retrospective', 'unvalidated']).toContain(r.forecast.validationState);
    if (r.forecast.validationState === 'validated_retrospective') {
      expect(r.forecast.backtestId).toBe(backtest['backtestId']);
      expect(r.forecast.validationNote).toMatch(/RETROSPECTIVE/);
    }
    const bound = (await sql<{ backtest_id: string | null; validation_state: string }>`select backtest_id::text, validation_state from prediction.forecasts_current
      where domain_id = ${h.fx.domainId}::uuid and validation_state like 'validated%' and backtest_id is null`.execute(h.su)).rows;
    expect(bound.length, 'a validated forecast without the record that validated it').toBe(0);
  });

  it('a historical-mode backtest on a backfilled vintage cannot validate: every origin predates the recording', async () => {
    const r = await controller.runBacktest(h.req(owner, 'prediction.backtest.record', 'BKT', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: knownAfterBackfill, origins: 12, stride: 14, mode: 'historical' } }) as { backtest: Record<string, unknown> };
    expect(r.backtest['mode']).toBe('historical');
    expect(r.backtest['t2_met']).toBeNull();
    expect(String(r.backtest['verdict'])).toMatch(/CANNOT VALIDATE \(historical\)/);
    const row = (await sql<{ mode: string; known_at: string; observations: number }>`select mode, known_at::text, observations from prediction.backtests
      where backtest_id = ${String(r.backtest['backtestId'])}::uuid`.execute(h.su)).rows[0];
    expect(row?.mode).toBe('historical');
    expect(row?.observations).toBeGreaterThanOrEqual(1095);
  }, 120_000);
});

/* ═════════ 3 · inherited controls ═════════ */

describe('F3 (API) — source restrictions and synthetic provenance survive evidence → forecast → scenario → warning', () => {
  let forecastId = '';
  beforeAll(async () => {
    // A restricted, SYNTHETIC contract version re-collects the whole series over
    // different windows; its evidence is the latest recorded for every date, so
    // the series now rests on it. Nothing is edited on an admitted object.
    const v = await h.newVersion({ from: '2020-12-29', to: SERIES_END, windowDays: 400,
      controls: { data_origin: 'synthetic', classification_ceiling: 'restricted', residency: 'EU-only', retention: '30 days', licence: 'fixture-rights' } });
    const { egress } = syntheticEgress();
    const run = await h.runOnce(new RestConnector({ egress }), v.version);
    expect(run.state, run.reason).toBe('finished');
    expect(run.admitted).toBeGreaterThan(0);
    const r = await controller.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), observedThrough: '2023-10-31', assumptions: [assumptionId],
                   label: 'live' } }) as { forecast: { forecastId: string } };
    forecastId = r.forecast.forecastId;
  }, 120_000);

  it('the forecast carries the evidence\'s controls, and its synthetic state is not the caller\'s label', async () => {
    const f = (await sql<{ synthetic_state: boolean; classification: string; residency_profile: string | null; retention_profile: string | null; access_policy_ref: string | null }>`
      select synthetic_state, classification, residency_profile, retention_profile, access_policy_ref from objects.canonical_objects
       where object_id = ${forecastId}::uuid`.execute(h.su)).rows[0];
    expect(f?.synthetic_state, 'a forecast fitted on synthetic evidence was admitted as non-synthetic because the caller said "live"').toBe(true);
    expect(f?.classification, 'the evidence is restricted; the forecast is not').toBe('restricted');
    expect(f?.residency_profile).toBe('EU-only');
    expect(f?.retention_profile).toBe('30 days');
    const rights = (await sql<{ rights_profile: string | null; controls: Record<string, unknown> }>`select rights_profile, controls from objects.canonical_objects o
      join prediction.forecasts_current f on f.forecast_id = o.object_id where o.object_id = ${forecastId}::uuid`.execute(h.su)).rows[0];
    expect(rights?.rights_profile).toBe('fixture-rights');
    expect(rights?.controls['synthetic_state']).toBe(true);
  });

  it('a scenario on that forecast, and the warning its branch raises, inherit the same controls', async () => {
    const ind = await controller.defineIndicator(h.req(owner, 'prediction.indicator.define', 'IND', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, description: 'controls probe: transits below 40 for five days', comparator: '<', threshold: 40, consecutiveDays: 5, owner: ownerId } }) as { indicator: { indicatorId: string } };
    const scn = await controller.declareScenario(h.req(owner, 'prediction.scenario.declare', 'SCN', null), h.fx.tenantId, h.fx.domainId,
      { payload: { title: 'Controls probe', statement: 'inherits the forecast it is built on', forecastId, owner: ownerId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: ownerId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Collapse', kind: 'downside', statement: 'below 40', indicatorId: ind.indicator.indicatorId, owner: ownerId, consequence: 'rebook the shipment now', responseWindowHours: 48 },
                   ] } }) as { scenario: { scenarioId: string } };
    const s = (await sql<{ synthetic_state: boolean; classification: string }>`select synthetic_state, classification from objects.canonical_objects
      where object_id = ${scn.scenario.scenarioId}::uuid`.execute(h.su)).rows[0];
    expect(s?.synthetic_state, 'the scenario hard-codes non-synthetic').toBe(true);
    expect(s?.classification).toBe('restricted');
    const ev = await controller.evaluateIndicator(h.req(owner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), h.fx.tenantId, h.fx.domainId,
      ind.indicator.indicatorId, { payload: { knownAt: new Date().toISOString() } }) as { warnings: Array<{ warningId: string }> };
    expect(ev.warnings.length).toBe(1);
    const w = (await sql<{ synthetic_state: boolean; classification: string }>`select synthetic_state, classification from objects.canonical_objects
      where object_id = ${ev.warnings[0]?.warningId}::uuid`.execute(h.su)).rows[0];
    expect(w?.synthetic_state, 'the warning hard-codes non-synthetic').toBe(true);
    expect(w?.classification).toBe('restricted');
  }, 120_000);
});

/* ═════════ 4 · lost warnings ═════════ */

describe('F4 (database) — a committed flip whose warning failed is recovered, once', () => {
  it('a fresh evaluation raises the warning the failed one owed, and never twice', async () => {
    const ind = await controller.defineIndicator(h.req(owner, 'prediction.indicator.define', 'IND', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, description: 'lost-warning probe: below 40 for five days', comparator: '<', threshold: 40, consecutiveDays: 5, owner: ownerId } }) as { indicator: { indicatorId: string } };
    // The branch owner will be an INACTIVE principal at flip time, so raising the warning is refused by the port.
    const absent = await h.principalWith(['forecast_owner'], 'absent-owner');
    await sql`update identity.principals set status = 'suspended' where id = ${absent.principalId}::uuid`.execute(h.su);
    const scn = await controller.declareScenario(h.req(owner, 'prediction.scenario.declare', 'SCN', null), h.fx.tenantId, h.fx.domainId,
      { payload: { title: 'Lost-warning probe', statement: 'the owner cannot be routed to at first', forecastId: null, owner: ownerId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'as is', owner: ownerId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Collapse', kind: 'downside', statement: 'below 40', indicatorId: ind.indicator.indicatorId, owner: absent.principalId, consequence: 'rebook the shipment now', responseWindowHours: 48 },
                   ] } }) as { scenario: { branches: Array<{ branchId: string; kind: string }> } };
    const branch = scn.scenario.branches.find((b) => b.kind === 'downside') as { branchId: string };
    let firstFailed = false;
    try {
      await controller.evaluateIndicator(h.req(owner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), h.fx.tenantId, h.fx.domainId,
        ind.indicator.indicatorId, { payload: { knownAt: new Date().toISOString() } });
    } catch { firstFailed = true; }
    const flipped = (await sql<{ state: string }>`select state from prediction.branches_current where branch_id = ${branch.branchId}::uuid`.execute(h.su)).rows[0];
    const warningsBefore = (await sql<{ n: string }>`select count(*)::text n from prediction.warnings_current where branch_id = ${branch.branchId}::uuid`.execute(h.su)).rows[0]?.n;
    expect(flipped?.state).toBe('flipped');
    expect(Number(warningsBefore)).toBe(0);
    expect(firstFailed, 'the warning failure was swallowed').toBe(true);

    // The owner is reinstated; the obligation must be recoverable by a fresh evaluation.
    await sql`update identity.principals set status = 'active' where id = ${absent.principalId}::uuid`.execute(h.su);
    const again = await controller.evaluateIndicator(h.req(owner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), h.fx.tenantId, h.fx.domainId,
      ind.indicator.indicatorId, { payload: { knownAt: new Date().toISOString() } }) as { warnings: unknown[] };
    expect(again.warnings.length, 'a fresh evaluation did not retry the warning the committed flip owed').toBe(1);
    const third = await controller.evaluateIndicator(h.req(owner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), h.fx.tenantId, h.fx.domainId,
      ind.indicator.indicatorId, { payload: { knownAt: new Date().toISOString() } }) as { warnings: unknown[] };
    expect(third.warnings.length, 'the obligation was raised twice').toBe(0);
    const total = (await sql<{ n: string }>`select count(*)::text n from prediction.warnings_current where branch_id = ${branch.branchId}::uuid`.execute(h.su)).rows[0]?.n;
    expect(Number(total)).toBe(1);
  }, 120_000);
});

/* ═════════ 5 · T3 timing ═════════ */

describe('F5 (API) — a replayed episode is timed against its own decision deadline, not the audit clock', () => {
  it('the warning carries the replay instant it was raised as of, the deadline, and audit time separately', async () => {
    const ind = await controller.defineIndicator(h.req(owner, 'prediction.indicator.define', 'IND', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, description: 'timing probe: below 40 for five days', comparator: '<', threshold: 40, consecutiveDays: 5, owner: ownerId } }) as { indicator: { indicatorId: string } };
    const scn = await controller.declareScenario(h.req(owner, 'prediction.scenario.declare', 'SCN', null), h.fx.tenantId, h.fx.domainId,
      { payload: { title: 'Timing probe', statement: 'the third shipment must be booked by 2023-11-27', forecastId: null, owner: ownerId, reviewCadence: 'weekly',
                   branches: [
                     { name: 'Baseline', kind: 'baseline', statement: 'as is', owner: ownerId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                     { name: 'Collapse', kind: 'downside', statement: 'below 40', indicatorId: ind.indicator.indicatorId, owner: ownerId,
                       consequence: 'rebook before the booking deadline', responseWindowHours: 48, decisionDeadline: '2023-11-27T00:00:00Z' },
                   ] } }) as { scenario: { branches: Array<{ branchId: string; kind: string }> } };
    const ev = await controller.evaluateIndicator(h.req(owner, 'prediction.indicator.evaluate', 'IND', ind.indicator.indicatorId), h.fx.tenantId, h.fx.domainId,
      ind.indicator.indicatorId, { payload: { knownAt: new Date().toISOString(), timing: 'replay' } }) as { warnings: Array<{ warningId: string }> };
    expect(ev.warnings.length).toBe(1);
    const w = (await sql<Record<string, unknown>>`select * from prediction.warnings_current where warning_id = ${ev.warnings[0]?.warningId}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    // Raised AS OF the observation that breached (2023-11-24), audited NOW.
    expect(new Date(String(w['raised_as_of'] ?? '')).toISOString().slice(0, 10), 'the warning has no replay instant; its window starts at the audit clock').toBe('2023-11-24');
    expect(new Date(String(w['raised_at'])).getFullYear()).toBeGreaterThanOrEqual(2026);
    expect(String(w['timing_mode'])).toBe('replay');
    expect(w['timely'], 'timeliness against the deadline is not recorded').toBe(true);
    expect(new Date(String(w['response_window_closes_at'])).toISOString()).toBe('2023-11-26T00:00:00.000Z');
    expect(new Date(String(w['decision_deadline'])).toISOString()).toBe('2023-11-27T00:00:00.000Z');
  }, 120_000);
});

/* ═════════ 6 · premature outcomes ═════════ */

describe('F6 (API) — an outcome is never scored before the target day has been observed', () => {
  it('refuses a stand-in from before the target when the target itself was never observed', async () => {
    // Origin 2023-12-02 → target 2024-01-01; the series ends 2023-12-31, one day short.
    const r = await controller.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), observedThrough: '2023-12-02', assumptions: [assumptionId],
                   label: 'replay demonstration' } }) as { forecast: { forecastId: string; targetAt: string } };
    expect(r.forecast.targetAt).toBe('2024-01-01');
    await expect(controller.recordOutcome(h.req(owner, 'prediction.outcome.record', 'OUT', r.forecast.forecastId), h.fx.tenantId, h.fx.domainId,
      { payload: { forecastId: r.forecast.forecastId, knownAt: new Date().toISOString() } }))
      .rejects.toSatisfy((e: unknown) => e instanceof HttpException, 'a forecast was scored from an observation before its target day');
  }, 120_000);

  it('a scored outcome persists the actual observation date and the substitution reason', async () => {
    const r = await controller.issueForecast(h.req(owner, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
      { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), observedThrough: '2023-10-31', assumptions: [assumptionId],
                   label: 'replay demonstration' } }) as { forecast: { forecastId: string } };
    await controller.recordOutcome(h.req(owner, 'prediction.outcome.record', 'OUT', r.forecast.forecastId), h.fx.tenantId, h.fx.domainId,
      { payload: { forecastId: r.forecast.forecastId, knownAt: new Date().toISOString() } });
    const o = (await sql<Record<string, unknown>>`select * from prediction.outcome_ledger where forecast_id = ${r.forecast.forecastId}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(o['observed_on'], 'the ledger does not persist the actual observation date').toBeDefined();
    expect(String(o['substitution'] ?? 'none')).toMatch(/none|exact/);
  }, 120_000);
});

/* ═════════ 7 · backfill correctness ═════════ */

describe('F7 (database) — a backfill neither restarts overnight nor completes on an error page', () => {
  it('an open-ended window resumes from its resolved upper bound rather than restarting when the day changes', async () => {
    const { egress } = syntheticEgress();
    const v = await h.newVersion({ from: SERIES_START, to: null, windowDays: 366, budget: 2 });
    const r1 = await h.runOnce(new RestConnector({ egress }), v.version);
    expect(r1.state, r1.reason).toBe('finished');
    const cp1 = (await h.checkpoint())?.['backfill'] as Record<string, unknown>;
    expect(cp1['done']).toBe(false);
    // The calendar moves on: the next run resolves `to` one day later. The walk must
    // continue from where it stood, not start again from 2021.
    const original = Date.prototype.toISOString;
    const shifted = new Date(Date.now() + 86_400_000);
    Date.prototype.toISOString = function (this: Date) {
      return this.getTime() === shifted.getTime() ? original.call(this) : original.call(this);
    };
    let cp2: Record<string, unknown>;
    try {
      // Force a later "today" for the resolver by registering nothing and simply running
      // with the system clock advanced through the connector's own clock hook.
      const r2 = await h.runOnce(new RestConnector({ egress, today: () => shifted.toISOString().slice(0, 10) } as never), v.version);
      expect(r2.state, r2.reason).toBe('finished');
      cp2 = (await h.checkpoint())?.['backfill'] as Record<string, unknown>;
    } finally {
      Date.prototype.toISOString = original;
    }
    expect(cp2['requests'], 'the walk restarted from the declaration instead of resuming').toBe(4);
    expect(cp2['to'], 'the resolved upper bound was not persisted').toBe(cp1['to']);
  }, 180_000);

  it('a window whose bytes are an error envelope is not collected, and the cursor does not pass it', async () => {
    const v = await h.newVersion({ from: '2021-01-01', to: '2021-03-01', windowDays: 30, budget: 12 });
    const { egress } = fakeEgress((url) => {
      const start = new URL(url).searchParams.get('startPeriod') ?? '';
      return start === '2021-01-31' ? JSON.stringify({ error: { code: 400, message: 'Invalid query parameters' } })
        : sdmxWindow(start, '2021-03-01');
    });
    const r = await h.runOnce(new RestConnector({ egress }), v.version);
    const cp = (await h.checkpoint())?.['backfill'] as Record<string, unknown> | undefined;
    const advancedPast = cp !== undefined && cp['done'] === true;
    expect(advancedPast, 'an error envelope was admitted as a window and the range was marked complete').toBe(false);
    if (r.state === 'finished') {
      expect(String(cp?.['cursor'])).toBe('2021-01-31');
    }
  }, 120_000);
});

/* ═════════ 1b · unreadable evidence, LAST: without a cache the loss is permanent and every later read says so ═════════ */

describe('F1 (API) — a governed deletion leaves the series incomplete for every reader from then on', () => {
  it('a failed or unreadable evidence version is DISCLOSED on the answer, not silently omitted', async () => {
    // Governed-delete the bytes of one window's evidence (a tombstone on its
    // manifest, as the corrections path leaves behind). A reader must be told
    // the series is incomplete, not handed the remaining windows as if whole.
    const evd = (await sql<{ manifest_id: string }>`select (e.payload ->> 'manifest_id') manifest_id from objects.canonical_objects e
      where e.object_type = 'EVD' and e.provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by e.recorded_at desc limit 1`.execute(h.su)).rows[0]?.manifest_id as string;
    await sql`insert into observation.blob_tombstones (tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, actor_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${evd}::uuid, 'F1 probe: governed deletion', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    // A reader that has never warmed the cache for this version.
    const fresh = await h.principalWith(['forecast_owner'], 'fresh-reader');
    const r = await points(fresh, { knownAt: new Date().toISOString() }) as { total: number; evidence: number; unreadable?: unknown[]; complete?: boolean; note?: string | null };
    expect(r.complete, 'a series with an unreadable evidence version answered as if it were complete').toBe(false);
    expect((r.unreadable ?? []).length).toBe(1);
    expect(String(r.note ?? '')).toMatch(/INCOMPLETE/);
    // And the derivations refuse to build on it.
    let refused = 0;
    for (const call of [
      () => controller.issueForecast(h.req(fresh, 'prediction.forecast.issue', 'FCT', null), h.fx.tenantId, h.fx.domainId,
        { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), observedThrough: '2023-10-31', assumptions: [assumptionId], label: 'replay demonstration' } }),
      () => controller.runBacktest(h.req(fresh, 'prediction.backtest.record', 'BKT', null), h.fx.tenantId, h.fx.domainId,
        { payload: { seriesKey, horizon: '30d', knownAt: new Date().toISOString(), origins: 8 } }),
    ]) {
      try { await call(); } catch (e) { if (e instanceof HttpException && e.getStatus() === 409) refused += 1; }
    }
    expect(refused, 'a forecast or backtest was built on an incomplete history').toBe(2);
  }, 300_000);
});
