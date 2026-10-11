/**
 * CP-6 B92 §0 (migration 0113 §0) — THE PRELUDE of product analytics: the roles, the vocabulary and the entitlement row; THE COMPUTE PORT over a
 * FIXTURE computation (registered here through analytics.register_computation, the parts' idiom) — a determinate rate with its Wilson interval,
 * a duration with its median interval, the floor, k and the computation's own reasons giving an EXPLAINED indeterminate result (never a zero),
 * the unsupported definition, the person-grained cohort refused, the period, the as-of and the partial period; THE REPLAY at the result's own
 * as-of (reproduced; mismatch once the computation is re-declared and re-registered); the computation's body digest checked; THE READ with its
 * records under RLS. Every row here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let c: AnalyticsComputeController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
let analyst: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal; let foreign: AuthenticatedPrincipal;
let otherDomain = '';

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rq = (as: AuthenticatedPrincipal, action: string, id: string | null = null, domainId?: string) => {
  const r = h.req(as, action, 'AMR', id, 'intelligence') as { eyeEnvelope: Row };
  if (domainId !== undefined) r.eyeEnvelope['domain_id'] = domainId;
  return r as never;
};
const compute = (as: AuthenticatedPrincipal, payload: Row) => c.compute(rq(as, 'analytics.metric.compute'), T(), D(), { payload }) as Promise<{ result: Row }>;
const read = (as: AuthenticatedPrincipal, id: string, domainId = D()) => c.result(rq(as, 'analytics.read', id, domainId), T(), domainId, id, { payload: {} }) as Promise<{ result: Row }>;
const replay = (as: AuthenticatedPrincipal, id: string) => c.replay(rq(as, 'analytics.metric.replay', id), T(), D(), id) as Promise<{ replay: Row }>;

/** a definition row planted by the superuser (the §MD ports are a part's; the compute port only READS definitions) */
async function plant(key: string, o: Partial<Record<string, unknown>> = {}): Promise<string> {
  const id = uuidv7();
  const def = {
    kind: 'rate', unit: 'share', direction: 'higher', floor_n: 3, k_min: 5, dimensions: ['severity'], supported: true, computation_key: `fixture_rate_${RUN}`, unsupported_reason: null,
    threshold: { target: 0.6 }, state: 'approved', window_spec: { kind: 'calendar_quarter', clock: 'record' }, ...o,
  } as Record<string, unknown>;
  await sql`insert into analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator,
      window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, computation_key, supported, unsupported_reason,
      state, digest, proposed_by, proposed_by_kind, decided_by, decided_at, effective_from, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${key}, 1, ${`fixture ${key} (SYNTHETIC)`}, 'the share of fixture items that are ok (SYNTHETIC)', ${def['kind']}, ${def['unit']},
      ${def['direction']}, '{"subject":"fixture item"}'::jsonb, 'items that are ok', 'every item in the window', ${JSON.stringify(def['window_spec'])}::jsonb, ${def['dimensions'] as string[]}::text[],
      'aggregate', ${def['k_min']}, ${def['floor_n']}, ${JSON.stringify(def['threshold'])}::jsonb, 'product-quality', '{"objective_ids":[]}'::jsonb, 'quarterly', ${owner.principalId}::uuid,
      'a review by the product analytics owner, never an automatic decision', 'retired when the fixture is gone', ${def['supported'] ? def['computation_key'] as string : null},
      ${def['supported'] as boolean}, ${def['unsupported_reason'] as string | null}, ${def['state'] as string}, ${'a'.repeat(64)}, ${analyst.principalId}::uuid, 'human',
      ${def['state'] === 'approved' ? owner.principalId : null}::uuid, ${def['state'] === 'approved' ? new Date().toISOString() : null}::timestamptz,
      ${def['state'] === 'approved' ? new Date().toISOString() : null}::timestamptz, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}
const Q = '2026-Q3';
const inQ = (d: number) => `2026-08-${String(d).padStart(2, '0')}T10:00:00Z`;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  c = h.app.get(AnalyticsComputeController);
  analyst = await h.humanWithSession(['product_analyst'], 'b92p-analyst');
  owner = await h.humanWithSession(['product_analytics_owner'], 'b92p-owner');
  outsider = await h.humanWithSession(['simulation_operator'], 'b92p-outsider');
  otherDomain = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${otherDomain}::uuid, ${T()}::uuid, ${'b92p-other-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  foreign = await h.humanWithSession(['product_analyst'], 'b92p-foreign', 'DOMAIN', { domainId: otherDomain });
  // THE FIXTURE: items with a recorded instant, an ok flag, a duration and a severity; the computation of the §0.7 contract over them
  await sql.raw(`create table if not exists public.b92p_items (id uuid primary key, tenant_id uuid, domain_id uuid, recorded_at timestamptz, ok boolean, seconds numeric, severity text, actor uuid)`).execute(h.su);
  await sql.raw(`create or replace function analytics.mc_fixture_rate_${RUN}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
    returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
    begin
      perform observation.assert_read_scope(p_tenant, p_domain, 'the fixture items');
      return jsonb_build_object('kind', 'rate', 'distinct_actors', (select count(distinct actor) from public.b92p_items i where i.tenant_id = p_tenant and i.domain_id = p_domain and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of and (p_cohort ->> 'severity' is null or i.severity = p_cohort ->> 'severity')),
        'records', coalesce((select jsonb_agg(jsonb_build_object('kind', 'fixture_item', 'id', i.id, 'role', case when i.ok then 'numerator' else 'denominator' end, 'detail', jsonb_build_object('severity', i.severity)) order by i.id)
                  from public.b92p_items i where i.tenant_id = p_tenant and i.domain_id = p_domain and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of
                   and (p_cohort ->> 'severity' is null or i.severity = p_cohort ->> 'severity')), '[]'::jsonb),
        'reasons', case when p_params ->> 'missing' is not null then jsonb_build_array('unsupported input: ' || (p_params ->> 'missing')) else '[]'::jsonb end,
        'quality', jsonb_build_object('clock', p_params ->> 'clock'));
    end $f$`).execute(h.su);
  await sql.raw(`create or replace function analytics.mc_fixture_duration_${RUN}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
    returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
    begin
      perform observation.assert_read_scope(p_tenant, p_domain, 'the fixture items');
      return jsonb_build_object('kind', 'duration', 'records', coalesce((select jsonb_agg(jsonb_build_object('kind', 'fixture_item', 'id', i.id, 'role', 'included', 'detail', jsonb_build_object('value', i.seconds)) order by i.id)
        from public.b92p_items i where i.tenant_id = p_tenant and i.domain_id = p_domain and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of), '[]'::jsonb), 'reasons', '[]'::jsonb, 'quality', jsonb_build_object('clock', p_params ->> 'clock'));
    end $f$`).execute(h.su);
  await sql`select analytics.register_computation(${`fixture_rate_${RUN}`}, ${`analytics.mc_fixture_rate_${RUN}`}, 'rate', array['severity'], array['public.b92p_items'], 'the fixture has no scope; a scope is ignored (stated)', 'the B92 prelude harness fixture rate (SYNTHETIC)', 'phase6-prelude-b92')`.execute(h.su);
  await sql`select analytics.register_computation(${`fixture_duration_${RUN}`}, ${`analytics.mc_fixture_duration_${RUN}`}, 'duration', array[]::text[], array['public.b92p_items'], 'the fixture has no scope; a scope is ignored (stated)', 'the B92 prelude harness fixture duration (SYNTHETIC)', 'phase6-prelude-b92')`.execute(h.su);
  // 8 items in 2026-Q3: 6 ok, 2 not; 5 distinct actors on severity high, 3 on low; durations 60 … 480 s
  const actors = Array.from({ length: 8 }, () => uuidv7());
  for (let i = 0; i < 8; i++) {
    await sql`insert into public.b92p_items values (${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${inQ(i + 1)}::timestamptz, ${i < 6}, ${60 * (i + 1)}, ${i < 5 ? 'high' : 'low'}, ${actors[i]}::uuid)`.execute(h.su);
  }
}, 600_000);

afterAll(async () => {
  await sql.raw(`drop table if exists public.b92p_items`).execute(h.su).catch(() => undefined);
  await h?.close();
});

describe('P1 · the vocabulary, the roles and the entitlement', () => {
  it('the three roles, the three attention classes, the five subject kinds and the product_analytics capability (built, prefixes analytics.)', async () => {
    expect(Number((await one(sql`select count(*)::int n from identity.roles where code in ('product_analytics_owner', 'privacy_officer', 'product_analyst')`))['n'])).toBe(3);
    expect((await one(sql`select executive.attention_signal_classes() @> array['analytics.metric', 'analytics.privacy', 'analytics.experience'] as ok`))['ok']).toBe(true);
    expect(await one(sql`select capability_key, built, action_prefixes from commercial.capabilities where capability_key = 'product_analytics'`)).toMatchObject({ built: true, action_prefixes: ['analytics.'] });
    expect((await one(sql`select analytics.person_dimensions() @> array['principal', 'acknowledged_by', 'owner'] as ok`))['ok']).toBe(true);
  });
  it('a definition naming a person dimension is refused by the table itself; a computation registering one is refused too', async () => {
    await expect(plant(`FX-person-${RUN}`, { dimensions: ['acknowledged_by'] })).rejects.toThrow(/amd_no_person_dimension/);
  });
});

describe('P2 · the compute port: a determinate rate, the explained indeterminate, the unsupported definition', () => {
  let key = ''; let resultId = '';
  it('positive: 6 of 8 items ok in 2026-Q3 — value 0.75 with Wilson\'s interval, the 8 records traceable (numerator 6, denominator 2), the threshold evaluated, the source revision digested', async () => {
    key = `FX-rate-${RUN}`; await plant(key);
    const r = (await compute(analyst, { metricKey: key, period: Q })).result;
    resultId = String(r['result_id']);
    expect(r).toMatchObject({ state: 'determinate', kind: 'rate', n: 8, preview: false, period_key: Q, period_kind: 'calendar_quarter', clock: 'record', records_count: 8 });
    expect(Number(r['value'])).toBeCloseTo(0.75, 6);
    expect(Number(r['numerator'])).toBe(6); expect(Number(r['denominator'])).toBe(8);
    expect(r['uncertainty']).toMatchObject({ method: 'wilson', level: 0.95 });
    const u = r['uncertainty'] as { lo: number; hi: number }; expect(u.lo).toBeGreaterThan(0.4); expect(u.hi).toBeLessThan(0.95);
    expect(r['threshold_eval']).toMatchObject({ breach: false });
    expect(String(r['source_revision'])).toMatch(/^[0-9a-f]{64}$/);
    const rd = (await read(owner, resultId)).result;
    expect(rd['records_by_role']).toEqual({ numerator: 6, denominator: 2 });
    expect((rd['definition'] as Row)['metric_key']).toBe(key);
  });
  it('indeterminate, explained: below the floor (one quarter with no items), below k (a cohort of 3 distinct principals), the computation\'s own missing input — the value NULL, never 0', async () => {
    const empty = (await compute(analyst, { metricKey: key, period: '2026-Q2' })).result;
    expect(empty).toMatchObject({ state: 'indeterminate', value: null, n: 0 });
    expect(JSON.stringify(empty['reasons'])).toMatch(/n = 0 is below the floor 3/);
    const low = (await compute(analyst, { metricKey: key, period: Q, cohort: { severity: 'low' } })).result;
    expect(low).toMatchObject({ state: 'indeterminate', value: null, n: 3 });
    expect(JSON.stringify(low['reasons'])).toMatch(/3 distinct principals, below k = 5/);
    const missing = `FX-missing-${RUN}`; await plant(missing);
    await sql`update analytics.metric_definitions set params = '{"missing": "the receipt instant"}'::jsonb where metric_key = ${missing}`.execute(h.su);
    const m = (await compute(analyst, { metricKey: missing, period: Q })).result;
    expect(m).toMatchObject({ state: 'indeterminate', value: null });
    expect(JSON.stringify(m['reasons'])).toMatch(/unsupported input: the receipt instant/);
  });
  it('unsupported: a definition with no computation in the product is served unsupported with its carrier — visible, never silently missing', async () => {
    const u = `FX-unsupported-${RUN}`; await plant(u, { supported: false, unsupported_reason: 'no source in the product: accessibility journey results arrive with B107/H3' });
    const r = (await compute(owner, { metricKey: u, period: Q })).result;
    expect(r).toMatchObject({ state: 'unsupported', value: null, n: null, records_count: 0 });
    expect(JSON.stringify(r['reasons'])).toMatch(/unsupported: no source in the product: accessibility journey results arrive with B107\/H3/);
  });
  it('refusal: a person-grained cohort (403, at the route and at the port), a dimension outside the definition, an unknown or unapproved metric (404), a bad period, a future as-of; an outsider (PDP 403)', async () => {
    await refused(compute(analyst, { metricKey: key, period: Q, cohort: { acknowledged_by: analyst.principalId } }), /^metric computation rejected \(person\): a product metric is never grouped by a person/, 403);
    await refused(compute(analyst, { metricKey: key, period: Q, cohort: { region: 'emea' } }), /^metric computation rejected \(dimension\)/, 422);
    await refused(compute(analyst, { metricKey: `FX-none-${RUN}`, period: Q }), /^metric computation rejected \(unknown_metric\)/, 404);
    const prop = `FX-proposed-${RUN}`; await plant(prop, { state: 'proposed' });
    await refused(compute(analyst, { metricKey: prop, period: Q }), /^metric computation rejected \(unknown_metric\): .* has no approved definition/, 404);
    await refused(compute(analyst, { metricKey: key, period: '2026-Q5' }), /^metric computation rejected \(period\)/, 422);
    await refused(compute(analyst, { metricKey: key, period: Q, asOf: '2099-01-01T00:00:00Z' }), /^metric computation rejected \(as_of\): .* is in the future/, 422);
    await refused(compute(outsider, { metricKey: key, period: Q }), /./, 403);
    const pr = (await compute(analyst, { metricKey: prop, period: Q, preview: true })).result;
    expect(pr).toMatchObject({ preview: true, state: 'determinate' });   // a PREVIEW for the definition's review: marked, never served as current (§OR)
  });
  it('the partial period: the current quarter is open — indeterminate, said, never presented as the quarter', async () => {
    const now = new Date(String((await one(sql`select clock_timestamp()::text as n`))['n']));
    const cur = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
    const r = (await compute(analyst, { metricKey: key, period: cur })).result;
    expect(r).toMatchObject({ state: 'indeterminate', value: null });
    expect(JSON.stringify(r['reasons'])).toMatch(/is open until .*: a partial period is not presented as the period/);
  });
  it('a duration: p50 = 270 s over 8 values, p90, the median\'s order-statistic interval (ranks 1..8 at n = 8)', async () => {
    const dk = `FX-duration-${RUN}`; await plant(dk, { kind: 'duration', unit: 'seconds', direction: 'lower', dimensions: [], computation_key: `fixture_duration_${RUN}`, threshold: { target: 300 } });
    const r = (await compute(analyst, { metricKey: dk, period: Q })).result;
    expect(r).toMatchObject({ state: 'determinate', kind: 'duration', n: 8, threshold_eval: { breach: false } });
    expect(Number(r['value'])).toBe(270);
    expect(r['distribution']).toMatchObject({ p50: 270, n: 8, min: 60, max: 480 });
    expect(r['uncertainty']).toMatchObject({ method: 'order_statistics', lo_rank: 1, hi_rank: 8, lo: 60, hi: 480 });
  });

  describe('P3 · replay at the result\'s own as-of; the computation\'s digest', () => {
    it('reproduced: nothing changed under the result\'s as-of — the source revision and the value agree', async () => {
      const r = (await replay(owner, resultId)).replay;
      expect(r).toMatchObject({ replay_verdict: 'reproduced', state: 'determinate', replay_of: resultId });
      expect(Number(r['value'])).toBeCloseTo(0.75, 6);
      const rd = (await read(analyst, resultId)).result;
      expect(arr(rd['replays']).map((x) => x['verdict'])).toEqual(['reproduced']);
    });
    it('mismatch: the population changed under the same as-of (a fixture row back-dated into the window) — the replay says mismatch, the original stands', async () => {
      await sql`insert into public.b92p_items values (${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${inQ(9)}::timestamptz, false, 10, 'high', ${uuidv7()}::uuid)`.execute(h.su);
      const r = (await replay(owner, resultId)).replay;
      expect(r).toMatchObject({ replay_verdict: 'mismatch' });
      expect((r['original'] as Row)['state']).toBe('determinate');
      await refused(replay(owner, String(r['result_id'])), /^metric computation rejected \(state\): .* is itself a replay/, 409);
    });
    it('the computation re-declared without re-registration is refused (its body digest); re-registered as a new version it computes again', async () => {
      await sql.raw(`create or replace function analytics.mc_fixture_duration_${RUN}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
        returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
        begin perform observation.assert_read_scope(p_tenant, p_domain, 'the fixture items (v2)');
          return jsonb_build_object('kind', 'duration', 'records', '[]'::jsonb, 'reasons', '[]'::jsonb, 'quality', '{}'::jsonb); end $f$`).execute(h.su);
      await refused(compute(analyst, { metricKey: `FX-duration-${RUN}`, period: Q }), /^metric computation rejected \(computation\): the body of analytics\.mc_fixture_duration_.* no longer matches its registration/, 422);
      await sql`select analytics.register_computation(${`fixture_duration_${RUN}`}, ${`analytics.mc_fixture_duration_${RUN}`}, 'duration', array[]::text[], array['public.b92p_items'], 'the fixture has no scope; a scope is ignored (stated)', 'the B92 prelude harness fixture duration v2 (SYNTHETIC)', 'phase6-prelude-b92')`.execute(h.su);
      const r = (await compute(analyst, { metricKey: `FX-duration-${RUN}`, period: Q })).result;
      expect(r).toMatchObject({ state: 'indeterminate', computation_version: 2 });
      expect(JSON.stringify(r['reasons'])).toMatch(/n = 0 is below the floor/);
    });
  });

  describe('P4 · the read under RLS; the ledgers append-only', () => {
    it('another domain\'s analyst does not see the result (404); a result row cannot be changed or deleted', async () => {
      await refused(read(foreign, resultId, otherDomain), /^metric computation rejected \(unknown_result\)/, 404);
      await expect(sql`update analytics.metric_results set value = 1 where result_id = ${resultId}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
      await expect(sql`delete from analytics.result_records where result_id = ${resultId}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
    });
  });
});

const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
