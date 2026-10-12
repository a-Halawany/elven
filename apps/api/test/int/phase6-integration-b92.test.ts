/**
 * CP-6 B92 §I (0113 §I, the integrator's section) — EXCEPTIONS and MANUAL ADJUSTMENTS (PR-70-002 `exception`; App M Audit "manual adjustments,
 * exceptions, approvals and uses remain replayable"), on the folded 0113 through the real routes:
 *   I1 · a threshold exemption proposed by an analyst, approved by a named product analytics owner at its digest (the proposer, a non-owner and a
 *        stale digest refused); with it in force a breaching result raises NO review and its routing SAYS why; revoked → the next breach raises the
 *        review (routed `analytics.metric`, a review — never an automatic decision).
 *   I2 · a manual adjustment beside a result: proposed with evidence, approved by the owner (never the proposer); the RESULT never changes; the read
 *        shows the adjustment beside it; a preview, a replay or an unsupported result is never adjusted; the decided adjustment is frozen.
 * Every row here is SYNTHETIC fixture data (the prelude harness's planted-definition / fixture-computation idiom).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { AnalyticsExceptionsController } from '../../src/analytics/integration/exceptions.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let c: AnalyticsComputeController; let x: AnalyticsExceptionsController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
let analyst: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let owner2: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
const KEY = `FXI-rate-${RUN}`; const Q = '2026-Q3';

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rq = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'AMR', id, 'intelligence') as never;
const compute = async (as: AuthenticatedPrincipal) => (await c.compute(rq(as, 'analytics.metric.compute'), T(), D(), { payload: { metricKey: KEY, period: Q } }) as { result: Row }).result;
const read = async (id: string) => (await c.result(rq(owner, 'analytics.read', id), T(), D(), id, { payload: {} }) as { result: Row }).result;
const propEx = (as: AuthenticatedPrincipal, payload: Row = {}) => x.proposeException(rq(as, 'analytics.exception.propose'), T(), D(), { payload: { metricKey: KEY, kind: 'threshold_exemption', period: Q,
  reason: 'the corridor closure quarter is not representative (SYNTHETIC)', expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), ...payload } }) as Promise<{ exception: Row }>;
const decEx = (as: AuthenticatedPrincipal, id: string, payload: Row) => x.decideException(rq(as, 'analytics.exception.decide', id), T(), D(), id, { payload: { reason: 'reviewed against the quarter\'s records (SYNTHETIC)', ...payload } }) as Promise<{ exception: Row }>;
const propAdj = (as: AuthenticatedPrincipal, resultId: string, payload: Row = {}) => x.proposeAdjustment(rq(as, 'analytics.adjustment.propose', resultId), T(), D(), { payload: { resultId, value: 0.7,
  reason: 'one item was double-counted at the source; corrected value stated (SYNTHETIC)', evidence: [{ kind: 'fixture_item', note: 'the duplicate (SYNTHETIC)' }], ...payload } }) as Promise<{ adjustment: Row }>;
const decAdj = (as: AuthenticatedPrincipal, id: string, payload: Row) => x.decideAdjustment(rq(as, 'analytics.adjustment.decide', id), T(), D(), id, { payload: { reason: 'the duplicate is confirmed (SYNTHETIC)', ...payload } }) as Promise<{ adjustment: Row }>;
const breachItems = async () => Number((await one(sql`select count(*)::int n from executive.attention_items where tenant_id = ${T()}::uuid and signal_class = 'analytics.metric'
  and details ->> 'origin' = 'threshold_breach' and details ->> 'metric_key' = ${KEY} and state <> 'closed'`))['n']);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  c = h.app.get(AnalyticsComputeController); x = h.app.get(AnalyticsExceptionsController);
  analyst = await h.humanWithSession(['product_analyst'], 'b92i-analyst');
  owner = await h.humanWithSession(['product_analytics_owner'], 'b92i-owner');
  owner2 = await h.humanWithSession(['product_analytics_owner'], 'b92i-owner-2');
  outsider = await h.humanWithSession(['simulation_operator'], 'b92i-outsider');
  await sql.raw(`create table if not exists public.b92i_items (id uuid primary key, tenant_id uuid, domain_id uuid, recorded_at timestamptz, ok boolean)`).execute(h.su);
  await sql.raw(`create or replace function analytics.mc_fxi_rate_${RUN}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
    returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
    begin perform observation.assert_read_scope(p_tenant, p_domain, 'the fixture items');
      return jsonb_build_object('kind', 'rate', 'records', coalesce((select jsonb_agg(jsonb_build_object('kind', 'fixture_item', 'id', i.id, 'role', case when i.ok then 'numerator' else 'denominator' end) order by i.id)
        from public.b92i_items i where i.tenant_id = p_tenant and i.domain_id = p_domain and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of), '[]'::jsonb),
        'reasons', '[]'::jsonb, 'quality', jsonb_build_object('clock', p_params ->> 'clock', 'newest_record_at', (select max(recorded_at) from public.b92i_items i where i.tenant_id = p_tenant), 'excluded_count', 0, 'composition', '{}'::jsonb));
    end $f$`).execute(h.su);
  await sql`select analytics.register_computation(${`fxi_rate_${RUN}`}, ${`analytics.mc_fxi_rate_${RUN}`}, 'rate', array[]::text[], array['public.b92i_items'], 'the fixture has no scope; a scope is ignored (stated)', 'the B92 §I harness fixture (SYNTHETIC)', 'phase6-integration-b92')`.execute(h.su);
  await sql`insert into analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator,
      window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, computation_key, supported, state, digest,
      proposed_by, proposed_by_kind, decided_by, decided_at, effective_from, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${KEY}, 1, 'fixture rate (SYNTHETIC)', 'the share of fixture items that are ok (SYNTHETIC)', 'rate', 'share', 'higher',
      '{"subject":"fixture item"}'::jsonb, 'ok items', 'every item', '{"kind":"calendar_quarter","clock":"record","max_staleness_days":3650}'::jsonb, '{}', 'aggregate', 5, 3,
      '{"target":0.9}'::jsonb, 'product-quality', '{"value_measure":"fixture"}'::jsonb, 'quarterly', ${owner.principalId}::uuid, 'a review by the product analytics owner, never an automatic decision',
      'retired when the fixture is gone', ${`fxi_rate_${RUN}`}, true, 'approved', ${'b'.repeat(64)}, ${analyst.principalId}::uuid, 'human', ${owner.principalId}::uuid, clock_timestamp(), clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su);
  for (let i = 0; i < 10; i++) await sql`insert into public.b92i_items values (${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${`2026-08-${String(i + 1).padStart(2, '0')}T09:00:00Z`}::timestamptz, ${i < 7})`.execute(h.su);
}, 600_000);

afterAll(async () => { await sql.raw(`drop table if exists public.b92i_items`).execute(h.su).catch(() => undefined); await h?.close(); });

describe('I1 · a threshold exemption: proposed, approved by the owner at its digest, honoured by the breach routing, revoked', () => {
  let ex: Row = {};
  it('refusal: an outsider proposing (PDP 403); a person cohort (403); an expiry past 366 days (422); an unknown metric (404)', async () => {
    await refused(propEx(outsider), /./, 403);
    await refused(propEx(analyst, { cohort: { acknowledged_by: analyst.principalId } }), /^metric definition rejected \(person\)/, 403);
    await refused(propEx(analyst, { expiresAt: new Date(Date.now() + 400 * 86_400_000).toISOString() }), /^metric definition rejected \(expiry\)/, 422);
    await refused(propEx(analyst, { metricKey: `FXI-none-${RUN}` }), /^metric definition rejected \(unknown_metric\)/, 404);
  });
  it('positive: the analyst proposes; the proposer cannot decide, a stale digest is refused; the owner approves — a 0.7 breach raises NO review, the routing says why', async () => {
    ex = (await propEx(analyst)).exception;
    expect(ex).toMatchObject({ state: 'proposed', kind: 'threshold_exemption', period_key: Q });
    await refused(decEx(analyst, String(ex['exception_id']), { decision: 'approve', digest: ex['digest'] }), /./, 403);
    await refused(decEx(owner, String(ex['exception_id']), { decision: 'approve', digest: 'f'.repeat(64) }), /^metric definition rejected \(stale\)/, 409);
    expect((await decEx(owner, String(ex['exception_id']), { decision: 'approve', digest: ex['digest'] })).exception).toMatchObject({ state: 'approved', decided_by: owner.principalId });
    const r = await compute(analyst);
    expect(r).toMatchObject({ state: 'determinate', threshold_eval: { breach: true } });
    expect(Number(r['value'])).toBeCloseTo(0.7, 6);
    const routed = JSON.stringify((r['after'] as Row)['routed']);
    expect(routed).toMatch(/"exempted_by":"[0-9a-f-]{36}"/); expect(routed).toMatch(/an approved threshold exemption is in force/);
    expect(await breachItems()).toBe(0);
    expect((await read(String(r['result_id'])))['exemption']).toBe(ex['exception_id']);
  });
  it('recovery: the owner REVOKES the exemption — the next breach raises the review (analytics.metric, origin threshold_breach); a revoked exemption cannot be revoked again (409)', async () => {
    expect((await decEx(owner2, String(ex['exception_id']), { decision: 'revoke' })).exception).toMatchObject({ state: 'revoked' });
    await refused(decEx(owner2, String(ex['exception_id']), { decision: 'revoke' }), /^metric definition rejected \(state\)/, 409);
    await compute(analyst);
    expect(await breachItems()).toBe(1);
  });
});

describe('I2 · a manual adjustment beside a result — the result never changes', () => {
  let resultId = ''; let adj: Row = {};
  it('positive: proposed with evidence by the analyst, approved by the owner; the result\'s value stays 0.7; the read shows the adjustment beside it', async () => {
    resultId = String((await compute(analyst))['result_id']);
    adj = (await propAdj(analyst, resultId)).adjustment;
    expect(adj).toMatchObject({ state: 'proposed', result_id: resultId });
    await refused(decAdj(owner, String(adj['adjustment_id']), { decision: 'approve', digest: 'e'.repeat(64) }), /^metric computation rejected \(stale\)/, 409);
    expect((await decAdj(owner, String(adj['adjustment_id']), { decision: 'approve', digest: adj['digest'] })).adjustment).toMatchObject({ state: 'approved' });
    const rd = await read(resultId);
    expect(Number(rd['value'])).toBeCloseTo(0.7, 6);
    expect((rd['adjustments'] as Row[]).map((a) => [a['state'], Number(a['adjusted_value'])])).toEqual([['approved', 0.7]]);
  });
  it('refusal: no evidence (422), a rate outside [0, 1] (422), a replay (409), the proposer deciding (403 at the PDP — the analyst holds no decide rule); a decided adjustment is frozen', async () => {
    await refused(propAdj(analyst, resultId, { evidence: [] }), /^metric computation rejected \(evidence\)/, 422);
    await refused(propAdj(analyst, resultId, { value: 1.4 }), /^metric computation rejected \(adjustment\): a rate lies in \[0, 1\]/, 422);
    const rp = (await c.replay(rq(owner, 'analytics.metric.replay', resultId), T(), D(), resultId) as { replay: Row }).replay;
    await refused(propAdj(analyst, String(rp['result_id'])), /^metric computation rejected \(state\)/, 409);
    const a2 = (await propAdj(owner, resultId, { value: 0.65 })).adjustment;
    await refused(decAdj(owner, String(a2['adjustment_id']), { decision: 'approve', digest: a2['digest'] }), /^metric computation rejected \(separation_of_duties\)/, 403);
    await expect(sql`update analytics.result_adjustments set adjusted_value = 0.1 where adjustment_id = ${String(adj['adjustment_id'])}::uuid`.execute(h.su)).rejects.toThrow(/decided/);
  });
});
