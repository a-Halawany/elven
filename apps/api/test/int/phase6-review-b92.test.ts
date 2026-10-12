/**
 * CP-6 B92 §OR (migration 0113_b92_x_or; row PR-70-001) — THE OPERATING REVIEW, on a real database through the real pipeline, PDP, ports and
 * controllers. The definitions, the scope, the fixture computations, the items they read, the results, the personas and every review here
 * are SYNTHETIC fixture data (planted by the superuser with the prelude's idiom — the §MD ports are another part's; the results are
 * computed through the PRELUDE's real compute port). The harness proves the SOFTWARE; the NORDWERK scene on eye_demo is a synthetic
 * demonstration; a signed acceptance of the business review is R2's.
 *
 *   OR1 · assemble: cites the latest NON-PREVIEW, non-replay, whole-population result per (metric, period, scope) — a newer preview and a
 *         domain-wide result are not cited; each citation recorded as a metric use; a metric with no result listed NOT COMPUTED (never
 *         hidden); refusals: a pinned preview, a replay, a mismatched result, an unknown result, a pin for a metric the review does not review,
 *         an assembler without the role; recovery: the missing metric computed, the draft re-assembled (round 2), an older result pinned.
 *   OR2 · the series: every period listed — before the deployment's first record `no history (the deployment holds no records before …)`,
 *         after it with no result `not computed`, computed periods with their state (an indeterminate one with its reasons, never 0); an
 *         unsupported metric's history is not established (said); periods on different definition versions are NOT comparable (said);
 *         refusals: an unknown metric, a rolling period, 13 periods.
 *   OR3 · hold / note / decide / close: the chair holds; notes by the chair and the participants' roles; the follow-through (an action with a
 *         named owner and due date — routed as an analytics.metric item to that owner — or no action) by the chair alone; the close signs
 *         the digest as read (stale refused, re-read, signed); closed → immutable (ports 409, the table guard, the child guard).
 *   OR4 · refusals: a non-chair close / hold / decide (403 at the port), an agent (the PEP's human gate), an agent in the database whose
 *         session claims a human (the PORT), an outsider (PDP 403); open with an unknown metric (404), a proposed-only metric (409), an
 *         unknown scope (404), a chair without a chair role, a participant that is not a role; a closed review edited (409); recovery: a
 *         corrected open.
 *   OR5 · the read: per metric the definition (title, meaning, population, numerator/denominator, window and clock, floor, owner), the cited
 *         result (value or the explained state, n, interval, window, clock, scope), the DRILL-DOWN route followed to the prelude's
 *         results/:id/read (definition → result → records); the series; notes, follow-through, ledger, the verified signature; the list;
 *         another domain's analyst sees nothing (404).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { AnalyticsReviewController } from '../../src/analytics/review/review.controller.js';
import { previousQuarter } from '../../src/analytics/seams.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let c: AnalyticsComputeController; let rv: AnalyticsReviewController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().replace(/-/g, '').slice(-6);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let analyst: AuthenticatedPrincipal;     // product_analyst — opens and assembles
let owner: AuthenticatedPrincipal;       // product_analytics_owner — the definitions' owner
let chair: AuthenticatedPrincipal;       // executive — the review's chair
let strategist: AuthenticatedPrincipal;  // strategy_owner — chair-capable, NOT this review's chair, not a participant role
let riskOwner: AuthenticatedPrincipal;   // risk_owner — a participant role
let actionOwner: AuthenticatedPrincipal; // forecast_owner — a follow-through action's owner
let outsider: AuthenticatedPrincipal;    // no analytics role
let machineExec: AuthenticatedPrincipal; // an AGENT in the database holding executive whose session claims a human (the PEP passes, the PORT refuses)
let foreign: AuthenticatedPrincipal; let otherDomain = '';

// ── refusals ─────────────────────────────────────────────────────────────────────────────────────
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

// ── the routes (the controllers, through the real pipeline) ──────────────────────────────────────
const rq = (as: AuthenticatedPrincipal, action: string, id: string | null = null, domainId?: string) => {
  const r = h.req(as, action, 'AOR', id, 'intelligence') as { eyeEnvelope: Row };
  if (domainId !== undefined) r.eyeEnvelope['domain_id'] = domainId;
  return r as never;
};
const compute = async (as: AuthenticatedPrincipal, payload: Row) => (await c.compute(rq(as, 'analytics.metric.compute'), T(), D(), { payload }) as { result: Row }).result;
const resultRead = async (as: AuthenticatedPrincipal, id: string) => (await c.result(rq(as, 'analytics.read', id), T(), D(), id, { payload: { recordsLimit: 100 } }) as { result: Row }).result;
const replay = async (as: AuthenticatedPrincipal, id: string) => (await c.replay(rq(as, 'analytics.metric.replay', id), T(), D(), id) as { replay: Row }).replay;
const open = async (as: AuthenticatedPrincipal, payload: Row) => (await rv.open(rq(as, 'analytics.review.open'), T(), D(), { payload }) as { review: Row }).review;
const assemble = async (as: AuthenticatedPrincipal, id: string, pins?: Row) => (await rv.assemble(rq(as, 'analytics.review.assemble', id), T(), D(), id, { payload: pins === undefined ? {} : { pins } }) as { assembly: Row }).assembly;
const hold = async (as: AuthenticatedPrincipal, id: string) => (await rv.hold(rq(as, 'analytics.review.hold', id), T(), D(), id) as { review: Row }).review;
const note = async (as: AuthenticatedPrincipal, id: string, payload: Row) => (await rv.note(rq(as, 'analytics.review.note', id), T(), D(), id, { payload }) as { note: Row }).note;
const decide = async (as: AuthenticatedPrincipal, id: string, payload: Row) => (await rv.decide(rq(as, 'analytics.review.decide', id), T(), D(), id, { payload }) as { followthrough: Row }).followthrough;
const close = async (as: AuthenticatedPrincipal, id: string, payload: Row) => (await rv.close(rq(as, 'analytics.review.close', id), T(), D(), id, { payload }) as { review: Row }).review;
const read = async (as: AuthenticatedPrincipal, id: string, domainId = D()) => (await rv.read(rq(as, 'analytics.read', id, domainId), T(), domainId, id) as { review: Row }).review;
const series = async (as: AuthenticatedPrincipal, payload: Row) => (await rv.series(rq(as, 'analytics.read'), T(), D(), { payload }) as { series: Row }).series;
const list = async (as: AuthenticatedPrincipal, payload: Row = {}) => (await rv.list(rq(as, 'analytics.read'), T(), D(), { payload }) as { reviews: Row[] }).reviews;

// ── the fixture: definitions planted by the superuser (the prelude idiom), computations registered, items recorded ────────────────
const K = { loop: `FXL-${RUN}`, ack: `FXA-${RUN}`, cal: `FXC-${RUN}`, none: `FXN-${RUN}`, prop: `FXP-${RUN}`, unsup: `FXU-${RUN}` };
const SCOPE = `rsc-${RUN}`;
const Q3 = '2026-Q3'; const Q2 = '2026-Q2';
async function plant(key: string, o: Partial<Record<string, unknown>> = {}): Promise<string> {
  const id = uuidv7();
  const def = {
    version: 1, kind: 'rate', unit: 'share', direction: 'higher', floor_n: 3, k_min: 5, dimensions: [] as string[], supported: true, computation_key: `b92or_rate_${RUN}`, unsupported_reason: null,
    threshold: {}, state: 'approved', params: {}, title: `fixture ${key} (SYNTHETIC)`, ...o,
  } as Record<string, unknown>;
  const approved = def['state'] === 'approved';
  await sql`insert into analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator,
      window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, computation_key, params, supported, unsupported_reason,
      state, digest, proposed_by, proposed_by_kind, decided_by, decided_at, effective_from, correlation_id)
    values (${id}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${key}, ${def['version'] as number}, ${def['title'] as string}, ${`the share of fixture items of ${key} that are ok (SYNTHETIC)`},
      ${def['kind'] as string}, ${def['unit'] as string}, ${def['direction'] as string}, '{"subject":"fixture item","inclusion":"recorded in the window, in the corridor"}'::jsonb,
      ${def['kind'] === 'rate' ? 'items that are ok' : null}, ${def['kind'] === 'rate' ? 'every item in the window and scope' : null},
      '{"kind":"calendar_quarter","clock":"record"}'::jsonb, ${def['dimensions'] as string[]}::text[], 'aggregate', ${def['k_min'] as number}, ${def['floor_n'] as number},
      ${JSON.stringify(def['threshold'])}::jsonb, 'product-quality', '{"objective_ids":[]}'::jsonb, 'quarterly', ${owner.principalId}::uuid,
      'a review by the product analytics owner, never an automatic decision', 'retired when the fixture is gone', ${def['supported'] ? def['computation_key'] as string : null},
      ${JSON.stringify(def['params'])}::jsonb, ${def['supported'] as boolean}, ${def['unsupported_reason'] as string | null}, ${def['state'] as string}, ${'b'.repeat(64)}, ${analyst.principalId}::uuid, 'human',
      ${approved ? owner.principalId : null}::uuid, ${approved ? new Date().toISOString() : null}::timestamptz, ${approved ? new Date().toISOString() : null}::timestamptz, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}
async function item(family: string, at: string, ok: boolean, seconds: number, inScope = true): Promise<void> {
  await sql`insert into public.b92or_items values (${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${family}, ${at}::timestamptz, ${ok}, ${seconds}, ${inScope})`.execute(h.su);
}
async function machine(roles: string[], label: string): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`b92or-${label}-${id.slice(-8)}`}, ${`b92or-${label.slice(0, 5)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: 'human', assurance: 'password', homeScope: 'DOMAIN', homeDomainId: D(), bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN', tenantId: T(), domainId: D() })) } as AuthenticatedPrincipal);
}
const dueIn = async (days: number) => String((await one(sql`select ((clock_timestamp() at time zone 'UTC')::date + ${days}::int)::text as d`))['d']);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  c = h.app.get(AnalyticsComputeController); rv = h.app.get(AnalyticsReviewController);
  analyst = await h.humanWithSession(['product_analyst'], 'b92or-analyst');
  owner = await h.humanWithSession(['product_analytics_owner'], 'b92or-owner');
  chair = await h.humanWithSession(['executive'], 'b92or-chair');
  strategist = await h.humanWithSession(['strategy_owner'], 'b92or-strategist');
  riskOwner = await h.humanWithSession(['risk_owner'], 'b92or-risk');
  actionOwner = await h.humanWithSession(['forecast_owner'], 'b92or-forecast');
  outsider = await h.humanWithSession(['simulation_operator'], 'b92or-outsider');
  machineExec = await machine(['executive'], 'machine-exec');
  otherDomain = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${otherDomain}::uuid, ${T()}::uuid, ${'b92or-other-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  foreign = await h.humanWithSession(['product_analyst', 'executive'], 'b92or-foreign', 'DOMAIN', { domainId: otherDomain });

  // THE FIXTURE ITEMS and the two computations of the §0.7 contract over them (a rate and a duration; the scope = the in-scope items)
  await sql.raw(`create table if not exists public.b92or_items (id uuid primary key, tenant_id uuid, domain_id uuid, family text, recorded_at timestamptz, ok boolean, seconds numeric, in_scope boolean)`).execute(h.su);
  await sql.raw(`create or replace function analytics.mc_b92or_rate_${RUN}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
    returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
    begin
      perform observation.assert_read_scope(p_tenant, p_domain, 'the B92 §OR fixture items');
      return jsonb_build_object('kind', 'rate',
        'records', coalesce((select jsonb_agg(jsonb_build_object('kind', 'b92or_item', 'id', i.id, 'role', case when i.ok then 'numerator' else 'denominator' end) order by i.id)
                  from public.b92or_items i where i.tenant_id = p_tenant and i.domain_id = p_domain and i.family = p_params ->> 'family'
                   and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of and (p_scope is null or i.in_scope)), '[]'::jsonb),
        'reasons', '[]'::jsonb, 'quality', jsonb_build_object('clock', p_params ->> 'clock'));
    end $f$`).execute(h.su);
  await sql.raw(`create or replace function analytics.mc_b92or_duration_${RUN}(p_tenant uuid, p_domain uuid, p_from timestamptz, p_to timestamptz, p_as_of timestamptz, p_scope jsonb, p_cohort jsonb, p_params jsonb)
    returns jsonb language plpgsql security definer set search_path = analytics, public, pg_catalog, pg_temp as $f$
    begin
      perform observation.assert_read_scope(p_tenant, p_domain, 'the B92 §OR fixture items');
      return jsonb_build_object('kind', 'duration',
        'records', coalesce((select jsonb_agg(jsonb_build_object('kind', 'b92or_item', 'id', i.id, 'role', 'included', 'detail', jsonb_build_object('value', i.seconds)) order by i.id)
                  from public.b92or_items i where i.tenant_id = p_tenant and i.domain_id = p_domain and i.family = p_params ->> 'family'
                   and i.recorded_at >= p_from and i.recorded_at < p_to and i.recorded_at <= p_as_of and (p_scope is null or i.in_scope)), '[]'::jsonb),
        'reasons', '[]'::jsonb, 'quality', jsonb_build_object('clock', p_params ->> 'clock'));
    end $f$`).execute(h.su);
  await sql`select analytics.register_computation(${`b92or_rate_${RUN}`}, ${`analytics.mc_b92or_rate_${RUN}`}, 'rate', array[]::text[], array['public.b92or_items'], 'an item concerns the scope when it is in_scope; a NULL scope = the domain (SYNTHETIC fixture)', 'the B92 §OR harness fixture rate (SYNTHETIC)', 'phase6-review-b92')`.execute(h.su);
  await sql`select analytics.register_computation(${`b92or_duration_${RUN}`}, ${`analytics.mc_b92or_duration_${RUN}`}, 'duration', array[]::text[], array['public.b92or_items'], 'an item concerns the scope when it is in_scope; a NULL scope = the domain (SYNTHETIC fixture)', 'the B92 §OR harness fixture duration (SYNTHETIC)', 'phase6-review-b92')`.execute(h.su);

  // THE DEFINITIONS (the scene's three, a never-computed one, a proposed-only one, an unsupported one) and THE SCOPE (the corridor)
  await plant(K.loop, { title: `Strategic loop closure rate (SYNTHETIC fixture ${RUN})`, params: { family: 'loop' }, floor_n: 3, threshold: { target: 0.6 } });
  await plant(K.ack, { title: `Warning acknowledgement latency (SYNTHETIC fixture ${RUN})`, kind: 'duration', unit: 'seconds', direction: 'lower', computation_key: `b92or_duration_${RUN}`, params: { family: 'ack' }, floor_n: 5, threshold: { target: 7200 } });
  await plant(K.cal, { title: `Forecast calibration (SYNTHETIC fixture ${RUN})`, direction: 'band', params: { family: 'cal' }, floor_n: 8, threshold: { band: [0.75, 0.85] } });
  await plant(K.cal, { version: 2, state: 'proposed', title: `Forecast calibration v2 (SYNTHETIC fixture ${RUN})`, direction: 'band', params: { family: 'cal' }, floor_n: 6, threshold: { band: [0.75, 0.85] } });
  await plant(K.none, { title: `Never computed (SYNTHETIC fixture ${RUN})`, params: { family: 'none' } });
  await plant(K.prop, { state: 'proposed', params: { family: 'loop' } });
  await plant(K.unsup, { supported: false, computation_key: null, unsupported_reason: 'no source in the product: accessibility journey results arrive with B107/H3' });
  await sql`insert into analytics.scopes (scope_id, scope, tenant_id, domain_id, scope_key, version, title, series_keys, geographies, description, state, digest, proposed_by, decided_by, decided_at, correlation_id)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${SCOPE}, 1, 'Red Sea corridor (SYNTHETIC)', array['fixture.corridor.series'], array['Bab el-Mandeb'],
            'the corridor scope of the operating review harness (SYNTHETIC)', 'approved', ${'c'.repeat(64)}, ${analyst.principalId}::uuid, ${owner.principalId}::uuid, clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su);

  // THE ITEMS: the first record of the deployment's population is 2026-04-10 (so 2025-Q4 and 2026-Q1 hold no history)
  await item('ack', '2026-04-10T08:00:00Z', true, 900); await item('ack', '2026-05-20T08:00:00Z', true, 1500);              // 2026-Q2: two acknowledgements (below the floor 5)
  for (const [i, ok] of [true, true, true, true, false].entries()) await item('loop', `2026-0${7 + (i % 3)}-1${i}T09:00:00Z`, ok, 0);          // 2026-Q3: 4 of 5 loops closed in the corridor
  await item('loop', '2026-08-20T09:00:00Z', false, 0, false); await item('loop', '2026-09-21T09:00:00Z', false, 0, false);  // …and two outside it
  for (let i = 1; i <= 6; i++) await item('ack', `2026-0${7 + (i % 3)}-0${i}T10:00:00Z`, true, 600 * i);                     // 2026-Q3: 6 latencies 600 … 3600 s
  for (let i = 1; i <= 6; i++) await item('cal', `2026-08-1${i}T10:00:00Z`, i <= 5, 0);                                      // 2026-Q3: 6 scored outcomes, 5 covered (below the floor 8)
  for (let i = 1; i <= 3; i++) await item('none', `2026-09-0${i}T10:00:00Z`, true, 0);
}, 600_000);

afterAll(async () => {
  await sql.raw(`drop table if exists public.b92or_items`).execute(h.su).catch(() => undefined);
  await h?.close();
});

// the results the review cites (computed through the prelude's compute port by the analyst)
let rLoopOld = ''; let rLoop = ''; let rLoopDomain = ''; let rAck = ''; let rAckQ2 = ''; let rCal = ''; let rCalPreview = ''; let rLoopReplay = '';
let reviewId = ''; let digestRead = '';

describe('OR1 · assemble: cite, never compute; not computed listed; a preview refused', () => {
  it('the results exist first (the prelude\'s compute port): the corridor loop closure 4/5, the latencies p50 2100 s, calibration INDETERMINATE (n 6 < floor 8), a newer preview, a domain-wide result', async () => {
    rLoopOld = String((await compute(analyst, { metricKey: K.loop, period: Q3, scopeKey: SCOPE }))['result_id']);
    const loop = await compute(analyst, { metricKey: K.loop, period: Q3, scopeKey: SCOPE }); rLoop = String(loop['result_id']);
    expect(loop).toMatchObject({ state: 'determinate', n: 5, scope_key: SCOPE }); expect(Number(loop['value'])).toBeCloseTo(0.8, 6);
    const dom = await compute(analyst, { metricKey: K.loop, period: Q3 }); rLoopDomain = String(dom['result_id']);
    expect(dom).toMatchObject({ n: 7, scope_key: null });
    const ack = await compute(analyst, { metricKey: K.ack, period: Q3, scopeKey: SCOPE }); rAck = String(ack['result_id']);
    expect(ack).toMatchObject({ state: 'determinate', n: 6 }); expect(Number(ack['value'])).toBe(2100);
    const ackQ2 = await compute(analyst, { metricKey: K.ack, period: Q2, scopeKey: SCOPE }); rAckQ2 = String(ackQ2['result_id']);
    expect(ackQ2).toMatchObject({ state: 'indeterminate', value: null, n: 2 });
    const cal = await compute(analyst, { metricKey: K.cal, period: Q3, scopeKey: SCOPE }); rCal = String(cal['result_id']);
    expect(cal).toMatchObject({ state: 'indeterminate', value: null, n: 6, definition_version: 1 });
    expect(JSON.stringify(cal['reasons'])).toMatch(/n = 6 is below the floor 8/);
    const prev = await compute(analyst, { metricKey: K.cal, period: Q3, scopeKey: SCOPE, preview: true }); rCalPreview = String(prev['result_id']);
    expect(prev).toMatchObject({ preview: true, definition_version: 2, state: 'determinate' });   // computed AFTER the v1 result — and never cited
    rLoopReplay = String((await replay(owner, rLoop))['result_id']);
  });

  it('positive: the analyst opens the 2026-Q3 corridor review (chair: an executive; participants by ROLE) and assembles it — three cited, the never-computed metric listed NOT COMPUTED', async () => {
    const r = await open(analyst, { title: `NORDWERK operating review 2026-Q3 — Red Sea corridor (SYNTHETIC ${RUN})`, period: Q3, scopeKey: SCOPE,
      metricKeys: [K.loop, K.ack, K.cal, K.none], chair: chair.principalId, participantRoles: ['product_analyst', 'risk_owner', 'executive'] });
    reviewId = String(r['review_id']);
    expect(r).toMatchObject({ state: 'draft', period_key: Q3, period_kind: 'calendar_quarter', scope_key: SCOPE, scope_version: 1, assembly: 0, chair_principal_id: chair.principalId,
      participant_roles: ['executive', 'product_analyst', 'risk_owner'] });
    const a = await assemble(analyst, reviewId);
    expect(a).toMatchObject({ assembly: 1, cited: 3, not_computed: [K.none] });
    const cites = arr(a['citations']);
    expect(cites.map((x) => [x['metric_key'], x['status'], x['result_id']])).toEqual([[K.loop, 'cited', rLoop], [K.ack, 'cited', rAck], [K.cal, 'cited', rCal], [K.none, 'not_computed', null]]);
    expect(String(cites[3]!['note'])).toMatch(new RegExp(`^not computed: no result of ${K.none} for 2026-Q3 \\(scope ${SCOPE}\\) has been computed yet`));
    // the latest NON-PREVIEW result of the scope: the newer preview (v2) and the domain-wide result are not cited; the replay is not cited
    expect(cites.map((x) => x['result_id'])).not.toContain(rCalPreview);
    expect(cites.map((x) => x['result_id'])).not.toContain(rLoopDomain);
    expect(cites.map((x) => x['result_id'])).not.toContain(rLoopReplay);
    const uses = await rows(sql`select result_id::text, used_in_kind, used_by::text from analytics.metric_uses where used_in_id = ${reviewId}::uuid order by used_at`);
    expect(uses.map((u) => u['result_id']).sort()).toEqual([rLoop, rAck, rCal].sort());
    expect(uses.every((u) => u['used_in_kind'] === 'operating_review' && u['used_by'] === analyst.principalId)).toBe(true);
    // computes nothing: no result was written by the assembly
    expect(Number((await one(sql`select count(*)::int n from analytics.metric_results where tenant_id = ${T()}::uuid and computed_at > (select assembled_at from analytics.operating_reviews where review_id = ${reviewId}::uuid)`))['n'])).toBe(0);
  });

  it('refusal: a pinned PREVIEW (422), a pinned replay, a mismatched (domain-wide) result, an unknown result (404), a pin for a metric the review does not review (404), an outsider (PDP 403)', async () => {
    await refused(assemble(analyst, reviewId, { [K.cal]: rCalPreview }), /^operating review rejected \(preview\): result .* is a PREVIEW computed on a proposed definition \(v2\)/, 422);
    await refused(assemble(analyst, reviewId, { [K.loop]: rLoopReplay }), /^operating review rejected \(replay\): result .* is a replay of/, 422);
    await refused(assemble(analyst, reviewId, { [K.loop]: rLoopDomain }), /^operating review rejected \(mismatch\): result .* \(scope the domain, cohort \{\}\)/, 422);
    await refused(assemble(analyst, reviewId, { [K.loop]: uuidv7() }), /^operating review rejected \(unknown_result\)/, 404);
    await refused(assemble(analyst, reviewId, { [K.prop]: rLoop }), /^operating review rejected \(unknown_metric\): a pin names a metric the review does not review/, 404);
    await refused(assemble(analyst, reviewId, { [K.loop]: 'not-a-uuid' }), /^operating review rejected \(request\)/, 422);
    await refused(assemble(outsider, reviewId), /./, 403);
    expect(Number((await one(sql`select assembly from analytics.operating_reviews where review_id = ${reviewId}::uuid`))['assembly'])).toBe(1);   // nothing changed
  });

  it('recovery: the missing metric computed, the draft re-assembled (round 2) with an OLDER loop result pinned — every metric cited, the uses not duplicated', async () => {
    const none = await compute(analyst, { metricKey: K.none, period: Q3, scopeKey: SCOPE });
    expect(none).toMatchObject({ state: 'determinate', n: 3 });
    const a = await assemble(analyst, reviewId, { [K.loop]: rLoopOld });
    expect(a).toMatchObject({ assembly: 2, cited: 4, not_computed: [] });
    expect(arr(a['citations']).map((x) => [x['metric_key'], x['result_id'], x['pinned']])).toEqual([[K.loop, rLoopOld, true], [K.ack, rAck, false], [K.cal, rCal, false], [K.none, none['result_id'], false]]);
    // back to the latest (no pin) — the round-2 pin is history; uses are once per (result, review)
    const b = await assemble(analyst, reviewId);
    expect(arr(b['citations'])[0]).toMatchObject({ result_id: rLoop, pinned: false });
    expect(Number((await one(sql`select count(*)::int n from analytics.metric_uses where used_in_id = ${reviewId}::uuid`))['n'])).toBe(5);   // rLoop, rAck, rCal, rLoopOld, none
    expect(Number((await one(sql`select count(*)::int n from analytics.review_citations where review_id = ${reviewId}::uuid`))['n'])).toBe(12);   // three rounds of four
  });
});

describe('OR2 · the series: every period listed, sparse history explicit', () => {
  it('positive: loop closure 2025-Q4 … 2026-Q3 — two periods with NO HISTORY (before 2026-04-10), 2026-Q2 NOT COMPUTED, 2026-Q3 computed; never a blank or a zero', async () => {
    const s = await series(analyst, { metricKey: K.loop, scopeKey: SCOPE, through: Q3, count: 4 });
    const ps = arr(s['periods']);
    expect(ps.map((p) => [p['period'], p['status'], p['state']])).toEqual([
      ['2025-Q4', 'no_history', 'indeterminate'], ['2026-Q1', 'no_history', 'indeterminate'], ['2026-Q2', 'not_computed', null], ['2026-Q3', 'computed', 'determinate']]);
    expect(String(arr(ps[0]!['reasons'])[0])).toBe('no history: the deployment holds no records before 2026-04-10 (public.b92or_items.recorded_at)');
    expect(ps.slice(0, 3).every((p) => p['value'] === null)).toBe(true);
    expect(String(arr(ps[2]!['reasons'])[0])).toMatch(new RegExp(`^not computed: no result of ${K.loop} for 2026-Q2 has been computed yet`));
    expect(ps[3]).toMatchObject({ result_id: rLoop, n: 5, drilldown: { route: `results/${rLoop}/read` } });
    expect(s['history']).toMatchObject({ established: true, source: 'public.b92or_items.recorded_at' });
    expect(s).toMatchObject({ comparable: true, definition_versions: [1] });
  });
  it('an indeterminate period is shown WITH its reasons (n 2 below the floor 5), never as 0; the default runs through the last complete quarter by the database\'s clock', async () => {
    const now = new Date(String((await one(sql`select clock_timestamp()::text as n`))['n']));
    const s = await series(analyst, { metricKey: K.ack, scopeKey: SCOPE });
    expect(s['through']).toBe(previousQuarter(now));
    const q2 = arr(s['periods']).find((p) => p['period'] === Q2);
    if (previousQuarter(now) === Q3) {
      expect(q2).toMatchObject({ status: 'computed', state: 'indeterminate', value: null, n: 2, result_id: rAckQ2 });
      expect(JSON.stringify(q2!['reasons'])).toMatch(/n = 2 is below the floor 5/);
    }
    const p = arr((await series(analyst, { metricKey: K.ack, scopeKey: SCOPE, through: Q3 }))['periods']);
    expect(p.map((x) => x['status'])).toEqual(['no_history', 'no_history', 'computed', 'computed']);
  });
  it('a preview never fills a period: 2026-Q2 of calibration is NOT COMPUTED and says a preview exists; an unsupported metric\'s history is NOT established (its periods are not computed, said — never "no history")', async () => {
    await compute(analyst, { metricKey: K.cal, period: Q2, scopeKey: SCOPE, preview: true });
    const q2 = arr((await series(analyst, { metricKey: K.cal, scopeKey: SCOPE, through: Q3 }))['periods']).find((x) => x['period'] === Q2);
    expect(q2).toMatchObject({ status: 'not_computed', value: null, previews: 1 });
    expect(String(arr(q2!['reasons'])[0])).toMatch(/\(1 preview\(s\) on a proposed definition, never shown as the value\)/);
    const u = await series(analyst, { metricKey: K.unsup, through: Q3, count: 2 });
    expect(u['history']).toMatchObject({ established: false });
    expect(arr(u['periods']).map((x) => x['status'])).toEqual(['not_computed', 'not_computed']);
    expect(String(arr(arr(u['periods'])[0]!['reasons'])[0])).toMatch(/the history origin could not be established \(unsupported: no source in the product/);
    await compute(owner, { metricKey: K.unsup, period: Q3 });
    expect(arr((await series(analyst, { metricKey: K.unsup, through: Q3, count: 1 }))['periods'])[0]).toMatchObject({ status: 'computed', state: 'unsupported', value: null });
  });
  it('comparability: once calibration v2 is approved and 2026-Q2 computed on it, the series says the periods rest on different versions — NOT comparable', async () => {
    await sql`update analytics.metric_definitions set state = 'superseded', superseded_at = clock_timestamp() where tenant_id = ${T()}::uuid and metric_key = ${K.cal} and version = 1`.execute(h.su);
    await sql`update analytics.metric_definitions set state = 'approved', decided_by = ${owner.principalId}::uuid, decided_at = clock_timestamp(), effective_from = clock_timestamp()
               where tenant_id = ${T()}::uuid and metric_key = ${K.cal} and version = 2`.execute(h.su);
    const q2 = await compute(analyst, { metricKey: K.cal, period: Q2, scopeKey: SCOPE });
    expect(q2).toMatchObject({ definition_version: 2, state: 'indeterminate' });   // n 0 for 2026-Q2: no scored outcome — not a measured zero
    const s = await series(analyst, { metricKey: K.cal, scopeKey: SCOPE, through: Q3 });
    expect(s).toMatchObject({ comparable: false, definition_versions: [1, 2] });
    expect(String(s['comparability_note'])).toMatch(/different definition versions: they are not comparable/);
  });
  it('refusal: an unknown metric (404), a rolling period and 13 periods (422 at the route), a through that is not a period', async () => {
    await refused(series(analyst, { metricKey: `FXZ-${RUN}`, through: Q3 }), /^operating review rejected \(unknown_metric\)/, 404);
    await refused(series(analyst, { metricKey: K.loop, through: 'R90@2026-10-12' }), /^operating review rejected \(period\)/, 422);
    await refused(series(analyst, { metricKey: K.loop, through: Q3, count: 13 }), /^operating review rejected \(request\): payload\.count is 1–12/, 422);
    await refused(series(outsider, { metricKey: K.loop, through: Q3 }), /./, 403);
  });
});

describe('OR3 · hold, notes, the follow-through and the chair\'s signed close; a closed review immutable', () => {
  it('a draft: the follow-through waits for the hold (409); a non-chair cannot hold (403); the chair holds; the citations freeze (409)', async () => {
    await refused(decide(chair, reviewId, { metricKey: K.loop, kind: 'no_action', reason: 'on target; no action this quarter' }), /^operating review rejected \(state\): .* is a draft; the follow-through is decided once it is held/, 409);
    await refused(hold(strategist, reviewId), /^operating review rejected \(authority\): only the chair of review/, 403);
    const r = await hold(chair, reviewId);
    expect(r).toMatchObject({ state: 'held', held_by: chair.principalId, assembly: 3 });
    await refused(assemble(analyst, reviewId), /^operating review rejected \(state\): review .* is held; its citations are frozen/, 409);
    await refused(hold(chair, reviewId), /^operating review rejected \(state\): .* is already held/, 409);
  });
  it('notes: the chair and a participant role (risk owner) write; a chair-capable strategy owner who is no participant cannot (403 at the port); an outsider (PDP 403); a note for a metric outside the review (404)', async () => {
    expect(await note(chair, reviewId, { body: 'Loop closure held above target in the corridor; calibration cannot be read this quarter (SYNTHETIC).' })).toMatchObject({ author_principal_id: chair.principalId, metric_key: null });
    expect(await note(riskOwner, reviewId, { metricKey: K.cal, body: 'Six scored outcomes is below the floor of eight: no calibration claim (SYNTHETIC).' })).toMatchObject({ metric_key: K.cal });
    await refused(note(strategist, reviewId, { body: 'a note by someone outside the review' }), /^operating review rejected \(authority\): notes on review .* are the chair's and the participants'/, 403);
    await refused(note(outsider, reviewId, { body: 'a note by an outsider' }), /./, 403);
    await refused(note(chair, reviewId, { metricKey: K.prop, body: 'a note on a metric outside the review' }), /^operating review rejected \(unknown_metric\)/, 404);
  });
  it('the follow-through: the chair alone (403 otherwise); an action with a named owner and due date is ROUTED to that owner as an analytics.metric item; "no action" with its reason; malformed asks refused', async () => {
    const due = await dueIn(60);
    await refused(decide(strategist, reviewId, { metricKey: K.loop, kind: 'no_action', reason: 'not the chair deciding' }), /^operating review rejected \(authority\): only the chair/, 403);
    await refused(decide(chair, reviewId, { metricKey: K.ack, kind: 'action', action: 'too', owner: actionOwner.principalId, dueOn: due, reason: 'latency p50 within target' }), /^operating review rejected \(action\)/, 422);
    await refused(decide(chair, reviewId, { metricKey: K.ack, kind: 'action', action: 'Review the acknowledgement roster', owner: actionOwner.principalId, dueOn: '2020-01-01', reason: 'latency p50 within target' }), /^operating review rejected \(due\)/, 422);
    await refused(decide(chair, reviewId, { metricKey: K.ack, kind: 'no_action', owner: actionOwner.principalId, reason: 'within target this quarter' }), /^operating review rejected \(kind\)/, 422);
    await refused(decide(chair, reviewId, { metricKey: K.prop, kind: 'no_action', reason: 'a metric outside the review' }), /^operating review rejected \(unknown_metric\)/, 404);
    expect(await decide(chair, reviewId, { metricKey: K.loop, kind: 'no_action', reason: 'on target (0.8 ≥ 0.6); no action this quarter' })).toMatchObject({ kind: 'no_action', action: null, owner_principal_id: null, item_id: null });
    const f = await decide(chair, reviewId, { metricKey: K.cal, kind: 'action', action: 'Research request: extend the scored outcome ledger for the corridor forecasts', owner: actionOwner.principalId, dueOn: due,
      reason: 'calibration is indeterminate (n 6 below the floor 8) — the evidence is thin, not the forecast bad' });
    expect(f).toMatchObject({ kind: 'action', owner_principal_id: actionOwner.principalId, due_on: due });
    expect(f['item']).toMatchObject({ existing: false, owner: actionOwner.principalId });
    const itemRow = await one(sql`select signal_class, subject_kind, subject_id::text, owner_principal_id::text, cause_event_type, state from executive.attention_items where item_id = ${String(f['item_id'])}::uuid`);
    expect(itemRow).toMatchObject({ signal_class: 'analytics.metric', subject_kind: 'operating_review', subject_id: String(f['followup_id']), owner_principal_id: actionOwner.principalId, cause_event_type: 'analytics.review.followthrough_decided' });
  });
  it('the close: refused while a metric has no follow-through (422); a digest read BEFORE a later note is STALE (409); re-read, the chair signs; the signature verifies; the review is then immutable', async () => {
    digestRead = String((await read(chair, reviewId))['digest_now']);
    await refused(close(chair, reviewId, { digest: digestRead, statement: 'Reviewed and closed by the chair.' }), new RegExp(`^operating review rejected \\(followthrough\\): ${K.ack}, ${K.none} have no follow-through decision yet`), 422);
    await decide(chair, reviewId, { metricKey: K.ack, kind: 'no_action', reason: 'p50 2100 s is within the 7200 s target' });
    await decide(chair, reviewId, { kind: 'no_action', metricKey: K.none, reason: 'a fixture metric; nothing to act on' });
    await refused(close(chair, reviewId, { digest: digestRead, statement: 'Reviewed and closed by the chair.' }), /^operating review rejected \(stale\): the review now digests to/, 409);
    await refused(close(strategist, reviewId, { digest: digestRead, statement: 'not the chair closing' }), /^operating review rejected \(authority\): only the chair/, 403);
    const fresh = String((await read(chair, reviewId))['digest_now']);
    expect(fresh).not.toBe(digestRead);
    const closed = await close(chair, reviewId, { digest: fresh, statement: 'Reviewed with the participants; follow-through recorded; closed by the chair (SYNTHETIC).' });
    expect(closed).toMatchObject({ state: 'closed', close_digest: fresh, closed_by: chair.principalId });
    const body = closed['signed_body'] as Row;
    expect(arr(body['citations']).map((x) => x['source_revision'])).toEqual(arr(body['citations']).map((x) => (x['status'] === 'cited' ? expect.stringMatching(/^[0-9a-f]{64}$/) : null)));
    expect(arr(body['notes'])).toHaveLength(2); expect(arr(body['followthrough'])).toHaveLength(4);
    const rd = await read(analyst, reviewId);
    expect(rd['signature']).toMatchObject({ digest: fresh, verified: true, closed_by: chair.principalId });
    expect(rd['digest_now']).toBe(fresh);
  });
  it('closed is immutable: every edit through the ports is 409; the table guard refuses an UPDATE and the child guard an INSERT even by the superuser', async () => {
    await refused(note(chair, reviewId, { body: 'a note after the close' }), /^operating review rejected \(state\): review .* was closed by its chair at .* and is immutable — a note is refused/, 409);
    await refused(decide(chair, reviewId, { kind: 'no_action', reason: 'a decision after the close' }), /^operating review rejected \(state\): .* is immutable/, 409);
    await refused(assemble(analyst, reviewId), /^operating review rejected \(state\): .* is immutable/, 409);
    await refused(hold(chair, reviewId), /^operating review rejected \(state\): .* is immutable/, 409);
    await refused(close(chair, reviewId, { digest: 'a'.repeat(64), statement: 'closing a closed review' }), /^operating review rejected \(state\): .* is immutable/, 409);
    await expect(sql`update analytics.operating_reviews set close_statement = 'rewritten after the fact' where review_id = ${reviewId}::uuid`.execute(h.su)).rejects.toThrow(/closed and immutable/);
    await expect(sql`delete from analytics.operating_reviews where review_id = ${reviewId}::uuid`.execute(h.su)).rejects.toThrow(/never deleted/);
    await expect(sql`insert into analytics.review_notes (note_id, scope, tenant_id, domain_id, review_id, body, author_principal_id, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${reviewId}::uuid, 'smuggled note', ${chair.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su)).rejects.toThrow(/review .* is closed; review_notes cannot be added/);
    await expect(sql`update analytics.review_followups set reason = 'changed afterwards' where review_id = ${reviewId}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
  });
});

describe('OR4 · refusals and recovery', () => {
  let draft = '';
  it('open: an unknown metric (404), a proposed-only metric (409), an unknown scope (404), a chair without a chair role, a participant that is not a role, a rolling period (422); an outsider (PDP 403)', async () => {
    const base = { title: `Refusal review (SYNTHETIC ${RUN})`, period: Q3, scopeKey: SCOPE, metricKeys: [K.loop], chair: chair.principalId, participantRoles: ['product_analyst'] };
    await refused(open(analyst, { ...base, metricKeys: [K.loop, `FXZ-${RUN}`] }), new RegExp(`^operating review rejected \\(unknown_metric\\): FXZ-${RUN} has no definition in this domain`), 404);
    await refused(open(analyst, { ...base, metricKeys: [K.prop] }), /^operating review rejected \(state\): .* has no APPROVED definition in this domain \(v1 proposed\)/, 409);
    await refused(open(analyst, { ...base, scopeKey: `nowhere-${RUN}` }), /^operating review rejected \(unknown_scope\)/, 404);
    await refused(open(analyst, { ...base, chair: analyst.principalId }), /^operating review rejected \(chair\)/, 422);
    await refused(open(analyst, { ...base, participantRoles: ['product_analyst', 'alice_smith'] }), /^operating review rejected \(participants\): \{alice_smith\} are not roles — participants are named by role, never by person/, 422);
    await refused(open(analyst, { ...base, period: 'R90@2026-10-12' }), /^operating review rejected \(period\)/, 422);
    await refused(open(outsider, base), /./, 403);
    draft = String((await open(analyst, base))['review_id']);   // recovery: the corrected open
    await assemble(analyst, draft);
  });
  it('the chair\'s acts: an agent (the PEP\'s human gate, 403), an agent in the database whose session claims a human holding executive (the PORT, 403), a non-chair executive; a hold before assembly (409)', async () => {
    await refused(hold({ ...chair, kind: 'agent', assurance: 'agent_grant' } as AuthenticatedPrincipal, draft), /human gate: analytics\.review\.hold requires a named human principal/, 403);
    await refused(hold(machineExec, draft), /^operating review rejected \(actor\): only a named human may hold the review; an agent or a system never does/, 403);
    await refused(close({ ...chair, kind: 'agent', assurance: 'agent_grant' } as AuthenticatedPrincipal, draft, { digest: 'a'.repeat(64), statement: 'an agent closing' }), /human gate: analytics\.review\.close requires a named human principal/, 403);
    const unassembled = String((await open(analyst, { title: `Unassembled (SYNTHETIC ${RUN})`, period: '2026-09', metricKeys: [K.loop], chair: chair.principalId, participantRoles: ['executive'] }))['review_id']);
    await refused(hold(chair, unassembled), /^operating review rejected \(state\): .* has not been assembled/, 409);
    await refused(close(chair, draft, { digest: 'a'.repeat(64), statement: 'closing a draft' }), /^operating review rejected \(state\): .* is a draft; it is held, discussed and decided/, 409);
  });
  it('a closed review edited: 409; an unknown review (404); the route refuses a malformed digest before any port', async () => {
    await refused(note(chair, reviewId, { body: 'editing the closed review' }), /^operating review rejected \(state\)/, 409);
    await refused(read(analyst, uuidv7()), /^operating review rejected \(unknown_review\)/, 404);
    await refused(assemble(analyst, uuidv7()), /^operating review rejected \(unknown_review\)/, 404);
    await refused(close(chair, draft, { digest: 'not-a-digest', statement: 'closing with a malformed digest' }), /^operating review rejected \(digest\)/, 422);
  });
});

describe('OR5 · the read: definition → result → records; series; follow-through; signature', () => {
  it('per metric: the definition, the cited result (value or the EXPLAINED indeterminate state), the drill-down followed to results/:id/read with its records, the series', async () => {
    const r = await read(riskOwner, reviewId);
    expect(r).toMatchObject({ state: 'closed', chair_name: expect.stringMatching(/b92or-chair/), uses: 5 });
    const ms = arr(r['metrics']);
    expect(ms.map((m) => m['metric_key'])).toEqual([K.loop, K.ack, K.cal, K.none]);
    const loop = ms[0]!; const cal = ms[2]!;
    expect(loop['definition']).toMatchObject({ metric_key: K.loop, version: 1, kind: 'rate', numerator: 'items that are ok', denominator: 'every item in the window and scope', floor_n: 3,
      window_spec: { kind: 'calendar_quarter', clock: 'record' }, owner_principal_id: owner.principalId, owner_name: expect.stringMatching(/b92or-owner/) });
    expect((loop['definition'] as Row)['meaning']).toMatch(/SYNTHETIC/); expect((loop['definition'] as Row)['population']).toMatchObject({ subject: 'fixture item' });
    expect(loop['result']).toMatchObject({ result_id: rLoop, state: 'determinate', n: 5, clock: 'record', scope_key: SCOPE, period_key: Q3, records_by_role: { numerator: 4, denominator: 1 },
      uncertainty: { method: 'wilson' }, drilldown: { result_id: rLoop, route: `results/${rLoop}/read` } });
    expect(cal['result']).toMatchObject({ result_id: rCal, state: 'indeterminate', value: null, n: 6, definition_version: 1 });
    expect(JSON.stringify((cal['result'] as Row)['reasons'])).toMatch(/n = 6 is below the floor 8 the definition declares/);
    expect(cal['definition']).toMatchObject({ version: 1, state: 'superseded' }); expect(cal['definition_current_version']).toBe(2);   // the cited version, and the current one said
    // the drill-down: the prelude's route, under the reader's own authority — definition → result → records
    const dd = await resultRead(riskOwner, String((loop['result'] as Row)['result_id']));
    expect((dd['definition'] as Row)['metric_key']).toBe(K.loop);
    expect(arr(dd['records'])).toHaveLength(5); expect(arr(dd['records']).every((x) => x['record_kind'] === 'b92or_item')).toBe(true);
    expect(arr(dd['uses']).map((u) => u['used_in_kind'])).toContain('operating_review');
    expect(arr((loop['series'] as Row)['periods']).map((p) => p['status'])).toEqual(['no_history', 'no_history', 'not_computed', 'computed']);
  });
  it('the notes, the follow-through with its item\'s state now, the ledger, the signature; the list; another domain\'s reader sees nothing (404)', async () => {
    const r = await read(chair, reviewId);
    expect(arr(r['notes']).map((n) => n['author_name'])).toEqual([expect.stringMatching(/b92or-chair/), expect.stringMatching(/b92or-risk/)]);
    const fs = arr(r['followthrough']);
    expect(fs.map((f) => [f['metric_key'], f['kind']])).toEqual([[K.loop, 'no_action'], [K.cal, 'action'], [K.ack, 'no_action'], [K.none, 'no_action']]);
    expect(fs[1]).toMatchObject({ owner_name: expect.stringMatching(/b92or-forecast/), item: { state: expect.any(String) } });
    expect(arr(r['events']).map((e) => e['event'])).toEqual(['review.opened', 'review.assembled', 'review.assembled', 'review.assembled', 'review.held', 'review.noted', 'review.noted',
      'review.followthrough_decided', 'review.followthrough_decided', 'review.followthrough_decided', 'review.followthrough_decided', 'review.closed']);
    expect(r['signature']).toMatchObject({ verified: true, kind: expect.stringMatching(/digest-bound close by the named chair/) });
    const ls = await list(analyst, { period: Q3 });
    expect(ls.find((x) => x['review_id'] === reviewId)).toMatchObject({ state: 'closed', not_computed: 0, followthrough: 4 });
    expect(ls.some((x) => x['state'] === 'draft')).toBe(true);
    await refused(read(foreign, reviewId, otherDomain), /^operating review rejected \(unknown_review\)/, 404);
  });
});
