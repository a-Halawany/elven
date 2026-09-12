/**
 * CODEX REVIEW OF aec404c1 — DATABASE AND API verification, second pass.
 *
 * Codex ran the TypeScript with dependency doubles and inspected the database
 * consequences in SQL. THIS file establishes those consequences through the real
 * ports, lifecycle and controllers on a real database before they are corrected.
 * Every assertion below FAILED at aec404c1 unless marked as a positive control.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import { Phase4Harness, SERIES_START, SERIES_END, syntheticEgress } from './phase4-helpers.js';
import type { PredictionController } from '../../src/prediction/prediction.controller.js';

let h: Phase4Harness;
let controller: PredictionController;
let owner: AuthenticatedPrincipal;
let ownerId = '';
let seriesKey = '';
let sourceKey = '';
let knownAfterBackfill = '';

const register = async (key: string, extra: Record<string, unknown> = {}) =>
  controller.registerSeries(h.req(owner, 'prediction.series.register', 'SER', null), h.fx.tenantId, h.fx.domainId,
    { payload: { seriesKey: key, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day',
                 seasonalityDays: 7, attribution: 'Source: fixture statistics.', description: 'synthetic daily transits with a disruption episode', ...extra } });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { PredictionController: C } = await import('../../src/prediction/prediction.controller.js');
  controller = h.app.get(C);
  owner = await h.principalWith(['forecast_owner', 'strategy_owner'], 'forecast-owner');
  ownerId = owner.principalId;
  const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366 });
  sourceKey = v.sourceKey;
  const r = await h.runOnce(new RestConnector({ egress: syntheticEgress().egress }));
  expect(r.state, r.reason).toBe('finished');
  knownAfterBackfill = new Date().toISOString();
  seriesKey = `fixture:${sourceKey}:value`;
  await register(seriesKey);
}, 300_000);

afterAll(async () => { await h?.close(); });

const points = async (as: AuthenticatedPrincipal, key = seriesKey) =>
  controller.seriesPoints(h.req(as, 'prediction.read', 'SER', null), h.fx.tenantId, h.fx.domainId, key,
    { payload: { knownAt: new Date().toISOString(), limit: 5000 } }) as Promise<{ total: number; complete: boolean; unreadable: unknown[] }>;

const indicator = async (key: string, label: string) => (await controller.defineIndicator(
  h.req(owner, 'prediction.indicator.define', 'IND', null), h.fx.tenantId, h.fx.domainId,
  { payload: { seriesKey: key, description: `${label}: below 40 for five days`, comparator: '<', threshold: 40, consecutiveDays: 5, owner: ownerId } },
) as { indicator: { indicatorId: string } }).indicator.indicatorId;

const scenario = async (title: string, indicatorId: string, branchOwner: string, over: Record<string, unknown> = {}) => {
  const r = await controller.declareScenario(h.req(owner, 'prediction.scenario.declare', 'SCN', null), h.fx.tenantId, h.fx.domainId,
    { payload: { title, statement: 'probe', forecastId: null, owner: ownerId, reviewCadence: 'weekly',
                 branches: [
                   { name: 'Baseline', kind: 'baseline', statement: 'as is', owner: ownerId, consequence: 'keep the booked routing', responseWindowHours: 72 },
                   { name: 'Collapse', kind: 'downside', statement: 'below 40', indicatorId, owner: branchOwner, consequence: 'rebook the shipment now',
                     responseWindowHours: 48, ...over },
                 ] } }) as { scenario: { branches: Array<{ branchId: string; kind: string }> } };
  return r.scenario.branches.find((b) => b.kind === 'downside') as { branchId: string };
};

const evaluate = (indicatorId: string, timing: 'live' | 'replay' = 'live') =>
  controller.evaluateIndicator(h.req(owner, 'prediction.indicator.evaluate', 'IND', indicatorId), h.fx.tenantId, h.fx.domainId,
    indicatorId, { payload: { knownAt: new Date().toISOString(), timing } }) as Promise<{
      evaluation: { expiredWarnings: number; replayAsOf: string | null };
      warnings: Array<{ warningId: string; raisedAsOf: string; closesAt: string; timely: boolean | null; decisionMissed: boolean; recovered: boolean }> }>;

const warning = async (id: string) => (await sql<Record<string, unknown>>`select * from prediction.warnings_current where warning_id = ${id}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
const iso = (v: unknown) => new Date(String(v)).toISOString();

const acknowledge = (id: string, payload: Record<string, unknown>) =>
  controller.acknowledgeWarning(h.req(owner, 'prediction.warning.acknowledge', 'WRN', id), h.fx.tenantId, h.fx.domainId, id, { payload }) as Promise<{ warning: { state: string } }>;

/* ═════════ 1 · cached access survives revocation and deletion ═════════ */

describe('F1 (API) — a warm reader is re-authorised and the evidence re-checked on every read', () => {
  it('the same reader, its evidence-retrieval authority revoked after warming, is refused — not served from memory', async () => {
    const warm = await points(owner);
    expect(warm.total).toBe(1095);
    expect(warm.complete).toBe(true);
    // The same principal, whose session no longer carries the roles that grant observation.evidence.retrieve.
    const revoked: AuthenticatedPrincipal = { ...owner, bindings: [] } as AuthenticatedPrincipal;
    let status: number | null = null;
    try { await points(revoked); } catch (e) { status = e instanceof HttpException ? e.getStatus() : null; }
    expect(status, 'a reader whose authority was revoked was served cached points').toBe(403);
    // Positive control, preserved: a cold reader with no authority is refused the same way.
    const cold = await h.principalWith(['strategy_owner'], 'strategy-only');
    let coldStatus: number | null = null;
    try { await points(cold); } catch (e) { coldStatus = e instanceof HttpException ? e.getStatus() : null; }
    expect(coldStatus).toBe(403);
  });

});

/* ═════════ 3 · warning recovery after supersession ═════════ */

describe('F3 (database) — a recovered warning carries the controls of the evidence version the flip CITED', () => {
  it('after the cited version is superseded, recovery from ANOTHER indicator\'s evaluation resolves v1\'s rights, residency and retention', async () => {
    const indA = await indicator(seriesKey, 'supersession probe');
    const absent = await h.principalWith(['forecast_owner'], 'absent-owner');
    await sql`update identity.principals set status = 'suspended' where id = ${absent.principalId}::uuid`.execute(h.su);
    const branch = await scenario('Supersession probe', indA, absent.principalId);
    await expect(evaluate(indA)).rejects.toSatisfy((e: unknown) => e instanceof HttpException && e.getStatus() === 409);
    const owed = (await sql<{ warning_state: string; flip_event_id: string }>`select warning_state, flip_event_id::text from prediction.branches_current
      where branch_id = ${branch.branchId}::uuid`.execute(h.su)).rows[0];
    expect(owed?.warning_state).toBe('owed');
    const cited = (await sql<{ evd: string; ver: number }>`select (details ->> 'evidence_object_id') evd, (details ->> 'evidence_version')::int ver
      from prediction.scenario_events where event_id = ${owed?.flip_event_id}::uuid`.execute(h.su)).rows[0] as { evd: string; ver: number };
    expect(cited.ver).toBe(1);

    // The publisher restates the same windows under a contract version with DIFFERENT controls:
    // the cited objects gain a version 2, and the current assembly contributes only v2.
    const v = await h.newVersion({ from: SERIES_START, to: SERIES_END, windowDays: 366,
      controls: { residency: 'EU-only', licence: 'fixture-v2', retention: '30 days' } });
    const run = await h.runOnce(new RestConnector({ egress: syntheticEgress(() => (_d, x) => Number((x + 0.25).toFixed(3))).egress }), v.version);
    expect(run.state, run.reason).toBe('finished');
    const versions = (await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_id = ${cited.evd}::uuid`.execute(h.su)).rows[0]?.n;
    expect(Number(versions)).toBe(2);

    // The owner is back. A DIFFERENT indicator on a DIFFERENT series is evaluated; the owed flip is recovered from there.
    await sql`update identity.principals set status = 'active' where id = ${absent.principalId}::uuid`.execute(h.su);
    const otherKey = `${seriesKey}:other`;
    await register(otherKey);
    const indB = await indicator(otherKey, 'bystander');
    const r = await evaluate(indB);
    const recovered = r.warnings.filter((w) => w.recovered);
    expect(recovered.length, 'the owed warning was not recovered while evaluating another indicator').toBe(1);
    const w = await warning(recovered[0]?.warningId as string);
    const controls = w['controls'] as Record<string, unknown>;
    expect(controls['residency_profile'], 'the recovered warning took the superseding version\'s residency').toBe('EU');
    expect(controls['rights_profile']).toBe('fixture');
    expect(controls['retention_profile']).toBe('24 months');
    const header = (await sql<{ residency_profile: string; rights_profile: string; retention_profile: string }>`
      select residency_profile, rights_profile, retention_profile from objects.canonical_objects where object_id = ${w['warning_id']}::uuid`.execute(h.su)).rows[0];
    expect(header?.residency_profile).toBe('EU');
    expect(header?.rights_profile).toBe('fixture');
    expect(header?.retention_profile).toBe('24 months');
    const state = (await sql<{ warning_state: string }>`select warning_state from prediction.branches_current where branch_id = ${branch.branchId}::uuid`.execute(h.su)).rows[0];
    expect(state?.warning_state).toBe('raised');
  }, 300_000);
});

/* ═════════ 4/5 · late warnings, the replay clock on expiry and acknowledgement ═════════ */

describe('F4/F5 (database) — a missed decision is recorded with a valid window; issuance and response are timed apart', () => {
  it('a LIVE warning raised after its decision deadline is admitted as a missed decision, window still valid', async () => {
    const ind = await indicator(seriesKey, 'late live');
    await scenario('Late live', ind, ownerId, { decisionDeadline: '2020-01-01T00:00:00Z' });
    const r = await evaluate(ind, 'live');
    expect(r.warnings.length, 'a warning raised after its deadline was not admitted at all').toBe(1);
    const w = await warning(r.warnings[0]?.warningId as string);
    expect(w['decision_missed']).toBe(true);
    expect(w['timely']).toBe(false);
    expect(new Date(String(w['response_window_closes_at'])).getTime() - new Date(String(w['response_window_opens_at'])).getTime()).toBe(48 * 3_600_000);
    expect(iso(w['response_window_opens_at'])).toBe(iso(w['raised_as_of']));
  }, 120_000);

  it('raised EXACTLY at the deadline is a missed decision too', async () => {
    const ind = await indicator(seriesKey, 'at deadline');
    await scenario('At the deadline', ind, ownerId, { decisionDeadline: '2023-11-24T00:00:00Z' });
    const r = await evaluate(ind, 'replay');
    expect(r.warnings.length).toBe(1);
    const w = await warning(r.warnings[0]?.warningId as string);
    expect(iso(w['raised_as_of'])).toBe('2023-11-24T00:00:00.000Z');
    expect(w['decision_missed']).toBe(true);
    expect(w['timely']).toBe(false);
    expect(iso(w['response_window_closes_at'])).toBe('2023-11-26T00:00:00.000Z');
  }, 120_000);

  it('a replayed warning is answered AS OF a replay instant: in time, or late — the audit clock kept beside it', async () => {
    const indT = await indicator(seriesKey, 'timely response');
    await scenario('Timely response', indT, ownerId, { decisionDeadline: '2023-11-27T00:00:00Z' });
    const rT = await evaluate(indT, 'replay');
    const wid = rT.warnings[0]?.warningId as string;
    expect(rT.warnings[0]?.timely).toBe(true);
    // A replayed warning cannot be answered on the wall clock.
    await expect(acknowledge(wid, { note: 'rebooked' })).rejects.toThrow(/AS OF a replay instant/);
    const ack = await acknowledge(wid, { note: 'rebooked on the 25th', asOf: '2023-11-25T10:00:00Z' });
    expect(ack.warning.state).toBe('acknowledged');
    const w = await warning(wid);
    expect(w['response_timely']).toBe(true);
    expect(iso(w['acknowledged_as_of'])).toBe('2023-11-25T10:00:00.000Z');
    expect(new Date(String(w['acknowledged_at'])).getFullYear()).toBeGreaterThanOrEqual(2026);

    const indL = await indicator(seriesKey, 'late response');
    await scenario('Late response', indL, ownerId, { decisionDeadline: '2023-11-27T00:00:00Z' });
    const rL = await evaluate(indL, 'replay');
    const late = rL.warnings[0]?.warningId as string;
    const ackL = await acknowledge(late, { note: 'rebooked, but after the window', asOf: '2023-11-28T09:00:00Z' });
    expect(ackL.warning.state).toBe('acknowledged_late');
    const wl = await warning(late);
    expect(wl['state']).toBe('acknowledged');
    expect(wl['response_timely'], 'a late replayed response was not recorded as late').toBe(false);
    expect(wl['timely'], 'issuance timeliness was overwritten by response timeliness').toBe(true);
  }, 180_000);

  it('a replayed window expires against the REPLAY clock of a later evaluation, never against a live sweep', async () => {
    const indR = await indicator(seriesKey, 'replay expiry');
    await scenario('Replay expiry', indR, ownerId, { decisionDeadline: '2023-11-27T00:00:00Z' });
    const first = await evaluate(indR, 'replay');
    const wid = first.warnings[0]?.warningId as string;
    // A LIVE sweep (another indicator, live timing) leaves the replayed window alone.
    const indLive = await indicator(seriesKey, 'live bystander');
    await scenario('Live bystander', indLive, ownerId);
    await evaluate(indLive, 'live');
    expect((await warning(wid))['state']).toBe('raised');
    // A REPLAY evaluation whose clock (the newest observation, 2023-12-31) has passed the window expires it.
    const again = await evaluate(indR, 'replay');
    expect(again.evaluation.replayAsOf).toBe('2023-12-31T23:59:59Z');
    const w = await warning(wid);
    expect(w['state'], 'the replayed window was not expired by the replay clock').toBe('expired');
    expect(iso(w['expired_as_of'])).toBe('2023-12-31T23:59:59.000Z');
    expect(w['response_timely']).toBe(false);
    // Positive control, preserved: an expired warning cannot be acknowledged.
    await expect(acknowledge(wid, { note: 'too late', asOf: '2024-01-02T00:00:00Z' })).rejects.toThrow(/expired/);
  }, 180_000);
});

/* ═════════ 1b · governed deletion, LAST: it degrades the series for good ═════════ */

describe('F1 (API) — a governed deletion after warming is seen by the SAME reader on its next read', () => {
  it('a governed deletion after warming makes the SAME reader\'s next answer incomplete', async () => {
    const warm = await points(owner);
    expect(warm.complete).toBe(true);
    const manifest = (await sql<{ m: string }>`select (e.payload ->> 'manifest_id') m from objects.canonical_objects e
      where e.object_type = 'EVD' and e.provenance_ref like ${`SRC:${h.fx.sourceId}@%`} order by e.recorded_at desc limit 1`.execute(h.su)).rows[0]?.m as string;
    await sql`insert into observation.blob_tombstones (tombstone_id, scope, tenant_id, domain_id, manifest_id, reason, actor_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${h.fx.tenantId}::uuid, ${h.fx.domainId}::uuid, ${manifest}::uuid, 'F1 probe: governed deletion after warming', ${ownerId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const after = await points(owner);
    expect(after.complete, 'a warm reader was served a complete series after the evidence was governed-deleted').toBe(false);
    expect(after.unreadable.length).toBe(1);
    expect(after.total).toBeLessThan(1095);
    // Every read is a governed retrieval: custody records each one, not only the first.
    const retrievals = (await sql<{ n: string }>`select count(*)::text n from observation.custody_events
      where domain_id = ${h.fx.domainId}::uuid and event = 'custody.retrieved'`.execute(h.su)).rows[0]?.n;
    expect(Number(retrievals)).toBeGreaterThanOrEqual(4);
    // And every derivation refuses to build on it from now on: the loss is permanent until the version is withdrawn.
    await expect(evaluate(await indicator(seriesKey, 'after deletion'))).rejects.toSatisfy((e: unknown) => e instanceof HttpException && e.getStatus() === 409);
  }, 300_000);
});
